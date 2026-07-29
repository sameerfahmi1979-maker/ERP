> ⚠️ STALE / HISTORICAL AI SOURCE OF TRUTH
>
> This document was last reliable through ERP DMS AI Phase 15 and may not include Phase 16 and Phase 17 closure.
>
> For current AI state, use:
> - `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`
> - `implementation_Review/ERP_FULL_AI_MODULE_CURRENT_STATE_EXPLANATION_AND_DIRECTION_REPORT.md`
> - `implementation_Review/ERP_AI_STABILIZATION_AND_ACTIVATION_PLAN.md`
> - `implementation_Review/ERP_AI_STABILIZATION_AND_ACTIVATION_EXECUTION_REPORT.md`

# ERP DMS AI — Current Source of Truth (Post Phase 15 Testing, Performance, Hardening)

**Last updated:** 2026-06-26  
**Phase:** ERP DMS AI Phase 15 — Testing, Performance, Hardening (implemented)  
**Prior phases:** Phase 14 Token/Cost/Observability (2026-06-27), Phase 13 Validation/Conflict Detection/Owner Matching (2026-06-26), Phase 12 Review Queue Activation (2026-06-25), Phase 11 Semantic Chunking (2026-06-25), Phase 10B Queue-backed Admin OCR Backfill (2026-06-24), Phase 10A OCR Pipeline Upgrade/Azure OCR Wiring (2026-06-23), Phase 9 Async Job Queue (2026-06-22), Phase 8 ERP Mapping (2026-06-22), Phase 7 Apply History (2026-06-22), Phase 6 AI Analysis Apply-to-Metadata (2026-06-22), Phase 5 Orchestration Unification (2026-06-22), Phase 4 Transactional Approve & Save (2026-06-22), Phase 3 Metadata-Aware Classification (2026-06-22), Phase 2 Metadata Definitions Upgrade (2026-06-22), Phase 1 Stabilization (2026-06-21)  
**Scope:** Documents the **current implemented** DMS AI workflow. Does not describe future phases as shipped.

---

## Phase 15 — Testing, Performance, Hardening (2026-06-26, IMPLEMENTED)

### Hardening Migration (Phase 15)
| Change | Description |
|---|---|
| Dropped `erp_ai_usage_logs_created_at_idx` | Redundant — kept `idx_erp_ai_usage_created` |
| Dropped `erp_ai_usage_logs_provider_config_idx` | Redundant — kept `idx_erp_ai_usage_config` |
| Tightened `erp_ai_usage_insert` RLS policy | Now requires `dms.admin` permission OR `system_admin`/`group_admin` role (was: any authenticated user) |

### Bug Fix (Phase 15)
| File | Fix |
|---|---|
| `src/lib/dms/semantic/chunk-embedder.ts` | `getDmsEmbeddingProvider()` already returned `configId` but it was not destructured. Fixed to pass `providerConfigId: configId` to `logDmsAiUsage()`. |

### New Test Infrastructure (Phase 15)
| File | Purpose |
|---|---|
| `vitest.config.ts` | Vitest config with path alias `@/` → `src/` |
| `playwright.config.ts` | Playwright E2E config, baseURL=localhost:3000, chromium |
| `tests/e2e/dms-ai-phase15.spec.ts` | 9 Playwright E2E test specs (PW-01 through PW-11) |
| `src/lib/ai/observability/__tests__/safe-usage-redaction.test.ts` | 44 Vitest unit tests for pure redaction functions |
| `src/lib/ai/observability/__tests__/log-dms-ai-usage.test.ts` | 8 Vitest unit tests with mocked Supabase admin client |
| `scripts/dms-ai-phase15-smoke.ts` | HTTP smoke test script for all DMS AI routes + worker auth |

### New QA Documents (Phase 15)
| File | Purpose |
|---|---|
| `implementation_Review/ERP_DMS_AI_PHASE_15_SECURITY_RLS_QA_CHECKS.sql` | 9-section SQL RLS audit script |
| `implementation_Review/ERP_DMS_AI_PHASE_15_PAYLOAD_SAFETY_CHECKS.sql` | Exact-key JSONB payload safety scanner |
| `implementation_Review/ERP_DMS_AI_PHASE_15_PERFORMANCE_REVIEW_QUERIES.sql` | 14 EXPLAIN ANALYZE performance queries |
| `implementation_Review/ERP_DMS_AI_PHASE_15_PRODUCTION_READINESS_CHECKLIST.md` | 42-item production readiness checklist (40 PASS, 2 PASS WITH NOTE) |
| `implementation_Review/ERP_DMS_AI_PHASE_15_RUNTIME_UAT_CHECKLIST.md` | Full UAT execution log |

### package.json Scripts Added (Phase 15)
| Script | Command |
|---|---|
| `test` | `vitest run` |
| `test:watch` | `vitest` |
| `test:e2e` | `cross-env NODE_TLS_REJECT_UNAUTHORIZED=0 playwright test` |
| `test:e2e:headed` | `cross-env NODE_TLS_REJECT_UNAUTHORIZED=0 playwright test --headed` |

### Phase 15 Verification Results
- TypeScript: 0 errors
- Build: PASS (203+ routes)
- Vitest: 52/52 tests PASS (2 test files)
- RLS QA: 0 critical violations (13/13 tables PASS)
- Payload Safety: 0 forbidden keys found
- Worker Auth: 6/6 tests PASS (401/401/200 for both GET and POST)
- Feature Flags: All in correct safe-default state
- Browser Regression UAT: All 5 routes PASS

### Deferred to Phase 16 (Phase 15 findings)
- Job handler observability fields (usageLogId, inputTokenCount, outputTokenCount, modelName, providerCode, estimatedCost) — handlers don't return these; requires orchestration pipeline refactoring
- Playwright automated E2E — spec created; env var `E2E_USER_PASSWORD` must be added to `.env.local` to enable automated run
- DMS_AI_VALIDATION / DMS_AI_ENTITY_MATCHING controlled-ON test — requires safe test document data

---

## Phase 14 — Token / Cost / Observability (2026-06-27, IMPLEMENTED)

### New DB Tables (Phase 14)
| Table | Description |
|---|---|
| `erp_ai_model_cost_rates` | Admin-configurable AI model cost rates. BIGINT PK. rate_type CHECK(token/page/unit/zero). requires_confirmation guards cost estimation. RLS ENABLED+FORCED. No DELETE policy. |

### Extended Tables (Phase 14)
| Table | New Columns |
|---|---|
| `erp_ai_usage_logs` | `document_id BIGINT NULL → dms_documents`, `ai_job_id BIGINT NULL → dms_ai_job_queue`, `upload_session_id BIGINT NULL → dms_upload_sessions`. All ON DELETE SET NULL. +6 indexes. |

### New Feature Flags (Phase 14, all default false)
| Flag | Purpose |
|---|---|
| `DMS_AI_OBSERVABILITY` | Gate for DMS AI Observability dashboard |

### New Permissions (Phase 14)
| Permission | Granted To |
|---|---|
| `dms.ai_observability.view` | system_admin, group_admin, dms_admin |
| `dms.ai_observability.admin` | system_admin |

### New Files (Phase 14)
| File | Purpose |
|---|---|
| `src/lib/ai/observability/safe-usage-redaction.ts` | Strips 23 blocked sensitive keys from metadata before storage/display |
| `src/lib/ai/observability/log-dms-ai-usage.ts` | Shared non-fatal usage logger. Estimates cost from confirmed rates only. |
| `src/server/actions/dms/ai-observability.ts` | 14 server actions: 9 read-only observability + 4 cost rate CRUD |
| `src/app/(protected)/admin/dms/ai-observability/page.tsx` | Observability dashboard page |
| `src/features/dms/ai-observability/` | 10 UI components (filters, 8 section cards/tables, cost rate admin) |

### Modified Files (Phase 14)
| File | Change |
|---|---|
| `src/lib/dms/ai/types.ts` | `DmsAiOutput` +`promptTokens`/`completionTokens` |
| `src/lib/dms/ai/openai-dms-adapter.ts` | `analyze()` parses `usage` field, returns token counts |
| `src/lib/dms/ai-jobs/job-types.ts` | `DmsAiJobHandlerResult` +optional usage/token/cost fields |
| `src/lib/dms/ai-jobs/job-runner.ts` | `updateAttemptCompleted` writes usage columns to dms_ai_job_attempts |
| `src/lib/dms/semantic/chunk-embedder.ts` | Aggregates batch token counts, logs via logDmsAiUsage |
| `src/server/actions/dms/ai-analysis.ts` | Added logDmsAiUsage call (was missing entirely) |
| `src/server/actions/dms/ai-search.ts` | Fixed broken insert → logDmsAiUsage |
| `src/server/actions/dms/document-qa.ts` | Fixed broken insert → logDmsAiUsage |
| `src/server/actions/dms/ai-tags.ts` | Fixed broken insert → logDmsAiUsage |
| `src/server/actions/dms/ai-links.ts` | Fixed broken insert → logDmsAiUsage |
| `src/components/layout/app-sidebar.tsx` | AI Observability nav entry |
| `src/lib/workspace/workspace-route-registry.ts` | /admin/dms/ai-observability registered |
| `src/features/dms/admin/dms-intelligence-admin-page-client.tsx` | Observability shortcut link |

### Usage Logging Safety Rules (Phase 14, enforced)
- `buildSafeMetadata()` in `safe-usage-redaction.ts` strips 23 blocked keys before any metadata enters erp_ai_usage_logs
- `logDmsAiUsage` is non-fatal — AI operations never fail due to logging errors
- Observability server actions never return raw metadata_json / payload_json
- `estimated_cost` is null unless admin confirms a cost rate (`requires_confirmation=false`)

### Migrations Applied (Phase 14)
| Migration | Applied |
|---|---|
| `20260627000000_erp_dms_ai_phase14_token_cost_observability.sql` | ✅ |

### Report
`implementation_Review/ERP_DMS_AI_PHASE_14_TOKEN_COST_OBSERVABILITY_IMPLEMENTATION_REPORT.md`

---

## Phase 13 — Validation, Conflict Detection, Owner Matching (2026-06-26, CLOSED)

### New DB Tables (Phase 13)
| Table | Description |
|---|---|
| `dms_ai_validation_findings` | Deterministic rule findings. BIGINT PK. RLS enabled+forced. Human-review-only. |
| `dms_ai_entity_match_candidates` | Entity match candidates for owner/branch/party/employee. BIGINT PK. RLS. No auto-link. |

### New review_type values (Phase 13, added to dms_review_queue CHECK)
`validation_conflict_review`, `metadata_rule_violation_review`, `owner_matching_review`, `party_matching_review`, `employee_matching_review`, `duplicate_document_review`, `document_consistency_review`

### New FK columns on dms_review_queue
`validation_finding_id BIGINT NULL` → `dms_ai_validation_findings`  
`entity_match_candidate_id BIGINT NULL` → `dms_ai_entity_match_candidates`

### New Feature Flags (Phase 13, all default false)
| Flag | Purpose |
|---|---|
| `DMS_AI_VALIDATION` | Gate for deterministic validation engine |
| `DMS_AI_ENTITY_MATCHING` | Gate for entity/owner matching engine |
| `DMS_AI_VALIDATION_ASSISTED` | AI-assisted validation rules (requires DMS_AI_VALIDATION=true) |
| `DMS_AI_DUPLICATE_DOCUMENTS` | Duplicate document detection |

### New Permissions (Phase 13)
`dms.validation.view`, `dms.validation.run`, `dms.validation.review`, `dms.validation.admin`  
`dms.entity_matching.view`, `dms.entity_matching.run`, `dms.entity_matching.review`, `dms.entity_matching.admin`  
Granted: `system_admin` (all 8), `group_admin` (view/run/review for both)

### New Code Files (Phase 13)
| File | Description |
|---|---|
| `src/lib/dms/validation/validation-types.ts` | Types for findings, rules, run results |
| `src/lib/dms/validation/validation-rules.ts` | Deterministic rule registry (9 rules) |
| `src/lib/dms/validation/validation-engine.ts` | Engine: runDeterministicValidationForDocument, runDeterministicValidationForIntakeSession |
| `src/lib/dms/validation/validation-upsert.ts` | upsertDmsValidationFinding, createReviewQueueItemForValidationFinding |
| `src/lib/dms/validation/index.ts` | Public exports |
| `src/lib/dms/entity-matching/entity-match-types.ts` | Types, score thresholds |
| `src/lib/dms/entity-matching/match-signals.ts` | normalizeName, scoring helpers |
| `src/lib/dms/entity-matching/entity-matcher.ts` | Engine: runDmsEntityMatchingForDocumentSystem |
| `src/lib/dms/entity-matching/entity-match-upsert.ts` | upsertDmsEntityMatchCandidate, createReviewQueueItemForEntityMatchCandidate |
| `src/lib/dms/entity-matching/index.ts` | Public exports |
| `src/server/actions/dms/validation.ts` | Server actions: run/get/review/dismiss/false-positive |
| `src/server/actions/dms/entity-matching.ts` | Server actions: run/get/accept/reject |

### Modified Files (Phase 13)
| File | Change |
|---|---|
| `src/lib/dms/review-queue/review-queue-upsert.ts` | DmsReviewType extended with 7 Phase 13 types; ReviewQueueUpsertInput has validationFindingId/entityMatchCandidateId |
| `src/server/actions/dms/review-queue.ts` | ReviewQueueItem has validationFindingId/entityMatchCandidateId + ValidationFindingDetail + EntityMatchCandidateDetail types; getDmsReviewQueueItem loads linked Phase 13 details |
| `src/features/dms/review-queue/dms-review-queue-item-drawer.tsx` | Phase 13 sections: validation finding, conflict comparison, entity match candidate, safety notice, action buttons |
| `src/features/dms/admin/dms-intelligence-admin-page-client.tsx` | Phase 13 manual run panel: Run Validation + Run Entity Matching for one document |

### Safety Constraints (Phase 13)
- No Apply-to-ERP writes in Phase 13. Phase 16 reserved for owner field application.
- Accepting an entity match candidate updates `dms_ai_entity_match_candidates.status` only.
- Reviewing a finding updates `dms_ai_validation_findings.status` only.
- No writes to `dms_documents.owning_company_id`, `owning_branch_id`, `party_id`.
- No writes to `dms_document_metadata_values` from validation engine.
- All findings/candidates/queue payloads contain only safe IDs/codes (no OCR/raw AI text).

### Migration File
`supabase/migrations/20260626100000_erp_dms_ai_phase13_validation_matching.sql`



---



## 1. Current Upload Inbox Workflow



| Step | Route / Action | Notes |

|------|----------------|-------|

| User opens inbox | `/dms/inbox` | Lists upload sessions and batch intakes |

| Single-file upload | `createDmsUploadSession` → `/dms/intake/[sessionCode]` | Temp file in `dms-temp` bucket; session in `dms_upload_sessions` |

| Batch upload | `/dms/inbox/batches`, `/dms/inbox/batch/[batchCode]` | `dms_upload_batches` + per-file sessions via `batch-intake.ts` |

| Permissions | `dms.documents.upload` | Required for create/upload |



**Tables:** `dms_upload_sessions`, `dms_upload_batches`, `dms_document_files` (after approval only).



---



## 2. Current AI Intake Workflow



**Server actions:** `src/server/actions/dms/ai-intake.ts`



| Step | Function | Status fields |

|------|----------|---------------|

| Start AI fill | `startAiIntakeFromUploadSession` | `intake_status`: ocr → ai → review_pending |

| Retry failed intake | `retryAiIntake` | Resets failed session |

| Load review screen | `getAiIntakeSession` | Reads session + AI result + draft values |
| Re-run metadata only | `rerunMetadataExtractionForIntakeSession` | Pass 2 only after type change (Phase 3) |



**Rules (non-negotiable):**

- AI results are **never** auto-saved to `dms_documents` or metadata.

- Final document is created **only** on `approveAiIntakeAndCreateDocument()`.

- OCR text and AI prompts are **never** logged.



**Metadata loader:** `loadMetadataFieldsForDocumentType(supabase, documentTypeId, "intake")` — Phase 2 context filter (`show_in_upload_review`).



---



## 3. Current OCR / Text Extraction Workflow



**Active path:** GPT-4.1 vision via `triggerDmsOcrForFile` (`src/server/actions/dms/ocr.ts`).



| Component | Role |

|-----------|------|

| `extractFileContent` | PDF text layer, office docs, image prep |

| `persistFileOcrResult` | Writes per-file OCR to `dms_document_files.ocr_text` |

| `isOcrSupported` (`ocr/factory.ts`) | MIME-type gate for UI |

| `writeDocumentContentTextSystem` | Consolidates document-level `dms_document_content.content_text` |



**Phase 1 OCR inventory (not active in pipeline):**

| File | Status |

|------|--------|

| `pdf-text-provider.ts` | Unused — retained for future local PDF fast path |

| `noop-provider.ts` | Unused — stub only |

| `AzureDocumentIntelligenceAdapter` | Defined; **not wired** into main OCR trigger |

| Tesseract | Listed in settings types; deferred |



---



## 4. Two-Pass AI Classification + Metadata Extraction

**Intake Pass 1 (Phase 3):** `buildClassificationCandidates()` pre-ranks types → metadata-aware candidate packets → `provider.analyze()` with `metadataFields: []` + `classificationPackets`.

**Intake Pass 2:** After `resolveSuggestedDocumentType()` → `loadMetadataFieldsForDocumentType(..., "intake")` → second `analyze()` for field extraction.

**Document record (post-approval):** `runDmsAiAnalysisForDocument` — metadata-aware candidate packets when `document_type_id` is null; otherwise existing single-pass with current type metadata.

| Pass | Purpose | Output storage |
|------|---------|----------------|
| Classification | Suggest document type + alternatives | `suggested_document_type_id`, confidence columns, `raw_response_json.classification` |
| Extraction | Field values + confidence | `extracted_fields_json`, `dms_intake_review_values` (intake draft) |

**Prompt version:** `PROMPT_VERSION = "v3.3"` in `prompt-builders.ts` (Phase 3 — metadata-aware classification).



---



## 5. Current AI Intake Review Workflow



| Step | UI | Persistence |

|------|-----|-------------|

| Review AI suggestions | `/dms/intake/[sessionCode]` | User edits fields |

| Draft save | Intake review actions | `dms_intake_review_values` (scoped RLS) |

| Discard | `discardAiIntake` | Session marked discarded |



**Phase 3 intake UI enhancements:**
- Classification confidence card with reason and needs-review badge
- Top 3 alternative document types (from `raw_response_json.classification`)
- Type-change confirmation dialog with merge modes: `fill_missing_only`, `replace_ai_values`, `keep_user_values`
- `rerunMetadataExtractionForIntakeSession` — Pass 2 only, no OCR re-run

**Phase 2 intake UI enhancements:**

- Fields grouped by `field_group` when configured

- Display-only warnings for `review_required_if_missing` and `review_required_if_low_confidence`

- Placeholders from `placeholder_en` when set



**RLS (DMS.14 aligned):**

- **SELECT:** upload session owner OR `dms.documents.review_ai` OR `dms.admin` OR `system_admin`

- **WRITE:** `dms.documents.upload` OR review_ai OR admin OR system_admin



**Not implemented:** Admin list at `/dms/inbox/review` (planned DMS.12).



---



## 6. Approve & Save Workflow (Phase 4 — Transactional)

**Architecture:** Hybrid Option C — TypeScript approval saga + atomic PostgreSQL RPC.

**Server action entry point:** `approveAiIntakeAndCreateDocument()` in `src/server/actions/dms/ai-intake.ts`  
**Batch path entry point:** `finalizeDraftIntake()` in `src/server/actions/dms/batch-intake.ts`  
**Both delegate to:** `runApproveAiIntakeSaga()` in `src/lib/dms/approve/approve-ai-intake.ts`

**Approval saga steps (in order):**

1. Create `dms_approve_runs` tracking record (`stage: validating`)
2. Update session `approve_status = processing`
3. Copy file `dms-temp` → `dms-documents` (deterministic path; skipped for existing-draft mode if file already in place)
4. Build RPC payload (`buildApproveRpcPayload`) with all metadata, tags, links, reminders
5. Call `approve_dms_ai_intake(p_payload JSONB)` RPC — atomic PostgreSQL transaction
6. **If RPC fails:** compensate by deleting the copied file; update run to `failed`/`failed_storage_cleanup`
7. **If RPC succeeds:** update run to `db_committed`, then `completed`
8. Trigger best-effort OCR/content sync post-commit (non-blocking)

**Atomic RPC (`approve_dms_ai_intake`)** handles in one transaction:
- Row-lock `dms_upload_sessions` (`FOR UPDATE`) — prevents race conditions
- Idempotency check — returns existing `document_id` if already approved
- Upsert `dms_documents` (insert for new; update for existing draft)
- Insert `dms_document_versions` + `dms_document_files`
- Update `dms_documents.current_version_id`
- Upsert `dms_document_metadata_values`
- Insert `dms_document_tags` + `dms_document_links` (on-conflict ignore)
- Upsert `dms_expiry_reminders`
- Update `dms_ai_extraction_results` → `accepted`
- Update `dms_upload_sessions` → `approved`, `document_id`, `approve_run_id`
- Insert `dms_document_events` audit entry
- Update `dms_approve_runs` → `db_committed`

**Modes:**
- `single_file_new_document` — new document from single-file intake
- `existing_batch_draft` — promotes existing draft document from batch intake

**Idempotency:** Unique index on `dms_approve_runs(upload_session_id)` WHERE `status IN (completed, db_committed)`. RPC re-entry returns existing document. Double-click protection via `isProcessing` React state.

**Human review:** One-by-one approval only (DMS.13 governance — no bulk auto-approve).

**New tables:** `dms_approve_runs` — tracks every approval attempt with stage, status, storage paths, error info.  
**New session columns:** `approve_run_id`, `approve_status`, `approve_error`, `approved_at`.  
**New DB functions:** `reserve_dms_document_id()` (SECURITY DEFINER), `approve_dms_ai_intake(p_payload JSONB)` (SECURITY DEFINER).

---

## 6b. Phase 5 — Post-Approval Orchestration Unification

**Phase 5 closed 2026-06-22. Unified post-approve orchestration trigger for both single-file and batch paths.**

### Trigger Strategy: Option C-lite

After `runApproveAiIntakeSaga()` marks the approve run `COMPLETED`, it calls `triggerDmsPostApproveOrchestration()` from `src/lib/dms/orchestration/post-approve-orchestration.ts`.

| Path | Approve saga mode | `source` passed |
|------|------------------|-----------------|
| Single-file approve | `new_from_upload` / `new_from_draft` | `single_file_approve` |
| Batch finalize | `existing_batch_draft` | `batch_finalize` |

Both paths now converge in `runApproveAiIntakeSaga()` (Phase 4), so Phase 5 only adds the trigger at that single convergence point.

### Post-Approve Trigger (`triggerDmsPostApproveOrchestration`)

- Located: `src/lib/dms/orchestration/post-approve-orchestration.ts`
- Guards duplicate runs: skips if `orchestration_status` is `running`, `complete`, or `complete_with_warnings`
- Records `orchestration_source` and `orchestration_triggered_by_approve_run_id` on the session (additive columns)
- Calls `runDmsAiOrchestrationPostDraft()` — same function used before Phase 5
- Catches all errors — NEVER propagates failure to approval result
- Audits: `dms_post_approve_orchestration_triggered`, `dms_post_approve_orchestration_completed`, `dms_post_approve_orchestration_skipped`, `dms_post_approve_orchestration_error`

### Informational Step Fix (Phase A Steps)

`buildInitialSteps()` in `pipeline-runner.ts` now marks Phase A steps (`upload_received`, `ocr_and_extraction`, `draft_ready`) as `skipped` with a safe message instead of `pending`. These were already completed before approval; showing them as pending was misleading.

Defined in `DMS_AI_ORCH_PHASE_A_STEPS` in `types.ts`.

### Retry Feature Flag

`retryDmsOrchestrationStep()` now checks `DMS_AI_ORCHESTRATION` feature flag at the start. Returns a structured error if disabled — no AI steps run.

### New DB Columns (Phase 5 Migration)

Migration: `20260622110000_erp_dms_ai_phase5_orchestration_source_columns.sql` (applied 2026-06-22).

| Column | Type | Notes |
|--------|------|-------|
| `dms_upload_sessions.orchestration_source` | `TEXT NULL` | `single_file_approve`, `batch_finalize`, `manual_batch_button`, `manual_retry`, `auto_trigger_ui` |
| `dms_upload_sessions.orchestration_triggered_by_approve_run_id` | `BIGINT NULL FK → dms_approve_runs.id` | Links session to approving run |

### Safety Boundaries Preserved (Phase 5)

- Human Approve & Save remains the single authorization point.
- Orchestration runs only after a successful human-approved document creation.
- Orchestration failure NEVER rolls back or invalidates approval.
- AI cannot auto-approve, auto-save production metadata, or auto-attach records.
- `DMS_AI_ORCHESTRATION` feature flag gates all AI step execution including retry.



---



## 7. Standard File Naming Workflow



**Resolver:** `resolveStandardFileNameForIntakeApprove` / `validateStandardFileName`  

**Rule file:** `.cursor/rules/erp-dms-standard-file-naming.mdc`  

Applied at approve time; user can override on review screen when allowed.



---



## 8. Current Document AI Tabs (Record Workspace)



Route: `/dms/documents/record/[id]`



| Tab / section | Server action(s) | Human review |

|---------------|------------------|--------------|

| Understanding | `getDmsDocumentUnderstanding` | Read-only aggregation |

| OCR | `getDmsDocumentOcrText`, `triggerDmsOcrForFile` | Manual re-run |

| AI Analysis | `runDmsAiAnalysisForDocument`, `getDmsAiAnalysisStatus` | Suggestions only — no auto-apply to metadata |

| AI Summary | `generateAndSaveDmsAiSummary` | Admin gate for hr/legal/executive |

| Ask AI | `askDmsDocumentQuestion` | Admin gate for confidential |

| Semantic / Search | `semanticSearchDmsDocuments`, embeddings | Feature-flagged |

| Tags / Links suggestions | `ai-tags.ts`, `ai-links.ts` | Accept/reject per suggestion |



**Assistant EXPLAIN_DOCUMENT:** Uses `getDmsDocumentUnderstanding()` — no `dms_document_understandings` table.



---



## 9. Post-Approval Orchestration Status



**Feature flag:** `DMS_AI_ORCHESTRATION` on `erp_ai_feature_flags`  

**Actions:** `orchestration.ts` — runs after draft/document exists  

**Columns:** `dms_upload_sessions.orchestration_status`, `orchestration_steps_json`



Pipeline (best-effort, flag-gated): content sync → summary → intelligence → embedding → tag/link suggestions.



**No auto-approval** in orchestration.



---



## 10. Metadata Definitions Usage (Phase 2)



**Admin:** `/admin/dms/metadata-definitions`  

**Table:** `dms_metadata_definitions` (per `document_type_id`)



**Canonical labels:** `field_label_en`, `field_label_ar` only (`label_ar` dropped Phase 2).



**Shared module:** `src/lib/dms/metadata/metadata-definition-shared.ts`

- `DMS_METADATA_DEFINITION_SELECT` — canonical column list

- `mapMetadataDefinitionRow` — typed row mapper with safe defaults

- `filterMetadataDefinitionsByContext` — `"all" | "intake" | "analysis"`

- `groupMetadataDefinitionsByFieldGroup` — intake review grouping



**Shared loader:** `loadMetadataFieldsForDocumentType(supabase, documentTypeId, context)`

- Filters `is_active = true`, `deleted_at IS NULL`

- Includes fields where `is_ai_extractable !== false`

- Intake context: `show_in_upload_review !== false`

- Maps to `DmsAiMetadataField` for prompts (aliases, keywords, format, examples, threshold)



**Phase 2 columns (Hybrid Option D):**



| Category | Columns |

|----------|---------|

| Grouping | `field_group`, `field_section` |

| Visibility | `show_in_review`, `show_in_detail`, `show_in_list`, `show_in_upload_review` |

| Search/filter | `is_searchable`, `is_filterable`, `is_unique` |

| UX text | `placeholder_en/ar`, `help_text_en/ar` |

| AI hints | `ai_possible_labels_en/ar`, `ai_keywords`, `ai_negative_keywords`, `ai_expected_format`, `ai_example_values`, `ai_confidence_threshold`, `normalization_rule`, `ai_rules_json` |

| Review rules | `review_required_if_missing`, `review_required_if_low_confidence` |

| Versioning | `metadata_version` (default 1) |



**Kept unchanged:** `options_json`, `validation_json` (editable in admin UI).



**Used by:** `ai-intake.ts` (intake), `ai-analysis.ts` (analysis), `document-metadata-values.ts`, admin CRUD.



---



## 11. Current Database Tables Used



| Table | Role |

|-------|------|

| `dms_documents` | Canonical document |

| `dms_document_files` | Files + per-file OCR |

| `dms_document_content` | Document-level full text |

| `dms_document_metadata_values` | Approved metadata |

| `dms_upload_sessions` | Intake lifecycle (Phase 4: +approve_run_id, +approve_status, +approve_error, +approved_at) |

| `dms_upload_batches` | Batch intake |

| `dms_intake_review_values` | Intake review drafts |

| `dms_ai_extraction_jobs` | Job tracking |

| `dms_ai_extraction_results` | AI output JSON |

| `dms_metadata_definitions` | Field schema (Phase 2 upgraded) |

| `dms_document_types` | Type master |

| `dms_document_links` / `dms_document_tags` | Entity links |

| `dms_expiry_reminders` | Expiry reminders (DMS.14 RLS in repo) |

| `dms_notification_queue` | Notification queue (DMS.14 RLS in repo) |

| `dms_renewal_requests` | Renewal requests (DMS.14 RLS in repo) |

| `dms_review_queue` | **Schema only — unused in app code** |

| `dms_approve_runs` | **Phase 4 NEW** — approve attempt tracking (stage, status, storage paths, errors) |

| `erp_ai_provider_configs` | Provider settings |

| `erp_ai_feature_flags` | Feature toggles |

| `erp_ai_usage_logs` | Usage audit |

| `audit_logs` | ERP audit trail |



---



## 12. Current Safety Rules



1. **Human-review-first** — AI never auto-writes production metadata on existing documents.

2. **Confidentiality** — hr/legal/executive gates on content, summary, Q&A, analysis (server actions).

3. **No sensitive logging** — OCR text, prompts, raw AI responses not logged.

4. **RLS** — Intake review values scoped; DMS.14 parity migrations in repo for expiry/notification/renewal.

5. **API keys** — env vars only via `secret_ref`; never in DB.

6. **Assistant actions** — read/navigation/draft only; no ERP mutations from assistant handlers.

7. **AI rules JSON** — admin-defined hints only; no document content in definition rows.



---



## 13. Known Remaining Gaps (After Phase 5)



| Gap | Notes |

|-----|-------|

| `dms_review_queue` unused | Keep for Phase 12 activation |

| `/dms/inbox/review` admin queue | Not built |

| AI Analysis apply-to-metadata | Phase 6+ |

| Async job queue | Not planned for Phase 5 scope; revisit if scale requires |

| Semantic chunks UI/workflow | Phase 6+ |

| SQL-queryable alternatives columns | Optional; currently in raw JSON only |

| Azure DI OCR not wired to trigger | Adapter exists; main OCR uses GPT vision |

| Storage cleanup for orphaned runs | Manual / future janitor job — not blocking |

| Orchestration for manual upload (no AI intake) | Phase 6 — `orchestration_source` column ready |

| `orchestration_steps_json` backward compat for pre-Phase-5 sessions | Phase A steps treated as pending in old sessions (no migration of existing data needed) |



---



## 14. Next Phases (Roadmap — Not Implemented)



- **Phase 6+:** AI Analysis apply-to-metadata, semantic chunks, review queue UI

- **OCR:** Azure DI wiring — separate phase

- **Orchestration observability:** Admin dashboard for orchestration status across sessions



---



## Key File Index



```

src/lib/dms/ai/classification-score.ts                    — Phase 3 pre-ranking
src/lib/dms/ai/classification-candidate-builder.ts         — Metadata-aware packets
src/lib/dms/ai/classification-output.ts                    — Alternatives/evidence parsing
src/lib/dms/ai/prompt-builders.ts                          — PROMPT_VERSION v3.3

src/server/actions/dms/ai-intake.ts                        — Single-file approve entry + intake actions
src/server/actions/dms/batch-intake.ts                     — Batch finalize entry

src/lib/dms/approve/approve-ai-intake.ts                   — Phase 4/5: approval saga orchestrator (Phase 5 adds orchestration trigger)
src/lib/dms/approve/approve-ai-intake-events.ts            — Phase 4: approve_run tracking helpers
src/lib/dms/approve/approve-ai-intake-storage.ts           — Phase 4: storage copy + compensation
src/lib/dms/approve/approve-ai-intake-payload.ts           — Phase 4: RPC payload builder

src/lib/dms/orchestration/post-approve-orchestration.ts    — Phase 5: post-approve orchestration trigger (shared for single + batch)
src/lib/dms/orchestration/types.ts                         — Phase 5: added DMS_AI_ORCH_PHASE_A_STEPS
src/lib/dms/orchestration/pipeline-runner.ts               — Phase 5: buildInitialSteps() marks Phase A steps as skipped
src/server/actions/dms/orchestration.ts                    — Phase 5: retryDmsOrchestrationStep now checks DMS_AI_ORCHESTRATION flag

supabase/migrations/20260622103000_erp_dms_ai_phase4_transactional_approve_save.sql
                                                           — Phase 4: dms_approve_runs, new session cols,
                                                             reserve_dms_document_id(), approve_dms_ai_intake()
supabase/migrations/20260622110000_erp_dms_ai_phase5_orchestration_source_columns.sql
                                                           — Phase 5: orchestration_source, orchestration_triggered_by_approve_run_id

src/features/dms/intake/dms-ai-intake-classification-card.tsx

src/lib/dms/metadata/metadata-diff.ts                      — Phase 6: pure diff utility (buildMetadataDiff, convertAiValueForFieldType, serializeMetadataValue, summarizeMetadataValue)
src/server/actions/dms/ai-analysis.ts                      — Phase 6: added applyAiAnalysisToMetadata() action
src/features/dms/documents/sections/dms-document-ai-section.tsx
                                                           — Phase 6: added AiMetadataDiffSection, DiffStateBadge, canApplyMetadata prop, documentTypeId prop, updated info text
src/features/dms/documents/dms-document-record-form.tsx    — Phase 6: passes documentTypeId + canApplyMetadata to DmsDocumentAiSection
src/server/actions/dms/ai-tags.ts                          — Tags fix: added createAndApplyDmsTagSuggestion() for New tag suggestions
src/features/dms/documents/sections/dms-document-tags-section.tsx
                                                           — Tags fix: tick mark shown for all suggestions; New suggestions use createAndApplyDmsTagSuggestion

implementation_Review/ERP_DMS_AI_PHASE_6_AI_ANALYSIS_APPLY_TO_METADATA_IMPLEMENTATION_REPORT.md
implementation_Review/ERP_DMS_AI_PHASE_5_SINGLE_BATCH_ORCHESTRATION_UNIFICATION_IMPLEMENTATION_REPORT.md
implementation_Review/ERP_DMS_AI_PHASE_4_TRANSACTIONAL_APPROVE_SAVE_IMPLEMENTATION_REPORT.md
implementation_Review/ERP_DMS_AI_PHASE_3_METADATA_AWARE_CLASSIFICATION_IMPLEMENTATION_REPORT.md

```

## Phase 6 — AI Analysis Apply-to-Metadata (Closed)

### Workflow

1. User opens an approved document and navigates to the AI Analysis tab.
2. User runs (or views latest) AI Analysis.
3. User expands the latest result card.
4. **AiMetadataDiffSection** renders below the extracted fields table (requires `canApplyMetadata` and `pending_review` status).
5. The diff table loads current `dms_document_metadata_values` and `dms_metadata_definitions` via TanStack Query.
6. `buildMetadataDiff()` computes per-field diff states: `new`, `same`, `changed`, `conflict`, `low_confidence`, `no_ai_value`, `not_extractable`.
7. `new` rows are pre-selected; `changed` and `low_confidence` rows are unchecked by default; `conflict` rows are disabled.
8. User selects fields and clicks **Apply Selected**.
9. Confirmation `AlertDialog` shows replacement/low-confidence warnings with required checkboxes.
10. `applyAiAnalysisToMetadata()` server action runs:
    - Auth + permission check (`dms.documents.edit | review_ai | admin`)
    - Confidentiality gate
    - Validates AI result belongs to document
    - Loads definitions + current values server-side
    - Builds diff server-side (not trusted from client)
    - Per-field validation, type conversion, options check
    - Upserts only selected valid fields to `dms_document_metadata_values`
    - Logs per-field audit events with before/after value summaries
    - Marks AI result `ai_status = "accepted"` if any fields applied
    - Revalidates document path
11. UI invalidates `documentMetadata` and `documentAiStatus`/`documentAiResults` queries.
12. Metadata tab reflects new values; AI tab shows "Accepted" badge.

### Safety Guarantees

- **No auto-apply**: AI suggestions are never written without user selecting and confirming.
- **No overwrite without confirmation**: `changed` fields require `replaceExistingConfirmed = true`.
- **Low-confidence guard**: fields requiring review require `lowConfidenceConfirmed = true`.
- **Conflict blocked**: invalid type/option fields cannot be selected.
- **Confidential gate**: `hr/legal/executive` documents require `dms.admin`.
- **Server re-validates**: diff is rebuilt server-side; client selections are verified against fresh data.

### No Database Migration

Phase 6 uses only existing tables. No new tables or columns were added.

### Known Remaining Gaps / Next Phases

- **Phase 8**: ERP mapping — plan exists in `ERP_DMS_AI_PHASE_7_APPLY_HISTORY_AND_ERP_MAPPING_PLAN.md` (Part B).
- **Phase 8**: Review queue UI (batch review of pending AI results across all documents).
- **Tags — `dms_tags` admin gate**: `createAndApplyDmsTagSuggestion` creates tags without admin review; a future phase may add a tag creation approval flow.

---

## Phase 7 — Apply History (Closed)

### Objective

Add structured apply history tables as an operational read-model, enabling a per-run Apply History panel in the AI Analysis tab. `audit_logs` remains the official immutable audit trail.

### New Tables

| Table | Purpose |
|-------|---------|
| `dms_ai_metadata_apply_runs` | One row per `applyAiAnalysisToMetadata()` call |
| `dms_ai_metadata_apply_items` | One row per selected field (applied/skipped/blocked) |

**Migration:** `supabase/migrations/20260622130000_erp_dms_ai_phase7_apply_history.sql`

### New Server Actions

- `getDmsAiMetadataApplyHistory(documentId)` — returns runs + items for a document
- `applyAiAnalysisToMetadata()` **modified** — now inserts apply run row (non-fatal) before field loop and per-field item rows after each field write

### New Query Key

`queryKeys.dms.documentAiApplyHistory(documentId)` → `["dms", "documents", documentId, "ai-apply-history"]`

`invalidateDmsAiAnalysis()` now also invalidates `ai-apply-history`.

### New UI

`ApplyHistoryPanel` component added to `AiResultCard` expanded body (inside `dms-document-ai-section.tsx`). Renders below the Phase 6 diff section. Loads lazily when expanded. Shows:
- Per-run: status badge, applied-by name, date/time, applied/skipped counts
- Per-item: applied/skipped icon, field code, before/after value summary (≤100 chars), confidence badge, skip reason

### Non-Fatal Write Strategy

Apply history inserts use `createAdminClient()`. All apply run / item writes are wrapped in `try { await ... } catch { /* non-fatal */ }`. A failure in history writes does not fail the metadata apply. `audit_logs` is the fallback official trail.

### ERP Mapping

Not implemented in Phase 7. Implemented in Phase 8. See below.

### Safety Guarantees (unchanged from Phase 6)

- No auto-apply, no ERP record writes, human-review-first preserved.
- Apply history tables are append-only from the application; no delete/rollback UI.

### Implementation Report

`implementation_Review/ERP_DMS_AI_PHASE_7_APPLY_HISTORY_IMPLEMENTATION_REPORT.md`

---

## 20. Phase 8 — ERP Mapping Registry + Read-only Preview (closed)

### Objective

Phase 8 creates a mapping registry (admin-managed) from DMS metadata definition fields to ERP target table columns, and adds a read-only ERP Diff Preview panel to the document AI Analysis tab. No ERP records are written. Apply-to-ERP is reserved for Phase 9.

### New Database Table

| Table | Purpose |
|-------|---------|
| `dms_metadata_erp_mappings` | Admin-configured rules: which DMS metadata field maps to which ERP table.column |

**Migration:** `supabase/migrations/20260622140000_erp_dms_ai_phase8_erp_mappings.sql`

**Key columns:** `metadata_definition_id`, `document_type_id`, `target_module`, `target_table`, `target_field`, `target_relation_field`, `target_record_strategy`, `is_active`, `allow_apply_to_existing` (always false Phase 8), `requires_target_permission`

**RLS:** SELECT for DMS viewers/admins; INSERT/UPDATE for dms.admin/system_admin only. Soft delete via `deleted_at`.

### ERP Mapping Target Registry

```
src/lib/dms/erp-mapping/erp-mapping-targets.ts
```

Server-side TypeScript allowlist of permitted `(module, table, field)` combinations:
- `hr.employee_identity_documents` — 11 safe fields
- `hr.employee_medical_insurances` — 8 safe fields
- `party.party_licenses` — 6 safe fields
- `party.party_tax_registrations` — 4 safe fields

FK columns and system-generated columns excluded. Fleet/asset deferred (no active module).

Exports: `validateErpMappingTarget()`, `getErpMappingTargetConfig()`, `listErpMappingTargets()`, `listErpMappingFields()`

### New Server Actions

**File:** `src/server/actions/dms/erp-mappings.ts`

| Action | Permission | Purpose |
|--------|-----------|---------|
| `getDmsErpMappingsForDefinition(definitionId)` | view | List mappings for an admin definition |
| `getDmsErpMappingsForDocumentType(documentTypeId)` | view | Active mappings for a doc type |
| `createDmsErpMapping(input)` | dms.admin only | Create a mapping rule |
| `updateDmsErpMapping(id, input)` | dms.admin only | Update a mapping rule |
| `deleteDmsErpMapping(id)` | dms.admin only | Soft delete a mapping rule |
| `getDmsErpMappingTargetRegistry()` | view | Return allowlist for admin dropdowns |
| `getDmsErpMappingPreview(documentId)` | view | Read-only ERP diff preview |

`getDmsErpMappingPreview` is **read-only**: loads DMS metadata values, resolves ERP target via document links, fetches current ERP field value, returns diff status. No writes to ERP tables.

### New Query Keys

```typescript
queryKeys.dms.erpMappingsForDefinition(definitionId)   → ["dms", "erp-mappings", "definition", definitionId]
queryKeys.dms.erpMappingsForDocumentType(documentTypeId) → ["dms", "erp-mappings", "document-type", documentTypeId]
queryKeys.dms.erpMappingPreview(documentId)             → ["dms", "documents", documentId, "erp-mapping-preview"]
queryKeys.dms.erpMappingTargets()                       → ["dms", "erp-mapping-targets"]
```

### New Admin UI

`DmsMetadataErpMappingsDialog` — child dialog on the DMS Admin Metadata Definitions table. Opens when admin clicks the Network (🔗) icon per definition row. Allows admin to view, add, edit, soft-delete mapping rules.

**File:** `src/features/dms/admin/dms-metadata-erp-mappings-dialog.tsx`

**Modified:** `src/features/dms/admin/dms-metadata-definitions-table.tsx` — added Network icon button to actions column; added `DmsMetadataErpMappingsDialog` to render block.

Key UI safety rules:
- Target table/field dropdowns only show allowlisted values (no free text)
- `allow_apply_to_existing` is always `false` and disabled in Phase 8
- Notice shown: "Phase 8 — Preview only. Phase 9 for apply."

### New Document UI — ERP Mapping Preview Panel

`ErpMappingPreviewPanel` — collapsible read-only panel in the document AI Analysis tab, placed below ApplyHistoryPanel.

**File:** `src/features/dms/documents/sections/dms-erp-mapping-preview-panel.tsx`

**Modified:** `src/features/dms/documents/sections/dms-document-ai-section.tsx` — added `<ErpMappingPreviewPanel documentId={documentId} />` after `<ApplyHistoryPanel>`.

**Diff statuses shown:** `same`, `new`, `changed`, `no_dms_value`, `no_target`, `no_link`, `ambiguous`

**No Apply button. No ERP writes. Fully read-only.**

### Target Record Matching

- `link_exact` strategy: `dms_document_links.entity_id` IS the target record id
- `link_parent` strategy: `entity_id` is the parent; queries child table for matching `relation_field`
- No link → shows `no_link` warning
- Multiple ambiguous candidates → shows `ambiguous` warning
- Phase 9 will require explicit user selection for ambiguous cases

### HR Compliance DMS Prefill

`src/server/actions/hr/compliance-dms-prefill.ts` and `src/lib/hr/compliance/*` — **NOT modified**. These files remain exactly as before. Phase 8 coexists with the existing prefill workflow without conflict.

### Phase 9 Implementation (CLOSED ✅)

**ERP DMS AI Phase 9 — Async AI Job Queue / Workflow Runner** implemented 2026-06-21.

**3 new DB migrations:**
- `supabase/migrations/20260622150000_erp_dms_ai_phase9_job_queue.sql` — `dms_ai_job_queue` + `dms_ai_job_attempts` tables + RLS
- `supabase/migrations/20260622151000_erp_dms_ai_phase9_job_queue_rpcs.sql` — 4 SECURITY DEFINER RPCs (claim/complete/fail/recover_stale)
- `supabase/migrations/20260622152000_erp_dms_ai_phase9_feature_flags.sql` — `DMS_AI_JOB_QUEUE` + `DMS_AI_JOB_QUEUE_WORKER_ENABLED` flags (both default false)

**New TypeScript modules (`src/lib/dms/ai-jobs/`):**
- `job-types.ts` — DMS_AI_JOB_TYPE enum, status types, payload schemas (Zod), DmsAiJobHandler interface
- `job-registry.ts` — maps job types to handler implementations
- `handlers/post-approve-orchestration.handler.ts` — handler for `post_approve_orchestration` job type
- `job-runner.ts` — `enqueueDmsAiJob`, `enqueueUniqueDmsAiJob`, `processNextDmsAiJobs`, `runDmsAiJob`

**New system pipeline (`src/lib/dms/orchestration/system-pipeline.ts`):**
- Worker-context orchestration (no user auth required, uses `createAdminClient()`)
- Runs content sync, AI summary, intelligence, embedding, tag/link suggestions
- All steps gated by individual feature flags

**Modified:**
- `src/lib/dms/orchestration/post-approve-orchestration.ts` — conditional queue vs inline (feature-flag-controlled)
- `src/lib/dms/orchestration/types.ts` — added `"queued"` to `DmsAiOrchestrationStatus`
- `src/features/dms/orchestration/dms-orchestration-progress-card.tsx` — renders queued state
- `src/lib/query/query-keys.ts` — added `aiJobsForDocument` + `aiJobStatus` query keys

**New server actions (`src/server/actions/dms/ai-jobs.ts`):**
- `enqueueDmsAiJobAction`, `enqueueUniqueDmsAiJobAction`, `getDmsAiJobStatus`, `getDmsAiJobsForDocument`, `cancelDmsAiJob`, `retryDmsAiJob`

**New worker route (`src/app/api/internal/dms-ai-jobs/process/route.ts`):**
- `POST /api/internal/dms-ai-jobs/process` — claims + processes jobs; requires `Authorization: Bearer WORKER_SECRET`
- `GET /api/internal/dms-ai-jobs/process` — health check with queue counts

**Feature flags:**
- `DMS_AI_JOB_QUEUE=false` — when true, post-approval orchestration is enqueued; when false, runs inline (no behavior change until enabled)
- `DMS_AI_JOB_QUEUE_WORKER_ENABLED=false` — enables the worker route

**Implementation Report:**
`implementation_Review/ERP_DMS_AI_PHASE_9_ASYNC_JOB_QUEUE_WORKFLOW_RUNNER_IMPLEMENTATION_REPORT.md`

### Phase 10 — Next

ERP Mapping Apply Runs (pending Sameer/Dina approval):
```
dms_erp_mapping_apply_runs + dms_erp_mapping_apply_items tables
Set allow_apply_to_existing = true per mapping
Apply-to-ERP confirmation UI + server action
Dual permission gate (DMS + target module)
Per-field audit logging to audit_logs
ERP field write via existing server actions (updateEmployeeIdentityDocument, updatePartyLicense, etc.)
```

### Phase 8 Implementation Report

`implementation_Review/ERP_DMS_AI_PHASE_8_ERP_MAPPING_IMPLEMENTATION_REPORT.md`

---

## Phase 11 — Semantic Chunking and Embeddings (IMPLEMENTED 2026-06-25)

Chunk-level semantic indexing layer for DMS documents.

### What Was Delivered

**New DB objects (3 migrations):**
- `public.dms_document_content_chunks` table — stores chunk text, hashes, embedding vector(1536), status
- RLS enabled + forced; HNSW partial index on active completed embeddings
- 5 new feature flags: `DMS_EMBEDDING` (fix), `DMS_SEMANTIC_CHUNKING`, `DMS_SEMANTIC_EMBEDDINGS`, `DMS_SEMANTIC_INDEX_QUEUE`, `DMS_SEMANTIC_SEARCH_CHUNKS` — all default false
- `search_dms_document_chunks_by_embedding` RPC — SECURITY INVOKER, returns snippet only (max 250 chars), respects confidentiality

**New lib modules:**
- `src/lib/dms/semantic/chunk-builder.ts` — deterministic paragraph-aware sliding window chunker (4k target, 6k max, 200 char overlap, 200 max chunks)
- `src/lib/dms/semantic/chunk-embedder.ts` — embeds pending chunks via `getDmsEmbeddingProvider()`, validates vector(1536), never logs chunk text
- `src/lib/dms/semantic/semantic-indexer.ts` — orchestrates build + embed; idempotent; uses `createAdminClient()`

**Queue integration:**
- `DMS_AI_JOB_TYPE.SEMANTIC_DOCUMENT_INDEX` added to `job-types.ts`
- `SemanticDocumentIndexPayloadSchema` — payload contains only `documentId`, `source`, `forceRebuild`
- `semantic-document-index.handler.ts` — registered in `job-registry.ts`

**Admin server actions added to `intelligence-admin.ts`:**
- `adminSemanticIndexBackfill(mode: dry_run|enqueue|rebuild_all)` — dry-run shows counts, enqueue creates queue jobs
- `getSemanticIndexQueueSummary()` — queue counts for semantic_document_index jobs
- `getDmsDocumentSemanticIndexStatus(documentId)` — chunk counts for a single document
- `enqueueDmsDocumentSemanticIndex(documentId, forceRebuild)` — admin rebuild button

**Updated files:**
- `src/server/actions/dms/semantic-search.ts` — chunk-level search with document-level fallback; `DMS_SEMANTIC_SEARCH_CHUNKS` gates chunk path
- `src/server/actions/dms/document-qa.ts` — chunk-grounded Q&A; top-5 per-doc similarity; chunk citations in response; fallback to raw text
- `src/features/dms/admin/dms-intelligence-admin-page-client.tsx` — Semantic Index Backfill section
- `src/features/dms/documents/sections/dms-document-semantic-section.tsx` — chunk status panel + admin Rebuild button
- `src/lib/dms/orchestration/system-pipeline.ts` — enqueues `semantic_document_index` after content sync if flags allow
- `src/lib/dms/ai/types.ts` — `DmsSemanticSearchResult` extended with `chunkSnippet`/`searchMode`; `DmsDocumentQuestionAnswer` extended with `chunkCitations`/`chunk_text` sourceUsed

### Feature Flag Rollout Sequence

1. Enable `DMS_SEMANTIC_CHUNKING` — enables chunk creation
2. Enable `DMS_AI_JOB_QUEUE` (already exists) — enables queue
3. Enable `DMS_SEMANTIC_INDEX_QUEUE` — enables admin backfill enqueue
4. Run admin backfill → semantic chunks created
5. Enable `DMS_SEMANTIC_EMBEDDINGS` + configure DEFAULT_EMBEDDING provider → embeddings generated
6. Enable `DMS_SEMANTIC_SEARCH_CHUNKS` → chunk-level search and Q&A active
7. Enable `DMS_EMBEDDING` — document-level embedding step in orchestration (already existed, just missing the flag row)

### Implementation Report

`implementation_Review/ERP_DMS_AI_PHASE_11_SEMANTIC_CHUNKING_AND_EMBEDDINGS_IMPLEMENTATION_REPORT.md`

---

## Phase 12 — Review Queue Activation (2026-06-25)

### Objective

Activate the existing `dms_review_queue` stub table into a production human review queue for AI workflow findings.

### Key Changes

**Migration:** `supabase/migrations/20260625200000_erp_dms_ai_phase12_review_queue_activation.sql`
- Added 20 new columns to `dms_review_queue`: `idempotency_key`, `review_type`, `source_type`, `source_id`, `ai_result_id`, `ai_job_id`, `metadata_definition_id`, `field_code`, `reason_code`, `reason_message`, `confidence`, `payload_json`, `assigned_at`, `reviewed_by`, `reviewed_at`, `resolved_at`, `resolution_code`, `resolution_note`, `due_at`, `updated_by`
- CHECK constraints: status, review_type (6 types), priority (4 values)
- Partial unique idempotency index + 9 performance indexes
- RLS replaced with granular SELECT / UPDATE / INSERT policies (no broad USING true)
- Seeded 4 new permissions: `dms.review_queue.view`, `dms.review_queue.manage`, `dms.review_queue.bulk`, `dms.review_queue.admin`

**Helper:** `src/lib/dms/review-queue/review-queue-upsert.ts`
- `upsertDmsReviewQueueItem()` — idempotent queue item creation with payload sanitization, due_at computation, duplicate prevention
- `createDmsReviewQueueNotification()` — in-app notifications for assignments and urgent/high items
- `isDmsAiReviewEnabled()` — feature flag check

**Server Actions:** `src/server/actions/dms/review-queue.ts`
- `getDmsReviewQueueItems(filters)`, `getDmsReviewQueueCounts()`, `getDmsReviewQueueItem(id)`
- `assignDmsReviewQueueItem`, `startDmsReviewQueueItem`, `resolveDmsReviewQueueItem`, `dismissDmsReviewQueueItem`
- `bulkAssignDmsReviewQueueItems`, `bulkDismissDmsReviewQueueItems`
- `rebuildDmsReviewQueue(scope)`, `supersedeDmsReviewQueueItems(keyPrefix)`

**Generation Hooks (non-fatal, try/catch):**
- `src/server/actions/dms/ai-intake.ts` — creates `intake_classification_review` when classification confidence < 60%
- `src/server/actions/dms/ai-analysis.ts` — creates `ai_analysis_metadata_review` for low-confidence AI results
- `src/server/actions/dms/ocr.ts` — creates `ocr_failure_review` in `markOcrFailed()`
- `src/lib/dms/ai-jobs/job-runner.ts` — creates `semantic_index_review` or `ai_job_failure_review` for permanent job failures

**UI:** `src/app/(protected)/dms/review-queue/page.tsx` + 5 feature components in `src/features/dms/review-queue/`
- Dashboard cards, filters, table, item drawer with assign/start/resolve/dismiss controls
- Blocked page with instructions when `DMS_AI_REVIEW=false`

**Navigation:**
- Sidebar: "Review Queue" added to Documents section with `ListChecks` icon
- Workspace registry: `/dms/review-queue` → `DMS_REVIEW_QUEUE`

**Feature Flag:** `DMS_AI_REVIEW=true` gates all Phase 12 behavior.

### Review Types
`intake_classification_review` | `intake_metadata_review` | `ai_analysis_metadata_review` | `ocr_failure_review` | `semantic_index_review` | `ai_job_failure_review`

### Status Workflow
`open` → `assigned` → `in_review` → `resolved` / `dismissed` / `superseded` / `cancelled`

### Implementation Report
`implementation_Review/ERP_DMS_AI_PHASE_12_REVIEW_QUEUE_ACTIVATION_IMPLEMENTATION_REPORT.md`


