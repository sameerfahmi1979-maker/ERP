# PROMPT_ERP_BASE_002E_2B — Fix Export to Respect Selected Rows, Visible Columns, Sorting & Filtered Table State

## 0. Required Cursor Persona

Act as a senior ERP QA lead, TanStack Table specialist, Next.js App Router frontend engineer, TypeScript reviewer, export/reporting engine specialist, SaaS security tester, and enterprise table UX auditor.

You are working on the existing ERP Foundation application after:

- Phase 002E.2 — Global Print/PDF/Excel/CSV Export Engine
- Phase 002E.2A — Global List/Table Rules, Sorting, Column Resizing & Table Preferences

This phase is **Phase 002E.2B — Export/Table-State Fix**.

The user found a critical issue:

> When selecting records and exporting or printing, the system still exports/prints all records instead of selected records.

This must be fixed before Phase 002E.3 Email Engine.

---

## 1. Current Known Problem

The 002E.2A implementation report documented this known limitation:

- Export currently exports all loaded data.
- Export does not respect selected rows.
- Export does not respect hidden/visible columns.
- Export does not respect current sorting.

This is no longer acceptable because the table now supports:

- row selection
- sorting
- column visibility
- search/filtering
- pagination
- user preferences

Export must follow the current table state.

---

## 2. Phase Purpose

Fix global export behavior so that Print/PDF/Excel/CSV respects:

1. Selected rows
2. Visible columns
3. Current filtered/search result
4. Current sorting
5. Current table state
6. Sensitive-field restrictions

This must apply globally to current admin tables and future tables.

---

## 3. Strict Scope Control

### Implement only

- Table-state-aware export
- Selected rows export
- Visible columns export
- Filtered/sorted row export
- Export mode labels/messages
- Validation/testing/reports

### Do not implement

- Email sending
- Draft workflow
- App settings
- Letterhead settings
- Global master data
- New database schema
- New business modules
- Phase 003

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

Do not change:

- Supabase Auth
- RLS policies
- service-role handling
- CRUD server actions
- audit logic

Do not run:

```bash
supabase db push
```

No database migration is required for this phase.

---

## 5. Files to Inspect

Inspect the current table/export implementation:

```text
src/components/erp/table/erp-data-table.tsx
src/components/erp/table/erp-table-types.ts
src/components/erp/table/erp-table-preferences.ts
src/components/erp/table/erp-column-menu.tsx
src/components/erp/export/erp-export-menu.tsx
src/lib/export/export-types.ts
src/lib/export/format-export-data.ts
src/lib/export/csv.ts
src/lib/export/excel.ts
src/lib/export/pdf.ts
src/lib/export/print.ts
```

Inspect migrated tables/pages:

```text
src/features/organizations/organizations-table.tsx
src/features/branches/branches-table.tsx
src/features/users/users-table.tsx
src/features/roles/roles-table.tsx
src/features/audit/audit-logs-table.tsx
src/features/permissions/permissions-matrix.tsx

src/app/(protected)/admin/organizations/page.tsx
src/app/(protected)/admin/branches/page.tsx
src/app/(protected)/admin/users/page.tsx
src/app/(protected)/admin/roles/page.tsx
src/app/(protected)/admin/permissions/page.tsx
src/app/(protected)/admin/audit/page.tsx
```

Create first:

```text
ERP_BASE_002E_2B_EXPORT_STATE_INITIAL_REVIEW_REPORT.md
```

The report must identify:

- why selected rows are ignored
- where export data is currently created
- whether `ERPExportMenu` receives raw page data or table-state data
- how selected/visible/sorted/filtered rows can be passed safely
- which pages/tables are affected

---

## 6. Required Export Behavior

### 6.1 Export row priority

When user exports from a table:

#### Priority 1 — Selected rows

If one or more rows are selected:

```text
Export selected rows only.
```

The export file title/subtitle should indicate:

```text
Selected rows export
Rows exported: X selected rows
```

#### Priority 2 — Filtered/searched rows

If no rows are selected but search/filter is active:

```text
Export all currently filtered/searched rows.
```

Not only current page unless specifically configured.

#### Priority 3 — Sorted full loaded dataset

If no selection and no filter:

```text
Export all loaded rows using current sorting.
```

### 6.2 Visible column behavior

By default, export only the currently visible/exportable columns.

Hidden columns should not appear in:

- CSV
- Excel
- PDF
- Print

Exception:

- columns explicitly marked as `alwaysExport: true` can be exported even if hidden, but only if designed.

For now, default to visible columns only.

### 6.3 Non-exportable columns

Never export UI-only columns:

- select checkbox
- actions menu
- row action buttons
- internal UI-only cells

Columns should support metadata such as:

```ts
meta: {
  exportable?: boolean
  exportHeader?: string
  exportValue?: (row) => string | number | boolean | null | undefined
}
```

If metadata is already designed differently, use project style.

### 6.4 Sensitive fields

Do not export:

- passwords
- tokens
- service keys
- `auth_user_id`
- raw auth metadata
- hidden service fields
- large audit `old_values` / `new_values` JSON by default

---

## 7. Required Technical Design

### 7.1 Table-state export source

Implement a way for `ERPDataTable` to derive export data from the current TanStack table instance.

Use TanStack models:

```ts
table.getSelectedRowModel().rows
table.getFilteredRowModel().rows
table.getSortedRowModel().rows
table.getRowModel().rows
table.getVisibleLeafColumns()
```

Recommended logic:

```ts
const selectedRows = table.getSelectedRowModel().rows
const exportRows =
  selectedRows.length > 0
    ? selectedRows
    : table.getFilteredRowModel().rows

const exportColumns = table
  .getVisibleLeafColumns()
  .filter(column => column.id !== "select" && column.id !== "actions")
  .filter(column => column.columnDef.meta?.exportable !== false)
```

Important:

- Ensure the row model reflects current sorting and filtering.
- Use row.original for raw object where needed.
- Use export value helpers for complex cells.

### 7.2 Export column mapping

Bridge TanStack columns to existing `ERPExportColumn`.

The export column should use:

- column header text
- optional `meta.exportHeader`
- optional `meta.exportValue`
- fallback accessorKey/accessorFn result

Recommended additions to `ERPTableColumnMeta`:

```ts
declare module "@tanstack/react-table" {
  interface ColumnMeta<TData, TValue> {
    exportable?: boolean
    exportHeader?: string
    exportValue?: (row: TData) => string | number | boolean | null | undefined
    required?: boolean
  }
}
```

If TypeScript module augmentation already exists, extend it carefully.

### 7.3 Export menu ownership

Preferred implementation:

Move `ERPExportMenu` inside `ERPDataTable` toolbar or allow `ERPDataTable` to render export using table state.

Possible API:

```tsx
<ERPDataTable
  tableId="admin.organizations"
  data={organizations}
  columns={columns}
  exportOptions={{
    title: "Organizations Report",
    filename: "organizations",
    subtitle: "Owner company master data",
    generatedBy: userName,
  }}
/>
```

Then `ERPDataTable` internally passes state-aware data/columns to `ERPExportMenu`.

Alternative:

Expose a render prop:

```tsx
exportSlot={(table) => (
  <ERPExportMenu
    ...
    data={getExportRows(table)}
    columns={getExportColumns(table)}
  />
)}
```

Choose the least disruptive and most reusable option.

### 7.4 Visual feedback

Export menu should show clearly:

- If rows selected:
  - `Export selected (3)`
- If no rows selected:
  - `Export filtered/all`
- Optional tooltip:
  - “Select rows to export only selected records.”

When no data:

- Export disabled.

---

## 8. Pages That Must Be Fixed

Apply corrected export behavior to:

```text
/admin/organizations
/admin/branches
/admin/users
/admin/roles
/admin/audit
```

Handle `/admin/permissions` separately because it uses matrix layout.

For permissions:

- if matrix export uses current data only and has no row selection, document it.
- if table state is not applicable, keep export all visible permission matrix data.

---

## 9. Required Manual Test Cases

### Organizations

1. Open `/admin/organizations`.
2. Select exactly 2 rows.
3. Export CSV.
4. Confirm CSV contains only 2 records.
5. Export Excel.
6. Confirm Excel contains only 2 records.
7. Export PDF.
8. Confirm PDF contains only 2 records.
9. Print.
10. Confirm print preview contains only 2 records.
11. Hide a column and export.
12. Confirm hidden column is not exported.

### Branches

Repeat selected-row and visible-column test.

### Users

Repeat selected-row and visible-column test.
Confirm no `auth_user_id` exported.

### Roles

Repeat selected-row and visible-column test.

### Audit Logs

Repeat selected-row and visible-column test.
Confirm large JSON old/new values are not exported.

### Search/filter behavior

1. Search for a term.
2. Do not select rows.
3. Export CSV.
4. Confirm only filtered/search result rows are exported.

### Sorting behavior

1. Sort a column descending.
2. Export PDF.
3. Confirm exported order matches sorted table order.

---

## 10. Validation Required

Run:

```bash
npm run lint
npm run typecheck
npm run build
npm run dev
```

Confirm:

- no TypeScript errors
- no build errors
- no MenuGroupContext error
- export menu works
- selected row export works
- hidden columns excluded
- sensitive fields excluded

---

## 11. Required Screenshots / Samples

Create screenshots if possible:

```text
implementation_Review/screenshots/002E_2B/
  selected_rows_before_export.png
  export_menu_selected_rows.png
  column_visibility_hidden_column.png
```

Create small export samples if possible:

```text
implementation_Review/export_samples/002E_2B/
  organizations_selected_rows.csv
  organizations_selected_rows.xlsx
  organizations_selected_rows.pdf
```

Do not commit large files.

---

## 12. Required Reports

Create:

```text
ERP_BASE_002E_2B_EXPORT_STATE_INITIAL_REVIEW_REPORT.md
ERP_BASE_002E_2B_IMPLEMENTATION_REPORT.md
ERP_BASE_002E_2B_EXPORT_VALIDATION_REPORT.md
ERP_BASE_002E_2B_SECURITY_REVIEW_REPORT.md
ERP_BASE_002E_2B_NEXT_STEPS.md
```

Reports must include:

### Initial Review

- root cause of selected rows not used
- affected components
- chosen design

### Implementation Report

- files modified
- table/export API changes
- selected row export behavior
- visible column export behavior
- filtered/sorted export behavior

### Validation Report

- selected rows test
- hidden column test
- sorting test
- search/filter test
- CSV/Excel/PDF/Print results

### Security Review

- no sensitive field export
- no RLS bypass
- no service-role usage
- no backend/security file changes
- localStorage/table preferences safety

### Next Steps

- 002E.3 Email Engine
- 002E.4 Draft workflow
- 002F App Settings/Master Data/Numbering

---

## 13. Acceptance Criteria

Phase 002E.2B is complete only if:

- Selecting rows exports selected rows only.
- Printing selected rows prints selected rows only.
- PDF selected rows contains selected rows only.
- Excel selected rows contains selected rows only.
- CSV selected rows contains selected rows only.
- Hidden columns are not exported.
- UI-only columns are not exported.
- Search/filter exports filtered result when no rows selected.
- Sorting order is respected in export.
- Sensitive fields are excluded.
- Organizations fixed.
- Branches fixed.
- Users fixed.
- Roles fixed.
- Audit logs fixed.
- Permissions documented/fixed as applicable.
- TypeScript passes.
- Build passes.
- Reports generated.

---

## 14. Final Instruction

Fix export/table-state behavior only.

Do not implement email.

Do not implement draft workflow.

Do not implement app settings/master data.

Do not start Phase 003.

Stop after reports and validation.
