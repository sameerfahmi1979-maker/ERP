# ERP Users Module — Deep Audit, Understanding, and Phase Plan Report

**Date:** 2026-06-27  
**Prepared by:** Cursor AI (Senior ERP Architect / Security Reviewer)  
**Purpose:** Report-only / audit-only — no source code, UI, migration, schema, or RLS changes made.  
**Project:** ALGT ERP — `c:\dev\agt-erp`

---

## 1. Executive Summary

The ALGT ERP Users module is **substantially more implemented than the prompt's hypothetical "likely gaps" suggested**. A complete RBAC foundation exists: `user_profiles`, `roles`, `permissions`, `role_permissions`, `user_roles`, `owner_companies`, `branches`, and `audit_logs` are all live in the database with RLS enabled, appropriate policies, indexes, constraints, and SECURITY DEFINER helper functions.

A functional admin UI covers: user list, user create/invite, user edit, role assignment, role CRUD, permission matrix (role × permission checkboxes), organization CRUD, and branch CRUD. All server actions check permissions server-side via `getAuthContext()` + `hasPermission()`. Audit logging is active with 1,706 entries in the live database.

**However, six critical gaps require remediation before this module can be considered enterprise-grade:**

| # | Gap | Severity |
|---|-----|----------|
| 1 | Deactivated/suspended users are NOT blocked at login | **CRITICAL** |
| 2 | FORCE RLS is OFF on all 8 Users-module tables | **HIGH** |
| 3 | Open public signup route (`/signup`) still active | **HIGH** |
| 4 | `user_code` auto-numbering is not wired — all users have `user_code = NULL` | **MEDIUM** |
| 5 | Permission `module_code` casing is inconsistent (mixed case catalog) | **MEDIUM** |
| 6 | Zero tests for Users/Roles/Permissions/Auth/RBAC | **MEDIUM** |

Additionally, several UI/UX and functional gaps exist for USERS.2–USERS.6 scope (see §19).

---

## 2. Scope and Non-Implementation Rule

This is a **report-only phase**. No source code, UI, migrations, schema, Supabase data, RLS policies, or server actions were modified. All inspection was read-only.

Supabase MCP was used via `user-supabase` in read-only mode with SELECT-only queries. No DDL, DML, or destructive SQL was executed.

---

## 3. Files, Rules, Prompts, and Source-of-Truth Reviewed

### Source-of-Truth Files
| File | Notes |
|------|-------|
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | Primary source — 226KB, current |
| `.cursor/rules/algt-erp-source-of-truth.mdc` | Rule: always read SOT first |
| `.cursor/rules/erp-workspace-save-close-standard.mdc` | Save-and-close race condition fix |
| `.cursor/rules/erp-child-dialog-form-standard.mdc` | ERPChildDialogForm standard |
| `.cursor/rules/erp-record-workspace-form-standard.mdc` | Workspace form standard |
| `.cursor/rules/erp-workspace-tabs-standard.mdc` | Tab routing standard |
| `.cursor/rules/erp-party-master-standard.mdc` | Party master (relevant for org scoping) |
| `.cursor/rules/erp-bank-master-standard.mdc` | Bank master (FK from party_bank_details) |
| `.cursor/rules/erp-combobox-standard.mdc` | ERPCombobox for async options |
| `.cursor/rules/erp-drawer-child-dialog-blocking.mdc` | Inert wrapper pattern |
| `.cursor/rules/erp-workspace-unsaved-form-draft-standard.mdc` | Draft preservation |

### Previous Planning Files
| File | Content |
|------|---------|
| `ChatGPT/Planning File Sameer.md` | AI phases roadmap — 16 phases, all AI/DMS-focused |
| `ChatGPT/ERP_USERS_MODULE_DEEP_AUDIT_AND_PHASE_PLAN_CURSOR_PROMPT.md` | This prompt — initiates Users module audit |
| `ChatGPT/ALGT_ERP_CURSOR_APP_EXPLANATION_HANDOVER_PROMPT.md` | App-level handover; sets Users as next direction after AI closure |

### Source Code Files Inspected
| File | Purpose |
|------|---------|
| `src/lib/rbac/check.ts` | RBAC runtime: `getAuthContext`, `hasPermission`, `isGlobalAdmin`, `requirePermission` |
| `src/lib/rbac/permissions.ts` | Permission and role code constants |
| `src/lib/supabase/server.ts` | Server Supabase client (cookie-based) |
| `src/lib/supabase/admin.ts` | Service-role admin client |
| `src/lib/supabase/middleware.ts` | Session refresh + auth guard |
| `src/middleware.ts` | Next.js middleware entry point |
| `src/server/actions/users.ts` | Users server actions |
| `src/server/actions/roles.ts` | Roles server actions |
| `src/server/actions/permissions.ts` | Permissions server actions |
| `src/server/actions/organizations.ts` | Organizations server actions |
| `src/server/actions/branches.ts` | Branches server actions |
| `src/server/actions/audit.ts` | Audit logging helper |
| `src/server/queries/users.ts` | User queries (`listUsers`, `getUserById`) |
| `src/server/queries/roles.ts` | Role queries |
| `src/server/queries/permissions.ts` | Permission queries |
| `src/features/users/users-table.tsx` | User list table |
| `src/features/users/user-workspace-form.tsx` | User add/edit/view workspace form |
| `src/features/users/user-schema.ts` | User Zod schemas |
| `src/features/users/assign-role-dialog.tsx` | Role assignment child dialog |
| `src/features/users/add-user-dialog.tsx` | Add user button (routes to /record/new) |
| `src/features/roles/roles-table.tsx` | Role list table |
| `src/features/roles/role-workspace-form.tsx` | Role add/edit/view workspace form |
| `src/features/roles/role-schema.ts` | Role Zod schemas |
| `src/features/roles/role-detail-drawer.tsx` | Role detail drawer with assigned users |
| `src/features/roles/add-role-button.tsx` | Add role button |
| `src/features/roles/permissions-table.tsx` | Legacy permissions table (uses old DataTable) |
| `src/features/permissions/permissions-matrix.tsx` | Role × permission matrix UI |
| `src/features/auth/login-form.tsx` | Login form (Supabase Auth) |
| `src/features/auth/signup-form.tsx` | Signup form (public — risk) |
| `src/features/auth/actions.ts` | signOut action |
| `src/app/(auth)/login/page.tsx` | Login page |
| `src/app/(auth)/signup/page.tsx` | Signup page |
| `src/app/(protected)/admin/users/page.tsx` | Users list page |
| `src/app/(protected)/admin/users/record/new/page.tsx` | New user page |
| `src/app/(protected)/admin/users/record/[id]/page.tsx` | User record page |
| `src/app/(protected)/admin/roles/page.tsx` | Roles list page |
| `src/app/(protected)/admin/roles/record/new/page.tsx` | New role page |
| `src/app/(protected)/admin/roles/record/[id]/page.tsx` | Role record page |
| `src/app/(protected)/admin/permissions/page.tsx` | Permissions matrix page |
| `src/app/(protected)/admin/audit/page.tsx` | Audit logs page |
| `src/app/(protected)/profile/page.tsx` | Self-service profile page (read-only) |
| `src/components/layout/app-sidebar.tsx` | Navigation sidebar |
| `src/types/database.ts` | TypeScript types: UserProfile, Role, Permission, etc. |

### Migration Files Reviewed
| File | Content |
|------|---------|
| `supabase/migrations/20260527120000_erp_base_foundation.sql` | Core schema: all 8 tables, RLS, policies, SECURITY DEFINER functions, seed data |
| `supabase/migrations/20260527160443_erp_base_002d_admin_master_data_hardening.sql` | Phase 002D: +6 cols to user_profiles, +5 to roles, +4 to permissions, UAE compliance cols |
| `supabase/migrations/20260616180000_erp_common_ai_0_governance_feature_flags_permissions.sql` | AI permissions added (AI module codes) |
| `supabase/migrations/20260620120000_erp_hr_4_leave_rls_read_manage_permission.sql` | HR leave permissions |

---

## 4. Previous ChatGPT / Cursor Prompt Findings

| File | What it Requested | Users/Roles/Permissions Impact | Status |
|------|-------------------|-------------------------------|--------|
| `ChatGPT/Planning File Sameer.md` | AI roadmap — phases 0–15, deferred HR AI, Fleet AI etc. | No Users module content | Not applicable |
| `ChatGPT/ALGT_ERP_CURSOR_APP_EXPLANATION_HANDOVER_PROMPT.md` | App explanation/handover; identifies Users enhancement as next priority after AI closure | States: "User creation missing or weak", "Roles/Permissions CRUD weak", "Add/edit/delete roles pending" — now disproved by code inspection | Partially stale; core CRUD actually exists |
| `ChatGPT/ERP_USERS_MODULE_DEEP_AUDIT_AND_PHASE_PLAN_CURSOR_PROMPT.md` | This audit prompt | Defines USERS.0–USERS.7 phase structure | Initiating — this report is USERS.0 |

**Key correction from handover prompt assumptions:**
- "User creation missing or weak" → **INCORRECT** — `createUser` action exists with invite email, temporary password, role assignment, and audit logging
- "Roles/Permissions CRUD weak" → **INCORRECT** — full CRUD with system-role protection exists
- "Add/edit/delete roles pending" → **INCORRECT** — fully implemented
- "Role assignment incomplete" → **CONFIRMED PARTIAL** — assign exists; remove from record view is unclear
- "Users per role view missing" → **CONFIRMED PARTIAL** — `RoleDetailDrawer` shows assigned users; not a standalone table view

---

## 5. Supabase MCP / Database Review Method

**Connection:** `user-supabase` MCP → `https://mmiefuieduzdiiwnqpie.supabase.co`  
**Method:** Read-only SELECT queries via `execute_sql` tool  
**Queries executed:** information_schema.columns, pg_policies, pg_class (RLS/FORCE RLS), pg_indexes, pg_constraint, information_schema.triggers, row counts, auth.users join  
**No destructive SQL executed.**

---

## 6. Current Users Module Architecture

### Overall Architecture Pattern
```
auth.users (Supabase Auth — UUID PK)
    │
    │  ON DELETE CASCADE
    ▼
user_profiles (BIGINT PK — ERP identity)
    │
    ├── owner_company_id → owner_companies (BIGINT PK)
    │       └── branches (BIGINT PK, FK → owner_companies)
    │               └── branch_id on user_profiles
    │
    └── user_roles (BIGINT PK)
            ├── role_id → roles (BIGINT PK)
            │       └── role_permissions → permissions (BIGINT PK)
            ├── owner_company_id (scope: nullable = global)
            └── branch_id (scope: nullable = global/company-only)
```

### Stack
- **Frontend:** Next.js App Router, TypeScript, TanStack Table, shadcn/ui, React Hook Form, Zod
- **Backend:** Next.js Server Actions (no REST API layer), Supabase PostgreSQL
- **Auth:** Supabase Auth (`@supabase/ssr`) — session via httpOnly cookies
- **RBAC:** Custom role-based access check in `src/lib/rbac/check.ts`
- **DB Identifiers:** BIGINT PK/FK throughout; UUID only for `auth_user_id` (FK to `auth.users`)

---

## 7. Current Routes and Navigation Audit

| Route | File | Purpose | Access Control | In Sidebar | Status |
|-------|------|---------|----------------|------------|--------|
| `/login` | `(auth)/login/page.tsx` | Email/password login | Public | No | CONFIRMED IMPLEMENTED |
| `/signup` | `(auth)/signup/page.tsx` | Self-registration | **Public — no restriction** | No | **RISK: should be invite-only in production** |
| `/forgot-password` | `(auth)/forgot-password/page.tsx` | Password reset request | Public | No | CONFIRMED IMPLEMENTED |
| `/reset-password` | `(auth)/reset-password/page.tsx` | Set new password | Public (token link) | No | CONFIRMED IMPLEMENTED |
| `/profile` | `(protected)/profile/page.tsx` | Self-service read-only profile | Authenticated | No | CONFIRMED IMPLEMENTED (read-only only) |
| `/admin/users` | `admin/users/page.tsx` | User list | `users.view` | Yes (Administration) | CONFIRMED IMPLEMENTED |
| `/admin/users/record/new` | `admin/users/record/new/page.tsx` | Create user | `users.manage` | No (via button) | CONFIRMED IMPLEMENTED |
| `/admin/users/record/[id]` | `admin/users/record/[id]/page.tsx` | View/edit user | `users.view` / `users.manage` | No (row click) | CONFIRMED IMPLEMENTED |
| `/admin/roles` | `admin/roles/page.tsx` | Role list | `roles.view` | Yes (Administration) | CONFIRMED IMPLEMENTED |
| `/admin/roles/record/new` | via `add-role-button.tsx` | Create role | `roles.manage` | No | CONFIRMED IMPLEMENTED |
| `/admin/roles/record/[id]` | `admin/roles/record/[id]/page.tsx` | View/edit role | `roles.view` / `roles.edit` ← **bug** | No (row click) | CONFIRMED PARTIAL (see bug) |
| `/admin/permissions` | `admin/permissions/page.tsx` | Role × permission matrix | `permissions.view` | Yes (Administration) | CONFIRMED IMPLEMENTED |
| `/admin/organizations` | `admin/organizations/page.tsx` | Organizations CRUD | `organizations.view` | Yes (Administration) | CONFIRMED IMPLEMENTED |
| `/admin/branches` | `admin/branches/page.tsx` | Branches CRUD | `branches.view` | Yes (Administration) | CONFIRMED IMPLEMENTED |
| `/admin/audit` | `admin/audit/page.tsx` | Audit log viewer | `audit.view` | Yes (Administration) | CONFIRMED IMPLEMENTED (limited to last 200 entries) |
| `/admin/settings/numbering` | numbering page | Numbering rules CRUD | Admin | Yes (Administration) | CONFIRMED IMPLEMENTED |

**Navigation gap:** No `/admin/users/dashboard`, `/admin/security`, or Users-specific hub exists. Users/Roles/Permissions/Organizations/Branches/Audit are flat direct links under "Administration" in the sidebar.

---

## 8. Current Database Schema Audit

### `public.user_profiles`
| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | bigint (PK) | NO | BIGINT identity ✓ |
| `auth_user_id` | uuid (UNIQUE, FK→auth.users CASCADE) | NO | External auth reference ✓ |
| `user_code` | text (UNIQUE) | YES | Auto-number not wired — **always NULL** |
| `full_name` | text | YES | |
| `display_name` | text | YES | |
| `phone` | text | YES | |
| `job_title` | text | YES | |
| `department` | text | YES | Free-text; not FK to departments table |
| `owner_company_id` | bigint (FK→owner_companies SET NULL) | YES | Single company assignment |
| `branch_id` | bigint (FK→branches SET NULL) | YES | Single branch assignment |
| `status` | text | NO | CHECK: active/inactive/suspended |
| `avatar_url` | text | YES | Not surfaced in edit UI |
| `employee_reference` | text | YES | HR link field (not FK) |
| `manager_user_profile_id` | bigint (FK→user_profiles SET NULL) | YES | Not shown in UI |
| `preferred_language` | text | YES | Default 'en' |
| `timezone` | text | YES | Default 'Asia/Dubai' |
| `last_admin_updated_at` | timestamptz | YES | Not set by `adminUpdateUserProfile` |
| `notes` | text | YES | Form sends it but schema doesn't declare in schema type |
| `created_at` | timestamptz | NO | |
| `updated_at` | timestamptz | NO | Trigger: `set_updated_at()` |

**Gaps:**  
- `user_code` is UNIQUE + nullable but never populated (no numbering rule exists for users)
- `email` is NOT in `user_profiles` — only in `auth.users` — email display in user list only works for the current signed-in user
- `department` is free-text, not linked to `departments` table (no FK)
- `manager_user_profile_id` column exists but is invisible in the UI
- `last_admin_updated_at` is not updated by the `adminUpdateUserProfile` action
- `adminUpdateUserProfileSchema` does not include `notes` or `employee_reference` but the form sends them — **mismatch: these fields are silently dropped**

### `public.roles`
| Column | Type | Notes |
|--------|------|-------|
| `id` | bigint (PK) | BIGINT identity ✓ |
| `role_code` | text (UNIQUE) | lowercase snake_case enforced by schema |
| `role_name` | text | |
| `description` | text | |
| `is_system_role` | boolean | Default TRUE — all 17 seeded roles are system roles |
| `is_active` | boolean | Default TRUE |
| `display_name` | text | Phase 002D addition — not shown in role form |
| `role_category` | text | Phase 002D addition — not shown in role form |
| `role_level` | text | Phase 002D addition — not shown in role form |
| `is_assignable` | boolean | Phase 002D addition — not used in UI filtering |
| `notes` | text | Phase 002D addition — not shown in role form |
| `created_at`, `updated_at` | timestamptz | Trigger: `set_updated_at()` |

**Live data (17 roles):** system_admin, group_admin, company_admin, branch_admin, hr_manager, fleet_manager, workshop_manager, operations_manager, rental_manager, hse_manager, finance_manager, procurement_manager, inventory_manager, dms_manager, employee_self_service, read_only_user, **test_role** (is_system_role=true — should be custom/false).

**Gap:** All 17 seeded roles have `is_system_role = true` — including `test_role`. No custom roles have been created. The `is_assignable` flag exists but is not respected in the `AssignRoleDialog` filter (which only filters `is_active`).

### `public.permissions`
| Column | Type | Notes |
|--------|------|-------|
| `id` | bigint (PK) | |
| `permission_code` | text (UNIQUE) | |
| `permission_name` | text | |
| `module_code` | text | **INCONSISTENT CASING** — see below |
| `action_code` | text | |
| `description` | text | |
| `is_active` | boolean | |
| `display_name` | text | Phase 002D — not populated for seeded perms |
| `is_system_permission` | boolean | Phase 002D |
| `is_visible` | boolean | Phase 002D |
| `sort_order` | integer | Phase 002D |

**Live data — 255 permissions across 30 module codes with INCONSISTENT CASING:**
| Case | Modules | Count |
|------|---------|-------|
| Uppercase | AI (33), DMS (58), HR (35), MASTER_DATA (24), REPORTS (11), SETTINGS (11), NOTIFICATIONS (10), COMMON_MD (18), PARTIES (4) | ~204 |
| lowercase | users (4), roles (2), permissions (2), organizations (2), branches (2), audit (1), dashboard (1), erp (1), hse (1), fleet (1), hr (1 duplicate!), dms (1 duplicate!), finance (1), inventory (1), master_data (19 duplicate!), numbering (5), operations (1), procurement (1), rental (1), settings (2 duplicate!), workshop (1) | ~51 |

**Critical issue:** `hr` and `HR` both exist, `dms` and `DMS` both exist, `master_data` and `MASTER_DATA` both exist, `settings` and `SETTINGS` both exist. This breaks `hasPermission()` checks — `hr.view` and `HR.view` are different permission codes. The Permissions Matrix groups by `module_code` with raw case, resulting in duplicate module sections in the UI.

### `public.user_roles`
| Column | Type | Notes |
|--------|------|-------|
| `id` | bigint (PK) | |
| `user_profile_id` | bigint (FK→user_profiles CASCADE) | |
| `role_id` | bigint (FK→roles CASCADE) | |
| `owner_company_id` | bigint (FK→owner_companies CASCADE, nullable) | NULL = global scope |
| `branch_id` | bigint (FK→branches CASCADE, nullable) | NULL = company or global scope |
| `is_active` | boolean | |
| `assigned_at` | timestamptz | Note: field used in queries as `created_at` — mismatch |
| `assigned_by` | bigint (FK→user_profiles SET NULL) | Set by `assignRoleToUser` ✓ |

**Constraint:** `UNIQUE NULLS NOT DISTINCT (user_profile_id, role_id, owner_company_id, branch_id)` — prevents duplicate scoped assignments.

**Live data:** 1 user (id=1) with `system_admin` role, global scope (both owner_company_id and branch_id are NULL).

**Bug:** `getRoleWithUsers` and `getRoleWithUsersAction` select `id, user_profile_id, owner_company_id, branch_id, is_active, created_at` from `user_roles`, but the column is named `assigned_at` (not `created_at`). This will produce NULL for `assigned_at` in the drawer.

### `public.role_permissions`
- 4 columns: id, role_id, permission_id, created_at
- 655 role-permission assignments in live DB
- `system_admin` has all 255 permissions
- Cascade deletes on both FKs ✓

### `public.audit_logs`
- 1,706 entries in live DB — active
- Captures: actor, owner_company_id, branch_id, module_code, entity_name, entity_id, entity_reference, action, old_values (JSONB), new_values (JSONB), ip_address, user_agent
- No `updated_at` column — append-only ✓
- Trigger `trg_audit_logs_validate_scope` validates branch/company consistency ✓
- **Gap:** Audit logs page only shows last 200 entries, no pagination or server-side filtering by module/actor/date range
- **Gap:** No audit log search/filter UI

### `public.owner_companies`
- 2 companies in live DB
- Full UAE compliance fields present (Phase 002D)
- Full CRUD implemented with status lifecycle ✓

### `public.branches`
- 1 branch in live DB
- Full operational fields present (Phase 002D)
- Full CRUD implemented with status lifecycle ✓

---

## 9. Current Supabase Auth Integration Audit

| Feature | Status | Evidence |
|---------|--------|---------|
| Login flow | CONFIRMED IMPLEMENTED | `login-form.tsx` → `supabase.auth.signInWithPassword()` |
| Session handling | CONFIRMED IMPLEMENTED | `@supabase/ssr` + cookie-based in `middleware.ts` |
| Auth client (client-side) | CONFIRMED IMPLEMENTED | `src/lib/supabase/client.ts` |
| Auth server (server-side) | CONFIRMED IMPLEMENTED | `src/lib/supabase/server.ts` |
| Auth admin (service-role) | CONFIRMED IMPLEMENTED | `src/lib/supabase/admin.ts` — used for user creation/deletion |
| auth.users → user_profiles mapping | CONFIRMED IMPLEMENTED | `auth_user_id UUID UNIQUE FK` + bootstrap trigger `handle_new_auth_user()` |
| UUID isolation (auth) vs BIGINT (ERP) | CONFIRMED CORRECT | `auth.users.id` is UUID; `user_profiles.id` is BIGINT — properly isolated |
| Email uniqueness | CONFIRMED — via `auth.users` unique constraint | email not stored in `user_profiles` |
| User status enforced at login | **CONFIRMED MISSING** | **CRITICAL GAP**: `signInWithPassword()` succeeds for `status='inactive'` or `'suspended'` users — no post-login status check anywhere in codebase |
| User invite flow | CONFIRMED IMPLEMENTED | `createUser()` with `generateLink({type:'invite'})` + Microsoft Graph email |
| Temporary password flow | CONFIRMED IMPLEMENTED | `createUser()` with `createUser({email_confirm:true})` |
| Auth trigger on new user | CONFIRMED IMPLEMENTED | `on_auth_user_created` trigger → `handle_new_auth_user()` upserts user_profiles |
| Password reset | CONFIRMED IMPLEMENTED | `forgot-password-form.tsx` exists |
| Open signup page | **CONFIRMED RISK** | `/signup` is publicly accessible with no admin gate; signup form itself warns "For production, disable open signup" |
| MFA/2FA | NOT IN USE | 0 MFA factors in live DB; no enforcement code |
| Session persistence check | Partial | Middleware checks `getUser()` but does NOT verify `user_profiles.status` |
| Redirect on login | CONFIRMED — always to `/dashboard` | `window.location.href = "/dashboard"` — prevents cross-user data exposure (Phase 002F.3C.4A.2 comment) |
| Deactivated users blocked | **CONFIRMED MISSING** | No RLS policy, middleware check, or getAuthContext check for status; banned_until is null for all |

### Critical Security Note — Inactive/Suspended User Login
The login flow calls `supabase.auth.signInWithPassword()` on the client. Supabase Auth only validates the password; it does not query `user_profiles.status`. Once logged in, `getAuthContext()` in server actions reads the `user_profiles` row and returns `profile.status` — but **no code checks `profile.status !== 'active'` and blocks the request**. A deactivated user retains full access until the auth session expires.

---

## 10. Current RBAC / Permissions Audit

### Runtime Check: `src/lib/rbac/check.ts`
```
getAuthContext() →
  auth.getUser()                         ← validates JWT session
  → user_profiles WHERE auth_user_id     ← resolves BIGINT profile
  → user_roles WHERE user_profile_id AND is_active=true
  → role_permissions WHERE role_id IN (...)
  → permissions WHERE id IN (...)
  → returns {profile, roleCodes, permissionCodes}
```

| Feature | Status | Notes |
|---------|--------|-------|
| Server-side permission check | CONFIRMED IMPLEMENTED | All server actions call `getAuthContext()` + `hasPermission()` |
| Global admin bypass | CONFIRMED IMPLEMENTED | `system_admin` and `group_admin` bypass all permission checks |
| `hasPermission()` function | CONFIRMED IMPLEMENTED | Checks permissionCodes OR roleCodes includes system_admin/group_admin |
| `isGlobalAdmin()` function | CONFIRMED IMPLEMENTED | |
| `requirePermission()` / `requireAdmin()` | CONFIRMED IMPLEMENTED | Throws "Forbidden" if not authorized |
| Route guards | CONFIRMED PARTIAL | Page-level permission checks exist; no middleware-level route guard (only session-presence checked at middleware) |
| System role protection (delete) | CONFIRMED IMPLEMENTED | `deleteRole()` returns error if `is_system_role=true` |
| System role protection (update) | CONFIRMED PARTIAL | `updateRole()` checks `is_system_role && !hasPermission(system.admin)` — but `system.admin` permission code does not exist in the permission catalog (should be `erp.admin`) |
| Permission: users.manage vs users.create | **CONFIRMED BUG** | The `/admin/users/record/new` page guards with `users.manage`, but the action uses `users.manage`, and the constants define separate `users.create`, `users.update`, `users.delete` codes. The `listUsers()` query has no permission check (no server action wrapper). |
| Role edit page permission | **CONFIRMED BUG** | `/admin/roles/record/[id]/page.tsx` checks `roles.edit` for edit mode — but `roles.edit` does NOT exist in the permission catalog. Only `roles.manage` exists. Edit mode is therefore never granted to anyone except system_admin/group_admin. |
| Self-escalation prevention | CONFIRMED PARTIAL | `current_user_can_manage_user_role_assignment()` DB function prevents non-admins from assigning system_admin/group_admin or global-scope roles — but this is NOT enforced in the server action `assignRoleToUser()` directly, only at the RLS level |
| Last-admin protection | **CONFIRMED MISSING** | No code prevents deactivating/deleting the last system_admin user |
| Permission naming consistency | **CONFIRMED GAP** | `module_code` casing is inconsistent (see §8) — breaks permission matrix grouping |

### Defined Permission Codes (constants in `src/lib/rbac/permissions.ts`)
```
users.view, users.create, users.update, users.delete
roles.view, roles.manage
permissions.view, permissions.manage
organizations.view, organizations.manage
branches.view, branches.manage
audit.view
dashboard.view
erp.admin
settings.view, settings.manage
```
**Note:** `users.manage` is used in server actions but is NOT in the `PERMISSIONS` constants. It resolves to a runtime string check. This is inconsistent with the rest of the defined constants.

### RBAC Performance Note
`getAuthContext()` makes 3 sequential DB queries per server action call:
1. `auth.getUser()` — JWT validation
2. `user_profiles WHERE auth_user_id`
3. `user_roles + roles JOIN` (active roles)
4. `role_permissions + permissions IN (roleIds)`

This is called for **every server action**. No caching mechanism exists. For a user with many roles and permissions (e.g. `system_admin` with 255 permissions), query 4 fetches all 255 rows. This is acceptable for current single-user pre-production but will need optimization for multi-user load.

---

## 11. Current Users CRUD and Lifecycle Audit

| Capability | Status | Evidence |
|-----------|--------|---------|
| View all users | CONFIRMED IMPLEMENTED | `listUsers()` in `/admin/users` |
| Search/filter users | CONFIRMED PARTIAL | Client-side text search via TanStack Table only; no server-side search |
| Pagination | CONFIRMED PARTIAL | TanStack Table client-side pagination; all users loaded at once |
| Sort by column | CONFIRMED IMPLEMENTED | TanStack Table sorting ✓ |
| Create user (invite email) | CONFIRMED IMPLEMENTED | `createUser()` with Microsoft Graph email ✓ |
| Create user (temp password) | CONFIRMED IMPLEMENTED | `createUser()` with `email_confirm:true` ✓ |
| Edit user profile | CONFIRMED PARTIAL | `adminUpdateUserProfile()` — but does NOT update `notes`, `employee_reference` (schema mismatch) |
| Assign organization | CONFIRMED IMPLEMENTED | In `UserWorkspaceForm` edit/add mode ✓ |
| Assign branch | CONFIRMED IMPLEMENTED | In `UserWorkspaceForm` — cascades on company selection ✓ |
| Assign role | CONFIRMED IMPLEMENTED | `AssignRoleDialog` with scope selection ✓ |
| Remove role from user | CONFIRMED PARTIAL | `removeRoleFromUser()` server action exists but is not exposed in the UI on the user record form (no "remove" button visible in the Roles section) |
| Activate user | CONFIRMED IMPLEMENTED | `adminUpdateUserProfile({status:'active'})` from table dropdown ✓ |
| Deactivate user | CONFIRMED IMPLEMENTED | `adminUpdateUserProfile({status:'inactive'})` from table dropdown ✓ |
| Suspend user | CONFIRMED PARTIAL | Status value `suspended` exists in schema and dropdown but the table only shows "Deactivate" (→ inactive); no dedicated "Suspend" action |
| View last login | NOT FOUND | `auth.users.last_sign_in_at` exists in DB but is not surfaced in the UI |
| View user status | CONFIRMED IMPLEMENTED | Badge in users table ✓ |
| View audit history per user | NOT FOUND | No per-user audit tab; audit logs page is global |
| Delete user | CONFIRMED IMPLEMENTED | `deleteUser()` — cascades auth.users deletion → profile deletion ✓ |
| Self-delete protection | CONFIRMED IMPLEMENTED | `if (ctx.profile?.id === userProfileId) return error` ✓ |
| Auto-assign `user_code` | CONFIRMED MISSING | No numbering rule for user_profiles; `user_code` is always NULL for new users |
| Email display in list | CONFIRMED PARTIAL | `listUsers()` only returns email for the current signed-in user (`auth_user_id === currentUser.id`) — all other users show email as null |
| Status lifecycle at login | CONFIRMED MISSING | (see §9) |

---

## 12. Current Organization / Branch Scope Audit

| Feature | Status | Evidence |
|---------|--------|---------|
| User belongs to one organization | CONFIRMED — single FK | `user_profiles.owner_company_id` — not a multi-company pivot table |
| User belongs to one branch | CONFIRMED — single FK | `user_profiles.branch_id` |
| Primary organization concept | CONFIRMED — single assignment only | No "primary" concept needed; single FK |
| Primary branch concept | CONFIRMED — single assignment only | |
| Role scoped to global | CONFIRMED IMPLEMENTED | `user_roles.owner_company_id=NULL AND branch_id=NULL` |
| Role scoped to company | CONFIRMED IMPLEMENTED | `user_roles.owner_company_id=X, branch_id=NULL` |
| Role scoped to branch | CONFIRMED IMPLEMENTED | `user_roles.owner_company_id=X, branch_id=Y` |
| Cross-company data access | CONFIRMED SAFE | Global admins (system_admin, group_admin) bypass; scoped admins restricted via RLS helper functions |
| `owner_company_id` in RLS | CONFIRMED IMPLEMENTED | RLS policies on all tables use `current_user_has_permission_in_company()` |
| Branch scope consistency | CONFIRMED IMPLEMENTED | `validate_user_role_scope()` trigger ensures branch FK is valid for company |
| Multi-company admin management | CONFIRMED IMPLEMENTED | `current_user_can_manage_user_role_assignment()` PLPGSQL function with full scope logic |
| Organization activate/deactivate/suspend | CONFIRMED IMPLEMENTED | `updateOrganizationStatus()` ✓ |
| Branch activate/deactivate/suspend | CONFIRMED PARTIAL | `updateBranchStatus()` exists but only active/inactive/suspended — `operating_status` field (active/maintenance/suspended/closed) is separate |

---

## 13. Current UI / UX Audit

### Users Page (`/admin/users`)
| Feature | Status | Notes |
|---------|--------|-------|
| Page layout | CONFIRMED IMPLEMENTED | `ERPPageHeader` + `ERPSectionCard` + `ERPDataTable` ✓ |
| Table standards | CONFIRMED IMPLEMENTED | TanStack Table with `ERPDataTable` ✓ |
| Avatar initials | CONFIRMED IMPLEMENTED | ✓ |
| Role badge per user | CONFIRMED PARTIAL | Only primary role shown (index 0); multi-role users show only first role |
| Organization column | CONFIRMED IMPLEMENTED | ✓ |
| Status badge | CONFIRMED IMPLEMENTED | Green for active, grey for inactive ✓ |
| Joined date column | CONFIRMED IMPLEMENTED | Formatted date ✓ |
| Email column | CONFIRMED MISSING | Email not shown in table (only visible for self) |
| Search | CONFIRMED PARTIAL | Client-side only, via TanStack Table |
| Filter by status | CONFIRMED PARTIAL | Column filter available via TanStack Table; not a prominent status filter chip |
| Filter by organization | NOT FOUND | No org filter |
| Pagination | CONFIRMED PARTIAL | Client-side; initial page size 25 ✓ |
| Actions menu | CONFIRMED IMPLEMENTED | View, Edit, Assign Role, Activate/Deactivate, Delete ✓ |
| Export | CONFIRMED IMPLEMENTED | `ERPExportMenu` via `exportConfig` prop ✓ |
| Empty state message | CONFIRMED IMPLEMENTED | "No users found. Sign up and run admin bootstrap after migration." |
| Loading state | NOT FOUND | No skeleton loader on the list page |
| Delete confirmation | CONFIRMED IMPLEMENTED | `AlertDialog` ✓ |
| "Suspended" status badge | CONFIRMED PARTIAL | `users-table.tsx` only styles active/inactive; suspended would show as grey "secondary" with no distinct color |
| Last login display | NOT FOUND | |

### User Record Form (`/admin/users/record/[id]`)
| Feature | Status | Notes |
|---------|--------|-------|
| Workspace form | CONFIRMED IMPLEMENTED | `ERPRecordWorkspaceForm` with sections ✓ |
| Sections (edit) | CONFIRMED IMPLEMENTED | Profile Details, Organization, Roles, Audit Info ✓ |
| Sections (add) | CONFIRMED IMPLEMENTED | Authentication, Profile Details, Organization, Initial Role ✓ |
| Draft preservation | CONFIRMED IMPLEMENTED | `useWorkspaceFormDraft` ✓ (password fields excluded from denylist) |
| Dirty guard | CONFIRMED IMPLEMENTED | `useFormDirty` + workspace `markDirty` ✓ |
| Save-and-Close | CONFIRMED IMPLEMENTED | `forceCloseActiveTab()` ✓ |
| Role assignment from record | CONFIRMED PARTIAL | "Assign Role" button opens `AssignRoleDialog` ✓; no "Remove Role" button from this view |
| Remove role from UI | CONFIRMED MISSING | `removeRoleFromUser()` action exists but is not wired to any UI element |
| Manager field | CONFIRMED MISSING | `manager_user_profile_id` column exists but not shown |
| Avatar upload | CONFIRMED MISSING | `avatar_url` column exists; no upload UI |
| Last login display | CONFIRMED MISSING | |
| `notes` and `employee_reference` | CONFIRMED BUG | Form sends these fields; `adminUpdateUserProfileSchema` does not include them → silently dropped |

### Roles Page (`/admin/roles`)
| Feature | Status | Notes |
|---------|--------|-------|
| Table with role name, code, type badge, status badge | CONFIRMED IMPLEMENTED | ✓ |
| Activate/Deactivate from table | CONFIRMED IMPLEMENTED | `updateRoleStatus()` ✓ |
| Delete from table | CONFIRMED IMPLEMENTED | With system-role protection ✓ |
| Role detail drawer | CONFIRMED IMPLEMENTED | `RoleDetailDrawer` with Details + Assigned Users tabs ✓ |
| Assigned users per role | CONFIRMED PARTIAL | Shows via drawer; uses `assigned_at` → `created_at` field name bug (will show null) |
| Permissions per role | CONFIRMED MISSING | Role detail drawer does NOT show which permissions are assigned to the role |
| Clone role | CONFIRMED MISSING | |
| Role category/level fields | CONFIRMED MISSING | Fields exist in DB (Phase 002D) but not shown in `RoleWorkspaceForm` |

### Permissions Matrix (`/admin/permissions`)
| Feature | Status | Notes |
|---------|--------|-------|
| Matrix table: permission × role | CONFIRMED IMPLEMENTED | Checkbox grid ✓ |
| Group by module | CONFIRMED PARTIAL | Groups by `module_code` — but casing inconsistency creates 30 groups instead of ~15 |
| Toggle permission per role | CONFIRMED IMPLEMENTED | Live assign/remove with optimistic toast ✓ |
| Export permissions list | CONFIRMED IMPLEMENTED | `ERPExportMenu` ✓ |
| Permission edit (name/description) | CONFIRMED MISSING | No permission edit UI |
| Add new permission | CONFIRMED MISSING | No permission create UI (permissions are seeded via migrations) |
| Effective permissions per user | CONFIRMED MISSING | No "what can user X do?" view |

---

## 14. Current Security / RLS Audit

### RLS Status (Live DB)
| Table | RLS Enabled | FORCE RLS | Risk |
|-------|-------------|-----------|------|
| `user_profiles` | ✅ YES | ❌ NO | Table owner can bypass RLS |
| `roles` | ✅ YES | ❌ NO | Table owner can bypass RLS |
| `permissions` | ✅ YES | ❌ NO | Table owner can bypass RLS |
| `role_permissions` | ✅ YES | ❌ NO | Table owner can bypass RLS |
| `user_roles` | ✅ YES | ❌ NO | Table owner can bypass RLS |
| `owner_companies` | ✅ YES | ❌ NO | Table owner can bypass RLS |
| `branches` | ✅ YES | ❌ NO | Table owner can bypass RLS |
| `audit_logs` | ✅ YES | ❌ NO | Table owner can bypass RLS |

**All 8 tables have FORCE RLS disabled.** This means the Postgres table owner role (typically `postgres` / service-role) bypasses RLS entirely. Since Supabase's service-role key (used by `createAdminClient()`) runs as `postgres`, all `adminClient` queries bypass RLS — this is intentional for admin operations (user creation, deletion) but means a compromised service-role key would have unrestricted access.

### RLS Policies Summary (Verified in Live DB)
| Table | Policy Pattern | Notes |
|-------|---------------|-------|
| `user_profiles` | Own row SELECT + scoped SELECT/INSERT/UPDATE/DELETE via permission checks | 5 policies ✓ |
| `user_roles` | Own rows SELECT + scoped SELECT + managed INSERT/UPDATE/DELETE | 3 policies ✓ — manage policy uses `current_user_can_manage_user_role_assignment()` |
| `roles` | `any_scope` SELECT + global manage | 2 policies ✓ |
| `permissions` | `any_scope` SELECT + global manage | 2 policies ✓ |
| `role_permissions` | `any_scope` SELECT + global manage | 2 policies ✓ |
| `owner_companies` | Scoped SELECT + scoped manage | 2 policies ✓ |
| `branches` | Scoped SELECT + scoped manage | 2 policies ✓ |
| `audit_logs` | Scoped SELECT + scoped INSERT | 2 policies ✓ |

**Notable policies:** `audit_logs_insert` requires `audit.view` permission — this means a user without `audit.view` cannot insert audit logs from client-side actions. Since `logAudit()` runs via server actions using the regular client (not admin client), it would fail silently for users without `audit.view`. The `system_admin` has all permissions so this is fine currently, but future non-admin users performing audited actions (e.g. DMS upload) may silently drop audit entries.

### Server Action Authorization
| Action | Check | Method |
|--------|-------|--------|
| `createUser` | `users.manage` | `getAuthContext()` + `hasPermission()` ✓ |
| `adminUpdateUserProfile` | `users.manage` | ✓ |
| `assignRoleToUser` | `users.manage` | ✓ |
| `removeRoleFromUser` | `users.manage` | ✓ |
| `deleteUser` | `users.manage` | ✓ |
| `createRole` | `roles.manage` | ✓ |
| `updateRole` | `roles.manage` + system_admin for system roles | ✓ |
| `deleteRole` | `roles.manage` + system-role block | ✓ |
| `updateRoleStatus` | `roles.manage` | ✓ |
| `assignPermissionToRole` | `roles.manage` | ✓ |
| `removePermissionFromRole` | `roles.manage` | ✓ |
| `listUsers()` (query) | No server-side permission check | **GAP** — used directly in Server Components without explicit check; relies on RLS |
| `listRoles()` (query) | No server-side permission check | Relies on RLS |
| `listPermissions()` (query) | No server-side permission check | Relies on RLS |

### Security Risk Summary
| Risk | Severity | Location |
|------|----------|---------|
| Deactivated users not blocked at login | CRITICAL | `login-form.tsx` + middleware |
| Open public `/signup` in production | HIGH | `(auth)/signup/page.tsx` |
| FORCE RLS off on all Users tables | HIGH | DB configuration |
| Last-admin deletion not protected | HIGH | `deleteUser()`, `adminUpdateUserProfile()` |
| `roles.edit` permission code used but doesn't exist | MEDIUM | `admin/roles/record/[id]/page.tsx` |
| `system.admin` permission used in `updateRole()` — doesn't exist | MEDIUM | `src/server/actions/roles.ts` line 102 |
| `audit_logs_insert` requires `audit.view` — may silently drop audit entries | MEDIUM | `audit_logs` RLS policy |
| `notes` and `employee_reference` silently dropped by schema mismatch | LOW | `adminUpdateUserProfileSchema` |
| `user_code` never populated | LOW | No numbering rule |
| Permission module_code casing inconsistency | MEDIUM | `permissions` table seeding |

---

## 15. Current Audit Logging Audit

| Feature | Status | Evidence |
|---------|--------|---------|
| Audit table (`audit_logs`) | CONFIRMED IMPLEMENTED | BIGINT PK, JSONB old/new values, actor, IP, user-agent ✓ |
| Audit helper (`logAudit`) | CONFIRMED IMPLEMENTED | `src/server/actions/audit.ts` ✓ |
| `createAuditDiff` | CONFIRMED IMPLEMENTED | Filters unchanged fields ✓ |
| USER_CREATED | CONFIRMED IMPLEMENTED | In `createUser()` with auth_method flag ✓ |
| USER_PROFILE_UPDATED | CONFIRMED IMPLEMENTED | In `adminUpdateUserProfile()` ✓ |
| USER_STATUS_CHANGED | CONFIRMED IMPLEMENTED | Via `adminUpdateUserProfile()` — but status changes from table go through this action ✓ |
| USER_ROLE_ASSIGNED | CONFIRMED IMPLEMENTED | In `assignRoleToUser()` ✓ |
| USER_ROLE_REMOVED | CONFIRMED IMPLEMENTED | In `removeRoleFromUser()` ✓ |
| USER_DELETED | CONFIRMED IMPLEMENTED | In `deleteUser()` — logged BEFORE deletion ✓ |
| ROLE_CREATED | CONFIRMED IMPLEMENTED | In `createRole()` ✓ |
| ROLE_UPDATED | CONFIRMED IMPLEMENTED | In `updateRole()` ✓ |
| ROLE_STATUS_CHANGED | CONFIRMED IMPLEMENTED | In `updateRoleStatus()` ✓ |
| ROLE_DELETED | CONFIRMED IMPLEMENTED | In `deleteRole()` ✓ |
| ROLE_PERMISSION_ASSIGNED | CONFIRMED IMPLEMENTED | In `assignPermissionToRole()` ✓ |
| ROLE_PERMISSION_REMOVED | CONFIRMED IMPLEMENTED | In `removePermissionFromRole()` ✓ |
| LOGIN events | CONFIRMED MISSING | No login/logout audit logging |
| LOGIN_BLOCKED_INACTIVE_USER | CONFIRMED MISSING | Feature doesn't exist |
| IP address capture | CONFIRMED IMPLEMENTED | `x-forwarded-for` / `x-real-ip` ✓ |
| User-agent capture | CONFIRMED IMPLEMENTED | ✓ |
| Raw password/sensitive field in audit | CONFIRMED SAFE | `createAuditDiff` excludes `id`, `created_at`, `updated_at`; invite link not logged |
| Audit per-user view | CONFIRMED MISSING | No user profile → audit trail tab |
| Audit log pagination/search | CONFIRMED PARTIAL | Page hardcoded to last 200 entries; no filters |
| 1,706 audit entries live | CONFIRMED via MCP | Active usage ✓ |

---

## 16. Current Tests and UAT Coverage

### Test Files Found
| File | Module | Type |
|------|--------|------|
| `src/lib/ai/observability/__tests__/log-dms-ai-usage.test.ts` | DMS AI | Vitest unit |
| `src/lib/ai/observability/__tests__/safe-usage-redaction.test.ts` | DMS AI | Vitest unit |
| `src/lib/dms/apply-correction/__tests__/correction-*.test.ts` (4 files) | DMS AI | Vitest unit |
| `src/lib/dms/apply-to-erp/__tests__/apply-*.test.ts` (3 files) | DMS AI | Vitest unit |
| `tests/e2e/dms-ai-phase15.spec.ts` | DMS AI | Playwright E2E |

**Zero tests exist for:**
- Users module server actions
- Roles module server actions
- Permissions module server actions
- RBAC `check.ts` (getAuthContext, hasPermission)
- RLS policies on Users tables
- Auth flow (login, invite, password reset)
- Organizations/Branches actions
- Audit logging
- Middleware session enforcement

---

## 17. Confirmed Implemented Items

| Feature | File(s) |
|---------|---------|
| user_profiles table with BIGINT PK, UUID FK to auth.users | `20260527120000_erp_base_foundation.sql` |
| roles, permissions, role_permissions, user_roles tables | Same migration |
| Full RBAC runtime: getAuthContext, hasPermission, isGlobalAdmin | `src/lib/rbac/check.ts` |
| SECURITY DEFINER helper functions (7+ functions) | `20260527120000_erp_base_foundation.sql` |
| Scope validation triggers for user_roles and user_profiles | Same migration |
| RLS enabled on all 8 tables with appropriate policies | Same migration |
| 16 system roles seeded | Same migration |
| 27 initial permissions seeded (additional seeded later) | Same migration |
| Auth trigger (handle_new_auth_user) | Same migration |
| Phase 002D: enhanced columns on user_profiles, roles, permissions | `20260527160443_erp_base_002d_admin_master_data_hardening.sql` |
| createUser (invite + temp password + audit + email) | `src/server/actions/users.ts` |
| adminUpdateUserProfile | Same |
| assignRoleToUser + removeRoleFromUser + deleteUser | Same |
| Role CRUD: createRole, updateRole, deleteRole, updateRoleStatus | `src/server/actions/roles.ts` |
| getRoleWithUsersAction (users per role) | Same |
| assignPermissionToRole, removePermissionFromRole | `src/server/actions/permissions.ts` |
| Organizations full CRUD + status lifecycle | `src/server/actions/organizations.ts` |
| Branches full CRUD + status lifecycle | `src/server/actions/branches.ts` |
| Audit helper logAudit + createAuditDiff | `src/server/actions/audit.ts` |
| Users list with search, sort, pagination, export | `src/features/users/users-table.tsx` |
| User workspace form (add/edit/view) with sections | `src/features/users/user-workspace-form.tsx` |
| AssignRoleDialog (ERPChildDialogForm) | `src/features/users/assign-role-dialog.tsx` |
| Roles table with status toggle, delete, view | `src/features/roles/roles-table.tsx` |
| Role workspace form (add/edit/view) | `src/features/roles/role-workspace-form.tsx` |
| Role detail drawer with assigned users | `src/features/roles/role-detail-drawer.tsx` |
| Permissions matrix (role × permission checkboxes) | `src/features/permissions/permissions-matrix.tsx` |
| Route pages for users, roles, permissions, audit | Multiple page.tsx files |
| Sidebar: Users, Roles, Permissions, Organizations, Branches, Audit under Administration | `src/components/layout/app-sidebar.tsx` |
| Profile self-view page | `src/app/(protected)/profile/page.tsx` |
| Login, forgot-password, reset-password flows | `src/features/auth/` |
| Server-side permission checks on all mutating actions | All server actions ✓ |
| Draft preservation in workspace forms | `useWorkspaceFormDraft` ✓ |
| Dirty guard | `useFormDirty` ✓ |
| Delete confirmation dialog | `AlertDialog` ✓ |
| Self-delete protection | `deleteUser()` ✓ |
| System-role delete protection | `deleteRole()` ✓ |

---

## 18. Confirmed Partial Items

| Feature | Gap | File(s) |
|---------|-----|---------|
| Email display in user list | Only shows for current user; others show null | `src/server/queries/users.ts` |
| Multiple roles display | Only first role shown in table | `src/features/users/users-table.tsx` |
| Remove role from user UI | Action exists but not wired to any button | `src/features/users/user-workspace-form.tsx` |
| Suspend user | Status value exists; no dedicated suspend action in table | `src/features/users/users-table.tsx` |
| Audit log viewer | Last 200 entries only; no pagination/filter/search | `src/app/(protected)/admin/audit/page.tsx` |
| Permissions matrix module grouping | 30 groups due to casing inconsistency | `permissions` table + `src/features/permissions/permissions-matrix.tsx` |
| Role form fields | display_name, role_category, role_level, notes not shown | `src/features/roles/role-workspace-form.tsx` |
| Role detail assigned_at | `created_at` bug in query → shows null | `src/server/queries/roles.ts`, `src/server/actions/roles.ts` |
| `adminUpdateUserProfileSchema` | Missing notes, employee_reference → silently dropped | `src/features/users/user-schema.ts` |
| Role assignability filter | `is_assignable` not checked in `AssignRoleDialog` | `src/features/users/assign-role-dialog.tsx` |
| Branch status | Two status fields (status + operating_status) — inconsistent lifecycle | `branches` table + `src/features/branches/` |

---

## 19. Confirmed Missing Items

| Feature | Priority | Notes |
|---------|----------|-------|
| **Inactive/suspended user blocked at login** | CRITICAL | Post-login status check needed |
| **FORCE RLS on Users tables** | HIGH | `ALTER TABLE ... FORCE ROW LEVEL SECURITY` needed |
| **Last-admin protection** | HIGH | Prevent deactivating/deleting last system_admin |
| **Disable/gate public /signup route** | HIGH | Configurable or admin-invite-only |
| `user_code` auto-numbering | MEDIUM | Numbering rule + wiring in createUser needed |
| Per-user effective permissions view | MEDIUM | "What can User X do?" computed view |
| Per-user audit trail tab | MEDIUM | Filter audit_logs by actor or entity |
| Login/logout audit events | MEDIUM | Supabase Auth hooks or middleware-level |
| Last login display | MEDIUM | From `auth.users.last_sign_in_at` |
| Server-side pagination/search for users | MEDIUM | Current: client-side only; scales poorly |
| Role's permissions tab in role detail | MEDIUM | Drawer shows users but not permissions |
| Permissions edit UI (name/description) | LOW | Currently migration-only |
| Permission create UI | LOW | Currently migration-only |
| Clone role function | LOW | |
| Manager field in user form | LOW | Column exists; not shown |
| Avatar upload | LOW | Column exists; no UI |
| MFA enforcement option | LOW | auth.mfa_factors exists but 0 active users |
| Users Dashboard / Security Hub page | LOW | Aggregate view of users/roles/security stats |
| Permission `module_code` casing normalization | MEDIUM | Fix inconsistent uppercase/lowercase |
| Fix `roles.edit` permission code bug | HIGH | Should be `roles.manage` |
| Fix `system.admin` permission code bug | MEDIUM | Should be `erp.admin` |
| Dedicated `users.manage` constant | LOW | Currently an untracked string |
| Tests for Users/Auth/RBAC | MEDIUM | Zero coverage |

---

## 20. Risks, Gaps, and Security Concerns

### CRITICAL
1. **Deactivated/suspended users can log in.** `user_profiles.status` is never checked during or after authentication. A suspended employee retains full ERP access until the Supabase Auth token expires. Mitigation: add post-login middleware check or `getAuthContext()` status assertion.

### HIGH
2. **FORCE RLS is disabled.** The table owner (service-role) bypasses RLS entirely. While `createAdminClient()` is used intentionally for admin operations, any accidental or malicious service-role usage would expose all data. Enable `FORCE ROW LEVEL SECURITY` on at least `user_profiles`, `roles`, `user_roles`.

3. **Public signup route is accessible in production.** `/signup` allows anyone to self-register and create a Supabase Auth user + ERP profile. The signup form itself warns this should be disabled, but the warning is not enforced. A self-registered user would have no roles assigned, but they would have a valid session and could call server actions — relying on RLS as the only protection.

4. **No last-admin protection.** Admin can deactivate or delete the only `system_admin` user, leaving the ERP with no admin access. Requires a DB-level or server action guard.

5. **`roles.edit` permission code bug.** The role record page checks `roles.edit` for edit mode, which doesn't exist. Non-system_admin users with `roles.manage` permission will always get view-only mode on the role record page. Must be changed to `roles.manage`.

### MEDIUM
6. **`system.admin` permission code bug in `updateRole()`.** The check `hasPermission(ctx, "system.admin")` for system role modification uses a non-existent code. Only global admins (system_admin/group_admin by role code) can bypass this, which is correct, but the intent of the permission check is broken.

7. **`audit_logs_insert` RLS requires `audit.view`.** Users without `audit.view` permission cannot insert audit log entries. Since server actions run with the regular authenticated client, `logAudit()` will silently fail for non-admin users performing audited operations. Should use service-role or a SECURITY DEFINER function for audit inserts.

8. **`adminUpdateUserProfileSchema` mismatch.** The `UserWorkspaceForm` sends `notes` and `employee_reference` in the form data, but the Zod schema does not include them. They are silently stripped during validation. Users cannot update these fields through the UI.

9. **Permission `module_code` casing inconsistency.** 30 groups in the permissions matrix (many duplicates). `hr` and `HR` are treated as different modules. The `src/lib/rbac/permissions.ts` constants only define lowercase codes, but many seeded permissions use uppercase module codes — the runtime `hasPermission()` check does string matching on `permission_code` (e.g. `hr.view` — lowercase), so uppercase-seeded codes like `HR.view` would not match `hr.view`.

### LOW
10. **`user_code` is always NULL.** New users get no human-readable reference number. All existing features (audit logging, role assignment) use `user_code` as `entity_reference` — these default to `user-{id}` fallbacks.

11. **Email visibility.** Email addresses are only visible for the current user in the users table. Admin cannot see email of other users through the UI (it is in `auth.users` not `user_profiles`). Admin actions use `auth.users` email through the admin client, but the display query `listUsers()` only exposes the current user's email.

---

## 21. Recommended Target Users Module Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     USERS MODULE (Target)                        │
├─────────────────────────────────────────────────────────────────┤
│  /admin/users (Users Hub — server-side paginated list)           │
│    ├── Status chip filters (All / Active / Inactive / Suspended) │
│    ├── Organization filter                                        │
│    ├── Role filter                                                │
│    ├── Server-side search by name/email/user_code                │
│    └── Add User button → /admin/users/record/new                 │
│                                                                   │
│  /admin/users/record/[id] (User Workspace — tabs)                │
│    ├── Profile Details (edit all fields including notes)          │
│    ├── Organization & Branch (with scoped validation)             │
│    ├── Roles (assign + REMOVE, list all assignments with scope)   │
│    ├── Security (last login, MFA status, password reset button)   │
│    └── Audit Trail (per-user audit log with pagination)           │
│                                                                   │
│  /admin/roles (Roles list — server-side)                         │
│    └── /admin/roles/record/[id] (Role workspace — tabs)          │
│          ├── Role Details (+ display_name, category, level)       │
│          ├── Assigned Permissions (from matrix)                   │
│          └── Assigned Users (with deassign action)               │
│                                                                   │
│  /admin/permissions (Permission Matrix)                           │
│    └── Normalized module_code grouping                            │
│                                                                   │
│  Status Enforcement Layer (post-login)                            │
│    └── Middleware or getAuthContext() status check               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 22. Recommended Database / Schema Direction

| Change | Type | Priority | Notes |
|--------|------|----------|-------|
| Enable `FORCE ROW LEVEL SECURITY` on user_profiles, roles, user_roles, permissions, role_permissions, audit_logs, owner_companies, branches | Migration | HIGH | Service-role bypass still works via SECURITY DEFINER functions |
| Add `users_numbering_rule` to `global_numbering_rules` | Migration | MEDIUM | Prefix: USR, format: USR-YYYYMMDD-{SEQ5} or USR-{SEQ6} |
| Normalize `permissions.module_code` casing | Migration (UPDATE) | MEDIUM | Standardize all to lowercase; deduplicate |
| Add `erp_active_sessions` or hook for login events | Optional | LOW | Or use Supabase Auth hooks |
| No new tables required | — | — | All needed columns already exist |

---

## 23. Recommended Auth and Profile Direction

1. **Block inactive/suspended users post-login**: Add a `user_profiles.status` check in `getAuthContext()` — if status is not `active`, return an empty context and redirect to a "Your account is deactivated" page. Alternatively, set `banned_until` in `auth.users` via admin API when deactivating.
2. **Disable public signup in production**: Remove or gate `/signup` page behind a feature flag or ADMIN_SIGNUP_ENABLED env var.
3. **Expose `auth.users.last_sign_in_at`** in the user detail page via an adminClient query.
4. **Populate `user_code`**: Wire a numbering engine call in `createUser()` or via a Postgres trigger on `user_profiles`.
5. **Fix `adminUpdateUserProfileSchema`**: Add `notes` and `employee_reference` fields. Add optional `last_admin_updated_at` auto-set.
6. **Email display**: For admin users, fetch emails via `adminClient.auth.admin.listUsers()` or store email denormalized in user_profiles (with trigger to sync from auth.users).
7. **MFA**: Do not force MFA in phase plan — mark as future enhancement; but add visibility of MFA status in the user profile security tab.

---

## 24. Recommended RBAC and Permissions Direction

1. **Fix `roles.edit` → `roles.manage`** in `admin/roles/record/[id]/page.tsx`.
2. **Fix `system.admin` → `erp.admin`** in `src/server/actions/roles.ts` line 102.
3. **Add `users.manage` to `PERMISSIONS` constants** in `src/lib/rbac/permissions.ts`.
4. **Normalize permission module_code casing** in the `permissions` table (migration).
5. **Add `users.create` permission usage**: The create-user flow should check `users.create` not just `users.manage`.
6. **Fix `audit_logs_insert` RLS**: Use a SECURITY DEFINER insert function for audit logging, or use the admin client for audit inserts.
7. **Add `last-admin` protection guard** in `deleteUser()` and `adminUpdateUserProfile()`.
8. **Respect `is_assignable` flag** in `AssignRoleDialog` filter.
9. **Effective permissions per user**: Implement a server query that computes the full permission set for a given user profile.

---

## 25. Recommended UI / UX Direction

```
Users Hub Recommended Structure:
1. Users Dashboard (/admin/users)
   - Active/Inactive/Suspended count cards
   - Recent additions
   - Server-side paginated table with status/org/role filters
   - Quick-add button

2. User Profile Record (/admin/users/record/[id])
   Tabs: Profile | Organization | Roles | Security | Audit
   - Profile: all fields including email (read-only), avatar, notes, employee_ref, manager
   - Organization: company + branch with visual scope diagram
   - Roles: list with scope badges + assign + remove buttons
   - Security: last login, MFA status, password reset, status change with reason
   - Audit: per-user filtered audit log with pagination

3. Roles (/admin/roles)
   - Server-side list with category/status filters
   Role Record Tabs: Details | Permissions | Assigned Users
   - Details: + display_name, category, level, is_assignable fields
   - Permissions: checkboxes or pills from permission catalog
   - Assigned Users: list with deassign action

4. Permissions Matrix (/admin/permissions)
   - Fixed module grouping (normalized casing)
   - "Effective for user" mode: show computed permissions for a selected user

5. Audit Logs (/admin/audit)
   - Server-side paginated (100 per page)
   - Filter: module, action, actor, entity, date range
   - Drill-down to entity record
```

---

## 26. Recommended Security and RLS Direction

| Action | Mechanism | Phase |
|--------|-----------|-------|
| Block inactive/suspended users | Status check in middleware or getAuthContext | USERS.1 |
| Enable FORCE RLS on all 8 tables | Migration | USERS.1 |
| Fix permission code bugs | Code fix | USERS.1 |
| Gate /signup page | Feature flag or route removal | USERS.1 |
| Last-admin protection | Server action guard | USERS.2 |
| Audit log insert via SECURITY DEFINER | Migration + refactor logAudit() | USERS.5 |
| MFA visibility (not enforcement) | UI only | USERS.6 |
| Server-side authorization on listUsers query | Add permission check | USERS.1 |

---

## 27. Recommended Audit Logging Direction

1. **Fix `audit_logs_insert` RLS**: Allow service-role inserts without `audit.view` permission check, or wrap `logAudit()` to use `createAdminClient()`.
2. **Add login events**: Log `USER_LOGIN` (actor, IP, user-agent) via a Supabase Auth hook or client-side `signIn` callback.
3. **Add login-blocked events**: Log `USER_LOGIN_BLOCKED_STATUS` when status check blocks a user.
4. **Paginate audit log page**: Replace `limit: 200` with server-side pagination and filters.
5. **Per-user audit tab**: Filter `audit_logs WHERE actor_user_profile_id = userId OR entity_id = userId` in the user record.
6. **Add audit events for**:
   - `USER_LOGIN` / `USER_LOGOUT`
   - `USER_LOGIN_BLOCKED_STATUS`
   - `PERMISSION_MODULE_ASSIGNED` (when role gets a permission group)
   - `USER_PASSWORD_RESET_REQUESTED`

---

## 28. Recommended Users Module Phase Plan

| Phase | Name | Scope | Priority |
|-------|------|-------|----------|
| USERS.0 | Deep Audit & Report | This report | COMPLETE |
| USERS.1 | Security Foundation | Status enforcement, FORCE RLS, permission code fixes, audit_logs insert fix, signup gate | FIRST |
| USERS.2 | User Management Core | Server-side pagination/search, schema fix, email display, remove-role UI, last-login display, last-admin guard | SECOND |
| USERS.3 | Roles Enhancement | Role form enhanced fields, permissions tab in role detail, assigned_at bug fix, clone role | THIRD |
| USERS.4 | Permissions & Effective Access | Module code normalization, effective-permissions per-user view, permission edit | FOURTH |
| USERS.5 | Security Hardening | FORCE RLS migration, audit log pagination/filters, per-user audit tab, login event logging | FIFTH |
| USERS.6 | UI/UX Polish | Users dashboard, admin hub, empty/loading/error states, suspended badge, avatar | SIXTH |
| USERS.7 | Testing, UAT & Closure | Vitest, RLS SQL tests, Playwright UAT, source-of-truth update | LAST |

---

## 29. Phase-by-Phase Deliverables

### USERS.1 — Security Foundation and Source-of-Truth Alignment
- [ ] Add `user_profiles.status` check in `getAuthContext()` — return null profile + redirect if not `active`
- [ ] Enable `FORCE ROW LEVEL SECURITY` on: user_profiles, roles, permissions, role_permissions, user_roles, audit_logs (migration)
- [ ] Fix `/admin/roles/record/[id]/page.tsx`: change `roles.edit` → `roles.manage`
- [ ] Fix `src/server/actions/roles.ts` line ~102: change `system.admin` → `erp.admin`
- [ ] Add `users.manage` to `PERMISSIONS` constants in `src/lib/rbac/permissions.ts`
- [ ] Fix `audit_logs_insert` RLS policy: use SECURITY DEFINER insert function, or use adminClient in `logAudit()`
- [ ] Gate `/signup` page: add env var `NEXT_PUBLIC_SIGNUP_ENABLED` check; if false, show "Contact admin" page
- [ ] Add `users.view` permission check in `listUsers()` query (wrap in authorized-only path)
- [ ] Source-of-truth update
- [ ] Implementation report

### USERS.2 — User Management Core
- [ ] Fix `adminUpdateUserProfileSchema` to include `notes`, `employee_reference`, `last_admin_updated_at` auto-set
- [ ] Add "Remove Role" button/action to User Record Form (Roles section) — use `removeRoleFromUser()` action
- [ ] Add `last_sign_in_at` display from admin client in user detail Security tab
- [ ] Add last-admin protection in `deleteUser()` and `adminUpdateUserProfile({status})`: check if target is last system_admin
- [ ] Implement server-side pagination + search for Users list (replace `listUsers()` all-load with cursor/offset)
- [ ] Fix email visibility: use `createAdminClient().auth.admin.listUsers()` for admin users OR denormalize email into user_profiles via trigger
- [ ] Add "Suspended" badge styling (distinct color vs inactive)
- [ ] Expose `banned_until` display in user Security tab
- [ ] Source-of-truth update + implementation report

### USERS.3 — Roles Management Enhancement
- [ ] Fix `assigned_at` bug: change `created_at` → `assigned_at` in `getRoleWithUsers()` and `getRoleWithUsersAction()`
- [ ] Add `display_name`, `role_category`, `role_level`, `is_assignable`, `notes` fields to `RoleWorkspaceForm`
- [ ] Add "Permissions" tab to `RoleDetailDrawer` showing which permissions are assigned
- [ ] Respect `is_assignable=false` in `AssignRoleDialog` filter
- [ ] Implement "Clone Role" action: copy role + permissions to a new custom role
- [ ] Wire `user_code` auto-numbering: add numbering rule for user_profiles, call in `createUser()`
- [ ] Source-of-truth update + implementation report

### USERS.4 — Permissions and Effective Access
- [ ] Normalize `permissions.module_code` casing: migration to lowercase all existing codes
- [ ] Update permissions matrix to use normalized grouping
- [ ] Implement `getEffectivePermissionsForUser(userId)` server query
- [ ] Add "Effective Permissions" view in User Record (Security tab)
- [ ] Source-of-truth update + implementation report

### USERS.5 — Security Hardening and Audit Enhancement
- [ ] Paginate audit logs page: server-side, 100 per page, with filters (module, actor, action, date range)
- [ ] Add per-user audit tab in User Record (filter by actor_user_profile_id)
- [ ] Add login event logging (USER_LOGIN / USER_LOGOUT) via Supabase Auth hook or wrapper
- [ ] Add USER_LOGIN_BLOCKED_STATUS audit event in status enforcement code
- [ ] Verify all FORCE RLS migrations applied and tested
- [ ] Source-of-truth update + implementation report

### USERS.6 — UI/UX Polish and Admin Workspace
- [ ] Users hub page with count cards (active/inactive/suspended) + quick stats
- [ ] Per-user Security tab: last login, MFA status badge, status change with reason field
- [ ] Consistent empty/loading/error states across all Users-module pages
- [ ] Source-of-truth update + implementation report

### USERS.7 — Testing, UAT, and Closure
- [ ] Vitest: `src/lib/rbac/check.test.ts` (getAuthContext, hasPermission, isGlobalAdmin)
- [ ] Vitest: server action tests for createUser, assignRoleToUser, deleteUser, createRole
- [ ] RLS SQL tests: unauthorized SELECT/INSERT/UPDATE on user_profiles, user_roles
- [ ] Playwright E2E: login as admin → create user → assign role → verify permissions → deactivate → verify blocked
- [ ] Playwright E2E: normal user denied admin/users page
- [ ] Playwright E2E: system role cannot be deleted
- [ ] Build, typecheck, lint pass
- [ ] Source-of-truth update + final closure report

---

## 30. Acceptance Criteria for Future Implementation

| ID | Acceptance Criterion |
|----|---------------------|
| AC-01 | Admin can view users with server-side pagination and search (name, email, user_code) |
| AC-02 | Admin can create or invite a user via the approved Supabase invite/temp-password pattern |
| AC-03 | Auth UUID (`auth_user_id`) is isolated as external auth reference; core tables use BIGINT |
| AC-04 | New users receive a `user_code` in USR-{sequence} format automatically |
| AC-05 | Admin can edit user profile fields including notes and employee_reference without error |
| AC-06 | Admin can assign and remove organization and branch scopes safely |
| AC-07 | Admin can assign and remove roles with scope selection |
| AC-08 | Admin can view all users assigned to a given role |
| AC-09 | Admin can view the effective permissions of any user |
| AC-10 | Role CRUD works; system roles are protected from deletion; clone role creates a new custom role |
| AC-11 | Permission matrix is grouped by normalized module code (no duplicate groups) |
| AC-12 | All server actions enforce permissions server-side (not only via RLS) |
| AC-13 | RLS is enabled AND FORCE RLS is enabled on all 8 Users-module tables |
| AC-14 | A user cannot escalate their own permissions (RLS + server action guard) |
| AC-15 | Admin cannot deactivate or delete the last system_admin user |
| AC-16 | Deactivated/suspended users are blocked at session time — `getAuthContext()` returns null profile; user sees account-disabled page |
| AC-17 | All user/role/permission changes are audit-logged with actor, old/new values, IP, user-agent |
| AC-18 | UI follows ALGT ERP table/form/workspace standards (`ERPDataTable`, `ERPRecordWorkspaceForm`, `ERPChildDialogForm`) |
| AC-19 | Normal users (no admin permissions) cannot access `/admin/users`, `/admin/roles`, `/admin/permissions` |
| AC-20 | Build, typecheck, lint, Vitest, and Playwright UAT all pass |
| AC-21 | Source-of-truth is updated after each phase |
| AC-22 | No unrelated modules are broken |

---

## 31. Test Plan for Future Implementation

| # | Test | Type | Priority |
|---|------|------|----------|
| T-01 | Login as system_admin; verify /admin/users loads | Playwright | High |
| T-02 | Login as user without users.view; verify /admin/users shows "Access Denied" | Playwright | High |
| T-03 | Deactivate a test user; attempt login as that user; verify blocked | Playwright | Critical |
| T-04 | Admin user list loads with server-side pagination | Playwright | High |
| T-05 | Server-side search returns correct results | Playwright | High |
| T-06 | Filter by status (active/inactive/suspended) returns correct subset | Playwright | Medium |
| T-07 | Create user via invite flow; verify auth user created + profile created + role assigned | Playwright | High |
| T-08 | Edit user profile; verify notes and employee_reference are saved | Playwright | High |
| T-09 | Assign role with global scope; verify user_roles entry | Playwright | High |
| T-10 | Remove role from user; verify user_roles entry deleted | Playwright | High |
| T-11 | View users per role in role detail drawer | Playwright | Medium |
| T-12 | View effective permissions for a user | Playwright | Medium |
| T-13 | Create custom role; verify not is_system_role | Playwright | High |
| T-14 | Edit custom role name/description/category | Playwright | Medium |
| T-15 | Deactivate custom role; verify inactive badge | Playwright | Medium |
| T-16 | Delete custom role; verify removed | Playwright | Medium |
| T-17 | Delete system role; verify blocked with error | Playwright | High |
| T-18 | Attempt to delete last system_admin user; verify blocked | Playwright | High |
| T-19 | Toggle permission in matrix; verify role_permissions updated | Playwright | Medium |
| T-20 | Normal user calls createUser server action; verify 403 | Vitest | High |
| T-21 | Normal user calls createRole server action; verify 403 | Vitest | High |
| T-22 | getAuthContext() for user with status='inactive' returns null profile | Vitest | Critical |
| T-23 | hasPermission() for system_admin bypasses all checks | Vitest | High |
| T-24 | hasPermission() for user without permission returns false | Vitest | High |
| T-25 | RLS SQL: SELECT user_profiles as anon role → 0 rows | SQL Test | High |
| T-26 | RLS SQL: SELECT user_profiles as unauthorized user → 0 rows (not own row) | SQL Test | High |
| T-27 | RLS SQL: INSERT user_roles without manage permission → error | SQL Test | High |
| T-28 | Build: `npm run build` passes with 0 errors | Build | High |
| T-29 | Typecheck: `tsc --noEmit` passes with 0 errors | Typecheck | High |
| T-30 | Lint: `eslint` passes with 0 errors | Lint | Medium |

---

## 32. What Must Not Be Implemented Yet

Per the project's AI governance rules and the current phase direction:

- ❌ **Do NOT start Phase 19 or any new AI phase**
- ❌ **Do NOT start HR write-back or AI write-back from this module**
- ❌ **Do NOT add a "Users AI" feature** (ERP COMMON AI.8 is DEFERRED)
- ❌ **Do NOT modify DMS, HR, Party Master, or Report modules** as part of Users phase work
- ❌ **Do NOT add payroll/salary/IBAN fields** to user_profiles
- ❌ **Do NOT drop or alter `auth.users` structure**
- ❌ **Do NOT implement HR module** during Users phases (HR module is a separate next-phase effort)
- ❌ **Do NOT implement Party Contacts/Addresses write-back**
- ❌ **Do NOT add bulk user import from CSV/Excel** (not requested, not scoped)
- ❌ **Do NOT add SSO/OAuth** (not in scope; Supabase Auth handles this separately)

---

## 33. Recommended Next Cursor Implementation Prompt

After this report is reviewed and approved by Sameer, the recommended first implementation prompt is:

**"ERP USERS MODULE — USERS.1 Security Foundation and Source-of-Truth Alignment"**

That prompt should authorize Cursor to:
1. Enable FORCE RLS on the 8 Users tables (migration)
2. Fix `roles.edit` → `roles.manage` permission code bug
3. Fix `system.admin` → `erp.admin` permission code bug
4. Add `users.manage` to PERMISSIONS constants
5. Add status check in `getAuthContext()` — block inactive/suspended users
6. Fix `audit_logs_insert` RLS policy (use SECURITY DEFINER or admin client)
7. Gate `/signup` page via environment variable
8. Add `users.view` permission guard to `listUsers()` server query wrapper
9. Update source-of-truth
10. Create implementation report

This phase has **zero UI changes** and carries **low risk of breaking existing functionality**.

---

## 34. Open Questions / Items Requiring Sameer Review

| # | Question | Impact |
|---|----------|--------|
| Q1 | Should inactive/suspended users see a custom "Account Disabled" page, or be redirected to `/login` with an error message? | UX for USERS.1 |
| Q2 | Should public `/signup` be removed entirely, or kept with an env flag (`NEXT_PUBLIC_SIGNUP_ENABLED=false`)? | Security for USERS.1 |
| Q3 | Should `user_code` use format `USR-{SEQ6}` (e.g. USR-000001) or include date `USR-20260627-001`? | Numbering for USERS.3 |
| Q4 | Should the `department` field on user_profiles remain free-text, or become a FK to the `departments` table? | Schema for USERS.2 |
| Q5 | Should email be shown to all admins in the users table (requires admin client lookup), or remain private? | Privacy/Security for USERS.2 |
| Q6 | Is `test_role` (currently `is_system_role=true`) intentional or a leftover test artifact? | Data cleanup |
| Q7 | Should the HR module "department" assignment (employee's department FK) eventually replace or supplement `user_profiles.department` (free text)? | Future HR integration direction |
| Q8 | Should login/logout events be logged to `audit_logs` or to a separate `security_events` table? | Architecture for USERS.5 |
| Q9 | Should USERS.1 proceed immediately, or is any review/approval needed first? | Sequencing |

---

## 35. Final Recommendation

The ALGT ERP Users module has a **solid, enterprise-grade foundation** that far exceeds what initial assumptions suggested. The database schema, RBAC functions, server actions, permissions matrix, role management, and audit logging are all production-quality.

**The critical action before any further development is USERS.1 — Security Foundation**, specifically:

1. **Fix the inactive-user login bypass** — this is the only CRITICAL security issue.
2. **Enable FORCE RLS** — defense-in-depth.
3. **Fix two permission code bugs** — they silently block edit access for non-system_admin users.
4. **Gate public signup** — prevents unauthorized user creation.

After USERS.1 is completed, USERS.2 delivers the core enhancements (server-side pagination, remove-role UI, email visibility, schema fix, last-admin protection) that will make the module production-ready for multi-user onboarding.

USERS.3–USERS.7 are quality enhancements that can be scheduled based on operational priority.

**No new tables are required for USERS.1 or USERS.2.** All necessary schema columns exist from Phase 002D. Migrations in these phases will be additive (FORCE RLS, one numbering rule, permission normalization).

---

*Report generated: 2026-06-27*  
*No source code, UI, migration, schema, Supabase data, or RLS changes were made during this audit.*  
*Audit method: read-only repository inspection + Supabase MCP read-only SQL queries.*
