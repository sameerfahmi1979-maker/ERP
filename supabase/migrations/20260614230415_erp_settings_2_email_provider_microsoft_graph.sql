-- =============================================================================
-- ERP SETTINGS.2 — Email Provider / Microsoft 365 Graph Configuration
-- Phase:  ERP SETTINGS.2
-- Date:   2026-06-15
-- Notes:
--   Secrets are NEVER stored in this table.
--   Only secret_ref (env var or vault name) and masked_secret_preview stored.
--   All new tables have RLS enabled and forced.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 1: erp_email_provider_configs
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.erp_email_provider_configs (
  id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider_code             TEXT NOT NULL UNIQUE,
  provider_type             TEXT NOT NULL,
  provider_name             TEXT NOT NULL,
  is_default                BOOLEAN NOT NULL DEFAULT false,
  is_enabled                BOOLEAN NOT NULL DEFAULT false,
  is_active                 BOOLEAN NOT NULL DEFAULT true,

  -- Microsoft Graph / OAuth parameters (non-secret only)
  tenant_id                 TEXT NULL,
  client_id                 TEXT NULL,
  authority_url             TEXT NULL,
  graph_base_url            TEXT NULL DEFAULT 'https://graph.microsoft.com/v1.0',

  -- Sender configuration
  sender_email              TEXT NULL,
  sender_display_name       TEXT NULL,
  reply_to_email            TEXT NULL,

  -- Secret reference — env var name or vault secret name only, NEVER the actual secret
  secret_ref                TEXT NULL,
  masked_secret_preview     TEXT NULL,

  -- Auth and send modes
  auth_mode                 TEXT NOT NULL DEFAULT 'client_credentials',
  send_mode                 TEXT NOT NULL DEFAULT 'graph_send_mail',

  -- Testing
  default_recipient_for_tests TEXT NULL,

  -- Rate limiting
  throttle_per_minute       INT NULL,
  daily_send_limit          INT NULL,

  -- Last test result
  last_test_status          TEXT NULL,
  last_test_at              TIMESTAMPTZ NULL,
  last_test_message         TEXT NULL,

  -- Non-sensitive config (timeouts, retry count, save_to_sent_items, etc.)
  config_json               JSONB NULL,

  notes                     TEXT NULL,

  created_by                BIGINT NULL REFERENCES public.user_profiles(id),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by                BIGINT NULL REFERENCES public.user_profiles(id),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at                TIMESTAMPTZ NULL
);

COMMENT ON TABLE public.erp_email_provider_configs IS
  'ERP-wide email provider configuration. Secrets are never stored here; only secret references and masked previews.';

ALTER TABLE public.erp_email_provider_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_email_provider_configs FORCE ROW LEVEL SECURITY;

CREATE POLICY erp_email_provider_configs_authenticated
  ON public.erp_email_provider_configs FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS erp_email_provider_configs_active_idx
  ON public.erp_email_provider_configs (is_enabled, is_active)
  WHERE deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- STEP 2: erp_email_send_logs
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.erp_email_send_logs (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider_config_id   BIGINT NULL REFERENCES public.erp_email_provider_configs(id),
  feature_area         TEXT NOT NULL,
  operation_type       TEXT NOT NULL,
  status               TEXT NOT NULL,
  from_email           TEXT NULL,
  to_emails            TEXT[] NULL,
  cc_emails            TEXT[] NULL,
  bcc_emails           TEXT[] NULL,
  subject              TEXT NULL,
  message_preview      TEXT NULL,
  external_message_id  TEXT NULL,
  duration_ms          INT NULL,
  attempt_count        INT NOT NULL DEFAULT 0,
  last_error           TEXT NULL,
  metadata_json        JSONB NULL,
  created_by           BIGINT NULL REFERENCES public.user_profiles(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.erp_email_send_logs IS
  'Email send and test logs. Never stores full message body or secrets.';

ALTER TABLE public.erp_email_send_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_email_send_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY erp_email_send_logs_authenticated
  ON public.erp_email_send_logs FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS erp_email_send_logs_provider_idx
  ON public.erp_email_send_logs (provider_config_id, created_at DESC);
CREATE INDEX IF NOT EXISTS erp_email_send_logs_status_idx
  ON public.erp_email_send_logs (status, created_at DESC);

-- -----------------------------------------------------------------------------
-- STEP 3: erp_email_feature_flags
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.erp_email_feature_flags (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  feature_code       TEXT NOT NULL UNIQUE,
  feature_name       TEXT NOT NULL,
  is_enabled         BOOLEAN NOT NULL DEFAULT false,
  requires_approval  BOOLEAN NOT NULL DEFAULT false,
  notes              TEXT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.erp_email_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_email_feature_flags FORCE ROW LEVEL SECURITY;

CREATE POLICY erp_email_feature_flags_authenticated
  ON public.erp_email_feature_flags FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- STEP 4: Seed default provider configs (disabled by default)
-- -----------------------------------------------------------------------------
INSERT INTO public.erp_email_provider_configs (
  provider_code, provider_type, provider_name,
  is_default, is_enabled, is_active,
  graph_base_url, auth_mode, send_mode,
  notes
) VALUES
  (
    'M365_DEFAULT',
    'microsoft_graph',
    'Microsoft 365 (Default)',
    true, false, true,
    'https://graph.microsoft.com/v1.0',
    'client_credentials', 'graph_send_mail',
    'Default Microsoft 365 / Office 365 email provider. Configure tenant_id, client_id, and set the client secret via Update Secret.'
  ),
  (
    'NOTIFICATIONS_DEFAULT',
    'microsoft_graph',
    'Notifications Provider (M365)',
    false, false, true,
    'https://graph.microsoft.com/v1.0',
    'client_credentials', 'graph_send_mail',
    'Provider for ERP notification delivery (DMS expiry, renewals, etc.). Uses Microsoft 365 Graph.'
  )
ON CONFLICT (provider_code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- STEP 5: Seed email feature flags (all disabled by default)
-- -----------------------------------------------------------------------------
INSERT INTO public.erp_email_feature_flags (feature_code, feature_name, is_enabled, requires_approval, notes)
VALUES
  ('DMS_EXPIRY_EMAILS',     'DMS Expiry Reminder Emails',     false, true,  'Send DMS document expiry reminder emails via ERP email provider.'),
  ('DMS_RENEWAL_EMAILS',    'DMS Renewal Notification Emails', false, true,  'Send DMS renewal request notification emails.'),
  ('HR_EXPIRY_EMAILS',      'HR Document Expiry Emails',       false, true,  'Send HR document/contract expiry reminder emails.'),
  ('FLEET_EXPIRY_EMAILS',   'Fleet Document Expiry Emails',    false, true,  'Send fleet registration/insurance expiry reminder emails.'),
  ('WORKFLOW_EMAILS',       'Workflow Approval Emails',        false, true,  'Send approval workflow notification emails.'),
  ('REPORT_EMAILS',         'Report Email Delivery',           false, true,  'Enable scheduled or on-demand report delivery by email.'),
  ('SYSTEM_TEST_EMAIL',     'System Test Email',               true,  false, 'Allow admin test email sends from Email Settings page.')
ON CONFLICT (feature_code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- STEP 6: Seed permissions
-- -----------------------------------------------------------------------------
INSERT INTO public.permissions (permission_code, permission_name, module_code, action_code, description, is_active)
VALUES
  ('settings.email.view',                'View Email Settings',          'SETTINGS', 'view',    'View ERP email provider configurations',              true),
  ('settings.email.manage',              'Manage Email Settings',        'SETTINGS', 'manage',  'Create/update ERP email provider configurations',     true),
  ('settings.email.secrets.manage',      'Manage Email Secrets',         'SETTINGS', 'manage',  'Update email provider client secret references',      true),
  ('settings.email.test',                'Test Email Connection',        'SETTINGS', 'test',    'Test email provider connections and send test emails', true),
  ('settings.email.logs.view',           'View Email Send Logs',         'SETTINGS', 'view',    'View email send and test logs',                       true),
  ('settings.email.feature_flags.manage','Manage Email Feature Flags',   'SETTINGS', 'manage',  'Enable/disable ERP email feature flags',              true)
ON CONFLICT (permission_code) DO NOTHING;

-- =============================================================================
-- END SETTINGS.2 Migration
-- =============================================================================
