# ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_RISK_IMPACT_REVIEW

**Document Type**: Risk Assessment / Impact Analysis (Review-Only)  
**Phase**: ERP BASE 002F.3E.3B.2 — Global Combobox Foundation in Shared Components  
**Review Date**: Monday, June 8, 2026, 5:35 PM UTC+4  
**Status**: READY FOR SAMEER REVIEW

---

## DOCUMENT PURPOSE

This document provides a comprehensive risk assessment and impact analysis for the Global Combobox Foundation implementation.

**This is a PLANNING/REVIEW-ONLY document.**  
No implementation has been performed.  
No database changes have been made.  
No application source code has been modified.

---

## 1. EXECUTIVE SUMMARY

### 1.1 Overall Risk Level

🔴 **HIGH RISK** — This phase affects 17 shared components used across multiple forms and modules.

### 1.2 Primary Risk Factors

1. **Scope**: 17 existing select components will be modified in-place
2. **Usage**: Components used in Customer form (7 tabs), future Vendor/Employee/Asset forms
3. **Backward Compatibility**: Must preserve all existing props and behavior
4. **Cascading Logic**: Geography selects (Country → Emirate → City → Area/Zone) have complex dependencies
5. **Specialized Behavior**: LookupSelect has color badges, icons, hierarchical filtering

### 1.3 Mitigation Strategy

✅ **Split into 4 small sub-phases** (3B.2A-2D) instead of one large phase  
✅ **Test after each sub-phase** before proceeding to next  
✅ **In-place enhancement** (no new components, no migration required)  
✅ **Preserve all existing props** (100% backward compatible)  
✅ **Rollback plan** defined for each component

---

## 2. AFFECTED COMPONENTS

### 2.1 Component Impact Matrix

| Component | File Path | Risk Level | Used In | Breaking Change Risk |
|-----------|-----------|------------|---------|---------------------|
| **LookupSelect** | `src/components/erp/lookup-select.tsx` | 🔴 **HIGH** | Customer form (6 fields), Vendor, Subcontractor, Consultant, Gov Authority, Recruitment Agency | Color badges, hierarchical filtering |
| **CountrySelect** | `src/components/erp/geography/country-select.tsx` | 🟡 **MEDIUM** | Customer form, all party forms | Cascading parent (resets children) |
| **EmirateSelect** | `src/components/erp/geography/emirate-select.tsx` | 🟡 **MEDIUM** | Customer form, all party forms | Cascading child/parent (depends on Country, resets children) |
| **CitySelect** | `src/components/erp/geography/city-select.tsx` | 🟡 **MEDIUM** | Customer form, all party forms | Cascading child/parent (depends on Emirate, resets children) |
| **AreaZoneSelect** | `src/components/erp/geography/area-zone-select.tsx` | 🟡 **MEDIUM** | Customer form, all party forms | Cascading child (depends on City) |
| **BankSelect** | `src/components/erp/finance-basics/bank-select.tsx` | 🟡 **MEDIUM** | Customer Bank Details, all party bank details | Used in child record dialogs |
| **CurrencySelect** | `src/components/erp/finance-basics/currency-select.tsx` | 🟢 **LOW** | Customer form, all party forms | No special dependencies |
| **PaymentTermSelect** | `src/components/erp/finance-basics/payment-term-select.tsx` | 🟢 **LOW** | Customer form, all party forms | No special dependencies |
| **TaxTypeSelect** | `src/components/erp/finance-basics/tax-type-select.tsx` | 🟢 **LOW** | Customer form, all party forms | No special dependencies |
| **PortSelect** | `src/components/erp/geography/port-select.tsx` | 🟢 **LOW** | Not used in Customer form yet | Future use only |
| **OwnerCompanySelect** | `src/components/erp/organizations/owner-company-select.tsx` | 🟢 **LOW** | Not used in Customer form yet | Future use only |
| **BranchSelect** | `src/components/erp/organizations/branch-select.tsx` | 🟢 **LOW** | Not used in Customer form yet | Future use only |
| **UOMCategorySelect** | `src/components/erp/uom/uom-category-select.tsx` | 🟢 **LOW** | Not used in Customer form yet | Future use only |
| **UnitOfMeasureSelect** | `src/components/erp/uom/unit-of-measure-select.tsx` | 🟢 **LOW** | Not used in Customer form yet | Future use only |
| **UnitByCategorySelect** | `src/components/erp/uom/unit-by-category-select.tsx` | 🟢 **LOW** | Not used in Customer form yet | Future use only |
| **CostCenterSelect** | `src/components/erp/finance-basics/cost-center-select.tsx` | 🟢 **LOW** | Not used in Customer form yet | Future use only |
| **ProfitCenterSelect** | `src/components/erp/finance-basics/profit-center-select.tsx` | 🟢 **LOW** | Not used in Customer form yet | Future use only |

### 2.2 Customer-Facing vs Future Components

**Customer-Facing (Phase 3B.2A-2D)**: 9 components
- LookupSelect (6 usages in Customer form)
- CountrySelect, EmirateSelect, CitySelect, AreaZoneSelect (4 usages in Customer form)
- BankSelect (1 usage in Customer Bank Details)
- CurrencySelect, PaymentTermSelect, TaxTypeSelect (3 usages in Customer form)

**Future Components (Phase 3B.2E, Optional)**: 8 components
- PortSelect, OwnerCompanySelect, BranchSelect
- UOMCategorySelect, UnitOfMeasureSelect, UnitByCategorySelect
- CostCenterSelect, ProfitCenterSelect

---

## 3. AFFECTED FORMS

### 3.1 Customer Form Impact

**File**: `src/features/master-data/customers/components/customer-form-drawer.tsx`

**Affected Tabs**:

#### Tab 1: Basic Info
- **LookupSelect** (Customer Type) — 🔴 HIGH RISK, required field
- **LookupSelect** (Industry Type) — 🔴 HIGH RISK, optional field
- **LookupSelect** (Customer Segment) — 🔴 HIGH RISK, optional field
- **LookupSelect** (Lead Source) — 🔴 HIGH RISK, optional field
- **LookupSelect** (Status) — 🔴 HIGH RISK, required field, color badge

#### Tab 2: Address / Location
- **CountrySelect** — 🟡 MEDIUM RISK, cascading parent
- **EmirateSelect** — 🟡 MEDIUM RISK, cascading child/parent (depends on Country)
- **CitySelect** — 🟡 MEDIUM RISK, cascading child/parent (depends on Emirate)
- **AreaZoneSelect** — 🟡 MEDIUM RISK, cascading child (depends on City)

**Cascading Logic**:
```tsx
// Selecting Country resets Emirate, City, Area/Zone
setCountryId(value);
setEmirateId(null);
setCityId(null);
setAreaZoneId(null);

// Selecting Emirate resets City, Area/Zone
setEmirateId(value);
setCityId(null);
setAreaZoneId(null);

// Selecting City resets Area/Zone
setCityId(value);
setAreaZoneId(null);
```

**Risk**: Combobox enhancement must preserve this cascading reset behavior.

#### Tab 3: Contacts
- No select components (child records section only)

#### Tab 4: Commercial / Finance
- **CurrencySelect** — 🟢 LOW RISK, optional field
- **PaymentTermSelect** — 🟢 LOW RISK, optional field
- **TaxTypeSelect** — 🟢 LOW RISK, optional field

#### Tab 5: UAE Compliance
- **LookupSelect** (ICV Status) — 🔴 HIGH RISK, optional field

#### Tab 6: Documents
- No select components (placeholder tab)

#### Tab 7: Audit / System Info
- No select components (read-only display)

**Total Fields Affected**: 14 select fields in Customer form

### 3.2 Customer Child Record Dialogs

#### Customer Contacts Dialog
- **LookupSelect** (Contact Type) — 🔴 HIGH RISK
- **LookupSelect** (Designation) — 🔴 HIGH RISK
- **LookupSelect** (Department) — 🔴 HIGH RISK

#### Customer Addresses Dialog
- **CountrySelect, EmirateSelect, CitySelect, AreaZoneSelect** — 🟡 MEDIUM RISK (cascading)
- **LookupSelect** (Address Type) — 🔴 HIGH RISK

#### Customer Bank Details Dialog
- **BankSelect** — 🟡 MEDIUM RISK
- **CurrencySelect** — 🟢 LOW RISK
- **LookupSelect** (Account Type) — 🔴 HIGH RISK

**Total Child Record Fields Affected**: 10+ fields

### 3.3 Future Forms (Not Affected Yet)

- Vendor form (uses same select components, will automatically benefit)
- Subcontractor form (uses same select components, will automatically benefit)
- Consultant form (uses same select components, will automatically benefit)
- Government Authority form (uses same select components, will automatically benefit)
- Recruitment Agency form (uses same select components, will automatically benefit)

**Risk**: If combobox enhancement breaks Customer form, all future forms will also break when implemented.

---

## 4. AFFECTED MODULES

### 4.1 Master Data Module

**Path**: `src/features/master-data/`

**Sub-Modules**:
- `customers/` — 🔴 **CRITICAL** — Directly affected
- `vendors/` — 🟡 **MEDIUM** — Uses same components, not yet in production
- `subcontractors/` — 🟡 **MEDIUM** — Uses same components, not yet in production
- `consultants/` — 🟡 **MEDIUM** — Uses same components, not yet in production
- `government-authorities/` — 🟡 **MEDIUM** — Uses same components, not yet in production
- `recruitment-agencies/` — 🟡 **MEDIUM** — Uses same components, not yet in production
- `lookups/` — 🔴 **CRITICAL** — `useLookupValues` hook used by LookupSelect
- `geography/` — 🟡 **MEDIUM** — Geography types and hooks
- `finance-basics/` — 🟢 **LOW** — Finance types and hooks
- `organizations/` — 🟢 **LOW** — Organization types (future)
- `uom/` — 🟢 **LOW** — UOM types (future)

### 4.2 Shared Components Module

**Path**: `src/components/erp/`

**Sub-Folders**:
- `lookup-select.tsx` — 🔴 **CRITICAL** — Most widely used
- `geography/` — 🟡 **MEDIUM** — 5 geography components
- `finance-basics/` — 🟡 **MEDIUM** — 7 finance components
- `organizations/` — 🟢 **LOW** — 2 organization components (future)
- `uom/` — 🟢 **LOW** — 3 UOM components (future)

**Risk**: Breaking one component could affect multiple forms.

### 4.3 UI Components Module

**Path**: `src/components/ui/`

**Dependencies**:
- `select.tsx` (shadcn) — Will be **REPLACED** with `popover.tsx` + `command.tsx` in enhanced components
- `popover.tsx` (shadcn) — Will be **USED** in combobox implementation
- `command.tsx` (shadcn) — Will be **USED** in combobox implementation
- `button.tsx` (shadcn) — Used for trigger styling
- `label.tsx` (shadcn) — Used for labels (no change)

**Risk**: If shadcn `Command` or `Popover` has bugs or edge cases, combobox will inherit them.

---

## 5. POTENTIAL BREAKAGES

### 5.1 High-Risk Breakage Scenarios

#### Breakage 1: LookupSelect Color Badges Not Rendering

**Scenario**: Color badges (`showColor`, `color_hex`, `badge_variant`) fail to display in combobox items.

**Impact**: 🔴 **HIGH** — Status lookups (e.g., ACTIVE, INACTIVE) rely on color badges for visual clarity.

**Affected Fields**: Customer Status, ICV Status

**Detection**: Visual inspection, compare Add/Edit mode before/after enhancement

**Mitigation**: Test color badge rendering in CommandItem during implementation

---

#### Breakage 2: LookupSelect Hierarchical Filtering Broken

**Scenario**: Parent-child lookup filtering (`parentValueCode` prop) fails.

**Impact**: 🔴 **HIGH** — Some lookup categories use hierarchical filtering (e.g., sub-categories).

**Affected Fields**: Any lookup with hierarchical structure

**Detection**: Test lookup categories with parent-child relationships

**Mitigation**: Verify `parentValueCode` filter logic preserved in combobox implementation

---

#### Breakage 3: Cascading Geography Selects Not Resetting Children

**Scenario**: Selecting Country does not reset Emirate, City, Area/Zone.

**Impact**: 🔴 **HIGH** — User can select invalid combinations (e.g., "UAE" + "California").

**Affected Fields**: Country → Emirate → City → Area/Zone chain

**Detection**: Select Country, then change Country, verify children reset

**Mitigation**: Test cascading reset logic in Customer form after implementation

---

#### Breakage 4: Cascading Geography Selects Not Re-Fetching Children

**Scenario**: Selecting Country does not trigger Emirate re-fetch.

**Impact**: 🔴 **HIGH** — Emirate/City/Area options stale or empty.

**Affected Fields**: EmirateSelect, CitySelect, AreaZoneSelect

**Detection**: Select Country, verify Emirate list updates to show only regions for selected country

**Mitigation**: Test cascading data loading in Customer form after implementation

---

#### Breakage 5: Clear Button Shown on Required Fields

**Scenario**: X button appears on required fields (Customer Type, Status).

**Impact**: 🟡 **MEDIUM** — User can clear required field, form validation fails on submit.

**Affected Fields**: Customer Type, Status (required fields)

**Detection**: Visual inspection, click X on required field

**Mitigation**: Verify `allowClear` logic respects `required` prop

---

### 5.2 Medium-Risk Breakage Scenarios

#### Breakage 6: Popover Clipping at Viewport Edges

**Scenario**: Combobox popover is clipped at bottom of viewport or right edge.

**Impact**: 🟡 **MEDIUM** — User cannot see all options.

**Affected Components**: All comboboxes near viewport edges

**Detection**: Open combobox near bottom/right of screen

**Mitigation**: Verify shadcn Popover auto-flip and positioning work correctly

---

#### Breakage 7: Keyboard Navigation Not Working

**Scenario**: Arrow keys, Enter, Escape do not work as expected.

**Impact**: 🟡 **MEDIUM** — Keyboard users cannot use combobox.

**Affected Components**: All comboboxes

**Detection**: Test keyboard navigation (Arrow keys, Enter, Escape, Tab)

**Mitigation**: Verify shadcn Command keyboard behavior, test in all browsers

---

#### Breakage 8: Search Not Filtering Arabic Names

**Scenario**: Search input only filters English names, not Arabic names.

**Impact**: 🟡 **MEDIUM** — Arabic users cannot search by Arabic text.

**Affected Components**: All comboboxes with Arabic name fields

**Detection**: Type Arabic text in search, verify results include Arabic matches

**Mitigation**: Verify filter logic includes `name_ar` or `value_label_ar` fields

---

#### Breakage 9: Loading State Not Showing

**Scenario**: Spinner/loading indicator does not appear during data fetch.

**Impact**: 🟡 **MEDIUM** — User sees blank combobox, unclear if loading or broken.

**Affected Components**: All comboboxes on initial load

**Detection**: Open Customer form in Add mode, verify loading indicators appear

**Mitigation**: Verify loading state logic preserved in combobox implementation

---

### 5.3 Low-Risk Breakage Scenarios

#### Breakage 10: Styling Inconsistency

**Scenario**: Combobox trigger height/width/border does not match existing Select.

**Impact**: 🟢 **LOW** — Visual inconsistency, but functional.

**Affected Components**: All comboboxes

**Detection**: Visual comparison before/after enhancement

**Mitigation**: Match shadcn Select styling (h-10, border, bg-background)

---

#### Breakage 11: Disabled State Visual Inconsistency

**Scenario**: Disabled combobox looks different from disabled Select.

**Impact**: 🟢 **LOW** — Visual inconsistency in View mode.

**Affected Components**: All comboboxes in View mode

**Detection**: Open Customer form in View mode, compare disabled fields

**Mitigation**: Match disabled state styling (bg-muted, cursor-not-allowed)

---

#### Breakage 12: Error State Visual Inconsistency

**Scenario**: Red border on error does not match existing Select error border.

**Impact**: 🟢 **LOW** — Visual inconsistency when validation fails.

**Affected Components**: All comboboxes with validation errors

**Detection**: Submit form with empty required field, verify error border

**Mitigation**: Match error state styling (border-destructive)

---

## 6. BACKWARD COMPATIBILITY CONCERNS

### 6.1 Props Compatibility

✅ **All existing props must remain unchanged**:
- `value`, `onValueChange`, `placeholder`, `disabled`, `required`
- `className`, `name`, `error`, `allowClear`
- `language`, `showCode`, `includeInactive`

✅ **Specialized props must remain unchanged**:
- **LookupSelect**: `categoryCode`, `parentValueCode`, `showColor`, `valueField`
- **CountrySelect**: `gccOnly`
- **EmirateSelect**: `countryId`
- **CitySelect**: `emirateId`
- **AreaZoneSelect**: `cityId`

🔴 **Risk**: Adding new required props would break existing usage.

**Mitigation**: Do NOT add new required props. Only add optional props if absolutely necessary.

### 6.2 Value Type Compatibility

✅ **Value types must remain unchanged**:
- LookupSelect: `number | string | null` (controlled by `valueField` prop)
- Geography/Finance selects: `number | null` (ID-based)

🔴 **Risk**: Changing value type (e.g., from number to string) would break form state.

**Mitigation**: Preserve existing value type logic exactly.

### 6.3 Callback Signature Compatibility

✅ **`onValueChange` signature must remain unchanged**:
- LookupSelect: `(value: number | string | null) => void`
- Other selects: `(value: number | null) => void`

🔴 **Risk**: Changing callback signature would break parent components.

**Mitigation**: Do NOT change callback signature.

### 6.4 Import Path Compatibility

✅ **Import paths must remain unchanged**:
```tsx
import { LookupSelect } from "@/components/erp/lookup-select";
import { CountrySelect, EmirateSelect, CitySelect, AreaZoneSelect } from "@/components/erp/geography";
import { BankSelect, CurrencySelect, PaymentTermSelect, TaxTypeSelect } from "@/components/erp/finance-basics";
```

🔴 **Risk**: Changing component names or paths would break all imports.

**Mitigation**: Keep filenames and export names unchanged.

---

## 7. TESTING SCOPE

### 7.1 Unit Testing (Not Required, Manual Testing Sufficient)

**Note**: This project does not currently have unit tests for components. Manual testing is sufficient.

### 7.2 Integration Testing (Manual)

**Test Suites**:

#### Suite 1: LookupSelect (Customer Form Basic Info Tab)
- [ ] Customer Type (required, no clear button)
- [ ] Industry Type (optional, clear button)
- [ ] Customer Segment (optional, clear button)
- [ ] Lead Source (optional, clear button)
- [ ] Status (required, color badge, no clear button)
- [ ] ICV Status (optional, clear button)

**Test Cases per Field**:
- Open combobox, verify popover opens
- Type in search, verify filtering works (code, English, Arabic)
- Select item, verify popover closes and value displays
- Verify clear button shows/hides correctly
- Verify color badges render (if applicable)

#### Suite 2: Geography Cascade (Customer Form Address Tab)
- [ ] Country → Emirate → City → Area/Zone cascading
- [ ] Select Country, verify Emirate enables and reloads
- [ ] Change Country, verify Emirate/City/Area reset
- [ ] Select Emirate, verify City enables and reloads
- [ ] Change Emirate, verify City/Area reset
- [ ] Select City, verify Area enables and reloads
- [ ] Change City, verify Area resets

#### Suite 3: Finance Fields (Customer Form Finance Tab)
- [ ] Currency (optional, clear button)
- [ ] Payment Term (optional, clear button)
- [ ] Tax Type (optional, clear button)

#### Suite 4: Bank Details Dialog
- [ ] Bank (search by code, English, Arabic, short name)
- [ ] Currency (optional, clear button)

#### Suite 5: All Comboboxes in View Mode
- [ ] Open Customer form in View mode
- [ ] Verify all comboboxes are disabled
- [ ] Verify selected values display correctly (not as placeholder)
- [ ] Verify cannot open popover

#### Suite 6: Keyboard Navigation (All Comboboxes)
- [ ] Tab to combobox, press Enter to open
- [ ] Arrow Down/Up to navigate items
- [ ] Enter to select highlighted item
- [ ] Escape to close without selecting
- [ ] Tab to move to next field (closes popover)

#### Suite 7: Cross-Browser Testing
- [ ] Chrome (all tests)
- [ ] Firefox (all tests)
- [ ] Safari (all tests)
- [ ] Edge (all tests)

#### Suite 8: Responsive Testing
- [ ] Desktop 1920x1080 (all tests)
- [ ] Tablet 768x1024 (all tests)
- [ ] Mobile 375x667 (all tests)

### 7.3 Regression Testing

**Critical Regression Tests**:
- [ ] Customer form save (Add mode)
- [ ] Customer form save (Edit mode)
- [ ] Customer form view (View mode)
- [ ] Customer Contacts create/edit
- [ ] Customer Addresses create/edit
- [ ] Customer Bank Details create/edit

**Expected**: No regressions, all CRUD operations work as before.

---

## 8. ROLLBACK STRATEGY

### 8.1 Rollback Decision Criteria

**Rollback Phase 3B.2 if**:
- Critical breakage found (e.g., cascading geography broken, color badges missing)
- Regressions in Customer form save/edit/view
- Cross-browser failures (combobox doesn't work in Safari/Firefox)
- Performance issues (combobox search laggy)

**Do NOT rollback for**:
- Minor styling inconsistencies (can be fixed in follow-up)
- Edge cases in non-customer-facing components (defer to Phase 3B.2E)

### 8.2 Rollback Procedure

#### Step 1: Identify Broken Component(s)

Isolate which component(s) are causing critical issues.

#### Step 2: Revert Component File(s)

```bash
# Example: Revert LookupSelect if broken
git checkout HEAD~1 src/components/erp/lookup-select.tsx

# Example: Revert all geography components if cascading broken
git checkout HEAD~1 src/components/erp/geography/*.tsx
```

#### Step 3: Test After Revert

```bash
npm run typecheck
npm run lint
npm run build
```

Open Customer form, verify broken functionality is restored.

#### Step 4: Document Issue

Create a report documenting:
- What broke
- Why it broke
- What needs to be fixed before re-attempting
- Test cases to prevent recurrence

#### Step 5: Fix and Re-Attempt

Apply fix in isolated environment, test thoroughly, then commit.

### 8.3 Partial Rollback Strategy

**If only one component is broken**, rollback that component only:
- Example: LookupSelect broken → revert LookupSelect, keep geography/finance enhancements
- Example: Cascading broken → revert geography components, keep LookupSelect/finance

**Do NOT rollback entire phase if only one component is broken.**

### 8.4 Git Commit Strategy for Safe Rollback

**Recommendation**: Commit each sub-phase separately:
- Commit 1: Phase 3B.2A (LookupSelect only)
- Commit 2: Phase 3B.2B (Geography components only)
- Commit 3: Phase 3B.2C (Finance components only)
- Commit 4: Phase 3B.2D (QA report only)

**Benefit**: Can rollback individual sub-phases without losing all work.

---

## 9. RECOMMENDED IMPLEMENTATION SPLIT

### 9.1 Recommended Split: 4 Sub-Phases

#### Phase 3B.2A — Create Base ERPCombobox + Convert LookupSelect Wrapper (8 hours, HIGH RISK)

**Scope**:
- Create `src/components/erp/combobox/erp-combobox.tsx` (shared base component)
- Create `src/components/erp/combobox/types.ts` (ERPComboboxOption, ERPComboboxProps)
- Refactor `LookupSelect` to internally use ERPCombobox (wrapper pattern)
- Preserve all LookupSelect props and behavior (color badges, hierarchical filtering, valueField)

**Test**: Customer form Basic Info tab (6 lookup fields)  
**Risk**: 🔴 HIGH (base component + most complex wrapper)

**Stop Condition**: ERPCombobox base works, LookupSelect wrapper works as Combobox in Customer form, all tests pass

**Rollback**: Revert `src/components/erp/combobox/` and `src/components/erp/lookup-select.tsx` if broken

---

#### Phase 3B.2B — Convert Geography Select Wrappers (4 hours, MEDIUM RISK)

**Scope**: Refactor Country, Emirate, City, AreaZone Selects to use ERPCombobox internally  
**Test**: Customer form Address/Location tab, cascading behavior  
**Risk**: 🟡 MEDIUM (cascading logic must be preserved)

**Stop Condition**: All 4 geography wrappers work, cascading preserved

**Rollback**: Revert `src/components/erp/geography/*.tsx` if broken

---

#### Phase 3B.2C — Convert Finance Select Wrappers (3 hours, LOW RISK)

**Scope**: Refactor Bank, Currency, PaymentTerm, TaxType Selects to use ERPCombobox internally  
**Test**: Customer form Finance tab, Customer Bank Details dialog  
**Risk**: 🟢 LOW (simple components)

**Stop Condition**: All 4 finance comboboxes work

**Rollback**: Revert `src/components/erp/finance-basics/*.tsx` if broken

---

#### Phase 3B.2D — Customer Form Final QA (2 hours, LOW RISK)

**Scope**: Full regression test, cross-browser, responsive, keyboard  
**Test**: All Customer form tabs, Add/Edit/View modes  
**Risk**: 🟢 LOW (QA phase)

**Stop Condition**: Customer form passes all tests, no regressions

**Rollback**: N/A (QA phase, no code changes)

---

#### Phase 3B.2E — Remaining 8 Components (4 hours, LOW RISK, OPTIONAL)

**Scope**: Enhance Port, OwnerCompany, Branch, UOM, CostCenter, ProfitCenter Selects  
**Test**: Not used in Customer form yet  
**Risk**: 🟢 LOW (not blocking Customer closure)

**Stop Condition**: All 17 components enhanced to Combobox

**Rollback**: Revert individual component files if broken

---

### 9.2 Total Effort and Risk Timeline

| Phase | Effort | Risk | Cumulative Risk |
|-------|--------|------|-----------------|
| 3B.2A | 8h | 🔴 HIGH | 🔴 HIGH |
| 3B.2B | 4h | 🟡 MEDIUM | 🔴 HIGH |
| 3B.2C | 3h | 🟢 LOW | 🟡 MEDIUM |
| 3B.2D | 2h | 🟢 LOW | 🟢 LOW |
| **Total (Customer)** | **17h** | | |
| 3B.2E | 4h | 🟢 LOW | 🟢 LOW |
| **Total (All)** | **21h** | | |

**Risk Reduction**: By splitting into 4 sub-phases, each phase can be tested and validated before proceeding, reducing cumulative risk from 🔴 HIGH to 🟢 LOW.

---

## 10. DECISION POINTS FOR SAMEER/DINA

### Decision 1: Approve Implementation Split (4 Sub-Phases)

**Question**: Do you approve the 4 sub-phase implementation strategy (3B.2A-2D)?

**Recommendation**: ✅ Approve — Reduces risk, allows rollback of individual components

**Your Decision**: _________________

---

### Decision 2: Defer Remaining 8 Components to Phase 3B.2E

**Question**: Do you approve deferring the remaining 8 components (Port, OwnerCompany, Branch, UOM, CostCenter, ProfitCenter) to Phase 3B.2E (future phase)?

**Recommendation**: ✅ Approve — Not blocking Customer closure, can be done later

**Your Decision**: _________________

---

### Decision 3: Approve Rollback Strategy

**Question**: Do you approve the rollback strategy (per-component revert via Git)?

**Recommendation**: ✅ Approve — Safe rollback with minimal disruption

**Your Decision**: _________________

---

### Decision 4: Approve Testing Scope (Manual Testing)

**Question**: Do you approve manual testing scope (no unit tests, manual integration tests only)?

**Recommendation**: ✅ Approve — Project does not have unit test infrastructure yet

**Your Decision**: _________________

---

### Decision 5: Approve Shared ERPCombobox Base Architecture

**Question**: Do you approve the shared ERPCombobox base component + wrapper pattern architecture?

**Approved Architecture**:
- Create `src/components/erp/combobox/erp-combobox.tsx` as shared base component
- Refactor all `*Select` components to internally use ERPCombobox (wrapper pattern)
- Keep all existing component names, exports, import paths, and props unchanged

**Benefits**:
- ✅ One place to fix keyboard behavior, styling, accessibility, loading/empty states
- ✅ Less repeated code (Popover + Command logic written once, not 17 times)
- ✅ Lower long-term maintenance cost (fix bugs once, all wrappers benefit)
- ✅ Consistent UX across all modules
- ✅ Backward compatible (existing imports remain valid)
- ✅ Easy to extend with new wrappers (CustomerSelect, VendorSelect, etc.)

**New Risk**:
- 🔴 ERPCombobox base component becomes central dependency — if base breaks, all wrappers affected

**Mitigation**:
- Implement and test ERPCombobox first through LookupSelect wrapper before converting others
- Keep wrapper props backward compatible
- Commit each sub-phase separately for safe rollback

**Your Decision**: ✅ **APPROVED WITH MODIFICATION** (Architecture updated from in-place enhancement to shared base + wrappers)

---

## 11. FINAL RISK SUMMARY

### 11.1 Risk Score by Phase

| Phase | Risk Before Split | Risk After Split |
|-------|-------------------|------------------|
| Phase 3B.2 (all components together) | 🔴 **CRITICAL** (17 components at once) | N/A |
| Phase 3B.2A (LookupSelect only) | N/A | 🔴 **HIGH** (1 complex component) |
| Phase 3B.2B (Geography only) | N/A | 🟡 **MEDIUM** (4 cascading components) |
| Phase 3B.2C (Finance only) | N/A | 🟢 **LOW** (4 simple components) |
| Phase 3B.2D (QA only) | N/A | 🟢 **LOW** (no code changes) |

**Conclusion**: Splitting into 4 sub-phases reduces risk from CRITICAL to manageable levels.

### 11.2 Confidence Level

✅ **HIGH CONFIDENCE** in implementation success IF:
- All 4 sub-phases are implemented sequentially (not together)
- Each sub-phase is fully tested before proceeding to next
- Rollback strategy is ready before starting each sub-phase
- All backward compatibility rules are followed

🔴 **LOW CONFIDENCE** in implementation success IF:
- All 17 components are enhanced together in one phase
- Testing is skipped or rushed
- Backward compatibility is not preserved

### 11.3 Go/No-Go Recommendation

**Recommendation**: ✅ **GO** with 4 sub-phase implementation strategy (3B.2A-2D)

**Do NOT GO** if:
- Attempting all 17 components in one phase
- Testing resources not available
- Customer form cannot be regression tested after each sub-phase

---

## FINAL STATUS

✅ **READY FOR SAMEER REVIEW** — Global Combobox Foundation risk/impact review complete with shared ERPCombobox base architecture.

**Architecture Approved**: Shared ERPCombobox base component + thin wrapper pattern reduces repeated code and lowers maintenance risk.

**Next Steps**:
1. Sameer/Dina review this risk assessment
2. Sameer/Dina approve/reject decision points (including Decision 5: architecture approval)
3. If approved, proceed to Phase 3B.2A (create ERPCombobox base + convert LookupSelect wrapper) implementation

---

**Date**: Monday, June 8, 2026, 5:35 PM UTC+4  
**Reviewed By**: _________________  
**Approved By**: _________________  
**Approved Date**: _________________

---

**END OF RISK IMPACT REVIEW**
