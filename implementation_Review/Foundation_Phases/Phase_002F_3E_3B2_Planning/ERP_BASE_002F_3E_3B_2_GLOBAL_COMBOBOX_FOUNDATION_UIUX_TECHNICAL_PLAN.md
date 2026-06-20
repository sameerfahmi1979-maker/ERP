# ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_UIUX_TECHNICAL_PLAN

**Document Type**: Planning / Review-Only Document (Implementation Plan)  
**Phase**: ERP BASE 002F.3E.3B.2 — Global Combobox Foundation in Shared Components  
**Planning Date**: Monday, June 8, 2026  
**Status**: READY FOR SAMEER REVIEW

---

## DOCUMENT PURPOSE

This document provides a detailed UI/UX and technical implementation plan for establishing a **global Combobox foundation** across all ERP forms, replacing traditional non-searchable Select dropdowns with searchable Combobox components.

**This is a PLANNING/REVIEW-ONLY document.**  
No implementation has been performed.  
No database changes have been made.  
No application source code has been modified.

---

## 1. PHASE INFORMATION

### 1.1 Phase Details

**Phase ID**: ERP BASE 002F.3E.3B.2  
**Phase Name**: Global Combobox Foundation in Shared Components  
**Phase Type**: PLANNING / REVIEW-FILES-ONLY  
**Complexity**: HIGH RISK (affects 17 existing components, used across multiple forms)

### 1.2 Supabase Connection Confirmation

✅ **Connected to live Supabase project**: `https://mmiefuieduzdiiwnqpie.supabase.co`

**Live database schema was inspected before planning the Global Combobox Foundation.**

**Verified Tables**:
- `global_lookup_categories` (43 categories, RLS enabled)
- `global_lookup_values` (278 values, RLS enabled)
- `countries` (250 records, RLS enabled)
- `emirates` (16 records, RLS enabled)
- `cities` (24 records, RLS enabled)
- `areas_zones` (22 records, RLS enabled)
- `banks` (35 records, RLS enabled)
- `currencies` (162 records, RLS enabled)
- `payment_terms` (8 records, RLS enabled)
- `tax_types` (5 records, RLS enabled)

**Verified Indexes**: All master data tables have appropriate indexes on code, is_active, sort_order, and foreign key fields. No additional indexes required for combobox search functionality (see SQL Review file for details).

### 1.3 Mandatory Standards Confirmation

✅ **Both mandatory standards were read and referenced**:

1. **`docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md`** (REV1)
   - Phase-gated workflow confirmed
   - Supabase verification completed
   - Source of truth hierarchy followed
   - Review-only planning approach enforced

2. **`docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md`** (REV1)
   - Section 11: "Global Combobox Standard (Everywhere)" reviewed
   - Mandatory combobox requirement confirmed
   - Search by code, English name, Arabic name required
   - Keyboard navigation, clear option, loading/empty states required
   - Consistent styling and accessibility readiness required

---

## 2. CURRENT SELECT/DROPDOWN INVENTORY

### 2.1 Inventory Summary

**Total Select Components Found**: 17

**Component Categories**:
- Lookup/Master Data: 1 component (`LookupSelect`)
- Geography: 4 components (Country, Emirate, City, Area/Zone)
- Finance Basics: 5 components (Bank, Currency, PaymentTerm, TaxType, CostCenter, ProfitCenter)
- UOM: 3 components (UOMCategory, UnitOfMeasure, UnitByCategory)
- Organizations: 2 components (OwnerCompany, Branch)
- Geography Extended: 1 component (Port)

### 2.2 Detailed Component Analysis

#### Component 1: LookupSelect

**File Path**: `src/components/erp/lookup-select.tsx`  
**Current Implementation**: shadcn Select (non-searchable dropdown)  
**Data Source**: `global_lookup_values` via `useLookupValues` hook  
**Currently Searchable**: ❌ No  
**Supports Clear Option**: ✅ Yes (via `allowClear` prop)  
**Supports Loading State**: ✅ Yes (spinner)  
**Supports Empty State**: ✅ Yes ("No options available")  
**Supports Disabled/Read-Only**: ✅ Yes (via `disabled` prop)  
**Used By**: Customer form (Basic Info tab: 6 lookup fields)  
**Risk Level**: 🔴 **HIGH** — Most widely used component, affects multiple forms

**Current Props**:
```typescript
{
  categoryCode: string;
  value: number | string | null;
  onValueChange: (value: number | string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  includeInactive?: boolean;
  parentValueCode?: string | null;
  language?: 'en' | 'ar';
  showCode?: boolean;
  showColor?: boolean;
  allowClear?: boolean;
  valueField?: 'id' | 'code';
  className?: string;
  name?: string;
  error?: string;
}
```

**Current Behavior**:
- Loads lookup values by category code from `global_lookup_values`
- Supports hierarchical parent-child filtering
- Displays color badges for status/priority values
- Shows English/Arabic labels
- Optional code prefix display
- Clear button for optional fields

**Target Combobox Behavior**:
- **Add**: Search by `value_code`, `value_label_en`, `value_label_ar`
- **Add**: Keyboard navigation (Arrow keys, Enter, Escape)
- **Keep**: All existing props and behavior
- **Keep**: Color badges, icon support, hierarchical filtering
- **Enhance**: Immediate visual feedback on search (no results message)

---

#### Component 2: CountrySelect

**File Path**: `src/components/erp/geography/country-select.tsx`  
**Current Implementation**: shadcn Select (non-searchable dropdown)  
**Data Source**: `countries` table via direct Supabase query  
**Currently Searchable**: ❌ No  
**Supports Clear Option**: ✅ Yes (via `allowClear` prop)  
**Supports Loading State**: ✅ Yes (spinner)  
**Supports Empty State**: ✅ Yes ("No countries available")  
**Supports Disabled/Read-Only**: ✅ Yes (via `disabled` prop)  
**Used By**: Customer form (Address/Location tab)  
**Risk Level**: 🟡 **MEDIUM** — Used in cascading geography selects

**Current Props**:
```typescript
{
  value: number | null;
  onValueChange: (value: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  gccOnly?: boolean;
  includeInactive?: boolean;
  language?: 'en' | 'ar';
  showCode?: boolean;
  allowClear?: boolean;
  className?: string;
  name?: string;
  error?: string;
}
```

**Current Behavior**:
- Loads active countries, optionally filtered to GCC only
- Displays English/Arabic names
- Optional country code prefix
- Ordered by sort_order then name_en

**Target Combobox Behavior**:
- **Add**: Search by `country_code`, `name_en`, `name_ar`
- **Add**: Keyboard navigation
- **Keep**: GCC filtering, language support, clear option
- **Keep**: All existing props

---

#### Component 3: EmirateSelect

**File Path**: `src/components/erp/geography/emirate-select.tsx`  
**Current Implementation**: shadcn Select (non-searchable dropdown)  
**Data Source**: `emirates` table via direct Supabase query  
**Currently Searchable**: ❌ No  
**Supports Clear Option**: ✅ Yes (via `allowClear` prop)  
**Supports Loading State**: ✅ Yes (spinner)  
**Supports Empty State**: ✅ Yes ("No regions found for selected country")  
**Supports Disabled/Read-Only**: ✅ Yes (via `disabled` prop)  
**Used By**: Customer form (Address/Location tab, cascaded from Country)  
**Risk Level**: 🟡 **MEDIUM** — Part of cascading geography chain

**Current Props**:
```typescript
{
  value: number | null;
  onValueChange: (value: number | null) => void;
  countryId: number | null; // Cascading filter
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  includeInactive?: boolean;
  language?: 'en' | 'ar';
  showCode?: boolean;
  allowClear?: boolean;
  className?: string;
  name?: string;
  error?: string;
}
```

**Current Behavior**:
- Loads regions (emirates/governorates/states) filtered by `country_id`
- Re-fetches when `countryId` changes (cascading behavior)
- Displays English/Arabic names
- Optional emirate code prefix

**Target Combobox Behavior**:
- **Add**: Search by `emirate_code`, `name_en`, `name_ar`
- **Add**: Keyboard navigation
- **Keep**: Cascading filter by `countryId`
- **Keep**: All existing props and behavior
- **Maintain**: Automatic refetch when parent country changes

---

#### Component 4: CitySelect

**File Path**: `src/components/erp/geography/city-select.tsx`  
**Current Implementation**: shadcn Select (non-searchable dropdown)  
**Data Source**: `cities` table via direct Supabase query  
**Currently Searchable**: ❌ No  
**Supports Clear Option**: ✅ Yes (via `allowClear` prop)  
**Supports Loading State**: ✅ Yes (spinner)  
**Supports Empty State**: ✅ Yes  
**Supports Disabled/Read-Only**: ✅ Yes (via `disabled` prop)  
**Used By**: Customer form (Address/Location tab, cascaded from Emirate)  
**Risk Level**: 🟡 **MEDIUM** — Part of cascading geography chain

**Target Combobox Behavior**:
- **Add**: Search by `city_code`, `name_en`, `name_ar`
- **Add**: Keyboard navigation
- **Keep**: Cascading filter by `emirateId`
- **Keep**: All existing props

---

#### Component 5: AreaZoneSelect

**File Path**: `src/components/erp/geography/area-zone-select.tsx`  
**Current Implementation**: shadcn Select (non-searchable dropdown)  
**Data Source**: `areas_zones` table via direct Supabase query  
**Currently Searchable**: ❌ No  
**Supports Clear Option**: ✅ Yes (via `allowClear` prop)  
**Supports Loading State**: ✅ Yes (spinner)  
**Supports Empty State**: ✅ Yes  
**Supports Disabled/Read-Only**: ✅ Yes (via `disabled` prop)  
**Used By**: Customer form (Address/Location tab, cascaded from City)  
**Risk Level**: 🟡 **MEDIUM** — Last in cascading geography chain

**Target Combobox Behavior**:
- **Add**: Search by `area_code`, `name_en`, `name_ar`
- **Add**: Keyboard navigation
- **Keep**: Cascading filter by `cityId`
- **Keep**: All existing props

---

#### Component 6: BankSelect

**File Path**: `src/components/erp/finance-basics/bank-select.tsx`  
**Current Implementation**: shadcn Select (non-searchable dropdown)  
**Data Source**: `banks` table via direct Supabase query  
**Currently Searchable**: ❌ No  
**Supports Clear Option**: ✅ Yes (via `allowClear` prop)  
**Supports Loading State**: ✅ Yes (spinner)  
**Supports Empty State**: ✅ Yes ("No banks available")  
**Supports Disabled/Read-Only**: ✅ Yes (via `disabled` prop)  
**Used By**: Customer Bank Details section (child records dialog)  
**Risk Level**: 🟡 **MEDIUM** — Used in customer bank details

**Target Combobox Behavior**:
- **Add**: Search by `bank_code`, `bank_name_en`, `bank_name_ar`, `short_name`
- **Add**: Keyboard navigation
- **Keep**: All existing props

---

#### Component 7: CurrencySelect

**File Path**: `src/components/erp/finance-basics/currency-select.tsx`  
**Current Implementation**: shadcn Select (non-searchable dropdown)  
**Data Source**: `currencies` table via direct Supabase query  
**Currently Searchable**: ❌ No  
**Supports Clear Option**: ✅ Yes (via `allowClear` prop)  
**Supports Loading State**: ✅ Yes (spinner)  
**Supports Empty State**: ✅ Yes  
**Supports Disabled/Read-Only**: ✅ Yes (via `disabled` prop)  
**Used By**: Customer form (Commercial/Finance tab)  
**Risk Level**: 🟡 **MEDIUM** — Used in finance fields

**Target Combobox Behavior**:
- **Add**: Search by `currency_code`, `currency_name_en`, `currency_name_ar`
- **Add**: Keyboard navigation
- **Keep**: All existing props

---

#### Component 8: PaymentTermSelect

**File Path**: `src/components/erp/finance-basics/payment-term-select.tsx`  
**Current Implementation**: shadcn Select (non-searchable dropdown)  
**Data Source**: `payment_terms` table via direct Supabase query  
**Currently Searchable**: ❌ No  
**Supports Clear Option**: ✅ Yes (via `allowClear` prop)  
**Supports Loading State**: ✅ Yes (spinner)  
**Supports Empty State**: ✅ Yes  
**Supports Disabled/Read-Only**: ✅ Yes (via `disabled` prop)  
**Used By**: Customer form (Commercial/Finance tab)  
**Risk Level**: 🟡 **MEDIUM** — Used in finance fields

**Target Combobox Behavior**:
- **Add**: Search by `term_code`, `term_name_en`, `term_name_ar`
- **Add**: Keyboard navigation
- **Keep**: All existing props

---

#### Component 9: TaxTypeSelect

**File Path**: `src/components/erp/finance-basics/tax-type-select.tsx`  
**Current Implementation**: shadcn Select (non-searchable dropdown)  
**Data Source**: `tax_types` table via direct Supabase query  
**Currently Searchable**: ❌ No  
**Supports Clear Option**: ✅ Yes (via `allowClear` prop)  
**Supports Loading State**: ✅ Yes (spinner)  
**Supports Empty State**: ✅ Yes  
**Supports Disabled/Read-Only**: ✅ Yes (via `disabled` prop)  
**Used By**: Customer form (Commercial/Finance tab)  
**Risk Level**: 🟡 **MEDIUM** — Used in finance fields

**Target Combobox Behavior**:
- **Add**: Search by `tax_code`, `tax_type_name_en`, `tax_type_name_ar`
- **Add**: Keyboard navigation
- **Keep**: All existing props

---

#### Components 10-17: Additional Components (Not Used in Customer Form Yet)

**File Paths**:
- `src/components/erp/geography/port-select.tsx`
- `src/components/erp/organizations/owner-company-select.tsx`
- `src/components/erp/organizations/branch-select.tsx`
- `src/components/erp/uom/uom-category-select.tsx`
- `src/components/erp/uom/unit-of-measure-select.tsx`
- `src/components/erp/uom/unit-by-category-select.tsx`
- `src/components/erp/finance-basics/cost-center-select.tsx`
- `src/components/erp/finance-basics/profit-center-select.tsx`

**Risk Level**: 🟢 **LOW** — Not currently used in Customer form, can be enhanced in later phases

**Recommendation**: Apply combobox foundation to all 9 customer-facing components first (Phase 3B.2A-2D), then enhance remaining 8 components in a separate phase (Phase 3B.2E).

---

## 3. TARGET GLOBAL COMBOBOX STANDARD

### 3.1 Core Combobox Behavior

All comboboxes in the ERP must support these features:

#### 3.1.1 Search Functionality

✅ **Search by Code**  
- Example: Search "CUST" finds "CUSTOMER_TYPE_CORPORATE" in `global_lookup_values.value_code`
- Example: Search "AE" finds "UAE" in `countries.country_code`

✅ **Search by English Name/Label**  
- Example: Search "United Arab" finds "United Arab Emirates" in `countries.name_en`
- Example: Search "Corporate" finds "Corporate Customer" in `global_lookup_values.value_label_en`

✅ **Search by Arabic Name/Label** (where available)  
- Example: Search "الإمارات" finds "United Arab Emirates" in `countries.name_ar`
- Example: Search by Arabic label in `global_lookup_values.value_label_ar`

✅ **Case-Insensitive Search**  
- "uae", "UAE", "Uae" all match "United Arab Emirates"

✅ **Partial Match / Contains Search**  
- "Arab" matches "United Arab Emirates"
- "CORP" matches "CUSTOMER_TYPE_CORPORATE"

#### 3.1.2 Keyboard Navigation

✅ **Arrow Keys** (Up/Down)  
- Navigate through filtered results

✅ **Enter Key**  
- Select highlighted option
- Close popover

✅ **Escape Key**  
- Close popover without selecting
- Clear search input

✅ **Tab Key**  
- Move to next form field
- Close popover without selecting if nothing highlighted

#### 3.1.3 Visual States

✅ **Loading State**  
- Spinner icon with "Loading..." text
- Combobox trigger disabled during load

✅ **Empty State (No Results)**  
- "No results found" message when search returns no matches
- Clear search option or instruction to modify search

✅ **Empty State (No Data)**  
- "No options available" message when data source is empty
- Different from "no results found" (data exists but search doesn't match)

✅ **Disabled State**  
- Combobox trigger visually disabled (muted background, no hover)
- Cannot open popover
- Used in View mode or when dependent field is not selected

✅ **Read-Only State** (same as Disabled in current implementation)  
- Combobox trigger visually disabled
- Cannot open popover
- Used in View mode

✅ **Clear Option**  
- X button appears when value is selected and field is optional (`allowClear` prop)
- Click X to clear selection and reset to placeholder
- X button hidden in disabled/read-only mode

#### 3.1.4 Required Field Compatibility

✅ **Required Marker Integration**  
- Red asterisk `*` displayed on Label (not in combobox component itself)
- Combobox component receives `required` prop for HTML validation
- Error state compatible with form validation

✅ **Error/Validation Display**  
- Red border around trigger when `error` prop is provided
- Error message displayed below combobox
- ARIA attributes for screen reader accessibility

#### 3.1.5 Styling and Layout

✅ **Consistent Width**  
- Trigger width: 100% of parent container (responsive)
- Popover width: Matches trigger width

✅ **No Horizontal Scroll**  
- Long option labels wrap or truncate with ellipsis
- Popover content never causes horizontal scrolling

✅ **Consistent Height**  
- Trigger height: 40px (h-10 in Tailwind, matching existing shadcn Select)
- Maximum popover height: 300px with vertical scroll

✅ **Popover Positioning**  
- Default: Below trigger, aligned to start
- Auto-flip: Above trigger if insufficient space below
- Always within viewport (no clipping)

#### 3.1.6 Accessibility (ARIA Readiness)

✅ **Role Attributes**  
- `role="combobox"` on trigger
- `aria-expanded` reflects popover state
- `aria-controls` links to popover ID

✅ **Keyboard Accessible**  
- All interactions possible without mouse
- Focus visible indicators

✅ **Screen Reader Labels**  
- Proper label association via `htmlFor` or `aria-labelledby`
- Error messages associated with `aria-describedby`

✅ **Color Independence**  
- Do not rely on color alone for state indication
- Use icons, borders, and text for state communication

#### 3.1.7 Responsive Behavior

✅ **Desktop (≥1024px)**  
- Popover opens below/above trigger
- Full keyboard navigation

✅ **Tablet (768px-1023px)**  
- Same behavior as desktop
- Touch-friendly trigger size

✅ **Mobile (<768px)**  
- Same behavior as desktop
- Touch-friendly trigger size
- Popover may cover more screen area but still positioned relative to trigger

---

## 4. RECOMMENDED COMPONENT ARCHITECTURE

### 4.1 Architecture Decision: Shared ERPCombobox Base Component ✅ APPROVED

**Approach**: Create one shared **ERPCombobox** base component, then refactor existing `*Select` components to internally use ERPCombobox **while keeping filenames, exports, and APIs unchanged**.

**Rationale**:
1. **Backward Compatibility**: All existing component imports remain valid (`LookupSelect`, `CountrySelect`, etc.)
2. **Minimal Breaking Changes**: Props remain unchanged, only internal implementation uses ERPCombobox
3. **Code Reuse**: One place for all shared Combobox UI behavior (trigger, popover, search, keyboard, accessibility)
4. **Reduced Risk**: No need to find/replace 50+ component references across forms
5. **Lower Maintenance Cost**: Fix bugs once in ERPCombobox, all wrappers benefit
6. **Consistent UX**: All comboboxes behave identically (styling, keyboard, loading states)
7. **Future-Ready**: Easy to add new wrappers (CustomerSelect, VendorSelect, etc.)

**Implementation Strategy**:
- Create `src/components/erp/combobox/erp-combobox.tsx` as shared base component
- Refactor existing `*Select` components to use ERPCombobox internally
- Keep all existing props (`value`, `onValueChange`, `disabled`, `required`, etc.)
- Keep all existing component names, exports, and import paths
- Maintain all existing specialized behavior (color badges, cascading, hierarchical filtering)

---

### 4.2 Shared ERPCombobox Base Component

**File Path**: `src/components/erp/combobox/erp-combobox.tsx`

**Purpose**: Provides all shared Combobox UI behavior for all ERP select components.

**Responsibilities**:
- Trigger button with chevron icon
- Popover positioning and auto-flip
- Command/search input
- Option filtering (client-side)
- Selected check icon
- Empty state ("No options available")
- No results state ("No results found")
- Loading state (spinner)
- Clear button (X) for optional fields
- Disabled/read-only state
- Error styling (red border)
- Keyboard behavior (Arrow keys, Enter, Escape, Tab)
- ARIA/accessibility attributes
- Consistent sizing and styling (h-10, border, etc.)

#### 4.2.1 ERPComboboxOption Interface

**Recommended Interface**:
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
  raw?: unknown; // Original data for specialized wrapper logic
}
```

**Purpose**:
- Generic option shape that all wrappers map their data to
- Supports code prefix, English/Arabic labels, color badges, icons
- Flexible enough for lookup values, geography, finance, future entities

#### 4.2.2 ERPCombobox Props

**Recommended Interface**:
```typescript
export interface ERPComboboxProps {
  // Core
  value: string | number | null;
  onValueChange: (value: string | number | null) => void;
  options: ERPComboboxOption[];
  
  // Display
  placeholder?: string;
  searchPlaceholder?: string;
  showCode?: boolean;
  language?: 'en' | 'ar';
  
  // States
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  loading?: boolean;
  
  // Validation
  error?: string;
  
  // Behavior
  allowClear?: boolean;
  emptyText?: string;
  noResultsText?: string;
  
  // Styling
  className?: string;
  triggerClassName?: string;
  popoverClassName?: string;
  
  // Form
  name?: string;
  
  // Advanced (optional)
  renderOption?: (option: ERPComboboxOption) => React.ReactNode;
  filterFn?: (option: ERPComboboxOption, searchQuery: string) => boolean;
}
```

**Key Features**:
- `options` prop accepts array of ERPComboboxOption (wrappers map their data to this shape)
- `showCode` prop controls code prefix display
- `language` prop controls English/Arabic label selection
- `renderOption` prop allows custom option rendering (for color badges, icons)
- `filterFn` prop allows custom search filtering (default: code + English + Arabic)

#### 4.2.3 ERPCombobox Default Behavior

**Search/Filter**:
```typescript
const defaultFilterFn = (option: ERPComboboxOption, query: string) => {
  const q = query.toLowerCase();
  return (
    (option.code && option.code.toLowerCase().includes(q)) ||
    option.label.toLowerCase().includes(q) ||
    (option.labelAr && option.labelAr.includes(query))
  );
};
```

**Keyboard**:
- Arrow Down/Up: Navigate options
- Enter: Select highlighted option
- Escape: Close popover, clear search
- Tab: Move to next field, close popover

**Display Label**:
```typescript
const displayLabel = (option: ERPComboboxOption) => {
  const label = language === 'ar' && option.labelAr ? option.labelAr : option.label;
  return showCode && option.code ? `${option.code} - ${label}` : label;
};
```

---

### 4.3 Wrapper Component Strategy

All existing `*Select` components become thin wrappers that:
1. Fetch data from their respective sources (Supabase, hooks)
2. Map fetched data to `ERPComboboxOption[]`
3. Preserve their existing specialized props and behavior
4. Pass mapped options to ERPCombobox
5. Keep their existing component names and exports

#### 4.3.1 LookupSelect Wrapper

**File Path**: `src/components/erp/lookup-select.tsx` (existing file, refactored internally)

**Wrapper Responsibilities**:
- Fetch data from `global_lookup_values` via `useLookupValues` hook
- Handle `categoryCode`, `parentValueCode`, `valueField` (id/code) props
- Map lookup rows to ERPComboboxOption:
  ```typescript
  const options: ERPComboboxOption[] = values.map(v => ({
    value: valueField === 'code' ? v.value_code : v.id,
    label: v.value_label_en,
    labelAr: v.value_label_ar,
    code: v.value_code,
    colorHex: v.color_hex,
    badge: v.badge_variant,
    raw: v
  }));
  ```
- Custom renderOption for color badges and "Default" badge
- Pass to ERPCombobox

**Preserved Behavior**:
- Color badges via custom `renderOption`
- Hierarchical filtering via `parentValueCode`
- `valueField` prop (id or code)
- All existing props unchanged

---

#### 4.3.2 Geography Wrappers

**CountrySelect** (`src/components/erp/geography/country-select.tsx`):
- Fetch countries from `countries` table
- Map to ERPComboboxOption:
  ```typescript
  const options: ERPComboboxOption[] = countries.map(c => ({
    value: c.id,
    label: c.name_en,
    labelAr: c.name_ar,
    code: c.country_code,
    raw: c
  }));
  ```
- Handle `gccOnly` prop (filter before mapping)
- Pass to ERPCombobox

**EmirateSelect** (`src/components/erp/geography/emirate-select.tsx`):
- Fetch emirates filtered by `countryId` from `emirates` table
- Map to ERPComboboxOption (code: emirate_code, label: name_en, labelAr: name_ar)
- Re-fetch when `countryId` changes (cascading behavior preserved)
- Pass to ERPCombobox

**CitySelect** (`src/components/erp/geography/city-select.tsx`):
- Fetch cities filtered by `emirateId` from `cities` table
- Map to ERPComboboxOption (code: city_code, label: name_en, labelAr: name_ar)
- Re-fetch when `emirateId` changes
- Pass to ERPCombobox

**AreaZoneSelect** (`src/components/erp/geography/area-zone-select.tsx`):
- Fetch areas_zones filtered by `cityId` from `areas_zones` table
- Map to ERPComboboxOption (code: area_code, label: name_en, labelAr: name_ar)
- Re-fetch when `cityId` changes
- Pass to ERPCombobox

**Preserved Behavior**: Cascading logic (parent change triggers child re-fetch and reset) preserved in wrapper state management

---

#### 4.3.3 Finance Wrappers

**BankSelect** (`src/components/erp/finance-basics/bank-select.tsx`):
- Fetch banks from `banks` table
- Map to ERPComboboxOption:
  ```typescript
  const options: ERPComboboxOption[] = banks.map(b => ({
    value: b.id,
    label: b.bank_name_en,
    labelAr: b.bank_name_ar,
    code: b.bank_code,
    description: b.short_name, // Used in search
    raw: b
  }));
  ```
- Custom filterFn to include `short_name` in search
- Pass to ERPCombobox

**CurrencySelect** (`src/components/erp/finance-basics/currency-select.tsx`):
- Fetch currencies from `currencies` table
- Map to ERPComboboxOption (code: currency_code, label: currency_name_en, labelAr: currency_name_ar)
- Pass to ERPCombobox

**PaymentTermSelect** (`src/components/erp/finance-basics/payment-term-select.tsx`):
- Fetch payment_terms from `payment_terms` table
- Map to ERPComboboxOption (code: term_code, label: term_name_en, labelAr: term_name_ar)
- Pass to ERPCombobox

**TaxTypeSelect** (`src/components/erp/finance-basics/tax-type-select.tsx`):
- Fetch tax_types from `tax_types` table
- Map to ERPComboboxOption (code: tax_code, label: tax_type_name_en, labelAr: tax_type_name_ar)
- Pass to ERPCombobox

---

### 4.4 Benefits of Shared ERPCombobox Architecture

✅ **Single Source of Truth**: One place to fix keyboard behavior, styling, accessibility, empty/loading states, clear button  
✅ **Less Repeated Code**: Popover + Command logic written once, not 17 times  
✅ **Lower Maintenance Cost**: Bug fix in ERPCombobox automatically fixes all 17 wrappers  
✅ **Consistent UX**: All comboboxes behave identically across all modules  
✅ **Backward Compatible**: Existing imports remain valid (`LookupSelect`, `CountrySelect`, etc.)  
✅ **Easy to Extend**: Adding CustomerSelect, VendorSelect is just a new wrapper  
✅ **Testable**: ERPCombobox can be unit tested independently  
✅ **Future-Ready**: Easy to enhance all comboboxes (e.g., add pagination, virtualization)

---

### 4.5 Recommended Folder Structure

**New Structure**:
```
src/components/erp/
├── combobox/                          # NEW
│   ├── erp-combobox.tsx              # NEW: Shared base component
│   ├── types.ts                       # NEW: ERPComboboxOption, ERPComboboxProps
│   └── index.ts                       # NEW: Exports
├── lookup-select.tsx                  # REFACTORED: Wrapper using ERPCombobox
├── geography/
│   ├── country-select.tsx             # REFACTORED: Wrapper using ERPCombobox
│   ├── emirate-select.tsx             # REFACTORED: Wrapper using ERPCombobox
│   ├── city-select.tsx                # REFACTORED: Wrapper using ERPCombobox
│   └── area-zone-select.tsx           # REFACTORED: Wrapper using ERPCombobox
├── finance-basics/
│   ├── bank-select.tsx                # REFACTORED: Wrapper using ERPCombobox
│   ├── currency-select.tsx            # REFACTORED: Wrapper using ERPCombobox
│   ├── payment-term-select.tsx        # REFACTORED: Wrapper using ERPCombobox
│   └── tax-type-select.tsx            # REFACTORED: Wrapper using ERPCombobox
├── organizations/
│   ├── owner-company-select.tsx       # REFACTORED: Wrapper using ERPCombobox (future)
│   └── branch-select.tsx              # REFACTORED: Wrapper using ERPCombobox (future)
└── uom/
    ├── uom-category-select.tsx        # REFACTORED: Wrapper using ERPCombobox (future)
    ├── unit-of-measure-select.tsx     # REFACTORED: Wrapper using ERPCombobox (future)
    └── unit-by-category-select.tsx    # REFACTORED: Wrapper using ERPCombobox (future)
```

**New Files**:
- `src/components/erp/combobox/erp-combobox.tsx` (base component)
- `src/components/erp/combobox/types.ts` (interfaces)
- `src/components/erp/combobox/index.ts` (exports)

**Refactored Files**: All 17 existing `*Select` components internally refactored to use ERPCombobox

**Imports Remain Unchanged**:
```tsx
import { LookupSelect } from "@/components/erp/lookup-select";
import { CountrySelect } from "@/components/erp/geography";
// ... all existing imports still work
```

---

## 5. BACKWARD COMPATIBILITY PLAN

### 5.1 Preserved Props (100% Backward Compatible)

All existing props must remain unchanged:

✅ **`value`**: `number | string | null` — Selected value (unchanged)  
✅ **`onValueChange`**: `(value: number | string | null) => void` — Selection callback (unchanged)  
✅ **`placeholder`**: `string` — Placeholder text (unchanged)  
✅ **`disabled`**: `boolean` — Disabled state (unchanged)  
✅ **`required`**: `boolean` — HTML validation (unchanged)  
✅ **`className`**: `string` — Custom CSS classes (unchanged)  
✅ **`name`**: `string` — Form field name (unchanged)  
✅ **`error`**: `string` — Error message (unchanged)  
✅ **`allowClear`**: `boolean` — Show clear button (unchanged)  
✅ **`language`**: `'en' | 'ar'` — Display language (unchanged)  
✅ **`showCode`**: `boolean` — Show code prefix (unchanged)  
✅ **`includeInactive`**: `boolean` — Include inactive records (unchanged)

### 5.2 Specialized Props (Component-Specific, Preserved)

✅ **LookupSelect**:
- `categoryCode`, `parentValueCode`, `showColor`, `valueField` — All preserved

✅ **CountrySelect**:
- `gccOnly` — Preserved

✅ **EmirateSelect, CitySelect, AreaZoneSelect**:
- `countryId`, `emirateId`, `cityId` — Cascading filters preserved

### 5.3 Enhanced Behavior (Non-Breaking)

✅ **Search**: New client-side search functionality added, no prop changes required  
✅ **Keyboard Navigation**: New keyboard behavior, no prop changes required  
✅ **Visual Feedback**: Enhanced empty/no-results states, no prop changes required

### 5.4 Customer Form Compatibility

✅ **No Changes Required in Customer Form Code**  
- All existing `LookupSelect`, `CountrySelect`, `BankSelect`, etc. imports remain unchanged
- All existing prop usage remains valid
- Forms automatically benefit from combobox search behavior

✅ **Existing State Management Preserved**  
- Cascading geography logic unchanged
- `useState` for selected values unchanged
- `onValueChange` callbacks unchanged

### 5.5 Testing for Backward Compatibility

After implementation, verify:
- [ ] Customer form opens without errors
- [ ] All select fields render correctly
- [ ] All select fields accept and display values
- [ ] Cascading geography still works (Country → Emirate → City → Area/Zone)
- [ ] Clear buttons work for optional fields
- [ ] Disabled state works in View mode
- [ ] Required field validation works
- [ ] Error messages display correctly

---

## 6. DATA LOADING STRATEGY

### 6.1 Client-Side vs Server-Side Search

**Recommended Rule**:

| Data Source | Strategy | Rationale |
|-------------|----------|-----------|
| **Small/Master Lists** | Client-side filtering | Fast, no server round-trip, master data is small (<1000 records) |
| **Large Entity Lists** | Server-side search | Scalable, reduced client memory, pagination support |

### 6.2 Client-Side Filtering (Recommended for Current Components)

**Applies To**: All 17 existing components (lookup, geography, finance)

**Rationale**:
- `global_lookup_values`: 278 records (small)
- `countries`: 250 records (small)
- `emirates`: 16 records (very small)
- `cities`: 24 records (very small)
- `areas_zones`: 22 records (very small)
- `banks`: 35 records (small)
- `currencies`: 162 records (small)
- `payment_terms`: 8 records (very small)
- `tax_types`: 5 records (very small)

**Implementation**:
1. Load full list on component mount (current behavior)
2. Filter loaded data on client when user types in search input
3. Use `Array.filter()` with case-insensitive `includes()` match
4. No debouncing needed (instant response)

**Example (LookupSelect)**:
```tsx
const filteredValues = values.filter(v =>
  v.value_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
  v.value_label_en.toLowerCase().includes(searchQuery.toLowerCase()) ||
  (v.value_label_ar && v.value_label_ar.includes(searchQuery))
);
```

### 6.3 Server-Side Search (For Future Large Entity Components)

**Applies To**: Future components for large entities (not in this phase):
- `CustomerSelect` (1+ record currently, but will grow)
- `VendorSelect` (0 records currently, but will grow)
- `EmployeeSelect` (not yet implemented)
- `AssetSelect` (not yet implemented)

**Implementation** (for future phases):
- Add debounced search input (300ms)
- Call server action with search query
- Server performs ILIKE search on code + name_en + name_ar
- Return top 50 matches with pagination support
- Show "Type to search..." placeholder

**Not Required in This Phase**: All current components use client-side filtering.

### 6.4 Minimum Search Characters

**Current Components**: No minimum (search starts immediately)  
**Future Large Entity Components**: 2-3 character minimum (e.g., "Type at least 2 characters to search...")

---

## 7. COMPONENT-SPECIFIC IMPLEMENTATION PLANS

### 7.1 LookupSelect / LookupCombobox

**Source Table**: `global_lookup_values`  
**Search Fields**: `value_code`, `value_label_en`, `value_label_ar`  
**Display Label Format**: `{showCode ? value_code + " - " : ""}{language === 'ar' ? value_label_ar : value_label_en}`  
**Value Field**: `id` (number) or `value_code` (string), controlled by `valueField` prop  
**Clear Option Rules**: Show X button when `allowClear={true}` and value is selected  
**Loading/Empty Behavior**:
- Loading: Show spinner in trigger area, "Loading..." text
- Empty: "No options available" when `values.length === 0`
- No Results: "No results found" when filtered list is empty but data exists

**Special Features to Preserve**:
- ✅ Color badges (`showColor`, `color_hex`, `badge_variant`)
- ✅ Hierarchical filtering (`parentValueCode`)
- ✅ Default value indicator (Badge "Default")
- ✅ Icon support (if icon field exists)

**Implementation Risk**: 🔴 **HIGH** — Most complex component, most widely used  
**Test Cases**:
- [ ] Search by `value_code` (e.g., "CORP")
- [ ] Search by `value_label_en` (e.g., "Corporate")
- [ ] Search by `value_label_ar` (if available)
- [ ] Color badges still display in search results
- [ ] Hierarchical filtering still works (e.g., parent-child lookups)
- [ ] Clear button works
- [ ] Loading state during fetch
- [ ] Empty state when no lookups in category

---

### 7.2 CountrySelect / CountryCombobox

**Source Table**: `countries`  
**Search Fields**: `country_code`, `name_en`, `name_ar`  
**Display Label Format**: `{showCode ? country_code + " - " : ""}{language === 'ar' ? name_ar : name_en}`  
**Value Field**: `id` (number)  
**Clear Option Rules**: Show X button when `allowClear={true}` and value is selected  
**Loading/Empty Behavior**:
- Loading: Show spinner in trigger area, "Loading..." text
- Empty: "No countries available" when filtered list is empty
- No Results: "No results found" when search doesn't match

**Special Features to Preserve**:
- ✅ GCC filtering (`gccOnly` prop filters to `is_gcc = true`)
- ✅ Sort order priority (sort_order, then name_en)

**Implementation Risk**: 🟡 **MEDIUM** — Used in cascading geography  
**Test Cases**:
- [ ] Search by `country_code` (e.g., "AE")
- [ ] Search by `name_en` (e.g., "United Arab Emirates")
- [ ] Search by `name_ar` (e.g., "الإمارات")
- [ ] GCC filter works (`gccOnly={true}`)
- [ ] Clear button works
- [ ] Selecting country resets Emirate, City, Area/Zone in Customer form

---

### 7.3 EmirateSelect / EmirateCombobox

**Source Table**: `emirates`  
**Search Fields**: `emirate_code`, `name_en`, `name_ar`  
**Display Label Format**: `{showCode ? emirate_code + " - " : ""}{language === 'ar' ? name_ar : name_en}`  
**Value Field**: `id` (number)  
**Clear Option Rules**: Show X button when `allowClear={true}` and value is selected  
**Loading/Empty Behavior**:
- Loading: Show spinner in trigger area, "Loading..." text
- Empty: "No regions found for selected country" when `countryId` is set but no matches
- No Results: "No results found" when search doesn't match

**Special Features to Preserve**:
- ✅ Cascading filter by `countryId` (re-fetch when parent changes)
- ✅ Sort order priority (sort_order)

**Implementation Risk**: 🟡 **MEDIUM** — Part of cascading chain  
**Test Cases**:
- [ ] Disabled when no country selected
- [ ] Enabled when country selected
- [ ] Search by `emirate_code` (e.g., "DXB")
- [ ] Search by `name_en` (e.g., "Dubai")
- [ ] Search by `name_ar` (if available)
- [ ] Re-fetches when `countryId` changes
- [ ] Clear button works
- [ ] Selecting emirate resets City, Area/Zone in Customer form

---

### 7.4 CitySelect / CityCombobox

**Source Table**: `cities`  
**Search Fields**: `city_code`, `name_en`, `name_ar`  
**Display Label Format**: `{showCode ? city_code + " - " : ""}{language === 'ar' ? name_ar : name_en}`  
**Value Field**: `id` (number)  
**Clear Option Rules**: Show X button when `allowClear={true}` and value is selected  

**Special Features to Preserve**:
- ✅ Cascading filter by `emirateId` (re-fetch when parent changes)

**Implementation Risk**: 🟡 **MEDIUM**  
**Test Cases**:
- [ ] Disabled when no emirate selected
- [ ] Enabled when emirate selected
- [ ] Search by `city_code`, `name_en`, `name_ar`
- [ ] Re-fetches when `emirateId` changes
- [ ] Clear button works
- [ ] Selecting city resets Area/Zone in Customer form

---

### 7.5 AreaZoneSelect / AreaZoneCombobox

**Source Table**: `areas_zones`  
**Search Fields**: `area_code`, `name_en`, `name_ar`  
**Display Label Format**: `{showCode ? area_code + " - " : ""}{language === 'ar' ? name_ar : name_en}`  
**Value Field**: `id` (number)  
**Clear Option Rules**: Show X button when `allowClear={true}` and value is selected  

**Special Features to Preserve**:
- ✅ Cascading filter by `cityId` (re-fetch when parent changes)

**Implementation Risk**: 🟡 **MEDIUM**  
**Test Cases**:
- [ ] Disabled when no city selected
- [ ] Enabled when city selected
- [ ] Search by `area_code`, `name_en`, `name_ar`
- [ ] Re-fetches when `cityId` changes
- [ ] Clear button works

---

### 7.6 BankSelect / BankCombobox

**Source Table**: `banks`  
**Search Fields**: `bank_code`, `bank_name_en`, `bank_name_ar`, `short_name`  
**Display Label Format**: `{showCode ? bank_code + " - " : ""}{language === 'ar' ? bank_name_ar : bank_name_en}`  
**Value Field**: `id` (number)  
**Clear Option Rules**: Show X button when `allowClear={true}` and value is selected  

**Implementation Risk**: 🟡 **MEDIUM**  
**Test Cases**:
- [ ] Search by `bank_code` (e.g., "FAB")
- [ ] Search by `bank_name_en` (e.g., "First Abu Dhabi Bank")
- [ ] Search by `bank_name_ar` (if available)
- [ ] Search by `short_name` (e.g., "FAB")
- [ ] Clear button works

---

### 7.7 CurrencySelect / CurrencyCombobox

**Source Table**: `currencies`  
**Search Fields**: `currency_code`, `currency_name_en`, `currency_name_ar`  
**Display Label Format**: `{showCode ? currency_code + " - " : ""}{language === 'ar' ? currency_name_ar : currency_name_en}`  
**Value Field**: `id` (number)  
**Clear Option Rules**: Show X button when `allowClear={true}` and value is selected  

**Implementation Risk**: 🟡 **MEDIUM**  
**Test Cases**:
- [ ] Search by `currency_code` (e.g., "AED")
- [ ] Search by `currency_name_en` (e.g., "UAE Dirham")
- [ ] Search by `currency_name_ar` (if available)
- [ ] Clear button works

---

### 7.8 PaymentTermSelect / PaymentTermCombobox

**Source Table**: `payment_terms`  
**Search Fields**: `term_code`, `term_name_en`, `term_name_ar`  
**Display Label Format**: `{showCode ? term_code + " - " : ""}{language === 'ar' ? term_name_ar : term_name_en}`  
**Value Field**: `id` (number)  
**Clear Option Rules**: Show X button when `allowClear={true}` and value is selected  

**Implementation Risk**: 🟡 **MEDIUM**  
**Test Cases**:
- [ ] Search by `term_code` (e.g., "NET30")
- [ ] Search by `term_name_en` (e.g., "Net 30 Days")
- [ ] Search by `term_name_ar` (if available)
- [ ] Clear button works

---

### 7.9 TaxTypeSelect / TaxTypeCombobox

**Source Table**: `tax_types`  
**Search Fields**: `tax_code`, `tax_type_name_en`, `tax_type_name_ar`  
**Display Label Format**: `{showCode ? tax_code + " - " : ""}{language === 'ar' ? tax_type_name_ar : tax_type_name_en}`  
**Value Field**: `id` (number)  
**Clear Option Rules**: Show X button when `allowClear={true}` and value is selected  

**Implementation Risk**: 🟡 **MEDIUM**  
**Test Cases**:
- [ ] Search by `tax_code` (e.g., "VAT5")
- [ ] Search by `tax_type_name_en` (e.g., "VAT 5%")
- [ ] Search by `tax_type_name_ar` (if available)
- [ ] Clear button works

---

### 7.10 Future CustomerSelect (Not in This Phase)

**Source Table**: `customers`  
**Search Fields**: `customer_code`, `customer_name_en`, `customer_name_ar`, `trn`, `primary_email`  
**Implementation Strategy**: Server-side search with debouncing (not client-side like other components)  
**Rationale**: Customer list will grow large (1000+ records)

**Not Included in Phase 3B.2**: Customer combobox will be added in a future phase when customer selection is needed in other modules (e.g., Sales Orders, Invoices).

---

## 8. UI/UX IMPLEMENTATION DETAILS

### 8.1 Combobox Trigger Style

**Visual Design**:
- Width: 100% of parent container (responsive)
- Height: 40px (`h-10` in Tailwind)
- Border: 1px solid border color (`border`)
- Background: White (`bg-background`)
- Hover: Subtle background change (`hover:bg-accent hover:text-accent-foreground`)
- Focus: Blue ring (`focus:ring-2 focus:ring-ring focus:ring-offset-2`)
- Disabled: Muted background, no pointer events (`bg-muted cursor-not-allowed`)
- Error: Red border (`border-destructive`)

**Content Layout**:
```
[ Selected Label or Placeholder ] [ Chevron Icon ▼ ]
```

**Icon**: `ChevronsUpDown` from `lucide-react` (matches shadcn combobox example)

### 8.2 Popover Width and Positioning

**Width**: Match trigger width exactly (`w-[--radix-popover-trigger-width]`)  
**Max Height**: 300px with vertical scroll (`max-h-[300px] overflow-y-auto`)  
**Positioning**:
- Default: Below trigger, aligned to start
- Auto-flip: Above trigger if insufficient space below
- Always within viewport

### 8.3 Command Input (Search) Style

**Placeholder**: "Search..." (or localized equivalent)  
**Visual Design**:
- Inside popover, at top
- Border: Bottom border only (`border-b`)
- Padding: `px-3 py-2`
- Focus: No ring (integrated into popover design)

### 8.4 Command List Items Style

**Default Item**:
```
[ Check Icon (if selected) ] [ Label Text ]
```

**Check Icon**: Visible when selected (`opacity-100`), hidden when not selected (`opacity-0`)  
**Hover**: Background highlight (`bg-accent text-accent-foreground`)  
**Keyboard Focus**: Same visual as hover

**Special Styling for LookupSelect**:
```
[ Color Badge (if color_hex) ] [ Label Text with Badge (if badge_variant) ] [ Default Badge (if is_default) ]
```

### 8.5 Empty State Wording

**No Results (Search Returned No Matches)**:
```
No results found.
```

**No Data (Data Source Empty)**:
```
No options available.
```

**Cascaded Parent Not Selected** (e.g., Emirate when Country not selected):
```
Select [parent] first.
```
Example: "Select country first." in EmirateSelect

### 8.6 Loading Wording

**During Data Fetch**:
```
Loading...
```

**In Trigger Area** (if still loading on mount):
```
[ Spinner Icon ] Loading...
```

### 8.7 Clear Option UI

**Position**: Absolute, right side of trigger (before chevron icon)  
**Icon**: `X` from `lucide-react`  
**Style**: Ghost button, small size (`h-6 w-6 p-0`)  
**Visibility**: Show only when `allowClear={true}` AND `value !== null` AND `!disabled`  
**Behavior**: Click clears value, triggers `onValueChange(null)`, closes popover

### 8.8 Keyboard Behavior Details

| Key | Action |
|-----|--------|
| `Enter` (on trigger) | Open popover |
| `Space` (on trigger) | Open popover |
| `Arrow Down` (in search) | Highlight first/next item |
| `Arrow Up` (in search) | Highlight previous item |
| `Enter` (on highlighted item) | Select item, close popover |
| `Escape` | Close popover, clear search, do not select |
| `Tab` | Close popover, move to next form field, do not select |

### 8.9 Focus Behavior

**On Trigger Click**:
1. Open popover
2. Focus on search input immediately

**On Escape**:
1. Clear search input
2. Close popover
3. Return focus to trigger

**On Select**:
1. Close popover
2. Return focus to trigger

**On Tab**:
1. Close popover
2. Move focus to next form field (natural tab order)

### 8.10 Mobile/Tablet Behavior

**Touch Target Size**: Trigger height 40px (minimum 44px recommended for touch, but matching existing UI)  
**Popover**: Same behavior as desktop (no modal overlay, just positioned popover)  
**Keyboard**: Virtual keyboard opens when search input is focused  
**Scroll**: Popover scrollable if list exceeds max height

### 8.11 Validation/Error Integration

**Error State**:
- Red border on trigger (`border-destructive`)
- Error message below combobox (`text-sm text-destructive mt-1`)
- ARIA attribute: `aria-invalid="true"`

**Required Field**:
- HTML `required` attribute on hidden input (for native validation)
- Red asterisk `*` on Label (not in combobox component)

### 8.12 Read-Only Mode Behavior

**View Mode in Customer Form**:
- `disabled={isViewing}` prop set
- Combobox trigger disabled (muted background, no hover, no click)
- Cannot open popover
- Selected value displayed as read-only text

---

## 9. ACCESSIBILITY REQUIREMENTS

### 9.1 ARIA Attributes

✅ **`role="combobox"`** on trigger button  
✅ **`aria-expanded="true"`** when popover open, `"false"` when closed  
✅ **`aria-controls="popover-id"`** linking trigger to popover content  
✅ **`aria-labelledby="label-id"`** or `aria-label` for screen reader label  
✅ **`aria-invalid="true"`** when error prop is provided  
✅ **`aria-describedby="error-id"`** linking to error message element

### 9.2 Keyboard Navigation (Full Compliance)

✅ All interactions possible without mouse  
✅ Visible focus indicators on all interactive elements  
✅ Logical tab order (trigger → next form field, not into popover items)  
✅ Arrow keys navigate within popover  
✅ Escape key closes popover and returns focus to trigger

### 9.3 Screen Reader Support

✅ Proper label association via `<Label htmlFor>` or `aria-labelledby`  
✅ Selected value announced when trigger receives focus  
✅ "X of Y results" announced when search filters list (optional enhancement)  
✅ Error messages associated with combobox via `aria-describedby`  
✅ State changes announced (e.g., "popover expanded", "popover collapsed")

### 9.4 Color Independence

✅ Do not rely on color alone for state indication:
- Error state: Red border **AND** error text **AND** `aria-invalid`
- Disabled state: Muted background **AND** `cursor-not-allowed` **AND** `aria-disabled`
- Selected item: Check icon **AND** highlighted background

### 9.5 Focus Management

✅ Focus visible indicators (blue ring on trigger, highlight on items)  
✅ Focus trap within popover when open (Arrow keys navigate items, Tab closes popover)  
✅ Focus returns to trigger after selection or cancellation

---

## 10. TESTING PLAN

### 10.1 Automated Testing

#### TypeScript Typecheck
```bash
npm run typecheck
```
**Expected**: No type errors

#### ESLint
```bash
npm run lint
```
**Expected**: No linting errors

#### Next.js Build
```bash
npm run build
```
**Expected**: Build succeeds, no warnings

### 10.2 Manual Browser Testing

#### Test Environment
- Browser: Chrome, Firefox, Safari, Edge
- Viewport: Desktop (1920x1080), Tablet (768x1024), Mobile (375x667)
- Mode: Add, Edit, View

#### Test Cases: Customer Form Basic Info Tab

1. **LookupSelect - Customer Type (Required)**
   - [ ] Click trigger, popover opens
   - [ ] Type "CORP" in search, finds "CUSTOMER_TYPE_CORPORATE"
   - [ ] Type "Corporate" in search, finds "Corporate Customer"
   - [ ] Select item, popover closes, value displayed
   - [ ] Clear button NOT shown (required field)
   - [ ] Keyboard: Arrow keys navigate, Enter selects, Escape closes
   - [ ] Color badge displays correctly (if applicable)

2. **LookupSelect - Industry Type (Optional)**
   - [ ] Click trigger, popover opens
   - [ ] Type in search, filters results
   - [ ] Select item, popover closes
   - [ ] Clear button shown (optional field)
   - [ ] Click X, value clears, placeholder shown

3. **LookupSelect - Customer Segment (Optional)**
   - [ ] Same tests as Industry Type

4. **LookupSelect - Lead Source (Optional)**
   - [ ] Same tests as Industry Type

5. **LookupSelect - Status (Required)**
   - [ ] Type "ACTIVE" in search, finds "Active"
   - [ ] Color badge displays correctly

#### Test Cases: Customer Form Address/Location Tab

6. **CountrySelect (Optional)**
   - [ ] Click trigger, popover opens
   - [ ] Type "AE" in search, finds "United Arab Emirates"
   - [ ] Type "United Arab" in search, finds "United Arab Emirates"
   - [ ] Type "الإمارات" in search (if Arabic name exists), finds "United Arab Emirates"
   - [ ] Select UAE, popover closes
   - [ ] Clear button shown, click X to clear
   - [ ] Cascading: Selecting country resets Emirate, City, Area/Zone

7. **EmirateSelect (Optional, Cascaded from Country)**
   - [ ] Disabled when no country selected
   - [ ] Enabled when country selected
   - [ ] Type "DXB" in search, finds "Dubai"
   - [ ] Type "Dubai" in search, finds "Dubai"
   - [ ] Select item, popover closes
   - [ ] Cascading: Selecting emirate resets City, Area/Zone

8. **CitySelect (Optional, Cascaded from Emirate)**
   - [ ] Disabled when no emirate selected
   - [ ] Enabled when emirate selected
   - [ ] Search by code, English name, Arabic name works
   - [ ] Cascading: Selecting city resets Area/Zone

9. **AreaZoneSelect (Optional, Cascaded from City)**
   - [ ] Disabled when no city selected
   - [ ] Enabled when city selected
   - [ ] Search by code, English name, Arabic name works

#### Test Cases: Customer Form Commercial/Finance Tab

10. **CurrencySelect (Optional)**
    - [ ] Type "AED" in search, finds "UAE Dirham"
    - [ ] Type "Dirham" in search, finds "UAE Dirham"
    - [ ] Clear button works

11. **PaymentTermSelect (Optional)**
    - [ ] Type "NET30" in search, finds "Net 30 Days"
    - [ ] Type "30" in search, finds "Net 30 Days"
    - [ ] Clear button works

12. **TaxTypeSelect (Optional)**
    - [ ] Type "VAT" in search, finds "VAT 5%"
    - [ ] Type "5" in search, finds "VAT 5%"
    - [ ] Clear button works

#### Test Cases: Customer Bank Details Section

13. **BankSelect (in child record dialog)**
    - [ ] Type "FAB" in search, finds "First Abu Dhabi Bank"
    - [ ] Type "First Abu" in search, finds "First Abu Dhabi Bank"
    - [ ] Clear button works (if bank is optional)

### 10.3 Edge Case Testing

14. **Empty States**
    - [ ] No results when search doesn't match: "No results found" displayed
    - [ ] No data in lookup category: "No options available" displayed

15. **Loading States**
    - [ ] Spinner shown during initial load
    - [ ] Trigger disabled during load
    - [ ] Search works after data loads

16. **Disabled/Read-Only States**
    - [ ] Trigger disabled in View mode
    - [ ] Cannot open popover in View mode
    - [ ] Selected value displayed as read-only text

17. **Required Field Validation**
    - [ ] HTML required validation works
    - [ ] Red asterisk displayed on Label
    - [ ] Clear button NOT shown for required fields

18. **Error State**
    - [ ] Red border on trigger when error prop provided
    - [ ] Error message displayed below combobox

### 10.4 Cross-Browser Testing

19. **Chrome**
    - [ ] All comboboxes work correctly

20. **Firefox**
    - [ ] All comboboxes work correctly

21. **Safari**
    - [ ] All comboboxes work correctly

22. **Edge**
    - [ ] All comboboxes work correctly

### 10.5 Performance Testing

23. **No Console Errors**
    - [ ] Open browser console
    - [ ] Open Customer form
    - [ ] Interact with all comboboxes
    - [ ] No errors or warnings in console

24. **No Horizontal Scroll**
    - [ ] Resize browser to 320px width (mobile)
    - [ ] Open Customer form
    - [ ] Open all comboboxes
    - [ ] No horizontal scrollbar appears

25. **Popover Positioning**
    - [ ] Open combobox near bottom of viewport
    - [ ] Popover flips above trigger (not clipped)

---

## 11. IMPLEMENTATION SPLIT RECOMMENDATION

### 11.1 Recommended Split: 5 Sub-Phases

Because this is **HIGH RISK** and affects 17 components across multiple forms, implement in small, tested increments.

#### Phase 3B.2A — Create Base ERPCombobox + Convert LookupSelect Wrapper (8 hours)

**Scope**:
- Create `src/components/erp/combobox/erp-combobox.tsx` (base component)
- Create `src/components/erp/combobox/types.ts` (ERPComboboxOption, ERPComboboxProps)
- Create `src/components/erp/combobox/index.ts` (exports)
- Refactor `LookupSelect` to internally use ERPCombobox (wrapper pattern)
- Preserve all LookupSelect props and behavior (color badges, hierarchical filtering, valueField)
- Test on Customer form Basic Info tab (6 lookup fields)
- Verify color badges, hierarchical filtering, all props preserved

**Stop Condition**: ERPCombobox base component works correctly, LookupSelect wrapper works as Combobox in Customer form, all tests pass

**Risk**: 🔴 **HIGH** (base component + most complex wrapper)

---

#### Phase 3B.2B — Convert Geography Select Wrappers (4 hours)

**Scope**:
- Refactor `CountrySelect` to use ERPCombobox internally
- Refactor `EmirateSelect` to use ERPCombobox internally
- Refactor `CitySelect` to use ERPCombobox internally
- Refactor `AreaZoneSelect` to use ERPCombobox internally
- Preserve cascading behavior (Country → Emirate → City → Area/Zone)
- Test on Customer form Address/Location tab
- Verify cascading behavior preserved

**Stop Condition**: All 4 geography wrappers work in Customer form, cascading works

**Risk**: 🟡 **MEDIUM** (cascading behavior must be preserved)

---

#### Phase 3B.2C — Finance Comboboxes (3 hours)

#### Phase 3B.2C — Convert Finance Select Wrappers (3 hours)

**Scope**:
- Refactor `BankSelect` to use ERPCombobox internally
- Refactor `CurrencySelect` to use ERPCombobox internally
- Refactor `PaymentTermSelect` to use ERPCombobox internally
- Refactor `TaxTypeSelect` to use ERPCombobox internally
- Test on Customer form Commercial/Finance tab
- Test on Customer Bank Details child record dialog

**Stop Condition**: All 4 finance wrappers work in Customer form

**Risk**: 🟢 **LOW** (simple wrappers, no cascading)

---

#### Phase 3B.2D — Apply Comboboxes to Customer Forms Final QA (2 hours)

**Scope**:
- Full regression test of Customer form (Add, Edit, View modes)
- Test all tabs, all comboboxes
- Cross-browser testing
- Performance testing (no console errors, no horizontal scroll)

**Stop Condition**: Customer form passes all tests, no regressions

**Risk**: 🟢 **LOW** (QA phase)

---

#### Phase 3B.2E — Convert Remaining Select Wrappers (Optional, Future Phase)

**Scope**:
- Refactor remaining 8 components to use ERPCombobox internally (Port, OwnerCompany, Branch, UOM, CostCenter, ProfitCenter)
- Not used in Customer form yet, but used in other modules

**Stop Condition**: All 17 wrappers refactored to use ERPCombobox

**Risk**: 🟢 **LOW** (not blocking Customer closure)

**Note**: Can be deferred to later phase if not urgent.

---

### 11.2 Total Implementation Effort

**Phase 3B.2A-2D (Customer-Facing Components)**: 17 hours  
**Phase 3B.2E (Remaining Components)**: 4 hours  
**Total**: 21 hours

---

## 12. ACCEPTANCE CRITERIA

### 12.1 Functional Criteria

✅ **AC1**: All 9 customer-facing comboboxes support search by code, English name, Arabic name  
✅ **AC2**: All comboboxes support keyboard navigation (Arrow keys, Enter, Escape)  
✅ **AC3**: All comboboxes display clear button for optional fields  
✅ **AC4**: All comboboxes display loading state during data fetch  
✅ **AC5**: All comboboxes display "No results found" when search returns no matches  
✅ **AC6**: All comboboxes display "No options available" when data source is empty  
✅ **AC7**: All comboboxes are disabled in View mode  
✅ **AC8**: All comboboxes preserve required field validation  
✅ **AC9**: All comboboxes preserve error display  
✅ **AC10**: Cascading geography comboboxes (Country → Emirate → City → Area/Zone) work correctly

### 12.2 Technical Criteria

✅ **AC11**: `npm run typecheck` passes with no errors  
✅ **AC12**: `npm run lint` passes with no errors  
✅ **AC13**: `npm run build` succeeds with no warnings  
✅ **AC14**: No console errors in browser during combobox interactions  
✅ **AC15**: No horizontal scroll in Customer form (tested at 320px width)

### 12.3 Backward Compatibility Criteria

✅ **AC16**: All existing component imports remain unchanged  
✅ **AC17**: All existing component props remain unchanged  
✅ **AC18**: Customer form code unchanged (only component internals enhanced)  
✅ **AC19**: Existing state management logic unchanged  
✅ **AC20**: All existing specialized behavior preserved (color badges, hierarchical filtering, cascading)

### 12.4 UI/UX Criteria

✅ **AC21**: Combobox trigger height is 40px (matching existing Select)  
✅ **AC22**: Popover width matches trigger width  
✅ **AC23**: Popover max height is 300px with vertical scroll  
✅ **AC24**: Check icon appears on selected item  
✅ **AC25**: Focus returns to trigger after selection or cancellation

### 12.5 Accessibility Criteria

✅ **AC26**: All comboboxes have `role="combobox"`  
✅ **AC27**: All comboboxes have `aria-expanded` reflecting state  
✅ **AC28**: All comboboxes have proper label association  
✅ **AC29**: Error messages associated with `aria-describedby`  
✅ **AC30**: Keyboard navigation works without mouse

---

## 13. RISK ASSESSMENT

### 13.1 High-Risk Components

🔴 **LookupSelect**
- **Risk**: Breaking color badges, hierarchical filtering, or valueField logic
- **Mitigation**: Test all existing lookup categories, verify color/badge rendering

🔴 **Cascading Geography Chain**
- **Risk**: Breaking Country → Emirate → City → Area/Zone cascading behavior
- **Mitigation**: Test selection and clear in sequence, verify parent change resets children

### 13.2 Medium-Risk Areas

🟡 **Backward Compatibility**
- **Risk**: Breaking existing component usage in Customer form or other modules
- **Mitigation**: Keep all props unchanged, test Customer form thoroughly

🟡 **Performance**
- **Risk**: Client-side filtering may be slow with large lookup categories
- **Mitigation**: Test with largest category (global_lookup_values has 278 records, acceptable for client-side)

### 13.3 Low-Risk Areas

🟢 **Finance Comboboxes (Bank, Currency, PaymentTerm, TaxType)**
- Simple components with no specialized behavior
- Low data volume (5-162 records)

🟢 **Remaining 8 Components (Not Used in Customer Form Yet)**
- Not blocking Customer closure
- Can be enhanced in separate phase

---

## 14. ROLLBACK STRATEGY

If implementation causes critical breakage:

### Step 1: Identify Broken Component

Isolate which component is causing the issue (e.g., LookupSelect).

### Step 2: Revert Component File

```bash
git checkout HEAD~1 src/components/erp/lookup-select.tsx
```

### Step 3: Test

Run typecheck, lint, build, and manual test Customer form.

### Step 4: Report Issue

Document what broke, why, and what needs to be fixed before re-attempting.

### Step 5: Re-Implement with Fix

Apply fix and re-test in isolated environment before committing.

---

## 15. DECISION POINTS FOR SAMEER/DINA

### Decision 1: Confirm Implementation Split

**Question**: Should we implement all 9 customer-facing components in one phase (3B.2), or split into 4 sub-phases (3B.2A-2D)?

**Recommendation**: Split into 4 sub-phases for lower risk.

**Options**:
- ✅ **Option A**: 4 sub-phases (3B.2A-2D) — Recommended
- ❌ **Option B**: 1 phase (all 9 components together) — Higher risk

**Your Decision**: _________________

---

### Decision 2: Confirm Remaining 8 Components

**Question**: Should the remaining 8 components (Port, OwnerCompany, Branch, UOM, CostCenter, ProfitCenter) be enhanced in this phase or deferred?

**Recommendation**: Defer to Phase 3B.2E (future phase) since they're not blocking Customer closure.

**Options**:
- ✅ **Option A**: Defer to Phase 3B.2E (future) — Recommended
- ❌ **Option B**: Include in Phase 3B.2 — Adds 4 hours, delays Customer closure

**Your Decision**: _________________

---

### Decision 3: Confirm Architecture (Shared ERPCombobox Base Component)

**Question**: Should we enhance existing `*Select` components in-place, or create a shared ERPCombobox base component with wrapper pattern?

**Approved Architecture**: ✅ Shared ERPCombobox base component + thin wrapper pattern

**Rationale**:
- One place to fix keyboard, styling, accessibility, states
- Less repeated code across 17 components
- Lower long-term maintenance cost
- Existing imports remain backward compatible
- Easy to extend with new wrappers

**Implementation**:
- Create `src/components/erp/combobox/erp-combobox.tsx` (base component)
- Refactor all `*Select` components to internally use ERPCombobox (wrapper pattern)
- Keep all existing component names, exports, import paths, and props unchanged

**Your Decision**: ✅ **APPROVED WITH MODIFICATION** (Shared ERPCombobox base + wrappers)

---

### Decision 4: Confirm SQL Changes (None Required)

**Question**: Are you satisfied that no database indexes or schema changes are required?

**Recommendation**: No SQL changes required. Existing indexes are sufficient for client-side filtering.

**See**: `ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_SQL_REVIEW.sql` for details.

**Your Decision**: _________________

---

## FINAL STATUS

✅ **READY FOR SAMEER REVIEW** — Global Combobox Foundation UI/UX technical plan complete with shared ERPCombobox base architecture.

**Architecture Approved**: Shared ERPCombobox base component + thin wrapper pattern for all *Select components.

**Next Steps**:
1. Sameer/Dina review this plan and all 3 decision points
2. Sameer/Dina review SQL Review file (no SQL required)
3. Sameer/Dina review Risk Impact Review file
4. Sameer/Dina review Next Implementation Prompt Plan file
5. If approved, proceed to Phase 3B.2A (create ERPCombobox base + convert LookupSelect wrapper)

---

**Date**: Monday, June 8, 2026, 5:35 PM UTC+4  
**Reviewed By**: _________________  
**Approved By**: _________________  
**Approved Date**: _________________

---

**END OF UI/UX TECHNICAL PLAN**
