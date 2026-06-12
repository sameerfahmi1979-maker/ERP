# PROMPT_ERP_BASE_002F_3E_3B_4B_SAFE_CLOSE_INVESTIGATION_AND_FIX

Act as a senior ERP QA lead, React/Next.js runtime debugging engineer, shadcn/Radix dialog specialist, enterprise ERP UI/UX architect, reusable form-runtime architect, Playwright/manual QA engineer, SaaS security tester, Supabase verification reviewer, and Cursor bug-fix engineer.

## Phase

ERP BASE 002F.3E.3B.4B — Investigate and Fix Safe Close Not Working

## Prompt Purpose

This is a controlled INVESTIGATION + BUG FIX prompt.

User manual testing confirmed:

```text
Safe Close is NOT working.
```

Meaning:

```text
When user opens an Add/Edit form, changes data, then clicks outside the drawer/dialog, the form still closes or does not show the Unsaved Changes confirmation properly.
```

This is a critical data-loss bug.

Do not assume the previous implementation is correct.

Do not close this phase by source review only.

You must investigate the real runtime flow and find the actual cause.

Do not implement unrelated features.

Do not modify database schema.

Do not create migrations.

Do not apply SQL.

Do not start another phase.

---

# 1. Expected Correct Behavior

## Add/Edit Mode

```text
Dirty Add/Edit form:
- outside click must NOT close directly
- Escape key must NOT close directly
- X / Close icon must NOT close directly
- Cancel button must NOT close directly
- Unsaved Changes confirmation dialog must appear

Confirmation dialog:
- Stay on Form keeps the original form open
- Discard Changes closes the original form

Clean Add/Edit form:
- may close directly

Save:
- saves
- keeps form open
- resets dirty state

Save & Close:
- saves and closes after successful save
```

## View Mode

```text
View form:
- outside click can close
- Escape can close
- X / Close can close
- Close button can close
- no confirmation required
```

---

# 2. Mandatory Standards To Read First

Read:

```text
docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md
docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
```

Review latest reports:

```text
ERP_BASE_002F_3E_3B_4_SAFE_CLOSE_UNSAVED_CHANGES_IMPLEMENTATION_REPORT.md
ERP_BASE_002F_3E_3B_4A_SAFE_CLOSE_ROLLOUT_TO_REMAINING_FORMS_REPORT.md
ERP_BASE_002F_3E_3B_3F_CUSTOMER_SAVE_BUTTONS_FINAL_QA_FIX_REPORT.md
ERP_BASE_002F_3E_3B_3F_SAVE_BUTTON_KEEP_FORM_OPEN_FIX_REPORT.md
```

The investigation/fix report must confirm these were reviewed.

---

# 3. Mandatory Supabase Connection First

Before investigation, connect to live Supabase:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

Verify at minimum:

```text
customers
roles
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

Report must include:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
No database changes were required for Safe Close investigation/fix.
```

If Supabase connection fails, continue source/runtime investigation if possible and document warning.

---

# 4. Investigation Scope

Investigate the actual source and runtime path for Safe Close.

Inspect these files first:

```text
src/components/erp/erp-drawer-form.tsx
src/components/erp/unsaved-changes-dialog.tsx
src/hooks/use-form-dirty.ts
src/components/erp/erp-form-footer.tsx
src/components/ui/sheet.tsx
src/components/ui/dialog.tsx
```

Then inspect representative forms:

```text
src/features/master-data/customers/components/customer-form-drawer.tsx
src/features/roles/role-form-dialog.tsx
src/features/numbering/components/numbering-rule-form-dialog.tsx
src/features/master-data/geography/components/country-form-dialog.tsx
src/features/organizations/organization-form-dialog.tsx
src/features/branches/branch-form-dialog.tsx
```

Also grep all usages:

```bash
grep -R "ERPDrawerForm" -n src/features src/components
grep -R "isDirty" -n src/features src/components
grep -R "useFormDirty" -n src/features src/components
grep -R "onOpenChange" -n src/components/erp src/features
grep -R "onInteractOutside" -n src/components src/features
grep -R "onEscapeKeyDown" -n src/components src/features
```

---

# 5. Possible Root Causes To Check

Do not guess. Verify each.

## Root Cause A — Dirty State Not Becoming True

Check:

```text
useFormDirty hook attaches event listeners correctly.
formId matches actual <form id="">.
input/change events fire for normal inputs.
combobox/select changes fire events or manually mark dirty.
hook not attaching before form exists.
hook disabled accidentally.
dirty reset accidentally called too early.
```

If this is the cause, fix the hook or form wiring.

## Root Cause B — Drawer Close Is Not Intercepted

Check:

```text
ERPDrawerForm receives isDirty=true.
ERPDrawerForm handleOpenChange runs when outside click happens.
Sheet/Dialog close events route through ERPDrawerForm handleOpenChange.
Base UI / shadcn component may close before onOpenChange can block.
onOpenChange cannot prevent close alone.
```

If onOpenChange is not preventable, use the correct Radix/shadcn hooks:

```text
onInteractOutside={(event) => { if (shouldBlockClose) event.preventDefault(); showDialog(); }}
onEscapeKeyDown={(event) => { if (shouldBlockClose) event.preventDefault(); showDialog(); }}
```

This is likely important.

## Root Cause C — X / Cancel Bypasses Safe Close

Check:

```text
X button calls onOpenChange(false) directly instead of safe close handler.
Cancel button calls parent onOpenChange(false) directly.
ERPFormFooter onCancel bypasses ERPDrawerForm safe close.
```

If so, route X/Cancel through a safe close request function.

## Root Cause D — Confirmation Dialog Appears But Form Already Closed

Check:

```text
outside click triggers close before dialog is shown.
confirmation dialog state belongs to unmounted drawer.
form unmounts before dialog can appear.
```

If so, prevent close before opening confirmation dialog.

## Root Cause E — Confirmation Dialog Layer Conflict

Check:

```text
AlertDialog inside Sheet may conflict with Sheet close behavior.
UnsavedChangesDialog rendered inside drawer and unmounts when drawer closes.
Dialog should maybe be rendered outside/alongside Sheet content, not inside closable content.
```

Fix placement if needed.

## Root Cause F — View/Add/Edit Mode Incorrect

Check:

```text
mode passed to ERPDrawerForm is wrong.
mode is add/edit but component sees view.
currentMode/local mode not synced.
```

## Root Cause G — Forms Pass Wrong isDirty

Check:

```text
isDirty not passed to ERPDrawerForm.
hasUnsavedChanges passed to footer only but not drawer.
some forms wired footer but not drawer.
some forms use different form id.
```

---

# 6. Required Fix Rules

Use the correct reliable pattern.

## For Outside Click / Esc

If the drawer uses Radix/shadcn Sheet/Dialog, implement close prevention at the event level:

```tsx
onInteractOutside={(event) => {
  if (shouldBlockClose) {
    event.preventDefault();
    setShowUnsavedDialog(true);
  }
}}

onEscapeKeyDown={(event) => {
  if (shouldBlockClose) {
    event.preventDefault();
    setShowUnsavedDialog(true);
  }
}}
```

Do not rely only on `onOpenChange(false)` if it cannot prevent closure.

## For X / Cancel

Make both call a safe close request:

```tsx
const requestClose = () => {
  if (shouldBlockClose) {
    setShowUnsavedDialog(true);
    return;
  }
  onOpenChange(false);
};
```

Use `requestClose` for:

```text
X close button
Cancel button
programmatic close attempts except Save & Close after successful save
```

## For Discard

```tsx
const discardChanges = () => {
  setShowUnsavedDialog(false);
  onOpenChange(false);
};
```

## For Save & Close

After successful save and `resetDirty()`:

```tsx
onOpenChange(false)
```

This must not show confirmation.

## For Save

After successful save:

```tsx
resetDirty()
keep open
```

---

# 7. Minimum Forms To Prove Fix

You must verify in source and, if possible, browser/manual for at least:

```text
Customer Add/Edit/View
Role Add/Edit
Numbering Rule Add/Edit
Country Add/Edit/View
Organization Add/Edit
Branch Add/Edit
```

If browser/manual testing is not available, create a detailed manual checklist and keep final status as PASS WITH NOTES.

But the source fix must be real and comprehensive.

---

# 8. Apply Fix Globally

The fix should preferably be in shared runtime:

```text
ERPDrawerForm
useFormDirty
UnsavedChangesDialog
ERPFormFooter if cancel behavior needs routing
```

Avoid patching 24 forms individually if the shared component can solve it.

However, verify all form wiring is correct:

```text
formId matches hook
isDirty passed to ERPDrawerForm
hasUnsavedChanges passed to ERPFormFooter
resetDirty after save
```

If any form is missing wiring, fix it.

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
if lint fails due pre-existing unrelated issues, document exactly
if lint fails due this fix, fix before reporting
```

## Runtime / Browser Testing

Use browser testing if possible.

Manual test steps for Customer:

```text
Open Add Customer.
Type in Customer Name.
Click outside.
Expected: form stays open and Unsaved changes dialog appears.

Click Stay on Form.
Expected: dialog closes, form remains open, data remains.

Click outside again.
Click Discard Changes.
Expected: form closes.

Open Edit Customer.
Change field.
Press Esc.
Expected: form stays open and Unsaved changes dialog appears.

Click Save.
Expected: form stays open and dirty indicator resets.

Click outside after Save without changing anything.
Expected: form can close directly.

Open View Customer.
Click outside.
Expected: closes directly.
```

Repeat equivalent on Role or Country if possible.

---

# 10. Required Investigation/Fix Report

Create:

```text
ERP_BASE_002F_3E_3B_4B_SAFE_CLOSE_INVESTIGATION_AND_FIX_REPORT.md
```

Report must include:

1. Phase name.
2. Date/time.
3. Supabase connection confirmation.
4. Standards/reports reviewed.
5. User-reported issue.
6. Investigation steps.
7. Root cause found.
8. Files inspected.
9. Files modified.
10. Exact fix implemented.
11. Why previous 3B.4/4A did not work.
12. Forms verified/wired matrix.
13. Outside-click behavior result.
14. Esc behavior result.
15. X/Cancel behavior result.
16. Save/Save & Close behavior result.
17. Static test results: typecheck/lint/build.
18. Browser/manual test status.
19. Known limitations.
20. Final status.

Final status must be exactly one of:

```text
PASS — Safe Close issue fixed and browser/runtime verified successfully.
PASS WITH NOTES — Safe Close issue fixed by source/static QA; manual browser QA still pending.
FAIL — Safe Close still not working or unresolved forms remain.
BLOCKED — Safe Close investigation/fix could not be completed due to blocking issue.
```

---

# 11. Closure Criteria

Do not mark PASS unless:

```text
Dirty Add/Edit outside click does not close directly.
Dirty Add/Edit outside click shows confirmation.
Stay on Form keeps form open.
Discard Changes closes form.
Dirty Add/Edit Esc shows confirmation.
Dirty Add/Edit X/Cancel shows confirmation.
Clean Add/Edit can close directly.
View mode can close directly.
Save resets dirty and keeps open.
Save & Close saves and closes without confirmation.
Typecheck passes.
Build passes.
```

If browser QA is pending, use:

```text
PASS WITH NOTES
```

not full PASS.

---

# 12. Stop Condition

After investigation, fix, tests, and report, stop.

Do not start another phase.

Wait for Sameer/Dina review.

---

# Final Instruction

Investigate why Safe Close is not working.

Find the real root cause.

Fix it correctly at the shared runtime/event level if needed.

Verify form wiring.

Run tests.

Create investigation and fix report.

Stop.
