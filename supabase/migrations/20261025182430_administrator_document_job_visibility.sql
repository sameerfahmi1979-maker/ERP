BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
-- Operational history follows the current document or retained intake source.
-- This grants no queue insertion, worker dispatch, retry or provider authority.
CREATE FUNCTION erp_private.administrator_document_job_visible(p_document bigint,p_session bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT erp_private.business_principal_is_active() AND CASE
 WHEN $1 IS NOT NULL THEN erp_private.document_permission($1,'dms.documents.view')
   AND (erp_private.document_permission($1,'dms.documents.edit') OR erp_private.document_permission($1,'dms.documents.review_ai'))
 WHEN $2 IS NOT NULL THEN erp_private.f07_may_manage_inline_job($2,public.current_user_profile_id())
 ELSE false END;
$$;
REVOKE ALL ON FUNCTION erp_private.administrator_document_job_visible(bigint,bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.administrator_document_job_visible(bigint,bigint) TO authenticated;
CREATE POLICY administrator_scoped_document_jobs ON public.dms_ai_job_queue FOR SELECT TO authenticated
 USING(erp_private.administrator_document_job_visible(related_document_id,related_upload_session_id));
CREATE POLICY administrator_scoped_document_job_attempts ON public.dms_ai_job_attempts FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.dms_ai_job_queue j WHERE j.id=job_id
   AND erp_private.administrator_document_job_visible(j.related_document_id,j.related_upload_session_id)));
-- Shared workflow definitions are reference metadata. Read permission does not
-- grant configuration edits or bypass independent document approval.
CREATE POLICY administrator_workflow_reference ON public.dms_document_workflows FOR SELECT TO authenticated
 USING((SELECT erp_private.business_principal_is_active()) AND (SELECT public.current_user_has_permission_any_scope('dms.documents.view')));
CREATE POLICY administrator_workflow_step_reference ON public.dms_document_workflow_steps FOR SELECT TO authenticated
 USING((SELECT erp_private.business_principal_is_active()) AND (SELECT public.current_user_has_permission_any_scope('dms.documents.view')));
CREATE POLICY administrator_workflow_type_reference ON public.dms_workflow_document_types FOR SELECT TO authenticated
 USING((SELECT erp_private.business_principal_is_active()) AND (SELECT public.current_user_has_permission_any_scope('dms.documents.view')));
NOTIFY pgrst,'reload schema';COMMIT;
