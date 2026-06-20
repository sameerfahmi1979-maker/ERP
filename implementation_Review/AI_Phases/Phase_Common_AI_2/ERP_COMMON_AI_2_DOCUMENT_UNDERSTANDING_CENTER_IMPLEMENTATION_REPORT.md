# ERP COMMON AI.2 — AI Document Understanding Center — Implementation Report

**Phase:** ERP COMMON AI.2  
**Date:** 2026-06-17  
**Status:** CLOSED / PASS ✅  
**Scope:** Read-only aggregated intelligence view for DMS document records  

---

## Summary

Added an "Understanding" tab to the DMS document record that presents a unified, professional, human-readable intelligence view aggregating all existing DMS AI outputs. No new AI calls, no DB migration, no writes of any kind. Feature-gated by `ERP_AI_DOC_UNDERSTANDING` (currently disabled).

---

## Files Created / Changed

| File | Action |
|---|---|
| `src/lib/dms/understanding/types.ts` | **Created** — `DmsDocumentUnderstanding` view model types |
| `src/lib/dms/understanding/understanding-builder.ts` | **Created** — pure helper functions: health score, recommended actions, expiry status, label sanitization |
| `src/server/actions/dms/document-understanding.ts` | **Created** — `getDmsDocumentUnderstanding()` server action |
| `src/features/dms/documents/sections/dms-document-understanding-section.tsx` | **Created** — full tab UI with all intelligence cards |
| `src/features/dms/documents/dms-document-record-form.tsx` | **Updated** — added Understanding tab (after AI Analysis, before Approvals) |
| `src/lib/query/query-keys.ts` | **Updated** — `queryKeys.dms.documentUnderstanding(id)` |
| `src/lib/query/invalidation.ts` | **Updated** — `invalidateDmsDocumentUnderstanding()` |
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | **Updated** |

**No DB migration created.** ✅

---

## Server Action Summary

**`getDmsDocumentUnderstanding(documentId)`** in `src/server/actions/dms/document-understanding.ts`:

- Auth: `dms.documents.view` OR `dms.admin` OR `system_admin`
- Feature flag: `ERP_AI_DOC_UNDERSTANDING` — returns `FEATURE_DISABLED` if off
- Queries ~11 tables in sequence (all with document_id indexes)
- Confidentiality gate: hr/legal/executive summary text → null for non-admin
- Returns `DmsDocumentUnderstanding` view model

**Never returned:**
- Raw OCR text
- `content_text` body (char_count/source only)
- Prompt text
- Raw AI response JSON
- Embedding vectors
- API keys
- Raw extracted sensitive field values

---

## UI Section Summary

**`DmsDocumentUnderstandingSection`** renders 12 intelligence cards:

| Card | Data source |
|---|---|
| Overall Health (0-100 score) | Computed by `calculateDocumentUnderstandingHealth()` |
| Document Identity | `dms_documents` + type/category joins |
| OCR & Text Status | `dms_document_files` + `dms_document_content` (metadata) |
| AI Summary | `dms_documents.ai_summary*` (confidentiality gated) |
| AI Classification | `dms_ai_extraction_results` (count/confidence only) |
| Completeness | `dms_documents.completeness_score` + label extraction |
| Risk | `dms_documents.ai_risk_*` + label extraction |
| Semantic Embedding | `dms_documents.summary_embedding_*` |
| Tags & Links | `dms_document_tags` + `dms_ai_*_suggestions` + `dms_document_links` |
| ORCH.1 Pipeline | `dms_upload_sessions.orchestration_steps_json` |
| Field Candidates | COMMON AI.1 registry + `erp_ai_field_suggestions` count |
| Recommended Actions | Computed by `buildRecommendedUnderstandingActions()` |

---

## Feature Flag Behavior

| Flag state | UI behavior |
|---|---|
| `ERP_AI_DOC_UNDERSTANDING = false` | Understanding tab visible; shows disabled notice with link to AI Settings |
| `ERP_AI_DOC_UNDERSTANDING = true` | Full aggregation runs; all 12 cards render |

**Flag remains `false` in live DB.** Enable manually for UAT:
```sql
UPDATE erp_ai_feature_flags SET is_enabled=true WHERE feature_code='ERP_AI_DOC_UNDERSTANDING';
```

---

## Data Sources Used

| Table | Usage |
|---|---|
| `dms_documents` | Core intelligence columns (19 fields) |
| `dms_document_files` | OCR status per file |
| `dms_document_content` | char_count, is_truncated, source — never body |
| `dms_ai_extraction_results` | ai_status, confidence, field count — never raw values |
| `dms_document_metadata_values` | filled/total count |
| `dms_document_tags` + `dms_tags` | tag names |
| `dms_ai_tag_suggestions` | pending count |
| `dms_document_links` | entity type/id/primary + display name lookup |
| `dms_ai_link_suggestions` | pending count |
| `dms_upload_sessions` | orchestration_status + steps |
| `erp_ai_field_suggestions` | pending count per entity |
| COMMON AI.1 registry | `getCommonAiEntityRegistry()` — pure TypeScript |

---

## Confidentiality / Security Summary

| Rule | Implemented |
|---|---|
| hr/legal/executive summary redacted for non-admin | ✅ Server-side gate |
| No raw OCR text returned | ✅ |
| No content_text body returned | ✅ char_count only |
| No raw AI response | ✅ |
| No embedding vector | ✅ |
| No API keys | ✅ |
| No extracted sensitive values | ✅ labels only |
| No direct OpenAI imports | ✅ |

---

## Field Candidates Behavior

- Preview-only: shows COMMON AI.1 registry fields for the linked company or party
- Marks high relevance when document type code matches a field's `documentTypeHints`
- Shows pending suggestion count from `erp_ai_field_suggestions`
- Provides link to entity AI Review tab (`/admin/organizations/record/[id]` or `/admin/master-data/parties/record/[id]`)
- Does **NOT** call `generateAiFieldSuggestions`
- Does **NOT** apply suggestions
- Branch/site entities: shows "preview not available" message

---

## What Was Explicitly Not Implemented

| Item | Status |
|---|---|
| DB migration | ❌ None |
| Snapshot/cache table | ❌ Deferred to v2 |
| New AI calls | ❌ None |
| Auto-apply field suggestions | ❌ None |
| Auto-approve documents | ❌ None |
| Dedicated `/understanding` route | ❌ Deferred |
| Admin-wide understanding dashboard | ❌ Deferred |

---

## TypeScript / Build Results

| Check | Result |
|---|---|
| `npm run typecheck` | **PASS** (0 errors) |
| `npm run build` | **PASS** |

Initial typecheck had 3 errors (`Progress` component not in project, `asChild` prop not in Button). Both fixed by using native HTML elements instead.

---

## UAT Checklist

1. Open DMS document record → confirm "Understanding" tab appears (after AI Analysis, before Approvals)
2. With flag disabled → confirm "AI Document Understanding is not enabled" message
3. Enable `ERP_AI_DOC_UNDERSTANDING` flag
4. Open document with full AI processing → all 12 cards render
5. Verify health score is computed (0–100)
6. Verify recommended actions are generated based on actual state
7. Open document with missing summary → "Generate AI Summary" appears in Recommended Actions
8. Open confidential (hr/legal) document as non-admin → summary card shows "Summary restricted"
9. Open document linked to Organization → Field Candidates show COMMON AI.1 fields with "Open Organization AI Review" link
10. Verify link opens correct entity record
11. Open document with no entity link → warning shown in Tags & Links card
12. Verify no raw OCR/content text visible anywhere in the tab
13. Confirm all 17 existing tabs still function correctly
14. Disable flag after UAT

---

## Risks / Open Questions

1. **N+1 entity name lookups**: Up to 5 entity name queries for linked entities. Acceptable for current scale; batch in v2 if needed.
2. **`dms_upload_sessions` missing for pre-ORCH.1 docs**: Handled — ORCH.1 section hidden if no session found.
3. **Field candidate relevance matching**: Uses `typeCode in documentTypeHints` — if type codes don't match exactly, falls to "general". May need prompt-level alignment in future.

---

## Recommended Next Phase

**ERP COMMON AI.3 — AI Duplicate / Conflict Detection**

Or per Sameer/Dina priority. COMMON AI.2 Understanding tab is complete and production-ready pending UAT flag enablement.

---

**End of Report**
