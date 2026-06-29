-- =============================================================================
-- ERP USERS.2A — Password Lifecycle and Account Security
-- Migration: 20260702200000_erp_users_2a_password_lifecycle.sql
-- =============================================================================
-- Applies:
--   1. Add password lifecycle columns to public.user_profiles
--   2. Seed users.security.manage permission
--   3. Grant permission to system_admin
--   4. Seed 5 ERP notification templates for auth emails
-- =============================================================================
-- Safety: additive-only. No drops. No data loss. Idempotent (IF EXISTS / ON CONFLICT).
-- FORCE RLS status on user_profiles is already set by USERS.1 migration.
-- Do NOT add employee_id. Do NOT store passwords.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SECTION 1 — Add password lifecycle columns to user_profiles
-- -----------------------------------------------------------------------------

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS must_change_password       boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS must_change_password_reason text         NULL,
  ADD COLUMN IF NOT EXISTS password_changed_at         timestamptz  NULL,
  ADD COLUMN IF NOT EXISTS password_reset_sent_at      timestamptz  NULL,
  ADD COLUMN IF NOT EXISTS password_set_by_admin_at    timestamptz  NULL,
  ADD COLUMN IF NOT EXISTS email_confirmed_by_admin_at timestamptz  NULL,
  ADD COLUMN IF NOT EXISTS email_confirmed_by_admin_id bigint       NULL
    REFERENCES public.user_profiles(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  ADD COLUMN IF NOT EXISTS last_password_security_action_at  timestamptz  NULL,
  ADD COLUMN IF NOT EXISTS last_password_security_action      text         NULL,
  ADD COLUMN IF NOT EXISTS last_password_security_action_by   bigint       NULL
    REFERENCES public.user_profiles(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

-- Partial index for fast lookup of users who must change password
CREATE INDEX IF NOT EXISTS idx_user_profiles_must_change_password
  ON public.user_profiles (auth_user_id)
  WHERE must_change_password = true;

-- -----------------------------------------------------------------------------
-- SECTION 2 — Seed users.security.manage permission
-- Grant to system_admin only.
-- company_admin grant deferred pending scoped access verification.
-- -----------------------------------------------------------------------------

INSERT INTO public.permissions (
  permission_code,
  permission_name,
  module_code,
  action_code,
  description,
  is_active
)
VALUES (
  'users.security.manage',
  'Manage User Account Security',
  'users',
  'manage',
  'Allow performing admin password lifecycle and account security actions: reset password, set temp password, force change, confirm email, send welcome/invite emails.',
  true
)
ON CONFLICT (permission_code) DO NOTHING;

-- Grant to system_admin
INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT r.id, p.id
  FROM public.roles r
  CROSS JOIN public.permissions p
  WHERE r.role_code = 'system_admin'
    AND p.permission_code = 'users.security.manage'
ON CONFLICT DO NOTHING;

-- Note: company_admin grant deferred — requires scoped row-level checks to be verified.
-- See USERS.2A implementation report for deferred items.

-- -----------------------------------------------------------------------------
-- SECTION 3 — Seed ERP notification templates for auth emails
-- Uses ON CONFLICT DO NOTHING — safe to run on existing DBs.
-- Template variables use {{variable_name}} syntax (safe renderer, no eval).
-- action_link is allowed only inside rendered email body — never in audit_logs.
-- -----------------------------------------------------------------------------

INSERT INTO public.erp_notification_templates (
  template_code,
  template_name,
  source_module,
  notification_type,
  subject_template,
  html_template,
  text_template,
  default_severity,
  default_channel_in_app,
  default_channel_email,
  is_system,
  is_active
) VALUES

-- 1. USER_WELCOME_INTERNAL — sent when admin creates user with temporary password
(
  'USER_WELCOME_INTERNAL',
  'Welcome to ALGT ERP (Internal User)',
  'users',
  'welcome',
  'Welcome to {{company_name}} ERP — Your account is ready',
  '<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
        <tr><td style="background:#0f172a;padding:24px 32px;">
          <span style="color:#f8fafc;font-size:20px;font-weight:700;letter-spacing:.5px;">{{company_name}}</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 12px;font-size:16px;color:#1e293b;font-weight:600;">Welcome, {{display_name}}</p>
          <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.6;">
            Your account has been created on the <strong>{{company_name}} ERP</strong> system.
          </p>
          <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.6;">
            A temporary password has been set for your account. You will be required to change your password when you first sign in.
          </p>
          <p style="margin:0 0 28px;text-align:center;">
            <a href="{{login_url}}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;">
              Sign In to ERP
            </a>
          </p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 16px;">
          <p style="margin:0;font-size:12px;color:#94a3b8;">
            If you did not expect this email or need assistance, contact {{support_email}}.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>',
  'Welcome to {{company_name}} ERP

Hello {{display_name}},

Your account has been created on the {{company_name}} ERP system.

A temporary password has been set. You will be required to change your password on first sign-in.

Sign in at: {{login_url}}

If you need assistance, contact {{support_email}}.',
  'info',
  false,
  true,
  true,
  true
),

-- 2. USER_INVITE_LINK — sent when admin creates user by invite link
(
  'USER_INVITE_LINK',
  'Invitation to ALGT ERP',
  'users',
  'invite',
  'You have been invited to {{company_name}} ERP',
  '<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
        <tr><td style="background:#0f172a;padding:24px 32px;">
          <span style="color:#f8fafc;font-size:20px;font-weight:700;letter-spacing:.5px;">{{company_name}}</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 12px;font-size:16px;color:#1e293b;font-weight:600;">Hello, {{display_name}}</p>
          <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.6;">
            You have been invited to access the <strong>{{company_name}} ERP</strong> system. Click the button below to accept your invitation and set your password.
          </p>
          <p style="margin:0 0 28px;text-align:center;">
            <a href="{{action_link}}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;">
              Accept Invitation
            </a>
          </p>
          <p style="margin:0 0 8px;font-size:12px;color:#94a3b8;">{{expiry_note}}</p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 16px;">
          <p style="margin:0;font-size:12px;color:#94a3b8;">
            If you did not expect this invitation, you can safely ignore this email. Contact {{support_email}} for help.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>',
  'Invitation to {{company_name}} ERP

Hello {{display_name}},

You have been invited to access the {{company_name}} ERP system.

Accept your invitation at: {{action_link}}

{{expiry_note}}

If you did not expect this invitation, you can safely ignore this email.
Contact {{support_email}} for help.',
  'info',
  false,
  true,
  true,
  true
),

-- 3. USER_PASSWORD_RESET — sent for password reset requests
(
  'USER_PASSWORD_RESET',
  'ERP Password Reset Request',
  'users',
  'password_reset',
  'Reset your {{company_name}} ERP password',
  '<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
        <tr><td style="background:#0f172a;padding:24px 32px;">
          <span style="color:#f8fafc;font-size:20px;font-weight:700;letter-spacing:.5px;">{{company_name}}</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 12px;font-size:16px;color:#1e293b;font-weight:600;">Hello, {{display_name}}</p>
          <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.6;">
            A password reset was requested for your <strong>{{company_name}} ERP</strong> account. Click the button below to reset your password.
          </p>
          <p style="margin:0 0 28px;text-align:center;">
            <a href="{{action_link}}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;">
              Reset Password
            </a>
          </p>
          <p style="margin:0 0 8px;font-size:12px;color:#94a3b8;">{{expiry_note}}</p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 16px;">
          <p style="margin:0;font-size:12px;color:#94a3b8;">
            If you did not request a password reset, you can safely ignore this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>',
  'Reset your {{company_name}} ERP password

Hello {{display_name}},

A password reset was requested for your {{company_name}} ERP account.

Reset your password at: {{action_link}}

{{expiry_note}}

If you did not request this, you can safely ignore this email.',
  'info',
  false,
  true,
  true,
  true
),

-- 4. USER_TEMP_PASSWORD_SET — sent when admin sets a temporary password
(
  'USER_TEMP_PASSWORD_SET',
  'ERP Temporary Password Set',
  'users',
  'temp_password',
  'Your {{company_name}} ERP password has been reset by an administrator',
  '<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
    <tr><td style="background:#0f172a;padding:24px 32px;">
      <span style="color:#f8fafc;font-size:20px;font-weight:700;letter-spacing:.5px;">{{company_name}}</span>
    </td></tr>
    <tr><td style="padding:32px;">
      <p style="margin:0 0 12px;font-size:16px;color:#1e293b;font-weight:600;">Hello, {{display_name}}</p>
      <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.6;">
        An administrator has set a temporary password for your <strong>{{company_name}} ERP</strong> account.
        You will be required to set a new password when you next sign in.
      </p>
      <p style="margin:0 0 28px;text-align:center;">
        <a href="{{login_url}}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;">
          Sign In to Change Password
        </a>
      </p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 16px;">
      <p style="margin:0;font-size:12px;color:#94a3b8;">
        If you did not expect this change, contact your administrator or {{support_email}} immediately.
      </p>
    </td></tr>
  </table>
</body>
</html>',
  'Your {{company_name}} ERP password has been reset by an administrator.

Hello {{display_name}},

An administrator has set a temporary password for your {{company_name}} ERP account.
You will be required to set a new password when you next sign in.

Sign in at: {{login_url}}

If you did not expect this change, contact your administrator or {{support_email}} immediately.',
  'warning',
  true,
  true,
  true,
  true
),

-- 5. USER_FORCE_PASSWORD_CHANGE_NOTICE — sent when admin forces a password change
(
  'USER_FORCE_PASSWORD_CHANGE_NOTICE',
  'ERP Force Password Change Notice',
  'users',
  'force_password_change',
  'Action required: Change your {{company_name}} ERP password',
  '<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
        <tr><td style="background:#0f172a;padding:24px 32px;">
          <span style="color:#f8fafc;font-size:20px;font-weight:700;letter-spacing:.5px;">{{company_name}}</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 12px;font-size:16px;color:#1e293b;font-weight:600;">Hello, {{display_name}}</p>
          <p style="margin:0 0 12px;font-size:14px;color:#475569;line-height:1.6;">
            An administrator has required you to change your <strong>{{company_name}} ERP</strong> password at your next sign-in.
          </p>
          <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.6;">
            <strong>Reason:</strong> {{reason}}
          </p>
          <p style="margin:0 0 28px;text-align:center;">
            <a href="{{login_url}}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;">
              Sign In to Change Password
            </a>
          </p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 16px;">
          <p style="margin:0;font-size:12px;color:#94a3b8;">
            Contact your administrator or {{support_email}} if you have questions.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>',
  'Action required: Change your {{company_name}} ERP password

Hello {{display_name}},

An administrator has required you to change your {{company_name}} ERP password at your next sign-in.

Reason: {{reason}}

Sign in at: {{login_url}}

Contact your administrator or {{support_email}} if you have questions.',
  'warning',
  true,
  true,
  true,
  true
)

ON CONFLICT (template_code) DO NOTHING;

-- =============================================================================
-- Verification queries (run manually after migration to confirm):
-- =============================================================================
-- SELECT column_name FROM information_schema.columns WHERE table_name='user_profiles' AND column_name LIKE '%password%';
-- SELECT permission_code, permission_name FROM public.permissions WHERE module_code='users';
-- SELECT rp.id FROM public.role_permissions rp JOIN public.roles r ON r.id=rp.role_id JOIN public.permissions p ON p.id=rp.permission_id WHERE r.role_code='system_admin' AND p.permission_code='users.security.manage';
-- SELECT template_code, template_name FROM public.erp_notification_templates WHERE source_module='users' ORDER BY template_code;
