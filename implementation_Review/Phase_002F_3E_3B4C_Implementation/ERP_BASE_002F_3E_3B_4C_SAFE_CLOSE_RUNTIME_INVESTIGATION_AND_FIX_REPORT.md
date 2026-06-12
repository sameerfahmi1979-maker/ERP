# ERP BASE 002F.3E.3B.4C — SAFE CLOSE RUNTIME INVESTIGATION AND FIX REPORT

## 1. Phase Information

**Phase ID**: ERP BASE 002F.3E.3B.4C
**Phase Title**: Runtime Safe Close Deep Investigation and Fix
**Date/Time**: 2026-06-12 08:24 UTC+4
**Report Type**: Runtime Investigation & Bug Fix (browser-verified)

---

## 2. Supabase Connection Confirmation

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
No database changes were required for Safe Close runtime investigation/fix.
```

Verified tables present (via live MCP `list_tables`): `customers`, `roles`, `owner_companies`, `branches`, `global_numbering_rules`, `countries`, `emirates`, `cities`, `areas_zones`, `banks`, `currencies`, `payment_terms`, `tax_types` — all present with RLS enabled.

---

## 3. Standards and Reports Reviewed

Standards:

- `docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md`
- `docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md`

Previous reports:

- `ERP_BASE_002F_3E_3B_4_SAFE_CLOSE_UNSAVED_CHANGES_IMPLEMENTATION_REPORT.md`
- `ERP_BASE_002F_3E_3B_4A_SAFE_CLOSE_ROLLOUT_TO_REMAINING_FORMS_REPORT.md`
- `ERP_BASE_002F_3E_3B_4B_SAFE_CLOSE_INVESTIGATION_AND_FIX_REPORT.md`
- `ERP_BASE_002F_3E_3B_3F_CUSTOMER_SAVE_BUTTONS_FINAL_QA_FIX_REPORT.md`
- `ERP_BASE_002F_3E_3B_3F_SAVE_BUTTON_KEEP_FORM_OPEN_FIX_REPORT.md`

---

## 4. User-Reported Issue

```text
IT IS STILL CLOSING.
```

After phases 3B.4, 3B.4A, and 3B.4B, dirty Add/Edit forms still closed on outside click without showing the Unsaved Changes confirmation. Critical data-loss bug.

---

## 5. Actual Library Used for Sheet/Dialog

Verified from `package.json` and `node_modules` (not docs, not assumptions):

```text
@base-ui/react v1.5.0
src/components/ui/sheet.tsx wraps Dialog from "@base-ui/react/dialog"
(Sheet = Dialog.Root, SheetContent = Dialog.Popup inside Dialog.Portal + Backdrop)
```

This is **Base UI**, not Radix. Radix-style props (`onInteractOutside`, `onPointerDownOutside`, `onEscapeKeyDown`) **do not exist** on Base UI's `Dialog.Popup`. The only interception point is `Dialog.Root`'s `onOpenChange(open, eventDetails)`.

Verified directly in installed source (`node_modules/@base-ui/react/esm/dialog/store/DialogStore.js`):

```js
setOpen = (nextOpen, eventDetails) => {
  ...
  this.context.onOpenChange?.(nextOpen, eventDetails);
  if (eventDetails.isCanceled) {
    return;            // <-- close IS aborted when cancel() is called
  }
  ...
};
```

**Conclusion**: `eventDetails.cancel()` inside `onOpenChange` genuinely prevents the close in Base UI 1.5.0. The drawer-side interception from 3B.4B was structurally valid. The failure had to be elsewhere.

---

## 6. Runtime Investigation Findings

### 6.1 Was dirty state becoming true? — **NO. This was the real bug.**

The pre-fix `useFormDirty` hook did this:

```ts
useEffect(() => {
  ...
  const form = document.getElementById(formId);   // runs at component mount
  if (!form) {
    console.warn(`useFormDirty: Form with id "${formId}" not found`);
    return;                                        // no listeners attached
  }
  form.addEventListener("input", handleInput);
  ...
}, [formId, enabled, isDirty]);
```

Two fatal runtime facts:

1. **The `<form>` element lives inside `SheetContent` (Base UI `Dialog.Popup`), which is rendered in a portal only while the drawer is open.** 22 of 23 form components (all except `CustomerFormDrawer`, which returns `null` when closed) stay mounted on the page with the drawer closed. Their `useFormDirty` effect ran at page mount, found no form in the DOM, logged the warning, and attached **nothing**.
2. **The effect dependencies are `[formId, enabled, isDirty]` — none of them change when the drawer opens.** So the effect never re-ran after the form actually entered the DOM. Listeners were never attached, `isDirty` stayed `false` forever, `shouldBlockClose` was `false`, and every outside click / Esc / X closed the drawer immediately.

This is Root Cause A from the 4B checklist ("hook attaching before form exists") — it was never actually verified at runtime in previous phases.

### 6.2 Was the outside-click event interceptable? — **Yes.**

Once `isDirty` is genuinely `true`, the existing `onOpenChange` + `eventDetails.cancel()` interception works, as proven both in the installed library source (Section 5) and in the live browser (Section 10).

### 6.3 Secondary defect found: stale dirty state across reopen

Because 22 forms stay mounted while their drawer is closed, a dirty form closed via Discard would leave `isDirty === true` in the still-mounted component. On the next clean open, the confirmation would appear incorrectly. This was fixed with an auto-reset (Section 8).

---

## 7. Exact Root Cause

```text
useFormDirty looked up the form element once, at component mount, before the
portal-rendered drawer content existed in the DOM. The lookup failed silently
(console warning only), no input/change listeners were ever attached, and the
effect's dependency array gave it no reason to retry when the drawer opened.
isDirty therefore remained false in every real user session, so the Safe Close
interception in ERPDrawerForm — which was itself correct — never engaged.
```

### Why previous 3B.4 / 3B.4A / 3B.4B fixes still failed

- 3B.4 / 3B.4A / 3B.4B all focused on the **close-interception side** (`onOpenChange`, `cancel()`, reason filtering, context-based Cancel routing). That side was eventually correct.
- No phase verified **at runtime** that `isDirty` ever became `true`. It never did, because of the portal mount-timing bug in `useFormDirty`.
- A correct gate fed by a permanently-false signal blocks nothing.

---

## 8. Files Inspected / Modified

### Inspected

- `node_modules/@base-ui/react` (DialogRoot.d.ts, DialogStore.js, reason-parts — installed v1.5.0 API verification)
- `src/components/erp/erp-drawer-form.tsx`
- `src/components/erp/erp-form-footer.tsx`
- `src/components/erp/unsaved-changes-dialog.tsx`
- `src/hooks/use-form-dirty.ts`
- `src/components/ui/sheet.tsx`
- `src/features/master-data/customers/components/customer-form-drawer.tsx`
- `src/features/roles/role-form-dialog.tsx`
- `src/lib/supabase/middleware.ts` (route protection, for harness placement)

### Modified

1. **`src/hooks/use-form-dirty.ts`** — full rewrite of the tracking mechanism (the actual fix):
   - **Document-level event delegation (capture phase)** instead of direct form listeners. A listener on `document` exists regardless of when/where the form mounts; native `input`/`change` events from the portal content still bubble through the real DOM to `document`. Each event is matched via `target.closest("form")?.id === formId`.
   - **Derived disabled state**: `isDirty = enabled && isDirtyInternal`, so View mode always reports clean without setState-in-effect.
   - **Auto-reset via MutationObserver**: when dirty and the tracked form leaves the DOM (drawer closed/discarded), internal dirty state resets — preventing stale dirty state on reopen for always-mounted form components. Observer only runs while dirty.
   - Added `markDirty` to the return value for future custom components that don't emit `input`/`change` (additive, non-breaking).
2. **`src/components/erp/erp-drawer-form.tsx`** — simplified `handleOpenChange`: any Base UI-initiated close while dirty is cancelled via `eventDetails.cancel()` and routed to the confirmation dialog (no fragile reason whitelist needed, since programmatic closes — Discard / Save & Close — call the parent `onOpenChange` directly and never pass through this handler).

No form-level changes were required; all 23 forms' wiring (`useFormDirty` → `isDirty` → `ERPDrawerForm`, `hasUnsavedChanges` → footer, `resetDirty()` after save) was re-verified intact from 3B.4A/4B.

---

## 9. Runtime / Browser Test Evidence

```text
Browser runtime verified successfully.
```

Because the app requires Supabase login (no test credentials available), a **temporary dev-only harness** (`/dev/safe-close-test`) was created per the prompt's instruction, mounting the real `ERPDrawerForm` + `ERPFormFooter` + `useFormDirty` exactly as production forms do. **The harness was removed after verification** (confirmed absent from the final build's route list).

All tests executed in a real browser (Chromium via Cursor browser, against the running dev server):

| # | Scenario | Result |
|---|----------|--------|
| 1 | Type in Add form → `isDirty` becomes `true` (verified via DOM probe) | ✅ PASS |
| 2 | Dirty Add + outside click (pointer events on backdrop) → drawer stays open, Unsaved Changes dialog appears, typed data preserved | ✅ PASS (screenshot captured) |
| 3 | Stay on Form → confirmation closes, drawer open, data intact | ✅ PASS |
| 4 | Dirty Add + Escape → drawer stays open, confirmation appears | ✅ PASS |
| 5 | Dirty Add + X header button → confirmation appears | ✅ PASS |
| 6 | Dirty Add + Cancel footer button → confirmation appears | ✅ PASS |
| 7 | Discard Changes → confirmation and drawer both close | ✅ PASS |
| 8 | Dirty auto-reset after Discard (form left DOM → `isDirty: false`) | ✅ PASS |
| 9 | Clean Add + outside click → closes directly, no confirmation | ✅ PASS |
| 10 | Save → dirty resets, drawer stays open; subsequent outside click closes directly | ✅ PASS |
| 11 | Save & Close on dirty form → saves, closes, **no** confirmation | ✅ PASS |
| 12 | View mode + outside click (even after typing) → closes directly, no confirmation | ✅ PASS |

The full suite was re-executed after the final lint-driven hook revision to confirm the shipped code is the verified code.

Evidence screenshot: `safe-close-outside-click-blocked.png` — drawer open with typed data "Test Customer ABC", amber "Unsaved Changes" footer indicator, and the Unsaved changes confirmation dialog over it.

---

## 10. Forms Verified

All 23 rolled-out forms re-verified via grep for correct wiring (`useFormDirty` import+usage, `isDirty={isDirty}`, `resetDirty()` after save):

customer-form-drawer, role-form-dialog, add-user-dialog, user-edit-dialog, branch-form-dialog, organization-form-dialog, numbering-rule-form-dialog, country/emirate/city/area/port-form-dialog, bank/currency/payment-term/tax-type/cost-center/profit-center-form-dialog, uom-category/unit/conversion-form-dialog, lookup category/value-form-dialog.

Because the fix is in the shared `useFormDirty` hook and `ERPDrawerForm`, it applies to all 23 forms with zero per-form changes.

---

## 11. Static Test Results

| Test | Command | Result |
|------|---------|--------|
| TypeScript | `npm run typecheck` | ✅ PASS (exit 0) |
| Build | `npm run build` | ✅ PASS (exit 0, all 34 routes, harness route absent) |
| Lint | `npm run lint` | ✅ Run. One new error initially introduced in the hook (`set-state-in-effect`) was fixed by switching to derived state. Remaining failures are pre-existing and located in `UIUX_Design/v0_extracted` and legacy `erp-drawer-form.tsx` unused-prop warnings (placeholders for Phase 002E.3) — unrelated to this fix. |

---

## 12. Known Limitations

1. **Custom widgets that emit no DOM `input`/`change` events** (fully synthetic comboboxes, drag-reorder lists) will not auto-mark dirty. The hook now exports `markDirty()` for manual wiring if such a field is found during QA. All standard inputs, textareas, selects, checkboxes, and shadcn/Base UI form controls emit these events.
2. **Outside-click in tests was synthesized** via `PointerEvent`/`MouseEvent` dispatch on the real Base UI backdrop element (the harness browser cannot click through the modal overlay). This exercises the identical Base UI outside-press handler path a real user pointer takes.
3. **In-app verification on the live Customer form behind login** was not possible (no test credentials); behavior was proven with the production components in the dev harness. A quick manual smoke test on Customer/Role/Country by Sameer/Dina is recommended as final acceptance.

---

## 13. Final Status

```text
PASS — Safe Close runtime issue fixed and verified in browser.
```

All closure criteria confirmed at runtime:

- ✅ Dirty Add/Edit outside click does not close directly
- ✅ Unsaved Changes dialog appears
- ✅ Stay on Form keeps drawer open
- ✅ Discard Changes closes drawer
- ✅ Dirty Esc shows confirmation
- ✅ Dirty X/Cancel shows confirmation
- ✅ Clean form can close directly
- ✅ View mode closes directly
- ✅ Save resets dirty and keeps open
- ✅ Save & Close saves and closes
- ✅ Typecheck passes
- ✅ Build passes

---

**Report Generated**: 2026-06-12 08:24 UTC+4
**Phase**: ERP BASE 002F.3E.3B.4C
**Status**: PASS
