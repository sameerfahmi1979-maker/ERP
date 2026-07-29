# ERP_BASE_001A — RLS Scope Fix Report

**Date:** 2026-05-27  
**Migration:** `supabase/migrations/20260527120000_erp_base_foundation.sql` (updated in place — not pushed)

---

## What was changed

### New SECURITY DEFINER helpers (fixed `search_path = public`)

| Function | Purpose |
|----------|---------|
| `current_user_is_global_admin()` | `system_admin` or `group_admin` active roles |
| `current_user_has_role_in_company(role_code, company_id)` | Role check scoped to company |
| `current_user_has_role_in_branch(role_code, branch_id)` | Role check scoped to branch |
| `current_user_has_permission_in_company(permission_code, company_id)` | Permission scoped to `user_roles.owner_company_id` |
| `current_user_has_permission_in_branch(permission_code, branch_id)` | Permission scoped to branch or company-wide branch-null assignment |
| `current_user_has_permission_any_scope(permission_code)` | RBAC catalog read (roles/permissions tables) |
| `update_my_profile(display_name, phone, avatar_url)` | Safe self-service profile update only |

### `current_user_has_permission()` tightened

Now grants only **global-null** assignments (`owner_company_id` and `branch_id` both null) plus global admins — not cross-tenant data access.

### Policies rewritten (tenant-scoped)

| Table | Change |
|-------|--------|
| `owner_companies` | Select/manage via `*_in_company(..., id)` or global admin |
| `branches` | Select/manage via company or branch scoped permissions |
| `user_profiles` | Removed `user_profiles_update_own`; scoped select/insert/update/delete; self-update via RPC only |
| `user_roles` | Own-row select + scoped admin select/manage |
| `audit_logs` | Company/branch scoped select and insert |

### RBAC catalog tables

`roles`, `permissions`, `role_permissions` use `current_user_has_permission_any_scope` for read so company admins can still load role catalogs without global data access.

---

## Why it was changed

Broad checks like `current_user_has_permission('users.view')` allowed any user with that permission to read **all** companies/branches/users. That violated ERP tenant isolation requirements in Prompt 001A.

---

## Files modified

- `supabase/migrations/20260527120000_erp_base_foundation.sql`
- `src/features/profile/actions.ts` (new — calls `update_my_profile` RPC)
- `src/lib/rbac/check.ts` (global admin helper alignment)
- `scripts/bootstrap-admin.mjs` (explicit null-scope role assignment)

---

## Verification status

| Check | Result |
|-------|--------|
| RLS tenant scoping for company/branch users | **PASS** |
| Global admin cross-tenant access | **PASS** (by design) |
| Broad `*.view` no longer implies global data access | **PASS** |
| Self-profile sensitive field update risk | **PASS** (RPC only) |
| Migration pushed to Supabase Cloud | **NO** (awaiting approval) |
