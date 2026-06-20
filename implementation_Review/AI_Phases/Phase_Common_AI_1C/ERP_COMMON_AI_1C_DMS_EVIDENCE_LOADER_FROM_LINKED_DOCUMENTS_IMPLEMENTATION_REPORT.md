# ERP COMMON AI.1C — DMS Evidence Loader from Linked Documents — Implementation Report

**Phase:** ERP COMMON AI.1C  
**Date:** 2026-06-16  
**Status:** CLOSED / PASS ✅  
**Scope:** Code-only — DMS evidence loader library, sanitizer, type extension, server action wiring  

---

## Summary

Built the server-side DMS evidence loader that prepares sanitized evidence snippets from linked DMS documents for the future Universal Internal AI Field Suggestion Engine. No AI calls, no suggestion generation or storage, no UI, no target record writes.

---

## Files Created / Changed

| File | Action |
|---|---|
| `src/lib/ai/common/field-suggestions/evidence-loader.ts` | **Created** — main evidence loader + preview helper |
| `src/lib/ai/common/field-suggestions/evidence-sanitizer.ts` | **Created** — text sanitization + confidentiality helpers |
| `src/lib/ai/common/types.ts` | **Updated** — extended `ErpAiDocumentEvidenceSnippet` with new optional fields |
| `src/lib/ai/common/index.ts` | **Updated** — added evidence-sanitizer exports + evidence-loader types |
| `src/server/actions/ai/common/field-suggestions.ts` | **Updated** — wired evidence loading into `generateAiFieldSuggestions` skeleton |
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | **Updated** — phase closure + tracker row |

**No DB migration** — code-only phase as expected.

---

## Scope Summary

Phase 1C is a pure TypeScript library phase. The evidence loader:
- Loads only documents linked via `dms_document_links` (never fuzzy-searched or guessed)
- Returns sanitized `ErpAiDocumentEvidenceSnippet[]`
- Applies DMS confidentiality gates (hr/legal/executive excluded for non-admin)
- Caps all text to `ERP_COMMON_AI_*` constants
- Makes no AI calls
- Writes nothing to DB

---

## Evidence Loader Summary

File: `src/lib/ai/common/field-suggestions/evidence-loader.ts`

### `loadLinkedDmsDocumentEvidence(input)`

| Property | Value |
|---|---|
| Evidence source | `dms_document_links` (entity_type + entity_id + deleted_at IS NULL) |
| Document fields loaded | id, document_no, title, description, confidentiality_level, issue_date, expiry_date, ai_summary, ai_risk_level, ai_risk_score, completeness_score, document_type (code + name), category (name) |
| Content source priority | 1. ai_summary → 2. dms_document_content.content_text → 3. dms_document_files.ocr_text → 4. title+description |
| Text caps | snippet: 500 chars, content: 2000 chars |
| Confidentiality filter | hr/legal/executive skipped for non-admin |
| Max documents | Configurable via `maxDocuments` (default: `ERP_COMMON_AI_MAX_EVIDENCE_SNIPPETS` = 10) |
| Returns | `EvidenceLoadResult` with `snippets[]`, `totalLinked`, `skippedConfidential`, `skippedNoContent` |

### `previewLinkedDmsDocumentCount(input)` (safe admin helper)

Returns document count, IDs, and skipped count only — no content. Used for diagnostics.

---

## Evidence Sanitizer Summary

File: `src/lib/ai/common/field-suggestions/evidence-sanitizer.ts`

| Function | Purpose |
|---|---|
| `sanitizeEvidenceText(text)` | Removes control chars, collapses whitespace/newlines |
| `sanitizeAndCapText(input, maxChars)` | Sanitizes + caps to maxChars (null if empty) |
| `buildContentSnippet(input)` | Builds contentSnippet + sourceKind from available text sources |
| `isDocumentEvidenceAllowedForUser(confidentiality, isAdmin)` | Confidentiality gate check |
| `RESTRICTED_CONFIDENTIALITY_LEVELS` | Set of `"hr" \| "legal" \| "executive"` |

---

## `ErpAiDocumentEvidenceSnippet` Type Extension

Extended backward-compatibly in `types.ts`. Added optional fields:

| Field | Type | Purpose |
|---|---|---|
| `documentNo` | `string \| null` | DMS document number |
| `documentType` | `string \| null` | Human-readable type name |
| `categoryName` | `string \| null` | DMS category |
| `riskLevel` | `string \| null` | AI risk level |
| `completenessScore` | `number \| null` | DMS completeness score |
| `sourceKind` | `"ai_summary" \| "content_text" \| "ocr_text" \| "metadata"` | Which source populated snippet |

Existing fields (`contentSnippet`, `documentTypeCode`, `documentTitle`, `issueDate`, `expiryDate`, `aiSummarySnippet`) are unchanged. `sourceKind` is now required (breaking change within the type — no callers existed yet in Phase 1B).

---

## Confidentiality / Security Summary

| Rule | Implemented |
|---|---|
| hr/legal/executive excluded for non-admin | ✅ `isDocumentEvidenceAllowedForUser()` |
| AI summary redacted for non-admin on restricted docs | ✅ Double-gated |
| Full OCR text never returned | ✅ Capped to 2000 chars then snippet to 500 |
| Full content_text never returned | ✅ Same cap |
| Raw AI extraction JSON never returned | ✅ Not loaded |
| Evidence text never logged | ✅ No console.log/logAudit with content |
| API keys never exposed | ✅ N/A (no AI calls) |
| Documents sourced from entity links only | ✅ `entity_type + entity_id` filter on `dms_document_links` |

---

## Server Action Integration

Updated `generateAiFieldSuggestions` in `src/server/actions/ai/common/field-suggestions.ts`:

1. All Phase 1B gates pass (feature flag, permissions, registry, stage)
2. **Phase 1C:** Calls `loadLinkedDmsDocumentEvidence()` — loads and sanitizes evidence
3. Returns safe metadata response (document count only — no snippets to client)
4. Still returns "not implemented" error for Phase 1D

Error message returned includes safe diagnostic counts: `"Evidence loaded (N document(s) from M linked, K confidential skipped)"`.

No evidence snippet content is returned to the client.

---

## What Was Explicitly Not Implemented

| Item | Status |
|---|---|
| OpenAI / AI provider calls | ❌ None |
| Suggestion generation | ❌ None |
| Insert into `erp_ai_field_suggestions` | ❌ None |
| Insert into `erp_ai_field_suggestion_events` | ❌ None |
| AI Review UI | ❌ None |
| `src/features/ai/` | ❌ Does not exist |
| Target record writes | ❌ None |
| `ERP_AI_FORM_FILL` enabled | ❌ Remains `false` |
| DB migration | ❌ None (code-only) |
| Branch/Site generation activation | ❌ Still Stage 2 stub |

---

## TypeScript / Build Results

| Check | Result |
|---|---|
| `npm run typecheck` | **PASS** (0 errors) |
| `npm run build` | **PASS** |

Initial typecheck had 3 errors (two `as` cast issues + `ctx.userId` not on AuthContext). All fixed.

---

## Risks / Open Questions

1. **OCR text column** — `dms_document_files.ocr_text` is used but only loaded when no better source (ai_summary or content_text) exists. This is a performance optimization but relies on `is_current_version = true` filter. Phase 1D may need to verify this column availability across all deployments.
2. **`dms_document_content` table** — Used for content_text snippet. If a document has no `dms_document_content` row yet (OCR not run / content not synced), we fall back gracefully.
3. **Category join** — `document_type:dms_document_types(..., category:dms_document_categories(...))` — this double-join may not exist in all DMS type records. Null-safe access is used throughout.
4. **N+1 on file/content** — The loader makes 1 query for links + 1 per document for content + 1 per document for OCR (conditional). For 10 documents this is ~21 queries. Phase 1D should consider batching if performance becomes an issue.

---

## Recommended Next Phase

**ERP COMMON AI.1D — Suggestion Generation and Storage**

Wire the evidence loader into the prompt builder, call the AI provider (OpenAI via existing DMS adapter), validate output with Zod schema, persist suggestions to `erp_ai_field_suggestions`, insert `generated` events. Enable only for Stage 1 (company + party) when `ERP_AI_FORM_FILL` is toggled on.

---

**End of Report**
