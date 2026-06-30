# ERP USERS.6 — UI/UX Polish and Admin Workspace Plan

**Phase:** ERP USERS.6 — UI/UX Polish and Admin Workspace
**Type:** Planning only — no code, schema, RLS, or data changes
**Date:** 2026-06-29
**Prepared by:** Cursor (senior ERP product designer + UX architect + Next.js engineer)

---

## 1. Executive Summary

USERS.1–USERS.5 delivered a fully functional and hardened Users/RBAC/Auth/Audit module. However, the implementation-focused approach left several UX rough edges: inconsistent list table frameworks (ERPDataTable vs plain Table), native selects where comboboxes should be used, missing loading/error/empty states in key areas, raw IDs exposed in audit and history views, status changes firing without confirmation, no search/filtering on the Roles list, permissions matrix with no visual feedback on toggle, and a Security History section that shows raw action enum codes to admins.

USERS.6 will resolve all of these by polishing the UI layer only — no security logic changes, no schema changes, no permission seed changes.

**Target result:** An admin can manage users, roles, permissions, and audit logs entirely without technical knowledge of the underlying data model.

---

## 2. Planning Scope and Non-Implementation Rule

This document is planning-only.

**Allowed in USERS.6 implementation:**
- UI component polish (labels, icons, layout, spacing, states)
- Client-side UX improvements (confirmations, loading states, empty states, skeletons)
- Replacing native select with ERPCombobox where appropriate
- Humanizing raw IDs and action codes in display
- Adding accessible aria-label attributes
- Adding quick filter buttons to lists
- Improving dangerous-action confirmation dialog copy
- Aligning Roles list to ERPDataTable pattern

**Forbidden in USERS.6 (defer to USERS.7+):**
- Any DB schema migration
- Any RLS policy change
- Any permission seed change
- Any new server-action guard addition or removal
- Any USERS.1–USERS.5 security logic modification
- Full SIEM / audit export
- user_permission_overrides
- user_sessions

---

## 3. USERS.1–USERS.5 Closure Context

| Phase | Status | Key Deliverables |
|---|---|---|
| USERS.1 | CLOSED / PASS | Security foundation, account status guards, assertAccountActive, last-admin guard |
| USERS.2 | CLOSED / PASS | User management CRUD, roles assignment, invite/temp-password email |
| USERS.2A | CLOSED / PASS | Password lifecycle, must_change_password, admin security actions, security section |
| USERS.3 | CLOSED / PASS | Roles CRUD, clone, system role protection, permissions section, assigned users section |
| USERS.4 | CLOSED / PASS | Permission-aware sidebar, getAuthContext admin-client bootstrap, /dev/auth-debug |
| USERS.5 | CLOSED / PASS WITH NOTES | Centralized sanitizers, server-only guards, audit taxonomy, erp_email_queue RLS narrowed, effective access server actions, Security History section, audit filters |

All USERS.1–USERS.5 security protections must remain untouched in USERS.6.

---

## 4. Files, Rules, Reports, and Source-of-Truth Reviewed

### Reports reviewed
- implementation_Review/ERP_USERS_1_SECURITY_FOUNDATION_IMPLEMENTATION_REPORT.md - FOUND
- implementation_Review/ERP_USERS_2_USER_MANAGEMENT_CORE_IMPLEMENTATION_REPORT.md - FOUND
- implementation_Review/ERP_USERS_2A_PASSWORD_LIFECYCLE_ACCOUNT_SECURITY_IMPLEMENTATION_REPORT.md - FOUND
- implementation_Review/ERP_USERS_3_ROLES_MANAGEMENT_ENHANCEMENT_IMPLEMENTATION_REPORT.md - FOUND
- implementation_Review/ERP_USERS_4_RUNTIME_PERMISSION_FLOW_CORRECTION_REPORT.md - FOUND
- implementation_Review/ERP_USERS_5_SECURITY_HARDENING_AND_AUDIT_ENHANCEMENT_IMPLEMENTATION_REPORT.md - FOUND
- implementation_Review/ERP_USERS_5_BROWSER_UAT_VERIFICATION_REPORT.md - FOUND

### Source files inspected
All files listed in the prompt were inspected via repository exploration. Key findings are documented in sections 5-16 below.

### Rules applied
- erp-workspace-save-close-standard.mdc — forceCloseActiveTab after save
- erp-child-dialog-form-standard.mdc — child forms must use ERPChildDialogForm
- algt-erp-source-of-truth.mdc — live code overrides planning docs

---

## 5. Current Users List UX Audit

**Files:** src/features/users/users-table.tsx, src/features/users/users-list-toolbar.tsx

### What is working well
- StatusBadge with semantic colors (active=emerald, suspended=amber, inactive=slate)
- Delete confirmation is destructive AlertDialog with loading state
- Role chips with scope labels visible in row
- Toolbar has search, status/company/branch/role filters

### Identified gaps

| Gap | Severity | Detail |
|---|---|---|
| No quick-filter chips | High | No "Active", "Suspended", "Must Change Password", "No Role" one-click filters |
| Status change fires immediately | High | Deactivate/suspend/activate have no confirmation dialog |
| Pagination is broken | Medium | ERPDataTable receives initialPageSize={data.length} — no real pagination |
| Filter dropdowns use native select | Medium | Inconsistent with ERPCombobox standard |
| No "Clear all filters" button | Medium | Each filter must be reset individually |
| Pagination buttons have no aria-label | Medium | Icon-only buttons fail accessibility |
| Email not shown by default | Low | Admins search by email constantly |
| last_sign_in_at not shown | Low | Needed to identify stale accounts |
| Auth User ID shown in Audit section | Low | Should be hidden from non-developers |

### Planned improvements

1. Quick-filter tab bar above the table: "All" / "Active" / "Suspended" / "Inactive" / "Must Change Password" / "No Role"
2. Status-change confirmation dialog for suspend/deactivate/activate
3. Replace native selects with ERPCombobox for company, branch, role filters
4. Clear all filters button — always visible when any filter is active
5. aria-label on all icon-only pagination and row-action buttons
6. Add email column (visible by default)
7. Add last_sign_in_at column (hidden by default, toggleable)

---

## 6. Current User Record Workspace UX Audit

**File:** src/features/users/user-workspace-form.tsx

### Current section order (edit/view)
1. Profile Details
2. Organization
3. Roles
4. Security
5. Security History
6. Audit Info

### Recommended section order (USERS.6)
1. Overview (new — summary card)
2. Profile Details
3. Organization and Assignment
4. Roles and Scope
5. Account Security
6. Effective Access (new — using USERS.5 server actions)
7. Security History
8. Audit / System Info

### Identified gaps

| Gap | Severity | Detail |
|---|---|---|
| No Overview section | High | Status, user code, company, last sign-in all buried in forms |
| Status is a plain select | High | Should be a prominent status badge chip with dedicated Change Status action |
| Raw auth_user_id UUID in Audit section | Medium | Should be behind "Show technical details" toggle |
| Plus Assign Role is a text link | Medium | Easy to miss — should be a visible secondary button |
| No Effective Access section | Medium | Server actions exist (USERS.5) but no UI |
| Company/branch use native select | Medium | Should be ERPCombobox |
| No must_change_password warning banner | Low | Admin should see this prominently at top |
| No suspended account warning | Low | No visual context for admin reviewing suspended account |

### Planned improvements

1. Overview section: summary card with status chip, user code, email, company, branch, must_change_password warning, last sign-in
2. Status change: remove from Profile form, add "Change Status" button in overview with confirmation dialog
3. Audit section: hide auth_user_id behind expandable "Technical Details" toggle
4. Effective Access section: new component using getUserEffectiveAccess()
5. Replace native selects with ERPCombobox for company and branch
6. Warning banners: amber for must_change_password, red/yellow for suspended/inactive

---

## 7. User Roles and Scope UX Plan

**Files:** src/features/users/assign-role-dialog.tsx, role display in user-workspace-form.tsx

### Current state
- AssignRoleDialog uses ERPChildDialogForm (sm) — correct pattern
- Role uses ERPCombobox — correct
- Scope/company/branch use native select — inconsistent
- Branch NOT filtered by selected company — bug

### Identified gaps

| Gap | Severity | Detail |
|---|---|---|
| Branch not filtered by company in assign dialog | High | Bug — can assign branch from wrong company |
| Stale form state on reopen | Medium | Selections persist from previous open |
| Scope/company/branch use native selects | Medium | Inconsistent with ERPCombobox standard |
| No warning for powerful roles | Medium | Assigning system_admin should show warning |
| Deassign confirmation wording too generic | Medium | "Remove Role?" should name the role |
| No assigned_by/assigned_at in role card | Low | Visible in audit only |

### Planned improvements

1. Filter branches by selected company in assign dialog
2. Reset all form fields when dialog opens (fix stale state)
3. High-privilege role warning: amber banner for system_admin / group_admin / company_admin
4. Deassign confirmation: "Remove {role_name} ({role_code}) from this user?"
5. Replace scope/company/branch native selects with ERPCombobox
6. Show assigned_by in role card

---

## 8. Account Security UX Plan

**File:** src/features/users/user-security-section.tsx

### Current state
- Three blocks: Auth info, Password Status, Admin Security Actions
- All admin actions in one undifferentiated flex-wrap row
- Generic "Confirm" dialog styling for all actions regardless of risk

### Identified gaps

| Gap | Severity | Detail |
|---|---|---|
| Admin actions not grouped | High | All in one row with no categories |
| last_password_security_action shown as raw code | Medium | admin_set_temp_password not human-readable |
| Confirm dialog not destructive for risky actions | Medium | Force password change looks same as send email |
| No view-only locked message | Low | Users without users.security.manage see reduced info with no explanation |

### Planned improvements

1. Group admin actions into labeled sections:
   - Password Management: Send Reset Link, Set Temporary Password, Force Password Change, Clear Force Change
   - Email and Onboarding: Send Welcome Email, Send Invite Email, Mark Email Verified

2. Humanize last_password_security_action:
   - admin_set_temp_password → "Admin Set Temporary Password"
   - password_reset_sent → "Password Reset Email Sent"
   - forced_change_set → "Force Change Enabled"
   - forced_change_cleared → "Force Change Cleared"
   - password_changed → "Password Changed by User"

3. Destructive styling for high-risk actions (Force Change, Suspend)

4. View-only state: show Lock icon row "Security actions require users.security.manage permission"

---

## 9. Effective Access UX Plan

**Status:** Server actions exist (getMyEffectiveAccess, getUserEffectiveAccess from USERS.5). No UI yet.

### Planned UI (new section in user workspace form)

Section name: "Effective Access"
Gate: users.view OR permissions.view OR audit.view
Location: Between Roles and Security History

Layout:
- Summary strip: "X permissions across Y modules from Z roles"
- If isGlobalAdmin: amber banner "This user is a Global Administrator with unrestricted access"
- Module-grouped accordion list:
  - Module name + icon + permission count chip
  - Per permission: name (humanized), source role badge, scope badge, permission_code in mono (collapsed by default)
- Search bar: filter by permission name or code
- Filter: by module, by role, by scope

States:
- Loading: 3-row skeleton
- Empty (no permissions, non-admin): "This user has no assigned permissions."
- Locked (insufficient permission): Lock icon with explanatory message
- Global admin: Special "unrestricted access" banner

Do not expose: Raw IDs, internal scope metadata beyond name

---

## 10. Security History UX Plan

**File:** src/features/users/user-security-history-section.tsx

### Identified gaps
- Action labels are raw enum strings (USER_SECURITY_RESET_EMAIL_SENT)
- Actor shown as raw #5 — not a name
- Duplicate section title (nav + internal header)
- No skeleton, no error state, no pagination
- Fetch error silently becomes empty list

### Action label mapping

| Raw | Human |
|---|---|
| USER_CREATED | User Account Created |
| USER_UPDATED | Profile Updated |
| USER_STATUS_CHANGED | Account Status Changed |
| USER_ROLE_ASSIGNED | Role Assigned |
| USER_ROLE_REMOVED | Role Removed |
| USER_SECURITY_RESET_EMAIL_SENT | Password Reset Email Sent |
| USER_SECURITY_TEMP_PASSWORD_SET | Temporary Password Set |
| USER_SECURITY_FORCE_CHANGE_SET | Forced Password Change Enabled |
| USER_SECURITY_FORCE_CHANGE_CLEARED | Forced Password Change Cleared |
| USER_SECURITY_EMAIL_CONFIRMED_BY_ADMIN | Email Confirmed by Admin |
| USER_SECURITY_WELCOME_EMAIL_SENT | Welcome Email Sent |
| USER_SECURITY_INVITE_EMAIL_SENT | Invite Email Sent |
| USER_PASSWORD_CHANGED | Password Changed |
| LAST_ADMIN_GUARD_TRIGGERED | Last Admin Guard Triggered |
| UNAUTHORIZED_ACCESS_ATTEMPT | Unauthorized Access Attempt |
| EFFECTIVE_ACCESS_VIEWED | Effective Access Viewed |
| DEBUG_ROUTE_ACCESSED | Auth Debug Page Accessed |

### Planned improvements

1. Apply humanized action label mapping in display
2. Actor: show name instead of raw #ID
3. Loading skeleton: 3-row animated skeleton
4. Error state: "Could not load security history. Please try again." with retry
5. Pagination: show initial 20 events, "Load more" button
6. Remove duplicate internal section title (keep section nav label only)
7. Danger/security events (UNAUTHORIZED, GUARD, DELETE): highlighted row accent

---

## 11. Roles List UX Audit

**File:** src/features/roles/roles-table.tsx

### Current state
- Plain shadcn Table — no ERPDataTable
- No search, no filters, no toolbar
- Activate/deactivate fires immediately — no confirmation
- No permission count or user count columns

### Identified gaps

| Gap | Severity | Detail |
|---|---|---|
| No search or filter | High | Roles list unsearchable |
| Activate/deactivate fires immediately | High | No confirmation |
| Different table component than Users | High | Inconsistency — users uses ERPDataTable |
| No permission count column | Medium | Admins cannot see scope of role |
| No user count column | Medium | Cannot see how many users are on each role |

### Planned improvements

1. Migrate to ERPDataTable with toolbar
2. Quick filter chips: "All" / "System" / "Custom" / "Active" / "Inactive" / "Assignable"
3. Deactivate/activate confirmation dialog
4. Add permission count column (from server query)
5. Add assigned user count column (from server query)
6. Clone as standalone row action button

---

## 12. Role Record Workspace UX Audit

**Files:** role-workspace-form.tsx, role-permissions-section.tsx, role-assigned-users-section.tsx, clone-role-dialog.tsx

### Identified gaps

| Gap | Severity | Detail |
|---|---|---|
| Permissions section lacks search | High | Long module list with no search |
| System role permission toggle has no confirmation | High | Immediate change on system roles |
| Permissions/users sections not lazy-mounted | Medium | Load even when on Overview tab |
| No status badge in header | Medium | Status is select field only |
| Clone dialog lacks permission copy count preview | Low | User does not know how many permissions will copy |

### Planned improvements

1. Add search/filter bar inside role-permissions-section
2. System role permission toggle: show confirmation "Modifying system role permissions affects all assigned users. Continue?"
3. Add lazyMount to Permissions and Assigned Users section panels
4. Add status badge (active/inactive chip) in role record header
5. Clone dialog: show "Will copy X permissions from source" before submit

---

## 13. Permissions Matrix UX Audit

**File:** src/features/permissions/permissions-matrix.tsx

### Identified gaps

| Gap | Severity | Detail |
|---|---|---|
| Checkbox does not update visually after toggle | Critical | No optimistic UI — user may double-toggle |
| No system-role protection UI | High | No warning when editing system role permissions |
| No search or filter | High | Large matrix unsearchable |
| No sticky column headers | Medium | Role names scroll away on wide matrices |
| No inactive permission filtering | Medium | Inactive permissions mixed in without visual separation |
| No empty state or error state | Medium | Blank table on failure |
| No module collapse | Low | All modules always expanded |

### Planned improvements

1. Optimistic UI: immediately update local checkbox state, revert on server error
2. System role warning banner at top of each system-role column
3. Search bar: filter permission rows by name/code
4. Sticky role column headers (position: sticky; top: 0)
5. Inactive permissions: group at bottom with "Show inactive" toggle
6. Module collapse: click module header to expand/collapse
7. Error state: "Failed to load permissions. Please reload." with reload button

---

## 14. Audit Page UX Audit

**Files:** src/app/(protected)/admin/audit/page.tsx, src/features/audit/audit-filters-bar.tsx

### Identified gaps

| Gap | Severity | Detail |
|---|---|---|
| Actor filter requires raw profile ID | High | Non-developer admins do not know profile IDs |
| No pagination — hard cap 300 | High | Users assume they see all results |
| Payload shown as raw JSON | Medium | new_values/old_values not human-readable |
| Suspense around filters has no fallback | Low | Brief flash before render |
| Filter desyncs from URL without apply | Low | User can change filter then leave without applying |

### Planned improvements

1. Actor filter: ERPCombobox with debounced user name/email search
2. Pagination: "Load more" or URL-driven offset beyond 300
3. Payload viewer: SafePayloadDisplay per row (key-value table, not raw JSON)
4. Event severity row tinting:
   - UNAUTHORIZED_ACCESS_ATTEMPT, LAST_ADMIN_GUARD_TRIGGERED: red/destructive tint
   - USER_DELETED, ROLE_DELETED: amber tint
   - USER_CREATED, ROLE_CREATED: light green tint
5. "Copy audit ID" button per row
6. Suspense fallback skeleton for filters bar

---

## 15. Access / No Access / Debug UX Audit

### /access-denied
- Good: clear messaging, ShieldX icon, Back to Dashboard
- Gap: uses raw anchor tag instead of Next.js Link; no contact admin message

### /no-access
- Good: ShieldOff icon, personalized welcome, admin guidance
- Gap: no CTA button; no logout option; no user code/email for support reference

### /dev/auth-debug
- Good: USERS.5 guarded properly (admin-only, audited)
- Gap: no visible "This page is audited" reminder banner for admin

### Planned improvements

1. /access-denied: use Next.js Link; add "Contact your administrator if you believe this is an error."
2. /no-access: add "Sign Out" link; add "Go to Notifications" button as safe alternative
3. /dev/auth-debug: add amber info banner "This page is admin-only and all access is audited."

---

## 16. Admin Sidebar and Navigation Polish Plan

**File:** src/components/layout/app-sidebar.tsx

### Current state
Users/Roles/Permissions/Audit are flat items under "Administration" mixed with org settings, notifications, master data, AI menu.

### Identified gaps

| Gap | Severity | Detail |
|---|---|---|
| No Security & Access sub-group | Medium | RBAC items mixed with unrelated admin items |
| HR and Users modules both use Users icon | Low | Potential visual confusion |
| "Audit Logs" label is developer-facing | Low | "Activity Log" is more admin-friendly |

### Planned improvements

1. Add "Security & Access" subsection within Administration grouping Users, Roles, Permissions, Activity Log
2. Icon updates:
   - Users: UsersRound
   - Roles: Shield
   - Permissions: Lock
   - Audit: ClipboardList
3. Rename "Audit Logs" to "Activity Log"
4. Verify permission-aware hiding still works after restructure

---

## 17. Workspace Standards Compliance Audit

All Users/Admin record pages reviewed against ERP workspace standards:

| Screen | ERPRecordWorkspaceForm | forceCloseActiveTab | Section Nav | Dirty State | Child Dialog Blocking |
|---|---|---|---|---|---|
| User record (edit) | PASS | PASS | PASS | PASS | PASS |
| User record (add) | PASS | PASS | PASS | PASS | PASS |
| Role record (edit) | PASS | PASS | PASS | PASS | PASS |
| Role record (add) | PASS | PASS | PASS | N/A | PASS |

### lazyMount gaps
- Role Permissions section: loads on record open even if user stays on Overview tab
- Role Assigned Users section: same

Fix: Add lazyMount to these two section panels in role-workspace-form.tsx

### No older drawer/dialog patterns found
All main CRUD forms use ERPRecordWorkspaceForm. All child forms use ERPChildDialogForm. Compliant.

---

## 18. Accessibility and Responsive UX Plan

### Accessibility gaps

| Gap | File | Fix |
|---|---|---|
| Icon-only pagination buttons have no aria-label | users-list-toolbar.tsx | Add aria-label="Previous page" and Next page |
| Icon-only "Open user" button | role-assigned-users-section.tsx | Add aria-label="Open user record" |
| Icon-only DropdownMenuTrigger in tables | users-table.tsx, roles-table.tsx | Add aria-label="Row actions" |
| Role remove confirmation button styling | user-workspace-form.tsx | Verify AlertDialogAction is destructive variant |

### Responsive gaps

| Gap | Severity | Fix |
|---|---|---|
| Permissions matrix horizontal scroll on mobile | Medium | Collapse groups on narrow viewport or virtual scroll |
| Users table role badge column on very small screens | Low | max-w-[220px] helps but chips overflow below 375px |
| Audit filters bar on narrow viewport | Low | Already uses responsive grid — verify at 375px |

---

## 19. Performance UX Plan

### Current performance concerns

| Area | Issue | Severity |
|---|---|---|
| Users list: renders all users | High | No server-side pagination — slow for large tenants |
| Permissions matrix: all permissions rendered | Medium | 200+ checkboxes possible per role column |
| Security History: no initial limit | Low | API returns all matching logs |
| Role Permissions section not lazy-mounted | Low | Loads on record open |

### Planned optimizations

1. Users list: URL-driven server pagination (page + pageSize URL params; server action returns totalCount)
2. Permissions matrix: add module collapse to reduce DOM; debounce search
3. Security History: limit initial fetch to 20, add "Load more"
4. Add lazyMount to all non-first-tab sections in Role and User workspace forms
5. Add skeleton to Effective Access section (new)

---

## 20. Database / SQL Plan

USERS.6 requires NO database schema changes, NO RLS changes, and NO permission seed changes.

The only server-query changes are:
- Adding totalCount return to users list query for pagination
- Adding limit and offset params to listUsers() server action
- Both are pure application-layer changes

Any UX need found during implementation that requires a DB change will be deferred and documented.

---

## 21. Recommended USERS.6 Implementation Scope

### Must implement (critical polish)

| Item | Files | Impact |
|---|---|---|
| Quick-filter chips on users list | users-list-toolbar.tsx | High admin efficiency |
| Status-change confirmation dialog | users-table.tsx | Prevents accidental suspensions |
| Fix branch-not-filtered-by-company bug in assign dialog | assign-role-dialog.tsx | Bug fix |
| Reset assign dialog state on open | assign-role-dialog.tsx | Bug fix |
| Optimistic UI for permissions matrix checkbox | permissions-matrix.tsx | Critical UX — checkbox not updating |
| System role warning banner in permissions matrix | permissions-matrix.tsx | Security UX |
| Humanize action labels in Security History | user-security-history-section.tsx | Readability |
| Loading skeleton in Security History | user-security-history-section.tsx | Polish |
| Error state in Security History | user-security-history-section.tsx | Reliability |
| lazyMount on Role Permissions and Assigned Users | role-workspace-form.tsx | Performance |
| Effective Access section UI | New user-effective-access-section.tsx | Feature completion |
| Migrate Roles list to ERPDataTable | roles-table.tsx | Consistency |
| Roles list search + quick filters | Roles page | Usability |
| Roles deactivate confirmation dialog | roles-table.tsx | Safety |
| aria-label fixes across all tables | Multiple | Accessibility |

### Should implement (high-value, low risk)

| Item | Files | Impact |
|---|---|---|
| Audit payload viewer per row | audit-logs-table.tsx | Readability |
| Event severity row tinting | audit-logs-table.tsx | Severity awareness |
| Overview section in user record | user-workspace-form.tsx | First impression |
| Warning banners for suspended/must_change users | user-workspace-form.tsx | Admin awareness |
| Group admin security actions by category | user-security-section.tsx | Clarity |
| Humanize last_password_security_action | user-security-section.tsx | Readability |
| Permission count + user count in roles list | Roles server query + table | Useful metadata |
| Contact admin text on /access-denied | access-denied/page.tsx | Helpfulness |
| Logout option on /no-access | no-access/page.tsx | Recovery UX |
| Security & Access subsection in sidebar | app-sidebar.tsx | Navigation clarity |

### Defer to USERS.7 or future

| Item | Reason |
|---|---|
| Actor combobox in audit filters | Requires user search server action; medium complexity |
| Full server-side pagination for users list | Architecture change; needs query refactor |
| Timeline visual style for Security History | Low impact, pure aesthetic |
| Users list email + last_sign_in_at columns | Auth metadata cost; needs design decision |
| Module collapse in permissions matrix | Complexity vs benefit |
| Permission export / SIEM | Out of scope per instructions |
| user_permission_overrides UI | No backend yet |
| user_sessions UI | No backend yet |

---

## 22. Implementation Sequence for Future USERS.6 Execution

```
1. Bug fixes first (assign-role branch filter, permissions matrix optimistic UI, stale dialog state)
2. Roles list migration to ERPDataTable + search + quick filters + confirm dialogs
3. Users list quick-filter chips + status-change confirmation dialogs
4. lazyMount on role record sections (Permissions, Assigned Users)
5. Effective Access section UI (new component using USERS.5 server actions)
6. Security History polish (humanize labels, skeleton, error state, pagination)
7. Admin security action grouping + humanize last_password_security_action
8. Audit table payload viewer + severity row tinting
9. Overview section in user record + warning banners
10. Access-denied / no-access page polish
11. Sidebar Security & Access subsection + icon updates
12. aria-label audit pass across all tables and dialogs
13. Final tsc --noEmit + npm run build + Browser UAT
```

---

## 23. Acceptance Criteria for Future Implementation

| AC | Description |
|---|---|
| AC-01 | Users list has quick-filter chips (Active / Suspended / Must Change Password / No Role) |
| AC-02 | Status change (suspend/deactivate) requires confirmation dialog |
| AC-03 | Assign role dialog filters branches by company and resets state on open |
| AC-04 | Permissions matrix checkbox updates optimistically |
| AC-05 | System role permission toggle shows warning |
| AC-06 | Roles list uses ERPDataTable with search + quick filters |
| AC-07 | Security History shows humanized action labels |
| AC-08 | Security History has loading skeleton and error state |
| AC-09 | Effective Access section exists in user record and is permission-gated |
| AC-10 | Role Permissions and Assigned Users sections are lazy-mounted |
| AC-11 | All icon-only buttons have aria-label |
| AC-12 | /access-denied uses Next.js Link and has contact admin message |
| AC-13 | /no-access has sign-out option |
| AC-14 | Admin security actions are grouped by category |
| AC-15 | TypeScript passes (npx tsc --noEmit) |
| AC-16 | Production build passes (npm run build) |
| AC-17 | USERS.1–USERS.5 security logic is untouched |
| AC-18 | All 20 browser UAT scenarios pass |

---

## 24. Test and Browser UAT Plan

| Scenario | Role | Verify |
|---|---|---|
| 1. Admin views users list | system_admin | Quick filters work; status badges correct; Clear filters works |
| 2. Admin tries to suspend a user | system_admin | Confirmation dialog appears; cancel works; suspend completes |
| 3. Admin tries to suspend last system_admin | system_admin | Warning shown in confirm dialog |
| 4. Admin opens a user record | system_admin | Overview section shows status, user code, company, warnings |
| 5. Admin assigns role with company/branch | system_admin | Branch filtered to selected company; form resets on close/reopen |
| 6. Admin assigns system_admin role | system_admin | High-privilege warning shown in assign dialog |
| 7. Admin views Security History | system_admin | Humanized labels; no raw codes; skeleton on load; error state on failure |
| 8. Admin views Effective Access section | system_admin | Permissions grouped by module; source role shown; search works |
| 9. HR Manager opens users list | hr_manager | No delete/suspend buttons; limited actions only |
| 10. Admin toggles permission in matrix | system_admin | Checkbox immediately updates; toast confirms |
| 11. Admin toggles system role permission | system_admin | Warning banner shown |
| 12. Admin uses roles list | system_admin | Search works; quick filters work; deactivate requires confirm |
| 13. Admin clones a role | system_admin | Dialog shows permission count; navigates to new role |
| 14. Admin opens audit page | system_admin | Filters work; payload viewer shows key-value; severity tinting visible |
| 15. User lands on /access-denied | limited_user | Friendly message; contact admin text; Link works |
| 16. User with no modules lands on /no-access | new_user | Sign-out link visible; clear guidance |
| 17. USERS.4 regression: HR menus visible for hr_manager | hr_manager | HR menus still visible; DMS menus invisible |
| 18. USERS.2A regression: forced password change works | any | Change password flow unaffected |
| 19. Keyboard nav through user form sections | keyboard | Focus moves correctly; dialogs trap focus |
| 20. Mobile: users list at 375px | mobile | Filters wrap; table scrolls; no layout breakage |

### Required commands
```bash
npx tsc --noEmit
npm run build
```

---

## 25. Risks and Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Roles list migration to ERPDataTable breaks row-click navigation | Medium | ERPDataTable supports onRowClick — verify prop before merging |
| lazyMount on Permissions section causes layout shift | Low | Section panel handles consistent height |
| Optimistic UI for permissions matrix desyncs on server error | Medium | Roll back optimistic state on error + error toast |
| Sidebar restructure affects permission-aware hiding | Medium | Test all sidebar items for visibility after restructure |
| Effective Access section slow for users with many roles | Low | Limit to 100 permissions with "more" indicator |

---

## 26. Items Explicitly Deferred

| Item | Reason |
|---|---|
| Full server-side pagination for users list | Requires query refactor — high risk |
| Actor combobox in audit filters | Needs user-search server action not yet written |
| Permission export / audit export | Out of scope per instructions |
| user_permission_overrides UI | No backend yet |
| user_sessions UI | No backend yet |
| Timeline visual style for Security History | Low priority |
| email + last_sign_in_at columns in users table | Auth metadata cost; needs decision |
| Module collapse in permissions matrix | Complexity vs benefit |
| Full SIEM / event severity filtering | Out of scope |
| Any DB schema change | None required |
| Any RLS policy change | None required |
| Any permission seed change | None required |

---

## 27. Source-of-Truth Update Plan

After USERS.6 implementation is complete and UAT passes, update .cursor/ALGT_ERP_SOURCE_OF_TRUTH.md:

```
USERS.6 UI/UX Polish and Admin Workspace — CLOSED / PASS
  Reports:
    ERP_USERS_6_UI_UX_POLISH_AND_ADMIN_WORKSPACE_IMPLEMENTATION_REPORT.md
    ERP_USERS_6_BROWSER_UAT_VERIFICATION_REPORT.md
  Summary:
    - Users list quick-filter chips + status-change confirmations
    - Assign-role dialog branch filter fixed + form reset
    - Roles list migrated to ERPDataTable + search + quick filters + confirm
    - Permissions matrix optimistic UI + system role warning banner
    - Security History humanized labels + skeleton + error state
    - Effective Access section UI implemented
    - Admin security actions grouped by category
    - Audit table payload viewer + severity tinting
    - User record Overview section
    - Access-denied / no-access pages polished
    - Sidebar Security & Access subsection
    - aria-label audit pass
    - lazyMount on Role Permissions and Assigned Users sections
  Next phase: ERP USERS.7 — planning-first only
```

---

## 28. Recommended Next Cursor Implementation Prompt Summary

When Sameer uploads this plan to ChatGPT and receives the implementation prompt, it should instruct Cursor to:

1. Read this plan file before any changes
2. Read .cursor/ALGT_ERP_SOURCE_OF_TRUTH.md and all USERS.5 reports
3. Implement items in the sequence defined in Section 22
4. Not touch USERS.1–USERS.5 security logic
5. Not create DB migrations
6. Run npx tsc --noEmit and npm run build after implementation
7. Create ERP_USERS_6_UI_UX_POLISH_AND_ADMIN_WORKSPACE_IMPLEMENTATION_REPORT.md
8. Create ERP_USERS_6_BROWSER_UAT_VERIFICATION_REPORT.md
9. Update .cursor/ALGT_ERP_SOURCE_OF_TRUTH.md

---

## 29. Final Recommendation

USERS.6 is a well-scoped and low-risk UX polish phase. The security foundation from USERS.1–USERS.5 is solid and must not be touched.

The implementation is bounded to:
- 3 bug fixes (assign-role branch filter, permissions matrix checkbox, stale dialog state)
- 4 new/updated components (UserEffectiveAccessSection, updated roles toolbar, user overview section, audit payload viewer)
- Humanization of 15+ raw codes and IDs
- Skeleton and error states for 3 sections
- Accessibility aria-label audit across all tables
- 1 list migration (Roles to ERPDataTable)
- Sidebar subsection reorganization

Total estimated effort: 6-8 implementation sessions.

Highest priority: bug fixes first (branch filter, optimistic checkbox), then feature completions (Effective Access section UI), then cosmetic polish.

This plan is ready for ChatGPT review before the implementation prompt is issued.
