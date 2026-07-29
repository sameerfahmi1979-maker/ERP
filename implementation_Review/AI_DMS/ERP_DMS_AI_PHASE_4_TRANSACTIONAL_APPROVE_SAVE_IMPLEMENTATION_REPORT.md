# ERP DMS AI Phase 4 — Transactional Approve & Save Command Chain
## Implementation Report

**Date:** 2026-06-22  
**Phase:** ERP DMS AI Phase 4 — Transactional Approve & Save  
**Prior Phase:** Phase 3 — Metadata-Aware Classification (closed 2026-06-22)  
**Approach Adopted:** Hybrid Option C (TypeScript approval saga + atomic PostgreSQL RPC)  
**Status:** ✅ COMPLETED — TypeScript passes clean, all steps delivered

---

## Summary

Phase 4 replaces the sequential, non-atomic approve-and-save chain with a robust, transactional, and recoverable system. The core change is the introduction of `runApproveAiIntakeSaga` — a TypeScript orchestrator that:

1. Tracks every approval attempt in `dms_approve_runs`
2. Copies the file from temp storage to its deterministic final path
3. Delegates all database writes to a single atomic PostgreSQL RPC (`approve_dms_ai_intake`)
4. Compensates storage if the RPC fails
5. Triggers best-effort OCR/content sync post-commit without blocking the response

Both the single-file approve path (`ai-intake.ts`) and batch finalize path (`batch-intake.ts`) now delegate to the same saga, eliminating divergent logic.

---

## Architecture: Hybrid Option C

```
approveAiIntakeAndCreateDocument()   finalizeDraftIntake()
              │                                │
              └──────────────┬────────────────┘
                             ▼
                   runApproveAiIntakeSaga()
                             │
              ┌──────────────┼──────────────┐
              │              │              │
         Events          Storage          RPC
     (approve_runs)   (copy/cleanup)  (atomic PG)
              │              │              │
              └──────────────┼──────────────┘
                             │
                    post-commit OCR sync
                       (best-effort)
```

---

## Steps Completed

### Step 0 — Review Phase 4 plan, source of truth, and current code ✅
Reviewed `ERP_DMS_AI_PHASE_4_TRANSACTIONAL_APPROVE_SAVE_PLAN.md`, `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md`, and all relevant current server actions and helpers. Confirmed Hybrid Option C as the approved approach.

### Step 1 — Database migration ✅
**File:** `supabase/migrations/20260622103000_erp_dms_ai_phase4_transactional_approve_save.sql`

Delivered:
- `dms_approve_runs` table — tracks each approval attempt with columns: `id`, `upload_session_id`, `document_id`, `ai_result_id`, `run_key`, `status`, `stage`, `temp_bucket`, `temp_path`, `final_bucket`, `final_path`, `error_code`, `error_message`, `error_raw`, `started_at`, `completed_at`, `created_by`
- Indexes on `upload_session_id`, `document_id`, `status`
- Unique partial index on `(upload_session_id)` WHERE `status IN ('completed','db_committed')` — prevents duplicate approved runs
- RLS policies on `dms_approve_runs` — authenticated users with DMS permissions
- New columns on `dms_upload_sessions`: `approve_run_id`, `approve_status`, `approve_error`, `approved_at`
- `reserve_dms_document_id()` — SECURITY DEFINER RPC to pre-reserve a `dms_documents` identity ID before file copy
- `approve_dms_ai_intake(p_payload JSONB)` — SECURITY DEFINER atomic RPC handling all DB writes in one transaction

**RPC `approve_dms_ai_intake` transaction scope:**
- Row-locks `dms_upload_sessions` (FOR UPDATE) — race-condition prevention
- Idempotency check — returns existing document_id if already approved
- Validates session status and approval mode
- Conditionally inserts (new) or updates (existing draft) `dms_documents`
- Inserts `dms_document_versions` + `dms_document_files`
- Updates `current_version_id`
- Upserts `dms_document_metadata_values`
- Inserts `dms_document_tags` + `dms_document_links` (ON CONFLICT DO NOTHING)
- Upserts `dms_expiry_reminders`
- Updates `dms_ai_extraction_results` → accepted
- Updates `dms_upload_sessions` → approved
- Inserts `dms_document_events` audit entry
- Updates `dms_approve_runs` → db_committed
- Returns `document_id`, `document_no`, `status`

### Step 2 — Shared approve service modules ✅

**`src/lib/dms/approve/approve-ai-intake-events.ts`**
- `APPROVE_STAGE` and `APPROVE_STATUS` constants
- `sanitizeApproveError()` — strips JSON payloads from error messages (no sensitive data in logs)
- `createApproveRun()` — inserts initial tracking record
- `updateApproveRunStage()` — updates run status/stage with optional metadata
- `recordApproveRunOnSession()` — links run to session and updates session approve columns

**`src/lib/dms/approve/approve-ai-intake-storage.ts`**
- `buildFinalStoragePath()` — deterministic `{doc_id}/{version_no}/{filename}` path
- `getFileExtension()` — safe extension extraction
- `copyFileToFinalStorage()` — copies from `dms-temp` to `dms-documents`
- `cleanupFinalStorageFile()` — deletes the copied file on compensation

**`src/lib/dms/approve/approve-ai-intake-payload.ts`**
- `APPROVE_REMINDER_DAYS` constant
- `resolveMetadataPayloadColumns()` — maps metadata type to DB columns
- `buildMetadataValuePayloads()` — constructs metadata value array for RPC
- `buildReminderPayloads()` — constructs expiry reminder array
- `buildLinkPayloads()` — constructs entity link array
- `buildApproveRpcPayload()` — assembles complete JSONB payload for RPC

**`src/lib/dms/approve/approve-ai-intake.ts`**
- `ApproveAiIntakeSagaInput` type — captures all approve context for both modes
- `ApproveAiIntakeSagaResult` type — typed success/failure return
- `runApproveAiIntakeSaga()` — full saga orchestrator
- `runPostCommitOcr()` — best-effort post-commit OCR trigger (non-blocking)

### Step 3 — Refactor single-file approve (`ai-intake.ts`) ✅
`approveAiIntakeAndCreateDocument()` refactored to:
- Validate session and permissions
- Load session + document type
- Generate document number via numbering service
- Resolve standard filename
- Reserve document ID via `reserve_dms_document_id()` RPC
- Delegate all further work to `runApproveAiIntakeSaga()`

Removed from `ai-intake.ts`: `buildFinalStoragePath`, `getExtension`, `REMINDER_DAYS`, `resolveMetadataValueColumns`, `writeDocumentContentTextSystem`, `persistFileOcrResult`, `extractFileContent`, `getDmsAiProvider`.

### Step 4 — Align batch finalize (`batch-intake.ts`) ✅
`finalizeDraftIntake()` refactored to use `runApproveAiIntakeSaga` with `mode: "existing_batch_draft"`. Identical cleanup of removed helpers.

### Step 5 — Idempotency, retry, and duplicate prevention ✅
- DB-level: unique partial index on `dms_approve_runs(upload_session_id)` for successful runs
- DB-level: RPC idempotency check — detects already-approved session and returns existing document
- App-level: `createApproveRun` detects duplicate `run_key` and returns existing run rather than throwing

### Step 6 — Minimal UI pending-state / double-click protection ✅
`dms-ai-intake-page-client.tsx` already uses `useTransition` + `isProcessing` flag. Verified that the existing `isPending || isProcessing` gate on the Approve & Save button prevents double-submission. No UI changes required — existing protection was sufficient.

### Step 7 — Post-commit OCR/content sync best-effort ✅
`runPostCommitOcr()` in `approve-ai-intake.ts` runs after the RPC succeeds. It calls `persistFileOcrResult` and `writeDocumentContentTextSystem` with an admin client. Errors are caught and logged via `logger.warn` — they never surface to the user or fail the approval.

### Step 8 — Audit/event logging for approve stages ✅
- `dms_approve_runs` row created at saga start, updated at each stage transition
- `dms_document_events` row inserted inside the atomic RPC with event_type `document_approved`
- `logAudit()` called from TypeScript for key saga events (start, storage copy, RPC success, RPC failure, completion)
- `sanitizeApproveError()` ensures no JSON payloads or sensitive data reach audit logs

### Step 9 — Typecheck, lint, build verification ✅
```
npx tsc --noEmit → 0 errors
```

Two issues found and fixed during typecheck:
1. Regex `s` flag (dotAll) not available at the project's TypeScript/ES target — replaced `/\{.*?\}/gs` with `/\{[^}]*\}/g`
2. `cleanupStatus`/`cleanupStage` variables inferred as string literals from initial assignment — widened to explicit `string` type

### Step 10 — Source of truth update and implementation report ✅
- `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md` updated to Post Phase 4
- Section 6 (Approve & Save Workflow) replaced with Phase 4 transactional details
- Section 11 (Database Tables) updated to include `dms_approve_runs` and new session columns
- Section 13 (Known Gaps) updated — Phase 4 items resolved, remainder moved to Phase 5+
- Section 14 (Next Phases) updated
- Key File Index updated with all Phase 4 files

---

## Files Added

| File | Description |
|------|-------------|
| `src/lib/dms/approve/approve-ai-intake.ts` | Saga orchestrator |
| `src/lib/dms/approve/approve-ai-intake-events.ts` | Approve run tracking helpers |
| `src/lib/dms/approve/approve-ai-intake-storage.ts` | Storage copy + compensation |
| `src/lib/dms/approve/approve-ai-intake-payload.ts` | RPC JSONB payload builder |
| `supabase/migrations/20260622103000_erp_dms_ai_phase4_transactional_approve_save.sql` | DB migration |

## Files Modified

| File | Change |
|------|--------|
| `src/server/actions/dms/ai-intake.ts` | Refactored `approveAiIntakeAndCreateDocument` to use saga |
| `src/server/actions/dms/batch-intake.ts` | Refactored `finalizeDraftIntake` to use saga |
| `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md` | Updated to Post Phase 4 |

---

## Constraints Upheld

| Constraint | Verified |
|------------|----------|
| Human-review-first — no auto-approve | ✅ |
| No sensitive data in logs (OCR text, prompts, AI responses) | ✅ |
| No async job queue introduced | ✅ |
| No AI tab automation | ✅ |
| No semantic chunks | ✅ |
| No review queue UI | ✅ |
| No ERP mapping in Phase 4 scope | ✅ |
| No Azure OCR wiring | ✅ |
| Existing Phase 1–3 AI workflow untouched | ✅ |
| Single-file and batch modes share the same saga | ✅ |
| TypeScript clean (0 errors) | ✅ |

---

## Known Follow-ups (Not Phase 4 Scope)

- Orphaned storage cleanup job (runs that failed mid-copy and couldn't compensate) — needs a background janitor or admin UI
- `dms_approve_runs` admin view for debugging — useful for operations team
- RLS on `dms_approve_runs` may need a `system_admin` full-access policy for support tooling
