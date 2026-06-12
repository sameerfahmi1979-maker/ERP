# PROMPT_ERP_BASE_002F_3E_3A_COMPLETE_CUSTOMER_CHILD_ADD_EDIT_FORMS

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, notification-engine validation specialist, enterprise ERP UI/UX engineer, senior React/Next.js implementation engineer, customer master-data architect, and Supabase server-actions validation specialist.

## Phase

ERP BASE 002F.3E.3A — Complete Customer Child Add/Edit Forms

## Prompt Purpose

This is a focused correction / completion implementation prompt.

The Customers module was implemented in Phase 002F.3E.3, but the implementation report confirmed that the nested child forms were not fully completed:

```text
Contacts tab: list + delete available, but Add/Edit disabled
Addresses tab: list + delete available, but Add/Edit disabled
Bank Details tab: list + delete available, but Add/Edit disabled
```

This is not acceptable for final Customer module closure.

Your task is to complete Add/Edit UI functionality for:

```text
customer_contacts
customer_addresses
customer_bank_details
```

Do not rebuild the Customers module from zero.

Do not remove the backend files already created unless they are incorrect.

Do not implement vendors, subcontractors, consultants, government authorities, recruitment agencies, HR, CRM pipeline, DMS, or document upload.

---

# 1. Mandatory Live Supabase Verification First

Before implementation, connect to the live Supabase project:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

Inspect and verify the current live database schema for:

```text
customers
customer_contacts
customer_addresses
customer_bank_details
```

Also verify:

```text
RLS policies
permissions
lookup categories
existing customer module files
server actions already created
```

The implementation report must clearly state:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
Live database schema was inspected before completing Customer child Add/Edit forms.
```

If you cannot connect, stop and create a blocker report:

```text
BLOCKED — Could not connect to Supabase project for live schema verification.
```

---

# 2. Source Files To Review Before Implementation

Review these existing reports/files:

```text
ERP_BASE_002F_3E_3_CUSTOMERS_MODULE_TECHNICAL_IMPLEMENTATION_PLAN.md
ERP_BASE_002F_3E_3_CUSTOMERS_MODULE_COMPLETE_IMPLEMENTATION_REPORT.md
ERP_BASE_002F_3E_2_MIGRATION_VERIFICATION_REPORT_FINAL.md
ERP_BASE_002F_3E_2C_GLOBAL_MASTER_DATA_NUMBERING_IMPLEMENTATION_REPORT.md
```

Inspect existing implementation files, including but not limited to:

```text
src/app/(protected)/admin/master-data/customers/page.tsx

src/features/master-data/customers/types.ts
src/features/master-data/customers/validation.ts
src/features/master-data/customers/components/customers-table.tsx
src/features/master-data/customers/components/customer-form-drawer.tsx
src/features/master-data/customers/components/customer-contacts-section.tsx
src/features/master-data/customers/components/customer-addresses-section.tsx
src/features/master-data/customers/components/customer-bank-details-section.tsx

src/server/actions/master-data/customers.ts
src/server/actions/master-data/customer-contacts.ts
src/server/actions/master-data/customer-addresses.ts
src/server/actions/master-data/customer-bank-details.ts
```

Use existing project patterns for dialogs, forms, validation, toasts, and error handling.

---

# 3. Required Output

Complete the missing UI functionality and create this report:

```text
ERP_BASE_002F_3E_3A_CUSTOMER_CHILD_ADD_EDIT_FORMS_IMPLEMENTATION_REPORT.md
```

Do not create a database migration unless absolutely necessary due to a verified blocker.

---

# 4. Scope

## In Scope

```text
Enable + Add Contact
Enable Edit Contact
Enable + Add Address
Enable Edit Address
Enable + Add Bank Detail
Enable Edit Bank Detail
Refresh child lists after create/update/delete
Show validation errors
Use existing server actions
Use existing Zod schemas
Use existing LookupSelect and master-data selects
Respect permissions
Respect RLS
Create implementation report
Run typecheck/lint/build
```

## Out of Scope

```text
Customer main form redesign
Customer table redesign
Vendors
Subcontractors
Consultants
Government Authorities
Recruitment Agencies
DMS upload
Document tab CRUD
Customer_documents upload/actions
New database tables
New numbering rules
CRM pipeline
Sales orders
Invoices
```

---

# 5. Required UI/UX Pattern

Do not create separate pages for child records.

Use one of these safe patterns based on existing project style:

## Preferred Pattern

Use a small modal/dialog inside the Customer drawer for:

```text
Add/Edit Contact
Add/Edit Address
Add/Edit Bank Detail
```

## Alternative Pattern

Use a small nested mini-drawer only if existing project already supports nested drawers safely.

Avoid opening a second full 80% drawer on top of the Customer drawer unless this is an existing approved pattern.

---

# 6. Contacts Add/Edit Requirements

Update or complete:

```text
src/features/master-data/customers/components/customer-contacts-section.tsx
```

## Required Behavior

Inside Contacts tab:

```text
+ Add Contact button enabled when customer exists and user has manage permission
Edit Contact button enabled when user has manage permission and record is editable
Delete/Deactivate remains working
After save, contact list refreshes
Primary Contact badge updates correctly
```

## Required Contact Form Fields

Use actual live schema. Expected fields:

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

## Dropdowns

Use `LookupSelect`, not hardcoded dropdowns:

```text
contact_type_code → CONTACT_TYPES
preferred_communication_code → COMMUNICATION_PREFERENCE_TYPES
status_code → PARTY_STATUS_TYPES
```

## Validation

Use existing customer contact Zod schema if available.

Validate:

```text
contact_name_en required
contact_code required if current backend requires it
email format if provided
at least one contact method if existing validation requires it
status_code default ACTIVE
```

## Primary Contact Logic

Use existing server action logic.

When `is_primary = true`, existing primary contact for the same customer should be unset by server action.

Do not implement primary logic only in frontend.

---

# 7. Addresses Add/Edit Requirements

Update or complete:

```text
src/features/master-data/customers/components/customer-addresses-section.tsx
```

## Required Behavior

Inside Address / Location tab:

```text
+ Add Address button enabled when customer exists and user has manage permission
Edit Address button enabled when user has manage permission and record is editable
Delete/Deactivate remains working
After save, address list refreshes
Primary/Billing/Shipping badges update correctly
```

## Required Address Form Fields

Use actual live schema. Expected fields:

```text
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
```

## Dropdowns / Selects

Use existing master-data selects:

```text
address_type_code → ADDRESS_TYPES via LookupSelect
country_id → CountrySelect
emirate_id → EmirateSelect
city_id → CitySelect
area_zone_id → AreaZoneSelect
status_code → PARTY_STATUS_TYPES via LookupSelect
```

## Cascading Behavior

Inside address add/edit form:

```text
changing country clears emirate/city/area
changing emirate clears city/area
changing city clears area
```

## Validation

Use existing customer address Zod schema if available.

Validate:

```text
latitude between -90 and 90 if provided
longitude between -180 and 180 if provided
status_code default ACTIVE
```

Do not require address fields that are optional in DB unless approved.

## Primary Address Logic

Use existing server action logic.

When `is_primary = true`, existing primary address for the same customer should be unset by server action.

---

# 8. Bank Details Add/Edit Requirements

Update or complete:

```text
src/features/master-data/customers/components/customer-bank-details-section.tsx
```

## Required Behavior

Inside Commercial / Finance tab:

```text
+ Add Bank Detail button enabled when customer exists and user has manage permission
Edit Bank Detail button enabled when user has manage permission
Delete/Deactivate remains working
After save, bank details list refreshes
Primary bank badge updates correctly
```

## Required Bank Detail Form Fields

Use actual live schema. Expected fields:

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

## Critical Schema Rule

The `customer_bank_details` table does NOT have:

```text
is_locked
is_system
```

Do not use these fields anywhere in:

```text
UI
validation
server actions
type definitions
edit/delete logic
condition checks
```

## Dropdowns / Selects

Use:

```text
bank_id → BankSelect or existing banks select
bank_account_type_code → BANK_ACCOUNT_TYPES via LookupSelect
currency_id → CurrencySelect
```

## Validation

Use existing customer bank detail Zod schema if available.

Validate:

```text
account_name required
account_number required
IBAN format only if existing validation already supports it safely
SWIFT 8 or 11 characters only if existing validation already supports it safely
status handled by is_active
```

Do not overblock international bank data if validation may be too strict. If uncertain, keep IBAN/SWIFT validation non-blocking or document limitation.

## Primary Bank Logic

Use existing server action logic.

When `is_primary = true`, existing primary bank detail for the same customer should be unset by server action.

---

# 9. Permissions and Modes

Buttons and forms must respect mode and permissions.

## In View Mode

```text
No Add buttons
No Edit buttons
No Delete buttons
Show read-only child records only
```

## In Add Customer Mode

Customer does not exist yet.

```text
Contacts tab: show “Save customer first to add contacts.”
Addresses additional section: show “Save customer first to add additional addresses.”
Bank details section: show “Save customer first to add bank details.”
```

## In Edit Mode

If user has `master_data.party_master.manage`:

```text
Add/Edit/Delete child actions enabled
```

If user lacks manage permission:

```text
read-only child records only
```

## In Deactivated / Locked Customer

Follow existing customer rules:

```text
If customer is locked and user is not system_admin, child add/edit should be disabled.
If customer is inactive, child add/edit should be disabled unless existing UX allows reactivation/edit.
```

Do not bypass RLS or server-side permission checks.

---

# 10. State Refresh and UX

After every successful child create/update/delete/deactivate:

```text
refresh the relevant child list
show success toast
close modal/dialog
keep the parent Customer drawer open
do not reload the whole page unless necessary
```

On error:

```text
show clear error toast/message
do not close form
preserve entered values
```

Loading states:

```text
show saving/loading indicator on Save button
disable Save while submitting
show list loading while fetching child records
```

Empty states:

```text
No contacts added yet.
No additional addresses added yet.
No bank details added yet.
```

---

# 11. Testing Requirements

After implementation, run:

```text
npm run typecheck
npm run lint
npm run build
```

If scripts differ, use actual project scripts.

Manual/browser tests to perform or document:

```text
Open Customers page
Open existing customer in Edit mode
Contacts tab:
- Add contact
- Edit contact
- Mark contact as primary
- Delete/deactivate contact
Address tab:
- Add address
- Edit address
- Cascading geography works
- Mark as primary/billing/shipping
- Delete/deactivate address
Commercial tab:
- Add bank detail
- Edit bank detail
- Mark as primary
- Delete/deactivate bank detail
View mode:
- child action buttons hidden/disabled
Documents tab remains placeholder only
No is_locked/is_system errors in bank details
Typecheck passes
Build passes
```

If no customer record exists, create one using the UI first, then test child forms.

---

# 12. Required Implementation Report

Create:

```text
ERP_BASE_002F_3E_3A_CUSTOMER_CHILD_ADD_EDIT_FORMS_IMPLEMENTATION_REPORT.md
```

Report must include:

1. Phase name.
2. Date/time.
3. Supabase project connection confirmation.
4. Live schema verification summary.
5. Files inspected.
6. Files modified.
7. Contact Add/Edit implementation summary.
8. Address Add/Edit implementation summary.
9. Bank Detail Add/Edit implementation summary.
10. Permission/mode behavior summary.
11. Documents tab unchanged confirmation.
12. DMS not implemented confirmation.
13. No new database tables/migrations confirmation.
14. Typecheck result.
15. Lint result.
16. Build result.
17. Manual/browser testing result.
18. Known notes/limitations.
19. Final status.

End with exactly one:

```text
PASS — 002F.3E.3A Customer child Add/Edit forms implemented and verified successfully.
PASS WITH NOTES — 002F.3E.3A Customer child Add/Edit forms implemented with non-blocking notes.
FAIL — 002F.3E.3A Customer child Add/Edit forms require correction before approval.
BLOCKED — 002F.3E.3A could not be completed due to blocking issue.
```

---

# 13. Stop Condition

After completing child Add/Edit forms and generating the report, stop.

Do not start vendors.

Do not start any other party module.

Do not implement DMS.

Do not continue to 002F.3E.4.

---

# Final Instruction

Connect to Supabase first.

Verify live schema.

Complete only Customer child Add/Edit forms.

Generate implementation report.

Stop.
