# HR.DOC_BROWSER.1 — Employee Document Browser — Implementation Report

**Date:** 2026-08-03
**Status:** IMPLEMENTED — runtime smoke-tested ✅
**Plan:** `implementation_Review/HR/HR_DOC_BROWSER_1_EMPLOYEE_DOCUMENT_BROWSER_PLAN.md`
**Design standard (reusable):** `.cursor/rules/erp-document-browser-standard.mdc`

---

## 1. What was built

A 3-column "file explorer" document browser at **`/admin/hr/document-browser`**:

| Column | Content |
|---|---|
| 1 — Navigator (resizable, 200–420px) | Employee list with expandable dependents, search, All/Active/Inactive filter |
| 2 — Document List (resizable, 260–560px) | Unified documents for the selected employee/dependent with type, status, expiry badges and source labels |
| 3 — Preview (flex) | Metadata strip + inline PDF (iframe) / image (img) preview via `/api/dms/file` proxy, file tabs for multi-file docs, download card for non-previewable types |

All approved decisions implemented:

- **D1** — Dependents support full multi-document lists via `dms_document_links (entity_type='employee_dependent')`, plus the legacy single `employee_dependents.dms_document_id` as a deduplicated fallback source.
- **D2** — HR identity documents (`employee_identity_documents`) merged into the employee's list with a violet "HR Identity" badge; rows with `dms_document_id` get full preview, metadata-only rows show details in the strip.
- **D3** — Inactive employees stay visible, greyed out (`opacity-60`) with an "Inactive" badge; status filter chips added to Column 1.
- **D5** — Columns 1 and 2 resizable via draggable dividers; widths clamp to min/max and persist in `localStorage` (`hr-doc-browser-col-widths-v1`).
- **Q5** — Non-previewable files (Word/Excel/etc.) show a download card, no inline attempt.

## 2. Files created

| File | Role |
|---|---|
| `src/server/actions/hr/doc-browser.ts` | `getHrDocBrowserEmployees` (tree), `getHrDocBrowserDocuments` (unified docs per entity) |
| `src/app/(protected)/admin/hr/document-browser/page.tsx` | SSR shell — dual permission guard (HR view + DMS view) + initial navigator data |
| `src/features/hr/document-browser/hr-doc-browser-page-client.tsx` | 3-column shell, selection state, resize logic, document fetch via `useTransition` |
| `src/features/hr/document-browser/hr-doc-browser-navigator.tsx` | Column 1 |
| `src/features/hr/document-browser/hr-doc-browser-doc-list.tsx` | Column 2 |
| `src/features/hr/document-browser/hr-doc-browser-preview.tsx` | Column 3 |
| `src/features/hr/document-browser/hr-doc-browser-resize-handle.tsx` | Draggable divider |
| `src/features/hr/document-browser/hr-doc-browser-types.ts` | `BrowserEntitySelection` type |
| `.cursor/rules/erp-document-browser-standard.mdc` | **Reusable design standard** for future equipment/customer/vendor browsers |

## 3. Files modified

- `src/components/layout/app-sidebar.tsx` — "Document Browser" entry under HR (FolderSearch icon)
- `src/lib/workspace/workspace-route-registry.ts` — `/admin/hr/document-browser` registered (list tab, singleton)

## 4. Key design points

- **No new tables, no migrations** — reads exclusively from existing `employees`, `employee_dependents`, `employee_identity_documents`, `dms_document_links`, `dms_documents`, `dms_document_files`.
- **DMS remains single source of truth** — all files preview/download through `/api/dms/file?fileId=…&disposition=inline|attachment`; no direct storage access from the client.
- **Dedup guarantee** — a DMS document referenced both by a direct link and an identity record appears once (link wins, identity metadata skipped).
- **Sort order** — expiry ascending (nulls last) so urgent documents surface first.
- **Open Full Record** — DMS-backed rows open the standard document workspace tab (`openTab` with `tabKind: "record"`).
- **Security** — page redirect + per-action re-check: `hr.employees.view` AND (`dms.documents.view` OR `dms.admin`), `system_admin` bypass.

## 5. Verification

| Check | Result |
|---|---|
| ESLint (new files) | ✅ clean (fixed one `react-hooks/set-state-in-effect` by moving localStorage read to lazy `useState` initializer with `suppressHydrationWarning` on width divs) |
| `tsc --noEmit` | ✅ zero errors in new/modified files (pre-existing unrelated errors in `spikes/` and `@/types/database` consumers untouched) |
| Unit tests | ✅ 24 files / 447 tests pass |
| Browser runtime smoke test | ✅ page renders 3 columns; 4 employees listed; selecting Sameer loads 5 documents (CICPA Gate Pass, Medical Insurance, Emirates ID, Residence Visa, Passport) with badges; first doc auto-selected; PDF iframe served 200 via `/api/dms/file?fileId=675&disposition=inline`; dependents expand (Spouse/Child); dependent with 0 docs shows correct empty state (verified against DB) |
| Dev server logs | ✅ all requests 200, no runtime errors from the new module |

Known pre-existing, unrelated issue observed during UAT: a hydration warning from `src/components/erp/notification-bell.tsx` (tracked separately).

## 6. Reuse roadmap

Per the new rule file, the same pattern (same file layout, same column contract, same `/api/dms/file` preview rules) is to be cloned for:
- Equipment document browser (entity types `equipment`, `fleet_asset`)
- Customer / Vendor document browsers (entity type `party`)
- Vehicle, project browsers as those modules land
