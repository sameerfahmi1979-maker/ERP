# PROMPT_ERP_BASE_002F_3E_PLAN_AND_SQL_CORRECTION_ADD_ICV_CICPA_FIELDS

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, SaaS security tester, PostgreSQL migration architect, enterprise ERP master-data architect, UAE business compliance analyst, ICV compliance data reviewer, CICPA supplier registration reviewer, and database implementation reviewer.

## Phase

ERP BASE 002F.3E — People / Contacts / CRM Foundation  
ERP BASE 002F.3E.2 — Database + Lookup Categories + Seed Values

## Prompt Purpose

This is a PLAN + SQL CORRECTION prompt.

The 002F.3E REV1 plan and the 002F.3E.2 SQL review file were already generated, but Sameer identified missing UAE compliance fields:

```text
ICV certificate information
CICPA company registration number
```

Your task is to update the technical plan and SQL review file before anything is applied to the database.

## Important Mode

Do not apply the SQL to the database.

Do not run the migration.

Do not use MCP apply_migration.

Do not use Supabase SQL editor execution.

Do not modify the remote database.

Do not implement UI.

Do not create server actions.

Do not update sidebar.

Only update/create review files.

## Current Files To Review

Review these existing files:

```text
ERP_BASE_002F_3E_PEOPLE_CONTACTS_CRM_FOUNDATION_TECHNICAL_IMPLEMENTATION_PLAN_REV1.md

supabase/migrations/20260607150000_erp_base_002f3e2_people_contacts_crm_database_lookups_seeds.sql

ERP_BASE_002F_3E_2_DATABASE_LOOKUPS_SEEDS_SQL_REVIEW_REPORT.md
```

## Required Output Files

Create/update exactly these files:

```text
ERP_BASE_002F_3E_PEOPLE_CONTACTS_CRM_FOUNDATION_TECHNICAL_IMPLEMENTATION_PLAN_REV2.md

supabase/migrations/20260607150000_erp_base_002f3e2_people_contacts_crm_database_lookups_seeds.sql

ERP_BASE_002F_3E_2_DATABASE_LOOKUPS_SEEDS_SQL_REVIEW_REPORT_REV1.md
```

If the original SQL file exists and was not applied, update it in place with the ICV and CICPA corrections.

The SQL file must remain review-only until Sameer/Dina approval.

---

# 1. Correction Summary

Add ICV fields and CICPA registration number to these main entity tables:

```text
customers
vendors
subcontractors
consultants
recruitment_agencies
```

Do NOT add these fields to:

```text
government_authorities
```

Reason:

```text
Government authorities are regulators/issuers/authorities, not normal commercial companies requiring ICV/CICPA supplier tracking.
```

---

# 2. Required ICV Fields

Add the following fields to the five applicable main entity tables:

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
```

## Field Meanings

Use this mapping based on Sameer’s ALGT ICV certificate example:

```text
ICV Certificate No. → icv_certificate_number
ICV Score → icv_score_percentage
Issue Date → icv_issue_date
Valid Until → icv_expiry_date
Company Type → icv_company_type
Financial Year End Date → icv_financial_year_end_date
Certification Body → icv_certification_body
ICV Version → icv_version
ICV Status → icv_status_code
ICV Document → icv_document_path
```

## Example Data From ALGT ICV Certificate

The plan/report can mention this example as context only, not as seed data:

```text
ICV Certificate No.: 140995
ICV Score: 31.42%
Issue Date: 24.12.2025
Valid Until: 24.08.2026
Company Type: SME in UAE
Financial Year End Date: 31.12.2023
Certification Body: Mazars Chartered Accountants - LLC
ICV Version: 3.0
```

Do not seed ALGT certificate data into customers/vendors/etc.

## Recommended SQL Types

Use:

```sql
icv_certificate_number text,
icv_score_percentage numeric(5,2),
icv_issue_date date,
icv_expiry_date date,
icv_company_type text,
icv_financial_year_end_date date,
icv_certification_body text,
icv_version text,
icv_status_code text,
icv_document_path text
```

## Recommended Constraints

Add safe checks:

```sql
check (icv_score_percentage is null or (icv_score_percentage >= 0 and icv_score_percentage <= 100))

check (
  icv_issue_date is null
  or icv_expiry_date is null
  or icv_expiry_date >= icv_issue_date
)
```

Do not make ICV fields required.

Do not make `icv_document_path` a FK to DMS because DMS is not implemented yet.

Use `icv_document_path` only as nullable temporary file/document reference.

## Recommended Indexes

Add partial indexes:

```text
icv_certificate_number where not null
icv_expiry_date where not null
icv_status_code where not null
```

Do not make `icv_certificate_number` globally unique across different tables because the same company may exist as customer and vendor.

Optionally make it unique within each table only if safe. If uncertain, use non-unique partial index only.

---

# 3. Required CICPA Field

Add this field to the same five tables:

```text
cicpa_registration_number
```

Meaning:

```text
Company CICPA registration number related to supplier/customer/subcontractor/company registration.
```

No expiry date is required.

Do not add CICPA expiry date.

Do not create CICPA document workflow now.

Do not add CICPA access cards here; individual employee/subcontractor employee CICPA cards belong to later HR/HSE/access modules.

## Recommended SQL Type

```sql
cicpa_registration_number text
```

## Recommended Index

Add partial index:

```text
cicpa_registration_number where not null
```

Do not make it globally unique across tables.

Optionally make it unique within each table only if safe. If uncertain, use non-unique partial index only.

---

# 4. Required New Lookup Category

Add one new lookup category:

```text
ICV_STATUS_TYPES
```

Add it to:

```text
global_lookup_categories
global_lookup_values
```

Do not create a new lookup table.

## Required Values

Seed:

```text
VALID
EXPIRED
UNDER_RENEWAL
NOT_AVAILABLE
NOT_REQUIRED
PENDING_SUBMISSION
```

Recommended descriptions:

```text
VALID — ICV certificate is valid.
EXPIRED — ICV certificate has expired.
UNDER_RENEWAL — ICV certificate is under renewal.
NOT_AVAILABLE — ICV certificate is not available.
NOT_REQUIRED — ICV certificate is not required.
PENDING_SUBMISSION — ICV certificate/details are pending submission.
```

`VALID` may be default if appropriate, but do not force it if missing ICV data.

Recommended safer default:

```text
NOT_AVAILABLE
```

Use `LookupSelect` later in UI for `icv_status_code`.

No hardcoded dropdowns.

---

# 5. Plan REV2 Update Requirements

Update the full technical plan into:

```text
ERP_BASE_002F_3E_PEOPLE_CONTACTS_CRM_FOUNDATION_TECHNICAL_IMPLEMENTATION_PLAN_REV2.md
```

The REV2 plan must integrate ICV and CICPA into the main content, not only an appendix.

Update these sections:

```text
Revision History
Executive Summary
Scope and Non-Scope
Final Entity Category Decision
Dedicated Table Decision Matrix
Lookup Category Plan
Database Schema Plan
Master Data Reuse and Dropdown Mapping Matrix
Seed Data Plan
Testing Plan
Risk Analysis
Acceptance Criteria
Future Integration Notes
Final Recommendation
```

## Add to Scope

Mention that this phase includes:

```text
ICV certificate metadata tracking for applicable commercial company entities
CICPA company registration number tracking for applicable commercial company entities
```

## Add to Non-Scope

Mention that this phase does NOT include:

```text
ICV certificate verification workflow
ICV score calculation engine
ICV audit workflow
CICPA individual employee access cards
CICPA expiry tracking
DMS document storage engine
```

## Update Table Count

Because no new tables are added, table count remains:

```text
29 tables
```

But lookup categories become:

```text
23 lookup categories
```

because `ICV_STATUS_TYPES` is added.

Lookup values become approximately:

```text
~136 lookup values
```

or update to the actual new count after SQL generation.

---

# 6. SQL File Update Requirements

Update this SQL file:

```text
supabase/migrations/20260607150000_erp_base_002f3e2_people_contacts_crm_database_lookups_seeds.sql
```

The SQL must remain a review-only migration file.

Do not apply it.

## 6.1 Add Columns To These Tables

Add ICV + CICPA fields directly in the create table definitions for:

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

## 6.2 Add Lookup Category and Values

Add:

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

## 6.3 Add Indexes

Add indexes for each applicable table:

```text
idx_<table>_icv_certificate_number
idx_<table>_icv_expiry_date
idx_<table>_icv_status_code
idx_<table>_cicpa_registration_number
```

Use `if not exists`.

Prefer partial indexes where possible:

```sql
where icv_certificate_number is not null
where icv_expiry_date is not null
where icv_status_code is not null
where cicpa_registration_number is not null
```

## 6.4 Add Constraints

For each applicable table:

```sql
check (
  icv_score_percentage is null
  or (icv_score_percentage >= 0 and icv_score_percentage <= 100)
)
```

and:

```sql
check (
  icv_issue_date is null
  or icv_expiry_date is null
  or icv_expiry_date >= icv_issue_date
)
```

Do not add overly strict CICPA format constraint because CICPA number format may vary.

Do not add overly strict ICV certificate format constraint unless confirmed.

## 6.5 Add SQL Comments

Add comments to columns explaining purpose.

Examples:

```sql
comment on column customers.icv_certificate_number is 'ICV certificate number for the customer/company, if applicable.';
comment on column vendors.cicpa_registration_number is 'Company CICPA registration number, if applicable. No expiry tracking at company level.';
```

Add comments documenting:

```text
ICV is metadata tracking only, not score calculation.
CICPA field is company registration number only, not individual access card tracking.
DMS file storage is not implemented; icv_document_path is a temporary nullable reference.
```

---

# 7. Review Report Update Requirements

Create:

```text
ERP_BASE_002F_3E_2_DATABASE_LOOKUPS_SEEDS_SQL_REVIEW_REPORT_REV1.md
```

It must include:

1. Statement that SQL is still review-only and not applied.
2. Files updated/created.
3. ICV fields added.
4. CICPA field added.
5. Tables updated.
6. Tables intentionally not updated.
7. New lookup category `ICV_STATUS_TYPES`.
8. New lookup values.
9. Constraints/indexes added.
10. Confirmation that no DMS was implemented.
11. Confirmation that no CICPA employee/access-card module was implemented.
12. Items requiring Sameer/Dina review before database application.
13. Final status.

End with:

```text
READY FOR REVIEW — REV1 SQL correction added ICV and CICPA fields and was not applied to database.
```

---

# 8. Required Verification Before Finishing

Before finishing, search the updated SQL to confirm:

```text
icv_certificate_number appears in customers
icv_certificate_number appears in vendors
icv_certificate_number appears in subcontractors
icv_certificate_number appears in consultants
icv_certificate_number appears in recruitment_agencies

cicpa_registration_number appears in customers
cicpa_registration_number appears in vendors
cicpa_registration_number appears in subcontractors
cicpa_registration_number appears in consultants
cicpa_registration_number appears in recruitment_agencies

icv_certificate_number does NOT appear in government_authorities
cicpa_registration_number does NOT appear in government_authorities

ICV_STATUS_TYPES exists
VALID exists
EXPIRED exists
UNDER_RENEWAL exists
NOT_AVAILABLE exists
NOT_REQUIRED exists
PENDING_SUBMISSION exists
```

Include these verification results in the review report.

---

# 9. Final Instruction

Create/update only the required plan, SQL, and review report files.

Do not apply SQL.

Do not run migration.

Do not implement UI.

Do not implement server actions.

Do not start 002F.3E.3.
