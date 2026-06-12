# PROMPT_ERP_BASE_002F_3E_3B_2A_IMPLEMENT_BASE_ERPCOMBOBOX_AND_LOOKUPSELECT_WRAPPER

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, notification-engine validation specialist, enterprise ERP UI/UX architect, reusable component architect, shadcn/ui combobox implementation specialist, accessibility reviewer, master-data governance auditor, senior React/Next.js engineer, and Cursor implementation engineer.

## Phase

ERP BASE 002F.3E.3B.2A — Implement Base ERPCombobox and LookupSelect Wrapper

## Prompt Purpose

This is a controlled IMPLEMENTATION prompt.

Implement only the shared base ERPCombobox component and refactor the existing LookupSelect component to internally use ERPCombobox.

This is the first sub-phase of the Global Combobox Foundation.

Do not implement geography comboboxes.

Do not implement finance comboboxes.

Do not modify Customer form code directly.

Do not modify database schema.

Do not create migrations.

Do not apply SQL.

Do not implement remaining 8 select components.

Do not continue to 3B.2B.

---

# 1. Mandatory Standards To Read First

Before implementation, read and follow:

```text
docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md

docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
```

Also review the approved planning files:

```text
ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_UIUX_TECHNICAL_PLAN.md

ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_SQL_REVIEW.sql

ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_RISK_IMPACT_REVIEW.md

ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_NEXT_IMPLEMENTATION_PROMPT_PLAN.md
```

The implementation report must confirm these files were reviewed.

---

# 2. Mandatory Supabase Connection First

Before implementation, connect to the live Supabase project:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

Verify:

```text
global_lookup_categories exists
global_lookup_values exists
RLS is enabled
lookup values are available
Customer lookup categories used by the Customer form exist
No SQL changes are required
```

The implementation report must include:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
Live database schema was inspected before implementing ERPCombobox and LookupSelect wrapper.
```

If Supabase connection fails, stop and create a BLOCKED report.

Do not implement without live verification.

---

# 3. Scope

## In Scope

```text
Create shared base ERPCombobox component.
Create combobox type definitions.
Create combobox index export file.
Refactor LookupSelect to internally use ERPCombobox.
Preserve LookupSelect public component name.
Preserve LookupSelect import path.
Preserve LookupSelect public props.
Preserve LookupSelect loading/empty/disabled/error/clear behavior.
Preserve LookupSelect categoryCode behavior.
Preserve LookupSelect parentValueCode behavior.
Preserve LookupSelect valueField id/code behavior.
Preserve LookupSelect color badge / badge behavior.
Test Customer form lookup fields.
Generate implementation report.
```

## Out of Scope

```text
Geography components:
- CountrySelect
- EmirateSelect
- CitySelect
- AreaZoneSelect

Finance components:
- BankSelect
- CurrencySelect
- PaymentTermSelect
- TaxTypeSelect

Remaining select components:
- PortSelect
- OwnerCompanySelect
- BranchSelect
- UOMCategorySelect
- UnitOfMeasureSelect
- UnitByCategorySelect
- CostCenterSelect
- ProfitCenterSelect

Customer form direct refactor
Required field marker implementation
Save / Save & Close / Cancel implementation
Safe close implementation
Customer drawer performance optimization
Global search implementation
AI implementation
DMS implementation
Database migration
SQL execution
```

---

# 4. Files To Inspect

Inspect existing files before editing:

```text
src/components/erp/lookup-select.tsx

src/components/ui/command.tsx
src/components/ui/popover.tsx
src/components/ui/button.tsx
src/components/ui/select.tsx
src/components/ui/badge.tsx
src/components/ui/label.tsx

src/features/master-data/customers/components/customer-form-drawer.tsx

src/lib/supabase/client.ts
src/lib/supabase/server.ts
src/lib/rbac/check.ts
```

If exact paths differ, find actual paths and document in the report.

---

# 5. Files To Create

Create:

```text
src/components/erp/combobox/erp-combobox.tsx

src/components/erp/combobox/types.ts

src/components/erp/combobox/index.ts
```

---

# 6. Files To Modify

Modify only:

```text
src/components/erp/lookup-select.tsx
```

Modify other files only if absolutely required for import/export compatibility, and document why in the report.

Do not modify Customer form directly unless build errors prove import compatibility requires it. If that happens, document it clearly.

---

# 7. ERPCombobox Base Component Requirements

Create a reusable base component that handles all shared Combobox UI behavior.

## 7.1 ERPComboboxOption Type

Create in:

```text
src/components/erp/combobox/types.ts
```

Recommended structure:

```typescript
export interface ERPComboboxOption {
  value: string | number;
  label: string;
  labelAr?: string | null;
  code?: string | null;
  description?: string | null;
  badge?: string | null;
  colorHex?: string | null;
  icon?: React.ReactNode;
  disabled?: boolean;
  raw?: unknown;
}
```

If React type imports are needed, import type React properly.

## 7.2 ERPComboboxProps Type

Recommended structure:

```typescript
export interface ERPComboboxProps {
  value: string | number | null;
  onValueChange: (value: string | number | null) => void;
  options: ERPComboboxOption[];

  placeholder?: string;
  searchPlaceholder?: string;
  showCode?: boolean;
  language?: 'en' | 'ar';

  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  loading?: boolean;

  error?: string;

  allowClear?: boolean;
  emptyText?: string;
  noResultsText?: string;

  className?: string;
  triggerClassName?: string;
  popoverClassName?: string;

  name?: string;

  renderOption?: (option: ERPComboboxOption, selected: boolean) => React.ReactNode;
  filterFn?: (option: ERPComboboxOption, searchQuery: string) => boolean;
}
```

Cursor may refine types if required by the existing codebase, but behavior must match.

## 7.3 ERPCombobox UI Behavior

ERPCombobox must provide:

```text
button trigger
popover
command/search input
client-side filtering
selected check icon
clear button for optional fields
loading state
empty data state
no results state
disabled state
read-only state
error border styling
consistent height and width
keyboard navigation
ARIA/accessibility basics
```

## 7.4 Required Search Behavior

Default filter must search:

```text
option.code
option.label
option.labelAr
option.description
```

Search must be:

```text
case-insensitive for English/code fields
support Arabic text directly
partial match / contains match
```

## 7.5 Required Display Behavior

When selected:

```text
If language = ar and labelAr exists, display labelAr.
Otherwise display label.
If showCode = true and code exists, display code + " - " + label.
```

## 7.6 Required Clear Behavior

```text
Show clear button only when:
- allowClear is true
- value is not null/undefined/empty
- component is not disabled
- component is not readOnly
- field is not required
```

Clicking clear must:

```text
call onValueChange(null)
stop propagation so it does not open the popover
```

## 7.7 Required Loading / Empty / No Results Behavior

```text
loading=true:
- show loading indicator/text
- do not show normal options

options.length === 0 and !loading:
- show emptyText or "No options available"

search has no results and options.length > 0:
- show noResultsText or "No results found"
```

## 7.8 Required Accessibility Behavior

Include where practical:

```text
role="combobox"
aria-expanded
aria-invalid when error exists
aria-disabled when disabled/readOnly
keyboard navigation through Command component
visible focus ring
```

Do not over-engineer accessibility beyond current shadcn/Command patterns, but follow best practice.

## 7.9 Styling Requirements

Use existing app styling conventions.

Required:

```text
height similar to existing Select trigger
full width by default
consistent border/background
disabled muted styling
error border when error exists
popover width should match trigger width where possible
max popover height around 300px
vertical scroll only
no horizontal scroll
```

---

# 8. LookupSelect Refactor Requirements

Refactor:

```text
src/components/erp/lookup-select.tsx
```

LookupSelect must remain the public wrapper component.

## 8.1 Preserve Public API

Do not change public component name:

```typescript
export function LookupSelect(...)
```

or existing export style.

Do not change import path:

```text
@/components/erp/lookup-select
```

Do not break current usage in Customer form.

## 8.2 Preserve Existing Props

Preserve all existing props, including:

```text
categoryCode
value
onValueChange
placeholder
disabled
required
includeInactive
parentValueCode
language
showCode
showColor
allowClear
valueField
className
name
error
```

If there are more props in the actual file, preserve them too.

## 8.3 Preserve valueField Behavior

LookupSelect supports:

```text
valueField = "id"
valueField = "code"
```

If `valueField = "id"`:

```text
option.value = lookup value id
onValueChange returns id
```

If `valueField = "code"`:

```text
option.value = value_code
onValueChange returns value_code
```

This behavior must not change.

## 8.4 Preserve parentValueCode Filtering

If `parentValueCode` is provided:

```text
lookup values must be filtered by parentValueCode exactly as before
```

Do not break hierarchical lookup behavior.

## 8.5 Preserve Color / Badge Behavior

If current LookupSelect supports:

```text
showColor
color_hex
badge_variant
is_default
icon
```

preserve visual rendering in the dropdown results and selected value where applicable.

Use ERPCombobox `renderOption` if needed.

## 8.6 Mapping global_lookup_values to ERPComboboxOption

Map lookup values to options similar to:

```typescript
const options = lookupValues.map((item) => ({
  value: valueField === "code" ? item.value_code : item.id,
  label: item.value_label_en,
  labelAr: item.value_label_ar,
  code: item.value_code,
  colorHex: item.color_hex,
  badge: item.badge_variant,
  raw: item,
}));
```

Adapt to actual field names from current source/types.

Important:

```text
Use value_label_en and value_label_ar if those are the actual fields.
Do not invent value_name_en.
```

## 8.7 Search Fields

LookupSelect through ERPCombobox must search:

```text
value_code
value_label_en
value_label_ar
description if available
```

## 8.8 Loading / Empty / Disabled / Error

Preserve existing behavior and messages where possible.

Required:

```text
loading state works
empty state works
disabled/view mode works
error border/message works
clear button works for optional fields
clear button hidden for required fields
```

---

# 9. Customer Form Tests Required

After implementation, test LookupSelect in actual Customer form.

Test these fields in Customer drawer:

## Basic Info tab

```text
Customer Type — required
Industry Type — optional
Customer Segment — optional
Lead Source — optional
Status — required
```

## UAE Compliance tab

```text
ICV Status — optional
```

## Child forms if they use LookupSelect

If Customer child forms currently use LookupSelect, test them too:

```text
Contact Type
Designation
Department
Address Type
Bank Account Type
```

If these are not yet using LookupSelect, document that they were not applicable.

---

# 10. Specific Functional Tests

Perform or document these tests:

```text
Open Customers page
Open Add Customer drawer
Verify lookup fields display as Combobox behavior
Click Customer Type
Search by code
Search by English label
Search by Arabic label if data exists
Select value
Verify selected value displays
Verify clear button hidden for required Customer Type
Verify clear button works for optional Industry Type
Verify Status color/badge still displays if applicable
Open Edit Customer drawer
Verify existing selected lookup values display correctly
Open View Customer drawer
Verify LookupSelect comboboxes are disabled/read-only
Verify keyboard navigation works:
- Enter opens
- arrow keys navigate
- Enter selects
- Escape closes
Verify no console errors
Verify no horizontal scroll
```

---

# 11. Build / Quality Tests Required

Run:

```bash
npm run typecheck
npm run lint
npm run build
```

If any fail, fix before report.

Do not mark PASS if typecheck/lint/build fail.

---

# 12. Browser / Manual Testing

Use Playwright if available.

If Playwright is not available, perform manual browser tests and document clearly.

If browser tests cannot be performed, mark report as:

```text
PASS WITH NOTES
```

not full PASS.

---

# 13. Required Implementation Report

Create:

```text
ERP_BASE_002F_3E_3B_2A_BASE_ERPCOMBOBOX_AND_LOOKUPSELECT_IMPLEMENTATION_REPORT.md
```

The report must include:

1. Phase name.
2. Date/time.
3. Supabase connection confirmation.
4. Standards files read confirmation.
5. Files created.
6. Files modified.
7. ERPCombobox base component summary.
8. LookupSelect wrapper refactor summary.
9. Backward compatibility confirmation.
10. valueField id/code behavior confirmation.
11. parentValueCode behavior confirmation.
12. color/badge behavior confirmation.
13. Customer form testing results.
14. Keyboard/accessibility testing results.
15. Typecheck result.
16. Lint result.
17. Build result.
18. Browser/manual testing result.
19. Known notes/limitations.
20. Final status.

Final status must be exactly one of:

```text
PASS — 3B.2A ERPCombobox base and LookupSelect wrapper implemented and verified successfully.
PASS WITH NOTES — 3B.2A implemented with non-blocking notes.
FAIL — 3B.2A requires correction before approval.
BLOCKED — 3B.2A could not be completed due to blocking issue.
```

---

# 14. Stop Condition

After implementing ERPCombobox and LookupSelect wrapper, testing, and creating the report, stop.

Do not continue to:

```text
3B.2B — Geography Select Wrappers
```

Do not implement finance wrappers.

Do not implement remaining wrappers.

Wait for Sameer/Dina review and approval.

---

# Final Instruction

Read both standards guides.

Connect to Supabase.

Create ERPCombobox base component.

Refactor LookupSelect wrapper only.

Run tests.

Create implementation report.

Stop.
