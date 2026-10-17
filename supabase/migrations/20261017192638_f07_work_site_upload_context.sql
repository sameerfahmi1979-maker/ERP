-- Existing Work Site Documents tab: retain its actual subject/scope rather than
-- dropping camel-case URL parameters or silently starting an unlinked upload.
BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
ALTER TABLE public.dms_upload_sessions DROP CONSTRAINT f07_upload_origin_pair;
ALTER TABLE public.dms_upload_sessions ADD CONSTRAINT f07_upload_origin_pair CHECK (
 (origin_entity_type IS NULL AND origin_entity_id IS NULL) OR
 (origin_entity_type IS NOT NULL AND origin_entity_id IS NOT NULL AND origin_entity_type IN ('employee','employee_dependent','company','branch','party','site') AND origin_entity_id BETWEEN 1 AND 9007199254740991));
ALTER FUNCTION erp_private.f07_upload_origin_scope(text,bigint) RENAME TO f07_upload_origin_scope_before_site;
REVOKE ALL ON FUNCTION erp_private.f07_upload_origin_scope_before_site(text,bigint) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION erp_private.f07_upload_origin_scope(p_type text,p_id bigint)
RETURNS TABLE(company bigint,branch bigint) LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_type IS DISTINCT FROM 'site' THEN RETURN QUERY SELECT * FROM erp_private.f07_upload_origin_scope_before_site(p_type,p_id);RETURN;END IF;
 IF auth.uid() IS NULL OR NOT erp_private.business_principal_is_active() OR p_id IS NULL OR p_id NOT BETWEEN 1 AND 9007199254740991 OR
  NOT (public.current_user_has_permission('common_md.view') OR public.current_user_has_permission('common_md.work_sites.view') OR public.current_user_has_role('system_admin')) THEN
  RAISE EXCEPTION 'Work site upload unavailable' USING ERRCODE='42501';END IF;
 SELECT s.owner_company_id,s.branch_id INTO company,branch FROM public.work_sites s WHERE s.id=p_id AND s.deleted_at IS NULL AND s.status='active' FOR SHARE NOWAIT;
 IF company IS NULL OR NOT (erp_private.permission_in_scope('dms.documents.upload',company,branch) OR erp_private.permission_in_scope('dms.admin',company,branch)) THEN
  RAISE EXCEPTION 'Work site upload scope unavailable' USING ERRCODE='42501';END IF;
 RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION erp_private.f07_upload_origin_scope(text,bigint) FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
