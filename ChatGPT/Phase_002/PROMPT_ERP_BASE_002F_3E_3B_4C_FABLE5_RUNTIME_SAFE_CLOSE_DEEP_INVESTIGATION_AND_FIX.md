# PROMPT_ERP_BASE_002F_3E_3B_4C_FABLE5_RUNTIME_SAFE_CLOSE_DEEP_INVESTIGATION_AND_FIX

Act as a senior React runtime debugger, Next.js 16 engineer, shadcn/Base UI/Radix dialog specialist, browser-event tracing engineer, Playwright QA engineer, ERP form-runtime architect, and Supabase-connected enterprise application engineer.

## Phase

ERP BASE 002F.3E.3B.4C — Runtime Safe Close Deep Investigation and Fix

## Critical User Evidence

The user manually tested Safe Close after phases 3B.4, 3B.4A, and 3B.4B.

Result:

```text
IT IS STILL CLOSING.
```

Meaning:

```text
When the user opens an Add/Edit form, changes data, and clicks outside the drawer/dialog, the drawer still closes.
The Unsaved Changes confirmation is not preventing closure.
```

This means the previous implementation is not working in the real browser runtime.

Do not assume prior reports are correct.

Do not rely only on source code review.

Do not close this phase unless the runtime behavior is actually fixed.

---

# 1. Immediate Goal

Find the real runtime reason why outside-click safe close is still failing and fix it.

Expected behavior:

```text
Dirty Add/Edit form + outside click:
- drawer must stay open
- Unsaved Changes dialog must appear

Dirty Add/Edit form + Esc:
- drawer must stay open
- Unsaved Changes dialog must appear

Dirty Add/Edit form + X / Close:
- drawer must stay open
- Unsaved Changes dialog must appear

Dirty Add/Edit form + Cancel:
- drawer must stay open
- Unsaved Changes dialog must appear

Stay on Form:
- closes only the confirmation dialog
- keeps original drawer open
- preserves typed data

Discard Changes:
- closes confirmation dialog
- closes original drawer

View mode:
- outside click / Esc / X / Close can close directly
```

---

# 2. Strict Rules

Do not modify database schema.

Do not create migrations.

Do not apply SQL.

Do not implement unrelated UI changes.

Do not touch Global Search, DMS, AI, export/email, numbering, master data schemas, or server actions unless directly required by the Safe Close bug.

Do not mark the phase PASS unless the browser/runtime behavior is proven.

If browser authentication prevents testing, build a temporary local test harness or isolated dev-only test page for `ERPDrawerForm` to reproduce and fix the drawer outside-click behavior. Remove the harness before final report unless explicitly documented as dev-only.

---

# 3. Mandatory Supabase Connection

Connect first to live Supabase for project workflow consistency:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

No database changes are expected.

The report must state:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
No database changes were required for Safe Close runtime investigation/fix.
```

If Supabase connection fails, continue frontend runtime investigation and document the warning.

---

# 4. Mandatory Files to Read

Read these standards:

```text
docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md
docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
```

Read these previous reports:

```text
ERP_BASE_002F_3E_3B_4_SAFE_CLOSE_UNSAVED_CHANGES_IMPLEMENTATION_REPORT.md
ERP_BASE_002F_3E_3B_4A_SAFE_CLOSE_ROLLOUT_TO_REMAINING_FORMS_REPORT.md
ERP_BASE_002F_3E_3B_4B_SAFE_CLOSE_INVESTIGATION_AND_FIX_REPORT.md
ERP_BASE_002F_3E_3B_3F_CUSTOMER_SAVE_BUTTONS_FINAL_QA_FIX_REPORT.md
ERP_BASE_002F_3E_3B_3F_SAVE_BUTTON_KEEP_FORM_OPEN_FIX_REPORT.md
```

Read these source files:

```text
src/components/erp/erp-drawer-form.tsx
src/components/erp/erp-form-footer.tsx
src/components/erp/unsaved-changes-dialog.tsx
src/hooks/use-form-dirty.ts
src/components/ui/sheet.tsx
src/components/ui/dialog.tsx
src/features/master-data/customers/components/customer-form-drawer.tsx
```

Also inspect at least:

```text
src/features/roles/role-form-dialog.tsx
src/features/numbering/components/numbering-rule-form-dialog.tsx
src/features/master-data/geography/components/country-form-dialog.tsx
```

---

# 5. First-Principles Runtime Investigation

You must answer these with evidence.

## 5.1 Is Dirty State Becoming True?

Add temporary debug logging or inspect runtime state:

```text
When user edits a field:
- Does useFormDirty set isDirty=true?
- Does ERPFormFooter show Unsaved Changes indicator?
- Is isDirty passed into ERPDrawerForm?
- Is shouldBlockClose true?
```

If `isDirty` is false, fix dirty tracking first.

Possible causes:

```text
formId mismatch
useFormDirty attaches listeners before form exists
input/change events not firing for controlled/custom components
hook disabled because mode is wrong
useEffect dependency issue
form unmount/remount resets dirty
```

## 5.2 Is the Drawer Close Event Interceptable?

Find the actual drawer implementation and API.

The project may use:

```text
shadcn Sheet using Radix Dialog
Base UI Dialog
custom wrapper
another modal library
```

Do not assume the API.

Open:

```text
src/components/ui/sheet.tsx
src/components/ui/dialog.tsx
package.json
```

Find the actual library and actual props available.

Verify whether these exist and work:

```text
onOpenChange
onInteractOutside
onEscapeKeyDown
onPointerDownOutside
onPointerDownOutsideCapture
onInteractOutsideCapture
modal
dismissible
trapFocus
```

If the wrapper does not expose the needed event props, extend the wrapper.

## 5.3 Is onOpenChange Too Late?

The previous fix tried to use `onOpenChange` and `eventDetails.cancel()`.

The browser still closes.

This likely means one of these is true:

```text
onOpenChange does not receive eventDetails.
eventDetails.cancel is not real in this wrapper.
onOpenChange fires after close, not before.
The wrapper ignores cancel.
The close is caused by overlay pointerdown before open state callback.
```

If so, intercept the actual outside event before close.

For Radix/shadcn, likely solution is:

```tsx
<SheetContent
  onPointerDownOutside={(event) => {
    if (shouldBlockClose) {
      event.preventDefault();
      setShowUnsavedDialog(true);
    }
  }}
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
>
```

For Base UI, use the exact equivalent from the installed package and current wrapper.

## 5.4 Is the Sheet Controlled?

Verify:

```text
ERPDrawerForm passes open={open}
ERPDrawerForm passes onOpenChange={...}
The parent does not independently set open=false on overlay click.
```

If the wrapper internally closes before parent state can block, fix wrapper.

## 5.5 Does X Button Bypass Runtime Safe Close?

Verify X button implementation.

If X calls parent `onOpenChange(false)` directly, route to `requestClose`.

## 5.6 Does Cancel Button Bypass Runtime Safe Close?

Verify ERPFormFooter Cancel implementation.

If it calls original `onCancel()` directly, route to safe close context request.

But do not break View mode Close behavior.

---

# 6. Preferred Robust Fix

The fix must be robust at runtime.

## 6.1 Safe Close Controller in ERPDrawerForm

Inside `ERPDrawerForm`, create a single function:

```tsx
const requestClose = React.useCallback(() => {
  if (mode !== "view" && isDirty) {
    setShowUnsavedDialog(true);
    return;
  }
  onOpenChange(false);
}, [mode, isDirty, onOpenChange]);
```

## 6.2 Controlled Close for Overlay/Escape

In the actual Sheet/Dialog content component, intercept before close:

```tsx
onPointerDownOutside={(event) => {
  if (mode !== "view" && isDirty) {
    event.preventDefault();
    setShowUnsavedDialog(true);
  }
}}

onInteractOutside={(event) => {
  if (mode !== "view" && isDirty) {
    event.preventDefault();
    setShowUnsavedDialog(true);
  }
}}

onEscapeKeyDown={(event) => {
  if (mode !== "view" && isDirty) {
    event.preventDefault();
    setShowUnsavedDialog(true);
  }
}}
```

Use only event props that are real in the project’s Sheet/Dialog library.

Do not use imaginary props.

## 6.3 Controlled onOpenChange Safety Net

Also keep a safety net:

```tsx
const handleOpenChange = (nextOpen: boolean) => {
  if (!nextOpen && mode !== "view" && isDirty) {
    setShowUnsavedDialog(true);
    return;
  }
  onOpenChange(nextOpen);
};
```

But do not rely only on it if actual event must be prevented earlier.

## 6.4 Confirmation Dialog Placement

If the confirmation dialog is inside Sheet content and unmounts when Sheet closes, move it so it remains mounted while the parent component remains mounted.

Possibilities:

```text
Render UnsavedChangesDialog next to Sheet, not inside SheetContent.
Keep drawer open state true while dialog is open.
Use a portal-based AlertDialog that is not unmounted by Sheet closing.
```

## 6.5 Discard Changes

```tsx
const discardChanges = () => {
  setShowUnsavedDialog(false);
  onOpenChange(false);
};
```

This intentionally closes.

## 6.6 Stay on Form

```tsx
const stayOnForm = () => {
  setShowUnsavedDialog(false);
};
```

---

# 7. Temporary Debugging Is Allowed

You may temporarily add console logs while investigating, but remove or reduce them before final code unless behind a development-only guard.

Useful debug logs:

```text
isDirty changed
requestClose called
outside event fired
escape event fired
onOpenChange called
event type / reason / defaultPrevented
confirmation dialog opened
```

Final report must describe what was observed.

---

# 8. Minimum Runtime Reproduction Required

Try to reproduce in the actual app:

```text
Customer Add:
1. Open Add Customer.
2. Type in Customer Name.
3. Click outside drawer.
4. Verify drawer stays open and dialog appears.
```

If the app requires login and cannot be tested, create a temporary development-only test route or test harness that mounts `ERPDrawerForm` with:

```text
mode="add"
isDirty={true}
one input
ERPFormFooter
```

Use it only for runtime investigation.

If created, remove it before final report unless explicitly dev-only and documented.

---

# 9. Apply Fix Globally

The fix should be in shared components, not 24 individual patches, unless form wiring is missing.

After the shared fix, verify all wired forms still use:

```text
isDirty passed to ERPDrawerForm
hasUnsavedChanges passed to ERPFormFooter
resetDirty called after successful Save
```

If any form is missing wiring, fix it.

---

# 10. Required Static Tests

Run:

```bash
npm run typecheck
npm run lint
npm run build
```

Requirements:

```text
typecheck must pass
build must pass
lint must be run and documented
new lint issues from this fix must be corrected
pre-existing unrelated lint issues may be documented
```

---

# 11. Required Runtime / Manual Test Evidence

The report must state one of:

```text
Browser runtime verified successfully.
```

or

```text
Browser runtime not available; source/static fix completed and manual checklist provided.
```

If runtime is not verified, final status must be:

```text
PASS WITH NOTES
```

If runtime is verified and works, final status can be:

```text
PASS
```

Do not claim full PASS without actually testing.

---

# 12. Required Report

Create:

```text
ERP_BASE_002F_3E_3B_4C_SAFE_CLOSE_RUNTIME_INVESTIGATION_AND_FIX_REPORT.md
```

Report must include:

1. Phase name.
2. Date/time.
3. Supabase connection confirmation.
4. Standards/reports reviewed.
5. User-reported issue.
6. Actual library used for Sheet/Dialog.
7. Runtime investigation findings.
8. Whether dirty state was true.
9. Whether outside-click event was intercepted.
10. Exact root cause.
11. Files inspected.
12. Files modified.
13. Exact fix implemented.
14. Why previous 3B.4B fix still failed.
15. Forms verified.
16. Runtime/browser test evidence.
17. Static test results.
18. Known limitations.
19. Final status.

Final status must be exactly one of:

```text
PASS — Safe Close runtime issue fixed and verified in browser.
PASS WITH NOTES — Safe Close issue fixed by source/static QA; browser verification still pending.
FAIL — Safe Close still fails or unresolved runtime issue remains.
BLOCKED — Safe Close runtime investigation/fix could not be completed.
```

---

# 13. Closure Criteria

Do not mark PASS unless real browser/runtime confirms:

```text
Dirty Add/Edit outside click does not close directly.
Unsaved Changes dialog appears.
Stay on Form keeps drawer open.
Discard Changes closes drawer.
Dirty Esc shows confirmation.
Dirty X/Cancel shows confirmation.
Clean form can close directly.
View mode closes directly.
Save resets dirty and keeps open.
Save & Close saves and closes.
Typecheck passes.
Build passes.
```

---

# 14. Stop Condition

After investigation, fix, tests, and report, stop.

Do not start another phase.

Wait for Sameer/Dina review.

---

# Final Instruction

Use Fable 5-level deep runtime reasoning.

Do not trust previous assumptions.

Find the actual event path.

Fix Safe Close so outside click cannot close dirty Add/Edit forms.

Produce evidence.

Stop.
