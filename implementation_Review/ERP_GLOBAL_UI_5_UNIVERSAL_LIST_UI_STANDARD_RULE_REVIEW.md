# ERP GLOBAL UI.5 — Universal List UI Standard Rule Review

**Date:** 2026-07-02  
**Phase:** ERP GLOBAL UI.5 (Rule creation only — no implementation)  
**Status:** Rule file created — awaiting review/approval before UI.5A pilot

---

## Objective

Create a reusable Cursor rule that standardizes all ERP list/table screens using the live **All Documents** screen as the approved visual reference.

---

## Files Inspected (All Documents Reference)

| File | What was extracted |
|------|-------------------|
| `src/app/(protected)/dms/documents/page.tsx` | Page shell: `p-6 space-y-4`, `ERPPageHeader`, permission gate, server data fetch |
| `src/features/dms/documents/dms-documents-table.tsx` | Two-row toolbar, search input, labeled filter panel, active filter chips, custom `table-fixed` grid, row actions, pagination footer, result count, AI/semantic search modes |
| `src/components/erp/page-header.tsx` | Title (`text-2xl font-semibold`), description, breadcrumbs, bottom border |
| `src/features/dms/documents/dms-document-status-badge.tsx` | Compact outline badge pattern + per-status color map |
| `src/features/dms/documents/dms-expiry-badge.tsx` | Module-specific date/status badge (referenced for expiry column) |
| `src/components/erp/table/sort-col-header.tsx` | Sortable + resizable column headers |
| `src/components/erp/table/table-pagination.tsx` | Rows-per-page + range + nav controls |
| `src/components/erp/table/use-resizable-columns.ts` | Drag resize + localStorage persistence |
| `src/hooks/use-sort-paginate.ts` | Client sort + pagination for custom tables |

---

## Existing Shared Components & Patterns Found

| Component / Pattern | Path | Notes |
|---------------------|------|-------|
| **ERPDataTable** | `src/components/erp/table/erp-data-table.tsx` | TanStack Table — sort, resize, visibility, selection, export, route-scoped localStorage prefs. Used by Party Master, Finance Basics, Geography, UOM, Users, Audit, etc. |
| **SortColHeader** | `src/components/erp/table/sort-col-header.tsx` | Used by DMS custom tables (documents, renewals, expiry, batch list, admin tables) |
| **TablePagination** | `src/components/erp/table/table-pagination.tsx` | Shared footer used by All Documents |
| **useResizableColumns** | `src/components/erp/table/use-resizable-columns.ts` | New shared hook (extracted from batch review queue pattern) |
| **ERPCombobox** | `src/components/erp/combobox/` | Required for filter dropdowns per `erp-combobox-standard.mdc` |
| **ERPPageHeader** | `src/components/erp/page-header.tsx` | Standard list page title area |
| **useWorkspaceTableState** | `src/hooks/use-workspace-table-state.ts` | For custom lists needing tab-switch state cache (workspace Rule 17) |

### Related existing rules (not replaced — cross-referenced)

| Rule | Relevance |
|------|-----------|
| `.cursor/rules/erp-combobox-standard.mdc` | Filter dropdowns |
| `.cursor/rules/erp-workspace-tabs-standard.mdc` Rule 17 | List state persistence |
| `.cursor/rules/erp-dropdown-zindex-standard.mdc` | Combobox stacking |
| `docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md` §15 | ERPDataTable feature list |

---

## Rule File Created

```text
.cursor/rules/erp-global-list-ui-standard.mdc
```

Includes all required sections from the UI.5 prompt:
Purpose, Approved Visual Reference, Applies To, Non-Goals, Core Principle, List Page Layout, Search Bar and Toolbar Standard, Table/List Container Standard, Column Strategy, Sorting/Filtering/Pagination, Column Width and Visibility, Icons and Row Actions, Status Badges, Empty/Loading/Error States, Permission-Aware Actions, Responsive and Overflow Behavior, Existing Screens Migration Rule, Future Screens Rule, Implementation Requirements, QA Checklist.

---

## Key Design Decisions Captured in the Rule

1. **All Documents is the visual reference** — not a hypothetical mockup. Exact Tailwind tokens extracted from live code (`h-8` search, `bg-muted/10` filter panel, `text-xs table-fixed`, `h-6 w-6` row actions, etc.).

2. **Two implementation paths allowed:**
   - **ERPDataTable** — preferred for new lists and gradual migration (already has resize, visibility, prefs).
   - **Custom table stack** — All Documents pattern (`SortColHeader` + `useSortPaginate` + `TablePagination` + `useResizableColumns`).

3. **Two-row toolbar is mandatory** when filters exist: search row + labeled ERPCombobox filter panel + active filter chips.

4. **Core principle enforced:** lists show summary columns only; full detail lives in record workspace forms.

5. **No implementation in this phase** — rule only.

---

## Risks & Recommendations Before Implementation

| Risk | Recommendation |
|------|----------------|
| **Dual table stacks** — many screens use `ERPDataTable`, All Documents uses custom `<table>` | UI.5A pilot should pick one path: either migrate pilot to All Documents toolbar styling while keeping ERPDataTable, or convert pilot to full custom stack. Do not mix visual styles. |
| **ERPDataTable toolbar differs** — built-in search row doesn't yet match All Documents two-row filter panel | UI.5A may need a small shared `ERPListToolbar` component extracted from All Documents before wide migration. |
| **All Documents loads all records client-side** | Acceptable for current DMS volume; rule notes server-side pagination requirement for large datasets. Future DMS work may need server-side filter API. |
| **Status badge colors are module-local today** | Rule defines hue families; UI.5B could extract `ERPStatusBadge` base component from DMS pattern. |
| **Column visibility missing on All Documents custom table** | All Documents has resize but no visibility menu yet. Rule requires visibility for wide lists — All Documents itself may need a follow-up tweak in UI.5A or a dedicated DMS list polish pass. |
| **15+ ERPDataTable screens** | Gradual migration; do not big-bang rewrite. |

---

## Screens Using ERPDataTable (migration candidates)

Non-exhaustive sample from codebase grep:
- `src/features/master-data/parties/parties-table.tsx`
- `src/features/master-data/finance-basics/components/*-table.tsx`
- `src/features/master-data/geography/components/*-table.tsx`
- `src/features/master-data/uom/components/*-table.tsx`
- `src/features/users/users-table.tsx`
- `src/features/audit/audit-logs-table.tsx`
- `src/features/numbering/components/numbering-rules-table.tsx`

DMS custom-table screens (already closer to reference):
- `dms-documents-table.tsx` ← **reference**
- `dms-renewal-requests-table.tsx`
- `dms-expiring-documents-table.tsx`
- `dms-batch-list-client.tsx`
- DMS admin tables (categories, tags, document types, retention policies)

---

## Suggested Next Phase

```text
ERP GLOBAL UI.5A — Apply Universal List UI Standard Pilot
```

**Recommended pilot:** One non-DMS list that uses `ERPDataTable` today (e.g. **Finance Basics → Banks** or **Party Master → All Parties**) — apply All Documents two-row toolbar + filter chip pattern, verify visual parity, then expand.

**Alternative pilot:** Polish another DMS custom table (e.g. Renewals or Expiring Documents) to 100% match All Documents — lower risk, less cross-module value.

**Success criteria for UI.5A:**
- Side-by-side visual comparison with `/dms/documents` passes QA checklist in rule file
- No business logic / permission / API changes
- Workspace tab state still persists correctly

---

## Deliverables Checklist

- [x] `.cursor/rules/erp-global-list-ui-standard.mdc` created
- [x] This review note created
- [x] No list screen code modified (planning-only phase respected)
- [x] No API / DB / RLS / permission changes
