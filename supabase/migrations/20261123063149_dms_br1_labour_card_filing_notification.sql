BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Bind the configured supervised SharePoint registration to its existing
-- intake account and officer. The receipt predicates also cover assisted
-- admissions made by that account, which have no continuous-work row.
CREATE FUNCTION erp_private.numbered_filing_notification_binding(p_actor bigint, p_operation uuid)
RETURNS TABLE(audit_event_id bigint, snapshot jsonb)
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT audit.id, jsonb_build_object(
    'operation_id', plan.operation_id, 'document_id', doc.id, 'document_no', doc.document_no,
    'company_id', doc.owning_company_id, 'branch_id', doc.owning_branch_id,
    'document_type_id', doc.document_type_id, 'recipient_profile_id', policy.officer_id,
    'connection_id', policy.connection_id, 'upload_session_id', intake.id, 'approve_run_id', run.id
  )
    FROM erp_private.ai_approval_plans AS plan
    JOIN erp_private.agent_pdf_policy AS policy
      ON policy.connection_id = 'e73782e5-8595-4fe4-b77d-f2751645f9a8'::uuid
      AND policy.company_id = 1 AND policy.enabled AND policy.officer_id = plan.actor_id
      AND policy.actor_id <> policy.officer_id
    JOIN erp_private.agent_sync_checkpoints AS checkpoint
      ON checkpoint.connection_id = policy.connection_id AND NOT checkpoint.paused
    JOIN public.user_profiles AS officer
      ON officer.id = policy.officer_id AND officer.status = 'active' AND NOT officer.must_change_password
    JOIN auth.users AS account ON account.id = officer.auth_user_id AND account.deleted_at IS NULL
      AND (account.banned_until IS NULL OR account.banned_until <= statement_timestamp())
    JOIN public.dms_documents AS doc ON doc.id = plan.document_id AND doc.document_no = plan.document_no
      AND doc.owning_company_id = 1 AND doc.owning_branch_id = 1 AND doc.document_type_id = 16
      AND doc.status = 'active' AND doc.deleted_at IS NULL AND NOT doc.is_archived
    JOIN public.dms_document_types AS type ON type.id = doc.document_type_id
      AND type.type_code = 'LABOUR_CARD' AND type.is_active AND type.deleted_at IS NULL
    JOIN public.dms_upload_sessions AS intake ON intake.id = plan.upload_session_id
      AND intake.document_id = doc.id AND intake.uploaded_by = policy.actor_id
      AND intake.owning_company_id = doc.owning_company_id AND intake.owning_branch_id = doc.owning_branch_id
      AND intake.approve_run_id = plan.approve_run_id AND intake.reviewed_by = plan.actor_id
      AND intake.status = 'completed' AND intake.intake_status = 'approved' AND intake.review_status = 'approved'
      AND intake.approve_status = 'completed' AND intake.uploaded_at >= policy.from_time
      AND intake.approved_at IS NOT NULL AND intake.discarded_at IS NULL AND intake.deleted_at IS NULL
    JOIN public.dms_approve_runs AS run ON run.id = plan.approve_run_id
      AND run.upload_session_id = intake.id AND run.document_id = doc.id AND run.status = 'completed'
      AND run.started_by = plan.actor_id AND run.run_key = 'f06-ai:' || plan.actor_id || ':' || plan.operation_id
      AND run.final_storage_bucket = 'dms-documents' AND run.final_storage_path = plan.storage_path
    JOIN public.dms_document_files AS original
      ON original.id = CASE WHEN plan.result->>'file_id' ~ '^[1-9][0-9]{0,17}$'
                            THEN (plan.result->>'file_id')::bigint END
      AND original.document_id = doc.id AND original.version_id = doc.current_version_id
      AND original.created_by = plan.actor_id AND original.file_role = 'original'
      AND original.storage_bucket = 'dms-documents' AND original.storage_path = plan.storage_path
      AND original.deleted_at IS NULL
    JOIN LATERAL (
      SELECT min(event.id) AS id
        FROM public.dms_document_events AS event
       WHERE event.document_id = doc.id AND event.event_type = 'approve_save_db_transaction_completed'
         AND event.performed_by = plan.actor_id
         AND event.metadata_json @> jsonb_build_object(
           'operation_id', plan.operation_id, 'approve_run_id', run.id,
           'file_id', original.id, 'version_id', original.version_id
         )
      HAVING count(*) = 1
    ) AS audit ON true
   WHERE plan.actor_id = p_actor AND plan.operation_id = p_operation AND plan.completed_at IS NOT NULL
     AND plan.request_json @> '{"owningCompanyId":1,"owningBranchId":1,"documentTypeId":16}'::jsonb
     AND plan.result = jsonb_build_object(
       'documentId', doc.id, 'documentNo', doc.document_no, 'upload_session_id', intake.id,
       'operation_id', plan.operation_id, 'approve_run_id', run.id, 'file_id', original.id,
       'completed', true, 'replayed', false
     )
     AND EXISTS (
       SELECT 1 FROM erp_private.f07_single_upload_admissions AS admission
        WHERE admission.upload_session_id = intake.id AND admission.actor_id = policy.actor_id
          AND admission.acknowledged_at IS NOT NULL
     )
     AND EXISTS (
       SELECT 1 FROM public.dms_review_queue AS review
        WHERE review.upload_session_id = intake.id AND review.review_type = 'intake_classification_review'
          AND review.assigned_to = policy.officer_id AND review.deleted_at IS NULL
          AND review.status NOT IN ('dismissed','cancelled')
     )
     AND erp_private.ai_mod04_reviewer_eligible(policy.officer_id, doc.id);
$$;

CREATE FUNCTION erp_private.capture_numbered_filing_notification(p_actor bigint, p_operation uuid)
RETURNS bigint LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  bound record;
  event_id bigint;
  capture_key text := 'dms-numbered-filing:' || p_operation;
BEGIN
  SELECT * INTO bound FROM erp_private.numbered_filing_notification_binding(p_actor, p_operation);
  IF NOT FOUND THEN RETURN NULL; END IF;

  INSERT INTO erp_private.notification_events(event_key,source_table,source_id,event_type,actor_id,source_snapshot)
  VALUES(capture_key,'dms_document_events',bound.audit_event_id,'dms_numbered_filing_committed',p_actor,bound.snapshot)
  ON CONFLICT(event_key) DO NOTHING
  RETURNING id INTO event_id;
  IF FOUND THEN RETURN event_id; END IF;

  SELECT event.id INTO event_id
    FROM erp_private.notification_events AS event WHERE event.event_key = capture_key
     AND event.source_table = 'dms_document_events' AND event.source_id = bound.audit_event_id
     AND event.event_type = 'dms_numbered_filing_committed' AND event.actor_id = p_actor
     AND event.source_snapshot = bound.snapshot;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Numbered filing notification identity conflict' USING ERRCODE = 'PT409';
  END IF;
  RETURN event_id;
END $$;

CREATE FUNCTION erp_private.capture_numbered_filing_notification_on_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM erp_private.capture_numbered_filing_notification(NEW.actor_id, NEW.operation_id);
  RETURN NEW;
END $$;

-- The canonical approval has already recorded the document, original, run, and
-- audit event when it writes the completed receipt. The outbox shares the
-- filing transaction, including any rollback after this trigger.
CREATE TRIGGER f10_capture_numbered_filing_completion
AFTER UPDATE OF result ON erp_private.ai_approval_plans
FOR EACH ROW WHEN (
  OLD.result IS NULL AND NEW.result IS NOT NULL AND NEW.completed_at IS NOT NULL
  AND NEW.request_json @> '{"owningCompanyId":1,"owningBranchId":1,"documentTypeId":16}'::jsonb
)
EXECUTE FUNCTION erp_private.capture_numbered_filing_notification_on_completion();

CREATE FUNCTION public.f10_numbered_filing_notification_recipient(p_event bigint, p_profile bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1
      FROM erp_private.notification_events AS notice
      JOIN LATERAL erp_private.numbered_filing_notification_binding(
        notice.actor_id,
        CASE WHEN notice.source_snapshot->>'operation_id' ~
          '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
        THEN (notice.source_snapshot->>'operation_id')::uuid END
      ) AS bound ON bound.audit_event_id = notice.source_id AND bound.snapshot = notice.source_snapshot
     WHERE notice.id = p_event AND notice.event_type = 'dms_numbered_filing_committed'
       AND notice.source_table = 'dms_document_events'
       AND notice.event_key = 'dms-numbered-filing:' || (bound.snapshot->>'operation_id')
       AND bound.snapshot->'recipient_profile_id' = to_jsonb(p_profile)
  );
$$;

CREATE FUNCTION erp_private.lock_numbered_filing_notification_recipient(p_event bigint, p_profile bigint)
RETURNS boolean LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  source_event_id bigint;
  bound_document_id bigint;
  bound_upload_session_id bigint;
BEGIN
  IF NOT public.f10_numbered_filing_notification_recipient(p_event, p_profile) THEN RETURN false; END IF;
  SELECT event.source_id, (event.source_snapshot->>'upload_session_id')::bigint
    INTO STRICT source_event_id, bound_upload_session_id
    FROM erp_private.notification_events AS event WHERE event.id = p_event;
  PERFORM 1 FROM erp_private.agent_pdf_policy AS policy
    JOIN erp_private.agent_sync_checkpoints AS checkpoint ON checkpoint.connection_id = policy.connection_id
   WHERE policy.connection_id = 'e73782e5-8595-4fe4-b77d-f2751645f9a8'::uuid
   FOR SHARE OF policy, checkpoint NOWAIT;
  PERFORM erp_private.ai_mod04_lock_profile_authority(p_profile);
  SELECT doc.id INTO bound_document_id
    FROM public.dms_documents AS doc JOIN public.dms_document_events AS audit ON audit.document_id = doc.id
   WHERE audit.id = source_event_id FOR SHARE OF doc NOWAIT;
  PERFORM erp_private.ai_mod04_lock_source(bound_document_id);
  PERFORM 1 FROM public.dms_review_queue AS review
   WHERE review.upload_session_id = bound_upload_session_id
     AND review.review_type = 'intake_classification_review' AND review.assigned_to = p_profile
     AND review.deleted_at IS NULL
   ORDER BY review.id FOR SHARE NOWAIT;
  RETURN public.f10_numbered_filing_notification_recipient(p_event, p_profile);
END $$;

REVOKE ALL ON FUNCTION erp_private.numbered_filing_notification_binding(bigint,uuid),
  erp_private.capture_numbered_filing_notification(bigint,uuid),
  erp_private.capture_numbered_filing_notification_on_completion(),
  erp_private.lock_numbered_filing_notification_recipient(bigint,bigint)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.f10_numbered_filing_notification_recipient(bigint,bigint)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.f10_numbered_filing_notification_recipient(bigint,bigint) TO service_role;

-- Keep the current F10 recorder, including its retirement, fleet and HR hooks.
-- Fail deployment if a later migration replaced any of the named anchors.
DO $migration$
DECLARE
  body text := pg_get_functiondef('public.f10_record_notification_recipient(bigint,uuid,bigint,boolean)'::regprocedure);
  resume_body text := pg_get_functiondef('public.f10_resume_notification_channel(bigint,uuid,bigint,boolean)'::regprocedure);
  patch record;
BEGIN
  FOR patch IN SELECT * FROM (VALUES
    ($old$IF NOT erp_private.ai_mod04_notification_recipient(e.id,$3) THEN $4:=false; END IF;$old$,
      $new$IF NOT erp_private.ai_mod04_notification_recipient(e.id,$3)
   OR (e.event_type='dms_numbered_filing_committed'
     AND NOT erp_private.lock_numbered_filing_notification_recipient(e.id,$3)) THEN $4:=false; END IF;$new$),
    ($old$wants_email:=e.event_type<>'approval_withdrawn';$old$,
      $new$wants_email:=e.event_type NOT IN ('approval_withdrawn','dms_numbered_filing_committed');$new$),
    ($old$ELSE 'ERP task updated' END,$old$,
      $new$WHEN e.event_type='dms_numbered_filing_committed' THEN 'Document filed' ELSE 'ERP task updated' END,$new$),
    ($old$ELSE 'A task may need your attention. Open the ERP to review its current state and permitted actions.' END,$old$,
      $new$WHEN e.event_type='dms_numbered_filing_committed' THEN 'Open the ERP record to review the filed document.'
    ELSE 'A task may need your attention. Open the ERP to review its current state and permitted actions.' END,$new$),
    ($old$jsonb_build_object('f10_event_id',e.id)$old$,
      $new$jsonb_build_object('f10_event_id',e.id) ||
    CASE WHEN e.event_type='dms_numbered_filing_committed'
      THEN jsonb_build_object('operation_id',e.source_snapshot->'operation_id') ELSE '{}'::jsonb END$new$)
  ) AS changes(before_text, after_text)
  LOOP
    IF length(body) - length(replace(body,patch.before_text,'')) <> length(patch.before_text) THEN
      RAISE EXCEPTION 'Current F10 recipient recorder does not match the filing migration';
    END IF;
    body := replace(body,patch.before_text,patch.after_text);
  END LOOP;
  EXECUTE body;

  FOR patch IN SELECT * FROM (VALUES
    ($old$SELECT * INTO n FROM public.erp_notifications WHERE id=r.notification_id FOR UPDATE;$old$,
      $new$IF e.event_type='dms_numbered_filing_committed' THEN
  RETURN jsonb_build_object('state','held','outcome','filing_notification_is_in_app_only'); END IF;
 SELECT * INTO n FROM public.erp_notifications WHERE id=r.notification_id FOR UPDATE;$new$)
  ) AS changes(before_text, after_text)
  LOOP
    IF length(resume_body) - length(replace(resume_body,patch.before_text,'')) <> length(patch.before_text) THEN
      RAISE EXCEPTION 'Current F10 email recovery does not match the filing migration';
    END IF;
    resume_body := replace(resume_body,patch.before_text,patch.after_text);
  END LOOP;
  EXECUTE resume_body;
END $migration$;

-- Backfill the single approved pilot receipt. Other historical approvals are
-- neither enqueued nor changed. On a fresh database this step does nothing.
DO $backfill$
DECLARE
  pilot_operation constant uuid := '528516d2-4201-4373-8aef-102878b6b60a';
  pilot_actor bigint;
BEGIN
  SELECT actor_id INTO pilot_actor FROM erp_private.ai_approval_plans
   WHERE operation_id = pilot_operation AND document_id = 772 AND document_no = 'DMS-2026-000763'
     AND upload_session_id = 1163 AND approve_run_id = 705;
  IF FOUND AND erp_private.capture_numbered_filing_notification(pilot_actor, pilot_operation) IS NULL THEN
    RAISE EXCEPTION 'The pilot filing receipt is not eligible for notification backfill';
  END IF;
END $backfill$;

NOTIFY pgrst, 'reload schema';
COMMIT;
