# ERP_BASE_001A — Database Fix Report

**Date:** 2026-05-27

---

## Fix 3 — `user_roles` duplicate scope constraint

### Problem

```sql
unique (user_profile_id, role_id, owner_company_id, branch_id)
```

PostgreSQL treats `NULL` values as distinct, allowing duplicate global-scope rows.

### Solution applied

```sql
constraint user_roles_scope_unique unique nulls not distinct (
  user_profile_id,
  role_id,
  owner_company_id,
  branch_id
)
```

**Method:** `UNIQUE NULLS NOT DISTINCT` (PostgreSQL 15+, supported on Supabase).

**Fallback not required** — Supabase hosted Postgres supports this syntax.

---

## Fix 2 — Self profile updates

### Removed

- Policy `user_profiles_update_own` (allowed updating all columns on own row)

### Added

```sql
public.update_my_profile(p_display_name, p_phone, p_avatar_url)
```

- `SECURITY DEFINER`, `set search_path = public`
- Updates only: `display_name`, `phone`, `avatar_url`, `updated_at`
- `GRANT EXECUTE` to `authenticated` only

### Application

- `src/features/profile/actions.ts` → `supabase.rpc('update_my_profile', ...)`

---

## Fix 4 — BIGINT / UUID verification (re-scan)

| Check | Result |
|-------|--------|
| ERP tables use BIGINT identity PK | **PASS** |
| No UUID primary keys on ERP tables | **PASS** |
| Only `user_profiles.auth_user_id uuid` | **PASS** |
| No `gen_random_uuid()` for business PKs | **PASS** (grep: no matches) |

---

## Fix 6 — Remote Supabase conflict check

**Project:** `mmiefuieduzdiiwnqpie`

| Object type | Remote status |
|-------------|---------------|
| Tables: `owner_companies`, `branches`, `user_profiles`, `roles`, `permissions`, `role_permissions`, `user_roles`, `audit_logs` | **None** (public schema empty) |
| Helper functions listed in migration | **None** |
| Conflicting triggers/policies | **None detected** |

**Action:** Safe to apply migration when approved — no overwrite conflict.

---

## Migration status

- File updated: `supabase/migrations/20260527120000_erp_base_foundation.sql`
- **NOT pushed** (`supabase db push` not run)

---

## Files modified

- `supabase/migrations/20260527120000_erp_base_foundation.sql`
- `scripts/bootstrap-admin.mjs`
- `src/features/profile/actions.ts`
