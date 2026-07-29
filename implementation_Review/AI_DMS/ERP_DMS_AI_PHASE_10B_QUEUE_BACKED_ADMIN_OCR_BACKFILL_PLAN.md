# ERP DMS AI Phase 10B — Queue-backed Admin OCR Backfill Plan

**Phase:** ERP DMS AI Phase 10B  
**Type:** Planning only — no implementation  
**Date:** 2026-06-24  
**Depends on:** Phase 9 migrations applied, Phase 10A applied (confirmed by user)  
**Prepared by:** Senior ERP / DMS / OCR / AI / Queue Architect

---

## 1. Executive Summary

Phase 10B replaces the current synchronous admin OCR backfill (`adminBackfillMissingOcrText`) with a queue-backed approach using the Phase 9 `dms_ai_job_queue` infrastructure and the Phase 10A `routeOcr()` router.

**Current problem:** `adminBackfillMissingOcrText` processes up to 50 files synchronously in a single server action — downloading each file, calling GPT-4.1, and persisting results inline. For large document sets, this can timeout and leaves no observability or retry capability.

**Phase 10B solution:**
- Admin runs backfill → server action enqueues `ocr_backfill` jobs (one per file) instead of processing inline
- Each job is processed by the Phase 9 worker route (`/api/internal/dms-ai-jobs/process`) using `routeOcr()` (Phase 10A three-tier routing: local → Azure → GPT)
- Phase 9 retry/error/idempotency infrastructure handles failures and duplicates
- Admin UI shows queued/skipped/failed counts; existing job status infra shows per-job status

**Key design decision:** The existing `adminBackfillMissingOcrText` is extended with a `mode` parameter (`"dry_run" | "enqueue" | "inline"`) rather than replaced, preserving backward compatibility. `"enqueue"` becomes the new default when `DMS_OCR_BACKFILL_QUEUE=true`.

**New shared service:** `src/lib/dms/ocr/process-file-ocr.ts` extracts the common logic (download → routeOcr → persist) used by both `triggerDmsOcrForFile` and the new `ocr_backfill` handler — eliminating duplication.

---

## 2. Planning Scope and Non-Implementation Rule

This document is a **planning-only artifact**. No source code, migrations, or schema changes have been made.

**Cursor may in Phase 10B implementation:**
- Create `src/lib/dms/ocr/process-file-ocr.ts` (shared OCR processing service)
- Create `src/lib/dms/ai-jobs/handlers/ocr-backfill.handler.ts`
- Modify `src/lib/dms/ai-jobs/job-types.ts` — add `OCR_BACKFILL` job type + payload schema
- Modify `src/lib/dms/ai-jobs/job-registry.ts` — register `ocrBackfillHandler`
- Modify `src/server/actions/dms/intelligence-admin.ts` — extend `adminBackfillMissingOcrText` with mode
- Modify `src/features/dms/admin/dms-intelligence-admin-page-client.tsx` — add Enqueue mode UI
- Create migration: `DMS_OCR_BACKFILL_QUEUE` feature flag
- Optionally refactor `triggerDmsOcrForFile` to use the shared service

**Cursor must NOT in Phase 10B:**
- Change OCR router routing rules (bug fixes excepted)
- Move intake OCR to queue
- Add Apply-to-ERP writes
- Add semantic chunking
- Add review queue
- Add token/cost dashboard
- Add full observability dashboard
- Auto-approve or auto-save metadata
- Store raw OCR text in queue payload
- Store raw Azure/GPT responses
- Add new DMS file schema columns
- Major UI redesign

---

## 3. Files and Source-of-Truth Reviewed

| File | Status | Key Finding |
|------|--------|-------------|
| `src/lib/dms/ai-jobs/job-types.ts` | ✅ Read | `OCR_BACKFILL` not yet defined; stub comment `OCR_EXTRACT`/`AZURE_OCR` present as future |
| `src/lib/dms/ai-jobs/job-runner.ts` | ✅ Read | `enqueueUniqueDmsAiJob`, `processNextDmsAiJobs`, `runDmsAiJob` — all correct for reuse |
| `src/lib/dms/ai-jobs/job-registry.ts` | ✅ Read | Only `post_approve_orchestration` registered; ready for addition |
| `src/lib/dms/ai-jobs/handlers/post-approve-orchestration.handler.ts` | ✅ Read | Template for new handler |
| `src/server/actions/dms/ai-jobs.ts` | ✅ Referenced | Server actions for job status — usable as-is |
| `src/app/api/internal/dms-ai-jobs/process/route.ts` | ✅ Referenced | Worker route exists, `WORKER_SECRET` gated, handles all job types via registry |
| `src/lib/dms/ocr/ocr-router.ts` | ✅ Read | `routeOcr()` + `loadOcrFeatureFlags()` — ready for use in handler |
| `src/lib/dms/ocr/azure-ocr-provider.ts` | ✅ Read | `AzureOcrProvider` — ready |
| `src/lib/dms/ocr/persist-file-ocr-result.ts` | ✅ Read | Single persistence path — unchanged |
| `src/server/actions/dms/ocr.ts` | ✅ Read | `triggerDmsOcrForFile` contains logic to extract into shared service |
| `src/server/actions/dms/intelligence-admin.ts` | ✅ Read | `adminBackfillMissingOcrText` — synchronous inline OCR, no router awareness |
| `src/features/dms/admin/dms-intelligence-admin-page-client.tsx` | ✅ Read | OCR backfill UI: dry-run checkbox, batch size, resume, target doc, Run button |
| Phase 10A implementation report | ✅ Read | Confirmed all Phase 10A AC passed; TIFF→Azure limitation noted |

**Missing files:**
- `src/lib/dms/ocr/process-file-ocr.ts` — does not exist, planned in Phase 10B
- `src/lib/dms/ai-jobs/handlers/ocr-backfill.handler.ts` — does not exist, planned in Phase 10B

---

## 4. Phase 9 Queue Readiness Review

### Queue infrastructure (confirmed from code):
| Component | Status |
|-----------|--------|
| `dms_ai_job_queue` table | ✅ Migration `20260622150000` — confirmed in code |
| `dms_ai_job_attempts` table | ✅ Same migration |
| `claim_dms_ai_jobs` RPC | ✅ Migration `20260622151000` |
| `complete_dms_ai_job` RPC | ✅ |
| `fail_dms_ai_job` RPC | ✅ |
| `recover_stale_dms_ai_jobs` RPC | ✅ |
| Worker route `/api/internal/dms-ai-jobs/process` | ✅ `WORKER_SECRET` gated, `DMS_AI_JOB_QUEUE_WORKER_ENABLED` gated |
| `DMS_AI_JOB_QUEUE` feature flag | ✅ In migration `20260622152000`, defaults `false` |
| `DMS_AI_JOB_QUEUE_WORKER_ENABLED` feature flag | ✅ Same migration, defaults `false` |
| `OCR_BACKFILL` job type | ❌ **Does not exist** — must be added in Phase 10B |
| Job registry handler for `ocr_backfill` | ❌ **Does not exist** — must be added in Phase 10B |

### Phase 9 UAT status:
Phase 9 migrations were applied (confirmed by user). UAT for the `post_approve_orchestration` job type is still pending (worker route requires `WORKER_SECRET` env var and `DMS_AI_JOB_QUEUE=true`). Phase 10B shares the same worker route, so Phase 9 UAT and Phase 10B UAT should be coordinated.

---

## 5. Phase 10A OCR Router Readiness Review

| Component | Status |
|-----------|--------|
| `routeOcr()` in `ocr-router.ts` | ✅ Implemented, tested (tsc pass) |
| `AzureOcrProvider` in `azure-ocr-provider.ts` | ✅ Implemented |
| `loadOcrFeatureFlags(supabase)` | ✅ Returns `OcrFeatureFlags` with safe defaults |
| `DMS_OCR_ROUTER` flag (default `false`) | ✅ Migration `20260622160000` applied |
| `DMS_OCR_AZURE` flag (default `false`) | ✅ |
| `DMS_OCR_GPT_VISION_FALLBACK` flag (default `true`) | ✅ |
| `ARABIC_OCR_AZURE` provider config | ✅ Seeded (disabled) |
| `persistFileOcrResult` — single persistence path | ✅ Unchanged |
| `writeDocumentContentTextSystem` — content sync | ✅ Called by `persistFileOcrResult` |
| Manual OCR uses `routeOcr` when router enabled | ✅ |

### Phase 10A known limitations relevant to backfill:

| Limitation | Impact on Backfill |
|-----------|-------------------|
| **TIFF→Azure**: Router passes original TIFF buffer to Azure, which may reject it | TIFF files with Azure enabled will fail Azure and fall back to GPT vision. Phase 10B handler should note this in `safe_error_message` but not fail the whole job. GPT fallback works. |
| **Double GPT call for scanned PDFs in intake** | Not relevant — backfill goes through `triggerDmsOcrForFile` path, not intake |
| **Azure timeout (60s polling)** | Backfill in queue context has more tolerance — retry mechanism handles timeouts. Add `azure_timeout` to retryable errors in handler. |

---

## 6. Current Admin OCR Backfill Audit

**File:** `src/server/actions/dms/intelligence-admin.ts`  
**Function:** `adminBackfillMissingOcrText(input: OcrBackfillInput)`

| Attribute | Current Value |
|-----------|--------------|
| Entry function | `adminBackfillMissingOcrText` |
| Permission | `dms.admin` or `system_admin` |
| Dry-run behavior | Returns count of files that would be processed, no OCR run |
| Batch size | Input `batchSize` (1–50, default 10) |
| Resume behavior | `resumeFromId` — `document_id >= resumeFromId` |
| Target selection | Files where `ocr_text IS NULL` and `deleted_at IS NULL` |
| Failed OCR handling | Counts as `failed`, appends sanitized error to `result.errors[]` |
| Provider used | `getDmsAiProvider()` → GPT-4.1 always (no router awareness) |
| Returns to UI | `OcrBackfillResult: { processed, skipped, failed, errors, nextResumeId }` |
| UI displays | `ResultPanel` shows processed/skipped/failed counts and errors |

**Key problem:** Processes all files synchronously in a single server action. For 50 files × ~15s each = ~12.5 minutes. Next.js server action timeout is typically 30s–5min depending on serverless config. Frequently times out for large backlogs.

**Does not use Phase 10A OCR router** — always uses GPT-4.1 via direct `extractFileContent + aiProvider.analyze()` pattern.

---

## 7. Queue Job Type Design

### New job type constant

Add to `DMS_AI_JOB_TYPE` in `job-types.ts`:

```typescript
OCR_BACKFILL: "ocr_backfill",
```

Remove the placeholder comment `// OCR_EXTRACT: "ocr_extract"` — this is the Phase 10B entry for that concept.

### Payload schema

```typescript
export const OcrBackfillPayloadSchema = z.object({
  fileId:      z.number().int().positive(),
  documentId:  z.number().int().positive(),
  forceRetry:  z.boolean().optional().default(false),
  source:      z.enum(["admin_backfill", "manual_admin_retry"]).default("admin_backfill"),
});

export type OcrBackfillPayload = z.infer<typeof OcrBackfillPayloadSchema>;
```

### Max attempts

Add to `JOB_TYPE_MAX_ATTEMPTS`:
```typescript
ocr_backfill: 3,
```

### Idempotency key recommendation

**Use: `ocr_backfill:file:{fileId}`** (without `forceRetry` in the key)

Rationale:
- Including `forceRetry` in the key would allow duplicate active jobs for the same file (one with force=false, one with force=true)
- The idempotency check in `enqueueUniqueDmsAiJob` already checks `queued|running|retry_scheduled` status — so if a job is active, a duplicate won't be created regardless
- When `forceRetry=true`, the caller should check if an existing completed/failed job exists and skip or cancel it before re-enqueueing
- **Safer:** same file always maps to one idempotency key → no race-condition duplicates

For explicit re-runs (admin forces retry after completion), the calling action should either:
- Accept the skipped result and not re-enqueue (most conservative)
- Check for existing completed/failed job and allow new one (implemented via `enqueueUniqueDmsAiJob` which only skips active jobs)

Since `enqueueUniqueDmsAiJob` only skips when status is `queued/running/retry_scheduled`, a new job WILL be created if the previous one was `completed/failed`. This is correct behavior — re-runs are allowed.

### Related document ID

Set `relatedDocumentId` on the queue row for observability and filtering.

---

## 8. OCR Backfill Handler Design

**File to create:** `src/lib/dms/ai-jobs/handlers/ocr-backfill.handler.ts`

### Handler logic

```typescript
export const ocrBackfillHandler: DmsAiJobHandler = {
  jobType: DMS_AI_JOB_TYPE.OCR_BACKFILL,

  async handle(payload: Record<string, unknown>): Promise<DmsAiJobHandlerResult> {
    // 1. Validate payload (Zod)
    // 2. Load file row from dms_document_files via admin client
    // 3. Check file not deleted
    // 4. Check document not deleted
    // 5. Guard: if forceRetry=false and ocr_text already populated, skip
    // 6. Call processDmsFileOcrSystem({ fileId, documentId, storage_bucket, storage_path, ... })
    // 7. Return success or safe error
  },
};
```

### Why NOT call `triggerDmsOcrForFile` directly

`triggerDmsOcrForFile` in `ocr.ts` is a Next.js Server Action that:
- Calls `getAuthContext()` (requires user session — not available in worker context)
- Calls `createClient()` (user RLS client — not available in worker context)
- Creates a `dms_ai_extraction_jobs` record (legacy OCR job tracking — redundant with Phase 9 queue)
- Returns UI-facing `ActionResult` type

The handler must use `createAdminClient()` only (system context, no user session). **Do not call `triggerDmsOcrForFile` from the handler.**

---

## 9. Shared OCR Processing Service Recommendation

### Recommendation: Create `src/lib/dms/ocr/process-file-ocr.ts`

Extract the core OCR processing logic (download → routeOcr → persist) into a shared system-level function:

```typescript
export interface ProcessDmsFileOcrSystemInput {
  fileId:         number;
  documentId:     number;
  storageBucket:  string;
  storagePath:    string;
  fileName:       string;
  mimeType:       string;
  performedBy:    number;   // user ID for audit; use system user ID in worker context
  source?:        "ocr" | "ai_intake";
  forceRetry?:    boolean;
}

export interface ProcessDmsFileOcrSystemResult {
  success:      boolean;
  providerCode: string;
  model:        string | null;
  hasText:      boolean;
  errorCode?:   string;
  safeMessage?: string;
  retryable?:   boolean;
}

/**
 * System-level OCR processing — uses createAdminClient() only.
 * Safe to call from worker context and server actions.
 * Never logs OCR text or raw provider responses.
 */
export async function processDmsFileOcrSystem(
  input: ProcessDmsFileOcrSystemInput
): Promise<ProcessDmsFileOcrSystemResult>
```

### Internal implementation plan for `processDmsFileOcrSystem`:

```
1. Create admin client
2. Download file from storage (adminClient.storage.from(bucket).download(path))
3. loadOcrFeatureFlags(adminClient)
4. getDmsAiProvider() → gptProvider
5. getAzureDocumentIntelligenceProvider() → azureAdapter → AzureOcrProvider
6. routeOcr({ buffer, mimeType, fileName, featureFlags, azureProvider, gptProvider })
7. persistFileOcrResult({ ..., supabase: adminClient, ... })
8. Return result
```

### Benefits:
- `triggerDmsOcrForFile` (when `DMS_OCR_ROUTER=true`) can call this service instead of duplicating logic
- `ocrBackfillHandler` calls this service — no duplication
- Single place to fix/improve OCR logic for both paths
- Cleanly separates system-level OCR (admin client) from user-session OCR

### Phase 10B scope for `triggerDmsOcrForFile` refactor:

Optionally, `triggerDmsOcrForFile` can delegate its router branch to `processDmsFileOcrSystem`. This is a "nice to have" cleanup, not a requirement for Phase 10B. The existing router integration in `triggerDmsOcrForFile` already works correctly.

**Recommended:** Do the refactor in Phase 10B since the shared service needs to be created anyway — reduces future maintenance cost.

---

## 10. Admin Backfill Server Action Plan

### Recommendation: Option B — Add `mode` parameter

```typescript
export type OcrBackfillMode = "dry_run" | "enqueue" | "inline";

export type OcrBackfillInput = {
  mode?:             OcrBackfillMode;    // default: "dry_run" for safety
  batchSize?:        number;             // 1–200 for enqueue (larger since just enqueuing)
  resumeFromId?:     number;
  targetDocumentId?: number;
  // Legacy fields (kept for backward compat):
  dryRun?:           boolean;            // if true, overrides mode to "dry_run"
};
```

**Note:** The existing `dryRun?: boolean` field should be kept for UI backward compatibility. If `dryRun=true`, treat as `mode="dry_run"`.

### Behavior by mode:

| Mode | DMS_OCR_BACKFILL_QUEUE flag | Behavior |
|------|---------------------------|----------|
| `"dry_run"` | any | Returns count of eligible files, nothing enqueued/processed |
| `"enqueue"` | must be `true` | Enqueues `ocr_backfill` jobs; also requires `DMS_AI_JOB_QUEUE=true` |
| `"inline"` | any | Legacy synchronous OCR (current behavior, kept as fallback) |

### Enqueue mode behavior:

```
1. Permission check (dms.admin or system_admin)
2. Load DMS_OCR_BACKFILL_QUEUE flag — if false, return error "Queue-backed backfill is disabled"
3. Load DMS_AI_JOB_QUEUE flag — if false, return error "DMS AI job queue is disabled"  
4. Query eligible files (same criteria as today)
5. For each file:
   a. Call enqueueUniqueDmsAiJob({
        jobType: "ocr_backfill",
        payload: { fileId, documentId, source: "admin_backfill" },
        idempotencyKey: `ocr_backfill:file:${fileId}`,
        relatedDocumentId: documentId,
        createdBy: ctx.profile.id,
      })
   b. If skipped (active job exists): result.skipped++
   c. If enqueued: result.queued++
   d. If error: result.failed++
6. Return OcrBackfillResult with queued/skipped/failed counts
```

### Updated `OcrBackfillResult`:

```typescript
export type OcrBackfillResult = {
  mode:         OcrBackfillMode;
  processed:    number;   // (inline mode) files OCR'd synchronously
  queued:       number;   // (enqueue mode) jobs enqueued
  skipped:      number;   // files with active job / no storage path / etc.
  failed:       number;   // errors during inline OCR or enqueue
  errors:       string[]; // safe error messages (no OCR text)
  nextResumeId: number | null;
};
```

### Batch size limits:

| Mode | Max batch size |
|------|--------------|
| `inline` | 50 (unchanged) |
| `enqueue` | 200 (enqueue is fast, not limited by OCR processing time) |
| `dry_run` | 200 |

---

## 11. Admin Intelligence UI Plan

### Changes to `dms-intelligence-admin-page-client.tsx`

**Minimal additions to OCR Backfill card:**

1. **Mode selector** — radio or select: `Dry Run | Enqueue Jobs | Inline (Legacy)`
   - Default: Dry Run
   - Keep existing `dryRun` checkbox as an alias for "Dry Run" mode (for backward compat)

2. **Warning banner when `DMS_OCR_BACKFILL_QUEUE=false`:**
   > "Queue-backed backfill is disabled (DMS_OCR_BACKFILL_QUEUE=false). Enable this flag to use Enqueue mode."

3. **Warning when worker disabled:**
   > "Worker route is disabled (DMS_AI_JOB_QUEUE_WORKER_ENABLED=false). Enqueued jobs will not process until worker is enabled."

4. **Result display additions** for enqueue mode:
   - `queued` count alongside `processed`/`skipped`/`failed`
   - Link or note: "Check job status in the AI Job Queue monitor" (for Phase 10B, this can be a placeholder link)

5. **Batch size** — for enqueue mode, max can be 200 (update validation)

**No new page.** No major redesign. Additions fit within the existing card structure.

---

## 12. Job Status / Monitoring Plan

### Recommendation: Option B (small summary for admin)

Add a new server action to `intelligence-admin.ts`:

```typescript
export type OcrBackfillQueueSummary = {
  queued:          number;
  running:         number;
  retry_scheduled: number;
  completed:       number;
  failed:          number;
  cancelled:       number;
};

export async function getDmsOcrBackfillQueueSummary(): Promise<ActionResult<OcrBackfillQueueSummary>>
```

Implementation:
```sql
SELECT job_status, count(*) 
FROM dms_ai_job_queue 
WHERE job_type = 'ocr_backfill' 
GROUP BY job_status
```

Shown in the admin OCR card after enqueue: "Queue status: 45 queued, 3 running, 2 failed".

**Full observability dashboard deferred to a future observability phase.**

Per-document job status already available via `getDmsAiJobsForDocument()` in `ai-jobs.ts` — no new server action needed for that.

---

## 13. Duplicate and Idempotency Rules

### Rules:

| Scenario | Behavior |
|---------|---------|
| Active job (`queued/running/retry_scheduled`) for same `fileId` | `enqueueUniqueDmsAiJob` returns `skipped=true` — no duplicate created |
| Completed job for same `fileId` — re-enqueue without forceRetry | New job is created (completed jobs don't block new enqueue) |
| Failed job for same `fileId` — re-enqueue | New job is created (failed doesn't block) |
| Cancelled job | New job is created |
| Same file enqueued twice in same batch call | Second call hits idempotency check — returns existing job ID |

### Idempotency key structure:
```
ocr_backfill:file:{fileId}
```

### Additional check in handler (forceRetry=false guard):

Before calling `processDmsFileOcrSystem`, the handler should check:
```
if (!forceRetry) {
  load file.ocr_text
  if (file.ocr_text is non-empty) → skip, return success (already has text)
}
```

This prevents re-processing files that got OCR text between enqueue and processing.

---

## 14. Feature Flag Plan

### New flag recommended: `DMS_OCR_BACKFILL_QUEUE`

**Reasoning:** `DMS_AI_JOB_QUEUE` is the master queue gate (already controls `post_approve_orchestration`). A separate `DMS_OCR_BACKFILL_QUEUE` flag allows:
- Enabling queue for post-approve orchestration without enabling OCR backfill
- Testing OCR backfill queue independently
- Finer rollout control
- Clearer admin mental model

### All relevant flags for Phase 10B:

| Feature Code | Default | Role |
|-------------|---------|------|
| `DMS_AI_JOB_QUEUE` | `false` | Master queue gate — must be `true` for any queue processing |
| `DMS_AI_JOB_QUEUE_WORKER_ENABLED` | `false` | Worker route gate — must be `true` for worker to process jobs |
| `DMS_OCR_BACKFILL_QUEUE` | `false` (new) | Enables "Enqueue" mode in admin OCR backfill |
| `DMS_OCR_ROUTER` | `false` | Phase 10A router — must be `true` for Azure/local routing in handler |
| `DMS_OCR_AZURE` | `false` | Must be `true` for Azure DI in handler |
| `DMS_OCR_GPT_VISION_FALLBACK` | `true` | GPT fallback in handler |
| `DMS_OCR` | `true` | Master OCR gate |

**Flag dependency check in server action (enqueue mode):**
```
DMS_OCR_BACKFILL_QUEUE=true  AND
DMS_AI_JOB_QUEUE=true
→ Allow enqueue

DMS_OCR_ROUTER=true  (optional — handler always calls routeOcr, flag controls routing inside)
```

The handler always calls `routeOcr()`. If `DMS_OCR_ROUTER=false`, the router still works (it's called directly) but will use legacy behavior (GPT-only) due to the flag check inside `routeOcr`.

**Wait — actually, `routeOcr` itself does NOT check `dmsOcrRouter`**. The `dmsOcrRouter` flag is only checked by callers (`triggerDmsOcrForFile` branches before calling the router). The Phase 10B handler will **always call `routeOcr`** — it does not need the router flag. The handler is a new code path that opts directly into router behavior. The three-tier routing comes from `DMS_OCR_AZURE` and `DMS_OCR_GPT_VISION_FALLBACK` flags, not from `DMS_OCR_ROUTER`.

This means:
- Even with `DMS_OCR_ROUTER=false`, the backfill handler uses three-tier routing (local → Azure → GPT) because it calls `routeOcr()` directly
- This is intentional and correct — the backfill handler is a new path that should always use the best routing
- `DMS_OCR_ROUTER` only gates the old `triggerDmsOcrForFile` and intake paths for backward compat

---

## 15. Database Migration Review

### New migration needed:

**File:** `supabase/migrations/20260624100000_erp_dms_ai_phase10b_ocr_backfill_queue_flag.sql`

**Content:** Insert `DMS_OCR_BACKFILL_QUEUE` feature flag only.

```sql
INSERT INTO public.erp_ai_feature_flags (
  feature_code, feature_name, description,
  is_enabled, requires_human_review, min_confidence_threshold
) VALUES (
  'DMS_OCR_BACKFILL_QUEUE',
  'DMS OCR Backfill — Queue Mode',
  'Enables queue-backed admin OCR backfill (Phase 10B). '
  'When true, the "Enqueue Jobs" mode in DMS Intelligence Admin enqueues OCR_BACKFILL '
  'jobs into dms_ai_job_queue for processing by the worker route. '
  'Requires DMS_AI_JOB_QUEUE=true and DMS_AI_JOB_QUEUE_WORKER_ENABLED=true. '
  'When false (default), only Dry Run and Inline modes are available.',
  false, false, 0.000
)
ON CONFLICT (feature_code) DO UPDATE SET
  feature_name = EXCLUDED.feature_name,
  description  = EXCLUDED.description,
  updated_at   = now();
```

### No other schema changes:

| Item | Decision |
|------|----------|
| New tables | ❌ Not needed — Phase 9 `dms_ai_job_queue` + `dms_ai_job_attempts` sufficient |
| New columns on `dms_document_files` | ❌ Not needed |
| New RPCs | ❌ Not needed — Phase 9 RPCs sufficient |
| New `dms_ai_extraction_jobs` entries | The backfill handler should NOT create `dms_ai_extraction_jobs` records (legacy table) — only the Phase 9 queue row tracks the backfill job |

---

## 16. Security and Permission Plan

### Admin backfill server action:
- Requires `dms.admin` or `system_admin` — same as current
- Uses `createAdminClient()` for all DB operations in enqueue mode
- Permission check before any queue operation

### Worker handler (`ocrBackfillHandler`):
- Called only from `/api/internal/dms-ai-jobs/process` after `WORKER_SECRET` validation
- Uses `createAdminClient()` only — no user session
- `performedBy` in `persistFileOcrResult` call: use a system sentinel ID (e.g., `0` or a dedicated `system` user profile ID) — check what the existing `post-approve-orchestration.handler` uses

### Payload security:
- Payload stores: `fileId`, `documentId`, `forceRetry`, `source` — IDs and flags only
- No OCR text, prompts, file bytes, document content, or API keys in payload
- Attempt records store: sanitized `error_code` and `safe_error_message` (≤500 chars) — no OCR text

### Confidential documents:
- `processDmsFileOcrSystem` does not perform RLS checks (admin client)
- OCR processing on confidential documents in backfill context is correct — admin triggered, admin permission verified at enqueue time
- Viewing OCR text for confidential docs still requires `dms.documents.view` RLS (unchanged)
- The backfill job only writes `ocr_text` to `dms_document_files` and `content_text` to `dms_document_content` — existing RLS on those tables gates read access

---

## 17. Error Handling and Retry Plan

### Retryable error codes (handler should mark `retryable: true`):

| Error | Code |
|-------|------|
| Azure DI timeout | `provider_timeout` |
| Azure rate limit | `provider_rate_limit` |
| Azure unavailable (502/503) | `provider_unavailable` |
| Network error | `network_error` |
| Storage download failure | `storage_download_failed` (new, mapped to `provider_unavailable`) |
| Temp DB error | `database_error` |

### Non-retryable error codes (handler marks `retryable: false`):

| Error | Code |
|-------|------|
| File not found in DB | `file_not_found` |
| Document not found or deleted | `document_not_found` |
| File deleted | `file_deleted` |
| Storage path missing | `missing_storage_path` |
| Unsupported MIME type | `unsupported_mime_type` |
| OCR disabled (`DMS_OCR=false`) | `ocr_disabled` |
| No provider configured | `provider_not_configured` |
| Invalid payload | `validation_error` |
| Already has OCR text (forceRetry=false) | `skipped_already_complete` (success=true, not an error) |

### Error sanitization:
- Handler uses `sanitizeJobError()` from `job-runner.ts` for unexpected errors
- `safe_error_message` in `dms_ai_job_attempts` — max 500 chars, no OCR text

### Max attempts: 3 (same as `post_approve_orchestration`)

---

## 18. Backward Compatibility Plan

| Scenario | Behavior |
|---------|---------|
| `DMS_OCR_BACKFILL_QUEUE=false` (default) | Only "dry_run" and "inline" modes available — existing behavior |
| `dryRun=true` (existing UI param) | Works as before — treated as `mode="dry_run"` |
| `DMS_AI_JOB_QUEUE=false` | Enqueue mode returns error — admin told to enable queue |
| Manual OCR (`triggerDmsOcrForFile`) | Unchanged |
| Single-file intake | Unchanged |
| Batch intake | Unchanged |
| Approval-time OCR | Unchanged |
| `DMS_OCR_ROUTER=false` | `triggerDmsOcrForFile` legacy path unchanged; backfill handler always uses router internally |

---

## 19. Recommended Phase 10B Implementation Scope

| Item | Deliverable |
|------|------------|
| New file | `src/lib/dms/ocr/process-file-ocr.ts` — `processDmsFileOcrSystem()` |
| New file | `src/lib/dms/ai-jobs/handlers/ocr-backfill.handler.ts` |
| Modified | `src/lib/dms/ai-jobs/job-types.ts` — add `OCR_BACKFILL`, `OcrBackfillPayloadSchema`, update `JOB_TYPE_MAX_ATTEMPTS` |
| Modified | `src/lib/dms/ai-jobs/job-registry.ts` — register `ocrBackfillHandler` |
| Modified | `src/server/actions/dms/intelligence-admin.ts` — `adminBackfillMissingOcrText` + mode + `getDmsOcrBackfillQueueSummary()` |
| Modified | `src/features/dms/admin/dms-intelligence-admin-page-client.tsx` — mode selector + worker warning |
| Optional | `src/server/actions/dms/ocr.ts` — refactor `triggerDmsOcrForFile` router branch to call `processDmsFileOcrSystem` |
| Migration | `20260624100000_erp_dms_ai_phase10b_ocr_backfill_queue_flag.sql` — `DMS_OCR_BACKFILL_QUEUE=false` |

---

## 20. Implementation Sequence for Future Phase 10B Execution

1. Read Phase 9 job-runner, job-types, job-registry
2. Read Phase 10A ocr-router, azure-ocr-provider, persist-file-ocr-result
3. Read current `adminBackfillMissingOcrText` in full
4. Create `src/lib/dms/ocr/process-file-ocr.ts`
5. Create migration `20260624100000_erp_dms_ai_phase10b_ocr_backfill_queue_flag.sql`
6. Modify `job-types.ts` — add `OCR_BACKFILL`, schema, max attempts
7. Create `ocr-backfill.handler.ts`
8. Modify `job-registry.ts` — register handler
9. Modify `intelligence-admin.ts` — extend action + add summary action
10. Modify `dms-intelligence-admin-page-client.tsx` — mode selector + warnings
11. (Optional) Refactor `triggerDmsOcrForFile` to use `processDmsFileOcrSystem`
12. Run `npx tsc --noEmit` — must pass
13. Run ReadLints — must pass
14. Apply migration
15. UAT — follow checklist
16. Create implementation report
17. Update SOT

---

## 21. Acceptance Criteria for Future Implementation

| AC | Criterion |
|----|-----------|
| AC-01 | Admin OCR backfill dry-run mode returns eligible file count without enqueueing |
| AC-02 | Admin OCR backfill enqueue mode creates `ocr_backfill` jobs in `dms_ai_job_queue` |
| AC-03 | Queue payload contains only `fileId`, `documentId`, `forceRetry`, `source` — no OCR text |
| AC-04 | Duplicate active `ocr_backfill` job for same `fileId` is skipped (idempotency) |
| AC-05 | Worker processes `ocr_backfill` job through `routeOcr()` (three-tier routing) |
| AC-06 | OCR output persists through `persistFileOcrResult` |
| AC-07 | Document content sync runs through `writeDocumentContentTextSystem` (called by persistFileOcrResult) |
| AC-08 | Failed jobs retry up to 3 times for retryable errors |
| AC-09 | Unsupported MIME and other non-retryable errors fail safely with sanitized message |
| AC-10 | Admin UI shows queued/skipped/failed counts after enqueue operation |
| AC-11 | `DMS_OCR_BACKFILL_QUEUE=false` (default) — enqueue mode unavailable until enabled |
| AC-12 | Manual OCR (`triggerDmsOcrForFile`) and intake OCR unchanged |
| AC-13 | No raw OCR text, prompt, raw provider response, or API key in job payload, attempt records, or logs |
| AC-14 | Worker route security (WORKER_SECRET + `DMS_AI_JOB_QUEUE_WORKER_ENABLED`) unchanged |
| AC-15 | `npx tsc --noEmit` passes |

---

## 22. Full Test Plan

### T-01: Dry-run mode — no enqueue

**Purpose:** Confirm dry-run reports count without side effects  
**Setup:** `DMS_OCR_BACKFILL_QUEUE=true`, `DMS_AI_JOB_QUEUE=true`  
**Steps:** Call `adminBackfillMissingOcrText({ mode: "dry_run", batchSize: 20 })`  
**Expected result:** Returns `{ mode: "dry_run", skipped: N, queued: 0, processed: 0 }`  
**DB state:** No new rows in `dms_ai_job_queue`  
**Risk covered:** AC-01

---

### T-02: Enqueue creates queue jobs

**Purpose:** Confirm enqueue creates `ocr_backfill` jobs for eligible files  
**Setup:** At least 3 files with `ocr_text IS NULL`; flags enabled  
**Steps:** Call `adminBackfillMissingOcrText({ mode: "enqueue", batchSize: 5 })`  
**Expected result:** `{ queued: N, skipped: 0, failed: 0 }`  
**DB state:** N rows in `dms_ai_job_queue` with `job_type="ocr_backfill"`, `job_status="queued"`  
**Risk covered:** AC-02

---

### T-03: Enqueue — idempotency (duplicate prevention)

**Purpose:** Confirm duplicate active jobs are skipped  
**Setup:** Enqueue once (creates active jobs)  
**Steps:** Enqueue same batch again  
**Expected result:** All files return `skipped=true`; no duplicate rows  
**DB state:** Same N rows as before, no duplicates  
**Risk covered:** AC-04

---

### T-04: Worker processes `ocr_backfill` job (digital PDF)

**Purpose:** Confirm handler calls `routeOcr` and gets local text for digital PDF  
**Setup:** `DMS_OCR_ROUTER` not required (handler always routes); enqueue a job for a digital PDF file  
**Steps:** Trigger worker (`POST /api/internal/dms-ai-jobs/process` with WORKER_SECRET)  
**Expected result:** `dms_document_files.ocr_provider = "pdf_text"`, `ocr_text` populated, `job_status = "completed"`  
**DB state:** `dms_ai_job_queue` row: `job_status="completed"`, `attempt_count=1`; `dms_ai_job_attempts` row: `status="completed"`  
**Risk covered:** AC-05, AC-06

---

### T-05: Worker processes `ocr_backfill` job (scanned PDF, GPT fallback)

**Purpose:** Confirm handler uses GPT vision when Azure disabled  
**Setup:** `DMS_OCR_AZURE=false`, `DMS_OCR_GPT_VISION_FALLBACK=true`; enqueue job for scanned PDF  
**Steps:** Trigger worker  
**Expected result:** `ocr_provider = "vision"`, `ocr_text` populated  
**Risk covered:** AC-05

---

### T-06: Document content sync after backfill OCR

**Purpose:** Confirm `dms_document_content.content_text` updated  
**Steps:** Process an `ocr_backfill` job, then check `dms_document_content`  
**Expected result:** Row exists with non-empty `content_text`  
**Risk covered:** AC-07

---

### T-07: Retry on Azure timeout

**Purpose:** Confirm job retries on `azure_timeout`  
**Setup:** Azure configured but endpoint returns timeout; `DMS_OCR_AZURE=true`  
**Steps:** Process job — Azure times out  
**Expected result:** `job_status="retry_scheduled"`, `attempt_count=1`; after 2nd attempt still fails → `failed` after 3 attempts  
**Risk covered:** AC-08

---

### T-08: Non-retryable error — file not found

**Purpose:** Confirm permanent failure for missing file  
**Setup:** Enqueue job with `fileId` of a deleted file  
**Steps:** Process job  
**Expected result:** `job_status="failed"`, `last_error_code="file_not_found"`, `attempt_count=1` (no retry)  
**Risk covered:** AC-09

---

### T-09: Non-retryable error — unsupported MIME

**Purpose:** Confirm safe failure for unsupported MIME type  
**Setup:** Enqueue job for a file with MIME `video/mp4`  
**Steps:** Process job  
**Expected result:** `job_status="failed"`, `last_error_code="unsupported_mime_type"`, no retry  
**Risk covered:** AC-09

---

### T-10: Worker disabled — jobs stay queued

**Purpose:** Confirm worker route blocks when flag disabled  
**Setup:** `DMS_AI_JOB_QUEUE_WORKER_ENABLED=false`  
**Steps:** POST to worker route  
**Expected result:** 503 response; jobs remain in `queued` status  
**Risk covered:** AC-14

---

### T-11: Worker route — wrong secret

**Purpose:** Confirm 401 when secret missing/wrong  
**Steps:** POST to worker route without Authorization header  
**Expected result:** 401 Unauthorized  
**Risk covered:** AC-14

---

### T-12: No OCR text in payload / attempts

**Purpose:** Confirm security rule  
**Steps:** Enqueue + process job; inspect `dms_ai_job_queue.payload_json` and `dms_ai_job_attempts` rows  
**Expected result:** Payload contains only `fileId`, `documentId`, `forceRetry`, `source`; `safe_error_message` contains no OCR text  
**Risk covered:** AC-13

---

### T-13: Enqueue mode disabled by default

**Purpose:** Confirm `DMS_OCR_BACKFILL_QUEUE=false` prevents enqueue  
**Setup:** Apply migration; don't enable flag  
**Steps:** Call `adminBackfillMissingOcrText({ mode: "enqueue" })`  
**Expected result:** Error "Queue-backed backfill is disabled (DMS_OCR_BACKFILL_QUEUE=false)"  
**Risk covered:** AC-11

---

### T-14: Manual OCR unchanged

**Purpose:** Confirm `triggerDmsOcrForFile` unchanged  
**Steps:** Run manual OCR with `DMS_OCR_ROUTER=false`  
**Expected result:** Exact same behavior as before Phase 10B  
**Risk covered:** AC-12

---

### T-15: Typecheck/build

**Steps:** `npx tsc --noEmit`  
**Expected:** 0 errors  
**Risk covered:** AC-15

---

## 23. Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Phase 9 worker UAT not complete before Phase 10B UAT | Medium | Phase 10B shares worker; coordinate UAT for both job types together |
| `performedBy` user ID in worker context — no user session | Low | Use `ctx.profile.id` at enqueue time, pass in payload? No — payload security rules forbid. Use `0` or a dedicated system ID for worker-context `persistFileOcrResult` calls |
| Large number of enqueued OCR jobs saturating worker | Medium | Batch size limit (200 max); worker processes small batches per invocation; admin can adjust |
| TIFF files: Azure may reject raw TIFF buffer in backfill handler | Low | Azure fails → GPT fallback processes converted PNG (via `extractFileContent` in `routeOcr`). Non-blocking. |
| `processDmsFileOcrSystem` is new code — bugs possible | Low | Shared service used in Phase 10B only initially; can be rolled out carefully |
| `forceRetry=false` guard in handler may skip valid re-runs | Low | For re-runs, admin can use `forceRetry=true` mode or manually cancel/re-enqueue |

### performedBy note:

`persistFileOcrResult` requires a `performedBy: number` (user profile ID). In worker context, there's no user session. Options:
1. Pass `createdBy` user ID in the job payload → breaks payload security principle (not recommended)
2. Use `0` or a known "system" sentinel value → simplest, accepted pattern for system operations
3. Store admin user ID at enqueue time in a separate `created_by` column already on `dms_ai_job_queue` → read `job.created_by` in handler and pass to `performedBy`

**Recommendation: Option 3** — the `dms_ai_job_queue.created_by` column already stores the admin user ID at enqueue time. The handler reads `job.created_by` (passed via `DmsAiJobQueueRow`) and passes it to `performedBy`. This correctly attributes the OCR work to the admin who triggered the backfill. `created_by` is an ID only (not sensitive content) — it's already in the queue row, not in the payload.

**The handler receives the full `DmsAiJobQueueRow` via `payload: Record<string, unknown>` only.** Actually, looking at `DmsAiJobHandler.handle(payload, ctx?)` — it only receives `payload_json`. `created_by` is NOT in the payload. Options:
- Include `adminUserId` in payload (acceptable since it's just an integer ID, not sensitive content — but slightly unusual)
- Use a fixed system user ID (`0`)

**Final recommendation: Use `0` as `performedBy` in the handler.** The `persistFileOcrResult` call will set `performed_by=0` in the content audit trail, which is acceptable for admin-system backfill operations. This avoids any payload security concerns.

---

## 24. What Must Not Be Implemented in Phase 10B

```
✗ Apply-to-ERP writes
✗ Semantic chunking
✗ Review queue activation
✗ Token/cost dashboard
✗ Full observability dashboard
✗ Auto-approval or auto-save metadata
✗ Moving intake OCR/classification to queue
✗ Changing OCR router routing rules (unless a bug is found)
✗ Storing raw OCR text in queue payload
✗ Storing raw Azure/GPT responses
✗ New columns on dms_document_files or other tables
✗ New RPCs beyond what Phase 9 already provides
✗ Major UI redesign
✗ New full-page admin queue monitor (simple summary only)
```

---

## 25. Corrected Roadmap After Phase 10B

| Phase | Name | Status |
|-------|------|--------|
| Phase 1–8 | Stabilization through ERP Mapping | ✅ CLOSED |
| Phase 9 | Async AI Job Queue | ✅ Code complete, migrations applied |
| Phase 10A | OCR Pipeline Upgrade / Azure OCR Wiring | ✅ CLOSED |
| **Phase 10B** | **Queue-backed Admin OCR Backfill** | **PLANNED** |
| Phase 11 | ERP Mapping Apply-to-ERP Writes | FUTURE |
| Phase 12 | Token/Cost Observability | FUTURE |

---

## 26. Recommended Next Cursor Implementation Prompt

```text
Title: ERP DMS AI Phase 10B — Queue-backed Admin OCR Backfill Implementation

Scope:
  - Create src/lib/dms/ocr/process-file-ocr.ts (processDmsFileOcrSystem)
  - Create src/lib/dms/ai-jobs/handlers/ocr-backfill.handler.ts
  - Modify job-types.ts: add OCR_BACKFILL + OcrBackfillPayloadSchema + max_attempts
  - Modify job-registry.ts: register ocrBackfillHandler
  - Modify intelligence-admin.ts: add mode param + getDmsOcrBackfillQueueSummary()
  - Modify dms-intelligence-admin-page-client.tsx: mode selector + worker warnings
  - Create migration: DMS_OCR_BACKFILL_QUEUE=false
  - (Optional) refactor triggerDmsOcrForFile router branch to use processDmsFileOcrSystem

Forbidden:
  - Phase 10B+ observability features
  - OCR text in payload
  - Raw provider responses in queue
  - New schema columns
  - Auto-approval or auto-save
  - Major UI redesign
```

---

## 27. Final Recommendation

Phase 10B is a **well-scoped, low-risk extension** of Phase 9 queue infrastructure. The key decisions are:

1. **Create `process-file-ocr.ts`** as the shared system-level OCR service — this is the architectural centerpiece that avoids code duplication between `triggerDmsOcrForFile` and the new handler.

2. **Add `mode` parameter to `adminBackfillMissingOcrText`** rather than replacing it — preserves backward compat, keeps `dryRun=true` alias working.

3. **Add `DMS_OCR_BACKFILL_QUEUE=false` flag** for independent rollout control — don't gate on `DMS_AI_JOB_QUEUE` alone.

4. **Handler always calls `routeOcr()`** directly — no dependency on `DMS_OCR_ROUTER` flag. The backfill handler is a new code path that opts directly into three-tier routing.

5. **`performedBy=0`** in `processDmsFileOcrSystem` for worker context — simple, correct, avoids payload bloat.

6. **Coordinate Phase 9 UAT and Phase 10B UAT** together — both use the same worker route and `WORKER_SECRET`.
