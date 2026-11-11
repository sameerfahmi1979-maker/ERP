BEGIN;

-- This is an additional role gate, never a substitute for document/subject RLS.
-- Private definer is needed only to read protected role assignments; no writes.
CREATE OR REPLACE FUNCTION erp_private.dms_file_pipeline_manager(p_document bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT auth.uid() IS NOT NULL AND erp_private.business_principal_is_active() AND EXISTS (
  SELECT 1 FROM public.dms_documents d
  JOIN public.user_roles ur ON ur.user_profile_id=public.current_user_profile_id() AND ur.is_active
  JOIN public.roles r ON r.id=ur.role_id AND r.is_active
  WHERE d.id=p_document AND d.deleted_at IS NULL AND NOT d.is_archived
   AND d.status NOT IN ('archived','superseded','deleted')
   AND (
    (r.role_code IN ('system_admin','group_admin') AND ur.owner_company_id IS NULL AND ur.branch_id IS NULL)
    OR (
     r.role_code IN ('company_admin','branch_admin','dms_admin','dms_manager')
     AND (r.role_code<>'company_admin' OR (ur.owner_company_id IS NOT NULL AND ur.branch_id IS NULL))
     AND (r.role_code<>'branch_admin' OR (ur.owner_company_id IS NOT NULL AND ur.branch_id IS NOT NULL))
     AND d.owning_company_id IS NOT NULL
     AND ((ur.owner_company_id IS NULL AND ur.branch_id IS NULL) OR
       (ur.owner_company_id=d.owning_company_id AND (ur.branch_id IS NULL OR ur.branch_id=d.owning_branch_id)))
     AND (ur.owner_company_id IS NULL OR EXISTS(SELECT 1 FROM public.owner_companies c WHERE c.id=ur.owner_company_id AND c.status='active'))
     AND (ur.branch_id IS NULL OR EXISTS(SELECT 1 FROM public.branches b WHERE b.id=ur.branch_id AND b.owner_company_id=ur.owner_company_id AND b.status='active'))
     AND EXISTS(SELECT 1 FROM public.role_permissions rp JOIN public.permissions p ON p.id=rp.permission_id AND p.is_active
       WHERE rp.role_id=r.id AND p.permission_code IN ('dms.documents.ai.run','dms.documents.review_ai','dms.admin'))
    )
   )
 ) AND erp_private.document_permission(p_document,'dms.documents.view')
   AND erp_private.document_permission(p_document,'dms.documents.preview')
   AND erp_private.ai_mod04_subjects_allowed(p_document);
$$;
REVOKE ALL ON FUNCTION erp_private.dms_file_pipeline_manager(bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.dms_file_pipeline_manager(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.dms_can_run_file_pipeline(p_document bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT erp_private.dms_file_pipeline_manager(p_document);
$$;
REVOKE ALL ON FUNCTION public.dms_can_run_file_pipeline(bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.dms_can_run_file_pipeline(bigint) TO authenticated;

-- Preserve the installed preparation implementation and fail on source drift.
-- Add the restriction after its authority lock, including idempotent replay.
DO $patch$
DECLARE body text; needle text;
BEGIN
 body:=pg_get_functiondef('erp_private.ai_mod04_preparation(text,jsonb)'::regprocedure);
 needle:='  PERFORM erp_private.ai_mod04_lock_profile_authority(actor);';
 IF strpos(body,needle)=0 OR strpos(body,'dms_file_pipeline_manager')>0 THEN
  RAISE EXCEPTION 'Preparation prerequisite differs; review before migration'; END IF;
 EXECUTE replace(body,needle,needle||E'\n  IF NOT erp_private.dms_file_pipeline_manager(doc) THEN RAISE EXCEPTION ''DMS manager or scoped administrator required'' USING ERRCODE=''42501''; END IF;');
 body:=pg_get_functiondef('erp_private.ai_mod04_job_authority(bigint)'::regprocedure);
 needle:='allowed:=erp_private.document_permission(document,''dms.documents.preview'')';
 IF strpos(body,needle)=0 OR strpos(body,'dms_file_pipeline_manager')>0 THEN
  RAISE EXCEPTION 'Worker authority prerequisite differs; review before migration'; END IF;
 EXECUTE replace(body,needle,'allowed:=erp_private.dms_file_pipeline_manager(document) AND erp_private.document_permission(document,''dms.documents.preview'')');
END $patch$;

COMMIT;
