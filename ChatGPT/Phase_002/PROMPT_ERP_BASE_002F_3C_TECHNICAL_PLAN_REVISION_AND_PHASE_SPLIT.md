# PROMPT_ERP_BASE_002F_3C_TECHNICAL_PLAN_REVISION_AND_PHASE_SPLIT

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, notification-engine validation specialist, enterprise ERP solution architect, UAE business compliance analyst, master data governance consultant, and senior Next.js/Supabase implementation planner.

## Phase

ERP BASE 002F.3C — Core UAE Shared Master Data Technical Plan Revision and Phase Split

## Purpose

Revise and correct the existing technical implementation plan:

`ERP_BASE_002F_3C_CORE_UAE_SHARED_MASTER_DATA_TECHNICAL_IMPLEMENTATION_PLAN.md`

This is a correction and revision prompt only.

Do not implement code.

Do not create migrations.

Do not modify database schema.

Do not create UI screens.

Do not modify application source files.

Do not start implementation.

Your task is to produce a corrected and expanded REV1 technical implementation plan that is complete, detailed, and ready for Sameer review.

## Required Output File

Create only this revised markdown report:

`ERP_BASE_002F_3C_CORE_UAE_SHARED_MASTER_DATA_TECHNICAL_IMPLEMENTATION_PLAN_REV1.md`

## Background

The existing 002F.3C technical plan is directionally good and covers the correct scope:

- Geography & Locations
- Finance Basics / Commercial Readiness
- Units & Measurements
- UAE-specific seed data
- No accounting module
- No CRM implementation
- No HR implementation
- No Fleet implementation
- No HSE implementation
- No DMS implementation
- No Scrap/Waste/Demolition implementation

However, Sameer’s review found that the plan is not yet complete enough to approve for implementation because Sections 9–21 are summarized instead of fully detailed.

The existing file says Sections 9–21 are summarized “for brevity”. This is not acceptable for final technical planning.

The revised plan must expand Sections 9–21 fully, with the same depth and implementation clarity used in the approved 002F.3B plan.

## Required Corrections

### Correction 1 — Expand Sections 9–21 Fully

Do not summarize.

Do not say “full details provided separately”.

Do not leave implementation teams to infer details.

The revised plan must fully expand:

9. Server Actions / Services Plan  
10. Validation Plan  
11. UI / Screen Plan  
12. Reusable Component / Shared Pattern Plan  
13. Seed Data Plan  
14. Sidebar / Menu Modification Plan  
15. File Modification Plan  
16. Implementation Sequence Plan  
17. Testing Plan  
18. Risk Analysis  
19. Acceptance Criteria  
20. Future Integration Notes  
21. Final Recommendation  

Each section must be detailed, actionable, and implementation-ready.

### Correction 2 — Evaluate Phase Size and Split Into Safer Sub-Phases

The current plan may be too large for one implementation phase because it proposes approximately:

- 15 dedicated admin pages
- 15 forms
- 15 tables/components
- many dedicated tables
- many seed records
- many select components
- many RLS policies
- many server actions

This may cause implementation problems if done in one step.

The revised plan must evaluate whether 002F.3C should be split into smaller sub-phases.

Recommended split:

```text
002F.3C.1 — Geography & Locations
002F.3C.2 — Finance Basics / Commercial Readiness
002F.3C.3 — Units & Measurements
002F.3C.4 — Integration, Sidebar, QA, and Readiness Review
```

The revised plan must include:

- recommendation whether to split or keep one phase
- pros and cons
- final recommended implementation sequence
- exact scope of each sub-phase
- files/tables/screens per sub-phase
- permissions/RLS per sub-phase
- acceptance criteria per sub-phase
- final readiness gate

### Correction 3 — Keep Scope Tight

The revised plan must confirm again:

Do not implement:

- full accounting
- chart of accounts
- general ledger
- journal entries
- customers/vendors module
- CRM module
- HR module
- Fleet module
- HSE module
- DMS module
- Scrap/Waste/Demolition module
- operational project/site transaction module
- import engine
- global hardcoded dropdown migration across the app

002F.3C is only:

- Core UAE Geography & Locations
- Finance Basics / Commercial Readiness master data
- Units & Measurements
- Related lookup category additions
- Related select components
- Sidebar/menu entries for the implemented pages
- permissions/RLS/audit/export/test/report

### Correction 4 — Make Acceptance Criteria Future Checkboxes

The acceptance criteria must use future checklist format:

```text
[ ] Migration created and applied
[ ] Countries table created
```

Do not use `[x]` because this is a technical plan, not an implementation report.

### Correction 5 — Add Detailed Permission Matrix

The revised plan must include a complete permission matrix for all 002F.3C menus/pages.

At minimum, include:

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

Also specify:

- role assignments
- sidebar visibility
- page access
- create/edit/deactivate access
- export access
- audit visibility
- lock/unlock behavior using existing `master_data.lookups.lock`

### Correction 6 — Add Detailed RLS Strategy Per Table Group

The revised plan must include table-specific RLS strategy for:

## Global shared reference data

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

## Scope-aware operational master data

Examples:

- work_sites
- cost_centers
- profit_centers

For each RLS category define:

- read policy
- insert policy
- update policy
- delete policy / no delete
- locked row behavior
- system row behavior
- company/branch scoping if applicable
- whether normal valid ERP users can read active records for dropdowns
- admin page permission requirements

### Correction 7 — Add Detailed Server Action Plan

The revised plan must fully detail server action files and functions.

Expected files:

```text
src/server/actions/master-data/geography.ts
src/server/actions/master-data/finance-basics.ts
src/server/actions/master-data/uom.ts
```

For every table, list planned functions:

- list
- getById
- create
- update
- toggleStatus
- toggleLock
- export if applicable
- safe select/dropdown service if needed

For each function specify:

- input
- output
- validation
- permission required
- RLS expectation
- audit action
- revalidatePath targets
- error handling

### Correction 8 — Add Detailed Validation Plan

For every table, define Zod validation rules.

Include at minimum:

## countries

- ISO2 exactly 2 uppercase letters
- ISO3 exactly 3 uppercase letters
- phone code format
- currency code format
- country name required
- only one UAE flag true if practical

## emirates

- emirate_code uppercase
- country must be UAE
- unique emirate code

## cities

- city_code uppercase
- country required
- emirate required for UAE cities
- unique city code within country/emirate

## areas_zones

- area_code uppercase
- country required
- city required if possible
- booleans for free zone / industrial / port area

## ports

- port_code uppercase
- country required
- port type lookup
- operator optional

## work_sites

- site_code uppercase
- site_name required
- valid latitude/longitude ranges
- site type lookup

## currencies

- currency_code exactly 3 uppercase letters
- decimal_places 0–6
- only one base currency true

## payment_terms

- code uppercase
- due_days >= 0
- advance_percentage 0–100
- retention_percentage 0–100

## tax_types

- tax_rate 0–100
- effective dates valid
- reverse charge flags

## banks

- bank_code uppercase
- SWIFT format if provided
- country required

## cost_centers / profit_centers

- code uppercase
- unique within scope
- parent not self
- scope validation

## uom_categories

- code uppercase
- name required

## units_of_measure

- uom_code uppercase
- category required
- conversion_factor_to_base > 0
- decimal_precision 0–6
- only one base unit per category if practical

## uom_conversions

- from_uom != to_uom
- conversion_factor > 0
- duplicate pair not allowed

### Correction 9 — Add Full UI / Screen Plan

For every planned page, include:

- route
- permission
- table columns
- filters
- search
- drawer sections
- form fields
- actions
- export
- audit/read-only fields
- system/locked indicators

Required page groups:

## Geography & Locations

- Countries
- Emirates
- Cities
- Areas / Zones
- Ports
- Work Sites

## Finance Basics

- Currencies
- Payment Terms
- Payment Methods
- Tax Types
- Banks
- Bank Account Types
- Cost Centers
- Profit Centers

## Units & Measurements

- UOM Categories
- Units of Measure
- UOM Conversions

If some pages should be deferred, clearly state why and in which sub-phase they belong.

### Correction 10 — Add Select Component Plan

The revised plan must define reusable select components and whether they use LookupSelect or dedicated-table services.

Examples:

- CountrySelect
- EmirateSelect
- CitySelect
- AreaZoneSelect
- PortSelect
- WorkSiteSelect
- CurrencySelect
- PaymentTermSelect
- PaymentMethodSelect using LookupSelect
- TaxTypeSelect
- TaxTreatmentSelect using LookupSelect
- BankSelect
- BankAccountTypeSelect using LookupSelect
- CostCenterSelect
- ProfitCenterSelect
- UOMCategorySelect
- UOMSelect
- UOMConversionSelect if needed

For each, define:

- source table or lookup category
- props
- filtering
- active-only behavior
- normal-user dropdown access
- admin usage
- caching/revalidation

### Correction 11 — Add Full Seed Data Matrix

The revised plan must include complete seed matrix.

Seed data must be UAE-style and practical.

Include:

## Countries

List all planned seed countries with:

- ISO2
- ISO3
- name EN
- name AR if possible
- nationality EN
- phone code
- default currency
- GCC flag
- UAE flag

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

Include advance, net, COD, against invoice/delivery.

## Payment Methods

Lookup values.

## Tax Types

VAT_5, VAT_ZERO, VAT_EXEMPT, RCM_SCRAP, OUT_OF_SCOPE.

## Banks

Major UAE banks.

## Bank Account Types

Lookup values.

## Cost Centers

Initial general operational centers.

## Profit Centers

Alliance business revenue centers.

## UOM Categories

Length, Weight, Volume, Area, Fuel, Time, Count.

## Units

Meters, centimeters, millimeters, kilometers, kg, ton, gram, liter, m3, imperial gallon, US gallon, sqm, sqft, hour, day, month, year, pcs, set, trip, load, job.

## UOM Conversions

All key conversions, including imperial gallon to liter.

### Correction 12 — Add Detailed File Modification Plan

List expected files to create and modify.

Include:

- migration files
- server actions
- types
- validation
- hooks
- select components
- table components
- drawer form components
- pages
- sidebar
- reports

Also recommend sub-folder structure.

### Correction 13 — Add Detailed Testing Plan

The revised plan must include:

- database tests
- seed tests
- FK tests
- constraint tests
- RLS tests
- permission tests
- UI tests
- select component tests
- integration tests
- export tests
- audit tests
- build/typecheck/lint tests
- performance tests if needed

### Correction 14 — Add Detailed Risk Analysis

Include risks and mitigation:

- over-scoping
- too many pages at once
- seed data mistakes
- UAE mapping mistakes
- UOM conversion mistakes
- tax/VAT/RCM confusion
- accidentally implementing accounting
- RLS too strict
- RLS too loose
- menu clutter
- breaking existing 002F.3B
- breaking organization/branch pages
- old hardcoded fields not migrated yet
- duplicate codes
- parent hierarchy loops
- wrong base currency/base unit handling

### Correction 15 — Add Clear Final Recommendation

At the end, provide:

- readiness status
- whether implementation can start
- recommended split or no split
- decisions needed from Sameer
- exact next prompt filename to generate after approval

Final status must be one of:

```text
READY FOR SAMEER REVIEW — Technical plan corrected and complete.
NEEDS USER DECISION — Specific decisions required.
BLOCKED — Could not complete revision safely.
```

---

# Required Output Structure

The revised report must include these sections:

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

## Important Output Rules

- Do not implement.
- Do not create migrations.
- Do not create source files.
- Do not modify app files.
- Do not leave sections summarized.
- Use future checklist format `[ ]`.
- Be very detailed.
- Make it ready for implementation approval.

## Final Instruction

Create the revised technical implementation plan file only:

`ERP_BASE_002F_3C_CORE_UAE_SHARED_MASTER_DATA_TECHNICAL_IMPLEMENTATION_PLAN_REV1.md`
