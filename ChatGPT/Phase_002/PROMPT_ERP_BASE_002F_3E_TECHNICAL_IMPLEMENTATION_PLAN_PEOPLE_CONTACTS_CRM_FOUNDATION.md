# PROMPT_ERP_BASE_002F_3E_TECHNICAL_IMPLEMENTATION_PLAN_PEOPLE_CONTACTS_CRM_FOUNDATION

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, notification-engine validation specialist, enterprise ERP solution architect, UAE business compliance analyst, CRM/customer-vendor master-data architect, procurement master-data governance consultant, and senior Next.js/Supabase implementation planner.

## Phase

ERP BASE 002F.3E — People / Contacts / CRM Foundation

## Prompt Purpose

This prompt is for TECHNICAL IMPLEMENTATION PLANNING ONLY.

Do not implement code.

Do not create migration files.

Do not modify database schema.

Do not create UI screens.

Do not modify application source files.

Do not start implementation.

Your task is to inspect the existing ERP project and generate a very deep, detailed, implementation-ready technical plan for:

```text
ERP BASE 002F.3E — People / Contacts / CRM Foundation
```

After Sameer reviews and approves your technical plan, a separate implementation prompt will be generated.

## Required Output File

Create only this markdown file:

```text
ERP_BASE_002F_3E_PEOPLE_CONTACTS_CRM_FOUNDATION_TECHNICAL_IMPLEMENTATION_PLAN.md
```

Do not create any other file.

---

# 1. Current ERP Status

The following foundation phases are complete/closed:

```text
002F.3B — Global Lookup / Dropdown Engine
002F.3C — Core UAE Shared Master Data
002F.3C.1 — Geography & Locations
002F.3C.1A — Geography Integration Impact Plan
002F.3C.1B.1 — Organizations / Owner Companies Geography Integration
002F.3C.1B.2 — Branches Geography Integration
002F.3C.2 — Finance Basics / Commercial Readiness
002F.3C.3 — Units & Measurements
002F.3C.4A — Sidebar Collapse and Scroll Fix
002F.3C.4A.2 — Sidebar Manual Multi-Open and Login Dashboard Security Fix
002F.3C.4B — Master Data Selects QA Fix
002F.3C.4C — Final Readiness Review / Master Data Gate
```

The approved master data foundation includes:

```text
Global Lookup Engine
Geography & Locations
Finance Basics
Units & Measurements
Organizations / Branches Geography Integration
Reusable select components
RLS / permissions / audit patterns
BIGINT PK/FK standard
user_profiles audit pattern
```

This phase must build on the existing approved foundation.

---

# 2. Critical User Decision

Sameer does NOT want a generic `persons` table mixing employees, customers, vendors, subcontractors, and contacts.

The user preference is:

```text
Separate clear main tables by business category.
Do not call employees persons.
Do not mix employees with customers/vendors/subcontractors.
```

Approved main entity categories:

```text
customers
vendors
subcontractors
consultants
government_authorities
recruitment_agencies
```

Employees are NOT part of this phase.

Employees will be handled later in:

```text
002F.3F — HR Master Data
```

Therefore, do not create:

```text
persons
employees
employee_contacts
employee_documents
employee_dependents
employee_emergency_contacts
```

inside 002F.3E.

---

# 3. Critical No-Hardcoded-Dropdown Rule

This is mandatory.

```text
No dropdown menu may be hardcoded.
```

All dropdowns must come from one of these sources:

```text
Existing master data tables
New editable master data tables created in this phase
global_lookup_categories
global_lookup_values
```

If a dropdown value is needed, it must be created as editable master data or lookup data.

Do not hardcode arrays such as:

```typescript
["Customer", "Vendor", "Subcontractor"]
["Active", "Inactive", "Suspended"]
["Main Contractor", "EPC Contractor"]
["Local", "International"]
["Cash", "Credit"]
["Primary", "Secondary"]
["Email", "Mobile"]
```

Instead, use:

```text
LookupSelect
existing select components
new select components
new lookup categories
new dedicated master data tables
```

The only acceptable non-lookup UI values are technical booleans or actual system flags:

```text
is_active
is_locked
is_system
is_primary
has_expiry
```

Even status dropdowns should preferably use global lookup categories if already available or new lookup categories if needed.

The implementation plan must clearly list every dropdown field and exactly which table/lookup category/select component it will use.

---

# 4. Current Existing Master Data To Reuse

The plan must reuse the existing approved master data and select components.

## Geography

Tables:

```text
countries
emirates
cities
areas_zones
ports
```

Concept:

```text
emirates = Region / Emirate / Governorate
```

Select components:

```text
CountrySelect
EmirateSelect
CitySelect
AreaZoneSelect
PortSelect
```

## Finance Basics

Tables:

```text
currencies
payment_terms
tax_types
banks
cost_centers
profit_centers
```

Select components:

```text
CurrencySelect
PaymentTermSelect
TaxTypeSelect
BankSelect
CostCenterSelect
ProfitCenterSelect
```

## UOM

Tables:

```text
uom_categories
units_of_measure
uom_conversions
```

Select components:

```text
UomCategorySelect
UnitOfMeasureSelect
UnitByCategorySelect
```

## Global Lookup Engine

Tables:

```text
global_lookup_categories
global_lookup_values
```

Component:

```text
LookupSelect
```

## Organizations / Branches

Tables/components:

```text
owner_companies
branches
OwnerCompanySelect
BranchSelect
```

---

# 5. Phase Scope

## In Scope

Plan the foundation for:

```text
customers
vendors
subcontractors
consultants
government_authorities
recruitment_agencies
```

Plan related child records:

```text
customer_contacts
vendor_contacts
subcontractor_contacts
consultant_contacts
government_authority_contacts
recruitment_agency_contacts

customer_addresses
vendor_addresses
subcontractor_addresses
consultant_addresses
government_authority_addresses
recruitment_agency_addresses

customer_documents
vendor_documents
subcontractor_documents
consultant_documents
government_authority_documents
recruitment_agency_documents

vendor_bank_details
subcontractor_bank_details
consultant_bank_details
recruitment_agency_bank_details
```

Plan optional bank details for customers only if business-justified:

```text
customer_bank_details
```

Plan CRM foundation lookups/classifications:

```text
customer categories
vendor categories
subcontractor categories
consultant categories
government authority categories
recruitment agency categories
industry types
customer segments
lead sources
contact types
address types
document types
communication preference types
relationship / designation types if needed
```

But all classifications must be lookup-driven, not hardcoded.

## Out of Scope

Do not implement:

```text
employees
HR master data
payroll
attendance
leave management
CRM operational module
leads
opportunities
sales pipeline
quotations
sales orders
procurement transactions
purchase orders
invoices
payments
inventory items
fleet assets
workshop jobs
HSE operational modules
DMS operational workflow
scrap trading transactions
waste operation transactions
demolition projects
accounting module
```

This phase is only the shared People / Contacts / CRM Foundation master data.

---

# 6. Required Source Inspection

Before writing the plan, inspect the actual project.

## Reports / Roadmap

Review:

```text
ERP_FULL_IMPLEMENTATION_ROADMAP_PHASE_TRACKER.md
ERP_BASE_002F_3C_4C_FINAL_READINESS_REVIEW_MASTER_DATA_GATE_REPORT.md
ERP_BASE_002F_3C_4B_MASTER_DATA_SELECTS_QA_FIX_REPORT.md
ERP_BASE_002F_3C_2_FINANCE_BASICS_IMPLEMENTATION_REPORT.md
ERP_BASE_002F_3C_1_GEOGRAPHY_FULL_MODULE_AUDIT_AND_VALIDATION_REPORT.md
```

If filenames differ, locate equivalent files.

## Source Folders

Inspect:

```text
src/features/master-data/geography
src/features/master-data/finance-basics
src/features/master-data/uom
src/features/master-data/lookups
src/features/organizations
src/features/branches
src/components/erp/geography
src/components/erp/finance-basics
src/components/erp/uom
src/components/erp/organizations
src/components/erp/lookup-select.tsx
src/server/actions/audit.ts
src/lib/rbac/check.ts
src/types/database.ts
src/components/layout/app-sidebar.tsx
src/app/(protected)/admin
supabase/migrations
```

## Existing Patterns To Reuse

Identify and reuse:

```text
BIGINT PK/FK pattern
user_profiles audit fields
set_updated_at trigger
is_active / is_locked / is_system
deactivated_at / deactivated_by / deactivation_reason
RLS helper functions
permissions and role assignments
logAudit and createAuditDiff
ERPDataTable
ERPDrawerForm
ERPPageHeader
LookupSelect
existing Select components
sidebar navigation pattern
```

Do not invent a new architecture.

---

# 7. Required Output Report Structure

The technical plan must include these sections:

1. Executive Summary
2. Scope and Non-Scope Confirmation
3. Source Inspection Summary
4. Final Entity Category Decision
5. Dedicated Table Decision Matrix
6. Lookup Category Plan
7. Database Schema Plan
8. Contact / Address / Document Strategy
9. Bank Details Strategy
10. CRM Foundation Strategy
11. Master Data Reuse and Dropdown Mapping Matrix
12. RLS / Permission / Role Assignment Plan
13. Audit Logging Plan
14. Server Actions Plan
15. Validation Plan
16. UI / Screen Plan
17. Reusable Select Component Plan
18. Sidebar / Menu Plan
19. Seed Data Plan
20. Data Migration / Legacy Strategy
21. Testing Plan
22. Risk Analysis and Mitigation
23. Acceptance Criteria
24. Future Integration Notes
25. Implementation Phasing Recommendation
26. Final Recommendation

Do not leave any section generic.

Do not say “details to be implemented later” unless a specific item is intentionally deferred with reason.

---

# 8. Final Entity Category Decision

The plan must clearly confirm this final classification:

## Main tables to create in 002F.3E

```text
customers
vendors
subcontractors
consultants
government_authorities
recruitment_agencies
```

## Entity categories that are NOT separate tables

Classify as follows:

```text
main_contractors → customers
transporters → subcontractors
insurance_companies → vendors
lessors → vendors
scrap_buyers → customers
scrap_suppliers → customers
waste_disposal_facilities → government_authorities
service_providers → vendors
partners → customers or subcontractors depending case
```

This classification must be implemented using lookup categories, not separate tables.

Examples:

```text
CUSTOMER_TYPE:
- NORMAL_CUSTOMER
- MAIN_CONTRACTOR
- EPC_CONTRACTOR
- SCRAP_BUYER
- SCRAP_SUPPLIER
- PARTNER_CUSTOMER

VENDOR_TYPE:
- SUPPLIER
- SERVICE_PROVIDER
- INSURANCE_COMPANY
- MATERIAL_SUPPLIER
- EQUIPMENT_SUPPLIER
- LESSOR
- PROPERTY_LESSOR
- VEHICLE_LESSOR
- EQUIPMENT_LESSOR
- CAMP_ACCOMMODATION_LESSOR

SUBCONTRACTOR_TYPE:
- CIVIL_SUBCONTRACTOR
- MANPOWER_SUBCONTRACTOR
- TRANSPORTER
- DEMOLITION_SUBCONTRACTOR
- EQUIPMENT_SUBCONTRACTOR
- PARTNER_SUBCONTRACTOR

GOVERNMENT_AUTHORITY_TYPE:
- MUNICIPALITY
- POLICE
- CIVIL_DEFENSE
- ENVIRONMENTAL_AUTHORITY
- FREE_ZONE_AUTHORITY
- WASTE_DISPOSAL_FACILITY
- PORT_CUSTOMS_AUTHORITY
```

---

# 9. Database Schema Planning Requirements

All tables must use:

```sql
id bigint generated by default as identity primary key
created_at timestamptz not null default now()
created_by bigint references public.user_profiles(id)
updated_at timestamptz not null default now()
updated_by bigint references public.user_profiles(id)
deactivated_at timestamptz
deactivated_by bigint references public.user_profiles(id)
deactivation_reason text
is_active boolean not null default true
is_locked boolean not null default false
is_system boolean not null default false
sort_order integer not null default 0
```

All tables must have:

```text
RLS enabled
permissions
indexes
constraints
audit logging
soft deactivate
system/locked record protection
```

## 9.1 customers table

Plan fields:

```text
id
customer_code
customer_name_en
customer_name_ar
customer_type_code
industry_type_code
customer_segment_code
lead_source_code optional
trn
trade_license_number
license_expiry_date
website_url
primary_email
primary_phone
primary_mobile
country_id
emirate_id
city_id
area_zone_id
address_line_1
address_line_2
po_box
makani_number
currency_id
payment_term_id
tax_type_id
credit_limit optional
credit_days optional
sales_owner_user_profile_id optional
notes
status_code
standard audit/status fields
```

Use existing master data:

```text
country_id → countries
emirate_id → emirates
city_id → cities
area_zone_id → areas_zones
currency_id → currencies
payment_term_id → payment_terms
tax_type_id → tax_types
sales_owner_user_profile_id → user_profiles if needed
```

Use lookups:

```text
customer_type_code → CUSTOMER_TYPES
industry_type_code → INDUSTRY_TYPES
customer_segment_code → CUSTOMER_SEGMENTS
lead_source_code → CRM_LEAD_SOURCES
status_code → PARTY_STATUS_TYPES or CUSTOMER_STATUS_TYPES
```

## 9.2 vendors table

Plan fields:

```text
id
vendor_code
vendor_name_en
vendor_name_ar
vendor_type_code
vendor_category_code
supplier_category_code optional
trn
trade_license_number
license_expiry_date
website_url
primary_email
primary_phone
primary_mobile
country_id
emirate_id
city_id
area_zone_id
address_line_1
address_line_2
po_box
makani_number
currency_id
payment_term_id
tax_type_id
default_bank_id optional
notes
status_code
standard audit/status fields
```

Lookups:

```text
vendor_type_code → VENDOR_TYPES
vendor_category_code → VENDOR_CATEGORIES
supplier_category_code → SUPPLIER_CATEGORIES
status_code → PARTY_STATUS_TYPES or VENDOR_STATUS_TYPES
```

## 9.3 subcontractors table

Plan fields:

```text
id
subcontractor_code
subcontractor_name_en
subcontractor_name_ar
subcontractor_type_code
subcontractor_category_code
trn
trade_license_number
license_expiry_date
website_url
primary_email
primary_phone
primary_mobile
country_id
emirate_id
city_id
area_zone_id
address_line_1
address_line_2
po_box
makani_number
currency_id
payment_term_id
tax_type_id
hse_prequalification_status_code
worker_supply_allowed boolean
equipment_supply_allowed boolean
notes
status_code
standard audit/status fields
```

Lookups:

```text
subcontractor_type_code → SUBCONTRACTOR_TYPES
subcontractor_category_code → SUBCONTRACTOR_CATEGORIES
hse_prequalification_status_code → HSE_PREQUALIFICATION_STATUS_TYPES
status_code → PARTY_STATUS_TYPES or SUBCONTRACTOR_STATUS_TYPES
```

## 9.4 consultants table

Plan fields:

```text
id
consultant_code
consultant_name_en
consultant_name_ar
consultant_type_code
consultant_category_code
trn
trade_license_number
license_expiry_date
website_url
primary_email
primary_phone
primary_mobile
country_id
emirate_id
city_id
area_zone_id
address_line_1
address_line_2
po_box
makani_number
currency_id
payment_term_id
tax_type_id
notes
status_code
standard audit/status fields
```

Lookups:

```text
consultant_type_code → CONSULTANT_TYPES
consultant_category_code → CONSULTANT_CATEGORIES
status_code → PARTY_STATUS_TYPES
```

## 9.5 government_authorities table

Plan fields:

```text
id
authority_code
authority_name_en
authority_name_ar
authority_type_code
authority_category_code
jurisdiction_level_code
website_url
primary_email
primary_phone
primary_mobile
country_id
emirate_id
city_id
area_zone_id
address_line_1
address_line_2
po_box
notes
status_code
standard audit/status fields
```

Lookups:

```text
authority_type_code → GOVERNMENT_AUTHORITY_TYPES
authority_category_code → GOVERNMENT_AUTHORITY_CATEGORIES
jurisdiction_level_code → JURISDICTION_LEVEL_TYPES
status_code → PARTY_STATUS_TYPES
```

## 9.6 recruitment_agencies table

Plan fields:

```text
id
agency_code
agency_name_en
agency_name_ar
agency_type_code
agency_category_code
country_id
emirate_id
city_id
area_zone_id
address_line_1
address_line_2
po_box
primary_email
primary_phone
primary_mobile
website_url
license_number
license_expiry_date
countries_served text[] or child table recommendation
currency_id
payment_term_id
tax_type_id
notes
status_code
standard audit/status fields
```

Lookups:

```text
agency_type_code → RECRUITMENT_AGENCY_TYPES
agency_category_code → RECRUITMENT_AGENCY_CATEGORIES
status_code → PARTY_STATUS_TYPES
```

---

# 10. Contacts Strategy

Because Sameer prefers separation, do not use one generic contacts table.

Plan separate contact tables:

```text
customer_contacts
vendor_contacts
subcontractor_contacts
consultant_contacts
government_authority_contacts
recruitment_agency_contacts
```

Each contact table should include:

```text
id
parent_id FK
contact_code optional
contact_name_en
contact_name_ar
designation
department
contact_type_code
email
mobile
phone
whatsapp
is_primary
is_authorized_signatory
is_decision_maker
is_finance_contact
is_operations_contact
preferred_communication_code
notes
status_code
standard audit/status fields
```

Use lookups:

```text
contact_type_code → CONTACT_TYPES
preferred_communication_code → COMMUNICATION_PREFERENCE_TYPES
status_code → CONTACT_STATUS_TYPES or PARTY_STATUS_TYPES
```

Do not hardcode contact type dropdowns.

---

# 11. Address Strategy

Create separate address tables:

```text
customer_addresses
vendor_addresses
subcontractor_addresses
consultant_addresses
government_authority_addresses
recruitment_agency_addresses
```

Each address table should include:

```text
id
parent_id FK
address_type_code
country_id
emirate_id
city_id
area_zone_id
address_line_1
address_line_2
building_name
street_name
po_box
makani_number
latitude
longitude
is_primary
is_billing_address
is_shipping_address
notes
status_code
standard audit/status fields
```

Use existing Geography selects.

Use lookups:

```text
address_type_code → ADDRESS_TYPES
status_code → ADDRESS_STATUS_TYPES or PARTY_STATUS_TYPES
```

No hardcoded address types.

---

# 12. Document Strategy

Create separate document tables:

```text
customer_documents
vendor_documents
subcontractor_documents
consultant_documents
government_authority_documents
recruitment_agency_documents
```

Each document table should include:

```text
id
parent_id FK
document_type_code
document_name
document_number
issue_date
expiry_date
has_expiry
expiry_reminder_days
file_path or document_id if DMS exists
is_required
is_verified
verified_by
verified_at
notes
status_code
standard audit/status fields
```

Use lookups:

```text
document_type_code → PARTY_DOCUMENT_TYPES or module-specific document type lookup
status_code → DOCUMENT_STATUS_TYPES
```

Document file storage should align with the existing DMS/attachment strategy if one exists.

If DMS is not ready, use a safe placeholder/file path plan and document future DMS integration.

---

# 13. Bank Details Strategy

Create separate bank details tables where needed:

```text
vendor_bank_details
subcontractor_bank_details
consultant_bank_details
recruitment_agency_bank_details
```

Optional:

```text
customer_bank_details
```

Each bank details table should include:

```text
id
parent_id FK
bank_id FK → banks
bank_account_type_code → BANK_ACCOUNT_TYPES
account_name
account_number
iban
swift_code
currency_id FK → currencies
is_primary
is_active
notes
standard audit fields
```

Do not hardcode bank account type dropdowns.

Use:

```text
BankSelect
CurrencySelect
LookupSelect category BANK_ACCOUNT_TYPES
```

---

# 14. Lookup Category Plan

Plan all required lookup categories.

At minimum:

```text
PARTY_STATUS_TYPES
CUSTOMER_TYPES
CUSTOMER_SEGMENTS
VENDOR_TYPES
VENDOR_CATEGORIES
SUPPLIER_CATEGORIES
SUBCONTRACTOR_TYPES
SUBCONTRACTOR_CATEGORIES
CONSULTANT_TYPES
CONSULTANT_CATEGORIES
GOVERNMENT_AUTHORITY_TYPES
GOVERNMENT_AUTHORITY_CATEGORIES
JURISDICTION_LEVEL_TYPES
RECRUITMENT_AGENCY_TYPES
RECRUITMENT_AGENCY_CATEGORIES
INDUSTRY_TYPES
CRM_LEAD_SOURCES
CONTACT_TYPES
COMMUNICATION_PREFERENCE_TYPES
PARTY_DOCUMENT_TYPES
ADDRESS_STATUS_TYPES
CONTACT_STATUS_TYPES
```

Use existing categories where already created.

Do not duplicate existing categories.

For each category, define:

```text
category_code
category_name_en
description
seed values
is_system
is_locked
module_code
sort_order
```

Example seed values:

## PARTY_STATUS_TYPES

```text
ACTIVE
INACTIVE
BLACKLISTED
ON_HOLD
UNDER_REVIEW
```

## CUSTOMER_TYPES

```text
NORMAL_CUSTOMER
MAIN_CONTRACTOR
EPC_CONTRACTOR
SCRAP_BUYER
SCRAP_SUPPLIER
PARTNER_CUSTOMER
```

## VENDOR_TYPES

```text
SUPPLIER
SERVICE_PROVIDER
INSURANCE_COMPANY
MATERIAL_SUPPLIER
EQUIPMENT_SUPPLIER
LESSOR
PROPERTY_LESSOR
VEHICLE_LESSOR
EQUIPMENT_LESSOR
CAMP_ACCOMMODATION_LESSOR
```

## SUBCONTRACTOR_TYPES

```text
CIVIL_SUBCONTRACTOR
MANPOWER_SUBCONTRACTOR
TRANSPORTER
DEMOLITION_SUBCONTRACTOR
EQUIPMENT_SUBCONTRACTOR
PARTNER_SUBCONTRACTOR
```

## CONSULTANT_TYPES

```text
ENGINEERING_CONSULTANT
HSE_CONSULTANT
LEGAL_CONSULTANT
TECHNICAL_CONSULTANT
ENVIRONMENTAL_CONSULTANT
```

## GOVERNMENT_AUTHORITY_TYPES

```text
MUNICIPALITY
POLICE
CIVIL_DEFENSE
ENVIRONMENTAL_AUTHORITY
FREE_ZONE_AUTHORITY
WASTE_DISPOSAL_FACILITY
PORT_CUSTOMS_AUTHORITY
MINISTRY
REGULATOR
```

## RECRUITMENT_AGENCY_TYPES

```text
LOCAL_RECRUITMENT_AGENCY
OVERSEAS_RECRUITMENT_AGENCY
MANPOWER_SUPPLY_AGENCY
EXECUTIVE_SEARCH_AGENCY
```

## CONTACT_TYPES

```text
GENERAL
SALES
PROCUREMENT
FINANCE
OPERATIONS
HSE
TECHNICAL
MANAGEMENT
SITE_CONTACT
AUTHORIZED_SIGNATORY
```

## COMMUNICATION_PREFERENCE_TYPES

```text
EMAIL
PHONE
MOBILE
WHATSAPP
SMS
IN_PERSON
```

## CRM_LEAD_SOURCES

```text
REFERRAL
WEBSITE
EMAIL
PHONE_CALL
SITE_VISIT
TENDER
EXISTING_CUSTOMER
SOCIAL_MEDIA
ADVERTISEMENT
```

These are seeds only; users must be able to add/edit/deactivate lookup values later via Global Lookup Engine.

---

# 15. Master Data Reuse and Dropdown Mapping Matrix

The plan must include a table with columns:

```text
Screen/Form
Field
Dropdown Source
Component
Hardcoded? Yes/No
Notes
```

Every dropdown in 002F.3E must be mapped.

Example:

```text
Customer Form | customer_type_code | global_lookup_values where category=CUSTOMER_TYPES | LookupSelect | No | Editable through Lookup Values
Customer Form | country_id | countries | CountrySelect | No | Existing Geography
Customer Form | currency_id | currencies | CurrencySelect | No | Existing Finance Basics
Vendor Bank Details | bank_account_type_code | BANK_ACCOUNT_TYPES | LookupSelect | No | Existing Finance Basics lookup
```

This section is mandatory.

---

# 16. RLS / Permission Plan

Create permissions:

```text
master_data.parties.view
master_data.parties.manage
master_data.parties.export
master_data.parties.audit_view

master_data.customers.view
master_data.customers.manage
master_data.customers.export
master_data.customers.audit_view

master_data.vendors.view
master_data.vendors.manage
master_data.vendors.export
master_data.vendors.audit_view

master_data.subcontractors.view
master_data.subcontractors.manage
master_data.subcontractors.export
master_data.subcontractors.audit_view

master_data.consultants.view
master_data.consultants.manage
master_data.consultants.export
master_data.consultants.audit_view

master_data.government_authorities.view
master_data.government_authorities.manage
master_data.government_authorities.export
master_data.government_authorities.audit_view

master_data.recruitment_agencies.view
master_data.recruitment_agencies.manage
master_data.recruitment_agencies.export
master_data.recruitment_agencies.audit_view
```

If too many permissions are risky, the plan can recommend a simplified permission group:

```text
master_data.party_master.view
master_data.party_master.manage
master_data.party_master.export
master_data.party_master.audit_view
```

Cursor must recommend the best approach based on existing project permission patterns.

Role assignment recommendation:

```text
system_admin: all
group_admin: view/manage/export/audit_view
company_admin: view/export or manage if approved
branch_admin: view only
normal users: no admin page access by default
```

RLS pattern:

```text
SELECT: active records OR view permission
INSERT: manage permission
UPDATE: manage permission AND (not locked OR system_admin)
DELETE: system_admin only
```

---

# 17. Server Actions Plan

Plan action files.

Preferred:

```text
src/features/master-data/parties/actions.ts
```

Or split if needed:

```text
src/features/master-data/parties/customers-actions.ts
src/features/master-data/parties/vendors-actions.ts
src/features/master-data/parties/subcontractors-actions.ts
...
```

Cursor must recommend the best approach to avoid overly large files.

For each main entity:

```text
getCustomers
getCustomerById
createCustomer
updateCustomer
deleteCustomer
toggleCustomerStatus
toggleCustomerLock
exportCustomers
getActiveCustomersForSelect
```

Repeat for:

```text
vendors
subcontractors
consultants
government_authorities
recruitment_agencies
```

For contacts/addresses/documents/bank details:

```text
getCustomerContacts
createCustomerContact
updateCustomerContact
deleteCustomerContact
...
```

Or recommend staged child-table implementation if full implementation is too large.

All actions must:

```text
validate input
check permission
respect locked records
log audit
revalidate paths
return typed ActionResult
use user_profiles.id for audit fields
```

---

# 18. UI / Screen Plan

Plan menu under:

```text
Master Data
└── People / Contacts / CRM Foundation
    ├── Customers
    ├── Vendors
    ├── Subcontractors
    ├── Consultants
    ├── Government Authorities
    ├── Recruitment Agencies
```

Or if sidebar is too long, place under:

```text
Master Data
└── Parties / Contacts
```

Routes:

```text
/admin/master-data/parties/customers
/admin/master-data/parties/vendors
/admin/master-data/parties/subcontractors
/admin/master-data/parties/consultants
/admin/master-data/parties/government-authorities
/admin/master-data/parties/recruitment-agencies
```

For each screen:

```text
ERPPageHeader
ERPDataTable
Add/Edit/View drawer form
Tabs or sections for:
- Basic Info
- Address
- Contacts
- Documents
- Bank Details where applicable
- Commercial Settings
- Audit Info
```

Do not build transaction pages.

---

# 19. Reusable Select Components Plan

Create reusable select components:

```text
CustomerSelect
VendorSelect
SubcontractorSelect
ConsultantSelect
GovernmentAuthoritySelect
RecruitmentAgencySelect
```

Expected path:

```text
src/components/erp/parties/customer-select.tsx
src/components/erp/parties/vendor-select.tsx
src/components/erp/parties/subcontractor-select.tsx
src/components/erp/parties/consultant-select.tsx
src/components/erp/parties/government-authority-select.tsx
src/components/erp/parties/recruitment-agency-select.tsx
src/components/erp/parties/index.ts
```

Each select must:

```text
load active records
show code + name
support preselected value
support search
support disabled/loading/empty/error state
not expose service role key
respect RLS
```

Future modules must use these selects.

---

# 20. Implementation Phasing Recommendation

This phase is large. Cursor must recommend whether to implement as one phase or split.

Recommended split:

```text
002F.3E.1 — Technical Plan
002F.3E.2 — Database + Lookups + Seeds
002F.3E.3 — Customers + Customer Contacts/Addresses/Documents
002F.3E.4 — Vendors + Vendor Contacts/Addresses/Documents/Bank Details
002F.3E.5 — Subcontractors + Consultants + Government Authorities + Recruitment Agencies
002F.3E.6 — Select Components + Sidebar + QA Readiness
```

But Cursor may suggest safer split after inspection.

The plan must recommend the next implementation prompt name.

---

# 21. Testing Plan

Include tests for:

```text
database tables created
BIGINT PK/FK
RLS enabled
permissions seeded
lookup categories seeded
no hardcoded dropdowns
select components working
add/edit/view customers
add/edit/view vendors
add/edit/view subcontractors
contacts/address/document child records
currency/payment/tax selects
geography cascade selects
bank select and bank account type lookup
typecheck
lint
build
browser QA
system_admin full access
group_admin manage
company_admin view/export
branch_admin view
normal users blocked
audit logs
```

---

# 22. Risk Analysis

Include risks:

```text
too many tables in one phase
dropdowns accidentally hardcoded
customers/vendors/subcontractors confused
same company could be both customer and vendor
future duplicate data
RLS too strict
RLS too open
contacts duplicated across modules
bank details exposed incorrectly
document upload/DMS not ready
license expiry tracking not integrated with notifications yet
```

For each risk:

```text
risk
impact
likelihood
mitigation
```

---

# 23. Acceptance Criteria

Use future checkboxes.

Include:

```text
[ ] Technical plan approved
[ ] Main entity categories confirmed
[ ] No generic persons table
[ ] No employee tables in 002F.3E
[ ] Customers planned
[ ] Vendors planned
[ ] Subcontractors planned
[ ] Consultants planned
[ ] Government authorities planned
[ ] Recruitment agencies planned
[ ] Contacts/address/document strategy planned
[ ] Bank details strategy planned
[ ] Lookup categories planned
[ ] No hardcoded dropdowns
[ ] Existing master data reused
[ ] Permissions/RLS planned
[ ] Audit planned
[ ] Select components planned
[ ] UI pages planned
[ ] Implementation phases recommended
[ ] Next prompt name recommended
```

---

# 24. Future Integration Notes

Explain how 002F.3E will support:

```text
CRM
quotations
customers
vendors
procurement
subcontracting
recruitment
DMS
contracts
approvals
project contacts
site contacts
scrap buyers/suppliers
service providers
insurance companies
lessors
government authority correspondence
```

Also explain:

```text
Employees are handled later in 002F.3F.
```

---

# 25. Final Recommendation

End with one of:

```text
READY FOR SAMEER REVIEW — 002F.3E technical plan complete.
NEEDS USER DECISION — Specific decisions required before implementation.
BLOCKED — Could not inspect source or determine safe plan.
```

If ready, recommend next prompt name, such as:

```text
PROMPT_ERP_BASE_002F_3E_2_IMPLEMENT_DATABASE_LOOKUPS_SEEDS.md
```

or a better split based on your recommendation.

## Final Instruction

Create only:

```text
ERP_BASE_002F_3E_PEOPLE_CONTACTS_CRM_FOUNDATION_TECHNICAL_IMPLEMENTATION_PLAN.md
```

Do not implement.
Do not create migrations.
Do not modify app files.
