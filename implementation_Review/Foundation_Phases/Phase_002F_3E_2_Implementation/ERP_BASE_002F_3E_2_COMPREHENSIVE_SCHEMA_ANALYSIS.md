# ERP BASE 002F.3E.2 — COMPREHENSIVE SCHEMA ANALYSIS

## Database Schema vs Migration File Analysis

### 1. global_lookup_categories

**Actual Database Schema (Required Fields):**
```
✓ category_code (text, NOT NULL)
✓ category_name_en (text, NOT NULL)
✓ category_name_ar (text, nullable)
✓ description (text, nullable)
✓ module_code (text, nullable)
❌ category_scope (text, NOT NULL) - MISSING IN MIGRATION
❌ supports_hierarchy (boolean, NOT NULL) - MISSING IN MIGRATION
❌ supports_color (boolean, NOT NULL) - MISSING IN MIGRATION
❌ supports_icon (boolean, NOT NULL) - MISSING IN MIGRATION
❌ supports_effective_dates (boolean, NOT NULL) - MISSING IN MIGRATION
❌ supports_metadata (boolean, NOT NULL) - MISSING IN MIGRATION
✓ is_system (boolean, NOT NULL)
✓ is_locked (boolean, NOT NULL)
❌ is_active (boolean, NOT NULL) - MISSING IN MIGRATION
✓ sort_order (integer, NOT NULL)
```

**Migration Currently Tries to INSERT:**
```sql
INSERT INTO global_lookup_categories (
  category_code, category_name_en, category_name_ar, description, 
  module_code, is_system, is_locked, sort_order
)
```

**Missing 7 Required Fields!**

### 2. global_lookup_values  

**Actual Database Schema (Required Fields):**
```
✓ category_id (bigint FK, NOT NULL)
✓ value_code (text, NOT NULL)
✓ value_label_en (text, NOT NULL)
✓ value_label_ar (text, nullable)
✓ description (text, nullable)
❌ parent_value_id (bigint FK, nullable) - Not in migration (OK, nullable)
❌ color_hex (text, nullable) - Not in migration (OK, nullable)
❌ icon_name (text, nullable) - Not in migration (OK, nullable)
✓ badge_variant (text, nullable)
✓ sort_order (integer, NOT NULL)
✓ is_default (boolean, NOT NULL)
✓ is_system (boolean, NOT NULL)
✓ is_locked (boolean, NOT NULL)
❌ is_active (boolean, NOT NULL) - MISSING IN MIGRATION
❌ effective_from (date, nullable) - Not in migration (OK, nullable)
❌ effective_to (date, nullable) - Not in migration (OK, nullable)
❌ metadata_json (jsonb, NOT NULL) - MISSING IN MIGRATION
```

**Migration Currently Tries to INSERT:**
```sql
INSERT INTO global_lookup_values (
  category_id, value_code, value_label_en, value_label_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
)
```

**Missing 2 Required Fields: is_active, metadata_json**

### 3. permissions (Already Fixed)

**Actual Schema:**
```
✓ permission_code (text, NOT NULL)
✓ permission_name (text, NOT NULL)
✓ action_code (text, NOT NULL)
✓ module_code (text, NOT NULL)
✓ description (text, nullable)
✓ is_active (boolean, NOT NULL)
✓ is_system_permission (boolean, nullable)
```

**Status:** ✅ FIXED (previous correction)

---

## Required Fixes

### Fix 1: global_lookup_categories INSERT

**Add these fields with defaults:**
- `category_scope` → `'GLOBAL'` (standard scope for party lookups)
- `supports_hierarchy` → `false`
- `supports_color` → `true` (we use badge_variant)
- `supports_icon` → `true` (we may add icons later)
- `supports_effective_dates` → `false`
- `supports_metadata` → `false`
- `is_active` → `true`

### Fix 2: global_lookup_values INSERT

**Add these fields with defaults:**
- `is_active` → `true`
- `metadata_json` → `'{}'::jsonb` (empty JSON object)

---

## Safety Assessment

**SAFE TO APPLY:** ✅ After applying fixes below

**Why:**
- All new tables will be created with proper constraints
- Lookup inserts use UPSERT (ON CONFLICT), so idempotent
- Role assignments use FK resolution, safe
- RLS policies use IF NOT EXISTS pattern
- No data will be lost
- No existing tables will be dropped or altered

**Recommendation:** Apply ALL schema fixes before running migration.
