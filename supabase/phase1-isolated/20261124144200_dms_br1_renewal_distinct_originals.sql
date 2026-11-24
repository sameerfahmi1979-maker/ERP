BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Held with the existing supervised BR1 renewal guard and notice migration.
DO $require_guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'public.dms_renewal_requests'::regclass
      AND tgname = 'dms_br1_labour_card_renewal_guard'
      AND tgenabled = 'O' AND tgdeferrable AND tginitdeferred
      AND tgfoid = to_regprocedure('erp_private.dms_br1_labour_card_renewal_guard()')
  ) THEN
    RAISE EXCEPTION 'Install the supervised BR1 renewal guard first';
  END IF;
END $require_guard$;

-- Numbered filing stores a byte attestation independently of the file's
-- initially pending integrity status. Require its completed run and the
-- same current Storage object before treating that file as verified here.
CREATE FUNCTION erp_private.dms_br1_numbered_original_verified(original public.dms_document_files)
RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  PERFORM object.id
  FROM erp_private.ai_approval_plans plan
  JOIN erp_private.ai_approval_verified_copies proof
    ON (proof.actor_id, proof.operation_id, proof.request_hash)
     = (plan.actor_id, plan.operation_id, plan.request_hash)
  JOIN public.dms_approve_runs run
    ON (run.id, run.upload_session_id, run.document_id, run.started_by)
     = (plan.approve_run_id, plan.upload_session_id, plan.document_id, plan.actor_id)
    AND run.status = 'completed' AND run.run_key = 'f06-ai:' || plan.actor_id || ':' || plan.operation_id
    AND run.final_storage_bucket = original.storage_bucket AND run.final_storage_path = plan.storage_path
  JOIN public.dms_upload_sessions intake
    ON (intake.id, intake.approve_run_id, intake.document_id, intake.reviewed_by)
     = (plan.upload_session_id, run.id, plan.document_id, plan.actor_id)
    AND intake.status = 'completed' AND intake.intake_status = 'approved'
    AND intake.approve_status = 'completed'
  JOIN storage.objects object
    ON (object.id, object.bucket_id, object.name, object.version, object.updated_at)
     = (proof.object_id, original.storage_bucket, original.storage_path, proof.object_version, proof.object_updated_at)
    AND object.metadata->>'size' = original.file_size_bytes::text
    AND object.metadata->>'mimetype' = original.mime_type
  WHERE plan.document_id = original.document_id AND plan.storage_path = original.storage_path
    AND plan.completed_at IS NOT NULL AND original.storage_bucket = 'dms-documents'
    AND (proof.content_sha256, proof.file_size_bytes, proof.file_name)
      = (lower(original.sha256_hash), original.file_size_bytes, original.file_name)
    AND plan.result @> jsonb_build_object('documentId', original.document_id, 'file_id', original.id,
      'approve_run_id', run.id, 'upload_session_id', plan.upload_session_id, 'operation_id', plan.operation_id,
      'completed', true, 'replayed', false)
  FOR SHARE OF object;
  RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION erp_private.dms_br1_numbered_original_verified(public.dms_document_files)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION erp_private.dms_br1_labour_card_renewal_originals_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  predecessor_hash text;
  replacement_hash text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'renewed' THEN RETURN NULL; END IF;

  -- Keep the native renewal document lock order across metadata/file changes.
  PERFORM d.id FROM public.dms_documents d
  WHERE d.id IN (NEW.document_id, NEW.replacement_document_id)
  ORDER BY d.id FOR UPDATE;

  SELECT CASE WHEN count(*) = 1 AND bool_and(
      f.file_size_bytes > 0 AND f.sha256_hash ~ '^[0-9A-Fa-f]{64}$'
      AND CASE f.integrity_status WHEN 'verified' THEN true
        WHEN 'pending' THEN erp_private.dms_br1_numbered_original_verified(f) ELSE false END
    ) THEN min(lower(f.sha256_hash)) END
    INTO predecessor_hash
  FROM public.dms_documents d
  JOIN public.dms_document_versions v
    ON v.id = d.current_version_id AND v.document_id = d.id
    AND v.is_current AND v.unlinked_at IS NULL
  JOIN public.dms_document_files f
    ON f.document_id = d.id AND f.version_id = v.id
    AND f.file_role = 'original' AND f.deleted_at IS NULL
  WHERE d.id = NEW.document_id;

  IF predecessor_hash IS NULL THEN
    RAISE EXCEPTION 'Renewal requires the exact hashed predecessor original' USING ERRCODE = 'PT409';
  END IF;

  SELECT CASE WHEN count(*) = 1 AND bool_and(
      f.file_size_bytes > 0 AND f.sha256_hash ~ '^[0-9A-Fa-f]{64}$'
      AND CASE f.integrity_status WHEN 'verified' THEN true
        WHEN 'pending' THEN erp_private.dms_br1_numbered_original_verified(f) ELSE false END
    ) THEN min(lower(f.sha256_hash)) END
    INTO replacement_hash
  FROM public.dms_document_files f
  WHERE f.document_id = NEW.replacement_document_id AND f.version_id = NEW.replacement_version_id
    AND f.file_role = 'original' AND f.deleted_at IS NULL;

  IF replacement_hash IS NULL OR replacement_hash = predecessor_hash THEN
    RAISE EXCEPTION 'Renewal requires verified replacement bytes distinct from the predecessor original'
      USING ERRCODE = 'PT409';
  END IF;
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION erp_private.dms_br1_labour_card_renewal_originals_guard()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE CONSTRAINT TRIGGER dms_br1_labour_card_renewal_originals_guard
  AFTER INSERT OR UPDATE OF status ON public.dms_renewal_requests
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (NEW.document_id = 127 AND NEW.status = 'renewed')
  EXECUTE FUNCTION erp_private.dms_br1_labour_card_renewal_originals_guard();

COMMIT;
