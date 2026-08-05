# DMS Smart Document Browser — Plan
## Phase: DMS.BROWSER.1
**Date:** 2026-08-04  
**Status:** PLAN APPROVED — decisions D1–D4 resolved by Sameer (2026-08-04). Ready for implementation.  
**Author:** Cursor Agent

**Decisions summary:**
- **D1**: Empty state — show only the search bar (nothing loaded until the user types). Feels like Google.
- **D2**: AI Intent layer (Layer 3) fires automatically when the query is 4 or more words.
- **D3**: Content search results show a ~120-character excerpt of the matched passage.
- **D4**: Resize handle is duplicated into the DMS browser folder (no shared refactor).

---

## 1. What This Is and Why It Is Different From the HR Browser

The **HR Document Browser** is an entity-centric navigator: you pick an employee
or dependent from a tree, then see that person's documents. It answers the
question *"what does this employee have on file?"*

The **DMS Smart Document Browser** is a document-centric, search-first interface:
you type anything — a name, a number, a topic, a word from inside a document —
and get every matching document across the entire DMS. It answers the question
*"where is the document about X?"*

This is closer in spirit to a search engine built on top of your document
archive than a file explorer.

---

## 2. Route and Navigation

```
/admin/dms/browser
```

- Sidebar entry under **DMS → Document Browser** with icon `SearchCode` or `LibraryBig`.
- Registered in the workspace route registry as a singleton list tab,
  module code `DMS`.
- Permission guard: user must have `dms.documents.view` (or `dms.admin` or
  `system_admin`). Anyone without this permission is redirected to
  `/access-denied`.

---

## 3. Screen Layout — 2-Column Design

Because there is no entity tree (no Column 1 from the HR browser), the layout
collapses to two columns:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  DMS Document Browser                                   [⚙ Search Mode]     │
├──────────────────────────────────────┬──────────────────────────────────────┤
│  LEFT COLUMN                         │  RIGHT COLUMN                        │
│  Search + Filters + Results          │  Document Preview                    │
│  (fixed default ~380px, resizable)   │  (flex-1, fills the rest)            │
├──────────────────────────────────────┼──────────────────────────────────────┤
│  🔍 [_______ Smart Search Bar _____] │                                      │
│     [AI] [Content] [Type ▼] [Status▼]│  (nothing selected)                 │
│  ─────────────────────────────────── │  ← click a document on the left     │
│                                      │    to preview it here                │
│  Doc-001  Passport — Ahmed K.        │                                      │
│  Doc-045  Trade License — ALGT Co.  │  When a document is selected:        │
│  Doc-089  CICPA Certificate          │  ┌──────────────────────────────┐   │
│  Doc-112  Employment Contract        │  │  PDF / Image inline viewer   │   │
│  Doc-134  Insurance Card             │  │  (scrollable)                │   │
│  Doc-201  Emirates ID — Ravi P.     │  └──────────────────────────────┘   │
│  ...                                 │                                      │
│  [Load more]                         │  Metadata strip below viewer:        │
│                                      │  Doc No · Type · Status              │
│                                      │  Expiry · Owner · Linked to          │
│                                      │  [Open Full Record ↗]  [⬇ Download] │
└──────────────────────────────────────┴──────────────────────────────────────┘
```

- The divider between the two columns is **draggable** (same resize handle
  component from the HR browser, reused as-is).
- Column widths persist to `localStorage` under a versioned key
  (`dms-browser-col-widths-v1`).
- Min/max clamps: left column 280–640px; right column always gets remaining space.

---

## 4. The Smart Search Bar

### 4A. Physical Design

- Full-width input at the top of the left column.
- Placeholder text: *"Search by name, document number, type, or content..."*
- Small label to the right shows the active search mode, e.g. `AI` or `Content`.
- A loading spinner appears inside the input when a search is in flight.
- A clear (×) button appears when the input has text.

### 4B. The Four Search Layers (Ordered by Speed)

Every search fires the layers in order. Each layer returns results ranked by
relevance. The results from all active layers are merged and deduplicated by
document ID.

---

**Layer 1 — Metadata Search (instant, always on)**

- Fires on every keystroke, debounced 300 ms.
- Searches across: document title, document number (exact and substring),
  document type name, party/entity name from linked entities.
- Uses simple PostgreSQL `ILIKE '%query%'` conditions.
- Returns results within ~50ms even on large archives.
- This is the baseline — it is always active and always fast.

---

**Layer 2 — Full-Text Content Search**

- Fires when the user pauses for 500 ms (after metadata results appear).
- Searches the OCR text and AI transcription stored inside the DMS pipeline
  (`dms_document_files.content_text` or the chunks table).
- Uses PostgreSQL full-text search with `websearch_to_tsquery` (supports
  phrase matching, word proximity, OR / AND operators).
- A result from content search shows a **~120-character excerpt** of the
  matched passage, with the matching word or phrase highlighted in bold, so
  the user can immediately see why it was found without opening the document.
- Example queries that trigger this: `"certificate of conformity"`,
  `"article 12 termination"`, `"blood group A+"`.
- Documents that have not been OCR'd yet are excluded from this layer with
  a small indicator in the results: `[No text extracted]`.

---

**Layer 3 — AI Intent Search (natural language understanding)**

- Fires automatically when the query reaches **4 or more words** (D2).
  Below that threshold it does not fire, keeping short searches fast.
- Uses the existing `ai-search.ts` infrastructure (DMS Phase 12.4), which
  sends the query to the AI model to extract a structured search intent
  (`DmsSearchIntent`), then translates that intent into a database query.
- This layer understands: relative dates (*"expiring next month"*), entity
  references (*"Ahmed's passport"*, *"contracts for ALGT Co"*), categories
  (*"all medical documents"*), risk levels, and metadata field conditions.
- Results show a small `AI` badge next to matched items.
- If the AI model is unavailable or the feature flag is off, this layer is
  silently skipped — the other layers still run.

---

**Layer 4 — Semantic / Vector Search (meaning-level matching)**

- Available as an **explicit toggle** — the user clicks an `AI Semantic` pill
  button in the filter bar to turn it on.
- Uses the existing `semantic-search.ts` infrastructure (DMS Phase 12.5),
  which converts the query into a vector embedding and finds documents with
  high cosine similarity.
- Finds conceptually related documents even when they do not share exact words.
- Example: searching *"fire safety"* finds a document titled *"Emergency
  Evacuation Procedure"* even if those exact words are not in the title.
- A `~` symbol in results indicates a semantic match.
- Requires documents to have embeddings. Documents without embeddings are
  excluded from this layer only.

---

### 4C. How the System Decides Which Layers Fire (Smart Routing)

| Query Characteristics | Layer 1 | Layer 2 | Layer 3 | Layer 4 |
|---|---|---|---|---|
| Short (1–3 words) | ✅ always | ✅ always | ❌ below threshold | ❌ unless toggled |
| 4 or more words (D2 threshold) | ✅ | ✅ | ✅ auto | ❌ unless toggled |
| `AI Semantic` toggle on | ✅ | ✅ | ✅ | ✅ |
| Doc number pattern (DOC-nnn, digits) | ✅ exact | ❌ | ❌ | ❌ |

Doc number patterns are detected by a simple client-side regex. When detected,
only Layer 1 fires with an exact-match query so that results are instant and
precise.

---

### 4D. Search History

- The last 10 queries are saved to `localStorage` and shown in a dropdown
  below the search bar when the input is focused and empty.
- Each history item has a × to remove it.
- History is per-browser, never sent to the server.

---

## 5. Filter Bar (Below the Search Bar)

A thin, single-row filter bar sits between the search input and the results
list. It contains quick-filter chips:

| Filter | Type | Behaviour |
|---|---|---|
| Document Type | Dropdown multi-select | Loaded from `dms_document_types` |
| Status | Dropdown: Active / Expired / Archived / All | Maps to `status` column |
| Date Range | Date picker: from → to (applies to issue date) | Optional |
| Linked to | Entity type dropdown (Employee, Vendor, Party, etc.) | Optional — filters by `dms_document_links.entity_type` |
| AI Semantic | Toggle pill | Turns on Layer 4 |

- All filters are additive (AND logic).
- An active filter shows a filled chip with a × to clear it.
- A "Clear All" link appears when any filter is active.

---

## 6. Results List (Left Column, Below Search + Filters)

### 6A. Result Row Anatomy

Each result row shows:

```
┌────────────────────────────────────────────────────┐
│ DOC-001                               [Status badge]│
│ Passport                              [Expiry badge] │
│ Ahmed Khalid · Employee               [AI] or [~]   │
│ ...excerpt of matched text if from Layer 2...        │
└────────────────────────────────────────────────────┘
```

- Clicking a row selects it and loads the preview in the right column.
- The selected row has a highlighted background.
- Rows are not paginated into separate pages — they use **infinite scroll**
  (load 25 results, then load more on scroll to bottom).
- The total result count is shown above the list: *"143 documents found"*.

### 6B. Relevance Ranking

Results are ordered as follows:
1. Exact doc number match
2. Metadata match (title / type exact prefix)
3. Metadata match (substring)
4. Content full-text rank (PostgreSQL `ts_rank`)
5. AI intent matches
6. Semantic similarity score (when Layer 4 is on)

When multiple layers match the same document, it appears once at its highest
rank position.

### 6C. Empty State

- If no results: *"No documents found. Try a different search term, or check
  your filters."*
- If the query is long, a suggestion: *"Did you mean to use AI Semantic
  search? Turn it on with the toggle above."*
- If the user has no DMS view permission for some documents, a note:
  *"Some documents may be hidden due to permissions."*

---

## 7. Right Column — Document Preview

The preview panel is **identical to Column 3 from the HR Document Browser**.
No new design is needed here — the same component is reused and receives a
document row as its input.

### Preview Content

- **Metadata strip** at the top: document number, title, type, status, issue
  date, expiry date, linked entities (badges), file count.
- **File tabs** if the document has multiple files (original, converted,
  redlined, etc.) — one tab per file.
- **Inline viewer** for the selected file:
  - PDF → `<iframe>` via `/api/dms/file?fileId=X&disposition=inline`
  - Image → `<img>` via the same proxy
  - Word / Excel / other → download card with a "Download" button
- **Open Full Record button** → opens a workspace tab at
  `/dms/documents/record/{id}` so the user can edit the document.
- **Download button** → `/api/dms/file?fileId=X&disposition=attachment`

### Empty State

When nothing is selected: a centered placeholder with a search icon and the
text *"Search for a document and click a result to preview it here."*

---

## 8. Resize Handle

Exactly the same draggable divider component used in the HR browser
(`hr-doc-browser-resize-handle.tsx`). The component will be extracted to a
shared location so both browsers use the same source file.

Behaviour:
- `mousedown` on the handle starts the drag.
- `mousemove` updates the left-column width in state (live).
- `mouseup` persists the final width to `localStorage`.
- `body { user-select: none; cursor: col-resize }` is applied during drag and
  removed on release.
- Width is clamped to 280–640px at all times.

---

## 9. Data Loading Strategy

### On Page Load (Server-Side) — D1: Empty state

- The page server component checks permissions and renders the shell.
- **No documents are loaded on arrival.** The left column shows only the search
  bar, the filter bar, and a centered placeholder inviting the user to type.
  This is intentional — the archive may contain tens of thousands of documents
  and showing them all unfiltered would be meaningless.
- The DMS document types are loaded server-side and passed as a prop (needed
  for the filter bar dropdown).

### On Search (Client-Side)

Layer 1 and Layer 2 are called via a single server action that combines both
searches into one database round-trip (union query).

Layer 3 (AI intent) is called via a separate server action when the query
qualifies. Its result arrives slightly later and is merged into the result
list as it comes in.

Layer 4 (semantic) is called via a separate server action only when the
toggle is on.

All calls are fired inside React `useTransition` to avoid blocking the UI
during the search. A loading indicator in the search bar shows progress.

### Infinite Scroll

- Initial result set: 25 rows.
- On scroll to 80% of the list height, the next 25 rows are fetched and
  appended.
- Scroll position is preserved when switching between search queries only
  if the query is unchanged (clearing the query resets the scroll).

---

## 10. What Already Exists (No Need to Build From Scratch)

| Capability | Existing Asset | Location |
|---|---|---|
| AI Intent Search | `runDmsAiSearch` server action | `src/server/actions/dms/ai-search.ts` |
| Semantic / Vector Search | `searchDmsDocumentsBySemantics` | `src/server/actions/dms/semantic-search.ts` |
| File proxy for preview | `/api/dms/file` route | `src/app/api/dms/file/route.ts` |
| Metadata document list | `getDmsDocuments` with filters | `src/server/actions/dms/documents.ts` |
| Preview panel component | `HrDocBrowserPreview` | `src/features/hr/document-browser/hr-doc-browser-preview.tsx` |
| Resize handle component | `HrDocBrowserResizeHandle` | `src/features/hr/document-browser/hr-doc-browser-resize-handle.tsx` |
| Open in workspace tab | `useWorkspace().openTab` | Global workspace hook |

The implementation will **reuse all of the above**. The new code is primarily
the search orchestration logic, the results list component, and the page shell.

---

## 11. New Database Work Required

Only one new database element is needed:

### Full-Text Search Index on Content

If `dms_document_files.content_text` does not already have a `tsvector` GIN
index, one must be created. This is a single migration:

```sql
-- Conceptual only — exact SQL written at implementation time
CREATE INDEX IF NOT EXISTS idx_dms_document_files_fts
  ON dms_document_files
  USING GIN (to_tsvector('english', coalesce(content_text, '')));
```

No new tables, no new columns, no new RLS policies are needed.

---

## 12. New Files to Create

| File | Purpose |
|---|---|
| `src/server/actions/dms/browser.ts` | New server action: combined Layer 1 + Layer 2 search, returns unified result rows |
| `src/features/dms/browser/dms-browser-search-bar.tsx` | Search input + history dropdown + AI toggle |
| `src/features/dms/browser/dms-browser-filter-bar.tsx` | Quick-filter chips |
| `src/features/dms/browser/dms-browser-results-list.tsx` | Result rows, infinite scroll, empty state |
| `src/features/dms/browser/dms-browser-preview.tsx` | Preview panel (thin adapter that wraps the HR preview component or duplicates it for DMS context) |
| `src/features/dms/browser/dms-browser-page-client.tsx` | Page shell: selection state, search state, resize logic |
| `src/app/(protected)/admin/dms/browser/page.tsx` | SSR entry point: auth check, type list prefetch |

---

## 13. Files to Modify

| File | Change |
|---|---|
| `src/components/layout/app-sidebar.tsx` | Add "Document Browser" entry under DMS section |
| `src/lib/workspace/workspace-route-registry.ts` | Register `/admin/dms/browser` as singleton list tab |
| `src/features/hr/document-browser/hr-doc-browser-resize-handle.tsx` | No change — the HR file stays as-is. The DMS browser gets its own copy. |

---

## 14. Resolved Decisions

All decisions resolved by Sameer on 2026-08-04. Ready for implementation.

| # | Question | Decision |
|---|---|---|
| D1 | Default empty state | **Show only the search bar.** Nothing is loaded until the user types. |
| D2 | AI Intent auto-trigger | **4 or more words.** Shorter queries use Layers 1 and 2 only. |
| D3 | Content search excerpt | **Yes — show ~120 characters** of the matched passage, highlighted. |
| D4 | Resize handle sharing | **Duplicate** the component into the DMS browser folder. No shared refactor. |

---

## 15. What This Is NOT

- This is NOT a replacement for the existing DMS All Documents list page
  (`/dms/documents`). That page remains for bulk operations, status changes,
  and admin tasks. The browser is read-only, search-focused, and optimised
  for finding and previewing.
- This is NOT a full document editor. Users preview here and click "Open Full
  Record" to make changes.
- This is NOT a replacement for the HR Document Browser. Both pages serve
  different mental models and remain separate.

---

## 16. Success Criteria

The implementation is complete when:

1. A user can navigate to `/admin/dms/browser` and see a search bar.
2. Typing a document title finds it within 500ms (Layer 1).
3. Typing a word from inside a PDF finds the document (Layer 2, content search).
4. Typing "show me all Ahmed's documents" finds Ahmed's documents (Layer 3, AI intent).
5. Enabling the AI Semantic toggle and typing "accident liability" finds relevant
   contracts even without those exact words (Layer 4).
6. Clicking any result previews the document inline on the right.
7. PDF files render inline; other types show a download button.
8. The "Open Full Record" button opens the document record in a workspace tab.
9. Column widths survive a page refresh (localStorage persistence).
10. The page is correctly secured — users without `dms.documents.view` cannot
    access it.
