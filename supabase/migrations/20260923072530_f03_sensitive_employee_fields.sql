BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
-- RLS is row-level. Do not expose a medical column merely because the employee row is visible.
REVOKE SELECT ON public.employees FROM PUBLIC,anon,authenticated;
REVOKE SELECT(blood_group) ON public.employees FROM PUBLIC,anon,authenticated;
DO $$ DECLARE cols text; BEGIN
 SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO cols FROM pg_attribute
 WHERE attrelid='public.employees'::regclass AND attnum>0 AND NOT attisdropped AND attname<>'blood_group';
 EXECUTE 'GRANT SELECT('||cols||') ON public.employees TO authenticated';
END $$;
CREATE OR REPLACE FUNCTION erp_private.employee_blood_group(employee_id bigint)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT e.blood_group FROM public.employees e WHERE e.id=$1 AND public.current_user_can_view_employee_medical(e.id);
$$;
REVOKE ALL ON FUNCTION erp_private.employee_blood_group(bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION erp_private.employee_blood_group(bigint) TO authenticated;
CREATE OR REPLACE FUNCTION public.f03_employee_blood_group(employee_id bigint)
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.employee_blood_group($1); $$;
REVOKE ALL ON FUNCTION public.f03_employee_blood_group(bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f03_employee_blood_group(bigint) TO authenticated;
CREATE OR REPLACE FUNCTION erp_private.protect_employee_health()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NOT NULL AND NOT public.current_user_is_global_admin() AND
   ((TG_OP='INSERT' AND NEW.blood_group IS NOT NULL) OR (TG_OP='UPDATE' AND NEW.blood_group IS DISTINCT FROM OLD.blood_group)) THEN
   IF NOT erp_private.permission_in_scope('hr.medical.manage',NEW.owner_company_id,NEW.branch_id) OR
     (TG_OP='UPDATE' AND NOT erp_private.employee_permission(OLD.id,'hr.medical.manage')) THEN
     RAISE EXCEPTION 'Medical permission required' USING ERRCODE='42501';
   END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.protect_employee_health() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f03_employee_health BEFORE INSERT OR UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION erp_private.protect_employee_health();

-- Link changes cannot use an accessible document to attach to an inaccessible employee.
CREATE POLICY f03_employee_document_link_insert ON public.dms_document_links AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK(entity_type<>'employee' OR public.current_user_can_manage_employee(entity_id));
CREATE POLICY f03_employee_document_link_update ON public.dms_document_links AS RESTRICTIVE FOR UPDATE TO authenticated
USING(entity_type<>'employee' OR public.current_user_can_manage_employee(entity_id))
WITH CHECK(entity_type<>'employee' OR public.current_user_can_manage_employee(entity_id));
CREATE POLICY f03_employee_document_link_delete ON public.dms_document_links AS RESTRICTIVE FOR DELETE TO authenticated
USING(entity_type<>'employee' OR public.current_user_can_manage_employee(entity_id));
NOTIFY pgrst,'reload schema';
COMMIT;
