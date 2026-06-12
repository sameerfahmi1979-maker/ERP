# PROMPT_ERP_BASE_002F_3E_3B_4A_SAFE_CLOSE_ROLLOUT_TO_REMAINING_FORMS

Act as a senior ERP QA lead, enterprise ERP UI/UX architect, reusable form-runtime architect, React state-management engineer, Next.js runtime tester, Playwright automation engineer, accessibility reviewer, SaaS security tester, Supabase/PostgreSQL verification reviewer, and Cursor rollout engineer.

## Phase

ERP BASE 002F.3E.3B.4A — Safe Close Rollout to Remaining Forms

## Prompt Purpose

This is a controlled IMPLEMENTATION / ROLLOUT COMPLETION prompt.

The previous Safe Close implementation report:

```text
ERP_BASE_002F_3E_3B_4_SAFE_CLOSE_UNSAVED_CHANGES_IMPLEMENTATION_REPORT.md
```

confirmed that the **core Safe Close architecture was implemented**, but only the **Customer main drawer** was wired.

Current status:

```text
ERP BASE 002F.3E.3B.4 — PASS WITH NOTES, NOT CLOSED
Reason: Safe Close architecture exists, but rollout is incomplete.
```

The previous report stated:

```text
Forms Implemented: 1
Forms Pending: 23
Full Form Rollout: 1 of 24 forms / 4.2%
```

This phase must roll out the already-created Safe Close architecture to the remaining ERP forms.

Do not create a new Safe Close architecture unless the existing one is broken.

Do not start another phase.

Do not implement unrelated features.

Do not modify database schema.

Do not create migrations.

Do not apply SQL.

---

# 1. Existing Approved Safe Close Architecture

The following files should already exist from 3B.4:

```text
src/components/erp/unsaved-changes-dialog.tsx
src/hooks/use-form-dirty.ts
src/components/erp/erp-drawer-form.tsx
src/components/erp/erp-form-footer.tsx
```

Expected existing pattern:

```tsx
import { useFormDirty } from "@/hooks/use-form-dirty";

const { isDirty, resetDirty } = useFormDirty({
  formId: "drawer-form",
  enabled: !isViewing,
});

<ERPDrawerForm
  ...
  isDirty={isDirty}
>
  ...
  <ERPFormFooter
    ...
    hasUnsavedChanges={isDirty}
  />
</ERPDrawerForm>
```

After successful Save:

```tsx
resetDirty();
```

This phase should reuse that pattern consistently.

---

# 2. Approved Behavior

## Add/Edit Mode

```text
Dirty Add/Edit form:
- clicking outside must NOT close directly
- pressing Esc must NOT close directly
- clicking X must NOT close directly
- clicking Cancel must NOT close directly
- must show Unsaved changes confirmation

Clean Add/Edit form:
- can close directly

Save:
- saves
- keeps form open
- resets dirty state

Save & Close:
- saves
- closes form after successful save
```

## View Mode

```text
Outside click can close.
Esc can close.
X can close.
Close button can close.
No unsaved confirmation required.
```

---

# 3. Mandatory Standards To Read First

Before implementation, read and follow:

```text
docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md

docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
```

Also review:

```text
ERP_BASE_002F_3E_3B_4_SAFE_CLOSE_UNSAVED_CHANGES_IMPLEMENTATION_REPORT.md

ERP_BASE_002F_3E_3B_3F_CUSTOMER_SAVE_BUTTONS_FINAL_QA_FIX_REPORT.md

ERP_BASE_002F_3E_3B_3F_SAVE_BUTTON_KEEP_FORM_OPEN_FIX_REPORT.md

ERP_BASE_002F_3E_3B_3F_REQUIRED_FOOTER_FINAL_QA_REPORT.md
```

The rollout report must confirm all reviewed files.

---

# 4. Mandatory Supabase Connection First

Before implementation, connect to live Supabase:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

Verify live schema/status for representative forms:

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

No database change is expected.

The report must include:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
No database changes were required for Safe Close rollout to remaining forms.
```

If Supabase connection fails, continue source implementation only if safe, but document the warning clearly.

---

# 5. Scope

## In Scope

Apply the existing Safe Close / Dirty State pattern to all remaining ERP forms that use `ERPDrawerForm` / `ERPFormFooter`.

Customer main drawer was already implemented in 3B.4, but re-check it for consistency.

## Admin/System Forms

```text
src/features/roles/role-form-dialog.tsx
src/features/users/add-user-dialog.tsx
src/features/users/user-edit-dialog.tsx
src/features/organizations/organization-form-dialog.tsx
src/features/branches/branch-form-dialog.tsx
src/features/numbering/components/numbering-rule-form-dialog.tsx
```

## Assign Role Dialog

```text
src/features/users/assign-role-dialog.tsx
```

Inspect and classify:

```text
If it has user-editable selections and can be accidentally closed after user changes:
- either apply an appropriate safe-close pattern
- or document a formal action-dialog exception if risk is low and Save/Save & Close semantics do not apply

Do not leave undecided.
```

## Core Master Data — Geography

```text
src/features/master-data/geography/components/country-form-dialog.tsx
src/features/master-data/geography/components/emirate-form-dialog.tsx
src/features/master-data/geography/components/city-form-dialog.tsx
src/features/master-data/geography/components/area-form-dialog.tsx
src/features/master-data/geography/components/port-form-dialog.tsx
```

## Core Master Data — Finance Basics

```text
src/features/master-data/finance-basics/components/bank-form-dialog.tsx
src/features/master-data/finance-basics/components/currency-form-dialog.tsx
src/features/master-data/finance-basics/components/payment-term-form-dialog.tsx
src/features/master-data/finance-basics/components/tax-type-form-dialog.tsx
src/features/master-data/finance-basics/components/cost-center-form-dialog.tsx
src/features/master-data/finance-basics/components/profit-center-form-dialog.tsx
```

## Core Master Data — UOM

```text
src/features/master-data/uom/components/uom-category-form-dialog.tsx
src/features/master-data/uom/components/unit-form-dialog.tsx
src/features/master-data/uom/components/conversion-form-dialog.tsx
```

## Core Master Data — Lookups

```text
src/features/master-data/lookups/components/category-form-dialog.tsx
src/features/master-data/lookups/components/value-form-dialog.tsx
```

## Re-check Customer

```text
src/features/master-data/customers/components/customer-form-drawer.tsx
```

Do not rewrite Customer unless inconsistency/regression is found.

---

# 6. Out of Scope

```text
Standalone auth forms
New modules
Database migrations
SQL execution
Global Search
AI
DMS
Export/email
Large form refactors
RequiredLabel/footer rewrites unrelated to Safe Close
Changing business validation
Changing server actions unless directly required to reset dirty after save
```

Customer child dialogs:

```text
customer-contacts-section.tsx
customer-addresses-section.tsx
customer-bank-details-section.tsx
```

Inspect but do not refactor unless safe-close risk is clearly in scope and simple to apply. If deferred, document as a known limitation/future item.

---

# 7. Required Rollout Pattern Per Form

For every ERP drawer form:

## 7.1 Import Hook

```tsx
import { useFormDirty } from "@/hooks/use-form-dirty";
```

## 7.2 Determine View Mode

Use existing form mode logic, such as:

```tsx
const isViewing = mode === "view";
```

or actual equivalent.

## 7.3 Add Dirty Hook

Use the correct form id for each form.

```tsx
const { isDirty, resetDirty } = useFormDirty({
  formId: "drawer-form",
  enabled: !isViewing,
});
```

If the form id is not `drawer-form`, use its actual id.

## 7.4 Wire Into ERPDrawerForm

```tsx
<ERPDrawerForm
  ...
  isDirty={isDirty}
>
```

## 7.5 Wire Into ERPFormFooter

```tsx
<ERPFormFooter
  ...
  hasUnsavedChanges={isDirty}
>
```

## 7.6 Reset Dirty After Save

In the successful save branch:

```tsx
if (result.success) {
  resetDirty();
  ...
}
```

For `Save`:

```text
reset dirty and keep form open
```

For `Save & Close`:

```text
reset dirty and close after save
```

## 7.7 Preserve View Mode

In View mode:

```text
dirty tracking disabled
outside click allowed
Close only footer remains
```

---

# 8. Special Cases

## Add Mode Creation

If Add mode can stay open after Save:

```text
After successful create:
- reset dirty
- prevent duplicate create on repeated Save
- transition to Edit mode if already implemented
- or keep state safely
```

Do not break existing duplicate-prevention logic.

## Forms Without View Mode

Still apply Safe Close to Add/Edit.

## Forms With Complex Dynamic Selects

Dynamic selects may trigger change events on load. If this happens and marks the form dirty immediately, fix the hook usage safely:

```text
Delay dirty tracking until after initial render, or ignore first tick if needed.
```

Document any such adjustment.

## Assign Role Action Dialog

If exception is chosen, document:

```text
Assign Role remains a documented action-dialog exception.
Reason:
- not a master Add/Edit form
- action-specific footer
- simple transactional workflow
- risk accepted or handled differently
```

If safe close is applied, document how.

---

# 9. Testing Requirements

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

## Source QA Matrix

For every updated form, verify in source:

```text
useFormDirty imported
isDirty/resetDirty declared
isDirty passed to ERPDrawerForm
hasUnsavedChanges passed to ERPFormFooter
resetDirty called on successful Save
View mode disables dirty tracking
```

## Manual Browser QA

If authenticated browser testing is available, test at minimum:

```text
Customer Add/Edit/View
Role Add/Edit
Numbering Rule Add/Edit
Country Add/Edit/View
Organization Add/Edit
Branch Add/Edit
```

If browser testing is not available, provide checklist and status:

```text
PASS WITH NOTES
```

Manual test requirements:

```text
Dirty Add/Edit outside click shows confirmation.
Stay on Form keeps form open.
Discard Changes closes form.
Clean form closes directly.
Save keeps open and resets dirty.
Save & Close saves and closes.
View closes directly with no confirmation.
```

---

# 10. Required Report

Create:

```text
ERP_BASE_002F_3E_3B_4A_SAFE_CLOSE_ROLLOUT_TO_REMAINING_FORMS_REPORT.md
```

Report must include:

1. Phase name.
2. Date/time.
3. Supabase connection confirmation.
4. Standards reviewed.
5. Previous reports reviewed.
6. Existing architecture verified.
7. Files modified.
8. Forms updated matrix.
9. Forms excluded / exceptions and why.
10. Assign Role decision.
11. Dirty state rollout pattern.
12. Save/reset dirty verification.
13. View mode behavior verification.
14. Static test results: typecheck/lint/build.
15. Browser/manual QA status.
16. Known limitations.
17. Whether 3B.4 can close or still needs correction.

Final status must be exactly one of:

```text
PASS — Safe Close rollout completed and verified successfully.
PASS WITH NOTES — Safe Close rollout completed with non-blocking notes.
FAIL — Safe Close rollout still requires correction before approval.
BLOCKED — Safe Close rollout could not be completed due to blocking issue.
```

---

# 11. Closure Criteria

3B.4 can close only if:

```text
Core safe-close architecture exists.
Customer form is wired.
Remaining ERP drawer forms are wired.
Assign Role is decided as applied or documented exception.
Dirty Add/Edit outside-click does not close directly.
Dirty Add/Edit shows confirmation.
Stay on Form keeps open.
Discard Changes closes.
Save keeps open and resets dirty.
Save & Close saves and closes.
View mode closes directly.
Typecheck passes.
Build passes.
Lint is run and documented.
Manual/browser status is documented.
```

If manual browser QA remains pending:

```text
PASS WITH NOTES
```

not full clean PASS.

---

# 12. Stop Condition

After completing rollout, running tests, and creating the report, stop.

Do not start a new phase.

Wait for Sameer/Dina review.

---

# Final Instruction

Read standards.

Connect to Supabase.

Apply existing Safe Close pattern to remaining ERP forms.

Decide Assign Role.

Run tests.

Create rollout completion report.

Stop.
