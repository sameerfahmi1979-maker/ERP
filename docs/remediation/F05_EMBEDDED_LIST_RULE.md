# F05 — main worklists versus embedded record collections

Owner correction: 17 October 2026. This supersedes the older G06 statement that full list toolbars must also appear inside forms.

## Global presentation rule

- Main module worklists retain Search, Edit filters, Edit columns, sorting, preferences, exports where supported, and full pagination. Being displayed in a page-level settings tab does not make a main configuration list an embedded form list. The dedicated HR Document Browser is also a principal collection navigator, not an employee form; preserve its complete-result search/filter/sort contracts.
- Lists inside a record, form, child dialog, selection step, preview or record-history section use `presentation="embedded"`. Keep meaningful column labels or existing cards, permitted actions and task-specific controls. Do not add the full main-list toolbar, a column editor, sorting handles or a rows-per-page selector.
- A small collection has no pagination footer. A larger collection keeps simple Previous/Next navigation. Server-paged reads remain server-paged; never display just the first page as though it were complete. Failed/unverified reads are not successful empty lists.
- Existing contextual search (for example, an employee's issuance history or a document-picker query) can remain when it serves the task. It must not be duplicated by a generic master-list search box.
- Render each field/card once. Do not manufacture scalar columns alongside a duplicate “Details and permitted actions” card. Avoid fixed oversized column widths in compact record sections; wrap names and actions.
- Do not carry invisible main-list filters or hidden-column preferences into a compact local collection. Existing server criteria remain visible and clearable. Clearing UI criteria never alters record authority, parent identity or server scope.
- Original permission-aware cell/card renderers remain authoritative for visible actions. Do not change backend permissions, RLS, drafts, save contracts, operation IDs, concurrency, provider routing, exports or document history to implement this presentation correction.

## Implementation

`ERPDataTable` keeps its worklist default and explicitly accepts an embedded presentation for true tabular child sections. `RecordCollection` defaults to the compact permitted card renderer; main callers explicitly request the worklist presentation. Legacy configured-row adapters opt into embedded presentation at the read-view hook so hidden saved filters/columns cannot suppress records. Compact navigation is shared by the three adapters.

Every current shared-table caller is classified explicitly. `node tooling/quality/embedded-list-audit.cjs --check` verifies current adoption. `tests/remediation/f05/embedded-lists.test.tsx` covers compact/main separation, actions, paging, failed reads, old preferences, stable edits and principal isolation using in-process component tests, not a browser.

The already corrected Recent OCR Jobs component remains unchanged. This follow-up does not start F07's DMS lifecycle, F08's reporting replacement, later HR business restructuring or F09's email/worker redesign. Future phases reuse this rule rather than implementing a second correction.

## Acceptance boundary

Source coverage and non-browser checks are not visual or real-device acceptance. Owner visual, keyboard, contrast, zoom and Android touch/keyboard review remain pending until actually performed. No browser testing or computer control is authorized. Publication, merge and live deployment must be identified separately from local implementation.
