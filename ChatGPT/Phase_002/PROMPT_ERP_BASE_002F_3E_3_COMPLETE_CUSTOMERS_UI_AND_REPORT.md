# PROMPT_ERP_BASE_002F_3E_3_COMPLETE_CUSTOMERS_UI_AND_REPORT

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, notification-engine validation specialist, enterprise ERP solution architect, CRM/customer master-data architect, UAE compliance data reviewer, master-data governance auditor, senior React/Next.js implementation engineer, and senior Supabase server-actions engineer.

## Phase

ERP BASE 002F.3E.3 — Complete Customers Module UI and Implementation Report

## Prompt Purpose

This is a CORRECTION / CONTINUATION implementation prompt.

The previous Customers module implementation stopped partially.

Cursor reported:

```text
Backend Infrastructure: 100% Complete
Frontend UI: 0% Complete
Overall Progress: 50%
Implementation report file was NOT created
```

This is not acceptable as final output.

Your task is to complete the missing UI layer, verify the backend implementation, and generate the required implementation report.

Do not restart from zero unless required.

Do not remove the backend files already created unless they are incorrect.

Do not implement vendors, subcontractors, consultants, government authorities, recruitment agencies, HR, CRM pipeline, DMS, or document upload.

---

# 1. Mandatory Supabase Connection First

Before continuing implementation, connect to the live Supabase project:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

Inspect and verify the current live database schema, Customers tables, permissions, RLS policies, lookup categories, and CUSTOMER numbering rule.

The final report must clearly state:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
Live database schema was inspected before completing the Customers UI.
```

If you cannot connect, stop and generate only a blocker report:

```text
BLOCKED — Could not connect to Supabase project for live schema verification.
```

---

# 2. Required Source Files To Review

Review these files before continuing:

```text
ERP_BASE_002F_3E_3_CUSTOMERS_MODULE_TECHNICAL_IMPLEMENTATION_PLAN.md
ERP_BASE_002F_3E_2_MIGRATION_VERIFICATION_REPORT_FINAL.md
ERP_BASE_002F_3E_2C_GLOBAL_MASTER_DATA_NUMBERING_IMPLEMENTATION_REPORT.md
```

Also inspect the actual backend files already created in the previous partial implementation.

Expected backend files may include:

```text
src/features/master-data/customers/types.ts
src/features/master-data/customers/validation.ts

src/server/actions/master-data/customers.ts
src/server/actions/master-data/customer-contacts.ts
src/server/actions/master-data/customer-addresses.ts
src/server/actions/master-data/customer-bank-details.ts
```

Verify these files exist and compile.

If their paths differ, document the actual paths.

---

# 3. Current Status To Verify

Verify that backend implementation really includes:

```text
Customer types
Customer validation schemas
Customer CRUD server actions
Customer contact CRUD server actions
Customer address CRUD server actions
Customer bank details CRUD server actions
Auto-generated customer_code using CUSTOMER numbering rule
Permission checks
Audit logging
Primary contact/address/bank logic
No is_locked/is_system usage for customer_bank_details
```

If backend is incomplete or incorrect, fix only what is required.

---

# 4. Required Missing UI Implementation

Implement the Customers UI layer.

## 4.1 Customers Main Page

Create or complete:

```text
src/app/(protected)/admin/master-data/customers/page.tsx
```

If project route structure differs, follow existing app pattern.

The page must include:

```text
Customers page title
Subtitle: Manage customer master data
Add Customer button
Customers data table
Search/filter if ERPDataTable supports it
Export if existing pattern supports it
Row actions:
- View
- Edit
- Deactivate / Reactivate
- Lock / Unlock if backend supports it
- Delete only if system_admin pattern exists
```

## 4.2 Customers Table

Create or complete:

```text
src/features/master-data/customers/components/customers-table.tsx
```

Use existing ERPDataTable pattern.

Default visible columns:

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

Do not show every field by default.

Use column visibility if supported.

## 4.3 Customer Drawer Form

Create or complete:

```text
src/features/master-data/customers/components/customer-form-drawer.tsx
```

The drawer must be one right-side Customer form used for:

```text
Add Customer
Edit Customer
View Customer
```

Use existing ERPDrawerForm pattern.

## Add Mode

```text
customer_code disabled/read-only
show “Auto-generated on save”
editable fields
Save button visible for manage permission
```

## Edit Mode

```text
customer_code read-only
existing data pre-filled
do not regenerate customer_code
Save button visible for manage permission
```

## View Mode

```text
all fields read-only
Close button only
```

---

# 5. Customer Drawer Tabs

Implement exactly these 7 tabs/sections.

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

Dropdowns:

```text
customer_type_code → CUSTOMER_TYPES
industry_type_code → INDUSTRY_TYPES
customer_segment_code → CUSTOMER_SEGMENTS
lead_source_code → CRM_LEAD_SOURCES
status_code → PARTY_STATUS_TYPES
```

Use `LookupSelect`.

No hardcoded dropdown values.

## Tab 2 — Address / Location

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

Use:

```text
CountrySelect
EmirateSelect
CitySelect
AreaZoneSelect
```

Cascading behavior:

```text
changing country clears emirate/city/area
changing emirate clears city/area
changing city clears area
```

Also include Additional Addresses section using `customer_addresses`.

## Tab 3 — Contacts

Create or complete:

```text
customer-contacts-section.tsx
```

Features:

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

Use small modal/dialog or safe nested component inside Customer drawer.

Do not create a separate Contacts page.

## Tab 4 — Commercial / Finance

Fields:

```text
currency_id
payment_term_id
tax_type_id
credit_limit
credit_days
sales_owner_user_profile_id only if safely supported
```

Use existing finance selects if available:

```text
CurrencySelect
PaymentTermSelect
TaxTypeSelect
BankSelect
```

Also create or complete:

```text
customer-bank-details-section.tsx
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

Critical:

```text
customer_bank_details does NOT have is_locked.
customer_bank_details does NOT have is_system.
Do not use those fields anywhere for bank details.
```

Dropdown:

```text
bank_account_type_code → BANK_ACCOUNT_TYPES
```

## Tab 5 — UAE Compliance

Fields:

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
All fields optional
ICV score 0–100
ICV expiry >= issue date
icv_status_code uses ICV_STATUS_TYPES
icv_document_path read-only or hidden because DMS is not ready
```

## Tab 6 — Documents

Placeholder only.

Display:

```text
Documents will be managed through the centralized DMS module.
No upload or document storage is implemented in this phase.
```

Do not implement:

```text
upload
download
preview
storage bucket
customer_documents CRUD UI
DMS integration
document workflow
OCR
```

## Tab 7 — Audit / System Info

Read-only:

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

If audit UI is not stable, show fields only and defer recent audit list.

---

# 6. Sidebar/Menu

Add Customers menu item only if required by existing sidebar pattern.

Suggested location:

```text
Master Data
  Party Master
    Customers
```

Do not add active routes for Vendors/Subcontractors/etc. yet unless already required as hidden placeholders.

Do not implement dynamic sidebar builder.

---

# 7. Required Implementation Rules

Must preserve:

```text
Auto-generated customer_code using CUSTOMER numbering rule
customer_code read-only in UI
No manual customer_code entry
Do not regenerate customer_code on edit
No DMS upload
No vendors/subcontractors/etc.
No new numbering rules
No new database tables
```

Must use:

```text
Existing ERPDataTable
Existing ERPDrawerForm
Existing LookupSelect
Existing geography selects
Existing finance selects if available
Existing server action patterns
Existing audit logging
Existing permission checks
```

---

# 8. Testing Required

After completing UI, run:

```text
npm run typecheck
npm run lint
npm run build
```

If project scripts differ, use actual scripts.

Also perform or document browser/manual tests:

```text
Customers page loads
Add Customer drawer opens
Customer code shows Auto-generated on save
Create customer works and generates CUST-000001 or next available
Edit customer works and code remains read-only
View customer works as read-only
Contacts tab works
Address tab works
Bank details tab works without is_locked/is_system errors
UAE Compliance tab saves
Documents tab shows placeholder only
Permission controls work
Audit logging works
```

If browser testing cannot be performed, state exactly why and list what was verified by build/typecheck.

---

# 9. Required Implementation Report

Create:

```text
ERP_BASE_002F_3E_3_CUSTOMERS_MODULE_IMPLEMENTATION_REPORT.md
```

The report must include:

1. Phase name.
2. Date/time.
3. Supabase project connection confirmation.
4. Live schema verification summary.
5. Backend verification summary.
6. Files created/modified.
7. UI components implemented.
8. Customers page implemented.
9. Customer drawer/tabs implemented.
10. Contacts tab implemented.
11. Address tab implemented.
12. Commercial/Bank details tab implemented.
13. UAE Compliance tab implemented.
14. Documents placeholder confirmation.
15. DMS not implemented confirmation.
16. Customer numbering integration confirmation.
17. Permission/RLS confirmation.
18. Audit logging confirmation.
19. Typecheck result.
20. Lint result.
21. Build result.
22. Browser/manual testing result.
23. Known notes/limitations.
24. Final status.

End with exactly one:

```text
PASS — 002F.3E.3 Customers Module implemented and verified successfully.
PASS WITH NOTES — 002F.3E.3 Customers Module implemented with non-blocking notes.
FAIL — 002F.3E.3 Customers Module requires correction before approval.
BLOCKED — 002F.3E.3 Customers Module could not be completed due to blocking issue.
```

---

# 10. Stop Condition

After completing UI and report generation, stop.

Do not continue to Vendors.

Do not continue to next party module.

Do not start 002F.3E.4.

---

# Final Instruction

Connect to Supabase first.

Verify existing backend and live schema.

Complete missing Customers UI.

Generate implementation report.

Stop.
