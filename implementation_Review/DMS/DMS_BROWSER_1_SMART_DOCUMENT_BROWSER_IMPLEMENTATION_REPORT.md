# DMS Smart Document Browser — Implementation Report
## Phase: DMS.BROWSER.1
**Date:** 2026-08-04  
**Status:** IMPLEMENTED ✅  
**Author:** Cursor Agent

---

## What Was Built

A 2-column smart search document browser at `/admin/dms/browser` that lets users search across the entire DMS archive using up to four search layers:

| Layer | Trigger | Technology |
|---|---|---|
| L1 Metadata | Always (debounced 300ms) | PostgreSQL ILIKE on title, document_no |
| L2 Content | Always with L1 (500ms window) | PostgreSQL FTS on `dms_document_content` |
| L3 AI Intent | Auto at ≥4 words | Existing `askDmsDocumentsQuestion` (DMS 12.4) |
| L4 Semantic | User toggle | Existing `semanticSearchDmsDocuments` (DMS 12.5) |

---

## Files Created

| File | Purpose |
|---|---|
| `src/server/actions/dms/browser.ts` | `searchDmsBrowser` + `getDmsBrowserDocumentTypes` server actions |
| `src/features/dms/browser/dms-browser-resize-handle.tsx` | Draggable column divider (duplicated per D4) |
| `src/features/dms/browser/dms-browser-preview.tsx` | Right column: metadata strip + inline PDF/image viewer |
| `src/features/dms/browser/dms-browser-results-list.tsx` | Left column results with infinite scroll, content excerpts, match badges |
| `src/features/dms/browser/dms-browser-filter-bar.tsx` | Filter chips: Type, Status, Date range, Linked entity, AI Semantic toggle |
| `src/features/dms/browser/dms-browser-search-bar.tsx` | Smart search input with history dropdown (localStorage, last 10) |
| `src/features/dms/browser/dms-browser-page-client.tsx` | Page shell: resize, search orchestration, layer merging, infinite scroll |
| `src/app/(protected)/admin/dms/browser/page.tsx` | SSR entry: permission guard, docTypes prefetch |

---

## Files Modified

| File | Change |
|---|---|
| `src/server/actions/dms/documents.ts` | Exported `getAllowedConfidentialityLevels` (was private, needed by browser.ts) |
| `src/components/layout/app-sidebar.tsx` | Added "Document Browser" entry under DMS (FolderSearch icon) |
| `src/lib/workspace/workspace-route-registry.ts` | Registered `/admin/dms/browser` as singleton list tab, module DMS |

---

## Key Design Decisions Implemented

- **D1**: Empty state on page load — no documents shown, only search bar. User must type to trigger any results.
- **D2**: AI Intent layer fires automatically when query is ≥4 words.
- **D3**: Content search results (Layer 2) show a ~120-character excerpt of the matched passage, extracted from `content_text`, with the matched word highlighted in yellow.
- **D4**: Resize handle duplicated into `src/features/dms/browser/` — no shared refactor.

---

## Search Architecture

### Layer Merging
All four layers return results independently and are merged into a single flat list, deduplicated by `document_id`. The base L1+L2 results arrive first. L3 and L4 results are appended asynchronously as they arrive. A stable `Set<number>` (baseIdSet) prevents duplicates.

### Content Excerpt Extraction (D3)
The server action queries `dms_document_content.content_text` (FTS via `websearch_to_tsquery`). For each match, it extracts a ~120-character window around the first occurrence of the search term, with `…` ellipsis for truncation. The excerpt is returned to the client and displayed in italic below the document title.

### Infinite Scroll
Results are loaded 25 at a time using `IntersectionObserver` on a sentinel element at the bottom of the list. Each page appends to the existing rows, deduplicated.

### Column Resize
`mousedown` → `mousemove` (live) → `mouseup` (persist to localStorage). Body cursor and user-select are toggled during drag. Width is clamped to 280–640px.

---

## Permissions

- Page guard: `dms.documents.view` OR `dms.admin` OR `system_admin`
- Server action guard: same (applied inside `searchDmsBrowser` and `getDmsBrowserDocumentTypes`)
- Confidentiality levels: enforced via `getAllowedConfidentialityLevels` (same as `getDmsDocuments`)
- Non-admin users cannot see hr/legal/executive-level documents unless they own them

---

## Runtime Verification Steps

1. Navigate to DMS → Document Browser in sidebar
2. Page loads with empty state (search bar focused, no results)
3. Type a partial document title → results appear within ~300ms
4. Type a word that appears inside a PDF (OCR'd) → content match with excerpt
5. Type a 4+ word natural language query → "AI searching…" spinner, additional results merge in
6. Enable AI Semantic toggle → semantic results merge in
7. Apply a Type filter → results narrow
8. Click a result → preview loads in right column
9. PDF document shows inline iframe viewer
10. Image shows inline img
11. Other file type shows download card
12. "Open Full Record" button opens workspace tab
13. Drag resize handle → columns resize live, persist after refresh
14. Search history appears on focus when input is empty

---

## Notes

- The `askDmsDocumentsQuestion` function requires the `DMS_CROSS_DOC_SEARCH` feature flag to be enabled. If disabled, L3 silently skips.
- The `semanticSearchDmsDocuments` function requires documents to have embeddings. Documents without embeddings are excluded from L4 only.
- AI search failures (network, model unavailable) are caught silently — L1/L2 results always show regardless.
