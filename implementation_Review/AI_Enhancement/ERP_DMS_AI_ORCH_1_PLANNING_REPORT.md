# ERP DMS AI ORCH.1 — Planning Report

**Phase:** ERP DMS AI ORCH.1 — One-Click Upload & Full AI Processing Pipeline  
**Date:** 2026-06-17  
**Status:** PLAN COMPLETE — Awaiting Sameer/ChatGPT Review  

---

## Files Reviewed

### Source code
- `src/server/actions/dms/ai-intake.ts` — Full audit of startAiIntakeFromUploadSession + approveAiIntakeAndCreateDocument
- `src/server/actions/dms/ocr.ts` — triggerDmsOcrForFile, persistFileOcrResult
- `src/server/actions/dms/ai-summary.ts` — generateAndSaveDmsAiSummary, bulkGenerateMissingSummaries
- `src/server/actions/dms/ai-intelligence.ts` — evaluateDmsDocumentIntelligence
- `src/server/actions/dms/ai-completeness.ts` — evaluateDmsDocumentCompleteness
- `src/server/actions/dms/ai-risk.ts` — evaluateDmsDocumentRisk
- `src/server/actions/dms/semantic-search.ts` — generateDmsDocumentEmbedding
- `src/server/actions/dms/ai-tags.ts` — suggestDmsDocumentTags
- `src/server/actions/dms/ai-links.ts` — suggestDmsDocumentLinks
- `src/server/actions/dms/batch-intake.ts` — createDmsUploadBatch, startAiIntakeAndCreateDraft
- `src/server/actions/dms/document-content.ts` — writeDocumentContentTextSystem
- `src/lib/dms/ai/factory.ts` — getDmsAiProvider
- `src/lib/dms/ocr/persist-file-ocr-result.ts` — persistFileOcrResult

### Implementation reports
- ERP DMS.11 (AI-first intake)
- ERP DMS.12.1–12.5 (content text, summary, intelligence, tags/links, embeddings)
- ERP DMS.13 (batch intake)
- ERP DMS.14 (security/RLS QA)
- ERP DMS.15 (integration readiness)

## DB Tables Reviewed (live DB via user-supabase)

| Table | Key finding |
|---|---|
| `dms_upload_sessions` | Has `intake_status`, `review_status`, `ai_job_id`, `ai_result_id` — room for new orchestration columns |
| `dms_upload_batches` | Has coarse status counts — sufficient for batch level tracking |
| `dms_documents` | Has all intelligence columns (ai_summary, completeness_score, ai_risk_level, summary_embedding_status) |
| `dms_document_files` | Has full OCR columns |
| `dms_document_content` | Exists with content_text, sha256, is_truncated |
| `dms_ai_tag_suggestions` / `dms_ai_link_suggestions` | Exist, ready for use |
| `erp_ai_usage_logs` | Ready for orchestration usage logging |
| `erp_ai_feature_flags` | All DMS_* flags enabled; `DMS_AI_ORCHESTRATION` doesn't exist yet — needs migration |

---

## Main Findings

### 1. Current flow is Phase A only

The current "Upload & AI Fill" runs only OCR + AI classification/extraction. 7 additional AI steps (summary, intelligence, embedding, tags, links) are manual-only. ORCH.1 automates these as best-effort post-draft steps.

### 2. All required AI flags are already enabled

`DMS_AI_SUMMARY`, `DMS_COMPLETENESS`, `DMS_RISK_SCORE`, `DMS_SEMANTIC_SEARCH`, `DMS_AUTO_TAGS`, `DMS_SMART_LINKS` are all enabled in live DB. The orchestrator just needs to call the existing internal helpers.

### 3. A new feature flag is required

`DMS_AI_ORCHESTRATION` does not exist. It must be seeded (default: false) so the orchestrator does nothing extra until explicitly enabled by admin. This prevents any behavioral change before UAT.

### 4. Internal helper extraction is required

The existing server actions (ai-summary.ts, ai-tags.ts, etc.) perform permission checks, auth context loading, and data loading at the top. Calling them from the orchestrator would:
- Double-check auth (inefficient)
- Require separate server action call overhead
- Potentially hit Next.js function call limits

The orchestrator should call internal helpers directly (after one top-level auth check). This requires extracting `_*Internal` functions from 5 existing files. This is a clean refactoring — no behavior change.

### 5. No new tables required for Phase 1

Adding `orchestration_status`, `orchestration_steps_json`, `orchestration_started_at`, `orchestration_completed_at` to `dms_upload_sessions` is sufficient for ORCH.1. New `dms_ai_orchestration_runs` tables deferred to ORCH.2.

### 6. The full pipeline should NOT be synchronous

Running all steps synchronously in one server action would likely timeout (OCR is already ~5–10s; summary ~3–5s; embedding ~1–2s; tags ~2s; links ~2s = 13–22 seconds total). Recommended approach: Phase A (critical path) runs synchronously and redirects to review screen. Phase B (best-effort) runs as a second orchestration call triggered by the client on intake review screen mount.

### 7. One-by-one approval preserved

ORCH.1 does not touch the approval flow. The orchestrator prepares drafts with AI intelligence — approval remains one-by-one, manually triggered by the user.

---

## Whether One-Phase Implementation is Recommended

**Yes, ORCH.1 can be implemented as one phase**, with these sub-components:

| Sub | Scope | Complexity |
|---|---|---|
| Migration | New columns on dms_upload_sessions + feature flag | Low |
| Internal helpers | Extract _*Internal from 5 server action files | Medium |
| pipeline-runner.ts | Safe step runner (try/catch each step) | Medium |
| orchestration.ts | 3 server actions | Medium |
| UI progress card | New component | Medium |
| Intake page update | Add orchestration call + progress card | Low |
| Batch queue update | Add per-draft status chips | Low |

**Total estimated complexity: Medium** — can be done in one focused implementation run.

---

## Whether Migration is Recommended

**Yes — one migration recommended.**

Contents:
1. 4 new nullable columns on `dms_upload_sessions` (orchestration tracking)
2. 1 new feature flag `DMS_AI_ORCHESTRATION` (default: false)

No new tables. No changes to existing tables beyond dms_upload_sessions.

---

## Whether Pipeline Should Be Synchronous or Stepwise

**Stepwise (two-phase client coordination):**

- **Phase A (synchronous, blocks redirect):** OCR + classification/extraction (existing startAiIntakeFromUploadSession)
- **Phase B (called from review screen on mount):** runDmsAiOrchestrationPostDraft — runs all best-effort steps, returns aggregate result with per-step status
- **Review screen:** Shows progress card, updates when Phase B completes

Phase B itself is one server action that runs steps sequentially with try/catch at each step. Total Phase B time: ~10–15s (summary 3–5s + embedding 1–2s + tags 2s + links 2s + intelligence <1s). This is acceptable for a Next.js server action. If it starts timing out, embedding can be deferred.

---

## Biggest Risks

| Risk | Impact | Note |
|---|---|---|
| Internal helper extraction breaks existing actions | High | Must be careful refactoring — no behavior change |
| Phase B timeout | Medium | Monitor during UAT; can defer embedding if needed |
| Feature flag confusion | Low | DMS_AI_ORCHESTRATION defaults off — no risk until explicitly enabled |
| Breaking one-by-one approval governance | Low | No approval logic touched — well-isolated |

---

## Recommended Next Action

**Sameer/ChatGPT review this plan and SQL review files.**

If approved:
1. Approve migration (Section 12 of plan / OPTIONAL_MIGRATION_REVIEW.sql)
2. Approve internal helper extraction approach
3. Approve two-phase client coordination approach
4. Issue implementation prompt referencing this plan

If corrections needed, update the plan before issuing implementation prompt.

**Do not start implementation before this plan is approved.**

---

**End of Planning Report**
