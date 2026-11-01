-- Owner decision: contact details must not prevent employee creation.
-- Existing values, RLS, approvals, numbering, source/receipt proofs and all
-- identity/employment requirements are preserved. No business-row updates.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

ALTER TABLE public.employees ALTER COLUMN mobile_number SET DEFAULT '',
  ALTER COLUMN emergency_contact_name SET DEFAULT '',
  ALTER COLUMN emergency_contact_mobile SET DEFAULT '';

DO $repair$
DECLARE definition text; changed text; target regprocedure; old_text text; new_text text;
BEGIN
 target:='erp_private.f11_guard_employee_facts()'::regprocedure;
 definition:=pg_get_functiondef(target);
 old_text:=$old$ARRAY['full_name_en','mobile_number','emergency_contact_name','emergency_contact_mobile']$old$;
 new_text:=$new$ARRAY['full_name_en']$new$;
 IF (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 THEN
  RAISE EXCEPTION 'Employee guard changed: review before applying'; END IF;
 EXECUTE replace(definition,old_text,new_text);

 target:='erp_private.validate_document_employee_input(jsonb,jsonb)'::regprocedure;
 definition:=pg_get_functiondef(target);
 old_text:=$old$v_required:=array['full_name_en','gender','date_of_birth','mobile_number','owner_company_id','joining_date','emergency_contact_name','emergency_contact_mobile','totalDocumentsSelected'];$old$;
 new_text:=$new$v_required:=array['full_name_en','gender','date_of_birth','owner_company_id','joining_date','totalDocumentsSelected'];$new$;
 IF (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 THEN
  RAISE EXCEPTION 'Document validation changed: review before applying'; END IF;
 EXECUTE replace(definition,old_text,new_text);

 -- Blank contact values are not evidence of duplicate people. Both the
 -- writer and immutable receipt verifier must derive identical warnings.
 FOREACH target IN ARRAY ARRAY['public.create_numbered_document_employee(uuid,jsonb,jsonb)'::regprocedure,
   'erp_private.capture_document_employee_receipt()'::regprocedure] LOOP
  definition:=pg_get_functiondef(target);
  IF target='public.create_numbered_document_employee(uuid,jsonb,jsonb)'::regprocedure THEN
   old_text:=$old$if exists(select 1 from public.employees e where e.deleted_at is null and e.mobile_number=p_data->>'mobile_number')$old$;
   new_text:=$new$if nullif(btrim(p_data->>'mobile_number'),'') is not null and exists(select 1 from public.employees e where e.deleted_at is null and e.mobile_number=p_data->>'mobile_number')$new$;
  ELSE
   old_text:=$old$if exists(select 1 from public.employees e where e.id<>v_employee.id and e.deleted_at is null and public.current_user_can_view_employee(e.id) and e.mobile_number=v_data->>'mobile_number')$old$;
   new_text:=$new$if nullif(btrim(v_data->>'mobile_number'),'') is not null and exists(select 1 from public.employees e where e.id<>v_employee.id and e.deleted_at is null and public.current_user_can_view_employee(e.id) and e.mobile_number=v_data->>'mobile_number')$new$;
  END IF;
  changed:=replace(definition,old_text,new_text);
  IF (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 THEN
   RAISE EXCEPTION 'Document duplicate/receipt rule changed: review before applying'; END IF;
  EXECUTE changed;
 END LOOP;
END $repair$;
NOTIFY pgrst,'reload schema';
COMMIT;
