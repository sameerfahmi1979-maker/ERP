# PROMPT_ERP_BASE_002F_3E_3B_4_SAFE_CLOSE_UNSAVED_CHANGES_AND_MODAL_LAYOUT_STANDARD

Act as a senior ERP QA lead, enterprise ERP UI/UX architect, reusable form-runtime architect, React state-management engineer, Next.js runtime tester, Playwright automation engineer, accessibility reviewer, SaaS security tester, Supabase/PostgreSQL verification reviewer, and Cursor implementation engineer.

## Phase

ERP BASE 002F.3E.3B.4 — Safe Close, Unsaved Changes, and Modal Layout Standard

## Prompt Purpose

This is a controlled IMPLEMENTATION prompt.

Implement the global Safe Close / Unsaved Changes / Modal Layout behavior for ERP drawer and dialog forms.

This phase starts after completion of the Required Field Marker and Footer rollout:

```text
ERP BASE 002F.3E.3B.3F — Required/Footer Final QA
Status: PASS WITH NOTES / Customer Save buttons fixed
```

Important confirmed issue from user manual testing:

```text
In Add/Edit forms, clicking outside the drawer/dialog currently closes the form and can lose unsaved data.
```

This must now be fixed.

---

# 1. Approved Safe Close Standard

## Add/Edit Mode

For all Add/Edit ERP forms:

```text
Outside click:
- must NOT close the form directly

Escape key:
- must NOT close the form directly if there are unsaved changes
- should show confirmation if dirty

X / Close icon:
- should show confirmation if dirty
- can close directly if clean

Cancel button:
- should show confirmation if dirty
- can close directly if clean

Save:
- saves and keeps form open
- resets dirty state after successful save

Save & Close:
- saves and closes after successful save
```

## View Mode

For all View-only forms:

```text
Outside click:
- can close

Escape key:
- can close

X / Close icon:
- can close

Close button:
- can close directly

No confirmation required because there are no editable unsaved changes.
```

## Dirty State Rule

A form is dirty when:

```text
The user has changed any editable field after opening the form,
and the change has not been saved.
```

After successful Save:

```text
Dirty state must reset to clean.
Form remains open.
```

After successful Save & Close:

```text
Form closes.
```

---

# 2. Strict Out of Scope

Do not implement:

```text
new modules
new database tables
database migrations
SQL execution
Global Search
AI
DMS
export/email
large refactor unrelated to safe close
new required/footer rollout changes unless directly necessary
```

Do not change server actions unless required to support correct save behavior.

Do not alter business validation unless a direct bug is found.

---

# 3. Mandatory Standards To Read First

Before implementation, read and follow:

```text
docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md

docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
```

Also review the latest phase reports:

```text
ERP_BASE_002F_3E_3B_3F_REQUIRED_FOOTER_FINAL_QA_REPORT.md

ERP_BASE_002F_3E_3B_3F_SAVE_BUTTON_KEEP_FORM_OPEN_FIX_REPORT.md

ERP_BASE_002F_3E_3B_3F_CUSTOMER_SAVE_BUTTONS_FINAL_QA_FIX_REPORT.md

ERP_BASE_002F_3E_3B_3C_COMPLETION_FIX_NUMBERING_ASSIGN_ROLE_QA_REPORT.md

ERP_BASE_002F_3E_3B_3D_REPORT_CORRECTION_AND_QA_CLOSURE_REPORT.md

ERP_BASE_002F_3E_3B_3E_STANDALONE_AUTH_FORMS_REQUIREDLABEL_IMPLEMENTATION_REPORT.md
```

The implementation report must confirm all reviewed files.

---

# 4. Mandatory Supabase Connection First

Before implementation, connect to live Supabase:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

Verify live schema/status for forms most likely to be tested:

```text
customers
roles
user_profiles
owner_companies
branches
global_numbering_rules
countries
emirates
cities
areas_zones
banks
currencies
payment_terms
tax_types
```

No database changes are expected.

The implementation report must include:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
No database changes were required for Safe Close / Unsaved Changes implementation.
```

If Supabase connection fails, continue source implementation only if safe, but document the warning clearly.

---

# 5. Implementation Scope

## Primary Shared Runtime Components

Inspect and update/create shared runtime utilities:

```text
src/components/erp/erp-drawer-form.tsx
src/components/erp/erp-form-footer.tsx
src/components/erp/unsaved-changes-dialog.tsx
src/hooks/use-form-dirty.ts
```

Use actual existing paths if different.

Preferred approach:

```text
1. Add reusable unsaved changes confirmation dialog.
2. Add reusable dirty-state hook or helper.
3. Add safe close support to ERPDrawerForm and/or forms using ERPDrawerForm.
4. Wire Safe Close into forms in a controlled way.
```

## Forms to Apply Safe Close To

Apply to all currently implemented ERP Add/Edit drawer/dialog forms where practical.

At minimum, apply and verify:

## Customer

```text
src/features/master-data/customers/components/customer-form-drawer.tsx
```

## Admin/System

```text
src/features/roles/role-form-dialog.tsx
src/features/users/add-user-dialog.tsx
src/features/users/user-edit-dialog.tsx
src/features/organizations/organization-form-dialog.tsx
src/features/branches/branch-form-dialog.tsx
src/features/numbering/components/numbering-rule-form-dialog.tsx
```

Assign Role Dialog:

```text
src/features/users/assign-role-dialog.tsx
```

This is an action-dialog exception. Inspect and decide whether Safe Close applies:
- If fields can be changed before action, Cancel/outside close with dirty fields may still need confirmation.
- If it is simple transactional and low-risk, document exception.

## Core Master Data

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

## Auth Forms

Standalone auth forms are out of scope unless they have an obvious unsaved-changes risk. Do not alter auth flow unless required.

---

# 6. Required UX Behavior

## Confirmation Dialog

Create or reuse a reusable confirmation dialog with professional wording.

Recommended text:

```text
Title:
Unsaved changes

Description:
You have unsaved changes. If you close this form, your changes will be lost.

Buttons:
Stay on Form
Discard Changes
```

Behavior:

```text
Stay on Form:
- closes confirmation dialog
- keeps form open

Discard Changes:
- closes confirmation dialog
- closes the original drawer/dialog
```

Destructive style:

```text
Discard Changes should use destructive or warning styling if available.
```

## Footer Indicator

If practical, show a small indicator when dirty:

```text
Unsaved changes
```

This can use existing hasUnsavedChanges prop in ERPFormFooter.

Do not overbuild; the main requirement is safe close protection.

---

# 7. Dirty State Implementation Rules

Dirty tracking should compare current form data against initial form data or track input/change events after open.

Acceptable strategies:

```text
React Hook Form dirty state if form uses RHF
manual state comparison if form uses controlled state
FormData snapshot comparison if forms are mostly uncontrolled
generic hook using form element id and input/change events
```

For this codebase, many forms use uncontrolled inputs and FormData. A practical shared hook may be:

```text
useFormDirty(formId, enabled)
```

Expected behavior:

```text
enabled only in Add/Edit modes
disabled in View mode
tracks input/change events inside form
marks dirty true after first user change
resets dirty after successful Save
resets dirty when form opens/closes or mode changes
```

Avoid over-complex deep diff unless needed.

## Reset Dirty After Save

After successful Save:

```text
setDirty(false)
```

If Save keeps form open:

```text
form remains open and clean
future edits set dirty again
```

After Save & Close:

```text
form closes
```

## Add Mode

Opening a blank Add form:

```text
dirty=false initially
```

After any user edit:

```text
dirty=true
```

After successful Save:

```text
dirty=false
```

If add mode transitions to edit mode after save:

```text
dirty=false after transition
```

## Edit Mode

Opening existing record:

```text
dirty=false initially
```

After user changes field:

```text
dirty=true
```

After successful Save:

```text
dirty=false
```

## View Mode

Always:

```text
dirty=false
safe close disabled
outside-click allowed
```

---

# 8. Outside Click / Esc / X Control

Inspect current drawer/dialog implementation.

Common shadcn/Radix behavior:

```text
onInteractOutside
onEscapeKeyDown
onOpenChange
```

Implement safe close at the correct layer.

Preferred:

```text
ERPDrawerForm receives:
- isDirty
- mode
- onRequestClose
- onConfirmClose / safe close props
```

Or each form intercepts onOpenChange.

Required behavior:

```text
If mode is add/edit and dirty:
- prevent outside close
- show unsaved changes confirmation

If mode is add/edit and not dirty:
- allow close

If mode is view:
- allow close
```

Do not block Save & Close from closing after successful save.

---

# 9. Apply to Forms Safely

For each form updated:

```text
wire dirty tracking
wire safe close request
reset dirty after Save
allow Save & Close to close after successful save
make Cancel route through safe close
make X / drawer close route through safe close
make outside-click route through safe close
keep View mode close simple
```

Do not duplicate huge logic in every form if a reusable component can handle it.

But if form architecture requires local wiring, keep changes minimal and consistent.

---

# 10. Testing Requirements

## Static Tests

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

## Browser / Manual Tests

If authenticated browser testing is available, test at minimum:

```text
Customer Add/Edit/View
Role Add/Edit
Numbering Rule Add/Edit
Country Add/Edit/View
```

Manual test matrix:

## Add Mode

```text
Open Add form.
Without editing, click outside:
- may close because clean.

Open Add form again.
Edit a field.
Click outside:
- must NOT close directly.
- must show Unsaved changes dialog.

Click Stay on Form:
- dialog closes.
- form remains open.

Click outside again, then Discard Changes:
- form closes.

Edit a field again.
Click Cancel:
- shows Unsaved changes dialog.

Click Save:
- saves.
- form remains open.
- dirty resets.
- click outside after Save:
  - if no further edits, form may close directly because clean.

Edit after Save:
- dirty becomes true again.
```

## Edit Mode

```text
Open Edit form.
Without changes, click outside:
- can close because clean.

Open Edit again.
Change a field.
Click outside:
- should show Unsaved changes dialog and not close directly.

Click Stay on Form:
- remains open.

Click Discard Changes:
- closes.

Change field again.
Click Save:
- saves and stays open.
- dirty resets.

Change field again.
Click Save & Close:
- saves and closes.
```

## View Mode

```text
Open View form.
Click outside:
- closes directly.
Open View again.
Press Esc:
- closes directly.
Footer:
- Close only.
```

If browser testing cannot be performed, report must be:

```text
PASS WITH NOTES
```

not full PASS.

---

# 11. Required Implementation Report

Create:

```text
ERP_BASE_002F_3E_3B_4_SAFE_CLOSE_UNSAVED_CHANGES_IMPLEMENTATION_REPORT.md
```

The report must include:

1. Phase name.
2. Date/time.
3. Supabase connection confirmation.
4. Standards reviewed.
5. Previous reports reviewed.
6. Files created.
7. Files modified.
8. Shared safe-close architecture.
9. Dirty-state strategy.
10. Confirmation dialog behavior.
11. Outside-click / Esc / X behavior.
12. Forms updated matrix.
13. Forms intentionally excluded and why.
14. Static test results: typecheck/lint/build.
15. Browser/manual test results.
16. Known issues/limitations.
17. Final status.

Final status must be exactly one of:

```text
PASS — Safe Close / Unsaved Changes implemented and verified successfully.
PASS WITH NOTES — Safe Close / Unsaved Changes implemented with non-blocking notes.
FAIL — Safe Close / Unsaved Changes requires correction before approval.
BLOCKED — Safe Close / Unsaved Changes could not be completed due to blocking issue.
```

---

# 12. Closure Criteria

This phase can close only if:

```text
Add/Edit dirty forms do not close directly on outside click.
Add/Edit dirty forms show confirmation before close.
Stay on Form keeps form open.
Discard Changes closes form.
Save keeps form open and resets dirty.
Save & Close saves and closes.
View mode closes directly without confirmation.
Typecheck passes.
Build passes.
Lint is run and documented.
Manual/browser status is clearly documented.
```

If browser QA remains pending:

```text
close only as PASS WITH NOTES
```

not full clean PASS.

---

# 13. Stop Condition

After implementing Safe Close, running tests, and creating the report, stop.

Do not start next phase.

Wait for Sameer/Dina review and approval.

---

# Final Instruction

Read standards.

Connect to Supabase.

Implement Safe Close / Unsaved Changes for ERP forms.

Add/Edit dirty outside-click must not close directly.

View mode outside-click can close.

Save keeps open and resets dirty.

Save & Close saves and closes.

Run tests.

Create implementation report.

Stop.
