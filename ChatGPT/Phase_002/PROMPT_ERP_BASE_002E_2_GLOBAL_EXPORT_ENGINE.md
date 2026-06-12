# PROMPT_ERP_BASE_002E_2 — Global Print, PDF, Excel & CSV Export Engine

## 0. Required Cursor Persona

Act as a senior ERP QA lead, Next.js App Router engineer, TypeScript architect, export/reporting engine specialist, enterprise PDF template designer, spreadsheet/export engineer, SaaS security tester, and Supabase/RLS auditor.

You are working on the existing ERP Foundation application after Phase 002D and Phase 002E.1.

This phase is **Phase 002E.2 — Global Print, PDF, Excel & CSV Export Engine**.

Do not start Phase 002E.3 email sending yet.

Do not start Phase 002E.4 draft workflow yet.

Do not start Phase 002F app settings/master data yet.

Do not start Phase 003 HR or any business module.

---

## 1. Current ERP Context

The application already has:

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui / Base UI components
- Inter font
- Supabase Auth
- Supabase PostgreSQL
- RLS/RBAC
- BIGINT ERP primary keys
- Admin foundation
- Right-side drawer form system from Phase 002E.1
- Organizations CRUD
- Branches CRUD
- Users management
- Roles and permissions
- Audit logs
- UAE-ready organization/branch fields
- Add User feature
- Role Detail view

Current issue:

Export buttons exist visually but are not functional. The drawer actions menu currently uses disabled placeholders because Print/PDF/Excel/CSV/Email were deferred.

This phase must make Print/PDF/Excel/CSV functional globally.

---

## 2. Phase 002E.2 Purpose

Create a reusable global export engine that supports:

```text
Print
PDF
Excel
CSV
```

For:

1. Every list page
2. Every form/detail drawer
3. Future report pages
4. Future module pages

Apply first to existing admin pages:

```text
/admin/organizations
/admin/branches
/admin/users
/admin/roles
/admin/permissions
/admin/audit
```

Also enable export/print placeholders/actions inside the right-side drawer forms/details where practical.

---

## 3. Strict Scope Control

### This phase must implement

- Reusable export components
- Print action
- PDF generation/download
- Excel generation/download
- CSV generation/download
- Basic enterprise export templates
- Export current list data
- Export filtered/list-visible data if filters exist
- Basic drawer/detail export where data is available
- Audit logging for export events if safe and practical

### This phase must not implement

- Sending email
- SMTP
- Resend/SendGrid/Microsoft Graph
- App settings
- Letterhead database
- Multi-company letterhead selection as real backend
- Draft workflow
- New business modules
- Full DMS
- Full report designer

Email is Phase 002E.3.

Letterhead/settings are Phase 002F.

Draft workflow is Phase 002E.4.

---

## 4. Critical Safety Rules

Do not modify:

```text
supabase/migrations/**
supabase/config.toml
src/middleware.ts
src/lib/supabase/**
src/lib/rbac/**
.env.local
.env.local.example
scripts/bootstrap-admin.mjs
```

Do not weaken:

- Supabase Auth
- RLS policies
- RBAC checks
- service-role rules
- audit logging rules

Do not expose:

- service-role key
- secrets
- `.env.local`

Do not run:

```bash
supabase db push
```

Prefer no database changes in this phase.

If database changes are absolutely needed for audit logging/export tracking, stop and ask for approval before creating a migration.

---

## 5. Required Initial Inspection

Before coding, inspect:

1. Existing export/filter buttons in:
   - organizations table/page
   - branches table/page
   - users table/page
   - roles table/page
   - permissions page/matrix
   - audit logs page
2. Existing drawer header actions placeholder in:
   - `src/components/erp/erp-drawer-form.tsx`
3. Current data-table component:
   - `src/components/tables/data-table.tsx`
4. Current ERP toolbar components:
   - `src/components/erp/data-toolbar.tsx`
   - any existing export button/menu component
5. Available libraries in `package.json`
6. Whether packages already exist:
   - `xlsx`
   - `jspdf`
   - `jspdf-autotable`
   - `@react-pdf/renderer`
   - `papaparse`
   - other export-related packages

Create:

```text
ERP_BASE_002E_2_INITIAL_REVIEW_REPORT.md
```

Report must include:

- existing export UI locations
- current gaps
- packages already installed
- packages required
- chosen export strategy
- files to modify
- security impact
- implementation plan

---

## 6. Recommended Export Strategy

Use a practical, stable approach.

### CSV

Implement natively with safe escaping:

- comma delimiter
- quote escaping
- UTF-8 BOM optional
- download `.csv`

No package required unless justified.

### Excel

Preferred package:

```text
xlsx
```

If not installed, install:

```bash
npm install xlsx
```

Excel export should:

- create `.xlsx`
- use worksheet headers
- include export metadata if practical
- auto-width columns if practical
- use current visible/list data first

### PDF

Preferred simple approach for this phase:

Use:

```text
jspdf
jspdf-autotable
```

If not installed:

```bash
npm install jspdf jspdf-autotable
```

PDF export should:

- create simple enterprise report
- A4 page
- title
- generated by
- generated date/time
- report/module name
- filters summary if available
- table data
- page numbers
- simple footer

Do not overcomplicate with final company letterhead yet.

Letterhead will be upgraded in Phase 002F.

### Print

Use browser print with a clean printable view or generated print window.

Options:

1. Open a printable HTML window with enterprise styling and call `print()`.
2. Or create a hidden print area with print CSS.

Preferred for this phase:

Create a reusable print helper that generates a printable HTML document in a new window.

---

## 7. Required Global Components / Utilities

Create reusable export utilities.

Suggested structure:

```text
src/lib/export/
  csv.ts
  excel.ts
  pdf.ts
  print.ts
  format-export-data.ts
  export-types.ts

src/components/erp/export/
  erp-export-menu.tsx
  erp-export-button.tsx
  erp-print-preview-placeholder.tsx
```

### Required types

Create an export type system:

```ts
export type ERPExportColumn<T> = {
  key: keyof T | string
  header: string
  getValue?: (row: T) => string | number | boolean | null | undefined
  width?: number
}

export type ERPExportOptions<T> = {
  title: string
  subtitle?: string
  filename: string
  columns: ERPExportColumn<T>[]
  data: T[]
  generatedBy?: string
  generatedAt?: Date
  filters?: Record<string, string | number | boolean | null | undefined>
  orientation?: "portrait" | "landscape"
}
```

### Required export menu

`ERPExportMenu` must support:

- Print
- Download PDF
- Download Excel
- Download CSV

Props:

```ts
type ERPExportMenuProps<T> = {
  title: string
  filename: string
  data: T[]
  columns: ERPExportColumn<T>[]
  filters?: Record<string, unknown>
  disabled?: boolean
}
```

Use the current project's Base UI dropdown correctly.

Important: Since previous Base UI error happened with `DropdownMenuLabel`, use proper `DropdownMenuGroup` wrappers or avoid label if not needed.

Do not reintroduce MenuGroupContext runtime error.

---

## 8. Enterprise PDF/Print Template Foundation

Create a basic enterprise template foundation now.

PDF/Print should include:

```text
Report title
Subtitle/module name
Generated by
Generated date/time
Applied filters if any
Table/list data
Page number
Footer text placeholder
```

For now, use placeholder company identity:

```text
Alliance Gulf ERP
Enterprise Report
```

Do not hardcode final legal letterhead deeply.

Add TODO/comment:

```text
Phase 002F will connect this template to App Settings and selected company letterhead.
```

PDF should be acceptable for internal use now, and ready to upgrade later.

---

## 9. Apply to Existing Admin Pages

### 9.1 Organizations

Add functional export menu to:

```text
/admin/organizations
```

Export columns should include at minimum:

- ID
- Company Code
- Legal Name English
- Legal Name Arabic
- Short Name
- Legal Form
- Country
- Emirate
- City
- TRN
- Trade License No
- Status
- Created At

If data is not available in the table but available in the query result, include it.

### 9.2 Branches

Export columns:

- ID
- Branch Code
- Branch Name English
- Branch Name Arabic
- Owner Company
- Branch Type
- Emirate
- City
- Area
- Has Workshop
- Has Warehouse
- Has Yard
- Has Weighbridge
- Operating Status
- Status

### 9.3 Users

Export columns:

- Profile ID
- User Code
- Full Name
- Display Name
- Email if safely available
- Job Title
- Department
- Owner Company
- Branch
- Status
- Roles
- Created At

Do not expose sensitive fields.

Do not export auth IDs unless required for admin diagnostic and clearly named.

### 9.4 Roles

Export columns:

- ID
- Role Code
- Role Name
- Display Name
- Description
- Category
- Level
- System Role
- Assignable
- Active
- Permissions Count

### 9.5 Permissions

Export columns:

- ID
- Permission Code
- Permission Name
- Display Name
- Module Code
- Action Code
- Description
- Visible
- System Permission
- Sort Order

### 9.6 Audit Logs

Export columns:

- ID
- Date/Time
- Actor
- Module
- Entity Name
- Entity ID
- Entity Reference
- Action
- Owner Company
- Branch

Do not export excessively large JSON old/new values in basic CSV/PDF unless user selects detail mode later.

---

## 10. Drawer/Detail Export

In drawer header, replace the disabled Actions placeholder with a safe working export menu **only if the needed current record data is available**.

If record data is not available to the drawer header, keep the button disabled and document:

```text
Detail/drawer export will be connected after form detail data abstraction.
```

Minimum requirement for this phase:

- List page exports must work.
- Drawer exports are allowed to remain placeholder if not yet safe.

Do not break drawer stability.

---

## 11. Audit Logging for Export Events

If there is already a safe audit helper that can be called without schema change, optionally log export events:

Actions:

```text
export_csv
export_excel
export_pdf
print
```

Module code should match page:

- organizations
- branches
- users
- roles
- permissions
- audit

If audit logging export events requires backend work or schema changes, defer and document.

Do not block export functionality on audit logging.

---

## 12. Security Requirements

- Export only data current user can already view.
- Do not bypass RLS.
- Do not use service-role for export.
- Do not export hidden sensitive fields.
- Do not export passwords, tokens, service keys, auth metadata.
- Do not expose internal UUID auth_user_id in normal exports.
- Export must use data already loaded by RLS-protected server queries or client-safe props.
- Export menu must not call protected APIs without permission.
- Audit logs export must respect audit visibility.

---

## 13. UI/UX Requirements

Export menu must be:

- visible in table toolbar/header
- compact and professional
- not oversized
- using existing shadcn/Base UI dropdown correctly
- disabled if no data
- show loading state if export generation takes time
- show success/error toast if available
- file names should be readable

Example file names:

```text
organizations_2026-05-27.xlsx
branches_2026-05-27.pdf
users_2026-05-27.csv
audit_logs_2026-05-27.pdf
```

---

## 14. Validation Required

Run:

```bash
npm run lint
npm run typecheck
npm run build
npm run dev
```

Manual test:

1. Open `/admin/organizations`.
2. Export CSV.
3. Export Excel.
4. Export PDF.
5. Print.
6. Open exported files and verify content.
7. Repeat for `/admin/branches`.
8. Repeat for `/admin/users`.
9. Repeat for `/admin/roles`.
10. Repeat for `/admin/permissions`.
11. Repeat for `/admin/audit`.
12. Confirm no MenuGroupContext runtime error.
13. Confirm no browser console errors.
14. Confirm no service-role exposure.
15. Confirm no backend/security files changed.

---

## 15. Required Screenshots / Artifacts

If possible, save:

```text
implementation_Review/screenshots/002E_2/
  002E_2_export_menu_organizations.png
  002E_2_export_menu_users.png
  002E_2_pdf_sample.png
  002E_2_print_preview.png
```

If file samples are generated, place test samples in:

```text
implementation_Review/export_samples/002E_2/
```

Do not commit large generated files unless useful and small.

---

## 16. Required Reports

Create:

```text
ERP_BASE_002E_2_INITIAL_REVIEW_REPORT.md
ERP_BASE_002E_2_IMPLEMENTATION_REPORT.md
ERP_BASE_002E_2_EXPORT_VALIDATION_REPORT.md
ERP_BASE_002E_2_SECURITY_REVIEW_REPORT.md
ERP_BASE_002E_2_NEXT_STEPS.md
```

Reports must include:

### Initial Review

- current export UI
- chosen packages
- chosen strategy
- pages to update
- risks

### Implementation Report

- utilities created
- components created
- pages updated
- packages installed
- file formats implemented
- drawer action behavior

### Export Validation

- CSV result
- Excel result
- PDF result
- Print result
- pages tested
- known issues

### Security Review

- no RLS bypass
- no service-role usage
- no secrets exported
- fields excluded
- backend/security files unchanged

### Next Steps

- 002E.3 email engine
- 002E.4 draft workflow
- 002F app settings/letterheads/master data/numbering

---

## 17. Acceptance Criteria

Phase 002E.2 is complete only if:

- Global export utilities exist.
- Reusable `ERPExportMenu` exists.
- CSV export works.
- Excel export works.
- PDF export works.
- Print works.
- Organizations export works.
- Branches export works.
- Users export works.
- Roles export works.
- Permissions export works.
- Audit logs export works.
- No MenuGroupContext error.
- No service-role usage.
- No RLS bypass.
- No secrets exposed.
- TypeScript passes.
- Build passes.
- Reports generated.

---

## 18. Final Instruction

Implement Phase 002E.2 only.

Do not implement email sending.

Do not implement draft workflow.

Do not implement app settings/master data.

Do not start Phase 003.

Stop after reports and validation.
