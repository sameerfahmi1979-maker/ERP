# ERP USERS.2 — User Management Core Plan

**Phase:** ERP USERS MODULE — USERS.2 User Management Core  
**Type:** Planning only — no implementation in this phase  
**Date:** 2026-06-27  
**Author:** Cursor Agent (planning audit)  
**Prerequisite:** USERS.1 CLOSED / PASS WITH NOTES  
**Live Supabase project:** `https://mmiefuieduzdiiwnqpie.supabase.co` (`user-supabase` MCP)

---

## 1. Executive Summary

USERS.1 closed the security foundation (inactive/suspended blocking, FORCE RLS, signup gate, permission-code alignment, last-admin protection on deactivate/delete, query guards). USERS.2 should deliver **practical user-management correctness and scalability** without weakening USERS.1 or duplicating HR employee data.

**Confirmed high-priority gaps today:**

1. `listUsers()` loads **all** profiles on every page load — client-only pagination/search.
2. Admin **cannot see other users' emails** (only self email via session).
3. **`notes` and `employee_reference` are silently dropped** by `adminUpdateUserProfileSchema` despite form fields existing.
4. **`removeRoleFromUser()` exists server-side but has no UI** and lacks last-admin guard on `system_admin` role removal.
5. Users table shows **first role only**; role **scope** (global/company/branch) is not displayed.
6. No **Security** section for **last login**; `last_sign_in_at` is unused in `src/`.
7. **`last_admin_updated_at` is never written** on admin updates.
8. Status UI lacks distinct **Suspend** action and **suspended** badge styling.

**Recommended USERS.2 scope:** server-side users list foundation, admin email visibility, profile schema fix, remove-role UI with last-admin guard extension, all-roles + scope display, Security tab with last login, status lifecycle UX, `is_assignable` filter in role pickers, UAT/reporting.

**Recommended deferrals:** per-user audit tab, audit pagination, MFA/password reset, `employee_id` FK, Create User from Employee, user_code auto-numbering, Users dashboard cards, permission normalization — to USERS.3–USERS.6 or HR integration phase.

**No new tables required for USERS.2.** Optional additive indexes only (search performance). No `employee_id` FK.

---

## 2. Planning Scope and Non-Implementation Rule

This document is **planning-only**.

During this phase Cursor must **not**:

- Modify source code, UI, server actions, or queries
- Create or apply migrations
- Change Supabase data or RLS policies
- Update `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` (update only after future implementation)

Sameer will review this plan with ChatGPT. A separate **USERS.2 implementation prompt** will be issued only after approval.

---

## 3. USERS.1 Closure Context

USERS.1 implemented and UAT-verified (`implementation_Review/ERP_USERS_1_SECURITY_FOUNDATION_IMPLEMENTATION_REPORT.md`, `implementation_Review/ERP_USERS_1_BROWSER_UAT_VERIFICATION_REPORT.md`):

| Control | Status |
|---|---|
| Inactive/suspended → `/account-disabled` | ✅ |
| FORCE RLS on 8 Users/RBAC tables | ✅ |
| `audit_logs_insert` actor-self policy | ✅ |
| `/signup` gated (`SIGNUP_ENABLED=false` default) | ✅ |
| `roles.edit` → `roles.manage`, `system.admin` → `isGlobalAdmin`, `users.manage` → granular + `canManageUsers` | ✅ |
| Query guards on `listUsers` / `listRoles` / `listPermissions` | ✅ |
| Last active `system_admin` deactivate/delete blocked | ✅ |
| TS + build + vitest PASS | ✅ |
| Browser UAT PASS WITH NOTES (Playwright not run) | ✅ |

USERS.2 **must preserve every USERS.1 control** and extend guards where new mutation paths are exposed (notably **remove role**).

---

## 4. Files, Rules, Prompts, and Reports Reviewed

### Read and used

| File | Status |
|---|---|
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | ✅ Read |
| `.cursor/rules/algt-erp-source-of-truth.mdc` | ✅ Referenced |
| `ERP_USERS_MODULE_DEEP_AUDIT_UNDERSTANDING_AND_PHASE_PLAN_REPORT.md` | ✅ Read (§19, §28–30) |
| `ERP_USERS_1_SECURITY_FOUNDATION_AND_SOURCE_OF_TRUTH_ALIGNMENT_PLAN.md` | ✅ Referenced |
| `implementation_Review/ERP_USERS_1_SECURITY_FOUNDATION_IMPLEMENTATION_REPORT.md` | ✅ Read |
| `implementation_Review/ERP_USERS_1_BROWSER_UAT_VERIFICATION_REPORT.md` | ✅ Read |
| `supabase/migrations/20260702100000_erp_users_1_security_foundation.sql` | ✅ Read |
| `ChatGPT/ERP_USERS_2_USER_MANAGEMENT_CORE_PLANNING_PROMPT.md` | ✅ Read (this phase prompt) |

### Missing / path note

| Expected | Actual |
|---|---|
| `ERP_USERS_1_BROWSER_UAT_VERIFICATION_REPORT.md` (root) | Report lives at `implementation_Review/ERP_USERS_1_BROWSER_UAT_VERIFICATION_REPORT.md` |

### Related docs searched

- `*USER*.md`, `*USERS*.md` — 5 files found (listed above)
- No standalone `*RBAC*.md` or `*ROLE*.md` planning files beyond deep audit report
- Workspace rules: save-and-close, party master, child dialog, bank master — not in USERS.2 scope but UI must comply when touching forms

---

## 5. Live Supabase / Schema Review Summary

**MCP:** `user-supabase` — read-only SQL only. No DDL/DML executed.

### `user_profiles` columns (live)

`id`, `auth_user_id`, `user_code`, `full_name`, `display_name`, `phone`, `job_title`, `department`, `owner_company_id`, `branch_id`, `status`, `avatar_url`, `created_at`, `updated_at`, `employee_reference`, `manager_user_profile_id`, `preferred_language`, `timezone`, `last_admin_updated_at`, `notes`

All Phase 002D columns exist. **No `employee_id` FK.**

### Status counts (live, post-UAT cleanup)

| status | count |
|---|---|
| active | 1 |

(Single production admin after temp UAT user cleanup.)

### Active `user_roles`

| metric | value |
|---|---|
| Active assignments | 1 |
| Active `system_admin` (active profile) | 1 |

### `user_roles` columns (live)

`id`, `user_profile_id`, `role_id`, `owner_company_id`, `branch_id`, `is_active`, `assigned_at`, `assigned_by`

Scope model: **global** = both scope FKs null; **company** = `owner_company_id` set; **branch** = `branch_id` set (mutually exclusive by UI convention).

### `roles` columns (live)

Includes `is_assignable` (nullable boolean), `display_name`, `role_category`, `role_level`, `notes` — mostly unused in Users UI today.

### `employees` — no link to `user_profiles`

Live FK inspection: `employees` has FKs to HR master data, DMS, org structure, and `user_profiles` only for **`created_by` / `updated_by` / `deleted_by`** audit columns.

**No `user_profile_id` or reverse FK on `user_profiles`.**

`user_profiles.employee_reference` is **free-text reference only** (indexed: `idx_user_profiles_employee_reference`).

### Existing indexes (relevant)

| Index | Table |
|---|---|
| `idx_user_profiles_status` | user_profiles |
| `idx_user_profiles_owner_company_id` | user_profiles |
| `idx_user_profiles_branch_id` | user_profiles |
| `idx_user_profiles_employee_reference` | user_profiles |
| `idx_user_roles_user_profile_id` | user_roles |
| `idx_user_roles_role_id` | user_roles |
| `user_roles_scope_unique` | user_roles |

**Gap:** no trigram/GIN index on `full_name` / `display_name` / `user_code` for ILIKE search at scale — optional in USERS.2 migration.

---

## 6. Current Users Module Architecture

```
/admin/users (RSC)
  └─ listUsers() → all rows → UsersTable (client pagination/filter)

/admin/users/record/new
  └─ UserWorkspaceForm (add) → createUser() [adminClient auth]

/admin/users/record/[id]?mode=edit|view
  └─ getUserById() → UserWorkspaceForm
       ├─ Profile / Organization / Roles / Audit Info sections
       ├─ AssignRoleDialog → assignRoleToUser()
       └─ (no remove role UI)

Server actions: users.ts
  ├─ createUser, adminUpdateUserProfile, assignRoleToUser
  ├─ removeRoleFromUser (unwired)
  └─ deleteUser (+ assertNotLastSystemAdmin)

RBAC: getAuthContext, hasPermission, canManageUsers, isGlobalAdmin
Audit: logAudit() on all mutations
```

**Boundary rule (mandatory):**

- **Employee Profile** = HR master (`employees` + child tabs)
- **User Profile** = login / access / roles / audit identity
- Users must **not** duplicate Emirates ID, passport, visa, salary, WPS, leave, medical, dependents, compliance docs, etc.

---

## 7. Current User List Audit

**File:** `src/server/queries/users.ts` — `listUsers()`  
**File:** `src/features/users/users-table.tsx`  
**File:** `src/app/(protected)/admin/users/page.tsx`

| Aspect | Current | Problem |
|---|---|---|
| Loading | Single query all `user_profiles` + batch `user_roles` | Does not scale |
| Pagination | TanStack client `getPaginationRowModel` | Not server-side |
| Search | Client global filter on rendered cells | Email mostly null; role search ineffective |
| Filters | None (status/company/branch/role) | Missing |
| Roles column | `roles[0]` only | Incomplete |
| Email | Self only via `supabase.auth.getUser()` | Admins cannot see team emails |
| Status actions | Activate / Deactivate only | No Suspend in row menu |
| Suspended badge | Generic secondary styling | Not distinct from inactive |

**Answer A1:** Yes — `listUsers()` loads all users at once.

---

## 8. Current User Record Form Audit

**File:** `src/features/users/user-workspace-form.tsx`

| Section | Edit mode | Gaps |
|---|---|---|
| Profile | full_name, display_name, phone, status, job_title, department, employee_reference, notes | notes/employee_reference not saved |
| Organization | company, branch | OK |
| Roles | List role names; Assign Role button | No remove; no scope; no user_role_id |
| Audit Info | created/updated/last_admin_updated/auth_user_id/lang/tz | last_admin_updated always empty; not audit_logs |
| Security | **Missing** | No last login |

Add mode sections: Authentication → Profile → Organization → Initial Role — acceptable; no USERS.2 change required unless adding employee_reference on create (defer).

`authContext` prop declared but unused — candidate cleanup in implementation.

---

## 9. Current User Profile Schema and Save Audit

**File:** `src/features/users/user-schema.ts`

### Schema vs DB vs form

| Field | DB | `adminUpdateUserProfileSchema` | Form sends | Saves? |
|---|---|---|---|---|
| full_name, display_name, phone, job_title, department | ✅ | ✅ | ✅ | ✅ |
| owner_company_id, branch_id, status | ✅ | ✅ | ✅ | ✅ |
| **notes** | ✅ | ❌ | ✅ | **❌ silently dropped** |
| **employee_reference** | ✅ | ❌ | ✅ | **❌ silently dropped** |
| **last_admin_updated_at** | ✅ | ❌ (server-set) | N/A | **❌ never set** |
| manager_user_profile_id | ✅ | ❌ | ❌ | N/A |
| preferred_language, timezone | ✅ | ❌ | display only | N/A |

**Root cause:** Zod `.parse()` strips unknown keys; form submits fields not in schema.

**Answer B2:** Confirmed — `notes` and `employee_reference` are silently dropped.

**Answer B3:** Yes — `last_admin_updated_at` should be auto-set in `adminUpdateUserProfile` on successful admin write (not client-editable).

**Answer B4 — editable in USERS.2:** full_name, display_name, phone, job_title, department, owner_company_id, branch_id, status, notes, employee_reference.

**Answer B5 — display-only / defer:** user_code, auth_user_id, avatar_url, preferred_language, timezone (editable later in USERS.6), manager_user_profile_id (defer picker to USERS.6).

---

## 10. Current Role Assignment UI Audit

| Question | Answer |
|---|---|
| Remove-role server action? | ✅ `removeRoleFromUser()` in `users.ts` |
| Remove-role UI? | ❌ Not exposed |
| Scope display? | ❌ Not in list or record |
| All roles in table? | ❌ First only |
| `is_assignable` respected? | ❌ `assign-role-dialog.tsx` filters `is_active` only |
| `getUserById` role payload | `{ role_code, role_name }[]` — missing `id`, `user_role_id`, scope FKs |

**AssignRoleDialog issues:**

- Uses native `<select>` for DB roles (violates ERPCombobox standard for async options) — fix while editing in USERS.2.
- `ERPChildDialogForm` usage is correct.

**USERS.2 must extend `getUserById` / list row type:**

```typescript
type UserRoleAssignment = {
  user_role_id: number;
  role_id: number;
  role_code: string;
  role_name: string;
  scope: "global" | "company" | "branch";
  owner_company_id: number | null;
  branch_id: number | null;
  assigned_at: string;
};
```

---

## 11. Current Email and Auth Metadata Audit

| Source | Access today | USERS.2 need |
|---|---|---|
| `auth.users.email` | Only current session user in `listUsers` | Admin list + record for authorized viewers |
| `createAdminClient()` | Used in `createUser()` already | Reuse for read-only email + last login batch fetch |
| Denormalize email to `user_profiles` | Not implemented | **Not recommended** — sync drift, privacy surface |

**Answer A4/A5 — recommended strategy:**

**Option A (recommended): Server-only admin client batch lookup**

1. Paginate `user_profiles` via Supabase server client (RLS-respecting).
2. For the **current page only** (max 25–100 rows), call `createAdminClient().auth.admin.getUserById(auth_user_id)` per row (or parallel `Promise.all` with concurrency limit).
3. Return only `{ email }` (and security fields in detail query) to authorized callers.
4. Guard: `hasPermission(ctx, "users.view")` minimum; consider `users.update` for security tab extras.

**Option B: Denormalize email column + trigger** — defer / NOT RECOMMENDED for USERS.2 (migration + sync + GDPR-style concerns).

**Option C: Defer email column** — NOT acceptable for core admin UX; include in USERS.2.

**Search by email:** Two-phase approach — if search string contains `@`, query admin API with email filter for matching auth IDs, then join to profiles; else ILIKE on name/code fields. Cap result set; document performance limit.

---

## 12. Current Last Login / Security Data Audit

| Field | In codebase | USERS.2 |
|---|---|---|
| `auth.users.last_sign_in_at` | ❌ not referenced | **Include** in new Security section |
| `auth.users.created_at` | ❌ | Optional display (account created) |
| `auth.users.banned_until` | ❌ | **Defer to USERS.5/6** |
| MFA factors | ❌ | **Defer** |
| Password reset / resend invite | ❌ | **Defer to USERS.5** |

**Answer D1–D3:** Last login can be shown safely via `createAdminClient()` in server query/action, gated by `users.view`, returned as ISO string only.

**Implementation pattern:** New server-only helper `getUserAuthMetadata(authUserId)` in `src/server/queries/users.ts` or `src/server/actions/users.ts` (prefer query) — never export to client components directly; pass through RSC page props.

---

## 13. Current Status Lifecycle Audit

**Valid statuses:** `active`, `inactive`, `suspended` (DB + Zod + form select).

| Surface | active | inactive | suspended |
|---|---|---|---|
| Form status select | ✅ | ✅ | ✅ |
| Table row menu | Activate | Deactivate | **Missing Suspend** |
| Badge styling | emerald | gray | generic secondary |
| Last-admin guard | ✅ on deactivate | ✅ | ✅ (same path) |

**Answer E2:** Add distinct row actions: **Deactivate** (→ inactive), **Suspend** (→ suspended), **Activate** (→ active from either).

**Answer E3:** Status change reason — **defer to USERS.6** (deep audit places reason field in polish phase). USERS.2 uses confirmation dialog only.

**Answer E4:** Preserve `assertNotLastSystemAdmin` on any status change away from `active` — already in USERS.1; regression test required.

---

## 14. Current Audit Logging and Per-User Audit Audit

**Writes:** All user mutations call `logAudit()` — working post-USERS.1 RLS fix.

**Reads:**

- `/admin/audit` — `listAuditLogs({ limit: 200 })`, no pagination, no entity filter
- User record "Audit Info" — profile timestamps only, **not** `audit_logs` rows

**Answer G1/G2:** **Defer per-user audit tab to USERS.5.** USERS.2 only ensures mutations continue logging (profile update, remove role) and fixes `last_admin_updated_at` display once auto-set.

**Minimum USERS.2 audit improvement:** None beyond preserving existing logging + verifying remove-role creates `remove_role` row.

---

## 15. User vs Employee Boundary Review

| Question | Answer |
|---|---|
| F1: FK from employees → user_profiles? | **No** — only audit FKs (`created_by`, etc.) |
| F2: FK on user_profiles? | **No employee FK** — `employee_reference` text only |
| F3: Safest USERS.2 plan | Fix saving/displaying `employee_reference` as **reference text**; optional read-only lookup hint if code matches `employees.employee_code` (display only, no HR field copy) |
| F4: USERS.2 only fix reference? | **Yes** — primary scope |
| F5: Future `employee_id` FK? | Plan for **HR/User Integration phase** after Sameer approves HR direction |

**Future workflow (plan only, do not implement):**

1. HR creates Employee master record.
2. Admin uses "Create User from Employee" (future) — pre-fills name, company, branch, sets `employee_reference` or FK.
3. User record never re-enters visa/passport/salary/etc.

**Forbidden in USERS.2:** Any new HR columns on `user_profiles`, any sync of sensitive HR fields.

---

## 16. Confirmed Problems and Gaps

| ID | Severity | Problem | USERS.2 action |
|---|---|---|---|
| P-01 | HIGH | All-users load in `listUsers()` | Server pagination |
| P-02 | HIGH | Email not visible to admins | Admin client batch fetch |
| P-03 | HIGH | notes/employee_reference not saved | Schema + action fix |
| P-04 | HIGH | removeRoleFromUser unwired | UI + confirmation |
| P-05 | HIGH | removeRoleFromUser no last-admin guard | Extend assert guard |
| P-06 | MEDIUM | First role only in table | All roles badges |
| P-07 | MEDIUM | No role scope display | Scope labels |
| P-08 | MEDIUM | last_admin_updated_at never set | Server auto-set |
| P-09 | MEDIUM | No Security / last login | New section |
| P-10 | MEDIUM | No Suspend action / badge | UX |
| P-11 | LOW | is_assignable not filtered | Filter pickers |
| P-12 | LOW | AssignRoleDialog uses `<select>` | ERPCombobox |
| P-13 | INFO | authContext unused prop | Cleanup |
| P-14 | INFO | Audit Info em-dash encoding glitch | Fix display string |

---

## 17. Scope Classification Table: USERS.2 vs Deferred

| Item | Decision | Target |
|---|---|---|
| Server-side user pagination | **IMPLEMENT IN USERS.2** | — |
| Server-side user search | **IMPLEMENT IN USERS.2** | name, user_code, email (two-phase) |
| Status/company/branch/role filters | **IMPLEMENT IN USERS.2** | list toolbar |
| Email display for admins | **IMPLEMENT IN USERS.2** | admin client batch |
| Last login display | **IMPLEMENT IN USERS.2** | Security section |
| Fix notes save | **IMPLEMENT IN USERS.2** | — |
| Fix employee_reference save | **IMPLEMENT IN USERS.2** | reference only |
| Auto-set last_admin_updated_at | **IMPLEMENT IN USERS.2** | — |
| Remove-role UI | **IMPLEMENT IN USERS.2** | — |
| Show all assigned roles | **IMPLEMENT IN USERS.2** | table + record |
| Role scope display | **IMPLEMENT IN USERS.2** | — |
| Suspend action distinct from deactivate | **IMPLEMENT IN USERS.2** | — |
| Improved status badge styling | **IMPLEMENT IN USERS.2** | suspended = amber/orange |
| Last-admin guard review | **IMPLEMENT IN USERS.2** | + remove role path |
| is_assignable filter in assign dialog | **IMPLEMENT IN USERS.2** | — |
| ERPCombobox in assign-role dialog | **IMPLEMENT IN USERS.2** | standard compliance |
| Optional search indexes (trigram) | **IMPLEMENT IN USERS.2** | if approved in impl prompt |
| user_code numbering | DEFER | USERS.3 |
| Role clone / advanced role fields | DEFER | USERS.3 |
| assigned_at bug in role detail | DEFER | USERS.3 |
| Permission module_code normalization | DEFER | USERS.4 |
| Effective permissions view | DEFER | USERS.4 |
| Per-user audit trail tab | DEFER | USERS.5 |
| Audit log pagination/filtering | DEFER | USERS.5 |
| Login/logout event logging | DEFER | USERS.5 |
| Password reset / resend invite | DEFER | USERS.5 |
| banned_until display | DEFER | USERS.5/6 |
| MFA visibility/enforcement | DEFER | Future security |
| employee_id FK | DEFER | HR integration phase |
| Create User from Employee | DEFER | HR integration phase |
| Avatar upload | DEFER | USERS.6 |
| Manager user picker | DEFER | USERS.6 |
| Users dashboard cards | DEFER | USERS.6 |
| Status change reason field | DEFER | USERS.6 |
| Email denormalization to user_profiles | NOT RECOMMENDED | — |
| Duplicate HR data in Users | NOT RECOMMENDED | — |

---

## 18. Recommended USERS.2 Final Scope

### In scope (10 workstreams)

1. **Paginated users query** — `listUsersPaginated(params)` with `{ rows, totalCount, page, pageSize }`
2. **List UX** — server-driven pagination, search, filters (status, company, branch, role)
3. **Admin email** — batch auth metadata for current page + detail record
4. **Profile save fix** — `notes`, `employee_reference`, auto `last_admin_updated_at`
5. **Roles UX** — all roles in table; record list with scope + Remove button + AlertDialog confirm
6. **Last-admin guard** — extend to `removeRoleFromUser` when removing `system_admin`
7. **Security section** — last sign-in (and account created date optional)
8. **Status lifecycle** — Suspend action + distinct badges
9. **Assign role** — `is_assignable` filter + ERPCombobox
10. **Tests + UAT + implementation report** (future execution)

### Explicitly out of scope

USERS.3–6 features, HR module changes, DMS/Party/AI changes, new tables, employee FK, signup re-enable, RLS weakening.

---

## 19. Proposed Database / SQL Plan

**Migration filename proposal:** `20260703100000_erp_users_2_user_list_search_indexes.sql`

**Risk level:** LOW (indexes only, optional)  
**RLS impact:** None (indexes only)  
**Fresh install:** Compatible  
**Live DB:** Compatible — additive

### Draft SQL (DO NOT EXECUTE IN PLANNING)

```sql
-- ERP USERS.2 — Optional search performance indexes
-- Purpose: accelerate ILIKE / equality filters on users list
-- Risk: LOW — CONCURRENTLY recommended on production if large table

-- Already exists: idx_user_profiles_status, owner_company_id, branch_id

-- Optional: pg_trgm for name/code search (requires extension)
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CREATE INDEX IF NOT EXISTS idx_user_profiles_full_name_trgm
--   ON public.user_profiles USING gin (full_name gin_trgm_ops);

-- CREATE INDEX IF NOT EXISTS idx_user_profiles_display_name_trgm
--   ON public.user_profiles USING gin (display_name gin_trgm_ops);

-- CREATE INDEX IF NOT EXISTS idx_user_profiles_user_code_trgm
--   ON public.user_profiles USING gin (user_code gin_trgm_ops);

-- Alternative lower-risk btree for exact/prefix code lookup (if trigram deferred):
-- CREATE INDEX IF NOT EXISTS idx_user_profiles_user_code_lower
--   ON public.user_profiles (lower(user_code));
```

**Decision for implementation:** With current row count = 1, indexes are **optional**. Implement trigram indexes only if Sameer expects rapid user onboarding (>500 users) in next quarter; otherwise defer indexes until performance need proven.

**No email denormalization column. No employee_id FK. No RLS policy changes.**

### Rollback

```sql
-- DROP INDEX IF EXISTS idx_user_profiles_full_name_trgm;
-- (etc.)
```

---

## 20. Proposed Server Query Plan

### `src/server/queries/users.ts`

| Change | Detail | Risk |
|---|---|---|
| Add `ListUsersParams` type | `{ page, pageSize, search?, status?, ownerCompanyId?, branchId?, roleId? }` | Low |
| Add `listUsersPaginated()` | `.select('*', { count: 'exact' }).range(from,to)` + filters | Medium |
| Role filter | Pre-query profile IDs from `user_roles` or inner join via RPC | Medium |
| Email enrichment | After page fetch, batch admin `getUserById` → map email | Medium — server-only |
| Add `getUserAuthSecurityMetadata(authUserId)` | Returns `{ email, lastSignInAt, authCreatedAt }` redacted | Medium |
| Extend `getUserById()` | Full role assignments with `user_role_id`, scope, assigned_at | Low |
| Deprecate or wrap `listUsers()` | Keep thin wrapper calling paginated with max pageSize for backward compat OR remove and update all callers | Low |

**Search design (Answer A2/A3):**

| Field | Method |
|---|---|
| full_name, display_name | `ilike` on user_profiles |
| user_code | `ilike` or exact |
| email | Admin API lookup when search contains `@` |
| status | equality filter |
| company, branch | FK equality |
| role | subquery on user_roles.role_id |

**Return type:**

```typescript
type PaginatedUsersResult = {
  rows: UserWithRoles[];
  totalCount: number;
  page: number;
  pageSize: number;
};
```

### New file (optional)

`src/lib/users/auth-metadata.ts` — server-only helpers wrapping admin client (keeps queries clean).

---

## 21. Proposed Server Action Plan

### `src/server/actions/users.ts`

| Function | Planned change | Risk |
|---|---|---|
| `adminUpdateUserProfile` | Add notes, employee_reference to schema; merge `last_admin_updated_at: new Date().toISOString()` on success | Low |
| `removeRoleFromUser` | Before delete: if role is `system_admin`, call `assertNotLastSystemAdmin(user_profile_id)` | **High if missed** |
| Others | No change unless list revalidation paths expand | Low |

### `src/features/users/user-schema.ts`

| Schema | Change |
|---|---|
| `adminUpdateUserProfileSchema` | Add `notes: z.string().max(...).optional().nullable()`, `employee_reference: z.string().max(...).optional().nullable()` |

### `src/lib/rbac/check.ts`

No change expected. Confirm `canManageUsers` still correct for assign/remove.

### Query keys / invalidation

Add TanStack query keys if list moves to client fetch pattern:

- `src/lib/query/query-keys.ts` — `users.list(params)`, `users.detail(id)`
- `src/lib/query/invalidation.ts` — invalidate on profile/role mutations

**Alternative (recommended for minimal diff):** Keep RSC page with `searchParams` driving `listUsersPaginated` — matches existing admin list patterns, avoids new client cache layer in USERS.2.

---

## 22. Proposed UI / UX Plan

### `/admin/users` list (`users-table.tsx`, `page.tsx`)

| Element | Plan |
|---|---|
| Data source | RSC passes paginated result + searchParams |
| Pagination | Server page index + page size selector (10/25/50) |
| Search | Debounced URL search param `?q=` |
| Filters | Toolbar: Status, Company, Branch, Role → URL params |
| Columns | User (name + email subtitle), **All roles** (badge group), Organization, Branch (optional), Status, Joined, Actions |
| Email column | Dedicated column OR subtitle under name — recommend **subtitle** to save width |
| Actions | View, Edit, Assign Role, Activate, Deactivate, **Suspend**, Delete |
| Empty/loading | Standard ERP empty state |

### `/admin/users/record/[id]` (`user-workspace-form.tsx`)

| Section | Plan |
|---|---|
| Profile | Unchanged fields + fix save |
| Organization | Unchanged |
| Roles | Table/list: role name, code, **scope badge**, assigned date, **Remove** button → AlertDialog |
| **Security** (new) | Last sign-in, account email (read-only), auth user id (read-only) |
| Audit Info | Keep profile timestamps; fix encoding; show populated last_admin_updated_at |

**Standards compliance:**

- Remove role confirmation → `AlertDialog` (not ERPChildDialogForm)
- Assign role → keep `ERPChildDialogForm` + switch to `ERPCombobox`
- Save & Close → `forceCloseActiveTab()` after success (workspace rule)

### Status badge colors

| Status | Color token |
|---|---|
| active | emerald (keep) |
| inactive | slate/gray (keep) |
| suspended | amber/orange (new distinct) |

---

## 23. Proposed Role Assignment / Remove Role Plan

### Assign (existing + improvements)

1. Filter roles: `is_active && is_assignable !== false`
2. Replace `<select>` with `ERPCombobox`
3. Scope selectors unchanged (global/company/branch)

### Remove (new UI)

1. Extend `getUserById` to return `user_role_id` per assignment
2. Roles section: each row has Remove button (disabled in view mode)
3. Click Remove → `AlertDialog` confirm ("Remove role X from user Y?")
4. Call `removeRoleFromUser({ user_role_id })`
5. Server: if role_code === `system_admin`, run `assertNotLastSystemAdmin(user_profile_id)` **before** delete
6. On success: `revalidatePath`, toast, refresh record

### Scope display helper

```typescript
function formatRoleScope(ur: UserRoleAssignment, companies, branches): string {
  if (ur.branch_id) return `Branch: ${branchName}`;
  if (ur.owner_company_id) return `Company: ${companyName}`;
  return "Global";
}
```

---

## 24. Proposed Email / Last Login Display Plan

### List page

- After pagination query, collect `auth_user_id[]` for page
- Server helper with concurrency limit (e.g. 10) calls admin API
- Attach `email` to each row — **never log emails**

### Detail Security section

- Load via same helper using record's `auth_user_id`
- Display:
  - **Email** (read-only)
  - **Last sign-in** — formatted locale datetime or "Never"
  - **Auth account created** (optional)
- Do **not** display: password hash, tokens, provider identities, raw JSON

### Permissions

- View: `users.view`
- No separate permission for email — already admin-only route

---

## 25. Proposed Employee Reference Handling Plan

| Rule | Implementation |
|---|---|
| Field type | Free-text / code reference (`employee_reference`) |
| Save | Include in Zod schema + update payload |
| Display | Text input in Profile section (edit); read-only in view |
| Validation | Max length 100; optional regex `^[A-Z0-9-]+$` if codes are standardized — **keep loose in USERS.2** |
| HR link | Optional future: read-only chip "Matched employee: {name}" if code exists in `employees.employee_code` — **nice-to-have, defer if time-constrained** |
| Forbidden | Copying HR fields into user_profiles; creating `employee_id` FK |

---

## 26. Security and RLS Impact Plan

USERS.2 must **preserve all USERS.1 controls**:

| Control | USERS.2 verification |
|---|---|
| Inactive/suspended blocking | No layout/auth changes; regression UAT |
| Signup gate | No env changes |
| FORCE RLS ×8 | Post-impl SQL check |
| audit_logs_insert actor-self | No policy changes |
| Last system_admin protection | Extend to remove-role path |
| No client service-role | admin client server-only |
| No HR data duplication | Schema review gate |

**Admin client usage rules:**

- Only in server actions / RSC queries
- Guard with `hasPermission` / `canManageUsers`
- Return minimal fields
- Never expose in API routes without auth

**No new broad RLS policies.**

---

## 27. Audit Logging Impact Plan

| Mutation | Expected audit action | USERS.2 change |
|---|---|---|
| Profile update | `update` / user_profiles | Will include notes/employee_reference in diff |
| Remove role | `remove_role` / user_roles | New UI triggers existing action |
| Assign role | `assign_role` | Unchanged |
| Status change | `update` (status field in diff) | Unchanged |

No change to `logAudit()` or RLS insert policy.

Defer per-user audit **read** UI to USERS.5.

---

## 28. Backward Compatibility and Data Preservation Plan

| Area | Approach |
|---|---|
| Existing user_profiles rows | Unaffected; nullable fields remain nullable |
| listUsers() callers | Migrate `admin/users/page.tsx`; grep for other imports |
| API shape | Paginated result is additive; no breaking public API |
| Role assignments | No DB change; UI shows more data |
| USERS.1 behavior | Regression tests mandatory |
| employee_reference existing values | Preserved once save fix deployed |

---

## 29. Implementation Sequence for Future USERS.2 Execution

Recommended order (for implementation prompt):

1. **Schema fix** — `user-schema.ts` + `adminUpdateUserProfile` + unit test
2. **Last-admin guard on removeRoleFromUser**
3. **Extend getUserById role payload** + scope formatter
4. **listUsersPaginated query** + optional indexes migration
5. **Auth metadata helper** (email + last login)
6. **Users list page** — wire searchParams + table columns/filters
7. **User record** — Roles remove UI, Security section, badge fixes
8. **AssignRoleDialog** — is_assignable + ERPCombobox
9. **Users table actions** — Suspend + status badges
10. **Typecheck, build, vitest, browser UAT**
11. **Implementation report + source-of-truth update**

Estimated touch count: ~12–15 files, 1 optional migration, 0 required migrations.

---

## 30. Acceptance Criteria for Future Implementation

| ID | Criterion |
|---|---|
| AC-01 | Users list supports server-side pagination |
| AC-02 | Users list supports server-side search (name, user_code; email if in scope) |
| AC-03 | Users list supports status/company/branch/role filtering |
| AC-04 | Admin can see user email safely without exposing sensitive auth data |
| AC-05 | User profile updates persist `notes` and `employee_reference` |
| AC-06 | `last_admin_updated_at` updates on admin profile changes |
| AC-07 | User record shows all assigned roles and scopes clearly |
| AC-08 | Admin can remove a role via UI with confirmation using `removeRoleFromUser` |
| AC-09 | Last active system_admin cannot be removed/deactivated/deleted |
| AC-10 | Last login displayed in Security section for authorized admins |
| AC-11 | Active/inactive/suspended UI actions and badges are distinct and safe |
| AC-12 | Inactive/suspended users remain blocked (USERS.1 regression) |
| AC-13 | FORCE RLS remains enabled on all 8 USERS.1 tables |
| AC-14 | `/signup` remains gated by default |
| AC-15 | No HR employee data duplicated into user_profiles |
| AC-16 | Employee reference remains reference-only (no FK) |
| AC-17 | All mutations use getAuthContext/hasPermission/Zod/logAudit/revalidatePath |
| AC-18 | TypeScript, build, tests, and browser UAT pass |
| AC-19 | Implementation report created |
| AC-20 | Source-of-truth updated only after implementation |

---

## 31. Test Plan and Browser UAT Plan

### Unit / integration tests (vitest)

| Test | File (proposed) |
|---|---|
| adminUpdateUserProfile saves notes + employee_reference | `src/server/actions/users.test.ts` or extend existing |
| last_admin_updated_at set on update | same |
| assertNotLastSystemAdmin blocks remove system_admin when count=1 | same |
| listUsersPaginated respects filters | `src/server/queries/users.test.ts` |
| auth metadata helper redacts sensitive fields | `src/lib/users/auth-metadata.test.ts` |

### Browser UAT (mirror USERS.1 UAT style)

| ID | Step | Expected |
|---|---|---|
| UAT-01 | Active admin login | PASS |
| UAT-02 | `/admin/users` loads paginated list | PASS |
| UAT-03 | Pagination next/previous | PASS |
| UAT-04 | Search by name / user_code | PASS |
| UAT-05 | Search by email (if user exists) | PASS |
| UAT-06 | Filter by status/company/branch/role | PASS |
| UAT-07 | Open user record — all roles + scopes visible | PASS |
| UAT-08 | Edit notes + employee_reference → save → reload persists | PASS |
| UAT-09 | last_admin_updated_at updates | PASS |
| UAT-10 | Remove non-critical role from test user | PASS + audit row |
| UAT-11 | Attempt remove/deactivate/delete last system_admin | BLOCKED |
| UAT-12 | Security section shows last login | PASS |
| UAT-13 | Suspend vs deactivate distinct | PASS |
| UAT-14 | Signup still disabled | PASS |
| UAT-15 | Inactive/suspended user blocked | PASS (USERS.1 regression) |
| UAT-16 | FORCE RLS SQL check ×8 tables | PASS |
| UAT-17 | DMS + HR smoke routes load | PASS |
| UAT-18 | `npx tsc --noEmit`, `npm run build`, `npm test` | PASS |

Playwright: run if `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` configured; else manual UAT with note.

### SQL verification

```sql
-- FORCE RLS unchanged
SELECT relname, relforcerowsecurity FROM pg_class
WHERE relname IN ('user_profiles','roles','permissions','role_permissions',
  'user_roles','owner_companies','branches','audit_logs');

-- Audit after role removal
SELECT id, action, entity_name, entity_id, created_at
FROM audit_logs WHERE action = 'remove_role'
ORDER BY created_at DESC LIMIT 5;
```

---

## 32. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Admin API rate limits on email batch fetch | Page size cap 25; concurrency limit; cache email in RSC request only |
| Last-admin bypass via remove role | Extend assert guard before delete |
| Email search performance | Two-phase search; debounce; document limits |
| Scope creep into HR integration | Strict scope table; no employee_id |
| RLS regression | No policy changes; SQL verification in UAT |
| ERPCombobox scope creep in assign dialog | Single dialog change only |
| Breaking listUsers callers | Grep + migrate all imports |
| Accidental HR data in forms | Code review checklist AC-15 |

---

## 33. What Must Not Be Implemented in USERS.2

- Do not implement during **this planning phase**
- Do not start USERS.3, USERS.4, USERS.5, USERS.6
- Do not start HR module enhancement or employee_id FK
- Do not add AI, DMS, Party, Payroll, Reports changes (except read-only inspection)
- Do not duplicate employee HR data into Users
- Do not add salary/payroll/IBAN/medical/compliance fields to user_profiles
- Do not re-enable public signup
- Do not disable FORCE RLS or weaken inactive/suspended blocking
- Do not seed broad permissions or normalize entire permission catalog
- Do not denormalize auth email without explicit approval
- Do not implement Create User from Employee workflow

---

## 34. Draft Source-of-Truth Update Plan

**When:** Only after USERS.2 **implementation** is complete and UAT passes.

**Planned updates to `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`:**

1. Add row: `ERP USERS.2 | User Management Core | CLOSED / PASS | implementation_Review/ERP_USERS_2_USER_MANAGEMENT_CORE_IMPLEMENTATION_REPORT.md`
2. Update "Next phases" — mark USERS.2 complete; USERS.3 next
3. Note: pagination, email visibility, schema fix, remove-role UI, security tab
4. Reference browser UAT report if created

**Do not update source-of-truth during planning.**

---

## 35. Recommended Next Cursor Implementation Prompt Summary

When Sameer approves this plan, the implementation prompt should instruct:

```text
Phase: ERP USERS.2 — User Management Core (IMPLEMENTATION)

Read first:
- implementation_Review/ERP_USERS_2_USER_MANAGEMENT_CORE_PLAN.md
- implementation_Review/ERP_USERS_1_* reports
- .cursor/ALGT_ERP_SOURCE_OF_TRUTH.md

Implement exactly the "Recommended USERS.2 Final Scope" (§18):
1. listUsersPaginated + RSC searchParams wiring
2. Admin email via server-only admin client batch fetch
3. Fix adminUpdateUserProfileSchema + last_admin_updated_at
4. Remove-role UI + last-admin guard on removeRoleFromUser
5. All roles + scope display
6. Security section with last_sign_in_at
7. Suspend action + badge styling
8. is_assignable filter + ERPCombobox in assign dialog
9. Optional search indexes migration (Sameer decision)
10. Vitest + browser UAT + implementation report + SOT update

Preserve all USERS.1 security controls.
Do not implement deferred items (§17).
Do not add employee_id FK or HR duplication.
```

---

## 36. Final Recommendation

**Proceed with USERS.2 implementation** after Sameer/ChatGPT plan review.

USERS.2 is a **focused, low-schema-risk enhancement phase** that addresses confirmed production gaps (pagination, email visibility, silent field drop, unwired remove-role, security visibility) while preserving USERS.1 security closure.

**Priority order:** schema save fix and last-admin guard on role removal first (correctness/security), then paginated list (scale), then UX polish (badges, Security tab).

**No mandatory migration** for core scope. Optional trigram indexes when user volume warrants.

**Employee boundary:** Keep `employee_reference` as text reference only; plan HR integration separately.

**Decision for this planning phase:** Planning complete — await approval before any code changes.

---

*End of ERP USERS.2 User Management Core Plan*
