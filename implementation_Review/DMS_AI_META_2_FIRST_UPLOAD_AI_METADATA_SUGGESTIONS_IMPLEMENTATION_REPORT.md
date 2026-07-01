# ERP DMS AI META.2 — First Upload AI Metadata Suggestions with Authorized Approval — Implementation Report

**Status:** CLOSED / PASS ✅
**Date:** 2026-07-02
**Governance rule (unchanged throughout):** *AI suggests. Human chooses. System saves only approved items.*

---

## 1. Summary

META.2 replaces the earlier "auto-create metadata definitions on first upload" concept
(never implemented) with a fully human-in-the-loop approval workflow. When a document
type has **zero** active metadata definitions:

- **Flow A (Intake Review):** an authorized user reviewing an intake session for that
  document type sees a "Suggest Fields with AI" / "Skip for Now" prompt inline. A
  non-authorized user sees a static "Ask a DMS Manager" message instead.
- **Flow B (Background Queue):** after a document of a zero-definition type is
  approved, a background job silently *generates* AI field suggestions and stores them
  in the DMS Review Queue for later authorized review — no UI interruption for the
  uploader.

In both flows, suggestions are never saved automatically. An authorized user must open
the suggestions (checkbox multi-select, editable), and only fields they explicitly keep
selected are created via the existing `createDmsMetadataDefinition()` action — the sole
write path into `dms_metadata_definitions`. After creation, an `AI_RE_EXTRACTION` job is
enqueued to fill in values for the newly created fields only for the single document
that triggered the workflow — it never touches fields/documents with existing values.

---

## 2. Database Changes

### Migration 1 — `20260702000000_dms_ai_meta2_first_upload_suggestions.sql`

| Change | Detail |
|---|---|
| `dms_metadata_definitions.created_from_ai_suggestion` | `BOOLEAN NOT NULL DEFAULT false` — true only when a human approved an AI suggestion for this field |
| `dms_metadata_definitions.ai_suggestion_trigger_document_id` | `BIGINT NULL REFERENCES dms_documents(id) ON DELETE SET NULL` |
| `dms_document_types.ai_suggestions_generated_at` | `TIMESTAMPTZ NULL` — idempotency marker for Flow B |
| `dms_document_types.ai_suggestions_approved_at` | `TIMESTAMPTZ NULL` — set when a human approves at least one suggested field |
| Indexes | `idx_dms_metadata_definitions_ai_suggestion` (partial), `idx_dms_metadata_definitions_ai_trigger_doc` (partial), `idx_dms_document_types_ai_suggestions_gen` (partial) |
| Feature flag | `DMS_AI_FIRST_UPLOAD_METADATA_SUGGESTIONS` inserted, **default `is_enabled = false`**, `requires_human_review = true`, `min_confidence_threshold = 0.70` |
| Permission | `dms.metadata.ai_suggestions.approve` inserted (module `DMS`, action `approve`) |
| Role grants | `system_admin`, `group_admin`, `dms_manager` (verified live role codes — no `dms_admin` role exists in this environment) |

### Migration 2 — `20260702010000_dms_ai_meta2_review_type_constraint.sql` (applied during this closure pass)

The first migration did not extend the `dms_review_queue_review_type_check` CHECK
constraint. This was caught during verification (see §6 below) — Flow B's insert into
`dms_review_queue` with `review_type = 'metadata_definition_suggestions_review'` would
have failed the constraint added in Phase 13. Fixed with a drop/recreate migration
(same pattern as Phase 13) that appends the new value to the existing allowed list.
Both migrations applied to the live Supabase project and verified via direct SQL query.

No RLS policy changes. No new tables.

---

## 3. Job Types and Handlers

`src/lib/dms/ai-jobs/job-types.ts`:
- `GENERATE_METADATA_DEFINITION_SUGGESTIONS` (`generate_metadata_definition_suggestions`) — priority 4, max attempts per registry default.
- `AI_RE_EXTRACTION` (`ai_re_extraction`) — max attempts 3.

Handlers (`src/lib/dms/ai-jobs/handlers/`):
- `generate-metadata-definition-suggestions.handler.ts` — thin wrapper calling `generateAndQueueMetadataSuggestions()`. Never writes to `dms_metadata_definitions`.
- `ai-re-extraction.handler.ts` — runs only after a human has approved definitions. Extraction-only (no reclassification). Only fills fields with **no existing value row** for the document — never overwrites human-approved or previously-saved values. Safe no-op on any missing precondition (no content text, AI unconfigured, unparsable response).

Both registered in `src/lib/dms/ai-jobs/job-registry.ts`.

`src/lib/dms/orchestration/system-pipeline.ts` — `tryEnqueueMetadataSuggestionsJob()` runs after post-approval semantic indexing and enqueues Flow B's job only when the document's type currently has zero active definitions, using `enqueueUniqueDmsAiJob` for idempotency.

---

## 4. Server Actions

| File | Purpose |
|---|---|
| `src/server/actions/dms/metadata-suggestion-queue.ts` | `generateAndQueueMetadataSuggestions()` — system/worker-context function; generates suggestions via the shared AI builder, upserts a `metadata_definition_suggestions_review` review-queue item (`source_type: "document_type"`), stamps `ai_suggestions_generated_at`. Logs via `logger.info()` (no user session in worker context). |
| `src/server/actions/dms/metadata-suggestion-review.ts` | `approveMetadataSuggestions()`, `rejectMetadataSuggestions()`, `skipMetadataSuggestionsForNow()`, `canCurrentUserApproveAiMetadataSuggestions()`, `getOpenMetadataSuggestionsReviewItem()`. User-context actions — all gated by `canApproveAiMetadataSuggestions()`. Approval enqueues `AI_RE_EXTRACTION` for the trigger document and stamps `ai_suggestions_approved_at`; rejection dismisses the review-queue item; both emit audit events. |
| `src/server/actions/dms/metadata-definitions.ts` | `createDmsMetadataDefinition()` extended with `created_from_ai_suggestion` / `ai_suggestion_trigger_document_id`. Permission check branches: AI-sourced definitions require `canApproveAiMetadataSuggestions()`; manual definitions keep the original `dms.documents.manage_types` check. This remains the **only** write path into `dms_metadata_definitions`. |
| `src/server/actions/dms/ai-metadata-suggestions.ts` | Unchanged public surface (`suggestMetadataDefinitions`), internally refactored onto the shared `src/lib/dms/metadata/ai-definition-builder.ts` builder so Flow A/B/manual admin all use identical AI prompt + Zod validation logic. |

---

## 5. UI Changes

| File | Change |
|---|---|
| `src/features/dms/intake/dms-ai-intake-zero-definitions-notice.tsx` **(new)** | Flow A banner. Checks authorization + any already-pending review-queue batch on mount; renders Suggest/Skip, Open Pending Review, or the "ask a DMS Manager" message accordingly. |
| `src/features/dms/intake/dms-ai-intake-metadata-section.tsx` | Renders the new notice instead of returning `null` when a document type has zero definitions; reloads definitions after creation so the intake form immediately shows the new fields. |
| `src/features/dms/intake/dms-ai-intake-review-form.tsx` | Wires `documentTypeName` + `onDefinitionsCreated` (triggers a metadata re-run for the current intake session) through to the metadata section. |
| `src/features/dms/admin/dms-ai-metadata-suggestions-dialog.tsx` | Extended with META.2 props: `documentTypeCode`, `source` (`admin_manual` \| `intake_review` \| `review_queue`), `triggerDocumentId`, `reviewQueueItemId`, `embedded`, `onRejected`. On submit, passes the new provenance fields to `createDmsMetadataDefinition` and, for non-manual sources, calls `approveMetadataSuggestions()` afterward. Added `embedded` render mode (no `ERPChildDialogForm` wrapper) with its own Dismiss All / Accept & Create footer for use inside the Review Queue drawer. |
| `src/features/dms/admin/dms-metadata-definitions-table.tsx` | "AI-Assisted" `<Sparkles>` badge on rows where `created_from_ai_suggestion` is true; new Source filter (`All` / `Manual` / `AI-Assisted`); manual create/edit path explicitly sets `created_from_ai_suggestion: false`. |
| `src/features/dms/review-queue/dms-review-queue-filters.tsx`, `dms-review-queue-table.tsx` | New `metadata_definition_suggestions_review` review type added to filter options and badge/source-column rendering (shows document type code/name from `payload_json`). |
| `src/features/dms/review-queue/dms-review-queue-item-drawer.tsx` | Renders `DmsAiMetadataSuggestionsDialog` in `embedded` mode directly inside the drawer for `metadata_definition_suggestions_review` items, reconstructing `AiSuggestedField[]` from the sanitized `payload_json`. The generic Resolve/Dismiss footer is suppressed for this review type since Accept/Dismiss All live inside the embedded panel. |

---

## 6. Verification

| Check | Result |
|---|---|
| `npm run typecheck` | **0 errors** (2 pre-existing type errors introduced by this session's edits were found and fixed — missing `created_from_ai_suggestion`/`ai_suggestion_trigger_document_id` in the manual admin form payload, and an `unknown`-in-JSX render error in the review queue table) |
| `npm run build` | **PASS**, all routes compiled |
| ESLint (all new/modified META.2 files) | **0 new issues.** One pre-existing `react-hooks/purity` violation remains in `dms-review-queue-item-drawer.tsx:543` (a `Date.now()` call inside unrelated Phase-16 code, outside this session's diff hunks — not introduced or touched here) |
| `grep -i` for forbidden legacy terms (`AUTO_CREATE_METADATA_DEFINITIONS`, `DMS_AI_AUTO_CREATE_DEFINITIONS`, `is_ai_auto_created`, `definitions_auto_created_at`) across `src/` and `supabase/migrations/` | **0 matches** |
| Live DB: feature flag `DMS_AI_FIRST_UPLOAD_METADATA_SUGGESTIONS` | exists, `is_enabled = false` (safe default) |
| Live DB: permission `dms.metadata.ai_suggestions.approve` | exists, active, granted to `system_admin`, `group_admin`, `dms_manager` |
| Live DB: `dms_metadata_definitions`/`dms_document_types` new columns | all 4 present with correct types |
| Live DB: `dms_review_queue_review_type_check` | **initially missing** `metadata_definition_suggestions_review` — fixed via migration 2 above, re-verified present |
| Live DB: `dms_review_queue` `source_type` | no CHECK constraint exists on this column — `"document_type"` free-text value is safe |

---

## 7. Bugs Found and Fixed During This Closure Pass

1. **Missing CHECK constraint value** — `dms_review_queue_review_type_check` did not
   include `metadata_definition_suggestions_review`. Any Flow B insert would have
   failed at runtime. Fixed with migration
   `20260702010000_dms_ai_meta2_review_type_constraint.sql`, applied and verified live.
2. **Manual admin form TS error** — `formToPayload()` in
   `dms-metadata-definitions-table.tsx` did not set the now-required
   `created_from_ai_suggestion` field. Fixed by explicitly setting
   `created_from_ai_suggestion: false` / `ai_suggestion_trigger_document_id: null` for
   the manual admin create/edit path.
3. **`unknown` rendered in JSX** — `dms-review-queue-table.tsx` conditionally rendered
   `item.payloadJson?.document_type_name` (typed `unknown`) directly inside a `&&`
   chain, which TypeScript rejects as a `ReactNode`. Fixed with an explicit
   `Boolean(...)` guard and `String(...)` cast.
4. **React Compiler lint violation in new file** — `dms-ai-intake-zero-definitions-notice.tsx`
   called `setState` synchronously in the `useEffect` body (flagged by
   `react-hooks/set-state-in-effect`). Fixed by moving the two reset calls inside the
   async IIFE.

No other files in this session introduced new lint or type errors; all other flagged
issues were pre-existing and outside this session's diff hunks (confirmed via
`git diff` hunk headers).

---

## 8. Files Changed / Created

**Database:**
- `supabase/migrations/20260702000000_dms_ai_meta2_first_upload_suggestions.sql` (new)
- `supabase/migrations/20260702010000_dms_ai_meta2_review_type_constraint.sql` (new)

**Server / lib:**
- `src/lib/dms/metadata/ai-definition-builder.ts` (new — shared AI suggestion builder)
- `src/lib/dms/metadata/ai-suggestion-permissions.ts` (new — `canApproveAiMetadataSuggestions`)
- `src/lib/dms/metadata/metadata-definition-shared.ts` (modified)
- `src/lib/dms/ai-jobs/job-types.ts` (modified)
- `src/lib/dms/ai-jobs/job-registry.ts` (modified)
- `src/lib/dms/ai-jobs/handlers/generate-metadata-definition-suggestions.handler.ts` (new)
- `src/lib/dms/ai-jobs/handlers/ai-re-extraction.handler.ts` (new)
- `src/lib/dms/orchestration/system-pipeline.ts` (modified)
- `src/lib/dms/review-queue/review-queue-upsert.ts` (modified)
- `src/server/actions/dms/ai-metadata-suggestions.ts` (modified)
- `src/server/actions/dms/metadata-suggestion-queue.ts` (new)
- `src/server/actions/dms/metadata-suggestion-review.ts` (new)
- `src/server/actions/dms/metadata-definitions.ts` (modified)

**UI:**
- `src/features/dms/intake/dms-ai-intake-zero-definitions-notice.tsx` (new)
- `src/features/dms/intake/dms-ai-intake-metadata-section.tsx` (modified)
- `src/features/dms/intake/dms-ai-intake-review-form.tsx` (modified)
- `src/features/dms/admin/dms-ai-metadata-suggestions-dialog.tsx` (modified)
- `src/features/dms/admin/dms-metadata-definitions-table.tsx` (modified)
- `src/features/dms/review-queue/dms-review-queue-filters.tsx` (modified)
- `src/features/dms/review-queue/dms-review-queue-table.tsx` (modified)
- `src/features/dms/review-queue/dms-review-queue-item-drawer.tsx` (modified)

---

## 9. Feature Flag State (post-implementation, safe default)

`DMS_AI_FIRST_UPLOAD_METADATA_SUGGESTIONS = false` — controls **Flow B only** (the
background `GENERATE_METADATA_DEFINITION_SUGGESTIONS` job): both the pipeline enqueue
helper (`tryEnqueueMetadataSuggestionsJob`) and `generateAndQueueMetadataSuggestions()`
itself check the flag and no-op when it is disabled, so no review-queue item is created
in the background while the flag is off.

**Flow A (the intake "Suggest Fields with AI" / "Skip for Now" notice) is not gated by
this flag**, by design — it reuses the same always-available `suggestMetadataDefinitions()`
action and `canApproveAiMetadataSuggestions()` permission guard that META.1's admin
manual "Suggest with AI" button already used unconditionally, consistent with the
implementation prompt's Task 14 spec. It is effectively gated by the AI provider
configuration (`checkDmsAiProviderAvailable`) and the approval permission, the same way
META.1 was.

---

## 10. Next Steps

- Sameer/Dina to enable `DMS_AI_FIRST_UPLOAD_METADATA_SUGGESTIONS` in a test environment
  and run a live UAT pass (Flow A prompt on a zero-definition document type upload,
  Flow B background queue + Review Queue drawer approval, `AI_RE_EXTRACTION` value
  fill-in) before enabling in production.
- No further planned work under META.2. Any additional metadata-AI phases require a
  new explicit planning prompt.
