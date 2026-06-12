# PROMPT_ERP_BASE_002F_3C_2_TECHNICAL_IMPLEMENTATION_PLAN_FINANCE_BASICS

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, notification-engine validation specialist, enterprise ERP solution architect, UAE business compliance analyst, master data governance consultant, commercial operations analyst, and senior Next.js/Supabase implementation planner.

## Phase

ERP BASE 002F.3C.2 — Finance Basics / Commercial Readiness Technical Implementation Plan

## Prompt Purpose

This prompt is for TECHNICAL IMPLEMENTATION PLANNING ONLY.

Do not implement code.

Do not create migration files.

Do not modify database schema.

Do not create UI screens.

Do not modify application source files.

Do not start implementation.

Your task is to inspect the existing ERP source code and produce a deep, detailed, implementation-ready technical plan for:

**ERP BASE 002F.3C.2 — Finance Basics / Commercial Readiness**

The next step after Sameer approves your technical implementation plan will be a separate implementation prompt.

## Required Output File

Create only this markdown file:

`ERP_BASE_002F_3C_2_FINANCE_BASICS_TECHNICAL_IMPLEMENTATION_PLAN.md`

This report must be complete, detailed, and implementation-ready.

## Current Project Status

ERP BASE 002F.3B — Global Lookup / Dropdown Engine is approved.

ERP BASE 002F.3C.1 — Geography & Locations is approved after Sameer manually tested:

- Add
- Edit
- Delete
- View
- Lock / Unlock
- Navigation
- Geography pages

The 002F.3C.1 geography foundation now provides:

- countries
- emirates
- cities
- areas_zones
- ports
- geography select components
- geography permissions
- geography RLS
- geography UI pages

This phase must build on top of the approved geography foundation.

## Approved Master Data Sub-Phase Sequence

The approved sequence for 002F.3C is:

```text
002F.3C.1 — Geography & Locations — APPROVED / CLOSED
002F.3C.2 — Finance Basics / Commercial Readiness — CURRENT PLANNING PHASE
002F.3C.3 — Units & Measurements
002F.3C.4 — Integration, Sidebar, Select Components, QA, and Readiness Review
```

Do not change this sequence unless there is a critical technical reason. If you recommend any change, clearly explain why.

## Critical User Decisions

Sameer confirmed:

1. Full accounting module will NOT be implemented now.
2. Do not implement chart of accounts now.
3. Do not implement general ledger now.
4. Do not implement journal entries now.
5. Do not implement trial balance, P&L, balance sheet, financial statements, or accounting posting now.
6. Finance Basics means commercial readiness and shared master data only.
7. CRM will be implemented later, so this phase must prepare commercial data needed by CRM.
8. Procurement and inventory will come later, so this phase must prepare tax/payment/currency data needed by those modules.
9. Master data must be UAE-compatible.
10. All master data must integrate with the existing roles and permissions module.
11. RLS must be implemented for all tables.
12. Global admin/system_admin must be able to view, insert, edit, delete, lock, and unlock all records all the time.
13. Normal document numbering must remain simple, such as PO-0001, INV-0001, EMP-0001, etc.
14. Any future document numbering must use the existing ERP BASE 002F.2 Global Numbering System.

## Critical Rule: No Accounting Module

This phase must not accidentally become an accounting module.

Do not implement:

```text
chart_of_accounts
account_groups
general_ledger
journal_entries
ledger_transactions
trial_balance
balance_sheet
profit_and_loss
cash_flow
financial_period_closing
accounting_posting_engine
double_entry_accounting
AR/AP ledgers
```

If any field or table seems accounting-related, mark it as future placeholder only and do not implement it in 002F.3C.2.

## Approved Scope of 002F.3C.2

Plan implementation for Finance Basics / Commercial Readiness only.

## Dedicated Tables

1. currencies
2. payment_terms
3. tax_types
4. banks
5. cost_centers
6. profit_centers

## Lookup Categories to Add to Existing 002F.3B Lookup Engine

Use existing tables:

```text
global_lookup_categories
global_lookup_values
```

Do not use or create:

```text
lookup_categories
lookup_values
```

Lookup categories to plan:

1. PAYMENT_METHODS
2. TAX_TREATMENT_TYPES
3. BANK_ACCOUNT_TYPES
4. BANK_TYPES
5. COST_CENTER_TYPES
6. PROFIT_CENTER_TYPES

Optional only if justified:

7. COMMERCIAL_TERM_TYPES
8. RETENTION_TYPES
9. ADVANCE_PAYMENT_TYPES

## UI Pages to Plan

Plan full CRUD UI pages for:

```text
/admin/master-data/finance/currencies
/admin/master-data/finance/payment-terms
/admin/master-data/finance/tax-types
/admin/master-data/finance/banks
/admin/master-data/finance/cost-centers
/admin/master-data/finance/profit-centers
```

Lookup-backed values may be managed through existing Global Lookups, but the plan should decide whether to create filtered convenience pages or not.

## Explicitly Out of Scope

Do not implement or plan detailed build for:

- accounting module
- chart of accounts
- GL
- journal entries
- customers/vendors
- CRM module screens
- HR
- payroll
- fleet
- workshop
- inventory item master
- procurement transaction screens
- invoices
- payments
- receipts
- bank reconciliation
- exchange rate engine
- automatic currency revaluation
- VAT return filing
- UAE FTA API integration
- e-invoicing integration
- Work Sites
- Units & Measurements

Mention future integration only.

---

# 1. Required Source Inspection

Before writing the plan, inspect the actual source code.

Review:

## 002F.3B Lookup Engine

- `global_lookup_categories`
- `global_lookup_values`
- LookupSelect
- lookup permissions
- lookup RLS
- lookup actions
- lookup UI patterns

## 002F.3C.1 Geography

- geography tables
- geography actions
- geography validation
- geography UI pages
- geography select components
- geography permission/RLS patterns
- geography lock/unlock/delete behavior
- final approved route patterns

## Existing Foundation

- owner_companies
- branches
- user_profiles
- roles
- permissions
- role_permissions
- audit_logs
- RLS helper functions
- current_user_profile_id
- current_user_has_permission
- global admin / system_admin helper or role code
- set_updated_at trigger
- ERPDrawerForm
- ERPDataTable
- ERPPageHeader
- ERPExportMenu
- alert dialogs
- toast pattern
- existing sidebar implementation

Use existing project conventions.

Do not invent a new architecture.

---

# 2. Required Final Report Structure

The output file must include all sections below.

1. Executive Summary
2. Scope and Non-Scope Confirmation
3. Source Code Inspection Summary
4. Lookup vs Dedicated Table Decision Matrix
5. Database Schema Plan
6. Lookup Categories and Seed Values Plan
7. UAE Commercial / VAT / RCM Compatibility Review
8. Permissions and Role Assignment Plan
9. RLS Policy Plan
10. Global Admin Full Access Plan
11. Audit Logging Plan
12. Server Actions / Services Plan
13. Validation Plan
14. UI / Screen Plan
15. Reusable Select Component Plan
16. Seed Data Plan
17. Sidebar / Menu Plan
18. File Creation / Modification Plan
19. Implementation Sequence Plan
20. Testing Plan
21. Risk Analysis and Mitigation
22. Acceptance Criteria
23. Future Integration Notes
24. Final Recommendation

Do not summarize critical sections.

Do not say “implementation details to be done later”.

Make it detailed enough to generate the next implementation prompt safely.

---

# 3. Section Requirements

## 1. Executive Summary

Include:

- purpose of 002F.3C.2
- why Finance Basics comes after Geography
- what will be implemented
- what will not be implemented
- how this phase supports CRM, procurement, inventory, commercial offers, and reporting
- readiness status

## 2. Scope and Non-Scope Confirmation

Clearly state:

### In Scope

- currencies
- payment_terms
- tax_types
- banks
- cost_centers
- profit_centers
- payment method lookups
- tax treatment lookups
- bank type lookups
- bank account type lookups
- cost/profit center type lookups
- UAE VAT/RCM readiness only
- admin UI
- RLS
- permissions
- audit
- global admin full access

### Out of Scope

- full accounting
- chart of accounts
- GL
- journals
- AR/AP
- invoice posting
- payment posting
- bank reconciliation
- payroll
- tax filing
- VAT return
- exchange rate engine
- currency revaluation
- customer/vendor master data
- CRM transactions
- procurement transactions
- inventory transactions

## 3. Source Code Inspection Summary

Create a table:

```text
Area | Files/Tables Inspected | Existing Pattern Found | Impact on 002F.3C.2
```

Include:

- 002F.3B lookup engine
- 002F.3C.1 geography
- RLS helpers
- permissions
- audit
- drawer/table UI
- export menu
- sidebar
- country/geography select components
- organization/branch fields that may later use currencies/cost centers

## 4. Lookup vs Dedicated Table Decision Matrix

Classify each item:

```text
Master Data Item | Recommended Type | Proposed Table / Lookup Category | Reason | Used By Future Modules | Priority | Implementation Phase
```

Include:

- Currencies
- Payment Terms
- Payment Methods
- Tax Types
- Tax Treatment Types
- Banks
- Bank Account Types
- Bank Types
- Cost Centers
- Profit Centers
- Cost Center Types
- Profit Center Types
- Commercial Term Types if recommended
- Retention Types if recommended
- Advance Payment Types if recommended

## 5. Database Schema Plan

Plan all dedicated tables in deep detail.

For every table include:

- purpose
- table name
- columns
- data types
- primary key
- foreign keys
- unique constraints
- check constraints
- indexes
- triggers
- seed data
- RLS summary
- permissions summary
- audit actions
- UI route
- select component
- global admin behavior

### 5.1 currencies

Suggested fields:

```text
id BIGINT identity PK
currency_code text unique not null
currency_name_en / name_en
currency_name_ar / name_ar
symbol text
decimal_places smallint
is_base_currency boolean
is_system boolean
is_locked boolean
is_active boolean
sort_order integer
created_at
created_by
updated_at
updated_by
deactivated_at
deactivated_by
deactivation_reason
```

Rules:

- currency_code exactly 3 uppercase letters
- only one base currency
- AED should be base currency
- system_admin can edit/delete all
- non-system admin cannot delete
- cannot delete if referenced unless DB blocks by FK

### 5.2 payment_terms

Suggested fields:

```text
id
payment_term_code / term_code
payment_term_name_en / name_en
payment_term_name_ar / name_ar
due_days
advance_percentage
retention_percentage
description
is_system
is_locked
is_active
sort_order
audit/deactivation fields
```

Rules:

- code uppercase
- due_days >= 0
- advance_percentage 0-100
- retention_percentage 0-100

### 5.3 tax_types

Suggested fields:

```text
id
tax_code
tax_name_en / name_en
tax_name_ar / name_ar
tax_rate
tax_treatment_code or tax_treatment_lookup_id
is_vat
is_reverse_charge
applies_to_sales
applies_to_purchases
applies_to_scrap
effective_from
effective_to
description
is_system
is_locked
is_active
sort_order
audit/deactivation fields
```

Rules:

- tax_rate 0-100
- effective_to >= effective_from
- RCM_SCRAP support
- no accounting posting logic

### 5.4 banks

Suggested fields:

```text
id
bank_code
bank_name_en / name_en
bank_name_ar / name_ar
country_id references countries
bank_type_code or bank_type_lookup_id
swift_code
routing_code if needed
website
is_system
is_locked
is_active
sort_order
description
audit/deactivation fields
```

Rules:

- bank_code uppercase
- country_id should reference geography countries table
- SWIFT/BIC format if provided
- no bank account ledger or reconciliation

### 5.5 cost_centers

Suggested fields:

```text
id
cost_center_code
cost_center_name_en / name_en
cost_center_name_ar / name_ar
cost_center_type_code or lookup id
parent_cost_center_id nullable self FK
owner_company_id nullable or required based on existing architecture
branch_id nullable
is_system
is_locked
is_active
sort_order
description
audit/deactivation fields
```

Important:

- This is reporting/readiness only, not accounting.
- Do not add GL account linkage.
- Do not add budget control now.
- Do not add posting logic.
- Consider removing/defer `budget_amount` to avoid accounting scope creep.

### 5.6 profit_centers

Suggested fields similar to cost_centers:

```text
id
profit_center_code
profit_center_name_en / name_en
profit_center_name_ar / name_ar
profit_center_type_code or lookup id
parent_profit_center_id nullable self FK
owner_company_id nullable or required
branch_id nullable
is_system
is_locked
is_active
sort_order
description
audit/deactivation fields
```

Important:

- This is reporting/readiness only.
- Do not add revenue target or budget fields unless explicitly justified.
- Do not add accounting posting logic.

## 6. Lookup Categories and Seed Values Plan

Use existing 002F.3B tables only:

```text
global_lookup_categories
global_lookup_values
```

Plan these categories:

## PAYMENT_METHODS

Seed:

```text
CASH
CHEQUE
BANK_TRANSFER
ONLINE_TRANSFER
CREDIT_CARD
DEBIT_CARD
LC
PDC
```

## TAX_TREATMENT_TYPES

Seed:

```text
STANDARD_RATED
ZERO_RATED
EXEMPT
OUT_OF_SCOPE
REVERSE_CHARGE
```

## BANK_ACCOUNT_TYPES

Seed:

```text
CURRENT
SAVINGS
CALL_ACCOUNT
FIXED_DEPOSIT
LC_ACCOUNT
GUARANTEE_ACCOUNT
```

## BANK_TYPES

Seed:

```text
COMMERCIAL
ISLAMIC
CENTRAL
EXCHANGE_HOUSE
FINANCE_COMPANY
```

## COST_CENTER_TYPES

Seed:

```text
DEPARTMENT
BRANCH
PROJECT
EQUIPMENT
WORKSHOP
FLEET
ADMIN
```

## PROFIT_CENTER_TYPES

Seed:

```text
BUSINESS_UNIT
SERVICE_LINE
REVENUE_STREAM
PROJECT
BRANCH
```

Optional categories:

## COMMERCIAL_TERM_TYPES

Seed if needed:

```text
ADVANCE_PAYMENT
RETENTION
CREDIT_PERIOD
AGAINST_DELIVERY
AGAINST_INVOICE
```

For each category include:

- category_code
- name_en
- name_ar
- module_code
- scope
- supports_color/icon
- seed values
- is_system
- is_locked
- sort_order

## 7. UAE Commercial / VAT / RCM Compatibility Review

Review and include:

- AED base currency
- GCC currencies
- UAE VAT 5%
- VAT zero rated
- VAT exempt
- out of scope
- reverse charge mechanism for scrap readiness
- RCM_SCRAP
- standard payment terms common in UAE
- cheque / PDC support
- bank transfer
- LC
- UAE bank SWIFT readiness
- TRN/VAT readiness only; TRN fields are organization phase, not here
- no VAT filing or accounting posting now

## 8. Permissions and Role Assignment Plan

Plan permissions:

```text
master_data.finance_basics.view
master_data.finance_basics.manage
master_data.finance_basics.export
master_data.finance_basics.audit_view
```

Optional if delete permission is preferred:

```text
master_data.finance_basics.delete
```

But global admin/system_admin must be able to delete all records whether through role or permission.

Role assignments:

### system_admin / global admin

Must have all permissions and full access:

- view all
- insert all
- edit all
- lock/unlock all
- activate/deactivate all
- delete all

### group_admin

Recommended:

- view
- manage
- export
- audit_view
- lock/unlock only if existing policy gives it

No hard delete unless explicitly approved.

### company_admin

Recommended:

- view
- export
- maybe manage scoped cost/profit centers only if approved, but not global tables

### branch_admin

Recommended:

- view only

### normal user

No admin page access by default.

Can read active values through safe select/dropdown services where needed.

## 9. RLS Policy Plan

For each table, plan:

- SELECT
- INSERT
- UPDATE
- DELETE
- locked row behavior
- active/inactive behavior
- global admin/system_admin full access
- normal dropdown read access

Important:

Global admin/system_admin must be able to view, insert, edit, lock/unlock, and delete all records all the time.

Non-global roles:

- manage permission allows create/update/deactivate where allowed
- hard delete blocked by default
- locked record update blocked unless lock permission/global admin
- normal users read active records only through safe services if needed

Use actual existing project RLS helpers.

Do not assume `auth_context()` or `has_permission()` exist unless verified.

## 10. Global Admin Full Access Plan

Create a dedicated section explaining:

- how global admin is detected
- which role code is used, likely `system_admin`
- how server actions allow global admin full access
- how RLS allows global admin full access
- how UI exposes all actions to global admin
- how delete is audited
- how FK constraints still protect dependent data
- how friendly delete errors are shown if dependencies exist

## 11. Audit Logging Plan

For each table, plan audit actions:

## currencies

```text
currency.create
currency.update
currency.activate
currency.deactivate
currency.lock
currency.unlock
currency.delete
```

## payment_terms

```text
payment_term.create
payment_term.update
payment_term.activate
payment_term.deactivate
payment_term.lock
payment_term.unlock
payment_term.delete
```

## tax_types

```text
tax_type.create
tax_type.update
tax_type.activate
tax_type.deactivate
tax_type.lock
tax_type.unlock
tax_type.delete
```

## banks

```text
bank.create
bank.update
bank.activate
bank.deactivate
bank.lock
bank.unlock
bank.delete
```

## cost_centers

```text
cost_center.create
cost_center.update
cost_center.activate
cost_center.deactivate
cost_center.lock
cost_center.unlock
cost_center.delete
```

## profit_centers

```text
profit_center.create
profit_center.update
profit_center.activate
profit_center.deactivate
profit_center.lock
profit_center.unlock
profit_center.delete
```

Audit must include:

- old values
- new values
- actor
- timestamp
- entity id
- entity code/reference
- owner_company_id / branch_id where applicable
- full old record before delete

## 12. Server Actions / Services Plan

Plan files and functions.

Expected file:

```text
src/features/master-data/finance-basics/actions.ts
```

or if project standard is server folder:

```text
src/server/actions/master-data/finance-basics.ts
```

Use actual existing project pattern from geography.

For each table, plan functions:

## currencies

- getCurrencies
- getCurrencyById
- createCurrency
- updateCurrency
- toggleCurrencyStatus
- toggleCurrencyLock
- deleteCurrency
- getActiveCurrenciesForSelect
- exportCurrencies if export is stable

## payment_terms

- getPaymentTerms
- getPaymentTermById
- createPaymentTerm
- updatePaymentTerm
- togglePaymentTermStatus
- togglePaymentTermLock
- deletePaymentTerm
- getActivePaymentTermsForSelect
- exportPaymentTerms

## tax_types

- getTaxTypes
- getTaxTypeById
- createTaxType
- updateTaxType
- toggleTaxTypeStatus
- toggleTaxTypeLock
- deleteTaxType
- getActiveTaxTypesForSelect
- exportTaxTypes

## banks

- getBanks
- getBankById
- createBank
- updateBank
- toggleBankStatus
- toggleBankLock
- deleteBank
- getActiveBanksForSelect
- exportBanks

## cost_centers

- getCostCenters
- getCostCenterById
- createCostCenter
- updateCostCenter
- toggleCostCenterStatus
- toggleCostCenterLock
- deleteCostCenter
- getActiveCostCentersForSelect
- exportCostCenters

## profit_centers

- getProfitCenters
- getProfitCenterById
- createProfitCenter
- updateProfitCenter
- toggleProfitCenterStatus
- toggleProfitCenterLock
- deleteProfitCenter
- getActiveProfitCentersForSelect
- exportProfitCenters

For each function include:

- input
- output
- validation
- permission
- RLS expectation
- audit
- revalidatePath
- error handling
- FK delete friendly messages

## 13. Validation Plan

Create detailed Zod validation plan for every table.

## currencies

- currency_code exactly 3 uppercase letters
- name_en required
- decimal_places 0 to 6
- only one base currency
- AED base currency seed
- symbol optional

## payment_terms

- code uppercase
- name_en required
- due_days >= 0
- advance_percentage 0-100
- retention_percentage 0-100
- if advance + retention > 100, warn or block depending business decision

## tax_types

- tax_code uppercase
- name_en required
- tax_rate 0-100
- effective_from/effective_to valid
- is_reverse_charge boolean
- applies_to_sales/purchases/scrap booleans
- RCM_SCRAP support

## banks

- bank_code uppercase
- name_en required
- country_id required
- swift_code optional but validate format if provided
- bank_type valid lookup value

## cost_centers

- cost_center_code uppercase
- name_en required
- owner_company_id/branch_id rules based on existing multi-company pattern
- parent not self
- prevent circular parent hierarchy if practical, otherwise document limitation
- no GL linkage

## profit_centers

- profit_center_code uppercase
- name_en required
- owner_company_id/branch_id rules
- parent not self
- prevent circular parent hierarchy if practical
- no revenue posting logic

## 14. UI / Screen Plan

Plan full CRUD pages, data tables, drawer forms.

Routes:

```text
/admin/master-data/finance/currencies
/admin/master-data/finance/payment-terms
/admin/master-data/finance/tax-types
/admin/master-data/finance/banks
/admin/master-data/finance/cost-centers
/admin/master-data/finance/profit-centers
```

For each page define:

- page title
- permission
- columns
- filters
- row actions
- add/edit/view drawer
- lock/unlock
- activate/deactivate
- hard delete system_admin only
- export if stable
- audit section

Use same patterns as approved geography pages.

## 15. Reusable Select Component Plan

Plan components:

```text
CurrencySelect
PaymentTermSelect
PaymentMethodSelect
TaxTypeSelect
TaxTreatmentSelect
BankSelect
BankAccountTypeSelect
CostCenterSelect
ProfitCenterSelect
```

For each component specify:

- source table or LookupSelect
- props
- active-only behavior
- filters
- system_admin/admin behavior
- normal form usage
- loading/error/empty states

Use:

- dedicated table select for currencies, payment terms, tax types, banks, cost centers, profit centers
- LookupSelect for payment methods, tax treatment types, bank account types, bank types, cost/profit center types

## 16. Seed Data Plan

Provide full seed matrices.

## currencies

At minimum:

```text
AED base
USD
EUR
GBP
SAR
QAR
OMR
BHD
KWD
JOD
INR
PKR
PHP
CNY
JPY
```

## payment_terms

```text
ADVANCE_100
ADVANCE_50_BALANCE_50
NET_7
NET_15
NET_30
NET_60
COD
AGAINST_INVOICE
AGAINST_DELIVERY
```

## tax_types

```text
VAT_5
VAT_ZERO
VAT_EXEMPT
RCM_SCRAP
OUT_OF_SCOPE
```

## banks

Major UAE banks:

```text
FAB
ADCB
ADIB
ENBD
DIB
MASHREQ
RAKBANK
CBD
HSBC_UAE
SCB_UAE
SIB
NBF
```

Use geography countries table for UAE FK.

## cost_centers

Basic reporting/readiness only:

```text
ADMIN
OPERATIONS
FLEET
WORKSHOP
HR
SALES
HSE
SCRAP
DEMOLITION
TRANSPORT
```

## profit_centers

```text
TRANSPORT
EQUIPMENT_RENTAL
SCRAP_TRADING
DEMOLITION
WASTE_MANAGEMENT
CRM_SALES
```

All system seed records:

- is_system true
- is_locked true
- is_active true

But system_admin can still delete if required.

## 17. Sidebar / Menu Plan

Add only Finance Basics after implementation.

Sidebar:

```text
Master Data
└── Finance Basics
    ├── Currencies
    ├── Payment Terms
    ├── Tax Types
    ├── Banks
    ├── Cost Centers
    └── Profit Centers
```

Do not show:

- Accounting
- Chart of Accounts
- GL
- Journals
- Invoices
- Payments
- Bank Reconciliation

Lookup-backed values such as Payment Methods and Bank Account Types can remain under Global Lookups or optional filtered convenience pages if justified.

## 18. File Creation / Modification Plan

List expected files.

Examples:

## Migration

```text
supabase/migrations/YYYYMMDDHHMMSS_erp_base_002f3c2_finance_basics.sql
```

## Types / validation / actions

```text
src/features/master-data/finance-basics/types.ts
src/features/master-data/finance-basics/validation.ts
src/features/master-data/finance-basics/actions.ts
```

## Select components

```text
src/components/erp/finance/currency-select.tsx
src/components/erp/finance/payment-term-select.tsx
src/components/erp/finance/tax-type-select.tsx
src/components/erp/finance/bank-select.tsx
src/components/erp/finance/cost-center-select.tsx
src/components/erp/finance/profit-center-select.tsx
src/components/erp/finance/index.ts
```

## Pages

```text
src/app/(protected)/admin/master-data/finance/currencies/page.tsx
src/app/(protected)/admin/master-data/finance/payment-terms/page.tsx
src/app/(protected)/admin/master-data/finance/tax-types/page.tsx
src/app/(protected)/admin/master-data/finance/banks/page.tsx
src/app/(protected)/admin/master-data/finance/cost-centers/page.tsx
src/app/(protected)/admin/master-data/finance/profit-centers/page.tsx
```

## Tables/forms

```text
src/features/master-data/finance-basics/components/currencies-table.tsx
src/features/master-data/finance-basics/components/currency-form-dialog.tsx
...
```

## Sidebar

```text
src/components/layout/app-sidebar.tsx
```

## Report

```text
ERP_BASE_002F_3C_2_FINANCE_BASICS_IMPLEMENTATION_REPORT.md
```

## 19. Implementation Sequence Plan

Plan exact sequence for future implementation prompt:

1. Inspect existing geography and lookup patterns.
2. Create migration for tables, permissions, RLS, lookup categories, seed data.
3. Create types.
4. Create validation schemas.
5. Create server actions.
6. Create select components.
7. Create pages.
8. Create tables.
9. Create drawer forms.
10. Add sidebar.
11. Add export where stable.
12. Run typecheck/lint/build.
13. Browser test.
14. Create implementation report.
15. Stop and wait for Sameer review.

## 20. Testing Plan

Plan tests:

## Database

- tables created
- constraints work
- seed data inserted
- lookup categories inserted
- RLS enabled
- delete allowed only for system_admin
- lock/unlock works

## Permissions

- system_admin full access
- group_admin manage but no hard delete
- company_admin view/export only
- branch_admin view only
- normal users no admin pages

## UI

- all pages load
- add/edit/view drawers
- lock/unlock
- delete system_admin only
- filters/search
- export visibility
- seed data visible

## Build

```text
npm run typecheck
npm run lint
npm run build
npm test if available
```

## 21. Risk Analysis and Mitigation

Include:

- scope creep into accounting
- chart of accounts accidentally introduced
- cost/profit centers becoming accounting structures
- wrong VAT/RCM logic
- wrong bank SWIFT data
- base currency multiple true
- RLS too strict
- RLS too loose
- delete risk for system records
- seed data quality
- dependency on countries table
- export instability

For each risk include impact, likelihood, and mitigation.

## 22. Acceptance Criteria

Use future checkboxes `[ ]`.

Include:

- [ ] Technical plan approved.
- [ ] Migration created.
- [ ] Dedicated tables created.
- [ ] Lookup categories and values seeded.
- [ ] Permissions created.
- [ ] Role assignments created.
- [ ] RLS implemented.
- [ ] Global admin full access implemented.
- [ ] Audit implemented.
- [ ] Server actions created.
- [ ] Validation created.
- [ ] Select components created.
- [ ] CRUD UI pages created.
- [ ] Sidebar updated.
- [ ] Export handled.
- [ ] Typecheck/lint/build passed.
- [ ] Browser testing passed.
- [ ] Implementation report generated.
- [ ] Sameer review completed.

## 23. Future Integration Notes

Explain how Finance Basics supports:

- 002F.3D organization/branch completion
- 002F.3E CRM
- procurement
- inventory
- HR
- fleet
- scrap trading
- demolition services
- offers/proposals
- payment terms in commercial offers
- RCM for scrap
- bank details in companies/employees/vendors later

## 24. Final Recommendation

End with:

- readiness status
- whether implementation can start after Sameer approval
- decisions needed from Sameer
- exact next prompt name

Recommended next prompt after approval:

```text
PROMPT_ERP_BASE_002F_3C_2_IMPLEMENT_FINANCE_BASICS.md
```

Final status must be one of:

```text
READY FOR SAMEER REVIEW — Technical plan complete.
NEEDS USER DECISION — Specific decisions required.
BLOCKED — Could not inspect source or plan safely.
```

## Final Instruction

Create only:

```text
ERP_BASE_002F_3C_2_FINANCE_BASICS_TECHNICAL_IMPLEMENTATION_PLAN.md
```

Do not implement.

Do not create migrations.

Do not modify app files.

Do not start 002F.3C.2 implementation yet.
