BEGIN;
CREATE OR REPLACE FUNCTION erp_private.f11_admit_time_operation(p_context jsonb,p_data jsonb)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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

 IF kind IN('leave-request','leave-balance')AND action IN('create','update')AND p_data->>'leave_type_id'IS DISTINCT FROM original->>'leave_type_id'AND NOT EXISTS(SELECT 1 FROM public.hr_leave_types WHERE id=(p_data->>'leave_type_id')::bigint AND is_active AND deleted_at IS NULL)THEN RAISE EXCEPTION 'Current leave type unavailable' USING ERRCODE='23514';END IF;
 IF kind='shift-assignment'AND action IN('create','update')THEN
  IF p_data->>'work_calendar_id'IS NOT NULL AND p_data->>'work_calendar_id'IS DISTINCT FROM original->>'work_calendar_id'AND NOT EXISTS(SELECT 1 FROM public.work_calendars WHERE id=(p_data->>'work_calendar_id')::bigint AND is_active AND deleted_at IS NULL AND(owner_company_id IS NULL OR owner_company_id=(SELECT owner_company_id FROM public.employees WHERE id=employee)))THEN RAISE EXCEPTION 'Current employee-company calendar unavailable' USING ERRCODE='23514';END IF;
  IF p_data->>'work_shift_id'IS NOT NULL AND(NOT EXISTS(SELECT 1 FROM public.work_shifts WHERE id=(p_data->>'work_shift_id')::bigint AND(p_data->>'work_calendar_id'IS NULL OR calendar_id=(p_data->>'work_calendar_id')::bigint))OR p_data->>'work_shift_id'IS DISTINCT FROM original->>'work_shift_id'AND NOT EXISTS(SELECT 1 FROM public.work_shifts WHERE id=(p_data->>'work_shift_id')::bigint AND is_active AND deleted_at IS NULL AND EXISTS(SELECT 1 FROM public.work_calendars c WHERE c.id=calendar_id AND(c.owner_company_id IS NULL OR c.owner_company_id=(SELECT owner_company_id FROM public.employees WHERE id=employee)))))THEN RAISE EXCEPTION 'Current employee-company shift unavailable' USING ERRCODE='23514';END IF;
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
COMMIT;
