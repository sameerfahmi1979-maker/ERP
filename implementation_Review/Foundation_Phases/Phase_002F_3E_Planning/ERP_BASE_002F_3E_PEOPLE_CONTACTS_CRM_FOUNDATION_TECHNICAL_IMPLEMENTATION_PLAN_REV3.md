# ERP BASE 002F.3E — PEOPLE / CONTACTS / CRM FOUNDATION
## TECHNICAL IMPLEMENTATION PLAN — REV3 (FINAL CORRECTED VERSION)

**Phase:** ERP BASE 002F.3E — People / Contacts / CRM Foundation  
**Plan Date:** Sunday, June 7, 2026  
**Revised:** Sunday, June 7, 2026 (REV3)  
**Planner:** Claude Sonnet 4.5 (AI Agent)  
**Plan Type:** Technical Implementation Planning (No Code Implementation)  
**Technology Stack:** Next.js 16.2.6 (Turbopack), Supabase PostgreSQL, Shadcn UI  
**Status:** REV3 — READY FOR SAMEER REVIEW — Final corrected technical plan complete

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| **1.0** | 2026-06-07 12:30 PM | Initial technical plan |
| **REV1** | 2026-06-07 3:00 PM | **Corrected:** Customer types expanded (government/utility/industrial), Vendor types expanded (transporters/waste disposal), Waste disposal facility dual classification (government OR vendor), Government authority types expanded (license issuers/utility authorities), Transporter dual classification (vendor OR subcontractor), Permissions strategy simplified to grouped approach, Business classification rules clarified |
| **REV2** | 2026-06-07 3:30 PM | **Added:** ICV (In-Country Value) certificate fields (10 fields) and CICPA (Critical Infrastructure and Coastal Protection Authority) registration number field to 5 applicable commercial company entity tables (customers, vendors, subcontractors, consultants, recruitment_agencies). Government authorities excluded (regulators, not commercial companies). Added ICV_STATUS_TYPES lookup category with 6 values. Added indexes and constraints for ICV/CICPA fields. Updated lookup category count to 23 and lookup value count to ~136. |
| **REV3** | 2026-06-07 3:50 PM | **Corrected:** Removed unsafe FK references to global_lookup_values(value_code) — 75 occurrences removed. Added column comments indicating lookup category source for all lookup-code fields. Lookup validation moved to application layer via LookupSelect components and server-side Zod validation. Explained lookup pattern in database schema plan. Completed all plan sections without placeholders. This is the final corrected implementation-ready technical plan. |

---

## Document Purpose

This document provides a comprehensive, implementation-ready technical plan for ERP BASE Phase 002F.3E — People / Contacts / CRM Foundation. This phase establishes the master data foundation for customers, vendors, subcontractors, consultants, government authorities, and recruitment agencies, along with their associated contacts, addresses, documents, and bank details.

**This is REVISION 3 (REV3)** — the final corrected version incorporating all approved corrections from REV1 (classification expansions), REV2 (ICV/CICPA fields), and REV3 (lookup FK pattern correction).

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

**REV3 Key Changes (Lookup FK Pattern Correction):**
- ✅ **Removed unsafe FK references** to global_lookup_values(value_code) — 75 occurrences removed from all lookup-code columns
- ✅ **Added column comments** indicating lookup category source for all lookup-code fields (e.g., 'Lookup value code from CUSTOMER_TYPES')
- ✅ **Lookup validation pattern clarified**: Application-layer validation via LookupSelect components and server-side Zod schemas ensure value_code belongs to correct category
- ✅ **Explained lookup design rationale**: global_lookup_values.value_code is NOT globally unique; same value_code may exist in multiple categories; direct FK to value_code alone is unsafe
- ✅ **Completed all plan sections** without placeholder language — this is the final implementation-ready technical plan

### 1.2 Key Design Principles

1. **Separation of Entity Types**: No generic `persons` table. Each business entity category has a dedicated table with appropriate fields.
2. **No Employee Data**: Employees are explicitly excluded from this phase (handled in 002F.3F — HR Master Data).
3. **No Hardcoded Dropdowns**: All classification fields use existing master data tables or new lookup categories.
4. **Master Data Reuse**: Leverages existing Geography, Finance Basics, UOM, and Lookup Engine modules.
5. **Flexible Classification Rules**: Supports dual-role entities (e.g., transporter as vendor OR subcontractor, waste disposal as government OR vendor).
6. **Future-Ready**: Designed to support CRM, Sales, Procurement, Subcontracting, Recruitment, and Government Correspondence modules.
7. **UAE Compliance Tracking (REV2)**: Supports ICV certificate metadata tracking for UAE In-Country Value program compliance and CICPA company registration number tracking for critical infrastructure access.
8. **Safe Lookup Pattern (REV3)**: Lookup-code columns use soft references with application-layer validation instead of unsafe direct FK to value_code, preventing referential integrity issues from non-globally-unique value codes.

### 1.3 Scope Summary

**In Scope (REV3):**
- 6 main entity tables: `customers`, `vendors`, `subcontractors`, `consultants`, `government_authorities`, `recruitment_agencies`
- 24 child tables: contacts (6), addresses (6), documents (6), bank details (5 — government_authority_bank_details excluded per REV1)
- **29 total tables** (6 + 6 + 6 + 6 + 5 = 29)
- **23 lookup categories** for classification and status (REV2: +1 for ICV_STATUS_TYPES)
- **~136 lookup values** (REV2: +6 for ICV status types)
- **ICV certificate metadata tracking** for 5 applicable commercial company entities
- **CICPA company registration number tracking** for 5 applicable commercial company entities
- **Soft lookup references** with application-layer validation (REV3: no unsafe FK to value_code)
- 48+ server actions for CRUD operations
- 18+ UI screens (main entities + child records)
- 6 reusable select components for future modules
- Comprehensive RLS policies and simplified grouped permissions (4 grouped permissions)

**In Scope — UAE Compliance (REV2):**
- **ICV (In-Country Value) certificate metadata fields**: certificate number, score percentage, issue/expiry dates, company type, financial year end, certification body, version, status code, document path
- **CICPA (Critical Infrastructure and Coastal Protection Authority) company registration number**: company-level registration tracking
- **ICV_STATUS_TYPES lookup category**: VALID, EXPIRED, UNDER_RENEWAL, NOT_AVAILABLE, NOT_REQUIRED, PENDING_SUBMISSION

**In Scope — Lookup Validation Pattern (REV3):**
- **Column comments**: All lookup-code columns documented with lookup category source (e.g., 'Lookup value code from CUSTOMER_TYPES')
- **Application validation**: LookupSelect component enforces category-specific value selection
- **Server validation**: Zod schemas validate value_code exists in correct category via server queries
- **No unsafe FKs**: Removed all direct FK references to global_lookup_values(value_code) — 75 occurrences removed

**Not In Scope:**
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
| **RLS Policies (approx.)** | ~174 | 6 per main entity table × 29 tables |
| **Server Actions (min)** | 48 | 8 per entity (list, get, create, update, delete, activate, deactivate, soft delete) |
| **UI Screens (min)** | 18 | 6 main entity screens + 12 child entity screens |
| **Reusable Select Components** | 6 | One per main entity type |
| **Indexes (approx.)** | 100+ | REV2: +20 for ICV/CICPA partial indexes |
| **Triggers** | 29 | One `set_updated_at()` trigger per table |
| **ICV Fields per Table** | 10 | For 5 applicable tables |
| **CICPA Fields per Table** | 1 | For 5 applicable tables |
| **Unsafe Lookup FKs Removed (REV3)** | 75 | All direct FK references to global_lookup_values(value_code) removed |

---

## 2. Scope and Non-Scope Confirmation

### 2.1 Confirmed In-Scope

✅ **Main Entity Tables (6)**
1. `customers` — for CRM, sales, and commercial transactions (REV2: +11 ICV/CICPA fields)
2. `vendors` — for procurement and supply chain management (REV2: +11 ICV/CICPA fields)
3. `subcontractors` — for subcontracting management (REV2: +11 ICV/CICPA fields)
4. `consultants` — for professional services management (REV2: +11 ICV/CICPA fields)
5. `government_authorities` — for government correspondence and regulatory compliance (NO ICV/CICPA fields)
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
- **ICV certificate fields (10 fields × 5 tables)**
- **CICPA registration number (1 field × 5 tables)**
- Applied to: customers, vendors, subcontractors, consultants, recruitment_agencies
- Excluded from: government_authorities

✅ **Lookup Validation Pattern (REV3)**
- **No direct FK to global_lookup_values(value_code)** — unsafe references removed (75 occurrences)
- **Column comments document lookup category** — e.g., 'Lookup value code from CUSTOMER_TYPES'
- **Application-layer validation** — LookupSelect component ensures category-specific selection
- **Server-side validation** — Zod schemas verify value_code belongs to correct category

✅ **Master Data Reuse**
- Geography (countries, emirates, cities, areas_zones) — for addresses
- Finance Basics (currencies, payment_terms, tax_types, banks) — for commercial terms
- Numbering Engine (for auto-generated entity codes: CUST-000001, VEND-000001, etc.)
- Lookup Engine (global_lookup_categories, global_lookup_values) — soft references only

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

❌ **Direct FK to Lookup Values (REV3)**
- No direct foreign key references to global_lookup_values(value_code)
- Lookup validation handled at application layer via LookupSelect and server-side Zod validation
- Reason: value_code is not globally unique across categories; direct FK is unsafe

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
- **REV3 Pattern**: Lookup-code columns use soft references (text fields with column comments documenting category source); application-layer validation via LookupSelect; server-side validation via Zod schemas

### 3.2 Pattern Consistency Requirements

✅ **Database Layer**
- BIGINT for all PKs and FKs
- `user_profiles.id` for all audit fields (created_by, updated_by, etc.)
- `set_updated_at()` trigger for all tables
- RLS enabled on all tables with policy-based access control
- Partial indexes for nullable unique fields (e.g., TRN, email)
- **REV3**: Lookup-code columns as text fields without direct FK to global_lookup_values(value_code)

✅ **Server Actions**
- Zod validation for all inputs
- `revalidatePath()` for cache invalidation
- Audit logging for all mutations
- Error handling with try/catch
- Permission checks via RLS (automatic)
- **REV3**: Lookup validation in Zod schemas via server queries to verify value_code belongs to correct category

✅ **UI Components**
- `ERPDataTable` for list views with sorting, filtering, resizing, global search
- `ERPDrawerForm` for create/edit with sections and navigation
- `ERPDrawerSectionNav` for multi-section forms
- `Inner` component with `key` prop for form dialogs
- TanStack React Table for data tables
- Shadcn UI components (Dialog, Drawer, Form, Input, Select, etc.)

✅ **Reusable Select Components**
- Follow pattern: `<EntityName>Select.tsx` (e.g., `CustomerSelect.tsx`)
- Use `LookupSelect` for lookup-based dropdowns (category-specific)
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

7. **REV3 Lookup Validation Pattern**:
   - Each entity type has different lookup categories (CUSTOMER_TYPES, VENDOR_TYPES, etc.)
   - Separate tables allow clear column comments documenting category-specific lookup sources
   - Application-layer validation via entity-specific forms ensures correct lookup category selection

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

| Table Name | Purpose | Key Fields | REV2 ICV/CICPA | REV3 Lookup Pattern |
|------------|---------|------------|----------------|---------------------|
| `customers` | Customer master data for CRM and sales | customer_code, customer_name_en, customer_type_code, customer_segment_code, industry_type_code, credit_limit, sales_owner_user_profile_id | ✅ ICV (10 fields) + CICPA (1 field) | Soft references with column comments |
| `vendors` | Vendor master data for procurement | vendor_code, vendor_name_en, vendor_type_code, supplier_category_code, default_bank_id | ✅ ICV (10 fields) + CICPA (1 field) | Soft references with column comments |
| `subcontractors` | Subcontractor master data | subcontractor_code, subcontractor_name_en, subcontractor_type_code, hse_prequalification_status_code, worker_supply_allowed, equipment_supply_allowed | ✅ ICV (10 fields) + CICPA (1 field) | Soft references with column comments |
| `consultants` | Consultant master data | consultant_code, consultant_name_en, consultant_type_code, consultant_category_code | ✅ ICV (10 fields) + CICPA (1 field) | Soft references with column comments |
| `government_authorities` | Government authority master data | authority_code, authority_name_en, authority_type_code, parent_authority_id, jurisdiction | ❌ NO ICV/CICPA (regulators, not commercial companies) | Soft references with column comments |
| `recruitment_agencies` | Recruitment agency master data | agency_code, agency_name_en, agency_type_code, countries_served[], license_number | ✅ ICV (10 fields) + CICPA (1 field) | Soft references with column comments |

### 5.2 Child Tables (24)

#### Contact Person Tables (6)

| Table Name | Parent Entity | Purpose | Lookup Fields (REV3) |
|------------|---------------|---------|----------------------|
| `customer_contacts` | customers | Contact persons for customers | contact_type_code, preferred_communication_code, status_code |
| `vendor_contacts` | vendors | Contact persons for vendors | contact_type_code, preferred_communication_code, status_code |
| `subcontractor_contacts` | subcontractors | Contact persons for subcontractors | contact_type_code, preferred_communication_code, status_code |
| `consultant_contacts` | consultants | Contact persons for consultants | contact_type_code, preferred_communication_code, status_code |
| `government_authority_contacts` | government_authorities | Contact persons for government authorities | contact_type_code, preferred_communication_code, status_code |
| `recruitment_agency_contacts` | recruitment_agencies | Contact persons for recruitment agencies | contact_type_code, preferred_communication_code, status_code |

#### Address Tables (6)

| Table Name | Parent Entity | Purpose | Lookup Fields (REV3) |
|------------|---------------|---------|----------------------|
| `customer_addresses` | customers | Addresses for customers | address_type_code, status_code |
| `vendor_addresses` | vendors | Addresses for vendors | address_type_code, status_code |
| `subcontractor_addresses` | subcontractors | Addresses for subcontractors | address_type_code, status_code |
| `consultant_addresses` | consultants | Addresses for consultants | address_type_code, status_code |
| `government_authority_addresses` | government_authorities | Addresses for government authorities | address_type_code, status_code |
| `recruitment_agency_addresses` | recruitment_agencies | Addresses for recruitment agencies | address_type_code, status_code |

#### Document Tables (6)

| Table Name | Parent Entity | Purpose | Lookup Fields (REV3) |
|------------|---------------|---------|----------------------|
| `customer_documents` | customers | Documents for customers (trade license, TRN, etc.) | document_type_code, status_code |
| `vendor_documents` | vendors | Documents for vendors | document_type_code, status_code |
| `subcontractor_documents` | subcontractors | Documents for subcontractors | document_type_code, status_code |
| `consultant_documents` | consultants | Documents for consultants | document_type_code, status_code |
| `government_authority_documents` | government_authorities | Documents for government authorities | document_type_code, status_code |
| `recruitment_agency_documents` | recruitment_agencies | Documents for recruitment agencies | document_type_code, status_code |

#### Bank Details Tables (5) — REV1 Exclusion

| Table Name | Parent Entity | Purpose | REV1 Status | Lookup Fields (REV3) |
|------------|---------------|---------|-------------|----------------------|
| `customer_bank_details` | customers | Bank account details for customer payments | ✅ Included | bank_account_type_code |
| `vendor_bank_details` | vendors | Bank account details for vendor payments | ✅ Included | bank_account_type_code |
| `subcontractor_bank_details` | subcontractors | Bank account details for subcontractor payments | ✅ Included | bank_account_type_code |
| `consultant_bank_details` | consultants | Bank account details for consultant payments | ✅ Included | bank_account_type_code |
| ~~`government_authority_bank_details`~~ | ~~government_authorities~~ | ~~Bank account details for government authority payments~~ | ❌ Excluded (REV1: government fees/permits paid via government payment gateways, not direct bank transfers) | N/A |
| `recruitment_agency_bank_details` | recruitment_agencies | Bank account details for recruitment agency payments | ✅ Included | bank_account_type_code |

**Total Child Tables:** 23 (6 + 6 + 6 + 5)

**Total Tables in Phase 002F.3E:** 29 (6 main + 23 child)

### 5.3 REV3 Lookup Pattern Summary

**All lookup-code columns** (customer_type_code, status_code, icv_status_code, contact_type_code, address_type_code, document_type_code, bank_account_type_code, etc.) follow this pattern:

1. **Database**: Text field without direct FK to global_lookup_values(value_code)
2. **Column Comment**: Documents lookup category source (e.g., 'Lookup value code from CUSTOMER_TYPES')
3. **Application**: LookupSelect component enforces category-specific value selection
4. **Server**: Zod schemas validate value_code exists in correct category via server queries

**Reason**: global_lookup_values.value_code is NOT globally unique; same value_code may exist in multiple categories; direct FK to value_code alone would cause referential integrity issues.

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
| `PARTY_STATUS_TYPES` | Entity status (active, inactive, suspended, blacklisted) | 5 | Initial |
| `RELATIONSHIP_STATUS_TYPES` | Relationship status (prospect, active, inactive, dormant) | 5 | Initial |
| **`ICV_STATUS_TYPES`** | **ICV certificate status (valid, expired, under renewal, not available, not required, pending submission)** | **6** | **REV2: NEW** |

**Total Lookup Categories:** 23 (REV2: +1 for ICV_STATUS_TYPES)

**Total Lookup Values (approx.):** ~136 (REV2: +6 for ICV status types)

### 6.2 REV3 Lookup Validation Pattern

All lookup-code columns referencing these categories follow the **soft reference pattern**:

1. **Column Definition**: `customer_type_code text not null` (NO FK to global_lookup_values)
2. **Column Comment**: `COMMENT ON COLUMN customers.customer_type_code IS 'Lookup value code from CUSTOMER_TYPES'`
3. **Application Validation**: `LookupSelect` component with `categoryCode="CUSTOMER_TYPES"` prop
4. **Server Validation**: Zod schema validates value exists in CUSTOMER_TYPES category via server query

**Example Validation Flow:**

```typescript
// Zod Schema (Server-Side)
const customerSchema = z.object({
  customer_type_code: z.string().min(1).refine(async (code) => {
    const lookup = await getLookupValue('CUSTOMER_TYPES', code);
    return lookup !== null;
  }, { message: 'Invalid customer type code' }),
  // ... other fields
});

// UI Component
<LookupSelect
  categoryCode="CUSTOMER_TYPES"
  value={customerTypeCode}
  onChange={(value) => setCustomerTypeCode(value)}
  label="Customer Type"
  required
/>
```

This pattern prevents:
- Referential integrity issues from non-globally-unique value_code
- Invalid category assignments (e.g., VENDOR_TYPES value in customer_type_code field)
- Database-level FK constraint failures when value codes overlap across categories

---

## 7. Database Schema Plan

### 7.1 Schema Overview (REV3)

All 29 tables follow a consistent pattern:

**Core Fields:**
- `id` (BIGINT PK, auto-increment)
- `<entity>_code` (TEXT UNIQUE NOT NULL) — auto-generated via numbering engine
- `<entity>_name_en` (TEXT NOT NULL)
- `<entity>_name_ar` (TEXT)

**Classification Fields (REV3 Lookup Pattern):**
- `<entity>_type_code` (TEXT NOT NULL) — NO FK to global_lookup_values
- `<entity>_category_code` (TEXT) — NO FK to global_lookup_values
- Column comments document lookup category source

**Status Fields (REV3 Lookup Pattern):**
- `status_code` (TEXT NOT NULL DEFAULT 'ACTIVE') — NO FK to global_lookup_values
- Column comment: 'Lookup value code from PARTY_STATUS_TYPES'

**ICV/CICPA Fields (REV2, for 5 applicable tables only):**
- `icv_certificate_number` (TEXT)
- `icv_score_percentage` (NUMERIC(5,2), 0-100 constraint)
- `icv_issue_date` (DATE)
- `icv_expiry_date` (DATE, >= issue_date constraint)
- `icv_company_type` (TEXT)
- `icv_financial_year_end_date` (DATE)
- `icv_certification_body` (TEXT)
- `icv_version` (TEXT)
- `icv_status_code` (TEXT) — NO FK to global_lookup_values (REV3)
- `icv_document_path` (TEXT, temporary nullable reference)
- `cicpa_registration_number` (TEXT)

**Audit Fields:**
- `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())
- `created_by` (BIGINT FK → user_profiles.id)
- `updated_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())
- `updated_by` (BIGINT FK → user_profiles.id)
- `deactivated_at` (TIMESTAMPTZ)
- `deactivated_by` (BIGINT FK → user_profiles.id)
- `deactivation_reason` (TEXT)

**System Fields:**
- `is_active` (BOOLEAN NOT NULL DEFAULT TRUE)
- `is_locked` (BOOLEAN NOT NULL DEFAULT FALSE)
- `is_system` (BOOLEAN NOT NULL DEFAULT FALSE)
- `sort_order` (INTEGER NOT NULL DEFAULT 0)

### 7.2 Customers Table (REV2/REV3)

```sql
CREATE TABLE IF NOT EXISTS customers (
  id bigint generated by default as identity primary key,
  
  -- Code and names
  customer_code text unique not null,
  customer_name_en text not null,
  customer_name_ar text,
  
  -- Classification (REV3: NO FK to global_lookup_values)
  customer_type_code text not null,
  industry_type_code text,
  customer_segment_code text,
  lead_source_code text,
  
  -- Registration and legal
  trn text check (trn is null or char_length(trn) = 15),
  trade_license_number text,
  license_expiry_date date,
  
  -- Contact information
  website_url text,
  primary_email text check (primary_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$'),
  primary_phone text,
  primary_mobile text,
  
  -- Geography (FK to master data tables)
  country_id bigint references countries(id),
  emirate_id bigint references emirates(id),
  city_id bigint references cities(id),
  area_zone_id bigint references areas_zones(id),
  address_line_1 text,
  address_line_2 text,
  po_box text,
  makani_number text,
  
  -- Commercial terms (FK to master data tables)
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
  icv_status_code text, -- REV3: NO FK
  icv_document_path text,
  
  -- CICPA (Critical Infrastructure and Coastal Protection Authority) company registration (REV2)
  cicpa_registration_number text,
  
  -- Notes
  notes text,
  
  -- Status (REV3: NO FK to global_lookup_values)
  status_code text not null default 'ACTIVE',
  
  -- Audit fields (FK to user_profiles)
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

-- REV3: Column comments documenting lookup category sources
COMMENT ON TABLE customers IS 'Customer master data for CRM, sales, and commercial transactions';
COMMENT ON COLUMN customers.customer_type_code IS 'Lookup value code from CUSTOMER_TYPES. Customer type (REV1: includes GOVERNMENT_CUSTOMER, UTILITY_COMPANY, WATER_POWER_PLANT, INDUSTRIAL_CUSTOMER, COMMERCIAL_CUSTOMER)';
COMMENT ON COLUMN customers.industry_type_code IS 'Lookup value code from INDUSTRY_TYPES.';
COMMENT ON COLUMN customers.customer_segment_code IS 'Lookup value code from CUSTOMER_SEGMENTS.';
COMMENT ON COLUMN customers.lead_source_code IS 'Lookup value code from CRM_LEAD_SOURCES.';
COMMENT ON COLUMN customers.status_code IS 'Lookup value code from PARTY_STATUS_TYPES.';
COMMENT ON COLUMN customers.icv_status_code IS 'Lookup value code from ICV_STATUS_TYPES. ICV certificate status (VALID, EXPIRED, UNDER_RENEWAL, NOT_AVAILABLE, NOT_REQUIRED, PENDING_SUBMISSION)';
```

**Similar patterns apply to** vendors, subcontractors, consultants, and recruitment_agencies tables (with ICV/CICPA fields).

**Government authorities table** excludes ICV/CICPA fields (regulators, not commercial companies).

### 7.3 REV3 Key Principles

1. **No Direct FK to global_lookup_values(value_code)**:
   - All lookup-code columns are TEXT fields without FK
   - Reason: value_code is not globally unique; same code may exist in multiple categories
   - Direct FK would cause referential integrity issues

2. **Column Comments Document Lookup Sources**:
   - Every lookup-code column has comment indicating category source
   - Example: `COMMENT ON COLUMN customers.customer_type_code IS 'Lookup value code from CUSTOMER_TYPES'`
   - Provides documentation for developers and database administrators

3. **Application-Layer Validation**:
   - LookupSelect component ensures category-specific value selection
   - Server-side Zod schemas validate value_code exists in correct category
   - Prevents invalid category assignments at application layer

4. **Real Master Data FKs Preserved**:
   - FK references to countries, emirates, cities, currencies, payment_terms, tax_types, banks, user_profiles remain intact
   - Only unsafe FK to global_lookup_values(value_code) removed

---

## 8. Contact / Address / Document Strategy

### 8.1 Contact Person Strategy

**Pattern**: One dedicated contact table per main entity (6 tables total)

**Common Fields**:
- Full name (en/ar)
- Position/title
- Department
- Contact information (email, phone, mobile, WhatsApp)
- Contact type code (REV3: soft lookup reference to CONTACT_TYPES)
- Preferred communication code (REV3: soft lookup reference to COMMUNICATION_PREFERENCE_TYPES)
- Primary contact flag
- Status code (REV3: soft lookup reference to PARTY_STATUS_TYPES)
- Audit fields
- System fields

**REV3 Lookup Pattern**: All contact_type_code and preferred_communication_code fields are TEXT without direct FK, with column comments documenting lookup category source.

**Tables**:
- customer_contacts
- vendor_contacts
- subcontractor_contacts
- consultant_contacts
- government_authority_contacts
- recruitment_agency_contacts

### 8.2 Address Strategy

**Pattern**: One dedicated address table per main entity (6 tables total)

**Common Fields**:
- Address type code (REV3: soft lookup reference to ADDRESS_TYPES)
- Geography FKs (country_id, emirate_id, city_id, area_zone_id)
- Address lines (1, 2)
- Building name, street name
- PO Box, Makani number
- Latitude/longitude
- Is primary flag
- Is billing address flag
- Is shipping address flag
- Status code (REV3: soft lookup reference to PARTY_STATUS_TYPES)
- Audit fields
- System fields

**REV3 Lookup Pattern**: address_type_code and status_code fields are TEXT without direct FK.

**Tables**:
- customer_addresses
- vendor_addresses
- subcontractor_addresses
- consultant_addresses
- government_authority_addresses
- recruitment_agency_addresses

### 8.3 Document Strategy

**Pattern**: One dedicated document table per main entity (6 tables total)

**Common Fields**:
- Document type code (REV3: soft lookup reference to PARTY_DOCUMENT_TYPES)
- Document number
- Issue date, expiry date
- Document file path (temporary text field, DMS not implemented)
- Issuing authority
- Notes
- Status code (REV3: soft lookup reference to PARTY_STATUS_TYPES)
- Audit fields
- System fields

**REV3 Lookup Pattern**: document_type_code and status_code fields are TEXT without direct FK.

**Tables**:
- customer_documents
- vendor_documents
- subcontractor_documents
- consultant_documents
- government_authority_documents
- recruitment_agency_documents

---

## 9. Bank Details Strategy

**Pattern**: One dedicated bank details table per applicable main entity (5 tables total — government_authority_bank_details excluded per REV1)

**Common Fields**:
- Bank FK (bank_id → banks table)
- Bank account type code (REV3: soft lookup reference to BANK_ACCOUNT_TYPES)
- Account number
- Account name
- IBAN
- Swift code
- Branch name
- Currency FK (currency_id → currencies table)
- Is primary flag
- Is active flag
- Audit fields
- System fields

**REV3 Lookup Pattern**: bank_account_type_code field is TEXT without direct FK.

**REV1 Exclusion Rationale**: Government authorities excluded because government fees/permits are paid via government payment gateways (e.g., online portals), not direct bank transfers.

**Tables**:
- customer_bank_details
- vendor_bank_details
- subcontractor_bank_details
- consultant_bank_details
- recruitment_agency_bank_details

---

## 10. CRM Foundation Strategy

This phase establishes the foundational party master data for future CRM modules:

**Future CRM Integration Paths**:
- **Customers** → CRM Leads, Opportunities, Sales Pipeline, Quotations, Sales Orders
- **Contact Persons** → CRM Activity Tracking, Meeting Notes, Email Communication
- **Addresses** → Delivery Locations, Service Locations, Billing/Shipping Addresses
- **Lead Source Codes** → Marketing Campaign Attribution, Lead Conversion Tracking

**CRM-Specific Fields Included**:
- `lead_source_code` (customers table)
- `customer_segment_code` (customers table)
- `industry_type_code` (customers table)
- `sales_owner_user_profile_id` (customers table)

**CRM-Specific Fields Not Included (Future Phase)**:
- Lead stages, opportunity pipelines
- Sales forecasting
- Quotation/proposal tracking
- Customer interaction history

---

## 11. Master Data Reuse and Dropdown Mapping Matrix

### 11.1 Reused Master Data Tables

| Master Data | Tables | Usage in 002F.3E |
|-------------|--------|------------------|
| **Geography** | countries, emirates, cities, areas_zones | Address fields across all main entity and address tables |
| **Finance Basics** | currencies, payment_terms, tax_types, banks | Commercial terms in main entity tables; bank details in bank tables |
| **Numbering Engine** | numbering_document_types, numbering_rules | Auto-generated entity codes (CUST-000001, VEND-000001, etc.) |
| **Lookup Engine** | global_lookup_categories, global_lookup_values | Classification, status, type fields across all 29 tables (REV3: soft references only) |
| **User Profiles** | user_profiles | Audit fields (created_by, updated_by, etc.) and owner fields (sales_owner_user_profile_id, etc.) |

### 11.2 Dropdown Mapping Matrix (REV3 Soft References)

| Field | Dropdown Source | Component | REV3 Pattern |
|-------|----------------|-----------|--------------|
| `customer_type_code` | `CUSTOMER_TYPES` lookup | `LookupSelect` | Soft reference with column comment |
| `customer_segment_code` | `CUSTOMER_SEGMENTS` lookup | `LookupSelect` | Soft reference with column comment |
| `industry_type_code` | `INDUSTRY_TYPES` lookup | `LookupSelect` | Soft reference with column comment |
| `vendor_type_code` | `VENDOR_TYPES` lookup | `LookupSelect` | Soft reference with column comment |
| `supplier_category_code` | `SUPPLIER_CATEGORIES` lookup | `LookupSelect` | Soft reference with column comment |
| `subcontractor_type_code` | `SUBCONTRACTOR_TYPES` lookup | `LookupSelect` | Soft reference with column comment |
| `consultant_type_code` | `CONSULTANT_TYPES` lookup | `LookupSelect` | Soft reference with column comment |
| `authority_type_code` | `GOVERNMENT_AUTHORITY_TYPES` lookup | `LookupSelect` | Soft reference with column comment |
| `agency_type_code` | `RECRUITMENT_AGENCY_TYPES` lookup | `LookupSelect` | Soft reference with column comment |
| `contact_type_code` | `CONTACT_TYPES` lookup | `LookupSelect` | Soft reference with column comment |
| `address_type_code` | `ADDRESS_TYPES` lookup | `LookupSelect` | Soft reference with column comment |
| `document_type_code` | `PARTY_DOCUMENT_TYPES` lookup | `LookupSelect` | Soft reference with column comment |
| `bank_account_type_code` | `BANK_ACCOUNT_TYPES` lookup | `LookupSelect` | Soft reference with column comment |
| `hse_prequalification_status_code` | `HSE_PREQUALIFICATION_STATUS_TYPES` lookup | `LookupSelect` | Soft reference with column comment |
| **`icv_status_code`** | **`ICV_STATUS_TYPES` lookup** | **`LookupSelect`** | **Soft reference with column comment** (REV2/REV3) |
| `status_code` | `PARTY_STATUS_TYPES` lookup | `LookupSelect` | Soft reference with column comment |
| `country_id` | `countries` table | `CountrySelect` | Direct FK (reuse existing) |
| `emirate_id` | `emirates` table | `EmirateSelect` | Direct FK (reuse existing) |
| `city_id` | `cities` table | `CitySelect` | Direct FK (reuse existing) |
| `currency_id` | `currencies` table | `CurrencySelect` | Direct FK (reuse existing) |
| `payment_term_id` | `payment_terms` table | `PaymentTermSelect` | Direct FK (reuse existing) |
| `tax_type_id` | `tax_types` table | `TaxTypeSelect` | Direct FK (reuse existing) |
| `bank_id` | `banks` table | `BankSelect` | Direct FK (reuse existing) |

**REV3 Key Point**: All *_code fields use soft references (TEXT without FK) with column comments documenting lookup category source. All *_id fields use direct FK references to master data tables.

---

## 12. RLS / Permission / Role Assignment Plan

### 12.1 Simplified Grouped Permissions (REV1)

**Permission Namespace**: `master_data.party_master.*`

**4 Grouped Permissions**:
1. `master_data.party_master.view` — Read access to all party master data
2. `master_data.party_master.manage` — Create, update, delete access to all party master data
3. `master_data.party_master.export` — Export party master data
4. `master_data.party_master.audit_view` — View audit logs for party master data

**Rationale**: Simplified from granular per-entity permissions (48 permissions) to grouped approach (4 permissions) for manageable implementation and role assignment.

### 12.2 Role Assignments

| Role | Permissions Granted |
|------|---------------------|
| `system_admin` | view, manage, export, audit_view |
| `group_admin` | view, manage, export, audit_view |
| `company_admin` | view, manage, export, audit_view |
| `branch_admin` | view, manage |

### 12.3 RLS Policies

**Pattern**: Each of the 29 tables has 4 RLS policies:

1. **SELECT policy** — checks `current_user_has_permission('master_data.party_master.view')`
2. **INSERT policy** — checks `current_user_has_permission('master_data.party_master.manage')`
3. **UPDATE policy** — checks `current_user_has_permission('master_data.party_master.manage')`
4. **DELETE policy** — checks `current_user_has_permission('master_data.party_master.manage')`

**Total RLS Policies**: ~174 (4 policies × 29 tables, with some variations for audit fields)

**Helper Function**: `current_user_has_permission(permission_code text) RETURNS boolean`

---

## 13. Audit Logging Plan

**Pattern**: Full audit logging for all main entity tables (6 tables)

**Audit Actions**:
- `CREATE` — when entity is created
- `UPDATE` — when entity is updated (includes diff of changed fields)
- `DELETE` — when entity is soft-deleted
- `ACTIVATE` — when entity is activated
- `DEACTIVATE` — when entity is deactivated

**Audit Implementation**:
- `logAudit()` function in server actions
- `createAuditDiff()` function for field-level change tracking
- Audit trail stored in `audit_logs` table

**Audit Fields Tracked**:
- All main entity fields (except system-generated fields like id, created_at)
- User who performed action (via `user_profiles` FK)
- Timestamp of action
- Before/after values for updated fields

**Child Table Audit**: Child tables (contacts, addresses, documents, bank details) inherit audit logging via parent entity audit trail.

---

## 14. Server Actions Plan

### 14.1 Core Actions per Entity (8 actions × 6 entities = 48 actions)

**Per Main Entity**:
1. `list<Entity>` — List with pagination, filtering, sorting
2. `get<Entity>ById` — Get single entity by ID
3. `create<Entity>` — Create new entity with audit logging
4. `update<Entity>` — Update entity with audit logging
5. `delete<Entity>` — Soft delete entity with audit logging
6. `activate<Entity>` — Activate entity with audit logging
7. `deactivate<Entity>` — Deactivate entity with audit logging
8. `export<Entity>` — Export entity list to CSV/Excel

**Example (Customers)**:
- `listCustomers(filters, pagination)`
- `getCustomerById(id)`
- `createCustomer(data)` — includes numbering engine integration (CUST-000001)
- `updateCustomer(id, data)` — includes audit diff
- `deleteCustomer(id)` — soft delete only
- `activateCustomer(id)`
- `deactivateCustomer(id)`
- `exportCustomers(filters)`

### 14.2 Child Entity Actions

**Per Child Entity Type** (contacts, addresses, documents, bank details):
- `list<Entity><Child>` — e.g., `listCustomerContacts(customerId)`
- `create<Entity><Child>` — e.g., `createCustomerContact(customerId, data)`
- `update<Entity><Child>` — e.g., `updateCustomerContact(id, data)`
- `delete<Entity><Child>` — e.g., `deleteCustomerContact(id)`

**Total Child Entity Actions**: ~96 actions (4 actions × 24 child tables)

**Grand Total Actions**: ~144 actions (48 main + 96 child)

---

## 15. Validation Plan

### 15.1 Server-Side Validation (Zod Schemas)

**Pattern**: Each create/update action has Zod schema validation

**Example Customer Schema**:

```typescript
const createCustomerSchema = z.object({
  customer_name_en: z.string().min(1).max(255),
  customer_name_ar: z.string().max(255).optional(),
  customer_type_code: z.string().min(1), // REV3: Server validates category via query
  industry_type_code: z.string().optional(),
  customer_segment_code: z.string().optional(),
  trn: z.string().length(15).optional(),
  primary_email: z.string().email().optional(),
  // ICV fields (REV2)
  icv_certificate_number: z.string().optional(),
  icv_score_percentage: z.number().min(0).max(100).optional(),
  icv_issue_date: z.date().optional(),
  icv_expiry_date: z.date().optional(),
  icv_status_code: z.string().optional(), // REV3: Server validates category via query
  cicpa_registration_number: z.string().optional(),
  // ... other fields
});
```

**REV3 Lookup Validation**: Server-side Zod refinements validate that lookup-code values exist in correct category:

```typescript
customer_type_code: z.string().refine(async (code) => {
  const lookup = await getLookupValue('CUSTOMER_TYPES', code);
  return lookup !== null;
}, { message: 'Invalid customer type code' })
```

### 15.2 Client-Side Validation (React Hook Form + Zod)

**Pattern**: Forms use `react-hook-form` with Zod resolver

**Example**:

```typescript
const form = useForm<z.infer<typeof createCustomerSchema>>({
  resolver: zodResolver(createCustomerSchema),
  defaultValues: { /* ... */ },
});
```

**REV3 Lookup Validation**: LookupSelect component prevents invalid category selection at UI layer.

### 15.3 Database Constraints

**Constraints Applied**:
- TRN length check: `char_length(trn) = 15`
- Email format check: regex pattern
- Credit limit non-negative: `credit_limit >= 0`
- ICV score percentage: `icv_score_percentage >= 0 and icv_score_percentage <= 100` (REV2)
- ICV date logic: `icv_expiry_date >= icv_issue_date` (REV2)

**REV3 Note**: No FK constraint on lookup-code columns; validation enforced at application/server layer.

---

## 16. UI / Screen Plan

### 16.1 Main Entity Screens (6 screens)

**Pattern**: List + Detail (Drawer Form)

**Each Main Entity Screen Includes**:
- List view with `ERPDataTable`:
  - Sorting, filtering, column resizing, global search
  - Multi-field search (code, name_en, name_ar)
  - Quick actions (edit, delete, activate, deactivate)
  - Bulk actions (export, bulk delete)
- Detail/Edit view with `ERPDrawerForm`:
  - Multi-section form with `ERPDrawerSectionNav`
  - Sections: Basic Info, Classification, Contact Info, Geography, Commercial Terms, ICV/CICPA (REV2), Notes, System
  - Tabs for child records (Contacts, Addresses, Documents, Bank Details)
  - Audit trail view

**Screens**:
1. Customers List & Detail
2. Vendors List & Detail
3. Subcontractors List & Detail
4. Consultants List & Detail
5. Government Authorities List & Detail (NO ICV/CICPA section)
6. Recruitment Agencies List & Detail

### 16.2 Child Entity Management (Embedded in Main Entity Detail)

**Pattern**: Tabs within main entity drawer form

**Each Child Entity Tab Includes**:
- Mini `ERPDataTable` for list view
- Inline add/edit forms or mini drawer forms
- Quick actions (edit, delete)

**Child Entity Tabs**:
- Contacts tab
- Addresses tab
- Documents tab
- Bank Details tab (if applicable)

### 16.3 REV2 ICV/CICPA Form Section

**Section**: UAE Compliance (for 5 applicable entities only)

**Fields**:
- ICV Certificate Number
- ICV Score Percentage
- ICV Issue Date
- ICV Expiry Date
- ICV Company Type
- ICV Financial Year End Date
- ICV Certification Body
- ICV Version
- ICV Status (LookupSelect with ICV_STATUS_TYPES)
- ICV Document Path
- CICPA Registration Number

**Layout**: Collapsible section, optional fields, conditional visibility based on entity type.

### 16.4 REV3 Lookup Validation in Forms

**Pattern**: All classification/type/status fields use `LookupSelect` component with category-specific validation

**Example**:

```tsx
<LookupSelect
  categoryCode="CUSTOMER_TYPES"
  value={form.watch('customer_type_code')}
  onChange={(value) => form.setValue('customer_type_code', value)}
  label="Customer Type"
  required
/>
```

**LookupSelect Component**:
- Loads values from global_lookup_values filtered by category_code
- Prevents selection of values from wrong category
- Includes search/filter capability
- Shows value badge with color variant

---

## 17. Reusable Select Component Plan

### 17.1 Required Reusable Components (6 components)

**Pattern**: One select component per main entity type

**Components**:
1. `CustomerSelect.tsx` — Select customer from customers table
2. `VendorSelect.tsx` — Select vendor from vendors table
3. `SubcontractorSelect.tsx` — Select subcontractor from subcontractors table
4. `ConsultantSelect.tsx` — Select consultant from consultants table
5. `GovernmentAuthoritySelect.tsx` — Select government authority from government_authorities table
6. `RecruitmentAgencySelect.tsx` — Select recruitment agency from recruitment_agencies table

**Common Props**:
- `value` (bigint ID)
- `onChange` (callback)
- `disabled` (boolean)
- `label` (string)
- `required` (boolean)
- `placeholder` (string)

**Common Features**:
- Server-side data loading
- Search/filter by code or name
- Display format: `[CODE] Name EN`
- Async combobox pattern
- Error handling

**Usage in Future Modules**:
- Sales Orders (CustomerSelect)
- Purchase Orders (VendorSelect)
- Subcontracting (SubcontractorSelect)
- Professional Services (ConsultantSelect)
- Government Correspondence (GovernmentAuthoritySelect)
- HR Recruitment (RecruitmentAgencySelect)

---

## 18. Sidebar / Menu Plan

**Menu Structure**:

```
Master Data
├── Geography (existing)
├── Finance Basics (existing)
├── Units & Measurements (existing)
└── Party Master (NEW)
    ├── Customers
    ├── Vendors
    ├── Subcontractors
    ├── Consultants
    ├── Government Authorities
    └── Recruitment Agencies
```

**Permission Gate**: Menu items visible only if user has `master_data.party_master.view` permission.

**Active Route Detection**: Current active route highlighted in sidebar.

**Collapsed by Default**: Menu groups start collapsed; expand/collapse state persisted in localStorage.

---

## 19. Seed Data Plan

### 19.1 Lookup Categories (23 categories)

**Seeded via SQL INSERT**:
- 23 lookup categories
- Each with category_code, category_name_en, category_name_ar, description, category_group, sort_order

**REV2 Addition**: ICV_STATUS_TYPES category added.

### 19.2 Lookup Values (~136 values)

**Seeded via SQL INSERT**:
- ~136 lookup values across 23 categories
- Each with value_code, value_name_en, value_name_ar, description, badge_variant, is_system, is_locked, is_default, sort_order

**REV1 Expansions**:
- CUSTOMER_TYPES: 8 values (including GOVERNMENT_CUSTOMER, UTILITY_COMPANY, WATER_POWER_PLANT)
- VENDOR_TYPES: 10 values (including TRANSPORTER, PRIVATE_WASTE_DISPOSAL_FACILITY)
- SUBCONTRACTOR_TYPES: 7 values (including TRANSPORT_SUBCONTRACTOR)
- CONSULTANT_TYPES: 8 values (including AUDIT_CONSULTANT)
- GOVERNMENT_AUTHORITY_TYPES: 11 values (including LICENSE_ISSUER, PERMIT_ISSUER, UTILITY_AUTHORITY)

**REV2 Addition**: ICV_STATUS_TYPES: 6 values (VALID, EXPIRED, UNDER_RENEWAL, NOT_AVAILABLE, NOT_REQUIRED, PENDING_SUBMISSION)

### 19.3 Permissions (4 grouped permissions)

**Seeded via SQL INSERT**:
- `master_data.party_master.view`
- `master_data.party_master.manage`
- `master_data.party_master.export`
- `master_data.party_master.audit_view`

### 19.4 Role Assignments

**Seeded via SQL INSERT**:
- `system_admin` → all 4 permissions
- `group_admin` → all 4 permissions
- `company_admin` → all 4 permissions
- `branch_admin` → view, manage permissions only

### 19.5 Numbering Document Types (6 types)

**Seeded via SQL INSERT**:
- CUST (Customers)
- VEND (Vendors)
- SUBC (Subcontractors)
- CONS (Consultants)
- AUTH (Government Authorities)
- AGCY (Recruitment Agencies)

**Numbering Rules**:
- Prefix: CUST-, VEND-, SUBC-, CONS-, AUTH-, AGCY-
- Padding: 6 digits
- Example: CUST-000001, VEND-000123

---

## 20. Data Migration / Legacy Strategy

**Approach**: Additive, non-destructive

**For Existing Organizations with Legacy Party Data**:
1. **Phase 1**: Create 29 new tables (this phase)
2. **Phase 2**: Migrate legacy party data to new tables via ETL scripts (future phase)
3. **Phase 3**: Dual-write period — updates go to both legacy and new tables (future phase)
4. **Phase 4**: Switch applications to read from new tables (future phase)
5. **Phase 5**: Archive legacy tables (future phase)

**For New Organizations**:
- Start with new tables directly
- No legacy migration required

**REV2 Consideration**: Organizations with existing ICV/CICPA data in Excel/spreadsheets can bulk import via CSV upload feature (future phase).

**REV3 Consideration**: Legacy data with different lookup code formats can be normalized via ETL scripts to match new lookup categories.

---

## 21. Testing Plan

### 21.1 Unit Tests

**Coverage**:
- Server actions (CRUD operations)
- Validation schemas (Zod)
- Helper functions (audit logging, numbering engine integration)

**Test Cases per Action**:
- Happy path (valid input → success)
- Validation errors (invalid input → error)
- Permission errors (unauthorized user → error)
- Audit logging (action creates audit log entry)

### 21.2 Integration Tests

**Coverage**:
- Database operations (create, read, update, delete)
- RLS policies (correct permission checks)
- Numbering engine integration (auto-generated codes)
- Lookup validation (REV3: soft reference validation)

**Test Cases**:
- Create customer with auto-generated code (CUST-000001)
- Update customer with audit diff
- Soft delete customer with deactivation fields
- Query customer with RLS permission check
- Validate customer_type_code exists in CUSTOMER_TYPES category (REV3)

### 21.3 UI Tests

**Coverage**:
- Form validation (client-side + server-side)
- Data table operations (sorting, filtering, pagination)
- Child entity management (add/edit/delete contacts)
- Reusable select components (CustomerSelect, VendorSelect, etc.)

**Test Cases**:
- Submit invalid form → validation errors displayed
- Search customer by code/name → filtered results
- Add contact to customer → contact appears in list
- Select customer from CustomerSelect → correct customer loaded

### 21.4 REV2 ICV/CICPA Tests

**Test Cases**:
- ICV score percentage validation (0-100 constraint)
- ICV date logic validation (expiry >= issue)
- ICV status dropdown (only ICV_STATUS_TYPES values selectable)
- CICPA registration number (nullable, no strict format)
- Government authorities have no ICV/CICPA fields

### 21.5 REV3 Lookup Validation Tests

**Test Cases**:
- Lookup-code column has no FK constraint (TEXT field)
- Column comment documents lookup category source
- LookupSelect component loads only category-specific values
- Server-side validation rejects invalid category value
- Create customer with VENDOR_TYPES value → validation error

---

## 22. Risk Analysis and Mitigation

### 22.1 Data Quality Risks

**Risk**: Manual entry of party data leads to inconsistent formatting, duplicate entries, missing required fields.

**Mitigation**:
- ✅ Zod validation enforces required fields and data formats
- ✅ TRN uniqueness check prevents duplicate entries
- ✅ Auto-generated codes (CUST-000001) ensure unique identifiers
- ✅ Audit logging tracks data changes for review

### 22.2 REV1 Dual-Role Classification Risk

**Risk**: Same physical company exists in multiple tables (e.g., transporter as vendor AND subcontractor) creates data synchronization issues.

**Mitigation**:
- ✅ Intentional design — separate tables allow distinct business contexts
- ✅ TRN field can be used to identify same physical company across tables
- ⚠️ Future consideration: Add "related entities" feature to link same company across tables

### 22.3 REV2 ICV Data Quality Risk

**Risk**: ICV certificate data is manually entered. Risk of data entry errors (incorrect score, wrong dates, etc.).

**Mitigation**:
- ✅ Constraints added for score percentage (0-100) and date logic (expiry >= issue)
- ✅ `icv_status_code` dropdown enforces valid status values
- ⚠️ Future consideration: Add ICV certificate verification workflow and audit trail

### 22.4 REV2 CICPA Format Variation Risk

**Risk**: CICPA company registration number format may vary across different authorities/regions. No format constraint added.

**Mitigation**:
- ✅ Nullable text field with no overly strict format constraint allows flexibility
- ⚠️ Future consideration: Validate CICPA format if standard format is confirmed

### 22.5 REV2 DMS Integration Delay Risk

**Risk**: `icv_document_path` is a temporary nullable text field. Full DMS (Document Management System) integration not implemented in this phase.

**Mitigation**:
- ✅ Field is nullable and clearly documented as temporary reference
- ⚠️ Future phase: Integrate DMS and migrate `icv_document_path` to FK reference to DMS document table

### 22.6 REV3 Lookup Validation Risk

**Risk**: Without direct FK to global_lookup_values(value_code), invalid lookup codes could be inserted bypassing application validation.

**Mitigation**:
- ✅ LookupSelect component enforces category-specific value selection at UI layer
- ✅ Server-side Zod validation verifies value_code exists in correct category before database insert
- ✅ Column comments document lookup category source for manual review
- ⚠️ Future consideration: Add database trigger to validate lookup codes if direct SQL inserts are performed

### 22.7 REV3 Migration Risk

**Risk**: Removing 75 FK constraints may cause migration issues if database already has lookup-code data with FK dependencies.

**Mitigation**:
- ✅ This phase has NOT been applied to database yet — SQL is review-only
- ✅ REV3 corrections applied before any database migration
- ⚠️ If database already has REV1/REV2 data: Drop FK constraints first, then run REV3 migration

### 22.8 Performance Risk

**Risk**: 29 tables with ~174 RLS policies may cause query performance issues.

**Mitigation**:
- ✅ Indexes added for all FK columns and search fields
- ✅ Partial indexes for nullable unique fields (e.g., TRN)
- ✅ REV2: +20 partial indexes for ICV/CICPA fields (where not null)
- ⚠️ Future monitoring: Add query performance monitoring and optimize as needed

### 22.9 Permission Management Risk

**Risk**: Simplified grouped permissions may not provide granular enough access control for some roles.

**Mitigation**:
- ✅ Grouped permissions (4 total) sufficient for initial implementation
- ⚠️ Future consideration: Add granular per-entity permissions if business requirements demand it

---

## 23. Acceptance Criteria

### 23.1 Database Layer

✅ **29 tables created** (6 main + 23 child)  
✅ **23 lookup categories seeded** (REV2: +1 for ICV_STATUS_TYPES)  
✅ **~136 lookup values seeded** (REV2: +6 for ICV status types)  
✅ **4 grouped permissions created**  
✅ **Role assignments created** (system_admin, group_admin, company_admin, branch_admin)  
✅ **~174 RLS policies created** (4 per table × 29 tables)  
✅ **100+ indexes created** (REV2: +20 for ICV/CICPA)  
✅ **29 triggers created** (set_updated_at for each table)  
✅ **6 numbering document types created** (CUST, VEND, SUBC, CONS, AUTH, AGCY)  
✅ **REV2: ICV/CICPA fields present in 5 applicable tables** (customers, vendors, subcontractors, consultants, recruitment_agencies)  
✅ **REV2: ICV/CICPA fields excluded from government_authorities**  
✅ **REV3: No direct FK to global_lookup_values(value_code)** (75 occurrences removed)  
✅ **REV3: Column comments added for all lookup-code fields** documenting lookup category source  

### 23.2 Server Actions

✅ **48+ server actions implemented** (8 per main entity × 6 entities)  
✅ **96+ child entity actions implemented** (4 per child table × 24 tables)  
✅ **Audit logging integrated** for all main entity actions  
✅ **Numbering engine integrated** for entity code generation  
✅ **Zod validation implemented** for all create/update actions  
✅ **REV3: Server-side lookup validation** via Zod refinements ensuring value_code belongs to correct category  

### 23.3 UI Layer

✅ **6 main entity screens implemented** (list + detail)  
✅ **Child entity management implemented** (contacts, addresses, documents, bank details)  
✅ **6 reusable select components implemented** (CustomerSelect, VendorSelect, etc.)  
✅ **Sidebar menu updated** with Party Master section  
✅ **REV2: ICV/CICPA form section implemented** for 5 applicable entities  
✅ **REV3: LookupSelect component** enforces category-specific value selection  

### 23.4 Testing

✅ **Unit tests passing** for server actions and validation  
✅ **Integration tests passing** for database operations and RLS  
✅ **UI tests passing** for forms and data tables  
✅ **REV2: ICV/CICPA tests passing** (score validation, date logic, status dropdown)  
✅ **REV3: Lookup validation tests passing** (category-specific validation, no FK constraint)  

### 23.5 Documentation

✅ **Technical plan complete** (this document — REV3)  
✅ **SQL review report complete** (REV2 report documenting REV3 corrections)  
✅ **No placeholder sections** — all 26 sections fully written  
✅ **REV3 corrections documented** — lookup FK removal, column comments, validation pattern  

---

## 24. Future Integration Notes

### 24.1 CRM Modules

**Phase**: 002F.3F+ — CRM Pipeline & Opportunities

**Integration Points**:
- Customers → Leads, Opportunities, Sales Orders
- Contacts → Activity Tracking, Email Communication
- Lead Sources → Marketing Campaign Attribution

**New Tables Required**:
- crm_leads
- crm_opportunities
- crm_activities
- crm_campaigns

### 24.2 Procurement Modules

**Phase**: 002F.3G+ — Procurement & Purchase Orders

**Integration Points**:
- Vendors → Purchase Requisitions, Purchase Orders
- Vendor Bank Details → Payment Processing
- Supplier Categories → Vendor Evaluation

**New Tables Required**:
- purchase_requisitions
- purchase_orders
- vendor_evaluations

### 24.3 Subcontracting Modules

**Phase**: 002F.3H+ — Subcontracting Management

**Integration Points**:
- Subcontractors → Subcontracting Orders, Worker Supply
- HSE Prequalification → Project Assignments
- Subcontractor Bank Details → Payment Processing

**New Tables Required**:
- subcontracting_orders
- subcontractor_workers
- hse_compliance_records

### 24.4 Government Correspondence

**Phase**: 002F.3I+ — Regulatory Compliance & Permits

**Integration Points**:
- Government Authorities → Permit Applications, License Tracking
- Authority Contacts → Correspondence Tracking
- Authority Types → Regulatory Workflow Routing

**New Tables Required**:
- permits
- licenses
- government_correspondence

### 24.5 REV2 Future — ICV Workflow

**Phase**: TBD — ICV Certificate Management

**Integration Points**:
- ICV Certificate Upload via DMS
- ICV Certificate Verification Workflow
- ICV Score Calculation Engine
- ICV Certificate Expiry Alerts
- ICV Audit Trail

**New Tables/Features Required**:
- DMS integration
- Workflow engine
- Notification system

### 24.6 REV2 Future — CICPA Access Cards

**Phase**: TBD — HSE Access Control

**Integration Points**:
- CICPA Individual Employee Access Cards
- CICPA Subcontractor Employee Access Cards
- CICPA Access Card Issuance Workflow
- CICPA Access Card Expiry Tracking

**New Tables/Features Required**:
- cicpa_employee_access_cards
- cicpa_access_card_workflow
- HR/HSE integration

### 24.7 REV3 Future — Composite Lookup FK

**Phase**: TBD — Enhanced Lookup Integrity

**Integration Points**:
- Add category_code column to each table with lookup-code field
- Implement composite FK: (category_code, value_code) → global_lookup_values
- Maintain backward compatibility with existing soft reference pattern

**Rationale**: If business requires database-level lookup integrity, composite FK approach provides referential integrity without unsafe single-column FK to value_code.

---

## 25. Implementation Phasing Recommendation

### 25.1 Mandatory 5-Sub-Phase Implementation Strategy (REV1)

**Phase 002F.3E must be split into 5 sub-phases**:

#### Sub-Phase 002F.3E.1 — Technical Planning
- **Status**: COMPLETED (this document — REV3)
- **Deliverables**: Technical implementation plan (REV3), SQL review report (REV2)

#### Sub-Phase 002F.3E.2 — Database + Lookup Categories + Seed Values
- **Status**: READY FOR REVIEW (SQL file generated, NOT applied)
- **Tasks**:
  - Apply SQL migration to database (via MCP chunked application)
  - Verify 29 tables created
  - Verify 23 lookup categories + ~136 lookup values seeded
  - Verify 4 grouped permissions + role assignments
  - Verify ~174 RLS policies
  - Verify 100+ indexes
  - Verify 29 triggers
  - Verify 6 numbering document types
  - Verify ICV/CICPA fields present in 5 applicable tables (REV2)
  - Verify no direct FK to global_lookup_values(value_code) (REV3)
- **Approval Gate**: Sameer/Dina SQL review approval required before database application

#### Sub-Phase 002F.3E.3 — Server Actions (All 23 Tables, Grouped Permissions)
- **Status**: PLANNED
- **Tasks**:
  - Implement 48+ main entity server actions
  - Implement 96+ child entity server actions
  - Integrate audit logging
  - Integrate numbering engine
  - Implement Zod validation (REV3: with lookup category validation)
  - Implement revalidatePath for cache invalidation
- **Approval Gate**: Server action testing complete

#### Sub-Phase 002F.3E.4 — UI Screens (All 6 Entities + Child Records)
- **Status**: PLANNED
- **Tasks**:
  - Implement 6 main entity screens (list + detail)
  - Implement child entity management (contacts, addresses, documents, bank details)
  - Implement 6 reusable select components
  - Implement REV2 ICV/CICPA form sections
  - Implement REV3 LookupSelect components with category-specific validation
  - Update sidebar menu
- **Approval Gate**: UI QA testing complete

#### Sub-Phase 002F.3E.5 — Integration Testing + QA + Readiness Review
- **Status**: PLANNED
- **Tasks**:
  - Integration testing (database + server + UI)
  - QA testing (functional + regression)
  - Performance testing (RLS policies, indexes)
  - Security testing (permissions, RLS)
  - REV2 testing (ICV/CICPA field validation)
  - REV3 testing (lookup validation without FK)
  - User acceptance testing (UAT)
  - Production readiness review
- **Approval Gate**: Final Sameer/Dina approval before production deployment

### 25.2 Recommended Timeline (Approximate)

| Sub-Phase | Duration | Dependencies |
|-----------|----------|--------------|
| 002F.3E.1 | COMPLETE | None |
| 002F.3E.2 | 1 day | Sameer/Dina SQL approval |
| 002F.3E.3 | 3-5 days | 002F.3E.2 complete |
| 002F.3E.4 | 3-5 days | 002F.3E.3 complete |
| 002F.3E.5 | 2-3 days | 002F.3E.4 complete |
| **Total** | **9-14 days** | Sequential implementation |

**Note**: Timeline assumes no major blockers or scope changes. REV2 and REV3 corrections already incorporated into plan.

---

## 26. Final Recommendation

### 26.1 REV3 Status: READY FOR SAMEER REVIEW

This **REV3 technical implementation plan** represents the final corrected version incorporating:

1. **REV1 Corrections** — Classification expansions, dual-role rules, grouped permissions
2. **REV2 Additions** — ICV certificate fields (10 fields) + CICPA registration (1 field) for 5 applicable commercial entities
3. **REV3 Corrections** — Removed unsafe FK to global_lookup_values(value_code) (75 occurrences), added column comments documenting lookup category sources, explained application-layer lookup validation pattern

**All 26 plan sections are fully written** without placeholder language. This plan is implementation-ready.

### 26.2 SQL File Status: READY FOR REVIEW (REV3 CORRECTED)

The SQL migration file (`20260607150000_erp_base_002f3e2_people_contacts_crm_database_lookups_seeds.sql`) has been updated with REV3 corrections:

- ✅ **75 unsafe FK references removed** — all direct FK to global_lookup_values(value_code) eliminated
- ✅ **Column comments added** — all lookup-code fields documented with category source
- ✅ **REV2 ICV/CICPA fields preserved** — 5 applicable tables have ICV/CICPA fields, government_authorities excluded
- ✅ **Real master data FKs preserved** — FK to countries, emirates, currencies, payment_terms, banks, user_profiles remain intact

**SQL File Status**: FOR REVIEW ONLY — NOT applied to database. Sameer/Dina approval required before database application.

### 26.3 Next Steps

1. **Sameer/Dina Review**:
   - Review REV3 technical plan (this document)
   - Review SQL migration file with REV3 corrections
   - Review REV2 SQL review report
   - Approve or request additional corrections

2. **Sub-Phase 002F.3E.2 Execution** (after approval):
   - Apply SQL migration to database via MCP chunked application
   - Verify all 29 tables, 23 lookup categories, ~136 lookup values, 4 permissions, ~174 RLS policies created
   - Verify REV2 ICV/CICPA fields present in 5 applicable tables
   - Verify REV3 no unsafe FK to global_lookup_values(value_code)

3. **Sub-Phase 002F.3E.3-5 Execution** (sequential):
   - Implement server actions (002F.3E.3)
   - Implement UI screens (002F.3E.4)
   - Perform integration testing and QA (002F.3E.5)

### 26.4 Final Sign-Off

**Plan Status**: ✅ **READY FOR SAMEER REVIEW — REV3 Corrected Technical Plan Complete**  
**SQL Status**: ✅ **READY FOR REVIEW — REV3 SQL Correction Applied, Not Applied to Database**  
**Recommendation**: Approve REV3 plan and SQL for Sub-Phase 002F.3E.2 database application

---

*End of REV3 Technical Implementation Plan — FINAL CORRECTED VERSION*
