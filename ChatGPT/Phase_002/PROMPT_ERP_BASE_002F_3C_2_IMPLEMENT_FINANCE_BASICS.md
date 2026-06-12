# PROMPT_ERP_BASE_002F_3C_2_IMPLEMENT_FINANCE_BASICS

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, notification-engine validation specialist, enterprise ERP solution architect, UAE business compliance analyst, finance master-data governance consultant, and senior Next.js/Supabase implementation engineer.

## Phase

ERP BASE 002F.3C.2 — Finance Basics / Commercial Readiness Implementation

## Implementation Mode

This is an IMPLEMENTATION prompt.

You must implement only the approved and corrected REV1 plan for:

```text
ERP BASE 002F.3C.2 — Finance Basics / Commercial Readiness
```

Do not implement accounting.

Do not implement chart of accounts.

Do not implement general ledger.

Do not implement journal entries.

Do not implement AR/AP ledgers.

Do not implement invoices, payments, receipts, bank reconciliation, exchange rate engine, VAT return filing, e-invoicing, budgets, or financial statements.

Do not implement CRM, Procurement, Inventory, HR, Fleet, Workshop, HSE, DMS, Scrap/Waste/Demolition, or Work Sites.

Do not start ERP BASE 002F.3C.3.

Do not modify completed Geography, Organizations, or Branches modules unless a minor compatibility import/type issue is required and documented.

## Source Plan

Use this corrected REV1 plan as the source of truth:

```text
ERP_BASE_002F_3C_2_FINANCE_BASICS_TECHNICAL_IMPLEMENTATION_PLAN_REV1.md
```

The old v0 plan is superseded and must not be used for implementation decisions where it conflicts with REV1.

## Critical REV1 Corrections To Follow

You must strictly follow these corrections:

1. Use BIGINT PK/FK only.
2. Do not use SERIAL.
3. Use `user_profiles.id` BIGINT audit fields.
4. Do not reference `auth.users.id` directly for audit fields.
5. Use actual project RLS helpers:
   - `current_user_profile_id()`
   - `current_user_has_permission()`
   - `current_user_has_permission_any_scope()`
   - `current_user_has_permission_in_company()`
   - `current_user_has_permission_in_branch()`
   - `current_user_has_role()`
   or the actual helpers confirmed in the project.
6. Do not use fake helpers like `auth_context()` or `has_permission()` in SQL.
7. Use one consolidated migration unless a corrective migration becomes necessary.
8. Remove accounting-like fields:
   - exchange_rate_placeholder
   - budget_enabled
   - target_enabled
   - manager_user_id
   - GL account linkage
   - budget amount
   - target revenue
   - posting flags
   - ledger flags
9. Keep cost centers and profit centers as reporting-readiness master data only.
10. Use existing `global_lookup_categories` and `global_lookup_values`.
11. Do not create new lookup tables.
12. Use routes under:
   - `/admin/master-data/finance-basics/*`
13. Use existing master data and lookup system. No hardcoded dropdowns.
14. Generate implementation report and stop.

## Standing Master Data Rule

For this phase and all future phases:

```text
All modules must reuse existing master data and global lookup values.
No hardcoded dropdowns.
No duplicate master data tables.
If a needed dropdown/value is missing, add it to the correct master data or global lookup area first.
```

This rule must be included in the implementation report.

---

# 1. Required Source Inspection Before Implementation

Before making changes, inspect the source code and database patterns.

Inspect these current approved areas:

## Foundation / RLS / Audit

```text
supabase/migrations/20260527120000_erp_base_foundation.sql
src/server/actions/audit.ts
src/lib/rbac/check.ts
src/types/database.ts
```

Confirm actual patterns for:

```text
BIGINT primary keys
user_profiles.id
created_by / updated_by / deactivated_by
audit_logs
RLS helpers
set_updated_at()
permissions
role_permissions
system_admin role detection
```

## Lookup Engine

Inspect:

```text
global_lookup_categories
global_lookup_values
src/features/master-data/lookups
src/components/erp/lookup-select.tsx
src/server/actions/master-data/lookups.ts
```

Confirm dynamic lookup behavior and reuse `LookupSelect` for lookup-backed fields.

## Geography / Master Data UI Patterns

Inspect:

```text
src/features/master-data/geography
src/components/erp/geography
src/app/(protected)/admin/master-data/geography
```

Reuse the same patterns for:

```text
ERPDrawerForm
ERPDataTable
ERPPageHeader
status badges
locked badges
system badges
row actions
delete confirmation
lock/unlock actions
activate/deactivate actions
export menu
toast behavior
```

## Organizations / Branches

Inspect:

```text
owner_companies
branches
src/features/organizations
src/features/branches
```

Cost centers and profit centers may reference:

```text
owner_company_id
branch_id
```

If Branches geography integration is complete, use `branch_id` normally. If not, keep `branch_id` nullable and document.

---

# 2. Approved Scope

Implement these six dedicated tables:

```text
currencies
payment_terms
tax_types
banks
cost_centers
profit_centers
```

Implement these six lookup categories in existing lookup engine:

```text
PAYMENT_METHODS
TAX_TREATMENT_TYPES
BANK_ACCOUNT_TYPES
BANK_TYPES
COST_CENTER_TYPES
PROFIT_CENTER_TYPES
```

Implement full admin UI under:

```text
/admin/master-data/finance-basics/currencies
/admin/master-data/finance-basics/payment-terms
/admin/master-data/finance-basics/tax-types
/admin/master-data/finance-basics/banks
/admin/master-data/finance-basics/cost-centers
/admin/master-data/finance-basics/profit-centers
```

Implement reusable select components:

```text
CurrencySelect
PaymentTermSelect
TaxTypeSelect
BankSelect
CostCenterSelect
ProfitCenterSelect
```

Lookup-backed dropdowns must use `LookupSelect`.

---

# 3. Explicitly Out of Scope

Do not create or implement:

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
bank reconciliation
exchange rate engine
currency revaluation
budget management
budget control
VAT return filing
e-invoicing
invoices
payments
receipts
customers
vendors
procurement transactions
inventory transactions
payroll
```

Do not add fields like:

```text
exchange_rate_placeholder
budget_enabled
target_enabled
manager_user_id
budget amount
target revenue
GL account id
posting account
ledger account
```

---

# 4. Database Migration Requirements

Create one consolidated migration:

```text
supabase/migrations/YYYYMMDDHHMMSS_erp_base_002f3c2_finance_basics.sql
```

This migration must include:

1. Six dedicated finance basics tables.
2. BIGINT identity PKs.
3. BIGINT FKs.
4. user_profiles audit FKs.
5. constraints.
6. indexes.
7. set_updated_at triggers.
8. RLS policies.
9. permissions.
10. role assignments.
11. lookup categories.
12. lookup values.
13. seed data.

Do not create many separate migration files unless a corrective migration is required later.

## 4.1 Common Standard Columns

All six tables must include:

```sql
id bigint generated by default as identity primary key,

is_system boolean not null default false,
is_locked boolean not null default false,
is_active boolean not null default true,
sort_order integer not null default 0,

created_at timestamptz not null default now(),
created_by bigint references public.user_profiles(id),
updated_at timestamptz not null default now(),
updated_by bigint references public.user_profiles(id),
deactivated_at timestamptz,
deactivated_by bigint references public.user_profiles(id),
deactivation_reason text,

check (
  (is_active = true and deactivated_at is null) or
  (is_active = false and deactivated_at is not null)
)
```

## 4.2 currencies

Create table:

```text
currencies
```

Fields:

```text
currency_code text unique not null
currency_name_en text not null
currency_name_ar text
symbol text
decimal_places integer not null default 2
is_base_currency boolean not null default false
description_en text
description_ar text
notes text
standard system/locked/active/audit fields
```

Constraints:

```text
currency_code uppercase
currency_code exactly 3 letters
decimal_places between 0 and 4
one base currency only using partial unique index
```

Required index:

```sql
create unique index if not exists idx_currencies_single_base
on public.currencies (is_base_currency)
where is_base_currency = true;
```

Do not add exchange rate fields.

## 4.3 payment_terms

Create table:

```text
payment_terms
```

Fields:

```text
term_code text unique not null
term_name_en text not null
term_name_ar text
due_days integer not null default 0
advance_percentage numeric(5,2) not null default 0
retention_percentage numeric(5,2) not null default 0
calculation_notes text
description_en text
description_ar text
notes text
standard fields
```

Constraints:

```text
term_code uppercase
due_days >= 0
advance_percentage 0 to 100
retention_percentage 0 to 100
```

No AR/AP logic.

## 4.4 tax_types

Create table:

```text
tax_types
```

Fields:

```text
tax_code text unique not null
tax_name_en text not null
tax_name_ar text
tax_rate numeric(7,4) not null default 0
tax_treatment_code text not null
is_vat boolean not null default false
is_reverse_charge boolean not null default false
applies_to_sales boolean not null default true
applies_to_purchases boolean not null default true
applies_to_scrap boolean not null default false
effective_from date not null default '2018-01-01'
effective_to date
description_en text
description_ar text
notes text
standard fields
```

Constraints:

```text
tax_code uppercase
tax_rate between 0 and 100
effective_to >= effective_from
```

No VAT filing or accounting posting.

## 4.5 banks

Create table:

```text
banks
```

Fields:

```text
bank_code text unique not null
bank_name_en text not null
bank_name_ar text
short_name text
country_id bigint references public.countries(id)
bank_type_code text
swift_code text
website_url text
contact_phone text
contact_email text
description_en text
description_ar text
notes text
standard fields
```

Constraints:

```text
bank_code uppercase
swift_code validation if provided, if safe
```

No bank account ledger or reconciliation.

## 4.6 cost_centers

Create table:

```text
cost_centers
```

Fields:

```text
cost_center_code text not null
cost_center_name_en text not null
cost_center_name_ar text
cost_center_type_code text
parent_cost_center_id bigint references public.cost_centers(id)
owner_company_id bigint references public.owner_companies(id)
branch_id bigint references public.branches(id)
description_en text
description_ar text
notes text
standard fields
```

Constraints:

```text
cost_center_code uppercase
parent_cost_center_id not self
unique code globally when owner_company_id is null
unique code per owner_company_id when owner_company_id is not null
```

No budget, GL, target, manager, or posting fields.

## 4.7 profit_centers

Create table:

```text
profit_centers
```

Fields:

```text
profit_center_code text not null
profit_center_name_en text not null
profit_center_name_ar text
profit_center_type_code text
parent_profit_center_id bigint references public.profit_centers(id)
owner_company_id bigint references public.owner_companies(id)
branch_id bigint references public.branches(id)
description_en text
description_ar text
notes text
standard fields
```

Constraints:

```text
profit_center_code uppercase
parent_profit_center_id not self
unique code globally when owner_company_id is null
unique code per owner_company_id when owner_company_id is not null
```

No target revenue, GL, or posting fields.

---

# 5. Lookup Category Requirements

Use existing:

```text
global_lookup_categories
global_lookup_values
```

Do not create new lookup tables.

Seed categories and values:

## PAYMENT_METHODS

```text
CASH
BANK_TRANSFER
CHEQUE
LETTER_OF_CREDIT
CREDIT_CARD
DEBIT_CARD
ONLINE_PAYMENT
```

## TAX_TREATMENT_TYPES

```text
STANDARD
ZERO_RATED
EXEMPT
OUT_OF_SCOPE
REVERSE_CHARGE
```

## BANK_ACCOUNT_TYPES

```text
CURRENT
SAVINGS
ESCROW
CALL
```

## BANK_TYPES

```text
COMMERCIAL
ISLAMIC
CENTRAL
CORRESPONDENT
```

## COST_CENTER_TYPES

```text
DEPARTMENT
PROJECT
WAREHOUSE
PRODUCTION
ADMIN
```

## PROFIT_CENTER_TYPES

```text
BUSINESS_UNIT
PRODUCT_LINE
REGION
DIVISION
```

Seed must be idempotent.

Dynamic lookup pages must show new categories and values after save/revalidation.

---

# 6. Seed Data Requirements

## currencies

Seed:

```text
AED base, system, locked
USD
EUR
GBP
SAR
QAR
OMR
BHD
KWD
INR
```

## payment_terms

Seed:

```text
IMMEDIATE
NET_15
NET_30
NET_60
ADVANCE_50_BALANCE_30
ADVANCE_30_RETENTION_10
COD
```

## tax_types

Seed:

```text
VAT_5
VAT_ZERO
VAT_EXEMPT
VAT_OUT_OF_SCOPE
RCM_SCRAP
```

RCM_SCRAP:

```text
tax_rate = 5.0000
tax_treatment_code = REVERSE_CHARGE
is_vat = true
is_reverse_charge = true
applies_to_sales = false
applies_to_purchases = true
applies_to_scrap = true
```

## banks

Seed UAE banks using UAE country FK resolved dynamically from:

```sql
select id from public.countries where country_code = 'AE'
```

Seed at minimum:

```text
FAB
ENBD
ADCB
DIB
MASHREQ
```

Do not assume UAE country id is 1.

## cost_centers / profit_centers

Do not seed many fixed operational records unless clearly safe.

Preferred:

```text
No required seed rows.
Admin will create per owner company/branch.
```

If seed rows are added, keep them minimal and global templates only.

---

# 7. Permissions and RLS Requirements

## Permissions

Seed:

```text
master_data.finance_basics.view
master_data.finance_basics.manage
master_data.finance_basics.export
master_data.finance_basics.audit_view
```

Role assignment:

```text
system_admin: all
group_admin: view, manage, export, audit_view
company_admin: view, export
branch_admin: view
normal users: none for admin pages
```

No delete permission unless existing pattern requires it. Hard delete is system_admin only.

## RLS

Enable RLS on all six tables.

Use actual helper functions.

Policy pattern:

### SELECT

```text
is_active = true
OR current_user_has_permission('master_data.finance_basics.view')
```

### INSERT

```text
current_user_has_permission('master_data.finance_basics.manage')
```

### UPDATE

```text
current_user_has_permission('master_data.finance_basics.manage')
AND (not is_locked OR current_user_has_role('system_admin'))
```

### DELETE

System admin only.

Use the same system_admin delete style from Geography completion fix.

Do not create unsafe anon/public write policies.

---

# 8. Server Actions Requirements

Create:

```text
src/features/master-data/finance-basics/actions.ts
```

Implement functions for all six entities.

For each entity implement:

```text
get<EntityPlural>
get<Entity>ById
create<Entity>
update<Entity>
delete<Entity>
toggle<Entity>Status
toggle<Entity>Lock
export<EntityPlural>
getActive<EntityPlural>ForSelect
```

Examples:

```text
getCurrencies
getCurrencyById
createCurrency
updateCurrency
deleteCurrency
toggleCurrencyStatus
toggleCurrencyLock
exportCurrencies
getActiveCurrenciesForSelect
```

Permission checks:

```text
view for get/list
manage for create/update/status
system_admin for delete
system_admin or approved lock pattern for lock/unlock
export for export
```

Audit logging:

```text
create/update/delete/activate/deactivate/lock/unlock
```

Use `logAudit` and `createAuditDiff` patterns.

Revalidate:

```text
/admin/master-data/finance-basics/currencies
/admin/master-data/finance-basics/payment-terms
/admin/master-data/finance-basics/tax-types
/admin/master-data/finance-basics/banks
/admin/master-data/finance-basics/cost-centers
/admin/master-data/finance-basics/profit-centers
```

---

# 9. TypeScript / Validation Requirements

Create:

```text
src/features/master-data/finance-basics/types.ts
src/features/master-data/finance-basics/validation.ts
```

Update if required:

```text
src/types/database.ts
```

Validation rules:

## currencies

```text
currency_code exactly 3 uppercase letters
decimal_places 0 to 4
only one base currency checked in action and database index
```

## payment_terms

```text
term_code uppercase
due_days >= 0
advance_percentage 0-100
retention_percentage 0-100
```

## tax_types

```text
tax_code uppercase
tax_rate 0-100
effective_to >= effective_from
tax_treatment_code required
```

## banks

```text
bank_code uppercase
country_id optional/nullable
swift_code format if provided
email format if provided
website URL if provided
```

## cost_centers / profit_centers

```text
code uppercase
parent not self
owner_company_id optional
branch_id optional
type_code optional or required based on UX
```

---

# 10. UI Page Requirements

Create pages:

```text
src/app/(protected)/admin/master-data/finance-basics/currencies/page.tsx
src/app/(protected)/admin/master-data/finance-basics/payment-terms/page.tsx
src/app/(protected)/admin/master-data/finance-basics/tax-types/page.tsx
src/app/(protected)/admin/master-data/finance-basics/banks/page.tsx
src/app/(protected)/admin/master-data/finance-basics/cost-centers/page.tsx
src/app/(protected)/admin/master-data/finance-basics/profit-centers/page.tsx
```

Each page must:

1. Check `master_data.finance_basics.view`.
2. Load data through server action.
3. Render ERPPageHeader.
4. Render table component.
5. Support add/edit/view drawer.
6. Respect permissions for actions.
7. Use the approved route and breadcrumb.

---

# 11. UI Component Requirements

Create table and form components:

```text
currencies-table.tsx
currency-form-dialog.tsx
payment-terms-table.tsx
payment-term-form-dialog.tsx
tax-types-table.tsx
tax-type-form-dialog.tsx
banks-table.tsx
bank-form-dialog.tsx
cost-centers-table.tsx
cost-center-form-dialog.tsx
profit-centers-table.tsx
profit-center-form-dialog.tsx
```

Must follow Geography UI pattern:

```text
ERPDataTable
ERPDrawerForm
ERPFieldGrid
ERPDrawerSection
status badges
system badges
locked badges
row actions
delete confirmation
toast messages
```

Action visibility:

```text
View: finance_basics.view
Add/Edit/Activate: finance_basics.manage
Export: finance_basics.export
Delete: system_admin only
Lock/Unlock: system_admin only or approved lock pattern
```

---

# 12. Select Component Requirements

Create:

```text
src/components/erp/finance-basics/currency-select.tsx
src/components/erp/finance-basics/payment-term-select.tsx
src/components/erp/finance-basics/tax-type-select.tsx
src/components/erp/finance-basics/bank-select.tsx
src/components/erp/finance-basics/cost-center-select.tsx
src/components/erp/finance-basics/profit-center-select.tsx
src/components/erp/finance-basics/index.ts
```

Each component must:

1. Load active records.
2. Display name/code, not ID.
3. Support preselected value in edit mode.
4. Support disabled/loading/empty/error states.
5. Not expose service role key.
6. Use server actions or safe Supabase client pattern consistent with geography.

Lookup-backed dropdowns must use existing `LookupSelect`.

---

# 13. Sidebar Requirements

Update:

```text
src/components/layout/app-sidebar.tsx
```

Add:

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

Do not add Accounting, Chart of Accounts, GL, Journals, Invoices, Payments, or Bank Reconciliation menus.

---

# 14. Master Data Dashboard Optional Update

If there is a master data landing page/dashboard, optionally add Finance Basics card/group.

Do not make this optional item block implementation completion if the dashboard pattern is unclear.

---

# 15. Testing Requirements

Run:

```text
npm run typecheck
npm run lint
npm run build
npm test if available
```

Separate unrelated legacy lint issues from finance-basics errors.

## Database tests

Verify:

```text
six tables exist
BIGINT PK/FK
audit FKs to user_profiles
RLS enabled
24 policies present
permissions seeded
lookup categories seeded
lookup values seeded
currencies seed exists
one base currency only
AED is base
VAT_5 and RCM_SCRAP exist
```

## UI tests

Test each page:

```text
page loads
table loads
add drawer
edit drawer
view drawer
activate/deactivate
lock/unlock
delete as system_admin
delete blocked for non-system_admin
export visible according to permission
search/filter if implemented
```

## Permission tests

Test roles:

```text
system_admin full access
group_admin manage but no delete
company_admin view/export only
branch_admin view only
normal user blocked from admin pages
```

## Dynamic lookup tests

Confirm the new lookup categories appear in:

```text
Lookup Categories
Lookup Values
Locked System Values if locked/system according to rules
LookupSelect dropdowns
```

---

# 16. Required Implementation Report

Create:

```text
ERP_BASE_002F_3C_2_FINANCE_BASICS_IMPLEMENTATION_REPORT.md
```

The report must include:

1. Phase name.
2. Date.
3. Source REV1 plan used.
4. Summary of implementation.
5. Files reviewed.
6. Files created.
7. Files modified.
8. Migration created/applied.
9. Database tables created.
10. BIGINT PK/FK verification.
11. Audit user_profiles pattern verification.
12. Lookup categories/values seeded.
13. Seed data created.
14. Permissions and role assignments.
15. RLS policies.
16. Server actions.
17. Validation/types.
18. UI pages.
19. Table/form components.
20. Select components.
21. Sidebar update.
22. Master data reuse rule confirmation.
23. No accounting module confirmation.
24. Typecheck result.
25. Lint result.
26. Build result.
27. Browser testing result.
28. Known limitations.
29. Final status.

At the end write one of:

```text
PASS — Finance Basics implementation is complete and ready for Sameer review.
PASS WITH NOTES — Finance Basics implementation works with minor non-blocking notes.
FAIL — Finance Basics implementation requires correction before approval.
```

---

# 17. Final Instruction

Implement only:

```text
ERP BASE 002F.3C.2 — Finance Basics / Commercial Readiness
```

Follow REV1 exactly.

Do not implement accounting.

Do not start ERP BASE 002F.3C.3.

Generate the implementation report and stop.
