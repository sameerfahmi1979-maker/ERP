-- ERP COMMON AI.6 — AI Search Across ERP
-- Adds ai.search.view permission, maps search permissions to roles
-- Creates erp_ai_recent_searches table
-- Adds optional GIN trigram indexes on entity name columns
-- Feature flag: AI_SEARCH already exists (is_enabled=true) — do NOT create ERP_AI_SEARCH

-- ── ai.search.view permission ──────────────────────────────────────────────────

INSERT INTO permissions (permission_code, permission_name, description, module_code, action_code, is_active)
VALUES (
  'ai.search.view',
  'View AI Search Results',
  'View ERP cross-entity search results, result badges, and recent searches',
  'AI', 'view', true
) ON CONFLICT (permission_code) DO NOTHING;

-- Ensure ai.search.use remains active
UPDATE permissions SET is_active = true WHERE permission_code = 'ai.search.use';

-- Map ai.search.view and ai.search.use to system_admin, group_admin, company_admin

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code IN ('system_admin', 'group_admin', 'company_admin')
  AND p.permission_code IN ('ai.search.view', 'ai.search.use')
ON CONFLICT DO NOTHING;

-- ── erp_ai_recent_searches ─────────────────────────────────────────────────────

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
  ),
  CONSTRAINT erp_ai_recent_searches_text_len_chk CHECK (
    char_length(search_text) BETWEEN 1 AND 500
  )
);

COMMENT ON TABLE public.erp_ai_recent_searches IS
  'COMMON AI.6 — Per-user recent search history. Safe user-typed text only. '
  'Never stores AI output, OCR text, prompts, or sensitive extracted values.';

CREATE INDEX IF NOT EXISTS idx_erp_ai_recent_searches_user_created
  ON public.erp_ai_recent_searches (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- RLS

ALTER TABLE public.erp_ai_recent_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_ai_recent_searches FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_ai_recent_searches_select ON public.erp_ai_recent_searches;
CREATE POLICY erp_ai_recent_searches_select
  ON public.erp_ai_recent_searches FOR SELECT
  USING (
    user_id = current_user_profile_id()
    AND deleted_at IS NULL
  );

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

DROP POLICY IF EXISTS erp_ai_recent_searches_update ON public.erp_ai_recent_searches;
CREATE POLICY erp_ai_recent_searches_update
  ON public.erp_ai_recent_searches FOR UPDATE
  USING (user_id = current_user_profile_id())
  WITH CHECK (user_id = current_user_profile_id());

-- ── Optional GIN trigram indexes on entity name columns ───────────────────────
-- pg_trgm is already available (used by DMS title/summary trigram indexes)
-- These are additive only — no existing indexes removed

CREATE INDEX IF NOT EXISTS idx_owner_companies_trade_name_trgm
  ON public.owner_companies USING gin (trade_name gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_parties_display_name_trgm
  ON public.parties USING gin (display_name gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_branches_branch_name_en_trgm
  ON public.branches USING gin (branch_name_en gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_work_sites_site_name_trgm
  ON public.work_sites USING gin (site_name gin_trgm_ops)
  WHERE deleted_at IS NULL;
