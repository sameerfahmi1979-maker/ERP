# ALGT ERP — Source of Truth

**Document:** `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`  
**Last updated:** 2026-06-16 (ERP DMS.15 — Integration Readiness for HR, Fleet, Workshop, Projects, Finance, HSE)  
**Maintainer:** Update after **every** completed ERP phase  
**Last closed gate:** ERP DMS.15 (**CLOSED / PASS ✅ — Integration Readiness implemented. No DB migration required — existing dms_document_links table already supports all entity link patterns (entity_type text, entity_id bigint, soft-delete). NEW: src/lib/dms/dms-entity-types.ts — canonical entity type registry with 24 entity types (party, party_license, party_tax_registration, company, branch, bank, employee, employee_compliance, vehicle, equipment, fleet_asset, workshop_job, workshop_service, project, contract, site, invoice, payment, purchase_order, hse_incident, hse_permit, hse_training, hse_inspection, job_card); exports DMS_ENTITY_TYPES const, DMS_ENTITY_TYPE_LABELS, DMS_ENTITY_REQUIRED_DOCUMENT_HINTS (document type hints for 13 entity types), getDmsEntityTypeLabel(), isValidDmsEntityType(). dms-document-constants.ts now re-exports from canonical lib (100% backward compatible). src/server/actions/dms/entity-documents.ts extended: (a) getDmsDocumentsByEntity enhanced with AI-era fields (ai_summary, ai_risk_level, ai_risk_score, completeness_score) + confidentiality redaction for hr/legal/executive for non-admin; (b) linkDmsDocumentToEntity validation updated to 24-type enum; (c) new getDmsEntityDocumentComplianceSummary action returning totalDocuments/expiredDocuments/expiringSoonDocuments/missingRequiredDocuments/highRiskDocuments/criticalRiskDocuments/latestExpiryDate (missingRequiredDocuments always 0 in v1 — full enforcement deferred to module build time). NEW UI: src/features/dms/entity-documents/dms-entity-documents-tab.tsx (DmsEntityDocumentsTab — generic tab for any future module, props: entityType/entityId/entityLabel/canUpload/canLinkExisting/canUnlink/compact/showComplianceCards/onChildOpen; shows compliance cards, doc list with status/expiry/risk/AI badges, attach dialog, unlink, open-in-DMS); src/features/dms/entity-documents/dms-entity-document-compliance-cards.tsx (DmsEntityDocumentComplianceCards — 5 KPI cards: total/expired/expiring-soon/high-risk/critical-risk); src/features/dms/entity-documents/index.ts (public barrel). query-keys.ts: added dms.entityDocumentCompliance + dms.attachableDocuments. invalidation.ts: invalidateDmsEntityDocuments now also clears compliance+attachable caches. Party Master DMS tab: left unchanged (uses own party-dms-documents.ts actions which delegate to entity-documents.ts — backward compatible). Future modules should use DmsEntityDocumentsTab directly: import { DmsEntityDocumentsTab } from "@/features/dms/entity-documents". Upload-for-entity opens /dms/inbox with ?entityType=&entityId= params. TS PASS (0 errors). Build PASS. Report: implementation_Review/ERP_DMS_15_INTEGRATION_READINESS_IMPLEMENTATION_REPORT.md. Next: ERP 003 HR Module (can use DmsEntityDocumentsTab immediately) or DMS.16 upload-for-entity deep integration.**) — Previous: ERP DMS.14 (**CLOSED / PASS ✅ — Security, RLS, Confidentiality, and Permission QA complete. Roadmap renumbered: original DMS.13 Security QA → now DMS.14; original DMS.14 Integration Readiness → now DMS.15. 25 DMS tables audited. 4 critical overly-broad RLS policies fixed (dms_expiry_reminders: removed blanket authenticated ALL policy; dms_intake_review_values: replaced ALL true/true + enabled FORCE RLS + added owner-scoped policies; dms_notification_queue: replaced ALL true/true with viewer/admin-scoped policies; dms_renewal_requests: replaced ALL true/true with CRUD-scoped policies). Code fix: getDmsAiProvider() and getDmsEmbeddingProvider() switched to createAdminClient() so all DMS AI features work for users without settings.ai.view. All DMS server action files audited: getAuthContext+hasPermission present in all mutating actions; no sensitive content (OCR text, content_text, AI prompts, raw responses, API keys) in any logs; admin client gated after permission checks; revalidatePath used. Confidentiality gates verified for hr/legal/executive across AI summary, Ask AI, AI analysis, document QA, semantic search. Both storage buckets confirmed private (public=false, 50MB limit, 9 MIME types). Signed URLs require permission before generation. Admin tools require dms.admin. TS PASS (0 errors). Build PASS. Report: implementation_Review/ERP_DMS_14_SECURITY_RLS_CONFIDENTIALITY_PERMISSION_QA_IMPLEMENTATION_REPORT.md. Next: ERP DMS.15 — Integration Readiness for HR, Fleet, Workshop, Projects, Finance, HSE.**) — Previous: ERP DMS OCR-AI FIX.1 (**CLOSED / PASS ✅ — OCR / AI Text Pipeline Deep Fix implemented. No DB migration — code-only fix across 8 files. Root causes fixed: (RC-1) stale Turbopack cache cleared + server restarted; (RC-2) MAX_TOKENS raised 6,000→16,000 in `openai-dms-adapter.ts` so long scanned/bilingual transcriptions fit in AI output; (RC-3) `result-validator.ts` now regex-salvages `full_text_transcription` from truncated/malformed JSON before discarding (builds partial DmsAiOutput with transcription intact); (RC-4) `ai-analysis.ts` file loop replaced — old bespoke `isPdf`/`extractPdfText` code removed, now uses `extractFileContent` for all types (digital PDF text layer, scanned PDF rendered images, images, DOCX, XLSX); (RC-5) new `src/lib/dms/ocr/persist-file-ocr-result.ts` helper (`persistFileOcrResult`) is the single source of truth for writing OCR results — updates `dms_document_files`, recomputes `dms_documents` OCR summary from all active file rows, and calls `writeDocumentContentTextSystem` for content sync; wired into `ocr.ts`, `ai-analysis.ts`, `ai-intake.ts`, `batch-intake.ts`; (RC-6) approval-time vision fallback added to `ai-intake.ts` and `batch-intake.ts` — when `raw_ocr_text` is null at approval time, downloads file, runs `extractFileContent` + GPT-4.1 vision, salvages transcription, persists via helper. New `adminBackfillMissingOcrText` action in `intelligence-admin.ts` (admin-only, dry-run, batch 1–50, resume from document ID, target specific document ID) + "OCR Backfill / Repair Missing Text" card on `/admin/dms/intelligence` UI. OCR section UI updated: buttons say "Run OCR (AI)" / "Re-run OCR (AI)"; amber warning banner when OCR status is complete but no text extracted; "View Text" only shown when `has_text = true`. Security: OCR text, content_text, AI prompts, raw AI responses, personal values never logged. RLS: no changes, all policies remain ENABLED+FORCED. DMS-2026-000013 (scanned Emirates ID PDF) repair: run admin backfill targeting document 13, OR click Re-run OCR (AI) on the OCR/Text tab. TS PASS (0 errors). Build PASS. Report: `implementation_Review/ERP_DMS_OCR_AI_FIX_1_TEXT_PIPELINE_DEEP_FIX_IMPLEMENTATION_REPORT.md`. Next: DMS Real-Document UAT → DMS 13 (Original) Security/RLS/Confidentiality QA → DMS 14 — Integration Readiness for HR, Fleet, Workshop, Projects, Finance, HSE.**) — Previous: ERP DMS 13 (**CLOSED / PASS ✅ — Multi-File Batch Upload → Draft Intake Queue implemented. Governance: ONE-BY-ONE APPROVAL ONLY — no bulk approve, no approve-selected, no approve-all, no confidence-based auto-approval (verified by code search; no approval action accepts arrays). Migration `20260615120000_erp_dms_13_batch_upload_intake` applied to live DB: new table `dms_upload_batches` (BIGINT identity PK, `batch_code` UNIQUE, status CHECK processing/ready_for_review/partially_approved/completed/cancelled, total/processed/approved/failed counts with >=0 CHECKs, entity_type/entity_id, created_by FK, soft-delete) with RLS ENABLED+FORCED and 3 ownership-scoped policies (insert: dms.documents.upload|dms.admin|system_admin; select/update: created_by = current_user_profile_id() OR dms.admin OR system_admin — NOT every dms.documents.view user); `dms_upload_sessions.batch_id` nullable FK (ON DELETE SET NULL) + partial index; feature flag `DMS_BATCH_INTAKE` (enabled, requires_human_review). No change to `dms_documents.status` (no CHECK exists; `pending_ai_review` storable). No pgvector/semantic changes. New server actions `src/server/actions/dms/batch-intake.ts`: `createDmsUploadBatch` (max 10 files; reuses createDmsUploadSession dedupe+signed-URL per file, tags batch_id), `startAiIntakeAndCreateDraft` (one file — reuses proven `startAiIntakeFromUploadSession` for OCR+AI then creates ONE pending_ai_review draft doc with AI core fields, links session, stores field suggestions in dms_intake_review_values, file stays in dms-temp until approval; per-file failure isolated, bumps batch counts), `finalizeDraftIntake` (approves EXACTLY ONE draft — Zod .refine() accepts exactly one of uploadSessionId/documentId, NEVER arrays; promotes draft→active, copies dms-temp→dms-documents + version v1 + file row + content text idempotently, writes approved metadata/tags/links/reminders, marks AI accepted + session approved, idempotent), `discardDraftIntake` (one draft — soft-delete doc+files+versions+storage purge per approved DMS delete standard, same as deleteDmsDocument), `rerunBatchDraftAi` (wraps retryAiIntake, audits dms_batch_ai_rerun), `getNextPendingDraftInBatch` (returns next pending, approves nothing), `getDmsUploadBatch`/`getDmsUploadBatchDrafts` (RLS-scoped reads), `isDmsBatchIntakeEnabled`. UI: multi-file dropzone (`multiple`/`onFilesSelected`/`maxFiles`, per-file remove — single-file mode preserved), inbox Single/Batch toggle (flag-gated) + client-orchestrated sequential batch state machine (create→upload each→draft each→navigate) + `DmsBatchUploadProgress`, Batch Review Queue route `/dms/inbox/batch/[batchCode]` + `DmsBatchReviewQueueClient` (6 count cards, per-row Review&Approve/Re-run AI/Discard, Review Next Pending Draft + Refresh, NO bulk approval), intake `Approve & Save`/`Discard` branch to finalizeDraftIntake/discardDraftIntake when session.document_id set (batch) else existing single-file actions, `pending_ai_review` renders violet "AI Draft" badge. Route registry: `/dms/inbox/batch/[batchCode]` (record tab, entityType dms_upload_batch). Query keys: dms.uploadBatch/uploadBatchDrafts/batchUploadProgress. DMS_MAX_BATCH_FILES=10 in dms-upload-constants. Security: no OCR/AI prompt/content/personal values/file content/API keys logged — only safe metadata + audit events (dms_batch_created/draft_created/draft_failed/draft_approved/draft_discarded/ai_rerun). Single-file flow untouched & verified. Known limitation: draft must carry a type/category at creation (NOT NULL) — AI-suggested type used, else first active type placeholder corrected during mandatory individual review. TS PASS (0 errors). Build PASS (route present). Report: `implementation_Review/ERP_DMS_13_MULTI_FILE_BATCH_UPLOAD_TO_DRAFT_INTAKE_IMPLEMENTATION_REPORT.md`. POST-UAT ADDENDUM (same phase): (1) bug fix — multi-file dropzone called parent `onFilesSelected` inside a `setSelectedFiles` updater (setState-in-render); now computed via `selectedFilesRef` outside the updater. (2) Batches no longer lost — new RLS-scoped `listDmsUploadBatches` (live pending/approved/discarded/failed counts) + new list route `/dms/inbox/batches` (`dms-batch-list-client`) + sidebar "Batch Intake" entry + DMS dashboard quick-link + route-registry list entry (no collision with `/dms/inbox/batch/[batchCode]`). (3) Multi-select DISCARD-ONLY in Batch Review Queue — per-row + select-all-discardable checkboxes + "Discard Selected (N)" with confirm, backed by new `discardDraftIntakeBulk` (max 50; shared `performDraftDiscard` helper; per DMS delete standard; recompute per affected batch). STILL no bulk/selected/all approval — approval remains strictly one-by-one. RLS re-verified live (ENABLED+FORCED, owner-scoped select/update, permissioned insert). TS+build PASS (both batches + batch routes present). Next: DMS 13 interactive UAT (enable flag for admin/UAT user, upload a multi-file batch, approve each draft one-by-one), or next approved DMS/ERP phase.**) — Previous: ERP DMS 12.5 (**CLOSED / PASS ✅ — Semantic Search / pgvector / Embeddings implemented (additive — existing Quick/Safe/Content/AI search modes untouched). pgvector extension `vector` v0.8.0 enabled on live DB via migration `20260615100000_erp_dms_12_5_semantic_search_pgvector`. `dms_documents` gains `summary_embedding vector(1536)`, `summary_embedding_model`, `summary_embedding_status` (pending/complete/failed/skipped/not_required CHECK), `summary_embedding_updated_at`, `summary_embedding_error`, `summary_embedding_source` (ai_summary/content_text CHECK). HNSW cosine index `idx_dms_documents_summary_embedding` (chosen over ivfflat — builds on empty/tiny tables, no training rows). RPC `search_dms_documents_by_embedding(p_query_embedding, p_match_count, p_match_threshold, p_is_admin, p_exclude_document_id)` is SECURITY INVOKER (RLS enforced), never returns content_text, applies hr/legal/executive confidentiality filter, caps results 1–50. Feature flag `DMS_SEMANTIC_SEARCH` (enabled). AI provider abstraction extended: `DmsEmbeddingOutput` type + `embedText(input, {model?})` on `IDmsAiProvider`; `OpenAiDmsAdapter.embedText` (fetch-native `/embeddings`, default `text-embedding-3-small`/1536 dims, 30s timeout, never logs input); `NoopDmsAiProvider.embedText` throws "DMS embedding provider is not configured."; new `getDmsEmbeddingProvider()` factory selects `DEFAULT_EMBEDDING` config (falls back to `DEFAULT_CHAT` creds but always uses a real embedding model). New server actions `src/server/actions/dms/semantic-search.ts`: `getDmsDocumentEmbeddingStatus`, `generateDmsDocumentEmbedding` (skip-if-complete; hr/legal/executive require dms.admin), `regenerateDmsDocumentEmbedding` (force), `bulkGenerateMissingDmsEmbeddings` (dms.admin, batch 1–50/default 20, resume, dryRun), `semanticSearchDmsDocuments` (dms.documents.view, embeds query, RPC search, max 25, similarity %), `findSimilarDmsDocuments` (max 10, excludes same doc, confidential source requires dms.admin). Embedding source rule: ai_summary (if complete) else content_text first 8,000 chars else status=skipped. Logging `erp_ai_usage_logs` (feature_area DMS_SEMANTIC_SEARCH; operations embedding_generate/regenerate/bulk_generate/semantic_search/find_similar_documents; counts/model/duration only — never source text, query text, or vectors) + safe `logAudit` events (dms_embedding_generated/regenerated, dms_embeddings_bulk_generated, dms_semantic_search_used, dms_similar_documents_searched). UI: documents table gains "Semantic Search" mode (Compass icon, sky theme, helper text, result cards with similarity % badge, AI summary snippet, risk/completeness/expiry — no raw content); new "Semantic" tab in document record (`DmsDocumentSemanticSection` — embedding status badge, source/model/updated, Generate/Regenerate buttons gated by dms.documents.ai.run|dms.admin, Find Similar Documents panel); Intelligence Admin page gains 3 embedding health cards (with/missing/failed) + Semantic Embedding Bulk Generation card (AI-cost warning, batch/resume/dry-run) + 12.4A/12.5 phase badges. Vector storage/RPC use pgvector text-literal casting. Query key `dms.documentEmbedding(documentId)` added. RPC smoke-tested live (0 rows — no docs embedded yet; only 1 soft-deleted doc exists). TS PASS (0 errors). Build PASS. Report: `implementation_Review/ERP_DMS_12_5_SEMANTIC_SEARCH_PGVECTOR_IMPLEMENTATION_REPORT.md`. Next: real-document UAT (generate embeddings via admin bulk, then test semantic + find-similar), or ERP DMS 13 — Multi-File Batch Upload (planning done, awaiting approval).**) — Previous: ERP ADMIN UI — Permissions & Role Matrix UI/UX Enhancement (**CLOSED / PASS ✅ — Draft permission matrix, revoke/undo support, review-before-save functionality, and critical permission warnings implemented. New `bulkUpdateRolePermissions` server action for deltas, validated by Zod and logs a consolidated audit event. `PermissionsMatrix` rewritten with local draft vs original state. New UI components: `PermissionsMatrixToolbar` (search/filter), `PermissionsMatrixReviewDialog` (grouped change review with critical warnings), `PermissionsMatrixFooter` (sticky action bar). TS PASS. Build PASS. Report: `implementation_Review/ERP_ADMIN_PERMISSION_ROLE_MATRIX_UIUX_ENHANCEMENT_IMPLEMENTATION_REPORT.md`.**) — Previous: ERP DMS 12.4A (**CLOSED / PASS ✅ — QA / Polish / Admin Tools for DMS AI Content Intelligence implemented. No DB migration required. New `getDmsIntelligenceAdminStats()` server action in `intelligence-admin.ts` returns 10 aggregate health counts (total docs, with/missing extracted text, with/missing AI summary, with completeness score, high/critical risk, pending tag/link suggestions) — uses `createAdminClient()` for aggregate counts only, never document content, requires `dms.admin`. New route `/admin/dms/intelligence` (server page, redirects non-admin to `/admin/dms`). New `DmsIntelligenceAdminPageClient` client component with: (a) 10 health stat cards with color-coded icons and warn flags; (b) Content Text Backfill card (calls `adminBackfillDmsContentText`, batch 1–100/default 50, resume ID, dry run, inline result panel showing processed/skipped/errors/next resume ID); (c) AI Summary Bulk Generation card (calls `bulkGenerateMissingSummaries`, batch 1–50/default 20, resume ID, dry run, AI-cost amber warning banner, inline result panel showing processed/skipped/failed/errors/next resume ID); (d) Intelligence Bulk Evaluation card (calls `bulkEvaluateDmsDocuments`, batch 1–100/default 50, resume ID, dry run, no AI cost, inline result panel); (e) DMS Phase Status confirmation panel showing all 4 closed AI phases as green badges. Navigation: "AI Intelligence" link added to DMS Admin section in `app-sidebar.tsx` (using existing `Brain` icon); "AI Intelligence Admin" quick-link added to DMS Overview quick management panel. Search UX polished: added contextual helper text row below documents table toolbar explaining each search mode (Quick/Safe Search/Content Search/AI Search) — visible only when non-auto mode is selected. Smart link party matching improved in `ai-links.ts` (LINK_PROMPT_VERSION bumped to v1.1): extracts words ≥4 chars from document title + AI summary + content snippet (up to 12 terms), runs `ilike` multi-term filter against `parties.display_name` to find name-matched candidates (up to 15), fills remaining slots (up to 30 total) with recently-updated parties; content snippet load reordered to occur before party matching. Content snippets for content-mode search deferred as known limitation (requires `ts_headline()` RPC). TypeScript errors fixed: duplicate `ErrorEntry` type removed; import path corrected from `@/lib/supabase/server-admin` to `@/lib/supabase/admin`. TS PASS (0 errors). Build PASS. Report: `implementation_Review/ERP_DMS_12_4A_QA_POLISH_ADMIN_TOOLS_IMPLEMENTATION_REPORT.md`. Next: DMS Real-Document UAT or ERP DMS 12.5 — pgvector/Semantic Search (Future Optional).**) — Previous: ERP DMS 12.4 (**CLOSED / PASS ✅ — AI document intelligence implemented. Migration `20260615080000` creates `dms_ai_tag_suggestions` and `dms_ai_link_suggestions` tables (RLS enabled+forced, status: pending/accepted/rejected/superseded) — applied to live DB. Extended `IDmsAiProvider` with `callStructuredCompletion(systemPrompt, userMessage, opts)` returning `DmsStructuredCompletionOutput` (raw JSON + usage). `OpenAiDmsAdapter` implements it with fetch-native, `json_object` response format, 30s timeout. `NoopDmsAiProvider` has no-op stub. New types in `types.ts`: `DmsSearchIntent`, `DmsAiSearchResult`, `DmsDocumentQuestionAnswer`, `DmsTagSuggestion`, `DmsLinkSuggestion`, `DmsStructuredCompletionOutput`. New server action files: `ai-search.ts` (`extractDmsSearchIntent` — intent extraction from question via AI → `DmsSearchIntent` JSON validated with Zod; `searchDmsDocumentsByIntent` — maps intent to DB filters: type/category ID lookup, FTS on content_tsv, expiry_state/date/risk filters, excludes confidential docs for non-admin, max 25 results with matchReason; `askDmsDocumentsQuestion` — combines extract+search, returns intent + results, no hallucinated narrative); `document-qa.ts` (`askDmsDocumentQuestion` — loads doc + content_text capped at 8000 chars + ai_summary capped at 1000 chars, requires `dms.admin` for hr/legal/executive, returns { answer, confidence, sourceUsed }); `ai-tags.ts` (`suggestDmsDocumentTags` — AI suggests tags from available `dms_tags` list, supersedes old pending, stores new pending in `dms_ai_tag_suggestions`; `getDmsTagSuggestions`; `applyDmsTagSuggestions` — writes to `dms_document_tags`, marks accepted; `rejectDmsTagSuggestions` — marks rejected, no tag write); `ai-links.ts` (`suggestDmsDocumentLinks` — AI suggests party links from top 30 active parties, stores pending in `dms_ai_link_suggestions`; `getDmsLinkSuggestions`; `applyDmsLinkSuggestions` — writes to `dms_document_links`, marks accepted; `rejectDmsLinkSuggestions` — marks rejected, no link write). Feature flags: DMS_AI_SEARCH + DMS_CROSS_DOC_SEARCH + DMS_DOCUMENT_QA + DMS_AUTO_TAGS + DMS_SMART_LINKS (all confirmed enabled). UI: documents table updated with search mode selector (Auto/Quick/Safe Search/Content Search/AI Search), AI search question input, AI results card panel (matchReason, risk badge, completeness, expiry, summary snippet), collapsible intent panel. Tags section updated: AI Tag Suggestions subsection with Suggest Tags button, pending suggestion list, confidence badges, Accept/Reject per suggestion. Links section updated: AI Link Suggestions subsection with Suggest Links button, pending suggestion list, entity type badge, Accept/Reject. New `DmsDocumentAskAiSection` component (Ask AI tab in document record — textarea, Ask button, answer card with confidence/source badges, confidentiality lock for non-admin). Ask AI tab added to record form between Intelligence and AI Analysis. Query keys added: aiSearch, documentQa, documentTagSuggestions, documentLinkSuggestions. Confidentiality: content_text never returned in list/search; hr/legal/executive require dms.admin for Ask AI; content search excludes confidential for non-admin; prompts/question text/content/answers never logged. createAdminClient() not used. No pgvector/embeddings. Tags/links never auto-applied. TS PASS (0 errors). Build PASS. Report: `implementation_Review/ERP_DMS_12_4_AI_SEARCH_ASK_AI_AUTO_TAGS_SMART_LINKS_IMPLEMENTATION_REPORT.md`. Next: ERP DMS 12.5 — Semantic Search / pgvector (Future Optional — requires Sameer/Dina approval).**) — Previous: ERP DMS 12.3 (**CLOSED / PASS ✅ — Completeness and risk scoring implemented (deterministic, no AI). Migration `20260615070000` adds 3 partial indexes on `dms_documents` (completeness_score, ai_risk_score, ai_risk_level) — applied to live DB. New files: `ai-completeness.ts` (`evaluateDmsDocumentCompleteness` — scores required metadata ratio ×0.80 + issue_date +0.05 + expiry_date if requires_expiry_tracking +0.05 + content_text +0.05 + ai_summary complete +0.05; stores `completeness_score`, `missing_fields_json`; `getDmsDocumentCompletenessStatus` read); `ai-risk.ts` (`evaluateDmsDocumentRisk` — expired +0.40, expiring ≤30d +0.25, missing expiry when required +0.20, no issue_date +0.10, missing required metadata max +0.15, classification_score <0.5 +0.15, content truncated +0.05, confidential no owner +0.15, completeness <0.5 +0.15 capped at 1.0; 5 risk levels: none/low/medium/high/critical; stores ai_risk_score/ai_risk_level/ai_risk_reasons_json/ai_risk_updated_at; `getDmsDocumentRiskStatus` read); `ai-intelligence.ts` (`evaluateDmsDocumentIntelligence` combined; `bulkEvaluateDmsDocuments` admin-only batch 50/max 100, resumable, dryRun). Feature flags: DMS_COMPLETENESS + DMS_RISK_SCORE both checked. `getDmsDocuments()` enhanced: added `DmsSearchMode` type (`quick`/`safe_fts`/`content`); content mode queries `dms_document_content` FTS, returns doc IDs only, excludes confidential for non-admin; new filters: riskLevel, completenessMin/Max, hasMissingFields, hasAiSummary, hasExtractedText, expiryState. UI: new `DmsDocumentIntelligenceSection` (Intelligence tab in document record between AI Summary and AI Analysis; two-card layout — completeness progress bar + missing field badges; risk progress bar + reason list with per-factor scores; combined Evaluate Document Intelligence button). New `DmsRiskBadge` component. Documents table updated: risk badge inline in title cell; AI summary secondary line shown. content_text never returned in list/search. createAdminClient() not used. No AI calls. TS PASS (0 errors). Build PASS. Report: `implementation_Review/ERP_DMS_12_3_COMPLETENESS_RISK_ENHANCED_SEARCH_IMPLEMENTATION_REPORT.md`. Next: ERP DMS 12.4 — AI Search, Ask AI, Auto Tags, Smart Links.**) — Previous: ERP DMS 12.2 (**CLOSED / PASS ✅ — AI Document Summary implemented. No migration required — all `ai_summary*` columns + `content_tsv` confirmed present from Phase 12.1 migration. Extended `IDmsAiProvider` interface (`types.ts`) with `summarize(systemPrompt, userMessage): Promise<DmsSummaryOutput>`. Implemented `summarize()` on `OpenAiDmsAdapter` (fetch-native, no SDK, 45s timeout, 800 max tokens, plain text response). Added no-op to `NoopDmsAiProvider` (factory.ts). New file `src/server/actions/dms/ai-summary.ts` with: `getDmsAiSummaryStatus(documentId)` — lightweight load of summary fields, redacts for confidential non-admin; `generateAndSaveDmsAiSummary(documentId)` — requires `dms.documents.ai.run` OR `dms.admin`, skips if already complete; `regenerateDmsAiSummary(documentId)` — force overwrites; `bulkGenerateMissingSummaries(input)` — admin-only, batch 20/max 50, dryRun, resumable. Feature flag: `DMS_AI_SUMMARY` checked in all generate/regenerate/bulk actions. Confidentiality gate: `hr`, `legal`, `executive` documents require `dms.admin` for generation — checked server-side. Summary stored on `dms_documents.ai_summary`; `content_tsv` auto-updates via existing `trg_dms_documents_content_tsv` DB trigger. Input cap: 20,000 characters (`ai_summary_input_truncated = true` if exceeded). Summary prompt: `SUMMARY_PROMPT_VERSION = "v1.0"`, plain English 3-5 sentences, no markdown/JSON. Logging: `erp_ai_usage_logs` (model, tokens, duration, prompt_version) + `logAudit()` — content_text/prompts/full AI response never logged. New UI: `DmsDocumentAiSummarySection` — status badge (pending/complete/failed/skipped/not_required), summary text, timestamp, model, truncated warning, Generate/Regenerate buttons, restricted message for non-admin confidential, AI disclaimer. New `ai-summary` tab added to document record form between Extracted Text and AI Analysis. Query key: `dms.documentAiSummary(documentId)`. No auto-trigger on intake/OCR (deferred — synchronous AI call would slow intake approval). No admin bulk UI (deferred). No summary history. `createAdminClient()` NOT used. TS PASS (0 errors). Build PASS. Report: `implementation_Review/ERP_DMS_12_2_AI_DOCUMENT_SUMMARY_IMPLEMENTATION_REPORT.md`. Next: ERP DMS 12.3 — Completeness, Risk, Enhanced Search.**) — Previous: ERP DMS 12.1 (**CLOSED / PASS ✅ — Content text foundation implemented. Migration (20260615060000) creates `dms_document_content` table (RLS enabled+forced, `content_text` capped at 100,000 chars, SHA-256, `is_truncated`, `content_text_source` CHECK, GIN FTS index). Adds placeholder columns to `dms_documents`: `content_tsv` (TSVECTOR, populated by DB trigger `trg_dms_documents_content_tsv` on INSERT/UPDATE of doc_no/title/description/ai_summary using `simple` config); `ai_summary*` columns (Phase 12.2 placeholders); `completeness_score`, `ai_risk_score`, `ai_risk_level` columns (Phase 12.3 placeholders — all with CHECK constraints). Backfills `content_tsv` for all existing non-deleted documents. Inserts 11 Phase 12 AI feature flags with ON CONFLICT DO NOTHING (`DMS_CONTENT_TEXT_SYNC` enabled=true, rest inserted for future phases). New server-only helper: `src/lib/dms/content-text.ts` (normalize, cap, sha256, file separator). New server actions file: `src/server/actions/dms/document-content.ts` (`writeDocumentContentTextSystem` — internal helper gated by DMS_CONTENT_TEXT_SYNC flag; `updateDocumentContentText`; `resyncDocumentContentText`; `getDocumentContentText` — confidentiality gate for hr/legal/executive requires dms.admin; `adminBackfillDmsContentText` — batch 50/max 100, resumable, dryRun support). Modified `ai-intake.ts`: after AI result acceptance in `approveAiIntakeAndCreateDocument`, loads `raw_ocr_text` from `dms_ai_extraction_results` and calls `writeDocumentContentTextSystem` with `source=ai_intake` (non-fatal). Modified `ocr.ts`: after OCR succeeds in `triggerDmsOcrForFile`, consolidates all current-version file OCR text and calls `writeDocumentContentTextSystem` with `source=ocr` (non-fatal). Modified `documents.ts`: extended `DmsDocumentRow` type with Phase 12.1 columns; upgraded search — short queries/codes use ILIKE, long queries (>3 words) use `content_tsv` FTS with `plainto_tsquery('simple',...)`; added `ai_summary` redaction for hr/legal/executive documents for non-admin users. Query key added: `dms.documentContent(documentId)`. New UI component: `DmsDocumentContentSection` (read-only extracted text card — source badge, char count, truncated warning, info note, monospace textarea, resync button). New "Extracted Text" tab added to document record form between OCR and AI Analysis tabs. content_tsv never contains raw OCR text. content_text never returned in list queries. `createAdminClient()` not used for user-facing reads. TS PASS (0 errors). Build PASS. Report: `implementation_Review/ERP_DMS_12_1_CONTENT_TEXT_FOUNDATION_AND_FULL_TEXT_SEARCH_IMPLEMENTATION_REPORT.md`. Next: ERP DMS 12.2 — AI Document Summary.**) — Previous: ERP DMS 12.0 (**CLOSED / PASS ✅ — Bug fix only. Bug 1: Document number `[object Object]` fixed in two files — `src/server/actions/dms/ai-intake.ts` and `src/server/actions/dms/document-upload-attach.ts` both called `String(docNoData)` on the raw RPC array instead of extracting `docNoRows[0].generated_reference_number`; both patched with safe guard (returns error if RPC returns empty/null). Bug 2: Metadata section empty confirmed NOT a code bug — document type 39 "Offshore / Onshore medical Report" has zero metadata definitions in `dms_metadata_definitions`; empty-state UI improved with icon + clearer admin guidance. Build fix: `next.config.ts` updated with `serverExternalPackages: ["@napi-rs/canvas", "pdf-parse", "sharp", "mammoth", "xlsx"]` to prevent Turbopack from attempting to bundle native binaries. DB check: no `[object Object]` rows in `dms_documents` found. RLS: correct, no changes. TS PASS (0 errors). Build PASS. Cleanup SQL in `implementation_Review/sql_review/ERP_DMS_12_0_PROPOSED_DOCUMENT_NO_CLEANUP.sql` — review only, not executed. Report: `implementation_Review/ERP_DMS_12_0_PRE_ENHANCEMENT_BUG_FIX_IMPLEMENTATION_REPORT.md`. Next: ERP DMS 12.1 — content_text column + full-text search (requires Sameer/Dina plan approval).**) — Previous: ERP DMS.11 (**CLOSED / PASS ✅ — Option A AI-First Upload-Session Intake fully implemented. DB migration (20260615040000) extends `dms_upload_sessions` with `document_id, ai_job_id, ai_result_id, intake_status, review_status, review_started_at, review_completed_at, reviewed_by, discarded_at, discard_reason`; extends `dms_ai_extraction_jobs` + `dms_ai_extraction_results` with `upload_session_id`; creates `dms_intake_review_values` (field-level draft persistence for review screen). New server actions file: `src/server/actions/dms/ai-intake.ts` with `startAiIntakeFromUploadSession` (synchronous OCR+AI on dms-temp file, stores result with upload_session_id, no document created), `getAiIntakeSession`, `getIntakeSessionSignedUrl`, `saveAiIntakeDraft`, `retryAiIntake`, `discardAiIntake`, `approveAiIntakeAndCreateDocument` (generates doc no, creates dms_documents, copies file dms-temp → dms-documents, creates version v1 + file record, saves metadata/tags/links, generates expiry reminders, marks AI result accepted, marks session approved). New route: `/dms/intake/[sessionCode]` (server component, redirects to final document if already approved). New feature folder `src/features/dms/intake/` with: `dms-ai-intake-page-client.tsx` (main page: header with status/confidence badges + actions, left panel with file info/AI summary/duplicate warning, right panel with editable review form, footer, discard dialog), `dms-ai-intake-review-form.tsx` (editable form: document type combobox, category derived from type, title, description, dates, confidentiality, ownership, dynamic metadata), `dms-ai-intake-field-row.tsx` (field row with confidence badge + source snippet tooltip + low-confidence highlight), `dms-ai-intake-metadata-section.tsx` (loads definitions from server on type change, renders typed inputs), `dms-ai-intake-status-badge.tsx` (11 status variants). Modified `dms-upload-inbox-page-client.tsx`: added "Upload & AI Fill" (violet primary) as first action button in ready banner, `ai_processing` upload phase with spinner, imports `startAiIntakeFromUploadSession`. Modified `dms-upload-session-table.tsx`: added `onAiFill` prop + "AI Fill" button (violet) as first action per row. Route registry: `/dms/intake/[sessionCode]` registered as `record` tab, `entityType: dms_intake_session`, pattern regex. TS PASS (0 errors). Build PASS. Manual fallback (Create Manually) preserved. AI provider not-configured handled gracefully. Report: `implementation_Review/ERP_DMS_11_OPTION_A_AI_FIRST_UPLOAD_SESSION_INTAKE_REVIEW_AND_CONFIRM_SAVE_IMPLEMENTATION_REPORT.md`. Next: ERP DMS.12 — Full-Text Search and Advanced Search.**) — Previous: ERP DMS.10A (**CLOSED / INVESTIGATION COMPLETE ✅ — Honest audit of current DMS workflow confirms it is metadata-first, not upload-first. Both current entry points (New Document form + Upload Inbox Create dialog) require manual title + document type BEFORE AI can run. AI only runs after document exists, in a separate tab, with no "apply to form" capability. Gap: user must manually copy AI suggestions. Recommendation: Option B — Draft Document First (lower risk, reuses DMS.4/5/9/10 infrastructure). DMS.11 revised scope: new `createDraftDocumentFromUpload` action (status=pending_ai_review, auto-title from filename), auto-trigger AI after draft creation, new AI Review mode in document record form (pre-populated fields + confidence badges + Approve & Save). Required DB: add `document_id` FK to `dms_upload_sessions`; add `pending_ai_review` status to `dms_documents` check constraint. New standard: `docs/standards/ERP_DMS_AI_FIRST_UPLOAD_TO_FILL_WORKFLOW_STANDARD.md`. New rule: `.cursor/rules/erp-dms-ai-first-upload-standard.mdc`. Report: `implementation_Review/ERP_DMS_10A_AI_FIRST_UPLOAD_TO_FILL_WORKFLOW_INVESTIGATION_AND_REDESIGN_REPORT.md`. No code implemented.**) — Previous: ERP DMS — Owning Fields Fix (**CLOSED / PASS ✅ — Migration (20260615030000) adds `party_id BIGINT NULL REFERENCES parties(id) ON DELETE SET NULL` + index to `dms_documents`. `DmsDocumentRow` type, `documentCreateSchema`, and `createDmsDocument` insert all extended with `party_id`. Overview section (`dms-document-overview-section.tsx`) replaces raw `<Input type="number">` fields for Owning Company and Owning Branch with `OwnerCompanySelect` (cascading) + `BranchSelect` (filters by selected company, clears on company change), and adds a new `Related Party` field using `PartySelect` with a descriptive label. Record form (`dms-document-record-form.tsx`) adds `owningCompanyId`, `owningBranchId`, `partyId` controlled state with `getDraftDefault` init, `writeDraftField` on change, and correct payload in `performSave`. TS PASS (0 errors). Next: ERP DMS.11 — AI Review Queue and Confirm-Save Workflow.**) — Previous: ERP DMS.10 (**CLOSED / PASS ✅ — Migration (20260615020000) adds run_source, input_text_hash, prompt_version to dms_ai_extraction_jobs; adds file_id, result_type, ai_status, field_confidence_json, classification_reason, suggested_title, suggested_description to dms_ai_extraction_results; 4 new permissions (dms.documents.ai.*). DMS AI abstraction: src/lib/dms/ai/types.ts (IDmsAiProvider, DmsAiOutput, DmsClassificationResult, DmsExtractionResult, DmsSuggestedLink, DmsAiInput, confidenceLabelFromScore), factory.ts (getDmsAiProvider — tries DEFAULT_DMS_CLASSIFIER / DEFAULT_DMS_EXTRACTOR / DEFAULT_CHAT, falls back to noop), openai-dms-adapter.ts (OpenAiDmsAdapter — fetch-native chat completions, no SDK, resolves API key from process.env[secretRef]), prompt-builders.ts (buildCombinedPrompt — single classify+extract prompt, 12k char OCR limit, PROMPT_VERSION=v1.0, hashOcrText), result-validator.ts (validateAiOutput — strips code fences, safe JSON parse, per-field confidence, expiry detection, type guard). Server actions: src/server/actions/dms/ai-analysis.ts (getDmsAiAnalysisStatus, getDmsAiExtractionResults, getDmsAiExtractionResult, runDmsAiAnalysisForDocument [classify_extract combined, checks confidentiality hr/legal/executive → requires dms.admin, OCR text required, creates job, calls provider, stores result, NEVER auto-saves metadata], retryDmsAiAnalysisJob, markDmsAiResultSuperseded). Security: OCR text NEVER logged, AI prompts NEVER logged, API keys NEVER returned, confidential docs blocked without dms.admin. AI output NEVER written to dms_document_metadata_values / dms_documents.document_type_id / dms_document_links. UI: DmsDocumentAiSection (AI Analysis tab in document record — status bar, Run AI Analysis button, AiResultCard with classification + confidence + suggested fields table + expiry + links + warnings, per-field confidence badges, Supersede + Retry, info notice re human review). DmsAiConfidenceBadge (high/medium/low/needs_manual_review). AI Analysis section added to document record form sections array. Query keys: documentAiStatus, documentAiResults, aiResult. Invalidation: invalidateDmsAiAnalysis. TS PASS (0 errors). Build PASS. No DMS.11 review workflow. No auto-save. Next: ERP DMS.11 — AI Review Queue and Confirm-Save Workflow.**) — Previous: ERP DMS.9 (**CLOSED / PASS ✅ — Migration adds OCR columns to dms_document_files (ocr_status, ocr_provider, ocr_model, ocr_started_at, ocr_completed_at, ocr_error_message, ocr_confidence, ocr_page_count, ocr_language) and dms_documents (ocr_last_run_at, ocr_text_available), file_id FK on dms_ai_extraction_jobs, 5 new permissions (dms.documents.ocr.*). OCR provider abstraction: src/lib/dms/ocr/types.ts (IOcrProvider, OcrResult, OcrStatus, OcrInput), factory.ts (getOcrProvider, isOcrSupported), pdf-text-provider.ts (uses pdf-parse v2 for PDF text-layer extraction), noop-provider.ts (returns provider_not_configured). Server actions: src/server/actions/dms/ocr.ts (getDmsOcrStatus, getDmsFileOcrText, getDmsDocumentOcrText, triggerDmsOcrForFile [synchronous, creates job record, downloads from storage via admin client, extracts text, saves to dms_document_files.ocr_text, updates document-level ocr_status], triggerDmsOcrForDocument, retryDmsOcrJob, getDmsOcrJobs, markDmsOcrSkipped). OCR text NEVER logged in audit. UI: DmsDocumentFilesSection updated with OCR status badge per file + Run OCR button (canTriggerOcr prop); new DmsDocumentOcrSection (OCR/Text tab in document record with per-file table, View Text modal, Run OCR + Re-run buttons, Recent Jobs table with Retry, info note about AI deferral). DmsOcrStatusBadge component with 9 status variants. OCR section added to document record form sections array. DmsDocumentFileRow extended with all OCR fields. Query keys: documentOcrStatus, fileOcrText, documentOcrText, ocrJobs. Invalidation: invalidateDmsOcr, invalidateDmsFileOcr. pdf-parse@2.4.5 installed (pure JS, no native). No AI classification. No OpenAI called. TS PASS. Build PASS. Next: ERP DMS.10 — AI Document Classification and Extraction Provider Abstraction.**) — Previous: ERP DMS.8A (**CLOSED / PASS ✅ — DB migration adds bridge tracking columns to dms_notification_queue (global_notification_id, global_email_queue_id, bridge_status, bridge_attempt_count, bridged_at, last_bridge_error, email_delivery_status, email_sent_at) with unique partial indexes for idempotency. Enables DMS_EXPIRY_EMAILS feature flag (true). Server actions: src/server/actions/dms/dms-email-bridge.ts (getDmsEmailBridgeStatus, bridgeDmsNotificationToGlobal [idempotent], bridgeDueDmsNotificationsToGlobal, queueDmsNotificationEmail, queueDueDmsExpiryEmails, processDmsExpiryEmailQueue [delegates to global], retryDmsNotificationBridge, markDmsNotificationEmailSkipped, syncDmsEmailDeliveryStatus). Template rendering via renderNotificationTemplate(). Recipient resolution: recipient_user_id → user_profiles.email → document.owner.email. Feature flag DMS_EXPIRY_EMAILS gates email queue creation. Updated DmsNotificationRow type + NOTIFICATION_SELECT query to include bridge fields. DmsNotificationsFilter adds bridgeStatus. UI: DmsNotificationsPageClient has Bridge to Global + Send Emails buttons + Not Bridged tab; DmsNotificationsTable shows bridge status badge + per-row bridge button; DmsExpiryDashboardPageClient adds Bridge Notifications + Send Emails buttons. DMS local dms_notification_queue NOT deleted. TS PASS. Build PASS. Next: ERP DMS.9 — OCR Pipeline Foundation.**) — Previous: ERP NOTIFICATIONS.1 (**CLOSED / PASS ✅ — DB migration creates erp_notifications (in-app + email notification center, RLS forced), erp_email_queue (global outbound email queue with retry/backoff, RLS forced), erp_notification_templates (reusable templates with {{variable}} rendering, RLS forced), erp_notification_delivery_logs (append-only log, RLS forced). Seeds 10 permissions (notifications.*), 3 templates (DMS_EXPIRY_REMINDER, DMS_DOCUMENT_EXPIRED, SYSTEM_TEST_EMAIL). Server actions: notifications/notifications.ts (getMyNotifications, getAllNotifications, getUnreadNotificationCount, createNotification, markNotificationRead, markAllMyNotificationsRead, dismissNotification, archiveNotification), notifications/email-queue.ts (queueEmail, getEmailQueue, processEmailQueueItem, processEmailQueue, retryEmailQueueItem, cancelEmailQueueItem), notifications/templates.ts (getNotificationTemplates, getNotificationTemplate, createNotificationTemplate, updateNotificationTemplate, activateNotificationTemplate, deactivateNotificationTemplate, renderNotificationTemplate), notifications/delivery-logs.ts (getNotificationDeliveryLogs). DMS bridge: notifications/bridges/dms-notification-bridge.ts (bridgeDmsNotificationToGlobalNotification, bridgeDueDmsNotifications — admin-manual only, for DMS.8A). Email queue processing: uses getDefaultEmailProvider() from SETTINGS.2 abstraction; exponential backoff (5min/30min/2hr). Template renderer: safe {{variable}} substitution, no eval. UI: /notifications (user's own), /admin/notifications (all), /admin/notifications/email-queue (processing panel + table), /admin/notifications/templates (CRUD), /admin/notifications/logs. Sidebar: Notifications in Overview + 4 admin items. Route registry: 5 new routes. Query keys: notifications.my/unreadCount/all/emailQueue/templates/deliveryLogs. Invalidation: invalidateMyNotifications/invalidateUnreadNotifications/invalidateEmailQueue/invalidateNotificationTemplates/invalidateNotificationLogs. Header badge: deferred (no header component found). DMS local queue untouched. TS PASS. Build PASS. Next: ERP DMS.8A — Connect DMS Expiry Notifications to Global Email Delivery.**) — Previous: ERP SETTINGS.2 (**CLOSED / PASS ✅ — DB migration creates erp_email_provider_configs (secret_ref/masked_secret_preview only, no plain secret), erp_email_send_logs, erp_email_feature_flags; seeds M365_DEFAULT + NOTIFICATIONS_DEFAULT providers (disabled), 7 feature flags (all off except SYSTEM_TEST_EMAIL), 6 permissions (settings.email.*). Provider abstraction: src/lib/email/providers/types.ts + factory.ts + microsoft-graph-provider.ts (client_credentials flow, fetch-native, no SDK). Server actions: email-settings.ts. UI: src/features/settings/email/. Route: /admin/settings/email. Sidebar: Email Settings under Admin. No DMS email sending. No secrets stored in DB. TS PASS. Build PASS.**)   — Previous: ERP DMS.8 (**CLOSED / PASS ✅ — DB migration adds notification_status/last_notification_at/retry_count/dismissed_by/dismissed_at/dismissal_reason/escalation_level/assigned_to/department_code to dms_expiry_reminders; creates dms_renewal_requests (status: draft/requested/in_progress/waiting_for_document/renewed/cancelled/rejected); creates dms_notification_queue (channels: in_app/email_ready). Server actions: expiry-reminders.ts (getDmsExpiryDashboardStats, getDmsExpiringDocuments, getDmsExpiryReminders, generateDmsExpiryRemindersForDocument, generateDmsExpiryRemindersBulk, rebuildDmsExpiryReminders, dismissDmsExpiryReminder, markDmsExpiryReminderHandled), renewals.ts (getDmsRenewalRequests, createDmsRenewalRequest, updateDmsRenewalRequest, completeDmsRenewalRequest, cancelDmsRenewalRequest), notifications.ts (getDmsNotifications, generateDmsExpiryNotifications, markDmsNotificationRead, dismissDmsNotification, getUnreadDmsNotificationsCount). Routes: /dms/expiring, /dms/renewals, /dms/notifications. DmsExpiryDashboardPageClient: 9 summary cards + 4 tabs (Expired/Expiring/Missing/Renewals). DmsDocumentExpirySection updated with reminder schedule, Generate/Rebuild buttons, Start Renewal button. Sidebar: Expiry & Renewals + Notifications links. Email-ready architecture (no secrets in DMS, no real email sent). No OCR/AI. TS PASS. Build PASS. Next: ERP SETTINGS.2 — Email Provider / Microsoft 365 Graph Configuration.**)

> **This file is the single merged source of truth for Cursor.** It supersedes stale rows in older trackers when they conflict with live source code or latest closure reports.

---

## 6.1 Project Identity

| Field | Value |
|---|---|
| **Project name** | ALGT ERP (Alliance Gulf Transport ERP) |
| **Package name** | `erp-foundation` v0.1.0 |
| **Company** | Alliance Gulf — UAE transport/logistics, scrap, waste, demolition, workshop operations |
| **Purpose** | Enterprise ERP foundation: admin, RBAC, master data, party master, numbering, lookups, global form runtime |
| **Repository** | `c:\dev\agt-erp` |
| **GitHub** | `https://github.com/sameerfahmi1979-maker/ERP` |
| **Live Supabase** | `https://mmiefuieduzdiiwnqpie.supabase.co` |
| **Correct MCP/tool** | **`user-supabase`** |
| **Wrong MCP/tool** | **`plugin-supabase-supabase`** → `https://owcfljxxfznifftoezpf.supabase.co` (unrelated weighing/industrial project) |
| **Public tables (live)** | 109+ tables, all RLS enabled (56 existing + 53 Party Master tables added 2026-06-14) |
| **Protected routes** | 34 `page.tsx` under `src/app/(protected)/` (added 4 new Party Master routes in 5A.3) |

---

## 6.2 Global Non-Negotiable Rules

1. **BIGINT primary keys only** — no UUID unless explicitly approved for a phase.
2. **No hardcoded dropdowns** — use `LookupSelect`, `ERPCombobox`, or cached TanStack hooks + master data.
3. **Global numbering** for human-readable references via `generateNextReference()` — codes read-only in UI.
4. **No source-only closure** for runtime behavior (Safe Close, dirty tracking, prefetch, performance) — verify in browser when possible; otherwise **PASS WITH NOTES**.
5. **No database schema changes** unless the phase prompt explicitly approves migrations.
6. **No new modules** outside the approved phase scope.
7. **Every phase** must produce an implementation/closure report in `implementation_Review/`.
8. **Every future phase** must update **this file** at completion.
9. **Server mutations:** `getAuthContext()` + `hasPermission()` + Zod + `logAudit()` + `revalidatePath()`.
10. **RLS enabled** on all ERP tables — never disable.
11. **FormData safety:** do not lazy-unmount parent form fields used by full-payload `new FormData(form)` saves.
12. **Legacy Customer module is RETIRED (CLEANUP.1)** — removed from active ERP. All customer functionality must use Party Master (`/admin/master-data/parties/customers`). Do not import or build against deleted customer feature files.
13. **Do not claim DB-READY or PLANNED modules as implemented** in reports or UI.
14. **Workspace record forms preserve unsaved values (UI.4E.2)** — All `ERPRecordWorkspaceForm` implementations must use `useWorkspaceFormDraft`. Drafts are in-memory only (never localStorage/sessionStorage). All `defaultValue` props must use `getDraftDefault(fieldName, serverFallback)`. Controlled comboboxes must initialize from `getDraftDefault` and call `writeDraftField` on change. `clearDraft()` must run after successful save/save-close. See `docs/standards/ERP_GLOBAL_WORKSPACE_UNSAVED_FORM_DRAFT_STANDARD.md` and `.cursor/rules/erp-workspace-unsaved-form-draft-standard.mdc`.
15. **Never use shadcn `<Select>` with async-loaded options** — Radix `SelectValue` resolves display text from `SelectItem` children at mount time; if items haven't mounted yet (data still loading), it falls back to displaying the raw `value` string (the numeric ID). Always use `ERPCombobox` instead, which derives `selectedOption` via `.find()` on the live `options` array on every render and always shows the correct label once options arrive. Rule: any field whose options come from a `useQuery`, server action, or any asynchronous source **must** use `ERPCombobox`, `LookupSelect`, `CountrySelect`, `EmirateSelect`, `CitySelect`, `AreaZoneSelect`, `CurrencySelect`, `PaymentTermSelect`, `TaxTypeSelect`, or another `ERPCombobox`-backed wrapper — never bare `<Select>` + `<SelectItem>`.
15. **Child dialogs inside drawers must block the parent** — When a child `Dialog` opens inside an ERP drawer (`Sheet`), both use `@base-ui/react/dialog` at `z-50` and Base UI does NOT automatically prevent the parent drawer from receiving events. Fix: (a) each tab with a dialog accepts `onChildOpen?: (open: boolean) => void` and calls it via a `setDialogOpen` helper; (b) the parent drawer wraps all interactive content in `<div inert={childDialogOpen || undefined} className="contents">`. Since `DialogPortal` renders to body (outside the SheetContent DOM), `inert` blocks the drawer without affecting the dialog. See `.cursor/rules/erp-drawer-child-dialog-blocking.mdc`.
16. **Finance Basics Banks is the single Bank Master source of truth (BANK MASTER STANDARD.1)** — Banks must not be created as Party records. `BANK` is not a Party Type. `/admin/master-data/parties/banks` is retired (redirects to Finance Banks). Party Bank Details must use `BankSelect` to link to Finance Banks via `bank_id`. See `.cursor/rules/erp-bank-master-standard.mdc`.

17. **Child forms are intentional BLOCKING modal tasks (UI.4G)** — When a child form (`ERPChildDialogForm`) is open, workspace tab switching and sidebar/background actions are fully blocked by the full-screen overlay (`z-[100]`). The tab bar sits at `z-[30]` intentionally below the overlay. Outside click and Esc are disabled — the user must Cancel/X/Save explicitly. Parent record content becomes inert via `isChildDialogOpen`. Combobox dropdowns inside child dialogs use `z-[120]`. See `.cursor/rules/erp-child-dialog-form-standard.mdc` for complete z-index stack.
17. **All ERP child form dialogs must use `ERPChildDialogForm`** — Standard size `lg` (960px), sticky footer (never inside scroll body), `bg-slate-950/40 backdrop-blur-[2px]` overlay, consistent header (icon + title + subtitle + X), body-only scroll. The inert wrapper in the parent drawer must be a real box element (not `display:contents`) with `opacity-50` applied when `childDialogOpen=true` for visual dimming. Z-index target: drawer at z-50, child dialog overlay at z-[60], content at z-[70]. Never use random per-dialog widths. See `.cursor/rules/erp-child-dialog-form-standard.mdc`. **IMPLEMENTED** in ERP GLOBAL UI.2 (2026-06-14): 15 dialogs migrated across Party Master, Customer, Party Admin, and Users modules. Customer module inert wrapper is a remaining limitation (tracked for ERP GLOBAL UI.3).

---

## 6.3 Implemented Technology Stack

From `package.json` (source-verified):

| Layer | Version |
|---|---|
| Next.js | 16.2.6 (App Router) |
| React | 19.2.4 |
| TypeScript | 5 |
| Tailwind CSS | 4 |
| Supabase JS / SSR | 2.106.2 / 0.10.3 |
| TanStack Query | 5.101.0 |
| TanStack Table | 8.21.3 |
| Zod | 4.4.3 |
| React Hook Form | 7.76.1 |
| shadcn/ui + Lucide | current |
| Sonner, date-fns, jsPDF, xlsx | current |

**Route protection:** `src/middleware.ts` → `src/lib/supabase/middleware.ts`  
**Deprecation note:** Next.js warns `middleware` → `proxy` migration pending.

---

## 6.4 Current Implemented Modules

**Module status:** LIVE = working route; CLOSED = LIVE + QA closure (Customer only).

| Module | Route | UI | DB | Main feature path | Server actions | Status | Notes |
|---|---|---|---|---|---|---|---|
| Dashboard | `/dashboard` | LIVE | — | `src/app/(protected)/dashboard/page.tsx` | — | OK | Demo KPI + 8 fake module cards |
| Users | `/admin/users` | LIVE | ✅ | `src/features/users/` | `server/actions/users.ts` | OK | `users.manage` |
| Roles | `/admin/roles` | LIVE | ✅ | `src/features/roles/` | `server/actions/roles.ts` | OK | |
| Permissions | `/admin/permissions` | LIVE | ✅ | `src/features/permissions/` | `server/actions/permissions.ts` | OK | |
| Organizations | `/admin/organizations` | LIVE | ✅ | `src/features/organizations/` | `server/actions/organizations.ts` | OK | Prefetch wired; legacy text sync |
| Branches | `/admin/branches` | LIVE | ✅ | `src/features/branches/` | `server/actions/branches.ts` | OK | Prefetch wired; geography → text fields |
| Numbering Rules | `/admin/settings/numbering` | LIVE | ✅ | `src/features/numbering/` | `server/actions/numbering.ts` | OK | |
| AI Settings | `/admin/settings/ai` | LIVE | ✅ | `src/features/settings/ai/` | `server/actions/settings/ai-settings.ts` | OK | SETTINGS.1. Provider configs, feature flags, usage logs. API keys → env vars only. |
| Email Settings | `/admin/settings/email` | LIVE | ✅ | `src/features/settings/email/` | `server/actions/settings/email-settings.ts` | OK | SETTINGS.2. 3 tables (erp_email_provider_configs/send_logs/feature_flags). Microsoft Graph client_credentials flow. secret_ref only (no plain secret in DB). Provider abstraction: src/lib/email/providers/. Sidebar item added. |
| DMS Foundation | DB only | DB-READY | ✅ | — | — | DB-READY | DMS.2. 23 tables, RLS forced, 2 private buckets (dms-documents, dms-temp), MASTER_DMS_DOCUMENT numbering, 38 doc types, 13 categories, 53 metadata fields, 21 permissions. party_documents active until DMS.6. |
| DMS Admin Masters | `/admin/dms` + 5 sub-routes | LIVE | ✅ | `src/features/dms/admin/` | `src/server/actions/dms/` | LIVE | DMS.3. 6 admin routes, categories/types/metadata/tags/retention CRUD with ERPChildDialogForm. DMS Admin sidebar group. Workspace registry updated. TS+build PASS. party_document_types unchanged. |
| DMS Document Repository | `/dms`, `/dms/documents`, `/dms/documents/record/new`, `/dms/documents/record/[id]` | LIVE | ✅ | `src/features/dms/documents/` | `src/server/actions/dms/` | LIVE | DMS.4. Document list + workspace record form. 10 sections (overview, metadata, links, tags, versions, files, expiry, approvals, comments, audit). Dynamic metadata from dms_metadata_definitions. document_no via MASTER_DMS_DOCUMENT. party_documents unchanged. |
| DMS Upload Inbox + File Storage | `/dms/inbox` | LIVE | ✅ | `src/features/dms/upload/` | `src/server/actions/dms/upload-sessions.ts`, `document-files.ts`, `document-upload-attach.ts` | LIVE | DMS.5. Upload Inbox route, file upload to dms-temp (signed URL), SHA-256 duplicate detection, attach to existing doc or create new doc with file, dms-temp → dms-documents copy, dms_document_versions v1+, dms_document_files, real Files + Versions sections, signed URL preview/download. No OCR/AI. party_documents unchanged. TS+build PASS. |
| DMS Party Master Integration | Party record → Documents tab | LIVE | ✅ | `src/features/master-data/parties/party-dms-documents-tab.tsx` | `entity-documents.ts`, `party-dms-documents.ts` | LIVE | DMS.6. Party Documents tab is DMS-backed. dms_party_document_migration_map. party_documents/party_document_types kept as legacy. New DB columns on party_licenses + party_tax_registrations. Inbox + new-doc route support entity context. TS+build PASS. No OCR/AI. |
| DMS Versioning, Cleanup & Integrity | DMS Record → Versions/Files; Inbox cleanup | LIVE | ✅ | `dms-document-versions-section.tsx`, `dms-upload-new-version-dialog.tsx`, `dms-upload-cleanup-panel.tsx`, `dms-file-integrity-badge.tsx` | `session-cleanup.ts`, `document-files.ts` (setCurrentVersion) | LIVE | DMS.7. Enhanced versions section with per-version file display, Preview/Download. In-record Upload New Version dialog. Cleanup panel (dry-run + actual) in Inbox. Integrity badge in Files. Party Licenses + Tax "Open in DMS" buttons. TS+build PASS. No OCR/AI. No permanent file deletion. |
| DMS Expiry, Renewals & Notifications | /dms/expiring, /dms/renewals, /dms/notifications; DMS record Expiry section | LIVE | ✅ | `dms-expiry-dashboard-page-client.tsx`, `dms-expiry-summary-cards.tsx`, `dms-expiring-documents-table.tsx`, `dms-reminder-schedule-table.tsx`, `dms-start-renewal-dialog.tsx`, `dms-complete-renewal-dialog.tsx`, `dms-renewal-requests-table.tsx`, `dms-notifications-table.tsx`, `dms-*-status-badge.tsx` | `expiry-reminders.ts`, `renewals.ts`, `notifications.ts` | LIVE | DMS.8. 9 dashboard cards. Idempotent reminder schedule (90/60/30/14/7/1/0 days). Renewal workflow (create→in_progress→renewed/cancelled). In-app notification queue. Email-ready but no real email (requires SETTINGS.2). DMS record Expiry section updated with reminder table + renewal button. No Microsoft secrets. No OCR/AI. TS+build PASS. |
| Master Data hub | `/admin/master-data` | LIVE | ✅ | `src/app/(protected)/admin/master-data/page.tsx` | lookups stats | OK | |
| Lookup Categories | `.../lookups/categories` | LIVE | ✅ | `src/features/master-data/lookups/` | `server/actions/master-data/lookups.ts` | OK | |
| Lookup Values | `.../lookups/values` | LIVE | ✅ | same | same | OK | |
| Locked System Values | `.../lookups/system` | LIVE | ✅ | same | same | OK | |
| Countries | `.../geography/countries` | LIVE | ✅ | `src/features/master-data/geography/` | `geography/actions.ts` | OK | |
| Emirates/Regions | `.../geography/emirates` | LIVE | ✅ | same | same | OK | |
| Cities | `.../geography/cities` | LIVE | ✅ | same | same | OK | Cascading comboboxes |
| Areas/Zones | `.../geography/areas` | LIVE | ✅ | same | same | OK | |
| Ports | `.../geography/ports` | LIVE | ✅ | same | same | OK | |
| Currencies | `.../finance-basics/currencies` | LIVE | ✅ | `src/features/master-data/finance-basics/` | `finance-basics/actions.ts` | OK | |
| Payment Terms | `.../payment-terms` | LIVE | ✅ | same | same | OK | |
| Tax Types | `.../tax-types` | LIVE | ✅ | same | same | OK | |
| Banks | `.../banks` | LIVE | ✅ | same | same | OK | |
| Cost Centers | `.../cost-centers` | LIVE | ✅ | same | same | OK | |
| Profit Centers | `.../profit-centers` | LIVE | ✅ | same | same | OK | |
| UOM Categories | `.../uom/categories` | LIVE | ✅ | `src/features/master-data/uom/` | `uom/actions.ts` | OK | |
| UOM Units | `.../uom/units` | LIVE | ✅ | same | same | OK | |
| UOM Conversions | `.../uom/conversions` | LIVE | ✅ | same | same | OK | |
| ~~Customers (Legacy)~~ | `.../customers` → **redirects** | **RETIRED** | DROPPED | ~~`src/features/master-data/customers/`~~ (DELETED) | ~~`customers.ts` + 3 child files~~ (DELETED) | **RETIRED (CLEANUP.1)** | Routes redirect to `/admin/master-data/parties/customers`. DB tables dropped. Feature files deleted. Use Party Master. |
| Audit Logs | `/admin/audit` | LIVE | ✅ | `src/features/audit/` | `queries/audit.ts` | OK | |
| Profile | `/profile` | LIVE | ✅ | `src/features/profile/` | profile actions | OK | Self-service |
| Settings | `/settings` | LIVE | — | `src/app/(protected)/settings/` | — | OK | Self-service |

**Permissions summary:** `master_data.party_master.view/manage`, `master_data.geography.*`, `master_data.finance_basics.*`, `master_data.uom.*`, `master_data.lookups.*`, `organizations.*`, `branches.*`, `users.manage`, `roles.*`, `numbering.rules.*`, `dashboard.view`.

---

## 6.5 On-Screen Placeholder Modules

**Visible but NOT built.** Do not treat as implemented.

| Module | Where shown | Route (non-functional) | Notes |
|---|---|---|---|
| Fleet Management | Sidebar "Soon" + Dashboard card | `/modules/fleet` | `comingSoon: true` in sidebar |
| HR & Payroll | Sidebar + Dashboard | `/modules/hr` | Roadmap 004 |
| Workshop | Sidebar + Dashboard | `/modules/workshop` | Roadmap 006 |
| HSE | Sidebar + Dashboard | `/modules/hse` | Roadmap 011 |
| Finance | Sidebar + Dashboard | `/modules/finance` | Operational finance |
| Inventory | Sidebar + Dashboard | `/modules/inventory` | Roadmap 007 |
| Procurement | Sidebar + Dashboard | `/modules/procurement` | Roadmap 008 |
| Documents / DMS | Sidebar + Dashboard + Customer tab | `/modules/documents` | Roadmap 009 |

- Sidebar: disabled, **"Soon"** badge, not clickable (`src/components/layout/app-sidebar.tsx`).
- Dashboard: fake KPI data, cards not linked (`src/app/(protected)/dashboard/page.tsx`).

---

## 6.6 DB-Ready But Not UI-Built Modules

**Supabase tables + RLS exist. Zero routes, server actions, or sidebar links.**

### Legacy Party Entities (pre-002F.5A.1)
| Entity | Parent table | Child tables | Bank details | Notes |
|---|---|---|---|---|
| **Vendors** | `vendors` | contacts, addresses, documents | ✅ `vendor_bank_details` | Legacy — do NOT migrate; Unified Party replaces |
| **Subcontractors** | `subcontractors` | contacts, addresses, documents | ✅ | Legacy — do NOT migrate |
| **Consultants** | `consultants` | contacts, addresses, documents | ✅ | Legacy — do NOT migrate |
| **Government Authorities** | `government_authorities` | contacts, addresses, documents | ❌ | Legacy — do NOT migrate |
| **Recruitment Agencies** | `recruitment_agencies` | contacts, addresses, documents | ✅ | Legacy — do NOT migrate |

### New Unified Party Master (002F.5A.3 — UI COMPLETE + FILTERED VIEWS + ADMIN MASTERS)
| Status | Tables | RLS | Main Route | Filtered Routes | Drawer Tabs | Admin Routes |
|---|---|---|---|---|---|---|
| **UI-BUILT** | 53 tables (core + lookup + profiles) | ✅ All enabled | `/admin/master-data/parties` | 9 filtered views via `[typeSlug]` | 11 of 13 tabs | 3 admin pages |

**Key new tables:** `parties`, `party_types`, `party_type_assignments`, `party_licenses`, `party_documents`, `party_tax_registrations`, `party_finance_profiles`, `party_contacts`, `party_addresses`, `party_bank_details`, `party_compliance_profiles`, `party_notes`, `party_service_category_assignments`, `party_relationships`, + 6 role profile tables + 30+ lookup tables.

**Numbering rules registered:** `MASTER_PARTY` → `PTY-000001`, plus `PTYCON`, `PTYADDR`, `PTYBANK`, `PTYLIC`, `PTYTAX`, `PTYDOC`, `PTYNOTE` prefixes.

**Duplicate detection:** `detect_possible_party_duplicates()` in UI + IBAN duplicate warning in bank details.

**Reusable PartySelect:** `src/components/erp/party-select.tsx` — supports type/typeCodes/excludePartyId filters.

**Filtered views (5A.3):** `/parties/customers`, `/parties/vendors`, `/parties/subcontractors`, `/parties/consultants`, `/parties/recruitment-agencies`, `/parties/government-authorities`, `/parties/banks`, `/parties/insurance-companies`, `/parties/license-issuers`.

**Admin routes (5A.3):** `/parties/types`, `/parties/service-categories`, `/parties/relationship-types`.

**UI Files (5A.2+5A.3):** `src/features/master-data/parties/` (18 files), `src/server/actions/master-data/party-*.ts` (11 files), `src/app/(protected)/admin/master-data/parties/` (5 routes including `[typeSlug]`).

---

## 6.7 Planned Operational & Platform Modules

From `implementation_Review/ERP_FULL_IMPLEMENTATION_ROADMAP_PHASE_TRACKER.md`:

**Operational (003–018):** CRM, HR/Payroll, Fleet/Equipment, Workshop, Inventory, Procurement, DMS, Task Management, HSE, Scrap Trading, Waste Management, Demolition, Transport/Trips, Rental/Utilization, Fuel/Diesel, Weighbridge.

**Platform (019–025 + UX):** Reporting/KPI/BI, Notifications, Approvals, Global Print/PDF/Email, External Integrations, Global Search/Command Palette (002F.3E.3C), AI Center, Security/Pen Test, Final QA/UAT/Deployment.

**Master-data foundation (before ops):** 002F.3D Settings, 002F.3F HR MD, 002F.3G Fleet MD, 002F.3H Workshop/Inventory/Procurement MD, 002F.3I HSE/DMS MD, 002F.3J Scrap/Waste/Demolition MD, 002F.3K MD QA gate.

**Also planned (no page yet):** Work Sites (Geography), Payment Methods & Bank Account Types (lookup-only).

---

## 6.8 Phase Status Tracker

| Phase | Title | Status | Latest report / evidence |
|---|---|---|---|
| 001 | ERP Base Foundation | **CLOSED** | Migrations + 001 reports |
| 002D | Admin Master Data Hardening | **CLOSED** | Orgs, Branches, Users |
| 002E | Global UI/UX Foundation | **CLOSED** | ERPDrawerForm, tables, export |
| 002F.2 | Global Numbering Engine | **CLOSED** | `numbering.ts` |
| 002F.3B | Global Lookup Engine | **CLOSED** | Lookups module |
| 002F.3C.1 | Geography & Locations | **CLOSED** | 5 geography pages |
| 002F.3C.2 | Finance Basics | **CLOSED** | 6 finance pages |
| 002F.3C.3 | Units & Measurements | **CLOSED** | 3 UOM pages |
| 002F.3C.4A/B | Sidebar + Selects QA | **CLOSED** | Sameer QA passed |
| 002F.3C.4C | Master Data Gate | **PLANNED** | Not executed |
| 002F.3E.2 | Party master DB + seeds | **CLOSED** | 56 tables live |
| 002F.3E.3 | Customers initial | **CLOSED** | Customer module |
| 002F.3E.3B.2–3B.4 | Combobox, Footer, Safe Close | **CLOSED** | Standards enforced |
| 002F.3E.3B.5 | Global form runtime QA | **CLOSED WITH NOTES** | |
| 002F.3E.3B.6A–6G | Performance / prefetch standard | **CLOSED WITH NOTES** | Parent form runtime |
| 002F.3E.3B.6G.3B | Contacts loading fix | **CLOSED** | staleTime 5 min |
| 002F.3E.3B.7 | Customer final QA | **CLOSED WITH NOTES** | `effectiveCustomerId` fix |
| 002F.3E.4 | Global QA gate | **PASS WITH NOTES** | Browser QA pending |
| **002F.5A.0** | Party Master Supabase Integrity Review | **CLOSED ✅** | `implementation_Review/ERP_BASE_002F_5A_0_Supabase_Integrity_Review/` |
| **002F.5A.1** | Party Master Database Foundation | **COMPLETE ✅** | `implementation_Review/ERP_BASE_002F_5A_1_Party_Master_Database_Foundation/ERP_BASE_002F_5A_1_PARTY_MASTER_DATABASE_FOUNDATION_IMPLEMENTATION_REPORT.md` |
| **002F.5A.2** | Party Master Core UI and Drawer | **COMPLETE ✅** | `implementation_Review/ERP_BASE_002F_5A_2_Party_Master_Core_UI/ERP_BASE_002F_5A_2_PARTY_MASTER_CORE_UI_AND_DRAWER_IMPLEMENTATION_REPORT.md` |
| **002F.5A.3** | Party Master Filtered Views, PartySelect, Admin Masters | **COMPLETE ✅** | `implementation_Review/ERP_BASE_002F_5A_3_Party_Master_Filtered_Views/ERP_BASE_002F_5A_3_PARTY_MASTER_FILTERED_VIEWS_PARTYSELECT_ADMIN_MASTERS_IMPLEMENTATION_REPORT.md` |
| **002F.5A.3X** | Party Drawer Footer / Combobox / Child Dialog Blocking Hotfixes | **COMPLETE ✅** | `implementation_Review/ERP_BASE_002F_5A_3X_*/` — 3 hotfixes, Rules 14–15 codified |
| **ERP GLOBAL UI.1** | Global Child Form Dialog Standard — Planning Phase | **COMPLETE ✅** | `implementation_Review/ERP_GLOBAL_CHILD_FORM_DIALOG_STANDARD_PLAN.md` |
| **ERP GLOBAL UI.2** | Apply Standard Child Dialog Design System-Wide | **COMPLETE ✅** | `implementation_Review/ERP_GLOBAL_UI_2_STANDARD_CHILD_DIALOG_DESIGN_SYSTEM_WIDE_IMPLEMENTATION_REPORT.md` |
| **ERP GLOBAL UI.4** | Multi-Tab Workspace Architecture Plan | **COMPLETE ✅** | `implementation_Review/ERP_GLOBAL_UI_4_MULTI_TAB_WORKSPACE_AND_RECORD_FORM_ARCHITECTURE_PLAN.md` — plan only |
| **ERP GLOBAL UI.4A** | Workspace Architecture Foundation | **COMPLETE ✅** | `implementation_Review/ERP_GLOBAL_UI_4A_WORKSPACE_ARCHITECTURE_FOUNDATION_IMPLEMENTATION_REPORT.md` — 8 files created, sidebar + shell modified, build passes |
| **ERP GLOBAL UI.4B** | Dirty State and Safe Close Integration | **COMPLETE ✅** | `implementation_Review/ERP_GLOBAL_UI_4B_DIRTY_STATE_AND_SAFE_CLOSE_INTEGRATION_IMPLEMENTATION_REPORT.md` — dirty dot wired, tab close warning, beforeunload, ERPDrawerForm global sync, TS+build pass |
| **ERP GLOBAL UI.4C** | Workspace Record Form Standard | **COMPLETE ✅** | `implementation_Review/ERP_GLOBAL_UI_4C_WORKSPACE_RECORD_FORM_STANDARD_IMPLEMENTATION_REPORT.md` — ERPRecordWorkspaceForm + Header + SectionNav + Footer + useRecordWorkspaceForm, TS+build pass |
| **ERP GLOBAL UI.4D** | Party Master Pilot Conversion | **COMPLETE ✅** | `implementation_Review/ERP_GLOBAL_UI_4D_PARTY_MASTER_PILOT_CONVERSION_IMPLEMENTATION_REPORT.md` — Party Add/Edit/View converted to workspace record tabs; /record/new + /record/[id] routes; UPDATE_TAB_ROUTE added; SYNC_ROUTE pathname fix; TS+build pass |
| **ERP GLOBAL UI.4E** | System-Wide Workspace Cache, Overlay Z-Index Fix | **COMPLETE ✅** | `implementation_Review/ERP_GLOBAL_UI_4E_SYSTEM_WIDE_WORKSPACE_CACHE_STATE_OVERLAY_AND_FORM_STANDARD_FIXES_IMPLEMENTATION_REPORT.md` |
| **ERP GLOBAL UI.4E.1** | System-Wide State Isolation, Scoped Dialogs, Full Form Workspace Conversion | **COMPLETE ✅** | `implementation_Review/ERP_GLOBAL_UI_4E_1_SYSTEM_WIDE_WORKSPACE_STATE_ISOLATION_FORM_CONVERSION_IMPLEMENTATION_REPORT.md` — All Finance Basics, UOM, Geography, Lookups, Admin (Roles, Orgs, Branches, Numbering), Customer converted to ERPRecordWorkspaceForm; WorkspaceTabBar z-[100]; ERPDataTable route-scoped localStorage; TS+build pass |
| **ERP GLOBAL UI.4E.2** | Workspace Unsaved Form Draft Preservation | **CLOSED / PASS ✅** | `implementation_Review/ERP_GLOBAL_UI_4E_2_WORKSPACE_UNSAVED_FORM_DRAFT_PRESERVATION_IMPLEMENTATION_REPORT.md` — WorkspaceDraftProvider + useWorkspaceFormDraft; in-memory Map; 23/23 forms updated; sensitive field denylist; clearDraft on save/discard/tab-close; TS+build pass; post-verification 27/27 PASS; defaultValue warning bug fixed |
| **ERP GLOBAL UI.4F** | Runtime QA and Performance Gate | **PASS WITH NOTES** | `implementation_Review/ERP_GLOBAL_UI_4F_RUNTIME_QA_AND_PERFORMANCE_GATE_REPORT.md` — Source-level all criteria PASS; TS+build pass; 2 bugs fixed (party_code counter + defaultValue warning); browser interactive QA requires Sameer manual verification |
| **ERP GLOBAL CLEANUP.1** | Remove Legacy Customer Module and Retire Test Data | **CLOSED / PASS ✅** | `implementation_Review/ERP_GLOBAL_CLEANUP_1_REMOVE_LEGACY_CUSTOMER_MODULE_AND_TEST_DATA_REPORT.md` — All 3 legacy routes now redirect to Party Master. Feature files (11) deleted. Server actions (4) deleted. Dev harnesses deleted. DB: 5 tables dropped, 2 retained (FK from party_customer_profiles). TS+build PASS. Cursor rule created. |
| **ERP PARTY MASTER UX FIX.1** | Filtered View Default Party Type | **CLOSED / PASS ✅** | `implementation_Review/ERP_PARTY_MASTER_UX_FIX_1_FILTERED_VIEW_DEFAULT_PARTY_TYPE_IMPLEMENTATION_REPORT.md` — `PartiesTable.openAdd()` appends `?defaultType={CODE}` and sets friendly tab title. `record/new` page reads + validates `searchParams.defaultType`. Pre-existing wiring in `party-workspace-form` and `party-types-tab` was complete. TS+build PASS. |
| **ERP BANK MASTER STANDARD.1** | Unify Bank Master, Remove Party Bank Duplication | **CLOSED / PASS ✅** | `implementation_Review/ERP_BANK_MASTER_STANDARD_1_UNIFY_BANK_MASTER_REMOVE_PARTY_BANK_DUPLICATION_REPORT.md` — `/parties/banks` route redirects to `/finance-basics/banks`. Banks removed from Party Master sidebar. `BankSelect` added to Party Bank Details with read-only info panel and "+ New Bank" shortcut. BANK party type never existed in DB. TS+build PASS. |
| **ERP GLOBAL UI.4G** | Child Form Modal Workspace Blocking and UX Standard Fix | **CLOSED / PASS ✅** | `implementation_Review/ERP_GLOBAL_UI_4G_CHILD_FORM_MODAL_WORKSPACE_BLOCKING_AND_UX_STANDARD_FIX_REPORT.md` — Child dialog overlay raised to `z-[100]`, tab bar lowered to `z-[30]`, combobox raised to `z-[120]`. Outside click/Esc blocked in ERPChildDialogForm. `isChildDialogOpen` wired to UserWorkspaceForm. Full audit: 13 forms using ERPChildDialogForm, 7 party admin tabs with onChildOpen, all correctly wired. TS+build PASS. |
| **ERP GLOBAL CLEANUP.2** | Delete Legacy Dead Form-Dialog Files | **CLOSED / PASS ✅** | `implementation_Review/ERP_GLOBAL_CLEANUP_2_DELETE_LEGACY_DEAD_FORM_DIALOG_FILES_REPORT.md` — 21 legacy `*-form-dialog.tsx` files deleted. All confirmed zero active imports before deletion. No barrel exports referencing deleted files. TS+build PASS. |
| **ERP DMS.1** | AI-Ready Enterprise DMS Research and Architecture Plan | **CLOSED / PLAN COMPLETE ✅** | `implementation_Review/Phase_DMS_1_Planning/ERP_DMS_1_AI_READY_ENTERPRISE_DMS_RESEARCH_AND_ARCHITECTURE_PLAN.md` — Deep research on 5 open-source DMS systems. Full DB schema (20+ tables), Storage architecture, AI abstraction, 35 document types, 7 AI extraction schemas, 14 phases. No implementation. |
| **ERP DMS.1A** | Architecture Review, Corrections, Existing Document Inventory, and Final Approval Gate | **CLOSED / PLAN COMPLETE ✅** | `implementation_Review/Phase_DMS_1_Planning/ERP_DMS_1A_ARCHITECTURE_REVIEW_CORRECTIONS_EXISTING_DOCUMENT_INVENTORY_AND_FINAL_APPROVAL_GATE.md` — Full audit of existing party_documents (metadata-only, file_path never used), party_document_types (14 seeded types), party_licenses, party_tax_registrations. party_documents migration plan for DMS.6. party_document_types migration to dms_document_types in DMS.3. ERP SETTINGS.1 required before DMS.9. erp_ai_provider_configs added to DMS.2 scope. entity_types party_license + party_tax_registration added to dms_document_links. DMS single-source-of-truth rule established. V2 Architecture Standard + updated DMS Cursor rule created. Phase list expanded to 16 phases. 13 decisions awaiting Sameer approval. No implementation. |
| **ERP SETTINGS.1** | AI Settings Provider Configuration | **CLOSED / PASS ✅** | `implementation_Review/ERP_SETTINGS_1_AI_SETTINGS_PROVIDER_CONFIGURATION_IMPLEMENTATION_REPORT.md` — AI Settings foundation: 3 tables (erp_ai_provider_configs, erp_ai_usage_logs, erp_ai_feature_flags), 5 permissions, 6 seeded providers (all disabled), 7 feature flags, server actions, AI Settings UI (/admin/settings/ai), provider abstraction (factory + openai + local), rule files normalized to .cursor/rules/. TS+lint PASS. |
| **ERP DMS.2** | Database Foundation, RLS, Numbering, and Storage Buckets | **CLOSED / PASS ✅** | `implementation_Review/ERP_DMS_2_DATABASE_FOUNDATION_RLS_NUMBERING_STORAGE_BUCKETS_IMPLEMENTATION_REPORT.md` — 23 DMS tables, RLS enabled+forced on all, 37 indexes, 2 private storage buckets (dms-documents, dms-temp), MASTER_DMS_DOCUMENT numbering rule (DMS-{YYYY}-{SEQ6}), 13 categories, 38 document types, 53 metadata field defs, 21 DMS permissions. erp_ai_provider_configs reused (not recreated). party_documents + party_document_types unchanged. No UI built. |
| **ERP DMS.3** | DMS Admin Masters: Categories, Types, Tags, Metadata, Retention | **CLOSED / PASS ✅** | `implementation_Review/ERP_DMS_3_DMS_ADMIN_MASTERS_CATEGORIES_TYPES_TAGS_METADATA_RETENTION_IMPLEMENTATION_REPORT.md` — 6 DMS admin routes (/admin/dms + 5 sub-routes), 6 server action files under src/server/actions/dms/, 7 feature components + shared dms-constants.ts, DMS Admin sidebar group, workspace route registry updated. ERPChildDialogForm for all add/edit. party_documents/party_document_types unchanged. No upload/OCR/repository. TS+build PASS. |
| **ERP DMS.4** | Document Repository List + Document Record Workspace Form | **CLOSED / PASS ✅** | `implementation_Review/ERP_DMS_4_DOCUMENT_REPOSITORY_LIST_AND_RECORD_WORKSPACE_FORM_IMPLEMENTATION_REPORT.md` — 4 DMS document routes (/dms, /dms/documents, /dms/documents/record/new, /dms/documents/record/[id]), 6 server action files (documents, metadata-values, links, tags, comments, events), 14 feature components (record form + 10 sections + 3 badges + table + constants), Documents sidebar group, workspace registry updated. Dynamic metadata from dms_metadata_definitions. document_no via MASTER_DMS_DOCUMENT RPC. No file upload. party_documents/party_document_types unchanged. TS+build PASS. |
| **ERP DMS.5** | Upload Inbox and File Storage | **CLOSED / PASS ✅** | `implementation_Review/ERP_DMS_5_UPLOAD_INBOX_AND_FILE_STORAGE_IMPLEMENTATION_REPORT.md` — /dms/inbox route, 3 new server action files (upload-sessions.ts, document-files.ts, document-upload-attach.ts), 8 upload UI components (dropzone, session table, attach dialog, create-from-upload dialog, duplicate warning panel, file-size, file-type-icon, inbox page client), constants file, real Files section + Versions section replacing placeholders, signed URL preview (5min) + download (1hr), SHA-256 client-side duplicate detection, dms-temp → dms-documents copy via admin client, dms_document_versions + dms_document_files created on attach/create, sidebar + workspace registry updated. No OCR/AI. party_documents/party_document_types unchanged. TS+build PASS. |
| **ERP DMS 13** | Multi-File Batch Upload → Draft Intake Queue | **CLOSED / PASS ✅** | `implementation_Review/ERP_DMS_13_MULTI_FILE_BATCH_UPLOAD_TO_DRAFT_INTAKE_IMPLEMENTATION_REPORT.md` — See SOT header for full summary. |
| **ERP DMS OCR-AI FIX.1** | OCR / AI Text Pipeline Deep Fix | **CLOSED / PASS ✅** | `implementation_Review/ERP_DMS_OCR_AI_FIX_1_TEXT_PIPELINE_DEEP_FIX_IMPLEMENTATION_REPORT.md` — See SOT header for full summary. |
| **ERP DMS.14** | Security, RLS, Confidentiality, and Permission QA | **CLOSED / PASS ✅** | `implementation_Review/ERP_DMS_14_SECURITY_RLS_CONFIDENTIALITY_PERMISSION_QA_IMPLEMENTATION_REPORT.md` — 25 DMS tables audited. 4 critical overly-broad RLS policies fixed (dms_expiry_reminders, dms_intake_review_values, dms_notification_queue, dms_renewal_requests). dms_intake_review_values FORCE RLS enabled. getDmsAiProvider()+getDmsEmbeddingProvider() switched to createAdminClient() so DMS AI works for all DMS users. All 16 DMS server actions audited: auth+permission checks present in all; no sensitive content logged. Confidentiality gates verified for hr/legal/executive. Both storage buckets private. Signed URLs permission-gated. Admin tools admin-only. TS PASS. Build PASS. Next: ERP DMS.15 — Integration Readiness. |
| **ERP DMS.15** | Integration Readiness for HR, Fleet, Workshop, Projects, Finance, HSE | **CLOSED / PASS ✅** | `implementation_Review/ERP_DMS_15_INTEGRATION_READINESS_IMPLEMENTATION_REPORT.md` — No DB migration. Entity type registry (24 types in src/lib/dms/dms-entity-types.ts). entity-documents.ts extended with compliance summary + AI-era fields. DmsEntityDocumentsTab + DmsEntityDocumentComplianceCards reusable components. Query keys + invalidation extended. Party Master tab preserved. TS PASS. Build PASS. Next: ERP 003 HR Module or DMS.16 upload-for-entity deep integration. |

**Stale documents (do not trust over this file + source):**
- `implementation_Review/ERP_BASE_FULL_PHASE_STATUS_TRACKER.md` (2026-06-07)
- `implementation_Review/ERP_FULL_IMPLEMENTATION_ROADMAP_PHASE_TRACKER.md` (phase rows for 3E.3–3E.4 marked PLANNED but actually CLOSED)

---

## 6.9 Global Standards Implemented

| Standard | Location | Rule |
|---|---|---|
| ERPDrawerForm / ERPDrawerSection | `src/components/erp/erp-drawer-form.tsx` | Drawer shell; `lazyMount` for safe tabs |
| ERPFormFooter | `src/components/erp/erp-form-footer.tsx` | Cancel / Save / Save & Close / Close |
| RequiredLabel | `src/components/erp/required-label.tsx` | Required field asterisk |
| ERPCombobox | `src/components/erp/combobox/erp-combobox.tsx` | Debounced search; `markDirty()` |
| LookupSelect | `src/components/erp/lookup-select.tsx` | Cached lookup categories |
| useFormDirty | `src/hooks/use-form-dirty.ts` | Safe Close + combobox dirty |
| UnsavedChangesDialog | `src/components/erp/unsaved-changes-dialog.tsx` | Dirty intercept |
| TanStack Query | `src/lib/query/query-client.ts` | Global provider |
| queryKeys | `src/lib/query/query-keys.ts` | incl. `queryKeys.child.*` |
| invalidation | `src/lib/query/invalidation.ts` | `createChildInvalidator` |
| prefetch | `src/lib/query/prefetch-lookups.ts` | Batch lookup + master prefetch |
| child tables | `src/hooks/child-tables/use-child-table-query.ts` | staleTime 5 min |
| Parent form runtime | `docs/standards/ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md` | FormPrefetchDeclaration required |
| Cursor dev guide | `docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md` | Workflow + RLS |
| UI/UX guide | `docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md` | Forms + tables |
| ERPChildDialogForm | `src/components/erp/erp-child-dialog-form.tsx` | Global child form dialog standard (GLOBAL UI.2) |
| Child dialog rule | `.cursor/rules/erp-child-dialog-form-standard.mdc` | Enforces ERPChildDialogForm for all child forms |
| WorkspaceProvider | `src/components/workspace/workspace-provider.tsx` | Global multi-tab workspace context (ERP GLOBAL UI.4A) |
| WorkspaceTabBar | `src/components/workspace/workspace-tab-bar.tsx` | Chrome-style tab bar below AppHeader |
| workspace-store | `src/lib/workspace/workspace-store.ts` | Tab state reducer + localStorage persistence |
| workspace-route-registry | `src/lib/workspace/workspace-route-registry.ts` | 42 protected routes mapped to tab metadata |
| useWorkspace | `src/hooks/use-workspace.ts` | Primary hook for tab open/close/switch |
| Workspace tabs rule | `.cursor/rules/erp-workspace-tabs-standard.mdc` | Tab behavior standard (DRAFT — activates after 4A) |
| Record workspace form rule | `.cursor/rules/erp-record-workspace-form-standard.mdc` | Record form standard (DRAFT — activates after 4C) |
| useWorkspaceTabDirty | `src/hooks/use-workspace-tab-dirty.ts` | Bridge form isDirty → workspace tab dirty flag (ERP GLOBAL UI.4B) |
| UnsavedChangesDialog (tab-close) | `src/components/erp/unsaved-changes-dialog.tsx` | Extended with configurable title/description/button labels (4B) |
| ERPRecordWorkspaceForm | `src/components/workspace/erp-record-workspace-form.tsx` | Full-page record form shell for workspace record tabs (4C) |
| ERPRecordHeader | `src/components/workspace/erp-record-header.tsx` | Record form fixed header with badges, dirty dot, close (4C) |
| ERPRecordSectionNav | `src/components/workspace/erp-record-section-nav.tsx` | Vertical left nav (desktop) / horizontal scroll (mobile) (4C) |
| ERPRecordFormFooter | `src/components/workspace/erp-record-form-footer.tsx` | Sticky footer: Cancel/Save/Save & Close / Close (4C) |
| useRecordWorkspaceForm | `src/hooks/use-record-workspace-form.ts` | Bridge hook: dirty sync + workspace-aware safe close (4C) |
| ERPRecordSectionPanel | exported from `erp-record-workspace-form.tsx` | Section panel with lazyMount support (4C) |
| Record workspace form rule | `.cursor/rules/erp-record-workspace-form-standard.mdc` | 12 rules — IMPLEMENTED (was DRAFT in 4A) |
| PartyWorkspaceForm | `src/features/master-data/parties/party-workspace-form.tsx` | Party Master record form using ERPRecordWorkspaceForm — FIRST live use of 4C standard (4D) |
| UPDATE_TAB_ROUTE action | workspace-types.ts / workspace-store.ts | Mutates existing tab's route/entityId/formMode in-place after Add→Save (4D) |
| updateTabRoute() | `src/hooks/use-workspace.ts` | Hook helper dispatching UPDATE_TAB_ROUTE (4D) |
| SYNC_ROUTE pathname fix | workspace-store.ts / workspace-provider.tsx | SYNC_ROUTE and openTab now compare by pathname (strip `?`) to correctly handle query-param routes (4D) |

**Source audit (2026-06-12):** ERPDrawerForm ~27 files, ERPFormFooter ~25, useFormDirty ~25, comingSoon ~11 refs in sidebar.

---

## 6.10 Customer Reference Implementation

**Copy this pattern for Vendors and all party-master modules.**

| Area | Path / detail |
|---|---|
| Prefetch declaration | `src/features/master-data/customers/customer-prefetch.ts` → `CUSTOMER_FORM_PREFETCH` |
| Prefetch hook | `hooks/use-customer-form-prefetch.ts` — page mount + click |
| List | `components/customers-table.tsx` |
| Drawer | `components/customer-form-drawer.tsx` — tabs, Safe Close, FormData safety |
| Child hooks | `hooks/use-customer-child-queries.ts` → `useChildTableQuery` |
| Child sections | contacts, addresses, bank-details sections + skeleton loaders |
| Server actions | `server/actions/master-data/customers.ts` + 3 child action files |
| Numbering | `CUSTOMER`, `CUSTOMER_CONTACT` via `generateNextReference` |
| Permissions | `master_data.party_master.view` / `.manage` |
| **3B.7 fix** | `effectiveCustomerId = currentCustomer?.id ?? createdCustomerId` — unlock child sections after Add→Save |
| **3B.6G.3B fix** | Child staleTime 5 min; section-level lookup prefetch |
| Documents tab | Static DMS placeholder — not implemented |
| Sales owner | `sales_owner_user_profile_id` in schema — **no UI picker** |

---

## 6.11 Party Master Rules (REV1 Plan)

From `ERP_BASE_002F_3E_PEOPLE_CONTACTS_CRM_FOUNDATION_TECHNICAL_IMPLEMENTATION_PLAN_REV1.md`.

### Classification types (lookup categories — verified in live DB)

**Customer types:** NORMAL_CUSTOMER, GOVERNMENT_CUSTOMER, SEMI_GOVERNMENT_CUSTOMER, UTILITY_COMPANY, WATER_POWER_PLANT, INDUSTRIAL_CUSTOMER, COMMERCIAL_CUSTOMER, MAIN_CONTRACTOR, EPC_CONTRACTOR, SCRAP_BUYER, SCRAP_SUPPLIER, PARTNER_CUSTOMER.

**Vendor types:** SUPPLIER, MATERIAL_SUPPLIER, EQUIPMENT_SUPPLIER, SERVICE_PROVIDER, TRANSPORTER, TRANSPORT_SERVICE_PROVIDER, LOGISTICS_SERVICE_PROVIDER, PRIVATE_WASTE_DISPOSAL_FACILITY, WASTE_DISPOSAL_SERVICE_PROVIDER, INSURANCE_COMPANY, PROPERTY_LESSOR, VEHICLE_LESSOR, EQUIPMENT_LESSOR, CAMP_ACCOMMODATION_LESSOR, UTILITY_PROVIDER.

**Subcontractor types:** TRANSPORTER, TRANSPORT_SUBCONTRACTOR, CIVIL_SUBCONTRACTOR, MANPOWER_SUBCONTRACTOR, DEMOLITION_SUBCONTRACTOR, EQUIPMENT_SUBCONTRACTOR, SPECIALIZED_SUBCONTRACTOR, PARTNER_SUBCONTRACTOR.

**Government authority types:** LICENSE_ISSUER, PERMIT_ISSUER, UTILITY_AUTHORITY, TRANSPORT_AUTHORITY, PORT_AUTHORITY, CUSTOMS_AUTHORITY, GOVERNMENT_WASTE_DISPOSAL_AUTHORITY, MUNICIPALITY, POLICE, CIVIL_DEFENSE, ENVIRONMENTAL_AUTHORITY, FREE_ZONE_AUTHORITY, REGULATOR, MINISTRY.

### Dual-classification rules

| Scenario | Classification |
|---|---|
| Transporter as ongoing service provider | **Vendor** |
| Transporter hired for project execution | **Subcontractor** |
| Private waste disposal facility | **Vendor** |
| Government/municipality waste disposal | **Government Authority** |
| Recruitment agencies | Separate table; vendor-like for **payments** |
| Government authorities bank details | **No bank_details table by design** |

---

## 6.12 Important File List

### Standards
```
docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md
docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
docs/standards/ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md
```

### Global components & layout
```
src/components/erp/erp-drawer-form.tsx
src/components/erp/erp-form-footer.tsx
src/components/erp/combobox/erp-combobox.tsx
src/components/erp/lookup-select.tsx
src/components/layout/app-sidebar.tsx
src/components/layout/app-providers.tsx
```

### Query / cache
```
src/lib/query/query-keys.ts
src/lib/query/prefetch-lookups.ts
src/lib/query/invalidation.ts
src/hooks/child-tables/use-child-table-query.ts
src/lib/lookups/master-data-fetchers.ts
```

### Customer (reference)
```
src/features/master-data/customers/customer-prefetch.ts
src/features/master-data/customers/hooks/use-customer-form-prefetch.ts
src/features/master-data/customers/hooks/use-customer-child-queries.ts
src/features/master-data/customers/components/customer-form-drawer.tsx
src/server/actions/master-data/customers.ts (+ child action files)
```

### Org / Branch prefetch
```
src/features/organizations/organization-prefetch.ts
src/features/branches/branch-prefetch.ts
```

### Future party templates
```
src/lib/standards/party-master-prefetch-templates.ts
```

### Auth / RBAC
```
src/lib/rbac/check.ts
src/lib/supabase/server.ts
src/middleware.ts
```

### Dev harnesses (DELETE before production)
```
src/app/dev/performance-qa/
src/app/dev/customer-prefetch-qa/
src/app/dev/customer-child-qa/
```

### Latest closure reports
```
implementation_Review/Phase_002F_3E_4_Closure/ERP_BASE_002F_3E_4_CURRENT_MODULES_GLOBAL_QA_GATE_REPORT.md
implementation_Review/Phase_002F_3E_3B7_Closure/ERP_BASE_002F_3E_3B_7_CUSTOMER_MODULE_FINAL_QA_AND_CLOSURE_REPORT.md
```

### Planning / roadmap (reference — may be stale)
```
implementation_Review/ERP_FULL_IMPLEMENTATION_ROADMAP_PHASE_TRACKER.md
Phase_002F_3A_Master_Data_Inventory/ERP_BASE_002F_3A_R_REVISED_MASTER_DATA_ARCHITECTURE_AND_MENU_PLAN.md
ERP_FULL_IMPLEMENTATION_GUIDE_FOR_NEXT_CHAT.md
```

---

## 6.13 Known Technical Debt

| Item | Severity | Action |
|---|---|---|
| Dev harnesses `/dev/*` | Pre-deploy | Delete before production |
| Lint debt (~60 errors, `lookups.ts`) | Non-blocking | Cleanup phase |
| middleware → proxy deprecation | Non-blocking | Next.js 16 migration |
| Numbering page empty shell for unauthorized | Minor | UX improvement |
| Organization/Branch legacy text-column sync | Design debt | FK migration deferred for Branch |
| Customer Documents tab | Expected | Await 002F.4 DMS readiness |
| Customer module inert wrapper | Minor UX | `CustomerFormDrawer` needs `childDialogOpen` state + `inert`/`opacity-50` wrapper — tracked for ERP GLOBAL UI.3 |
| `erp-send-email-dialog.tsx` | Minor UX | Allowed exception from `ERPChildDialogForm` — complex custom header; partially conforms (overlay + sticky footer applied) |
| Customer sales owner picker | Future | Column exists, no UI |
| Browser-authenticated QA | Pending | Sameer/Dina manual pass |
| Stale phase trackers | Documentation | Trust this file + closure reports |
| Dashboard demo KPIs | Placeholder | Replace when real modules exist |

---

## 6.14 Next Recommended Phases

| Order | Phase | Notes |
|---|---|---|
| 1 | **Sameer: Complete browser QA checklist** | Walk the manual checklist in `ERP_GLOBAL_UI_4F_RUNTIME_QA_AND_PERFORMANCE_GATE_REPORT.md` to formally close 4F |
| 2 | **ERP GLOBAL UI.3 — Customer Module Inert Wrapper** | *(quick)* Add `childDialogOpen` state + `inert` wrapper to `CustomerFormDrawer`; apply `onChildOpen` prop to all three child sections |
| 3 | **002F.4 — Attachment / Documents Placeholder Readiness** | DMS pattern before more party masters |
| 4 | **Vendors** | First new UI party-master module using ERPRecordWorkspaceForm (UI.4D pattern) |
| 5 | Subcontractors | Same pattern as Vendors |
| 6 | Consultants | Same pattern |
| 7 | Government Authorities | No bank details child |
| 8 | Recruitment Agencies | Same pattern |
| 9 | Production cleanup | Delete dev harnesses, lint, middleware, manual QA |

> Vendors and all future party-master modules should use `PartyWorkspaceForm` as the reference pattern (not `CustomerFormDrawer`), since 4D is now the canonical workspace record-tab implementation.
> All new list/table screens must pass a unique `tableId` to `ERPDataTable` — workspace search/filter/pagination persistence is automatic.

---

## 6.15 Update Protocol

### At phase START
1. Read **this file** (`.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`)
2. Read `.cursor/rules/algt-erp-source-of-truth.mdc`
3. Read the **phase prompt** (`ChatGPT/...`)
4. Read **latest relevant reports** in `implementation_Review/`
5. Connect **`user-supabase`** if DB work involved — confirm `mmiefuieduzdiiwnqpie`
6. Confirm module status (LIVE / PLANNED / DB-READY) before coding

### At phase END
1. Create phase report in `implementation_Review/Phase_XXX/`
2. **Update this file:** phase row, files changed, bugs fixed/deferred, next phase
3. Optionally sync `ERP_FULL_IMPLEMENTATION_GUIDE_FOR_NEXT_CHAT.md` if handoff-relevant
4. Run `npm run typecheck` (and `npm run build` for implementation phases)
5. **Stop** — do not start next phase without approval

### Phase completion log (append new rows here)

| Date | Phase | Status | Report file | Updated by |
|---|---|---|---|---|
| 2026-06-12 | 002F.3E.4 | PASS WITH NOTES | `Phase_002F_3E_4_Closure/ERP_BASE_002F_3E_4_CURRENT_MODULES_GLOBAL_QA_GATE_REPORT.md` | Initial source-of-truth creation |
| 2026-06-12 | Cursor SOT setup | CREATED | `Phase_002F_3E_4_Handoff/ERP_CURSOR_SOURCE_OF_TRUTH_GUIDE_CREATION_REPORT.md` | Initial |
| 2026-06-14 | ERP GLOBAL UI.4B | COMPLETE ✅ | `ERP_GLOBAL_UI_4B_DIRTY_STATE_AND_SAFE_CLOSE_INTEGRATION_IMPLEMENTATION_REPORT.md` | Cursor |
| 2026-06-14 | ERP GLOBAL UI.4C | COMPLETE ✅ | `ERP_GLOBAL_UI_4C_WORKSPACE_RECORD_FORM_STANDARD_IMPLEMENTATION_REPORT.md` | Cursor |
| 2026-06-14 | ERP GLOBAL UI.4D | COMPLETE ✅ | `ERP_GLOBAL_UI_4D_PARTY_MASTER_PILOT_CONVERSION_IMPLEMENTATION_REPORT.md` | Cursor |
| 2026-06-14 | ERP GLOBAL UI.4E | COMPLETE ✅ | `ERP_GLOBAL_UI_4E_SYSTEM_WIDE_WORKSPACE_CACHE_STATE_OVERLAY_AND_FORM_STANDARD_FIXES_IMPLEMENTATION_REPORT.md` | Cursor |
| 2026-06-14 | ERP GLOBAL UI.4E.1 | COMPLETE ✅ | `ERP_GLOBAL_UI_4E_1_SYSTEM_WIDE_WORKSPACE_STATE_ISOLATION_FORM_CONVERSION_IMPLEMENTATION_REPORT.md` | Cursor |
| 2026-06-14 | ERP GLOBAL UI.4E.2 | COMPLETE ✅ | `ERP_GLOBAL_UI_4E_2_WORKSPACE_UNSAVED_FORM_DRAFT_PRESERVATION_IMPLEMENTATION_REPORT.md` | Cursor |
| 2026-06-14 | ERP GLOBAL UI.4E.2 Post-Verification | CLOSED / PASS ✅ | Same report — post-verification section added; 27/27 criteria PASS; defaultValue warning fix + party_code counter resync applied | Cursor |
| 2026-06-14 | ERP GLOBAL UI.4F | PASS WITH NOTES | `ERP_GLOBAL_UI_4F_RUNTIME_QA_AND_PERFORMANCE_GATE_REPORT.md` — Source-level PASS; TS+build PASS; 2 bugs fixed; browser interactive checklist pending Sameer | Cursor |
| 2026-06-14 | ERP GLOBAL CLEANUP.1 | CLOSED / PASS ✅ | `ERP_GLOBAL_CLEANUP_1_REMOVE_LEGACY_CUSTOMER_MODULE_AND_TEST_DATA_REPORT.md` — Legacy Customer module fully retired. 3 routes redirect. 11 feature files deleted. 4 server actions deleted. 2 dev harnesses deleted. DB: 5 tables dropped, 2 retained (FK). TS+build PASS. | Cursor |
| 2026-06-14 | ERP PARTY MASTER UX FIX.1 | CLOSED / PASS ✅ | `ERP_PARTY_MASTER_UX_FIX_1_FILTERED_VIEW_DEFAULT_PARTY_TYPE_IMPLEMENTATION_REPORT.md` — Add from filtered view now preselects party type via `?defaultType=` query param. 2 files changed, pre-existing wiring in form + types-tab complete. TS+build PASS. | Cursor |
| 2026-06-14 | ERP BANK MASTER STANDARD.1 | CLOSED / PASS ✅ | `ERP_BANK_MASTER_STANDARD_1_UNIFY_BANK_MASTER_REMOVE_PARTY_BANK_DUPLICATION_REPORT.md` — `/parties/banks` redirects; Banks removed from Party Master sidebar; BankSelect added to party-bank-details-tab; read-only bank info panel; "+ New Bank" shortcut. BANK type never existed in DB. TS+build PASS. | Cursor |
| 2026-06-14 | ERP GLOBAL UI.4G | CLOSED / PASS ✅ | `ERP_GLOBAL_UI_4G_CHILD_FORM_MODAL_WORKSPACE_BLOCKING_AND_UX_STANDARD_FIX_REPORT.md` — `ERPChildDialogForm` overlay `z-[100]`, content `z-[110]`; tab bar lowered to `z-[30]`; combobox raised to `z-[120]`; outside click/Esc blocked; `isChildDialogOpen` added to `UserWorkspaceForm`. 13 child forms audited, all using ERPChildDialogForm. TS+build PASS. | Cursor |
| 2026-06-14 | ERP GLOBAL CLEANUP.2 | CLOSED / PASS ✅ | `ERP_GLOBAL_CLEANUP_2_DELETE_LEGACY_DEAD_FORM_DIALOG_FILES_REPORT.md` — 21 legacy `*-form-dialog.tsx` files deleted (Finance 6, Geography 5, Admin 4, Lookups 2, UOM 3, Users 1). Zero active imports confirmed for each. No stale barrel references. TS+build PASS. | Cursor |
| 2026-06-14 | ERP DMS.1 | CLOSED / PLAN COMPLETE | `implementation_Review/Phase_DMS_1_Planning/ERP_DMS_1_AI_READY_ENTERPRISE_DMS_RESEARCH_AND_ARCHITECTURE_PLAN.md` — DMS.1 architecture plan: 14-phase DMS roadmap, database schema (20+ tables), Supabase Storage strategy, AI workflow, provider abstraction interfaces. Planning only. | Cursor |
| 2026-06-14 | ERP DMS.1A | CLOSED / PLAN COMPLETE | `implementation_Review/Phase_DMS_1_Planning/ERP_DMS_1A_ARCHITECTURE_REVIEW_CORRECTIONS_EXISTING_DOCUMENT_INVENTORY_AND_FINAL_APPROVAL_GATE.md` — DMS.1A review: existing ERP document audit, migration plan for party_documents/party_document_types, revised 16-phase plan, 13 open decisions. Planning only. | Cursor |
| 2026-06-14 | ERP SETTINGS.1 | CLOSED / PASS ✅ | `implementation_Review/ERP_SETTINGS_1_AI_SETTINGS_PROVIDER_CONFIGURATION_IMPLEMENTATION_REPORT.md` — AI Settings foundation: 3 tables (erp_ai_provider_configs, erp_ai_usage_logs, erp_ai_feature_flags), 5 permissions, 6 seeded providers (all disabled), 7 feature flags, server actions, AI Settings UI (/admin/settings/ai), provider abstraction (factory + openai + local), rule files normalized to .cursor/rules/. TS+lint PASS. | Cursor |
| 2026-06-16 | ERP DMS.14 | CLOSED / PASS ✅ | `implementation_Review/ERP_DMS_14_SECURITY_RLS_CONFIDENTIALITY_PERMISSION_QA_IMPLEMENTATION_REPORT.md` — RLS+security QA complete. 4 overly-broad policies fixed. Factory.ts admin client fix. TS+build PASS. Roadmap renumbered (DMS.15 = Integration Readiness). | Cursor |
| 2026-06-15 | ERP SETTINGS.2 | CLOSED / PASS ✅ | `implementation_Review/ERP_SETTINGS_2_EMAIL_PROVIDER_MICROSOFT_365_GRAPH_CONFIGURATION_IMPLEMENTATION_REPORT.md` — Email provider foundation: 3 tables (erp_email_provider_configs/send_logs/feature_flags), 6 permissions, 2 seeded providers (M365_DEFAULT + NOTIFICATIONS_DEFAULT, disabled), 7 feature flags (all disabled except SYSTEM_TEST_EMAIL). Provider abstraction: src/lib/email/providers/ (types, factory, microsoft-graph-provider — client_credentials flow, fetch-native, no SDK). Server actions: email-settings.ts (11 actions: CRUD + secret + test connection + test send + logs + flags). UI: email-settings-page-client + list + form + secret dialog + test dialog + flags + log table + security notice. Route /admin/settings/email. Sidebar item. No plain secret in DB. TS PASS. Build PASS. Next: ERP NOTIFICATIONS.1. | Cursor |

---

## 6.16 Global Standards Added in UI.4E / UI.4E.1

### Workspace cache (all implemented modules)

- All implemented workspace list/table screens preserve safe UI state (search text, page index, sort, column layout) via `ERPDataTable` built-in extended preferences.
- All future list/table screens must pass a unique `tableId` to `ERPDataTable`. No additional code needed for persistence.
- **Table state scoping (UI.4E.1):** `ERPDataTable` localStorage key includes route path (`erp_table_prefs:v2:{userId}:{normalizedRoute}:{tableId}`) — ensures no cross-screen state leakage.
- All `ERPRecordWorkspaceForm` usages must use `useWorkspaceSectionState` to persist active section.
- Scroll state via `useWorkspaceScrollState` + `bodyScrollRef` prop is strongly recommended for new record forms.
- Never persist passwords, tokens, Supabase sessions, PII, bank account numbers, IBAN, or unsaved form field values in localStorage.

### ERPCombobox z-index fix

- ERPCombobox renders its dropdown at `z-[80]` (overrides base `z-50`) via global change in `erp-combobox.tsx`.
- Dropdown appears above ERPChildDialogForm content (`z-[70]`) everywhere in the app.
- No per-form hacks needed.

### Child dialog z-index fix (UI.4E.1)

- `WorkspaceTabBar` is now `z-[100]` with `pointer-events-auto` — child dialogs (z-[60]/z-[70]) can never block tab switching.
- `ERPChildDialogForm` is for child entity editing only (contacts, addresses, bank details, etc.). It scopes to its parent tab.

### Form standard (UI.4E.1 — FINAL)

| Form Type | Component | When to Use |
|---|---|---|
| **Main record (Add/Edit/View)** | `ERPRecordWorkspaceForm` | All primary CRUD entities — opens as workspace tab via `router.push(/record/new)` or `/record/[id]` |
| **Child entity** | `ERPChildDialogForm` | Child records within a parent entity (contacts, addresses, bank details, party types, etc.) |
| `ERPDrawerForm` | **DEPRECATED for CRUD** | Legacy only — do not use for new Add/Edit/View forms |

### Modules converted to ERPRecordWorkspaceForm (UI.4E.1)

- **Finance Basics**: Banks, Currencies, Payment Terms, Tax Types, Cost Centers, Profit Centers
- **UOM**: Categories, Units, Conversions
- **Geography**: Countries, Emirates, Cities, Areas, Ports
- **Lookups**: Categories, Values
- **Admin**: Roles, Organizations, Branches, Numbering Rules
- **Legacy Customer**: Add/Edit/View
- **Party Master** (4D): Add/Edit/View (reference pattern)
- **Party Admin Masters**: Types, Service Categories, Relationship Types — correctly use `ERPChildDialogForm` (embedded child tables, no conversion needed)

### New hooks (UI.4E)

| Hook | Purpose |
|------|---------|
| `src/lib/workspace/workspace-page-state.ts` | Low-level localStorage utilities |
| `src/hooks/use-workspace-page-state.ts` | Generic page state hook |
| `src/hooks/use-workspace-table-state.ts` | Table state hook (custom table state) |
| `src/hooks/use-workspace-section-state.ts` | Active section persistence |
| `src/hooks/use-workspace-scroll-state.ts` | Scroll position persistence |

### Documentation

- `docs/standards/ERP_GLOBAL_WORKSPACE_OPEN_ELEMENT_CACHE_STANDARD.md` — full standard reference

---

*End of ALGT ERP Source of Truth. Update after every phase.*
