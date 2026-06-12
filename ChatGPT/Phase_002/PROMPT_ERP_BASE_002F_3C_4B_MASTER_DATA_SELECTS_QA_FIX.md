# PROMPT_ERP_BASE_002F_3C_4B_MASTER_DATA_SELECTS_QA_FIX

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, notification-engine validation specialist, master-data governance reviewer, enterprise ERP UI/UX reviewer, and senior Next.js/Supabase implementation engineer.

## Phase

ERP BASE 002F.3C.4B — Master Data Selects QA Fix

## Implementation Mode

This is a focused IMPLEMENTATION and QA prompt.

Implement only the approved 002F.3C.4B scope.

Do not start ERP BASE 002F.3C.4C.

Do not start ERP BASE 002F.3D.

Do not implement Dynamic Sidebar / Menu Builder.

Do not implement Branding.

Do not implement People / Contacts / CRM.

Do not implement HR, Fleet, Workshop, Inventory, Procurement, HSE, DMS, Scrap/Waste/Demolition, Accounting, or operational modules.

Do not create major database redesigns.

Do not create new business modules.

## Source Roadmap / Plan

Use these files as reference if available:

```text
ERP_FULL_IMPLEMENTATION_ROADMAP_PHASE_TRACKER.md
ERP_BASE_002F_3C_4_INTEGRATION_SIDEBAR_SELECTS_QA_READINESS_PLAN.md
ERP_BASE_002F_3C_4A_SIDEBAR_COLLAPSE_SCROLL_FIX_REPORT.md
```

Current status:

```text
002F.3C.4A — Sidebar Collapse and Scroll Fix — CLOSED after Sameer browser QA passed
002F.3C.4B — Master Data Selects QA Fix — CURRENT
002F.3C.4C — Final Readiness Review / Master Data Gate — NEXT
```

## Critical Standing Rule: Master Data First → Module Second

All future and current modules must reuse existing master data and global lookup values.

No hardcoded dropdowns.

No duplicate master data tables.

If a needed dropdown/value is missing, add it to the correct master data or lookup area first.

This phase must verify this rule across completed master data and admin modules.

---

# 1. Objectives

This phase has two main objectives:

## Objective 1 — Fix Organization Default Currency

Replace the Organization / Owner Company `default_currency` text input with the existing reusable `CurrencySelect`.

Current known issue:

```text
Organizations default_currency is a text input, likely defaulting to AED.
It should use Finance Basics currency master data.
```

Required behavior:

```text
Organization form should use CurrencySelect.
The user should select currency from currencies table.
The UI must show currency name/code/symbol, not raw text.
Existing legacy default_currency text value should be preserved or safely migrated/displayed.
```

## Objective 2 — Master Data Selects QA Review

Audit all completed modules to ensure select components are used properly and no hardcoded dropdowns remain where master data exists.

Modules to review:

```text
Geography & Locations
Organizations
Branches
Finance Basics
Units & Measurements
Global Lookup Engine
Sidebar / master data routes
```

---

# 2. Required Source Inspection

Inspect actual files before making changes.

## Organization Files

Expected files:

```text
src/features/organizations/organization-form-dialog.tsx
src/features/organizations/organization-schema.ts
src/server/actions/organizations.ts
src/types/database.ts
src/app/(protected)/admin/organizations/page.tsx
```

Find actual paths if different.

Search for:

```text
default_currency
currency
AED
CurrencySelect
```

## Finance Basics Select Components

Inspect:

```text
src/components/erp/finance-basics/currency-select.tsx
src/components/erp/finance-basics/index.ts
src/features/master-data/finance-basics/actions.ts
src/features/master-data/finance-basics/types.ts
```

Confirm:

```text
CurrencySelect exists
CurrencySelect loads active currencies
CurrencySelect supports edit-mode preselection
CurrencySelect displays currency name/code/symbol
CurrencySelect saves currency id or code as required
```

## Master Data Select Components

Inspect:

```text
src/components/erp/geography
src/components/erp/finance-basics
src/components/erp/uom
src/components/erp/lookup-select.tsx
```

## Completed Forms To Audit

Inspect forms in:

```text
src/features/master-data/geography/components
src/features/master-data/finance-basics/components
src/features/master-data/uom/components
src/features/organizations
src/features/branches
src/features/master-data/lookups
```

Search for hardcoded dropdowns and text inputs for:

```text
country
emirate
region
city
area
zone
port
currency
payment term
tax type
bank
cost center
profit center
unit
uom
kg
ton
liter
gallon
box
each
status
type
category
payment method
bank type
tax treatment
```

Classify each finding as:

```text
COMPLIANT
FIXED IN THIS PHASE
DEFERRED WITH REASON
NOT APPLICABLE
```

---

# 3. Organization Default Currency Fix Requirements

## 3.1 Determine Existing Data Model

First determine whether `owner_companies` currently has:

```text
default_currency
default_currency_id
currency_id
```

Possible scenarios:

### Scenario A — Only text field exists

If only:

```text
default_currency text
```

exists, do not break existing records.

Recommended minimum safe approach:

```text
Keep default_currency text column for now.
Use CurrencySelect in UI.
On save, store selected currency_code into default_currency.
```

This avoids a database migration in this phase.

### Scenario B — FK field already exists

If there is already:

```text
default_currency_id bigint references currencies(id)
```

or similar, then use that FK and stop using text field in UI.

### Scenario C — No reliable field exists

If no field exists or current implementation is unclear, do not make risky schema changes. Document and recommend a separate database fix.

## 3.2 Preferred Fix Without New Migration

If only text field exists, implement:

```text
CurrencySelect UI → selected currency id
resolve selected currency to currency_code
save currency_code into existing default_currency text field
display current default_currency by resolving currency_code back to currency id for edit mode
```

Example:

```text
default_currency = "AED"
CurrencySelect should preselect AED currency row.
On selection USD, save default_currency = "USD".
```

Do not create a migration unless absolutely necessary.

## 3.3 Form UI Requirements

In Organization form:

- remove editable plain text input for `default_currency`
- add `CurrencySelect`
- label should be:

```text
Default Currency
```

- helper text:

```text
Used as the default commercial/reporting currency for this organization.
```

- edit mode should load existing value.
- view mode should show currency name/code, not raw text if possible.
- add mode should default to AED if available.
- if AED does not exist, leave blank and show normal required/optional behavior based on current schema.

## 3.4 Server Action Requirements

Update create/update organization actions only if required.

Do not break existing organization save.

If form sends `default_currency` as currency code, server action should accept it and save it.

If form sends `default_currency_id`, server action should resolve and save according to the existing database model.

## 3.5 Validation Requirements

Update validation only if needed.

If `default_currency` remains text code:

```text
allow 3 uppercase letters
optional/nullable if existing behavior allows
```

If FK exists:

```text
positive bigint id optional/nullable
```

---

# 4. Master Data Select Component QA Requirements

## 4.1 Required Select Inventory

Confirm these components exist and are usable:

### Geography

```text
CountrySelect
EmirateSelect / Region / Emirate / Governorate concept
CitySelect
AreaZoneSelect
PortSelect
```

### Finance Basics

```text
CurrencySelect
PaymentTermSelect
TaxTypeSelect
BankSelect
CostCenterSelect
ProfitCenterSelect
```

### UOM

```text
UomCategorySelect
UnitOfMeasureSelect
UnitByCategorySelect
```

### Lookups

```text
LookupSelect
```

For each component, confirm:

```text
loads active records
supports edit-mode preselection
displays name/code/symbol, not ID
handles disabled/loading/empty/error states
does not expose service role key
uses safe Supabase/client/server pattern
supports required filters where applicable
```

## 4.2 Required Forms QA

Review completed forms and check whether they use appropriate select components.

Required review areas:

```text
Organizations form
Branches form
Geography forms
Finance Basics forms
UOM forms
Lookup forms
```

Specific expectations:

```text
Organization country/region/city/area uses Geography selects
Organization default_currency uses CurrencySelect after this fix
Branch location uses Geography selects or documented legacy interim behavior
Finance Basics bank country uses CountrySelect
Finance Basics lookup-backed fields use LookupSelect
Cost/profit center types use LookupSelect if implemented
UOM unit form uses UomCategorySelect
UOM conversion form uses UnitOfMeasureSelect
```

## 4.3 Hardcoded Dropdown Search

Search for hardcoded `<select>` options or hardcoded arrays such as:

```text
["AED", "USD"]
["Abu Dhabi", "Dubai"]
["KG", "TON"]
["Cash", "Cheque"]
```

If found:

- fix it if the corresponding master data and select component already exist and risk is low
- otherwise document as deferred

Do not expand scope into future business modules.

---

# 5. Browser QA Checklist

Run practical browser QA for current completed modules.

## 5.1 Organizations

Test:

```text
open organizations page
add organization
edit organization
verify default currency uses CurrencySelect
verify AED preselect/default if applicable
verify save works
verify edit reloads currency correctly
verify country/region/city/area selects still work
verify no raw IDs are shown
```

## 5.2 Branches

Test:

```text
open branches page
add/edit branch
verify geography selects load and save/display correctly
verify legacy fallback still works if applicable
verify no raw IDs are shown
```

## 5.3 Geography

Test at least one page from each:

```text
countries
regions/emirates
cities
areas/zones
ports
```

Check:

```text
table loads
add/edit/view drawer opens
select components display names
lock/unlock works
activate/deactivate works
delete system_admin only
```

## 5.4 Finance Basics

Test all six pages quickly:

```text
currencies
payment-terms
tax-types
banks
cost-centers
profit-centers
```

Check:

```text
table loads
add/edit/view drawer opens
lookup-backed fields load
Bank country select works
Cost/profit center type select works
no raw IDs in select fields
```

## 5.5 UOM

Test:

```text
uom categories
units of measure
uom conversions
```

Check:

```text
category select works in unit form
unit selects work in conversion form
selected values show names/symbols, not IDs
base unit display works
```

## 5.6 Lookups

Test:

```text
lookup categories
lookup values
locked system values
```

Check:

```text
new categories/values appear after refresh
LookupSelect can read active values
locked/system values rules are clear
```

---

# 6. Build / Type / Lint Requirements

Run:

```text
npm run typecheck
npm run lint
npm run build
```

If full lint has unrelated legacy issues, separate them:

```text
002F.3C.4B errors:
Legacy unrelated lint errors:
```

All issues caused by this phase must be fixed.

If standalone typecheck fails due to known `.next/types/validator.ts` generated issue, verify:

```text
npm run build
```

passes and document the generated-file issue separately.

---

# 7. RLS / Permissions / Audit Review

Review and document:

```text
master_data.geography.*
master_data.finance_basics.*
master_data.uom.*
master_data.lookups.*
organizations.*
branches.*
```

Check:

```text
system_admin full access
group_admin manage where approved
company_admin view/export where approved
branch_admin view where approved
normal users blocked from admin pages
active select data readable where needed
```

Audit review:

```text
create
update
activate
deactivate
lock
unlock
delete
```

Document any gaps.

Do not attempt major RLS redesign in this phase unless a critical issue is found.

---

# 8. Required Implementation Report

Create:

```text
ERP_BASE_002F_3C_4B_MASTER_DATA_SELECTS_QA_FIX_REPORT.md
```

The report must include:

1. Phase name.
2. Date.
3. Summary of fixes.
4. Files reviewed.
5. Files modified.
6. Organization default_currency fix.
7. Organization currency data handling method.
8. Select component inventory.
9. Hardcoded dropdown search result.
10. Forms QA result.
11. Browser QA result by module.
12. RLS/permission review.
13. Audit review.
14. Typecheck result.
15. Lint result.
16. Build result.
17. Remaining known limitations.
18. Deferred items.
19. Final status.

At the end write exactly one:

```text
PASS — Master Data Selects QA Fix is complete and ready for Sameer review.
PASS WITH NOTES — Master Data Selects QA Fix works with minor non-blocking notes.
FAIL — Master Data Selects QA Fix requires correction before approval.
```

## Deferred Items to Confirm

Do not implement these in this phase unless already included as tiny safe corrections:

```text
Dynamic Sidebar / Menu Builder
Branding / favicon / logos
Letterheads / print/PDF/email templates
Mobile sidebar redesign
Role-based menu visibility
Operational modules
Major database redesign
```

## Final Instruction

Implement only:

```text
ERP BASE 002F.3C.4B — Master Data Selects QA Fix
```

Generate the report and stop.
