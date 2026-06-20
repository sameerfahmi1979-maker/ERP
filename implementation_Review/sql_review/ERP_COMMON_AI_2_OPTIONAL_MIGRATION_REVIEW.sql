-- ============================================================================
-- ERP COMMON AI.2 — Document Understanding Center — Optional Migration Review
-- Date: 2026-06-17
-- Status: REVIEW ONLY — DO NOT APPLY
-- ============================================================================
--
-- RECOMMENDATION: NO MIGRATION REQUIRED for ERP COMMON AI.2 v1.
--
-- Rationale:
-- 1. The ERP_AI_DOC_UNDERSTANDING feature flag already exists (seeded by COMMON AI.0).
--    No new flag migration needed.
-- 2. All intelligence data (OCR status, summary, completeness, risk, embedding,
--    tags, links, orchestration status) is already stored in existing tables.
-- 3. The getDmsDocumentUnderstanding() server action aggregates existing data live.
--    Expected response time ~100-150ms — well within acceptable range.
-- 4. No snapshot/cache table is needed in v1.
-- 5. No new indexes required — all queries use existing document_id indexes.
-- 6. No RLS changes needed — all tables already have RLS ENABLED + FORCED.
--
-- ============================================================================

-- ── Section 1: Feature flag (already exists — no migration) ──────────────────

-- The following flag already exists in erp_ai_feature_flags:
--   feature_code: ERP_AI_DOC_UNDERSTANDING
--   is_enabled: false
--
-- To enable for UAT, run manually (NOT as a migration):
--   UPDATE erp_ai_feature_flags
--   SET is_enabled = true, updated_at = now()
--   WHERE feature_code = 'ERP_AI_DOC_UNDERSTANDING';
--
-- To disable after UAT:
--   UPDATE erp_ai_feature_flags
--   SET is_enabled = false, updated_at = now()
--   WHERE feature_code = 'ERP_AI_DOC_UNDERSTANDING';

-- ── Section 2: Optional snapshot table (deferred to v2 if needed) ────────────

-- REVIEW ONLY — DO NOT APPLY
-- This table would be needed if:
--   (a) getDmsDocumentUnderstanding() exceeds 1000ms consistently in production
--   (b) Users need historical snapshots of document understanding (compliance)
--   (c) AI.2 needs to serve bulk document understanding across many documents
--
-- Recommend deferring to COMMON AI.2 v2 after live performance data is available.

/*
CREATE TABLE IF NOT EXISTS public.dms_document_understanding_snapshots (
  id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id               BIGINT NOT NULL REFERENCES public.dms_documents(id) ON DELETE CASCADE,

  -- Snapshot metadata
  snapshot_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  triggered_by              TEXT NOT NULL DEFAULT 'manual'
    CHECK (triggered_by IN ('manual', 'orch_pipeline', 'tab_open', 'scheduled')),
  duration_ms               INTEGER,

  -- Cached understanding JSON (safe metadata only — never content_text/OCR/prompts)
  understanding_json        JSONB NOT NULL,

  -- Computed scores for filtering/sorting
  health_score              NUMERIC(5,2),
  completeness_score        NUMERIC(5,4),
  risk_level                TEXT,

  -- Audit
  created_by                BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_dms_doc_understanding_snapshots_doc
  ON public.dms_document_understanding_snapshots(document_id)
  WHERE TRUE;

CREATE INDEX IF NOT EXISTS idx_dms_doc_understanding_snapshots_health
  ON public.dms_document_understanding_snapshots(health_score DESC)
  WHERE TRUE;

-- RLS
ALTER TABLE public.dms_document_understanding_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dms_document_understanding_snapshots FORCE ROW LEVEL SECURITY;

-- Policy: same access as parent dms_documents
DROP POLICY IF EXISTS dms_doc_understanding_snapshots_select ON public.dms_document_understanding_snapshots;
CREATE POLICY dms_doc_understanding_snapshots_select
  ON public.dms_document_understanding_snapshots FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      current_user_has_permission('dms.documents.view')
      OR current_user_has_permission('dms.admin')
      OR current_user_has_role('system_admin')
    )
  );
*/

-- ── Section 3: Potential index improvements (only if performance issues found) ─

-- REVIEW ONLY — DO NOT APPLY
-- These indexes are NOT required in v1. Add only if profiling shows them necessary.

/*
-- If orchestration status lookup is slow:
CREATE INDEX IF NOT EXISTS idx_dms_upload_sessions_by_document_id
  ON public.dms_upload_sessions(document_id)
  WHERE document_id IS NOT NULL AND deleted_at IS NULL;

-- If erp_ai_field_suggestions count is slow:
CREATE INDEX IF NOT EXISTS idx_erp_ai_field_suggestions_entity_pending
  ON public.erp_ai_field_suggestions(entity_type, entity_id, status)
  WHERE status = 'pending' AND deleted_at IS NULL;
*/

-- ── Summary ────────────────────────────────────────────────────────────────────
-- ERP COMMON AI.2 v1 requires NO database migration.
-- All required data exists in currently indexed tables with RLS policies.
-- The ERP_AI_DOC_UNDERSTANDING feature flag is already seeded.
-- Enable it manually for UAT after implementation is verified.
