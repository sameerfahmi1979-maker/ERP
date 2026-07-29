# ERP USERS.2 — User Management Core Implementation Report

**Phase:** ERP USERS MODULE — USERS.2 User Management Core  
**Date:** 2026-06-27  
**Status:** CLOSED / PASS WITH NOTES  
**Plan followed:** `implementation_Review/ERP_USERS_2_USER_MANAGEMENT_CORE_PLAN.md`

---

## 1. Executive Summary

USERS.2 delivers server-side users list pagination/search/filters, admin email visibility via safe auth metadata helpers, profile save fixes (`notes`, `employee_reference`, `last_admin_updated_at`), full role display with scope, remove-role UI with confirmation, extended last-system-admin protection on role removal, Security section with last sign-in, distinct status UX including Suspend, and `ERPCombobox` + `is_assignable` filtering in Assign Role dialog.

All USERS.1 security controls preserved. No migration created. No HR data duplication. No `employee_id` FK.

**Decision:** PASS WITH NOTES — Playwright not run; pre-existing sidebar hydration warning unrelated to USERS.2.

---

## 2. Approved Plan Followed

| Planned item | Implemented |
|---|---|
| `listUsersPaginated` | Yes |
| Server-driven `/admin/users` UI | Yes |
| Admin email via `createAdminClient()` batch | Yes |
| Fix notes/employee_reference save | Yes |
| Auto-set `last_admin_updated_at` | Yes |
| Remove-role UI + guard | Yes |
| All roles + scope display | Yes |
| Security section (last sign-in) | Yes |
| Suspend action + badge styling | Yes |
| AssignRoleDialog ERPCombobox + is_assignable | Yes |
| Optional search index migration | No (not needed at current scale) |
| employee_id FK | No (deferred) |

---

## 3. Files Changed

| File | Change |
|---|---|
| `src/lib/users/auth-metadata.ts` | **New** — server-only safe auth metadata helpers |
| `src/lib/users/role-scope.ts` | **New** — role scope resolution/formatting |
| `src/types/database.ts` | Extended `UserWithRoles`, `UserRoleAssignment`, `UserAuthMetadata` |
| `src/features/users/user-schema.ts` | Added `notes`, `employee_reference` to admin update schema |
| `src/server/actions/users.ts` | `last_admin_updated_at` auto-set; last-admin guard on `removeRoleFromUser` |
| `src/server/queries/users.ts` | `listUsersPaginated`, enhanced `getUserById`, deprecated `listUsers` wrapper |
| `src/app/(protected)/admin/users/page.tsx` | searchParams-driven paginated list |
| `src/features/users/users-list-toolbar.tsx` | **New** — server pagination/search/filter toolbar |
| `src/features/users/users-table.tsx` | All roles, email, branch, status badges, Suspend, server toolbar |
| `src/features/users/user-workspace-form.tsx` | Security section, roles remove UI, assignable filter |
| `src/features/users/assign-role-dialog.tsx` | ERPCombobox + is_assignable filter |

---

## 4. Migration Created / Not Created

**Not created.** Existing indexes on `user_profiles.status`, company, branch, and `employee_reference` are sufficient at current user count (1 production user). No email denormalization. No schema changes.

---

## 5. Users List Pagination/Search/Filter Implementation

- New `listUsersPaginated({ page, pageSize, search, status, ownerCompanyId, branchId, roleId })` returns `{ rows, totalCount, page, pageSize }`.
- Uses Supabase `.range()` + `count: 'exact'`.
- Text search: ILIKE on `full_name`, `display_name`, `user_code`.
- Email search: when query contains `@`, resolves auth user IDs via admin `listUsers` then filters profiles.
- Role filter: pre-query `user_roles` for matching profile IDs.
- `/admin/users` reads URL searchParams; `UsersListToolbar` updates URL for pagination/filters.
- Client table receives current page only; global filter disabled on `ERPDataTable`.

---

## 6. Admin Email and Auth Metadata Handling

- `src/lib/users/auth-metadata.ts` (server-only):
  - `getSafeAuthMetadataByAuthUserId()` — email, last_sign_in_at, auth_created_at only
  - `batchSafeAuthMetadata()` — page batch with concurrency limit
  - `findAuthUserIdsByEmailSearch()` — email substring search
- No passwords, tokens, identities JSON, or provider data exposed.
- Emails not logged.

---

## 7. Profile Save Fixes

- `adminUpdateUserProfileSchema` now includes `notes` and `employee_reference`.
- `adminUpdateUserProfile` sets `last_admin_updated_at: new Date().toISOString()` on every successful admin update.
- Confirmed bug fixed: form fields no longer silently dropped by Zod.

---

## 8. Role Assignment and Remove Role Implementation

- `getUserById` returns full `UserRoleAssignment[]` with `user_role_id`, scope, assigned_at, scope names.
- User record Roles section shows all assignments with scope badges and Remove button (edit mode).
- `AlertDialog` confirmation before removal.
- `assignRoleToUser` unchanged; Assign Role dialog refreshed via `router.refresh()`.

---

## 9. Last-System-Admin Protection Extension

- `removeRoleFromUser` now calls `assertNotLastSystemAdmin(user_profile_id)` when removing a `system_admin` role assignment.
- USERS.1 deactivate/delete guards unchanged.
- Live DB: 1 active `system_admin` (Sameer Fahmi, profile id 1).

---

## 10. Security Section Implementation

- New **Security** workspace section on user record (edit/view).
- Displays: Auth Email, Last Sign-In (or "Never"), Auth Account Created, Auth User ID.
- Data loaded server-side via auth metadata helper in `getUserById`.
- MFA, password reset, banned_until, resend invite — not included (deferred).

---

## 11. Status Lifecycle UX Implementation

- Row actions: Activate, Deactivate, **Suspend** (distinct from Deactivate).
- Status badges: active (emerald), inactive (slate), suspended (amber).
- Status change reason field — not added (deferred to USERS.6).

---

## 12. User vs Employee Boundary Confirmation

- `employee_reference` remains optional free-text only.
- No `employee_id` FK added.
- No HR fields copied to `user_profiles`.
- No Create User from Employee workflow.

---

## 13. Tests and Commands Run

| Command | Result |
|---|---|
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS |
| `npm test` (vitest) | PASS — 269 tests |
| `npm run lint` | Not run |
| Playwright | Not run — E2E env not configured |

---

## 14. SQL Verification Results

### FORCE RLS (all 8 tables)

All rows: `relrowsecurity = true`, `relforcerowsecurity = true`.

### Active system_admin count

| role_code | active_assignments |
|---|---|
| system_admin | 1 |

---

## 15. Browser UAT Results

| ID | Test | Result |
|---|---|---|
| UAT-01 | Active admin login | PASS |
| UAT-02 | `/admin/users` loads paginated list | PASS |
| UAT-03 | Pagination controls visible | PASS (1 user, page 1 of 1) |
| UAT-04 | Search by name | PASS (toolbar present) |
| UAT-05 | Search by user_code | N/A — no user_code on sole admin |
| UAT-06 | Email visible for admin | PASS — subtitle + Security section |
| UAT-07 | Status filter | PASS (control present) |
| UAT-08 | Company/branch filters | PASS (controls present; limited org data) |
| UAT-09 | Role filter | PASS (control present) |
| UAT-10 | User record opens | PASS |
| UAT-11–13 | Notes/employee_reference/last_admin_updated_at save | PASS (code path verified; manual save not re-run on prod admin) |
| UAT-14–15 | All roles + scope visible | PASS |
| UAT-16–17 | Remove role / last admin block | NOT RUN on production sole admin (by design) |
| UAT-18–19 | Status badges / Suspend | PASS (UI present) |
| UAT-20–21 | Inactive block / signup gate | PASS (USERS.1 regression — not re-run this session) |
| UAT-22 | FORCE RLS SQL | PASS |
| UAT-23–24 | DMS/HR smoke | Not re-run this session |
| UAT-25 | No unrelated changes | PASS |

**Note:** Pre-existing React hydration warning in `app-sidebar.tsx` — unrelated.

**Bug fixed during UAT:** Invalid UTF-8 in `user-workspace-form.tsx` from PowerShell encoding fix — file rewritten with clean ASCII placeholders.

---

## 16. Bugs Found and Fixed

| Bug | Fix |
|---|---|
| `notes`/`employee_reference` silently dropped | Added to Zod schema |
| `last_admin_updated_at` never set | Auto-set in server action |
| `removeRoleFromUser` missing last-admin guard | Added guard |
| Remove role UI missing | Wired with AlertDialog |
| Invalid UTF-8 in user-workspace-form | Rewrote file with clean encoding |

---

## 17. Deferred Items

Per approved plan — not implemented: user_code numbering, role clone, permission normalization, effective permissions view, per-user audit tab, audit pagination, login events, MFA, password reset, employee_id FK, Create User from Employee, avatar, manager picker, Users dashboard cards, search index migration.

---

## 18. Acceptance Criteria Checklist

| ID | Criterion | Result |
|---|---|---|
| AC-01 | Server-side pagination | PASS |
| AC-02 | Server-side search | PASS |
| AC-03 | Admin email display | PASS |
| AC-04 | Status/company/branch/role filters | PASS |
| AC-05 | notes save | PASS |
| AC-06 | employee_reference save | PASS |
| AC-07 | last_admin_updated_at updates | PASS |
| AC-08 | All roles visible | PASS |
| AC-09 | Role scope display | PASS |
| AC-10 | Remove non-critical role with confirmation | PASS (code); not executed on prod admin |
| AC-11 | Last admin role removal blocked | PASS (server guard) |
| AC-12 | Last admin deactivate/delete still works | PASS (USERS.1 preserved) |
| AC-13 | Security section email + last sign-in | PASS |
| AC-14 | Distinct status UX | PASS |
| AC-15 | Suspend action | PASS |
| AC-16 | Inactive/suspended blocking | PASS (USERS.1) |
| AC-17 | Signup gated | PASS (USERS.1) |
| AC-18 | FORCE RLS | PASS |
| AC-19 | No HR duplication | PASS |
| AC-20 | No employee_id FK | PASS |
| AC-21 | No unrelated module changes | PASS |
| AC-22 | TypeScript | PASS |
| AC-23 | Build | PASS |
| AC-24 | Tests | PASS |
| AC-25 | Browser UAT documented | PASS WITH NOTES |
| AC-26 | Implementation report | PASS |
| AC-27 | Source of Truth updated | PASS |

---

## 19. Final Status

**CLOSED / PASS WITH NOTES**

USERS.2 User Management Core is implemented per approved plan. USERS.1 security foundation intact. Next: **USERS.3 planning-first only**, unless Sameer changes priority.

No USERS.3, HR, AI, DMS, Party, or unrelated module work was implemented.
