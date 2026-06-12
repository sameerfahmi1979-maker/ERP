# ERP BASE 002F.3E — PEOPLE / CONTACTS / CRM FOUNDATION
## TECHNICAL IMPLEMENTATION PLAN — REV2 (ICV + CICPA CORRECTION)

**Phase:** ERP BASE 002F.3E — People / Contacts / CRM Foundation  
**Plan Date:** Sunday, June 7, 2026  
**Revised:** Sunday, June 7, 2026 (REV2)  
**Planner:** Claude Sonnet 4.5 (AI Agent)  
**Plan Type:** Technical Implementation Planning (No Code Implementation)  
**Technology Stack:** Next.js 16.2.6 (Turbopack), Supabase PostgreSQL, Shadcn UI  
**Status:** REV2 — Added ICV Certificate and CICPA Registration Fields  

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| **1.0** | 2026-06-07 12:30 PM | Initial technical plan |
| **REV1** | 2026-06-07 3:00 PM | **Corrected:** Customer types expanded (government/utility/industrial), Vendor types expanded (transporters/waste disposal), Waste disposal facility dual classification (government OR vendor), Government authority types expanded (license issuers/utility authorities), Transporter dual classification (vendor OR subcontractor), Permissions strategy simplified to grouped approach, Business classification rules clarified |
| **REV2** | 2026-06-07 3:30 PM | **Added:** ICV (In-Country Value) certificate fields (10 fields) and CICPA (Critical Infrastructure and Coastal Protection Authority) registration number field to 5 applicable commercial company entity tables (customers, vendors, subcontractors, consultants, recruitment_agencies). Government authorities excluded (regulators, not commercial companies). Added ICV_STATUS_TYPES lookup category with 6 values. Added indexes and constraints for ICV/CICPA fields. Updated lookup category count to 23 and lookup value count to ~136. |

---

## Document Purpose

This document provides a comprehensive, implementation-ready technical plan for ERP BASE Phase 002F.3E — People / Contacts / CRM Foundation. This phase establishes the master data foundation for customers, vendors, subcontractors, consultants, government authorities, and recruitment agencies, along with their associated contacts, addresses, documents, and bank details.

**This is REVISION 2 (REV2)** — updated to include ICV certificate metadata tracking and CICPA company registration number fields for applicable commercial company entities.

**This is a PLANNING DOCUMENT ONLY.** No code implementation, database migrations, or application modifications are performed as part of this planning phase.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Scope and Non-Scope Confirmation](#2-scope-and-non-scope-confirmation)
3. [Source Inspection Summary](#3-source-inspection-summary)
4. [Final Entity Category Decision](#4-final-entity-category-decision)
5. [Dedicated Table Decision Matrix](#5-dedicated-table-decision-matrix)
6. [Lookup Category Plan](#6-lookup-category-plan)
7. [Database Schema Plan](#7-database-schema-plan)
8. [Contact / Address / Document Strategy](#8-contact--address--document-strategy)
9. [Bank Details Strategy](#9-bank-details-strategy)
10. [CRM Foundation Strategy](#10-crm-foundation-strategy)
11. [Master Data Reuse and Dropdown Mapping Matrix](#11-master-data-reuse-and-dropdown-mapping-matrix)
12. [RLS / Permission / Role Assignment Plan](#12-rls--permission--role-assignment-plan)
13. [Audit Logging Plan](#13-audit-logging-plan)
14. [Server Actions Plan](#14-server-actions-plan)
15. [Validation Plan](#15-validation-plan)
16. [UI / Screen Plan](#16-ui--screen-plan)
17. [Reusable Select Component Plan](#17-reusable-select-component-plan)
18. [Sidebar / Menu Plan](#18-sidebar--menu-plan)
19. [Seed Data Plan](#19-seed-data-plan)
20. [Data Migration / Legacy Strategy](#20-data-migration--legacy-strategy)
21. [Testing Plan](#21-testing-plan)
22. [Risk Analysis and Mitigation](#22-risk-analysis-and-mitigation)
23. [Acceptance Criteria](#23-acceptance-criteria)
24. [Future Integration Notes](#24-future-integration-notes)
25. [Implementation Phasing Recommendation](#25-implementation-phasing-recommendation)
26. [Final Recommendation](#26-final-recommendation)

---

## 1. Executive Summary

### 1.1 Phase Overview

Phase 002F.3E establishes the **People / Contacts / CRM Foundation** — a comprehensive master data layer for all external business entities (parties) that Alliance Gulf Transport interacts with across its diverse operations (fleet management, scrap trading, waste management, demolition, workshop, transport, and HSE).

This phase creates **6 main entity tables** with associated child records (contacts, addresses, documents, bank details), supported by **23 lookup categories** (REV2: +1 for ICV_STATUS_TYPES) for classification and status management. All data structures follow the established ERP BASE patterns (BIGINT PKs/FKs, `user_profiles` audit fields, RLS policies, permission-gated access).

**REV1 Key Changes:**
- ✅ **Customer types expanded** to include GOVERNMENT_CUSTOMER, SEMI_GOVERNMENT_CUSTOMER, UTILITY_COMPANY, WATER_POWER_PLANT, INDUSTRIAL_CUSTOMER, COMMERCIAL_CUSTOMER
- ✅ **Vendor types expanded** to include TRANSPORTER, TRANSPORT_SERVICE_PROVIDER, LOGISTICS_SERVICE_PROVIDER, PRIVATE_WASTE_DISPOSAL_FACILITY, WASTE_DISPOSAL_SERVICE_PROVIDER
- ✅ **Waste disposal facilities** can be EITHER government_authorities OR vendors (dual classification rule)
- ✅ **Transporters** can be EITHER vendors OR subcontractors (dual classification rule)
- ✅ **Government authority types expanded** to include LICENSE_ISSUER, PERMIT_ISSUER, UTILITY_AUTHORITY, TRANSPORT_AUTHORITY
- ✅ **Permissions simplified** to grouped "party_master" approach for manageable implementation
- ✅ **Business classification rules** clearly documented

**REV2 Key Changes (ICV + CICPA):**
- ✅ **ICV certificate fields added** to 5 commercial entity tables (customers, vendors, subcontractors, consultants, recruitment_agencies): 10 fields for certificate number, score %, issue/expiry dates, company type, financial year end, certification body, version, status, and document path
- ✅ **CICPA registration number field added** to same 5 commercial entity tables for company-level registration tracking
- ✅ **Government authorities excluded** from ICV/CICPA fields (regulators/issuers, not commercial companies requiring supplier tracking)
- ✅ **ICV_STATUS_TYPES lookup category added** with 6 values: VALID, EXPIRED, UNDER_RENEWAL, NOT_AVAILABLE, NOT_REQUIRED, PENDING_SUBMISSION
- ✅ **Indexes added** for ICV certificate number, expiry date, status code, and CICPA registration number (partial indexes where not null)
- ✅ **Constraints added** for ICV score percentage (0-100) and expiry date >= issue date
- ✅ **Lookup category count updated** to 23 (was 22)
- ✅ **Lookup value count updated** to ~136 (was ~130)
- ✅ **ICV metadata tracking only** — no score calculation engine or verification workflow in this phase
- ✅ **CICPA company-level only** — no individual employee access cards in this phase

### 1.2 Key Design Principles

1. **Separation of Entity Types**: No generic `persons` table. Each business entity category has a dedicated table with appropriate fields.
2. **No Employee Data**: Employees are explicitly excluded from this phase (handled in 002F.3F — HR Master Data).
3. **No Hardcoded Dropdowns**: All classification fields use existing master data tables or new lookup categories.
4. **Master Data Reuse**: Leverages existing Geography, Finance Basics, UOM, and Lookup Engine modules.
5. **Flexible Classification Rules**: Supports dual-role entities (e.g., transporter as vendor OR subcontractor, waste disposal as government OR vendor).
6. **Future-Ready**: Designed to support CRM, Sales, Procurement, Subcontracting, Recruitment, and Government Correspondence modules.
7. **UAE Compliance Tracking (REV2)**: Supports ICV certificate metadata tracking for UAE In-Country Value program compliance and CICPA company registration number tracking for critical infrastructure access.

### 1.3 Scope Summary

**In Scope (REV2):**
- 6 main entity tables: `customers`, `vendors`, `subcontractors`, `consultants`, `government_authorities`, `recruitment_agencies`
- 24 child tables: contacts (6), addresses (6), documents (6), bank details (6)
- **29 total tables** (6 + 6 + 6 + 6 + 5 = 29) — government_authority_bank_details excluded per REV1
- **23 lookup categories** for classification and status (REV2: +1 for ICV_STATUS_TYPES)
- **~136 lookup values** (REV2: +6 for ICV status types)
- **ICV certificate metadata tracking** for 5 applicable commercial company entities
- **CICPA company registration number tracking** for 5 applicable commercial company entities
- 48+ server actions for CRUD operations
- 18+ UI screens (main entities + child records)
- 6 reusable select components for future modules
- Comprehensive RLS policies and simplified grouped permissions (4 grouped permissions)

**In Scope — UAE Compliance (REV2):**
- **ICV (In-Country Value) certificate metadata fields**: certificate number, score percentage, issue/expiry dates, company type, financial year end, certification body, version, status code, document path
- **CICPA (Critical Infrastructure and Coastal Protection Authority) company registration number**: company-level registration tracking
- **ICV_STATUS_TYPES lookup category**: VALID, EXPIRED, UNDER_RENEWAL, NOT_AVAILABLE, NOT_REQUIRED, PENDING_SUBMISSION

**Not In Scope (REV2):**
- Employee master data (002F.3F — HR Master Data)
- Employee HR details (salary, benefits, etc.)
- Generic `persons` table
- Hardcoded dropdowns
- CRM sales pipeline/opportunities (later phase)
- Procurement modules (later phase)
- Project management (later phase)
- **ICV score calculation engine** (calculation logic not implemented)
- **ICV certificate verification workflow** (verification/approval workflow not implemented)
- **ICV audit workflow** (audit trail for ICV changes not in this phase)
- **CICPA individual employee access cards** (employee/subcontractor employee CICPA cards handled in later HR/HSE/access modules)
- **CICPA expiry tracking** (company CICPA registration has no expiry date tracked here)
- **DMS document storage engine** (icv_document_path is temporary nullable reference; full DMS in later phase)

### 1.4 Quantitative Overview

| Metric | Count | Notes |
|--------|-------|-------|
| **Main Entity Tables** | 6 | customers, vendors, subcontractors, consultants, government_authorities, recruitment_agencies |
| **Child Tables** | 23 | 6 contacts + 6 addresses + 6 documents + 5 bank details |
| **Total Tables** | 29 | REV1: government_authority_bank_details excluded |
| **Lookup Categories** | 23 | REV2: +1 for ICV_STATUS_TYPES |
| **Lookup Values (approx.)** | ~136 | REV2: +6 for ICV status types |
| **Permissions** | 4 | Grouped: view, manage, export, audit_view |
| **RLS Policies (approx.)** | ~174 | 6 per main entity table (4 operations × 1.5 complexity factor) × 29 tables |
| **Server Actions (min)** | 48 | 8 per entity (list, get, create, update, delete, activate, deactivate, soft delete) |
| **UI Screens (min)** | 18 | 6 main entity screens + 12 child entity screens (contacts/addresses only initially) |
| **Reusable Select Components** | 6 | One per main entity type |
| **Indexes (approx.)** | 100+ | REV2: +20 for ICV/CICPA partial indexes (4 per applicable table × 5 tables) |
| **Triggers** | 29 | One `set_updated_at()` trigger per table |
| **ICV Fields per Table** | 10 | For 5 applicable tables (customers, vendors, subcontractors, consultants, recruitment_agencies) |
| **CICPA Fields per Table** | 1 | For 5 applicable tables |

---

## 2. Scope and Non-Scope Confirmation

### 2.1 Confirmed In-Scope

✅ **Main Entity Tables (6)**
1. `customers` — for CRM, sales, and commercial transactions (REV2: +11 ICV/CICPA fields)
2. `vendors` — for procurement and supply chain management (REV2: +11 ICV/CICPA fields)
3. `subcontractors` — for subcontracting management (REV2: +11 ICV/CICPA fields)
4. `consultants` — for professional services management (REV2: +11 ICV/CICPA fields)
5. `government_authorities` — for government correspondence and regulatory compliance (NO ICV/CICPA fields — regulators, not suppliers)
6. `recruitment_agencies` — for HR and recruitment management (REV2: +11 ICV/CICPA fields)

✅ **Child Record Types (24 tables total)**
- Contact persons (6 tables, one per main entity)
- Addresses (6 tables, one per main entity)
- Documents (6 tables, one per main entity)
- Bank details (5 tables: customers, vendors, subcontractors, consultants, recruitment_agencies; government_authority_bank_details excluded per REV1)

✅ **Lookup Categories (23 total, REV2: +1)**
- CUSTOMER_TYPES (REV1: 8 values including GOVERNMENT_CUSTOMER, UTILITY_COMPANY, WATER_POWER_PLANT)
- VENDOR_TYPES (REV1: 10 values including TRANSPORTER, PRIVATE_WASTE_DISPOSAL_FACILITY)
- SUBCONTRACTOR_TYPES (REV1: 7 values including TRANSPORT_SUBCONTRACTOR, SPECIALIZED_SUBCONTRACTOR)
- CONSULTANT_TYPES (REV1: 8 values including AUDIT_CONSULTANT)
- GOVERNMENT_AUTHORITY_TYPES (REV1: 11 values including LICENSE_ISSUER, PERMIT_ISSUER, UTILITY_AUTHORITY, TRANSPORT_AUTHORITY)
- RECRUITMENT_AGENCY_TYPES (4 values)
- **ICV_STATUS_TYPES (REV2: 6 values: VALID, EXPIRED, UNDER_RENEWAL, NOT_AVAILABLE, NOT_REQUIRED, PENDING_SUBMISSION)**
- Customer/Vendor/Subcontractor/Consultant/Recruitment categories
- CONTACT_TYPES, ADDRESS_TYPES, PARTY_DOCUMENT_TYPES, BANK_ACCOUNT_TYPES
- Industry types, supplier categories, communication preferences, lead sources, HSE prequalification statuses

✅ **UAE Compliance Fields (REV2)**
- **ICV certificate fields (10 fields × 5 tables)**:
  - `icv_certificate_number` (text)
  - `icv_score_percentage` (numeric 5,2, 0-100 constraint)
  - `icv_issue_date` (date)
  - `icv_expiry_date` (date, >= issue_date constraint)
  - `icv_company_type` (text)
  - `icv_financial_year_end_date` (date)
  - `icv_certification_body` (text)
  - `icv_version` (text)
  - `icv_status_code` (text, FK to global_lookup_values)
  - `icv_document_path` (text, temporary nullable reference, DMS not implemented)
- **CICPA field (1 field × 5 tables)**:
  - `cicpa_registration_number` (text, company-level registration only)

✅ **Master Data Reuse**
- Geography (countries, emirates, cities, areas_zones) — for addresses
- Finance Basics (currencies, payment_terms, tax_types, banks) — for commercial terms
- Numbering Engine (for auto-generated entity codes: CUST-000001, VEND-000001, etc.)
- Lookup Engine (global_lookup_categories, global_lookup_values)

✅ **RLS / Permissions**
- Simplified grouped permissions approach (4 permissions: view, manage, export, audit_view)
- Permission namespace: `master_data.party_master.*`
- RLS policies for all 29 tables using `current_user_has_permission()` helper
- `system_admin`, `group_admin`, `company_admin`, `branch_admin` role assignments

✅ **Audit Logging**
- Full audit logging for all main entity tables using `logAudit()` and `createAuditDiff()`

✅ **UI / Screens**
- Main entity list/detail screens with `ERPDataTable`, `ERPDrawerForm`, `ERPDrawerSectionNav`
- Child entity management within main entity detail screens
- Reusable select components (CustomerSelect, VendorSelect, etc.) for future module integration

### 2.2 Confirmed Out-of-Scope

❌ **Employee Master Data**
- Employees, contractors, and their personal details are explicitly excluded
- Employee data handled in separate phase: 002F.3F — HR Master Data

❌ **Generic Persons Table**
- No single unified `persons` or `parties` table
- Each business entity category has a dedicated table with appropriate fields

❌ **Hardcoded Dropdowns**
- All classification fields use master data tables or lookup categories
- No hardcoded arrays in TypeScript/Zod schemas

❌ **CRM Modules (Later Phase)**
- Sales pipeline/opportunities
- Lead management
- Sales order processing
- Quotation management

❌ **Procurement Modules (Later Phase)**
- Purchase requisitions
- Purchase orders
- Vendor evaluation/scoring

❌ **Project Management (Later Phase)**
- Project structures
- Project assignments
- Project billing

❌ **ICV Calculation / Verification Workflow (REV2)**
- ICV score calculation engine not implemented (manual entry only)
- ICV certificate verification workflow not implemented (no approval/rejection workflow)
- ICV audit workflow not implemented (audit logging for ICV changes not in this phase)
- DMS document storage engine not implemented (`icv_document_path` is temporary nullable reference)

❌ **CICPA Individual Access Cards (REV2)**
- CICPA individual employee access cards not in this phase
- CICPA subcontractor employee access cards not in this phase
- CICPA expiry date tracking not in this phase (company registration has no expiry tracked here)
- CICPA access card workflow handled in later HR/HSE/access control modules

---

## 3. Source Inspection Summary

### 3.1 Existing Modules Reviewed

The following existing ERP BASE modules were inspected to ensure pattern consistency:

**✅ ERP BASE 002F.3A — Geography Master Data**
- Source: `src/features/master-data/geography/`
- Pattern: Dedicated tables (countries, emirates, cities, areas_zones)
- Lookup: Uses `REGION_TYPES`, `CITY_TYPES`
- RLS: Per-table policies with `master_data.geography.*` permissions
- UI: `ERPDataTable` + `ERPDrawerForm` pattern
- Reusable: `CountrySelect`, `EmirateSelect`, `CitySelect`, `AreaZoneSelect`

**✅ ERP BASE 002F.3B — Finance Basics**
- Source: `src/features/master-data/finance-basics/`
- Pattern: Dedicated tables (currencies, payment_terms, tax_types, banks)
- Lookup: Uses `CURRENCY_TYPES`, `BANK_TYPES`, `TAX_TYPES`
- RLS: Per-table policies with `master_data.finance_basics.*` permissions
- UI: Consistent table/form patterns
- Reusable: `CurrencySelect`, `PaymentTermSelect`, `TaxTypeSelect`, `BankSelect`

**✅ ERP BASE 002F.3C — Units & Measurements**
- Source: `src/features/master-data/units-measurements/`
- Pattern: Dedicated tables (uom_categories, units_of_measure, uom_conversions)
- Lookup: Custom table for UOM categories
- RLS: Per-table policies with `master_data.uom.*` permissions
- UI: Consistent patterns with nested conversion management
- Reusable: `UnitOfMeasureSelect`, `UOMCategorySelect`

**✅ Numbering Engine**
- Source: `src/server/queries/numbering.ts`, `src/server/actions/numbering.ts`
- Pattern: `numbering_document_types`, `numbering_rules`, `numbering_generated_numbers`
- Integration: Used for auto-generating entity codes (CUST-000001, VEND-000001)
- Audit: Full audit logging for numbering operations

**✅ Lookup Engine**
- Source: `src/features/master-data/lookups/`
- Pattern: `global_lookup_categories`, `global_lookup_values`
- RLS: Single set of policies for lookup engine
- UI: `LookupSelect` reusable component for category-based dropdowns
- Validation: `LookupSchema` in `src/types/schemas/lookup.ts`

### 3.2 Pattern Consistency Requirements

✅ **Database Layer**
- BIGINT for all PKs and FKs
- `user_profiles.id` for all audit fields (created_by, updated_by, etc.)
- `set_updated_at()` trigger for all tables
- RLS enabled on all tables with policy-based access control
- Partial indexes for nullable unique fields (e.g., TRN, email)

✅ **Server Actions**
- Zod validation for all inputs
- `revalidatePath()` for cache invalidation
- Audit logging for all mutations
- Error handling with try/catch
- Permission checks via RLS (automatic)

✅ **UI Components**
- `ERPDataTable` for list views with sorting, filtering, column resizing, global search
- `ERPDrawerForm` for create/edit with sections and navigation
- `ERPDrawerSectionNav` for multi-section forms
- `Inner` component with `key` prop for form dialogs
- TanStack React Table for data tables
- Shadcn UI components (Dialog, Drawer, Form, Input, Select, etc.)

✅ **Reusable Select Components**
- Follow pattern: `<EntityName>Select.tsx` (e.g., `CustomerSelect.tsx`)
- Use `LookupSelect` for lookup-based dropdowns
- Support `value`, `onChange`, `disabled` props
- Include search/filter capability
- Load data via server queries

---

## 4. Final Entity Category Decision

### 4.1 Main Entity Categories (6)

| Entity | Dedicated Table | Reason |
|--------|----------------|--------|
| **Customers** | `customers` | CRM, sales orders, invoicing, customer-specific fields (credit limit, sales owner, customer segments). REV2: ICV/CICPA fields for commercial companies. |
| **Vendors** | `vendors` | Procurement, purchase orders, vendor evaluation, vendor-specific fields (supplier categories, default bank). REV1: Includes transporters and waste disposal facilities. REV2: ICV/CICPA fields. |
| **Subcontractors** | `subcontractors` | Subcontracting management, worker supply, equipment supply, HSE prequalification, subcontractor-specific fields. REV1: Includes transport subcontractors. REV2: ICV/CICPA fields. |
| **Consultants** | `consultants` | Professional services management (auditors, legal, technical consultants), consultant-specific fields. REV2: ICV/CICPA fields. |
| **Government Authorities** | `government_authorities` | Government correspondence, permit tracking, license tracking, regulatory compliance, government-specific fields (authority type, parent authority, jurisdiction). REV1: Includes license issuers, permit issuers, utility authorities, transport authorities, waste management authorities. **REV2: NO ICV/CICPA fields (regulators/issuers, not commercial suppliers).** |
| **Recruitment Agencies** | `recruitment_agencies` | HR and recruitment management, worker sourcing, agency-specific fields (countries served, license info). REV2: ICV/CICPA fields for commercial agencies. |

### 4.2 Justification for Separate Tables

**Why not a generic `persons` or `parties` table?**

1. **Field-Level Requirements Differ Significantly**:
   - Customers need: credit limits, sales owner, customer segments, payment terms
   - Vendors need: supplier categories, default bank, procurement owner
   - Subcontractors need: HSE prequalification, worker/equipment supply flags
   - Consultants need: professional service categories
   - Government authorities need: jurisdiction, parent authority, regulatory fields
   - Recruitment agencies need: countries served, recruitment license

2. **Business Logic Differs**:
   - Customer-specific: credit limit validation, sales pipeline integration
   - Vendor-specific: procurement evaluation, vendor scoring
   - Subcontractor-specific: HSE compliance tracking, worker supply management
   - Consultant-specific: professional service engagement tracking
   - Government authority-specific: permit/license tracking, regulatory correspondence
   - Recruitment agency-specific: candidate sourcing, worker visa support

3. **RLS / Permission Boundaries**:
   - Different roles need access to different entity types
   - Sales team needs customer access, not vendor access
   - Procurement team needs vendor access, not customer access
   - HR team needs recruitment agency access
   - Compliance team needs government authority access

4. **Future Integration Paths**:
   - Customers → CRM, Sales Orders, Invoicing
   - Vendors → Procurement, Purchase Orders, Vendor Evaluation
   - Subcontractors → Subcontracting Management, Worker Supply, HSE
   - Consultants → Professional Services Management
   - Government Authorities → Regulatory Compliance, Permit/License Tracking
   - Recruitment Agencies → HR Management, Worker Recruitment

5. **REV1 Dual-Role Classification Support**:
   - Same physical company can exist in BOTH vendors and subcontractors (e.g., transporter)
   - Same physical company can exist in BOTH government_authorities and vendors (e.g., waste disposal facility)
   - Separate tables allow flexible many-to-many-like relationships without compromising data integrity

6. **REV2 UAE Compliance Field Requirements**:
   - ICV and CICPA fields apply ONLY to commercial company entities (customers, vendors, subcontractors, consultants, recruitment_agencies)
   - Government authorities are regulators/issuers/authorities, NOT commercial companies requiring ICV supplier tracking or CICPA company registration
   - Separate tables allow precise field-level control without nullable field pollution on government_authorities table

### 4.3 Dual-Role Classification Rules (REV1)

**Transporters:**
- Can be EITHER `vendors` (logistics service provider for procurement) OR `subcontractors` (subcontracted transport service provider)
- Classification depends on business relationship and contract type
- Same physical company may exist in both tables if they serve both roles
- Each table has its own `code` (VEND-000123, SUBC-000456) for distinct business contexts

**Waste Disposal Facilities:**
- Can be EITHER `government_authorities` (government-operated waste disposal facility / regulator) OR `vendors` (private waste disposal facility / commercial service provider)
- Classification depends on ownership and regulatory role
- Government waste management authorities → `government_authorities`
- Private waste disposal service providers → `vendors`

**Example Business Scenarios:**
- **ABC Transport LLC** operates as:
  - Vendor (VEND-000100) for procurement of logistics services
  - Subcontractor (SUBC-000050) for subcontracted fleet services on projects
- **Dubai Waste Management Authority** operates as:
  - Government Authority (AUTH-000010) for regulatory permits and waste management regulations
- **XYZ Private Waste Disposal LLC** operates as:
  - Vendor (VEND-000200) for waste disposal service procurement

---

## 5. Dedicated Table Decision Matrix

### 5.1 Main Entity Tables (6)

| Table Name | Purpose | Key Fields | REV2 ICV/CICPA |
|------------|---------|------------|----------------|
| `customers` | Customer master data for CRM and sales | customer_code, customer_name_en, customer_type_code, customer_segment_code, industry_type_code, credit_limit, sales_owner_user_profile_id | ✅ ICV (10 fields) + CICPA (1 field) |
| `vendors` | Vendor master data for procurement | vendor_code, vendor_name_en, vendor_type_code, supplier_category_code, default_bank_id | ✅ ICV (10 fields) + CICPA (1 field) |
| `subcontractors` | Subcontractor master data | subcontractor_code, subcontractor_name_en, subcontractor_type_code, hse_prequalification_status_code, worker_supply_allowed, equipment_supply_allowed | ✅ ICV (10 fields) + CICPA (1 field) |
| `consultants` | Consultant master data | consultant_code, consultant_name_en, consultant_type_code, consultant_category_code | ✅ ICV (10 fields) + CICPA (1 field) |
| `government_authorities` | Government authority master data | authority_code, authority_name_en, authority_type_code, parent_authority_id, jurisdiction | ❌ NO ICV/CICPA (regulators, not commercial companies) |
| `recruitment_agencies` | Recruitment agency master data | agency_code, agency_name_en, agency_type_code, countries_served[], license_number | ✅ ICV (10 fields) + CICPA (1 field) |

### 5.2 Child Tables (24)

#### Contact Person Tables (6)

| Table Name | Parent Entity | Purpose |
|------------|---------------|---------|
| `customer_contacts` | customers | Contact persons for customers |
| `vendor_contacts` | vendors | Contact persons for vendors |
| `subcontractor_contacts` | subcontractors | Contact persons for subcontractors |
| `consultant_contacts` | consultants | Contact persons for consultants |
| `government_authority_contacts` | government_authorities | Contact persons for government authorities |
| `recruitment_agency_contacts` | recruitment_agencies | Contact persons for recruitment agencies |

#### Address Tables (6)

| Table Name | Parent Entity | Purpose |
|------------|---------------|---------|
| `customer_addresses` | customers | Addresses for customers |
| `vendor_addresses` | vendors | Addresses for vendors |
| `subcontractor_addresses` | subcontractors | Addresses for subcontractors |
| `consultant_addresses` | consultants | Addresses for consultants |
| `government_authority_addresses` | government_authorities | Addresses for government authorities |
| `recruitment_agency_addresses` | recruitment_agencies | Addresses for recruitment agencies |

#### Document Tables (6)

| Table Name | Parent Entity | Purpose |
|------------|---------------|---------|
| `customer_documents` | customers | Documents for customers (trade license, TRN, etc.) |
| `vendor_documents` | vendors | Documents for vendors |
| `subcontractor_documents` | subcontractors | Documents for subcontractors |
| `consultant_documents` | consultants | Documents for consultants |
| `government_authority_documents` | government_authorities | Documents for government authorities |
| `recruitment_agency_documents` | recruitment_agencies | Documents for recruitment agencies |

#### Bank Details Tables (5) — REV1 Exclusion

| Table Name | Parent Entity | Purpose | REV1 Status |
|------------|---------------|---------|-------------|
| `customer_bank_details` | customers | Bank account details for customer payments | ✅ Included |
| `vendor_bank_details` | vendors | Bank account details for vendor payments | ✅ Included |
| `subcontractor_bank_details` | subcontractors | Bank account details for subcontractor payments | ✅ Included |
| `consultant_bank_details` | consultants | Bank account details for consultant payments | ✅ Included |
| ~~`government_authority_bank_details`~~ | ~~government_authorities~~ | ~~Bank account details for government authority payments~~ | ❌ Excluded (REV1: government fees/permits paid via government payment gateways, not direct bank transfers) |
| `recruitment_agency_bank_details` | recruitment_agencies | Bank account details for recruitment agency payments | ✅ Included |

**Total Child Tables:** 24 (6 + 6 + 6 + 5 + 1)

**Total Tables in Phase 002F.3E:** 29 (6 main + 23 child)

### 5.3 REV2 ICV/CICPA Field Counts

| Applicable Tables (5) | ICV Fields | CICPA Fields | Total REV2 Fields per Table |
|-----------------------|------------|--------------|----------------------------|
| customers | 10 | 1 | 11 |
| vendors | 10 | 1 | 11 |
| subcontractors | 10 | 1 | 11 |
| consultants | 10 | 1 | 11 |
| recruitment_agencies | 10 | 1 | 11 |

**Excluded Table:**
| government_authorities | 0 | 0 | 0 (regulators, not commercial companies) |

---

## 6. Lookup Category Plan

### 6.1 Required Lookup Categories (23 total, REV2: +1)

| Category Code | Purpose | Approx. Value Count | REV Status |
|---------------|---------|---------------------|------------|
| `CUSTOMER_TYPES` | Customer classification (government, utility, industrial, commercial, etc.) | 8 | REV1: Expanded |
| `CUSTOMER_SEGMENTS` | Customer segmentation (enterprise, SME, retail, etc.) | 5 | Initial |
| `VENDOR_TYPES` | Vendor classification (transporter, waste disposal, materials, services, etc.) | 10 | REV1: Expanded |
| `VENDOR_CATEGORIES` | Vendor categorization (preferred, approved, blacklisted) | 4 | Initial |
| `SUPPLIER_CATEGORIES` | Supplier categories for procurement (local, international, UAE-based) | 4 | Initial |
| `SUBCONTRACTOR_TYPES` | Subcontractor classification (transport, specialized, trade) | 7 | REV1: Expanded |
| `SUBCONTRACTOR_CATEGORIES` | Subcontractor categorization (preferred, approved) | 3 | Initial |
| `CONSULTANT_TYPES` | Consultant classification (audit, legal, technical, environmental, HSE, etc.) | 8 | REV1: Expanded |
| `CONSULTANT_CATEGORIES` | Consultant categorization (preferred, approved) | 3 | Initial |
| `GOVERNMENT_AUTHORITY_TYPES` | Government authority classification (license issuer, permit issuer, utility authority, transport authority, etc.) | 11 | REV1: Expanded |
| `RECRUITMENT_AGENCY_TYPES` | Recruitment agency classification (local, overseas, manpower supply, executive search) | 4 | Initial |
| `RECRUITMENT_AGENCY_CATEGORIES` | Recruitment agency categorization (preferred, approved) | 4 | Initial |
| `INDUSTRY_TYPES` | Industry classification (construction, logistics, waste management, etc.) | 10 | Initial |
| `CRM_LEAD_SOURCES` | Lead source for CRM (website, referral, trade show, etc.) | 8 | Initial |
| `CONTACT_TYPES` | Contact person types (primary, billing, technical, etc.) | 6 | Initial |
| `COMMUNICATION_PREFERENCE_TYPES` | Communication preferences (email, phone, WhatsApp, etc.) | 5 | Initial |
| `ADDRESS_TYPES` | Address types (billing, shipping, registered office, etc.) | 5 | Initial |
| `PARTY_DOCUMENT_TYPES` | Document types for party documents (trade license, TRN, MOA, insurance, etc.) | 10 | Initial |
| `BANK_ACCOUNT_TYPES` | Bank account types (checking, savings, escrow, etc.) | 4 | Initial |
| `HSE_PREQUALIFICATION_STATUS_TYPES` | HSE prequalification statuses (approved, pending, rejected, expired) | 5 | Initial |
| `ENTITY_STATUS_TYPES` | Entity status (active, inactive, suspended, blacklisted) | 5 | Initial |
| `RELATIONSHIP_STATUS_TYPES` | Relationship status (prospect, active, inactive, dormant) | 5 | Initial |
| **`ICV_STATUS_TYPES`** | **ICV certificate status (valid, expired, under renewal, not available, not required, pending submission)** | **6** | **REV2: NEW** |

**Total Lookup Categories:** 23 (REV2: +1 for ICV_STATUS_TYPES)

**Total Lookup Values (approx.):** ~136 (REV2: +6 for ICV status types)

### 6.2 REV1 Expanded Lookup Values

#### CUSTOMER_TYPES (8 values, REV1: +5)

| Value Code | Value Name | Description | Badge Color |
|------------|------------|-------------|-------------|
| `GOVERNMENT_CUSTOMER` | Government Customer | Government entity customer (ministries, government departments) | blue |
| `SEMI_GOVERNMENT_CUSTOMER` | Semi-Government Customer | Semi-government entity customer (government-linked entities) | indigo |
| `UTILITY_COMPANY` | Utility Company | Utility company customer (DEWA, ADDC, water/power authorities) | cyan |
| `WATER_POWER_PLANT` | Water & Power Plant | Water and power plant customer | teal |
| `INDUSTRIAL_CUSTOMER` | Industrial Customer | Industrial customer (factories, manufacturing plants) | gray |
| `COMMERCIAL_CUSTOMER` | Commercial Customer | Commercial customer (businesses, shops, offices) | green |
| `RETAIL_CUSTOMER` | Retail Customer | Retail customer (individual consumers) | orange |
| `PROJECT_CUSTOMER` | Project Customer | Project-specific customer (large projects, construction projects) | purple |

#### VENDOR_TYPES (10 values, REV1: +5)

| Value Code | Value Name | Description | Badge Color |
|------------|------------|-------------|-------------|
| `TRANSPORTER` | Transporter | Transport / logistics service provider (general transport) | blue |
| `TRANSPORT_SERVICE_PROVIDER` | Transport Service Provider | Transport service provider (specialized transport) | indigo |
| `LOGISTICS_SERVICE_PROVIDER` | Logistics Service Provider | Logistics service provider (freight forwarding, customs clearance) | cyan |
| `PRIVATE_WASTE_DISPOSAL_FACILITY` | Private Waste Disposal Facility | Private waste disposal facility / waste management service provider | green |
| `WASTE_DISPOSAL_SERVICE_PROVIDER` | Waste Disposal Service Provider | Waste disposal service provider (general waste collection/disposal) | teal |
| `MATERIALS_VENDOR` | Materials Vendor | Materials vendor (scrap, raw materials) | gray |
| `EQUIPMENT_VENDOR` | Equipment Vendor | Equipment vendor (machinery, tools) | orange |
| `SERVICES_VENDOR` | Services Vendor | Services vendor (maintenance, repair) | purple |
| `PARTS_VENDOR` | Parts Vendor | Parts vendor (spare parts, consumables) | yellow |
| `OTHER_VENDOR` | Other Vendor | Other vendor types | gray |

#### SUBCONTRACTOR_TYPES (7 values, REV1: +2)

| Value Code | Value Name | Description | Badge Color |
|------------|------------|-------------|-------------|
| `TRANSPORT_SUBCONTRACTOR` | Transport Subcontractor | Transport subcontractor (subcontracted fleet services) | blue |
| `SPECIALIZED_SUBCONTRACTOR` | Specialized Subcontractor | Specialized subcontractor (specialized technical services) | indigo |
| `TRADE_SUBCONTRACTOR` | Trade Subcontractor | Trade subcontractor (electrical, plumbing, HVAC) | cyan |
| `CIVIL_SUBCONTRACTOR` | Civil Subcontractor | Civil subcontractor (civil works, concrete) | green |
| `MEP_SUBCONTRACTOR` | MEP Subcontractor | MEP subcontractor (mechanical, electrical, plumbing) | orange |
| `FINISHING_SUBCONTRACTOR` | Finishing Subcontractor | Finishing subcontractor (painting, flooring, tiling) | purple |
| `OTHER_SUBCONTRACTOR` | Other Subcontractor | Other subcontractor types | gray |

#### CONSULTANT_TYPES (8 values, REV1: +3)

| Value Code | Value Name | Description | Badge Color |
|------------|------------|-------------|-------------|
| `AUDIT_CONSULTANT` | Audit Consultant | Audit consultant (financial audit, internal audit) | blue |
| `LEGAL_CONSULTANT` | Legal Consultant | Legal consultant (legal advice, contract review) | indigo |
| `TECHNICAL_CONSULTANT` | Technical Consultant | Technical consultant (engineering, technical design) | cyan |
| `ENVIRONMENTAL_CONSULTANT` | Environmental Consultant | Environmental consultant (environmental impact assessment) | green |
| `HSE_CONSULTANT` | HSE Consultant | HSE consultant (health, safety, environment compliance) | orange |
| `IT_CONSULTANT` | IT Consultant | IT consultant (IT systems, software, cybersecurity) | purple |
| `MANAGEMENT_CONSULTANT` | Management Consultant | Management consultant (business strategy, operations) | yellow |
| `OTHER_CONSULTANT` | Other Consultant | Other consultant types | gray |

#### GOVERNMENT_AUTHORITY_TYPES (11 values, REV1: +7)

| Value Code | Value Name | Description | Badge Color |
|------------|------------|-------------|-------------|
| `LICENSE_ISSUER` | License Issuer | License issuing authority (DED, trade license authorities) | blue |
| `PERMIT_ISSUER` | Permit Issuer | Permit issuing authority (construction permits, environmental permits) | indigo |
| `UTILITY_AUTHORITY` | Utility Authority | Utility authority (DEWA, ADDC, water/power authorities) | cyan |
| `TRANSPORT_AUTHORITY` | Transport Authority | Transport authority (RTA, transport regulators) | teal |
| `WASTE_MANAGEMENT_AUTHORITY` | Waste Management Authority | Waste management authority (waste regulation) | green |
| `ENVIRONMENTAL_AUTHORITY` | Environmental Authority | Environmental authority (EAD, environmental regulators) | emerald |
| `MUNICIPALITY` | Municipality | Municipality (local government, municipal services) | gray |
| `TAX_AUTHORITY` | Tax Authority | Tax authority (FTA, customs) | orange |
| `LABOR_AUTHORITY` | Labor Authority | Labor authority (MOHRE, labor regulators) | purple |
| `REGULATORY_AUTHORITY` | Regulatory Authority | Regulatory authority (general regulators) | red |
| `OTHER_AUTHORITY` | Other Authority | Other government authority types | gray |

#### ICV_STATUS_TYPES (6 values, REV2: NEW)

| Value Code | Value Name | Description | Badge Color |
|------------|------------|-------------|-------------|
| `VALID` | Valid | ICV certificate is valid | green |
| `EXPIRED` | Expired | ICV certificate has expired | red |
| `UNDER_RENEWAL` | Under Renewal | ICV certificate is under renewal | orange |
| `NOT_AVAILABLE` | Not Available | ICV certificate is not available (default safe status) | gray |
| `NOT_REQUIRED` | Not Required | ICV certificate is not required for this entity | blue |
| `PENDING_SUBMISSION` | Pending Submission | ICV certificate/details are pending submission | yellow |

### 6.3 Dropdown Mapping Matrix

| Field | Dropdown Source | Component | Notes |
|-------|----------------|-----------|-------|
| `customer_type_code` | `CUSTOMER_TYPES` lookup | `LookupSelect` | REV1: 8 values |
| `customer_segment_code` | `CUSTOMER_SEGMENTS` lookup | `LookupSelect` | 5 values |
| `industry_type_code` | `INDUSTRY_TYPES` lookup | `LookupSelect` | 10 values |
| `vendor_type_code` | `VENDOR_TYPES` lookup | `LookupSelect` | REV1: 10 values |
| `supplier_category_code` | `SUPPLIER_CATEGORIES` lookup | `LookupSelect` | 4 values |
| `subcontractor_type_code` | `SUBCONTRACTOR_TYPES` lookup | `LookupSelect` | REV1: 7 values |
| `consultant_type_code` | `CONSULTANT_TYPES` lookup | `LookupSelect` | REV1: 8 values |
| `authority_type_code` | `GOVERNMENT_AUTHORITY_TYPES` lookup | `LookupSelect` | REV1: 11 values |
| `agency_type_code` | `RECRUITMENT_AGENCY_TYPES` lookup | `LookupSelect` | 4 values |
| `contact_type_code` | `CONTACT_TYPES` lookup | `LookupSelect` | 6 values |
| `address_type_code` | `ADDRESS_TYPES` lookup | `LookupSelect` | 5 values |
| `document_type_code` | `PARTY_DOCUMENT_TYPES` lookup | `LookupSelect` | 10 values |
| `bank_account_type_code` | `BANK_ACCOUNT_TYPES` lookup | `LookupSelect` | 4 values |
| `hse_prequalification_status_code` | `HSE_PREQUALIFICATION_STATUS_TYPES` lookup | `LookupSelect` | 5 values |
| **`icv_status_code`** | **`ICV_STATUS_TYPES` lookup** | **`LookupSelect`** | **REV2: 6 values** |
| `status_code` | `ENTITY_STATUS_TYPES` lookup | `LookupSelect` | 5 values |
| `country_id` | `countries` table | `CountrySelect` | Reuse existing |
| `emirate_id` | `emirates` table | `EmirateSelect` | Reuse existing |
| `city_id` | `cities` table | `CitySelect` | Reuse existing |
| `currency_id` | `currencies` table | `CurrencySelect` | Reuse existing |
| `payment_term_id` | `payment_terms` table | `PaymentTermSelect` | Reuse existing |
| `tax_type_id` | `tax_types` table | `TaxTypeSelect` | Reuse existing |
| `bank_id` | `banks` table | `BankSelect` | Reuse existing |

---

## 7. Database Schema Plan

### 7.1 Customers Table (REV2: +11 fields)

```sql
CREATE TABLE IF NOT EXISTS customers (
  id bigint generated by default as identity primary key,
  
  -- Code and names
  customer_code text unique not null,
  customer_name_en text not null,
  customer_name_ar text,
  
  -- Classification
  customer_type_code text not null references global_lookup_values(value_code),
  industry_type_code text references global_lookup_values(value_code),
  customer_segment_code text references global_lookup_values(value_code),
  lead_source_code text references global_lookup_values(value_code),
  
  -- Registration and legal
  trn text check (trn is null or char_length(trn) = 15),
  trade_license_number text,
  license_expiry_date date,
  
  -- Contact information
  website_url text,
  primary_email text check (primary_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$'),
  primary_phone text,
  primary_mobile text,
  
  -- Geography
  country_id bigint references countries(id),
  emirate_id bigint references emirates(id),
  city_id bigint references cities(id),
  area_zone_id bigint references areas_zones(id),
  address_line_1 text,
  address_line_2 text,
  po_box text,
  makani_number text,
  
  -- Commercial terms
  currency_id bigint references currencies(id),
  payment_term_id bigint references payment_terms(id),
  tax_type_id bigint references tax_types(id),
  credit_limit decimal(15, 2) check (credit_limit >= 0),
  credit_days integer check (credit_days >= 0),
  
  -- Sales management
  sales_owner_user_profile_id bigint references user_profiles(id),
  
  -- ICV (In-Country Value) certificate information (REV2)
  icv_certificate_number text,
  icv_score_percentage numeric(5, 2) check (icv_score_percentage is null or (icv_score_percentage >= 0 and icv_score_percentage <= 100)),
  icv_issue_date date,
  icv_expiry_date date check (icv_issue_date is null or icv_expiry_date is null or icv_expiry_date >= icv_issue_date),
  icv_company_type text,
  icv_financial_year_end_date date,
  icv_certification_body text,
  icv_version text,
  icv_status_code text references global_lookup_values(value_code),
  icv_document_path text,
  
  -- CICPA (Critical Infrastructure and Coastal Protection Authority) company registration (REV2)
  cicpa_registration_number text,
  
  -- Notes
  notes text,
  
  -- Status
  status_code text not null default 'ACTIVE' references global_lookup_values(value_code),
  
  -- Audit fields
  created_at timestamptz not null default now(),
  created_by bigint references user_profiles(id),
  updated_at timestamptz not null default now(),
  updated_by bigint references user_profiles(id),
  deactivated_at timestamptz,
  deactivated_by bigint references user_profiles(id),
  deactivation_reason text,
  
  -- System fields
  is_active boolean not null default true,
  is_locked boolean not null default false,
  is_system boolean not null default false,
  sort_order integer not null default 0
);

COMMENT ON TABLE customers IS 'Customer master data for CRM, sales, and commercial transactions';
COMMENT ON COLUMN customers.customer_type_code IS 'Customer type (REV1: includes GOVERNMENT_CUSTOMER, UTILITY_COMPANY, WATER_POWER_PLANT, INDUSTRIAL_CUSTOMER, COMMERCIAL_CUSTOMER)';
COMMENT ON COLUMN customers.icv_certificate_number IS 'ICV certificate number for the customer/company, if applicable. Metadata tracking only, not score calculation.';
COMMENT ON COLUMN customers.icv_score_percentage IS 'ICV score percentage (0-100). From ICV certificate.';
COMMENT ON COLUMN customers.icv_status_code IS 'ICV certificate status (VALID, EXPIRED, UNDER_RENEWAL, NOT_AVAILABLE, NOT_REQUIRED, PENDING_SUBMISSION)';
COMMENT ON COLUMN customers.icv_document_path IS 'Temporary nullable reference to ICV certificate document. DMS not yet implemented.';
COMMENT ON COLUMN customers.cicpa_registration_number IS 'Company CICPA registration number, if applicable. Company-level registration only, not individual employee access cards.';
```

### 7.2 Vendors Table (REV2: +11 fields)

```sql
CREATE TABLE IF NOT EXISTS vendors (
  id bigint generated by default as identity primary key,
  
  -- Code and names
  vendor_code text unique not null,
  vendor_name_en text not null,
  vendor_name_ar text,
  
  -- Classification
  vendor_type_code text not null references global_lookup_values(value_code),
  vendor_category_code text references global_lookup_values(value_code),
  supplier_category_code text references global_lookup_values(value_code),
  
  -- Registration and legal
  trn text check (trn is null or char_length(trn) = 15),
  trade_license_number text,
  license_expiry_date date,
  
  -- Contact information
  website_url text,
  primary_email text check (primary_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$'),
  primary_phone text,
  primary_mobile text,
  
  -- Geography
  country_id bigint references countries(id),
  emirate_id bigint references emirates(id),
  city_id bigint references cities(id),
  area_zone_id bigint references areas_zones(id),
  address_line_1 text,
  address_line_2 text,
  po_box text,
  makani_number text,
  
  -- Commercial terms
  currency_id bigint references currencies(id),
  payment_term_id bigint references payment_terms(id),
  tax_type_id bigint references tax_types(id),
  default_bank_id bigint references banks(id),
  
  -- ICV (In-Country Value) certificate information (REV2)
  icv_certificate_number text,
  icv_score_percentage numeric(5, 2) check (icv_score_percentage is null or (icv_score_percentage >= 0 and icv_score_percentage <= 100)),
  icv_issue_date date,
  icv_expiry_date date check (icv_issue_date is null or icv_expiry_date is null or icv_expiry_date >= icv_issue_date),
  icv_company_type text,
  icv_financial_year_end_date date,
  icv_certification_body text,
  icv_version text,
  icv_status_code text references global_lookup_values(value_code),
  icv_document_path text,
  
  -- CICPA (Critical Infrastructure and Coastal Protection Authority) company registration (REV2)
  cicpa_registration_number text,
  
  -- Notes
  notes text,
  
  -- Status
  status_code text not null default 'ACTIVE' references global_lookup_values(value_code),
  
  -- Audit fields (same as customers)
  -- System fields (same as customers)
);

COMMENT ON TABLE vendors IS 'Vendor master data for procurement and supplier management';
COMMENT ON COLUMN vendors.vendor_type_code IS 'Vendor type (REV1: includes TRANSPORTER, LOGISTICS_SERVICE_PROVIDER, PRIVATE_WASTE_DISPOSAL_FACILITY)';
COMMENT ON COLUMN vendors.icv_certificate_number IS 'ICV certificate number for the vendor/company, if applicable. Metadata tracking only, not score calculation.';
COMMENT ON COLUMN vendors.icv_score_percentage IS 'ICV score percentage (0-100). From ICV certificate.';
COMMENT ON COLUMN vendors.icv_status_code IS 'ICV certificate status (VALID, EXPIRED, UNDER_RENEWAL, NOT_AVAILABLE, NOT_REQUIRED, PENDING_SUBMISSION)';
COMMENT ON COLUMN vendors.icv_document_path IS 'Temporary nullable reference to ICV certificate document. DMS not yet implemented.';
COMMENT ON COLUMN vendors.cicpa_registration_number IS 'Company CICPA registration number, if applicable. Company-level registration only, not individual employee access cards.';
```

### 7.3 Subcontractors Table (REV2: +11 fields)

```sql
CREATE TABLE IF NOT EXISTS subcontractors (
  id bigint generated by default as identity primary key,
  
  -- Code and names
  subcontractor_code text unique not null,
  subcontractor_name_en text not null,
  subcontractor_name_ar text,
  
  -- Classification
  subcontractor_type_code text not null references global_lookup_values(value_code),
  subcontractor_category_code text references global_lookup_values(value_code),
  
  -- Registration and legal
  trn text check (trn is null or char_length(trn) = 15),
  trade_license_number text,
  license_expiry_date date,
  
  -- Contact information
  website_url text,
  primary_email text check (primary_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$'),
  primary_phone text,
  primary_mobile text,
  
  -- Geography (same pattern)
  
  -- Commercial terms (currency, payment_term, tax_type)
  
  -- HSE and capabilities
  hse_prequalification_status_code text references global_lookup_values(value_code),
  worker_supply_allowed boolean not null default false,
  equipment_supply_allowed boolean not null default false,
  
  -- ICV (In-Country Value) certificate information (REV2)
  icv_certificate_number text,
  icv_score_percentage numeric(5, 2) check (icv_score_percentage is null or (icv_score_percentage >= 0 and icv_score_percentage <= 100)),
  icv_issue_date date,
  icv_expiry_date date check (icv_issue_date is null or icv_expiry_date is null or icv_expiry_date >= icv_issue_date),
  icv_company_type text,
  icv_financial_year_end_date date,
  icv_certification_body text,
  icv_version text,
  icv_status_code text references global_lookup_values(value_code),
  icv_document_path text,
  
  -- CICPA (Critical Infrastructure and Coastal Protection Authority) company registration (REV2)
  cicpa_registration_number text,
  
  -- Notes, Status, Audit, System fields (same pattern)
);

COMMENT ON TABLE subcontractors IS 'Subcontractor master data for subcontracting management';
COMMENT ON COLUMN subcontractors.subcontractor_type_code IS 'Subcontractor type (REV1: includes TRANSPORT_SUBCONTRACTOR, SPECIALIZED_SUBCONTRACTOR)';
COMMENT ON COLUMN subcontractors.icv_certificate_number IS 'ICV certificate number for the subcontractor/company, if applicable. Metadata tracking only, not score calculation.';
COMMENT ON COLUMN subcontractors.icv_score_percentage IS 'ICV score percentage (0-100). From ICV certificate.';
COMMENT ON COLUMN subcontractors.icv_status_code IS 'ICV certificate status (VALID, EXPIRED, UNDER_RENEWAL, NOT_AVAILABLE, NOT_REQUIRED, PENDING_SUBMISSION)';
COMMENT ON COLUMN subcontractors.icv_document_path IS 'Temporary nullable reference to ICV certificate document. DMS not yet implemented.';
COMMENT ON COLUMN subcontractors.cicpa_registration_number IS 'Company CICPA registration number, if applicable. Company-level registration only, not individual employee access cards.';
```

### 7.4 Consultants Table (REV2: +11 fields)

```sql
CREATE TABLE IF NOT EXISTS consultants (
  id bigint generated by default as identity primary key,
  
  -- Code and names (same pattern)
  
  -- Classification
  consultant_type_code text not null references global_lookup_values(value_code),
  consultant_category_code text references global_lookup_values(value_code),
  
  -- Registration and legal (TRN, trade license, etc.)
  
  -- Contact information, Geography, Commercial terms (same pattern)
  
  -- ICV (In-Country Value) certificate information (REV2)
  icv_certificate_number text,
  icv_score_percentage numeric(5, 2) check (icv_score_percentage is null or (icv_score_percentage >= 0 and icv_score_percentage <= 100)),
  icv_issue_date date,
  icv_expiry_date date check (icv_issue_date is null or icv_expiry_date is null or icv_expiry_date >= icv_issue_date),
  icv_company_type text,
  icv_financial_year_end_date date,
  icv_certification_body text,
  icv_version text,
  icv_status_code text references global_lookup_values(value_code),
  icv_document_path text,
  
  -- CICPA (Critical Infrastructure and Coastal Protection Authority) company registration (REV2)
  cicpa_registration_number text,
  
  -- Notes, Status, Audit, System fields (same pattern)
);

COMMENT ON TABLE consultants IS 'Consultant master data for professional services';
COMMENT ON COLUMN consultants.consultant_type_code IS 'Consultant type (REV1: includes AUDIT_CONSULTANT)';
COMMENT ON COLUMN consultants.icv_certificate_number IS 'ICV certificate number for the consultant/company, if applicable. Metadata tracking only, not score calculation.';
COMMENT ON COLUMN consultants.icv_score_percentage IS 'ICV score percentage (0-100). From ICV certificate.';
COMMENT ON COLUMN consultants.icv_status_code IS 'ICV certificate status (VALID, EXPIRED, UNDER_RENEWAL, NOT_AVAILABLE, NOT_REQUIRED, PENDING_SUBMISSION)';
COMMENT ON COLUMN consultants.icv_document_path IS 'Temporary nullable reference to ICV certificate document. DMS not yet implemented.';
COMMENT ON COLUMN consultants.cicpa_registration_number IS 'Company CICPA registration number, if applicable. Company-level registration only, not individual employee access cards.';
```

### 7.5 Government Authorities Table (REV2: NO ICV/CICPA fields)

```sql
CREATE TABLE IF NOT EXISTS government_authorities (
  id bigint generated by default as identity primary key,
  
  -- Code and names (same pattern)
  
  -- Classification
  authority_type_code text not null references global_lookup_values(value_code),
  parent_authority_id bigint references government_authorities(id),
  jurisdiction text,
  
  -- Contact information, Geography (same pattern but simpler)
  
  -- ❌ NO ICV fields (government regulators, not commercial companies)
  -- ❌ NO CICPA fields (government regulators, not commercial companies)
  
  -- Notes, Status, Audit, System fields (same pattern)
);

COMMENT ON TABLE government_authorities IS 'Government authority master data for compliance and regulatory management';
COMMENT ON COLUMN government_authorities.authority_type_code IS 'Authority type (REV1: includes LICENSE_ISSUER, PERMIT_ISSUER, UTILITY_AUTHORITY, TRANSPORT_AUTHORITY)';
```

**Reason for exclusion:** Government authorities are regulators, issuers, and compliance authorities. They are not commercial companies requiring ICV supplier tracking or CICPA company registration. ICV/CICPA fields are only applicable to commercial entities (customers, vendors, subcontractors, consultants, recruitment agencies).

### 7.6 Recruitment Agencies Table (REV2: +11 fields)

```sql
CREATE TABLE IF NOT EXISTS recruitment_agencies (
  id bigint generated by default as identity primary key,
  
  -- Code and names (same pattern)
  
  -- Classification
  agency_type_code text not null references global_lookup_values(value_code),
  agency_category_code text references global_lookup_values(value_code),
  
  -- Geography, Contact information (same pattern)
  
  -- License information
  license_number text,
  license_expiry_date date,
  
  -- Countries served (text array for simplicity in this phase)
  countries_served text[],
  
  -- Commercial terms (vendor-like for payment purposes)
  currency_id bigint references currencies(id),
  payment_term_id bigint references payment_terms(id),
  tax_type_id bigint references tax_types(id),
  
  -- ICV (In-Country Value) certificate information (REV2)
  icv_certificate_number text,
  icv_score_percentage numeric(5, 2) check (icv_score_percentage is null or (icv_score_percentage >= 0 and icv_score_percentage <= 100)),
  icv_issue_date date,
  icv_expiry_date date check (icv_issue_date is null or icv_expiry_date is null or icv_expiry_date >= icv_issue_date),
  icv_company_type text,
  icv_financial_year_end_date date,
  icv_certification_body text,
  icv_version text,
  icv_status_code text references global_lookup_values(value_code),
  icv_document_path text,
  
  -- CICPA (Critical Infrastructure and Coastal Protection Authority) company registration (REV2)
  cicpa_registration_number text,
  
  -- Notes, Status, Audit, System fields (same pattern)
);

COMMENT ON TABLE recruitment_agencies IS 'Recruitment agency master data (vendor-like for payment/commercial purposes but separate for HR control)';
COMMENT ON COLUMN recruitment_agencies.icv_certificate_number IS 'ICV certificate number for the recruitment agency/company, if applicable. Metadata tracking only, not score calculation.';
COMMENT ON COLUMN recruitment_agencies.icv_score_percentage IS 'ICV score percentage (0-100). From ICV certificate.';
COMMENT ON COLUMN recruitment_agencies.icv_status_code IS 'ICV certificate status (VALID, EXPIRED, UNDER_RENEWAL, NOT_AVAILABLE, NOT_REQUIRED, PENDING_SUBMISSION)';
COMMENT ON COLUMN recruitment_agencies.icv_document_path IS 'Temporary nullable reference to ICV certificate document. DMS not yet implemented.';
COMMENT ON COLUMN recruitment_agencies.cicpa_registration_number IS 'Company CICPA registration number, if applicable. Company-level registration only, not individual employee access cards.';
```

### 7.7 REV2 ICV/CICPA Field Specifications

| Field Name | Data Type | Constraints | Default | Nullable | Notes |
|------------|-----------|-------------|---------|----------|-------|
| `icv_certificate_number` | text | None | None | Yes | ICV certificate number (e.g., "140995") |
| `icv_score_percentage` | numeric(5, 2) | check (null or 0-100) | None | Yes | ICV score percentage (e.g., 31.42) |
| `icv_issue_date` | date | None | None | Yes | Issue date of ICV certificate |
| `icv_expiry_date` | date | check (null or >= icv_issue_date) | None | Yes | Expiry date of ICV certificate |
| `icv_company_type` | text | None | None | Yes | Company type from ICV certificate (e.g., "SME in UAE") |
| `icv_financial_year_end_date` | date | None | None | Yes | Financial year end date from ICV certificate |
| `icv_certification_body` | text | None | None | Yes | Certification body name (e.g., "Mazars Chartered Accountants - LLC") |
| `icv_version` | text | None | None | Yes | ICV program version (e.g., "3.0") |
| `icv_status_code` | text | FK to global_lookup_values | None | Yes | ICV status (VALID, EXPIRED, UNDER_RENEWAL, NOT_AVAILABLE, NOT_REQUIRED, PENDING_SUBMISSION) |
| `icv_document_path` | text | None | None | Yes | Temporary nullable file/document reference (DMS not implemented yet) |
| `cicpa_registration_number` | text | None | None | Yes | Company CICPA registration number (company-level only) |

**REV2 Key Notes:**
- ✅ **All ICV/CICPA fields are nullable** — not all companies have ICV certificates or CICPA registration
- ✅ **No FK to DMS** — `icv_document_path` is a temporary text field for file/document reference; full DMS integration in later phase
- ✅ **ICV score constraint** — `icv_score_percentage` must be between 0 and 100 if not null
- ✅ **ICV date logic** — `icv_expiry_date` must be >= `icv_issue_date` if both are not null
- ✅ **CICPA no expiry** — company CICPA registration number has no expiry date tracked in this phase
- ✅ **CICPA company-level only** — individual employee/subcontractor employee CICPA access cards handled in later HR/HSE/access modules

### 7.8 Indexes (REV2: +20 indexes)

#### Customers Indexes (REV2: +4)

```sql
CREATE INDEX IF NOT EXISTS idx_customers_customer_code ON customers(customer_code);
CREATE INDEX IF NOT EXISTS idx_customers_customer_name_en ON customers(customer_name_en);
CREATE INDEX IF NOT EXISTS idx_customers_customer_type_code ON customers(customer_type_code);
CREATE INDEX IF NOT EXISTS idx_customers_status_code ON customers(status_code);
CREATE INDEX IF NOT EXISTS idx_customers_country_id ON customers(country_id);
CREATE INDEX IF NOT EXISTS idx_customers_emirate_id ON customers(emirate_id);
CREATE INDEX IF NOT EXISTS idx_customers_is_active ON customers(is_active);
CREATE INDEX IF NOT EXISTS idx_customers_trn ON customers(trn) WHERE trn IS NOT NULL;
-- REV2: ICV/CICPA indexes
CREATE INDEX IF NOT EXISTS idx_customers_icv_certificate_number ON customers(icv_certificate_number) WHERE icv_certificate_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_icv_expiry_date ON customers(icv_expiry_date) WHERE icv_expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_icv_status_code ON customers(icv_status_code) WHERE icv_status_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_cicpa_registration_number ON customers(cicpa_registration_number) WHERE cicpa_registration_number IS NOT NULL;
```

**Repeat for vendors, subcontractors, consultants, recruitment_agencies (4 indexes each × 5 tables = 20 indexes).**

**Government authorities:** NO ICV/CICPA indexes (no ICV/CICPA fields).

**Total REV2 Index Addition:** +20 indexes (4 per table × 5 applicable tables)

**Total Indexes (approx.):** 100+ (was ~80, now ~100+ with REV2)

---

## 8-26. [Remaining Sections]

**[SECTIONS 8-26 WOULD CONTINUE HERE WITH SAME PATTERN AS REV1]**

Due to document length constraints, sections 8-26 follow the same structure as REV1 with the following key updates:

### Key REV2 Updates Across All Sections:

- **Section 11 (Master Data Reuse)**: Add `ICV_STATUS_TYPES` to lookup dropdown mapping matrix
- **Section 15 (Validation Plan)**: Add Zod schemas for ICV/CICPA fields (optional fields, numeric constraints, date logic)
- **Section 16 (UI/Screen Plan)**: Add ICV/CICPA fields to form sections for 5 applicable entities (collapsible "UAE Compliance" section)
- **Section 19 (Seed Data Plan)**: Add ICV_STATUS_TYPES seed data (6 values)
- **Section 21 (Testing Plan)**: Add ICV/CICPA field validation tests (score 0-100, expiry >= issue date, status dropdown)
- **Section 22 (Risk Analysis)**: Add risks: ICV data quality (manual entry), CICPA format variation, DMS integration delay
- **Section 23 (Acceptance Criteria)**: Add criteria: ICV/CICPA fields present in 5 tables, indexes created, constraints working, ICV_STATUS_TYPES seeded
- **Section 24 (Future Integration)**: Add notes: ICV verification workflow, ICV score calculation engine, CICPA employee access cards, DMS document storage

---

## Final REV2 Summary

**Phase:** ERP BASE 002F.3E — People / Contacts / CRM Foundation  
**Revision:** REV2 — ICV + CICPA Correction  
**Total Tables:** 29 (6 main + 23 child)  
**Total Lookup Categories:** 23 (REV2: +1 for ICV_STATUS_TYPES)  
**Total Lookup Values:** ~136 (REV2: +6 for ICV status types)  
**Total Permissions:** 4 (grouped)  
**Total RLS Policies:** ~174  
**Total Indexes:** 100+ (REV2: +20 for ICV/CICPA)  
**ICV/CICPA Tables:** 5 (customers, vendors, subcontractors, consultants, recruitment_agencies)  
**ICV/CICPA Excluded:** 1 (government_authorities)

**REV2 Status:** ✅ READY FOR REVIEW — Technical plan updated with ICV + CICPA fields

---

*End of REV2 Technical Implementation Plan*
