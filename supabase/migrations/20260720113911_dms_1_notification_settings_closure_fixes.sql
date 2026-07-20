-- DMS.1 Notification Settings Closure Fixes
-- Phase: DMS.1 Review Fix & Closure
-- Issues addressed:
--   Issue 3 — Version-controlled seed for HR_EMPLOYEE_COMPLIANCE_EXPIRY template
--   Issue 4 — Singleton safety: CHECK(id = 1) on dms_notification_settings
--   Issue 5 — Attach set_updated_at() trigger to dms_notification_settings
--   Issue 8 — Align default reminder_days_before to [90,60,30,14,7,3,1,0]

-- ── Issue 4: Singleton safety ─────────────────────────────────────────────────
-- Only id=1 may exist in dms_notification_settings.
-- Safe to add because we confirmed exactly one row (id=1) exists.

ALTER TABLE public.dms_notification_settings
  ADD CONSTRAINT dms_notification_settings_singleton CHECK (id = 1);

-- ── Issue 5: updated_at auto-maintenance ─────────────────────────────────────
-- set_updated_at() function exists and is used project-wide.
-- Attach it to dms_notification_settings.

CREATE TRIGGER set_dms_notification_settings_updated_at
  BEFORE UPDATE ON public.dms_notification_settings
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ── Issue 8: Align default reminder windows to include 3-day window ──────────
-- UI options include 3-day; DB default should match.
-- Update existing seed row and set new column default.

UPDATE public.dms_notification_settings
  SET reminder_days_before = '[90,60,30,14,7,3,1,0]'::jsonb
  WHERE id = 1
    AND reminder_days_before = '[90,60,30,14,7,1,0]'::jsonb;

ALTER TABLE public.dms_notification_settings
  ALTER COLUMN reminder_days_before SET DEFAULT '[90,60,30,14,7,3,1,0]'::jsonb;

-- ── Issue 3: Version-controlled HR_EMPLOYEE_COMPLIANCE_EXPIRY template ────────
-- Idempotent: ON CONFLICT (template_code) DO NOTHING.
-- Do not overwrite if it was already customised.

INSERT INTO public.erp_notification_templates (
  template_code,
  template_name,
  source_module,
  notification_type,
  subject_template,
  text_template,
  html_template,
  default_severity,
  default_channel_in_app,
  default_channel_email,
  is_system,
  is_active
)
VALUES (
  'HR_EMPLOYEE_COMPLIANCE_EXPIRY',
  'HR Employee Compliance Document Expiry',
  'HR',
  'compliance_expiry',
  'HR Compliance Alert: {{document_type}} for {{employee_name}} expires {{expiry_date}}',
  E'HR Compliance Document Expiry Alert\n\nEmployee: {{employee_name}} ({{employee_code}})\nDocument Type: {{document_type}}\nDocument Number: {{document_number}}\nExpiry Date: {{expiry_date}}\nDays Remaining: {{days_remaining}}\n\nPlease take action to renew this document before it expires.',
  E'<p><strong>HR Compliance Document Expiry Alert</strong></p><p>Employee: {{employee_name}} ({{employee_code}})<br>Document Type: {{document_type}}<br>Document Number: {{document_number}}<br>Expiry Date: {{expiry_date}}<br>Days Remaining: {{days_remaining}}</p><p>Please take action to renew this document before it expires.</p>',
  'warning',
  true,
  false,
  true,
  true
)
ON CONFLICT (template_code) DO NOTHING;
