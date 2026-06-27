-- ============================================================================
-- ERP DMS AI Phase 13 — Validation, Conflict Detection, Owner Matching
-- Migration: 20260626100000_erp_dms_ai_phase13_validation_matching.sql
-- Date: 2026-06-26
--
-- Strategy: ADDITIVE only. No existing tables/columns are removed.
--   - Creates dms_ai_validation_findings (deterministic + AI-assisted findings)
--   - Creates dms_ai_entity_match_candidates (owner/party/employee match candidates)
--   - Extends dms_review_queue with FK columns + 7 new review_type values
--   - Seeds 4 new feature flags (default false)
--   - Seeds 8 new permissions and grants to system_admin / group_admin
--
-- Safety rules:
--   - No UUID. All PKs/FKs are BIGINT.
--   - RLS enabled and FORCE ROW LEVEL SECURITY on all new tables.
--   - No broad USING (true) policies.
--   - No raw content columns (no ocr_text, content_text, chunk_text, raw_response).
--   - Idempotent throughout (IF NOT EXISTS, ON CONFLICT DO NOTHING).
--   - Feature flags default false (disabled until operator enables).
--   - No Apply-to-ERP writes anywhere in this migration.
-- ============================================================================

-- ── SECTION 1: Create dms_ai_validation_findings ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.dms_ai_validation_findings (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- Idempotency key (partial unique index on active findings)
  finding_key             TEXT,

  -- Source references
  document_id             BIGINT REFERENCES public.dms_documents(id) ON DELETE CASCADE,
  upload_session_id       BIGINT REFERENCES public.dms_upload_sessions(id) ON DELETE SET NULL,
  ai_result_id            BIGINT REFERENCES public.dms_ai_extraction_results(id) ON DELETE SET NULL,
  metadata_definition_id  BIGINT REFERENCES public.dms_metadata_definitions(id) ON DELETE SET NULL,
  field_code              TEXT,

  -- Classification
  finding_type            TEXT NOT NULL,
  severity                TEXT NOT NULL DEFAULT 'warning',
  status                  TEXT NOT NULL DEFAULT 'open',

  -- Rule metadata (safe — no raw content)
  source_module           TEXT,
  rule_code               TEXT NOT NULL,
  rule_label              TEXT,
  rule_version            TEXT DEFAULT '1.0',
  ai_generated            BOOLEAN NOT NULL DEFAULT false,

  -- Evidence (safe summaries only — max 200 chars each enforced at application layer)
  confidence              NUMERIC(5,4),
  current_value_summary   TEXT,
  ai_value_summary        TEXT,
  expected_value_summary  TEXT,
  reason_message          TEXT,
  evidence_json           JSONB,  -- safe IDs and codes only — NEVER raw OCR/AI/content text

  -- Review tracking
  reviewed_by             BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  reviewed_at             TIMESTAMPTZ,
  resolved_at             TIMESTAMPTZ,
  resolution_code         TEXT,
  resolution_note         TEXT,

  -- Review queue link (set after queue item is created)
  review_queue_item_id    BIGINT REFERENCES public.dms_review_queue(id) ON DELETE SET NULL,

  -- Audit
  created_by              BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at              TIMESTAMPTZ
);

-- CHECK constraints for dms_ai_validation_findings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dms_ai_validation_findings_finding_type_check'
      AND conrelid = 'public.dms_ai_validation_findings'::regclass
  ) THEN
    ALTER TABLE public.dms_ai_validation_findings ADD CONSTRAINT dms_ai_validation_findings_finding_type_check
      CHECK (finding_type IN (
        'required_field_missing', 'expiry_before_issue_date', 'expiry_in_past',
        'issue_date_in_future', 'format_violation', 'ai_confidence_low',
        'ai_value_conflict', 'classification_mismatch', 'duplicate_document',
        'document_inconsistency', 'ai_assisted_conflict'
      ));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dms_ai_validation_findings_severity_check'
      AND conrelid = 'public.dms_ai_validation_findings'::regclass
  ) THEN
    ALTER TABLE public.dms_ai_validation_findings ADD CONSTRAINT dms_ai_validation_findings_severity_check
      CHECK (severity IN ('error', 'warning', 'info'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dms_ai_validation_findings_status_check'
      AND conrelid = 'public.dms_ai_validation_findings'::regclass
  ) THEN
    ALTER TABLE public.dms_ai_validation_findings ADD CONSTRAINT dms_ai_validation_findings_status_check
      CHECK (status IN ('open', 'reviewed', 'false_positive', 'superseded', 'dismissed'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dms_ai_validation_findings_confidence_check'
      AND conrelid = 'public.dms_ai_validation_findings'::regclass
  ) THEN
    ALTER TABLE public.dms_ai_validation_findings ADD CONSTRAINT dms_ai_validation_findings_confidence_check
      CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));
  END IF;
END $$;

-- Partial unique index for idempotency (active findings only)
CREATE UNIQUE INDEX IF NOT EXISTS idx_dms_ai_validation_findings_finding_key
  ON public.dms_ai_validation_findings (finding_key)
  WHERE finding_key IS NOT NULL
    AND deleted_at IS NULL
    AND status NOT IN ('reviewed', 'false_positive', 'superseded', 'dismissed');

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_dms_ai_validation_findings_document_id
  ON public.dms_ai_validation_findings (document_id)
  WHERE document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dms_ai_validation_findings_ai_result_id
  ON public.dms_ai_validation_findings (ai_result_id)
  WHERE ai_result_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dms_ai_validation_findings_rule_code
  ON public.dms_ai_validation_findings (rule_code);

CREATE INDEX IF NOT EXISTS idx_dms_ai_validation_findings_status
  ON public.dms_ai_validation_findings (status, severity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dms_ai_validation_findings_active
  ON public.dms_ai_validation_findings (status, document_id)
  WHERE status = 'open' AND deleted_at IS NULL;

-- RLS
ALTER TABLE public.dms_ai_validation_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dms_ai_validation_findings FORCE ROW LEVEL SECURITY;

CREATE POLICY dms_ai_validation_findings_select ON public.dms_ai_validation_findings
  FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL AND (
      current_user_has_permission('dms.validation.view')
      OR current_user_has_permission('dms.validation.review')
      OR current_user_has_permission('dms.validation.admin')
      OR current_user_has_permission('dms.admin')
      OR current_user_has_role('system_admin')
    )
  );

CREATE POLICY dms_ai_validation_findings_update ON public.dms_ai_validation_findings
  FOR UPDATE TO authenticated
  USING (
    current_user_has_permission('dms.validation.review')
    OR current_user_has_permission('dms.validation.admin')
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  )
  WITH CHECK (
    current_user_has_permission('dms.validation.review')
    OR current_user_has_permission('dms.validation.admin')
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  );

CREATE POLICY dms_ai_validation_findings_insert ON public.dms_ai_validation_findings
  FOR INSERT TO authenticated
  WITH CHECK (
    current_user_has_permission('dms.validation.admin')
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  );

COMMENT ON TABLE public.dms_ai_validation_findings IS
  'Phase 13 — DMS AI validation findings. Stores deterministic and AI-assisted rule violations. Human-review-only: no auto-apply.';

COMMENT ON COLUMN public.dms_ai_validation_findings.evidence_json IS
  'Safe metadata only — IDs, rule codes, short summaries. NEVER store OCR text, chunk text, full AI responses, prompts, or API keys.';

COMMENT ON COLUMN public.dms_ai_validation_findings.finding_key IS
  'Idempotency key. Format: {rule_code}:doc:{id}[:{field_code}]. Partial unique index prevents duplicate active findings.';

-- ── SECTION 2: Create dms_ai_entity_match_candidates ─────────────────────────

CREATE TABLE IF NOT EXISTS public.dms_ai_entity_match_candidates (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- Idempotency key (partial unique index on active candidates)
  candidate_key           TEXT,

  -- Source references
  document_id             BIGINT REFERENCES public.dms_documents(id) ON DELETE CASCADE,
  upload_session_id       BIGINT REFERENCES public.dms_upload_sessions(id) ON DELETE SET NULL,
  ai_result_id            BIGINT REFERENCES public.dms_ai_extraction_results(id) ON DELETE SET NULL,

  -- Match input (safe — max 200 chars, no raw OCR)
  source_text_summary     TEXT,
  match_signal            TEXT,

  -- Match target
  target_entity_type      TEXT NOT NULL,
  target_entity_id        BIGINT NOT NULL,
  target_display_name     TEXT,

  -- Match quality
  match_score             NUMERIC(5,4),
  match_method            TEXT,
  match_reason            TEXT,
  ai_generated            BOOLEAN NOT NULL DEFAULT false,

  -- Status
  status                  TEXT NOT NULL DEFAULT 'pending',

  -- Review queue link
  review_queue_item_id    BIGINT REFERENCES public.dms_review_queue(id) ON DELETE SET NULL,

  -- Resolution (marks candidate only — DOES NOT write dms_documents owner fields)
  reviewed_by             BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  reviewed_at             TIMESTAMPTZ,
  resolved_at             TIMESTAMPTZ,
  resolution_code         TEXT,
  resolution_note         TEXT,

  -- Audit
  created_by              BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at              TIMESTAMPTZ
);

-- CHECK constraints for dms_ai_entity_match_candidates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dms_ai_entity_match_candidates_entity_type_check'
      AND conrelid = 'public.dms_ai_entity_match_candidates'::regclass
  ) THEN
    ALTER TABLE public.dms_ai_entity_match_candidates ADD CONSTRAINT dms_ai_entity_match_candidates_entity_type_check
      CHECK (target_entity_type IN ('owner_company', 'branch', 'party', 'employee', 'work_site'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dms_ai_entity_match_candidates_status_check'
      AND conrelid = 'public.dms_ai_entity_match_candidates'::regclass
  ) THEN
    ALTER TABLE public.dms_ai_entity_match_candidates ADD CONSTRAINT dms_ai_entity_match_candidates_status_check
      CHECK (status IN ('pending', 'accepted', 'rejected', 'superseded'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dms_ai_entity_match_candidates_score_check'
      AND conrelid = 'public.dms_ai_entity_match_candidates'::regclass
  ) THEN
    ALTER TABLE public.dms_ai_entity_match_candidates ADD CONSTRAINT dms_ai_entity_match_candidates_score_check
      CHECK (match_score IS NULL OR (match_score >= 0 AND match_score <= 1));
  END IF;
END $$;

-- Partial unique index for idempotency (active candidates only)
CREATE UNIQUE INDEX IF NOT EXISTS idx_dms_ai_entity_match_candidates_key
  ON public.dms_ai_entity_match_candidates (candidate_key)
  WHERE candidate_key IS NOT NULL
    AND deleted_at IS NULL
    AND status NOT IN ('accepted', 'rejected', 'superseded');

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_dms_ai_entity_match_candidates_document_id
  ON public.dms_ai_entity_match_candidates (document_id)
  WHERE document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dms_ai_entity_match_candidates_target
  ON public.dms_ai_entity_match_candidates (target_entity_type, target_entity_id);

CREATE INDEX IF NOT EXISTS idx_dms_ai_entity_match_candidates_status
  ON public.dms_ai_entity_match_candidates (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dms_ai_entity_match_candidates_active
  ON public.dms_ai_entity_match_candidates (document_id, target_entity_type, status)
  WHERE status = 'pending' AND deleted_at IS NULL;

-- RLS
ALTER TABLE public.dms_ai_entity_match_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dms_ai_entity_match_candidates FORCE ROW LEVEL SECURITY;

CREATE POLICY dms_ai_entity_match_candidates_select ON public.dms_ai_entity_match_candidates
  FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL AND (
      current_user_has_permission('dms.entity_matching.view')
      OR current_user_has_permission('dms.entity_matching.review')
      OR current_user_has_permission('dms.entity_matching.admin')
      OR current_user_has_permission('dms.admin')
      OR current_user_has_role('system_admin')
    )
  );

CREATE POLICY dms_ai_entity_match_candidates_update ON public.dms_ai_entity_match_candidates
  FOR UPDATE TO authenticated
  USING (
    current_user_has_permission('dms.entity_matching.review')
    OR current_user_has_permission('dms.entity_matching.admin')
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  )
  WITH CHECK (
    current_user_has_permission('dms.entity_matching.review')
    OR current_user_has_permission('dms.entity_matching.admin')
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  );

CREATE POLICY dms_ai_entity_match_candidates_insert ON public.dms_ai_entity_match_candidates
  FOR INSERT TO authenticated
  WITH CHECK (
    current_user_has_permission('dms.entity_matching.admin')
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  );

COMMENT ON TABLE public.dms_ai_entity_match_candidates IS
  'Phase 13 — DMS AI entity match candidates. Human-review-only: accepting a candidate does NOT write to dms_documents owner fields. Apply-to-ERP is Phase 16.';

COMMENT ON COLUMN public.dms_ai_entity_match_candidates.source_text_summary IS
  'Safe summary of what matched (max 200 chars). NEVER store full OCR text or raw AI output.';

COMMENT ON COLUMN public.dms_ai_entity_match_candidates.candidate_key IS
  'Idempotency key. Format: match:{doc_id}:{entity_type}:{entity_id}:{method}. Partial unique index prevents duplicate active candidates.';

-- ── SECTION 3: Extend dms_review_queue ───────────────────────────────────────

-- Add FK columns to dms_review_queue (new tables must exist first)
ALTER TABLE public.dms_review_queue
  ADD COLUMN IF NOT EXISTS validation_finding_id     BIGINT
    REFERENCES public.dms_ai_validation_findings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS entity_match_candidate_id BIGINT
    REFERENCES public.dms_ai_entity_match_candidates(id) ON DELETE SET NULL;

-- Indexes for new FK columns
CREATE INDEX IF NOT EXISTS idx_dms_review_queue_validation_finding_id
  ON public.dms_review_queue (validation_finding_id)
  WHERE validation_finding_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dms_review_queue_entity_match_candidate_id
  ON public.dms_review_queue (entity_match_candidate_id)
  WHERE entity_match_candidate_id IS NOT NULL;

-- Extend review_type CHECK constraint with Phase 13 values
-- Must DROP and RECREATE since PostgreSQL does not support adding values to CHECK
ALTER TABLE public.dms_review_queue DROP CONSTRAINT IF EXISTS dms_review_queue_review_type_check;
ALTER TABLE public.dms_review_queue ADD CONSTRAINT dms_review_queue_review_type_check
  CHECK (review_type IN (
    -- Phase 12 (existing)
    'intake_classification_review',
    'intake_metadata_review',
    'ai_analysis_metadata_review',
    'ocr_failure_review',
    'semantic_index_review',
    'ai_job_failure_review',
    -- Phase 13 (new)
    'validation_conflict_review',
    'metadata_rule_violation_review',
    'owner_matching_review',
    'party_matching_review',
    'employee_matching_review',
    'duplicate_document_review',
    'document_consistency_review'
  ));

-- ── SECTION 4: Seed feature flags ─────────────────────────────────────────────

INSERT INTO public.erp_ai_feature_flags (feature_code, is_enabled, notes, created_at, updated_at)
VALUES
  ('DMS_AI_VALIDATION',          false, 'Phase 13 — Deterministic validation engine. When true, runDmsValidationForDocument is active. Default false — enable after verifying implementation.', NOW(), NOW()),
  ('DMS_AI_ENTITY_MATCHING',     false, 'Phase 13 — Entity/owner match candidates. When true, runDmsEntityMatchingForDocument is active. Default false.', NOW(), NOW()),
  ('DMS_AI_VALIDATION_ASSISTED', false, 'Phase 13 — AI-assisted validation rules (subset of DMS_AI_VALIDATION). Default false. Requires DMS_AI_VALIDATION=true.', NOW(), NOW()),
  ('DMS_AI_DUPLICATE_DOCUMENTS', false, 'Phase 13 — Duplicate document detection via validation engine. Default false.', NOW(), NOW())
ON CONFLICT (feature_code) DO NOTHING;

-- ── SECTION 5: Seed permissions ───────────────────────────────────────────────

INSERT INTO public.permissions (permission_code, permission_name, module_code, action_code, description, is_active)
VALUES
  ('dms.validation.view',           'View DMS Validation Findings',          'DMS', 'view',   'View DMS AI validation findings list and details',                   true),
  ('dms.validation.run',            'Run DMS Validation Engine',             'DMS', 'run',    'Run deterministic validation for documents and intake sessions',     true),
  ('dms.validation.review',         'Review DMS Validation Findings',        'DMS', 'review', 'Accept, dismiss, and mark validation findings as false positive',    true),
  ('dms.validation.admin',          'Admin DMS Validation Engine',           'DMS', 'admin',  'Bulk validation runs, supersede findings, full admin access',        true),
  ('dms.entity_matching.view',      'View DMS Entity Match Candidates',      'DMS', 'view',   'View DMS AI entity match candidate list and details',               true),
  ('dms.entity_matching.run',       'Run DMS Entity Matching',               'DMS', 'run',    'Run entity/owner matching for documents and intake sessions',        true),
  ('dms.entity_matching.review',    'Review DMS Entity Match Candidates',    'DMS', 'review', 'Accept for later apply or reject entity match candidates',          true),
  ('dms.entity_matching.admin',     'Admin DMS Entity Matching',             'DMS', 'admin',  'Bulk matching, supersede candidates, full admin access',             true)
ON CONFLICT (permission_code) DO UPDATE SET
  permission_name = EXCLUDED.permission_name,
  description     = EXCLUDED.description,
  module_code     = EXCLUDED.module_code,
  action_code     = EXCLUDED.action_code,
  is_active       = EXCLUDED.is_active,
  updated_at      = NOW();

-- Grant all 8 new permissions to system_admin
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.role_code = 'system_admin'
  AND p.permission_code IN (
    'dms.validation.view', 'dms.validation.run', 'dms.validation.review', 'dms.validation.admin',
    'dms.entity_matching.view', 'dms.entity_matching.run', 'dms.entity_matching.review', 'dms.entity_matching.admin'
  )
ON CONFLICT DO NOTHING;

-- Grant view/run/review (not admin) to group_admin
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.role_code = 'group_admin'
  AND p.permission_code IN (
    'dms.validation.view', 'dms.validation.run', 'dms.validation.review',
    'dms.entity_matching.view', 'dms.entity_matching.run', 'dms.entity_matching.review'
  )
ON CONFLICT DO NOTHING;
