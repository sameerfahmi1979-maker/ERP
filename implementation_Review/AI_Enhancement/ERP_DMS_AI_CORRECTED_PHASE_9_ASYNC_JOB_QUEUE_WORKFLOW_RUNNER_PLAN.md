# ERP DMS AI Corrected Phase 9 — Async AI Job Queue / Workflow Runner Plan

**Date:** 2026-06-22  
**Phase:** Corrected ERP DMS AI Phase 9 — Async AI Job Queue / Workflow Runner  
**Status:** Planning only — no code, migration, or schema changes made  

---

## 1. Executive Summary

All current DMS AI workflows run **synchronously inline** inside Next.js server actions that block until completion. The post-approval orchestration pipeline (content sync → AI summary → intelligence → embedding → tag suggestions → link suggestions) runs in the same request that approves the document. `runDmsAiAnalysisForDocument` creates a job row and immediately executes the AI call in the same server action.

This means: a slow or rate-limited AI provider blocks the approval/analysis response to the user. A provider timeout fails the entire request. There is no retry mechanism beyond `retryDmsAiAnalysisJob` which is a manual user action. There is no queue, no worker, and no central status dashboard.

**Phase 9 fixes this** by introducing a generic `dms_ai_job_queue` table with a secure processing endpoint and a TypeScript job handler registry. The first migration wave offloads the **post-approval orchestration best-effort steps** (content_sync, ai_summary, intelligence, embedding, tag_suggestions, link_suggestions) from inline execution into the queue. The approve action returns immediately after recording the document; the queue worker processes the pipeline in the background.

**`dms_ai_extraction_jobs`** is kept for extraction result history. It is **not** repurposed — it is too extraction-specific and lacks the retry/concurrency columns needed for a generic queue.

**Recommended scope:** Phase 9 = queue table + Postgres RPC claiming + TypeScript runner + protected API route + first wave offload (post-approval orchestration). AI Analysis re-run queuing = second wave (Phase 9B or Phase 10). OCR/intake = later.

---

## 2. Planning Scope and Non-Implementation Rule

**This document is planning only.** No source code, migrations, UI files, or server actions will be created or modified.

**Phase 9 implementation will cover (if approved):**
- `dms_ai_job_queue` table + `dms_ai_job_attempts` table + RLS
- Postgres RPCs: `claim_dms_ai_jobs`, `complete_dms_ai_job`, `fail_dms_ai_job`
- `DMS_AI_JOB_QUEUE` feature flag in `erp_ai_feature_flags`
- `src/lib/dms/ai-jobs/` directory: job types, registry, handlers, runner
- `src/server/actions/dms/ai-jobs.ts` — enqueue/cancel/status actions
- `src/app/api/internal/dms-ai-jobs/process/route.ts` — protected worker endpoint
- First wave: `post_approve_orchestration` job type (offload from inline)
- Minimal status UI: job status badge in orchestration card
- No Apply-to-ERP writes, no semantic chunking, no Azure OCR, no full observability dashboard

---

## 3. Roadmap Reconciliation

| Original Roadmap | Actual Completed | Notes |
|-----------------|-----------------|-------|
| Phase 4 — OCR Pipeline Upgrade | Deferred | OCR foundation exists; full upgrade pending |
| Phase 5 — AI Intake Review UX | Done as Phase 4 Transactional Approve & Save | Sequence shifted |
| Phase 6 — Transactional Approve & Save | Done as Phase 5 Orchestration Unification | |
| Phase 7 — Batch Orchestration Unification | Done as Phase 6 Apply-to-Metadata | |
| Phase 8 — AI Tabs / Status Tracking | Done as Phase 7 Apply History | |
| Phase 9 — Async AI Job Queue | **This phase** | Returning to original infrastructure roadmap |
| Phase 10 — Apply-to-Metadata | Completed early as Phase 6 | Already done |
| Phase 11 — Semantic Chunking | Still pending | Needs queue first |
| Phase 12 — Review Queue Activation | Still pending | |
| Phase 13 — Validation / Owner Matching | Still pending | |
| Phase 14 — Observability | Still pending | Needs job attempts table from Phase 9 |

**Current corrected roadmap (Phase 9 onward):**

```
Corrected Phase 9   — Async AI Job Queue + Workflow Runner (this plan)
Corrected Phase 10  — Apply-to-ERP Records (ERP Mapping write, from Phase 8 preview)
Corrected Phase 11  — OCR Pipeline Upgrade / Azure OCR Wiring
Corrected Phase 12  — Semantic Chunking and Embeddings (needs queue from Phase 9)
Corrected Phase 13  — Review Queue Activation
Corrected Phase 14  — Audit / Token / Cost Observability (needs attempts table from Phase 9)
Corrected Phase 15  — Validation, Conflict Detection, Owner Matching
Corrected Phase 16  — Testing, Performance, Hardening
```

---

## 4. Files and Source-of-Truth Reviewed

| File | Status |
|------|--------|
| `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md` | Read |
| `implementation_Review/ERP_DMS_AI_PHASE_8_ERP_MAPPING_IMPLEMENTATION_REPORT.md` | Read |
| `src/lib/dms/orchestration/types.ts` | Read — full step/status type definitions |
| `src/lib/dms/orchestration/pipeline-runner.ts` | Read — inline synchronous runner |
| `src/lib/dms/orchestration/post-approve-orchestration.ts` | Read — post-approve trigger |
| `src/server/actions/dms/orchestration.ts` | Read — inline pipeline execution |
| `src/server/actions/dms/ai-analysis.ts` | Read — `runDmsAiAnalysisForDocument` |
| `supabase/migrations/20260614192000_erp_dms_2_*.sql` | Read — `dms_ai_extraction_jobs` schema |
| `supabase/migrations/20260614191500_erp_settings_1_*.sql` | Read — `erp_ai_usage_logs`, `erp_ai_feature_flags` |
| `supabase/migrations/20260622103000_erp_dms_ai_phase4_*.sql` | Read — `dms_approve_runs` |
| `.cursor/rules/erp-ai-settings-standard.mdc` | Read — AI provider rules |

Missing files (not found in codebase):
- `ERP_DMS_AI_A_TO_Z_AUDIT_FUNCTION_MAP_AND_ENHANCEMENT_PLAN.md`
- `ERP_DMS_AI_FULL_AUDIT_AND_ENHANCEMENT_PLAN.md`
- `ALGT_ERP_CURSOR_PHASE_PROMPT_MASTER_STANDARD_V2.md`
- `erp-rls-standard.mdc`, `erp-audit-log-standard.mdc`, `erp-form-standard.mdc`, `erp-table-list-standard.mdc`

---

## 5. Phase 1–8 Output Reviewed

| Phase | Relevant Output |
|-------|----------------|
| Phase 4 | `dms_approve_runs` table; transactional RPC `approve_dms_intake_session` |
| Phase 5 | Post-approve orchestration trigger; inline pipeline runner; `orchestration_source`, `approve_run_id` columns on `dms_upload_sessions` |
| Phase 6 | `applyAiAnalysisToMetadata()` — synchronous server action; `dms_ai_metadata_apply_runs/items` |
| Phase 7 | `dms_ai_metadata_apply_runs/items` — apply history; non-fatal write pattern |
| Phase 8 | `dms_metadata_erp_mappings`; `getDmsErpMappingPreview` — read-only, no writes |

---

## 6. Current AI Job and Workflow Inventory

### A. Post-Approval Orchestration Pipeline

| Property | Value |
|----------|-------|
| Function | `triggerDmsPostApproveOrchestration()` → `runDmsAiOrchestrationPostDraft()` |
| Trigger | Called from `runApproveAiIntakeSaga()` (Phase 4 approve) after transaction commits |
| Sync/Async | **Synchronous inline** — runs to completion in the approval server action |
| Steps | content_sync, ai_summary, intelligence, embedding, tag_suggestions, link_suggestions |
| Status tracking | `dms_upload_sessions.orchestration_status`, `orchestration_steps_json` (JSONB) |
| Feature flag | `DMS_AI_ORCHESTRATION` in `erp_ai_feature_flags` |
| Retry | No auto-retry; `retryOrchestrationStep` is a manual user action |
| Failure | Non-fatal; pipeline failure does not roll back approval |
| Safe to queue | **Yes** — already designed as best-effort; approval success is independent |

### B. `runDmsAiAnalysisForDocument`

| Property | Value |
|----------|-------|
| Function | `runDmsAiAnalysisForDocument()` |
| Trigger | User clicks "Run AI Analysis" in document record |
| Sync/Async | **Synchronous** — creates job row, runs immediately, returns result |
| Tables | `dms_ai_extraction_jobs` (job row), `dms_ai_extraction_results` (result) |
| Feature flag | `DMS_AI_ORCHESTRATION` (currently reused) |
| Retry | `retryDmsAiAnalysisJob` — creates new job, runs immediately |
| Failure | Returns error to UI; job remains in `failed` status |
| Safe to queue | **Yes, second wave** — needs UI status polling pattern |

### C. Content Sync Step

| Property | Value |
|----------|-------|
| Function | `writeDocumentContentTextSystem()` (called from orchestration) |
| Sync/Async | Synchronous inline inside pipeline |
| Safe to queue | Yes (first wave) |

### D. AI Summary

| Property | Value |
|----------|-------|
| Function | `generateAndSaveDmsAiSummary()` |
| Sync/Async | Synchronous inline |
| Safe to queue | Yes (first wave) |

### E. AI Intelligence

| Property | Value |
|----------|-------|
| Function | `evaluateDmsDocumentIntelligence()` |
| Sync/Async | Synchronous inline |
| Safe to queue | Yes (first wave) |

### F. Embedding Generation

| Property | Value |
|----------|-------|
| Function | `generateDmsDocumentEmbedding()` |
| Sync/Async | Synchronous inline |
| Safe to queue | Yes (first wave) |

### G. Tag Suggestions

| Property | Value |
|----------|-------|
| Function | `suggestDmsDocumentTags()` |
| Sync/Async | Synchronous inline |
| Safe to queue | Yes (first wave) |

### H. Link Suggestions

| Property | Value |
|----------|-------|
| Function | `suggestDmsDocumentLinks()` |
| Sync/Async | Synchronous inline |
| Safe to queue | Yes (first wave) |

### I. AI Intake Classification + Extraction

| Property | Value |
|----------|-------|
| Function | `startAiIntakeFromUploadSession()` |
| Sync/Async | Synchronous — user waits on intake review page |
| User dependency | User MUST see result before they can review/approve |
| Safe to queue | **No — must remain synchronous for now** |

### J. Document Q&A / AI Search

| Property | Value |
|----------|-------|
| Function | `askDocumentQuestion()`, `searchDocumentsAi()` |
| Safe to queue | No — user expects immediate response |

---

## 7. Current Job Tables Audit

### `dms_ai_extraction_jobs`

**Confirmed columns:**
```
id, upload_session_id, document_id, provider_config_id
job_type (ocr | classification | extraction | full_pipeline)
provider, model
status (pending | queued | processing | completed | failed | cancelled)
started_at, completed_at, duration_ms, error_message
retry_count
created_by, created_at, updated_at
```

**Additional columns from DMS.10 migration:**
```
run_source (intake | manual | retry | orchestration)
input_text_hash
prompt_version
```

**Missing for generic queue use:**
- `run_after` — no delay/scheduled retry support
- `locked_by` / `locked_at` — no concurrency locking
- `idempotency_key` — no deduplication
- `priority` — no ordering
- `max_attempts` — no retry cap
- `payload_json` — no generic job input
- `safe_error_json` — structured error storage missing

**Assessment:** Too extraction-specific. Covers only 4 job types (ocr, classification, extraction, full_pipeline). Cannot safely serve as a generic queue for orchestration, summary, embedding, tags, links, ERP mapping. **Do not repurpose.**

---

### `dms_ai_extraction_results`

Stores AI extraction outputs with `extracted_fields_json`, `suggested_links_json`, `raw_ocr_text`, `raw_response_json`. Referenced by Phase 6 apply-to-metadata. **Keep as-is; result storage only.**

---

### `erp_ai_usage_logs`

```
id, provider_config_id, feature_area, operation_type, model_id
status (success | failed | skipped)
input_token_count, output_token_count, estimated_cost, duration_ms
error_message, metadata_json
created_by, created_at
```

**Assessment:** Good token/cost tracking foundation. Phase 9 job attempts should write to this table (via existing pattern) when AI calls succeed/fail. **Reuse — do not replace.**

---

### `erp_ai_feature_flags`

```
id, feature_code (UNIQUE), feature_name, description
is_enabled (default false), requires_human_review (default true)
min_confidence_threshold, notes, created_at, updated_at
```

**Existing DMS AI flags confirmed:**
- `DMS_OCR`
- `DMS_CLASSIFICATION`
- `DMS_EXTRACTION`
- `DMS_AI_REVIEW`
- `DMS_AI_ORCHESTRATION`

**Phase 9 new flags needed:** `DMS_AI_JOB_QUEUE`, `DMS_AI_JOB_QUEUE_WORKER_ENABLED`

---

### `dms_ai_metadata_apply_runs` / `dms_ai_metadata_apply_items`

Phase 7 tables. Operational read-model only. Not relevant to job queue. **Keep unchanged.**

---

### `dms_metadata_erp_mappings`

Phase 8 table. Read-only preview. Not relevant to job queue. **Keep unchanged.**

---

### `dms_approve_runs`

Phase 4 table. Tracks approval transactions. Referenced by `post-approve-orchestration.ts` for `approveRunId` linkage. Phase 9 queue job rows should have a `related_approve_run_id` FK for traceability.

---

## 8. Queue Architecture Options Compared

| Option | Description | Verdict |
|--------|-------------|---------|
| A — Extend `dms_ai_extraction_jobs` | Add queue columns to existing table | **Rejected** — too extraction-specific; would corrupt semantics |
| **B — New `dms_ai_job_queue`** | Generic queue table for all DMS AI jobs | **Partial — combined with C** |
| **C — New queue + keep legacy tables** | `dms_ai_job_queue` for workflow execution; keep `dms_ai_extraction_jobs` + `dms_ai_extraction_results` for extraction history | **Recommended** |

---

## 9. Recommended Queue Architecture

**Option C — Generic `dms_ai_job_queue` + preserve existing tables**

Rationale:
1. `dms_ai_extraction_jobs` is already in use and referenced by `dms_ai_extraction_results` (CASCADE FK). Repurposing it would break existing Phase 6 apply-to-metadata history.
2. The new queue needs columns (`run_after`, `locked_by`, `priority`, `idempotency_key`, `payload_json`) that would be meaningless noise on the extraction jobs table.
3. New table has clear purpose: workflow execution queue. Old table has clear purpose: extraction job audit trail. Both can coexist.
4. The queue job for an AI analysis run can reference the extraction result via `related_ai_result_id` FK once complete.

---

## 10. Workflow Runner Options Compared

| Option | Description | Verdict |
|--------|-------------|---------|
| A — Server Action Poll | Admin manually calls `processNextDmsAiJob()` | Too manual; not production-grade |
| B — Supabase Cron + Edge Function | Supabase pg_cron calls Edge Function | Complex deployment; Edge runtime limitations (no heavy Node libs) |
| **C — Protected Next.js Route Handler** | `POST /api/internal/dms-ai-jobs/process` called by cron or manual trigger | **Recommended for Phase 9** |
| D — External Worker | External Node.js process consuming queue | Future option; too complex for Phase 9 |

---

## 11. Recommended Runner Strategy

**Phase 9A: Protected Next.js Route Handler worker + manual/scheduled trigger**

```
POST /api/internal/dms-ai-jobs/process
  ← Authorization: Bearer WORKER_SECRET
  ← Body: { limit: 5, workerId: "cron-01" }

Route handler:
  1. Verify WORKER_SECRET
  2. Call claimDmsAiJobs() via Postgres RPC (SKIP LOCKED)
  3. For each claimed job: runDmsAiJobHandler(job)
  4. Return processed/failed counts
```

**Phase 9B (deployment):** Wire the route to Supabase `pg_cron` via a database webhook or HTTP call, or call from Vercel Cron. The route is implementation-agnostic — any cron that can hit it with the secret works.

**Why Postgres RPC for claiming:**
- `SELECT ... FOR UPDATE SKIP LOCKED` is the safest concurrency primitive
- Postgres handles atomicity — no race condition between two workers
- Node.js TypeScript handles business logic where it belongs
- Already proven pattern in production job queues

**Why not Edge Function:**
- The job handlers call existing Next.js server action utilities that import Node modules (`@supabase/ssr`, etc.)
- Rewriting handlers for Edge runtime would require significant refactoring
- Route handler runs in Node.js runtime with full library access

---

## 12. Job Types and Payload Design

### Job type registry file

```
src/lib/dms/ai-jobs/job-types.ts
```

### Phase 9 First Wave (implement)

| Job Type | Payload | Handler Function | Max Attempts | Feature Flag |
|----------|---------|-----------------|-------------|-------------|
| `post_approve_orchestration` | `{ sessionCode, documentId, uploadSessionId, approveRunId, source }` | Existing `runDmsAiOrchestrationPostDraft()` | 3 | `DMS_AI_JOB_QUEUE` |
| `ai_summary` | `{ documentId, uploadSessionId? }` | Existing `generateAndSaveDmsAiSummary()` | 3 | `DMS_AI_JOB_QUEUE` |
| `ai_intelligence` | `{ documentId }` | Existing `evaluateDmsDocumentIntelligence()` | 3 | `DMS_AI_JOB_QUEUE` |
| `embedding` | `{ documentId }` | Existing `generateDmsDocumentEmbedding()` | 2 | `DMS_AI_JOB_QUEUE` |
| `tag_suggestions` | `{ documentId }` | Existing `suggestDmsDocumentTags()` | 2 | `DMS_AI_JOB_QUEUE` |
| `link_suggestions` | `{ documentId }` | Existing `suggestDmsDocumentLinks()` | 2 | `DMS_AI_JOB_QUEUE` |
| `content_sync` | `{ documentId, uploadSessionId? }` | Existing `writeDocumentContentTextSystem()` | 2 | `DMS_AI_JOB_QUEUE` |

### Phase 9 Second Wave (plan but defer)

| Job Type | Status |
|----------|--------|
| `ai_analysis` | Defer — needs UI status polling change |
| `ocr_extract` | Defer — intake is synchronous; user waits |
| `intake_classify` | Defer — user-critical; too risky before runner is proven |
| `intake_extract_metadata` | Defer |
| `semantic_chunking` | Defer — Phase 12 |
| `azure_ocr` | Defer — Phase 11 |
| `erp_mapping_apply` | Defer — Phase 10 |

### Payload design rules

```
Payload stores IDs and small control metadata only.
No OCR text, prompts, AI responses, or document content in payload.
Max payload size: ~1 KB for IDs and flags.
```

Example valid payload:
```json
{ "sessionCode": "DMS-SESS-0042", "documentId": 17, "uploadSessionId": 8, "approveRunId": 3, "source": "single_file_approve" }
```

---

## 13. Queue Table Design

### `dms_ai_job_queue`

```sql
CREATE TABLE public.dms_ai_job_queue (
  id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_type                  TEXT NOT NULL,
  job_status                TEXT NOT NULL DEFAULT 'queued',
    -- queued | running | retry_scheduled | completed | failed | cancelled | superseded
  priority                  INT  NOT NULL DEFAULT 100,
    -- lower = higher priority; 1 = critical, 100 = normal, 500 = background
  payload_json              JSONB NOT NULL DEFAULT '{}',
    -- IDs and control flags ONLY. No OCR text, prompts, or document content.
  idempotency_key           TEXT UNIQUE,
    -- prevents duplicate enqueueing for same logical job
  related_document_id       BIGINT REFERENCES public.dms_documents(id) ON DELETE SET NULL,
  related_upload_session_id BIGINT REFERENCES public.dms_upload_sessions(id) ON DELETE SET NULL,
  related_ai_result_id      BIGINT REFERENCES public.dms_ai_extraction_results(id) ON DELETE SET NULL,
  related_approve_run_id    BIGINT REFERENCES public.dms_approve_runs(id) ON DELETE SET NULL,
  attempt_count             INT  NOT NULL DEFAULT 0,
  max_attempts              INT  NOT NULL DEFAULT 3,
  locked_by                 TEXT,    -- worker_id that claimed the job
  locked_at                 TIMESTAMPTZ,
  run_after                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at                TIMESTAMPTZ,
  completed_at              TIMESTAMPTZ,
  failed_at                 TIMESTAMPTZ,
  last_error_code           TEXT,
    -- sanitized error code: 'provider_timeout' | 'provider_not_configured' | 'feature_disabled' | 'unexpected'
  last_error_message        TEXT,    -- safe, sanitized user-facing message; no raw stack traces
  safe_error_json           JSONB,   -- structured safe metadata; no prompts/OCR
  created_by                BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Indexes

```sql
CREATE INDEX idx_dms_ai_job_queue_claim
  ON public.dms_ai_job_queue(job_status, run_after, priority)
  WHERE job_status IN ('queued', 'retry_scheduled');

CREATE INDEX idx_dms_ai_job_queue_document
  ON public.dms_ai_job_queue(related_document_id)
  WHERE related_document_id IS NOT NULL;

CREATE INDEX idx_dms_ai_job_queue_session
  ON public.dms_ai_job_queue(related_upload_session_id)
  WHERE related_upload_session_id IS NOT NULL;

CREATE INDEX idx_dms_ai_job_queue_type_status
  ON public.dms_ai_job_queue(job_type, job_status);

CREATE INDEX idx_dms_ai_job_queue_locked_at
  ON public.dms_ai_job_queue(locked_at)
  WHERE locked_at IS NOT NULL;
```

### RLS

```
ENABLE ROW LEVEL SECURITY + FORCE ROW LEVEL SECURITY

SELECT:
  dms.documents.ai.view | dms.documents.review_ai | dms.admin | system_admin | group_admin

INSERT:
  Server actions use createAdminClient() after explicit permission checks
  Direct INSERT policy: dms.admin | system_admin only (guards against direct API access)

UPDATE:
  Worker route uses createAdminClient() with verified WORKER_SECRET
  Direct UPDATE policy: dms.admin | system_admin only

No anonymous access.
No USING (true).
```

---

## 14. Job Attempt / Event Logging Design

### Recommendation: Add `dms_ai_job_attempts`

Phase 14 observability requires per-attempt data (token counts, cost, duration per attempt). Adding the table in Phase 9 is lower cost than retrofitting it in Phase 14.

```sql
CREATE TABLE public.dms_ai_job_attempts (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id          BIGINT NOT NULL
                    REFERENCES public.dms_ai_job_queue(id) ON DELETE CASCADE,
  attempt_number  INT NOT NULL,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  status          TEXT NOT NULL,
    -- completed | failed | timed_out
  duration_ms     INT,
  error_code      TEXT,
  safe_error_message TEXT,
  worker_id       TEXT,
  -- Token tracking (filled by handler when erp_ai_usage_logs row is created)
  usage_log_id    BIGINT REFERENCES public.erp_ai_usage_logs(id) ON DELETE SET NULL,
  token_count_in  INT,
  token_count_out INT,
  model_name      TEXT,
  provider_code   TEXT,
  cost_estimate   NUMERIC(12, 6)
);

CREATE INDEX idx_dms_ai_job_attempts_job_id ON public.dms_ai_job_attempts(job_id);
CREATE INDEX idx_dms_ai_job_attempts_started ON public.dms_ai_job_attempts(started_at DESC);
```

**No raw OCR, prompts, AI responses, or document content in attempts table.**

---

## 15. Runner Locking and Concurrency Plan

### Postgres RPC: `claim_dms_ai_jobs`

```sql
CREATE OR REPLACE FUNCTION public.claim_dms_ai_jobs(
  p_worker_id TEXT,
  p_limit     INT DEFAULT 5
)
RETURNS SETOF public.dms_ai_job_queue
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.dms_ai_job_queue
  SET
    job_status = 'running',
    locked_by  = p_worker_id,
    locked_at  = NOW(),
    started_at = COALESCE(started_at, NOW()),
    updated_at = NOW()
  WHERE id IN (
    SELECT id
    FROM public.dms_ai_job_queue
    WHERE job_status IN ('queued', 'retry_scheduled')
      AND run_after <= NOW()
    ORDER BY priority ASC, run_after ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;
```

### `complete_dms_ai_job`

```sql
CREATE OR REPLACE FUNCTION public.complete_dms_ai_job(
  p_job_id BIGINT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.dms_ai_job_queue
  SET job_status   = 'completed',
      completed_at = NOW(),
      locked_by    = NULL,
      locked_at    = NULL,
      updated_at   = NOW()
  WHERE id = p_job_id;
END;
$$;
```

### `fail_dms_ai_job`

```sql
CREATE OR REPLACE FUNCTION public.fail_dms_ai_job(
  p_job_id         BIGINT,
  p_error_code     TEXT,
  p_error_message  TEXT,
  p_retry          BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_attempt_count INT;
  v_max_attempts  INT;
  v_backoff_minutes INT;
BEGIN
  SELECT attempt_count, max_attempts
  INTO v_attempt_count, v_max_attempts
  FROM public.dms_ai_job_queue WHERE id = p_job_id;

  IF p_retry AND (v_attempt_count + 1) < v_max_attempts THEN
    -- Exponential backoff: 1m → 5m → 30m
    v_backoff_minutes := CASE v_attempt_count
      WHEN 0 THEN 1
      WHEN 1 THEN 5
      ELSE 30
    END;

    UPDATE public.dms_ai_job_queue
    SET job_status        = 'retry_scheduled',
        attempt_count     = attempt_count + 1,
        run_after         = NOW() + (v_backoff_minutes || ' minutes')::INTERVAL,
        last_error_code   = p_error_code,
        last_error_message= p_error_message,
        locked_by         = NULL,
        locked_at         = NULL,
        updated_at        = NOW()
    WHERE id = p_job_id;
  ELSE
    UPDATE public.dms_ai_job_queue
    SET job_status        = 'failed',
        attempt_count     = attempt_count + 1,
        failed_at         = NOW(),
        last_error_code   = p_error_code,
        last_error_message= p_error_message,
        locked_by         = NULL,
        locked_at         = NULL,
        updated_at        = NOW()
    WHERE id = p_job_id;
  END IF;
END;
$$;
```

### Stale lock recovery

A job with `job_status = 'running'` and `locked_at < NOW() - INTERVAL '10 minutes'` is considered stale (worker crashed). A cleanup function should reset these to `retry_scheduled`:

```sql
CREATE OR REPLACE FUNCTION public.recover_stale_dms_ai_jobs(
  p_stale_after_minutes INT DEFAULT 10
)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_count INT;
BEGIN
  UPDATE public.dms_ai_job_queue
  SET job_status    = 'retry_scheduled',
      locked_by     = NULL,
      locked_at     = NULL,
      run_after     = NOW() + INTERVAL '1 minute',
      last_error_code = 'stale_lock',
      updated_at    = NOW()
  WHERE job_status = 'running'
    AND locked_at < NOW() - (p_stale_after_minutes || ' minutes')::INTERVAL
    AND attempt_count < max_attempts;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
```

Call `recover_stale_dms_ai_jobs()` at the start of each worker run.

---

## 16. Handler Architecture Plan

### Directory structure

```
src/lib/dms/ai-jobs/
  job-types.ts            — job type constants, payload schemas, config
  job-registry.ts         — maps job_type → handler
  job-runner.ts           — claimDmsAiJobs(), processNextDmsAiJobs(), runDmsAiJob()
  handlers/
    post-approve-orchestration.handler.ts
    ai-summary.handler.ts
    ai-intelligence.handler.ts
    embedding.handler.ts
    tag-suggestions.handler.ts
    link-suggestions.handler.ts
    content-sync.handler.ts

src/server/actions/dms/ai-jobs.ts
  — enqueueDmsAiJob(), enqueueUniqueDmsAiJob()
  — cancelDmsAiJob(), retryDmsAiJob()
  — getDmsAiJobStatus(), getDmsAiJobsForDocument()

src/app/api/internal/dms-ai-jobs/process/route.ts
  — POST handler, WORKER_SECRET verification, calls processNextDmsAiJobs()
  — Also exports GET for health check
```

### Handler type pattern

```typescript
// src/lib/dms/ai-jobs/job-types.ts
type DmsAiJobHandler<TPayload> = {
  jobType: string;
  schema: ZodSchema<TPayload>;
  maxAttempts: number;
  isRetryable: (errorCode: string) => boolean;
  handle(
    payload: TPayload,
    ctx: { jobId: number; workerId: string; attemptNumber: number }
  ): Promise<{ success: boolean; errorCode?: string; safeMessage?: string }>;
};
```

### Core runner functions

```typescript
// src/lib/dms/ai-jobs/job-runner.ts

// Enqueue a new job (admin client — called from server actions after auth)
async function enqueueDmsAiJob(input: EnqueueJobInput): Promise<{ jobId: number }>

// Enqueue only if idempotency_key not already queued/running
async function enqueueUniqueDmsAiJob(input: EnqueueJobInput): Promise<{ jobId: number | null; skipped: boolean }>

// Claim and process N jobs; called from worker route
async function processNextDmsAiJobs(options: { limit: number; workerId: string }): Promise<ProcessResult>

// Run a single claimed job through its handler
async function runDmsAiJob(job: DmsAiJobQueueRow): Promise<void>
```

---

## 17. Migration Strategy for Existing Flows

### First wave — post_approve_orchestration (Phase 9 implementation)

**Current behavior:**
1. User clicks Approve → `runApproveAiIntakeSaga()` → transaction commits → `triggerDmsPostApproveOrchestration()` → runs all 6 steps inline → returns total duration to UI

**New behavior with DMS_AI_JOB_QUEUE = true:**
1. User clicks Approve → `runApproveAiIntakeSaga()` → transaction commits → `enqueueUniqueDmsAiJob({ jobType: "post_approve_orchestration", ... })` → returns immediately
2. Approve action returns `{ success: true, queued: true }` to UI
3. Worker processes the job in background; each step updates `orchestration_steps_json`
4. UI polls `getOrchestrationStatus()` (already exists) to show progress

**Fallback when DMS_AI_JOB_QUEUE = false:**
- `triggerDmsPostApproveOrchestration()` called directly as before (inline)
- Zero change to existing behavior

**Rollback plan:** Set `DMS_AI_JOB_QUEUE` flag to `false` → immediate revert to inline execution.

---

### Individual step queuing (Phase 9 — same wave)

Within the `post_approve_orchestration` handler, all 6 steps run sequentially using the existing `runPipelineStepSafe()` pattern. **No change to step-level logic** — the handler is a thin wrapper that calls the existing pipeline runner.

This is the safest migration: identical step execution, just moved from inline to background.

---

### Second wave — ai_analysis (Phase 9B / defer)

**Current behavior:** User clicks "Run Analysis" → synchronous execution → result shown immediately.

**New behavior (deferred):** User clicks "Queue Analysis" → job enqueued → UI shows "Queued" status badge → worker runs → UI polls `getDmsAiAnalysisStatus()` to refresh.

Defer this wave because:
1. UI needs a new status polling pattern (job queued → running → completed)
2. Users currently expect immediate feedback on analysis
3. Worker must be proven stable on orchestration wave first

---

### Later waves (OCR/intake — do not implement in Phase 9)

Intake classification is **user-critical**: the user is on the intake review page waiting to see the classification result. Moving this to a queue would require a complete intake UX redesign with a polling/loading screen. Defer until runner is proven and UX is planned.

---

## 18. Feature Flag Plan

### New flags to insert in `erp_ai_feature_flags`

| feature_code | Default | Purpose |
|-------------|---------|---------|
| `DMS_AI_JOB_QUEUE` | `false` | Master gate: when false, all flows run inline (backward compat) |
| `DMS_AI_JOB_QUEUE_WORKER_ENABLED` | `false` | Whether the worker endpoint is enabled (separate from queue creation) |

**Rollout sequence:**
1. Deploy Phase 9 code with both flags `false` (no behavior change)
2. Admin sets `DMS_AI_JOB_QUEUE = true` → jobs enqueue instead of running inline
3. Worker not yet processing (jobs accumulate in `queued` state)
4. Admin sets `DMS_AI_JOB_QUEUE_WORKER_ENABLED = true` → worker route accepts requests
5. Wire worker route to cron → jobs process automatically

This staged rollout means a single flag flip can enable/disable queue behavior at any point.

---

## 19. UI / UX Plan

### Recommended scope: backend queue + minimal status integration

**Phase 9 UI changes:**

**1. Orchestration status card** (existing) — already reads `orchestration_status` from session. When job is queued, session shows `orchestration_status = 'pending'`. Worker updates this as before. **No UI change required** for first wave.

**2. Job status badge** (new, minimal) — a small "Queued" / "Processing" badge shown in the orchestration section header when `DMS_AI_JOB_QUEUE` is enabled and job is in-flight. Uses existing badge components.

**3. "Run Analysis" button** — unchanged in Phase 9 (second wave). Button continues to trigger synchronous analysis.

**Phase 14 (later):** Full admin AI jobs monitor screen with attempt history, token counts, cost estimates.

---

## 20. Retry and Failure Policy

### Retryable errors (should retry)

```
provider_timeout        — AI provider HTTP timeout
provider_rate_limit     — 429 Too Many Requests
provider_unavailable    — 503 / transient 5xx
network_error           — transient connectivity failure
database_error          — transient DB error (not a constraint violation)
stale_lock              — worker crash recovery
```

### Non-retryable errors (fail permanently)

```
provider_not_configured — AI feature flag disabled or no provider
permission_denied       — insufficient permissions
document_not_found      — document was deleted
document_type_mismatch  — document changed type since job was created
validation_error        — invalid payload (programming error)
max_attempts_exceeded   — exhausted retries
```

### Backoff schedule

| Attempt | Delay |
|---------|-------|
| 1st retry | +1 minute |
| 2nd retry | +5 minutes |
| 3rd retry (last) | +30 minutes |
| After max_attempts | Status → `failed` permanently |

### Safe error storage

```
last_error_code: sanitized code (never raw exception message)
last_error_message: safe user-facing message (≤ 200 chars)
safe_error_json: { code, message, attempt } — no stack traces, no OCR text, no prompts
```

---

## 21. Cost / Token Tracking Readiness

Phase 14 will build cost dashboards. Phase 9 prepares the data model.

**Job handler should write to `erp_ai_usage_logs` after each AI call** (already the existing pattern used by `evaluateDmsDocumentIntelligence`, `generateAndSaveDmsAiSummary` etc.). Phase 9 adds:

1. `dms_ai_job_attempts.usage_log_id` FK → links the attempt to the usage log row
2. `dms_ai_job_attempts.token_count_in/out`, `model_name`, `provider_code`, `cost_estimate` — copied from the usage log for quick access

No new cost tracking logic in Phase 9 — just the data model linkage.

---

## 22. Security / RLS Plan

### Queue payload safety

```
MUST store: document_id, upload_session_id, approve_run_id, session_code (IDs only)
MUST NOT store: OCR text, extraction prompts, AI responses, document content, file data, API keys
```

### Worker endpoint security

```
Route: POST /api/internal/dms-ai-jobs/process
Auth:  Authorization: Bearer ${process.env.WORKER_SECRET}
       WORKER_SECRET must be a 32+ character random secret stored only in env vars
       If header is missing or wrong → 401 immediately
Protection: No Supabase auth required on this route (it's machine-to-machine)
No public access.
Rate limit: max 1 concurrent call (Next.js route handler does not queue internally)
```

### Who can enqueue

```
Server actions after explicit permission checks (createAdminClient() used for insert)
dms.documents.upload | dms.documents.edit | dms.admin for non-admin job types
dms.admin for admin-only job types
Never from client components directly
```

### Who can view jobs

```
dms.documents.ai.view | dms.documents.review_ai | dms.admin | system_admin
```

### Who can cancel/retry

```
Cancel: dms.admin or system_admin
Retry: dms.documents.ai.run | dms.admin
```

---

## 23. Backward Compatibility Plan

| Existing feature | Impact |
|-----------------|--------|
| Phase 4 approve RPC | No change — `runApproveAiIntakeSaga()` still calls the same transaction; only post-commit hook changes |
| Phase 5 inline orchestration | Preserved when `DMS_AI_JOB_QUEUE = false` |
| Phase 6 apply-to-metadata | No change — user-triggered synchronous action |
| Phase 7 apply history | No change |
| Phase 8 ERP mapping preview | No change |
| `dms_ai_extraction_jobs` table | Kept; new jobs continue to be created there for analysis runs |
| `retryOrchestrationStep` | Kept as manual fallback even when queue is enabled |
| `DMS_AI_ORCHESTRATION` feature flag | Kept; still checked inside pipeline steps |

---

## 24. Recommended Corrected Phase 9 Implementation Scope

```
✓ Migration: dms_ai_job_queue + dms_ai_job_attempts + RLS
✓ Migration: Postgres RPCs (claim, complete, fail, recover_stale)
✓ Feature flag rows: DMS_AI_JOB_QUEUE, DMS_AI_JOB_QUEUE_WORKER_ENABLED
✓ src/lib/dms/ai-jobs/job-types.ts — type registry for Phase 9 first wave
✓ src/lib/dms/ai-jobs/job-registry.ts — handler map
✓ src/lib/dms/ai-jobs/job-runner.ts — enqueue, processNextDmsAiJobs, runDmsAiJob
✓ src/lib/dms/ai-jobs/handlers/ — 7 handlers (first wave)
✓ src/server/actions/dms/ai-jobs.ts — enqueueDmsAiJob, enqueueUniqueDmsAiJob, getDmsAiJobsForDocument, cancelDmsAiJob
✓ src/app/api/internal/dms-ai-jobs/process/route.ts — protected worker endpoint
✓ Modify post-approve-orchestration.ts — conditional queue vs inline
✓ Query keys for job queue status
✓ Minimal status badge in orchestration card
✓ Source of truth update
✓ Implementation report

✗ ai_analysis job type (second wave — defer)
✗ intake/OCR job types (later — must remain synchronous)
✗ Admin job monitor dashboard (Phase 14)
✗ Token/cost dashboard (Phase 14)
✗ Apply-to-ERP writes (Phase 10)
✗ Semantic chunking (Phase 12)
✗ Azure OCR (Phase 11)
```

---

## 25. Implementation Sequence for Future Corrected Phase 9 Execution

```
Step 0:  Review this plan + Phase 5 orchestration code + ai-analysis.ts
Step 1:  Migration — dms_ai_job_queue + dms_ai_job_attempts + indexes + RLS
Step 2:  Migration — Postgres RPCs (claim, complete, fail, recover_stale)
Step 3:  Migration — Insert DMS_AI_JOB_QUEUE + DMS_AI_JOB_QUEUE_WORKER_ENABLED feature flags
Step 4:  Create src/lib/dms/ai-jobs/job-types.ts — types, schemas, constants
Step 5:  Create src/lib/dms/ai-jobs/handlers/ — 7 handler files
Step 6:  Create src/lib/dms/ai-jobs/job-registry.ts
Step 7:  Create src/lib/dms/ai-jobs/job-runner.ts
Step 8:  Create src/server/actions/dms/ai-jobs.ts — server actions
Step 9:  Create src/app/api/internal/dms-ai-jobs/process/route.ts
Step 10: Modify post-approve-orchestration.ts — conditional enqueue vs inline
Step 11: Add query keys
Step 12: Add minimal job status badge to orchestration card UI
Step 13: npx tsc --noEmit (must exit 0)
Step 14: Update source of truth + create implementation report
```

---

## 26. Acceptance Criteria for Future Implementation

| AC | Criterion |
|----|-----------|
| AC-01 | `dms_ai_job_queue` supports all 7 Phase 9 first-wave job types |
| AC-02 | Queue payload stores only IDs and control flags — no OCR text or prompts |
| AC-03 | `claim_dms_ai_jobs` RPC uses `SKIP LOCKED` — prevents double processing |
| AC-04 | Jobs retry with exponential backoff up to `max_attempts` |
| AC-05 | Failed jobs have safe `last_error_code` + `last_error_message` — no raw stack trace |
| AC-06 | Post-approval orchestration enqueues when `DMS_AI_JOB_QUEUE = true` |
| AC-07 | Phase 4 approve transaction unchanged — only post-commit hook differs |
| AC-08 | Phase 6 apply-to-metadata unchanged |
| AC-09 | Phase 8 ERP mapping preview unchanged |
| AC-10 | `DMS_AI_JOB_QUEUE = false` → falls back to inline execution (zero regression) |
| AC-11 | Worker route requires `WORKER_SECRET` header — returns 401 without it |
| AC-12 | `npx tsc --noEmit` exits 0 |

---

## 27. Full Test Plan

### TC-01 — Enqueue unique job; no duplicate on same idempotency_key
- **Purpose:** Prevent duplicate orchestration runs for the same approval
- **Setup:** Document approved, `post_approve_orchestration` job enqueued with `idempotency_key = "orch_session_DMS-SESS-0042"`
- **Steps:** Enqueue same job again with same idempotency_key
- **Expected:** Second call returns `{ skipped: true }` — no new row inserted
- **DB state:** One row in `dms_ai_job_queue` with status `queued`
- **Risk:** AC-03 (double processing)

---

### TC-02 — claim_dms_ai_jobs prevents double processing
- **Purpose:** Two workers run simultaneously; each should claim different jobs
- **Steps:** Insert 2 queued jobs, two concurrent calls to `claim_dms_ai_jobs(workerId, 1)`
- **Expected:** Worker A claims job 1; Worker B claims job 2; no overlap
- **DB state:** Two rows with `job_status = 'running'`, different `locked_by` values
- **Risk:** AC-03

---

### TC-03 — Job completes successfully
- **Steps:** Enqueue `content_sync` job → worker claims → handler runs `writeDocumentContentTextSystem()` → calls `complete_dms_ai_job()`
- **Expected:** Row has `job_status = 'completed'`, `completed_at` set, `locked_by = null`
- **DB state:** `dms_ai_job_attempts` row inserted with `status = 'completed'`, `duration_ms` set
- **Risk:** AC-04

---

### TC-04 — Job fails and schedules retry (retryable error)
- **Steps:** Enqueue job → handler returns `{ success: false, errorCode: 'provider_timeout' }` → `fail_dms_ai_job(retryable = true)`
- **Expected:** `job_status = 'retry_scheduled'`, `attempt_count = 1`, `run_after = now + 1m`, `last_error_code = 'provider_timeout'`
- **Risk:** AC-04, AC-05

---

### TC-05 — Job fails permanently after max attempts
- **Setup:** `max_attempts = 3`; three consecutive provider_timeout failures
- **Expected:** After 3rd failure, `job_status = 'failed'`, `failed_at` set, `attempt_count = 3`
- **DB state:** Three `dms_ai_job_attempts` rows for this job
- **Risk:** AC-04

---

### TC-06 — Stale lock recovery
- **Setup:** Job in `running` state with `locked_at = NOW() - 15 minutes`
- **Steps:** Call `recover_stale_dms_ai_jobs(10)`
- **Expected:** Job moves to `retry_scheduled`, `locked_by = null`, `last_error_code = 'stale_lock'`
- **Risk:** AC-03

---

### TC-07 — Post-approval orchestration queues when flag enabled
- **Setup:** `DMS_AI_JOB_QUEUE = true`; approve a document
- **Expected:** `post_approve_orchestration` job enqueued; approval returns immediately without waiting for pipeline
- **DB state:** Job row in queue; `dms_upload_sessions.orchestration_status` = remains `pending` until worker runs
- **Risk:** AC-06, AC-07

---

### TC-08 — Queue disabled falls back to inline
- **Setup:** `DMS_AI_JOB_QUEUE = false`; approve a document
- **Expected:** Existing inline behavior; orchestration runs in the same request; no queue row created
- **DB state:** No `dms_ai_job_queue` row created
- **Risk:** AC-10

---

### TC-09 — AI Analysis unchanged (not queued)
- **Setup:** `DMS_AI_JOB_QUEUE = true`; user clicks Run Analysis
- **Expected:** `runDmsAiAnalysisForDocument()` still runs synchronously (second wave not implemented); result returned immediately
- **Risk:** AC-08

---

### TC-10 — Unauthorized user cannot view jobs
- **Setup:** User with no DMS permissions
- **Steps:** Call `getDmsAiJobsForDocument(documentId)`
- **Expected:** Permission denied
- **Risk:** AC-11 (RLS)

---

### TC-11 — Worker route requires WORKER_SECRET
- **Steps:** POST to `/api/internal/dms-ai-jobs/process` without `Authorization` header
- **Expected:** HTTP 401
- **Risk:** AC-11 (worker security)

---

### TC-12 — No raw OCR/prompt in queue payload
- **Steps:** Inspect all handler `enqueue*` calls; verify `payload_json`
- **Expected:** Payload contains only numeric IDs, string codes, and boolean flags
- **Risk:** AC-02 (data safety)

---

### TC-13 — Typecheck
- `npx tsc --noEmit` → exit code 0
- **Risk:** AC-12

---

### TC-14 — Build
- `npm run build` → no errors
- **Risk:** AC-12

---

## 28. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Worker route is never called (no cron set up) | Medium | Jobs accumulate in `queued` state | Admin can call route manually; jobs do not fail; flag can be disabled |
| Worker timeout: job marked `running` but route handler hits Next.js timeout limit | Medium | Stale lock | `recover_stale_dms_ai_jobs` runs at start of each worker call; 10-min recovery window |
| Race: two workers claim the same job (SKIP LOCKED fails somehow) | Very Low | Double execution | Idempotent handlers; `complete_dms_ai_job` is idempotent (UPDATE on specific id) |
| Existing `triggerDmsPostApproveOrchestration` called twice after migration | Low | Duplicate job | `enqueueUniqueDmsAiJob` with idempotency_key prevents duplicate |
| `dms_ai_job_queue` table not in Supabase generated types | Confirmed | TypeScript cast needed | `unknown[]` cast pattern (Phase 7/8 precedent) until types regenerated |
| New RPC functions not available in Supabase client types | Confirmed | Use `rpc()` with explicit typing | `adminClient.rpc('claim_dms_ai_jobs', ...)` with manual type cast |
| Phase 4 approve RPC transaction rolled back after enqueue | Very Low | Orphan job in queue | Job handler checks document still exists; if not found → non-retryable fail |

---

## 29. What Must Not Be Implemented in Corrected Phase 9

```
✗ Apply-to-ERP writes (Phase 10)
✗ Semantic chunking (Phase 12)
✗ Azure OCR implementation (Phase 11)
✗ Review queue UI activation (Phase 13)
✗ Token/cost dashboard (Phase 14)
✗ Full admin observability dashboard (Phase 14)
✗ Moving intake OCR/classification to queue (user-critical; too risky before runner is proven)
✗ Changing Phase 4 approve RPC or transaction
✗ Changing Phase 6 apply-to-metadata behavior
✗ ai_analysis job type (second wave — defer to Phase 9B)
✗ Auto-approval
✗ Auto-save AI suggestions
✗ Raw OCR/prompt storage in queue payload or error fields
✗ Public unprotected worker endpoint
✗ Major UI redesign
```

---

## 30. Corrected Roadmap After Phase 9

```
Corrected Phase 9  — Async AI Job Queue + Workflow Runner            ← THIS PHASE
Corrected Phase 10 — Apply-to-ERP Records (ERP mapping writes)
Corrected Phase 11 — OCR Pipeline Upgrade / Azure OCR
Corrected Phase 12 — Semantic Chunking and Embeddings (uses Phase 9 queue)
Corrected Phase 13 — Review Queue Activation
Corrected Phase 14 — Observability: Token/Cost/Job Attempts Dashboard
Corrected Phase 15 — Validation, Conflict Detection, Owner Matching
Corrected Phase 16 — Testing, Performance, Hardening
```

---

## 31. Recommended Next Cursor Implementation Prompt

```
ERP_DMS_AI_CORRECTED_PHASE_9_ASYNC_JOB_QUEUE_WORKFLOW_RUNNER_IMPLEMENTATION_PROMPT.md
```

The prompt should:
1. Reference this plan (Section 25 — Implementation Sequence)
2. Specify migration filename pattern: `20260622150000_erp_dms_ai_phase9_job_queue.sql`
3. Specify RPC migration: `20260622151000_erp_dms_ai_phase9_job_queue_rpcs.sql`
4. Reference `src/lib/dms/ai-jobs/` as the new module directory
5. Require WORKER_SECRET env var documentation in implementation report
6. Reference `unknown[]` cast pattern for new table queries (types not regenerated)
7. Require explicit verification that `DMS_AI_JOB_QUEUE = false` restores inline behavior
8. Require `npx tsc --noEmit` exits 0
9. Prohibit any ERP write, OCR implementation, semantic chunking

---

## 32. Final Recommendation

**Phase 9 = database queue + protected route handler + first wave offload (post-approval orchestration).**

This is the right balance of impact vs risk:
1. **Highest value first**: the post-approval orchestration pipeline is the longest-running inline AI task. Offloading it eliminates the UX freeze on document approval.
2. **Zero regression risk**: feature flag `DMS_AI_JOB_QUEUE = false` restores exact original behavior instantly.
3. **Foundation for everything else**: Phase 12 semantic chunking, Phase 14 observability, and Phase 10 ERP writes all depend on a reliable async queue. Building it now unblocks the full roadmap.
4. **Conservative scope**: AI analysis re-run stays synchronous in Phase 9 — users expect immediate feedback, and the runner must be proven stable first.
5. **The `dms_ai_job_attempts` table** costs very little to add now and avoids a painful schema migration when Phase 14 needs per-attempt cost data.
