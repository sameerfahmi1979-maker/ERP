BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

-- Work sites have actual company/branch ownership. A capability in a sibling
-- branch or another company cannot authorize either side of a transfer.
CREATE FUNCTION erp_private.administrator_work_site_permission(capability text,company_id bigint,branch_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT $1 IN ('view','manage') AND erp_private.business_principal_is_active()
 AND (erp_private.permission_in_scope('common_md.work_sites.'||$1,$2,$3)
   OR erp_private.permission_in_scope('common_md.'||$1,$2,$3));
$$;
REVOKE ALL ON FUNCTION erp_private.administrator_work_site_permission(text,bigint,bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.administrator_work_site_permission(text,bigint,bigint) TO authenticated;

-- Replace only these table-local permissive policies; the F03 restrictive live
-- session policy and any unrelated application tables remain untouched.
DO $$ DECLARE p record;BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='work_sites'
  AND permissive='PERMISSIVE' AND cmd IN ('SELECT','INSERT','UPDATE')
 LOOP EXECUTE format('DROP POLICY %I ON public.work_sites',p.policyname);END LOOP;
END $$;
CREATE POLICY administrator_work_site_read ON public.work_sites FOR SELECT TO authenticated
 USING(deleted_at IS NULL AND erp_private.administrator_work_site_permission('view',owner_company_id,branch_id));
CREATE POLICY administrator_work_site_insert ON public.work_sites FOR INSERT TO authenticated
 WITH CHECK(deleted_at IS NULL AND erp_private.administrator_work_site_permission('manage',owner_company_id,branch_id));
CREATE POLICY administrator_work_site_update ON public.work_sites FOR UPDATE TO authenticated
 USING(deleted_at IS NULL AND erp_private.administrator_work_site_permission('manage',owner_company_id,branch_id))
 WITH CHECK(deleted_at IS NULL AND erp_private.administrator_work_site_permission('manage',owner_company_id,branch_id));

NOTIFY pgrst,'reload schema';
COMMIT;
