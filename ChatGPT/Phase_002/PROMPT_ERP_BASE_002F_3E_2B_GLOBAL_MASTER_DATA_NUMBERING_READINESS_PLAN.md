# PROMPT_ERP_BASE_002F_3E_2B_GLOBAL_MASTER_DATA_NUMBERING_READINESS_PLAN

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, notification-engine validation specialist, enterprise ERP numbering architect, master-data governance auditor, and senior Next.js/Supabase implementation planner.

## Phase

ERP BASE 002F.3E.2B — Global Master Data Numbering Readiness

## Prompt Purpose

This prompt is for TECHNICAL PLANNING ONLY.

Do not implement code.

Do not create migrations.

Do not modify database schema.

Do not modify application source files.

Do not create UI screens.

Do not create server actions.

Do not update sidebar.

Do not touch Customers module implementation yet.

Your task is to connect to the live Supabase database, inspect the current numbering infrastructure, inspect the relevant master-data tables, and generate a detailed readiness and correction plan for global master-data numbering before we proceed to Customers implementation.

---

# 1. Mandatory Supabase Connection First

Before planning, connect to the live Supabase project:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

Inspect and verify the current live database schema, existing tables, columns, RLS policies, permissions, helper functions, triggers, and dependencies related to numbering and master-data code generation.

Do not assume schema from old plans or reports.

Do not assume numbering table names.

Do not assume old numbering plans are implemented.

Use the live database as the source of truth.

The final plan must clearly state:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
Live database schema was inspected before planning.
```

If connection fails, stop and create the plan file with:

```text
BLOCKED — Could not connect to Supabase project for live schema verification.
```

---

# 2. Required Output File

Create only this file:

```text
ERP_BASE_002F_3E_2B_GLOBAL_MASTER_DATA_NUMBERING_READINESS_PLAN.md
```

Do not create any other file.

---

# 3. Background and Current Context

ERP BASE 002F.3E.2 — Database + Lookup Categories + Seed Values was applied and verified successfully.

The latest verification confirmed:

```text
29 / 29 party master tables created
23 / 23 lookup categories inserted
178 lookup values available
4 / 4 party master permissions created
116 / 116 RLS policies created
RLS enabled on all 29 tables
29 / 29 set_updated_at triggers created
ICV/CICPA fields verified
government_authorities correctly has no ICV/CICPA fields
numbering system was deferred
```

We are about to implement:

```text
ERP BASE 002F.3E.3 — Customers Module
```

But before implementing Customers, Sameer wants to resolve global numbering/code generation for important master-data records so that forms do not rely on manual code entry.

---

# 4. Reason for This Phase

The Customers module needs:

```text
customer_code
```

Other party master tables also need codes:

```text
vendor_code
subcontractor_code
consultant_code
authority_code
agency_code
```

Existing organization and branch tables also have or need:

```text
company_code
branch_code
```

If we implement Customers now with manual code entry, we may later need to modify:

```text
customer form
customer validation
createCustomer server action
edit behavior
vendor/subcontractor forms
organization and branch forms
reports and exports
```

Therefore, this readiness plan must determine whether numbering should be implemented now, how it should work, and which existing global numbering infrastructure can be reused.

---

# 5. Important User Requirements

Sameer’s required numbering format should stay simple:

```text
ORG-000001
BR-000001
CUST-000001
VEND-000001
SUBC-000001
CONS-000001
AUTH-000001
AGCY-000001
```

Do not add company, branch, city, year, month, or day into the reference number unless Sameer explicitly requests it later.

Do not implement complex document numbering.

Do not create different logic per module.

Do not hardcode numbering in Customers or Vendors server actions.

Do not create separate numbering logic for customers only.

Use or extend the existing global numbering infrastructure only.

If existing infrastructure is incomplete, prepare a safe implementation plan for a correction/foundation phase.

---

# 6. Entities That Need Numbering

The plan must cover at least the following records.

## Existing Organization / Branch Master Data

```text
owner_companies → company_code or owner_company_code
branches → branch_code
```

Suggested prefixes:

```text
owner_companies: ORG
branches: BR
```

## Party Master Data

```text
customers → customer_code
vendors → vendor_code
subcontractors → subcontractor_code
consultants → consultant_code
government_authorities → authority_code
recruitment_agencies → agency_code
```

Suggested prefixes:

```text
customers: CUST
vendors: VEND
subcontractors: SUBC
consultants: CONS
government_authorities: AUTH
recruitment_agencies: AGCY
```

## Future Master Data Candidates

Also consider, but do not implement yet:

```text
employees → EMP
drivers → DRV
assets/equipment → AST or EQP
projects → PRJ
purchase requests → PR
purchase orders → PO
invoices → INV
work orders → WO
```

This phase is primarily for master-data codes, not transactions.

---

# 7. Required Live Database Inspection

Inspect the live database and document the actual schema for all relevant objects.

## 7.1 Numbering Tables

Search for and inspect any existing numbering-related tables, including but not limited to:

```text
global_numbering_generated_references
global_numbering_sequence_states
global_numbering_rules
numbering_document_types
numbering_rules
numbering_generated_numbers
```

For each found table, document:

```text
table name
columns
data types
primary key
unique constraints
foreign keys
indexes
RLS enabled or not
existing rows/count
purpose inferred from schema
whether safe to reuse
```

If some expected tables do not exist, state clearly.

The latest migration reports indicated:

```text
numbering_document_types and numbering_rules do not exist.
global_numbering_generated_references and global_numbering_sequence_states may exist.
```

Verify this directly from the live database.

## 7.2 Numbering Functions

Search for existing numbering functions or helper functions, including names containing:

```text
number
numbering
sequence
reference
generate
next
```

Document:

```text
function name
arguments
return type
security definer/invoker
purpose
whether safe for party master code generation
```

## 7.3 Existing Organization Tables

Inspect:

```text
owner_companies
branches
```

For each, verify:

```text
code columns
name columns
existing rows
constraints
whether code column is required
whether code column is unique
whether existing code values are populated
RLS policies
server actions/UI patterns if available
```

Specifically identify actual column names:

```text
company_code or owner_company_code
branch_code
```

Do not assume column names.

## 7.4 Party Master Tables

Inspect:

```text
customers
vendors
subcontractors
consultants
government_authorities
recruitment_agencies
```

For each, verify:

```text
code column name
required/not null
unique constraint
existing rows
whether code values exist
RLS policies
insert permission logic
whether code can be generated before insert
```

## 7.5 Permissions

Inspect whether numbering-related permissions already exist.

Search permissions with codes containing:

```text
numbering
reference
sequence
settings
admin
```

Also inspect existing relevant permissions:

```text
master_data.party_master.view
master_data.party_master.manage
master_data.party_master.export
master_data.party_master.audit_view
```

Determine if numbering requires its own permission or can be handled internally by server actions.

## 7.6 Existing Application Code

Inspect existing application code for numbering logic:

```text
src/server/actions
src/server/queries
src/lib
src/features
src/components
```

Search for:

```text
generateNumber
generateReference
nextNumber
nextReference
numbering
sequence
reference
global_numbering
```

Document exact files and patterns found.

---

# 8. Required Numbering Design Review

The plan must compare possible approaches.

## Option A — Use Existing Global Numbering Infrastructure

Use existing tables/functions if they are already adequate.

Evaluate whether existing infrastructure can generate:

```text
ORG-000001
BR-000001
CUST-000001
VEND-000001
SUBC-000001
CONS-000001
AUTH-000001
AGCY-000001
```

Check if it supports:

```text
prefix
last sequence number
zero padding
entity/table/document type
atomic next number generation
duplicate prevention
audit trail
multi-user concurrency
RLS safety
idempotent setup
```

## Option B — Create Minimal Global Numbering Correction

If existing infrastructure is present but incomplete, propose a minimal correction phase:

```text
ERP BASE 002F.3E.2C — Implement Global Master Data Numbering
```

This may include:

```text
missing numbering rules/sequences for master-data entities
safe SQL migration
helper function to generate next reference
server helper to call function
verification report
```

## Option C — Keep Manual Codes Temporarily

Only recommend this if numbering infrastructure is not safe to touch now.

If recommending manual codes temporarily, state the risks:

```text
duplicate formats
human error
future rework
inconsistent reporting
```

and define when numbering must be implemented.

---

# 9. Required Preferred Recommendation

Unless live database inspection shows a blocker, the preferred recommendation should be:

```text
Implement global master-data numbering before Customers implementation.
```

Reason:

```text
Customers will be the first real party master UI.
customer_code should be generated automatically from the beginning.
Organizations and branches also need clean codes.
Future vendors/subcontractors/etc. can then reuse the same pattern.
```

---

# 10. Numbering Rules To Plan

Plan simple numbering only.

Recommended rules:

| Entity | Table | Code Column | Prefix | Format |
|---|---|---|---|---|
| Owner Company | owner_companies | actual company code column | ORG | ORG-000001 |
| Branch | branches | branch_code | BR | BR-000001 |
| Customer | customers | customer_code | CUST | CUST-000001 |
| Vendor | vendors | vendor_code | VEND | VEND-000001 |
| Subcontractor | subcontractors | subcontractor_code | SUBC | SUBC-000001 |
| Consultant | consultants | consultant_code | CONS | CONS-000001 |
| Government Authority | government_authorities | authority_code | AUTH | AUTH-000001 |
| Recruitment Agency | recruitment_agencies | agency_code | AGCY | AGCY-000001 |

Do not include date/year/month/company/branch.

Do not include random values.

Do not allow user-edited prefix per record at this stage.

---

# 11. Required Concurrency and Safety Plan

The plan must explain how to avoid duplicate codes when two users create records at the same time.

Preferred database-safe approach:

```text
Use PostgreSQL transaction/locking or atomic upsert/update on sequence state table.
Generate the next code inside the database, not only in the frontend.
```

The plan must warn:

```text
Do not generate next code only in React frontend.
Do not query max(existing code)+1 in frontend.
Do not rely on client-side numbering.
```

Recommend a safe helper:

```text
get_next_master_reference(entity_type)
```

or use existing function if available.

---

# 12. Required UI/UX Decision

The plan must define how code fields should behave in forms.

Recommended:

```text
In Add mode:
- code field read-only or disabled
- show “Auto-generated on save”
- optional preview only if safe

In Edit mode:
- code field read-only
- never change automatically

In View mode:
- display code as read-only

For existing records:
- preserve existing code
- do not regenerate
```

For existing organizations/branches without code:

```text
plan safe backfill strategy
do not overwrite populated codes
generate only for missing codes if approved
```

---

# 13. Required Server Action Pattern

The plan must define how future create actions should use numbering.

Example desired pattern:

```text
createCustomer:
1. check permission
2. validate form input
3. request next customer_code from global numbering helper
4. insert customers row with generated customer_code
5. log audit
6. revalidate path
```

Same pattern later for:

```text
createVendor
createSubcontractor
createConsultant
createGovernmentAuthority
createRecruitmentAgency
createOwnerCompany
createBranch
```

---

# 14. Required Scope / Non-Scope

## In Scope for 002F.3E.2B

```text
live database inspection
numbering infrastructure audit
organization/branch code inspection
party master code inspection
implementation readiness decision
numbering design recommendation
implementation phase proposal
risk analysis
acceptance criteria
```

## Out of Scope for 002F.3E.2B

```text
creating numbering tables
creating migrations
changing owner_companies/branches
changing customers/vendors tables
implementing server actions
implementing UI
implementing Customers module
auto-generating any live code values
backfilling existing records
```

---

# 15. Required Plan Structure

The generated plan must include:

1. Phase title and objective.
2. Supabase live connection confirmation.
3. Executive summary.
4. Current live numbering infrastructure inspection.
5. Existing numbering tables found/not found.
6. Existing numbering functions found/not found.
7. Owner company code inspection.
8. Branch code inspection.
9. Party master code column inspection.
10. Existing application numbering code inspection.
11. Gap analysis.
12. Numbering options comparison.
13. Recommended approach.
14. Proposed numbering rules.
15. Concurrency and duplicate prevention plan.
16. UI/UX behavior for code fields.
17. Server action integration pattern.
18. Backfill strategy for existing records if needed.
19. RLS/permissions/security considerations.
20. Risks and mitigations.
21. Acceptance criteria.
22. Proposed next phase.
23. Final recommendation.

---

# 16. Required Next Prompt Recommendation

If safe, recommend next prompt:

```text
PROMPT_ERP_BASE_002F_3E_2C_IMPLEMENT_GLOBAL_MASTER_DATA_NUMBERING.md
```

If more database investigation is needed, recommend:

```text
PROMPT_ERP_BASE_002F_3E_2B_NUMBERING_SCHEMA_CORRECTION_INVESTIGATION.md
```

If numbering is not safe now, recommend whether Customers can proceed with manual codes temporarily and exactly when numbering must be implemented.

---

# 17. Final Status Line

End with exactly one of:

```text
READY FOR SAMEER REVIEW — 002F.3E.2B Global Master Data Numbering Readiness plan complete.
NEEDS CORRECTION — Numbering readiness requires correction before implementation.
BLOCKED — Could not verify live Supabase schema or numbering dependencies.
```

---

# 18. Final Instruction

Create only:

```text
ERP_BASE_002F_3E_2B_GLOBAL_MASTER_DATA_NUMBERING_READINESS_PLAN.md
```

Do not implement.

Do not create migration.

Do not modify database.

Do not modify application files.
