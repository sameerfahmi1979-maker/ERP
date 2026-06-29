# ERP USERS.3 — Roles Management Enhancement Plan

**Phase:** ERP USERS MODULE — USERS.3 Roles Management Enhancement  
**Type:** Planning only — no implementation in this phase  
**Date:** 2026-06-29  
**Author:** Cursor Agent (planning audit)  
**Prerequisites:** USERS.1 CLOSED / PASS · USERS.2 CLOSED / PASS WITH NOTES · USERS.2A CLOSED / PASS  
**Live Supabase project:** `https://mmiefuieduzdiiwnqpie.supabase.co` (`user-supabase` MCP, read-only SELECT only)

---

## 1. Executive Summary

USERS.1, USERS.2, and USERS.2A delivered security foundation, user-management core, and password lifecycle. **USERS.3 closes the Roles Management gap**: the database already has advanced role fields (ERP BASE 002D), but the UI, server actions, and role record workspace do not use them. Assigned users and role permissions exist only as partial/dead code.

### Confirmed high-priority gaps (verified against live codebase + DB)

1. **Advanced role fields unused** — `display_name`, `role_category`, `role_level`, `is_assignable`, `notes` exist on `roles` but are absent from `role-schema.ts`, `createRole`/`updateRole`, and `RoleWorkspaceForm`.
2. **`assigned_at` bug** — `getRoleWithUsers` / `getRoleWithUsersAction` select `user_roles.created_at` and map it to `assigned_at`; live DB has a dedicated `assigned_at` + `assigned_by` column.
3. **Role record workspace is single-section only** — no Assigned Users tab, no Permissions tab; `RoleDetailDrawer` has both but is **dead code** (zero imports).
4. **No clone role workflow** — no action, UI, or audit event.
5. **`roles.create` permission bug** — `/admin/roles/record/new` guards on `roles.create`, which is **not seeded**; only `roles.manage` exists. Add Role is blocked for non–global-admin users.
6. **System role protection is partial** — delete blocked for system roles; update blocked for non–global-admin; but create can set `is_system_role=true`, status toggle has no lockout guard, permission matrix has no system-role lockout.
7. **`is_assignable` enforced in UI only** — `assignRoleToUser` does not check `roles.is_active` or `roles.is_assignable`.
8. **Roles list lacks assignability/category/user-count columns** — table shows name, description, type, status only; actions shown to view-only users (server rejects).
9. **Permissions matrix not embedded in role record** — global `/admin/permissions` only; toggles do not refresh local state after save.
10. **`test_role` exists in live DB** — seeded system role, likely UAT artifact; all 17 roles are system roles, 0 custom roles.

### Recommended USERS.3 scope summary

| Area | Recommendation |
|---|---|
| Schema changes | **No migration required** for core scope — use existing 002D columns |
| Role form | Extend schema + workspace with advanced fields; remove client-controlled `is_system_role` on create |
| Role record sections | Overview · Permissions · Assigned Users · Audit Info |
| Assigned users | Fix `assigned_at`/`assigned_by`; add email, status, scope labels; optional pagination |
| Permissions in role record | **Option B** — display + edit via existing `assignPermissionToRole` / `removePermissionFromRole` |
| Clone role | New `cloneRole` server action + `ERPChildDialogForm` dialog; requires `roles.manage` |
| System role protection | Harden create, status, permissions, assignability; preserve last-`system_admin` guards from USERS.1/2 |
| Retire dead code | Remove or deprecate `role-detail-drawer.tsx` after workspace sections ship |
| Optional data migration | Seed `display_name`/`role_category`/`role_level` for system roles; cleanup `test_role` **only after Sameer confirms** |

**Explicit non-goals for USERS.3:** USERS.4 effective permissions per user, permission catalog redesign, MFA, password lifecycle changes, HR employee linking, DMS/AI/report engine work.

---

## 2. Planning Scope and Non-Implementation Rule

This document is **planning-only**.

During this phase Cursor must **not**:

- Modify source code, UI, server actions, middleware, or queries
- Create or apply migrations or SQL DDL/DML
- Change Supabase data, Auth settings, or RLS policies
- Update `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`

Sameer will review this plan with ChatGPT. A separate **USERS.3 implementation prompt** will be issued only after approval.

---

## 3. USERS.1 / USERS.2 / USERS.2A Closure Context

### USERS.1 (CLOSED / PASS)

| Control | Status | USERS.3 must preserve |
|---|---|---|
| Inactive/suspended → `/account-disabled` | Yes | Yes |
| FORCE RLS on roles, permissions, role_permissions, user_roles | Yes | Yes — no policy weakening |
| `audit_logs_insert` actor-self policy | Yes | Yes — extend audit events only |
| `/signup` gated | Yes | Yes — no change |
| Granular permissions + query guards | Yes | Yes — add guards to unguarded role queries |
| Last active `system_admin` deactivate/delete blocked | Yes | Yes — extend to role-status and permission changes if needed |

### USERS.2 (CLOSED / PASS WITH NOTES)

| Deliverable | Status | USERS.3 interaction |
|---|---|---|
| User list pagination/search/filters | Yes | No regression |
| All roles + scope on user record | Yes | Role-side mirror: assigned users per role |
| `AssignRoleDialog` + `is_assignable` client filter | Yes | Add server-side enforcement in `assignRoleToUser` |
| Remove role UI + last-admin guard | Yes | Reuse `removeRoleFromUser` if role-detail deassign approved |
| `ERPCombobox` for role select | Yes | Reuse patterns for category/level selects |

### USERS.2A (CLOSED / PASS)

| Deliverable | Status | USERS.3 interaction |
|---|---|---|
| Force password change gate | Yes | No change to layout/middleware |
| Admin security section | Yes | No change |
| Password lifecycle columns | Yes | No change |
| `users.security.manage` permission | Yes | Out of USERS.3 scope |

---

## 4. Files, Rules, Reports, and Source-of-Truth Reviewed

### Reports read

| File | Status |
|---|---|
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | Read (USERS.3 next phase noted) |
| `.cursor/rules/algt-erp-source-of-truth.mdc` | Referenced |
| `implementation_Review/ERP_USERS_1_SECURITY_FOUNDATION_IMPLEMENTATION_REPORT.md` | Referenced |
| `implementation_Review/ERP_USERS_2_USER_MANAGEMENT_CORE_PLAN.md` | Referenced |
| `implementation_Review/ERP_USERS_2_USER_MANAGEMENT_CORE_IMPLEMENTATION_REPORT.md` | Read |
| `implementation_Review/ERP_USERS_2A_PASSWORD_LIFECYCLE_ACCOUNT_SECURITY_PLAN.md` | Read (structure template) |
| `implementation_Review/ERP_USERS_2A_PASSWORD_LIFECYCLE_ACCOUNT_SECURITY_IMPLEMENTATION_REPORT.md` | Referenced |

### Source code inspected

| Path | Status |
|---|---|
| `src/server/actions/roles.ts` | Exists — audited |
| `src/server/actions/permissions.ts` | Exists — audited |
| `src/server/actions/users.ts` | Exists — `assignRoleToUser`, `removeRoleFromUser`, last-admin guards |
| `src/server/queries/roles.ts` | Exists — audited |
| `src/server/queries/permissions.ts` | Exists — audited |
| `src/lib/rbac/check.ts` | Exists — `hasPermission`, `isGlobalAdmin`, `canManageUsers` |
| `src/features/roles/roles-table.tsx` | Exists — audited |
| `src/features/roles/role-workspace-form.tsx` | Exists — single section only |
| `src/features/roles/role-detail-drawer.tsx` | Exists — **unused (dead code)** |
| `src/features/roles/role-schema.ts` | Exists — missing advanced fields |
| `src/features/roles/add-role-button.tsx` | Exists |
| `src/features/permissions/permissions-matrix.tsx` | Exists — global matrix only |
| `src/features/users/assign-role-dialog.tsx` | Exists — client `is_assignable` filter |
| `src/app/(protected)/admin/roles/page.tsx` | Exists |
| `src/app/(protected)/admin/roles/record/new/page.tsx` | Exists — **`roles.create` bug** |
| `src/app/(protected)/admin/roles/record/[id]/page.tsx` | Exists |
| `src/app/(protected)/admin/permissions/page.tsx` | Referenced |
| `src/types/database.ts` | `Role` type includes 002D fields |

### Migrations inspected

| Migration | Relevance |
|---|---|
| `20260527120000_erp_base_foundation.sql` | `roles`, `permissions`, `role_permissions`, `user_roles`, RLS, seeds, `assigned_at`/`assigned_by` |
| `20260527160443_erp_base_002d_admin_master_data_hardening.sql` | Advanced role + permission columns |
| `20260702100000_erp_users_1_security_foundation.sql` | FORCE RLS on roles/user_roles |

### Missing expected files

| Expected | Status |
|---|---|
| `src/lib/rbac/permissions.ts` | **Not found** — permission codes live in DB + `check.ts` |
| `src/features/roles/permissions-table.tsx` | Exists but legacy/unused on main permissions page |
| `cloneRole` action | **Not implemented** |
| `listAssignableRoles` query | **Not implemented** |

---

## 5. Supabase MCP Read-Only Review Summary

**Project:** `user-supabase` → `https://mmiefuieduzdiiwnqpie.supabase.co`  
**Queries executed:** SELECT only (columns, counts, roles list, RLS flags, policies, constraints)  
**No DDL/DML applied.**

### Live counts (2026-06-29)

| Metric | Value |
|---|---|
| Roles | 17 |
| System roles | 17 |
| Custom roles | 0 |
| `is_assignable = false` | 0 |
| Inactive roles | 0 |
| Permissions | 256 |
| Role-permission links | 656 |
| User-role assignments | 1 (active) |

### Live role inventory

All 17 roles are `is_system_role = true`, `is_assignable = true`, `is_active = true`. Advanced fields (`display_name`, `role_category`, `role_level`, `notes`) are **NULL for all rows**, including `test_role`.

Seeded system roles: `system_admin`, `group_admin`, `company_admin`, `branch_admin`, `hr_manager`, `finance_manager`, `operations_manager`, `procurement_manager`, `inventory_manager`, `fleet_manager`, `workshop_manager`, `rental_manager`, `dms_manager`, `hse_manager`, `employee_self_service`, `read_only_user`, **`test_role`**.

---

## 6. Current Roles Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                        Admin UI                                  │
├─────────────────┬───────────────────────┬───────────────────────┤
│ /admin/roles    │ /admin/roles/record/* │ /admin/permissions    │
│ RolesTable      │ RoleWorkspaceForm     │ PermissionsMatrix       │
│ (list only)     │ (basic fields only)   │ (all roles × perms)     │
└────────┬────────┴───────────┬───────────┴───────────┬───────────┘
         │                    │                       │
         ▼                    ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│              Server Actions / Queries                            │
│  roles.ts: CRUD, getRoleWithUsersAction, updateRoleStatus        │
│  permissions.ts: assign/remove permission                      │
│  users.ts: assignRoleToUser, removeRoleFromUser                  │
│  queries/roles.ts: listRoles, getRoleWithUsers                   │
│  queries/permissions.ts: listPermissions, getRolePermissions   │
└────────┬────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Supabase (RLS + FORCE RLS)                                      │
│  roles · permissions · role_permissions · user_roles             │
└─────────────────────────────────────────────────────────────────┘
```

**Gap:** Role record is disconnected from assigned users and permissions. `RoleDetailDrawer` was an intermediate 002D design but never wired to list or record routes.

---

## 7. Current Roles Database Schema Audit

### Table: `public.roles`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | bigint | NO | identity | PK |
| `role_code` | text | NO | — | UNIQUE |
| `role_name` | text | NO | — | |
| `description` | text | YES | — | |
| `is_system_role` | boolean | NO | `true` | All live rows true |
| `is_active` | boolean | NO | `true` | |
| `created_at` | timestamptz | NO | `now()` | |
| `updated_at` | timestamptz | NO | `now()` | |
| `display_name` | text | YES | — | 002D — unused in UI |
| `role_category` | text | YES | — | 002D — unused in UI |
| `role_level` | text | YES | — | 002D — unused in UI |
| `is_assignable` | boolean | YES | `true` | 002D — UI filter only |
| `notes` | text | YES | — | 002D — unused in UI |

**Indexes:** `idx_roles_role_category`, `idx_roles_is_assignable` (002D)

**Constraints:** `roles_pkey`, `roles_role_code_key` (UNIQUE)

### Related tables

| Table | Key columns | FK behavior |
|---|---|---|
| `role_permissions` | `role_id`, `permission_id` | CASCADE on role/permission delete; UNIQUE `(role_id, permission_id)` |
| `user_roles` | `user_profile_id`, `role_id`, `owner_company_id`, `branch_id`, `is_active`, `assigned_at`, `assigned_by` | CASCADE; UNIQUE NULLS NOT DISTINCT scope |

### Migration source

Advanced columns added in `20260527160443_erp_base_002d_admin_master_data_hardening.sql` §3 with comments:

- `role_category`: *"Admin, Operational, Executive, Technical, etc."*
- `role_level`: *"Junior, Senior, Manager, Executive, etc."*

No lookup/master table exists for categories or levels.

---

## 8. Current RLS and Security Audit

### FORCE RLS status (live)

| Table | RLS | FORCE RLS |
|---|---|---|
| `roles` | enabled | **true** |
| `permissions` | enabled | **true** |
| `role_permissions` | enabled | **true** |
| `user_roles` | enabled | **true** |

### Policies (live)

| Table | Policy | Command | Rule summary |
|---|---|---|---|
| `roles` | `roles_select` | SELECT | `roles.view` any scope |
| `roles` | `roles_manage` | ALL | global admin OR `roles.manage` |
| `permissions` | `permissions_select` | SELECT | `permissions.view` |
| `permissions` | `permissions_manage` | ALL | global admin OR `permissions.manage` |
| `role_permissions` | `role_permissions_select` | SELECT | `roles.view` |
| `role_permissions` | `role_permissions_manage` | ALL | global admin OR `roles.manage` |
| `user_roles` | `user_roles_select_own` | SELECT | own assignments |
| `user_roles` | `user_roles_select_scoped` | SELECT | `users.view` in company/branch scope |
| `user_roles` | `user_roles_manage_scoped` | ALL | `current_user_can_manage_user_role_assignment(...)` |

**USERS.3 impact:** No RLS policy changes planned. All new queries/actions must respect existing policies. Assigned-users query joins `user_profiles` — caller needs `roles.view` + RLS allows reading profiles only where `users.view` scope matches (global admin sees all).

**Defense-in-depth gap:** `getRoleById` / `getRoleWithUsers` queries lack explicit `roles.view` guard (RLS still applies on `roles`; `user_roles` SELECT requires scoped `users.view`).

---

## 9. Current Role UI Audit

### `/admin/roles` — `RolesTable`

| Aspect | Current |
|---|---|
| Columns | Role (name+code), Description, Type, Status, Actions |
| Actions | View, Edit, Activate/Deactivate, Delete (custom only) |
| Missing columns | `display_name`, category, level, assignability, assigned user count |
| Permission UX | Actions always visible — no `canManage` prop |
| Clone | Not available |

### `/admin/roles/record/new` — `RoleWorkspaceForm` mode=add

| Field | Shown | Issue |
|---|---|---|
| `role_code` | Yes | OK |
| `role_name` | Yes | OK |
| `description` | Yes | OK |
| `is_system_role` | Yes (select) | **Should not be client-set** |
| `is_active` | Yes | OK |
| Advanced fields | No | Gap |
| Page guard | `roles.create` | **Bug — permission not seeded** |

### `/admin/roles/record/[id]` — view/edit

| Aspect | Current |
|---|---|
| Sections | Single: "Role Details" |
| Assigned users | Not shown |
| Permissions | Not shown |
| System role banner | Generic info text only |
| Edit gate | `?mode=edit` + `roles.manage` ✓ |

### `RoleDetailDrawer` — dead code

- Sections: Details (shows category, level, assignability, notes) + Assigned Users
- Uses `getRoleWithUsersAction`
- **Zero imports** in `src/` — superseded by workspace record pattern

**Recommendation:** Retire drawer; port useful read-only layout into workspace sections.

---

## 10. Current Role Server Action Audit

### `src/server/actions/roles.ts`

| Function | Permission | Audit | Current behavior | Planned change |
|---|---|---|---|---|
| `getRoleById` | `roles.view` | No | Full row | Extend return type if needed for detail |
| `createRole` | `roles.manage` | `create` | Accepts client `is_system_role` | Force `is_system_role=false`; accept advanced fields |
| `updateRole` | `roles.manage` | `update` | Blocks system-role edit unless global admin | Block `role_code`/`is_system_role` changes; advanced fields |
| `deleteRole` | `roles.manage` | `delete` | Blocks system roles | No change |
| `getRoleWithUsersAction` | `roles.view` | No | Wrong `assigned_at` | Fix columns; enrich payload |
| `updateRoleStatus` | `roles.manage` | `status_change` | No system-role guard | Add lockout guards |
| **`cloneRole`** | — | — | **Missing** | **New** |

### `src/server/actions/permissions.ts`

| Function | Permission | System-role guard |
|---|---|---|
| `assignPermissionToRole` | `roles.manage` | **None** |
| `removePermissionFromRole` | `roles.manage` | **None** |

### `src/server/actions/users.ts` (relevant)

| Function | Permission | Assignability check |
|---|---|---|
| `assignRoleToUser` | `canManageUsers` | **None** — should check `is_active` + `is_assignable` |
| `removeRoleFromUser` | `canManageUsers` | Last `system_admin` guard ✓ |

---

## 11. Current Permission Matrix / Role Permission Audit

**Route:** `/admin/permissions`  
**Component:** `PermissionsMatrix`

| Aspect | Current |
|---|---|
| Layout | Permissions grouped by `module_code`; columns = all roles |
| Edit | Checkbox toggle → assign/remove server actions |
| Permission guard | `canManage` disables checkboxes |
| System roles | Badge shown; **no edit lockout** |
| Refresh | **No `router.refresh()`** after toggle — stale UI risk |
| Role-scoped view | Not available |

**USERS.3 recommendation:** Embed a **single-role** permissions panel in role record (Option B below), reusing assign/remove actions. Keep global matrix as navigation target; add "Open full matrix" link.

---

## 12. Current Assigned Users per Role Audit

### Query path

`getRoleWithUsers` / `getRoleWithUsersAction`:

| Field | Expected | Actual |
|---|---|---|
| `assigned_at` | `user_roles.assigned_at` | **`user_roles.created_at` mapped incorrectly** |
| `assigned_by` | join `user_profiles` | **Not selected** |
| Email | safe auth metadata or profile | **Not included** |
| User status | `user_profiles.status` | Included via full profile select |
| Scope | company/branch labels | Partial — company/branch objects joined |
| Active filter | Configurable | Shows all assignments |
| Pagination | None | None |

### RLS note

Reading assignments for a role requires `user_roles` SELECT policy — scoped admins only see users in their company/branch. Global admins see all. This is acceptable for v1.

### Deassign from role detail

`removeRoleFromUser` exists with last-admin guard. **Recommendation:** Show deassign action in role Assigned Users section **only when** actor has user-management permission (`canManageUsers`) **and** RLS allows the assignment. Otherwise view-only with link to user record.

---

## 13. Confirmed Problems and Gaps

| ID | Problem | Severity | Evidence |
|---|---|---|---|
| G-01 | Advanced role fields not in form/schema/actions | High | `role-schema.ts`, `role-workspace-form.tsx` |
| G-02 | `assigned_at` bug | High | `queries/roles.ts:88-89,141`; `actions/roles.ts:226-228,279` |
| G-03 | No assigned users in workspace | High | `role-workspace-form.tsx` single section |
| G-04 | No permissions in role record | High | Only global matrix |
| G-05 | No clone role | High | No code |
| G-06 | `roles.create` page guard | High | `record/new/page.tsx:7` |
| G-07 | Client can create system roles | High | `createRole` accepts `is_system_role` |
| G-08 | `is_assignable` not server-enforced | Medium | `assignRoleToUser` |
| G-09 | System role status change unrestricted | Medium | `updateRoleStatus` |
| G-10 | System role permissions editable by any `roles.manage` | Medium | `permissions.ts` |
| G-11 | RolesTable actions without `canManage` | Medium | UX/security clarity |
| G-12 | `RoleDetailDrawer` dead code | Low | Zero imports |
| G-13 | `test_role` in production DB | Low | Live SQL — confirm cleanup with Sameer |
| G-14 | Permissions matrix stale after toggle | Low | No refresh |
| G-15 | Unguarded queries | Low | `getRoleById`, `getRoleWithUsers` in queries layer |

---

## 14. Recommended USERS.3 Final Scope

### In scope (implement in USERS.3 execution phase)

1. Fix `roles.create` → `roles.manage` on new role page
2. Extend role schema + CRUD for advanced fields
3. Harden create/update: force custom roles on create; protect system roles
4. Expand role workspace to 4 sections: Overview, Permissions, Assigned Users, Audit Info
5. Fix `assigned_at` / add `assigned_by` display
6. Role-scoped permissions panel with edit (Option B)
7. `cloneRole` workflow
8. Server-side assignability + inactive role checks on `assignRoleToUser`
9. Roles list columns: category (optional), assignability badge, type, status
10. Pass `canManage` to table; hide destructive actions for view-only
11. System role warning banners
12. Retire `RoleDetailDrawer`
13. Audit events for clone + standardized action names where gaps exist
14. Browser UAT + implementation report + SOT update (execution phase)

### Out of scope

- USERS.4 effective permissions calculator / per-user permission tab
- Permission `module_code` normalization
- New permissions (unless Sameer approves — **not recommended**)
- MFA, password lifecycle, HR, DMS, AI
- Full audit log pagination

---

## 15. Role Advanced Fields Plan

| Field | DB | UI today | Recommended UI | Create | Edit custom | Edit system | Validation |
|---|---|---|---|---|---|---|---|
| `role_code` | ✓ | ✓ | Overview | Editable | **Read-only** | Read-only | snake_case, unique |
| `role_name` | ✓ | ✓ | Overview | Editable | Editable | Global admin only | required, max 255 |
| `display_name` | ✓ | ✗ | Overview | Editable | Editable | Global admin only | optional, max 255 |
| `description` | ✓ | ✓ | Overview | Editable | Editable | Global admin only | max 1000 |
| `role_category` | ✓ | drawer only | Overview | Select | Editable | Global admin only | controlled select* |
| `role_level` | ✓ | drawer only | Overview | Select | Editable | Global admin only | controlled select* |
| `is_assignable` | ✓ | ✗ | Overview | Default `true` | Editable | Global admin only | boolean |
| `notes` | ✓ | drawer only | Overview | Textarea | Editable | Global admin only | max 2000 |
| `is_system_role` | ✓ | select | Overview badge | **Server `false`** | Read-only badge | Read-only | never UI-editable |
| `is_active` | ✓ | select | Overview / status action | Default `true` | Status action | Status action† | see §21 |

\* **Controlled select recommendation** (no new DB table):

```text
role_category options: Admin | Operational | Finance | HR | DMS | Technical | Read Only | Other
role_level options: Global | Executive | Manager | Supervisor | Staff | Self Service | Read Only
```

Values align with 002D migration comments and seeded role names. Store as free `text` in DB; UI uses constant arrays in `src/features/roles/role-constants.ts` (new file, execution phase).

† System role deactivation rules in §19.

---

## 16. Assigned Users per Role Plan

### Section: "Assigned Users" (role workspace tab)

**Data source:** Enhanced `getRoleWithUsersAction` (or new `getRoleAssignedUsers` with pagination params)

**Columns:**

| Column | Source |
|---|---|
| User | `full_name` / `display_name` + `user_code` |
| Email | Safe auth metadata helper (USERS.2 pattern) — server-side |
| Status | `user_profiles.status` badge |
| Scope | Global / Company (`company_code`) / Branch (`branch_code`) |
| Assigned at | `user_roles.assigned_at` (**fix bug**) |
| Assigned by | `assigned_by` → profile display name |
| Actions | View user (workspace tab); Deassign (conditional) |

**Filters:** Default show active assignments; toggle "Include inactive assignments"

**Pagination:** Client table with server page size 50 when count > 50 (match users list pattern)

**Empty state:** "No users assigned to this role yet" + link to Users module

**Deassign:** Reuse `removeRoleFromUser` — requires `canManageUsers`; show `AlertDialog` confirmation; respect last-`system_admin` guard

---

## 17. Role Permissions View Plan

### Decision: **Option B — Display + Edit from role record**

**Rationale:**

- Existing assign/remove actions are production-ready with audit logging
- Global matrix remains for cross-role comparison
- Role record edit is lower friction for role owners
- Risk mitigated by system-role lockout (global admin only) and confirmation for bulk-like changes

### Section: "Permissions" (role workspace tab)

**Layout:**

- Group by `module_code` (accordion or cards — match matrix styling)
- Each row: `permission_name`, `permission_code`, `action_code`, active badge
- Checkbox or toggle when `canManagePermissions` (see RBAC §25)
- System role banner: "System role permissions can only be modified by a global administrator"
- Link: "Open full permissions matrix" → `/admin/permissions`

**Implementation approach:**

- New query: `getRolePermissionsGrouped(roleId)` — wraps existing `getRolePermissions` + permission metadata
- Client component: `RolePermissionsSection` — local optimistic state + `router.refresh()` on toggle
- Reuse `assignPermissionToRole` / `removePermissionFromRole`

**Critical permission guard (recommended):**

Block removal of `roles.manage` from `system_admin` role unless global admin AND not last admin pathway. Block removal of `users.view` from roles that would lock out all admins (defer fine-grained rules to USERS.4 if too complex — minimum: warn on `system_admin` permission edits).

---

## 18. Clone Role Workflow Plan

### UX flow

1. Admin opens role record (view or list action "Clone")
2. Clicks **Clone Role** (visible if `roles.manage`)
3. `ERPChildDialogForm` opens (size `md`)
4. Fields: `role_code`* , `role_name`* , `display_name`, `role_category`, `role_level`, `description`, `notes`
5. Source role shown read-only (code + name)
6. Submit → `cloneRole(sourceRoleId, input)`
7. On success: toast + open new role record in edit mode (permissions already copied)

### Server action: `cloneRole`

```text
Input: sourceRoleId, { role_code, role_name, display_name?, role_category?, role_level?, description?, notes? }
Permission: roles.manage
Steps:
  1. Validate unique role_code
  2. Load source role + role_permissions
  3. Insert new role: is_system_role=false, is_assignable=true, is_active=true
  4. Bulk insert role_permissions (copy all active permission links)
  5. Audit: ROLE_CLONED with source_role_code, new_role_code, permission_count
  6. Return { id, role_code }
```

### Rules

| Rule | Value |
|---|---|
| Clone from system role | **Allowed** → creates custom role |
| Clone from inactive role | **Allowed** — new role is active; admin decides |
| Copy permissions | All permissions from source (including inactive permission IDs if linked — filter to `permissions.is_active=true` recommended) |
| Copy assigned users | **No** |
| New permission | **No** — use `roles.manage` |

### Rollback risk

Low — single transaction recommended (Postgres function or sequential with delete on failure).

---

## 19. System Role Protection Plan

### Current vs recommended

| Action | Current | Recommended |
|---|---|---|
| Delete system role | Blocked ✓ | Keep |
| Edit fields (non-admin) | Blocked ✓ | Keep |
| Edit fields (global admin) | Allowed | Keep with audit |
| Create with `is_system_role=true` | **Allowed** | **Block — server force false** |
| Deactivate `system_admin` | **Allowed** | **Block always** |
| Deactivate other system roles | Allowed | Allow with warning if users assigned; block if would break seeded ERP |
| Permission edit on system roles | Allowed for `roles.manage` | **Global admin only** |
| Clone system role | N/A | Allowed (creates custom) |
| Delete custom role with assignments | FK error message | Keep + UI deactivate hint |

### `system_admin` lockout (extend USERS.1/2)

- Never deactivate role row `system_admin` (`updateRoleStatus`)
- Never set `is_assignable=false` on `system_admin`
- Never remove critical permissions from `system_admin` without global admin + confirmation
- Preserve existing user-level last-admin guards on deactivate/remove assignment

### `test_role` cleanup

Live DB contains `test_role` (system, active, assignable). **Do not delete in planning.** During implementation, ask Sameer to confirm: deactivate + delete, or mark `is_assignable=false`. Optional one-time data script in migration §24.

---

## 20. Role Assignability Plan

### Rules

| Rule | Enforcement layer |
|---|---|
| `is_assignable=false` → hidden in Assign Role dialog | Client (existing) + **server in `assignRoleToUser`** |
| `is_active=false` → not assignable | **Server + client** |
| System roles assignable by default | Keep — RLS already blocks non-global from assigning `system_admin`/`group_admin` |
| Role list shows assignability | Badge column "Assignable" / "Not assignable" |
| Custom role form edits `is_assignable` | Yes — custom roles only |
| `system_admin` assignability | Always true; not editable |

### New helper query: `listAssignableRoles()`

Used by Assign Role dialog and user workspace — server-filtered:

```sql
SELECT * FROM roles WHERE is_active = true AND is_assignable IS NOT FALSE ORDER BY role_name
```

With `roles.view` guard.

---

## 21. Role Status Lifecycle Plan

### Status model

Only `is_active` boolean exists — no archived column on `roles`.

| Status | Meaning |
|---|---|
| Active (`is_active=true`) | Assignable (if `is_assignable`), permissions effective |
| Inactive (`is_active=false`) | Not assignable; existing `user_roles` remain but should not grant new sessions effectively* |

\*Effective permission resolution is USERS.4 — for USERS.3, document that inactive role assignments remain visible on user record until removed; RBAC `getAuthContext` loads roles via active assignments — **verify during implementation** that inactive role rows on `user_roles` vs inactive `roles` row interaction is correct.

### UI behavior

- List: status badge + row actions Activate/Deactivate
- Form: status select on create; prefer status action from list for edit (reduce accidental deactivate)
- Inactive role banner on role record view
- Block assignment of inactive roles (server)

### Impact on existing assignments

- Do **not** auto-delete `user_roles` on deactivate
- Assigned Users tab shows assignments with role status indicator
- Admin message: "Deactivating a role prevents new assignments. Existing assignments remain until removed from user records."

---

## 22. Proposed Server Action and Query Plan

### New / updated functions (execution phase)

| Function | File | Change type |
|---|---|---|
| `createRole` | `actions/roles.ts` | Update — advanced fields, force custom |
| `updateRole` | `actions/roles.ts` | Update — advanced fields, strip immutable keys |
| `updateRoleStatus` | `actions/roles.ts` | Update — system_admin + lockout guards |
| `cloneRole` | `actions/roles.ts` | **New** |
| `getRoleWithUsersAction` | `actions/roles.ts` | Update — fix dates, enrich |
| `getRoleDetail` | `actions/roles.ts` | **New** (optional aggregate for record page SSR) |
| `getRolePermissionsGrouped` | `queries/permissions.ts` | **New** |
| `listAssignableRoles` | `queries/roles.ts` | **New** |
| `assignPermissionToRole` | `actions/permissions.ts` | Update — system-role guard |
| `removePermissionFromRole` | `actions/permissions.ts` | Update — system-role guard |
| `assignRoleToUser` | `actions/users.ts` | Update — `is_active` + `is_assignable` check |

### Query guard parity (USERS.1)

Add explicit `roles.view` to `queries/roles.ts` `getRoleById`, `getRoleWithUsers`.

---

## 23. Proposed UI / UX Plan

### Routes

| Route | Changes |
|---|---|
| `/admin/roles` | Pass `canManage`; optional category/assignability columns |
| `/admin/roles/record/new` | Fix permission guard; extended form fields |
| `/admin/roles/record/[id]` | Load role + optional prefetch counts; 4 workspace sections |

### Role workspace sections

| Section | ID | Content |
|---|---|---|
| Overview / Role Details | `overview` | All scalar fields + system role banner |
| Permissions | `permissions` | `RolePermissionsSection` |
| Assigned Users | `assigned-users` | `RoleAssignedUsersSection` |
| Audit Info | `audit` | Created/updated timestamps; link to audit module (read-only) |

### New components (execution)

| Component | Purpose |
|---|---|
| `role-constants.ts` | Category/level option arrays |
| `role-assigned-users-section.tsx` | Assigned users table |
| `role-permissions-section.tsx` | Grouped permission toggles |
| `clone-role-dialog.tsx` | `ERPChildDialogForm` clone workflow |
| `role-overview-section.tsx` | Extract from workspace form |

### ERP UI standards compliance

- `ERPRecordWorkspaceForm` for main record ✓
- `ERPChildDialogForm` for clone dialog
- `ERPCombobox` if category/level become dynamic later (v1: native select acceptable for static constants)
- `AlertDialog` for deactivate/delete/deassign confirmations
- `forceCloseActiveTab` after save-and-close ✓
- No nested buttons in `DropdownMenuTrigger` ✓

### Retire

- `role-detail-drawer.tsx` — delete after workspace sections verified

---

## 24. Proposed Database / SQL Plan

### Migration required?

**No schema migration required** for core USERS.3 scope. All needed columns exist (002D).

### Optional migration (Sameer approval)

**File (if approved):** `supabase/migrations/20260703000000_erp_users_3_roles_enhancement_seed.sql`

**Contents (draft only — do not apply in planning):**

```sql
-- Optional: populate display_name / role_category / role_level for seeded system roles
UPDATE roles SET display_name = role_name, role_category = 'Admin', role_level = 'Global'
WHERE role_code IN ('system_admin', 'group_admin') AND display_name IS NULL;

-- ... similar batches for manager roles ...

-- Optional: deprecate test artifact (ONLY after Sameer confirms)
-- UPDATE roles SET is_assignable = false, is_active = false WHERE role_code = 'test_role';
```

| Aspect | Assessment |
|---|---|
| Risk level | Low (data-only) |
| Rollback | Reverse UPDATE |
| Fresh install | Compatible — seeds can include display fields in foundation later |
| Live DB | Compatible |

**No new permissions seed recommended.**

---

## 25. Permission and RBAC Plan

### Existing permissions (sufficient for v1)

| Permission | Use in USERS.3 |
|---|---|
| `roles.view` | List roles, view record, view assigned users, view permissions |
| `roles.manage` | Create, edit, clone, status, permission assign/remove |
| `permissions.view` | Read permission metadata in role permissions section |
| `users.view` | Required (via RLS) to see assigned user details |
| `users.update` / `canManageUsers` | Deassign user from role (if included) |

### Access matrix

| Action | Who |
|---|---|
| View roles | `roles.view` |
| Create custom role | `roles.manage` (fix page guard) |
| Edit custom role | `roles.manage` |
| Edit system role fields | Global admin (`isGlobalAdmin`) |
| Clone role | `roles.manage` |
| Toggle permissions (custom role) | `roles.manage` |
| Toggle permissions (system role) | Global admin only (recommended) |
| View assigned users | `roles.view` + scoped `users.view` via RLS |
| Deassign from role detail | `canManageUsers` + RLS assignment scope |
| Activate/deactivate role | `roles.manage` (+ lockout rules) |

**No new permission codes recommended.**

---

## 26. Audit Logging Plan

### Events

| Action code | Trigger | Safe metadata |
|---|---|---|
| `create` | Custom role created | role_code, role_name, category, is_assignable |
| `update` | Role fields changed | diff of scalar fields (no secrets) |
| `status_change` | Activate/deactivate | `{ is_active }` |
| `delete` | Custom role deleted | role_code |
| `ROLE_CLONED` | Clone success | source_role_code, new_role_code, permissions_copied_count |
| `assign_permission` | Existing | role_code, permission_code |
| `remove_permission` | Existing | role_code, permission_code |
| `assign_role` | From user flow | existing |
| `remove_role` / deassign | From role detail | user_code, role_code, scope |

**Never log:** auth tokens, passwords, session data.

---

## 27. Backward Compatibility and Data Preservation Plan

- All existing roles, permissions, and assignments preserved
- No column drops or renames
- Custom roles (0 today) will start appearing after clone/create — no migration of existing data required
- API/action signatures extended, not broken (additive schema fields)
- Global permissions matrix continues to work
- Export on roles table (if present) gains new columns optionally

---

## 28. USERS.1 / USERS.2 / USERS.2A Regression Protection Plan

### Must not change

- `(protected)/layout.tsx` inactive/suspended gate
- `(protected)/layout.tsx` `must_change_password` gate
- `/signup` disabled behavior
- `account-security.ts` password lifecycle actions
- User list toolbar, security section, assign role dialog (except server validation addition)
- FORCE RLS on all Users/RBAC tables
- Last `system_admin` user/assignment guards

### Smoke routes after USERS.3

```text
/login → /dashboard
/admin/users → list + record
/admin/roles → list + record + clone
/admin/permissions → matrix toggle
/change-password-required (if flag set)
/account-disabled (if inactive)
/admin/hr/employees (HR smoke)
/dms/documents (DMS smoke)
```

---

## 29. Implementation Sequence for Future USERS.3 Execution

| Step | Task | Depends on |
|---|---|---|
| 1 | Fix `roles.create` → `roles.manage` | — |
| 2 | Extend `role-schema.ts` + role constants | — |
| 3 | Update `createRole` / `updateRole` / `updateRoleStatus` hardening | Step 2 |
| 4 | Fix `assigned_at` / enrich `getRoleWithUsersAction` | — |
| 5 | Add `listAssignableRoles`; enforce in `assignRoleToUser` | — |
| 6 | Implement `cloneRole` action | Step 2, 3 |
| 7 | Build workspace sections (overview, permissions, assigned users, audit) | Steps 3, 4 |
| 8 | `CloneRoleDialog` + list/record actions | Step 6 |
| 9 | Harden permission assign/remove for system roles | — |
| 10 | RolesTable `canManage` + new columns | — |
| 11 | Remove `RoleDetailDrawer` | Step 7 |
| 12 | Optional seed migration (if approved) | Sameer sign-off |
| 13 | `tsc`, build, vitest, browser UAT, reports, SOT update | All |

---

## 30. Acceptance Criteria for Future Implementation

| ID | Criterion |
|---|---|
| AC-01 | Role list shows role advanced fields/status clearly (category or assignability badge minimum) |
| AC-02 | Custom role create/edit supports approved advanced fields |
| AC-03 | System roles remain protected from unsafe edit/delete |
| AC-04 | Clone role creates custom role with copied permissions and `is_system_role=false` |
| AC-05 | Role permissions visible in role record, grouped by module |
| AC-06 | Assigned users visible in role record with scope and status |
| AC-07 | `is_assignable=false` roles cannot be assigned (server enforced) |
| AC-08 | Inactive roles cannot be assigned (server enforced) |
| AC-09 | `assigned_at` field bug fixed; `assigned_by` shown when present |
| AC-10 | All role mutations audited safely |
| AC-11 | USERS.1 inactive/suspended blocking remains intact |
| AC-12 | USERS.2 user list/search/security section remains intact |
| AC-13 | USERS.2A password lifecycle remains intact |
| AC-14 | FORCE RLS remains enabled on roles/permissions/user_roles |
| AC-15 | TypeScript, build, tests, and browser UAT pass |
| AC-16 | Source of Truth updated after implementation |
| AC-17 | No USERS.4+ features implemented early |

---

## 31. Test Plan and Browser UAT Plan

### Automated

| Test | Command / tool |
|---|---|
| TypeScript | `npx tsc --noEmit` |
| Build | `npm run build` |
| Unit/integration | `npm run test` / vitest if role tests added |

### Manual / browser UAT scenarios

| ID | Scenario | Expected |
|---|---|---|
| UAT-01 | Roles list loads for `roles.view` user | Table renders |
| UAT-02 | View-only user cannot see edit/delete/clone | Actions hidden |
| UAT-03 | Add custom role with advanced fields | Saved; appears in list |
| UAT-04 | Edit custom role category/level/assignability | Persists |
| UAT-05 | System role edit blocked for company admin | Error message |
| UAT-06 | Global admin edits system role display_name | Saves with audit |
| UAT-07 | Clone system role → custom role | New code; permissions copied |
| UAT-08 | Cloned role `is_system_role=false` | Verified in DB/UI |
| UAT-09 | Role permissions tab shows grouped permissions | Matches matrix |
| UAT-10 | Toggle permission on custom role | Persists after refresh |
| UAT-11 | System role permission toggle blocked for non-global admin | Error/banner |
| UAT-12 | Assigned users tab shows scope + status | Correct labels |
| UAT-13 | Assigned at date correct | Not conflated with created_at |
| UAT-14 | Assign inactive role to user | Server rejection |
| UAT-15 | Assign non-assignable role | Server rejection |
| UAT-16 | Deactivate `system_admin` role | Blocked |
| UAT-17 | Last system_admin user deactivate | Still blocked (USERS.1) |
| UAT-18 | Force password gate still works | USERS.2A |
| UAT-19 | Inactive user still blocked | USERS.1 |
| UAT-20 | HR employees list + DMS smoke | No regression |

### UAT credentials

Use credentials provided by Sameer in the active chat if available. **Do not commit or store credentials in reports or logs.**

---

## 32. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Accidental lockout via permission removal | System-role edit restricted to global admin; confirm dialogs; minimum permission guards on `system_admin` |
| RLS hides assigned users for scoped admin | Document behavior; global admin validates full list |
| Clone copies too many permissions | Show count in dialog; audit log |
| Permissions matrix / role tab stale state | `router.refresh()` + optimistic UI |
| `test_role` deletion breaks tests | Sameer confirmation before cleanup |
| Scope creep into USERS.4 | Strict defer list; role tab read-only effective-permission summary deferred |

---

## 33. Items Explicitly Deferred to USERS.4 or Later

- Effective permissions per user (computed view)
- Permission catalog redesign / `module_code` normalization
- Bulk permission update API
- Per-user audit tab on role record
- Role archiving column / soft-delete beyond `is_active`
- MFA / session management
- HR employee ↔ user linking
- Global security dashboard
- Full audit log pagination UI

---

## 34. Source-of-Truth Update Plan

**After implementation only** (not during planning):

Update `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`:

```text
- Mark USERS.3 CLOSED with report filename
- List files changed (roles actions, queries, features, migrations if any)
- Note: roles.create bug fixed → roles.manage
- Note: RoleDetailDrawer removed
- Next phase: USERS.4 planning-first only
```

Create:

```text
implementation_Review/ERP_USERS_3_ROLES_MANAGEMENT_ENHANCEMENT_IMPLEMENTATION_REPORT.md
implementation_Review/ERP_USERS_3_BROWSER_UAT_VERIFICATION_REPORT.md
```

---

## 35. Recommended Next Cursor Implementation Prompt Summary

When Sameer approves this plan, the implementation prompt should instruct Cursor to:

1. Read this plan + USERS.1/2/2A closure reports + SOT
2. Implement in sequence §29 without USERS.4 scope
3. Fix `roles.create` guard immediately
4. No new permissions unless blocker found
5. Use `ERPRecordWorkspaceForm` sections + `ERPChildDialogForm` for clone
6. Preserve all regression gates from §28
7. Run `tsc`, build, tests, browser UAT
8. Produce implementation + UAT reports and update SOT
9. Do not apply optional `test_role` cleanup without explicit Sameer approval in that chat

---

## 36. Final Recommendation

**Proceed with USERS.3 implementation** after ChatGPT review. The database is already prepared (002D columns); the work is primarily **UI completion, server hardening, and workflow glue** — not greenfield schema design.

**Highest ROI items:**

1. Fix `roles.create` / Add Role blocked bug  
2. Wire advanced fields into form + actions  
3. Fix `assigned_at` bug and ship Assigned Users workspace section  
4. Add Permissions section (Option B) with system-role guard  
5. Implement clone role for custom role creation from seeded templates  

**No schema migration is required** for the core deliverable. Optional seed/cleanup SQL is a separate Sameer decision.

USERS.3 can be implemented as a focused phase without weakening USERS.1, USERS.2, or USERS.2A controls, provided system-role and last-admin guards are extended consistently in status and permission mutations.

---

*End of planning document — USERS.3 Roles Management Enhancement (planning only)*
