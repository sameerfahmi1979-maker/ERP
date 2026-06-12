# PROMPT_ERP_BASE_002F_3E_3_IMPLEMENT_CUSTOMERS_MODULE

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, notification-engine validation specialist, enterprise ERP solution architect, CRM/customer master-data architect, UAE compliance data reviewer, master-data governance auditor, senior React/Next.js implementation engineer, and senior Supabase server-actions engineer.

## Phase

ERP BASE 002F.3E.3 — Implement Customers Module

## Prompt Purpose

This is a controlled IMPLEMENTATION prompt.

You must implement the Customers module only, based on the approved 002F.3E.3 technical implementation plan and the successfully verified database foundation.

Do not implement Vendors.

Do not implement Subcontractors.

Do not implement Consultants.

Do not implement Government Authorities.

Do not implement Recruitment Agencies.

Do not implement Employees / HR.

Do not implement CRM leads/opportunities/quotations.

Do not implement DMS upload.

Do not implement document workflow.

Do not modify the global numbering system except to consume the already configured CUSTOMER numbering rule.

Do not create new database tables.

Do not create new migrations unless a tiny corrective migration is absolutely required and approved by explicit blocker logic.

---

# 1. Mandatory Live Supabase Verification First

Before implementation, connect to the live Supabase project:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

Inspect and verify the current live database schema, existing tables, columns, RLS policies, permissions, helper functions, triggers, lookup categories, and numbering rules related to this phase.

Do not assume schema from old plans or reports.

Use the live database as the source of truth.

The implementation report must clearly state:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
Live database schema was inspected before implementation.
```

If you cannot connect, stop and generate only a blocker report:

```text
BLOCKED — Could not connect to Supabase project for live schema verification.
```

---

# 2. Source Files To Review Before Implementation

Review these files before implementation:

```text
ERP_BASE_002F_3E_2_MIGRATION_VERIFICATION_REPORT_FINAL.md

ERP_BASE_002F_3E_2C_GLOBAL_MASTER_DATA_NUMBERING_IMPLEMENTATION_REPORT.md

ERP_BASE_002F_3E_3_CUSTOMERS_MODULE_TECHNICAL_IMPLEMENTATION_PLAN.md
```

Also inspect the actual existing app code patterns directly, especially:

```text
src/features/master-data/geography
src/features/master-data/finance-basics
src/features/master-data/uom
src/features/master-data/lookups
src/features/organizations
src/features/branches

src/components/erp/erp-drawer-form.tsx
src/components/erp/table/erp-data-table.tsx
src/components/erp/lookup-select.tsx
src/components/erp/geography
src/components/erp/finance-basics

src/server/actions/audit.ts
src/server/actions/numbering.ts
src/lib/rbac/check.ts
src/lib/supabase/server.ts
src/types/database.ts

src/app/(protected)/admin
src/components/layout/app-sidebar.tsx
```

Follow the existing project architecture and patterns.

Do not invent a new UI architecture if an existing ERP drawer/table/server-action pattern exists.

---

# 3. Required Output Files

Implement the Customers module and create one implementation report.

Expected implementation files may include, depending on current project structure:

```text
src/app/(protected)/admin/master-data/customers/page.tsx

src/features/master-data/customers/types.ts
src/features/master-data/customers/validation.ts
src/features/master-data/customers/components/customers-table.tsx
src/features/master-data/customers/components/customer-form-drawer.tsx
src/features/master-data/customers/components/customer-contacts-section.tsx
src/features/master-data/customers/components/customer-addresses-section.tsx
src/features/master-data/customers/components/customer-bank-details-section.tsx
src/features/master-data/customers/components/customer-select.tsx

src/server/actions/master-data/customers.ts
src/server/actions/master-data/customer-contacts.ts
src/server/actions/master-data/customer-addresses.ts
src/server/actions/master-data/customer-bank-details.ts
```

If the project uses different folders, follow the actual existing project structure.

Create this report:

```text
ERP_BASE_002F_3E_3_CUSTOMERS_MODULE_IMPLEMENTATION_REPORT.md
```

---

# 4. Scope

Implement Customers module only.

## In Scope

```text
Customers list screen
Customer add/edit/view right-side drawer form
Customer form tabs
Customer server actions
Customer contacts nested management
Customer addresses nested management
Customer bank details nested management
Documents placeholder tab
UAE Compliance tab
Audit/System Info tab
Customer validation schemas
Permission checks
RLS-safe Supabase queries
Audit logging
Export readiness if existing ERPDataTable supports export
Auto-generated customer_code using CUSTOMER numbering rule
Implementation report
```

## Out of Scope

```text
Vendors module
Subcontractors module
Consultants module
Government Authorities module
Recruitment Agencies module
Employees / HR
CRM leads
Opportunities
Quotations
Sales orders
Invoices
Purchase orders
Projects
DMS upload
Document preview/download
Document versioning
Document approval workflow
Storage buckets
OCR
Notification engine
Branding
Dynamic sidebar builder
New numbering infrastructure
New database tables
New migrations
```

---

# 5. Confirmed UX Design

The Customers module must have:

```text
1 full Customers list screen
1 right-side Customer drawer form
7 tabs inside the drawer
3 small child forms inside tabs:
- Add/Edit Contact
- Add/Edit Address
- Add/Edit Bank Detail
```

Do not create separate pages/screens for:

```text
Customer Contacts
Customer Addresses
Customer Documents
Customer Bank Details
Customer Audit
Customer Compliance
```

Everything belongs inside the Customer drawer.

---

# 6. Screen Count and UI Structure

## Full Screen

Create only one full screen:

```text
/admin/master-data/customers
```

This page must include:

```text
Page title: Customers
Subtitle: Manage customer master data
Add Customer button
Refresh button if existing pattern supports it
Export button if existing pattern supports it
Customers data table
Row actions:
- View
- Edit
- Deactivate / Reactivate
- Lock / Unlock if safely implemented
- Delete only for system_admin if existing pattern allows
```

## Data Table Columns

The default visible columns should be practical and not overloaded:

```text
Customer Code
Customer Name
Customer Type
TRN
Primary Email
Primary Mobile
City / Emirate
ICV Status
Status
Updated At
Actions
```

Use column visibility for optional fields.

Do not put every field into the main table by default.

---

# 7. Customer Drawer Form

Use one right-side drawer form for:

```text
Add Customer
Edit Customer
View Customer
```

Drawer mode behavior:

## Add Mode

```text
customer_code read-only/disabled
show “Auto-generated on save”
all other editable fields based on permissions
Save button visible if user has manage permission
```

## Edit Mode

```text
customer_code read-only
existing data pre-filled
Save button visible if user has manage permission
do not regenerate customer_code
```

## View Mode

```text
all fields read-only
no save button
Close button only
```

Drawer should follow existing ERP drawer standard, preferably around 80% screen width.

---

# 8. Customer Drawer Tabs

Implement 7 tabs/sections inside the drawer.

## Tab 1 — Basic Information

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
primary_email
primary_phone
primary_mobile
status_code
notes
```

Rules:

```text
customer_code is auto-generated and read-only.
customer_name_en is required.
customer_type_code is required.
status_code defaults to ACTIVE.
No hardcoded dropdowns.
```

Dropdown sources:

```text
customer_type_code → CUSTOMER_TYPES
industry_type_code → INDUSTRY_TYPES
customer_segment_code → CUSTOMER_SEGMENTS
lead_source_code → CRM_LEAD_SOURCES
status_code → PARTY_STATUS_TYPES
```

Use `LookupSelect` with `valueField="code"` or the actual prop used by the existing component.

Important: existing lookup schema uses:

```text
value_label_en
value_label_ar
```

Do not use `value_name_en`.

## Tab 2 — Address / Location

Fields on main customer record:

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

Use existing geography selects:

```text
CountrySelect
EmirateSelect
CitySelect
AreaZoneSelect
```

Use cascading behavior:

```text
changing country clears emirate/city/area
changing emirate clears city/area
changing city clears area
```

Also include an **Additional Addresses** section in this tab.

Additional addresses are stored in:

```text
customer_addresses
```

Inside the tab:

```text
+ Add Address
Address list/cards/table
Edit Address
Deactivate/Delete Address according to permission
Primary/Billing/Shipping indicators
```

Do not open a separate Customer Addresses page.

## Tab 3 — Contacts

Contacts are stored in:

```text
customer_contacts
```

Inside the tab:

```text
Contacts list/cards/table
+ Add Contact
Edit Contact
Deactivate/Delete Contact according to permission
Primary Contact indicator
Authorized Signatory indicator
Decision Maker indicator
Finance Contact indicator
Operations Contact indicator
```

Contact form fields:

```text
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
```

Dropdowns:

```text
contact_type_code → CONTACT_TYPES
preferred_communication_code → COMMUNICATION_PREFERENCE_TYPES
status_code → PARTY_STATUS_TYPES
```

Behavior:

```text
+ Add Contact opens a small modal/dialog or nested drawer inside the Customer drawer.
Only one primary contact should be active per customer.
When a new contact is marked primary, unset existing primary contact for that customer.
```

Do not create a separate screen.

## Tab 4 — Commercial / Finance

Main customer fields:

```text
currency_id
payment_term_id
tax_type_id
credit_limit
credit_days
sales_owner_user_profile_id if safely supported
```

Use existing finance selects if present:

```text
CurrencySelect
PaymentTermSelect
TaxTypeSelect
BankSelect
```

If a stable UserSelect does not exist, do not block implementation. Either:

```text
make sales_owner_user_profile_id optional and hidden/deferred
```

or implement a minimal safe user select only if the project already has a user profile select pattern.

Bank details are stored in:

```text
customer_bank_details
```

Inside the tab:

```text
+ Add Bank Detail
Bank details list/cards/table
Edit Bank Detail
Deactivate/Delete Bank Detail according to permission
Primary bank indicator
```

Bank detail fields:

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

Important:

```text
customer_bank_details does NOT have is_locked.
customer_bank_details does NOT have is_system.
Do not use is_locked or is_system in bank detail actions, validation, UI, or RLS assumptions.
```

Dropdowns:

```text
bank_account_type_code → BANK_ACCOUNT_TYPES
bank_id → banks table
currency_id → currencies table
```

Only one primary bank detail should be active per customer.

## Tab 5 — UAE Compliance

Use actual live database field names.

Expected fields:

```text
icv_certificate_number
icv_score_percentage
icv_issue_date
icv_expiry_date
icv_company_type
icv_financial_year_end_date
icv_certification_body
icv_version
icv_status_code
icv_document_path
cicpa_registration_number
```

Rules:

```text
All ICV/CICPA fields are optional.
ICV score must be between 0 and 100 if provided.
ICV expiry date must be on or after issue date if both are provided.
icv_status_code uses ICV_STATUS_TYPES.
icv_document_path is read-only or hidden because DMS is not implemented.
```

## Tab 6 — Documents

Documents tab is placeholder only.

Show a clear message:

```text
Documents will be managed through the centralized DMS module.
No upload or document storage is implemented in this phase.
```

Do not implement:

```text
document upload
document preview
document download
document storage
customer_documents CRUD UI
DMS integration
storage buckets
document workflow
OCR
```

The `customer_documents` table exists, but it must not be used for upload in this phase.

## Tab 7 — Audit / System Info

Read-only display:

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

If audit log UI/pattern is stable:

```text
show recent audit entries if user has master_data.party_master.audit_view
```

If not stable:

```text
show only system fields and defer recent audit list
```

---

# 9. Auto-Generated Customer Code Requirement

The Customer code must use global numbering.

The latest numbering phase configured:

```text
document_type_code = CUSTOMER
format = CUST-000001
```

Customer form behavior:

```text
Add mode:
- customer_code disabled/read-only
- show “Auto-generated on save”
- optional preview using preview_next_reference_number only if safe

Edit mode:
- customer_code read-only
- never regenerate

View mode:
- customer_code read-only
```

Server action behavior:

```text
createCustomer:
1. check master_data.party_master.manage permission
2. validate input excluding customer_code
3. call existing numbering action/function to generate next reference for CUSTOMER
4. insert customers row with generated customer_code
5. log audit
6. revalidate path
```

Do not:

```text
generate customer_code in frontend
use max(customer_code)+1
hardcode manual fallback unless generation fails and action returns error
create new numbering tables
create separate customer numbering logic
```

If generation fails:

```text
do not insert customer
return clear error: Failed to generate customer code
```

---

# 10. Server Actions

Implement server actions following existing project patterns.

Expected action files:

```text
src/server/actions/master-data/customers.ts
src/server/actions/master-data/customer-contacts.ts
src/server/actions/master-data/customer-addresses.ts
src/server/actions/master-data/customer-bank-details.ts
```

If existing project uses another action folder, follow the actual pattern.

## Customer Actions

Implement:

```text
getCustomers
getCustomerById
createCustomer
updateCustomer
deactivateCustomer
reactivateCustomer
lockCustomer
unlockCustomer
deleteCustomer only if system_admin and current pattern allows
exportCustomers if export pattern exists
```

## Contact Actions

Implement:

```text
getCustomerContacts
createCustomerContact
updateCustomerContact
deactivateCustomerContact
deleteCustomerContact if allowed
```

## Address Actions

Implement:

```text
getCustomerAddresses
createCustomerAddress
updateCustomerAddress
deactivateCustomerAddress
deleteCustomerAddress if allowed
```

## Bank Detail Actions

Implement:

```text
getCustomerBankDetails
createCustomerBankDetail
updateCustomerBankDetail
deactivateCustomerBankDetail
deleteCustomerBankDetail if allowed
```

## Document Actions

Do not implement document create/upload actions.

Optional read-only `getCustomerDocuments` may be omitted because Documents tab is placeholder only.

---

# 11. Required Server Action Rules

All actions must:

```text
use live schema field names
use RLS-safe Supabase client
check permissions before mutation
validate input with Zod
respect is_locked/is_system only for tables that actually have those columns
set created_by / updated_by where supported
log audit for mutations
revalidate relevant paths
return typed ActionResult
handle Supabase errors clearly
```

Permission rules:

```text
view → master_data.party_master.view
manage → master_data.party_master.manage
export → master_data.party_master.export
audit view → master_data.party_master.audit_view
delete → system_admin only if implemented
```

Bank details rule:

```text
Do not use is_locked/is_system for customer_bank_details.
```

---

# 12. Validation / Zod

Create validation schemas for:

```text
Customer main form
Customer contact form
Customer address form
Customer bank detail form
```

Use actual live DB fields.

Validate:

```text
customer_name_en required
customer_type_code required
status_code default ACTIVE
TRN 15 digits if provided
email format
website URL if provided
credit_limit >= 0
credit_days >= 0
ICV score 0–100
ICV expiry date >= issue date
at least one contact method for contact if required by UX
IBAN format only if safe, otherwise keep non-blocking
SWIFT 8 or 11 characters only if safe, otherwise keep non-blocking
```

Do not make optional compliance fields required.

No hardcoded dropdown values.

Validate lookup codes against live lookup categories if existing helper pattern exists. If not, use `LookupSelect` UI plus server-side safe checks where practical and document any limitations.

---

# 13. Types

Create customer-related TypeScript types based on live schema.

Expected types:

```text
Customer
CustomerContact
CustomerAddress
CustomerBankDetail
CreateCustomerInput
UpdateCustomerInput
CreateCustomerContactInput
UpdateCustomerContactInput
CreateCustomerAddressInput
UpdateCustomerAddressInput
CreateCustomerBankDetailInput
UpdateCustomerBankDetailInput
ActionResult<T>
```

If `src/types/database.ts` is generated from Supabase, prefer using generated row types.

---

# 14. UI Components

Implement:

```text
CustomersTable
CustomerFormDrawer
CustomerContactsSection
CustomerAddressesSection
CustomerBankDetailsSection
```

Optional:

```text
CustomerSelect
```

If implementing CustomerSelect, keep it simple and reusable for future modules:

```text
loads active customers
shows customer_code + customer_name_en
supports search if existing select pattern supports it
```

But do not delay main implementation for CustomerSelect.

---

# 15. Child Form UX

Use small modal/dialog or nested mini-drawer from inside the Customer drawer.

Recommended:

```text
Use small modal/dialog for Add/Edit Contact
Use small modal/dialog for Add/Edit Address
Use small modal/dialog for Add/Edit Bank Detail
```

Avoid opening another full screen.

Avoid creating a second large drawer over the main drawer unless the project already uses that pattern safely.

---

# 16. Sidebar/Menu

Add Customers menu item only if the current sidebar/static menu requires it and this is the standard pattern.

Do not implement dynamic sidebar builder.

Suggested location:

```text
Master Data
  Party Master
    Customers
```

If Party Master group does not exist, add it carefully using existing sidebar pattern.

Do not add Vendors/Subcontractors menu items yet unless placeholders already exist and must be kept hidden.

---

# 17. Testing Requirements

After implementation, run:

```text
npm run typecheck
npm run lint
npm run build
```

If scripts differ, use actual project scripts.

Run browser/manual tests:

## Customers Page

```text
Page loads
Table displays
Add Customer opens drawer
Edit Customer opens drawer
View Customer opens read-only drawer
Deactivate/Reactivate works
Lock/Unlock works if implemented
Export works if implemented
```

## Customer Creation

```text
customer_code auto-generated as CUST-000001 or next available
customer_code read-only in UI
Customer saved successfully
Audit log created
RLS does not block valid user
```

## Contacts

```text
Add contact
Edit contact
Deactivate/delete contact
Primary contact logic
Required validation
```

## Addresses

```text
Add address
Edit address
Deactivate/delete address
Cascading geography selects
Primary/billing/shipping flags
```

## Bank Details

```text
Add bank detail
Edit bank detail
Deactivate/delete bank detail
Primary bank logic
No is_locked/is_system errors
```

## UAE Compliance

```text
ICV fields save
ICV score validation
ICV date validation
ICV status lookup works
CICPA field saves
```

## Documents

```text
Documents tab shows placeholder only
No upload button
No upload action
No DMS logic
```

## Permissions

```text
view-only user cannot edit
manage user can create/edit
export button hidden or blocked without export permission
audit tab respects audit permission if implemented
```

---

# 18. Required Implementation Report

Create:

```text
ERP_BASE_002F_3E_3_CUSTOMERS_MODULE_IMPLEMENTATION_REPORT.md
```

Report must include:

1. Phase name.
2. Date/time.
3. Supabase project connection confirmation.
4. Live schema verification summary.
5. Files created/modified.
6. Components implemented.
7. Server actions implemented.
8. Validation schemas implemented.
9. Customer numbering integration result.
10. UI tabs implemented.
11. Contacts implementation summary.
12. Addresses implementation summary.
13. Bank details implementation summary.
14. Documents placeholder confirmation.
15. DMS not implemented confirmation.
16. Permission/RLS confirmation.
17. Audit logging confirmation.
18. Typecheck result.
19. Lint result.
20. Build result.
21. Browser/manual testing result.
22. Known notes/limitations.
23. Final status.

End with exactly one:

```text
PASS — 002F.3E.3 Customers Module implemented and verified successfully.
PASS WITH NOTES — 002F.3E.3 Customers Module implemented with non-blocking notes.
FAIL — 002F.3E.3 Customers Module requires correction before approval.
BLOCKED — 002F.3E.3 Customers Module could not be implemented due to blocking issue.
```

---

# 19. Stop Condition

After implementation and report generation, stop.

Do not continue to Vendors.

Do not continue to next party module.

Do not start 002F.3E.4.

---

# Final Instruction

Connect to Supabase first.

Verify live schema.

Implement only Customers module.

Generate implementation report.

Stop.
