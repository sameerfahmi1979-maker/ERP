# PROMPT_ERP_BASE_002F_3E_3B_3E_APPLY_REQUIRED_LABEL_TO_STANDALONE_AUTH_FORMS

Act as a senior ERP QA lead, SaaS authentication flow reviewer, Next.js runtime tester, Supabase Auth integration reviewer, enterprise ERP UI/UX architect, reusable form-component architect, accessibility reviewer, senior React/Next.js engineer, and Cursor implementation engineer.

## Phase

ERP BASE 002F.3E.3B.3E — Apply RequiredLabel to Standalone Authentication Forms

## Prompt Purpose

This is a controlled IMPLEMENTATION prompt.

Apply the approved global required-field marker standard to standalone authentication forms only.

This phase follows:

```text
ERP BASE 002F.3E.3B.3D — Core Master Data Forms Required/Footer Rollout
Status: CLOSED WITH NOTES
```

Important:

```text
This phase is for RequiredLabel only.
Standalone authentication forms do NOT use ERPFormFooter.
Authentication forms keep their existing auth-specific button patterns.
```

Approved required-field standard:

```text
Required user-input fields must show a red asterisk using RequiredLabel.
Optional fields must not show a red asterisk.
```

Footer standard note:

```text
ERPFormFooter is for ERP drawer/dialog Add/Edit/View forms.
Auth forms are standalone pages/forms, so do not force:
Cancel | Save | Save & Close
```

Safe Close note:

```text
Safe Close / Unsaved Changes / Outside-click behavior is NOT part of this phase.
It is planned for:
ERP BASE 002F.3E.3B.4 — Safe Close, Unsaved Changes, and Modal Layout Standard
```

Do not implement safe close.

Do not implement outside-click prevention.

Do not implement dirty-state tracking.

Do not implement confirmation dialogs.

Do not modify database schema.

Do not create migrations.

Do not apply SQL.

Do not update Admin/System forms.

Do not update Core Master Data forms.

Do not continue to 3B.3F.

---

# 1. Mandatory Standards To Read First

Before implementation, read and follow:

```text
docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md

docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
```

Also review the approved/corrected audit and implementation files:

```text
ERP_BASE_002F_3E_3B_3B_GLOBAL_REQUIRED_FIELDS_AND_FOOTER_AUDIT_PLAN.md

ERP_BASE_002F_3E_3B_3B_REQUIRED_FIELDS_MODULE_MATRIX.md

ERP_BASE_002F_3E_3B_3B_FOOTER_STANDARD_ROLLOUT_MATRIX.md

ERP_BASE_002F_3E_3B_3B_NEXT_IMPLEMENTATION_PROMPT_PLAN.md

ERP_BASE_002F_3E_3B_3C_COMPLETION_FIX_NUMBERING_ASSIGN_ROLE_QA_REPORT.md

ERP_BASE_002F_3E_3B_3D_REPORT_CORRECTION_AND_QA_CLOSURE_REPORT.md
```

Also review the reusable component implementation:

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

Verify Supabase Auth and related profile context as applicable:

```text
auth.users
user_profiles
roles
user_roles
```

No schema change is required.

The implementation report must include:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
Live Supabase Auth / user context was checked before implementing RequiredLabel for standalone auth forms.
No database changes were required.
```

If Supabase connection fails, stop and create a BLOCKED report.

Do not implement without live verification.

---

# 3. Scope

## In Scope

Apply `RequiredLabel` to standalone authentication forms only:

```text
1. Login Form
   src/features/auth/login-form.tsx

2. Signup Form
   src/features/auth/signup-form.tsx

3. Forgot Password Form
   src/features/auth/forgot-password-form.tsx

4. Reset Password Form
   src/features/auth/reset-password-form.tsx
```

Implement:

```text
required red asterisks using RequiredLabel
preserve existing auth button layout
preserve existing auth validation
preserve existing Supabase auth behavior
preserve existing redirect behavior
preserve existing password-reset flow
```

## Out of Scope

```text
ERPFormFooter changes
Cancel | Save | Save & Close footer
Admin/System forms
Core Master Data forms
Customer forms
Party master modules
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

# 4. Files To Inspect

Inspect before editing:

```text
src/components/erp/required-label.tsx
src/components/ui/label.tsx
src/components/ui/input.tsx
src/components/ui/button.tsx

src/features/auth/login-form.tsx
src/features/auth/signup-form.tsx
src/features/auth/forgot-password-form.tsx
src/features/auth/reset-password-form.tsx

src/features/auth/
src/server/actions/
src/lib/supabase/
src/lib/auth/
```

If exact paths differ, discover the actual paths and document them.

---

# 5. Files To Modify

Modify only these 4 auth form files unless a small compatibility fix is absolutely required:

```text
src/features/auth/login-form.tsx
src/features/auth/signup-form.tsx
src/features/auth/forgot-password-form.tsx
src/features/auth/reset-password-form.tsx
```

Do not modify `RequiredLabel` unless a direct compatibility issue is discovered and fully documented.

Do not modify auth server actions unless absolutely necessary.

Do not modify route guards, middleware, auth providers, or Supabase clients unless a direct break is found.

---

# 6. Required Field Marker Rules

Use `RequiredLabel` for required user-input fields.

Do not mark optional fields.

Do not mark links/buttons as required.

Do not mark hidden fields.

Do not mark redirect fields.

Do not mark submit buttons.

Do not mark read-only/system values.

If a field is required by HTML `required`, Zod validation, server action, or Supabase auth flow, mark it with `RequiredLabel`.

Keep auth forms visually clean and professional.

---

# 7. Form-by-Form Required Field Expectations

Verify from current code/validation first. These are expected starting points from audit.

## 7.1 Login Form

File:

```text
src/features/auth/login-form.tsx
```

Expected required fields:

```text
Email
Password
```

Do not alter:

```text
Sign In button
Forgot Password link
Remember me option if present
redirectTo behavior
error messages
loading state
```

## 7.2 Signup Form

File:

```text
src/features/auth/signup-form.tsx
```

Expected required fields:

```text
Full Name
Email
Password
Confirm Password
```

Verify exact fields from current form.

Do not alter:

```text
Sign Up / Create Account button
password confirmation validation
terms/acceptance checkbox if present unless required by validation
redirect behavior
error messages
loading state
```

If terms/acceptance checkbox is required by validation, mark its label or surrounding control appropriately without breaking layout.

## 7.3 Forgot Password Form

File:

```text
src/features/auth/forgot-password-form.tsx
```

Expected required fields:

```text
Email
```

Do not alter:

```text
Send Reset Link button
Back to Login link
success message after email sent
error handling
loading state
```

## 7.4 Reset Password Form

File:

```text
src/features/auth/reset-password-form.tsx
```

Expected required fields:

```text
New Password
Confirm Password
```

Verify exact field names.

Do not alter:

```text
Reset Password / Update Password button
password match validation
token/session handling
redirect after reset
error messages
loading state
```

---

# 8. Auth Form Button Pattern

Do not use `ERPFormFooter` in this phase.

Auth forms are standalone workflows, not ERP drawer forms.

Keep existing button text and layout, such as:

```text
Sign In
Create Account
Send Reset Link
Reset Password
Back to Login
Forgot Password
```

Do not change auth UX into:

```text
Cancel | Save | Save & Close
```

That footer standard does not apply to standalone auth pages.

---

# 9. Preserve Existing Behavior

Do not break:

```text
login
logout-related redirects if relevant
signup
forgot password email sending
reset password
password confirmation validation
Supabase Auth integration
route redirect after login
loading states
error states
success messages
auth page layout
responsive behavior
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
lint must be run
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

Test Login:

```text
Open login page
Email label has red required asterisk
Password label has red required asterisk
Sign In button still works
Forgot Password link still works
Validation errors still display
Loading state still works
No console errors
No layout break
```

Test Signup:

```text
Open signup page
All required fields show red required asterisk
Optional fields have no red asterisk
Password confirmation still works
Signup button still works
Validation errors still display
Loading state still works
No console errors
No layout break
```

Test Forgot Password:

```text
Open forgot password page
Email label has red required asterisk
Send Reset Link still works
Back to Login still works
Success/error message still works
No console errors
No layout break
```

Test Reset Password:

```text
Open reset password page
New Password label has red required asterisk
Confirm Password label has red required asterisk
Password match validation still works
Reset button still works
Success/error/redirect still works
No console errors
No layout break
```

---

# 11. Required Implementation Report

Create:

```text
ERP_BASE_002F_3E_3B_3E_STANDALONE_AUTH_FORMS_REQUIREDLABEL_IMPLEMENTATION_REPORT.md
```

The report must include:

1. Phase name.
2. Date/time.
3. Supabase connection confirmation.
4. Standards files read confirmation.
5. Audit/planning files reviewed.
6. Files modified.
7. Required field source-of-truth analysis for each auth form.
8. Required markers applied per form.
9. Fields intentionally not marked required and why.
10. Confirmation that ERPFormFooter was not applied and why.
11. Backward compatibility confirmation.
12. Static test results: typecheck/lint/build.
13. Browser/manual test results.
14. Known issues/limitations.
15. Follow-up tasks.
16. Correct next phase reference.

Correct next phase:

```text
ERP BASE 002F.3E.3B.3F — Final Required/Footer QA
```

Safe Close phase remains later:

```text
ERP BASE 002F.3E.3B.4 — Safe Close, Unsaved Changes, and Modal Layout Standard
```

Final status must be exactly one of:

```text
PASS — Standalone Auth Forms RequiredLabel rollout implemented and verified successfully.
PASS WITH NOTES — Standalone Auth Forms RequiredLabel rollout implemented with non-blocking notes.
FAIL — Standalone Auth Forms RequiredLabel rollout requires correction before approval.
BLOCKED — Standalone Auth Forms RequiredLabel rollout could not be completed due to blocking issue.
```

---

# 12. Stop Condition

After updating the 4 standalone auth forms, running tests, and creating the report, stop.

Do not continue to:

```text
ERP BASE 002F.3E.3B.3F — Final Required/Footer QA
```

Do not implement Safe Close.

Do not implement outside-click behavior.

Wait for Sameer/Dina review and approval.

---

# Final Instruction

Read standards.

Connect to Supabase.

Verify current auth forms and validation.

Apply RequiredLabel only to the 4 standalone auth forms.

Do not apply ERPFormFooter.

Do not change auth button layout.

Run tests.

Create implementation report.

Stop.
