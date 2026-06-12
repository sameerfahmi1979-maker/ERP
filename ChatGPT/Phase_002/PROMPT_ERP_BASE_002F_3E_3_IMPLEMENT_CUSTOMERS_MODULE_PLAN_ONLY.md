# PROMPT_ERP_BASE_002F_3E_3_IMPLEMENT_CUSTOMERS_MODULE_PLAN_ONLY

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, notification-engine validation specialist, enterprise ERP solution architect, CRM/customer master-data architect, UAE compliance data reviewer, master-data governance auditor, and senior Next.js/Supabase implementation planner.

## Phase

ERP BASE 002F.3E.3 — Customers Module

## Prompt Purpose

This prompt is for TECHNICAL IMPLEMENTATION PLANNING ONLY.

Do not implement code.

Do not create migrations.

Do not modify database schema.

Do not modify application source files.

Do not create UI screens.

Do not create server actions.

Do not update sidebar.

Do not start vendors, subcontractors, consultants, government authorities, recruitment agencies, or HR.

Your task is to inspect the live Supabase database and existing application code, then generate a deep implementation plan file for the Customers module only.

## Mandatory Live Supabase Verification First

Before writing the plan, connect to the live Supabase project:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

Inspect and verify the current live database schema, existing tables, columns, RLS policies, permissions, helper functions, triggers, and dependencies related to this phase.

Do not assume schema from old plans or reports.

If the live database schema does not match the planned implementation, stop and generate a blocked/correction recommendation in the plan.

The plan must clearly state:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
Live database schema was inspected before planning.
```

If you cannot connect, write:

```text
BLOCKED — Could not connect to Supabase project for live schema verification.
```

and stop after creating the plan file with blocker details.

---

# Required Output File

Create only this file:

```text
ERP_BASE_002F_3E_3_CUSTOMERS_MODULE_TECHNICAL_IMPLEMENTATION_PLAN.md
```

Do not create any other file.

---

# Approved Current Context

The 002F.3E.2 database migration has been applied and verified successfully.

The latest verification report confirmed:

```text
29 / 29 tables created
23 / 23 lookup categories inserted
178 lookup values available
4 / 4 party master permissions created
116 / 116 RLS policies created
RLS enabled on all 29 tables
29 / 29 set_updated_at triggers created
ICV/CICPA fields verified
government_authorities correctly has no ICV/CICPA fields
numbering system correctly deferred
```

This phase must build on the live database state, not assumptions.

---

# Scope of This Planning Phase

Plan the implementation of Customers module only.

In scope:

```text
customers
customer_contacts
customer_addresses
customer_documents placeholder tab only
customer_bank_details
Customer list page
Customer add/edit/view drawer form
Customer child tabs
Customer validation
Customer server actions
Customer table columns
Customer export readiness
Customer audit logging
Customer permission checks
Customer select component planning if needed
```

Out of scope:

```text
vendors
subcontractors
consultants
government_authorities
recruitment_agencies
employees
HR
CRM operational pipeline
leads
opportunities
quotations
sales orders
invoices
purchase orders
projects
full DMS
document upload
document workflow
sidebar dynamic menu builder
branding
numbering system implementation
```

---

# Important User Design Decision

Sameer approved this UI design rule:

```text
One entity = one main form.
Related data = tabs inside the same form.
Contacts = multiple records inside Contacts tab using + Add Contact.
Documents = visible tab only, placeholder until centralized DMS is implemented.
No document upload now.
No file storage now.
No DMS logic now.
```

For Customers:

```text
One Customer form
Tabs inside the Customer form:
- Basic Information
- Address / Location
- Contacts
- Commercial / Finance
- UAE Compliance
- Documents placeholder
- Audit / System Info
```

The Customer form should be a right-side sliding drawer form following existing app global drawer standards.

---

# Critical DMS Decision

Do not implement document upload in this phase.

The Customers form must include a Documents tab, but it must be placeholder only.

The Documents tab should show a clear message such as:

```text
Documents will be managed through the centralized DMS module.
No upload or document storage is implemented in this phase.
```

Do not build:

```text
file upload
file preview
document storage
DMS folders
DMS permissions
document versioning
document approval workflow
OCR
document sharing
```

The existing `customer_documents` table exists as metadata foundation, but the UI should not implement real document upload now.

---

# Required Live Database Verification

Before planning, verify these actual database objects.

## Customer Tables

Verify columns for:

```text
customers
customer_contacts
customer_addresses
customer_documents
customer_bank_details
```

For each table, document:

```text
columns
data types
nullable status
primary key
foreign keys
indexes
RLS policies
triggers
```

## Customers Main Table

Verify exact final column names for all fields, especially ICV/CICPA fields.

Expected or similar fields may include:

```text
customer_code
customer_name_en
customer_name_ar
customer_type_code
industry_type_code
customer_segment_code
lead_source_code
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
credit_limit
credit_days
sales_owner_user_profile_id
icv_certificate_number
icv_status_code
icv_percentage or icv_score_percentage
icv_certificate_issue_date or icv_issue_date
icv_certificate_expiry_date or icv_expiry_date
icv_issued_by or icv_certification_body
icv_certificate_attachment_url or icv_document_path
cicpa_registration_number
notes
status_code
created_at
created_by
updated_at
updated_by
deactivated_at
deactivated_by
deactivation_reason
is_active
is_locked
is_system
sort_order
```

Use actual live database names in the plan.

Do not invent fields.

## Customer Contacts Table

Verify actual columns and plan UI/actions accordingly.

Expected or similar:

```text
customer_id
contact_code
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
audit/system fields
```

## Customer Addresses Table

Verify actual columns and plan UI/actions accordingly.

Expected or similar:

```text
customer_id
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
audit/system fields
```

## Customer Bank Details Table

Verify actual columns and plan UI/actions accordingly.

Expected or similar:

```text
customer_id
bank_id
bank_account_type_code
account_name
account_number
iban
swift_code
currency_id
is_primary
is_active
notes
audit fields
```

Important:

```text
Bank details tables may not have is_locked/is_system.
Do not assume.
Use live schema.
```

## Customer Documents Table

Verify columns, but do not implement upload.

Plan only placeholder UI.

---

# Required Lookup Verification

Verify the following lookup categories and values exist before planning fields.

## Customer Type

Category:

```text
CUSTOMER_TYPES
```

Required values include:

```text
NORMAL_CUSTOMER
MAIN_CONTRACTOR
EPC_CONTRACTOR
GOVERNMENT_CUSTOMER
SEMI_GOVERNMENT_CUSTOMER
UTILITY_COMPANY
WATER_POWER_PLANT
INDUSTRIAL_CUSTOMER
COMMERCIAL_CUSTOMER
SCRAP_BUYER
SCRAP_SUPPLIER
PARTNER_CUSTOMER
```

## Other Customer Lookups

Verify:

```text
CUSTOMER_SEGMENTS
INDUSTRY_TYPES
CRM_LEAD_SOURCES
PARTY_STATUS_TYPES
CONTACT_TYPES
COMMUNICATION_PREFERENCE_TYPES
ADDRESS_TYPES
BANK_ACCOUNT_TYPES
ICV_STATUS_TYPES
```

## Master Data Selects

Verify these tables/components exist or plan to reuse them:

```text
countries / CountrySelect
emirates / EmirateSelect
cities / CitySelect
areas_zones / AreaZoneSelect
currencies / CurrencySelect
payment_terms / PaymentTermSelect
tax_types / TaxTypeSelect
banks / BankSelect
global_lookup_values / LookupSelect
```

If a select component does not exist, plan whether to reuse existing component or create a minimal reusable component.

No hardcoded dropdowns.

---

# Required Permission and RLS Verification

Verify:

```text
master_data.party_master.view
master_data.party_master.manage
master_data.party_master.export
master_data.party_master.audit_view
```

Verify role assignments:

```text
system_admin: view, manage, export, audit_view
group_admin: view, manage, export, audit_view
company_admin: view, export
branch_admin: view only
```

Verify customer tables have RLS policies:

```text
customers: select, insert, update, delete
customer_contacts: select, insert, update, delete
customer_addresses: select, insert, update, delete
customer_documents: select, insert, update, delete
customer_bank_details: select, insert, update, delete
```

---

# Required Existing Code Inspection

Inspect current app patterns before planning implementation.

Review:

```text
src/features/master-data/geography
src/features/master-data/finance-basics
src/features/master-data/uom
src/features/master-data/lookups
src/features/organizations
src/features/branches
src/components/erp/geography
src/components/erp/finance-basics
src/components/erp/lookup-select.tsx
src/components/layout/app-sidebar.tsx
src/components/erp
src/server/actions/audit.ts
src/lib/rbac/check.ts
src/types/database.ts
src/app/(protected)/admin
```

Identify exact current patterns for:

```text
ERPDataTable
right-side drawer form
tabs in drawer form
add/edit/view mode
server actions
validation schemas
audit logging
permission checks
export buttons
table filters
page header
toast handling
delete / deactivate behavior
lock/unlock behavior
```

Do not invent new UI architecture if a pattern already exists.

---

# Customer UI Plan Requirements

The plan must propose a Customer page with:

```text
Customer list/table
Add Customer button
Edit/View/Delete/Deactivate actions
Right-side drawer form
Tabs inside drawer
Nested Contacts tab with + Add Contact
Nested Addresses tab or Address/Location tab
Bank Details tab under Commercial / Finance or as sub-section
Documents placeholder tab
UAE Compliance tab
Audit/System tab
```

## Customer Form Tabs

Plan these tabs:

### Tab 1 — Basic Information

Fields:

```text
customer_code
customer_name_en
customer_name_ar
customer_type_code
industry_type_code
customer_segment_code
lead_source_code
trn
trade_license_number
license_expiry_date
website_url
status_code
notes
```

### Tab 2 — Address / Location

Fields:

```text
country_id
emirate_id
city_id
area_zone_id
address_line_1
address_line_2
po_box
makani_number
```

Use geography cascading selects.

### Tab 3 — Contacts

Behavior:

```text
multiple contacts
+ Add Contact button
inline small drawer or modal inside tab
edit contact
delete/deactivate contact
mark primary contact
show contact list/grid
```

Fields:

```text
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
```

### Tab 4 — Commercial / Finance

Fields:

```text
currency_id
payment_term_id
tax_type_id
credit_limit
credit_days
sales_owner_user_profile_id if implemented safely
customer_bank_details list
+ Add Bank Detail
```

Bank details fields:

```text
bank_id
bank_account_type_code
account_name
account_number
iban
swift_code
currency_id
is_primary
is_active
notes
```

### Tab 5 — UAE Compliance

Fields must follow actual live DB column names.

Include:

```text
ICV certificate number
ICV score/percentage
ICV issue date
ICV expiry date
ICV company type
ICV financial year end date
ICV certification body / issued by
ICV version/category if exists
ICV status
CICPA registration number
```

Use `ICV_STATUS_TYPES` lookup for ICV status.

### Tab 6 — Documents

Placeholder only.

Display:

```text
Documents will be managed through the centralized DMS module.
No upload or document storage is implemented in this phase.
```

Do not implement upload.

### Tab 7 — Audit / System Info

Display read-only:

```text
created_at
created_by
updated_at
updated_by
deactivated_at
deactivated_by
deactivation_reason
is_active
is_locked
is_system
sort_order
```

---

# Server Actions Plan Requirements

Plan server actions only. Do not implement.

Required actions:

```text
getCustomers
getCustomerById
createCustomer
updateCustomer
deactivateCustomer
reactivateCustomer
deleteCustomer if allowed only system_admin
lockCustomer / unlockCustomer if customer table supports is_locked
exportCustomers
```

Child actions:

```text
getCustomerContacts
createCustomerContact
updateCustomerContact
deactivateCustomerContact
deleteCustomerContact if allowed

getCustomerAddresses
createCustomerAddress
updateCustomerAddress
deactivateCustomerAddress
deleteCustomerAddress if allowed

getCustomerBankDetails
createCustomerBankDetail
updateCustomerBankDetail
deactivateCustomerBankDetail
deleteCustomerBankDetail if allowed
```

Documents:

```text
getCustomerDocuments may be read-only or deferred
No upload/create document action in this phase unless only metadata and explicitly approved
```

All actions must:

```text
check permissions
validate with Zod
respect RLS
use user_profiles audit fields
log audit
revalidate relevant paths
return typed ActionResult
```

---

# Validation Plan Requirements

Plan Zod validation for:

```text
Customer main form
Customer contacts
Customer addresses
Customer bank details
```

Validation must use live DB field names.

No hardcoded dropdowns.

Lookup fields must be validated against live lookup categories:

```text
CUSTOMER_TYPES
CUSTOMER_SEGMENTS
INDUSTRY_TYPES
CRM_LEAD_SOURCES
PARTY_STATUS_TYPES
CONTACT_TYPES
COMMUNICATION_PREFERENCE_TYPES
ADDRESS_TYPES
BANK_ACCOUNT_TYPES
ICV_STATUS_TYPES
```

Validate:

```text
TRN format where applicable
email format
phone/mobile length
credit_limit >= 0
credit_days >= 0
ICV percentage/score between 0 and 100
ICV expiry date >= issue date
IBAN length/pattern if safe
SWIFT length/pattern if safe
```

Do not make optional compliance fields required.

---

# Numbering / Customer Code Decision

The numbering system integration was deferred because numbering tables do not exist yet.

Plan must state:

```text
customer_code must be manually entered in 002F.3E.3 or generated by a temporary safe helper only if existing live numbering infrastructure supports it.
Do not create new numbering tables in this phase.
Do not implement separate numbering logic.
```

If existing global numbering tables are available:

```text
global_numbering_generated_references
global_numbering_sequence_states
```

Cursor must inspect and recommend whether they can be reused safely or whether customer_code remains manual until a numbering foundation correction phase.

Do not assume.

---

# Required Plan Structure

The generated plan file must include:

1. Phase title and objective.
2. Supabase live connection confirmation.
3. Live database verification summary.
4. Existing app pattern inspection summary.
5. Scope and non-scope.
6. Customer table schema summary.
7. Customer child table schema summary.
8. Lookup and master-data dependency summary.
9. Permission/RLS verification summary.
10. Customer UI architecture plan.
11. Customer drawer tabs plan.
12. Contacts tab implementation plan.
13. Address/location implementation plan.
14. Commercial/finance and bank details plan.
15. UAE compliance tab plan.
16. Documents placeholder/DMS future plan.
17. Audit/system tab plan.
18. Server actions plan.
19. Validation/Zod plan.
20. Reusable components/selects plan.
21. File/folder implementation plan.
22. Testing plan.
23. Security/RLS/audit plan.
24. Risks and mitigations.
25. Acceptance criteria.
26. Final recommendation.
27. Next implementation prompt name.

---

# Required Next Prompt Recommendation

At the end, recommend the next implementation prompt name:

```text
PROMPT_ERP_BASE_002F_3E_3_IMPLEMENT_CUSTOMERS_MODULE.md
```

Only recommend it if the plan is safe and live schema is verified.

If not safe, recommend a correction prompt instead.

## Final Status Line

End with exactly one:

```text
READY FOR SAMEER REVIEW — 002F.3E.3 Customers Module technical implementation plan complete.
NEEDS CORRECTION — 002F.3E.3 Customers Module requires correction before implementation.
BLOCKED — Could not verify live Supabase schema or required dependencies.
```

## Final Instruction

Create only:

```text
ERP_BASE_002F_3E_3_CUSTOMERS_MODULE_TECHNICAL_IMPLEMENTATION_PLAN.md
```

Do not implement.
Do not modify database.
Do not create UI or server code.
