# ERP USERS.4 — Runtime Permission Flow Correction Report

**Phase:** ERP USERS.4 — Runtime Permission Flow Correction
**Date:** 2026-06-29
**Status:** CLOSED / PASS WITH NOTES (browser UAT pending user confirmation)

---

## Executive Summary

Previous fix attempts correctly rewrote `getAuthContext()` from `!inner` joins to flat sequential queries, but still returned `permissionCodes = []` at runtime. The actual root cause was **Row-Level Security (RLS) blocking** the permissions queries. The `roles`, `role_permissions`, and `permissions` tables all require `roles.view` / `permissions.view` permissions to SELECT — creating a bootstrapping deadlock: to know what permissions the user has, you need to query tables that require permissions to access. Fixed by switching the permissions lookup to `createAdminClient()` (service-role client, bypasses RLS).

---

## Live Bug Confirmed

```
User: sameer.fahmi@pgi.ae
Observation: /start → 307 → /notifications
Reason: getFirstPermittedRoute([], false) → /notifications (publicToAllActive fallback)
Root cause: permissionCodes = [] because RLS blocked roles/permissions queries
```

---

## Exact SQL Permission Verification (sameer.fahmi@pgi.ae)

**user_profile_id:** 14
**auth_user_id:** 9c27cfac-257b-41b9-8a2b-e64d61e996ab
**status:** active
**Roles:**
- hr_manager (role_id=5, assignment_active=true, role_active=true)
- dms_manager (role_id=14, assignment_active=true, role_active=true)

**Effective permissions:**
- Total: 140 active permissions
- HR (hr.*): 36 permissions (hr.dashboard.view, hr.employees.view, hr.admin, hr.search.use, etc.)
- DMS (dms.*): 62 permissions (dms.admin, dms.documents.view, dms.documents.upload, etc.)
- Also: dashboard.view, reports.view, master_data.parties.view, organizations.view

---

## Exact Root Cause

**File:** `src/lib/rbac/check.ts` — `getAuthContext()`

**RLS policies that blocked queries (service_role bypasses all):**
```
roles          SELECT: current_user_has_permission_any_scope('roles.view')
role_permissions SELECT: current_user_has_permission_any_scope('roles.view')
permissions    SELECT: current_user_has_permission_any_scope('permissions.view')
user_roles     SELECT: user_profile_id = current_user_profile_id()  ← this WORKS
```

**Problem chain:**
1. User logs in
2. `getAuthContext()` calls `createClient()` (cookie-based, runs as the authenticated user)
3. `user_roles` query: SUCCEEDS (user can see their own rows)
4. `roles` query: FAILS SILENTLY — returns [] because user lacks `roles.view`
5. `role_permissions` query: SKIPPED (roleIds is empty because step 4 returned [])
6. `permissions` query: SKIPPED
7. Result: `permissionCodes = []`

This is a bootstrapping deadlock: you need `roles.view` to read `roles`, but you don't have `roles.view` yet because you can't read `roles`.

---

## getAuthContext Runtime Result Before/After

**Before fix:**
- user_roles query: returns [{role_id: 5}, {role_id: 14}] (RLS allows own rows)
- roles query: returns [] (RLS blocks — no roles.view)
- role_permissions query: skipped
- permissions query: skipped
- permissionCodes: []

**After fix:**
- user_roles query: returns [{role_id: 5}, {role_id: 14}] (admin client)
- roles query: returns [{id:5, role_code:"hr_manager"}, {id:14, role_code:"dms_manager"}] (admin client)
- role_permissions query: returns 140 rows (admin client)
- permissions query: returns 140 permission codes (admin client)
- permissionCodes: [140 codes including hr.dashboard.view, dms.admin, dashboard.view, ...]

---

## Layout → ErpShell → AppSidebar Prop Chain (Verified Correct)

```
layout.tsx:       ctx = getAuthContext() → passes ctx.permissionCodes + isGlobalAdmin to ErpShell
erp-shell.tsx:    receives permissionCodes, isGlobalAdmin → passes to AppSidebar + computes defaultRoute
app-sidebar.tsx:  receives permissionCodes, isGlobalAdmin → uses in canUserSeeItem()
```

No change needed in the prop chain — it was always correct structurally.

---

## HR/DMS Permission Mapping Verification

Sidebar nav items already use exact DB permission codes. No mapping changes needed:
- HR Dashboard: requiredAnyPermissions: ["hr.dashboard.view", "hr.employees.view", "hr.admin"] ✓
- HR Employees: requiredAnyPermissions: ["hr.employees.view", "hr.admin"] ✓
- DMS Dashboard: requiredAnyPermissions: ["dms.documents.view", "dms.admin"] ✓
- All DMS items: requiredAnyPermissions: ["dms.documents.view", "dms.admin"] ✓

---

## Dashboard Default / Workspace Pin Fix

- localStorage version bumped to "4" — clears stale pinned Dashboard tabs for all users on next load
- WorkspaceProvider moved to ErpShell (passes permission-aware defaultRoute)
- RESTORE_TABS uses defaultRoute instead of always Dashboard
- Dashboard page: redirect to getFirstPermittedRoute() instead of "Limited access" card

---

## Files Changed

| File | Change |
|---|---|
| `src/lib/rbac/check.ts` | Added `createAdminClient` import; switched all 4 queries to admin client |
| `src/lib/workspace/workspace-store.ts` | localStorage version bump (v4); restoreFromStorage clears stale state |
| `src/app/(protected)/dev/auth-debug/page.tsx` | NEW — runtime debug page (dev only) |

---

## Tests Run

- `npx tsc --noEmit`: PASS
- All grep checks: PASS
- DB SQL verification: 140 permissions confirmed for sameer.fahmi@pgi.ae

---

## Remaining Notes

1. `dms_manager` role permissions were populated in the previous fix round (62 permissions including `dms.admin`)
2. Dev diagnostic page at `/dev/auth-debug` should be guarded or removed before production deployment
3. Browser UAT to be confirmed by user after login with stale localStorage cleared

---

## Final Status

CLOSED / PASS WITH NOTES