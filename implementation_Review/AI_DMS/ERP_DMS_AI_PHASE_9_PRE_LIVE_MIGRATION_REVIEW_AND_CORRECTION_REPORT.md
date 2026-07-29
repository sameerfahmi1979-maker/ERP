# ERP DMS AI Phase 9 Pre-Live Migration Review and Correction Report

**Phase:** ERP DMS AI Phase 9 — Async AI Job Queue / Workflow Runner  
**Review date:** 2026-06-22  
**Reviewer:** Senior ERP / Supabase / Next.js / Security / AI Workflow Architect  
**Status:** CORRECTIONS APPLIED — SAFE TO APPLY LIVE MIGRATIONS ✅

---

## 1. Executive Summary

Phase 9 code and migrations were reviewed across all 12 objectives. **3 corrections** were identified and applied. Migrations have not been applied to the live database. All feature flags default to `false`. Live behavior is unchanged until flags are explicitly enabled.

**Corrections applied:**
1. Added `CHECK` constraints for `job_status` and attempt `status` to `20260622150000_erp_dms_ai_phase9_job_queue.sql`
2. Fixed attempt record initial status from `completed` to `running` in `job-runner.ts` and added `RUNNING` to `DMS_AI_ATTEMPT_STATUS`
3. Corrected SOT date inconsistency (Phase 9 dated `2026-06-21`, prior Phase 8 dated `2026-06-22` — corrected to `2026-06-22`)

**All other review objectives: PASS — no correction needed.**

---

## 2. Review Scope

| Area | Reviewed |
|------|---------|
| 3 migration SQL files | ✅ |
| `job-types.ts`, `job-registry.ts`, `job-runner.ts` | ✅ |
| `post-approve-orchestration.handler.ts` | ✅ |
| `system-pipeline.ts`, `post-approve-orchestration.ts` | ✅ |
| `src/server/actions/dms/ai-jobs.ts` | ✅ |
| `src/app/api/internal/dms-ai-jobs/process/route.ts` | ✅ |
| Live DB — permission codes | ✅ |
| Live DB — RLS helper functions | ✅ |
| Live DB — `user_profiles.id` data type | ✅ |
| Live DB — `dms_upload_sessions` columns | ✅ |
| Live DB — migration applied status | ✅ |
| `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md` | ✅ |
| `ALGT_ERP_SOURCE_OF_TRUTH.md` | ✅ |

---

## 3. Files Reviewed

**Migrations:**
- `supabase/migrations/20260622150000_erp_dms_ai_phase9_job_queue.sql`
- `supabase/migrations/20260622151000_erp_dms_ai_phase9_job_queue_rpcs.sql`
- `supabase/migrations/20260622152000_erp_dms_ai_phase9_feature_flags.sql`

**TypeScript:**
- `src/lib/dms/ai-jobs/job-types.ts`
- `src/lib/dms/ai-jobs/job-registry.ts`
- `src/lib/dms/ai-jobs/job-runner.ts`
- `src/lib/dms/ai-jobs/handlers/post-approve-orchestration.handler.ts`
- `src/lib/dms/orchestration/system-pipeline.ts`
- `src/lib/dms/orchestration/post-approve-orchestration.ts`
- `src/server/actions/dms/ai-jobs.ts`
- `src/app/api/internal/dms-ai-jobs/process/route.ts`

---

## 4. Live Migration Status

**`dms_ai_job_queue`:** NOT in live DB ← pending apply  
**`dms_ai_job_attempts`:** NOT in live DB ← pending apply  
**RPCs (`claim_dms_ai_jobs`, etc.):** NOT in live DB ← pending apply  
**Feature flags (`DMS_AI_JOB_QUEUE`, `DMS_AI_JOB_QUEUE_WORKER_ENABLED`):** NOT in `erp_ai_feature_flags` ← pending apply  

**Conclusion: All 3 migrations are pending live apply. Not applied automatically per prompt rules.**

---

## 5. Migration 1 Review — Job Queue Tables

**`dms_ai_job_queue`**

| Check | Result |
|-------|--------|
| BIGINT PK (GENERATED ALWAYS AS IDENTITY) | ✅ |
| `created_by BIGINT REFERENCES user_profiles(id)` | ✅ |
| `related_upload_session_id` (not `related_session_id`) | ✅ |
| `related_approve_run_id BIGINT REFERENCES dms_approve_runs(id)` | ✅ |
| `related_ai_result_id BIGINT REFERENCES dms_ai_extraction_results(id)` | ✅ |
| `job_status` CHECK constraint | ⚠️ **MISSING → CORRECTED** |
| `payload_json` comment warns no OCR/prompt/AI content | ✅ |
| Indexes: claim (partial), document, session, type/status, locked_at | ✅ |

**`dms_ai_job_attempts`**

| Check | Result |
|-------|--------|
| BIGINT PK | ✅ |
| `job_id FK → dms_ai_job_queue ON DELETE CASCADE` | ✅ |
| `status` CHECK constraint | ⚠️ **MISSING → CORRECTED** |
| `usage_log_id FK → erp_ai_usage_logs ON DELETE SET NULL` | ✅ |
| No sensitive data columns (no prompts, OCR, API keys) | ✅ |

**RLS — `dms_ai_job_queue`**

| Policy | Result |
|--------|--------|
| RLS ENABLED | ✅ |
| FORCE ROW LEVEL SECURITY | ✅ |
| SELECT: `dms.documents.review_ai` OR `dms.documents.edit` OR `dms.admin` OR `system_admin` OR `group_admin` | ✅ |
| INSERT: `dms.admin` OR `system_admin` OR `group_admin` | ✅ |
| UPDATE: `dms.admin` OR `system_admin` OR `group_admin` | ✅ |
| No `USING (true)` / no broad authenticated access | ✅ |
| No anonymous access | ✅ |

**RLS — `dms_ai_job_attempts`**

| Policy | Result |
|--------|--------|
| RLS ENABLED + FORCED | ✅ |
| Same permission patterns as job queue | ✅ |

---

## 6. Migration 2 Review — Job Queue RPCs

| RPC | Check | Result |
|-----|-------|--------|
| `claim_dms_ai_jobs` | SECURITY DEFINER | ✅ |
| | `SET search_path = public` | ✅ |
| | `FOR UPDATE SKIP LOCKED` | ✅ |
| | Only claims `queued` or `retry_scheduled` | ✅ |
| | Respects `run_after <= NOW()` | ✅ |
| | Orders by `priority ASC, run_after ASC` | ✅ |
| `complete_dms_ai_job` | SECURITY DEFINER + safe search_path | ✅ |
| | Clears `locked_by` and `locked_at` | ✅ |
| | Sets `completed_at` | ✅ |
| `fail_dms_ai_job` | SECURITY DEFINER + safe search_path | ✅ |
| | Increments `attempt_count` on both retry and fail paths | ✅ |
| | Correct off-by-one check: `(v_attempt_count + 1) < v_max_attempts` | ✅ |
| | Exponential backoff: 1m / 5m / 30m | ✅ |
| | Permanently fails when retries exhausted | ✅ |
| `recover_stale_dms_ai_jobs` | SECURITY DEFINER + safe search_path | ✅ |
| | Only resets `running` jobs with expired lock | ✅ |
| | Only recovers where `attempt_count < max_attempts` | ✅ |
| | Returns count of recovered jobs | ✅ |

**RPC attempt count logic verified:**
- Initial `attempt_count = 0`. On failure: `(0+1) < 3` → retry, count→1.  
- Second failure: `(1+1) < 3` → retry, count→2.  
- Third failure: `(2+1) < 3` → FALSE → permanently failed, count→3.  
- With `max_attempts=3`, exactly 3 run attempts before permanent failure. **CORRECT ✅**

---

## 7. Migration 3 Review — Feature Flags

| Check | Result |
|-------|--------|
| `DMS_AI_JOB_QUEUE` inserted with `is_enabled = false` | ✅ |
| `DMS_AI_JOB_QUEUE_WORKER_ENABLED` inserted with `is_enabled = false` | ✅ |
| Uses `ON CONFLICT (feature_code) DO NOTHING` (idempotent) | ✅ |
| `feature_code` column confirmed (not `flag_key`) | ✅ |

---

## 8. Type and FK Corrections

**`created_by` data type:**

Implementation report originally stated `created_by UUID` as a concern. After reviewing the actual migration:

```sql
created_by BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL
```

Confirmed `user_profiles.id` is `BIGINT` in the live DB. **No correction needed — already correct.**

Server action correctly passes `ctx.profile.id as number` → BIGINT-compatible. ✅

---

## 9. Column Naming Review

**`related_upload_session_id`:**

Migration uses `related_upload_session_id` (preferred naming). All TypeScript code is consistent:
- `DmsAiJobQueueRow.related_upload_session_id` ✅
- `EnqueueDmsAiJobInput.relatedUploadSessionId` ✅
- `job-runner.ts` insert: `related_upload_session_id: input.relatedUploadSessionId` ✅
- `post-approve-orchestration.ts`: `relatedUploadSessionId: uploadSessionId` ✅
- `ai-jobs.ts` server action: selects `related_upload_session_id` column, maps to `relatedUploadSessionId` ✅

**PASS — naming is consistent and matches preferred style.**

---

## 10. `related_approve_run_id` Review

Present in migration, TypeScript types, enqueue input, and enqueue call:

```sql
-- migration
related_approve_run_id BIGINT REFERENCES public.dms_approve_runs(id) ON DELETE SET NULL
```

```typescript
// post-approve-orchestration.ts
relatedApproveRunId: approveRunId,
```

```typescript
// job-runner.ts
related_approve_run_id: input.relatedApproveRunId ?? null,
```

**PASS — `related_approve_run_id` is present and correctly wired for traceability: approve run → queue job → worker attempt → orchestration result.**

---

## 11. Status CHECK Constraint Review

**Correction applied to `20260622150000_erp_dms_ai_phase9_job_queue.sql`:**

```sql
-- Before (no CHECK):
job_status TEXT NOT NULL DEFAULT 'queued',

-- After (with CHECK):
job_status TEXT NOT NULL DEFAULT 'queued'
  CHECK (job_status IN ('queued','running','retry_scheduled','completed','failed','cancelled','superseded')),
```

```sql
-- Before (no CHECK):
status TEXT NOT NULL,

-- After (with CHECK):
status TEXT NOT NULL
  CHECK (status IN ('running','completed','failed','timed_out')),
```

Both `DMS_AI_JOB_STATUS` (7 values) and `DMS_AI_ATTEMPT_STATUS` (4 values) in TypeScript match the CHECK constraints exactly.

---

## 12. RLS and Permission Review

**Confirmed permission codes exist in live DB:**

| Permission Code | Used In Migration | Exists in DB |
|----------------|-------------------|--------------|
| `dms.documents.review_ai` | SELECT policy | ✅ |
| `dms.documents.edit` | SELECT policy | ✅ |
| `dms.admin` | SELECT + INSERT + UPDATE | ✅ |

**Confirmed RLS helper functions exist:**
- `current_user_has_permission()` ✅
- `current_user_has_role()` ✅

**No invalid permission codes like `dms.viewer` or `dms.reviewer` used.** (These were flagged in the review prompt but are NOT in the migration — the migration already uses the correct codes.)

**RLS summary:** RLS enabled, FORCE enabled, no `USING (true)`, no broad authenticated access, no anonymous access. ✅

---

## 13. RPC Safety Review

All 4 RPCs:
- Use `SECURITY DEFINER` ✅
- Use `SET search_path = public` (prevents search_path injection) ✅
- Workers call RPCs through admin client (bypasses RLS layer for atomic operations) ✅

See Section 6 for full per-RPC verification.

---

## 14. Worker Route Security Review

| Check | Result |
|-------|--------|
| `export const runtime = "nodejs"` | ✅ |
| POST: requires `Authorization: Bearer WORKER_SECRET` | ✅ |
| GET health check: same WORKER_SECRET required | ✅ |
| Missing secret → HTTP 401 | ✅ |
| Invalid secret → HTTP 401 | ✅ |
| `WORKER_SECRET` not configured → all requests blocked (returns false) | ✅ |
| Worker disabled (`DMS_AI_JOB_QUEUE_WORKER_ENABLED=false`) → 200 idle response | ✅ |
| Admin client only used after secret validation | ✅ |
| Response does not expose raw OCR, prompts, AI responses, or payloads | ✅ |
| `WORKER_SECRET` not stored in DB | ✅ |
| `WORKER_SECRET` not logged | ✅ |

**`WORKER_SECRET` environment variable:** Must be set to 32+ random characters before enabling the worker. Document in `.env.example` as required for Phase 9.

---

## 15. Queue Payload Safety Review

Payload written in `post-approve-orchestration.ts`:

```typescript
payload: {
  sessionCode,      // string code — safe
  documentId,       // number ID — safe
  uploadSessionId,  // number ID — safe
  approveRunId,     // number ID — safe
  source,           // enum string — safe
},
```

**Contains:** IDs and one control enum. ✅  
**Does NOT contain:** OCR text, AI prompts, raw AI responses, document body, file contents, API keys, full extracted fields, full metadata values. ✅

Payload schema validated by `PostApproveOrchestrationPayloadSchema` (Zod). ✅

---

## 16. Feature Flag and Rollback Review

| Check | Result |
|-------|--------|
| `DMS_AI_JOB_QUEUE` defaults to `false` | ✅ |
| `DMS_AI_JOB_QUEUE_WORKER_ENABLED` defaults to `false` | ✅ |
| `DMS_AI_JOB_QUEUE=false` → `triggerInline()` called → exact Phase 5 behavior | ✅ |
| `DMS_AI_JOB_QUEUE=true` → `triggerViaQueue()` called | ✅ |
| Queue enqueue failure → falls back to `triggerInline()` (fail-safe, approval preserved) | ✅ |
| `isJobQueueEnabled()` catches exceptions and returns `false` (safe fallback) | ✅ |

**Rollback procedure:** Set `DMS_AI_JOB_QUEUE=false` in `erp_ai_feature_flags`. Takes effect immediately on next request. No code deploy needed.

---

## 17. TypeScript / Build Results

**After all corrections applied:**

```
npx tsc --noEmit → Exit 0 — 0 errors ✅
```

Build not run (slow). tsc PASS is the required minimum per the prompt.

---

## 18. Source-of-Truth Updates

**Corrections applied:**

| File | Change |
|------|--------|
| `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md` | Date changed from `2026-06-21` to `2026-06-22`; Phase status updated to `(closed, migrations pending live apply)` |
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | Date updated to `2026-06-22`; note added `migrations pending live apply` |
| `implementation_Review/ERP_DMS_AI_PHASE_9_ASYNC_JOB_QUEUE_WORKFLOW_RUNNER_IMPLEMENTATION_REPORT.md` | Implemented date note updated to clarify `migrations pending live apply` |

---

## 19. Corrections Made

| # | File | Correction | Severity |
|---|------|-----------|---------|
| 1 | `20260622150000_erp_dms_ai_phase9_job_queue.sql` | Added `CHECK (job_status IN (...))` on `dms_ai_job_queue.job_status` | **Medium — data integrity** |
| 2 | `20260622150000_erp_dms_ai_phase9_job_queue.sql` | Added `CHECK (status IN ('running','completed','failed','timed_out'))` on `dms_ai_job_attempts.status` | **Medium — data integrity** |
| 3 | `src/lib/dms/ai-jobs/job-types.ts` | Added `RUNNING: "running"` to `DMS_AI_ATTEMPT_STATUS` | **Low — completeness** |
| 4 | `src/lib/dms/ai-jobs/job-runner.ts` | Changed attempt insert `status` from `DMS_AI_ATTEMPT_STATUS.COMPLETED` to `DMS_AI_ATTEMPT_STATUS.RUNNING` | **Low — observability correctness** |
| 5 | `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md` | Date inconsistency corrected (`2026-06-21` → `2026-06-22`) | **Low — documentation** |
| 6 | `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | Same date correction | **Low — documentation** |

---

## 20. Remaining Blockers

| Blocker | Status |
|---------|--------|
| Migrations not yet applied to live DB | **PENDING** — awaiting Sameer approval |
| `WORKER_SECRET` env var not yet configured | **PENDING** — required before enabling `DMS_AI_JOB_QUEUE_WORKER_ENABLED` |
| UAT not yet performed | **PENDING** — required before production enablement |

---

## 21. Safe Live Apply Checklist

```
[ ] Confirm corrected migrations are committed (CHECK constraints added)
[ ] Apply 20260622150000_erp_dms_ai_phase9_job_queue.sql
[ ] Apply 20260622151000_erp_dms_ai_phase9_job_queue_rpcs.sql
[ ] Apply 20260622152000_erp_dms_ai_phase9_feature_flags.sql
[ ] Confirm dms_ai_job_queue exists
[ ] Confirm dms_ai_job_attempts exists
[ ] Confirm RPCs exist: claim_dms_ai_jobs, complete_dms_ai_job, fail_dms_ai_job, recover_stale_dms_ai_jobs
[ ] Confirm feature flags exist and are false: DMS_AI_JOB_QUEUE, DMS_AI_JOB_QUEUE_WORKER_ENABLED
[ ] Confirm RLS enabled and forced on both tables
[ ] Confirm no broad policies (spot check SELECT policy)
[ ] Keep DMS_AI_JOB_QUEUE=false
[ ] Keep DMS_AI_JOB_QUEUE_WORKER_ENABLED=false
```

---

## 22. UAT Checklist After Live Apply

```
[ ] Keep both flags false and approve one test document — confirm inline orchestration still works
[ ] Enable DMS_AI_JOB_QUEUE=true only
[ ] Approve one test document
[ ] Confirm one post_approve_orchestration job is created in dms_ai_job_queue
[ ] Confirm job payload contains IDs only (sessionCode, documentId, uploadSessionId, approveRunId, source)
[ ] Confirm job remains queued when worker flag is false
[ ] Set WORKER_SECRET env var (32+ random characters)
[ ] Enable DMS_AI_JOB_QUEUE_WORKER_ENABLED=true
[ ] Call worker route with missing Authorization header — expect 401
[ ] Call worker route with wrong secret — expect 401
[ ] Call worker route with correct secret — expect job processed
[ ] Confirm dms_ai_job_attempts row created with status=running initially, then completed/failed
[ ] Confirm job_status=completed in dms_ai_job_queue
[ ] Confirm dms_upload_sessions.orchestration_status=complete or complete_with_warnings
[ ] Set DMS_AI_JOB_QUEUE=false
[ ] Approve another test document — confirm inline fallback works (Phase 5 behavior)
```

---

## 23. Final Recommendation

**All corrections have been applied. The 3 migration files are safe to apply to the live database.**

Key points:
- **No breaking changes** — all feature flags remain `false` by default; zero live behavior change until explicitly enabled
- **Data integrity** — CHECK constraints now guard both status columns
- **Observability** — attempt records now correctly start as `running` before updating to `completed`/`failed`
- **Security** — RLS policies, worker route authentication, and payload safety all verified correct
- **Rollback** — trivial: set `DMS_AI_JOB_QUEUE=false` to revert to inline at any time

**Recommended apply sequence:**
1. Commit corrected migrations
2. Sameer approves: apply via MCP or `supabase db push`
3. Verify checklist (Section 21)
4. Perform UAT (Section 22) before enabling flags
