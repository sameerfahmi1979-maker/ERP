# PROMPT_ERP_BASE_002F_3E_3B_3_REQUIRED_FIELD_MARKERS_AND_FORM_FOOTER_STANDARD

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, enterprise ERP UI/UX architect, reusable form-component architect, accessibility reviewer, master-data governance auditor, senior React/Next.js engineer, and Cursor implementation engineer.

## Phase

ERP BASE 002F.3E.3B.3 — Required Field Markers and Form Footer Standard

## Prompt Purpose

This is a controlled IMPLEMENTATION prompt.

Implement the global required-field marker standard and global form footer button standard for the Customer module first, using reusable shared components/patterns where practical.

This phase continues after:

```text
ERP BASE 002F.3E.3B.2 — Customer-facing Global Combobox Foundation: CLOSED
```

Completed and verified before this phase:

```text
ERPCombobox base component
LookupSelect wrapper
Geography select wrappers
Finance select wrappers
Customer Form Final QA
```

Now implement:

```text
Required red asterisk (*) for required fields.
Consistent validation/error visual behavior where applicable.
Standard footer buttons:
- Cancel
- Save
- Save & Close
```

Focus on Customer main form and Customer child dialogs only.

Do not implement Safe Close / Unsaved Changes confirmation in this phase. That is next phase 3B.4.

Do not implement Customer drawer performance optimization.

Do not implement Global Search.

Do not implement DMS.

Do not modify database schema.

Do not create migrations.

Do not apply SQL.

---

# 1. Mandatory Standards To Read First

Before implementation, read and follow:

```text
docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md

docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
```

Also review the latest relevant reports:

```text
ERP_BASE_002F_3E_3B_2D_CUSTOMER_FORM_FINAL_QA_REPORT.md

ERP_BASE_002F_3E_3B_2A_BASE_ERPCOMBOBOX_AND_LOOKUPSELECT_IMPLEMENTATION_REPORT.md

ERP_BASE_002F_3E_3B_2B_GEOGRAPHY_SELECT_WRAPPERS_IMPLEMENTATION_REPORT.md

ERP_BASE_002F_3E_3B_2C_FINANCE_SELECT_WRAPPERS_IMPLEMENTATION_REPORT.md
```

The implementation report must confirm these files were reviewed.

---

# 2. Mandatory Supabase Connection First

Before implementation, connect to the live Supabase project:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

Verify live schema for the Customer module:

```text
customers
customer_contacts
customer_addresses
customer_bank_details
global_lookup_values
countries
emirates
cities
areas_zones
banks
currencies
payment_terms
tax_types
```

Verify required / nullable fields from live schema and current validation schemas.

Important:

```text
Do not assume required fields only from UI.
Use live DB schema + current Zod validation schemas + existing form logic as source of truth.
If DB nullable and Zod requires a field, treat it as business-required and mark required in UI.
If DB NOT NULL but UI currently does not collect it directly, document the handling.
```

The implementation report must include:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
Live database schema was inspected before implementing required field markers and form footer standard.
```

If Supabase connection fails, stop and create a BLOCKED report.

Do not implement without live verification.

---

# 3. Scope

## In Scope

```text
Implement required red asterisk (*) standard.
Apply required markers to Customer main form required fields.
Apply required markers to Customer child dialogs required fields.
Ensure required markers work with normal inputs, textareas if any, comboboxes, date fields, number fields, email/phone fields.
Ensure error/validation message display is consistent where practical.
Implement or standardize form footer buttons for Customer main drawer:
- Cancel
- Save
- Save & Close
Implement or standardize form footer buttons for child dialogs:
- Cancel
- Save
- Save & Close
Ensure View mode shows Close only where practical.
Preserve existing save behavior.
Preserve existing add/edit/view behavior.
Preserve all data-saving server actions.
Run tests and create report.
```

## Out of Scope

```text
Safe close / unsaved changes confirmation
Outside-click blocking
Dirty-state dialog
Modal sizing changes beyond footer integration
Customer drawer performance optimization
Global Search
AI
DMS
Vendors/Subcontractors/Consultants modules
Remaining 8 unused select wrappers
Database migration
SQL execution
```

---

# 4. Files To Inspect

Inspect current files before editing.

At minimum:

```text
src/components/ui/label.tsx
src/components/ui/input.tsx
src/components/ui/textarea.tsx
src/components/ui/button.tsx
src/components/ui/dialog.tsx
src/components/ui/sheet.tsx

src/components/erp/erp-drawer-form.tsx
src/components/erp/erp-drawer-section.tsx
src/components/erp/erp-field-grid.tsx
src/components/erp/erp-form-footer.tsx
src/components/erp/combobox/erp-combobox.tsx

src/features/master-data/customers/components/customer-form-drawer.tsx
src/features/master-data/customers/components/customer-contacts-section.tsx
src/features/master-data/customers/components/customer-addresses-section.tsx
src/features/master-data/customers/components/customer-bank-details-section.tsx

src/features/master-data/customers/validation.ts
src/features/master-data/customers/types.ts

src/server/actions/master-data/customers.ts
src/server/actions/master-data/customer-contacts.ts
src/server/actions/master-data/customer-addresses.ts
src/server/actions/master-data/customer-bank-details.ts
```

If exact paths differ, find actual paths and document in the report.

---

# 5. Files To Create or Modify

## Preferred Shared Components

If not already existing or incomplete, create/update reusable shared components:

```text
src/components/erp/required-label.tsx
```

or enhance existing:

```text
src/components/ui/label.tsx
```

Use the least disruptive approach.

If `Label` already supports a `required` prop, reuse it.

If not, create a small `ERPRequiredLabel` or `RequiredLabel` component and use it only in Customer module for this phase.

## Preferred Footer Component

If existing:

```text
src/components/erp/erp-form-footer.tsx
```

use/enhance it.

If missing, create:

```text
src/components/erp/erp-form-footer.tsx
```

Required footer behavior:

```text
Add/Edit mode:
- Cancel
- Save
- Save & Close

View mode:
- Close only

Submitting:
- disable buttons
- show "Saving..." or loading state on active save button if current pattern supports it
```

## Customer Files To Modify

Likely files:

```text
src/features/master-data/customers/components/customer-form-drawer.tsx
src/features/master-data/customers/components/customer-contacts-section.tsx
src/features/master-data/customers/components/customer-addresses-section.tsx
src/features/master-data/customers/components/customer-bank-details-section.tsx
```

Only modify other files if required and document why.

---

# 6. Required Field Marker Standard

## 6.1 Visual Standard

Required fields must display:

```text
Label text + red asterisk (*)
```

Example:

```text
Customer Name (English) *
```

The `*` must be:

```text
red / destructive color
small spacing from label
not part of the saved field value
visible in Add and Edit modes
visible in View mode only if the label still appears and it does not look confusing
```

Recommended class:

```text
text-destructive ml-1
```

or equivalent existing design token.

## 6.2 Error Message Standard

Where form validation errors already exist, keep or improve:

```text
red border on field only when error exists
error message below field
do not show errors on initial untouched form unless current form already does
```

Do not overbuild validation logic. This phase is primarily marker/footer standard.

## 6.3 Required Source of Truth

Use combined source of truth:

```text
live DB NOT NULL fields
current Zod validation
current server action required fields
current business logic
```

If conflict exists:

```text
Zod/server action required business fields should be treated as required in UI.
DB-only system fields such as id, created_at, updated_at, created_by, updated_by are not shown as required user fields.
Auto-generated code fields are not marked with normal required star unless already displayed as required by standard; they should show Auto-generated on save.
```

---

# 7. Customer Main Form Required Fields

Identify actual required fields from live schema and validation, but expected likely required fields include:

```text
Customer Name (English)
Customer Type
Status
```

Possible required fields depending on validation/source:

```text
Legal Name / Display Name if present
Country if currently required by validation
TRN if required by business validation only when VAT applies
Currency if required by finance logic
Payment Term if required by finance logic
```

Do not invent requirements. Verify first.

For each required field:

```text
add required marker
ensure component receives required prop where applicable
ensure error display remains correct
```

Combobox fields should receive:

```text
required={true}
```

where applicable.

---

# 8. Customer Child Dialog Required Fields

Inspect actual child validation schemas and mark required fields accordingly.

## 8.1 Customer Contacts

Expected likely required fields may include:

```text
Contact Name
Mobile / Phone or Email depending validation
Contact Type if validation requires
```

Verify from schema.

Apply required markers only to fields that are required.

## 8.2 Customer Addresses

Expected likely required fields may include:

```text
Address Type
Address Line 1
Country / Emirate / City if validation requires
```

Verify from schema.

## 8.3 Customer Bank Details

Expected likely required fields may include:

```text
Bank
Account Name
Account Number / IBAN
Currency if validation requires
```

Verify from schema.

---

# 9. Form Footer Standard

## 9.1 Main Customer Drawer Footer

In Add/Edit mode, the Customer drawer footer must show:

```text
Cancel | Save | Save & Close
```

Button behavior:

```text
Cancel:
- closes or triggers existing cancel behavior
- DO NOT implement unsaved changes confirmation in this phase

Save:
- saves data
- keeps drawer open
- refreshes current record/list as current logic supports
- in Add mode, if current logic cannot keep drawer open after save without larger refactor, document and implement safely

Save & Close:
- saves data
- closes drawer after successful save
- refreshes list
```

If current Customer form already has similar buttons, standardize labels/order/styling without breaking behavior.

## 9.2 View Mode Footer

In View mode:

```text
Close only
```

No Save buttons in View mode.

## 9.3 Child Dialog Footer

For child Add/Edit dialogs:

```text
Cancel | Save | Save & Close
```

View mode if exists:

```text
Close only
```

If existing child dialogs do not support View mode, document as not applicable.

## 9.4 Button Order

Use this order left-to-right:

```text
Cancel
Save
Save & Close
```

If footer is right-aligned, keep visual order consistent.

## 9.5 Loading / Disabled State

During submit:

```text
disable footer buttons if current form state supports it
show Saving... on active save action if practical
prevent double submit
```

Do not overbuild if current architecture does not track active button. Use safe minimal enhancement.

---

# 10. Preserve Existing Behavior

Do not break:

```text
Add Customer
Edit Customer
View Customer
Customer save
Customer update
Customer contacts add/edit/delete
Customer addresses add/edit/delete
Customer bank details add/edit/delete
Combobox behavior from 3B.2
Auto-generated customer code behavior
Documents placeholder
Audit/System tab
Permissions behavior
```

Do not modify server actions unless absolutely necessary. This phase should mostly be UI component/form work.

---

# 11. Testing Requirements

## 11.1 Static Checks

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
if lint fails due this phase changes, fix before report
```

## 11.2 Browser / Manual Tests

Use Playwright if available.

If not available, perform manual browser testing or document user-required tests.

If browser testing cannot be performed, report status must be:

```text
PASS WITH NOTES
```

not full PASS.

## 11.3 Required Manual Test Cases

Test Customer main drawer:

```text
Open Add Customer
Required markers visible on required fields
Optional fields have no red star
Combobox required fields still work
Save works
Save keeps drawer open if implemented
Save & Close saves and closes
Cancel works

Open Edit Customer
Required markers visible
Save works
Save & Close works
Cancel works

Open View Customer
No edit footer buttons shown
Close only
Fields read-only/disabled
```

Test child dialogs:

```text
Open Add Contact
Required markers visible
Cancel / Save / Save & Close visible
Save works
Save & Close works

Open Add Address
Required markers visible
Cancel / Save / Save & Close visible
Save works
Save & Close works

Open Add Bank Detail
Required markers visible
Cancel / Save / Save & Close visible
Save works
Save & Close works
```

Test no regressions:

```text
Lookup comboboxes still search/select
Geography comboboxes still cascade
Finance comboboxes still search/select
No console errors
No horizontal scroll
```

---

# 12. Required Implementation Report

Create:

```text
ERP_BASE_002F_3E_3B_3_REQUIRED_FIELD_MARKERS_AND_FORM_FOOTER_IMPLEMENTATION_REPORT.md
```

The report must include:

1. Phase name.
2. Date/time.
3. Supabase connection confirmation.
4. Standards files read confirmation.
5. Reports reviewed.
6. Files created.
7. Files modified.
8. Required field source-of-truth analysis.
9. Customer main form required fields updated.
10. Customer contacts required fields updated.
11. Customer addresses required fields updated.
12. Customer bank details required fields updated.
13. Main drawer footer implementation summary.
14. Child dialog footer implementation summary.
15. View mode footer behavior.
16. Backward compatibility confirmation.
17. Static test results: typecheck/lint/build.
18. Browser/manual test results.
19. Known notes/limitations.
20. Final status.

Final status must be exactly one of:

```text
PASS — Required field markers and form footer standard implemented and verified successfully.
PASS WITH NOTES — Required field markers and form footer standard implemented with non-blocking notes.
FAIL — Required field markers and form footer standard requires correction before approval.
BLOCKED — Required field markers and form footer standard could not be completed due to blocking issue.
```

---

# 13. Stop Condition

After implementing required markers, standardized footers, running tests, and creating the report, stop.

Do not continue to:

```text
ERP BASE 002F.3E.3B.4 — Safe Close, Unsaved Changes, and Modal Layout Standard
```

Wait for Sameer/Dina review and approval.

---

# Final Instruction

Read standards.

Connect to Supabase.

Verify required fields.

Implement required markers and footer buttons for Customer module only.

Run tests.

Create implementation report.

Stop.
