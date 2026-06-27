-- ============================================================================
-- ERP DMS AI Phase 4 — Transactional Approve & Save Command Chain
-- Additive approve-run tracking + atomic approve RPC.
-- ============================================================================

-- ── 1. Approve run tracking ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dms_approve_runs (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  upload_session_id    BIGINT NOT NULL REFERENCES public.dms_upload_sessions(id) ON DELETE CASCADE,
  document_id          BIGINT NULL REFERENCES public.dms_documents(id) ON DELETE SET NULL,
  ai_result_id         BIGINT NULL REFERENCES public.dms_ai_extraction_results(id) ON DELETE SET NULL,
  run_key              TEXT NOT NULL UNIQUE,
  status               TEXT NOT NULL DEFAULT 'started',
  stage                TEXT NULL,
  final_storage_bucket TEXT NULL,
  final_storage_path   TEXT NULL,
  error_code           TEXT NULL,
  error_message        TEXT NULL,
  metadata_json        JSONB NULL,
  started_by           BIGINT NULL REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  started_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at         TIMESTAMPTZ NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dms_approve_runs_session
  ON public.dms_approve_runs(upload_session_id);

CREATE INDEX IF NOT EXISTS idx_dms_approve_runs_document
  ON public.dms_approve_runs(document_id)
  WHERE document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dms_approve_runs_status
  ON public.dms_approve_runs(status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dms_approve_runs_one_success_per_session
  ON public.dms_approve_runs(upload_session_id)
  WHERE status IN ('db_committed', 'completed', 'already_approved');

ALTER TABLE public.dms_approve_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dms_approve_runs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dms_approve_runs_select ON public.dms_approve_runs;
CREATE POLICY dms_approve_runs_select
  ON public.dms_approve_runs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.dms_upload_sessions s
      WHERE s.id = dms_approve_runs.upload_session_id
        AND (
          s.uploaded_by = current_user_profile_id()
          OR current_user_has_permission('dms.documents.review_ai')
          OR current_user_has_permission('dms.admin')
          OR current_user_has_role('system_admin')
        )
    )
  );

DROP POLICY IF EXISTS dms_approve_runs_insert ON public.dms_approve_runs;
CREATE POLICY dms_approve_runs_insert
  ON public.dms_approve_runs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    current_user_has_permission('dms.documents.upload')
    OR current_user_has_permission('dms.documents.review_ai')
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS dms_approve_runs_update ON public.dms_approve_runs;
CREATE POLICY dms_approve_runs_update
  ON public.dms_approve_runs
  FOR UPDATE
  TO authenticated
  USING (
    current_user_has_permission('dms.documents.upload')
    OR current_user_has_permission('dms.documents.review_ai')
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  )
  WITH CHECK (
    current_user_has_permission('dms.documents.upload')
    OR current_user_has_permission('dms.documents.review_ai')
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  );

-- ── 2. Upload-session approve status columns ─────────────────────────────────

ALTER TABLE public.dms_upload_sessions
  ADD COLUMN IF NOT EXISTS approve_run_id BIGINT NULL REFERENCES public.dms_approve_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approve_status TEXT NULL,
  ADD COLUMN IF NOT EXISTS approve_error TEXT NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_dms_upload_sessions_approve_run
  ON public.dms_upload_sessions(approve_run_id)
  WHERE approve_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dms_upload_sessions_approve_status
  ON public.dms_upload_sessions(approve_status)
  WHERE approve_status IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dms_upload_sessions_one_approved_document
  ON public.dms_upload_sessions(id, document_id)
  WHERE intake_status = 'approved' AND document_id IS NOT NULL;

-- ── 3. Reserve document ID helper ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reserve_dms_document_id()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id BIGINT;
  v_next_id BIGINT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  v_actor_id := current_user_profile_id();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'User profile not found' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    current_user_has_permission('dms.documents.upload')
    OR current_user_has_permission('dms.documents.review_ai')
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  ) THEN
    RAISE EXCEPTION 'Permission denied for DMS document ID reservation' USING ERRCODE = '42501';
  END IF;

  SELECT nextval(pg_get_serial_sequence('public.dms_documents', 'id'))
  INTO v_next_id;

  RETURN v_next_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_dms_document_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_dms_document_id() TO authenticated;

-- ── 4. Atomic core approve RPC ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.approve_dms_ai_intake(p_payload JSONB)
RETURNS TABLE(document_id BIGINT, document_no TEXT, status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id BIGINT;
  v_mode TEXT := COALESCE(p_payload->>'mode', 'single_file_new_document');
  v_upload_session_id BIGINT := NULLIF(p_payload->>'upload_session_id', '')::BIGINT;
  v_approve_run_id BIGINT := NULLIF(p_payload->>'approve_run_id', '')::BIGINT;
  v_ai_result_id BIGINT := NULLIF(p_payload->>'ai_result_id', '')::BIGINT;
  v_document_id BIGINT := NULLIF(p_payload->>'document_id', '')::BIGINT;
  v_document_no TEXT := NULLIF(p_payload->>'document_no', '');
  v_now TIMESTAMPTZ := now();
  v_session public.dms_upload_sessions%ROWTYPE;
  v_existing_document_no TEXT;
  v_version_id BIGINT;
  v_file_id BIGINT;
  v_item JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  v_actor_id := current_user_profile_id();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'User profile not found' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    current_user_has_permission('dms.documents.upload')
    OR current_user_has_permission('dms.documents.review_ai')
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  ) THEN
    RAISE EXCEPTION 'Permission denied for DMS AI intake approval' USING ERRCODE = '42501';
  END IF;

  IF v_upload_session_id IS NULL THEN
    RAISE EXCEPTION 'upload_session_id is required' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_session
  FROM public.dms_upload_sessions
  WHERE id = v_upload_session_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Upload session not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_session.intake_status = 'approved' AND v_session.document_id IS NOT NULL THEN
    SELECT d.document_no
    INTO v_existing_document_no
    FROM public.dms_documents d
    WHERE d.id = v_session.document_id;

    IF v_approve_run_id IS NOT NULL THEN
      UPDATE public.dms_approve_runs
      SET status = 'already_approved',
          stage = 'approve_save_already_approved',
          document_id = v_session.document_id,
          completed_at = v_now,
          updated_at = v_now,
          metadata_json = COALESCE(metadata_json, '{}'::jsonb) || jsonb_build_object('returned_existing_document', true)
      WHERE id = v_approve_run_id;
    END IF;

    RETURN QUERY SELECT v_session.document_id, v_existing_document_no, 'already_approved'::TEXT;
    RETURN;
  END IF;

  IF v_session.intake_status IN ('discarded', 'cancelled', 'expired') THEN
    RAISE EXCEPTION 'Upload session is not eligible for approval: %', v_session.intake_status USING ERRCODE = '22023';
  END IF;

  IF v_session.approve_status = 'processing'
     AND v_session.approve_run_id IS NOT NULL
     AND (v_approve_run_id IS NULL OR v_session.approve_run_id <> v_approve_run_id) THEN
    RAISE EXCEPTION 'Approval is already in progress for this upload session' USING ERRCODE = '55P03';
  END IF;

  IF v_mode NOT IN ('single_file_new_document', 'existing_batch_draft') THEN
    RAISE EXCEPTION 'Unsupported approve mode: %', v_mode USING ERRCODE = '22023';
  END IF;

  IF v_document_no IS NULL THEN
    RAISE EXCEPTION 'document_no is required' USING ERRCODE = '22023';
  END IF;

  IF v_mode = 'single_file_new_document' THEN
    IF v_document_id IS NULL THEN
      RAISE EXCEPTION 'reserved document_id is required for single file approval' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.dms_documents (
      id,
      document_no,
      title,
      description,
      document_type_id,
      category_id,
      status,
      confidentiality_level,
      owner_user_id,
      owning_company_id,
      owning_branch_id,
      party_id,
      issue_date,
      expiry_date,
      created_by,
      created_at,
      updated_by,
      updated_at
    )
    OVERRIDING SYSTEM VALUE
    VALUES (
      v_document_id,
      v_document_no,
      p_payload->>'title',
      NULLIF(p_payload->>'description', ''),
      (p_payload->>'document_type_id')::BIGINT,
      (p_payload->>'category_id')::BIGINT,
      'active',
      COALESCE(NULLIF(p_payload->>'confidentiality_level', ''), 'internal'),
      v_actor_id,
      NULLIF(p_payload->>'owning_company_id', '')::BIGINT,
      NULLIF(p_payload->>'owning_branch_id', '')::BIGINT,
      NULLIF(p_payload->>'party_id', '')::BIGINT,
      NULLIF(p_payload->>'issue_date', '')::DATE,
      NULLIF(p_payload->>'expiry_date', '')::DATE,
      v_actor_id,
      v_now,
      v_actor_id,
      v_now
    );
  ELSE
    v_document_id := COALESCE(v_document_id, v_session.document_id);
    IF v_document_id IS NULL THEN
      RAISE EXCEPTION 'document_id is required for batch draft approval' USING ERRCODE = '22023';
    END IF;

    UPDATE public.dms_documents
    SET title = p_payload->>'title',
        description = NULLIF(p_payload->>'description', ''),
        document_type_id = (p_payload->>'document_type_id')::BIGINT,
        category_id = (p_payload->>'category_id')::BIGINT,
        status = 'active',
        confidentiality_level = COALESCE(NULLIF(p_payload->>'confidentiality_level', ''), confidentiality_level, 'internal'),
        owning_company_id = NULLIF(p_payload->>'owning_company_id', '')::BIGINT,
        owning_branch_id = NULLIF(p_payload->>'owning_branch_id', '')::BIGINT,
        party_id = NULLIF(p_payload->>'party_id', '')::BIGINT,
        issue_date = NULLIF(p_payload->>'issue_date', '')::DATE,
        expiry_date = NULLIF(p_payload->>'expiry_date', '')::DATE,
        updated_by = v_actor_id,
        updated_at = v_now
    WHERE id = v_document_id
      AND deleted_at IS NULL
      AND status = 'pending_ai_review';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Batch draft document is not eligible for approval' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF COALESCE((p_payload->>'create_file_version')::BOOLEAN, true) THEN
    INSERT INTO public.dms_document_versions (
      document_id,
      version_number,
      version_label,
      change_notes,
      is_current,
      created_by,
      created_at
    )
    VALUES (
      v_document_id,
      COALESCE(NULLIF(p_payload->>'version_number', '')::INT, 1),
      COALESCE(NULLIF(p_payload->>'version_label', ''), 'v1'),
      COALESCE(NULLIF(p_payload->>'change_notes', ''), 'Created from AI intake'),
      true,
      v_actor_id,
      v_now
    )
    RETURNING id INTO v_version_id;

    INSERT INTO public.dms_document_files (
      document_id,
      version_id,
      file_role,
      storage_bucket,
      storage_path,
      file_name,
      mime_type,
      file_size_bytes,
      sha256_hash,
      created_by,
      created_at
    )
    VALUES (
      v_document_id,
      v_version_id,
      'original',
      p_payload->>'final_storage_bucket',
      p_payload->>'final_storage_path',
      p_payload->>'file_name',
      p_payload->>'mime_type',
      (p_payload->>'file_size_bytes')::BIGINT,
      NULLIF(p_payload->>'sha256_hash', ''),
      v_actor_id,
      v_now
    )
    RETURNING id INTO v_file_id;

    UPDATE public.dms_documents
    SET current_version_id = v_version_id,
        updated_by = v_actor_id,
        updated_at = v_now
    WHERE id = v_document_id;
  ELSE
    v_file_id := NULLIF(p_payload->>'file_id', '')::BIGINT;
  END IF;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'metadata_values', '[]'::jsonb))
  LOOP
    INSERT INTO public.dms_document_metadata_values (
      document_id,
      definition_id,
      value_text,
      value_number,
      value_date,
      value_datetime,
      value_boolean,
      value_json,
      created_by,
      created_at,
      updated_by,
      updated_at
    )
    VALUES (
      v_document_id,
      (v_item->>'definition_id')::BIGINT,
      NULLIF(v_item->>'value_text', ''),
      NULLIF(v_item->>'value_number', '')::NUMERIC,
      NULLIF(v_item->>'value_date', '')::DATE,
      NULLIF(v_item->>'value_datetime', '')::TIMESTAMPTZ,
      CASE WHEN v_item ? 'value_boolean' THEN (v_item->>'value_boolean')::BOOLEAN ELSE NULL END,
      CASE WHEN v_item ? 'value_json' THEN v_item->'value_json' ELSE NULL END,
      v_actor_id,
      v_now,
      v_actor_id,
      v_now
    )
    ON CONFLICT (document_id, definition_id)
    DO UPDATE SET
      value_text = EXCLUDED.value_text,
      value_number = EXCLUDED.value_number,
      value_date = EXCLUDED.value_date,
      value_datetime = EXCLUDED.value_datetime,
      value_boolean = EXCLUDED.value_boolean,
      value_json = EXCLUDED.value_json,
      updated_by = EXCLUDED.updated_by,
      updated_at = EXCLUDED.updated_at,
      deleted_at = NULL;
  END LOOP;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'tag_ids', '[]'::jsonb))
  LOOP
    INSERT INTO public.dms_document_tags (document_id, tag_id, created_by, created_at)
    VALUES (v_document_id, (v_item #>> '{}')::BIGINT, v_actor_id, v_now)
    ON CONFLICT (document_id, tag_id) DO NOTHING;
  END LOOP;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'links', '[]'::jsonb))
  LOOP
    INSERT INTO public.dms_document_links (
      document_id,
      entity_type,
      entity_id,
      link_role,
      is_primary,
      linked_by,
      linked_at,
      created_at,
      deleted_at
    )
    SELECT
      v_document_id,
      v_item->>'entity_type',
      (v_item->>'entity_id')::BIGINT,
      COALESCE(NULLIF(v_item->>'link_role', ''), 'related'),
      COALESCE((v_item->>'is_primary')::BOOLEAN, false),
      v_actor_id,
      v_now,
      v_now,
      NULL
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.dms_document_links l
      WHERE l.document_id = v_document_id
        AND l.entity_type = v_item->>'entity_type'
        AND l.entity_id = (v_item->>'entity_id')::BIGINT
        AND l.deleted_at IS NULL
    );
  END LOOP;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'reminders', '[]'::jsonb))
  LOOP
    INSERT INTO public.dms_expiry_reminders (
      document_id,
      reminder_days_before,
      reminder_date,
      status,
      updated_at
    )
    VALUES (
      v_document_id,
      (v_item->>'reminder_days_before')::INT,
      (v_item->>'reminder_date')::DATE,
      COALESCE(NULLIF(v_item->>'status', ''), 'pending'),
      v_now
    )
    ON CONFLICT (document_id, reminder_days_before)
    DO UPDATE SET
      reminder_date = EXCLUDED.reminder_date,
      status = EXCLUDED.status,
      updated_at = EXCLUDED.updated_at;
  END LOOP;

  IF v_ai_result_id IS NOT NULL THEN
    UPDATE public.dms_ai_extraction_results
    SET ai_status = 'accepted',
        review_action = 'accepted',
        reviewed_by = v_actor_id,
        reviewed_at = v_now,
        document_id = v_document_id
    WHERE id = v_ai_result_id;
  END IF;

  UPDATE public.dms_upload_sessions
  SET status = 'completed',
      intake_status = 'approved',
      review_status = 'approved',
      document_id = v_document_id,
      approve_run_id = v_approve_run_id,
      approve_status = 'completed',
      approve_error = NULL,
      approved_at = v_now,
      review_completed_at = v_now,
      reviewed_by = v_actor_id,
      completed_at = v_now,
      updated_at = v_now
  WHERE id = v_upload_session_id;

  INSERT INTO public.dms_document_events (
    document_id,
    event_type,
    description,
    performed_by,
    performed_at,
    metadata_json
  )
  VALUES
    (
      v_document_id,
      CASE WHEN v_mode = 'existing_batch_draft' THEN 'batch_draft_approved' ELSE 'document_created_from_ai_intake' END,
      CASE WHEN v_mode = 'existing_batch_draft'
        THEN 'AI batch draft approved through transactional approve flow'
        ELSE 'Document created from AI intake through transactional approve flow'
      END,
      v_actor_id,
      v_now,
      jsonb_build_object('upload_session_id', v_upload_session_id, 'ai_result_id', v_ai_result_id, 'approve_run_id', v_approve_run_id)
    ),
    (
      v_document_id,
      'approve_save_db_transaction_completed',
      'Approve & Save core DB transaction completed',
      v_actor_id,
      v_now,
      jsonb_build_object('approve_run_id', v_approve_run_id, 'file_id', v_file_id, 'version_id', v_version_id)
    ),
    (
      v_document_id,
      'file_uploaded',
      'File attached from AI intake approval',
      v_actor_id,
      v_now,
      jsonb_build_object('file_id', v_file_id, 'version_id', v_version_id, 'storage_path', p_payload->>'final_storage_path')
    );

  IF COALESCE(jsonb_array_length(COALESCE(p_payload->'metadata_values', '[]'::jsonb)), 0) > 0 THEN
    INSERT INTO public.dms_document_events (
      document_id,
      event_type,
      description,
      performed_by,
      performed_at,
      metadata_json
    )
    VALUES (
      v_document_id,
      'metadata_updated',
      'Metadata saved from AI intake approval',
      v_actor_id,
      v_now,
      jsonb_build_object('metadata_count', jsonb_array_length(COALESCE(p_payload->'metadata_values', '[]'::jsonb)))
    );
  END IF;

  UPDATE public.dms_approve_runs
  SET status = 'db_committed',
      stage = 'approve_save_db_transaction_completed',
      document_id = v_document_id,
      ai_result_id = COALESCE(v_ai_result_id, ai_result_id),
      final_storage_bucket = COALESCE(NULLIF(p_payload->>'final_storage_bucket', ''), final_storage_bucket),
      final_storage_path = COALESCE(NULLIF(p_payload->>'final_storage_path', ''), final_storage_path),
      metadata_json = COALESCE(metadata_json, '{}'::jsonb)
        || jsonb_build_object(
          'mode', v_mode,
          'file_id', v_file_id,
          'version_id', v_version_id,
          'metadata_count', jsonb_array_length(COALESCE(p_payload->'metadata_values', '[]'::jsonb)),
          'tag_count', jsonb_array_length(COALESCE(p_payload->'tag_ids', '[]'::jsonb)),
          'link_count', jsonb_array_length(COALESCE(p_payload->'links', '[]'::jsonb))
        ),
      error_code = NULL,
      error_message = NULL,
      updated_at = v_now
  WHERE id = v_approve_run_id;

  RETURN QUERY SELECT v_document_id, v_document_no, 'db_committed'::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_dms_ai_intake(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_dms_ai_intake(JSONB) TO authenticated;

COMMENT ON TABLE public.dms_approve_runs IS 'DMS AI Phase 4 approve/save run tracking for transactional approval recovery and audit.';
COMMENT ON FUNCTION public.approve_dms_ai_intake(JSONB) IS 'Atomically commits core DMS AI intake approve/save DB writes after server-side storage copy.';
COMMENT ON FUNCTION public.reserve_dms_document_id() IS 'Reserves a dms_documents identity value so storage paths can include documentId before the approve RPC commits.';
