# ERP Global Workspace Open Element Cache Standard

**Phase:** ERP GLOBAL UI.4E  
**Status:** IMPLEMENTED  
**Last updated:** 2026-06-14

---

## 1. Purpose

The ALGT ERP workspace must behave like a professional multi-tab ERP workspace. When a user opens a screen, applies filters or searches, navigates to another workspace tab, and returns, their context must be preserved.

This document defines what may be cached, how it is scoped, and how the cache hooks are used.

---

## 2. Cache Layers

### 2.1 ERPDataTable built-in preferences (existing + extended in UI.4E)

Key: `erp_table_prefs:v1:{userId}:{tableId}`

Persists per user, per table:

| Field | Status |
|-------|--------|
| `sorting` | Since 002E.2A |
| `columnSizing` | Since 002E.2A |
| `columnVisibility` | Since 002E.2A |
| `pageSize` | Since 002E.2A |
| `globalFilter` (search text) | Added UI.4E |
| `pageIndex` (current page) | Added UI.4E |

**Coverage:** All screens using `ERPDataTable` with a `tableId` automatically receive search/filter/pagination/sort persistence. No per-module changes needed.

### 2.2 Workspace page state (UI.4E new)

Key format: `algt_erp_workspace_page_state:{scope}:{identifier}:{key}`

Used for record form UI state (active section, scroll position) and any additional UI state outside ERPDataTable.

---

## 3. Scope Rules

| Scope | Key identifier | Use for |
|-------|---------------|---------|
| `route` | route path (e.g. `/admin/master-data/parties`) | Singleton list screens |
| `record` | `{entityType}:{entityId}` (e.g. `party:123`) | Existing record forms |
| `tab` | workspace tab ID | New/unsaved record forms |
| `global` | any global key | User-wide preferences |

---

## 4. Key Format Examples

```
algt_erp_workspace_page_state:route:/admin/master-data/parties:parties-table
algt_erp_workspace_page_state:route:/admin/master-data/parties/vendors:parties-table
algt_erp_workspace_page_state:route:/admin/users:users-table
algt_erp_workspace_page_state:route:/admin/master-data/finance-basics/banks:banks-table
algt_erp_workspace_page_state:record:party:123:active-section
algt_erp_workspace_page_state:record:party:123:body-scroll
algt_erp_workspace_page_state:tab:{tabId}:active-section
algt_erp_workspace_page_state:tab:{tabId}:body-scroll
```

---

## 5. Allowed vs. Disallowed Cache Values

### Allowed

```
search text
filter values
sort state
pagination (page index, page size)
column visibility
column sizing
column order
active section/tab id
scroll position
route metadata
record tab metadata
dirty flag
last active time
safe UI preferences
selected row IDs (UI only, not approval state)
```

### Not Allowed

```
passwords
tokens
Supabase sessions
attachments or file blobs
full server row datasets
large arrays of records
unsaved form field values with PII:
  - bank account numbers
  - IBAN values
  - license numbers
  - Emirates ID / passport / personal identifiers
  - private notes content
  - complete unsaved form payloads
```

---

## 6. Hooks Reference

### `useWorkspacePageState`

Generic hook for persisting and restoring any safe UI state.

```ts
import { useWorkspacePageState } from "@/hooks/use-workspace-page-state";

const { state, setState } = useWorkspacePageState({
  key: "my-state",
  initialState: { activeTab: "general" },
  scope: "route",
  identifier: "/admin/master-data/parties",
});
```

### `useWorkspaceTableState`

Table-specific hook for screens with custom table state outside ERPDataTable.

```ts
import { useWorkspaceTableState } from "@/hooks/use-workspace-table-state";

const { search, setSearch, sorting, setSorting, pagination, setPagination } =
  useWorkspaceTableState({
    key: "my-table",
    scope: "route",
    identifier: "/admin/my-module",
  });
```

### `useWorkspaceSectionState`

Remembers the active inner section/tab for record workspace forms.

```ts
import { useWorkspaceSectionState } from "@/hooks/use-workspace-section-state";

// For existing records:
const [activeSection, setActiveSection] = useWorkspaceSectionState({
  key: "active-section",
  initialSection: "basic",
  scope: "record",
  recordType: "party",
  recordId: party.id,
});

// For new/unsaved records:
const [activeSection, setActiveSection] = useWorkspaceSectionState({
  key: "active-section",
  initialSection: "basic",
  scope: "tab",
  identifier: activeTab?.id,
});
```

### `useWorkspaceScrollState`

Persists scroll position of a scrollable container.

```ts
import { useWorkspaceScrollState } from "@/hooks/use-workspace-scroll-state";

const bodyScrollRef = useRef<HTMLDivElement>(null);

useWorkspaceScrollState({
  key: "body-scroll",
  ref: bodyScrollRef,
  scope: "record",
  recordType: "party",
  recordId: party.id,
});

// Pass ref to ERPRecordWorkspaceForm:
<ERPRecordWorkspaceForm bodyScrollRef={bodyScrollRef} ...>
```

---

## 7. System-Wide Module Coverage Matrix (UI.4E)

### Admin / System

| Route | Status | Method |
|-------|--------|--------|
| `/admin/users` | CACHED | ERPDataTable built-in (`tableId: "admin.users"`) |
| `/admin/organizations` | CACHED | ERPDataTable built-in (`tableId: "admin.organizations"`) |
| `/admin/branches` | CACHED | ERPDataTable built-in (`tableId: "admin.branches"`) |
| `/admin/roles` | CACHED | ERPDataTable built-in (`tableId: "admin.roles"`) |
| `/admin/permissions` | NOT APPLICABLE | Legacy DataTable (no tableId, read-only reference table) |
| `/admin/settings/numbering` | CACHED | ERPDataTable built-in (`tableId: "numbering_rules_table"`) |
| `/admin/audit` | CACHED | ERPDataTable built-in (`tableId: "admin.audit_logs"`) |
| `/dashboard` | NOT APPLICABLE | No local table/filter UI state |
| `/profile` | NOT APPLICABLE | No local table/filter UI state |
| `/settings` | NOT APPLICABLE | No local table/filter UI state |

### Master Data Hub and Lookups

| Route | Status | Method |
|-------|--------|--------|
| `/admin/master-data` | NOT APPLICABLE | Hub/landing page, no table state |
| `/admin/master-data/lookups/categories` | CACHED | ERPDataTable built-in (`tableId: "lookup_categories_table"`) |
| `/admin/master-data/lookups/values` | CACHED | ERPDataTable built-in (`tableId: "lookup_values_table"`) |
| `/admin/master-data/lookups/system` | DEFERRED | No dedicated table file found — likely server-rendered list |

### Geography

| Route | Status | Method |
|-------|--------|--------|
| `/admin/master-data/geography/countries` | CACHED | ERPDataTable built-in (`tableId: "countries_table"`) |
| `/admin/master-data/geography/emirates` | CACHED | ERPDataTable built-in (`tableId: "emirates_table"`) |
| `/admin/master-data/geography/cities` | CACHED | ERPDataTable built-in (`tableId: "cities_table"`) |
| `/admin/master-data/geography/areas` | CACHED | ERPDataTable built-in (`tableId: "areas_table"`) |
| `/admin/master-data/geography/ports` | CACHED | ERPDataTable built-in (`tableId: "ports_table"`) |

### Party Master

| Route | Status | Method |
|-------|--------|--------|
| `/admin/master-data/parties` | CACHED | ERPDataTable built-in (`tableId: "parties_table"`) |
| `/admin/master-data/parties/customers` | CACHED | ERPDataTable built-in (same `parties_table`, separate route state) |
| `/admin/master-data/parties/vendors` | CACHED | ERPDataTable built-in (same `parties_table`, separate route state) |
| `/admin/master-data/parties/subcontractors` | CACHED | ERPDataTable built-in |
| `/admin/master-data/parties/consultants` | CACHED | ERPDataTable built-in |
| `/admin/master-data/parties/recruitment-agencies` | CACHED | ERPDataTable built-in |
| `/admin/master-data/parties/government-authorities` | CACHED | ERPDataTable built-in |
| `/admin/master-data/parties/insurance-companies` | CACHED | ERPDataTable built-in |
| `/admin/master-data/parties/license-issuers` | CACHED | ERPDataTable built-in |
| `/admin/master-data/parties/types` | CACHED | ERPDataTable built-in |
| `/admin/master-data/parties/service-categories` | CACHED | ERPDataTable built-in |
| `/admin/master-data/parties/relationship-types` | CACHED | ERPDataTable built-in |
| `/admin/master-data/parties/record/new` | CACHED | `useWorkspaceSectionState` (scope=tab) + `useWorkspaceScrollState` (scope=tab) |
| `/admin/master-data/parties/record/[id]` | CACHED | `useWorkspaceSectionState` (scope=record) + `useWorkspaceScrollState` (scope=record) |

### Finance Basics

| Route | Status | Method |
|-------|--------|--------|
| `/admin/master-data/finance-basics/currencies` | CACHED | ERPDataTable built-in (`tableId: "currencies_table"`) |
| `/admin/master-data/finance-basics/payment-terms` | CACHED | ERPDataTable built-in (`tableId: "payment_terms_table"`) |
| `/admin/master-data/finance-basics/tax-types` | CACHED | ERPDataTable built-in (`tableId: "tax_types_table"`) |
| `/admin/master-data/finance-basics/banks` | CACHED | ERPDataTable built-in (`tableId: "banks_table"`) |
| `/admin/master-data/finance-basics/cost-centers` | CACHED | ERPDataTable built-in (`tableId: "cost_centers_table"`) |
| `/admin/master-data/finance-basics/profit-centers` | CACHED | ERPDataTable built-in (`tableId: "profit_centers_table"`) |

### UOM

| Route | Status | Method |
|-------|--------|--------|
| `/admin/master-data/uom/categories` | CACHED | ERPDataTable built-in (`tableId: "uom_categories_table"`) |
| `/admin/master-data/uom/units` | CACHED | ERPDataTable built-in (`tableId: "units_of_measure_table"`) |
| `/admin/master-data/uom/conversions` | CACHED | ERPDataTable built-in (`tableId: "uom_conversions_table"`) |

### Legacy Customer

| Route | Status | Method |
|-------|--------|--------|
| `/admin/master-data/customers` | CACHED | ERPDataTable built-in (`tableId: "customers_table"`) |

---

## 8. Z-Index Standard

| Layer | Z-index |
|-------|---------|
| App shell / page | normal |
| Workspace tab bar | `z-[30]` |
| Drawer / Sheet | `z-[50]` |
| Child dialog overlay | `z-[60]` |
| Child dialog content | `z-[70]` |
| **ERPCombobox / Popover inside dialogs** | **`z-[80]`** |
| Alert / confirm dialog | `z-[90]` |
| Toast / notification | top layer |

ERPCombobox sets `z-[80]` on its `PopoverContent` via:
```tsx
className={cn('w-[--radix-popover-trigger-width] p-0 z-[80]', popoverClassName)}
```

This overrides the base `z-50` from `popover.tsx` via tailwind-merge.

---

## 9. Form Standard Classification

### Large / main records → ERPRecordWorkspaceForm

| Module | Status |
|--------|--------|
| Party Master | CONVERTED (UI.4D) |
| Future: Employee | PLANNED |
| Future: Vehicle / Equipment | PLANNED |
| Future: Project | PLANNED |
| Future: Quotation | PLANNED |
| Future: Purchase Order | PLANNED |
| Future: Invoice | PLANNED |
| Future: Workshop Job Card | PLANNED |
| Future: HSE Incident | PLANNED |
| Future: DMS Document Record | PLANNED |
| Customer legacy | Migration candidate if legacy remains active |

### Small setup / master forms → ERPDrawerForm (by design)

Organizations, Branches, Roles, Numbering Rules, Lookup Categories, Lookup Values, Countries, Emirates/Regions, Cities, Areas/Zones, Ports, Currencies, Payment Terms, Tax Types, Banks, Cost Centers, Profit Centers, UOM Categories, UOM Units, UOM Conversions, Party Types, Party Service Categories, Party Relationship Types.

These remain as drawers. Their list/table state is cached via ERPDataTable.

### Child forms → ERPChildDialogForm

All add/edit child records (contacts, addresses, bank details, licenses, etc.) use ERPChildDialogForm.

---

## 10. Mandatory Rules for Future Modules

1. All new list/table screens **must** pass a unique `tableId` to `ERPDataTable`.
2. All new large/main record forms **must** use `ERPRecordWorkspaceForm`.
3. All new small setup/master forms **may** use `ERPDrawerForm`.
4. All new child forms **must** use `ERPChildDialogForm`.
5. All new `ERPRecordWorkspaceForm` usages **must** wire `useWorkspaceSectionState`.
6. ERPCombobox dropdowns will automatically appear above child dialogs (global fix in UI.4E).
7. Do **not** persist sensitive form field values (PII, financial identifiers) in localStorage.

---

## 11. Files

| File | Purpose |
|------|---------|
| `src/lib/workspace/workspace-page-state.ts` | Low-level localStorage read/write utilities |
| `src/hooks/use-workspace-page-state.ts` | Generic page state hook |
| `src/hooks/use-workspace-table-state.ts` | Table state hook (for custom table state) |
| `src/hooks/use-workspace-section-state.ts` | Active section/tab state hook |
| `src/hooks/use-workspace-scroll-state.ts` | Scroll position hook |
