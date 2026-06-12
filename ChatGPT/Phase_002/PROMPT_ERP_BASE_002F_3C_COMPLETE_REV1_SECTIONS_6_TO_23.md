# PROMPT_ERP_BASE_002F_3C_COMPLETE_REV1_SECTIONS_6_TO_23

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, notification-engine validation specialist, enterprise ERP solution architect, UAE business compliance analyst, master data governance consultant, and senior Next.js/Supabase implementation planner.

## Phase

ERP BASE 002F.3C — Complete REV1 Technical Plan Sections 6 to 23

## Purpose

Complete the unfinished revised technical implementation plan for:

**ERP BASE 002F.3C — Core UAE Shared Master Data**

The current revised file:

`ERP_BASE_002F_3C_CORE_UAE_SHARED_MASTER_DATA_TECHNICAL_IMPLEMENTATION_PLAN_REV1.md`

is incomplete. It only completed Sections 1–5 and ended with:

```text
STATUS: REV1 IN PROGRESS - Sections 1-5 Complete
NEXT: Sections 6-23 (Database Schema through Final Recommendation)
```

This is not acceptable as a final technical implementation plan.

Your task is to complete the missing Sections 6–23 fully and produce one complete final report.

## Required Output File

Create only this final corrected file:

`ERP_BASE_002F_3C_CORE_UAE_SHARED_MASTER_DATA_TECHNICAL_IMPLEMENTATION_PLAN_REV2_COMPLETE.md`

Do not implement code.

Do not create migrations.

Do not modify application source files.

Do not create UI screens.

Do not start implementation.

## Critical Instruction

Do not summarize.

Do not say “continuation”.

Do not say “sections will be created later”.

Do not leave any section as a placeholder.

Do not produce only Sections 6–23 as a separate fragment without context.

Produce a complete final plan that includes:

- Sections 1–5 from the existing REV1, kept and cleaned if needed.
- Sections 6–23 fully written in detail.
- Final recommendation and status.
- The approved sub-phase split.

The final file must be complete enough for Sameer to approve before we generate implementation prompts.

## Approved Direction From Sameer Review

Sameer approved the idea of splitting 002F.3C into safer sub-phases.

The final plan must use this sub-phase split:

```text
002F.3C.1 — Geography & Locations
002F.3C.2 — Finance Basics / Commercial Readiness
002F.3C.3 — Units & Measurements
002F.3C.4 — Integration, Sidebar, Select Components, QA, and Readiness Review
```

The final plan must clearly explain:

- why the split is recommended
- what each sub-phase includes
- what each sub-phase excludes
- the dependencies between sub-phases
- implementation acceptance criteria per sub-phase
- final readiness gate

## Approved Scope of 002F.3C

002F.3C covers:

### Geography & Locations

- Countries
- Emirates
- Cities
- Areas / Zones
- Ports
- Work Sites / Site Locations if approved

### Finance Basics / Commercial Readiness

- Currencies
- Payment Terms
- Payment Methods
- Tax Types
- Tax Treatment / VAT Treatment Types
- Banks
- Bank Account Types
- Bank Types
- Cost Centers
- Profit Centers

### Units & Measurements

- UOM Categories
- Units of Measure
- UOM Conversions

### Lookup Category Additions

- AREA_TYPES
- PORT_TYPES
- SITE_TYPES
- PAYMENT_METHODS
- TAX_TREATMENT_TYPES
- BANK_ACCOUNT_TYPES
- BANK_TYPES
- COST_CENTER_TYPES
- PROFIT_CENTER_TYPES
- PROFIT_CENTER_TYPES
- UOM_FORMULA_TYPES if needed

## Explicitly Out of Scope

Do not include implementation scope for:

- full accounting module
- chart of accounts
- general ledger
- journals
- trial balance
- financial statements
- CRM module
- customer/vendor module
- HR module
- employee module
- fleet assets
- workshop job orders
- inventory item master
- procurement transactions
- HSE incident module
- DMS attachment engine
- scrap/waste/demolition operational module
- import engine
- broad app-wide hardcoded dropdown migration
- 002F.3D organization/branch completion implementation

You can mention future integration only.

## Required Final Report Structure

The completed report must include all these sections:

1. Executive Summary
2. Correction Summary From Sameer Review
3. Source Code Inspection Summary
4. Lookup vs Dedicated Table Decision Matrix
5. Phase Size Review and Recommended Sub-Phase Split
6. Database Schema Plan
7. Lookup Categories To Add
8. Permissions Plan
9. RLS Policy Plan
10. Audit Logging Plan
11. Server Actions / Services Plan
12. Validation Plan
13. UI / Screen Plan
14. Reusable Select Component Plan
15. Seed Data Plan
16. Sidebar / Menu Modification Plan
17. File Modification Plan
18. Implementation Sequence Plan
19. Testing Plan
20. Risk Analysis
21. Acceptance Criteria
22. Future Integration Notes
23. Final Recommendation

Sections 6–23 must be fully detailed.

---

# Required Details for Section 6 — Database Schema Plan

Section 6 must include table-by-table technical planning.

For each table, provide:

- purpose
- proposed table name
- fields and data types
- primary key
- foreign keys
- unique constraints
- check constraints
- indexes
- triggers
- seed data plan
- RLS summary
- permissions summary
- audit actions
- UI route
- select component, if applicable
- sub-phase assignment

Tables to include:

## Geography

1. countries
2. emirates
3. cities
4. areas_zones
5. ports
6. work_sites

## Finance Basics

7. currencies
8. payment_terms
9. tax_types
10. banks
11. cost_centers
12. profit_centers

## Units & Measurements

13. uom_categories
14. units_of_measure
15. uom_conversions

If a table should be deferred, say so clearly and explain why. But do not leave the section blank.

---

# Required Details for Section 7 — Lookup Categories To Add

For each lookup category, define:

- category_code
- category_name_en
- category_name_ar
- module_code
- category_scope
- supports_hierarchy
- supports_color
- supports_icon
- supports_effective_dates
- supports_metadata
- is_system
- is_locked
- is_active
- seed values
- where it will be used
- sub-phase assignment

Required lookup categories:

1. AREA_TYPES
2. PORT_TYPES
3. SITE_TYPES
4. PAYMENT_METHODS
5. TAX_TREATMENT_TYPES
6. BANK_ACCOUNT_TYPES
7. BANK_TYPES
8. COST_CENTER_TYPES
9. PROFIT_CENTER_TYPES
10. UOM_FORMULA_TYPES if needed

Do not duplicate existing 002F.3B lookup categories.

---

# Required Details for Section 8 — Permissions Plan

Include a complete permission matrix.

Required permissions:

```text
master_data.geography.view
master_data.geography.manage
master_data.geography.export
master_data.geography.audit_view

master_data.finance_basics.view
master_data.finance_basics.manage
master_data.finance_basics.export
master_data.finance_basics.audit_view

master_data.uom.view
master_data.uom.manage
master_data.uom.export
master_data.uom.audit_view
```

Also reuse existing:

```text
master_data.lookups.lock
```

For each permission, define:

- permission_code
- module_code
- action_code
- display_name
- description
- default role assignment
- sidebar visibility usage
- page access usage
- action button usage

Role assignment matrix:

- system_admin
- group_admin
- company_admin
- branch_admin
- normal user

Explain if normal users can still read active values through select services but cannot access admin pages.

---

# Required Details for Section 9 — RLS Policy Plan

Fully detail the RLS strategy.

Split into:

## Global shared reference tables

Examples:

- countries
- emirates
- cities
- areas_zones
- ports
- currencies
- payment_terms
- tax_types
- banks
- uom_categories
- units_of_measure
- uom_conversions

Plan:

- SELECT
- INSERT
- UPDATE
- DELETE blocked
- locked row behavior
- system row behavior
- active/inactive behavior
- normal user dropdown read access
- admin page access

## Scope-aware tables

Examples:

- work_sites
- cost_centers
- profit_centers

Plan:

- SELECT for global seed records
- SELECT for company/branch scoped records
- global admin / group admin access
- company admin scope
- branch admin scope
- INSERT scope validation
- UPDATE scope validation
- DELETE blocked
- locked row behavior

Mention compatibility with existing auth/RLS pattern and 002F.3B.

---

# Required Details for Section 10 — Audit Logging Plan

For every table, list:

- entity_name
- entity_reference
- create action
- update action
- activate/deactivate action
- lock/unlock action
- special action if any

Tables:

- countries
- emirates
- cities
- areas_zones
- ports
- work_sites
- currencies
- payment_terms
- tax_types
- banks
- cost_centers
- profit_centers
- uom_categories
- units_of_measure
- uom_conversions
- added lookup categories/values

Explain:

- old_values
- new_values
- actor user
- module_code
- owner_company_id / branch_id where relevant
- audit view permission

---

# Required Details for Section 11 — Server Actions / Services Plan

For each file, list every planned function.

Expected files:

```text
src/server/actions/master-data/geography.ts
src/server/actions/master-data/finance-basics.ts
src/server/actions/master-data/uom.ts
```

For each function, include:

- function name
- input
- output
- permission required
- validation schema
- audit action
- revalidatePath targets
- RLS expectation
- error handling

At minimum, for each table:

- list
- getById
- create
- update
- toggleStatus
- toggleLock
- export if applicable
- safe select/dropdown list if applicable

Examples:

```text
listCountries
getCountryById
createCountry
updateCountry
toggleCountryStatus
toggleCountryLock
getActiveCountriesForSelect
exportCountries
```

Repeat for every table.

---

# Required Details for Section 12 — Validation Plan

Provide table-by-table validation rules.

Required tables:

- countries
- emirates
- cities
- areas_zones
- ports
- work_sites
- currencies
- payment_terms
- tax_types
- banks
- cost_centers
- profit_centers
- uom_categories
- units_of_measure
- uom_conversions

Include:

- field requirements
- uppercase codes
- ISO format validation
- phone code validation
- SWIFT validation
- decimal range validation
- percentage range validation
- date range validation
- FK validation
- one base currency rule
- one base UOM per category rule
- no self-parent rule
- duplicate pair prevention
- company/branch scope validation

---

# Required Details for Section 13 — UI / Screen Plan

For every page, include:

- route
- permission
- page title
- table columns
- filters
- search fields
- row actions
- toolbar actions
- drawer form sections
- form fields
- read-only audit fields
- export behavior
- import behavior if any
- locked/system indicators

Required pages:

## Geography

- /admin/master-data/geography/countries
- /admin/master-data/geography/emirates
- /admin/master-data/geography/cities
- /admin/master-data/geography/areas
- /admin/master-data/geography/ports
- /admin/master-data/geography/sites

## Finance Basics

- /admin/master-data/finance/currencies
- /admin/master-data/finance/payment-terms
- /admin/master-data/finance/payment-methods
- /admin/master-data/finance/tax-types
- /admin/master-data/finance/banks
- /admin/master-data/finance/bank-account-types
- /admin/master-data/finance/cost-centers
- /admin/master-data/finance/profit-centers

## Units & Measurements

- /admin/master-data/uom/categories
- /admin/master-data/uom/units
- /admin/master-data/uom/conversions

If payment methods and bank account types are lookup-backed pages, explain whether they reuse 002F.3B Lookup Values page with filtered category or have convenience pages.

---

# Required Details for Section 14 — Reusable Select Component Plan

Define each select component:

- CountrySelect
- EmirateSelect
- CitySelect
- AreaZoneSelect
- PortSelect
- WorkSiteSelect
- CurrencySelect
- PaymentTermSelect
- PaymentMethodSelect
- TaxTypeSelect
- TaxTreatmentSelect
- BankSelect
- BankAccountTypeSelect
- CostCenterSelect
- ProfitCenterSelect
- UOMCategorySelect
- UOMSelect
- UOMConversionSelect if needed

For each component, define:

- source table or lookup category
- props
- filters
- active-only behavior
- normal user access
- admin usage
- loading state
- empty state
- error state
- caching/revalidation approach
- whether it wraps LookupSelect or uses dedicated table service

---

# Required Details for Section 15 — Seed Data Plan

Create complete seed matrices.

Include:

## Countries

At least:

- UAE
- Saudi Arabia
- Oman
- Qatar
- Bahrain
- Kuwait
- Jordan
- India
- Pakistan
- Philippines
- Bangladesh
- Nepal
- Sri Lanka
- Egypt
- Syria
- Lebanon
- United Kingdom
- United States
- China
- Japan
- Germany
- Italy
- France
- Turkey
- Australia

Fields:

- ISO2
- ISO3
- name EN
- name AR if possible
- nationality EN
- phone code
- default currency
- GCC
- UAE
- sort order

## Emirates

All 7 UAE emirates.

## Cities

Minimum key UAE cities/locations.

## Areas / Zones

Minimum key UAE industrial/free zone areas.

## Ports

Major UAE ports.

## Currencies

AED, USD, EUR, GBP, SAR, QAR, OMR, BHD, KWD, JOD, INR, PKR, PHP, CNY, JPY.

## Payment Terms

ADVANCE_100, ADVANCE_50_BALANCE_50, NET_7, NET_15, NET_30, NET_60, COD, AGAINST_INVOICE, AGAINST_DELIVERY.

## Payment Methods

Lookup values.

## Tax Types

VAT_5, VAT_ZERO, VAT_EXEMPT, RCM_SCRAP, OUT_OF_SCOPE.

## Banks

Major UAE banks.

## Bank Account Types

Lookup values.

## Cost Centers

ADMIN, OPERATIONS, FLEET, WORKSHOP, HR, SALES, HSE, SCRAP, DEMOLITION.

## Profit Centers

TRANSPORT, EQUIPMENT_RENTAL, SCRAP_TRADING, DEMOLITION, WASTE_MANAGEMENT, CRM_SALES.

## UOM Categories

Length, Weight, Volume, Area, Fuel, Time, Count.

## Units

All approved units, including GAL_IMP and GAL_US.

## UOM Conversions

All key conversions, including imperial gallon to liter.

State which seeds are `is_system`, `is_locked`, and `is_active`.

---

# Required Details for Section 16 — Sidebar / Menu Modification Plan

Define final sidebar structure for implemented sub-phases.

Do not add HR/CRM/Fleet/HSE/Scrap menus.

Add only as sub-phases are implemented:

## After 002F.3C.1

```text
Master Data
└── Geography & Locations
    ├── Countries
    ├── Emirates
    ├── Cities
    ├── Areas / Zones
    ├── Ports
    └── Work Sites
```

## After 002F.3C.2

```text
Master Data
└── Finance Basics
    ├── Currencies
    ├── Payment Terms
    ├── Payment Methods
    ├── Tax Types
    ├── Banks
    ├── Bank Account Types
    ├── Cost Centers
    └── Profit Centers
```

## After 002F.3C.3

```text
Master Data
└── Units & Measurements
    ├── UOM Categories
    ├── Units of Measure
    └── UOM Conversions
```

## After 002F.3C.4

final integration/sidebar cleanup.

Explain permissions for menu visibility.

---

# Required Details for Section 17 — File Modification Plan

List expected files by sub-phase.

For each sub-phase, list:

- migration file
- server actions
- types
- validation
- hooks
- select components
- table components
- drawer form components
- pages
- sidebar changes
- reports

Use likely folder names and route names.

---

# Required Details for Section 18 — Implementation Sequence Plan

Provide step-by-step implementation sequence by sub-phase.

For each sub-phase include:

- objective
- prerequisites
- implementation steps
- validation steps
- report file name
- go/no-go gate

Sub-phases:

- 002F.3C.1 Geography & Locations
- 002F.3C.2 Finance Basics
- 002F.3C.3 Units & Measurements
- 002F.3C.4 Integration / Sidebar / Select Components / QA

---

# Required Details for Section 19 — Testing Plan

Include:

## Database tests

- migration
- tables
- constraints
- FKs
- seed data
- triggers
- RLS

## Permission tests

- system_admin
- group_admin
- company_admin
- branch_admin
- normal user

## RLS tests

- read access
- manage access
- lock access
- delete blocked
- company/branch scope

## UI tests

- every page loads
- add/edit/view drawer
- filters/search
- export
- lock/unlock
- activate/deactivate

## Select component tests

- all select components
- filters
- dependent dropdowns
- active-only
- normal user access

## Integration tests

- organization/branch future readiness
- UOM future readiness
- finance basics future readiness

## Build tests

- typecheck
- lint
- build
- tests
- Playwright if available

---

# Required Details for Section 20 — Risk Analysis

List each risk with:

- risk
- impact
- likelihood
- mitigation
- sub-phase affected

Required risks:

- over-scoping
- seed data mistakes
- UAE mapping mistakes
- UOM conversion mistakes
- tax/VAT/RCM confusion
- accidentally implementing accounting
- RLS too strict
- RLS too loose
- menu clutter
- breaking 002F.3B
- breaking organization/branch pages
- hardcoded old fields not migrated yet
- duplicate codes
- parent hierarchy loops
- wrong base currency/base unit handling
- too many files at once

---

# Required Details for Section 21 — Acceptance Criteria

Use future checkboxes `[ ]`.

Provide acceptance criteria for:

- full 002F.3C
- 002F.3C.1
- 002F.3C.2
- 002F.3C.3
- 002F.3C.4

Include:

- technical plan approved
- migration created
- tables created
- seeds created
- lookup categories added
- permissions added
- RLS implemented
- audit implemented
- pages implemented
- sidebar updated
- select components created
- tests passed
- implementation report generated
- Sameer review completed

---

# Required Details for Section 22 — Future Integration Notes

Explain how 002F.3C supports:

- 002F.3D organization/branch completion
- 002F.3E people/contacts/CRM
- 002F.3F HR
- 002F.3G fleet/equipment
- 002F.3H workshop/inventory/procurement
- 002F.3I basic HSE/DMS/compliance
- 002F.3J scrap/waste/demolition

Include exact examples.

---

# Required Details for Section 23 — Final Recommendation

End with:

- readiness status
- final recommended split
- whether implementation can start
- any decisions needed from Sameer
- exact next prompt name after approval

Recommended next prompt after approval:

```text
PROMPT_ERP_BASE_002F_3C_1_IMPLEMENT_GEOGRAPHY_LOCATIONS.md
```

Do not recommend implementing all 002F.3C at once unless you provide strong justification.

Final status must be one of:

```text
READY FOR SAMEER REVIEW — Technical plan corrected and complete.
NEEDS USER DECISION — Specific decisions required.
BLOCKED — Could not complete revision safely.
```

---

# Important Final Instruction

Create the complete final technical plan file:

`ERP_BASE_002F_3C_CORE_UAE_SHARED_MASTER_DATA_TECHNICAL_IMPLEMENTATION_PLAN_REV2_COMPLETE.md`

Do not implement.

Do not create migrations.

Do not create UI files.

Do not modify app files.

Do not leave any section incomplete.

Do not stop after Sections 1–5 again.
