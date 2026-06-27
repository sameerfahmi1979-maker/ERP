-- ============================================================================
-- ERP DMS AI Phase 14 — Token / Cost / Observability
-- Migration: 20260627000000_erp_dms_ai_phase14_token_cost_observability.sql
-- Date: 2026-06-27
--
-- Strategy: ADDITIVE only. No existing tables/columns are removed.
--   - Extends erp_ai_usage_logs with document_id, ai_job_id, upload_session_id
--   - Creates erp_ai_model_cost_rates for admin-configurable cost rates
--   - Seeds DMS_AI_OBSERVABILITY feature flag (default false)
--   - Seeds dms.ai_observability.view/admin permissions
--   - Seeds placeholder cost rates (requires_confirmation=true — no active prices)
--
-- Safety rules:
--   - No UUID. All PKs/FKs are BIGINT.
--   - RLS enabled and FORCE ROW LEVEL SECURITY on erp_ai_model_cost_rates.
--   - No broad USING (true) policies.
--   - No raw content columns (no prompt, response, ocr_text, chunk_text, vectors).
--   - Idempotent throughout (IF NOT EXISTS, ON CONFLICT DO NOTHING).
--   - Feature flag default false (disabled until operator enables).
-- ============================================================================

-- ── SECTION 1: Extend erp_ai_usage_logs ──────────────────────────────────────

-- Add document_id FK
ALTER TABLE public.erp_ai_usage_logs
  ADD COLUMN IF NOT EXISTS document_id BIGINT NULL REFERENCES public.dms_documents(id) ON DELETE SET NULL;

-- Add ai_job_id FK (references dms_ai_job_queue)
ALTER TABLE public.erp_ai_usage_logs
  ADD COLUMN IF NOT EXISTS ai_job_id BIGINT NULL REFERENCES public.dms_ai_job_queue(id) ON DELETE SET NULL;

-- Add upload_session_id FK
ALTER TABLE public.erp_ai_usage_logs
  ADD COLUMN IF NOT EXISTS upload_session_id BIGINT NULL REFERENCES public.dms_upload_sessions(id) ON DELETE SET NULL;

-- Performance indexes on erp_ai_usage_logs
CREATE INDEX IF NOT EXISTS erp_ai_usage_logs_feature_area_idx
  ON public.erp_ai_usage_logs (feature_area);

CREATE INDEX IF NOT EXISTS erp_ai_usage_logs_model_id_idx
  ON public.erp_ai_usage_logs (model_id);

CREATE INDEX IF NOT EXISTS erp_ai_usage_logs_created_at_idx
  ON public.erp_ai_usage_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS erp_ai_usage_logs_document_id_idx
  ON public.erp_ai_usage_logs (document_id)
  WHERE document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS erp_ai_usage_logs_status_idx
  ON public.erp_ai_usage_logs (status);

CREATE INDEX IF NOT EXISTS erp_ai_usage_logs_provider_config_idx
  ON public.erp_ai_usage_logs (provider_config_id)
  WHERE provider_config_id IS NOT NULL;

COMMENT ON COLUMN public.erp_ai_usage_logs.document_id IS
  'Phase 14 — FK to dms_documents. Populated when usage is tied to a specific document.';
COMMENT ON COLUMN public.erp_ai_usage_logs.ai_job_id IS
  'Phase 14 — FK to dms_ai_job_queue. Populated when usage is tied to a background job.';
COMMENT ON COLUMN public.erp_ai_usage_logs.upload_session_id IS
  'Phase 14 — FK to dms_upload_sessions. Populated for intake-session-level operations.';

-- ── SECTION 2: Create erp_ai_model_cost_rates ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.erp_ai_model_cost_rates (
  id                         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- Provider / model identification
  provider_type              TEXT NOT NULL,
  model_id                   TEXT NOT NULL,
  display_name               TEXT,

  -- Rate type: 'token' | 'page' | 'unit' | 'zero'
  rate_type                  TEXT NOT NULL DEFAULT 'token',

  -- Cost per 1 million tokens (NULL when rate is not yet confirmed)
  input_cost_per_1m_tokens   NUMERIC(16,8),
  output_cost_per_1m_tokens  NUMERIC(16,8),

  -- For page/unit billing
  unit_cost                  NUMERIC(16,8),

  currency_code              TEXT NOT NULL DEFAULT 'USD',

  -- Effective date range
  effective_from             DATE NOT NULL,
  effective_to               DATE,

  -- Admin flags
  is_active                  BOOLEAN NOT NULL DEFAULT true,
  requires_confirmation      BOOLEAN NOT NULL DEFAULT true,
  source_note                TEXT,

  -- Audit
  created_by                 BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CHECK constraints (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'erp_ai_model_cost_rates_rate_type_check'
      AND conrelid = 'public.erp_ai_model_cost_rates'::regclass
  ) THEN
    ALTER TABLE public.erp_ai_model_cost_rates ADD CONSTRAINT erp_ai_model_cost_rates_rate_type_check
      CHECK (rate_type IN ('token', 'page', 'unit', 'zero'));
  END IF;
END $$;

-- Unique constraint: one rate per provider/model/effective_from date
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'erp_ai_model_cost_rates_unique_provider_model_date'
      AND conrelid = 'public.erp_ai_model_cost_rates'::regclass
  ) THEN
    ALTER TABLE public.erp_ai_model_cost_rates ADD CONSTRAINT erp_ai_model_cost_rates_unique_provider_model_date
      UNIQUE (provider_type, model_id, effective_from);
  END IF;
END $$;

-- Lookup index
CREATE INDEX IF NOT EXISTS erp_ai_model_cost_rates_lookup
  ON public.erp_ai_model_cost_rates (provider_type, model_id, is_active, effective_from DESC);

-- RLS
ALTER TABLE public.erp_ai_model_cost_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_ai_model_cost_rates FORCE ROW LEVEL SECURITY;

CREATE POLICY erp_ai_model_cost_rates_select ON public.erp_ai_model_cost_rates
  FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL AND (
      current_user_has_permission('dms.ai_observability.view')
      OR current_user_has_permission('dms.ai_observability.admin')
      OR current_user_has_permission('settings.ai.view')
      OR current_user_has_permission('settings.ai.manage')
      OR current_user_has_permission('dms.admin')
      OR current_user_has_role('system_admin')
    )
  );

CREATE POLICY erp_ai_model_cost_rates_insert ON public.erp_ai_model_cost_rates
  FOR INSERT TO authenticated
  WITH CHECK (
    current_user_has_permission('dms.ai_observability.admin')
    OR current_user_has_permission('settings.ai.manage')
    OR current_user_has_role('system_admin')
  );

CREATE POLICY erp_ai_model_cost_rates_update ON public.erp_ai_model_cost_rates
  FOR UPDATE TO authenticated
  USING (
    current_user_has_permission('dms.ai_observability.admin')
    OR current_user_has_permission('settings.ai.manage')
    OR current_user_has_role('system_admin')
  )
  WITH CHECK (
    current_user_has_permission('dms.ai_observability.admin')
    OR current_user_has_permission('settings.ai.manage')
    OR current_user_has_role('system_admin')
  );

-- No DELETE policy — rates are archived (is_active=false), never deleted.

COMMENT ON TABLE public.erp_ai_model_cost_rates IS
  'Phase 14 — Admin-configurable AI model cost rates. Rates must be confirmed by admin (requires_confirmation=false) before estimated_cost is computed. Never stores API keys, secrets, or sensitive data.';

-- ── SECTION 3: Seed DMS_AI_OBSERVABILITY feature flag ─────────────────────────

INSERT INTO public.erp_ai_feature_flags (feature_code, feature_name, description, is_enabled, requires_human_review, notes, created_at, updated_at)
VALUES (
  'DMS_AI_OBSERVABILITY',
  'DMS AI Observability Dashboard',
  'Phase 14 — AI token/cost observability dashboard. When true, /admin/dms/ai-observability is accessible to users with dms.ai_observability.view permission.',
  false,
  false,
  'Default false — enable after Phase 14 deployment and cost-rate configuration by admin.',
  NOW(),
  NOW()
)
ON CONFLICT (feature_code) DO NOTHING;

-- ── SECTION 4: Seed dms.ai_observability permissions ─────────────────────────

INSERT INTO public.permissions (permission_code, permission_name, module_code, action_code, description, is_active)
VALUES
  ('dms.ai_observability.view',
   'View DMS AI Observability',
   'DMS', 'view',
   'View DMS AI usage, token, cost, queue, and pipeline observability dashboards',
   true),
  ('dms.ai_observability.admin',
   'Admin DMS AI Observability',
   'DMS', 'admin',
   'Manage AI model cost rates and configure observability settings',
   true)
ON CONFLICT (permission_code) DO UPDATE SET
  permission_name = EXCLUDED.permission_name,
  description     = EXCLUDED.description,
  module_code     = EXCLUDED.module_code,
  action_code     = EXCLUDED.action_code,
  is_active       = EXCLUDED.is_active,
  updated_at      = NOW();

-- Grant both to system_admin
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.role_code = 'system_admin'
  AND p.permission_code IN ('dms.ai_observability.view', 'dms.ai_observability.admin')
ON CONFLICT DO NOTHING;

-- Grant view-only to group_admin (if role exists)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.role_code = 'group_admin'
  AND p.permission_code = 'dms.ai_observability.view'
ON CONFLICT DO NOTHING;

-- Grant view-only to dms_admin (if role exists)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.role_code = 'dms_admin'
  AND p.permission_code = 'dms.ai_observability.view'
ON CONFLICT DO NOTHING;

-- ── SECTION 5: Seed placeholder cost rates ────────────────────────────────────
-- Placeholders only. requires_confirmation=true on all OpenAI rows.
-- Admin MUST verify and update rates against provider pricing before use.
-- estimated_cost remains NULL until requires_confirmation is set to false by admin.

INSERT INTO public.erp_ai_model_cost_rates
  (provider_type, model_id, display_name, rate_type,
   input_cost_per_1m_tokens, output_cost_per_1m_tokens,
   currency_code, effective_from, is_active, requires_confirmation, source_note)
VALUES
  ('openai', 'gpt-4.1-2025-04-14', 'GPT-4.1 (2025-04-14)',
   'token', NULL, NULL, 'USD', '2025-04-14', true, true,
   'Seed — admin must confirm rates against provider pricing before use'),
  ('openai', 'gpt-4.1', 'GPT-4.1 (Latest)',
   'token', NULL, NULL, 'USD', '2025-04-14', true, true,
   'Seed — admin must confirm rates against provider pricing before use'),
  ('openai', 'text-embedding-3-small', 'text-embedding-3-small',
   'token', NULL, NULL, 'USD', '2024-01-25', true, true,
   'Seed — admin must confirm rates against provider pricing before use'),
  ('openai', 'text-embedding-3-large', 'text-embedding-3-large',
   'token', NULL, NULL, 'USD', '2024-01-25', true, true,
   'Seed — admin must confirm rates against provider pricing before use'),
  ('local_ollama', 'local', 'Local Ollama (Free)',
   'zero', NULL, NULL, 'USD', '2024-01-01', true, false,
   'Local provider — no cost. Rate type zero, no confirmation required.')
ON CONFLICT (provider_type, model_id, effective_from) DO NOTHING;
