-- ============================================================================
-- ERP COMMON AI.6 — AI Search Across ERP — Optional Migration Review
-- Date: 2026-06-17
-- Status: REVIEW ONLY — DO NOT APPLY
-- ============================================================================
--
-- RECOMMENDATION: MIGRATION IS REQUIRED for ERP COMMON AI.6 (minimal).
--
-- Required:
--   1. ai.search.view permission (new — ai.search.use already exists)
--   2. Role mappings for ai.search.view and ai.search.use
--   3. erp_ai_recent_searches table (lightweight per-user search history)
--
-- Optional (performance — not required for v1 correctness):
--   4. GIN trigram indexes on entity name columns (if ILIKE performance insufficient)
--
-- Feature flag: AI_SEARCH already exists (is_enabled=true) — do NOT create
-- ERP_AI_SEARCH (that code does not exist in the DB).
--
-- DMS semantic search: DMS_SEMANTIC_SEARCH already exists (is_enabled=true) — unchanged.
--
-- No erp_ai_search_index table in v1 — live queries sufficient.
--
-- ============================================================================

-- REVIEW ONLY — DO NOT APPLY

-- ── SECTION 1: ai.search.view permission ──────────────────────────────────────
--
-- ai.search.use already exists in DB.
-- ai.search.view is MISSING — add for read access to search results + recent searches.

INSERT INTO public.permissions (
  permission_code, permission_name, description, module_code, action_code, is_active
)
VALUES (
  'ai.search.view',
  'View AI Search Results',
  'View ERP cross-entity search results, result badges, and recent searches',
  'AI', 'view', true
)
ON CONFLICT (permission_code) DO NOTHING;

-- ── SECTION 2: Role mappings ──────────────────────────────────────────────────
--
-- Map both ai.search.view and ai.search.use to standard admin roles.
-- ai.search.use: also verify company_admin is mapped (may already be from AI.0).

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code IN ('system_admin', 'group_admin', 'company_admin')
  AND p.permission_code IN ('ai.search.view', 'ai.search.use')
ON CONFLICT DO NOTHING;

-- ── SECTION 3: erp_ai_recent_searches ─────────────────────────────────────────
--
-- Lightweight per-user recent search history.
-- Max 20 rows per user (trimmed on insert via application logic).
-- No raw AI output. Only user-typed search text.
-- RLS: user sees only own rows.

CREATE TABLE IF NOT EXISTS public.erp_ai_recent_searches (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  search_text     TEXT NOT NULL,
  entity_types    JSONB NOT NULL DEFAULT '[]'::jsonb,
  search_mode     TEXT NOT NULL DEFAULT 'quick_keyword',
  result_count    INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,

  CONSTRAINT erp_ai_recent_searches_mode_chk CHECK (
    search_mode IN ('quick_keyword', 'safe_fts', 'ai_intent', 'semantic_documents', 'hybrid', 'entity_filtered')
  )
);

COMMENT ON TABLE public.erp_ai_recent_searches IS
  'COMMON AI.6 — Per-user recent search history. Safe user-typed text only. '
  'Never stores AI output, OCR text, prompts, or sensitive extracted values.';

CREATE INDEX IF NOT EXISTS idx_erp_ai_recent_searches_user_created
  ON public.erp_ai_recent_searches (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- RLS on erp_ai_recent_searches

ALTER TABLE public.erp_ai_recent_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_ai_recent_searches FORCE ROW LEVEL SECURITY;

-- SELECT: own rows only
DROP POLICY IF EXISTS erp_ai_recent_searches_select ON public.erp_ai_recent_searches;
CREATE POLICY erp_ai_recent_searches_select
  ON public.erp_ai_recent_searches FOR SELECT
  USING (
    user_id = current_user_profile_id()
    AND deleted_at IS NULL
  );

-- INSERT: own rows only + ai.search.use
DROP POLICY IF EXISTS erp_ai_recent_searches_insert ON public.erp_ai_recent_searches;
CREATE POLICY erp_ai_recent_searches_insert
  ON public.erp_ai_recent_searches FOR INSERT
  WITH CHECK (
    user_id = current_user_profile_id()
    AND (
      current_user_has_permission('ai.search.use')
      OR current_user_has_role('system_admin')
    )
  );

-- UPDATE (soft delete own rows): own rows only
DROP POLICY IF EXISTS erp_ai_recent_searches_update ON public.erp_ai_recent_searches;
CREATE POLICY erp_ai_recent_searches_update
  ON public.erp_ai_recent_searches FOR UPDATE
  USING (
    user_id = current_user_profile_id()
  )
  WITH CHECK (
    user_id = current_user_profile_id()
  );

-- ── SECTION 4: Optional GIN trigram indexes on entity name columns ────────────
--
-- These are ADDITIVE only — no existing indexes removed.
-- Only needed if ILIKE on btree proves too slow for entity name search.
-- Small/medium ERP datasets (< 10K entities per type) do NOT require these.
-- Recommend applying after v1 UAT only if performance is inadequate.
--
-- Requires pg_trgm extension (already enabled — used by DMS title trigram index).

-- owner_companies: trade_name trigram
CREATE INDEX IF NOT EXISTS idx_owner_companies_trade_name_trgm
  ON public.owner_companies USING gin (trade_name gin_trgm_ops)
  WHERE deleted_at IS NULL;

-- owner_companies: legal_name_en trigram
CREATE INDEX IF NOT EXISTS idx_owner_companies_legal_name_en_trgm
  ON public.owner_companies USING gin (lower(legal_name_en) gin_trgm_ops)
  WHERE deleted_at IS NULL;

-- branches: branch_name_en trigram
CREATE INDEX IF NOT EXISTS idx_branches_branch_name_en_trgm
  ON public.branches USING gin (branch_name_en gin_trgm_ops)
  WHERE deleted_at IS NULL;

-- parties: display_name trigram
CREATE INDEX IF NOT EXISTS idx_parties_display_name_trgm
  ON public.parties USING gin (display_name gin_trgm_ops)
  WHERE deleted_at IS NULL;

-- parties: trade_name_en trigram
CREATE INDEX IF NOT EXISTS idx_parties_trade_name_en_trgm
  ON public.parties USING gin (trade_name_en gin_trgm_ops)
  WHERE deleted_at IS NULL AND trade_name_en IS NOT NULL;

-- work_sites: site_name trigram
CREATE INDEX IF NOT EXISTS idx_work_sites_site_name_trgm
  ON public.work_sites USING gin (site_name gin_trgm_ops)
  WHERE deleted_at IS NULL;

-- ── SECTION 5: Feature flag notes ─────────────────────────────────────────────
--
-- AI_SEARCH already seeded in COMMON AI.0 migration. is_enabled=true.
-- Do NOT insert ERP_AI_SEARCH.
-- DMS_SEMANTIC_SEARCH already seeded. is_enabled=true. Unchanged.
--
-- No new feature flag needed for AI.6 v1.

-- ── SECTION 6: Deferred — erp_ai_search_index ────────────────────────────────
--
-- A full materialized search index table (erp_ai_search_index) is NOT recommended
-- for v1. Live parallel queries are sufficient for current entity scale.
-- If deferred to v2, recommended design:
--
-- CREATE TABLE public.erp_ai_search_index (
--   id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
--   entity_type   TEXT NOT NULL,
--   entity_id     BIGINT NOT NULL,
--   search_text   TEXT NOT NULL,     -- normalized concatenated name fields, no OCR
--   search_tsv    TSVECTOR,          -- GIN indexed
--   indexed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
--   UNIQUE (entity_type, entity_id)
-- );
-- CREATE INDEX ON erp_ai_search_index USING gin (search_tsv);
--
-- Requires: incremental update trigger on each entity table (high maintenance cost).
-- Defer to AI.6 v2.

-- ── SECTION 7: Deferred — erp_ai_search_logs ─────────────────────────────────
--
-- Full search analytics log table is NOT recommended for v1.
-- Recent searches (erp_ai_recent_searches) is sufficient.
-- erp_ai_usage_logs handles AI-call tracking.
-- Defer aggregate search log analytics to v2.
