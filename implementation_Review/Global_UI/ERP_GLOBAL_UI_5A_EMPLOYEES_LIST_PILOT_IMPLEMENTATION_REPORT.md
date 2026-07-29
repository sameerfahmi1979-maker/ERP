# ERP GLOBAL UI.5A — Employees List Pilot Implementation Report

**Date:** 2026-07-02  
**Phase:** ERP GLOBAL UI.5A (Employees list pilot)  
**Status:** Implemented — ready for review  
**Visual reference:** All Documents (`src/features/dms/documents/dms-documents-table.tsx`)

---

## Objective

Apply the Universal List UI Standard (`.cursor/rules/erp-global-list-ui-standard.mdc`) to the **Employees list only**, matching All Documents toolbar, filters, table, badges, row actions, and pagination behavior without backend or permission changes.

---

## Files Changed

| File | Change |
|------|--------|
| `src/app/(protected)/admin/hr/employees/page.tsx` | Replaced `Card` wrapper with `ERPPageHeader` + `p-6 space-y-4`; moved `HrReportsMenu` to header actions; default page size 25 |
| `src/features/hr/employees/employees-table.tsx` | Full UI.5 rewrite: two-row toolbar, labeled `ERPCombobox` filters, filter chips, resizable/sortable table, inline row actions, `TablePagination`, workspace table state |
| `src/features/hr/employees/employee-status-badge.tsx` | **New** — compact outline status badges aligned with UI.5 color map |

---

## UI.5 Alignment Summary

### Page shell
- `ERPPageHeader` with breadcrumbs (HR → Employees), description, and reports menu in `actions`
- Content area: `p-6 space-y-4` (matches All Documents / DMS documents page)

### Toolbar row 1
- Full-width search input with `Search` icon (`h-8`, `pl-8`, debounced server fetch)
- Right cluster: **Columns** menu (nationality visibility), **Refresh**, **Add Employee** (permission-gated)

### Toolbar row 2
- `rounded-lg border bg-muted/10 p-3` filter panel
- Labeled uppercase micro-labels + searchable `ERPCombobox` filters: Status, Company, Department, Designation, Nationality
- Cascading reset: company change clears department/designation; department change clears designation
- Active filter chips + **Clear all**

### Table
- Custom `table-fixed` + `text-xs` inside `rounded-md border overflow-x-auto`
- Resizable columns via `useResizableColumns` (localStorage key: `hr-employees-table-col-widths-v1`)
- Client-side sort on current page via `SortColHeader` (server API has no sort params — documented limitation)
- Default columns: Code, Name, Department, Designation, Status, Company, Actions
- **Nationality** optional via column visibility (hidden by default — secondary detail)

### Row actions (UI.5 inline icons)
- View (`ExternalLink`), Edit (`Edit`), Archive (`Archive`) — ghost `h-6 w-6` buttons
- No nested `Button` inside `DropdownMenuTrigger`
- Archive confirmation via `AlertDialog`

### Status badges
- `EmployeeStatusBadge` — outline badges, `text-[10px]`, per-status color tokens matching UI.5 map

### Pagination & counts
- `TablePagination` with rows-per-page selector
- Footer: “Showing X–Y of Z employees”

### State persistence
- `useWorkspaceTableState` for search, filters, pagination, column visibility on route `/admin/hr/employees`

---

## Permissions (unchanged)

| Action | Permission |
|--------|------------|
| View list | `hr.employees.view` or `system_admin` |
| Add | `hr.employees.create` or `system_admin` |
| Edit | `hr.employees.update` or `system_admin` |
| Archive | `hr.employees.archive` or `system_admin` |

---

## Backend / Scope Boundaries

- **No** schema, migration, RLS, or server action logic changes
- Reuses existing `listEmployees`, `listDepartments`, `listDesignations`, `archiveEmployee`
- Server-side pagination and filtering preserved; sort is client-only on the current page

---

## QA Checklist

| # | Check | Result |
|---|-------|--------|
| 1 | TypeScript (`npx tsc --noEmit`) | Pass |
| 2 | Lint on changed files | No new issues on pilot files |
| 3 | Page loads with `ERPPageHeader` (no Card wrapper) | Manual verify |
| 4 | Search debounces and resets to page 1 | Manual verify |
| 5 | Each filter uses searchable combobox with label | Implemented |
| 6 | Filter chips appear and Clear all works | Implemented |
| 7 | Column resize persists after refresh | Implemented (localStorage) |
| 8 | Nationality column toggle in Columns menu | Implemented |
| 9 | Inline View/Edit/Archive icons (no row dropdown) | Implemented |
| 10 | Add Employee opens workspace tab | Implemented |
| 11 | Archive dialog + toast on success | Implemented |
| 12 | Table horizontal scroll contained in border | Implemented (`overflow-x-auto`) |
| 13 | Visual parity with All Documents toolbar/table | Manual compare recommended |

---

## Known Limitations

1. **Sort is client-side only** — `listEmployees` returns a fixed `employee_code asc` order from the server; column header sort reorders the current page only.
2. **No shared `ERPListToolbar` component** — pattern copied inline from All Documents to avoid breaking other lists (per pilot scope).
3. **Browser screenshots** — not captured in this session; recommend side-by-side compare with `/dms/documents` in dev.

---

## Recommendation — Next Rollout Screen

**Finance Basics → Banks** (`/admin/master-data/finance-basics/banks`) or **Party Master customers view** are good candidates:

- Both already use `ERPDataTable` with partial UI.5 features
- Banks list is smaller scope than full Party Master
- Migrating Banks would validate ERPDataTable path vs custom All Documents path documented in UI.5 rule

Alternatively, **DMS Renewals** or **Expiry dashboard** tables already use `SortColHeader` + resizable columns and would need mainly toolbar/filter chip alignment.

---

## Rollback

Revert the three files listed above to restore the legacy Card + shadcn Table + dropdown row actions layout.
