# ERP BASE 002F.3E.2 — PERMISSIONS SCHEMA FIX REPORT

**Date**: Sunday, June 7, 2026 5:50 PM (UTC+4)  
**Issue**: Permissions table schema mismatch during migration application  
**Status**: ✅ FIXED

---

## Error Encountered

```
ERROR: 42703: column "permission_name_en" of relation "permissions" does not exist
LINE 814: INSERT INTO permissions (permission_code, permission_name_en, permission_name_ar, description, module_code, is_system, sort_order)
```

---

## Root Cause

The SQL migration was generated assuming a bilingual permissions table structure with:
- `permission_name_en` / `permission_name_ar` (bilingual fields)
- `is_system` (boolean flag)

However, the actual database schema has:
- `permission_name` (single text field)
- `is_system_permission` (boolean flag)
- `is_active` (boolean flag)
- `action_code` (text field - REQUIRED)

---

## Actual Permissions Table Schema

```sql
Column Name            | Data Type                   | Nullable
-----------------------|-----------------------------|---------
id                     | bigint                      | NO
permission_code        | text                        | NO
permission_name        | text                        | NO
module_code            | text                        | NO
action_code            | text                        | NO
description            | text                        | YES
is_active              | boolean                     | NO
created_at             | timestamp with time zone    | NO
updated_at             | timestamp with time zone    | NO
display_name           | text                        | YES
is_system_permission   | boolean                     | YES
is_visible             | boolean                     | YES
sort_order             | integer                     | YES
```

---

## Corrections Applied

### 1. Column Mapping Changes

**Before (INCORRECT):**
```sql
INSERT INTO permissions (
  permission_code, 
  permission_name_en,        -- ❌ Does not exist
  permission_name_ar,        -- ❌ Does not exist
  description, 
  module_code, 
  is_system,                 -- ❌ Wrong name
  sort_order
)
```

**After (CORRECT):**
```sql
INSERT INTO permissions (
  permission_code, 
  permission_name,           -- ✅ Correct (single field)
  action_code,               -- ✅ Added (required)
  description, 
  module_code, 
  is_system_permission,      -- ✅ Correct name
  is_active,                 -- ✅ Added
  sort_order
)
```

### 2. Action Code Extraction

Added `action_code` field extracted from `permission_code`:

| permission_code                      | action_code |
|--------------------------------------|-------------|
| master_data.party_master.view        | view        |
| master_data.party_master.manage      | manage      |
| master_data.party_master.export      | export      |
| master_data.party_master.audit_view  | audit_view  |

### 3. Updated ON CONFLICT Clause

**Before:**
```sql
ON CONFLICT (permission_code) 
DO UPDATE SET 
  permission_name_en = EXCLUDED.permission_name_en,
  permission_name_ar = EXCLUDED.permission_name_ar,
  description = EXCLUDED.description,
  updated_at = now();
```

**After:**
```sql
ON CONFLICT (permission_code) 
DO UPDATE SET 
  permission_name = EXCLUDED.permission_name,
  action_code = EXCLUDED.action_code,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  updated_at = now();
```

---

## Corrected SQL

```sql
-- Insert grouped party master permissions (idempotent)
INSERT INTO permissions (permission_code, permission_name, action_code, description, module_code, is_system_permission, is_active, sort_order)
VALUES
('master_data.party_master.view', 'View Party Master Data', 'view',
 'View all party entities (customers, vendors, subcontractors, consultants, government authorities, recruitment agencies)', 
 'PARTIES', true, true, 10),
('master_data.party_master.manage', 'Manage Party Master Data', 'manage',
 'Create, edit, deactivate all party entities and child records', 
 'PARTIES', true, true, 20),
('master_data.party_master.export', 'Export Party Master Data', 'export',
 'Export all party data to CSV/Excel', 
 'PARTIES', true, true, 30),
('master_data.party_master.audit_view', 'View Party Audit Logs', 'audit_view',
 'View audit logs for all party entities', 
 'PARTIES', true, true, 40)
ON CONFLICT (permission_code) 
DO UPDATE SET 
  permission_name = EXCLUDED.permission_name,
  action_code = EXCLUDED.action_code,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  updated_at = now();
```

---

## Files Updated

✅ `supabase/migrations/20260607150000_erp_base_002f3e2_people_contacts_crm_database_lookups_seeds.sql`
- Line 814-833: Corrected permissions INSERT statement
- Lines 6-24: Updated revision history (REV4+)

---

## Impact Analysis

### What Changed
- ✅ Permissions INSERT now uses correct column names
- ✅ Added required `action_code` field
- ✅ Removed bilingual name fields (not supported in actual schema)
- ✅ Changed `is_system` to `is_system_permission` and `is_active`

### What Was NOT Changed
- ✅ Role assignments (lines 836-885) - Still correct, use `role_id` and `permission_id` FKs
- ✅ All lookup categories and values - Already correct
- ✅ All 29 table definitions - No changes needed
- ✅ All 116 RLS policies - No changes needed
- ✅ All indexes and triggers - No changes needed

---

## Next Steps

1. **RETRY**: Apply the corrected SQL migration via Supabase Dashboard SQL Editor
2. **VERIFY**: The migration should now complete without errors
3. **CONFIRM**: Run verification queries from the application report

---

## Status

✅ **FIXED AND READY FOR RE-APPLICATION**

The SQL migration file has been corrected and is ready to be applied to the database.
