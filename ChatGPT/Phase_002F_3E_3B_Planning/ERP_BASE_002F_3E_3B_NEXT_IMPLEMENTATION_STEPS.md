# ERP_BASE_002F_3E_3B_NEXT_IMPLEMENTATION_STEPS

**Phase**: ERP BASE 002F.3E.3B — Customer UX/Performance Enhancement Implementation Steps  
**Date**: June 8, 2026  
**Version**: REV1  
**Status**: Enhanced with Sameer/Dina review comments  
**Purpose**: Provide step-by-step implementation roadmap after planning approval  
**Dependencies**: Planning documents must be reviewed and approved first

---

## DOCUMENT PURPOSE

This document provides a **clear, sequential roadmap** for implementing all Customer module UX enhancements and performance optimizations identified in the planning phase.

**Prerequisites**:
1. `ERP_BASE_002F_3E_3B_CUSTOMER_CLOSURE_UX_PERFORMANCE_PLAN.md` (REV1) reviewed and approved
2. `ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md` (REV1) reviewed and approved
3. Any clarification questions answered
4. Technical decisions finalized

---

## OVERVIEW

### Implementation Split (REV1)

The work is divided into **7 sequential sub-phases** (updated from original 6):

| Phase | Name | Effort | Risk | Dependencies |
|-------|------|--------|------|--------------|
| 002F.3E.3B.1 | Update and Store Global UI/UX Development Guide | 2h | Low | None |
| 002F.3E.3B.2 | Implement Global Combobox Foundation in Shared Components | 8h | High | None |
| 002F.3E.3B.3 | Implement Required Field Markers and Form Footer Standard | 4h | Low-Medium | None |
| 002F.3E.3B.4 | Implement Safe Close, Unsaved Changes, and Modal Layout Standard | 6h | Medium | 3B.3 |
| 002F.3E.3B.5 | Apply Standards to Customer Forms and Enhance Documents Placeholder | 4h | Low-Medium | 3B.2, 3B.3, 3B.4 |
| 002F.3E.3B.6 | Optimize Customer Drawer Loading Performance | 5h | Medium | 3B.5 |
| 002F.3E.3B.7 | Final Customer QA and Closure Report | 3h | Low | All above |

**Total Effort**: 32 hours (4 days)

### Future Foundation Phases

| Phase | Name | Timing |
|-------|------|--------|
| 002F.3E.3C | Global Search / Command Palette Foundation | After Vendors, Subcontractors, Consultants modules |
| 002F.Future | AI-Ready ERP Assistant / AI Form Fill Foundation | After DMS and Global Search foundations |

**Note**: Global Search and AI features are NOT implemented in this Customer UX phase. They are prepared through foundational standards and will be implemented later.

---

## DECISIONS FROM SAMEER/DINA REVIEW

The following decisions have been finalized:

### ✅ Decision 1: Combobox Everywhere
**Use Combobox everywhere. ALL selectable fields must use Combobox, regardless of record count.**

### ✅ Decision 2: Modal Sizing
**Standard child form width: 720px**

### ✅ Decision 3: Button Placement
**Cancel (left) | Save (middle) | Save & Close (right)**

### ✅ Decision 4: Performance Target
**800-1000ms initial load is acceptable. Tab switching must be instant (< 100ms).**

### ✅ Decision 5: Save Behavior
**Add mode: Reset form after Save. Edit mode: Refresh form data after Save.**

### ✅ Decision 6: Confirmation Dialog
**Use browser confirm() for initial implementation. Can upgrade to custom Dialog later.**

### ✅ Decision 7: Required Field Border
**Show red border ONLY after validation error (not before interaction).**

---

## STEP 1: APPROVE PLANNING DOCUMENTS

### Action Required

**Sameer must review and approve**:
1. `ERP_BASE_002F_3E_3B_CUSTOMER_CLOSURE_UX_PERFORMANCE_PLAN.md` (REV1)
2. `ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md` (REV1)
3. This implementation steps document (REV1)

### Final Approval Questions

1. **Implementation Order**: Approve the 7-phase sequence?  
   ✅ Yes / 💬 Modify to: ___________

2. **Combobox Migration Risk**: Acknowledge high risk, proceed anyway?  
   ✅ Yes, proceed / ❌ No, reconsider

3. **Future Phases**: Confirm Global Search (002F.3E.3C) and AI (002F.Future) are separate phases?  
   ✅ Yes, separate / 💬 Other: ___________

**Once approved, proceed to Step 2.**

---

## STEP 2: PHASE 002F.3E.3B.1 — UPDATE AND STORE GLOBAL GUIDE

### Goal
Update the global UI/UX development guide to REV1 with all enterprise benchmarking principles and store it as the official standard.

### Prompt File
Create: `PROMPT_ERP_BASE_002F_3E_3B_1_UPDATE_STORE_GLOBAL_GUIDE.md`

### Prompt Content

```markdown
# PROMPT_ERP_BASE_002F_3E_3B_1_UPDATE_STORE_GLOBAL_GUIDE

## Objective
Store the ERP Global UI/UX Development Guide (REV1) in the project as the official standard for all future implementations.

## Pre-Implementation

1. Connect to live Supabase project: `https://mmiefuieduzdiiwnqpie.supabase.co`
2. Verify connection in implementation report

## Instructions

1. Create `docs/standards/` folder if it doesn't exist
2. Copy `ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md` (REV1) to `docs/standards/`
3. Create `docs/standards/README.md` with index of all standard documents
4. Update project root `README.md` to reference the standards folder
5. Commit with message: "docs: Add global UI/UX development guide REV1 as official standard"

## Deliverables

- [ ] `docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md` created
- [ ] `docs/standards/README.md` created
- [ ] Root `README.md` updated
- [ ] Changes committed
- [ ] Implementation report created

## Implementation Report

Create: `ERP_BASE_002F_3E_3B_1_GLOBAL_GUIDE_IMPLEMENTATION_REPORT.md`

Must include:
- Supabase connection confirmation
- Files created
- Commit details
- Status: PASS

**Estimated Time**: 2 hours
```

### Acceptance Criteria

- [ ] Global guide accessible at `docs/standards/`
- [ ] README.md updated
- [ ] Implementation report created
- [ ] Status: PASS

**Proceed to Step 3 after completion.**

---

## STEP 3: PHASE 002F.3E.3B.2 — IMPLEMENT GLOBAL COMBOBOX FOUNDATION

### Goal
Enhance all shared select components to behave as searchable Comboboxes. This is the **highest risk phase** but affects all future modules.

### Prompt File
Create: `PROMPT_ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION.md`

### Prompt Content

```markdown
# PROMPT_ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION

## Objective
Enhance ALL shared select components to behave as searchable Comboboxes, regardless of record count. This is a critical foundation phase affecting all ERP modules.

## Pre-Implementation

1. Connect to live Supabase project: `https://mmiefuieduzdiiwnqpie.supabase.co`
2. Read `ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md` (REV1)
3. Understand Section 11: Global Combobox Standard (Everywhere)

## Components to Enhance

Enhance these shared components to Combobox behavior:

1. `src/components/erp/lookup-select.tsx` → LookupCombobox behavior
2. `src/components/erp/geography/country-select.tsx` → CountryCombobox behavior
3. `src/components/erp/geography/emirate-select.tsx` → EmirateCombobox behavior
4. `src/components/erp/geography/city-select.tsx` → CityCombobox behavior
5. `src/components/erp/geography/area-zone-select.tsx` → AreaZoneCombobox behavior
6. `src/components/erp/finance/bank-select.tsx` → BankCombobox behavior (if exists)
7. `src/components/erp/finance/currency-select.tsx` → CurrencyCombobox behavior (if exists)
8. `src/components/erp/finance/payment-term-select.tsx` → PaymentTermCombobox behavior (if exists)
9. `src/components/erp/finance/tax-type-select.tsx` → TaxTypeCombobox behavior (if exists)

## Required Features for All Comboboxes

Each Combobox MUST support:
- ✅ Search by code
- ✅ Search by English name/label
- ✅ Search by Arabic name/label (where available)
- ✅ Keyboard navigation (up/down arrows, Enter to select, Escape to close)
- ✅ Clear option for optional fields
- ✅ Loading state
- ✅ Empty / "No results found" state
- ✅ Disabled state
- ✅ Read-only state
- ✅ Consistent width and styling
- ✅ RLS-safe data loading
- ✅ Permission-safe data filtering (where applicable)

## Implementation Pattern

Use shadcn/ui Combobox pattern or Command component:

```tsx
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Check, ChevronDown } from "lucide-react";

export function EntityCombobox({ items, value, onValueChange, ... }) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  const filteredItems = items.filter(item => {
    const query = searchQuery.toLowerCase();
    return (
      item.code.toLowerCase().includes(query) ||
      item.name_en.toLowerCase().includes(query) ||
      (item.name_ar && item.name_ar.includes(query))
    );
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open}>
          {value ? items.find(i => i.id === value)?.name_en : "Select..."}
          <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0">
        <Command>
          <CommandInput 
            placeholder="Search..." 
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup>
            {filteredItems.map(item => (
              <CommandItem
                key={item.id}
                value={item.id}
                onSelect={() => {
                  onValueChange(item.id);
                  setOpen(false);
                }}
              >
                <Check className={cn("mr-2 h-4 w-4", value === item.id ? "opacity-100" : "opacity-0")} />
                {showCode && `${item.code} - `}{item.name_en}
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
```

## Testing

For EACH enhanced component, verify:
- [ ] Search by code works
- [ ] Search by English name works
- [ ] Search by Arabic name works (if applicable)
- [ ] Keyboard navigation works
- [ ] Clear option works (optional fields)
- [ ] Loading state displays correctly
- [ ] Empty state displays correctly
- [ ] Disabled state works
- [ ] No console errors
- [ ] No TypeScript errors

## Deliverables

- [ ] All 9+ components enhanced to Combobox behavior
- [ ] All features working
- [ ] TypeScript typecheck passes
- [ ] ESLint passes
- [ ] Next.js build passes
- [ ] Implementation report created

## Implementation Report

Create: `ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_REPORT.md`

Must include:
- Supabase connection confirmation
- List of enhanced components
- Testing results for each component
- Known issues (if any)
- Status: PASS / NEEDS CORRECTION

**Estimated Time**: 8 hours

**CRITICAL**: This phase affects ALL modules. Test thoroughly before proceeding.
```

### Acceptance Criteria

- [ ] All shared select components enhanced to Combobox
- [ ] Search works for code, English name, Arabic name
- [ ] Keyboard navigation works
- [ ] All states (loading, empty, disabled) work
- [ ] TypeScript typecheck passes
- [ ] ESLint passes
- [ ] Next.js build passes
- [ ] Implementation report: PASS

**Proceed to Step 4 after completion and verification.**

---

## STEP 4: PHASE 002F.3E.3B.3 — REQUIRED FIELD MARKERS AND FORM FOOTER STANDARD

### Goal
Implement required field markers (red asterisk) and standardize form footer buttons (Cancel / Save / Save & Close).

### Prompt File
Create: `PROMPT_ERP_BASE_002F_3E_3B_3_REQUIRED_MARKERS_FORM_FOOTER.md`

### Prompt Content

```markdown
# PROMPT_ERP_BASE_002F_3E_3B_3_REQUIRED_MARKERS_FORM_FOOTER

## Objective
Enhance Label component to support required field markers and standardize form footer button layout across all forms.

## Pre-Implementation

1. Connect to live Supabase project: `https://mmiefuieduzdiiwnqpie.supabase.co`
2. Read `ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md` (REV1)
3. Review Section 10 (Required Field Standard) and Section 12 (Form Footer Button Standard)

## Part 1: Enhance Label Component

**File**: `src/components/ui/label.tsx`

Add `required` prop to display red asterisk:

```tsx
import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@/lib/utils";

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & {
    required?: boolean;
  }
>(({ className, required, children, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
      className
    )}
    {...props}
  >
    {children}
    {required && <span className="text-destructive ml-1">*</span>}
  </LabelPrimitive.Root>
));
Label.displayName = "Label";

export { Label };
```

**Testing**:
- [ ] `<Label required>Field Name</Label>` displays "Field Name *" with red asterisk
- [ ] `<Label>Field Name</Label>` displays "Field Name" without asterisk
- [ ] Asterisk color matches `text-destructive` (red)
- [ ] No TypeScript errors

## Part 2: Create Reusable Form Footer Component

**File**: `src/components/erp/erp-form-footer.tsx`

```tsx
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface ERPFormFooterProps {
  mode: "add" | "edit" | "view";
  isSubmitting: boolean;
  onCancel: () => void;
  onSave?: () => void;
  onSaveAndClose?: () => void;
  onClose?: () => void;
}

export function ERPFormFooter({
  mode,
  isSubmitting,
  onCancel,
  onSave,
  onSaveAndClose,
  onClose,
}: ERPFormFooterProps) {
  if (mode === "view") {
    return (
      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button type="button" onClick={onClose} disabled={isSubmitting}>
          Close
        </Button>
      </div>
    );
  }

  return (
    <div className="flex justify-end gap-2 pt-4 border-t">
      <Button
        type="button"
        variant="outline"
        onClick={onCancel}
        disabled={isSubmitting}
      >
        Cancel
      </Button>
      {onSave && (
        <Button
          type="button"
          variant="secondary"
          onClick={onSave}
          disabled={isSubmitting}
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Save
        </Button>
      )}
      {onSaveAndClose && (
        <Button type="button" onClick={onSaveAndClose} disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Save & Close
        </Button>
      )}
    </div>
  );
}
```

**Testing**:
- [ ] Add mode shows: Cancel | Save | Save & Close
- [ ] Edit mode shows: Cancel | Save | Save & Close
- [ ] View mode shows: Close only
- [ ] All buttons disabled during submission
- [ ] Loading indicator appears on active button

## Deliverables

- [ ] Label component enhanced with `required` prop
- [ ] ERPFormFooter component created
- [ ] TypeScript typecheck passes
- [ ] ESLint passes
- [ ] Next.js build passes
- [ ] Implementation report created

## Implementation Report

Create: `ERP_BASE_002F_3E_3B_3_REQUIRED_MARKERS_FORM_FOOTER_REPORT.md`

**Estimated Time**: 4 hours
```

### Acceptance Criteria

- [ ] Label component supports `required` prop
- [ ] ERPFormFooter component created and tested
- [ ] All modes (add, edit, view) render correctly
- [ ] Implementation report: PASS

**Proceed to Step 5 after completion.**

---

## STEP 5: PHASE 002F.3E.3B.4 — SAFE CLOSE, UNSAVED CHANGES, AND MODAL LAYOUT

### Goal
Implement safe close behavior with unsaved changes confirmation and standardize modal sizing to 720px for child forms.

### Prompt File
Create: `PROMPT_ERP_BASE_002F_3E_3B_4_SAFE_CLOSE_MODAL_LAYOUT.md`

### Prompt Content

```markdown
# PROMPT_ERP_BASE_002F_3E_3B_4_SAFE_CLOSE_MODAL_LAYOUT

## Objective
Implement safe close behavior for forms and standardize child form modal width to 720px.

## Pre-Implementation

1. Connect to live Supabase project: `https://mmiefuieduzdiiwnqpie.supabase.co`
2. Read `ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md` (REV1)
3. Review Section 8 (Modal Sizing) and Section 13 (Safe Close)

## Part 1: Update Dialog Base Styling

**File**: `src/components/ui/dialog.tsx`

Update DialogContent default className to support standard sizing:

```tsx
const DialogContent = React.forwardRef<...>(
  ({ className, children, ...props }, ref) => (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed left-[50%] top-[50%] z-50 grid w-full max-w-[720px] translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg max-h-[85vh] overflow-y-auto",
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
);
```

**Key Changes**:
- Default `max-w-[720px]` (was 2xl = 672px)
- `max-h-[85vh]` for proper scrolling
- `overflow-y-auto` for vertical scrolling

## Part 2: Create Dirty State Tracking Hook

**File**: `src/hooks/use-form-dirty.ts`

```typescript
import { useEffect, useState } from "react";

export function useFormDirty<T>(initialData: T, currentData: T): boolean {
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    const dirty = JSON.stringify(initialData) !== JSON.stringify(currentData);
    setIsDirty(dirty);
  }, [initialData, currentData]);

  return isDirty;
}
```

## Part 3: Create Safe Close Dialog Component

**File**: `src/components/erp/confirm-discard-dialog.tsx`

```tsx
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ConfirmDiscardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function ConfirmDiscardDialog({
  open,
  onOpenChange,
  onConfirm,
}: ConfirmDiscardDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved changes. Do you want to discard them?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive">
            Discard Changes
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

## Part 4: Example Usage Pattern

```tsx
// In child form component (e.g., CustomerContactDialog)
const [initialFormData] = useState(defaultValues);
const [formData, setFormData] = useState(defaultValues);
const [showConfirmDiscard, setShowConfirmDiscard] = useState(false);

const isDirty = useFormDirty(initialFormData, formData);

const handleCancel = () => {
  if (isDirty) {
    setShowConfirmDiscard(true);
  } else {
    onOpenChange(false);
  }
};

const handleConfirmDiscard = () => {
  setShowConfirmDiscard(false);
  onOpenChange(false);
};

return (
  <>
    <Dialog 
      open={isOpen} 
      onOpenChange={(open) => {
        if (!open && isDirty && mode !== 'view') {
          setShowConfirmDiscard(true);
        } else {
          onOpenChange(open);
        }
      }}
    >
      <DialogContent className="sm:max-w-[720px]">
        {/* Form content */}
        <ERPFormFooter
          mode={mode}
          isSubmitting={isSubmitting}
          onCancel={handleCancel}
          onSave={handleSave}
          onSaveAndClose={handleSaveAndClose}
        />
      </DialogContent>
    </Dialog>

    <ConfirmDiscardDialog
      open={showConfirmDiscard}
      onOpenChange={setShowConfirmDiscard}
      onConfirm={handleConfirmDiscard}
    />
  </>
);
```

## Testing

- [ ] Modal width is 720px on desktop
- [ ] Modal max-height is 85vh
- [ ] Vertical scrolling works when content exceeds height
- [ ] No horizontal scrolling
- [ ] Cancel with no changes → closes immediately
- [ ] Cancel with unsaved changes → shows confirmation
- [ ] Confirmation Cancel → stays open
- [ ] Confirmation Discard → closes
- [ ] Outside click in Add/Edit mode → does NOT close (or shows confirmation)
- [ ] Outside click in View mode → closes

## Deliverables

- [ ] Dialog styling updated to 720px standard
- [ ] `useFormDirty` hook created
- [ ] `ConfirmDiscardDialog` component created
- [ ] TypeScript typecheck passes
- [ ] ESLint passes
- [ ] Next.js build passes
- [ ] Implementation report created

## Implementation Report

Create: `ERP_BASE_002F_3E_3B_4_SAFE_CLOSE_MODAL_LAYOUT_REPORT.md`

**Estimated Time**: 6 hours
```

### Acceptance Criteria

- [ ] Dialog default width 720px
- [ ] Safe close behavior working
- [ ] Confirmation dialog functional
- [ ] All tests pass
- [ ] Implementation report: PASS

**Proceed to Step 6 after completion.**

---

## STEP 6: PHASE 002F.3E.3B.5 — APPLY STANDARDS TO CUSTOMER FORMS

### Goal
Apply all new standards (comboboxes, required markers, safe close, modal sizing, buttons, documents placeholder) to Customer module forms.

### Prompt File
Create: `PROMPT_ERP_BASE_002F_3E_3B_5_APPLY_TO_CUSTOMER_FORMS.md`

### Prompt Content

```markdown
# PROMPT_ERP_BASE_002F_3E_3B_5_APPLY_TO_CUSTOMER_FORMS

## Objective
Apply all implemented standards to Customer module forms: main drawer, contacts, addresses, and bank details.

## Pre-Implementation

1. Connect to live Supabase project: `https://mmiefuieduzdiiwnqpie.supabase.co`
2. Verify all previous phases (3B.1-3B.4) are complete
3. Read `ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md` (REV1)

## Files to Update

1. `src/features/master-data/customers/components/customer-form-drawer.tsx`
2. `src/features/master-data/customers/components/customer-contacts-section.tsx`
3. `src/features/master-data/customers/components/customer-addresses-section.tsx`
4. `src/features/master-data/customers/components/customer-bank-details-section.tsx`

## Part 1: Update Main Customer Drawer

**File**: `customer-form-drawer.tsx`

**Changes**:
1. Update all Label components with `required` prop where applicable
2. Replace all Select components with Combobox equivalents (LookupCombobox, CountryCombobox, etc.)
3. Update documents section with enhanced placeholder (Section 16 from guide)
4. Verify ERPDrawerFooter used correctly

**Example**:
```tsx
// Before
<Label htmlFor="customer_name_en">Customer Name (English)</Label>
<Select ...>

// After
<Label htmlFor="customer_name_en" required>Customer Name (English)</Label>
<LookupCombobox categoryCode="CUSTOMER_TYPE" ... />
```

## Part 2: Update Contact Dialog

**File**: `customer-contacts-section.tsx`

**Changes**:
1. Update DialogContent to `className="sm:max-w-[720px]"`
2. Add `useFormDirty` hook for dirty state tracking
3. Add `ConfirmDiscardDialog` component
4. Update to use ERPFormFooter with Save / Save & Close / Cancel buttons
5. Implement Save (keep open) logic
6. Implement Save & Close logic
7. Add required markers to required fields
8. Replace selects with comboboxes

**Save Logic Pattern**:
```tsx
const handleSave = async (closeAfter: boolean = false) => {
  setIsSubmitting(true);
  
  try {
    const result = await saveContact(formData);
    
    if (result.success) {
      toast.success("Contact saved successfully");
      
      if (closeAfter) {
        onOpenChange(false);
      } else {
        if (mode === 'add') {
          resetFormToInitial();
        } else {
          await refreshFormData();
        }
      }
      
      onRefresh();
    } else {
      toast.error(result.error ?? "Failed to save contact");
    }
  } finally {
    setIsSubmitting(false);
  }
};
```

## Part 3: Update Address Dialog

**File**: `customer-addresses-section.tsx`

Apply same changes as contact dialog:
- 720px width
- Required markers
- Comboboxes (CountryCombobox, EmirateCombobox, CityCombobox, AreaZoneCombobox)
- ERPFormFooter
- Safe close behavior
- Save / Save & Close logic

## Part 4: Update Bank Detail Dialog

**File**: `customer-bank-details-section.tsx`

Apply same changes as contact dialog:
- 720px width
- Required markers
- Comboboxes (BankCombobox, CurrencyCombobox)
- ERPFormFooter
- Safe close behavior
- Save / Save & Close logic

## Testing

### Visual Testing
- [ ] All required fields have red asterisk (*)
- [ ] All modals are 720px wide on desktop
- [ ] No horizontal scrolling in any modal
- [ ] All selects are comboboxes with search
- [ ] Documents placeholder displays correctly
- [ ] Footer buttons: Cancel | Save | Save & Close

### Functional Testing
- [ ] Add Contact → Save → Contact saved, form stays open, can add another
- [ ] Add Contact → Save & Close → Contact saved, dialog closes
- [ ] Edit Contact → Save → Contact updated, form stays open with refreshed data
- [ ] Edit Contact → Save & Close → Contact updated, dialog closes
- [ ] Cancel with no changes → closes immediately
- [ ] Cancel with changes → shows confirmation
- [ ] Outside click with changes → shows confirmation (or blocked)
- [ ] Combobox search works for all fields
- [ ] Same tests for Addresses and Bank Details

### Build Testing
- [ ] TypeScript typecheck passes
- [ ] ESLint passes
- [ ] Next.js build passes
- [ ] No console errors or warnings

## Deliverables

- [ ] All 4 customer form files updated
- [ ] All standards applied
- [ ] All tests pass
- [ ] Implementation report created

## Implementation Report

Create: `ERP_BASE_002F_3E_3B_5_APPLY_TO_CUSTOMER_FORMS_REPORT.md`

**Estimated Time**: 4 hours
```

### Acceptance Criteria

- [ ] All customer forms updated with standards
- [ ] Visual and functional tests pass
- [ ] No regressions in existing functionality
- [ ] Implementation report: PASS

**Proceed to Step 7 after completion.**

---

## STEP 7: PHASE 002F.3E.3B.6 — OPTIMIZE CUSTOMER DRAWER LOADING PERFORMANCE

### Goal
Implement parallel data loading to eliminate tab switching delays and achieve instant navigation after initial load.

### Prompt File
Create: `PROMPT_ERP_BASE_002F_3E_3B_6_OPTIMIZE_DRAWER_PERFORMANCE.md`

### Prompt Content

```markdown
# PROMPT_ERP_BASE_002F_3E_3B_6_OPTIMIZE_DRAWER_PERFORMANCE

## Objective
Refactor customer drawer to load all data in parallel on open, eliminating sequential loading delays and enabling instant tab switching.

## Pre-Implementation

1. Connect to live Supabase project: `https://mmiefuieduzdiiwnqpie.supabase.co`
2. Verify database indexes exist (confirmed in planning: all indexes present)
3. Read `ERP_BASE_002F_3E_3B_CUSTOMER_CLOSURE_UX_PERFORMANCE_PLAN.md` (REV1) Section 3.7

## Current Performance Problem

**Sequential Loading**:
- User opens drawer → Load customer (1000ms)
- User clicks Contacts tab → Load contacts (779ms)
- User clicks Addresses tab → Load addresses (800ms)
- User clicks Bank Details tab → Load bank details (897ms)
- **Total: 3476ms of UI delays**

**Root Cause**: Each child component fetches data independently on tab click (sequential).

## Proposed Solution

**Parallel Pre-loading**:
- User opens drawer → Load ALL data in parallel using Promise.all (800-1000ms)
- User clicks Contacts tab → Data already in state → Instant (0ms)
- User clicks Addresses tab → Data already in state → Instant (0ms)
- User clicks Bank Details tab → Data already in state → Instant (0ms)
- **Total: 800-1000ms initial load, then instant tab switching (75%+ improvement)**

## Implementation

### Part 1: Update Main Drawer Component

**File**: `customer-form-drawer.tsx`

**Add State for Child Data**:
```typescript
const [contacts, setContacts] = useState<CustomerContact[]>([]);
const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
const [bankDetails, setBankDetails] = useState<CustomerBankDetail[]>([]);
const [childDataLoading, setChildDataLoading] = useState(false);
```

**Add Parallel Loading Function**:
```typescript
const loadAllCustomerData = async (customerId: number) => {
  setChildDataLoading(true);
  try {
    const [contactsResult, addressesResult, bankDetailsResult] = 
      await Promise.all([
        getCustomerContacts(customerId),
        getCustomerAddresses(customerId),
        getCustomerBankDetails(customerId)
      ]);
    
    if (contactsResult.success) setContacts(contactsResult.data || []);
    if (addressesResult.success) setAddresses(addressesResult.data || []);
    if (bankDetailsResult.success) setBankDetails(bankDetailsResult.data || []);
  } catch (error) {
    toast.error("Failed to load customer data");
  } finally {
    setChildDataLoading(false);
  }
};
```

**Call on Mount (Edit/View Modes Only)**:
```typescript
useEffect(() => {
  if (customer?.id && mode !== 'add') {
    loadAllCustomerData(customer.id);
  }
}, [customer?.id, mode]);
```

**Pass Data to Child Components**:
```tsx
<CustomerContactsSection 
  customerId={customer.id} 
  contacts={contacts}
  onRefresh={() => loadAllCustomerData(customer.id)}
  disabled={isViewing}
/>

<CustomerAddressesSection 
  customerId={customer.id} 
  addresses={addresses}
  onRefresh={() => loadAllCustomerData(customer.id)}
  disabled={isViewing}
/>

<CustomerBankDetailsSection 
  customerId={customer.id} 
  bankDetails={bankDetails}
  onRefresh={() => loadAllCustomerData(customer.id)}
  disabled={isViewing}
/>
```

### Part 2: Update Child Components

**Files**: 
- `customer-contacts-section.tsx`
- `customer-addresses-section.tsx`
- `customer-bank-details-section.tsx`

**Update Component Signature**:
```typescript
export function CustomerContactsSection({ 
  customerId, 
  contacts,         // NEW: Receive data as prop
  onRefresh,        // NEW: Callback to refresh parent data
  disabled 
}: {
  customerId: number;
  contacts: CustomerContact[];          // NEW
  onRefresh: () => void;                // NEW
  disabled?: boolean;
}) {
  // REMOVE: const [contacts, setContacts] = useState([]);
  // REMOVE: const [loading, setLoading] = useState(true);
  // REMOVE: useEffect to fetch contacts
  // REMOVE: loadContacts() function
  
  // Use passed contacts prop directly
  
  // Call onRefresh after create/update/delete
  const handleSave = async (closeAfter: boolean) => {
    // ... save logic
    if (result.success) {
      toast.success("Contact saved");
      onRefresh();  // Refresh parent data
      if (closeAfter) setIsDialogOpen(false);
    }
  };
}
```

**Apply same pattern to all three child components.**

## Performance Measurement

Before and after implementation, measure:

**Before (Sequential)**:
- Open drawer: [measure]ms
- Click Contacts tab: [measure]ms
- Click Addresses tab: [measure]ms
- Click Bank Details tab: [measure]ms
- Total: [sum]ms

**After (Parallel)**:
- Open drawer: [measure]ms (all data loaded)
- Click Contacts tab: [measure]ms (should be < 100ms, ideally instant)
- Click Addresses tab: [measure]ms (should be < 100ms, ideally instant)
- Click Bank Details tab: [measure]ms (should be < 100ms, ideally instant)
- Total: [sum]ms

**Target**:
- Initial load: < 1000ms
- Tab switching: < 100ms (ideally 0ms)
- Total improvement: > 70%

## Testing

- [ ] Open customer drawer → Measure time → Should be < 1000ms
- [ ] Click Contacts tab → Measure time → Should be < 100ms
- [ ] Click Addresses tab → Measure time → Should be < 100ms
- [ ] Click Bank Details tab → Measure time → Should be < 100ms
- [ ] Add contact → Save → Contacts list refreshes
- [ ] Delete contact → Contacts list refreshes
- [ ] Add address → Save → Addresses list refreshes
- [ ] Add bank detail → Save → Bank details list refreshes
- [ ] No regressions in existing functionality

## Deliverables

- [ ] Main drawer component refactored with parallel loading
- [ ] All three child components refactored to accept data as props
- [ ] Performance measurements documented
- [ ] Target performance achieved (> 70% improvement)
- [ ] All tests pass
- [ ] Implementation report created

## Implementation Report

Create: `ERP_BASE_002F_3E_3B_6_OPTIMIZE_DRAWER_PERFORMANCE_REPORT.md`

Must include:
- Before/after performance measurements
- Percentage improvement
- Testing results
- Status: PASS

**Estimated Time**: 5 hours
```

### Acceptance Criteria

- [ ] Parallel loading implemented
- [ ] Tab switching instant (< 100ms)
- [ ] Performance improvement > 70%
- [ ] No regressions
- [ ] Implementation report: PASS

**Proceed to Step 8 after completion.**

---

## STEP 8: PHASE 002F.3E.3B.7 — FINAL CUSTOMER QA AND CLOSURE REPORT

### Goal
Comprehensive QA testing of entire Customer module and creation of final closure report.

### Prompt File
Create: `PROMPT_ERP_BASE_002F_3E_3B_7_FINAL_CUSTOMER_QA_CLOSURE.md`

### Prompt Content

```markdown
# PROMPT_ERP_BASE_002F_3E_3B_7_FINAL_CUSTOMER_QA_CLOSURE

## Objective
Perform comprehensive QA testing of the Customer module after all UX/performance enhancements and create final closure report.

## Pre-Implementation

1. Connect to live Supabase project: `https://mmiefuieduzdiiwnqpie.supabase.co`
2. Verify all phases (3B.1-3B.6) are complete
3. Review all previous implementation reports

## QA Testing Checklist

### 1. Visual/UI Testing

**Required Field Markers**:
- [ ] Customer main form: All required fields have red asterisk (*)
- [ ] Contact form: All required fields have red asterisk (*)
- [ ] Address form: All required fields have red asterisk (*)
- [ ] Bank detail form: All required fields have red asterisk (*)
- [ ] Optional fields do NOT have asterisk

**Modal Sizing**:
- [ ] Contact dialog width: 720px on desktop
- [ ] Address dialog width: 720px on desktop
- [ ] Bank detail dialog width: 720px on desktop
- [ ] No horizontal scrolling in any dialog
- [ ] Vertical scrolling works when content exceeds max-height (85vh)
- [ ] Responsive on tablet (90vw)
- [ ] Responsive on mobile (95vw, single-column layout)

**Button Layout**:
- [ ] Add/Edit mode: Cancel (left) | Save (middle) | Save & Close (right)
- [ ] View mode: Close button only
- [ ] Buttons disabled during submission
- [ ] Loading indicator on active button

**Comboboxes**:
- [ ] ALL select fields are comboboxes (no traditional dropdowns)
- [ ] Search input visible in all comboboxes
- [ ] Search filters by code
- [ ] Search filters by English name
- [ ] Search filters by Arabic name (where applicable)
- [ ] Empty state shows "No results found"
- [ ] Clear search works
- [ ] Keyboard navigation works (up/down arrows, Enter, Escape)

**Documents Placeholder**:
- [ ] Documents tab displays enhanced placeholder
- [ ] Icon, heading, description present
- [ ] Disabled buttons present
- [ ] "Available after DMS implementation" message visible

### 2. Functional Testing

**Customer CRUD**:
- [ ] Add customer works
- [ ] Customer code auto-generated
- [ ] Edit customer works
- [ ] View customer works (read-only)
- [ ] Delete customer works (if permission)

**Contact Management**:
- [ ] Add Contact → Save → Contact saved, form stays open, can add another
- [ ] Add Contact → Save & Close → Contact saved, dialog closes
- [ ] Edit Contact → Save → Contact updated, form stays open, data refreshed
- [ ] Edit Contact → Save & Close → Contact updated, dialog closes
- [ ] Delete Contact works
- [ ] Contact code auto-generated

**Address Management**:
- [ ] Add Address → Save → Address saved, form stays open
- [ ] Add Address → Save & Close → Address saved, dialog closes
- [ ] Edit Address → Save → Address updated, form stays open
- [ ] Edit Address → Save & Close → Address updated, dialog closes
- [ ] Delete Address works

**Bank Detail Management**:
- [ ] Add Bank Detail → Save → Bank detail saved, form stays open
- [ ] Add Bank Detail → Save & Close → Bank detail saved, dialog closes
- [ ] Edit Bank Detail → Save → Bank detail updated, form stays open
- [ ] Edit Bank Detail → Save & Close → Bank detail updated, dialog closes
- [ ] Delete Bank Detail works

**Safe Close Behavior**:
- [ ] Cancel with no changes → closes immediately
- [ ] Cancel with unsaved changes → shows confirmation
- [ ] Confirmation "Cancel" → stays open
- [ ] Confirmation "Discard Changes" → closes
- [ ] Outside click in Add/Edit mode with changes → shows confirmation (or blocked)
- [ ] Outside click in View mode → closes
- [ ] Press Escape in Add/Edit mode with changes → shows confirmation
- [ ] Press Escape in View mode → closes
- [ ] Click X button with changes → shows confirmation

**Performance**:
- [ ] Open customer drawer → Measure time → < 1000ms
- [ ] Click Contacts tab → Instant (< 100ms)
- [ ] Click Addresses tab → Instant (< 100ms)
- [ ] Click Bank Details tab → Instant (< 100ms)
- [ ] Add contact → Save → Contacts list refreshes correctly
- [ ] Delete contact → Contacts list refreshes correctly
- [ ] Performance improvement > 70% from baseline

### 3. Build and Code Quality

- [ ] `npm run typecheck` passes with no errors
- [ ] `npm run lint` passes with no errors
- [ ] `npm run build` passes successfully
- [ ] No console errors in browser
- [ ] No hydration warnings
- [ ] No TypeScript errors
- [ ] No ESLint warnings

### 4. Cross-Browser Testing (if applicable)

- [ ] Chrome: All features work
- [ ] Firefox: All features work
- [ ] Safari: All features work
- [ ] Edge: All features work

### 5. Regression Testing

- [ ] Customer code generation still works
- [ ] Contact code generation still works
- [ ] Primary flag management still works
- [ ] Audit logging still works
- [ ] RLS/permissions still work
- [ ] No previously working features broken

## Final Closure Report

Create: `ERP_BASE_002F_3E_3B_CUSTOMER_CLOSURE_FINAL_REPORT.md`

### Report Structure

```markdown
# ERP_BASE_002F_3E_3B_CUSTOMER_CLOSURE_FINAL_REPORT

**Phase**: ERP BASE 002F.3E.3B — Customer Module Closure  
**Date**: [Date]  
**Status**: [PASS / NEEDS CORRECTION / BLOCKED]

---

## 1. EXECUTIVE SUMMARY

Customer module UX/performance enhancements completed successfully.

**Achievements**:
- ✅ Global UI/UX guide stored as official standard (REV1)
- ✅ All shared components enhanced to Combobox behavior
- ✅ Required field markers implemented
- ✅ Form footer buttons standardized (Save / Save & Close / Cancel)
- ✅ Safe close behavior implemented
- ✅ Modal sizing standardized to 720px
- ✅ Documents placeholder enhanced
- ✅ Performance optimized (parallel loading)
- ✅ [X]% performance improvement achieved

---

## 2. SUPABASE CONNECTION CONFIRMATION

**Connected to live Supabase project**: `https://mmiefuieduzdiiwnqpie.supabase.co`

---

## 3. IMPLEMENTATION SUMMARY

### Phase 002F.3E.3B.1 — Global Guide
- Status: PASS
- Files: docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md (REV1)

### Phase 002F.3E.3B.2 — Combobox Foundation
- Status: PASS
- Components enhanced: [list]

### Phase 002F.3E.3B.3 — Required Markers and Form Footer
- Status: PASS
- Components: Label (enhanced), ERPFormFooter (created)

### Phase 002F.3E.3B.4 — Safe Close and Modal Layout
- Status: PASS
- Components: Dialog (updated), useFormDirty (created), ConfirmDiscardDialog (created)

### Phase 002F.3E.3B.5 — Apply to Customer Forms
- Status: PASS
- Files updated: [list]

### Phase 002F.3E.3B.6 — Performance Optimization
- Status: PASS
- Performance improvement: [X]%

### Phase 002F.3E.3B.7 — Final QA
- Status: PASS
- All tests passed

---

## 4. PERFORMANCE MEASUREMENTS

**Before (Sequential Loading)**:
- Open drawer: [X]ms
- Click Contacts tab: [X]ms
- Click Addresses tab: [X]ms
- Click Bank Details tab: [X]ms
- Total: [X]ms

**After (Parallel Loading)**:
- Open drawer: [X]ms (all data loaded)
- Click Contacts tab: [X]ms
- Click Addresses tab: [X]ms
- Click Bank Details tab: [X]ms
- Total: [X]ms

**Improvement**: [X]% reduction in total wait time

---

## 5. FILES CREATED/MODIFIED

**Created**:
- docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md (REV1)
- src/components/erp/erp-form-footer.tsx
- src/components/erp/confirm-discard-dialog.tsx
- src/hooks/use-form-dirty.ts

**Modified**:
- src/components/ui/label.tsx
- src/components/ui/dialog.tsx
- src/components/erp/lookup-select.tsx (→ Combobox behavior)
- [list all other modified components]
- src/features/master-data/customers/components/customer-form-drawer.tsx
- src/features/master-data/customers/components/customer-contacts-section.tsx
- src/features/master-data/customers/components/customer-addresses-section.tsx
- src/features/master-data/customers/components/customer-bank-details-section.tsx

---

## 6. QA TEST RESULTS

**Summary**: [X/Y] tests passed

[Detail test results from checklist above]

---

## 7. KNOWN ISSUES/LIMITATIONS

[List any known issues or limitations, or state "None"]

---

## 8. NEXT STEPS

### Immediate
- [ ] Deploy to staging (if applicable)
- [ ] UAT testing
- [ ] Production deployment

### Future Modules
Apply same UX standards to:
- Vendors (Phase 002F.3E.3D or similar)
- Subcontractors
- Consultants
- Government Authorities
- Recruitment Agencies

### Future Foundation Phases
- **Phase 002F.3E.3C**: Global Search / Command Palette Foundation
- **Phase 002F.Future**: AI-Ready ERP Assistant / AI Form Fill Foundation (after DMS)

---

## 9. STATUS

✅ **CUSTOMER MODULE CLOSED** — All UX/performance enhancements complete. Ready for production and reuse in other party modules.

**Date**: [Date]  
**Approved By**: _________________

---

**END OF REPORT**
```

## Deliverables

- [ ] All QA tests completed
- [ ] Final closure report created
- [ ] Status: PASS

**Estimated Time**: 3 hours
```

### Acceptance Criteria

- [ ] All QA tests pass
- [ ] Performance target achieved
- [ ] Final closure report created
- [ ] Customer module officially closed

**Phase 002F.3E.3B Complete!**

---

## FUTURE FOUNDATION PHASES

### Phase 002F.3E.3C — Global Search / Command Palette Foundation

**Timing**: After Vendors, Subcontractors, Consultants modules are complete

**Purpose**: Implement global search across all entities

**Features**:
- Ctrl+K / Cmd+K global shortcut
- Search by code, name, email, mobile, TRN, etc.
- Result grouping by entity type
- RLS and permission-aware
- **Global search must open results directly**:
  - Parent results open parent drawer in View mode
  - Child results open parent drawer and activate related tab
  - Document results (later) open parent drawer and activate Documents tab
  - All results respect RLS and permissions

**Technical Requirements**:
- The Global Search / Command Palette phase must include deep-linking or route-state support for opening module drawers from search results
- Search results metadata must include entity type, entity ID, parent info (if child), module route, target tab ID, and permission requirements
- Results must be actionable (not display-only) - clicking a result opens the record directly

**Dependencies**: Multiple master data modules complete

---

### Phase 002F.Future — AI-Ready ERP Assistant / AI Form Fill Foundation

**Timing**: After DMS implementation and Global Search foundation

**Purpose**: Add AI features for form filling, document extraction, insights

**Features**:
- AI form fill from uploaded documents
- AI document extraction (trade license, VAT certificate, etc.)
- AI customer/vendor summaries
- AI DMS search
- AI compliance expiry insights
- AI data quality warnings

**Dependencies**: DMS, Global Search, stable master data modules

**Note**: This phase prepares the foundation but does not implement AI immediately. AI features will be added incrementally based on business priorities.

---

## DOCUMENT REVISION HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-06-08 | AI Agent | Initial implementation roadmap |
| REV1 | 2026-06-08 | AI Agent | Enhanced with Sameer/Dina review: Updated to 7 phases, Combobox everywhere, 720px modals, removed open questions, added future foundation phases |
| REV1 Final | 2026-06-08 | AI Agent | Added global search action behavior clarification - search results must be actionable and open records directly |

---

## STATUS

✅ **READY FOR SAMEER REVIEW** — Next implementation steps REV1 prepared with final global search action standard.

**Date**: June 8, 2026  
**Version**: REV1  
**Next Step**: Approve planning documents and implementation sequence, then proceed with Phase 002F.3E.3B.1

---

**END OF DOCUMENT**
