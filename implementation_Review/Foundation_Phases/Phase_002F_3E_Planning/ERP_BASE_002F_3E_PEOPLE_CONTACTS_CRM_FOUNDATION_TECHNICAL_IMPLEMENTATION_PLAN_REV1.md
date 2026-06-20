# ERP BASE 002F.3E — PEOPLE / CONTACTS / CRM FOUNDATION
## TECHNICAL IMPLEMENTATION PLAN — REV1 (CORRECTED)

**Phase:** ERP BASE 002F.3E — People / Contacts / CRM Foundation  
**Plan Date:** Sunday, June 7, 2026  
**Revised:** Sunday, June 7, 2026 (REV1)  
**Planner:** Claude Sonnet 4.5 (AI Agent)  
**Plan Type:** Technical Implementation Planning (No Code Implementation)  
**Technology Stack:** Next.js 16.2.6 (Turbopack), Supabase PostgreSQL, Shadcn UI  
**Status:** REV1 — Corrected Plan Based on Sameer/Dina Review  

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| **1.0** | 2026-06-07 12:30 PM | Initial technical plan |
| **REV1** | 2026-06-07 3:00 PM | **Corrected:** Customer types expanded (government/utility/industrial), Vendor types expanded (transporters/waste disposal), Waste disposal facility dual classification (government OR vendor), Government authority types expanded (license issuers/utility authorities), Transporter dual classification (vendor OR subcontractor), Permissions strategy simplified to grouped approach, Business classification rules clarified |

---

## Document Purpose

This document provides a comprehensive, implementation-ready technical plan for ERP BASE Phase 002F.3E — People / Contacts / CRM Foundation. This phase establishes the master data foundation for customers, vendors, subcontractors, consultants, government authorities, and recruitment agencies, along with their associated contacts, addresses, documents, and bank details.

**This is REVISION 1 (REV1)** — corrected based on Sameer/Dina review comments regarding classification rules, lookup category values, and permissions strategy.

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

This phase creates **6 main entity tables** with associated child records (contacts, addresses, documents, bank details), supported by **22+ lookup categories** for classification and status management. All data structures follow the established ERP BASE patterns (BIGINT PKs/FKs, `user_profiles` audit fields, RLS policies, permission-gated access).

**REV1 Key Changes:**
- ✅ **Customer types expanded** to include GOVERNMENT_CUSTOMER, SEMI_GOVERNMENT_CUSTOMER, UTILITY_COMPANY, WATER_POWER_PLANT, INDUSTRIAL_CUSTOMER, COMMERCIAL_CUSTOMER
- ✅ **Vendor types expanded** to include TRANSPORTER, TRANSPORT_SERVICE_PROVIDER, LOGISTICS_SERVICE_PROVIDER, PRIVATE_WASTE_DISPOSAL_FACILITY, WASTE_DISPOSAL_SERVICE_PROVIDER
- ✅ **Waste disposal facilities** can be EITHER government_authorities OR vendors (dual classification rule)
- ✅ **Transporters** can be EITHER vendors OR subcontractors (dual classification rule)
- ✅ **Government authority types expanded** to include LICENSE_ISSUER, PERMIT_ISSUER, UTILITY_AUTHORITY, TRANSPORT_AUTHORITY
- ✅ **Permissions simplified** to grouped "party_master" approach for manageable implementation
- ✅ **Business classification rules** clearly documented

### 1.2 Key Design Principles

1. **Separation of Entity Types**: No generic `persons` table. Each business entity category has a dedicated table with appropriate fields.
2. **No Employee Data**: Employees are explicitly excluded from this phase (handled in 002F.3F — HR Master Data).
3. **No Hardcoded Dropdowns**: All classification fields use existing master data tables or new lookup categories.
4. **Master Data Reuse**: Leverages existing Geography, Finance Basics, UOM, and Lookup Engine modules.
5. **Flexible Classification Rules**: Supports dual-role entities (e.g., transporter as vendor OR subcontractor, waste disposal as government OR vendor).
6. **Future-Ready**: Designed to support CRM, Sales, Procurement, Subcontracting, Recruitment, and Government Correspondence modules.

### 1.3 Scope Summary

**In Scope:**
- 6 main entity tables: `customers`, `vendors`, `subcontractors`, `consultants`, `government_authorities`, `recruitment_agencies`
- 24 child tables: contacts (6), addresses (6), documents (6), bank details (6)
- 22+ lookup categories for classification and status (expanded in REV1)
- 48+ server actions for CRUD operations
- 18+ UI screens (main entities + child records)
- 6 reusable select components for future modules
- Comprehensive RLS policies and simplified grouped permissions

**Out of Scope:**
- Employees and HR master data (Phase 002F.3F)
- CRM operational module (leads, opportunities, quotations)
- Procurement transactions (POs, RFQs)
- Sales orders and invoicing
- DMS operational workflow
- Project/contract management

### 1.4 Business Value (REV1 Enhanced)

This phase provides:
- **Centralized party master data** for consistent customer/vendor/subcontractor information across all modules
- **Flexible customer classification** supporting government customers, semi-government entities, utility companies, water & power plants, industrial/commercial customers, main contractors, EPC contractors, scrap buyers/suppliers
- **Comprehensive vendor classification** supporting material suppliers, equipment suppliers, service providers, transporters, logistics providers, private waste disposal facilities, insurance companies, lessors (property/vehicle/equipment/camp)
- **Dual-role entity support** allowing transporters and waste disposal facilities to be classified appropriately based on business context (vendor vs. subcontractor, government vs. vendor)
- **Government authority tracking** for license issuers, permit issuers, regulators, utility authorities, transport authorities, environmental authorities, municipalities, free zones, ports/customs
- **Contact management** with designation, communication preferences, and authorization tracking
- **Address hierarchy** supporting billing, shipping, and site locations
- **Document tracking** with expiry management for licenses, insurance, registrations
- **Bank details** for payment processing and vendor settlements
- **CRM foundation** with customer segmentation, lead sources, and relationship tracking
- **Compliance support** for TRN, trade license, and government authority tracking

### 1.5 Dependencies

**Prerequisites (All Complete):**
- ✅ 002F.3B — Global Lookup / Dropdown Engine
- ✅ 002F.3C.1 — Geography & Locations
- ✅ 002F.3C.2 — Finance Basics
- ✅ 002F.3C.3 — Units & Measurements

**Blocks:**
- 003 — CRM Module
- 008 — Procurement Module
- Future: Subcontracting, Recruitment, Government Correspondence

### 1.6 Estimated Effort

Based on complexity analysis and comparison to previous phases:

| Sub-Phase | Estimated Effort | Complexity |
|-----------|-----------------|------------|
| 002F.3E.2 — Database + Lookups + Seeds | 2-3 days | High (30 tables, 22+ lookup categories, ~130 values) |
| 002F.3E.3 — Customers + Child Tables | 2-3 days | High (4 tables, complex validation, CRM fields) |
| 002F.3E.4 — Vendors + Child Tables | 2-3 days | High (4 tables, dual-role transporters, waste disposal) |
| 002F.3E.5 — Remaining Entities | 2-3 days | Medium (12 tables, similar patterns, government authorities) |
| 002F.3E.6 — Select Components + QA | 1-2 days | Medium (6 components, sidebar, testing) |
| **Total** | **9-14 days** | **Very High** |

**REV1 Recommendation:** **Mandatory split into 5 implementation sub-phases** for manageable complexity and incremental testing. Do NOT implement all 30 tables in one implementation prompt.

---

## 2. Scope and Non-Scope Confirmation

### 2.1 In-Scope Entities

The following 6 main entity categories are **confirmed in scope** for Phase 002F.3E:

| Entity | Table Name | Business Purpose (REV1 Expanded) |
|--------|-----------|----------------------------------|
| **Customers** | `customers` | Government customers, semi-government customers, utility companies, water & power plants, main contractors, EPC contractors, industrial/commercial customers, scrap buyers/suppliers, normal customers, partners |
| **Vendors** | `vendors` | Suppliers (material/equipment), service providers, transporters (as service vendors), logistics providers, private waste disposal facilities, insurance companies, lessors (property/vehicle/equipment/camp), utility providers |
| **Subcontractors** | `subcontractors` | Civil/manpower/demolition/equipment subcontractors, transport subcontractors (when subcontracted for project execution), specialized subcontractors, partners |
| **Consultants** | `consultants` | Engineering, HSE, legal, technical, environmental, audit consultants |
| **Government Authorities** | `government_authorities` | License issuers, permit issuers, regulators, municipalities, police, civil defense, environmental authorities, free zones, port/customs authorities, utility authorities, transport authorities, government waste disposal authorities, ministries |
| **Recruitment Agencies** | `recruitment_agencies` | Local/overseas recruitment agencies, manpower supply agencies, executive search agencies (separate from vendors but vendor-like for payment/commercial purposes) |

### 2.2 Classification via Lookup Categories (Not Separate Tables)

**REV1 IMPORTANT:** The following business entity types are **classified via lookup values**, not separate tables:

#### 2.2.1 Customers Classification

| Business Concept | Classified Under | Lookup Category | Lookup Value Code |
|-----------------|------------------|-----------------|-------------------|
| **Government Customers** | Customers | `CUSTOMER_TYPES` | `GOVERNMENT_CUSTOMER` ✅ REV1 |
| **Semi-Government Customers** | Customers | `CUSTOMER_TYPES` | `SEMI_GOVERNMENT_CUSTOMER` ✅ REV1 |
| **Utility Companies** | Customers | `CUSTOMER_TYPES` | `UTILITY_COMPANY` ✅ REV1 |
| **Water & Power Plants** | Customers | `CUSTOMER_TYPES` | `WATER_POWER_PLANT` ✅ REV1 |
| **Industrial Customers** | Customers | `CUSTOMER_TYPES` | `INDUSTRIAL_CUSTOMER` ✅ REV1 |
| **Commercial Customers** | Customers | `CUSTOMER_TYPES` | `COMMERCIAL_CUSTOMER` ✅ REV1 |
| **Main Contractors** | Customers | `CUSTOMER_TYPES` | `MAIN_CONTRACTOR` |
| **EPC Contractors** | Customers | `CUSTOMER_TYPES` | `EPC_CONTRACTOR` |
| **Scrap Buyers** | Customers | `CUSTOMER_TYPES` | `SCRAP_BUYER` |
| **Scrap Suppliers** | Customers | `CUSTOMER_TYPES` | `SCRAP_SUPPLIER` |
| **Partners (Customer)** | Customers | `CUSTOMER_TYPES` | `PARTNER_CUSTOMER` |
| **Normal Customers** | Customers | `CUSTOMER_TYPES` | `NORMAL_CUSTOMER` (default) |

**Business Examples (REV1):**
- TAQA (Abu Dhabi National Energy Company) → UTILITY_COMPANY customer
- EWEC (Emirates Water and Electricity Company) → UTILITY_COMPANY customer
- Dubai Electricity and Water Authority (DEWA) → UTILITY_COMPANY or GOVERNMENT_CUSTOMER
- Water desalination plants → WATER_POWER_PLANT customer
- Federal/Emirate-level government entities purchasing services → GOVERNMENT_CUSTOMER
- Semi-government companies (e.g., Dubai Holding entities) → SEMI_GOVERNMENT_CUSTOMER
- Manufacturing facilities → INDUSTRIAL_CUSTOMER
- Retail/hospitality entities → COMMERCIAL_CUSTOMER

#### 2.2.2 Vendors Classification (REV1 Expanded)

| Business Concept | Classified Under | Lookup Category | Lookup Value Code |
|-----------------|------------------|-----------------|-------------------|
| **Transporters (Service Vendors)** | Vendors | `VENDOR_TYPES` | `TRANSPORTER` ✅ REV1 |
| **Transport Service Providers** | Vendors | `VENDOR_TYPES` | `TRANSPORT_SERVICE_PROVIDER` ✅ REV1 |
| **Logistics Service Providers** | Vendors | `VENDOR_TYPES` | `LOGISTICS_SERVICE_PROVIDER` ✅ REV1 |
| **Private Waste Disposal Facilities** | Vendors | `VENDOR_TYPES` | `PRIVATE_WASTE_DISPOSAL_FACILITY` ✅ REV1 |
| **Waste Disposal Service Providers** | Vendors | `VENDOR_TYPES` | `WASTE_DISPOSAL_SERVICE_PROVIDER` ✅ REV1 |
| **Material Suppliers** | Vendors | `VENDOR_TYPES` | `MATERIAL_SUPPLIER` |
| **Equipment Suppliers** | Vendors | `VENDOR_TYPES` | `EQUIPMENT_SUPPLIER` |
| **Service Providers** | Vendors | `VENDOR_TYPES` | `SERVICE_PROVIDER` |
| **Insurance Companies** | Vendors | `VENDOR_TYPES` | `INSURANCE_COMPANY` |
| **Property Lessors** | Vendors | `VENDOR_TYPES` | `PROPERTY_LESSOR` |
| **Vehicle Lessors** | Vendors | `VENDOR_TYPES` | `VEHICLE_LESSOR` |
| **Equipment Lessors** | Vendors | `VENDOR_TYPES` | `EQUIPMENT_LESSOR` |
| **Camp/Accommodation Lessors** | Vendors | `VENDOR_TYPES` | `CAMP_ACCOMMODATION_LESSOR` |
| **Utility Providers** | Vendors | `VENDOR_TYPES` | `UTILITY_PROVIDER` |
| **Suppliers (General)** | Vendors | `VENDOR_TYPES` | `SUPPLIER` (default) |

**REV1 CRITICAL CLASSIFICATION RULE — Transporters:**

```text
IF transporter provides general transport service / supplier service
   → Classify as VENDOR with vendor_type_code = 'TRANSPORTER' or 'TRANSPORT_SERVICE_PROVIDER'

IF transporter is hired as project execution / subcontracted scope
   → Classify as SUBCONTRACTOR with subcontractor_type_code = 'TRANSPORTER' or 'TRANSPORT_SUBCONTRACTOR'
```

**REV1 CRITICAL CLASSIFICATION RULE — Waste Disposal Facilities:**

```text
IF government-owned / municipality-controlled / regulatory disposal facility
   → Classify as GOVERNMENT_AUTHORITY with authority_type_code = 'WASTE_DISPOSAL_FACILITY' or 'GOVERNMENT_WASTE_DISPOSAL_AUTHORITY'

IF private disposal service company / private treatment facility / private waste management company
   → Classify as VENDOR with vendor_type_code = 'PRIVATE_WASTE_DISPOSAL_FACILITY' or 'WASTE_DISPOSAL_SERVICE_PROVIDER'
```

#### 2.2.3 Subcontractors Classification (REV1 Expanded)

| Business Concept | Classified Under | Lookup Category | Lookup Value Code |
|-----------------|------------------|-----------------|-------------------|
| **Transport Subcontractors** | Subcontractors | `SUBCONTRACTOR_TYPES` | `TRANSPORTER` or `TRANSPORT_SUBCONTRACTOR` ✅ REV1 |
| **Civil Subcontractors** | Subcontractors | `SUBCONTRACTOR_TYPES` | `CIVIL_SUBCONTRACTOR` |
| **Manpower Subcontractors** | Subcontractors | `SUBCONTRACTOR_TYPES` | `MANPOWER_SUBCONTRACTOR` |
| **Demolition Subcontractors** | Subcontractors | `SUBCONTRACTOR_TYPES` | `DEMOLITION_SUBCONTRACTOR` |
| **Equipment Subcontractors** | Subcontractors | `SUBCONTRACTOR_TYPES` | `EQUIPMENT_SUBCONTRACTOR` |
| **Specialized Subcontractors** | Subcontractors | `SUBCONTRACTOR_TYPES` | `SPECIALIZED_SUBCONTRACTOR` ✅ REV1 |
| **Partner Subcontractors** | Subcontractors | `SUBCONTRACTOR_TYPES` | `PARTNER_SUBCONTRACTOR` |

#### 2.2.4 Government Authorities Classification (REV1 Expanded)

| Business Concept | Classified Under | Lookup Category | Lookup Value Code |
|-----------------|------------------|-----------------|-------------------|
| **License Issuers** | Government Authorities | `GOVERNMENT_AUTHORITY_TYPES` | `LICENSE_ISSUER` ✅ REV1 |
| **Permit Issuers** | Government Authorities | `GOVERNMENT_AUTHORITY_TYPES` | `PERMIT_ISSUER` ✅ REV1 |
| **Utility Authorities** | Government Authorities | `GOVERNMENT_AUTHORITY_TYPES` | `UTILITY_AUTHORITY` ✅ REV1 |
| **Transport Authorities** | Government Authorities | `GOVERNMENT_AUTHORITY_TYPES` | `TRANSPORT_AUTHORITY` ✅ REV1 |
| **Government Waste Disposal** | Government Authorities | `GOVERNMENT_AUTHORITY_TYPES` | `GOVERNMENT_WASTE_DISPOSAL_AUTHORITY` ✅ REV1 |
| **Municipalities** | Government Authorities | `GOVERNMENT_AUTHORITY_TYPES` | `MUNICIPALITY` |
| **Police** | Government Authorities | `GOVERNMENT_AUTHORITY_TYPES` | `POLICE` |
| **Civil Defense** | Government Authorities | `GOVERNMENT_AUTHORITY_TYPES` | `CIVIL_DEFENSE` |
| **Environmental Authorities** | Government Authorities | `GOVERNMENT_AUTHORITY_TYPES` | `ENVIRONMENTAL_AUTHORITY` |
| **Free Zone Authorities** | Government Authorities | `GOVERNMENT_AUTHORITY_TYPES` | `FREE_ZONE_AUTHORITY` |
| **Port Authorities** | Government Authorities | `GOVERNMENT_AUTHORITY_TYPES` | `PORT_AUTHORITY` ✅ REV1 |
| **Customs Authorities** | Government Authorities | `GOVERNMENT_AUTHORITY_TYPES` | `CUSTOMS_AUTHORITY` ✅ REV1 |
| **Port/Customs Combined** | Government Authorities | `GOVERNMENT_AUTHORITY_TYPES` | `PORT_CUSTOMS_AUTHORITY` |
| **Regulators** | Government Authorities | `GOVERNMENT_AUTHORITY_TYPES` | `REGULATOR` |
| **Ministries** | Government Authorities | `GOVERNMENT_AUTHORITY_TYPES` | `MINISTRY` |

**Business Examples (REV1):**
- Dubai Municipality / Abu Dhabi Municipality → MUNICIPALITY
- Dubai Economic Department (trade license issuer) → LICENSE_ISSUER
- CICPA (security permit issuer) → PERMIT_ISSUER
- Dubai Civil Defense → CIVIL_DEFENSE
- Federal Environment Agency → ENVIRONMENTAL_AUTHORITY
- Dubai Free Zone Authority / JAFZA → FREE_ZONE_AUTHORITY
- Jebel Ali Port Authority → PORT_AUTHORITY
- Dubai Customs / Abu Dhabi Customs → CUSTOMS_AUTHORITY
- Transport Authority (Dubai RTA / Abu Dhabi DOT) → TRANSPORT_AUTHORITY
- Utilities Regulatory Authority → UTILITY_AUTHORITY
- Ministry of Energy and Infrastructure → MINISTRY
- Government-owned waste management facility → GOVERNMENT_WASTE_DISPOSAL_AUTHORITY

### 2.3 Child Records In Scope

For each of the 6 main entities, the following child record types are in scope:

| Child Record Type | Tables (6 total) | Purpose |
|------------------|------------------|---------|
| **Contacts** | `customer_contacts`, `vendor_contacts`, `subcontractor_contacts`, `consultant_contacts`, `government_authority_contacts`, `recruitment_agency_contacts` | Contact persons with designation, email, phone, communication preferences, authorization flags |
| **Addresses** | `customer_addresses`, `vendor_addresses`, `subcontractor_addresses`, `consultant_addresses`, `government_authority_addresses`, `recruitment_agency_addresses` | Multiple addresses per entity (billing, shipping, site, office) with geography hierarchy |
| **Documents** | `customer_documents`, `vendor_documents`, `subcontractor_documents`, `consultant_documents`, `government_authority_documents`, `recruitment_agency_documents` | TRN certificates, trade licenses, insurance policies, registrations with expiry tracking |
| **Bank Details** | `vendor_bank_details`, `subcontractor_bank_details`, `consultant_bank_details`, `recruitment_agency_bank_details`, *optional:* `customer_bank_details` | Bank account information for payment processing |

**Total Child Tables:** 24 (6 contacts + 6 addresses + 6 documents + 6 bank details, excluding government_authority_bank_details)

**REV1 NOTE — Recruitment Agencies:**
Recruitment agencies are maintained as a separate table (not merged into vendors) for HR/recruitment control purposes. However, they are **vendor-like** for payment and commercial terms purposes:
- ✅ Recruitment agencies HAVE bank details table
- ✅ Recruitment agencies HAVE commercial settings (currency, payment terms, tax type)
- ✅ Recruitment agencies treated like vendors for payment processing workflows
- ❌ Recruitment agencies NOT merged into vendors table (separation for HR business logic)

### 2.4 Explicitly Out of Scope

The following are **confirmed out of scope** for Phase 002F.3E:

#### 2.4.1 HR Master Data (Phase 002F.3F)
- ❌ `employees`
- ❌ `employee_contacts`
- ❌ `employee_documents`
- ❌ `employee_dependents`
- ❌ `employee_emergency_contacts`
- ❌ `departments`
- ❌ `positions`
- ❌ `job_titles`
- ❌ `employment_types`
- ❌ `salary_grades`

#### 2.4.2 CRM Operational Module (Phase 003)
- ❌ `leads`
- ❌ `opportunities`
- ❌ `sales_pipeline_stages`
- ❌ `quotations`
- ❌ `sales_orders`
- ❌ `customer_interactions`
- ❌ `customer_complaints`
- ❌ `customer_portal`

#### 2.4.3 Procurement Operational Module (Phase 008)
- ❌ `purchase_requisitions`
- ❌ `rfqs`
- ❌ `purchase_orders`
- ❌ `goods_receipts`
- ❌ `vendor_invoices`
- ❌ `payment_vouchers`

#### 2.4.4 Other Operational Modules
- ❌ Inventory items
- ❌ Fleet assets
- ❌ Workshop jobs
- ❌ HSE operational modules
- ❌ DMS operational workflow
- ❌ Scrap trading transactions
- ❌ Waste operation transactions
- ❌ Demolition projects
- ❌ Contracts and agreements
- ❌ Project management
- ❌ Accounting module

#### 2.4.5 Generic/Shared Tables (Explicitly Excluded per User Preference)
- ❌ `persons` (generic persons table)
- ❌ `parties` (generic parties table)
- ❌ `contacts` (shared contacts table across all entities)
- ❌ `addresses` (shared addresses table)
- ❌ `documents` (shared documents table)
- ❌ `partners` (separate partners table — classified as PARTNER_CUSTOMER or PARTNER_SUBCONTRACTOR instead)

### 2.5 Scope Validation

**Confirmation:** This phase is **master data only**. It establishes the foundation entities (customers, vendors, subcontractors, etc.) and their associated reference data (contacts, addresses, documents, bank details). Operational transactions, workflows, and business processes are handled by future operational modules that will **reference** this master data.

---

## 3. Source Inspection Summary

*(Section 3 remains unchanged from original plan — source inspection methodology and patterns confirmed)*

[Content identical to original plan Section 3, no changes required]

---

## 4. Final Entity Category Decision

### 4.1 Main Entity Tables (6 Total)

The following 6 main entity categories are confirmed for dedicated table creation:

| # | Entity | Table Name | Primary Business Use Cases (REV1 Enhanced) |
|---|--------|------------|-------------------------------------------|
| 1 | **Customers** | `customers` | **Government customers** (TAQA, EWEC, government entities), **semi-government customers**, **utility companies**, **water & power plants**, main contractors, EPC contractors, **industrial customers**, **commercial customers**, scrap buyers/suppliers, normal customers, partners |
| 2 | **Vendors** | `vendors` | Material suppliers, equipment suppliers, service providers, **transporters (as service vendors)**, **logistics providers**, **private waste disposal facilities**, insurance companies, lessors (property/vehicle/equipment/camp), utility providers |
| 3 | **Subcontractors** | `subcontractors` | Civil subcontractors, manpower subcontractors, **transport subcontractors (when subcontracted for project execution)**, demolition subcontractors, equipment subcontractors, **specialized subcontractors**, partners |
| 4 | **Consultants** | `consultants` | Engineering consultants, HSE consultants, legal consultants, technical consultants, environmental consultants, **audit consultants** |
| 5 | **Government Authorities** | `government_authorities` | **License issuers**, **permit issuers**, regulators, municipalities, police, civil defense, environmental authorities, free zones, **port authorities**, **customs authorities**, **utility authorities**, **transport authorities**, **government waste disposal authorities**, ministries |
| 6 | **Recruitment Agencies** | `recruitment_agencies` | Local/overseas recruitment agencies, manpower supply agencies, executive search agencies (**vendor-like for payment purposes but separate for HR control**) |

**Rationale:**
- Each entity category has distinct business processes, workflows, and data requirements
- Customers vs. Vendors have different commercial relationships (we sell to customers, we buy from vendors)
- Subcontractors require specialized fields (HSE prequalification, worker/equipment supply flags)
- Consultants have distinct engagement models (advisory, not transactional)
- Government authorities require jurisdiction and authority type tracking (compliance/regulatory focus)
- Recruitment agencies are specialized vendors for HR/manpower (separate for HR business logic, vendor-like for payment processing)

**REV1 KEY ADDITIONS:**
- Government customers, semi-government customers, utility companies, water & power plants as distinct customer types
- Transporters can be vendors (service providers) OR subcontractors (project execution parties)
- Private waste disposal facilities can be vendors
- Government waste disposal facilities are government authorities
- Specialized subcontractors category added
- License issuers, permit issuers, utility authorities, transport authorities as distinct government authority types

### 4.2 Entity Types Classified via Lookup Categories (REV1 Complete List)

**REV1 CRITICAL:** All classification detailed in Section 2.2. Summary here:

**Customers (12 types):**
GOVERNMENT_CUSTOMER, SEMI_GOVERNMENT_CUSTOMER, UTILITY_COMPANY, WATER_POWER_PLANT, INDUSTRIAL_CUSTOMER, COMMERCIAL_CUSTOMER, MAIN_CONTRACTOR, EPC_CONTRACTOR, SCRAP_BUYER, SCRAP_SUPPLIER, PARTNER_CUSTOMER, NORMAL_CUSTOMER (default)

**Vendors (15 types):**
TRANSPORTER, TRANSPORT_SERVICE_PROVIDER, LOGISTICS_SERVICE_PROVIDER, PRIVATE_WASTE_DISPOSAL_FACILITY, WASTE_DISPOSAL_SERVICE_PROVIDER, SUPPLIER (default), MATERIAL_SUPPLIER, EQUIPMENT_SUPPLIER, SERVICE_PROVIDER, INSURANCE_COMPANY, PROPERTY_LESSOR, VEHICLE_LESSOR, EQUIPMENT_LESSOR, CAMP_ACCOMMODATION_LESSOR, UTILITY_PROVIDER

**Subcontractors (7 types):**
CIVIL_SUBCONTRACTOR, MANPOWER_SUBCONTRACTOR, TRANSPORTER, TRANSPORT_SUBCONTRACTOR, DEMOLITION_SUBCONTRACTOR, EQUIPMENT_SUBCONTRACTOR, SPECIALIZED_SUBCONTRACTOR, PARTNER_SUBCONTRACTOR

**Consultants (6 types):**
ENGINEERING_CONSULTANT, HSE_CONSULTANT, LEGAL_CONSULTANT, TECHNICAL_CONSULTANT, ENVIRONMENTAL_CONSULTANT, AUDIT_CONSULTANT

**Government Authorities (15 types):**
LICENSE_ISSUER, PERMIT_ISSUER, REGULATOR, MUNICIPALITY, POLICE, CIVIL_DEFENSE, ENVIRONMENTAL_AUTHORITY, FREE_ZONE_AUTHORITY, PORT_AUTHORITY, CUSTOMS_AUTHORITY, PORT_CUSTOMS_AUTHORITY, UTILITY_AUTHORITY, TRANSPORT_AUTHORITY, WASTE_DISPOSAL_FACILITY, GOVERNMENT_WASTE_DISPOSAL_AUTHORITY, MINISTRY

**Recruitment Agencies (4 types):**
LOCAL_RECRUITMENT_AGENCY, OVERSEAS_RECRUITMENT_AGENCY, MANPOWER_SUPPLY_AGENCY, EXECUTIVE_SEARCH_AGENCY

### 4.3 Employees Explicitly Excluded

**Confirmation:** Employees are **not** part of Phase 002F.3E.

The following entity types and tables are explicitly excluded:

❌ `employees`  
❌ `employee_contacts`  
❌ `employee_documents`  
❌ `employee_dependents`  
❌ `employee_emergency_contacts`  
❌ `departments`  
❌ `positions`  
❌ `job_titles`  

**Reason:** Employees are handled in **Phase 002F.3F — HR Master Data**, which will create a separate, comprehensive HR foundation with employment contracts, salary structures, leave entitlements, etc. Mixing employees with customers/vendors/subcontractors violates the user's explicit requirement for separation.

### 4.4 Dual-Role Entity Handling (REV1 Critical Rules)

**Business Scenario:** A company may have multiple roles.

**REV1 Classification Decision Matrix:**

| Scenario | Entity Classification Rule |
|----------|---------------------------|
| **Transporter provides general transport services** | VENDOR with `vendor_type_code = 'TRANSPORTER'` |
| **Transporter subcontracted for project execution** | SUBCONTRACTOR with `subcontractor_type_code = 'TRANSPORTER' or 'TRANSPORT_SUBCONTRACTOR'` |
| **Private waste disposal service company** | VENDOR with `vendor_type_code = 'PRIVATE_WASTE_DISPOSAL_FACILITY'` |
| **Government-owned waste disposal facility** | GOVERNMENT_AUTHORITY with `authority_type_code = 'WASTE_DISPOSAL_FACILITY'` |
| **Company is both customer (scrap buyer) AND vendor (equipment supplier)** | 2 separate records: 1 in `customers`, 1 in `vendors` |

**Recommended Strategy:** **Approach A (Separate Records)** for Phase 002F.3E.

- If "ABC Transport LLC" is both a vendor (transport services) and a subcontractor (project execution), create:
  - 1 record in `vendors` table (for transport service purchases)
  - 1 record in `subcontractors` table (for subcontracted project work)
- Each record has independent contacts, addresses, bank details, commercial terms
- This aligns with the user's stated preference for clear separation by business category
- Future: If cross-entity linkage is needed, a `party_relationships` table can be added in a later phase

---

## 5. Dedicated Table Decision Matrix

*(Section 5 content remains structurally the same, with updated counts reflecting REV1 lookup value increases)*

### 5.1 Entity Table Summary

| Entity | Dedicated Table | Child Tables | Total Tables | Rationale (REV1 Enhanced) |
|--------|----------------|--------------|--------------|---------------------------|
| **Customers** | `customers` | `customer_contacts`, `customer_addresses`, `customer_documents`, optional `customer_bank_details` | 4-5 | Primary revenue source, CRM foundation, supports government/utility/industrial customers, sales owner tracking, credit management |
| **Vendors** | `vendors` | `vendor_contacts`, `vendor_addresses`, `vendor_documents`, `vendor_bank_details` | 4 | Payment processing requires bank details, supports transporters/logistics/waste disposal vendors, procurement integration, supplier management |
| **Subcontractors** | `subcontractors` | `subcontractor_contacts`, `subcontractor_addresses`, `subcontractor_documents`, `subcontractor_bank_details` | 4 | HSE prequalification, supports transport subcontractors, worker/equipment supply tracking, payment processing |
| **Consultants** | `consultants` | `consultant_contacts`, `consultant_addresses`, `consultant_documents`, `consultant_bank_details` | 4 | Professional services, engagement tracking, supports audit consultants, payment processing |
| **Government Authorities** | `government_authorities` | `government_authority_contacts`, `government_authority_addresses`, `government_authority_documents` | 3 | Compliance/regulatory focus, supports license/permit issuers, utility/transport authorities, no bank details (fees paid via government portals), jurisdiction tracking |
| **Recruitment Agencies** | `recruitment_agencies` | `recruitment_agency_contacts`, `recruitment_agency_addresses`, `recruitment_agency_documents`, `recruitment_agency_bank_details` | 4 | HR integration, manpower supply, payment processing, countries served tracking, **vendor-like for commercial purposes** ✅ REV1 |
| **Total** | **6 main tables** | **23-24 child tables** | **29-30 tables** | Comprehensive party master data foundation |

### 5.2 Customer Bank Details Decision

**Question:** Should `customer_bank_details` table be created?

**Recommendation:** ✅ **Create `customer_bank_details` table (optional)**

**Rationale:**
- Future-proofing: Customer refunds and rebates are common business scenarios
- Scrap trading: Alliance Gulf Transport's scrap business includes buying scrap from some customers (scrap suppliers)
- Low cost: Adding the table now avoids schema migration later
- Optional usage: If a customer never requires refunds/rebates, the table remains empty for that customer
- Consistency: All payment-related entities have bank details tables

**Decision:** ✅ Include `customer_bank_details` in Phase 002F.3E.

### 5.3 Government Authority Bank Details Decision

**Question:** Should `government_authority_bank_details` table be created?

**Recommendation:** ❌ **Do NOT create `government_authority_bank_details` table**

**Rationale:**
- Government fees, permits, licenses are typically paid via government portals (online payment, bank transfer to government account)
- We do NOT pay government authorities via their bank accounts for vendor-like services
- Government authorities do NOT require payment processing workflows like vendors/subcontractors
- If a government entity provides services for payment (rare), they should be classified as a semi-government customer or vendor instead

**Decision:** ❌ Exclude `government_authority_bank_details` from Phase 002F.3E.

### 5.4 Final Table Count

**Main Entity Tables:** 6  
**Contact Tables:** 6  
**Address Tables:** 6  
**Document Tables:** 6  
**Bank Details Tables:** 5 (customers, vendors, subcontractors, consultants, recruitment agencies — excluding government authorities)  

**Total New Tables:** **29 tables** (reduced from 30 due to excluding one bank details table)

**Plus:**
- **22+ new lookup categories** in `global_lookup_categories`
- **130+ new lookup values** in `global_lookup_values` (increased from ~120 due to REV1 expansions)

**Total Database Objects:** 29 tables + 22+ lookup categories + 130+ lookup values + ~174 RLS policies + 60+ indexes + 29 triggers

---

## 6. Lookup Category Plan

*(This section is significantly expanded in REV1 to include all new customer types, vendor types, and government authority types)*

### 6.1 Overview

Phase 002F.3E requires **22 new lookup categories** with **approximately 130 new lookup values** (increased from ~120 in original plan) to support party classification, status management, and operational workflows.

**Design Principle:** No hardcoded dropdowns. All classification and status fields must use lookup categories that are:
- Editable by authorized users via the Global Lookup Engine UI
- System-locked for critical values (e.g., ACTIVE status)
- Badge-styled for visual differentiation
- Hierarchical where parent-child relationships add value

### 6.2 New Lookup Categories Required

[Table showing 22 categories with updated value counts - structure remains same as original, but CUSTOMER_TYPES now shows "12" values, VENDOR_TYPES shows "15" values, GOVERNMENT_AUTHORITY_TYPES shows "15" values, etc.]

### 6.3 Detailed Lookup Category Specifications (REV1 Corrected)

#### 6.3.1 PARTY_STATUS_TYPES

*(Content identical to original plan - no changes)*

#### 6.3.2 CUSTOMER_TYPES (REV1 EXPANDED)

```sql
-- Category
category_code: 'CUSTOMER_TYPES'
category_name_en: 'Customer Types'
description: 'Customer classification types for Alliance Gulf Transport business units (REV1 expanded for government/utility/industrial customers)'
module_code: 'PARTIES'
is_system: true
is_locked: false
sort_order: 20

-- Values (REV1: 12 values, expanded from 6)
NORMAL_CUSTOMER       → Normal Customer         → Blue badge     → is_default: true
GOVERNMENT_CUSTOMER   → Government Customer     → Purple badge   → ✅ REV1 NEW
SEMI_GOVERNMENT_CUSTOMER → Semi-Government Customer → Purple badge → ✅ REV1 NEW
UTILITY_COMPANY       → Utility Company         → Orange badge   → ✅ REV1 NEW
WATER_POWER_PLANT     → Water & Power Plant     → Cyan badge     → ✅ REV1 NEW
INDUSTRIAL_CUSTOMER   → Industrial Customer     → Brown badge    → ✅ REV1 NEW
COMMERCIAL_CUSTOMER   → Commercial Customer     → Pink badge     → ✅ REV1 NEW
MAIN_CONTRACTOR       → Main Contractor         → Purple badge
EPC_CONTRACTOR        → EPC Contractor          → Purple badge
SCRAP_BUYER           → Scrap Buyer             → Green badge
SCRAP_SUPPLIER        → Scrap Supplier          → Orange badge
PARTNER_CUSTOMER      → Partner Customer        → Gold badge
```

**Usage:** `customers.customer_type_code`

**REV1 Rationale:**
- **GOVERNMENT_CUSTOMER**: Federal/Emirate-level government entities purchasing services or materials
- **SEMI_GOVERNMENT_CUSTOMER**: Semi-government companies (e.g., Dubai Holding entities, Emirates NBD, etc.)
- **UTILITY_COMPANY**: TAQA, EWEC, DEWA, SEWA, AADC, ADDC (utility companies as customers/project owners)
- **WATER_POWER_PLANT**: Water desalination plants, power generation facilities (as project owners/customers)
- **INDUSTRIAL_CUSTOMER**: Manufacturing facilities, factories, industrial complexes
- **COMMERCIAL_CUSTOMER**: Retail, hospitality, commercial real estate entities
- **MAIN_CONTRACTOR/EPC_CONTRACTOR**: Large projects, complex commercial terms, retention management
- **SCRAP_BUYER/SCRAP_SUPPLIER**: Scrap trading business unit (buying and selling scrap)
- **PARTNER_CUSTOMER**: Strategic partners, joint ventures
- **NORMAL_CUSTOMER**: Standard B2B customers (default)

**Business Examples (REV1):**
- TAQA (Abu Dhabi National Energy Company) → UTILITY_COMPANY
- EWEC (Emirates Water and Electricity Company) → UTILITY_COMPANY
- Dubai Electricity and Water Authority (DEWA) → UTILITY_COMPANY or GOVERNMENT_CUSTOMER
- Jebel Ali Power Station → WATER_POWER_PLANT
- Taweelah Desalination Plant → WATER_POWER_PLANT
- Dubai Municipality (purchasing waste management services) → GOVERNMENT_CUSTOMER
- Dubai Holding subsidiary companies → SEMI_GOVERNMENT_CUSTOMER
- Emirates Steel factory → INDUSTRIAL_CUSTOMER
- Dubai Mall (as a customer) → COMMERCIAL_CUSTOMER

#### 6.3.3 CUSTOMER_SEGMENTS

*(Content identical to original plan - no changes, remains separate from CUSTOMER_TYPES)*

#### 6.3.4 VENDOR_TYPES (REV1 EXPANDED)

```sql
-- Category
category_code: 'VENDOR_TYPES'
category_name_en: 'Vendor Types'
description: 'Vendor classification types for procurement and supplier management (REV1 expanded for transporters/logistics/waste disposal)'
module_code: 'PARTIES'
is_system: true
is_locked: false
sort_order: 40

-- Values (REV1: 15 values, expanded from 10)
SUPPLIER              → Supplier                → Blue badge     → is_default: true
MATERIAL_SUPPLIER     → Material Supplier       → Green badge
EQUIPMENT_SUPPLIER    → Equipment Supplier      → Orange badge
SERVICE_PROVIDER      → Service Provider        → Purple badge
TRANSPORTER           → Transporter             → Cyan badge     → ✅ REV1 NEW
TRANSPORT_SERVICE_PROVIDER → Transport Service Provider → Cyan badge → ✅ REV1 NEW
LOGISTICS_SERVICE_PROVIDER → Logistics Service Provider → Cyan badge → ✅ REV1 NEW
PRIVATE_WASTE_DISPOSAL_FACILITY → Private Waste Disposal Facility → Green badge → ✅ REV1 NEW
WASTE_DISPOSAL_SERVICE_PROVIDER → Waste Disposal Service Provider → Green badge → ✅ REV1 NEW
INSURANCE_COMPANY     → Insurance Company       → Yellow badge
PROPERTY_LESSOR       → Property Lessor         → Brown badge
VEHICLE_LESSOR        → Vehicle Lessor          → Brown badge
EQUIPMENT_LESSOR      → Equipment Lessor        → Brown badge
CAMP_ACCOMMODATION_LESSOR → Camp/Accommodation Lessor → Brown badge
UTILITY_PROVIDER      → Utility Provider        → Gray badge
```

**Usage:** `vendors.vendor_type_code`

**REV1 Rationale:**
- **TRANSPORTER**: General transport services vendor (trucking, logistics)
- **TRANSPORT_SERVICE_PROVIDER**: Specialized transport services (equipment transport, hazardous material transport)
- **LOGISTICS_SERVICE_PROVIDER**: 3PL (third-party logistics), warehousing, supply chain services
- **PRIVATE_WASTE_DISPOSAL_FACILITY**: Private waste treatment/disposal companies
- **WASTE_DISPOSAL_SERVICE_PROVIDER**: Waste management service vendors
- **MATERIAL_SUPPLIER/EQUIPMENT_SUPPLIER**: Traditional supplier categories
- **SERVICE_PROVIDER**: General services (maintenance, cleaning, security, IT)
- **INSURANCE_COMPANY**: Insurance policy vendors
- **PROPERTY_LESSOR/VEHICLE_LESSOR/EQUIPMENT_LESSOR/CAMP_ACCOMMODATION_LESSOR**: Lease providers
- **UTILITY_PROVIDER**: Utility bills (water, electricity if purchased from non-main utility)

**REV1 CRITICAL CLASSIFICATION RULE:**
```text
IF transporter provides general transport service / supplier service
   → Classify as VENDOR with vendor_type_code = 'TRANSPORTER' or 'TRANSPORT_SERVICE_PROVIDER'

IF transporter is hired as project execution / subcontracted scope
   → Classify as SUBCONTRACTOR with subcontractor_type_code = 'TRANSPORTER' or 'TRANSPORT_SUBCONTRACTOR'
```

**Business Examples (REV1):**
- Transport company providing regular trucking services → TRANSPORTER vendor
- 3PL logistics provider managing supply chain → LOGISTICS_SERVICE_PROVIDER vendor
- Private waste treatment company → PRIVATE_WASTE_DISPOSAL_FACILITY vendor
- Waste management service company collecting waste → WASTE_DISPOSAL_SERVICE_PROVIDER vendor
- Transport company subcontracted for project-specific demolition material hauling → TRANSPORT_SUBCONTRACTOR subcontractor (NOT vendor)

#### 6.3.5 VENDOR_CATEGORIES

*(Content identical to original plan - no changes)*

#### 6.3.6 SUPPLIER_CATEGORIES

*(Content identical to original plan - no changes)*

#### 6.3.7 SUBCONTRACTOR_TYPES (REV1 EXPANDED)

```sql
-- Category
category_code: 'SUBCONTRACTOR_TYPES'
category_name_en: 'Subcontractor Types'
description: 'Subcontractor classification types for subcontracting management (REV1 expanded for transport subcontractors)'
module_code: 'PARTIES'
is_system: true
is_locked: false
sort_order: 70

-- Values (REV1: 8 values, expanded from 6)
CIVIL_SUBCONTRACTOR   → Civil Subcontractor     → Blue badge     → is_default: true
MANPOWER_SUBCONTRACTOR → Manpower Subcontractor → Green badge
TRANSPORTER           → Transporter             → Orange badge   → ✅ REV1 CLARIFIED
TRANSPORT_SUBCONTRACTOR → Transport Subcontractor → Orange badge → ✅ REV1 NEW
DEMOLITION_SUBCONTRACTOR → Demolition Subcontractor → Red badge
EQUIPMENT_SUBCONTRACTOR → Equipment Subcontractor → Purple badge
SPECIALIZED_SUBCONTRACTOR → Specialized Subcontractor → Cyan badge → ✅ REV1 NEW
PARTNER_SUBCONTRACTOR → Partner Subcontractor   → Gold badge
```

**Usage:** `subcontractors.subcontractor_type_code`

**REV1 Rationale:**
- **TRANSPORTER / TRANSPORT_SUBCONTRACTOR**: Transport services subcontracted for project execution (hauling demolition waste, transporting materials to/from site)
- **CIVIL_SUBCONTRACTOR**: Construction and civil works
- **MANPOWER_SUBCONTRACTOR**: Labor supply
- **DEMOLITION_SUBCONTRACTOR**: Demolition projects
- **EQUIPMENT_SUBCONTRACTOR**: Equipment rental with operator
- **SPECIALIZED_SUBCONTRACTOR**: Specialized scopes (painting, electrical, HVAC, etc.)
- **PARTNER_SUBCONTRACTOR**: Joint venture or strategic partners

**REV1 CRITICAL CLASSIFICATION RULE:**
```text
IF transporter provides general transport service / supplier service
   → VENDOR (not subcontractor)

IF transporter is hired as project execution / subcontracted scope
   → SUBCONTRACTOR with subcontractor_type_code = 'TRANSPORTER' or 'TRANSPORT_SUBCONTRACTOR'
```

#### 6.3.8 SUBCONTRACTOR_CATEGORIES

*(Content identical to original plan - no changes)*

#### 6.3.9 CONSULTANT_TYPES (REV1 EXPANDED)

```sql
-- Category
category_code: 'CONSULTANT_TYPES'
category_name_en: 'Consultant Types'
description: 'Consultant classification types for professional services (REV1 expanded for audit consultants)'
module_code: 'PARTIES'
is_system: true
is_locked: false
sort_order: 90

-- Values (REV1: 6 values, expanded from 5)
ENGINEERING_CONSULTANT → Engineering Consultant  → Blue badge     → is_default: true
HSE_CONSULTANT        → HSE Consultant          → Red badge
LEGAL_CONSULTANT      → Legal Consultant        → Purple badge
TECHNICAL_CONSULTANT  → Technical Consultant    → Green badge
ENVIRONMENTAL_CONSULTANT → Environmental Consultant → Green badge
AUDIT_CONSULTANT      → Audit Consultant        → Orange badge   → ✅ REV1 NEW
```

**Usage:** `consultants.consultant_type_code`

**REV1 Rationale:**
- **AUDIT_CONSULTANT**: Financial auditors, operational auditors, compliance auditors

#### 6.3.10 CONSULTANT_CATEGORIES

*(Content identical to original plan - no changes)*

#### 6.3.11 GOVERNMENT_AUTHORITY_TYPES (REV1 SIGNIFICANTLY EXPANDED)

```sql
-- Category
category_code: 'GOVERNMENT_AUTHORITY_TYPES'
category_name_en: 'Government Authority Types'
description: 'Government authority classification for compliance and regulatory management (REV1 expanded for license/permit issuers, utility/transport authorities)'
module_code: 'PARTIES'
is_system: true
is_locked: false
sort_order: 110

-- Values (REV1: 15 values, expanded from 9)
LICENSE_ISSUER        → License Issuer          → Blue badge     → ✅ REV1 NEW
PERMIT_ISSUER         → Permit Issuer           → Blue badge     → ✅ REV1 NEW
REGULATOR             → Regulator               → Gray badge     → is_default: true
MUNICIPALITY          → Municipality            → Blue badge
POLICE                → Police                  → Red badge
CIVIL_DEFENSE         → Civil Defense           → Red badge
ENVIRONMENTAL_AUTHORITY → Environmental Authority → Green badge
FREE_ZONE_AUTHORITY   → Free Zone Authority     → Purple badge
PORT_AUTHORITY        → Port Authority          → Cyan badge     → ✅ REV1 NEW
CUSTOMS_AUTHORITY     → Customs Authority       → Cyan badge     → ✅ REV1 NEW
PORT_CUSTOMS_AUTHORITY → Port & Customs Authority → Cyan badge   
UTILITY_AUTHORITY     → Utility Authority       → Orange badge   → ✅ REV1 NEW
TRANSPORT_AUTHORITY   → Transport Authority     → Orange badge   → ✅ REV1 NEW
WASTE_DISPOSAL_FACILITY → Waste Disposal Facility → Green badge  
GOVERNMENT_WASTE_DISPOSAL_AUTHORITY → Govt Waste Disposal Authority → Green badge → ✅ REV1 NEW
MINISTRY              → Ministry                → Purple badge
```

**Usage:** `government_authorities.authority_type_code`

**REV1 Rationale:**
- **LICENSE_ISSUER**: Trade license issuers, business registration authorities (e.g., Dubai Economic Department)
- **PERMIT_ISSUER**: Permit issuers (CICPA for security permits, environmental permits, transport permits, construction permits)
- **UTILITY_AUTHORITY**: Utility regulatory authorities, utility providers when acting as government authorities
- **TRANSPORT_AUTHORITY**: Transport authorities (Dubai RTA, Abu Dhabi DOT, transport permit issuers)
- **PORT_AUTHORITY**: Port authorities (Dubai Ports Authority, ADPC)
- **CUSTOMS_AUTHORITY**: Customs authorities (Dubai Customs, Abu Dhabi Customs)
- **PORT_CUSTOMS_AUTHORITY**: Combined port and customs authorities
- **GOVERNMENT_WASTE_DISPOSAL_AUTHORITY**: Government-owned/regulated waste disposal facilities
- **MUNICIPALITY**: Municipalities (Dubai Municipality, Abu Dhabi Municipality)
- **POLICE**: Police departments
- **CIVIL_DEFENSE**: Civil defense departments
- **ENVIRONMENTAL_AUTHORITY**: Environmental protection agencies (Federal Environment Agency, EAD)
- **FREE_ZONE_AUTHORITY**: Free zone authorities (JAFZA, DMCC, etc.)
- **REGULATOR**: General regulatory bodies
- **MINISTRY**: Federal/Emirate-level ministries

**Business Examples (REV1):**
- Dubai Economic Department (DED) → LICENSE_ISSUER
- CICPA (Critical Infrastructure and Coastal Protection Authority) → PERMIT_ISSUER
- Environmental permit issuing authority → PERMIT_ISSUER
- Dubai RTA (Roads and Transport Authority) → TRANSPORT_AUTHORITY
- Abu Dhabi DOT (Department of Transport) → TRANSPORT_AUTHORITY
- Dubai Ports Authority → PORT_AUTHORITY
- Dubai Customs → CUSTOMS_AUTHORITY
- Abu Dhabi Waste Management Center → GOVERNMENT_WASTE_DISPOSAL_AUTHORITY
- Dubai Municipality → MUNICIPALITY
- Abu Dhabi Municipality → MUNICIPALITY
- Dubai Police → POLICE
- Dubai Civil Defense → CIVIL_DEFENSE
- Federal Environment Agency → ENVIRONMENTAL_AUTHORITY
- JAFZA (Jebel Ali Free Zone Authority) → FREE_ZONE_AUTHORITY
- Utilities Regulatory Authority → REGULATOR or UTILITY_AUTHORITY
- Ministry of Energy and Infrastructure → MINISTRY

**REV1 CRITICAL CLASSIFICATION RULE — Waste Disposal:**
```text
IF government-owned / municipality-controlled / regulatory disposal facility
   → Classify as GOVERNMENT_AUTHORITY with authority_type_code = 'WASTE_DISPOSAL_FACILITY' or 'GOVERNMENT_WASTE_DISPOSAL_AUTHORITY'

IF private disposal service company / private treatment facility / private waste management company
   → Classify as VENDOR with vendor_type_code = 'PRIVATE_WASTE_DISPOSAL_FACILITY' or 'WASTE_DISPOSAL_SERVICE_PROVIDER'
```

#### 6.3.12 GOVERNMENT_AUTHORITY_CATEGORIES

*(Content identical to original plan - no changes)*

#### 6.3.13 JURISDICTION_LEVEL_TYPES

*(Content identical to original plan - no changes)*

#### 6.3.14 RECRUITMENT_AGENCY_TYPES

*(Content identical to original plan - no changes)*

**REV1 NOTE:** Recruitment agencies remain in a separate table (not merged into vendors) for HR/recruitment business logic control. However, they are **vendor-like for payment and commercial purposes**:
- Recruitment agencies HAVE bank details (for payment processing)
- Recruitment agencies HAVE commercial settings (currency, payment terms, tax type)
- Recruitment agencies treated like vendors for payment workflows
- Recruitment agencies NOT merged into vendors table (maintained as separate entity for HR module integration and recruitment-specific workflows)

#### 6.3.15 RECRUITMENT_AGENCY_CATEGORIES

*(Content identical to original plan - no changes)*

#### 6.3.16 INDUSTRY_TYPES

*(Content identical to original plan - no changes)*

#### 6.3.17 CRM_LEAD_SOURCES

*(Content identical to original plan - no changes)*

#### 6.3.18 CONTACT_TYPES

*(Content identical to original plan - no changes)*

#### 6.3.19 COMMUNICATION_PREFERENCE_TYPES

*(Content identical to original plan - no changes)*

#### 6.3.20 ADDRESS_TYPES

*(Content identical to original plan - no changes)*

#### 6.3.21 PARTY_DOCUMENT_TYPES

*(Content identical to original plan - no changes)*

#### 6.3.22 BANK_ACCOUNT_TYPES

*(Content identical to original plan - no changes)*

### 6.4 Lookup Category Seed SQL Summary

**Total Categories:** 22  
**Total Values:** ~130 (increased from ~120 due to REV1 expansions)  
**Module Code:** `PARTIES` for all categories  
**System Locked:** 8 categories (PARTY_STATUS_TYPES, CUSTOMER_TYPES, VENDOR_TYPES, SUBCONTRACTOR_TYPES, CONSULTANT_TYPES, GOVERNMENT_AUTHORITY_TYPES, JURISDICTION_LEVEL_TYPES, RECRUITMENT_AGENCY_TYPES)  
**User-Editable:** 14 categories (segmentation, categorization, operational)  

**REV1 Changes:**
- CUSTOMER_TYPES: 6 → 12 values (+6)
- VENDOR_TYPES: 10 → 15 values (+5)
- SUBCONTRACTOR_TYPES: 6 → 8 values (+2)
- CONSULTANT_TYPES: 5 → 6 values (+1)
- GOVERNMENT_AUTHORITY_TYPES: 9 → 15 values (+6)
- **Total increase: ~20 additional lookup values**

**Implementation Strategy:**
1. Create lookup categories via INSERT INTO `global_lookup_categories`
2. Create lookup values via INSERT INTO `global_lookup_values`
3. System-lock critical categories to prevent deletion
4. Set default values where appropriate (e.g., ACTIVE status, NORMAL_CUSTOMER type, SUPPLIER vendor type, REGULATOR government authority type)
5. Assign badge variants for visual differentiation in UI

---

## 7. Database Schema Plan

*(Section 7 remains structurally the same as original plan, with database table specifications. The main entity tables customers, vendors, subcontractors, consultants, government_authorities, recruitment_agencies have the same field structure. The only change is the count: 29 tables instead of 30 due to excluding government_authority_bank_details)*

### 7.1 Schema Overview

Phase 002F.3E will create **29 new tables** (revised from 30):
- 6 main entity tables (customers, vendors, subcontractors, consultants, government_authorities, recruitment_agencies)
- 6 contact tables
- 6 address tables
- 6 document tables
- 5 bank details tables (**REV1: excluding government_authority_bank_details**)

All tables follow the established ERP BASE patterns (BIGINT PKs/FKs, user_profiles audit fields, soft delete, system/locked protection, RLS enabled).

### 7.2 Standard Field Template

*(Content identical to original plan - standard fields template unchanged)*

### 7.3 Main Entity Tables

*(Content identical to original plan - field specifications for customers, vendors, subcontractors, consultants, government_authorities, recruitment_agencies unchanged. These tables already support the expanded lookup values via the `*_type_code` fields which reference lookup categories)*

**REV1 NOTE:** The main entity table schemas remain unchanged structurally. The expanded customer types, vendor types, and government authority types are stored in `global_lookup_values`, not as separate fields. The existing fields like `customer_type_code`, `vendor_type_code`, `authority_type_code` already support any lookup value code.

### 7.4 Contact Tables (6 Total)

*(Content identical to original plan - contact table structure unchanged)*

### 7.5 Address Tables (6 Total)

*(Content identical to original plan - address table structure unchanged)*

### 7.6 Document Tables (6 Total)

*(Content identical to original plan - document table structure unchanged)*

### 7.7 Bank Details Tables (5 Total) — REV1 CORRECTED

**REV1 CHANGE:** **5 bank details tables** (not 6):

**Tables:**
- `customer_bank_details` (optional, for refunds/rebates/scrap purchases)
- `vendor_bank_details`
- `subcontractor_bank_details`
- `consultant_bank_details`
- `recruitment_agency_bank_details`

**❌ EXCLUDED: `government_authority_bank_details`** (government fees paid via portals, not bank transfers)

**REV1 NOTE — Recruitment Agencies:**
Recruitment agencies HAVE a bank details table (`recruitment_agency_bank_details`) because they are **vendor-like for payment purposes** even though they are maintained in a separate main table for HR/recruitment control.

**Standard Bank Details Table Structure:**

*(Content identical to original plan - bank details table structure unchanged, just noting that government_authority_bank_details is excluded)*

**Repeat for:** customer_bank_details, vendor_bank_details, subcontractor_bank_details, consultant_bank_details, recruitment_agency_bank_details.

### 7.8 Schema Summary

**Total Tables:** 29 (revised from 30)
- 6 main entity tables
- 6 contact tables
- 6 address tables
- 6 document tables
- 5 bank details tables (excluding government_authority_bank_details)

**Total Indexes:** ~174 (6 per table average, reduced from ~180)

**Total Triggers:** 29 (`set_updated_at` on all tables, reduced from 30)

**Total RLS Policies:** ~174 (6 per table: SELECT, INSERT, UPDATE, DELETE for users and service role, reduced from ~180)

**Total Constraints:** ~60 (email format, TRN format, IBAN format, SWIFT format, positive amounts, date ranges, lat/long ranges)

**Foreign Keys to Existing Tables:**
- `user_profiles.id` (created_by, updated_by, deactivated_by, verified_by, sales_owner_user_profile_id)
- `countries.id`, `emirates.id`, `cities.id`, `areas_zones.id` (geography)
- `currencies.id`, `payment_terms.id`, `tax_types.id`, `banks.id` (finance basics)
- `global_lookup_values.value_code` (all classification and status fields)

---

## 8. Contact / Address / Document Strategy

*(Content identical to original plan - strategy unchanged)*

---

## 9. Bank Details Strategy

### 9.1 Business Requirements (REV1 Corrected)

**Entities Requiring Bank Details:**
- ✅ Vendors (for payment processing)
- ✅ Subcontractors (for payment processing)
- ✅ Consultants (for payment processing)
- ✅ Recruitment Agencies (for payment processing — **vendor-like for commercial purposes**) ✅ REV1
- ✅ Customers (for refunds, rebates, scrap purchases)
- ❌ Government Authorities (fees paid via government portals, not bank transfers) ✅ REV1

**REV1 CLARIFICATION — Recruitment Agencies:**
Recruitment agencies are maintained as a separate entity table (not merged into vendors) for HR/recruitment business logic control. However, they are **vendor-like for payment and commercial terms purposes**:
- Recruitment agencies HAVE `recruitment_agency_bank_details` table
- Recruitment agencies HAVE commercial settings fields (currency_id, payment_term_id, tax_type_id)
- Recruitment agencies are paid via bank transfers like vendors/subcontractors/consultants
- Payment processing workflows treat recruitment agencies similar to vendors

### 9.2 Implementation

**Tables:** 5 bank details tables (revised from 6):
- `customer_bank_details` (optional)
- `vendor_bank_details`
- `subcontractor_bank_details`
- `consultant_bank_details`
- `recruitment_agency_bank_details` ✅ REV1

**❌ EXCLUDED: `government_authority_bank_details`**

*(Remaining content identical to original plan - field specifications, validation, UI considerations unchanged)*

### 9.3 Customer Bank Details Decision

*(Content identical to original plan - decision unchanged)*

### 9.4 Government Authority Bank Details Decision (REV1 Clarified)

**Recommendation:** ❌ **Do NOT create `government_authority_bank_details` table**

**Rationale:**
- Government fees (permits, licenses, inspections) are paid via government payment portals or designated government bank accounts
- Alliance Gulf Transport does NOT pay government authorities via their individual bank accounts for vendor-like services
- Government authorities do NOT require payment processing workflows like vendors/subcontractors/consultants
- If a government entity provides services requiring payment processing (very rare), they should be classified as a semi-government customer or semi-government vendor instead, not a government authority

**Decision:** ❌ Exclude `government_authority_bank_details` from Phase 002F.3E.

---

## 10. CRM Foundation Strategy

*(Content identical to original plan - CRM strategy unchanged)*

---

## 11. Master Data Reuse and Dropdown Mapping Matrix

*(Content identical to original plan - dropdown mapping matrix remains structurally the same. All new customer types, vendor types, and government authority types are lookup values, so the mapping matrix already correctly states they use `LookupSelect` component with the appropriate category)*

---

## 12. RLS / Permission / Role Assignment Plan

### 12.1 Permission Strategy (REV1 REVISED)

**REV1 CRITICAL DECISION:** Simplified permissions approach.

**Original Plan Proposed:** Granular permissions (48 permissions total — 8 per entity × 6 entities)

**REV1 Recommendation:** **Grouped "party_master" permissions** for manageable implementation.

**Rationale for Change:**
- Sameer prefers manageable implementation and avoiding unnecessary complexity
- 48 permissions create significant overhead for permission management, role assignments, and RLS policy complexity
- In practice, users who can manage customers can typically manage vendors/subcontractors too (master data admin role)
- Granular permissions can be added in a future phase if organizational complexity requires it

### 12.2 Permission List (REV1 Simplified Approach)

#### 12.2.1 Grouped Party Master Permissions (RECOMMENDED)

```sql
'master_data.party_master.view'                 → View all party entities (customers, vendors, subcontractors, consultants, government authorities, recruitment agencies)
'master_data.party_master.manage'               → Create, edit, deactivate all party entities
'master_data.party_master.export'               → Export all party data
'master_data.party_master.audit_view'           → View all party audit logs
```

**Total Permissions: 4 permissions**

**Usage:**
- All 6 main entity tables share the same 4 permissions
- All 24 child tables share the same 4 permissions
- Simplifies role assignment and RLS policies
- Easier to understand for users and administrators

**RLS Policy Example (Customers Table):**

```sql
-- SELECT: View active records OR party_master.view permission
create policy "Allow SELECT on customers for users with permission"
  on customers for select
  using (
    is_active = true 
    OR current_user_has_permission('master_data.party_master.view')
    OR current_user_has_role('system_admin')
  );

-- INSERT: party_master.manage permission
create policy "Allow INSERT on customers for users with permission"
  on customers for insert
  with check (
    current_user_has_permission('master_data.party_master.manage')
    OR current_user_has_role('system_admin')
  );

-- UPDATE: party_master.manage permission + respect locked/system
create policy "Allow UPDATE on customers for users with permission"
  on customers for update
  using (
    (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'))
    AND (is_locked = false OR current_user_has_role('system_admin'))
    AND (is_system = false OR current_user_has_role('system_admin'))
  );
```

*(Repeat for all 6 main entity tables and all 24 child tables with same permission codes)*

#### 12.2.2 Alternative: Granular Permissions (Future Enhancement)

If organizational complexity later requires granular permissions, they can be added in a future phase:

```sql
'master_data.customers.view/manage/export/audit_view'
'master_data.vendors.view/manage/export/audit_view'
'master_data.subcontractors.view/manage/export/audit_view'
'master_data.consultants.view/manage/export/audit_view'
'master_data.government_authorities.view/manage/export/audit_view'
'master_data.recruitment_agencies.view/manage/export/audit_view'
```

**Total Permissions: 24 permissions (6 entities × 4 permissions per entity)**

**Add child table permissions:**

```sql
'master_data.party_contacts.manage'             → Manage all party contacts
'master_data.party_addresses.manage'            → Manage all party addresses
'master_data.party_documents.manage'            → Manage all party documents
'master_data.party_bank_details.manage'         → Manage all party bank details
```

**Total with child permissions: 28 permissions**

**REV1 Recommendation:** Start with **grouped permissions (4 total)**, enhance to granular later if needed.

### 12.3 Role Assignment Recommendation (REV1 Simplified)

| Role | Permissions Granted | Rationale |
|------|---------------------|-----------|
| `system_admin` | All permissions | Full system access for administrators |
| `group_admin` | `party_master.view`, `party_master.manage`, `party_master.export`, `party_master.audit_view` | Group-level administrators manage all party master data |
| `company_admin` | `party_master.view`, `party_master.export` | Company-level administrators can view and export, but manage requires group_admin approval |
| `branch_admin` | `party_master.view` | Branch-level administrators have read-only access |

**Note:** Custom roles (Sales Manager, Procurement Manager, HR Manager) can be created later with same permissions, or can be managed via departmental access if granular permissions are implemented.

### 12.4 RLS Policy Plan

#### 12.4.1 Standard RLS Pattern (Applied to All 29 Tables)

*(Content identical to original plan - RLS policy patterns unchanged, just using simplified permission codes)*

**SELECT Policy:**

```sql
create policy "Allow SELECT on customers for users with permission"
  on customers for select
  using (
    is_active = true 
    OR current_user_has_permission('master_data.party_master.view')
    OR current_user_has_role('system_admin')
  );
```

**INSERT Policy:**

```sql
create policy "Allow INSERT on customers for users with permission"
  on customers for insert
  with check (
    current_user_has_permission('master_data.party_master.manage')
    OR current_user_has_role('system_admin')
  );
```

**UPDATE Policy:**

```sql
create policy "Allow UPDATE on customers for users with permission"
  on customers for update
  using (
    (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'))
    AND (is_locked = false OR current_user_has_role('system_admin'))
    AND (is_system = false OR current_user_has_role('system_admin'))
  );
```

**DELETE Policy:**

```sql
create policy "Allow DELETE on customers for system_admin only"
  on customers for delete
  using (current_user_has_role('system_admin'));
```

**Repeat for:** vendors, subcontractors, consultants, government_authorities, recruitment_agencies, and all 24 child tables (contacts, addresses, documents, bank details).

#### 12.4.2 Service Role Policies

*(Content identical to original plan - service role policies unchanged)*

### 12.5 RLS Policy Summary

**Total RLS Policies:** ~174 policies (6 policies per table × 29 tables) — revised from ~180

- 29 SELECT policies
- 29 INSERT policies
- 29 UPDATE policies
- 29 DELETE policies
- 29 Service role SELECT policies
- 29 Service role INSERT/UPDATE/DELETE policies

**Helper Functions Required:**
- `current_user_has_permission(permission text)` ✅ Already exists
- `current_user_has_role(role text)` ✅ Already exists

---

## 13. Audit Logging Plan

*(Content identical to original plan - audit logging strategy unchanged, entity count revised to 29 instead of 30)*

---

## 14. Server Actions Plan

*(Content identical to original plan - server actions strategy unchanged)*

---

## 15. Validation Plan

*(Content identical to original plan - validation strategy unchanged)*

---

## 16. UI / Screen Plan

*(Content identical to original plan - UI structure unchanged)*

---

## 17. Reusable Select Component Plan

*(Content identical to original plan - select components unchanged, still 6 components)*

---

## 18. Sidebar / Menu Plan

*(Content identical to original plan - sidebar structure unchanged)*

---

## 19. Seed Data Plan

### 19.1 Seed Data Requirements

**Tables Requiring Seed Data:**

1. **global_lookup_categories** — 22 new categories
2. **global_lookup_values** — ~130 new values (revised from ~120 due to REV1 expansions)
3. **customers, vendors, subcontractors, consultants, government_authorities, recruitment_agencies** — Optional: 1-2 sample records per entity for demo/testing

**No seed data required for:** contact tables, address tables, document tables, bank details tables (child records created by users).

### 19.2 Lookup Category and Value Seeds

**Seed SQL Location:**

```text
supabase/migrations/20260607HHMMSS_erp_base_002f3e2_people_contacts_crm_foundation.sql
```

**REV1 Changes to Seed Data:**
- CUSTOMER_TYPES: Add 6 new values (GOVERNMENT_CUSTOMER, SEMI_GOVERNMENT_CUSTOMER, UTILITY_COMPANY, WATER_POWER_PLANT, INDUSTRIAL_CUSTOMER, COMMERCIAL_CUSTOMER)
- VENDOR_TYPES: Add 5 new values (TRANSPORTER, TRANSPORT_SERVICE_PROVIDER, LOGISTICS_SERVICE_PROVIDER, PRIVATE_WASTE_DISPOSAL_FACILITY, WASTE_DISPOSAL_SERVICE_PROVIDER)
- SUBCONTRACTOR_TYPES: Add 2 new values (TRANSPORT_SUBCONTRACTOR, SPECIALIZED_SUBCONTRACTOR)
- CONSULTANT_TYPES: Add 1 new value (AUDIT_CONSULTANT)
- GOVERNMENT_AUTHORITY_TYPES: Add 6 new values (LICENSE_ISSUER, PERMIT_ISSUER, PORT_AUTHORITY, CUSTOMS_AUTHORITY, UTILITY_AUTHORITY, TRANSPORT_AUTHORITY, GOVERNMENT_WASTE_DISPOSAL_AUTHORITY)

**Seed SQL Structure:**

```sql
-- ============================================================================
-- SECTION 1: Lookup Categories
-- ============================================================================

INSERT INTO global_lookup_categories (category_code, category_name_en, category_name_ar, description, module_code, is_system, is_locked, sort_order) VALUES
('PARTY_STATUS_TYPES', 'Party Status Types', 'أنواع حالة الطرف', 'Common status values for all party entities', 'PARTIES', true, true, 10),
('CUSTOMER_TYPES', 'Customer Types', 'أنواع العملاء', 'Customer classification types (REV1 expanded)', 'PARTIES', true, false, 20),
('VENDOR_TYPES', 'Vendor Types', 'أنواع الموردين', 'Vendor classification types (REV1 expanded)', 'PARTIES', true, false, 40),
-- ... (repeat for all 22 categories) ...
('BANK_ACCOUNT_TYPES', 'Bank Account Types', 'أنواع الحسابات المصرفية', 'Bank account classification', 'PARTIES', false, false, 220);

-- ============================================================================
-- SECTION 2: Lookup Values - CUSTOMER_TYPES (REV1 EXPANDED)
-- ============================================================================

INSERT INTO global_lookup_values (category_code, value_code, value_name_en, value_name_ar, description, badge_variant, is_system, is_locked, is_default, sort_order) VALUES
('CUSTOMER_TYPES', 'NORMAL_CUSTOMER', 'Normal Customer', 'عميل عادي', 'Normal customer', 'blue', true, false, true, 10),
('CUSTOMER_TYPES', 'GOVERNMENT_CUSTOMER', 'Government Customer', 'عميل حكومي', 'Government customer', 'purple', true, false, false, 20),
('CUSTOMER_TYPES', 'SEMI_GOVERNMENT_CUSTOMER', 'Semi-Government Customer', 'عميل شبه حكومي', 'Semi-government customer', 'purple', true, false, false, 30),
('CUSTOMER_TYPES', 'UTILITY_COMPANY', 'Utility Company', 'شركة المرافق', 'Utility company', 'orange', true, false, false, 40),
('CUSTOMER_TYPES', 'WATER_POWER_PLANT', 'Water & Power Plant', 'محطة المياه والطاقة', 'Water and power plant', 'cyan', true, false, false, 50),
('CUSTOMER_TYPES', 'INDUSTRIAL_CUSTOMER', 'Industrial Customer', 'عميل صناعي', 'Industrial customer', 'brown', true, false, false, 60),
('CUSTOMER_TYPES', 'COMMERCIAL_CUSTOMER', 'Commercial Customer', 'عميل تجاري', 'Commercial customer', 'pink', true, false, false, 70),
('CUSTOMER_TYPES', 'MAIN_CONTRACTOR', 'Main Contractor', 'المقاول الرئيسي', 'Main contractor', 'purple', true, false, false, 80),
('CUSTOMER_TYPES', 'EPC_CONTRACTOR', 'EPC Contractor', 'مقاول EPC', 'EPC contractor', 'purple', true, false, false, 90),
('CUSTOMER_TYPES', 'SCRAP_BUYER', 'Scrap Buyer', 'مشتري الخردة', 'Scrap buyer', 'green', true, false, false, 100),
('CUSTOMER_TYPES', 'SCRAP_SUPPLIER', 'Scrap Supplier', 'مورد الخردة', 'Scrap supplier', 'orange', true, false, false, 110),
('CUSTOMER_TYPES', 'PARTNER_CUSTOMER', 'Partner Customer', 'عميل شريك', 'Partner customer', 'gold', true, false, false, 120);

-- ============================================================================
-- SECTION 3: Lookup Values - VENDOR_TYPES (REV1 EXPANDED)
-- ============================================================================

INSERT INTO global_lookup_values (category_code, value_code, value_name_en, value_name_ar, description, badge_variant, is_system, is_locked, is_default, sort_order) VALUES
('VENDOR_TYPES', 'SUPPLIER', 'Supplier', 'مورد', 'General supplier', 'blue', true, false, true, 10),
('VENDOR_TYPES', 'MATERIAL_SUPPLIER', 'Material Supplier', 'مورد المواد', 'Material supplier', 'green', true, false, false, 20),
('VENDOR_TYPES', 'EQUIPMENT_SUPPLIER', 'Equipment Supplier', 'مورد المعدات', 'Equipment supplier', 'orange', true, false, false, 30),
('VENDOR_TYPES', 'SERVICE_PROVIDER', 'Service Provider', 'مزود الخدمة', 'Service provider', 'purple', true, false, false, 40),
('VENDOR_TYPES', 'TRANSPORTER', 'Transporter', 'ناقل', 'Transport service vendor', 'cyan', true, false, false, 50),
('VENDOR_TYPES', 'TRANSPORT_SERVICE_PROVIDER', 'Transport Service Provider', 'مزود خدمة النقل', 'Transport service provider', 'cyan', true, false, false, 60),
('VENDOR_TYPES', 'LOGISTICS_SERVICE_PROVIDER', 'Logistics Service Provider', 'مزود خدمة لوجستية', 'Logistics service provider', 'cyan', true, false, false, 70),
('VENDOR_TYPES', 'PRIVATE_WASTE_DISPOSAL_FACILITY', 'Private Waste Disposal Facility', 'مرفق التخلص من النفايات الخاصة', 'Private waste disposal facility', 'green', true, false, false, 80),
('VENDOR_TYPES', 'WASTE_DISPOSAL_SERVICE_PROVIDER', 'Waste Disposal Service Provider', 'مزود خدمة التخلص من النفايات', 'Waste disposal service provider', 'green', true, false, false, 90),
('VENDOR_TYPES', 'INSURANCE_COMPANY', 'Insurance Company', 'شركة تأمين', 'Insurance company', 'yellow', true, false, false, 100),
('VENDOR_TYPES', 'PROPERTY_LESSOR', 'Property Lessor', 'مؤجر العقارات', 'Property lessor', 'brown', true, false, false, 110),
('VENDOR_TYPES', 'VEHICLE_LESSOR', 'Vehicle Lessor', 'مؤجر المركبات', 'Vehicle lessor', 'brown', true, false, false, 120),
('VENDOR_TYPES', 'EQUIPMENT_LESSOR', 'Equipment Lessor', 'مؤجر المعدات', 'Equipment lessor', 'brown', true, false, false, 130),
('VENDOR_TYPES', 'CAMP_ACCOMMODATION_LESSOR', 'Camp/Accommodation Lessor', 'مؤجر المخيمات/الإقامة', 'Camp/accommodation lessor', 'brown', true, false, false, 140),
('VENDOR_TYPES', 'UTILITY_PROVIDER', 'Utility Provider', 'مزود المرافق', 'Utility provider', 'gray', true, false, false, 150);

-- ... (continue with all 22 categories, ~130 values total) ...

```

**Seed SQL Best Practices:**
- Include English and Arabic names for all categories and values
- Set `is_system: true` and `is_locked: true` for critical status values (ACTIVE, INACTIVE, BLACKLISTED)
- Set `is_default: true` for default values (e.g., ACTIVE status, NORMAL_CUSTOMER type, SUPPLIER vendor type)
- Assign badge variants for visual differentiation (green, red, yellow, blue, gray, purple, orange, brown, cyan, pink, gold)
- Use consistent sort_order (increments of 10) for future insertions

### 19.3 Sample Entity Records (Optional)

*(Content identical to original plan - sample data strategy unchanged)*

---

## 20. Data Migration / Legacy Strategy

*(Content identical to original plan - migration strategy unchanged)*

---

## 21. Testing Plan

*(Content identical to original plan - testing checklist unchanged, table count revised to 29 from 30)*

---

## 22. Risk Analysis and Mitigation

### 22.1 Risk Matrix (REV1 Updated)

| Risk | Impact | Likelihood | Severity | Mitigation (REV1) |
|------|--------|------------|----------|-------------------|
| **Too many tables in one phase (29 tables)** | High | Medium | High | ✅ **MANDATORY** split into 5 implementation sub-phases (002F.3E.2 through 002F.3E.6), do NOT implement all 29 tables in one prompt |
| **Accidentally hardcoded dropdowns** | Medium | Low | Medium | Rigorous code review using dropdown mapping matrix (Section 11), pre-commit checklist, REV1 expanded lookup values eliminate temptation to hardcode |
| **Customers/vendors/subcontractors confused (dual-role entities)** | Medium | Medium | Medium | ✅ REV1 clear classification rules documented (transporters, waste disposal), UI warnings when creating dual-role entities, user training |
| **Same company is both customer and vendor (data duplication)** | Low | High | Low | Accepted trade-off for data clarity, REV1 classification rules support this, future link table if cross-entity linkage needed |
| **RLS policies too strict (users blocked)** | High | Low | High | ✅ REV1 simplified grouped permissions reduce RLS complexity, comprehensive permission testing, role assignment matrix validation |
| **RLS policies too open (data leak)** | High | Low | Critical | Security audit during Phase 002F.3E.6, penetration testing in Phase 024 |
| **Transporter classification confusion** | Medium | Medium | Medium | ✅ REV1 explicit classification rule: service vendor → vendors, project execution → subcontractors, documented in plan and user training |
| **Waste disposal facility classification confusion** | Medium | Medium | Medium | ✅ REV1 explicit classification rule: government-owned → government_authorities, private → vendors, documented in plan and user training |
| **Government authority customers missed** | Medium | Medium | Medium | ✅ REV1 added GOVERNMENT_CUSTOMER, SEMI_GOVERNMENT_CUSTOMER, UTILITY_COMPANY, WATER_POWER_PLANT customer types |
| **License/permit issuers not tracked** | Medium | Medium | Medium | ✅ REV1 added LICENSE_ISSUER, PERMIT_ISSUER, UTILITY_AUTHORITY, TRANSPORT_AUTHORITY government authority types |
| **Permissions too complex (48 permissions)** | Medium | Medium | Medium | ✅ REV1 simplified to 4 grouped permissions, reduces role assignment and RLS overhead, easier user understanding |
| **Bank details exposed incorrectly** | High | Low | Critical | Separate permission for bank details manage, RLS policies restrict to manage permission only, UI masking for non-finance users |
| **Document upload/DMS not ready** | Low | High | Low | Phase 002F.3E uses placeholder file_path, DMS integration deferred to Phase 009 |
| **License expiry tracking not integrated with notifications** | Medium | High | Medium | Document expiry fields created, notification integration deferred to Phase 020 |
| **Migration data quality issues** | High | High | High | Manual data cleanup before migration, phased migration with validation, rollback plan |
| **Performance degradation with large datasets** | Medium | Medium | Medium | Database indexes on key fields, ERPDataTable pagination, query optimization |

### 22.2 Critical Risks and Mitigation Plans (REV1 Enhanced)

#### 22.2.1 Risk: Too Many Tables in One Phase

**Impact:** High — 29 tables is the largest module to date, risk of scope creep, extended implementation time, difficult QA.

**REV1 CRITICAL MITIGATION — MANDATORY PHASED IMPLEMENTATION:**

```text
DO NOT IMPLEMENT ALL 29 TABLES IN ONE IMPLEMENTATION PROMPT.
```

**Required Implementation Phasing:**

1. **Phase 002F.3E.2** — Database + Lookup Categories + Seed Values only
2. **Phase 002F.3E.3** — Customers + Customer Contacts/Addresses/Documents/Bank Details
3. **Phase 002F.3E.4** — Vendors + Vendor Contacts/Addresses/Documents/Bank Details
4. **Phase 002F.3E.5** — Subcontractors + Consultants + Government Authorities + Recruitment Agencies + All Child Tables
5. **Phase 002F.3E.6** — Select Components + Sidebar + QA Readiness

**Gate approval required before proceeding to next sub-phase.**

#### 22.2.2 Risk: Dual-Role Entity Classification Confusion (REV1 Enhanced)

**Impact:** Medium — Transporters and waste disposal facilities can be vendors OR subcontractors/government authorities, causing confusion.

**REV1 Mitigation:**

1. **Clear classification rules** documented in Section 2.2 and Section 4.2

2. **UI guidance** when creating transporter or waste disposal entity:
   - "Is this transporter providing general transport services (vendor) or subcontracted for project execution (subcontractor)?"
   - "Is this waste disposal facility government-owned (government authority) or private (vendor)?"

3. **User training documentation** with business examples:
   - "XYZ Transport LLC provides regular trucking services → Vendor"
   - "XYZ Transport LLC subcontracted for demolition project hauling → Subcontractor"
   - "Municipality waste facility → Government Authority"
   - "ABC Waste Services (private company) → Vendor"

4. **Future link table** (phase TBD): `party_relationships` table to link dual-role entities if cross-entity reporting needed

#### 22.2.3 Risk: Permissions Too Complex (REV1 Resolved)

**Original Risk:** 48 granular permissions create management overhead, complex role assignments, difficult RLS policies.

**REV1 Resolution:**

✅ **Simplified to 4 grouped permissions:**
- `master_data.party_master.view`
- `master_data.party_master.manage`
- `master_data.party_master.export`
- `master_data.party_master.audit_view`

**Benefits:**
- Easier role assignment
- Simpler RLS policies (same permission for all party entities)
- Better user understanding (one permission grants access to all party master data)
- Reduced implementation complexity
- Easier maintenance and troubleshooting

**Future Enhancement:**
- Granular permissions can be added in a later phase if organizational complexity requires entity-specific access control

#### 22.2.4 Risk: Accidentally Hardcoded Dropdowns (REV1 Mitigated)

**Impact:** Medium — Violates mandatory no-hardcoded-dropdown rule, breaks user editability.

**REV1 Enhanced Mitigation:**

1. **REV1 expanded lookup values** eliminate temptation to hardcode common UAE business entity types:
   - Government customers, utility companies, water & power plants now in CUSTOMER_TYPES
   - Transporters, logistics providers, waste disposal in VENDOR_TYPES
   - License issuers, utility authorities, transport authorities in GOVERNMENT_AUTHORITY_TYPES

2. **Dropdown mapping matrix** (Section 11) as implementation reference

3. **Pre-commit checklist**: "Are all dropdowns mapped to lookup categories or master data tables?"

4. **Code review**: Reviewer checks for hardcoded arrays like `["Option1", "Option2"]`

5. **Automated linting rule** (future): ESLint rule to detect hardcoded dropdown arrays

---

## 23. Acceptance Criteria

### 23.1 Technical Acceptance Criteria (REV1 Updated)

- [ ] **Technical plan REV1 approved** by Sameer/Dina
- [ ] **Main entity categories confirmed** (6 entities: customers, vendors, subcontractors, consultants, government authorities, recruitment agencies)
- [ ] **Customer types expanded** (REV1: 12 types including government/utility/industrial customers) ✅ REV1
- [ ] **Vendor types expanded** (REV1: 15 types including transporters/logistics/waste disposal) ✅ REV1
- [ ] **Subcontractor types expanded** (REV1: 8 types including transport subcontractors) ✅ REV1
- [ ] **Consultant types expanded** (REV1: 6 types including audit consultants) ✅ REV1
- [ ] **Government authority types expanded** (REV1: 15 types including license/permit issuers, utility/transport authorities) ✅ REV1
- [ ] **Transporter dual classification rule confirmed** (vendor OR subcontractor) ✅ REV1
- [ ] **Waste disposal dual classification rule confirmed** (government OR vendor) ✅ REV1
- [ ] **Recruitment agencies vendor-like status confirmed** (separate table but vendor-like for payments) ✅ REV1
- [ ] **No generic persons table** (employees excluded from Phase 002F.3E)
- [ ] **No employee tables** in 002F.3E (deferred to 002F.3F — HR Master Data)
- [ ] **Contacts/address/document strategy planned** (6 separate contact tables, 6 address tables, 6 document tables)
- [ ] **Bank details strategy planned** (5 bank details tables excluding government_authority_bank_details) ✅ REV1
- [ ] **Lookup categories planned** (22 categories, ~130 values including REV1 expansions, no hardcoded dropdowns)
- [ ] **No hardcoded dropdowns** (dropdown mapping matrix complete, REV1 expanded values)
- [ ] **Existing master data reused** (Geography, Finance Basics, UOM, Lookup Engine)
- [ ] **Permissions simplified** (4 grouped permissions: party_master.view/manage/export/audit_view) ✅ REV1
- [ ] **Audit planned** (logAudit for all mutations, audit_view permissions)
- [ ] **Select components planned** (6 new components: CustomerSelect, VendorSelect, SubcontractorSelect, ConsultantSelect, GovernmentAuthoritySelect, RecruitmentAgencySelect)
- [ ] **UI pages planned** (6 main entity pages, drawer forms with tabs, child record management)
- [ ] **Implementation phases mandatory** (5 sub-phases: 002F.3E.2 through 002F.3E.6, DO NOT implement all 29 tables in one prompt) ✅ REV1
- [ ] **Next prompt name recommended** (PROMPT_ERP_BASE_002F_3E_2_IMPLEMENT_DATABASE_LOOKUPS_SEEDS.md)

### 23.2 Business Acceptance Criteria (REV1 Enhanced)

- [ ] **Customer master data supports CRM** (customer segments, lead sources, sales owner assignment, credit management)
- [ ] **Customer types support UAE business** (government customers, semi-government customers, utility companies, water & power plants, industrial/commercial customers, main contractors, EPC contractors, scrap buyers/suppliers) ✅ REV1
- [ ] **Vendor master data supports Procurement** (vendor types, supplier categories, bank details for payment processing)
- [ ] **Vendor types support transport/logistics/waste** (transporters, logistics providers, private waste disposal facilities) ✅ REV1
- [ ] **Subcontractor master data supports Subcontracting** (subcontractor types, HSE prequalification, worker/equipment supply flags, transport subcontractors) ✅ REV1
- [ ] **Consultant master data supports Professional Services** (consultant types including audit consultants, engagement tracking) ✅ REV1
- [ ] **Government authority master data supports Compliance** (authority types, jurisdiction levels, permit tracking, license issuers, utility authorities) ✅ REV1
- [ ] **Recruitment agency master data supports HR** (agency types, countries served, license tracking, vendor-like payment processing) ✅ REV1
- [ ] **Dual-role classification supported** (transporters as vendors OR subcontractors, waste disposal as government OR vendors) ✅ REV1
- [ ] **Contact management supports relationship breadth** (multiple contacts per entity, contact types, communication preferences)
- [ ] **Address management supports logistics** (billing, shipping, site addresses with geography hierarchy)
- [ ] **Document management supports compliance** (trade licenses, TRN, insurance, HSE certificates with expiry tracking)
- [ ] **Bank details support payment processing** (IBAN, SWIFT, account details for vendor/subcontractor/consultant/recruitment agency payments, excluding government authorities) ✅ REV1

### 23.3 Quality Acceptance Criteria (REV1 Updated)

- [ ] **TypeScript compilation: 0 errors**
- [ ] **Build: Success** (npm run build)
- [ ] **Lint: Pass with notes** (pre-existing issues only)
- [ ] **Database migration applied successfully** (via MCP chunking if needed)
- [ ] **RLS policies verified** (system_admin full access, group_admin manage, company_admin view, branch_admin view)
- [ ] **Permissions seeded and assigned** (4 grouped permissions, role assignment matrix validated) ✅ REV1
- [ ] **Lookup categories and values seeded** (22 categories, ~130 values including REV1 expansions, default values set)
- [ ] **Select components working** (6 components load active records, respect RLS)
- [ ] **Sidebar navigation working** (menu group appears, routes navigate correctly)
- [ ] **Manual browser QA: Pass** (Sameer/Dina testing)
- [ ] **No hardcoded dropdowns** (dropdown mapping matrix validated, REV1 expanded lookup values verified)
- [ ] **Audit logging working** (all mutations logged, audit_view permission functional)
- [ ] **Business classification rules validated** (transporter/waste disposal dual classification, government/utility customer types) ✅ REV1

---

## 24. Future Integration Notes

*(Content similar to original plan, with enhanced REV1 notes on government customer integration, utility company integration, transport/logistics integration, waste disposal integration)*

### 24.1 Operational Modules Enabled by Phase 002F.3E (REV1 Enhanced)

**Phase 002F.3E (People / Contacts / CRM Foundation) enables:**

#### 24.1.1 Phase 003 — CRM Module

**Dependencies:**
- ✅ Customers table (lead source, customer segment, sales owner)
- ✅ **REV1:** Government customers, utility companies, water & power plants customer types
- ✅ Customer contacts (decision makers, communication preferences)
- ✅ Customer addresses (site locations)
- ✅ Industry classification

**New Tables in Phase 003:**
- `leads` (referencing `customers.customer_segment_code`, `customers.lead_source_code`)
- `opportunities` (referencing `customers.id`, supporting government/utility customer opportunities)
- `quotations` (referencing `customers.id`, `customer_contacts.id`, `customer_addresses.id`, supporting government/utility customers)
- `sales_orders` (referencing `customers.id`, `customer_contacts.id`, `customer_addresses.id` for billing/shipping)
- `customer_interactions` (referencing `customers.id`, `customer_contacts.id`)
- `customer_complaints` (referencing `customers.id`, `customer_contacts.id`)

**REV1 Enhanced Business Value:**
- Government customer opportunity tracking (government projects, utility company projects)
- Utility company relationship management (TAQA, EWEC, DEWA)
- Water & power plant project tracking (desalination plants, power stations)
- Industrial/commercial customer segmentation

#### 24.1.2 Phase 008 — Procurement Module

**Dependencies:**
- ✅ Vendors table
- ✅ **REV1:** Transporter vendors, logistics providers, private waste disposal vendors
- ✅ Vendor contacts
- ✅ Vendor addresses
- ✅ Vendor bank details
- ✅ Supplier categories

**New Tables in Phase 008:**
- `purchase_requisitions` (referencing `vendors.id`)
- `rfqs` (referencing `vendors.id`, `vendor_contacts.id`, supporting transporter/logistics vendors)
- `purchase_orders` (referencing `vendors.id`, `vendor_contacts.id`, `vendor_addresses.id`, `vendor_bank_details.id`)
- `goods_receipts` (referencing `vendors.id`, `purchase_orders.id`)
- `vendor_invoices` (referencing `vendors.id`, `purchase_orders.id`, `vendor_bank_details.id`)
- `payment_vouchers` (referencing `vendors.id`, `vendor_bank_details.id`)

**REV1 Enhanced Business Value:**
- Transporter vendor procurement (transport service contracts)
- Logistics provider management (3PL contracts, warehousing)
- Private waste disposal vendor contracting (waste treatment services)

#### 24.1.3 Future Subcontracting Module

**Dependencies:**
- ✅ Subcontractors table
- ✅ **REV1:** Transport subcontractors, specialized subcontractors
- ✅ Subcontractor contacts
- ✅ Subcontractor addresses
- ✅ Subcontractor bank details
- ✅ HSE prequalification status
- ✅ Worker/equipment supply flags

**New Tables:**
- `subcontract_agreements` (referencing `subcontractors.id`)
- `subcontract_work_orders` (referencing `subcontractors.id`, `subcontractor_contacts.id`, supporting transport subcontractors)
- `subcontractor_payments` (referencing `subcontractors.id`, `subcontractor_bank_details.id`)
- `subcontractor_performance_ratings` (referencing `subcontractors.id`)

**REV1 Enhanced Business Value:**
- Transport subcontractor management (project-specific hauling, demolition material transport)
- Specialized subcontractor tracking (painting, electrical, HVAC, etc.)

#### 24.1.4 Future Compliance Module

**Dependencies:**
- ✅ Government authorities table
- ✅ **REV1:** License issuers, permit issuers, utility authorities, transport authorities
- ✅ Government authority contacts
- ✅ Government authority addresses
- ✅ Jurisdiction levels

**New Tables:**
- `permit_applications` (referencing `government_authorities.id`, `government_authority_contacts.id`)
- `license_applications` (referencing `government_authorities.id` where authority_type_code = 'LICENSE_ISSUER')
- `inspections` (referencing `government_authorities.id`, `government_authority_contacts.id`)
- `regulatory_correspondence` (referencing `government_authorities.id`, `government_authority_contacts.id`)
- `compliance_certificates` (referencing `government_authorities.id`)

**REV1 Enhanced Business Value:**
- Trade license tracking (license issuers like Dubai Economic Department)
- Permit management (CICPA security permits, environmental permits, transport permits)
- Utility authority approvals (utility connection permits, utility compliance)
- Transport authority permits (vehicle permits, transport licenses)

### 24.2 Government Customer and Utility Company Integration (REV1 New)

**Scenario:** Alliance Gulf Transport provides services to government entities, utility companies, and water & power plants.

**Phase 002F.3E Support:**
- ✅ Customers table with `customer_type_code` → `GOVERNMENT_CUSTOMER`, `SEMI_GOVERNMENT_CUSTOMER`, `UTILITY_COMPANY`, `WATER_POWER_PLANT`

**Future Integration:**
- Government customer quotations and contracts (different approval workflows, longer payment cycles)
- Utility company projects (large-scale infrastructure, long-term service contracts)
- Water & power plant maintenance contracts (specialized services, HSE requirements)

**Business Examples:**
- TAQA (utility company) as customer for waste management services
- EWEC (utility company) as customer for plant demolition/decommissioning
- Dubai Municipality (government customer) purchasing waste disposal services
- Jebel Ali Power Station (water & power plant) as customer for maintenance/cleaning services

### 24.3 Transporter and Logistics Integration (REV1 New)

**Scenario:** Transporters can be vendors (service providers) OR subcontractors (project execution).

**Phase 002F.3E Support:**
- ✅ Vendors table with `vendor_type_code` → `TRANSPORTER`, `TRANSPORT_SERVICE_PROVIDER`, `LOGISTICS_SERVICE_PROVIDER`
- ✅ Subcontractors table with `subcontractor_type_code` → `TRANSPORTER`, `TRANSPORT_SUBCONTRACTOR`

**Future Integration:**
- Phase 008 (Procurement): Transporter vendor purchase orders (regular transport services)
- Phase 015 (Transport/Trips): Trip assignments to transporter vendors
- Future Subcontracting Module: Transport subcontractor work orders (project-specific hauling)
- Future Demolition Module: Demolition waste hauling subcontractors

**Classification Decision:**
- "XYZ Transport LLC" provides regular weekly scrap hauling → Vendor (TRANSPORTER)
- "XYZ Transport LLC" subcontracted for Project ABC demolition waste removal → Subcontractor (TRANSPORT_SUBCONTRACTOR)
- Can create 2 separate records if needed (vendor record + subcontractor record)

### 24.4 Waste Disposal Integration (REV1 New)

**Scenario:** Waste disposal facilities can be government authorities OR private vendors.

**Phase 002F.3E Support:**
- ✅ Government Authorities table with `authority_type_code` → `WASTE_DISPOSAL_FACILITY`, `GOVERNMENT_WASTE_DISPOSAL_AUTHORITY`
- ✅ Vendors table with `vendor_type_code` → `PRIVATE_WASTE_DISPOSAL_FACILITY`, `WASTE_DISPOSAL_SERVICE_PROVIDER`

**Future Integration:**
- Phase 013 (Waste Management): Waste disposal transactions referencing vendors OR government authorities
- Future Compliance Module: Government waste disposal facility permits and compliance
- Future Procurement Module: Private waste disposal vendor contracts

**Classification Decision:**
- Municipality waste facility → Government Authority (GOVERNMENT_WASTE_DISPOSAL_AUTHORITY)
- "ABC Waste Services" (private treatment company) → Vendor (PRIVATE_WASTE_DISPOSAL_FACILITY)

### 24.5 License and Permit Issuer Integration (REV1 New)

**Scenario:** Various government authorities issue licenses and permits.

**Phase 002F.3E Support:**
- ✅ Government Authorities table with `authority_type_code` → `LICENSE_ISSUER`, `PERMIT_ISSUER`

**Future Integration:**
- Future Compliance Module: License application tracking (trade licenses, environmental licenses)
- Future Compliance Module: Permit application tracking (security permits, transport permits, construction permits)
- Phase 004 (HR): Labor card and work permit issuers

**Business Examples:**
- Dubai Economic Department (DED) → LICENSE_ISSUER (trade licenses)
- CICPA → PERMIT_ISSUER (security permits)
- Environmental authority → PERMIT_ISSUER (environmental permits)
- Transport authority → PERMIT_ISSUER (transport permits)

### 24.6 Utility and Transport Authority Integration (REV1 New)

**Scenario:** Utility and transport authorities provide approvals and permits.

**Phase 002F.3E Support:**
- ✅ Government Authorities table with `authority_type_code` → `UTILITY_AUTHORITY`, `TRANSPORT_AUTHORITY`

**Future Integration:**
- Future Compliance Module: Utility authority approvals (water/electricity connection permits)
- Future Compliance Module: Transport authority permits (vehicle registration, transport licenses)
- Phase 005 (Fleet): Vehicle registration with transport authorities

**Business Examples:**
- Dubai RTA (Roads and Transport Authority) → TRANSPORT_AUTHORITY
- Abu Dhabi DOT (Department of Transport) → TRANSPORT_AUTHORITY
- Utilities Regulatory Authority → UTILITY_AUTHORITY

*(Remaining future integration sections similar to original plan)*

---

## 25. Implementation Phasing Recommendation

### 25.1 Complexity Analysis

**Phase 002F.3E Scope:**
- 29 tables (6 main entities + 23 child tables) — revised from 30
- 22 lookup categories + ~130 lookup values (revised from ~120)
- ~60 server actions
- ~36 UI components
- 4 permissions (simplified from 48) + ~174 RLS policies (revised from ~180)
- 6 select components
- 1 sidebar menu group

**Estimated Total Lines of Code:**
- Database migration: ~3200 lines SQL (revised from ~3000 due to expanded lookup values)
- Types: ~1500 lines TypeScript
- Validation: ~1000 lines TypeScript
- Server actions: ~3000 lines TypeScript
- UI components: ~4000 lines TypeScript (JSX)
- **Total: ~12,700 lines of code** (slightly revised from ~12,500)

**REV1 CRITICAL:** **DO NOT IMPLEMENT ALL 29 TABLES IN ONE IMPLEMENTATION PROMPT.**

**Recommendation:** **MANDATORY split into 5 implementation sub-phases** for manageable complexity, incremental testing, and gate approvals.

### 25.2 Recommended Implementation Phasing (REV1 Mandatory)

#### 25.2.1 Phase 002F.3E.1 — Technical Planning (Current Phase)

**Status:** COMPLETE (REV1)

**Deliverables:**
- ✅ REV1 corrected technical implementation plan document
- ✅ Sameer/Dina review and approval

**Duration:** Completed (planning only)

#### 25.2.2 Phase 002F.3E.2 — Database + Lookups + Seeds

**Scope:**
- Create 29 database tables (DDL) — revised from 30
- Create 22 lookup categories
- Create ~130 lookup values (revised from ~120, including REV1 expansions)
- Seed sample data (optional)
- Apply RLS policies (~174 policies) — revised from ~180
- Seed permissions (4 permissions) — revised from 48
- Assign permissions to roles

**Deliverables:**
- Migration file(s): `20260607HHMMSS_erp_base_002f3e2_database_lookups_seeds.sql`
- Database verification report
- RLS policy verification report

**Duration:** 2-3 days

**Testing:**
- [ ] All 29 tables created
- [ ] All RLS policies applied
- [ ] All 4 permissions seeded
- [ ] All 22 lookup categories and ~130 values seeded (including REV1 expansions: government customers, utility companies, transporters, waste disposal, license issuers, utility authorities)
- [ ] Sample data inserted (if included)
- [ ] Database constraints verified (TRN format, email format, etc.)

**Gate:** Database foundation complete, approved by Sameer/Dina before proceeding to 002F.3E.3.

#### 25.2.3 Phase 002F.3E.3 — Customers + Child Tables

**Scope:**
- Types, validation, server actions for customers
- Types, validation, server actions for customer_contacts, customer_addresses, customer_documents, customer_bank_details
- UI components: CustomersTable, CustomerFormDialog, child record forms
- Page: `/admin/master-data/parties/customers`

**Deliverables:**
- `src/features/master-data/parties/customers/`
  - `types.ts`
  - `validation.ts`
  - `customers-actions.ts`
  - `contacts-actions.ts`
  - `addresses-actions.ts`
  - `documents-actions.ts`
  - `bank-details-actions.ts`
  - `components/` (6 components)
- `src/app/(protected)/admin/master-data/parties/customers/page.tsx`

**Duration:** 2-3 days

**Testing:**
- [ ] Add customer with all fields (including REV1 customer types: GOVERNMENT_CUSTOMER, UTILITY_COMPANY, etc.)
- [ ] Edit customer
- [ ] Delete customer (soft delete)
- [ ] Add customer contact
- [ ] Add customer address
- [ ] Add customer document
- [ ] Add customer bank details
- [ ] View customer audit log
- [ ] Export customers to CSV
- [ ] TypeScript compilation: 0 errors
- [ ] Build: Success

**Gate:** Customers module complete, approved by Sameer/Dina before proceeding to 002F.3E.4.

#### 25.2.4 Phase 002F.3E.4 — Vendors + Child Tables

**Scope:**
- Types, validation, server actions for vendors
- Types, validation, server actions for vendor_contacts, vendor_addresses, vendor_documents, vendor_bank_details
- UI components: VendorsTable, VendorFormDialog, child record forms
- Page: `/admin/master-data/parties/vendors`

**Deliverables:**
- `src/features/master-data/parties/vendors/` (same structure as customers)
- `src/app/(protected)/admin/master-data/parties/vendors/page.tsx`

**Duration:** 2-3 days

**Testing:**
- [ ] Add vendor with all fields (including REV1 vendor types: TRANSPORTER, PRIVATE_WASTE_DISPOSAL_FACILITY, etc.)
- [ ] Edit vendor
- [ ] Vendor bank details mandatory (verify constraint)
- [ ] Add vendor contact
- [ ] Add vendor address
- [ ] Add vendor document
- [ ] Add vendor bank details
- [ ] View vendor audit log
- [ ] Export vendors to CSV
- [ ] REV1: Test transporter vendor classification (TRANSPORTER, TRANSPORT_SERVICE_PROVIDER, LOGISTICS_SERVICE_PROVIDER)
- [ ] REV1: Test private waste disposal vendor classification (PRIVATE_WASTE_DISPOSAL_FACILITY, WASTE_DISPOSAL_SERVICE_PROVIDER)
- [ ] TypeScript compilation: 0 errors
- [ ] Build: Success

**Gate:** Vendors module complete, approved by Sameer/Dina before proceeding to 002F.3E.5.

#### 25.2.5 Phase 002F.3E.5 — Remaining Entities (Subcontractors, Consultants, Government Authorities, Recruitment Agencies)

**Scope:**
- Types, validation, server actions for subcontractors, consultants, government_authorities, recruitment_agencies
- Types, validation, server actions for all child tables (contacts, addresses, documents, bank details)
- UI components for all 4 entities (16 components)
- Pages for all 4 entities

**Deliverables:**
- `src/features/master-data/parties/subcontractors/` (same structure as customers)
- `src/features/master-data/parties/consultants/` (same structure as customers)
- `src/features/master-data/parties/government-authorities/` (same structure as customers)
- `src/features/master-data/parties/recruitment-agencies/` (same structure as customers)
- 4 pages (subcontractors, consultants, government-authorities, recruitment-agencies)

**Duration:** 2-3 days

**Testing:**
- [ ] Add/edit/delete subcontractor
- [ ] REV1: Test transport subcontractor classification (TRANSPORTER, TRANSPORT_SUBCONTRACTOR, SPECIALIZED_SUBCONTRACTOR)
- [ ] Subcontractor HSE prequalification status working
- [ ] Worker/equipment supply flags working
- [ ] Add/edit/delete consultant
- [ ] REV1: Test audit consultant classification (AUDIT_CONSULTANT)
- [ ] Add/edit/delete government authority
- [ ] REV1: Test government authority types (LICENSE_ISSUER, PERMIT_ISSUER, UTILITY_AUTHORITY, TRANSPORT_AUTHORITY, PORT_AUTHORITY, CUSTOMS_AUTHORITY, GOVERNMENT_WASTE_DISPOSAL_AUTHORITY)
- [ ] Government authority jurisdiction level working
- [ ] Government authority: no bank details tab (verified)
- [ ] Add/edit/delete recruitment agency
- [ ] Recruitment agency countries served working
- [ ] REV1: Recruitment agency bank details present (vendor-like for payments)
- [ ] TypeScript compilation: 0 errors
- [ ] Build: Success

**Gate:** All main entities complete, approved by Sameer/Dina before proceeding to 002F.3E.6.

#### 25.2.6 Phase 002F.3E.6 — Select Components + Sidebar + QA Readiness

**Scope:**
- Create 6 reusable select components (CustomerSelect, VendorSelect, SubcontractorSelect, ConsultantSelect, GovernmentAuthoritySelect, RecruitmentAgencySelect)
- Update sidebar navigation (`app-sidebar.tsx`)
- Comprehensive QA testing (all entities, all actions)
- Final readiness report

**Deliverables:**
- `src/components/erp/parties/`
  - `customer-select.tsx`
  - `vendor-select.tsx`
  - `subcontractor-select.tsx`
  - `consultant-select.tsx`
  - `government-authority-select.tsx`
  - `recruitment-agency-select.tsx`
  - `index.ts` (exports)
- `src/components/layout/app-sidebar.tsx` (updated)
- `implementation_Review/Phase_002F_3E/ERP_BASE_002F_3E_6_SELECT_COMPONENTS_SIDEBAR_QA_READINESS_REPORT.md`

**Duration:** 1-2 days

**Testing:**
- [ ] All 6 select components working
- [ ] Select components respect RLS
- [ ] Select components load active records only
- [ ] Select components support type/category filters (REV1: customer type filter for government customers, vendor type filter for transporters, etc.)
- [ ] Sidebar menu group "People / Contacts / CRM Foundation" appears
- [ ] All 6 entity menu items appear with correct icons
- [ ] Sidebar navigation working (collapsed by default, manual multi-open)
- [ ] Comprehensive QA: All entities, all actions (add, edit, delete, child records, audit logs, export)
- [ ] REV1: Business classification rules validated (transporter dual classification, waste disposal dual classification, government/utility customer types, license/permit issuer types)
- [ ] TypeScript compilation: 0 errors
- [ ] Build: Success
- [ ] Lint: Pass with notes
- [ ] Manual browser QA: Pass
- [ ] Sameer/Dina approval

**Gate:** Phase 002F.3E complete, ready for closure.

### 25.3 Implementation Phasing Summary (REV1 Updated)

| Sub-Phase | Scope | Duration | Deliverables | Gate Criteria |
|-----------|-------|----------|--------------|---------------|
| **002F.3E.1** | Technical Planning (REV1) | Completed | REV1 corrected technical plan document | Sameer/Dina approval |
| **002F.3E.2** | Database + Lookups + Seeds | 2-3 days | Migration file(s), verification reports, 29 tables, 22 categories, ~130 values, 4 permissions | Database foundation complete |
| **002F.3E.3** | Customers + Child Tables | 2-3 days | Customer module (types, actions, UI), REV1 customer types tested | Customers module tested, approved |
| **002F.3E.4** | Vendors + Child Tables | 2-3 days | Vendor module (types, actions, UI), REV1 vendor types tested | Vendors module tested, approved |
| **002F.3E.5** | Remaining Entities | 2-3 days | Subcontractors, Consultants, Govt Authorities, Recruitment Agencies, REV1 types tested | All entities tested, approved |
| **002F.3E.6** | Select Components + Sidebar + QA | 1-2 days | 6 select components, sidebar update, final QA report, REV1 business rules validated | Comprehensive QA passed, Sameer/Dina approval |
| **Total** | **Full Phase 002F.3E** | **9-14 days** | **29 tables, 60 actions, 36 UI components, 6 select components, REV1 expanded lookup values** | **Phase 002F.3E CLOSED** |

### 25.4 Next Implementation Prompt Name

**Recommended Next Prompt:**

```text
PROMPT_ERP_BASE_002F_3E_2_IMPLEMENT_DATABASE_LOOKUPS_SEEDS.md
```

**Prompt Purpose:**
- Implement Phase 002F.3E.2 (Database + Lookups + Seeds)
- Create 29 database tables (revised from 30)
- Seed 22 lookup categories + ~130 lookup values (including REV1 expansions)
- Apply ~174 RLS policies (revised from ~180)
- Seed 4 permissions (revised from 48)
- Optional: Seed sample data for testing

**Prompt Scope:**
- Database implementation only
- No UI components
- No server actions (except permissions seeding)
- Gate approval before proceeding to 002F.3E.3

---

## 26. Final Recommendation

### 26.1 Plan Status

**✅ READY FOR SAMEER REVIEW — 002F.3E REV1 corrected technical plan complete.**

### 26.2 Summary

This REV1 technical plan provides a comprehensive, implementation-ready blueprint for **ERP BASE Phase 002F.3E — People / Contacts / CRM Foundation**, with critical corrections based on Sameer/Dina review, covering:

✅ **6 main entity tables** (customers, vendors, subcontractors, consultants, government authorities, recruitment agencies)  
✅ **23 child tables** (contacts, addresses, documents, bank details — excluding government_authority_bank_details)  
✅ **22 lookup categories** + ~130 lookup values (REV1 expanded from ~120)  
✅ **4 grouped permissions** (REV1 simplified from 48) + ~174 RLS policies (revised from ~180)  
✅ **~60 server actions**  
✅ **~36 UI components**  
✅ **6 reusable select components**  
✅ **Sidebar navigation update**  
✅ **No hardcoded dropdowns** (dropdown mapping matrix complete, REV1 expanded lookup values)  
✅ **Master data reuse** (Geography, Finance Basics, UOM, Lookup Engine)  
✅ **Separation by entity type** (no generic persons table, employees excluded)  
✅ **5 implementation sub-phases** (002F.3E.2 through 002F.3E.6) — **MANDATORY SPLIT, DO NOT IMPLEMENT ALL 29 TABLES IN ONE PROMPT**  

### 26.3 REV1 Key Corrections Summary

1. ✅ **Customer types expanded** from 6 to 12 values: Added GOVERNMENT_CUSTOMER, SEMI_GOVERNMENT_CUSTOMER, UTILITY_COMPANY, WATER_POWER_PLANT, INDUSTRIAL_CUSTOMER, COMMERCIAL_CUSTOMER
2. ✅ **Vendor types expanded** from 10 to 15 values: Added TRANSPORTER, TRANSPORT_SERVICE_PROVIDER, LOGISTICS_SERVICE_PROVIDER, PRIVATE_WASTE_DISPOSAL_FACILITY, WASTE_DISPOSAL_SERVICE_PROVIDER
3. ✅ **Subcontractor types expanded** from 6 to 8 values: Added TRANSPORT_SUBCONTRACTOR, SPECIALIZED_SUBCONTRACTOR, clarified TRANSPORTER
4. ✅ **Consultant types expanded** from 5 to 6 values: Added AUDIT_CONSULTANT
5. ✅ **Government authority types expanded** from 9 to 15 values: Added LICENSE_ISSUER, PERMIT_ISSUER, PORT_AUTHORITY, CUSTOMS_AUTHORITY, UTILITY_AUTHORITY, TRANSPORT_AUTHORITY, GOVERNMENT_WASTE_DISPOSAL_AUTHORITY
6. ✅ **Transporter dual classification rule** documented: Transporter can be vendor (service provider) OR subcontractor (project execution)
7. ✅ **Waste disposal dual classification rule** documented: Waste disposal can be government authority (government-owned) OR vendor (private)
8. ✅ **Recruitment agencies vendor-like status** clarified: Separate table maintained for HR control, but vendor-like for payment/commercial purposes (HAS bank details)
9. ✅ **Permissions simplified** from 48 granular permissions to 4 grouped permissions (party_master.view/manage/export/audit_view)
10. ✅ **Government authority bank details excluded** (table count reduced from 30 to 29 tables)
11. ✅ **Business classification rules** clearly documented throughout plan with business examples
12. ✅ **Mandatory phased implementation** emphasized (DO NOT implement all 29 tables in one prompt)

### 26.4 Success Criteria

Phase 002F.3E will be considered successful when:

✅ All 29 tables created with proper BIGINT PKs/FKs, RLS, and indexes  
✅ All 22 lookup categories and ~130 lookup values seeded (including REV1 expansions)  
✅ All 4 permissions seeded and assigned to roles (REV1 simplified)  
✅ All ~60 server actions implemented with validation, permissions, and audit logging  
✅ All ~36 UI components implemented with ERPDataTable, ERPDrawerForm patterns  
✅ All 6 select components implemented and functional  
✅ Sidebar navigation updated with "People / Contacts / CRM Foundation" menu group  
✅ TypeScript compilation: 0 errors  
✅ Build: Success (npm run build)  
✅ Lint: Pass with notes (pre-existing issues only)  
✅ Manual browser QA: Pass (Sameer/Dina approval)  
✅ No hardcoded dropdowns (dropdown mapping matrix validated)  
✅ REV1 business classification rules validated (transporter/waste disposal dual classification, government/utility customer types, license/permit issuers)  

### 26.5 Business Value (REV1 Enhanced)

Phase 002F.3E unlocks:

- **CRM Module** (Phase 003) — **Enhanced:** Government customer segmentation, utility company relationship management, water & power plant project tracking
- **Procurement Module** (Phase 008) — **Enhanced:** Transporter vendor management, logistics provider contracts, private waste disposal service procurement
- **Subcontracting Module** (Future) — **Enhanced:** Transport subcontractor project execution, specialized subcontractor management
- **Professional Services Module** (Future) — **Enhanced:** Audit consultant engagements
- **Compliance Module** (Future) — **Enhanced:** License issuer tracking (trade licenses), permit issuer tracking (security/environmental/transport permits), utility authority approvals, transport authority permits
- **HR Module** (Phase 004) — Recruitment agency tracking, candidate management, manpower supply (recruitment agencies maintained as separate entity but vendor-like for payments)
- **Scrap Trading** (Phase 012) — Scrap buyer/supplier management (customer types), payment processing
- **Waste Management** (Phase 013) — **Enhanced:** Government waste disposal authority tracking, private waste disposal vendor management
- **Service Providers** — Maintenance, cleaning, security service management
- **Lessors** — Property, vehicle, equipment, camp accommodation lease management
- **Transporters** (Phase 015) — **Enhanced:** Dual classification support (transporter vendors for service contracts, transport subcontractors for project execution)

### 26.6 Risk Summary (REV1 Enhanced)

**Low Risk:**
- ✅ Well-established patterns from previous phases (Geography, Finance Basics, UOM)
- ✅ No architectural changes required
- ✅ Reusable components and helper functions available
- ✅ RLS and permission patterns proven
- ✅ REV1 simplified permissions reduce RLS complexity

**Medium Risk (Mitigated):**
- ⚠️ Largest module to date (29 tables, ~12,700 lines of code) → **Mitigated by MANDATORY 5-sub-phase approach**
- ⚠️ Potential for accidentally hardcoding dropdowns → **Mitigated by REV1 expanded lookup values and dropdown mapping matrix**
- ⚠️ User confusion between similar entities → **Mitigated by REV1 clear classification rules, business examples, and UI guidance**
- ⚠️ Dual-role entity classification confusion → **Mitigated by REV1 explicit classification rules for transporters and waste disposal facilities**

**High Risk (Mitigated):**
- ⚠️ Too many tables in one phase → **RESOLVED: MANDATORY split into 5 implementation sub-phases, DO NOT implement all 29 tables in one prompt**
- ⚠️ Permissions too complex (48 granular permissions) → **RESOLVED: REV1 simplified to 4 grouped permissions**
- ⚠️ Bank details data leak → **Mitigated by strict RLS policies and UI masking**
- ⚠️ RLS policies too strict/open → **Mitigated by comprehensive testing and simplified permission model**

### 26.7 Next Steps

1. **Sameer/Dina Review** — Review this REV1 corrected technical plan, provide feedback, request clarifications
2. **Plan Approval** — Approve this REV1 technical plan to proceed with implementation
3. **Implementation Kickoff** — Generate implementation prompt:
   ```text
   PROMPT_ERP_BASE_002F_3E_2_IMPLEMENT_DATABASE_LOOKUPS_SEEDS.md
   ```
4. **Phase 002F.3E.2 Implementation** — Database + Lookups + Seeds (2-3 days)
5. **Gate Approval** — Database foundation verified, approved before 002F.3E.3
6. **Phase 002F.3E.3 Implementation** — Customers + Child Tables (2-3 days)
7. **Gate Approval** — Customers module tested, approved before 002F.3E.4
8. **Phase 002F.3E.4 Implementation** — Vendors + Child Tables (2-3 days)
9. **Gate Approval** — Vendors module tested, approved before 002F.3E.5
10. **Phase 002F.3E.5 Implementation** — Remaining Entities (2-3 days)
11. **Gate Approval** — All entities tested, approved before 002F.3E.6
12. **Phase 002F.3E.6 Implementation** — Select Components + Sidebar + QA (1-2 days)
13. **Final Gate Approval** — Comprehensive QA passed, Sameer/Dina approval
14. **Phase 002F.3E Closure** — Phase marked CLOSED, roadmap updated

### 26.8 Estimated Timeline

**Total Implementation Time:** 9-14 days (business days, excluding planning)

**Breakdown:**
- 002F.3E.2: 2-3 days
- 002F.3E.3: 2-3 days
- 002F.3E.4: 2-3 days
- 002F.3E.5: 2-3 days
- 002F.3E.6: 1-2 days

**With gate approvals and testing buffer:** 12-16 days total

---

## Appendix A: Glossary (REV1 Enhanced)

*(Content similar to original plan, with REV1 additions)*

| Term | Definition (REV1 Enhanced) |
|------|---------------------------|
| **Party** | Generic term for external business entities (customers, vendors, subcontractors, consultants, government authorities, recruitment agencies) |
| **CRM** | Customer Relationship Management — Sales, marketing, and customer service processes |
| **Government Customer** | Government or semi-government entity purchasing services/materials (e.g., TAQA, EWEC, Dubai Municipality) ✅ REV1 |
| **Utility Company** | Utility company as customer/project owner (e.g., TAQA, EWEC, DEWA) ✅ REV1 |
| **Water & Power Plant** | Water desalination plant or power generation facility as customer (e.g., Jebel Ali Power Station) ✅ REV1 |
| **Transporter (Vendor)** | Transport company providing general service (classified as vendor) ✅ REV1 |
| **Transporter (Subcontractor)** | Transport company subcontracted for project execution (classified as subcontractor) ✅ REV1 |
| **Private Waste Disposal Facility** | Private waste treatment/disposal company (classified as vendor) ✅ REV1 |
| **Government Waste Disposal Authority** | Government-owned waste disposal facility (classified as government authority) ✅ REV1 |
| **License Issuer** | Government authority issuing licenses (e.g., Dubai Economic Department) ✅ REV1 |
| **Permit Issuer** | Government authority issuing permits (e.g., CICPA for security permits) ✅ REV1 |
| **Utility Authority** | Government utility regulatory authority ✅ REV1 |
| **Transport Authority** | Government transport authority (e.g., Dubai RTA, Abu Dhabi DOT) ✅ REV1 |
| **TRN** | Tax Registration Number — UAE 15-digit tax ID |
| **IBAN** | International Bank Account Number — Standardized bank account identifier |
| **SWIFT** | Society for Worldwide Interbank Financial Telecommunication — Bank identification code |
| **Makani** | Dubai smart addressing system — 10-digit location code |
| **HSE** | Health, Safety, Environment — Compliance and safety management |
| **RLS** | Row Level Security — PostgreSQL database-level access control |
| **Lookup Category** | Editable dropdown category in global lookup engine |
| **Lookup Value** | Individual dropdown option within a lookup category |
| **Soft Delete** | Setting `is_active = false` instead of hard-deleting database records |
| **Hard Delete** | Permanently deleting database records (rare, system_admin only) |
| **Dual-Role Entity** | Company that can be classified in multiple categories (e.g., transporter as vendor AND subcontractor, waste disposal as government AND vendor) ✅ REV1 |
| **Grouped Permissions** | Simplified permission model using shared permissions across multiple entities (e.g., party_master.view for all parties) ✅ REV1 |
| **Cascading Delete** | Child records automatically deleted when parent record is hard-deleted |
| **Service Role** | Supabase admin role for server-side operations (bypasses RLS) |

---

## Appendix B: Quick Reference — File Locations

*(Content identical to original plan - file locations unchanged)*

---

## Appendix C: REV1 Correction Summary

### C.1 Changes from Original Plan to REV1

| Section | Original Plan | REV1 Corrected | Rationale |
|---------|--------------|----------------|-----------|
| **Table Count** | 30 tables | 29 tables | Excluded government_authority_bank_details |
| **CUSTOMER_TYPES** | 6 values | 12 values | Added GOVERNMENT_CUSTOMER, SEMI_GOVERNMENT_CUSTOMER, UTILITY_COMPANY, WATER_POWER_PLANT, INDUSTRIAL_CUSTOMER, COMMERCIAL_CUSTOMER |
| **VENDOR_TYPES** | 10 values | 15 values | Added TRANSPORTER, TRANSPORT_SERVICE_PROVIDER, LOGISTICS_SERVICE_PROVIDER, PRIVATE_WASTE_DISPOSAL_FACILITY, WASTE_DISPOSAL_SERVICE_PROVIDER |
| **SUBCONTRACTOR_TYPES** | 6 values | 8 values | Added TRANSPORT_SUBCONTRACTOR, SPECIALIZED_SUBCONTRACTOR, clarified TRANSPORTER |
| **CONSULTANT_TYPES** | 5 values | 6 values | Added AUDIT_CONSULTANT |
| **GOVERNMENT_AUTHORITY_TYPES** | 9 values | 15 values | Added LICENSE_ISSUER, PERMIT_ISSUER, PORT_AUTHORITY, CUSTOMS_AUTHORITY, UTILITY_AUTHORITY, TRANSPORT_AUTHORITY, GOVERNMENT_WASTE_DISPOSAL_AUTHORITY |
| **Lookup Values Total** | ~120 values | ~130 values | +10 values due to expansions |
| **Permissions** | 48 granular permissions | 4 grouped permissions | Simplified to party_master.view/manage/export/audit_view |
| **RLS Policies** | ~180 policies | ~174 policies | Reduced due to 29 tables and simplified permissions |
| **Waste Disposal Classification** | government_authorities only | government_authorities OR vendors | Dual classification rule added |
| **Transporter Classification** | Implied subcontractor | vendors OR subcontractors | Dual classification rule clarified |
| **Recruitment Agencies Status** | Separate entity | Separate entity, vendor-like for payments | Clarified commercial/payment nature |
| **Business Classification Rules** | Not explicit | Explicit rules with business examples | Section 2.2 and 4.2 significantly expanded |
| **Implementation Phasing** | Recommended | MANDATORY | Changed language from "recommended" to "DO NOT implement all 29 tables in one prompt" |

### C.2 REV1 Business Examples Added

**Government Customers:**
- TAQA (Abu Dhabi National Energy Company)
- EWEC (Emirates Water and Electricity Company)
- Dubai Electricity and Water Authority (DEWA)
- Dubai Municipality

**Utility Companies:**
- Jebel Ali Power Station
- Taweelah Desalination Plant

**License Issuers:**
- Dubai Economic Department (DED) — trade licenses

**Permit Issuers:**
- CICPA (Critical Infrastructure and Coastal Protection Authority) — security permits
- Environmental authority — environmental permits
- Transport authority — transport permits

**Utility Authorities:**
- Utilities Regulatory Authority

**Transport Authorities:**
- Dubai RTA (Roads and Transport Authority)
- Abu Dhabi DOT (Department of Transport)

**Private Waste Disposal:**
- Private waste treatment companies → Vendors

**Government Waste Disposal:**
- Municipality waste facilities → Government Authorities

**Transporters:**
- Transport service provider (general services) → Vendor
- Transport subcontractor (project execution) → Subcontractor

---

**END OF TECHNICAL IMPLEMENTATION PLAN REV1**

**Document Version:** REV1 (Corrected)  
**Generated:** Sunday, June 7, 2026 (REV1)  
**Status:** ✅ READY FOR SAMEER REVIEW  
**Next Action:** Sameer/Dina review and approval to proceed with Phase 002F.3E.2 implementation

