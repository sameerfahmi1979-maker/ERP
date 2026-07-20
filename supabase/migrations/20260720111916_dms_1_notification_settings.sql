-- DMS.1 — Global DMS Notification Settings & Recipient Rules
-- Phase: DMS.1 Full Notification System
-- Creates: dms_notification_settings table for global recipient configuration
-- No old 028 artifacts. No erp_notifications RLS changes.

-- ── dms_notification_settings ────────────────────────────────────────────────
-- Stores a single global configuration row (id=1 pattern) for DMS expiry
-- notification recipients. Admins configure this once; the scheduler reads it
-- automatically for each expiry notification batch run.

CREATE TABLE IF NOT EXISTS public.dms_notification_settings (
  id                      BIGSERIAL PRIMARY KEY,

  -- Global on/off switches
  is_enabled              BOOLEAN NOT NULL DEFAULT true,
  email_enabled           BOOLEAN NOT NULL DEFAULT false,
  in_app_enabled          BOOLEAN NOT NULL DEFAULT true,

  -- Reminder window configuration (JSON array of integers, e.g. [90,60,30,14,7,1,0])
  reminder_days_before    JSONB NOT NULL DEFAULT '[90,60,30,14,7,1,0]'::jsonb,

  -- Always include document owner/creator as recipient
  include_document_owner  BOOLEAN NOT NULL DEFAULT true,
  include_document_creator BOOLEAN NOT NULL DEFAULT true,

  -- Additional recipient roles (array of role_codes), e.g. ["dms_manager","hr_manager"]
  recipient_roles         JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Additional explicit recipient user_ids
  recipient_user_ids      JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Admin display name for this config
  config_name             TEXT NOT NULL DEFAULT 'Default DMS Notification Settings',
  notes                   TEXT,

  -- Audit
  created_by              BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  updated_by              BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.dms_notification_settings IS
  'DMS.1 — Global configuration for automated DMS expiry notification recipients and reminder windows.
   Expected to have a single active row (id=1). Managed by DMS admin.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_dms_notification_settings_enabled
  ON public.dms_notification_settings (is_enabled);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.dms_notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dms_notification_settings FORCE ROW LEVEL SECURITY;

-- Authenticated users with dms.admin or dms.notifications.manage may read
CREATE POLICY dms_notification_settings_select
  ON public.dms_notification_settings
  FOR SELECT
  TO authenticated
  USING (
    current_user_is_global_admin()
    OR current_user_has_permission_any_scope('dms.admin')
    OR current_user_has_permission_any_scope('dms.notifications.manage')
    OR current_user_has_permission_any_scope('dms.notifications.view')
  );

-- Only dms.admin or global admin may insert/update/delete
CREATE POLICY dms_notification_settings_manage
  ON public.dms_notification_settings
  FOR ALL
  TO authenticated
  USING (
    current_user_is_global_admin()
    OR current_user_has_permission_any_scope('dms.admin')
    OR current_user_has_permission_any_scope('dms.notifications.manage')
  )
  WITH CHECK (
    current_user_is_global_admin()
    OR current_user_has_permission_any_scope('dms.admin')
    OR current_user_has_permission_any_scope('dms.notifications.manage')
  );

-- ── Seed default row ──────────────────────────────────────────────────────────

INSERT INTO public.dms_notification_settings (
  id, is_enabled, email_enabled, in_app_enabled,
  reminder_days_before, include_document_owner, include_document_creator,
  recipient_roles, recipient_user_ids, config_name
)
VALUES (
  1, true, false, true,
  '[90,60,30,14,7,1,0]'::jsonb, true, true,
  '[]'::jsonb, '[]'::jsonb, 'Default DMS Notification Settings'
)
ON CONFLICT (id) DO NOTHING;

-- ── Permission code: dms.notifications.settings.manage ───────────────────────
-- Only insert if the permissions table exists and the code is missing.

INSERT INTO public.permissions (permission_code, permission_name, module_code, action_code, description, is_active)
VALUES (
  'dms.notifications.settings.manage',
  'Manage DMS Notification Settings',
  'DMS',
  'manage',
  'Allows managing global DMS expiry notification recipient configuration.',
  true
)
ON CONFLICT (permission_code) DO NOTHING;
