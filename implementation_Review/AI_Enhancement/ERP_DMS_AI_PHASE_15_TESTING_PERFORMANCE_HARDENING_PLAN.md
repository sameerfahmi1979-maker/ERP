# ERP DMS AI Phase 15 — Testing, Performance, Hardening Plan

**Created:** 2026-06-27
**Authored by:** Cursor — Senior ERP QA Lead / Supabase RLS Auditor / Playwright Automation Engineer / Next.js Runtime Tester / DMS Performance Engineer / AI Cost Governance Auditor
**Phase type:** Planning only. No code, schema, or UI changes made.
**Prior phase:** Phase 14 — Token / Cost / Observability — CLOSED / LIVE PASS

---

## 1. Executive Summary

Phase 15 is a **testing, performance, and hardening closure phase** for the complete DMS AI stack built in Phases 9–14. No new product features are introduced.

The DMS AI stack now encompasses:
- Async job queue and worker (Phase 9)
- OCR pipeline upgrade + Azure OCR wiring (Phase 10A)
- Queue-backed admin OCR backfill (Phase 10B)
- Semantic chunking and embeddings (Phase 11)
- Review queue activation (Phase 12)
- Validation, conflict detection, owner/entity matching (Phase 13)
- Token/cost/observability dashboard (Phase 14)

**Critical finding from pre-planning inspection:**
> **Zero automated test infrastructure currently exists in this codebase.** There is no Playwright config, no Vitest/Jest config, no `e2e/` directory, no `tests/` directory, no `src/__tests__/` directory, and no `test` script in `package.json`. All prior UAT was performed entirely through manual browser interaction and SQL verification scripts. Phase 15 must establish the testing foundation from scratch.

**Other key findings:**
- All 13 DMS AI tables have RLS enabled and FORCE RLS — no broad `USING (true)` policy exists
- No DELETE policies on append-only tables — correct
- INSERT policy on `erp_ai_usage_logs` uses only `auth.uid() IS NOT NULL` — relatively broad; warrants review
- Two redundant index pairs exist on `erp_ai_usage_logs` (duplicate indexes on `created_at` and `provider_config_id`)
- 4 of 9 job types have no registered handler (commented out in registry)
- `dms_document_content_chunks` has only 3 rows — semantic indexing not widely adopted yet
- `DMS_AI_OBSERVABILITY` feature flag is safely OFF
- `DMS_AI_VALIDATION` and `DMS_AI_ENTITY_MATCHING` flags are safely OFF
- Worker is currently ENABLED (`DMS_AI_JOB_QUEUE_WORKER_ENABLED=true`)

---

## 2. Planning Scope and Non-Implementation Rule

### Phase 15 MAY plan:
- Test scripts (SQL, TypeScript, Playwright)
- SQL QA scripts for RLS verification and payload safety
- SQL performance review queries with EXPLAIN ANALYZE
- Route smoke test scripts
- Feature flag matrix test plan
- Worker route authentication test plan
- Regression test checklists
- Minor bug-fix plan (categorized by severity)
- Production readiness checklist

### Phase 15 MUST NOT plan to implement:
- Apply-to-ERP writes
- Metadata auto-save or entity auto-linking
- AI auto-rerun or new retry behavior
- New OCR routing, chunking algorithm, or validation rules
- Raw prompt, response, OCR text, or API key storage
- Vendor billing API or live web price fetching
- New business AI features
- Phase 16 Apply-to-ERP logic

---

## 3. Files and Source-of-Truth Reviewed

### Implementation reports reviewed:
| Report | Status |
|---|---|
| `ERP_DMS_AI_PHASE_14_RUNTIME_UAT_AND_CLOSURE_REPORT.md` | LIVE PASS |
| `ERP_DMS_AI_PHASE_14_TOKEN_COST_OBSERVABILITY_IMPLEMENTATION_REPORT.md` | CLOSED |
| `ERP_DMS_AI_PHASE_13_VALIDATION_CONFLICT_OWNER_MATCHING_IMPLEMENTATION_REPORT.md` | CLOSED |
| `ERP_DMS_AI_PHASE_12_REVIEW_QUEUE_ACTIVATION_IMPLEMENTATION_REPORT.md` | CLOSED |
| `ERP_DMS_AI_PHASE_11_UAT_BLOCKER_FIX_AND_FINAL_VERIFICATION_REPORT.md` | CLOSED |
| `ERP_DMS_AI_PHASE_11_SEMANTIC_CHUNKING_AND_EMBEDDINGS_IMPLEMENTATION_REPORT.md` | CLOSED |
| `ERP_DMS_AI_PHASE_10B_QUEUE_BACKED_ADMIN_OCR_BACKFILL_IMPLEMENTATION_REPORT.md` | CLOSED |
| `ERP_DMS_AI_PHASE_10A_OCR_PIPELINE_UPGRADE_AZURE_OCR_WIRING_IMPLEMENTATION_REPORT.md` | CLOSED |
| `ERP_DMS_AI_PHASE_9_ASYNC_JOB_QUEUE_WORKFLOW_RUNNER_IMPLEMENTATION_REPORT.md` | CLOSED |

### Key source files inspected:
```
src/lib/dms/ai-jobs/job-types.ts
src/lib/dms/ai-jobs/job-runner.ts
src/lib/dms/ai-jobs/job-registry.ts
src/lib/dms/ai-jobs/handlers/ (3 files)
src/app/api/internal/dms-ai-jobs/process/route.ts
src/lib/dms/ocr/ (9 files)
src/lib/dms/semantic/ (3 files)
src/lib/dms/validation/ (5 files)
src/lib/dms/entity-matching/ (5 files)
src/lib/dms/review-queue/review-queue-upsert.ts
src/lib/ai/observability/ (safe-usage-redaction.ts, log-dms-ai-usage.ts)
src/features/dms/ (97 .tsx files)
src/app/(protected)/dms/ (12 route pages)
src/app/(protected)/admin/dms/ (9 route pages)
package.json
supabase/migrations/ (39 DMS-related migrations)
```

### Live DB state verified via user-supabase MCP:
- All 13 DMS AI tables: RLS enabled, FORCE RLS enabled
- No DELETE policies on append-only tables
- INSERT WITH CHECK policies scoped by permissions/roles
- Feature flag state: 36+ flags captured
- Row counts: 37 documents, 9 jobs, 11 attempts, 3 chunks, 4 review items, 1 validation finding, 0 match candidates, 65 usage logs, 6 cost rates
- Index inventory captured for all key tables

### Missing files (do not invent):
- `playwright.config.ts/js` — does not exist
- `vitest.config.ts/js` — does not exist
- `jest.config.ts/js` — does not exist
- `e2e/` directory — does not exist
- `tests/` directory — does not exist
- `src/__tests__/` directory — does not exist
- `src/test/` directory — does not exist
- `package.json` has no `test` script

---

## 4. Current Test Infrastructure Inventory

### 4.1 `package.json` scripts
```
dev       — next dev (development server)
build     — next build (production build)
start     — next start (production start)
lint      — eslint
typecheck — tsc --noEmit
memory:check — node scripts/check-node-memory.mjs
bootstrap:admin — node scripts/bootstrap-admin.mjs
```

**Missing scripts:** `test`, `test:e2e`, `test:unit`, `test:sql`

### 4.2 Test framework availability
| Framework | Present | Config file | Notes |
|---|---|---|---|
| Playwright | **NO** | None | Must install if E2E browser tests are planned |
| Vitest | **NO** | None | Must install if unit tests are planned |
| Jest | **NO** | None | Must install if unit tests are planned |
| SQL QA scripts | **NO** | None | Must create in `implementation_Review/` |

### 4.3 Existing test evidence
All prior phase UAT was performed by:
1. Manual browser interaction via cursor-ide-browser MCP
2. Manual SQL queries via user-supabase MCP
3. Manual runtime checklist verification in Markdown reports

### 4.4 What to add in Phase 15
Phase 15 will establish the testing foundation. Given the project uses Next.js 16, React 19, and TypeScript 5, the recommended stack is:

| Layer | Tool | Rationale |
|---|---|---|
| SQL QA / RLS checks | Raw SQL scripts (`.sql` files) | Already proven workflow; no extra dependencies |
| Payload safety checks | Raw SQL scripts (`.sql` files) | Immediate, no runtime overhead |
| Performance review queries | Raw SQL scripts (`.sql` files) | EXPLAIN ANALYZE requires direct DB access |
| Route smoke tests | TypeScript script (`scripts/dms-ai-smoke.ts`) + Node fetch | No Playwright needed for HTTP-level checks |
| Browser UAT | Playwright (`@playwright/test`) | For full browser-level workflow tests |
| Unit tests | Vitest (`vitest`) | Lightweight, ESM-native, works with TypeScript |

**Note:** Installing Playwright requires `npx playwright install` for browser binaries. This must be done before Phase 15 implementation begins.

---

## 5. DMS AI Stack Under Test

### 5.1 Registered job handlers
| Job Type | Handler | Notes |
|---|---|---|
| `post_approve_orchestration` | `postApproveOrchestrationHandler` | Active |
| `ocr_backfill` | `ocrBackfillHandler` | Active — Phase 10B |
| `semantic_document_index` | `semanticDocumentIndexHandler` | Active — Phase 11 |
| `ai_summary` | **NOT REGISTERED** | Commented out |
| `ai_intelligence` | **NOT REGISTERED** | Commented out |
| `embedding` | **NOT REGISTERED** | Commented out |
| `tag_suggestions` | **NOT REGISTERED** | Commented out |
| `link_suggestions` | **NOT REGISTERED** | Commented out |
| `content_sync` | **NOT REGISTERED** | Commented out |

**Phase 15 note:** 4 of 9 job types have no registered handler. This is expected — they are defined for future use. Tests must verify that unregistered job types fail gracefully (not panic).

### 5.2 OCR providers
| File | Provider | Active |
|---|---|---|
| `noop-provider.ts` | NoOp (returns empty) | Fallback when OCR disabled |
| `pdf-text-provider.ts` | PDF text extraction | Active |
| `azure-ocr-provider.ts` | Azure Computer Vision | Gated by `DMS_OCR_AZURE=false` |
| `ocr-router.ts` | Multi-provider routing | Gated by `DMS_OCR_ROUTER=false` |

### 5.3 Semantic chunking
| File | Purpose |
|---|---|
| `chunk-builder.ts` | Splits document content into overlapping chunks |
| `chunk-embedder.ts` | Batch-embeds chunks via AI provider, logs usage |
| `semantic-indexer.ts` | Orchestrates build/refresh of chunks + embeddings for a document |

### 5.4 Validation and entity matching
| Layer | Files | Flags |
|---|---|---|
| Validation engine | `validation-engine.ts`, `validation-rules.ts`, `validation-types.ts`, `validation-upsert.ts` | `DMS_AI_VALIDATION=false` |
| Entity matching | `entity-matcher.ts`, `entity-match-upsert.ts`, `entity-match-types.ts`, `match-signals.ts` | `DMS_AI_ENTITY_MATCHING=false` |

### 5.5 Review queue
- Single file: `review-queue-upsert.ts`
- All validation findings, job failures, and entity match candidates route to `dms_review_queue`
- Flag: `DMS_AI_REVIEW=true` (currently ON)

### 5.6 Observability
| File | Purpose |
|---|---|
| `log-dms-ai-usage.ts` | Central helper; sanitizes data before logging to `erp_ai_usage_logs` |
| `safe-usage-redaction.ts` | Strips blocked keys, caps strings, redacts API keys from metadata |
| `src/server/actions/dms/ai-observability.ts` | Dashboard server actions (read-only) |
| `src/features/dms/ai-observability/` | Dashboard UI components (9 sections) |

---

## 6. End-to-End DMS AI Workflow Test Matrix

Each test case below defines the full context required for automation.

### T-01: Upload Inbox → AI Fill → Intake Review → Approve & Save

| Field | Value |
|---|---|
| Preconditions | At least one DMS document type exists; `dms.ai_intake.run` permission held by test user |
| Feature flags | DMS_AI_ORCHESTRATION=true, DMS_AI_REVIEW=true, DMS_AI_JOB_QUEUE=true |
| Test user | `sameer@algt.net` |
| Test document | Non-confidential: a safe existing document (e.g. a plain-text test PDF) |
| Expected DB changes | Upload session created; AI extraction result created; intake metadata populated; document created with `intake_status=approved` after approval |
| Forbidden DB changes | No writes to ERP target tables (parties, employees, HR); no metadata auto-saved without user approval |
| Expected UI result | Intake form pre-filled with AI suggestions; user can review, edit, and approve |
| Cleanup | Delete the test upload session + document if created specifically for test |

### T-02: OCR Run / Re-run on existing document

| Field | Value |
|---|---|
| Preconditions | A document with `ocr_status=pending` or a document that can be re-OCR'd exists |
| Feature flags | DMS_OCR=true, DMS_OCR_AZURE=false (using PDF text provider only) |
| Test user | `sameer@algt.net` |
| Test document | Existing safe PDF document with text |
| Expected DB changes | `dms_document_files.ocr_status` → `complete`; `dms_document_content.raw_content` populated |
| Forbidden DB changes | No prompts, OCR text, or file binary stored in job payloads or usage logs |
| Expected UI result | OCR section shows extracted text preview; "Re-run OCR" button available |
| Cleanup | No cleanup needed if using existing document |

### T-03: AI Analysis Run

| Field | Value |
|---|---|
| Preconditions | AI provider configured and active; document has OCR content available |
| Feature flags | DMS_AI_ORCHESTRATION=true, DMS_EXTRACTION=true |
| Expected DB changes | `dms_ai_extraction_results` row created; `erp_ai_usage_logs` row created with token counts |
| Forbidden DB changes | No raw prompt/response stored in usage log `metadata_json` |
| Expected UI result | AI tab on document record shows confidence scores, classification, extracted fields |
| Cleanup | None (AI results are non-destructive) |

### T-04: AI Summary Generation

| Field | Value |
|---|---|
| Preconditions | Document with AI extraction result exists |
| Feature flags | DMS_AI_SUMMARY=true |
| Expected DB changes | AI summary stored in document; `erp_ai_usage_logs` row created |
| Expected UI result | Summary section on document record shows generated summary text |

### T-05: Semantic Indexing → Search → Ask AI

| Field | Value |
|---|---|
| Preconditions | Document with raw content exists; embedding provider configured |
| Feature flags | DMS_SEMANTIC_CHUNKING=true, DMS_SEMANTIC_EMBEDDINGS=true, DMS_SEMANTIC_SEARCH_CHUNKS=true, DMS_DOCUMENT_QA=true |
| Expected DB changes | `dms_document_content_chunks` rows created (active); `embedding_status=complete`; `erp_ai_usage_logs` batch embedding entry |
| Expected UI result | Semantic Search returns results; Ask AI returns a cited answer |
| Forbidden DB changes | No chunk_text stored in job payloads or usage logs |

### T-06: Review Queue Generation and Resolution

| Field | Value |
|---|---|
| Preconditions | A job failure or validation finding exists, OR DMS_AI_REVIEW=true enables review queue |
| Feature flags | DMS_AI_REVIEW=true |
| Expected DB changes | `dms_review_queue` item with `status=open`; update to `resolved` after user action |
| Expected UI result | Review Queue page loads; item visible; "Resolve" action works |

### T-07: Validation Finding Generation and Review

| Field | Value |
|---|---|
| Preconditions | DMS_AI_VALIDATION enabled; a document with metadata that triggers a validation rule |
| Feature flags | DMS_AI_VALIDATION=true (must be temporarily enabled for test) |
| Expected DB changes | `dms_ai_validation_findings` row created; `dms_review_queue` item created |
| Forbidden DB changes | No auto-metadata-save; user must explicitly acknowledge |
| Expected UI result | Validation finding visible in review queue; document shows finding alert |
| Cleanup | Disable DMS_AI_VALIDATION after test |

### T-08: Entity Match Candidate Generation and Review

| Field | Value |
|---|---|
| Preconditions | DMS_AI_ENTITY_MATCHING enabled; a document with party/counterparty name that matches an existing party |
| Feature flags | DMS_AI_ENTITY_MATCHING=true (must be temporarily enabled for test) |
| Expected DB changes | `dms_ai_entity_match_candidates` row created; `dms_review_queue` item created |
| Forbidden DB changes | No auto-link to party record without user approval |
| Expected UI result | Match candidate visible in review queue with suggested party |
| Cleanup | Disable DMS_AI_ENTITY_MATCHING after test |
| Note | Current live data shows 0 entity match candidates — this test requires controlled preconditions |

### T-09: Observability Dashboard — Read-Only Safety Test

| Field | Value |
|---|---|
| Preconditions | DMS_AI_OBSERVABILITY=true (must be temporarily enabled); user has `dms.ai_observability.view` permission |
| Feature flags | DMS_AI_OBSERVABILITY=true |
| Expected UI result | Dashboard loads all 9 sections with data; no AI calls triggered; no data mutations |
| Forbidden | Any INSERT/UPDATE/DELETE to AI tables triggered by page load or section render |
| Cleanup | Disable DMS_AI_OBSERVABILITY after test |

---

## 7. Feature Flag Matrix

### 7.1 Current flag states (live DB as of 2026-06-27)

| Feature Flag | Current State | Safe Default | Notes |
|---|---|---|---|
| `DMS_AI_JOB_QUEUE` | ON | ON | Core queue — leave ON |
| `DMS_AI_JOB_QUEUE_WORKER_ENABLED` | ON | ON | Worker enabled in dev — verify in prod |
| `DMS_AI_ORCHESTRATION` | ON | ON | Core flow |
| `DMS_AI_REVIEW` | ON | ON | Review queue active |
| `DMS_AI_SUMMARY` | ON | ON | Summary generation active |
| `DMS_SEMANTIC_CHUNKING` | ON | ON | Chunking active |
| `DMS_SEMANTIC_EMBEDDINGS` | ON | ON | Embedding active |
| `DMS_SEMANTIC_INDEX_QUEUE` | ON | ON | Queue-backed indexing active |
| `DMS_SEMANTIC_SEARCH` | ON | ON | Search active |
| `DMS_SEMANTIC_SEARCH_CHUNKS` | ON | ON | Chunk-level search active |
| `DMS_SMART_LINKS` | ON | ON | Smart links active |
| `DMS_AUTO_TAGS` | ON | ON | Auto-tags active |
| `DMS_OCR` | ON | ON | OCR active |
| `DMS_OCR_BACKFILL_QUEUE` | ON | ON | OCR backfill via queue active |
| `DMS_OCR_GPT_VISION_FALLBACK` | ON | ON | GPT Vision fallback active |
| `DMS_DOCUMENT_QA` | ON | ON | Document Q&A active |
| `DMS_AI_SEARCH` | ON | ON | AI search active |
| `AI_SEARCH` | ON | ON | Global AI search |
| `DMS_OBSERVABILITY` | **OFF** | OFF | Safe-off; dashboard behind flag |
| `DMS_AI_VALIDATION` | **OFF** | OFF | Safe-off; Phases 13+ feature |
| `DMS_AI_VALIDATION_ASSISTED` | **OFF** | OFF | Safe-off |
| `DMS_AI_ENTITY_MATCHING` | **OFF** | OFF | Safe-off; no candidates in DB |
| `DMS_AI_DUPLICATE_DOCUMENTS` | **OFF** | OFF | Safe-off |
| `DMS_OCR_AZURE` | **OFF** | OFF | Azure OCR not active |
| `DMS_OCR_ROUTER` | **OFF** | OFF | Multi-provider routing not active |
| `DMS_EMBEDDING` | **OFF** | OFF | Unused flag (chunking uses DMS_SEMANTIC_EMBEDDINGS) |
| `LOCAL_LLM` | **OFF** | OFF | Ollama not configured |

### 7.2 Test matrix: safe-off behavior

For each flag currently OFF, test:
1. Route/feature returns disabled/hidden state (not 500 error)
2. Database writes do NOT occur for disabled features
3. No unhandled exceptions in console

For flags currently ON that are high-risk (`DMS_AI_VALIDATION`, `DMS_AI_ENTITY_MATCHING`), test the ON state in a controlled manner with cleanup.

### 7.3 Safe post-UAT default state

After all UAT tests:
```sql
UPDATE erp_ai_feature_flags SET is_enabled=false WHERE feature_code='DMS_AI_OBSERVABILITY';
UPDATE erp_ai_feature_flags SET is_enabled=false WHERE feature_code='DMS_AI_VALIDATION';
UPDATE erp_ai_feature_flags SET is_enabled=false WHERE feature_code='DMS_AI_ENTITY_MATCHING';
```
All others remain as-is (their current state reflects live production intent).

---

## 8. Security / RLS Hardening Plan

### 8.1 Current RLS status (verified live)

| Table | RLS Enabled | Force RLS | Result |
|---|---|---|---|
| `dms_ai_entity_match_candidates` | ✅ | ✅ | PASS |
| `dms_ai_extraction_jobs` | ✅ | ✅ | PASS |
| `dms_ai_extraction_results` | ✅ | ✅ | PASS |
| `dms_ai_job_attempts` | ✅ | ✅ | PASS |
| `dms_ai_job_queue` | ✅ | ✅ | PASS |
| `dms_ai_link_suggestions` | ✅ | ✅ | PASS |
| `dms_ai_tag_suggestions` | ✅ | ✅ | PASS |
| `dms_ai_validation_findings` | ✅ | ✅ | PASS |
| `dms_document_content` | ✅ | ✅ | PASS |
| `dms_document_content_chunks` | ✅ | ✅ | PASS |
| `dms_review_queue` | ✅ | ✅ | PASS |
| `erp_ai_model_cost_rates` | ✅ | ✅ | PASS |
| `erp_ai_usage_logs` | ✅ | ✅ | PASS |

### 8.2 DELETE policy check (verified live)

No DELETE policies exist on any of the 13 DMS AI tables. This is correct. All of these tables are append-only (soft-delete via `deleted_at`) or job-status machines.

### 8.3 INSERT policy review

| Table | WITH CHECK | Assessment |
|---|---|---|
| `dms_ai_entity_match_candidates` | `current_user_has_permission('dms.entity_matching.admin') OR current_user_has_permission('dms.admin') OR current_user_has_role('system_admin')` | ✅ Scoped |
| `dms_ai_job_attempts` | `auth.uid() IS NOT NULL AND (dms.admin OR system_admin OR group_admin)` | ✅ Scoped |
| `dms_ai_job_queue` | `auth.uid() IS NOT NULL AND (dms.admin OR system_admin OR group_admin)` | ✅ Scoped |
| `dms_ai_validation_findings` | `current_user_has_permission('dms.validation.admin') OR dms.admin OR system_admin` | ✅ Scoped |
| `dms_review_queue` | `current_user_has_permission('dms.review_queue.admin') OR dms.admin OR system_admin` | ✅ Scoped |
| `erp_ai_model_cost_rates` | `dms.ai_observability.admin OR settings.ai.manage OR system_admin` | ✅ Scoped |
| `erp_ai_usage_logs` | **`auth.uid() IS NOT NULL`** | ⚠️ Broad — any authenticated user can insert |

### 8.4 Flagged RLS concern: `erp_ai_usage_logs` INSERT policy

**Assessment:** `MEDIUM` hardening issue.

The INSERT WITH CHECK on `erp_ai_usage_logs` is `auth.uid() IS NOT NULL`, meaning any authenticated user can insert a usage log row. In practice, all inserts flow through `logDmsAiUsage()` which uses the admin client (bypassing RLS), so this policy is effectively never evaluated for legitimate writes. However, a malicious authenticated user could insert arbitrary usage log rows via the Supabase client SDK.

**Risk:** Low impact (usage logs are read-only metrics, not executable commands), but could pollute cost dashboards.

**Recommended Phase 15 hardening fix:** Tighten to require at minimum `current_user_has_permission('dms.admin')` or a dedicated `erp.ai.usage.log` permission. Categorized as `LOW / Minor hardening fix`.

### 8.5 SQL QA script plan

**Deliverable:** `implementation_Review/ERP_DMS_AI_PHASE_15_SECURITY_RLS_QA_CHECKS.sql`

Script sections:
```sql
-- Section 1: Verify RLS + FORCE RLS on all 13 tables
-- Section 2: Assert NO broad USING (true) SELECT policies
-- Section 3: Assert NO anon policies (no auth.role() = 'anon' allows)
-- Section 4: Assert NO DELETE policies on append-only tables
-- Section 5: Assert INSERT WITH CHECK is scoped (not 'true')
-- Section 6: Assert erp_ai_usage_logs INSERT policy
-- Section 7: Verify no UPDATE policy on erp_ai_model_cost_rates allows is_active DELETE-equivalent
-- Section 8: Verify worker route check (cannot be in SQL — document in checklist)
-- Section 9: Verify semantic chunk RPC function uses SECURITY DEFINER or caller-scoped
```

### 8.6 Worker route auth test plan

Tests to implement as HTTP smoke tests (not in browser):

```
TEST WR-01: GET /api/internal/dms-ai-jobs/process without header → 401
TEST WR-02: GET /api/internal/dms-ai-jobs/process with wrong secret → 401
TEST WR-03: GET /api/internal/dms-ai-jobs/process with correct secret → 200 + health JSON
TEST WR-04: POST /api/internal/dms-ai-jobs/process without header → 401
TEST WR-05: POST /api/internal/dms-ai-jobs/process with correct secret, DMS_AI_JOB_QUEUE_WORKER_ENABLED=false → 200 + disabled message
TEST WR-06: POST /api/internal/dms-ai-jobs/process with correct secret → 200 + process result JSON
```

---

## 9. Payload and Privacy Safety Plan

### 9.1 Forbidden key inventory

The following JSON keys must NEVER appear in DB columns containing serialized JSON:

```
prompt, raw_prompt, system_prompt, user_prompt,
raw_response, response_text,
ocr_text, content_text, chunk_text, full_text,
api_key, secret, password, token, bearer,
embedding, vector, embeddings,
provider_response
```

**Important:** Use exact JSONB key matching (`metadata_json ? 'key_name'`) not substring matching to avoid false positives (e.g., `prompt_version` must not trigger `prompt`).

### 9.2 Columns to scan

| Table | Column | Risk |
|---|---|---|
| `erp_ai_usage_logs` | `metadata_json` | High — AI operation metadata |
| `dms_ai_job_queue` | `payload_json` | High — job payloads |
| `dms_ai_job_queue` | `safe_error_json` | Medium — sanitized errors |
| `dms_ai_job_attempts` | `safe_error_message` | Medium — sanitized errors |
| `dms_review_queue` | `payload_json` | Medium — review context |
| `dms_ai_validation_findings` | `evidence_json` | Medium — validation evidence |
| `dms_ai_entity_match_candidates` | `source_text_summary` | Medium — text fragments |
| `dms_ai_entity_match_candidates` | `match_reason` | Medium — text explanation |
| `audit_logs` | All JSON columns | Medium — audit context |

### 9.3 SQL payload safety script plan

**Deliverable:** `implementation_Review/ERP_DMS_AI_PHASE_15_PAYLOAD_SAFETY_CHECKS.sql`

```sql
-- For each table/column: check each forbidden key using JSONB ? operator
-- Example pattern (to be repeated for all forbidden keys and columns):
SELECT id, 'erp_ai_usage_logs.metadata_json' as location,
       'prompt' as forbidden_key
FROM public.erp_ai_usage_logs
WHERE metadata_json IS NOT NULL
  AND metadata_json ? 'prompt'
LIMIT 5;

-- Check text columns (source_text_summary, match_reason) for raw OCR/prompt fragments
-- Use length-based heuristic (very long strings may indicate raw text leakage)
SELECT id, LENGTH(source_text_summary) as len
FROM public.dms_ai_entity_match_candidates
WHERE LENGTH(source_text_summary) > 1000;
```

Script must produce a "PASS: 0 violations found" or "FAIL: N violations" summary.

### 9.4 `safe-usage-redaction.ts` unit test plan

Write Vitest unit tests for `src/lib/ai/observability/safe-usage-redaction.ts`:
- Test `buildSafeMetadata` strips all blocked keys
- Test `buildSafeMetadata` does not strip safe keys (`prompt_version`, `model_id`, etc.)
- Test `sanitizeErrorMessage` caps long strings
- Test `sanitizeErrorMessage` redacts API key patterns
- Test `buildSafeMetadata` handles nested objects recursively
- Test `buildSafeMetadata` handles null/undefined gracefully

---

## 10. Performance and Index Review Plan

### 10.1 Duplicate index finding (must-fix minor hardening)

Live DB inspection revealed duplicate indexes on `erp_ai_usage_logs`:

| Duplicate Pair | Index 1 | Index 2 | Action |
|---|---|---|---|
| `created_at DESC` | `erp_ai_usage_logs_created_at_idx` | `idx_erp_ai_usage_created` | Drop one |
| `provider_config_id` | `erp_ai_usage_logs_provider_config_idx` | `idx_erp_ai_usage_config` | Drop one |

**Categorized as:** `LOW / Minor hardening fix`

Recommended fix in Phase 15 migration:
```sql
DROP INDEX IF EXISTS public.erp_ai_usage_logs_created_at_idx;
DROP INDEX IF EXISTS public.erp_ai_usage_logs_provider_config_idx;
-- Keep: idx_erp_ai_usage_created and idx_erp_ai_usage_config
```

### 10.2 Performance review script plan

**Deliverable:** `implementation_Review/ERP_DMS_AI_PHASE_15_PERFORMANCE_REVIEW_QUERIES.sql`

#### Job queue claim query
```sql
EXPLAIN ANALYZE
SELECT * FROM public.dms_ai_job_queue
WHERE job_status IN ('queued','retry_scheduled')
  AND run_after <= NOW()
ORDER BY priority ASC, run_after ASC
LIMIT 5
FOR UPDATE SKIP LOCKED;
-- Expected: Index Scan on idx_dms_ai_job_queue_claim
```

#### Review queue list query
```sql
EXPLAIN ANALYZE
SELECT * FROM public.dms_review_queue
WHERE status IN ('open','assigned','in_review')
  AND deleted_at IS NULL
ORDER BY priority, queued_at DESC
LIMIT 50;
-- Expected: Index Scan on idx_dms_review_queue_active
```

#### Usage log date range query (observability dashboard)
```sql
EXPLAIN ANALYZE
SELECT feature_area, operation_type, COUNT(*), SUM(token_count_in), SUM(cost_estimate)
FROM public.erp_ai_usage_logs
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY feature_area, operation_type;
-- Expected: Index Scan on idx_erp_ai_usage_created
-- Potential: If aggregation over 7 days is slow at scale, consider composite index (created_at, feature_area)
```

#### Semantic chunk search (vector similarity)
```sql
EXPLAIN ANALYZE
SELECT id, chunk_index, embedding_status
FROM public.dms_document_content_chunks
WHERE is_active = true
  AND embedding IS NOT NULL
  AND embedding_status = 'complete'
ORDER BY embedding <=> '[...sample vector...]'::vector
LIMIT 10;
-- Expected: HNSW Index Scan on idx_dms_chunks_embedding_hnsw
```

#### Validation findings open count
```sql
EXPLAIN ANALYZE
SELECT COUNT(*) FROM public.dms_ai_validation_findings
WHERE status='open' AND deleted_at IS NULL;
-- Expected: Index Only Scan on idx_dms_ai_validation_findings_active
```

### 10.3 Slow query threshold
Define thresholds for Phase 15 regression baseline:
- Job claim query: < 10ms
- Review queue list (50 rows): < 50ms
- Usage log 7-day aggregate: < 200ms
- Semantic chunk search: < 500ms (HNSW is approximate)
- Validation findings count: < 20ms

### 10.4 Pagination verification
All list queries must use `LIMIT`/`OFFSET` or cursor pagination. Verify:
- `getDmsAiRecentUsageEvents` — check `limit` parameter is applied
- `getDmsAiObservabilityOverview` — check aggregates do not full-scan without date filter
- Review queue list — confirm default limit is applied in server action
- Validation findings list — confirm default limit is applied

---

## 11. Worker / Queue Reliability Test Plan

### 11.1 Worker secret tests

| Test ID | Scenario | Expected |
|---|---|---|
| WR-01 | GET without Authorization header | 401 |
| WR-02 | GET with `Authorization: Bearer wrongsecret` | 401 |
| WR-03 | GET with correct `WORKER_SECRET` | 200 with `{status:"ok", workerEnabled, pendingJobs, runningJobs}` |
| WR-04 | POST without Authorization header | 401 |
| WR-05 | POST with wrong secret | 401 |
| WR-06 | POST correct secret + `DMS_AI_JOB_QUEUE_WORKER_ENABLED=false` | 200, `processed:0`, disabled message |
| WR-07 | POST correct secret + worker enabled + no pending jobs | 200, `processed:0` |
| WR-08 | POST correct secret + worker enabled + 1 pending job | 200, job processed |

### 11.2 Job claim and lock tests

| Test ID | Scenario | Expected |
|---|---|---|
| JC-01 | Enqueue a job with `run_after = future time` | Job remains queued, not picked up |
| JC-02 | Enqueue a job with `idempotency_key` already used | Job skipped (returns `skipped:true`) |
| JC-03 | Job succeeds | `job_status=completed`, attempt row with `status=completed` |
| JC-04 | Job fails with retryable error | `job_status=retry_scheduled`, `attempt_count` incremented |
| JC-05 | Job fails `max_attempts` times | `job_status=failed`, review queue item created |
| JC-06 | Unknown job type enqueued | Job fails gracefully with `code=unregistered_handler` (not panic) |

### 11.3 Stale running recovery

The job runner has a stale-lock recovery mechanism (`max_running_age_ms`). Verify:
- A job stuck in `running` state for > configured timeout is recovered
- The recovery updates `locked_at` and re-queues

### 11.4 Phase 14 observability column wiring (job handlers)

Current state: `DmsAiJobHandlerResult` has `usageLogId`, `inputTokenCount`, `outputTokenCount`, `modelName`, `providerCode`, `estimatedCost` fields, and `updateAttemptCompleted` stores them. However, inspect whether the three active handlers (`post_approve_orchestration`, `ocr_backfill`, `semantic_document_index`) actually return these fields.

Test: After processing a `semantic_document_index` job, verify `dms_ai_job_attempts.usage_log_id` is non-null if a usage log was created.

**Known gap from planning prompt:** Job handlers may not be populating observability fields. This should be categorized during implementation.

---

## 12. AI Usage / Cost Observability Hardening Plan

### 12.1 `logDmsAiUsage` redaction test

Unit tests (Vitest) for `src/lib/ai/observability/log-dms-ai-usage.ts`:

- Test that `metadata` containing `prompt`, `raw_response`, `ocr_text` is stripped before insert
- Test that `metadata` containing safe keys (`model_id`, `document_type_code`, `prompt_version`) is preserved
- Test that error messages are capped at 300 characters
- Test that `estimateCost` returns `null` for cost rates with `requires_confirmation=true`
- Test that `estimateCost` returns a positive value for confirmed rates
- Test that `estimateCost` returns `0` for zero-cost rates (`rate_type='zero'`)

### 12.2 Usage log column completeness check

SQL check to verify canonical columns are populated:
```sql
-- Check for null required columns in recent usage logs
SELECT
  COUNT(*) FILTER (WHERE provider_config_id IS NULL) as null_provider_config,
  COUNT(*) FILTER (WHERE operation_type IS NULL) as null_operation_type,
  COUNT(*) FILTER (WHERE feature_area IS NULL) as null_feature_area,
  COUNT(*) FILTER (WHERE status IS NULL) as null_status,
  COUNT(*) FILTER (WHERE model_id IS NULL) as null_model_id
FROM public.erp_ai_usage_logs
WHERE created_at >= NOW() - INTERVAL '7 days';
```

**Known historical gap:** Rows created before Phase 14 will have `document_id=NULL`, `ai_job_id=NULL`, `upload_session_id=NULL`. This is expected (not a bug).

**Known gap from planning prompt:** `providerConfigId` in `chunk-embedder.ts` may be null. This must be verified by reading `chunk-embedder.ts` during implementation and classified.

### 12.3 Cost rate behavior tests

| Test ID | Scenario | Expected |
|---|---|---|
| CR-01 | Rate with `requires_confirmation=true` | `estimateCost` returns `null` |
| CR-02 | Rate with confirmed `rate_type=token` | Correct cost calculated |
| CR-03 | Rate with `rate_type=zero` | Cost = 0 |
| CR-04 | No matching rate | `estimateCost` returns `null` (graceful) |
| CR-05 | Rate with `is_active=false` | Not used in calculation |
| CR-06 | Rate outside `effective_from/to` window | Not used in calculation |

### 12.4 Observability dashboard safety test (no AI calls)

Instrument verification:
- Load `/admin/dms/ai-observability` with `DMS_AI_OBSERVABILITY=true`
- Monitor `erp_ai_usage_logs` row count before and after page load
- Assert: row count does not increase (no AI calls made by dashboard load)
- Assert: all SQL queries in dashboard server actions use `SELECT` only

---

## 13. Route Smoke Test Plan

### 13.1 User-facing DMS routes

| Route | Auth Required | Expected | Notes |
|---|---|---|---|
| `/dms` | Yes | 200, DMS dashboard renders | |
| `/dms/documents` | Yes | 200, documents list table renders | |
| `/dms/documents/record/[id]` | Yes | 200, document record renders | Requires valid document ID |
| `/dms/inbox` | Yes | 200, inbox table renders | |
| `/dms/inbox/batches` | Yes | 200, batch list renders | |
| `/dms/review-queue` | Yes | 200, review queue dashboard cards render | |
| `/dms/intake/[sessionCode]` | Yes | 200 or redirect | Requires valid session code |
| `/dms/expiring` | Yes | 200, expiring documents renders | |
| `/dms/renewals` | Yes | 200, renewals table renders | |

### 13.2 Admin DMS routes

| Route | Auth Required | Expected | Notes |
|---|---|---|---|
| `/admin/dms` | Yes + dms.admin | 200, DMS admin page renders | |
| `/admin/dms/intelligence` | Yes + dms.admin | 200, intelligence admin renders | |
| `/admin/dms/ai-observability` | Yes + `dms.ai_observability.view` | 200 when flag ON; redirect/disabled when flag OFF | Flag must be tested both ways |
| `/admin/dms/document-types` | Yes + dms.admin | 200 | |
| `/admin/dms/metadata-definitions` | Yes + dms.admin | 200 | |
| `/admin/dms/categories` | Yes + dms.admin | 200 | |
| `/admin/dms/retention-policies` | Yes + dms.admin | 200 | |
| `/admin/dms/tags` | Yes + dms.admin | 200 | |
| `/admin/settings/ai` | Yes + settings.ai.manage | 200 | AI provider config page |

### 13.3 Worker route

| Route | Auth | Expected |
|---|---|---|
| `GET /api/internal/dms-ai-jobs/process` | WORKER_SECRET header | 200 + JSON |
| `POST /api/internal/dms-ai-jobs/process` | WORKER_SECRET header | 200 + JSON |

### 13.4 Smoke test implementation

**Deliverable:** `scripts/dms-ai-phase15-smoke.ts`

Use Node.js `fetch()` with a session cookie from `sameer@algt.net` to perform GET requests against all routes above. Script must:
1. Authenticate and extract session cookie
2. GET each route and assert 200 status
3. GET each route and assert key heading visible (via HTML text search)
4. Output PASS/FAIL per route
5. Exit with non-zero code if any route fails

---

## 14. Runtime Browser UAT Plan

### 14.1 Test user and credentials

| Field | Value |
|---|---|
| User | `sameer@algt.net` |
| Password | From project `.env.local` — do NOT print in logs, scripts, or reports |
| Role | System Admin (full access) |

### 14.2 Test document policy

- **Primary:** Use existing safe non-confidential documents already in the DB (37 documents available)
- **Secondary:** Create a temporary test document only if needed; prefix title with `[PHASE15-TEST]` for easy identification
- **Prohibited:** Upload or use real confidential business documents
- **Cleanup:** Delete any document with `[PHASE15-TEST]` prefix after UAT

### 14.3 Playwright test plan

**Install:** `npm install --save-dev @playwright/test && npx playwright install chromium`

**Config file:** `playwright.config.ts` (to be created in Phase 15 implementation)

**Deliverable:** `tests/e2e/dms-ai-phase15.spec.ts`

Test cases:

```
PW-01: Login flow → authenticated state persists
PW-02: /dms/documents — page loads, table renders, no 500
PW-03: /dms/documents/record/[existing_id] — record loads, all section tabs clickable
PW-04: /dms/review-queue — page loads, dashboard cards render (even if empty)
PW-05: /admin/dms/intelligence — page loads, feature flag status cards visible
PW-06: /admin/dms/ai-observability with DMS_AI_OBSERVABILITY=false → disabled state (not 500)
PW-07: /admin/dms/ai-observability with DMS_AI_OBSERVABILITY=true → dashboard loads, 9 sections visible
PW-08: Document record → OCR section renders (even if no OCR result)
PW-09: Document record → AI Summary section renders
PW-10: Document record → Semantic Search / Ask AI section renders (if flag on)
PW-11: Review Queue → list renders, resolve action works for existing open item
```

### 14.4 Feature flag toggle tests

For flags that are currently OFF and need ON-state testing:
- Enable flag via SQL before test: `UPDATE erp_ai_feature_flags SET is_enabled=true WHERE feature_code='...';`
- Run test
- Disable flag via SQL after test: `UPDATE erp_ai_feature_flags SET is_enabled=false WHERE feature_code='...';`

Use Playwright's `beforeAll`/`afterAll` hooks or a test fixture to manage flag state safely.

### 14.5 Cleanup after UAT

- Delete any `[PHASE15-TEST]` documents
- Restore all feature flags to safe-off state
- Verify `dms_ai_entity_match_candidates` is still empty (no accidental test data)
- Verify `dms_ai_validation_findings` count unchanged from pre-test count

---

## 15. Hardening Bug Fix Classification Plan

### Classification scheme

| Level | Criteria | Action |
|---|---|---|
| **BLOCKER** | Prevents safe production use; data leak; auth bypass | Must fix before Phase 15 closure |
| **HIGH** | Security/RLS gap; data leakage potential; correctness issue | Must fix in Phase 15 |
| **MEDIUM** | Runtime bug with safe workaround; minor data quality | Fix in Phase 15 or document as known |
| **LOW** | UX note; performance note; cosmetic | Fix opportunistically or defer |
| **DEFERRED** | Future enhancement; not production-blocking | Document and defer to Phase 16+ |

### Evaluated known items from planning prompt

| Item | Assessment | Category |
|---|---|---|
| `npm run build` not run in Phase 14 UAT | Risk: build may have TypeScript/import errors not caught by `tsc --noEmit` alone. Must run `npm run build` in Phase 15. | **MEDIUM** — Run build as AC-14 |
| `providerConfigId` in `chunk-embedder.ts` may be null | Risk: usage log `provider_config_id` will be null for embedding operations, making cost estimation impossible. Must read `chunk-embedder.ts` to confirm. | **MEDIUM** — Verify and classify |
| Job handlers not populating usage observability fields | Risk: `dms_ai_job_attempts.usage_log_id/token_count_in/etc` remain null even when jobs complete with AI. Handler review required. | **MEDIUM** — Verify each handler |
| Historical usage logs have `document_id=null` | Expected behavior for pre-Phase 14 rows. | **DEFERRED** — Document as known |
| Entity match candidate review not browser-tested | Test data (0 candidates) not available in live DB. | **LOW** — Document limitation; plan controlled test |
| Duplicate document rule not runtime-tested | Flag `DMS_AI_DUPLICATE_DOCUMENTS=false` means this is unreachable. | **DEFERRED** — Flag is safely off |
| Non-admin RLS browser UAT limited | No non-admin test user available. Cannot verify cross-user data isolation in browser. | **MEDIUM** — Document as known limitation; verify via SQL |
| `erp_ai_usage_logs` broad INSERT policy | Any authenticated user can insert. Low exploitability, but could pollute metrics. | **LOW** — Minor hardening fix |
| Duplicate indexes on `erp_ai_usage_logs` | Two pairs of redundant indexes waste storage and slow inserts. | **LOW** — Fix in Phase 15 migration |

### Additional items to evaluate during Phase 15 implementation

1. **`chunk-embedder.ts` providerConfigId**: Read the file and verify if `providerConfigId` is correctly passed or defaulted to null.
2. **Handler observability field population**: Inspect each of the 3 handlers to see if `usageLogId` etc. are returned in the result.
3. **Review queue payload_json contents**: Run the payload safety SQL script to confirm no forbidden keys.
4. **`npm run build` success**: Must be run during Phase 15 as acceptance criterion AC-14.
5. **`npm run lint` status**: Check for existing lint errors in modified files.

---

## 16. Planned Deliverables

| Deliverable | Type | Path |
|---|---|---|
| SQL RLS QA script | SQL | `implementation_Review/ERP_DMS_AI_PHASE_15_SECURITY_RLS_QA_CHECKS.sql` |
| SQL payload safety script | SQL | `implementation_Review/ERP_DMS_AI_PHASE_15_PAYLOAD_SAFETY_CHECKS.sql` |
| SQL performance review queries | SQL | `implementation_Review/ERP_DMS_AI_PHASE_15_PERFORMANCE_REVIEW_QUERIES.sql` |
| Route smoke test script | TypeScript | `scripts/dms-ai-phase15-smoke.ts` |
| Playwright E2E test | TypeScript | `tests/e2e/dms-ai-phase15.spec.ts` |
| Playwright config | TypeScript | `playwright.config.ts` |
| Runtime UAT checklist | Markdown | `implementation_Review/ERP_DMS_AI_PHASE_15_RUNTIME_UAT_CHECKLIST.md` |
| Production readiness checklist | Markdown | `implementation_Review/ERP_DMS_AI_PHASE_15_PRODUCTION_READINESS_CHECKLIST.md` |
| Vitest unit tests | TypeScript | `src/lib/ai/observability/__tests__/safe-usage-redaction.test.ts` |
| Vitest unit tests | TypeScript | `src/lib/ai/observability/__tests__/log-dms-ai-usage.test.ts` |
| Duplicate index migration | SQL | `supabase/migrations/20260628000000_erp_dms_ai_phase15_hardening.sql` |
| Phase 15 implementation report | Markdown | `implementation_Review/ERP_DMS_AI_PHASE_15_TESTING_PERFORMANCE_HARDENING_IMPLEMENTATION_REPORT.md` |

**Note:** Before creating `tests/e2e/`, `playwright.config.ts`, or Vitest tests, the implementation must first run:
```bash
npm install --save-dev @playwright/test vitest @vitest/coverage-v8
npx playwright install chromium
```

And add to `package.json` scripts:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:e2e": "playwright test",
"test:e2e:headed": "playwright test --headed"
```

---

## 17. Server Action / Test Helper Plan

### 17.1 Guiding principles

- Do NOT add test-only API routes in production code unless gated by `NODE_ENV=test` and removed before merge
- Prefer Playwright for browser-level tests using the existing UI
- Prefer SQL scripts in `implementation_Review/` for manual database verification
- Keep all test scripts read-only where possible; use explicit test data with cleanup for mutation tests
- Do NOT use the DMS feature actions for test writes against production documents

### 17.2 Planned test helpers

| Helper | Location | Purpose | Notes |
|---|---|---|---|
| SQL RLS QA | `implementation_Review/...SECURITY_RLS_QA_CHECKS.sql` | Execute via Supabase SQL editor | Read-only queries |
| SQL payload scan | `implementation_Review/...PAYLOAD_SAFETY_CHECKS.sql` | Execute via Supabase SQL editor | Read-only queries |
| SQL performance | `implementation_Review/...PERFORMANCE_REVIEW_QUERIES.sql` | Execute via Supabase SQL editor | EXPLAIN ANALYZE |
| Route smoke | `scripts/dms-ai-phase15-smoke.ts` | Node.js script, HTTP GET requests | Requires dev server running |
| Vitest unit | `src/lib/ai/observability/__tests__/` | Unit tests for redaction/logging | Pure function tests, no DB |
| Playwright E2E | `tests/e2e/dms-ai-phase15.spec.ts` | Full browser tests | Requires running dev server |

### 17.3 Test data isolation strategy

- Use `[PHASE15-TEST]` prefix on any documents created for testing
- Use idempotency keys when enqueuing test jobs (include `phase15-test` in key)
- After test suite, run cleanup SQL:
  ```sql
  DELETE FROM public.dms_documents WHERE title LIKE '[PHASE15-TEST]%';
  DELETE FROM public.dms_ai_job_queue WHERE idempotency_key LIKE 'phase15-test%';
  ```

---

## 18. Production Readiness Checklist

**Deliverable:** `implementation_Review/ERP_DMS_AI_PHASE_15_PRODUCTION_READINESS_CHECKLIST.md`

```
[ ] PR-01: Feature flags safe defaults documented and verified in DB
[ ] PR-02: WORKER_SECRET configured in production environment (non-empty)
[ ] PR-03: AI provider configs reviewed — only approved providers enabled
[ ] PR-04: erp_ai_model_cost_rates — all rates either confirmed or marked requires_confirmation=true
[ ] PR-05: RLS QA SQL script executed — no violations found
[ ] PR-06: Payload safety SQL script executed — no forbidden keys found
[ ] PR-07: Route smoke tests passed for all 18 routes
[ ] PR-08: Worker auth tests passed (WR-01 through WR-08)
[ ] PR-09: Job queue reliability tests passed (JC-01 through JC-06)
[ ] PR-10: Observability dashboard regression tests passed
[ ] PR-11: Large-list pagination verified (all list queries use LIMIT)
[ ] PR-12: npm run build passed — 0 errors
[ ] PR-13: npm run typecheck passed — 0 errors
[ ] PR-14: npm run lint passed — 0 new errors introduced
[ ] PR-15: Duplicate indexes on erp_ai_usage_logs dropped (migration applied)
[ ] PR-16: erp_ai_usage_logs INSERT policy tightened (or documented as accepted risk)
[ ] PR-17: DMS_AI_OBSERVABILITY=false confirmed in production before go-live
[ ] PR-18: DMS_AI_VALIDATION=false confirmed in production before go-live
[ ] PR-19: DMS_AI_ENTITY_MATCHING=false confirmed in production before go-live
[ ] PR-20: Vitest unit tests pass (redaction, cost estimation)
[ ] PR-21: Playwright E2E smoke tests pass (or documented limitations)
[ ] PR-22: No Apply-to-ERP writes introduced — confirmed by code review
[ ] PR-23: Backup/rollback plan documented for Phase 15 migration
[ ] PR-24: Phase 15 implementation report created and signed off
```

---

## 19. Recommended Phase 15 Implementation Scope

### 19.1 Must-do (blockers for closure)

1. **Run `npm run build`** — verify production build succeeds; fix any errors found
2. **Create and execute SQL RLS QA script** — verify all 13 tables, no violations
3. **Create and execute SQL payload safety script** — verify no forbidden keys in live data
4. **Create and execute SQL performance review queries** — capture EXPLAIN ANALYZE baseline
5. **Fix duplicate indexes on `erp_ai_usage_logs`** — apply a hardening migration
6. **Route smoke tests** — verify all 18 DMS AI routes return 200 (script or manual)
7. **Worker auth tests** — verify WR-01 through WR-06
8. **Create production readiness checklist** — fill all 24 items
9. **Investigate `providerConfigId` in chunk-embedder** — classify and fix or document

### 19.2 Should-do (hardening quality)

10. **Install Playwright** + write E2E spec (`tests/e2e/dms-ai-phase15.spec.ts`) — smoke tests for all key routes
11. **Install Vitest** + write unit tests for `safe-usage-redaction.ts` and `logDmsAiUsage`
12. **Investigate handler observability field population** — classify per handler
13. **Review and tighten `erp_ai_usage_logs` INSERT policy** — or formally accept the risk in the report

### 19.3 Optional (if time permits)

14. **Feature flag matrix browser test** — validate ON/OFF behavior for validation and entity matching flags with controlled test data
15. **Stale lock recovery test** — verify the job runner stale-lock recovery path

---

## 20. Implementation Sequence for Future Phase 15 Execution

```
Step 1:  Read source of truth (.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md, this plan)
Step 2:  Run npm run typecheck — establish baseline
Step 3:  Run npm run build — establish baseline; fix any errors found
Step 4:  Install @playwright/test + vitest (npm install --save-dev)
Step 5:  Add test/test:e2e scripts to package.json
Step 6:  Create playwright.config.ts
Step 7:  Write SQL RLS QA script → execute via user-supabase MCP → document results
Step 8:  Write SQL payload safety script → execute via user-supabase MCP → document results
Step 9:  Write SQL performance review queries → execute → document EXPLAIN ANALYZE results
Step 10: Create Phase 15 hardening migration (drop duplicate indexes; tighten usage log INSERT policy)
Step 11: Apply migration via user-supabase MCP
Step 12: Investigate chunk-embedder providerConfigId gap → classify → fix if needed
Step 13: Inspect each job handler → classify observability field population gaps
Step 14: Write Vitest unit tests for safe-usage-redaction.ts and log-dms-ai-usage.ts
Step 15: Run vitest → all tests pass
Step 16: Write route smoke test script → execute against running dev server
Step 17: Write Playwright E2E spec → run against running dev server
Step 18: Execute worker auth tests (curl/HTTP)
Step 19: Execute full Runtime UAT checklist (browser)
Step 20: Restore all feature flags to safe-off states
Step 21: Fill production readiness checklist
Step 22: Create Phase 15 implementation report
Step 23: Update ALGT_ERP_SOURCE_OF_TRUTH.md
Step 24: Update ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md
```

---

## 21. Acceptance Criteria for Future Implementation

| AC | Criterion |
|---|---|
| AC-01 | Current test infrastructure inspected and documented — DONE in this plan |
| AC-02 | SQL RLS QA script created AND passes for all 13 DMS AI tables (0 violations) |
| AC-03 | Payload safety SQL script created AND confirms 0 forbidden raw content keys in all scanned columns |
| AC-04 | Feature flag matrix tested: safe-off behavior verified for `DMS_AI_OBSERVABILITY`, `DMS_AI_VALIDATION`, `DMS_AI_ENTITY_MATCHING`; ON-state verified for live flags |
| AC-05 | Route smoke tests pass for all 18 DMS AI admin/user routes (200, key heading visible) |
| AC-06 | Review queue regression test passes (list loads, item resolves) |
| AC-07 | Validation/entity-matching regression test passes (or documented test limitation) |
| AC-08 | Observability dashboard regression tests pass (loads, read-only, no AI calls triggered) |
| AC-09 | Worker route auth tests pass (WR-01 through WR-08) |
| AC-10 | Job queue reliability tests pass OR limitations documented (unregistered handler graceful fail, stale lock recovery) |
| AC-11 | Performance review queries created; all key queries verified to use indexes; duplicate index migration applied |
| AC-12 | No Apply-to-ERP writes, metadata auto-save, or entity auto-linking introduced — confirmed |
| AC-13 | `npm run typecheck` passes (0 errors) |
| AC-14 | `npm run build` passes (0 errors), or environmental blocker documented |
| AC-15 | Production readiness checklist created and all 24 items passed or documented |

---

## 22. Full UAT / Test Plan

### 22.1 SQL QA gate (no browser required)

Execute `ERP_DMS_AI_PHASE_15_SECURITY_RLS_QA_CHECKS.sql` via user-supabase MCP.
Expected: All assertions return 0 rows (no violations).

Execute `ERP_DMS_AI_PHASE_15_PAYLOAD_SAFETY_CHECKS.sql` via user-supabase MCP.
Expected: All forbidden key checks return 0 rows.

Execute `ERP_DMS_AI_PHASE_15_PERFORMANCE_REVIEW_QUERIES.sql` via user-supabase MCP.
Expected: Key queries show Index Scan (not Seq Scan) in EXPLAIN ANALYZE.

### 22.2 Build and type gate

```bash
npm run typecheck   # Must pass: 0 errors
npm run build       # Must pass: 0 build errors
npm run lint        # Document any new errors
```

### 22.3 Unit test gate

```bash
npm run test        # vitest run
# Expected: All tests in src/lib/ai/observability/__tests__/ pass
```

### 22.4 Route smoke test gate

```bash
npx ts-node scripts/dms-ai-phase15-smoke.ts
# Expected: All 18 routes return PASS
```

### 22.5 Worker auth test gate

```bash
# WR-01: No header
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/internal/dms-ai-jobs/process
# Expected: 401

# WR-03: Correct secret (GET)
curl -s -H "Authorization: Bearer $WORKER_SECRET" http://localhost:3000/api/internal/dms-ai-jobs/process
# Expected: 200 with JSON
```

### 22.6 Playwright E2E gate

```bash
npm run test:e2e    # playwright test
# Expected: PW-01 through PW-11 pass
```

### 22.7 Feature flag restore gate

```sql
-- Restore safe-off states after all UAT
UPDATE erp_ai_feature_flags SET is_enabled=false WHERE feature_code='DMS_AI_OBSERVABILITY';
UPDATE erp_ai_feature_flags SET is_enabled=false WHERE feature_code='DMS_AI_VALIDATION';
UPDATE erp_ai_feature_flags SET is_enabled=false WHERE feature_code='DMS_AI_ENTITY_MATCHING';
```

---

## 23. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `npm run build` fails due to undetected TypeScript errors | Medium | Medium | AC-14 requires build pass; fix any errors found |
| Playwright install fails in Windows environment | Medium | Low | Use Node.js fetch-based smoke tests as fallback for route checks |
| No non-admin test user available | High | Low | Document as known limitation; verify cross-user isolation via SQL RLS tests instead |
| `providerConfigId` is confirmed null in chunk-embedder | Medium | Low | Classify as MEDIUM; fix by passing correct config ID, or document as deferred |
| Controlled test for entity matching requires data setup | High | Low | Plan test data creation with cleanup; 0 candidates currently in DB |
| Worker secret not set in dev environment | Low | Low | Smoke test script can skip WR tests and document as "WORKER_SECRET not configured" |
| `erp_ai_usage_logs` policy tightening breaks `logDmsAiUsage` (uses admin client) | Low | Low | Admin client bypasses RLS — policy change only affects direct Supabase SDK inserts |

---

## 24. What Must Not Be Implemented in Phase 15

The following are explicitly forbidden in Phase 15 code:

```
✗ Apply-to-ERP writes (no writes to parties, employees, HR, Fleet, Asset tables)
✗ Metadata auto-save (no approval-free metadata persistence)
✗ Entity auto-linking (no auto-linking party/employee without user confirmation)
✗ AI auto-rerun (no automatic re-trigger of AI analysis)
✗ New automatic retry behavior (no changes to job retry logic)
✗ OCR routing behavior changes (DMS_OCR_ROUTER must stay off)
✗ Semantic chunking algorithm changes
✗ Validation or matching rule changes
✗ Raw prompt, response, OCR text, or chunk text storage in any DB column
✗ API key or secret storage in any DB column
✗ Vendor billing API integration
✗ Live web price fetching for cost rates
✗ New business AI features of any kind
✗ Phase 16 Apply-to-ERP logic (even stub implementations)
```

---

## 25. Corrected Roadmap After Phase 15

```
Phase 9   — Async AI Job Queue / Workflow Runner              CLOSED / LIVE PASS
Phase 10A — OCR Pipeline Upgrade / Azure OCR Wiring           CLOSED / LIVE PASS
Phase 10B — Queue-backed Admin OCR Backfill                   CLOSED / LIVE PASS
Phase 11  — Semantic Chunking and Embeddings                  CLOSED / LIVE PASS
Phase 12  — Review Queue Activation                           CLOSED / LIVE PASS
Phase 13  — Validation, Conflict Detection, Owner Matching     CLOSED / LIVE PASS
Phase 14  — Token / Cost / Observability                      CLOSED / LIVE PASS
Phase 15  — Testing, Performance, Hardening                   [ THIS PHASE — IN PLANNING ]
Phase 16  — Human-Reviewed Apply-to-ERP Records               FUTURE / HIGH-RISK / BLOCKED until Phase 15 CLOSED
```

Phase 16 is intentionally blocked. It involves writing AI suggestions back to ERP business records (parties, employees, contracts). This is the highest-risk operation in the entire DMS AI roadmap and must not begin until Phase 15 fully closes.

---

## 26. Recommended Next Cursor Implementation Prompt

After ChatGPT reviews and approves this plan, the next Cursor prompt should be:

```
ERP DMS AI Phase 15 — Testing, Performance, Hardening Implementation Prompt

Phase type: Implementation
Prior phase: Phase 14 — Token / Cost / Observability — CLOSED / LIVE PASS
Plan file: ERP_DMS_AI_PHASE_15_TESTING_PERFORMANCE_HARDENING_PLAN.md

Instructions:
1. Read ERP_DMS_AI_PHASE_15_TESTING_PERFORMANCE_HARDENING_PLAN.md
2. Read .cursor/ALGT_ERP_SOURCE_OF_TRUTH.md
3. Read ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md
4. Execute all steps in Section 20 (Implementation Sequence) in order
5. Create all deliverables in Section 16
6. Classify all known items in Section 15 (Hardening Bug Fix Classification)
7. Satisfy all Acceptance Criteria in Section 21
8. Create implementation report: implementation_Review/ERP_DMS_AI_PHASE_15_TESTING_PERFORMANCE_HARDENING_IMPLEMENTATION_REPORT.md
9. Update .cursor/ALGT_ERP_SOURCE_OF_TRUTH.md
10. Update ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md
```

---

## 27. Final Recommendation

Phase 15 is ready to plan and implement. The DMS AI stack is architecturally sound:

**Confirmed PASS:**
- All 13 DMS AI tables have RLS enabled and FORCE RLS
- No DELETE policies on append-only tables
- No broad USING (true) SELECT policies
- INSERT policies properly scoped by role/permission
- Feature flags are in safe states (validation, entity matching, observability are all OFF)
- Job runner, worker route, and handlers are structurally correct
- Semantic chunking has HNSW vector index and appropriate partial indexes

**Priority hardening items:**
1. Run `npm run build` (never done in Phase 14 UAT — must pass before closure)
2. Drop duplicate indexes on `erp_ai_usage_logs` (minor migration)
3. Investigate `providerConfigId=null` in chunk-embedder and handler observability field population
4. Establish full automated test infrastructure (Playwright + Vitest — both new to this project)

**Scope boundary is clear:** Phase 15 closes the testing gap before Phase 16 (Apply-to-ERP) introduces the highest-risk write operations in the entire roadmap. The investment in test infrastructure now will de-risk Phase 16 significantly.
