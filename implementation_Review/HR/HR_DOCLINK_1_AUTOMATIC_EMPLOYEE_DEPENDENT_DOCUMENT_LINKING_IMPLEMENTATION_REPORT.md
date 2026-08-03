# HR.DOCLINK.1 — Automatic Employee & Dependent Document Linking — Implementation Report

**Phase:** HR.DOCLINK.1
**Date:** 2026-08-03
**Status:** IMPLEMENTED / RUNTIME UAT PASSED ✅
**Plan:** `implementation_Review/HR/HR_DOCLINK_1_AUTOMATIC_EMPLOYEE_DEPENDENT_DOCUMENT_LINKING_PLAN.md`

---

## Decisions (resolved by Sameer, 2026-08-03)

| # | Decision |
|---|---|
| D1 | Dependent documents link to the **dependent only** (never doubled onto the parent employee) |
| D2 | Only **exact identity-number matches** are pre-ticked in the intake link panel; name matches are listed unticked |
| D3 | Review Queue path **included now** — covered because queue items approve through the same intake screen |

---

## What Was Built

### 1A — "Link to ERP Records" panel on the AI Intake Review screen

The main gap: AI intake approval never created document links, forcing manual
linking after every approval. The backend (`approveAiIntakeAndCreateDocument`,
`finalizeDraftIntake`, `approve_dms_ai_intake` RPC) already accepted a
`links[]` payload — the UI simply never sent it.

- **`src/lib/dms/entity-matching/intake-link-suggester.ts`** (new)
  - `extractIdentitySignals()` — pulls holder names, Emirates ID numbers and
    passport numbers out of `extracted_fields_json`, including the production
    `__additional_fields` array shape (`{label, value, confidence}`).
  - `nameTokenOverlap()` — token-overlap scoring that handles spelling
    variations ("Abu Alayan" vs "Abu Elayyan") which substring matching misses.
  - `buildIntakeLinkSuggestions()` — matches against
    `employee_identity_documents` (exact ID → pre-tick), `employee_dependents`
    (passport/EID columns → pre-tick), employee/dependent names (unticked),
    and merges the AI party matches from `suggested_links_json` (unticked).
- **`suggestIntakeEntityLinks(sessionCode)`** server action in
  `src/server/actions/dms/ai-intake.ts` — read-only, gated by intake view
  permission. No links are written here (Phase 13 human-review rule intact).
- **`src/features/dms/intake/dms-intake-link-panel.tsx`** (new) — checkbox
  suggestion list with match reasons + "exact ID match" badge, manual
  entity-type + record picker (reuses `DmsLinkEntitySelect`), removable chips.
  Replaces the old display-only "Matched Parties in Database" card.
- **`dms-ai-intake-page-client.tsx`** — holds `entityLinks` state and sends
  `links[]` in the shared approve payload, so **both** the single-file intake
  path and the batch/Review-Queue draft path (D3) write links on approve.

### 1B — Multi-select "Linked Documents" section in the Dependent dialog

- **`listEmployeeDependentDocumentLinks` / `applyEmployeeDependentDocumentLinks`**
  server actions in `src/server/actions/hr/compliance.ts`. Apply is staged:
  additions (insert or revive soft-deleted link, `link_role='dependent_form'`)
  and removals (soft delete) execute in one call on Save, with audit logging.
- **`src/features/hr/employees/compliance/dependent-document-links-section.tsx`**
  (new) — lists current links, "+ Link Documents" expands an **inline
  multi-select picker** (reuses `DmsAttachDocumentPicker`) so several
  documents are ticked at once — no one-at-a-time linking. Staged rows show
  "new" / "unlink on save" badges and an amber pending-changes note.
- Wired into **both** the Add Dependent dialog (`ComplianceDmsAddDialog`
  renderReview) and the Edit Dependent dialog in
  `employee-compliance-tab.tsx`. In Add mode links are staged against the
  not-yet-created dependent and applied right after `createEmployeeDependent`
  returns the new id.

### 1C — HR.14B wizard bug fix

`createDependentFromDms` in `src/server/actions/hr/document-to-record.ts`
linked source documents to the **parent employee**. Now links to the **new
dependent** (`entity_type='employee_dependent'`, `entity_id=<new id>`) per D1.

### Supporting change

- `DmsLinkEntitySelect` gained an optional `onOptionSelected` callback (chip
  labels) and its entity-type search reset was converted to the
  state-during-render pattern, clearing a pre-existing
  `react-hooks/set-state-in-effect` lint error.

---

## Bug Found & Fixed During UAT

`applyEmployeeDependentDocumentLinks` originally set a `deleted_by` column on
`dms_document_links` — that column does not exist (table has only
`deleted_at`), so unlink silently removed 0 rows (audit showed
`removed: 0`). Removed the nonexistent column from both the revive and
soft-delete updates; unlink then verified working.

---

## Runtime UAT (browser, live DB)

| Check | Result |
|---|---|
| Intake panel renders on `/dms/intake/[code]` | ✅ |
| Name suggestions: "Sameer Fahmi Ibrahim Abu Alayan" → suggests EMP-000001 + EMP-000003 (token overlap) | ✅ |
| No false matches for unknown holder (Gipson, no employee record) | ✅ |
| Tick suggestion → Approve → `dms_document_links` row (document 693 → employee 1, role `related`) | ✅ |
| Link visible in document edit screen → Links section | ✅ |
| Dependent edit dialog lists existing links (Irina: 4 docs) | ✅ |
| Multi-select add: 2 documents ticked at once → Save → 2 links with `link_role='dependent_form'` | ✅ |
| Staged unlink: 2 marked → Save → both soft-deleted | ✅ |
| Lint (0 errors), tsc (no new errors), vitest 447+12 passing | ✅ |

## Tests

- `src/lib/dms/entity-matching/__tests__/intake-link-suggester.test.ts` —
  12 unit tests: signal extraction (both `__additional_fields` shapes, key
  exclusions, normalization, dedupe) and `nameTokenOverlap` scoring.

## Files Changed

| File | Change |
|---|---|
| `src/lib/dms/entity-matching/intake-link-suggester.ts` | NEW — suggestion builder |
| `src/lib/dms/entity-matching/__tests__/intake-link-suggester.test.ts` | NEW — 12 tests |
| `src/features/dms/intake/dms-intake-link-panel.tsx` | NEW — link panel UI |
| `src/features/hr/employees/compliance/dependent-document-links-section.tsx` | NEW — dependent multi-link UI |
| `src/server/actions/dms/ai-intake.ts` | + `suggestIntakeEntityLinks` |
| `src/server/actions/hr/compliance.ts` | + list/apply dependent link actions |
| `src/server/actions/hr/document-to-record.ts` | 1C fix — link dependent, not employee |
| `src/features/dms/intake/dms-ai-intake-page-client.tsx` | links state + payload; replaced matched-parties card |
| `src/features/hr/employees/tabs/employee-compliance-tab.tsx` | dialog wiring + apply-on-save |
| `src/features/dms/documents/dms-link-entity-select.tsx` | `onOptionSelected` + lint fix |

## Notes / Follow-ups

- **Data backfill applied**: Jaslene Abu Elayyan's 5 HR.14B source documents
  (95, 94, 92, 87, 84) had no links at all due to the pre-fix bug — backfilled
  as `employee_dependent` links to dependent 2 with role `hr14b_source`.
  Irina's 4 documents were already correctly linked to dependent 1.
- Possible future phase (DOCLINK.2): pre-tick threshold configuration in AI
  Settings, and dependent-name matching against `employee_dependents` from
  the intake panel for family documents.
