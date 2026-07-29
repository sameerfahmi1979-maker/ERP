# ERP GLOBAL UI.4G — Child Form Modal Workspace Blocking and UX Standard Fix
## Implementation Report

**Phase:** ERP GLOBAL UI.4G  
**Status:** CLOSED / PASS ✅  
**Date:** 2026-06-14  
**Reported by:** Sameer  

---

## Reported Issue

When opening a child form (e.g., Add License inside Party record), the modal overlaid the workspace badly and the user could see — and click — workspace tabs behind the modal. This created risk of:

- Unsaved child data loss (navigating away while child form open)
- Confusing modal ownership (which tab does the child form belong to?)
- Multiple child forms accidentally open
- Silent dirty-state data loss

---

## Final Design Decision

**Child forms are intentional BLOCKING modal tasks.**

When a child form is open:
1. The full workspace is dimmed — background, sidebar, and tab bar are all covered.
2. Workspace tab switching is disabled (overlay physically covers the tab bar).
3. Outside click and Esc do NOT close the dialog — the user must Cancel/X/Save.
4. The parent record content becomes inert + dimmed.
5. Only the child form content and combobox dropdowns are interactive.

This decision deliberately blocks tab navigation while a child form is open. This is intentional and correct — switching tabs while a child form is open creates data integrity and ownership confusion.

---

## Files Modified

| File | Change |
|------|--------|
| `src/components/erp/erp-child-dialog-form.tsx` | Raised overlay to `z-[100]`, content to `z-[110]`. Added `programmaticCloseRef` guard blocking outside-click/Esc. Changed X button from `DialogPrimitive.Close` to plain button calling `handleCancel()`. Updated overlay color to `bg-slate-950/60`. Updated size tokens (sm=520px, md=720px). |
| `src/components/workspace/workspace-tab-bar.tsx` | Lowered `z-[100]` → `z-[30]`. Updated comment to explain intentional blocking behavior. |
| `src/components/erp/combobox/erp-combobox.tsx` | Raised dropdown `z-[80]` → `z-[120]`. Updated comment. |
| `src/features/users/user-workspace-form.tsx` | Added `isChildDialogOpen={assignRoleOpen}` to `ERPRecordWorkspaceForm`. Fixed encoding artifact in subtitle string. |
| `.cursor/rules/erp-child-dialog-form-standard.mdc` | Updated Golden Rules section with all 8 UI.4G rules. Updated z-index table. Updated phase reference. |
| `.cursor/rules/erp-workspace-tabs-standard.mdc` | Updated Rule 12 to document blocking behavior. Updated Rule 19 z-index table. Updated status to UI.4G. |
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | Added global non-negotiable rule 17. Added UI.4G phase row to status table. Added to change log. |

---

## Z-Index Standard (New — UI.4G)

| Layer | Z-index | Notes |
|-------|---------|-------|
| App/page content | base | |
| Workspace tab bar | `z-[30]` | **Intentionally below overlay** — blocks tab switching while child form open |
| Child dialog overlay | `z-[100]` | Full-screen; covers tab bar and sidebar |
| Child dialog content | `z-[110]` | |
| Combobox/popover inside child dialog | `z-[120]` | Above dialog content |
| Alert/confirm dialog | `z-[130]` | |
| Toast | top layer | |

**Previous stack (UI.4E.1 — now retired):**
- Tab bar: `z-[100]` — was above the child dialog (broke blocking)
- Child dialog overlay: `z-[60]`
- Child dialog content: `z-[70]`
- Combobox: `z-[80]`

---

## ERPChildDialogForm Changes

### Z-index
- Overlay: `z-[60]` → `z-[100]`  
- Content: `z-[70]` → `z-[110]`
- Overlay color: `bg-slate-950/40` → `bg-slate-950/60` (slightly stronger dim for full-screen blocking)

### Outside Click / Esc Prevention

Added `programmaticCloseRef` mechanism:

```tsx
const programmaticCloseRef = useRef(false);

const closeDialog = useCallback(() => {
  programmaticCloseRef.current = true;
  onOpenChange(false);
  queueMicrotask(() => { programmaticCloseRef.current = false; });
}, [onOpenChange]);

// Blocks all close attempts not triggered by Cancel/X/Save
const guardedOnOpenChange = useCallback((newOpen: boolean) => {
  if (!newOpen && !programmaticCloseRef.current) return; // blocked
  onOpenChange(newOpen);
}, [onOpenChange]);
```

### X Button

Changed from `DialogPrimitive.Close` (which triggered Base UI's close mechanism directly) to a plain `<Button>` that calls `handleCancel()`. This ensures the guard works for X button as well.

### Size Tokens Updated

| Token | Old | New |
|-------|-----|-----|
| `sm` | 480px | 520px |
| `md` | 640px | 720px |
| `lg` | 960px | 960px (unchanged) |
| `xl` | 1120px | 1120px (unchanged) |

---

## Full Child Form Audit Matrix

### Party Master Child Tabs

| Child Form | File | Uses ERPChildDialogForm | Has onChildOpen | Blocks Parent | Needs Fix | Status |
|-----------|------|------------------------|-----------------|---------------|-----------|--------|
| Party Licenses | `party-licenses-tab.tsx` | ✅ | ✅ | ✅ via `isChildDialogOpen` | No | PASS |
| Party Contacts | `party-contacts-tab.tsx` | ✅ | ✅ | ✅ | No | PASS |
| Party Addresses | `party-addresses-tab.tsx` | ✅ | ✅ | ✅ | No | PASS |
| Party Bank Details | `party-bank-details-tab.tsx` | ✅ | ✅ | ✅ | No | PASS |
| Party Documents | `party-documents-tab.tsx` | ✅ | ✅ | ✅ | No | PASS |
| Party Services / Categories | `party-services-tab.tsx` | ✅ | ✅ | ✅ | No | PASS |
| Party Notes | `party-notes-tab.tsx` | ✅ | ✅ | ✅ | No | PASS |
| Party Tax / Finance | `party-tax-finance-tab.tsx` | ✅ | ✅ | ✅ | No | PASS |

**Parent wiring:** `party-workspace-form.tsx` correctly passes `isChildDialogOpen={childDialogOpen}` to `ERPRecordWorkspaceForm`. All 8 tabs call `onChildOpen(open)` when dialog opens/closes.

### Party Admin Master Modals

| Child Form | File | Uses ERPChildDialogForm | onChildOpen | Notes | Status |
|-----------|------|------------------------|-------------|-------|--------|
| Party Types | `admin/party-types-admin-table.tsx` | ✅ | N/A — standalone admin page | Overlay blocks tab bar via z-index | PASS |
| Service Categories | `admin/service-categories-admin-table.tsx` | ✅ | N/A | As above | PASS |
| Relationship Types | `admin/relationship-types-admin-table.tsx` | ✅ | N/A | As above | PASS |

### Users Module

| Child Form | File | Uses ERPChildDialogForm | isChildDialogOpen | Status |
|-----------|------|------------------------|-------------------|--------|
| Assign Role | `users/assign-role-dialog.tsx` | ✅ | ✅ Fixed — `isChildDialogOpen={assignRoleOpen}` added to `UserWorkspaceForm` | PASS |

### Finance Basics / Geography / UOM / Lookups / Admin

All previously had `*-form-dialog.tsx` files. After the workspace conversion (UI.4E.1), these form dialog files are **no longer imported** by any active table component. They are dead code.

| Module | Assessment | Status |
|--------|-----------|--------|
| Finance Basics (`bank-form-dialog.tsx`, `currency-form-dialog.tsx`, etc.) | NOT APPLICABLE — legacy pre-workspace dialogs. Not imported by any active table. Main forms are workspace record forms. | N/A |
| Geography (`city-form-dialog.tsx`, `emirate-form-dialog.tsx`, etc.) | NOT APPLICABLE — same as above | N/A |
| UOM (`uom-category-form-dialog.tsx`, `conversion-form-dialog.tsx`, etc.) | NOT APPLICABLE — same as above | N/A |
| Lookups (`category-form-dialog.tsx`, `value-form-dialog.tsx`) | NOT APPLICABLE — same as above | N/A |
| Branches, Organizations, Roles, Numbering | NOT APPLICABLE — `branch-form-dialog.tsx`, `organization-form-dialog.tsx`, etc. are legacy; not imported | N/A |

### Dead Code Dialogs (Legacy — Not Imported)

These files still exist in the codebase but are not imported anywhere:
- `src/features/users/user-edit-dialog.tsx` — uses `ERPDrawerForm` (legacy)
- `src/features/master-data/finance-basics/components/bank-form-dialog.tsx`
- `src/features/master-data/finance-basics/components/currency-form-dialog.tsx`
- `src/features/master-data/finance-basics/components/cost-center-form-dialog.tsx`
- `src/features/master-data/finance-basics/components/profit-center-form-dialog.tsx`
- `src/features/master-data/finance-basics/components/payment-term-form-dialog.tsx`
- `src/features/master-data/finance-basics/components/tax-type-form-dialog.tsx`
- `src/features/master-data/geography/components/city-form-dialog.tsx`
- `src/features/master-data/geography/components/country-form-dialog.tsx`
- `src/features/master-data/geography/components/emirate-form-dialog.tsx`
- `src/features/master-data/geography/components/area-form-dialog.tsx`
- `src/features/master-data/geography/components/port-form-dialog.tsx`
- `src/features/numbering/components/numbering-rule-form-dialog.tsx`
- `src/features/roles/role-form-dialog.tsx`
- `src/features/branches/branch-form-dialog.tsx`
- `src/features/organizations/organization-form-dialog.tsx`
- `src/features/master-data/lookups/components/category-form-dialog.tsx`
- `src/features/master-data/lookups/components/value-form-dialog.tsx`
- `src/features/master-data/uom/components/uom-category-form-dialog.tsx`
- `src/features/master-data/uom/components/conversion-form-dialog.tsx`

These are safe to delete in a future cleanup phase but do not affect runtime behavior.

---

## QA Scenarios — Source-Level Verification

### Scenario A — Party License child form
- `party-workspace-form.tsx` has `isChildDialogOpen={childDialogOpen}` ✅
- `party-licenses-tab.tsx` calls `onChildOpen?.(open)` ✅
- `ERPChildDialogForm` overlay at `z-[100]` ✅ — covers entire viewport
- Tab bar at `z-[30]` ✅ — below the overlay, not clickable
- Parent record content becomes `inert + opacity-50` ✅

### Scenario B — Workspace blocked intentionally
- Tab bar `z-[30]` is below overlay `z-[100]` ✅
- Clicking tab bar while child form is open: pointer events blocked by overlay ✅

### Scenario C — Dirty child close
- Outside click: `guardedOnOpenChange` blocks `onOpenChange(false)` unless `programmaticCloseRef.current = true` ✅
- Esc key: Same guard applies (Base UI Esc fires `onOpenChange(false)`) ✅
- Cancel button: Calls `handleCancel()` → `closeDialog()` → sets ref → calls `onOpenChange(false)` ✅
- X button: Now a plain `<Button onClick={handleCancel}>` — goes through same guard ✅
- No silent data loss ✅

### Scenario D — Combobox in child modal
- `ERPCombobox` dropdown at `z-[120]` ✅
- Above dialog content at `z-[110]` ✅
- Dropdown appears above all modal content ✅

### Scenario E — Party Contacts / Address / Bank Details
- All three tabs use `ERPChildDialogForm` ✅
- All three tabs call `onChildOpen` ✅
- Parent workspace form passes `isChildDialogOpen` ✅

### Scenario F — Party admin masters
- `party-types-admin-table.tsx`, `service-categories-admin-table.tsx`, `relationship-types-admin-table.tsx` all use `ERPChildDialogForm` ✅
- No parent workspace form (standalone admin pages), but z-index fix still blocks tab bar ✅

---

## TypeScript / Build

```
npx tsc --noEmit  → Exit code: 0 ✅
npx next build    → Exit code: 0 ✅
```

---

## Cursor Rules Updated

- `.cursor/rules/erp-child-dialog-form-standard.mdc` — Added 8 UI.4G Golden Rules, updated z-index table (z-[100]/z-[110]/z-[120]), updated size tokens, updated phase reference.
- `.cursor/rules/erp-workspace-tabs-standard.mdc` — Updated Rule 12 (blocking behavior), updated Rule 19 (z-index table), updated status to UI.4G.

---

## Known Limitations

1. **Legacy form dialog files** — ~20 `*-form-dialog.tsx` files exist in the codebase but are not imported anywhere. They are dead code from before the workspace conversion. A future `CLEANUP.2` phase should delete them.

2. **No per-form dirty tracking in child dialogs** — `ERPChildDialogForm` blocks outside-click/Esc uniformly, but does not detect whether the child form actually has unsaved changes. If the form is empty, Cancel still works correctly. A future phase could add per-child-form dirty tracking to show a confirmation dialog when X/Cancel is clicked on a dirty form.

3. **Party admin tables** — These standalone admin pages (Party Types, Service Categories, Relationship Types) use `ERPChildDialogForm` but are not inside an `ERPRecordWorkspaceForm`. The `onChildOpen` pattern is N/A for them. The z-index fix still blocks the tab bar correctly.

---

## Acceptance Criteria

| # | Criterion | Result |
|---|-----------|--------|
| 1 | Every child form in the ERP audited | ✅ 13 active + ~20 dead-code legacy dialogs |
| 2 | All child forms listed in report | ✅ |
| 3 | All active child forms use ERPChildDialogForm | ✅ |
| 4 | Child modal blocks workspace tab switching | ✅ (overlay z-[100] > tab bar z-[30]) |
| 5 | Child modal blocks sidebar/background | ✅ (full-screen overlay) |
| 6 | Parent record content inert/dimmed | ✅ (isChildDialogOpen wiring) |
| 7 | Child dialog header has clear context | ✅ (existing title/subtitle pattern) |
| 8 | Child dialog footer sticky and visible | ✅ (existing sticky footer) |
| 9 | Add License screenshot issue fixed | ✅ (z-index fix applies to all party child tabs) |
| 10 | Combobox dropdown above modal content | ✅ (z-[120] > z-[110]) |
| 11 | Dirty child close guarded | ✅ (outside click/Esc blocked universally) |
| 12 | Cursor rules updated | ✅ |
| 13 | Source-of-truth updated | ✅ |
| 14 | TypeScript passes | ✅ |
| 15 | Next build passes | ✅ |
| 16 | Implementation report generated | ✅ |

**All 16 acceptance criteria: PASS**

---

## Next Recommended Phase

**CLEANUP.2** — Delete legacy `*-form-dialog.tsx` dead code files (~20 files) that remain from before the workspace conversion. These are safe to remove as they are not imported anywhere.
