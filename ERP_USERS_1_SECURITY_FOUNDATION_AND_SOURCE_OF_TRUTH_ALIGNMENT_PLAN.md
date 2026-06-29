# ERP Users Module — USERS.1 Security Foundation and Source-of-Truth Alignment Plan

**Date:** 2026-06-27  
**Phase:** USERS.1 — Security Foundation and Source-of-Truth Alignment  
**Type:** Planning-only (no implementation in this phase)  
**Project:** ALGT ERP — `c:\dev\agt-erp`  
**Prepared by:** Cursor AI (Senior ERP Security Architect / Supabase RLS Engineer)

---

## 1. Executive Summary

USERS.1 addresses **security foundation gaps** identified in the USERS.0 deep audit. The Users module CRUD foundation is already implemented; this phase does **not** rebuild Users — it closes critical auth/RBAC/RLS holes before USERS.2 UX work.

**Verified critical issues (code + live Supabase, read-only):**

| # | Issue | Severity | USERS.1 action |
|---|--------|----------|----------------|
| 1 | `user_profiles.status` (`inactive` / `suspended`) is never enforced after Supabase Auth login | **CRITICAL** | Central active-account guard + protected layout redirect |
| 2 | FORCE RLS is **off** on all 8 Users-module security tables | **HIGH** | Draft migration to enable FORCE RLS |
| 3 | Public `/signup` remains fully functional (client-side `signUp`) | **HIGH** | Env-gated disable by default |
| 4 | Code uses `users.manage`, `roles.edit`, `system.admin` — **none exist in live `permissions` catalog** | **HIGH** | Align code to catalog (`roles.manage`, `erp.admin`, granular user manage helper) |
| 5 | `audit_logs_insert` RLS requires `audit.view` to insert — breaks audit for users without audit permission | **HIGH** | Fix insert policy (actor-self insert) |
| 6 | `listUsers()` has no explicit permission guard (relies on page + RLS only) | **MEDIUM** | Add `users.view` guard in query |
| 7 | No last-admin protection (only **1** active `system_admin` assignment in live DB) | **HIGH** | Minimal guard in USERS.1; full coverage in USERS.2 |
| 8 | Source-of-truth still references `users.manage` and understates implemented Users CRUD | **MEDIUM** | Planned SOT update text (post-implementation) |

**Recommended USERS.1 approach:** Defense-in-depth with **minimal scope** — central status enforcement in RBAC layer, FORCE RLS migration, signup env gate, permission string fixes, audit insert policy fix, query-level guards. **No new tables.** **No HR employee linking.** **No unrelated module changes.**

**Estimated implementation touch:** ~12–18 files + 1 migration (~80–120 lines SQL).

---

## 2. Planning Scope and Non-Implementation Rule

### In scope (planning only now; implementation after Sameer approval)
- Inactive/suspended user blocking design
- FORCE RLS migration design
- Public signup gate design
- Permission code alignment (`roles.edit`, `system.admin`, `users.manage`)
- Audit log insert reliability
- Explicit `listUsers()` permission guard
- Last-admin protection placement decision
- Source-of-truth alignment text (draft — apply after implementation)
- Draft SQL, file-by-file plan, tests, UAT, rollback, acceptance criteria

### Out of scope (explicit)
- USERS.2+ UX (pagination, email column, remove-role UI, notes field, badges)
- USERS.4 permission module_code normalization (255 permissions; mixed casing confirmed live)
- `user_code` auto-numbering
- HR employee FK / create-user-from-employee workflow
- AI phases, DMS, Party, HR write-back, or any unrelated module
- Supabase Auth ban sync (`banned_until`) — defer to USERS.5
- New database tables

### Non-implementation rule (this Cursor run)
**No** source code, UI, migrations, schema, RLS, policies, data, or source-of-truth edits were made. Supabase MCP used **read-only SELECT** only.

---

## 3. Planning-First Rule for All Future Phases

All Users module phases and future ERP phases must follow:

```text
Step 1: Planning / audit / SQL review file only.
Step 2: Implementation only after Sameer uploads the plan to ChatGPT and approves it.
```

After USERS.1 implementation completes:
1. Create `implementation_Review/ERP_USERS_1_SECURITY_FOUNDATION_IMPLEMENTATION_REPORT.md`
2. Update `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` with closure status
3. Do not start USERS.2 without a separate approved planning/implementation prompt

---

## 4. Files, Rules, Prompts, and Source-of-Truth Reviewed

### Governance / rules
| File | Relevance |
|------|-----------|
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | Stale Users assumptions (`users.manage` in module table); lists Users as LIVE |
| `.cursor/rules/algt-erp-source-of-truth.mdc` | Planning-first, live code overrides stale docs |
| `.cursor/rules/erp-workspace-save-close-standard.mdc` | Not in USERS.1 scope |
| `.cursor/rules/erp-party-master-standard.mdc` | Org scoping context only |
| `.cursor/rules/erp-child-dialog-form-standard.mdc` | Not in USERS.1 scope |

### Prior Users artifacts
| File | Notes |
|------|-------|
| `ERP_USERS_MODULE_DEEP_AUDIT_UNDERSTANDING_AND_PHASE_PLAN_REPORT.md` | USERS.0 audit — primary input for USERS.1 |
| `ChatGPT/ERP_USERS_1_SECURITY_FOUNDATION_AND_SOURCE_OF_TRUTH_ALIGNMENT_PLANNING_PROMPT.md` | This planning prompt |

### Auth / RBAC / Users code (verified)
| File | Finding |
|------|---------|
| `src/lib/rbac/check.ts` | No status check; `hasPermission` bypasses for `system_admin` / `group_admin` |
| `src/lib/rbac/permissions.ts` | Has granular `users.*`, `roles.manage`, `erp.admin` — **no** `users.manage`, `roles.edit`, `system.admin` |
| `src/lib/supabase/middleware.ts` | Session refresh; auth route redirect; **no status check**; `isProtected` omits `/dms` etc. (covered by `(protected)` layout) |
| `src/middleware.ts` | Delegates to `updateSession` |
| `src/app/(protected)/layout.tsx` | Checks auth user exists; selects `display_name` only — **no status check** |
| `src/features/auth/login-form.tsx` | `signInWithPassword`; no post-login status check |
| `src/features/auth/signup-form.tsx` | Active public `signUp`; warning alert only |
| `src/app/(auth)/signup/page.tsx` | Renders signup form unconditionally |
| `src/server/actions/users.ts` | Uses nonexistent `users.manage` (6 call sites) |
| `src/server/actions/roles.ts` | Uses nonexistent `system.admin` (line 102) |
| `src/app/(protected)/admin/roles/record/[id]/page.tsx` | Uses nonexistent `roles.edit` (line 26) |
| `src/server/actions/audit.ts` | Inserts via user session client; subject to broken insert RLS |
| `src/server/queries/users.ts` | `listUsers()` — no permission guard |
| `src/server/queries/roles.ts` | `listRoles()` — no permission guard |
| `src/server/queries/permissions.ts` | `listPermissions()` — no permission guard |
| `src/app/(protected)/admin/users/page.tsx` | Page guards `users.view`; calls `listUsers()` |
| `src/app/(protected)/admin/roles/page.tsx` | Page guards `roles.view` |
| `src/app/(protected)/admin/permissions/page.tsx` | Page guards `permissions.view` |

### Migrations (verified)
| File | Relevance |
|------|-----------|
| `supabase/migrations/20260527120000_erp_base_foundation.sql` | Core 8 tables, RLS enabled, policies, seeds (no `users.manage`), `audit_logs_insert` requires `audit.view` |
| `supabase/migrations/20260527160443_erp_base_002d_admin_master_data_hardening.sql` | Adds `employee_reference`, `user_code` column |
| `supabase/migrations/20260618200000_erp_hr_2_employee_master_profile_shell.sql` | `employees` table exists (HR) — **do not link in USERS.1** |

---

## 5. Supabase MCP Read-Only Review Summary

**Connection:** `user-supabase` → `https://mmiefuieduzdiiwnqpie.supabase.co`  
**Method:** SELECT-only via `execute_sql` (no DDL/DML)

### 5.1 RLS and FORCE RLS (live)

| Table | RLS enabled | FORCE RLS |
|-------|-------------|-----------|
| `user_profiles` | true | **false** |
| `roles` | true | **false** |
| `permissions` | true | **false** |
| `role_permissions` | true | **false** |
| `user_roles` | true | **false** |
| `owner_companies` | true | **false** |
| `branches` | true | **false** |
| `audit_logs` | true | **false** |

All eight tables have RLS **enabled** but not **forced**. Table owners / service role can bypass RLS today.

### 5.2 Permission catalog (live query)

**Exist:** `users.view`, `users.create`, `users.update`, `users.delete`, `roles.view`, `roles.manage`, `erp.admin`, `audit.view`  
**Do NOT exist:** `users.manage`, `roles.edit`, `system.admin`

`users` module has **4** permissions (view/create/update/delete) — no composite manage permission.

### 5.3 User status (live)

| status | count |
|--------|-------|
| active | 1 |

No inactive/suspended users in live DB today — UAT will require creating test users.

### 5.4 System admin count (live)

| role_code | active assignments |
|-----------|-------------------|
| system_admin | 1 |

Last-admin risk is **real and immediate**.

### 5.5 `user_profiles` columns (live)

| column | type | nullable |
|--------|------|----------|
| `auth_user_id` | uuid | NO |
| `status` | text | NO |
| `user_code` | text | YES |
| `employee_reference` | text | YES |

### 5.6 `audit_logs_insert` policy (live)

```sql
WITH CHECK (
  current_user_is_global_admin()
  OR current_user_has_permission_in_company('audit.view', owner_company_id)
  OR (branch_id IS NOT NULL AND current_user_has_permission_in_branch('audit.view', branch_id))
)
```

Insert requires **`audit.view`** — incorrect for write-audit-on-action pattern.

### 5.7 HR employee boundary (live)

`employees` table exists (HR module). `user_profiles.employee_reference` exists as free-text. **No FK** to `employees` — correct for now.

### 5.8 Permission module_code casing (live sample)

Mixed casing confirmed: `users` (lowercase) vs `HR`, `DMS`, `COMMON_MD`, `MASTER_DATA` (uppercase). **Defer normalization to USERS.4.**

---

## 6. Current Users Module Security Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Supabase Auth (auth.users) — UUID identity                      │
└───────────────────────────┬─────────────────────────────────────┘
                            │ auth_user_id FK
┌───────────────────────────▼─────────────────────────────────────┐
│ user_profiles — ERP identity, status, org scope                 │
└───────────────────────────┬─────────────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         ▼                  ▼                  ▼
   user_roles ──► roles ──► role_permissions ──► permissions
         │
         ▼
   owner_companies / branches (tenant scope)
         │
         ▼
   audit_logs (immutable action trail)
```

**Security layers today:**
1. Supabase Auth session (cookie/JWT)
2. Next.js `(protected)` layout — auth user presence only
3. Middleware — partial path guard + session refresh
4. Page-level `hasPermission()` checks (inconsistent)
5. Server action `hasPermission()` checks (present on mutators; wrong codes in places)
6. PostgreSQL RLS + SECURITY DEFINER helpers

**Gap:** Layer 2–4 do not enforce `user_profiles.status`. Layer 6 has FORCE RLS off and broken audit insert policy.

---

## 7. Current Auth and Session Flow

1. User submits credentials on `/login` → `signInWithPassword` (client)
2. Supabase sets session cookies
3. `middleware.ts` → `updateSession()` refreshes session; redirects unauthenticated users away from `/dashboard`, `/admin`, `/settings`, `/profile`
4. `(protected)/layout.tsx` calls `getUser()`; redirects to `/login` if missing
5. Layout loads `user_profiles` row (display name only)
6. Pages / server actions call `getAuthContext()` → loads profile, roles, permissions

**Missing steps:**
- No read of `user_profiles.status` after login
- No sign-out / redirect for inactive or suspended accounts
- Login form does not pre-check status (acceptable if post-auth guard is reliable)

**Note:** `/dms`, `/report-center`, and other routes under `(protected)` rely on layout auth check, not middleware path list. Status enforcement in `(protected)/layout.tsx` covers all protected app routes.

---

## 8. Current RBAC and Permission Flow

### `getAuthContext()` (`src/lib/rbac/check.ts`)
- Returns `{ profile, roleCodes, permissionCodes }`
- Adds `erp.admin` to permission set if role is `system_admin`
- Does **not** validate profile status

### `hasPermission(ctx, code)`
Returns true if:
- `permissionCodes.includes(code)`, **or**
- role is `system_admin`, **or**
- role is `group_admin`

**Implication:** Global admins bypass all permission code checks — including nonexistent `users.manage`. Non-global admins with `users.update` **fail** `users.manage` checks — **broken for company_admin user management**.

### RLS vs application permission mismatch
- RLS `user_roles_manage_scoped` uses `current_user_can_manage_user_role_assignment()` → checks `users.update` (and scoped admin rules)
- Server actions use `users.manage` → **never granted in DB**

---

## 9. Current RLS and FORCE RLS Audit

### RLS policies (from foundation migration + live confirmation)
- **user_profiles:** own-row select; scoped select/insert/update/delete by granular `users.*` permissions
- **roles / permissions / role_permissions:** catalog read via `*.view`; manage via global admin or `roles.manage` / `permissions.manage`
- **user_roles:** own select + scoped select; manage via SECURITY DEFINER helper
- **owner_companies / branches:** tenant-scoped view/manage
- **audit_logs:** scoped select; insert requires `audit.view` (**bug**)

### SECURITY DEFINER functions (relevant)
- `current_user_profile_id()`
- `current_user_is_global_admin()`
- `current_user_has_permission*()` family
- `current_user_can_manage_user_role_assignment()`
- `update_my_profile()`

These run as function owner and bypass RLS — **still work after FORCE RLS** on underlying tables.

### Service role (`createAdminClient`)
Used in `createUser`, `deleteUser` — bypasses RLS by design. FORCE RLS does not block service role.

### FORCE RLS risk
Enabling FORCE RLS aligns Users tables with DMS/HR/AI modules (already use FORCE RLS extensively). Primary regression risk: any code path using table owner connection without service role — **none identified in app** (app uses anon/authenticated + service role clients only).

---

## 10. Current Signup Route Audit

| Item | Status |
|------|--------|
| Route | `/signup` → `src/app/(auth)/signup/page.tsx` |
| Form | `SignupForm` calls `supabase.auth.signUp()` client-side |
| UI warning | Alert says "disable open signup in production" — **not enforced** |
| Login link | `/login` footer links to `/signup` ("Create account") |
| Server gate | **None** |
| Env flag | **None** |
| Auth trigger | DB trigger creates minimal `user_profiles` on signup |

**Risk:** Anyone can self-register an Auth user and profile row without admin approval.

---

## 11. Current Audit Logging Flow

1. Server actions call `logAudit()` from `src/server/actions/audit.ts`
2. `logAudit()` uses session `createClient()` (authenticated user context)
3. Resolves actor from `getAuthContext().profile.id`
4. Inserts into `audit_logs`

**Failure mode:** User performing audited action without `audit.view` in scope → RLS insert denied → `logAudit` returns `{ success: false }` → **many callers ignore return value** (fire-and-forget `void logAudit(...)` in DMS modules; Users module uses `await logAudit`).

**Live audit volume:** ~1,706 rows (from USERS.0 audit) — logging works for global admins and users with `audit.view`.

---

## 12. Current Users/Employee Data Boundary

### Architecture rule (mandatory — Sameer directive)

```text
Employee Profile must not be duplicated inside Users.
```

| Concern | HR Employee Profile | User Profile |
|---------|---------------------|--------------|
| Purpose | Employee master data (HR) | Login, security, roles, system access, audit identity |
| Relationship | One employee may optionally link to one user | One user may optionally reference one employee |
| Not every employee needs ERP login | ✓ | — |
| Not every user is an employee | — | ✓ (admin, consultant, auditor, service account) |
| Emirates ID, passport, visa, salary, WPS, attendance, leave, CICPA, compliance docs | **HR only** | **Must not store** |
| Link mechanism | Future `employee_id` FK when HR schema stable | Today: `employee_reference` text (nullable, unused in UI) |

### USERS.1 boundary
- **Do not** add HR tables or employee FK
- **Do not** expose HR fields on user forms
- **Do** document rule in source-of-truth update (§24)
- **USERS.2+:** "Create User from Employee" / "Link User to Employee" workflows after HR approval

---

## 13. Confirmed USERS.1 Problems and Risks

| ID | Problem | Evidence | Risk if unaddressed |
|----|---------|----------|---------------------|
| P-01 | Inactive/suspended users retain session access | No status check in layout, middleware, `getAuthContext`, login | Deactivated insiders retain ERP access |
| P-02 | FORCE RLS off on security tables | Live MCP query | Table owner bypass; inconsistent with rest of ERP |
| P-03 | Open public signup | `signup-form.tsx` active | Unauthorized account creation |
| P-04 | `users.manage` used but not in catalog | Code grep + live permissions query | Non-global admins blocked from user mgmt; global admins masked bug |
| P-05 | `roles.edit` used but not in catalog | `roles/record/[id]/page.tsx:26` | Edit mode never enabled except via broken path |
| P-06 | `system.admin` used but not in catalog | `roles.ts:102` | System role edit guard never passes for non-`system_admin` role holders |
| P-07 | Audit insert requires `audit.view` | Live policy + migration | Silent audit loss for scoped users |
| P-08 | `listUsers()` no query-level guard | `queries/users.ts` | Defense-in-depth gap if called from new code |
| P-09 | Single system_admin assignment | Live DB count | One mistaken delete/deactivate locks out admin |
| P-10 | SOT stale on Users maturity | `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | Future phases built on wrong assumptions |

---

## 14. Inactive/Suspended User Blocking Options

### Option 1: Block in `getAuthContext()` / `requirePermission()`

| Pros | Cons |
|------|------|
| Single choke point for all server actions using `requirePermission` | Direct `getAuthContext()` callers still need awareness |
| Easy to add `requireActiveAuthContext()` | Must define error contract |
| Works for API routes / server actions | Does not alone block page render |

**Impact:** All server actions using `requirePermission` / new active guard fail fast with `Forbidden` or structured error.

### Option 2: Block in middleware / session layer

| Pros | Cons |
|------|------|
| Blocks before page render | Middleware must query `user_profiles.status` (extra DB round trip) |
| Can redirect to `/account-disabled` | Duplicates logic if not shared with RBAC layer |
| Can sign out session | Middleware matcher doesn't cover all routes unless layout also checks |

**Impact:** Redirect inactive users on every request matching middleware.

### Option 3: Sync status to Supabase Auth ban (`banned_until`)

| Pros | Cons |
|------|------|
| Blocks at Auth layer | Requires admin API on every status change |
| Prevents login entirely | Sync complexity, invite edge cases |
| | Defer — not USERS.1 |

---

## 15. Recommended Status Enforcement Design

**Primary (USERS.1):** Option 1 + protected layout (Option 2 lite)

### 15.1 RBAC layer changes (`src/lib/rbac/check.ts`)

1. Extend `AuthContext`:
   ```typescript
   accountStatus: "active" | "inactive" | "suspended" | "none";
   isAccountActive: boolean;
   ```

2. In `getAuthContext()`, after profile load:
   ```typescript
   const status = profile.status as "active" | "inactive" | "suspended";
   const isAccountActive = status === "active";
   ```

3. Add helpers:
   ```typescript
   export function assertAccountActive(ctx: AuthContext): void {
     if (!ctx.profile) throw new Error("Unauthorized");
     if (!ctx.isAccountActive) throw new AccountDisabledError(ctx.accountStatus);
   }

   export async function requireActiveAuthContext(): Promise<AuthContext> {
     const ctx = await getAuthContext();
     assertAccountActive(ctx);
     return ctx;
   }
   ```

4. Update `requirePermission()`:
   ```typescript
   export async function requirePermission(permissionCode: string): Promise<AuthContext> {
     const ctx = await requireActiveAuthContext();
     if (!hasPermission(ctx, permissionCode)) throw new Error("Forbidden");
     return ctx;
   }
   ```

5. Export `AccountDisabledError` class with `code: "ACCOUNT_DISABLED"` for client handling.

### 15.2 Protected layout (`src/app/(protected)/layout.tsx`)

After loading profile, select `status`:
- If `inactive` or `suspended` → `redirect("/account-disabled")` (new auth route)
- Optionally call server `signOut` in a dedicated account-disabled page action

### 15.3 New page: `/account-disabled`

- Simple message: "Your account is not active. Contact your administrator."
- No sensitive data leakage (no roles, no org names)
- Sign out button
- Public/auth layout (user may still have valid Auth session until sign-out)

### 15.4 Login flow (optional hardening)

After successful `signInWithPassword`, client calls a lightweight server action `checkAccountStatus()` before redirect — **or** rely on layout redirect (acceptable for USERS.1).

**Recommended:** Layout redirect is sufficient; add server action check only if UAT shows flash of protected content.

### 15.5 Audit event (recommended)

On blocked server action attempt:
```typescript
action: "USER_ACCESS_BLOCKED"
new_values: { status: "inactive"|"suspended", path: "<optional>" }
```
Use service-role or fixed insert policy so blocked users can still write this one audit row — **or** log only when admin deactivated (already audited on update). **USERS.1 minimum:** audit on admin status change (already via `adminUpdateUserProfile`); blocked-access audit optional in USERS.5.

### 15.6 Defer Auth ban sync to USERS.5

---

## 16. FORCE RLS Plan

### Current status
All 8 Users-module tables: RLS **on**, FORCE RLS **off** (live verified).

### Recommendation
Enable FORCE RLS on all eight tables in one migration, matching ERP standard from DMS/HR/AI phases.

### Service-role considerations
- `createAdminClient()` continues to bypass RLS — no change needed for invite/delete flows
- Background jobs using service role unaffected

### SECURITY DEFINER considerations
- Helper functions already `SECURITY DEFINER` — continue to evaluate permissions internally
- No change required to function bodies for FORCE RLS

### Testing method
1. Before migration: record `SELECT relforcerowsecurity FROM pg_class ...`
2. Apply migration
3. As authenticated non-admin: verify scoped SELECT still works
4. As system_admin: verify full Users admin flows
5. Run `createUser` / `assignRoleToUser` / `logAudit` smoke tests

### Risk rating
**MEDIUM** — low regression probability given app client patterns; test admin flows explicitly.

### Rollback
See §22 and §30 — `NO FORCE ROW LEVEL SECURITY` per table.

---

## 17. Public Signup Gate Plan

### Recommendation
**Env-gated disable by default** — keep route and files; do not delete.

### Environment variables

| Variable | Scope | Default | Purpose |
|----------|-------|---------|---------|
| `SIGNUP_ENABLED` | Server | `false` | Server-side gate on signup page + optional server action |
| `NEXT_PUBLIC_SIGNUP_ENABLED` | Client | `false` | Hide login footer link; disable form submit in UI |

Use both: server flag is authoritative; public flag controls UI.

### Default behavior
- **`SIGNUP_ENABLED=false`:** `/signup` shows "Registration disabled — contact your administrator" (no form submit)
- **`SIGNUP_ENABLED=true`:** Current behavior (dev/local only)

### Files to change (implementation)
| File | Change |
|------|--------|
| `src/app/(auth)/signup/page.tsx` | Server component reads `SIGNUP_ENABLED`; conditional render |
| `src/features/auth/signup-form.tsx` | Accept `enabled` prop; disable form when false |
| `src/features/auth/login-form.tsx` | Hide "Create account" link when `NEXT_PUBLIC_SIGNUP_ENABLED !== "true"` |
| `.env.local.example` | Document both vars |

### Do not
- Remove signup files
- Rely on UI-only hiding without server gate

---

## 18. Permission Code Alignment Plan

### Live catalog truth
Permissions that **exist:** `users.view|create|update|delete`, `roles.view|manage`, `erp.admin`, `audit.view`  
Permissions that **do not exist:** `users.manage`, `roles.edit`, `system.admin`

### Fix map

| Wrong code | Location | Replace with |
|------------|----------|--------------|
| `roles.edit` | `src/app/(protected)/admin/roles/record/[id]/page.tsx:26` | `roles.manage` |
| `system.admin` | `src/server/actions/roles.ts:102` | `erp.admin` **or** `isGlobalAdmin(ctx)` |
| `users.manage` | `users.ts` (5×), admin user pages (3×) | `canManageUsers(ctx)` helper |

### `users.manage` strategy (recommended — no new DB permission)

Add to `src/lib/rbac/check.ts`:

```typescript
export function canManageUsers(ctx: AuthContext): boolean {
  return (
    hasPermission(ctx, "users.create") ||
    hasPermission(ctx, "users.update") ||
    hasPermission(ctx, "users.delete")
  );
}
```

**Rationale:** Matches granular RLS policies and existing seed data. Avoids new migration and role_permission backfill.

**Alternative (not recommended for USERS.1):** Insert `users.manage` permission + grant to roles — duplicates granular permissions.

### `permissions.ts` constants update

Add:
```typescript
// Composite helper — not a DB permission code
// Use canManageUsers(ctx) instead of hasPermission(ctx, "users.manage")
```

Remove or avoid adding `USERS_MANAGE: "users.manage"` as a real permission constant.

### System role edit guard

Replace:
```typescript
if (oldData.is_system_role && !hasPermission(ctx, "system.admin"))
```
With:
```typescript
if (oldData.is_system_role && !isGlobalAdmin(ctx) && !hasPermission(ctx, "erp.admin"))
```

**Simplest correct rule:** `if (oldData.is_system_role && !isGlobalAdmin(ctx))` — only true global admins edit system roles.

### Backward compatibility
- `system_admin` / `group_admin` role bypass in `hasPermission` unchanged
- No DB permission renames required for USERS.1

---

## 19. Audit Log Insert Reliability Plan

### Option comparison

| Option | Pros | Cons | USERS.1 |
|--------|------|------|---------|
| A. Admin client in `logAudit()` | Always inserts | Bypasses all RLS; must never accept client-supplied actor | Fallback only |
| B. SECURITY DEFINER insert function | Controlled, auditable | New function to maintain | **Recommended** |
| C. Fix RLS policy (actor-self insert) | Simple, idiomatic | Must validate actor = self | **Recommended (primary)** |
| D. Keep as-is | No work | Broken for non-audit viewers | Reject |

### Recommendation
**Option C primary** — fix `audit_logs_insert` policy:

```sql
-- Any authenticated user may insert an audit row where they are the actor
WITH CHECK (actor_user_profile_id = public.current_user_profile_id())
```

Keep `audit_logs_select` unchanged (still requires `audit.view` or global admin).

**Optional Option B** for background/system inserts later (USERS.5):

```sql
CREATE FUNCTION public.insert_audit_log(...) RETURNS bigint
  SECURITY DEFINER ...
```

### Silent failure today
`logAudit()` logs error to logger but callers often ignore return value — after policy fix, verify insert success in Users module tests.

### Risk of admin client (Option A)
Misuse could allow forged actor IDs if params not validated — avoid as primary.

---

## 20. Explicit List Query Permission Guard Plan

### Current state
| Query | Page guard | Query guard |
|-------|------------|-------------|
| `listUsers()` | `users.view` on `/admin/users` | **None** |
| `listRoles()` | `roles.view` on `/admin/roles` | **None** |
| `listPermissions()` | `permissions.view` on `/admin/permissions` | **None** |

### USERS.1 minimum (required)
**`listUsers()`** — add at top of function:
```typescript
const ctx = await getAuthContext();
if (!hasPermission(ctx, "users.view")) {
  logger.warn("listUsers: forbidden");
  return [];
}
```

Or throw if called from server actions — returning `[]` matches current error pattern.

### USERS.1 recommended (defense in depth)
Also guard:
- `listRoles()` → requires `roles.view`
- `listPermissions()` → requires `permissions.view`
- `getUserById()` → requires `users.view` or own profile id

### Avoid duplicate logic
Do **not** copy permission strings — import from `permissions.ts` constants where used.

---

## 21. Last-Admin Protection Recommendation

### Risk
Live DB: **1** active `system_admin` assignment. Deleting or suspending that user **locks out** ERP administration.

### Affected functions (later)
- `deleteUser()`
- `adminUpdateUserProfile()` (status → inactive/suspended)
- `removeRoleFromUser()` (if removing last system_admin role)

### Placement decision

| Scope | Phase | Rationale |
|-------|-------|-----------|
| Block delete of last `system_admin` user | **USERS.1** | Minimal code; prevents catastrophic lockout |
| Block suspend/deactivate of last admin | **USERS.1** | Same |
| Block remove last `system_admin` role assignment | **USERS.2** | Requires role-assignment UI edge cases |
| Full last-admin matrix (group_admin, company_admin) | **USERS.2** | Broader policy |

### USERS.1 implementation sketch
Add `assertNotLastSystemAdmin(userProfileId)` in `src/server/actions/users.ts`:
1. Count active `user_roles` joined to `roles.role_code = 'system_admin'`
2. If count === 1 and target user holds that assignment → return error

Call from `deleteUser` and `adminUpdateUserProfile` when status changes away from `active`.

---

## 22. Draft Migration SQL for USERS.1

> **DRAFT ONLY — DO NOT EXECUTE UNTIL IMPLEMENTATION APPROVED**

### Migration file name (proposed)
`supabase/migrations/20260702100000_erp_users_1_security_foundation.sql`

---

### Block A — FORCE RLS

**Purpose:** Prevent table-owner RLS bypass on Users security tables.  
**Why needed:** Align with DMS/HR/AI standard; USERS.0 HIGH finding.  
**Tables affected:** 8 Users-module tables.  
**Risk:** MEDIUM — test admin flows after apply.  
**Phase:** USERS.1

```sql
-- ERP USERS.1 — FORCE ROW LEVEL SECURITY on core admin/RBAC tables
-- DRAFT — do not apply until implementation approved

ALTER TABLE public.user_profiles      FORCE ROW LEVEL SECURITY;
ALTER TABLE public.roles              FORCE ROW LEVEL SECURITY;
ALTER TABLE public.permissions        FORCE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions   FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles         FORCE ROW LEVEL SECURITY;
ALTER TABLE public.owner_companies    FORCE ROW LEVEL SECURITY;
ALTER TABLE public.branches           FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs         FORCE ROW LEVEL SECURITY;
```

**Rollback:**
```sql
ALTER TABLE public.user_profiles      NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.roles              NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.permissions        NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions   NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles         NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.owner_companies    NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.branches           NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs         NO FORCE ROW LEVEL SECURITY;
```

**Test:** Query `pg_class.relforcerowsecurity`; run user CRUD smoke test as system_admin and scoped admin.

---

### Block B — Audit insert policy fix

**Purpose:** Allow any authenticated user to insert audit rows for their own actions.  
**Why needed:** Current policy requires `audit.view` on insert — incorrect.  
**Table affected:** `audit_logs`  
**Risk:** LOW — insert still constrained to self as actor.  
**Phase:** USERS.1

```sql
-- Fix audit_logs INSERT policy — actor-self insert
DROP POLICY IF EXISTS audit_logs_insert ON public.audit_logs;

CREATE POLICY audit_logs_insert ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    actor_user_profile_id = public.current_user_profile_id()
  );
```

**Rollback:** Restore original policy from `20260527120000_erp_base_foundation.sql` lines 949–958.

**Test:** User with `users.update` but without `audit.view` creates/updates user → audit row appears.

---

### Block C — Optional SECURITY DEFINER audit helper (defer unless needed in UAT)

**Purpose:** System/background audit inserts without user session.  
**Phase:** USERS.5 (defer)  
**Risk:** MEDIUM — must lock down function grants.

Not included in USERS.1 unless UAT proves policy fix insufficient.

---

### Block D — Permission seed (`users.manage`) 

**NOT RECOMMENDED for USERS.1** — use `canManageUsers()` helper instead. No SQL block.

---

## 23. Draft Code Change Plan by File

| # | File | Change |
|---|------|--------|
| 1 | `src/lib/rbac/check.ts` | Add `accountStatus`, `isAccountActive`, `assertAccountActive`, `requireActiveAuthContext`, `canManageUsers`; update `requirePermission` |
| 2 | `src/lib/rbac/account-disabled-error.ts` | **New** — `AccountDisabledError` class (optional small file) |
| 3 | `src/app/(protected)/layout.tsx` | Select `status`; redirect inactive/suspended to `/account-disabled` |
| 4 | `src/app/(auth)/account-disabled/page.tsx` | **New** — disabled account message + sign out |
| 5 | `src/app/(auth)/signup/page.tsx` | Server gate via `SIGNUP_ENABLED` |
| 6 | `src/features/auth/signup-form.tsx` | Respect enabled flag |
| 7 | `src/features/auth/login-form.tsx` | Hide signup link when public flag false |
| 8 | `src/server/actions/users.ts` | Replace `users.manage` → `canManageUsers`; add last-admin guard |
| 9 | `src/app/(protected)/admin/users/page.tsx` | Replace `users.manage` → `canManageUsers` |
| 10 | `src/app/(protected)/admin/users/record/new/page.tsx` | Same |
| 11 | `src/app/(protected)/admin/users/record/[id]/page.tsx` | Same |
| 12 | `src/server/actions/roles.ts` | Replace `system.admin` → `isGlobalAdmin` for system role guard |
| 13 | `src/app/(protected)/admin/roles/record/[id]/page.tsx` | Replace `roles.edit` → `roles.manage` |
| 14 | `src/server/queries/users.ts` | Add `users.view` guard to `listUsers()`; optional `getUserById` |
| 15 | `src/server/queries/roles.ts` | Add `roles.view` guard to `listRoles()` |
| 16 | `src/server/queries/permissions.ts` | Add `permissions.view` guard to `listPermissions()` |
| 17 | `src/lib/rbac/permissions.ts` | Document `canManageUsers`; no fake `users.manage` constant |
| 18 | `.env.local.example` | Document `SIGNUP_ENABLED`, `NEXT_PUBLIC_SIGNUP_ENABLED` |
| 19 | `supabase/migrations/20260702100000_erp_users_1_security_foundation.sql` | **New** — Block A + B SQL |

**Files explicitly NOT changed:** DMS, HR, Party, AI, Report modules.

---

## 24. Draft Source-of-Truth Update Plan

Apply **after** USERS.1 implementation closure — **not during planning**.

### Section: Users Module Status (proposed text)

```markdown
### Users Module (USERS.1 CLOSED — Security Foundation)

**Status:** LIVE foundation + USERS.1 security hardening complete.

**Implemented (do not rebuild):**
- User list, create/invite, edit, delete, role assign/remove
- Role CRUD, permission matrix, org/branch CRUD, audit logging
- Server-side permission checks on mutating actions
- Inactive/suspended account blocking (USERS.1)
- FORCE RLS on core RBAC tables (USERS.1)
- Signup gated by env (default disabled) (USERS.1)

**User vs Employee boundary (mandatory):**
- User Profile = login, security, roles, permissions, system access, audit identity only
- Employee Profile = HR master record (`employees` table)
- Do NOT duplicate HR data in `user_profiles`
- Optional link via `employee_reference` (text today) or future `employee_id` FK after HR approval
- Not every employee gets ERP login; not every user is an employee

**Permission model:**
- Granular: `users.view|create|update|delete`, `roles.view|manage`, `erp.admin`
- Use `canManageUsers(ctx)` for composite user management — NOT `users.manage` (not in catalog)

**Next phase:** USERS.2 User Management Core (planning-first)

**Planning-first rule:** All Users phases require approved plan before implementation.
```

### Corrections to existing SOT rows
- Replace `users.manage` in module table with `users.view + canManageUsers()`
- Remove/improve stale "Users enhancement = missing CRUD" narrative

---

## 25. Backward Compatibility Plan

| Change | Compatibility impact | Mitigation |
|--------|---------------------|------------|
| Status blocking | Inactive users lose access immediately | Expected; communicate to admins |
| FORCE RLS | None expected for normal clients | Smoke test service-role admin flows |
| Signup gate | Default off — dev must set env to test signup | Document in `.env.local.example` |
| `users.manage` → `canManageUsers` | company_admin with `users.update` **gains** access they should have had | Intended fix |
| `roles.edit` → `roles.manage` | Users with `roles.manage` **gain** edit mode on role records | Intended fix |
| Audit insert policy | More users can insert (self only) | Strictly broader in safe direction |
| Last-admin guard | Blocks destructive ops on sole admin | Error message guides admin |

No breaking API changes for external integrations (none exist for Users module).

---

## 26. Security Risk and Mitigation Matrix

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| FORCE RLS breaks admin invite flow | Low | High | Test `createUser` with service role post-migration |
| Status guard locks out all users due to bug | Low | Critical | UAT with active admin first; rollback layout change |
| Signup gate bypass via direct API | Medium | High | Server gate on page; document Supabase Auth dashboard disable |
| Last-admin guard bypass | Low | High | Server-side only; cover delete + deactivate |
| Audit policy too permissive (forge actor) | Low | Medium | WITH CHECK enforces `current_user_profile_id()` |
| Inactive user brief flash before redirect | Medium | Low | Optional post-login status server action |

---

## 27. Implementation Sequence for Later USERS.1 Implementation

```text
1. Migration: audit_logs_insert policy fix (lowest risk, immediate audit benefit)
2. Code: canManageUsers + permission string fixes (roles.edit, system.admin)
3. Code: status enforcement in check.ts + requirePermission
4. Code: protected layout + /account-disabled page
5. Code: signup env gate
6. Code: listUsers/listRoles/listPermissions query guards
7. Code: last-admin guard in deleteUser + adminUpdateUserProfile
8. Migration: FORCE RLS on 8 tables
9. Typecheck + lint + build
10. Targeted UAT (§29)
11. Implementation report + source-of-truth update
```

**Rationale:** Fix permission bugs before UAT; apply FORCE RLS last after functional verification.

---

## 28. Test Plan for Later USERS.1 Implementation

### Auth / Session (T-01–T-05)
| ID | Test | Expected |
|----|------|----------|
| T-01 | Active admin login → dashboard | Success |
| T-02 | Inactive user login attempt / existing session | Redirect `/account-disabled` or Forbidden on actions |
| T-03 | Suspended user | Same as T-02 |
| T-04 | Inactive user calls protected server action | Error / Forbidden; no data mutation |
| T-05 | Account-disabled page | Generic message; no role/org leakage |

### RBAC (T-06–T-10)
| ID | Test | Expected |
|----|------|----------|
| T-06 | system_admin bypass | Full access maintained |
| T-07 | User with `users.view` | Users list loads |
| T-08 | User without `users.view` | Access denied; `listUsers()` returns empty |
| T-09 | User with `roles.manage` opens role record `?mode=edit` | Edit mode enabled (roles.edit fix) |
| T-10 | Non-global admin edits system role | Blocked; global admin succeeds |

### RLS (T-11–T-15)
| ID | Test | Expected |
|----|------|----------|
| T-11 | Post-migration FORCE RLS | All 8 tables `relforcerowsecurity = true` |
| T-12 | Unauthorized SELECT user_profiles | Empty/denied per RLS |
| T-13 | Scoped admin SELECT | Returns scoped rows only |
| T-14 | Role assignment after FORCE RLS | Success |
| T-15 | Audit insert without audit.view | Success (self actor) |

### Signup (T-16–T-17)
| ID | Test | Expected |
|----|------|----------|
| T-16 | Default env `/signup` | Disabled message; no account created |
| T-17 | `SIGNUP_ENABLED=true` in dev | Controlled signup works |

### Audit (T-18–T-19)
| ID | Test | Expected |
|----|------|----------|
| T-18 | Admin sets user inactive | Audit update row recorded |
| T-19 | User create/update/role assign | Audit rows still written |

### Regression (T-20–T-27)
| ID | Test | Expected |
|----|------|----------|
| T-20 | `/admin/users` system_admin | Loads |
| T-21 | `/admin/roles` | Loads |
| T-22 | `/admin/permissions` | Loads |
| T-23 | `/profile` active user | Loads |
| T-24 | `npm run build` | Pass |
| T-25 | TypeScript check | Pass |
| T-26 | Lint | Pass if configured |
| T-27 | Existing test suite | Pass |

### New unit tests (recommended in implementation)
- `canManageUsers()` matrix
- `assertAccountActive()` / `AccountDisabledError`
- Last-admin guard count logic

---

## 29. UAT Plan

**Tester:** Sameer admin account (existing UAT user — credentials from local env, not stored in this plan).

| Step | Action | Pass criteria |
|------|--------|---------------|
| UAT-01 | Log in as active admin | Dashboard loads |
| UAT-02 | Open Users, Roles, Permissions, Audit | All pages load |
| UAT-03 | Create test user (active) | Success |
| UAT-04 | Set test user to inactive | User cannot access dashboard; sees account-disabled |
| UAT-05 | Set test user to suspended | Same |
| UAT-06 | Visit `/signup` (default env) | Registration disabled message |
| UAT-07 | Attempt delete sole system_admin | Blocked with clear error |
| UAT-08 | Edit role with `roles.manage` | Edit mode works |
| UAT-09 | Spot-check unrelated module (e.g. DMS documents list) | No regression |
| UAT-10 | Review audit log for user status change | Entry present |

---

## 30. Rollback Plan

| Component | Revert | Risk | Confirm success |
|-----------|--------|------|-----------------|
| FORCE RLS migration | Run Block A rollback SQL | LOW | `relforcerowsecurity = false`; admin CRUD works |
| Audit policy | Restore original `audit_logs_insert` | LOW | Inserts require audit.view again |
| Signup gate | Set `SIGNUP_ENABLED=true` or remove checks | NONE | Signup form visible |
| Status enforcement | Revert layout + check.ts | MEDIUM | Inactive users regain access — **avoid in prod** |
| Permission code fixes | Revert string changes | LOW | Prior (buggy) behavior restored |
| Last-admin guard | Remove guard functions | LOW | Delete admin possible again |

**Git rollback:** `git revert <USERS.1-commit>` + reverse migration if applied to Supabase.

---

## 31. Acceptance Criteria

| ID | Criterion |
|----|-----------|
| AC-01 | Inactive users cannot access protected ERP pages or server actions |
| AC-02 | Suspended users cannot access protected ERP pages or server actions |
| AC-03 | Active users can still log in normally |
| AC-04 | System admin can still access Users/Roles/Permissions pages after changes |
| AC-05 | Public `/signup` is disabled or gated by default |
| AC-06 | FORCE RLS is enabled on all 8 approved tables without breaking admin flows |
| AC-07 | `roles.edit` permission bug is corrected |
| AC-08 | `system.admin` permission bug is corrected or formally retired |
| AC-09 | `users.manage` alignment documented; code uses `canManageUsers()` matching granular DB permissions |
| AC-10 | Audit log insertion remains reliable for admin and non-admin audited actions |
| AC-11 | `listUsers()` requires `users.view` explicitly |
| AC-12 | Source-of-truth updated with Users module real status and employee/user boundary |
| AC-13 | No HR employee data duplicated into `user_profiles` |
| AC-14 | No unrelated module modified |
| AC-15 | Build, typecheck, lint, tests, and targeted UAT pass |

---

## 32. Items Explicitly Deferred to USERS.2 or Later

### USERS.2 User Management Core
- Server-side pagination/search
- Email visibility for admins (auth.users join)
- Remove role button UI
- Last login display
- Full last-admin protection (role removal paths)
- User profile `notes` / `employee_reference` form save fix
- Suspended badge styling

### USERS.3 Roles Enhancement
- Role form advanced fields, permissions tab, clone role
- `assigned_at` display bug (uses `created_at`)
- `user_code` numbering

### USERS.4 Permissions and Effective Access
- `module_code` casing normalization (255 permissions)
- Effective permissions per user view
- Permission edit UI

### USERS.5 Security Hardening
- Audit log pagination/filter UI
- Per-user audit tab
- Login/logout event logging
- Supabase Auth ban sync for inactive users
- SECURITY DEFINER audit helper (if needed)

### USERS.6 UI/UX Polish
- Users dashboard, admin hub, avatar upload, loading/empty states

### HR / Employee
- Employee table linking workflows
- `employee_id` FK
- Create user from employee
- HR write-back

---

## 33. Final Recommendation

**Proceed with USERS.1 implementation** using the sequence in §27 after Sameer approves this plan.

**Priority order of fixes:**
1. **Status enforcement** — closes CRITICAL insider access gap
2. **Permission code alignment** — fixes silent failures for non-global admins
3. **Audit insert policy** — restores reliable audit trail
4. **Signup gate** — closes public registration hole
5. **FORCE RLS** — aligns security posture with rest of ERP
6. **Query guards + last-admin minimum** — defense in depth

**Do not expand scope** into USERS.2 UX, HR linking, or permission catalog normalization.

---

## 34. Next Cursor Implementation Prompt Summary

When Sameer approves this plan, issue a separate **USERS.1 Implementation** prompt with:

```text
Phase: USERS.1 Implementation (approved plan)
Read: ERP_USERS_1_SECURITY_FOUNDATION_AND_SOURCE_OF_TRUTH_ALIGNMENT_PLAN.md
Implement exactly:
  - Migration 20260702100000_erp_users_1_security_foundation.sql (FORCE RLS + audit insert fix)
  - Status enforcement (check.ts, protected layout, /account-disabled)
  - Signup env gate (SIGNUP_ENABLED default false)
  - Permission fixes (canManageUsers, roles.manage, isGlobalAdmin)
  - Query guards (listUsers minimum; listRoles/listPermissions recommended)
  - Last-admin guard (delete + deactivate only)
  - .env.local.example update
  - Implementation report in implementation_Review/
  - Update .cursor/ALGT_ERP_SOURCE_OF_TRUTH.md
Do NOT:
  - Start USERS.2+
  - Touch DMS/HR/AI/Party modules
  - Add employee FK or HR data to user_profiles
  - Execute without approved plan reference
Acceptance: §31 AC-01 through AC-15
Tests: §28 + UAT §29
```

---

*End of USERS.1 Security Foundation and Source-of-Truth Alignment Plan*
