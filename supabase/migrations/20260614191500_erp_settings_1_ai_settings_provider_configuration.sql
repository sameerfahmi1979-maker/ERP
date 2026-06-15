-- ============================================================================
-- ERP SETTINGS.1 — AI Settings Provider Configuration
-- Migration: erp_settings_1_ai_settings_provider_configuration
-- Date: 2026-06-14
-- Phase: ERP SETTINGS.1
-- Tables: erp_ai_provider_configs, erp_ai_usage_logs, erp_ai_feature_flags
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. erp_ai_provider_configs
--    Non-sensitive AI provider configuration.
--    API keys are NEVER stored here. Only secret_ref (env var name) and masked preview.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp_ai_provider_configs (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  config_code           TEXT NOT NULL CONSTRAINT erp_ai_provider_configs_code_uq UNIQUE,
  provider_type         TEXT NOT NULL,
  -- openai | azure_openai | azure_document_intelligence | google_document_ai | aws_textract | tesseract | local_ollama | local_custom
  provider_name         TEXT NOT NULL,
  api_endpoint          TEXT,
  -- Base URL for Azure or local providers. NOT for API keys.
  model_id              TEXT,
  -- e.g. gpt-4o, gpt-4.1, text-embedding-3-small
  api_version           TEXT,
  -- For Azure API versioning
  purpose               TEXT NOT NULL DEFAULT 'general',
  -- general | chat | ocr | classification | extraction | embedding | dms | assistant
  is_default            BOOLEAN NOT NULL DEFAULT false,
  is_enabled            BOOLEAN NOT NULL DEFAULT false,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  requires_human_review BOOLEAN NOT NULL DEFAULT true,
  confidence_threshold  NUMERIC(4,3) NOT NULL DEFAULT 0.850,
  config_json           JSONB,
  -- Non-sensitive config only: max_tokens, temperature, timeout, retry_count, language, etc.
  -- NEVER store API keys in config_json
  secret_ref            TEXT,
  -- Reference/name of env var: e.g. OPENAI_API_KEY, AZURE_OPENAI_API_KEY
  -- This is the env var NAME, NOT the value
  masked_secret_preview TEXT,
  -- Display-only masked preview: sk-****abcd. Never full key.
  last_test_status      TEXT,
  -- not_tested | success | failed
  last_test_at          TIMESTAMPTZ,
  last_test_message     TEXT,
  notes                 TEXT,
  created_by            BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by            BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ
);

COMMENT ON TABLE erp_ai_provider_configs IS
  'ERP-wide non-sensitive AI provider configuration. API keys are NEVER stored here — only secret references (env var names) and masked previews.';

COMMENT ON COLUMN erp_ai_provider_configs.secret_ref IS
  'Name of the environment variable holding the API key. Example: OPENAI_API_KEY. Never the key value itself.';

COMMENT ON COLUMN erp_ai_provider_configs.masked_secret_preview IS
  'Masked display-only preview of the key. Example: sk-****abcd. Never the full key.';

CREATE INDEX IF NOT EXISTS idx_erp_ai_configs_code
  ON erp_ai_provider_configs (config_code);

CREATE INDEX IF NOT EXISTS idx_erp_ai_configs_provider_type
  ON erp_ai_provider_configs (provider_type);

CREATE INDEX IF NOT EXISTS idx_erp_ai_configs_purpose
  ON erp_ai_provider_configs (purpose);

CREATE INDEX IF NOT EXISTS idx_erp_ai_configs_active
  ON erp_ai_provider_configs (is_active, is_enabled);

-- Ensure only one default per purpose
CREATE UNIQUE INDEX IF NOT EXISTS idx_erp_ai_configs_one_default_per_purpose
  ON erp_ai_provider_configs (purpose)
  WHERE is_default = true AND deleted_at IS NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. erp_ai_usage_logs
--    Append-only usage/cost/test log.
--    No sensitive content (prompts, OCR text, keys) is stored here.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp_ai_usage_logs (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider_config_id  BIGINT REFERENCES erp_ai_provider_configs(id) ON DELETE SET NULL,
  feature_area        TEXT NOT NULL,
  -- dms | ai_center | settings_test | embedding | etc.
  operation_type      TEXT NOT NULL,
  -- test_connection | ocr | classify | extract | chat | embedding
  model_id            TEXT,
  status              TEXT NOT NULL,
  -- success | failed | skipped
  input_token_count   INT,
  output_token_count  INT,
  estimated_cost      NUMERIC(12,6),
  duration_ms         INT,
  error_message       TEXT,
  metadata_json       JSONB,
  -- Non-sensitive metadata only. No document content, prompts, or keys.
  created_by          BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE erp_ai_usage_logs IS
  'Append-only AI usage/test log. No sensitive data (prompts, OCR text, API keys) is stored here.';

CREATE INDEX IF NOT EXISTS idx_erp_ai_usage_config
  ON erp_ai_usage_logs (provider_config_id);

CREATE INDEX IF NOT EXISTS idx_erp_ai_usage_created
  ON erp_ai_usage_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_erp_ai_usage_area_type
  ON erp_ai_usage_logs (feature_area, operation_type);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. erp_ai_feature_flags
--    Feature-level enable/disable for AI capabilities.
--    All default disabled.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp_ai_feature_flags (
  id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  feature_code              TEXT NOT NULL CONSTRAINT erp_ai_feature_flags_code_uq UNIQUE,
  feature_name              TEXT NOT NULL,
  description               TEXT,
  is_enabled                BOOLEAN NOT NULL DEFAULT false,
  requires_human_review     BOOLEAN NOT NULL DEFAULT true,
  min_confidence_threshold  NUMERIC(4,3) NOT NULL DEFAULT 0.850,
  notes                     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE erp_ai_feature_flags IS
  'Feature-level AI capability flags. All default to disabled. requires_human_review defaults to true for DMS features.';

CREATE INDEX IF NOT EXISTS idx_erp_ai_flags_code
  ON erp_ai_feature_flags (feature_code);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. RLS Policies
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE erp_ai_provider_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_ai_provider_configs FORCE ROW LEVEL SECURITY;

ALTER TABLE erp_ai_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_ai_usage_logs FORCE ROW LEVEL SECURITY;

ALTER TABLE erp_ai_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_ai_feature_flags FORCE ROW LEVEL SECURITY;

-- erp_ai_provider_configs: view requires settings.ai.view permission
DROP POLICY IF EXISTS erp_ai_configs_select ON erp_ai_provider_configs;
CREATE POLICY erp_ai_configs_select ON erp_ai_provider_configs
  FOR SELECT USING (
    current_user_has_permission('settings.ai.view')
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS erp_ai_configs_insert ON erp_ai_provider_configs;
CREATE POLICY erp_ai_configs_insert ON erp_ai_provider_configs
  FOR INSERT WITH CHECK (
    current_user_has_permission('settings.ai.manage')
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS erp_ai_configs_update ON erp_ai_provider_configs;
CREATE POLICY erp_ai_configs_update ON erp_ai_provider_configs
  FOR UPDATE USING (
    current_user_has_permission('settings.ai.manage')
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS erp_ai_configs_delete ON erp_ai_provider_configs;
CREATE POLICY erp_ai_configs_delete ON erp_ai_provider_configs
  FOR DELETE USING (current_user_has_role('system_admin'));

-- erp_ai_usage_logs: view requires settings.ai.usage.view; insert for any authenticated user (server-side)
DROP POLICY IF EXISTS erp_ai_usage_select ON erp_ai_usage_logs;
CREATE POLICY erp_ai_usage_select ON erp_ai_usage_logs
  FOR SELECT USING (
    current_user_has_permission('settings.ai.usage.view')
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS erp_ai_usage_insert ON erp_ai_usage_logs;
CREATE POLICY erp_ai_usage_insert ON erp_ai_usage_logs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- erp_ai_feature_flags: view for settings.ai.view; manage for system_admin
DROP POLICY IF EXISTS erp_ai_flags_select ON erp_ai_feature_flags;
CREATE POLICY erp_ai_flags_select ON erp_ai_feature_flags
  FOR SELECT USING (
    current_user_has_permission('settings.ai.view')
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS erp_ai_flags_update ON erp_ai_feature_flags;
CREATE POLICY erp_ai_flags_update ON erp_ai_feature_flags
  FOR UPDATE USING (
    current_user_has_permission('settings.ai.manage')
    OR current_user_has_role('system_admin')
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Seed: erp_ai_provider_configs — defaults, all disabled
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO erp_ai_provider_configs (
  config_code, provider_type, provider_name, purpose,
  model_id, is_default, is_enabled, is_active, requires_human_review,
  confidence_threshold, secret_ref, notes
) VALUES
  ('DEFAULT_CHAT',
   'openai', 'OpenAI GPT', 'chat',
   'gpt-4o', true, false, true, false, 0.850,
   'OPENAI_API_KEY',
   'Default chat provider. Enter API key in AI Settings to enable.'),
  ('DEFAULT_DMS_OCR',
   'tesseract', 'Tesseract OCR (Local)', 'ocr',
   NULL, true, false, true, true, 0.750,
   NULL,
   'Local Tesseract OCR. No API key required. Enable when DMS.9 is implemented.'),
  ('DEFAULT_DMS_CLASSIFIER',
   'openai', 'OpenAI GPT (DMS Classifier)', 'classification',
   'gpt-4o', true, false, true, true, 0.850,
   'OPENAI_API_KEY',
   'Document type classifier for DMS. Requires OpenAI API key. Enable in DMS.10.'),
  ('DEFAULT_DMS_EXTRACTOR',
   'openai', 'OpenAI GPT (DMS Extractor)', 'extraction',
   'gpt-4o', true, false, true, true, 0.850,
   'OPENAI_API_KEY',
   'Field extractor for DMS documents. Requires OpenAI API key. Enable in DMS.10.'),
  ('DEFAULT_EMBEDDING',
   'openai', 'OpenAI Embeddings', 'embedding',
   'text-embedding-3-small', true, false, true, false, 0.000,
   'OPENAI_API_KEY',
   'Text embedding provider for semantic search. Enable in DMS.12.'),
  ('LOCAL_LLM_DEFAULT',
   'local_ollama', 'Local Ollama LLM', 'general',
   NULL, false, false, true, true, 0.700,
   'LOCAL_LLM_ENDPOINT',
   'Local LLM via Ollama. Configure endpoint when local LLM is deployed.')
ON CONFLICT (config_code) DO UPDATE SET
  provider_name = EXCLUDED.provider_name,
  model_id = EXCLUDED.model_id,
  notes = EXCLUDED.notes,
  updated_at = now();

-- ────────────────────────────────────────────────────────────────────────────
-- 6. Seed: erp_ai_feature_flags — all disabled by default
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO erp_ai_feature_flags (
  feature_code, feature_name, description,
  is_enabled, requires_human_review, min_confidence_threshold
) VALUES
  ('DMS_OCR', 'DMS OCR Processing',
   'Enable OCR text extraction from uploaded DMS documents.',
   false, true, 0.750),
  ('DMS_CLASSIFICATION', 'DMS AI Document Classification',
   'Enable AI-based document type classification for DMS uploads.',
   false, true, 0.850),
  ('DMS_EXTRACTION', 'DMS AI Field Extraction',
   'Enable AI field extraction from DMS document OCR text.',
   false, true, 0.850),
  ('DMS_AI_REVIEW', 'DMS AI Human Review Queue',
   'Enable the AI review queue for DMS document processing.',
   false, true, 0.000),
  ('ERP_AI_ASSISTANT', 'ERP AI Assistant',
   'Enable the ERP AI assistant for natural language queries.',
   false, false, 0.000),
  ('AI_SEARCH', 'AI Semantic Search',
   'Enable vector-based semantic search across DMS documents.',
   false, false, 0.000),
  ('LOCAL_LLM', 'Local LLM Integration',
   'Enable local LLM (Ollama) as an AI provider.',
   false, true, 0.700)
ON CONFLICT (feature_code) DO UPDATE SET
  feature_name = EXCLUDED.feature_name,
  description = EXCLUDED.description,
  updated_at = now();

-- ────────────────────────────────────────────────────────────────────────────
-- 7. Seed: permissions for AI Settings
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO permissions (permission_code, permission_name, description, module_code, action_code, is_active)
VALUES
  ('settings.ai.view',           'View AI Settings',          'View AI provider configurations and feature flags',          'SETTINGS', 'view',    true),
  ('settings.ai.manage',         'Manage AI Settings',        'Create and update AI provider configurations',               'SETTINGS', 'manage',  true),
  ('settings.ai.test',           'Test AI Connection',        'Test AI provider connections',                               'SETTINGS', 'test',    true),
  ('settings.ai.secrets.manage', 'Manage AI Secrets',         'Update API key references for AI providers',                 'SETTINGS', 'manage',  true),
  ('settings.ai.usage.view',     'View AI Usage Logs',        'View AI usage and cost logs',                                'SETTINGS', 'view',    true)
ON CONFLICT (permission_code) DO UPDATE SET
  permission_name = EXCLUDED.permission_name,
  description = EXCLUDED.description;
