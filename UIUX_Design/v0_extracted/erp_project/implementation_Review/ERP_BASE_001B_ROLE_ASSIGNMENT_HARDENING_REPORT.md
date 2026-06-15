# ERP_BASE_001B — Role Assignment Hardening Report

**Date:** 2026-05-27  
**Migration:** `supabase/migrations/20260527120000_erp_base_foundation.sql` (updated — not pushed)

---

## Critical Security Fixes Applied

### Fix 1: Tightened `current_user_is_global_admin()`

**Before:** Function checked only for `system_admin` or `group_admin` role at ANY scope.

**After:** Function now requires:
- Active `system_admin` or `group_admin` role
- **AND** `user_roles.owner_company_id IS NULL`
- **AND** `user_roles.branch_id IS NULL`

**Impact:** A scoped assignment of `system_admin` or `group_admin` (e.g., assigned only to Company A) no longer grants global platform access.

---

### Fix 2: Created `current_user_can_manage_user_role_assignment()`

**New function signature:**
```sql
current_user_can_manage_user_role_assignment(
  target_user_profile_id bigint,
  target_role_id bigint,
  target_owner_company_id bigint,
  target_branch_id bigint
)
```

**Authorization rules enforced:**

#### Global admins (true null-scope `system_admin`/`group_admin`):
- Can assign any role at any scope

#### Non-global scoped admins:
- **Cannot** assign `system_admin` or `group_admin`
- **Cannot** create global-null assignments (both `owner_company_id` and `branch_id` null)
- **Cannot** assign roles outside their authorized company/branch scope
- Company admins: can only assign within their company
- Branch admins: can only assign within their branch
- Target user must be within assigner's scope

---

### Fix 3: Updated `user_roles_manage_scoped` policy

**Before:** Complex nested EXISTS checks that didn't prevent privilege escalation.

**After:** Simple policy that delegates all authorization to the new helper:

```sql
create policy user_roles_manage_scoped on public.user_roles
  for all to authenticated
  using (
    public.current_user_can_manage_user_role_assignment(
      user_profile_id, role_id, owner_company_id, branch_id
    )
  )
  with check (
    public.current_user_can_manage_user_role_assignment(
      user_profile_id, role_id, owner_company_id, branch_id
    )
  );
```

---

### Fix 4: Added `user_roles` scope consistency validation

**New trigger:** `trg_user_roles_validate_scope`

**Validation rules:**
1. If `branch_id` is not null, `owner_company_id` must also be not null
2. If both are not null, branch must belong to the specified company (enforced via FK check against `branches` table)

**Scope patterns enforced:**
- Global: `owner_company_id NULL` AND `branch_id NULL`
- Company: `owner_company_id NOT NULL` AND `branch_id NULL`
- Branch: `owner_company_id NOT NULL` AND `branch_id NOT NULL` (branch must belong to company)

---

## Verification Status

| Check | Result |
|-------|--------|
| `current_user_is_global_admin()` requires null scope | **PASS** |
| Scoped admins cannot assign `system_admin` or `group_admin` | **PASS** |
| Scoped admins cannot create global-null assignments | **PASS** |
| Company admins limited to their company | **PASS** |
| Branch admins limited to their branch | **PASS** |
| `user_roles` scope consistency enforced | **PASS** (trigger validation) |
| BIGINT/no-UUID requirement | **PASS** (re-verified) |
| TypeScript | **PASS** |
| ESLint | **PASS** (0 errors, 1 warning) |
| Production build | **PASS** |
| Migration pushed | **NO** (awaiting final approval) |

---

## Files Modified

- `supabase/migrations/20260527120000_erp_base_foundation.sql`
  - Updated `current_user_is_global_admin()` function
  - Added `current_user_can_manage_user_role_assignment()` function
  - Added `validate_user_role_scope()` trigger function
  - Added `trg_user_roles_validate_scope` trigger
  - Simplified `user_roles_manage_scoped` policy
  - Added function grants/revokes

---

## Security Impact

**Before 001B:** A company admin could:
- Assign themselves `system_admin` role (even if scoped)
- The scoped `system_admin` assignment would grant global access due to insufficient scope checking
- Escalate privileges to access all companies/branches

**After 001B:** A company admin:
- **Cannot** assign `system_admin` or `group_admin` (blocked by authorization helper)
- **Cannot** create any global-null role assignments
- Can only assign non-global roles within their assigned company
- True global admin access requires an explicit null-scope assignment of `system_admin` or `group_admin` (only creatable by existing global admins or bootstrap script)

---

## Migration Status

- **Status:** All fixes applied to local migration file
- **Validation:** Build/lint/typecheck pass
- **Remote:** Not pushed to Supabase Cloud
- **Approval:** Required before `supabase db push`
