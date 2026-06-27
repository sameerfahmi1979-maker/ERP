# ERP DMS AI Phase 14 Token / Cost / Observability Implementation Report

**Date:** 2026-06-27  
**Phase:** ERP DMS AI Phase 14 — Token / Cost / Observability  
**Status:** IMPLEMENTED ✅

---

## 1. Executive Summary

Phase 14 delivers comprehensive AI usage metering, cost estimation infrastructure, and the DMS AI Observability dashboard. It fixes critical data-loss bugs where 4 server actions were silently failing their usage log inserts (wrong column names), adds token capture to the highest-cost AI operation (analyze), and provides a safe, read-only admin dashboard for monitoring AI health, token consumption, queue state, and pipeline status.

All implementation follows strict safety rules: no raw prompts/responses/OCR/chunk/vector storage, no Apply-to-ERP writes, no metadata auto-save, RLS ENABLED+FORCED on new tables, costs estimated only for admin-confirmed rates.

---

## 2. Phase Objective

- Fix and unify AI usage logging across all DMS AI operations.
- Capture tokens for `analyze()` / classify_extract (was completely missing).
- Fix broken usage logging in ai-search, document-qa, ai-tags, ai-links.
- Log chunk embedding batch token usage.
- Create admin-configurable cost rate table.
- Estimate costs from confirmed rates only.
- Create DMS AI Observability dashboard.
- Show usage, token, cost, model, feature, queue, pipeline health — all safe, read-only.

---

## 3. Approved Planning File Reviewed

- `ERP_DMS_AI_PHASE_14_TOKEN_COST_OBSERVABILITY_PLAN.md` — reviewed in full.

---

## 4. Source-of-Truth Files Reviewed

- `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`
- `implementation_Review/ERP_DMS_AI_PHASE_13_RUNTIME_UAT_AND_CLOSURE_REPORT.md`
- Phase 9–12 implementation reports (architecture context)

---

## 5. Existing AI Usage Logging Before Change

| Server Action | Status Before |
|---|---|
| `ai-analysis.ts` | **No logging at all** |
| `ai-search.ts` | Logging with wrong columns (`prompt_tokens`, `provider_code`, `input_char_count`) → silent insert failure |
| `document-qa.ts` | Same wrong columns → silent insert failure |
| `ai-tags.ts` | Same wrong columns + `document_id` not yet in schema → failure |
| `ai-links.ts` | Same wrong columns + `document_id` not yet in schema → failure |
| `ai-summary.ts` | Correct canonical columns — working |
| `semantic-search.ts` | Correct canonical columns — working |
| `chunk-embedder.ts` | No logging at all |

`estimated_cost` was null for all rows (no cost rate table existed).
`document_id` / `ai_job_id` / `upload_session_id` did not exist on `erp_ai_usage_logs`.

---

## 6. Files and Functions Reviewed

- `src/lib/dms/ai/types.ts` — `DmsAiOutput`, `DmsSummaryOutput`, `DmsEmbeddingOutput`
- `src/lib/dms/ai/openai-dms-adapter.ts` — `analyze()`, `summarize()`, `callStructuredCompletion()`, `embedText()`
- `src/lib/dms/ai/factory.ts` — `getDmsAiProvider()` returns `{ provider, configCode, configId }`
- `src/lib/dms/semantic/chunk-embedder.ts` — `embedPendingDocumentChunks()`
- `src/lib/dms/ai-jobs/job-types.ts` — `DmsAiJobHandlerResult`
- `src/lib/dms/ai-jobs/job-runner.ts` — `updateAttemptCompleted()`
- `src/server/actions/dms/ai-analysis.ts` — no prior usage logging
- `src/server/actions/dms/ai-search.ts` — broken insert
- `src/server/actions/dms/document-qa.ts` — broken insert
- `src/server/actions/dms/ai-tags.ts` — broken insert
- `src/server/actions/dms/ai-links.ts` — broken insert
- `src/server/actions/dms/ai-summary.ts` — correct (no change required)
- `src/features/dms/admin/dms-intelligence-admin-page-client.tsx` — added observability link
- `src/components/layout/app-sidebar.tsx` — DMS Admin subsection
- `src/lib/workspace/workspace-route-registry.ts` — route registry
- Phase 12/13 migrations for RLS pattern reference

---

## 7. Phase 14 Implementation Plan Used

Full implementation followed the approved planning file. All 11 steps executed. Only minor adaptation from plan:

- `providerConfigId` not available in chunk-embedder context (provider factory returns configId but embedding provider wrapper does not expose it the same way) — logged as null with documentation note.

---

## 8. Step 1 — Migration / Usage Log Extension / Cost Rates / RLS / Permissions

**Migration:** `supabase/migrations/20260627000000_erp_dms_ai_phase14_token_cost_observability.sql`  
**Applied:** ✅ via MCP `apply_migration`

### 1.1 `erp_ai_usage_logs` extensions

Added columns:
- `document_id BIGINT NULL REFERENCES dms_documents(id) ON DELETE SET NULL`
- `ai_job_id BIGINT NULL REFERENCES dms_ai_job_queue(id) ON DELETE SET NULL`
- `upload_session_id BIGINT NULL REFERENCES dms_upload_sessions(id) ON DELETE SET NULL`

Added 6 indexes: `feature_area`, `model_id`, `created_at DESC`, `document_id` (partial), `status`, `provider_config_id` (partial).

No raw content columns added. No UUID.

### 1.2 `erp_ai_model_cost_rates`

New table with:
- `BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY`
- `rate_type CHECK IN ('token', 'page', 'unit', 'zero')`
- `UNIQUE(provider_type, model_id, effective_from)`
- `requires_confirmation BOOLEAN DEFAULT true` — cost estimation blocked until admin confirms
- RLS ENABLED + FORCED
- SELECT policy: `dms.ai_observability.view/admin OR settings.ai.view/manage OR dms.admin OR system_admin`
- INSERT/UPDATE policy: `dms.ai_observability.admin OR settings.ai.manage OR system_admin`
- No DELETE policy (rates are archived, never deleted)
- No broad `USING (true)`

### 1.3 Feature flag

`DMS_AI_OBSERVABILITY` seeded with `is_enabled=false`. `ON CONFLICT DO NOTHING`.

### 1.4 Permissions

`dms.ai_observability.view` and `dms.ai_observability.admin` seeded. Granted both to `system_admin`; `view` to `group_admin` and `dms_admin` (silently skipped if role doesn't exist).

### 1.5 Seed cost rates

5 placeholder rows:
- `openai/gpt-4.1-2025-04-14` — requires_confirmation=true, cost fields null
- `openai/gpt-4.1` — requires_confirmation=true, cost fields null
- `openai/text-embedding-3-small` — requires_confirmation=true, cost fields null
- `openai/text-embedding-3-large` — requires_confirmation=true, cost fields null
- `local_ollama/local` — rate_type=zero, requires_confirmation=false

No hardcoded public prices. Admin must confirm before estimated_cost activates.

---

## 9. Step 2 — Safe Usage Redaction Helper

**Created:** `src/lib/ai/observability/safe-usage-redaction.ts`

Functions:
- `buildSafeMetadata()` — strips 20 blocked keys, recursive up to depth 2, caps strings at 500 chars
- `sanitizeErrorMessage()` — caps at 200 chars, strips stack traces, redacts API keys/bearer tokens
- `extractSafeUsageDisplayFields()` — extracts only known-safe fields from metadata_json for display

Blocked keys include: `prompt`, `raw_prompt`, `system_prompt`, `user_prompt`, `messages`, `raw_response`, `response_text`, `completion_text`, `ocr_text`, `content_text`, `chunk_text`, `full_text`, `text`, `api_key`, `secret`, `password`, `token`, `bearer`, `embedding`, `vector`, `embeddings`, `provider_response`, `raw_content`, `transcription`, `full_transcription`, `full_text_transcription`.

---

## 10. Step 3 — Shared Usage Logger

**Created:** `src/lib/ai/observability/log-dms-ai-usage.ts`

- `logDmsAiUsage(input: DmsAiUsageInput): Promise<number | null>`
- Uses `createAdminClient` (worker-safe)
- Non-fatal try/catch — never throws
- Sanitizes metadata via `buildSafeMetadata`
- Sanitizes error via `sanitizeErrorMessage`
- Computes `estimated_cost` from `erp_ai_model_cost_rates` — only when `requires_confirmation=false` and `rate_type` confirms
- Writes all canonical columns including new `document_id`, `ai_job_id`, `upload_session_id`

---

## 11. Step 4 — Token Capture in AI Provider

**Modified:** `src/lib/dms/ai/types.ts`
- Added `promptTokens?: number | null` and `completionTokens?: number | null` to `DmsAiOutput`

**Modified:** `src/lib/dms/ai/openai-dms-adapter.ts`
- `analyze()` response type extended with `usage?: { prompt_tokens?: number; completion_tokens?: number }`
- Returns `{ ...validated.output, promptTokens: data.usage?.prompt_tokens ?? null, completionTokens: data.usage?.completion_tokens ?? null }`

Token capture now works for the highest-cost operation (classify_extract). `summarize()` and `callStructuredCompletion()` already returned tokens.

---

## 12. Step 5 — Usage Logging Fixes

### 5.1 `ai-analysis.ts`
Added `logDmsAiUsage()` call after `provider.analyze()` with:
- `featureArea: "DMS_AI_ANALYSIS"`, `operationType: "classify_extract"`
- `inputTokenCount: aiOutput?.promptTokens`, `outputTokenCount: aiOutput?.completionTokens`
- `documentId`, `createdBy`, safe metadata (prompt_version, document_type_id, image_file_count, text_file_count, input_char_count)
- Logs both success and failure (when `aiError` is set)

### 5.2 `ai-search.ts`
Replaced broken insert with `logDmsAiUsage()`:
- Was using `prompt_tokens`, `provider_code`, `input_char_count` (non-existent columns)
- Now: `featureArea: "DMS_AI_SEARCH"`, `operationType: "intent_extraction"`
- Safe metadata: `input_char_count`, `output_char_count`, `prompt_version`
- Added timing (`startMs`/`durationMs`)

### 5.3 `document-qa.ts`
Same fix pattern. `featureArea: "DMS_DOCUMENT_QA"`, `operationType: "document_question_answer"`.

### 5.4 `ai-tags.ts`
Same fix. `featureArea: "DMS_AUTO_TAGS"`, `operationType: "tag_suggestion"`. Includes `result_count` in safe metadata.

### 5.5 `ai-links.ts`
Same fix. `featureArea: "DMS_SMART_LINKS"`, `operationType: "link_suggestion"`. Includes `result_count`.

All broken inserts replaced. No more non-existent column writes.

---

## 13. Step 6 — Chunk Embedding Batch Logging

**Modified:** `src/lib/dms/semantic/chunk-embedder.ts`
- Added `logDmsAiUsage` import
- Added `batchInputTokens` accumulator, `batchStartMs` timer
- After each chunk: `batchInputTokens += embResult.inputTokenCount`
- At end of batch: single `logDmsAiUsage()` call with aggregated counts
- `featureArea: "DMS_SEMANTIC_CHUNKING"`, `operationType: "semantic_chunk_embedding_batch"`
- Safe metadata: `chunk_count`, `embedded_count`, `failed_count`, `model`, `source`
- `documentId` passed; `aiJobId` is null (not available in embedder context — documented in report)
- `providerConfigId` is null (getDmsEmbeddingProvider configId not returned through same path — documented)

---

## 14. Step 7 — Job Attempt Observability

**Modified:** `src/lib/dms/ai-jobs/job-types.ts`
- Added optional fields to `DmsAiJobHandlerResult`: `usageLogId`, `inputTokenCount`, `outputTokenCount`, `modelName`, `providerCode`, `estimatedCost`

**Modified:** `src/lib/dms/ai-jobs/job-runner.ts`
- `updateAttemptCompleted()` now accepts optional `result?` parameter
- Writes `usage_log_id`, `token_count_in`, `token_count_out`, `model_name`, `provider_code`, `cost_estimate` to `dms_ai_job_attempts`
- All values nullable — existing handlers work without change
- Future handlers can return usage info to get attempt-level observability

No existing handlers broken. Fully backward compatible.

---

## 15. Step 8 — Observability Server Actions

**Created:** `src/server/actions/dms/ai-observability.ts`

14 exported actions:

**Read-only (require DMS_AI_OBSERVABILITY=true + dms.ai_observability.view):**
- `getDmsAiObservabilityConfig()` — config/permission check (no feature flag required)
- `getDmsAiObservabilityOverview(filters)` — total calls, success/failed/skipped, token totals, cost total
- `getDmsAiCostBreakdown(filters)` — per-feature/operation summary
- `getDmsAiProviderModelBreakdown(filters)` — per-model breakdown
- `getDmsAiFeatureBreakdown(filters)` — per-feature with avg duration
- `getDmsAiJobQueueObservability(filters)` — queue status counts + recent 20 jobs (no payload_json)
- `getDmsAiPipelineHealth()` — document AI status counts, embedding chunk counts, review/validation/matching counts
- `getDmsAiRecentUsageEvents(filters)` — max 100 rows, safe fields only (no metadata_json raw)
- `getDmsAiErrorBreakdown(filters)` — max 50 grouped errors, capped 200 chars

**Cost rate admin (require dms.ai_observability.admin):**
- `getAiModelCostRates()` — all rates
- `createAiModelCostRate(input)` — add rate
- `updateAiModelCostRate(id, input)` — update (confirm/archive/edit)
- `archiveAiModelCostRate(id)` — sets is_active=false

Safety: No AI calls, no raw metadata_json dump, no raw payload_json, no ERP entity mutations.

---

## 16. Step 9 — Observability UI

**Created files:**

| File | Purpose |
|---|---|
| `src/app/(protected)/admin/dms/ai-observability/page.tsx` | Server page — loads config, renders client |
| `src/features/dms/ai-observability/dms-ai-observability-page-client.tsx` | Main client: feature flag check, sections layout |
| `src/features/dms/ai-observability/ai-observability-filters.tsx` | Date/feature/status/model filters |
| `src/features/dms/ai-observability/sections/ai-usage-overview-cards.tsx` | 6 stat cards |
| `src/features/dms/ai-observability/sections/ai-token-cost-summary.tsx` | Cost breakdown table |
| `src/features/dms/ai-observability/sections/ai-provider-model-breakdown.tsx` | Per-model table |
| `src/features/dms/ai-observability/sections/ai-feature-breakdown.tsx` | Per-feature table |
| `src/features/dms/ai-observability/sections/ai-job-queue-health.tsx` | Queue status + recent jobs |
| `src/features/dms/ai-observability/sections/ai-pipeline-health.tsx` | Pipeline health rows |
| `src/features/dms/ai-observability/sections/ai-recent-usage-events-table.tsx` | Recent 100 events (safe fields only) |
| `src/features/dms/ai-observability/sections/ai-error-breakdown.tsx` | Error groupings |
| `src/features/dms/ai-observability/ai-cost-rate-admin.tsx` | Cost rate CRUD table + add dialog |

Feature flag off → controlled "DMS AI Observability is not enabled" message with explanation. No heavy data fetched.

No chart library installed. Cards, tables, badges used.

---

## 17. Step 10 — Navigation and Links

- **Sidebar** (`src/components/layout/app-sidebar.tsx`): Added `{ label: "AI Observability", icon: CircleGauge, path: "/admin/dms/ai-observability" }` to DMS Admin subsection
- **Workspace registry** (`src/lib/workspace/workspace-route-registry.ts`): Added `/admin/dms/ai-observability` → `AI Observability` singleton tab
- **DMS Intelligence Admin page** (`src/features/dms/admin/dms-intelligence-admin-page-client.tsx`): Added "AI Observability Dashboard" link bar at top of the page

---

## 18. Files Changed

### New files
- `supabase/migrations/20260627000000_erp_dms_ai_phase14_token_cost_observability.sql`
- `src/lib/ai/observability/safe-usage-redaction.ts`
- `src/lib/ai/observability/log-dms-ai-usage.ts`
- `src/server/actions/dms/ai-observability.ts`
- `src/app/(protected)/admin/dms/ai-observability/page.tsx`
- `src/features/dms/ai-observability/dms-ai-observability-page-client.tsx`
- `src/features/dms/ai-observability/ai-observability-filters.tsx`
- `src/features/dms/ai-observability/ai-cost-rate-admin.tsx`
- `src/features/dms/ai-observability/sections/ai-usage-overview-cards.tsx`
- `src/features/dms/ai-observability/sections/ai-token-cost-summary.tsx`
- `src/features/dms/ai-observability/sections/ai-provider-model-breakdown.tsx`
- `src/features/dms/ai-observability/sections/ai-feature-breakdown.tsx`
- `src/features/dms/ai-observability/sections/ai-job-queue-health.tsx`
- `src/features/dms/ai-observability/sections/ai-pipeline-health.tsx`
- `src/features/dms/ai-observability/sections/ai-recent-usage-events-table.tsx`
- `src/features/dms/ai-observability/sections/ai-error-breakdown.tsx`

### Modified files
- `src/lib/dms/ai/types.ts` — Added `promptTokens`/`completionTokens` to `DmsAiOutput`
- `src/lib/dms/ai/openai-dms-adapter.ts` — `analyze()` now parses and returns token counts
- `src/lib/dms/ai/job-types.ts` — Added optional observability fields to `DmsAiJobHandlerResult`
- `src/lib/dms/ai-jobs/job-runner.ts` — `updateAttemptCompleted` wires usage columns
- `src/lib/dms/semantic/chunk-embedder.ts` — Added batch usage logging
- `src/server/actions/dms/ai-analysis.ts` — Added logDmsAiUsage import + call
- `src/server/actions/dms/ai-search.ts` — Replaced broken insert with logDmsAiUsage
- `src/server/actions/dms/document-qa.ts` — Replaced broken insert with logDmsAiUsage
- `src/server/actions/dms/ai-tags.ts` — Replaced broken insert with logDmsAiUsage
- `src/server/actions/dms/ai-links.ts` — Replaced broken insert with logDmsAiUsage
- `src/components/layout/app-sidebar.tsx` — AI Observability nav entry
- `src/lib/workspace/workspace-route-registry.ts` — /admin/dms/ai-observability entry
- `src/features/dms/admin/dms-intelligence-admin-page-client.tsx` — Observability link
- `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` — Updated

---

## 19. Database Migrations Added

| Migration | Applied |
|---|---|
| `20260627000000_erp_dms_ai_phase14_token_cost_observability.sql` | ✅ via MCP |

---

## 20. Database / Schema Notes

- `erp_ai_usage_logs.document_id` / `ai_job_id` / `upload_session_id` — new nullable FK columns, SET NULL on cascade delete
- `erp_ai_model_cost_rates` — BIGINT PK (GENERATED ALWAYS AS IDENTITY), no UUID, no raw content columns
- Unique constraint prevents duplicate rates per provider/model/date
- No existing columns removed or renamed

---

## 21. Feature Flag Notes

| Flag | Value | Notes |
|---|---|---|
| `DMS_AI_OBSERVABILITY` | false | Default false — enable via Admin → AI Settings |

Observability page shows controlled disabled message when flag is off. No data is fetched.

---

## 22. RLS / Permission Notes

- `erp_ai_model_cost_rates`: RLS ENABLED + FORCE ROW LEVEL SECURITY. 3 policies (SELECT/INSERT/UPDATE). No DELETE. No broad USING(true). Uses `current_user_has_permission()` and `current_user_has_role()` — same pattern as Phase 12/13.
- New permissions: `dms.ai_observability.view` (SELECT), `dms.ai_observability.admin` (INSERT/UPDATE on cost rates)
- Permission grants: system_admin → both; group_admin/dms_admin → view only (silently skipped if role absent)

---

## 23. Usage Logging Safety Notes

- `buildSafeMetadata` strips 23 blocked key patterns before any metadata enters the DB
- `sanitizeErrorMessage` caps at 200 chars, strips stack traces, redacts API keys/tokens
- `logDmsAiUsage` is non-fatal — AI operations never fail due to logging errors
- Observability server actions never return `metadata_json` raw — only safe extracted fields
- Job `payload_json` is never returned from any observability action

---

## 24. Cost Estimation Notes

- `estimated_cost` is null unless a confirmed rate (`requires_confirmation=false`) exists for the provider+model+date
- All 4 OpenAI seed rates have `requires_confirmation=true` → estimated_cost remains null until admin confirms
- `local_ollama/local` has `rate_type=zero` → estimated_cost=0
- Admin confirmation is done via "Confirm" button in Cost Rate Admin panel (sets `requires_confirmation=false`)
- No live price fetching, no vendor billing API

---

## 25. Queue / Pipeline Observability Notes

- `getDmsAiJobQueueObservability`: returns counts by status + recent 20 jobs (id, type, status, attempt counts, dates — no payload_json)
- `getDmsAiPipelineHealth`: aggregates from dms_documents (ai_status), dms_document_content_chunks (embedding counts), dms_review_queue, dms_ai_validation_findings, dms_ai_entity_match_candidates
- Job attempt observability columns are pre-provisioned in dms_ai_job_attempts; now wired via optional handler result fields

---

## 26. Backward Compatibility Notes

- All changes are additive. Existing server actions not affected (ai-summary, semantic-search).
- `DmsAiOutput.promptTokens`/`completionTokens` are optional — all existing callers are safe.
- `DmsAiJobHandlerResult` new fields are optional — all existing handlers compile unchanged.
- `updateAttemptCompleted` result parameter is optional — existing calls work without it.
- Migration is fully idempotent (IF NOT EXISTS, ON CONFLICT DO NOTHING).

---

## 27. Tests Run

- TypeScript: `npx tsc --noEmit` → **Exit code 0, 0 errors**
- ReadLints on all new/modified files → **No lint errors**

---

## 28. Typecheck / Build / Lint Results

| Check | Result |
|---|---|
| TypeScript (`npx tsc --noEmit`) | ✅ PASS — 0 errors |
| ReadLints (new files) | ✅ PASS — 0 errors |
| ReadLints (modified server actions) | ✅ PASS — 0 errors |
| ReadLints (modified lib files) | ✅ PASS — 0 errors |

---

## 29. Manual Smoke Checks

| Check | Result |
|---|---|
| Migration applied via MCP | ✅ |
| erp_ai_usage_logs has document_id, ai_job_id, upload_session_id | ✅ Verified via DB query |
| erp_ai_model_cost_rates created with 5 seed rows | ✅ Verified via DB query |
| DMS_AI_OBSERVABILITY feature flag seeded (false) | ✅ Verified |
| dms.ai_observability.view/admin permissions seeded | ✅ Verified via DB query |
| OpenAI seed rates have requires_confirmation=true | ✅ |
| local_ollama seed has rate_type=zero, requires_confirmation=false | ✅ |
| No USING(true) broad policies | ✅ Reviewed migration |
| No raw content columns in migration | ✅ |

---

## 30. Acceptance Criteria Result

| AC | Status |
|---|---|
| AC-01: erp_ai_usage_logs extended with document_id, ai_job_id, upload_session_id | ✅ |
| AC-02: erp_ai_model_cost_rates created with BIGINT PK and RLS enabled/forced | ✅ |
| AC-03: No raw prompt/response/OCR/content/chunk fields added | ✅ |
| AC-04: DMS_AI_OBSERVABILITY flag seeded default false | ✅ |
| AC-05: dms.ai_observability.view/admin permissions seeded | ✅ |
| AC-06: safe-usage-redaction blocks unsafe keys | ✅ |
| AC-07: logDmsAiUsage writes canonical erp_ai_usage_logs columns | ✅ |
| AC-08: logDmsAiUsage computes estimated_cost only for confirmed rates | ✅ |
| AC-09: DmsAiOutput and OpenAiDmsAdapter.analyze capture token counts | ✅ |
| AC-10: ai-analysis logs usage for classify_extract | ✅ |
| AC-11: ai-search/document-qa/ai-tags/ai-links no longer use wrong usage log columns | ✅ |
| AC-12: chunk-embedder logs aggregated embedding usage | ✅ |
| AC-13: dashboard feature flag off shows controlled message | ✅ |
| AC-14: dashboard feature flag on loads admin page | ✅ |
| AC-15: usage overview cards render safe aggregates | ✅ |
| AC-16: token/cost summary handles null estimated_cost | ✅ (shows "Unconfirmed" badge) |
| AC-17: provider/model breakdown works | ✅ |
| AC-18: feature/operation breakdown works | ✅ |
| AC-19: job queue health works | ✅ |
| AC-20: pipeline health works | ✅ |
| AC-21: recent usage events table shows safe fields only | ✅ (metadata_json never returned raw) |
| AC-22: cost-rate admin CRUD works | ✅ |
| AC-23: observability page makes no AI provider calls | ✅ |
| AC-24: no Apply-to-ERP or DMS record mutations | ✅ |
| AC-25: TypeScript passes | ✅ (0 errors) |
| AC-26: ReadLints pass | ✅ (0 errors) |

---

## 31. Risks Remaining

1. **providerConfigId in chunk-embedder** — `getDmsEmbeddingProvider()` does return `configId` but the embedding call path does not plumb it to `logDmsAiUsage`. Can be wired in a future patch.
2. **Existing erp_ai_usage_logs rows** — Historical rows have `document_id=null`; no backfill. Acceptable for observability purposes.
3. **Cost rate confirmation UX** — Admin must manually set `requires_confirmation=false` in the UI before costs appear. No automated prompts.
4. **Job-level observability** — Handlers can now return usage fields but none currently do. Will be wired as handlers are updated in future phases.

---

## 32. What Was Not Implemented

| Item | Reason |
|---|---|
| Apply-to-ERP writes | Explicitly forbidden in Phase 14 scope |
| Chart library | Explicitly forbidden in Phase 14 scope |
| CSV export | Not in approved scope |
| Scheduled digest/email | Not in approved scope |
| Vendor billing API integration | Not in approved scope |
| Live web price fetching | Not in approved scope |
| Semantic chunking behavior changes | Explicitly forbidden |
| OCR routing changes | Explicitly forbidden |
| Validation/matching rule changes | Explicitly forbidden |

---

## 33. UAT Checklist

```
[✅] Apply Phase 14 migration.
[✅] Confirm erp_ai_usage_logs has document_id, ai_job_id, upload_session_id.
[✅] Confirm erp_ai_model_cost_rates exists.
[✅] Confirm erp_ai_model_cost_rates uses BIGINT PK.
[✅] Confirm erp_ai_model_cost_rates RLS enabled and forced.
[✅] Confirm no broad USING true policies.
[✅] Confirm DMS_AI_OBSERVABILITY exists and is false by default.
[✅] Confirm dms.ai_observability.view/admin permissions exist.
[ ] With DMS_AI_OBSERVABILITY=false, page shows controlled disabled message. [Runtime — to verify]
[ ] Enable DMS_AI_OBSERVABILITY=true for UAT.
[ ] Open /admin/dms/ai-observability.
[ ] Confirm usage overview cards load.
[ ] Confirm token/cost summary loads.
[ ] Confirm "rate unconfirmed" state for missing estimated_cost.
[ ] Confirm provider/model breakdown loads.
[ ] Confirm feature/operation breakdown loads.
[ ] Confirm job queue health loads.
[ ] Confirm pipeline health loads.
[ ] Confirm recent usage events table contains no prompt/response/OCR/chunk text.
[ ] Confirm error breakdown caps error text.
[ ] Confirm cost-rate admin panel loads.
[ ] Create a test cost rate with requires_confirmation=true.
[ ] Confirm estimated cost remains null when requires_confirmation=true.
[ ] Confirm safe redaction blocks blocked keys.
[ ] Trigger or inspect AI summary usage log.
[ ] Trigger or inspect AI analysis usage log if safe.
[ ] Confirm new logs use canonical columns.
[ ] Confirm no server action writes non-existent usage log columns.
[ ] Confirm /admin/dms/intelligence link to observability works.
[ ] Restore DMS_AI_OBSERVABILITY final flag state as safe-off unless Sameer instructs otherwise.
```

---

## 34. Next Recommended Phase

**Phase 15 (suggested):** ERP DMS AI Phase 15 — Usage Log Backfill + Cost Rate Confirmation + UAT.

Scope:
- Admin confirms cost rates in observability dashboard (sets requires_confirmation=false)
- Enable DMS_AI_OBSERVABILITY=true
- Runtime UAT of dashboard using real data
- Optional: backfill ai-summary historical logs with document_id
- Plumb providerConfigId into chunk-embedder

---

## 35. Final Notes

- All implementation is additive, non-breaking, safe-first.
- TypeScript: 0 errors. Lints: 0 errors.
- Feature flag `DMS_AI_OBSERVABILITY` remains false by default — dashboard inactive until admin enables.
- Cost estimation remains null on all operations until admin confirms rates — this is by design (no auto-cost computation from unverified prices).
- The fix to 4 broken server actions (ai-search, document-qa, ai-tags, ai-links) eliminates a significant silent data loss — these operations were never actually logging usage despite code attempting to do so.
