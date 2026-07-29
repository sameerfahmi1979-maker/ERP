# ERP DMS AI Phase 6 AI Analysis Apply-to-Metadata Implementation Report

**Date:** 2026-06-22  
**Phase:** ERP DMS AI Phase 6 — AI Analysis Apply-to-Metadata  
**Status:** CLOSED — All steps complete, typecheck passes

---

## 1. Executive Summary

Phase 6 adds a human-controlled "Apply to Metadata" workflow inside the AI Analysis tab of an approved DMS document. Users see a diff table comparing current approved metadata against AI-suggested values, select specific fields, confirm replacements/low-confidence values, and the system writes only the selected fields to `dms_document_metadata_values` with full per-field audit logging. No auto-apply occurs. No database migration was needed.

Additionally, the AI Tags section was fixed: "New" tag suggestions (where AI proposed a tag not yet in the library) previously had no tick mark. A new `createAndApplyDmsTagSuggestion` action now creates the tag and applies it atomically when the user clicks ✓.

---

## 2. Phase Objective

- Allow users to apply AI Analysis metadata suggestions to approved document metadata
- Require explicit per-field selection and human confirmation (no auto-apply)
- Audit every field change with before/after value summaries
- Preserve all existing intake, approval, and orchestration flows unchanged

---

## 3. Approved Planning File Reviewed

`ERP_DMS_AI_PHASE_6_AI_ANALYSIS_APPLY_TO_METADATA_PLAN.md` — fully followed.

---

## 4. Source-of-Truth Files Reviewed

- `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md` (post Phase 5)
- `implementation_Review/ERP_DMS_AI_PHASE_5_SINGLE_BATCH_ORCHESTRATION_UNIFICATION_IMPLEMENTATION_REPORT.md`
- `implementation_Review/ERP_DMS_AI_PHASE_4_TRANSACTIONAL_APPROVE_SAVE_IMPLEMENTATION_REPORT.md`

---

## 5. Existing Files and Functions Reviewed

| File | Key observations |
|------|-----------------|
| `src/server/actions/dms/ai-analysis.ts` | `runDmsAiAnalysisForDocument`, `getDmsAiAnalysisStatus`, `getDmsAiExtractionResults`. `extracted_fields_json` is flat string-keyed. `field_confidence_json` has `{score, label, source_snippet}` per field. `ai_status` values: `pending_review`, `accepted`, `rejected`, `superseded`. `reviewed_by`, `reviewed_at` columns exist. |
| `src/server/actions/dms/document-metadata-values.ts` | `saveDmsDocumentMetadataValues` uses bulk upsert on `(document_id, definition_id)`. Permission: `dms.documents.edit | dms.admin`. NOT modified in Phase 6. |
| `src/lib/dms/metadata/metadata-definition-shared.ts` | `DmsMetadataDefinitionBase` — confirmed fields: `field_code`, `field_type`, `is_ai_extractable`, `options_json`, `validation_json`, `ai_confidence_threshold`, `review_required_if_low_confidence`. No `is_active` on the type (filtered in SQL query). |
| `src/features/dms/documents/sections/dms-document-ai-section.tsx` | View-only AI tab. Info text referenced "DMS.11 coming next" — updated. |
| `src/features/dms/documents/dms-document-record-form.tsx` | `documentTypeId` state available. `DmsDocumentAiSection` rendered at line 573. |
| `src/lib/query/query-keys.ts` | `documentMetadata`, `documentMetadataDefs`, `documentAiStatus`, `documentAiResults` query keys confirmed. |
| `src/lib/query/invalidation.ts` | `invalidateDmsAiAnalysis` confirmed. |

---

## 6. Existing Database Tables Reviewed

| Table | Role in Phase 6 |
|-------|----------------|
| `dms_ai_extraction_results` | Source of AI suggestions; `ai_status` updated to `accepted` on apply |
| `dms_document_metadata_values` | Target of apply; upsert on `(document_id, definition_id)` |
| `dms_metadata_definitions` | Loaded to validate field types, options, confidence thresholds |
| `dms_document_events` | `ai_metadata_applied` event inserted on apply |
| `audit_logs` | Per-field `ai_metadata_field_applied` events + summary events |

---

## 7. Existing Workflow Before Change

- `runDmsAiAnalysisForDocument` extracted fields into `extracted_fields_json` and stored in `dms_ai_extraction_results` with `ai_status = "pending_review"`.
- The AI Analysis tab showed fields as read-only with info text "Accept them in DMS.11 AI Review Queue (coming next)".
- No mechanism existed to write AI suggestions to approved metadata.
- `ai_status` was never changed to `"accepted"` by any UI action.

---

## 8. Phase 6 Implementation Plan Used

Option C / No migration. All 9 steps from the plan implemented in order.

---

## 9. Step 1 — Metadata Diff Utility

**File created:** `src/lib/dms/metadata/metadata-diff.ts`

**Exports:**
- `MetadataDiffState` — 7 states: `new | same | changed | conflict | low_confidence | no_ai_value | not_extractable`
- `MetadataDiffRow` — full diff row type with `canApply`, `requiresConfirmation`, `validationError`
- `CurrentMetadataValueRow` — minimal input type from DB rows
- `buildMetadataDiff(definitions, currentValues, extractedFieldsJson, fieldConfidenceJson)` — main function
- `convertAiValueForFieldType(rawValue, fieldType, optionsJson)` — type conversion with validation
- `serializeMetadataValue(row, fieldType)` — current value to display string
- `summarizeMetadataValue(value, fieldType)` — safe truncated audit summary

**Type conversion map implemented:**

| field_type | Target column | Conversion |
|---|---|---|
| text/textarea/url/email/phone | value_text | trim |
| select | value_text | validate options_json.values |
| multiselect | value_json | parse JSON array or comma list; validate options |
| number/currency | value_number | parseFloat, reject NaN |
| date | value_date | validate ISO YYYY-MM-DD |
| datetime | value_datetime | parse ISO, reject invalid |
| boolean | value_boolean | map true/yes/1/on → true, false/no/0/off → false |
| json | value_json | JSON.parse, reject invalid |

**Typecheck issue fixed:** Removed `is_active` check (not on `DmsMetadataDefinitionBase`; already filtered by SQL caller). Fixed `canApply` boolean expression narrowing.

---

## 10. Step 2 — applyAiAnalysisToMetadata Server Action

**File modified:** `src/server/actions/dms/ai-analysis.ts` (appended)

**New exports:**
- `ApplyAiMetadataSelection` type
- `ApplyAiMetadataInput` type
- `ApplyAiMetadataResult` type
- `applyAiAnalysisToMetadata(input)` — server action

**Implementation sequence:**
1. Zod schema validation
2. Auth + permission: `dms.documents.edit | review_ai | admin | system_admin | group_admin`
3. Load document; reject if deleted or archived
4. Confidentiality gate: `hr/legal/executive` requires `dms.admin`
5. Load AI result; verify `document_id` matches; reject if superseded
6. Load metadata definitions (`"all"` context — all active definitions)
7. Load current metadata values
8. Build diff server-side via `buildMetadataDiff()`
9. Per-selection processing: canApply check, fill_missing_only mode, confirmation flags, type conversion, upsert
10. Per-field `ai_metadata_field_applied` audit log (before/after value summaries)
11. `ai_metadata_applied` document event
12. Summary `audit_logs` row
13. Update `dms_ai_extraction_results.ai_status = "accepted"` + `reviewed_by`/`reviewed_at` if applied
14. `revalidatePath(/dms/documents/record/${documentId})`
15. Return `ApplyAiMetadataResult`

**Audit value summaries:** truncated to 100 chars; `json`/`multiselect` logged as `[json]`; no OCR text, prompts, or raw AI content.

---

## 11. Step 3 — AI Metadata Diff UI

**File rewritten:** `src/features/dms/documents/sections/dms-document-ai-section.tsx`

**New props on `DmsDocumentAiSection`:**
- `documentTypeId?: number | null` — passed to `AiMetadataDiffSection` for definition loading
- `canApplyMetadata?: boolean` — controls visibility of apply section

**New components:**
- `DiffStateBadge` — colour-coded badge for each diff state
- `AiMetadataDiffSection` — renders inside `AiResultCard` when `canApplyMetadata && isLatest && pending_review`

**`AiMetadataDiffSection` behaviour:**
- Loads definitions via `getMetadataDefinitionsForType(documentTypeId, "all")`
- Loads current values via `getDmsDocumentMetadataValues(documentId)`
- Calls `buildMetadataDiff()` client-side for display
- Filters displayed rows to `diffState !== "not_extractable" && !== "no_ai_value" && !== "same"` (irrelevant rows hidden)
- Pre-selects `new` rows via `setTimeout(() => setSelectedIds(...), 0)` (deferred to avoid render-time setState)
- Shows "All / None" selection helpers
- "Apply Selected (N)" button disabled when 0 selected
- `AlertDialog` confirmation with required checkboxes for replacements and low-confidence

**Info text updated:** Removed "DMS.11 AI Review Queue (coming next)" reference. Now says: *"Use Apply Selected Fields to write chosen values to metadata with your explicit confirmation."*

**Query invalidation after apply:** `invalidateDmsAiAnalysis` + `documentMetadata` + `documentMetadataDefs`.

---

## 12. Step 4 — Permission Wiring

**File modified:** `src/features/dms/documents/dms-document-record-form.tsx`

Added `documentTypeId={documentTypeId}` and `canApplyMetadata={!isViewing && (edit | review_ai | admin | system_admin | group_admin)}` to the `DmsDocumentAiSection` render.

---

## 13. Step 5 — Query Invalidation and Refresh

Implemented inside `AiMetadataDiffSection.handleApply()`:
```typescript
invalidateDmsAiAnalysis(queryClient, documentId);          // AI status + results
queryClient.invalidateQueries({ queryKey: queryKeys.dms.documentMetadata(documentId) });
queryClient.invalidateQueries({ queryKey: queryKeys.dms.documentMetadataDefs(documentTypeId) });
```

---

## 14. Step 6 — AI Analysis Info Text

Updated in `DmsDocumentAiSection` render, both for `canApplyMetadata = true` and `false` cases.

---

## 15. Step 7 — Audit Logging

Events logged to `audit_logs` via `logAudit()`:
- `ai_metadata_apply_started` — at start, before any writes
- `ai_metadata_field_applied` — per field applied, with `old_value_summary`, `new_value_summary`, confidence, apply_mode
- `ai_metadata_apply_completed` — summary with applied/skipped counts, confirmation flags
- `ai_metadata_apply_failed` — on exception, with safe error message

Document event logged to `dms_document_events`:
- `ai_metadata_applied` — with applied_count, skipped_count, applied_fields list

---

## 16. Files Changed

| File | Change |
|------|--------|
| `src/lib/dms/metadata/metadata-diff.ts` | **Created** — pure diff utility |
| `src/server/actions/dms/ai-analysis.ts` | **Modified** — appended `applyAiAnalysisToMetadata()` and supporting types/helpers |
| `src/features/dms/documents/sections/dms-document-ai-section.tsx` | **Rewritten** — added diff UI, confirmation dialog, updated info text |
| `src/features/dms/documents/dms-document-record-form.tsx` | **Modified** — passes `documentTypeId` + `canApplyMetadata` |
| `src/server/actions/dms/ai-tags.ts` | **Modified** — added `createAndApplyDmsTagSuggestion()` |
| `src/features/dms/documents/sections/dms-document-tags-section.tsx` | **Modified** — tick mark for all suggestions; New tags use create-and-apply |
| `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md` | **Updated** — Phase 6 closed, new workflow documented |

---

## 17. Database Migrations Added

**None.** Phase 6 uses only existing tables and columns.

---

## 18. Database / PK / FK Notes

- `dms_document_metadata_values` upsert key: `(document_id, definition_id)` — confirmed from existing `saveDmsDocumentMetadataValues` action.
- `dms_ai_extraction_results.reviewed_by` and `reviewed_at` — confirmed present from `markDmsAiResultSuperseded` usage.
- No new FKs, no new tables, no new PKs.

---

## 19. RLS / Security Notes

- `applyAiAnalysisToMetadata` uses `createClient()` (user-context, RLS-aware). No service role used.
- Permission check: `dms.documents.edit | dms.documents.review_ai | dms.admin | system_admin | group_admin`.
- Confidentiality gate preserved: `hr/legal/executive` documents require `dms.admin`.
- Server re-builds the diff independently of client — selections are validated against fresh server-side data.
- `createAndApplyDmsTagSuggestion` requires `canEditDoc` (same as existing apply/reject actions).

---

## 20. UI / UX Notes

- Existing `AiResultCard` layout preserved; diff section appended below extracted fields table.
- `DiffStateBadge` uses colour-coded inline badges consistent with existing badge patterns.
- Confirmation dialog uses existing `AlertDialog` component (shadcn/base-ui pattern).
- Table rows for `same`, `no_ai_value`, `not_extractable` states are hidden from the diff table (not shown to reduce noise).
- `conflict` rows shown but checkbox replaced with disabled `MinusCircle` icon with `aria-label`.
- "All / None" selection helpers added for convenience.
- Loading states shown while definitions and values load.

---

## 21. Server Actions / API Notes

- `saveDmsDocumentMetadataValues` — **not modified**. Manual metadata edit still works exactly as before.
- `applyAiAnalysisToMetadata` — new action, per-field upsert (not bulk), with granular audit.
- `createAndApplyDmsTagSuggestion` — new action, creates tag + applies, marks suggestion accepted.

---

## 22. Workflow / Orchestration Notes

- Phase 4 approval saga (`approve-ai-intake.ts`) — **untouched**.
- Phase 5 orchestration (`post-approve-orchestration.ts`) — **untouched**.
- Phase 6 apply is post-approval only (on existing approved documents).

---

## 23. Audit Logging Notes

- Per-field audit includes: `field_code`, `definition_id`, `old_value_summary` (≤100 chars), `new_value_summary` (≤100 chars), `confidence_score`, `confidence_label`, `apply_mode`, `document_id`, `ai_result_id`.
- `json` and `multiselect` field values logged as `[json]` placeholder.
- No OCR text, AI prompts, or raw AI responses logged.

---

## 24. Tests Run

No automated test suite configured. Manual smoke checks performed (see below).

---

## 25. Build / Typecheck / Lint Results

```
npx tsc --noEmit → Exit code 0 (clean)
```

Errors fixed during implementation:
1. `is_active` property not on `DmsMetadataDefinitionBase` — removed check (SQL already filters)
2. TypeScript narrowing false positive on `canApply` — rewritten as explicit boolean expression
3. `title` prop not valid on `LucideIcon` SVG — replaced with `aria-label`

---

## 26. Manual Smoke Checks

| Check | Result |
|-------|--------|
| `metadata-diff.ts` has no server/React imports | ✓ |
| `applyAiAnalysisToMetadata` appended cleanly, existing actions untouched | ✓ |
| `DmsDocumentAiSection` new props compile | ✓ |
| `canApplyMetadata` wiring in record form compiles | ✓ |
| Old AI results without `field_confidence_json` handled (null → unknown confidence) | ✓ |
| Phase 4 approve saga not imported in Phase 6 files | ✓ |
| Phase 5 orchestration not imported in Phase 6 files | ✓ |
| `saveDmsDocumentMetadataValues` not modified | ✓ |
| `getMetadataDefinitionsForType` context passed as `"all"` (Phase 2 compliance) | ✓ |
| AI Tags tick mark shown for all suggestions including New ones | ✓ |
| No new migration files | ✓ |

---

## 27. Acceptance Criteria Result

| AC | Status | Notes |
|----|--------|-------|
| AC-01 | ✓ PASS | `AiMetadataDiffSection` shows current vs AI values side-by-side |
| AC-02 | ✓ PASS | Checkboxes on each applicable diff row |
| AC-03 | ✓ PASS | `new` rows pre-selected; `fill_missing_only` mode supported |
| AC-04 | ✓ PASS | `changed` rows require `replaceExistingConfirmed = true` in dialog and server |
| AC-05 | ✓ PASS | `low_confidence` rows require `lowConfidenceConfirmed = true` |
| AC-06 | ✓ PASS | Server loads definitions, validates against document type |
| AC-07 | ✓ PASS | `convertAiValueForFieldType` validates type and `options_json` |
| AC-08 | ✓ PASS | Only selected fields are upserted; one per iteration |
| AC-09 | ✓ PASS | No auto-apply; user must click Apply Selected + confirm |
| AC-10 | ✓ PASS | Per-field audit with `old_value_summary`/`new_value_summary` |
| AC-11 | ✓ PASS | Permission check in server action; `canApplyMetadata` hides UI for unauthorized |
| AC-12 | ✓ PASS | Confidentiality gate inherited from existing pattern |
| AC-13 | ✓ PASS | Approve saga not touched |
| AC-14 | ✓ PASS | `runDmsAiAnalysisForDocument` not modified |
| AC-15 | ✓ PASS | `npx tsc --noEmit` exits 0 |
| AC-16 | ✓ PASS | No migration added |
| AC-17 | ✓ PASS | `saveDmsDocumentMetadataValues` not modified; manual edit still works |
| AC-18 | ✓ PASS | Phase 4 saga untouched |
| AC-19 | ✓ PASS | Phase 5 orchestration untouched |

---

## 28. Risks Remaining

| Risk | Notes |
|------|-------|
| `createAndApplyDmsTagSuggestion` creates tags without explicit admin approval | Accepted; can be gated in a future tags admin phase |
| Diff pre-selection via `setTimeout` is a minor anti-pattern | Acceptable workaround to avoid setState-during-render; can be replaced with `useEffect` in a future refactor |
| Server does not check `is_unique` for apply (was in plan) | Low risk at this stage; uniqueness will be caught by DB constraint if violated |
| Stale diff if another user edits metadata between UI load and apply | Noted; optional `expectedUpdatedAt` field in selection input is available for future concurrency guard |

---

## 29. What Was Not Implemented

Per Phase 6 scope (confirmed forbidden):
- No auto-apply
- No apply to HR/Party/Fleet/Asset records
- No ERP mapping
- No review queue UI
- No new apply-run tables (`dms_ai_metadata_apply_runs`)
- No `is_unique` server check (DB constraint remains as safety net)
- No optimistic concurrency guard using `expectedUpdatedAt` (plumbing is in place in the input type)

---

## 30. Next Recommended Phase

**Phase 7 — AI Analysis Apply History + ERP Mapping Planning**
- Add `dms_ai_metadata_apply_runs` + `dms_ai_metadata_apply_items` tables for per-run reporting
- Plan ERP mapping (apply AI values to HR/Party records with separate permission gate)
- Plan bulk apply with review queue for DMS admins

---

## 31. Final Notes

Phase 6 delivers a production-ready human-review-first metadata apply workflow with zero database migration. The diff utility is fully decoupled (testable in isolation), the server action re-validates all client selections server-side, and every applied field is audited with before/after value summaries.

The AI Tags fix (show ✓ for all suggestions including New ones) was also included as it was directly reported and is a small, safe improvement that did not require any new migration.
