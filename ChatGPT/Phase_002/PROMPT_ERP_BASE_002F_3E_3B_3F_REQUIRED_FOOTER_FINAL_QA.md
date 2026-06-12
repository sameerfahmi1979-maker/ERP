# PROMPT_ERP_BASE_002F_3E_3B_3F_REQUIRED_FOOTER_FINAL_QA

Act as a senior ERP QA lead, Supabase/PostgreSQL schema auditor, SaaS security tester, Next.js runtime tester, Playwright automation engineer, enterprise ERP UI/UX architect, accessibility reviewer, reusable form-component reviewer, regression-test planner, master-data governance auditor, and Cursor QA engineer.

## Phase

ERP BASE 002F.3E.3B.3F — Final Required/Footer QA

## Prompt Purpose

This is a FINAL QA / VERIFICATION prompt.

Do not implement new features.

Do not refactor source code unless a direct blocker is found and the fix is small, safe, and documented.

Do not modify database schema.

Do not create migrations.

Do not apply SQL.

Do not start Safe Close.

Do not implement outside-click prevention.

Do not implement dirty-state tracking.

Do not implement unsaved-changes confirmation.

This phase verifies the completed rollout of:

```text
Required field marker standard
Form footer standard
View mode Close-only footer
Auth form RequiredLabel standard
```

across all currently implemented forms from phases:

```text
3B.3 — Customer Required/Footer
3B.3C — Admin/System Required/Footer
3B.3D — Core Master Data Required/Footer
3B.3E — Standalone Auth RequiredLabel
```

The goal is to confirm whether the full required/footer rollout can be closed before moving to:

```text
ERP BASE 002F.3E.3B.4 — Safe Close, Unsaved Changes, and Modal Layout Standard
```

---

# 1. Mandatory Standards To Read First

Before QA, read and follow:

```text
docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md

docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
```

Also review these phase reports:

```text
ERP_BASE_002F_3E_3B_3_REQUIRED_FIELD_MARKERS_AND_FORM_FOOTER_IMPLEMENTATION_REPORT.md

ERP_BASE_002F_3E_3B_3B_GLOBAL_REQUIRED_FIELDS_AND_FOOTER_AUDIT_PLAN.md

ERP_BASE_002F_3E_3B_3B_REQUIRED_FIELDS_MODULE_MATRIX.md

ERP_BASE_002F_3E_3B_3B_FOOTER_STANDARD_ROLLOUT_MATRIX.md

ERP_BASE_002F_3E_3B_3B_NEXT_IMPLEMENTATION_PROMPT_PLAN.md

ERP_BASE_002F_3E_3B_3C_COMPLETION_FIX_NUMBERING_ASSIGN_ROLE_QA_REPORT.md

ERP_BASE_002F_3E_3B_3D_REPORT_CORRECTION_AND_QA_CLOSURE_REPORT.md

ERP_BASE_002F_3E_3B_3E_STANDALONE_AUTH_FORMS_REQUIREDLABEL_IMPLEMENTATION_REPORT.md
```

If any file is missing, document it and continue using current source code.

The final QA report must confirm all reviewed files.

---

# 2. Mandatory Supabase Connection First

Before QA, connect to live Supabase:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

Verify live availability/status for relevant tables and auth context:

```text
customers
customer_contacts
customer_addresses
customer_bank_details

roles
user_profiles
user_roles
role_permissions
owner_companies
branches
global_numbering_rules

countries
emirates
cities
areas_zones
ports

banks
currencies
payment_terms
tax_types
cost_centers
profit_centers

uom_categories
units_of_measure
uom_conversions

global_lookup_categories
global_lookup_values

auth.users
```

Important:

```text
Some Core Master Data tables may be preparatory or not fully migrated in live DB.
If any expected table is missing, do not invent results.
Document the actual live schema status and classify browser/data QA accordingly.
```

The final QA report must include:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
Live schema/auth context was inspected before final Required/Footer QA.
No database changes were required.
```

If Supabase connection fails, continue source/static QA if possible, but final status must be:

```text
BLOCKED
```

or:

```text
PASS WITH NOTES
```

depending on severity, with clear explanation.

---

# 3. QA Scope

## In Scope

Final QA for required markers and footer standards across:

## Customer Module

```text
Customer main drawer
Customer Contacts dialog
Customer Addresses dialog
Customer Bank Details dialog
```

## Admin/System Forms

```text
Roles Form
Add User Dialog
Edit User Dialog
Assign Role Dialog
Organization Form
Branch Form
Numbering Rule Form
```

## Core Master Data Forms

```text
Country Form
Emirate Form
City Form
Area/Zone Form
Port Form

Bank Form
Currency Form
Payment Term Form
Tax Type Form
Cost Center Form
Profit Center Form

UOM Category Form
Unit of Measure Form
UOM Conversion Form

Lookup Category Form
Lookup Value Form
```

## Standalone Auth Forms

```text
Login Form
Signup Form
Forgot Password Form
Reset Password Form
```

## Standards To Verify

```text
Required red asterisk appears only on real required fields.
Optional fields do not show red asterisk.
Auto-generated / read-only / system fields are not incorrectly marked.
Add/Edit ERP forms show Cancel | Save | Save & Close.
View mode ERP forms show Close only.
Standalone auth forms use RequiredLabel but keep auth-specific buttons.
Action dialog exceptions are documented and valid, especially Assign Role.
Safe Close is not implemented yet and remains deferred to 3B.4.
```

## Out of Scope

```text
new implementation
large refactor
Safe Close / Unsaved Changes
outside-click prevention
dirty-state tracking
confirmation dialogs
database migration
SQL execution
Global Search
AI
DMS
party master implementation
```

---

# 4. Files / Areas To Inspect

Inspect reusable components:

```text
src/components/erp/required-label.tsx
src/components/erp/erp-form-footer.tsx
src/components/erp/erp-drawer-form.tsx
src/components/ui/label.tsx
src/components/ui/input.tsx
src/components/ui/button.tsx
src/components/ui/dialog.tsx
src/components/ui/sheet.tsx
```

Inspect implemented forms:

```text
src/features/master-data/customers/components/customer-form-drawer.tsx
src/features/master-data/customers/components/customer-contacts-section.tsx
src/features/master-data/customers/components/customer-addresses-section.tsx
src/features/master-data/customers/components/customer-bank-details-section.tsx

src/features/roles/role-form-dialog.tsx
src/features/users/add-user-dialog.tsx
src/features/users/user-edit-dialog.tsx
src/features/users/assign-role-dialog.tsx
src/features/organizations/organization-form-dialog.tsx
src/features/branches/branch-form-dialog.tsx
src/features/numbering/components/numbering-rule-form-dialog.tsx

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

src/features/auth/login-form.tsx
src/features/auth/signup-form.tsx
src/features/auth/forgot-password-form.tsx
src/features/auth/reset-password-form.tsx
```

If paths differ, discover actual paths and document.

---

# 5. QA Checks — Reusable Components

Verify `RequiredLabel`:

```text
renders red asterisk only when required prop is true
uses correct styling
does not break Label htmlFor/accessibility
works with normal inputs, comboboxes, selects, checkboxes where applicable
```

Verify `ERPFormFooter`:

```text
Add mode shows Cancel | Save | Save & Close
Edit mode shows Cancel | Save | Save & Close
View mode shows Close only
buttons disable during submit
active save state works if supported
does not implement safe-close behavior
does not force footer onto auth forms
```

---

# 6. QA Checks — Required Field Markers

For each form, verify:

```text
required fields from Zod/server action/live schema use RequiredLabel
optional fields use normal Label
auto-generated fields are not marked required unless user must input them
computed/read-only/system fields are not marked required
conditional required fields are correctly handled/documented
```

Create a QA matrix with:

```text
module
form
required fields expected
required fields found in UI/code
missing markers
incorrect markers
status
notes
```

---

# 7. QA Checks — Footer Standards

For each ERP Add/Edit form, verify:

```text
Cancel button exists
Save button exists
Save & Close button exists
button order is correct
Save keeps form open where implemented
Save & Close closes after successful save
Cancel closes without safe-close confirmation in this phase
```

For each View mode form, verify:

```text
Close only
No Save
No Save & Close
fields are read-only/disabled as current logic supports
```

For auth forms, verify:

```text
ERPFormFooter is not used
auth-specific button pattern is preserved
RequiredLabel is applied to required fields
```

For action dialogs, verify:

```text
exception is documented
Save / Save & Close semantics truly do not apply
required labels are still correct
```

At minimum, verify Assign Role:

```text
Assign Role approved as action-dialog exception
RequiredLabel applied to Role and conditional scope fields
Footer remains Cancel | Assign Role
```

---

# 8. Static Testing Requirements

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
if lint fails due pre-existing unrelated issues, document exact status
if lint fails due required/footer rollout changes, fix or mark FAIL
```

---

# 9. Browser / Manual QA Requirements

Use Playwright if available and authenticated session can be used.

If authenticated testing is not available, document:

```text
Manual browser QA pending due authentication/session limitation.
```

If browser QA is pending, final status cannot be full PASS unless static/source QA is extremely strong and user confirms manually. Use:

```text
PASS WITH NOTES
```

## Required Browser QA Matrix

At minimum, create a checklist for:

```text
Customer main form + child dialogs
Admin/System forms
Core Master Data forms
Auth forms
```

For each, include:

```text
Add mode
Edit mode
View mode if available
Required marker visual check
Footer check
Save / Save & Close behavior
No console errors
No layout break
```

---

# 10. Safe Close Confirmation

The final QA report must clearly state:

```text
Safe Close / Unsaved Changes / Outside-click prevention was NOT implemented in 3B.3.
```

Current expected issue still pending:

```text
In Add/Edit forms, clicking outside may still close the form.
This is not solved yet.
It is planned for 3B.4.
```

Correct future required behavior for 3B.4:

```text
Add/Edit:
- outside click must not close
- Esc / X / Cancel must ask confirmation if dirty

View:
- outside click can close
- Esc / X / Close can close directly
```

---

# 11. Required Final QA Report

Create:

```text
ERP_BASE_002F_3E_3B_3F_REQUIRED_FOOTER_FINAL_QA_REPORT.md
```

The report must include:

1. Phase name.
2. Date/time.
3. Supabase connection confirmation.
4. Standards reviewed.
5. Reports reviewed.
6. Reusable component QA.
7. Forms inspected.
8. Required marker QA matrix.
9. Footer QA matrix.
10. Auth form QA.
11. Action-dialog exception QA.
12. Static test results: typecheck/lint/build.
13. Browser/manual QA status.
14. Safe Close deferred confirmation.
15. Issues found.
16. Required fixes, if any.
17. Final status.
18. Recommendation: close 3B.3 rollout or require correction.

Final status must be exactly one of:

```text
PASS — Required/Footer rollout fully verified and authenticated browser QA passed.
PASS WITH NOTES — Required/Footer rollout verified by source/static QA, with manual browser QA or minor non-blocking items pending.
FAIL — Required/Footer rollout has issues requiring correction before closure.
BLOCKED — Final Required/Footer QA could not be completed due to blocking issue.
```

---

# 12. Closure Criteria

The 3B.3 Required/Footer rollout can close only if:

```text
RequiredLabel is correctly applied across all implemented required fields.
Optional fields are not incorrectly marked.
ERPFormFooter or approved footer exception is correctly applied.
View mode Close-only is implemented where applicable.
Auth forms keep correct standalone pattern.
Static tests pass.
Browser/manual QA status is documented.
Safe Close is clearly deferred to 3B.4.
```

If browser QA remains pending, the rollout can close only as:

```text
CLOSED WITH NOTES
```

not full clean PASS.

---

# 13. Stop Condition

After completing final QA and generating the report, stop.

Do not proceed to:

```text
ERP BASE 002F.3E.3B.4 — Safe Close, Unsaved Changes, and Modal Layout Standard
```

Wait for Sameer/Dina review and approval.

---

# Final Instruction

Read standards.

Connect to Supabase.

Inspect all required/footer rollout files and implemented forms.

Run typecheck, lint, build.

Document browser/manual QA status.

Confirm Safe Close remains pending.

Create final QA report.

Stop.
