# ERP_BASE_001 — Security & RLS Report

**Date:** 2026-05-27

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
| `current_user_has_role(text)` | Role check without recursive RLS |
| `current_user_has_permission(text)` | Permission check; `system_admin` override |

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
