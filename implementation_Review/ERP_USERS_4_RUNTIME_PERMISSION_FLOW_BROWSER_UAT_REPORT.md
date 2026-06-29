# ERP USERS.4 — Runtime Permission Flow Browser UAT Report

**Phase:** ERP USERS.4 — Runtime Permission Flow Correction
**Date:** 2026-06-29
**Status:** PENDING USER CONFIRMATION — fixes applied, awaiting live browser verification

---

## Test User

```
sameer.fahmi@pgi.ae (display: Sameer-2)
Roles: hr_manager + dms_manager
Expected permissions: 140 active (36 HR + 62 DMS + dashboard.view + others)
```

---

## Pre-Test Instructions

Before testing, clear localStorage in the browser:
1. Open DevTools → Application → Local Storage → Clear all for localhost:3000
   OR the version bump (STORAGE_VERSION = "4") will automatically clear stale state on next load.

---

## Expected UAT Results

| # | Test | Expected | Notes |
|---|---|---|---|
| 1 | Login → redirected to | `/dashboard` | Has dashboard.view via hr_manager |
| 2 | Dashboard loads | Shows ERP dashboard | No "Limited access" card |
| 3 | Sidebar — Overview section | Dashboard + Notifications visible | ✓ |
| 4 | Sidebar — Human Resource section | Full HR section visible (all subsections) | 36 HR perms |
| 5 | Sidebar — HR > Dashboard | Visible | hr.dashboard.view ✓ |
| 6 | Sidebar — HR > Employees | Visible | hr.employees.view ✓ |
| 7 | Sidebar — HR > Time & Attendance | Visible | hr.attendance.view ✓ |
| 8 | Sidebar — Documents (DMS) section | Full DMS section visible | dms.admin ✓ |
| 9 | Sidebar — DMS > All Documents | Visible | dms.documents.view ✓ |
| 10 | Workspace home tab | Dashboard (pinned) | dashboard.view ✓ |
| 11 | Click HR Dashboard | Opens /admin/hr/dashboard | No 404 |
| 12 | Click DMS | Opens /dms | No access denied |
| 13 | Sidebar — Admin section | Users/Roles HIDDEN | No users.view perm |
| 14 | Direct URL /admin/users | Redirects to /access-denied | Server guard active |
| 15 | /dev/auth-debug | Shows 140 permissionCodes, 2 roleCodes | Diagnostic page |

---

## System Admin Test

| # | Test | Expected |
|---|---|---|
| 1 | Login | Full sidebar visible |
| 2 | Dashboard | Loads |
| 3 | HR section | Visible |
| 4 | DMS section | Visible |
| 5 | Admin section | Visible (Users, Roles, Permissions) |

---

## Root Cause Diagnosed (Confirmed by Code + DB Audit)

The RLS policies on `roles`, `role_permissions`, and `permissions` tables require `roles.view`/`permissions.view` to SELECT. When `getAuthContext()` used the user's JWT client (cookie-based), these queries returned `[]` silently. Switched to `createAdminClient()` (service role) for all permission-lookup queries. `getUser()` still uses the cookie client for authentication.

---

## Status

PENDING USER BROWSER CONFIRMATION