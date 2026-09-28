-- F02: repair entity contracts without bypassing row security.
-- Inactive master records remain available to authorized administrators, as in
-- the master screens. Inactive is not deleted. Only work_sites has soft delete.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.current_user_can_view_ai_entity(p_entity_type text, p_entity_id bigint)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path TO pg_catalog, public, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NULL OR p_entity_id IS NULL THEN RETURN false; END IF;
  CASE p_entity_type
    WHEN 'company' THEN
      RETURN EXISTS (SELECT 1 FROM public.owner_companies c WHERE c.id = p_entity_id
        AND public.current_user_has_permission_in_company('organizations.view', c.id));
    WHEN 'branch' THEN
      RETURN EXISTS (SELECT 1 FROM public.branches b WHERE b.id = p_entity_id
        AND public.current_user_has_permission_in_branch('branches.view', b.id));
    WHEN 'party' THEN
      RETURN public.current_user_has_permission('master_data.party_master.view')
        AND EXISTS (SELECT 1 FROM public.parties p WHERE p.id = p_entity_id);
    WHEN 'site' THEN
      RETURN EXISTS (SELECT 1 FROM public.work_sites s WHERE s.id = p_entity_id AND s.deleted_at IS NULL
        AND (public.current_user_has_permission_in_company('common_md.work_sites.view', s.owner_company_id)
          OR (s.branch_id IS NOT NULL AND public.current_user_has_permission_in_branch('common_md.work_sites.view', s.branch_id))));
    ELSE RETURN false;
  END CASE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.current_user_can_manage_ai_entity(p_entity_type text, p_entity_id bigint)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path TO pg_catalog, public, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NULL OR p_entity_id IS NULL THEN RETURN false; END IF;
  CASE p_entity_type
    WHEN 'company' THEN
      RETURN EXISTS (SELECT 1 FROM public.owner_companies c WHERE c.id = p_entity_id
        AND public.current_user_has_permission_in_company('organizations.manage', c.id));
    WHEN 'branch' THEN
      RETURN EXISTS (SELECT 1 FROM public.branches b WHERE b.id = p_entity_id
        AND public.current_user_has_permission_in_branch('branches.manage', b.id));
    WHEN 'party' THEN
      RETURN public.current_user_has_permission('master_data.party_master.manage')
        AND EXISTS (SELECT 1 FROM public.parties p WHERE p.id = p_entity_id);
    WHEN 'site' THEN
      RETURN EXISTS (SELECT 1 FROM public.work_sites s WHERE s.id = p_entity_id AND s.deleted_at IS NULL
        AND (public.current_user_has_permission_in_company('common_md.work_sites.manage', s.owner_company_id)
          OR (s.branch_id IS NOT NULL AND public.current_user_has_permission_in_branch('common_md.work_sites.manage', s.branch_id))));
    ELSE RETURN false;
  END CASE;
END;
$function$;

REVOKE ALL ON FUNCTION public.current_user_can_view_ai_entity(text,bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_can_manage_ai_entity(text,bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_can_view_ai_entity(text,bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_can_manage_ai_entity(text,bigint) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
