-- Approved calendar-day/anniversary policy. No historical balance reset,
-- inferred carry-forward/accrual, or guessed manual period is permitted.
BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
ALTER TABLE public.employee_leave_requests ADD COLUMN f12_ledger_version integer,ADD COLUMN f12_policy jsonb;
ALTER TABLE public.employee_leave_requests ALTER COLUMN f12_ledger_version SET DEFAULT 1;
ALTER TABLE public.employee_leave_balances ADD COLUMN period_start date,ADD COLUMN period_end date,ADD COLUMN period_basis text;
GRANT SELECT(f12_ledger_version,f12_policy)ON public.employee_leave_requests TO authenticated;
GRANT SELECT(period_start,period_end,period_basis)ON public.employee_leave_balances TO authenticated;
CREATE TABLE erp_private.f12_leave_movements(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,request_id bigint NOT NULL,employee_id bigint NOT NULL,balance_id bigint NOT NULL,period_start date NOT NULL,period_end date NOT NULL,days numeric NOT NULL,effect text NOT NULL CHECK(effect IN('consume','reverse')),source_operation uuid NOT NULL,actor uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(request_id,balance_id,effect));
CREATE INDEX f12_leave_employee_period ON erp_private.f12_leave_movements(employee_id,period_start,balance_id);
CREATE INDEX f12_leave_balance_ledger ON erp_private.f12_leave_movements(balance_id)INCLUDE(days,request_id,effect);
-- Availability is a reconciled fact, not merely a newly labelled period.
CREATE FUNCTION erp_private.f12_leave_balance_reconciled(p_balance bigint)RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.employee_leave_balances;BEGIN
 SELECT *INTO b FROM public.employee_leave_balances WHERE id=p_balance;
 IF NOT FOUND OR NOT public.current_user_can_view_employee(b.employee_id)OR NOT erp_private.employee_permission(b.employee_id,'hr.leave.view')THEN RETURN false;END IF;
 RETURN b.period_start IS NOT NULL AND b.period_end IS NOT NULL
 AND b.used_days=(SELECT coalesce(sum(m.days),0)FROM erp_private.f12_leave_movements m WHERE m.balance_id=b.id)
 AND NOT EXISTS(SELECT 1 FROM public.employee_leave_requests r WHERE r.employee_id=b.employee_id AND r.leave_type_id=b.leave_type_id AND r.deleted_at IS NULL AND r.approval_status='approved'AND r.start_date<=b.period_end AND r.end_date>=b.period_start AND(r.f12_ledger_version IS DISTINCT FROM 1 OR r.f12_policy IS NULL OR(SELECT coalesce(sum(m.days),0)FROM erp_private.f12_leave_movements m WHERE m.balance_id=b.id AND m.request_id=r.id AND m.effect='consume')<>least(r.end_date,b.period_end)-greatest(r.start_date,b.period_start)+1));
END$$;
REVOKE ALL ON FUNCTION erp_private.f12_leave_balance_reconciled(bigint)FROM PUBLIC,anon,service_role;GRANT EXECUTE ON FUNCTION erp_private.f12_leave_balance_reconciled(bigint)TO authenticated;
CREATE TABLE erp_private.f12_leave_proofs(actor uuid NOT NULL,transaction_id xid8 NOT NULL,backend integer NOT NULL,balance_id bigint NOT NULL,revision bigint NOT NULL,expected_used numeric NOT NULL,request_id bigint NOT NULL,PRIMARY KEY(actor,transaction_id,backend,balance_id));
ALTER TABLE erp_private.f12_leave_movements ENABLE ROW LEVEL SECURITY;ALTER TABLE erp_private.f12_leave_proofs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.f12_leave_movements,erp_private.f12_leave_proofs FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION erp_private.f12_leave_period(p_day date,p_joined date,p_basis text)RETURNS daterange LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$DECLARE y integer:=extract(year FROM p_day);m integer:=extract(month FROM p_joined);d integer:=extract(day FROM p_joined);start_day date;end_day date;BEGIN
 IF p_day IS NULL OR p_basis IS NULL THEN RETURN NULL;END IF;
 IF p_basis='calendar_year'THEN RETURN daterange(make_date(y,1,1),make_date(y+1,1,1),'[)');END IF;
 IF p_basis<>'joining_anniversary'OR p_joined IS NULL OR p_day<p_joined THEN RETURN NULL;END IF;
 start_day:=make_date(y,m,least(d,extract(day FROM(make_date(y,m,1)+interval'1 month'-interval'1 day'))::integer));IF start_day>p_day THEN y:=y-1;start_day:=make_date(y,m,least(d,extract(day FROM(make_date(y,m,1)+interval'1 month'-interval'1 day'))::integer));END IF;
 end_day:=make_date(y+1,m,least(d,extract(day FROM(make_date(y+1,m,1)+interval'1 month'-interval'1 day'))::integer));RETURN daterange(start_day,end_day,'[)');
END$$;
REVOKE ALL ON FUNCTION erp_private.f12_leave_period(date,date,text)FROM PUBLIC,anon,service_role;GRANT EXECUTE ON FUNCTION erp_private.f12_leave_period(date,date,text)TO authenticated;
CREATE FUNCTION erp_private.f12_leave_sources()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE basis text;joined date;period daterange;proof erp_private.f12_leave_proofs;BEGIN
 IF auth.uid()IS NULL THEN RETURN NEW;END IF;
 IF TG_TABLE_NAME='employee_leave_requests'THEN
  IF TG_OP='INSERT'THEN
   SELECT t.reset_basis,e.joining_date INTO basis,joined FROM public.hr_leave_types t CROSS JOIN public.employees e WHERE t.id=NEW.leave_type_id AND e.id=NEW.employee_id;
   NEW.f12_ledger_version:=1;NEW.f12_policy:=jsonb_build_object('reset_basis',basis,'joining_date',joined,'units','inclusive_calendar_days','leap_anniversary','feb28');
  ELSE
   IF ROW(NEW.f12_ledger_version,NEW.f12_policy)IS DISTINCT FROM ROW(OLD.f12_ledger_version,OLD.f12_policy)THEN RAISE EXCEPTION 'Original leave policy snapshot is immutable' USING ERRCODE='42501';END IF;
   IF OLD.approval_status='approved'AND NEW.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Cancel/reverse approved leave before archiving' USING ERRCODE='23514';END IF;
   IF NEW.approval_status='approved'AND OLD.approval_status IS DISTINCT FROM'approved'OR OLD.approval_status='approved'AND NEW.approval_status IS DISTINCT FROM'approved'THEN
    IF OLD.f12_ledger_version IS NULL OR OLD.f12_policy IS NULL THEN RAISE EXCEPTION 'Legacy leave decision needs provenance/period review before charge or reversal' USING ERRCODE='23514';END IF;
   END IF;
  END IF;
  IF NEW.approval_status IN('pending','approved')AND EXISTS(SELECT 1 FROM public.employee_leave_requests r WHERE r.employee_id=NEW.employee_id AND r.id<>NEW.id AND r.deleted_at IS NULL AND r.approval_status IN('pending','approved')AND daterange(r.start_date,r.end_date,'[]')&&daterange(NEW.start_date,NEW.end_date,'[]'))THEN RAISE EXCEPTION 'Overlapping reserved or approved leave exists' USING ERRCODE='23514';END IF;
  IF NEW.approval_status='approved'AND EXISTS(SELECT 1 FROM public.employee_attendance_daily_summary s CROSS JOIN LATERAL jsonb_array_elements(coalesce(s.entered_intervals,'[]'))i WHERE s.employee_id=NEW.employee_id AND s.attendance_date BETWEEN NEW.start_date-1 AND NEW.end_date AND tstzrange((i->>'start')::timestamptz,(i->>'end')::timestamptz,'[)')&&tstzrange(NEW.start_date::timestamp AT TIME ZONE'Asia/Dubai',(NEW.end_date+1)::timestamp AT TIME ZONE'Asia/Dubai','[)'))THEN RAISE EXCEPTION 'Actual attendance intersects requested leave; reconcile source before approval' USING ERRCODE='23514';END IF;
 ELSE
  IF TG_OP='INSERT'THEN
   IF NEW.used_days<>0 THEN RAISE EXCEPTION 'New leave periods start with zero consumed days; historical usage needs reviewed provenance' USING ERRCODE='23514';END IF;
   SELECT t.reset_basis,e.joining_date INTO basis,joined FROM public.hr_leave_types t CROSS JOIN public.employees e WHERE t.id=NEW.leave_type_id AND e.id=NEW.employee_id;
   period:=erp_private.f12_leave_period(make_date(NEW.leave_year,12,31),joined,basis);
   -- leave_year denotes the START year of a newly created explicit period.
   IF basis='joining_anniversary'AND extract(year FROM lower(period))<>NEW.leave_year THEN period:=erp_private.f12_leave_period(make_date(NEW.leave_year+1,1,1),joined,basis);END IF;
   NEW.period_start:=lower(period);NEW.period_end:=upper(period)-1;NEW.period_basis:=basis;
  ELSE
   IF ROW(NEW.period_start,NEW.period_end,NEW.period_basis)IS DISTINCT FROM ROW(OLD.period_start,OLD.period_end,OLD.period_basis)THEN RAISE EXCEPTION 'Recorded leave period needs explicit review, not relabelling' USING ERRCODE='42501';END IF;
   IF NEW.used_days IS DISTINCT FROM OLD.used_days THEN
    SELECT p.*INTO proof FROM erp_private.f12_leave_proofs p WHERE p.actor=auth.uid()AND p.transaction_id=pg_current_xact_id()AND p.backend=pg_backend_pid()AND p.balance_id=OLD.id;
    IF NOT FOUND OR proof.revision<>OLD.workspace_revision OR proof.expected_used<>NEW.used_days THEN RAISE EXCEPTION 'Used leave requires its linked immutable movement, not a manual overwrite/recalculation' USING ERRCODE='23514';END IF;
   END IF;
  END IF;
 END IF;RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION erp_private.f12_leave_sources()FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f12_leave_sources BEFORE INSERT OR UPDATE ON public.employee_leave_requests FOR EACH ROW EXECUTE FUNCTION erp_private.f12_leave_sources();
CREATE TRIGGER f12_leave_sources BEFORE INSERT OR UPDATE ON public.employee_leave_balances FOR EACH ROW EXECUTE FUNCTION erp_private.f12_leave_sources();

CREATE FUNCTION erp_private.f12_capture_leave_balance(p_new jsonb,p_old jsonb)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE proof erp_private.f12_leave_proofs;BEGIN
 SELECT p.*INTO proof FROM erp_private.f12_leave_proofs p WHERE p.actor=auth.uid()AND p.transaction_id=pg_current_xact_id()AND p.backend=pg_backend_pid()AND p.balance_id=(p_old->>'id')::bigint;
 IF NOT FOUND OR NOT erp_private.f11_child_authorized('leave-request',(p_new->>'employee_id')::bigint)OR(p_new->>'used_days')::numeric IS DISTINCT FROM proof.expected_used OR(p_old->>'workspace_revision')::bigint<>proof.revision OR(p_new->>'workspace_revision')::bigint<>proof.revision+1 OR(p_new-ARRAY['used_days','balance_days','workspace_revision','updated_at','updated_by'])IS DISTINCT FROM(p_old-ARRAY['used_days','balance_days','workspace_revision','updated_at','updated_by'])THEN RAISE EXCEPTION 'Leave movement proof unavailable' USING ERRCODE='42501';END IF;
 DELETE FROM erp_private.f12_leave_proofs p WHERE p.actor=auth.uid()AND p.transaction_id=pg_current_xact_id()AND p.backend=pg_backend_pid()AND p.balance_id=proof.balance_id;
END$$;
REVOKE ALL ON FUNCTION erp_private.f12_capture_leave_balance(jsonb,jsonb)FROM PUBLIC,anon,authenticated,service_role;
DO $$DECLARE definition text;needle text:='PERFORM erp_private.f11_verify_time_admission';BEGIN
 definition:=pg_get_functiondef('erp_private.f11_capture_time_child()'::regprocedure);IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'Unrecognized F11 time capture';END IF;
 EXECUTE replace(definition,needle,'IF TG_TABLE_NAME=''employee_leave_balances''AND EXISTS(SELECT 1 FROM erp_private.f12_leave_proofs p WHERE p.actor=auth.uid()AND p.transaction_id=pg_current_xact_id()AND p.backend=pg_backend_pid()AND p.balance_id=NEW.id)THEN PERFORM erp_private.f12_capture_leave_balance(to_jsonb(NEW),to_jsonb(OLD));RETURN NEW;END IF; '||needle);
 definition:=pg_get_functiondef('erp_private.f11_admit_time_operation(jsonb,jsonb)'::regprocedure);needle:='IF kind=''leave-request''AND action=''approve''THEN';IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'Unrecognized old leave admission';END IF;
 EXECUTE replace(definition,needle,'IF kind=''leave-request''AND action=''approve''AND original->>''f12_ledger_version''IS NULL THEN');
 definition:=pg_get_functiondef('public.f11_mutate_time_child(text,bigint,bigint,bigint,uuid,text,jsonb)'::regprocedure);needle:='IF p_kind=''leave-request''AND p_action=''approve''THEN';IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'Unrecognized old leave charge';END IF;
 EXECUTE replace(definition,needle,'IF p_kind=''leave-request''AND p_action=''approve''AND existing->>''f12_ledger_version''IS NULL THEN');
END$$;
CREATE FUNCTION erp_private.f12_apply_leave_movements()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE context jsonb:=nullif(current_setting('erp.f11_child_save',true),'')::jsonb;balance public.employee_leave_balances;basis text;joined date;period daterange;day date;allocation record;movement erp_private.f12_leave_movements;amount numeric;operation uuid:=(context->>'operation_id')::uuid;BEGIN
 IF auth.uid()IS NULL OR NEW.approval_status IS NOT DISTINCT FROM OLD.approval_status OR NEW.approval_status NOT IN('approved','cancelled')THEN RETURN NEW;END IF;
 IF NEW.approval_status='cancelled'AND OLD.approval_status<>'approved'THEN RETURN NEW;END IF;
 IF NEW.f12_ledger_version IS DISTINCT FROM 1 OR NOT erp_private.f11_child_authorized('leave-request',NEW.employee_id)OR NOT EXISTS(SELECT 1 FROM erp_private.f11_child_receipts WHERE actor=auth.uid()AND operation_id=operation AND kind='leave-request'AND record_id=NEW.id AND revision=NEW.workspace_revision)THEN RAISE EXCEPTION 'Original atomic leave decision receipt required' USING ERRCODE='42501';END IF;
 IF NEW.approval_status='approved'THEN
  SELECT t.reset_basis,e.joining_date INTO basis,joined FROM public.hr_leave_types t CROSS JOIN public.employees e WHERE t.id=NEW.leave_type_id AND e.id=NEW.employee_id;
  IF NEW.f12_policy->>'reset_basis'IS DISTINCT FROM basis OR(NEW.f12_policy->>'joining_date')::date IS DISTINCT FROM joined THEN RAISE EXCEPTION 'Leave source policy changed; cancel/review the original request' USING ERRCODE='PT409';END IF;
  IF basis='manual'OR basis IS NULL OR NEW.start_date<joined OR NEW.total_days IS DISTINCT FROM(NEW.end_date-NEW.start_date+1)::numeric THEN RAISE EXCEPTION 'Manual/partial/unknown leave policy requires review' USING ERRCODE='23514';END IF;
  FOR allocation IN SELECT lower(p)start_day,upper(p)-1 end_day,count(*)days FROM(SELECT erp_private.f12_leave_period(d::date,joined,basis)p FROM generate_series(NEW.start_date,NEW.end_date,interval'1 day')d)x GROUP BY p ORDER BY lower(p)LOOP
   SELECT *INTO balance FROM public.employee_leave_balances WHERE employee_id=NEW.employee_id AND leave_type_id=NEW.leave_type_id AND period_start=allocation.start_day AND period_end=allocation.end_day AND period_basis=basis FOR UPDATE;
   IF NOT FOUND OR balance.carry_forward<>0 OR balance.entitled_days-balance.used_days<allocation.days THEN RAISE EXCEPTION 'Exact reviewed leave period/balance unavailable; negative or carry policy held' USING ERRCODE='23514';END IF;
   -- NEW is already approved inside this AFTER trigger but has no movement yet.
   -- Reconcile every earlier approval and the existing usage before charging it.
   IF balance.used_days IS DISTINCT FROM(SELECT coalesce(sum(m.days),0)FROM erp_private.f12_leave_movements m WHERE m.balance_id=balance.id)
    OR EXISTS(SELECT 1 FROM public.employee_leave_requests r WHERE r.id<>NEW.id AND r.employee_id=NEW.employee_id AND r.leave_type_id=NEW.leave_type_id AND r.deleted_at IS NULL AND r.approval_status='approved'AND r.start_date<=balance.period_end AND r.end_date>=balance.period_start AND(r.f12_ledger_version IS DISTINCT FROM 1 OR r.f12_policy IS NULL OR(SELECT coalesce(sum(m.days),0)FROM erp_private.f12_leave_movements m WHERE m.balance_id=balance.id AND m.request_id=r.id AND m.effect='consume')<>least(r.end_date,balance.period_end)-greatest(r.start_date,balance.period_start)+1))
   THEN RAISE EXCEPTION 'Historical usage or approval allocation needs provenance review' USING ERRCODE='23514';END IF;
   INSERT INTO erp_private.f12_leave_proofs VALUES(auth.uid(),pg_current_xact_id(),pg_backend_pid(),balance.id,balance.workspace_revision,balance.used_days+allocation.days,NEW.id);
   UPDATE public.employee_leave_balances SET used_days=used_days+allocation.days,updated_by=public.current_user_profile_id()WHERE id=balance.id;
   INSERT INTO erp_private.f12_leave_movements(request_id,employee_id,balance_id,period_start,period_end,days,effect,source_operation,actor)VALUES(NEW.id,NEW.employee_id,balance.id,allocation.start_day,allocation.end_day,allocation.days,'consume',operation,auth.uid());
  END LOOP;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM erp_private.f12_leave_movements WHERE request_id=NEW.id AND effect='consume')THEN RAISE EXCEPTION 'Original allocation unavailable; reversal held for review' USING ERRCODE='23514';END IF;
  FOR movement IN SELECT *FROM erp_private.f12_leave_movements WHERE request_id=NEW.id AND effect='consume'ORDER BY balance_id LOOP
   SELECT *INTO balance FROM public.employee_leave_balances WHERE id=movement.balance_id AND employee_id=NEW.employee_id FOR UPDATE;
   IF NOT FOUND OR balance.used_days<movement.days THEN RAISE EXCEPTION 'Original balance no longer reconciles' USING ERRCODE='23514';END IF;
   INSERT INTO erp_private.f12_leave_proofs VALUES(auth.uid(),pg_current_xact_id(),pg_backend_pid(),balance.id,balance.workspace_revision,balance.used_days-movement.days,NEW.id);
   UPDATE public.employee_leave_balances SET used_days=used_days-movement.days,updated_by=public.current_user_profile_id()WHERE id=balance.id;
   INSERT INTO erp_private.f12_leave_movements(request_id,employee_id,balance_id,period_start,period_end,days,effect,source_operation,actor)VALUES(NEW.id,NEW.employee_id,balance.id,movement.period_start,movement.period_end,-movement.days,'reverse',operation,auth.uid());
  END LOOP;
 END IF;RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION erp_private.f12_apply_leave_movements()FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f12_leave_movements AFTER UPDATE ON public.employee_leave_requests FOR EACH ROW EXECUTE FUNCTION erp_private.f12_apply_leave_movements();
CREATE FUNCTION public.f12_leave_period_balances(p_employee bigint,p_after bigint DEFAULT 0)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$BEGIN
 IF p_after<0 OR NOT public.current_user_can_view_employee(p_employee)OR NOT erp_private.employee_permission(p_employee,'hr.leave.view')THEN RAISE EXCEPTION 'Current leave subject access required' USING ERRCODE='42501';END IF;
 RETURN(SELECT coalesce(jsonb_agg(to_jsonb(x)ORDER BY x.id),'[]')FROM(
 SELECT b.id,b.leave_type_id,b.leave_year,b.period_start,b.period_end,b.period_basis,b.entitled_days,b.used_days,
 CASE WHEN b.period_start IS NOT NULL THEN(SELECT coalesce(sum(greatest(0,least(r.end_date,b.period_end)-greatest(r.start_date,b.period_start)+1)),0)FROM public.employee_leave_requests r WHERE r.employee_id=b.employee_id AND r.leave_type_id=b.leave_type_id AND r.deleted_at IS NULL AND r.approval_status='pending'AND r.start_date<=b.period_end AND r.end_date>=b.period_start)END reserved_days,
 (erp_private.f12_leave_balance_reconciled(b.id)AND b.period_start IS NOT NULL AND b.carry_forward=0 AND b.entitled_days>=b.used_days AND EXISTS(SELECT 1 FROM public.hr_leave_types t JOIN public.employees e ON e.id=b.employee_id WHERE t.id=b.leave_type_id AND t.reset_basis=b.period_basis AND erp_private.f12_leave_period(b.period_start,e.joining_date,t.reset_basis)=daterange(b.period_start,b.period_end,'[]'))AND NOT EXISTS(SELECT 1 FROM public.employee_leave_requests r JOIN public.hr_leave_types t ON t.id=r.leave_type_id JOIN public.employees e ON e.id=r.employee_id WHERE r.employee_id=b.employee_id AND r.leave_type_id=b.leave_type_id AND r.deleted_at IS NULL AND r.approval_status='pending'AND(r.f12_policy IS NULL OR r.f12_policy->>'reset_basis'IS DISTINCT FROM t.reset_basis OR(r.f12_policy->>'joining_date')::date IS DISTINCT FROM e.joining_date)AND r.start_date<=b.period_end AND r.end_date>=b.period_start))known
 FROM public.employee_leave_balances b WHERE b.employee_id=p_employee AND b.id>p_after ORDER BY b.id LIMIT 26)x);
END
$$;
REVOKE ALL ON FUNCTION public.f12_leave_period_balances(bigint,bigint)FROM PUBLIC,anon,service_role;GRANT EXECUTE ON FUNCTION public.f12_leave_period_balances(bigint,bigint)TO authenticated;
NOTIFY pgrst,'reload schema';COMMIT;
