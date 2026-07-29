# ERP DMS AI ORCH.1 — One-Click Upload & Full AI Processing Pipeline — Implementation Report

**Phase:** ERP DMS AI ORCH.1  
**Date:** 2026-06-17  
**Status:** CLOSED / PASS ✅  
**Based on:** Approved plan: `ERP_DMS_AI_ORCH_1_ONE_CLICK_UPLOAD_FULL_AI_PROCESSING_PIPELINE_PLAN.md`  

---

## Summary

Implemented the one-click DMS AI orchestration pipeline. When `DMS_AI_ORCHESTRATION` flag is enabled, the intake review screen automatically runs post-draft best-effort steps (content sync, AI summary, intelligence evaluation, embedding, tag suggestions, smart links) after draft creation. The existing Upload & AI Fill critical path (OCR + extraction) is completely unchanged. Human approval remains mandatory, one-by-one.

---

## Files Created / Changed

| File | Action |
|---|---|
| `supabase/migrations/20260617090000_erp_dms_ai_orch_1_orchestration_columns.sql` | **Created + Applied** — 4 new columns on `dms_upload_sessions` + `DMS_AI_ORCHESTRATION` flag |
| `src/lib/dms/orchestration/types.ts` | **Created** — step codes, statuses, orchestration status types, result types |
| `src/lib/dms/orchestration/pipeline-runner.ts` | **Created** — safe step runner, error sanitization, status calculation |
| `src/server/actions/dms/orchestration.ts` | **Created** — 4 server actions: runPostDraft, getStatus, retryStep, runBatch |
| `src/features/dms/orchestration/dms-orchestration-progress-card.tsx` | **Created** — UI progress card with per-step status and retry buttons |
| `src/features/dms/orchestration/index.ts` | **Created** — barrel export |
| `src/features/dms/intake/dms-ai-intake-page-client.tsx` | **Updated** — added progress card auto-trigger on mount |
| `src/features/dms/upload/dms-batch-review-queue-client.tsx` | **Updated** — added "Run AI Pipeline" button |
| `src/lib/query/query-keys.ts` | **Updated** — added `orchestrationStatus`, `batchOrchestration` keys |
| `src/lib/query/invalidation.ts` | **Updated** — added `invalidateDmsOrchestrationStatus`, `invalidateDmsBatchOrchestration` |
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | **Updated** |

---

## Migration Applied

**Applied to live DB via `user-supabase`:**

New columns on `dms_upload_sessions`:
- `orchestration_status TEXT DEFAULT 'pending'` with CHECK constraint (6 values)
- `orchestration_steps_json JSONB` — per-step safe metadata only
- `orchestration_started_at TIMESTAMPTZ`
- `orchestration_completed_at TIMESTAMPTZ`

New feature flag: `DMS_AI_ORCHESTRATION` — `is_enabled = false` (default disabled)

New index: `idx_dms_upload_sessions_orchestration_status`

---

## Feature Flag Status

`DMS_AI_ORCHESTRATION` — `is_enabled = false` in live DB ✅

When flag is off:
- `runDmsAiOrchestrationPostDraft` returns `skipped_feature_disabled` immediately
- No additional AI cost
- Existing Upload & AI Fill flow unchanged
- Progress card shows disabled message or nothing

---

## Orchestration Design Summary

### Two-phase architecture

**Phase A (Critical path — existing, unchanged):**
```
Upload → startAiIntakeFromUploadSession → OCR + AI extraction → draft ready
```

**Phase B (Best-effort — new ORCH.1):**
```
Intake review page loads
→ Calls runDmsAiOrchestrationPostDraft (auto-trigger on mount)
→ Pipeline: content_sync → ai_summary → intelligence → embedding → tag_suggestions → link_suggestions
→ Per-step status tracked in orchestration_steps_json
→ Failed steps: review screen still usable, retry button shown
→ DMS_AI_ORCHESTRATION must be enabled
```

### Step isolation

Each step wrapped in `runPipelineStepSafe()` — individual failures never block subsequent steps or the review screen.

### Idempotency

| Step | Check |
|---|---|
| `content_sync` | Skip if `dms_document_content` row exists |
| `ai_summary` | Delegates to `generateAndSaveDmsAiSummary` which skips if `ai_summary_status = complete` |
| `intelligence` | Deterministic, always safe to rerun (0 AI cost) |
| `embedding` | Delegates to `generateDmsDocumentEmbedding` which skips if `summary_embedding_status = complete` |
| `tag_suggestions` | Supersedes old pending (existing behavior) |
| `link_suggestions` | Supersedes old pending (existing behavior) |

---

## Server Actions Summary

| Action | Purpose |
|---|---|
| `runDmsAiOrchestrationPostDraft({ sessionCode })` | Runs full Phase B pipeline for one session |
| `getDmsOrchestrationStatus({ sessionCode })` | Read-only status query |
| `retryDmsOrchestrationStep({ sessionCode, stepCode })` | Retries one failed best-effort step |
| `runDmsBatchOrchestration({ batchCode })` | Runs Phase B pipeline sequentially for all batch draft sessions |

**No internal helper extraction from existing files.** The orchestrator calls existing server actions as functions (both are server-side async). Each action does its own auth check (minor N+1 on auth queries — acceptable for this use case and safer than refactoring existing files).

---

## Single-File Flow Summary

1. User uploads file, clicks "Upload & AI Fill"
2. `startAiIntakeFromUploadSession` runs (OCR + AI extraction) — **unchanged**
3. Redirect to `/dms/intake/[sessionCode]`
4. `DmsOrchestrationProgressCard` mounts with `autoTrigger=true`
5. If `session.document_id` exists and flag is enabled: `runDmsAiOrchestrationPostDraft` called
6. Progress card shows per-step status (spinner, checkmarks, warnings)
7. Review form is fully editable while pipeline runs — not blocked
8. User reviews, approves, document becomes active — **unchanged**

---

## Batch Flow Summary

1. User uploads batch, drafts created — **unchanged**
2. Batch review queue shows "Run AI Pipeline" button (new)
3. Clicking it calls `runDmsBatchOrchestration(batchCode)` — processes each draft sequentially
4. Toast shows results: N complete, M warnings, K failed
5. Per-draft orchestration status visible in queue (via queue refresh)
6. Approval remains **one-by-one** — no bulk approve added ✅

---

## UI Progress Summary

**`DmsOrchestrationProgressCard`:**
- Collapsible (default expanded)
- Shows overall status badge (Running, Complete, Warnings, Failed, Disabled)
- Per-step icons: ✓ green, ⚠ amber, ✗ red, ⟳ spinning, — skipped, ⏱ pending
- Step labels: Upload, OCR & AI Extraction, Draft Ready, Content Text, AI Summary, Completeness & Risk, Semantic Embedding, Tag Suggestions, Smart Links, Ready for Review
- Failed steps: shows safe error message + Retry button
- Content never shown — no OCR, no prompts, no AI responses

---

## Security / Logging Summary

| Rule | Status |
|---|---|
| No direct OpenAI imports in orchestration code | ✅ Uses existing DMS AI server actions |
| No raw OCR/prompt/content_text in orchestration_steps_json | ✅ Only step codes, status, duration, error codes |
| No raw AI response in step results | ✅ sanitizePipelineError() strips sensitive content |
| No raw provider error stack traces to client | ✅ Errors sanitized to 200-char safe messages |
| Permission check at orchestrator boundary | ✅ `canRunOrchestration()` — dms.documents.upload or dms.admin |
| Individual step permissions still enforced by called actions | ✅ Each called action does its own auth |
| Audit events: safe metadata only | ✅ sessionCode, documentId, counts, duration |

---

## Manual Tools Preservation

All existing manual AI tools remain fully available and unchanged:

✅ "Run OCR" / "Re-run OCR" button  
✅ "AI Analysis" button  
✅ "Generate Summary" button  
✅ "Evaluate Intelligence" button  
✅ "Generate Embedding" button  
✅ "Find Similar Documents"  
✅ "Suggest Tags" button  
✅ "Suggest Links" button  
✅ Admin backfill tools (admin/dms/intelligence)  

---

## One-by-One Approval Confirmation

Batch approval governance is unchanged:
- ✅ `finalizeDraftIntake` — accepts exactly one session ID
- ✅ Batch queue: no "bulk approve" button added
- ✅ `runDmsBatchOrchestration` prepares drafts with intelligence — does NOT approve anything
- ✅ Governance rule verified: ONE-BY-ONE APPROVAL ONLY ✅

---

## What Was Explicitly Not Implemented

| Item | Status |
|---|---|
| Internal helper extraction from existing files | ❌ Not done — existing server actions called directly (safer) |
| New orchestration run tables | ❌ Not created — JSONB column approach used instead |
| `erp_ai_record_ai_status` | ❌ Not created (Common AI.2 deferred) |
| New AI models or OCR engine | ❌ Existing pipeline reused |
| Bulk approval | ❌ None added |
| Auto-approval | ❌ None |
| `DMS_AI_ORCHESTRATION` enabled | ❌ Remains `false` |
| Branch/Site changes | ❌ Untouched |

---

## TypeScript / Build Results

| Check | Result |
|---|---|
| `npm run typecheck` | **PASS** (0 errors) |
| `npm run build` | **PASS** |

Initial typecheck had 3 errors (wrong param names, property name). All fixed.

---

## UAT Instructions

**With flag disabled (current state):**
1. Upload a file → "Upload & AI Fill" → confirm existing flow still works
2. Intake review screen shows no pipeline card (or disabled message if session has document_id)

**With flag enabled (after Sameer approval):**
```sql
UPDATE erp_ai_feature_flags SET is_enabled = true WHERE feature_code = 'DMS_AI_ORCHESTRATION';
```
1. Upload a file → "Upload & AI Fill"
2. Intake review screen shows AI Pipeline progress card
3. Steps run: Content Text → AI Summary → Completeness/Risk → Embedding → Tags → Links
4. Failed steps show retry buttons
5. Review form is editable and Approve & Save works regardless of pipeline status
6. Batch: upload multiple files → batch review queue → "Run AI Pipeline" button → sequential processing

**Disable after UAT:**
```sql
UPDATE erp_ai_feature_flags SET is_enabled = false WHERE feature_code = 'DMS_AI_ORCHESTRATION';
```

---

## Risks / Open Questions

1. **N+1 auth calls**: Each called server action does `getAuthContext()` internally. For 5 steps, this is ~5 extra Supabase auth calls (~50-100ms total). Acceptable for current scale. If performance is a concern in future, extract internal helpers as originally planned.
2. **`performedBy: 0` in content sync**: The `writeDocumentContentTextSystem` requires a `performedBy` user ID. Orchestrator passes `0` as system-level. This is consistent with how other internal system calls work. If an explicit user ID is needed, pass `ctx.profile.id` from orchestrator boundary.
3. **Progress card polling**: Uses `refetchInterval: 3000` while running. After completion, polling stops. If user navigates away before completion, status is still stored in DB and visible on return.
4. **Summary on draft documents**: `generateAndSaveDmsAiSummary` doesn't explicitly check if document is active vs. draft. It loads content_text and ai_summary from `dms_documents` by ID — this works for draft (pending_ai_review) documents too. ✅

---

## Recommended Next Phase

**ERP COMMON AI.2 — AI Document Understanding Center**

Or proceed with other approved roadmap items per Sameer/Dina priority.

---

**End of Report**
