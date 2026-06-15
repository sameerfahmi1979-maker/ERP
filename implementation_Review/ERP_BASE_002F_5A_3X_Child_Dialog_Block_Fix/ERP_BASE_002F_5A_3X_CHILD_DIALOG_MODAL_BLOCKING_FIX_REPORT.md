# ERP BASE 002F.5A.3X — Party Child Dialog Modal Blocking Fix
**Date:** 2026-06-14  
**Phase:** 002F.5A.3X (hot-fix)  
**Status:** COMPLETE

---

## Root Cause

Both the Party drawer (`Sheet`) and child form dialogs use `@base-ui/react/dialog` at `z-50`.
Base UI's nested modal stack does **not** automatically prevent the underlying Sheet layer from
receiving pointer and keyboard events when a child `Dialog` opens on top of it.

As a result, users could click the section nav, interact with parent fields, and trigger
Save / Save & Close while a child form dialog was visible.

---

## The Fix

### Mechanism: `inert` HTML attribute on the drawer content wrapper

The HTML `inert` attribute makes an element and **all its descendants** completely
non-interactive:
- Pointer events are ignored
- Keyboard events do not reach the element
- Focus cannot enter the subtree
- Accessibility tools report the element as hidden

**Key architectural fact**: child `Dialog` components render via `DialogPortal` to
`document.body` — **outside** the `SheetContent` DOM tree. Therefore, applying `inert` to
the SheetContent's inner wrapper makes the drawer content inert without affecting the Dialog.

### Changes: `party-form-drawer.tsx`

1. Added `childDialogOpen: boolean` state.
2. Added `handleChildOpen: (open: boolean) => void` callback.
3. Wrapped all drawer content (`ERPDrawerSectionNav`, `<form>`, `ERPDrawerBody`,
   `ERPFormFooter`) with:
   ```tsx
   <div inert={childDialogOpen || undefined} className="contents">
     ...
   </div>
   ```
4. Passed `onChildOpen={handleChildOpen}` to all 8 child tabs.

### Changes: 8 Tab Files

Each tab received:
1. `onChildOpen?: (open: boolean) => void` added to props type and destructuring.
2. A `setDialogOpen` helper:
   ```ts
   const setDialogOpen = (open: boolean) => { setIsDialogOpen(open); onChildOpen?.(open); };
   ```
3. All `setIsDialogOpen(true/false)` call sites replaced with `setDialogOpen(true/false)`.
4. `<Dialog onOpenChange={setIsDialogOpen}>` updated to `<Dialog onOpenChange={setDialogOpen}>`.

| Tab File | Dialog open calls | Dialog close calls |
|----------|------------------|-------------------|
| `party-licenses-tab.tsx` | openAdd, openEdit | handleSubmit, Cancel |
| `party-tax-finance-tab.tsx` | openAddTax, openEditTax | handleSubmit, Cancel |
| `party-contacts-tab.tsx` | openAdd, openEdit | handleSubmit, Cancel |
| `party-addresses-tab.tsx` | openAdd, openEdit | handleSubmit, Cancel |
| `party-bank-details-tab.tsx` | openAdd, openEdit | handleSubmit, Cancel |
| `party-documents-tab.tsx` | openAdd, openEdit | handleSubmit, Cancel |
| `party-services-tab.tsx` | openAdd | handleSubmit, Cancel |
| `party-notes-tab.tsx` | openAdd, openEdit | handleSubmit, Cancel |

---

## Behavior After Fix

| Action | Before | After |
|--------|--------|-------|
| Click parent tabs while child open | Allowed (tab changed) | Blocked by `inert` |
| Edit parent fields while child open | Allowed | Blocked |
| Click Save / Save & Close | Allowed | Blocked |
| Esc key | Closed parent drawer | Closes child dialog only |
| Outside click | May affect parent | Contained to dialog layer |
| After child closes | Normal | Normal |

---

## Build Results

- `npx tsc --noEmit` → **0 errors**
- `npx next build` → **✓ Compiled successfully**

---

## Files Modified

- `src/features/master-data/parties/party-form-drawer.tsx`
- `src/features/master-data/parties/party-licenses-tab.tsx`
- `src/features/master-data/parties/party-tax-finance-tab.tsx`
- `src/features/master-data/parties/party-contacts-tab.tsx`
- `src/features/master-data/parties/party-addresses-tab.tsx`
- `src/features/master-data/parties/party-bank-details-tab.tsx`
- `src/features/master-data/parties/party-documents-tab.tsx`
- `src/features/master-data/parties/party-services-tab.tsx`
- `src/features/master-data/parties/party-notes-tab.tsx`
- `.cursor/rules/erp-drawer-child-dialog-blocking.mdc` (new rule)
