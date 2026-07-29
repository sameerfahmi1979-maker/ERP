# ERP Global Child Form Dialog Standard — Planning Document
**Document:** `implementation_Review/ERP_GLOBAL_CHILD_FORM_DIALOG_STANDARD_PLAN.md`  
**Date:** 2026-06-14  
**Phase:** Planning only (002F.5A.3Y — not yet implemented)  
**Status:** PLAN ONLY — do not apply system-wide until 002F.5A.3Y is approved  
**Triggered by:** Party Master child form size/visual inconsistency after `inert` blocking fix

---

## 1. Current Issue Summary

After the `inert` blocking fix (002F.5A.3X), parent drawers are correctly non-interactive while
child forms are open. However two problems remain:

1. **Visual**: The parent drawer does not appear dimmed/shaded. The user has no visual cue that
   the drawer is blocked. The Dialog backdrop (`bg-black/10`) is nearly transparent.

2. **Inconsistency**: 8 child form dialogs use 3 different widths, inconsistent headers,
   footer that scrolls with content (not sticky), and different grid patterns.

---

## 2. Current State: Audit of 8 Party Master Child Dialogs

### 2.1 Width Tiers (3 inconsistent tiers)

| Tier | `max-w-*` | Effective px | Files |
|------|-----------|-------------|-------|
| Wide | `max-w-2xl` | 672px | licenses, contacts, addresses |
| Medium | `max-w-xl` | 576px | tax-finance, bank-details, documents |
| Narrow | `max-w-lg` / `max-w-md` | 512/448px | notes, services |

**Problem**: All should use `max-w-3xl` (768px) or a custom 960px class by default.

### 2.2 Overlay / Backdrop

- Default `DialogOverlay` uses `bg-black/10 backdrop-blur-xs` — nearly invisible.
- No explicit z-index layering — Sheet and Dialog both `z-50`, Dialog renders later in DOM so it visually wins, but the backdrop is far too faint.

### 2.3 Scroll / Footer Behavior

| Behavior | Count | Files |
|----------|-------|-------|
| `overflow-y-auto` on `DialogContent` — footer scrolls with body | 6 | licenses, tax, contacts, addresses, bank, documents |
| No overflow — short form, no internal scroll | 2 | services, notes |

**Problem**: Footer should always be sticky at the bottom (never scroll with content). The correct pattern is a flex column inside `DialogContent` with a separate scrollable body div.

### 2.4 Header Anatomy

- All tabs: `DialogHeader` with `DialogTitle` only (text only, no icon, no subtitle)
- No standardized subtitle/description line
- No consistent icon

### 2.5 Grid Layout

- All tabs use manual `grid grid-cols-12 gap-4` (not `ERPFieldGrid`)
- Common spans: `col-span-6` pairs, `col-span-12` full-width, `col-span-4` triplets, `col-span-3` quads
- Checkbox groups use nested inline grids (varying: `grid-cols-3`, `grid-cols-4`)
- No footer in body (all use `DialogFooter` from the component)

### 2.6 Technical Foundation

```
ui/dialog.tsx   → @base-ui/react/dialog → Portal to document.body
ui/sheet.tsx    → @base-ui/react/dialog (same!) → Portal to document.body
Both at z-50    → Dialog visually wins because it renders LATER in DOM
```

`DialogContent` default class: `fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] sm:max-w-sm gap-4 p-4`  
(the `sm:max-w-sm` = 384px is the default that all tabs override)

---

## 3. Recommended Standard: `ERPChildDialogForm`

### 3.1 Component

**File to create:** `src/components/erp/erp-child-dialog-form.tsx`

```tsx
type ERPChildDialogFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  mode?: "add" | "edit" | "view";
  size?: "sm" | "md" | "lg" | "xl";
  isSubmitting?: boolean;
  onCancel?: () => void;
  onSubmit?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  children: React.ReactNode;
};
```

### 3.2 Standard Size Tokens

| Size | Max-width | When to use |
|------|-----------|-------------|
| `sm` | 480px | Confirmation / simple delete dialogs (2–3 fields max) |
| `md` | 640px | Very simple forms (4–6 fields, no cascade) |
| `lg` | 960px | **Default** — all standard child forms |
| `xl` | 1120px | Complex matrix / table forms only (requires explicit justification) |

**Party Master child forms default: `lg` (960px)**

Responsive breakpoints:
```
Desktop (≥1024px):  max-w-[960px]
Tablet (768–1023px): max-w-[calc(100vw-48px)]
Mobile (<768px):     w-[calc(100vw-24px)] max-w-none
max-height: calc(100vh - 96px)
```

### 3.3 Overlay / Background Shading

The fix has two layers:

**Layer A — DialogOverlay (global backdrop):**
Override default `bg-black/10` → `bg-slate-950/40 backdrop-blur-[2px]`

This dims the entire viewport (sidebar + parent drawer) behind the child dialog.

```tsx
// Custom overlay for child dialogs:
<DialogOverlay className="bg-slate-950/40 backdrop-blur-[2px]" />
```

**Layer B — Parent Drawer Inert Wrapper Visual Dimming:**
The `inert` wrapper in `party-form-drawer.tsx` currently has `className="contents"`.
Change to a real positioned wrapper with conditional opacity:

```tsx
<div
  inert={childDialogOpen || undefined}
  className={cn(
    "flex flex-col flex-1 overflow-hidden min-h-0 transition-opacity duration-200",
    childDialogOpen && "opacity-50"
  )}
>
  <ERPDrawerSectionNav ... />
  <form ...>
    <ERPDrawerBody>...</ERPDrawerBody>
    <ERPFormFooter ... />
  </form>
</div>
```

> **Implementation note**: `opacity` on a `display: contents` element does not render in
> browsers. The wrapper must be a real box element (`flex flex-col flex-1 overflow-hidden
> min-h-0`) matching the existing drawer layout. The opacity dims the drawer content
> visually when inert. The Dialog (portal to body, later in DOM) stays sharp.

> **Stacking context caution**: `opacity < 1` creates a stacking context. Since the Dialog
> renders via portal to body (outside this wrapper entirely), there is **no conflict** — the
> Dialog is not a descendant of the opacity wrapper.

---

## 4. Z-Index / Layering Standard

### 4.1 Current State

| Layer | Current z-index | Component |
|-------|----------------|-----------|
| App content + sidebar | base (auto) | Layout |
| Sheet (drawer) backdrop | `z-50` | `SheetOverlay` / `SheetPrimitive.Backdrop` |
| Sheet (drawer) content | `z-50` | `SheetPrimitive.Popup` |
| Dialog backdrop | `z-50` | `DialogPrimitive.Backdrop` |
| Dialog content | `z-50` | `DialogPrimitive.Popup` |

Sheet and Dialog are both at `z-50`. Dialog wins visually because it is rendered **later in
the DOM** (portal appended to body after Sheet). This is fragile — relies on DOM order.

### 4.2 Recommended Standard

| Layer | Recommended z-index | Class token |
|-------|---------------------|-------------|
| App content / sidebar | auto | — |
| Parent drawer backdrop | `z-40` | `z-40` |
| Parent drawer content | `z-50` | `z-50` |
| Child dialog backdrop | `z-[60]` | `z-[60]` |
| Child dialog content | `z-[70]` | `z-[70]` |
| Nested confirm inside child | `z-[80]` | `z-[80]` |
| Toast | existing global | unchanged |

> **Implementation note**: This requires overriding z-index on `SheetOverlay`,
> `SheetContent`, and creating `ERPChildDialogForm`'s `DialogOverlay`/`DialogContent` with
> explicit z-`[60]`/`[70]`. This is a breaking change to `sheet.tsx` and should be done
> carefully in phase 002F.5A.3Y. Defer until then.

For now, DOM-order z-50 tie-breaking is acceptable (Dialog always mounts after Sheet).

---

## 5. Parent Blocking Standard

*(Implemented in 002F.5A.3X — documented here for completeness)*

When any child dialog is open:

| Requirement | Implementation |
|-------------|----------------|
| Drawer nav tabs not clickable | `inert` on wrapper |
| Drawer fields not editable | `inert` on wrapper |
| Drawer Save/Save & Close not clickable | `inert` on wrapper |
| Keyboard cannot reach drawer | `inert` on wrapper |
| Esc closes child first, not parent | Base UI Dialog handles Esc on topmost layer |
| Outside click targets child first | Base UI Dialog handles by DOM order |
| Parent visually dimmed | `opacity-50` on inert wrapper (new — phase 5A.3Y) |

---

## 6. Header / Body / Footer Standard

### 6.1 Header

```
Height:      min 64px
Padding:     24px horizontal, 16px vertical
Border:      border-bottom
Background:  dialog background (popover)

Layout:
  [ Icon (optional) ]  [ Title ]  [ DialogClose X ]
                       [ Subtitle (optional, text-muted-foreground) ]
```

```tsx
// Standard header JSX:
<div className="flex items-start gap-3 px-6 py-4 border-b shrink-0">
  {icon && <div className="mt-0.5 text-muted-foreground shrink-0">{icon}</div>}
  <div className="flex-1 min-w-0">
    <DialogTitle className="text-base font-semibold leading-none">{title}</DialogTitle>
    {subtitle && (
      <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
    )}
  </div>
  <DialogClose asChild>
    <Button variant="ghost" size="icon-sm" className="shrink-0 -mr-1 -mt-1">
      <XIcon className="h-4 w-4" />
    </Button>
  </DialogClose>
</div>
```

### 6.2 Body (scrollable)

```
Padding:        24px
Section gap:    24px between major sections
Field gap:      16px (gap-4)
Max-height:     flex-1 with overflow-y-auto — grows to dialog max-height
```

```tsx
// Standard body JSX:
<div className="flex-1 overflow-y-auto p-6 min-h-0">
  {children}
</div>
```

### 6.3 Footer (sticky)

```
Height:     min 64px (auto based on content)
Padding:    16px horizontal, 12px vertical  
Border:     border-top
Background: bg-muted/30

Button placement:
  Cancel → left (outline)
  Save/Add/Update → right (default/primary)
```

```tsx
// Standard footer JSX:
<div className="flex items-center justify-between px-6 py-3 border-t bg-muted/30 shrink-0">
  <Button
    type="button"
    variant="outline"
    onClick={onCancel}
    disabled={isSubmitting}
  >
    {cancelLabel ?? "Cancel"}
  </Button>
  <Button
    type="button"
    onClick={onSubmit}
    disabled={isSubmitting}
  >
    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
    {submitLabel ?? (mode === "edit" ? "Save" : "Add")}
  </Button>
</div>
```

### 6.4 Full DialogContent Layout Pattern

```tsx
// ERPChildDialogForm renders DialogContent as a flex column:
<DialogContent
  className={cn(
    "flex flex-col p-0 gap-0 overflow-hidden",
    sizeClasses[size],          // max-w-[960px] max-h-[calc(100vh-96px)]
    "ring-1 ring-foreground/10"
  )}
  showCloseButton={false}       // custom close in header
>
  {/* Header */}
  <Header ... />
  {/* Body */}
  <div className="flex-1 overflow-y-auto p-6 min-h-0">
    {children}
  </div>
  {/* Footer */}
  <Footer ... />
</DialogContent>
```

This pattern ensures the footer is **always sticky** because:
- `DialogContent` is `flex flex-col` with a fixed height cap
- Body is `flex-1 overflow-y-auto` — grows and scrolls independently
- Footer is `shrink-0` — never compresses

---

## 7. Field / Grid Standard

### 7.1 Grid Pattern

All child form bodies must use 12-column grid:

```tsx
<div className="grid grid-cols-12 gap-4">
  {/* 2-column pair */}
  <div className="col-span-6">...</div>
  <div className="col-span-6">...</div>
  
  {/* Full width */}
  <div className="col-span-12">...</div>
  
  {/* 3-column compact */}
  <div className="col-span-4">...</div>
  <div className="col-span-4">...</div>
  <div className="col-span-4">...</div>
</div>
```

### 7.2 Field Standard

| Property | Value |
|----------|-------|
| Label position | Always above field (not inline) |
| Required indicator | `<RequiredLabel required>Field Name</RequiredLabel>` — red asterisk |
| Input height | 40px (`h-10`) |
| Error message | Below field, `text-sm text-destructive` |
| Textarea | Min 3 rows, max-height with resize-y |
| Checkbox groups | `flex items-center gap-2` per item; group in `col-span-12` with grid layout |

### 7.3 Section Headers

When a child form has multiple logical sections:

```tsx
<h3 className="col-span-12 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
  Section Name
</h3>
```

### 7.4 Combobox Rule

*(Covered by erp-combobox-standard.mdc rule)*

All comboboxes in child dialogs must:
- Use `ERPCombobox` or a wrapper — never bare `<Select>` with async options
- Display human-readable `label` in the trigger
- Store the ID `value` internally
- Support `loading` and empty states

---

## 8. Responsive Standard

| Viewport | Behavior |
|----------|----------|
| ≥ 1280px (xl) | 960px fixed width |
| 1024–1279px (lg) | `max-w-[calc(100vw-48px)]` |
| 768–1023px (md) | `max-w-[calc(100vw-32px)]` |
| < 768px (sm) | `w-[calc(100vw-24px)]`, min-width unset |
| Height | Always `max-h-[calc(100vh-96px)]` |
| Body | Scrolls internally |
| Header/Footer | Fixed, never scroll |

---

## 9. Accessibility Standard

| Requirement | Implementation |
|-------------|----------------|
| Focus trap | Base UI Dialog handles — focus stays inside dialog |
| Escape closes dialog | Base UI Dialog handles |
| Aria label | `DialogTitle` required (visible or sr-only) |
| Aria description | `DialogDescription` recommended for context |
| Form submission | `onSubmit` on primary button (not `type="submit"` unless wrapped in `<form>`) |
| Loading state | Button disabled + spinner while `isSubmitting` |
| Error announcement | Errors use `role="alert"` or toast.error |
| Close button | Always present in header — sr-only "Close" label |

---

## 10. Proposed `ERPChildDialogForm` Component

**File:** `src/components/erp/erp-child-dialog-form.tsx`

```tsx
"use client";
import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Loader2, X as XIcon } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";

const SIZE_CLASSES = {
  sm: "max-w-[480px]",
  md: "max-w-[640px]",
  lg: "max-w-[960px]",    // default
  xl: "max-w-[1120px]",
} as const;

export type ERPChildDialogFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  mode?: "add" | "edit" | "view";
  size?: keyof typeof SIZE_CLASSES;
  isSubmitting?: boolean;
  onCancel?: () => void;
  onSubmit?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  children: ReactNode;
};

export function ERPChildDialogForm({
  open,
  onOpenChange,
  title,
  subtitle,
  icon,
  mode = "add",
  size = "lg",
  isSubmitting = false,
  onCancel,
  onSubmit,
  submitLabel,
  cancelLabel = "Cancel",
  children,
}: ERPChildDialogFormProps) {
  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  const defaultSubmitLabel = mode === "edit" ? "Save" : "Add";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        {/* Override default faint overlay with visible shading */}
        <DialogOverlay className="bg-slate-950/40 backdrop-blur-[2px]" />
        <DialogContent
          showCloseButton={false}
          className={cn(
            "flex flex-col p-0 gap-0 overflow-hidden",
            "w-[calc(100vw-24px)] sm:w-auto",
            SIZE_CLASSES[size],
            "max-h-[calc(100vh-96px)]",
          )}
        >
          {/* ── Header ─────────────────────────────────── */}
          <div className="flex items-start gap-3 px-6 py-4 border-b shrink-0">
            {icon && (
              <div className="mt-0.5 text-muted-foreground shrink-0">{icon}</div>
            )}
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base font-semibold leading-none">
                {title}
              </DialogTitle>
              {subtitle && (
                <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
              )}
            </div>
            <DialogClose asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0 -mr-1 -mt-1"
                disabled={isSubmitting}
              >
                <XIcon className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </Button>
            </DialogClose>
          </div>

          {/* ── Body (scrollable) ──────────────────────── */}
          <div className="flex-1 overflow-y-auto p-6 min-h-0">
            {children}
          </div>

          {/* ── Footer (sticky) ────────────────────────── */}
          <div className="flex items-center justify-between px-6 py-3 border-t bg-muted/30 shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={isSubmitting}
            >
              {cancelLabel}
            </Button>
            {mode !== "view" && onSubmit && (
              <Button
                type="button"
                onClick={onSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {submitLabel ?? defaultSubmitLabel}
              </Button>
            )}
            {mode === "view" && (
              <Button type="button" variant="outline" onClick={handleCancel}>
                Close
              </Button>
            )}
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
```

---

## 11. Parent Drawer Visual Dimming (Inert Wrapper Update)

Currently the inert wrapper uses `className="contents"` which prevents opacity from working.
Phase 5A.3Y must update the wrapper in `party-form-drawer.tsx`:

**Before (002F.5A.3X):**
```tsx
<div inert={childDialogOpen || undefined} className="contents">
```

**After (002F.5A.3Y):**
```tsx
<div
  inert={childDialogOpen || undefined}
  className={cn(
    "flex flex-col flex-1 overflow-hidden min-h-0",
    "transition-opacity duration-200",
    childDialogOpen && "opacity-50"
  )}
>
```

> **Note**: The wrapper class must maintain the drawer's flex layout. `flex flex-col flex-1 overflow-hidden min-h-0` mirrors what the DrawerForm's SheetContent already provides, so this is a direct replacement with no layout side effects. `opacity: 0.5` visually dims the drawer but does not create a new z-index conflict since the Dialog (portal to body) is outside this DOM subtree.

---

## 12. Implementation Phase Recommendation

### Phase 002F.5A.3Y — Apply Standard Child Dialog Design to Party Master

**Scope:**

```
1. Create src/components/erp/erp-child-dialog-form.tsx
2. Update party-form-drawer.tsx: replace className="contents" wrapper with
   flex layout + opacity-50 when childDialogOpen.
3. Refactor all 8 Party Master child tabs to use ERPChildDialogForm:
   - party-licenses-tab.tsx
   - party-tax-finance-tab.tsx
   - party-contacts-tab.tsx
   - party-addresses-tab.tsx
   - party-bank-details-tab.tsx
   - party-documents-tab.tsx
   - party-services-tab.tsx
   - party-notes-tab.tsx
4. Standardize all grids to 12-col with correct spans.
5. Remove manual overflow-y-auto from DialogContent (body now scrolls internally).
6. Add icons and subtitles to all child form headers.
7. Run TypeScript + build + runtime QA on all 8 child forms.
8. Generate implementation report.
9. Update ALGT_ERP_SOURCE_OF_TRUTH.md.
```

**Estimated effort:** 1 phase, 1 session

**After 5A.3Y approval**, a future phase can roll out to all modules:

### Phase ERP GLOBAL UI.2 — Apply Child Dialog Standard System-Wide

Apply `ERPChildDialogForm` to:
- Customer module child forms (legacy → migrate)
- All future modules that implement child dialogs
- Establish unit test / Storybook story for ERPChildDialogForm

---

## 13. Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|-----------|
| `className="contents"` → real wrapper breaks drawer layout | Medium | Match flex classes carefully (`flex flex-col flex-1 overflow-hidden min-h-0`) |
| `opacity` on wrapper creates stacking context | Low | Dialog renders outside wrapper via portal — no conflict |
| `ERPChildDialogForm` size (960px) too wide on medium screens | Low | Responsive max-w overrides |
| z-index changes to sheet.tsx affect other modules | High | Defer z-index token changes to ERP GLOBAL UI.2 |
| `DialogOverlay` override doesn't apply | Low | Use explicit `className` prop on `DialogOverlay` |

---

## 14. Acceptance Checklist (Planning Phase)

- [x] Current Party Master child dialog issue documented
- [x] Base UI Sheet/Dialog layering inspected
- [x] Standard child dialog design proposed (`ERPChildDialogForm`)
- [x] Overlay/background shading explicitly specified
- [x] Parent inert/blocking behavior explicitly specified
- [x] Z-index/layer standard defined
- [x] Header/body/footer anatomy defined (sticky footer pattern)
- [x] Dialog sizes and responsive behavior defined (sm/md/lg/xl)
- [x] Field and grid standards defined (12-col, 40px inputs)
- [x] Combobox label rule included (references erp-combobox-standard.mdc)
- [x] Cursor rule file generated (`.cursor/rules/erp-child-dialog-form-standard.mdc`)
- [x] Implementation plan report generated (this file)
- [x] No system-wide refactor applied
- [x] No database changes
- [x] No legacy Customer module changes
