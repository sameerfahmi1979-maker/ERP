# PROMPT_ERP_BASE_002E_2C — Fix Remaining Export Selection Bug and Base UI nativeButton Error

## 0. Required Cursor Persona

Act as a senior ERP QA lead, Next.js App Router runtime tester, Base UI/shadcn integration specialist, TanStack Table expert, export/reporting engine engineer, Playwright/browser validation engineer, TypeScript reviewer, and SaaS security auditor.

You are working after:

- Phase 002E.2 — Global Print/PDF/Excel/CSV Export Engine
- Phase 002E.2A — Global List/Table Rules
- Phase 002E.2B — Export/Table-State Fix

The user manually tested and confirmed two problems still exist:

1. Export/print still exports all records even when specific rows are selected.
2. A new Base UI console/runtime error appears from `AppHeader`.

This phase is **002E.2C — Final Export/Table-State & Base UI Runtime Fix**.

Do not start 002E.3 Email Engine.

Do not start Draft Workflow.

Do not start App Settings/Master Data.

Do not start Phase 003.

---

## 1. Current User-Reported Error

The browser shows this console error:

```text
Base UI: A component that acts as a button expected a non-<button> because the nativeButton prop is false.
Rendering a <button> keeps native behavior while Base UI applies non-native attributes and handlers, which can add unintended extra attributes such as role or aria-disabled.
Use a non-<button> in the render prop, or set nativeButton to true.
```

Stack trace:

```text
DropdownMenuItem
src/components/ui/dropdown-menu.tsx:86

AppHeader
src/components/layout/app-header.tsx:115

ErpShell
src/components/layout/erp-shell.tsx:20

ProtectedLayout
src/app/(protected)/layout.tsx:28
```

This must be fixed.

---

## 2. Current Export Bug

The user selected records in the table, then exported/printed, but the generated output still contained all records.

This means 002E.2B is not functionally correct even if TypeScript/build passed.

The existing 002E.2B report claims:

- selected rows export only selected rows
- hidden columns are excluded
- sorting/filtering respected

But user testing contradicts this.

Therefore, perform real browser-level validation, not only code review.

---

## 3. Strict Safety Rules

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
- database schema
- service-role handling
- CRUD server actions
- audit logic

Do not run:

```bash
supabase db push
```

No database migration is required.

Do not implement email, draft, app settings, master data, or Phase 003.

---

## 4. Task A — Fix Base UI nativeButton Error in AppHeader

Inspect:

```text
src/components/layout/app-header.tsx
src/components/ui/dropdown-menu.tsx
```

Find line around:

```text
src/components/layout/app-header.tsx:115
```

Likely issue:

A `DropdownMenuItem` is rendering or wrapping a `<button>` while Base UI expects a non-button element, or `nativeButton` is not set correctly.

### Allowed fixes

Use the pattern required by this project’s Base UI implementation.

Possible approaches:

#### Option A — Set `nativeButton={true}`

If `DropdownMenuItem` supports a `nativeButton` prop and the rendered element should be a real button, set:

```tsx
<DropdownMenuItem nativeButton>
  ...
</DropdownMenuItem>
```

Only do this if supported by the local component wrapper.

#### Option B — Use `render` prop with non-button element

If the dropdown item is using render prop, render a non-button such as:

```tsx
<DropdownMenuItem
  render={<div />}
>
  ...
</DropdownMenuItem>
```

or the local equivalent.

#### Option C — Avoid nested button

If `DropdownMenuItem` contains a child `<button>`, replace the child button with a `div`, `span`, or call action directly on the menu item.

Do not introduce nested buttons.

Do not break logout/user menu/theme behavior.

### Validate

Open header user menu/theme/menu interactions and confirm no nativeButton warning.

---

## 5. Task B — Diagnose Why Export Still Ignores Selected Rows

Inspect:

```text
src/components/erp/table/erp-data-table.tsx
src/components/erp/table/erp-table-types.ts
src/components/erp/export/erp-export-menu.tsx
src/lib/export/*
src/features/organizations/organizations-table.tsx
src/features/branches/branches-table.tsx
src/features/users/users-table.tsx
src/features/roles/roles-table.tsx
src/features/audit/audit-logs-table.tsx
```

Confirm:

1. Is `ERPExportMenu` rendered inside `ERPDataTable`?
2. Does `ERPExportMenu` receive dynamic export data from the table instance?
3. Does the export data recompute when row selection changes?
4. Is `rowSelection` state controlled correctly?
5. Is the selected checkbox column connected to TanStack row selection?
6. Are row IDs stable and unique?
7. Is the selected row count visible in the UI?
8. Does the export click handler close over stale initial data?
9. Is selected row export logic using `table.getSelectedRowModel().rows`?
10. Is it accidentally using raw `data` prop instead?

---

## 6. Required Correct Export Logic

Implement or correct this logic inside the client-side table/export layer:

```ts
const selectedRows = table.getSelectedRowModel().rows

const exportRows =
  selectedRows.length > 0
    ? selectedRows
    : table.getFilteredRowModel().rows

const exportData = exportRows.map((row) => row.original)
```

Important:

- If rows are selected, export selected rows only.
- If no rows are selected but search/filter is active, export filtered rows.
- If no selection and no filter, export all loaded rows.
- Export should follow current sorting.
- Export should not be limited to current pagination page unless explicitly selected on page only.
- If current implementation uses `getFilteredRowModel()` and sorting is not applied, use the correct sorted/filtered model order from TanStack.

If needed, use:

```ts
table.getPrePaginationRowModel().rows
```

or the appropriate TanStack row model that reflects filtered/sorted rows before pagination.

Document the exact model chosen and why.

---

## 7. Required Column Export Logic

Export only visible/exportable columns.

```ts
const exportColumns = table
  .getVisibleLeafColumns()
  .filter((column) => column.id !== "select")
  .filter((column) => column.id !== "actions")
  .filter((column) => column.columnDef.meta?.exportable !== false)
```

Hidden columns must not export.

UI-only columns must not export.

Sensitive fields must not export.

---

## 8. Required Manual Browser Validation

This task is not complete unless tested in the browser.

Test at minimum:

### Organizations

1. Open `/admin/organizations`.
2. Select exactly 2 rows.
3. Export CSV.
4. Open/download file and verify it contains only 2 records.
5. Export Excel and verify only 2 records.
6. Export PDF and verify only 2 records.
7. Print and verify print preview/output only includes 2 records.
8. Hide one visible column.
9. Export CSV again and verify hidden column is not included.

### Branches

Repeat selected-row test for CSV and PDF.

### Users

Repeat selected-row test.
Confirm no `auth_user_id`, password, or sensitive field exported.

### Roles

Repeat selected-row test.

### Audit Logs

Repeat selected-row test.
Confirm large `old_values`/`new_values` JSON is not exported.

### Search/filter

1. Search for a term.
2. Do not select rows.
3. Export CSV.
4. Confirm only search-filtered rows are exported.

### Sorting

1. Sort a column descending.
2. Export.
3. Confirm exported order matches current table order.

If automated file inspection is possible, use it. If not, manually inspect downloaded CSV/Excel/PDF.

---

## 9. Add Debugging Aid Temporarily if Needed

During development only, you may add console debug logs such as:

```ts
console.debug("Export mode", {
  selectedCount,
  filteredCount,
  finalExportCount,
  visibleColumnIds,
})
```

But remove or disable them before final build unless behind a dev-only guard.

Final production code should not spam console.

---

## 10. Required Reports

Create/update:

```text
ERP_BASE_002E_2C_EXPORT_RUNTIME_FIX_REPORT.md
ERP_BASE_002E_2C_BROWSER_VALIDATION_REPORT.md
ERP_BASE_002E_2C_SECURITY_REVIEW_REPORT.md
ERP_BASE_002E_2C_NEXT_STEPS.md
```

Reports must include:

### Runtime Fix Report

- root cause of Base UI nativeButton error
- file/line fixed
- exact solution used
- confirmation AppHeader menu works

### Export Fix Report

- root cause of selected rows being ignored
- exact table row model used
- exact column visibility/export logic
- files modified
- pages fixed

### Browser Validation Report

- selected row export results
- hidden column export results
- search/filter export results
- sorting export results
- Print/PDF/Excel/CSV status

### Security Review

- no RLS bypass
- no service-role usage
- no sensitive field export
- no backend/security file changes
- no database changes

---

## 11. Validation Commands

Run:

```bash
npm run lint
npm run typecheck
npm run build
npm run dev
```

Confirm:

- TypeScript passes
- build passes
- no Base UI nativeButton warning
- no MenuGroupContext warning
- selected row export works
- hidden columns excluded

---

## 12. Acceptance Criteria

002E.2C is complete only if:

- AppHeader Base UI nativeButton error is fixed.
- Selecting rows exports selected rows only.
- Printing selected rows prints selected rows only.
- PDF selected rows contains selected rows only.
- Excel selected rows contains selected rows only.
- CSV selected rows contains selected rows only.
- Hidden columns are excluded.
- UI-only columns excluded.
- Search/filter export works when no rows selected.
- Sorting order is respected.
- Sensitive fields are excluded.
- Organizations fixed.
- Branches fixed.
- Users fixed.
- Roles fixed.
- Audit logs fixed.
- TypeScript passes.
- Build passes.
- Browser validation completed.
- Reports generated.

---

## 13. Final Instruction

Fix only the remaining export/table-state bug and AppHeader Base UI error.

Do not start email engine.

Do not start draft workflow.

Do not start app settings/master data.

Do not start Phase 003.

Stop after reports and validation.
