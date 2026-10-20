BEGIN;
-- Transaction-local hash-only admissions are not client-controlled GUCs.
-- Actual writes remain ordinary invoker operations under their existing RLS.
CREATE TABLE erp_private.f11_time_admissions(transaction_id xid8 NOT NULL,actor uuid NOT NULL,operation_id uuid NOT NULL,kind text NOT NULL,employee_id bigint NOT NULL,record_id bigint,revision bigint,action text NOT NULL,request_hash text NOT NULL,payload_hash text NOT NULL,balance_id bigint,balance_revision bigint,expected_used numeric,PRIMARY KEY(transaction_id,actor,operation_id));
REVOKE ALL ON erp_private.f11_time_admissions FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION erp_private.f11_time_payload_hash(p_data jsonb)RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT encode(sha256(convert_to(coalesce(jsonb_object_agg(key,CASE WHEN jsonb_typeof(value)='number'THEN to_jsonb(trim_scale(value::text::numeric))WHEN key='punch_datetime'THEN to_jsonb((value#>>'{}')::timestamptz)ELSE value END),'{}'::jsonb)::text,'UTF8')),'hex')FROM jsonb_each(p_data)
$$;
CREATE FUNCTION erp_private.f11_admit_time_operation(p_context jsonb,p_data jsonb)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE kind text:=p_context->>'kind';employee bigint:=(p_context->>'employee_id')::bigint;action text:=p_context->>'action';target bigint:=(p_context->>'id')::bigint;expected_revision bigint:=(p_context->>'revision')::bigint;table_name text;original jsonb;balance public.employee_leave_balances;expected numeric;digest text;BEGIN
 IF auth.uid()IS NULL OR NOT erp_private.f11_child_authorized(kind,employee)OR erp_private.f11_time_columns(kind)IS NULL OR p_context->>'operation_id'IS NULL THEN RAISE EXCEPTION 'Current Time admission required' USING ERRCODE='42501';END IF;
 PERFORM erp_private.f11_validate_time(kind,action,p_data);
 IF NOT(CASE kind WHEN'attendance-summary'THEN action=ANY(ARRAY['create','update','approve','query','correct'])WHEN'attendance-punch'THEN action='create'WHEN'shift-assignment'THEN action=ANY(ARRAY['create','update','archive'])WHEN'leave-request'THEN action=ANY(ARRAY['create','approve','reject','cancel','archive'])WHEN'leave-balance'THEN action=ANY(ARRAY['create','update','recalculate'])ELSE action=ANY(ARRAY['create','update','approve','reject','archive'])END)THEN RAISE EXCEPTION 'Unsupported Time admission' USING ERRCODE='22023';END IF;
 digest:=encode(sha256(convert_to(jsonb_build_array(kind,employee,target,expected_revision,action,p_data)::text,'UTF8')),'hex');IF digest IS DISTINCT FROM p_context->>'hash'THEN RAISE EXCEPTION 'Time admission hash mismatch' USING ERRCODE='22023';END IF;
 PERFORM 1 FROM public.employees WHERE id=employee AND deleted_at IS NULL FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Employee unavailable' USING ERRCODE='42501';END IF;
 table_name:=CASE kind WHEN'attendance-summary'THEN'employee_attendance_daily_summary'WHEN'attendance-punch'THEN'employee_attendance_punches'WHEN'shift-assignment'THEN'employee_shift_assignments'WHEN'leave-request'THEN'employee_leave_requests'WHEN'leave-balance'THEN'employee_leave_balances'ELSE'employee_overtime_records'END;
 IF action='create'THEN IF target IS NOT NULL OR expected_revision IS NOT NULL THEN RAISE EXCEPTION 'Invalid new Time identity' USING ERRCODE='22023';END IF;
 ELSE
  EXECUTE format('SELECT to_jsonb(r)FROM public.%I r WHERE id=$1 AND employee_id=$2 FOR UPDATE',table_name)INTO original USING target,employee;
  IF original IS NULL OR original->>'deleted_at'IS NOT NULL OR(original->>'workspace_revision')::bigint IS DISTINCT FROM expected_revision THEN RAISE EXCEPTION 'Time original changed' USING ERRCODE='P0409';END IF;
 END IF;
 IF kind='leave-request'AND action='approve'THEN
  SELECT *INTO balance FROM public.employee_leave_balances WHERE employee_id=employee AND leave_type_id=(original->>'leave_type_id')::bigint AND leave_year=extract(year FROM(original->>'start_date')::date)FOR UPDATE;
  IF FOUND THEN expected:=balance.used_days+coalesce((original->>'total_days')::numeric,0);END IF;
 ELSIF kind='leave-balance'AND action='recalculate'THEN
  IF public.f11_leave_balance_opening(employee,target)IS DISTINCT FROM p_data->>'fingerprint'THEN RAISE EXCEPTION 'Leave sources changed after review' USING ERRCODE='P0409';END IF;
  SELECT coalesce(sum(total_days),0)INTO expected FROM public.employee_leave_requests WHERE employee_id=employee AND leave_type_id=(original->>'leave_type_id')::bigint AND approval_status='approved'AND deleted_at IS NULL AND extract(year FROM start_date)=(original->>'leave_year')::integer;
 END IF;
 INSERT INTO erp_private.f11_time_admissions(transaction_id,actor,operation_id,kind,employee_id,record_id,revision,action,request_hash,payload_hash,balance_id,balance_revision,expected_used)VALUES(pg_current_xact_id(),auth.uid(),(p_context->>'operation_id')::uuid,kind,employee,target,expected_revision,action,digest,erp_private.f11_time_payload_hash(p_data),balance.id,balance.workspace_revision,expected);
END$$;
CREATE FUNCTION erp_private.f11_verify_time_admission(p_table text,p_new jsonb,p_old jsonb,p_context jsonb)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE gate erp_private.f11_time_admissions;kind text;actual jsonb;balance public.employee_leave_balances;BEGIN
 SELECT *INTO gate FROM erp_private.f11_time_admissions WHERE transaction_id=pg_current_xact_id()AND actor=auth.uid()AND operation_id=(p_context->>'operation_id')::uuid;
 IF NOT FOUND OR gate.employee_id IS DISTINCT FROM(p_new->>'employee_id')::bigint OR gate.request_hash IS DISTINCT FROM p_context->>'hash'OR gate.kind IS DISTINCT FROM p_context->>'kind'OR gate.action IS DISTINCT FROM p_context->>'action'OR NOT erp_private.f11_child_authorized(gate.kind,gate.employee_id)THEN RAISE EXCEPTION 'Verified Time transaction admission required' USING ERRCODE='42501';END IF;
 kind:=CASE p_table WHEN'employee_attendance_daily_summary'THEN'attendance-summary'WHEN'employee_attendance_punches'THEN'attendance-punch'WHEN'employee_shift_assignments'THEN'shift-assignment'WHEN'employee_leave_requests'THEN'leave-request'WHEN'employee_leave_balances'THEN'leave-balance'WHEN'employee_overtime_records'THEN'overtime'END;
 IF kind='leave-balance'AND gate.kind='leave-request'AND gate.action='approve'THEN
  IF gate.balance_id IS DISTINCT FROM(p_new->>'id')::bigint OR gate.balance_revision IS DISTINCT FROM(p_old->>'workspace_revision')::bigint OR gate.expected_used IS DISTINCT FROM(p_new->>'used_days')::numeric THEN RAISE EXCEPTION 'Unverified linked leave charge' USING ERRCODE='23514';END IF;RETURN;
 END IF;
 IF kind IS DISTINCT FROM gate.kind OR(p_old IS NULL)IS DISTINCT FROM(gate.action='create')OR p_old IS NOT NULL AND(gate.record_id IS DISTINCT FROM(p_old->>'id')::bigint OR gate.revision IS DISTINCT FROM(p_old->>'workspace_revision')::bigint)THEN RAISE EXCEPTION 'Time admitted original mismatch' USING ERRCODE='P0409';END IF;
 actual:=CASE WHEN gate.action IN('create','update')THEN(SELECT jsonb_object_agg(k,p_new->k)FROM unnest(erp_private.f11_time_columns(kind))k)WHEN gate.action IN('approve','archive')THEN'{}'::jsonb WHEN gate.action IN('query','reject','cancel')THEN jsonb_build_object('reason',p_new->'notes')WHEN gate.action='correct'THEN jsonb_build_object('correction_reason',p_context->'correction_reason','notes',p_new->'notes')WHEN gate.action='recalculate'THEN jsonb_build_object('fingerprint',p_context->'fingerprint')END;
 IF actual IS NULL OR erp_private.f11_time_payload_hash(actual)IS DISTINCT FROM gate.payload_hash THEN RAISE EXCEPTION 'Time fields differ from admitted command' USING ERRCODE='23514';END IF;
 IF kind='leave-request'AND gate.action='create'AND(p_new->>'total_days')::numeric IS DISTINCT FROM((p_new->>'end_date')::date-(p_new->>'start_date')::date+1)::numeric THEN RAISE EXCEPTION 'Leave duration must be derived from dates' USING ERRCODE='23514';END IF;
 IF kind='leave-request'AND gate.action='approve'AND gate.balance_id IS NOT NULL THEN
  SELECT *INTO balance FROM public.employee_leave_balances WHERE id=gate.balance_id AND employee_id=gate.employee_id;
  IF NOT FOUND OR balance.workspace_revision<>gate.balance_revision+1 OR balance.used_days IS DISTINCT FROM gate.expected_used THEN RAISE EXCEPTION 'Leave approval requires its admitted atomic balance charge' USING ERRCODE='23514';END IF;
 END IF;
 IF kind='leave-balance'AND gate.action='recalculate'AND(p_new->>'used_days')::numeric IS DISTINCT FROM gate.expected_used THEN RAISE EXCEPTION 'Unverified leave recalculation' USING ERRCODE='23514';END IF;
END$$;
CREATE FUNCTION erp_private.f11_time_admission_must_settle()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN
 IF NOT EXISTS(SELECT 1 FROM erp_private.f11_child_receipts r WHERE r.actor=NEW.actor AND r.operation_id=NEW.operation_id AND r.kind=NEW.kind AND r.employee_id=NEW.employee_id AND r.request_hash=NEW.request_hash)THEN RAISE EXCEPTION 'Unsettled Time transaction cannot commit' USING ERRCODE='23514';END IF;RETURN NULL;
END$$;
CREATE CONSTRAINT TRIGGER f11_time_admission_settlement AFTER INSERT ON erp_private.f11_time_admissions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.f11_time_admission_must_settle();
CREATE FUNCTION erp_private.f11_settle_time_admission(p_operation uuid)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN
 IF NOT EXISTS(SELECT 1 FROM erp_private.f11_time_admissions a JOIN erp_private.f11_child_receipts r ON r.actor=a.actor AND r.operation_id=a.operation_id AND r.request_hash=a.request_hash WHERE a.transaction_id=pg_current_xact_id()AND a.actor=auth.uid()AND a.operation_id=p_operation)THEN RAISE EXCEPTION 'Time receipt missing at settlement' USING ERRCODE='23514';END IF;
 DELETE FROM erp_private.f11_time_admissions WHERE transaction_id=pg_current_xact_id()AND actor=auth.uid()AND operation_id=p_operation;
END$$;
CREATE OR REPLACE FUNCTION erp_private.f11_capture_time_child()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE context jsonb:=nullif(current_setting('erp.f11_child_save',true),'')::jsonb;kind text;action text;actor bigint:=public.current_user_profile_id();subject record;changed text[];values jsonb;subsidiary boolean;BEGIN
 kind:=CASE TG_TABLE_NAME WHEN'employee_attendance_daily_summary'THEN'attendance-summary'WHEN'employee_attendance_punches'THEN'attendance-punch'WHEN'employee_shift_assignments'THEN'shift-assignment'WHEN'employee_leave_requests'THEN'leave-request'WHEN'employee_leave_balances'THEN'leave-balance'WHEN'employee_overtime_records'THEN'overtime'END;
 IF auth.uid()IS NULL AND current_user='postgres'THEN RETURN NEW;END IF;
 PERFORM erp_private.f11_verify_time_admission(TG_TABLE_NAME,to_jsonb(NEW),CASE WHEN TG_OP='INSERT'THEN NULL ELSE to_jsonb(OLD)END,context);
 IF context IS NULL OR(context->>'employee_id')::bigint IS DISTINCT FROM NEW.employee_id OR coalesce(context->>'hash','')!~'^[0-9a-f]{64}$'OR NOT erp_private.f11_child_authorized(context->>'kind',NEW.employee_id)OR NOT erp_private.f11_child_authorized(kind,NEW.employee_id)THEN RAISE EXCEPTION 'Original current Time contract required' USING ERRCODE='42501';END IF;
 subsidiary:=kind='leave-balance'AND context->>'kind'='leave-request'AND context->>'action'='approve';action:=context->>'action';
 IF NOT subsidiary AND context->>'kind'IS DISTINCT FROM kind THEN RAISE EXCEPTION 'Time kind mismatch' USING ERRCODE='42501';END IF;
 IF TG_OP='INSERT'THEN
  IF subsidiary OR action<>'create'OR NEW.workspace_revision<>1 OR(to_jsonb(NEW)->>'created_by')::bigint IS DISTINCT FROM actor OR to_jsonb(NEW)->>'deleted_at'IS NOT NULL OR to_jsonb(NEW)->>'approval_status'IS NOT NULL AND to_jsonb(NEW)->>'approval_status'<>'pending'THEN RAISE EXCEPTION 'Invalid Time creation' USING ERRCODE='23514';END IF;
  values:=(SELECT jsonb_object_agg(k,to_jsonb(NEW)->k)FROM unnest(erp_private.f11_time_columns(kind))k);PERFORM erp_private.f11_validate_time(kind,'create',values);
 ELSE
  IF kind='attendance-punch'THEN RAISE EXCEPTION 'Punches are append-only' USING ERRCODE='42501';END IF;
  IF NEW.employee_id IS DISTINCT FROM OLD.employee_id OR NOT subsidiary AND((context->>'id')::bigint IS DISTINCT FROM OLD.id OR(context->>'revision')::bigint IS DISTINCT FROM OLD.workspace_revision)OR NEW.workspace_revision<>OLD.workspace_revision+1 THEN RAISE EXCEPTION 'Time changed after opening' USING ERRCODE='P0409';END IF;
  IF subsidiary THEN changed:=ARRAY['used_days','balance_days'];
  ELSIF action='update'THEN changed:=erp_private.f11_time_columns(kind);values:=(SELECT jsonb_object_agg(k,to_jsonb(NEW)->k)FROM unnest(changed)k);PERFORM erp_private.f11_validate_time(kind,'update',values);
  ELSIF action='correct'AND kind='attendance-summary'THEN changed:=ARRAY['notes'];IF coalesce(context->>'correction_reason','')=''THEN RAISE EXCEPTION 'Correction reason required' USING ERRCODE='23514';END IF;
   INSERT INTO public.employee_attendance_corrections(summary_id,employee_id,correction_reason,old_values_json,new_values_json,corrected_by)VALUES(NEW.id,NEW.employee_id,context->>'correction_reason',jsonb_build_object('notes',OLD.notes),jsonb_build_object('notes',NEW.notes),actor);
  ELSIF action='query'AND kind='attendance-summary'THEN changed:=ARRAY['approval_status','notes'];IF (to_jsonb(OLD)->>'approval_status')<>'pending'OR NEW.approval_status<>'queried'THEN RAISE EXCEPTION 'Attendance no longer pending' USING ERRCODE='23514';END IF;
  ELSIF action='approve'AND kind IN('attendance-summary','leave-request','overtime')THEN changed:=ARRAY['approval_status','approved_by','approved_at'];IF (to_jsonb(OLD)->>'approval_status')<>'pending'OR NEW.approval_status<>'approved'OR NEW.approved_by IS DISTINCT FROM actor OR NEW.approved_at IS NULL THEN RAISE EXCEPTION 'Invalid Time approval' USING ERRCODE='23514';END IF;
  ELSIF action='reject'AND kind IN('leave-request','overtime')THEN changed:=ARRAY['approval_status','notes','rejected_by','rejected_at'];IF (to_jsonb(OLD)->>'approval_status')<>'pending'OR NEW.approval_status<>'rejected'THEN RAISE EXCEPTION 'Invalid Time rejection' USING ERRCODE='23514';END IF;
  ELSIF action='cancel'AND kind='leave-request'THEN changed:=ARRAY['approval_status','notes','cancelled_by','cancelled_at'];IF (to_jsonb(OLD)->>'approval_status') NOT IN('pending','approved')OR NEW.approval_status<>'cancelled'THEN RAISE EXCEPTION 'Invalid Time cancellation' USING ERRCODE='23514';END IF;
  ELSIF action='archive'AND kind IN('shift-assignment','leave-request','overtime')THEN changed:=ARRAY['deleted_at','deleted_by'];IF to_jsonb(NEW)->>'deleted_at'IS NULL THEN RAISE EXCEPTION 'Invalid Time archive' USING ERRCODE='23514';END IF;
  ELSIF action='recalculate'AND kind='leave-balance'THEN changed:=ARRAY['used_days','balance_days'];
  ELSE RAISE EXCEPTION 'Unsupported Time transition' USING ERRCODE='23514';END IF;
  IF kind='leave-balance'AND action='update'THEN changed:=changed||ARRAY['balance_days'];END IF;
  IF kind IN('leave-request','overtime')AND action='update'AND (to_jsonb(OLD)->>'approval_status')<>'pending'THEN RAISE EXCEPTION 'Decided Time records are not editable' USING ERRCODE='23514';END IF;
  changed:=changed||ARRAY['workspace_revision','updated_at','updated_by'];IF(to_jsonb(NEW)-changed)IS DISTINCT FROM(to_jsonb(OLD)-changed)THEN RAISE EXCEPTION 'Unrendered Time facts changed' USING ERRCODE='23514';END IF;
 END IF;
 SELECT owner_company_id,branch_id INTO subject FROM public.employees WHERE id=NEW.employee_id;
 IF NOT subsidiary THEN INSERT INTO erp_private.f11_child_receipts(actor,operation_id,kind,action,employee_id,record_id,revision,request_hash)VALUES(auth.uid(),(context->>'operation_id')::uuid,kind,action,NEW.employee_id,NEW.id,NEW.workspace_revision,context->>'hash');END IF;
 INSERT INTO public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,action,new_values)VALUES(actor,subject.owner_company_id,subject.branch_id,'HR',TG_TABLE_NAME,NEW.id,CASE WHEN subsidiary THEN'linked_time_change'ELSE action END,jsonb_build_object('operation_id',context->>'operation_id','employee_id',NEW.employee_id,'revision',NEW.workspace_revision));RETURN NEW;
END$$;
CREATE OR REPLACE FUNCTION public.f11_mutate_time_child(p_kind text,p_employee bigint,p_id bigint,p_revision bigint,p_operation uuid,p_action text,p_data jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE table_name text;receipt jsonb;digest text;existing jsonb;typed jsonb;actor bigint;target bigint;revision bigint;columns text[];column_sql text;context jsonb;archive_filter text;used numeric;BEGIN
 IF p_kind IS NULL OR erp_private.f11_time_columns(p_kind)IS NULL OR NOT erp_private.f11_child_authorized(p_kind,p_employee)THEN RAISE EXCEPTION 'Current scoped Time authority required' USING ERRCODE='42501';END IF;
 IF p_employee IS NULL OR p_employee<1 OR p_employee>9007199254740991 OR p_operation IS NULL OR p_action IS NULL OR NOT(CASE p_kind WHEN'attendance-summary'THEN p_action=ANY(ARRAY['create','update','approve','query','correct'])WHEN'attendance-punch'THEN p_action='create'WHEN'shift-assignment'THEN p_action=ANY(ARRAY['create','update','archive'])WHEN'leave-request'THEN p_action=ANY(ARRAY['create','approve','reject','cancel','archive'])WHEN'leave-balance'THEN p_action=ANY(ARRAY['create','update','recalculate'])ELSE p_action=ANY(ARRAY['create','update','approve','reject','archive'])END)OR(p_action='create'AND(p_id IS NOT NULL OR p_revision IS NOT NULL))OR(p_action<>'create'AND(p_id IS NULL OR p_id<1 OR p_revision IS NULL OR p_revision<1))OR jsonb_typeof(p_data)IS DISTINCT FROM'object'OR octet_length(p_data::text)>65536 THEN RAISE EXCEPTION 'Invalid Time operation' USING ERRCODE='22023';END IF;
 PERFORM erp_private.f11_validate_time(p_kind,p_action,p_data);
 table_name:=CASE p_kind WHEN'attendance-summary'THEN'employee_attendance_daily_summary'WHEN'attendance-punch'THEN'employee_attendance_punches'WHEN'shift-assignment'THEN'employee_shift_assignments'WHEN'leave-request'THEN'employee_leave_requests'WHEN'leave-balance'THEN'employee_leave_balances'ELSE'employee_overtime_records'END;
 digest:=encode(sha256(convert_to(jsonb_build_array(p_kind,p_employee,p_id,p_revision,p_action,p_data)::text,'UTF8')),'hex');PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_operation::text,0));receipt:=erp_private.f11_child_receipt(p_operation);
 IF receipt IS NOT NULL THEN IF receipt->>'hash'<>digest OR receipt->>'kind'<>p_kind OR(receipt->>'employee_id')::bigint<>p_employee THEN RAISE EXCEPTION 'Operation already used' USING ERRCODE='22023';END IF;RETURN(receipt-'hash')||jsonb_build_object('replayed',true);END IF;
 PERFORM 1 FROM public.employees WHERE id=p_employee AND deleted_at IS NULL FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Employee unavailable' USING ERRCODE='42501';END IF;
 archive_filter:=CASE WHEN p_kind IN('shift-assignment','leave-request','overtime')THEN' AND deleted_at IS NULL'ELSE''END;
 IF p_action<>'create'THEN EXECUTE format('SELECT to_jsonb(r)FROM public.%I r WHERE id=$1 AND employee_id=$2%s FOR UPDATE',table_name,archive_filter)INTO existing USING p_id,p_employee;
  IF existing IS NULL THEN RAISE EXCEPTION 'Original Time row unavailable' USING ERRCODE='42501';END IF;IF(existing->>'workspace_revision')::bigint<>p_revision THEN RAISE EXCEPTION 'Time changed after opening' USING ERRCODE='P0409';END IF;
 ELSIF p_kind='attendance-summary'AND EXISTS(SELECT 1 FROM public.employee_attendance_daily_summary WHERE employee_id=p_employee AND attendance_date=(p_data->>'attendance_date')::date)OR p_kind='leave-balance'AND EXISTS(SELECT 1 FROM public.employee_leave_balances WHERE employee_id=p_employee AND leave_type_id=(p_data->>'leave_type_id')::bigint AND leave_year=(p_data->>'leave_year')::integer)THEN RAISE EXCEPTION 'An original Time row already exists; reopen' USING ERRCODE='P0409';END IF;
 IF NOT erp_private.f11_child_authorized(p_kind,p_employee)THEN RAISE EXCEPTION 'Time authority changed' USING ERRCODE='42501';END IF;actor:=public.current_user_profile_id();
 IF p_kind IN('leave-request','leave-balance')AND p_action IN('create','update')AND p_data->>'leave_type_id'IS DISTINCT FROM existing->>'leave_type_id'AND NOT EXISTS(SELECT 1 FROM public.hr_leave_types WHERE id=(p_data->>'leave_type_id')::bigint AND is_active AND deleted_at IS NULL)THEN RAISE EXCEPTION 'Current leave type unavailable' USING ERRCODE='23514';END IF;
 IF p_kind='shift-assignment'AND p_action IN('create','update')THEN
  IF p_data->>'work_calendar_id'IS NOT NULL AND p_data->>'work_calendar_id'IS DISTINCT FROM existing->>'work_calendar_id'AND NOT EXISTS(SELECT 1 FROM public.work_calendars WHERE id=(p_data->>'work_calendar_id')::bigint AND is_active AND deleted_at IS NULL AND(owner_company_id IS NULL OR owner_company_id=(SELECT owner_company_id FROM public.employees WHERE id=p_employee)))THEN RAISE EXCEPTION 'Current calendar unavailable' USING ERRCODE='23514';END IF;
  IF p_data->>'work_shift_id'IS NOT NULL AND(NOT EXISTS(SELECT 1 FROM public.work_shifts WHERE id=(p_data->>'work_shift_id')::bigint AND(p_data->>'work_calendar_id'IS NULL OR calendar_id=(p_data->>'work_calendar_id')::bigint))OR p_data->>'work_shift_id'IS DISTINCT FROM existing->>'work_shift_id'AND NOT EXISTS(SELECT 1 FROM public.work_shifts WHERE id=(p_data->>'work_shift_id')::bigint AND is_active AND deleted_at IS NULL AND EXISTS(SELECT 1 FROM public.work_calendars c WHERE c.id=calendar_id AND(c.owner_company_id IS NULL OR c.owner_company_id=(SELECT owner_company_id FROM public.employees WHERE id=p_employee)))))THEN RAISE EXCEPTION 'Current compatible shift unavailable' USING ERRCODE='23514';END IF;
 END IF;
 context:=jsonb_build_object('kind',p_kind,'employee_id',p_employee,'id',p_id,'revision',p_revision,'operation_id',p_operation,'action',p_action,'hash',digest,'correction_reason',p_data->>'correction_reason','fingerprint',p_data->>'fingerprint');PERFORM erp_private.f11_admit_time_operation(context,p_data);PERFORM set_config('erp.f11_child_save',context::text,true);
 columns:=erp_private.f11_time_columns(p_kind);typed:=coalesce(existing,'{}'::jsonb)||p_data||jsonb_build_object('employee_id',p_employee,'created_by',coalesce((existing->>'created_by')::bigint,actor),'updated_by',actor);
 IF p_action='create'AND p_kind='leave-request'THEN columns:=columns||ARRAY['total_days'];typed:=typed||jsonb_build_object('total_days',(p_data->>'end_date')::date-(p_data->>'start_date')::date+1);END IF;
 IF p_action='create'THEN
  columns:=columns||ARRAY['employee_id','created_by']||CASE WHEN p_kind='attendance-punch'THEN ARRAY[]::text[]ELSE ARRAY['updated_by']END;SELECT string_agg(format('%I',k),',')INTO column_sql FROM unnest(columns)k;
  EXECUTE format('INSERT INTO public.%1$I(%2$s)SELECT %2$s FROM jsonb_populate_record(NULL::public.%1$I,$1)RETURNING id,workspace_revision',table_name,column_sql)INTO target,revision USING typed;
 ELSE
  IF p_action='approve'THEN columns:=ARRAY['approval_status','approved_by','approved_at'];typed:=typed||jsonb_build_object('approval_status','approved','approved_by',actor,'approved_at',clock_timestamp());
  ELSIF p_action='query'THEN columns:=ARRAY['approval_status','notes'];typed:=typed||jsonb_build_object('approval_status','queried','notes',p_data->>'reason');
  ELSIF p_action='correct'THEN columns:=ARRAY['notes'];
  ELSIF p_action='reject'THEN columns:=ARRAY['approval_status','notes']||CASE WHEN p_kind='leave-request'THEN ARRAY['rejected_by','rejected_at']ELSE ARRAY[]::text[]END;typed:=typed||jsonb_build_object('approval_status','rejected','notes',p_data->>'reason','rejected_by',actor,'rejected_at',clock_timestamp());
  ELSIF p_action='cancel'THEN columns:=ARRAY['approval_status','notes','cancelled_by','cancelled_at'];typed:=typed||jsonb_build_object('approval_status','cancelled','notes',p_data->>'reason','cancelled_by',actor,'cancelled_at',clock_timestamp());
  ELSIF p_action='archive'THEN columns:=ARRAY['deleted_at','deleted_by'];typed:=typed||jsonb_build_object('deleted_at',clock_timestamp(),'deleted_by',actor);
  ELSIF p_action='recalculate'THEN
   IF public.f11_leave_balance_opening(p_employee,p_id)IS DISTINCT FROM p_data->>'fingerprint'THEN RAISE EXCEPTION 'Leave sources changed after review' USING ERRCODE='P0409';END IF;
   SELECT coalesce(sum(total_days),0)INTO used FROM public.employee_leave_requests WHERE employee_id=p_employee AND leave_type_id=(existing->>'leave_type_id')::bigint AND approval_status='approved'AND deleted_at IS NULL AND extract(year FROM start_date)=(existing->>'leave_year')::integer;
   columns:=ARRAY['used_days'];typed:=typed||jsonb_build_object('used_days',used);
  END IF;
  IF p_kind='leave-request'AND p_action='approve'THEN
   -- Preserve the existing start-date-year convention. Cross-year allocation,
   -- cancellation reversal and working-day policy remain explicit F13 work.
   UPDATE public.employee_leave_balances SET used_days=used_days+coalesce((existing->>'total_days')::numeric,0),updated_by=actor WHERE employee_id=p_employee AND leave_type_id=(existing->>'leave_type_id')::bigint AND leave_year=extract(year FROM(existing->>'start_date')::date);
  END IF;
  columns:=columns||ARRAY['updated_by'];SELECT string_agg(format('%1$I=t.%1$I',k),',')INTO column_sql FROM unnest(columns)k;
  EXECUTE format('UPDATE public.%1$I r SET %2$s FROM jsonb_populate_record(NULL::public.%1$I,$1)t WHERE r.id=$2 AND r.employee_id=$3 AND r.workspace_revision=$4%3$s RETURNING r.id,r.workspace_revision',table_name,column_sql,replace(archive_filter,'deleted_at','r.deleted_at'))INTO target,revision USING typed,p_id,p_employee,p_revision;
 END IF;
 PERFORM set_config('erp.f11_child_save','',true);IF target IS NULL OR NOT erp_private.f11_child_authorized(p_kind,p_employee)THEN RAISE EXCEPTION 'Time save not confirmed' USING ERRCODE='42501';END IF;
 PERFORM erp_private.f11_settle_time_admission(p_operation);
 RETURN jsonb_build_object('kind',p_kind,'employee_id',p_employee,'id',target,'revision',revision::text,'operation_id',p_operation,'replayed',false);
END$$;
REVOKE ALL ON FUNCTION erp_private.f11_time_payload_hash(jsonb),erp_private.f11_admit_time_operation(jsonb,jsonb),erp_private.f11_verify_time_admission(text,jsonb,jsonb,jsonb),erp_private.f11_time_admission_must_settle(),erp_private.f11_settle_time_admission(uuid)FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f11_admit_time_operation(jsonb,jsonb),erp_private.f11_settle_time_admission(uuid)TO authenticated;
ALTER TABLE erp_private.f11_time_admissions ENABLE ROW LEVEL SECURITY;
NOTIFY pgrst,'reload schema';
COMMIT;
