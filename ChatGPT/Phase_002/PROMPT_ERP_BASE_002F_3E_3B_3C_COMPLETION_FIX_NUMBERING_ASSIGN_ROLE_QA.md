# PROMPT_ERP_BASE_002F_3E_3B_3C_COMPLETION_FIX_NUMBERING_ASSIGN_ROLE_QA

Act as a senior ERP QA lead, Supabase/PostgreSQL schema auditor, SaaS security tester, Next.js runtime tester, Playwright automation engineer, enterprise ERP UI/UX architect, reusable form-component architect, accessibility reviewer, master-data governance auditor, senior React/Next.js engineer, and Cursor completion-fix engineer.

## Phase

ERP BASE 002F.3E.3B.3C — Completion Fix: Numbering Required Fields, Assign Role Footer Decision, and QA Closure

## Prompt Purpose

This is a controlled COMPLETION FIX prompt.

The previous implementation report for:

```text
ERP BASE 002F.3E.3B.3C — Apply Required Field Markers and Form Footer Standard to Admin/System Forms
```

was reviewed and is **NOT CLOSED**.

Current status:

```text
PASS WITH NOTES — NOT CLOSED
```

This completion fix must close the gaps before 3B.3C can be approved.

Do not proceed to 3B.3D.
Do not proceed to 3B.4.
Do not implement Safe Close.
Do not implement outside-click prevention.
Do not implement dirty-state tracking.
Do not implement confirmation dialogs.
Do not modify database schema.
Do not create migrations.
Do not apply SQL.

---

# 1. Mandatory Standards To Read First

Before doing anything, read and follow:

```text
docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md
docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
```

Also review the approved/corrected 3B.3B audit files:

```text
ERP_BASE_002F_3E_3B_3B_GLOBAL_REQUIRED_FIELDS_AND_FOOTER_AUDIT_PLAN.md
ERP_BASE_002F_3E_3B_3B_REQUIRED_FIELDS_MODULE_MATRIX.md
ERP_BASE_002F_3E_3B_3B_FOOTER_STANDARD_ROLLOUT_MATRIX.md
ERP_BASE_002F_3E_3B_3B_NEXT_IMPLEMENTATION_PROMPT_PLAN.md
```

Also review the previous 3B.3C implementation report:

```text
ERP_BASE_002F_3E_3B_3C_ADMIN_SYSTEM_FORMS_REQUIRED_FOOTER_IMPLEMENTATION_REPORT.md
```

The completion report must confirm all files were reviewed.

---

# 2. Mandatory Supabase Connection First

Before implementation, connect to live Supabase:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

Verify live schema for:

```text
global_numbering_rules
roles
user_profiles
user_roles
role_permissions
owner_companies
branches
```

Also inspect current validation schemas/server actions for:

```text
numbering rules
assign role
roles
users
organizations
branches
```

The completion report must include:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
Live database schema was inspected before completing 3B.3C.
```

If Supabase connection fails, stop and create a BLOCKED report.

Do not implement without live verification.

---

# 3. Main Issues To Fix

The previous report identified these unresolved items:

## Issue 1 — Numbering Rule Form Required Labels Are Partial

The previous report says only these fields were updated:

```text
Rule Code
Rule Name
```

But the same report says other required fields remain pending manual review, including:

```text
Prefix
Delimiter
Number Length
Starting Number
Last Generated
Next Number
Suffix
Reset Frequency
```

This is not acceptable for 3B.3C closure.

Required action:

```text
Inspect the actual Numbering Rule form validation/source of truth.
Identify all required user-input fields.
Apply RequiredLabel to every required user-input field.
Do not mark optional or system-calculated fields incorrectly.
Document the final required fields clearly.
```

## Issue 2 — Assign Role Dialog Footer Standard Decision

The previous report says Assign Role Dialog kept:

```text
DialogFooter
Cancel | Assign Role
```

But Assign Role was included in 3B.3C scope.

Required action:

```text
Decide whether Assign Role is:
A. A true editable ERP form requiring ERPFormFooter with Cancel | Save | Save & Close, or
B. A single-purpose action dialog exception that may keep DialogFooter.
```

If option B is chosen, the report must justify it clearly and define the approved exception rule:

```text
Action Dialog Exception:
Single-purpose transactional dialogs that do not create/edit a persistent master record may keep action-specific footer wording, such as Cancel | Assign Role, if:
- they are not Add/Edit master-data forms,
- they do not support View mode,
- Save / Save & Close semantics do not apply,
- the exception is documented in the report.
```

If Assign Role behaves as a persistent add/edit form, convert it to the approved footer standard:

```text
Cancel | Save | Save & Close
```

Do not leave this undecided.

## Issue 3 — Manual Browser Testing Pending

Previous report had no authenticated browser verification.

Required action:

```text
Run browser/manual testing if possible.
If browser testing cannot be performed due authentication/session limitation, state that clearly.
If browser testing is pending, final status must remain PASS WITH NOTES, not PASS.
```

## Issue 4 — Wrong Next Phase Reference

Previous report incorrectly said next phase is:

```text
3B.4 Safe Close
```

Correct next phase after 3B.3C is:

```text
ERP BASE 002F.3E.3B.3D — Core Master Data Forms Required/Footer Rollout
```

Safe Close remains later:

```text
ERP BASE 002F.3E.3B.4 — Safe Close, Unsaved Changes, and Modal Layout Standard
```

Update the report accordingly.

---

# 4. Scope

## In Scope

```text
Numbering Rule form required-label completion
Assign Role footer classification or conversion
3B.3C QA closure validation
typecheck / lint / build
browser/manual test documentation
correction of next-phase reference
completion report generation
```

## Out of Scope

```text
Core Master Data forms
Authentication forms
Customer forms
Vendor/Subcontractor/Consultant/Government Authority/Recruitment Agency modules
Safe Close / Unsaved Changes
Outside-click prevention
Dirty-state tracking
Confirmation dialog
Global Search
AI
DMS
Database migration
SQL execution
```

---

# 5. Files To Inspect

Inspect before editing:

```text
src/features/numbering/components/numbering-rule-form-dialog.tsx
src/features/numbering/
src/features/users/assign-role-dialog.tsx
src/features/users/
src/components/erp/required-label.tsx
src/components/erp/erp-form-footer.tsx
src/components/ui/dialog.tsx
src/components/ui/button.tsx
src/components/ui/label.tsx
```

Also inspect validation/types/server actions:

```text
src/features/numbering/
src/server/actions/
src/features/users/
```

If paths differ, discover actual paths and document them.

---

# 6. Files To Modify

Modify only if needed:

```text
src/features/numbering/components/numbering-rule-form-dialog.tsx
src/features/users/assign-role-dialog.tsx
```

Do not modify other forms unless needed to fix a compile error directly caused by this completion fix.

---

# 7. Numbering Rule Form Completion Requirements

## 7.1 Required Field Source-of-Truth

Use:

```text
live DB schema
validation schema/types
server actions
current form behavior
```

Do not blindly follow the previous report. Re-check actual code.

## 7.2 RequiredLabel Application

For every required user-input field:

```tsx
<RequiredLabel required htmlFor="field_id">
  Field Label
</RequiredLabel>
```

Do not mark:

```text
computed preview fields
system fields
read-only generated values
fields automatically generated by backend
fields that validation does not require
fields that are optional pattern components
```

## 7.3 Specific Fields To Verify

Verify whether each of these is required:

```text
Rule Code
Rule Name
Entity Type
Prefix
Delimiter
Number Length
Starting Number
Last Generated
Next Number
Suffix
Reset Frequency
```

Important:

```text
Prefix and suffix may be optional depending on pattern design.
Last Generated and Next Number may be computed/read-only, not user-required.
Do not mark them required unless current validation requires user input.
```

Document final decision field-by-field.

## 7.4 Preserve Numbering Logic

Do not break:

```text
live preview
sequence logic
rule code
entity type
prefix/suffix/delimiter behavior
reset frequency
edit mode
add mode
Save
Save & Close
validation errors
```

---

# 8. Assign Role Dialog Decision Requirements

## 8.1 Determine Actual Nature of Assign Role Dialog

Inspect:

```text
src/features/users/assign-role-dialog.tsx
server actions related to role assignment
validation schema
UI behavior
```

Determine whether it is:

```text
a master-data Add/Edit form
or
a single-purpose action dialog
```

## 8.2 If It Is a Single-Purpose Action Dialog

It may keep:

```text
Cancel | Assign Role
```

But the completion report must clearly state:

```text
Assign Role Dialog is approved as an action-dialog exception for 3B.3C.
It is not an Add/Edit master-data form.
Save and Save & Close semantics do not apply.
```

Also make sure required labels still use `RequiredLabel`.

## 8.3 If It Is an Add/Edit Form

Convert footer to:

```text
Cancel | Save | Save & Close
```

using `ERPFormFooter`.

## 8.4 No Ambiguous Outcome

The final report must say either:

```text
Assign Role Dialog footer converted to ERPFormFooter.
```

or:

```text
Assign Role Dialog approved as documented action-dialog exception.
```

Do not leave it pending.

---

# 9. Testing Requirements

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
lint must be run
if lint fails due pre-existing issues, document exact status
if lint fails due this phase changes, fix before report
```

## Browser / Manual Testing

Test or document:

```text
Numbering Rule Add mode
Numbering Rule Edit mode
Numbering Rule Save
Numbering Rule Save & Close
Numbering Rule required markers
Numbering Rule preview still works

Assign Role open
Assign Role required markers
Assign Role action works if testable
Assign Role footer classification confirmed
```

If browser testing cannot be done due login/auth wall:

```text
Status must be PASS WITH NOTES.
Report must include manual checklist.
```

---

# 10. Required Completion Report

Create:

```text
ERP_BASE_002F_3E_3B_3C_COMPLETION_FIX_NUMBERING_ASSIGN_ROLE_QA_REPORT.md
```

The report must include:

1. Phase name.
2. Date/time.
3. Supabase connection confirmation.
4. Standards reviewed.
5. Previous report reviewed.
6. Files inspected.
7. Files modified.
8. Numbering Rule required-field source-of-truth table.
9. Numbering Rule fields updated.
10. Numbering Rule fields intentionally not marked required and why.
11. Assign Role footer decision.
12. Assign Role required-label status.
13. Static test results: typecheck/lint/build.
14. Browser/manual test status.
15. Corrected next phase reference.
16. Known limitations.
17. Final status.

Final status must be exactly one of:

```text
PASS — 3B.3C completion fix fully implemented and verified successfully.
PASS WITH NOTES — 3B.3C completion fix implemented with non-blocking notes.
FAIL — 3B.3C completion fix still requires correction before approval.
BLOCKED — 3B.3C completion fix could not be completed due to blocking issue.
```

---

# 11. Closure Criteria

3B.3C can close only if:

```text
Numbering Rule required labels are complete according to verified source of truth.
Assign Role footer decision is final and documented.
Typecheck passes.
Build passes.
Lint is run and documented.
Next phase is correctly stated as 3B.3D.
Safe Close remains deferred to 3B.4.
```

If browser testing remains pending, status can be:

```text
PASS WITH NOTES
```

but not full PASS.

---

# 12. Stop Condition

After completing the fix and creating the completion report, stop.

Do not proceed to:

```text
ERP BASE 002F.3E.3B.3D — Core Master Data Forms Required/Footer Rollout
```

Do not proceed to:

```text
ERP BASE 002F.3E.3B.4 — Safe Close, Unsaved Changes, and Modal Layout Standard
```

Wait for Sameer/Dina review.

---

# Final Instruction

Read standards.

Connect to Supabase.

Complete Numbering Rule required labels.

Resolve Assign Role footer classification.

Run typecheck, lint, build.

Document browser/manual testing status.

Correct next phase reference to 3B.3D.

Create completion report.

Stop.
