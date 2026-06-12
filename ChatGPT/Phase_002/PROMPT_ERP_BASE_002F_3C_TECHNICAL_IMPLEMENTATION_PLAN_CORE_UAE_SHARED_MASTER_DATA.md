# PROMPT_ERP_BASE_002F_3C_TECHNICAL_IMPLEMENTATION_PLAN_CORE_UAE_SHARED_MASTER_DATA

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, notification-engine validation specialist, enterprise ERP solution architect, UAE business compliance analyst, master data governance consultant, and senior Next.js/Supabase implementation planner.

## Phase

ERP BASE 002F.3C — Core UAE Shared Master Data Technical Implementation Plan

## Prompt Purpose

This prompt is for **technical implementation planning only**.

Do not implement code.

Do not create migration files.

Do not modify database schema.

Do not create UI screens.

Do not change existing source files.

Do not start coding.

Your task is to inspect the existing ERP source code and produce a deep, detailed, implementation-ready technical plan for ERP BASE 002F.3C.

The next step after Sameer approves your technical implementation plan will be a separate implementation prompt.

## Required Output File

Create only this markdown file:

`ERP_BASE_002F_3C_CORE_UAE_SHARED_MASTER_DATA_TECHNICAL_IMPLEMENTATION_PLAN.md`

This file must be detailed enough that implementation can be done smoothly, safely, and fully in the next prompt.

## Project Context

ERP BASE 002F.3B — Global Lookup / Dropdown Engine is now approved with PASS WITH NOTES.

002F.3B implemented:

- `global_lookup_categories`
- `global_lookup_values`
- 13 foundation lookup categories
- 70 foundation lookup values
- `LookupSelect`
- Master Data Dashboard
- Lookup Categories page
- Lookup Values page
- Locked System Values page
- Master Data sidebar integration
- 7 permissions
- RLS
- audit logging
- export support
- import deferred

This phase must build on top of 002F.3B and use its lookup/dropdown engine where suitable.

Approved master data implementation sequence:

1. 002F.3B — Global Lookup / Dropdown Engine — APPROVED
2. 002F.3C — Core UAE Shared Master Data — CURRENT PLANNING PHASE
3. 002F.3D — Organization / Branch Completion
4. 002F.3E — People / Contacts / CRM Foundation
5. 002F.3F — HR Master Data
6. 002F.3G — Fleet / Equipment Master Data
7. 002F.3H — Workshop / Inventory / Procurement Master Data
8. 002F.3I — Basic HSE / DMS / Compliance Master Data
9. 002F.3J — Scrap / Waste / Demolition Master Data
10. 002F.3K — Master Data QA / Permissions / Readiness Gate

This prompt is only for:

**ERP BASE 002F.3C — Core UAE Shared Master Data**

## Important User Decisions

Sameer confirmed:

1. Do not implement full accounting module now.
2. Only Finance Basics should be included now.
3. HSE is basic only and later.
4. CRM will be implemented later.
5. Master data must be implemented in phases.
6. Master data menu/sidebar must be proper hierarchical style.
7. Master data must be UAE-compatible.
8. Every master data page must integrate with existing roles and permissions.
9. Every new table must have RLS.
10. Every future module requiring autonumbering must use the existing ERP BASE 002F.2 Global Numbering System.
11. Normal document numbers must remain simple like EMP-0001, PO-0001, INV-0001.
12. Do not include company/branch/year/month/day in normal document numbers unless requested later.
13. 002F.3C should not implement accounting module.

## Main Objective of 002F.3C

Plan the implementation of the core shared UAE master data required by all future modules.

This phase should prepare foundational shared data for:

- organization/branch completion
- people and contacts
- CRM
- HR
- fleet
- workshop
- inventory
- procurement
- basic HSE
- DMS
- scrap/waste/demolition
- reporting and filtering
- UAE compliance

## Approved Scope of 002F.3C

Plan implementation for:

### Geography / Location

1. Countries
2. Emirates
3. Cities
4. Areas / Zones
5. Ports
6. Work Sites / Site Locations if appropriate for this phase

### Finance Basics / Commercial Readiness

7. Currencies
8. Exchange Rate Sources or placeholder
9. Payment Terms
10. Payment Methods
11. Tax Types
12. VAT Categories
13. Banks
14. Bank Account Types
15. Cost Centers
16. Profit Centers

### Units & Measurements

17. UOM Categories
18. Units of Measure
19. UOM Conversions

### Core Shared Lookup Expansion

20. Core status/priority/approval lookups if not already covered
21. UAE business lookup values needed now
22. Shared operational lookup values needed by 002F.3D and later

## Explicitly Out of Scope for 002F.3C

Do not implement or plan detailed build for:

- Full accounting module
- Chart of accounts
- General ledger
- Journal entries
- Trial balance
- Financial statements
- Customers
- Vendors
- CRM screens
- HR employee module
- Fleet assets
- Workshop job orders
- Inventory item master
- Procurement transactions
- HSE incident module
- DMS attachment engine
- Scrap/waste/demolition operational modules
- Import engine
- Existing hardcoded dropdown migration across the full app
- 002F.3D organization/branch completion implementation

You may plan dependencies for later phases, but do not include them as implementation scope for 002F.3C.

## Required Planning Quality

The output must be as detailed and structured as the 002F.3B technical plan.

It must include:

- source inspection
- database schema plan
- table-by-table details
- lookup-vs-dedicated-table decisions
- seed data details
- UAE-specific seed values
- permissions
- RLS
- audit
- server actions
- validation
- UI screens
- sidebar/menu changes
- reusable components
- testing
- risks
- acceptance criteria
- implementation sequence

Do not write a short summary.

Do not leave any section generic.

---

# 1. Source Inspection Requirements

Before writing the plan, inspect the actual source code and database.

Review:

## 002F.3B Lookup Engine

- lookup migration file
- lookup tables
- lookup server actions
- LookupSelect
- lookup pages
- sidebar additions
- lookup permissions and RLS

## Existing Foundation

- owner_companies
- branches
- users / user_profiles
- roles
- permissions
- role_permissions
- RLS helper functions
- audit_logs
- global numbering engine
- app sidebar
- ERPDrawerForm
- ERPDataTable
- ERPPageHeader
- ERPExportMenu
- server action patterns
- Zod validation patterns

## Existing Hardcoded Fields

Inspect current organization/branch fields that should later relate to 002F.3C:

- country
- emirate
- city
- area
- default_currency
- status
- payment terms if any
- tax/VAT fields if any
- address fields
- phone/email fields

Do not migrate them in this phase unless required and safe. Plan the approach.

---

# 2. Required Technical Plan Sections

Your output file must include all sections below.

---

## 1. Executive Summary

Include:

- purpose of 002F.3C
- why core UAE shared master data is next after lookup engine
- what will be implemented
- what will not be implemented
- how this supports future phases
- readiness status for implementation

---

## 2. Existing Source Code Inspection Summary

Create a table:

| Area | Files/Tables Inspected | Current Pattern Found | Impact on 002F.3C |
|---|---|---|---|

Include at least:

- 002F.3B lookup engine
- database migrations
- permissions
- RLS
- audit logs
- sidebar
- admin routes
- drawer forms
- data tables
- export menu
- server actions
- Zod validation
- organization/branch tables
- current hardcoded geography/currency/status fields

---

## 3. Lookup vs Dedicated Table Decision Matrix

For every item in 002F.3C, classify as:

- Dedicated Table
- Global Lookup Category / Values
- Existing Table Enhancement
- Future Placeholder
- System Configuration

Required matrix columns:

| Master Data Item | Recommended Type | Proposed Table / Lookup Category | Why | Used By Future Modules | Implementation Priority |
|---|---|---|---|---|---|

Required items to classify:

- Countries
- Emirates
- Cities
- Areas / Zones
- Ports
- Work Sites
- Currencies
- Exchange Rate Sources
- Payment Terms
- Payment Methods
- Tax Types
- VAT Categories
- Banks
- Bank Account Types
- Cost Centers
- Profit Centers
- UOM Categories
- Units of Measure
- UOM Conversions
- Core status values
- Address types
- Site types
- Port types
- Tax treatment types

---

## 4. Proposed Database Schema Plan

Plan the database schema table by table.

Use BIGINT PKs unless existing project convention proves otherwise.

Use standard audit fields:

- created_at
- created_by
- updated_at
- updated_by
- deactivated_at
- deactivated_by
- deactivation_reason

Use active/inactive instead of hard delete.

Use `is_system` and `is_locked` where suitable.

Use RLS.

Use audit logging.

## 4.1 Table: countries

Define:

- purpose
- fields
- constraints
- indexes
- seed data
- RLS
- permissions
- audit
- UI usage

Fields to consider:

- id
- country_code_iso2
- country_code_iso3
- country_name_en
- country_name_ar
- nationality_en
- nationality_ar
- phone_code
- default_currency_code
- is_gcc
- is_uae
- is_active
- is_system
- is_locked
- sort_order
- audit/deactivation fields

Seed at minimum:

- United Arab Emirates
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

The seed list may be adjusted if too large, but UAE and key labor/vendor countries must be included.

## 4.2 Table: emirates

Define:

- purpose
- fields
- constraints
- indexes
- seed data
- RLS
- permissions
- audit

Fields:

- id
- country_id references countries
- emirate_code
- emirate_name_en
- emirate_name_ar
- is_active
- is_system
- is_locked
- sort_order
- audit/deactivation fields

Seed the 7 UAE emirates:

- Abu Dhabi
- Dubai
- Sharjah
- Ajman
- Umm Al Quwain
- Ras Al Khaimah
- Fujairah

Codes:

- AUH
- DXB
- SHJ
- AJM
- UAQ
- RAK
- FUJ

## 4.3 Table: cities

Define:

- purpose
- fields
- constraints
- indexes
- seed data
- RLS
- permissions
- audit

Fields:

- id
- country_id references countries
- emirate_id references emirates nullable
- city_code
- city_name_en
- city_name_ar
- is_capital
- is_active
- is_system
- is_locked
- sort_order
- audit/deactivation fields

Seed key UAE cities / locations:

- Abu Dhabi
- Dubai
- Sharjah
- Ajman
- Al Ain
- Mussafah
- ICAD
- Khalifa City
- Ruwais
- Taweelah
- Al Dhafra
- Jebel Ali
- Hamriyah
- Ras Al Khaimah
- Fujairah

Use correct emirate links.

## 4.4 Table: areas_zones

Define whether to implement now or defer.

If implemented, fields:

- id
- country_id
- emirate_id
- city_id
- area_code
- area_name_en
- area_name_ar
- area_type lookup
- is_free_zone
- is_industrial_area
- is_port_area
- is_active
- is_system
- is_locked
- sort_order
- audit/deactivation fields

Seed key areas/zones if approved:

- Mussafah
- ICAD
- Khalifa Industrial Zone / KIZAD
- Jebel Ali Free Zone
- Hamriyah Free Zone
- Al Quoz
- Dubai Industrial City
- Ruwais Industrial Area
- Taweelah
- Mafraq
- Al Markaz if relevant

If too much for 002F.3C, recommend seed minimum only.

## 4.5 Table: ports

Define whether to implement now or defer.

Fields:

- id
- country_id
- emirate_id
- city_id
- port_code
- port_name_en
- port_name_ar
- port_type lookup
- operator_name
- is_active
- is_system
- is_locked
- sort_order
- audit/deactivation fields

Seed if included:

- Khalifa Port
- Zayed Port
- Jebel Ali Port
- Hamriyah Port
- Fujairah Port
- Mina Saqr
- Port Rashid

## 4.6 Table: work_sites

Plan carefully.

This may be useful later for projects/operations, but may also belong in operations module.

Decide whether 002F.3C should create:

- a basic reusable `work_sites` master table, or
- defer to project/operations phase.

If planning table, fields:

- id
- site_code
- site_name_en
- site_name_ar
- site_type lookup
- customer/vendor link later nullable
- country_id
- emirate_id
- city_id
- area_zone_id
- latitude
- longitude
- address
- is_active
- audit/deactivation fields

Recommend if it should be 002F.3C or later.

## 4.7 Table: currencies

Define:

- purpose
- fields
- constraints
- indexes
- seed data
- RLS
- permissions
- audit

Fields:

- id
- currency_code
- currency_name_en
- currency_name_ar
- symbol
- decimal_places
- is_base_currency
- is_active
- is_system
- is_locked
- sort_order
- audit/deactivation fields

Seed:

- AED as base currency
- USD
- EUR
- GBP
- SAR
- QAR
- OMR
- BHD
- KWD
- JOD
- INR
- PKR
- PHP
- CNY
- JPY

No full accounting module.

## 4.8 Exchange Rate Source / Placeholder

Decide whether to implement:

- exchange_rate_sources table
- or lookup category EXCHANGE_RATE_SOURCES
- or defer until finance module.

Recommended for now:

- create lookup category or simple table only if needed.
- Do not implement actual exchange rate engine.

## 4.9 Table: payment_terms

Fields:

- id
- payment_term_code
- payment_term_name_en
- payment_term_name_ar
- due_days
- advance_percentage
- retention_percentage
- description
- is_active
- is_system
- is_locked
- sort_order
- audit/deactivation fields

Seed examples:

- ADVANCE_100
- ADVANCE_50_BALANCE_50
- NET_7
- NET_15
- NET_30
- NET_60
- COD
- AGAINST_INVOICE
- AGAINST_DELIVERY

## 4.10 Payment Methods

Decide if global lookup is enough.

Recommended lookup category:

PAYMENT_METHODS

Seed:

- CASH
- CHEQUE
- BANK_TRANSFER
- ONLINE_TRANSFER
- CREDIT_CARD
- DEBIT_CARD
- LC
- PDC
- WPS if payroll later, but maybe not here.

## 4.11 Table: tax_types

Fields:

- id
- tax_code
- tax_name_en
- tax_name_ar
- tax_rate
- tax_category lookup
- is_vat
- is_reverse_charge
- applies_to_sales
- applies_to_purchase
- applies_to_scrap
- effective_from
- effective_to
- is_active
- is_system
- is_locked
- sort_order
- audit/deactivation fields

Seed:

- VAT_5
- VAT_ZERO
- VAT_EXEMPT
- RCM_SCRAP
- OUT_OF_SCOPE

Do not implement full tax accounting.

## 4.12 VAT Categories / Tax Treatment

Decide if separate `vat_categories` table or lookup.

Recommended:

- VAT categories can be lookup if simple.
- Tax types should be dedicated table because they include rate/effective dates/reverse charge flags.

Lookup category:

VAT_TREATMENT_TYPES or TAX_TREATMENT_TYPES

Seed:

- STANDARD_RATED
- ZERO_RATED
- EXEMPT
- OUT_OF_SCOPE
- REVERSE_CHARGE

## 4.13 Table: banks

Fields:

- id
- bank_code
- bank_name_en
- bank_name_ar
- swift_code
- country_id
- bank_type lookup
- website
- is_active
- is_system
- is_locked
- sort_order
- audit/deactivation fields

Seed UAE banks:

- FAB
- ADCB
- ADIB
- Emirates NBD
- Dubai Islamic Bank
- Mashreq
- RAKBANK
- Commercial Bank of Dubai
- HSBC UAE
- Standard Chartered UAE

## 4.14 Bank Account Types

Recommended lookup category:

BANK_ACCOUNT_TYPES

Seed:

- CURRENT
- SAVINGS
- CALL_ACCOUNT
- FIXED_DEPOSIT
- LC_ACCOUNT
- GUARANTEE_ACCOUNT

## 4.15 Table: cost_centers

Fields:

- id
- cost_center_code
- cost_center_name_en
- cost_center_name_ar
- owner_company_id nullable
- branch_id nullable
- parent_cost_center_id nullable
- cost_center_type lookup
- responsible_person_id nullable future
- is_active
- is_system
- is_locked
- sort_order
- audit/deactivation fields

Seed minimal generic examples if appropriate:

- ADMIN
- OPERATIONS
- FLEET
- WORKSHOP
- HR
- SALES
- HSE
- SCRAP
- DEMOLITION

Decide whether to make company-specific or global initially.

## 4.16 Table: profit_centers

Fields similar to cost centers.

Decide whether to implement now or defer.

Recommended:

- implement basic table if needed.
- seed minimal:
  - TRANSPORT
  - EQUIPMENT_RENTAL
  - SCRAP_TRADING
  - DEMOLITION
  - WASTE_MANAGEMENT
  - CRM_SALES

No accounting module; this is reporting readiness only.

## 4.17 Table: uom_categories

Fields:

- id
- uom_category_code
- uom_category_name_en
- uom_category_name_ar
- base_unit_code
- description
- is_active
- is_system
- is_locked
- sort_order
- audit/deactivation fields

Seed:

- LENGTH
- WEIGHT
- VOLUME
- AREA
- FUEL
- TIME
- COUNT
- CURRENCY maybe no
- TEMPERATURE if needed

## 4.18 Table: units_of_measure

Fields:

- id
- uom_category_id
- uom_code
- uom_name_en
- uom_name_ar
- symbol
- is_base_unit
- conversion_factor_to_base
- decimal_precision
- is_active
- is_system
- is_locked
- sort_order
- audit/deactivation fields

Seed:

Length:
- M
- CM
- MM
- KM

Weight:
- KG
- TON
- G

Volume:
- L
- M3
- GAL_IMP
- GAL_US

Area:
- SQM
- SQFT

Time:
- HOUR
- DAY
- MONTH
- YEAR

Count:
- PCS
- SET
- TRIP
- LOAD
- JOB

Fuel:
- L
- GAL_IMP
- GAL_US

Important UAE default:

- diesel measured in gallons where applicable
- clarify imperial gallon vs US gallon
- include conversion to liters

## 4.19 Table: uom_conversions

Fields:

- id
- from_uom_id
- to_uom_id
- conversion_factor
- formula_type
- offset_value
- is_active
- is_system
- is_locked
- audit/deactivation fields

Seed conversions:

- 1 meter = 100 cm
- 1 km = 1000 m
- 1 ton = 1000 kg
- 1 m3 = 1000 liters
- 1 imperial gallon = 4.54609 liters
- 1 US gallon = 3.78541 liters
- 1 square meter = 10.7639 square feet

---

## 5. Lookup Categories To Add In 002F.3C

Plan additional lookup categories to seed into the existing 002F.3B lookup engine.

Possible categories:

- AREA_TYPES
- PORT_TYPES
- SITE_TYPES
- PAYMENT_METHODS
- BANK_ACCOUNT_TYPES
- BANK_TYPES
- TAX_TREATMENT_TYPES
- COST_CENTER_TYPES
- PROFIT_CENTER_TYPES
- UOM_FORMULA_TYPES

For each category define:

- category_code
- category_name_en
- module_code
- supports_color
- supports_icon
- supports_hierarchy
- seed values
- whether is_system/is_locked

Do not duplicate categories already created in 002F.3B.

---

## 6. Permissions Plan

Plan new permissions for 002F.3C.

At minimum:

```text
master_data.geography.view
master_data.geography.manage
master_data.geography.export
master_data.finance_basics.view
master_data.finance_basics.manage
master_data.finance_basics.export
master_data.uom.view
master_data.uom.manage
master_data.uom.export
```

Consider if audit view permissions are needed:

```text
master_data.geography.audit_view
master_data.finance_basics.audit_view
master_data.uom.audit_view
```

For each permission define:

- permission_code
- module_code
- action_code
- display name
- description
- default role assignment

Role assignment plan:

- system_admin: all
- group_admin: view/manage/export/audit
- company_admin: view/export, maybe manage depending on master type
- branch_admin: view only
- normal users: no admin page access

Explain the recommended role assignments.

---

## 7. RLS Policy Plan

Create table-by-table RLS strategy.

Need to classify:

## Global shared system tables

Examples:

- countries
- emirates
- cities
- areas_zones
- ports
- currencies
- tax_types
- banks
- uom_categories
- units_of_measure
- uom_conversions

Strategy:

- read allowed to valid ERP users or users with view permission depending on usage
- management requires manage permission
- locked/system rows protected
- delete blocked
- deactivate instead

## Company/branch scoped tables

Examples:

- cost_centers
- profit_centers
- work_sites if company-specific

Strategy:

- global admins can manage all
- group/company admins based on scope
- branch admins view branch-scoped if applicable
- management requires relevant permission
- RLS must follow existing owner_company/branch scoping patterns

Make sure RLS is compatible with existing project auth pattern and 002F.3B patterns.

---

## 8. Audit Logging Plan

Plan audit logging for every create/update/deactivate/reactivate/lock/unlock action.

Module codes:

- master_data_geography
- master_data_finance_basics
- master_data_uom

or one unified:

- master_data

Decide based on existing audit patterns.

For each table define:

- entity_name
- entity_reference
- actions
- old_values/new_values
- actor

---

## 9. Server Actions / Services Plan

Plan files and actions.

Suggested structure:

```text
src/server/actions/master-data/geography.ts
src/server/actions/master-data/finance-basics.ts
src/server/actions/master-data/uom.ts
```

or follow actual project pattern.

For each table, plan:

- list
- getById
- create
- update
- toggleStatus
- toggleLock if locked system values allowed
- export if supported
- dropdown list service if used in forms

Must include:

- permission checks
- validation
- RLS compatibility
- audit logging
- revalidatePath
- safe error handling

---

## 10. Validation Plan

For each table, plan Zod schemas.

Examples:

## Countries

- ISO2 uppercase 2 chars
- ISO3 uppercase 3 chars
- country name required
- phone code format
- only one is_uae true maybe
- only one base default maybe no

## Emirates

- emirate_code uppercase
- country must be UAE
- unique emirate_code
- unique emirate name

## Cities

- city_code uppercase
- country required
- emirate required for UAE cities
- unique city_code within emirate/country

## Currencies

- ISO currency code uppercase 3 chars
- decimal_places 0-6
- only one base currency true

## Tax Types

- tax_rate between 0 and 100
- effective dates valid
- reverse charge flags

## UOM

- uom_code uppercase
- category required
- conversion factor positive
- only one base unit per category

## UOM Conversions

- from_uom != to_uom
- conversion_factor positive
- no duplicate pair

---

## 11. UI / Screen Plan

Plan screens under the approved sidebar.

Active menus to add in 002F.3C:

```text
Master Data
├── Geography & Locations
│   ├── Countries
│   ├── Emirates
│   ├── Cities
│   ├── Areas / Zones
│   ├── Ports
│   └── Work Sites if approved
├── Finance Basics
│   ├── Currencies
│   ├── Payment Terms
│   ├── Payment Methods
│   ├── Tax Types
│   ├── Banks
│   ├── Bank Account Types
│   ├── Cost Centers
│   └── Profit Centers
└── Units & Measurements
    ├── UOM Categories
    ├── Units of Measure
    └── UOM Conversions
```

But the plan should decide if all menu items should be visible immediately or if some should be hidden until implemented.

For each page, plan:

- route
- permission
- table columns
- filters
- search fields
- drawer sections
- form fields
- export
- status/locked indicators
- audit display if any

Use:

- ERPPageHeader
- ERPDataTable
- ERPDrawerForm
- LookupSelect
- ERPExportMenu if stable

Do not create flat sidebar chaos.

Use hierarchical sidebar.

---

## 12. Reusable Component / Shared Pattern Plan

Determine whether 002F.3C needs shared components, such as:

- MasterDataSelect wrappers
- CurrencySelect
- CountrySelect
- EmirateSelect
- CitySelect
- UOMSelect
- TaxTypeSelect
- PaymentTermSelect

Decide whether to implement as:

- separate components
- LookupSelect for simple lookups
- dedicated table select components for dedicated tables

Plan best approach.

Example:

- Payment Methods: LookupSelect
- Bank Account Types: LookupSelect
- Countries: CountrySelect from countries table
- Emirates: EmirateSelect from emirates table
- Units of Measure: UOMSelect from units_of_measure table
- Tax Types: TaxTypeSelect from tax_types table

---

## 13. Seed Data Plan

Create a detailed seed matrix.

Include:

## Countries

List initial countries.

## Emirates

7 UAE emirates.

## Cities / Areas

Minimum UAE cities and industrial areas.

## Currencies

AED, USD, EUR, GBP, SAR, QAR, OMR, BHD, KWD, JOD, INR, PKR, PHP, CNY, JPY.

## Payment Terms

- ADVANCE_100
- ADVANCE_50_BALANCE_50
- NET_7
- NET_15
- NET_30
- NET_60
- COD
- AGAINST_INVOICE
- AGAINST_DELIVERY

## Tax Types

- VAT_5
- VAT_ZERO
- VAT_EXEMPT
- RCM_SCRAP
- OUT_OF_SCOPE

## Banks

Initial UAE banks.

## UOM Categories

Length, Weight, Volume, Area, Fuel, Time, Count.

## Units

M, CM, MM, KM, KG, TON, G, L, M3, GAL_IMP, GAL_US, SQM, SQFT, HOUR, DAY, MONTH, YEAR, PCS, SET, TRIP, LOAD, JOB.

## UOM Conversions

As listed above.

Clearly state which seeds are system/locked.

---

## 14. Sidebar / Menu Modification Plan

Plan exact sidebar changes.

Add only 002F.3C groups/pages that are implemented.

Do not add HR/CRM/Fleet/HSE/Scrap menus yet.

Confirm Master Data already exists from 002F.3B.

Add:

- Geography & Locations
- Finance Basics
- Units & Measurements

with nested routes.

Permission-based visibility:

- Geography visible with geography view/manage
- Finance Basics visible with finance basics view/manage
- UOM visible with uom view/manage

---

## 15. File Modification Plan

List expected files to create/modify.

Possible files:

## Migrations

- `supabase/migrations/YYYYMMDDHHMMSS_erp_base_002f3c_core_uae_shared_master_data.sql`

## Server actions

- `src/server/actions/master-data/geography.ts`
- `src/server/actions/master-data/finance-basics.ts`
- `src/server/actions/master-data/uom.ts`

## Types / validation

- `src/features/master-data/geography/types.ts`
- `src/features/master-data/geography/validation.ts`
- `src/features/master-data/finance-basics/types.ts`
- `src/features/master-data/finance-basics/validation.ts`
- `src/features/master-data/uom/types.ts`
- `src/features/master-data/uom/validation.ts`

## Components

- list table components
- drawer forms
- select components where needed

## Pages

- routes under:
  - `/admin/master-data/geography/...`
  - `/admin/master-data/finance/...`
  - `/admin/master-data/uom/...`

## Sidebar

- existing sidebar file from 002F.3B

## Reports

- technical plan file
- future implementation report file

---

## 16. Implementation Sequence Plan

Create step-by-step implementation sequence for the next implementation prompt.

Suggested sequence:

1. Inspect existing 002F.3B implementation.
2. Create migration with tables, constraints, indexes, RLS, permissions, seed lookup additions and seed master data.
3. Create types/validation.
4. Create server actions for geography.
5. Create server actions for finance basics.
6. Create server actions for UOM.
7. Create select components.
8. Create geography pages/tables/forms.
9. Create finance basics pages/tables/forms.
10. Create UOM pages/tables/forms.
11. Add sidebar entries.
12. Add audit logging.
13. Add export support.
14. Run database tests.
15. Run RLS/permission tests.
16. Run UI tests.
17. Run typecheck/lint/build.
18. Produce implementation report.

For each step, include risks and dependencies.

---

## 17. Testing Plan

Plan exact tests.

## Database tests

- migration applies
- all tables created
- constraints work
- seed data exists
- foreign keys work
- indexes exist
- triggers work
- RLS enabled

## Permissions tests

- system_admin
- group_admin
- company_admin
- branch_admin
- unauthorized user

## RLS tests

- read access
- manage access
- locked row protection
- delete blocked
- company/branch scope if applicable

## UI tests

- every page loads
- tables load
- add/edit/view drawer works
- filters work
- search works
- export works
- locked rows protected
- seed data visible

## Select component tests

- CountrySelect
- EmirateSelect
- CitySelect
- CurrencySelect
- UOMSelect
- TaxTypeSelect
- PaymentTermSelect if implemented

## Integration tests

- organization/branch forms can later use countries/emirates/currencies
- UOM can later be used in inventory/fleet
- tax/payment terms can later be used in procurement/CRM

## Build tests

- npm run typecheck
- npm run lint
- npm run build
- npm test if available
- Playwright if available

---

## 18. Risk Analysis

List risks and mitigations:

- over-scoping 002F.3C
- implementing too many pages at once
- seed data too large
- duplicate country/currency/UOM codes
- wrong UAE city/emirate mapping
- full accounting accidentally introduced
- tax type confusion with accounting module
- UOM conversion mistakes
- RLS too strict for normal usage
- RLS too loose for management
- menu clutter
- breaking 002F.3B LookupSelect
- breaking existing organization/branch fields
- hardcoded old fields not migrated yet
- export/import confusion

---

## 19. Acceptance Criteria

Define when 002F.3C implementation will be considered complete.

Must include:

- technical plan approved before implementation
- database migration created
- tables created
- seed data created
- lookup categories added
- permissions added
- RLS implemented
- audit implemented
- pages implemented
- sidebar implemented
- select components implemented
- tests passed
- implementation report generated
- Sameer review completed

Use future checkbox format `[ ]`, not `[x]`.

---

## 20. Future Integration Notes

Explain how 002F.3C will support:

- 002F.3D Organization/Branch Completion
- 002F.3E People/Contacts/CRM
- 002F.3F HR
- 002F.3G Fleet/Equipment
- 002F.3H Workshop/Inventory/Procurement
- 002F.3I Basic HSE/DMS/Compliance
- 002F.3J Scrap/Waste/Demolition

Include examples:

- employee nationality uses countries
- branch emirate uses emirates
- vendor country uses countries
- fleet registration emirate uses emirates
- diesel uses GAL_IMP and L
- scrap weight uses TON/KG
- procurement uses payment terms and tax types
- CRM uses client location/country/currency/payment terms

---

## 21. Final Recommendation

End the report with:

- readiness status
- whether implementation can start
- decisions needed from Sameer
- exact next prompt that should be generated after approval

Final status must be one of:

- READY FOR SAMEER REVIEW — Technical plan complete.
- NEEDS USER DECISION — Specific decisions required.
- BLOCKED — Could not inspect source or plan safely.

## Important Final Instruction

Do not implement.

Do not create migrations.

Do not create pages.

Do not modify files.

Only create the technical implementation plan file:

`ERP_BASE_002F_3C_CORE_UAE_SHARED_MASTER_DATA_TECHNICAL_IMPLEMENTATION_PLAN.md`
