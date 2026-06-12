# PROMPT_ERP_BASE_002F_3E_2_APPLY_DATABASE_MIGRATION_IN_CHUNKS

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, SaaS security tester, PostgreSQL migration executor, database release manager, migration rollback reviewer, enterprise ERP master-data governance auditor, and production-readiness verification specialist.

## Phase

ERP BASE 002F.3E.2 — Database + Lookup Categories + Seed Values

## Mode

This is a CONTROLLED DATABASE MIGRATION APPLICATION prompt.

You are now approved to apply the reviewed SQL migration to the Supabase database.

Apply the migration safely.

If the file is too large, apply it in safe chunks.

After applying, run verification queries and generate a detailed application/verification report.

## Approved Source Files

Use these approved files:

```text
supabase/migrations/20260607150000_erp_base_002f3e2_people_contacts_crm_database_lookups_seeds.sql

ERP_BASE_002F_3E_PEOPLE_CONTACTS_CRM_FOUNDATION_TECHNICAL_IMPLEMENTATION_PLAN_REV4.md

ERP_BASE_002F_3E_2_DATABASE_LOOKUPS_SEEDS_SQL_REVIEW_REPORT_REV3.md
```

## Important Approval Context

The SQL file was previously reviewed and approved for database application.

Confirmed before approval:

```text
CREATE TABLE IF NOT EXISTS statements: 29
ENABLE ROW LEVEL SECURITY statements: 29
CREATE POLICY statements: 116
references global_lookup_values(value_code): 0
placeholder comments like “for brevity”: 0
```

The approved SQL includes:

```text
29 tables
23 lookup categories
~136 lookup values
4 grouped permissions
116 explicit RLS policies
indexes
constraints
triggers
numbering document types/rules
ICV fields
CICPA registration fields
```

The approved corrections include:

```text
REV1 — Classification corrections
REV2 — ICV + CICPA fields
REV3 — Unsafe lookup FK removal
REV4 — Explicit RLS policies for all 29 tables
```

---

# 1. Critical Instructions

You may apply the SQL migration to the database.

But do not implement UI.

Do not create server actions.

Do not update sidebar.

Do not start 002F.3E.3.

Do not modify application source files.

Do not change the SQL design unless the migration fails due to a real database compatibility issue.

If a correction is needed, apply the minimum safe correction and document it clearly.

## Migration Safety

Before applying:

1. Read the full SQL file.
2. Confirm it is the latest REV4-approved SQL file.
3. Confirm the file contains no unsafe lookup FK references.
4. Confirm the file contains explicit RLS policies.
5. Confirm the file does not include destructive operations such as DROP TABLE or TRUNCATE.

If destructive operations are found, stop and report BLOCKED.

---

# 2. Application Strategy

## Preferred Strategy

Try to apply the migration using Supabase MCP / migration tool in one operation if file size and tool limit allow.

If it fails due to size, timeout, or SQL length:

```text
Apply in safe chunks.
```

## Chunked Application Strategy

If chunking is needed, split logically:

```text
Chunk 1 — Header, lookup categories, lookup values
Chunk 2 — Permissions and role assignments
Chunk 3 — Main entity tables
Chunk 4 — Contact tables
Chunk 5 — Address tables
Chunk 6 — Document tables
Chunk 7 — Bank detail tables
Chunk 8 — Indexes
Chunk 9 — Triggers
Chunk 10 — RLS policies
Chunk 11 — Numbering document types and rules
Chunk 12 — Comments and final verification helpers if applicable
```

If some sections must be combined or split further due to SQL dependency order, do so safely and document the exact chunking used.

## Important Order

Apply in dependency-safe order:

```text
lookup categories before lookup values
permissions before RLS policies if RLS references permission checks
parent tables before child tables
tables before indexes
tables before triggers
tables before RLS policies
numbering document types before numbering rules
```

---

# 3. Do Not Break Existing Database

Do not drop existing tables.

Do not drop existing columns.

Do not truncate data.

Do not disable existing RLS policies outside this phase.

Do not remove existing permissions.

Do not overwrite unrelated master data.

Do not alter existing modules unless required by this migration.

This migration should be additive and idempotent.

---

# 4. Required Post-Application Verification Queries

After applying the SQL, run verification queries.

## 4.1 Table Verification

Verify:

```text
29 expected tables exist
```

Tables:

```text
customers
vendors
subcontractors
consultants
government_authorities
recruitment_agencies

customer_contacts
vendor_contacts
subcontractor_contacts
consultant_contacts
government_authority_contacts
recruitment_agency_contacts

customer_addresses
vendor_addresses
subcontractor_addresses
consultant_addresses
government_authority_addresses
recruitment_agency_addresses

customer_documents
vendor_documents
subcontractor_documents
consultant_documents
government_authority_documents
recruitment_agency_documents

customer_bank_details
vendor_bank_details
subcontractor_bank_details
consultant_bank_details
recruitment_agency_bank_details
```

Confirm excluded table does not exist unless already existed from another source:

```text
government_authority_bank_details
```

If it exists, document whether it pre-existed or was created unexpectedly.

## 4.2 Lookup Category Verification

Verify these 23 categories exist:

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

## 4.3 Critical Lookup Value Verification

Verify these values exist.

### CUSTOMER_TYPES

```text
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
```

### VENDOR_TYPES

```text
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
```

### SUBCONTRACTOR_TYPES

```text
CIVIL_SUBCONTRACTOR
MANPOWER_SUBCONTRACTOR
TRANSPORTER
TRANSPORT_SUBCONTRACTOR
DEMOLITION_SUBCONTRACTOR
EQUIPMENT_SUBCONTRACTOR
SPECIALIZED_SUBCONTRACTOR
PARTNER_SUBCONTRACTOR
```

### GOVERNMENT_AUTHORITY_TYPES

```text
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
```

### ICV_STATUS_TYPES

```text
VALID
EXPIRED
UNDER_RENEWAL
NOT_AVAILABLE
NOT_REQUIRED
PENDING_SUBMISSION
```

## 4.4 Permissions Verification

Verify 4 permissions exist:

```text
master_data.party_master.view
master_data.party_master.manage
master_data.party_master.export
master_data.party_master.audit_view
```

Verify role assignments:

```text
system_admin: view, manage, export, audit_view
group_admin: view, manage, export, audit_view
company_admin: view, export
branch_admin: view only
```

Confirm:

```text
branch_admin does NOT have master_data.party_master.manage
branch_admin does NOT have master_data.party_master.export
branch_admin does NOT have master_data.party_master.audit_view
```

## 4.5 RLS Verification

Verify:

```text
RLS enabled on all 29 tables
```

Verify policy count:

```text
116 CREATE POLICY / pg_policies records expected
```

Each of the 29 tables must have:

```text
select policy
insert policy
update policy
delete policy
```

## 4.6 Lookup FK Verification

Verify no FK constraint references only:

```text
global_lookup_values(value_code)
```

Expected:

```text
0 unsafe lookup FK constraints
```

Confirm lookup-code columns are text fields with comments.

## 4.7 Real FK Verification

Confirm real master-data FKs exist for:

```text
countries
emirates
cities
areas_zones
currencies
payment_terms
tax_types
banks
user_profiles
```

Do not require exact count unless easy, but report whether they exist as expected.

## 4.8 ICV/CICPA Verification

Verify ICV/CICPA fields exist in:

```text
customers
vendors
subcontractors
consultants
recruitment_agencies
```

Fields:

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

Verify ICV/CICPA fields do NOT exist in:

```text
government_authorities
```

## 4.9 Index Verification

Verify indexes exist for:

```text
entity code fields
name fields
type/status code fields
parent FKs
geography FKs
commercial term FKs
ICV fields
CICPA registration field
expiry fields
```

At minimum, confirm ICV/CICPA indexes:

```text
icv_certificate_number
icv_expiry_date
icv_status_code
cicpa_registration_number
```

for all 5 applicable tables.

## 4.10 Trigger Verification

Verify:

```text
set_updated_at trigger exists for all 29 tables
```

## 4.11 Numbering Verification

Verify numbering document types/rules exist for:

```text
CUSTOMER / CUST
VENDOR / VEND
SUBCONTRACTOR / SUBC
CONSULTANT / CONS
GOVERNMENT_AUTHORITY / AUTH
RECRUITMENT_AGENCY / AGCY
```

Or the exact format used by the existing numbering engine.

---

# 5. Required Report

Create:

```text
ERP_BASE_002F_3E_2_DATABASE_MIGRATION_APPLICATION_REPORT.md
```

The report must include:

1. Phase name.
2. Date/time.
3. SQL file applied.
4. Migration application method:
   - single execution
   - chunked execution
   - number of chunks
   - chunk names
5. Confirmation SQL was applied or failure/block reason.
6. Tables created verification.
7. Lookup categories verification.
8. Critical lookup values verification.
9. Permissions verification.
10. Role assignment verification.
11. RLS verification with policy count.
12. Lookup FK verification.
13. Real FK verification.
14. ICV/CICPA verification.
15. Index verification.
16. Trigger verification.
17. Numbering verification.
18. Errors encountered and fixes applied, if any.
19. Known notes or risks.
20. Final status.

## Final Status Options

At the end write exactly one:

```text
PASS — 002F.3E.2 database migration applied and verified successfully.
PASS WITH NOTES — 002F.3E.2 database migration applied with non-blocking notes.
FAIL — 002F.3E.2 database migration failed or requires correction before approval.
BLOCKED — 002F.3E.2 migration was not applied due to blocking issue.
```

---

# 6. Important Failure Handling

If any SQL chunk fails:

1. Stop immediately.
2. Capture exact error message.
3. Identify the chunk and section.
4. Do not continue blindly.
5. If safe correction is obvious and minimal, apply correction and retry the failed chunk.
6. Document correction clearly.
7. If not safe, stop and report BLOCKED.

Do not partially continue with dependent chunks if an earlier dependency chunk failed.

---

# 7. After Successful Application

Do not proceed to UI/server implementation.

Do not start 002F.3E.3 automatically.

After successful migration and verification, stop after creating the application report.

Next phase after approval will be:

```text
002F.3E.3 — Customers + Customer Contacts/Addresses/Documents/Bank Details
```

But do not start it now.

## Final Instruction

Apply the approved SQL migration safely.

Generate the database application/verification report.

Stop.
