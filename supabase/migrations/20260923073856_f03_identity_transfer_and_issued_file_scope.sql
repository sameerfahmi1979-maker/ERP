BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

-- Relationship grants are valid only while the reviewed identity scope matches.
CREATE OR REPLACE FUNCTION erp_private.employee_permission(employee_id bigint, code text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND erp_private.business_principal_is_active() AND EXISTS(
  SELECT 1 FROM public.employees e WHERE e.id=$1 AND e.deleted_at IS NULL AND
   (public.current_user_is_global_admin() OR EXISTS(
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id
    JOIN public.role_permissions rp ON rp.role_id=r.id JOIN public.permissions p ON p.id=rp.permission_id
    LEFT JOIN public.erp_user_employee_links l ON l.user_profile_id=ur.user_profile_id
      AND EXISTS(SELECT 1 FROM public.user_profiles up JOIN public.employees linked ON linked.id=l.employee_id
        WHERE up.id=l.user_profile_id AND linked.deleted_at IS NULL
        AND up.owner_company_id=linked.owner_company_id AND up.branch_id IS NOT DISTINCT FROM linked.branch_id)
    WHERE ur.user_profile_id=public.current_user_profile_id() AND ur.is_active AND r.is_active AND p.is_active
    AND ((ur.owner_company_id IS NULL AND ur.branch_id IS NULL) OR
      (ur.owner_company_id=e.owner_company_id AND (ur.branch_id IS NULL OR ur.branch_id=e.branch_id)))
    AND (p.permission_code=$2 OR (p.permission_code=$2||'.self' AND l.employee_id=e.id)
      OR (p.permission_code=$2||'.team' AND l.employee_id=e.reporting_manager_id AND l.employee_id<>e.id)))));
$$;

-- Reads include snapshots; an output operator does not implicitly get salary/medical data.
-- Unknown legacy output types fail closed except for genuine global administrators.
CREATE FUNCTION erp_private.generated_pdf_permission(document_id bigint, action_code text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.erp_generated_pdf_documents; e public.employees; code text; requirements text[]; capability text;
BEGIN
 IF auth.uid() IS NULL OR NOT erp_private.business_principal_is_active() THEN RETURN false; END IF;
 SELECT * INTO d FROM public.erp_generated_pdf_documents WHERE id=$1;
 IF NOT FOUND THEN RETURN false; END IF;
 IF $2 NOT IN ('view','download','reports.pdf.approve','outputs.ops.revoke','outputs.ops.retry') THEN RETURN false; END IF;
 IF public.current_user_is_global_admin() THEN RETURN true; END IF;
 IF d.source_record_type<>'employee' THEN RETURN false; END IF;
 SELECT * INTO e FROM public.employees WHERE id=d.source_record_id AND deleted_at IS NULL;
 IF NOT FOUND OR e.owner_company_id<>d.owner_company_id OR NOT public.current_user_can_view_employee(e.id) THEN RETURN false; END IF;
 code:=COALESCE(d.output_code,CASE WHEN d.template_key='hr-employment-letter-en' THEN 'HR_EMPLOYMENT_LETTER' END);
 SELECT required_permissions INTO requirements FROM public.erp_report_registry WHERE report_code=code AND deleted_at IS NULL;
 IF NOT FOUND THEN RETURN false; END IF;
 FOREACH capability IN ARRAY COALESCE(requirements,ARRAY[]::text[]) LOOP
  IF capability LIKE 'hr.%' AND NOT erp_private.employee_permission(e.id,capability) THEN RETURN false; END IF;
 END LOOP;
 IF code='HR_SALARY_CERT_WITH_AMOUNT' AND NOT erp_private.employee_permission(e.id,'hr.payroll.view') THEN RETURN false; END IF;
 IF code IN ('HR_WARNING_LETTER','HR_DISCIPLINARY_SUMMARY') AND NOT erp_private.employee_permission(e.id,'hr.confidential.view') THEN RETURN false; END IF;
 IF $2='view' THEN
  RETURN erp_private.permission_in_scope('reports.pdf.view_history',e.owner_company_id,e.branch_id)
    OR erp_private.permission_in_scope('reports.view',e.owner_company_id,e.branch_id)
    OR erp_private.permission_in_scope('outputs.ops.view',e.owner_company_id,e.branch_id);
 ELSIF $2='download' THEN
  RETURN erp_private.permission_in_scope('reports.export',e.owner_company_id,e.branch_id);
 ELSE RETURN erp_private.permission_in_scope($2,e.owner_company_id,e.branch_id);
 END IF;
END;
$$;
REVOKE ALL ON FUNCTION erp_private.generated_pdf_permission(bigint,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.generated_pdf_permission(bigint,text) TO authenticated;
CREATE FUNCTION public.f03_has_generated_pdf_permission(document_id bigint, action_code text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT erp_private.generated_pdf_permission($1,$2);
$$;
REVOKE ALL ON FUNCTION public.f03_has_generated_pdf_permission(bigint,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f03_has_generated_pdf_permission(bigint,text) TO authenticated;
DROP POLICY pdf_docs_select_own_company ON public.erp_generated_pdf_documents;
CREATE POLICY f03_generated_pdf_read ON public.erp_generated_pdf_documents FOR SELECT TO authenticated
USING(erp_private.generated_pdf_permission(id,'view'));
-- Issued state, storage paths and snapshots are server-owned, not arbitrary client edits.
REVOKE INSERT,UPDATE,DELETE ON public.erp_generated_pdf_documents FROM authenticated,anon;
COMMIT;
