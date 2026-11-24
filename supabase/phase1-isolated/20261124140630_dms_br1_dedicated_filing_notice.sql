BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '45s';

-- Bind only the dedicated, exact filing scope. The historical supervised
-- registration keeps its existing predicates and event identity.
CREATE FUNCTION erp_private.dms_br1_dedicated_filing_notice(p_actor bigint,p_operation uuid)
RETURNS TABLE(audit_event_id bigint,snapshot jsonb)
LANGUAGE sql STABLE SET search_path = '' AS $function$
  SELECT audit.id,jsonb_build_object(
    'operation_id',a.operation_id,'document_id',d.id,'document_no',d.document_no,
    'company_id',origin.company_id,'branch_id',origin.branch_id,'document_type_id',d.document_type_id,
    'recipient_profile_id',f.officer_id,'connection_id',origin.connection_id,
    'upload_session_id',origin.upload_session_id,'approve_run_id',r.id
  )
  FROM erp_private.dms_sharepoint_br1_filing_scope f
  JOIN erp_private.dms_sharepoint_intake_origins origin ON origin.operation_id=f.source_operation_id
  JOIN erp_private.dms_sharepoint_br1_review_scope e ON e.connection_id=origin.connection_id
    AND ROW(e.company_id,e.branch_id,e.actor_id,e.item_id,e.source_version,e.sha256,e.officer_id)
      = ROW(origin.company_id,origin.branch_id,origin.owner_id,origin.item_id,origin.source_version,origin.sha256,f.officer_id)
  JOIN erp_private.agent_pdf_policy policy ON policy.connection_id=origin.connection_id
    AND (policy.company_id,policy.actor_id,policy.officer_id)=(origin.company_id,origin.owner_id,f.officer_id)
    AND policy.enabled
  -- A paused intake worker does not revoke the separate officer filing.
  JOIN erp_private.agent_sync_checkpoints checkpoint ON checkpoint.connection_id=origin.connection_id
  JOIN erp_private.dms_sharepoint_br1_review_state w ON w.operation_id=origin.operation_id
    AND w.upload_session_id=origin.upload_session_id AND w.officer_id=f.officer_id
  JOIN erp_private.ai_approval_plans a ON a.operation_id=f.filing_operation_id
    AND a.actor_id=f.officer_id AND a.request_hash=f.request_sha256 AND a.upload_session_id=origin.upload_session_id
    AND a.completed_at IS NOT NULL AND a.completed_at<=f.expires_at AND a.completed_at<=e.expires_at
  JOIN public.dms_upload_sessions intake ON intake.id=origin.upload_session_id
    AND intake.document_id=a.document_id AND intake.approve_run_id=a.approve_run_id AND intake.ai_result_id=w.result_id
    AND (intake.owning_company_id,intake.owning_branch_id,intake.uploaded_by,intake.sha256_hash,intake.file_size_bytes)
      = (origin.company_id,origin.branch_id,origin.owner_id,origin.sha256,origin.file_size_bytes)
    AND intake.reviewed_by=f.officer_id AND intake.status='completed' AND intake.intake_status='approved'
    AND intake.review_status='approved' AND intake.approve_status='completed'
    AND intake.approved_at IS NOT NULL AND intake.discarded_at IS NULL AND intake.deleted_at IS NULL
    AND intake.uploaded_at>=policy.from_time
  JOIN public.dms_review_queue review ON review.id=w.review_id
    AND review.upload_session_id=intake.id AND review.ai_result_id=w.result_id
    AND review.assigned_to=f.officer_id AND review.review_type='intake_metadata_review'
    AND review.deleted_at IS NULL AND review.status NOT IN ('dismissed','cancelled')
  JOIN public.dms_documents d ON d.id=a.document_id AND d.document_no=a.document_no
    AND (d.owning_company_id,d.owning_branch_id)=(origin.company_id,origin.branch_id)
    AND d.status='active' AND d.deleted_at IS NULL AND NOT d.is_archived
  JOIN public.dms_document_types t ON t.id=d.document_type_id AND t.type_code='LABOUR_CARD'
    AND t.is_active AND t.deleted_at IS NULL
  JOIN public.dms_approve_runs r ON r.id=a.approve_run_id
    AND r.upload_session_id=intake.id AND r.document_id=d.id AND r.status='completed'
    AND r.started_by=f.officer_id AND r.run_key='f06-ai:'||f.officer_id||':'||a.operation_id
    AND r.final_storage_bucket='dms-documents' AND r.final_storage_path=a.storage_path
  JOIN public.dms_document_files original
    ON original.id=CASE WHEN a.result->>'file_id' ~ '^[1-9][0-9]{0,17}$' THEN (a.result->>'file_id')::bigint END
    AND original.document_id=d.id AND original.version_id=d.current_version_id
    AND original.created_by=f.officer_id AND original.file_role='original'
    AND original.storage_bucket='dms-documents' AND original.storage_path=a.storage_path
    AND original.sha256_hash=origin.sha256 AND original.file_size_bytes=origin.file_size_bytes
    AND original.deleted_at IS NULL
  JOIN LATERAL (
    SELECT min(ev.id) AS id FROM public.dms_document_events ev
    WHERE ev.document_id=d.id AND ev.event_type='approve_save_db_transaction_completed' AND ev.performed_by=f.officer_id
      AND ev.metadata_json @> jsonb_build_object('operation_id',a.operation_id,'approve_run_id',r.id,
        'file_id',original.id,'version_id',original.version_id)
    HAVING count(*)=1
  ) audit ON true
  WHERE a.actor_id=p_actor AND a.operation_id=p_operation AND origin.owner_id<>f.officer_id
    AND origin.connection_id <> 'e73782e5-8595-4fe4-b77d-f2751645f9a8'::uuid
    AND a.result=jsonb_build_object(
      'documentId',d.id,'documentNo',d.document_no,'upload_session_id',intake.id,'operation_id',a.operation_id,
      'approve_run_id',r.id,'file_id',original.id,'completed',true,'replayed',false)
    AND erp_private.ai_mod04_reviewer_eligible(f.officer_id,d.id)
    AND erp_private.ai_mod04_profile_grant(f.officer_id,'notifications.view',origin.company_id,origin.branch_id);
$function$;

-- Union this narrow witness with the unchanged historical witness. A source
-- connection can enter only one of the two paths.
DO $patch$
DECLARE
  body text;
  anchor constant text := 'AND erp_private.ai_mod04_reviewer_eligible(policy.officer_id, doc.id);';
BEGIN
  SELECT pg_get_functiondef('erp_private.numbered_filing_notification_binding(bigint,uuid)'::regprocedure)
    INTO STRICT body;
  IF array_length(string_to_array(body,anchor),1)<>2 THEN
    RAISE EXCEPTION 'Unexpected numbered filing notice predecessor';
  END IF;
  EXECUTE replace(body,anchor,$binding$
     AND erp_private.ai_mod04_reviewer_eligible(policy.officer_id, doc.id)
     AND NOT EXISTS (
       SELECT 1 FROM erp_private.dms_sharepoint_br1_filing_scope f
       JOIN erp_private.dms_sharepoint_intake_origins origin ON origin.operation_id=f.source_operation_id
       WHERE f.filing_operation_id=plan.operation_id AND f.request_sha256=plan.request_hash
         AND f.officer_id=plan.actor_id AND origin.upload_session_id=plan.upload_session_id
         AND origin.connection_id<>'e73782e5-8595-4fe4-b77d-f2751645f9a8'::uuid
     )
  UNION ALL SELECT * FROM erp_private.dms_br1_dedicated_filing_notice(p_actor,p_operation);
$binding$);
END $patch$;

CREATE OR REPLACE FUNCTION erp_private.capture_numbered_filing_notification_on_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF NEW.request_json @> '{"owningCompanyId":1,"owningBranchId":1,"documentTypeId":16}'::jsonb
    OR EXISTS (SELECT 1 FROM erp_private.dms_sharepoint_br1_filing_scope WHERE filing_operation_id=NEW.operation_id) THEN
    PERFORM erp_private.capture_numbered_filing_notification(NEW.actor_id,NEW.operation_id);
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER f10_capture_numbered_filing_completion ON erp_private.ai_approval_plans;
CREATE TRIGGER f10_capture_numbered_filing_completion AFTER UPDATE OF result ON erp_private.ai_approval_plans
FOR EACH ROW WHEN (OLD.result IS NULL AND NEW.result IS NOT NULL AND NEW.completed_at IS NOT NULL)
EXECUTE FUNCTION erp_private.capture_numbered_filing_notification_on_completion();

CREATE OR REPLACE FUNCTION erp_private.lock_numbered_filing_notification_recipient(p_event bigint,p_profile bigint)
RETURNS boolean LANGUAGE plpgsql SET search_path = '' AS $function$
DECLARE
  source_event_id bigint;
  bound_document_id bigint;
  bound_upload_session_id bigint;
  bound_connection uuid;
  bound_operation uuid;
BEGIN
  IF NOT public.f10_numbered_filing_notification_recipient(p_event,p_profile) THEN RETURN false; END IF;
  SELECT event.source_id,(event.source_snapshot->>'upload_session_id')::bigint,
    (event.source_snapshot->>'connection_id')::uuid,(event.source_snapshot->>'operation_id')::uuid
  INTO STRICT source_event_id,bound_upload_session_id,bound_connection,bound_operation
  FROM erp_private.notification_events event WHERE event.id=p_event;
  PERFORM 1 FROM erp_private.agent_pdf_policy policy
  JOIN erp_private.agent_sync_checkpoints checkpoint ON checkpoint.connection_id=policy.connection_id
  WHERE policy.connection_id=bound_connection FOR SHARE OF policy,checkpoint NOWAIT;
  IF NOT FOUND THEN RETURN false; END IF;
  IF bound_connection <> 'e73782e5-8595-4fe4-b77d-f2751645f9a8'::uuid THEN
    PERFORM 1 FROM erp_private.dms_sharepoint_br1_filing_scope f
    JOIN erp_private.dms_sharepoint_intake_origins o ON o.operation_id=f.source_operation_id
    JOIN erp_private.dms_sharepoint_br1_review_scope e ON e.connection_id=o.connection_id
    WHERE f.filing_operation_id=bound_operation AND o.connection_id=bound_connection
      AND o.upload_session_id=bound_upload_session_id AND f.officer_id=p_profile
    FOR SHARE OF f,o,e NOWAIT;
    IF NOT FOUND THEN RETURN false; END IF;
  END IF;
  PERFORM erp_private.ai_mod04_lock_profile_authority(p_profile);
  SELECT doc.id INTO bound_document_id
  FROM public.dms_documents doc JOIN public.dms_document_events audit ON audit.document_id=doc.id
  WHERE audit.id=source_event_id FOR SHARE OF doc NOWAIT;
  PERFORM erp_private.ai_mod04_lock_source(bound_document_id);
  PERFORM 1 FROM public.dms_review_queue review
  WHERE review.upload_session_id=bound_upload_session_id AND review.review_type=CASE
    WHEN bound_connection='e73782e5-8595-4fe4-b77d-f2751645f9a8'::uuid THEN 'intake_classification_review'
    ELSE 'intake_metadata_review' END
    AND review.assigned_to=p_profile AND review.deleted_at IS NULL
  ORDER BY review.id FOR SHARE NOWAIT;
  RETURN public.f10_numbered_filing_notification_recipient(p_event,p_profile);
END $function$;

REVOKE ALL ON FUNCTION erp_private.dms_br1_dedicated_filing_notice(bigint,uuid)
  FROM PUBLIC, anon, authenticated, service_role, erp_agent_discovery_runtime;
NOTIFY pgrst, 'reload schema';
COMMIT;
