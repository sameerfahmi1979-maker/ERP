# PROMPT_ERP_BASE_001B — Final Role Assignment Hardening Before Supabase Push

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, and notification-engine validation specialist.

## Purpose

This is a final security-hardening prompt before approving ERP Base 001 migration push to Supabase Cloud.

Do not start Phase 002.

Do not run:

```bash
supabase db push
```

until this final issue is fixed, validated, and reported.

## Current Status

ERP_BASE_001A fixed most issues:

- BIGINT/no-UUID requirement passes.
- Tenant-scoped RLS was improved.
- Self-profile update now uses `update_my_profile()` RPC.
- `user_roles` duplicate scope constraint uses `UNIQUE NULLS NOT DISTINCT`.
- TypeScript, lint, and production build now pass from clean path.
- Migration is still not pushed.

However, one remaining privilege-escalation risk must be fixed before cloud push.

## Critical Remaining Risk — Scoped Role Assignment Can Become Global Admin

The current SQL includes a helper similar to:

```sql
current_user_is_global_admin()
```

and it checks whether the current user has a role code of:

```text
system_admin
group_admin
```

But it must only treat those roles as global admin if the role assignment itself is truly global:

```sql
user_roles.owner_company_id is null
and user_roles.branch_id is null
```

Otherwise, a scoped assignment of `system_admin` or `group_admin` could incorrectly become global access.

Also, `user_roles` insert/update policies must not allow a company/branch admin to assign:

- `system_admin`
- `group_admin`
- any global-null role assignment
- any role assignment outside the assigner's permitted company/branch scope

## Required Fix 1 — Tighten Global Admin Helper

Update `public.current_user_is_global_admin()` so it returns true only when:

- user has active `system_admin` or `group_admin`
- role is active
- user_role is active
- `user_roles.owner_company_id is null`
- `user_roles.branch_id is null`

Required logic:

```sql
and r.role_code in ('system_admin', 'group_admin')
and ur.owner_company_id is null
and ur.branch_id is null
```

## Required Fix 2 — Tighten `current_user_has_role(text)`

If `current_user_has_role(text)` is kept as a generic helper, it must not be used for global authorization unless documented.

Either:

Option A:
- Rename/replace it with scoped helpers only.

Or Option B:
- Keep it, but ensure no critical global admin decision relies on it.
- Document clearly that it checks role existence at any scope and is not a global authorization function.

## Required Fix 3 — Harden `user_roles` RLS Insert/Update/Delete

The current `user_roles_manage_scoped` policy must be revised so scoped admins cannot escalate privileges.

Create a dedicated helper such as:

```sql
public.current_user_can_manage_user_role_assignment(
  target_user_profile_id bigint,
  target_role_id bigint,
  target_owner_company_id bigint,
  target_branch_id bigint
)
```

This helper must enforce:

### Global admin behavior

A true global admin may assign/manage any role/scope.

True global admin means:

- `system_admin` or `group_admin`
- active user role
- `owner_company_id is null`
- `branch_id is null`

### Non-global admin behavior

A non-global scoped admin may not assign or manage:

- `system_admin`
- `group_admin`
- any global-null assignment where both `target_owner_company_id is null` and `target_branch_id is null`
- any assignment outside their company/branch scope

A company-scoped admin may only assign allowed non-global roles inside their own `owner_company_id`.

A branch-scoped admin may only assign allowed non-global roles inside their own `branch_id`.

### Target user scope validation

The target user profile must also be within the assigner's allowed scope.

For example:

- Company admin for company A can manage role assignments only for users in company A.
- Branch admin for branch X can manage role assignments only for users in branch X.
- Company admin for company A cannot assign a role scoped to company B.
- Branch admin for branch X cannot assign a role scoped to branch Y.
- Scoped admin cannot create null-scope/global role assignments.

## Required Fix 4 — Enforce `user_roles` Scope Consistency

Add check constraints or trigger/function validation if practical:

- If `branch_id` is not null, it must belong to `owner_company_id` when `owner_company_id` is not null.
- If `owner_company_id` is null and `branch_id` is not null, either allow only if branch implies company through policy, or require owner_company_id to be populated for branch-scoped assignments.

Preferred clean rule:

For `user_roles`:

- global assignment: `owner_company_id is null` and `branch_id is null`
- company assignment: `owner_company_id is not null` and `branch_id is null`
- branch assignment: `owner_company_id is not null` and `branch_id is not null`, with branch belonging to owner_company_id

If this needs a validation trigger because cross-table CHECK constraints are not allowed, create a safe trigger function.

## Required Fix 5 — Update Reports

Update/create:

1. `ERP_BASE_001B_ROLE_ASSIGNMENT_HARDENING_REPORT.md`
2. Updated `ERP_BASE_001_SECURITY_RLS_REPORT.md`
3. Updated `ERP_BASE_001_DATABASE_REPORT.md`
4. Updated `ERP_BASE_001_NEXT_STEPS.md`
5. Updated `ERP_BASE_001_IMPLEMENTATION_REPORT.md` so it no longer shows stale build/lint failure as the current result

Reports must clearly confirm:

- `current_user_is_global_admin()` requires null global scope.
- Scoped admins cannot assign `system_admin` or `group_admin`.
- Scoped admins cannot create global-null assignments.
- Scoped admins cannot assign roles outside their company/branch.
- `user_roles` scope consistency is enforced.
- BIGINT/no-UUID rule still passes.
- Build/lint/typecheck still pass.
- Migration is still not pushed.

## Validation Required

Run:

```bash
npm run lint
npm run typecheck
npm run build
```

Also re-scan SQL for:

```text
current_user_is_global_admin
user_roles_manage_scoped
current_user_can_manage_user_role_assignment
system_admin
group_admin
owner_company_id is null
branch_id is null
```

## Acceptance Criteria

This final hardening is complete only when:

- True global admin requires global-null `user_roles` scope.
- No scoped assignment of `system_admin` or `group_admin` can become global admin.
- Non-global users cannot assign global roles or global-null role scope.
- Company admins are limited to their company.
- Branch admins are limited to their branch.
- `user_roles` scope consistency is enforced.
- Updated reports are generated.
- Build/lint/typecheck pass.
- Migration is not pushed until approved.

## Final Instruction

Make the minimum required security changes.

Do not start Phase 002.

Do not push to Supabase Cloud.

Stop after reports and ask for approval.
