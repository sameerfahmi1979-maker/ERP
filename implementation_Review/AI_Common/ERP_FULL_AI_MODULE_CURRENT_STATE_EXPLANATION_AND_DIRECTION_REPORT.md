# ERP Full AI Module — Current State Explanation and Direction Report

**Date:** 2026-06-27  
**Prepared by:** Cursor AI Agent (read-only audit)  
**Latest closed AI phase:** ERP DMS AI Phase 17 — Apply Correction Proposal (LIVE PASS / CLOSED ✅)  
**Source:** Live DB inspection, source code audit, implementation reports

---

## 1. Executive Summary

The ALGT ERP has a **deeply implemented, production-grade AI stack** spanning 17 DMS AI phases, 7+ Common AI modules, and a full settings/provider/observability foundation. Here is what exists today:

**What AI exists today:**
- End-to-end document AI pipeline: upload → OCR → classification/extraction → human review → metadata apply → orchestration → semantic search → validation/entity matching → apply-to-ERP → correction proposals
- Cross-ERP Common AI: field suggestions, duplicate detection, compliance checks, risk scoring, semantic search, AI assistant (read-only), daily dashboard, audit explainer, data quality monitor
- AI settings UI with provider configuration (OpenAI GPT-4.1 active)
- Token/cost observability dashboard
- Job queue with async processing worker

**What is production-ready (can be turned on):**
- DMS document upload, OCR (GPT-4.1 vision), classification, extraction, summarization, semantic chunks + embeddings — all flags ON
- Review queue, validation, entity matching — flags ON
- Apply-to-ERP: DMS document fields + metadata (Tier 1), party licenses + tax registrations (Tier 2) — flags ON
- AI search across ERP, AI assistant for read/navigation queries — flags ON
- AI compliance findings, daily dashboard — flags ON

**What is hidden behind flags (disabled):**
- Apply Correction Proposals (`DMS_AI_APPLY_CORRECTION_PROPOSALS=false`) — Phase 17 built and UAT closed; needs admin decision to enable
- Apply Correction Restore Previous (`DMS_AI_APPLY_CORRECTION_RESTORE_PREVIOUS=false`)
- Azure Document Intelligence OCR (`DMS_OCR_AZURE=false`) — adapter built, not enabled
- Tesseract OCR (`DEFAULT_DMS_OCR=disabled`) — config exists, provider is disabled
- Local LLM (`LOCAL_LLM=false`) — stub only

**What is only partial / not yet started:**
- Phase 16 Tier 3: Party contacts + addresses write-back — **planned, not started**
- HR Apply-to-ERP writes — Phase 8 mapping preview only, no write path
- Branch/Site field suggestions — registry stubs only
- Playwright E2E automation — spec exists, blocked by env var
- Azure DI as primary OCR path — adapter built, flag disabled

**What should be done next:**
The system is feature-rich but needs a **stabilization + navigation clarity pass** before adding more AI phases. Then the clearest next functional step is **Phase 16 Tier 3 (Party Contacts/Addresses write-back)** or **enabling/hardening the correction proposal for production use**.

---

## 2. Scope and Methodology

This report is **read-only**. No code changes, migrations, data mutations, or flag changes were made.

**Data sources:**
- Live Supabase DB (`user-supabase` MCP): table inventory, column schemas, feature flag states, row counts, provider configs, RLS status
- Codebase exploration: `src/lib/ai/`, `src/lib/dms/`, `src/server/actions/`, `src/features/`, `src/app/`, `supabase/migrations/`
- Implementation reports: `implementation_Review/` and `implementation_Review/AI_Enhancement/`
- Source-of-truth documents: `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`, `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md`

---

## 3. Files, Reports, and Source-of-Truth Documents Reviewed

### Primary Source-of-Truth
- `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` — current, last updated 2026-06-27
- `implementation_Review/AI_Enhancement/ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md` — **stale, only covers through Phase 15**

### Implementation Reports (Phase 9–17)
- Phase 9: `ERP_DMS_AI_PHASE_9_ASYNC_JOB_QUEUE_WORKFLOW_RUNNER_IMPLEMENTATION_REPORT.md`
- Phase 10A: `ERP_DMS_AI_PHASE_10A_OCR_PIPELINE_UPGRADE_AZURE_OCR_WIRING_IMPLEMENTATION_REPORT.md`
- Phase 10B: `ERP_DMS_AI_PHASE_10B_QUEUE_BACKED_ADMIN_OCR_BACKFILL_IMPLEMENTATION_REPORT.md`
- Phase 11: `ERP_DMS_AI_PHASE_11_SEMANTIC_CHUNKING_AND_EMBEDDINGS_IMPLEMENTATION_REPORT.md`
- Phase 12: `ERP_DMS_AI_PHASE_12_REVIEW_QUEUE_ACTIVATION_IMPLEMENTATION_REPORT.md`
- Phase 13: `ERP_DMS_AI_PHASE_13_RUNTIME_UAT_AND_CLOSURE_REPORT.md` (validation + entity matching)
- Phase 14: `ERP_DMS_AI_PHASE_14_TOKEN_COST_OBSERVABILITY_IMPLEMENTATION_REPORT.md`
- Phase 15: `ERP_DMS_AI_PHASE_15_TESTING_PERFORMANCE_HARDENING_IMPLEMENTATION_REPORT.md`
- Phase 16 Tier 1: `ERP_DMS_AI_PHASE_16_HUMAN_REVIEWED_APPLY_TO_ERP_IMPLEMENTATION_REPORT.md` + UAT
- Phase 16 Tier 2: `ERP_DMS_AI_PHASE_16_TIER_2_PARTY_LICENSES_TAX_WRITEBACK_IMPLEMENTATION_REPORT.md` + UAT
- Phase 17: `ERP_DMS_AI_PHASE_17_APPLY_CORRECTION_PROPOSAL_IMPLEMENTATION_REPORT.md` + Browser UAT
- Common AI 0–1G, 3–7, 13–15: in `implementation_Review/AI_Enhancement/`

---

## 4. AI System Map — High-Level Overview

```
ALGT ERP AI System
│
├── SETTINGS FOUNDATION (ERP SETTINGS.1)
│   ├── erp_ai_provider_configs      — 7 configs (OpenAI x4, Azure x1, Tesseract x1, LocalLLM x1)
│   ├── erp_ai_feature_flags         — 66 flags
│   ├── erp_ai_usage_logs            — token/cost tracking (69 entries)
│   ├── erp_ai_model_cost_rates      — per-model cost rates
│   └── src/lib/ai/providers/factory.ts — provider abstraction layer
│
├── DMS AI PIPELINE (Phases 1–17)
│   ├── Document Intake
│   │   ├── Upload Inbox (/dms/inbox)
│   │   ├── AI Intake Review (/dms/intake/[code])
│   │   └── Batch Upload (/dms/inbox — multi-file)
│   │
│   ├── OCR & Text Extraction
│   │   ├── GPT-4.1 Vision (default, active)
│   │   ├── Azure Document Intelligence (built, flag OFF)
│   │   ├── Tesseract (config present, disabled)
│   │   └── OCR Router + Backfill queue
│   │
│   ├── Classification & Extraction
│   │   ├── GPT-4.1 classify + extract (structured JSON)
│   │   ├── Metadata definitions per doc type
│   │   ├── Confidence scoring
│   │   └── Human review gate
│   │
│   ├── Document Lifecycle After Approve
│   │   ├── Post-approve orchestration (async via job queue)
│   │   ├── AI analysis tab (on document record)
│   │   ├── Apply AI to metadata (Phase 6 — human confirms)
│   │   ├── ERP mapping preview (Phase 8 — read-only)
│   │   └── AI summary, completeness, risk score
│   │
│   ├── Semantic Search (Phase 11)
│   │   ├── Document content chunking (paragraph-aware)
│   │   ├── Embeddings (text-embedding-3-small)
│   │   ├── pgvector HNSW index
│   │   ├── Per-doc Ask AI (Q&A)
│   │   └── Cross-doc semantic search
│   │
│   ├── Review Queue (Phase 12)
│   │   ├── /dms/review-queue page
│   │   ├── 6 review types (AI failures, conflicts, low confidence, etc.)
│   │   ├── Assign, resolve, dismiss
│   │   └── Dashboard cards
│   │
│   ├── Validation & Entity Matching (Phase 13)
│   │   ├── 9 deterministic validation rules
│   │   ├── dms_ai_validation_findings
│   │   ├── Party/owner entity matching
│   │   └── dms_ai_entity_match_candidates
│   │
│   ├── Observability (Phase 14)
│   │   ├── /admin/dms/ai-observability dashboard
│   │   ├── Token/cost breakdown by model
│   │   ├── Pipeline health metrics
│   │   └── 14 observability server actions
│   │
│   ├── Apply-to-ERP (Phase 16 Tier 1+2)
│   │   ├── DMS document fields (7 fields) — active
│   │   ├── DMS metadata values — active
│   │   ├── Party licenses (6 fields) — active
│   │   ├── Party tax registrations (4 fields) — active
│   │   ├── Human confirmation gate (mandatory)
│   │   ├── Conflict detection
│   │   └── Audit trail
│   │
│   └── Apply Correction (Phase 17) — flags OFF
│       ├── Correction proposal table
│       ├── Manual/restore modes
│       ├── Dual-checkbox human confirmation
│       ├── Conflict detection
│       └── Full audit trail
│
├── COMMON AI (COMMON AI.0–1G, 3–7, 13–15)
│   ├── Field Suggestions (COMMON AI.1)
│   │   ├── Company + Party (pilot entities)
│   │   ├── 15 field handlers for Stage 1
│   │   ├── Evidence loader + prompt builder
│   │   └── Human accept/reject/apply
│   │
│   ├── Duplicate Detection (COMMON AI.3)
│   │   ├── erp_ai_duplicate_candidates
│   │   ├── Deterministic + AI scan
│   │   └── Human review
│   │
│   ├── Compliance Checker (COMMON AI.4)
│   │   ├── erp_ai_compliance_findings (31 findings in DB)
│   │   ├── Document + cross-AI rules
│   │   └── Waive/false-positive
│   │
│   ├── Risk Scoring (COMMON AI.5)
│   │   ├── erp_ai_risk_scores (0 live scores)
│   │   ├── Signal collectors per entity
│   │   └── Stale detector
│   │
│   ├── AI Search Across ERP (COMMON AI.6)
│   │   ├── AI_SEARCH=true, ERP_AI_ERP_SEARCH=true
│   │   ├── Intent extraction → entity collectors → DMS bridge
│   │   └── /admin/search (or global search)
│   │
│   ├── ERP AI Assistant (COMMON AI.7)
│   │   ├── ERP_AI_ASSISTANT=true, ERP_AI_ACTIONS=true
│   │   ├── Read/navigate/draft only — no ERP mutations
│   │   ├── erp_ai_assistant_sessions (1), erp_ai_assistant_messages (4)
│   │   └── Action registry with human-review gate
│   │
│   ├── Daily Dashboard (COMMON AI.13)
│   │   ├── ERP_AI_DAILY_DASHBOARD=true
│   │   └── Summary collectors across modules
│   │
│   ├── Audit Explainer (COMMON AI.14)
│   │   ├── ERP_AI_AUDIT_EXPLAINER=true
│   │   └── AI-generated timeline explanations for audit entries
│   │
│   └── Data Quality Monitor (COMMON AI.15)
│       ├── ERP_AI_DATA_QUALITY_MONITOR=true
│       ├── erp_ai_data_quality_findings
│       └── Scan + review/dismiss
│
└── HR AI HOOKS (HR.12)
    ├── Flags seeded (ERP_AI_HR_*) — all enabled
    ├── Tables: hr_compliance_findings, hr_risk_events (via Common AI)
    └── Server actions: compliance, corrections, duplicates, letter/email draft
        (Status: flags seeded, backend partially wired; UI integration extent unclear)
```

---

## 5. AI Feature Flags Inventory

**Total flags: 66** | **Enabled: 62** | **Disabled: 4**

### Disabled Flags (4)

| Feature Code | Enabled | Human Review | Purpose | Recommendation |
|---|---|---|---|---|
| `DMS_AI_APPLY_CORRECTION_PROPOSALS` | ❌ OFF | Yes | Phase 17 correction proposals | Enable when ready for production correction workflow |
| `DMS_AI_APPLY_CORRECTION_RESTORE_PREVIOUS` | ❌ OFF | Yes | Correction restore-from-snapshot helper | Enable after `PROPOSALS` flag and testing |
| `DMS_OCR_AZURE` | ❌ OFF | No | Azure Document Intelligence OCR path | Enable for Arabic/complex doc OCR improvement |
| `LOCAL_LLM` | ❌ OFF | Yes | Local Ollama LLM integration | Keep off — provider is stub only |

### Key Enabled Flags (selected — full list has 62 entries)

| Feature Code | Enabled | Human Review | Min Conf | Related Phase |
|---|---|---|---|---|
| `DMS_OCR` | ✅ | Yes | 0.750 | Phase 10A |
| `DMS_OCR_ROUTER` | ✅ | No | 0.000 | Phase 10A |
| `DMS_OCR_GPT_VISION_FALLBACK` | ✅ | No | 0.000 | Phase 10A |
| `DMS_OCR_BACKFILL_QUEUE` | ✅ | No | 0.000 | Phase 10B |
| `DMS_CLASSIFICATION` | ✅ | Yes | 0.850 | Phase 1 |
| `DMS_EXTRACTION` | ✅ | Yes | 0.850 | Phase 2 |
| `DMS_CONTENT_TEXT_SYNC` | ✅ | No | 0.000 | Phase 11 |
| `DMS_SEMANTIC_CHUNKING` | ✅ | No | 0.000 | Phase 11 |
| `DMS_SEMANTIC_EMBEDDINGS` | ✅ | No | 0.000 | Phase 11 |
| `DMS_SEMANTIC_SEARCH` | ✅ | No | 0.000 | Phase 11 |
| `DMS_SEMANTIC_SEARCH_CHUNKS` | ✅ | No | 0.000 | Phase 11 |
| `DMS_EMBEDDING` | ✅ | No | 0.000 | Phase 11 |
| `DMS_AI_JOB_QUEUE` | ✅ | Yes | 0.850 | Phase 9 |
| `DMS_AI_JOB_QUEUE_WORKER_ENABLED` | ✅ | Yes | 0.850 | Phase 9 |
| `DMS_AI_ORCHESTRATION` | ✅ | No | 0.000 | ORCH.1 |
| `DMS_AI_REVIEW` | ✅ | Yes | 0.000 | Phase 12 |
| `DMS_AI_VALIDATION` | ✅ | Yes | 0.850 | Phase 13 |
| `DMS_AI_ENTITY_MATCHING` | ✅ | Yes | 0.850 | Phase 13 |
| `DMS_AI_OBSERVABILITY` | ✅ | No | 0.850 | Phase 14 |
| `DMS_AI_SEARCH` | ✅ | No | 0.000 | Phase 12 |
| `DMS_AI_SUMMARY` | ✅ | No | 0.000 | Phase 8 |
| `DMS_AI_APPLY_TO_ERP` | ✅ | Yes | 0.000 | Phase 16 |
| `DMS_AI_APPLY_TO_ERP_DMS_METADATA` | ✅ | Yes | 0.000 | Phase 16 Tier 1 |
| `DMS_AI_APPLY_TO_ERP_ENTITY_LINKS` | ✅ | Yes | 0.000 | Phase 16 Tier 1 |
| `DMS_AI_APPLY_TO_ERP_PARTY` | ✅ | Yes | 0.850 | Phase 16 Tier 2 |
| `DMS_AI_APPLY_TO_ERP_PARTY_LICENSES` | ✅ | Yes | 0.850 | Phase 16 Tier 2 |
| `DMS_AI_APPLY_TO_ERP_PARTY_TAX` | ✅ | Yes | 0.850 | Phase 16 Tier 2 |
| `DMS_DUPLICATE_DETECT` | ✅ | Yes | 0.800 | Common AI.3 |
| `DMS_DOCUMENT_QA` | ✅ | No | 0.000 | Phase 11 Q&A |
| `DMS_CROSS_DOC_SEARCH` | ✅ | No | 0.000 | Phase 11 |
| `DMS_AUTO_TAGS` | ✅ | Yes | 0.700 | Common AI |
| `DMS_SMART_LINKS` | ✅ | Yes | 0.750 | Phase 12.4 |
| `AI_SEARCH` | ✅ | No | 0.000 | Common AI.6 |
| `ERP_AI_ASSISTANT` | ✅ | No | 0.000 | Common AI.7 |
| `ERP_AI_ACTIONS` | ✅ | Yes | 0.850 | Common AI.7 |
| `ERP_AI_COMPLIANCE` | ✅ | No | 0.000 | Common AI.4 |
| `ERP_AI_DAILY_DASHBOARD` | ✅ | Yes | 0.850 | Common AI.13 |
| `ERP_AI_AUDIT_EXPLAINER` | ✅ | No | 0.000 | Common AI.14 |
| `ERP_AI_DATA_QUALITY_MONITOR` | ✅ | No | 0.850 | Common AI.15 |
| `ERP_AI_HR_*` (9 flags) | ✅ | Yes | varies | HR.12 |

**Note:** Many flags are `is_enabled=true` but their corresponding features may not be surfaced in production-ready UI or may require admin enabling separately. Feature flag being `true` does not guarantee the feature is actively used.

---

## 6. AI Database Tables Inventory

**Total AI-related tables: 17 directly AI-named** (plus AI columns in other tables like `dms_documents`)

| Table | Purpose | Key Columns | RLS | FORCE RLS | Live Rows | Status | Risk / Note |
|---|---|---|---|---|---|---|---|
| `erp_ai_feature_flags` | All AI feature gates | feature_code, is_enabled, requires_human_review | ✅ | ✅ | 66 | Active | Single source of truth for all flags |
| `erp_ai_provider_configs` | AI provider settings (no raw keys) | config_code, provider_type, model_id, secret_ref | ✅ | ✅ | 7 | Active | Secrets via env var ref only |
| `erp_ai_usage_logs` | Token/cost logging | module_code, provider_type, tokens_in/out, cost_usd, redacted_metadata | ✅ | ✅ | 69 | Active | Phase 15 tightened INSERT policy |
| `erp_ai_model_cost_rates` | Per-model cost rates | provider_type, model_id, cost_per_1k_in/out | ✅ | ✅ | unknown | Active | Used by observability |
| `dms_ai_extraction_results` | AI classification/extraction results | document_id, suggested_type, extracted_fields_json, classification_confidence | ✅ | ✅ | 83 | Active | Holds AI suggestions (not yet applied) |
| `dms_ai_extraction_jobs` | Legacy job tracking | — | ✅ | ✅ | unknown | Legacy/historical | May be superseded by job queue |
| `dms_ai_job_queue` | Async job queue | job_type, status, payload_json, attempts, claimed_at | ✅ | ✅ | 45 | Active | Worker: POST /api/internal/dms-ai-jobs/process |
| `dms_ai_job_attempts` | Job attempt history | job_id, status, error | ✅ | ✅ | unknown | Active | Retry log |
| `dms_review_queue` | Human review items | document_id, review_type, status, priority, assigned_to | ✅ | ✅ | 6 | Active | 6 open items |
| `dms_ai_validation_findings` | Validation rule results | document_id, rule_code, severity, resolved | ✅ | ✅ | 1 | Active | 9 deterministic rules |
| `dms_ai_entity_match_candidates` | Owner/party match suggestions | document_id, match_type, matched_party_id, confidence | ✅ | ✅ | 2 | Active | Human confirm required |
| `dms_ai_link_suggestions` | AI-suggested ERP links | document_id, entity_type, entity_id, confidence | ✅ | ✅ | unknown | Active | Phase 12.4 |
| `dms_ai_tag_suggestions` | AI-suggested document tags | document_id, tag, confidence | ✅ | ✅ | unknown | Active | Phase 12.4 |
| `dms_ai_erp_apply_runs` | Apply-to-ERP run sessions | run_code, target_module, status, source_type, document_id | ✅ | ✅ | 6 | Active | source_type includes 'correction_proposal' |
| `dms_ai_erp_apply_items` | Per-field apply results | apply_run_id, target_table, target_field, status, applied_value_summary | ✅ | ✅ | 6 | Active | Audit trail of ERP writes |
| `dms_ai_erp_apply_correction_proposals` | Phase 17 correction proposals | proposal_code, status, correction_mode, correction_value_json, original_apply_item_id | ✅ | ✅ | 2 | Active (flag OFF) | No DELETE policy; scalar-only value |
| `erp_ai_assistant_sessions` | AI assistant sessions | session_id, user_id, module_context | ✅ | ✅ | 1 | Active (minimal use) | — |
| `erp_ai_assistant_messages` | AI assistant messages | session_id, role, content (no sensitive data) | ✅ | ✅ | 4 | Active | — |
| `erp_ai_field_suggestions` | Common AI field suggestions | entity_type, entity_id, field_code, suggested_value | ✅ | ✅ | 0 | Active (not yet used) | Company+Party pilot |
| `erp_ai_duplicate_candidates` | Duplicate detection | entity_type, candidate_id, similarity | ✅ | ✅ | 1 | Active | Human review gate |
| `erp_ai_compliance_findings` | Compliance rule results | entity_type, rule_code, severity, status | ✅ | ✅ | 31 | Active | 31 findings generated |
| `erp_ai_data_quality_findings` | Data quality issues | entity_type, field, issue_type, severity | ✅ | ✅ | unknown | Active | Phase 15 |
| `erp_ai_risk_scores` | Entity risk scores | entity_type, entity_id, score, signals_json | ✅ | ✅ | 0 | Active (not yet scored) | — |
| `erp_ai_recent_searches` | AI search history | user_id, query, results_count | ✅ | ✅ | unknown | Active | — |
| `erp_ai_audit_explanations` | Cached audit AI explanations | audit_log_id, explanation | ✅ | ✅ | unknown | Active | — |
| `erp_ai_assistant_action_drafts` | Drafted actions from assistant | session_id, action_type, draft_payload | ✅ | ✅ | unknown | Active (read-only drafts) | No auto-execute |

---

## 7. AI Provider / Model / Prompt Configuration

### Provider Registry (`erp_ai_provider_configs`) — 7 configs

| Config Code | Provider | Model | Purpose | Enabled | Active | Last Test |
|---|---|---|---|---|---|---|
| `DEFAULT_CHAT` | openai | **gpt-4.1** | General chat | ✅ | ✅ | ✅ success |
| `DEFAULT_DMS_CLASSIFIER` | openai | **gpt-4.1** | Document classification | ✅ | ✅ | ✅ success |
| `DEFAULT_DMS_EXTRACTOR` | openai | **gpt-4.1** | Metadata extraction | ✅ | ✅ | ✅ success |
| `DEFAULT_EMBEDDING` | openai | **text-embedding-3-small** | Document + chunk embeddings | ✅ | ✅ | ✅ success |
| `DEFAULT_DMS_OCR` | tesseract | (none) | OCR (legacy) | ❌ | ✅ | — |
| `ARABIC_OCR_AZURE` | azure_document_intelligence | prebuilt-read | Arabic/complex OCR | ❌ | ✅ | — |
| `LOCAL_LLM_DEFAULT` | local_ollama | (none) | Local LLM | ❌ | ✅ | ❌ failed |

**Where provider config is stored:**  
`erp_ai_provider_configs` table — provider type, model ID, API endpoint (for Azure), API version. **API keys are NEVER stored** — only `secret_ref` (env var name) and `masked_secret_preview`.

**Provider factory:**  
`src/lib/ai/providers/factory.ts` — `getAiProvider(configCode)` and `getDefaultAiProvider(purpose)`.  
`src/lib/dms/ai/factory.ts` — DMS-specific: `getDmsAiProvider()`, `getDmsEmbeddingProvider()`, `getAzureDocumentIntelligenceProvider()`.

**Where prompts/templates are stored:**  
`src/lib/dms/ai/prompt-builders.ts` — in-code prompt construction (no external prompt DB). Prompts are built dynamically per document, metadata definitions, and context.

**Model selection:**  
By `purpose` field on the provider config. The factory loads by `purpose` (classification, extraction, embedding, chat) and returns the default active config for that purpose. No per-document model switching — everything goes through the same configured models.

**Secret safety:** ✅ Confirmed safe — `secret_ref` stores env var names only.

---

## 8. AI Usage Logs, Token Cost, and Observability

**Table:** `erp_ai_usage_logs` (69 rows)  
**File:** `src/lib/ai/observability/log-dms-ai-usage.ts`

**What is logged:**
- `module_code`, `action_code`, `provider_type`, `model_id`
- `tokens_in`, `tokens_out`, `total_tokens`
- `duration_ms`, `cost_usd` (estimated)
- `status` (success/error/skipped)
- `metadata_json` — **redacted** via `safe-usage-redaction.ts` (23 blocked keys: ocr_text, content_text, prompt, response, embedding, IBAN, TRN, salary, etc.)

**Redaction:**  
`src/lib/ai/observability/safe-usage-redaction.ts` — 44 Vitest unit tests confirm redaction behavior.  
Non-fatal: if logging fails, AI operation continues.

**Cost tracking:**  
`erp_ai_model_cost_rates` stores per-1k-token rates per model. Cost estimated at log time.

**Observability dashboard:**  
`/admin/dms/ai-observability` — 14 server actions (`src/server/actions/dms/ai-observability.ts`):
- Overview (total docs, OCR coverage, AI coverage, semantic coverage)
- Cost breakdown by model/action/time period
- Pipeline health metrics
- Per-model cost rates CRUD

**Audit logs:**  
Core ERP `audit_logs` table used for AI ERP write events. `logAudit()` called on apply-to-ERP runs and correction proposals. No raw AI content in audit logs.

**Known gaps:**
- Job handlers don't return token/cost data (deferred in Phase 15)
- No cost alerting/budget threshold system
- Playwright automated observability tests not running (env var missing)

---

## 9. AI Job Queue and Background Processing

**Tables:** `dms_ai_job_queue` (45 jobs), `dms_ai_job_attempts`  
**Worker:** `src/app/api/internal/dms-ai-jobs/process/route.ts` — Bearer `WORKER_SECRET` gated  
**Library:** `src/lib/dms/ai-jobs/`

**Job types:**
- `CLASSIFY_EXTRACT` — full AI classification + extraction (post-approve)
- `OCR_PROCESS` — OCR on document files
- `OCR_BACKFILL` — admin-triggered batch OCR backfill
- `SEMANTIC_DOCUMENT_INDEX` — chunk + embed + index a document
- Post-approve orchestration (chains the above)

**Job lifecycle:** `pending` → `processing` (claim RPC) → `completed` / `failed` → retry (exponential backoff)  
**Claim RPC:** SECURITY DEFINER — prevents double-claim  
**Flags gate:** `DMS_AI_JOB_QUEUE=true`, `DMS_AI_JOB_QUEUE_WORKER_ENABLED=true`

**Admin controls** (`/admin/dms/intelligence`):
- OCR Backfill — dry-run / queue-mode / inline-mode
- Semantic Index Backfill — `adminSemanticIndexBackfill()`
- Summary bulk generation — `bulkGenerateMissingSummaries()`
- Embedding bulk generation — `bulkGenerateMissingDmsEmbeddings()`
- Per-document validation + entity matching trigger

**Retry logic:** Configurable max_attempts per job type; failures create review queue items.

**Gap:** No cron scheduler — worker must be called externally (e.g., scheduled HTTP call). No built-in queue dashboard to view all jobs in UI.

---

## 10. DMS AI Capabilities Inventory

| Capability | Description | UI Location | Backend Files | DB Tables | Flags | Status | UAT |
|---|---|---|---|---|---|---|---|
| Document Upload | Multi-file upload with AI classification intent | `/dms/inbox` | `src/features/dms/intake/` | `dms_documents`, `dms_ai_extraction_results` | `DMS_BATCH_INTAKE` | ✅ Full | ✅ |
| AI Intake Review | Review AI suggestions, edit, approve | `/dms/intake/[code]` | `dms-ai-intake-*.tsx`, `ai-intake.ts` | `dms_ai_extraction_results` | `DMS_CLASSIFICATION` | ✅ Full | ✅ |
| OCR | Extract text from uploaded files | Automatic | `src/lib/dms/ocr/` | `dms_documents.content_text` | `DMS_OCR`, `DMS_OCR_ROUTER` | ✅ Full | ✅ |
| Classification | AI document type suggestion | AI Analysis tab | `classification-*.ts`, `ai-analysis.ts` | `dms_ai_extraction_results` | `DMS_CLASSIFICATION` | ✅ Full | ✅ |
| Metadata Extraction | Field value extraction from document | AI Analysis tab | `prompt-builders.ts`, `ai-analysis.ts` | `dms_ai_extraction_results`, `dms_document_metadata_values` | `DMS_EXTRACTION` | ✅ Full | ✅ |
| Apply AI to Metadata | Human-selected AI field values → metadata | AI Analysis tab | `applyAiAnalysisToMetadata()` | `dms_document_metadata_values` | `DMS_EXTRACTION` | ✅ Full | ✅ |
| AI Summary | Auto-generate document summary | Document record | `ai-summary.ts` | `dms_documents.ai_summary` | `DMS_AI_SUMMARY` | ✅ Full | ✅ |
| Completeness Score | % required metadata filled | Document record | `ai-completeness.ts` | `dms_documents.completeness_score` | `DMS_COMPLETENESS` | ✅ Full | ✅ |
| Risk Score | Document risk level scoring | Document record | `ai-risk.ts` | `dms_documents.ai_risk_level` | `DMS_RISK_SCORE` | ✅ Full | ✅ |
| ERP Mapping Preview | Read-only preview of what AI could write-back | AI Analysis tab | `erp-mappings.ts`, `dms-erp-mapping-preview-panel.tsx` | `dms_ai_erp_mapping_targets` | — | ✅ Preview only | ✅ |
| Semantic Chunking | Paragraph-aware document chunking | Semantic tab | `chunk-builder.ts` | `dms_document_content_chunks` | `DMS_SEMANTIC_CHUNKING` | ✅ Full | ✅ |
| Embeddings | Chunk + doc-level vector embeddings | Automatic | `chunk-embedder.ts`, `semantic-indexer.ts` | `dms_document_content_chunks.embedding` | `DMS_SEMANTIC_EMBEDDINGS` | ✅ Full | ✅ |
| Ask AI (per-doc Q&A) | Q&A grounded in document chunks | Ask AI tab | `document-qa.ts`, `dms-document-ask-ai-section.tsx` | `dms_document_content_chunks` | `DMS_DOCUMENT_QA` | ✅ Full | ✅ |
| Semantic Search | Vector similarity search across docs | Search page + semantic tab | `semantic-search.ts` | `dms_document_content_chunks` (pgvector) | `DMS_SEMANTIC_SEARCH` | ✅ Full | ✅ |
| Review Queue | Human review for AI failures/conflicts | `/dms/review-queue` | `review-queue.ts`, `dms-review-queue-*.tsx` | `dms_review_queue` | `DMS_AI_REVIEW` | ✅ Full | ✅ |
| Validation | Deterministic AI document rules | Review queue / document | `validation-engine.ts` | `dms_ai_validation_findings` | `DMS_AI_VALIDATION` | ✅ Full | ✅ |
| Entity Matching | AI party/owner match suggestions | Review queue / document | `entity-matcher.ts` | `dms_ai_entity_match_candidates` | `DMS_AI_ENTITY_MATCHING` | ✅ Full | ✅ |
| Auto-Tags | AI tag suggestions | Document tags | `ai-tags.ts` | `dms_ai_tag_suggestions` | `DMS_AUTO_TAGS` | ✅ Full | ✅ |
| Smart Links | AI ERP link suggestions | Document links | `ai-links.ts` | `dms_ai_link_suggestions` | `DMS_SMART_LINKS` | ✅ Full | ✅ |
| AI Observability | Token/cost/pipeline dashboard | `/admin/dms/ai-observability` | `ai-observability.ts` | `erp_ai_usage_logs`, `erp_ai_model_cost_rates` | `DMS_AI_OBSERVABILITY` | ✅ Full | ✅ |
| Apply-to-ERP (Tier 1) | Write AI-extracted values to DMS fields + metadata | Document AI tab → Review Queue | `apply-to-erp.ts` | `dms_ai_erp_apply_runs/items` | `DMS_AI_APPLY_TO_ERP` | ✅ Full | ✅ |
| Apply-to-ERP (Tier 2) | Write values to party_licenses + party_tax_registrations | Document AI tab → Review Queue | `apply-to-erp.ts` | `dms_ai_erp_apply_runs/items` | `DMS_AI_APPLY_TO_ERP_PARTY*` | ✅ Full | ✅ |
| Apply Correction (Phase 17) | Propose + confirm corrections to previously applied items | Document AI tab (apply history) | `apply-correction.ts` | `dms_ai_erp_apply_correction_proposals` | `DMS_AI_APPLY_CORRECTION_*` | ✅ Built, **flag OFF** | ✅ Browser UAT |

---

## 11. OCR and Document Text Extraction

**Active path:** GPT-4.1 vision (`DEFAULT_DMS_OCR` disabled, router uses GPT vision as primary)  
**OCR Router** (`src/lib/dms/ocr/ocr-router.ts`): Routes to Azure → GPT vision fallback based on `DMS_OCR_AZURE` flag.  
**Azure DI:** `ARABIC_OCR_AZURE` config exists, `DMS_OCR_AZURE=false` — adapter built but not active.  
**Tesseract:** Config exists (`DEFAULT_DMS_OCR`) but `is_enabled=false`.  
**GPT Vision fallback:** `DMS_OCR_GPT_VISION_FALLBACK=true` — currently the primary path.

**Stored output:** `dms_documents.content_text` (raw), `dms_document_content_chunks` (processed)

**OCR history:** `dms_ai_extraction_jobs` (legacy) + job queue (`dms_ai_job_queue` job_type=`OCR_PROCESS`)

**Admin backfill:** `/admin/dms/intelligence` → OCR Backfill (dry-run, queue-mode, inline-mode). Bulk tool to process all documents missing OCR.

**Known limits:**
- Arabic/complex PDF quality: Azure DI would improve this but flag is OFF
- No per-page OCR status UI
- Tesseract disabled (was Phase 10A original — replaced by router)

---

## 12. Document Understanding / Classification / Metadata Extraction

**Classification:** GPT-4.1 analyzes document content → suggests `document_type_id` + confidence label + score.  
**Extraction:** Per document type, loads `dms_metadata_definitions` (field codes, types, prompts) → GPT-4.1 extracts values as structured JSON.  
**Confidence:** Per-field `field_confidence_json` with score (0–1) + label (high/medium/low) + source snippet.  
**Human review:** All classification and extraction results held in `dms_ai_extraction_results` — never auto-applied to documents. Human must approve via intake review or AI Analysis tab.

**Metadata definitions:**  
`dms_metadata_definitions` table: `field_code`, `field_type`, `label_en`, `is_ai_extractable`, `ai_extraction_hint`, `validation_regex`, per `document_type_id`.

**Apply path:**
1. Intake review → approve → saves metadata immediately (Phase 4 saga)
2. AI Analysis tab → diff view → human selects fields → confirms → `applyAiAnalysisToMetadata()` (Phase 6)
3. Apply-to-ERP → writes to ERP tables (Phase 16)

**Metadata field types:** text, number, date, datetime, boolean, select (per definition).

---

## 13. Semantic Chunking, Embeddings, and Search

**Implementation:** Phase 11 — fully implemented and UAT closed.

**Pipeline:**
1. `chunk-builder.ts` — paragraph-aware chunking with overlap and min/max size
2. `chunk-embedder.ts` — `text-embedding-3-small` via `DEFAULT_EMBEDDING` config
3. `semantic-indexer.ts` — stores chunks + embeddings to `dms_document_content_chunks`
4. RPC `match_document_chunks(query_embedding, threshold, limit)` — pgvector cosine similarity

**Storage:** `dms_document_content_chunks` with `embedding vector(1536)` + HNSW index  
**DB extension:** `pgvector` enabled  

**Search capabilities:**
- Per-document chunk search (grounded Q&A) — `DMS_DOCUMENT_QA`
- Cross-document semantic search — `DMS_SEMANTIC_SEARCH`, `DMS_CROSS_DOC_SEARCH`
- Document-level similarity — `findSimilarDmsDocuments()`
- Chunk-level similarity — `DMS_SEMANTIC_SEARCH_CHUNKS`

**UI:** Semantic tab on document record, Ask AI tab (chunk-grounded Q&A chat), cross-doc search page

**Production readiness:** ✅ Backend fully implemented. Admin backfill available. All flags ON.  
**Gap:** No UI to see chunk count/status per document. Admin backfill covers documents with missing chunks.

---

## 14. Review Queue, Validation, Conflict Detection, and Owner Matching

**Review Queue** (`dms_review_queue`, 6 open items):  
- 6 review types: `low_confidence`, `ocr_failure`, `validation_issue`, `entity_match_needed`, `extraction_failure`, `duplicate_suspected`  
- Lifecycle: `pending` → `assigned` → `resolved` / `dismissed` / `escalated`  
- UI: `/dms/review-queue` — filterable list, bulk assign, drawer with item details  
- Hooks: created automatically by OCR failures, low-confidence classifications, validation findings

**Validation** (`dms_ai_validation_findings`, 1 finding):  
- 9 deterministic rules: expiry_check, document_number_format, required_field_missing, metadata_mismatch, duplicate_number, etc.  
- Each rule produces finding with `severity` (critical/warning/info) and `suggestion`  
- Findings drive review queue creation  

**Entity Matching** (`dms_ai_entity_match_candidates`, 2 candidates):  
- Matches document → party/owner via name, registration number, email  
- Confidence score + match signals stored  
- Human confirms match → `entity_id` applied to document  

**Conflict Detection** (in Apply-to-ERP / Apply Correction):  
- Apply-to-ERP: `apply-conflict-detector.ts` — loads live target value, compares to expected; blocks on mismatch  
- Apply Correction: `correction-conflict-detector.ts` — same pattern for correction proposals  
- Both use "snapshot + live reload" approach to prevent stale writes  

---

## 15. Apply-to-ERP Current Capabilities

**Phase 16 Tier 1 (DMS Document Fields + Metadata):**

Allowlisted write targets:
| Table | Fields |
|---|---|
| `dms_documents` | `owning_company_id`, `owning_branch_id`, `party_id`, `issue_date`, `expiry_date`, `title`, `description` |
| `dms_document_metadata_values` | `value_text`, `value_number`, `value_date`, `value_boolean` |

**Phase 16 Tier 2 (Party Children):**

| Table | Fields |
|---|---|
| `party_licenses` | `license_number`, `license_name`, `license_activity_text`, `issue_date`, `expiry_date`, `remarks` |
| `party_tax_registrations` | `tax_registration_number`, `effective_from`, `effective_to`, `remarks` |

**Flags (all currently ON):**
- `DMS_AI_APPLY_TO_ERP` (master gate)
- `DMS_AI_APPLY_TO_ERP_DMS_METADATA`
- `DMS_AI_APPLY_TO_ERP_ENTITY_LINKS`
- `DMS_AI_APPLY_TO_ERP_PARTY` (min_conf=0.850)
- `DMS_AI_APPLY_TO_ERP_PARTY_LICENSES` (min_conf=0.850)
- `DMS_AI_APPLY_TO_ERP_PARTY_TAX` (min_conf=0.850)

**Human confirmation gate:** Mandatory — user must explicitly confirm each apply run.  
**Conflict detection:** Live value loaded before write; blocks if mismatch vs snapshot.  
**Audit:** `logAudit()` on every apply run + item.  
**DB evidence:** 6 apply_runs, 6 apply_items (UAT data).

**Forbidden targets (hard-coded):** `party_bank_details`, IBAN, bank accounts, salary, payroll, HR sensitive fields, OCR tables, AI log tables.

**Phase 16 Tier 3 (NOT STARTED):** Party contacts + addresses write-back — planned, needs planning prompt.

---

## 16. Apply Correction Proposal Current Capabilities

**Phase 17 — Built, UAT Closed, Feature Flags OFF**

**What it does:**  
Allows a human to propose a correction to a previously AI-applied ERP field value. The correction requires human review, human confirmation (dual checkbox), conflict detection, and full audit. It is NOT an undo, rollback, or automatic revert.

**Table:** `dms_ai_erp_apply_correction_proposals` (2 rows — 1 applied UAT, 1 draft)

**Allowed correction modes:**
- `manual` — enter a new value manually
- `use_applied_value` — use the AI-applied value (for when the original correction was wrong)
- `restore_previous` — use the value before AI applied (requires separate flag, flag is OFF)

**Lifecycle:** `draft` → `pending_confirmation` → `applied` / `conflict` / `cancelled` / `failed`

**Governance:**
- Must reference an existing `applied` apply item
- Only targets in APPLY_TARGET_REGISTRY
- `correction_value_json` is scalar-only `{"v": scalar}` — no raw content
- No raw OCR/prompt/AI response stored
- Human confirmation required (dual checkbox mandatory)
- All events audited via `logAudit()`
- No DELETE policy on correction table
- RLS + FORCE RLS

**Current state:**
- `DMS_AI_APPLY_CORRECTION_PROPOSALS=false` — off by default
- `DMS_AI_APPLY_CORRECTION_RESTORE_PREVIOUS=false` — off by default
- Enable via admin AI settings UI or DB update

**Note:** 1 draft proposal (id=2) exists from UAT with status=draft (never confirmed). Harmless.

---

## 17. AI Search Across ERP / Ask ERP / Assistant Capabilities

**AI Search Across ERP:**  
- Flag: `AI_SEARCH=true`, `ERP_AI_ERP_SEARCH=true`
- Files: `src/lib/ai/common/search/`, `src/server/actions/ai/common/search.ts`
- Capabilities: Intent extraction → entity collectors (Party, Document, Employee, etc.) → DMS bridge → result merger → recent searches (`erp_ai_recent_searches`)
- UI: Search page (likely `/admin/search` or global search entry)
- Status: ✅ Backend implemented. UI integration: partially confirmed.

**ERP AI Assistant:**  
- Flag: `ERP_AI_ASSISTANT=true`, `ERP_AI_ACTIONS=true`
- Files: `src/lib/ai/common/assistant/`, `src/server/actions/ai/common/assistant.ts`
- Capabilities: Start sessions, send messages, action registry (read/navigate/draft only — **no ERP mutations**)
- DB: `erp_ai_assistant_sessions` (1 session), `erp_ai_assistant_messages` (4 messages), `erp_ai_assistant_action_drafts`
- Human-review gate on all action drafts — ERP_AI_ACTIONS requires `requires_human_review=true`
- Status: ✅ Backend implemented. 1 live session confirmed. UI: assistant chat component exists.

**Per-Document Ask AI:**  
- Flag: `DMS_DOCUMENT_QA=true`
- File: `src/features/dms/documents/sections/dms-document-ask-ai-section.tsx`
- Capability: Chat-style Q&A grounded in document chunks (top-5 similarity match → GPT-4.1 answer)
- Confidentiality gate: HR/legal/executive docs require `dms.admin` permission
- Status: ✅ Fully implemented and tested.

---

## 18. AI Compliance, Risk Scoring, Duplicate Detection, and Data Quality

### Compliance Checker (COMMON AI.4)
- Flag: `ERP_AI_COMPLIANCE=true`
- DB: `erp_ai_compliance_findings` (31 findings), `erp_ai_compliance_finding_events`
- File: `src/lib/ai/common/compliance-checker/`, `src/server/actions/ai/common/compliance-checker.ts`
- Capabilities: Rule engine, document compliance checks, cross-AI rule checks, waive/false-positive
- Status: ✅ Backend implemented. 31 compliance findings generated. UI: `/admin/ai/compliance`

### Risk Scoring (COMMON AI.5)
- Flag: `ERP_AI_RISK_SCORE=true`
- DB: `erp_ai_risk_scores` (**0 live scores**), `erp_ai_risk_score_events`
- File: `src/lib/ai/common/risk-scoring/`, `src/server/actions/ai/common/risk-scoring.ts`
- Capabilities: Signal collectors per entity type, scoring engine, stale detector
- Status: ⚠️ Backend implemented but 0 risk scores generated — may require admin trigger or not yet run against entities

### Duplicate Detection (COMMON AI.3)
- Flag: `ERP_AI_DUPLICATE_DETECT=true`, `DMS_AI_DUPLICATE_DOCUMENTS=true`
- DB: `erp_ai_duplicate_candidates` (1 candidate), `erp_ai_duplicate_candidate_events`
- File: `src/lib/ai/common/duplicate-detection/`, `src/server/actions/ai/common/duplicate-detection.ts`
- Capabilities: Deterministic + AI rules, scan engine, human review/dismiss/merge-suggestion
- Status: ✅ Backend implemented. 1 live candidate. UI: `/admin/ai/duplicates`

### Data Quality Monitor (COMMON AI.15)
- Flag: `ERP_AI_DATA_QUALITY_MONITOR=true`
- DB: `erp_ai_data_quality_findings`, `erp_ai_data_quality_finding_events`
- File: `src/lib/ai/common/data-quality/`, `src/server/actions/ai/common/data-quality.ts`
- Capabilities: Rule registry (DMS rules + entity rules), scan engine, review/dismiss
- Status: ✅ Backend implemented. UI: `/admin/ai/data-quality`

### Field Suggestions (COMMON AI.1)
- Flags: `ERP_AI_FORM_FILL=true`
- DB: `erp_ai_field_suggestions` (**0 rows**), `erp_ai_field_suggestion_events`
- Status: ⚠️ Backend implemented (15 Stage-1 handlers for Company + Party). Zero suggestions generated — pilot entities not yet run through suggestion engine.

---

## 19. AI UI Entry Points and User Workflows

| Page / Component | Button / Tab / Action | What it does | Feature Flag | Status | Risk |
|---|---|---|---|---|---|
| `/dms/inbox` | Upload + AI classify | Multi-file upload → AI job → intake review | `DMS_BATCH_INTAKE`, `DMS_CLASSIFICATION` | ✅ Full | — |
| `/dms/intake/[code]` | Review + Approve | Human reviews AI results, edits metadata, approves | `DMS_CLASSIFICATION`, `DMS_EXTRACTION` | ✅ Full | Metadata seeding bug fixed (Phase 17 UAT) |
| `/dms/review-queue` | Review items | Human resolves AI failures, low confidence, conflicts | `DMS_AI_REVIEW` | ✅ Full | — |
| Document record → "AI Analysis" tab | Run AI / Review | Shows AI results, apply to metadata, ERP apply history | `DMS_EXTRACTION`, `DMS_AI_APPLY_TO_ERP` | ✅ Full | — |
| Document record → "AI Analysis" tab | "Propose Correction" button | Opens correction drawer | `DMS_AI_APPLY_CORRECTION_PROPOSALS` | ✅ Built, **flag OFF** | Low |
| Document record → "Ask AI" tab | Ask a question | Q&A grounded in document chunks | `DMS_DOCUMENT_QA` | ✅ Full | — |
| Document record → "Semantic" tab | Chunk status | Shows chunking/embedding status + admin rebuild | `DMS_SEMANTIC_CHUNKING` | ✅ Full | — |
| Document record → "Understanding" tab | Understanding view | AI summary, links, entity match, risk | Multiple | ✅ Full | — |
| Document record → "Intelligence" tab | Completeness + risk | Per-doc AI scores | `DMS_COMPLETENESS`, `DMS_RISK_SCORE` | ✅ Full | — |
| `/admin/dms/intelligence` | Admin bulk tools | OCR backfill, embedding backfill, semantic index, evaluation | Multiple | ✅ Full | — |
| `/admin/dms/ai-observability` | Observability dashboard | Token/cost/pipeline metrics | `DMS_AI_OBSERVABILITY` | ✅ Full | — |
| `/admin/settings/ai` | Provider config | Configure AI providers, test connection | `settings.ai.manage` | ✅ Full | — |
| `/admin/ai/dashboard` | AI daily brief | Daily AI summary across ERP | `ERP_AI_DAILY_DASHBOARD` | ✅ Backend | UI extent unclear |
| `/admin/ai/duplicates` | Duplicates | Review AI duplicate candidates | `ERP_AI_DUPLICATE_DETECT` | ✅ Backend | 1 live candidate |
| `/admin/ai/compliance` | Compliance findings | Review AI compliance findings | `ERP_AI_COMPLIANCE` | ✅ Backend | 31 findings |
| `/admin/ai/risk` | Risk scores | View entity risk scores | `ERP_AI_RISK_SCORE` | ⚠️ Backend only | 0 scores generated |
| `/admin/ai/data-quality` | Data quality | Data quality findings | `ERP_AI_DATA_QUALITY_MONITOR` | ✅ Backend | — |
| `/admin/ai/audit-explainer` | Audit explainer | AI explanations for audit entries | `ERP_AI_AUDIT_EXPLAINER` | ✅ Backend | — |
| Global search / `/admin/search` | AI search | Natural language ERP search | `AI_SEARCH`, `ERP_AI_ERP_SEARCH` | ✅ Backend | UI integration extent unclear |
| AI assistant chat | Chat + action drafts | Read/navigate/draft only | `ERP_AI_ASSISTANT` | ✅ Backend | 1 live session |
| Party record | Field suggestions panel | AI field suggestions for Company/Party | `ERP_AI_FORM_FILL` | ⚠️ Backend, 0 suggestions | — |

---

## 20. AI Security, RLS, Permissions, and Human-Review Governance

### RLS
All 11 primary AI tables verified: **RLS ENABLED + FORCE RLS ON** (no bypass possible):
`erp_ai_feature_flags`, `erp_ai_usage_logs`, `erp_ai_provider_configs`, `dms_ai_job_queue`, `dms_ai_extraction_results`, `dms_review_queue`, `dms_ai_validation_findings`, `dms_ai_entity_match_candidates`, `dms_ai_erp_apply_runs`, `dms_ai_erp_apply_items`, `dms_ai_erp_apply_correction_proposals`

Special: `dms_ai_erp_apply_correction_proposals` has **no DELETE policy** — correction history is immutable.

### Permissions (selected)
- `dms.documents.ai.run` — trigger AI analysis
- `dms.documents.ai.view` — view AI results
- `dms.review_queue.view/manage` — review queue
- `dms.apply_to_erp.view/preview/run/admin` — apply-to-ERP
- `dms.apply_correction.view/create/run/admin` — Phase 17 corrections
- `dms.ai_observability.view/manage` — observability dashboard
- `settings.ai.view/manage` — provider config
- `ai.field_suggestions.*`, `ai.duplicate_detection.*`, etc. — common AI

### Human-Review Governance
**Non-negotiable rules across all AI features:**
1. No AI suggestion is auto-applied to any ERP table — all require human confirmation
2. Classification/extraction → held in `dms_ai_extraction_results` until human approves
3. Apply-to-ERP → requires explicit human confirmation + session
4. Apply Correction → requires dual checkbox confirmation + conflict check
5. ERP AI Assistant actions → drafts only, no direct ERP mutation
6. Feature flags default `is_enabled=false` and `requires_human_review=true`

### Payload Safety
- 23 blocked keys in usage log redaction
- Correction proposals: scalar-only `{"v": scalar}` — no arrays/objects
- No OCR text, no raw AI prompts, no embedding vectors in audit logs
- TRN/IBAN masked in summaries

### Confidentiality
- Documents with confidentiality `hr`, `legal`, `executive` require `dms.admin` for AI analysis, Q&A, summary, semantic access

---

## 21. Current AI Testing and UAT Coverage

| Area | Unit Tests | SQL QA | Browser UAT | Runtime UAT | Status | Missing Tests |
|---|---|---|---|---|---|---|
| Usage log redaction | ✅ 44 tests | — | — | — | ✅ Full | — |
| Usage logger | ✅ 8 tests | — | — | — | ✅ Full | — |
| Apply-to-ERP allowlist/forbidden | ✅ yes | ✅ yes | — | ✅ UAT | ✅ Full | E2E browser |
| Apply-to-ERP conflict detector | ✅ yes | ✅ yes | — | ✅ UAT | ✅ Full | — |
| Apply-to-ERP value normalizer | ✅ yes | — | — | ✅ UAT | ✅ Full | — |
| Apply Correction source loader | ✅ 8 tests | — | — | ✅ UAT | ✅ Full | — |
| Apply Correction value builder | ✅ yes | — | — | ✅ UAT | ✅ Full | — |
| Apply Correction conflict detector | ✅ yes | — | — | Code-path | ✅ Good | Live conflict browser test |
| Phase 17 end-to-end browser flow | — | — | ✅ Full browser | ✅ DB verified | ✅ Full | Playwright E2E |
| Phase 16 browser/runtime | — | ✅ SQL QA | ✅ Browser | ✅ Runtime | ✅ Full | Playwright E2E |
| Phase 15 (hardening) | ✅ 52 tests | ✅ 13 tables | — | Worker auth 6/6 | ✅ Full | Playwright running |
| Semantic search | — | — | — | — | ⚠️ No unit tests | Unit + browser tests |
| Review queue | — | ✅ SQL | — | ✅ Runtime | ✅ Partial | Unit tests for queue logic |
| OCR router | — | — | — | — | ⚠️ No unit tests | Unit tests for routing logic |
| Common AI field suggestions | — | — | — | — | ⚠️ No tests | Unit + integration |
| Common AI compliance/risk/duplicates | — | — | — | — | ⚠️ No tests | Unit + browser |
| AI assistant | — | — | — | — | ⚠️ No tests | — |
| Playwright E2E | ✅ Spec exists | — | — | — | ⚠️ Blocked (env var) | `E2E_USER_PASSWORD` needed |
| **Total Vitest** | **269 tests (8 files)** | | | | | |

---

## 22. What Is Fully Implemented

Backed by code, reports, and UAT evidence:

1. **Document upload + AI intake pipeline** — multi-file, AI classify/extract, human review, approve saga
2. **OCR** — GPT-4.1 vision (primary), router, backfill queue, admin tools
3. **Classification + metadata extraction** — per document type, confidence, human-confirm
4. **Apply AI to metadata** (Phase 6) — diff UI, human select, confirm write
5. **Post-approve orchestration + async job queue** (Phase 9) — 4 job types, worker, retry
6. **AI summary, completeness score, risk score** — per document
7. **ERP mapping preview** (Phase 8) — read-only allowlist preview
8. **Semantic chunking + embeddings + pgvector search** (Phase 11) — full pipeline
9. **Per-document Ask AI Q&A** — chunk-grounded, confidentiality gate
10. **Review queue** (Phase 12) — 6 review types, assign/resolve/dismiss, dashboard
11. **Validation + entity matching** (Phase 13) — 9 rules, confidence-gated candidates
12. **Token/cost observability dashboard** (Phase 14) — per-model cost rates, pipeline health
13. **Apply-to-ERP Tier 1** (Phase 16) — DMS document fields + metadata write-back, human confirmation
14. **Apply-to-ERP Tier 2** (Phase 16) — party licenses + tax registrations write-back
15. **Apply Correction Proposal** (Phase 17) — full lifecycle built and browser UAT closed (flag OFF)
16. **AI settings UI** (SETTINGS.1) — provider config, test connection
17. **Common AI: compliance, duplicates, data quality, daily dashboard, audit explainer**
18. **Common AI field suggestions** — backend and 15 handlers for Company/Party

---

## 23. What Is Partially Implemented

| Feature | What Exists | What's Missing |
|---|---|---|
| **Azure Document Intelligence OCR** | Adapter built, config in DB, router wires to it | `DMS_OCR_AZURE` flag OFF; no Arabic-specific test coverage; API key must be configured |
| **Apply Correction — Restore Previous mode** | Backend logic built, UI tab visible | `DMS_AI_APPLY_CORRECTION_RESTORE_PREVIOUS` flag OFF; no full browser test of restore path |
| **Phase 16 Tier 3 (contacts/addresses)** | Not started | Full planning prompt needed |
| **Risk scoring (live)** | Backend + DB table complete | 0 risk scores generated — needs admin trigger or scheduled scan |
| **Field suggestions (live)** | 15 handlers for Company + Party | 0 suggestions generated — needs admin scan trigger |
| **Branch/Site field suggestions** | Registry stubs only | Stage 2 handlers not written |
| **HR Apply-to-ERP writes** | Phase 8 ERP mapping preview shows HR targets | No write path; no apply server action for HR; needs Phase 18 planning |
| **Playwright E2E** | Spec + smoke scripts exist | Missing `E2E_USER_PASSWORD` env var; runner not wired to CI |
| **Common AI search UI** | Backend `searchAcrossErp` + `extractErpSearchIntentAction` | UI integration not fully confirmed; need to trace entry point |
| **Job handler token/cost reporting** | Usage logger exists | Job handlers don't pass token data back — cost tracking gap for background jobs |

---

## 24. What Is Planned Only / Not Started

| Item | Status | Notes |
|---|---|---|
| **Phase 16 Tier 3A — Party Contacts write-back** | Planned | Needs planning prompt |
| **Phase 16 Tier 3B — Party Addresses write-back** | Planned | Needs planning prompt |
| **HR Apply-to-ERP writes (Phase 18 candidate)** | Not approved | Wait until Tier 3 stable |
| **Fleet/Workshop/Finance/Projects AI integration** | Not started | Not in current roadmap |
| **Automatic correction rollback/undo** | Explicitly NOT planned | Governance: human-only corrections |
| **Bulk correction proposals** | Explicitly NOT planned | Out of scope |
| **One-click revert** | Explicitly NOT planned | Governance: not allowed |
| **Phase 18 (undefined)** | Not started | Not approved; needs direction |

---

## 25. Overlaps, Duplications, or Confusing Areas

| Issue | Detail | Recommendation |
|---|---|---|
| **Two source-of-truth docs** | `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` (current) vs `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md` (stale at Phase 15) | Archive or update the stale one; only `.cursor/` is authoritative |
| **SOT guardrail still warns against Phase 17** | Lines 334–349 say "do not implement Phase 17" — now superseded | Update or remove stale guardrail text |
| **Two AI feature sets** | "DMS AI" (Phases 1–17) and "Common AI" (COMMON AI.0–1G+) — different module prefixes, different permission prefixes | Document clearly for developers; naming is intentional but confusing |
| **`DMS_AI_DUPLICATE_DOCUMENTS` vs `ERP_AI_DUPLICATE_DETECT`** | Two duplicate detection flags; DMS-specific + cross-ERP | Both serve different scopes; clarify in admin UI labeling |
| **`dms_ai_extraction_jobs` vs `dms_ai_job_queue`** | Legacy extraction job table (Phase 1) alongside new async queue (Phase 9) | `extraction_jobs` may be historical/superseded; verify if still written to |
| **Common AI feature flags enabled but 0 data** | `ERP_AI_FORM_FILL=true` but `erp_ai_field_suggestions` has 0 rows; `ERP_AI_RISK_SCORE=true` but `erp_ai_risk_scores` has 0 rows | These features need admin to trigger the first scan |
| **2 draft correction proposal** | UAT leftover in `dms_ai_erp_apply_correction_proposals` (id=2, status=draft) | Cancel or document as UAT artifact; harmless but untidy |
| **`src/features/common-ai/` does not exist** | Common AI UI lives in `src/features/ai/common/` | Update any docs that say "common-ai" directory |
| **Local LLM config with `last_test_status=failed`** | `LOCAL_LLM_DEFAULT` config exists and failed test | Remove or clearly mark as experimental stub |
| **Tesseract config disabled** | `DEFAULT_DMS_OCR` is Tesseract, `is_enabled=false` | Consider removing or renaming if Tesseract path is fully replaced by GPT vision |
| **`erp_email_*` tables in AI query** | Email tables appear in AI table listing query (`%ai%` pattern catches consultant_bank_details, employee_attendance_daily_summary, etc.) | Query artifact; email tables are not AI tables |

---

## 26. Gaps and Risks

### Critical
*(None currently — system is functional with human gates everywhere)*

### High
| Gap | Detail |
|---|---|
| **No production build verification** | `npm run build` not run in Phase 17 UAT; TypeScript + tests pass but no production bundle check |
| **Playwright E2E not running** | Spec exists but `E2E_USER_PASSWORD` not configured; no automated regression |
| **Azure OCR not active for Arabic** | Arabic documents processed by GPT vision (slower, potentially lower quality for dense Arabic text) |
| **Risk scoring and field suggestions not triggered** | Backend exists, flags on, 0 data — features exist but nothing running them |

### Medium
| Gap | Detail |
|---|---|
| **Job handler token tracking gap** | Background job costs not tracked in usage logs |
| **Stale `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md`** | Stops at Phase 15 — could mislead future developers |
| **SOT guardrail text outdated** | Still warns against Phase 17 |
| **UAT test data in production** | `party_licenses.id=2 remarks = "UAT Test Correction - Phase 17"` from browser UAT |
| **Draft correction proposal** | `dms_ai_erp_apply_correction_proposals.id=2` status=draft from failed first UAT attempt |
| **No centralized AI nav/hub** | AI features spread across `/admin/dms/intelligence`, `/admin/dms/ai-observability`, `/admin/ai/*`, document tabs — no single AI center |

### Low
| Gap | Detail |
|---|---|
| **Common AI UI coverage unclear** | Server actions confirmed; UI route existence partially verified |
| **No per-job-type cost tracking** | Background jobs don't emit token usage |
| **Branch/Site field suggestions incomplete** | Registry stubs only for Stage 2 entities |

---

## 27. Recommended Cleanup / Stabilization Before New AI Work

These are **recommendations only** — not implemented in this report:

1. **Run `npm run build` once** — confirm production bundle compiles cleanly
2. **Set `E2E_USER_PASSWORD`** — enable Playwright tests to actually run
3. **Cancel draft correction proposal (id=2)** — use `cancelApplyCorrectionProposal` server action or DB update (admin only)
4. **Restore `party_licenses.id=2 remarks`** — UAT test value left in production; correct via standard Party admin UI
5. **Update `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md`** — append Phase 16 + 17 summaries OR archive it; `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` is the live doc
6. **Remove/update SOT guardrail text** — lines 334–349 still warn against Phase 17 (now closed)
7. **Trigger first risk score + field suggestion scan** — admin run to generate initial data for these features
8. **Verify Common AI UI routes** — confirm admin routes for `/admin/ai/dashboard`, `/admin/ai/risk`, `/admin/ai/data-quality` are accessible and functional
9. **Enable Azure OCR (`DMS_OCR_AZURE=true`) for Arabic docs** — configure API key env var; adapter is built and ready
10. **Clean `LOCAL_LLM_DEFAULT` config** — mark as experimental or remove `last_test_status=failed` entry
11. **AI navigation hub** — create a single `/admin/ai` landing page linking all AI features for discoverability
12. **Enable `DMS_AI_APPLY_CORRECTION_PROPOSALS=true`** — when ready for production use of Phase 17

---

## 28. Recommended Next Direction Options

### Option A — AI Stabilization / Cleanup Phase
**Business value:** Ensures existing AI investment is solid, operational, and discoverable before adding more complexity  
**Technical risk:** Very low — no new code, just config, cleanup, and verification  
**Prerequisites:** None  
**Complexity:** Low (1–2 days)  
**Why now:** Many features built but not yet operational (risk scoring 0 data, field suggestions 0 data, Azure OCR disabled). Activating existing features before building new ones is prudent.

### Option B — Phase 16 Tier 3: Party Contacts / Addresses Write-back
**Business value:** Completes the party write-back story; allows AI to update contact and address records — high business utility  
**Technical risk:** Medium — contacts/addresses have relationship complexity (selecting which row to update); no auto-create allowed  
**Prerequisites:** Phase 16 Tier 1+2 stable (✅); planning prompt needed  
**Complexity:** Medium (3–5 days)  
**Why now:** Natural next step after Tier 1+2; pattern is established; incremental  
**Why not yet:** Party contacts can have multiple rows — target selection UI needs design

### Option C — Enable and Harden Correction Proposals for Production
**Business value:** Allows users to correct AI-applied values they later disagree with — closes the write-back feedback loop  
**Technical risk:** Low — Phase 17 is fully built and UAT closed; just a flag enable + minor cleanup  
**Prerequisites:** Phase 17 browser UAT closed (✅); draft proposal cleanup  
**Complexity:** Very low — flip flag + cleanup  
**Why now:** The feature is built and tested; enabling it completes Phase 16 write-back safety

### Option D — Semantic Search Hardening / Public Rollout
**Business value:** Users can search documents by content meaning, not just keywords  
**Technical risk:** Low — fully built; pgvector HNSW index in place; needs performance validation  
**Prerequisites:** All documents indexed (admin backfill); Phase 11 closed (✅)  
**Complexity:** Low — mostly config/enablement + UX polish  
**Why now:** All infrastructure exists; large user-facing value with minimal build effort

### Option E — HR AI Planning (Apply-to-ERP for HR records)
**Business value:** AI can write-back employee identity, medical, compliance data from uploaded documents  
**Technical risk:** High — HR data is sensitive; complex field mapping; many edge cases; payroll boundary must be absolute  
**Prerequisites:** Phase 16 Tier 3 stable; Phase 17 correction stable; dedicated security review  
**Complexity:** High (7–14 days)  
**Why later:** More complex and sensitive than party write-back; should follow Tier 3 stabilization

---

## 29. Recommended Roadmap Based on Actual Current State

Based on what actually exists in the codebase and what gaps exist:

**Step 1 — Immediate Stabilization (1–2 days)**
- Run production build
- Cancel UAT draft proposal
- Restore UAT test value in party_licenses
- Enable Azure OCR for Arabic
- Trigger first risk score + field suggestion scan
- Verify all `/admin/ai/*` routes are functional

**Step 2 — Enable Correction Proposals (0.5 days)**
- Enable `DMS_AI_APPLY_CORRECTION_PROPOSALS=true` when ready
- Optionally enable `DMS_AI_APPLY_CORRECTION_RESTORE_PREVIOUS=true` after testing

**Step 3 — Phase 16 Tier 3 Planning Prompt**
- Create planning prompt for Party Contacts write-back (Tier 3A)
- Get Sameer approval before implementation
- Then Tier 3B (Addresses) as follow-up

**Step 4 — AI Navigation Hub**
- Single `/admin/ai` landing page or sidebar improvements
- Makes all built AI features discoverable to users and admins

**Step 5 — HR AI Planning (future)**
- Only after Steps 1–3 are stable
- Requires dedicated security review
- High-value but high-risk

---

## 30. Final Recommendation

**What Sameer should do next:**

> **Start with Option A (Stabilization) — then Option C (enable corrections) — then Option B (Tier 3 planning).**

The ERP AI system is **remarkably comprehensive** for a system at this stage. Phases 1–17 are closed. 66 feature flags, 17 AI tables, 269 passing tests, and a full write-back + correction lifecycle exist. The risk scoring, field suggestions, and Common AI compliance features are built but not generating data — these need admin triggers to activate.

**Do next:**
1. Run production build (`npm run build`) — one-time verification
2. Enable `DMS_AI_APPLY_CORRECTION_PROPOSALS=true` — Phase 17 is ready
3. Enable Azure OCR (`DMS_OCR_AZURE=true`) if Arabic docs are a use case
4. Trigger first risk score scan + field suggestion scan to populate those tables
5. Create planning prompt for Phase 16 Tier 3A (Party Contacts write-back)

**Do not start yet:**
- HR Apply-to-ERP writes — too complex and sensitive without Tier 3 being stable first
- Phase 18 (undefined) — direction must be chosen first
- Bulk corrections / automatic rollback — governance explicitly prohibits these

**The existing AI investment is well-governed and largely production-ready. The immediate priority is activating what's already built, not building new features.**

---

*Report generated 2026-06-27. Read-only. No source code, schema, migrations, UI, or data changes made.*
