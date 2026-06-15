-- =============================================================================
-- ERP DMS.8A — Connect DMS Expiry Notifications to Global Email Delivery
-- Date: 2026-06-15
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 1: Add bridge tracking columns to dms_notification_queue
-- -----------------------------------------------------------------------------
ALTER TABLE public.dms_notification_queue
  ADD COLUMN IF NOT EXISTS global_notification_id BIGINT NULL REFERENCES public.erp_notifications(id),
  ADD COLUMN IF NOT EXISTS global_email_queue_id  BIGINT NULL REFERENCES public.erp_email_queue(id),
  ADD COLUMN IF NOT EXISTS bridge_status          TEXT NOT NULL DEFAULT 'not_bridged',
  ADD COLUMN IF NOT EXISTS bridge_attempt_count   INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bridged_at             TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS last_bridge_error      TEXT NULL,
  ADD COLUMN IF NOT EXISTS email_delivery_status  TEXT NULL,
  ADD COLUMN IF NOT EXISTS email_sent_at          TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.dms_notification_queue.bridge_status IS
  'DMS.8A bridge tracking: not_bridged | bridged | email_queued | email_sent | failed | skipped';

-- -----------------------------------------------------------------------------
-- STEP 2: Indexes for bridge queries
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_dms_notification_queue_bridge_status
  ON public.dms_notification_queue (bridge_status)
  WHERE bridge_status IN ('not_bridged', 'failed');

CREATE INDEX IF NOT EXISTS idx_dms_notification_queue_global_notification
  ON public.dms_notification_queue (global_notification_id)
  WHERE global_notification_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dms_notification_queue_global_email_queue
  ON public.dms_notification_queue (global_email_queue_id)
  WHERE global_email_queue_id IS NOT NULL;

-- Partial unique indexes to prevent duplicate bridging
CREATE UNIQUE INDEX IF NOT EXISTS uidx_dms_notif_queue_global_notification
  ON public.dms_notification_queue (global_notification_id)
  WHERE global_notification_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_dms_notif_queue_global_email_queue
  ON public.dms_notification_queue (global_email_queue_id)
  WHERE global_email_queue_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- STEP 3: Ensure DMS_EXPIRY_EMAILS and DMS_RENEWAL_EMAILS feature flags exist
-- -----------------------------------------------------------------------------
INSERT INTO public.erp_email_feature_flags
  (feature_code, feature_name, is_enabled, requires_approval, notes)
VALUES
  ('DMS_EXPIRY_EMAILS', 'DMS Expiry Reminder Emails', true,  false,
   'Send DMS document expiry reminder emails via ERP email provider. Enabled by DMS.8A.'),
  ('DMS_RENEWAL_EMAILS', 'DMS Renewal Notification Emails', false, false,
   'Send DMS renewal notification emails via ERP email provider.')
ON CONFLICT (feature_code) DO UPDATE
  SET is_enabled = EXCLUDED.is_enabled,
      notes      = EXCLUDED.notes;

-- =============================================================================
-- END DMS.8A Migration
-- =============================================================================
