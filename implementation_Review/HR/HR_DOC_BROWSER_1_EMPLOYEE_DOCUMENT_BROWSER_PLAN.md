# HR Employee Document Browser — Plan
## Phase: HR.DOC_BROWSER.1
**Date:** 2026-08-03  
**Status:** PLAN APPROVED — decisions D1–D5 resolved by Sameer (2026-08-03). Ready for implementation.  
**Author:** Cursor Agent  

**Decisions summary:**
- **D1**: Dependents get FULL multi-document support in Phase 1 (`dms_document_links` with `entity_type='employee_dependent'` + legacy `dms_document_id` field as fallback).
- **D2**: HR identity documents (`employee_identity_documents`) ARE shown alongside DMS documents.
- **D3**: Inactive employees VISIBLE with greyed-out visual treatment + status filter added to Column 1.
- **D4**: Client-state selection only in Phase 1 (URL-encoded links deferred to Phase 2 — default recommendation, not raised).
- **D5**: Columns are RESIZABLE (draggable dividers) in Phase 1.
- **Q5 (preview)**: Non-previewable files (Word/Excel) get a Download button only — no thumbnails for now.

---

## 1. What This Module Is

A **3-column file-explorer-style document viewer** embedded in the HR module.
It is **HR-exclusive**: it only surfaces employees and their dependents. It is
NOT a replacement for the DMS module — it is a focused read/navigate experience
for HR staff to quickly browse who owns which documents.

**Mental model:** macOS Finder column view, or Windows File Explorer details
pane — click an entity in the left column, see their documents in the middle
column, click a document to preview it on the right.

---

## 2. Route

```
/admin/hr/document-browser
```

Sidebar entry under **HR → Document Browser** (icon: `FolderOpen`).  
Workspace route registry entry: singleton list tab, `moduleCode: "HR"`.

---

## 3. Screen Layout — 3-Column Anatomy

```
┌─────────────────────────────────────────────────────────────────────────┐
│  HR Document Browser                                        [search bar]│
├─────────────────┬──────────────────────────┬───────────────────────────┤
│  COLUMN 1       │  COLUMN 2                │  COLUMN 3                 │
│  Navigator      │  Document List           │  Document Preview         │
│  (fixed 260px)  │  (fixed 340px)           │  (flex: fills remainder)  │
├─────────────────┼──────────────────────────┼───────────────────────────┤
│ 🔍 Search emp   │                          │                           │
│                 │  (no selection)          │  (no selection)           │
│ ▼ Employees     │  ← select an employee    │  ← select a document      │
│   ● Ahmed K.    │    or dependent          │    to preview here        │
│   ● Sameer F.   │                          │                           │
│   ▶ Ravi P.     │                          │                           │
│     └ Priya P.  │  When employee selected: │  When doc selected:       │
│     └ Raj P.    │  ┌──────────────────┐    │  ┌─────────────────────┐  │
│   ● ...         │  │ Doc No  │ Title  │    │  │ PDF / Image viewer  │  │
│                 │  │ Type    │ Status │    │  │ (inline, scrollable)│  │
│                 │  │ Expiry  │ Files  │    │  └─────────────────────┘  │
│                 │  └──────────────────┘    │                           │
│                 │                          │  Doc metadata strip:      │
│                 │  Each row: click → load  │  Type, Status, Issue,     │
│                 │  preview in col 3        │  Expiry, Owner, # Files   │
│                 │                          │  [Open Full Record ↗]     │
└─────────────────┴──────────────────────────┴───────────────────────────┘
```

Columns are separated by a 1px divider and are individually scrollable.
The outer shell is full-height (inherits workspace content area height).

---

## 4. Column 1 — Entity Navigator

### 4A. Structure

```
Employees                           ← root section header
  ┌ Ahmed Khan (EMP-0001)           ← employee row (active)
  ├ Sameer Fahmi (EMP-0002)
  └ Ravi Patel (EMP-0003)           ← has dependents → expand icon ▶
      └─ Priya Patel (dependent, Spouse)
      └─ Raj Patel (dependent, Child)
```

- **Root header "Employees"** is always visible, not clickable (visual grouping only).
- **Employee rows**: file-icon + employee code + full name.  
  Click → select that employee, load their documents in Column 2.  
  If employee has dependents, show a `▶` chevron (expands inline).
- **Dependent rows**: indented (16px), user-icon + dependent name + relationship type.  
  Click → select that dependent, load their documents in Column 2.
- **Active selection** highlighted with `bg-primary/10 border-l-2 border-primary`.

### 4B. Search + Status Filter (D3)

- Search box at the top of Column 1.
- Filters employee list client-side by name or employee code.
- Dependent names also matched when expanded.
- **Status filter** (D3): small filter control next to the search box —
  `All / Active / Inactive`. Default: **All**.
- **Inactive employees are visible but greyed out** (`opacity-60 text-muted-foreground`)
  with a small "Inactive" chip, so HR can still browse documents of terminated
  employees (essential for EOS and archive purposes).

### 4C. Grouping (Phase 2 only, not in initial delivery)

- Optional secondary groups: by department or company.

### 4D. Data source

```
Table: employees
Columns: id, employee_code, full_name_en, employee_status
Join: employee_dependents (employee_id, dependent_name_en, relationship_type_id → hr_relationship_types.name_en)
```

Server action: `getHrDocBrowserEmployees()` — returns ALL employees (active +
inactive, per D3) + their dependents in one payload. Paginated in groups of
100 employees. Each employee node carries `employee_status` so the client can
grey out inactive rows and drive the status filter.

---

## 5. Column 2 — Document List

### 5A. Triggered by

Clicking an **employee** or **dependent** in Column 1.

### 5B. Documents included

**For an employee selection:**

Two sources are joined:
1. `dms_document_links` where `entity_type = 'employee'` and `entity_id = employee.id` → linked DMS documents
2. `employee_identity_documents` (HR-native identity docs: Passport, Emirates ID, Visa, etc.) — displayed with a "HR Identity" label distinction

Both sources appear in a single unified list, sorted by document type then expiry date.

**For a dependent selection (D1 — FULL multi-document support in Phase 1):**

1. `dms_document_links` where `entity_type = 'employee_dependent'` and
   `entity_id = dependent.id` — the primary path for multiple dependent documents.
   `dms_document_links.entity_type` is a plain `text` column, so **no DB migration
   is required** — the new entity type value just starts being written/read.
2. `employee_dependents.dms_document_id` — legacy single-document field, still read
   as a fallback and merged into the list (deduplicated) so existing data appears.

**Linking new dependent documents:** the DMS entity-link server actions
(`linkDmsDocumentToEntity`) already accept arbitrary entity types; the dependent
child tab in the Employee profile will pass `entity_type='employee_dependent'`.
Wiring the "link document" button into the dependents tab is included in this
phase's scope (small addition to the existing dependents child tab).

### 5C. List row content

Each row shows:
| Field | Detail |
|---|---|
| Type badge | Document type name (from `dms_document_types`) |
| Title | `dms_documents.title` |
| Status badge | `DmsDocumentStatusBadge` (Active / Expired / etc.) |
| Expiry | Formatted date + `DmsExpiryBadge` (red if expired, amber if ≤30 days) |
| File count | Number of files attached (from `dms_document_files`) |
| Active selection | `bg-primary/10 border-l-2 border-primary` |

Empty state: "No documents linked to this employee / dependent yet. Go to their HR profile to link documents."

### 5D. Sorting

Default: expiry date ascending (most urgent first, expired at top).
Secondary toggle: by document type name.

### 5E. Document count chip

Above the list: `N documents` count chip to give context.

---

## 6. Column 3 — Document Preview

### 6A. Triggered by

Clicking a document row in Column 2.

### 6B. What's shown

**Top strip (metadata bar):**
```
┌─────────────────────────────────────────────────────────────┐
│ [Type badge]  DMS-2026-000217  [Status badge]  [Expiry badge]│
│ Title: Employment Offer Letter — AKBAR KHAN                  │
│ Issue Date: 01-Jun-2025   Expiry: 02-Jun-2025                │
│ Owner: Ahmed Khan (EMP-0001)                                 │
│ Files: 2 files attached                                      │
│                          [Open Full Record ↗]  [Download ↓]  │
└─────────────────────────────────────────────────────────────┘
```

**File selector (if document has multiple files):**
```
[ File 1: Emirates_ID_Front.pdf ]  [ File 2: Emirates_ID_Back.pdf ]
```
Click to switch which file is previewed.

**Preview area:**
- **PDF files**: Inline `<iframe>` or `<embed>` using the `/api/dms/file?fileId=X&disposition=inline` proxy route (already built). No external dependency.
- **Images** (JPEG, PNG, WEBP): `<img>` tag, scaled to fit.
- **Other file types** (DOCX, XLSX, etc.): Cannot preview inline — show a card with file icon, file name, size, and a "Download" button.
- Loading state: Skeleton placeholder while fetch completes.

**Empty state (no document selected):**
Centered illustration: folder icon + "Select a document from the list to preview it here."

### 6C. "Open Full Record" button

`openTab({ route: /dms/documents/record/${doc.id}, ... })` — opens the full DMS document workspace tab without navigating away from the browser.

---

## 7. State Management

All three columns are **client components** within a single page-level client component. State is managed via `useState`:

```typescript
type BrowserSelection = {
  entity: { type: "employee" | "dependent"; id: number; name: string } | null;
  documentId: number | null;
  fileId: number | null;
};
```

No URL-based state in Phase 1 (simplicity). Phase 2 could encode selection in search params for shareable links.

---

## 8. Data Fetching Strategy

| Data | When | How |
|---|---|---|
| Employee + dependent list | On page load (SSR) | `getHrDocBrowserEmployees()` server action → passed as prop |
| Documents for an entity | On entity click (client) | `getHrDocBrowserDocuments(entityType, entityId)` via `useTransition` + `startTransition` |
| File list for a doc | Included in document query (small join) | Same payload as above |
| File preview URL | On file click | `/api/dms/file?fileId=X&disposition=inline` — direct URL, no separate fetch |

**Rationale for lazy document load (not SSR):**  
Employee list can be 100+ employees, each with N documents. Pre-loading all document data SSR would be slow and unnecessary. The click-to-load pattern gives instant page render and sub-second document list loads.

---

## 9. New Server Actions Required

### `getHrDocBrowserEmployees()`
```typescript
// Returns ALL employees (active + inactive, per D3) with their dependents
// Table: employees JOIN employee_dependents
// Auth: requires hr.employees.view
// Returns: EmployeeNode[]
type DependentNode = {
  id: number;
  name: string;
  relationship: string;
  dmsDocumentId: number | null; // legacy single-doc field (fallback, D1)
};
type EmployeeNode = {
  id: number;
  employeeCode: string;
  fullNameEn: string;
  status: string; // drives D3 greyed-out treatment + Column 1 status filter
  dependents: DependentNode[];
};
```

### `getHrDocBrowserDocuments(entityType: "employee" | "employee_dependent", entityId: number)`
```typescript
// Returns all DMS documents for a given entity
// Sources:
//   employee     → dms_document_links (entity_type='employee', entity_id)
//                  + employee_identity_documents (as HR-native docs, D2)
//   dependent    → dms_document_links (entity_type='employee_dependent') [primary, D1]
//                  + employee_dependents.dms_document_id (legacy fallback, deduplicated)
// Joins: dms_documents, dms_document_types, dms_document_files (count)
// Auth: requires hr.employees.view + dms.documents.view
type DocBrowserDocument = {
  id: number;
  documentNo: string;
  title: string;
  typeNameEn: string;
  status: string;
  issueDate: string | null;
  expiryDate: string | null;
  source: "dms_link" | "hr_identity" | "dependent_link";
  files: { id: number; fileName: string; mimeType: string | null; fileSizeBytes: number | null }[];
};
```

---

## 10. Decisions — RESOLVED by Sameer (2026-08-03)

| # | Decision | Resolution |
|---|---|---|
| D1 | **Dependent DMS links** | **FULL multi-document support in Phase 1.** Use `dms_document_links` with `entity_type = 'employee_dependent'` (no DB migration needed — entity_type is text) + legacy `employee_dependents.dms_document_id` merged as fallback. |
| D2 | **Identity documents** | **YES** — show `employee_identity_documents` alongside DMS documents, labelled as "HR Identity" group. |
| D3 | **Inactive employees** | **Visible with different visual treatment** (greyed out + "Inactive" chip) + status filter (`All / Active / Inactive`) added to Column 1. Default: All. |
| D4 | **URL-encoded selection** | Client state only in Phase 1 (default recommendation — shareable URLs deferred to Phase 2). |
| D5 | **Column widths** | **RESIZABLE** — draggable dividers between columns in Phase 1, with min-width constraints and widths persisted to localStorage. |
| Q5 | **Non-previewable files** | Download button only for Word/Excel/other non-PDF/image files. No thumbnails for now. |

---

## 11. New Files Required

```
src/
├── app/(protected)/admin/hr/document-browser/
│   └── page.tsx                          ← SSR shell: loads employee list, checks auth
│
├── features/hr/document-browser/
│   ├── hr-doc-browser-page-client.tsx    ← full 3-column client shell + state + resize logic (D5)
│   ├── hr-doc-browser-navigator.tsx      ← Column 1 (employee/dependent tree + status filter D3)
│   ├── hr-doc-browser-doc-list.tsx       ← Column 2 (document list for selected entity)
│   ├── hr-doc-browser-preview.tsx        ← Column 3 (file preview + metadata strip)
│   └── hr-doc-browser-resize-handle.tsx  ← draggable column divider (D5)
│
└── server/actions/hr/
    └── doc-browser.ts                    ← getHrDocBrowserEmployees, getHrDocBrowserDocuments
```

**Modified files:**
- `src/components/layout/app-sidebar.tsx` — add "Document Browser" under HR
- `src/lib/workspace/workspace-route-registry.ts` — register route
- Employee profile dependents tab — add "Link Document" action writing
  `dms_document_links(entity_type='employee_dependent')` (D1 multi-doc support)

---

## 12. Permissions Required

| Permission | Used for |
|---|---|
| `hr.employees.view` | Load employee list + dependent list |
| `dms.documents.view` | Load DMS documents + file metadata |
| `dms.files.download` (existing) | Generate inline preview URLs |

No new permissions required — both already exist in the RBAC system.

---

## 13. Styling Notes

- **Outer shell**: `flex h-full` inside the workspace content area.
- **Column 1**: default 260px, **resizable** (D5) — min 200px, max 400px
- **Column 2**: default 340px, **resizable** (D5) — min 260px, max 520px
- **Column 3**: `flex-1 min-w-0 flex flex-col overflow-hidden` (takes remaining space)
- **Resize handles** (D5): 6px-wide draggable dividers between columns
  (`cursor-col-resize`, highlight on hover), same pattern as the existing
  `useResizableColumns` table hook. Widths persisted to
  `localStorage("hr-doc-browser-col-widths")` so layout survives reloads.
- Each column body: `overflow-y-auto flex-1 min-h-0`
- Selected row (both cols): `bg-primary/10 border-l-2 border-l-primary`
- Inactive employee rows (D3): `opacity-60 text-muted-foreground` + "Inactive" chip
- **Responsive**: On screens < 1024px, Column 3 (preview) collapses to a slide-over drawer — Column 1 and 2 still visible.

---

## 14. Implementation Phases

### Phase 1 — Core Browser (THIS PLAN — approved scope)
- 3-column layout shell with **resizable columns** (D5)
- Employee + dependent navigator with **status filter + greyed-out inactive** (D3)
- Document list with DMS links + **HR identity docs** (D2) (Column 2)
- **Full multi-document dependent support** via `dms_document_links(entity_type='employee_dependent')` + legacy fallback (D1)
- "Link Document" action on the dependents child tab (writes the new link type)
- PDF/image inline preview + metadata strip (Column 3); Download-only for other file types
- All employees visible (active + inactive)

### Phase 2 — Enhancements (Future, separate plan)
- URL-encoded selection for shareable links (D4)
- Quick Upload from the browser (drag-and-drop → goes to DMS inbox with entity pre-filled)
- Filter/sort toolbar on Column 2 (by type, status, expiry)
- Group employees by department or company
- Thumbnails for non-previewable file types

---

## 15. Effort Estimate

| Item | Effort |
|---|---|
| `doc-browser.ts` server actions (2 actions, incl. dependent multi-doc merge) | ~2.5h |
| `page.tsx` + auth guard | ~30m |
| Column 1 navigator (tree + search + status filter) | ~3h |
| Column 2 document list | ~2h |
| Column 3 preview + metadata strip | ~3h |
| Resizable column dividers + localStorage persistence (D5) | ~1.5h |
| Dependents tab "Link Document" action (D1) | ~1.5h |
| Sidebar + registry wiring | ~30m |
| Lint + type-check + unit test (if any) | ~1h |
| **Total estimate** | **~15.5h** |

---

## 16. Questions — ANSWERED (2026-08-03)

All five questions answered by Sameer; resolutions captured in §10 above.
No open blockers. **Ready for implementation on approval of this revision.**
