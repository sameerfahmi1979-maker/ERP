# Phase 002F.3E.3B.2 — Global Combobox Foundation Planning

**Phase Type**: PLANNING / REVIEW-FILES-ONLY  
**Phase ID**: ERP BASE 002F.3E.3B.2  
**Status**: ✅ APPROVED (with architectural correction)  
**Date**: June 8, 2026

---

## Purpose

Generate comprehensive planning documentation for implementing the Global Combobox Standard across all select components in the ERP system.

---

## Key Decision

**Original Recommendation**: In-place enhancement of each select component  
**Revised Architecture**: Shared ERPCombobox base component + wrapper pattern

**Approved Architecture**:
- Create `src/components/erp/combobox/erp-combobox.tsx` as reusable base
- Refactor existing `*Select` components to act as thin wrappers
- Preserve all public APIs (names, import paths, props, value types)
- Implement once, reuse everywhere

---

## Files in This Folder

### Technical Plan
- **ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_UIUX_TECHNICAL_PLAN.md**
  - Inventory of 17 select components
  - Target Combobox standard definition
  - Architecture details (shared ERPCombobox base)
  - Backward compatibility strategy
  - Implementation split into 5 sub-phases

### SQL Review
- **ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_SQL_REVIEW.sql**
  - Conclusion: NO SQL CHANGES REQUIRED
  - All master data tables already exist with proper structure

### Risk Assessment
- **ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_RISK_IMPACT_REVIEW.md**
  - Risk analysis for high-risk UI component changes
  - Mitigation strategies
  - Sequential implementation approach
  - Decision to approve shared ERPCombobox architecture

### Implementation Prompt Plan
- **ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_NEXT_IMPLEMENTATION_PROMPT_PLAN.md**
  - Detailed prompts for 5 sequential sub-phases (3B.2A through 3B.2E)
  - Scope for each sub-phase
  - Testing requirements

---

## Implementation Split

**Phase 3B.2A**: Base ERPCombobox + LookupSelect wrapper  
**Phase 3B.2B**: Geography wrappers (Country, Emirate, City, AreaZone)  
**Phase 3B.2C**: Finance wrappers (Bank, Currency, PaymentTerm, TaxType)  
**Phase 3B.2D**: Remaining wrappers (Port, OwnerCompany, Branch, UoM, CostCenter, ProfitCenter)  
**Phase 3B.2E**: Customer Form Final QA

---

## Next Phase

**Phase 002F.3E.3B.2A** — Implement Base ERPCombobox and LookupSelect Wrapper
