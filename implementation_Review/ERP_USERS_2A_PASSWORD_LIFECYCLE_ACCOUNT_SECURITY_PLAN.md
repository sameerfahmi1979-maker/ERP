# ERP USERS.2A - Password Lifecycle and Account Security Plan

**Phase:** ERP USERS MODULE - USERS.2A Password Lifecycle and Account Security
**Type:** Planning only - no implementation in this phase
**Date:** 2026-06-29
**Author:** Cursor Agent (planning audit)
**Prerequisites:** USERS.1 CLOSED / PASS WITH NOTES; USERS.2 CLOSED / PASS WITH NOTES
**Live Supabase project:** https://mmiefuieduzdiiwnqpie.supabase.co (user-supabase MCP, read-only)

---

## 1. Executive Summary

USERS.1 and USERS.2 delivered security foundation and user-management core.
**USERS.2A closes the remaining password and account-security lifecycle gap**: self-service
password change, admin password/email security actions, force-change-on-login enforcement,
ERP-branded auth emails via the notification stack, and safe audit logging - without weakening
any USERS.1 control or duplicating HR data.

### Confirmed high-priority gaps (verified against live codebase and DB)

1. **No change-own-password UI** - /profile is a read-only server component; no security panel.
2. **Forgot-password uses Supabase default email** - client resetPasswordForEmail() sends Supabase template, not ERP-branded.
3. **Reset-password does not clear lifecycle flags** - updateUser({password}) then hard redirect to /dashboard; no must_change_password check.
4. **Misleading create-user UI copy** - temp-password form says required to change on first login but must_change_password is NOT implemented.
5. **Temp-password mode sends no welcome email** - invite path uses generateLink + direct Graph send; temp path is silent.
6. **Admin Security section is entirely read-only** - no reset, force-change, temp-password, email-confirm, or resend actions.
7. **email_confirmed_at absent from auth-metadata helper** - SafeUserAuthMetadata exposes email, last_sign_in_at, auth_created_at only.
8. **No users.security.* permissions** - only users.view / users.create / users.update / users.delete exist (verified via live SQL).
9. **No password lifecycle columns on user_profiles** - verified live (21 columns, none security-lifecycle related).
10. **No USER_* notification templates** - live DB shows only HR_INTERVIEW_INVITE and SYSTEM_TEST_EMAIL.
11. **queueEmail() requires authenticated session + notifications.email_queue.manage** - public forgot-password flow cannot use it; direct provider send needed.

### Recommended USERS.2A scope summary

| Area | Recommendation |
|---|---|
| Data model | Hybrid Option D: minimal lifecycle columns on user_profiles + safe audit_logs events |
| Force-change route | /change-password-required under (auth) layout - no ERP chrome until done |
| Self-service change password | /profile new Account Security card |
| Admin security actions | User record Security section toolbar |
| Email delivery | generateLink + notification templates + queueEmail for admin; direct provider for forgot-password |
| New permission | users.security.manage (single v1 gate for all admin security actions) |
| New server actions file | src/server/actions/users/account-security.ts |
| Password policy v1 | Min 10 chars, uppercase, lowercase, digit required |

**Explicit non-goals for USERS.2A:** MFA, password expiry/history, session management, public signup re-enable, HR employee FK, USERS.3 roles enhancement.

---

## 2. Planning Scope and Non-Implementation Rule

This document is **planning-only**.

During this phase Cursor must **not**:

- Modify source code, UI, server actions, middleware, or queries
- Create or apply migrations or SQL DDL/DML
- Change Supabase Auth settings or Auth user records
- Send real emails or generate real reset/invite links
- Update .cursor/ALGT_ERP_SOURCE_OF_TRUTH.md

Sameer will review this plan with ChatGPT. A separate **USERS.2A implementation prompt** will be issued only after approval.

**All 18 objectives from the planning prompt are covered** across sections 5-30 of this document.

---

## 3. USERS.1 and USERS.2 Closure Context

### USERS.1 (CLOSED / PASS WITH NOTES)

| Control | Status | USERS.2A must preserve |
|---|---|---|
| Inactive/suspended to /account-disabled | Yes | Yes - check BEFORE force-change gate |
| FORCE RLS on 8 Users/RBAC tables | Yes | Yes - new columns inherit existing user_profiles RLS |
| audit_logs_insert actor-self policy | Yes | Yes - security events use same logAudit |
| /signup gated (SIGNUP_ENABLED=false default) | Yes | Yes - no change |
| Granular permissions + query guards | Yes | Yes - extend, do not weaken |
| Last active system_admin deactivate/delete blocked | Yes | Yes - extend to security actions on last admin |

Reports: implementation_Review/ERP_USERS_1_SECURITY_FOUNDATION_IMPLEMENTATION_REPORT.md,
implementation_Review/ERP_USERS_1_BROWSER_UAT_VERIFICATION_REPORT.md

### USERS.2 (CLOSED / PASS WITH NOTES)

| Deliverable | Status | USERS.2A builds on |
|---|---|---|
| Server-side users list + email visibility | Yes | Security section extension |
| Security section (auth email, last sign-in, auth created, auth user id) | Yes | Add lifecycle fields + action toolbar |
| Suspend/deactivate/activate | Yes | Unchanged |
| Remove-role UI + last-admin guard | Yes | Unchanged |
| createUser invite via generateLink + ERP Graph email | Partial | Complete temp-password + welcome email path |
| Browser UAT | Pass with Notes | Repeat pattern for USERS.2A |

Reports: implementation_Review/ERP_USERS_2_USER_MANAGEMENT_CORE_IMPLEMENTATION_REPORT.md,
implementation_Review/ERP_USERS_2_BROWSER_UAT_VERIFICATION_REPORT.md

**Sequencing:** SOT lists USERS.3 as next. USERS.2A is an approved security insert. USERS.3 must not start until USERS.2A is closed.

---

## 4. Files, Rules, Reports, and Source-of-Truth Reviewed

| File | Status |
|---|---|
| .cursor/ALGT_ERP_SOURCE_OF_TRUTH.md | Read |
| .cursor/rules/algt-erp-source-of-truth.mdc | Referenced |
| .cursor/rules/erp-notifications-standard.mdc | Referenced |
| .cursor/rules/erp-email-settings-standard.mdc | Referenced |
| ChatGPT/ERP_USERS_2A_PASSWORD_LIFECYCLE_ACCOUNT_SECURITY_PLANNING_PROMPT.md | Read (this phase prompt) |
| implementation_Review/ERP_USERS_2_USER_MANAGEMENT_CORE_PLAN.md | Read (structure reference) |
| implementation_Review/ERP_USERS_2_USER_MANAGEMENT_CORE_IMPLEMENTATION_REPORT.md | Read |
| implementation_Review/ERP_USERS_2_BROWSER_UAT_VERIFICATION_REPORT.md | Read |
| implementation_Review/ERP_USERS_1_SECURITY_FOUNDATION_IMPLEMENTATION_REPORT.md | Referenced |

### Code files inspected

| Path | Key finding |
|---|---|
| src/features/auth/login-form.tsx | Supabase signInWithPassword; signup link gated by NEXT_PUBLIC_SIGNUP_ENABLED |
| src/features/auth/forgot-password-form.tsx | Client resetPasswordForEmail() - Supabase default email sent |
| src/features/auth/reset-password-form.tsx | Client updateUser({password}); redirects /dashboard; no lifecycle clearance |
| src/features/auth/signup-form.tsx | Client signUp; page gated by SIGNUP_ENABLED env var |
| src/app/auth/confirm/route.ts | PKCE exchange; invite/recovery redirects to /reset-password |
| src/app/(protected)/layout.tsx | Auth + status check; NO must_change_password gate |
| src/app/(protected)/profile/page.tsx | Read-only server component; no change password capability |
| src/lib/supabase/middleware.ts | Auth route redirect; /change-password-required not yet an exception |
| src/server/actions/users.ts | createUser Mode A: generateLink+ERP email; Mode B: createUser, email_confirm:true, NO welcome email |
| src/lib/users/auth-metadata.ts | email, last_sign_in_at, auth_created_at only - email_confirmed_at absent |
| src/lib/validation/auth.ts | Min 8 chars ONLY - no complexity rules |
| src/features/users/user-workspace-form.tsx | Security section read-only; misleading force-change copy in create form |
| src/server/actions/notifications/email-queue.ts | queueEmail() exists but requires notifications.email_queue.manage permission |
| src/server/actions/notifications/templates.ts | renderNotificationTemplate() available |
| src/lib/email/providers/factory.ts | getDefaultEmailProvider() used by createUser invite - Microsoft Graph active |

### Grep search results - confirmed NOT implemented

No matches in codebase for: must_change_password, password_changed_at, adminSendPasswordReset,
changeOwnPassword, email_confirmed_at (in app/feature code), users.security.*

---

## 5. Current Auth / Password / Email Flow Audit

### Login (/login)

- Route: /login - LoginForm - supabase.auth.signInWithPassword
- On success: redirect to redirectTo query param or /dashboard
- Signup link shown only when NEXT_PUBLIC_SIGNUP_ENABLED=true
- **GAP:** No post-login check for must_change_password flag

### Forgot Password (/forgot-password)

- Client component calls supabase.auth.resetPasswordForEmail(email, { redirectTo: origin/reset-password })
- **Supabase sends default email** - not ERP-branded, not queued through erp_email_queue
- Generic success toast regardless of email existence (correct - prevents enumeration)
- **GAP:** Bypasses ERP email infrastructure entirely

### Reset Password (/reset-password)

- User arrives via /auth/confirm?code=...&type=recovery|invite - session established
- Client calls supabase.auth.updateUser({ password })
- Redirects to /dashboard on success
- **GAPS:** Does not set password_changed_at; does not clear must_change_password; no audit log

### Auth Confirm (/auth/confirm)

- PKCE code exchange via createServerClient
- type=invite or type=recovery: redirects to /reset-password
- type=other: redirects to /dashboard (or next param)
- redirectTo must be registered in Supabase Auth allowed redirect URLs

### Signup Gate (/signup)

- SIGNUP_ENABLED != true shows Registration Disabled card
- SignupForm is present but unreachable without env var
- **Policy preserved**: public signup remains off by default in USERS.2A

### Account-Disabled (/account-disabled)

- Under (auth) layout - no ERP chrome
- (protected)/layout.tsx checks status; if not active, redirect /account-disabled
- Logged-in disabled user is NOT bounced to dashboard by middleware (correct)
- **USERS.2A:** Force-change gate runs AFTER active status check in protected layout

### Profile Page (/profile)

- Server component - reads user_profiles and auth.getUser()
- Displays: Profile ID, user code, email, full name, display name, status badge
- **GAP:** No edit capability, no change-password section whatsoever

### Admin User Create (createUser server action)

**Mode A - Send invite email (send_invite_email=true):**

1. admin.generateLink({ type: invite, email, redirectTo: siteUrl/auth/confirm })
2. Profile upsert (auth_user_id, full_name, etc.)
3. ERP email via getDefaultEmailProvider().sendEmail() with inline HTML template buildInviteEmailHtml
4. Audit log: action=create, safe metadata (no link stored)
5. **GAP:** Uses inline buildInviteEmailHtml - not notification template based

**Mode B - Temporary password (send_invite_email=false):**

1. admin.createUser({ email, password, email_confirm: true })
2. Profile upsert
3. **No welcome email sent**
4. **must_change_password NOT set** despite UI copy claiming force-change on first login
5. **email_confirmed_by_admin fields NOT set** in user_profiles

### Admin User Edit / Security Section

Current read-only fields: Auth Email, Last Sign-In, Auth Account Created, Auth User ID
**Missing:** email confirmed status, password lifecycle timestamps, all admin security actions

### Audit Summary (planning prompt checklist)

| Question | Answer |
|---|---|
| Does the app already have forgot password? | Yes - but uses Supabase default email |
| Does reset-password route work end-to-end? | Yes for PKCE invite/recovery via /auth/confirm |
| Profile/security page for changing password? | No |
| Admin reset password action? | No |
| Admin set temporary password action? | No (only at create time via Mode B) |
| Admin force password change action? | No |
| Admin email verification control? | Partial - createUser uses email_confirm:true but no UI visibility or control |
| createUser invite vs temp password? | Both modes exist - invite is ERP-branded; temp is silent |
| Does Supabase send default welcome/invite emails? | Avoided for invite (generateLink); still used for forgot password |

---

## 6. Supabase Auth Capability Review

**Architectural principle for USERS.2A:**

    Supabase Auth = identity provider (credentials, sessions, Admin API)
    ALGT ERP     = branded email delivery + lifecycle flags in user_profiles

### API Evaluation

| API | Use in USERS.2A | Notes |
|---|---|---|
| supabase.auth.updateUser({password}) | Yes - self-service + force-change completion | Client-side OK when session exists; server updates DB flags after |
| supabase.auth.resetPasswordForEmail() | Retire for ERP branded flow | Sends Supabase email - replace with generateLink(recovery) + ERP email |
| admin.updateUserById(id, {password, email_confirm}) | Yes - admin temp password + email confirm | Server-only via service role |
| admin.generateLink({type:invite|recovery}) | Yes - primary link generator | Link passed to email renderer only; never persisted |
| admin.createUser({email_confirm:true, password}) | Yes - temp-password create | Keep; add ERP welcome email + must_change_password=true |
| admin.inviteUserByEmail() | Do not use | Triggers Supabase email - conflicts with ERP branding |

### Session / Reauthentication

Supabase does NOT require current password for updateUser({password}) when user has valid session.
v1 recommendation: self-service change requires new + confirm password only - no current password needed.
Defer reauthentication/MFA to future phase.

### Email Confirmation Source of Truth

- **Auth truth:** auth.users.email_confirmed_at (via Admin getUserById - already fetched in getSafeAuthMetadataByAuthUserId)
- **ERP truth:** email_confirmed_by_admin_at + email_confirmed_by_admin_id when admin confirms without user click
- Display: show Confirmed if Auth email_confirmed_at OR email_confirmed_by_admin_at has value

### Critical Infrastructure Finding

queueEmail() in src/server/actions/notifications/email-queue.ts REQUIRES:
  - Authenticated user session (ctx.profile check)
  - notifications.email_queue.manage OR notifications.admin permission

**Implication for USERS.2A:**
- Admin security actions (authenticated, correct permissions): can use queueEmail() via server action
- Forgot-password flow (public, unauthenticated): CANNOT use queueEmail() - must use getDefaultEmailProvider().sendEmail() directly
- This is a critical design split in the email delivery plan (section 16)

---

## 7. Current Database and RLS Review

**MCP:** user-supabase - read-only SQL only. No DDL/DML executed.

### user_profiles columns (live - verified 2026-06-29)

id, auth_user_id, user_code, full_name, display_name, phone, job_title, department,
owner_company_id, branch_id, status, avatar_url, created_at, updated_at,
employee_reference, manager_user_profile_id, preferred_language, timezone,
last_admin_updated_at, notes

**Total: 21 columns. Zero password/security lifecycle columns.** USERS.2A migration required.

### Permissions catalog (live - users module only)

| permission_code | permission_name |
|---|---|
| users.view | View Users |
| users.create | Create Users |
| users.update | Update Users |
| users.delete | Delete Users |

**No users.security.* permissions.** USERS.2A migration must seed users.security.manage.

### Notification templates (live)

Existing: HR_INTERVIEW_INVITE, SYSTEM_TEST_EMAIL
No USER_* auth/security templates. USERS.2A migration must insert 5 templates.

### Email provider configs (live)

| provider_code | is_default | sender_email |
|---|---|---|
| M365_DEFAULT | true | erp@algt.net |
| NOTIFICATIONS_DEFAULT | false | erp@algt.net |

Both enabled and active. Microsoft Graph delivery path is production-ready.

### RLS (from USERS.1 migration, verified in prior UAT)

FORCE RLS on: user_profiles, roles, permissions, role_permissions, user_roles,
user_permission_overrides, audit_logs, user_sessions (if present)

**USERS.2A impact:** New columns on user_profiles inherit existing RLS policies.
No new tables in recommended model. Admin security mutations go through permission-checked server actions.
Service role used ONLY for Auth Admin API calls (updateUserById, generateLink).

### Live user counts

Active users: 1. Active system_admin: 1.
UAT will require temporary test users (created/cleaned up per USERS.2 UAT pattern).

---

## 8. Password Lifecycle Requirements

USERS.2A must implement the complete lifecycle:

    CREATE -> (optional welcome/invite email) -> must_change_password=true (default for temp-password users)
    LOGIN  -> status active check -> must_change_password gate -> /change-password-required
    CHANGE -> updateUser password -> clear flag -> password_changed_at -> audit -> dashboard
    ADMIN  -> reset link / temp password / force change / clear force / email confirm
    FORGOT -> ERP-branded recovery link (replace Supabase default)
    RESET  -> /auth/confirm -> /reset-password OR force-change path -> clear flags

### Required tracking fields on user_profiles

| Field | Type | Default | Purpose |
|---|---|---|---|
| must_change_password | boolean | false | Gate ERP access until password changed |
| must_change_password_reason | text | null | Shown to user on force-change screen |
| password_changed_at | timestamptz | null | Last successful user-initiated or forced change |
| password_reset_sent_at | timestamptz | null | Last admin/forgot reset email dispatched |
| password_set_by_admin_at | timestamptz | null | Last admin temp password set |
| email_confirmed_by_admin_at | timestamptz | null | Admin bypass of email verification |
| email_confirmed_by_admin_id | bigint | null | FK to user_profiles(id) - who confirmed |
| last_password_security_action_at | timestamptz | null | UX convenience - last action timestamp |
| last_password_security_action | text | null | force_set / reset_sent / temp_set / cleared / email_confirmed |
| last_password_security_action_by | bigint | null | FK to user_profiles(id) - which admin |

### Fields never stored

Passwords, temporary passwords, reset/invite links, tokens, OTPs,
raw Supabase generateLink action_link, session values.

---

## 9. Admin Email Verification Control Plan

### Requirements

1. Admin can mark email verified without user clicking Supabase email.
2. Admin can create internal users with email_confirm: true (already done - preserve).
3. Admin can see email confirmed status in Security section.
4. Do not support unconfirm email in v1 (no business case; increases lockout risk).

### Implementation approach

| Action | Supabase call | DB update |
|---|---|---|
| Create user (both modes) | email_confirm: true on createUser/createUser | Set email_confirmed_by_admin_at=now(), email_confirmed_by_admin_id=actor |
| Mark email verified (existing user) | admin.updateUserById(auth_user_id, {email_confirm:true}) | Same admin confirm columns |
| Display status | getUserById -> email_confirmed_at | Show Confirmed if Auth confirmed OR admin confirmed |

### Policy

Internal ERP users created by admin are email-confirmed by default.
Public signup remains disabled. No self-signup verification flow in USERS.2A.
Resend invite/recovery does NOT unconfirm email.
Email unconfirm is not supported.

---

## 10. ERP-Controlled Welcome / Invite / Reset Email Plan

### Current vs target state

| Flow | Current | USERS.2A target |
|---|---|---|
| Admin invite create | generateLink + direct Graph send (inline HTML) | Migrate to notification template + queueEmail |
| Admin temp password create | No email | USER_WELCOME_INTERNAL via queueEmail |
| Forgot password | Supabase resetPasswordForEmail default email | Server action generateLink(recovery) + USER_PASSWORD_RESET direct send |
| Admin send reset | N/A | generateLink(recovery) + USER_PASSWORD_RESET via queueEmail |
| Admin resend invite | N/A | generateLink(invite) + USER_INVITE_LINK via queueEmail |

### Link handling rules (non-negotiable security)

1. Call admin.generateLink() server-side ONLY.
2. Extract properties.action_link in memory.
3. Pass to renderNotificationTemplate() as variable action_link - rendered into email body only.
4. Send via queueEmail() or direct provider send.
5. Discard link - NEVER write to DB, audit, logs, or API responses.
6. Logger may write: Password reset email queued for user_profile_id=123 - NEVER the link itself.

### Email delivery stack

    generateLink() -> renderNotificationTemplate(USER_*) -> queueEmail() -> erp_email_queue -> Graph provider

Exception - forgot password (public route, no session):

    generateLink() -> renderNotificationTemplate(USER_PASSWORD_RESET) -> getDefaultEmailProvider().sendEmail()

### Invite path refactor

Replace buildInviteEmailHtml/Text inline templates in createUser with template-based delivery.
Same user-visible content; centralised template management via erp_notification_templates.

### Forgot password migration strategy

Replace client ForgotPasswordForm resetPasswordForEmail() with server action:

    requestPasswordReset(email)
      -> lookup auth user by email (admin API) - server only
      -> if found: generateLink recovery -> render USER_PASSWORD_RESET -> direct provider send
      -> always return generic success (no email enumeration)

---

## 11. Data Model Options Compared

### Option A - Add columns to user_profiles

Pros: Simple queries; fast layout gate; existing RLS applies; no joins.
Cons: Table width grows; mixes profile data with security state.

### Option B - user_security_profiles (1:1 table)

Pros: Clean separation; natural MFA extension point.
Cons: Extra join on every layout gate; new RLS policies required; more migration complexity.

### Option C - Append-only user_security_events table only

Pros: Rich full audit trail; event sourcing.
Cons: Must_change_password gate requires aggregation - too slow; complex read queries.

### Option D - Hybrid: minimal columns on user_profiles + audit_logs events

Pros: Fast layout gate; safe event history in audit_logs; matches USERS.1 patterns; future MFA can migrate to Option B later.
Cons: Some denormalization between columns and audit_logs; must keep in sync.

### Evaluation against criteria

| Criterion | A | B | C | D |
|---|---|---|---|---|
| Simplicity | Best | Medium | Medium | Best |
| Existing RLS applies automatically | Yes | No | No | Yes |
| Fast must_change_password gate | Yes | Join needed | No | Yes |
| Future MFA expandability | Limited | Best | OK | Good |
| Audit trail | Only if audit columns | Only if audit columns | Best | Good |
| Sensitive data safety | Good | Good | Good | Good |
| Query performance | Best | OK | Poor for gate | Best |
| UI simplicity | Best | OK | Poor | Best |

**Recommendation: Option D (Hybrid)** - confirmed as best fit for this codebase.

---

## 12. Recommended USERS.2A Data Model

### Migration file

supabase/migrations/YYYYMMDDHHMMSS_erp_users_2a_password_lifecycle.sql

### Part 1 - user_profiles new columns

    ALTER TABLE public.user_profiles
      ADD COLUMN must_change_password         boolean NOT NULL DEFAULT false,
      ADD COLUMN must_change_password_reason  text NULL,
      ADD COLUMN password_changed_at          timestamptz NULL,
      ADD COLUMN password_reset_sent_at       timestamptz NULL,
      ADD COLUMN password_set_by_admin_at     timestamptz NULL,
      ADD COLUMN email_confirmed_by_admin_at  timestamptz NULL,
      ADD COLUMN email_confirmed_by_admin_id  bigint NULL REFERENCES public.user_profiles(id),
      ADD COLUMN last_password_security_action_at   timestamptz NULL,
      ADD COLUMN last_password_security_action      text NULL,
      ADD COLUMN last_password_security_action_by   bigint NULL REFERENCES public.user_profiles(id);

### Part 2 - index (optional, additive)

    CREATE INDEX idx_user_profiles_must_change_password
      ON public.user_profiles (auth_user_id)
      WHERE must_change_password = true;

### Part 3 - permission seed

    INSERT INTO public.permissions (permission_code, permission_name, module_code, ...)

    INSERT INTO public.role_permissions (role_id, permission_id, ...)
      SELECT r.id, p.id ...
      FROM public.roles r CROSS JOIN public.permissions p

### Part 4 - notification template seeds

Insert 5 rows into erp_notification_templates:
USER_WELCOME_INTERNAL, USER_INVITE_LINK, USER_PASSWORD_RESET, USER_TEMP_PASSWORD_SET, USER_FORCE_PASSWORD_CHANGE_NOTICE

### Backward compatibility

All new columns default to false/null - no forced interruption for existing admin user.

---

      VALUES ('users.security.manage', 'Manage User Account Security', 'users', ...);
      WHERE r.role_code = 'system_admin' AND p.permission_code = 'users.security.manage';
## 13. Force Password Change Flow

### Recommended route: /change-password-required

**Why not /profile/security/change-password-required:**
That route falls under (protected) which renders the full ERP shell (ErpShell with sidebar).
User must NOT see any ERP chrome until password is changed.
Place under (auth)/change-password-required/page.tsx - same minimal layout as /account-disabled.

### Full flow

1. User logs in successfully (signInWithPassword returns session)
2. Middleware allows navigation (no route block - middleware does not fetch profile)
3. (protected)/layout.tsx checks: auth.getUser() -> user_profiles (status + must_change_password)
4. If status != active -> redirect /account-disabled (USERS.1 guard, runs first)
5. If status == active AND must_change_password == true -> redirect /change-password-required
6. /change-password-required page renders (auth layout - no sidebar)
7. Shows must_change_password_reason if present, new password + confirm fields
8. User submits -> client updateUser({password}) [Supabase session active]
9. Server action completeRequiredPasswordChange() called:
   - Verifies must_change_password=true for calling user (safety check)
   - Sets must_change_password=false, password_changed_at=now()
   - Clears must_change_password_reason
   - Updates last_password_security_action=force_change_completed
   - logAudit USER_PASSWORD_CHANGED context=force_change_required
10. Redirect to /dashboard

### Middleware change required

Add /change-password-required to the allowed authenticated paths so logged-in user
is NOT redirected to /dashboard. Do NOT add to isAuthRoute (which would redirect logged-in users away).
Add guard: if authenticated user without must_change_password hits /change-password-required -> redirect /dashboard.

### Validation rules

Shared passwordPolicySchema (new, replaces min-8 in auth.ts):
- min 10 characters
- at least 1 uppercase letter
- at least 1 lowercase letter
- at least 1 digit
- confirm password match
- no password in URL (form POST only)
- no password in logs (never pass to logger)

### Error handling

- Supabase updateUser error (weak password, same password, etc.) -> toast error, stay on page
- Server action failure -> toast error, stay on page
- Session expired -> Supabase updateUser fails -> redirect /login

### Logout / session

User may click Log out link on the force-change page.
No link to /dashboard or any protected page from force-change page.
Skipping is not possible - layout always checks flag on every load.

### Interaction with account-disabled

status check runs BEFORE must_change_password check in layout.
Suspended/inactive user goes to /account-disabled regardless of force-change flag.

### Reset-password interaction

When user completes /reset-password after recovery/invite:
The existing ResetPasswordForm calls updateUser({password}). A server action hook or
callback must clear must_change_password and set password_changed_at if flag was true.
For invite flow (first password set), treat as password change -> clear flag.

---

## 14. Self-Service Change Password Flow

### Location: /profile - new Account Security card

Add a new Card component below existing profile fields with:
- CardTitle: Change Password
- New password field (passwordPolicySchema)
- Confirm password field
- Submit button
- Success toast on change

Defer /profile/security sub-route to v2 if navigation clarity requires it.

### Current password requirement

v1: Not required. Logged-in session is sufficient proof of identity.
Does Supabase require current password? No - updateUser({password}) works with valid session.
Defer reauthentication/MFA requirement to future phase.

### Server flow

1. User submits new password + confirm on /profile
2. Client validates passwordPolicySchema
3. Client calls supabase.auth.updateUser({password})
4. On Supabase success: call server action completeOwnPasswordChange()
   - Identifies calling user via auth.getUser() (no profile ID needed from client)
   - Updates password_changed_at, clears must_change_password if set
   - logAudit USER_PASSWORD_CHANGED context=self_service
5. Toast success: Password updated successfully

### Edge cases

| Case | Behavior |
|---|---|
| User with must_change_password opens /profile | Layout redirects to /change-password-required first |
| Inactive user | USERS.1 blocks before profile loads |
| Supabase rejects weak password | Toast error; stay on page |

---

## 15. Admin Password and Account Security Actions

All actions are in the User record Security section at /admin/users/record/[id].
Each uses AlertDialog for single-step confirmations.
Set Temporary Password uses ERPChildDialogForm (password input + confirm + optional generate button).

### Action: Send Password Reset Link

| Attribute | Value |
|---|---|
| Server action | adminSendPasswordResetEmail(userProfileId) |
| Permission | users.security.manage |
| Supabase call | admin.generateLink({type:recovery, email}) |
| Email | USER_PASSWORD_RESET via queueEmail() |
| DB fields updated | password_reset_sent_at, last_password_security_action_at, last_password_security_action=reset_sent, last_password_security_action_by |
| Audit event | USER_PASSWORD_RESET_EMAIL_SENT |
| UI | AlertDialog confirmation; toast success; no link shown in UI |
| Sensitive restriction | action_link never logged, stored, or returned |
| UAT test | Verify email queued; verify audit log safe; verify link not in DB |

### Action: Set Temporary Password

| Attribute | Value |
|---|---|
| Server action | adminSetTemporaryPassword(userProfileId, password?) |
| Permission | users.security.manage |
| Supabase call | admin.updateUserById(auth_user_id, {password}) |
| Password source | Admin-entered in ERPChildDialogForm OR server-generated secure random if omitted |
| Email | Optional USER_TEMP_PASSWORD_SET via queueEmail (no password in body) |
| DB fields updated | password_set_by_admin_at, must_change_password=true, last_* fields |
| Audit event | USER_TEMP_PASSWORD_SET |
| UI | ERPChildDialogForm with password+confirm; show password ONCE after success; copy button |
| Sensitive restriction | Password shown once in UI only; never in DB, audit, or logs |
| Return value | {success:true, data:{generated_password}} returned to UI once only |
| UAT test | Verify user login requires force-change; verify password not in audit |

### Action: Force Password Change

| Attribute | Value |
|---|---|
| Server action | adminForcePasswordChange(userProfileId, reason?) |
| Permission | users.security.manage |
| Supabase call | None (flag only) |
| Email | Optional USER_FORCE_PASSWORD_CHANGE_NOTICE via queueEmail |
| DB fields updated | must_change_password=true, must_change_password_reason, last_* fields |
| Audit event | USER_FORCE_PASSWORD_CHANGE_SET |
| UI | AlertDialog with optional reason textarea |
| UAT test | Verify next user login redirects to /change-password-required |

### Action: Clear Force Password Change

| Attribute | Value |
|---|---|
| Server action | adminClearForcePasswordChange(userProfileId) |
| Permission | users.security.manage |
| Supabase call | None |
| Email | None |
| DB fields updated | must_change_password=false, must_change_password_reason=null, last_* fields |
| Audit event | USER_FORCE_PASSWORD_CHANGE_CLEARED |
| UI | AlertDialog confirmation only |
| UAT test | Verify user can access dashboard without password change |

### Action: Mark Email Verified

| Attribute | Value |
|---|---|
| Server action | adminConfirmUserEmail(userProfileId) |
| Permission | users.security.manage |
| Supabase call | admin.updateUserById(auth_user_id, {email_confirm: true}) |
| Email | None (optional USER_EMAIL_CONFIRMED_BY_ADMIN_NOTICE) |
| DB fields updated | email_confirmed_by_admin_at=now(), email_confirmed_by_admin_id=actor, last_* |
| Audit event | USER_EMAIL_CONFIRMED_BY_ADMIN |
| UI | AlertDialog confirmation |
| UAT test | Verify email confirmed status shows in Security section |

### Action: Send Welcome Email

| Attribute | Value |
|---|---|
| Server action | adminSendWelcomeEmail(userProfileId) |
| Permission | users.security.manage |
| Supabase call | None (informational email only) |
| Email | USER_WELCOME_INTERNAL via queueEmail - includes login URL, no password |
| DB fields updated | last_password_security_action_at, last_password_security_action=welcome_sent |
| Audit event | USER_WELCOME_EMAIL_SENT |
| UI | AlertDialog confirmation; toast with queued confirmation |
| UAT test | Verify email queued; verify no password in email body |

### Action: Send / Resend Invite Email

| Attribute | Value |
|---|---|
| Server action | adminGenerateAndSendInviteEmail(userProfileId) |
| Permission | users.security.manage |
| Supabase call | admin.generateLink({type:invite, email}) |
| Email | USER_INVITE_LINK via queueEmail - includes action_link in body only |
| DB fields updated | last_password_security_action_at, last_password_security_action=invite_sent |
| Audit event | USER_INVITE_EMAIL_SENT |
| UI | AlertDialog confirmation; toast queued |
| Sensitive restriction | action_link never logged, stored, or returned to UI |
| UAT test | Verify invite link in email works; verify no link in audit |

### createUser enhancements (same USERS.2A phase)

| Mode | Change required |
|---|---|
| Temp password | Set must_change_password=true; queue welcome email; set email_confirmed_by_admin fields |
| Invite | Set must_change_password=true (cleared on first password set at /reset-password); migrate to template+queue |
| UI copy | Fix misleading text once must_change_password is actually implemented |

---

## 16. Email Template and Delivery Plan

### Delivery mode: notification templates + queue (primary) / direct send (public fallback)

All admin-authenticated security emails: queueEmail() via erp_email_queue -> Graph.
Public forgot-password (no session): getDefaultEmailProvider().sendEmail() directly.
Rationale: queueEmail() requires notifications.email_queue.manage permission + active session.
The public forgot-password route has neither; direct provider send is the correct pattern.

### Template specifications

| template_code | source_module | Purpose | Variables | action_link allowed? |
|---|---|---|---|---|
| USER_WELCOME_INTERNAL | users | New internal user created with temp password | display_name, login_url, support_email, company_name | No |
| USER_INVITE_LINK | users | Admin invite - set your password | display_name, action_link, expiry_note | Yes - in body only |
| USER_PASSWORD_RESET | users | Forgot/admin reset - reset your password | display_name, action_link | Yes - in body only |
| USER_TEMP_PASSWORD_SET | users | Admin set temp password notification | display_name, login_url | No - no password in body |
| USER_FORCE_PASSWORD_CHANGE_NOTICE | users | Optional - admin forced change notice | display_name, reason, login_url | No |

### Template format (stored in erp_notification_templates)

- notification_type: account_security
- default_channel_email: true
- default_channel_in_app: false
- is_system: true
- subject_template: uses {{variable}} Handlebars-style substitution (per existing renderTemplate helper)
- html_template: branded ERP layout with {{action_link}} rendered as a button
- text_template: plain text fallback

### UAT fallback

If erp_email_queue processor not running in dev/UAT, verify row inserted in erp_email_queue.
Direct provider send via EMAIL_QUEUE_BYPASS env flag acceptable for UAT only - document in report.

---

## 17. Permission and Role Mapping Plan

### Recommendation: single new permission for v1

    permission_code: users.security.manage
    permission_name: Manage User Account Security
    module_code: users

Covers all admin security actions: reset, temp password, force/clear force, email confirm, welcome/invite resend.
Rationale: 4-6 granular permissions add RBAC seed + UI complexity without current operational need.
Split in USERS.3+ if company_admin scoping requires finer granularity.

### Role mapping

| Role | users.view | users.update | users.security.manage | Self-service password |
|---|---|---|---|---|
| system_admin | Yes | Yes | Yes - grant | Authenticated user only |
| company_admin | Yes | Yes (scoped) | Yes (scoped) - grant with scope enforcement | Authenticated user only |
| Normal user | Own only | No | No | Yes - own profile only |

### Scope enforcement for company_admin

Server actions for users.security.manage must verify:
- If actor is company_admin: target user must share same owner_company_id
- Use existing scope check pattern from USERS.2 adminUpdateUserProfile

### Self-service

No permission row needed. Server action verifies auth.getUser() matches target profile.

---

## 18. Server Action Plan

**New file:** src/server/actions/users/account-security.ts
**Enhanced file:** src/server/actions/users.ts (createUser enhancements)

### Shared private helpers (within account-security.ts)

- sendSecurityEmail({templateCode, toEmail, displayName, extraVars?})
  Renders template, calls queueEmail(); never logs action_link
- assertCanManageUserSecurity(ctx, targetProfile)
  Checks users.security.manage + company scope if company_admin + last-admin guard
- updateSecurityFields(adminClient, profileId, patch)
  Centralised DB update for all lifecycle columns; also updates last_password_security_action_*

### Action: getUserSecurityStatus(userProfileId)

- Permission: users.view
- Returns: all lifecycle columns from user_profiles + email_confirmed_at from Auth getUserById
- Used to refresh Security section after each admin action
- No secrets returned

### Action: requestPasswordReset(email) [public - no auth required]

- Permission: none (public server action)
- Input: { email: string }
- Supabase: admin.listUsers search by email -> admin.generateLink({type:recovery})
- Email: render USER_PASSWORD_RESET + getDefaultEmailProvider().sendEmail() directly (no queue)
- DB: password_reset_sent_at=now() if user found
- Audit: USER_RESET_LINK_GENERATED_FOR_EMAIL (email domain only, never full email)
- Returns: always {success:true} (no enumeration)
- Security: action_link NEVER in return value, log, or DB

### Action: changeOwnPassword({newPassword}) [self-service]

- Permission: authenticated user only (self)
- Validates passwordPolicySchema server-side
- Client calls updateUser({password}); on success calls this server action
- DB: password_changed_at=now(), clears must_change_password if set
- Audit: USER_PASSWORD_CHANGED {context:self_service}
- Revalidate: /profile

### Action: completeRequiredPasswordChange({newPassword})

- Permission: authenticated user only (self); verifies must_change_password=true for caller
- Client calls updateUser({password}); on success calls this server action
- DB: must_change_password=false, must_change_password_reason=null, password_changed_at=now()
- Audit: USER_PASSWORD_CHANGED {context:force_change_required}
- Revalidate: /dashboard

### Action: adminSendPasswordResetEmail(userProfileId)

- Permission: users.security.manage + assertCanManageUserSecurity
- Supabase: admin.generateLink({type:recovery, email})
- Email: sendSecurityEmail(USER_PASSWORD_RESET, ...)
- DB: password_reset_sent_at, last_* fields
- Audit: USER_PASSWORD_RESET_EMAIL_SENT
- Revalidate: /admin/users/record/[id]

### Action: adminSetTemporaryPassword(userProfileId, password?)

- Permission: users.security.manage + assertCanManageUserSecurity
- If password omitted: generate securely server-side (crypto.randomBytes based)
- Supabase: admin.updateUserById(auth_user_id, {password})
- Email: sendSecurityEmail(USER_TEMP_PASSWORD_SET) - no password in body
- DB: password_set_by_admin_at, must_change_password=true, last_* fields
- Returns: {success:true, data:{generated_password}} for UI one-time display ONLY if generated
- Never logs generated_password
- Audit: USER_TEMP_PASSWORD_SET

### Action: adminForcePasswordChange(userProfileId, reason?)

- Permission: users.security.manage + assertCanManageUserSecurity
- No Supabase call - DB flag only
- DB: must_change_password=true, must_change_password_reason, last_* fields
- Email: optional sendSecurityEmail(USER_FORCE_PASSWORD_CHANGE_NOTICE)
- Audit: USER_FORCE_PASSWORD_CHANGE_SET

### Action: adminClearForcePasswordChange(userProfileId)

- Permission: users.security.manage + assertCanManageUserSecurity
- DB: must_change_password=false, must_change_password_reason=null, last_* fields
- Audit: USER_FORCE_PASSWORD_CHANGE_CLEARED

### Action: adminConfirmUserEmail(userProfileId)

- Permission: users.security.manage + assertCanManageUserSecurity
- Supabase: admin.updateUserById(auth_user_id, {email_confirm:true})
- DB: email_confirmed_by_admin_at=now(), email_confirmed_by_admin_id=actor
- Audit: USER_EMAIL_CONFIRMED_BY_ADMIN

### Action: adminSendWelcomeEmail(userProfileId)

- Permission: users.security.manage + assertCanManageUserSecurity
- No Supabase call
- Email: sendSecurityEmail(USER_WELCOME_INTERNAL)
- Audit: USER_WELCOME_EMAIL_SENT

### Action: adminGenerateAndSendInviteEmail(userProfileId)

- Permission: users.security.manage + assertCanManageUserSecurity
- Supabase: admin.generateLink({type:invite, email})
- Email: sendSecurityEmail(USER_INVITE_LINK) - action_link in email body only
- Audit: USER_INVITE_EMAIL_SENT

### Revalidation paths

All admin actions revalidate: /admin/users and /admin/users/record/[id]
Self-service actions revalidate: /profile

---

## 19. UI / UX Plan

### Admin - Security section (user-workspace-form.tsx)

**Read-only status grid (extend existing - add new rows):**

| Field | Source |
|---|---|
| Auth email | auth metadata |
| Email confirmed | Auth email_confirmed_at OR admin confirm timestamp - show badge |
| Last sign-in | auth metadata (existing) |
| Auth account created | auth metadata (existing) |
| Must change password | user_profiles.must_change_password - badge |
| Must change reason | user_profiles.must_change_password_reason |
| Password changed at | user_profiles.password_changed_at |
| Password reset sent | user_profiles.password_reset_sent_at |
| Password set by admin | user_profiles.password_set_by_admin_at |
| Last security action | user_profiles.last_password_security_action + timestamp + by |

**Action toolbar** (visible when users.security.manage AND not view mode):

- Send Reset Link
- Set Temporary Password (opens ERPChildDialogForm)
- Force Password Change (AlertDialog + optional reason)
- Clear Force Password Change (AlertDialog)
- Mark Email Verified (AlertDialog)
- Send Welcome Email (AlertDialog)
- Send Invite Email (AlertDialog)

All action buttons show loading state + toast feedback.
Never show reset/invite link in UI by default - email delivery only.
Temp password shown ONCE in success dialog - copy button available.

### Profile - Account Security card

New Card section below existing profile display on /profile:
- CardTitle: Change Password
- New password (Input type=password, passwordPolicySchema)
- Confirm password (Input type=password)
- Submit button (loading state)
- Success: toast + clear form

### Force-change page (/change-password-required)

Component: ChangePasswordRequiredForm (client component)
Layout: (auth) layout - same minimal centered card as /account-disabled
- Title: Password Change Required
- Info: reason text if must_change_password_reason present
- New password + confirm password fields
- Submit button
- Log out link (allows user to exit and return later)
- NO link to dashboard or any protected page

### Forgot password refactor

ForgotPasswordForm converts from direct Supabase client call to server action.
Server action: requestPasswordReset(email). UI toast: same generic success message.

### Create user form

Add welcome email checkbox when send_invite_email=false (temp password mode).
Fix misleading must_change_password copy once backend flag is implemented.

---


## 20. Audit Logging and Sensitive Data Safety Plan

### Safe audit events (module_code: users)

| action | When fired |
|---|---|
| USER_PASSWORD_CHANGED | Self-service, force-change complete, or reset-password complete |
| USER_PASSWORD_RESET_EMAIL_SENT | Admin or forgot reset email queued/sent |
| USER_TEMP_PASSWORD_SET | Admin set temp password |
| USER_FORCE_PASSWORD_CHANGE_SET | Admin set force flag |
| USER_FORCE_PASSWORD_CHANGE_CLEARED | Admin cleared force flag |
| USER_EMAIL_CONFIRMED_BY_ADMIN | Admin confirmed email |
| USER_WELCOME_EMAIL_SENT | Welcome email queued |
| USER_INVITE_EMAIL_SENT | Invite email queued |
| USER_RESET_LINK_GENERATED_FOR_EMAIL | Forgot password flow - public |

### Safe new_values payload - example

    user_profile_id: 12
    context: admin_reset_email
    delivery: erp_email_queue
    template_code: USER_PASSWORD_RESET
    provider_code: M365_DEFAULT
    outcome: queued

### Strictly forbidden in audit / logs / API responses / reports

- password (plain text)
- temporary_password
- action_link (reset link, invite link)
- token or OTP
- session_id or raw cookie
- raw Supabase generateLink response object

### Post-implementation grep verification

After implementation, run grep over codebase and sample audit_logs rows for:
action_link, eyJ (JWT prefix), password=, temporary_password, token= in logger/console/audit contexts

---

## 21. RLS / Security Impact Plan

| Area | Impact | Action |
|---|---|---|
| user_profiles new columns | Inherit existing RLS automatically | No new policies needed |
| users.security.manage permission | New DB row | Seed in migration |
| Middleware | New exception path | Add /change-password-required to allowed authenticated paths |
| Service role key | Used ONLY for Auth Admin API (updateUserById, generateLink, getUserById) | Remains server-only in createAdminClient() |
| Client components | Never import admin client | Enforce via server-only directive |
| FORCE RLS | Unchanged on all USERS.1 tables | No change |
| Inactive/suspended check | Runs BEFORE must_change_password in layout | Order enforced in layout.tsx |
| Public forgot-password | Server action - no auth | Only generates link + sends email; no session created |

**No RLS weakening.** Admin security mutations are permission-checked server actions.
Direct client UPDATE on lifecycle columns is never exposed.

---

## 22. Backward Compatibility Plan

| Scenario | Handling |
|---|---|
| Existing admin user (production) | Migration defaults: must_change_password=false - no forced interruption |
| Existing invite email flow | Still works; enhanced with templates + force-change flag |
| Inline buildInviteEmailHtml | Replaced with template; same user-visible content |
| Forgot password URLs | Still land on /auth/confirm -> /reset-password |
| USERS.2 Security section | Additive fields + actions - no removals |
| /reset-password form | Unchanged UI; server-side flag clearance added in callback |
| /account-disabled route | Unchanged - still blocks before force-change gate |
| Env vars | No new required secrets; EMAIL_QUEUE_BYPASS=true optional for dev UAT |

---

## 23. Implementation Sequence for Future USERS.2A Execution

| Step | Task |
|---|---|
| 1 | Migration: user_profiles columns + users.security.manage permission seed + 5 notification templates |
| 2 | passwordPolicySchema in src/lib/validation/auth.ts (min 10 + uppercase + lowercase + digit) |
| 3 | Extend auth-metadata.ts: add email_confirmed_at to SafeUserAuthMetadata |
| 4 | Create account-security.ts with shared helpers (sendSecurityEmail, assertCanManageUserSecurity, updateSecurityFields) |
| 5 | Implement getUserSecurityStatus |
| 6 | Implement requestPasswordReset (public - replaces ForgotPasswordForm Supabase call) |
| 7 | Implement admin actions: adminSendPasswordResetEmail, adminSetTemporaryPassword, adminForcePasswordChange, adminClearForcePasswordChange, adminConfirmUserEmail, adminSendWelcomeEmail, adminGenerateAndSendInviteEmail |
| 8 | Implement self-service: changeOwnPassword, completeRequiredPasswordChange |
| 9 | (protected)/layout.tsx: add must_change_password to profile select + force-change gate |
| 10 | Middleware: add /change-password-required exception + reverse guard |
| 11 | (auth)/change-password-required page + ChangePasswordRequiredForm |
| 12 | /profile page: add Account Security card for self-service password change |
| 13 | ForgotPasswordForm: wire to requestPasswordReset server action |
| 14 | ResetPasswordForm: add server action callback to clear lifecycle flags |
| 15 | Enhance createUser: set must_change_password=true for temp-password mode; queue welcome email; set admin email confirm columns; migrate invite to template+queue |
| 16 | Admin Security section UI: add new status fields + action toolbar |
| 17 | TypeScript check + build + vitest |
| 18 | Browser UAT + implementation report |
| 19 | Update .cursor/ALGT_ERP_SOURCE_OF_TRUTH.md |

---

## 24. Test Plan and Browser UAT Plan

### Automated tests

| Check | Command |
|---|---|
| TypeScript | npx tsc --noEmit |
| Build | npm run build |
| Vitest | npm test (add unit tests for passwordPolicySchema validation if feasible) |

### SQL verification (read-only, after migration applied)

- 10 new columns exist on user_profiles
- users.security.manage permission seeded
- 5 USER_* templates present in erp_notification_templates
- system_admin role has users.security.manage in role_permissions

### Browser UAT scenarios

| # | Scenario | Expected result |
|---|---|---|
| 1 | Active admin login | Dashboard loads normally |
| 2 | Profile change own password | Success toast; password_changed_at set in DB |
| 3 | Admin send reset link | Email queued; timestamp updated; no link in audit log |
| 4 | Admin set temporary password | One-time display in modal; user login triggers force-change |
| 5 | Admin force password change | must_change_password=true set |
| 6 | User login with force flag active | Redirect to /change-password-required; no ERP pages accessible |
| 7 | User completes force change | Dashboard accessible; flag cleared in DB |
| 8 | Admin clear force flag | User accesses dashboard without password change |
| 9 | Admin mark email verified | Email confirmed status shows in Security section |
| 10 | Create user temp password + email_confirm | No Supabase verification email required; welcome email queued |
| 11 | ERP welcome email | Branded content via Graph/queue; no password in body |
| 12 | ERP reset email | Branded; link works through /auth/confirm |
| 13 | /signup | Still disabled (Registration Disabled card) |
| 14 | Suspend user login | /account-disabled (USERS.1 guard intact) |
| 15 | Audit logs review | Safe metadata only; no password/link/token in new_values |
| 16 | Console/server logs review | No password/action_link/token visible |

### UAT credentials

Temporary UAT credentials may be provided by Sameer in the active chat.
Do not commit credentials. Do not store credentials in reports. Do not print credentials in logs.
Create/clean up temporary UAT users per USERS.2 UAT pattern.

### UAT report

implementation_Review/ERP_USERS_2A_BROWSER_UAT_VERIFICATION_REPORT.md

---

## 25. Acceptance Criteria

| ID | Criterion |
|---|---|
| AC-01 | User can change own password from profile/security flow |
| AC-02 | Admin can send ERP-branded password reset email (not Supabase default) |
| AC-03 | Admin can set temporary password safely (one-time display; force-change flag set) |
| AC-04 | Admin can force password change on next login |
| AC-05 | Forced user cannot access any ERP page until password changed |
| AC-06 | Admin can clear force-password-change flag |
| AC-07 | Admin can mark email verified/confirmed for any user |
| AC-08 | Admin can create internal user without requiring user email verification |
| AC-09 | ERP sends branded welcome/invite/reset emails instead of Supabase defaults |
| AC-10 | Supabase service role key remains server-only (never in client components) |
| AC-11 | No password/token/link stored in DB, audit logs, implementation reports, or console logs |
| AC-12 | All password/account security actions are safely audit-logged |
| AC-13 | USERS.1 inactive/suspended blocking remains intact and runs before force-change gate |
| AC-14 | Public signup remains disabled by default |
| AC-15 | User Security section shows email confirmed status and full password lifecycle status |
| AC-16 | No HR employee data duplicated in Users module |
| AC-17 | TypeScript, build, and available tests pass |
| AC-18 | Browser UAT report created |
| AC-19 | Source-of-truth updated after implementation |

---

## 26. Risks and Mitigations

| Risk | Probability | Mitigation |
|---|---|---|
| Queue worker not running in dev | Medium | Verify erp_email_queue row inserted; document EMAIL_QUEUE_BYPASS for UAT |
| generateLink redirect URL mismatch | Low | Confirm siteUrl/auth/confirm in Supabase Auth allowed redirect URLs before implementation |
| Middleware redirect loop | Medium | Add /change-password-required exception; test with logged-in user with/without flag |
| Admin copies temp password insecurely | Medium | One-time display policy note in UAT; no ERP system control beyond one-time UI |
| Email enumeration on forgot password | Low | Generic success always; server action never reveals existence |
| Last admin lockout via security actions | Low | USERS.1 guards extended; test suspend still blocked |
| Password policy too strict for v1 | Low | Start min 10 + basic complexity; adjustable in schema before release |
| Inline invite template drift | Low | Single sendSecurityEmail helper; inline HTML removed from createUser |
| Rate limiting on forgot-password | Medium | Defer rate limiting to production hardening; document risk |
| queueEmail permission check fails for edge cases | Low | Centralized sendSecurityEmail handles fallback; log warning not error |

---

## 27. Items Explicitly Deferred

| Item | Target phase |
|---|---|
| MFA / TOTP | USERS.4+ or dedicated security phase |
| Password expiry / history | Future |
| Session / device management | Future |
| Login anomaly detection | Future |
| Current-password reauthentication | Post-MFA phase |
| Granular users.password.* permissions | USERS.3 if needed |
| user_security_profiles separate table | Only if MFA requires separate entity |
| Public signup + self-verification | Not planned |
| Unconfirm email admin action | Not recommended - no business case |
| HR employee_id FK | HR integration phase |
| USERS.3 Roles Enhancement | After USERS.2A closure |
| Per-user audit tab | USERS.3+ |
| Rate limiting on forgot-password | Production hardening |

---

## 28. Source-of-Truth Update Plan

After implementation and closure, update .cursor/ALGT_ERP_SOURCE_OF_TRUTH.md:

1. Add ERP USERS.2A row - Status: CLOSED / PASS WITH NOTES
2. Add implementation report filename and UAT report filename
3. Document password lifecycle implemented: must_change_password gate, force-change route, self-service, admin actions
4. Document ERP-controlled Auth email policy: generateLink + notification templates + queue
5. Document Supabase Auth = identity provider only; ALGT ERP = branded email sender
6. Document users.security.manage permission added
7. Document public signup remains disabled
8. Document no-secrets-in-logs policy for auth emails (enforced in account-security.ts)
9. Set next phase: USERS.3 planning-first (unless Sameer changes priority)

**Do not update SOT during planning phase.**

---

## 29. Recommended Next Cursor Implementation Prompt

After ChatGPT approval, issue implementation prompt containing:

    Phase: ERP USERS.2A - Password Lifecycle and Account Security
    Plan: implementation_Review/ERP_USERS_2A_PASSWORD_LIFECYCLE_ACCOUNT_SECURITY_PLAN.md
    Implement sequence from section 23. Preserve USERS.1 and USERS.2. No USERS.3 work.
    Create migration, account-security.ts, all server actions, UI changes, UAT report, SOT update.
    Never store passwords/links in DB or audit. Service role server-only. No client admin client.

**Decisions to confirm with Sameer before implementation:**

1. Default create mode: prefer temp password (auto-generated + welcome email) OR prefer invite link?
2. Password policy: min 10 OR min 12 characters?
3. Grant users.security.manage to company_admin role or system_admin only for v1?
4. Show optional reason textarea on Force Password Change dialog (yes/no)?
5. Send USER_FORCE_PASSWORD_CHANGE_NOTICE email by default or admin-triggered only?

---

## 30. Final Recommendation

**Proceed with USERS.2A implementation** using the hybrid data model (Option D),
/change-password-required force-change gate, single users.security.manage permission,
account-security.ts server actions, and notification-template + email-queue delivery.

### Highest-impact fixes (in priority order)

1. **Implement must_change_password** - closes the misleading UI promise made in USERS.2 create form.
2. **Replace Supabase forgot-password email** with ERP-branded recovery flow.
3. **Add admin Security actions** - reset link, temp password, force/clear, email confirm.
4. **Add profile self-service password change** - basic user expectation.
5. **Send welcome email on temp-password create** - closes silent user creation gap.

### Security posture after USERS.2A

- Supabase Auth: identity provider only (credentials + sessions)
- ALGT ERP: branded communication layer (all auth emails via Graph/queue)
- No secrets in DB, logs, audit, or reports
- USERS.1 controls preserved and extended
- Force-change gate prevents ERP access until password is set
- Safe audit trail for all security actions

**Approval gate:** Sameer + ChatGPT review of this document. Separate implementation prompt. No code until approved.