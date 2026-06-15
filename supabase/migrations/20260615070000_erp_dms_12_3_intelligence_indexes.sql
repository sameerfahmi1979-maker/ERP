-- ERP DMS 12.3 — Completeness, Risk, Enhanced Search
-- Date: 2026-06-15
-- Purpose: Add partial indexes on completeness_score and ai_risk_score to support
--          efficient filtering of incomplete / risky documents.
--
-- These columns already exist from the Phase 12.1 migration.
-- No schema changes — indexes only.

-- Partial index on completeness_score (for sorting/filtering incomplete documents)
CREATE INDEX IF NOT EXISTS idx_dms_documents_completeness_score
  ON public.dms_documents (completeness_score)
  WHERE deleted_at IS NULL;

-- Partial index on ai_risk_score (for sorting/filtering risky documents)
CREATE INDEX IF NOT EXISTS idx_dms_documents_ai_risk_score
  ON public.dms_documents (ai_risk_score)
  WHERE deleted_at IS NULL;

-- Partial index on ai_risk_level (for filtering by risk level text)
CREATE INDEX IF NOT EXISTS idx_dms_documents_ai_risk_level
  ON public.dms_documents (ai_risk_level)
  WHERE deleted_at IS NULL;
