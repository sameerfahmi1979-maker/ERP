# PROMPT_ERP_BASE_002E_1B — Audit Drawer Implementation Against Antigravity UI/UX Plan

## 0. Required Cursor Persona

Act as a senior enterprise ERP UI/UX auditor, Next.js App Router runtime tester, shadcn/Base UI integration reviewer, TypeScript QA lead, accessibility reviewer, and SaaS frontend security auditor.

This is an **audit-only** task.

Do not implement fixes unless explicitly approved after the audit.

Do not modify code.

Do not modify database.

Do not modify Supabase Auth.

Do not modify RLS.

Do not modify server actions.

Do not change forms.

Do not revert anything.

Your job is to inspect the current ERP app implementation and compare it against the Antigravity UI/UX plan files.

---

## 1. Purpose

Review whether the right-side drawer form implementation has been done correctly according to the Antigravity UI/UX plan.

The user attached Antigravity planning files and wants a full audit of:

1. Whether the drawer system is implemented according to the approved plan.
2. Whether the app is still stable.
3. Whether the current runtime error is caused by incorrect implementation.
4. Whether Print/PDF/Excel/CSV/Email actions are only placeholders as expected.
5. Whether backend/security/database areas were left untouched.
6. What gaps remain before continuing Phase 002E.

---

## 2. Antigravity Files to Read

Read all available Antigravity planning files in the project/review folder.

Expected files include, but may not be limited to:

```text
ANTIGRAVITY_002E_DRAWER_COMPONENT_BLUEPRINT.md
ANTIGRAVITY_002E_DRAWER_FORM_DESIGN_PLAN.md
ANTIGRAVITY_002E_DRAWER_UIUX_POLISH_REPORT.md
ANTIGRAVITY_002E_EXPORT_EMAIL_UX_PLAN.md
ANTIGRAVITY_002E_GLOBAL_MASTER_DATA_UX_PLAN.md
ANTIGRAVITY_002E_LIGHT_THEME_DRAWER_SPEC.md
ANTIGRAVITY_002E_UIUX_AUDIT_REPORT.md
ANTIGRAVITY_002E_APP_SETTINGS_UX_PLAN.md
ANTIGRAVITY_002E_CURSOR_IMPLEMENTATION_NOTES.md
ANTIGRAVITY_002E_CURSOR_IMPLEMENTATION_PLAN.md
```

If some files are missing, document which are missing.

Do not skip the files.

Summarize the required standards from each file before auditing the app.

---

## 3. Existing App Areas to Inspect

Inspect the current app implementation, especially:

### Drawer components

```text
src/components/erp/erp-drawer-form.tsx
src/components/erp/drawer/**
src/components/ui/dropdown-menu.tsx
src/components/ui/sheet.tsx
src/components/ui/scroll-area.tsx
```

### Migrated form components

```text
src/features/organizations/organization-form-dialog.tsx
src/features/branches/branch-form-dialog.tsx
src/features/users/add-user-dialog.tsx
src/features/users/user-edit-dialog.tsx
src/features/users/assign-role-dialog.tsx
src/features/roles/role-detail-drawer.tsx
src/features/roles/role-form-dialog.tsx
```

### Admin pages

```text
src/app/(protected)/admin/organizations/page.tsx
src/app/(protected)/admin/branches/page.tsx
src/app/(protected)/admin/users/page.tsx
src/app/(protected)/admin/roles/page.tsx
src/app/(protected)/admin/permissions/page.tsx
src/app/(protected)/admin/audit/page.tsx
```

### Files that should not be changed

Check whether these were modified during 002E.1:

```text
supabase/migrations/**
supabase/config.toml
src/middleware.ts
src/lib/supabase/**
src/lib/rbac/**
.env.local
.env.local.example
scripts/bootstrap-admin.mjs
src/server/actions/**
src/server/queries/**
```

If any of these were modified during drawer implementation, report it clearly.

---

## 4. Specific Runtime Error to Investigate

The app showed this runtime error:

```text
Base UI: MenuGroupContext is missing. Menu group parts must be used within <MenuGroup> or <MenuRadioGroup>.
```

Stack trace:

```text
DropdownMenuLabel
src/components/ui/dropdown-menu.tsx

ERPDrawerHeader
src/components/erp/erp-drawer-form.tsx

ERPDrawerForm
OrganizationFormDialog
AddOrganizationButton
AdminOrganizationsPage
```

Audit:

1. Where exactly is `DropdownMenuLabel` used?
2. Is it used inside the correct menu group structure?
3. Is the project using Base UI dropdown behavior instead of Radix behavior?
4. Does the drawer header incorrectly assume standard shadcn/Radix dropdown structure?
5. Is this only in `ERPDrawerHeader`, or repeated elsewhere?
6. What is the safest fix?
7. Should Print/PDF/Excel/CSV/Email actions be disabled placeholders in this phase?

Do not fix it yet unless explicitly requested. Document the exact correction needed.

---

## 5. Compare Implementation Against Antigravity Plan

Create a compliance matrix.

Check each planned requirement:

### Drawer design

- right-side drawer
- width around 78–82vw
- max width around 1450px
- min width around 960px
- full height
- sticky header
- sticky footer
- internal scroll body
- background dim/blur
- responsive tablet/mobile behavior

### Theme

- light mode default
- no forced black background
- theme tokens used:
  - `bg-background`
  - `text-foreground`
  - `border-border`
  - `bg-muted`
  - `text-muted-foreground`
- dark mode optional/adaptive only

### Navigation

- internal left section nav
- active section state
- hover state
- icons
- error/completion indicator if implemented or planned

### Form body

- section titles
- section cards
- field grid
- 2-column / 3-column layout
- full-width fields
- helper text
- validation area

### Footer

- Cancel
- Save as Draft placeholder
- Save & Close / Create / Update
- Save & New placeholder if applicable
- sticky footer
- loading state
- unsaved changes placeholder if applicable

### Actions

- Print
- PDF
- Excel
- CSV
- Send by Email

For 002E.1, these must be placeholders or disabled only.

### Accessibility

- focus handling
- ESC close behavior
- labels
- keyboard navigation
- contrast
- scroll behavior

### Existing functionality

- organization create/edit still works
- branch create/edit still works
- add user still works
- edit user still works
- assign role still works
- role detail still works
- no CRUD regression

---

## 6. Build and Runtime Validation

Run from clean path:

```text
C:\dev\agt-erp
```

Run:

```bash
npm run lint
npm run typecheck
npm run build
npm run dev
```

If the app currently crashes, document:

- route tested
- exact error
- stack trace
- suspected component
- whether the app can recover after disabling action dropdown

Do not make code changes.

---

## 7. Browser Visual QA

Open and inspect:

```text
http://localhost:3000/admin/organizations
http://localhost:3000/admin/branches
http://localhost:3000/admin/users
http://localhost:3000/admin/roles
```

Try opening:

- Add Organization
- Edit Organization
- Add Branch
- Edit Branch
- Add User
- Edit User
- Assign Role
- View Role Detail

Capture screenshots if possible:

```text
implementation_Review/screenshots/002E_1B_audit/
  audit_organization_drawer.png
  audit_branch_drawer.png
  audit_add_user_drawer.png
  audit_role_detail_drawer.png
  audit_runtime_error.png
```

If screenshots cannot be captured, document why.

---

## 8. Required Audit Reports

Create these reports:

```text
ERP_BASE_002E_1B_ANTIGRAVITY_PLAN_SUMMARY.md
ERP_BASE_002E_1B_IMPLEMENTATION_AUDIT_REPORT.md
ERP_BASE_002E_1B_RUNTIME_ERROR_ANALYSIS.md
ERP_BASE_002E_1B_SECURITY_UNCHANGED_AUDIT.md
ERP_BASE_002E_1B_UIUX_GAP_ANALYSIS.md
ERP_BASE_002E_1B_FIX_RECOMMENDATION.md
```

### Report 1 — Plan Summary

Summarize what each Antigravity file required.

### Report 2 — Implementation Audit

Include:

- files inspected
- components found
- forms migrated
- what matches the plan
- what does not match the plan
- compliance matrix

### Report 3 — Runtime Error Analysis

Include:

- exact cause of MenuGroupContext error
- exact component/file/line
- dropdown menu misuse explanation
- whether it affects all forms or only drawer actions
- proposed fix

### Report 4 — Security Unchanged Audit

Include confirmation that:

- no database schema changes
- no RLS changes
- no Supabase Auth changes
- no middleware changes
- no service-role exposure
- no server actions changed unless documented

### Report 5 — UI/UX Gap Analysis

Include:

- visual gaps
- theme gaps
- responsiveness gaps
- accessibility gaps
- CRUD regression risks
- placeholder action risks

### Report 6 — Fix Recommendation

Give a recommended next prompt/action:

- repair only drawer actions dropdown
- keep drawer implementation
- disable export/email placeholders until 002E.3
- optionally rollback only broken header action menu if needed
- do not rollback full implementation unless critical

---

## 9. Final Recommendation Format

At the end, clearly state one of these decisions:

### Decision A — Keep implementation, minor repair required

Use this if the drawer is mostly good and only the dropdown menu is broken.

### Decision B — Keep drawer components but rollback migrated forms temporarily

Use this if drawer components are fine but form migrations are risky.

### Decision C — Revert entire 002E.1 implementation

Use this only if drawer implementation is deeply broken or touches backend/security incorrectly.

### Decision D — Implementation fully passes

Use this if no fixes are needed.

Be honest and specific.

---

## 10. Strict Instruction

Do not fix code in this audit.

Do not push.

Do not commit.

Do not modify files except creating the audit reports and screenshots.

Stop after reports.
