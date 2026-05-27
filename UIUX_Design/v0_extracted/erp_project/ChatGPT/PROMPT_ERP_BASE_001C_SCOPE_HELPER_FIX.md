# PROMPT_ERP_BASE_001C — Fix Company-Scope vs Branch-Scope Permission Leak Before Supabase Push

Act as a senior Supabase/PostgreSQL RLS auditor, ERP security reviewer, Next.js runtime tester, and SaaS multi-tenant security engineer.

## Purpose

This is a final correction prompt for ERP Base 001 before approving the migration push to Supabase Cloud.

Do not start Phase 002.

Do not run:

```bash
supabase db push
```

until this 001C issue is fixed, validated, and reported.

## Current Status

ERP_BASE_001B fixed the role-assignment privilege escalation issue.

However, the actual SQL still has a company/branch scope leak in the helper functions.

## Critical Issue — Branch-Scoped Permission Can Become Company-Wide

The current helper:

```sql
public.current_user_has_permission_in_company(permission_code text, target_owner_company_id bigint)
```

checks:

```sql
ur.owner_company_id = target_owner_company_id
```

but it does not require:

```sql
ur.branch_id is null
```

This means a user with a branch-scoped role assignment, for example:

```text
branch_admin
owner_company_id = Company A
branch_id = Branch X
permission = users.view
```

can pass company-level checks for all of Company A.

That can accidentally allow branch-scoped users to view all company users/branches instead of only their branch.

The same issue applies to:

```sql
public.current_user_has_role_in_company(role_code text, target_owner_company_id bigint)
```

## Required Fix 1 — Company-Scoped Helpers Must Require Company Scope Only

Update:

```sql
public.current_user_has_permission_in_company(permission_code text, target_owner_company_id bigint)
public.current_user_has_role_in_company(role_code text, target_owner_company_id bigint)
```

so they only return true for:

- true global admin, OR
- active assignment with:
  - `ur.owner_company_id = target_owner_company_id`
  - `ur.branch_id is null`

Required condition:

```sql
and ur.owner_company_id = target_owner_company_id
and ur.branch_id is null
```

Do not allow branch-scoped assignments to satisfy company-scoped checks.

## Required Fix 2 — Branch-Scoped Helper Must Remain Correct

Keep this intended behavior in:

```sql
public.current_user_has_permission_in_branch(permission_code text, target_branch_id bigint)
```

It may return true for:

1. true global admin
2. branch assignment:
   - `ur.branch_id = target_branch_id`
3. company-wide assignment:
   - `ur.owner_company_id = branch.owner_company_id`
   - `ur.branch_id is null`

This is correct because company-wide permission should include branches, but branch permission should not become company-wide.

## Required Fix 3 — Confirm Branch Admin Visibility

After the helper fix, confirm in the report:

- `branch_admin` with `users.view` can see only users in its branch.
- `branch_admin` with `branches.view` can see only its branch unless it also has a company-scoped role.
- `company_admin` with company-scoped `users.view` can see users in its company.
- `company_admin` with company-scoped `branches.view` can see branches in its company.
- Global null-scope `system_admin`/`group_admin` can see all records.

## Required Fix 4 — Add User Profile Scope Consistency Validation

Add validation for `user_profiles` so that when `branch_id` is not null:

- `owner_company_id` must also be not null
- branch must belong to the specified owner company

Preferred implementation:

Create a trigger function:

```sql
public.validate_user_profile_scope()
```

and trigger:

```sql
trg_user_profiles_validate_scope
```

The function should be:

- `security definer`
- `set search_path = public`

This avoids RLS blocking the branch lookup during validation.

Validation rules:

```text
global/unassigned user: owner_company_id null, branch_id null
company user: owner_company_id not null, branch_id null
branch user: owner_company_id not null, branch_id not null, branch belongs to company
```

Do not allow:

```text
owner_company_id null + branch_id not null
owner_company_id Company A + branch_id belonging to Company B
```

## Required Fix 5 — Make Existing Scope Validation Trigger Functions SECURITY DEFINER

The current `validate_user_role_scope()` trigger function should also be hardened:

- `security definer`
- `set search_path = public`

Reason: the trigger queries `public.branches`; it should validate consistently without being blocked by RLS.

## Required Fix 6 — Optional but Recommended Audit Scope Validation

If simple to implement, add similar validation for `audit_logs`:

- if `branch_id` is not null, `owner_company_id` must be not null
- branch must belong to owner company

If not implemented, document it as a Phase 002 hardening item.

## Required Reports

Create or update:

1. `ERP_BASE_001C_SCOPE_HELPER_FIX_REPORT.md`
2. `ERP_BASE_001_SECURITY_RLS_REPORT.md`
3. `ERP_BASE_001_DATABASE_REPORT.md`
4. `ERP_BASE_001_IMPLEMENTATION_REPORT.md`
5. `ERP_BASE_001_NEXT_STEPS.md`

The 001C report must explicitly confirm:

- `current_user_has_permission_in_company()` now requires `ur.branch_id is null`.
- `current_user_has_role_in_company()` now requires `ur.branch_id is null`.
- Branch-scoped permissions no longer pass company-level checks.
- Branch admins cannot see all company users/branches through company helper leakage.
- Company-scoped permissions still work.
- Branch-scoped permissions still work through branch helper.
- `user_profiles` branch/company consistency is enforced.
- `validate_user_role_scope()` is `security definer` with fixed search path.
- BIGINT/no-UUID rule still passes.
- TypeScript/lint/build still pass.
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
current_user_has_permission_in_company
current_user_has_role_in_company
ur.branch_id is null
validate_user_profile_scope
validate_user_role_scope
security definer
set search_path = public
```

## Acceptance Criteria

This correction is complete only when:

- Branch-scoped assignments cannot satisfy company-scoped permission checks.
- Branch admins are limited to branch-level records.
- Company admins are limited to company-level records.
- Global admins remain global only with null-scope system/group admin assignment.
- User profile branch-company consistency is enforced.
- Existing user role scope validation is hardened.
- Reports are updated.
- Lint/typecheck/build pass.
- Migration is not pushed until approved.

## Final Instruction

Make the minimum required SQL and code/report changes.

Do not start Phase 002.

Do not push to Supabase Cloud.

Stop after reports and ask for approval.
