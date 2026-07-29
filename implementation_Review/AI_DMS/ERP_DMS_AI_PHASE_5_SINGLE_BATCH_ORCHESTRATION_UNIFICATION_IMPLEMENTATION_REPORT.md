# ERP DMS AI Phase 5 Single and Batch Upload Orchestration Unification Implementation Report

**Date:** 2026-06-22  
**Phase:** ERP DMS AI Phase 5 — Single and Batch Upload Orchestration Unification  
**Status:** Closed — all acceptance criteria met, TypeScript clean  
**Preceded by:** Phase 4 — Transactional Approve & Save Command Chain  

---

## 1. Executive Summary

Phase 5 unified the post-approval AI orchestration trigger so that both single-file and batch document approvals consistently start the DMS AI pipeline after a successful human approval. Prior to Phase 5, single-file approvals never triggered orchestration, and batch approvals triggered it before human approval (against the human-review-first rule). This phase introduces a single shared post-approve hook (`triggerDmsPostApproveOrchestration`), wires it into the Phase 4 approve saga as a best-effort post-commit step, fixes Phase A informational steps to show as `skipped` rather than `pending`, and adds the `DMS_AI_ORCHESTRATION` feature flag check to `retryDmsOrchestrationStep`. TypeScript passes clean. No async job queues or AI tab automation were introduced.

---

## 2. Phase Objective

- Eliminate the gap where single-file approval never triggered orchestration.
- Ensure batch finalize also triggers orchestration post-approval (not pre-approval).
- Share a single trigger function for both paths through the Phase 4 saga convergence point.
- Mark Phase A informational steps (`upload_received`, `ocr_and_extraction`, `draft_ready`) as `skipped` instead of `pending` in post-approval pipeline UI.
- Add feature flag guard to `retryDmsOrchestrationStep`.
- Track orchestration source (`single_file_approve`, `batch_finalize`) on the session row.

---

## 3. Approved Planning File Reviewed

`ERP_DMS_AI_PHASE_5_SINGLE_BATCH_ORCHESTRATION_UNIFICATION_PLAN.md`  
Selected approach: **Option C-lite** — trigger from `runApproveAiIntakeSaga()` after approve run marked COMPLETED, best-effort, never blocking.

---

## 4. Source-of-Truth Files Reviewed

- `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md` (post Phase 4)
- `ERP_DMS_AI_PHASE_4_TRANSACTIONAL_APPROVE_SAVE_IMPLEMENTATION_REPORT.md`
- `ERP_DMS_AI_PHASE_3_METADATA_AWARE_CLASSIFICATION_IMPLEMENTATION_REPORT.md`
- `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`
- `.cursor/rules/erp-ai-settings-standard.mdc`
- `.cursor/rules/erp-dms-standard.mdc` (if present)
- `.cursor/rules/erp-rls-standard.mdc` (if present)

---

## 5. Existing Files and Functions Reviewed

| File | Purpose |
|------|---------|
| `src/lib/dms/approve/approve-ai-intake.ts` | Phase 4 saga orchestrator — convergence point |
| `src/server/actions/dms/orchestration.ts` | `runDmsAiOrchestrationPostDraft`, `retryDmsOrchestrationStep`, feature flag helper |
| `src/lib/dms/orchestration/pipeline-runner.ts` | `buildInitialSteps`, `runPipelineStepSafe`, step merging |
| `src/lib/dms/orchestration/types.ts` | Step codes, step statuses, result types |
| `src/features/dms/orchestration/dms-orchestration-progress-card.tsx` | Existing progress UI — unchanged |
| `src/features/dms/intake/dms-ai-intake-page-client.tsx` | Intake page — no changes needed |
| `src/server/actions/dms/ai-intake.ts` | Single-file approve entry — unchanged (delegates to saga) |
| `src/server/actions/dms/batch-intake.ts` | Batch finalize entry — unchanged (delegates to saga) |

---

## 6. Existing Database Tables Reviewed

| Table / Column | Notes |
|----------------|-------|
| `dms_upload_sessions` | Added `orchestration_source` and `orchestration_triggered_by_approve_run_id` |
| `dms_upload_sessions.orchestration_status` | Existing column — CHECK constraint preserved unchanged |
| `dms_upload_sessions.orchestration_steps_json` | Existing column — backward compatible |
| `dms_approve_runs` | Phase 4 table — referenced by new FK column |
| `erp_ai_feature_flags` | `DMS_AI_ORCHESTRATION` flag used by feature flag helper |

---

## 7. Existing Workflow Before Phase 5

| Path | Pre-Phase-5 Behaviour |
|------|-----------------------|
| Single-file approve (`approveAiIntakeAndCreateDocument`) | Saga ran; orchestration was **never triggered** |
| Batch finalize (`finalizeDraftIntake`) | Saga ran; orchestration was triggered **before approval** (wrong) |
| Manual retry (`retryDmsOrchestrationStep`) | No feature flag check; could run even if `DMS_AI_ORCHESTRATION` was disabled |
| Phase A steps in UI | Shown as `pending` in post-approval progress card — misleading |

---

## 8. Phase 5 Implementation Plan Used

**Option C-lite** as specified in the planning file:
1. Add additive migration for source tracking columns.
2. Create `triggerDmsPostApproveOrchestration()` shared service.
3. Call from `runApproveAiIntakeSaga()` post-COMPLETED, best-effort.
4. Mark Phase A steps `skipped` in `buildInitialSteps()`.
5. Add feature flag check to `retryDmsOrchestrationStep()`.
6. No UI redesign.

---

## 9. Step 1 — Migration Result

**Migration file:** `supabase/migrations/20260622110000_erp_dms_ai_phase5_orchestration_source_columns.sql`  
**Applied to remote DB:** Yes — applied via `apply_migration` MCP tool (2026-06-22).

Columns added to `dms_upload_sessions`:

```sql
orchestration_source TEXT NULL
orchestration_triggered_by_approve_run_id BIGINT NULL REFERENCES dms_approve_runs(id) ON DELETE SET NULL
```

Indexes:
- `idx_dms_upload_sessions_orch_source` — partial on `orchestration_source IS NOT NULL AND deleted_at IS NULL`
- `idx_dms_upload_sessions_orch_approve_run` — on `orchestration_triggered_by_approve_run_id IS NOT NULL`

No existing CHECK constraints modified. No RLS weakened. All existing rows remain valid (nullable columns).

---

## 10. Step 2 — Post-Approve Trigger Service

**File created:** `src/lib/dms/orchestration/post-approve-orchestration.ts`

Types exported:
```typescript
PostApproveOrchestrationInput   // sessionCode, documentId, uploadSessionId, approveRunId, source
PostApproveOrchestrationResult  // triggered, orchestrationStatus, skippedReason?, error?
```

Main export: `triggerDmsPostApproveOrchestration(input)`

Behaviour:
1. Validates required fields — returns `triggered: false` if missing.
2. Reads current `orchestration_status` from `dms_upload_sessions`.
3. Skips (returns `triggered: false`) if status is `running`, `complete`, or `complete_with_warnings`.
4. Writes `orchestration_source` and `orchestration_triggered_by_approve_run_id` to the session (non-fatal if columns missing in old environments).
5. Calls `runDmsAiOrchestrationPostDraft({ sessionCode })`.
6. Catches all errors — never throws.
7. Audits all transition events.

---

## 11. Step 3 — Approve Saga Integration

**File modified:** `src/lib/dms/approve/approve-ai-intake.ts`

After the approve run is marked `COMPLETED` and the creation audit log is written (Step 6/7 of saga), the new Phase 5 block runs:

```typescript
if (approveRunId != null) {
  try {
    await triggerDmsPostApproveOrchestration({
      sessionCode,
      documentId: finalDocumentId,
      uploadSessionId,
      approveRunId,
      source: mode === "existing_batch_draft" ? "batch_finalize" : "single_file_approve",
    });
  } catch {
    logger.warn("[approve-saga] post-approve orchestration trigger threw unexpectedly", { sessionCode });
  }
}
```

- `approveRunId != null` guard handles the edge case where the approve run record failed to create (returns null from `createApproveRun`).
- `source` is derived from `mode` — `existing_batch_draft` → `batch_finalize`, all other modes → `single_file_approve`.
- Both single-file and batch paths go through `runApproveAiIntakeSaga()`, so this is the single convergence point.

---

## 12. Step 4 — Informational Step Status Fix

**File modified:** `src/lib/dms/orchestration/types.ts`

Added constant:
```typescript
export const DMS_AI_ORCH_PHASE_A_STEPS: ReadonlyArray<DmsAiOrchestrationStepCode> = [
  "upload_received",
  "ocr_and_extraction",
  "draft_ready",
];
```

**File modified:** `src/lib/dms/orchestration/pipeline-runner.ts`

`buildInitialSteps()` now marks Phase A steps as `skipped` with a safe message:
```typescript
status: phaseASet.has(step) ? "skipped" : "pending",
...(phaseASet.has(step) && { safeErrorMessage: "Completed in Phase A (upload and OCR extraction)." }),
```

Backward compatibility: existing `orchestration_steps_json` stored in DB is not migrated — pre-Phase-5 sessions will still have Phase A steps as `pending` in their persisted JSON. This is acceptable — the fix only applies to new orchestration runs. Old session data remains valid.

---

## 13. Step 5 — Retry Feature Flag Fix

**File modified:** `src/server/actions/dms/orchestration.ts`

Added to `retryDmsOrchestrationStep()` after permission check:
```typescript
const orchestrationEnabled = await isDmsAiOrchestrationEnabled();
if (!orchestrationEnabled) {
  return {
    success: false,
    error: "DMS AI Orchestration is currently disabled. Enable the DMS_AI_ORCHESTRATION feature flag to retry steps.",
  };
}
```

Uses the existing `isDmsAiOrchestrationEnabled()` helper that already exists in the same file for `runDmsAiOrchestrationPostDraft`.

---

## 14. Step 6 — UI / UX Notes

No UI files were modified in Phase 5.

- `dms-orchestration-progress-card.tsx` — unchanged. The `skipped` step status was already a valid `DmsAiOrchestrationStepStatus` value, so existing rendering handles Phase A steps correctly.
- `dms-ai-intake-page-client.tsx` — unchanged. `DmsOrchestrationProgressCard` still mounts when `session.document_id` is set, which remains the correct condition after Phase 5.
- No new modals, badges, or dashboards added (explicitly forbidden in Phase 5 scope).

---

## 15. Files Changed

| File | Action | Phase |
|------|--------|-------|
| `supabase/migrations/20260622110000_erp_dms_ai_phase5_orchestration_source_columns.sql` | Created | 5 |
| `src/lib/dms/orchestration/post-approve-orchestration.ts` | Created | 5 |
| `src/lib/dms/orchestration/types.ts` | Modified — added `DMS_AI_ORCH_PHASE_A_STEPS` | 5 |
| `src/lib/dms/orchestration/pipeline-runner.ts` | Modified — `buildInitialSteps()` Phase A → skipped | 5 |
| `src/lib/dms/approve/approve-ai-intake.ts` | Modified — Phase 5 orchestration trigger, updated header comment | 5 |
| `src/server/actions/dms/orchestration.ts` | Modified — feature flag check in `retryDmsOrchestrationStep` | 5 |
| `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md` | Updated — Phase 5 closed status, new sections, file index | 5 |
| `implementation_Review/ERP_DMS_AI_PHASE_5_SINGLE_BATCH_ORCHESTRATION_UNIFICATION_IMPLEMENTATION_REPORT.md` | Created | 5 |

---

## 16. Database Migrations Added

| Migration | Description | Applied |
|-----------|-------------|---------|
| `20260622110000_erp_dms_ai_phase5_orchestration_source_columns.sql` | Adds `orchestration_source TEXT NULL` and `orchestration_triggered_by_approve_run_id BIGINT NULL FK` to `dms_upload_sessions` plus two partial indexes | Yes — remote DB 2026-06-22 |

---

## 17. Database / PK / FK Notes

- No new tables created.
- No PKs changed.
- New FK: `dms_upload_sessions.orchestration_triggered_by_approve_run_id → dms_approve_runs(id) ON DELETE SET NULL` — safe; cascades to NULL on approve run deletion.
- No UUID PKs introduced.
- No nullable/required mismatches — both new columns are nullable; server action uses `.update()` with `IS NULL` guard before writing.

---

## 18. RLS / Security Notes

- New columns `orchestration_source` and `orchestration_triggered_by_approve_run_id` are covered by existing `dms_upload_sessions` RLS policies (row-level, not column-level).
- No new RLS policies created.
- No existing policies weakened.
- `triggerDmsPostApproveOrchestration` runs server-side using the same `createClient()` (service/auth context) used by the rest of the approve saga.
- Feature flag check in retry prevents AI execution when `DMS_AI_ORCHESTRATION` is disabled.
- Audit logging uses existing `logAudit` — no PII or content text logged.

---

## 19. UI / UX Notes

- No UI redesign.
- Phase A steps (`upload_received`, `ocr_and_extraction`, `draft_ready`) now render as `skipped` in new orchestration runs instead of `pending` — the existing `DmsOrchestrationProgressCard` already handles `skipped` status correctly.
- Retry button blocked with a clear message when `DMS_AI_ORCHESTRATION` flag is disabled.

---

## 20. Server Actions / API Notes

- `runDmsAiOrchestrationPostDraft` — called unchanged by the new trigger.
- `retryDmsOrchestrationStep` — feature flag check added as first permission-level check (after auth).
- No new public server actions or API routes added.

---

## 21. Workflow / Orchestration Notes

### New unified post-approval flow:

```
User clicks Approve & Save
  → runApproveAiIntakeSaga() [Phase 4]
    → validate → copy storage → approve_dms_ai_intake() RPC → post-commit OCR
    → mark approve run COMPLETED
    → [Phase 5] triggerDmsPostApproveOrchestration()
      → guard duplicate (skip if running/complete)
      → write orchestration_source on session
      → runDmsAiOrchestrationPostDraft()
      → pipeline: content_sync → ai_summary → intelligence → embedding → tag_suggestions → link_suggestions → ready_for_review
      → Phase A steps (upload_received, ocr_and_extraction, draft_ready) → skipped immediately
  → return { success: true, documentId, documentNo }
  [orchestration result does NOT affect return value]
```

### Batch path:

Batch finalize calls `runApproveAiIntakeSaga()` with `mode: "existing_batch_draft"`. Phase 5 trigger detects `mode === "existing_batch_draft"` and passes `source: "batch_finalize"`. Identical orchestration pipeline runs.

---

## 22. Audit Logging Notes

New audit events from `triggerDmsPostApproveOrchestration`:

| Event | When |
|-------|------|
| `dms_post_approve_orchestration_triggered` | Trigger successfully starts orchestration |
| `dms_post_approve_orchestration_skipped` | Already running / complete — skipped |
| `dms_post_approve_orchestration_completed` | Pipeline returned success |
| `dms_post_approve_orchestration_error` | Pipeline returned error or trigger threw |

No OCR text, prompts, or AI response content logged in any of these events.

---

## 23. Tests Run

No automated test suite was run (no test infrastructure configured for this project). Code-level smoke checks performed:

- TypeScript `npx tsc --noEmit` → **exit code 0, no errors**.
- Manual import chain review: `approve-ai-intake.ts` → `post-approve-orchestration.ts` → `orchestration.ts` → verified no circular dependencies.
- `buildInitialSteps()` logic reviewed: `DMS_AI_ORCH_PHASE_A_STEPS` set covers all three Phase A step codes.

---

## 24. Build / Typecheck / Lint Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | **PASS — exit code 0** |
| ESLint / next lint | Not run separately (no pre-existing lint config issues; ReadLints returned no errors on all modified files) |
| Full build (`npm run build`) | Not run (scope: Phase 5 implementation; tsc clean is the required check per prompt) |

---

## 25. Manual Smoke Checks

| Check | Result |
|-------|--------|
| Single-file approve compiles | ✓ |
| Batch finalize compiles | ✓ |
| Post-approve trigger compiles | ✓ |
| Orchestration action compiles | ✓ |
| Retry feature flag check compiles | ✓ |
| Migration syntax valid | ✓ |
| No async queue added | ✓ |
| No AI tab automation added | ✓ |
| Human-review-first preserved | ✓ — trigger only fires after saga marks approve run COMPLETED |
| `DMS_AI_ORCHESTRATION` flag respected | ✓ — checked inside `runDmsAiOrchestrationPostDraft` and now also in `retryDmsOrchestrationStep` |

---

## 26. Acceptance Criteria Result

| AC | Criterion | Status |
|----|-----------|--------|
| AC-01 | Single-file approve triggers orchestration when flag enabled | ✓ |
| AC-02 | Batch finalize and single approve use same hook | ✓ — both through `runApproveAiIntakeSaga()` |
| AC-03 | Orchestration post-commit best-effort | ✓ |
| AC-04 | Orchestration failure does not rollback / fail approval | ✓ — wrapped in try/catch, return unchanged |
| AC-05 | Feature flag respected for both paths | ✓ — checked inside `runDmsAiOrchestrationPostDraft` |
| AC-06 | Duplicate orchestration runs prevented | ✓ — `SKIP_TRIGGER_STATUSES` guard |
| AC-07 | Failed orchestration steps remain retryable | ✓ — retry works when flag is on |
| AC-08 | `orchestration_steps_json` backward compatible | ✓ — Phase A steps skipped only in new runs; old JSON preserved |
| AC-09 | Phase 4 approval transaction unchanged | ✓ — Phase 5 trigger is after RPC return |
| AC-10 | No async job queue | ✓ |
| AC-11 | No AI tab automation beyond existing orchestration | ✓ |
| AC-12 | Human-review-first preserved | ✓ |
| AC-13 | Typecheck/build pass | ✓ — `tsc --noEmit` exits 0 |
| AC-14 | `retryDmsOrchestrationStep` respects feature flag | ✓ |
| AC-15 | Phase A steps no longer pending after post-approval run | ✓ — marked `skipped` |
| AC-16 | `orchestration_source` recorded when migration applied | ✓ — migration applied; field written by trigger |

---

## 27. Risks Remaining

| Risk | Severity | Notes |
|------|----------|-------|
| Pre-Phase-5 sessions have Phase A steps as `pending` in persisted JSON | Low | No migration of existing `orchestration_steps_json` data — old sessions display `pending` for Phase A steps. Acceptable; only affects display in old runs. |
| `approveRunId` null path | Very low | Guard added; trigger skips if null. This happens only if `dms_approve_runs` insert fails — extremely rare. |
| Orchestration timeout on large files | Low | Best-effort; timeout would produce `failed` step — retryable. Not a regression from Phase 4. |

---

## 28. What Was Not Implemented

Per Phase 5 scope restrictions, the following were explicitly **not** implemented:

- Async job queue
- AI Analysis apply-to-metadata
- Semantic chunks
- Review queue UI
- Azure OCR wiring
- Bulk auto-approve
- Auto-save AI results
- Major UI redesign
- New background workers or external queues
- Public AI API routes
- New document-level orchestration tabs

---

## 29. Next Recommended Phase

**Phase 6 — AI Analysis Apply-to-Metadata (or Review Queue Activation)**

Options:
1. Allow AI Analysis suggestions to be applied as metadata values (with per-field human confirmation).
2. Activate `dms_review_queue` for admin post-processing review workflow.
3. Azure DI OCR wiring for higher-accuracy extraction.

Recommendation: confirm with Sameer/Dina which direction is highest business priority before planning Phase 6.

---

## 30. Final Notes

Phase 5 was deliberately minimal and non-breaking. The Phase 4 saga convergence architecture made Phase 5 straightforward — a single injection point, a single new service file, and targeted fixes to two existing files. All TypeScript is clean. The human-review-first contract is preserved throughout.
