# ERP_BASE_001 — Security & RLS Report

**Date:** 2026-05-27  
**Updated:** 2026-05-27 (ERP_BASE_001A + 001B + 001C corrections applied — not pushed)

---

## ERP_BASE_001C company/branch scope leak fix (latest)

- **Critical fix:** Company-scoped helpers now require `ur.branch_id is null`
- Branch-scoped role/permission assignments no longer pass company-level checks
- Branch admins correctly limited to their branch only
- `user_profiles` scope consistency enforced via trigger validation (SECURITY DEFINER)
- `audit_logs` scope consistency enforced via trigger validation (SECURITY DEFINER)
- `validate_user_role_scope()` updated to SECURITY DEFINER with set search_path
- See `ERP_BASE_001C_SCOPE_HELPER_FIX_REPORT.md` for full detail

## ERP_BASE_001B role assignment hardening

- **Critical fix:** `current_user_is_global_admin()` now requires null scope (`owner_company_id IS NULL AND branch_id IS NULL`)
- Scoped `system_admin`/`group_admin` assignments no longer grant global access
- New `current_user_can_manage_user_role_assignment()` helper prevents privilege escalation
- Non-global admins cannot assign `system_admin`, `group_admin`, or create global-null assignments
- Company/branch admins limited to their authorized scope
- `user_roles` scope consistency enforced via trigger validation
- See `ERP_BASE_001B_ROLE_ASSIGNMENT_HARDENING_REPORT.md` for full detail

## ERP_BASE_001A corrections (summary)

- Tenant-scoped RLS on `owner_companies`, `branches`, `user_profiles`, `user_roles`, `audit_logs`
- Removed broad self-update policy on `user_profiles`; added `update_my_profile()` RPC
- Added scoped helpers: `current_user_is_global_admin`, `*_in_company`, `*_in_branch`, `current_user_has_permission_any_scope`
- See `ERP_BASE_001A_RLS_SCOPE_FIX_REPORT.md` for full detail

---

## Secret handling

| Rule | Status |
|------|--------|
| `.env.local.example` with placeholders only | Done |
| `.env.local` gitignored | Done |
| No keys in source or reports | Verified |
| Service role only in server script / `createAdminClient()` | Done |
| Browser uses anon key + URL only | Done |

---

## Authentication

- Supabase Auth via `@supabase/ssr` (no deprecated auth-helpers)
- Middleware session refresh and route protection (`src/middleware.ts`)
- Server-side `getUser()` checks in protected layout
- No hardcoded users, bypass login, or mock auth

---

## SECURITY DEFINER functions

All helper functions use:

```sql
security definer
set search_path = public
```

Granted `EXECUTE` to `authenticated` only (revoked from `public`).

| Function | Purpose |
|----------|---------|
| `current_user_profile_id()` | Resolve BIGINT profile from `auth.uid()` |
| `current_user_owner_company_id()` | Tenant scope |
| `current_user_branch_id()` | Branch scope |
| `current_user_is_global_admin()` | `system_admin` / `group_admin` **with null scope only** (001B) |
| `current_user_has_role_in_company(text, bigint)` | Company-scoped role **requires branch_id null** (001C) |
| `current_user_has_role_in_branch(text, bigint)` | Branch-scoped role |
| `current_user_has_permission_in_company(text, bigint)` | Company-scoped permission **requires branch_id null** (001C) |
| `current_user_has_permission_in_branch(text, bigint)` | Branch-scoped permission (allows company-wide) |
| `current_user_has_permission_any_scope(text)` | RBAC catalog read |
| `current_user_has_permission(text)` | Global-null assignment only |
| `update_my_profile(text, text, text)` | Safe self profile fields only |
| `current_user_can_manage_user_role_assignment(bigint, bigint, bigint, bigint)` | Role assignment authorization (001B) |
| `validate_user_role_scope()` | Trigger: enforces user_roles scope consistency (001B, SECURITY DEFINER 001C) |
| `validate_user_profile_scope()` | Trigger: enforces user_profiles scope consistency (001C) |
| `validate_audit_log_scope()` | Trigger: enforces audit_logs scope consistency (001C) |

`handle_new_auth_user()` on `auth.users` is documented, minimal, and only inserts `user_profiles`.

---

## RLS risks and mitigations

| Risk | Mitigation |
|------|------------|
| Open public policies | None created |
| `anon` ERP access | No permissive anon policies |
| JWT `user_metadata` for authz | RBAC uses database tables, not editable metadata |
| Recursive RLS | SECURITY DEFINER helpers |
| Service role in browser | Not imported in client bundles |
| UUID exposed in UI | Only numeric profile IDs in admin tables |
| Cross-tenant data via broad `*.view` | Scoped `*_in_company` / `*_in_branch` policies |
| User self-updates admin fields | Removed direct update policy; RPC limits fields |
| Privilege escalation via scoped global roles | `current_user_is_global_admin()` requires null scope (001B) |
| Non-global admins assigning global roles | `current_user_can_manage_user_role_assignment()` blocks escalation (001B) |
| Inconsistent scope in `user_roles` | Trigger validation enforces branch belongs to company (001B, SECURITY DEFINER 001C) |
| Branch-scoped permissions passing company checks | Company helpers require `ur.branch_id is null` (001C) |
| Branch admin accessing all company data | Branch assignments blocked from company-level checks (001C) |
| Inconsistent scope in `user_profiles` | Trigger validation enforces branch belongs to company (001C) |
| Inconsistent scope in `audit_logs` | Trigger validation enforces branch belongs to company (001C) |

---

## Application-layer authorization

- `src/lib/rbac/check.ts`: `hasPermission`, `hasRole`, `requirePermission`, `requireAdmin`
- Admin pages check permissions server-side before rendering data

---

## Pending security steps (post-migration)

1. Disable open signup in Supabase Auth for production (invite-only).
2. Review policies with `supabase db advisors` or MCP advisors after push.
3. Assign first admin via `scripts/bootstrap-admin.mjs`.
4. Rotate keys if ever exposed.

---

## Approval gate

Migration SQL must be reviewed and approved before:

```bash
supabase db push
```
