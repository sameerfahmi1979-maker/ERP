# ERP USERS.5 — Security Hardening and Audit Enhancement Plan

**Phase:** ERP USERS.5 — Security Hardening and Audit Enhancement
**Date:** 2026-06-29
**Status:** PLANNING ONLY — No code, schema, RLS, UI, or data changes made.
**Author:** Cursor (senior ERP security + audit architect mode)

---

## 1. Executive Summary

USERS.1 through USERS.4 established a full RBAC foundation: user management, password lifecycle, role management, and permission-aware navigation. USERS.4 revealed and fixed a critical bootstrapping deadlock in getAuthContext() where RLS blocked permission lookups. The fix introduced createAdminClient() for permission resolution.

USERS.5 must harden the security posture of the Users/RBAC/Audit module by addressing:

1. A dev diagnostic page (/dev/auth-debug) that exposes sensitive auth context without an admin guard.
2. Inconsistent ssertAccountActive enforcement in server actions.
3. Missing Zod validation in oles.ts and permissions.ts.
4. Inconsistent audit action naming (mixed lowercase/UPPER_CASE).
5. Missing audit events for role permission assignment/removal and effective access views.
6. Broad USING (true) RLS policies on notification tables.
7. Missing user_permission_overrides and user_sessions tables (referenced in plan but not yet created).
8. No effective-access.ts server action (planned but not implemented).
9. No server-side guard on /profile page (relies only on layout redirect).
10. A missing sanitizeServerActionError() helper for standardized safe error responses.

USERS.5 will plan fixes for all of the above. No implementation is done in this document.

---

## 2. Planning Scope and Non-Implementation Rule

This is a **planning-only document**.

- No source code is changed.
- No migrations are applied.
- No RLS policies are modified.
- No permissions, roles, or users are changed.
- No Supabase Auth settings are modified.

The output of this phase is this planning document only, to be reviewed by Sameer/Dina before a USERS.5 implementation prompt is issued.

---

## 3. USERS.1–USERS.4 Closure Context

| Phase | Status | Key Deliverables |
|---|---|---|
| USERS.1 | CLOSED / PASS | Auth foundation, RLS, account-disabled guard, last-admin protection |
| USERS.2 | CLOSED / PASS WITH NOTES | User management CRUD, invite/welcome email |
| USERS.2A | CLOSED / PASS | Password lifecycle, temp passwords, force-change, sanitizeSecurityAuditPayload() |
| USERS.3 | CLOSED / PASS | Role management, clone role, permission matrix, system role protection |
| USERS.4 | CLOSED / PASS | Permission-aware sidebar, getAuthContext() RLS fix, /start route, workspace pin fix |

Known USERS.4 open items (to be addressed in USERS.5):
- /dev/auth-debug page created during runtime debugging — not guarded by equireAdmin().
- createAdminClient() introduced in check.ts for permission bootstrap — documented but not audited for all other usages.
- Browser UAT for permission-aware sidebar pending user confirmation.

---

## 4. Files, Rules, Reports, and Source-of-Truth Reviewed

### Reports reviewed

| Report | Status |
|---|---|
| ERP_USERS_1_SECURITY_FOUNDATION_IMPLEMENTATION_REPORT.md | Present |
| ERP_USERS_1_BROWSER_UAT_VERIFICATION_REPORT.md | Present |
| ERP_USERS_2_USER_MANAGEMENT_CORE_IMPLEMENTATION_REPORT.md | Present |
| ERP_USERS_2_BROWSER_UAT_VERIFICATION_REPORT.md | Present |
| ERP_USERS_2A_PASSWORD_LIFECYCLE_ACCOUNT_SECURITY_IMPLEMENTATION_REPORT.md | Present |
| ERP_USERS_2A_BROWSER_UAT_VERIFICATION_REPORT.md | Present |
| ERP_USERS_3_ROLES_MANAGEMENT_ENHANCEMENT_IMPLEMENTATION_REPORT.md | Present |
| ERP_USERS_3_BROWSER_UAT_VERIFICATION_REPORT.md | Present |
| ERP_USERS_4_PERMISSIONS_AND_EFFECTIVE_ACCESS_PLAN.md | Present |
| ERP_USERS_4_SIDEBAR_AND_HR_ROUTE_FIX_REPORT.md | Present |
| ERP_USERS_4_CRITICAL_SIDEBAR_HR_DMS_PERMISSION_CORRECTION_REPORT.md | Present |
| ERP_USERS_4_RUNTIME_PERMISSION_FLOW_CORRECTION_REPORT.md | Present |
| ERP_USERS_4_RUNTIME_PERMISSION_FLOW_BROWSER_UAT_REPORT.md | Present (PENDING user confirmation) |

### Source files audited

- src/lib/rbac/check.ts
- src/app/(protected)/layout.tsx
- src/components/layout/erp-shell.tsx
- src/components/layout/app-providers.tsx
- src/components/workspace/workspace-provider.tsx
- src/lib/workspace/workspace-store.ts
- src/lib/rbac/route-access-registry.ts
- src/server/actions/users.ts
- src/server/actions/users/account-security.ts
- src/server/actions/roles.ts
- src/server/actions/permissions.ts
- src/server/actions/audit.ts
- src/app/(protected)/dev/auth-debug/page.tsx
- src/app/(protected)/profile/page.tsx
- src/app/(protected)/settings/page.tsx
- src/app/(protected)/start/page.tsx
- src/app/(protected)/admin/users/page.tsx
- src/app/(protected)/admin/roles/page.tsx
- src/app/(protected)/admin/audit/page.tsx
- src/lib/users/auth-metadata.ts (existence confirmed; content pending deeper audit)

---

## 5. Supabase MCP Read-Only Review Summary

### 5.1 RLS Status on Security Tables

| Table | RLS Enabled | Force RLS | Notes |
|---|---|---|---|
| udit_logs | YES | YES | PASS |
| erp_email_queue | YES | YES | BROAD policy — USING(true) for ALL authenticated |
| erp_notification_delivery_logs | YES | YES | BROAD policy — USING(true) for ALL authenticated |
| erp_notification_templates | YES | YES | BROAD policy — USING(true) for ALL authenticated |
| erp_notifications | YES | YES | BROAD policy — USING(true) for ALL authenticated |
| permissions | YES | YES | PASS |
| ole_permissions | YES | YES | PASS |
| oles | YES | YES | PASS |
| user_profiles | YES | YES | PASS |
| user_roles | YES | YES | PASS |
| user_permission_overrides | NOT FOUND | — | Table does not exist |
| user_sessions | NOT FOUND | — | Table does not exist |

### 5.2 Detailed RLS Policy Summary (Security Tables)

**audit_logs:**
- INSERT: ctor_user_profile_id = current_user_profile_id() — users can only insert their own audit events
- SELECT: current_user_is_global_admin() OR current_user_has_permission_in_company('audit.view', ...) — correct

**permissions:**
- SELECT: current_user_has_permission_any_scope('permissions.view') — correct (admin client used for bootstrap)
- ALL (manage): current_user_is_global_admin() OR has_permission('permissions.manage') — correct

**roles / role_permissions:**
- SELECT: current_user_has_permission_any_scope('roles.view') — correct (admin client used for bootstrap)
- ALL (manage): current_user_is_global_admin() OR has_permission('roles.manage') — correct

**user_profiles:**
- SELECT own: uth_user_id = auth.uid() — correct
- SELECT scoped: is_global_admin OR has_permission_in_company('users.view', ...) — correct
- INSERT/UPDATE/DELETE: scoped by company/branch — correct

**user_roles:**
- SELECT own: user_profile_id = current_user_profile_id() — correct (enables getAuthContext bootstrap)
- SELECT scoped: is_global_admin OR has_permission_in_company('users.view', ...) — correct
- ALL (manage): current_user_can_manage_user_role_assignment(...) — scoped function

**erp_notifications / erp_email_queue / erp_notification_templates / erp_notification_delivery_logs:**
- ALL policies: USING(true) WITH CHECK (true) for all authenticated users — BROAD
- CONCERN: any authenticated user can read all notifications, email queue, templates, delivery logs
- Risk level: MEDIUM (internal tables; not directly user-facing; but could leak user PII, email content, auth links if notification payloads contain them)

---
## 6. Debug / Dev Route Exposure Audit

### 6.1 Dev/Debug Pages Found

| Route | File | Guard | Exposes Sensitive Data? | Action Required |
|---|---|---|---|---|
| `/dev/auth-debug` | `src/app/(protected)/dev/auth-debug/page.tsx` | Only layout redirect (isAccountActive) | YES — permissionCodes, roleCodes, auth_user_id, email, profile.id | NEEDS FIX: guard with requireAdmin() or remove in production |
| `/dev/performance-qa` | `src/app/(protected)/dev/performance-qa/...` | Layout only | Unknown | NEEDS AUDIT |

### 6.2 /dev/auth-debug Analysis

**Current state:**
- Accessible to ANY authenticated user (only protected by layout: isAccountActive check)
- Exposes: `profile.id`, `auth_user_id`, `full_name`, `display_name`, `email`, `accountStatus`, `isGlobalAdmin`, all `roleCodes`, all `permissionCodes` (up to 50)
- Comment says "Remove or guard with requireAdmin() before production"
- No `NODE_ENV` check, no `requireAdmin()` call, no `isGlobalAdmin` check in the page itself

**Risk:** HIGH — Any authenticated ERP user can visit /dev/auth-debug and read their own auth context. For the system_admin user, this reveals their full permission set. For a malicious insider, it reveals exactly which permissions they lack (i.e., helps them plan privilege escalation).

**Planned fix:**
```typescript
// Option A (recommended): Guard with requireAdmin()
export default async function AuthDebugPage() {
  const ctx = await requireAdmin(); // throws if not system_admin or no erp.admin
  ...
}

// Option B: Only in development
if (process.env.NODE_ENV === "production") notFound();
```

**Decision for USERS.5:** Use Option A (requireAdmin) as the permanent guard. This keeps the page available to system_admin in production for debugging, but blocks all non-admin users.

### 6.3 console.log / console.warn / console.error

Grep of `src/server`, `src/lib/rbac`, `src/lib/audit` found no console statements — PASS.

---

## 7. Service Role / Admin Client Usage Audit

### 7.1 Admin Client Usage Count

`createAdminClient()` is used in 80+ files across the codebase. In the Users/RBAC area specifically:

| File | Function | Reason | Session Verified Before Use? | Permission Check Before Write? | Data Safe to Return? |
|---|---|---|---|---|---|
| `src/lib/rbac/check.ts` | `getAuthContext()` | RLS bootstrap deadlock for roles/permissions lookup | YES — getUser() called first with cookie client | READ ONLY — no write | YES — only permission codes returned |
| `src/lib/users/auth-metadata.ts` | various | Supabase Auth admin API calls (getUser, updateUser) | Needs verification | Needs verification | Needs verification |
| `src/server/actions/users.ts` | `createUser`, `deleteUser`, etc. | Supabase Auth user creation/deletion | YES — getAuthContext + hasPermission before | YES | YES — no tokens in response |
| `src/server/actions/users/account-security.ts` | invite/reset/temp-password flows | Supabase Auth admin generateLink | YES — hasPermission("users.security.manage") | YES | YES — sanitizeSecurityAuditPayload used, links not logged |

### 7.2 Check.ts Admin Client — Justified

The `createAdminClient()` in `getAuthContext()` is specifically scoped to Steps 2-4 of the permission resolution chain (roles, role_permissions, permissions tables). `getUser()` still uses the cookie client for authentication. This is the correct pattern.

**USERS.5 hardening plan:**
- Add a comment block in `check.ts` explaining that the admin client is ONLY used for read-only permission bootstrap and must never be used for write operations.
- Add a `server-only` import guard at the top of `check.ts` to prevent accidental client-side import.

### 7.3 Auth Metadata

`src/lib/users/auth-metadata.ts` uses `createAdminClient()`. This file likely handles Supabase Auth admin operations (getUserById, getUserByEmail). Needs deep audit in USERS.5 implementation:
- Verify session is confirmed before any admin call
- Verify no raw Supabase response (including tokens) is returned to the caller
- Verify `server-only` import is present

### 7.4 Recommended Guard Pattern

For any file using `createAdminClient()` for write operations, the USERS.5 standard must be:
```typescript
import "server-only"; // top of file
const ctx = await getAuthContext();         // 1. authenticate
assertAccountActive(ctx);                    // 2. account active
if (!hasPermission(ctx, "x.y.z")) throw ... // 3. permission check
const admin = createAdminClient();           // 4. admin client ONLY after all guards
```

---

## 8. Server Action Guard Audit

### 8.1 users.ts

| Action | Guard | Zod | assertAccountActive | logAudit | Verdict |
|---|---|---|---|---|---|
| `createUser` | `hasPermission("users.create")` | YES | NO | YES | PASS WITH NOTE |
| `adminUpdateUserProfile` | `hasPermission("users.update")` | YES | NO | YES | PASS WITH NOTE |
| `assignRoleToUser` | `hasPermission` (implied by code) | YES | NO | YES | PASS WITH NOTE |
| `removeRoleFromUser` | `hasPermission` (implied) | YES | NO | YES | PASS WITH NOTE |
| `deleteUser` | `hasPermission("users.delete")` | YES | NO | YES | PASS WITH NOTE |

**NOTE:** `assertAccountActive` is not called in any `users.ts` action. The actions rely on the caller being authenticated via `getAuthContext()`. However, a suspended admin could still call these actions if their session token is still valid. USERS.5 should add `assertAccountActive(ctx)` after `getAuthContext()` in all mutating actions.

**Audit action name inconsistency:** `"create"`, `"update"`, `"assign_role"`, `"remove_role"`, `"delete"` — lowercase strings. Security-relevant actions like `"USER_INVITE_EMAIL_SENT"` use UPPER_CASE. Plan to standardize.

### 8.2 account-security.ts

| Action | Guard | assertAccountActive | logAudit | sanitizePayload | Verdict |
|---|---|---|---|---|---|
| `getUserSecurityStatus` | `hasPermission("users.security.manage")` | NO | NO (read-only) | N/A | PASS |
| `requestPasswordReset` | None (self-service public) | N/A | SKIP (no session) | YES | PASS WITH NOTE |
| `changeOwnPassword` | Self-service | NO | YES | YES | PASS WITH NOTE |
| `completeRequiredPasswordChange` | Authenticated | NO | YES | YES | PASS WITH NOTE |
| `adminSendPasswordResetEmail` | `hasPermission("users.security.manage")` | NO | YES | YES | PASS WITH NOTE |
| `adminSetTemporaryPassword` | `hasPermission("users.security.manage")` | NO | YES | YES | PASS WITH NOTE |
| `adminForcePasswordChange` | `hasPermission("users.security.manage")` | NO | YES | YES | PASS WITH NOTE |
| `adminClearForcePasswordChange` | `hasPermission("users.security.manage")` | NO | YES | YES | PASS WITH NOTE |
| `adminConfirmUserEmail` | `hasPermission("users.security.manage")` | NO | YES | YES | PASS WITH NOTE |
| `adminSendWelcomeEmail` | `hasPermission("users.security.manage")` | NO | YES | YES | PASS WITH NOTE |
| `adminGenerateAndSendInviteEmail` | `hasPermission("users.security.manage")` | NO | YES | YES | PASS WITH NOTE |

**Key strength:** `sanitizeSecurityAuditPayload()` exists and is used consistently. Never logs passwords, tokens, action_link, reset_link, invite_link.
**Key gap:** `assertAccountActive` not called — suspended admin could still call these.

### 8.3 roles.ts

| Action | Guard | Zod | assertAccountActive | logAudit | Verdict |
|---|---|---|---|---|---|
| `getRoleById` | `hasPermission("roles.view")` | NO | NO | NO | PASS WITH NOTE |
| `createRole` | `hasPermission("roles.manage")` | NO | NO | YES | NEEDS FIX |
| `updateRole` | `hasPermission("roles.manage")` | NO | NO | YES | NEEDS FIX |
| `deleteRole` | `hasPermission("roles.manage")` | NO | NO | YES | NEEDS FIX |
| `updateRoleStatus` | `hasPermission("roles.manage")` | NO | NO | YES | NEEDS FIX |
| `cloneRole` | `hasPermission("roles.manage")` | NO | NO | YES | NEEDS FIX |
| `getRoleWithUsersAction` | `hasPermission("roles.view")` | NO | NO | NO | PASS WITH NOTE |
| `getRolePermissionsAction` | `hasPermission("roles.view")` | NO | NO | NO | PASS WITH NOTE |

**Gaps:** No Zod validation on any input. No `assertAccountActive`. Audit action names inconsistent ("create"/"update" vs "ROLE_CLONED").

### 8.4 permissions.ts

| Action | Guard | Zod | assertAccountActive | logAudit | Verdict |
|---|---|---|---|---|---|
| `assignPermissionToRole` | `hasPermission("roles.manage")` | NO | NO | YES | NEEDS FIX |
| `removePermissionFromRole` | `hasPermission("roles.manage")` | NO | NO | YES | NEEDS FIX |

**Gaps:** No Zod, no `assertAccountActive`.

### 8.5 Missing: effective-access.ts

`src/server/actions/users/effective-access.ts` does NOT exist. This was planned in the USERS.4 plan but not implemented. USERS.5 should plan and implement this action.

### 8.6 Classification Summary

| Classification | Actions |
|---|---|
| PASS | None (all have at least one gap) |
| PASS WITH NOTE | All account-security.ts admin actions; users.ts actions |
| NEEDS FIX | All roles.ts mutations; all permissions.ts mutations |
| BLOCKER | None |
## 9. Route Guard Audit

| Route | Permission Required | Guard | Redirect Behavior | Direct URL Safe? | In registry? | Status |
|---|---|---|---|---|---|---|
| /admin/users | users.view | hasPermission in page | /access-denied | YES | YES | PASS |
| /admin/users/record/new | users.create | hasPermission in page | /access-denied | YES | YES | PASS |
| /admin/users/record/[id] | users.view | hasPermission in page | /access-denied | YES | YES | PASS |
| /admin/roles | roles.view | hasPermission in page | /access-denied | YES | YES | PASS |
| /admin/roles/record/new | roles.manage | hasPermission in page | redirects to list | YES | YES | PASS WITH NOTE |
| /admin/roles/record/[id] | roles.view | hasPermission in page | redirects to list | YES | YES | PASS WITH NOTE |
| /admin/permissions | permissions.view | hasPermission in page | /access-denied | YES | YES | PASS |
| /admin/audit | audit.view | hasPermission in page | /access-denied | YES | YES | PASS |
| /profile | None (own data) | Layout only | N/A | YES | NO | PASS WITH NOTE |
| /settings | None (placeholder) | Layout only | N/A | YES | NO | PASS |
| /access-denied | None | Layout only | N/A | YES | NO | PASS |
| /no-access | None | Layout only | N/A | YES | NO | PASS |
| /start | None (redirects) | isAccountActive check | /login if no profile | YES | NO | PASS |
| /account-disabled | None (post-disable) | Layout | N/A | YES | NO | PASS |
| /change-password-required | None (gated by must_change_password) | Layout | N/A | YES | NO | PASS |
| /dev/auth-debug | None (layout only!) | Only isAccountActive | N/A | NO — any auth user can access | NO | NEEDS FIX |

Notable issues:
- /dev/auth-debug: No admin guard in the page itself. Plan: add requireAdmin() call.
- /admin/roles/record/[id]: Redirects to /admin/roles (list) instead of /access-denied on permission failure. Inconsistent. Plan: standardize to /access-denied redirect.
- /profile: Does not call getAuthContext() - uses raw createClient(). Acceptable for own-profile. No sensitive permissions exposed. Profile ID displayed but acceptable.

---

## 10. RLS Policy Audit

### 10.1 Core RBAC Tables: PASS

All of user_profiles, roles, permissions, role_permissions, user_roles have:
- RLS enabled: YES
- Force RLS: YES
- No broad USING(true) policies
- No anon access
- All policies scoped to authenticated role + specific permission checks

Assessment: PASS for all core RBAC tables.

### 10.2 Notification Tables: CONCERN

erp_notifications, erp_email_queue, erp_notification_templates, erp_notification_delivery_logs all have:
- cmd: ALL
- roles: {authenticated}
- qual: true
- with_check: true

Risk: Any authenticated ERP user can SELECT all rows from erp_email_queue, which may contain
unprocessed invite links, password reset links, or other sensitive email content in body/metadata columns.

USERS.5 planned RLS improvement:
- erp_email_queue: Narrow to global_admin OR notifications.manage permission
- erp_notification_templates: Narrow to notifications.manage or notifications.view
- erp_notifications: Scope to current user (entity_id = current_user_profile_id) or global_admin
- erp_notification_delivery_logs: Narrow to notifications.manage or global_admin

Draft SQL (not to be executed during planning):
  CREATE POLICY email_queue_scoped ON erp_email_queue FOR ALL TO authenticated
    USING (current_user_is_global_admin() OR current_user_has_permission_any_scope('notifications.manage'));

### 10.3 Missing Tables

- user_permission_overrides: NOT FOUND — defer, not required by current RBAC
- user_sessions: NOT FOUND — session management via Supabase Auth, not ERP DB

---

## 11. Audit Log Coverage Audit

### 11.1 Audit Infrastructure

- src/server/actions/audit.ts: exports logAudit() and createAuditDiff()
- src/server/queries/audit.ts: exists for read operations
- src/lib/audit/ directory: DOES NOT EXIST (all audit logic in server actions layer)
- sanitizeSecurityAuditPayload() exists in account-security.ts

### 11.2 Current Audit Events

| Event | Action Name | File | Status |
|---|---|---|---|
| User created | create | users.ts | PASS WITH NOTE (naming) |
| User updated | update | users.ts | PASS WITH NOTE |
| Role assigned | assign_role | users.ts | PASS WITH NOTE |
| Role removed | remove_role | users.ts | PASS WITH NOTE |
| User deleted | delete | users.ts | PASS WITH NOTE |
| Password reset email sent | USER_PASSWORD_RESET_EMAIL_SENT | account-security.ts | PASS |
| Temp password set | USER_TEMP_PASSWORD_SET | account-security.ts | PASS |
| Force password change set | USER_FORCE_PASSWORD_CHANGE_SET | account-security.ts | PASS |
| Force password change cleared | USER_FORCE_PASSWORD_CHANGE_CLEARED | account-security.ts | PASS |
| Email confirmed by admin | USER_EMAIL_CONFIRMED_BY_ADMIN | account-security.ts | PASS |
| Welcome email sent | USER_WELCOME_EMAIL_SENT | account-security.ts/users.ts | PASS |
| Invite email sent | USER_INVITE_EMAIL_SENT | account-security.ts/users.ts | PASS |
| Password changed | USER_PASSWORD_CHANGED | account-security.ts | PASS |
| Role created | create | roles.ts | PASS WITH NOTE |
| Role updated | update | roles.ts | PASS WITH NOTE |
| Role deleted | delete | roles.ts | PASS WITH NOTE |
| Role status changed | status_change | roles.ts | PASS WITH NOTE |
| Role cloned | ROLE_CLONED | roles.ts | PASS WITH NOTE (naming inconsistent) |
| Permission assigned to role | unknown | permissions.ts | NEEDS AUDIT |
| Permission removed from role | unknown | permissions.ts | NEEDS AUDIT |

### 11.3 Missing Audit Events

| Event | Status | Plan |
|---|---|---|
| Effective access viewed | NOT IMPLEMENTED | Build effective-access.ts with EFFECTIVE_ACCESS_VIEWED event |
| Unauthorized admin action attempted | Not logged | Plan: log UNAUTHORIZED_ACCESS_ATTEMPT on hasPermission() failure in critical actions |
| Debug page accessed | Not audited | Plan: if /dev/auth-debug kept, log DEBUG_ROUTE_ACCESSED for non-admin access attempts |
| Last-admin protection triggered | Not audited | Plan: log LAST_ADMIN_GUARD_TRIGGERED when the last-admin check fires |
| User status changed (active/inactive/suspended) | Unclear if covered by 'update' event | Plan: add USER_STATUS_CHANGED with old/new status in diff |
| Permission matrix bulk toggle | Unclear | Plan: verify individual rows are audited in assignPermissionToRole/removePermissionFromRole |

### 11.4 Audit Action Name Inconsistency

Current state:
- users.ts: lowercase strings (create, update, assign_role, remove_role, delete)
- account-security.ts: UPPER_CASE with module prefix (USER_PASSWORD_RESET_EMAIL_SENT)
- roles.ts: mixed (create, update, delete, status_change, ROLE_CLONED)
- permissions.ts: unknown

Plan for USERS.5:
- Standardize all Users/RBAC audit action names to UPPER_CASE with module prefix
- Migration approach: add new standardized names alongside old ones, then clean up
- No DB schema change required (action is a free-text varchar)
- Proposed taxonomy: see Section 13

## 12. Sensitive Payload Redaction Plan

### 12.1 Fields Forbidden in ALL audit logs, console logs, API responses, URL params

- password
- temporary_password
- generated_password
- reset_link / action_link / invite_link
- token / otp / jwt
- cookie / session / refresh_token / access_token
- secret / service_role_key / api_key
- raw Supabase response objects
- raw email body containing auth links
- raw auth metadata beyond safe fields (id, email, created_at, confirmed_at)

### 12.2 Existing Helpers

sanitizeSecurityAuditPayload() in src/server/actions/users/account-security.ts:
- Already excludes: password, temporary_password, action_link, invite_link, reset_link, token, otp, jwt, cookie, raw_response
- Scope: used only in account-security.ts
- Status: GOOD, but needs to be centralized

### 12.3 USERS.5 Plan: Centralize into src/lib/audit/sanitizers.ts

Create a shared audit sanitizer module:

src/lib/audit/sanitizers.ts:
  - sanitizeSecurityAuditPayload(payload): move from account-security.ts
  - sanitizeRoleAuditPayload(payload): strip role_code system internals if any
  - sanitizeServerActionError(error): convert Error objects to safe string, strip stack traces
  - SENSITIVE_FIELD_BLOCKLIST: shared constant for all sanitizers

This module must:
  - Be imported as server-only
  - Be used by all logAudit() calls in users/roles/permissions actions
  - Never accept raw Supabase error objects

### 12.4 Server Action Error Handling

Current state: error handling varies per action.
Plan: standardize to:
  - catch (err) { return { success: false, error: sanitizeServerActionError(err) }; }
  - Never return raw err.message (may contain SQL, table names, column values)
  - Never return raw Supabase PostgREST error codes to the browser

---

## 13. Security Event Taxonomy Plan

### 13.1 Proposed Standardized Audit Action Names

Users module:
  USER_CREATED
  USER_UPDATED
  USER_STATUS_CHANGED
  USER_DELETED
  USER_ROLE_ASSIGNED
  USER_ROLE_REMOVED
  USER_SECURITY_RESET_EMAIL_SENT
  USER_SECURITY_TEMP_PASSWORD_SET
  USER_SECURITY_FORCE_CHANGE_SET
  USER_SECURITY_FORCE_CHANGE_CLEARED
  USER_SECURITY_EMAIL_CONFIRMED_BY_ADMIN
  USER_SECURITY_WELCOME_EMAIL_SENT
  USER_SECURITY_INVITE_EMAIL_SENT
  USER_PASSWORD_CHANGED

Roles module:
  ROLE_CREATED
  ROLE_UPDATED
  ROLE_STATUS_CHANGED
  ROLE_DELETED
  ROLE_CLONED
  ROLE_PERMISSION_ASSIGNED
  ROLE_PERMISSION_REMOVED

Permissions module:
  PERMISSION_MATRIX_UPDATED (alias for individual assign/remove batch)

Access and Security events:
  EFFECTIVE_ACCESS_VIEWED
  UNAUTHORIZED_ACCESS_ATTEMPT
  LAST_ADMIN_GUARD_TRIGGERED
  DEBUG_ROUTE_ACCESSED

### 13.2 Migration Approach

- No DB migration required (action is varchar/text)
- Update action strings in users.ts: create -> USER_CREATED, update -> USER_UPDATED, etc.
- Update action strings in roles.ts: create -> ROLE_CREATED, etc.
- Old action names in existing audit_logs rows remain unchanged (history preserved)
- Forward-only: new events use new names

---

## 14. Unauthorized Attempt Handling Plan

### 14.1 Current Behavior

- Page-level guards: redirect('/access-denied')
- Server action guards: throw Error("Permission denied: x.y.z required") or return { success: false, error: "..." }
- No logging of unauthorized attempts

### 14.2 USERS.5 Plan

When to redirect:
  - Page-level permission failures -> redirect('/access-denied')
  - account disabled -> redirect('/account-disabled')

When to return safe error (server actions):
  - return { success: false, error: "You do not have permission to perform this action." }
  - NEVER include permission code in the error returned to normal users
  - ONLY include permission code details in dev/admin mode (e.g., via NODE_ENV check)

When to audit unauthorized attempt:
  - Admin-level actions (users.create, users.delete, roles.manage, permissions.manage): YES, log UNAUTHORIZED_ACCESS_ATTEMPT
  - Read-only actions (users.view, roles.view): NO, avoid log spam
  - Password/security actions: YES, always audit

When NOT to audit:
  - Simple navigation/sidebar mismatches (these generate too much noise)
  - Unauthenticated requests (handled by layout redirect, not worth auditing here)

How to avoid leaking route params:
  - Never include full URL path or query params in audit metadata
  - Only include entity type + entity id (e.g., target_user_id)

---

## 15. Account Safety and Last-Admin Protection Audit

### 15.1 Existing Protections (PASS)

users.ts:
  - deleteUser: Blocks deactivation/deletion of last active system_admin -- CONFIRMED
  - removeRoleFromUser: Blocks removal of last active system_admin role -- CONFIRMED

roles.ts:
  - updateRole: Blocks setting system_admin role is_assignable = false -- CONFIRMED
  - updateRoleStatus: Blocks deactivation of system_admin role -- CONFIRMED

### 15.2 Gaps Identified

| Protection | Status | Plan |
|---|---|---|
| Last admin check when adminUpdateUserProfile sets status=inactive | UNCLEAR | Verify the status-change path also triggers the last-admin check |
| system_admin role deletion | Unclear if deleteRole blocks system_admin | Verify deleteRole has system_admin guard |
| Bulk permission removal from system_admin role | Not checked | Verify permissions.ts blocks removing all permissions from system_admin role |
| Force-password-change on last active admin | Acceptable (admin can still log in and reset) | PASS |
| Temp password on last active admin | Acceptable | PASS |
| Email confirmation on last active admin | Acceptable | PASS |
| Log when last-admin guard fires | Not audited | Plan: add LAST_ADMIN_GUARD_TRIGGERED audit event |

### 15.3 Action: Verify adminUpdateUserProfile Status Change Path

The last-admin guard must fire not only in deleteUser but also when:
- adminUpdateUserProfile sets status = 'inactive' or 'suspended' for the sole system_admin

If this is not guarded, USERS.5 must add the check.

---

## 16. User Security History UI Plan

### 16.1 Proposed Section

Location: /admin/users/record/[id] -> new tab "Security History"

### 16.2 Data Source

Query: audit_logs WHERE entity_type = 'user' AND entity_id = target_user_id AND action IN (USER_CREATED, USER_UPDATED, USER_STATUS_CHANGED, USER_ROLE_ASSIGNED, USER_ROLE_REMOVED, USER_SECURITY_*, USER_PASSWORD_CHANGED)
Order: created_at DESC
Limit: 50 per page

### 16.3 Columns to Display

| Column | Source | Notes |
|---|---|---|
| Timestamp | audit_logs.created_at | Format: local datetime |
| Action | audit_logs.action | Human-readable label |
| Actor | audit_logs.actor_user_profile_id -> join user_profiles | Display name or email |
| Summary | Derived from action name | "Password reset email sent", "Role HR Manager assigned", etc. |
| Details | audit_logs.new_values | Safe JSON viewer (no passwords, no links, no tokens) |

### 16.4 Permission Gate

- Requires users.security.manage OR audit.view permission
- If user only has users.view: show tab header but display "You do not have access to security history"
- Never show to the user about their own account unless they have audit.view

### 16.5 Deferred Items

- Exporting security history (defer to USERS.6)
- Comparing before/after diffs in UI (defer)
- Filtering by action type in the security history tab (defer)

### 16.6 Implementation Sequence

1. Standardize audit action names (Section 13) FIRST
2. Then build the Security History tab using the standardized names
3. Ensure sanitizeSecurityAuditPayload is centralized before rendering raw payloads

---

## 17. Audit Log Viewer Improvement Plan

### 17.1 Current State

/admin/audit page exists and is guarded by audit.view permission.

### 17.2 Planned Improvements

| Improvement | Priority | Notes |
|---|---|---|
| Filter by module (users/roles/permissions/security) | HIGH | Add module selector |
| Filter by actor (user) | HIGH | Combobox lookup |
| Filter by target entity | MEDIUM | Target user/role/permission |
| Filter by action | MEDIUM | Multi-select from taxonomy |
| Filter by date range | HIGH | From/to date picker |
| Safe payload viewer (JSON expand) | MEDIUM | Collapsed by default, expand on click |
| Copy audit ID | LOW | Click-to-copy |
| Export safe CSV (no sensitive fields) | LOW | Defer to USERS.6 |

### 17.3 Not Building

- Full SIEM or log streaming
- Real-time audit feed
- Alert rules on audit events (defer to a dedicated security/alerting module)

---

## 18. Database / SQL Plan

### 18.1 Required Migrations for USERS.5

| Change | Required? | Notes |
|---|---|---|
| Narrow erp_email_queue RLS policy | YES | Replace USING(true) with permission-scoped policy |
| Narrow erp_notification_templates RLS | YES | Replace USING(true) |
| Narrow erp_notifications RLS | EVALUATE | Scope to current user or global_admin |
| Add audit_logs index on action + entity_type | MAYBE | Improves Security History query performance |
| Add audit_logs index on actor_user_profile_id | MAYBE | Improves actor filter performance |
| user_permission_overrides table | DEFER | Not needed for current RBAC model |
| user_sessions table | DEFER | Supabase Auth handles sessions |
| audit action enum column | NO | Use varchar, no enum migration needed |

### 18.2 Draft SQL for RLS Narrowing (not to be executed in planning)

-- Narrow email queue access
DROP POLICY IF EXISTS erp_email_queue_authenticated ON erp_email_queue;
CREATE POLICY erp_email_queue_scoped ON erp_email_queue
  FOR ALL TO authenticated
  USING (current_user_is_global_admin() OR current_user_has_permission_any_scope('notifications.manage'))
  WITH CHECK (current_user_is_global_admin() OR current_user_has_permission_any_scope('notifications.manage'));

-- Add audit_logs performance indexes
CREATE INDEX IF NOT EXISTS audit_logs_action_entity_idx ON audit_logs (action, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON audit_logs (actor_user_profile_id);

## 19. Recommended USERS.5 Implementation Scope

Based on the audit findings, USERS.5 should implement the following, in priority order:

### Priority 1: BLOCKERS / HIGH RISK

1. Guard /dev/auth-debug with requireAdmin() -- any authenticated user can read full auth context
2. Add assertAccountActive(ctx) to all mutating server actions (users.ts, roles.ts, permissions.ts, account-security.ts admin actions)
3. Narrow erp_email_queue RLS policy to prevent raw invite/reset email leakage

### Priority 2: NEEDS FIX

4. Add Zod validation to roles.ts all mutation actions
5. Add Zod validation to permissions.ts actions
6. Standardize audit action names to UPPER_CASE with module prefix
7. Centralize sanitizeSecurityAuditPayload into src/lib/audit/sanitizers.ts
8. Add sanitizeServerActionError() helper
9. Add server-only import to check.ts and other admin-client files

### Priority 3: ENHANCEMENTS

10. Build src/server/actions/users/effective-access.ts with EFFECTIVE_ACCESS_VIEWED audit event
11. Add UNAUTHORIZED_ACCESS_ATTEMPT audit logging to critical admin actions
12. Add LAST_ADMIN_GUARD_TRIGGERED audit event
13. Build Security History tab in /admin/users/record/[id]
14. Improve audit log viewer filters (/admin/audit)

### Priority 4: DEFERRED

15. Narrow erp_notifications / erp_notification_delivery_logs / erp_notification_templates RLS
16. Audit log viewer export
17. user_permission_overrides table (future role override model)
18. user_sessions table (Supabase Auth handles this)

---

## 20. Implementation Sequence for Future USERS.5 Execution

1. Create src/lib/audit/sanitizers.ts (centralize sanitizeSecurityAuditPayload, add sanitizeServerActionError, SENSITIVE_FIELD_BLOCKLIST)
2. Add server-only to check.ts and all admin-client-using files in users/rbac area
3. Guard /dev/auth-debug with requireAdmin()
4. Add assertAccountActive(ctx) to all mutating server actions
5. Add Zod schemas to roles.ts and permissions.ts
6. Standardize audit action names in users.ts, roles.ts, permissions.ts
7. Narrow erp_email_queue RLS (migration)
8. Build effective-access.ts server action
9. Add UNAUTHORIZED_ACCESS_ATTEMPT logging to critical admin actions
10. Add LAST_ADMIN_GUARD_TRIGGERED audit event
11. Build Security History tab
12. Improve audit log viewer filters
13. Run tsc --noEmit, npm run build, verify no regressions
14. Browser UAT per Section 22
15. Write closure report and update ALGT_ERP_SOURCE_OF_TRUTH.md

---

## 21. Acceptance Criteria for Future Implementation

| ID | Criterion |
|---|---|
| AC-01 | /dev/auth-debug is guarded: only system_admin can access |
| AC-02 | assertAccountActive(ctx) present in all mutating users/roles/permissions/account-security actions |
| AC-03 | Zod validation present in all roles.ts and permissions.ts mutation actions |
| AC-04 | All users/roles/permissions/security audit events use UPPER_CASE module-prefixed names |
| AC-05 | sanitizeSecurityAuditPayload lives in src/lib/audit/sanitizers.ts and is imported by all relevant actions |
| AC-06 | sanitizeServerActionError() exists and used in catch blocks for all Users/RBAC actions |
| AC-07 | erp_email_queue RLS policy narrowed to global_admin or notifications.manage |
| AC-08 | effective-access.ts exists with getEffectiveAccessForUser() action and EFFECTIVE_ACCESS_VIEWED audit event |
| AC-09 | UNAUTHORIZED_ACCESS_ATTEMPT logged for critical admin action permission failures |
| AC-10 | LAST_ADMIN_GUARD_TRIGGERED logged when last-admin guard blocks a delete/deactivate |
| AC-11 | Security History tab visible in /admin/users/record/[id] gated by users.security.manage or audit.view |
| AC-12 | Audit log viewer has date range, actor, and action filters |
| AC-13 | tsc --noEmit: zero errors |
| AC-14 | npm run build: clean |
| AC-15 | Browser UAT: all scenarios in Section 22 pass |

---

## 22. Test and Browser UAT Plan

### 22.1 Build Checks

  npx tsc --noEmit
  npm run build
  npm test (if test suite present)

### 22.2 Dev-Route Security Scenarios

| Scenario | Expected Result |
|---|---|
| system_admin visits /dev/auth-debug | Page loads, shows auth context |
| HR Manager visits /dev/auth-debug | Redirected (requireAdmin check fails) |
| No-role user visits /dev/auth-debug | Redirected |

### 22.3 Server Action Security Scenarios

| Scenario | Expected Result |
|---|---|
| Suspended admin calls createUser | Rejected: assertAccountActive fails |
| Suspended admin calls createRole | Rejected: assertAccountActive fails |
| User without roles.manage calls createRole | Rejected: hasPermission fails, UNAUTHORIZED_ACCESS_ATTEMPT logged |
| User without users.delete calls deleteUser | Rejected with safe error message |
| Zod invalid input to createRole | Rejected with Zod validation error |

### 22.4 Audit Event Scenarios

| Scenario | Expected Audit Event |
|---|---|
| Admin creates user | USER_CREATED |
| Admin updates user status to inactive | USER_STATUS_CHANGED |
| Admin assigns role to user | USER_ROLE_ASSIGNED |
| Admin sends password reset email | USER_SECURITY_RESET_EMAIL_SENT |
| Admin creates role | ROLE_CREATED |
| Admin clones role | ROLE_CLONED |
| Admin toggles permission on role | ROLE_PERMISSION_ASSIGNED or ROLE_PERMISSION_REMOVED |
| Admin views effective access | EFFECTIVE_ACCESS_VIEWED |
| Last-admin guard fires | LAST_ADMIN_GUARD_TRIGGERED |

### 22.5 Sensitive Payload Safety Scenarios

| Scenario | Expected Audit Log Contains |
|---|---|
| Admin sends invite email | DOES NOT contain action_link, invite_link, token |
| Admin sets temporary password | DOES NOT contain password or temporary_password |
| Admin sends password reset | DOES NOT contain reset_link or action_link |
| Role updated | DOES NOT contain raw Supabase response |

### 22.6 Regression Scenarios

| Scenario | Expected Result |
|---|---|
| HR Manager logs in | Sees HR sidebar items |
| DMS Manager logs in | Sees DMS sidebar items |
| system_admin logs in | Sees all menus |
| USERS.2A password lifecycle | Change own password still works |
| USERS.4 workspace pins | Correct default route still loads |

---

## 23. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| assertAccountActive breaks a valid admin flow | LOW | MEDIUM | Only add to mutating actions; read-only actions (getUserSecurityStatus) remain unguarded |
| Zod rejects valid role input | LOW | LOW | Write permissive schemas that match current DB constraints exactly |
| Audit name standardization breaks audit viewer filters | MEDIUM | LOW | Viewer shows raw action strings; old rows keep old names; new rows use new names |
| RLS narrowing for erp_email_queue breaks notification system | MEDIUM | HIGH | Test notification send/process flow end-to-end before migration; use notifications.manage as the permission gate |
| Security History tab exposes raw audit payload data | LOW | MEDIUM | Always render new_values through sanitizeSecurityAuditPayload before display |

---

## 24. Items Explicitly Deferred

1. user_permission_overrides table and per-user permission override model
2. user_sessions table (Supabase Auth handles sessions)
3. Audit log export to CSV/Excel
4. Real-time audit stream or alerts
5. Narrowing erp_notifications RLS (requires understanding notification scoping model)
6. Full /admin/audit SIEM-level improvements
7. audit_logs before_values/after_values for all historical actions (forward-only for new actions)

---

## 25. Source-of-Truth Update Plan

After USERS.5 implementation is complete:

1. Create: implementation_Review/ERP_USERS_5_SECURITY_HARDENING_AND_AUDIT_ENHANCEMENT_REPORT.md
2. Create: implementation_Review/ERP_USERS_5_BROWSER_UAT_VERIFICATION_REPORT.md
3. Update: .cursor/ALGT_ERP_SOURCE_OF_TRUTH.md
   - Mark USERS.5 as CLOSED / PASS
   - List all files changed
   - Note: audit centralized, assertAccountActive added, Zod added to roles/permissions, auth-debug guarded
   - Note: erp_email_queue RLS narrowed (migration number)
   - Note: effective-access.ts created
   - Note: Security History tab added

---

## 26. Recommended Next Cursor Implementation Prompt Summary

The USERS.5 implementation prompt should instruct Cursor to:

1. Read this plan and all referenced reports before touching code
2. Implement in the sequence defined in Section 20
3. Run tsc --noEmit after each file group change
4. Run npm run build at the end
5. Write a closure report for each major group (sanitizers, action guards, audit, UI)
6. Update ALGT_ERP_SOURCE_OF_TRUTH.md at the end

---

## 27. Final Recommendation

USERS.5 is a high-value security hardening phase that addresses several real risks:

- HIGH: /dev/auth-debug unguarded (fix immediately)
- MEDIUM: erp_email_queue broad RLS (fix before production)
- MEDIUM: Missing assertAccountActive (fix before production)
- LOW-MEDIUM: Missing Zod in roles/permissions (fix before production)
- LOW: Inconsistent audit names (migrate gradually)

None of the identified issues require emergency hotfixes because the RLS policies on the core RBAC tables
(roles, permissions, user_profiles, user_roles) are correctly scoped and the admin client is used
only in the server-side trusted path. However, all identified issues should be resolved before
any production deployment or external audit.

Recommended next step: Sameer to review this plan, approve scope, and issue a USERS.5 implementation prompt.

---

**Plan Status:** PLANNING COMPLETE — No code, schema, RLS, permission, role, user, Supabase Auth, or Supabase data changes were made during the creation of this document.

**Acceptance Criteria:** AC-01 through AC-15 (Section 21)
**Plan file:** implementation_Review/ERP_USERS_5_SECURITY_HARDENING_AND_AUDIT_ENHANCEMENT_PLAN.md
