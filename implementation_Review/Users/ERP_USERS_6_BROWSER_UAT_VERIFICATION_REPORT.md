# ERP USERS.6 — Browser UAT Verification Report

**Phase:** ERP USERS.6  
**Status:** READY FOR UAT  
**Date:** 2026-06-29

---

## UAT Scope

This report defines the manual browser verification scenarios for USERS.6. Each scenario corresponds to one or more implementation tasks and acceptance criteria.

---

## Test Environment

| Parameter | Value |
|---|---|
| Application | ALGT ERP |
| Base URL | http://localhost:3000 |
| Test Account | Global Admin account |

---

## T01 — Users List Quick Filters

**Route:** `/admin/users`

| Step | Action | Expected Result |
|---|---|---|
| 1 | Load the page | "All" chip is highlighted as active |
| 2 | Click "Active" chip | URL updates to `?status=ACTIVE`. Table shows only ACTIVE users. Chip is highlighted. |
| 3 | Click "Suspended" chip | URL updates to `?status=SUSPENDED`. Table shows only suspended users. |
| 4 | Click "Inactive" chip | URL updates to `?status=INACTIVE`. Table shows only inactive users. |
| 5 | Click "Must Change Password" chip | URL updates to `?mcp=1`. Table shows only users with `must_change_password=true`. Status column shows "⚠ Must change pwd" next to their status badge. |
| 6 | Click "No Role" chip | URL updates to `?no_role=1`. Table shows only users with zero assigned roles. |
| 7 | With any filter active, click "Clear All Filters" | URL params cleared. All chip returns to active state. All users shown. |
| 8 | Set status dropdown to "Active" | `status=ACTIVE` appears in URL; filter functions |

---

## T02 — User Status Change Confirmation Dialog

**Route:** `/admin/users`

| Step | Action | Expected Result |
|---|---|---|
| 1 | Find an active user, open row actions (⋮) | Dropdown shows options including "Suspend User" and "Deactivate User" |
| 2 | Click "Suspend User" | Confirmation dialog appears: "Suspend [User Name]?" with descriptive copy and a destructive "Suspend" button |
| 3 | Click Cancel | Dialog closes, no change applied |
| 4 | Click "Suspend User" again, then confirm | User status changes to Suspended. Toast shown. |
| 5 | On a suspended user, open actions | Options include "Activate User" |
| 6 | Click "Activate User" | Confirmation dialog: "Activate [User Name]?" with an activate button (not destructive) |

---

## T03 — Assign Role Dialog

**Route:** `/admin/users` → open any user record → Roles tab → Assign Role

| Step | Action | Expected Result |
|---|---|---|
| 1 | Open the Assign Role dialog | All fields are blank/default (no stale state from a previous open) |
| 2 | Select a role with Scope = Company | Company combobox appears and is required. Branch combobox does not appear. |
| 3 | Select a company | Branch combobox appears for roles with company-scoped sub-branches |
| 4 | Select a branch | Branch options are filtered to only branches belonging to the selected company |
| 5 | Close dialog, reopen | All fields are blank again |
| 6 | Select a high-privilege role (system_admin) | Amber warning banner appears: "This is a high-privilege role. Assign with caution." |
| 7 | Submit without selecting company (when scope requires it) | Validation error shown, form does not submit |

---

## T04 — User Record Overview Section

**Route:** `/admin/users` → open any user record

| Step | Action | Expected Result |
|---|---|---|
| 1 | Record opens | First visible section is "Overview" |
| 2 | View "Overview" section | Shows status chip, user code, full name, display name, email, job title, organization, branch, role count, member-since date |
| 3 | Open a user with `must_change_password=true` | Amber warning banner in Overview: "This user must change password on next login." |
| 4 | Open a suspended user | Info banner in Overview indicates suspended account |

---

## T05 — Effective Access Section

**Route:** `/admin/users` → open any user record → Effective Access tab

| Step | Action | Expected Result |
|---|---|---|
| 1 | Click "Effective Access" section | Section loads showing a summary: "X permissions across Y modules from Z roles" |
| 2 | View permission rows | Each row shows: permission name, source role badge, scope badge (Global/Company/Branch) |
| 3 | Permissions are grouped by module | Each module has a header grouping its permissions |
| 4 | Type in the search input | Displayed permissions filter in real-time by permission name, code, module, or role name |
| 5 | Open a Global Admin user | Amber banner: "This user is a global administrator and bypasses standard permission checks." |
| 6 | While section is loading | Skeleton rows are shown |
| 7 | If server returns error | Error message shown with Retry button |

---

## T06 — Security History Polish

**Route:** `/admin/users` → open any user → Security History tab

| Step | Action | Expected Result |
|---|---|---|
| 1 | Open Security History | Skeleton rows shown briefly while loading |
| 2 | View events | Action labels are humanized (e.g., "Admin Set Temporary Password" not "admin_set_temp_password") |
| 3 | If no events | Empty state: "No security events recorded for this user." |
| 4 | Click expand (▶) on an event with payload | Details expand showing key-value pairs; sensitive fields (password, hash, token) are not shown |
| 5 | High-risk events (delete, unauthorized) | Red left border highlight |
| 6 | More than 20 events | "Load More" button appears at bottom; clicking loads 10 more at a time |

---

## T07 — Account Security Action Grouping

**Route:** `/admin/users` → open any user → Account Security tab

| Step | Action | Expected Result |
|---|---|---|
| 1 | View section | Actions are grouped under "Password Management" and "Email & Onboarding" headings |
| 2 | "Last password security action" label | Shows humanized value (e.g., "Password Reset Email Sent") not raw code |
| 3 | Log in as a user without `users.security.manage` permission | Section is read-only with a locked message indicating insufficient permissions |

---

## T08 — Roles List Search and Filters

**Route:** `/admin/roles`

| Step | Action | Expected Result |
|---|---|---|
| 1 | Type in the search field | Roles filtered in real-time by name, code, display name, or category |
| 2 | Click "System" chip | Only system-defined roles shown |
| 3 | Click "Custom" chip | Only custom/user-defined roles shown |
| 4 | Click "Active" chip | Only active roles shown |
| 5 | Click "Inactive" chip | Only inactive roles shown |
| 6 | Click "Assignable" chip | Only roles with `is_assignable=true` shown |
| 7 | With filter active, click "Clear" | All filters reset; all roles shown |
| 8 | Click Deactivate on an active role | Confirmation dialog: "Deactivate [Role Name]?" |
| 9 | Confirm deactivation | Role status updates. Toast shown. |

---

## T09 — Role Record Lazy Mount

**Route:** `/admin/roles` → open any role

| Step | Action | Expected Result |
|---|---|---|
| 1 | Open role record | "Details" section loads immediately. Permissions and Assigned Users sections do NOT trigger data fetch. |
| 2 | Click "Permissions" section | Section content loads (skeleton, then data) |
| 3 | Click "Assigned Users" section | Section content loads (skeleton, then data) |
| 4 | Open Clone Role dialog | Banner shows: "Permissions will be copied. User assignments will not be copied." |

---

## T10 — Permissions Matrix Optimistic UI

**Route:** `/admin/permissions`

| Step | Action | Expected Result |
|---|---|---|
| 1 | View permissions matrix | System-role warning banner visible at top |
| 2 | Toggle a permission checkbox ON | Checkbox visually updates immediately (optimistic) |
| 3 | Server confirms success | Toast: "Permission assigned." Checkbox remains checked. |
| 4 | Simulate server failure (network off) | Toast: "Failed to update permission." Checkbox reverts to previous state. |
| 5 | Each checkbox | Has a descriptive aria-label ("Assign users.create for company_admin") |

---

## T11 — Audit Log Payload Viewer + Severity

**Route:** `/admin/audit`

| Step | Action | Expected Result |
|---|---|---|
| 1 | View audit table | Action column shows colored badges (red = critical, amber = high, blue = medium, outline = low) |
| 2 | Critical events (DELETED, UNAUTHORIZED) | Red badge in Action column |
| 3 | High-severity events (SECURITY, STATUS_CHANGED) | Amber badge |
| 4 | Click expand on an event with payload | Payload reveals key-value pairs; sensitive fields blocked |
| 5 | Click copy icon on an audit row | Audit ID copied to clipboard; toast/check icon confirms |
| 6 | Click collapse on expanded payload | Payload collapses back |

---

## T12 — Access Denied / No Access / Auth Debug

| Step | Route | Expected Result |
|---|---|---|
| 1 | Navigate to a forbidden route | `/access-denied` page shown; "Go back" is a Next.js Link; contact admin message visible |
| 2 | Log in as user with no roles | `/no-access` page shown; "Sign Out" button visible and functional; "Notifications" link visible |
| 3 | Navigate to `/dev/auth-debug` | Amber banner: "Admin Only — Audited Page" |

---

## T13 — Sidebar Security & Access Subsection

**Route:** Any page

| Step | Action | Expected Result |
|---|---|---|
| 1 | Open sidebar, expand Administration | "Security & Access" subsection visible |
| 2 | View items | Users (UsersRound icon), Roles (Shield icon), Permissions (Lock icon), Activity Log (ClipboardList icon) |
| 3 | Click "Activity Log" | Navigates to `/admin/audit` |
| 4 | Items respect permissions | Non-admin users see only items they have permission to view |

---

## T14 — Accessibility

| Step | Action | Expected Result |
|---|---|---|
| 1 | Tab to user row actions button | Focus visible; screen reader announces "Open user actions" |
| 2 | Tab to role row actions button | Screen reader announces "Open role actions" |
| 3 | Tab to permission checkboxes | Each announces e.g. "Assign users.create for company_admin" |
| 4 | Tab to payload expand buttons | Announces "Expand details" or "Collapse details" |
| 5 | Tab to copy audit ID button | Announces "Copy audit ID" |
| 6 | Tab to "Remove role" button | Announces "Remove [role name]" |

---

## UAT Decision Criteria

| Result | Threshold |
|---|---|
| **PASS** | All critical/high scenarios pass; minor cosmetic issues acceptable |
| **CONDITIONAL PASS** | 1–2 medium scenarios fail but do not block core workflow |
| **FAIL** | Any critical scenario fails (data mutation, security gate, crash) |

**Pre-UAT status:** READY. All implementation tasks complete, TypeScript clean, build running.
