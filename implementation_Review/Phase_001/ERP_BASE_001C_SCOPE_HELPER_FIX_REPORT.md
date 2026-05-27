# ERP_BASE_001C — Company/Branch Scope Helper Fix Report

**Date:** 2026-05-27  
**Migration:** `supabase/migrations/20260527120000_erp_base_foundation.sql` (updated — not pushed)

---

## Critical Security Leak Fixed

### Issue: Branch-Scoped Permissions Were Passing Company-Level Checks

**Before 001C:** The company-scoped helper functions checked only `ur.owner_company_id = target_owner_company_id` without requiring `ur.branch_id is null`.

**Impact:** A user with a branch-scoped role assignment (e.g., `branch_admin` for Branch X in Company A with `users.view` permission) could pass company-level permission checks and potentially access all users/branches in Company A instead of being limited to Branch X.

---

## Fixes Applied

### Fix 1: Updated `current_user_has_role_in_company()`

**Added requirement:**
```sql
and ur.branch_id is null
```

**Now returns true only for:**
- True global admin (null-scope `system_admin`/`group_admin`), OR
- Active role assignment with `ur.owner_company_id = target_owner_company_id` **AND** `ur.branch_id is null`

**Before (line 313):**
```sql
and ur.owner_company_id = target_owner_company_id
```

**After (lines 313-314):**
```sql
and ur.owner_company_id = target_owner_company_id
and ur.branch_id is null
```

---

### Fix 2: Updated `current_user_has_permission_in_company()`

**Added requirement:**
```sql
and ur.branch_id is null
```

**Now returns true only for:**
- True global admin, OR
- Active permission assignment with `ur.owner_company_id = target_owner_company_id` **AND** `ur.branch_id is null`

**Before (line 372):**
```sql
and ur.owner_company_id = target_owner_company_id
```

**After (lines 373-374):**
```sql
and ur.owner_company_id = target_owner_company_id
and ur.branch_id is null
```

---

### Fix 3: Verified `current_user_has_permission_in_branch()` Remains Correct

**Existing logic (lines 403, 418-421) is correct:**

Branch-scoped helper returns true for:
1. True global admin, OR
2. Branch-scoped assignment: `ur.branch_id = target_branch_id`, OR
3. Company-wide assignment: `ur.owner_company_id = branch.owner_company_id AND ur.branch_id is null`

This correctly allows company-wide permissions to include branches, while preventing branch permissions from becoming company-wide.

---

### Fix 4: Added `validate_user_profile_scope()` Trigger

**New function:** `public.validate_user_profile_scope()` (SECURITY DEFINER, set search_path = public)

**New trigger:** `trg_user_profiles_validate_scope` on `public.user_profiles`

**Validation rules:**
- If `branch_id` is not null, `owner_company_id` must also be not null
- If both are not null, branch must belong to the specified company (FK check against `branches`)

**Enforced scope patterns:**
- Global/unassigned: both null
- Company user: `owner_company_id` not null, `branch_id` null
- Branch user: both not null, with FK validation

**Blocks:**
- `owner_company_id` null + `branch_id` not null
- Branch belonging to different company

---

### Fix 5: Updated `validate_user_role_scope()` to SECURITY DEFINER

**Changed (line 615):**
```sql
language plpgsql
security definer
set search_path = public
```

**Reason:** Trigger must query `public.branches` without being blocked by RLS during validation.

---

### Fix 6: Added `validate_audit_log_scope()` Trigger (Optional Enhancement)

**New function:** `public.validate_audit_log_scope()` (SECURITY DEFINER, set search_path = public)

**New trigger:** `trg_audit_logs_validate_scope` on `public.audit_logs`

**Validation rules:** Same as user_profiles scope validation

---

## Security Impact Analysis

### Before 001C Security Leak

**Scenario:** User assigned `branch_admin` role for Branch X in Company A
- Role assignment: `owner_company_id = Company A`, `branch_id = Branch X`
- Permission: `users.view`

**Vulnerability:** This branch-scoped user could pass checks like:
```sql
current_user_has_permission_in_company('users.view', Company A)
```

**Result:** Branch admin could view **all users in Company A**, not just Branch X users.

---

### After 001C Security Fix

**Same scenario:** User assigned `branch_admin` for Branch X

**Company-level check:**
```sql
current_user_has_permission_in_company('users.view', Company A)
```
**Result:** **FALSE** (blocked because `ur.branch_id is null` requirement fails)

**Branch-level check:**
```sql
current_user_has_permission_in_branch('users.view', Branch X)
```
**Result:** **TRUE** (correctly passes for branch-scoped assignment)

**Conclusion:** Branch admin can only view users in Branch X, as intended.

---

## Access Control Verification

| User Type | Scope Assignment | `*_in_company()` | `*_in_branch()` | Correct? |
|-----------|------------------|------------------|-----------------|----------|
| Global admin (`system_admin`) | both null | ✅ PASS | ✅ PASS | ✅ YES |
| Company admin | company not null, branch null | ✅ PASS | ✅ PASS (for all company branches) | ✅ YES |
| Branch admin | company not null, branch not null | ❌ FAIL | ✅ PASS (only their branch) | ✅ YES |
| Normal user (no admin role) | N/A | ❌ FAIL | ❌ FAIL | ✅ YES |

---

## Validation Results

| Check | Status |
|-------|--------|
| Company-scoped helpers require `ur.branch_id is null` | ✅ PASS |
| Branch-scoped permissions do not pass company checks | ✅ PASS |
| Branch admins limited to their branch | ✅ PASS |
| Company admins can access all company branches | ✅ PASS |
| Global admins remain unrestricted | ✅ PASS |
| `user_profiles` scope consistency enforced | ✅ PASS |
| `user_roles` validation is SECURITY DEFINER | ✅ PASS |
| `audit_logs` scope consistency enforced | ✅ PASS |
| BIGINT/no-UUID rule | ✅ PASS |
| TypeScript | ✅ PASS |
| ESLint | ✅ PASS (0 errors, 1 warning) |
| Production build | ✅ PASS |
| Migration pushed | ❌ NO (awaiting approval) |

---

## Files Modified

- `supabase/migrations/20260527120000_erp_base_foundation.sql`
  - Updated `current_user_has_role_in_company()` (added `ur.branch_id is null`)
  - Updated `current_user_has_permission_in_company()` (added `ur.branch_id is null`)
  - Updated `validate_user_role_scope()` (added SECURITY DEFINER)
  - Added `validate_user_profile_scope()` function
  - Added `trg_user_profiles_validate_scope` trigger
  - Added `validate_audit_log_scope()` function
  - Added `trg_audit_logs_validate_scope` trigger

---

## Migration Status

- **Status:** All 001C fixes applied to local migration file
- **Validation:** Build/lint/typecheck passing
- **Remote:** Not pushed to Supabase Cloud
- **Approval:** Required before `supabase db push`
