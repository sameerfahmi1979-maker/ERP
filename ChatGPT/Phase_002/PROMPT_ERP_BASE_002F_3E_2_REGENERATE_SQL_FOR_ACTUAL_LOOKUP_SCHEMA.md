# PROMPT_ERP_BASE_002F_3E_2_REGENERATE_SQL_FOR_ACTUAL_LOOKUP_SCHEMA

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, SaaS security tester, PostgreSQL migration architect, database release manager, master-data governance auditor, and implementation blocker-resolution specialist.

## Phase

ERP BASE 002F.3E.2 — Database + Lookup Categories + Seed Values

## Prompt Purpose

This is a BLOCKER CORRECTION prompt.

The previous attempt to apply the 002F.3E.2 migration was BLOCKED because the generated SQL did not match the actual database schema for `global_lookup_values`.

You must regenerate the SQL migration to match the actual existing database schema.

## Mode

Create corrected SQL and review report only first.

Do not apply the SQL to the database yet.

Do not run the migration.

Do not use MCP apply_migration.

Do not use Supabase SQL editor execution.

Do not modify the remote database.

Do not implement UI.

Do not create server actions.

Do not update sidebar.

Do not start 002F.3E.3.

## Files To Review

Review these files:

```text
ERP_BASE_002F_3E_2_DATABASE_MIGRATION_APPLICATION_REPORT.md
ERP_BASE_002F_3E_PEOPLE_CONTACTS_CRM_FOUNDATION_TECHNICAL_IMPLEMENTATION_PLAN_REV4.md
ERP_BASE_002F_3E_2_DATABASE_LOOKUPS_SEEDS_SQL_REVIEW_REPORT_REV3.md
supabase/migrations/20260607150000_erp_base_002f3e2_people_contacts_crm_database_lookups_seeds.sql
```

## Required Output Files

Create/update exactly these files:

```text
supabase/migrations/20260607150000_erp_base_002f3e2_people_contacts_crm_database_lookups_seeds.sql

ERP_BASE_002F_3E_2_SQL_SCHEMA_COMPATIBILITY_FIX_REPORT.md
```

Do not create extra implementation files.

---

# 1. Blocker Summary

The previous migration application failed during Chunk 1 with:

```text
ERROR: 42703: column "category_code" of relation "global_lookup_values" does not exist
LINE 140: category_code, value_code, value_name_en, value_name_ar,
```

Root cause:

The generated SQL assumed this incorrect lookup value schema:

```text
global_lookup_values.category_code
global_lookup_values.value_name_en
global_lookup_values.value_name_ar
```

But the actual database uses:

```text
global_lookup_values.category_id
global_lookup_values.value_code
global_lookup_values.value_label_en
global_lookup_values.value_label_ar
```

The actual `global_lookup_values` table also includes:

```text
id
parent_value_id
color_hex
icon_name
badge_variant
sort_order
is_default
is_system
is_locked
is_active
effective_from
effective_to
metadata_json
audit fields
```

The SQL must be regenerated to match the actual schema.

---

# 2. Critical Rule

Do NOT modify the existing lookup table schema.

Do NOT alter `global_lookup_categories`.

Do NOT alter `global_lookup_values`.

Do NOT add `category_code` to `global_lookup_values`.

Do NOT rename `value_label_en` / `value_label_ar`.

The ERP lookup schema is already established by previous phases and must be respected.

Regenerate 002F.3E.2 SQL to fit the existing schema.

---

# 3. Required Schema Inspection Before SQL Regeneration

Before regenerating SQL, inspect actual database schema.

Run information_schema checks for:

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
and table_name = 'global_lookup_categories'
order by ordinal_position;

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
and table_name = 'global_lookup_values'
order by ordinal_position;
```

Also inspect constraints:

```sql
select conname, pg_get_constraintdef(c.oid) as definition
from pg_constraint c
join pg_class t on c.conrelid = t.oid
join pg_namespace n on t.relnamespace = n.oid
where n.nspname = 'public'
and t.relname in ('global_lookup_categories', 'global_lookup_values')
order by t.relname, conname;
```

Also inspect permissions and roles schema because this migration seeds permissions:

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
and table_name in ('permissions', 'roles', 'role_permissions')
order by table_name, ordinal_position;
```

Also inspect numbering schema because this migration seeds numbering:

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
and table_name in ('numbering_document_types', 'numbering_rules')
order by table_name, ordinal_position;
```

Use actual schema results as source of truth.

---

# 4. Required Lookup Insert Pattern

## 4.1 Categories

For `global_lookup_categories`, use actual column names after inspection.

If actual category table has:

```text
category_code
category_name_en / category_name_ar
```

or similar, use them.

If actual names are different, adapt.

Use idempotent upsert based on the actual unique constraint.

Do not assume conflict target blindly.

## 4.2 Values

For `global_lookup_values`, replace all old insert logic.

Do not use:

```sql
category_code
value_name_en
value_name_ar
```

Use actual columns:

```sql
category_id
value_code
value_label_en
value_label_ar
```

Recommended safe pattern:

```sql
with cat as (
  select id
  from global_lookup_categories
  where category_code = 'CUSTOMER_TYPES'
  limit 1
)
insert into global_lookup_values (
  category_id,
  value_code,
  value_label_en,
  value_label_ar,
  description,
  badge_variant,
  sort_order,
  is_default,
  is_system,
  is_locked,
  is_active,
  metadata_json
)
select
  cat.id,
  'NORMAL_CUSTOMER',
  'Normal Customer',
  'عميل عادي',
  'Normal customer',
  'blue',
  10,
  true,
  true,
  false,
  true,
  '{}'::jsonb
from cat
on conflict (category_id, value_code)
do update set
  value_label_en = excluded.value_label_en,
  value_label_ar = excluded.value_label_ar,
  description = excluded.description,
  badge_variant = excluded.badge_variant,
  sort_order = excluded.sort_order,
  is_default = excluded.is_default,
  is_system = excluded.is_system,
  is_locked = excluded.is_locked,
  is_active = excluded.is_active,
  updated_at = now();
```

If the actual unique constraint is not `(category_id, value_code)`, adapt based on schema inspection.

## 4.3 Required Verification

After regenerating SQL, search it and confirm:

```text
global_lookup_values.category_code: 0 occurrences in INSERT column lists
value_name_en: 0 occurrences
value_name_ar: 0 occurrences
value_label_en: present
value_label_ar: present
category_id: present
```

---

# 5. Keep All Approved Design Items

Do not remove previously approved design.

Keep:

```text
29 tables
23 lookup categories
~136 lookup values
4 grouped permissions
116 explicit RLS policies
REV1 classification corrections
REV2 ICV/CICPA fields
REV3 unsafe lookup FK removal
REV4 explicit RLS policies
branch_admin view only
company_admin view/export only
```

## Keep ICV/CICPA Fields

Keep ICV/CICPA in:

```text
customers
vendors
subcontractors
consultants
recruitment_agencies
```

Do not add to:

```text
government_authorities
```

## Keep No Unsafe Lookup FK

Final SQL must still have:

```text
references global_lookup_values(value_code): 0 occurrences
```

## Keep Explicit RLS

Final SQL must still have:

```text
CREATE POLICY statements: 116
```

or more only if justified, but all 29 tables must have:

```text
select policy
insert policy
update policy
delete policy
```

---

# 6. Required Lookup Categories and Values To Preserve

Preserve all 23 categories:

```text
CUSTOMER_TYPES
CUSTOMER_SEGMENTS
VENDOR_TYPES
VENDOR_CATEGORIES
SUPPLIER_CATEGORIES
SUBCONTRACTOR_TYPES
SUBCONTRACTOR_CATEGORIES
CONSULTANT_TYPES
CONSULTANT_CATEGORIES
GOVERNMENT_AUTHORITY_TYPES
GOVERNMENT_AUTHORITY_CATEGORIES
JURISDICTION_LEVEL_TYPES
RECRUITMENT_AGENCY_TYPES
RECRUITMENT_AGENCY_CATEGORIES
INDUSTRY_TYPES
CRM_LEAD_SOURCES
CONTACT_TYPES
COMMUNICATION_PREFERENCE_TYPES
ADDRESS_TYPES
PARTY_DOCUMENT_TYPES
BANK_ACCOUNT_TYPES
HSE_PREQUALIFICATION_STATUS_TYPES
ICV_STATUS_TYPES
```

Preserve critical values:

```text
CUSTOMER_TYPES:
NORMAL_CUSTOMER
MAIN_CONTRACTOR
EPC_CONTRACTOR
GOVERNMENT_CUSTOMER
SEMI_GOVERNMENT_CUSTOMER
UTILITY_COMPANY
WATER_POWER_PLANT
INDUSTRIAL_CUSTOMER
COMMERCIAL_CUSTOMER
SCRAP_BUYER
SCRAP_SUPPLIER
PARTNER_CUSTOMER

VENDOR_TYPES:
SUPPLIER
MATERIAL_SUPPLIER
EQUIPMENT_SUPPLIER
SERVICE_PROVIDER
INSURANCE_COMPANY
PROPERTY_LESSOR
VEHICLE_LESSOR
EQUIPMENT_LESSOR
CAMP_ACCOMMODATION_LESSOR
UTILITY_PROVIDER
TRANSPORTER
TRANSPORT_SERVICE_PROVIDER
LOGISTICS_SERVICE_PROVIDER
PRIVATE_WASTE_DISPOSAL_FACILITY
WASTE_DISPOSAL_SERVICE_PROVIDER

SUBCONTRACTOR_TYPES:
CIVIL_SUBCONTRACTOR
MANPOWER_SUBCONTRACTOR
TRANSPORTER
TRANSPORT_SUBCONTRACTOR
DEMOLITION_SUBCONTRACTOR
EQUIPMENT_SUBCONTRACTOR
SPECIALIZED_SUBCONTRACTOR
PARTNER_SUBCONTRACTOR

GOVERNMENT_AUTHORITY_TYPES:
LICENSE_ISSUER
PERMIT_ISSUER
REGULATOR
MUNICIPALITY
POLICE
CIVIL_DEFENSE
ENVIRONMENTAL_AUTHORITY
FREE_ZONE_AUTHORITY
PORT_AUTHORITY
CUSTOMS_AUTHORITY
PORT_CUSTOMS_AUTHORITY
UTILITY_AUTHORITY
TRANSPORT_AUTHORITY
WASTE_DISPOSAL_FACILITY
GOVERNMENT_WASTE_DISPOSAL_AUTHORITY
MINISTRY

ICV_STATUS_TYPES:
VALID
EXPIRED
UNDER_RENEWAL
NOT_AVAILABLE
NOT_REQUIRED
PENDING_SUBMISSION
```

---

# 7. Table / RLS / Permission Checks To Preserve

After regenerating SQL, verify:

```text
CREATE TABLE IF NOT EXISTS statements = 29
ALTER TABLE ... ENABLE ROW LEVEL SECURITY statements = 29
CREATE POLICY statements >= 116
references global_lookup_values(value_code) = 0
government_authority_bank_details not created
ICV/CICPA fields in 5 applicable tables only
government_authorities no ICV/CICPA fields
```

---

# 8. Required Report

Create:

```text
ERP_BASE_002F_3E_2_SQL_SCHEMA_COMPATIBILITY_FIX_REPORT.md
```

Report must include:

1. Phase name.
2. Date/time.
3. Blocking issue summary.
4. Actual schema found for `global_lookup_categories`.
5. Actual schema found for `global_lookup_values`.
6. Summary of SQL corrections made.
7. Confirmation SQL was regenerated for review only.
8. Confirmation SQL was NOT applied.
9. Lookup insert pattern used.
10. Verification that old wrong columns were removed:
    - `category_code` in `global_lookup_values` INSERTs removed
    - `value_name_en` removed
    - `value_name_ar` removed
11. Verification that correct columns are used:
    - `category_id`
    - `value_label_en`
    - `value_label_ar`
12. Confirmation all prior corrections preserved:
    - 29 tables
    - 23 lookup categories
    - ~136 values
    - ICV/CICPA
    - 116 RLS policies
    - no unsafe lookup FK
13. Remaining review points.
14. Final status.

End with:

```text
READY FOR REVIEW — SQL regenerated to match actual lookup schema and was not applied to database.
```

---

# 9. Final Instruction

Create/update only:

```text
supabase/migrations/20260607150000_erp_base_002f3e2_people_contacts_crm_database_lookups_seeds.sql
ERP_BASE_002F_3E_2_SQL_SCHEMA_COMPATIBILITY_FIX_REPORT.md
```

Do not apply SQL.

Do not run migration.

Do not start 002F.3E.3.
