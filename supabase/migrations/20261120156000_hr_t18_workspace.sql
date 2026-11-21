BEGIN;

CREATE FUNCTION erp_private.t18_closure_authorized(p_eos bigint)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(
   SELECT 1 FROM erp_private.t18_close_receipts r
   JOIN erp_private.t18_cases c ON c.eos_id=r.eos_id
   JOIN erp_private.t18_approvals a ON a.eos_id=r.eos_id AND a.version_id=r.version_id AND a.state='approved'
   WHERE r.eos_id=p_eos AND r.actor_id=public.current_user_profile_id()
     AND erp_private.t18_can(c.company_id,c.branch_id,'hr')
     AND erp_private.t18_payment_status(r.version_id)->>'state'='reconciled'
     AND (erp_private.t18_clearance_facts(c.eos_id,c.employee_id,c.employment_id,c.company_id,c.branch_id)->>'blocking_count')::integer=0
 );
$$;

CREATE FUNCTION erp_private.t18_guard_eos_updates()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE frozen boolean;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM erp_private.t18_cases c WHERE c.eos_id=OLD.id) THEN
   IF TG_OP='DELETE' THEN RETURN OLD; END IF;
   RETURN NEW;
 END IF;
 IF TG_OP='DELETE' OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
    OR NEW.employee_id IS DISTINCT FROM OLD.employee_id OR NEW.id IS DISTINCT FROM OLD.id THEN
   RAISE EXCEPTION 'An activated exit case is retained. Resolve or cancel it through HR.' USING ERRCODE='23514';
 END IF;
 IF ROW(NEW.case_status,NEW.eos_type,NEW.notice_date,NEW.last_working_date,NEW.employment_end_date,NEW.reason)
    IS NOT DISTINCT FROM ROW(OLD.case_status,OLD.eos_type,OLD.notice_date,OLD.last_working_date,OLD.employment_end_date,OLD.reason)
    AND ROW(NEW.clearance_completed,NEW.final_settlement_status) IS NOT DISTINCT FROM
      ROW(OLD.clearance_completed,OLD.final_settlement_status) THEN
   RETURN NEW;
 END IF;
 IF NEW.case_status='closed' AND OLD.case_status<>'closed' THEN
   IF NOT erp_private.t18_closure_authorized(OLD.id) THEN
     RAISE EXCEPTION 'Close the exit through the reconciled settlement' USING ERRCODE='23514';
   END IF;
   NEW.clearance_completed:=true;
   NEW.final_settlement_status:='completed';
   RETURN NEW;
 END IF;
 IF ROW(NEW.clearance_completed,NEW.final_settlement_status)
    IS DISTINCT FROM ROW(OLD.clearance_completed,OLD.final_settlement_status) THEN
   RAISE EXCEPTION 'Settlement flags require the verified T18 closure' USING ERRCODE='23514';
 END IF;
 SELECT EXISTS(SELECT 1 FROM erp_private.t18_approvals a WHERE a.eos_id=OLD.id AND a.state='approved')
     OR (SELECT erp_private.t18_version_state(v.id) FROM erp_private.t18_versions v
       WHERE v.eos_id=OLD.id ORDER BY v.number DESC LIMIT 1)='submitted' INTO frozen;
 IF frozen OR OLD.case_status='closed' THEN
   RAISE EXCEPTION 'Resolve the current settlement submission or approval before changing the exit case' USING ERRCODE='23514';
 END IF;
 IF OLD.case_status='cancelled' AND NEW.case_status<>'cancelled' THEN
   RAISE EXCEPTION 'A cancelled settlement case cannot be reopened' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;

CREATE TRIGGER t18_guard_eos_updates BEFORE UPDATE OR DELETE ON public.employee_eos_cases
 FOR EACH ROW EXECUTE FUNCTION erp_private.t18_guard_eos_updates();

-- Keep the F12 and F11 boundaries in place. Permit the T18 closure receipt and its two verified flags only.
DO $adopt$
DECLARE target regprocedure; body text; definition text; adopted text;
BEGIN
 target:='erp_private.f12_employee_service_boundary()'::regprocedure;
 SELECT prosrc,pg_get_functiondef(oid) INTO STRICT body,definition FROM pg_proc WHERE oid=target;
 adopted:=replace(body,$old$IF NEW.case_status='closed' AND (TG_OP='INSERT' OR OLD.case_status IS DISTINCT FROM 'closed') THEN$old$,
  $new$IF NEW.case_status='closed' AND (TG_OP='INSERT' OR OLD.case_status IS DISTINCT FROM 'closed') THEN
     IF TG_OP='UPDATE' AND erp_private.t18_closure_authorized(OLD.id) THEN RETURN NEW; END IF;$new$);
 IF adopted=body THEN RAISE EXCEPTION 'T18 could not adopt the expected F12 closure boundary'; END IF;
 EXECUTE replace(definition,body,adopted);

 target:='erp_private.f11_capture_eos_case()'::regprocedure;
 SELECT prosrc,pg_get_functiondef(oid) INTO STRICT body,definition FROM pg_proc WHERE oid=target;
 adopted:=replace(body,$old$IF context IS NULL OR context->>'kind'$old$,
  $new$IF TG_OP='UPDATE' AND OLD.case_status<>'closed' AND NEW.case_status='closed'
    AND NEW.clearance_completed AND NEW.final_settlement_status='completed'
    AND NEW.updated_by=public.current_user_profile_id()
    AND erp_private.t18_closure_authorized(OLD.id) THEN
    changed:=ARRAY['case_status','clearance_completed','final_settlement_status','updated_by','updated_at','workspace_revision'];
    IF (to_jsonb(NEW)-changed) IS DISTINCT FROM (to_jsonb(OLD)-changed) THEN
      RAISE EXCEPTION 'Unrecognised changes in exit closure' USING ERRCODE='23514';
    END IF;
    INSERT INTO public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,action,new_values)
    SELECT r.actor_id,a.company_id,a.branch_id,'HR','employee_eos_cases',a.eos_id,'verified-settlement-close',
       jsonb_build_object('operation_id',r.operation_id,'employee_id',a.employee_id,'revision',NEW.workspace_revision,'version',r.version_id)
    FROM erp_private.t18_cases a JOIN erp_private.t18_close_receipts r ON r.eos_id=a.eos_id WHERE a.eos_id=NEW.id;
    RETURN NEW;
  END IF;
  IF context IS NULL OR context->>'kind'$new$);
 IF adopted=body THEN RAISE EXCEPTION 'T18 could not adopt the expected F11 capture boundary'; END IF;
 EXECUTE replace(definition,body,adopted);
END $adopt$;
ALTER FUNCTION erp_private.f12_employee_service_boundary() SECURITY DEFINER;

CREATE FUNCTION public.t18_exit_scopes() RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('company',c.id,'branch',b.id,'company_name',c.legal_name_en,
   'branch_name',b.branch_name_en) ORDER BY c.legal_name_en,b.branch_name_en,b.id),'[]'::jsonb)
 FROM public.owner_companies c JOIN public.branches b ON b.owner_company_id=c.id
 WHERE c.status='active' AND b.status='active' AND b.operating_status='active'
 AND erp_private.t18_can(c.id,b.id,'view');
$$;

CREATE FUNCTION public.t18_exit_workspace(p_company bigint,p_branch bigint,p_eos bigint DEFAULT NULL,p_after bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE
 actor bigint:=public.current_user_profile_id(); allowed_hr boolean; allowed_accounts boolean;
 allowed_gm boolean; allowed_pay boolean; independent boolean; selected_row record;
 scope erp_private.t18_cases; v erp_private.t18_versions; a erp_private.t18_approvals;
 visible_rows jsonb; chosen jsonb; policies jsonb; movements jsonb; recovery jsonb; clearance jsonb;
 actions text[]:='{}'; activated boolean; exact_state text; unchanged boolean; unlocked boolean; ready boolean;
 needs_dates boolean; next_after bigint;
BEGIN
 IF actor IS NULL OR NOT erp_private.t18_can(p_company,p_branch,'view') THEN
   RAISE EXCEPTION 'Exit settlement is unavailable in this employer or branch' USING ERRCODE='42501';
 END IF;
 allowed_hr:=erp_private.t18_can(p_company,p_branch,'hr');
 allowed_accounts:=erp_private.t18_can(p_company,p_branch,'accounts');
 allowed_gm:=erp_private.t18_can(p_company,p_branch,'approve');
 allowed_pay:=erp_private.t18_can(p_company,p_branch,'pay');

 WITH visible AS MATERIALIZED (
   SELECT e.id,e.employee_id,emp.full_name_en AS name,
       e.last_working_date AS last_day,e.case_status,active_case.eos_id IS NOT NULL AS activated
   FROM public.employee_eos_cases e
   JOIN public.employees emp ON emp.id=e.employee_id AND emp.deleted_at IS NULL
   LEFT JOIN erp_private.t18_cases active_case ON active_case.eos_id=e.id
   LEFT JOIN erp_private.t03_employment_periods h ON active_case.eos_id IS NULL
      AND h.employee_id=e.employee_id AND h.work_period @> e.employment_end_date
   WHERE e.deleted_at IS NULL AND (p_after IS NULL OR e.id<p_after OR e.id=p_eos)
    AND (ROW(active_case.company_id,active_case.branch_id)=ROW(p_company,p_branch)
     OR (active_case.eos_id IS NULL AND e.case_status NOT IN('closed','cancelled') AND e.final_settlement_status<>'completed'
       AND (ROW(h.company_id,h.branch_id)=ROW(p_company,p_branch)
         OR (e.employment_end_date IS NULL AND ROW(emp.owner_company_id,emp.branch_id)=ROW(p_company,p_branch)))))
 ), page AS (
   SELECT * FROM visible WHERE p_after IS NULL OR id<p_after ORDER BY id DESC LIMIT 51
 ), summary AS (
   SELECT jsonb_agg(jsonb_build_object('id',id,'employee',employee_id,'name',name,'last_day',last_day,'state',case_status)
            ORDER BY id DESC) AS rows,min(id) AS least_id FROM (SELECT * FROM page ORDER BY id DESC LIMIT 50) p
 )
 SELECT coalesce(summary.rows,'[]'),CASE WHEN (SELECT count(*) FROM page)>50 THEN summary.least_id END,
   (SELECT to_jsonb(vv) FROM visible vv WHERE vv.id=p_eos) INTO visible_rows,next_after,chosen FROM summary;

 SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'from',lower(p.effective),'until',upper(p.effective),
   'status',p.status,'digest',p.receipt_digest,'reason',p.reason,'facts',p.facts,
   'can_decide',allowed_gm AND p.status='proposed' AND p.proposed_by<>actor) ORDER BY p.id DESC),'[]')
 INTO policies FROM erp_private.t18_calculation_policies p WHERE p.company_id=p_company AND p.branch_id=p_branch;

 IF p_eos IS NOT NULL AND chosen IS NULL THEN RAISE EXCEPTION 'The requested exit case is unavailable in this scope' USING ERRCODE='42501'; END IF;
 IF chosen IS NOT NULL THEN
   SELECT e.employee_id,e.case_status,e.last_working_date,e.employment_end_date INTO STRICT selected_row
   FROM public.employee_eos_cases e WHERE e.id=p_eos;
   SELECT * INTO scope FROM erp_private.t18_cases WHERE eos_id=p_eos;
   activated:=scope.eos_id IS NOT NULL;
   needs_dates:=selected_row.last_working_date IS NULL OR selected_row.employment_end_date IS NULL;
   unchanged:=activated AND ROW(scope.last_day,scope.last_working_day)
      IS NOT DISTINCT FROM ROW(selected_row.employment_end_date,selected_row.last_working_date);
   independent:=NOT erp_private.t12_is_subject(actor,selected_row.employee_id);
   SELECT * INTO v FROM erp_private.t18_versions WHERE eos_id=p_eos ORDER BY number DESC LIMIT 1;
   SELECT * INTO a FROM erp_private.t18_approvals WHERE eos_id=p_eos AND state='approved';
   exact_state:=erp_private.t18_version_state(v.id);
   unlocked:=a.id IS NULL AND exact_state<>'submitted' AND selected_row.case_status NOT IN('closed','cancelled');
   ready:=v.id IS NOT NULL AND unchanged AND NOT EXISTS(
     SELECT 1 FROM jsonb_array_elements(v.facts->'issues') j WHERE j->>'blocking'='true');
   IF activated THEN
     clearance:=erp_private.t18_clearance_facts(p_eos,scope.employee_id,scope.employment_id,p_company,p_branch);
     SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'state',r.state,'fingerprint',r.fingerprint,
       'can_include',r.can_include,'can_recommend',allowed_hr AND independent AND unlocked AND unchanged,
       'can_accept',allowed_accounts AND independent AND unlocked AND unchanged AND NOT r.accepted AND r.recommended_by<>actor,
       'decision',CASE WHEN r.decision IS NOT NULL THEN jsonb_build_object('id',r.decision,'disposition',r.disposition,
         'state',CASE WHEN r.accepted THEN 'accepted' ELSE 'recommended' END,'reason',r.reason) END) ORDER BY r.id),'[]')
     INTO recovery FROM erp_private.t18_recovery_facts(scope) r;
     IF a.id IS NOT NULL THEN movements:=erp_private.t18_payment_status(a.version_id); END IF;
   END IF;

   IF independent THEN
     IF allowed_hr AND NOT unchanged AND NOT needs_dates AND unlocked THEN actions:=actions||'activate'::text; END IF;
     IF unchanged AND unlocked AND allowed_hr THEN actions:=actions||'recommend-case'::text; END IF;
     IF unchanged AND unlocked AND allowed_accounts THEN actions:=actions||ARRAY['calculate','accept-case']; END IF;
     IF ready AND unlocked AND exact_state='draft' AND allowed_hr THEN actions:=actions||'review'::text; END IF;
     IF v.id IS NOT NULL AND allowed_accounts THEN
       IF ready AND exact_state='reviewed' AND NOT EXISTS(
         SELECT 1 FROM erp_private.t18_version_events x WHERE x.version_id=v.id AND x.kind='reviewed' AND x.actor_id=actor
       ) THEN actions:=actions||'submit'::text; END IF;
       IF exact_state IN('reviewed','submitted') THEN actions:=actions||'withdraw'::text; END IF;
       IF exact_state='approved' AND movements->>'state' IN('unstarted','rejected') THEN actions:=actions||'request-revoke'::text; END IF;
     END IF;
     IF allowed_gm AND v.id IS NOT NULL AND erp_private.t18_independent(v,actor) THEN
       IF exact_state='submitted' THEN actions:=actions||ARRAY['approve','reject']; END IF;
       IF exact_state='request-revoke' THEN actions:=actions||ARRAY['revoke','decline-revoke']; END IF;
     END IF;
     IF allowed_pay AND exact_state='approved' AND a.id IS NOT NULL AND a.decided_by<>actor THEN
       IF movements->>'state'='unstarted' AND scope.last_day<=(clock_timestamp() AT TIME ZONE 'Asia/Dubai')::date THEN
         actions:=actions||'payment-start'::text;
       END IF;
       IF movements->>'state' NOT IN('unstarted','reconciled','paid-unallocated') THEN actions:=actions||'payment-receipt'::text; END IF;
       actions:=actions||ARRAY['payment-allocate','payment-reverse'];
     END IF;
     IF allowed_hr AND selected_row.case_status<>'closed' AND movements->>'state'='reconciled'
       AND (clearance->>'blocking_count')::integer=0 THEN
       actions:=actions||'close-exit'::text;
     END IF;
   END IF;

   chosen:=(chosen-ARRAY['employee_id','case_status','activated'])||jsonb_build_object(
     'employee',selected_row.employee_id,'state',selected_row.case_status,'activated',unchanged,
     'needs_dates',needs_dates,'employment_end_day',selected_row.employment_end_date,
     'clearance',coalesce(clearance,jsonb_build_object('blocking_count',0,'items','[]'::jsonb)),
     'cases',coalesce(recovery,'[]'),'actions',to_jsonb(actions),
     'reviewed_cases',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r->'id','kind',r->'kind',
       'disposition',r->'disposition','reason',r->'reason') ORDER BY (r->>'id')::bigint)
       FROM jsonb_array_elements(v.facts->'recovery') r WHERE a.id IS NOT NULL AND r->>'accepted'='true'),'[]'),
     'payment_channels',coalesce(v.policy->'payment_channels','[]'),
     'approval',CASE WHEN a.id IS NOT NULL THEN jsonb_build_object('version',a.version_id,'digest',a.digest,'state',a.state) END,
     'draft',CASE WHEN v.id IS NOT NULL THEN jsonb_build_object('version',v.id,'number',v.number,'digest',v.digest,'state',exact_state,
       'gross',v.gross::text,'deductions',v.deductions::text,'net',v.net::text,'currency',coalesce(v.currency,''),
       'lines',coalesce((SELECT jsonb_agg(jsonb_build_object('id',l.id,'category',l.category,'kind',l.kind,
           'amount',l.amount::text,'reason',l.reason) ORDER BY l.category,l.key)
         FROM erp_private.t18_lines l WHERE l.version_id=v.id),'[]'),
       'issues',coalesce((SELECT jsonb_agg(jsonb_build_object('code',i->'code','reason',i->'reason','blocking',i->'blocking'))
          FROM jsonb_array_elements(v.facts->'issues') i),'[]')) END,
     'payment',movements,
     'adjustments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',adj.id,'kind',adj.kind,'amount',adj.amount::text,
       'currency',adj.currency,'status',adj.status,'digest',adj.receipt_digest,'reason',adj.reason,
       'evidence_attached',true,'can_decide',independent AND unlocked AND allowed_hr AND adj.status='proposed'
         AND adj.proposed_by<>actor) ORDER BY adj.id DESC) FROM erp_private.t18_exit_adjustments adj WHERE adj.eos_id=p_eos),'[]'),
     'can_propose_adjustment',unchanged AND unlocked AND independent AND allowed_accounts,
     'history',coalesce((SELECT jsonb_agg(jsonb_build_object('version',old.id,'number',old.number,'digest',old.digest,
        'state',erp_private.t18_version_state(old.id),'calculated_at',old.calc_at) ORDER BY old.number DESC)
       FROM erp_private.t18_versions old WHERE old.eos_id=p_eos),'[]'));
 END IF;
 RETURN jsonb_build_object('access',jsonb_build_object('hr',allowed_hr,'accounts',allowed_accounts,'approve',allowed_gm,'pay',allowed_pay),
    'cases',visible_rows,'selected',chosen,'policies',policies,'next_after',next_after);
END $$;

CREATE FUNCTION public.t18_exit_scoped_change(p_operation uuid,p_company bigint,p_branch bigint,p_eos bigint,
 p_domain text,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_domain NOT IN('payment','adjustment') OR NOT erp_private.t18_can(p_company,p_branch,'view')
   OR NOT EXISTS(SELECT 1 FROM erp_private.t18_cases a WHERE a.eos_id=p_eos AND
     (a.company_id,a.branch_id)=(p_company,p_branch)) THEN
   RAISE EXCEPTION 'The requested exit case is unavailable in this scope' USING ERRCODE='42501';
 END IF;
 IF p_domain='payment' THEN RETURN public.t18_exit_payment(p_operation,p_eos,p_action,p_data); END IF;
 RETURN public.t18_exit_adjustment(p_operation,p_eos,p_action,p_data);
END $$;

REVOKE ALL ON FUNCTION public.t18_exit_scoped_change(uuid,bigint,bigint,bigint,text,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t18_exit_scoped_change(uuid,bigint,bigint,bigint,text,text,jsonb) TO authenticated;

REVOKE ALL ON FUNCTION erp_private.t18_closure_authorized(bigint),erp_private.t18_guard_eos_updates(),
 public.t18_exit_scopes(),public.t18_exit_workspace(bigint,bigint,bigint,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t18_exit_scopes(),public.t18_exit_workspace(bigint,bigint,bigint,bigint) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
