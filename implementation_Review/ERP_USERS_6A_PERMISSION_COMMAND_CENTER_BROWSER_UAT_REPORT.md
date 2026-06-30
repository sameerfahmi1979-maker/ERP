# ERP USERS.6A — Permission Command Center Browser UAT Verification Report

**Phase:** ERP USERS.6A  
**Status:** READY FOR UAT  
**Date:** 2026-06-30

---

## UAT Scope

Manual browser verification scenarios for the Role Permission Center. Each scenario corresponds to acceptance criteria from the implementation prompt.

---

## Test Environment

| Parameter | Value |
|---|---|
| Application | ALGT ERP |
| Base URL | http://localhost:3000 |
| Primary Test Account | Global Admin (system_admin role) |
| Secondary Test Account | View-only user (permissions.view only, no roles.manage) |

---

## T01 — Screen Title and Layout

**Route:** `/admin/permissions`

| Step | Action | Expected Result |
|---|---|---|
| 1 | Navigate to `/admin/permissions` | Page title "Role Permission Center" shown in header |
| 2 | View subtitle | "Search permissions on the left, then assign and review roles on the right." |
| 3 | View layout | Left panel (Permission Explorer) + right panel (Role Assignment) side by side |
| 4 | Check stats bar | Shows Total Permissions, Modules, Roles, System Permissions counts |

---

## T02 — Permission Explorer

**Route:** `/admin/permissions`

| Step | Action | Expected Result |
|---|---|---|
| 1 | View left panel | "1. Find a Permission" header; search input visible |
| 2 | View module list | Modules collapsed by default (or restored from last session) |
| 3 | Click a module header | Module expands showing permissions; chevron rotates to down |
| 4 | Click same module again | Module collapses |
| 5 | Reload page | Previously expanded modules remain expanded (localStorage) |
| 6 | Each permission row | Shows `display_name ?? permission_name` + `permission_code` in smaller mono text below |
| 7 | Module count badge | Badge shows correct count of permissions in that module |

---

## T03 — Permission Search

**Route:** `/admin/permissions`

| Step | Action | Expected Result |
|---|---|---|
| 1 | Type "employee" in search | Permissions matching "employee" shown; non-matching modules hidden |
| 2 | View results count | "N results" shown below search |
| 3 | Matching modules auto-expand | All modules with matching permissions expand automatically |
| 4 | Type a permission code | Exact code match shown |
| 5 | Type a description keyword | Description matches shown |
| 6 | Type text with no matches | "No permissions match your search." + "Clear Search" button |
| 7 | Click "Clear Search" | Search cleared; all permissions shown |
| 8 | Click X in search field | Search cleared |

---

## T04 — Select Permission and Right Panel

**Route:** `/admin/permissions`

| Step | Action | Expected Result |
|---|---|---|
| 1 | Before selecting | Right panel shows shield icon + "Select a permission from the left panel" |
| 2 | Click a permission | Permission highlighted (blue left border) in explorer |
| 3 | Right panel updates | Permission summary card shows at top of right panel |
| 4 | Permission summary | Shows name, permission code (mono), module chip, action chip, description |
| 5 | System permission | "System Permission" badge with lock icon shown |
| 6 | Non-system permission | No system badge |

---

## T05 — Role Assignment Table

**Route:** `/admin/permissions` → select any permission

| Step | Action | Expected Result |
|---|---|---|
| 1 | View role table | Columns: Role (name + description), Type, Status, Assign |
| 2 | Role with permission | Status badge shows "Assigned" (green) |
| 3 | Role without permission | Status badge shows "Not Assigned" (gray) |
| 4 | System role | Blue "System" badge in Type column |
| 5 | Custom role | Green "Custom" badge in Type column |

---

## T06 — Draft Toggle — Pending Grant

**Route:** `/admin/permissions` → select permission not assigned to "HR Manager"

| Step | Action | Expected Result |
|---|---|---|
| 1 | Locate "HR Manager" (Not Assigned) | Status: "Not Assigned" |
| 2 | Toggle switch ON | **No DB call yet** — status immediately changes to "Pending Grant" (blue badge) |
| 3 | Row has blue tint | Row background turns light blue |
| 4 | Check database | `role_permissions` table NOT updated yet (verify via Supabase or reload page) |
| 5 | Toggle switch OFF again | Status returns to "Not Assigned"; draft change removed |

---

## T07 — Draft Toggle — Pending Revoke

**Route:** `/admin/permissions` → select permission currently assigned to a role

| Step | Action | Expected Result |
|---|---|---|
| 1 | Locate an assigned role | Status: "Assigned" (green) |
| 2 | Toggle switch OFF | Status changes to "Pending Revoke" (amber badge); no DB call |
| 3 | Toggle switch back ON | Status returns to "Assigned"; draft removed |

---

## T08 — Pending Changes Bar

**Route:** `/admin/permissions` → make one or more draft changes

| Step | Action | Expected Result |
|---|---|---|
| 1 | After first toggle | Sticky bar appears at bottom of page |
| 2 | Bar shows total count | "N pending changes" |
| 3 | Bar shows grant count | "N grants" with green check icon |
| 4 | Bar shows revoke count | "N revokes" with amber X icon |
| 5 | Add more toggles | Counts update in real-time |
| 6 | Revert all toggles to original | Pending bar disappears |

---

## T09 — Discard Changes

**Route:** `/admin/permissions` → make draft changes → click Discard Changes

| Step | Action | Expected Result |
|---|---|---|
| 1 | Click "Discard Changes" | Confirmation dialog: "Discard pending permission changes?" |
| 2 | Dialog shows count | "N changes" mentioned in description |
| 3 | Click "Keep Changes" | Dialog closes; draft preserved |
| 4 | Click "Discard Changes" again, then "Discard Changes" button | All changes cleared; pending bar disappears |
| 5 | All toggle statuses | Return to original database state |
| 6 | Toast shown | "All pending changes discarded." info toast |

---

## T10 — Role Filter on Right Panel

**Route:** `/admin/permissions` → select any permission → use role filter chips

| Step | Action | Expected Result |
|---|---|---|
| 1 | Click "Assigned" chip | Only currently-assigned roles shown (+ any with pending grant) |
| 2 | Click "Unassigned" chip | Only unassigned roles shown (+ any with pending revoke) |
| 3 | Toggle some roles to pending | Click "Pending Changes" chip → shows only roles with pending changes for this permission |
| 4 | "Pending Changes" badge | Shows count of pending changes for the selected permission |
| 5 | Type in role search | Filters roles by name/code in real-time |
| 6 | No matching roles | "No roles match your filters." + "Clear Role Filters" button |
| 7 | Click "Clear" | Resets filter to "All Roles" and clears search |

---

## T11 — Review & Save Dialog

**Route:** `/admin/permissions` → make draft changes → click Review & Save

| Step | Action | Expected Result |
|---|---|---|
| 1 | Click "Review & Save" | Dialog opens: "Review Permission Changes" |
| 2 | Summary strip | Shows total changes, grants badge (emerald), revokes badge (amber) |
| 3 | Change list | Grouped by permission name; "Grant to:" and "Revoke from:" sublists |
| 4 | Each role in list | Shows role name; system roles show "System" badge |
| 5 | System role warning | Amber warning banner if changes include system roles or system permissions |
| 6 | Click Cancel | Dialog closes; draft preserved |

---

## T12 — Confirm & Save

**Route:** `/admin/permissions` → make draft changes → Review & Save → Confirm & Save

| Step | Action | Expected Result |
|---|---|---|
| 1 | Click "Confirm & Save" | Button shows spinner + "Saving…"; Cancel disabled |
| 2 | On success | Dialog closes; success toast "N permission changes saved successfully." |
| 3 | Draft state clears | Pending bar disappears; all status badges return to "Assigned"/"Not Assigned" reflecting new DB state |
| 4 | Reload page | Saved assignments persist (confirmed from DB) |

---

## T13 — Partial Save Failure

**Note:** This test requires temporarily blocked network or a simulated error condition.

| Step | Action | Expected Result |
|---|---|---|
| 1 | Some changes succeed, some fail | Succeeded changes removed from draft; failed changes remain pending |
| 2 | Review dialog stays open | Failed items show red "Failed" label inline |
| 3 | Error toast | "N changes could not be saved. Review the failed items and try again." |
| 4 | User can retry | Failed items remain in pending state; can click Review & Save again |

---

## T14 — System Role Warning

**Route:** `/admin/permissions` → select a system permission → toggle a system role

| Step | Action | Expected Result |
|---|---|---|
| 1 | Select a system permission | Amber warning: "This is a system permission…" |
| 2 | Toggle a system role | No extra dialog; draft added normally |
| 3 | Open Review dialog | Amber warning: "These changes include system roles and system permissions…" |
| 4 | Non-global-admin user | Server returns error if they attempt to save system role changes |

---

## T15 — View-Only User Access

**Route:** `/admin/permissions` (logged in as user with `permissions.view` but NOT `roles.manage`)

| Step | Action | Expected Result |
|---|---|---|
| 1 | Load page | View-only amber banner at top: "You have view-only access…" |
| 2 | Permission Explorer | Visible and functional (can browse/select) |
| 3 | Role table | Visible; status badges shown |
| 4 | Toggle switches | All disabled (cannot interact) |
| 5 | No pending bar | Pending bar never appears |

---

## T16 — No Access User

**Route:** `/admin/permissions` (logged in as user without `permissions.view`)

| Step | Action | Expected Result |
|---|---|---|
| 1 | Navigate to route | "Access denied" card shown |
| 2 | Sidebar | "Permissions" link not visible (USERS.4 permission-aware sidebar) |

---

## UAT Decision Criteria

| Result | Threshold |
|---|---|
| **PASS** | All critical scenarios pass; minor cosmetic issues acceptable |
| **CONDITIONAL PASS** | 1–2 medium scenarios fail but do not block core workflow |
| **FAIL** | Any critical scenario fails (premature save, security bypass, crash) |

**Critical scenarios:** T06 (draft not saved), T10 (discard works), T12 (save confirmed), T15 (view-only enforced)

**Pre-UAT status:** READY. TypeScript clean, build passed, all grep checks clean.
