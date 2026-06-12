# PROMPT_ERP_BASE_002F_3E_3B_CUSTOMER_UX_PERFORMANCE_GLOBAL_FORM_STANDARDS_PLAN

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, notification-engine validation specialist, enterprise ERP UI/UX architect, senior React/Next.js implementation planner, master-data governance auditor, reusable component architect, and SaaS product design-system specialist.

## Phase

ERP BASE 002F.3E.3B — Customer Closure, UX/Performance Enhancement, and Global ERP Form Standards Planning

## Prompt Purpose

This is a DEEP TECHNICAL PLANNING prompt.

Do not implement code.

Do not modify database schema.

Do not create migrations.

Do not modify application source files.

Do not create UI screens.

Do not change Customers module yet.

Your task is to inspect the current live application/database state and generate planning documents that will:

1. Close the Customer module properly by identifying remaining UX/performance gaps.
2. Define a global ERP development guide for all current and future modules.
3. Plan enhancement of Customers module according to the global guide.
4. Plan reusable standards for:
   - required field marking
   - searchable dropdowns
   - modal/dialog size consistency
   - drawer/modal close behavior
   - Save / Save & Close / Cancel buttons
   - loading/performance behavior
   - child record Add/Edit forms
   - documents/DMS placeholder handling

This prompt is intentionally planning-only because the changes affect the full ERP system and should not be implemented blindly in one step.

---

# 1. Mandatory Supabase Connection First

Before planning, connect to the live Supabase project:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

Inspect and verify the current live database schema, Customers tables, customer child tables, global lookup tables, permissions, RLS policies, numbering rules, and relevant master-data tables.

The planning report must clearly state:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
Live database schema was inspected before planning.
```

If you cannot connect, stop and generate the planning files with blocker status:

```text
BLOCKED — Could not connect to Supabase project for live schema verification.
```

---

# 2. Source Files and Reports To Review

Review the following current files/reports before planning:

```text
ERP_BASE_002F_3E_3_CUSTOMERS_MODULE_TECHNICAL_IMPLEMENTATION_PLAN.md
ERP_BASE_002F_3E_3_CUSTOMERS_MODULE_COMPLETE_IMPLEMENTATION_REPORT.md
ERP_BASE_002F_3E_3A_CUSTOMER_CHILD_ADD_EDIT_FORMS_IMPLEMENTATION_REPORT.md
CUSTOMER_CONTACT_AUTO_NUMBERING_IMPLEMENTATION.md
PLAN_CUSTOMER_MODULE_PERFORMANCE_OPTIMIZATION.md
ERP_BASE_002F_3E_2_MIGRATION_VERIFICATION_REPORT_FINAL.md
ERP_BASE_002F_3E_2C_GLOBAL_MASTER_DATA_NUMBERING_IMPLEMENTATION_REPORT.md
```

Also inspect the actual existing source files, especially:

```text
src/app/(protected)/admin/master-data/customers/page.tsx

src/features/master-data/customers/components/customers-table.tsx
src/features/master-data/customers/components/customer-form-drawer.tsx
src/features/master-data/customers/components/customer-contacts-section.tsx
src/features/master-data/customers/components/customer-addresses-section.tsx
src/features/master-data/customers/components/customer-bank-details-section.tsx

src/features/master-data/customers/validation.ts
src/features/master-data/customers/types.ts

src/components/erp/erp-drawer-form.tsx
src/components/erp/lookup-select.tsx
src/components/erp/table/erp-data-table.tsx
src/components/erp/geography
src/components/erp/finance-basics
src/components/ui/dialog.tsx
src/components/ui/drawer.tsx
src/components/ui/select.tsx
src/components/ui/command.tsx if exists

src/server/actions/master-data/customers.ts
src/server/actions/master-data/customer-contacts.ts
src/server/actions/master-data/customer-addresses.ts
src/server/actions/master-data/customer-bank-details.ts

src/components/layout/app-sidebar.tsx
```

Use actual code as source of truth.

---

# 3. Required Output Files

Create exactly these planning files:

```text
ERP_BASE_002F_3E_3B_CUSTOMER_CLOSURE_UX_PERFORMANCE_PLAN.md

ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md

ERP_BASE_002F_3E_3B_NEXT_IMPLEMENTATION_STEPS.md
```

Do not create implementation files.

Do not create migrations.

Do not modify source code.

---

# 4. Current User Observations To Address

Sameer observed and approved these requirements:

## 4.1 Customer child forms are working functionally

Sameer confirmed:

```text
Add works
Edit works
Delete works
```

for the current child forms, but UX enhancements are required before final closure.

## 4.2 Child form visual consistency problem

From current screenshots, the child forms have inconsistent size and layout:

```text
Add Address form shape/width differs from Add Contact and Add Bank Detail
Some forms are narrow/cramped
Some fields are misaligned
Address form has horizontal scrolling
```

This must be treated as a global UI/UX standard problem, not only a Customer issue.

## 4.3 Add/Edit forms close when clicking outside

Current behavior:

```text
Clicking outside the modal/drawer closes the form.
```

This is dangerous in Add/Edit mode because users can lose unsaved data.

Required global behavior:

```text
Add mode: outside-click close disabled
Edit mode: outside-click close disabled
View mode: outside-click close allowed if safe
```

If unsaved changes exist and user clicks Cancel or X:

```text
Show confirmation:
“You have unsaved changes. Do you want to discard them?”
```

## 4.4 Required fields must be clearly marked

Mandatory fields should be visibly marked.

Required standard:

```text
Required labels show red *
Validation message appears below field after validation error
Field border turns red only after validation error
```

Example:

```text
Customer Name *
Customer Type *
Contact Name (English) *
Account Name *
Account Number *
```

## 4.5 Dropdowns must be searchable

All dropdowns/selects must be searchable, especially lists with many records.

Examples:

```text
Countries has 200+ records
Cities can be large
Areas/Zones can be large
Banks can be large
Customers/Vendors/Employees later will be large
Lookup values can grow
```

Users must not scroll through hundreds of records.

Required standard:

```text
Any dropdown with more than 10 records must be searchable.
Search box appears inside dropdown/combobox.
Keyboard navigation must work where existing component supports it.
Optional fields should support clear value.
Loading and empty states must exist.
```

## 4.6 Save / Save & Close / Cancel buttons

Every Add/Edit form should use this footer standard:

```text
Cancel
Save
Save & Close
```

Definitions:

```text
Save:
- saves the record
- keeps the form open
- refreshes the current form data
- shows success message

Save & Close:
- saves the record
- closes the drawer/modal/dialog after successful save
- refreshes parent list/table or affected child list
- shows success message

Cancel:
- closes only if no unsaved changes
- if unsaved changes exist, asks confirmation first
```

View mode:

```text
Close only
No Save buttons
```

This must apply globally to:

```text
main drawer forms
child modals
nested add/edit forms
settings forms
future transaction forms
```

## 4.7 Documents tab standard

Customer Documents tab should be enhanced but still remain placeholder only.

Required standard:

```text
Documents will be managed through the centralized DMS module.

In the future, documents such as trade license, VAT certificate, ICV certificate, CICPA registration, agreements, and approvals will be uploaded and linked here.

No upload or document storage is available in this phase.
```

Optional disabled buttons:

```text
Upload Document — Disabled
View Documents — Disabled
```

With note:

```text
Available after DMS implementation.
```

Do not implement DMS.

## 4.8 Customer drawer loading performance

Customer drawer tab switching/loading delays were observed.

Current plan identified:

```text
Basic Info tab around 1000ms
Contacts tab around 779ms
Addresses tab around 800ms
Bank Details tab around 897ms
UAE Compliance around 947ms
```

Planning must evaluate:

```text
parallel loading child data when drawer opens
parent state caching for contacts/addresses/bank details
child tab components receiving data as props
refresh only affected child list after add/edit/delete
database index review on customer_id
```

## 4.9 Standards must be reusable for all future modules

This is not only for Customers.

The global guide must be reused for future:

```text
Vendors
Subcontractors
Consultants
Government Authorities
Recruitment Agencies
Employees
Assets/Equipment
Branches
Organizations
Procurement
Workshop
HSE
DMS
```

---

# 5. Planning Objectives

## Objective A — Customer Module Closure Review

Review current Customers implementation and identify what remains before closing 002F.3E.3.

Verify:

```text
Customer Add/Edit/View works
Contacts Add/Edit/Delete works
Address Add/Edit/Delete works
Bank Detail Add/Edit/Delete works
Customer code auto-generation works
Documents tab is placeholder only
No DMS implemented
```

Document any gaps.

## Objective B — Customer Child Form UX Standardization Plan

Plan how to standardize:

```text
Add/Edit Contact form
Add/Edit Address form
Add/Edit Bank Detail form
```

Required standards:

```text
same modal width
same header structure
same body layout
same footer button layout
no horizontal scroll
consistent spacing
responsive behavior
required field markings
safe close behavior
```

Recommended child modal sizing:

```text
desktop width: 600px to 720px
max width: 90vw
max height: 85vh
vertical scroll only when needed
no horizontal scroll
```

## Objective C — Required Field / Mandatory Field Standard

Plan a global approach for required field markers.

Must include:

```text
red * after label
required label pattern in reusable form field component if available
validation message below field
red border only after error
consistent wording
```

Also inspect whether the project has reusable:

```text
FormField
Label
Input
ERPFieldGrid
```

and recommend where to implement the standard.

## Objective D — Searchable Dropdown Standard

Inspect current select components:

```text
LookupSelect
CountrySelect
EmirateSelect
CitySelect
AreaZoneSelect
BankSelect
CurrencySelect
PaymentTermSelect
TaxTypeSelect
```

Determine whether they are already searchable.

If not, plan enhancement to a reusable searchable combobox standard.

Must include:

```text
search input
filter by code/name/label
loading state
empty state
clear option for optional fields
keyboard navigation where possible
consistent width
no 200-record scrolling
```

Do not plan separate one-off searchable selects per module.

## Objective E — Global Form Footer Button Standard

Plan the global implementation of:

```text
Cancel
Save
Save & Close
```

For:

```text
main drawer forms
child modal/dialog forms
settings forms
future transaction forms
```

Must include:

```text
Save keeps form open
Save & Close saves and closes
Cancel checks unsaved changes
View mode shows Close only
buttons disabled during submit
parent/child list refresh rules
```

Also define recommended button placement:

```text
Cancel on left or first
Save secondary
Save & Close primary
```

## Objective F — Safe Close / Unsaved Changes Standard

Plan global modal/drawer close behavior:

```text
Add/Edit:
- outside click disabled
- Escape disabled or asks confirmation if dirty
- X close asks confirmation if dirty
- Cancel asks confirmation if dirty

View:
- outside click can close
- Escape can close
```

Must apply to:

```text
ERPDrawerForm
Dialog/modal forms
Child forms
```

## Objective G — Loading / Empty / Error / Success States

Plan global standards for:

```text
initial load
child tab load
saving
deleting
empty list
error messages
success toasts
disabled buttons during submit
```

Customer examples:

```text
No contacts added yet
No additional addresses added yet
No bank details added yet
Save customer first to add contacts
```

## Objective H — Customer Drawer Performance Plan

Use the uploaded performance plan as input.

Plan whether to implement:

```text
parallel loading
parent state cache
child component props
refresh callbacks
database indexes
```

Mandatory: before adding indexes, Cursor must connect to Supabase and verify existing indexes.

Do not blindly create indexes.

Plan should define:

```text
which indexes may already exist
which indexes are missing
what migration would be needed if missing
risk level
testing plan
```

## Objective I — Global Table/List Standard

Plan or update guide for tables/lists:

```text
ERPDataTable usage
search
filters
column visibility
sortable columns
resizable columns if supported
export readiness
action menu
status badges
empty state
loading state
pagination
```

## Objective J — Global Drawer and Tab Standard

Plan:

```text
one main drawer per entity
tabs inside drawer
child records inside tabs
no separate pages for child records
view/edit/add modes
read-only mode
permissions-based actions
```

## Objective K — Documents/DMS Placeholder Standard

Plan global placeholder behavior until DMS is implemented.

Applies to:

```text
Customers
Vendors
Subcontractors
Consultants
Government Authorities
Recruitment Agencies
Employees
Assets
Projects
```

Must clearly state:

```text
No upload until DMS
No storage bucket
No document workflow
No preview/download
Placeholder only
```

## Objective L — Numbering / Code Field Standard

Plan global code field behavior:

```text
auto-generated where numbering rule exists
read-only in Add/Edit/View
Add mode shows Auto-generated on save
Edit mode never regenerates
View mode read-only
no manual entry unless numbering not available and explicitly approved
```

Examples:

```text
CUST-000001
VEND-000001
SUBC-000001
CONS-000001
AUTH-000001
AGCY-000001
```

For child records, include discussion:

```text
Customer Contact currently uses CONT-000001.
For future modules, decide whether to use shared CONT sequence or entity-specific contact sequences.
```

Recommend a standard.

## Objective M — Permission-Based UI Standard

Plan global rules:

```text
no Add/Edit/Delete buttons without manage permission
view-only users see read-only forms
system_admin-only actions clearly restricted
locked/inactive records restrict editing
server actions still enforce permissions
UI never replaces server/RLS security
```

## Objective N — Implementation Breakdown

Because this is large, plan the implementation in multiple parts, not one.

Suggested implementation phases:

```text
002F.3E.3B.1 — Create Global UI/UX Development Guide
002F.3E.3B.2 — Standardize Required Field Markers and Form Footer Buttons
002F.3E.3B.3 — Enhance Shared Searchable Select / Combobox Components
002F.3E.3B.4 — Standardize Customer Child Modal Layout and Safe Close Behavior
002F.3E.3B.5 — Optimize Customer Drawer Loading Performance
002F.3E.3B.6 — Final Customer Module QA and Closure Report
```

Cursor may refine, but must not suggest implementing everything blindly in one step.

---

# 6. Required Global Guide File

Create:

```text
ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
```

The guide must be written as an official ERP development standard.

It must include at least these sections:

1. Purpose and scope.
2. Live Supabase verification rule.
3. Global screen architecture standard.
4. Global drawer form standard.
5. Global tab standard.
6. Global child record Add/Edit standard.
7. Global modal/dialog sizing standard.
8. Global no-horizontal-scroll rule.
9. Global required field standard.
10. Global searchable dropdown standard.
11. Global form footer button standard.
12. Global safe close and unsaved changes standard.
13. Global loading/empty/error/success states.
14. Global table/list standard.
15. Global documents/DMS placeholder standard.
16. Global numbering/code field standard.
17. Global permission-based UI behavior.
18. Global validation/Zod standard.
19. Global audit/system info tab standard.
20. Global performance and caching standard.
21. Global implementation report requirement.
22. Future module reuse instruction.

This file must be suitable to reference in every future Cursor prompt.

---

# 7. Required Customer Plan File

Create:

```text
ERP_BASE_002F_3E_3B_CUSTOMER_CLOSURE_UX_PERFORMANCE_PLAN.md
```

This plan must include:

1. Current Customer module status.
2. Functional checks Sameer confirmed.
3. Remaining UX issues.
4. Child form standardization plan.
5. Required field marker plan.
6. Searchable dropdown plan.
7. Save / Save & Close / Cancel plan.
8. Safe close plan.
9. Documents placeholder improvement plan.
10. Performance optimization plan.
11. Database index review plan.
12. Implementation split.
13. Testing plan.
14. Acceptance criteria.
15. Final recommendation.

---

# 8. Required Next Steps File

Create:

```text
ERP_BASE_002F_3E_3B_NEXT_IMPLEMENTATION_STEPS.md
```

This file must provide a clear step-by-step roadmap after planning approval:

```text
Step 1 — Approve global guide
Step 2 — Implement guide file/reference in project docs
Step 3 — Implement shared required-field standard
Step 4 — Implement shared Save / Save & Close / Cancel standard
Step 5 — Implement searchable selects
Step 6 — Fix Customer child modal layout and safe close
Step 7 — Optimize customer drawer loading
Step 8 — Final QA and close Customers module
```

Include recommended prompt filenames for each step.

---

# 9. What Must Not Be Implemented Now

Do not implement:

```text
code changes
database migrations
indexes
UI components
dropdown changes
customer modal changes
performance changes
DMS
vendor module
next party modules
```

This is planning only.

---

# 10. Required Final Status Lines

Each output file must end with one of these statuses.

For the Customer plan:

```text
READY FOR SAMEER REVIEW — Customer UX/performance closure plan complete.
NEEDS CORRECTION — Customer UX/performance closure plan requires correction.
BLOCKED — Could not verify live schema or current implementation.
```

For the global guide:

```text
READY FOR SAMEER REVIEW — Global ERP UI/UX development guide complete.
NEEDS CORRECTION — Global ERP UI/UX development guide requires correction.
BLOCKED — Could not complete global guide.
```

For next steps:

```text
READY FOR SAMEER REVIEW — Next implementation steps prepared.
NEEDS CORRECTION — Next implementation steps require correction.
BLOCKED — Could not prepare next steps.
```

---

# Final Instruction

Connect to Supabase first.

Inspect live schema and current Customers implementation.

Create only the three planning/guide files.

Do not implement code.

Do not modify database.

Stop after creating the files.
