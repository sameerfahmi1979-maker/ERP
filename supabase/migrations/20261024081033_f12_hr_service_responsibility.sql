BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
-- Reuse the existing HR task, assignee, due date, revision and receipt model.
-- PRO and general HR tasks require the identical hr.actions.view/manage pair;
-- reuse that current-person authority predicate, not renewal business semantics.
CREATE FUNCTION erp_private.f12_hr_service_boundary() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE advancing boolean;
BEGIN
 IF auth.uid() IS NULL THEN RETURN NEW;END IF;
 advancing:=NEW.action_status IN ('in_progress','closed') AND (TG_OP='INSERT'
  OR NEW.action_status IS DISTINCT FROM OLD.action_status
  OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
  OR NEW.due_date IS DISTINCT FROM OLD.due_date
  OR NEW.action_date IS DISTINCT FROM OLD.action_date);
 IF advancing AND (NEW.assigned_to IS NULL OR NOT erp_private.f12_review_person(NEW.assigned_to,'pro-process',NEW.employee_id,false)
  OR NEW.due_date IS NULL OR NEW.due_date<NEW.action_date) THEN
   RAISE EXCEPTION 'Assign a currently authorized HR user and a valid due date before progressing or closing this task' USING ERRCODE='23514';
 END IF;
 IF NEW.assigned_to IS NOT NULL AND (TG_OP='INSERT' OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to)
  AND NOT erp_private.f12_review_person(NEW.assigned_to,'pro-process',NEW.employee_id,false) THEN
   RAISE EXCEPTION 'The selected HR task owner is not currently authorized for this employee' USING ERRCODE='23514';
 END IF;
 IF NEW.action_status='closed' AND (TG_OP='INSERT' OR OLD.action_status IS DISTINCT FROM 'closed') AND NEW.requires_approval THEN
   RAISE EXCEPTION 'This task requires source-bound approval mapping review before closure' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION erp_private.f12_hr_service_boundary() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f12_hr_service_boundary BEFORE INSERT OR UPDATE ON public.employee_hr_actions
 FOR EACH ROW EXECUTE FUNCTION erp_private.f12_hr_service_boundary();
DO $adoption$
DECLARE signature regprocedure; original text; changed text; definition text; expected text;
BEGIN
 FOREACH signature IN ARRAY ARRAY['public.f11_mutate_hr_action(text,bigint,bigint,bigint,uuid,text,jsonb)'::regprocedure,'erp_private.f11_capture_hr_action()'::regprocedure] LOOP
  SELECT prosrc,pg_get_functiondef(oid) INTO original,definition FROM pg_proc WHERE oid=signature;
  expected:=CASE signature WHEN 'erp_private.f11_capture_hr_action()'::regprocedure THEN 'a2138272508c21ca2996aded513a6d155f7f906f80ed02939e670a61e28c8d09' ELSE '663014b21332a528fc5aadebb05b94447bfb4fe01d74e038c12a665865441d61' END;
  IF encode(sha256(convert_to(original,'UTF8')),'hex')<>expected THEN RAISE EXCEPTION 'Unreviewed HR action predecessor';END IF;
  IF signature='erp_private.f11_capture_hr_action()'::regprocedure THEN
   changed:=replace(original,'''due_date'',''notes'',''updated_by''','''due_date'',''assigned_to'',''notes'',''updated_by''');
  ELSE
   changed:=replace(original,'v_due_date date;','v_due_date date;v_owner bigint;');
   changed:=replace(changed,'''due_date'',''notes'']','''due_date'',''assigned_to'',''notes'']');
   changed:=replace(changed,$old$v_due_date:=(p_data->>'due_date')::date;$old$,
    $new$v_due_date:=(p_data->>'due_date')::date;
  IF p_data?'assigned_to' AND (jsonb_typeof(p_data->'assigned_to') NOT IN ('number','null') OR (p_data->>'assigned_to' IS NOT NULL AND ((p_data->>'assigned_to')!~'^[1-9][0-9]*$' OR (p_data->>'assigned_to')::numeric>9007199254740991))) THEN RAISE EXCEPTION 'Invalid HR task owner identity' USING ERRCODE='22023';END IF;
  v_owner:=(p_data->>'assigned_to')::bigint;$new$);
   changed:=replace(changed,'action_date,due_date,notes,created_by','action_date,due_date,assigned_to,notes,created_by');
   changed:=replace(changed,'status,v_action_date,v_due_date,p_data','status,v_action_date,v_due_date,v_owner,p_data');
   changed:=replace(changed,'due_date=v_due_date,notes=', 'due_date=v_due_date,assigned_to=CASE WHEN p_data?''assigned_to'' THEN v_owner ELSE x.assigned_to END,notes=');
  END IF;
  IF changed=original OR strpos(changed,'assigned_to')=0 THEN RAISE EXCEPTION 'Missing reviewed responsibility adoption anchor';END IF;
  EXECUTE replace(definition,original,changed);
 END LOOP;
END;
$adoption$;
NOTIFY pgrst,'reload schema';
COMMIT;
