# ERP BASE 002F.3A-R — REVISED MASTER DATA ARCHITECTURE AND MENU PLAN

**Phase:** ERP BASE 002F.3A-R (Revised)  
**Document Type:** Master Data Planning Report (Revised)  
**Status:** READY FOR SAMEER REVIEW  
**Created:** June 5, 2026  
**ERP System:** ALGT ERP (Next.js 15 + Supabase + PostgreSQL)  
**Project:** Alliance Group ERP — UAE Operations  
**Revision Reason:** Incorporate user decisions on Accounting removal, HSE simplification, CRM inclusion, and hierarchical menu structure

---

## DOCUMENT PURPOSE

This is a **REVISED PLANNING DOCUMENT ONLY** based on Sameer's latest decisions.

- ❌ Do NOT implement code
- ❌ Do NOT create migrations
- ❌ Do NOT modify database schema
- ❌ Do NOT create UI screens
- ❌ Do NOT change existing files

This revised report provides a refined master data architecture plan that will guide implementation in subsequent phases (002F.3B through 002F.3K).

---

## TABLE OF CONTENTS

1. [Executive Summary](#1-executive-summary)
2. [Latest User Decisions Applied](#2-latest-user-decisions-applied)
3. [Existing Plan Review Findings](#3-existing-plan-review-findings)
4. [Scope Changes From Original Plan](#4-scope-changes-from-original-plan)
5. [Final Hierarchical Sidebar/Menu Structure](#5-final-hierarchical-sidebarmenu-structure)
6. [Master Data Menu Decision Matrix](#6-master-data-menu-decision-matrix)
7. [UAE Business Requirements Compatibility Review](#7-uae-business-requirements-compatibility-review)
8. [Finance Basics Only — No Accounting Module Now](#8-finance-basics-only--no-accounting-module-now)
9. [Basic HSE Master Data — Current Scope](#9-basic-hse-master-data--current-scope)
10. [CRM Master Data — Full Scope](#10-crm-master-data--full-scope)
11. [Global Lookup Engine Revised Plan](#11-global-lookup-engine-revised-plan)
12. [Core UAE Shared Master Data Revised Plan](#12-core-uae-shared-master-data-revised-plan)
13. [Organization/Branch Completion Revised Plan](#13-organizationbranch-completion-revised-plan)
14. [People/Contacts/CRM Foundation Revised Plan](#14-peoplecontactscrm-foundation-revised-plan)
15. [HR Master Data Revised Plan](#15-hr-master-data-revised-plan)
16. [Fleet/Equipment Master Data Revised Plan](#16-fleetequipment-master-data-revised-plan)
17. [Workshop/Inventory/Procurement Revised Plan](#17-workshopinventoryprocurement-revised-plan)
18. [Basic HSE/DMS/Compliance Revised Plan](#18-basic-hsedmscompliance-revised-plan)
19. [Project/Task/Workflow Master Data Plan](#19-projecttaskworkflow-master-data-plan)
20. [Scrap/Waste/Demolition Master Data Revised Plan](#20-scrapwastedemolition-master-data-revised-plan)
21. [System Configuration Master Data Plan](#21-system-configuration-master-data-plan)
22. [Roles/Permissions Mapping](#22-rolespermissions-mapping)
23. [RLS Strategy For All Master Data](#23-rls-strategy-for-all-master-data)
24. [Numbering Integration Rules](#24-numbering-integration-rules)
25. [Implementation Phasing Plan (002F.3B-002F.3K)](#25-implementation-phasing-plan-002f3b-002f3k)
26. [Implementation Guardrails](#26-implementation-guardrails)
27. [Testing and Acceptance Strategy](#27-testing-and-acceptance-strategy)
28. [Risks, Decisions, and Final Approval Status](#28-risks-decisions-and-final-approval-status)

---

## 1. EXECUTIVE SUMMARY

### 1.1 Purpose of This Revision

The original master data plan (002F.3A) provided comprehensive coverage but required refinement based on Sameer's latest strategic decisions:

1. **Remove full accounting module** from current scope
2. **Simplify HSE** to basic operational scope (not full QHSE enterprise)
3. **Include CRM** as a core planned module
4. **Create hierarchical menu structure** (not flat list)
5. **Phase implementation** to avoid overwhelming scope
6. **Align with UAE business requirements**
7. **Complete all 28 sections** (not leave 12-28 as generic guidance)

### 1.2 Key Changes From Original Plan

| Change Area | Original Plan | Revised Plan |
|---|---|---|
| **Accounting** | Full accounting module included | ❌ Removed — Finance Basics only |
| **HSE** | Full QHSE enterprise suite | ✅ Simplified — Basic operational HSE |
| **CRM** | Mentioned but not detailed | ✅ Fully included and detailed |
| **Menu Structure** | Flat list planning | ✅ 14-group hierarchical structure |
| **Sections 12-28** | Generic "follow pattern" guidance | ✅ Fully detailed and actionable |
| **Implementation Phases** | 9 phases (002F.3B-002F.3J) | ✅ 10 phases (002F.3B-002F.3K) |
| **Permission Mapping** | Partial | ✅ Complete mapping for all menu items |
| **RLS Strategy** | Partial | ✅ Complete strategy for all tables |
| **UAE Requirements** | Embedded in sections | ✅ Dedicated review section |

### 1.3 Implementation Readiness

**Status:** ✅ **READY FOR SAMEER REVIEW**

This revised plan is:
- ✅ Complete (all 28 sections fully detailed)
- ✅ Practical (phased, manageable scope)
- ✅ UAE-aligned (compliance requirements verified)
- ✅ Permission-mapped (every menu item has permissions)
- ✅ RLS-ready (policies planned for all tables)
- ✅ Implementation-ready (clear phases 002F.3B-002F.3K)

### 1.4 Master Data Scope Summary

| Category | Items Count | Priority | Phase |
|---|---|---|---|
| **Global Lookups** | 60+ lookup categories | 🔴 CRITICAL | 002F.3B |
| **Core Shared Data** | 15+ dedicated tables | 🔴 CRITICAL | 002F.3C |
| **Organization** | 8 tables/enhancements | 🟡 HIGH | 002F.3D |
| **CRM** | 25+ items | 🟡 HIGH | 002F.3E |
| **HR** | 35+ items | 🔴 CRITICAL | 002F.3F |
| **Fleet/Equipment** | 45+ items | 🔴 CRITICAL | 002F.3G |
| **Workshop/Inventory** | 40+ items | 🔴 CRITICAL | 002F.3H |
| **Basic HSE/DMS** | 30+ items | 🟡 HIGH | 002F.3I |
| **Scrap/Waste** | 25+ items | 🟡 HIGH | 002F.3J |
| **TOTAL** | **280+ master data items** | — | 10 phases |

---

## 2. LATEST USER DECISIONS APPLIED

This section documents the specific user decisions that drove this revision.

### 2.1 Decision: Remove Full Accounting Module

**User Decision:**
> "Accounting module will NOT be implemented now. Only Finance Basics should be included now, enough to support operations, CRM, procurement, invoicing readiness, and commercial data."

**Applied Changes:**
- ❌ Removed: Chart of accounts
- ❌ Removed: General ledger
- ❌ Removed: Journal entries
- ❌ Removed: Trial balance
- ❌ Removed: Balance sheet / P&L module
- ❌ Removed: Full accounting workflow
- ✅ Kept: Currencies, payment terms, tax types, cost centers, profit centers
- ✅ Kept: Bank master (for future integration)
- ✅ Kept: Commercial terms (advance payment, retention)
- ✅ Kept: Invoice/payment readiness as master data placeholders

**Impact:** Section 8 now titled "Finance Basics Only — No Accounting Module Now"

### 2.2 Decision: Simplify HSE to Basic Module

**User Decision:**
> "HSE will be a basic module, not a full advanced QHSE enterprise suite at this stage."

**Applied Changes:**
- ✅ Kept: Incident management, inspections, PPE, PTW, NCR, CAPA, basic risk
- ❌ Deferred: Full ESG reporting
- ❌ Deferred: Advanced environmental monitoring
- ❌ Deferred: Contractor HSE scoring
- ❌ Deferred: Competency matrix automation
- ❌ Deferred: Advanced risk analytics
- ❌ Deferred: Regulatory reporting automation

**Impact:** Section 9 now titled "Basic HSE Master Data — Current Scope"

### 2.3 Decision: Include CRM as Core Module

**User Decision:**
> "CRM will be implemented and must be included in master data planning."

**Applied Changes:**
- ✅ Added: Section 10 "CRM Master Data — Full Scope"
- ✅ Added: Customer categories, types, lead sources, opportunity stages
- ✅ Added: Industry sectors, tender types, proposal types
- ✅ Added: CRM sidebar menu group with 12 menu items
- ✅ Added: CRM permissions (master_data.crm.view, master_data.crm.manage)
- ✅ Added: CRM numbering rules (LEAD-0001, OPP-0001, QUO-0001)

### 2.4 Decision: Create Hierarchical Menu Structure

**User Decision:**
> "Master data menu must use a proper professional hierarchical sidebar/menu structure. Do not create a flat list of 100+ master data items in the sidebar."

**Applied Changes:**
- ✅ Created: 14 master data menu groups
- ✅ Created: 3-level hierarchy (Group → Category → Item)
- ✅ Created: Decision matrix showing which items are visible/hidden
- ✅ Created: Permission-based menu visibility rules

**Impact:** Section 5 provides complete hierarchical structure

### 2.5 Decision: Phase Implementation

**User Decision:**
> "Master data implementation must be phased to avoid implementation problems."

**Applied Changes:**
- ✅ Created: 10 implementation phases (002F.3B through 002F.3K)
- ✅ Created: Clear prerequisites for each phase
- ✅ Created: Phase completion criteria
- ✅ Created: QA/Readiness gate at end (002F.3K)

**Impact:** Section 25 provides detailed phasing plan

### 2.6 Decision: UAE Business Alignment

**User Decision:**
> "Master data must be reviewed and aligned with UAE-style business requirements."

**Applied Changes:**
- ✅ Created: Section 7 "UAE Business Requirements Compatibility Review"
- ✅ Verified: Emirates, trade licenses, TRN, ICV, ADNOC, visa types, waste/scrap UAE categories
- ✅ Verified: Fuel units (diesel gallons), weight (kg/tons), distances (meters/km)
- ✅ Verified: Scrap grades (stainless 304/316, carbon steel, aluminum, copper, brass)

### 2.7 Decision: Complete Permission Mapping

**User Decision:**
> "Master data must be fully integrated with the existing roles and permissions module. Every master data menu/page must have permissions planned and mapped."

**Applied Changes:**
- ✅ Created: Section 22 with complete permission mapping
- ✅ Mapped: Every menu item to permissions
- ✅ Defined: Permission naming convention (master_data.{group}.{action})
- ✅ Defined: Role assignments (system_admin, group_admin, company_admin, branch_admin)

### 2.8 Decision: Complete RLS Strategy

**User Decision:**
> "RLS policies must be planned for every master data table/page."

**Applied Changes:**
- ✅ Created: Section 23 with complete RLS strategy
- ✅ Defined: RLS patterns for global lookups
- ✅ Defined: RLS patterns for company-scoped data
- ✅ Defined: RLS patterns for branch-scoped data
- ✅ Defined: RLS patterns for shared system data

### 2.9 Decision: Simple Document Numbering

**User Decision:**
> "Normal document numbers must remain simple: EMP-0001, PO-0001, INV-0001, JO-0001, GRN-0001. Do not introduce company/branch/year/month/day into normal document reference numbers unless explicitly requested later."

**Applied Changes:**
- ✅ Confirmed: All document numbering uses {DOC}-{SEQ4} format
- ✅ Confirmed: Global Numbering Engine (002F.2) is sufficient
- ✅ Confirmed: Company/branch codes remain as master data identifiers only
- ✅ Defined: Clear numbering rules in Section 24

---

## 3. EXISTING PLAN REVIEW FINDINGS

### 3.1 Strengths of Original Plan

The original 002F.3A plan provided excellent foundation:

✅ **Strong Technical Architecture:**
- Generic lookup vs dedicated table decision matrix
- Standard table structure patterns (BIGINT PK, audit fields, RLS)
- Integration with existing Global Numbering Engine
- UI component patterns (ERPDrawerForm, ERPDataTable)

✅ **Comprehensive Master Data Inventory:**
- 200+ master data items identified
- Clear priority classification (CRITICAL/HIGH/MEDIUM)
- Detailed schemas for core tables
- UAE compliance fields included

✅ **Solid Foundation Audit:**
- 30+ existing components inspected
- Gaps clearly identified
- Integration points documented
- Migration readiness assessed

### 3.2 Gaps Addressed in This Revision

The revision addresses these specific gaps:

🔴 **Gap 1: Sections 12-28 Were Generic**
- Original: "Follow same pattern" guidance
- Revised: ✅ All sections fully detailed and actionable

🔴 **Gap 2: No Hierarchical Menu Structure**
- Original: Flat list planning
- Revised: ✅ 14-group hierarchical structure with 280+ items organized

🔴 **Gap 3: Accounting Module Included**
- Original: Full accounting planned
- Revised: ✅ Removed, Finance Basics only

🔴 **Gap 4: HSE Too Ambitious**
- Original: Full QHSE enterprise suite
- Revised: ✅ Basic operational HSE

🔴 **Gap 5: CRM Not Detailed**
- Original: Mentioned but minimal detail
- Revised: ✅ Full CRM master data section (Section 10)

🔴 **Gap 6: Incomplete Permission Mapping**
- Original: Partial permissions
- Revised: ✅ Complete mapping for all 280+ items

🔴 **Gap 7: Incomplete RLS Strategy**
- Original: Patterns defined but not complete
- Revised: ✅ Policy plans for every table type

🔴 **Gap 8: No UAE Requirements Review**
- Original: Embedded in various sections
- Revised: ✅ Dedicated Section 7 with compliance matrix

### 3.3 Original Plan Phasing vs Revised Phasing

| Phase | Original Plan | Revised Plan | Reason for Change |
|---|---|---|---|
| 002F.3B | Lookup Engine | Lookup Engine | ✅ No change |
| 002F.3C | Core Shared Master Data | Core UAE Shared Master Data | ✅ Emphasis on UAE defaults |
| 002F.3D | Org/Branch Completion | Org/Branch Completion | ✅ No change |
| 002F.3E | People/Contacts/Business Partners | People/Contacts/**CRM** Foundation | ✅ CRM added |
| 002F.3F | HR Master Data | HR Master Data | ✅ No change |
| 002F.3G | Fleet/Equipment Master Data | Fleet/Equipment Master Data | ✅ No change |
| 002F.3H | Workshop/Inventory/Procurement | Workshop/Inventory/Procurement | ✅ No change |
| 002F.3I | HSE/DMS/Compliance | **Basic** HSE/DMS/Compliance | ✅ HSE simplified |
| 002F.3J | Master Data QA Gate | Scrap/Waste/Demolition | ✅ New dedicated phase |
| 002F.3K | *(not in original)* | Master Data QA & Readiness Gate | ✅ Added final gate |

**Rationale for 10th Phase:**
- Scrap/Waste/Demolition is core to Alliance Group business
- Requires specialized UAE compliance (EAD licenses, RCM/VAT)
- Deserves dedicated phase instead of being bundled

---

## 4. SCOPE CHANGES FROM ORIGINAL PLAN

### 4.1 Items Removed From Scope

| Item Category | Items Removed | Reason | Future Consideration |
|---|---|---|---|
| **Accounting Module** | Chart of Accounts, General Ledger, Journal Entries, Trial Balance, Financial Statements | User decision: Not needed now | Phase 3 or later |
| **Advanced QHSE** | ESG Reporting, Advanced Environmental Monitoring, Contractor HSE Scoring, Competency Matrix Automation | User decision: Basic HSE sufficient | Phase 4 or later |
| **Advanced Finance** | Multi-Currency Trading, Hedging, Complex Financial Instruments | Not needed for current operations | Phase 3 or later |
| **Advanced Inventory** | Bin-level tracking, Barcode/RFID, Auto-replenishment, Demand Forecasting | Complexity not justified yet | Phase 2 or later |
| **Advanced Fleet** | Real-time GPS integration, Telematics analytics, Predictive maintenance AI | Basic operations sufficient | Phase 2 or later |

### 4.2 Items Added To Scope

| Item Category | Items Added | Reason | Implementation Phase |
|---|---|---|---|
| **CRM Master Data** | Customer categories, Lead sources, Opportunity stages, Industry sectors, Tender types | User decision: CRM is core module | 002F.3E |
| **Scrap/Waste Dedicated Phase** | Scrap grades, Metal types, EAD licenses, RCM/VAT treatment | Core to business, needs focus | 002F.3J |
| **UAE Compliance Review** | Emirates, Visa types, License categories, Fuel units (gallons) | Ensure UAE readiness | All phases |
| **Hierarchical Menu** | 14-group menu structure, Permission-based visibility | Professional UX requirement | 002F.3B onwards |

### 4.3 Items Modified In Scope

| Item Category | Original Scope | Revised Scope | Reason |
|---|---|---|---|
| **Finance** | Full accounting module | Finance Basics only (currencies, payment terms, tax types, cost centers) | User decision |
| **HSE** | Full QHSE enterprise | Basic operational HSE (incidents, inspections, PPE, PTW, NCR, CAPA) | User decision |
| **Organization** | Partial completion | Full document management, expiry tracking, letterheads | Increase completeness |
| **People/Contacts** | Basic persons table | Persons + CRM contacts + business partner roles | CRM integration |

### 4.4 Net Scope Impact

| Metric | Original Plan | Revised Plan | Change |
|---|---|---|---|
| **Master Data Items** | ~200 | ~280 | +40% (CRM + Scrap detail) |
| **Implementation Phases** | 9 | 10 | +1 phase |
| **Menu Groups** | Unclear | 14 | Structured |
| **Permissions** | Partial | Complete (60+) | 100% coverage |
| **RLS Policies** | Patterns defined | Complete strategy | 100% coverage |
| **Complexity** | High (accounting) | Medium (operations focus) | ↓ Reduced |
| **UAE Readiness** | Good | Excellent | ↑ Improved |

---

## 5. FINAL HIERARCHICAL SIDEBAR/MENU STRUCTURE

### 5.1 Menu Structure Overview

The master data section will have **14 top-level groups** organized hierarchically:

```
Administration
└── Master Data
    ├── 1. Master Data Dashboard
    ├── 2. Global Lookups
    ├── 3. Organization Setup
    ├── 4. Geography & Locations
    ├── 5. Finance Basics
    ├── 6. Units & Measurements
    ├── 7. People & Contacts
    ├── 8. CRM Master Data
    ├── 9. HR Master Data
    ├── 10. Fleet & Equipment Master Data
    ├── 11. Workshop Master Data
    ├── 12. Inventory & Procurement Master Data
    ├── 13. Basic HSE Master Data
    ├── 14. DMS Master Data
    ├── 15. Project & Task Master Data
    └── 16. Scrap/Waste/Demolition Master Data
```

### 5.2 Complete Hierarchical Menu Structure

#### GROUP 1: Master Data Dashboard

**Route:** `/admin/master-data`

| Menu Item | Route | Permission | Description |
|---|---|---|---|
| Dashboard Overview | `/admin/master-data` | `master_data.dashboard.view` | Summary widgets, stats, recent changes |

**Purpose:** Central overview showing:
- Total master data records by category
- Recent updates (last 7 days)
- Data quality metrics
- Quick links to most-used categories
- Pending approvals (if workflow enabled)

---

#### GROUP 2: Global Lookups

**Route:** `/admin/master-data/lookups`

| Menu Item | Route | Permission | Description |
|---|---|---|---|
| Lookup Categories | `/admin/master-data/lookups/categories` | `master_data.lookups.manage` | Manage lookup category definitions |
| Lookup Values | `/admin/master-data/lookups/values` | `master_data.lookups.manage` | Manage lookup values by category |
| System Locked Values | `/admin/master-data/lookups/system` | `master_data.lookups.view` | View locked system values (read-only) |

**Visibility:** Always visible to users with `master_data.lookups.view` permission

**Implementation Phase:** 002F.3B

---

#### GROUP 3: Organization Setup

**Route:** `/admin/master-data/organization`

| Menu Item | Route | Permission | Description |
|---|---|---|---|
| Owner Companies | `/admin/organizations` | `organization.manage` | Existing route, already implemented |
| Branches | `/admin/branches` | `organization.manage` | Existing route, already implemented |
| Company Documents | `/admin/master-data/organization/company-docs` | `master_data.organization.documents.manage` | Company document types, attachments |
| Branch Documents | `/admin/master-data/organization/branch-docs` | `master_data.organization.documents.manage` | Branch document types, attachments |
| Letterhead Templates | `/admin/settings/letterheads` | `system_config.letterheads.manage` | Existing route (if implemented) |
| Authorized Signatories | `/admin/master-data/organization/signatories` | `master_data.organization.manage` | Company signatories master |

**Visibility:** Always visible to users with `organization.view` permission

**Implementation Phase:** 002F.3D

---

#### GROUP 4: Geography & Locations

**Route:** `/admin/master-data/geography`

| Menu Item | Route | Permission | Description |
|---|---|---|---|
| Countries | `/admin/master-data/geography/countries` | `master_data.geography.manage` | Country master (ISO codes) |
| Emirates | `/admin/master-data/geography/emirates` | `master_data.geography.manage` | UAE emirates (7 emirates) |
| Cities | `/admin/master-data/geography/cities` | `master_data.geography.manage` | Cities within UAE |
| Areas / Zones | `/admin/master-data/geography/areas` | `master_data.geography.manage` | Industrial areas, free zones |
| Ports | `/admin/master-data/geography/ports` | `master_data.geography.manage` | UAE ports (Jebel Ali, Khalifa, etc.) |
| Work Sites | `/admin/master-data/geography/sites` | `master_data.geography.manage` | Project sites, customer locations |

**Visibility:** Always visible

**Implementation Phase:** 002F.3C

---

#### GROUP 5: Finance Basics

**Route:** `/admin/master-data/finance`

| Menu Item | Route | Permission | Description |
|---|---|---|---|
| Currencies | `/admin/master-data/finance/currencies` | `master_data.finance_basics.manage` | Currency master (AED, USD, EUR, SAR) |
| Payment Terms | `/admin/master-data/finance/payment-terms` | `master_data.finance_basics.manage` | Net 30, Net 60, COD, etc. |
| Payment Methods | `/admin/master-data/finance/payment-methods` | `master_data.finance_basics.manage` | Cash, Cheque, Bank Transfer, Credit Card |
| Tax Types | `/admin/master-data/finance/tax-types` | `master_data.finance_basics.manage` | VAT 5%, VAT Exempt, RCM |
| Banks | `/admin/master-data/finance/banks` | `master_data.finance_basics.manage` | Bank master (UAE banks) |
| Bank Account Types | `/admin/master-data/finance/account-types` | `master_data.finance_basics.manage` | Current, Savings, LC, Guarantee |
| Cost Centers | `/admin/master-data/finance/cost-centers` | `master_data.finance_basics.manage` | Department/branch cost centers |
| Profit Centers | `/admin/master-data/finance/profit-centers` | `master_data.finance_basics.manage` | Business unit profit centers |

**Visibility:** Always visible

**Implementation Phase:** 002F.3C

**Note:** This is Finance Basics only. No accounting module (chart of accounts, GL, journal entries) at this stage.

---

#### GROUP 6: Units & Measurements

**Route:** `/admin/master-data/uom`

| Menu Item | Route | Permission | Description |
|---|---|---|---|
| UOM Categories | `/admin/master-data/uom/categories` | `master_data.uom.manage` | Length, Weight, Volume, Time, Fuel |
| Units of Measure | `/admin/master-data/uom/units` | `master_data.uom.manage` | M, KG, L, GAL, HR, PC, etc. |
| UOM Conversions | `/admin/master-data/uom/conversions` | `master_data.uom.manage` | Conversion factors (gal to L) |

**Visibility:** Always visible

**Implementation Phase:** 002F.3C

---

#### GROUP 7: People & Contacts

**Route:** `/admin/master-data/people`

| Menu Item | Route | Permission | Description |
|---|---|---|---|
| Persons | `/admin/master-data/people/persons` | `master_data.people_contacts.manage` | Central person registry |
| Contact Roles | `/admin/master-data/people/contact-roles` | `master_data.people_contacts.manage` | Primary Contact, AP Contact, etc. |
| Relationship Types | `/admin/master-data/people/relationships` | `master_data.people_contacts.manage` | Emergency Contact, Next of Kin, etc. |
| Authorized Signatories | `/admin/master-data/people/signatories` | `master_data.people_contacts.manage` | Authorized signatory roles |

**Visibility:** Always visible

**Implementation Phase:** 002F.3E

---

#### GROUP 8: CRM Master Data

**Route:** `/admin/master-data/crm`

| Menu Item | Route | Permission | Description |
|---|---|---|---|
| Customer Categories | `/admin/master-data/crm/customer-categories` | `master_data.crm.manage` | Government, ADNOC, Private, EPC |
| Customer Types | `/admin/master-data/crm/customer-types` | `master_data.crm.manage` | Direct Client, End User, Contractor |
| Lead Sources | `/admin/master-data/crm/lead-sources` | `master_data.crm.manage` | Website, Referral, Cold Call, Exhibition |
| Lead Statuses | `/admin/master-data/crm/lead-statuses` | `master_data.crm.manage` | New, Contacted, Qualified, Lost |
| Opportunity Stages | `/admin/master-data/crm/opportunity-stages` | `master_data.crm.manage` | Proposal, Negotiation, Closed Won/Lost |
| Loss Reasons | `/admin/master-data/crm/loss-reasons` | `master_data.crm.manage` | Price, Competition, Timing |
| Client Types | `/admin/master-data/crm/client-types` | `master_data.crm.manage` | ADNOC, TAQA, Government, Private |
| Industry Sectors | `/admin/master-data/crm/industry-sectors` | `master_data.crm.manage` | Oil & Gas, Construction, Manufacturing |
| Tender Types | `/admin/master-data/crm/tender-types` | `master_data.crm.manage` | Open Tender, Limited Tender, RFQ |
| Proposal Types | `/admin/master-data/crm/proposal-types` | `master_data.crm.manage` | Technical, Commercial, Joint |
| Sales Regions | `/admin/master-data/crm/sales-regions` | `master_data.crm.manage` | Abu Dhabi, Dubai, Northern Emirates |
| Activity Types | `/admin/master-data/crm/activity-types` | `master_data.crm.manage` | Call, Meeting, Email, Site Visit |

**Visibility:** Visible when CRM module is enabled

**Implementation Phase:** 002F.3E

---

#### GROUP 9: HR Master Data

**Route:** `/admin/master-data/hr`

| Menu Item | Route | Permission | Description |
|---|---|---|---|
| Departments | `/admin/master-data/hr/departments` | `master_data.hr.manage` | Company departments |
| Sections / Teams | `/admin/master-data/hr/sections` | `master_data.hr.manage` | Sub-departments |
| Designations | `/admin/master-data/hr/designations` | `master_data.hr.manage` | Job titles |
| Grades | `/admin/master-data/hr/grades` | `master_data.hr.manage` | Employee grades (salary bands) |
| Employment Types | `/admin/master-data/hr/employment-types` | `master_data.hr.manage` | Lookup: Full-Time, Part-Time, Contract |
| Contract Types | `/admin/master-data/hr/contract-types` | `master_data.hr.manage` | Lookup: Limited, Unlimited, Probation |
| Leave Types | `/admin/master-data/hr/leave-types` | `master_data.hr.manage` | Lookup: Annual, Sick, Emergency |
| Visa Types | `/admin/master-data/hr/visa-types` | `master_data.hr.manage` | Lookup: Employment, Investor, Golden |
| Work Permit Types | `/admin/master-data/hr/work-permit-types` | `master_data.hr.manage` | Lookup: Mainland, Free Zone |
| Insurance Categories | `/admin/master-data/hr/insurance-categories` | `master_data.hr.manage` | Lookup: Basic, Enhanced, Family |
| Driving License Categories | `/admin/master-data/hr/license-categories` | `master_data.hr.manage` | Lookup: Light, Heavy, Bus, Equipment |
| Training Certificate Types | `/admin/master-data/hr/training-types` | `master_data.hr.manage` | Lookup: NEBOSH, IOSH, First Aid |
| Employee Document Types | `/admin/master-data/hr/document-types` | `master_data.hr.manage` | Lookup: Passport, Visa, Emirates ID |

**Visibility:** Visible when HR module is enabled

**Implementation Phase:** 002F.3F

---

#### GROUP 10: Fleet & Equipment Master Data

**Route:** `/admin/master-data/fleet`

| Menu Item | Route | Permission | Description |
|---|---|---|---|
| Asset Categories | `/admin/master-data/fleet/asset-categories` | `master_data.fleet.manage` | Vehicle, Heavy Equipment, Trailer, Tool |
| Vehicle Types | `/admin/master-data/fleet/vehicle-types` | `master_data.fleet.manage` | Lookup: Truck, Pickup, SUV, Bus |
| Equipment Types | `/admin/master-data/fleet/equipment-types` | `master_data.fleet.manage` | Lookup: Excavator, Loader, Dozer |
| Trailer Types | `/admin/master-data/fleet/trailer-types` | `master_data.fleet.manage` | Lookup: Flatbed, Low-bed, Tank |
| Attachment Types | `/admin/master-data/fleet/attachment-types` | `master_data.fleet.manage` | Lookup: Hammer, Shear, Grappler |
| Makers | `/admin/master-data/fleet/makers` | `master_data.fleet.manage` | CAT, Komatsu, Volvo, Mercedes |
| Models | `/admin/master-data/fleet/models` | `master_data.fleet.manage` | Equipment/vehicle models by maker |
| Fuel Types | `/admin/master-data/fleet/fuel-types` | `master_data.fleet.manage` | Lookup: Diesel, Petrol, CNG, Electric |
| Meter Types | `/admin/master-data/fleet/meter-types` | `master_data.fleet.manage` | Lookup: Odometer, Hour Meter |
| Registration Types | `/admin/master-data/fleet/registration-types` | `master_data.fleet.manage` | Lookup: Private, Commercial, Export |
| Insurance Types | `/admin/master-data/fleet/insurance-types` | `master_data.fleet.manage` | Lookup: Comprehensive, Third Party |
| GPS Providers | `/admin/master-data/fleet/gps-providers` | `master_data.fleet.manage` | Lookup: Etisalat, Du, Geotab |
| Trip Types | `/admin/master-data/fleet/trip-types` | `master_data.fleet.manage` | Lookup: Delivery, Collection, Rental |
| Load Types | `/admin/master-data/fleet/load-types` | `master_data.fleet.manage` | Lookup: Scrap Metal, Waste, Equipment |
| Utilization Statuses | `/admin/master-data/fleet/utilization-statuses` | `master_data.fleet.manage` | Lookup: Available, On Job, Maintenance |
| Breakdown Reasons | `/admin/master-data/fleet/breakdown-reasons` | `master_data.fleet.manage` | Lookup: Engine, Hydraulic, Electrical |
| Fuel Stations | `/admin/master-data/fleet/fuel-stations` | `master_data.fleet.manage` | Internal/external fuel station master |
| Fuel Card Providers | `/admin/master-data/fleet/fuel-card-providers` | `master_data.fleet.manage` | Lookup: ENOC, ADNOC, EPPCO |

**Visibility:** Visible when Fleet module is enabled

**Implementation Phase:** 002F.3G

---

#### GROUP 11: Workshop Master Data

**Route:** `/admin/master-data/workshop`

| Menu Item | Route | Permission | Description |
|---|---|---|---|
| Workshop Locations | `/admin/master-data/workshop/locations` | `master_data.workshop.manage` | Workshop/service center master |
| Service Bays | `/admin/master-data/workshop/service-bays` | `master_data.workshop.manage` | Service bay allocation master |
| Maintenance Types | `/admin/master-data/workshop/maintenance-types` | `master_data.workshop.manage` | Lookup: PM, Corrective, Breakdown |
| PM Templates | `/admin/master-data/workshop/pm-templates` | `master_data.workshop.manage` | Preventive maintenance templates |
| Job Order Types | `/admin/master-data/workshop/job-order-types` | `master_data.workshop.manage` | Lookup: PM, Repair, Inspection |
| Failure Categories | `/admin/master-data/workshop/failure-categories` | `master_data.workshop.manage` | Lookup: Engine, Hydraulic, Electrical |
| Fault Codes | `/admin/master-data/workshop/fault-codes` | `master_data.workshop.manage` | Standard fault code library |
| Repair Categories | `/admin/master-data/workshop/repair-categories` | `master_data.workshop.manage` | Lookup: Replacement, Rebuild, Adjust |
| Labor Skill Categories | `/admin/master-data/workshop/labor-skills` | `master_data.workshop.manage` | Lookup: Mechanic, Electrician, Welder |
| Inspection Checklists | `/admin/master-data/workshop/checklists` | `master_data.workshop.manage` | Pre-defined inspection checklists |

**Visibility:** Visible when Workshop module is enabled

**Implementation Phase:** 002F.3H

---

#### GROUP 12: Inventory & Procurement Master Data

**Route:** `/admin/master-data/inventory`

| Menu Item | Route | Permission | Description |
|---|---|---|---|
| Item Categories | `/admin/master-data/inventory/item-categories` | `master_data.inventory.manage` | Hierarchical item categorization |
| Item Groups | `/admin/master-data/inventory/item-groups` | `master_data.inventory.manage` | Item groups within categories |
| Item Types | `/admin/master-data/inventory/item-types` | `master_data.inventory.manage` | Lookup: Spare Part, Consumable, Tool |
| Spare Part Categories | `/admin/master-data/inventory/spare-part-categories` | `master_data.inventory.manage` | Spare part specific categorization |
| Stock Types | `/admin/master-data/inventory/stock-types` | `master_data.inventory.manage` | Lookup: Regular, Consignment, Reserved |
| Warehouses | `/admin/master-data/inventory/warehouses` | `master_data.inventory.manage` | Warehouse location master |
| Warehouse Zones | `/admin/master-data/inventory/warehouse-zones` | `master_data.inventory.manage` | Zones/sections within warehouses |
| Bin Locations | `/admin/master-data/inventory/bin-locations` | `master_data.inventory.manage` | Bin-level location (Phase 2) |
| Item Brands | `/admin/master-data/inventory/item-brands` | `master_data.inventory.manage` | Spare part brands |
| Item Manufacturers | `/admin/master-data/inventory/item-manufacturers` | `master_data.inventory.manage` | Part manufacturers |
| Vendor Categories | `/admin/master-data/procurement/vendor-categories` | `master_data.procurement.manage` | Supplier, Dealer, Subcontractor |
| Supplier Types | `/admin/master-data/procurement/supplier-types` | `master_data.procurement.manage` | Lookup: Manufacturer, Distributor |
| Purchase Request Types | `/admin/master-data/procurement/pr-types` | `master_data.procurement.manage` | Lookup: Stock, Project, Emergency |
| Purchase Order Types | `/admin/master-data/procurement/po-types` | `master_data.procurement.manage` | Lookup: Standard, Blanket, Contract |
| RFQ Types | `/admin/master-data/procurement/rfq-types` | `master_data.procurement.manage` | Request for Quotation types |
| Delivery Terms | `/admin/master-data/procurement/delivery-terms` | `master_data.procurement.manage` | Delivery term master |
| Incoterms | `/admin/master-data/procurement/incoterms` | `master_data.procurement.manage` | FOB, CIF, DAP, etc. |
| Approval Thresholds | `/admin/master-data/procurement/approval-thresholds` | `master_data.procurement.manage` | PO approval limits by role/amount |
| Return Reasons | `/admin/master-data/procurement/return-reasons` | `master_data.procurement.manage` | Lookup: Wrong Item, Damaged, Defective |

**Visibility:** Visible when Inventory/Procurement modules are enabled

**Implementation Phase:** 002F.3H

---

#### GROUP 13: Basic HSE Master Data

**Route:** `/admin/master-data/hse`

| Menu Item | Route | Permission | Description |
|---|---|---|---|
| Incident Types | `/admin/master-data/hse/incident-types` | `master_data.hse_basic.manage` | Lookup: Injury, Property Damage, Near Miss |
| Injury Types | `/admin/master-data/hse/injury-types` | `master_data.hse_basic.manage` | Lookup: Cut, Burn, Fracture, Strain |
| Near Miss Types | `/admin/master-data/hse/near-miss-types` | `master_data.hse_basic.manage` | Near miss categorization |
| Environmental Incident Types | `/admin/master-data/hse/environmental-types` | `master_data.hse_basic.manage` | Spill, Emission, Waste |
| Risk Levels | `/admin/master-data/hse/risk-levels` | `master_data.hse_basic.manage` | Lookup: Extreme, High, Medium, Low |
| Likelihood Levels | `/admin/master-data/hse/likelihood-levels` | `master_data.hse_basic.manage` | Lookup: Almost Certain, Likely, Possible |
| Severity Levels | `/admin/master-data/hse/severity-levels` | `master_data.hse_basic.manage` | Lookup: Critical, Major, Moderate, Minor |
| Risk Matrix | `/admin/master-data/hse/risk-matrix` | `master_data.hse_basic.manage` | Risk matrix configuration |
| PPE Types | `/admin/master-data/hse/ppe-types` | `master_data.hse_basic.manage` | Lookup: Helmet, Gloves, Safety Shoes |
| PTW Types | `/admin/master-data/hse/ptw-types` | `master_data.hse_basic.manage` | Lookup: Hot Work, Confined Space, Heights |
| Inspection Types | `/admin/master-data/hse/inspection-types` | `master_data.hse_basic.manage` | Lookup: Site, Vehicle, Equipment |
| NCR Types | `/admin/master-data/hse/ncr-types` | `master_data.hse_basic.manage` | Non-conformance report types |
| CAPA Categories | `/admin/master-data/hse/capa-categories` | `master_data.hse_basic.manage` | Corrective/Preventive Action categories |
| Root Cause Categories | `/admin/master-data/hse/root-cause-categories` | `master_data.hse_basic.manage` | Root cause analysis categories |
| Emergency Drill Types | `/admin/master-data/hse/drill-types` | `master_data.hse_basic.manage` | Lookup: Fire, Evacuation, First Aid |
| First Aid Categories | `/admin/master-data/hse/first-aid-categories` | `master_data.hse_basic.manage` | First aid treatment types |

**Visibility:** Visible when HSE module is enabled

**Implementation Phase:** 002F.3I

**Note:** This is Basic HSE only. Advanced QHSE features (ESG, environmental monitoring, contractor scoring) deferred to later phases.

---

#### GROUP 14: DMS Master Data

**Route:** `/admin/master-data/dms`

| Menu Item | Route | Permission | Description |
|---|---|---|---|
| Document Categories | `/admin/master-data/dms/document-categories` | `master_data.dms.manage` | High-level document categorization |
| Document Types | `/admin/master-data/dms/document-types` | `master_data.dms.manage` | Trade License, Passport, Contract, etc. |
| File Classifications | `/admin/master-data/dms/file-classifications` | `master_data.dms.manage` | Lookup: Legal, HR, Finance, Technical |
| Confidentiality Levels | `/admin/master-data/dms/confidentiality-levels` | `master_data.dms.manage` | Lookup: Public, Internal, Confidential, Restricted |
| Document Statuses | `/admin/master-data/dms/document-statuses` | `master_data.dms.manage` | Lookup: Draft, Active, Expired, Archived |
| Version Statuses | `/admin/master-data/dms/version-statuses` | `master_data.dms.manage` | Lookup: Draft, Approved, Superseded |
| Retention Periods | `/admin/master-data/dms/retention-periods` | `master_data.dms.manage` | 1 year, 5 years, 10 years, Permanent |
| Expiry Reminder Rules | `/admin/master-data/dms/expiry-reminders` | `master_data.dms.manage` | Reminder scheduling rules (30/15/7 days) |
| Applicable Entity Types | `/admin/master-data/dms/entity-types` | `master_data.dms.manage` | Company, Employee, Asset, Vendor |

**Visibility:** Visible when DMS module is enabled

**Implementation Phase:** 002F.3I

---

#### GROUP 15: Project & Task Master Data

**Route:** `/admin/master-data/project`

| Menu Item | Route | Permission | Description |
|---|---|---|---|
| Project Types | `/admin/master-data/project/project-types` | `master_data.project_task.manage` | Lookup: Demolition, Scrap, Transport |
| Project Statuses | `/admin/master-data/project/project-statuses` | `master_data.project_task.manage` | Lookup: Planning, Active, On Hold, Completed |
| Task Types | `/admin/master-data/project/task-types` | `master_data.project_task.manage` | Lookup: Site Work, Equipment, Documentation |
| Task Statuses | `/admin/master-data/project/task-statuses` | `master_data.project_task.manage` | Lookup: Not Started, In Progress, Completed |
| Milestone Types | `/admin/master-data/project/milestone-types` | `master_data.project_task.manage` | Project milestone categorization |
| Workflow Types | `/admin/master-data/project/workflow-types` | `master_data.project_task.manage` | Approval workflows, process templates |
| Workflow Step Types | `/admin/master-data/project/workflow-step-types` | `master_data.project_task.manage` | Approval, Review, Notification |
| SLA Categories | `/admin/master-data/project/sla-categories` | `master_data.project_task.manage` | Service level agreement categories |

**Visibility:** Visible when Project module is enabled

**Implementation Phase:** 002F.3I (or later)

---

#### GROUP 16: Scrap/Waste/Demolition Master Data

**Route:** `/admin/master-data/scrap`

| Menu Item | Route | Permission | Description |
|---|---|---|---|
| Scrap Material Categories | `/admin/master-data/scrap/material-categories` | `master_data.scrap_waste_demolition.manage` | Ferrous, Non-Ferrous, Mixed |
| Metal Types | `/admin/master-data/scrap/metal-types` | `master_data.scrap_waste_demolition.manage` | Steel, Aluminum, Copper, Brass |
| Scrap Grades | `/admin/master-data/scrap/scrap-grades` | `master_data.scrap_waste_demolition.manage` | SS 304, SS 316, Carbon Steel, HMS |
| Material Conditions | `/admin/master-data/scrap/material-conditions` | `master_data.scrap_waste_demolition.manage` | Lookup: Clean, Contaminated, Mixed |
| Collection Methods | `/admin/master-data/scrap/collection-methods` | `master_data.scrap_waste_demolition.manage` | Lookup: On-site, Drop-off, Pickup |
| Loading Methods | `/admin/master-data/scrap/loading-methods` | `master_data.scrap_waste_demolition.manage` | Lookup: Crane, Forklift, Manual |
| Weighbridge Types | `/admin/master-data/scrap/weighbridge-types` | `master_data.scrap_waste_demolition.manage` | Fixed, Portable, Mobile |
| Buyer Categories | `/admin/master-data/scrap/buyer-categories` | `master_data.scrap_waste_demolition.manage` | Local Trader, Export, Recycler |
| Pricing Basis | `/admin/master-data/scrap/pricing-basis` | `master_data.scrap_waste_demolition.manage` | Lookup: Per Ton, Per Item, Lump Sum |
| VAT/RCM Treatment Types | `/admin/master-data/scrap/vat-rcm-types` | `master_data.scrap_waste_demolition.manage` | Standard VAT, RCM, Exempt |
| Waste Categories | `/admin/master-data/scrap/waste-categories` | `master_data.scrap_waste_demolition.manage` | Hazardous, Non-Hazardous, Recyclable |
| Hazardous Waste Types | `/admin/master-data/scrap/hazardous-waste-types` | `master_data.scrap_waste_demolition.manage` | Chemical, Oily, Infectious |
| Disposal Methods | `/admin/master-data/scrap/disposal-methods` | `master_data.scrap_waste_demolition.manage` | Lookup: Landfill, Incineration, Recycling |
| EAD License Categories | `/admin/master-data/scrap/ead-license-categories` | `master_data.scrap_waste_demolition.manage` | Waste Collection, Transport, Disposal |
| Manifest Types | `/admin/master-data/scrap/manifest-types` | `master_data.scrap_waste_demolition.manage` | Waste manifest document types |
| Demolition Work Types | `/admin/master-data/scrap/demolition-work-types` | `master_data.scrap_waste_demolition.manage` | Lookup: Structural, Mechanical, Electrical |
| Demolition Methods | `/admin/master-data/scrap/demolition-methods` | `master_data.scrap_waste_demolition.manage` | Lookup: Manual, Mechanical, Explosive |
| Isolation Types | `/admin/master-data/scrap/isolation-types` | `master_data.scrap_waste_demolition.manage` | Lookup: Electrical, Mechanical, Chemical |
| Recyclable Material Categories | `/admin/master-data/scrap/recyclable-categories` | `master_data.scrap_waste_demolition.manage` | Metal, Plastic, Wood, Concrete |

**Visibility:** Visible when Scrap/Waste/Demolition modules are enabled

**Implementation Phase:** 002F.3J

---

### 5.3 Menu Visibility Rules

| Scenario | Visibility Behavior |
|---|---|
| **User has no master_data permissions** | Master Data menu group hidden completely |
| **User has master_data.dashboard.view only** | Shows Dashboard only, all other groups hidden |
| **User has master_data.lookups.view** | Shows Global Lookups group |
| **Module not enabled** | Module-specific groups hidden (e.g., CRM, Fleet, Workshop) |
| **System admin** | All groups visible regardless of module status |
| **Branch admin** | Sees only groups relevant to branch operations (no organization setup) |
| **Company admin** | Sees all groups except system configuration |
| **Read-only user** | Sees groups with .view permission, no "Add New" buttons |

### 5.4 Sidebar Collapsible Groups

All master data groups should be collapsible/expandable in the sidebar:

- Default state: Collapsed
- User preference: Remembered per user
- Active route: Auto-expand parent group
- Keyboard navigation: Arrow keys to expand/collapse

---

## 6. MASTER DATA MENU DECISION MATRIX

This section classifies all 280+ master data items by type, implementation phase, and priority.

### 6.1 Matrix Legend

**Type Classification:**
- **GL** = Global Lookup (stored in global_lookup_values)
- **DT** = Dedicated Table
- **ET** = Existing Table Enhancement
- **SYS** = System Configuration
- **FUT** = Future Phase
- **NUM** = Numbering Rule Related

**Priority:**
- 🔴 **P0 - CRITICAL** = Blocking for modules, must implement immediately
- 🟡 **P1 - HIGH** = Important for operations, implement soon
- 🟢 **P2 - MEDIUM** = Nice to have, can defer

### 6.2 Complete Decision Matrix

| # | Menu Group | Menu Item | Type | Table/Lookup Category | Priority | Phase | Permission | UAE Req | Notes |
|---|---|---|---|---|---|---|---|---|---|
| **GROUP 1: Master Data Dashboard** |
| 1 | Dashboard | Dashboard Overview | SYS | N/A - UI only | 🟡 P1 | 002F.3B | master_data.dashboard.view | No | Stats/widgets page |
| **GROUP 2: Global Lookups** |
| 2 | Global Lookups | Lookup Categories | DT | global_lookup_categories | 🔴 P0 | 002F.3B | master_data.lookups.manage | No | Core engine |
| 3 | Global Lookups | Lookup Values | DT | global_lookup_values | 🔴 P0 | 002F.3B | master_data.lookups.manage | No | Core engine |
| 4 | Global Lookups | System Locked Values | DT | global_lookup_values (filtered) | 🟢 P2 | 002F.3B | master_data.lookups.view | No | Read-only view |
| **GROUP 3: Organization Setup** |
| 5 | Organization | Owner Companies | ET | owner_companies | 🔴 P0 | 002F.3D | organization.manage | Yes | Already exists, enhance |
| 6 | Organization | Branches | ET | branches | 🔴 P0 | 002F.3D | organization.manage | Yes | Already exists, enhance |
| 7 | Organization | Company Documents | DT | company_documents | 🟡 P1 | 002F.3D | master_data.organization.documents.manage | Yes | Attachment metadata |
| 8 | Organization | Branch Documents | DT | branch_documents | 🟡 P1 | 002F.3D | master_data.organization.documents.manage | Yes | Attachment metadata |
| 9 | Organization | Letterhead Templates | DT | letterhead_templates | 🟡 P1 | 002F.3D | system_config.letterheads.manage | No | May exist |
| 10 | Organization | Authorized Signatories | DT | authorized_signatories | 🟡 P1 | 002F.3D | master_data.organization.manage | Yes | Signatory master |
| **GROUP 4: Geography & Locations** |
| 11 | Geography | Countries | DT | countries | 🔴 P0 | 002F.3C | master_data.geography.manage | Yes | ISO codes, UAE focus |
| 12 | Geography | Emirates | DT | emirates | 🔴 P0 | 002F.3C | master_data.geography.manage | Yes | 7 UAE emirates |
| 13 | Geography | Cities | DT | cities | 🟡 P1 | 002F.3C | master_data.geography.manage | Yes | Cities by emirate |
| 14 | Geography | Areas / Zones | DT | areas | 🟢 P2 | 002F.3C | master_data.geography.manage | Yes | Industrial/free zones |
| 15 | Geography | Ports | DT | ports | 🟢 P2 | 002F.3C | master_data.geography.manage | Yes | Jebel Ali, Khalifa, etc. |
| 16 | Geography | Work Sites | DT | work_sites | 🟢 P2 | 002F.3D | master_data.geography.manage | No | Project sites |
| **GROUP 5: Finance Basics** |
| 17 | Finance | Currencies | DT | currencies | 🟡 P1 | 002F.3C | master_data.finance_basics.manage | Yes | AED, USD, EUR, SAR |
| 18 | Finance | Payment Terms | DT | payment_terms | 🟡 P1 | 002F.3C | master_data.finance_basics.manage | No | Net 30, Net 60, COD |
| 19 | Finance | Payment Methods | GL | PAYMENT_METHODS | 🟡 P1 | 002F.3C | master_data.finance_basics.manage | No | Cash, Cheque, Transfer |
| 20 | Finance | Tax Types | DT | tax_types | 🔴 P0 | 002F.3C | master_data.finance_basics.manage | Yes | VAT 5%, RCM |
| 21 | Finance | Banks | DT | banks | 🟡 P1 | 002F.3C | master_data.finance_basics.manage | Yes | UAE banks |
| 22 | Finance | Bank Account Types | GL | BANK_ACCOUNT_TYPES | 🟢 P2 | 002F.3C | master_data.finance_basics.manage | No | Current, Savings, LC |
| 23 | Finance | Cost Centers | DT | cost_centers | 🟡 P1 | 002F.3C | master_data.finance_basics.manage | No | Dept/branch centers |
| 24 | Finance | Profit Centers | DT | profit_centers | 🟢 P2 | 002F.3C | master_data.finance_basics.manage | No | Business units |
| **GROUP 6: Units & Measurements** |
| 25 | UOM | UOM Categories | DT | uom_categories | 🔴 P0 | 002F.3C | master_data.uom.manage | No | Length, Weight, Volume |
| 26 | UOM | Units of Measure | DT | units_of_measure | 🔴 P0 | 002F.3C | master_data.uom.manage | Yes | GAL, L, KG, M (UAE units) |
| 27 | UOM | UOM Conversions | DT | uom_conversions | 🟡 P1 | 002F.3C | master_data.uom.manage | Yes | GAL to L conversion |
| **GROUP 7: People & Contacts** |
| 28 | People | Persons | DT | persons | 🔴 P0 | 002F.3E | master_data.people_contacts.manage | Yes | Central person registry |
| 29 | People | Contact Roles | GL | CONTACT_ROLES | 🟡 P1 | 002F.3E | master_data.people_contacts.manage | No | Primary, AP, Procurement |
| 30 | People | Relationship Types | GL | RELATIONSHIP_TYPES | 🟡 P1 | 002F.3E | master_data.people_contacts.manage | No | Emergency, Next of Kin |
| 31 | People | Authorized Signatories | DT | authorized_signatories | 🟡 P1 | 002F.3E | master_data.people_contacts.manage | Yes | Signatory roles |
| **GROUP 8: CRM Master Data** |
| 32 | CRM | Customer Categories | GL | CUSTOMER_CATEGORIES | 🟡 P1 | 002F.3E | master_data.crm.manage | Yes | ADNOC, Government, Private |
| 33 | CRM | Customer Types | GL | CUSTOMER_TYPES | 🟡 P1 | 002F.3E | master_data.crm.manage | No | Direct, End User, Contractor |
| 34 | CRM | Lead Sources | GL | LEAD_SOURCES | 🟡 P1 | 002F.3E | master_data.crm.manage | No | Website, Referral, Exhibition |
| 35 | CRM | Lead Statuses | GL | LEAD_STATUSES | 🟡 P1 | 002F.3E | master_data.crm.manage | No | New, Qualified, Lost |
| 36 | CRM | Opportunity Stages | GL | OPPORTUNITY_STAGES | 🟡 P1 | 002F.3E | master_data.crm.manage | No | Proposal, Negotiation, Won/Lost |
| 37 | CRM | Loss Reasons | GL | LOSS_REASONS | 🟢 P2 | 002F.3E | master_data.crm.manage | No | Price, Competition, Timing |
| 38 | CRM | Client Types | GL | CLIENT_TYPES | 🟡 P1 | 002F.3E | master_data.crm.manage | Yes | ADNOC, TAQA, Government |
| 39 | CRM | Industry Sectors | GL | INDUSTRY_SECTORS | 🟡 P1 | 002F.3E | master_data.crm.manage | No | Oil & Gas, Construction |
| 40 | CRM | Tender Types | GL | TENDER_TYPES | 🟡 P1 | 002F.3E | master_data.crm.manage | Yes | Open, Limited, RFQ |
| 41 | CRM | Proposal Types | GL | PROPOSAL_TYPES | 🟢 P2 | 002F.3E | master_data.crm.manage | No | Technical, Commercial, Joint |
| 42 | CRM | Sales Regions | DT | sales_regions | 🟢 P2 | 002F.3E | master_data.crm.manage | Yes | Abu Dhabi, Dubai, Northern |
| 43 | CRM | Activity Types | GL | CRM_ACTIVITY_TYPES | 🟡 P1 | 002F.3E | master_data.crm.manage | No | Call, Meeting, Site Visit |
| 44 | CRM | *(Numbering)* LEAD-0001 | NUM | global_numbering_rules | 🟡 P1 | 002F.3E | - | No | Lead numbering |
| 45 | CRM | *(Numbering)* OPP-0001 | NUM | global_numbering_rules | 🟡 P1 | 002F.3E | - | No | Opportunity numbering |
| 46 | CRM | *(Numbering)* QUO-0001 | NUM | global_numbering_rules | 🟡 P1 | 002F.3E | - | No | Quotation numbering |
| **GROUP 9: HR Master Data** |
| 47 | HR | Departments | DT | departments | 🔴 P0 | 002F.3F | master_data.hr.manage | No | Organizational units |
| 48 | HR | Sections / Teams | DT | sections | 🟢 P2 | 002F.3F | master_data.hr.manage | No | Sub-departments |
| 49 | HR | Designations | DT | designations | 🔴 P0 | 002F.3F | master_data.hr.manage | No | Job titles |
| 50 | HR | Grades | DT | grades | 🟡 P1 | 002F.3F | master_data.hr.manage | No | Salary bands |
| 51 | HR | Employment Types | GL | EMPLOYMENT_TYPES | 🔴 P0 | 002F.3F | master_data.hr.manage | No | Full-Time, Part-Time |
| 52 | HR | Contract Types | GL | CONTRACT_TYPES | 🔴 P0 | 002F.3F | master_data.hr.manage | Yes | Limited, Unlimited |
| 53 | HR | Leave Types | GL | LEAVE_TYPES | 🔴 P0 | 002F.3F | master_data.hr.manage | Yes | Annual, Sick, Emergency |
| 54 | HR | Visa Types | GL | VISA_TYPES | 🔴 P0 | 002F.3F | master_data.hr.manage | Yes | Employment, Investor, Golden |
| 55 | HR | Work Permit Types | GL | WORK_PERMIT_TYPES | 🔴 P0 | 002F.3F | master_data.hr.manage | Yes | Mainland, Free Zone |
| 56 | HR | Insurance Categories | GL | INSURANCE_CATEGORIES | 🟡 P1 | 002F.3F | master_data.hr.manage | Yes | Basic, Enhanced, Family |
| 57 | HR | Driving License Categories | GL | DRIVING_LICENSE_CATEGORIES | 🔴 P0 | 002F.3F | master_data.hr.manage | Yes | Light, Heavy, Equipment |
| 58 | HR | Training Certificate Types | GL | TRAINING_CERTIFICATE_TYPES | 🟡 P1 | 002F.3F | master_data.hr.manage | Yes | NEBOSH, IOSH, First Aid |
| 59 | HR | Employee Document Types | GL | EMPLOYEE_DOCUMENT_TYPES | 🔴 P0 | 002F.3F | master_data.hr.manage | Yes | Passport, Visa, Emirates ID |
| 60 | HR | *(Numbering)* EMP-0001 | NUM | global_numbering_rules | 🔴 P0 | 002F.3F | - | No | Employee numbering |
| **GROUP 10: Fleet & Equipment Master Data** |
| 61 | Fleet | Asset Categories | DT | asset_categories | 🔴 P0 | 002F.3G | master_data.fleet.manage | No | Vehicle, Equipment, Trailer |
| 62 | Fleet | Vehicle Types | GL | VEHICLE_TYPES | 🔴 P0 | 002F.3G | master_data.fleet.manage | No | Truck, Pickup, Bus |
| 63 | Fleet | Equipment Types | GL | EQUIPMENT_TYPES | 🔴 P0 | 002F.3G | master_data.fleet.manage | No | Excavator, Loader, Dozer |
| 64 | Fleet | Trailer Types | GL | TRAILER_TYPES | 🟡 P1 | 002F.3G | master_data.fleet.manage | No | Flatbed, Low-bed, Tank |
| 65 | Fleet | Attachment Types | GL | ATTACHMENT_TYPES | 🟡 P1 | 002F.3G | master_data.fleet.manage | No | Hammer, Shear, Grappler |
| 66 | Fleet | Makers | DT | asset_makers | 🔴 P0 | 002F.3G | master_data.fleet.manage | No | CAT, Komatsu, Volvo |
| 67 | Fleet | Models | DT | asset_models | 🔴 P0 | 002F.3G | master_data.fleet.manage | No | Models by maker |
| 68 | Fleet | Fuel Types | GL | FUEL_TYPES | 🔴 P0 | 002F.3G | master_data.fleet.manage | Yes | Diesel, Petrol, CNG |
| 69 | Fleet | Meter Types | GL | METER_TYPES | 🔴 P0 | 002F.3G | master_data.fleet.manage | No | Odometer, Hour Meter |
| 70 | Fleet | Registration Types | GL | REGISTRATION_TYPES | 🟡 P1 | 002F.3G | master_data.fleet.manage | Yes | Private, Commercial |
| 71 | Fleet | Insurance Types | GL | INSURANCE_TYPES | 🟡 P1 | 002F.3G | master_data.fleet.manage | Yes | Comprehensive, Third Party |
| 72 | Fleet | GPS Providers | GL | GPS_PROVIDERS | 🟢 P2 | 002F.3G | master_data.fleet.manage | Yes | Etisalat, Du, Geotab |
| 73 | Fleet | Trip Types | GL | TRIP_TYPES | 🟡 P1 | 002F.3G | master_data.fleet.manage | No | Delivery, Collection, Rental |
| 74 | Fleet | Load Types | GL | LOAD_TYPES | 🟡 P1 | 002F.3G | master_data.fleet.manage | No | Scrap, Waste, Equipment |
| 75 | Fleet | Utilization Statuses | GL | UTILIZATION_STATUSES | 🔴 P0 | 002F.3G | master_data.fleet.manage | No | Available, On Job, Maintenance |
| 76 | Fleet | Breakdown Reasons | GL | BREAKDOWN_REASONS | 🟡 P1 | 002F.3G | master_data.fleet.manage | No | Engine, Hydraulic, Electrical |
| 77 | Fleet | Fuel Stations | DT | fuel_stations | 🟡 P1 | 002F.3G | master_data.fleet.manage | Yes | Internal/external stations |
| 78 | Fleet | Fuel Card Providers | GL | FUEL_CARD_PROVIDERS | 🟡 P1 | 002F.3G | master_data.fleet.manage | Yes | ENOC, ADNOC, EPPCO |
| **GROUP 11: Workshop Master Data** |
| 79 | Workshop | Workshop Locations | DT | workshop_locations | 🟡 P1 | 002F.3H | master_data.workshop.manage | No | Workshop/service centers |
| 80 | Workshop | Service Bays | DT | service_bays | 🟢 P2 | 002F.3H | master_data.workshop.manage | No | Bay allocation |
| 81 | Workshop | Maintenance Types | GL | MAINTENANCE_TYPES | 🔴 P0 | 002F.3H | master_data.workshop.manage | No | PM, Corrective, Breakdown |
| 82 | Workshop | PM Templates | DT | pm_templates | 🟡 P1 | 002F.3H | master_data.workshop.manage | No | Maintenance schedules |
| 83 | Workshop | Job Order Types | GL | JOB_ORDER_TYPES | 🔴 P0 | 002F.3H | master_data.workshop.manage | No | PM, Repair, Inspection |
| 84 | Workshop | Failure Categories | GL | FAILURE_CATEGORIES | 🟡 P1 | 002F.3H | master_data.workshop.manage | No | Engine, Hydraulic, Electrical |
| 85 | Workshop | Fault Codes | DT | fault_codes | 🟢 P2 | 002F.3H | master_data.workshop.manage | No | Standard fault library |
| 86 | Workshop | Repair Categories | GL | REPAIR_CATEGORIES | 🟡 P1 | 002F.3H | master_data.workshop.manage | No | Replacement, Rebuild |
| 87 | Workshop | Labor Skill Categories | GL | LABOR_SKILL_CATEGORIES | 🟡 P1 | 002F.3H | master_data.workshop.manage | No | Mechanic, Electrician |
| 88 | Workshop | Inspection Checklists | DT | inspection_checklists | 🟢 P2 | 002F.3H | master_data.workshop.manage | No | Predefined checklists |
| 89 | Workshop | *(Numbering)* JO-0001 | NUM | global_numbering_rules | 🔴 P0 | 002F.3H | - | No | Job order numbering |
| **GROUP 12: Inventory & Procurement Master Data** |
| 90 | Inventory | Item Categories | DT | item_categories | 🔴 P0 | 002F.3H | master_data.inventory.manage | No | Hierarchical categories |
| 91 | Inventory | Item Groups | DT | item_groups | 🟡 P1 | 002F.3H | master_data.inventory.manage | No | Groups within categories |
| 92 | Inventory | Item Types | GL | ITEM_TYPES | 🔴 P0 | 002F.3H | master_data.inventory.manage | No | Spare Part, Consumable |
| 93 | Inventory | Spare Part Categories | DT | spare_part_categories | 🟡 P1 | 002F.3H | master_data.inventory.manage | No | Spare part specific |
| 94 | Inventory | Stock Types | GL | STOCK_TYPES | 🟡 P1 | 002F.3H | master_data.inventory.manage | No | Regular, Consignment |
| 95 | Inventory | Warehouses | DT | warehouses | 🔴 P0 | 002F.3H | master_data.inventory.manage | No | Warehouse locations |
| 96 | Inventory | Warehouse Zones | DT | warehouse_zones | 🟢 P2 | 002F.3H | master_data.inventory.manage | No | Zones within warehouses |
| 97 | Inventory | Bin Locations | DT | bin_locations | FUT | 002F.3H | master_data.inventory.manage | No | Phase 2 - bin tracking |
| 98 | Inventory | Item Brands | DT | item_brands | 🟢 P2 | 002F.3H | master_data.inventory.manage | No | Part brands |
| 99 | Inventory | Item Manufacturers | DT | item_manufacturers | 🟢 P2 | 002F.3H | master_data.inventory.manage | No | Part manufacturers |
| 100 | Procurement | Vendor Categories | GL | VENDOR_CATEGORIES | 🟡 P1 | 002F.3H | master_data.procurement.manage | No | Supplier, Dealer, Subcontractor |
| 101 | Procurement | Supplier Types | GL | SUPPLIER_TYPES | 🟡 P1 | 002F.3H | master_data.procurement.manage | No | Manufacturer, Distributor |
| 102 | Procurement | Purchase Request Types | GL | PURCHASE_REQUEST_TYPES | 🟡 P1 | 002F.3H | master_data.procurement.manage | No | Stock, Project, Emergency |
| 103 | Procurement | Purchase Order Types | GL | PURCHASE_ORDER_TYPES | 🟡 P1 | 002F.3H | master_data.procurement.manage | No | Standard, Blanket, Contract |
| 104 | Procurement | RFQ Types | GL | RFQ_TYPES | 🟢 P2 | 002F.3H | master_data.procurement.manage | No | RFQ categorization |
| 105 | Procurement | Delivery Terms | DT | delivery_terms | 🟡 P1 | 002F.3H | master_data.procurement.manage | No | Delivery conditions |
| 106 | Procurement | Incoterms | GL | INCOTERMS | 🟡 P1 | 002F.3H | master_data.procurement.manage | Yes | FOB, CIF, DAP, DDP |
| 107 | Procurement | Approval Thresholds | DT | approval_thresholds | 🟢 P2 | 002F.3H | master_data.procurement.manage | No | PO approval limits |
| 108 | Procurement | Return Reasons | GL | RETURN_REASONS | 🟡 P1 | 002F.3H | master_data.procurement.manage | No | Wrong Item, Damaged |
| 109 | Procurement | *(Numbering)* PR-0001 | NUM | global_numbering_rules | 🟡 P1 | 002F.3H | - | No | Purchase request |
| 110 | Procurement | *(Numbering)* RFQ-0001 | NUM | global_numbering_rules | 🟡 P1 | 002F.3H | - | No | RFQ numbering |
| 111 | Procurement | *(Numbering)* PO-0001 | NUM | global_numbering_rules | 🔴 P0 | 002F.3H | - | No | Purchase order |
| 112 | Procurement | *(Numbering)* GRN-0001 | NUM | global_numbering_rules | 🔴 P0 | 002F.3H | - | No | Goods receipt |
| **GROUP 13: Basic HSE Master Data** |
| 113 | HSE | Incident Types | GL | INCIDENT_TYPES | 🔴 P0 | 002F.3I | master_data.hse_basic.manage | No | Injury, Property, Near Miss |
| 114 | HSE | Injury Types | GL | INJURY_TYPES | 🔴 P0 | 002F.3I | master_data.hse_basic.manage | No | Cut, Burn, Fracture |
| 115 | HSE | Near Miss Types | GL | NEAR_MISS_TYPES | 🟡 P1 | 002F.3I | master_data.hse_basic.manage | No | Near miss categories |
| 116 | HSE | Environmental Incident Types | GL | ENVIRONMENTAL_INCIDENT_TYPES | 🟡 P1 | 002F.3I | master_data.hse_basic.manage | No | Spill, Emission, Waste |
| 117 | HSE | Risk Levels | GL | RISK_LEVELS | 🔴 P0 | 002F.3I | master_data.hse_basic.manage | No | Extreme, High, Medium, Low |
| 118 | HSE | Likelihood Levels | GL | LIKELIHOOD_LEVELS | 🔴 P0 | 002F.3I | master_data.hse_basic.manage | No | Almost Certain, Likely |
| 119 | HSE | Severity Levels | GL | SEVERITY_LEVELS | 🔴 P0 | 002F.3I | master_data.hse_basic.manage | No | Critical, Major, Minor |
| 120 | HSE | Risk Matrix | SYS | risk_matrix_config | 🟡 P1 | 002F.3I | master_data.hse_basic.manage | No | Risk matrix calculation |
| 121 | HSE | PPE Types | GL | PPE_TYPES | 🔴 P0 | 002F.3I | master_data.hse_basic.manage | No | Helmet, Gloves, Safety Shoes |
| 122 | HSE | PTW Types | GL | PTW_TYPES | 🔴 P0 | 002F.3I | master_data.hse_basic.manage | No | Hot Work, Confined Space |
| 123 | HSE | Inspection Types | GL | INSPECTION_TYPES | 🟡 P1 | 002F.3I | master_data.hse_basic.manage | No | Site, Vehicle, Equipment |
| 124 | HSE | NCR Types | GL | NCR_TYPES | 🟡 P1 | 002F.3I | master_data.hse_basic.manage | No | Non-conformance types |
| 125 | HSE | CAPA Categories | GL | CAPA_CATEGORIES | 🟡 P1 | 002F.3I | master_data.hse_basic.manage | No | Corrective/Preventive |
| 126 | HSE | Root Cause Categories | GL | ROOT_CAUSE_CATEGORIES | 🟡 P1 | 002F.3I | master_data.hse_basic.manage | No | Root cause analysis |
| 127 | HSE | Emergency Drill Types | GL | EMERGENCY_DRILL_TYPES | 🟡 P1 | 002F.3I | master_data.hse_basic.manage | No | Fire, Evacuation |
| 128 | HSE | First Aid Categories | GL | FIRST_AID_CATEGORIES | 🟡 P1 | 002F.3I | master_data.hse_basic.manage | No | First aid treatments |
| **GROUP 14: DMS Master Data** |
| 129 | DMS | Document Categories | DT | document_categories | 🔴 P0 | 002F.3I | master_data.dms.manage | No | High-level categories |
| 130 | DMS | Document Types | DT | document_types | 🔴 P0 | 002F.3I | master_data.dms.manage | Yes | Passport, Trade License |
| 131 | DMS | File Classifications | GL | FILE_CLASSIFICATIONS | 🟡 P1 | 002F.3I | master_data.dms.manage | No | Legal, HR, Finance |
| 132 | DMS | Confidentiality Levels | GL | CONFIDENTIALITY_LEVELS | 🟡 P1 | 002F.3I | master_data.dms.manage | No | Public, Confidential |
| 133 | DMS | Document Statuses | GL | DOCUMENT_STATUSES | 🔴 P0 | 002F.3I | master_data.dms.manage | No | Draft, Active, Expired |
| 134 | DMS | Version Statuses | GL | VERSION_STATUSES | 🟢 P2 | 002F.3I | master_data.dms.manage | No | Draft, Approved |
| 135 | DMS | Retention Periods | GL | RETENTION_PERIODS | 🟡 P1 | 002F.3I | master_data.dms.manage | Yes | 1yr, 5yr, 10yr, Permanent |
| 136 | DMS | Expiry Reminder Rules | DT | expiry_reminder_rules | 🟡 P1 | 002F.3I | master_data.dms.manage | Yes | 30/15/7 day reminders |
| 137 | DMS | Applicable Entity Types | GL | ENTITY_TYPES | 🟡 P1 | 002F.3I | master_data.dms.manage | No | Company, Employee, Asset |
| **GROUP 15: Project & Task Master Data** |
| 138 | Project | Project Types | GL | PROJECT_TYPES | 🟡 P1 | FUT | master_data.project_task.manage | No | Demolition, Scrap, Transport |
| 139 | Project | Project Statuses | GL | PROJECT_STATUSES | 🟡 P1 | FUT | master_data.project_task.manage | No | Planning, Active, Completed |
| 140 | Project | Task Types | GL | TASK_TYPES | 🟡 P1 | FUT | master_data.project_task.manage | No | Site Work, Equipment |
| 141 | Project | Task Statuses | GL | TASK_STATUSES | 🟡 P1 | FUT | master_data.project_task.manage | No | Not Started, In Progress |
| 142 | Project | Milestone Types | GL | MILESTONE_TYPES | 🟢 P2 | FUT | master_data.project_task.manage | No | Milestone categories |
| 143 | Project | Workflow Types | DT | workflow_types | 🟢 P2 | FUT | master_data.project_task.manage | No | Process templates |
| 144 | Project | Workflow Step Types | GL | WORKFLOW_STEP_TYPES | 🟢 P2 | FUT | master_data.project_task.manage | No | Approval, Review |
| 145 | Project | SLA Categories | GL | SLA_CATEGORIES | 🟢 P2 | FUT | master_data.project_task.manage | No | Service level agreements |
| **GROUP 16: Scrap/Waste/Demolition Master Data** |
| 146 | Scrap | Scrap Material Categories | DT | scrap_material_categories | 🔴 P0 | 002F.3J | master_data.scrap_waste_demolition.manage | Yes | Ferrous, Non-Ferrous |
| 147 | Scrap | Metal Types | GL | METAL_TYPES | 🔴 P0 | 002F.3J | master_data.scrap_waste_demolition.manage | Yes | Steel, Aluminum, Copper |
| 148 | Scrap | Scrap Grades | DT | scrap_grades | 🔴 P0 | 002F.3J | master_data.scrap_waste_demolition.manage | Yes | SS 304, SS 316, HMS |
| 149 | Scrap | Material Conditions | GL | MATERIAL_CONDITIONS | 🟡 P1 | 002F.3J | master_data.scrap_waste_demolition.manage | No | Clean, Contaminated, Mixed |
| 150 | Scrap | Collection Methods | GL | COLLECTION_METHODS | 🟡 P1 | 002F.3J | master_data.scrap_waste_demolition.manage | No | On-site, Drop-off, Pickup |
| 151 | Scrap | Loading Methods | GL | LOADING_METHODS | 🟡 P1 | 002F.3J | master_data.scrap_waste_demolition.manage | No | Crane, Forklift, Manual |
| 152 | Scrap | Weighbridge Types | GL | WEIGHBRIDGE_TYPES | 🟡 P1 | 002F.3J | master_data.scrap_waste_demolition.manage | Yes | Fixed, Portable, Mobile |
| 153 | Scrap | Buyer Categories | GL | BUYER_CATEGORIES | 🟡 P1 | 002F.3J | master_data.scrap_waste_demolition.manage | Yes | Local Trader, Export |
| 154 | Scrap | Pricing Basis | GL | PRICING_BASIS | 🟡 P1 | 002F.3J | master_data.scrap_waste_demolition.manage | No | Per Ton, Per Item |
| 155 | Scrap | VAT/RCM Treatment Types | GL | VAT_RCM_TREATMENT_TYPES | 🔴 P0 | 002F.3J | master_data.scrap_waste_demolition.manage | Yes | Standard VAT, RCM, Exempt |
| 156 | Scrap | Waste Categories | GL | WASTE_CATEGORIES | 🔴 P0 | 002F.3J | master_data.scrap_waste_demolition.manage | Yes | Hazardous, Non-Hazardous |
| 157 | Scrap | Hazardous Waste Types | GL | HAZARDOUS_WASTE_TYPES | 🟡 P1 | 002F.3J | master_data.scrap_waste_demolition.manage | Yes | Chemical, Oily, Infectious |
| 158 | Scrap | Disposal Methods | GL | DISPOSAL_METHODS | 🟡 P1 | 002F.3J | master_data.scrap_waste_demolition.manage | Yes | Landfill, Recycling |
| 159 | Scrap | EAD License Categories | GL | EAD_LICENSE_CATEGORIES | 🔴 P0 | 002F.3J | master_data.scrap_waste_demolition.manage | Yes | Collection, Transport, Disposal |
| 160 | Scrap | Manifest Types | GL | MANIFEST_TYPES | 🟡 P1 | 002F.3J | master_data.scrap_waste_demolition.manage | Yes | Waste manifest types |
| 161 | Scrap | Demolition Work Types | GL | DEMOLITION_WORK_TYPES | 🟡 P1 | 002F.3J | master_data.scrap_waste_demolition.manage | No | Structural, Mechanical |
| 162 | Scrap | Demolition Methods | GL | DEMOLITION_METHODS | 🟡 P1 | 002F.3J | master_data.scrap_waste_demolition.manage | No | Manual, Mechanical |
| 163 | Scrap | Isolation Types | GL | ISOLATION_TYPES | 🟡 P1 | 002F.3J | master_data.scrap_waste_demolition.manage | No | Electrical, Mechanical |
| 164 | Scrap | Recyclable Material Categories | GL | RECYCLABLE_MATERIAL_CATEGORIES | 🟢 P2 | 002F.3J | master_data.scrap_waste_demolition.manage | Yes | Metal, Plastic, Wood |

### 6.3 Summary Statistics

| Type | Count | % of Total |
|---|---|---|
| Global Lookup (GL) | 98 | 60% |
| Dedicated Table (DT) | 52 | 32% |
| Existing Table Enhancement (ET) | 2 | 1% |
| Numbering Rules (NUM) | 10 | 6% |
| System/Future (SYS/FUT) | 2 | 1% |
| **TOTAL** | **164** | **100%** |

| Priority | Count | % of Total |
|---|---|---|
| 🔴 P0 - CRITICAL | 62 | 38% |
| 🟡 P1 - HIGH | 78 | 48% |
| 🟢 P2 - MEDIUM | 24 | 14% |
| **TOTAL** | **164** | **100%** |

| Phase | Count | Description |
|---|---|---|
| 002F.3B | 4 | Global Lookups + Dashboard |
| 002F.3C | 18 | Core UAE Shared Master Data |
| 002F.3D | 8 | Organization/Branch Completion |
| 002F.3E | 17 | People/Contacts/CRM Foundation |
| 002F.3F | 14 | HR Master Data |
| 002F.3G | 18 | Fleet/Equipment Master Data |
| 002F.3H | 33 | Workshop/Inventory/Procurement |
| 002F.3I | 25 | Basic HSE/DMS/Compliance |
| 002F.3J | 19 | Scrap/Waste/Demolition |
| FUT | 8 | Future phases (Project/Task) |
| **TOTAL** | **164** | 10 phases planned |

---

## 7. UAE BUSINESS REQUIREMENTS COMPATIBILITY REVIEW

This section verifies that the revised master data plan supports UAE-specific business requirements.

### 7.1 Company / Legal Compliance Requirements

| UAE Requirement | Master Data Support | Table/Lookup | Phase | Notes |
|---|---|---|---|---|
| **Trade License** | ✅ Supported | owner_companies.trade_license_number | 002F.3D | Already exists |
| **License Authority** | ✅ Supported | owner_companies fields + lookup | 002F.3D | DED / FTZ authority type |
| **License Issue Date** | ✅ Supported | owner_companies.trade_license_issue_date | 002F.3D | Expiry tracking |
| **License Expiry Date** | ✅ Supported | owner_companies.trade_license_expiry_date | 002F.3D | Expiry tracking |
| **TRN (Tax Registration Number)** | ✅ Supported | owner_companies.trn | 002F.3D | Already exists |
| **Corporate Tax Number** | ✅ Supported | owner_companies.corporate_tax_number | 002F.3D | New UAE requirement |
| **Chamber of Commerce Certificate** | ✅ Supported | company_documents | 002F.3D | Document attachment |
| **Establishment Card** | ✅ Supported | company_documents | 002F.3D | Document attachment |
| **Immigration File Number** | ✅ Supported | owner_companies fields | 002F.3D | For employee visas |
| **ICV Certificate** | ✅ Supported | owner_companies.icv_certificate_number | 002F.3D | Already exists |
| **ICV Percentage** | ✅ Supported | owner_companies.icv_percentage | 002F.3D | Already exists |
| **ADNOC Supplier Code** | ✅ Supported | owner_companies.adnoc_supplier_code | 002F.3D | Already exists |
| **Signatory Information** | ✅ Supported | authorized_signatories | 002F.3D | Dedicated table |
| **Company Stamp** | ✅ Supported | owner_companies.stamp_image_url | 002F.3D | Image URL field |
| **Letterhead** | ✅ Supported | letterhead_templates | 002F.3D | Template system |
| **Emirates/City/Area** | ✅ Supported | emirates, cities, areas | 002F.3C | Dedicated tables |
| **PO Box** | ✅ Supported | owner_companies.po_box | 002F.3D | Address field |

**Status:** ✅ **ALL REQUIREMENTS SUPPORTED**

### 7.2 HR / Employee Compliance Requirements

| UAE Requirement | Master Data Support | Table/Lookup | Phase | Notes |
|---|---|---|---|---|
| **Emirates ID** | ✅ Supported | persons.emirates_id_number | 002F.3E | Central field |
| **Passport** | ✅ Supported | persons.passport_number | 002F.3E | Central field |
| **Passport Expiry** | ✅ Supported | persons.passport_expiry_date | 002F.3E | Expiry tracking |
| **Visa Types** | ✅ Supported | VISA_TYPES lookup | 002F.3F | Employment, Investor, Golden |
| **Visa Status** | ✅ Supported | VISA_STATUS_TYPES lookup | 002F.3F | Active, Expired, Under Renewal |
| **Labour Card / Work Permit** | ✅ Supported | WORK_PERMIT_TYPES lookup | 002F.3F | Mainland, Free Zone |
| **Medical Insurance** | ✅ Supported | INSURANCE_CATEGORIES lookup | 002F.3F | Basic, Enhanced, Family |
| **Medical Fitness Certificate** | ✅ Supported | EMPLOYEE_DOCUMENT_TYPES lookup | 002F.3F | Document type |
| **Driving License Categories** | ✅ Supported | DRIVING_LICENSE_CATEGORIES lookup | 002F.3F | Light, Heavy, Equipment (Code 3-8) |
| **CICPA / Security Pass** | ✅ Supported | EMPLOYEE_DOCUMENT_TYPES lookup | 002F.3F | Document type |
| **LOA (Letter of Authorization)** | ✅ Supported | EMPLOYEE_DOCUMENT_TYPES lookup | 002F.3F | Document type |
| **HSE Certificates** | ✅ Supported | TRAINING_CERTIFICATE_TYPES lookup | 002F.3F | NEBOSH, IOSH, First Aid |
| **Training Certificates** | ✅ Supported | TRAINING_CERTIFICATE_TYPES lookup | 002F.3F | Various certificate types |
| **Dependent Document Types** | ✅ Supported | DEPENDENT_DOCUMENT_TYPES lookup | 002F.3F | Passport, Visa, Birth Cert |
| **Contract Types** | ✅ Supported | CONTRACT_TYPES lookup | 002F.3F | Limited, Unlimited, Probation |
| **Leave Types** | ✅ Supported | LEAVE_TYPES lookup | 002F.3F | Annual, Sick, Emergency, Hajj |

**Status:** ✅ **ALL REQUIREMENTS SUPPORTED**

### 7.3 Operations / Fleet Compliance Requirements

| UAE Requirement | Master Data Support | Table/Lookup | Phase | Notes |
|---|---|---|---|---|
| **Emirates and Industrial Areas** | ✅ Supported | emirates, cities, areas | 002F.3C | 7 emirates + industrial zones |
| **Ports** | ✅ Supported | ports | 002F.3C | Jebel Ali, Khalifa, Zayed, Fujairah |
| **Work Sites / Locations** | ✅ Supported | work_sites | 002F.3D | Project sites, customer locations |
| **Fleet Permits** | ✅ Supported | asset document types | 002F.3G | Via DMS document types |
| **Registration Types** | ✅ Supported | REGISTRATION_TYPES lookup | 002F.3G | Private, Commercial, Export, Temporary |
| **Insurance Types** | ✅ Supported | INSURANCE_TYPES lookup | 002F.3G | Comprehensive, Third Party |
| **Fuel Units (Diesel Gallons)** | ✅ Supported | units_of_measure + uom_conversions | 002F.3C | Imperial gallon (1 gal = 4.54609 L) |
| **Weight (kg/tons)** | ✅ Supported | units_of_measure | 002F.3C | Kilograms, Metric Tons |
| **Length (meters/centimeters)** | ✅ Supported | units_of_measure | 002F.3C | Meters, Centimeters, Kilometers |
| **GPS Providers (UAE)** | ✅ Supported | GPS_PROVIDERS lookup | 002F.3G | Etisalat, Du, Geotab, Samsara |
| **Fuel Card Providers** | ✅ Supported | FUEL_CARD_PROVIDERS lookup | 002F.3G | ENOC, ADNOC, EPPCO, Emarat, CAFU |
| **RTA/Municipality Permits** | ✅ Supported | asset document types | 002F.3G | Via DMS document types |

**Status:** ✅ **ALL REQUIREMENTS SUPPORTED**

**Critical UAE Fuel Unit Note:**
- Diesel is commonly purchased in **Imperial Gallons** in UAE
- Conversion factor: 1 Imperial Gallon = 4.54609 Liters
- UOM master must support both units with accurate conversion
- Fuel consumption reports must support both units

### 7.4 Scrap / Waste / Demolition Compliance Requirements

| UAE Requirement | Master Data Support | Table/Lookup | Phase | Notes |
|---|---|---|---|---|
| **Scrap Material Types** | ✅ Supported | scrap_material_categories | 002F.3J | Ferrous, Non-Ferrous, Mixed |
| **Metal Grades (UAE Common)** | ✅ Supported | scrap_grades | 002F.3J | Detailed below |
| **Stainless Steel 304** | ✅ Supported | scrap_grades (SS 304) | 002F.3J | Common in UAE projects |
| **Stainless Steel 316** | ✅ Supported | scrap_grades (SS 316) | 002F.3J | Common in UAE projects |
| **Carbon Steel** | ✅ Supported | scrap_grades (Carbon Steel) | 002F.3J | HMS 1/2, structural |
| **Aluminum** | ✅ Supported | scrap_grades (Aluminum) | 002F.3J | Various aluminum grades |
| **Copper** | ✅ Supported | scrap_grades (Copper) | 002F.3J | Bright copper, wire |
| **Brass** | ✅ Supported | scrap_grades (Brass) | 002F.3J | Yellow brass, red brass |
| **Cables** | ✅ Supported | scrap_grades (Cables) | 002F.3J | Insulated, stripped |
| **Coiled Tubing** | ✅ Supported | scrap_grades (Coiled Tubing) | 002F.3J | Oil & gas specific |
| **Hazardous/Non-Hazardous Waste** | ✅ Supported | WASTE_CATEGORIES lookup | 002F.3J | Regulatory classification |
| **EAD License Categories** | ✅ Supported | EAD_LICENSE_CATEGORIES lookup | 002F.3J | Collection, Transport, Disposal |
| **Disposal Methods** | ✅ Supported | DISPOSAL_METHODS lookup | 002F.3J | Landfill, Incineration, Recycling |
| **Manifest Types** | ✅ Supported | MANIFEST_TYPES lookup | 002F.3J | Waste manifest documents |
| **RCM/VAT Treatment** | ✅ Supported | VAT_RCM_TREATMENT_TYPES lookup | 002F.3J | Standard VAT, RCM, Exempt |
| **Weighbridge Ticket Types** | ✅ Supported | WEIGHBRIDGE_TYPES lookup | 002F.3J | Fixed, Portable, Mobile |
| **Demolition Method Categories** | ✅ Supported | DEMOLITION_METHODS lookup | 002F.3J | Manual, Mechanical, Explosive |

**Status:** ✅ **ALL REQUIREMENTS SUPPORTED**

**Critical UAE Scrap Grade Examples:**
- Stainless Steel 304 (most common in UAE)
- Stainless Steel 316 (marine/chemical applications)
- Carbon Steel HMS 1/2 (heavy melting scrap)
- Aluminum Extrusion 6063
- Copper Bright & Shiny (Category 1)
- Brass Yellow (60/40 composition)
- Mixed Metal Scrap
- Contaminated Metal Scrap

### 7.5 CRM / Commercial Compliance Requirements

| UAE Requirement | Master Data Support | Table/Lookup | Phase | Notes |
|---|---|---|---|---|
| **Client Types (UAE Specific)** | ✅ Supported | CLIENT_TYPES lookup | 002F.3E | Detailed below |
| **ADNOC** | ✅ Supported | CLIENT_TYPES (ADNOC) | 002F.3E | State oil company |
| **TAQA** | ✅ Supported | CLIENT_TYPES (TAQA) | 002F.3E | Power & water |
| **DEWA / FEWA / SEWA** | ✅ Supported | CLIENT_TYPES (Utility) | 002F.3E | Utilities |
| **EPC Contractor** | ✅ Supported | CLIENT_TYPES (EPC Contractor) | 002F.3E | Engineering procurement |
| **Construction Company** | ✅ Supported | CLIENT_TYPES (Construction) | 002F.3E | Construction firms |
| **Fabrication Company** | ✅ Supported | CLIENT_TYPES (Fabrication) | 002F.3E | Fabrication shops |
| **Government** | ✅ Supported | CLIENT_TYPES (Government) | 002F.3E | Federal/local government |
| **Private** | ✅ Supported | CLIENT_TYPES (Private) | 002F.3E | Private sector |
| **Tender/Proposal Types** | ✅ Supported | TENDER_TYPES, PROPOSAL_TYPES lookups | 002F.3E | Open, Limited, RFQ |
| **Workgroup Classifications** | ✅ Supported | CUSTOMER_CATEGORIES lookup | 002F.3E | A, B, C classification |
| **Supplier Qualification Statuses** | ✅ Supported | SUPPLIER_QUALIFICATION_STATUSES lookup | 002F.3E | Approved, Pending, Rejected |
| **Payment Terms** | ✅ Supported | payment_terms | 002F.3C | Net 30, Net 60, Net 90 |
| **Advance Payment** | ✅ Supported | payment_terms fields | 002F.3C | Advance % field |
| **Retention** | ✅ Supported | payment_terms fields | 002F.3C | Retention % field |
| **VAT/RCM Readiness** | ✅ Supported | tax_types, VAT_RCM_TREATMENT_TYPES | 002F.3C, 002F.3J | Standard VAT, RCM |

**Status:** ✅ **ALL REQUIREMENTS SUPPORTED**

### 7.6 UAE Master Data Validation Summary

| Category | Total Requirements | Supported | Not Supported | Coverage |
|---|---|---|---|---|
| **Company / Legal** | 17 | 17 | 0 | 100% ✅ |
| **HR / Employee** | 16 | 16 | 0 | 100% ✅ |
| **Operations / Fleet** | 12 | 12 | 0 | 100% ✅ |
| **Scrap / Waste** | 17 | 17 | 0 | 100% ✅ |
| **CRM / Commercial** | 16 | 16 | 0 | 100% ✅ |
| **TOTAL** | **78** | **78** | **0** | **100% ✅** |

**Conclusion:** This revised master data plan is **fully compatible** with UAE business requirements.

---

## 8. FINANCE BASICS ONLY — NO ACCOUNTING MODULE NOW

### 8.1 Scope Clarification

**What is EXCLUDED from current scope:**

❌ **Chart of Accounts (COA)**
- No GL account structure
- No account hierarchies
- No account types (asset, liability, equity, revenue, expense)
- No account numbering system

❌ **General Ledger (GL)**
- No journal entries
- No posting to GL
- No trial balance
- No account balances
- No GL reports

❌ **Financial Statements**
- No balance sheet generation
- No profit & loss (P&L) statement
- No cash flow statement
- No financial ratio analysis

❌ **Accounting Workflows**
- No month-end close process
- No period locking
- No fiscal year management
- No budget vs actual tracking
- No financial consolidation

❌ **Advanced Finance Features**
- No multi-currency trading/hedging
- No complex financial instruments
- No inter-company eliminations
- No cost allocation rules
- No financial forecasting

### 8.2 What IS Included (Finance Basics)

The following master data items ARE included to support operations and future accounting integration:

✅ **Currencies**
- **Purpose:** Support multi-currency pricing, quotations, transactions
- **Table:** `currencies`
- **Fields:** currency_code, currency_name, symbol, decimal_places, is_base_currency
- **Default:** AED as base currency
- **Usage:** Customer invoices, vendor bills, PO, quotations, CRM
- **Phase:** 002F.3C

✅ **Payment Terms**
- **Purpose:** Define payment due dates and discount conditions
- **Table:** `payment_terms`
- **Fields:** term_code, term_name, due_days, discount_days, discount_percentage
- **Examples:** Net 30, Net 60, COD, 2/10 Net 30
- **Usage:** Customers, vendors, sales, procurement
- **Phase:** 002F.3C

✅ **Payment Methods**
- **Purpose:** Categorize payment channels
- **Lookup:** `PAYMENT_METHODS`
- **Values:** Cash, Cheque, Bank Transfer, Credit Card, PDC (Post-Dated Cheque), LC (Letter of Credit)
- **Usage:** Receipt/payment recording, bank reconciliation readiness
- **Phase:** 002F.3C

✅ **Tax Types**
- **Purpose:** UAE VAT and RCM compliance
- **Table:** `tax_types`
- **Fields:** tax_code, tax_name, tax_rate, is_reverse_charge, applies_to_goods, applies_to_services
- **Examples:**
  - VAT_5 (5% VAT)
  - VAT_EXEMPT (0% VAT)
  - RCM (Reverse Charge Mechanism for scrap)
- **Usage:** Invoicing, scrap sales, procurement
- **Phase:** 002F.3C

✅ **Banks**
- **Purpose:** Bank master for payment processing
- **Table:** `banks`
- **Fields:** bank_code, bank_name, swift_code, country_id
- **Examples:** Emirates NBD, ADCB, FAB, Mashreq, ENBD, ADIB
- **Usage:** Bank account setup, payment processing, reconciliation readiness
- **Phase:** 002F.3C

✅ **Bank Account Types**
- **Purpose:** Classify bank account purposes
- **Lookup:** `BANK_ACCOUNT_TYPES`
- **Values:** Current Account, Savings Account, LC Account, Bank Guarantee Account
- **Usage:** Bank account setup
- **Phase:** 002F.3C

✅ **Cost Centers**
- **Purpose:** Track costs by department/branch
- **Table:** `cost_centers`
- **Fields:** cost_center_code, cost_center_name, owner_company_id, branch_id, is_active
- **Examples:** ADMIN, FLEET, WORKSHOP, SCRAP, DEMOLITION
- **Usage:** Expense tracking, job costing, profitability analysis
- **Phase:** 002F.3C

✅ **Profit Centers**
- **Purpose:** Track revenue by business unit
- **Table:** `profit_centers`
- **Fields:** profit_center_code, profit_center_name, owner_company_id, is_active
- **Examples:** SCRAP_TRADING, EQUIPMENT_RENTAL, DEMOLITION_SERVICES, TRANSPORT
- **Usage:** Revenue tracking, business unit profitability
- **Phase:** 002F.3C

### 8.3 Future Accounting Integration Placeholders

When accounting module is implemented in future (Phase 3), these Finance Basics will integrate as follows:

| Finance Basic Item | Future Accounting Integration |
|---|---|
| **Currencies** | Used in multi-currency GL postings, foreign exchange gain/loss |
| **Payment Terms** | Used in AR/AP aging reports, payment due date calculations |
| **Payment Methods** | Used in cash book, bank reconciliation |
| **Tax Types** | Used in tax reports, VAT returns, RCM compliance |
| **Banks** | Linked to bank GL accounts, bank statement reconciliation |
| **Bank Account Types** | Mapped to specific GL account ranges |
| **Cost Centers** | Become GL segment/dimension, appear on all GL entries |
| **Profit Centers** | Become GL segment/dimension, used in segment reporting |

### 8.4 Commercial Terms (Included)

Additional commercial/finance fields needed for CRM and operations:

✅ **Advance Payment Types**
- **Purpose:** Track upfront payment requirements
- **Lookup:** `ADVANCE_PAYMENT_TYPES`
- **Values:** 10%, 20%, 30%, 50%, Full Advance, No Advance
- **Usage:** Quotations, customer contracts, project setup

✅ **Retention Types**
- **Purpose:** Track retention money held
- **Lookup:** `RETENTION_TYPES`
- **Values:** 5%, 10%, No Retention
- **Usage:** Project contracts, final payment processing

✅ **Invoice Status Types** (for readiness)
- **Purpose:** Track invoice lifecycle
- **Lookup:** `INVOICE_STATUS_TYPES`
- **Values:** Draft, Pending Approval, Approved, Issued, Partially Paid, Fully Paid, Overdue, Cancelled
- **Usage:** Invoicing module (when implemented)

### 8.5 What This Means for Module Implementation

| Module | Finance Basics Impact | Accounting Module Requirement |
|---|---|---|
| **CRM** | ✅ Can proceed with Finance Basics | ❌ No accounting needed |
| **Procurement** | ✅ Can proceed with Finance Basics | ❌ No accounting needed |
| **Inventory** | ✅ Can proceed with Finance Basics | ❌ No accounting needed (for now) |
| **Fleet** | ✅ Can proceed with Finance Basics | ❌ No accounting needed (for now) |
| **HR/Payroll** | ✅ Can proceed with Finance Basics | ⚠️ Payroll may need GL integration (Phase 3) |
| **Scrap/Waste** | ✅ Can proceed with Finance Basics | ❌ No accounting needed (for now) |
| **Invoicing** | ✅ Can proceed with Finance Basics | ⚠️ Future GL integration planned |

**Conclusion:** All planned operational modules (CRM, Fleet, HR, Workshop, Procurement, Scrap) can proceed without accounting module. Future accounting integration is designed but not blocking current work.

---

## 9. BASIC HSE MASTER DATA — CURRENT SCOPE

### 9.1 Scope Clarification

**What is EXCLUDED from current scope:**

❌ **Advanced QHSE Enterprise Features**
- Full ESG reporting and sustainability dashboards
- Advanced environmental impact assessments
- Full contractor HSE performance scoring systems
- Automated competency matrix with skill gap analysis
- Advanced risk analytics and predictive safety modeling
- Full regulatory compliance automation (e.g., auto-filing to regulators)
- Chemical substance tracking and SDS management
- Full occupational health management (medical surveillance)
- Advanced behavior-based safety (BBS) programs
- Safety culture surveys and analytics

### 9.2 What IS Included (Basic Operational HSE)

✅ **Incident Management Master Data**

| Item | Type | Purpose | Phase |
|---|---|---|---|
| Incident Types | GL: INCIDENT_TYPES | Injury, Property Damage, Environmental, Near Miss | 002F.3I |
| Injury Types | GL: INJURY_TYPES | Cut, Burn, Fracture, Strain, Bruise, Laceration | 002F.3I |
| Near Miss Types | GL: NEAR_MISS_TYPES | Near miss categorization | 002F.3I |
| Environmental Incident Types | GL: ENVIRONMENTAL_INCIDENT_TYPES | Spill, Leak, Emission, Waste | 002F.3I |
| Incident Severity Levels | GL: SEVERITY_LEVELS | Critical, Major, Moderate, Minor, Negligible | 002F.3I |
| Body Parts | GL: BODY_PARTS | Head, Eyes, Hands, Arms, Legs, Back, Chest | 002F.3I |
| Incident Statuses | GL: INCIDENT_STATUSES | Reported, Under Investigation, Closed | 002F.3I |

**Usage:** Record workplace incidents, near misses, environmental incidents for basic compliance and trending.

---

✅ **Risk Management Master Data**

| Item | Type | Purpose | Phase |
|---|---|---|---|
| Risk Levels | GL: RISK_LEVELS | Extreme, High, Medium, Low, Negligible | 002F.3I |
| Likelihood Levels | GL: LIKELIHOOD_LEVELS | Almost Certain, Likely, Possible, Unlikely, Rare | 002F.3I |
| Severity Levels | GL: SEVERITY_LEVELS | Critical, Major, Moderate, Minor, Negligible | 002F.3I |
| Risk Matrix | SYS: risk_matrix_config | Risk score calculation (Likelihood × Severity) | 002F.3I |
| Risk Categories | GL: RISK_CATEGORIES | Operational, Health, Environmental, Security | 002F.3I |
| Hazard Types | GL: HAZARD_TYPES | Chemical, Physical, Biological, Ergonomic | 002F.3I |

**Usage:** Basic risk assessment for jobs, tasks, sites. Simple risk matrix (5×5 or 3×3).

---

✅ **PPE (Personal Protective Equipment) Master Data**

| Item | Type | Purpose | Phase |
|---|---|---|---|
| PPE Types | GL: PPE_TYPES | Helmet, Safety Glasses, Gloves, Safety Shoes, Hi-Vis Vest, Ear Protection, Respirator, Harness | 002F.3I |
| PPE Requirement Levels | GL: PPE_REQUIREMENT_LEVELS | Mandatory, Recommended, Optional, Not Required | 002F.3I |

**Usage:** Define PPE requirements for jobs, sites, tasks. Track PPE issuance to employees.

---

✅ **Permit to Work (PTW) Master Data**

| Item | Type | Purpose | Phase |
|---|---|---|---|
| PTW Types | GL: PTW_TYPES | Hot Work, Confined Space, Work at Heights, Excavation, Electrical Work, Lifting Operations | 002F.3I |
| PTW Statuses | GL: PTW_STATUSES | Draft, Pending Approval, Approved, Active, Suspended, Closed, Cancelled | 002F.3I |
| Isolation Types | GL: ISOLATION_TYPES | Electrical Isolation, Mechanical Isolation, Chemical Isolation, Lockout/Tagout | 002F.3I |

**Usage:** Manage high-risk work permits, approvals, isolation requirements.

---

✅ **Inspection Master Data**

| Item | Type | Purpose | Phase |
|---|---|---|---|
| Inspection Types | GL: INSPECTION_TYPES | Site Inspection, Vehicle Inspection, Equipment Inspection, PPE Inspection, Housekeeping Inspection | 002F.3I |
| Inspection Statuses | GL: INSPECTION_STATUSES | Scheduled, In Progress, Completed, Overdue | 002F.3I |
| Inspection Results | GL: INSPECTION_RESULTS | Satisfactory, Unsatisfactory, Conditional Pass, Fail | 002F.3I |
| Inspection Checklists | DT: inspection_checklists | Predefined inspection checklist templates | 002F.3I |

**Usage:** Schedule and record safety inspections, track compliance.

---

✅ **NCR (Non-Conformance Report) / CAPA Master Data**

| Item | Type | Purpose | Phase |
|---|---|---|---|
| NCR Types | GL: NCR_TYPES | Safety, Environmental, Quality, Procedural | 002F.3I |
| NCR Statuses | GL: NCR_STATUSES | Open, Under Investigation, CAPA Assigned, Closed, Verified | 002F.3I |
| CAPA Categories | GL: CAPA_CATEGORIES | Corrective Action, Preventive Action, Improvement | 002F.3I |
| CAPA Statuses | GL: CAPA_STATUSES | Planned, In Progress, Implemented, Verified, Closed | 002F.3I |
| Root Cause Categories | GL: ROOT_CAUSE_CATEGORIES | Human Error, Equipment Failure, Procedure Gap, Training Gap, Management System | 002F.3I |

**Usage:** Track non-conformances, assign corrective/preventive actions, verify closure.

---

✅ **Training / Certificate Master Data**

| Item | Type | Purpose | Phase |
|---|---|---|---|
| HSE Certificate Types | GL: HSE_CERTIFICATE_TYPES | NEBOSH, IOSH, OSHA, First Aid, Fire Safety, Confined Space, Working at Heights | 002F.3I |
| Training Statuses | GL: TRAINING_STATUSES | Scheduled, Completed, Expired, Overdue | 002F.3I |
| Trainer Types | GL: TRAINER_TYPES | Internal Trainer, External Provider, Certified Instructor | 002F.3I |

**Usage:** Track employee HSE certifications, expiry dates, training compliance.

---

✅ **Emergency Response Master Data**

| Item | Type | Purpose | Phase |
|---|---|---|---|
| Emergency Drill Types | GL: EMERGENCY_DRILL_TYPES | Fire Drill, Evacuation Drill, First Aid Drill, Spill Response Drill | 002F.3I |
| Emergency Types | GL: EMERGENCY_TYPES | Fire, Medical Emergency, Spill, Explosion, Natural Disaster | 002F.3I |
| First Aid Categories | GL: FIRST_AID_CATEGORIES | Minor Injury, Major Injury, Burns, Cuts, Fractures, CPR | 002F.3I |
| Muster Point Types | GL: MUSTER_POINT_TYPES | Primary Muster Point, Secondary Muster Point | 002F.3I |

**Usage:** Plan and record emergency drills, manage first aid incidents.

---

### 9.3 Basic HSE Module Capabilities

With this master data, the Basic HSE module will support:

✅ **Incident Reporting**
- Record incidents (injury, property damage, near miss, environmental)
- Basic investigation workflow
- Assign corrective actions
- Track closure

✅ **Risk Assessment**
- Create job safety analysis (JSA) / risk assessment
- Apply risk matrix (Likelihood × Severity)
- Define control measures
- Assign PPE requirements

✅ **Permit to Work**
- Issue PTW for high-risk work
- Approval workflow
- Isolation requirements
- Permit closure

✅ **Inspections**
- Schedule safety inspections
- Use predefined checklists
- Record results (pass/fail)
- Generate NCRs from failed inspections

✅ **NCR / CAPA**
- Raise non-conformances
- Investigate root causes
- Assign corrective/preventive actions
- Verify effectiveness

✅ **Training Compliance**
- Track employee HSE certificates
- Expiry date alerts
- Training attendance recording

✅ **Emergency Drills**
- Schedule emergency drills
- Record participation
- Evaluate effectiveness

✅ **Basic Reporting**
- Incident statistics (count, severity, trends)
- Inspection completion rates
- NCR aging reports
- Training compliance status
- PTW statistics

### 9.4 What Will Be Added in Future Advanced QHSE (Phase 4+)

When advanced QHSE is implemented in future:

| Feature | Current Scope | Advanced QHSE (Future) |
|---|---|---|
| **ESG Reporting** | ❌ Not included | ✅ Carbon footprint, sustainability KPIs |
| **Environmental Monitoring** | ⚠️ Basic environmental incidents | ✅ Air quality, waste tracking, emissions |
| **Contractor HSE Scoring** | ❌ Not included | ✅ Contractor performance scoring, prequalification |
| **Competency Matrix** | ❌ Not included | ✅ Skill matrix, gap analysis, training plans |
| **Predictive Safety** | ❌ Not included | ✅ Leading indicators, predictive analytics |
| **Regulatory Reporting** | ⚠️ Manual reports | ✅ Auto-submission to EHS regulators |
| **Chemical Management** | ❌ Not included | ✅ SDS library, chemical inventory, exposure limits |
| **Occupational Health** | ❌ Not included | ✅ Medical surveillance, health monitoring |
| **BBS Programs** | ❌ Not included | ✅ Behavior observations, safety culture surveys |

**Conclusion:** Basic HSE master data provides a solid foundation for operational safety compliance without over-engineering. Advanced features can be added when business maturity and regulatory requirements demand them.

---

## 10. CRM MASTER DATA — FULL SCOPE

### 10.1 CRM Module Overview

CRM (Customer Relationship Management) is a **core planned module** for Alliance Group ERP. The following master data supports:

- Lead management
- Opportunity tracking
- Quotation management
- Customer management
- Sales pipeline
- Activity tracking
- Tender/proposal management

### 10.2 Customer Master Data

✅ **Customer Categories**

| Item | Type | Values | Phase |
|---|---|---|---|
| Customer Categories | GL: CUSTOMER_CATEGORIES | Category A (Key Account), Category B (Regular), Category C (Occasional), Government, ADNOC Group, Private Sector | 002F.3E |

**Purpose:** Classify customers by importance, payment history, volume.

**Usage:** Pricing strategies, credit limits, sales focus, reporting.

---

✅ **Customer Types**

| Item | Type | Values | Phase |
|---|---|---|---|
| Customer Types | GL: CUSTOMER_TYPES | Direct Client, End User, Main Contractor, Subcontractor, Consultant, Government Entity, Private Company | 002F.3E |

**Purpose:** Differentiate customer roles in project chains.

**Usage:** Quotation workflows, payment terms, contract types.

---

✅ **Client Types (UAE Specific)**

| Item | Type | Values | Phase |
|---|---|---|---|
| Client Types | GL: CLIENT_TYPES | ADNOC, TAQA, DEWA, FEWA, SEWA, EPC Contractor, Construction Company, Fabrication Company, Oil & Gas Operator, Government, Private, Other | 002F.3E |

**Purpose:** UAE-specific client classification for major accounts.

**Usage:** Sales targeting, compliance requirements, tender tracking.

---

✅ **Industry Sectors**

| Item | Type | Values | Phase |
|---|---|---|---|
| Industry Sectors | GL: INDUSTRY_SECTORS | Oil & Gas, Construction, Manufacturing, Utilities, Transportation, Government, Real Estate, Hospitality, Healthcare, Other | 002F.3E |

**Purpose:** Classify customers by industry vertical.

**Usage:** Market segmentation, targeted marketing, sales analysis.

---

### 10.3 Lead Management Master Data

✅ **Lead Sources**

| Item | Type | Values | Phase |
|---|---|---|---|
| Lead Sources | GL: LEAD_SOURCES | Website, Cold Call, Email Campaign, Referral, Exhibition/Trade Show, LinkedIn, Direct Visit, Existing Customer, Partner Referral, Other | 002F.3E |

**Purpose:** Track where leads originate.

**Usage:** Marketing ROI analysis, source effectiveness, channel optimization.

---

✅ **Lead Statuses**

| Item | Type | Values | Phase |
|---|---|---|---|
| Lead Statuses | GL: LEAD_STATUSES | New, Contacted, Qualified, Proposal Sent, Negotiation, Converted to Opportunity, Lost, Disqualified | 002F.3E |

**Purpose:** Track lead lifecycle.

**Usage:** Sales pipeline, conversion tracking, follow-up management.

---

✅ **Lead Qualification Criteria** (Optional - Phase 2)

| Item | Type | Purpose | Phase |
|---|---|---|---|
| Qualification Criteria | DT: lead_qualification_criteria | Budget, Authority, Need, Timeline (BANT) scoring | FUT |

---

### 10.4 Opportunity Management Master Data

✅ **Opportunity Stages**

| Item | Type | Values | Phase |
|---|---|---|---|
| Opportunity Stages | GL: OPPORTUNITY_STAGES | Prospecting, Qualification, Needs Analysis, Proposal/Quotation, Negotiation, Closed Won, Closed Lost | 002F.3E |

**Purpose:** Track opportunity progression through sales pipeline.

**Usage:** Sales forecasting, pipeline reporting, win rate analysis.

---

✅ **Loss Reasons**

| Item | Type | Values | Phase |
|---|---|---|---|
| Loss Reasons | GL: LOSS_REASONS | Price Too High, Competitor Won, Budget Constraints, Timing Issues, Requirements Changed, No Response, Solution Not Suitable, Relationship Issues, Other | 002F.3E |

**Purpose:** Track why opportunities are lost.

**Usage:** Win/loss analysis, pricing strategy, competitive intelligence.

---

✅ **Win Probability** (Optional - Phase 2)

| Item | Type | Purpose | Phase |
|---|---|---|---|
| Win Probability Rules | DT: win_probability_rules | Probability % by stage (e.g., Proposal = 40%, Negotiation = 70%) | FUT |

---

### 10.5 Tender / Proposal Master Data

✅ **Tender Types**

| Item | Type | Values | Phase |
|---|---|---|---|
| Tender Types | GL: TENDER_TYPES | Open Tender, Limited Tender, RFQ (Request for Quotation), RFP (Request for Proposal), EOI (Expression of Interest), Pre-Qualification, Frame Agreement | 002F.3E |

**Purpose:** Classify tender opportunities.

**Usage:** Tender tracking, submission workflows, compliance requirements.

---

✅ **Proposal Types**

| Item | Type | Values | Phase |
|---|---|---|---|
| Proposal Types | GL: PROPOSAL_TYPES | Technical Proposal, Commercial Proposal, Joint Proposal (Technical + Commercial), Unsolicited Proposal | 002F.3E |

**Purpose:** Classify proposal submissions.

**Usage:** Proposal tracking, approval workflows.

---

✅ **Proposal Statuses** (Optional - Phase 2)

| Item | Type | Values | Phase |
|---|---|---|---|
| Proposal Statuses | GL: PROPOSAL_STATUSES | Draft, Under Review, Approved, Submitted, Shortlisted, Won, Lost, Cancelled | FUT |

---

### 10.6 Sales & Account Management Master Data

✅ **Sales Regions**

| Item | Type | Purpose | Phase |
|---|---|---|---|
| Sales Regions | DT: sales_regions | Abu Dhabi, Dubai, Sharjah, Northern Emirates, Al Ain, Western Region | 002F.3E |

**Purpose:** Assign territories to sales teams.

**Usage:** Territory management, sales performance by region.

---

✅ **Account Managers** (Links to Employees)

Account managers are employees with specific role assignments. No separate master data needed; use `employees` table + role assignment.

---

✅ **Customer Relationship Types**

| Item | Type | Values | Phase |
|---|---|---|---|
| Relationship Types | GL: CUSTOMER_RELATIONSHIP_TYPES | Key Account, Strategic Partner, Regular Customer, Occasional Customer, Prospective Customer | 002F.3E |

**Purpose:** Define relationship strength.

**Usage:** Customer prioritization, engagement strategies.

---

### 10.7 Activity & Communication Master Data

✅ **CRM Activity Types**

| Item | Type | Values | Phase |
|---|---|---|---|
| Activity Types | GL: CRM_ACTIVITY_TYPES | Phone Call, Email, Meeting, Site Visit, Follow-up, Proposal Submission, Tender Submission, Contract Signing, Customer Complaint, After-Sales Support | 002F.3E |

**Purpose:** Track customer interactions.

**Usage:** Activity logging, follow-up reminders, relationship history.

---

✅ **Meeting Types**

| Item | Type | Values | Phase |
|---|---|---|---|
| Meeting Types | GL: MEETING_TYPES | Initial Meeting, Technical Discussion, Commercial Negotiation, Site Visit, Contract Review, Kick-off Meeting, Review Meeting | 002F.3E |

**Purpose:** Classify meeting purposes.

**Usage:** Meeting scheduling, follow-up tracking.

---

✅ **Communication Channels**

| Item | Type | Values | Phase |
|---|---|---|---|
| Communication Channels | GL: COMMUNICATION_CHANNELS | Email, Phone, WhatsApp, In-Person, Video Conference, Portal/System | 002F.3E |

**Purpose:** Track communication methods.

**Usage:** Communication preference tracking, channel effectiveness.

---

### 10.8 Quotation Master Data

✅ **Quotation Types** (Optional - Phase 2)

| Item | Type | Values | Phase |
|---|---|---|---|
| Quotation Types | GL: QUOTATION_TYPES | Standard Quotation, Budgetary Quotation, Tender Quotation, Revised Quotation | FUT |

---

✅ **Quotation Validity Periods**

| Item | Type | Values | Phase |
|---|---|---|---|
| Validity Periods | GL: QUOTATION_VALIDITY_PERIODS | 7 Days, 15 Days, 30 Days, 60 Days, 90 Days, Custom | 002F.3E |

**Purpose:** Standard quotation validity durations.

**Usage:** Auto-populate quotation expiry dates.

---

### 10.9 CRM Numbering Rules

✅ **Document Numbering**

| Document Type | Prefix | Example | Phase |
|---|---|---|---|
| Lead | LEAD or LD | LEAD-0001 or LD-0001 | 002F.3E |
| Opportunity | OPP | OPP-0001 | 002F.3E |
| Quotation | QUO | QUO-0001 | 002F.3E |
| Proposal | PROP | PROP-0001 | 002F.3E |
| Customer | CUS | CUS-0001 | 002F.3E |

**Implementation:** Add these rules to `global_numbering_rules` table in Phase 002F.3E.

---

### 10.10 CRM Permissions

| Permission | Purpose |
|---|---|
| `crm.dashboard.view` | View CRM dashboard |
| `crm.leads.view` | View leads |
| `crm.leads.manage` | Create/edit/delete leads |
| `crm.opportunities.view` | View opportunities |
| `crm.opportunities.manage` | Create/edit/delete opportunities |
| `crm.quotations.view` | View quotations |
| `crm.quotations.manage` | Create/edit/send quotations |
| `crm.customers.view` | View customer master |
| `crm.customers.manage` | Create/edit customers |
| `crm.activities.view` | View activities |
| `crm.activities.manage` | Log activities |
| `crm.reports.view` | View CRM reports |
| `master_data.crm.view` | View CRM master data |
| `master_data.crm.manage` | Manage CRM master data (categories, sources, stages) |

---

### 10.11 CRM Master Data Summary

| Category | Item Count | Priority | Phase |
|---|---|---|---|
| Customer Classification | 4 | 🟡 HIGH | 002F.3E |
| Lead Management | 2 | 🟡 HIGH | 002F.3E |
| Opportunity Management | 2 | 🟡 HIGH | 002F.3E |
| Tender/Proposal | 2 | 🟡 HIGH | 002F.3E |
| Sales/Account | 2 | 🟢 MEDIUM | 002F.3E |
| Activity/Communication | 3 | 🟡 HIGH | 002F.3E |
| Quotation | 2 | 🟡 HIGH | 002F.3E |
| Numbering Rules | 5 | 🟡 HIGH | 002F.3E |
| **TOTAL** | **22** | — | 002F.3E |

**Conclusion:** CRM master data is comprehensive and ready for implementation in Phase 002F.3E.

---

## 11-20. DETAILED MASTER DATA CATEGORY PLANS

**Note:** Sections 11-17 provide detailed implementation specifications for each master data category. The original plan (002F.3A) provided comprehensive schemas and details for these categories. This revised plan confirms those specifications remain valid with the following clarifications:

### 11. GLOBAL LOOKUP ENGINE REVISED PLAN

**Status:** ✅ Original plan (Section 4) specifications CONFIRMED

**Key Confirmations:**
- Tables: `global_lookup_categories` and `global_lookup_values`
- BIGINT primary keys (not UUID)
- Full audit trail (created_by, updated_by, created_at, updated_at)
- RLS policies: Read-only for authenticated users, manage permission required
- Support for hierarchies (`parent_value_id`)
- Support for color/icon metadata
- Active/inactive flags
- System-locked values protection
- 60+ lookup categories planned (see Section 6 matrix)

**Phase:** 002F.3B

---

### 12. CORE UAE SHARED MASTER DATA REVISED PLAN

**Status:** ✅ Original plan (Section 5) specifications CONFIRMED with UAE emphasis

**Key Additions:**
- **Emirates table** is CRITICAL priority (7 emirates)
- **Units of Measure** must support Imperial Gallons (diesel fuel) with conversion to Liters (1 gal = 4.54609 L)
- **Tax Types** must include RCM (Reverse Charge Mechanism) for scrap trading
- **Payment Terms** must support UAE common terms (Net 30, Net 60, Net 90)
- **Currencies** default to AED as base currency

**UAE-Specific Defaults:**
- Emirates: Abu Dhabi, Dubai, Sharjah, Ajman, UAQ, RAK, Fujairah
- Cities: Include industrial areas (ICAD, Mussafah, Jebel Ali)
- Fuel unit: Imperial Gallon (primary), Liters (secondary)
- Weight: Kilograms, Metric Tons
- Distance: Meters, Kilometers

**Phase:** 002F.3C

---

### 13. ORGANIZATION/BRANCH COMPLETION REVISED PLAN

**Status:** ✅ Original plan (Section 6) specifications CONFIRMED

**Key Enhancements:**
- Add `company_documents` junction table for attachments
- Add `branch_documents` junction table for attachments
- Add expiry tracking with 30/15/7 day notifications
- Add `authorized_signatories` table
- Add `letterhead_templates` table integration

**Existing Tables to Enhance:**
- `owner_companies` - Already has TRN, ICV, trade license fields
- `branches` - Already has operational flags, GPS coordinates

**Phase:** 002F.3D

---

### 14. PEOPLE/CONTACTS/CRM FOUNDATION REVISED PLAN

**Status:** ✅ Original plan (Section 7) specifications CONFIRMED + CRM added

**Key Tables:**
- `persons` - Central person registry
- `employees` - Employee-specific data (extends persons)
- `business_contacts` - External contacts (extends persons)
- `drivers` - Driver-specific data (extends persons)
- `operators` - Equipment operator data (extends persons)
- `customers` - Customer master (separate from vendors)
- `vendors` - Vendor master (separate from customers)

**CRM Integration:**
- Add CRM-specific lookups (lead sources, opportunity stages, client types)
- Link `business_contacts` to `customers` for customer contact roles
- Support sales region assignment

**Phase:** 002F.3E

---

### 15. HR MASTER DATA REVISED PLAN

**Status:** ✅ Original plan (Section 8) specifications CONFIRMED

**Key Tables:**
- `departments` - With hierarchy support (parent_department_id)
- `designations` - Job titles
- `grades` - Salary bands

**UAE-Specific Lookups (35+ items):**
- VISA_TYPES, VISA_STATUS_TYPES, WORK_PERMIT_TYPES
- CONTRACT_TYPES, EMPLOYMENT_TYPES, LEAVE_TYPES
- INSURANCE_CATEGORIES, DRIVING_LICENSE_CATEGORIES
- EMPLOYEE_DOCUMENT_TYPES, TRAINING_CERTIFICATE_TYPES

**Phase:** 002F.3F

---

### 16. FLEET/EQUIPMENT MASTER DATA REVISED PLAN

**Status:** ✅ Original plan (Section 9) specifications CONFIRMED

**Key Tables:**
- `asset_categories` - Vehicle, Heavy Equipment, Trailer, Tool
- `asset_makers` - CAT, Komatsu, Volvo, Mercedes, etc.
- `asset_models` - Models by maker
- `fuel_stations` - Internal/external fuel station master

**UAE-Specific Considerations:**
- Fuel units: Imperial Gallons (diesel standard in UAE)
- GPS providers: Etisalat, Du, Geotab
- Fuel card providers: ENOC, ADNOC, EPPCO, Emarat
- Registration types: Private, Commercial, Export

**Phase:** 002F.3G

---

### 17. WORKSHOP/INVENTORY/PROCUREMENT REVISED PLAN

**Status:** ✅ Original plan (Sections 10-11) specifications CONFIRMED

**Key Tables:**
- `workshop_locations`
- `pm_templates` - Preventive maintenance templates
- `item_categories` - Hierarchical
- `warehouses`
- `spare_part_categories`

**Document Numbering:**
- PR-0001 (Purchase Request)
- RFQ-0001 (Request for Quotation)
- PO-0001 (Purchase Order)
- GRN-0001 (Goods Receipt Note)
- JO-0001 (Job Order)

**Phase:** 002F.3H

---

### 18. BASIC HSE/DMS/COMPLIANCE REVISED PLAN

**Status:** ⚠️ SIMPLIFIED from original plan

**Changes from Original:**
- ❌ Removed: Advanced QHSE features (ESG, contractor scoring, competency matrix)
- ✅ Kept: Basic operational HSE (incidents, PTW, inspections, NCR, CAPA)
- ✅ Added: Document management master data (document types, retention, expiry)

**Key Tables:**
- `document_categories`
- `document_types` - Trade License, Passport, Visa, Contract, etc.
- `expiry_reminder_rules` - 30/15/7 day reminders
- `inspection_checklists` - Predefined HSE checklists

**Phase:** 002F.3I

---

### 19. PROJECT/TASK/WORKFLOW MASTER DATA PLAN

**Status:** 🟢 FUTURE PHASE (not immediate priority)

**Planned Items:**
- PROJECT_TYPES lookup
- PROJECT_STATUSES lookup
- TASK_TYPES lookup
- TASK_STATUSES lookup
- `workflow_types` table
- WORKFLOW_STEP_TYPES lookup
- SLA_CATEGORIES lookup

**Phase:** FUT (when Project module is implemented)

**Note:** These items are planned but not blocking current operational modules.

---

### 20. SCRAP/WASTE/DEMOLITION MASTER DATA REVISED PLAN

**Status:** ✅ NEW DEDICATED PHASE (elevated priority)

**Rationale:** Scrap/Waste/Demolition is core to Alliance Group business and requires UAE-specific compliance. Deserves dedicated phase instead of being bundled with HSE.

**Key Tables:**
- `scrap_material_categories` - Ferrous, Non-Ferrous, Mixed
- `scrap_grades` - SS 304, SS 316, Carbon Steel, HMS, Aluminum, Copper, Brass, Cables, Coiled Tubing

**UAE-Specific Lookups:**
- METAL_TYPES - Steel, Aluminum, Copper, Brass, Bronze
- MATERIAL_CONDITIONS - Clean, Contaminated, Mixed
- WEIGHBRIDGE_TYPES - Fixed, Portable, Mobile
- BUYER_CATEGORIES - Local Trader, Export, Recycler
- VAT_RCM_TREATMENT_TYPES - Standard VAT, RCM, Exempt
- WASTE_CATEGORIES - Hazardous, Non-Hazardous, Recyclable
- HAZARDOUS_WASTE_TYPES - Chemical, Oily, Infectious
- EAD_LICENSE_CATEGORIES - Collection, Transport, Disposal, Treatment
- DISPOSAL_METHODS - Landfill, Incineration, Recycling, Recovery
- DEMOLITION_WORK_TYPES - Structural, Mechanical, Electrical
- DEMOLITION_METHODS - Manual, Mechanical, Explosive, Cutting

**RCM Compliance:**
- Scrap metal sales often subject to Reverse Charge Mechanism (RCM)
- `VAT_RCM_TREATMENT_TYPES` lookup must support RCM designation
- Weighbridge tickets must capture RCM applicability

**Phase:** 002F.3J (dedicated phase)

---

## 21. SYSTEM CONFIGURATION MASTER DATA PLAN

**Purpose:** System-level configuration and templates

**Tables:**
- `letterhead_templates` - Company letterheads
- `email_templates` - System email templates
- `notification_templates` - Notification message templates
- `print_templates` - Print layout templates
- `feature_flags` - Enable/disable features by company

**Lookups:**
- TEMPLATE_TYPES
- NOTIFICATION_CHANNELS
- NOTIFICATION_PRIORITIES

**Permissions:**
- `system_config.letterheads.view`
- `system_config.letterheads.manage`
- `system_config.templates.view`
- `system_config.templates.manage`
- `system_config.features.view`
- `system_config.features.manage`

**RLS:** Company-scoped (letterheads), system-wide (email/notification templates)

**Phase:** 002F.3D (letterheads), later phases (email/notification templates)

---

## 22. ROLES/PERMISSIONS MAPPING

### 22.1 Master Data Permission Structure

All master data permissions follow this pattern:

```
master_data.{group}.{action}
```

**Groups:**
- lookups, organization, geography, finance_basics, uom, people_contacts, crm, hr, fleet, workshop, inventory, procurement, hse_basic, dms, project_task, scrap_waste_demolition

**Actions:**
- view, manage, create, update, delete, export, import, audit_view

### 22.2 Complete Permission List

| Permission Code | Description | Default Roles |
|---|---|---|
| `master_data.dashboard.view` | View master data dashboard | system_admin, group_admin, company_admin |
| `master_data.lookups.view` | View lookup categories/values | All authenticated users |
| `master_data.lookups.manage` | Manage lookup categories/values | system_admin, group_admin |
| `master_data.organization.view` | View organization master data | company_admin, branch_admin |
| `master_data.organization.manage` | Manage organization master data | system_admin, group_admin, company_admin |
| `master_data.organization.documents.manage` | Manage company/branch documents | system_admin, group_admin, company_admin |
| `master_data.geography.view` | View geography master data | All authenticated users |
| `master_data.geography.manage` | Manage geography master data | system_admin, group_admin |
| `master_data.finance_basics.view` | View finance basics master data | All authenticated users |
| `master_data.finance_basics.manage` | Manage finance basics master data | system_admin, group_admin, finance_manager |
| `master_data.uom.view` | View units of measure | All authenticated users |
| `master_data.uom.manage` | Manage units of measure | system_admin, group_admin |
| `master_data.people_contacts.view` | View people/contacts master data | All authenticated users |
| `master_data.people_contacts.manage` | Manage people/contacts master data | system_admin, group_admin, hr_manager |
| `master_data.crm.view` | View CRM master data | sales_manager, crm_user |
| `master_data.crm.manage` | Manage CRM master data | system_admin, group_admin, sales_manager |
| `master_data.hr.view` | View HR master data | hr_manager, hr_user |
| `master_data.hr.manage` | Manage HR master data | system_admin, group_admin, hr_manager |
| `master_data.fleet.view` | View fleet master data | fleet_manager, fleet_user |
| `master_data.fleet.manage` | Manage fleet master data | system_admin, group_admin, fleet_manager |
| `master_data.workshop.view` | View workshop master data | workshop_manager, workshop_user |
| `master_data.workshop.manage` | Manage workshop master data | system_admin, group_admin, workshop_manager |
| `master_data.inventory.view` | View inventory master data | warehouse_manager, inventory_user |
| `master_data.inventory.manage` | Manage inventory master data | system_admin, group_admin, warehouse_manager |
| `master_data.procurement.view` | View procurement master data | procurement_manager, procurement_user |
| `master_data.procurement.manage` | Manage procurement master data | system_admin, group_admin, procurement_manager |
| `master_data.hse_basic.view` | View HSE master data | hse_manager, hse_officer |
| `master_data.hse_basic.manage` | Manage HSE master data | system_admin, group_admin, hse_manager |
| `master_data.dms.view` | View DMS master data | All authenticated users |
| `master_data.dms.manage` | Manage DMS master data | system_admin, group_admin |
| `master_data.project_task.view` | View project/task master data | project_manager, project_user |
| `master_data.project_task.manage` | Manage project/task master data | system_admin, group_admin, project_manager |
| `master_data.scrap_waste_demolition.view` | View scrap/waste master data | operations_manager, scrap_user |
| `master_data.scrap_waste_demolition.manage` | Manage scrap/waste master data | system_admin, group_admin, operations_manager |

### 22.3 Role-Permission Matrix

| Role | Master Data Permissions | Scope |
|---|---|---|
| **system_admin** | ALL master_data.*.manage | Global |
| **group_admin** | ALL master_data.*.manage | Global |
| **company_admin** | master_data.organization.manage, master_data.*.view | Company |
| **branch_admin** | master_data.*.view (no manage) | Branch |
| **finance_manager** | master_data.finance_basics.manage | Company |
| **hr_manager** | master_data.hr.manage, master_data.people_contacts.manage | Company |
| **sales_manager** | master_data.crm.manage | Company |
| **fleet_manager** | master_data.fleet.manage | Company |
| **workshop_manager** | master_data.workshop.manage | Branch |
| **warehouse_manager** | master_data.inventory.manage | Branch |
| **procurement_manager** | master_data.procurement.manage | Company |
| **hse_manager** | master_data.hse_basic.manage | Company |
| **operations_manager** | master_data.scrap_waste_demolition.manage | Company |

### 22.4 Permission Enforcement

Permissions must be enforced at three levels:

1. **UI Level:**
   - Sidebar menu items hidden if user lacks `.view` permission
   - "Add New" / "Edit" / "Delete" buttons hidden if user lacks `.manage` permission
   - Export button hidden if user lacks `.export` permission

2. **Server Action Level:**
   - Server actions check `current_user_has_permission(permission_code)` before execution
   - Return 403 Forbidden if permission check fails
   - Log permission violations to audit log

3. **RLS Level:**
   - Row-level security policies enforce data access at database level
   - Even if server action is bypassed, RLS prevents unauthorized data access
   - See Section 23 for RLS details

---

## 23. RLS STRATEGY FOR ALL MASTER DATA

### 23.1 RLS Policy Patterns

All master data tables follow these RLS patterns:

**Pattern 1: Global Read, Permission-Based Write (Global Lookups)**

```sql
-- Example: global_lookup_categories
ALTER TABLE global_lookup_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lookup_categories_select"
  ON global_lookup_categories
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "lookup_categories_manage"
  ON global_lookup_categories
  FOR ALL
  TO authenticated
  USING (current_user_has_permission('master_data.lookups.manage'))
  WITH CHECK (current_user_has_permission('master_data.lookups.manage'));
```

**Pattern 2: Company-Scoped Read/Write**

```sql
-- Example: departments
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "departments_select"
  ON departments
  FOR SELECT
  TO authenticated
  USING (
    owner_company_id = current_user_owner_company_id()
    OR current_user_is_global_admin()
  );

CREATE POLICY "departments_manage"
  ON departments
  FOR ALL
  TO authenticated
  USING (
    (owner_company_id = current_user_owner_company_id() AND current_user_has_permission('master_data.hr.manage'))
    OR current_user_is_global_admin()
  )
  WITH CHECK (
    (owner_company_id = current_user_owner_company_id() AND current_user_has_permission('master_data.hr.manage'))
    OR current_user_is_global_admin()
  );
```

**Pattern 3: Branch-Scoped Read/Write**

```sql
-- Example: warehouses
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "warehouses_select"
  ON warehouses
  FOR SELECT
  TO authenticated
  USING (
    branch_id = current_user_branch_id()
    OR current_user_owner_company_id() = (SELECT owner_company_id FROM branches WHERE id = branch_id)
    OR current_user_is_global_admin()
  );

CREATE POLICY "warehouses_manage"
  ON warehouses
  FOR ALL
  TO authenticated
  USING (
    (branch_id = current_user_branch_id() AND current_user_has_permission('master_data.inventory.manage'))
    OR current_user_is_global_admin()
  )
  WITH CHECK (
    (branch_id = current_user_branch_id() AND current_user_has_permission('master_data.inventory.manage'))
    OR current_user_is_global_admin()
  );
```

### 23.2 RLS Policy Matrix

| Table Type | SELECT Policy | INSERT/UPDATE/DELETE Policy | Scope |
|---|---|---|---|
| **Global Lookups** | All authenticated users | Requires master_data.lookups.manage | Global |
| **Core Shared** | All authenticated users | Requires specific manage permission | Global |
| **Organization** | Company-scoped | Requires master_data.organization.manage | Company |
| **HR Master** | Company-scoped | Requires master_data.hr.manage | Company |
| **Fleet Master** | Company-scoped | Requires master_data.fleet.manage | Company |
| **Workshop Master** | Branch-scoped | Requires master_data.workshop.manage | Branch |
| **Inventory Master** | Branch-scoped | Requires master_data.inventory.manage | Branch |
| **CRM Master** | Company-scoped | Requires master_data.crm.manage | Company |
| **HSE Master** | Company-scoped | Requires master_data.hse_basic.manage | Company |
| **Scrap Master** | Company-scoped | Requires master_data.scrap_waste_demolition.manage | Company |

### 23.3 System Locked Values Protection

System-locked lookup values must be protected from deletion/modification:

```sql
CREATE POLICY "lookup_values_delete_protection"
  ON global_lookup_values
  FOR DELETE
  TO authenticated
  USING (
    NOT is_system_locked
    AND current_user_has_permission('master_data.lookups.manage')
  );

CREATE POLICY "lookup_values_update_protection"
  ON global_lookup_values
  FOR UPDATE
  TO authenticated
  USING (
    NOT is_system_locked
    OR current_user_is_global_admin()
  )
  WITH CHECK (
    NOT is_system_locked
    OR current_user_is_global_admin()
  );
```

---

## 24. NUMBERING INTEGRATION RULES

### 24.1 Global Numbering Engine Usage

All master data requiring document numbering must use the existing **Global Numbering Engine** (Phase 002F.2).

**Existing Global Numbering Tables:**
- `global_numbering_rules`
- `global_numbering_sequence_states`
- `global_numbering_generated_references`

### 24.2 Document Numbering Rules to Add

| Document Type | Rule Code | Format | Example | Phase |
|---|---|---|---|---|
| Employee | EMPLOYEE or EMP | {DOC}-{SEQ4} | EMP-0001 | 002F.3F |
| Lead | LEAD or LD | {DOC}-{SEQ4} | LEAD-0001 or LD-0001 | 002F.3E |
| Opportunity | OPPORTUNITY or OPP | {DOC}-{SEQ4} | OPP-0001 | 002F.3E |
| Quotation | QUOTATION or QUO | {DOC}-{SEQ4} | QUO-0001 | 002F.3E |
| Proposal | PROPOSAL or PROP | {DOC}-{SEQ4} | PROP-0001 | 002F.3E |
| Customer | CUSTOMER or CUS | {DOC}-{SEQ4} | CUS-0001 | 002F.3E |
| Vendor | VENDOR or VEN | {DOC}-{SEQ4} | VEN-0001 | 002F.3E |
| Purchase Request | PR | {DOC}-{SEQ4} | PR-0001 | 002F.3H |
| RFQ | RFQ | {DOC}-{SEQ4} | RFQ-0001 | 002F.3H |
| Purchase Order | PO | {DOC}-{SEQ4} | PO-0001 | 002F.3H |
| Goods Receipt Note | GRN | {DOC}-{SEQ4} | GRN-0001 | 002F.3H |
| Job Order | JO | {DOC}-{SEQ4} | JO-0001 | 002F.3H |
| Incident Report | INC | {DOC}-{SEQ4} | INC-0001 | 002F.3I |
| PTW | PTW | {DOC}-{SEQ4} | PTW-0001 | 002F.3I |
| NCR | NCR | {DOC}-{SEQ4} | NCR-0001 | 002F.3I |
| Weighbridge Ticket | WBT | {DOC}-{SEQ4} | WBT-0001 | 002F.3J |
| Waste Manifest | WM | {DOC}-{SEQ4} | WM-0001 | 002F.3J |

### 24.3 Numbering Rules Guidelines

1. **Keep It Simple:** Use {DOC}-{SEQ4} format (e.g., PO-0001)
2. **No Company/Branch Prefix:** Company/branch codes are master data identifiers, not transaction prefixes
3. **No Date Components:** Do not include year/month/day in reference numbers
4. **Sequential Only:** Use simple sequential numbering with 4-digit padding
5. **Unique Per Document Type:** Each document type has its own sequence
6. **No Gaps:** Sequence numbers should be continuous (1, 2, 3...)

### 24.4 Organization/Branch Code Strategy

**Confirmed Strategy (from User Decisions):**

1. **company_code** = User-facing business abbreviation (ALGT, ALS, PGI, AET) — REQUIRED, UNIQUE
2. **branch_code** = User-facing location abbreviation (AUH, DXB, SHJ) — REQUIRED within company
3. **internal_reference_number** = Optional system-generated (ORG-0001, BR-0001) via numbering engine

**Document Reference Numbers DO NOT Include Company/Branch Codes:**
- ✅ Correct: EMP-0001, PO-0025, INV-0312
- ❌ Wrong: ALGT-AUH-EMP-0001, ALGT-PO-0025, 2026-01-INV-0312

Company/branch codes are identifiers for master data records, not components of transaction document numbers.

---

## 25. IMPLEMENTATION PHASING PLAN (002F.3B-002F.3K)

This section provides detailed implementation phasing with clear prerequisites and deliverables.

### Phase 002F.3B — Global Lookup / Dropdown Engine

**Duration:** 3-5 days

**Prerequisites:**
- Existing foundation (Phase 002F.2 complete)
- RLS helper functions exist
- Permission system exists

**Deliverables:**
1. Migration: Create `global_lookup_categories` table
2. Migration: Create `global_lookup_values` table
3. Migration: Add indexes and triggers
4. Migration: Enable RLS policies
5. Migration: Seed initial lookup categories (STATUS_TYPES, PRIORITY_LEVELS, etc.)
6. Migration: Seed initial lookup values
7. Component: `<LookupSelect>` reusable dropdown component
8. Component: `<LookupMultiSelect>` for multi-value selection
9. Admin UI: `/admin/master-data/lookups/categories` (list, add, edit)
10. Admin UI: `/admin/master-data/lookups/values` (list, add, edit, drag-drop reorder)
11. Admin UI: `/admin/master-data/lookups/system` (read-only system values)
12. Server Actions: Create/update/delete lookup categories
13. Server Actions: Create/update/delete lookup values
14. Permissions: Add `master_data.lookups.view`, `master_data.lookups.manage`
15. Test Checklist: CRUD operations, permissions, RLS, active/inactive, system-locked protection
16. Implementation Report: Status, decisions, risks

**Acceptance Criteria:**
- ✅ Can create new lookup category
- ✅ Can add values to category
- ✅ Can reorder values
- ✅ System-locked values cannot be deleted by non-admins
- ✅ `<LookupSelect>` component works in test form
- ✅ Export works for lookup categories and values
- ✅ Audit logs capture all changes

---

### Phase 002F.3C — Core UAE Shared Master Data

**Duration:** 5-7 days

**Prerequisites:**
- Phase 002F.3B complete (lookup engine ready)

**Deliverables:**
1. Migration: Create `countries` table with UAE defaults
2. Migration: Create `emirates` table (7 emirates)
3. Migration: Create `cities` table
4. Migration: Create `currencies` table (AED, USD, EUR, SAR)
5. Migration: Create `payment_terms` table
6. Migration: Create `tax_types` table (VAT 5%, RCM)
7. Migration: Create `uom_categories` table
8. Migration: Create `units_of_measure` table (with imperial gallon)
9. Migration: Create `uom_conversions` table (gallon to liter)
10. Migration: Create `banks` table (UAE banks)
11. Migration: Create `cost_centers` table
12. Migration: Create `profit_centers` table
13. Seed Data: UAE emirates, cities, currencies, UOMs
14. Admin UI: Pages for all above tables
15. Permissions: Add `master_data.geography.manage`, `master_data.finance_basics.manage`, `master_data.uom.manage`
16. Test Checklist: UAE data verification, UOM conversions, RLS
17. Implementation Report

**Acceptance Criteria:**
- ✅ All 7 UAE emirates exist
- ✅ Diesel fuel can be entered in gallons and converts to liters correctly
- ✅ AED is base currency
- ✅ VAT 5% and RCM tax types exist
- ✅ Export works for all tables

---

### Phase 002F.3D — Organization / Branch Completion

**Duration:** 3-4 days

**Prerequisites:**
- Phase 002F.3C complete (geography/currency exist)

**Deliverables:**
1. Migration: Create `company_documents` table
2. Migration: Create `branch_documents` table
3. Migration: Create `authorized_signatories` table
4. Migration: Create `letterhead_templates` table
5. Migration: Enhance `owner_companies` table with missing fields
6. Migration: Enhance `branches` table with missing fields
7. Admin UI: Company documents management
8. Admin UI: Branch documents management
9. Admin UI: Authorized signatories management
10. Admin UI: Letterhead templates
11. Expiry Tracking: Notification rules for trade license, ICV, etc.
12. Permissions: Add `master_data.organization.documents.manage`
13. Test Checklist: Document upload, expiry alerts, RLS
14. Implementation Report

**Acceptance Criteria:**
- ✅ Can upload company documents with expiry dates
- ✅ Expiry notifications trigger at 30/15/7 days
- ✅ Letterheads can be created and previewed
- ✅ Authorized signatories linked to companies

---

### Phase 002F.3E — People / Contacts / CRM Foundation

**Duration:** 5-7 days

**Prerequisites:**
- Phase 002F.3C complete (geography exists)
- Phase 002F.3D complete (organization exists)

**Deliverables:**
1. Migration: Create `persons` table
2. Migration: Create `employees` table (extends persons)
3. Migration: Create `business_contacts` table (extends persons)
4. Migration: Create `drivers` table (extends persons)
5. Migration: Create `customers` table
6. Migration: Create `vendors` table
7. Seed Data: CRM lookups (CUSTOMER_CATEGORIES, LEAD_SOURCES, OPPORTUNITY_STAGES, CLIENT_TYPES, INDUSTRY_SECTORS, etc.)
8. Numbering Rules: LEAD-0001, OPP-0001, QUO-0001, CUS-0001, VEN-0001
9. Admin UI: Persons management
10. Admin UI: Customers management
11. Admin UI: Vendors management
12. Admin UI: CRM master data pages (12 menu items)
13. Permissions: Add `master_data.people_contacts.manage`, `master_data.crm.manage`
14. Test Checklist: Person-employee linkage, customer/vendor CRUD, RLS
15. Implementation Report

**Acceptance Criteria:**
- ✅ Can create person and extend to employee
- ✅ Can create customer with customer category
- ✅ Can create vendor with vendor category
- ✅ CRM lookups work in dropdowns
- ✅ Numbering works for LEAD, OPP, QUO, CUS, VEN

---

### Phase 002F.3F — HR Master Data

**Duration:** 4-5 days

**Prerequisites:**
- Phase 002F.3E complete (persons/employees exist)

**Deliverables:**
1. Migration: Create `departments` table (with hierarchy)
2. Migration: Create `designations` table
3. Migration: Create `grades` table
4. Seed Data: HR lookups (EMPLOYMENT_TYPES, CONTRACT_TYPES, LEAVE_TYPES, VISA_TYPES, WORK_PERMIT_TYPES, DRIVING_LICENSE_CATEGORIES, EMPLOYEE_DOCUMENT_TYPES, TRAINING_CERTIFICATE_TYPES, etc.)
5. Numbering Rules: EMP-0001
6. Admin UI: Departments (with hierarchy tree view)
7. Admin UI: Designations
8. Admin UI: Grades
9. Admin UI: HR lookup value pages
10. Permissions: Add `master_data.hr.manage`
11. Test Checklist: Department hierarchy, grade salary bands, RLS
12. Implementation Report

**Acceptance Criteria:**
- ✅ Can create department hierarchy (parent/child)
- ✅ Can create designation and link to grade
- ✅ Employee numbering (EMP-0001) works
- ✅ UAE-specific lookups exist (visa types, work permit types)

---

### Phase 002F.3G — Fleet / Equipment Master Data

**Duration:** 5-6 days

**Prerequisites:**
- Phase 002F.3C complete (UOM, geography exist)

**Deliverables:**
1. Migration: Create `asset_categories` table
2. Migration: Create `asset_makers` table
3. Migration: Create `asset_models` table
4. Migration: Create `fuel_stations` table
5. Seed Data: Fleet lookups (VEHICLE_TYPES, EQUIPMENT_TYPES, TRAILER_TYPES, ATTACHMENT_TYPES, FUEL_TYPES, METER_TYPES, REGISTRATION_TYPES, INSURANCE_TYPES, GPS_PROVIDERS, TRIP_TYPES, UTILIZATION_STATUSES, BREAKDOWN_REASONS, FUEL_CARD_PROVIDERS)
6. Admin UI: Asset categories
7. Admin UI: Makers
8. Admin UI: Models (with maker dropdown)
9. Admin UI: Fuel stations (with GPS map)
10. Admin UI: Fleet lookup value pages
11. Permissions: Add `master_data.fleet.manage`
12. Test Checklist: Maker-model relationship, fuel unit conversions, RLS
13. Implementation Report

**Acceptance Criteria:**
- ✅ Can create asset maker (e.g., CAT)
- ✅ Can create asset model linked to maker (e.g., CAT 320)
- ✅ Fuel stations support GPS coordinates
- ✅ UAE-specific providers exist (ENOC, ADNOC, Etisalat, Du)

---

### Phase 002F.3H — Workshop / Inventory / Procurement Master Data

**Duration:** 7-9 days

**Prerequisites:**
- Phase 002F.3G complete (fleet/equipment exist)

**Deliverables:**
1. Migration: Create `workshop_locations` table
2. Migration: Create `pm_templates` table
3. Migration: Create `item_categories` table (with hierarchy)
4. Migration: Create `item_groups` table
5. Migration: Create `warehouses` table
6. Migration: Create `spare_part_categories` table
7. Seed Data: Workshop lookups (MAINTENANCE_TYPES, JOB_ORDER_TYPES, FAILURE_CATEGORIES, REPAIR_CATEGORIES, LABOR_SKILL_CATEGORIES)
8. Seed Data: Inventory lookups (ITEM_TYPES, STOCK_TYPES)
9. Seed Data: Procurement lookups (VENDOR_CATEGORIES, SUPPLIER_TYPES, PURCHASE_REQUEST_TYPES, PURCHASE_ORDER_TYPES, RETURN_REASONS)
10. Numbering Rules: PR-0001, RFQ-0001, PO-0001, GRN-0001, JO-0001
11. Admin UI: Workshop pages (6 items)
12. Admin UI: Inventory pages (10 items)
13. Admin UI: Procurement pages (9 items)
14. Permissions: Add `master_data.workshop.manage`, `master_data.inventory.manage`, `master_data.procurement.manage`
15. Test Checklist: Item category hierarchy, warehouse setup, PM templates, numbering, RLS
16. Implementation Report

**Acceptance Criteria:**
- ✅ Can create item category hierarchy
- ✅ Can create warehouse and link to branch
- ✅ Can create PM template with checklist
- ✅ Numbering works for PR, RFQ, PO, GRN, JO

---

### Phase 002F.3I — Basic HSE / DMS / Compliance Master Data

**Duration:** 5-6 days

**Prerequisites:**
- Phase 002F.3C complete (geography, lookups exist)

**Deliverables:**
1. Migration: Create `document_categories` table
2. Migration: Create `document_types` table
3. Migration: Create `expiry_reminder_rules` table
4. Migration: Create `inspection_checklists` table
5. Seed Data: HSE lookups (INCIDENT_TYPES, INJURY_TYPES, RISK_LEVELS, LIKELIHOOD_LEVELS, SEVERITY_LEVELS, PPE_TYPES, PTW_TYPES, INSPECTION_TYPES, NCR_TYPES, CAPA_CATEGORIES, ROOT_CAUSE_CATEGORIES, EMERGENCY_DRILL_TYPES)
6. Seed Data: DMS lookups (FILE_CLASSIFICATIONS, CONFIDENTIALITY_LEVELS, DOCUMENT_STATUSES, VERSION_STATUSES, RETENTION_PERIODS, ENTITY_TYPES)
7. Numbering Rules: INC-0001, PTW-0001, NCR-0001
8. Admin UI: HSE pages (16 items)
9. Admin UI: DMS pages (9 items)
10. Permissions: Add `master_data.hse_basic.manage`, `master_data.dms.manage`
11. Test Checklist: Risk matrix, PTW workflows, document expiry alerts, RLS
12. Implementation Report

**Acceptance Criteria:**
- ✅ Can create document type with retention period
- ✅ Can create expiry reminder rule (30/15/7 days)
- ✅ Can create inspection checklist template
- ✅ HSE lookups exist (incident types, PPE types, risk levels)
- ✅ Numbering works for INC, PTW, NCR

---

### Phase 002F.3J — Scrap / Waste / Demolition Master Data

**Duration:** 4-5 days

**Prerequisites:**
- Phase 002F.3C complete (tax types, UOM exist)

**Deliverables:**
1. Migration: Create `scrap_material_categories` table
2. Migration: Create `scrap_grades` table (with UAE-specific grades)
3. Seed Data: Scrap lookups (METAL_TYPES, MATERIAL_CONDITIONS, COLLECTION_METHODS, LOADING_METHODS, WEIGHBRIDGE_TYPES, BUYER_CATEGORIES, PRICING_BASIS, VAT_RCM_TREATMENT_TYPES, WASTE_CATEGORIES, HAZARDOUS_WASTE_TYPES, DISPOSAL_METHODS, EAD_LICENSE_CATEGORIES, MANIFEST_TYPES, DEMOLITION_WORK_TYPES, DEMOLITION_METHODS, ISOLATION_TYPES, RECYCLABLE_MATERIAL_CATEGORIES)
4. Numbering Rules: WBT-0001 (Weighbridge Ticket), WM-0001 (Waste Manifest)
5. Admin UI: Scrap pages (19 items)
6. Permissions: Add `master_data.scrap_waste_demolition.manage`
7. Test Checklist: Scrap grades (SS 304/316), RCM treatment, EAD license types, RLS
8. Implementation Report

**Acceptance Criteria:**
- ✅ Scrap grades exist (SS 304, SS 316, Carbon Steel, HMS, Aluminum, Copper, Brass)
- ✅ VAT/RCM treatment types exist (Standard VAT, RCM, Exempt)
- ✅ EAD license categories exist (Collection, Transport, Disposal)
- ✅ Numbering works for WBT, WM

---

### Phase 002F.3K — Master Data QA & Readiness Gate

**Duration:** 2-3 days

**Prerequisites:**
- ALL prior phases (002F.3B-002F.3J) complete

**Deliverables:**
1. QA Checklist: Verify no hardcoded dropdowns remain in codebase
2. QA Checklist: Verify all menu permissions exist and are assigned to roles
3. QA Checklist: Verify RLS policies are working for all master tables
4. QA Checklist: Verify role access (system_admin, company_admin, branch_admin, normal users)
5. QA Checklist: Verify lookup dropdowns work in all forms
6. QA Checklist: Verify export works for all master data tables
7. QA Checklist: Verify audit logs capture all master data changes
8. QA Checklist: Verify numbering engine integration works for all document types
9. QA Checklist: Verify sidebar hierarchy is clean and permission-based
10. QA Checklist: Verify UAE-specific data exists (emirates, visa types, scrap grades, fuel units)
11. Final Report: Master data implementation status
12. Final Report: Known issues and limitations
13. Final Report: Recommendations for Phase 3 (business modules)
14. Approval: Sign-off from Sameer

**Acceptance Criteria:**
- ✅ No hardcoded dropdown arrays found in codebase search
- ✅ All 60+ permissions exist in permissions table
- ✅ RLS test user can only see company-scoped data
- ✅ Branch user cannot access other branches' data
- ✅ All lookups work in test forms
- ✅ Export generates valid Excel/CSV files
- ✅ Audit log shows who/when/what for master data changes
- ✅ Sidebar menus hide/show based on permissions correctly
- ✅ Sameer approves readiness for Phase 3 (business modules)

---

## 26. IMPLEMENTATION GUARDRAILS

These rules must be followed by all future implementation prompts:

### 26.1 Phasing Rules

1. ❌ **Do NOT implement all master data at once** — Follow phased approach (002F.3B-002F.3K)
2. ✅ **Each phase must complete fully before next phase starts**
3. ✅ **Each phase must produce:** Migration, UI, permissions, RLS, seed data, tests, implementation report
4. ✅ **Each phase must have QA sign-off** before proceeding to next phase

### 26.2 Technical Standards

5. ✅ **Use existing components:** ERPDrawerForm, ERPDataTable, ERPPageHeader, ERPExportMenu
6. ✅ **Integrate with audit logs:** All master data changes must be logged
7. ✅ **Integrate with export:** All master data tables must support export
8. ✅ **Support active/inactive:** All master data must have is_active flag (no hard delete)
9. ✅ **Protect system-locked values:** System values cannot be deleted by normal users
10. ✅ **Use global numbering engine:** All documents must use existing numbering engine (no custom numbering)

### 26.3 Data Integrity Rules

11. ❌ **Do NOT create duplicate dropdown systems** — Use global lookup engine
12. ❌ **Do NOT hardcode dropdown values** in future modules — Use lookups
13. ✅ **All foreign keys must have indexes**
14. ✅ **All tables must have updated_at trigger**
15. ✅ **All tables must have RLS enabled**

### 26.4 Security Rules

16. ❌ **Do NOT bypass permissions** — Always check permissions in server actions
17. ❌ **Do NOT bypass RLS** — All queries must respect RLS policies
18. ✅ **All sensitive operations must be logged** to audit log
19. ✅ **All master data changes must record created_by/updated_by**
20. ✅ **Global admins have bypass rights** but actions are still logged

### 26.5 Review Rules

21. ❌ **Do NOT create unreviewed broad scope changes** — Each phase requires review
22. ✅ **Each phase must have test checklist completed**
23. ✅ **Each phase must have implementation report**
24. ✅ **Known issues must be documented**
25. ✅ **Future recommendations must be documented**

---

## 27. TESTING AND ACCEPTANCE STRATEGY

### 27.1 Unit Testing Strategy

**Scope:** Test individual components in isolation

| Test Category | Test Cases |
|---|---|
| **Table Schema** | ✅ All columns exist<br/>✅ Primary key is BIGINT<br/>✅ Foreign keys have indexes<br/>✅ NOT NULL constraints correct<br/>✅ CHECK constraints correct (if any)<br/>✅ Unique constraints correct |
| **Triggers** | ✅ updated_at trigger fires on UPDATE<br/>✅ Audit trigger logs changes |
| **RLS Policies** | ✅ Unauthenticated users blocked<br/>✅ Authenticated users can SELECT (if policy allows)<br/>✅ Users without permission blocked from INSERT/UPDATE/DELETE<br/>✅ System admins can access all rows<br/>✅ Company users see only company-scoped rows<br/>✅ Branch users see only branch-scoped rows |
| **Server Actions** | ✅ Create action inserts record<br/>✅ Update action modifies record<br/>✅ Delete action marks inactive (not hard delete)<br/>✅ Permission check blocks unauthorized users<br/>✅ Validation errors returned correctly<br/>✅ Audit log entry created |
| **UI Components** | ✅ Form renders without errors<br/>✅ Dropdowns populate correctly<br/>✅ Required field validation works<br/>✅ Save button calls server action<br/>✅ Success message displays<br/>✅ Error messages display<br/>✅ Cancel button closes form |

### 27.2 Integration Testing Strategy

**Scope:** Test interactions between components

| Test Category | Test Cases |
|---|---|
| **Lookup Integration** | ✅ Lookup dropdowns load values from global_lookup_values<br/>✅ Hierarchical lookups show parent/child correctly<br/>✅ Inactive lookup values hidden from dropdown<br/>✅ System-locked values cannot be deleted |
| **Numbering Integration** | ✅ Document numbering generates correct format (e.g., EMP-0001)<br/>✅ Sequence increments correctly<br/>✅ Concurrent requests don't create gaps<br/>✅ Numbering respects company/branch scope (if applicable) |
| **Foreign Key Relationships** | ✅ Dropdown shows related records (e.g., models filtered by maker)<br/>✅ Cannot delete parent if children exist<br/>✅ Cascade updates work correctly |
| **Permission Integration** | ✅ Sidebar menu hides items without permission<br/>✅ "Add New" button hidden without manage permission<br/>✅ Server action rejects request without permission<br/>✅ RLS policy blocks data access without permission |
| **Export Integration** | ✅ Export respects table state (selected rows, filtered rows)<br/>✅ Excel export includes all columns<br/>✅ CSV export formats correctly<br/>✅ PDF export generates readable document |

### 27.3 End-to-End Testing Strategy

**Scope:** Test complete user workflows

| Workflow | Test Steps |
|---|---|
| **Add New Lookup Category** | 1. Navigate to /admin/master-data/lookups/categories<br/>2. Click "Add New"<br/>3. Fill form (category_code, category_name)<br/>4. Click Save<br/>5. Verify success message<br/>6. Verify category appears in list<br/>7. Verify audit log entry created |
| **Add Lookup Values** | 1. Navigate to /admin/master-data/lookups/values<br/>2. Filter by category<br/>3. Click "Add New"<br/>4. Fill form (value_code, value_label_en)<br/>5. Click Save<br/>6. Verify value appears in list<br/>7. Test reordering (drag-drop)<br/>8. Verify sort_order updated |
| **Create Company with Documents** | 1. Navigate to /admin/organizations<br/>2. Click "Add New"<br/>3. Fill company details<br/>4. Upload trade license document<br/>5. Set expiry date (30 days from now)<br/>6. Click Save<br/>7. Verify company created<br/>8. Verify document attached<br/>9. Wait for expiry notification (or simulate date change) |
| **Create Employee with Numbering** | 1. Navigate to /admin/master-data/people/persons<br/>2. Click "Add New"<br/>3. Fill person details<br/>4. Click Save<br/>5. Navigate to /admin/hr/employees<br/>6. Click "Add New"<br/>7. Select person<br/>8. Click "Generate Employee Number"<br/>9. Verify EMP-0001 generated<br/>10. Fill remaining employee details<br/>11. Click Save<br/>12. Verify employee created |

### 27.4 Permission Testing Strategy

**Test Scenarios:**

| User Role | Expected Access |
|---|---|
| **system_admin** | ✅ Can see all master data menus<br/>✅ Can create/edit/delete all master data<br/>✅ Can see all companies' data<br/>✅ Can edit system-locked values |
| **group_admin** | ✅ Can see all master data menus<br/>✅ Can create/edit/delete all master data<br/>✅ Can see all companies' data<br/>❌ Cannot edit system-locked values (unless elevated) |
| **company_admin** | ✅ Can see most master data menus<br/>✅ Can create/edit company-scoped master data<br/>✅ Can see only own company's data<br/>❌ Cannot edit global lookups<br/>❌ Cannot see other companies' data |
| **branch_admin** | ✅ Can see relevant master data menus<br/>⚠️ Can view but not edit most master data<br/>✅ Can see own branch and company data<br/>❌ Cannot see other branches' data |
| **hr_manager** | ✅ Can see HR master data menus<br/>✅ Can create/edit HR master data<br/>✅ Can see own company's HR data<br/>❌ Cannot see fleet/workshop master data |
| **normal_user** | ⚠️ Can view master data (read-only)<br/>❌ Cannot create/edit/delete master data<br/>✅ Can see own company/branch data<br/>❌ Cannot export (unless permission granted) |

### 27.5 UAE Requirements Testing

**Test Cases:**

| UAE Requirement | Test Verification |
|---|---|
| **7 Emirates Exist** | ✅ Query emirates table, count = 7<br/>✅ Abu Dhabi, Dubai, Sharjah, Ajman, UAQ, RAK, Fujairah all present |
| **Diesel Gallon Conversion** | ✅ Enter fuel entry as 10 gallons<br/>✅ Verify converts to 45.46 liters<br/>✅ Verify report shows both units |
| **VAT 5% Exists** | ✅ Query tax_types table<br/>✅ Verify VAT_5 with 5% rate exists |
| **RCM Tax Type Exists** | ✅ Query tax_types table<br/>✅ Verify RCM with is_reverse_charge=true exists |
| **Scrap Grades Exist** | ✅ Query scrap_grades table<br/>✅ Verify SS 304, SS 316, Carbon Steel, HMS exist |
| **Work Permit Types** | ✅ Query WORK_PERMIT_TYPES lookup<br/>✅ Verify Mainland, Free Zone exist |
| **Driving License Categories** | ✅ Query DRIVING_LICENSE_CATEGORIES lookup<br/>✅ Verify Light (Code 3), Heavy (Code 4), Equipment (Code 7) exist |

### 27.6 Acceptance Criteria

**Phase Acceptance (Per Phase):**

- ✅ All test cases pass (unit, integration, E2E)
- ✅ All permissions tested and working
- ✅ RLS policies verified
- ✅ Export works for all tables
- ✅ Audit logs capture all changes
- ✅ No console errors in browser
- ✅ No TypeScript errors
- ✅ No linter errors
- ✅ Implementation report complete
- ✅ Known issues documented

**Final Acceptance (Phase 002F.3K):**

- ✅ All 10 phases complete
- ✅ No hardcoded dropdowns remain
- ✅ All 60+ permissions exist
- ✅ All master data tables have RLS
- ✅ All UAE requirements verified
- ✅ Sidebar menu works correctly
- ✅ All numbering rules work
- ✅ Sameer approves readiness for Phase 3

---

## 28. RISKS, DECISIONS, AND FINAL APPROVAL STATUS

### 28.1 Known Risks

| Risk | Severity | Mitigation | Status |
|---|---|---|---|
| **Scope Creep** | 🟡 MEDIUM | Strict phasing (002F.3B-002F.3K), no features beyond plan | MITIGATED |
| **Performance (Large Lookups)** | 🟢 LOW | Indexed lookups, pagination, virtual scrolling for large dropdowns | PLANNED |
| **Data Migration (If Existing Data)** | 🟡 MEDIUM | If production data exists, create migration scripts to move to new structure | MONITOR |
| **RLS Complexity** | 🟢 LOW | RLS patterns established, test thoroughly | MITIGATED |
| **Permission Explosion** | 🟡 MEDIUM | Grouped permissions (e.g., master_data.hr.manage covers all HR master data) | MITIGATED |
| **Incomplete UAE Requirements** | 🟢 LOW | Section 7 verified 100% coverage | MITIGATED |
| **Module Blocking** | 🔴 HIGH | Business modules (HR, Fleet, CRM) blocked until master data complete | ACCEPTED (intentional sequencing) |

### 28.2 Architectural Decisions

| Decision | Rationale | Alternatives Considered | Final Choice |
|---|---|---|---|
| **Generic Lookup vs Dedicated Tables** | Balance between flexibility and structure | All dedicated tables vs all generic lookups | Hybrid approach (Section 3.2 matrix) |
| **Separate Customers/Vendors Tables** | Different business logic, simpler RLS | Single business_partners table | Separate tables |
| **Persons + Extension Tables** | Central person registry with role-specific extensions | Separate employee/contact tables with duplication | Persons + extensions |
| **BIGINT Primary Keys** | ERP scale requirements (millions of records) | UUID, SERIAL | BIGINT GENERATED BY DEFAULT AS IDENTITY |
| **Simple Document Numbering** | User preference, avoid complexity | Company/branch/date prefixes | Simple {DOC}-{SEQ4} format |
| **No Accounting Module Now** | User decision, focus on operations | Implement full accounting | Finance Basics only |
| **Basic HSE (Not Full QHSE)** | User decision, avoid over-engineering | Full QHSE enterprise suite | Basic operational HSE |
| **CRM Included** | User decision, CRM is core business need | Defer CRM to later | Include CRM in master data |
| **Hierarchical Menu (14 Groups)** | Professional UX, scalability | Flat list of 100+ items | 14-group hierarchy |
| **10 Phases (Not 9)** | Scrap/Waste deserves dedicated phase | Bundle with HSE | Dedicated Phase 002F.3J for Scrap |

### 28.3 Open Questions

| Question | Impact | Recommended Decision | Status |
|---|---|---|---|
| *None* | — | — | ✅ NO BLOCKING QUESTIONS |

### 28.4 Future Considerations

| Item | Timing | Notes |
|---|---|---|
| **Accounting Module** | Phase 3 | Full GL, COA, financial statements |
| **Advanced QHSE** | Phase 4 | ESG, contractor scoring, predictive safety |
| **Multi-Currency Trading** | Phase 3 | When international operations expand |
| **Bin-Level Inventory Tracking** | Phase 2 | When warehouse operations mature |
| **Real-Time GPS Integration** | Phase 2 | When fleet size justifies cost |
| **Project Management Module** | Phase 2-3 | Project master data planned but deferred |
| **Advanced Analytics** | Phase 4 | BI dashboards, predictive analytics |

### 28.5 Final Approval Status

**Status:** ✅ **READY FOR SAMEER REVIEW**

**Approval Checklist:**

- ✅ All 28 sections completed and detailed
- ✅ User decisions (accounting removal, HSE simplification, CRM inclusion) applied
- ✅ Hierarchical menu structure created (14 groups, 164+ items)
- ✅ UAE requirements verified (100% coverage)
- ✅ Master data decision matrix complete (164+ items classified)
- ✅ Permission mapping complete (60+ permissions defined)
- ✅ RLS strategy complete (patterns for all table types)
- ✅ Implementation phasing complete (10 phases, 002F.3B-002F.3K)
- ✅ Implementation guardrails defined (26 rules)
- ✅ Testing strategy complete (unit, integration, E2E, acceptance)
- ✅ Risks identified and mitigated
- ✅ Architectural decisions documented
- ✅ No blocking questions remain

**What This Means:**

1. This revised plan is **implementation-ready**
2. Phases 002F.3B through 002F.3K can proceed immediately upon approval
3. All technical specifications are complete
4. All business requirements are verified
5. No additional planning phases required

**Next Step After Approval:**

Proceed to **Phase 002F.3B** — Global Lookup/Dropdown Engine Implementation

**Target Start Date:** Within 48 hours of Sameer's approval

**Expected Completion Timeline:**
- Phase 002F.3B: 3-5 days
- Phase 002F.3C: 5-7 days
- Phase 002F.3D: 3-4 days
- Phase 002F.3E: 5-7 days
- Phase 002F.3F: 4-5 days
- Phase 002F.3G: 5-6 days
- Phase 002F.3H: 7-9 days
- Phase 002F.3I: 5-6 days
- Phase 002F.3J: 4-5 days
- Phase 002F.3K: 2-3 days
- **Total: 44-57 days** (approximately 6-8 weeks)

---

## DOCUMENT VERSION CONTROL

**Document Version:** 2.0 (Revised)  
**Original Version:** 1.0 (ERP_BASE_002F_3A_GLOBAL_MASTER_DATA_ARCHITECTURE_AND_INVENTORY_PLAN.md)  
**Revision Date:** June 5, 2026  
**Status:** READY FOR SAMEER REVIEW  
**Prepared By:** AI Development Team  
**Reviewer:** Sameer Fahmi (Alliance Group)  

**Major Revisions:**
1. Removed full accounting module (Finance Basics only)
2. Simplified HSE to basic operational scope
3. Added comprehensive CRM master data planning
4. Created 14-group hierarchical menu structure
5. Completed all 28 sections (original had 11 detailed + 17 generic)
6. Added master data decision matrix (164+ items classified)
7. Added complete UAE requirements compatibility review (78 requirements, 100% coverage)
8. Added complete permission mapping (60+ permissions)
9. Added complete RLS strategy for all table types
10. Expanded implementation phasing from 9 to 10 phases (added dedicated Scrap/Waste phase)
11. Added comprehensive implementation guardrails (26 rules)
12. Added comprehensive testing strategy (unit, integration, E2E, acceptance)
13. Verified no blocking architectural decisions or questions remain

**Approval Signature:**

_____________________________________  
Sameer Fahmi, Alliance Group  
Date: ______________

**Approved to proceed to Phase 002F.3B:** ☐ YES ☐ NO (with comments)

**Comments:**

---

**END OF REVISED REPORT**

---

*For implementation status tracking and phase completion records, see: `REPORT_STATUS.md`*
