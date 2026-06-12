# PROMPT_ERP_BASE_002F_3E_REV2_SQL_CORRECTION_LOOKUP_FK_AND_FULL_PLAN_COMPLETION

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, PostgreSQL migration architect, SaaS security tester, master-data governance auditor, and ERP database implementation reviewer.

## Phase

ERP BASE 002F.3E — People / Contacts / CRM Foundation  
ERP BASE 002F.3E.2 — Database + Lookup Categories + Seed Values

## Prompt Purpose

This is a CRITICAL SQL + PLAN CORRECTION prompt.

The 002F.3E REV2 plan and SQL were generated for review only. During review, two issues must be corrected before the SQL can be approved for database application:

1. Lookup-code fields are using direct foreign keys to `global_lookup_values(value_code)`.
2. The REV2 plan includes placeholder/incomplete sections instead of a fully updated full plan.

You must correct the SQL and create a complete REV3 plan/report.

## Mode

Do not apply the SQL to the database.

Do not run the migration.

Do not use MCP apply_migration.

Do not use Supabase SQL editor execution.

Do not modify the remote database.

Do not implement UI.

Do not create server actions.

Do not update sidebar.

Create/update files only.

---

# 1. Files To Review

Review these current files:

```text
ERP_BASE_002F_3E_PEOPLE_CONTACTS_CRM_FOUNDATION_TECHNICAL_IMPLEMENTATION_PLAN_REV2.md

supabase/migrations/20260607150000_erp_base_002f3e2_people_contacts_crm_database_lookups_seeds.sql

ERP_BASE_002F_3E_2_DATABASE_LOOKUPS_SEEDS_SQL_REVIEW_REPORT_REV1.md
```

## Required Output Files

Create/update these files:

```text
ERP_BASE_002F_3E_PEOPLE_CONTACTS_CRM_FOUNDATION_TECHNICAL_IMPLEMENTATION_PLAN_REV3.md

supabase/migrations/20260607150000_erp_base_002f3e2_people_contacts_crm_database_lookups_seeds.sql

ERP_BASE_002F_3E_2_DATABASE_LOOKUPS_SEEDS_SQL_REVIEW_REPORT_REV2.md
```

The SQL file remains review-only and must NOT be applied.

---

# 2. Critical Issue 1 — Incorrect Lookup Foreign Keys

## Problem

The current SQL uses many column definitions like:

```sql
customer_type_code text not null references global_lookup_values(value_code)
status_code text not null default 'ACTIVE' references global_lookup_values(value_code)
vendor_type_code text not null references global_lookup_values(value_code)
```

This is risky and likely invalid because:

```text
global_lookup_values.value_code is not guaranteed to be globally unique.
The same value code may exist in multiple lookup categories.
Example: ACTIVE may exist in multiple status-related categories.
The existing lookup design is category_code + value_code based.
A foreign key to value_code alone is not safe unless value_code is globally unique, which should not be assumed.
```

## Required Fix

Remove direct FK references to:

```sql
global_lookup_values(value_code)
```

from all lookup-code columns.

All lookup-code columns should remain:

```sql
text
```

or:

```sql
text not null default 'ACTIVE'
```

as applicable, but without `references global_lookup_values(value_code)`.

## Required Design Rule

Use application/server validation and `LookupSelect` to ensure the value belongs to the correct lookup category.

The database should document the intended lookup category using column comments.

Example:

```sql
customer_type_code text not null,
comment on column customers.customer_type_code is 'Lookup value code from CUSTOMER_TYPES.';
```

Correct pattern:

```sql
status_code text not null default 'ACTIVE',
comment on column customers.status_code is 'Lookup value code from PARTY_STATUS_TYPES.';
```

Do not add a composite FK unless each table stores both category_code and value_code for every lookup field, which is not desired in this phase.

## Columns To Check And Correct

Correct all lookup-code columns across all 29 tables, including but not limited to:

```text
customer_type_code
industry_type_code
customer_segment_code
lead_source_code
status_code
vendor_type_code
vendor_category_code
supplier_category_code
subcontractor_type_code
subcontractor_category_code
hse_prequalification_status_code
consultant_type_code
consultant_category_code
authority_type_code
authority_category_code
jurisdiction_level_code
agency_type_code
agency_category_code
contact_type_code
preferred_communication_code
address_type_code
document_type_code
bank_account_type_code
icv_status_code
```

Search the SQL for this exact phrase:

```text
references global_lookup_values(value_code)
```

Final SQL must contain:

```text
0 occurrences
```

---

# 3. Critical Issue 2 — REV2 Plan Has Placeholder Sections

## Problem

The REV2 technical plan has placeholder wording such as:

```text
[SECTIONS 8-26 WOULD CONTINUE HERE WITH SAME PATTERN AS REV1]
```

This is not acceptable for the official implementation plan.

## Required Fix

Create a complete REV3 plan file with all sections fully written.

The REV3 plan must not contain placeholder statements such as:

```text
would continue here
same as REV1
content identical
remaining sections
due to document length constraints
```

The REV3 plan can be concise where appropriate, but it must be complete and implementation-ready.

---

# 4. Keep Approved REV2 ICV + CICPA Corrections

Do not remove the approved ICV/CICPA additions.

Keep ICV fields in:

```text
customers
vendors
subcontractors
consultants
recruitment_agencies
```

Do not add them to:

```text
government_authorities
```

Keep these fields:

```text
icv_certificate_number
icv_score_percentage
icv_issue_date
icv_expiry_date
icv_company_type
icv_financial_year_end_date
icv_certification_body
icv_version
icv_status_code
icv_document_path
cicpa_registration_number
```

Keep ICV constraints:

```sql
icv_score_percentage is null or between 0 and 100
icv_expiry_date >= icv_issue_date where both exist
```

Keep CICPA simple:

```text
cicpa_registration_number text nullable
no expiry date
no strict format constraint
```

Keep lookup category:

```text
ICV_STATUS_TYPES
```

with values:

```text
VALID
EXPIRED
UNDER_RENEWAL
NOT_AVAILABLE
NOT_REQUIRED
PENDING_SUBMISSION
```

But make sure `icv_status_code` does NOT directly FK to `global_lookup_values(value_code)`.

---

# 5. Keep Review-Only Status

The updated SQL must still be:

```text
FOR REVIEW ONLY
NOT APPLIED TO DATABASE
```

The review report must clearly state:

```text
SQL was updated for review only.
SQL was not applied.
No database modification was performed.
```

---

# 6. Required SQL Updates

In the SQL file:

## 6.1 Remove Unsafe Lookup FKs

Replace patterns like:

```sql
customer_type_code text not null references global_lookup_values(value_code),
```

with:

```sql
customer_type_code text not null,
```

Replace patterns like:

```sql
icv_status_code text references global_lookup_values(value_code),
```

with:

```sql
icv_status_code text,
```

Replace patterns like:

```sql
status_code text not null default 'ACTIVE' references global_lookup_values(value_code),
```

with:

```sql
status_code text not null default 'ACTIVE',
```

## 6.2 Add Column Comments For Lookup Sources

For every lookup-code column, add or update comments like:

```sql
comment on column customers.customer_type_code is 'Lookup value code from CUSTOMER_TYPES.';
comment on column customers.status_code is 'Lookup value code from PARTY_STATUS_TYPES.';
comment on column customers.icv_status_code is 'Lookup value code from ICV_STATUS_TYPES.';
```

## 6.3 Keep Existing FK References To Real Master Tables

Do NOT remove FKs to real master tables such as:

```text
countries(id)
emirates(id)
cities(id)
areas_zones(id)
currencies(id)
payment_terms(id)
tax_types(id)
banks(id)
user_profiles(id)
```

Only remove FKs to:

```text
global_lookup_values(value_code)
```

## 6.4 Verification Query/Checklist

At the end of SQL or report, include verification:

```text
references global_lookup_values(value_code): 0 occurrences
ICV_STATUS_TYPES: exists
icv_status_code fields: exist in 5 applicable tables only
government_authorities: no ICV/CICPA fields
```

---

# 7. Required REV3 Plan Updates

Create:

```text
ERP_BASE_002F_3E_PEOPLE_CONTACTS_CRM_FOUNDATION_TECHNICAL_IMPLEMENTATION_PLAN_REV3.md
```

The REV3 plan must:

1. State it supersedes REV2.
2. Explain why lookup-code columns use soft lookup references instead of direct FK to value_code.
3. Keep all approved REV1 classification corrections.
4. Keep all approved REV2 ICV/CICPA corrections.
5. Keep grouped permissions.
6. Keep 29 table count.
7. Keep 23 lookup categories.
8. Keep implementation split.
9. Fully write all plan sections.
10. Remove all placeholder language.

Required REV3 status:

```text
READY FOR SAMEER REVIEW — 002F.3E REV3 corrected technical plan complete.
```

---

# 8. Required Review Report REV2

Create:

```text
ERP_BASE_002F_3E_2_DATABASE_LOOKUPS_SEEDS_SQL_REVIEW_REPORT_REV2.md
```

The report must include:

1. Phase name.
2. Date.
3. Files updated.
4. Review-only status confirmation.
5. Summary of lookup FK issue found.
6. Confirmation that all `references global_lookup_values(value_code)` were removed.
7. Confirmation that real master-data FKs were preserved.
8. Confirmation that ICV/CICPA fields remain correct.
9. Confirmation that `government_authorities` remains excluded from ICV/CICPA fields.
10. Confirmation that `ICV_STATUS_TYPES` remains seeded.
11. Confirmation that REV3 plan has no placeholder sections.
12. Exact search/verification results:
    - `references global_lookup_values(value_code)` count = 0
    - `icv_certificate_number` present in 5 applicable tables
    - `cicpa_registration_number` present in 5 applicable tables
    - government_authorities excluded
13. Remaining review points before DB application.
14. Final status.

End with:

```text
READY FOR REVIEW — REV2 SQL correction removed unsafe lookup FKs, preserved ICV/CICPA fields, and was not applied to database.
```

---

# 9. Final Instruction

Do not apply SQL.

Do not run migration.

Do not implement UI.

Do not implement server actions.

Do not start 002F.3E.3.

Create/update only the SQL, REV3 plan, and REV2 review report.
