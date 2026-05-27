# PROMPT_ERP_BASE_001A — Fix ERP Base Before Supabase Cloud Migration Push

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, and notification-engine validation specialist.

## Purpose

This is a corrective prompt for ERP Base Phase 001 before pushing the generated migration to Supabase Cloud.

Do not create Phase 002 yet.

Do not push the migration to Supabase Cloud until all issues below are fixed, verified, and reported.

## Current Situation

The ERP Base 001 implementation has produced:

- Next.js 16 + TypeScript application foundation
- Supabase SSR authentication foundation
- shadcn/ui admin shell
- RBAC helper functions
- BIGINT application table IDs
- Migration file: `supabase/migrations/20260527120000_erp_base_foundation.sql`
- ERP_BASE_001 report files

However, the migration and application are not approved for cloud push yet because there are critical RLS/tenant-scope hardening items and build/lint issues to fix.

## Critical Rule

Do not run:

```bash
supabase db push
```

until the updated SQL migration and updated reports are reviewed and approved.

## Required Fix 1 — Tenant Scope Must Be Enforced in RLS

The current RLS policies are too broad in some places because permission checks such as:

```sql
public.current_user_has_permission('organizations.view')
public.current_user_has_permission('branches.view')
public.current_user_has_permission('users.view')
public.current_user_has_permission('branches.manage')
```

may allow a user with the permission to access all companies, branches, and users instead of only their assigned company/branch.

Fix this before push.

### Required behavior

- `system_admin` and `group_admin` may access all owner companies, branches, user profiles, user roles, and audit logs as designed.
- `company_admin` may access only records under their assigned `owner_company_id`.
- `branch_admin` may access only records under their assigned `branch_id`.
- Normal users may access only their own profile and their own assigned roles.
- Module managers must not automatically see records outside their assigned company/branch.
- Any future role with `*.view` or `*.manage` must not become global unless explicitly designed as global.

### Required implementation

Create safer scoped helper functions or rewrite policies to enforce company and branch scope.

Recommended helpers:

```sql
public.current_user_is_global_admin()
public.current_user_has_role_in_company(role_code text, target_owner_company_id bigint)
public.current_user_has_role_in_branch(role_code text, target_branch_id bigint)
public.current_user_has_permission_in_company(permission_code text, target_owner_company_id bigint)
public.current_user_has_permission_in_branch(permission_code text, target_branch_id bigint)
```

These functions must:

- Be `SECURITY DEFINER`
- Use `set search_path = public`
- Avoid recursive RLS failure
- Never leak data
- Check `user_roles.is_active = true`
- Check `roles.is_active = true`
- Check `permissions.is_active = true`
- Respect `user_roles.owner_company_id` and `user_roles.branch_id`
- Treat null scope carefully and intentionally only for true global roles

Update policies for:

- `owner_companies`
- `branches`
- `user_profiles`
- `user_roles`
- `audit_logs`

so that every non-global access is correctly scoped.

## Required Fix 2 — Restrict Self Profile Updates

The current own-profile update policy may allow a normal authenticated user to update sensitive profile fields such as:

- `owner_company_id`
- `branch_id`
- `status`
- `job_title`
- `department`
- possibly other admin-controlled fields

This is not acceptable.

### Required behavior

A normal user may update only safe personal fields, such as:

- `display_name`
- `phone`
- `avatar_url`

Admin-controlled fields must be changed only by authorized admin/server-side logic:

- `owner_company_id`
- `branch_id`
- `status`
- `job_title`
- `department`
- `user_code`
- role assignments

### Required implementation options

Preferred option:

1. Remove direct broad self-update policy from `user_profiles`.
2. Create a secure RPC function for self profile update, for example:

```sql
public.update_my_profile(
  p_display_name text,
  p_phone text,
  p_avatar_url text
)
```

3. The function must update only the safe fields for `auth.uid()`.
4. Grant execute only to `authenticated`.
5. Use server/client code to call this function for self-profile updates.

Alternative option:

Use PostgreSQL column-level privileges carefully, but only if fully documented and tested.

Do not leave a policy that allows authenticated users to update all columns in their own `user_profiles` row.

## Required Fix 3 — Fix `user_roles` Duplicate Scope Constraint

The current unique constraint:

```sql
unique (user_profile_id, role_id, owner_company_id, branch_id)
```

may allow duplicate rows when nullable columns are null because PostgreSQL treats null values as distinct in normal unique constraints.

Fix this.

Recommended options:

If Supabase PostgreSQL version supports it, use:

```sql
unique nulls not distinct (user_profile_id, role_id, owner_company_id, branch_id)
```

If not, use a unique index with `coalesce()` safely.

The final database report must state which method was used.

## Required Fix 4 — Confirm No UUID Primary Keys

Re-scan the SQL and generated TypeScript types.

Confirm:

- No ERP application table uses UUID as primary key.
- All ERP application table primary keys are BIGINT identity.
- `auth_user_id uuid` is the only allowed UUID usage.
- No `gen_random_uuid()` is used for ERP business primary keys.

## Required Fix 5 — Fix Build and Lint Before Approval

The implementation report shows:

- TypeScript: PASS
- ESLint: 1 error
- Production build: FAIL

Fix these before final approval.

### ESLint issue

Fix the shadcn `use-mobile.ts` setState-in-effect lint error properly.

Do not simply disable lint globally.

### Build issue

The build failure may be caused by the Windows path containing `&` and mixed drive-letter casing.

Recommended safe action:

1. Move or clone the repo to a clean path without special characters, for example:

```text
C:\dev\algt-erp
```

2. Run:

```bash
npm install
npm run lint
npm run typecheck
npm run build
```

3. If the build still fails, diagnose and fix the real application issue.

Do not approve the migration/application as complete while `npm run build` fails.

## Required Fix 6 — Remote Supabase Conflict Check

Before pushing migration, check whether the remote Supabase database already contains any conflicting objects:

- `owner_companies`
- `branches`
- `user_profiles`
- `roles`
- `permissions`
- `role_permissions`
- `user_roles`
- `audit_logs`
- helper functions
- triggers
- policies

If conflicts exist, stop and report.

Do not drop, rename, or overwrite existing remote objects without approval.

## Required Output Files

After fixing, update or create these files:

1. `ERP_BASE_001A_RLS_SCOPE_FIX_REPORT.md`
2. `ERP_BASE_001A_DATABASE_FIX_REPORT.md`
3. `ERP_BASE_001A_BUILD_LINT_REPORT.md`
4. Updated migration file, or a new corrected migration if the previous one was not pushed
5. Updated `ERP_BASE_001_SECURITY_RLS_REPORT.md`
6. Updated `ERP_BASE_001_DATABASE_REPORT.md`

Each report must clearly state:

- What was changed
- Why it was changed
- Which files were modified
- Whether BIGINT/no-UUID rule still passes
- Whether RLS tenant scoping now passes
- Whether self-profile update risk is closed
- Whether duplicate user-role assignment risk is closed
- Whether lint passes
- Whether build passes
- Whether migration is still not pushed

## Acceptance Criteria

This correction is complete only when:

- RLS is tenant-scoped for company/branch users.
- Broad permission checks do not create cross-company access.
- Only global admin roles can access all companies/branches/users.
- Normal users cannot update sensitive profile fields.
- `user_roles` duplicate nullable-scope issue is fixed.
- BIGINT/no-UUID rule is still verified.
- TypeScript passes.
- Lint passes.
- Production build passes.
- Migration is not pushed until approval.
- Updated reports are generated.

## Final Instruction

Proceed carefully.

First inspect the current SQL and reports.

Then make the minimum required corrections.

Then run validation.

Then generate the correction reports.

Stop before `supabase db push` and ask for approval.
