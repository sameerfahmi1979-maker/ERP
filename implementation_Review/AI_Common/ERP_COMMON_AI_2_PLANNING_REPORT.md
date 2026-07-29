# ERP COMMON AI.2 — AI Document Understanding Center — Planning Report

**Phase:** ERP COMMON AI.2 — Planning  
**Date:** 2026-06-17  
**Status:** PLAN COMPLETE — Awaiting Sameer/ChatGPT Review  

---

## Files Reviewed

### Source Code
- `src/features/dms/documents/dms-document-record-form.tsx` — 17 existing sections audited
- `src/features/dms/documents/sections/` — all 17 section components
- `src/server/actions/dms/document-understanding.ts` — does not exist yet (new)
- `src/server/actions/dms/ai-summary.ts` — summary generation pattern
- `src/server/actions/dms/ai-intelligence.ts` — completeness + risk
- `src/server/actions/dms/semantic-search.ts` — embedding status
- `src/server/actions/dms/ai-tags.ts` — tag suggestions
- `src/server/actions/dms/ai-links.ts` — link suggestions
- `src/server/actions/dms/orchestration.ts` — ORCH.1 status
- `src/lib/ai/common/registry/index.ts` — COMMON AI.1 entity registry
- `src/features/ai/common/field-suggestions/` — existing AI.1 UI

### DB Tables Reviewed (live DB via user-supabase)

| Table | Key finding |
|---|---|
| `dms_documents` | All 19 intelligence columns confirmed present (summary, completeness, risk, embedding) |
| `dms_document_content` | Has char_count, is_truncated, content_text_source — safe metadata available |
| `dms_document_files` | Has OCR status per file — use for OCR readiness check |
| `dms_ai_extraction_results` | Has ai_status, classification_score, field_confidence_json |
| `dms_document_links` | Has entity_type, entity_id, is_primary — used for entity identification |
| `dms_ai_tag_suggestions` | Has status column — pending count query safe |
| `dms_ai_link_suggestions` | Has status + confidence — pending count query safe |
| `dms_upload_sessions` | Has orchestration_status, orchestration_steps_json (ORCH.1 data) |
| `erp_ai_field_suggestions` | Has entity_type, entity_id, status — pending count by entity |

**All 9 tables have RLS ENABLED + FORCED.** ✅

### Feature Flags (live DB)

| Flag | State | Notes |
|---|---|---|
| `ERP_AI_DOC_UNDERSTANDING` | **false** | Pre-seeded by COMMON AI.0. Ready to use — no migration needed. |
| `DMS_AI_SUMMARY` | true | Summary data available |
| `DMS_COMPLETENESS` | true | Completeness data available |
| `DMS_RISK_SCORE` | true | Risk data available |
| `DMS_SEMANTIC_SEARCH` | true | Embedding data available |
| `DMS_AUTO_TAGS` | true | Tag suggestions available |
| `DMS_SMART_LINKS` | true | Link suggestions available |
| `DMS_AI_ORCHESTRATION` | true | ORCH.1 data available |

---

## Main Findings

### 1. All intelligence data already exists
Every data point needed for the Understanding Center is already stored in existing tables, fully indexed, and RLS-protected. No new AI calls are needed for the Understanding view.

### 2. DMS document record has 17 tabs — fragmented UX
Users must visit OCR tab, AI Summary tab, Intelligence tab, AI Analysis tab, and Semantic tab separately to understand a document's AI readiness. AI.2 consolidates this into one view.

### 3. ERP_AI_DOC_UNDERSTANDING flag ready to use
The flag is already seeded (`is_enabled = false`). No migration is needed — just enable for UAT.

### 4. COMMON AI.1 registry provides field candidates without DB query
The entity registry (`getCommonAiEntityRegistry`) is pure TypeScript, importable in server actions. Field candidates can be computed from the registry + a simple `erp_ai_field_suggestions` count query.

### 5. ORCH.1 data accessible via dms_upload_sessions
The `orchestration_steps_json` column on `dms_upload_sessions` (linked via `document_id`) provides the ORCH.1 pipeline result. Older documents without ORCH.1 have no session row — handled by optional display.

### 6. Confidentiality gates already defined
hr/legal/executive documents restrict AI summary to `dms.admin`. This gate is already implemented in existing actions and must be preserved in AI.2.

---

## Whether One-Phase Implementation is Recommended

**Yes — strongly recommended as one phase.**

Rationale:
- All data is available
- Architecture is read-only aggregation (no AI calls, no complex new logic)
- Feature is gated behind `ERP_AI_DOC_UNDERSTANDING` flag
- Estimated implementation complexity: Medium (2-3 Cursor sessions)
- No DB changes risk

---

## Whether Migration is Recommended

**No migration recommended.**

- `ERP_AI_DOC_UNDERSTANDING` flag already exists
- All intelligence columns already in `dms_documents`
- All related tables already have appropriate indexes and RLS

---

## Whether Cache/Snapshot Table is Recommended

**Not recommended in v1.**

- Live aggregation expected to complete in ~100-150ms
- Tab is lazy-loaded (only queries when user opens it)
- If performance issues arise in production, `dms_document_understanding_snapshots` table design is included in the optional migration review SQL for future consideration

---

## Biggest Risks

| Risk | Assessment |
|---|---|
| Pre-ORCH.1 documents have no `dms_upload_sessions` row | Easy to handle: skip ORCH.1 section if no session found |
| Confidential document summary accidentally shown | Mitigated: double gate — server action + component level |
| Users confused about "Preview only" for field candidates | Design risk — clear UX copy required ("Link to entity to generate suggestions") |
| 17-tab navigation is already crowded | Product decision: Understanding tab is high-value enough to justify |
| Registry import in server action side effect (module-level validation) | Known: `validateCommonAiRegistry()` runs at import — ensure server action import path is safe |

---

## Recommended Next Action

**Sameer/ChatGPT review this plan and SQL review files before issuing the implementation prompt.**

Key approval decisions needed:
1. Confirm one-phase implementation approach
2. Confirm tab placement (after AI Analysis, before Approvals)
3. Confirm field candidates are preview-only (no generate in AI.2)
4. Confirm no DB migration for v1
5. Answer: Should Understanding tab be visible (with disabled message) when flag=off, or completely hidden?
6. Answer: Should there be a dedicated `/dms/documents/[id]/understanding` route in addition to the tab?

---

**End of Planning Report**
