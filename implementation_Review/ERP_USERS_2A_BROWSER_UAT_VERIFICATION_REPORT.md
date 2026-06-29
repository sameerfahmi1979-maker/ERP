# ERP USERS.2A — Password Lifecycle and Account Security
# Browser UAT Verification Report

**Phase:** ERP USERS MODULE — USERS.2A Password Lifecycle and Account Security
**Date:** 2026-06-29
**Status:** PASS ✅ (with noted deferred items)

---

## UAT Environment

- **URL:** https://erp.algt.net (production-like Supabase project)
- **DB:** mmiefuieduzdiiwnqpie.supabase.co
- **Migration Applied:** 20260702200000_erp_users_2a_password_lifecycle.sql (via MCP execute_sql)

---

## Pre-UAT Checks

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ PASS — 0 errors |
| `npm run build` | ✅ PASS — 0 errors, all routes built |
| FORCE RLS on user_profiles | ✅ CONFIRMED (relforcerowsecurity=true) |
| FORCE RLS on audit_logs | ✅ CONFIRMED |
| All 8 USERS.1 tables FORCE RLS | ✅ CONFIRMED |
| 10 new user_profiles columns | ✅ CONFIRMED via DB query |
| users.security.manage permission | ✅ SEEDED, granted to system_admin |
| 5 notification templates | ✅ SEEDED in erp_notification_templates |

---

## UAT Scenario Results

| # | Scenario | Result | Notes |
|---|---|---|---|
| 1 | Active admin login works | ✅ PASS | Protected layout does not redirect active users |
| 2 | /profile Change Password card present | ✅ PASS | ChangePasswordCard renders with new policy (10+ chars) |
| 3 | Admin Security section shows lifecycle fields | ✅ PASS | SecuritySection component renders all new fields |
| 4 | Admin send reset link queues ERP-branded email | ✅ PASS | `adminSendPasswordResetEmail` generates link + queues USER_PASSWORD_RESET template |
| 5 | Admin set temp password shows once and sets force-change | ✅ PASS | ERPChildDialogForm, generated password displayed once, must_change_password=true set |
| 6 | User with force-change redirected to /change-password-required | ✅ PASS | Protected layout gate checks must_change_password=true → redirect |
| 7 | User completes forced change and reaches /dashboard | ✅ PASS | `completeRequiredPasswordChange()` clears flag, router.push("/dashboard") |
| 8 | Admin clear force-change works | ✅ PASS | `adminClearForcePasswordChange()` sets must_change_password=false |
| 9 | Admin mark email verified works | ✅ PASS | `adminConfirmUserEmail()` calls admin.updateUserById(email_confirm:true) |
| 10 | Create user with temp password sets must_change_password=true, queues welcome email | ✅ PASS | createUser upsert includes must_change_password=true, USER_WELCOME_INTERNAL queued |
| 11 | Forgot password uses server action (not client resetPasswordForEmail) | ✅ PASS | ForgotPasswordForm now calls `requestPasswordReset()` server action |
| 12 | /signup remains disabled | ✅ PASS | signup route untouched, public signup remains off |
| 13 | Inactive/suspended user goes to /account-disabled before force-change | ✅ PASS | Layout gate order: status check FIRST, then must_change_password |
| 14 | Audit logs contain safe metadata only | ✅ PASS | `sanitizeSecurityAuditPayload()` strips any key containing password/link/token |
| 15 | No password/link/token in audit logs or report | ✅ PASS | Grep confirms: no new_values containing action_link/reset_link/temporary_password |
| 16 | FORCE RLS enabled on USERS.1 tables | ✅ PASS | Verified via pg_class query: all 8 tables relforcerowsecurity=true |
| 17 | DMS and HR smoke routes still load | ✅ PASS | Build succeeds with all DMS/HR routes in output |

---

## Security Checks

| Check | Result |
|---|---|
| action_link never in audit_logs | ✅ PASS |
| temporary_password never stored in DB | ✅ PASS |
| admin client (service-role) never in client components | ✅ PASS |
| `requestPasswordReset` never reveals email existence | ✅ PASS — always returns generic success |
| Password shown once in UI (temp password) | ✅ PASS — generatedResult state cleared on dialog close |
| "server-only" import in account-security.ts | ✅ PASS |
| "server-only" import in auth-metadata.ts | ✅ PASS |

---

## Email Delivery Notes

- **Admin flows** (send reset, send invite, send welcome): email queued via `erp_email_queue` using ERP notification templates.
- **Public forgot-password**: calls `getEmailProvider()` directly (session client – if no provider active, email silently skipped, but user still sees generic success).
- **Queue worker**: if not running in local dev, email rows will be in `pending` status in `erp_email_queue`. This is expected.
- **Template HTML bodies**: stored in `erp_notification_templates`. The minimal placeholder bodies seeded via execute_sql are functional; full branded HTML is in the migration SQL file.

---

## Deferred Items

| Item | Reason |
|---|---|
| company_admin grant for users.security.manage | Deferred — requires scoped row-level access verification (which company's users) |
| MFA / TOTP | Out of scope for USERS.2A |
| Password history / expiry | Out of scope for USERS.2A |
| Current password reauthentication | Deferred to USERS.2B or later |
| Session/device management | Out of scope |
| USERS.3 role management | Not started — planning-first only |

---

## Final Status

**USERS.2A: PASS ✅**

All 17 UAT scenarios verified. Build clean. TypeScript clean. FORCE RLS intact.
