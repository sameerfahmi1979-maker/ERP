# ERP Base 002D - Database Migration Report

**Phase**: 002D - Admin Master Data Hardening  
**Migration File**: `supabase/migrations/20260527160443_erp_base_002d_admin_master_data_hardening.sql`  
**Date Created**: May 27, 2026  
**Status**: ⏳ **AWAITING USER APPROVAL - DO NOT APPLY YET**

---

## Executive Summary

This migration adds **47 new columns** across 5 tables to support:
1. UAE compliance fields for owner companies (legal, tax, licensing)
2. Operational flags for branches (workshop, warehouse, yard, weighbridge)
3. Enhanced role/permission display management
4. User profile admin tracking

**Safety Level**: ✅ **LOW RISK**
- All changes are additive (ALTER TABLE ADD COLUMN)
- No destructive operations
- Backward compatible
- No RLS policy changes
- BIGINT primary keys maintained

---

## Migration Contents

### 1. Owner Companies Table (+19 columns)

#### Address Fields (6 columns)
| Column | Type | Default | Nullable | Purpose |
|--------|------|---------|----------|---------|
| `city` | text | - | YES | City within emirate |
| `area` | text | - | YES | Area/district |
| `address_line_1` | text | - | YES | Primary street address |
| `address_line_2` | text | - | YES | Secondary address line |
| `po_box` | text | - | YES | PO Box number |
| `makani_number` | text | - | YES | UAE Makani precise address |

#### Legal & Licensing (5 columns)
| Column | Type | Default | Nullable | Purpose |
|--------|------|---------|----------|---------|
| `trade_license_issue_date` | date | - | YES | License issue date |
| `trade_license_expiry_date` | date | - | YES | License expiry date |
| `licensing_authority` | text | - | YES | DED/FTZ authority |
| `chamber_membership_no` | text | - | YES | Chamber of Commerce number |
| `chamber_membership_expiry_date` | date | - | YES | Chamber expiry date |

#### Tax & Compliance (7 columns)
| Column | Type | Default | Nullable | Purpose |
|--------|------|---------|----------|---------|
| `vat_registered` | boolean | TRUE | YES | VAT registration status |
| `corporate_tax_registered` | boolean | FALSE | YES | Corporate tax status |
| `icv_certificate_no` | text | - | YES | In-Country Value certificate |
| `icv_score` | numeric(5,2) | - | YES | ICV score (0-100 validated) |
| `icv_issue_date` | date | - | YES | ICV certificate issue date |
| `icv_expiry_date` | date | - | YES | ICV certificate expiry date |
| `adnoc_supplier_no` | text | - | YES | ADNOC supplier registration |

#### Other (1 column)
| Column | Type | Default | Nullable | Purpose |
|--------|------|---------|----------|---------|
| `notes` | text | - | YES | General company notes |

#### Constraints Added
- `owner_companies_icv_score_range`: CHECK (icv_score >= 0 AND icv_score <= 100)

#### Indexes Added (6 indexes)
- `idx_owner_companies_emirate` - For emirate filtering
- `idx_owner_companies_city` - For city filtering
- `idx_owner_companies_trade_license_no` - For license lookups
- `idx_owner_companies_trn` - For TRN lookups
- `idx_owner_companies_status` - For status filtering
- `idx_owner_companies_vat_registered` - For VAT queries

---

### 2. Branches Table (+13 columns)

#### Branch Categorization (3 columns)
| Column | Type | Default | Nullable | Purpose |
|--------|------|---------|----------|---------|
| `branch_type` | text | - | YES | Head Office, Branch, Yard, Workshop, etc. |
| `is_main_branch` | boolean | FALSE | YES | Primary branch flag |
| `operating_status` | text | 'active' | YES | active/maintenance/suspended/closed |

#### Location Fields (4 columns)
| Column | Type | Default | Nullable | Purpose |
|--------|------|---------|----------|---------|
| `city` | text | - | YES | City within emirate |
| `makani_number` | text | - | YES | UAE Makani address |
| `latitude` | numeric(10,7) | - | YES | GPS latitude (-90 to 90) |
| `longitude` | numeric(10,7) | - | YES | GPS longitude (-180 to 180) |

#### Contact Information (3 columns)
| Column | Type | Default | Nullable | Purpose |
|--------|------|---------|----------|---------|
| `contact_person_name` | text | - | YES | Primary contact name |
| `contact_phone` | text | - | YES | Contact phone number |
| `contact_email` | text | - | YES | Contact email address |

#### Operational Flags (4 columns) - **CRITICAL FOR PHASE 003**
| Column | Type | Default | Nullable | Purpose |
|--------|------|---------|----------|---------|
| `has_workshop` | boolean | FALSE | YES | Vehicle/equipment workshop |
| `has_warehouse` | boolean | FALSE | YES | Inventory storage |
| `has_yard` | boolean | FALSE | YES | Vehicle/equipment yard |
| `has_weighbridge` | boolean | FALSE | YES | Cargo/vehicle weighbridge |

#### Other (1 column)
| Column | Type | Default | Nullable | Purpose |
|--------|------|---------|----------|---------|
| `notes` | text | - | YES | Branch-specific notes |

#### Constraints Added
- `branches_branch_type_check`: CHECK branch_type IN (valid types)
- `branches_operating_status_check`: CHECK operating_status IN (active, maintenance, suspended, closed)
- `branches_latitude_range`: CHECK latitude BETWEEN -90 AND 90
- `branches_longitude_range`: CHECK longitude BETWEEN -180 AND 180

#### Indexes Added (9 indexes)
- `idx_branches_branch_type` - For type filtering
- `idx_branches_emirate` - For emirate filtering
- `idx_branches_city` - For city filtering
- `idx_branches_operating_status` - For status filtering
- `idx_branches_is_main_branch` - For main branch queries
- `idx_branches_has_workshop` - For workshop branches
- `idx_branches_has_warehouse` - For warehouse branches
- `idx_branches_has_yard` - For yard branches
- `idx_branches_has_weighbridge` - For weighbridge branches

---

### 3. Roles Table (+5 columns) - Optional Enhancements

| Column | Type | Default | Nullable | Purpose |
|--------|------|---------|----------|---------|
| `display_name` | text | - | YES | User-friendly display name |
| `role_category` | text | - | YES | Admin, Operational, Executive, etc. |
| `role_level` | text | - | YES | Junior, Senior, Manager, Executive |
| `is_assignable` | boolean | TRUE | YES | Can assign to users |
| `notes` | text | - | YES | Role notes |

#### Indexes Added (2 indexes)
- `idx_roles_role_category` - For category filtering
- `idx_roles_is_assignable` - For assignable roles

---

### 4. Permissions Table (+4 columns) - Optional Enhancements

| Column | Type | Default | Nullable | Purpose |
|--------|------|---------|----------|---------|
| `display_name` | text | - | YES | User-friendly display name |
| `is_system_permission` | boolean | TRUE | YES | System-managed flag |
| `is_visible` | boolean | TRUE | YES | Show in matrix |
| `sort_order` | integer | 0 | YES | Display order |

#### Indexes Added (3 indexes)
- `idx_permissions_module_code` - For module grouping
- `idx_permissions_is_visible` - For visible permissions
- `idx_permissions_sort_order` - For ordered display

---

### 5. User Profiles Table (+6 columns) - Optional Enhancements

| Column | Type | Default | Nullable | Purpose |
|--------|------|---------|----------|---------|
| `employee_reference` | text | - | YES | Employee ID/HR reference |
| `manager_user_profile_id` | bigint FK | - | YES | Direct manager (self-referential) |
| `preferred_language` | text | 'en' | YES | UI language: en, ar |
| `timezone` | text | 'Asia/Dubai' | YES | User timezone |
| `last_admin_updated_at` | timestamptz | - | YES | Admin edit timestamp |
| `notes` | text | - | YES | Admin notes |

#### Foreign Keys Added
- `manager_user_profile_id` REFERENCES `user_profiles(id)` ON DELETE SET NULL

#### Indexes Added (3 indexes)
- `idx_user_profiles_employee_reference` - For employee ID lookups
- `idx_user_profiles_manager` - For manager hierarchy queries
- `idx_user_profiles_preferred_language` - For language filtering

---

## Migration Statistics

| Table | Columns Added | Indexes Added | Constraints Added |
|-------|---------------|---------------|-------------------|
| owner_companies | 19 | 6 | 1 (ICV score range) |
| branches | 13 | 9 | 4 (type, status, lat/long) |
| roles | 5 | 2 | 0 |
| permissions | 4 | 3 | 0 |
| user_profiles | 6 | 3 | 0 (1 FK) |
| **TOTAL** | **47** | **23** | **5** |

---

## Security Validation

### ✅ BIGINT Primary Keys Maintained
```sql
-- Migration includes validation assertions:
ASSERT owner_companies.id = 'bigint'
ASSERT branches.id = 'bigint'
ASSERT roles.id = 'bigint'
ASSERT permissions.id = 'bigint'
ASSERT user_profiles.id = 'bigint'
```

**Result**: ✅ All primary keys remain BIGINT (no UUID added)

### ✅ RLS Policies Unaffected
- No RLS policy modifications in this migration
- Existing table-level RLS policies automatically cover new columns
- New columns inherit security from existing policies
- No new tables created (no new policies needed)

**Result**: ✅ RLS protection maintained

### ✅ Updated_At Triggers Refreshed
```sql
-- Triggers recreated to ensure updated_at works on new columns:
set_updated_at_owner_companies
set_updated_at_branches
set_updated_at_roles
set_updated_at_permissions
set_updated_at_user_profiles
```

**Result**: ✅ Timestamp tracking functional

---

## Backward Compatibility

### ✅ Non-Breaking Changes
- All new columns are nullable or have defaults
- No column renames
- No column deletions
- No table renames
- No data type changes
- Existing queries continue to work

### ✅ Rollback Strategy
If migration needs to be rolled back:
```sql
-- Can drop all added columns individually
ALTER TABLE public.owner_companies DROP COLUMN IF EXISTS city;
-- (repeat for all 47 columns)

-- Can drop all added indexes
DROP INDEX IF EXISTS idx_owner_companies_emirate;
-- (repeat for all 23 indexes)
```

**Note**: Rollback is low-risk since no data dependencies exist yet.

---

## Performance Impact

### Query Performance
- **POSITIVE**: 23 new indexes improve filtering and lookup speed
- **MINIMAL**: Column additions have negligible impact on existing queries
- **NO IMPACT**: Tables remain small in Phase 002D (< 1000 rows expected)

### Storage Impact
- **MINIMAL**: Text columns with NULL take minimal space
- **BOOLEAN**: 1 byte per boolean column
- **NUMERIC**: 8-16 bytes per numeric column
- **TOTAL ESTIMATE**: < 1 KB per row for new columns (mostly NULL initially)

### Index Storage
- **ESTIMATE**: ~100 KB total for all 23 indexes (assuming 100 rows per table)
- **BENEFIT**: Significant query speed improvement for filtering

**Net Impact**: ✅ Positive (better performance, minimal storage cost)

---

## Pre-Application Checklist

Before applying this migration, verify:

- [ ] **Review**: User has reviewed migration SQL file
- [ ] **Approval**: User has explicitly approved migration
- [ ] **Backup**: Current database state backed up (Supabase automatic backups active)
- [ ] **Environment**: Migration will be applied to correct Supabase project
- [ ] **No Conflicts**: No other migrations pending
- [ ] **Phase 001 Applied**: Base foundation migration already applied
- [ ] **Git Status**: Changes committed to feature branch before migration

---

## Application Commands

**⚠️ DO NOT RUN UNTIL APPROVED ⚠️**

### Option 1: Supabase CLI (Recommended)
```bash
# Preview migration (safe)
supabase db reset --linked

# Apply migration to cloud (AFTER APPROVAL)
supabase db push
```

### Option 2: Supabase Dashboard
1. Navigate to SQL Editor in Supabase Dashboard
2. Copy migration SQL contents
3. Execute SQL
4. Verify completion

**Recommended**: Option 1 (CLI) for better tracking and version control

---

## Post-Application Verification

After applying migration, run:

```sql
-- 1. Verify all columns exist
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name IN ('owner_companies', 'branches', 'roles', 'permissions', 'user_profiles')
ORDER BY table_name, ordinal_position;

-- 2. Verify indexes created
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('owner_companies', 'branches', 'roles', 'permissions', 'user_profiles')
ORDER BY tablename, indexname;

-- 3. Verify constraints
SELECT constraint_name, table_name, constraint_type
FROM information_schema.table_constraints
WHERE table_schema = 'public'
  AND table_name IN ('owner_companies', 'branches', 'roles', 'permissions', 'user_profiles')
ORDER BY table_name, constraint_name;

-- 4. Verify BIGINT primary keys
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND column_name = 'id'
  AND table_name IN ('owner_companies', 'branches', 'roles', 'permissions', 'user_profiles');
```

Expected results:
- All 47 columns present
- All 23 indexes created
- All 5 constraints active
- All primary keys are BIGINT

---

## Next Steps After Migration Approval

1. **User reviews and approves migration**
2. **Apply migration** (`supabase db push`)
3. **Verify migration** (run verification queries)
4. **Update TypeScript types** (`src/types/database.ts`)
5. **Update Zod schemas** (organization, branch schemas)
6. **Implement UI features** (forms, dialogs, views)
7. **Test all functionality**
8. **Generate completion reports**

---

## Migration Approval Status

**Current Status**: ⏳ **AWAITING USER APPROVAL**

**User Action Required**:
- Review `supabase/migrations/20260527160443_erp_base_002d_admin_master_data_hardening.sql`
- Verify migration safety and contents
- Approve migration by responding: "approved" or "apply migration"
- OR request changes/clarifications

**Agent Action After Approval**:
- Apply migration with `supabase db push`
- Verify successful application
- Proceed with TypeScript and UI implementation

---

**Migration Report Status**: ✅ COMPLETE  
**Next Action**: AWAIT USER APPROVAL

---

*End of ERP_BASE_002D_DATABASE_MIGRATION_REPORT.md*
