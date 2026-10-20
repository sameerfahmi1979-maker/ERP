-- Retain F06's proven creation origin in F11's canonical employment journal.
-- A caller-set GUC alone cannot choose the origin or manufacture a proof.
BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
CREATE OR REPLACE FUNCTION erp_private.f11_capture_employment_event() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous jsonb;current_facts jsonb;context jsonb;why text;effective date;
 source_operation uuid;source_candidate_code text;
 keys text[]:=ARRAY['owner_company_id','branch_id','department_id','designation_id','employee_category_id','employment_type_id','employee_status','joining_date','actual_joining_date','reporting_manager_id','supervisor_id','primary_work_site_id','sponsor_company_id','mohre_establishment_id','contract_type','contract_start_date','contract_end_date','probation_start_date','probation_end_date','notice_period_days','inactive_date','inactive_reason','deleted_at'];
BEGIN
 SELECT jsonb_object_agg(k,to_jsonb(NEW)->k) INTO current_facts FROM unnest(keys)k;
 IF TG_OP='UPDATE' THEN
  SELECT jsonb_object_agg(k,to_jsonb(OLD)->k) INTO previous FROM unnest(keys)k;
  IF previous=current_facts THEN RETURN NEW;END IF;
  context:=nullif(current_setting('erp.f11_employment_change',true),'')::jsonb;
  why:=nullif(btrim(context->>'reason'),'');effective:=(context->>'effective_date')::date;
  IF why IS NULL OR length(why)>2000 OR effective IS NULL THEN
   RAISE EXCEPTION 'Employment changes require a reason and effective date' USING ERRCODE='23514';END IF;
  IF effective>(statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date THEN
   RAISE EXCEPTION 'Future changes cannot replace current employment facts; save them when effective' USING ERRCODE='23514';END IF;
 ELSE
  why:='Employee created';effective:=NEW.joining_date;
  -- F06's earlier AFTER INSERT triggers have already proved an actual new
  -- employee, current actor, exact transaction, reviewed source and number.
  SELECT p.operation_id INTO source_operation
   FROM erp_private.document_employee_insert_proofs p
   WHERE p.actor=auth.uid() AND p.employee_id=NEW.id
    AND p.transaction_id=pg_current_xact_id();
  IF FOUND THEN
   why:='Employee created from DMS documents (HR.14A)';
  ELSE
   SELECT p.operation_id,p.source_json->>'candidate_code'
    INTO source_operation,source_candidate_code
    FROM erp_private.recruitment_consumer_proofs p
    WHERE p.actor=auth.uid() AND p.actor_id=public.current_user_profile_id()
     AND p.target_id=NEW.id AND p.kind='conversion'
     AND p.transaction_id=pg_current_xact_id();
   IF FOUND THEN why:='Converted from candidate '||coalesce(source_candidate_code,'');END IF;
  END IF;
 END IF;
 INSERT INTO public.employee_employment_events(employee_id,operation_id,old_values,new_values,reason,effective_date,created_by,revision)
 VALUES(NEW.id,coalesce(source_operation,(nullif(current_setting('erp.workspace_save',true),'')::jsonb->>'operation_id')::uuid),previous,current_facts,why,effective,public.current_user_profile_id(),NEW.workspace_revision);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.f11_capture_employment_event() FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
