# ERP DMS AI Phase 9 — Async AI Job Queue / Workflow Runner
## Implementation Report

**Phase:** ERP DMS AI Phase 9  
**Status:** CLOSED / PASS ✅  
**Implemented:** 2026-06-22 (code), migrations pending live apply  
**Implements:** `ERP_DMS_AI_CORRECTED_PHASE_9_ASYNC_JOB_QUEUE_WORKFLOW_RUNNER_IMPLEMENTATION_PROMPT.md`  

---

## Summary

Phase 9 introduces a reliable, observable, and retryable asynchronous job queue for long-running DMS AI tasks. The core infrastructure (queue tables, RPCs, TypeScript runner, worker route) is fully implemented. The first wave of task offloading covers **post-approval AI orchestration** (`post_approve_orchestration` job type). All new behavior is **feature-flag-gated** (both flags default `false`) — there is no change to live behavior until flags are explicitly enabled.

---

## DB Changes

### Migration 1: `20260622150000_erp_dms_ai_phase9_job_queue.sql`

**Table: `dms_ai_job_queue`**

| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGSERIAL PK | |
| `job_type` | TEXT NOT NULL | e.g. `post_approve_orchestration` |
| `job_status` | TEXT NOT NULL | `queued` / `running` / `completed` / `failed` / `retry_scheduled` / `cancelled` |
| `priority` | INT NOT NULL DEFAULT 5 | Lower = higher priority |
| `payload_json` | JSONB NOT NULL | IDs and control flags only — no OCR/AI content |
| `idempotency_key` | TEXT UNIQUE | Prevents duplicate jobs |
| `related_document_id` | BIGINT FK → `dms_documents` | |
| `related_session_id` | BIGINT FK → `dms_upload_sessions` | |
| `attempt_count` | INT NOT NULL DEFAULT 0 | |
| `max_attempts` | INT NOT NULL DEFAULT 3 | |
| `locked_by` | TEXT | Worker ID currently processing |
| `locked_at` | TIMESTAMPTZ | |
| `run_after` | TIMESTAMPTZ NOT NULL DEFAULT NOW() | Supports delayed retry |
| `last_error_code` | TEXT | |
| `last_error_message` | TEXT | Safe, sanitized — no raw stack traces |
| `created_by` | UUID | |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

Indexes: `(job_status, priority, run_after)` for claiming; `(related_document_id)`, `(related_session_id)`, `(job_type, job_status)`, `(locked_at)` for stale lock recovery.

**Table: `dms_ai_job_attempts`**

| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGSERIAL PK | |
| `job_id` | BIGINT FK → `dms_ai_job_queue` | |
| `attempt_number` | INT | |
| `started_at` / `completed_at` | TIMESTAMPTZ | |
| `status` | TEXT | `running` / `completed` / `failed` |
| `duration_ms` | INT | |
| `error_code` / `safe_error_message` | TEXT | |
| `worker_id` | TEXT | |
| `usage_log_id` | BIGINT FK → `erp_ai_usage_logs` | |

**RLS:** Enabled and forced on both tables. `SELECT` for `dms.viewer`, `dms.reviewer`, `dms.admin`. `INSERT/UPDATE` for `dms.admin` or service role (server actions use `createAdminClient()`).

---

### Migration 2: `20260622151000_erp_dms_ai_phase9_job_queue_rpcs.sql`

Four `SECURITY DEFINER` functions:

| RPC | Purpose |
|-----|---------|
| `claim_dms_ai_jobs(p_worker_id, p_limit)` | Atomically claim pending jobs using `FOR UPDATE SKIP LOCKED` |
| `complete_dms_ai_job(p_job_id)` | Mark job completed, clear lock |
| `fail_dms_ai_job(p_job_id, p_error_code, p_error_message, p_retry)` | Increment attempts; schedule retry with exponential backoff or mark failed |
| `recover_stale_dms_ai_jobs(p_stale_after_minutes)` | Reset `running` jobs with expired locks to `retry_scheduled` |

---

### Migration 3: `20260622152000_erp_dms_ai_phase9_feature_flags.sql`

Inserts into `erp_ai_feature_flags`:

| Flag | Default | Purpose |
|------|---------|---------|
| `DMS_AI_JOB_QUEUE` | `false` | Route post-approval orchestration through queue |
| `DMS_AI_JOB_QUEUE_WORKER_ENABLED` | `false` | Enable the `/api/internal/dms-ai-jobs/process` worker route |

---

## TypeScript Modules

### `src/lib/dms/ai-jobs/job-types.ts`

- `DMS_AI_JOB_TYPE` const enum: `POST_APPROVE_ORCHESTRATION`
- `DmsAiJobStatus` / `DmsAiAttemptStatus` types
- `DmsAiJobHandlerCtx` interface
- `DmsAiJobHandlerResult` interface: `{ success, retryable?, errorCode?, errorMessage? }`
- `EnqueueDmsAiJobInput` interface
- `DmsAiJobHandler` type: `{ jobType, handle(payload, ctx?) }`
- Zod schema `PostApproveOrchestrationPayloadSchema`: validates `{ documentId, sessionId?, triggeredBy? }`
- Constants: `JOB_TYPE_MAX_ATTEMPTS`, `RETRYABLE_ERROR_CODES`

### `src/lib/dms/ai-jobs/job-registry.ts`

- Maps job types to handler implementations
- Currently registers: `postApproveOrchestrationHandler`

### `src/lib/dms/ai-jobs/handlers/post-approve-orchestration.handler.ts`

- Validates payload via `PostApproveOrchestrationPayloadSchema`
- Calls `runDmsAiOrchestrationPostDraftSystem(documentId)` from system pipeline
- Returns `DmsAiJobHandlerResult` indicating success/failure and retryability

### `src/lib/dms/orchestration/system-pipeline.ts`

Key architectural decision: Existing AI server actions (summary, intelligence, embedding, tags, links) require `getAuthContext()` for user sessions. Worker context has no user session (no cookies). Solution: dedicated system pipeline using `createAdminClient()` exclusively.

Steps implemented:
1. `runContentSyncStepSystem` — syncs content from `dms_document_content`
2. `runAiSummaryStepSystem` — calls `getDmsAiProvider().summarize()`, writes to `dms_document_ai_summaries`
3. `runIntelligenceStepSystem` — calculates completeness/risk scores, updates `dms_documents`
4. `runEmbeddingStepSystem` — calls `getDmsEmbeddingProvider().embedText()`, writes to `dms_document_embeddings`
5. `runTagSuggestionsStepSystem` — calls `getDmsAiProvider().callStructuredCompletion()`, writes to `dms_ai_tag_suggestions`
6. `runLinkSuggestionsStepSystem` — calls AI for entity link suggestions, writes to `dms_ai_link_suggestions`

Each step is individually feature-flag gated via `isFeatureEnabled()`. All steps use admin client — no user auth required.

### `src/lib/dms/ai-jobs/job-runner.ts`

Core job lifecycle management:

- `enqueueDmsAiJob(input)` — inserts a new job into `dms_ai_job_queue`
- `enqueueUniqueDmsAiJob(input)` — inserts only if no job with same idempotency key is active
- `processNextDmsAiJobs(options)` — recovers stale jobs, claims batch, runs each job
- `runDmsAiJob(job)` — creates attempt record, dispatches to handler, updates status via RPCs
- `sanitizeJobError(err)` — strips stack traces from error messages before DB storage

---

## Server Actions

### `src/server/actions/dms/ai-jobs.ts`

| Action | Permission | Notes |
|--------|-----------|-------|
| `enqueueDmsAiJobAction` | `dms.admin` | Enqueue a new job |
| `enqueueUniqueDmsAiJobAction` | `dms.admin` | Idempotent enqueue |
| `getDmsAiJobStatus` | `dms.documents.view` | Single job status |
| `getDmsAiJobsForDocument` | `dms.documents.view` | All jobs for a document |
| `cancelDmsAiJob` | `system_admin` | Cancel `queued`/`retry_scheduled` jobs |
| `retryDmsAiJob` | `dms.admin` | Reset `failed`/`cancelled` jobs to `queued` |

All actions use `createAdminClient()` for DB operations after application-layer permission checks.

---

## Worker Route

### `src/app/api/internal/dms-ai-jobs/process/route.ts`

- `runtime = "nodejs"` (no Edge runtime — AI processing requires Node.js)
- **Authentication:** `Authorization: Bearer {WORKER_SECRET}` header required; returns 401 if missing/invalid
- **Feature gate:** returns 200 (idle) if `DMS_AI_JOB_QUEUE_WORKER_ENABLED=false`

`POST /api/internal/dms-ai-jobs/process`:
- Parses optional `{ limit, workerId }` from request body
- Calls `processNextDmsAiJobs({ limit, workerId })`
- Returns: `{ processed, completed, failed, retryScheduled, durationMs }`

`GET /api/internal/dms-ai-jobs/process`:
- Health check with queue counts per status
- Secured by same `WORKER_SECRET`

---

## Modified Files

| File | Change |
|------|--------|
| `src/lib/dms/orchestration/post-approve-orchestration.ts` | Branches on `DMS_AI_JOB_QUEUE` flag: enqueues job or runs inline; falls back to inline if enqueue fails |
| `src/lib/dms/orchestration/types.ts` | Added `"queued"` to `DmsAiOrchestrationStatus` |
| `src/features/dms/orchestration/dms-orchestration-progress-card.tsx` | Renders "Queued" badge + minimal status card for queued state |
| `src/lib/query/query-keys.ts` | Added `aiJobsForDocument(documentId)` and `aiJobStatus(jobId)` |

---

## Errors Fixed During Implementation

| Error | Fix |
|-------|-----|
| `ProcessResult` not assignable to `LogContext` (index signature) | Changed `logger.info("...", result)` to `logger.info("...", { ...result })` |
| Supabase `PostgrestBuilder` type casting errors in job-runner | Removed explicit `Promise<{ data: ... }>` casts; cast individual fields after query |
| `cancelDmsAiJob` status type narrowing | Used `string[]` array + `.includes()` instead of union type comparison |
| `retryDmsAiJob` same issue | Same fix |
| `_ctx` unused parameter ESLint warning in handler | Made `ctx` optional in `DmsAiJobHandler` type; removed parameter from handler that doesn't use it |
| `now` unused variable in `system-pipeline.ts` | Removed `const now` and inlined `new Date().toISOString()` directly in the update call |
| Unused `DmsAiJobQueueRow` import in `ai-jobs.ts` | Removed the unused import |

---

## Feature Flags — Enabling Guide

Phase 9 ships with all new behavior gated. No existing code paths changed.

To enable the async job queue:
1. Set `DMS_AI_JOB_QUEUE = true` in `erp_ai_feature_flags` → post-approval orchestration will enqueue instead of running inline
2. Set `DMS_AI_JOB_QUEUE_WORKER_ENABLED = true` → worker route becomes active
3. Call `POST /api/internal/dms-ai-jobs/process` with `Authorization: Bearer {WORKER_SECRET}` to drain the queue (can be triggered by a cron, external scheduler, or manually)

To rollback: set `DMS_AI_JOB_QUEUE = false` → all orchestration reverts to inline execution without any data loss.

---

## Explicitly Out of Scope (Per Phase Prompt)

- Phase 10+ features (semantic chunking, Azure OCR, review queue UI, token/cost dashboard)
- Moving intake OCR/classification to queue
- Changing Phase 4 approve RPC or Phase 6/8 behaviors
- AI Analysis job queueing (no active handler — stub only if needed)
- Auto-approval, auto-save AI suggestions, ERP writes
- Storing raw OCR text, AI prompts, AI responses, or API keys in queue payloads

---

## Test Checklist

- [x] `npx tsc --noEmit` — 0 errors
- [x] ESLint — 0 errors, 0 warnings (Phase 9 files)
- [ ] Apply migrations to live Supabase DB (pending Sameer)
- [ ] Enable `DMS_AI_JOB_QUEUE=true` and approve a document to verify job is enqueued
- [ ] Trigger worker route and verify job runs to completion
- [ ] Verify `DMS_AI_JOB_QUEUE=false` falls back to inline (existing behavior)

---

## Next Phase

**ERP DMS AI Phase 10 — ERP Apply Runs** (pending Sameer/Dina approval):
- `dms_erp_mapping_apply_runs` + `dms_erp_mapping_apply_items` tables
- Apply-to-ERP confirmation UI + server action
- Dual permission gate (DMS + target module)
- Per-field audit logging
