# PROMPT_ERP_BASE_002F_3E_3B_6G_5_APPLY_STANDARD_TO_EXISTING_FORMS_AND_FUTURE_READY_MODULES

Act as Fable 5 inside Cursor.

Use deep runtime reasoning as a senior ERP architecture reviewer, Next.js 16 form-runtime engineer, TanStack Query architect, Supabase/RLS reviewer, future-module standards designer, parent-child form QA engineer, and Cursor implementation planner.

## Phase

ERP BASE 002F.3E.3B.6G.5 — Apply Standard to Existing Forms / Future-Ready Modules

## Prompt Purpose

This is a controlled AUDIT + LIGHT IMPLEMENTATION / READINESS prompt.

This phase follows:

```text
3B.6G.1 — Global Parent Form Runtime Standard Document + Prefetch Utilities
3B.6G.2 — Customer Basic Tab Lookup Prefetch Wiring
3B.6G.3 — Customer Child Tables TanStack Query Migration
3B.6G.4 — Generic Child Table Query / Invalidation Pattern
```

The global parent-form runtime standard now exists.

The Customer module has been used as the proof/reference implementation.

This phase must now audit all already implemented forms/modules and make them compliant or ready for the global parent-form runtime standard, without starting new business modules.

This phase must also prepare future party-master modules and future ERP modules to follow the same pattern.

---

# 1. Immediate Goal

After this phase:

```text
All current implemented forms are audited against the Global Parent Form Runtime Standard.
Current forms that need FormPrefetchDeclaration constants have them.
Forms that do not need prefetch/child runtime are documented as compliant/no-op.
Future party-master modules have a clear ready-to-use standard/template.
The standard is ready for Vendors/Subcontractors/Consultants/Government Authorities/Recruitment Agencies.
No current runtime behavior is broken.
```

This is a readiness and standard-application phase, not a new-module phase.

---

# 2. Strict Scope

## In Scope

Audit and lightly implement:

```text
current implemented parent forms audit
current implemented lookup-heavy forms audit
current implemented child-table forms audit
FormPrefetchDeclaration constants for forms that need them
future party-master standard declarations/templates
module readiness checklist
standards doc update if needed
report
```

Current implemented areas to audit:

```text
Customer
Organizations
Branches
Roles
Users Add/Edit
Numbering Rules
Geography forms
Finance Basics forms
UOM forms
Lookup Categories / Lookup Values
```

Future-ready modules to prepare for:

```text
Vendors
Subcontractors
Consultants
Government Authorities
Recruitment Agencies
HR / Employees
Fleet / Vehicles / Equipment
Workshop / Service Jobs
Inventory / Spare Parts
Projects
Procurement
Sales / CRM
Documents / DMS
Tasks
AI Center
```

## Out of Scope

Do not implement:

```text
new Vendor module
new Subcontractor module
new Consultant module
new Government Authority module
new Recruitment Agency module
new HR module
new Fleet module
new Workshop module
new Inventory module
new DMS
new Global Search
new AI Center
database schema changes
migrations
major UI rewrites
Customer final QA closure
runtime performance closure gate
```

These belong to later phases.

---

# 3. Mandatory Supabase Connection First

Before audit/implementation, connect to the live ERP Supabase project:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

Use the correct ERP Supabase connection/tool. Previous reports found that one Supabase plugin points to an unrelated weighing/industrial project.

Verify current and future-relevant tables:

```text
customers
customer_contacts
customer_addresses
customer_bank_details
customer_documents

vendors
vendor_contacts
vendor_addresses
vendor_bank_details
vendor_documents

subcontractors
subcontractor_contacts
subcontractor_addresses
subcontractor_bank_details
subcontractor_documents

consultants
consultant_contacts
consultant_addresses
consultant_bank_details
consultant_documents

government_authorities
government_authority_contacts
government_authority_addresses
government_authority_documents

recruitment_agencies
recruitment_agency_contacts
recruitment_agency_addresses
recruitment_agency_bank_details
recruitment_agency_documents

owner_companies
branches
roles
user_profiles
global_numbering_rules
global_lookup_categories
global_lookup_values
countries
emirates
cities
areas_zones
ports
banks
currencies
payment_terms
tax_types
uom_categories
units_of_measure
uom_conversions
cost_centers
profit_centers
```

No database changes are expected.

The report must state:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
No database schema changes were required for 3B.6G.5 Apply Standard to Existing Forms / Future-Ready Modules.
```

If some future tables do not exist, document accurately.

If Supabase connection is wrong/unavailable, continue source audit and document clearly.

---

# 4. Mandatory Documents and Reports to Read

Read standards:

```text
docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md
docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
docs/standards/ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md
```

Read reports:

```text
ERP_BASE_002F_3E_3B_6G_GLOBAL_PARENT_FORM_CHILD_TABLE_LOOKUP_PREFETCH_RUNTIME_STANDARD_PLAN.md
ERP_BASE_002F_3E_3B_6G_1_GLOBAL_PARENT_FORM_RUNTIME_STANDARD_AND_PREFETCH_UTILITIES_REPORT.md
ERP_BASE_002F_3E_3B_6G_2_CUSTOMER_BASIC_TAB_LOOKUP_PREFETCH_WIRING_REPORT.md
ERP_BASE_002F_3E_3B_6G_3_CUSTOMER_CHILD_TABLES_TANSTACK_QUERY_MIGRATION_REPORT.md
ERP_BASE_002F_3E_3B_6G_4_GENERIC_CHILD_TABLE_QUERY_INVALIDATION_PATTERN_REPORT.md
ERP_BASE_002F_3E_3B_6F_GLOBAL_COMBOBOX_FORM_PERFORMANCE_RUNTIME_QA_CLOSURE_GATE_REPORT.md
ERP_BASE_002F_3E_3B_4C_SAFE_CLOSE_RUNTIME_INVESTIGATION_AND_FIX_REPORT.md
```

Read source:

```text
src/lib/query/form-prefetch-types.ts
src/lib/query/prefetch-lookups.ts
src/lib/query/query-keys.ts
src/lib/query/invalidation.ts
src/hooks/child-tables/use-child-table-query.ts
src/features/master-data/customers/customer-prefetch.ts
src/features/master-data/customers/hooks/use-customer-child-queries.ts
src/features/**/components/*form*.tsx
src/app/**/page.tsx
```

Use actual paths if different.

---

# 5. Required Source Audit

Run source searches:

```bash
grep -R "FormPrefetchDeclaration" -n src
grep -R "CUSTOMER_FORM_PREFETCH" -n src
grep -R "ERPDrawerForm" -n src/features src/components
grep -R "ERPDrawerSection" -n src/features src/components
grep -R "LookupSelect" -n src/features src/components
grep -R "CountrySelect" -n src/features src/components
grep -R "CurrencySelect" -n src/features src/components
grep -R "OwnerCompanySelect" -n src/features src/components
grep -R "BranchSelect" -n src/features src/components
grep -R "new FormData" -n src/features src/components
grep -R "useChildTableQuery" -n src
grep -R "queryKeys.child" -n src
grep -R "vendor_contacts" -n src
grep -R "subcontractor_contacts" -n src
grep -R "consultant_contacts" -n src
grep -R "government_authority_contacts" -n src
grep -R "recruitment_agency_contacts" -n src
```

Create a current forms audit matrix:

```text
Module | Form | Lookup-heavy? | Child tables? | FormData risk? | Needs Prefetch Declaration? | Current Compliance | Action
```

---

# 6. Current Forms Standard Application

For each current module, decide one of:

```text
A. Already compliant — no changes needed.
B. Needs FormPrefetchDeclaration constant.
C. Needs future runtime wiring, not this phase.
D. Not applicable — simple form / no lookup-heavy / no child tables.
```

## Expected likely outcomes

### Customer

```text
Already has CUSTOMER_FORM_PREFETCH.
Already has child query hooks.
Audit only.
```

### Organization

Likely has geography/currency/lookup-heavy fields.

Determine if it needs:

```text
ORGANIZATION_FORM_PREFETCH
```

If yes, create declaration only or wire page-level prefetch only if safe and small.

### Branch

Likely has geography fields.

Determine if it needs:

```text
BRANCH_FORM_PREFETCH
```

If yes, create declaration only or wire prefetch if safe and small.

### Numbering Rules

Mostly enum/static fields.

Likely no FormPrefetchDeclaration needed.

### Geography / Finance / UOM / Lookups

Mostly small master forms.

Likely no parent-child pattern needed, but may benefit from standard declaration if they are lookup-heavy.

Audit and document.

---

# 7. Future Party-Master Readiness

The database includes party-master families similar to Customer.

Prepare templates, not UI modules.

Create future-ready declaration templates if appropriate.

Suggested file:

```text
src/features/master-data/party-master/party-master-prefetch-templates.ts
```

or:

```text
src/lib/standards/party-master-prefetch-templates.ts
```

Choose path based on project structure.

Templates should define patterns for:

```text
Vendor
Subcontractor
Consultant
Government Authority
Recruitment Agency
```

Do not import them into active runtime unless needed.

The templates can include:

```typescript
VENDOR_CHILD_TABLES
SUBCONTRACTOR_CHILD_TABLES
CONSULTANT_CHILD_TABLES
GOVERNMENT_AUTHORITY_CHILD_TABLES
RECRUITMENT_AGENCY_CHILD_TABLES
```

And example declaration shape using `FormPrefetchDeclaration`.

Do not create actual screens.

---

# 8. Standard Document Update

Update:

```text
docs/standards/ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md
```

Add or confirm a section:

```text
Current Module Compliance Status
Future Party-Master Module Template
When to create a FormPrefetchDeclaration
When not to create one
How to review FormData risk
```

Keep the standard practical, not bloated.

---

# 9. Light Implementation Rules

This phase can create declaration files and template files.

Do not change active runtime behavior unless:

```text
the change is only adding a declaration constant
or a very low-risk page-level prefetch call for Organization/Branch if clearly safe
```

If there is risk, document and defer to a later implementation phase.

Do not modify forms deeply.

---

# 10. Static Tests

Run:

```bash
npm run typecheck
npm run lint
npm run build
```

Rules:

```text
typecheck must pass
build must pass
lint must be run
new lint errors introduced by this phase must be fixed
pre-existing unrelated lint issues may be documented
```

---

# 11. Required Report

Create:

```text
ERP_BASE_002F_3E_3B_6G_5_APPLY_STANDARD_TO_EXISTING_FORMS_FUTURE_READY_MODULES_REPORT.md
```

Report must include:

1. Phase name.
2. Date/time.
3. Supabase connection confirmation.
4. Standards/reports reviewed.
5. Source audit results.
6. Current forms compliance matrix.
7. Declarations created.
8. Templates created.
9. Standard document updates.
10. Existing forms changed or not changed.
11. FormData risk findings.
12. Future party-master readiness.
13. Future module readiness checklist.
14. Static test results.
15. Known limitations.
16. Next phase recommendation.
17. Final status.

Final status must be exactly one of:

```text
PASS — Standard applied/readiness completed successfully.
PASS WITH NOTES — Completed with non-blocking notes.
FAIL — Blocking issues remain.
BLOCKED — Could not complete due to environment/tooling/source blocker.
```

---

# 12. Closure Criteria

Do not mark PASS unless:

```text
current forms audited
future party-master table readiness reviewed
standard document updated or confirmed sufficient
needed declaration/template files created or justified as not needed
typecheck passes
build passes
report created
```

If Supabase verification incomplete but source audit complete:

```text
PASS WITH NOTES
```

not clean PASS.

---

# 13. Stop Condition

After audit/implementation, tests, and report, stop.

Do not start 3B.6G.6.

Wait for Sameer/Dina review.

---

# Final Instruction

Apply the Global Parent Form Runtime Standard to existing forms at the declaration/readiness level.

Prepare future party-master and future module templates.

Do not build new modules.

Do not make risky runtime changes.

Run tests.

Create report.

Stop.
