# PROMPT_ERP_BASE_002E_2A — Global List/Table Rules, Sorting, Column Resizing & Table Preferences

## 0. Required Cursor Persona

Act as a senior ERP UI/UX architect, TanStack Table specialist, Next.js App Router frontend engineer, TypeScript reviewer, SaaS settings/persistence designer, accessibility tester, and enterprise list-view standardization specialist.

You are working on the existing ERP Foundation application after:

- Phase 002D Admin Master Data Hardening
- Phase 002E.1 Global Right-Side Drawer Forms
- Phase 002E.1A/1B Drawer repair and audit
- Phase 002E.2 Global Print/PDF/Excel/CSV Export Engine

This phase is **Phase 002E.2A — Global List/Table Rules**.

This phase must be completed before **Phase 002E.3 Send by Email Engine**.

---

## 1. Purpose

Create a global reusable enterprise table/list standard for the whole ERP.

Every current and future list page must support:

1. Sorting for all sortable columns
2. Column resizing / expand / reduce width
3. Column visibility show/hide
4. Column order/reordering if practical
5. Persistent user table preferences
6. Global search / quick search
7. Filters
8. Pagination
9. Row selection
10. Export integration
11. Responsive horizontal scroll
12. Dense enterprise row layout
13. Consistent table header/action toolbar
14. Consistent empty/loading/error states

This foundation must be used by:

- Organizations
- Branches
- Users
- Roles
- Permissions
- Audit Logs
- All future HR/Fleet/DMS/Finance/Workshop modules

---

## 2. Why This Must Happen Now

The export engine was implemented in 002E.2.

Before 002E.3 email sending, list pages must have a standardized table state because export/email must later respect:

- current sorting
- current filters
- selected rows
- visible columns
- column order
- user preferences

This prevents rewriting every table later.

---

## 3. Strict Scope Control

### Implement in this phase

- Reusable global table component/pattern
- Sorting
- Column resizing
- Column visibility
- Row selection
- Pagination
- Search/filter toolbar standard
- Persistent table preferences
- Export menu integration with current table state
- Apply to current admin pages

### Do not implement in this phase

- Email sending
- Draft workflow
- App settings
- Letterhead settings
- Global master data
- New business modules
- New database schema unless required for table preferences

---

## 4. Critical Safety Rules

Do not modify unless explicitly required:

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
- database schema, unless a table-preferences migration is required and approved
- CRUD server actions
- audit logic

Do not run:

```bash
supabase db push
```

unless a new migration is created and user approves it.

Do not start Phase 002E.3.

---

## 5. Existing Table System to Inspect

Inspect current table/list components:

```text
src/components/tables/data-table.tsx
src/components/erp/data-toolbar.tsx
src/components/erp/export/erp-export-menu.tsx
src/features/organizations/organizations-table.tsx
src/features/branches/branches-table.tsx
src/features/users/users-table.tsx
src/features/roles/roles-table.tsx
src/features/permissions/permissions-matrix.tsx
src/features/audit/audit-logs-table.tsx
```

Also inspect existing admin pages:

```text
src/app/(protected)/admin/organizations/page.tsx
src/app/(protected)/admin/branches/page.tsx
src/app/(protected)/admin/users/page.tsx
src/app/(protected)/admin/roles/page.tsx
src/app/(protected)/admin/permissions/page.tsx
src/app/(protected)/admin/audit/page.tsx
```

Create:

```text
ERP_BASE_002E_2A_INITIAL_REVIEW_REPORT.md
```

The report must include:

- current table implementation status
- current TanStack usage
- current export integration
- gaps per page
- whether preferences require database storage or can start with localStorage
- implementation plan
- risk assessment

---

## 6. Recommended Technical Approach

Use TanStack Table features already available in the project.

Implement a reusable global enterprise table layer.

Suggested files:

```text
src/components/erp/table/
  erp-data-table.tsx
  erp-table-toolbar.tsx
  erp-column-visibility-menu.tsx
  erp-column-resizer.tsx
  erp-table-density-toggle.tsx
  erp-table-pagination.tsx
  erp-table-empty-state.tsx
  erp-table-loading-state.tsx
  erp-table-preferences.ts
  erp-table-types.ts
```

Or improve existing:

```text
src/components/tables/data-table.tsx
```

But avoid breaking existing tables.

Preferred approach:

- Create `src/components/erp/table/` as the new global standard.
- Gradually migrate current admin tables to it.
- Keep old `data-table.tsx` only if needed for backward compatibility.

---

## 7. Required Features

### 7.1 Column Sorting

Every sortable column should support:

- click header to sort ascending
- click again to sort descending
- click again to clear sort if practical
- visual sort indicator
- multi-sort optional, not required

Use TanStack sorting state.

### 7.2 Column Resizing

Every resizable column should support:

- drag column separator to resize
- min width
- max width where practical
- double-click to auto-size if practical
- cursor indicator
- persistent width preference

Use TanStack column sizing.

### 7.3 Column Visibility

User can show/hide columns from menu.

Required:

- columns menu
- checkbox per hideable column
- required columns can be locked visible
- reset to default columns

Column visibility should affect:

- table display
- export data if user chooses visible-columns export
- print/PDF if configured later

### 7.4 Column Order

If practical, support column reorder.

If too much for now, design the state and document it for later.

Minimum requirement:

- stable default column order
- preferences can later store order

### 7.5 Row Selection

Support:

- select one row
- select all visible rows
- selected rows count
- future bulk actions placeholder

Row selection should feed export behavior:

- export all filtered/list data
- export selected rows if selected rows exist

### 7.6 Pagination

Support:

- page size selector
- previous/next
- current page
- total rows if known
- 10/25/50/100 rows per page

If server-side pagination is not implemented yet, use client-side pagination for current admin pages and document server-side pagination for future large datasets.

### 7.7 Search and Filters

Global table toolbar should include:

- search input
- filter button/slot
- reset filters button
- export menu
- column visibility menu
- density toggle if implemented

Search can remain page-specific if data is already client-side.

### 7.8 Density Modes

Support:

- Comfortable
- Compact
- Dense

Default should be enterprise compact.

Persist density per user/table if practical.

### 7.9 Persistent Table Preferences

Implement preference persistence.

Preferred step now:

Use localStorage first with key:

```text
erp_table_prefs:{userProfileId or authUserId}:{tableId}
```

Persist:

- column widths
- column visibility
- density
- page size
- sorting if appropriate
- column order if implemented

Do not create database table yet unless strongly needed.

In Phase 002F App Settings, preferences may later be moved to database.

### 7.10 Export Integration

`ERPExportMenu` from 002E.2 must be integrated with table state.

Export menu should support:

- export selected rows if rows are selected
- otherwise export all loaded/filtered rows
- respect visible columns by default
- option later for all columns

Minimum now:

- export visible columns
- export selected rows if selected rows exist
- export current filtered table data

Avoid duplicating column definitions separately in every page if possible.

---

## 8. Required Table IDs

Every list/table must have stable table ID.

Examples:

```text
admin.organizations
admin.branches
admin.users
admin.roles
admin.permissions
admin.audit_logs
```

Future examples:

```text
hr.employees
fleet.vehicles
dms.documents
```

These IDs are required for preferences.

---

## 9. Apply to Existing Admin Pages

### 9.1 Organizations

Must support:

- sorting all visible columns
- resize columns
- show/hide columns
- search
- pagination
- row selection
- export selected/visible columns

### 9.2 Branches

Same as organizations.

### 9.3 Users

Same as organizations.

Special:

- roles column may be long; default width should be reasonable
- email/auth fields should not be exported unless safe and intended

### 9.4 Roles

Same standard.

### 9.5 Permissions

If currently matrix-based, keep matrix but add:

- export menu
- search/filter
- table/list view if practical

If matrix cannot be easily converted, document as partial and keep permission matrix.

### 9.6 Audit Logs

Must support:

- sorting by date/time
- filtering/search if available
- column visibility
- export visible/selected rows
- avoid exporting large JSON values by default

---

## 10. UI/UX Requirements

The table should look like enterprise ERP:

- compact header
- subtle borders
- sticky header if practical
- row hover
- selected row highlight
- visible resize handles
- no oversized row heights
- consistent status badges
- action column fixed to right if practical
- horizontal scroll for many columns
- no layout breaking on small screens

Avoid:

- childish styling
- too much whitespace
- huge buttons
- unclear sort icons
- table jumping during resize

---

## 11. Accessibility Requirements

- keyboard accessible column menus
- visible focus
- clear sort state
- checkboxes labeled
- row selection accessible
- no keyboard trap in menus
- screen-reader friendly labels where practical

---

## 12. Validation Required

Run:

```bash
npm run lint
npm run typecheck
npm run build
npm run dev
```

Manual test:

1. Open `/admin/organizations`.
2. Sort each column.
3. Resize columns.
4. Hide/show columns.
5. Select rows.
6. Export selected rows.
7. Export all/filtered rows.
8. Change page size.
9. Refresh page and confirm preferences persist.
10. Repeat for `/admin/branches`.
11. Repeat for `/admin/users`.
12. Repeat for `/admin/roles`.
13. Check `/admin/permissions`.
14. Check `/admin/audit`.
15. Confirm no MenuGroupContext errors.
16. Confirm no console errors.
17. Confirm export still works.

---

## 13. Required Screenshots / Artifacts

Create screenshots if possible:

```text
implementation_Review/screenshots/002E_2A/
  table_organizations_resized_columns.png
  table_organizations_column_visibility.png
  table_users_selected_rows.png
  table_roles_sorted.png
  table_audit_logs_export_menu.png
```

---

## 14. Required Reports

Create:

```text
ERP_BASE_002E_2A_INITIAL_REVIEW_REPORT.md
ERP_BASE_002E_2A_IMPLEMENTATION_REPORT.md
ERP_BASE_002E_2A_TABLE_VALIDATION_REPORT.md
ERP_BASE_002E_2A_SECURITY_REVIEW_REPORT.md
ERP_BASE_002E_2A_NEXT_STEPS.md
```

Reports must include:

### Initial Review

- existing table state
- gaps
- chosen implementation strategy
- localStorage vs database preferences decision

### Implementation Report

- components created/modified
- pages migrated
- table IDs
- sorting/resizing/visibility/persistence implementation
- export integration details

### Table Validation Report

- pages tested
- sorting test
- resizing test
- column visibility test
- row selection test
- export integration test
- preference persistence test

### Security Review

- no RLS bypass
- no service-role usage
- no sensitive field export
- no backend/security changes
- localStorage content review

### Next Steps

- 002E.3 email engine
- 002E.4 draft workflow
- 002F app settings/master data/numbering

---

## 15. Acceptance Criteria

Phase 002E.2A is complete only if:

- Global enterprise table component/pattern exists.
- Sorting works on admin tables.
- Column resizing works.
- Column visibility works.
- Row selection works.
- Pagination/page size works.
- Preferences persist after refresh.
- Export respects selected/visible rows where practical.
- Organizations table migrated.
- Branches table migrated.
- Users table migrated.
- Roles table migrated.
- Audit logs table migrated.
- Permissions handled or documented.
- TypeScript passes.
- Build passes.
- No MenuGroupContext error.
- No backend/RLS/Auth regression.
- Reports generated.

---

## 16. Final Instruction

Implement Phase 002E.2A only.

Do not implement email engine.

Do not implement draft workflow.

Do not implement app settings/master data.

Do not start Phase 003.

Stop after reports and validation.
