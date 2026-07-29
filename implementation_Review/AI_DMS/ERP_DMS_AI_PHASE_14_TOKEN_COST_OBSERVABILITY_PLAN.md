# ERP DMS AI Phase 14 — Token / Cost / Observability Plan

**Phase**: ERP DMS AI Phase 14 — Token / Cost / Observability  
**Type**: Planning document (no implementation)  
**Status**: DRAFT — pending ChatGPT review before implementation  
**Date**: 2026-06-25  
**Author**: Cursor AI Agent (read-only planning)

---

## 1. Executive Summary

Phase 14 adds full **AI usage observability and cost metering** to the DMS AI stack. As of Phase 13 close, the ERP has a functioning `erp_ai_usage_logs` table but it is partially populated: only `DMS_AI_SUMMARY` and `DMS_SEMANTIC_SEARCH` paths write to it with correct column names. The two highest-cost operations — AI classification/extraction (`analyze()`) and background chunk embedding — log **nothing**. Four other server actions (`ai-search`, `document-qa`, `ai-tags`, `ai-links`) attempt to write usage logs but use non-existent column names and silently fail.

Phase 14 will:

1. **Fix and unify usage logging** across all DMS AI paths through a shared `logDmsAiUsage()` helper.
2. **Wire token capture** for `analyze()` and batch chunk embedding.
3. **Add `erp_ai_model_cost_rates`** for admin-configurable per-model cost rates.
4. **Compute `estimated_cost`** at log time when a rate is available.
5. **Extend `erp_ai_usage_logs`** with `document_id`, `ai_job_id`, and `upload_session_id` linking columns.
6. **Wire `dms_ai_job_attempts`** observability columns that Phase 9 pre-provisioned.
7. **Add a new `/admin/dms/ai-observability` page** with cards/tables for token, cost, queue, and pipeline health.
8. **Add new permissions** and a `DMS_AI_OBSERVABILITY` feature flag.

Phase 14 is **observability-only**. No AI calls, metadata writes, entity links, or OCR routing changes are made.

---

## 2. Planning Scope and Non-Implementation Rule

This document is planning-only. No source code, migrations, or schema changes are made in this document.

**This document plans. Implementation comes only after ChatGPT review approval.**

Phase 14 must not implement:
- Apply-to-ERP writes
- Metadata auto-save or entity auto-linking
- AI auto-rerun or automatic retries beyond Phase 9 runner
- OCR provider routing changes
- Semantic chunking behavioral changes
- Validation/matching rule changes
- Raw prompt/response storage
- Raw OCR/content/chunk text storage
- API key or secret storage
- Vendor billing API integration
- Live web price fetching

---

## 3. Files and Source-of-Truth Reviewed

### Source-of-truth files read

```
ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md
implementation_Review/ERP_DMS_AI_PHASE_13_RUNTIME_UAT_AND_CLOSURE_REPORT.md
implementation_Review/ERP_DMS_AI_PHASE_13_VALIDATION_CONFLICT_OWNER_MATCHING_IMPLEMENTATION_REPORT.md
implementation_Review/ERP_DMS_AI_PHASE_12_ASSIGN_TO_ME_FIX_AND_UAT_REPORT.md
```

### Source code files read and analyzed

```
src/lib/dms/ai/types.ts
src/lib/dms/ai/factory.ts
src/lib/dms/ai/openai-dms-adapter.ts
src/lib/dms/ai/azure-document-intelligence-adapter.ts
src/lib/ai/providers/factory.ts
src/lib/dms/semantic/chunk-builder.ts
src/lib/dms/semantic/chunk-embedder.ts
src/lib/dms/semantic/semantic-indexer.ts
src/lib/dms/ocr/pdf-text-provider.ts
src/lib/dms/ocr/azure-ocr-provider.ts
src/lib/dms/ai-jobs/job-types.ts
src/lib/dms/ai-jobs/job-runner.ts
src/lib/ai/common/field-suggestions/persistence.ts
src/server/actions/dms/ai-analysis.ts
src/server/actions/dms/ai-summary.ts
src/server/actions/dms/ai-search.ts
src/server/actions/dms/document-qa.ts
src/server/actions/dms/ai-tags.ts
src/server/actions/dms/ai-links.ts
src/server/actions/dms/semantic-search.ts
src/server/actions/dms/intelligence-admin.ts
src/features/dms/admin/dms-intelligence-admin-page-client.tsx
src/server/actions/settings/ai-settings.ts
```

### Missing expected files (not present in codebase)

```
src/server/actions/dms/ai-observability.ts     — does not exist (Phase 14 will create)
src/features/dms/ai-observability/             — does not exist (Phase 14 will create)
src/app/(protected)/admin/dms/ai-observability/— does not exist (Phase 14 will create)
src/lib/ai/observability/safe-usage-redaction.ts — does not exist (Phase 14 will create)
erp_ai_model_cost_rates table                  — does not exist (Phase 14 will create)
```

### Migrations read

```
supabase/migrations/20260614191500_erp_settings_1_ai_settings_provider_configuration.sql
supabase/migrations/20260616180000_erp_common_ai_0_governance_feature_flags_permissions.sql
supabase/migrations/20260622150000_erp_dms_ai_phase9_job_queue.sql
supabase/migrations/20260625100000_erp_dms_ai_phase11_semantic_chunks.sql
supabase/migrations/20260625200000_erp_dms_ai_phase12_review_queue_activation.sql
supabase/migrations/20260626100000_erp_dms_ai_phase13_validation_matching.sql
```

### Live DB queries run

```sql
-- erp_ai_usage_logs schema  → confirmed 14 columns
-- erp_ai_usage_logs sample  → 10 recent rows verified
-- feature distribution      → DMS_AI_SUMMARY (20), DMS_SEMANTIC_SEARCH (34), settings_test (10), ERP_AI_AUDIT_EXPLAINER (1)
-- estimated_cost             → NULL across all 65 rows (cost never computed)
-- dms_ai_job_queue status   → queued: 1, retry_scheduled: 3, completed: 5
-- dms_ai_job_attempts total → 11 attempts
```

---

## 4. Current AI Usage Logging Inventory

### 4.1 `erp_ai_usage_logs` Current Schema

```sql
id                BIGINT PRIMARY KEY
provider_config_id BIGINT FK → erp_ai_provider_configs (nullable)
feature_area      TEXT NOT NULL            -- canonical: DMS_AI_SUMMARY, DMS_SEMANTIC_SEARCH, etc.
operation_type    TEXT NOT NULL            -- canonical: summary_generate, embedding_generate, etc.
model_id          TEXT                     -- e.g. gpt-4.1-2025-04-14, text-embedding-3-small
status            TEXT NOT NULL            -- "complete" | "failed" (code uses both "complete" and "success")
input_token_count INT                      -- prompt tokens (nullable)
output_token_count INT                     -- completion tokens (nullable)
estimated_cost    NUMERIC(12,6)            -- always NULL today; column exists but never written
duration_ms       INT
error_message     TEXT
metadata_json     JSONB                    -- flexible: document_id, prompt_version, char counts
created_by        BIGINT FK → user_profiles
created_at        TIMESTAMPTZ
```

**Columns confirmed absent** from schema (some server actions try to write these, failing silently):
- `prompt_tokens` — used by `ai-search`, `document-qa`, `ai-tags`, `ai-links` (wrong)
- `completion_tokens` — same files (wrong; correct column is `output_token_count`)
- `provider_code` — used by same files (wrong)
- `document_id` — used by same files as top-level (should be in `metadata_json`)
- `input_char_count`, `output_char_count` — used by same files (should be in `metadata_json`)

### 4.2 Current Usage by Path

| DMS Path | feature_area | operation_type | Tokens captured | Rows in DB | Status |
|---|---|---|---|---|---|
| AI Summary | `DMS_AI_SUMMARY` | `summary_generate` / `summary_regenerate` | input + output | **20 rows** | Correct canonical columns |
| Semantic embedding (doc) | `DMS_SEMANTIC_SEARCH` | `embedding_generate` / `embedding_regenerate` | input only | **19 rows** | Correct |
| Semantic search (query) | `DMS_SEMANTIC_SEARCH` | `semantic_search` | input only | **9 rows** | Correct |
| Find similar (no embed) | `DMS_SEMANTIC_SEARCH` | `find_similar_documents` | None | **4 rows** | No tokens (correct — no API call) |
| Audit explainer (Common AI) | `ERP_AI_AUDIT_EXPLAINER` | `explain_audit_log` | input + output | **1 row** | Correct |
| Settings test | `settings_test` | `test_connection` | None | **10 rows** | No tokens (correct) |
| AI Classification/Extraction | *(none)* | *(none)* | **None** | **0 rows** | **BUG: not logged at all** |
| AI Search (intent extract) | `DMS_AI_SEARCH` | `intent_extraction` | Available in provider | **0 rows** | **BUG: wrong columns → silent fail** |
| Document QA | `DMS_DOCUMENT_QA` | `document_question_answer` | Available in provider | **0 rows** | **BUG: wrong columns → silent fail** |
| AI Tags | `DMS_AUTO_TAGS` | `tag_suggestion` | Available in provider | **0 rows** | **BUG: wrong columns → silent fail** |
| AI Links | `DMS_SMART_LINKS` | `link_suggestion` | Available in provider | **0 rows** | **BUG: wrong columns → silent fail** |
| Chunk embedding (batch) | *(none)* | *(none)* | Available per-chunk | **0 rows** | **GAP: never logged** |
| OCR (Azure DI / PDF) | *(none)* | *(none)* | Not applicable (non-LLM) | **0 rows** | GAP — planned for future page-based cost |

### 4.3 Provider Token Return Shape

| Provider Method | Token return | Notes |
|---|---|---|
| `OpenAiDmsAdapter.analyze()` | **None returned** | Adapter parses JSON response but never reads `response.usage`; DmsAiOutput has no token fields |
| `OpenAiDmsAdapter.summarize()` | `promptTokens`, `completionTokens` | Returns from `data.usage.prompt_tokens` / `completion_tokens` |
| `OpenAiDmsAdapter.callStructuredCompletion()` | `promptTokens`, `completionTokens` | Same |
| `OpenAiDmsAdapter.embedText()` | `inputTokenCount` from `usage.prompt_tokens` | Input only (no output for embeddings) |
| `AzureDocumentIntelligenceAdapter` | **None** | Page-based billing; LLM methods throw |

---

## 5. Current Token and Cost Gaps

### Critical Gaps (blocking complete observability)

| Gap | Impact | Fix required |
|---|---|---|
| **G1**: `analyze()` returns no tokens | Highest-cost operation (classification/extraction) is invisible | Extend `DmsAiOutput` with optional token fields; parse `usage` in adapter |
| **G2**: `ai-analysis.ts` logs nothing | All analyze calls produce 0 usage rows | Add `erp_ai_usage_logs` write after analyze call |
| **G3**: 4 server actions use wrong column names | `ai-search`, `document-qa`, `ai-tags`, `ai-links` inserts silently fail | Refactor to use canonical columns + `metadata_json` for extra fields |
| **G4**: No shared DMS log helper | 7 different insert shapes; inconsistency grows | Create `logDmsAiUsage()` helper with typed input |
| **G5**: Chunk embedding not logged | Potentially hundreds of embed calls per document, 0 usage rows | Aggregate and log per-batch in `chunk-embedder.ts` |
| **G6**: `estimated_cost` never written | Cost column exists in schema and UI but is always null | Implement cost computation using `erp_ai_model_cost_rates` lookup |

### Structural Gaps

| Gap | Impact | Fix required |
|---|---|---|
| **G7**: No `document_id` FK on `erp_ai_usage_logs` | Cannot trace cost to a specific document | Add `document_id BIGINT` column (migration) |
| **G8**: No `ai_job_id` FK on `erp_ai_usage_logs` | Cannot link usage log to job queue item | Add `ai_job_id BIGINT` column (migration) |
| **G9**: `dms_ai_job_attempts` observability columns not wired | Phase 9 pre-provisioned `usage_log_id`, `token_count_in`, `token_count_out`, `model_name`, `provider_code`, `cost_estimate` but runner never populates them | Update job-runner to populate after handler completes |
| **G10**: No cost rate table | Cost can never be computed | Create `erp_ai_model_cost_rates` |
| **G11**: No DMS observability permissions | Non-settings admins cannot view DMS cost data | Add `dms.ai_observability.view` / `.admin` permissions |
| **G12**: No observability UI | No dashboard for AI ops | Create `/admin/dms/ai-observability` page |

---

## 6. Recommended Data Model

### 6.1 Extend `erp_ai_usage_logs` (Option A — minimal extension)

Add only the missing linking columns. Do **not** add raw text columns.

```sql
ALTER TABLE public.erp_ai_usage_logs
  ADD COLUMN document_id        BIGINT REFERENCES public.dms_documents(id) ON DELETE SET NULL,
  ADD COLUMN ai_job_id          BIGINT REFERENCES public.dms_ai_job_queue(id) ON DELETE SET NULL,
  ADD COLUMN upload_session_id  BIGINT REFERENCES public.dms_upload_sessions(id) ON DELETE SET NULL;

-- Performance indexes for dashboard queries
CREATE INDEX erp_ai_usage_logs_feature_area_idx ON public.erp_ai_usage_logs(feature_area);
CREATE INDEX erp_ai_usage_logs_model_id_idx ON public.erp_ai_usage_logs(model_id);
CREATE INDEX erp_ai_usage_logs_created_at_idx ON public.erp_ai_usage_logs(created_at DESC);
CREATE INDEX erp_ai_usage_logs_document_id_idx ON public.erp_ai_usage_logs(document_id) WHERE document_id IS NOT NULL;
CREATE INDEX erp_ai_usage_logs_status_idx ON public.erp_ai_usage_logs(status);
```

**Why not add `provider_code` or `total_tokens` as columns?**
- `provider_code` can be joined from `erp_ai_provider_configs` via `provider_config_id`.
- `total_tokens` = `COALESCE(input_token_count, 0) + COALESCE(output_token_count, 0)` — computed in queries, no column needed.
- Adding wrong-column-name fields as real columns would legitimize the bug; fix the callers instead.

**`status` normalization note:** Current code uses both `"complete"` and `"success"`. Plan must standardize to `"success" | "failed" | "skipped"` to match the migration comments. Existing rows using `"complete"` should be handled in queries with `status IN ('success', 'complete')`.

### 6.2 New Table: `erp_ai_model_cost_rates`

```sql
CREATE TABLE public.erp_ai_model_cost_rates (
  id                           BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  provider_type                TEXT NOT NULL,        -- openai | azure_openai | azure_document_intelligence | etc.
  model_id                     TEXT NOT NULL,        -- e.g. gpt-4.1-2025-04-14, text-embedding-3-small
  display_name                 TEXT,                 -- human label for UI
  rate_type                    TEXT NOT NULL,        -- token | page | unit
  input_cost_per_1m_tokens     NUMERIC(16,8),        -- USD per million input tokens (nullable if rate_type != token)
  output_cost_per_1m_tokens    NUMERIC(16,8),        -- USD per million output tokens
  unit_cost                    NUMERIC(16,8),        -- for page/unit-based (Azure DI)
  currency_code                TEXT NOT NULL DEFAULT 'USD',
  effective_from               DATE NOT NULL,
  effective_to                 DATE,                 -- NULL = currently active
  is_active                    BOOLEAN NOT NULL DEFAULT true,
  requires_confirmation        BOOLEAN NOT NULL DEFAULT true,  -- admin must confirm before using in cost calc
  source_note                  TEXT,                 -- e.g. "OpenAI published pricing 2025-04-01"
  created_by                   BIGINT REFERENCES public.user_profiles(id),
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_type, model_id, effective_from)
);

-- No raw prompt/response/API key columns.
-- RLS enabled + forced. See Section 15.
```

**Why `rate_type`?**
- LLM models bill per token (input + output)
- Embedding models bill per input token only
- Azure Document Intelligence bills per page
- Local/noop providers have zero cost
- Extensible to future providers

### 6.3 Cost Computation Helper (code pattern — not DB)

```typescript
// Not stored in DB — computed at insert time:
async function estimateCost(modelId: string, providerType: string, inputTokens: number, outputTokens: number): Promise<number | null> {
  const rate = await getActiveRate(providerType, modelId);
  if (!rate || rate.requires_confirmation) return null;
  if (rate.rate_type === 'token') {
    return (inputTokens / 1_000_000) * rate.input_cost_per_1m_tokens
         + (outputTokens / 1_000_000) * rate.output_cost_per_1m_tokens;
  }
  return null; // non-token rates not auto-estimated
}
```

If `requires_confirmation = true`, `estimated_cost = null` and dashboard shows "Rate unconfirmed".

### 6.4 No Aggregate Daily Table (Phase 14)

`erp_ai_usage_daily_summary` (Option C) is deferred. Daily aggregates can be computed via SQL GROUP BY on the main table with date truncation. If query performance becomes an issue, a materialized view or scheduled aggregate can be added in Phase 15.

---

## 7. Cost Estimation Strategy

### Principles

1. **Admin-configurable rates** — stored in `erp_ai_model_cost_rates`; never hardcoded.
2. **Versioned by effective date** — `effective_from` / `effective_to` allow historical accuracy.
3. **Computed at log time** — `estimated_cost` written to `erp_ai_usage_logs` when rate exists and `requires_confirmation = false`.
4. **Missing rate = null** — dashboard shows "Rate missing" or "Unconfirmed" without breaking display.
5. **No vendor billing API** — no live price fetch, no third-party billing integration.
6. **Currency default USD** — displayed in all dashboards; multi-currency deferred.
7. **Zero-cost providers** — `rate_type = 'zero'` for local/noop; cost shows $0.00.

### Per-provider strategy

| Provider type | Rate type | Cost computation |
|---|---|---|
| `openai` | `token` | input + output tokens × rates from `erp_ai_model_cost_rates` |
| `azure_openai` | `token` | Same |
| `azure_document_intelligence` | `page` | Page count × unit rate (future — no page count in current OCR result) |
| `tesseract` | `zero` | $0.00 |
| `local_ollama` | `zero` or `token` | Admin configures |
| `local_custom` | `zero` | $0.00 |
| `google_document_ai` | `page` | Future |
| `aws_textract` | `page` | Future |

### Seed plan

Phase 14 seeds `erp_ai_model_cost_rates` with **no rows by default** (or placeholder rows with `requires_confirmation = true`). Admin fills in rates after reviewing OpenAI/Azure published pricing. This avoids hardcoding potentially stale prices.

Optional: seed common models as `requires_confirmation = true` placeholders with `source_note = "Seed — confirm against OpenAI published pricing before use"`. See Section 16.

---

## 8. Observability Dashboard Scope

### Route

```
/admin/dms/ai-observability
```

Separate from `/admin/dms/intelligence` because:
- Scope is wider (all DMS AI providers + job queue + pipeline health)
- Different permission: `dms.ai_observability.view`
- Link from Intelligence admin to Observability

The DMS Intelligence admin page should get a "View AI Observability" link added.

### Dashboard sections (cards + tables; no charts — no chart library installed)

#### Section 1 — AI Usage Overview

| Card | Query source |
|---|---|
| Total requests today | `COUNT(*)` on `erp_ai_usage_logs` WHERE `DATE(created_at) = today` |
| Successful today | same + `status IN ('success','complete')` |
| Failed today | same + `status = 'failed'` |
| Unique models used today | `COUNT(DISTINCT model_id)` |
| Avg duration today (ms) | `AVG(duration_ms)` |
| Unique documents processed today | `COUNT(DISTINCT document_id) WHERE document_id IS NOT NULL` |

#### Section 2 — Token and Cost Summary

| Card | Notes |
|---|---|
| Input tokens today | `SUM(input_token_count)` |
| Output tokens today | `SUM(output_token_count)` |
| Total tokens today | `SUM(input_token_count + output_token_count)` |
| Estimated cost today | `SUM(estimated_cost)` — shows "N/A" if all null |
| Input tokens this month | MTD |
| Estimated cost this month | MTD |
| Rows with cost | count where `estimated_cost IS NOT NULL` |
| Rows missing cost | count where `estimated_cost IS NULL` (link to rate config) |

#### Section 3 — Provider / Model Breakdown

Table: top 10 models by request count, with columns:
`model_id | provider_config_name | requests | total_tokens | avg_duration_ms | estimated_cost`

#### Section 4 — Feature / Operation Breakdown

Table: top 20 by request count:
`feature_area | operation_type | requests | success_rate | total_tokens | estimated_cost | last_seen`

Sorted by estimated cost descending when available; by request count as fallback.

#### Section 5 — DMS AI Queue Health

From `dms_ai_job_queue`:

| Card | Value |
|---|---|
| Queued | `COUNT WHERE job_status='queued'` |
| Running | `COUNT WHERE job_status='running'` |
| Retry scheduled | `COUNT WHERE job_status='retry_scheduled'` |
| Failed | `COUNT WHERE job_status='failed'` |
| Completed today | count + today filter |
| Oldest queued | `MIN(created_at) WHERE job_status='queued'` |
| Stale running | count where `job_status='running' AND locked_at < now() - interval '30 min'` |
| Worker enabled | feature flag `DMS_AI_JOB_QUEUE_WORKER_ENABLED` — show YES/NO only |
| WORKER_SECRET set | env var present — show YES/NO only (never value) |

Job type breakdown table: `job_type | queued | running | retry | failed | completed`

#### Section 6 — DMS AI Pipeline Health

Metrics from `dms_documents`, `dms_document_files`, `dms_ai_extraction_results`, `dms_semantic_chunks`, `dms_review_queue`:

| Metric | Source |
|---|---|
| Documents with OCR text | `dms_documents WHERE ocr_text_available = true` |
| Documents missing OCR | `dms_documents WHERE ocr_text_available = false AND status != 'archived'` |
| Documents with AI summary | `dms_documents WHERE ai_summary IS NOT NULL` |
| Summary pending/failed | `dms_documents WHERE ai_summary_status IN ('pending','failed')` |
| Documents with AI analysis | count where `ai_result_id IS NOT NULL` (via extraction results join) |
| Semantic chunks total | `COUNT(*) FROM dms_semantic_chunks WHERE deleted_at IS NULL` |
| Chunks embedded (complete) | `COUNT WHERE embedding_status = 'complete'` |
| Chunks pending embedding | `COUNT WHERE embedding_status = 'pending'` |
| Chunks failed embedding | `COUNT WHERE embedding_status = 'failed'` |

#### Section 7 — Review Queue Pressure

From Phase 12/13 `dms_review_queue`:

| Metric | Source |
|---|---|
| Open review items | `COUNT WHERE status = 'open'` |
| Assigned | `COUNT WHERE status = 'assigned'` |
| In review | `COUNT WHERE status = 'in_review'` |
| Urgent/high open | `COUNT WHERE priority IN ('urgent','high') AND status = 'open'` |
| By review type | group by `review_type` for Phase 12 + Phase 13 types |

#### Section 8 — Validation / Matching Findings

From Phase 13:

| Metric | Source |
|---|---|
| Open validation findings | `COUNT FROM dms_ai_validation_findings WHERE status = 'open'` |
| By severity (error/warning/info) | group by severity |
| Open entity match candidates | `COUNT FROM dms_ai_entity_match_candidates WHERE status = 'pending'` |
| By target entity type | group by target_entity_type |

#### Section 9 — Recent Usage Events

Table showing last 100 usage log rows (safe fields only):

| Column | Notes |
|---|---|
| Time | `created_at` |
| Feature area | `feature_area` |
| Operation | `operation_type` |
| Model | `model_id` |
| Status | badge |
| Input tokens | `input_token_count` |
| Output tokens | `output_token_count` |
| Est. cost | `estimated_cost` |
| Duration ms | `duration_ms` |
| Document | link if `document_id IS NOT NULL` |

**No prompt, no response, no OCR text, no payload content.**

#### Section 10 — Error / Failure Analysis

Table: recent failed calls with:
`time | feature_area | operation_type | model_id | error_message (capped 200 chars) | duration_ms`

Table: job failures with:
`time | job_type | attempt_count | last_error_code | last_error_message (capped 200 chars)`

---

## 9. Filters and Drilldowns

### Dashboard filters

```
date_range        — today | yesterday | last_7d | last_30d | custom (from/to)
feature_area      — multi-select from distinct values in erp_ai_usage_logs
operation_type    — dependent on feature_area
provider_type     — from erp_ai_provider_configs join
model_id          — from distinct values
status            — success | failed | all
document_id       — text input (link to document record)
```

### Drilldowns (planned, Phase 14 basic implementation)

| Drilldown | Target |
|---|---|
| Feature area click | Filter to that feature area |
| Document ID | Link to `/dms/documents/record/{id}` |
| Job ID | Link to future job detail (queue item in intelligence admin) |
| Provider config | Link to settings AI provider |
| Review queue | Link to `/dms/review-queue` |

**No prompt/response display in any drilldown.**

### Payload display safety

Job `payload_json` is **never rendered** in the dashboard. Only safe scalar fields (`job_type`, `priority`, `attempt_count`, `last_error_code`, `last_error_message`) are shown.

---

## 10. Queue Observability Plan

### Metrics source

All queue metrics come from `dms_ai_job_queue` and `dms_ai_job_attempts`.

### Key metrics

```
total_queued            = COUNT WHERE job_status = 'queued'
total_running           = COUNT WHERE job_status = 'running'
total_retry_scheduled   = COUNT WHERE job_status = 'retry_scheduled'
total_failed            = COUNT WHERE job_status = 'failed'
total_completed_today   = COUNT WHERE job_status = 'completed' AND DATE(completed_at) = today
avg_duration_ms         = AVG(duration_ms) FROM dms_ai_job_attempts WHERE status = 'completed'
retry_distribution      = GROUP BY job_type, COUNT attempts per job
failure_code_dist       = GROUP BY last_error_code
oldest_queued_age_mins  = EXTRACT(EPOCH FROM now() - MIN(created_at)) / 60 WHERE status = 'queued'
stale_running_count     = COUNT WHERE job_status = 'running' AND locked_at < now() - '30min'
jobs_by_type            = GROUP BY job_type
```

### Worker health display

```
DMS_AI_JOB_QUEUE_WORKER_ENABLED: YES / NO  (feature flag only — no secret value)
WORKER_SECRET configured: YES / NO          (env var presence check only)
Last job processed: timestamp from MAX(completed_at)
```

### `dms_ai_job_attempts` wiring (Phase 14 implementation)

Phase 9 pre-provisioned these columns in `dms_ai_job_attempts` that are not yet written by the job runner:
```
usage_log_id     BIGINT → erp_ai_usage_logs
token_count_in   INT
token_count_out  INT
model_name       TEXT
provider_code    TEXT
cost_estimate    NUMERIC(12,6)
```

Phase 14 plan: After a job handler completes and logs usage, the job runner should:
1. Receive `usageLogId` from the handler result
2. Update the attempt row with `usage_log_id`, `token_count_in`, `token_count_out`, `model_name`, `provider_code`, `cost_estimate`

This requires handler return types to be extended with optional `usageLogId` field. Handlers that don't do AI (e.g., content_sync) return `undefined`.

---

## 11. DMS AI Pipeline Health Plan

### Data sources

| Metric group | Table(s) |
|---|---|
| OCR health | `dms_documents (ocr_status, ocr_text_available)` |
| AI summary health | `dms_documents (ai_summary_status, ai_summary)` |
| AI analysis | `dms_ai_extraction_results` (count per document) |
| Semantic chunks | `dms_semantic_chunks (embedding_status)` |
| Semantic jobs | `dms_ai_job_queue (job_type = 'semantic_document_index')` |
| Review queue | `dms_review_queue (status, review_type)` |
| Validation findings | `dms_ai_validation_findings (status, severity)` |
| Entity candidates | `dms_ai_entity_match_candidates (status, target_entity_type)` |

### Display format

Health panel shows as a 3-column grid of mini-cards per category. Each card shows:
- A label
- A number
- A color badge: green (good), yellow (needs attention), red (action needed)

**Thresholds (admin-configurable in future; for now hard-coded):**
- OCR missing > 10% of active docs → yellow
- Summary failed count > 0 → yellow
- Chunks pending > 50 → yellow
- Failed jobs > 5 → red
- Stale running > 0 → red
- Open urgent review items > 0 → red

---

## 12. Server Action Plan

### New file: `src/server/actions/dms/ai-observability.ts`

All actions are read-only (SELECT only). All require `DMS_AI_OBSERVABILITY` feature flag check and permission check.

#### Planned server actions

```typescript
// Overview cards data
getDmsAiObservabilityOverview(filters: DmsAiObservabilityFilters): Promise<ActionResult<DmsAiOverviewData>>

// Token + cost aggregates by date bucket
getDmsAiUsageTimeSeries(filters: DmsAiObservabilityFilters): Promise<ActionResult<DmsAiTimeSeriesRow[]>>

// Cost breakdown by feature/operation
getDmsAiCostBreakdown(filters: DmsAiObservabilityFilters): Promise<ActionResult<DmsAiCostBreakdownRow[]>>

// Provider/model breakdown
getDmsAiProviderModelBreakdown(filters: DmsAiObservabilityFilters): Promise<ActionResult<DmsAiProviderBreakdownRow[]>>

// Feature/operation breakdown
getDmsAiFeatureBreakdown(filters: DmsAiObservabilityFilters): Promise<ActionResult<DmsAiFeatureBreakdownRow[]>>

// Job queue health
getDmsAiJobQueueObservability(): Promise<ActionResult<DmsAiJobQueueData>>

// Pipeline health
getDmsAiPipelineHealth(): Promise<ActionResult<DmsAiPipelineHealthData>>

// Recent usage events (last 100, safe fields only)
getDmsAiRecentUsageEvents(filters: DmsAiObservabilityFilters): Promise<ActionResult<DmsAiUsageEventRow[]>>

// Error/failure analysis
getDmsAiErrorBreakdown(filters: DmsAiObservabilityFilters): Promise<ActionResult<DmsAiErrorBreakdownData>>

// Feature flag + config state
getDmsAiObservabilityConfig(): Promise<ActionResult<DmsAiObservabilityConfig>>
```

#### Cost rate admin actions (in same file or separate `ai-cost-rates.ts`)

```typescript
getAiModelCostRates(): Promise<ActionResult<AiModelCostRate[]>>
createAiModelCostRate(input: AiModelCostRateInput): Promise<ActionResult<AiModelCostRate>>
updateAiModelCostRate(id: number, input: Partial<AiModelCostRateInput>): Promise<ActionResult<AiModelCostRate>>
archiveAiModelCostRate(id: number): Promise<ActionResult<void>>
```

#### Shared DMS usage log helper (new file)

```typescript
// src/lib/ai/observability/log-dms-ai-usage.ts
export interface DmsAiUsageInput {
  providerConfigId?: number | null;
  featureArea: string;
  operationType: string;
  modelId?: string | null;
  status: 'success' | 'failed' | 'skipped';
  inputTokenCount?: number | null;
  outputTokenCount?: number | null;
  durationMs?: number | null;
  errorMessage?: string | null;
  documentId?: number | null;
  aiJobId?: number | null;
  uploadSessionId?: number | null;
  createdBy?: number | null;
  metadata?: Record<string, unknown> | null;  // document_id, prompt_version, char_counts — safe only
}

export async function logDmsAiUsage(input: DmsAiUsageInput): Promise<number | null>
// Returns inserted id or null on error (non-fatal, try/catch internally)
```

**Safety rules for `logDmsAiUsage`:**
- Never accept a `promptText`, `responseText`, `ocrText`, `chunkText`, `apiKey`, or `rawResponse` field
- `metadata` values are sanitized — strings capped at 500 chars
- Cost computed from `erp_ai_model_cost_rates` lookup if rate available

#### `DmsAiOutput` type extension (in `src/lib/dms/ai/types.ts`)

```typescript
// Add optional token fields to DmsAiOutput:
promptTokens?: number | null;
completionTokens?: number | null;
```

Then `OpenAiDmsAdapter.analyze()` parses `response.usage.prompt_tokens` / `completion_tokens` and returns them in `DmsAiOutput`.

---

## 13. UI / UX Plan

### New files to create

```
src/app/(protected)/admin/dms/ai-observability/page.tsx
src/features/dms/ai-observability/dms-ai-observability-page-client.tsx
src/features/dms/ai-observability/sections/ai-usage-overview-cards.tsx
src/features/dms/ai-observability/sections/ai-token-cost-summary.tsx
src/features/dms/ai-observability/sections/ai-provider-model-breakdown.tsx
src/features/dms/ai-observability/sections/ai-feature-breakdown.tsx
src/features/dms/ai-observability/sections/ai-job-queue-health.tsx
src/features/dms/ai-observability/sections/ai-pipeline-health.tsx
src/features/dms/ai-observability/sections/ai-recent-usage-events-table.tsx
src/features/dms/ai-observability/sections/ai-error-breakdown.tsx
src/features/dms/ai-observability/ai-observability-filters.tsx
src/features/dms/ai-observability/ai-cost-rate-admin.tsx
src/lib/ai/observability/log-dms-ai-usage.ts
src/lib/ai/observability/safe-usage-redaction.ts
```

### No chart library

No `recharts`, `chart.js`, `d3`, or similar is installed. Phase 14 uses **cards + tables only**. Trend visualization is deferred to Phase 15 if needed (or implemented with CSS-based sparklines in-house).

### Page structure

```
/admin/dms/ai-observability
├── Page header: "DMS AI Observability"
├── Feature flag gate (DMS_AI_OBSERVABILITY=false → placeholder message)
├── Filters bar (date range, feature area, model, status)
├── Section 1: AI Usage Overview (cards grid)
├── Section 2: Token and Cost Summary (cards grid)
├── Section 3: Provider / Model Breakdown (table)
├── Section 4: Feature / Operation Breakdown (table)
├── Section 5: DMS AI Queue Health (cards grid + job type table)
├── Section 6: DMS AI Pipeline Health (mini-card grid)
├── Section 7: Review Queue Pressure (mini-cards)
├── Section 8: Validation / Matching Findings (mini-cards)
├── Section 9: Recent Usage Events (table, safe columns only)
├── Section 10: Error / Failure Analysis (table)
└── Section 11: Cost Rate Configuration (admin-only panel)
```

### Access control at page level

```
Permission: dms.ai_observability.view (OR system_admin OR dms.admin)
Cost rate admin section: dms.ai_observability.admin (OR system_admin)
```

### DMS Intelligence Admin page change (small)

Add a "View AI Observability →" link button near the top of the existing intelligence admin page, pointing to `/admin/dms/ai-observability`.

---

## 14. Permissions and Feature Flags Plan

### New permissions to add (migration)

| Permission code | Purpose | Grant to |
|---|---|---|
| `dms.ai_observability.view` | View AI usage, cost, queue, pipeline health | `system_admin`, `dms.admin` role users |
| `dms.ai_observability.admin` | Manage cost rates, export data | `system_admin` only |

**Rationale for not reusing `settings.ai.usage.view`:**
- `settings.ai.usage.view` is ERP-wide and includes non-DMS usage
- DMS admins need DMS-scoped observability without full settings access
- Separation of concerns — DMS admin should not need settings manage permissions

**Existing permissions that can be reused for fallback access:**
- `dms.admin` → can view observability (implied by DMS admin role)
- `system_admin` → full access

### New feature flag

| Flag code | Default | Purpose |
|---|---|---|
| `DMS_AI_OBSERVABILITY` | `false` | Gates `/admin/dms/ai-observability` page and all observability server actions |

**Why default false?** The dashboard requires several DB migrations and server action fixes to be complete. Enabling prematurely would show empty/incorrect data. Admin enables when Phase 14 implementation is complete.

**Note:** `DMS_AI_OBSERVABILITY` does not gate the usage logger helper or cost computation — those run regardless and feed the table for when the dashboard is enabled.

---

## 15. RLS and Confidentiality Plan

### `erp_ai_usage_logs` (existing table)

Current state: RLS policies exist (from migration). Phase 14 adds indexes only — no RLS changes needed.

**Policy reminder:**
- `settings.ai.usage.view` or `system_admin` can SELECT
- INSERT: authenticated users (logging path uses admin client internally)
- No anon access

### `erp_ai_model_cost_rates` (new table)

```sql
ALTER TABLE public.erp_ai_model_cost_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_ai_model_cost_rates FORCE ROW LEVEL SECURITY;

-- SELECT: admins can view rates
CREATE POLICY "cost_rates_select"
ON public.erp_ai_model_cost_rates FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_profile_permissions upp
    WHERE upp.user_profile_id = auth.uid()::bigint
      AND upp.permission_code IN (
        'dms.ai_observability.view', 'dms.ai_observability.admin',
        'settings.ai.view', 'settings.ai.manage', 'system_admin'
      )
  )
);

-- INSERT/UPDATE: admin only
CREATE POLICY "cost_rates_insert"
ON public.erp_ai_model_cost_rates FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_profile_permissions upp
    WHERE upp.user_profile_id = auth.uid()::bigint
      AND upp.permission_code IN ('dms.ai_observability.admin', 'settings.ai.manage', 'system_admin')
  )
);

CREATE POLICY "cost_rates_update"
ON public.erp_ai_model_cost_rates FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_profile_permissions upp
    WHERE upp.user_profile_id = auth.uid()::bigint
      AND upp.permission_code IN ('dms.ai_observability.admin', 'settings.ai.manage', 'system_admin')
  )
);

-- No anon. No DELETE (archive instead via is_active=false).
```

### Confidentiality rules for observability dashboard

| Data element | Rule |
|---|---|
| `error_message` in usage logs | Capped at 200 chars in UI; no stack traces |
| `last_error_message` in job queue | Capped at 200 chars; no raw exception text |
| `payload_json` in job queue | Never rendered; only safe scalar fields shown |
| Document title | Shown only if user has `dms.documents.view` for that document |
| `metadata_json` in usage logs | Never rendered raw; only safe known fields extracted (document_id, prompt_version, char_count) |
| Model cost rates | Visible to admins with observability.view permission |
| Provider API keys | Never displayed anywhere; not stored in usage logs |
| Token counts | Safe to display (aggregate numbers only) |
| Embedding vectors | Never displayed (not stored in usage logs) |
| Raw OCR text | Never in usage logs by design; `logDmsAiUsage` blocks it |

---

## 16. Cost Rate Seed Plan

### Default seed strategy

Phase 14 migration seeds **no active cost rates**. This avoids hardcoding potentially stale OpenAI/Azure pricing.

Instead, seed placeholder rows:

```sql
INSERT INTO public.erp_ai_model_cost_rates 
  (provider_type, model_id, display_name, rate_type, input_cost_per_1m_tokens, output_cost_per_1m_tokens, 
   currency_code, effective_from, requires_confirmation, source_note)
VALUES
  ('openai', 'gpt-4.1-2025-04-14', 'GPT-4.1 (2025)', 'token', NULL, NULL, 'USD', '2025-04-14', true,
   'Seed — admin must confirm rates against OpenAI published pricing'),
  ('openai', 'text-embedding-3-small', 'text-embedding-3-small', 'token', NULL, NULL, 'USD', '2024-01-25', true,
   'Seed — admin must confirm embedding rates against OpenAI published pricing'),
  ('openai', 'text-embedding-3-large', 'text-embedding-3-large', 'token', NULL, NULL, 'USD', '2024-01-25', true,
   'Seed — admin must confirm embedding rates against OpenAI published pricing'),
  ('local_ollama', 'local', 'Local Ollama (any model)', 'zero', 0, 0, 'USD', '2024-01-01', false,
   'Local model — zero cost by definition');
```

**Admin workflow:**
1. Admin goes to observability page → Cost Rate Admin panel
2. Sees placeholder rows with "Requires confirmation" badge
3. Looks up current OpenAI/Azure pricing
4. Fills in `input_cost_per_1m_tokens` and `output_cost_per_1m_tokens`
5. Sets `requires_confirmation = false`
6. Cost computation becomes active for future usage logs

**Important:** Until rates are confirmed, all `estimated_cost` values remain NULL. Dashboard shows "Rate unconfirmed" next to cost columns.

---

## 17. Observability Event Safety Plan

### New file: `src/lib/ai/observability/safe-usage-redaction.ts`

Purpose: sanitize metadata/error payloads before writing to `erp_ai_usage_logs` or displaying in UI.

```typescript
// Blocked field names — never allowed in metadata_json or as top-level fields:
const BLOCKED_KEYS = new Set([
  'prompt', 'raw_prompt', 'system_prompt', 'user_prompt',
  'raw_response', 'response_text', 'completion_text',
  'ocr_text', 'content_text', 'chunk_text', 'full_text',
  'api_key', 'secret', 'password', 'token', 'bearer',
  'embedding', 'vector', 'embeddings',
]);

// Safe metadata builder — strips blocked keys, caps strings at 500 chars
export function buildSafeMetadata(input: Record<string, unknown>): Record<string, unknown>

// Safe error message — strips potential stack traces, caps at 200 chars
export function sanitizeErrorMessage(err: unknown): string | null

// Redact safe display subset from metadata_json for UI rendering
export function extractSafeDisplayFields(metadataJson: Record<string, unknown>): {
  documentId?: number;
  promptVersion?: string;
  inputCharCount?: number;
  outputCharCount?: number;
  inputTruncated?: boolean;
}
```

### Integration points

| Component | Uses `safe-usage-redaction.ts` |
|---|---|
| `logDmsAiUsage()` | Passes `metadata` through `buildSafeMetadata()` before insert |
| `getDmsAiRecentUsageEvents()` | Uses `extractSafeDisplayFields()` on `metadata_json` |
| `getDmsAiErrorBreakdown()` | Uses `sanitizeErrorMessage()` on error_message |
| Job queue observability action | Uses `sanitizeErrorMessage()` on `last_error_message` |

---

## 18. Migration Plan

### Migration file

```
supabase/migrations/20260627000000_erp_dms_ai_phase14_token_cost_observability.sql
```

### Migration parts

#### Part 1 — Extend `erp_ai_usage_logs`

```sql
ALTER TABLE public.erp_ai_usage_logs
  ADD COLUMN IF NOT EXISTS document_id        BIGINT REFERENCES public.dms_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_job_id          BIGINT REFERENCES public.dms_ai_job_queue(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS upload_session_id  BIGINT REFERENCES public.dms_upload_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS erp_ai_usage_logs_feature_area_idx ON public.erp_ai_usage_logs(feature_area);
CREATE INDEX IF NOT EXISTS erp_ai_usage_logs_model_id_idx ON public.erp_ai_usage_logs(model_id) WHERE model_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS erp_ai_usage_logs_created_at_idx ON public.erp_ai_usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS erp_ai_usage_logs_document_id_idx ON public.erp_ai_usage_logs(document_id) WHERE document_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS erp_ai_usage_logs_status_idx ON public.erp_ai_usage_logs(status);
CREATE INDEX IF NOT EXISTS erp_ai_usage_logs_provider_config_idx ON public.erp_ai_usage_logs(provider_config_id) WHERE provider_config_id IS NOT NULL;
```

#### Part 2 — Create `erp_ai_model_cost_rates`

```sql
CREATE TABLE public.erp_ai_model_cost_rates (
  id                        BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  provider_type             TEXT NOT NULL,
  model_id                  TEXT NOT NULL,
  display_name              TEXT,
  rate_type                 TEXT NOT NULL DEFAULT 'token' CHECK (rate_type IN ('token', 'page', 'unit', 'zero')),
  input_cost_per_1m_tokens  NUMERIC(16,8),
  output_cost_per_1m_tokens NUMERIC(16,8),
  unit_cost                 NUMERIC(16,8),
  currency_code             TEXT NOT NULL DEFAULT 'USD',
  effective_from            DATE NOT NULL,
  effective_to              DATE,
  is_active                 BOOLEAN NOT NULL DEFAULT true,
  requires_confirmation     BOOLEAN NOT NULL DEFAULT true,
  source_note               TEXT,
  created_by                BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_type, model_id, effective_from)
);

CREATE INDEX erp_ai_model_cost_rates_lookup ON public.erp_ai_model_cost_rates(provider_type, model_id, is_active, effective_from DESC);

ALTER TABLE public.erp_ai_model_cost_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_ai_model_cost_rates FORCE ROW LEVEL SECURITY;

-- RLS policies as specified in Section 15
```

#### Part 3 — Feature flag

```sql
INSERT INTO public.erp_ai_feature_flags (feature_code, feature_name, description, is_enabled, requires_human_review)
VALUES (
  'DMS_AI_OBSERVABILITY',
  'DMS AI Observability Dashboard',
  'Enables /admin/dms/ai-observability page and associated server actions for token/cost/queue/pipeline observability',
  false,
  false
)
ON CONFLICT (feature_code) DO NOTHING;
```

#### Part 4 — Permissions

```sql
INSERT INTO public.permissions (permission_code, permission_name, module, description, is_active)
VALUES
  ('dms.ai_observability.view',  'View DMS AI Observability',  'dms', 'View AI usage, cost, queue and pipeline health dashboard', true),
  ('dms.ai_observability.admin', 'Admin DMS AI Observability', 'dms', 'Manage AI model cost rates and export observability data',   true)
ON CONFLICT (permission_code) DO NOTHING;

-- Grant to system_admin role
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.role_code = 'system_admin'
  AND p.permission_code IN ('dms.ai_observability.view', 'dms.ai_observability.admin')
ON CONFLICT DO NOTHING;

-- Grant view to dms admin role (if role exists)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.role_code = 'dms_admin'
  AND p.permission_code = 'dms.ai_observability.view'
ON CONFLICT DO NOTHING;
```

#### Part 5 — Cost rate seed

Placeholder rows as described in Section 16.

### Migration rules

- BIGINT identity PKs ✓
- RLS enabled and forced on new tables ✓
- No raw prompt/response columns ✓
- No API key columns ✓
- No UUID ✓
- All new FK columns nullable with `ON DELETE SET NULL` ✓

---

## 19. Integration Points

| System | Integration |
|---|---|
| **DMS Intelligence Admin** | "View AI Observability →" link button added near top of page |
| **AI Settings (Settings → AI)** | "View DMS Observability →" link in provider list or usage tab |
| **DMS Review Queue** | Queue pressure cards in observability; link from error items to review queue |
| **DMS AI Job Queue** | Job health section; attempt tokens wired via `usage_log_id` FK |
| **DMS Validation / Matching** | Findings/candidates count cards in observability dashboard |
| **DMS Semantic Index Admin** | Chunk embedding health from pipeline health section |
| **Audit Logs** | Observability actions logged: `dms_ai_cost_rate_created`, `dms_ai_cost_rate_updated` |
| **Notifications** | No new notification types in Phase 14 |

---

## 20. Performance and Index Plan

### Query patterns to optimize

| Query | Index needed |
|---|---|
| Usage logs by date range | `created_at DESC` index (planned) |
| Usage logs by feature_area | `feature_area` index (planned) |
| Usage logs by model | `model_id` index (planned) |
| Usage logs by document | `document_id` index (planned) |
| Usage logs by provider config | `provider_config_id` index (planned) |
| Job queue by status | Existing indexes from Phase 9 |
| Job attempts by job_id | Existing FK index from Phase 9 |
| Cost rates by provider/model | Composite index (planned) |

### Query row limits

All observability server actions must use explicit `LIMIT` clauses:
- Time series: max 90 data points
- Recent events table: max 100 rows
- Error breakdown: max 50 rows
- Breakdown tables: max 20 rows

### Caching strategy

Dashboard data is fetched server-side on page load. Consider:
- `revalidatePath('/admin/dms/ai-observability')` after cost rate changes
- Client-side refresh button (already pattern in DMS review queue page)
- No real-time subscriptions in Phase 14

---

## 21. Recommended Phase 14 Implementation Scope

### Must-implement (blocking observability value)

| Item | Why critical |
|---|---|
| Migration (all 5 parts) | Foundation for everything |
| `logDmsAiUsage()` shared helper | Unifies all logging paths |
| `safe-usage-redaction.ts` | Safety foundation |
| Fix `ai-analysis.ts` logging | Highest-cost path currently invisible |
| Fix `ai-search`, `ai-tags`, `ai-links`, `document-qa` column bugs | 4 paths silently failing → 0 rows in DB |
| Wire `analyze()` token return | Enables token capture for classification/extraction |
| `/admin/dms/ai-observability` page | Delivers Phase 14 value |
| All dashboard sections 1-10 | Required for complete observability |
| `getAiModelCostRates()` + admin panel | Needed for cost configuration |

### Should-implement (high value, lower complexity)

| Item | Notes |
|---|---|
| Wire chunk-embedder batch logging | Batch embed currently has 0 rows; important for embedding cost tracking |
| Wire `dms_ai_job_attempts` observability columns | Pre-provisioned in Phase 9; completes the schema intent |
| Add DMS Intelligence admin "View Observability" link | Small change, high navigation value |

### Defer to Phase 15

| Item | Reason |
|---|---|
| Daily aggregate materialized table | Query performance first; add only if Phase 14 queries are slow |
| Chart/sparkline visualization | No chart library; defer unless user requests |
| Multi-currency support | USD is sufficient for now |
| Azure DI page-based cost | No page count in current OcrResult; needs OCR result schema extension |
| Export to CSV | Phase 15 reporting phase |
| Scheduled summary email digest | Phase 15 |

---

## 22. Implementation Sequence for Future Phase 14 Execution

```
Step 1:  Apply migration (5 parts)
         — extends erp_ai_usage_logs
         — creates erp_ai_model_cost_rates
         — seeds feature flag DMS_AI_OBSERVABILITY=false
         — seeds permissions + grants
         — seeds placeholder cost rates

Step 2:  Create safe-usage-redaction.ts

Step 3:  Create logDmsAiUsage() helper (uses safe-usage-redaction)
         — typed input
         — cost estimation lookup
         — non-fatal (try/catch)

Step 4:  Extend DmsAiOutput type with promptTokens / completionTokens

Step 5:  Fix OpenAiDmsAdapter.analyze() to parse response.usage and return token fields

Step 6:  Fix ai-analysis.ts — add logDmsAiUsage() call

Step 7:  Fix ai-search.ts, document-qa.ts, ai-tags.ts, ai-links.ts
         — replace wrong-column-name inserts with logDmsAiUsage() calls

Step 8:  Add batch logging in chunk-embedder.ts
         — accumulate inputTokenCount per embed call
         — log aggregated per-batch usage after batch completes

Step 9:  Wire dms_ai_job_attempts observability columns in job-runner.ts

Step 10: Create ai-observability.ts server actions (all getDmsAi* functions)
         — all read-only
         — all permission/flag gated

Step 11: Create cost rate server actions (getAiModelCostRates, create, update, archive)

Step 12: Create UI components (page, sections, filters, cost rate admin)

Step 13: Add "View AI Observability →" link in DMS Intelligence admin

Step 14: Enable DMS_AI_OBSERVABILITY=true in DB for testing

Step 15: TypeScript check + lint + build

Step 16: UAT
```

---

## 23. Acceptance Criteria for Future Implementation

```
AC-01: erp_ai_usage_logs schema confirmed with document_id, ai_job_id, upload_session_id columns.
AC-02: erp_ai_model_cost_rates created with BIGINT PK, RLS enabled+forced, rate_type CHECK.
AC-03: No raw prompt/response/content/OCR text fields in any new column or table.
AC-04: DMS_AI_OBSERVABILITY feature flag gates dashboard (off → placeholder message).
AC-05: logDmsAiUsage() helper accepts typed input; blocks blocked_keys via safe-usage-redaction.
AC-06: analyze() path (ai-analysis.ts) logs to erp_ai_usage_logs with token counts when available.
AC-07: ai-search, document-qa, ai-tags, ai-links use canonical columns (no silent insert failures).
AC-08: Chunk-embedder logs aggregated embedding token usage per batch.
AC-09: Dashboard shows AI Usage Overview cards with correct aggregates.
AC-10: Dashboard shows Token and Cost Summary; "Rate unconfirmed" shown when estimated_cost IS NULL.
AC-11: Dashboard shows Provider/Model breakdown table.
AC-12: Dashboard shows Feature/Operation breakdown table.
AC-13: Dashboard shows Job Queue Health cards with safe redacted display.
AC-14: Dashboard shows Pipeline Health mini-card grid.
AC-15: Recent Usage Events table contains no prompt/response/OCR text.
AC-16: Cost Rate admin panel allows CRUD; rates with requires_confirmation=true shown distinctly.
AC-17: dms.ai_observability.view permission gates dashboard; unauthorized user gets error.
AC-18: No AI calls are made by observability page/actions.
AC-19: No writes to dms_documents, dms_document_metadata_values, or entity tables.
AC-20: TypeScript passes (npx tsc --noEmit exit 0).
AC-21: Linter passes on all new/changed files.
AC-22: Phase 12/13 review queue UAT items still intact after implementation.
```

---

## 24. Full UAT / Test Plan

### DB / Migration UAT

| Test | Expected |
|---|---|
| `erp_ai_usage_logs` has `document_id`, `ai_job_id`, `upload_session_id` | PASS |
| `erp_ai_model_cost_rates` table exists | PASS |
| `erp_ai_model_cost_rates` BIGINT PK | PASS |
| `erp_ai_model_cost_rates` RLS enabled + forced | PASS |
| No broad USING(true) on cost rates | PASS |
| `DMS_AI_OBSERVABILITY` flag exists, is_enabled=false | PASS |
| 2 new permissions exist | PASS |
| `system_admin` has both permissions | PASS |
| 5 indexes on `erp_ai_usage_logs` | PASS |

### Feature Flag Disabled UAT

| Test | Expected |
|---|---|
| Navigate to `/admin/dms/ai-observability` with flag off | Placeholder "Dashboard not enabled" message |
| Call `getDmsAiObservabilityOverview()` with flag off | Controlled disabled response |
| No 500 error | PASS |

### Feature Flag Enabled UAT

| Test | Expected |
|---|---|
| Navigate to `/admin/dms/ai-observability` with flag on | Dashboard loads |
| Usage Overview cards show | PASS |
| Token/Cost summary shows "Rate unconfirmed" for null costs | PASS |
| Provider/model breakdown table shows | PASS |
| Feature breakdown table shows | PASS |
| Job Queue Health shows (queued/running/retry/failed counts) | PASS |
| Pipeline health mini-cards show | PASS |
| Recent usage events table shows (safe columns only) | PASS |
| No prompt/response/OCR text visible in table | PASS |
| Error breakdown table shows | PASS |

### Usage Logging UAT

| Test | Expected |
|---|---|
| Trigger AI summary for a document | Row appears in `erp_ai_usage_logs` with correct canonical columns |
| Trigger AI analysis (classification) | Row appears with `input_token_count`, `output_token_count` |
| Trigger AI search | Row appears (was silently failing; now fixed) |
| Trigger embedding | Row appears with `document_id` FK |
| Batch chunk embed job | Aggregated row appears with total tokens |
| Check for blocked keys in metadata_json | None: no `prompt`, `api_key`, `ocr_text` |

### Idempotency / Safety UAT

| Test | Expected |
|---|---|
| No raw text in any usage log row | PASS (SQL scan query) |
| Cost rate CRUD: create rate with requires_confirmation=true | Row created, cost not computed |
| Cost rate CRUD: confirm rate (set requires_confirmation=false) | Subsequent logs compute estimated_cost |
| Unauthorized user cannot view dashboard | Permission error |
| Unauthorized user cannot manage cost rates | Permission error |

### Regression UAT

| Test | Expected |
|---|---|
| `/dms/documents` loads | PASS |
| `/dms/review-queue` loads, Phase 12/13 items intact | PASS |
| `/admin/dms/intelligence` loads, has observability link | PASS |
| TypeScript: npx tsc --noEmit | Exit 0 |
| npm run build | PASS |

---

## 25. Risks and Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| `estimated_cost` computation queries cost rates table on every log write | Medium | Cache active rates in memory (short TTL); fallback to null cost if cache miss |
| Dashboard aggregate queries are slow on large usage logs table | Medium | Use indexed columns for WHERE/GROUP BY; add LIMIT; defer aggregate table to Phase 15 |
| Chunk-embedder batch logging is complex (many async calls) | Medium | Log once at batch end with `SUM(inputTokenCount)` per batch; use try/catch so batch doesn't fail if logging fails |
| Server actions returning wrong column names continue to fail silently | High (current) | Use `logDmsAiUsage()` strictly — all direct inserts in DMS actions replaced |
| `analyze()` token parsing breaks if provider response changes | Low | Wrap in try/catch with null fallback; never block the main analyze call |
| OpenAI API changes `usage` field structure | Low | Read defensively with optional chaining |
| Cost rates accidentally show real prices that become stale | Medium | `requires_confirmation=true` default; source_note field; admin process documented |

---

## 26. What Must Not Be Implemented in Phase 14

```
✗ Apply-to-ERP writes (metadata, entity links, owner fields)
✗ Metadata auto-save or suggestion auto-apply
✗ Entity auto-linking or party auto-creation
✗ AI auto-rerun or automatic retries beyond existing Phase 9 job runner behavior
✗ OCR provider routing changes
✗ Semantic chunking behavioral changes
✗ Validation rule changes or new validation rules
✗ Matching rule changes
✗ Raw prompt storage in any table or log
✗ Raw provider response storage
✗ Raw OCR/content/chunk text in usage logs
✗ API key or secret storage of any kind
✗ Vendor billing API calls (no live pricing)
✗ Live web price fetching
✗ Automatic scheduled reports or digests (Phase 15)
✗ Export to CSV (Phase 15)
✗ Chart library installation (Phase 15 if needed)
✗ Multi-currency cost display (Phase 15)
✗ Azure Document Intelligence page-based cost tracking (deferred — requires OcrResult schema change)
```

---

## 27. Corrected Roadmap After Phase 14

```
Phase 9   — Async AI Job Queue / Workflow Runner              CLOSED ✅
Phase 10A — OCR Pipeline Upgrade / Azure OCR Wiring           CLOSED ✅
Phase 10B — Queue-backed Admin OCR Backfill                   CLOSED ✅
Phase 11  — Semantic Chunking and Embeddings                  CLOSED ✅
Phase 12  — Review Queue Activation                           CLOSED ✅
Phase 13  — Validation, Conflict Detection, Owner Matching    CLOSED / LIVE PASS ✅
Phase 14  — Token / Cost / Observability                      IN PLANNING (this document)
Phase 15  — Testing, Performance, Hardening                   FUTURE
Phase 16  — Human-Reviewed Apply-to-ERP Records               FUTURE / HIGH-RISK
```

---

## 28. Recommended Next Cursor Implementation Prompt

After ChatGPT reviews and approves this plan, the implementation prompt should instruct Cursor to:

1. Read this planning file first
2. Read Phase 13 UAT closure report and all source files listed in Section 3
3. Apply the migration in 5 parts using Supabase MCP
4. Create `safe-usage-redaction.ts` and `logDmsAiUsage()` first (foundation)
5. Fix `DmsAiOutput` type and `OpenAiDmsAdapter.analyze()` before touching callers
6. Fix all server action logging bugs before building the UI
7. Wire job attempts columns
8. Create all server actions
9. Create all UI components
10. Run TypeScript + lint + build
11. Run UAT from Section 24
12. Create implementation report
13. Update source-of-truth files

The implementation prompt must reiterate Phase 14 governance: **no AI calls, no ERP writes, observability only**.

---

## 29. Final Recommendation

Phase 14 is a **critical pre-production readiness phase**. The current state has four server action paths silently discarding usage data due to non-existent column names, and the highest-cost AI operation (classification/extraction) produces zero observability data. Without Phase 14, cost tracking is impossible and operational health is opaque.

The recommended approach is:

1. **Fix bugs first** (G3, G4) — standardize all DMS AI logging to a shared helper with canonical columns. This is a correctness fix, not an observability feature.
2. **Wire missing paths** (G1, G2, G5) — extend `analyze()` return type and wire chunk-embedder batch logging. These are small code changes with high value.
3. **Add cost model** — `erp_ai_model_cost_rates` with admin UI is straightforward and essential.
4. **Build dashboard** — `/admin/dms/ai-observability` with cards/tables provides immediate operational value.
5. **Gate carefully** — `DMS_AI_OBSERVABILITY=false` default ensures no partial data is shown until logging is fully fixed.

**Estimated implementation complexity:** Medium. No new AI calls. No schema-breaking migrations. The hardest part is the `analyze()` token parsing (requires provider abstraction update) and the chunk-embedder batch aggregation.

This plan is ready for ChatGPT review before implementation.

---

*Planning document created by Cursor AI Agent (read-only analysis), 2026-06-25*  
*No source code, UI, migrations, or schema changes were made during planning.*
