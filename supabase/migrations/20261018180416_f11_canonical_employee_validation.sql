-- One native creation invariant for manual, numbered DMS and existing
-- recruitment callers. Additive: do not rewrite historical employee facts.
BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
CREATE FUNCTION erp_private.f11_guard_employee_facts() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE facts jsonb:=to_jsonb(NEW);before_facts jsonb;key text;conversion jsonb;
BEGIN
 IF TG_OP='UPDATE' THEN before_facts:=to_jsonb(OLD);END IF;
 FOREACH key IN ARRAY ARRAY['full_name_en','mobile_number','emergency_contact_name','emergency_contact_mobile'] LOOP
  IF (TG_OP='INSERT' OR facts->key IS DISTINCT FROM before_facts->key) AND nullif(btrim(facts->>key),'') IS NULL THEN
   RAISE EXCEPTION 'Required verified employee fact is missing: %',key USING ERRCODE='23514';END IF;
 END LOOP;
 IF TG_OP='INSERT' AND (NEW.employee_category_id IS NULL OR NEW.gender IS NULL OR NEW.date_of_birth IS NULL OR NEW.joining_date IS NULL OR NEW.owner_company_id IS NULL) THEN
  RAISE EXCEPTION 'Category, identity, employer and joining date are required for a new employee' USING ERRCODE='23514';END IF;
 IF TG_OP='UPDATE' AND OLD.employee_category_id IS NOT NULL AND NEW.employee_category_id IS NULL THEN
  RAISE EXCEPTION 'An assigned employee category cannot be cleared' USING ERRCODE='23514';END IF;
 IF TG_OP='UPDATE' AND NEW.employee_code IS DISTINCT FROM OLD.employee_code THEN
  RAISE EXCEPTION 'Employee numbering is immutable' USING ERRCODE='42501';END IF;
 IF NEW.date_of_birth>NEW.joining_date AND (TG_OP='INSERT' OR NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth OR NEW.joining_date IS DISTINCT FROM OLD.joining_date) THEN
  RAISE EXCEPTION 'Joining date cannot precede birth date' USING ERRCODE='23514';END IF;
 IF NEW.contract_start_date>NEW.contract_end_date AND (TG_OP='INSERT' OR NEW.contract_start_date IS DISTINCT FROM OLD.contract_start_date OR NEW.contract_end_date IS DISTINCT FROM OLD.contract_end_date) THEN
  RAISE EXCEPTION 'Contract dates are inverted' USING ERRCODE='23514';END IF;
 IF NEW.probation_start_date>NEW.probation_end_date AND (TG_OP='INSERT' OR NEW.probation_start_date IS DISTINCT FROM OLD.probation_start_date OR NEW.probation_end_date IS DISTINCT FROM OLD.probation_end_date) THEN
  RAISE EXCEPTION 'Probation dates are inverted' USING ERRCODE='23514';END IF;
 IF TG_OP='INSERT' THEN
  conversion:=nullif(current_setting('erp.recruitment_consumer',true),'')::jsonb;
  IF conversion->>'kind'='conversion' AND NOT EXISTS(SELECT 1 FROM public.hr_candidates c WHERE c.id=(conversion->>'candidate_id')::bigint AND c.deleted_at IS NULL AND c.gender IS NOT NULL AND c.date_of_birth IS NOT NULL AND nullif(btrim(c.mobile_number),'') IS NOT NULL) THEN
   RAISE EXCEPTION 'Complete verified candidate identity/contact facts before employee creation; placeholders are not accepted' USING ERRCODE='23514';END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.f11_guard_employee_facts() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f11_employee_facts BEFORE INSERT OR UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION erp_private.f11_guard_employee_facts();
NOTIFY pgrst,'reload schema';
COMMIT;
