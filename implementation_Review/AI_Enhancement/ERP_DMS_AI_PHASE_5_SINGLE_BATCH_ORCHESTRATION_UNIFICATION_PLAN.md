# ERP DMS AI Phase 5 — Single and Batch Upload Orchestration Unification Plan

**Prepared:** 2026-06-22  
**Type:** Planning only — no source code, migration, or schema changes in this document  
**Prepared for:** ChatGPT review before implementation  
**Phase:** ERP DMS AI Phase 5 — Single and Batch Upload Orchestration Unification  
**Prior Phase:** Phase 4 — Transactional Approve & Save Command Chain (closed 2026-06-22)

---

## 1. Executive Summary

Phase 4 delivered a fully transactional, recoverable Approve & Save command chain. Phase 5 closes the next gap: **neither the single-file nor the batch-file approval path consistently triggers the post-approval AI orchestration pipeline today.**

The current state after audit:

- **Single-file approval:** Orchestration is **never triggered** — neither before nor after approval. The `DmsOrchestrationProgressCard` with `autoTrigger={true}` is shown on the intake page only when `session.document_id` is already set, but for new single-file sessions the document does not exist until after approval. After approval, the page navigates away immediately — no orchestration fires.
- **Batch draft approval:** Orchestration CAN run before approval (the draft document exists). A manual "Run AI Pipeline" button on the batch queue page calls `runDmsBatchOrchestration`. After the human approves each draft individually, no post-approval orchestration fires.
- **Both paths after Phase 4:** `runApproveAiIntakeSaga` ends with `runPostCommitOcr` (OCR + content sync) and then returns — no call to the full orchestration pipeline.

**Phase 5 goal:** Add a shared, idempotent `triggerDmsPostApproveOrchestration()` hook at the single convergence point (end of `runApproveAiIntakeSaga`), ensuring both single-file and batch paths consistently trigger the orchestration pipeline after every successful approval. Keep orchestration post-commit best-effort. Never block or roll back the approval result.

**Recommended approach:** Option C-lite — call existing `runDmsAiOrchestrationPostDraft` from the saga, best-effort, after approval succeeds. No async queue. No new background worker. Small additive migration for source traceability columns.

---

## 2. Planning Scope and Non-Implementation Rule

This document is **planning only**. No source code, migrations, schema, or UI changes are made here.

This plan will be uploaded to ChatGPT for review before an implementation prompt is issued.

**In scope for Phase 5 planning:**
- Unifying the post-approval orchestration trigger for single-file and batch paths
- Defining the shared hook function contract
- Deciding trigger placement (inside saga vs UI-driven vs queued)
- Preventing duplicate orchestration runs
- Defining UI changes needed (minimal)
- Deciding whether a migration is needed
- Defining retry behavior
- Defining the boundary between Phase 4 OCR sync, Phase 5 orchestration, and future phases

**Out of scope for Phase 5 planning:**
See Section 28.

---

## 3. Files and Source-of-Truth Reviewed

### Read and verified:

| File | Status |
|------|--------|
| `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md` | Read — Post Phase 4 |
| `implementation_Review/ERP_DMS_AI_PHASE_4_TRANSACTIONAL_APPROVE_SAVE_IMPLEMENTATION_REPORT.md` | Read |
| `implementation_Review/ERP_DMS_AI_PHASE_3_METADATA_AWARE_CLASSIFICATION_IMPLEMENTATION_REPORT.md` | Read |
| `src/server/actions/dms/orchestration.ts` | Read in full |
| `src/lib/dms/orchestration/pipeline-runner.ts` | Read in full |
| `src/lib/dms/orchestration/types.ts` | Read in full |
| `src/features/dms/orchestration/dms-orchestration-progress-card.tsx` | Read in full |
| `src/features/dms/intake/dms-ai-intake-page-client.tsx` | Read in full |
| `src/features/dms/upload/dms-batch-review-queue-client.tsx` | Read in full (relevant orchestration section) |
| `src/lib/dms/approve/approve-ai-intake.ts` | Read in full |
| `src/server/actions/dms/ai-intake.ts` | Read |
| `src/server/actions/dms/batch-intake.ts` | Read |
| `supabase/migrations/20260617090000_erp_dms_ai_orch_1_orchestration_columns.sql` | Read in full |
| Live DB schema via Supabase MCP | Verified orchestration columns |

### Missing files listed in planning prompt (not found):

| File | Status |
|------|--------|
| `ERP_DMS_AI_A_TO_Z_AUDIT_FUNCTION_MAP_AND_ENHANCEMENT_PLAN.md` | Not found — not blocking |
| `ERP_DMS_AI_FULL_AUDIT_AND_ENHANCEMENT_PLAN.md` | Not found — not blocking |
| `ALGT_ERP_CURSOR_PHASE_PROMPT_MASTER_STANDARD_V2.md` | Not found — not blocking |
| `erp-dms-ai-first-upload-standard.mdc` | Not found |
| `erp-ai-human-review-first-standard.mdc` | Not found |
| `erp-dms-standard.mdc` | Not found |
| `erp-rls-standard.mdc` | Not found |
| `erp-audit-log-standard.mdc` | Not found |

Missing files do not prevent planning. All required code and schema was verified directly from source.

---

## 4. Phase 1–4 Output Reviewed

| Phase | Key Output |
|-------|-----------|
| Phase 1 | OCR + AI classification stabilization; `startAiIntakeFromUploadSession` + `approveAiIntakeAndCreateDocument` (legacy sequential) |
| Phase 2 | `dms_metadata_definitions` upgrade; Phase 2 context filter for intake |
| Phase 3 | Two-pass AI: metadata-aware classification + extraction; `rerunMetadataExtractionForIntakeSession` |
| Phase 4 | Hybrid Option C: `runApproveAiIntakeSaga` → atomic `approve_dms_ai_intake` RPC; `dms_approve_runs` tracking; post-commit OCR sync |

Phase 5 builds on Phase 4's single convergence point (`runApproveAiIntakeSaga`) without touching the atomic RPC or the transactional approval chain.

---

## 5. Current Orchestration Architecture

### Pipeline

```
DMS_AI_ORCHESTRATION feature flag (default: disabled)
         │
         ▼
runDmsAiOrchestrationPostDraft({ sessionCode })
         │
         ├─ load upload_session (must have document_id)
         ├─ check feature flag → if disabled: set skipped_feature_disabled, return
         ├─ set orchestration_status = 'running', store initial steps
         │
         ├─ content_sync        → runContentSyncStep()
         ├─ ai_summary          → generateAndSaveDmsAiSummary()
         ├─ intelligence        → evaluateDmsDocumentIntelligence()
         ├─ embedding           → generateDmsDocumentEmbedding()
         ├─ tag_suggestions     → suggestDmsDocumentTags()
         ├─ link_suggestions    → suggestDmsDocumentLinks()
         ├─ ready_for_review    → marked completed
         │
         └─ set orchestration_status = complete | complete_with_warnings | failed
```

### Supporting actions in `orchestration.ts`:
- `runDmsAiOrchestrationPostDraft({ sessionCode })` — main runner (single session)
- `getDmsOrchestrationStatus({ sessionCode })` — read-only status query
- `retryDmsOrchestrationStep({ sessionCode, stepCode })` — re-run a single failed step
- `runDmsBatchOrchestration({ batchCode })` — loop over all draft sessions in a batch and call `runDmsAiOrchestrationPostDraft` for each

### Library (`src/lib/dms/orchestration/`):
- `pipeline-runner.ts` — `buildInitialSteps`, `runPipelineStepSafe`, `mergeStepResult`, `calculateOverallStatus`, `buildRunResult`, `sanitizePipelineError`, `extractErrorCode`
- `types.ts` — `DMS_AI_ORCH_STEPS`, `DmsAiOrchestrationStepCode`, `DmsAiOrchestrationStatus`, `DmsAiOrchestrationStepResult`, `DmsAiOrchestrationRunResult`, `DmsAiOrchestrationStatusRow`

---

## 6. Current Single-File Orchestration Flow Audit

### Before approval (intake review page)

```
dms-ai-intake-page-client.tsx line 404:
  {isReady && session.document_id && (
    <DmsOrchestrationProgressCard sessionCode={...} documentId={session.document_id} autoTrigger />
  )}
```

**Critical finding:** For new single-file intake sessions (`session.document_id === null`), the condition `isReady && session.document_id` is **false**. The `DmsOrchestrationProgressCard` never renders for these sessions. Auto-trigger never fires.

The `DmsOrchestrationProgressCard` with `autoTrigger={true}` is only reached for **batch draft sessions** where a draft document was pre-created during batch ingestion.

### After approval (single-file)

```
handleApprove() → approveAiIntakeAndCreateDocument() → runApproveAiIntakeSaga()
  → RPC succeeds → runPostCommitOcr() → return { documentId, documentNo }
  → toast.success() → router.replace(docRoute) ← navigates away immediately
```

**No orchestration is triggered.** The page navigates away before any orchestration call could even be made.

### Summary for single-file path:
- Orchestration: **never runs** (neither before nor after approval)
- Post-commit only: OCR text + `dms_document_content` write via `runPostCommitOcr`

---

## 7. Current Batch Orchestration Flow Audit

### Before approval (batch review queue page)

The `DmsBatchReviewQueueClient` has a manual "Run AI Pipeline" button:
```
handleRunBatchOrchestration() → runDmsBatchOrchestration({ batchCode })
  → for each session in batch with document_id → runDmsAiOrchestrationPostDraft({ sessionCode })
```

This runs orchestration on **all draft sessions** in the batch (those with `document_id` and not already `complete`). Called manually by user from the batch queue page.

Additionally, the intake review page for individual batch draft sessions shows the `DmsOrchestrationProgressCard` with `autoTrigger={true}` since `session.document_id` exists for batch drafts.

### After approval (batch draft)

```
handleApprove() → finalizeDraftIntake() → runApproveAiIntakeSaga({ mode: 'existing_batch_draft' })
  → RPC succeeds → runPostCommitOcr() → return { documentId, documentNo }
  → toast.success() → router.replace(docRoute) ← navigates away immediately
```

Same as single-file: **no orchestration fires post-approval**.

### Summary for batch path:
- Orchestration before approval: can run manually from batch queue page, or auto-triggers on the per-session intake review page for batch drafts
- Post-approval: no orchestration fires
- Result: orchestration run status from pre-approval is now stale after approval promotes the document to `active`

---

## 8. Current Phase 4 Approve Saga Hook Audit

### Convergence point

Both approval paths converge at `runApproveAiIntakeSaga()` in `src/lib/dms/approve/approve-ai-intake.ts`.

After the atomic RPC succeeds:

```typescript
// Step 5 — post-commit OCR/content sync (best-effort)
await updateApproveRunStage(..., APPROVE_STATUS.DB_COMMITTED, APPROVE_STAGE.POST_COMMIT_STARTED);
await runPostCommitOcr(supabase, adminClient, { documentId, aiResultId, fileId, ... });

// Step 6 — mark completed
await updateApproveRunStage(..., APPROVE_STATUS.COMPLETED, APPROVE_STAGE.COMPLETED, { documentId, ... });

return { success: true, data: { documentId, documentNo } };
```

### Available data at convergence point

At the end of the saga, the following are available:

| Data | Available? |
|------|-----------|
| `documentId` | ✅ |
| `documentNo` | ✅ |
| `uploadSessionId` | ✅ |
| `sessionCode` | ✅ |
| `approveRunId` | ✅ |
| `mode` (single/batch) | ✅ |
| `aiResultId` | ✅ |
| Supabase client | ✅ |

**Conclusion:** The saga has everything needed to trigger orchestration at this point. `sessionCode` is the primary key for the orchestration action.

### OCR / content_sync overlap

`runPostCommitOcr` in the saga:
1. Reads `raw_ocr_text` from `dms_ai_extraction_results`
2. Falls back to vision OCR if no text available
3. Calls `persistFileOcrResult` → writes `dms_document_files.ocr_text`
4. Calls `writeDocumentContentTextSystem` → writes `dms_document_content.content_text`

The `content_sync` step in orchestration:
1. Checks `dms_document_content` for existing content (line 124: `if (existingContent) return { success: true, skipped: true }`)
2. Falls back to OCR text from AI result
3. Calls `writeDocumentContentTextSystem` if text found

**Idempotency is already present.** If `runPostCommitOcr` runs first and succeeds, `content_sync` in orchestration will find existing `dms_document_content` and return `{ success: true, skipped: true }`. No double-write.

If `runPostCommitOcr` fails (or produces no content), `content_sync` will attempt independently. Safe.

---

## 9. Current Orchestration Pipeline Step Audit

### Step inventory (from `types.ts` → `DMS_AI_ORCH_STEPS`)

All steps in `orchestration_steps_json` are stored as `DmsAiOrchestrationStepResult`:
```
{ step, status, startedAt, completedAt, durationMs, errorCode, safeErrorMessage }
```

| Step Code | Function Called | DB Updated | Feature Flag | Idempotent? | Retryable? | Safe Both Modes? |
|-----------|----------------|------------|--------------|-------------|-----------|-----------------|
| `upload_received` | None (informational — never run in pipeline) | None | None | N/A | No | N/A |
| `ocr_and_extraction` | None (Phase A — never run in this pipeline) | None | None | N/A | No | N/A |
| `draft_ready` | None (informational — never run in pipeline) | None | None | N/A | No | N/A |
| `content_sync` | `writeDocumentContentTextSystem` | `dms_document_content` | `DMS_AI_ORCHESTRATION` | ✅ checks existing | ✅ yes | ✅ yes |
| `ai_summary` | `generateAndSaveDmsAiSummary` | `dms_document_summaries` or similar | `DMS_AI_ORCHESTRATION` | Partial (depends on action) | ✅ yes | ✅ yes |
| `intelligence` | `evaluateDmsDocumentIntelligence` | `dms_document_completeness`, `dms_document_risk` or similar | `DMS_AI_ORCHESTRATION` | Partial | ✅ yes | ✅ yes |
| `embedding` | `generateDmsDocumentEmbedding` | `dms_document_embeddings` or similar | `DMS_AI_ORCHESTRATION` | Partial | ✅ yes | ✅ yes |
| `tag_suggestions` | `suggestDmsDocumentTags` | `dms_document_tag_suggestions` or similar | `DMS_AI_ORCHESTRATION` | Partial | ✅ yes | ✅ yes |
| `link_suggestions` | `suggestDmsDocumentLinks` | `dms_document_link_suggestions` or similar | `DMS_AI_ORCHESTRATION` | Partial | ✅ yes | ✅ yes |
| `ready_for_review` | None (status marker — always set at end) | None | None | ✅ | No | ✅ yes |

**Note:** The first three steps (`upload_received`, `ocr_and_extraction`, `draft_ready`) are defined in `DMS_AI_ORCH_STEPS` but are NOT executed by `runDmsAiOrchestrationPostDraft`. They are initialised as `pending` in `buildInitialSteps()` but never reach `running` or `completed` from this pipeline runner. Their purpose is informational display only (the full pipeline lifecycle). This is a **minor gap** — they will always show as `pending` in the progress card after the pipeline runs, which could be confusing.

**Failure behavior:** Each step is wrapped in `runPipelineStepSafe` which catches all errors and returns a `failed` result without stopping the pipeline. Failed steps set `errorCode` and `safeErrorMessage`. Pipeline continues to next step.

**Retry behavior:** `retryDmsOrchestrationStep` can re-run any step in `RETRYABLE = ['content_sync', 'ai_summary', 'intelligence', 'embedding', 'tag_suggestions', 'link_suggestions']`. It re-runs the step function, merges the new result into the existing `orchestration_steps_json`, and recalculates overall status.

**Session document_id requirement:** `runDmsAiOrchestrationPostDraft` requires `session.document_id` to be non-null. After Phase 4 approval, the session's `document_id` is always set (it's written by the atomic RPC). So calling orchestration after approval is safe.

---

## 10. Current Status Model Audit

### Exact columns on `dms_upload_sessions` (verified from live DB):

| Column | Type | Default | Nullable |
|--------|------|---------|----------|
| `orchestration_status` | `TEXT` | `'pending'` | `NOT NULL` with CHECK |
| `orchestration_steps_json` | `JSONB` | `NULL` | YES |
| `orchestration_started_at` | `TIMESTAMPTZ` | `NULL` | YES |
| `orchestration_completed_at` | `TIMESTAMPTZ` | `NULL` | YES |

**CHECK constraint:** `orchestration_status IN ('pending', 'running', 'complete', 'complete_with_warnings', 'failed', 'skipped_feature_disabled')`

**Missing columns (vs. Phase 5 needs):**
- No `orchestration_error` column (errors are in `orchestration_steps_json` per step)
- No `orchestration_source` (single vs batch vs manual)
- No `orchestration_triggered_by_approve_run_id`
- No `orchestration_retry_count`

### Status transitions (current):

```
pending (default)
  → running (when runDmsAiOrchestrationPostDraft starts)
  → complete | complete_with_warnings | failed (at end)
  → skipped_feature_disabled (if flag off)

complete → (terminal, but retryDmsOrchestrationStep can update individual steps and recalculate)
complete_with_warnings → retryable (via retryDmsOrchestrationStep for individual steps)
failed → retryable
skipped_feature_disabled → can be rerun manually
```

**No full-pipeline rerun action exists.** Only individual step retry (`retryDmsOrchestrationStep`) or calling `runDmsAiOrchestrationPostDraft` again (which is idempotent only for `complete` — not for `complete_with_warnings` or `failed`).

**Idempotency gap:** `runDmsAiOrchestrationPostDraft` only guards against `complete` status. If status is `complete_with_warnings` or `failed`, it will re-run the full pipeline. This is the intended behavior (failed pipelines should be re-runnable) but means calling the function twice on a partially failed pipeline will re-run all steps, potentially duplicating summary/intelligence/embedding writes. This should be documented and addressed in Phase 5 if needed.

### Where UI reads status:

- `DmsOrchestrationProgressCard` — uses `getDmsOrchestrationStatus({ sessionCode })` polled every 3 seconds while `isRunning`
- `dms-batch-review-queue-client.tsx` — reads `orchestrationStatus` from result of `runDmsBatchOrchestration`
- Document record page — does NOT currently display orchestration status

---

## 11. Current Feature Flag Audit

### Flag: `DMS_AI_ORCHESTRATION`

**Table:** `erp_ai_feature_flags`  
**Default:** `false` (disabled — as set in migration `20260617090000`)

**Where checked:**
- Inside `runDmsAiOrchestrationPostDraft` (line 270: `const flagEnabled = await isDmsAiOrchestrationEnabled()`)
- NOT checked in `getDmsOrchestrationStatus` (safe — read-only)
- NOT checked in `retryDmsOrchestrationStep` (potentially an issue — see Section 12)

**Behavior when disabled:**
- `runDmsAiOrchestrationPostDraft` sets `orchestration_status = 'skipped_feature_disabled'` and returns `{ success: true, data: { ...steps all skipped } }`
- UI shows "Full AI pipeline orchestration is not enabled."
- `DmsOrchestrationProgressCard` renders a small disabled notice

**Manual bypass when flag disabled:**
- `retryDmsOrchestrationStep` does NOT re-check the feature flag. A user with permission could retry a failed step even if the flag is disabled. Minor inconsistency — low risk but worth documenting.

**Flag and batch:**
- `runDmsBatchOrchestration` calls `runDmsAiOrchestrationPostDraft` per session, which checks the flag internally. No extra flag check in batch runner. Consistent.

**Phase 5 recommendation:** Add a flag check to `retryDmsOrchestrationStep` for consistency, or document the intentional behavior (allowing manual retry even when auto-trigger is disabled).

---

## 12. Problems and Gaps Confirmed

| # | Problem | Severity | Affected Path |
|---|---------|----------|--------------|
| G1 | **Orchestration never fires after single-file approval** — the only post-Phase4 action is OCR sync. Full pipeline (summary, intelligence, embedding, tags, links) never runs. | High | Single-file |
| G2 | **Orchestration never fires after batch-file approval** — pipeline may have run on the draft pre-approval but not post-approval. | High | Batch |
| G3 | **`DmsOrchestrationProgressCard` with `autoTrigger={true}` never triggers for new single-file sessions** — condition `session.document_id` is `null` before approval. | High | Single-file UI |
| G4 | **After approval, page navigates away immediately** — even if we add a trigger inside `handleApprove`, there is no UI to show progress after navigation. | Medium | Both (UI) |
| G5 | **`retryDmsOrchestrationStep` does not check feature flag** — minor inconsistency. | Low | Both |
| G6 | **Informational pipeline steps (`upload_received`, `ocr_and_extraction`, `draft_ready`) always show as `pending`** after orchestration runs — potentially confusing in UI. | Low | Both |
| G7 | **No `orchestration_source` column** — can't tell if orchestration was triggered by approval, manual batch button, or pre-approval auto-trigger. | Low | Both |
| G8 | **No full-pipeline rerun action** — `retryDmsOrchestrationStep` only retries one step at a time. A user wanting to reset and re-run all steps has no action. | Low | Both |
| G9 | **Idempotency gap:** `runDmsAiOrchestrationPostDraft` only guards `complete` — will re-run all steps for `complete_with_warnings` or `failed`. May cause double summary/intelligence writes. | Medium | Both |

---

## 13. Trigger Strategy Options Compared

### Option A — Trigger inside approve saga immediately after RPC success

```
runApproveAiIntakeSaga()
  → RPC succeeds
  → runPostCommitOcr()
  → triggerDmsPostApproveOrchestration({ sessionCode, ... })  ← new call
  → return { documentId, documentNo }
```

| Aspect | Assessment |
|--------|-----------|
| Centralized | ✅ Single call point for both modes |
| Single and batch share same hook | ✅ Yes |
| Approval is not blocked | ✅ if orchestration is awaited but errors are caught |
| Orchestration runs inline (synchronous in same request) | ⚠️ Server action request will be slower (pipeline adds 5–30s) |
| User waiting for response | ⚠️ If pipeline runs synchronously, `handleApprove` hangs while AI runs |
| Can be non-blocking (fire-and-forget) | ⚠️ Next.js Server Actions don't support true fire-and-forget; the `await` completes before response |
| Future async queue ready | ✅ Can refactor to queue record instead of inline run |

**Verdict:** Central placement is correct but synchronous inline execution of the full pipeline within the same server action request would make the approve button unacceptably slow (5–30+ seconds). Must be structured as best-effort with a cap or timeout strategy.

**Mitigation for Phase 5:** The saga calls `runDmsAiOrchestrationPostDraft` as a non-blocking promise (not awaited) — relying on the Next.js server-side execution to continue after the action response is sent. However, in Next.js App Router Server Actions, code after the return value is not executed. The correct approach is to `await` the orchestration call but immediately return from the saga before it completes, OR to accept a brief delay.

**Preferred Phase 5 pattern:** Call orchestration inside the saga but with a short timeout guard (e.g., 2–5 seconds max per step), or accept that the full pipeline runs synchronously and the approve response takes longer. The pipeline steps themselves are best-effort with internal try/catch, so they won't block indefinitely. Total orchestration time: 5–30 seconds depending on AI provider and document size.

**Alternative:** Mark `orchestration_status = 'triggered_pending'` in the saga, return immediately, and rely on the UI calling `runDmsAiOrchestrationPostDraft` post-navigation. But this requires UI cooperation and is less reliable (user may close browser).

**Recommended for Phase 5:** Option A, accepting that the approve action will take longer (~10–30s when flag enabled). This is the most reliable approach and is consistent with how post-commit OCR already runs synchronously in the saga today.

### Option B — Return approval success, then UI triggers orchestration

```
handleApprove() → approveAiIntakeAndCreateDocument()
  → success → toast
  → router.replace(docRoute)
  → [client calls runDmsAiOrchestrationPostDraft after navigation — NOT implemented]
```

| Aspect | Assessment |
|--------|-----------|
| Approve response fast | ✅ |
| UI shows progress | ❌ User has navigated away |
| Reliable trigger | ❌ User can close browser |
| Duplicated logic per path | ❌ Must add to single and batch separately |
| Works post-navigation | ❌ No — page navigates immediately |

**Verdict:** Not viable without major UI redesign. The page navigates away on success.

### Option C — Record orchestration pending, execute inline (Option C-lite)

```
Approval succeeds in RPC
→ saga marks orchestration_status = 'triggered_from_approval' (or keeps 'pending')
→ saga calls runDmsAiOrchestrationPostDraft (awaited, best-effort)
→ if flag disabled: sets skipped_feature_disabled (handled by existing logic)
→ return { documentId, documentNo }
```

This is effectively the same as Option A but explicitly models the "C-lite" intent: the orchestration trigger is in the saga, the run is inline for now, and a future async queue can replace the inline call without changing the saga interface.

**Recommended approach: Option A / C-lite hybrid** — trigger from saga, run inline best-effort, structurally ready for future async queue.

---

## 14. Recommended Trigger Strategy

**Recommended: Option C-lite (Option A with future-proof abstraction)**

```
runApproveAiIntakeSaga()
  ├─ ... (existing approve + OCR sync) ...
  ├─ Step 7 — updateApproveRunStage → COMPLETED
  ├─ Step 8 [NEW] — triggerDmsPostApproveOrchestration({ sessionCode, documentId, uploadSessionId, approveRunId, source })
  │   └─ best-effort: calls runDmsAiOrchestrationPostDraft internally
  │   └─ errors caught — never propagates to approval result
  └─ return { success: true, data: { documentId, documentNo } }
```

### Key behaviors:
1. Orchestration failure CANNOT fail the approval. The trigger is wrapped in try/catch.
2. If `DMS_AI_ORCHESTRATION` flag is disabled, `runDmsAiOrchestrationPostDraft` returns `skipped_feature_disabled` — no AI cost, fast.
3. `sessionCode` is available in the saga — it's the orchestration action's primary identifier.
4. Both `single_file_new_document` and `existing_batch_draft` modes use the same trigger.
5. The existing `runDmsAiOrchestrationPostDraft` idempotency check (`orchestration_status === 'complete'`) prevents duplicate runs if the approval is retried.

### Accept: slower approve when flag enabled

When `DMS_AI_ORCHESTRATION` is enabled, the Approve & Save action will take longer (total of OCR sync + 6 pipeline steps = ~10–60 seconds depending on AI provider and file). This is a deliberate trade-off: reliable post-approval AI processing in exchange for a longer approve action. The UI already shows a `RefreshCw` spinner on the Approve & Save button during `isPending`, so the user receives feedback.

### Future async queue readiness

`triggerDmsPostApproveOrchestration` is a thin abstraction layer. In Phase 6+, it can be replaced with:
- Write a `dms_orchestration_queue` row with status `pending`
- A background worker processes the queue
- No changes to the approve saga needed

---

## 15. Single vs Batch Unification Plan

### Shared hook contract

**New file:** `src/lib/dms/orchestration/post-approve-orchestration.ts`

```typescript
export type PostApproveOrchestrationInput = {
  sessionCode: string;
  documentId: number;
  uploadSessionId: number;
  approveRunId: number;
  source: "single_file_approve" | "batch_finalize";
};

export type PostApproveOrchestrationResult = {
  triggered: boolean;
  orchestrationStatus: string;
  skippedReason?: string;
  error?: string;
};

export async function triggerDmsPostApproveOrchestration(
  input: PostApproveOrchestrationInput
): Promise<PostApproveOrchestrationResult>;
```

**Internal implementation:**
1. Log the trigger source to audit (audit event: `dms_post_approve_orchestration_triggered`)
2. Update `orchestration_source` on session (if migration adds column)
3. Call `runDmsAiOrchestrationPostDraft({ sessionCode })` from `orchestration.ts`
4. Return result without throwing
5. Log completion/failure to audit

**Call site:** End of `runApproveAiIntakeSaga()`, after `approveRunId` is marked `COMPLETED`, wrapped in try/catch.

### Data flow

```
Single-file:
  approveAiIntakeAndCreateDocument()
    → runApproveAiIntakeSaga({ mode: 'single_file_new_document', sessionCode, ... })
      → RPC success
      → runPostCommitOcr()
      → mark approve run COMPLETED
      → triggerDmsPostApproveOrchestration({ source: 'single_file_approve', sessionCode, ... })
      → return { documentId, documentNo }

Batch:
  finalizeDraftIntake()
    → runApproveAiIntakeSaga({ mode: 'existing_batch_draft', sessionCode, ... })
      → RPC success
      → runPostCommitOcr()
      → mark approve run COMPLETED
      → triggerDmsPostApproveOrchestration({ source: 'batch_finalize', sessionCode, ... })
      → return { documentId, documentNo }
```

Both paths identical after the RPC. The `source` field enables observability without changing behavior.

---

## 16. Proposed Server Action and Service Changes

### New file: `src/lib/dms/orchestration/post-approve-orchestration.ts`

Purpose: Thin wrapper that isolates the post-approval orchestration trigger.

Contents:
- `PostApproveOrchestrationInput` type
- `PostApproveOrchestrationResult` type  
- `triggerDmsPostApproveOrchestration()` function:
  - Validates input
  - Optionally updates `orchestration_source` on session (if migration applied)
  - Calls `runDmsAiOrchestrationPostDraft({ sessionCode })`
  - Catches all errors
  - Returns structured result (never throws)

### Modified file: `src/lib/dms/approve/approve-ai-intake.ts`

Change:
- Import `triggerDmsPostApproveOrchestration` from the new post-approve module
- Add call after `updateApproveRunStage(... COMPLETED ...)`, before the final `return`
- Wrap in try/catch — errors are logged but never propagate to approval result

No changes to `approve-ai-intake-events.ts`, `approve-ai-intake-storage.ts`, or `approve-ai-intake-payload.ts`.

### Modified file: `src/server/actions/dms/orchestration.ts`

Minor changes only:
- Add feature flag check to `retryDmsOrchestrationStep` (gap G5)
- No changes to pipeline step functions
- No changes to `runDmsAiOrchestrationPostDraft` except possibly adding `orchestration_source` update if migration applied

### No changes needed:
- `src/server/actions/dms/ai-intake.ts` — already delegates to saga
- `src/server/actions/dms/batch-intake.ts` — already delegates to saga
- `src/lib/dms/orchestration/pipeline-runner.ts` — no changes
- `src/lib/dms/orchestration/types.ts` — no changes (unless migration adds new status values)

---

## 17. Proposed UI / UX Changes

### Intake review page (`dms-ai-intake-page-client.tsx`)

**Current behavior after approval:** `router.replace(docRoute)` — navigates away immediately.

**Phase 5 change:** None required. Orchestration runs server-side inside the saga. The user sees the spinner while Approve & Save processes (which now includes orchestration time when flag enabled). After navigation, the document record page will have AI pipeline results as they become available.

**Optional enhancement (not required for Phase 5):**
- Before navigating, briefly show a "AI pipeline running..." message
- Or display the orchestration progress card after success, with a "Go to Document" button instead of automatic navigation

Recommendation: Defer optional UI enhancement to Phase 6. Phase 5 should keep UI changes minimal.

### Batch queue page (`dms-batch-review-queue-client.tsx`)

No changes required. The existing "Run AI Pipeline" button still works for manual re-runs. Post-approval orchestration now fires automatically per-session as each draft is approved.

Minor cleanup opportunity: The "Run AI Pipeline" button could be hidden or labeled "Re-run AI Pipeline" if all sessions show `orchestration_status = complete`. Defer to Phase 6.

### `DmsOrchestrationProgressCard`

No changes to the component required. The component correctly handles all existing status values and already has polling when `isRunning`.

**Informational step issue (G6):** `upload_received`, `ocr_and_extraction`, `draft_ready` always show as `pending` even after the pipeline completes the best-effort steps. These informational steps will never be marked `completed` by the current runner. 

Proposed Phase 5 fix: In `buildInitialSteps()`, exclude informational steps when building the initial array passed to orchestration. OR mark them `skipped` at pipeline start. The `DMS_AI_ORCH_STEPS` array in `types.ts` defines 10 steps but only 7 are actionable. Document types:
- Actionable steps: `content_sync`, `ai_summary`, `intelligence`, `embedding`, `tag_suggestions`, `link_suggestions`, `ready_for_review`
- Informational/Phase A steps: `upload_received`, `ocr_and_extraction`, `draft_ready`

**Recommendation for Phase 5:** Update `buildInitialSteps()` to mark the 3 Phase A steps as `skipped` immediately when the post-approval pipeline runs (since Phase A already completed during OCR + AI extraction).

### Document record page

No changes required for Phase 5. AI pipeline results (summary, intelligence, embedding, tag/link suggestions) will appear in their respective tabs after orchestration completes.

**Optional Phase 6 enhancement:** Add a small `orchestration_status` badge to the document header if pipeline is still running.

---

## 18. Idempotency and Retry Plan

### Preventing duplicate orchestration runs

**Existing guard:** `runDmsAiOrchestrationPostDraft` checks `orchestration_status === 'complete'` and returns early. This prevents re-running a fully completed pipeline.

**Gap:** Status `complete_with_warnings` or `failed` does NOT prevent re-run. If the approve saga calls orchestration, and the user later manually clicks "Re-run", the full pipeline re-runs. This is generally the desired behavior (failed pipelines should be retryable), but it may cause duplicate writes for `ai_summary`, `intelligence`, etc.

**Phase 5 recommendation:**
- Accept the current behavior — pipeline steps that are idempotent (e.g., `content_sync`) skip naturally. Other steps (summary, intelligence) should implement their own upsert logic. Verify each step action uses upsert or overwrite semantics.
- For the post-approval trigger specifically: guard with a check for `orchestration_status IN ('running', 'complete')` to prevent double-fire if the same session's approve is retried.

**Deduplication guard in `triggerDmsPostApproveOrchestration`:**
```
if orchestration_status IN ('running', 'complete'):
  return { triggered: false, orchestrationStatus: current_status }
```

### Retry behavior

`retryDmsOrchestrationStep` retries individual steps. Unchanged in Phase 5. Feature flag check should be added (gap G5).

**Full pipeline rerun (gap G8):** Not implemented. Phase 5 can add a simple re-trigger wrapper that resets steps to `pending` and calls `runDmsAiOrchestrationPostDraft` again, ignoring the `complete_with_warnings`/`failed` status. Scope: defer to Phase 6 unless trivially implementable.

### Terminal statuses

| Status | Terminal? | Can Trigger Again? |
|--------|----------|--------------------|
| `complete` | Yes | No (guarded) |
| `complete_with_warnings` | Soft | Yes (retry individual steps) |
| `failed` | Soft | Yes (retry individual steps) |
| `skipped_feature_disabled` | Yes | Yes (flag can be re-enabled, manual re-trigger) |
| `pending` | No | Yes |
| `running` | No | No (guarded) |

---

## 19. Post-Approval Boundary Plan

Phase 5 defines the boundary between all post-approval operations:

```
APPROVAL TRANSACTION (Phase 4 — atomic, never touched)
│
├── approve_dms_ai_intake() RPC — atomic Postgres transaction
│   └── dms_documents, dms_document_versions, dms_document_files,
│       dms_document_metadata_values, dms_document_tags, dms_document_links,
│       dms_expiry_reminders, dms_ai_extraction_results, dms_upload_sessions,
│       dms_document_events, dms_approve_runs ← ALL IN ONE TRANSACTION
│
├── runPostCommitOcr() — best-effort, post-RPC, Phase 4
│   └── dms_document_files.ocr_text, dms_document_content.content_text
│   └── DOES NOT affect approval success
│
├── triggerDmsPostApproveOrchestration() — best-effort, post-OCR, Phase 5 NEW
│   └── Calls runDmsAiOrchestrationPostDraft()
│   └── Pipeline: content_sync → ai_summary → intelligence → embedding →
│       tag_suggestions → link_suggestions → ready_for_review
│   └── DOES NOT affect approval success
│   └── DOES NOT affect OCR sync
│
└── Future Phase 6+: async job queue / background worker
    └── Would replace triggerDmsPostApproveOrchestration inline call
    └── No changes to approval chain or OCR sync
```

**Critical rules preserved:**
1. Approval success NEVER depends on orchestration success
2. Orchestration failure NEVER rolls back document approval
3. OCR sync failure NEVER rolls back document approval
4. Human-review-first: no auto-approval; orchestration only runs AFTER human approves
5. No AI results are auto-applied to metadata by orchestration
6. Orchestration writes only to non-metadata tables (summaries, intelligence, embeddings, suggestions — not `dms_document_metadata_values`)

---

## 20. Database / Migration Plan

### Option A — No migration (use existing columns)

Use existing `orchestration_status`, `orchestration_steps_json`, `orchestration_started_at`, `orchestration_completed_at`.

**Pros:** No schema change required, simpler Phase 5.  
**Cons:** Cannot distinguish whether orchestration was triggered by approval vs manual vs batch. No linkage to `approve_run_id`.

### Option B — Small additive migration (recommended)

Add two nullable columns to `dms_upload_sessions`:

```sql
ALTER TABLE public.dms_upload_sessions
  ADD COLUMN IF NOT EXISTS orchestration_source TEXT NULL,
  ADD COLUMN IF NOT EXISTS orchestration_triggered_by_approve_run_id BIGINT NULL
    REFERENCES public.dms_approve_runs(id) ON DELETE SET NULL;
```

**No CHECK constraint on `orchestration_source`** — flexible text values: `'single_file_approve'`, `'batch_finalize'`, `'manual_batch_button'`, `'manual_retry'`, `'auto_trigger_ui'`.

**No changes to `orchestration_status` CHECK constraint** — existing values are sufficient.

**Index:**
```sql
CREATE INDEX IF NOT EXISTS idx_dms_upload_sessions_orch_source
  ON public.dms_upload_sessions(orchestration_source)
  WHERE orchestration_source IS NOT NULL AND deleted_at IS NULL;
```

**Recommendation:** Option B. The two columns are small and provide essential observability for debugging approval-triggered orchestration in production. They are nullable and additive — zero risk of breaking existing queries.

**Migration file name:** `20260622110000_erp_dms_ai_phase5_orchestration_source_columns.sql`

**No new RLS policies needed** — the existing `dms_upload_sessions` RLS covers all column reads/writes.

---

## 21. RLS / Security Impact Plan

### No new tables

Phase 5 adds no new tables. Existing `dms_upload_sessions` RLS policies apply to the two new columns automatically.

### No new permissions required

`triggerDmsPostApproveOrchestration` is called inside `runApproveAiIntakeSaga`, which already requires:
- `dms.documents.upload` OR `dms.documents.review_ai` OR `dms.admin` OR `system_admin`

`runDmsAiOrchestrationPostDraft` requires the same permissions (checked at orchestration boundary).

Since the saga already validates permissions before calling the trigger, no additional RBAC checks are needed inside the trigger wrapper.

### Session ownership

`runDmsAiOrchestrationPostDraft` already validates:
- `isOwner = session.uploaded_by === ctx.profile.id`
- `isAdmin = hasPermission(ctx, 'dms.admin') || ctx.roleCodes.includes('system_admin')`

When called from the saga (server-side, as the approving user), the session owner check will pass since the approving user is the session owner (or an admin).

### No weakening of existing security

- Orchestration never auto-applies metadata
- Orchestration never auto-approves documents
- `orchestration_steps_json` never contains OCR text, prompts, or AI responses (enforced in `pipeline-runner.ts`)
- Audit events are logged via `logAudit` in the trigger wrapper

---

## 22. Audit Logging Plan

### New audit events for Phase 5

| Event | When | Data logged |
|-------|------|------------|
| `dms_post_approve_orchestration_triggered` | Start of `triggerDmsPostApproveOrchestration` | `sessionCode`, `documentId`, `source`, `approveRunId` |
| `dms_post_approve_orchestration_skipped` | When status guard prevents duplicate | `sessionCode`, `existingStatus` |
| `dms_post_approve_orchestration_completed` | After `runDmsAiOrchestrationPostDraft` returns | `sessionCode`, `orchestrationStatus`, `completedSteps`, `failedSteps`, `durationMs` |
| `dms_post_approve_orchestration_error` | If trigger itself throws unexpectedly | `sessionCode`, `safeErrorMessage` |

### Existing audit events (unchanged)
- `dms_ai_orchestration_completed` — logged inside `runDmsAiOrchestrationPostDraft` (already exists)
- `dms_ai_orchestration_completed_with_warnings` — same

**No sensitive data in audit logs:** OCR text, AI prompts, responses, and extracted values are never logged (enforced by existing sanitization).

---

## 23. Backward Compatibility Plan

### Existing orchestration flows unchanged

- `DmsOrchestrationProgressCard` with `autoTrigger={true}` for batch drafts: unchanged — continues to work
- Manual "Run AI Pipeline" batch button: unchanged — `runDmsBatchOrchestration` unchanged
- `retryDmsOrchestrationStep`: unchanged (minor flag check addition)
- `getDmsOrchestrationStatus`: unchanged

### API/action signature compatibility

`runDmsAiOrchestrationPostDraft` signature unchanged (`{ sessionCode: string }`). Phase 5 does not change this public interface.

### Session status idempotency

The post-approve trigger checks `orchestration_status` before running. If a batch session ran orchestration pre-approval (existing behavior), its status may already be `complete` or `complete_with_warnings`. The trigger will:
- Status `complete`: skip, return early — no change ✅
- Status `running`: guard prevents duplicate — no change ✅
- Status `complete_with_warnings` or `failed`: will re-run full pipeline — this is a new behavior for batch sessions that ran orchestration pre-approval. **This must be documented and decided.** Recommendation: treat `complete_with_warnings` same as `complete` — skip post-approval trigger to avoid duplicating AI calls on already-processed sessions. Only re-run if user explicitly requests.

**Revised deduplication guard for trigger:**
```
if orchestration_status IN ('running', 'complete', 'complete_with_warnings'):
  return { triggered: false, ... }
```

This means batch sessions that ran orchestration pre-approval will NOT re-run post-approval (already processed). Only sessions with `pending`, `failed`, or `skipped_feature_disabled` will trigger.

---

## 24. Implementation Sequence for Future Phase 5 Execution

### Step 0 — Read and verify current state
- Re-read all files listed in Section 3
- Confirm no breaking changes since this plan was written

### Step 1 — Additive migration (if Option B chosen)
- Create `supabase/migrations/20260622110000_erp_dms_ai_phase5_orchestration_source_columns.sql`
- Add `orchestration_source TEXT NULL` and `orchestration_triggered_by_approve_run_id BIGINT NULL`
- Apply via Supabase MCP

### Step 2 — Create `post-approve-orchestration.ts`
- File: `src/lib/dms/orchestration/post-approve-orchestration.ts`
- Implement `triggerDmsPostApproveOrchestration()`
- Include: deduplication guard, audit logging, error catch, source recording

### Step 3 — Modify `approve-ai-intake.ts`
- Import `triggerDmsPostApproveOrchestration`
- Add call after approve run is marked `COMPLETED`, before final `return`
- Wrap in try/catch — errors must not propagate to return value

### Step 4 — Fix informational steps in `buildInitialSteps()`
- Update `pipeline-runner.ts` or `orchestration.ts` to mark `upload_received`, `ocr_and_extraction`, `draft_ready` as `skipped` when running the post-draft pipeline (Phase B only)
- Option: Separate constants for Phase A vs Phase B steps in `types.ts`

### Step 5 — Fix `retryDmsOrchestrationStep` feature flag gap
- Add feature flag check to `retryDmsOrchestrationStep` in `orchestration.ts`

### Step 6 — Typecheck, lint, build verification
- `npx tsc --noEmit` must pass with 0 errors

### Step 7 — Manual testing
- See Section 26

### Step 8 — Update source of truth and create implementation report

---

## 25. Acceptance Criteria for Future Implementation

| ID | Criterion |
|----|-----------|
| AC-01 | Single-file approve triggers the same orchestration path as batch finalize when feature flag is enabled. |
| AC-02 | Batch finalize and single approve use the same post-approve orchestration hook (`triggerDmsPostApproveOrchestration`). |
| AC-03 | Orchestration remains post-commit best-effort — called after approve run is marked COMPLETED. |
| AC-04 | Orchestration failure does not rollback or fail approval. Approval result is `success: true` regardless of orchestration outcome. |
| AC-05 | Feature flag `DMS_AI_ORCHESTRATION` is respected for both paths — disabled flag results in `skipped_feature_disabled` status. |
| AC-06 | Duplicate orchestration runs are prevented — sessions with status `running`, `complete`, or `complete_with_warnings` are not re-run on post-approval trigger. |
| AC-07 | Failed orchestration steps remain retryable via `retryDmsOrchestrationStep`. |
| AC-08 | Current `orchestration_steps_json` format remains backward compatible — no breaking changes to `DmsAiOrchestrationStepResult` structure. |
| AC-09 | Phase 4 approval transaction (`approve_dms_ai_intake` RPC) remains unchanged and safe. |
| AC-10 | No async job queue is implemented. |
| AC-11 | No AI tab automation beyond existing orchestration pipeline is implemented. |
| AC-12 | Human-review-first remains preserved — orchestration only fires after human approval. |
| AC-13 | Typecheck (`npx tsc --noEmit`) passes with 0 errors after implementation. |
| AC-14 | `retryDmsOrchestrationStep` respects the feature flag (new in Phase 5). |
| AC-15 | Phase A informational steps (`upload_received`, `ocr_and_extraction`, `draft_ready`) are no longer shown as `pending` after pipeline completes. |
| AC-16 | `orchestration_source` is recorded on session when migration is applied. |

---

## 26. Full Test Plan

### TC-01: Single-file approve triggers orchestration when flag enabled

**Purpose:** Verify post-approval orchestration fires for single-file path.  
**Setup:** Upload a single file, complete AI intake review, confirm session has no `document_id` yet, enable `DMS_AI_ORCHESTRATION` flag.  
**Steps:**
1. Click Approve & Save on intake review page
2. Wait for action to complete
3. Check `dms_upload_sessions.orchestration_status` for the session
4. Check `dms_upload_sessions.orchestration_steps_json` for step results
**Expected result:** `orchestration_status` is `complete` or `complete_with_warnings`. Pipeline steps show completion timestamps.  
**DB state:** `orchestration_status` not `pending`, `orchestration_started_at` set.  
**UI state:** Document record page shows AI summary, intelligence, tag suggestions populated.  
**Risk covered:** G1

---

### TC-02: Single-file approve does not trigger orchestration when flag disabled

**Purpose:** Verify flag gate is respected.  
**Setup:** Same as TC-01 but `DMS_AI_ORCHESTRATION.is_enabled = false`.  
**Steps:** Same as TC-01.  
**Expected result:** `orchestration_status` is `skipped_feature_disabled`. Steps all show `skipped`.  
**DB state:** `orchestration_status = 'skipped_feature_disabled'`.  
**UI state:** Document record page — AI pipeline results not populated (feature disabled).  
**Risk covered:** AC-05

---

### TC-03: Batch finalize triggers same orchestration when flag enabled

**Purpose:** Verify batch path uses same hook.  
**Setup:** Upload batch, complete AI fill for one draft, confirm draft has `document_id`, enable flag.  
**Steps:**
1. Open individual batch draft intake review page
2. Click Approve & Save
3. Check session's `orchestration_status`
**Expected result:** Same as TC-01 — `complete` or `complete_with_warnings`.  
**DB state:** `orchestration_source = 'batch_finalize'` (if migration applied).  
**Risk covered:** G2, AC-02

---

### TC-04: Orchestration failure does not fail approval

**Purpose:** Verify approval result is independent of orchestration outcome.  
**Setup:** Enable flag. Configure AI provider to fail (invalid key). Upload and complete intake review.  
**Steps:**
1. Click Approve & Save
2. Observe result toast
**Expected result:** Success toast shows document number. `orchestration_status = 'failed'` or `'complete_with_warnings'` on session. Document exists in DB.  
**DB state:** `dms_documents` row created; `orchestration_status` reflects failure.  
**UI state:** Document record page opens. No error blocking navigation.  
**Risk covered:** AC-04, G1

---

### TC-05: Orchestration already completed is not duplicated on retry

**Purpose:** Verify deduplication guard works.  
**Setup:** Session with `orchestration_status = 'complete'`. Trigger `triggerDmsPostApproveOrchestration` again (e.g., simulate approve retry).  
**Expected result:** Function returns `{ triggered: false, orchestrationStatus: 'complete' }`. No pipeline steps re-run.  
**DB state:** `orchestration_steps_json` unchanged.  
**Risk covered:** AC-06, G9

---

### TC-06: Orchestration processing state prevents duplicate run

**Purpose:** Verify concurrent run protection.  
**Setup:** Session with `orchestration_status = 'running'`. Call trigger.  
**Expected result:** Trigger returns early without running pipeline.  
**DB state:** No change.  
**Risk covered:** AC-06

---

### TC-07: Failed step can retry

**Purpose:** Verify individual step retry works post-Phase 5.  
**Setup:** Session where `ai_summary` step failed. `orchestration_status = 'complete_with_warnings'`.  
**Steps:** Call `retryDmsOrchestrationStep({ sessionCode, stepCode: 'ai_summary' })`.  
**Expected result:** Step re-runs. `orchestration_steps_json` updated for `ai_summary`. Overall status recalculated.  
**Risk covered:** AC-07

---

### TC-08: Document opens even if orchestration failed

**Purpose:** Verify document record is accessible regardless of pipeline outcome.  
**Setup:** Session approved, `orchestration_status = 'failed'`.  
**Steps:** Navigate to document record page.  
**Expected result:** Page loads. Document details visible. AI tabs show empty/loading state (not error page).  
**Risk covered:** AC-04

---

### TC-09: Post-commit OCR not duplicated incorrectly

**Purpose:** Verify `content_sync` skips when OCR already written by `runPostCommitOcr`.  
**Setup:** Session where `runPostCommitOcr` wrote `dms_document_content` successfully.  
**Expected result:** `content_sync` step returns `{ success: true, skipped: true }`.  
**DB state:** `dms_document_content` row unchanged (not double-written).  
**Risk covered:** overlap between Phase 4 OCR and Phase 5 `content_sync`

---

### TC-10: Feature flag respected by retryDmsOrchestrationStep

**Purpose:** Verify flag check added to retry action.  
**Setup:** `DMS_AI_ORCHESTRATION.is_enabled = false`. Session with failed step.  
**Steps:** Call `retryDmsOrchestrationStep`.  
**Expected result (Phase 5 behavior):** Returns error "Feature not enabled" or skips silently.  
**Risk covered:** AC-05, G5

---

### TC-11: Informational pipeline steps show skipped (not pending)

**Purpose:** Verify `upload_received`, `ocr_and_extraction`, `draft_ready` not shown as `pending` after pipeline.  
**Setup:** Enable flag, approve a document, wait for orchestration to complete.  
**Steps:** Call `getDmsOrchestrationStatus`, inspect steps.  
**Expected result:** `upload_received`, `ocr_and_extraction`, `draft_ready` show `skipped`.  
**DB state:** `orchestration_steps_json` contains `status: 'skipped'` for informational steps.  
**Risk covered:** G6

---

### TC-12: Typecheck / lint / build

**Purpose:** Verify no TypeScript errors or build failures.  
**Steps:** `npx tsc --noEmit`.  
**Expected result:** 0 errors.  
**Risk covered:** AC-13

---

## 27. Risks and Mitigations

| # | Risk | Probability | Impact | Mitigation |
|---|------|-------------|--------|-----------|
| R1 | Approve action too slow when orchestration runs inline (5–30s) | Medium | Medium | Acceptable trade-off when flag enabled. UI shows spinner. Add timeout per step in future Phase. |
| R2 | `content_sync` idempotency assumption breaks if `writeDocumentContentTextSystem` is not idempotent | Low | Medium | Verify `writeDocumentContentTextSystem` uses upsert. Content sync step already checks for existing content row. |
| R3 | AI provider rate limit causes orchestration failure at high volume | Medium | Low | Best-effort steps record failure without blocking. Manual retry available. |
| R4 | Batch sessions that ran orchestration pre-approval re-run post-approval | Medium | Medium | Deduplication guard (`complete` and `complete_with_warnings` skip) prevents this. |
| R5 | `runApproveAiIntakeSaga` call to orchestration breaks saga return type | Low | High | Trigger is wrapped in try/catch, returns `void`, never affects saga return value. |
| R6 | Supabase schema cache doesn't reflect new columns after migration | Low | Low | Supabase MCP apply_migration automatically refreshes schema cache. |
| R7 | `orchestration_status` CHECK constraint prevents new source values | N/A | N/A | `orchestration_source` is a new separate column — no change to existing constraint. |

---

## 28. What Must Not Be Implemented in Phase 5

The following are explicitly forbidden from Phase 5 scope:

```
Async job queue
AI Analysis apply-to-metadata
Semantic chunks UI/workflow
Review queue UI
ERP mapping UI
ERP mapping apply logic
Child rule tables for classification
Azure DI OCR wiring
OCR history viewer
Page-level OCR
Bulk auto-approve
Auto-save AI results to metadata
Auto-overwrite approved metadata
Major UI redesign of intake page
Full AI tab status automation beyond existing orchestration progress card
New background worker process
New external queue service (Redis, SQS, etc.)
New document-level orchestration (document tab triggers)
AI Analysis actions from orchestration pipeline
```

---

## 29. Recommended Next Cursor Implementation Prompt

When this plan is approved by ChatGPT, create an implementation prompt referencing this plan with the following key directives:

```text
Phase: ERP DMS AI Phase 5 — Single and Batch Upload Orchestration Unification

Approved plan: ERP_DMS_AI_PHASE_5_SINGLE_BATCH_ORCHESTRATION_UNIFICATION_PLAN.md

Architecture decision: Option C-lite (Section 14)
Migration: Option B — small additive migration (Section 20)

Strict scope:
1. Migration: add orchestration_source + orchestration_triggered_by_approve_run_id columns
2. New file: src/lib/dms/orchestration/post-approve-orchestration.ts
3. Modified: src/lib/dms/approve/approve-ai-intake.ts — add trigger call after COMPLETED stage
4. Modified: src/server/actions/dms/orchestration.ts — fix G5 (flag check in retry) + fix G6 (mark informational steps skipped)
5. No UI changes required (minimal)
6. TypeScript: 0 errors
7. Apply migration via Supabase MCP

Acceptance criteria: All AC-01 through AC-16 from plan Section 25.
Forbidden: All items in plan Section 28.
```

---

## 30. Final Recommendation

**Recommended approach: Option C-lite — trigger from saga, run inline best-effort**

The single convergence point (`runApproveAiIntakeSaga`) introduced in Phase 4 is the correct place to add the orchestration trigger. Both single-file and batch approval paths reach this function. Adding `triggerDmsPostApproveOrchestration()` at the end of the saga, after the approve run is marked `COMPLETED`, achieves the Phase 5 goal with minimal code changes and maximum reliability.

The implementation is small: one new 50-100 line library file, one 5-line change to the saga, two minor fixes to `orchestration.ts`. The optional migration adds two observable columns for production debugging.

The approach is future-proof: when Phase 6 introduces an async queue, `triggerDmsPostApproveOrchestration()` becomes the single place to change — from "call pipeline inline" to "enqueue pipeline record" — without touching the approve saga or any server actions.

**Summary of Phase 5 deliverables:**

| Deliverable | File | Size |
|-------------|------|------|
| Additive migration | `20260622110000_erp_dms_ai_phase5_orchestration_source_columns.sql` | ~15 lines |
| Post-approve trigger | `src/lib/dms/orchestration/post-approve-orchestration.ts` | ~80 lines |
| Saga change | `src/lib/dms/approve/approve-ai-intake.ts` | +5 lines |
| Orchestration fixes | `src/server/actions/dms/orchestration.ts` | +15 lines |
| Source of truth update | `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md` | Update |
| Implementation report | `implementation_Review/ERP_DMS_AI_PHASE_5_*.md` | New file |

**This plan is ready for ChatGPT review.**
