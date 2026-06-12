# ERP GLOBAL UI/UX FORM, TABLE, AND DRAWER DEVELOPMENT GUIDE

**Document Type**: Official ERP Development Standard  
**Effective Date**: June 8, 2026  
**Version**: REV1  
**Status**: Enhanced with Sameer/Dina review comments  
**Applies To**: All ERP modules (current and future)

---

## DOCUMENT PURPOSE

This guide establishes **mandatory UI/UX standards** for all ERP modules to ensure:
- Consistent user experience across all features
- Reusable component patterns and design system
- Predictable form behavior
- Optimal performance
- Professional enterprise-grade interface
- Accessibility and localization readiness
- AI-ready foundation for future enhancements

**All future implementations must follow this guide.**

---

## SUPABASE VERIFICATION

**Connected to live Supabase project**: `https://mmiefuieduzdiiwnqpie.supabase.co`

Live database/application context was verified before updating this planning document.

---

## TABLE OF CONTENTS

### Core Standards
1. [Scope and Application](#1-scope-and-application)
2. [Enterprise UI/UX Benchmarking Principles](#2-enterprise-uiux-benchmarking-principles)
3. [Live Supabase Verification Rule](#3-live-supabase-verification-rule)
4. [Global Screen Architecture Standard](#4-global-screen-architecture-standard)
5. [Global Drawer Form Standard](#5-global-drawer-form-standard)
6. [Global Tab Standard](#6-global-tab-standard)
7. [Global Child Record Add/Edit Standard](#7-global-child-record-addedit-standard)

### UI Component Standards
8. [Global Modal/Dialog Sizing Standard](#8-global-modaldialog-sizing-standard)
9. [Global No-Horizontal-Scroll Rule](#9-global-no-horizontal-scroll-rule)
10. [Global Required Field Standard](#10-global-required-field-standard)
11. [Global Combobox Standard (Everywhere)](#11-global-combobox-standard-everywhere)
12. [Global Form Footer Button Standard](#12-global-form-footer-button-standard)
13. [Global Safe Close and Unsaved Changes Standard](#13-global-safe-close-and-unsaved-changes-standard)

### Data Display Standards
14. [Global Loading/Empty/Error/Success States](#14-global-loadingemptyerrorsuccess-states)
15. [Global Table/List Standard](#15-global-tablelist-standard)
16. [Global Documents/DMS Placeholder Standard](#16-global-documentsdms-placeholder-standard)
17. [Global Numbering/Code Field Standard](#17-global-numberingcode-field-standard)

### Behavior and Integration Standards
18. [Global Permission-Based UI Behavior](#18-global-permission-based-ui-behavior)
19. [Global Validation/Zod Standard](#19-global-validationzod-standard)
20. [Global Audit/System Info Tab Standard](#20-global-auditsystem-info-tab-standard)
21. [Global Performance and Caching Standard](#21-global-performance-and-caching-standard)

### Enterprise Design System Standards
22. [Enterprise Design System Standard](#22-enterprise-design-system-standard)
23. [Reusable Pattern Library Standard](#23-reusable-pattern-library-standard)
24. [Information Architecture Standard](#24-information-architecture-standard)

### UX Optimization Standards
25. [Cognitive Load Reduction Standard](#25-cognitive-load-reduction-standard)
26. [Usability Friction Reduction Standard](#26-usability-friction-reduction-standard)
27. [Microcopy and Form Help Text Standard](#27-microcopy-and-form-help-text-standard)

### Accessibility and Localization Standards
28. [Accessibility / WCAG Readiness Standard](#28-accessibility--wcag-readiness-standard)
29. [Localization / Arabic-English Readiness Standard](#29-localization--arabic-english-readiness-standard)

### Future Foundation Standards
30. [Global Search / Command Palette Standard](#30-global-search--command-palette-standard)
31. [AI-Ready ERP Foundation Standard](#31-ai-ready-erp-foundation-standard)

### Implementation Standards
32. [Global Implementation Report Requirement](#32-global-implementation-report-requirement)
33. [Future Module Reuse Instruction](#33-future-module-reuse-instruction)

---

## 1. SCOPE AND APPLICATION

### 1.1 Applies To

This guide applies to ALL ERP modules including but not limited to:

**Master Data Modules**:
- Customers (implemented)
- Vendors
- Subcontractors
- Consultants
- Government Authorities
- Recruitment Agencies
- Employees
- Assets/Equipment
- Branches
- Organizations

**Operational Modules**:
- Procurement
- Workshop
- HSE (Health, Safety, Environment)
- Projects
- Inventory
- Maintenance

**Administrative Modules**:
- DMS (Document Management System)
- Notifications
- Reports
- Settings
- User Management

### 1.2 Enforcement

**Mandatory Compliance**:
- All new feature implementations must follow this guide
- All module refactoring must align with this guide
- Code reviews must verify compliance
- Implementation reports must reference this guide

**Deviation Process**:
- Deviation requires written justification
- Must be approved by technical lead
- Must document reason and alternative approach
- Must not compromise user experience

---

## 2. ENTERPRISE UI/UX BENCHMARKING PRINCIPLES

This ERP system draws inspiration from established enterprise design principles. We do not copy proprietary visuals or branding, but extract reusable UI/UX patterns from industry-leading systems.

### 2.1 SAP Fiori Design Principles

**Adopted Concepts**:
- **Modular reusable design system**: Build once, reuse everywhere
- **Pattern-based enterprise UI**: Consistent patterns across complex business applications
- **Responsive and accessible business apps**: Work on any device with proper accessibility
- **Role-based experience**: Different views for different business roles

### 2.2 Microsoft Dynamics / Power Apps Principles

**Adopted Concepts**:
- **Model-driven app approach**: Define data model, generate consistent UI
- **Table + View + Form + Relationship structure**: Clear entity management
- **Forms organized by tabs/sections**: Break complexity into manageable parts
- **Views/lists with defined columns, sorting, filtering, and actions**: Consistent table patterns

### 2.3 Microsoft Fluent Design Principles

**Adopted Concepts**:
- **Combobox for selectable values**: Searchable selection everywhere
- **Field labels with required indicators and validation messages**: Clear form requirements
- **Drawer/dialog anatomy with header/body/footer**: Consistent modal structure
- **Safe close behavior for forms with inputs**: Prevent data loss
- **Dialogs focused on one task**: Clear, single-purpose modals
- **Up to three footer actions**: Cancel / Save / Save & Close

### 2.4 Oracle Redwood / Oracle JET Public Direction

**Adopted Concepts**:
- **Modern enterprise experience**: Clean, professional interface
- **Guided workflows**: Clear process flows
- **Clean, consistent business components**: Predictable behavior
- **Business-user productivity focus**: Optimized for efficiency

### 2.5 Workday-Style Enterprise UX

**Adopted Concepts**:
- **Simple business-process flow**: Straightforward workflows
- **Role-based tasks**: Right information for right user
- **Clear actions and review steps**: Transparent processes
- **Minimal cognitive load for non-technical users**: Easy to learn

### 2.6 Infor CloudSuite-Style ERP Direction

**Adopted Concepts**:
- **Role-based workflows**: Tailored experiences
- **Industry-specific processes**: UAE/construction focus where applicable
- **Integrated data visibility**: Related data accessible
- **Operational efficiency**: Fast, streamlined operations

### 2.7 General UI/UX Design Concepts

**Foundational Principles**:
- Design system and style guide
- Pattern library
- Information architecture
- User-centered design
- Usability testing
- Accessibility / WCAG readiness
- Cognitive load reduction
- Usability friction reduction
- Professional microcopy
- Localization / bilingual readiness (Arabic-English)
- Consistent validation and error handling

**Important Note**: These are guiding principles only. This ERP system maintains its own unique identity while learning from industry best practices.

---

## 3. LIVE SUPABASE VERIFICATION RULE

### 3.1 Mandatory Pre-Implementation Verification

**Rule**: Before implementing ANY UI feature, you MUST:

1. **Connect to live Supabase project**: `https://mmiefuieduzdiiwnqpie.supabase.co`
2. **Verify database schema** for target tables
3. **Check existing indexes** on tables
4. **Confirm RLS policies** are enabled
5. **Verify numbering rules** if auto-generation applies
6. **Document verification** in implementation plan/report

### 3.2 Required Statement

Every implementation plan and report must include:

```
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
Live database schema was inspected before [planning/implementation].
```

### 3.3 Schema Verification Checklist

- [ ] Table structure matches types/interfaces
- [ ] Column data types are correct
- [ ] Required fields are NOT NULL
- [ ] Optional fields allow NULL
- [ ] Foreign key relationships exist
- [ ] Indexes on foreign keys exist
- [ ] RLS policies are enabled
- [ ] Audit fields present (created_at, created_by, updated_at, updated_by)
- [ ] Status fields have default values
- [ ] Numbering rules configured (if applicable)

---

## 4. GLOBAL SCREEN ARCHITECTURE STANDARD

### 4.1 Master Data Module Structure

**Page Layout**:
```
/admin/master-data/{module}/{entity}/page.tsx
├─ Page Header (title, breadcrumb, search, filters, actions)
├─ Data Table (ERPDataTable)
│  ├─ Search box
│  ├─ Column filters
│  ├─ Sortable columns
│  ├─ Row actions (Edit, View, Delete)
│  └─ Pagination
└─ Form Drawer (ERPDrawerForm - 80vw, right side)
   ├─ Drawer Header (mode, record number, status, print/export)
   ├─ Section Navigation (vertical tabs on left)
   ├─ Drawer Body (scrollable sections)
   │  ├─ Basic Info section
   │  ├─ Location/Address section (if applicable)
   │  ├─ Contacts section (child records)
   │  ├─ Commercial/Finance section (if applicable)
   │  ├─ Compliance section (if applicable)
   │  ├─ Documents section (placeholder until DMS)
   │  └─ Audit/System Info section
   └─ Drawer Footer (Cancel, Save, Save & Close)
```

### 4.2 One Entity = One Drawer

**Rule**: Each entity has ONE main drawer with tabs for different information categories.

**Do NOT**:
- Create separate pages for child records
- Open nested drawers inside drawers
- Use multiple drawers for one entity

**DO**:
- Use tabs for different sections
- Use dialogs/modals for child record Add/Edit
- Keep navigation simple and predictable

---

## 5. GLOBAL DRAWER FORM STANDARD

### 5.1 Component Structure

**Use**: `ERPDrawerForm` from `@/components/erp/erp-drawer-form.tsx`

**Required Props**:
```typescript
<ERPDrawerForm
  open={boolean}
  onOpenChange={(open: boolean) => void}
  title="Customer" // Entity name
  subtitle="Create new customer" // Optional
  mode="add" | "edit" | "view" | "draft" | "approval"
  status="ACTIVE" | "INACTIVE" | "DRAFT" | ... // Optional
  recordNumber="CUST-000001" // Optional
>
  {/* Drawer sections */}
</ERPDrawerForm>
```

### 5.2 Drawer Sizing

**Width**:
- Default: `80vw`
- Minimum: `960px` (tablet)
- Maximum: `1480px` (desktop)

**Height**: Full screen (`100vh`)

**Responsive**:
- Mobile: 100vw (full width)
- Tablet: 90vw
- Desktop: 80vw

### 5.3 Drawer Modes

| Mode | Description | Footer Buttons | Editable |
|------|-------------|----------------|----------|
| **add** | Creating new record | Cancel, Save, Save & Close | Yes |
| **edit** | Editing existing record | Cancel, Save, Save & Close | Yes |
| **view** | Read-only viewing | Close | No |
| **draft** | Editing draft record | Cancel, Save, Save & Close | Yes |
| **approval** | Approval workflow | Reject, Approve | Conditional |

### 5.4 Drawer Header

**Standard Elements**:
- Entity icon (optional)
- Entity name (required)
- Mode badge (Add/Edit/View)
- Record number (if edit/view)
- Status badge (if edit/view)
- Action buttons (Print, Export PDF, Export Excel, Export CSV, Send Email) - contextual
- Close button (X)

---

## 6. GLOBAL TAB STANDARD

### 6.1 Section Navigation

**Use**: `ERPDrawerSectionNav` component

**Standard Sections** (adapt to entity):
1. Basic Info (Building2 icon)
2. Location/Address (MapPin icon)
3. Contacts (Users icon)
4. Commercial/Finance (DollarSign icon)
5. Compliance (Award icon)
6. Documents (FileText icon)
7. Audit/System Info (Info icon)

### 6.2 Tab Behavior

**Navigation**:
- Vertical tabs on left side of drawer
- Always visible (not collapsible)
- Active tab highlighted
- Icon + label

**Content**:
- Sections rendered using `ERPDrawerSection`
- Only active section content visible
- Smooth scroll to section on tab click

**Performance**:
- Load all data on drawer open (parallel)
- Cache in parent state
- Pass to sections as props
- No independent data fetching in sections

---

## 7. GLOBAL CHILD RECORD ADD/EDIT STANDARD

### 7.1 Child Records Definition

**Examples**:
- Customer Contacts
- Customer Addresses
- Customer Bank Details
- Vendor Contacts
- Employee Documents
- Asset Maintenance Records

### 7.2 UI Pattern

**Display**:
- Show child records in a dedicated tab/section
- List view with key information
- Add button at top
- Edit/Delete actions per row
- Empty state message if no records

**Add/Edit**:
- Use `Dialog` component (NOT nested drawer)
- Open dialog on Add or Edit action
- Modal overlay (block parent interaction)
- Consistent sizing (see Section 8)

### 7.3 Dialog Structure

```tsx
<Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
  <DialogContent className="sm:max-w-[720px] max-h-[85vh]">
    <DialogHeader>
      <DialogTitle>{editMode ? "Edit" : "Add"} Contact</DialogTitle>
      <DialogDescription>
        {editMode ? "Update contact information" : "Add a new contact"}
      </DialogDescription>
    </DialogHeader>
    
    <form onSubmit={handleSubmit}>
      <div className="space-y-4">
        {/* Form fields */}
      </div>
      
      <DialogFooter>
        <Button type="button" variant="outline" onClick={handleCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="secondary" onClick={() => handleSave(false)}>
          Save
        </Button>
        <Button type="submit" onClick={() => handleSave(true)}>
          Save & Close
        </Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
```

### 7.4 Data Refresh Pattern

**After Create/Update/Delete**:
- Call parent `onRefresh()` callback
- Parent reloads all child data
- Updates child component props
- Shows success toast

---

## 8. GLOBAL MODAL/DIALOG SIZING STANDARD

### 8.1 Standard Sizes

| Size | Width | Use Case | Example |
|------|-------|----------|---------|
| **XS** | 320px | Confirmations | Delete confirmation |
| **SM** | 400px | Simple forms | Status change |
| **MD** | 600px | Small forms | Quick entry |
| **LG** | 720px | **Standard child forms** | Contact, Address, Bank Detail |
| **XL** | 1000px | Advanced forms | Report builder, complex settings |

### 8.2 Standard Child Form Size

**Default for child Add/Edit forms**: **720px**

**Rationale**:
- Provides comfortable two-column layout on desktop
- Prevents horizontal scrolling
- Accommodates longer field labels (especially bilingual)
- Aligns with enterprise ERP patterns

**Applies to**:
- Customer Contacts
- Customer Addresses
- Customer Bank Details
- Vendor Contacts
- Subcontractor Contacts
- Employee Dependents
- Asset Maintenance Records
- All future child entity forms

### 8.3 Height Constraints

**Max Height**: `85vh`  
**Overflow**: Vertical scroll only (no horizontal)

### 8.4 Responsive Behavior

```css
.dialog-content {
  width: 720px; /* Standard for child forms */
  max-width: 90vw;
  max-height: 85vh;
  overflow-y: auto;
}
```

**Breakpoints**:
- Mobile (< 640px): 95vw, single-column layout
- Tablet (640-1024px): 90vw, single-column layout
- Desktop (> 1024px): 720px, two-column layout where appropriate

### 8.5 Layout Guidelines

**Two-Column Layout** (Desktop):
```tsx
<div className="grid grid-cols-2 gap-4">
  <div>{/* Field 1 */}</div>
  <div>{/* Field 2 */}</div>
</div>
```

**Single-Column Layout** (Mobile/Tablet):
```tsx
<div className="space-y-4">
  <div>{/* Field 1 */}</div>
  <div>{/* Field 2 */}</div>
</div>
```

**Sticky Footer** (for long forms):
```tsx
<DialogFooter className="sticky bottom-0 bg-background border-t pt-4">
  {/* Buttons */}
</DialogFooter>
```

---

## 9. GLOBAL NO-HORIZONTAL-SCROLL RULE

### 9.1 Strict Prohibition

**Rule**: NO horizontal scrolling is allowed in:
- Drawers
- Dialogs/Modals
- Forms
- Tables (must use column visibility controls)

**Exception**: Only for intentional horizontal layouts (e.g., timeline, Gantt chart)

### 9.2 Implementation

**Forms**:
- Use responsive grid layouts
- Stack fields vertically on small screens
- Limit field widths to modal width
- Use two-column layout on desktop (720px accommodates this)
- Single-column layout on tablet/mobile

**Tables**:
- Use `ERPDataTable` with column visibility toggle
- Hide less important columns on mobile
- Provide export for full data access

**Testing**:
- Test on 1920px desktop
- Test on 1366px laptop
- Test on iPad (768px)
- Test on mobile (375px)
- Verify no horizontal scroll at any breakpoint

---

## 10. GLOBAL REQUIRED FIELD STANDARD

### 10.1 Visual Indicator

**Required Fields**:
- Label text followed by red asterisk (*)
- Color: `text-destructive` (red)
- Position: After label text, 1px spacing

**Example**:
```tsx
<Label htmlFor="customer_name_en" required>
  Customer Name (English)
</Label>
```

### 10.2 Validation Error Display

**Timing**:
- Show error ONLY after user interaction (blur) or form submit attempt
- Do NOT show error on initial render

**Display**:
```tsx
<div className="space-y-1">
  <Label htmlFor="email" required>Email</Label>
  <Input
    id="email"
    type="email"
    className={error ? "border-destructive" : ""}
  />
  {error && (
    <p className="text-sm text-destructive">{error.message}</p>
  )}
</div>
```

**Error Message Location**: Below the input field

**Error Border**: Red border only after validation error

### 10.3 Implementation Pattern

**Enhanced Label Component**:
```tsx
// components/ui/label.tsx
export function Label({ 
  children, 
  required, 
  ...props 
}: LabelProps & { required?: boolean }) {
  return (
    <label {...props}>
      {children}
      {required && <span className="text-destructive ml-1">*</span>}
    </label>
  );
}
```

---

## 11. GLOBAL COMBOBOX STANDARD (EVERYWHERE)

### 11.1 Mandatory Combobox Rule

**CRITICAL DECISION**: All selectable fields in ERP forms **MUST** use a searchable Combobox component, **regardless of the number of records**.

**No Exceptions**: Traditional non-searchable dropdown/select components must NOT be used anywhere in ERP forms.

### 11.2 Rationale

**Why Combobox Everywhere**:
1. **Consistency**: Users expect the same interaction pattern everywhere
2. **Scalability**: Small lists today may grow tomorrow
3. **Efficiency**: Search is faster than scrolling, even for 10 items
4. **Accessibility**: Keyboard navigation and ARIA support
5. **Future-proof**: Supports entity relationships as data grows
6. **Enterprise Standard**: Aligns with Microsoft Fluent, SAP Fiori patterns

### 11.3 Applies To

**All Entity Selections**:
- Lookup values (customer types, industry types, segments, lead sources, etc.)
- Countries
- Emirates / Regions
- Cities
- Areas / Zones
- Banks
- Currencies
- Payment Terms
- Tax Types
- Customers
- Vendors
- Subcontractors
- Consultants
- Government Authorities
- Recruitment Agencies
- Employees
- Assets
- Projects
- Cost Centers
- Profit Centers
- Branches
- Organizations
- All future entity selections

### 11.4 Required Features

**Every Combobox MUST Support**:
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

### 11.5 Component Implementation Strategy

**Shared Components to Enhance**:
```text
LookupSelect → LookupCombobox (or keep name but behave as combobox)
CountrySelect → CountryCombobox
EmirateSelect → EmirateCombobox
CitySelect → CityCombobox
AreaZoneSelect → AreaZoneCombobox
BankSelect → BankCombobox
CurrencySelect → CurrencyCombobox
PaymentTermSelect → PaymentTermCombobox
TaxTypeSelect → TaxTypeCombobox
CustomerSelect (future)
VendorSelect (future)
EmployeeSelect (future)
AssetSelect (future)
ProjectSelect (future)
```

**Rule**: **Do not create one-off comboboxes.** Enhance shared components once and reuse them everywhere.

**Note**: Technical file names may remain `*Select.tsx` temporarily during migration, but behavior must be Combobox.

### 11.6 Implementation Pattern

**Standard Combobox Pattern**:
```tsx
export function EntityCombobox({ items, value, onValueChange, ... }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [open, setOpen] = useState(false);
  
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

**Alternative**: Use shadcn/ui Combobox pattern or enhance Select component with search input.

### 11.7 Data Loading for Comboboxes

**Client-Side Filtering** (default for lookup values, geography, finance basics):
- Load all active records once
- Filter client-side for instant search
- Use React Query or SWR for caching

**Server-Side Search** (for large entity lists like Customers, Vendors, Employees):
- Implement debounced search API
- Return paginated results
- Minimum 3 characters to trigger search
- Show "Type to search..." placeholder

---

## 12. GLOBAL FORM FOOTER BUTTON STANDARD

### 12.1 Button Arrangement

**Add/Edit/Draft Modes**:
```tsx
<DialogFooter> or <ERPDrawerFooter>
  <Button type="button" variant="outline" onClick={handleCancel}>
    Cancel
  </Button>
  <Button type="submit" variant="secondary" onClick={() => handleSave(false)}>
    Save
  </Button>
  <Button type="submit" onClick={() => handleSave(true)}>
    Save & Close
  </Button>
</DialogFooter>
```

**View Mode**:
```tsx
<DialogFooter>
  <Button type="button" onClick={handleClose}>
    Close
  </Button>
</DialogFooter>
```

### 12.2 Button Behavior

| Button | Variant | Action | Toast Message |
|--------|---------|--------|---------------|
| **Cancel** | outline | Close if clean, else confirm | None |
| **Save** | secondary | Save, keep form open, refresh data | "{Entity} saved successfully" |
| **Save & Close** | default (primary) | Save, close form, refresh list | "{Entity} saved successfully" |
| **Close** | default | Close immediately (view mode) | None |

### 12.3 Button States

**During Submission**:
```tsx
<Button type="submit" disabled={isSubmitting}>
  {isSubmitting ? "Saving..." : "Save & Close"}
</Button>
```

**Disabled State**:
- All buttons disabled during form submission
- Loading indicator on active button
- Clear visual feedback

### 12.4 Save vs Save & Close Logic

**Save (Keep Open)**:
```typescript
const handleSave = async (closeAfter: boolean = false) => {
  setIsSubmitting(true);
  
  try {
    const result = await saveData(formData);
    
    if (result.success) {
      toast.success("Contact saved successfully");
      
      if (closeAfter) {
        onOpenChange(false); // Close dialog
      } else {
        // Keep open
        if (mode === 'add') {
          resetFormToInitial(); // Reset for next entry
        } else {
          refreshFormData(); // Reload current record
        }
      }
      
      onRefresh(); // Refresh parent list
    } else {
      toast.error(result.error ?? "Failed to save");
    }
  } finally {
    setIsSubmitting(false);
  }
};
```

**Rationale**:
- **Save**: Useful for entering multiple child records (e.g., adding 5 contacts in a row)
- **Save & Close**: Standard behavior for single record entry
- **Cancel**: Safe exit with confirmation if unsaved changes exist

---

## 13. GLOBAL SAFE CLOSE AND UNSAVED CHANGES STANDARD

### 13.1 Mode-Based Close Behavior

| Mode | Outside Click | Escape Key | X Button | Cancel Button |
|------|---------------|------------|----------|---------------|
| **Add** | Disabled | Disabled or ask confirmation | Ask if dirty | Ask if dirty |
| **Edit** | Disabled | Disabled or ask confirmation | Ask if dirty | Ask if dirty |
| **View** | Allowed | Allowed | Allowed | Close immediately |

### 13.2 Dirty State Detection

**Track Form Changes**:
```typescript
const [initialFormData] = useState(formData);
const [isDirty, setIsDirty] = useState(false);

useEffect(() => {
  const dirty = JSON.stringify(formData) !== JSON.stringify(initialFormData);
  setIsDirty(dirty);
}, [formData, initialFormData]);

// OR use library like react-hook-form
const { formState: { isDirty } } = useForm({ defaultValues: initialFormData });
```

### 13.3 Confirmation Dialog

**Text**:
```
Title: Unsaved Changes
Message: You have unsaved changes. Do you want to discard them?
Buttons: [Cancel] [Discard Changes]
```

**Implementation**:
```tsx
const handleCancel = () => {
  if (isDirty) {
    if (confirm("You have unsaved changes. Do you want to discard them?")) {
      onOpenChange(false);
    }
  } else {
    onOpenChange(false);
  }
};

// OR use custom Dialog
<Dialog open={showConfirmation} onOpenChange={setShowConfirmation}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Unsaved Changes</DialogTitle>
      <DialogDescription>
        You have unsaved changes. Do you want to discard them?
      </DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button variant="outline" onClick={() => setShowConfirmation(false)}>
        Cancel
      </Button>
      <Button variant="destructive" onClick={handleDiscard}>
        Discard Changes
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### 13.4 Disable Outside Click

**For Add/Edit Modes**:
```tsx
<Dialog 
  open={isOpen} 
  onOpenChange={(open) => {
    if (!open && isDirty && mode !== 'view') {
      handleUnsavedChanges();
    } else {
      setIsOpen(open);
    }
  }}
  modal={true} // Prevent backdrop click
>
```

---

## 14. GLOBAL LOADING/EMPTY/ERROR/SUCCESS STATES

### 14.1 Loading States

**Initial Load**:
```tsx
{loading ? (
  <div className="flex items-center justify-center py-8">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    <span className="ml-2 text-muted-foreground">Loading...</span>
  </div>
) : (
  <DataDisplay data={data} />
)}
```

**Button Loading**:
```tsx
<Button disabled={isSubmitting}>
  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
  {isSubmitting ? "Saving..." : "Save"}
</Button>
```

**Skeleton Loaders** (optional, for better UX):
```tsx
<div className="space-y-2">
  <Skeleton className="h-4 w-full" />
  <Skeleton className="h-4 w-3/4" />
  <Skeleton className="h-4 w-1/2" />
</div>
```

### 14.2 Empty States

**No Child Records**:
```tsx
{contacts.length === 0 ? (
  <div className="flex flex-col items-center justify-center py-12 text-center">
    <Users className="h-12 w-12 text-muted-foreground mb-4" />
    <h3 className="text-lg font-semibold">No contacts added yet</h3>
    <p className="text-sm text-muted-foreground mb-4">
      Add a contact to get started
    </p>
    <Button onClick={handleAddContact}>
      <Plus className="h-4 w-4 mr-2" />
      Add Contact
    </Button>
  </div>
) : (
  <ContactsList contacts={contacts} />
)}
```

**No Search Results**:
```tsx
<div className="py-8 text-center">
  <SearchX className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
  <p className="text-sm text-muted-foreground">No results found</p>
</div>
```

### 14.3 Error States

**Form Validation Errors**:
```tsx
{error && (
  <div className="p-4 bg-destructive/10 border border-destructive rounded-md mb-4">
    <div className="flex items-start gap-2">
      <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
      <div>
        <p className="font-semibold text-destructive">Validation Error</p>
        <p className="text-sm text-destructive">{error.message}</p>
      </div>
    </div>
  </div>
)}
```

**API Errors**:
```tsx
{fetchError && (
  <div className="p-4 bg-destructive/10 border border-destructive rounded-md">
    <p className="text-sm text-destructive">{fetchError}</p>
  </div>
)}
```

### 14.4 Success States

**Toast Messages**:
```typescript
import { toast } from "sonner";

// Success
toast.success("Customer created successfully");

// Error
toast.error("Failed to create customer");

// Warning
toast.warning("Customer code will be auto-generated");

// Info
toast.info("Changes saved as draft");
```

**Success Message Patterns**:
- Create: "{Entity} created successfully"
- Update: "{Entity} updated successfully"
- Delete: "{Entity} deleted successfully"
- Activate: "{Entity} activated successfully"
- Deactivate: "{Entity} deactivated successfully"

---

## 15. GLOBAL TABLE/LIST STANDARD

### 15.1 Use ERPDataTable

**Component**: `@/components/erp/table/erp-data-table.tsx`

**Required Features**:
- Search across multiple columns
- Column filtering
- Sortable columns
- Column visibility toggle
- Row selection (for bulk actions)
- Pagination
- Row actions (Edit, View, Delete)
- Status badges
- Empty state
- Loading state

### 15.2 Table Structure

```tsx
<ERPDataTable
  tableId="customers"
  columns={customersColumns}
  data={customers}
  searchPlaceholder="Search customers..."
  onRowClick={(row) => handleView(row)}
  enableRowSelection
  enableExport
/>
```

### 15.3 Column Definition

```tsx
const customersColumns: ColumnDef<Customer>[] = [
  {
    accessorKey: "customer_code",
    header: "Code",
    cell: ({ row }) => (
      <span className="font-mono">{row.original.customer_code}</span>
    ),
  },
  {
    accessorKey: "customer_name_en",
    header: "Customer Name",
    cell: ({ row }) => (
      <div>
        <div className="font-medium">{row.original.customer_name_en}</div>
        {row.original.customer_name_ar && (
          <div className="text-sm text-muted-foreground">{row.original.customer_name_ar}</div>
        )}
      </div>
    ),
  },
  {
    accessorKey: "status_code",
    header: "Status",
    cell: ({ row }) => (
      <Badge variant={row.original.status_code === "ACTIVE" ? "success" : "secondary"}>
        {row.original.status_code}
      </Badge>
    ),
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => handleView(row.original)}>View</DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleEdit(row.original)}>Edit</DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleDelete(row.original)} className="text-destructive">
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];
```

### 15.4 Pagination

**Client-Side**: Use built-in ERPDataTable pagination  
**Server-Side**: Implement when records exceed 1000

---

## 16. GLOBAL DOCUMENTS/DMS PLACEHOLDER STANDARD

### 16.1 Standard Placeholder (Until DMS Implemented)

**Text**:
```tsx
<div className="p-6">
  <div className="flex items-center gap-2 mb-4">
    <FileText className="h-5 w-5 text-muted-foreground" />
    <h3 className="font-semibold">Document Management</h3>
  </div>
  <div className="space-y-4">
    <p className="text-sm text-muted-foreground">
      {entityType} documents such as trade license, VAT certificate, 
      ICV certificate, CICPA registration, agreements, and approvals 
      will be uploaded and managed through the centralized DMS 
      (Document Management System).
    </p>
    <div className="flex gap-3">
      <Button variant="outline" disabled className="gap-2">
        <Upload className="h-4 w-4" />
        Upload Document
      </Button>
      <Button variant="outline" disabled className="gap-2">
        <FolderOpen className="h-4 w-4" />
        View Documents
      </Button>
    </div>
    <p className="text-xs text-muted-foreground">
      Available after DMS implementation.
    </p>
  </div>
</div>
```

### 16.2 Applies To

- Customers
- Vendors
- Subcontractors
- Consultants
- Government Authorities
- Recruitment Agencies
- Employees
- Assets/Equipment
- Projects

### 16.3 Do NOT Implement

- Upload functionality
- Storage bucket integration
- Document preview
- Document download
- Document workflow
- Document versioning

**Wait for centralized DMS module implementation.**

---

## 17. GLOBAL NUMBERING/CODE FIELD STANDARD

### 17.1 Auto-Generated Code Behavior

**Rules**:
1. Code field is auto-generated using global numbering system
2. Field is read-only in all modes (Add, Edit, View)
3. Add mode shows placeholder: "Auto-generated on save"
4. Edit mode shows actual code value
5. View mode shows actual code value
6. Code NEVER changes after creation (immutable)
7. No manual entry allowed (unless explicitly approved exception)

### 17.2 UI Display

**Add Mode**:
```tsx
<div className="space-y-1">
  <Label>Customer Code</Label>
  <Input
    value="Auto-generated on save"
    disabled
    className="bg-muted"
  />
</div>
```

**Edit/View Mode**:
```tsx
<div className="space-y-1">
  <Label>Customer Code</Label>
  <Input
    value={customer.customer_code}
    disabled
    className="bg-muted font-mono"
  />
</div>
```

### 17.3 Server Action Integration

**Create Action**:
```typescript
export async function createCustomer(data: CreateCustomerInput) {
  // Generate code before insert
  const numberingResult = await generateNextReference({
    documentTypeCode: "CUSTOMER",
    targetTableName: "customers",
    generationReason: "Customer creation",
  });

  if (!numberingResult.success) {
    return { success: false, error: "Failed to generate customer code" };
  }

  const customer_code = numberingResult.data.generatedReferenceNumber;

  // Insert with generated code
  const { data: newCustomer, error } = await supabase
    .from("customers")
    .insert({ ...data, customer_code })
    .select()
    .single();
  
  return { success: true, data: newCustomer };
}
```

**Update Action**:
```typescript
export async function updateCustomer(data: UpdateCustomerInput) {
  // Code is immutable - do NOT regenerate
  const { customer_code, ...updateData } = data; // Remove code from update
  
  const { data: updatedCustomer, error } = await supabase
    .from("customers")
    .update(updateData)
    .eq("id", data.id)
    .select()
    .single();
  
  return { success: true, data: updatedCustomer };
}
```

### 17.4 Standard Code Formats

**Master Data**:
- `CUST-000001` (Customer)
- `VEND-000001` (Vendor)
- `SUBC-000001` (Subcontractor)
- `CONS-000001` (Consultant)
- `AUTH-000001` (Government Authority)
- `AGCY-000001` (Recruitment Agency)
- `CONT-000001` (Contact - shared or entity-specific, TBD)

**Transactions**:
- `PO-000001` (Purchase Order)
- `INV-000001` (Invoice)
- `RFQ-000001` (Request for Quotation)

---

## 18. GLOBAL PERMISSION-BASED UI BEHAVIOR

### 18.1 UI Enforcement Rules

**Rule**: UI hides actions user cannot perform, but NEVER relies on UI alone for security.

**Enforcement Layers**:
1. **UI**: Hide buttons/actions based on permissions (UX)
2. **Server Actions**: Verify permissions before execution (security)
3. **RLS**: Database-level access control (security)

### 18.2 Button Visibility

**Example**:
```tsx
{hasPermission(authContext, "master_data.party_master.manage") && (
  <Button onClick={handleAdd}>
    <Plus className="h-4 w-4 mr-2" />
    Add Customer
  </Button>
)}

{hasPermission(authContext, "master_data.party_master.manage") ? (
  <Button onClick={handleEdit}>Edit</Button>
) : (
  <Button onClick={handleView}>View</Button>
)}
```

### 18.3 Form Mode Based on Permissions

```tsx
const mode = useMemo(() => {
  if (hasPermission(authContext, "master_data.party_master.manage")) {
    return customer ? "edit" : "add";
  }
  return "view"; // Read-only for view-only users
}, [authContext, customer]);

<CustomerFormDrawer mode={mode} customer={customer} ... />
```

### 18.4 Locked/Inactive Records

**System Records**:
```tsx
{customer.is_system && (
  <Badge variant="secondary">System Record</Badge>
)}

<Button 
  onClick={handleEdit} 
  disabled={customer.is_locked || customer.is_system}
>
  Edit
</Button>
```

**Inactive Records**:
```tsx
{!customer.is_active && (
  <Badge variant="secondary">Inactive</Badge>
)}

// Warn user before editing inactive record
if (!customer.is_active) {
  toast.warning("This customer is inactive");
}
```

---

## 19. GLOBAL VALIDATION/ZOD STANDARD

### 19.1 Validation Location

**Client-Side**: Zod schemas for immediate feedback  
**Server-Side**: Zod schemas + business logic validation

### 19.2 Schema Structure

**Base Schema**:
```typescript
// features/master-data/customers/validation.ts
import { z } from "zod";

const customerBaseSchema = z.object({
  customer_name_en: z.string().min(1, "Customer name is required").max(255),
  customer_name_ar: z.string().max(255).optional().nullable(),
  customer_type_code: z.string().min(1, "Customer type is required"),
  industry_type_code: z.string().optional().nullable(),
  trn: z.string()
    .regex(/^\d{15}$/, "TRN must be 15 digits")
    .optional()
    .nullable(),
  // ... other fields
});
```

**Create Schema**:
```typescript
export const createCustomerSchema = customerBaseSchema;
```

**Update Schema**:
```typescript
export const updateCustomerSchema = customerBaseSchema.partial().extend({
  id: z.number(),
  is_active: z.boolean().optional(),
});
```

### 19.3 Business Rule Validation

**Example**: ICV Score Validation
```typescript
const customerBaseSchema = z.object({
  icv_score_percentage: z.number()
    .min(0, "ICV score must be between 0 and 100")
    .max(100, "ICV score must be between 0 and 100")
    .optional()
    .nullable(),
  icv_issue_date: z.string().optional().nullable(),
  icv_expiry_date: z.string().optional().nullable(),
}).refine(
  (data) => {
    if (data.icv_score_percentage != null) {
      return data.icv_issue_date != null;
    }
    return true;
  },
  {
    message: "ICV issue date is required when ICV score is provided",
    path: ["icv_issue_date"],
  }
);
```

### 19.4 Server Action Validation

```typescript
export async function createCustomer(input: unknown) {
  // Validate input
  const validated = createCustomerSchema.parse(input);
  
  // Business logic validation
  if (validated.credit_limit && validated.credit_limit < 0) {
    return { success: false, error: "Credit limit must be positive" };
  }
  
  // Proceed with creation
  // ...
}
```

---

## 20. GLOBAL AUDIT/SYSTEM INFO TAB STANDARD

### 20.1 Standard Fields to Display

**Creation Info**:
- Created At (formatted timestamp)
- Created By (user name)

**Last Update Info**:
- Updated At (formatted timestamp)
- Updated By (user name)

**Deactivation Info** (if applicable):
- Deactivated At
- Deactivated By
- Deactivation Reason

**System Flags**:
- Is Active (boolean badge)
- Is Locked (boolean badge)
- Is System (boolean badge)
- Sort Order (if applicable)

### 20.2 Display Pattern

```tsx
<ERPDrawerSection id="audit">
  <div className="space-y-4 p-6">
    <div>
      <h3 className="font-semibold mb-4">Creation Information</h3>
      <ERPFieldGrid>
        <div>
          <Label>Created At</Label>
          <p className="text-sm">{format(new Date(customer.created_at), "PPpp")}</p>
        </div>
        <div>
          <Label>Created By</Label>
          <p className="text-sm">{customer.created_by_name || "System"}</p>
        </div>
      </ERPFieldGrid>
    </div>

    <Separator />

    <div>
      <h3 className="font-semibold mb-4">Last Update</h3>
      <ERPFieldGrid>
        <div>
          <Label>Updated At</Label>
          <p className="text-sm">{format(new Date(customer.updated_at), "PPpp")}</p>
        </div>
        <div>
          <Label>Updated By</Label>
          <p className="text-sm">{customer.updated_by_name || "System"}</p>
        </div>
      </ERPFieldGrid>
    </div>

    <Separator />

    <div>
      <h3 className="font-semibold mb-4">System Flags</h3>
      <div className="flex gap-2">
        <Badge variant={customer.is_active ? "success" : "secondary"}>
          {customer.is_active ? "Active" : "Inactive"}
        </Badge>
        {customer.is_locked && <Badge variant="warning">Locked</Badge>}
        {customer.is_system && <Badge variant="secondary">System</Badge>}
      </div>
    </div>
  </div>
</ERPDrawerSection>
```

---

## 21. GLOBAL PERFORMANCE AND CACHING STANDARD

### 21.1 Data Loading Strategy

**Drawer Forms**:
- Load ALL tab data in parallel on drawer open
- Use `Promise.all` for concurrent fetches
- Cache in parent component state
- Pass to child components as props
- Refresh after create/update/delete via callback

**Example**:
```typescript
const loadAllData = async (entityId: number) => {
  setLoading(true);
  try {
    const [entity, contacts, addresses, bankDetails] = await Promise.all([
      getEntity(entityId),
      getEntityContacts(entityId),
      getEntityAddresses(entityId),
      getEntityBankDetails(entityId),
    ]);
    
    setEntityData(entity.data);
    setContacts(contacts.data || []);
    setAddresses(addresses.data || []);
    setBankDetails(bankDetails.data || []);
  } finally {
    setLoading(false);
  }
};

useEffect(() => {
  if (entityId && mode !== 'add') {
    loadAllData(entityId);
  }
}, [entityId, mode]);
```

### 21.2 Database Index Requirements

**Foreign Keys**: MUST have indexes
```sql
CREATE INDEX CONCURRENTLY idx_{table}_{fk_column}
  ON {table}({fk_column})
  WHERE is_active = true;
```

**Composite Indexes**: For common queries
```sql
CREATE INDEX CONCURRENTLY idx_customer_contacts_customer_id_primary
  ON customer_contacts(customer_id, is_primary)
  WHERE is_active = true;
```

### 21.3 Performance Targets

**Page Load**:
- List page < 2 seconds
- Drawer open < 1 second

**Tab Switching**:
- Instant (< 100ms) after initial load

**Form Submission**:
- Submit + refresh < 1 second

---

## 22. ENTERPRISE DESIGN SYSTEM STANDARD

### 22.1 Build Once, Reuse Everywhere

**Core Principle**: All modules must use shared ERP components. Avoid one-off UI components.

### 22.2 Shared Component Library

**Required Shared Components**:
```text
ERPDrawerForm - Main entity drawer
ERPDrawerSectionNav - Vertical tab navigation
ERPDrawerSection - Content sections
ERPDrawerBody - Scrollable body
ERPDrawerFooter - Action buttons footer
ERPFieldGrid - Responsive form field grid
ERPDataTable - Enterprise data table
ERPCombobox - Searchable selection (base)
LookupCombobox - Lookup value selection
EntityCombobox - Entity selection (customers, vendors, etc.)
GeographyCombobox - Country, Emirate, City, Area selection
FinanceCombobox - Bank, Currency, Payment Term, Tax Type selection
RequiredLabel - Label with red asterisk or Label with required prop
ConfirmDiscardDialog - Unsaved changes confirmation
ChildRecordDialog - Standard child Add/Edit modal
DocumentsPlaceholder - DMS placeholder component
AuditSystemInfoSection - Standard audit info display
```

### 22.3 Component Documentation

**Every reusable component must document**:
- Purpose and use case
- Required props
- Optional props
- Usage example
- Variants (if any)
- Accessibility considerations

### 22.4 Component Behavior Consistency

**Predictable Behavior**:
- Comboboxes always searchable
- Required fields always marked with *
- Buttons always in same order
- Loading states always consistent
- Error messages always below fields
- Modals always closable with confirmation if dirty

---

## 23. REUSABLE PATTERN LIBRARY STANDARD

### 23.1 Document Patterns

**Required Patterns to Document**:
- Main list + drawer pattern
- Child record management pattern
- Add/Edit/View mode switching
- Save / Save & Close / Cancel flow
- Safe close with dirty tracking
- Parallel data loading
- Combobox with server-side search
- Required field validation
- Auto-generated code display
- Documents placeholder
- Audit info display

### 23.2 Pattern Example Template

```markdown
## Pattern: Child Record Management

**Use Case**: Managing one-to-many relationships (e.g., Customer Contacts)

**Structure**:
1. Display child records in parent tab
2. Add button at top
3. Edit/Delete actions per row
4. Dialog opens for Add/Edit
5. Parent refreshes after save

**Components Used**:
- ERPDrawerSection (parent tab)
- Dialog (child modal)
- ERPDataTable or custom list
- ConfirmDiscardDialog

**Example**: Customer Contacts, Customer Addresses
```

### 23.3 Pattern Library Location

**Recommended**: `docs/patterns/` folder

**Files**:
- `drawer-form-pattern.md`
- `child-record-pattern.md`
- `combobox-pattern.md`
- `safe-close-pattern.md`
- `parallel-loading-pattern.md`

---

## 24. INFORMATION ARCHITECTURE STANDARD

### 24.1 Menu Organization

**Rules**:
- Menus must be logically grouped by business function
- Modules must follow business mental model
- Use clear labels that match business terminology
- Avoid technical jargon in user-facing labels

**Example Menu Structure**:
```
Master Data
├─ Party Master
│  ├─ Customers
│  ├─ Vendors
│  ├─ Subcontractors
│  ├─ Consultants
│  ├─ Government Authorities
│  └─ Recruitment Agencies
├─ Geography
│  ├─ Countries
│  ├─ Emirates
│  ├─ Cities
│  └─ Areas / Zones
├─ Finance Basics
│  ├─ Banks
│  ├─ Currencies
│  ├─ Payment Terms
│  └─ Tax Types
└─ ...
```

### 24.2 Entity Structure

**Rules**:
- One module = one main list screen
- One entity = one main drawer
- Related data = tabs
- Child records = inside parent tabs
- Do not scatter related data across many pages

### 24.3 Navigation Clarity

**Rules**:
- Primary navigation always visible
- Current location clearly indicated (breadcrumb)
- Back actions predictable
- External links clearly marked
- Modal/drawer close actions always available

---

## 25. COGNITIVE LOAD REDUCTION STANDARD

### 25.1 Break Complexity

**Rules**:
- Use tabs to break complex forms into meaningful groups
- Group related fields together
- Use progressive disclosure (show advanced options only when needed)
- Do not show irrelevant controls
- Avoid excessive fields on one screen

**Example**:
```
Customer Drawer Tabs:
1. Basic Info - Essential customer details
2. Location - Address and geography
3. Contacts - People to contact
4. Finance - Commercial terms
5. Compliance - UAE regulatory info
6. Documents - Attachments
7. Audit - System information
```

### 25.2 Reduce Decision Points

**Rules**:
- Provide smart defaults
- Use auto-generated codes (not manual entry)
- Pre-select common options where appropriate
- Guide users with helpful placeholder text
- Use clear button labels (not "Submit", use "Save Customer")

### 25.3 Information Hierarchy

**Rules**:
- Most important information first
- Required fields before optional fields
- Logical field order (name before code)
- Visual hierarchy with spacing and grouping

---

## 26. USABILITY FRICTION REDUCTION STANDARD

### 26.1 Eliminate Friction Points

**Rules**:
- Avoid repeated loading when switching tabs (use parallel loading)
- Avoid non-searchable lists (use comboboxes everywhere)
- Avoid accidental form close (safe close with confirmation)
- Avoid unclear action names (use explicit labels)
- Avoid excessive clicks (Save & Close in one action)

### 26.2 Keyboard Efficiency

**Rules**:
- Tab order follows visual layout
- Enter submits forms
- Escape closes modals (with confirmation if dirty)
- Arrow keys navigate comboboxes
- Shortcuts for common actions (future: Ctrl+S for Save, Ctrl+K for search)

### 26.3 Fast Data Entry

**Rules**:
- Auto-focus on first field when modal opens
- Save keeps form open for multiple entries
- Combobox search starts immediately (no extra click)
- Clear option for optional comboboxes (don't require delete)

---

## 27. MICROCOPY AND FORM HELP TEXT STANDARD

### 27.1 Standard Microcopy

**Auto-Generated Fields**:
```
"Auto-generated on save"
```

**Empty States**:
```
"No contacts added yet"
"No additional addresses added yet"
"No bank details added yet"
"Save customer first to add contacts"
```

**Combobox States**:
```
"Select..."
"Search..."
"Type to search..."
"No results found"
"Loading..."
```

**Confirmation Dialogs**:
```
"You have unsaved changes. Do you want to discard them?"
"Are you sure you want to delete this contact?"
```

**Documents Placeholder**:
```
"Documents will be managed through the centralized DMS module."
"Available after DMS implementation."
```

**Error Messages**:
```
"Failed to generate customer code"
"Failed to load customer data"
"Failed to save customer"
"Validation failed"
```

### 27.2 Microcopy Guidelines

**Rules**:
- Use simple, clear language
- Avoid technical jargon
- Be specific (not "Error occurred", say "Failed to save customer")
- Be helpful (suggest action if possible)
- Be concise (no unnecessary words)
- Be consistent (same wording for same situation)

### 27.3 Help Text

**When to Use**:
- Complex validation rules (e.g., "TRN must be 15 digits")
- Business-specific fields (e.g., "ICV certificate number from ADNOC")
- Unusual requirements (e.g., "Leave empty for auto-generation")

**Format**:
```tsx
<div className="space-y-1">
  <Label htmlFor="trn">TRN</Label>
  <Input id="trn" maxLength={15} />
  <p className="text-xs text-muted-foreground">
    Tax Registration Number (15 digits)
  </p>
</div>
```

---

## 28. ACCESSIBILITY / WCAG READINESS STANDARD

### 28.1 Keyboard Navigation

**Requirements**:
- All interactive elements accessible via keyboard
- Tab order follows visual layout
- Focus visible on all interactive elements
- Combobox navigable with arrow keys
- Dialogs closable with Escape (with confirmation if dirty)
- Tables sortable/filterable via keyboard

### 28.2 Screen Reader Support

**Requirements**:
- Semantic HTML (use `<button>` not `<div onClick>`)
- ARIA labels where needed
- Labels associated with inputs (`htmlFor` and `id`)
- Error messages announced
- Loading states announced
- Success/failure toasts announced

**Example**:
```tsx
<Label htmlFor="customer_name">Customer Name</Label>
<Input 
  id="customer_name" 
  aria-describedby={error ? "customer_name_error" : undefined}
  aria-invalid={error ? true : undefined}
/>
{error && <p id="customer_name_error" role="alert">{error.message}</p>}
```

### 28.3 Visual Accessibility

**Requirements**:
- Readable contrast (WCAG AA minimum)
- Do not rely on color only (use icons + text for status)
- Error messages must be textual (not just red border)
- Focus indicators visible
- Text resizable without breaking layout
- Minimum touch target size (44x44px)

**Example Status Display**:
```tsx
// Good: Icon + text + color
<Badge variant={isActive ? "success" : "secondary"}>
  {isActive ? <CheckCircle className="mr-1" /> : <Circle className="mr-1" />}
  {isActive ? "Active" : "Inactive"}
</Badge>

// Bad: Color only
<Badge variant={isActive ? "success" : "secondary"} />
```

### 28.4 Future WCAG Compliance

**Roadmap**:
- Current: Implement foundational accessibility
- Phase 2: Full WCAG 2.1 AA compliance audit
- Phase 3: WCAG 2.1 AAA where feasible

---

## 29. LOCALIZATION / ARABIC-ENGLISH READINESS STANDARD

### 29.1 Bilingual Data Support

**Database Fields**:
- All master data has `name_en` and `name_ar` fields
- Comboboxes search both English and Arabic names
- Display language based on user preference (future)

**Example**:
```sql
customer_name_en TEXT NOT NULL,
customer_name_ar TEXT NULL,
```

### 29.2 Combobox Bilingual Search

**Requirements**:
- Search filters both English and Arabic names
- Display format configurable (English only, Arabic only, or both)

**Example**:
```tsx
const filteredItems = items.filter(item => {
  const query = searchQuery.toLowerCase();
  return (
    item.code.toLowerCase().includes(query) ||
    item.name_en.toLowerCase().includes(query) ||
    (item.name_ar && item.name_ar.includes(query))
  );
});
```

### 29.3 RTL Readiness

**Future Phase**:
- RTL layout for Arabic UI
- Text direction based on content language
- Proper Arabic text rendering
- Date/number formatting for Arabic locale

**Current**:
- Database supports Arabic data
- Arabic data searchable
- Arabic data displayable in English UI

### 29.4 Date, Currency, Number Formatting

**Requirements**:
- Dates: UAE/business context (DD/MM/YYYY)
- Currency: AED by default, configurable
- Numbers: Locale-aware formatting
- Phones: UAE format (+971 XX XXX XXXX)

**Example**:
```tsx
import { format } from "date-fns";
import { formatCurrency, formatPhone } from "@/lib/utils";

<p>{format(new Date(date), "dd/MM/yyyy")}</p>
<p>{formatCurrency(amount, currency)}</p>
<p>{formatPhone(phone, "UAE")}</p>
```

---

## 30. GLOBAL SEARCH / COMMAND PALETTE STANDARD

### 30.1 Purpose

The top search bar in the ERP must become functional, not decorative. Users must be able to search across all entities from anywhere in the application.

### 30.2 Global Shortcut

**Keyboard Shortcut**: `Ctrl + K` (Windows) / `Cmd + K` (Mac)

### 30.3 Search Capabilities

**Search By**:
- Code/Reference (e.g., CUST-000001)
- English name
- Arabic name
- Email
- Mobile/Phone
- TRN (Tax Registration Number)
- Trade License Number
- ICV Certificate Number
- CICPA Registration Number

**Result Grouping**:
- Group results by module/entity type
- Show most relevant results first
- Respect RLS and permissions

### 30.4 Searchable Entities

**Phase 1** (Initial):
- Customers
- Customer Contacts
- Organizations / Owner Companies
- Branches

**Phase 2** (After modules implemented):
- Vendors
- Subcontractors
- Consultants
- Government Authorities
- Recruitment Agencies

**Phase 3** (Later):
- Employees
- Assets
- Projects
- Documents (after DMS)

### 30.5 Architecture

**Components**:
- Global search registry (map of entity types to search providers)
- Search providers per module
- Central global-search service/action
- Permission-aware search
- Result grouping by entity type
- Click result opens correct module/entity drawer in View mode

**Security**:
- Respect RLS (only show records user can access)
- Respect permissions (no result shown if user lacks view permission)
- Audit search queries (optional, for compliance)

### 30.6 Global Search Result Action Standard

**Core Principle**: Every global search result must be actionable. Search results must never be display-only.

**When the user clicks a result**:
- **Parent record result** opens the related module/page and opens the parent drawer in View mode
- **Child record result** opens the parent record drawer in View mode and activates the related child tab
- **Future document result** opens the parent record drawer in View mode and activates the Documents tab
- **Edit mode must not open directly** from global search - user must click Edit after opening the record, if permitted
- **Results must respect RLS and permissions** - if the user cannot view the record, it must not appear

**Examples**:

| Search Result | Action |
|---------------|--------|
| `CUST-000001` | Open Customers page and Customer drawer in View mode |
| Customer contact email | Open related Customer drawer and activate Contacts tab |
| Customer address / Makani / PO Box result | Open related Customer drawer and activate Address / Location tab |
| Customer bank IBAN result | Open related Customer drawer and activate Commercial / Finance tab |
| Trade license document result (later) | Open related parent record drawer and activate Documents tab |
| Vendor result (later) | Open Vendors page and Vendor drawer in View mode |
| Employee result (later) | Open Employees page and Employee drawer in View mode |

**Technical Design Notes**:

Global search results should include enough metadata to open the target:
- `entity_type` - Type of entity (customer, vendor, contact, etc.)
- `entity_id` - Primary key of the entity
- `parent_entity_type` - If result is a child record (e.g., contact)
- `parent_entity_id` - Parent record ID if result is a child record
- `module_route` - Route to the module page (e.g., `/admin/master-data/customers`)
- `target_drawer_mode` - Always `view` for global search results
- `target_tab_id` - Tab to activate when applicable (e.g., `contacts`, `addresses`)
- `display_title` - Primary display text for the result
- `display_subtitle` - Secondary display text (e.g., parent name for child records)
- `matched_field` - Which field matched the search query
- `permission_required` - Permission code needed to view this result

**Deep-Linking Support**:

The global search opening mechanism must support deep-linking or route-state so that the correct module page can open the correct drawer and tab. This may require:
- URL state parameters (e.g., `?drawer=view&id=123&tab=contacts`)
- Route state object passed via navigation
- Event-based communication between global search and module pages

### 30.7 Implementation Status

**DO NOT IMPLEMENT NOW**: Global Search is a future foundation phase.

**Recommended Future Phase**:
```
ERP BASE 002F.3E.3C — Global Search / Command Palette Foundation
```

**Reason**: Focus on Customer module UX first, then expand to other modules, then add global search that works across all completed modules.

---

## 31. AI-READY ERP FOUNDATION STANDARD

### 31.1 Purpose

**Important**: Do not implement AI now. Prepare the ERP so AI can be added safely later.

### 31.2 AI-Ready Foundation Elements

**Current Implementation**:
- ✅ Consistent master data structure
- ✅ Clean reference codes (auto-generated, immutable)
- ✅ Audit logs (complete history of all actions)
- ✅ Permission/RLS model (secure data access)
- ✅ Standard form metadata (predictable field structure)
- ✅ Clear field labels and descriptions
- ✅ Structured validation schemas (Zod)
- ✅ Well-documented modules

**Future Preparation**:
- Global search registry (enables AI to find entities)
- DMS-ready document placeholders (enables AI document extraction)
- User actions and audit trail (enables AI to learn workflows)
- Standardized combobox patterns (enables AI form fill)

### 31.3 Future AI Features (Not Implemented Now)

**AI Form Fill**:
- Upload trade license PDF
- AI extracts: company name, license number, TRN, expiry date, address, contact
- Pre-fills customer form
- User reviews and saves

**AI Document Extraction**:
- Upload VAT certificate, ICV certificate, CICPA registration
- AI extracts key data
- Updates customer compliance fields

**AI Customer/Vendor Summary**:
- Generate executive summary from customer data
- Highlight compliance status, payment history, key contacts

**AI DMS Search**:
- Natural language search across documents
- "Find all expired trade licenses"
- "Show me VAT certificates expiring in next 30 days"

**AI Compliance Expiry Insights**:
- Proactive alerts for expiring licenses
- Risk scoring based on compliance status

**AI Report Generation**:
- "Generate customer aging report"
- "Show top 10 customers by revenue"

**AI Workflow Suggestions**:
- Suggest next action based on entity status
- Recommend contacts to follow up with

**AI Data Quality Warnings**:
- Flag incomplete records
- Suggest data corrections

### 31.4 First Recommended AI Feature

**AI Form Fill / Document Extraction** (After DMS foundation)

**Example Flow**:
1. User opens Add Customer drawer
2. User clicks "Extract from Document" button
3. User uploads trade license PDF
4. AI extracts data and pre-fills form
5. User reviews, corrects if needed, saves

### 31.5 Implementation Timing

**Do NOT implement AI now**.

**Recommended Order**:
1. Complete master data modules (Customers, Vendors, etc.)
2. Implement DMS foundation
3. Implement Global Search foundation
4. Then consider AI features

**Recommended Future Phase**:
```
ERP BASE 002F.Future — AI-Ready ERP Assistant / AI Form Fill Foundation
```

---

## 32. GLOBAL IMPLEMENTATION REPORT REQUIREMENT

### 32.1 Mandatory Report for Each Phase

Every implementation phase MUST produce a report containing:

1. **Executive Summary**
2. **Supabase Connection Confirmation**
3. **Schema Verification Summary**
4. **Files Created/Modified**
5. **Database Changes** (migrations, indexes)
6. **Testing Results** (typecheck, lint, build)
7. **Known Issues/Limitations**
8. **Next Steps**
9. **Status** (PASS/NEEDS CORRECTION/BLOCKED)

### 32.2 Report Template

```markdown
# ERP_BASE_{PHASE}_IMPLEMENTATION_REPORT

**Phase**: ERP BASE {PHASE} — {Title}  
**Date**: {Date}  
**Time**: {Time} (UTC+4)  
**Report Status**: {PASS | NEEDS CORRECTION | BLOCKED}

---

## 1. EXECUTIVE SUMMARY

{Summary of what was implemented}

**Key Achievements**:
- ✅ {Achievement 1}
- ✅ {Achievement 2}

---

## 2. SUPABASE CONNECTION CONFIRMATION

**Connected to live Supabase project**: `https://mmiefuieduzdiiwnqpie.supabase.co`

Live database schema was verified before implementation.

{Schema verification details}

---

## 3. FILES CREATED/MODIFIED

{List of files}

---

## 4. DATABASE CHANGES

{Migrations, indexes, schema changes}

---

## 5. TESTING RESULTS

- TypeScript typecheck: {PASS/FAIL}
- ESLint: {PASS/FAIL}
- Next.js build: {PASS/FAIL}

---

## 6. KNOWN ISSUES/LIMITATIONS

{Any issues or limitations}

---

## 7. NEXT STEPS

{What comes next}

---

## 8. STATUS

✅ **PASS** — {Phase} completed successfully

**END OF REPORT**
```

---

## 33. FUTURE MODULE REUSE INSTRUCTION

### 33.1 How to Use This Guide

When implementing a new module (e.g., Vendors, Subcontractors):

1. **Reference this guide** in planning prompt
2. **Copy Customer module structure** as template
3. **Adapt to entity-specific requirements**
4. **Follow all standards** defined in this guide
5. **Create implementation report** referencing this guide

### 33.2 Module Implementation Checklist

- [ ] Connected to Supabase and verified schema
- [ ] Created entity types/interfaces
- [ ] Created Zod validation schemas
- [ ] Implemented server actions with permissions
- [ ] Created page with ERPDataTable
- [ ] Created drawer form with ERPDrawerForm
- [ ] Implemented all required tabs
- [ ] Implemented child record dialogs (720px width)
- [ ] Added required field markers (red asterisk)
- [ ] Implemented comboboxes (all selects searchable)
- [ ] Implemented Save / Save & Close / Cancel buttons
- [ ] Implemented safe close behavior
- [ ] Added documents placeholder
- [ ] Added audit/system info tab
- [ ] Optimized performance (parallel loading)
- [ ] Tested all modes (Add, Edit, View)
- [ ] Ran typecheck, lint, build
- [ ] Created implementation report

### 33.3 Reusable Components

**Use These Components**:
- `ERPDrawerForm` - Main drawer
- `ERPDrawerSectionNav` - Tab navigation
- `ERPDrawerBody` - Scrollable content
- `ERPDrawerSection` - Individual sections
- `ERPFieldGrid` - Form field layout
- `ERPDrawerFooter` - Button footer
- `ERPDataTable` - Data tables
- `Dialog` - Child record forms (720px standard)
- `LookupCombobox` - Lookup dropdowns
- `CountryCombobox`, `EmirateCombobox`, etc. - Geography comboboxes
- `BankCombobox`, `CurrencyCombobox`, etc. - Finance comboboxes

---

## APPENDIX A: COMPONENT REFERENCE

### ERPDrawerForm
**Path**: `@/components/erp/erp-drawer-form.tsx`  
**Usage**: Main drawer for entity forms  
**Props**: open, onOpenChange, title, subtitle, mode, status, recordNumber

### ERPDataTable
**Path**: `@/components/erp/table/erp-data-table.tsx`  
**Usage**: Data tables with search, filter, sort, pagination  
**Props**: tableId, columns, data, searchPlaceholder

### LookupCombobox (formerly LookupSelect)
**Path**: `@/components/erp/lookup-select.tsx` (to be enhanced)  
**Usage**: Searchable combobox for global lookup values  
**Props**: categoryCode, value, onValueChange, required

### Dialog
**Path**: `@/components/ui/dialog.tsx`  
**Usage**: Modal dialogs for child forms (standard width: 720px)  
**Props**: open, onOpenChange

---

## APPENDIX B: TYPESCRIPT TYPES REFERENCE

### Customer Type Example
```typescript
export interface Customer {
  id: number;
  customer_code: string;
  customer_name_en: string;
  customer_name_ar: string | null;
  customer_type_code: string;
  // ... other fields
  created_at: string;
  created_by: number | null;
  updated_at: string;
  updated_by: number | null;
  is_active: boolean;
  is_locked: boolean;
  is_system: boolean;
  status_code: string;
  sort_order: number;
}

export interface CustomerContact {
  id: number;
  customer_id: number;
  contact_code: string;
  contact_name_en: string;
  // ... other fields
}
```

---

## APPENDIX C: VALIDATION SCHEMA REFERENCE

### Customer Schema Example
```typescript
import { z } from "zod";

export const customerBaseSchema = z.object({
  customer_name_en: z.string().min(1, "Required").max(255),
  customer_name_ar: z.string().max(255).optional().nullable(),
  customer_type_code: z.string().min(1, "Required"),
  industry_type_code: z.string().optional().nullable(),
  customer_segment_code: z.string().optional().nullable(),
  lead_source_code: z.string().optional().nullable(),
  trn: z.string().regex(/^\d{15}$/, "TRN must be 15 digits").optional().nullable(),
  // ... other fields
});

export const createCustomerSchema = customerBaseSchema;

export const updateCustomerSchema = customerBaseSchema.partial().extend({
  id: z.number(),
  is_active: z.boolean().optional(),
});
```

---

## APPENDIX D: SERVER ACTION REFERENCE

### Server Action Template
```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { entitySchema } from "./validation";
import type { ActionResult, Entity } from "./types";

export async function createEntity(input: unknown): Promise<ActionResult<Entity>> {
  try {
    // 1. Validate input
    const validated = entitySchema.parse(input);

    // 2. Get auth context
    const ctx = await getAuthContext();
    if (!ctx.authenticated) {
      return { success: false, error: "Authentication required" };
    }

    // 3. Check permission
    if (!hasPermission(ctx, "module.entity.manage")) {
      return { success: false, error: "Permission denied" };
    }

    // 4. Create Supabase client
    const supabase = await createClient();

    // 5. Generate code (if applicable)
    const numberingResult = await generateNextReference({
      documentTypeCode: "ENTITY",
      targetTableName: "entities",
      generationReason: "Entity creation",
    });

    if (!numberingResult.success) {
      return { success: false, error: "Failed to generate code" };
    }

    const entity_code = numberingResult.data.generatedReferenceNumber;

    // 6. Insert record
    const { data, error } = await supabase
      .from("entities")
      .insert({
        ...validated,
        entity_code,
        created_by: ctx.profile?.id ?? null,
        updated_by: ctx.profile?.id ?? null,
      })
      .select()
      .single();

    if (error) throw error;

    // 7. Audit log
    await logAudit({
      action: "create",
      module_code: "module",
      entity_type: "entity",
      entity_id: data.id,
      entity_name: data.entity_name_en,
      description: `Created entity ${data.entity_code}`,
      changes: validated,
    });

    // 8. Revalidate path
    revalidatePath("/admin/module/entity");

    return { success: true, data };
  } catch (error) {
    console.error("Create entity error:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to create entity" 
    };
  }
}
```

---

## DOCUMENT APPROVAL

**Reviewed By**: _________________  
**Date**: _________________  
**Status**: ⬜ Approved  ⬜ Needs Revision  ⬜ Rejected  
**Comments**: _________________________________________________

---

## DOCUMENT REVISION HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-06-08 | AI Agent | Initial draft based on Customer module analysis |
| REV1 | 2026-06-08 | AI Agent | Enhanced with Sameer/Dina review: Combobox everywhere, enterprise benchmarking, global search, AI-ready foundation, design system, information architecture, cognitive load, usability friction, accessibility, localization, microcopy standards |
| REV1 Final | 2026-06-08 | AI Agent | Added Global Search Result Action Standard (Section 30.6) - clarified that search results must be actionable and open records directly |

---

## STATUS

✅ **READY FOR SAMEER REVIEW** — Global ERP UI/UX development guide REV1 complete with final global search action standard.

**Date**: June 8, 2026  
**Next Step**: Review and approve guide, then implement Customer UX enhancements

---

**END OF DOCUMENT**
