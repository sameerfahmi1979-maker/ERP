# ERP USERS.4 — Sidebar Permission Filtering & HR Route Fix
## Implementation Report

**Phase:** ERP USERS.4 — Permission-Aware Sidebar and HR Route Correction  
**Date:** 2026-06-29  
**Status:** CLOSED / PASS ✅  
**No DB migration required**

---

## 1. Context

USERS.4 planning was completed earlier (see `ERP_USERS_4_PERMISSIONS_AND_EFFECTIVE_ACCESS_PLAN.md`).
This implementation report covers the immediate correction items:

1. Sidebar was **not** hiding menu items from unauthorized users
2. HR Manager couldn't open the HR module ("Page not found")
3. Authorization guards in HR pages redirected to `/admin` (no such route) instead of a user-friendly error

---

## 2. Root Causes Identified

| Issue | Root Cause |
|---|---|
| Sidebar shows all items to all users | `AppSidebar` had no `permissionCodes` prop; `ErpShell` and `layout.tsx` did not pass permissions |
| HR Manager gets "Page not found" | No `/admin/hr/page.tsx` existed; the route `/admin/hr` had no handler |
| HR route "page not found" (workspace) | HR routes were missing from `workspace-route-registry.ts` |
| "Page not found" link went to `/dashboard` | Acceptable; also affected by missing HR route registry entries |
| Authorization failures show blank or broken pages | All HR page guards redirected to `/admin` — which has no page at that path |
| `getAuthContext()` not called in layout.tsx | The protected layout called `supabase.auth.getUser()` + a manual `user_profiles` select, not `getAuthContext()` — so permissions were never obtained |

---

## 3. Files Changed

### Core Auth & Permission Flow

| File | Change |
|---|---|
| `src/lib/rbac/check.ts` | Added `email: string \| null` to `AuthContext` type; `getAuthContext()` now returns `email` from `user.email`; added `roles!inner(is_active)` + `permissions!inner(is_active)` join filters to skip inactive roles/permissions |
| `src/app/(protected)/layout.tsx` | Replaced `supabase.auth.getUser()` + manual `user_profiles.select()` with single `getAuthContext()` call. Passes `permissionCodes` and `isGlobalAdmin` to `ErpShell` |
| `src/components/layout/erp-shell.tsx` | Added `permissionCodes?: string[]` and `isGlobalAdmin?: boolean` props. Passes them to `AppSidebar` |

### Sidebar Permission Filtering (USERS.4 Core)

| File | Change |
|---|---|
| `src/components/layout/app-sidebar.tsx` | Added `permissionCodes` + `isGlobalAdmin` props to `AppSidebarProps`. Added `canUserSeeItem()` and `sectionHasVisibleChildren()` module-level helper functions. Updated all `navSections` entries with `requiredPermission`, `requiredAnyPermissions`, `requiresGlobalAdmin`, or `publicToAllActive` metadata. Updated section render to: (1) filter direct items by permissions, (2) filter subsection items by permissions, (3) skip entire section if no visible children |
| `src/lib/rbac/route-access-registry.ts` | **NEW FILE** — Maps all sidebar-visible route paths to required permission(s). Provides `canAccessRoute()` helper and `getFirstPermittedRoute()` for post-login redirects. This is a UX registry only — server-side page guards remain the security enforcement layer |

### New Pages

| File | Change |
|---|---|
| `src/app/(protected)/access-denied/page.tsx` | **NEW** — Friendly "Access Denied" page inside `(protected)` layout (ERP shell visible). User can see the sidebar and navigate away |
| `src/app/(protected)/no-access/page.tsx` | **NEW** — "No Modules Assigned" page for users with active accounts but no roles. Server-side: if permissions are found on re-check, redirects to first permitted route |
| `src/app/(protected)/admin/hr/page.tsx` | **NEW** — Smart redirect. `/admin/hr` previously produced a 404. Now redirects to the first HR sub-page the user can access (`hr.dashboard.view` → dashboard, `hr.employees.view` → employees, etc.) or `/access-denied` if no HR access |

### HR Module Navigation

| File | Change |
|---|---|
| `src/lib/workspace/workspace-route-registry.ts` | Added 26 HR route entries (dashboard, search, employees, actions, time, recruitment, payroll, operations, settings, employee record pages) with `moduleCode: "HR"` |
| `src/app/(protected)/admin/hr/**` (26 files) | Changed all authorization failure redirects from `redirect("/admin")` or `redirect("/dashboard")` to `redirect("/access-denied")` |

---

## 4. Sidebar Filtering Logic

### How It Works

```
layout.tsx
  └─ getAuthContext() → { permissionCodes, isGlobalAdmin, email, profile }
       └─ ErpShell(permissionCodes, isGlobalAdmin)
            └─ AppSidebar(permissionCodes, isGlobalAdmin)
                 └─ navSections.map(section)
                      └─ filter direct items via canUserSeeItem()
                      └─ filter subsection items via canUserSeeItem()
                      └─ skip section if all items filtered
```

### Permission Metadata on Nav Items

Each `NavItem` can declare one of:

| Field | Behavior |
|---|---|
| `requiredPermission` | User must have this exact permission code |
| `requiredAnyPermissions` | User must have at least one of these codes |
| `requiresGlobalAdmin` | Only `system_admin` / `group_admin` |
| `publicToAllActive` | Any authenticated user (e.g. Notifications) |
| *(none set)* | Visible to all — backward-compat fallback |
| `disabled: true` | Only visible to global admins (greyed out) |

### `canUserSeeItem()` Logic

```
if disabled → only isGlobalAdmin
if publicToAllActive → true
if isGlobalAdmin → true (bypass all checks)
if requiresGlobalAdmin → false
if requiredPermission → permissionCodes.includes(code)
if requiredAnyPermissions → codes.some(c => permissionCodes.includes(c))
fallback → true
```

---

## 5. Security Note

This sidebar filtering is **UX-only**. It does not replace server-side permission enforcement.

Every protected page still independently calls `hasPermission(ctx, "...")` and redirects on failure.
Users cannot gain access by bypassing sidebar navigation — the server-side guard fires on any direct URL access.

---

## 6. HR Manager — Before vs After

| Scenario | Before | After |
|---|---|---|
| HR Manager opens `/admin/hr` | 404 (page not found) | Smart redirect → `/admin/hr/dashboard` |
| HR Manager sees sidebar | Full sidebar including Admin, Finance, etc. | Only Human Resource section and any other permitted modules |
| HR Manager direct-URLs `/admin/users` | Redirect to `/admin` (404) | Redirect to `/access-denied` (friendly error) |
| Admin opens sidebar | Full sidebar (unchanged) | Full sidebar (isGlobalAdmin=true bypasses all checks) |

---

## 7. `AuthContext.email` Addition

The `UserProfile` type does not store email (it's stored in `auth.users`).
Previously `layout.tsx` got email via `supabase.auth.getUser().user.email`.
After this fix, `getAuthContext()` returns `email: user.email ?? null` to avoid a second DB round-trip.

---

## 8. TypeScript Check

```
npx tsc --noEmit → Exit 0 (no errors)
```

---

## 9. What's NOT in This Phase

- Effective Access viewer (planned USERS.4.2)
- User profile "My Permissions" tab (planned USERS.4.3)
- Improved post-login routing using `getFirstPermittedRoute()` (can be wired to middleware)
- Per-page `<UnauthorizedState>` component (instead of redirect to `/access-denied`)
- `getAuthContext()` caching / request-level memoization (USERS.4 plan §14)

---

## 10. Next Steps

- **USERS.5** or further USERS.4 items per Sameer's direction
- Consider wiring `getFirstPermittedRoute()` in Next.js middleware for post-login redirect
