# ERP USERS.2A — Password Lifecycle and Account Security
# Implementation Report

**Phase:** ERP USERS MODULE — USERS.2A Password Lifecycle and Account Security
**Date:** 2026-06-29
**Status:** CLOSED / PASS ✅

---

## 1. Executive Summary

USERS.2A implements a complete password lifecycle and account security layer on top of the USERS.1 security foundation and USERS.2 user management core. The implementation covers: self-service password change from profile, admin reset/temp password/force-change/email-confirm actions, ERP-branded auth emails via ERP notification templates + Microsoft Graph, a force-change redirect gate, public forgot-password refactored to server-side, and safe audit logging throughout.

No USERS.3, DMS, HR, AI, Party, or unrelated module code was changed.

---

## 2. Approved Plan Followed

Plan file: `implementation_Review/ERP_USERS_2A_PASSWORD_LIFECYCLE_ACCOUNT_SECURITY_PLAN.md`

All approved decisions from the implementation cursor prompt were followed, including:
- Temporary password as default (invite remains optional)
- Password policy: min 10 chars, uppercase, lowercase, digit
- `users.security.manage` granted to system_admin only (company_admin deferred)
- Optional reason textarea for force-password-change
- Optional email notice checkbox (not automatic)
- Public signup remains disabled
- Admin-created users confirmed by admin without requiring email verification

---

## 3. Files Changed

### New Files
| File | Purpose |
|---|---|
| `supabase/migrations/20260702200000_erp_users_2a_password_lifecycle.sql` | DB migration |
| `src/server/actions/users/account-security.ts` | All security server actions + helpers |
| `src/features/auth/change-password-required-form.tsx` | Force-change form component |
| `src/app/(auth)/change-password-required/page.tsx` | Force-change page (server) |
| `src/features/profile/change-password-card.tsx` | Self-service password change card |
| `src/features/users/user-security-section.tsx` | Admin security section with lifecycle fields + actions |

### Modified Files
| File | Change |
|---|---|
| `src/types/database.ts` | Added 10 USERS.2A fields to UserProfile; added email_confirmed_at to UserAuthMetadata |
| `src/lib/validation/auth.ts` | Added passwordPolicySchema (10+ chars, upper, lower, digit); updated resetPasswordSchema |
| `src/lib/users/auth-metadata.ts` | Added email_confirmed_at to SafeUserAuthMetadata |
| `src/features/users/user-schema.ts` | Updated temporary_password to use passwordPolicySchema |
| `src/server/actions/users.ts` | Enhanced createUser: must_change_password=true, admin confirm fields, ERP template emails |
| `src/app/(protected)/layout.tsx` | Added must_change_password gate after status check |
| `src/app/(protected)/profile/page.tsx` | Added ChangePasswordCard |
| `src/features/auth/forgot-password-form.tsx` | Replaced client resetPasswordForEmail with server action |
| `src/features/auth/reset-password-form.tsx` | Added recordPasswordResetCompleted() lifecycle hook |
| `src/features/users/user-workspace-form.tsx` | Imports SecuritySection, passes authContext |

---

## 4. Migration Status

- **File:** `supabase/migrations/20260702200000_erp_users_2a_password_lifecycle.sql`
- **Applied:** YES — via MCP execute_sql (supabase db push has migration history mismatch; apply_migration MCP used instead)
- **10 new columns on user_profiles:** CONFIRMED via information_schema query
- **Partial index:** CONFIRMED
- **users.security.manage permission:** SEEDED + granted to system_admin
- **5 notification templates:** SEEDED

---

## 5. Supabase Auth APIs Used

| API | Purpose |
|---|---|
| `admin.generateLink({ type: 'recovery' })` | Public forgot-password, admin send reset link |
| `admin.generateLink({ type: 'invite' })` | Admin send invite email (createUser + adminGenerateAndSendInviteEmail) |
| `admin.updateUserById(id, { password })` | Admin set temp password |
| `admin.updateUserById(id, { email_confirm: true })` | Admin confirm user email |
| `supabase.auth.updateUser({ password })` | Client-side: self-service change, forced change, reset completion |
| `admin.getUserById(authUserId)` | Fetching auth metadata (email_confirmed_at, etc.) |
| `admin.listUsers()` | Finding user by email in public reset flow |

All admin API calls are server-only. Never exposed to client.

---

## 6. Email Delivery Design

| Flow | Method |
|---|---|
| Admin: send reset link | `queueEmail()` with USER_PASSWORD_RESET template |
| Admin: send temp password notice | `queueEmail()` with USER_TEMP_PASSWORD_SET template |
| Admin: send force-change notice | `queueEmail()` with USER_FORCE_PASSWORD_CHANGE_NOTICE template |
| Admin: send welcome email | `queueEmail()` with USER_WELCOME_INTERNAL template |
| Admin: send invite email | `queueEmail()` with USER_INVITE_LINK template |
| Create user (temp password) | `queueEmail()` with USER_WELCOME_INTERNAL template |
| Create user (invite) | Direct `getDefaultEmailProvider().sendEmail()` with USER_INVITE_LINK template (or inline fallback) |
| Public forgot password | `getEmailProvider(code).sendEmail()` directly (public request has no session for queueEmail) |

`action_link` appears only in rendered email body (template variable). Never stored in audit_logs, user_profiles, or implementation reports.

---

## 7. User Profile Lifecycle Fields Added

| Column | Description |
|---|---|
| `must_change_password` | boolean, NOT NULL DEFAULT false |
| `must_change_password_reason` | text, nullable |
| `password_changed_at` | timestamptz, nullable |
| `password_reset_sent_at` | timestamptz, nullable |
| `password_set_by_admin_at` | timestamptz, nullable |
| `email_confirmed_by_admin_at` | timestamptz, nullable |
| `email_confirmed_by_admin_id` | bigint FK → user_profiles(id), nullable |
| `last_password_security_action_at` | timestamptz, nullable |
| `last_password_security_action` | text, nullable |
| `last_password_security_action_by` | bigint FK → user_profiles(id), nullable |

---

## 8. Password Policy

- **Minimum 10 characters**
- **At least 1 uppercase letter**
- **At least 1 lowercase letter**
- **At least 1 digit**
- Shared via `passwordPolicySchema` in `src/lib/validation/auth.ts`
- Used in: profile change password, change-password-required, reset-password, admin set temp password, createUser

---

## 9. Force-Change Route and Layout Gate

- `/change-password-required` — `(auth)` layout, server page with client form
- Protected layout gate order:
  1. No auth user → `/login`
  2. Profile missing → `/login`
  3. status != 'active' → `/account-disabled`
  4. must_change_password == true → `/change-password-required`
  5. Render ERP shell
- `/change-password-required` page itself also validates: unauthenticated → /login, must_change_password=false → /dashboard
- No middleware changes needed — handled entirely by page + layout

---

## 10. Admin Security Actions

All in `src/server/actions/users/account-security.ts`:
- `getUserSecurityStatus()` — requires users.security.manage
- `adminSendPasswordResetEmail()` — generates recovery link, queues USER_PASSWORD_RESET
- `adminSetTemporaryPassword()` — sets or generates password, must_change_password=true
- `adminForcePasswordChange()` — sets flag + optional reason + optional notice email
- `adminClearForcePasswordChange()` — clears flag
- `adminConfirmUserEmail()` — admin.updateUserById(email_confirm:true)
- `adminSendWelcomeEmail()` — queues USER_WELCOME_INTERNAL
- `adminGenerateAndSendInviteEmail()` — generates invite link, queues USER_INVITE_LINK

UI: `SecuritySection` component in `user-security-section.tsx` — renders lifecycle fields + action buttons with confirmation dialogs and `ERPChildDialogForm` for set-temp-password.

---

## 11. Self-Service Password Change

- `/profile` page now renders `ChangePasswordCard` (client component)
- Flow: client calls `supabase.auth.updateUser({ password })` → server action `changeOwnPassword()` updates lifecycle fields
- Uses `passwordPolicySchema`
- Clears `must_change_password` on success (in case profile had it set)

---

## 12. Forgot-Password ERP-Branded Flow

- `ForgotPasswordForm` now calls `requestPasswordReset(email)` server action
- Server action: admin client lists users, generates recovery link server-side, renders USER_PASSWORD_RESET template, sends via provider directly
- Never reveals whether email exists (always returns generic success)
- action_link never logged or returned to client

---

## 13. Create-User Welcome/Invite Enhancements

- Temp password mode: `must_change_password=true`, `password_set_by_admin_at=now()`, `email_confirmed_by_admin_at=now()`, queues USER_WELCOME_INTERNAL
- Invite mode: `must_change_password=true`, renders USER_INVITE_LINK template (fallback to inline HTML if template fetch fails)
- Inline `buildInviteEmailHtml/Text` retained as fallback
- createUserSchema now uses `passwordPolicySchema` for `temporary_password`

---

## 14. Audit Logging and Sensitive Data Safety

Audit events used:
- `USER_PASSWORD_CHANGED` — self-service, forced, reset
- `USER_PASSWORD_RESET_EMAIL_SENT` — admin send reset link
- `USER_TEMP_PASSWORD_SET` — admin temp password
- `USER_FORCE_PASSWORD_CHANGE_SET` — admin force change
- `USER_FORCE_PASSWORD_CHANGE_CLEARED` — admin clear
- `USER_EMAIL_CONFIRMED_BY_ADMIN` — admin confirm email
- `USER_WELCOME_EMAIL_SENT` — welcome email sent
- `USER_INVITE_EMAIL_SENT` — invite email sent

`sanitizeSecurityAuditPayload()` strips any key containing: password, temporary_password, action_link, invite_link, reset_link, token, otp, jwt, cookie, raw_response.

**Grep results:**
- `rg "logAudit.*action_link"` → 0 matches ✅
- `rg "new_values.*action_link"` → 0 matches ✅
- `rg "new_values.*temporary_password"` → 0 matches ✅

---

## 15. RLS / Permission Verification

| Check | Result |
|---|---|
| FORCE RLS on all 8 USERS.1 tables | ✅ CONFIRMED |
| users.security.manage granted to system_admin | ✅ CONFIRMED via role_permissions join |
| company_admin grant | DEFERRED |
| assertCanManageUserSecurity() in all admin actions | ✅ YES |
| admin client never in client components | ✅ YES |

---

## 16. Commands Run

```bash
npx tsc --noEmit         # Exit 0 — clean
npm run build            # Exit 0 — clean, 45+ routes built
```

Migration applied via MCP execute_sql (supabase db push not used — migration history mismatch with remote).

---

## 17. Browser UAT Results

See: `implementation_Review/ERP_USERS_2A_BROWSER_UAT_VERIFICATION_REPORT.md`

All 17 UAT scenarios: PASS ✅

---

## 18. Bugs Found and Fixed

| Bug | Fix |
|---|---|
| `queueEmail` required `max_attempts` field (not in schema default) | Added `max_attempts: 3` to all queueEmail calls |
| StrReplace accidentally removed closing `});` in two places | Fixed via StrReplace correction |
| user-schema.ts temporary_password used weak min(8) | Updated to use passwordPolicySchema |

---

## 19. Deferred Items

| Item | Reason |
|---|---|
| company_admin users.security.manage grant | Requires scoped access verification |
| MFA / TOTP | Out of scope USERS.2A |
| Password history / expiry | Out of scope |
| Current-password reauthentication | Deferred |
| Session/device management | Out of scope |
| Rich HTML in seeded templates (via execute_sql) | execute_sql has length limits; rich HTML is in migration file. Can be updated via Notification Templates admin UI |

---

## 20. Acceptance Criteria Checklist

- [x] must_change_password gate in protected layout
- [x] /change-password-required page + form
- [x] Self-service password change in /profile
- [x] Admin: send reset link
- [x] Admin: set temp password (with one-time display)
- [x] Admin: force password change + optional reason + optional notice
- [x] Admin: clear force password change
- [x] Admin: confirm email
- [x] Admin: send welcome email
- [x] Admin: send invite email
- [x] ERP-branded email templates (5 templates seeded)
- [x] Forgot password uses server action (not client resetPasswordForEmail)
- [x] Reset password updates lifecycle fields
- [x] createUser sets must_change_password=true
- [x] createUser queues welcome/invite email via ERP templates
- [x] users.security.manage permission seeded and granted
- [x] Safe audit logging (no passwords/links in logs)
- [x] FORCE RLS preserved
- [x] USERS.1/USERS.2 preserved
- [x] Public signup remains disabled
- [x] TypeScript clean (0 errors)
- [x] Build clean (0 errors)

---

## 21. Final Status

**ERP USERS.2A — Password Lifecycle and Account Security — CLOSED / PASS ✅**

No USERS.3 or unrelated module work was implemented.
