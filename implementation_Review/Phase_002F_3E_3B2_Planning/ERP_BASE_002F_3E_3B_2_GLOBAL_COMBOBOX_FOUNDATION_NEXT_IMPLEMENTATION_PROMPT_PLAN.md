# ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_NEXT_IMPLEMENTATION_PROMPT_PLAN

**Document Type**: Implementation Roadmap / Next Steps Plan (Review-Only)  
**Phase**: ERP BASE 002F.3E.3B.2 — Global Combobox Foundation in Shared Components  
**Planning Date**: Monday, June 8, 2026, 5:35 PM UTC+4  
**Status**: READY FOR SAMEER REVIEW

---

## DOCUMENT PURPOSE

This document provides recommended implementation prompts for the 4 sub-phases of the Global Combobox Foundation implementation.

**This is a PLANNING/REVIEW-ONLY document.**  
No implementation has been performed.  
No prompts have been created yet.  
This document **proposes** future prompts for Sameer/Dina approval.

---

## 1. IMPLEMENTATION ROADMAP SUMMARY

### 1.1 Recommended Phasing Strategy

The Global Combobox Foundation will be implemented in **4 sequential sub-phases**:

| Phase | Focus | Effort | Risk | Stop Condition |
|-------|-------|--------|------|----------------|
| **3B.2A** | LookupCombobox Foundation | 8 hours | 🔴 HIGH | LookupSelect works as Combobox, all tests pass |
| **3B.2B** | Geography Comboboxes | 4 hours | 🟡 MEDIUM | Cascading geography works correctly |
| **3B.2C** | Finance Comboboxes | 3 hours | 🟢 LOW | All finance comboboxes work |
| **3B.2D** | Customer Form Final QA | 2 hours | 🟢 LOW | Customer form passes all tests |
| **Total** | **Customer-Facing Components** | **17 hours** | | **Customer closure ready** |

**Optional Future Phase**:

| Phase | Focus | Effort | Risk | Stop Condition |
|-------|-------|--------|------|----------------|
| **3B.2E** | Remaining 8 Components | 4 hours | 🟢 LOW | All 17 components enhanced to Combobox |

### 1.2 Prerequisites Before Starting Phase 3B.2A

✅ **Sameer/Dina must review and approve**:
1. `ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_UIUX_TECHNICAL_PLAN.md`
2. `ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_SQL_REVIEW.sql`
3. `ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_RISK_IMPACT_REVIEW.md`
4. This document (`ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_NEXT_IMPLEMENTATION_PROMPT_PLAN.md`)

✅ **Decision Points Approved**:
- Implementation split (4 sub-phases): Approved ☐
- Defer remaining 8 components to Phase 3B.2E: Approved ☐
- Architecture (in-place enhancement): Approved ☐
- No SQL changes required: Approved ☐

✅ **Rollback Strategy Ready**:
- Git commit strategy: Each sub-phase committed separately
- Rollback procedure documented and understood

---

## 2. PHASE 3B.2A — CREATE BASE ERPCOMBOBOX + CONVERT LOOKUPSELECT WRAPPER

### 2.1 Proposed Prompt File

**Filename**: `PROMPT_ERP_BASE_002F_3E_3B_2A_IMPLEMENT_BASE_ERPCOMBOBOX_AND_LOOKUPSELECT_WRAPPER.md`

### 2.2 Prompt Purpose

Create the shared **ERPCombobox** base component (with shadcn Popover + Command), then refactor `LookupSelect` to internally use ERPCombobox as a wrapper, while preserving all existing props, behavior, and visual features (color badges, icons, hierarchical filtering).

### 2.3 Prompt Scope

**In Scope**:
- Create `src/components/erp/combobox/erp-combobox.tsx` (shared base component)
- Create `src/components/erp/combobox/types.ts` (ERPComboboxOption, ERPComboboxProps interfaces)
- Create `src/components/erp/combobox/index.ts` (exports)
- Refactor `src/components/erp/lookup-select.tsx` to internally use ERPCombobox (wrapper pattern)
- LookupSelect fetches data, maps to ERPComboboxOption[], passes to ERPCombobox
- Add client-side search by `value_code`, `value_label_en`, `value_label_ar` in ERPCombobox
- Add keyboard navigation (Arrow keys, Enter, Escape) in ERPCombobox
- Preserve all LookupSelect public props and behavior
- Preserve color badges, icons, hierarchical filtering in LookupSelect wrapper
- Test on Customer form Basic Info tab (6 lookup fields)
- Test on Customer UAE Compliance tab (1 lookup field)
- Generate implementation report

**Out of Scope**:
- Geography components (deferred to Phase 3B.2B)
- Finance components (deferred to Phase 3B.2C)
- Remaining 8 components (deferred to Phase 3B.2E)
- Database changes (none required)
- Customer Contacts/Addresses/Bank Details child dialogs (will inherit enhancement automatically)

### 2.4 Required Tests

1. **Customer Form Basic Info Tab**:
   - Customer Type (required, no clear button, search by code/English)
   - Industry Type (optional, clear button, search by code/English)
   - Customer Segment (optional, clear button, search by code/English)
   - Lead Source (optional, clear button, search by code/English)
   - Status (required, color badge, no clear button, search by code/English)

2. **Customer Form UAE Compliance Tab**:
   - ICV Status (optional, clear button, search by code/English)

3. **Keyboard Navigation**:
   - Arrow keys navigate items
   - Enter selects item
   - Escape closes popover

4. **Color Badges**:
   - Status lookup displays color badge correctly

5. **Hierarchical Filtering** (if applicable):
   - Test lookup with `parentValueCode` prop

6. **Loading/Empty States**:
   - Loading state shows spinner
   - Empty state shows "No options available"
   - No results state shows "No results found"

7. **Disabled/View Mode**:
   - Combobox disabled in View mode
   - Selected value displayed correctly

### 2.5 Required Report

**Report Filename**: `ERP_BASE_002F_3E_3B_2A_BASE_ERPCOMBOBOX_AND_LOOKUPSELECT_IMPLEMENTATION_REPORT.md`

**Report Must Include**:
- Phase name and date
- Supabase connection confirmation
- Files created (`src/components/erp/combobox/` folder with erp-combobox.tsx, types.ts, index.ts)
- Files modified (`src/components/erp/lookup-select.tsx` refactored to wrapper)
- Backward compatibility confirmation (all LookupSelect props preserved)
- Test results (all 7 test categories)
- Typecheck/lint/build results
- Known notes/limitations
- Final status (PASS/FAIL/BLOCKED)

### 2.6 Stop Condition

**Phase 3B.2A is complete when**:
- ERPCombobox base component created and functional
- LookupSelect component refactored to use ERPCombobox internally (wrapper pattern)
- All LookupSelect public props and behavior preserved
- All tests pass (Customer form Basic Info, UAE Compliance, keyboard, color badges, hierarchical filtering, loading/empty/disabled states)
- `npm run typecheck` passes
- `npm run lint` passes
- `npm run build` succeeds
- No console errors in browser
- Implementation report created and approved

**Do NOT proceed to Phase 3B.2B** until Phase 3B.2A stop condition is met and approved by Sameer/Dina.

---

## 3. PHASE 3B.2B — CONVERT GEOGRAPHY SELECT WRAPPERS

### 3.1 Proposed Prompt File

**Filename**: `PROMPT_ERP_BASE_002F_3E_3B_2B_CONVERT_GEOGRAPHY_SELECTS_TO_ERPCOMBOBOX.md`

### 3.2 Prompt Purpose

Refactor the 4 geography select components (CountrySelect, EmirateSelect, CitySelect, AreaZoneSelect) to internally use the shared ERPCombobox base component (wrapper pattern) while preserving cascading filter logic and all existing props.

### 3.3 Prompt Scope

**In Scope**:
- Refactor `src/components/erp/geography/country-select.tsx` to use ERPCombobox internally
- Refactor `src/components/erp/geography/emirate-select.tsx` to use ERPCombobox internally
- Refactor `src/components/erp/geography/city-select.tsx` to use ERPCombobox internally
- Refactor `src/components/erp/geography/area-zone-select.tsx` to use ERPCombobox internally
- Each wrapper fetches data, maps to ERPComboboxOption[], passes to ERPCombobox
- Preserve cascading filter logic (Country → Emirate → City → Area/Zone)
- Preserve cascading reset logic (selecting Country resets children)
- Preserve all existing public props
- Test on Customer form Address/Location tab
- Generate implementation report

**Out of Scope**:
- ERPCombobox base component (already created in Phase 3B.2A)
- LookupSelect (already done in Phase 3B.2A)
- Finance components (deferred to Phase 3B.2C)
- PortSelect (deferred to Phase 3B.2E)
- Database changes (none required)

### 3.4 Required Tests

1. **Country → Emirate Cascade**:
   - Select Country, verify Emirate enables and reloads
   - Change Country, verify Emirate/City/Area reset to null
   - Search Country by code (e.g., "AE"), English (e.g., "United Arab"), Arabic (if available)

2. **Emirate → City Cascade**:
   - Select Emirate, verify City enables and reloads
   - Change Emirate, verify City/Area reset to null
   - Search Emirate by code (e.g., "DXB"), English (e.g., "Dubai"), Arabic (if available)

3. **City → Area Cascade**:
   - Select City, verify Area enables and reloads
   - Change City, verify Area resets to null
   - Search City by code, English, Arabic

4. **Area/Zone Select**:
   - Select Area/Zone after City is selected
   - Search Area by code, English, Arabic

5. **Disabled States**:
   - Emirate disabled when no Country selected
   - City disabled when no Emirate selected
   - Area disabled when no City selected

6. **Clear Buttons**:
   - Clear Country, verify Emirate/City/Area disabled
   - Clear Emirate, verify City/Area disabled
   - Clear City, verify Area disabled

### 3.5 Required Report

**Report Filename**: `ERP_BASE_002F_3E_3B_2B_GEOGRAPHY_SELECT_WRAPPERS_IMPLEMENTATION_REPORT.md`

**Report Must Include**:
- Phase name and date
- Files modified (4 geography wrapper files)
- Cascading logic verification
- Test results (all 6 test categories)
- Typecheck/lint/build results
- Final status (PASS/FAIL/BLOCKED)

### 3.6 Stop Condition

**Phase 3B.2B is complete when**:
- All 4 geography wrappers refactored to use ERPCombobox internally
- Cascading filter logic works correctly
- Cascading reset logic works correctly
- All public props preserved
- All tests pass
- `npm run typecheck`, `npm run lint`, `npm run build` pass
- No console errors
- Implementation report created and approved

**Do NOT proceed to Phase 3B.2C** until Phase 3B.2B stop condition is met and approved by Sameer/Dina.

---

## 4. PHASE 3B.2C — CONVERT FINANCE SELECT WRAPPERS

### 4.1 Proposed Prompt File

**Filename**: `PROMPT_ERP_BASE_002F_3E_3B_2C_CONVERT_FINANCE_SELECTS_TO_ERPCOMBOBOX.md`

### 4.2 Prompt Purpose

Refactor the 4 finance select components (BankSelect, CurrencySelect, PaymentTermSelect, TaxTypeSelect) to internally use the shared ERPCombobox base component (wrapper pattern) while preserving all existing props.

### 4.3 Prompt Scope

**In Scope**:
- Refactor `src/components/erp/finance-basics/bank-select.tsx` to use ERPCombobox internally
- Refactor `src/components/erp/finance-basics/currency-select.tsx` to use ERPCombobox internally
- Refactor `src/components/erp/finance-basics/payment-term-select.tsx` to use ERPCombobox internally
- Refactor `src/components/erp/finance-basics/tax-type-select.tsx` to use ERPCombobox internally
- Each wrapper fetches data, maps to ERPComboboxOption[], passes to ERPCombobox
- BankSelect custom filter to include `short_name` in search
- Preserve all existing public props
- Test on Customer form Commercial/Finance tab
- Test on Customer Bank Details child dialog
- Generate implementation report

**Out of Scope**:
- ERPCombobox base component (already created in Phase 3B.2A)
- LookupSelect (already done in Phase 3B.2A)
- Geography components (already done in Phase 3B.2B)
- CostCenterSelect, ProfitCenterSelect (deferred to Phase 3B.2E)
- Database changes (none required)

### 4.4 Required Tests

1. **Customer Form Finance Tab**:
   - Currency (optional, clear button, search by code/English/Arabic)
   - Payment Term (optional, clear button, search by code/English/Arabic)
   - Tax Type (optional, clear button, search by code/English/Arabic)

2. **Customer Bank Details Dialog**:
   - Bank (search by code, English, Arabic, short name)
   - Currency (optional, clear button)

3. **Search Scenarios**:
   - Bank: Search "FAB", finds "First Abu Dhabi Bank"
   - Bank: Search "First Abu", finds "First Abu Dhabi Bank"
   - Currency: Search "AED", finds "UAE Dirham"
   - Currency: Search "Dirham", finds "UAE Dirham"
   - Payment Term: Search "NET30", finds "Net 30 Days"
   - Payment Term: Search "30", finds "Net 30 Days"
   - Tax Type: Search "VAT", finds "VAT 5%"
   - Tax Type: Search "5", finds "VAT 5%"

4. **Clear Buttons**:
   - All 4 finance fields support clear button (optional fields)

5. **Disabled/View Mode**:
   - All 4 finance comboboxes disabled in View mode

### 4.5 Required Report

**Report Filename**: `ERP_BASE_002F_3E_3B_2C_FINANCE_SELECT_WRAPPERS_IMPLEMENTATION_REPORT.md`

**Report Must Include**:
- Phase name and date
- Files modified (4 finance wrapper files)
- Test results (all 5 test categories)
- Typecheck/lint/build results
- Final status (PASS/FAIL/BLOCKED)

### 4.6 Stop Condition

**Phase 3B.2C is complete when**:
- All 4 finance wrappers refactored to use ERPCombobox internally
- All public props preserved
- All tests pass (Customer form Finance tab, Customer Bank Details dialog, search scenarios, clear buttons, disabled/view mode)
- `npm run typecheck`, `npm run lint`, `npm run build` pass
- No console errors
- Implementation report created and approved

**Do NOT proceed to Phase 3B.2D** until Phase 3B.2C stop condition is met and approved by Sameer/Dina.

---

## 5. PHASE 3B.2D — CUSTOMER FORM FINAL QA

### 5.1 Proposed Prompt File

**Filename**: `PROMPT_ERP_BASE_002F_3E_3B_2D_CUSTOMER_FORM_FINAL_QA.md`

### 5.2 Prompt Purpose

Perform comprehensive QA on the Customer form after all combobox enhancements are complete. This is a testing-only phase with no code changes.

### 5.3 Prompt Scope

**In Scope**:
- Full regression test of Customer form (Add, Edit, View modes)
- Test all 7 tabs:
  - Basic Info (6 lookup fields)
  - Address/Location (4 geography fields)
  - Contacts (no selects in parent form)
  - Commercial/Finance (3 finance fields)
  - UAE Compliance (1 lookup field)
  - Documents (placeholder)
  - Audit/System Info (read-only)
- Test all child record dialogs:
  - Customer Contacts (3 lookup fields)
  - Customer Addresses (4 geography fields + 1 lookup field)
  - Customer Bank Details (1 bank field + 1 currency field + 1 lookup field)
- Cross-browser testing (Chrome, Firefox, Safari, Edge)
- Responsive testing (Desktop, Tablet, Mobile)
- Keyboard navigation testing
- Performance testing (no console errors, no horizontal scroll)
- Generate comprehensive QA report

**Out of Scope**:
- Code changes (this is QA-only phase)
- Database changes (none required)
- Other modules (Vendor, Subcontractor, etc. will be tested in future phases)

### 5.4 Required Tests

#### Test Suite 1: Customer Form CRUD Operations
- [ ] Add new customer (all fields, all tabs)
- [ ] Save customer, verify success
- [ ] Edit existing customer (all fields, all tabs)
- [ ] Save changes, verify success
- [ ] View existing customer (all fields, all tabs)
- [ ] Verify all comboboxes disabled in View mode

#### Test Suite 2: Customer Contacts CRUD
- [ ] Add new contact
- [ ] Edit existing contact
- [ ] Delete contact

#### Test Suite 3: Customer Addresses CRUD
- [ ] Add new address
- [ ] Edit existing address
- [ ] Delete address
- [ ] Verify cascading geography works in child dialog

#### Test Suite 4: Customer Bank Details CRUD
- [ ] Add new bank detail
- [ ] Edit existing bank detail
- [ ] Delete bank detail

#### Test Suite 5: All Combobox Search Functionality
- [ ] Search by code in all comboboxes
- [ ] Search by English name in all comboboxes
- [ ] Search by Arabic name in all comboboxes (where applicable)
- [ ] Verify "No results found" when search doesn't match
- [ ] Verify "No options available" when data source empty

#### Test Suite 6: All Combobox Keyboard Navigation
- [ ] Tab to combobox, Enter to open
- [ ] Arrow keys navigate items
- [ ] Enter selects item
- [ ] Escape closes popover
- [ ] Tab moves to next field

#### Test Suite 7: All Combobox Clear Buttons
- [ ] Verify clear button shows for optional fields
- [ ] Verify clear button NOT shown for required fields
- [ ] Click X button, verify value clears

#### Test Suite 8: Cross-Browser Testing
- [ ] Chrome (all tests)
- [ ] Firefox (all tests)
- [ ] Safari (all tests)
- [ ] Edge (all tests)

#### Test Suite 9: Responsive Testing
- [ ] Desktop 1920x1080 (all tests)
- [ ] Tablet 768x1024 (all tests)
- [ ] Mobile 375x667 (all tests)

#### Test Suite 10: Performance Testing
- [ ] No console errors in browser
- [ ] No horizontal scroll (320px width test)
- [ ] Combobox search instant (<10ms)
- [ ] No memory leaks (open/close combobox 50+ times)

### 5.5 Required Report

**Report Filename**: `ERP_BASE_002F_3E_3B_2D_CUSTOMER_FORM_FINAL_QA_REPORT.md`

**Report Must Include**:
- Phase name and date
- Summary of all 10 test suites
- Test results (PASS/FAIL) for each test case
- Screenshots of key functionality (before/after combobox enhancement)
- Cross-browser compatibility results
- Responsive testing results
- Performance metrics (console errors, page load time, search response time)
- Regression analysis (any features broken by combobox enhancement)
- Known issues/limitations
- Final status (PASS/FAIL/BLOCKED)
- Recommendation to proceed to Customer closure or fix issues first

### 5.6 Stop Condition

**Phase 3B.2D is complete when**:
- All 10 test suites pass
- No critical issues found
- No regressions in Customer form
- Cross-browser compatibility verified
- Responsive behavior verified
- Performance acceptable (no console errors, no horizontal scroll)
- QA report created and approved

**Phase 3B.2 (Global Combobox Foundation for Customer) is COMPLETE** when Phase 3B.2D stop condition is met and approved by Sameer/Dina.

**Customer module is ready for Phase 3B.3 (Required Field Markers)** after Phase 3B.2D approval.

---

## 6. PHASE 3B.2E — CONVERT REMAINING SELECT WRAPPERS (OPTIONAL, FUTURE PHASE)

### 6.1 Proposed Prompt File

**Filename**: `PROMPT_ERP_BASE_002F_3E_3B_2E_CONVERT_REMAINING_SELECTS_TO_ERPCOMBOBOX.md`

### 6.2 Prompt Purpose

Refactor the remaining 8 select components (not used in Customer form yet) to internally use the shared ERPCombobox base component (wrapper pattern) for future module use.

### 6.3 Prompt Scope

**In Scope**:
- Refactor `src/components/erp/geography/port-select.tsx` to use ERPCombobox internally
- Refactor `src/components/erp/organizations/owner-company-select.tsx` to use ERPCombobox internally
- Refactor `src/components/erp/organizations/branch-select.tsx` to use ERPCombobox internally
- Refactor `src/components/erp/uom/uom-category-select.tsx` to use ERPCombobox internally
- Refactor `src/components/erp/uom/unit-of-measure-select.tsx` to use ERPCombobox internally
- Refactor `src/components/erp/uom/unit-by-category-select.tsx` to use ERPCombobox internally
- Refactor `src/components/erp/finance-basics/cost-center-select.tsx` to use ERPCombobox internally
- Refactor `src/components/erp/finance-basics/profit-center-select.tsx` to use ERPCombobox internally
- Add client-side search by code, English name, Arabic name
- Test each component in isolation (not blocking Customer)
- Generate implementation report

**Out of Scope**:
- Customer form testing (not used there yet)
- Vendor/Subcontractor/Consultant forms (not implemented yet)
- Database changes (none required)

### 6.4 Required Tests

**Test Strategy**: Isolated component testing for each of the 8 components

For each component:
- [ ] Render component with sample data
- [ ] Search by code, English name, Arabic name works
- [ ] Keyboard navigation works
- [ ] Clear button works (if optional)
- [ ] Loading/empty states work
- [ ] Disabled state works
- [ ] No console errors

### 6.5 Required Report

**Report Filename**: `ERP_BASE_002F_3E_3B_2E_REMAINING_COMBOBOXES_IMPLEMENTATION_REPORT.md`

**Report Must Include**:
- Phase name and date
- Files modified (8 component files)
- Test results for each component
- Typecheck/lint/build results
- Final status (PASS/FAIL/BLOCKED)

### 6.6 Stop Condition

**Phase 3B.2E is complete when**:
- All 8 remaining wrappers refactored to use ERPCombobox internally
- All public props preserved
- All isolated tests pass for each wrapper
- `npm run typecheck`, `npm run lint`, `npm run build` pass
- No console errors
- Implementation report created and approved

**All 17 ERP select components are now Combobox wrappers using ERPCombobox** when Phase 3B.2E is complete.

---

## 7. IMPLEMENTATION SEQUENCE SUMMARY

### 7.1 Recommended Execution Order

```
Phase 3B.2A (LookupCombobox) → Report → Approval ✓
    ↓
Phase 3B.2B (Geography) → Report → Approval ✓
    ↓
Phase 3B.2C (Finance) → Report → Approval ✓
    ↓
Phase 3B.2D (Customer QA) → Report → Approval ✓
    ↓
Customer Module Ready for Phase 3B.3 (Required Field Markers)
    ↓
(Later, optional)
Phase 3B.2E (Remaining 8 Components) → Report → Approval ✓
```

### 7.2 Total Timeline

| Phase | Effort | Cumulative | Approval Gate |
|-------|--------|------------|---------------|
| 3B.2A | 8h | 8h | Sameer/Dina approval required |
| 3B.2B | 4h | 12h | Sameer/Dina approval required |
| 3B.2C | 3h | 15h | Sameer/Dina approval required |
| 3B.2D | 2h | 17h | Sameer/Dina approval required |
| **Customer Total** | **17h** | | **Customer Combobox complete** |
| 3B.2E (optional) | 4h | 21h | Sameer/Dina approval required |
| **All Components** | **21h** | | **All 17 components complete** |

### 7.3 Approval Gates

Each phase requires approval before proceeding to next phase:

**After Phase 3B.2A**:
- Sameer/Dina reviews `ERP_BASE_002F_3E_3B_2A_LOOKUPCOMBOBOX_IMPLEMENTATION_REPORT.md`
- If approved → proceed to Phase 3B.2B
- If rejected → fix issues, re-test, re-submit report

**After Phase 3B.2B**:
- Sameer/Dina reviews `ERP_BASE_002F_3E_3B_2B_GEOGRAPHY_COMBOBOXES_IMPLEMENTATION_REPORT.md`
- If approved → proceed to Phase 3B.2C
- If rejected → fix issues, re-test, re-submit report

**After Phase 3B.2C**:
- Sameer/Dina reviews `ERP_BASE_002F_3E_3B_2C_FINANCE_COMBOBOXES_IMPLEMENTATION_REPORT.md`
- If approved → proceed to Phase 3B.2D
- If rejected → fix issues, re-test, re-submit report

**After Phase 3B.2D**:
- Sameer/Dina reviews `ERP_BASE_002F_3E_3B_2D_CUSTOMER_FORM_FINAL_QA_REPORT.md`
- If approved → Customer Combobox Foundation complete, proceed to Phase 3B.3 (Required Field Markers)
- If rejected → fix issues, re-test, re-submit report

**After Phase 3B.2E (optional)**:
- Sameer/Dina reviews `ERP_BASE_002F_3E_3B_2E_REMAINING_COMBOBOXES_IMPLEMENTATION_REPORT.md`
- If approved → All 17 components complete
- If rejected → fix issues, re-test, re-submit report

---

## 8. PROMPT CREATION GUIDELINES

### 8.1 Mandatory Prompt Sections

Each implementation prompt must include:

1. **Phase Information**
   - Phase ID, Name, Purpose
   - Planning-only vs Implementation

2. **Mandatory Standards References**
   - Must read `docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md`
   - Must read `docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md`

3. **Mandatory Supabase Connection**
   - Connect to `https://mmiefuieduzdiiwnqpie.supabase.co`
   - Verify tables/indexes if needed (though none are modified)

4. **Scope Definition**
   - In scope (specific components, files, tests)
   - Out of scope (deferred to later phases)

5. **Implementation Instructions**
   - Replace shadcn Select with Popover + Command
   - Preserve all existing props
   - Add search by code, English, Arabic
   - Add keyboard navigation
   - Preserve loading/empty/disabled states
   - Preserve specialized behavior (color badges, cascading, etc.)

6. **Testing Requirements**
   - Specific test cases for the phase
   - Browser testing (Chrome, Firefox, Safari, Edge)
   - Responsive testing (Desktop, Tablet, Mobile)
   - Keyboard testing
   - Performance testing

7. **Required Report**
   - Report filename
   - Report required sections
   - Final status (PASS/FAIL/BLOCKED)

8. **Stop Condition**
   - Clear definition of "done"
   - Approval gate before next phase

### 8.2 Prompt Naming Convention

```
PROMPT_ERP_BASE_002F_3E_3B_<SUB-PHASE>_<ACTION>_<COMPONENT-GROUP>.md
```

Examples:
- `PROMPT_ERP_BASE_002F_3E_3B_2A_IMPLEMENT_LOOKUPCOMBOBOX_FOUNDATION.md`
- `PROMPT_ERP_BASE_002F_3E_3B_2B_IMPLEMENT_GEOGRAPHY_COMBOBOXES.md`
- `PROMPT_ERP_BASE_002F_3E_3B_2C_IMPLEMENT_FINANCE_COMBOBOXES.md`
- `PROMPT_ERP_BASE_002F_3E_3B_2D_CUSTOMER_FORM_FINAL_QA.md`
- `PROMPT_ERP_BASE_002F_3E_3B_2E_IMPLEMENT_REMAINING_COMBOBOXES.md`

### 8.3 Report Naming Convention

```
ERP_BASE_002F_3E_3B_<SUB-PHASE>_<COMPONENT-GROUP>_IMPLEMENTATION_REPORT.md
```

Examples:
- `ERP_BASE_002F_3E_3B_2A_LOOKUPCOMBOBOX_IMPLEMENTATION_REPORT.md`
- `ERP_BASE_002F_3E_3B_2B_GEOGRAPHY_COMBOBOXES_IMPLEMENTATION_REPORT.md`
- `ERP_BASE_002F_3E_3B_2C_FINANCE_COMBOBOXES_IMPLEMENTATION_REPORT.md`
- `ERP_BASE_002F_3E_3B_2D_CUSTOMER_FORM_FINAL_QA_REPORT.md`
- `ERP_BASE_002F_3E_3B_2E_REMAINING_COMBOBOXES_IMPLEMENTATION_REPORT.md`

---

## 9. SUCCESS CRITERIA FOR PHASE 3B.2 (OVERALL)

### 9.1 Technical Success Criteria

✅ All 9 customer-facing components enhanced to Combobox behavior  
✅ Search by code, English, Arabic works in all comboboxes  
✅ Keyboard navigation works in all comboboxes  
✅ Cascading geography logic preserved and working  
✅ Color badges preserved in LookupSelect  
✅ All existing props preserved (100% backward compatible)  
✅ Customer form passes all tests (Add, Edit, View modes)  
✅ Cross-browser compatibility verified  
✅ Responsive behavior verified  
✅ No console errors  
✅ No horizontal scroll  
✅ `npm run typecheck` passes  
✅ `npm run lint` passes  
✅ `npm run build` succeeds

### 9.2 Documentation Success Criteria

✅ 4 implementation reports created (one per sub-phase)  
✅ Each report includes test results, screenshots, and final status  
✅ All reports approved by Sameer/Dina

### 9.3 Business Success Criteria

✅ Customer module ready for next phase (Required Field Markers)  
✅ No regressions in Customer form functionality  
✅ User experience improved (search, keyboard navigation)  
✅ Combobox foundation established for all future modules

---

## 10. FINAL RECOMMENDATIONS

### 10.1 Do NOT Proceed to Implementation Until

- [ ] All 4 review files approved by Sameer/Dina:
  - [ ] `ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_UIUX_TECHNICAL_PLAN.md`
  - [ ] `ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_SQL_REVIEW.sql`
  - [ ] `ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_RISK_IMPACT_REVIEW.md`
  - [ ] `ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_NEXT_IMPLEMENTATION_PROMPT_PLAN.md` (this document)

- [ ] All 4 decision points approved:
  - [ ] Implementation split (4 sub-phases)
  - [ ] Defer remaining 8 components to Phase 3B.2E
  - [ ] Architecture (in-place enhancement)
  - [ ] No SQL changes required

- [ ] Rollback strategy understood and Git commit strategy agreed

### 10.2 Implementation Order (Strict)

1. ✅ Create `PROMPT_ERP_BASE_002F_3E_3B_2A_IMPLEMENT_LOOKUPCOMBOBOX_FOUNDATION.md`
2. Execute Phase 3B.2A → Report → Approval
3. Create `PROMPT_ERP_BASE_002F_3E_3B_2B_IMPLEMENT_GEOGRAPHY_COMBOBOXES.md`
4. Execute Phase 3B.2B → Report → Approval
5. Create `PROMPT_ERP_BASE_002F_3E_3B_2C_IMPLEMENT_FINANCE_COMBOBOXES.md`
6. Execute Phase 3B.2C → Report → Approval
7. Create `PROMPT_ERP_BASE_002F_3E_3B_2D_CUSTOMER_FORM_FINAL_QA.md`
8. Execute Phase 3B.2D → Report → Approval
9. **Customer Combobox Foundation COMPLETE**
10. (Later, optional) Create `PROMPT_ERP_BASE_002F_3E_3B_2E_IMPLEMENT_REMAINING_COMBOBOXES.md`
11. (Later, optional) Execute Phase 3B.2E → Report → Approval

### 10.3 Next Steps After Phase 3B.2 Completion

Once Phase 3B.2D is complete and approved:

**Proceed to Phase 3B.3**:
```
ERP BASE 002F.3E.3B.3 — Implement Required Field Markers and Form Footer Standard
```

**Estimated Effort**: 4 hours (per original plan)

---

## FINAL STATUS

✅ **READY FOR SAMEER REVIEW** — Global Combobox Foundation next implementation prompt plan complete with shared ERPCombobox base architecture.

**Architecture Approved**: All implementation prompts now reflect shared ERPCombobox base component + thin wrapper pattern.

**Next Steps**:
1. Sameer/Dina review all 4 review files (UI/UX Technical Plan, SQL Review, Risk Impact Review, Next Implementation Prompt Plan)
2. Sameer/Dina approve all decision points
3. If approved, create first implementation prompt: `PROMPT_ERP_BASE_002F_3E_3B_2A_IMPLEMENT_BASE_ERPCOMBOBOX_AND_LOOKUPSELECT_WRAPPER.md`
4. Execute Phase 3B.2A (create ERPCombobox base + convert LookupSelect wrapper)

---

**Date**: Monday, June 8, 2026, 5:35 PM UTC+4  
**Reviewed By**: _________________  
**Approved By**: _________________  
**Approved Date**: _________________

---

**END OF NEXT IMPLEMENTATION PROMPT PLAN**
