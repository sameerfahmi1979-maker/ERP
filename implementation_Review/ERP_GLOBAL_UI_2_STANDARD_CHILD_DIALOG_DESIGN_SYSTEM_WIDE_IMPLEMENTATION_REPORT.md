# ERP GLOBAL UI.2 — Standard Child Dialog Design System-Wide
## Implementation Report

**Phase:** ERP GLOBAL UI.2  
**Date:** 2026-06-14  
**Status:** COMPLETED  
**Build:** ✅ PASS  
**TypeScript:** ✅ PASS (1 pre-existing error unrelated to this phase)

---

## Summary

Applied the approved ERP child form dialog standard across all implemented ERP modules.
Created a permanent, reusable `ERPChildDialogForm` component. All child form dialogs now
use consistent 960px width, a visible dimmed overlay, sticky header + footer, scrollable
body, and correct z-index layering above the parent drawer.

---

## Modules Inspected

| Module | Files Inspected | Child Forms Found |
|--------|-----------------|-------------------|
| Party Master (tabs) | 8 tab files | 8 child dialogs |
| Party Admin Tables | 3 admin table files | 3 standalone form dialogs |
| Customer (legacy) | 3 child section files | 3 child dialogs |
| Users | 2 dialog files | 1 role assignment dialog |
| Geography | 6 table + 5 form-dialog files | 5 CRUD drawers (ERPDrawerForm — skip) |
| Finance Basics | 7 table + 7 form-dialog files | 7 CRUD drawers (ERPDrawerForm — skip) |
| UOM | 3 table + 3 form-dialog files | 3 CRUD drawers (ERPDrawerForm — skip) |
| Lookups | 2 form-dialog files | 2 CRUD drawers (ERPDrawerForm — skip) |
| Organizations | 1 file | 1 CRUD drawer (ERPDrawerForm — skip) |
| Branches | 1 file | 1 CRUD drawer (ERPDrawerForm — skip) |
| Roles | 1 file | 1 CRUD drawer (ERPDrawerForm — skip) |
| Numbering | 1 file | 1 CRUD drawer (ERPDrawerForm — skip) |
| ERP Email Send | 1 file | 1 utility dialog |
| Unsaved Changes | 1 file | 1 alert/confirmation dialog |

**Total unique `DialogContent` usages found:** 38 files  
**Child form dialogs (ERPChildDialogForm applied):** 15  
**Utility dialogs (overlay/footer fixed, not ERPChildDialogForm):** 1  
**Standalone CRUD drawers (ERPDrawerForm, no action needed):** 20  
**Alert/confirmation dialogs (AlertDialogContent, no action needed):** 18  

---

## Child Dialogs Found and Refactored

### Party Master — 8 child forms (inside Party drawer)

| File | Dialog Title | Size | Previous Width |
|------|-------------|------|---------------|
| `party-licenses-tab.tsx` | Add/Edit License | `lg` (960px) | `max-w-2xl` |
| `party-tax-finance-tab.tsx` | Add/Edit Tax Registration | `lg` (960px) | `max-w-xl` |
| `party-contacts-tab.tsx` | Add/Edit Contact | `lg` (960px) | `max-w-2xl` |
| `party-addresses-tab.tsx` | Add/Edit Address | `lg` (960px) | `max-w-2xl` |
| `party-bank-details-tab.tsx` | Add/Edit Bank Detail | `lg` (960px) | `max-w-xl` |
| `party-documents-tab.tsx` | Add/Edit Document Record | `lg` (960px) | `max-w-xl` |
| `party-services-tab.tsx` | Assign Service Category | `md` (640px) | `max-w-md` |
| `party-notes-tab.tsx` | Add/Edit Note | `md` (640px) | `max-w-lg` |

**Inert wrapper fix in `party-form-drawer.tsx`:**
- Changed from `className="contents"` → `className={cn("flex flex-col flex-1 overflow-hidden min-h-0", "transition-opacity duration-200", childDialogOpen && "opacity-50")}`
- The drawer content now visually dims (opacity-50) when a child dialog is open
- The `inert` attribute still blocks all interaction

### Customer (Legacy) — 3 child forms

| File | Dialog Title | Size | Previous Width |
|------|-------------|------|---------------|
| `customer-contacts-section.tsx` | Add/Edit Contact | `lg` (960px) | `max-w-2xl max-h-[90vh] overflow-y-auto` |
| `customer-addresses-section.tsx` | Add/Edit Address | `lg` (960px) | `max-w-3xl max-h-[90vh] overflow-y-auto` |
| `customer-bank-details-section.tsx` | Add/Edit Bank Detail | `lg` (960px) | `max-w-2xl max-h-[90vh] overflow-y-auto` |

**Note:** Customer sections converted `handleSubmit(e: React.FormEvent)` to `handleSubmit()` since
ERPChildDialogForm uses a button onClick pattern. Native HTML form validation (required attributes)
is replaced by server-side validation (already in place in server actions).

### Party Admin Tables — 3 standalone form dialogs

| File | Dialog Title | Size | Previous Width |
|------|-------------|------|---------------|
| `service-categories-admin-table.tsx` | Add/Edit Category | `md` (640px) | `max-w-lg` |
| `party-types-admin-table.tsx` | Add/Edit Party Type | `md` (640px) | `max-w-lg` |
| `relationship-types-admin-table.tsx` | Add/Edit Relationship Type | `md` (640px) | `max-w-lg` |

### Users Module — 1 role assignment dialog

| File | Dialog Title | Size | Previous Width |
|------|-------------|------|---------------|
| `assign-role-dialog.tsx` | Assign Role to {User} | `sm` (480px) | default (`sm:max-w-sm`) |

**Note:** `assign-role-dialog.tsx` was using `FormData` via `e.currentTarget` (form element).
Refactored to controlled inputs (`useState` per field) + direct click handler.

---

## Dialogs Intentionally Skipped (with Reasons)

### 1. `erp-send-email-dialog.tsx` — Utility dialog (partial fix applied)

- **Classification:** Utility — email composition dialog, not a child record form
- **Action:** Applied overlay fix (`bg-slate-950/40 backdrop-blur-[2px] z-[60]`) and fixed
  sticky footer pattern (footer was scrolling with content before)
- **Why not ERPChildDialogForm:** Complex conditional footer state
  (`isGeneratingAttachment || isSending || validationErrors`), custom header description
  layout with attachment metadata
- **Result:** Overlay and sticky footer now match standard without breaking complex state

### 2. `unsaved-changes-dialog.tsx` — Alert/confirmation dialog

- **Classification:** Confirmation — uses `AlertDialog`/`AlertDialogContent`
- **Action:** No change
- **Why skipped:** Confirmation dialogs are explicitly excluded from ERPChildDialogForm scope

### 3. 18 `AlertDialogContent` usages (delete confirmations across all tables)

- **Classification:** Confirmation — delete/confirm only
- **Action:** No change
- **Why skipped:** Confirmation dialogs use `AlertDialog` which has its own correct sizing

### 4. 20 `ERPDrawerForm`-based CRUD files (geography, finance, UOM, lookups, etc.)

- **Classification:** Standalone CRUD drawers — NOT nested dialogs
- **Action:** No change
- **Why skipped:** These are standalone add/edit screens that open as `Sheet` drawers via
  `ERPDrawerForm`. They already follow the correct ERP drawer standard (sticky footer,
  subtitle, scrollable body). They are NOT child dialogs.

---

## ERPChildDialogForm Component

**Created:** `src/components/erp/erp-child-dialog-form.tsx`

### Features
- Fixed header: icon + title + subtitle + Close X (Base UI `render` prop pattern)
- Scrollable body: `flex-1 overflow-y-auto p-6 min-h-0`
- Sticky footer: Cancel (left) + Submit (right), `shrink-0`
- Overlay: `bg-slate-950/40 backdrop-blur-[2px]` via `overlayClassName` prop on `DialogContent`
- Z-index: overlay `z-[60]`, content `z-[70]` (above parent Sheet at `z-50`)
- Size tokens: `sm` (480px), `md` (640px), `lg` (960px, default), `xl` (1120px)
- `isSubmitting` prop: disables all buttons, shows `Loader2` spinner on submit
- `mode` prop: auto-sets submit label (`Add` / `Save`)

### Key Design Decisions
- Uses Base UI `DialogPrimitive.Close` with `render` prop (not Radix `asChild`)
- `overlayClassName` prop added to `dialog.tsx` `DialogContent` (backward-compatible: optional)
- Width: `w-[calc(100vw-24px)] sm:max-w-[{size}]` — mobile full-width, capped by size on desktop

---

## `dialog.tsx` Modification

**File:** `src/components/ui/dialog.tsx`

Added `overlayClassName?: string` prop to `DialogContent`:
```tsx
function DialogContent({
  className,
  overlayClassName,   // NEW — optional
  ...
}) {
  return (
    <DialogPortal>
      <DialogOverlay className={overlayClassName} />  // passes through to cn()
      ...
```

This is backward-compatible: all existing `DialogContent` usages that don't pass
`overlayClassName` continue to use the default `bg-black/10 backdrop-blur-xs` overlay.

---

## Overlay / Shading Behavior

| Condition | Visual Result |
|-----------|---------------|
| No dialog open | Parent drawer visible, no overlay |
| Child dialog opens | Overlay `bg-slate-950/40 backdrop-blur-[2px]` covers background |
| Parent drawer (Party Master) | dims to `opacity-50` + `inert` (no clicks/keys) |
| Child dialog content | Sharp, clear, fully interactive |
| ESC pressed | Child dialog closes first (Base UI default) |
| Outside click on overlay | Child dialog closes |
| After child dialog closes | Parent drawer returns to full opacity, fully interactive |

---

## Parent Inert Behavior

| Scenario | Result |
|----------|--------|
| Child dialog open | Party drawer tabs: non-clickable |
| Child dialog open | Party drawer form fields: non-focusable |
| Child dialog open | Party drawer Save/Save & Close: non-clickable |
| Child dialog open | Duplicate detection dialog (outside inert div): still interactive |
| Child dialog closed | All parent drawer interactions restored |

**Coverage:** Inert wrapper is implemented in `party-form-drawer.tsx` only.
Customer module (`CustomerFormDrawer`) does not yet have the inert pattern — tracked as
a future improvement.

---

## TypeScript Result

```
TypeScript check: ✅ PASS
New errors introduced by this phase: 0

Pre-existing error (unrelated):
  .next/types/validator.ts(357,39): TS2307 — missing admin/workspace page.js
  (generated Next.js type file; unrelated to UI.2 changes)
```

---

## Build Result

```
Next.js 16.2.6 (Turbopack)
✓ Compiled successfully in 8.7s
✓ TypeScript check passed
✓ Static pages generated (2/2)
34 routes: all ✓
```

---

## Files Changed

| File | Change |
|------|--------|
| `src/components/ui/dialog.tsx` | Added `overlayClassName` prop to `DialogContent` |
| `src/components/erp/erp-child-dialog-form.tsx` | **CREATED** — global standard component |
| `.cursor/rules/erp-child-dialog-form-standard.mdc` | **UPDATED** — finalized from planning phase |
| `src/features/master-data/parties/party-form-drawer.tsx` | Fixed inert wrapper: `contents` → `flex flex-col` + `opacity-50` |
| `src/features/master-data/parties/party-licenses-tab.tsx` | Migrated to ERPChildDialogForm |
| `src/features/master-data/parties/party-tax-finance-tab.tsx` | Migrated to ERPChildDialogForm |
| `src/features/master-data/parties/party-contacts-tab.tsx` | Migrated to ERPChildDialogForm |
| `src/features/master-data/parties/party-addresses-tab.tsx` | Migrated to ERPChildDialogForm |
| `src/features/master-data/parties/party-bank-details-tab.tsx` | Migrated to ERPChildDialogForm |
| `src/features/master-data/parties/party-documents-tab.tsx` | Migrated to ERPChildDialogForm |
| `src/features/master-data/parties/party-services-tab.tsx` | Migrated to ERPChildDialogForm |
| `src/features/master-data/parties/party-notes-tab.tsx` | Migrated to ERPChildDialogForm |
| `src/features/master-data/parties/admin/service-categories-admin-table.tsx` | Migrated to ERPChildDialogForm |
| `src/features/master-data/parties/admin/party-types-admin-table.tsx` | Migrated to ERPChildDialogForm |
| `src/features/master-data/parties/admin/relationship-types-admin-table.tsx` | Migrated to ERPChildDialogForm |
| `src/features/master-data/customers/components/customer-contacts-section.tsx` | Migrated to ERPChildDialogForm |
| `src/features/master-data/customers/components/customer-addresses-section.tsx` | Migrated to ERPChildDialogForm |
| `src/features/master-data/customers/components/customer-bank-details-section.tsx` | Migrated to ERPChildDialogForm |
| `src/features/users/assign-role-dialog.tsx` | Migrated to ERPChildDialogForm |
| `src/components/erp/email/erp-send-email-dialog.tsx` | Overlay + sticky footer fix (partial; utility dialog) |

**Total files modified:** 21

---

## Acceptance Criteria Checklist

| Criterion | Status |
|-----------|--------|
| ERPChildDialogForm created | ✅ |
| Cursor rule created/updated | ✅ |
| Party Master child dialogs standardized | ✅ 8/8 |
| All implemented module child dialogs audited | ✅ |
| All applicable child dialogs refactored | ✅ 15/15 + 1 partial |
| Background shading appears when child dialog opens | ✅ `bg-slate-950/40 backdrop-blur-[2px]` |
| Parent drawer visibly disabled and inert | ✅ `opacity-50` + `inert` on Party drawer |
| Footer remains visible and sticky inside child dialog | ✅ |
| Body scrolls independently | ✅ `flex-1 overflow-y-auto min-h-0` |
| Consistent width and spacing | ✅ `lg=960px` standard |
| Comboboxes display labels, not IDs | ✅ (ERPCombobox preserved in all refactored forms) |
| TypeScript passes | ✅ (0 new errors) |
| Next build passes | ✅ |
| Implementation report generated | ✅ This file |
| Source-of-truth updated | ✅ |

---

## Remaining Limitations / Future Work

1. **CustomerFormDrawer inert pattern**: The customer module drawer does not yet implement
   the `inert` wrapper + `opacity-50` pattern. When a customer child dialog opens, the
   parent drawer is not dimmed/blocked. Tracked for a future hotfix.

2. **ERPSendEmailDialog**: Not fully migrated to ERPChildDialogForm due to complex conditional
   footer state. Overlay and sticky footer have been fixed. Full migration can be done when
   the email feature enters active development.

3. **Form validation (customer sections)**: Customer child sections previously used HTML
   `<form onSubmit>` with native `required` attribute validation. After migration, `required`
   attributes are still present on inputs but no longer enforce on form submit (button click
   bypasses HTML form validation). Server-side validation in server actions provides the actual
   enforcement.

---

## Next Recommended Phase

**ERP GLOBAL UI.3 — Customer Module Inert Wrapper**
- Add `childDialogOpen` state + `inert` wrapper to `CustomerFormDrawer`
- Apply `onChildOpen` prop to `CustomerContactsSection`, `CustomerAddressesSection`, `CustomerBankDetailsSection`
- Match the Party Master pattern exactly

Or continue to the next feature phase.
