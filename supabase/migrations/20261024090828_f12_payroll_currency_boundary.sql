BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
-- No historical normalization, FX conversion or reinterpretation of existing
-- numeric components/effects. Legacy unsupported currency stays review-held.
CREATE FUNCTION erp_private.f12_payroll_currency_boundary()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN
 IF auth.uid()IS NULL THEN RETURN NEW;END IF;
 IF NOT erp_private.f11_child_authorized('payroll-profile',NEW.employee_id)THEN RAISE EXCEPTION 'Current salary profile authority required' USING ERRCODE='42501';END IF;
 IF(TG_OP='INSERT'OR NEW.currency IS DISTINCT FROM OLD.currency)AND(NEW.currency IS NULL OR NEW.currency!~'^[A-Z]{3}$')THEN
  RAISE EXCEPTION 'Use an uppercase three-letter payroll currency code' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE'AND NEW.currency IS DISTINCT FROM OLD.currency AND(
  EXISTS(SELECT 1 FROM public.employee_salary_components c WHERE c.employee_id=NEW.employee_id)
  OR EXISTS(SELECT 1 FROM public.employee_salary_revision_effects e WHERE e.employee_id=NEW.employee_id)
  OR EXISTS(SELECT 1 FROM public.employee_salary_revisions r WHERE r.employee_id=NEW.employee_id))THEN
  RAISE EXCEPTION 'Payroll currency change is held: existing salary history needs verified currency provenance, not automatic conversion' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION erp_private.f12_payroll_currency_boundary()FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f12_payroll_currency_boundary BEFORE INSERT OR UPDATE ON public.employee_payroll_profiles FOR EACH ROW EXECUTE FUNCTION erp_private.f12_payroll_currency_boundary();
NOTIFY pgrst,'reload schema';
COMMIT;
