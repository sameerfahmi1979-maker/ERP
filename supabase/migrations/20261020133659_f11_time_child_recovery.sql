BEGIN;
DO $$DECLARE name text;definition text;BEGIN
 FOREACH name IN ARRAY ARRAY['employee_attendance_daily_summary','employee_attendance_punches','employee_shift_assignments','employee_leave_requests','employee_leave_balances','employee_overtime_records']LOOP
  EXECUTE format('ALTER TABLE public.%I ADD COLUMN workspace_revision bigint NOT NULL DEFAULT 1 CHECK(workspace_revision>0)',name);
  EXECUTE format('GRANT SELECT(workspace_revision)ON public.%I TO authenticated',name);
  EXECUTE format('REVOKE DELETE ON public.%I FROM PUBLIC,anon,authenticated',name);
  EXECUTE format('CREATE TRIGGER f04_time_revision BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION erp_private.workspace_revision()',name);
 END LOOP;
 REVOKE INSERT,UPDATE,DELETE ON public.employee_attendance_corrections FROM PUBLIC,anon,authenticated;
 REVOKE UPDATE ON public.employee_attendance_punches FROM PUBLIC,anon,authenticated;
 SELECT regexp_replace(pg_get_constraintdef(oid),'^CHECK ','')INTO STRICT definition FROM pg_constraint WHERE conrelid='erp_private.f11_child_receipts'::regclass AND conname='f11_child_receipts_kind_check';
 ALTER TABLE erp_private.f11_child_receipts DROP CONSTRAINT f11_child_receipts_kind_check;
 EXECUTE 'ALTER TABLE erp_private.f11_child_receipts ADD CONSTRAINT f11_child_receipts_kind_check CHECK('||definition||'OR kind IN(''attendance-summary'',''attendance-punch'',''shift-assignment'',''leave-request'',''leave-balance'',''overtime''))';
 SELECT regexp_replace(pg_get_constraintdef(oid),'^CHECK ','')INTO STRICT definition FROM pg_constraint WHERE conrelid='erp_private.f11_child_receipts'::regclass AND conname='f11_child_receipts_operation_check';
 ALTER TABLE erp_private.f11_child_receipts DROP CONSTRAINT f11_child_receipts_operation_check;
 EXECUTE 'ALTER TABLE erp_private.f11_child_receipts ADD CONSTRAINT f11_child_receipts_operation_check CHECK('||definition||'OR(kind=''attendance-summary''AND action IN(''create'',''update'',''approve'',''query'',''correct''))OR(kind=''attendance-punch''AND action=''create'')OR(kind=''shift-assignment''AND action IN(''create'',''update'',''archive''))OR(kind=''leave-request''AND action IN(''create'',''approve'',''reject'',''cancel'',''archive''))OR(kind=''leave-balance''AND action IN(''create'',''update'',''recalculate''))OR(kind=''overtime''AND action IN(''create'',''update'',''approve'',''reject'',''archive'')))';
END $$;
-- Extend only the disjoint Time arms; preserve all prior native authority.
DO $$DECLARE definition text;marker text:='CASE WHEN p_kind IN(''payroll-profile''';BEGIN
 SELECT pg_get_functiondef('erp_private.f11_child_authorized(text,bigint)'::regprocedure)INTO definition;
 IF position(marker IN definition)=0 THEN RAISE EXCEPTION 'Previous authority identity mismatch';END IF;
 definition:=replace(definition,marker,'CASE WHEN p_kind IN(''attendance-summary'',''attendance-punch'',''shift-assignment'',''overtime'')THEN erp_private.employee_permission(p_employee,''hr.attendance.view'')AND erp_private.employee_permission(p_employee,''hr.attendance.manage'')WHEN p_kind IN(''leave-request'',''leave-balance'')THEN erp_private.employee_permission(p_employee,''hr.leave.view'')AND erp_private.employee_permission(p_employee,''hr.leave.manage'')WHEN p_kind IN(''payroll-profile''');
 EXECUTE definition;
END $$;
CREATE FUNCTION erp_private.f11_time_columns(p_kind text)RETURNS text[]LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$SELECT CASE p_kind
 WHEN'attendance-summary'THEN ARRAY['attendance_date','attendance_type','total_hours','overtime_hours','late_minutes','early_out_minutes','is_missing_punch','notes']
 WHEN'attendance-punch'THEN ARRAY['punch_datetime','punch_type','punch_source','notes']
 WHEN'shift-assignment'THEN ARRAY['work_calendar_id','work_shift_id','effective_from','effective_to','overtime_eligible','attendance_required','weekly_off_day','notes']
 WHEN'leave-request'THEN ARRAY['leave_type_id','start_date','end_date','reason','notes']
 WHEN'leave-balance'THEN ARRAY['leave_type_id','leave_year','entitled_days','used_days','carry_forward']
 WHEN'overtime'THEN ARRAY['overtime_date','hours','reason','notes']END$$;
CREATE FUNCTION erp_private.f11_validate_time(p_kind text,p_action text,p_data jsonb)RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE columns text[];key text;value jsonb;number numeric;BEGIN
 columns:=CASE WHEN p_action IN('approve','archive')THEN ARRAY[]::text[]WHEN p_action IN('query','reject','cancel')THEN ARRAY['reason']WHEN p_action='correct'THEN ARRAY['correction_reason','notes']WHEN p_action='recalculate'THEN ARRAY['fingerprint']ELSE erp_private.f11_time_columns(p_kind)END;
 IF columns IS NULL OR jsonb_typeof(p_data)IS DISTINCT FROM'object'OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_data)k WHERE NOT k=ANY(columns))OR EXISTS(SELECT 1 FROM unnest(columns)k WHERE NOT p_data?k)THEN RAISE EXCEPTION 'Incomplete or unrendered Time fields' USING ERRCODE='23514';END IF;
 FOR key,value IN SELECT *FROM jsonb_each(p_data)LOOP
  IF key IN('total_hours','overtime_hours','hours','late_minutes','early_out_minutes','leave_type_id','work_calendar_id','work_shift_id','leave_year','entitled_days','used_days','carry_forward')THEN
   IF value='null'::jsonb AND key IN('total_hours','work_calendar_id','work_shift_id')THEN CONTINUE;END IF;
   IF jsonb_typeof(value)<>'number'THEN RAISE EXCEPTION 'Invalid Time number' USING ERRCODE='23514';END IF;number:=value::text::numeric;
   IF number<0 OR(key IN('total_hours','overtime_hours','hours')AND number>24)OR(key IN('entitled_days','used_days','carry_forward')AND(number>365 OR number<>round(number,2)))OR(key IN('late_minutes','early_out_minutes')AND(number<>trunc(number)OR number>2147483647))OR(key IN('leave_type_id','work_calendar_id','work_shift_id')AND(number<1 OR number<>trunc(number)OR number>9007199254740991))OR(key='leave_year'AND(number<>trunc(number)OR number<2000 OR number>2100))THEN RAISE EXCEPTION 'Time number outside supported range' USING ERRCODE='23514';END IF;
  ELSIF key IN('overtime_eligible','attendance_required','is_missing_punch')THEN IF jsonb_typeof(value)<>'boolean'THEN RAISE EXCEPTION 'Invalid Time flag' USING ERRCODE='23514';END IF;
  ELSIF key IN('attendance_date','effective_from','effective_to','start_date','end_date','overtime_date')THEN
   IF value='null'::jsonb AND key='effective_to'THEN CONTINUE;END IF;
   IF jsonb_typeof(value)<>'string'OR(value#>>'{}')!~'^\d{4}-\d{2}-\d{2}$'THEN RAISE EXCEPTION 'Invalid Time date' USING ERRCODE='23514';END IF;
   BEGIN PERFORM(value#>>'{}')::date;EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid calendar date' USING ERRCODE='23514';END;
  ELSIF key='punch_datetime'THEN
   IF jsonb_typeof(value)<>'string'OR(value#>>'{}')!~'^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$'THEN RAISE EXCEPTION 'Punch requires explicit timezone' USING ERRCODE='23514';END IF;
   BEGIN PERFORM(value#>>'{}')::timestamptz;EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid punch datetime' USING ERRCODE='23514';END;
  ELSE
   IF value='null'::jsonb AND key IN('notes','reason','weekly_off_day')AND p_action NOT IN('query','reject','cancel')THEN CONTINUE;END IF;
   IF jsonb_typeof(value)<>'string'OR length(value#>>'{}')>(CASE WHEN key='reason'AND p_kind='leave-request'AND p_action='create'THEN 1000 WHEN key='fingerprint'THEN 64 WHEN key='weekly_off_day'THEN 50 ELSE 500 END)THEN RAISE EXCEPTION 'Invalid Time wording' USING ERRCODE='23514';END IF;
   IF(key='correction_reason'OR key='reason'AND p_action IN('query','reject','cancel'))AND btrim(value#>>'{}')=''THEN RAISE EXCEPTION 'Reason required' USING ERRCODE='23514';END IF;
  END IF;
 END LOOP;
 IF p_data?'fingerprint'AND(p_data->>'fingerprint')!~'^[0-9a-f]{64}$'OR p_data?'end_date'AND(p_data->>'end_date')::date<(p_data->>'start_date')::date OR p_data->>'effective_to'IS NOT NULL AND(p_data->>'effective_to')::date<(p_data->>'effective_from')::date THEN RAISE EXCEPTION 'Invalid Time chronology or fingerprint' USING ERRCODE='23514';END IF;
 IF p_data?'attendance_type'AND NOT(p_data->>'attendance_type'=ANY(ARRAY['site','office','yard','workshop','remote','on_leave','absent','holiday']))OR p_data?'punch_type'AND NOT(p_data->>'punch_type'=ANY(ARRAY['in','out','break_start','break_end']))OR p_data?'punch_source'AND NOT(p_data->>'punch_source'=ANY(ARRAY['biometric','mobile','manual','import']))THEN RAISE EXCEPTION 'Invalid Time selection' USING ERRCODE='23514';END IF;
END$$;
CREATE FUNCTION public.f11_leave_balance_opening(p_employee bigint,p_id bigint)RETURNS text LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE balance public.employee_leave_balances;result text;BEGIN
 IF NOT erp_private.f11_child_authorized('leave-balance',p_employee)THEN RAISE EXCEPTION 'Current leave authority required' USING ERRCODE='42501';END IF;
 SELECT *INTO balance FROM public.employee_leave_balances WHERE id=p_id AND employee_id=p_employee;IF NOT FOUND THEN RAISE EXCEPTION 'Original balance unavailable' USING ERRCODE='42501';END IF;
 SELECT encode(sha256(convert_to(jsonb_build_array(to_jsonb(balance),coalesce((SELECT jsonb_agg(jsonb_build_array(id,workspace_revision,start_date,total_days,approval_status,deleted_at)ORDER BY id)FROM public.employee_leave_requests WHERE employee_id=p_employee AND leave_type_id=balance.leave_type_id),'[]'::jsonb))::text,'UTF8')),'hex')INTO result;RETURN result;
END$$;
CREATE FUNCTION erp_private.f11_capture_time_child()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE context jsonb:=nullif(current_setting('erp.f11_child_save',true),'')::jsonb;kind text;action text;actor bigint:=public.current_user_profile_id();subject record;changed text[];values jsonb;subsidiary boolean;BEGIN
 kind:=CASE TG_TABLE_NAME WHEN'employee_attendance_daily_summary'THEN'attendance-summary'WHEN'employee_attendance_punches'THEN'attendance-punch'WHEN'employee_shift_assignments'THEN'shift-assignment'WHEN'employee_leave_requests'THEN'leave-request'WHEN'employee_leave_balances'THEN'leave-balance'WHEN'employee_overtime_records'THEN'overtime'END;
 IF auth.uid()IS NULL AND current_user='postgres'THEN RETURN NEW;END IF;
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
  ELSIF action='query'AND kind='attendance-summary'THEN changed:=ARRAY['approval_status','notes'];IF OLD.approval_status<>'pending'OR NEW.approval_status<>'queried'THEN RAISE EXCEPTION 'Attendance no longer pending' USING ERRCODE='23514';END IF;
  ELSIF action='approve'AND kind IN('attendance-summary','leave-request','overtime')THEN changed:=ARRAY['approval_status','approved_by','approved_at'];IF OLD.approval_status<>'pending'OR NEW.approval_status<>'approved'OR NEW.approved_by IS DISTINCT FROM actor OR NEW.approved_at IS NULL THEN RAISE EXCEPTION 'Invalid Time approval' USING ERRCODE='23514';END IF;
  ELSIF action='reject'AND kind IN('leave-request','overtime')THEN changed:=ARRAY['approval_status','notes','rejected_by','rejected_at'];IF OLD.approval_status<>'pending'OR NEW.approval_status<>'rejected'THEN RAISE EXCEPTION 'Invalid Time rejection' USING ERRCODE='23514';END IF;
  ELSIF action='cancel'AND kind='leave-request'THEN changed:=ARRAY['approval_status','notes','cancelled_by','cancelled_at'];IF OLD.approval_status NOT IN('pending','approved')OR NEW.approval_status<>'cancelled'THEN RAISE EXCEPTION 'Invalid Time cancellation' USING ERRCODE='23514';END IF;
  ELSIF action='archive'AND kind IN('shift-assignment','leave-request','overtime')THEN changed:=ARRAY['deleted_at','deleted_by'];IF to_jsonb(NEW)->>'deleted_at'IS NULL THEN RAISE EXCEPTION 'Invalid Time archive' USING ERRCODE='23514';END IF;
  ELSIF action='recalculate'AND kind='leave-balance'THEN changed:=ARRAY['used_days','balance_days'];
  ELSE RAISE EXCEPTION 'Unsupported Time transition' USING ERRCODE='23514';END IF;
  IF kind='leave-balance'AND action='update'THEN changed:=changed||ARRAY['balance_days'];END IF;
  IF kind IN('leave-request','overtime')AND action='update'AND OLD.approval_status<>'pending'THEN RAISE EXCEPTION 'Decided Time records are not editable' USING ERRCODE='23514';END IF;
  changed:=changed||ARRAY['workspace_revision','updated_at','updated_by'];IF(to_jsonb(NEW)-changed)IS DISTINCT FROM(to_jsonb(OLD)-changed)THEN RAISE EXCEPTION 'Unrendered Time facts changed' USING ERRCODE='23514';END IF;
 END IF;
 SELECT owner_company_id,branch_id INTO subject FROM public.employees WHERE id=NEW.employee_id;
 IF NOT subsidiary THEN INSERT INTO erp_private.f11_child_receipts(actor,operation_id,kind,action,employee_id,record_id,revision,request_hash)VALUES(auth.uid(),(context->>'operation_id')::uuid,kind,action,NEW.employee_id,NEW.id,NEW.workspace_revision,context->>'hash');END IF;
 INSERT INTO public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,action,new_values)VALUES(actor,subject.owner_company_id,subject.branch_id,'HR',TG_TABLE_NAME,NEW.id,CASE WHEN subsidiary THEN'linked_time_change'ELSE action END,jsonb_build_object('operation_id',context->>'operation_id','employee_id',NEW.employee_id,'revision',NEW.workspace_revision));RETURN NEW;
END$$;
DO $$DECLARE name text;BEGIN FOREACH name IN ARRAY ARRAY['employee_attendance_daily_summary','employee_attendance_punches','employee_shift_assignments','employee_leave_requests','employee_leave_balances','employee_overtime_records']LOOP EXECUTE format('CREATE TRIGGER f11_time_child_capture AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION erp_private.f11_capture_time_child()',name);END LOOP;END$$;
CREATE FUNCTION public.f11_mutate_time_child(p_kind text,p_employee bigint,p_id bigint,p_revision bigint,p_operation uuid,p_action text,p_data jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
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
  IF p_data->>'work_calendar_id'IS NOT NULL AND p_data->>'work_calendar_id'IS DISTINCT FROM existing->>'work_calendar_id'AND NOT EXISTS(SELECT 1 FROM public.work_calendars WHERE id=(p_data->>'work_calendar_id')::bigint AND is_active AND deleted_at IS NULL)THEN RAISE EXCEPTION 'Current calendar unavailable' USING ERRCODE='23514';END IF;
  IF p_data->>'work_shift_id'IS NOT NULL AND(NOT EXISTS(SELECT 1 FROM public.work_shifts WHERE id=(p_data->>'work_shift_id')::bigint AND(p_data->>'work_calendar_id'IS NULL OR calendar_id=(p_data->>'work_calendar_id')::bigint))OR p_data->>'work_shift_id'IS DISTINCT FROM existing->>'work_shift_id'AND NOT EXISTS(SELECT 1 FROM public.work_shifts WHERE id=(p_data->>'work_shift_id')::bigint AND is_active AND deleted_at IS NULL))THEN RAISE EXCEPTION 'Current compatible shift unavailable' USING ERRCODE='23514';END IF;
 END IF;
 context:=jsonb_build_object('kind',p_kind,'employee_id',p_employee,'id',p_id,'revision',p_revision,'operation_id',p_operation,'action',p_action,'hash',digest,'correction_reason',p_data->>'correction_reason');PERFORM set_config('erp.f11_child_save',context::text,true);
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
 RETURN jsonb_build_object('kind',p_kind,'employee_id',p_employee,'id',target,'revision',revision::text,'operation_id',p_operation,'replayed',false);
END$$;
REVOKE ALL ON FUNCTION erp_private.f11_time_columns(text),erp_private.f11_validate_time(text,text,jsonb),erp_private.f11_capture_time_child(),public.f11_leave_balance_opening(bigint,bigint),public.f11_mutate_time_child(text,bigint,bigint,bigint,uuid,text,jsonb)FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f11_time_columns(text),erp_private.f11_validate_time(text,text,jsonb),public.f11_leave_balance_opening(bigint,bigint),public.f11_mutate_time_child(text,bigint,bigint,bigint,uuid,text,jsonb)TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
