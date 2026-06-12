# PROMPT_ERP_BASE_002F_3E_3B_3C_APPLY_REQUIRED_FOOTER_TO_ADMIN_SYSTEM_FORMS

Act as a senior ERP QA lead, Supabase/PostgreSQL schema auditor, SaaS security tester, Next.js runtime tester, Playwright automation engineer, enterprise ERP UI/UX architect, reusable form-component architect, accessibility reviewer, master-data governance auditor, senior React/Next.js engineer, and Cursor implementation engineer.

## Phase

ERP BASE 002F.3E.3B.3C — Apply Required Field Markers and Form Footer Standard to Admin/System Forms

## Prompt Purpose

This is a controlled IMPLEMENTATION prompt.

Apply the approved global required-field marker standard and global form footer standard to Admin/System forms only.

This phase follows:

```text
ERP BASE 002F.3E.3B.3B — Global Required Fields and Footer Audit Plan
```

Approved standard:

```text
Add/Edit mode:
Cancel | Save | Save & Close

View mode:
Close only
```

Important scope separation:

```text
Safe Close / Unsaved Changes / Outside-click behavior is NOT part of this phase.
It is planned for:
ERP BASE 002F.3E.3B.4 — Safe Close, Unsaved Changes, and Modal Layout Standard
```

Do not implement safe close in this phase.

Do not implement outside-click prevention.

Do not implement dirty-state tracking.

Do not implement confirmation dialog.

Do not modify database schema.

Do not create migrations.

Do not apply SQL.

Do not update core master data forms in this phase.

Do not update auth forms in this phase.

Do not continue to 3B.3D.

---

# 1. Mandatory Standards To Read First

Before implementation, read and follow:

```text
docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md

docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
```

Also review the latest audit/planning files:

```text
ERP_BASE_002F_3E_3B_3B_GLOBAL_REQUIRED_FIELDS_AND_FOOTER_AUDIT_PLAN.md

ERP_BASE_002F_3E_3B_3B_REQUIRED_FIELDS_MODULE_MATRIX.md

ERP_BASE_002F_3E_3B_3B_FOOTER_STANDARD_ROLLOUT_MATRIX.md

ERP_BASE_002F_3E_3B_3B_NEXT_IMPLEMENTATION_PROMPT_PLAN.md
```

Also review Customer implementation as reference:

```text
ERP_BASE_002F_3E_3B_3_REQUIRED_FIELD_MARKERS_AND_FORM_FOOTER_IMPLEMENTATION_REPORT.md
```

The implementation report must confirm these standards and planning files were reviewed.

---

# 2. Mandatory Supabase Connection First

Before implementation, connect to live Supabase:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

Verify live schema for the Admin/System forms:

```text
roles
user_profiles
owner_companies
branches
global_numbering_rules
permissions
user_roles
role_permissions
```

Also inspect any related current validation schemas and server actions.

The implementation report must include:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
Live database schema was inspected before implementing RequiredLabel and ERPFormFooter for Admin/System forms.
```

If Supabase connection fails, stop and create a BLOCKED report.

Do not implement without live verification.

---

# 3. Scope

## In Scope

Apply `RequiredLabel` and `ERPFormFooter` standards to these 7 Admin/System forms:

```text
1. Roles Form
   src/features/roles/role-form-dialog.tsx

2. Add User Dialog
   src/features/users/add-user-dialog.tsx

3. Edit User Dialog
   src/features/users/user-edit-dialog.tsx

4. Assign Role Dialog
   src/features/users/assign-role-dialog.tsx

5. Organization Form
   src/features/organizations/organization-form-dialog.tsx

6. Branch Form
   src/features/branches/branch-form-dialog.tsx

7. Numbering Rule Form
   src/features/numbering/components/numbering-rule-form-dialog.tsx
```

Implement:

```text
required red asterisks using RequiredLabel
pass required prop to required inputs/comboboxes where applicable
replace or standardize footer to ERPFormFooter
Add/Edit footer = Cancel | Save | Save & Close
preserve current save behavior
add Save handler where safe
add Save & Close handler
document any form that cannot safely support Save yet as PASS WITH NOTES
```

## Out of Scope

```text
Core master data forms:
- Geography
- Finance Basics
- UOM
- Lookups

Standalone auth forms:
- Login
- Signup
- Forgot Password
- Reset Password

Customer forms
Vendor/Subcontractor/Consultant/Government Authority/Recruitment Agency modules
Safe Close / Unsaved Changes
Outside-click prevention
Dirty state tracking
Confirmation dialog
Global Search
AI
DMS
Database migration
SQL execution
```

---

# 4. Files To Inspect

Inspect current files before editing:

```text
src/components/erp/required-label.tsx
src/components/erp/erp-form-footer.tsx
src/components/erp/erp-drawer-form.tsx
src/components/ui/label.tsx
src/components/ui/input.tsx
src/components/ui/button.tsx
src/components/ui/dialog.tsx
src/components/ui/sheet.tsx

src/features/roles/role-form-dialog.tsx
src/features/users/add-user-dialog.tsx
src/features/users/user-edit-dialog.tsx
src/features/users/assign-role-dialog.tsx
src/features/organizations/organization-form-dialog.tsx
src/features/branches/branch-form-dialog.tsx
src/features/numbering/components/numbering-rule-form-dialog.tsx

src/features/roles/
src/features/users/
src/features/organizations/
src/features/branches/
src/features/numbering/

src/server/actions/
src/lib/rbac/check.ts
```

If exact paths differ, discover the actual paths and document them.

---

# 5. Files To Modify

Modify only the 7 Admin/System form files unless a shared component compatibility fix is absolutely required:

```text
src/features/roles/role-form-dialog.tsx
src/features/users/add-user-dialog.tsx
src/features/users/user-edit-dialog.tsx
src/features/users/assign-role-dialog.tsx
src/features/organizations/organization-form-dialog.tsx
src/features/branches/branch-form-dialog.tsx
src/features/numbering/components/numbering-rule-form-dialog.tsx
```

Do not modify `RequiredLabel` or `ERPFormFooter` unless a small compatibility issue is discovered and fully documented.

Do not modify server actions unless absolutely necessary. This phase should be UI/form behavior only.

---

# 6. Required Field Marker Rules

Use `RequiredLabel` for required user-input fields.

Do not mark:

```text
id
created_at
updated_at
created_by
updated_by
system-generated fields
auto-generated codes if shown as read-only/auto-generated
fields with defaults unless user must consciously choose them
```

If a field is required by Zod/server action but nullable in DB, mark it required.

If a field is DB NOT NULL but automatically filled or has a default, document and do not mark as user-required unless the user must input it.

---

# 7. Form-by-Form Required Field Expectations

Verify from live schema + validation first. These are expected starting points from audit.

## 7.1 Roles Form

File:

```text
src/features/roles/role-form-dialog.tsx
```

Expected required fields:

```text
Role Code
Role Name
```

Do not mark optional:

```text
Description
Type if default exists
Status if default exists
```

## 7.2 Add User Dialog

File:

```text
src/features/users/add-user-dialog.tsx
```

Expected required fields:

```text
Email
Full Name
```

Verify if Company is required by validation/business logic. If it is required, mark it required; if not, document as optional.

Do not mark optional:

```text
Temporary Password if optional/conditional
Display Name
Phone
Job Title
Department
Branch
Initial Role unless validation requires it
```

## 7.3 Edit User Dialog

File:

```text
src/features/users/user-edit-dialog.tsx
```

Expected required fields:

```text
Full Name
```

Email may be read-only/non-editable. If shown and required by validation, mark clearly but do not break read-only behavior.

Verify Company requirement.

## 7.4 Assign Role Dialog

File:

```text
src/features/users/assign-role-dialog.tsx
```

Expected required fields:

```text
Role
```

Verify if scope/company/branch is required. Mark only if validation requires it.

## 7.5 Organization Form

File:

```text
src/features/organizations/organization-form-dialog.tsx
```

Expected required fields:

```text
Company Code
Company Name (English)
```

Verify these before marking:

```text
Legal Name
Country
Default Currency
```

If validation requires them, mark them required. If not, document optional.

Do not break:

```text
geography cascading
currency conversion logic
status/default values
```

## 7.6 Branch Form

File:

```text
src/features/branches/branch-form-dialog.tsx
```

Expected required fields:

```text
Branch Code
Branch Name (English)
Company
```

Do not mark optional geography fields unless validation requires them.

Do not break:

```text
legacy geography text/FK mapping
company selection
branch save/update behavior
```

## 7.7 Numbering Rule Form

File:

```text
src/features/numbering/components/numbering-rule-form-dialog.tsx
```

Expected required fields:

```text
Rule Code
Rule Name
Entity Type
Sequence Length
Starting Value
Reset Frequency
```

Verify if any additional fields are required by validation.

Do not break:

```text
numbering rule validation
sequence logic
format preview
active/inactive status logic
```

---

# 8. Footer Standard Implementation

For all 7 forms, replace or standardize footer so Add/Edit uses:

```text
Cancel | Save | Save & Close
```

## 8.1 Required Behavior

```text
Cancel:
- closes current form/drawer/dialog without saving
- Safe-close confirmation is NOT part of this phase

Save:
- saves data
- keeps form/drawer/dialog open
- refreshes current record/state when possible
- shows success toast if current pattern supports it

Save & Close:
- saves data
- closes form/drawer/dialog after successful save
- refreshes list/table when current pattern supports it
```

## 8.2 View Mode

Most Admin/System forms may not have View mode. If a form has View mode:

```text
View mode footer = Close only
```

## 8.3 Implementation Limitation Handling

If a form cannot safely support `Save` yet:

```text
Do not invent risky behavior.
Implement Save & Close safely.
Document Save as not fully supported in this form.
Mark report as PASS WITH NOTES.
Create follow-up task for full Save support.
```

But target standard remains:

```text
Cancel | Save | Save & Close
```

---

# 9. Preserve Existing Behavior

Do not break:

```text
role create/update
user create/update
assign role
organization create/update
branch create/update
numbering rule create/update
permissions behavior
RLS/security behavior
existing validation
existing server actions
existing list refresh behavior
```

---

# 10. Testing Requirements

## 10.1 Static Tests

Run:

```bash
npm run typecheck
npm run lint
npm run build
```

Rules:

```text
typecheck must pass
build must pass
lint should be run
if lint fails only due pre-existing unrelated issues, document clearly
if lint fails due this phase changes, fix before report
```

## 10.2 Browser / Manual Tests

Use Playwright if available.

If not available, perform manual tests or document required manual tests.

If browser testing cannot be performed, final status must be:

```text
PASS WITH NOTES
```

not full PASS.

## 10.3 Required Test Cases

For each of the 7 forms:

```text
Open Add mode where available
Required markers visible only on required fields
Optional fields have no red star
Cancel works
Save works and keeps open, if implemented
Save & Close works and closes
Validation errors still display correctly
No console errors
No horizontal scroll
Open Edit mode where available
Required markers visible
Save works and keeps open, if implemented
Save & Close works and closes
Existing data saves correctly
```

Specific tests:

```text
Roles:
- create role
- update role

Users:
- create user
- edit user
- assign role

Organizations:
- create/update organization
- geography fields still work
- currency logic still works

Branches:
- create/update branch
- company selection still works
- legacy geography mapping still works

Numbering:
- create/update numbering rule
- preview/sequence validation still works if available
```

---

# 11. Required Implementation Report

Create:

```text
ERP_BASE_002F_3E_3B_3C_ADMIN_SYSTEM_FORMS_IMPLEMENTATION_REPORT.md
```

The report must include:

1. Phase name.
2. Date/time.
3. Supabase connection confirmation.
4. Standards files read confirmation.
5. Audit/planning files reviewed.
6. Files modified.
7. Required field source-of-truth analysis for each form.
8. Required markers applied per form.
9. Footer standard applied per form.
10. Save / Save & Close support status per form.
11. Any forms that are PASS WITH NOTES due Save limitation.
12. Backward compatibility confirmation.
13. Static test results: typecheck/lint/build.
14. Browser/manual test results.
15. Known issues/limitations.
16. Follow-up tasks.
17. Final status.

Final status must be exactly one of:

```text
PASS — Admin/System forms required markers and footer standard implemented and verified successfully.
PASS WITH NOTES — Admin/System forms required markers and footer standard implemented with non-blocking notes.
FAIL — Admin/System forms required markers and footer standard require correction before approval.
BLOCKED — Admin/System forms required markers and footer standard could not be completed due to blocking issue.
```

---

# 12. Stop Condition

After updating the 7 Admin/System forms, running tests, and creating the report, stop.

Do not continue to:

```text
ERP BASE 002F.3E.3B.3D — Core Master Data Forms
```

Do not implement Safe Close.

Do not implement outside-click behavior.

Wait for Sameer/Dina review and approval.

---

# Final Instruction

Read standards.

Connect to Supabase.

Verify live schema and current validation for Admin/System forms.

Apply RequiredLabel and ERPFormFooter to only the 7 Admin/System forms.

Target footer:

```text
Cancel | Save | Save & Close
```

Do not implement safe close.

Run tests.

Create implementation report.

Stop.
