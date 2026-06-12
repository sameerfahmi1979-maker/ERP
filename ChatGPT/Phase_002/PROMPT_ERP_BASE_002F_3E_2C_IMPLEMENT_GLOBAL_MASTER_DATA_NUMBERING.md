# PROMPT_ERP_BASE_002F_3E_2C_IMPLEMENT_GLOBAL_MASTER_DATA_NUMBERING

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, SaaS security tester, PostgreSQL migration architect, database release manager, enterprise ERP numbering architect, master-data governance auditor, migration verification specialist, and senior Next.js/Supabase implementation reviewer.

## Phase

ERP BASE 002F.3E.2C — Implement Global Master Data Numbering

## Prompt Purpose

This is a controlled DATABASE IMPLEMENTATION prompt.

The 002F.3E.2B readiness plan confirmed that the live database already has a production-ready global numbering infrastructure, but party master numbering rules are missing.

Your task is to connect to the live Supabase database, verify the existing numbering infrastructure again, create and apply a small safe SQL migration to add the missing party master numbering rules, test the preview/generate functions, and generate a detailed verification report.

Do not implement Customers UI.

Do not implement server actions for Customers.

Do not implement Vendors/Subcontractors/etc.

Do not modify application source files unless explicitly needed for the migration report.

Do not create a separate numbering system.

Do not create hardcoded numbering logic in any module.

---

# 1. Mandatory Supabase Connection First

Before implementation, connect to the live Supabase project:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

Inspect and verify the current live database schema and existing numbering infrastructure before applying any SQL.

The final report must clearly state:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
Live database schema and numbering infrastructure were inspected before implementation.
```

If you cannot connect, stop and create a blocked report:

```text
BLOCKED — Could not connect to Supabase project for live schema verification.
```

---

# 2. Source Files To Review

Review these files before implementation:

```text
ERP_BASE_002F_3E_2B_GLOBAL_MASTER_DATA_NUMBERING_READINESS_PLAN.md
ERP_BASE_002F_3E_2_MIGRATION_VERIFICATION_REPORT_FINAL.md
ERP_BASE_002F_3E_3_CUSTOMERS_MODULE_TECHNICAL_IMPLEMENTATION_PLAN.md
```

Use the live database as the final source of truth.

---

# 3. Required Output Files

Create exactly these files:

```text
supabase/migrations/YYYYMMDDHHMMSS_erp_base_002f3e2c_global_master_data_numbering_rules.sql

ERP_BASE_002F_3E_2C_GLOBAL_MASTER_DATA_NUMBERING_IMPLEMENTATION_REPORT.md
```

Use the current timestamp format already used by the project.

---

# 4. Current Confirmed Context

The readiness plan confirmed the following existing numbering infrastructure:

```text
global_numbering_rules
global_numbering_sequence_states
global_numbering_generated_references
generate_next_reference_number()
preview_next_reference_number()
src/server/actions/numbering.ts
```

Existing numbering rules already include:

```text
MASTER_OWNER_COMPANY → OWNER_COMPANY → ORG
MASTER_BRANCH → BRANCH → BR
```

Missing party master rules:

```text
CUSTOMER
VENDOR
SUBCONTRACTOR
CONSULTANT
GOVERNMENT_AUTHORITY
RECRUITMENT_AGENCY
```

Party master tables are currently empty, so this is the safest time to add numbering rules.

---

# 5. Required Live Verification Before SQL

Before creating/applying SQL, verify these objects exist in the live database.

## 5.1 Numbering Tables

Verify:

```text
global_numbering_rules
global_numbering_sequence_states
global_numbering_generated_references
```

For each, inspect:

```text
columns
primary key
unique constraints
foreign keys
RLS status
row count
existing rules
```

## 5.2 Numbering Functions

Verify:

```text
generate_next_reference_number
preview_next_reference_number
```

For each, inspect:

```text
function exists
arguments
return type
security setting if visible
basic usage pattern
```

## 5.3 Existing Rules

Verify existing rules:

```text
MASTER_OWNER_COMPANY
MASTER_BRANCH
```

Document:

```text
document_type_code
document_prefix
format_template
sequence_length
reset_policy
allow_manual_override
allow_gaps
is_active
is_locked
```

## 5.4 Party Master Tables

Verify these tables exist and are empty or document row counts:

```text
customers
vendors
subcontractors
consultants
government_authorities
recruitment_agencies
```

Verify their code columns exist and are unique/not null:

```text
customers.customer_code
vendors.vendor_code
subcontractors.subcontractor_code
consultants.consultant_code
government_authorities.authority_code
recruitment_agencies.agency_code
```

## 5.5 Existing Organization/Branch Codes

Inspect:

```text
owner_companies.company_code or actual code column
branches.branch_code
```

Verify whether existing codes may conflict with ORG/BR generated sequences.

Do not change existing organization/branch codes in this phase.

---

# 6. Numbering Rules To Implement

Add exactly these 6 party master numbering rules.

Use simple format:

```text
PREFIX-000001
```

Use 6-digit sequence padding.

No company/branch/year/month/day.

No random values.

No separate module-specific logic.

## Required Rules

| Rule Code | Document Type Code | Prefix | Format |
|---|---|---|---|
| MASTER_CUSTOMER | CUSTOMER | CUST | CUST-000001 |
| MASTER_VENDOR | VENDOR | VEND | VEND-000001 |
| MASTER_SUBCONTRACTOR | SUBCONTRACTOR | SUBC | SUBC-000001 |
| MASTER_CONSULTANT | CONSULTANT | CONS | CONS-000001 |
| MASTER_AUTHORITY | GOVERNMENT_AUTHORITY | AUTH | AUTH-000001 |
| MASTER_AGENCY | RECRUITMENT_AGENCY | AGCY | AGCY-000001 |

## Required Rule Settings

Use actual `global_numbering_rules` column names from live database.

Recommended values:

```text
module_code: MASTER_DATA
module_name: Master Data
document_prefix: as above
separator: -
format_template: {DOC}-{SEQ6}
sequence_length: 6
padding_character: 0
starting_sequence_number: 1
current_sequence_number: 0
next_sequence_number: 1
reset_policy: never
allow_manual_override: false
allow_gaps: true
is_active: true
is_locked: false
```

If actual table requires more fields, populate them safely based on the live schema and existing rule patterns.

Do not change existing rules unless necessary to avoid conflicts.

Use idempotent SQL:

```text
INSERT ... ON CONFLICT (rule_code) DO UPDATE SET ...
```

or the actual unique constraint if different.

---

# 7. Migration Safety Requirements

The SQL must be additive and safe.

Allowed:

```text
INSERT into global_numbering_rules
ON CONFLICT DO UPDATE
SELECT verification queries
```

Not allowed:

```text
DROP TABLE
DROP COLUMN
TRUNCATE
DELETE FROM
alter existing master-data tables
alter existing owner_companies/branches/customers tables
create new numbering tables
change existing company/branch codes
generate live customer/vendor/etc. records
```

Do not create sequence states manually unless the existing numbering infrastructure requires it.

Prefer lazy sequence state creation by `generate_next_reference_number()`.

---

# 8. Preview and Generate Tests

After applying the SQL migration, test the numbering functions.

## 8.1 Preview Tests

Run preview for each document type without consuming sequence:

```text
CUSTOMER → expect CUST-000001
VENDOR → expect VEND-000001
SUBCONTRACTOR → expect SUBC-000001
CONSULTANT → expect CONS-000001
GOVERNMENT_AUTHORITY → expect AUTH-000001
RECRUITMENT_AGENCY → expect AGCY-000001
```

Use:

```text
preview_next_reference_number
```

or existing server action if appropriate.

## 8.2 Generate Tests

Important: Generating consumes sequence numbers.

Because party tables are empty and this is a setup test, choose one of these safe strategies:

### Preferred Strategy A — Preview Only, No Consumption

If the numbering function cannot reserve/cancel safely, do not consume sequences. Use preview only and report that generation will be tested during first real create action.

### Strategy B — Controlled Generate With Cancel/Documentation

Only if safe and the system supports it, generate one test number for each document type and mark it as test/cancelled if such status is supported.

Do not create dummy customer/vendor records.

Do not leave confusing test references unless clearly marked and acceptable.

## Recommendation

Use preview tests only unless existing system has safe reservation/cancel handling.

The report must clearly state whether generation was preview-only or actual generation.

---

# 9. Required Verification After Migration

Verify:

```text
6 new numbering rules exist
all 6 are active
all 6 use {DOC}-{SEQ6}
all 6 use sequence_length 6
all 6 have next_sequence_number 1 unless preview/generate changed it
all 6 have allow_manual_override false
all 6 have allow_gaps true
```

Verify existing rules remain:

```text
MASTER_OWNER_COMPANY
MASTER_BRANCH
```

Verify no tables were created or altered other than numbering rule inserts/updates.

Verify no party master records were created.

---

# 10. Required Report

Create:

```text
ERP_BASE_002F_3E_2C_GLOBAL_MASTER_DATA_NUMBERING_IMPLEMENTATION_REPORT.md
```

Report must include:

1. Phase name.
2. Date/time.
3. Supabase project connection confirmation.
4. Live database inspection summary.
5. Numbering tables verified.
6. Numbering functions verified.
7. Existing rules before implementation.
8. Party master table row counts.
9. SQL migration file created.
10. SQL applied confirmation.
11. Rules added/updated table.
12. Preview test results.
13. Generate test decision and reason.
14. Existing owner company/branch rules preserved confirmation.
15. No party records created confirmation.
16. No destructive SQL confirmation.
17. Risks/notes.
18. Final recommendation for Customers module.
19. Final status.

## Final Status Options

End with exactly one:

```text
PASS — Global master data numbering rules implemented and verified successfully.
PASS WITH NOTES — Global master data numbering rules implemented with non-blocking notes.
FAIL — Global master data numbering implementation failed or requires correction.
BLOCKED — Could not implement numbering due to blocking issue.
```

---

# 11. Customer Module Impact

The report must clearly state how 002F.3E.3 Customers implementation should behave after this phase.

Required customer behavior:

```text
In Add Customer mode:
- customer_code is read-only/disabled
- show “Auto-generated on save”
- optional preview: CUST-000001 if safe

In createCustomer server action:
- call generateNextReference or equivalent existing server action/function
- document_type_code = CUSTOMER
- insert generated customer_code into customers table

In Edit Customer mode:
- customer_code remains read-only
- never regenerate customer_code

In View Customer mode:
- show customer_code read-only
```

Future party modules should follow same pattern:

```text
createVendor → VENDOR
createSubcontractor → SUBCONTRACTOR
createConsultant → CONSULTANT
createGovernmentAuthority → GOVERNMENT_AUTHORITY
createRecruitmentAgency → RECRUITMENT_AGENCY
```

---

# 12. Final Instruction

Connect to Supabase first.

Verify live schema.

Create and apply only the numbering rules migration.

Generate implementation report.

Do not start Customers implementation.
