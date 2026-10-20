BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
-- A narrow definer is needed to reconcile a completed soft-delete after ordinary
-- employee SELECT policies correctly stop exposing that row. Every call checks
-- the current principal and BOTH archive and write scope, including replays.
CREATE FUNCTION erp_private.f11_archive_employee(p_operation uuid,p_id bigint,p_revision bigint,p_reason text,p_effective date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e record; receipt jsonb; digest text; actor bigint;
BEGIN
 IF auth.uid() IS NULL OR NOT erp_private.business_principal_is_active() THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501';END IF;
 IF p_operation IS NULL OR p_id IS NULL OR p_id<=0 OR p_revision IS NULL OR p_revision<1 OR nullif(btrim(p_reason),'') IS NULL OR length(p_reason)>2000 OR p_effective IS NULL OR p_effective>(statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date THEN RAISE EXCEPTION 'Invalid archive contract' USING ERRCODE='22023';END IF;
 digest:=encode(sha256(convert_to(jsonb_build_array('f11_employee_archive',p_id,p_revision,p_reason,p_effective)::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_operation::text,0));
 SELECT id,owner_company_id,branch_id,employee_code,employee_status,workspace_revision,deleted_at INTO e FROM public.employees WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR NOT erp_private.permission_in_scope('hr.employees.archive',e.owner_company_id,e.branch_id) OR NOT (erp_private.permission_in_scope('hr.employees.update',e.owner_company_id,e.branch_id) OR erp_private.permission_in_scope('hr.employee_profile.manage',e.owner_company_id,e.branch_id)) THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501';END IF;
 receipt:=erp_private.workspace_receipt_read(p_operation);
 IF receipt IS NOT NULL THEN
  IF receipt->>'entity'<>'employees' OR receipt->>'hash'<>digest OR (receipt->>'id')::bigint<>p_id THEN RAISE EXCEPTION 'Operation already used for different input' USING ERRCODE='22023';END IF;
  RETURN jsonb_build_object('id',p_id,'revision',receipt->>'revision','replayed',true);
 END IF;
 IF e.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Employee unavailable' USING ERRCODE='42501';END IF;
 IF e.workspace_revision<>p_revision THEN RAISE EXCEPTION 'Employee changed; reopen before archiving' USING ERRCODE='P0409';END IF;
 actor:=public.current_user_profile_id();
 PERFORM set_config('erp.f11_employment_change',jsonb_build_object('reason',p_reason,'effective_date',p_effective)::text,true);
 PERFORM set_config('erp.workspace_save',jsonb_build_object('operation_id',p_operation,'entity','employees','hash',digest)::text,true);
 UPDATE public.employees SET deleted_at=clock_timestamp(),deleted_by=actor,employee_status='archived',inactive_date=p_effective,inactive_reason=p_reason,updated_by=actor WHERE id=p_id;
 INSERT INTO public.employee_status_events(employee_id,old_status,new_status,reason,effective_date,created_by) VALUES(p_id,e.employee_status,'archived',p_reason,p_effective,actor);
 INSERT INTO public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
 VALUES(actor,e.owner_company_id,e.branch_id,'HR','employees',p_id,e.employee_code,'archive',jsonb_build_object('operation_id',p_operation,'revision',e.workspace_revision+1));
 PERFORM set_config('erp.workspace_save','',true);PERFORM set_config('erp.f11_employment_change','',true);
 RETURN jsonb_build_object('id',p_id,'revision',(e.workspace_revision+1)::text,'replayed',false);
END $$;
CREATE FUNCTION public.f11_archive_employee(p_operation uuid,p_id bigint,p_revision bigint,p_reason text,p_effective date)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT erp_private.f11_archive_employee(p_operation,p_id,p_revision,p_reason,p_effective)$$;
REVOKE ALL ON FUNCTION public.f11_archive_employee(uuid,bigint,bigint,text,date),erp_private.f11_archive_employee(uuid,bigint,bigint,text,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.f11_archive_employee(uuid,bigint,bigint,text,date),erp_private.f11_archive_employee(uuid,bigint,bigint,text,date) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
