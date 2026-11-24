BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- The native numbered workflow inserts an approval run before it has a
-- document ID. Permit the exact assigned BR1 officer to see that own run
-- after verified original review. Existing restrictive RLS and write guards
-- still apply. An empty supervised review enrollment grants nothing.
CREATE FUNCTION erp_private.dms_br1_pending_run_visible(
  p_session bigint, p_result bigint, p_actor bigint, p_run_key text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT auth.jwt()->>'role' = 'authenticated'
    AND p_actor = public.current_user_profile_id()
    AND erp_private.business_principal_is_active()
    AND p_run_key ~ ('^f06-ai:'||p_actor||':[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$')
    AND EXISTS (
      SELECT 1
      FROM erp_private.dms_sharepoint_intake_origins AS origin
      JOIN erp_private.dms_sharepoint_br1_review_scope AS enrollment
        ON enrollment.connection_id = origin.connection_id
       AND (enrollment.company_id,enrollment.branch_id,enrollment.actor_id,enrollment.item_id,
            enrollment.source_version,enrollment.sha256)
           = (origin.company_id,origin.branch_id,origin.owner_id,origin.item_id,origin.source_version,origin.sha256)
      JOIN erp_private.dms_sharepoint_br1_review_state AS publication
        ON publication.operation_id = origin.operation_id
       AND publication.upload_session_id = origin.upload_session_id
       AND publication.officer_id = enrollment.officer_id
      JOIN public.dms_review_queue AS review
        ON review.id = publication.review_id AND review.upload_session_id = origin.upload_session_id
       AND review.ai_result_id = publication.result_id AND review.assigned_to = enrollment.officer_id
       AND review.deleted_at IS NULL AND review.status NOT IN ('dismissed','cancelled')
      JOIN public.dms_upload_sessions AS intake
        ON intake.id = origin.upload_session_id
       AND (intake.owning_company_id,intake.owning_branch_id,intake.uploaded_by,intake.sha256_hash,
            intake.file_size_bytes,intake.temp_storage_path,intake.ai_result_id)
           = (origin.company_id,origin.branch_id,origin.owner_id,origin.sha256,
              origin.file_size_bytes,origin.temp_storage_path,publication.result_id)
       AND intake.deleted_at IS NULL AND intake.discarded_at IS NULL AND intake.document_id IS NULL
       AND intake.intake_status IN ('review_pending','review_in_progress')
      JOIN erp_private.f07_intake_reviews AS seal
        ON seal.upload_session_id = intake.id AND seal.analysis_result_id = publication.result_id
       AND seal.actor_id = enrollment.officer_id AND seal.source_sha256 = origin.sha256
       AND seal.review_mode = 'verified'
      JOIN public.dms_document_types AS type
        ON type.id = seal.document_type_id AND type.type_code = 'LABOUR_CARD'
       AND type.is_active AND type.deleted_at IS NULL
      WHERE origin.upload_session_id = p_session
        AND publication.result_id = p_result
        AND enrollment.officer_id = p_actor AND p_actor <> origin.owner_id
        AND enrollment.expires_at > statement_timestamp()
        AND erp_private.ai_mod04_profile_grant(p_actor,'dms.documents.review_ai',origin.company_id,origin.branch_id)
        AND erp_private.ai_mod04_profile_grant(p_actor,'dms.documents.preview',origin.company_id,origin.branch_id)
    );
$function$;

REVOKE ALL ON FUNCTION erp_private.dms_br1_pending_run_visible(bigint,bigint,bigint,text)
  FROM PUBLIC, anon, authenticated, service_role, erp_agent_discovery_runtime;
GRANT EXECUTE ON FUNCTION erp_private.dms_br1_pending_run_visible(bigint,bigint,bigint,text) TO authenticated;

CREATE POLICY dms_br1_exact_officer_pending_run_select
  ON public.dms_approve_runs FOR SELECT TO authenticated
  USING (
    document_id IS NULL AND status = 'started'
    AND erp_private.dms_br1_pending_run_visible(upload_session_id,ai_result_id,started_by,run_key)
  );

NOTIFY pgrst, 'reload schema';
COMMIT;
