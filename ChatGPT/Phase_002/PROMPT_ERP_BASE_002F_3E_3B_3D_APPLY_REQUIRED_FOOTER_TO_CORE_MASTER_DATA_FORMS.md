# PROMPT_ERP_BASE_002F_3E_3B_3D_APPLY_REQUIRED_FOOTER_TO_CORE_MASTER_DATA_FORMS

Act as a senior ERP QA lead, Supabase/PostgreSQL schema auditor, SaaS security tester, Next.js runtime tester, Playwright automation engineer, enterprise ERP UI/UX architect, reusable form-component architect, accessibility reviewer, master-data governance auditor, senior React/Next.js engineer, and Cursor implementation engineer.

## Phase

ERP BASE 002F.3E.3B.3D — Apply Required Field Markers and Form Footer Standard to Core Master Data Forms

## Prompt Purpose

This is a controlled IMPLEMENTATION prompt.

Apply the approved global required-field marker standard and global form footer standard to Core Master Data forms only.

This phase follows:

```text
ERP BASE 002F.3E.3B.3C — Admin/System Forms Required/Footer Rollout
Status: CLOSED WITH NOTES
```

Approved standard:

```text
Add/Edit mode:
Cancel | Save | Save & Close

View mode:
Close only
```

Important scope separation:

```text
Safe Close / Unsaved Changes / Outside-click behavior is NOT part of this phase.
It is planned for:
ERP BASE 002F.3E.3B.4 — Safe Close, Unsaved Changes, and Modal Layout Standard
```

Do not implement safe close in this phase.

Do not implement outside-click prevention.

Do not implement dirty-state tracking.

Do not implement confirmation dialog.

Do not modify database schema.

Do not create migrations.

Do not apply SQL.

Do not update Admin/System forms in this phase.

Do not update Authentication forms in this phase.

Do not continue to 3B.3E.

---

# 1. Mandatory Standards To Read First

Before implementation, read and follow:

```text
docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md

docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
```

Also review these approved/corrected audit and implementation files:

```text
ERP_BASE_002F_3E_3B_3B_GLOBAL_REQUIRED_FIELDS_AND_FOOTER_AUDIT_PLAN.md

ERP_BASE_002F_3E_3B_3B_REQUIRED_FIELDS_MODULE_MATRIX.md

ERP_BASE_002F_3E_3B_3B_FOOTER_STANDARD_ROLLOUT_MATRIX.md

ERP_BASE_002F_3E_3B_3B_NEXT_IMPLEMENTATION_PROMPT_PLAN.md

ERP_BASE_002F_3E_3B_3C_ADMIN_SYSTEM_FORMS_REQUIRED_FOOTER_IMPLEMENTATION_REPORT.md

ERP_BASE_002F_3E_3B_3C_COMPLETION_FIX_NUMBERING_ASSIGN_ROLE_QA_REPORT.md
```

Also review Customer and reusable component implementation as reference:

```text
ERP_BASE_002F_3E_3B_3_REQUIRED_FIELD_MARKERS_AND_FORM_FOOTER_IMPLEMENTATION_REPORT.md
```

The implementation report must confirm these standards and planning files were reviewed.

---

# 2. Mandatory Supabase Connection First

Before implementation, connect to live Supabase:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

Verify live schema for the Core Master Data forms:

## Geography

```text
countries
emirates
cities
areas_zones
ports
```

## Finance Basics

```text
banks
currencies
payment_terms
tax_types
cost_centers
profit_centers
```

## UOM

```text
uom_categories
units_of_measure
uom_conversions
```

## Lookup Master Data

```text
global_lookup_categories
global_lookup_values
```

Also inspect current validation schemas and server actions for these modules.

The implementation report must include:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
Live database schema was inspected before implementing RequiredLabel and ERPFormFooter for Core Master Data forms.
```

If Supabase connection fails, stop and create a BLOCKED report.

Do not implement without live verification.

---

# 3. Scope

## In Scope

Apply RequiredLabel and ERPFormFooter standards to these 16 Core Master Data forms:

## Geography Forms — 5

```text
1. Country Form
   src/features/master-data/geography/components/country-form-dialog.tsx

2. Emirate Form
   src/features/master-data/geography/components/emirate-form-dialog.tsx

3. City Form
   src/features/master-data/geography/components/city-form-dialog.tsx

4. Area/Zone Form
   src/features/master-data/geography/components/area-form-dialog.tsx

5. Port Form
   src/features/master-data/geography/components/port-form-dialog.tsx
```

## Finance Basics Forms — 6

```text
6. Bank Form
   src/features/master-data/finance-basics/components/bank-form-dialog.tsx

7. Currency Form
   src/features/master-data/finance-basics/components/currency-form-dialog.tsx

8. Payment Term Form
   src/features/master-data/finance-basics/components/payment-term-form-dialog.tsx

9. Tax Type Form
   src/features/master-data/finance-basics/components/tax-type-form-dialog.tsx

10. Cost Center Form
    src/features/master-data/finance-basics/components/cost-center-form-dialog.tsx

11. Profit Center Form
    src/features/master-data/finance-basics/components/profit-center-form-dialog.tsx
```

## UOM Forms — 3

```text
12. UOM Category Form
    src/features/master-data/uom/components/uom-category-form-dialog.tsx

13. Unit of Measure Form
    src/features/master-data/uom/components/unit-form-dialog.tsx

14. UOM Conversion Form
    src/features/master-data/uom/components/conversion-form-dialog.tsx
```

## Lookup Master Data Forms — 2

```text
15. Lookup Category Form
    src/features/master-data/lookups/components/category-form-dialog.tsx

16. Lookup Value Form
    src/features/master-data/lookups/components/value-form-dialog.tsx
```

Implement:

```text
required red asterisks using RequiredLabel
pass required prop to required inputs/comboboxes where applicable
replace or standardize footer to ERPFormFooter
Add/Edit footer = Cancel | Save | Save & Close
View footer = Close only
preserve current save behavior
add Save handler where safe
add Save & Close handler
document any form that cannot safely support Save yet as PASS WITH NOTES
fix view mode bug where save buttons appear in view mode
```

## Out of Scope

```text
Admin/System forms
Authentication forms
Customer forms
Vendor/Subcontractor/Consultant/Government Authority/Recruitment Agency modules
Safe Close / Unsaved Changes
Outside-click prevention
Dirty-state tracking
Confirmation dialog
Global Search
AI
DMS
Database migration
SQL execution
```

---

# 4. Files To Inspect

Inspect current files before editing:

```text
src/components/erp/required-label.tsx
src/components/erp/erp-form-footer.tsx
src/components/erp/erp-drawer-form.tsx
src/components/ui/label.tsx
src/components/ui/input.tsx
src/components/ui/button.tsx
src/components/ui/dialog.tsx
src/components/ui/sheet.tsx

src/features/master-data/geography/components/country-form-dialog.tsx
src/features/master-data/geography/components/emirate-form-dialog.tsx
src/features/master-data/geography/components/city-form-dialog.tsx
src/features/master-data/geography/components/area-form-dialog.tsx
src/features/master-data/geography/components/port-form-dialog.tsx

src/features/master-data/finance-basics/components/bank-form-dialog.tsx
src/features/master-data/finance-basics/components/currency-form-dialog.tsx
src/features/master-data/finance-basics/components/payment-term-form-dialog.tsx
src/features/master-data/finance-basics/components/tax-type-form-dialog.tsx
src/features/master-data/finance-basics/components/cost-center-form-dialog.tsx
src/features/master-data/finance-basics/components/profit-center-form-dialog.tsx

src/features/master-data/uom/components/uom-category-form-dialog.tsx
src/features/master-data/uom/components/unit-form-dialog.tsx
src/features/master-data/uom/components/conversion-form-dialog.tsx

src/features/master-data/lookups/components/category-form-dialog.tsx
src/features/master-data/lookups/components/value-form-dialog.tsx

src/features/master-data/geography/
src/features/master-data/finance-basics/
src/features/master-data/uom/
src/features/master-data/lookups/

src/server/actions/
```

If exact paths differ, discover the actual paths and document them.

---

# 5. Files To Modify

Modify only the 16 Core Master Data form files unless a shared component compatibility fix is absolutely required:

```text
src/features/master-data/geography/components/country-form-dialog.tsx
src/features/master-data/geography/components/emirate-form-dialog.tsx
src/features/master-data/geography/components/city-form-dialog.tsx
src/features/master-data/geography/components/area-form-dialog.tsx
src/features/master-data/geography/components/port-form-dialog.tsx

src/features/master-data/finance-basics/components/bank-form-dialog.tsx
src/features/master-data/finance-basics/components/currency-form-dialog.tsx
src/features/master-data/finance-basics/components/payment-term-form-dialog.tsx
src/features/master-data/finance-basics/components/tax-type-form-dialog.tsx
src/features/master-data/finance-basics/components/cost-center-form-dialog.tsx
src/features/master-data/finance-basics/components/profit-center-form-dialog.tsx

src/features/master-data/uom/components/uom-category-form-dialog.tsx
src/features/master-data/uom/components/unit-form-dialog.tsx
src/features/master-data/uom/components/conversion-form-dialog.tsx

src/features/master-data/lookups/components/category-form-dialog.tsx
src/features/master-data/lookups/components/value-form-dialog.tsx
```

Do not modify RequiredLabel or ERPFormFooter unless a small compatibility issue is discovered and fully documented.

Do not modify server actions unless absolutely necessary. This phase should be UI/form behavior only.

---

# 6. Required Field Marker Rules

Use RequiredLabel for required user-input fields.

Do not mark:

```text
id
created_at
updated_at
created_by
updated_by
system-generated fields
auto-generated codes if shown as read-only/auto-generated
fields with defaults unless user must consciously choose them
computed fields
read-only fields
status checkboxes with defaults unless validation requires conscious selection
```

If a field is required by Zod/server action but nullable in DB, mark it required.

If a field is DB NOT NULL but automatically filled or has a default, document and do not mark as user-required unless the user must input it.

---

# 7. Form-by-Form Required Field Expectations

Verify from live schema + validation first. These are expected starting points from audit.

## 7.1 Geography Forms

### Country

Expected required fields:

```text
Country Code
ISO3 Code
Name (English)
Nationality (English)
```

Do not mark optional:

```text
Name (Arabic)
Nationality (Arabic)
Phone Code
Default Currency Code
```

### Emirate

Expected required fields:

```text
Emirate Code
Name (English)
Country
```

Verify if additional fields are required by validation.

### City

Expected required fields:

```text
City Code
Name (English)
Country
Emirate
```

Verify if additional fields are required by validation.

### Area / Zone

Expected required fields:

```text
Area Code
Name (English)
City
Area Type
```

Verify if additional fields are required by validation.

### Port

Expected required fields:

```text
Port Code
Name (English)
Country
```

Verify if additional fields are required by validation.

---

## 7.2 Finance Basics Forms

### Bank

Expected required fields:

```text
Bank Code
Bank Name (English)
```

Verify if Country is required by validation/business logic.

Do not mark optional:

```text
Bank Name (Arabic)
Short Name
SWIFT Code
Bank Type if optional
```

### Currency

Expected required fields:

```text
Currency Code
Currency Name (English)
Symbol
```

Verify if any additional fields are required.

### Payment Term

Expected required fields:

```text
Payment Term Code
Payment Term Name (English)
Due Days
```

Verify if any additional fields are required.

### Tax Type

Expected required fields:

```text
Tax Code
Tax Name (English)
Tax Rate
Calculation Method
```

Verify if any additional fields are required.

### Cost Center

Expected required fields:

```text
Cost Center Code
Cost Center Name (English)
Cost Center Type
```

Verify if parent cost center / organization / branch fields are required.

### Profit Center

Expected required fields:

```text
Profit Center Code
Profit Center Name (English)
Profit Center Type
```

Verify if parent profit center / organization / branch fields are required.

---

## 7.3 UOM Forms

### UOM Category

Expected required fields:

```text
Category Code
Category Name (English)
```

### Unit of Measure

Expected required fields:

```text
Unit Code
Unit Name (English)
Symbol
Category
```

### UOM Conversion

Expected required fields:

```text
From Unit
To Unit
Conversion Factor
```

Verify if Category / Conversion Type are required by validation.

---

## 7.4 Lookup Forms

### Lookup Category

Expected required fields:

```text
Category Code
Category Name (English)
Category Scope
```

### Lookup Value

Expected required fields:

```text
Lookup Value Code
Lookup Value Name (English)
Category
Sort Order
```

Verify if additional fields are required by validation.

---

# 8. Footer Standard Implementation

For all 16 forms, replace or standardize footer so Add/Edit uses:

```text
Cancel | Save | Save & Close
```

For all forms with View mode, fix the view footer so it shows:

```text
Close
```

only.

## 8.1 Required Behavior

```text
Cancel:
- closes current form/drawer/dialog without saving
- Safe-close confirmation is NOT part of this phase

Save:
- saves data
- keeps form/drawer/dialog open
- refreshes current record/state when possible
- shows success toast if current pattern supports it

Save & Close:
- saves data
- closes form/drawer/dialog after successful save
- refreshes list/table when current pattern supports it
```

## 8.2 View Mode Fix

The 3B.3B footer matrix identified that Core Master Data forms currently show save buttons in View mode.

This is a bug.

Required fix:

```text
When mode/viewMode/isViewing is true:
- fields must remain read-only/disabled as current logic supports
- footer must show Close only
- no Save button
- no Save & Close button
```

## 8.3 Implementation Limitation Handling

If a form cannot safely support Save yet:

```text
Do not invent risky behavior.
Implement Save & Close safely.
Document Save as not fully supported in this form.
Mark report as PASS WITH NOTES.
Create follow-up task for full Save support.
```

But target standard remains:

```text
Cancel | Save | Save & Close
```

---

# 9. Preserve Existing Behavior

Do not break:

```text
country create/update/view
emirate create/update/view
city create/update/view
area/zone create/update/view
port create/update/view

bank create/update/view
currency create/update/view
payment term create/update/view
tax type create/update/view
cost center create/update/view
profit center create/update/view

uom category create/update/view
unit of measure create/update/view
uom conversion create/update/view

lookup category create/update/view
lookup value create/update/view

geography cascading
finance lookup dependencies
uom conversion logic
lookup category/value relationships
permissions behavior
RLS/security behavior
existing validation
existing server actions
existing list refresh behavior
```

---

# 10. Testing Requirements

## 10.1 Static Tests

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
if lint fails only due pre-existing unrelated issues, document clearly
if lint fails due this phase changes, fix before report
```

## 10.2 Browser / Manual Tests

Use Playwright if available.

If not available, perform manual tests or document required manual tests.

If browser testing cannot be performed, final status must be:

```text
PASS WITH NOTES
```

not full PASS.

## 10.3 Required Test Cases

For each of the 16 forms:

```text
Open Add mode where available
Required markers visible only on required fields
Optional fields have no red star
Cancel works
Save works and keeps open, if implemented
Save & Close works and closes
Validation errors still display correctly
No console errors
No horizontal scroll

Open Edit mode where available
Required markers visible
Save works and keeps open, if implemented
Save & Close works and closes
Existing data saves correctly

Open View mode where available
Footer shows Close only
No Save button
No Save & Close button
Fields are read-only/disabled
Close works
```

Specific tests:

## Geography

```text
Country:
- create/edit/view country
- required labels correct

Emirate:
- create/edit/view emirate
- country dependency works

City:
- create/edit/view city
- country/emirate dependency works

Area/Zone:
- create/edit/view area
- city dependency works
- area type works

Port:
- create/edit/view port
- country dependency works
```

## Finance Basics

```text
Bank:
- create/edit/view bank
- country and bank type fields still work

Currency:
- create/edit/view currency
- base currency/default logic still works

Payment Term:
- create/edit/view payment term
- due days validation works

Tax Type:
- create/edit/view tax type
- tax rate validation works
- calculation method works

Cost Center:
- create/edit/view cost center
- parent/type logic works

Profit Center:
- create/edit/view profit center
- parent/type logic works
```

## UOM

```text
UOM Category:
- create/edit/view category

Unit of Measure:
- create/edit/view unit
- category dependency works
- symbol/code fields work

UOM Conversion:
- create/edit/view conversion
- from/to unit logic works
- conversion factor validation works
```

## Lookups

```text
Lookup Category:
- create/edit/view category
- category scope works

Lookup Value:
- create/edit/view value
- category relationship works
- sort order validation works
```

---

# 11. Required Implementation Report

Create:

```text
ERP_BASE_002F_3E_3B_3D_CORE_MASTER_DATA_FORMS_IMPLEMENTATION_REPORT.md
```

The report must include:

1. Phase name.
2. Date/time.
3. Supabase connection confirmation.
4. Standards files read confirmation.
5. Audit/planning files reviewed.
6. Files modified.
7. Required field source-of-truth analysis for each form.
8. Required markers applied per form.
9. Fields intentionally not marked required and why.
10. Footer standard applied per form.
11. View mode footer fix per form.
12. Save / Save & Close support status per form.
13. Any forms that are PASS WITH NOTES due Save limitation.
14. Backward compatibility confirmation.
15. Static test results: typecheck/lint/build.
16. Browser/manual test results.
17. Known issues/limitations.
18. Follow-up tasks.
19. Final status.

Final status must be exactly one of:

```text
PASS — Core Master Data forms required markers and footer standard implemented and verified successfully.
PASS WITH NOTES — Core Master Data forms required markers and footer standard implemented with non-blocking notes.
FAIL — Core Master Data forms required markers and footer standard require correction before approval.
BLOCKED — Core Master Data forms required markers and footer standard could not be completed due to blocking issue.
```

---

# 12. Stop Condition

After updating the 16 Core Master Data forms, running tests, and creating the report, stop.

Do not continue to:

```text
ERP BASE 002F.3E.3B.3E — Standalone Auth Forms RequiredLabel Rollout
```

Do not implement Safe Close.

Do not implement outside-click behavior.

Wait for Sameer/Dina review and approval.

---

# Final Instruction

Read standards.

Connect to Supabase.

Verify live schema and current validation for Core Master Data forms.

Apply RequiredLabel and ERPFormFooter to only the 16 Core Master Data forms.

Target footer:

```text
Cancel | Save | Save & Close
```

View footer:

```text
Close only
```

Do not implement safe close.

Run tests.

Create implementation report.

Stop.
