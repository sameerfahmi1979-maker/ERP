# PROMPT_ERP_BASE_002F_3E_3B_3B_GLOBAL_REQUIRED_FIELDS_AND_FOOTER_AUDIT_PLAN

Act as a senior ERP QA lead, Supabase/PostgreSQL schema auditor, Next.js runtime tester, SaaS security tester, enterprise ERP UI/UX architect, reusable form-component architect, accessibility reviewer, master-data governance auditor, senior React/Next.js engineer, and Cursor implementation planner.

## Phase

ERP BASE 002F.3E.3B.3B — Global Required Fields and Footer Audit Plan

## Prompt Purpose

This is a PLANNING / AUDIT-ONLY prompt.

Do not implement code.
Do not modify UI components.
Do not modify forms.
Do not modify database schema.
Do not create migrations.
Do not apply SQL.
Do not continue to implementation.

Your task is to audit all existing ERP forms/modules and produce a detailed rollout plan for applying the global required-field marker standard and global form footer standard across all current and future modules.

This follows:

```text
ERP BASE 002F.3E.3B.3 — Required Field Markers and Form Footer Standard
```

Current confirmed state:

```text
Customer module has already received the first implementation of:
- RequiredLabel reusable component
- ERPFormFooter reusable component
- Required markers in Customer main form
- Required markers in Customer Contacts dialog
- Required markers in Customer Bank Details dialog
- Customer Addresses reviewed as having no required fields, if that is still true from current validation/schema
```

Now we need a global audit before rolling this standard to other modules.

---

# 1. Mandatory Standards To Read First

Before auditing, read and follow:

```text
docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md
docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
```

Also review these recent files/reports:

```text
ERP_BASE_002F_3E_3B_3_REQUIRED_FIELD_MARKERS_AND_FORM_FOOTER_IMPLEMENTATION_REPORT.md
ERP_BASE_002F_3E_3B_2D_CUSTOMER_FORM_FINAL_QA_REPORT.md
ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_UIUX_TECHNICAL_PLAN.md
ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_RISK_IMPACT_REVIEW.md
ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_NEXT_IMPLEMENTATION_PROMPT_PLAN.md
```

If any report file is missing, continue using current source code and document the missing file.

The audit report must confirm which standards and reports were read.

---

# 2. Mandatory Supabase Connection First

Before auditing, connect to the live Supabase project:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

Use live schema as the main source of truth.

Inspect all currently implemented modules/tables/forms that exist in the app.

At minimum, inspect relevant tables in these areas if they exist:

```text
organizations
branches
roles
permissions
user_roles
role_permissions

global_lookup_categories
global_lookup_values

countries
emirates
cities
areas_zones
ports

currencies
payment_terms
tax_types
banks
cost_centers
profit_centers

uom_categories
units_of_measure

customers
customer_contacts
customer_addresses
customer_bank_details

vendors
subcontractors
consultants
government_authorities
recruitment_agencies
```

Also inspect current code to identify forms/components that are implemented even if their related module is incomplete.

The audit report must include:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
Live database schema was inspected before creating the Global Required Fields and Footer Audit Plan.
```

If Supabase connection fails, stop and create a BLOCKED audit report.

Do not guess required fields without live verification.

---

# 3. Source of Truth Rules

Use this priority:

```text
1. Live Supabase schema
2. Current source code
3. Current Zod validation schemas
4. Current server actions
5. Approved global standards docs
6. Recent implementation reports
```

Important required-field logic:

```text
DB NOT NULL fields used in forms are required unless they are system/generated fields.
Zod-required fields are business-required and must show required markers.
Server-action required fields are business-required and must show required markers.
Auto-generated code fields should show "Auto-generated on save" and read-only behavior; do not mark them like normal required user input unless the existing UI standard says so.
System fields such as id, created_at, updated_at, created_by, updated_by are not user-facing required fields.
If DB allows null but Zod/server action requires it, treat it as required in UI.
If DB NOT NULL is handled by default value or server logic, document it and do not force a user-facing required marker unless the user must input it.
```

---

# 4. Files / Folders To Inspect

Inspect the project structure to find existing forms.

At minimum, inspect:

```text
src/components/erp/required-label.tsx
src/components/erp/erp-form-footer.tsx
src/components/ui/label.tsx
src/components/ui/input.tsx
src/components/ui/textarea.tsx
src/components/ui/button.tsx
src/components/ui/dialog.tsx
src/components/ui/sheet.tsx

src/features/
src/features/master-data/
src/features/master-data/customers/
src/features/master-data/customers/components/
src/features/master-data/customers/validation.ts
src/features/master-data/customers/types.ts

src/app/
src/app/admin/
src/app/admin/master-data/
src/app/admin/organization/
src/app/admin/settings/
src/app/admin/users/
```

Also inspect any current form drawers/dialogs, including:

```text
*form*.tsx
*drawer*.tsx
*dialog*.tsx
*modal*.tsx
*section*.tsx
```

Do not invent paths. If paths differ, discover actual paths and document them.

---

# 5. Audit Scope

## In Scope

Audit current app forms for:

```text
required field markers
missing required red asterisks
fields marked required incorrectly
required fields without validation display
forms that do not use RequiredLabel / required label standard
forms that do not use ERPFormFooter / footer standard
forms missing Cancel / Save / Save & Close
forms showing Save buttons in View mode
forms where View mode should show Close only
child dialogs that need footer standard
modules not yet ready for rollout
```

## Out of Scope

```text
implementing required markers
implementing form footers
safe close / unsaved changes behavior
outside-click behavior
global search
AI
DMS
database migration
SQL execution
Vendors implementation if not yet built
new module creation
```

---

# 6. Required Output Files

Create exactly these planning/audit files:

```text
ERP_BASE_002F_3E_3B_3B_GLOBAL_REQUIRED_FIELDS_AND_FOOTER_AUDIT_PLAN.md
ERP_BASE_002F_3E_3B_3B_REQUIRED_FIELDS_MODULE_MATRIX.md
ERP_BASE_002F_3E_3B_3B_FOOTER_STANDARD_ROLLOUT_MATRIX.md
ERP_BASE_002F_3E_3B_3B_NEXT_IMPLEMENTATION_PROMPT_PLAN.md
```

Do not create implementation files.

Do not modify source code.

---

# 7. Output File 1 — Global Audit Plan Requirements

Create:

```text
ERP_BASE_002F_3E_3B_3B_GLOBAL_REQUIRED_FIELDS_AND_FOOTER_AUDIT_PLAN.md
```

This file must include:

## 7.1 Phase Information

```text
phase name
purpose
planning-only status
Supabase connection confirmation
standards files reviewed
reports reviewed
source code inspected
```

## 7.2 Current Reusable Component Status

Document the current state of:

```text
RequiredLabel
ERPFormFooter
Label component
Customer implementation
```

Include:

```text
file path
current props
usage examples found
whether component is reusable globally
whether component needs correction before rollout
```

## 7.3 Existing Form Inventory

List every current form/drawer/dialog discovered.

For each:

```text
module
form/dialog name
file path
entity/table
status: implemented / partial / placeholder / not implemented
uses RequiredLabel? yes/no/partial
uses ERPFormFooter? yes/no/partial
has Add mode? yes/no
has Edit mode? yes/no
has View mode? yes/no
has child dialogs? yes/no
risk level
recommended rollout phase
```

## 7.4 Customer Module Confirmation

Summarize the Customer module status:

```text
what was implemented in 3B.3
which fields are marked required
which child dialogs updated
which parts still require manual verification if any
whether Customer can be used as rollout template
```

## 7.5 Gaps and Findings

List all gaps found:

```text
missing required markers
missing footer standard
inconsistent button order
Save button missing
Save & Close missing
Cancel missing
View mode showing Save buttons
required fields not visually marked
required fields not passed required prop
error messages inconsistent
forms not ready for rollout
```

## 7.6 Recommended Rollout Strategy

Recommend safe rollout phases.

Do not implement all forms in one phase unless there are very few forms.

Suggested structure:

```text
3B.3C — Apply RequiredLabel + ERPFormFooter to Organization/Admin forms
3B.3D — Apply to Master Data core forms: Geography / Finance / UOM
3B.3E — Apply to Party Master future modules or templates
3B.3F — Final Required/Footer QA across existing forms
```

Cursor may refine based on actual discovered forms.

## 7.7 Risk Review

Include risks:

```text
required-field source-of-truth mismatch
marking too many fields required
breaking save behavior
Save vs Save & Close needs different parent behavior
View mode footer differences
child dialog inconsistency
modules not fully implemented
```

## 7.8 Acceptance Criteria for Future Rollout

Define acceptance criteria:

```text
required marker appears only on actual required user-input fields
optional fields have no red star
Cancel / Save / Save & Close in Add/Edit
Close only in View
no data-save regression
typecheck/build pass
manual browser tests pass
```

End with:

```text
READY FOR SAMEER REVIEW — Global required fields and footer audit plan complete.
```

---

# 8. Output File 2 — Required Fields Module Matrix

Create:

```text
ERP_BASE_002F_3E_3B_3B_REQUIRED_FIELDS_MODULE_MATRIX.md
```

This must be a detailed matrix.

For each implemented module/form, include:

```text
module
table/entity
form file
field name
DB column
DB nullable? yes/no
Zod required? yes/no/not found
server action required? yes/no/not found
currently has required marker? yes/no/partial
should have required marker? yes/no
reason
priority
notes
```

Group by module.

Use tables where useful.

Do not guess; if unknown, write:

```text
UNKNOWN — needs manual review
```

Include a summary at top:

```text
total forms audited
total required fields found
total missing markers
total incorrect markers
high-priority fixes
```

End with:

```text
READY FOR SAMEER REVIEW — Required fields module matrix complete.
```

---

# 9. Output File 3 — Footer Standard Rollout Matrix

Create:

```text
ERP_BASE_002F_3E_3B_3B_FOOTER_STANDARD_ROLLOUT_MATRIX.md
```

For each implemented form/drawer/dialog, include:

```text
module
form/dialog name
file path
current footer buttons
expected Add/Edit footer
expected View footer
currently uses ERPFormFooter? yes/no/partial
needs change? yes/no
save behavior complexity: low/medium/high
risk level
recommended rollout phase
notes
```

Expected standard:

```text
Add/Edit: Cancel | Save | Save & Close
View: Close only
```

Include child dialogs.

End with:

```text
READY FOR SAMEER REVIEW — Footer standard rollout matrix complete.
```

---

# 10. Output File 4 — Next Implementation Prompt Plan

Create:

```text
ERP_BASE_002F_3E_3B_3B_NEXT_IMPLEMENTATION_PROMPT_PLAN.md
```

This file must propose the next implementation prompts based on the audit findings.

Include prompt names such as:

```text
PROMPT_ERP_BASE_002F_3E_3B_3C_APPLY_REQUIRED_FOOTER_TO_ORGANIZATION_ADMIN_FORMS.md
PROMPT_ERP_BASE_002F_3E_3B_3D_APPLY_REQUIRED_FOOTER_TO_CORE_MASTER_DATA_FORMS.md
PROMPT_ERP_BASE_002F_3E_3B_3E_APPLY_REQUIRED_FOOTER_TO_PARTY_MASTER_TEMPLATES.md
PROMPT_ERP_BASE_002F_3E_3B_3F_REQUIRED_FOOTER_FINAL_QA.md
```

For each proposed prompt, include:

```text
purpose
scope
out of scope
files likely modified
required tests
required report name
stop condition
risk level
```

If actual discovered modules require different phasing, adjust and explain.

End with:

```text
READY FOR SAMEER REVIEW — Next implementation prompt plan complete.
```

---

# 11. Required Final Status

Each file must clearly state it is:

```text
PLANNING / AUDIT ONLY
NO CODE CHANGES
NO DATABASE CHANGES
```

The final audit status must be one of:

```text
READY FOR SAMEER REVIEW
BLOCKED — Supabase or source inspection failed
```

---

# 12. Stop Condition

After creating the four audit/planning files, stop.

Do not implement.

Do not change code.

Do not change database.

Do not create migration.

Do not start 3B.3C.

Wait for Sameer/Dina review.

---

# Final Instruction

Read standards.

Connect to Supabase.

Inspect live schema and current source forms.

Create exactly the four audit/planning files.

Stop.
