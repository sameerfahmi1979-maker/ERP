-- =============================================================================
-- ERP DMS.8 — Expiry, Renewal Tracking, and Notifications
-- Phase:  ERP DMS.8
-- Date:   2026-06-15
-- Notes:  All additions are backward-compatible.
--         No secrets stored. No email sending. In-app notification foundation only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 1: Enhance dms_expiry_reminders (add DMS.8 tracking columns)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='dms_expiry_reminders' AND column_name='notification_status') THEN
    ALTER TABLE public.dms_expiry_reminders ADD COLUMN notification_status TEXT NOT NULL DEFAULT 'pending';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='dms_expiry_reminders' AND column_name='last_notification_at') THEN
    ALTER TABLE public.dms_expiry_reminders ADD COLUMN last_notification_at TIMESTAMPTZ NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='dms_expiry_reminders' AND column_name='next_retry_at') THEN
    ALTER TABLE public.dms_expiry_reminders ADD COLUMN next_retry_at TIMESTAMPTZ NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='dms_expiry_reminders' AND column_name='retry_count') THEN
    ALTER TABLE public.dms_expiry_reminders ADD COLUMN retry_count INT NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='dms_expiry_reminders' AND column_name='dismissed_by') THEN
    ALTER TABLE public.dms_expiry_reminders ADD COLUMN dismissed_by BIGINT NULL REFERENCES public.user_profiles(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='dms_expiry_reminders' AND column_name='dismissed_at') THEN
    ALTER TABLE public.dms_expiry_reminders ADD COLUMN dismissed_at TIMESTAMPTZ NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='dms_expiry_reminders' AND column_name='dismissal_reason') THEN
    ALTER TABLE public.dms_expiry_reminders ADD COLUMN dismissal_reason TEXT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='dms_expiry_reminders' AND column_name='escalation_level') THEN
    ALTER TABLE public.dms_expiry_reminders ADD COLUMN escalation_level INT NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='dms_expiry_reminders' AND column_name='assigned_to') THEN
    ALTER TABLE public.dms_expiry_reminders ADD COLUMN assigned_to BIGINT NULL REFERENCES public.user_profiles(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='dms_expiry_reminders' AND column_name='department_code') THEN
    ALTER TABLE public.dms_expiry_reminders ADD COLUMN department_code TEXT NULL;
  END IF;
END $$;

-- Unique constraint to enforce idempotent generation
CREATE UNIQUE INDEX IF NOT EXISTS dms_expiry_reminders_doc_days_idx
  ON public.dms_expiry_reminders (document_id, reminder_days_before);

-- Index on reminder_date + status for efficient dashboard queries
CREATE INDEX IF NOT EXISTS dms_expiry_reminders_date_status_idx
  ON public.dms_expiry_reminders (reminder_date, status)
  WHERE status = 'pending';

-- Enable RLS on dms_expiry_reminders (may already be on)
ALTER TABLE public.dms_expiry_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dms_expiry_reminders FORCE ROW LEVEL SECURITY;

-- RLS policies
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='dms_expiry_reminders' AND policyname='dms_expiry_reminders_authenticated') THEN
    EXECUTE 'CREATE POLICY dms_expiry_reminders_authenticated ON public.dms_expiry_reminders FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- STEP 2: Create dms_renewal_requests
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dms_renewal_requests (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id             BIGINT NOT NULL REFERENCES public.dms_documents(id),
  renewal_no              TEXT UNIQUE NULL,
  status                  TEXT NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft','requested','in_progress','waiting_for_document','renewed','cancelled','rejected')),
  priority                TEXT NOT NULL DEFAULT 'normal'
                            CHECK (priority IN ('normal','high','urgent')),
  requested_by            BIGINT NULL REFERENCES public.user_profiles(id),
  assigned_to             BIGINT NULL REFERENCES public.user_profiles(id),
  requested_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  target_renewal_date     DATE NULL,
  old_expiry_date         DATE NULL,
  new_expiry_date         DATE NULL,
  replacement_document_id BIGINT NULL REFERENCES public.dms_documents(id),
  replacement_version_id  BIGINT NULL REFERENCES public.dms_document_versions(id),
  notes                   TEXT NULL,
  completed_at            TIMESTAMPTZ NULL,
  cancelled_at            TIMESTAMPTZ NULL,
  created_by              BIGINT NULL REFERENCES public.user_profiles(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by              BIGINT NULL REFERENCES public.user_profiles(id),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at              TIMESTAMPTZ NULL
);

ALTER TABLE public.dms_renewal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dms_renewal_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY dms_renewal_requests_authenticated
  ON public.dms_renewal_requests FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS dms_renewal_requests_document_id_idx
  ON public.dms_renewal_requests (document_id);
CREATE INDEX IF NOT EXISTS dms_renewal_requests_status_idx
  ON public.dms_renewal_requests (status)
  WHERE status NOT IN ('renewed','cancelled','rejected') AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dms_renewal_requests_assigned_to_idx
  ON public.dms_renewal_requests (assigned_to)
  WHERE assigned_to IS NOT NULL AND deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- STEP 3: Create dms_notification_queue
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dms_notification_queue (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id           BIGINT NULL REFERENCES public.dms_documents(id),
  reminder_id           BIGINT NULL REFERENCES public.dms_expiry_reminders(id),
  renewal_request_id    BIGINT NULL REFERENCES public.dms_renewal_requests(id),
  notification_type     TEXT NOT NULL,
  channel               TEXT NOT NULL DEFAULT 'in_app'
                          CHECK (channel IN ('in_app','email_ready')),
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','sent','read','dismissed','failed')),
  recipient_user_id     BIGINT NULL REFERENCES public.user_profiles(id),
  recipient_email       TEXT NULL,
  subject               TEXT NOT NULL,
  message               TEXT NOT NULL,
  scheduled_for         TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at               TIMESTAMPTZ NULL,
  read_at               TIMESTAMPTZ NULL,
  dismissed_at          TIMESTAMPTZ NULL,
  delivery_attempts     INT NOT NULL DEFAULT 0,
  last_error            TEXT NULL,
  metadata_json         JSONB NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.dms_notification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dms_notification_queue FORCE ROW LEVEL SECURITY;

CREATE POLICY dms_notification_queue_authenticated
  ON public.dms_notification_queue FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS dms_notification_queue_recipient_idx
  ON public.dms_notification_queue (recipient_user_id)
  WHERE recipient_user_id IS NOT NULL AND status = 'pending';
CREATE INDEX IF NOT EXISTS dms_notification_queue_scheduled_idx
  ON public.dms_notification_queue (scheduled_for)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS dms_notification_queue_document_idx
  ON public.dms_notification_queue (document_id)
  WHERE document_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- STEP 4: Seed new DMS permissions
-- -----------------------------------------------------------------------------
INSERT INTO public.erp_permissions (code, module, description)
VALUES
  ('dms.expiry.view',           'DMS', 'View DMS expiry dashboard and reminder schedules'),
  ('dms.expiry.manage',         'DMS', 'Generate, rebuild, and handle DMS expiry reminders'),
  ('dms.expiry.dismiss',        'DMS', 'Dismiss DMS expiry reminders'),
  ('dms.renewals.view',         'DMS', 'View DMS renewal requests'),
  ('dms.renewals.manage',       'DMS', 'Create and manage DMS renewal requests'),
  ('dms.notifications.view',    'DMS', 'View DMS notifications'),
  ('dms.notifications.manage',  'DMS', 'Manage DMS notifications (mark read, dismiss)')
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- END DMS.8 Migration
-- =============================================================================
