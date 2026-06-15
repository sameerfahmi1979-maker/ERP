-- =============================================================================
-- ERP NOTIFICATIONS.1 — Global Notification and Email Delivery Engine
-- Date: 2026-06-15
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 1: erp_notifications
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.erp_notifications (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  notification_code TEXT UNIQUE NULL,
  source_module TEXT NOT NULL,
  source_entity_type TEXT NULL,
  source_entity_id BIGINT NULL,
  notification_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  recipient_user_id BIGINT NULL REFERENCES public.user_profiles(id),
  recipient_role_code TEXT NULL,
  recipient_email TEXT NULL,
  channel_in_app BOOLEAN NOT NULL DEFAULT true,
  channel_email BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'unread',
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ NULL,
  dismissed_at TIMESTAMPTZ NULL,
  archived_at TIMESTAMPTZ NULL,
  action_url TEXT NULL,
  action_label TEXT NULL,
  metadata_json JSONB NULL,
  created_by BIGINT NULL REFERENCES public.user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

ALTER TABLE public.erp_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY erp_notifications_authenticated ON public.erp_notifications FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS erp_notifications_recipient_idx ON public.erp_notifications (recipient_user_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS erp_notifications_status_idx ON public.erp_notifications (status, scheduled_for) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS erp_notifications_module_idx ON public.erp_notifications (source_module, created_at DESC);

-- -----------------------------------------------------------------------------
-- STEP 2: erp_email_queue
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.erp_email_queue (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  queue_code TEXT UNIQUE NULL,
  notification_id BIGINT NULL REFERENCES public.erp_notifications(id),
  provider_config_id BIGINT NULL REFERENCES public.erp_email_provider_configs(id),
  source_module TEXT NOT NULL,
  source_entity_type TEXT NULL,
  source_entity_id BIGINT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'pending',
  from_email TEXT NULL,
  to_emails TEXT[] NOT NULL,
  cc_emails TEXT[] NULL,
  bcc_emails TEXT[] NULL,
  reply_to_email TEXT NULL,
  subject TEXT NOT NULL,
  html_body TEXT NULL,
  text_body TEXT NULL,
  template_code TEXT NULL,
  template_variables_json JSONB NULL,
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT now(),
  processing_started_at TIMESTAMPTZ NULL,
  sent_at TIMESTAMPTZ NULL,
  cancelled_at TIMESTAMPTZ NULL,
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  next_retry_at TIMESTAMPTZ NULL,
  last_error TEXT NULL,
  external_message_id TEXT NULL,
  created_by BIGINT NULL REFERENCES public.user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

ALTER TABLE public.erp_email_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_email_queue FORCE ROW LEVEL SECURITY;
CREATE POLICY erp_email_queue_authenticated ON public.erp_email_queue FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS erp_email_queue_pending_idx ON public.erp_email_queue (status, scheduled_for) WHERE status IN ('pending','failed') AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS erp_email_queue_module_idx ON public.erp_email_queue (source_module, created_at DESC);

-- -----------------------------------------------------------------------------
-- STEP 3: erp_notification_templates
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.erp_notification_templates (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  template_code TEXT NOT NULL UNIQUE,
  template_name TEXT NOT NULL,
  source_module TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  subject_template TEXT NOT NULL,
  html_template TEXT NULL,
  text_template TEXT NOT NULL,
  default_severity TEXT NOT NULL DEFAULT 'info',
  default_channel_in_app BOOLEAN NOT NULL DEFAULT true,
  default_channel_email BOOLEAN NOT NULL DEFAULT false,
  is_system BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by BIGINT NULL REFERENCES public.user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by BIGINT NULL REFERENCES public.user_profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

ALTER TABLE public.erp_notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_notification_templates FORCE ROW LEVEL SECURITY;
CREATE POLICY erp_notification_templates_authenticated ON public.erp_notification_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- STEP 4: erp_notification_delivery_logs (append-only)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.erp_notification_delivery_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  notification_id BIGINT NULL REFERENCES public.erp_notifications(id),
  email_queue_id BIGINT NULL REFERENCES public.erp_email_queue(id),
  provider_config_id BIGINT NULL REFERENCES public.erp_email_provider_configs(id),
  delivery_channel TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT NULL,
  external_message_id TEXT NULL,
  duration_ms INT NULL,
  attempt_number INT NULL,
  error_message TEXT NULL,
  metadata_json JSONB NULL,
  created_by BIGINT NULL REFERENCES public.user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.erp_notification_delivery_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_notification_delivery_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY erp_notification_delivery_logs_authenticated ON public.erp_notification_delivery_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS erp_notif_delivery_logs_queue_idx ON public.erp_notification_delivery_logs (email_queue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS erp_notif_delivery_logs_notif_idx ON public.erp_notification_delivery_logs (notification_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- STEP 5: Seed permissions
-- -----------------------------------------------------------------------------
INSERT INTO public.permissions (permission_code, permission_name, module_code, action_code, description, is_active)
VALUES
  ('notifications.view',                  'View Notifications',            'NOTIFICATIONS', 'view',    'View own in-app notifications',                        true),
  ('notifications.manage',                'Manage Notifications',          'NOTIFICATIONS', 'manage',  'Create and manage ERP notifications',                  true),
  ('notifications.dismiss',               'Dismiss Notifications',         'NOTIFICATIONS', 'dismiss', 'Dismiss own notifications',                            true),
  ('notifications.admin',                 'Notifications Admin',           'NOTIFICATIONS', 'admin',   'View and manage all ERP notifications',                true),
  ('notifications.email_queue.view',      'View Email Queue',              'NOTIFICATIONS', 'view',    'View the global ERP email queue',                      true),
  ('notifications.email_queue.manage',    'Manage Email Queue',            'NOTIFICATIONS', 'manage',  'Add and manage items in the ERP email queue',          true),
  ('notifications.email_queue.process',   'Process Email Queue',           'NOTIFICATIONS', 'manage',  'Trigger email queue processing',                       true),
  ('notifications.templates.view',        'View Notification Templates',   'NOTIFICATIONS', 'view',    'View ERP notification templates',                      true),
  ('notifications.templates.manage',      'Manage Notification Templates', 'NOTIFICATIONS', 'manage',  'Create and update ERP notification templates',         true),
  ('notifications.logs.view',             'View Delivery Logs',            'NOTIFICATIONS', 'view',    'View ERP notification delivery logs',                  true)
ON CONFLICT (permission_code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- STEP 6: Seed notification templates
-- -----------------------------------------------------------------------------
INSERT INTO public.erp_notification_templates (template_code, template_name, source_module, notification_type, subject_template, html_template, text_template, default_severity, default_channel_in_app, default_channel_email, is_system, is_active)
VALUES
  (
    'DMS_EXPIRY_REMINDER',
    'DMS Expiry Reminder',
    'DMS', 'expiry_reminder',
    'DMS Expiry Reminder: {{document_no}} — {{title}}',
    '<p>Document <strong>{{document_no}}</strong> (<em>{{title}}</em>) expires on <strong>{{expiry_date}}</strong>.</p><p>Please review and start renewal if required.</p>',
    'Document {{document_no}} ({{title}}) expires on {{expiry_date}}. Please review and start renewal if required.',
    'warning', true, true, true, true
  ),
  (
    'DMS_DOCUMENT_EXPIRED',
    'DMS Document Expired',
    'DMS', 'expired_document',
    'DMS Document Expired: {{document_no}} — {{title}}',
    '<p>Document <strong>{{document_no}}</strong> (<em>{{title}}</em>) <strong>expired on {{expiry_date}}</strong>.</p><p>Immediate renewal/review is required.</p>',
    'Document {{document_no}} ({{title}}) expired on {{expiry_date}}. Immediate renewal/review is required.',
    'urgent', true, true, true, true
  ),
  (
    'SYSTEM_TEST_EMAIL',
    'System Test Email',
    'SYSTEM', 'test_email',
    'ALGT ERP Test Email',
    '<p>This is a test email from <strong>ALGT ERP</strong>.</p>',
    'This is a test email from ALGT ERP.',
    'info', false, true, true, true
  )
ON CONFLICT (template_code) DO NOTHING;

-- =============================================================================
-- END NOTIFICATIONS.1 Migration
-- =============================================================================
