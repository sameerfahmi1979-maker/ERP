
# ERP USERS.4 - Permissions and Effective Access Plan

## 1. Executive Summary

USERS.4 addresses the core UX and architectural gap identified after USERS.3: all authenticated users can see the entire
sidebar regardless of their assigned permissions. A limited-permission user sees every menu item, clicks an unauthorized
route, and is shown a technical developer message: "Your account does not yet have the dashboard.view permission. Assign
roles after migration and admin bootstrap." This message is unacceptable in a production ERP environment.

This plan covers:
- Permission-aware sidebar and menu filtering (UX-only; server-side guards remain untouched)
- An effective permissions engine explaining WHY a user has a permission (role + scope source)
- A User Effective Access section inside /admin/users/record/[id]
- A Route Access Registry that maps sidebar items to required permissions
- Improved default landing logic so limited users are not stranded on /dashboard
- User-friendly no-access and access-denied pages replacing technical messages
- A Permission Catalog normalization sub-plan (deferred to USERS.4A)
- Scoped access explanation (global, company, branch)

Security principle preserved throughout:
- Sidebar hiding is UX only
- Route-level permission checks remain mandatory
- Server actions remain mandatory
- RLS remains mandatory
- Inactive/suspended user blocks (USERS.1) remain mandatory
- must_change_password gate (USERS.2A) remains mandatory

Nothing in this document modifies source code, DB schema, RLS, permissions, or Supabase data.

---

## 2. Planning Scope and Non-Implementation Rule

This is a **planning-only document**. The following actions are explicitly forbidden in this phase:

- Modifying any TypeScript/TSX source file
- Modifying any Next.js page, layout, component, server action, or hook
- Applying or writing any Supabase migration SQL
- Changing any DB schema, table, column, RLS policy, or row
- Changing any permission, role, or user_role data in the database
- Creating any new ERP module, route, or UI component

The output of this phase is solely:
  implementation_Review/ERP_USERS_4_PERMISSIONS_AND_EFFECTIVE_ACCESS_PLAN.md

Sameer will review this file with ChatGPT before any implementation begins.

---

## 3. USERS.1 / USERS.2 / USERS.2A / USERS.3 Closure Context

| Phase     | Status      | Key Deliverable                                          |
|-----------|-------------|----------------------------------------------------------|
| USERS.1   | COMPLETE    | Auth, RLS, account status guards, RBAC foundation        |
| USERS.2   | COMPLETE    | User management UI, invite, assign roles                 |
| USERS.2A  | COMPLETE    | Password lifecycle, security actions, must_change_password |
| USERS.3   | COMPLETE    | Roles management: clone, system-role protection, permissions section, assigned users section |

After USERS.3:
- 17 roles exist (all system roles). No user-created custom roles yet.
- Role workspace form is fully implemented with Permissions and Assigned Users tabs.
- server_admin and group_admin bypass all permission checks in hasPermission().
- The sidebar still shows all menu items to all authenticated users.
- No route access registry / permission mapping for sidebar items exists.
- getAuthContext() makes 3-4 DB round trips with no caching.

---

## 4. Files, Rules, Reports, and Source-of-Truth Reviewed

### Implementation Reports Read
- implementation_Review/ERP_USERS_1_SECURITY_FOUNDATION_IMPLEMENTATION_REPORT.md
- implementation_Review/ERP_USERS_1_BROWSER_UAT_VERIFICATION_REPORT.md
- implementation_Review/ERP_USERS_2_USER_MANAGEMENT_CORE_IMPLEMENTATION_REPORT.md
- implementation_Review/ERP_USERS_2_BROWSER_UAT_VERIFICATION_REPORT.md
- implementation_Review/ERP_USERS_2A_PASSWORD_LIFECYCLE_ACCOUNT_SECURITY_IMPLEMENTATION_REPORT.md
- implementation_Review/ERP_USERS_2A_BROWSER_UAT_VERIFICATION_REPORT.md
- implementation_Review/ERP_USERS_3_ROLES_MANAGEMENT_ENHANCEMENT_PLAN.md
- implementation_Review/ERP_USERS_3_ROLES_MANAGEMENT_ENHANCEMENT_IMPLEMENTATION_REPORT.md
- implementation_Review/ERP_USERS_3_BROWSER_UAT_VERIFICATION_REPORT.md

### Code Files Inspected
- src/lib/rbac/check.ts                          (RBAC runtime)
- src/app/(protected)/layout.tsx                 (Protected layout)
- src/components/layout/app-sidebar.tsx          (Sidebar component)
- src/components/layout/erp-shell.tsx            (ERP shell wrapper)
- src/lib/workspace/workspace-route-registry.ts  (Route registry)
- src/app/(protected)/dashboard/page.tsx         (Dashboard with dashboard.view check)
- src/app/(protected)/admin/users/page.tsx       (Users list with users.view check)
- src/app/(protected)/admin/roles/page.tsx       (Roles list with roles.manage check)
- src/app/(protected)/admin/permissions/page.tsx (Permissions list)
- src/app/(protected)/admin/audit/page.tsx       (Audit with audit.view check)
- ~160+ protected page.tsx files (via grep for hasPermission/requirePermission)

### DB Tables Queried (Read-Only, user-supabase MCP)
- permissions (full catalog)
- roles (all roles with is_system_role, is_active, is_assignable)
- role_permissions (permission count per role)
- user_roles (not directly queried but understood from code)

---

## 5. Supabase MCP Read-Only Review Summary

### Total Permission Count by Module

| module_code    | total | active | system |
|----------------|-------|--------|--------|
| AI             | 33    | 33     | 33     |
| audit          | 1     | 1      | 1      |
| branches       | 2     | 2      | 2      |
| COMMON_MD      | 18    | 18     | 18     |
| dashboard      | 1     | 1      | 1      |
| dms (lower)    | 1     | 1      | 1      |
| DMS (upper)    | 58    | 58     | 58     |
| erp            | 1     | 1      | 1      |
| finance        | 1     | 1      | 1      |
| fleet          | 1     | 1      | 1      |
| hr (lower)     | 1     | 1      | 1      |
| HR (upper)     | 35    | 35     | 35     |
| hse            | 1     | 1      | 1      |
| inventory      | 1     | 1      | 1      |
| master_data    | 19    | 19     | 19     |
| MASTER_DATA    | 24    | 24     | 24     |
| NOTIFICATIONS  | 10    | 10     | 10     |
| numbering      | 5     | 5      | 5      |
| operations     | 1     | 1      | 1      |
| organizations  | 2     | 2      | 2      |
| PARTIES        | 4     | 4      | 4      |
| permissions    | 2     | 2      | 2      |
| procurement    | 1     | 1      | 1      |
| rental         | 1     | 1      | 1      |
| REPORTS        | 11    | 11     | 11     |
| roles          | 2     | 2      | 2      |
| settings       | 2     | 2      | 2      |
| SETTINGS       | 11    | 11     | 11     |
| users          | 5     | 5      | 5      |
| workshop       | 1     | 1      | 1      |

**Total: ~256 permissions across 30 module_code values**

Note: All permissions are is_active=true and is_system_permission=true.
No inactive or custom user-created permissions exist.

### Key Observations from Supabase
1. Mixed module_code casing: dms/DMS, hr/HR, master_data/MASTER_DATA, settings/SETTINGS
2. PARTIES (4 perms) and MASTER_DATA (24 perms) appear to be different modules for the same domain
3. dms_manager, inventory_manager, and rental_manager have 0 permissions - they are empty shells
4. system_admin has 256 permissions (all); group_admin has 167; company_admin has 104
5. read_only_user has 4 permissions; employee_self_service has 2
6. All 17 roles are system roles. No user-created custom roles exist yet.

---

## 6. Current Permission Catalog Audit

### Module Code Casing Inconsistency (Critical Gap)

The permissions table has duplicate module codes due to mixed casing. This causes grouping failures in the permissions matrix UI because GROUP BY module_code is case-sensitive in PostgreSQL by default.

Affected pairs:
- dms (1 permission: dms.admin?) vs DMS (58 permissions) - should all be DMS
- hr (1 permission: hr.admin?) vs HR (35 permissions) - should all be HR
- master_data (19 permissions: geography, lookups, uom, finance_basics, dashboard) vs MASTER_DATA (24 permissions: parties) - inconsistent domain
- settings (2 permissions: settings.view, settings.manage) vs SETTINGS (11 permissions: email, ai settings) - should all be SETTINGS
- PARTIES (4 permissions: master_data.party_master.*) vs MASTER_DATA - overlap

### Specific Permissions Used in Code vs DB

#### branches module (code uses: branches.create, branches.view, branches.manage)
DB has: branches.manage, branches.view
MISSING from DB: branches.create
Code at admin/branches/record/new/page.tsx uses hasPermission(ctx, "branches.create") which will always fail for non-admin users.

#### users module (code uses: users.view, users.create, users.update, users.delete, users.security.manage)
DB has: users.view, users.create, users.update, users.delete, users.security.manage
All present - OK.

#### roles module (code uses: roles.view, roles.manage)
DB has: roles.view, roles.manage
All present - OK.

#### permissions module (code uses: permissions.view, permissions.manage)
DB has: permissions.view, permissions.manage
All present - OK.

#### dashboard module (code uses: dashboard.view)
DB has: dashboard.view
Present - OK. But NOTE: many routes redirect to /dashboard when access denied. If user lacks dashboard.view, they hit the Limited Access screen.

#### common_md module (code uses: common_md.view, common_md.manage, common_md.departments.view, etc.)
DB has: COMMON_MD module with common_md.view, common_md.manage and granular sub-permissions.
Code queries match DB permission codes (case of permission_code is fine), but module_code in DB is COMMON_MD (uppercase) while the permissions themselves are lowercase dotted.

#### organizations module (code uses: organizations.view, organizations.manage)
DB has: organizations.view, organizations.manage (module: organizations lowercase) - OK.

### Old / Deprecated Permission Strings
The plan requires checking for uses of: users.manage, roles.edit, roles.create, system.admin.

From code inspection:
- users.manage: NOT found in DB, NOT found in active code (canManageUsers() composite helper exists instead)
- roles.edit: NOT found in DB. NOT found in code.
- roles.create: NOT found in DB. Was briefly used in record/new/page.tsx (fixed in USERS.3 to roles.manage).
- system.admin: NOT found in DB. erp.admin is the equivalent (1 permission, module erp).
- No stale permission strings found in active server actions.

### Inactive Permissions
None. All 256 permissions have is_active=true.

### Permissions Used in Code but Missing from DB (Summary)
| Missing Code     | Used In                           | Risk   |
|------------------|-----------------------------------|--------|
| branches.create  | admin/branches/record/new/page.tsx | Medium |

### Role Completeness Issues
| Role Code         | Permission Count | Problem                                  |
|-------------------|-----------------|------------------------------------------|
| dms_manager       | 0               | Cannot access any DMS route with a check |
| inventory_manager | 0               | Placeholder role only                   |
| rental_manager    | 0               | Placeholder role only                   |

---

## 7. Current Role Permission Mapping Audit

### Role Summary (from live Supabase query)

| role_code              | is_system | is_active | is_assignable | perms |
|------------------------|-----------|-----------|---------------|-------|
| system_admin           | yes       | yes       | yes           | 256   |
| group_admin            | yes       | yes       | yes           | 167   |
| company_admin          | yes       | yes       | yes           | 104   |
| hr_manager             | yes       | yes       | yes           | 45    |
| hse_manager            | yes       | yes       | yes           | 14    |
| operations_manager     | yes       | yes       | yes           | 11    |
| procurement_manager    | yes       | yes       | yes           | 9     |
| finance_manager        | yes       | yes       | yes           | 17    |
| branch_admin           | yes       | yes       | yes           | 19    |
| fleet_manager          | yes       | yes       | yes           | 1     |
| workshop_manager       | yes       | yes       | yes           | 1     |
| read_only_user         | yes       | yes       | yes           | 4     |
| employee_self_service  | yes       | yes       | yes           | 2     |
| dms_manager            | yes       | yes       | yes           | 0     |
| inventory_manager      | yes       | yes       | yes           | 0     |
| rental_manager         | yes       | yes       | yes           | 0     |
| test_role              | yes       | yes       | yes           | 6     |

### Key Findings

1. system_admin has all 256 permissions. hasPermission() additionally short-circuits for system_admin and group_admin regardless of the actual role_permissions rows.

2. group_admin has 167 permissions - does NOT have all permissions. This means group_admin relies on the hasPermission() bypass (roleCodes.includes("group_admin") returns true for all permission checks). This is intentional but undocumented.

3. dms_manager, inventory_manager, rental_manager have 0 permissions. These users can only access routes that are not permission-guarded, or routes they access via a parent module permission. The dms_manager role is particularly problematic since DMS has full permission guards.

4. No custom roles exist yet. All 17 roles are system roles.

5. No cloned roles from USERS.3 exist yet (test_role is the only non-standard role, 6 perms).

6. Duplicate role_permissions rows: not verified from code, but no indication of duplicates from count data.

7. Inactive roles: no inactive roles exist. All 17 roles are is_active=true.

8. role_permissions does NOT have is_active flag. The active/inactive state is on the role itself and on user_roles.is_active.

### Does system_admin have ALL permissions?
Yes - system_admin has 256 permissions and additionally bypasses hasPermission() checks entirely.

### Does group_admin have expected permissions?
group_admin has 167 permissions but also bypasses hasPermission() via the roleCodes check. This means group_admin effectively has all permissions regardless of role_permissions rows.

### Inactive role impact
Currently none - all roles are active. But getAuthContext() filters user_roles by is_active=true (user role assignment), not roles.is_active (role master). This means if a role is deactivated at the master level, its permissions are still loaded if the user_role assignment is active. This is a minor gap.

---

## 8. Current RBAC Runtime Audit

### File: src/lib/rbac/check.ts

#### getAuthContext() behavior

Structure:
  AuthContext = {
    profile: UserProfile | null,
    roleCodes: string[],
    permissionCodes: string[],
    accountStatus: "active" | "inactive" | "suspended" | "none",
    isAccountActive: boolean
  }

DB calls made on every invocation (no caching):
  1. supabase.auth.getUser() - auth session check
  2. user_profiles.select("*") - full profile row
  3. user_roles JOIN roles - active role codes + role IDs
  4. role_permissions JOIN permissions - all permission codes for those roles

Performance: 4 sequential DB round-trips per server action or page render that calls getAuthContext().
With 10+ server-rendered pages per session, this is 40+ unnecessary DB calls. No caching layer exists.

#### Does getAuthContext filter inactive roles?
PARTIAL: It filters user_roles by user_roles.is_active=true (assignment-level active).
It does NOT filter by roles.is_active (role master active flag).
Impact: if a role is deactivated at master level (roles.is_active=false), its permissions still load if the user_role assignment remains active.

#### Does getAuthContext filter inactive permissions?
NO: It queries role_permissions and joins permissions without filtering permissions.is_active.
Currently all permissions are active so no impact, but this is a correctness gap.

#### Does getAuthContext include scoped roles?
NO: user_roles has scope_type (global/company/branch), owner_company_id, and branch_id columns.
getAuthContext() ignores all scope columns. A company-scoped role grants the same permission codes as a global role in the current implementation. Scope enforcement is done at the RLS/DB layer, not in the RBAC runtime.

#### Does getAuthContext explain why a permission exists?
NO: permissionCodes is a flat string[]. No source information (which role granted it, what scope, etc.).

#### Can it power menu filtering safely?
YES with minor changes: permissionCodes is already available. The sidebar can receive this array and filter items. No security risk as long as server-side checks remain.

#### hasPermission() behavior
  hasPermission(ctx, permissionCode):
    return permissionCodes.includes(permissionCode)
        || roleCodes.includes("system_admin")
        || roleCodes.includes("group_admin")

The system_admin and group_admin bypass means these users always pass any hasPermission check.
This is correct behavior but creates a subtle issue: if system_admin or group_admin does NOT have
a specific permission in role_permissions, hasPermission still returns true for them but permissionCodes
does NOT contain that permission code. When we build sidebar filtering from permissionCodes alone,
system_admin and group_admin would incorrectly fail permission checks unless we add bypass logic.

#### requirePermission() behavior
Calls getAuthContext() (another 4 DB calls), assertAccountActive(), then hasPermission().
No optimization. Acceptable for server actions but expensive if called frequently.

#### isGlobalAdmin() behavior
  return roleCodes.includes("system_admin") || roleCodes.includes("group_admin")
Used in several pages and the roles form to determine edit rights. Correct.

#### canManageUsers() behavior
Composite check: true if user has any of users.create, users.update, users.delete.
This is a workaround for the absent users.manage permission code. Documented in code comments.

#### Summary of RBAC Gaps

| Gap | Description | Priority |
|-----|-------------|----------|
| No caching | 4 DB calls per page/action render | Medium |
| No inactive role filter | Deactivated roles still grant permissions | Low |
| No inactive permission filter | Inactive perms still loaded (no inactive perms yet) | Low |
| No scope awareness | Scoped roles have same codes as global | Low (RLS handles it) |
| No permission source info | Cannot explain why user has a permission | High (USERS.4 target) |
| No sidebar integration | permissionCodes not passed to sidebar | High (USERS.4 target) |
| branches.create missing | Code checks it, DB lacks it | Medium |

---

## 9. Current Sidebar and Menu Visibility Audit

### File: src/components/layout/app-sidebar.tsx

AppSidebar is a pure client component that receives only: collapsed, onToggle, displayName, email.
It receives NO permission codes. It has NO permission-aware filtering logic.

### Current Menu Sections (all visible to all users)

| Section        | Items                                                          |
|----------------|----------------------------------------------------------------|
| Overview       | Dashboard, Notifications                                       |
| Human Resource | HR subsections (employees, attendance, recruitment, payroll, operations, settings) |
| Documents      | DMS dashboard, All Documents, Upload Inbox, Batch Intake, Review Queue, Expiry, Notifications, DMS Admin subsection |
| Operations     | Fleet, Workshop, HSE (all disabled: true)                     |
| Finance/Supply | Finance, Inventory, Procurement (all disabled: true)          |
| Reports        | Report Center, Templates, History, Schedules                  |
| Master Data    | Common MD, Geography, Party Master, Finance Basics, Units & Measurements |
| Administration | Users, Organizations, Branches, Roles, Permissions, Numbering, Email, Notifications, Email Queue, Templates, Logs, Master Data, Lookups, Audit, AI subsection |

Total visible items: ~80+ nav items, all visible to every authenticated user.

### How ErpShell passes data to AppSidebar
File: src/components/layout/erp-shell.tsx

  ErpShell({ children, displayName, email }) {
    return (
      <AppSidebar displayName={displayName} email={email} ... />
    )
  }

ErpShell does NOT receive auth context. Protected layout (layout.tsx) queries only:
  user_profiles.select("display_name, full_name, status, must_change_password")

No permissionCodes, no roleCodes, no auth context is passed to ErpShell or AppSidebar.

### disabled vs coming-soon items
Some items have disabled: true (Fleet, Workshop, HSE, Finance, Inventory, Procurement).
These render as grayed-out, non-clickable items. Currently there is no "comingSoon" flag.

### Current UX problem
1. Limited user logs in
2. All 80+ menu items are visible
3. User clicks "Users" (requires users.view) - sees access denied inline message with technical text
4. User clicks "Dashboard" (requires dashboard.view) - sees "Limited access / Your account does not yet have the dashboard.view permission. Assign roles after migration and admin bootstrap."
5. Experience is confusing and unprofessional

### Sidebar filtering design (what currently blocks text-based filtering)
The sidebar has a search/filter input ("Filter menu...") that filters by label text.
This is a pure UX filter, not permission-based.
There is no mechanism for permission-based item filtering in the current component.

### AppSidebar NavItem interface
  interface NavItem {
    label: string;
    icon: LucideIcon;
    path: string;
    disabled?: boolean;
  }
No requiredPermission or requiredAnyPermissions field exists.

---

## 10. Current Route-Level Permission Audit

### Protected Layout
src/app/(protected)/layout.tsx only checks:
  1. Is user authenticated? (redirect /login if not)
  2. Is account active? (redirect /account-disabled if not)
  3. must_change_password? (redirect /change-password-required if yes)

No permission checks at layout level. Permission checks are per-page.

### Route Permission Map (sampled - not exhaustive)

| Route                               | Permission Required                           | Status      |
|-------------------------------------|-----------------------------------------------|-------------|
| /dashboard                          | dashboard.view                                | Guarded     |
| /admin/users                        | users.view                                    | Guarded     |
| /admin/users/record/new             | users.create                                  | Guarded     |
| /admin/users/record/[id]            | users.view                                    | Guarded     |
| /admin/roles                        | roles.manage                                  | Guarded     |
| /admin/roles/record/new             | roles.manage                                  | Guarded     |
| /admin/roles/record/[id]            | roles.view                                    | Guarded     |
| /admin/permissions                  | permissions.view                              | Guarded     |
| /admin/audit                        | audit.view                                    | Guarded     |
| /admin/branches                     | branches.view                                 | Guarded     |
| /admin/branches/record/new          | branches.create (NOT IN DB)                   | Guarded - broken perm |
| /admin/organizations                | organizations.view                            | Guarded     |
| /admin/settings/email               | settings.email.view OR settings.email.manage  | Guarded     |
| /admin/settings/ai                  | settings.ai.view OR settings.ai.manage        | Guarded     |
| /admin/settings/numbering           | (checked in subpages but not list page - gap) | Partial     |
| /admin/notifications                | notifications.manage OR notifications.view    | Guarded     |
| /admin/notifications/email-queue    | notifications.email_queue.view                | Guarded     |
| /admin/notifications/templates      | notifications.templates.view                  | Guarded     |
| /admin/notifications/logs           | notifications.logs.view                       | Guarded     |
| /admin/reports                      | reports.view OR reports.manage                | Guarded     |
| /admin/reports/schedules            | reports.schedule.view OR .manage              | Guarded     |
| /admin/reports/history              | reports.view OR reports.history.view          | Guarded     |
| /admin/master-data                  | No direct permission check (utility page)     | UNGUARDED   |
| /admin/master-data/lookups/...      | master_data.lookups.view                      | Guarded     |
| /admin/master-data/geography/...    | master_data.geography.view                    | Guarded     |
| /admin/master-data/finance-basics/. | master_data.finance_basics.view               | Guarded     |
| /admin/master-data/uom/...          | master_data.uom.view                          | Guarded     |
| /admin/master-data/parties/...      | master_data.parties.view                      | Guarded     |
| /admin/common-master-data           | No direct check (landing page)                | UNGUARDED   |
| /admin/common-master-data/depart... | common_md.view OR common_md.departments.view  | Guarded     |
| /admin/hr/employees                 | hr.employees.view                             | Guarded     |
| /admin/hr/dashboard                 | hr.* (some check)                             | Guarded     |
| /dms                                | dms.documents.view OR dms.admin               | Guarded     |
| /dms/documents                      | dms.documents.view                            | Guarded     |
| /dms/inbox                          | dms.documents.upload OR dms.admin             | Guarded     |
| /dms/review-queue                   | dms.review_queue.view OR multiple             | Guarded     |

### Routes with NO Permission Check (Gaps)

These routes exist in the sidebar and route registry but have no explicit hasPermission call:
- /admin/master-data (hub page - utility, may be intentionally open)
- /admin/common-master-data (hub page - utility)
- /admin/hr/... several sub-pages with only role-code checks (ctx.roleCodes.includes("system_admin"))
- /notifications (user-facing notification list - likely intentionally open to all active users)
- /profile, /settings (user profile - should be open to all active users)

### Redirect to /dashboard Issue
Many guarded routes redirect to /dashboard on access denial:
  if (!hasPermission(ctx, "master_data.uom.view")) redirect("/dashboard");

If the user lacks dashboard.view, they will hit /dashboard and see the "Limited access" error.
This creates a bad UX loop for limited-permission users.

### Route Registry: No Permission Metadata
WorkspaceRouteConfig has no requiredPermission field.
The registry is used solely for tab metadata (title, icon, kind, singleton, moduleCode).
No access control metadata is stored there.

---

## 11. Confirmed Problems and Gaps

### P1 - CRITICAL (affects all limited users)
P1-A: Sidebar shows all 80+ items to all authenticated users regardless of permissions.
P1-B: Limited user clicking any unauthorized route sees technical developer messages.
P1-C: Users with no permissions are redirected to /dashboard which itself requires dashboard.view, showing another error. No clean landing page exists for users with zero permissions.

### P2 - HIGH
P2-A: No effective permissions explanation. Admin cannot answer "why can this user access HR payroll?".
P2-B: branches.create permission code is used in code but does not exist in DB. The New Branch route is broken for non-admin users who should have branches.create.
P2-C: dms_manager role has 0 permissions. Users with this role cannot access any DMS route that has a permission check.
P2-D: getAuthContext() makes 4 DB round-trips with no caching. On a typical session this adds latency.

### P3 - MEDIUM
P3-A: Module code casing is inconsistent (dms/DMS, hr/HR, master_data/MASTER_DATA, settings/SETTINGS). This causes incorrect grouping in the permissions matrix UI.
P3-B: getAuthContext() does not filter by roles.is_active (only by user_roles.is_active). Deactivated roles at master level still grant permissions.
P3-C: getAuthContext() does not filter inactive permissions (no inactive perms exist yet, but the gap exists).
P3-D: Route access registry has no requiredPermission metadata, making systematic sidebar filtering harder.
P3-E: Redirect targets of guarded pages all point to /dashboard. Limited users hit a permission error when redirected there.

### P4 - LOW
P4-A: Scope (company/branch) information is absent from AuthContext. Can be addressed in a later phase.
P4-B: Permission catalog has some low-detail placeholder perms (finance.view, fleet.view, inventory.view, rental.view etc.) that have 0 actual routes using them.
P4-C: test_role exists as a system role. Should be either deleted or converted to a custom role.
P4-D: PARTIES module (4 perms) vs MASTER_DATA module (24 perms for parties) - duplicate/inconsistent domain grouping.

---

## 12. Effective Permissions Engine Options

### Option A: Enrich getAuthContext() in-place
Add sourceInfo to permissionCodes: return Array<{code, roleCode, scopeType}> instead of string[].
Pros: Single function, backward-compatible via overload.
Cons: Breaking change to AuthContext type; all hasPermission callers use string codes.

### Option B: New parallel function getEffectivePermissions(userProfileId)
A separate server-side function that returns detailed permission source data.
getAuthContext() remains unchanged.
getEffectivePermissions() is only called for the Effective Access UI.
Pros: No breaking change. Isolated. Callable for any user (admin viewing another user).
Cons: Code duplication of some DB query logic.

### Option C: DB View / RPC
Create a Postgres view or function that joins user_roles, roles, role_permissions, permissions.
Query it from TypeScript.
Pros: Single source of truth in DB. Reusable.
Cons: Schema change needed. More maintenance surface.

### Recommended: Option B (new parallel function in src/server/queries/effective-permissions.ts)

Rationale:
- No breaking changes to existing getAuthContext() or hasPermission()
- Can be called with any userProfileId (admin viewing another user's access)
- Returns richer data including scope, source role, role name, company/branch label
- Can filter inactive roles and inactive permissions independently
- Does not affect USERS.1/2/2A/3 stability

### Proposed Data Shape

  type EffectivePermission = {
    permissionCode: string;
    permissionName: string;
    moduleCode: string;
    actionCode: string;
    sourceRoleId: number;
    sourceRoleCode: string;
    sourceRoleName: string;
    scopeType: "global" | "company" | "branch";
    ownerCompanyId: number | null;
    ownerCompanyName: string | null;
    branchId: number | null;
    branchName: string | null;
    isGlobalAdminBypass: boolean;  // true if system_admin or group_admin
    userRoleAssignedAt: string | null;
  }

  type EffectiveAccessResult = {
    userId: number;
    displayName: string | null;
    isGlobalAdmin: boolean;
    permissionGroups: {
      moduleCode: string;
      permissions: EffectivePermission[];
    }[];
    totalPermissions: number;
    totalRoles: number;
  }

---

## 13. Recommended Effective Access Architecture

### Architecture Overview

  Server (per-request, no caching change):
    getAuthContext() -> AuthContext { permissionCodes: string[] }
    This remains unchanged. Used for hasPermission() calls throughout the app.

  New additions:
    1. getUserEffectivePermissions(userProfileId: number): Promise<EffectiveAccessResult>
       - Location: src/server/queries/effective-permissions.ts
       - Called by: User workspace form (Effective Access section)
       - Requires: caller has users.view OR permissions.view permission, OR is viewing own record
       - Behavior: loads all active user_roles, joins roles (only is_active=true roles), loads role_permissions, loads permissions (only is_active=true), adds isGlobalAdminBypass flag
       - Deduplicates: same permission granted by multiple roles lists all sources

    2. getVisibleNavigationForCurrentUser(): Promise<string[]>
       - Location: src/server/queries/effective-permissions.ts (or src/lib/rbac/navigation.ts)
       - Returns: array of route paths the current user can access based on a static route-permission map
       - Called by: protected layout (server-side), passes result to ErpShell/AppSidebar
       - This is the key function enabling permission-aware sidebar filtering

    3. Central Route Access Registry:
       - Location: src/lib/rbac/route-access-registry.ts
       - A static map of route path -> required permission(s)
       - Used by both getVisibleNavigationForCurrentUser() and the sidebar
       - Separate from workspace-route-registry.ts (which handles tab metadata)

### How permissionCodes flow to sidebar (proposed)

  protected layout.tsx (server component):
    1. getUser() - existing
    2. getAuthContext() - NEW: call here to get permissionCodes + isGlobalAdmin
    3. Pass permissionCodes + isGlobalAdmin to ErpShell

  ErpShell (server component):
    1. Receives permissionCodes + isGlobalAdmin
    2. Passes to AppSidebar

  AppSidebar (client component):
    1. Receives permissionCodes: string[] + isGlobalAdmin: boolean
    2. For each nav item: check if permissionCodes includes requiredPermission (or isGlobalAdmin)
    3. Hide items the user lacks access to
    4. Hide parent sections with no visible children

### Important: Avoid Double DB Call
protected layout currently queries user_profiles directly.
If we add getAuthContext() in layout, it will re-query the same user data.
Plan: Modify protected layout to call getAuthContext() ONCE and extract profile from ctx.profile.
This eliminates the separate user_profiles query.
Result: same number of DB calls but one is eliminated.

### Caching Consideration (deferred)
React's server component request deduplication (cache()) could wrap getAuthContext().
This is a future optimization. For USERS.4, the layout call + passing down is sufficient.
Do NOT implement server-side caching in USERS.4 as it changes behavior.

---

## 14. User Effective Access UI Plan

### Location
Add a new section to the existing user workspace form:
  src/features/users/user-workspace-form.tsx

Section name: "Effective Access"
Section icon: ShieldCheck (lucide)
Position: After Security section, before Audit section (or as a new tab)

### Content Layout

Header:
  - User display name + account status badge
  - "Global Admin Bypass" badge if system_admin or group_admin
  - Summary: "X permissions across Y roles"

Filters row:
  - Search input (filter by permission code or name)
  - Module dropdown (filter by module_code)
  - Scope dropdown (global / company / branch)
  - Role dropdown (filter by source role)

Main content: grouped by module_code

  For each module group:
    Module header: module_code + count badge
    Table:
      | Permission Code | Permission Name | Source Role | Scope | Via |
      | users.view      | View Users      | company_admin | global | direct |
      | users.create    | Create Users    | company_admin | global | direct |

  "Via" column values:
    - "direct" = permission is in role_permissions for a role the user holds
    - "admin bypass" = user is system_admin or group_admin (no specific permission row needed)

Empty state:
  "This user has no permissions assigned. Assign a role in the Roles tab."

### Security Rules for this UI

  - Current admin user must have users.view OR permissions.view to see another user's effective access
  - Any active user can view their OWN effective access (self-service read)
  - The section must NOT expose auth tokens, session IDs, or password hashes
  - Scope labels (company name, branch name) are shown as human-readable names, not IDs

### Server action plan
  - getMyEffectiveAccess() - for self-service view (any active user)
  - getUserEffectiveAccess(userProfileId) - for admin view (requires users.view or permissions.view)
  - Both call getUserEffectivePermissions() query internally
  - Located in: src/server/actions/users/effective-access.ts

### Component files to create
  - src/features/users/user-effective-access-section.tsx (Client component)
  - src/server/queries/effective-permissions.ts (Server query)
  - src/server/actions/users/effective-access.ts (Server actions)

---

## 15. Permission-Aware Sidebar / Menu Visibility Plan

### Core Principle
Hiding menu items is UX ONLY. Server guards remain mandatory on every protected page and action.

### Approach: Hybrid Route + Sidebar Permission Map

Add a new file: src/lib/rbac/route-access-registry.ts

This file exports a static map:
  const ROUTE_ACCESS: Record<string, RouteAccess>

  type RouteAccess = {
    requiredPermission?: string;          // user must have this exact permission
    requiredAnyPermissions?: string[];    // user must have at least one
    requiresGlobalAdmin?: boolean;        // only system_admin / group_admin
    publicToAllActive?: boolean;          // any active user can see (no permission needed)
  }

Example entries:
  "/dashboard":               { requiredPermission: "dashboard.view" }
  "/admin/users":             { requiredPermission: "users.view" }
  "/admin/roles":             { requiredPermission: "roles.manage" }
  "/admin/permissions":       { requiredPermission: "permissions.view" }
  "/admin/audit":             { requiredPermission: "audit.view" }
  "/notifications":           { publicToAllActive: true }
  "/admin/organizations":     { requiredPermission: "organizations.view" }
  "/admin/branches":          { requiredPermission: "branches.view" }
  "/admin/settings/email":    { requiredAnyPermissions: ["settings.email.view", "settings.email.manage"] }
  "/admin/settings/ai":       { requiredAnyPermissions: ["settings.ai.view", "settings.ai.manage"] }
  "/admin/settings/numbering":{ requiredPermission: "numbering.rules.view" }
  "/admin/hr/employees":      { requiredPermission: "hr.employees.view" }
  "/dms":                     { requiredAnyPermissions: ["dms.documents.view", "dms.admin"] }
  "/dms/documents":           { requiredPermission: "dms.documents.view" }
  "/dms/inbox":               { requiredAnyPermissions: ["dms.documents.upload", "dms.admin"] }
  ...

### Changes to NavItem interface
  interface NavItem {
    label: string;
    icon: LucideIcon;
    path: string;
    disabled?: boolean;
    // NEW:
    requiredPermission?: string;
    requiredAnyPermissions?: string[];
    requiresGlobalAdmin?: boolean;
    publicToAllActive?: boolean;
  }

### Sidebar filtering logic (inside AppSidebar)
  function canUserSeeItem(item: NavItem, permissionCodes: string[], isGlobalAdmin: boolean): boolean {
    if (item.disabled) return true;                    // disabled items always show (greyed)
    if (item.publicToAllActive) return true;           // open to all active users
    if (isGlobalAdmin) return true;                    // bypass for system/group admin
    if (item.requiresGlobalAdmin) return false;        // only admins
    if (item.requiredPermission) return permissionCodes.includes(item.requiredPermission);
    if (item.requiredAnyPermissions) return item.requiredAnyPermissions.some(p => permissionCodes.includes(p));
    return true;  // no access metadata = visible (fallback for unregistered routes)
  }

### Parent group hiding logic
  function sectionHasVisibleChildren(section: NavSection, permCodes: string[], isGlobalAdmin: boolean): boolean {
    return section.children.some(child => {
      if (isSubSection(child)) return child.items.some(i => canUserSeeItem(i, permCodes, isGlobalAdmin));
      return canUserSeeItem(child as NavItem, permCodes, isGlobalAdmin);
    });
  }

  // In render: if (!isFiltering && !sectionHasVisibleChildren(section, permCodes, isGlobalAdmin)) return null;

### Coming Soon / Disabled Items Policy
  "disabled: true" items (Fleet, Workshop, HSE, Finance, Inventory, Procurement):
    Recommendation: Hide them if the user has no relevant module permission. Currently no routes for these modules exist, so they serve no purpose for limited users.
    However, if the product decision is to always show "coming soon" items as a marketing teaser, they can remain visible with disabled=true regardless of permissions.
    RECOMMENDED: Hide disabled items that have no corresponding permissions. Show them only for global admins.

### What happens to the disabled items?
  Fleet, Workshop, HSE, Finance, Inventory, Procurement are disabled with no routes.
  Plan: mark them requiresGlobalAdmin: true OR add a future requiredPermission when modules launch.
  For now, they should only be visible to system/group admins as a preview.

### AppSidebar Props change
  interface AppSidebarProps {
    collapsed: boolean;
    onToggle: () => void;
    displayName?: string | null;
    email?: string | null;
    // NEW:
    permissionCodes?: string[];
    isGlobalAdmin?: boolean;
  }

### ErpShell Props change
  interface ErpShellProps {
    children: React.ReactNode;
    displayName?: string | null;
    email?: string | null;
    // NEW:
    permissionCodes?: string[];
    isGlobalAdmin?: boolean;
  }

### Protected Layout change
  - Call getAuthContext() in layout.tsx (replaces the separate user_profiles query)
  - Extract display_name, status, must_change_password from ctx.profile
  - Pass ctx.permissionCodes and isGlobalAdmin(ctx) to ErpShell

---

## 16. Route Access Registry Plan

### File: src/lib/rbac/route-access-registry.ts

This is a NEW standalone file separate from workspace-route-registry.ts.
The workspace route registry handles tab metadata (title, icon, kind, singleton).
The route access registry handles permission requirements.

### Design Decisions

Option A: Add requiredPermission to WorkspaceRouteConfig
  Pros: One file for everything.
  Cons: WorkspaceRouteRegistry is used by useWorkspace and workspace store. Adding permission data mixes concerns. Record tabs (e.g. /admin/users/record/[id]) use pattern matching, not sidebar paths.

Option B: Separate route-access-registry.ts (RECOMMENDED)
  Pros: Clean separation of concerns. Sidebar and navigation read from this file. WorkspaceRouteRegistry remains focused on tab behavior. The access registry only needs to cover sidebar-visible paths.
  Cons: Two files to maintain.

Option C: navSections array directly contains permission data (inline in app-sidebar.tsx)
  Pros: Co-located with the sidebar definition.
  Cons: Permission logic embedded in a UI component. Harder to test independently. Sidebar is client component but permission data should be defined server-side or in a shared lib.

RECOMMENDED: Option B

### What the Route Access Registry covers
Only sidebar-visible routes need to be in this registry. Record routes (e.g. /admin/users/record/[id]) are not directly in the sidebar; they are opened by the workspace tab system.

The registry also acts as the source for getVisibleNavigationForCurrentUser() which can be used by the default landing redirect logic.

### Registry structure

  export type RouteAccess = {
    requiredPermission?: string;
    requiredAnyPermissions?: string[];
    requiresGlobalAdmin?: boolean;
    publicToAllActive?: boolean;
  }

  export const ROUTE_ACCESS_REGISTRY: Record<string, RouteAccess> = {
    "/dashboard":  { requiredPermission: "dashboard.view" },
    "/notifications": { publicToAllActive: true },
    "/admin/hr/employees": { requiredPermission: "hr.employees.view" },
    // ... all sidebar routes
  }

  export function canAccessRoute(path: string, permCodes: string[], isGlobalAdmin: boolean): boolean {
    const access = ROUTE_ACCESS_REGISTRY[path];
    if (!access) return true;  // unknown routes: allow (server will check)
    if (access.publicToAllActive) return true;
    if (isGlobalAdmin) return true;
    if (access.requiresGlobalAdmin) return false;
    if (access.requiredPermission) return permCodes.includes(access.requiredPermission);
    if (access.requiredAnyPermissions) return access.requiredAnyPermissions.some(p => permCodes.includes(p));
    return true;
  }

  export function getFirstPermittedRoute(permCodes: string[], isGlobalAdmin: boolean): string {
    // Returns first route in a priority order that the user can access
    const priorityRoutes = ["/dashboard", "/admin/hr/employees", "/dms", "/admin/reports", ...];
    for (const route of priorityRoutes) {
      if (canAccessRoute(route, permCodes, isGlobalAdmin)) return route;
    }
    return "/no-access";
  }

### Integration with sidebar navSections
NavItem.requiredPermission and NavItem.requiredAnyPermissions fields mirror the registry.
Both should be kept in sync. The registry is the authoritative source.
The sidebar item fields are for rendering; the registry is for server-side and utility use.

### Note on /admin/notifications and sub-items
The Notifications section in the sidebar mixes user-facing (/notifications) and admin routes (/admin/notifications, /admin/notifications/email-queue etc.).
The admin sub-items should require notifications.manage or notifications.admin.
The user-facing /notifications item should be publicToAllActive.

---

## 17. Default Landing and No-Access UX Plan

### The Problem
A limited user who logs in is redirected to /dashboard (the default landing route).
If they lack dashboard.view, they see: "Limited access - Your account does not yet have the dashboard.view permission."
This message has developer instructions ("Assign roles after migration and admin bootstrap") that are inappropriate for production end users.

Additionally, many guarded routes redirect to /dashboard on access denial:
  redirect("/dashboard")  -- if user lacks dashboard.view, they hit the error page again.

### Options Compared

Option A: Always send user to first permitted route after login
  Pros: User always lands on something they can access.
  Cons: Requires computing permitted routes at login redirect time; must handle "no routes" case.
  Implementation: modify the login redirect to call getFirstPermittedRoute().

Option B: Show a clean No Access page if no permitted routes exist
  Path: /no-access
  Pros: Clear, user-friendly. No technical jargon.
  Cons: User must know to contact admin.
  Message: "Your ERP account is active but no application access has been assigned yet. Please contact your administrator."

Option C: Give every active user dashboard.view by default
  Pros: Simple. No redirect logic needed.
  Cons: Changes the permission model. Requires a migration or default role.
  Risk: Business may not want all users seeing the dashboard.

Option D: Create a minimal /home page accessible to all active users
  Pros: A universal landing page with just profile/notifications.
  Cons: Adds a new route. May overlap with dashboard.
  This is a good option if dashboard is considered "a premium route".

### RECOMMENDED: Combination of A + B + improved messaging

1. After login: redirect to first permitted route (Option A).
   - Call canAccessRoute("/dashboard") - if allowed, go to /dashboard
   - Otherwise find first permitted route from a priority list
   - If no routes permitted, go to /no-access

2. Create /no-access route (Option B) in the (auth) group or as an unprotected layout route.
   Message: "Your ERP account is active but no application access has been assigned yet. Please contact your ERP administrator if you believe this is incorrect."

3. Create /access-denied route (currently shows inline "Limited access" message).
   Message: "You do not have permission to access this area. Please contact your ERP administrator."

4. Change all redirect("/dashboard") in guarded pages to redirect("/access-denied") so limited users get a proper page instead of another permission error.

5. The /dashboard page itself should NOT show the developer message. Replace it with the standard access-denied page render or a redirect.

### Changes Required (implementation phase)

Files to create:
  src/app/(auth)/no-access/page.tsx          - No access page
  src/app/(protected)/access-denied/page.tsx - Access denied page

Files to modify:
  src/app/(auth)/login/page.tsx or login form - Change post-login redirect logic
  src/app/(protected)/dashboard/page.tsx      - Replace developer message
  ~30+ protected pages that call redirect("/dashboard") - Change to redirect("/access-denied")

### Note on workspace pinned dashboard tab
The dashboard tab is pinned (closable: false, pinned: true) in the workspace tab system.
If the user lacks dashboard.view, the pinned tab will open /dashboard which shows access denied.
Plan: if user lacks dashboard.view, do not pin the dashboard tab (or pin /no-access instead).
This requires passing isGlobalAdmin + permissionCodes to the workspace initialization in ErpShell.

---

## 18. Permission Matrix Improvement Plan

### Current State
File: src/features/permissions/permissions-matrix.tsx
The permissions matrix shows all permissions grouped by module_code.

Existing issue: module_code grouping is case-sensitive. "DMS" and "dms" appear as separate groups. Same for HR/hr, MASTER_DATA/master_data, SETTINGS/settings.

### Required Improvements

1. Case-insensitive module grouping: normalize module_code to UPPERCASE before grouping.
   Group "dms" and "DMS" together. Display as "DMS".
   No DB change needed for the UI fix - apply toUpperCase() in the grouping logic.

2. Search/filter by permission code or name.

3. Active/inactive filter (future: when some permissions become inactive).

4. Show role category column: which role has this permission?
   This would require joining with role_permissions and roles.
   May be too complex for the matrix view - better suited to the Role workspace Permissions section.

5. System/custom role indicator: warn when editing a system role's permissions.
   Already done in USERS.3 (RolePermissionsSection has system role warning banner).

6. Sync with role record permissions section:
   No sync issue since both read from the same DB. The matrix shows ALL roles/permissions while the role record shows one role's permissions.

### Module Code Normalization Sub-plan (USERS.4A)
Full normalization requires:
  - UPDATE permissions SET module_code = 'DMS' WHERE module_code = 'dms'
  - UPDATE permissions SET module_code = 'HR' WHERE module_code = 'hr'
  - UPDATE permissions SET module_code = 'MASTER_DATA' WHERE module_code = 'master_data'
  - UPDATE permissions SET module_code = 'SETTINGS' WHERE module_code = 'settings'
  - Resolve PARTIES vs MASTER_DATA overlap

RISK: Any code that filters by exact module_code string (e.g. groupBy in matrix) would need updating.
RECOMMENDATION: Defer normalization to USERS.4A. In USERS.4, apply a case-insensitive display fix only (no migration).

For USERS.4:
  - Fix matrix UI to group by toUpperCase(module_code)
  - Document the mixed-case issue clearly
  - Plan the migration as USERS.4A after verifying no code depends on lowercase module_code strings

---

## 19. Scoped Access Explanation Plan

### Scope Model (from existing user_roles table)
user_roles has columns: scope_type (global/company/branch), owner_company_id, branch_id.

Current getAuthContext() ignores scope. All role assignments are treated as global for permission check purposes. Record-level filtering is handled by Supabase RLS (row ownership columns on tables).

### What scoped access means for USERS.4

Menu-level: All sidebar items are route-level, not record-level. A user with a company-scoped HR Manager role sees the same HR menu items as a global HR Manager. The difference is which RECORDS they can view (enforced by RLS).

Effective Access UI: Should show the scope of each permission grant so admins can understand:
  "users.view granted by company_admin scoped to Alliance Gulf Trading LLC"
  "hr.employees.view granted by hr_manager globally"
  "dms.documents.view granted by dms_manager scoped to ICAD II branch"

Scope label computation:
  - If scope_type = "global": display "Global"
  - If scope_type = "company": query companies/organizations table for name where id = owner_company_id
  - If scope_type = "branch": query branches table for name where id = branch_id

### Limitations to Document Clearly

1. Sidebar items are route-level. A user sees the HR Employees menu item if they have hr.employees.view, regardless of scope. But when they open the employee list, RLS restricts which rows appear.

2. The effective access UI is advisory. It shows permission grants but does not reflect RLS-level row restrictions (those are transparent and always enforced).

3. For USERS.4 scope display is informational in the Effective Access section only.
   No scope-based sidebar filtering is planned (would require knowing which company/branch the user is viewing).

### Implementation note
getUserEffectivePermissions() should include scope information by joining user_roles with organizations and branches tables to resolve names. Cache these lookups locally within the function call.

---

## 20. Database / SQL Plan

### Assessment: No Schema Migration Required for Core USERS.4 Features

The core USERS.4 deliverables (sidebar filtering, effective access UI, no-access page, improved redirects) require NO database schema changes. All data needed already exists in:
  - permissions (permission_code, module_code, action_code, permission_name)
  - roles (role_code, role_name, is_system_role)
  - role_permissions (role_id, permission_id)
  - user_roles (user_profile_id, role_id, scope_type, owner_company_id, branch_id, assigned_at)

### Optional DB Improvements (assessed against need)

| Improvement | Need | Decision |
|-------------|------|----------|
| module_code normalization (UPDATE permissions) | Medium | DEFER to USERS.4A |
| Add branches.create permission | High | DO IN USERS.4 (1-row INSERT) |
| Fix dms_manager permissions | Medium | Assign in USERS.4 or dedicated phase |
| route_permission_registry table | Low | NOT NEEDED (static file approach preferred) |
| user_permission_overrides table | Low | NOT NEEDED in USERS.4 |
| Filter inactive permissions in query | Low | Fix in getAuthContext() code (no migration) |
| Filter inactive roles (roles.is_active) | Low | Fix in getAuthContext() code (no migration) |

### Draft SQL for USERS.4 (data fixes, not schema changes)

-- Fix 1: Add missing branches.create permission
INSERT INTO permissions (permission_code, permission_name, module_code, action_code, description, is_active, is_system_permission)
VALUES ('branches.create', 'Create Branches', 'branches', 'create', 'Permission to create new branch records', true, true)
ON CONFLICT (permission_code) DO NOTHING;

-- Fix 2: Assign branches.create to system_admin, group_admin, company_admin, branch_admin
-- (to be executed after the permission is created)
-- Would use role_permissions INSERT for each affected role.

-- Fix 3: Assign DMS permissions to dms_manager
-- Assign dms.documents.view, dms.documents.upload, dms.documents.edit, dms.admin to dms_manager
-- (Requires reviewing which exact DMS permissions dms_manager should have - defer to USERS.4 or DMS phase)

NOTE: All three SQL changes above are DATA fixes, not schema migrations. They can be applied via MCP execute_sql or a Supabase migration file. The plan recommends applying them in USERS.4 implementation.

### USERS.4A (deferred sub-phase)
Normalize module_code casing. Estimate: 5 UPDATE statements, low risk.
Target:
  UPDATE permissions SET module_code = 'DMS' WHERE module_code = 'dms';
  UPDATE permissions SET module_code = 'HR' WHERE module_code = 'hr';
  UPDATE permissions SET module_code = 'MASTER_DATA' WHERE module_code = 'master_data';
  UPDATE permissions SET module_code = 'SETTINGS' WHERE module_code = 'settings';
  -- Decide on PARTIES vs MASTER_DATA (may require merging or keeping separate)

---

## 21. Server Action and Query Plan

### New Files to Create

#### src/server/queries/effective-permissions.ts
  getUserEffectivePermissions(userProfileId: number): Promise<EffectiveAccessResult>
  - Loads active user_roles for the given user profile
  - Joins roles (filters roles.is_active = true)
  - Loads role_permissions for those roles
  - Joins permissions (filters permissions.is_active = true)
  - Resolves company/branch names for scoped roles
  - Adds isGlobalAdminBypass flag for system_admin and group_admin roles
  - Returns grouped by module_code

#### src/server/actions/users/effective-access.ts
  getMyEffectiveAccess(): Promise<EffectiveAccessResult>
  - Gets current user auth context (requireActiveAuthContext)
  - Calls getUserEffectivePermissions(ctx.profile.id)
  - No additional permission check needed (own data)

  getUserEffectiveAccess(userProfileId: number): Promise<EffectiveAccessResult>
  - Gets caller auth context
  - Checks: hasPermission(ctx, "users.view") OR hasPermission(ctx, "permissions.view")
  - Calls getUserEffectivePermissions(userProfileId)
  - Returns the result

#### src/lib/rbac/route-access-registry.ts
  ROUTE_ACCESS_REGISTRY: Record<string, RouteAccess>
  canAccessRoute(path, permCodes, isGlobalAdmin): boolean
  getFirstPermittedRoute(permCodes, isGlobalAdmin): string
  getVisibleRoutes(permCodes, isGlobalAdmin): string[]

### Modifications to Existing Files

#### src/lib/rbac/check.ts
  Add: filterInactiveRoles - pass roles.is_active filter to user_roles join
  Add: filterInactivePermissions - filter permissions.is_active = true in role_permissions query
  These are code-only fixes, no schema change.

#### src/app/(protected)/layout.tsx
  Change: Call getAuthContext() instead of separate user_profiles query
  Add: Extract permissionCodes and isGlobalAdmin from context
  Pass: permissionCodes, isGlobalAdmin to ErpShell

#### src/components/layout/erp-shell.tsx
  Add: permissionCodes?: string[], isGlobalAdmin?: boolean props
  Pass: to AppSidebar

#### src/components/layout/app-sidebar.tsx
  Add: permissionCodes?: string[], isGlobalAdmin?: boolean props
  Add: requiredPermission / requiredAnyPermissions / requiresGlobalAdmin / publicToAllActive to NavItem interface
  Add: canUserSeeItem() filtering function
  Add: sectionHasVisibleChildren() function
  Modify: navSections array to include permission metadata per item
  Modify: render logic to filter items and sections

#### src/features/users/user-workspace-form.tsx
  Add: "Effective Access" section using UserEffectiveAccessSection component

### Security Requirements for Server Actions
  - getMyEffectiveAccess: any active authenticated user (no extra permission needed)
  - getUserEffectiveAccess: requires users.view OR permissions.view
  - Neither action may expose auth tokens, session data, or password fields
  - Both must call assertAccountActive() for the caller

---

## 22. Client / Layout / Sidebar Integration Plan

### Data Flow (planned)

  protected layout (server component):
    getAuthContext() -> {profile, roleCodes, permissionCodes, isAccountActive}
    Extract: displayName from profile, email from user.email, status, must_change_password
    isGlobalAdmin = roleCodes.includes("system_admin") || roleCodes.includes("group_admin")
    Pass to ErpShell: { displayName, email, permissionCodes, isGlobalAdmin }

  ErpShell (server component):
    Receives { displayName, email, permissionCodes, isGlobalAdmin }
    Pass to AppSidebar: same props
    Pass to AppHeader: { displayName, email }

  AppSidebar (client component):
    Receives { permissionCodes: string[], isGlobalAdmin: boolean }
    Uses canUserSeeItem() for each NavItem
    Hides inaccessible items and empty sections

### Why this is safe
  - permissionCodes is a string[] of permission codes (e.g. ["dashboard.view", "users.view"])
  - This is NOT sensitive data. Permission codes are system identifiers, not secrets.
  - The client receives only which permissions the user has, not role IDs, user IDs, or tokens.
  - Even if the client manipulates permissionCodes in memory, the server still checks permissions independently on every request.

### Option comparison for passing permissionCodes to sidebar

Option A (RECOMMENDED): Protected layout server component calls getAuthContext() and passes permissionCodes as props through the server component tree. AppSidebar receives them as client props.
  Pros: Single DB call at layout level. No separate fetch in sidebar. Works with React server components.
  Cons: permissionCodes array is serialized to client (client bundle). This is fine for codes (not secrets).

Option B: AppSidebar uses SWR/React Query to fetch permissions client-side.
  Cons: Extra client-side API call on every page load. Sidebar flickers while loading permissions. More complex.

Option C: App-wide React context via Provider wrapping the entire protected app.
  Cons: Requires a client-side Provider component at layout level. Adds complexity.

### Workspace pinned dashboard tab
The workspace store initializes with a pinned /dashboard tab.
For users without dashboard.view, this pinned tab opens to a restricted page.
Plan: pass permissionCodes/isGlobalAdmin to ErpShell and conditionally initialize the workspace differently.
If user lacks dashboard.view (and is not global admin), do not pin /dashboard as a tab.
Instead pin the first permitted route from getFirstPermittedRoute().

### Avoiding repeated DB calls
Currently protected layout queries user_profiles directly AND getAuthContext() would query it again.
Fix: In the USERS.4 implementation, replace the inline user_profiles query in layout.tsx with a single getAuthContext() call. Extract profile data from ctx.profile (the profile field already contains full profile from user_profiles select("*")).
This maintains the same DB call count.

---

## 23. Security and RLS Preservation Plan

### Non-negotiable security rules (must be verified before USERS.4 PR merge)

1. Every protected page that calls hasPermission() or requirePermission() continues to do so.
   No page protection can be removed or weakened.

2. Every protected server action that calls requirePermission() or requireActiveAuthContext() continues to do so.
   No server action protection can be removed or weakened.

3. RLS policies on all tables remain unchanged.
   No RLS policy can be dropped or relaxed.

4. Inactive/suspended user block in layout.tsx remains.
   must_change_password redirect in layout.tsx remains.

5. Sidebar hiding does not provide security. If a user manually navigates to a route they cannot see in the sidebar, the server-side page protection will still block them.

6. The route-access-registry.ts is a UX helper, not a security layer. It cannot be used as the sole access control mechanism.

### Direct URL Access Test Plan
For each USERS.4 implementation change:
  - A user with no permissions should be blocked by server-side checks when navigating directly to /admin/users
  - A user with no permissions should be blocked by server-side checks when navigating to /admin/roles
  - A user with no permissions should be blocked by server-side checks when navigating to /admin/permissions
  - A system_admin should still have full access to all routes

### Server Action Unauthorized Call Test Plan
  - Calling createUser() without users.create permission should throw Forbidden
  - Calling updateRole() on a system role without global admin should throw Forbidden
  - Calling getUserEffectiveAccess() without users.view should return error (not throw to client)

### RLS Scoped Row Visibility Test
  - A user with company-scoped hr_manager should only see employees in their company
  - This is enforced by RLS, not by sidebar filtering
  - USERS.4 does not change RLS; this is tested to verify no regression

### Inactive User Test
  - Deactivated user cannot log in (redirected to /account-disabled by layout.tsx)
  - must_change_password user is redirected to /change-password-required

### Group Admin Bypass Audit
  The group_admin bypass in hasPermission() means group_admin users pass all permission checks.
  This is intentional but should be clearly documented in the code as a design decision.
  USERS.4 should add a comment to check.ts explaining this bypass.

---

## 24. Backward Compatibility Plan

### USERS.1 / USERS.2 / USERS.2A / USERS.3 features preserved

| Feature | Status after USERS.4 |
|---------|----------------------|
| Auth session check (layout.tsx) | Unchanged - still redirects /login |
| Account status block (layout.tsx) | Unchanged - still redirects /account-disabled |
| must_change_password gate (layout.tsx) | Unchanged - still redirects /change-password-required |
| hasPermission() function signature | Unchanged - same (ctx, code) -> boolean |
| requirePermission() function | Unchanged |
| isGlobalAdmin() function | Unchanged |
| canManageUsers() helper | Unchanged |
| All existing page permission checks | Unchanged |
| All existing server action guards | Unchanged |
| RLS policies | Unchanged |
| Role system_admin and group_admin bypass | Unchanged |
| Password validation and lifecycle | Unchanged |
| Invite and security email flows | Unchanged |
| Role clone, system role protection | Unchanged |
| Audit logging | Unchanged |

### Changes that might affect existing behavior

1. Protected layout.tsx will call getAuthContext() instead of direct user_profiles query.
   Behavioral difference: ctx.profile has all columns from user_profiles SELECT("*") already.
   The existing layout queries .select("display_name, full_name, status, must_change_password").
   getAuthContext() queries .select("*") which is a superset - no fields are lost.
   Status: SAFE if we extract the same fields from ctx.profile.

2. AppSidebar receives permissionCodes and isGlobalAdmin as new props.
   Default values: permissionCodes=[], isGlobalAdmin=false.
   If the layout fails to pass these, the sidebar shows NO items (empty state).
   MITIGATION: Provide sensible defaults. If permissionCodes is undefined, treat as "show all" (backward compatible fallback).

3. NavItem gains new optional fields (requiredPermission etc.).
   Items without these fields continue to behave as before (visible to all).
   SAFE: additive change, existing items without permission metadata are unaffected.

---

## 25. Implementation Sequence for Future USERS.4 Execution

The following is the RECOMMENDED implementation order. Each step must pass tsc --noEmit before proceeding.

### Phase A: Foundation (no visible changes)

Step A1: Create src/lib/rbac/route-access-registry.ts
  - Define RouteAccess type
  - Define ROUTE_ACCESS_REGISTRY with all 80+ sidebar routes
  - Implement canAccessRoute(), getFirstPermittedRoute(), getVisibleRoutes()
  - No tests yet, no UI changes

Step A2: Create src/server/queries/effective-permissions.ts
  - getUserEffectivePermissions(userProfileId) function
  - Filter inactive roles and inactive permissions
  - Include scope resolution for company/branch names
  - Include isGlobalAdminBypass flag

Step A3: Create src/server/actions/users/effective-access.ts
  - getMyEffectiveAccess() - self-service
  - getUserEffectiveAccess(userProfileId) - admin view

Step A4: Fix getAuthContext() in src/lib/rbac/check.ts
  - Add roles.is_active=true filter to user_roles join query
  - Add permissions.is_active=true filter to role_permissions query
  - Add documentation comment explaining group_admin bypass design decision

### Phase B: Layout / Shell / Sidebar integration

Step B1: Modify protected layout.tsx
  - Replace direct user_profiles query with getAuthContext()
  - Extract displayName, status, must_change_password from ctx.profile
  - Pass permissionCodes and isGlobalAdmin to ErpShell

Step B2: Modify ErpShell to accept and pass permissionCodes, isGlobalAdmin

Step B3: Modify AppSidebar
  - Add props: permissionCodes, isGlobalAdmin
  - Add requiredPermission etc. to NavItem interface
  - Add canUserSeeItem() and sectionHasVisibleChildren() functions
  - Add permission metadata to ALL navSections items
  - Add render filtering

Step B4: Handle workspace pinned dashboard tab for limited users
  - Pass permissionCodes/isGlobalAdmin to workspace initialization in ErpShell
  - Conditionally set initial pinned tab based on first permitted route

### Phase C: UX pages and redirects

Step C1: Create /no-access page (src/app/(auth)/no-access/page.tsx or protected group)
Step C2: Create /access-denied page (src/app/(protected)/access-denied/page.tsx)
Step C3: Update dashboard/page.tsx to redirect to /access-denied instead of showing developer message
Step C4: Update all protected pages that call redirect("/dashboard") to redirect("/access-denied") instead

### Phase D: Effective Access UI

Step D1: Create src/features/users/user-effective-access-section.tsx
Step D2: Add "Effective Access" section to user-workspace-form.tsx

### Phase E: Data fixes

Step E1: Insert branches.create permission into DB
Step E2: Assign branches.create to appropriate roles (system_admin, group_admin, company_admin, branch_admin)
Step E3: Optionally assign DMS permissions to dms_manager

### Phase F: Verification

Step F1: Run tsc --noEmit (zero errors required)
Step F2: Run npm run build (successful build required)
Step F3: Browser UAT (see Section 27)
Step F4: Write implementation report + UAT report + update ALGT_ERP_SOURCE_OF_TRUTH.md

---

## 26. Acceptance Criteria for Future Implementation

| ID    | Criterion |
|-------|-----------|
| AC-01 | Audits live permissions and roles from Supabase (done in this plan) |
| AC-02 | Audits current sidebar visibility behavior (done in this plan) |
| AC-03 | Permission-aware sidebar/menu hiding is implemented |
| AC-04 | Server-side route protection is preserved on all existing guarded pages |
| AC-05 | Effective permissions engine (getUserEffectivePermissions) is implemented |
| AC-06 | User effective access UI section is added to user workspace |
| AC-07 | Default landing/no-access handling is implemented (/no-access, /access-denied, redirect fix) |
| AC-08 | Route access registry is created and used by sidebar |
| AC-09 | Scoped access explanation shows company/branch labels in effective access UI |
| AC-10 | USERS.1/2/2A/3 controls are not weakened |
| AC-11 | Nothing was implemented in the planning phase |
| AC-12 | Clear implementation sequence and UAT plan are in this document |

Additional acceptance criteria for implementation:
| AC-13 | A limited user (e.g. employee_self_service) sees only 2-3 permitted sidebar items |
| AC-14 | system_admin sees all sidebar items |
| AC-15 | Parent section is hidden when ALL of its children are hidden for a limited user |
| AC-16 | Dashboard tab is not pinned for users without dashboard.view |
| AC-17 | /no-access page shows user-friendly message with no technical codes |
| AC-18 | /access-denied page shows user-friendly message with no technical codes |
| AC-19 | Direct URL access to /admin/users without users.view is still blocked by server |
| AC-20 | branches.create permission exists in DB |
| AC-21 | tsc --noEmit passes with zero errors |
| AC-22 | npm run build succeeds |

---

## 27. Test and Browser UAT Plan

### TypeScript / Build Tests
  npx tsc --noEmit   (must have zero errors)
  npm run build      (must succeed)

### Unit-level Logic Tests (manual verification)
  - canAccessRoute("/dashboard", [], false) returns false
  - canAccessRoute("/dashboard", ["dashboard.view"], false) returns true
  - canAccessRoute("/dashboard", [], true) returns true (isGlobalAdmin bypass)
  - canUserSeeItem({requiredPermission:"users.view"}, [], false) returns false
  - canUserSeeItem({publicToAllActive:true}, [], false) returns true
  - sectionHasVisibleChildren(adminSection, [], false) returns false when all children require permissions

### Browser UAT Test Cases

TC-01: Limited user sidebar visibility
  - Login as a user with only employee_self_service role (2 permissions)
  - Expected: Only sees routes matching their permissions + publicToAllActive items
  - Expected: Does NOT see Users, Roles, Permissions, Reports, DMS Admin, HR, Master Data sections

TC-02: parent section auto-hidden
  - Login as limited user
  - Expected: Administration section is hidden (no visible children)
  - Expected: Reports section is hidden

TC-03: system_admin sees full sidebar
  - Login as system_admin
  - Expected: All 80+ items visible (all sections expanded)

TC-04: Dashboard tab behavior for limited users
  - Login as limited user without dashboard.view
  - Expected: /dashboard is NOT the default landing
  - Expected: User lands on first permitted route or /no-access
  - Expected: No pinned Dashboard tab in workspace tab bar

TC-05: No-access page
  - Login as active user with zero roles assigned
  - Expected: Lands on /no-access with friendly message
  - No technical permission codes visible in the message

TC-06: Access denied page
  - As limited user, manually navigate to /admin/users
  - Expected: /access-denied page with friendly message
  - NOT the technical "dashboard.view permission" message

TC-07: Server-side route protection preserved
  - As limited user (no users.view), navigate directly to /admin/users
  - Expected: Server returns access denied (not just sidebar hidden)
  - Cannot be bypassed by manipulating client-side permissionCodes

TC-08: Effective Access UI
  - As system_admin, open a user record
  - Navigate to Effective Access section
  - Expected: Shows all permissions grouped by module
  - Expected: Shows source role name, scope label
  - Expected: Filters work (module, role, search)

TC-09: Own Effective Access (self-service)
  - Login as any active user
  - Open own user record (if accessible) or call getMyEffectiveAccess
  - Expected: Returns own effective permissions without extra admin permission

TC-10: DMS routes still protected
  - As user with NO dms permissions, navigate to /dms
  - Expected: Redirect to /access-denied (not dashboard)
  - DMS menu items hidden in sidebar

TC-11: HR routes protected
  - As user with NO hr permissions, navigate to /admin/hr/employees
  - Expected: Redirect to /access-denied
  - HR section hidden in sidebar

TC-12: Workspace tab opening respects access
  - As limited user, if somehow a workspace tab opens a restricted route
  - Expected: The page itself shows access denied (server-side check)

### Browser UAT Report file to be created after implementation:
  implementation_Review/ERP_USERS_4_BROWSER_UAT_VERIFICATION_REPORT.md

---

## 28. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| AppSidebar permissionCodes prop missing (layout forgets to pass) | Medium | ALL items hidden for all users | Use permissionCodes=undefined to mean "show all" as fallback |
| getAuthContext() called twice in layout (double DB call) | High | 2x latency | Explicitly replace the existing user_profiles query with getAuthContext() extraction |
| NavItem missing requiredPermission (new items added without it) | Medium | Item always visible | Default behavior: items without access metadata are visible (safe fallback) |
| Route access registry out of sync with sidebar | Medium | Sidebar shows item but registry says hidden (or vice versa) | Keep both in sync by convention; registry is authoritative |
| branches.create INSERT fails (already exists) | Low | Error | Use ON CONFLICT DO NOTHING |
| system_admin or group_admin bypass not applied in canUserSeeItem | High | Admins lose access to all items | Always check isGlobalAdmin first in filtering function |
| redirect("/access-denied") loop if /access-denied itself requires permission | Medium | Infinite redirect | /access-denied must have no permission check and be accessible to all active users |
| Workspace pinned tab logic changes break other workspace behavior | Medium | Lost workspace state | Only modify the initial pinned tab logic conditionally; other workspace behavior unchanged |
| Module code inconsistency causes permissions matrix to miss permissions | Medium | Incomplete matrix view | Fix with toUpperCase() normalization in UI; full DB fix deferred to USERS.4A |
| dms_manager users see DMS menu but cannot access any DMS route | High | Confusing UX | Fix dms_manager permissions as data fix in USERS.4 Phase E |

---

## 29. Items Explicitly Deferred

| Item | Reason | Target Phase |
|------|--------|-------------|
| module_code DB normalization (UPDATE permissions) | Risk of breaking existing code that strings module_code | USERS.4A |
| Server-side response caching for getAuthContext | Adds behavior complexity; not needed for USERS.4 core features | USERS.5 or infra optimization |
| Scope-based sidebar filtering (show HR menu only for company users' company) | Requires knowing current company context in sidebar; complex | Future phase |
| user_permission_overrides table | No current business requirement | Not planned |
| route_permission_registry DB table | Static file approach is sufficient | Not planned |
| Full PARTIES vs MASTER_DATA module consolidation | Requires audit of all code using these module codes | USERS.4A |
| Assigning permissions to dms_manager comprehensively | Needs DMS team review of correct permission set | DMS phase or USERS.4 Phase E |
| test_role cleanup (convert to custom or delete) | Low priority | Anytime |
| Pagination in Effective Access section | Initial load is small enough | Future iteration |
| Export effective access as PDF/CSV | Not in scope | Future iteration |

---

## 30. Source-of-Truth Update Plan

When USERS.4 implementation is complete, update .cursor/ALGT_ERP_SOURCE_OF_TRUTH.md:

| Field | New Value |
|-------|-----------|
| Phase | ERP USERS.4 - Permissions and Effective Access |
| Status | COMPLETE |
| Files changed | src/lib/rbac/check.ts, src/lib/rbac/route-access-registry.ts, src/app/(protected)/layout.tsx, src/components/layout/erp-shell.tsx, src/components/layout/app-sidebar.tsx, src/features/users/user-effective-access-section.tsx, src/server/queries/effective-permissions.ts, src/server/actions/users/effective-access.ts, src/app/(auth)/no-access/page.tsx, src/app/(protected)/access-denied/page.tsx, + ~30 pages (redirect fix) |
| Report file | implementation_Review/ERP_USERS_4_PERMISSIONS_AND_EFFECTIVE_ACCESS_IMPLEMENTATION_REPORT.md |
| UAT report | implementation_Review/ERP_USERS_4_BROWSER_UAT_VERIFICATION_REPORT.md |
| Next phase | USERS.4A - Permission Catalog Normalization (module_code casing fix) |

---

## 31. Recommended Next Cursor Implementation Prompt Summary

The USERS.4 implementation prompt should specify:

1. Planning file reference: implementation_Review/ERP_USERS_4_PERMISSIONS_AND_EFFECTIVE_ACCESS_PLAN.md
2. Do NOT change any USERS.1/2/2A/3 functionality
3. Do NOT modify RLS or any Supabase policies
4. Do NOT weaken any existing permission checks
5. Implement in the sequence defined in Section 25 (Phases A through F)
6. After each Phase, run tsc --noEmit before continuing
7. Create the implementation report and UAT report before marking complete
8. Update ALGT_ERP_SOURCE_OF_TRUTH.md as specified in Section 30

Key files to implement (in order):
  Phase A: route-access-registry.ts, effective-permissions.ts, effective-access.ts, check.ts fix
  Phase B: layout.tsx, erp-shell.tsx, app-sidebar.tsx
  Phase C: no-access page, access-denied page, redirect fixes (~30 pages)
  Phase D: user-effective-access-section.tsx, user-workspace-form.tsx update
  Phase E: DB data fixes (branches.create permission INSERT + role assignments)
  Phase F: tsc, build, UAT, reports

---

## 32. Final Recommendation

USERS.4 is a high-value, low-risk phase that:
1. Fixes the most visible production-readiness gap (all users see all menus)
2. Adds the administrative "why does this user have this access?" capability
3. Improves the new-user landing experience (no more developer error messages)
4. Does NOT require any database schema migrations
5. Preserves all USERS.1/2/2A/3 security controls

The most impactful change is the sidebar permission filtering (Section 15). This alone addresses Sameer's observed problem. The effective access UI (Section 14) provides the audit/explain capability that enterprise ERP admins need.

The implementation is well-bounded: approximately 12 new or modified files, with clear boundaries and no shared state changes that could destabilize existing features.

USERS.4A (permission catalog normalization) is deliberately deferred to keep USERS.4 focused and to avoid risk from DB migration during the core feature delivery.

**Recommended action: Upload this plan to ChatGPT for review, then proceed with the USERS.4 implementation prompt.**

---

*Plan created: 2026-06-29*
*Phase: ERP USERS.4 - Permissions and Effective Access (Planning Only)*
*Author: AI Planning Agent (ALGT ERP)*
*Status: READY FOR SAMEER REVIEW*
