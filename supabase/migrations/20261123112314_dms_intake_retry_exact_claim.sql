BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE erp_private.dms_intake_retry_receipts (
  actor_id bigint NOT NULL,
  auth_session_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  upload_session_id bigint NOT NULL,
  request_hash text NOT NULL,
  session_code text NOT NULL,
  reset_at timestamptz NOT NULL,
  PRIMARY KEY (actor_id, auth_session_id, operation_id)
);
ALTER TABLE erp_private.dms_intake_retry_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.dms_intake_retry_receipts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON erp_private.dms_intake_retry_receipts TO erp_transaction_audit_writer;
CREATE POLICY dms_intake_retry_receipt_actor ON erp_private.dms_intake_retry_receipts
  TO erp_transaction_audit_writer
  USING (actor_id = (SELECT public.current_user_profile_id())
    AND auth_session_id::text = (SELECT auth.jwt()->>'session_id'))
  WITH CHECK (actor_id = (SELECT public.current_user_profile_id())
    AND auth_session_id::text = (SELECT auth.jwt()->>'session_id'));

CREATE FUNCTION erp_private.dms_lock_intake_retry_session() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM auth.users WHERE id = auth.uid() FOR SHARE;
  PERFORM 1 FROM auth.sessions
  WHERE user_id = auth.uid() AND id::text = auth.jwt()->>'session_id'
  FOR SHARE;
  IF NOT FOUND OR NOT erp_private.business_principal_is_active() THEN
    RAISE EXCEPTION 'Active ERP session required' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION erp_private.dms_lock_intake_retry_session()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION erp_private.dms_lock_intake_retry_session() TO erp_transaction_audit_writer;

CREATE FUNCTION erp_private.dms_reset_intake_retry(
  p_session bigint,
  p_operation uuid,
  p_expected_updated_at timestamptz,
  p_expected_source jsonb,
  p_expected_state jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' SET lock_timeout = '5s' AS $$
DECLARE
  actor bigint := public.current_user_profile_id();
  auth_session uuid := (auth.jwt()->>'session_id')::uuid;
  upload public.dms_upload_sessions%ROWTYPE;
  receipt erp_private.dms_intake_retry_receipts%ROWTYPE;
  source jsonb;
  state jsonb;
  request_hash text;
  changed_at timestamptz;
BEGIN
  IF p_session IS NULL OR p_session < 1 OR p_operation IS NULL OR p_expected_updated_at IS NULL
    OR jsonb_typeof(p_expected_source) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_expected_state) IS DISTINCT FROM 'object'
    OR octet_length(p_expected_source::text) > 8192 OR octet_length(p_expected_state::text) > 1024 THEN
    RAISE EXCEPTION 'Invalid intake retry request' USING ERRCODE = '22023';
  END IF;

  PERFORM erp_private.dms_lock_intake_retry_session();
  PERFORM erp_private.f07_lock_intake_review_authority(p_session);
  SELECT * INTO upload FROM public.dms_upload_sessions WHERE id = p_session AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Intake retry unavailable' USING ERRCODE = '42501';
  END IF;

  -- Repeat the canonical exact subject, source and scope check under the row lock.
  source := public.f07_prepare_intake_source(p_session)->'source';
  IF source IS DISTINCT FROM p_expected_source THEN
    RAISE EXCEPTION 'Intake retry source changed' USING ERRCODE = 'PT409';
  END IF;

  request_hash := encode(sha256(convert_to(jsonb_build_array(
    p_session, p_expected_updated_at AT TIME ZONE 'UTC', p_expected_source, p_expected_state
  )::text, 'UTF8')), 'hex');
  SELECT * INTO receipt FROM erp_private.dms_intake_retry_receipts r
  WHERE r.actor_id = actor AND r.auth_session_id = auth_session AND r.operation_id = p_operation;
  IF FOUND THEN
    IF receipt.upload_session_id IS DISTINCT FROM p_session OR receipt.request_hash IS DISTINCT FROM request_hash THEN
      RAISE EXCEPTION 'Intake retry request changed' USING ERRCODE = 'PT409';
    END IF;
    RETURN jsonb_build_object('id', p_session, 'session_code', receipt.session_code,
      'intake_status', 'uploaded', 'updated_at', receipt.reset_at,
      'outcome', CASE WHEN upload.updated_at = receipt.reset_at AND upload.session_code = receipt.session_code
        AND upload.status::text = p_expected_state->>'status'
        AND upload.intake_status = 'uploaded' AND upload.review_status = 'not_started'
        AND upload.ai_result_id IS NULL AND upload.document_id IS NULL AND upload.approve_run_id IS NULL
        AND upload.batch_draft_operation_id IS NULL AND upload.temp_cleaned_at IS NULL
        AND upload.discarded_at IS NULL AND upload.is_duplicate IS FALSE
        THEN 'reset' ELSE 'advanced' END);
  END IF;

  state := jsonb_build_object('status', upload.status, 'intake_status', upload.intake_status,
    'review_status', upload.review_status, 'ai_result_id', upload.ai_result_id);
  IF upload.updated_at IS DISTINCT FROM p_expected_updated_at OR state IS DISTINCT FROM p_expected_state
    OR NOT COALESCE(upload.intake_status IN ('failed', 'review_pending', 'review_in_progress')
      AND upload.status IN ('uploaded', 'processing', 'ocr_queued', 'ai_queued', 'review_pending', 'failed')
      AND upload.review_status NOT IN ('approved', 'discarded'), false)
    OR upload.batch_draft_operation_id IS NOT NULL OR upload.document_id IS NOT NULL
    OR upload.approve_run_id IS NOT NULL OR upload.temp_cleaned_at IS NOT NULL OR upload.discarded_at IS NOT NULL
    OR upload.is_duplicate IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Intake retry state changed' USING ERRCODE = 'PT409';
  END IF;

  UPDATE public.dms_upload_sessions
  SET intake_status = 'uploaded', review_status = 'not_started', ai_result_id = NULL,
      updated_at = greatest(clock_timestamp(), p_expected_updated_at + interval '1 microsecond')
  WHERE id = p_session AND updated_at = p_expected_updated_at
  RETURNING updated_at INTO changed_at;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Intake retry unavailable' USING ERRCODE = '42501';
  END IF;

  INSERT INTO erp_private.dms_intake_retry_receipts
    (actor_id, auth_session_id, operation_id, upload_session_id, request_hash, session_code, reset_at)
  VALUES (actor, auth_session, p_operation, p_session, request_hash, upload.session_code, changed_at);

  RETURN jsonb_build_object('id', p_session, 'session_code', upload.session_code,
    'intake_status', 'uploaded', 'updated_at', changed_at, 'outcome', 'reset');
END;
$$;

GRANT CREATE ON SCHEMA erp_private TO erp_transaction_audit_writer;
ALTER FUNCTION erp_private.dms_reset_intake_retry(bigint,uuid,timestamptz,jsonb,jsonb)
  OWNER TO erp_transaction_audit_writer;
REVOKE CREATE ON SCHEMA erp_private FROM erp_transaction_audit_writer;

CREATE FUNCTION public.dms_reset_intake_retry(
  p_session bigint,
  p_operation uuid,
  p_expected_updated_at timestamptz,
  p_expected_source jsonb,
  p_expected_state jsonb
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT erp_private.dms_reset_intake_retry($1,$2,$3,$4,$5);
$$;
REVOKE ALL ON FUNCTION erp_private.dms_reset_intake_retry(bigint,uuid,timestamptz,jsonb,jsonb),
  public.dms_reset_intake_retry(bigint,uuid,timestamptz,jsonb,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION erp_private.dms_reset_intake_retry(bigint,uuid,timestamptz,jsonb,jsonb),
  public.dms_reset_intake_retry(bigint,uuid,timestamptz,jsonb,jsonb) TO authenticated;

-- Bind synchronous analysis to the actual revision observed by its caller.
-- The existing exact-file attestation pins that revision under the same lock.
CREATE FUNCTION public.f07_attest_intake_analysis(
  p_session bigint, p_actor bigint, p_auth_session uuid, p_result bigint, p_expected jsonb,
  p_claim_at timestamptz
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' SET lock_timeout = '5s' AS $$
BEGIN
  IF auth.jwt()->>'role' IS DISTINCT FROM 'service_role'
    OR NOT erp_private.provider_actor_session_valid(p_actor,p_auth_session) THEN
    RAISE EXCEPTION 'Analysis session unavailable' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.dms_upload_sessions
  WHERE id = p_session AND deleted_at IS NULL AND intake_status = 'ai_processing'
    AND updated_at = p_claim_at AND ai_result_id IS NULL AND document_id IS NULL AND approve_run_id IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Intake processing claim changed' USING ERRCODE = 'PT409';
  END IF;

  PERFORM public.f07_attest_intake_analysis(p_session,p_actor,p_auth_session,p_result,p_expected);
  IF NOT EXISTS (SELECT 1 FROM erp_private.f07_intake_analyses
    WHERE result_id = p_result AND upload_session_id = p_session AND actor_id = p_actor
      AND publication_claim_at = p_claim_at) THEN
    RAISE EXCEPTION 'Intake analysis belongs to a different processing claim' USING ERRCODE = 'PT409';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.f07_attest_intake_analysis(bigint,bigint,uuid,bigint,jsonb,timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.f07_attest_intake_analysis(bigint,bigint,uuid,bigint,jsonb,timestamptz)
  TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
