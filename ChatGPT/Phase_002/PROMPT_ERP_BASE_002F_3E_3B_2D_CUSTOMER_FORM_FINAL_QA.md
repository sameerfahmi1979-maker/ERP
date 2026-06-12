# PROMPT_ERP_BASE_002F_3E_3B_2D_CUSTOMER_FORM_FINAL_QA

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, enterprise ERP UI/UX QA reviewer, reusable component QA auditor, accessibility reviewer, customer module regression tester, and Cursor implementation QA engineer.

## Phase

ERP BASE 002F.3E.3B.2D — Customer Form Final QA

## Prompt Purpose

This is a controlled QA / VERIFICATION prompt.

Do not implement new functionality.

Do not refactor components.

Do not modify database schema.

Do not create migrations.

Do not apply SQL.

Do not implement remaining select components.

Do not implement global search.

Do not continue to 3B.3.

Your task is to perform a final QA review of the Customer module after these phases:

```text
ERP BASE 002F.3E.3B.2A — ERPCombobox Base + LookupSelect Wrapper
ERP BASE 002F.3E.3B.2B — Geography Select Wrappers
ERP BASE 002F.3E.3B.2C — Finance Select Wrappers
```

Sameer confirmed:

```text
3B.2B geography comboboxes are working fine.
3B.2C finance comboboxes are working fine.
```

This phase must verify that the Customer form works end-to-end after the combobox conversions.

---

# 1. Mandatory Standards To Read First

Before QA, read and follow:

```text
docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md

docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
```

Also review these reports/plans:

```text
ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_UIUX_TECHNICAL_PLAN.md

ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_SQL_REVIEW.sql

ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_RISK_IMPACT_REVIEW.md

ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_NEXT_IMPLEMENTATION_PROMPT_PLAN.md

ERP_BASE_002F_3E_3B_2A_BASE_ERPCOMBOBOX_AND_LOOKUPSELECT_IMPLEMENTATION_REPORT.md

ERP_BASE_002F_3E_3B_2B_GEOGRAPHY_SELECT_WRAPPERS_IMPLEMENTATION_REPORT.md

ERP_BASE_002F_3E_3B_2C_FINANCE_SELECT_WRAPPERS_IMPLEMENTATION_REPORT.md
```

The QA report must confirm these files were reviewed.

---

# 2. Mandatory Supabase Connection First

Before QA, connect to the live Supabase project:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

Verify:

```text
customers table exists
customer_contacts table exists
customer_addresses table exists
customer_bank_details table exists
global_lookup_values exists
countries / emirates / cities / areas_zones exist
banks / currencies / payment_terms / tax_types exist
RLS is enabled on relevant tables
No SQL changes are required
```

The QA report must include:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
Live database schema was inspected before Customer Form Final QA.
```

If Supabase connection fails, stop and create a BLOCKED report.

---

# 3. Scope

## In Scope

```text
Final QA of Customer form after Combobox conversions.
Test LookupSelect fields.
Test Geography fields.
Test Finance fields.
Test Customer child dialogs where comboboxes are used.
Test Add mode.
Test Edit mode.
Test View mode.
Test keyboard navigation.
Test clear buttons.
Test disabled/read-only behavior.
Test selected values display.
Test no console errors.
Test no horizontal scroll.
Run typecheck.
Run lint.
Run build.
Create final QA report.
```

## Out of Scope

```text
New feature implementation
Component refactor
Database changes
SQL migration
Global Search
AI
DMS
Required field marker phase
Safe close phase
Performance optimization phase
Vendor/Subcontractor/Consultant modules
Remaining 8 unused select wrappers
```

---

# 4. Files To Inspect

Inspect at least:

```text
src/components/erp/combobox/erp-combobox.tsx
src/components/erp/combobox/types.ts
src/components/erp/lookup-select.tsx

src/components/erp/geography/country-select.tsx
src/components/erp/geography/emirate-select.tsx
src/components/erp/geography/city-select.tsx
src/components/erp/geography/area-zone-select.tsx

src/components/erp/finance-basics/bank-select.tsx
src/components/erp/finance-basics/currency-select.tsx
src/components/erp/finance-basics/payment-term-select.tsx
src/components/erp/finance-basics/tax-type-select.tsx

src/features/master-data/customers/components/customer-form-drawer.tsx
src/features/master-data/customers/components/customer-contacts-section.tsx
src/features/master-data/customers/components/customer-addresses-section.tsx
src/features/master-data/customers/components/customer-bank-details-section.tsx

src/server/actions/master-data/customers.ts
src/server/actions/master-data/customer-contacts.ts
src/server/actions/master-data/customer-addresses.ts
src/server/actions/master-data/customer-bank-details.ts
```

If exact paths differ, find actual paths and document them.

---

# 5. No Code Change Rule

This is a QA-only phase.

Do not edit code unless a critical build-breaking or runtime-breaking issue is discovered.

If a critical issue is found:

```text
Stop.
Do not silently fix.
Create FAIL report with exact issue, file, expected behavior, actual behavior, and recommended correction phase.
```

Only make a correction if the prompt cannot complete without it and the change is tiny, safe, and documented. Otherwise, no code changes.

---

# 6. Required QA Test Suites

## Test Suite 1 — Build / Static Checks

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
lint should be run
if lint fails only due pre-existing unrelated issues, document clearly
if lint fails due combobox/customer changes, mark FAIL
```

---

## Test Suite 2 — Customer Page Load

Verify:

```text
/admin/master-data/customers loads
Customer list loads
No runtime error
No console error
Add Customer button available for permitted user
Drawer opens correctly
```

---

## Test Suite 3 — Add Customer / Basic Info Lookup Comboboxes

Open Add Customer drawer.

Test:

```text
Customer Type
Industry Type
Customer Segment
Lead Source
Status
```

For each:

```text
opens as combobox
search by code works
search by English label works
search by Arabic label works if Arabic data exists
select value works
selected value displays
clear works for optional fields
clear is hidden/disabled for required fields
keyboard navigation works
loading/empty/no-results states are correct
no console errors
```

Special test:

```text
Status color/badge/default display still works if configured.
```

---

## Test Suite 4 — Add Customer / Address & Location Geography Comboboxes

Test:

```text
Country
Emirate / Region
City
Area / Zone
```

Required tests:

```text
Country opens as combobox
Country search by code/name works
Selecting Country enables/loads Emirate
Emirate search by code/name works
Selecting Emirate enables/loads City
City search by code/name works
Selecting City enables/loads Area/Zone
Area/Zone search by code/name works
Changing Country resets Emirate, City, Area/Zone
Changing Emirate resets City, Area/Zone
Changing City resets Area/Zone
Edit mode selected values display
View mode fields disabled/read-only
No console errors
No horizontal scroll
```

---

## Test Suite 5 — Add Customer / Commercial & Finance Comboboxes

Test:

```text
Currency
Payment Term
Tax Type
```

Required tests:

```text
Currency search by code/name works
Currency symbol displays correctly if configured
Payment Term search by code/name works
Tax Type search by code/name works
Tax Type rate displays correctly if configured
Clear buttons work for optional fields
Edit mode selected values display
View mode fields disabled/read-only
No console errors
```

---

## Test Suite 6 — UAE Compliance Lookup Combobox

Test:

```text
ICV Status
```

Required tests:

```text
opens as combobox
search by code works
search by English label works
search by Arabic label works if data exists
clear works if optional
selected value displays
disabled/read-only in View mode
no console errors
```

---

## Test Suite 7 — Customer Contacts Child Dialog

If Customer Contacts uses LookupSelect fields, test:

```text
Contact Type
Designation
Department
```

Required tests:

```text
Open Add Contact
Combobox fields open/search/select correctly
Save Contact works
Open Edit Contact
Selected combobox values display correctly
View/read-only behavior works if applicable
No console errors
```

If these fields are not using LookupSelect yet, document as not applicable.

---

## Test Suite 8 — Customer Addresses Child Dialog

If Customer Addresses uses geography and/or lookup fields, test:

```text
Address Type
Country
Emirate / Region
City
Area / Zone
```

Required tests:

```text
Open Add Address
Address Type lookup combobox works
Geography combobox cascade works
Save Address works
Open Edit Address
Selected values display correctly
View/read-only behavior works if applicable
No console errors
```

If not applicable, document clearly.

---

## Test Suite 9 — Customer Bank Details Child Dialog

Test:

```text
Bank
Currency
Account Type if LookupSelect is used
```

Required tests:

```text
Open Add Bank Detail
Bank combobox search by bank_code works
Bank combobox search by English name works
Bank combobox search by Arabic name works if data exists
Bank combobox search by short_name works if available
Currency combobox search by code/name works
Currency symbol displays correctly
Account Type lookup combobox works if present
Save Bank Detail works
Open Edit Bank Detail
Selected values display correctly
View/read-only behavior works if applicable
No console errors
```

---

## Test Suite 10 — Edit Customer End-to-End

Open an existing customer.

Verify:

```text
all lookup/geography/finance selected values display correctly
comboboxes open and can change values in Edit mode
Save works
Save & Close works if available
data persists after refresh
no console errors
```

---

## Test Suite 11 — View Customer End-to-End

Open existing customer in View mode.

Verify:

```text
all combobox fields are disabled/read-only
selected values display correctly
no popover opens when clicking disabled field
Close works
no console errors
```

---

## Test Suite 12 — Keyboard / Accessibility

For a sample from each group:

```text
LookupSelect
CountrySelect
CurrencySelect
BankSelect
```

Verify:

```text
Tab focuses field
Enter or Space opens combobox
Arrow keys navigate options
Enter selects option
Escape closes popup
Focus visible
role/aria attributes exist where possible
no keyboard trap
```

---

## Test Suite 13 — Responsive / No Horizontal Scroll

Test at:

```text
desktop width
tablet width if possible
mobile/narrow width if possible
```

Verify:

```text
drawer has no horizontal scroll
dialogs have no horizontal scroll
popover does not create horizontal scroll
long labels truncate/wrap safely
```

---

# 7. Required QA Report

Create:

```text
ERP_BASE_002F_3E_3B_2D_CUSTOMER_FORM_FINAL_QA_REPORT.md
```

The report must include:

1. Phase name.
2. Date/time.
3. Supabase connection confirmation.
4. Standards files read confirmation.
5. Planning/implementation reports reviewed.
6. QA environment.
7. Files inspected.
8. Confirmation that no code changes were made, or list of any changes if unavoidable.
9. Test Suite 1 results — typecheck/lint/build.
10. Test Suite 2 results — Customer page load.
11. Test Suite 3 results — Basic Info lookups.
12. Test Suite 4 results — Geography comboboxes.
13. Test Suite 5 results — Finance comboboxes.
14. Test Suite 6 results — UAE Compliance lookup.
15. Test Suite 7 results — Contacts child dialog.
16. Test Suite 8 results — Addresses child dialog.
17. Test Suite 9 results — Bank Details child dialog.
18. Test Suite 10 results — Edit Customer.
19. Test Suite 11 results — View Customer.
20. Test Suite 12 results — keyboard/accessibility.
21. Test Suite 13 results — responsive/no horizontal scroll.
22. Bugs/issues found.
23. Known notes/limitations.
24. Final recommendation.
25. Final status.

Final status must be exactly one of:

```text
PASS — Customer form final QA passed after 3B.2 combobox conversion.
PASS WITH NOTES — Customer form final QA passed with non-blocking notes.
FAIL — Customer form final QA found blocking issues that require correction.
BLOCKED — Customer form final QA could not be completed.
```

---

# 8. Closure Rule

This QA phase closes the Customer-facing combobox conversion only if:

```text
typecheck passes
build passes
no blocking runtime errors
Customer Add/Edit/View works
Lookup/geography/finance comboboxes work
Child dialogs are not broken
No critical console errors
No critical horizontal scroll issue
```

If QA passes, the report must state:

```text
ERP BASE 002F.3E.3B.2 — Customer-facing Global Combobox Foundation is ready to close.
```

Do not close the entire 3B.2E remaining components phase, because remaining unused select wrappers are deferred.

---

# 9. Stop Condition

After QA and report creation, stop.

Do not continue to:

```text
ERP BASE 002F.3E.3B.3 — Required Field Markers and Form Footer Standard
```

Wait for Sameer/Dina review and approval.

---

# Final Instruction

Read standards.

Connect to Supabase.

Run Customer form final QA.

Create QA report.

Stop.
