BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

-- Check each capability against this intake's pinned scope, not a user's
-- global permission union. This also supports legitimate scoped reviewers.
CREATE FUNCTION erp_private.upload_session_permission(session_id bigint,capability text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.dms_upload_sessions s WHERE s.id=$1 AND s.deleted_at IS NULL
  AND erp_private.upload_row_allowed(s.uploaded_by,s.owning_company_id,s.owning_branch_id,s.document_id)
  AND CASE WHEN s.document_id IS NULL THEN erp_private.permission_in_scope($2,s.owning_company_id,s.owning_branch_id)
   ELSE erp_private.document_permission(s.document_id,$2) END);
$$;
REVOKE ALL ON FUNCTION erp_private.upload_session_permission(bigint,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.upload_session_permission(bigint,text) TO authenticated;

DO $$ DECLARE t text; p record; u text; c text; BEGIN
 FOREACH t IN ARRAY ARRAY['dms_ai_entity_match_candidates','dms_ai_extraction_jobs','dms_ai_extraction_results','dms_ai_validation_findings','dms_approve_runs','dms_review_queue'] LOOP
  -- Where both parents exist, access to one cannot authorize a foreign other parent.
  EXECUTE format('ALTER POLICY f03_document_subject ON public.%I USING ((upload_session_id IS NULL OR erp_private.upload_session_allowed(upload_session_id)) AND CASE WHEN document_id IS NULL THEN erp_private.upload_session_allowed(upload_session_id) ELSE erp_private.document_permission(document_id,%L) END) WITH CHECK ((upload_session_id IS NULL OR erp_private.upload_session_allowed(upload_session_id)) AND CASE WHEN document_id IS NULL THEN erp_private.upload_session_allowed(upload_session_id) ELSE erp_private.document_permission(document_id,%L) END)',t,
   CASE WHEN t='dms_ai_extraction_results' THEN 'dms.documents.preview' ELSE 'dms.documents.view' END,
   CASE WHEN t='dms_ai_extraction_results' THEN 'dms.documents.preview' ELSE 'dms.documents.view' END);
  FOR p IN SELECT * FROM pg_policies WHERE schemaname='public' AND tablename=t AND permissive='PERMISSIVE' LOOP
   u:=regexp_replace(p.qual,'erp_private.upload_session_allowed\(upload_session_id\) AND (public\.)?current_user_has_permission\(''([^'']+)''::text\)', 'erp_private.upload_session_permission(upload_session_id,''\2'')','g');
   c:=regexp_replace(p.with_check,'erp_private.upload_session_allowed\(upload_session_id\) AND (public\.)?current_user_has_permission\(''([^'']+)''::text\)', 'erp_private.upload_session_permission(upload_session_id,''\2'')','g');
   EXECUTE format('ALTER POLICY %I ON public.%I%s%s',p.policyname,t,
    CASE WHEN u IS NULL THEN '' ELSE ' USING ('||u||')' END,
    CASE WHEN c IS NULL THEN '' ELSE ' WITH CHECK ('||c||')' END);
  END LOOP;
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
