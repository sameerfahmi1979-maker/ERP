BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Additive safety boundary only. No historical rewrite, employee termination,
-- account revocation, role grant, external sign-off or invented settlement.
CREATE FUNCTION erp_private.f12_employee_service_boundary() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RETURN NEW; END IF;
 IF NOT erp_private.business_principal_is_active() THEN
   RAISE EXCEPTION 'Current scoped service access required' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME='employee_eos_cases' THEN
   IF NEW.notice_date IS NOT NULL AND NEW.last_working_date IS NOT NULL
      AND NEW.last_working_date < NEW.notice_date THEN
     RAISE EXCEPTION 'Last working date cannot precede notice date' USING ERRCODE='23514';
   END IF;
   IF NEW.case_status='closed' AND (TG_OP='INSERT' OR OLD.case_status IS DISTINCT FROM 'closed') THEN
     RAISE EXCEPTION 'Full separation closure is held: approved Finance settlement and clearance authority are not configured' USING ERRCODE='23514';
   END IF;
 ELSIF TG_TABLE_NAME='employee_clearance_items' THEN
   IF TG_OP='UPDATE' AND OLD.clearance_area<>'hr' AND NEW.clearance_area='hr' THEN
     RAISE EXCEPTION 'Owner clearance cannot be relabelled as HR clearance' USING ERRCODE='23514';
   END IF;
   IF NEW.item_status IN ('cleared','not_applicable') AND
      (TG_OP='INSERT' OR NEW.item_status IS DISTINCT FROM OLD.item_status OR NEW.clearance_area IS DISTINCT FROM OLD.clearance_area) AND
      (NEW.clearance_area<>'hr' OR (TG_OP='UPDATE' AND OLD.clearance_area<>'hr')) THEN
     RAISE EXCEPTION 'Owner clearance is held: HR cannot certify IT, stock, resource or Finance actions without verified source authority' USING ERRCODE='23514';
   END IF;
 ELSE RAISE EXCEPTION 'Unsupported service boundary';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION erp_private.f12_employee_service_boundary() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f12_eos_service_boundary BEFORE INSERT OR UPDATE ON public.employee_eos_cases
 FOR EACH ROW EXECUTE FUNCTION erp_private.f12_employee_service_boundary();
CREATE TRIGGER f12_clearance_service_boundary BEFORE INSERT OR UPDATE ON public.employee_clearance_items
 FOR EACH ROW EXECUTE FUNCTION erp_private.f12_employee_service_boundary();
COMMIT;
