BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE erp_private.f07_intake_analyses ADD COLUMN publication_claim_at timestamptz;

-- Pin the processing revision while the existing attestation holds the intake lock.
CREATE FUNCTION erp_private.dms_pin_intake_analysis_claim() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  SELECT s.updated_at INTO NEW.publication_claim_at
  FROM public.dms_upload_sessions s
  JOIN public.dms_ai_extraction_jobs j ON j.id = NEW.job_id AND j.upload_session_id = s.id
  WHERE s.id = NEW.upload_session_id AND s.intake_status = 'ai_processing'
    AND j.run_source = 'ai_intake';
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION erp_private.dms_pin_intake_analysis_claim() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER dms_pin_intake_analysis_claim BEFORE INSERT ON erp_private.f07_intake_analyses
  FOR EACH ROW EXECUTE FUNCTION erp_private.dms_pin_intake_analysis_claim();

CREATE TABLE erp_private.dms_intake_publication_receipts (
  result_id bigint PRIMARY KEY,
  upload_session_id bigint NOT NULL,
  job_id bigint NOT NULL,
  actor_id bigint NOT NULL,
  claim_at timestamptz NOT NULL
);
ALTER TABLE erp_private.dms_intake_publication_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.dms_intake_publication_receipts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON erp_private.dms_intake_publication_receipts TO erp_transaction_audit_writer;
CREATE POLICY dms_intake_publication_receipt_actor ON erp_private.dms_intake_publication_receipts
  TO erp_transaction_audit_writer
  USING (actor_id = (SELECT public.current_user_profile_id()))
  WITH CHECK (actor_id = (SELECT public.current_user_profile_id()));

-- The narrow proof check can read the service attestations without granting
-- access to their tables. The writer already holds the locked intake row.
CREATE FUNCTION erp_private.dms_check_intake_publication_proof(
  p_session bigint, p_claim_at timestamptz, p_job bigint, p_result bigint
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor bigint := public.current_user_profile_id();
  verified_source jsonb;
BEGIN
  verified_source := erp_private.f07_intake_source(p_session);
  PERFORM o.id
  FROM erp_private.f07_intake_sources s
  JOIN erp_private.f07_intake_analyses a ON a.upload_session_id = s.upload_session_id
  JOIN public.dms_ai_extraction_results r ON r.id = a.result_id AND r.upload_session_id = s.upload_session_id
  JOIN public.dms_ai_extraction_jobs j ON j.id = r.job_id AND j.upload_session_id = s.upload_session_id
  JOIN storage.objects o ON o.bucket_id = 'dms-temp' AND o.name = verified_source->>'path'
  WHERE s.upload_session_id = p_session AND s.source = verified_source
    AND a.result_id = p_result AND a.job_id = p_job AND j.id = p_job
    AND a.actor_id = actor AND j.created_by = actor AND a.publication_claim_at = p_claim_at
    AND j.status = 'complete' AND j.run_source = 'ai_intake' AND j.document_id IS NULL
    AND r.ai_status = 'pending_review' AND r.document_id IS NULL
    AND a.analysis_digest = erp_private.f07_intake_analysis_digest(r)
    AND a.source_sha256 = s.sha256
    AND ROW(a.object_id,a.object_version,a.object_updated_at) = ROW(s.object_id,s.object_version,s.object_updated_at)
    AND ROW(o.id,o.version,o.updated_at) = ROW(s.object_id,s.object_version,s.object_updated_at)
  FOR SHARE OF r,j,o;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Intake publication proof unavailable' USING ERRCODE = 'PT409';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION erp_private.dms_check_intake_publication_proof(bigint,timestamptz,bigint,bigint)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION erp_private.dms_check_intake_publication_proof(bigint,timestamptz,bigint,bigint)
  TO erp_transaction_audit_writer;
GRANT EXECUTE ON FUNCTION erp_private.f07_lock_intake_review_authority(bigint) TO erp_transaction_audit_writer;

CREATE FUNCTION erp_private.dms_publish_intake_classification(
  p_session bigint, p_code text, p_claim_at timestamptz, p_job bigint, p_result bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor bigint := public.current_user_profile_id();
  upload public.dms_upload_sessions%ROWTYPE;
  receipt erp_private.dms_intake_publication_receipts%ROWTYPE;
  job public.dms_ai_extraction_jobs%ROWTYPE;
  result public.dms_ai_extraction_results%ROWTYPE;
  classification jsonb;
  needs_review boolean;
BEGIN
  PERFORM erp_private.f07_lock_intake_review_authority(p_session);
  SELECT * INTO upload FROM public.dms_upload_sessions WHERE id = p_session AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR upload.session_code IS DISTINCT FROM p_code THEN
    RAISE EXCEPTION 'Intake publication unavailable' USING ERRCODE = '42501';
  END IF;
  PERFORM erp_private.dms_check_intake_publication_proof(p_session,p_claim_at,p_job,p_result);

  SELECT * INTO receipt FROM erp_private.dms_intake_publication_receipts WHERE result_id = p_result;
  IF FOUND THEN
    IF ROW(receipt.upload_session_id,receipt.job_id,receipt.claim_at) IS DISTINCT FROM ROW(p_session,p_job,p_claim_at)
      OR ROW(upload.ai_job_id,upload.ai_result_id) IS DISTINCT FROM ROW(p_job,p_result)
      OR upload.intake_status NOT IN ('review_pending','review_in_progress') THEN
      RAISE EXCEPTION 'Intake publication changed' USING ERRCODE = 'PT409';
    END IF;
  ELSE
    IF upload.intake_status <> 'ai_processing' OR upload.updated_at IS DISTINCT FROM p_claim_at
      OR upload.ai_result_id IS NOT NULL OR upload.document_id IS NOT NULL THEN
      RAISE EXCEPTION 'Intake processing claim changed' USING ERRCODE = 'PT409';
    END IF;
    SELECT * INTO STRICT job FROM public.dms_ai_extraction_jobs WHERE id = p_job;
    SELECT * INTO STRICT result FROM public.dms_ai_extraction_results WHERE id = p_result;
    classification := result.raw_response_json->'classification';
    needs_review := COALESCE(classification->>'needs_human_review' = 'true',false);

    UPDATE public.dms_upload_sessions
    SET intake_status = 'review_pending', review_status = 'pending',
        ai_job_id = p_job, ai_result_id = p_result, updated_at = clock_timestamp()
    WHERE id = upload.id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Intake publication unavailable' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.audit_logs
      (actor_user_profile_id, owner_company_id, branch_id, module_code, entity_name, entity_id,
       entity_reference, action, new_values)
    VALUES (actor,upload.owning_company_id,upload.owning_branch_id,'DMS','dms_upload_sessions',
      upload.id,upload.session_code,'update',jsonb_build_object(
        'event','classification_completed','job_id',p_job,'result_id',p_result,'duration_ms',job.duration_ms,
        'suggested_type_code',classification->>'suggested_type_code','classification_score',result.classification_score,
        'needs_human_review',needs_review,'prompt_version',job.prompt_version));
    IF needs_review OR result.classification_score < 0.6 THEN
      INSERT INTO public.audit_logs
        (actor_user_profile_id, owner_company_id, branch_id, module_code, entity_name, entity_id,
         entity_reference, action, new_values)
      VALUES (actor,upload.owning_company_id,upload.owning_branch_id,'DMS','dms_upload_sessions',
        upload.id,upload.session_code,'update',jsonb_build_object(
          'event','classification_low_confidence','result_id',p_result,'classification_score',result.classification_score,
          'review_reason',classification->>'review_reason'));
    END IF;
    INSERT INTO erp_private.dms_intake_publication_receipts(result_id,upload_session_id,job_id,actor_id,claim_at)
    VALUES (p_result,p_session,p_job,actor,p_claim_at);
  END IF;

  RETURN jsonb_build_object('id',p_session,'session_code',p_code,'intake_status','review_pending',
    'review_status','pending','ai_job_id',p_job,'ai_result_id',p_result);
END;
$$;

GRANT CREATE ON SCHEMA erp_private TO erp_transaction_audit_writer;
ALTER FUNCTION erp_private.dms_publish_intake_classification(bigint,text,timestamptz,bigint,bigint)
  OWNER TO erp_transaction_audit_writer;
REVOKE CREATE ON SCHEMA erp_private FROM erp_transaction_audit_writer;

CREATE FUNCTION public.dms_publish_intake_classification(
  p_session bigint, p_code text, p_claim_at timestamptz, p_job bigint, p_result bigint
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT erp_private.dms_publish_intake_classification($1,$2,$3,$4,$5);
$$;

REVOKE ALL ON FUNCTION erp_private.dms_publish_intake_classification(bigint,text,timestamptz,bigint,bigint),
  public.dms_publish_intake_classification(bigint,text,timestamptz,bigint,bigint)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION erp_private.dms_publish_intake_classification(bigint,text,timestamptz,bigint,bigint),
  public.dms_publish_intake_classification(bigint,text,timestamptz,bigint,bigint) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
