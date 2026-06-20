# ERP BASE 002F.5A.0 — V3 Fixes Applied During Supabase Integrity Review

**Generated:** 2026-06-13  
**Source:** Live schema comparison `https://mmiefuieduzdiiwnqpie.supabase.co`  
**Status:** All fixes applied to `_SUPABASE_VERIFIED` versions of V3 files

---

## Summary

| # | Severity | Issue | Files Fixed |
|---|---|---|---|
| 1 | 🔴 CRITICAL | `permissions` INSERT missing `action_code NOT NULL` | SQL |
| 2 | 🔴 CRITICAL | `viewer` role code → should be `read_only_user` | SQL |
| 3 | 🟡 IMPORTANT | `party_finance_profiles.payment_hold` → renamed to `finance_hold` (per prompt §5.1) | SQL, DB Map, UI/UX Map, Tech Plan, Review Notes |
| 4 | 🟡 IMPORTANT | `party_notes` RLS — use `current_user_profile_id()` function | SQL |
| 5 | 🟡 IMPORTANT | `audit_logs` column names in UI — `entity_name`, `entity_id`, `actor_user_profile_id` | UI/UX Map, Review Notes |
| 6 | 🟢 INFO | `logAudit()` function doesn't exist — plan uses direct INSERT into `audit_logs` | Tech Plan, Review Notes |

---

## Fix 1 — `permissions` INSERT: `action_code` column (CRITICAL)

**Problem:** Live `permissions` table has `action_code TEXT NOT NULL` column. V3 SQL INSERT statement omits this column, which would cause a NOT NULL constraint violation and fail entirely.

**Root cause:** `action_code` is derived from the last segment of `permission_code`.

**Fix applied:** Added `action_code` to every row in the `permissions` INSERT block. Examples:
- `master_data.parties.view` → `action_code = 'view'`
- `master_data.parties.manage_bank_details` → `action_code = 'manage_bank_details'`
- `master_data.parties.override_duplicate` → `action_code = 'override_duplicate'`

Also added `action_code` to the ON CONFLICT UPDATE SET clause.

**Files affected:** `..._SUPABASE_VERIFIED.sql` (Section 13)

---

## Fix 2 — `viewer` role → `read_only_user` (CRITICAL)

**Problem:** V3 SQL Section 14 contains:
```sql
WHERE r.role_code = 'viewer'
```
But the live `roles` table has `role_code = 'read_only_user'` (Role: "Read Only User"). There is no `viewer` role in the live database. The INSERT would return 0 rows silently.

**Fix applied:** Changed `'viewer'` to `'read_only_user'` in the role_permissions INSERT for the read-only role.

**Files affected:** `..._SUPABASE_VERIFIED.sql` (Section 14), Review Notes.

---

## Fix 3 — `party_finance_profiles` payment hold rename (IMPORTANT — Prompt §5.1)

**Problem:** Prompt §5.1 explicitly requires renaming the finance profile hold fields to avoid confusion with compliance profile holds:

Old (V3 original):
```sql
payment_hold BOOLEAN NOT NULL DEFAULT false,
payment_hold_reason TEXT,
payment_hold_by BIGINT ...,
payment_hold_at TIMESTAMPTZ,
```

**Fix applied:** Renamed to:
```sql
finance_hold BOOLEAN NOT NULL DEFAULT false,
finance_hold_reason TEXT,
finance_hold_by BIGINT ...,
finance_hold_at TIMESTAMPTZ,
```

`party_compliance_profiles.payment_hold` / `work_hold` fields remain unchanged — these are the operational compliance holds.

**Files affected:** `..._SUPABASE_VERIFIED.sql` (Section 7.4), DB Field Map (§E3), UI/UX Map (Tab 4 Finance section), Tech Plan (§3.1 table tree), Review Notes (§2.2 resolved).

---

## Fix 4 — `party_notes` RLS: Use `current_user_profile_id()` (IMPORTANT)

**Problem:** V3 party_notes SELECT policy uses a subquery:
```sql
created_by = (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid() LIMIT 1)
```
This is valid but less efficient and more fragile than using the live helper function.

**Fix applied:** Changed to:
```sql
created_by = current_user_profile_id()
```
`current_user_profile_id()` is a confirmed live function with signature `() → bigint`. This is cleaner and consistent with how other ERP modules identify the current user.

**Files affected:** `..._SUPABASE_VERIFIED.sql` (Section 10.15)

---

## Fix 5 — `audit_logs` column names in UI/UX spec (IMPORTANT)

**Problem:** V3 UI/UX spec Tab 13 references these column names:
- `user` (should be `actor_user_profile_id` joined to `user_profiles.full_name`)
- `table` (should be `entity_name`)
- `record_id` (should be `entity_id`)
- `remarks` (column does not exist in live `audit_logs`)

**Fix applied:** Updated Tab 13 source column references to match live schema.

| V3 Original | Corrected | Notes |
|---|---|---|
| `user` | `actor_user_profile_id → user_profiles.full_name` | Join required |
| `table` | `entity_name` | Actual column |
| `record_id` | `entity_id` | Actual column |
| `before/after summary` | `old_values / new_values` | Correct ✅ |
| `remarks` | *removed* | Column does not exist |

**Files affected:** UI/UX Map (Tab 13)

---

## Fix 6 — `logAudit()` function does not exist (INFO)

**Problem:** V3 Technical Plan references `logAudit()` as a mutation requirement. No such function exists in the live database.

**Actual audit pattern:** The ERP uses direct `INSERT INTO audit_logs (actor_user_profile_id, owner_company_id, branch_id, module_code, entity_name, entity_id, entity_reference, action, old_values, new_values, ip_address, user_agent)` from server actions.

**Fix applied:** Updated Tech Plan to remove `logAudit` reference and replace with direct `INSERT INTO audit_logs` pattern with the correct columns.

**Files affected:** Tech Plan (§9 server action requirements), Review Notes.

---

## No-Fix Items (Informational)

| Item | Decision |
|---|---|
| `global_numbering_rules` extra columns | V3 INSERT is safe — extra columns have DB defaults |
| `sales_manager` role missing | Already commented out in V3 SQL — no change needed |
| Legacy `master_data.party_master.*` permissions | These remain; new `master_data.parties.*` are a separate, more granular set |
| `payment_methods` table doesn't exist yet | V3 SQL creates it — ✅ correct |
| All 53 party table names are new | No conflicts — ✅ clean slate |

---

*End of V3 Fixes Applied Log — REVIEW ONLY*
