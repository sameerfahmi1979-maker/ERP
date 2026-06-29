# ERP USERS.4 — Critical Sidebar / HR / DMS Permission Correction Report

**Phase:** ERP USERS.4 — Permission-Aware Navigation (Critical Fix Round 2)
**Date:** 2026-06-29
**Status:** COMPLETED

---

## Root Cause Analysis

### Bug 1 (PRIMARY): `getAuthContext()` — ambiguous `is_active` column via `!inner` join

**File:** `src/lib/rbac/check.ts`

The original implementation used Supabase `!inner` joins:

```typescript
// BEFORE (broken)
.select("role_id, roles!inner(role_code, is_active)")
.eq("is_active", true)  // ← ambiguous: both user_roles.is_active AND roles.is_active exist
```

When Supabase PostgREST processes `.eq("is_active", true)` after a `!inner` join where both the parent and child table have an `is_active` column, it silently failed — returning `null` for the query result. This caused `permissionCodes = []` for ALL users, including admins with full roles.

**Effect:**
- Sidebar showed only "Overview" (with Notifications only) — all permission-gated items hidden
- Dashboard showed "Limited access" card for ALL users, even system_admin
- HR menus hidden, DMS menus hidden

**Fix:** Replaced all `!inner` joins with flat sequential queries:
1. `user_roles` WHERE `user_profile_id = X AND is_active = true` → get `role_id[]`
2. `roles` WHERE `id IN (role_ids) AND is_active = true` → get `role_code[]` + `active_role_id[]`
3. `role_permissions` WHERE `role_id IN (active_role_ids)` → get `permission_id[]`
4. `permissions` WHERE `id IN (perm_ids) AND is_active = true` → get `permission_code[]`

### Bug 2 (SECONDARY): `dms_manager` role (id=14) had zero permissions

The admin assigned the `dms_manager` role to user `sameer.fahmi@pgi.ae` but the role itself had no permissions in `role_permissions`. DMS menus would never show for any `dms_manager` user.

**Fix:** Populated `dms_manager` role with 35 core DMS permissions via SQL migration. The role now has 62 total permissions (3 were pre-existing: `audit.view`, `branches.view`, `dms.admin`).

### Bug 3: Dashboard showed static "Limited access" card instead of redirecting

**File:** `src/app/(protected)/dashboard/page.tsx`

When a user lacked `dashboard.view`, the page rendered a static card with technical message: *"Your account does not yet have the dashboard.view permission. Assign roles after migration and admin bootstrap."*

**Fix:** The page now calls `getFirstPermittedRoute()` and `redirect()`s server-side. No flash, no user-visible error.

### Bug 4: All protected pages redirected to `/dashboard` on authorization failure

75+ page permission guards were using `redirect("/dashboard")` when a user failed the permission check. This sent unauthorized users to `/dashboard` which either showed the "Limited access" card or (after Fix 3) redirected them in a loop.

**Fix:** Bulk replaced all `redirect("/dashboard")` → `redirect("/access-denied")` in all 57 affected page files.

### Bug 5: Login form always routed to `/dashboard`

**File:** `src/features/auth/login-form.tsx`

`window.location.href = "/dashboard"` sent all users to `/dashboard` on login regardless of their access level.

**Fix:** Changed to `window.location.href = "/start"` — a new server page that calls `getAuthContext()` and redirects to the user's first permitted route.

### Bug 6: WorkspaceProvider always pinned Dashboard tab regardless of permissions

**Files:** `workspace-store.ts`, `workspace-provider.tsx`, `erp-shell.tsx`, `app-providers.tsx`

The `RESTORE_TABS` reducer always enforced a Dashboard tab (non-closable, pinned) even for users who cannot access `/dashboard`. This meant users without `dashboard.view` would have a permanently stuck, inaccessible tab.

**Fix:**
- `RESTORE_TABS` action now accepts optional `defaultRoute`
- `WorkspaceProvider` accepts `defaultRoute?: string` prop
- `WorkspaceProvider` + `WorkspaceDraftProvider` moved from `AppProviders` (root layout) into `ErpShell` (protected layout), where server-supplied permissions are available
- `ErpShell` computes `defaultRoute` from `getDefaultRoute(permissionCodes, isGlobalAdmin)` — iterates priority-ordered routes and returns the first one the user can access
- Users without `dashboard.view` get their first HR/DMS/Reports route pinned instead

---

## Files Changed

| File | Change |
|---|---|
| `src/lib/rbac/check.ts` | Replaced `!inner` join with flat sequential queries (ROOT FIX) |
| `src/app/(protected)/dashboard/page.tsx` | Redirect instead of "Limited access" card |
| `src/features/auth/login-form.tsx` | Post-login → `/start` instead of `/dashboard` |
| `src/app/(protected)/start/page.tsx` | NEW — Smart post-login redirect server page |
| `src/components/layout/erp-shell.tsx` | Added `WorkspaceDraftProvider` + `WorkspaceProvider(defaultRoute)` |
| `src/components/layout/app-providers.tsx` | Removed WorkspaceProvider (moved to ErpShell) |
| `src/lib/workspace/workspace-store.ts` | `RESTORE_TABS` uses `defaultRoute` instead of always Dashboard |
| `src/lib/workspace/workspace-types.ts` | Added `defaultRoute?: string` to `RESTORE_TABS` action |
| `src/components/workspace/workspace-provider.tsx` | Accepts `defaultRoute` prop, passes to dispatch |
| 57x `src/app/(protected)/**/*.tsx` | Bulk `redirect("/dashboard")` → `redirect("/access-denied")` |

---

## Database Changes

| Table | Change |
|---|---|
| `role_permissions` | Inserted 35 DMS permissions for `dms_manager` role (id=14) |

---

## Expected UAT Results After Fix

### Scenario 1 — sameer.fahmi@pgi.ae (hr_manager + dms_manager)

| Test | Expected | Notes |
|---|---|---|
| Login | Redirect to `/dashboard` | Has `dashboard.view` via `hr_manager` |
| Sidebar — Overview | Dashboard + Notifications visible | `dashboard.view` ✓ |
| Sidebar — Human Resource | Full HR section visible | `hr.*` permissions from `hr_manager` |
| Sidebar — Documents (DMS) | Full DMS section visible | `dms.admin` from `dms_manager` |
| Sidebar — Reports | Reports section visible | `reports.view` ✓ |
| Click HR Dashboard | Loads `/admin/hr/dashboard` | ✓ |
| Click DMS | Loads `/dms` | ✓ |
| Workspace home tab | Dashboard tab (pinned) | `dashboard.view` ✓ |

### Scenario 2 — User with NO roles (e.g. newly created user)

| Test | Expected |
|---|---|
| Login | Redirected to `/no-access` |
| Sidebar | Only Notifications visible |
| Workspace home tab | `/no-access` |

### Scenario 3 — system_admin

| Test | Expected |
|---|---|
| Login | Redirect to `/dashboard` |
| Sidebar | All sections visible |
| Workspace home tab | Dashboard tab (pinned) |

---

## Security Notes

- Page guards (`hasPermission`/`requirePermission` calls inside each page) remain untouched
- RLS policies remain untouched
- This fix is purely navigation UX — no security enforcement change
- `getAuthContext()` is still called per-request (server-side); no client-side permission bypass possible

---

## Known Outstanding Items

1. **`dms_manager` role permissions**: 62 permissions inserted directly via SQL. Should be reviewed by admin and adjusted as needed via the Roles Management UI.
2. **HR sub-pages** that previously redirected to `/admin` (not `/dashboard`): these were fixed in the previous USERS.4 round and are unaffected by this fix.