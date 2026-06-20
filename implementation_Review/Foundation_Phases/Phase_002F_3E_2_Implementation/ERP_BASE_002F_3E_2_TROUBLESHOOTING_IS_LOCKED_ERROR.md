# Troubleshooting "is_locked" Error

## Status
The error "column is_locked does not exist" is puzzling because:
- ✅ `global_lookup_categories.is_locked` exists in your database
- ✅ `global_lookup_values.is_locked` exists in your database
- ✅ All new tables define `is_locked` correctly
- ✅ The SQL syntax is valid

## Recommended Action: Run Diagnostic Test First

**Step 1:** Apply `agent-tools/diagnostic_test.sql` in Supabase SQL Editor

This will test:
1. Helper functions (`current_user_has_permission`, `current_user_has_role`)
2. Existing schema columns
3. Table creation with `is_locked`
4. INSERT into `global_lookup_categories` with all required fields

**Expected Result:** All tests should pass with "ALL DIAGNOSTIC TESTS PASSED" message

**If diagnostic fails:** The error message will tell us exactly what's wrong

---

## If Diagnostic Passes: Apply Migration in Sequence

### Option A: Apply Full File (Recommended if diagnostic passes)

```sql
-- Apply the full migration:
c:\dev\agt-erp\supabase\migrations\20260607150000_erp_base_002f3e2_people_contacts_crm_database_lookups_seeds.sql
```

The file is structured in a single transaction, so it should apply atomically.

### Option B: Apply in Parts (If full file still fails)

1. **Part 1 - Lookups + Permissions** (`agent-tools/lookups_only.sql`)
   - 23 lookup categories
   - ~136 lookup values
   - 4 permissions
   - Role assignments

2. **Part 2 - Main Tables** (Lines 931-2400 of main file)
   - customers, vendors, subcontractors, suppliers, consultants, recruitment_agencies
   - With all RLS policies

3. **Part 3 - Related Tables** (Lines 2400-3164 of main file)
   - Contact tables
   - Address tables
   - Document tables
   - Bank details
   - Indexes, triggers, numbering

---

## Possible Root Causes

1. **Function Missing**: RLS policies use `current_user_has_permission()` and `current_user_has_role()` which might not exist
2. **Transaction Boundary**: Supabase SQL Editor might be auto-committing mid-statement
3. **Paste Corruption**: Special characters (Unicode quotes, em-dashes) might be corrupting SQL
4. **Size Limit**: File might be too large for web editor (175KB, 3164 lines)

---

## Information Needed from You

If diagnostic test fails, please share:
1. The **exact error message** including line number
2. The **line of SQL** that failed
3. **Which test** failed (1, 2, 3, or 4)

If diagnostic passes but full migration fails:
1. Which **section** was executing when it failed
2. The **line number** from the error

---

## Next Step

**Please run `agent-tools/diagnostic_test.sql` first** and let me know the result!
