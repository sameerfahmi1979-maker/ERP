# PROMPT_ERP_BASE_002F_3E_3B_3F_FIX_SAVE_BUTTON_KEEP_FORM_OPEN

Act as a senior ERP QA lead, enterprise ERP UI/UX architect, reusable form-component architect, Next.js runtime tester, Playwright automation engineer, React form-state engineer, Supabase/PostgreSQL verification reviewer, SaaS security tester, and Cursor bug-fix engineer.

## Phase

ERP BASE 002F.3E.3B.3F — Fix Save Button Behavior: Save Must Keep Form Open

## Prompt Purpose

This is a controlled BUG FIX / QA CORRECTION prompt.

The final QA for:

```text
ERP BASE 002F.3E.3B.3F — Required/Footer Final QA
```

found a real manual browser issue:

```text
When the user clicks Save, the form closes.
```

This is incorrect.

Correct approved behavior:

```text
Save:
- save the data
- keep the same drawer/dialog/form open
- refresh the current record/state if needed

Save & Close:
- save the data
- close the drawer/dialog/form after successful save
```

Current status:

```text
3B.3F — NOT CLOSED
Reason: Save button behaves like Save & Close.
```

This bug must be fixed before closing 3B.3F and before starting 3B.4 Safe Close.

Do not implement Safe Close.

Do not implement outside-click prevention.

Do not implement dirty-state tracking.

Do not implement confirmation dialogs.

Do not modify database schema.

Do not create migrations.

Do not apply SQL.

Do not start 3B.4.

---

# 1. Mandatory Standards To Read First

Before fixing, read and follow:

```text
docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md

docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
```

Also review these reports and prompts:

```text
ERP_BASE_002F_3E_3B_3B_FOOTER_STANDARD_ROLLOUT_MATRIX.md

ERP_BASE_002F_3E_3B_3B_NEXT_IMPLEMENTATION_PROMPT_PLAN.md

ERP_BASE_002F_3E_3B_3C_COMPLETION_FIX_NUMBERING_ASSIGN_ROLE_QA_REPORT.md

ERP_BASE_002F_3E_3B_3D_REPORT_CORRECTION_AND_QA_CLOSURE_REPORT.md

ERP_BASE_002F_3E_3B_3E_STANDALONE_AUTH_FORMS_REQUIREDLABEL_IMPLEMENTATION_REPORT.md

ERP_BASE_002F_3E_3B_3F_REQUIRED_FOOTER_FINAL_QA_REPORT.md
```

The fix report must confirm all reviewed files.

---

# 2. Mandatory Supabase Connection First

Before fixing, connect to live Supabase:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

No database change is required.

The fix report must include:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
No database changes were required for the Save button behavior fix.
```

If Supabase connection fails, continue source-code inspection if possible but document the warning clearly.

---

# 3. Critical Bug Definition

## Bug

```text
Clicking Save closes the form.
```

## Expected

```text
Clicking Save must keep the same form open.
```

## Correct behavior by button

```text
Cancel:
- closes without saving
- Safe Close confirmation is NOT part of this phase

Save:
- submits/saves
- shows success toast if supported
- keeps drawer/dialog/form open
- if it was Add mode, either:
  A. keep Add form open with saved data and generated id/code if architecture supports this, or
  B. transition safely to Edit mode for the newly saved record, or
  C. clear/reset form for next entry only if the form is intentionally designed as "save and new" — but this must be explicitly documented and is not preferred.
- must NOT close the form

Save & Close:
- submits/saves
- shows success toast if supported
- closes drawer/dialog/form only after successful save
```

## Important

If a form cannot support Save keeping open safely, do not hide the issue. Document it as an unresolved blocker or PASS WITH NOTES for that form. But the target standard remains:

```text
Save = keep open
Save & Close = close
```

---

# 4. Scope

## In Scope

Inspect and fix Save button behavior in all forms using `ERPFormFooter` from the 3B.3 rollout:

## Customer

```text
src/features/master-data/customers/components/customer-form-drawer.tsx
```

Customer child dialogs may not use ERPFormFooter; inspect only if they have Save / Save & Close buttons.

## Admin/System Forms

```text
src/features/roles/role-form-dialog.tsx
src/features/users/add-user-dialog.tsx
src/features/users/user-edit-dialog.tsx
src/features/organizations/organization-form-dialog.tsx
src/features/branches/branch-form-dialog.tsx
src/features/numbering/components/numbering-rule-form-dialog.tsx
```

Assign Role is an approved action-dialog exception and does not need Save / Save & Close behavior unless source inspection shows it was changed.

## Core Master Data Forms

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

## Reusable Component

```text
src/components/erp/erp-form-footer.tsx
```

Inspect first. Modify only if the root cause is there.

## Out of Scope

```text
standalone auth forms
Assign Role action-dialog exception unless affected
Safe Close
Outside-click prevention
Dirty-state tracking
Unsaved changes confirmation
Database migrations
SQL execution
Global Search
AI
DMS
```

---

# 5. Root Cause Investigation

Inspect:

```text
src/components/erp/erp-form-footer.tsx
```

Verify button types.

Important expected pattern:

```text
Save button:
- must NOT be type="submit" if it triggers form submit that closes by default
- should call onSave handler explicitly
- if inside a form, use type="button" unless intentionally submitting with action mode

Save & Close button:
- can trigger onSaveAndClose handler
- may be type="button" and call handler explicitly
- if using form submit, must distinguish action mode
```

Common root causes to check:

```text
Save button has type="submit"
Save button uses formId and submits same onSubmit as Save & Close
onSave handler internally calls onOpenChange(false)
onSave handler calls handleSaveAndClose
handleSubmit always calls handleSaveAndClose
ERPFormFooter maps Save to onSaveAndClose by mistake
active submit mode is not tracked
form onSubmit defaults to close flow for both buttons
```

---

# 6. Required Fix Strategy

Use the least risky consistent fix.

Preferred strategy:

```text
1. ERPFormFooter:
   - Save button type="button"
   - Save button onClick={onSave}
   - Save & Close button type="button"
   - Save & Close button onClick={onSaveAndClose}
   - View mode Close only

2. Each form:
   - handleSave saves and returns success without closing
   - handleSaveAndClose awaits handleSave then closes only if success
   - handleSubmit defaults to Save & Close if Enter/submit occurs, unless better architecture exists
```

Acceptable handler pattern:

```tsx
const handleSave = async () => {
  if (isViewing) return false;

  setIsSubmitting(true);
  try {
    const form = document.getElementById("drawer-form") as HTMLFormElement | null;
    if (!form) return false;

    const formData = new FormData(form);
    const result = await saveAction(formData);

    if (result.success) {
      toast.success("Saved successfully");
      // IMPORTANT: do not close here
      // optionally refresh current record/state
      return true;
    }

    toast.error(result.error || "Save failed");
    return false;
  } finally {
    setIsSubmitting(false);
  }
};

const handleSaveAndClose = async () => {
  const success = await handleSave();
  if (success) {
    onOpenChange(false);
  }
};
```

Avoid duplicated save logic where possible.

If Add mode creates a new record and the form remains open, handle one of these safely:

```text
Preferred:
- after Save, transition to edit mode for the newly created record if current architecture supports it.

Acceptable:
- keep Add form open and show success, but avoid duplicate create on next Save unless user changes code/fields intentionally.

If not safely possible:
- document Save limitation for that form and mark phase PASS WITH NOTES or FAIL depending severity.
```

---

# 7. Forms To Verify After Fix

At minimum, verify source-code behavior for all `ERPFormFooter` usages:

```bash
grep -R "ERPFormFooter" -n src/features src/components
grep -R "onSave=" -n src/features
grep -R "onSaveAndClose=" -n src/features
grep -R "onOpenChange(false)" -n src/features
```

For each ERPFormFooter usage, record:

```text
form path
Save handler name
Save handler closes? yes/no
Save & Close handler closes? yes/no
status
notes
```

---

# 8. Testing Requirements

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
if lint fails due this fix, fix before report
```

## Browser / Manual Test Requirement

The user already manually tested and found the bug.

After fixing, manual/browser QA should verify at least:

```text
one Customer drawer form
one Admin/System form
one Core Master Data form if available
```

If full authenticated testing is not possible, provide exact manual checklist and keep status PASS WITH NOTES.

Critical test:

```text
Click Save:
- form remains open

Click Save & Close:
- form closes
```

---

# 9. Required Fix Report

Create:

```text
ERP_BASE_002F_3E_3B_3F_SAVE_BUTTON_KEEP_FORM_OPEN_FIX_REPORT.md
```

The report must include:

1. Phase name.
2. Date/time.
3. Supabase connection confirmation.
4. Standards reviewed.
5. Root cause found.
6. Files inspected.
7. Files modified.
8. ERPFormFooter behavior before/after.
9. Per-form Save / Save & Close verification matrix.
10. Static test results: typecheck/lint/build.
11. Browser/manual test status.
12. Known limitations.
13. Whether 3B.3F can close or still needs correction.
14. Correct next phase reference.

Correct next phase after this fix and final QA closure:

```text
ERP BASE 002F.3E.3B.4 — Safe Close, Unsaved Changes, and Modal Layout Standard
```

But only after 3B.3F is closed.

Final status must be exactly one of:

```text
PASS — Save button behavior fixed and verified; 3B.3F can close.
PASS WITH NOTES — Save button behavior fixed by source/static QA; manual browser QA still pending.
FAIL — Save button still closes forms or unresolved Save behavior remains.
BLOCKED — Save button behavior fix could not be completed due to blocking issue.
```

---

# 10. Stop Condition

After fixing Save behavior, running tests, and creating the report, stop.

Do not start 3B.4.

Wait for Sameer/Dina review.

---

# Final Instruction

Read standards.

Connect to Supabase.

Inspect ERPFormFooter and all forms using it.

Fix Save so it keeps the form open.

Keep Save & Close as save then close.

Do not implement Safe Close.

Run tests.

Create fix report.

Stop.
