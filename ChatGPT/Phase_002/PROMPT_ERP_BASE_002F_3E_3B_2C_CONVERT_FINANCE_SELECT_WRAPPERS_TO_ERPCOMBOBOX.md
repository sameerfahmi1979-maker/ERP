# PROMPT_ERP_BASE_002F_3E_3B_2C_CONVERT_FINANCE_SELECTS_TO_ERPCOMBOBOX

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, enterprise ERP UI/UX architect, reusable component architect, shadcn/ui combobox implementation specialist, accessibility reviewer, master-data governance auditor, senior React/Next.js engineer, and Cursor implementation engineer.

## Phase

ERP BASE 002F.3E.3B.2C — Convert Finance Select Wrappers to ERPCombobox

## Prompt Purpose

This is a controlled IMPLEMENTATION prompt.

Implement only the finance select wrapper conversion using the already-created shared `ERPCombobox` base component.

This phase continues after:

```text
ERP BASE 002F.3E.3B.2A — Implement Base ERPCombobox and LookupSelect Wrapper
ERP BASE 002F.3E.3B.2B — Convert Geography Select Wrappers to ERPCombobox
```

3B.2A created the shared ERPCombobox base and converted LookupSelect.
3B.2B converted CountrySelect, EmirateSelect, CitySelect, and AreaZoneSelect.
Sameer confirmed the geography comboboxes are working fine in the browser.

For this phase, convert only these finance wrappers:

```text
BankSelect
CurrencySelect
PaymentTermSelect
TaxTypeSelect
```

to internally use `ERPCombobox`.

Do not modify geography selects.

Do not modify LookupSelect unless a small compatibility fix is absolutely required.

Do not modify Customer form directly unless required by build/runtime errors.

Do not modify database schema.

Do not create migrations.

Do not apply SQL.

Do not implement Global Search.

Do not continue to 3B.2D.

---

# 1. Mandatory Standards To Read First

Before implementation, read and follow:

```text
docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md

docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
```

Also review:

```text
ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_UIUX_TECHNICAL_PLAN.md

ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_SQL_REVIEW.sql

ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_RISK_IMPACT_REVIEW.md

ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_NEXT_IMPLEMENTATION_PROMPT_PLAN.md

ERP_BASE_002F_3E_3B_2A_BASE_ERPCOMBOBOX_AND_LOOKUPSELECT_IMPLEMENTATION_REPORT.md

ERP_BASE_002F_3E_3B_2B_GEOGRAPHY_SELECT_WRAPPERS_IMPLEMENTATION_REPORT.md
```

The implementation report must confirm these files were reviewed.

---

# 2. Mandatory Supabase Connection First

Before implementation, connect to the live Supabase project:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

Verify live schema and current data for:

```text
banks
currencies
payment_terms
tax_types
```

Verify:

```text
tables exist
RLS is enabled
columns used by current finance select components exist
active records exist
no SQL changes are required
```

Do not assume column names. Verify from live schema and existing source code.

Expected fields to verify from live schema/source code include, but are not limited to:

```text
banks.id
banks.bank_code
banks.bank_name_en
banks.bank_name_ar
banks.short_name
banks.is_active
banks.sort_order

currencies.id
currencies.currency_code
currencies.currency_name_en
currencies.currency_name_ar
currencies.is_active
currencies.sort_order

payment_terms.id
payment_terms.term_code
payment_terms.term_name_en
payment_terms.term_name_ar
payment_terms.is_active
payment_terms.sort_order

tax_types.id
tax_types.tax_code
tax_types.tax_type_name_en
tax_types.tax_type_name_ar
tax_types.is_active
tax_types.sort_order
```

If exact field names differ, use the actual live schema and document the difference.

The implementation report must include:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
Live database schema was inspected before converting finance select wrappers to ERPCombobox.
```

If Supabase connection fails, stop and create a BLOCKED report.

Do not implement without live verification.

---

# 3. Scope

## In Scope

```text
Refactor BankSelect to internally use ERPCombobox.
Refactor CurrencySelect to internally use ERPCombobox.
Refactor PaymentTermSelect to internally use ERPCombobox.
Refactor TaxTypeSelect to internally use ERPCombobox.

Preserve all public component names.
Preserve all import paths.
Preserve all existing public props.
Preserve value/onValueChange behavior.
Preserve includeInactive behavior.
Preserve showCode behavior.
Preserve language en/ar behavior.
Preserve allowClear behavior.
Preserve disabled behavior.
Preserve required behavior.
Preserve error behavior.
Preserve loading/empty states.
Preserve bank short_name search behavior if existing or useful.
Test Customer form Commercial/Finance tab.
Test Customer Bank Details dialog if it uses BankSelect/CurrencySelect.
Generate implementation report.
```

## Out of Scope

```text
LookupSelect refactor, except small compatibility fix if absolutely required

Geography components:
- CountrySelect
- EmirateSelect
- CitySelect
- AreaZoneSelect

Remaining select components:
- PortSelect
- OwnerCompanySelect
- BranchSelect
- UOMCategorySelect
- UnitOfMeasureSelect
- UnitByCategorySelect
- CostCenterSelect
- ProfitCenterSelect

Customer form direct refactor
Required field marker implementation
Save / Save & Close / Cancel implementation
Safe close implementation
Customer drawer performance optimization
Global Search implementation
AI implementation
DMS implementation
Database migration
SQL execution
```

---

# 4. Files To Inspect

Inspect existing files before editing:

```text
src/components/erp/combobox/erp-combobox.tsx
src/components/erp/combobox/types.ts
src/components/erp/combobox/index.ts

src/components/erp/finance-basics/bank-select.tsx
src/components/erp/finance-basics/currency-select.tsx
src/components/erp/finance-basics/payment-term-select.tsx
src/components/erp/finance-basics/tax-type-select.tsx
src/components/erp/finance-basics/index.ts

src/features/master-data/customers/components/customer-form-drawer.tsx
src/features/master-data/customers/components/customer-bank-details-section.tsx

src/components/ui/command.tsx
src/components/ui/popover.tsx
src/components/ui/button.tsx
src/components/ui/badge.tsx
src/components/ui/label.tsx

src/lib/supabase/client.ts
src/lib/supabase/server.ts
src/lib/rbac/check.ts
```

If exact paths differ, find the actual paths and document in the report.

---

# 5. Files To Modify

Modify only:

```text
src/components/erp/finance-basics/bank-select.tsx
src/components/erp/finance-basics/currency-select.tsx
src/components/erp/finance-basics/payment-term-select.tsx
src/components/erp/finance-basics/tax-type-select.tsx
```

Modify `src/components/erp/finance-basics/index.ts` only if export compatibility requires it.

Modify `ERPCombobox` only if a small reusable compatibility fix is necessary and does not break 3B.2A / LookupSelect / 3B.2B geography wrappers. If modified, document exactly why and retest LookupSelect + geography wrappers at least at build/typecheck level.

Do not modify Customer form directly unless build/runtime errors prove it is required. If that happens, document it clearly.

---

# 6. Finance Wrapper Requirements

All finance select components must remain public wrappers that internally use `ERPCombobox`.

They must not duplicate Popover + Command logic.

They must fetch their own data exactly as before, map rows to `ERPComboboxOption[]`, and pass options to `ERPCombobox`.

---

## 6.1 BankSelect Requirements

Refactor:

```text
src/components/erp/finance-basics/bank-select.tsx
```

Preserve all existing props, including if present:

```text
value
onValueChange
placeholder
disabled
required
includeInactive
language
showCode
allowClear
className
name
error
```

Expected behavior:

```text
fetch banks from banks table/source
respect includeInactive
map to ERPComboboxOption[]
value = bank.id
label = bank.bank_name_en
labelAr = bank.bank_name_ar
code = bank.bank_code
description = bank.short_name if available
raw = bank
search by bank_code, bank_name_en, bank_name_ar, short_name
```

Do not change value type.

`onValueChange` must still return:

```text
number | null
```

---

## 6.2 CurrencySelect Requirements

Refactor:

```text
src/components/erp/finance-basics/currency-select.tsx
```

Preserve all existing props, including if present:

```text
value
onValueChange
placeholder
disabled
required
includeInactive
language
showCode
allowClear
className
name
error
```

Expected behavior:

```text
fetch currencies from currencies table/source
respect includeInactive
map to ERPComboboxOption[]
value = currency.id
label = currency.currency_name_en
labelAr = currency.currency_name_ar
code = currency.currency_code
raw = currency
search by currency_code, currency_name_en, currency_name_ar
```

Do not change value type.

`onValueChange` must still return:

```text
number | null
```

---

## 6.3 PaymentTermSelect Requirements

Refactor:

```text
src/components/erp/finance-basics/payment-term-select.tsx
```

Preserve all existing props, including if present:

```text
value
onValueChange
placeholder
disabled
required
includeInactive
language
showCode
allowClear
className
name
error
```

Expected behavior:

```text
fetch payment_terms from payment_terms table/source
respect includeInactive
map to ERPComboboxOption[]
value = payment_term.id
label = payment_term.term_name_en
labelAr = payment_term.term_name_ar
code = payment_term.term_code
raw = payment_term
search by term_code, term_name_en, term_name_ar
```

Do not change value type.

`onValueChange` must still return:

```text
number | null
```

---

## 6.4 TaxTypeSelect Requirements

Refactor:

```text
src/components/erp/finance-basics/tax-type-select.tsx
```

Preserve all existing props, including if present:

```text
value
onValueChange
placeholder
disabled
required
includeInactive
language
showCode
allowClear
className
name
error
```

Expected behavior:

```text
fetch tax_types from tax_types table/source
respect includeInactive
map to ERPComboboxOption[]
value = tax_type.id
label = tax_type.tax_type_name_en
labelAr = tax_type.tax_type_name_ar
code = tax_type.tax_code
raw = tax_type
search by tax_code, tax_type_name_en, tax_type_name_ar
```

Do not change value type.

`onValueChange` must still return:

```text
number | null
```

---

# 7. ERPCombobox Usage Requirements

All four wrappers must import from:

```text
src/components/erp/combobox
```

or the actual export path created in 3B.2A.

They must pass:

```text
value
onValueChange
options
placeholder
searchPlaceholder
disabled/readOnly
required
loading
error
allowClear
showCode
language
emptyText
noResultsText
name
className
```

as applicable.

Do not copy Popover + Command implementation into each wrapper.

---

# 8. Customer Form Tests Required

After implementation, test finance fields in the Customer drawer.

## Commercial / Finance tab

```text
Currency
Payment Term
Tax Type
```

## Customer Bank Details dialog / section

```text
Bank
Currency
Account Type if LookupSelect is used
```

Test in:

```text
Add mode
Edit mode
View mode
```

## Required manual/browser tests

```text
Open Customers page
Open Add Customer drawer
Go to Commercial / Finance tab
Verify Currency is Combobox behavior
Search Currency by code, English, Arabic if data exists
Select Currency
Clear Currency if optional
Verify Payment Term is Combobox behavior
Search Payment Term by code, English, Arabic if data exists
Select Payment Term
Clear Payment Term if optional
Verify Tax Type is Combobox behavior
Search Tax Type by code, English, Arabic if data exists
Select Tax Type
Clear Tax Type if optional

Go to Customer Bank Details section/dialog
Open Add Bank Detail
Verify Bank is Combobox behavior
Search Bank by bank_code
Search Bank by English name
Search Bank by Arabic name if data exists
Search Bank by short_name if available
Select Bank
Verify Currency combobox works in Bank Details if present
Open Edit Customer drawer
Verify existing selected finance values display correctly
Open View Customer drawer
Verify finance comboboxes are disabled/read-only
Verify keyboard navigation works:
- Enter opens
- arrow keys navigate
- Enter selects
- Escape closes
Verify no console errors
Verify no horizontal scroll
```

---

# 9. Build / Quality Tests Required

Run:

```bash
npm run typecheck
npm run lint
npm run build
```

If any fail, fix before report.

Do not mark PASS if typecheck or build fails.

If lint fails due only to pre-existing unrelated issues, document clearly:

```text
lint has pre-existing unrelated issues; no new lint issues introduced by this phase
```

---

# 10. Browser / Manual Testing

Use Playwright if available.

If Playwright is not available, perform manual browser tests and document clearly.

If browser tests cannot be performed, mark report as:

```text
PASS WITH NOTES
```

not full PASS.

---

# 11. Required Implementation Report

Create:

```text
ERP_BASE_002F_3E_3B_2C_FINANCE_SELECT_WRAPPERS_IMPLEMENTATION_REPORT.md
```

The report must include:

1. Phase name.
2. Date/time.
3. Supabase connection confirmation.
4. Standards files read confirmation.
5. Planning files read confirmation.
6. Files modified.
7. Whether ERPCombobox was modified or not.
8. BankSelect wrapper refactor summary.
9. CurrencySelect wrapper refactor summary.
10. PaymentTermSelect wrapper refactor summary.
11. TaxTypeSelect wrapper refactor summary.
12. Backward compatibility confirmation.
13. Search field confirmation.
14. Customer form Commercial/Finance testing results.
15. Customer Bank Details testing results.
16. Keyboard/accessibility testing results.
17. Typecheck result.
18. Lint result.
19. Build result.
20. Browser/manual testing result.
21. Known notes/limitations.
22. Final status.

Final status must be exactly one of:

```text
PASS — 3B.2C finance select wrappers converted to ERPCombobox and verified successfully.
PASS WITH NOTES — 3B.2C implemented with non-blocking notes.
FAIL — 3B.2C requires correction before approval.
BLOCKED — 3B.2C could not be completed due to blocking issue.
```

---

# 12. Stop Condition

After converting the four finance wrappers, testing, and creating the report, stop.

Do not continue to:

```text
3B.2D — Customer Form Final QA
```

Do not implement remaining wrappers.

Do not implement global search.

Wait for Sameer/Dina review and approval.

---

# Final Instruction

Read both standards guides.

Connect to Supabase.

Verify live finance schema.

Convert only BankSelect, CurrencySelect, PaymentTermSelect, and TaxTypeSelect to use ERPCombobox internally.

Run tests.

Create implementation report.

Stop.
