BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
-- A real write serializes hierarchy changes at READ COMMITTED and forces a
-- serialization failure rather than stale-snapshot acceptance at REPEATABLE
-- READ. Advisory locks alone do not refresh a repeatable-read snapshot.
CREATE TABLE erp_private.f11_hierarchy_serial(company_id bigint PRIMARY KEY,revision bigint NOT NULL DEFAULT 1);
ALTER TABLE erp_private.f11_hierarchy_serial ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.f11_hierarchy_serial FROM PUBLIC,anon,authenticated,service_role;
-- Constraint-only trigger: checks references without returning inaccessible
-- lookup/employee data. Employee INSERT/UPDATE RLS and field guards still apply.
CREATE FUNCTION erp_private.f11_employee_relationships() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE destination_changed boolean:=TG_OP='INSERT'; changed boolean; cycle_found boolean; hierarchy_company bigint;
BEGIN
 IF TG_OP='UPDATE' THEN destination_changed:=ROW(NEW.owner_company_id,NEW.branch_id) IS DISTINCT FROM ROW(OLD.owner_company_id,OLD.branch_id);END IF;
 IF auth.uid() IS NOT NULL AND ((TG_OP='INSERT' AND(NEW.deleted_at IS NOT NULL OR NEW.employee_status='archived')) OR(TG_OP='UPDATE' AND((NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL) OR(NEW.employee_status='archived' AND OLD.employee_status<>'archived')))) AND NOT erp_private.permission_in_scope('hr.employees.archive',NEW.owner_company_id,NEW.branch_id) THEN RAISE EXCEPTION 'Archive permission is required' USING ERRCODE='42501';END IF;
 IF (TG_OP='INSERT' OR NEW.owner_company_id IS DISTINCT FROM OLD.owner_company_id) AND NOT EXISTS(SELECT 1 FROM public.owner_companies c WHERE c.id=NEW.owner_company_id AND c.status='active') THEN RAISE EXCEPTION 'Select an active employer' USING ERRCODE='23514';END IF;
 IF NEW.branch_id IS NOT NULL AND(destination_changed OR NEW.branch_id IS DISTINCT FROM OLD.branch_id) AND NOT EXISTS(SELECT 1 FROM public.branches b WHERE b.id=NEW.branch_id AND b.owner_company_id=NEW.owner_company_id AND b.status='active') THEN RAISE EXCEPTION 'Branch must belong to the selected employer' USING ERRCODE='23514';END IF;
 IF NEW.department_id IS NOT NULL AND(destination_changed OR NEW.department_id IS DISTINCT FROM OLD.department_id) AND NOT EXISTS(SELECT 1 FROM public.departments d WHERE d.id=NEW.department_id AND d.owner_company_id=NEW.owner_company_id AND(d.branch_id IS NULL OR d.branch_id=NEW.branch_id) AND d.deleted_at IS NULL AND d.is_active AND(d.effective_from IS NULL OR d.effective_from<=(statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date) AND(d.effective_to IS NULL OR d.effective_to>=(statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date)) THEN RAISE EXCEPTION 'Department is not an active choice for this employer and branch' USING ERRCODE='23514';END IF;
 IF NEW.designation_id IS NOT NULL AND(destination_changed OR NEW.department_id IS DISTINCT FROM OLD.department_id OR NEW.designation_id IS DISTINCT FROM OLD.designation_id) AND NOT EXISTS(SELECT 1 FROM public.designations d WHERE d.id=NEW.designation_id AND(d.owner_company_id IS NULL OR d.owner_company_id=NEW.owner_company_id) AND(d.department_id IS NULL OR d.department_id=NEW.department_id) AND d.deleted_at IS NULL AND d.is_active) THEN RAISE EXCEPTION 'Designation does not match the selected employer and department' USING ERRCODE='23514';END IF;
 IF NEW.primary_work_site_id IS NOT NULL AND(destination_changed OR NEW.primary_work_site_id IS DISTINCT FROM OLD.primary_work_site_id) AND NOT EXISTS(SELECT 1 FROM public.work_sites s WHERE s.id=NEW.primary_work_site_id AND s.owner_company_id=NEW.owner_company_id AND(s.branch_id IS NULL OR s.branch_id=NEW.branch_id) AND s.deleted_at IS NULL AND s.status='active') THEN RAISE EXCEPTION 'Work site does not match the selected employer and branch' USING ERRCODE='23514';END IF;
 IF NEW.mohre_establishment_id IS NOT NULL AND(destination_changed OR NEW.mohre_establishment_id IS DISTINCT FROM OLD.mohre_establishment_id) AND NOT EXISTS(SELECT 1 FROM public.hr_mohre_establishments m WHERE m.id=NEW.mohre_establishment_id AND m.owner_company_id=NEW.owner_company_id AND m.deleted_at IS NULL AND m.status='active') THEN RAISE EXCEPTION 'MOHRE establishment must match the selected employer' USING ERRCODE='23514';END IF;
 IF NEW.employee_category_id IS NOT NULL AND(TG_OP='INSERT' OR NEW.employee_category_id IS DISTINCT FROM OLD.employee_category_id) AND NOT EXISTS(SELECT 1 FROM public.hr_employee_categories c WHERE c.id=NEW.employee_category_id AND c.deleted_at IS NULL AND c.is_active) THEN RAISE EXCEPTION 'Select an active employee category' USING ERRCODE='23514';END IF;
 IF NEW.employment_type_id IS NOT NULL AND(TG_OP='INSERT' OR NEW.employment_type_id IS DISTINCT FROM OLD.employment_type_id) AND NOT EXISTS(SELECT 1 FROM public.hr_employment_types c WHERE c.id=NEW.employment_type_id AND c.deleted_at IS NULL AND c.is_active) THEN RAISE EXCEPTION 'Select an active employment type' USING ERRCODE='23514';END IF;
 changed:=TG_OP='INSERT';IF TG_OP='UPDATE' THEN changed:=NEW.reporting_manager_id IS DISTINCT FROM OLD.reporting_manager_id OR NEW.owner_company_id IS DISTINCT FROM OLD.owner_company_id;END IF;
 IF changed THEN
  FOR hierarchy_company IN SELECT DISTINCT company_id FROM unnest(ARRAY[NEW.owner_company_id,CASE WHEN TG_OP='UPDATE' THEN OLD.owner_company_id ELSE NULL END])company_id WHERE company_id IS NOT NULL ORDER BY company_id LOOP
   INSERT INTO erp_private.f11_hierarchy_serial(company_id)VALUES(hierarchy_company)ON CONFLICT(company_id)DO UPDATE SET revision=erp_private.f11_hierarchy_serial.revision+1;
  END LOOP;
  IF TG_OP='UPDATE' AND NEW.owner_company_id IS DISTINCT FROM OLD.owner_company_id AND EXISTS(SELECT 1 FROM public.employees e WHERE e.deleted_at IS NULL AND e.id<>NEW.id AND(e.reporting_manager_id=NEW.id OR e.supervisor_id=NEW.id)AND e.owner_company_id IS DISTINCT FROM NEW.owner_company_id) THEN RAISE EXCEPTION 'Review dependent reporting relationships before moving this employee to another employer' USING ERRCODE='23514';END IF;
 END IF;
 IF NEW.reporting_manager_id IS NOT NULL AND changed THEN
  IF NEW.reporting_manager_id=NEW.id OR NOT EXISTS(SELECT 1 FROM public.employees e WHERE e.id=NEW.reporting_manager_id AND e.deleted_at IS NULL AND e.owner_company_id=NEW.owner_company_id AND e.employee_status NOT IN('archived','terminated')) THEN RAISE EXCEPTION 'Invalid reporting-manager relationship' USING ERRCODE='23514';END IF;
  WITH RECURSIVE chain AS(
   SELECT e.id,e.reporting_manager_id,ARRAY[e.id] path,false cycle,1 depth FROM public.employees e WHERE e.id=NEW.reporting_manager_id
   UNION ALL SELECT e.id,e.reporting_manager_id,c.path||e.id,e.id=ANY(c.path),c.depth+1 FROM chain c JOIN public.employees e ON e.id=c.reporting_manager_id WHERE NOT c.cycle AND c.depth<1001
  )SELECT coalesce(bool_or(id=NEW.id OR cycle OR(depth=1001 AND reporting_manager_id IS NOT NULL)),false)INTO cycle_found FROM chain;
  IF cycle_found THEN RAISE EXCEPTION 'Reporting-manager hierarchy contains a cycle or cannot be safely verified' USING ERRCODE='23514';END IF;
 END IF;
 IF NEW.supervisor_id IS NOT NULL AND(TG_OP='INSERT' OR NEW.supervisor_id IS DISTINCT FROM OLD.supervisor_id OR NEW.owner_company_id IS DISTINCT FROM OLD.owner_company_id) AND(NEW.supervisor_id=NEW.id OR NOT EXISTS(SELECT 1 FROM public.employees e WHERE e.id=NEW.supervisor_id AND e.owner_company_id=NEW.owner_company_id AND e.deleted_at IS NULL)) THEN RAISE EXCEPTION 'Supervisor must be another current employee of the same employer' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.f11_employee_relationships() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f11_employee_relationships BEFORE INSERT OR UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION erp_private.f11_employee_relationships();
COMMIT;
