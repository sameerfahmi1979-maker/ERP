# ERP DMS 12.3 — Completeness, Risk, Enhanced Search Implementation Report

**Date:** 2026-06-15
**Phase:** ERP DMS 12.3 — Completeness, Risk, Enhanced Search
**Status:** CLOSED / PASS ✅
**QA:** `npx tsc --noEmit` ✅ | `npm run build` ✅

---

## 1. Phase Title and Objective

**ERP DMS 12.3 — Completeness, Risk, Enhanced Search**

Implement deterministic document completeness scoring, document risk scoring, and enhanced search/filter capabilities for the DMS. No AI calls are made in any 12.3 action. All scoring is based on structured facts from the database.

---

## 2. Files Created

| File | Purpose |
|------|---------|
| `supabase/migrations/20260615070000_erp_dms_12_3_intelligence_indexes.sql` | Adds 3 partial indexes on `dms_documents` for completeness_score, ai_risk_score, ai_risk_level |
| `src/server/actions/dms/ai-completeness.ts` | Completeness scoring server actions |
| `src/server/actions/dms/ai-risk.ts` | Risk scoring server actions |
| `src/server/actions/dms/ai-intelligence.ts` | Combined + bulk evaluation actions |
| `src/features/dms/documents/sections/dms-document-intelligence-section.tsx` | Intelligence UI card (completeness + risk) |
| `src/features/dms/documents/dms-risk-badge.tsx` | Compact risk level badge component |
| `implementation_Review/ERP_DMS_12_3_COMPLETENESS_RISK_ENHANCED_SEARCH_IMPLEMENTATION_REPORT.md` | This report |

---

## 3. Files Modified

| File | Change |
|------|--------|
| `src/server/actions/dms/documents.ts` | Added `DmsSearchMode` type, new filter fields to `DmsDocumentFilters`, refactored search block with explicit mode handling (`quick`, `safe_fts`, `content`), added DMS 12.3 intelligence filters (`riskLevel`, `completenessMin/Max`, `hasMissingFields`, `hasAiSummary`, `hasExtractedText`, `expiryState`) |
| `src/lib/query/query-keys.ts` | Added `dms.documentIntelligence(documentId, aspect?)` query key |
| `src/features/dms/documents/dms-document-record-form.tsx` | Imported `DmsDocumentIntelligenceSection`; added "Intelligence" tab between AI Summary and AI Analysis; added `ERPRecordSectionPanel` |
| `src/features/dms/documents/dms-documents-table.tsx` | Added `DmsRiskBadge` import; added risk badge in title cell; added AI summary secondary line under title |

---

## 4. Migration

**Migration created:** `20260615070000_erp_dms_12_3_intelligence_indexes.sql`

**Applied to live DB:** Yes (via `user-supabase` MCP `apply_migration`).

**Reason:** The three indexes were confirmed absent by live DB audit before implementation:
- `idx_dms_documents_completeness_score` — partial btree on `completeness_score WHERE deleted_at IS NULL`
- `idx_dms_documents_ai_risk_score` — partial btree on `ai_risk_score WHERE deleted_at IS NULL`
- `idx_dms_documents_ai_risk_level` — partial btree on `ai_risk_level WHERE deleted_at IS NULL`

No schema columns were added — all required columns confirmed present from Phase 12.1 migration.

---

## 5. Server Actions Added

### `src/server/actions/dms/ai-completeness.ts`

| Action | Purpose |
|--------|---------|
| `evaluateDmsDocumentCompleteness(documentId)` | Deterministic completeness scoring. Checks required metadata, dates, content text, AI summary. |
| `getDmsDocumentCompletenessStatus(documentId)` | Lightweight read of completeness fields for UI card. |

### `src/server/actions/dms/ai-risk.ts`

| Action | Purpose |
|--------|---------|
| `evaluateDmsDocumentRisk(documentId)` | Deterministic risk scoring based on expiry, missing data, classification confidence, content quality, structural gaps. |
| `getDmsDocumentRiskStatus(documentId)` | Lightweight read of risk fields for UI card. |

### `src/server/actions/dms/ai-intelligence.ts`

| Action | Purpose |
|--------|---------|
| `evaluateDmsDocumentIntelligence(documentId)` | Runs completeness then risk in sequence. Returns combined result. |
| `bulkEvaluateDmsDocuments(input)` | Admin-only batch. Default batch 50, max 100, resumable, dryRun. |

All actions use: `getAuthContext()` → `hasPermission()` → Zod validate → business logic → `logAudit()` → `revalidatePath()`.

---

## 6. UI Components Added / Modified

### `DmsDocumentIntelligenceSection` (new)

- **File:** `src/features/dms/documents/sections/dms-document-intelligence-section.tsx`
- **Placement:** New "Intelligence" tab in document record form, between AI Summary and AI Analysis
- **Features:**
  - Two-card layout: Completeness card + Risk card (responsive grid)
  - Completeness card: percentage, label badge (complete/partial/incomplete), progress bar, missing field badges, Recalculate button
  - Risk card: level badge (none/low/medium/high/critical), percentage, progress bar, risk reason list with individual scores, last evaluated timestamp, Recalculate button
  - Combined "Evaluate Document Intelligence" button runs both
  - Disclaimer: deterministic, no AI
  - Uses `useQuery` with `queryKeys.dms.documentIntelligence(documentId, "completeness")` and `queryKeys.dms.documentIntelligence(documentId, "risk")`

### `DmsRiskBadge` (new)

- **File:** `src/features/dms/documents/dms-risk-badge.tsx`
- Risk level color-coded badge: none=green, low=blue, medium=amber, high=orange, critical=red

### `dms-documents-table.tsx` (modified)

- Added `DmsRiskBadge` in title cell for documents with `ai_risk_level !== "none"`
- Added AI summary secondary line under title (shows `ai_summary` when status=complete — redacted value from server is shown as-is)
- Falls back to description if no AI summary

### `dms-document-record-form.tsx` (modified)

- "Intelligence" tab added between AI Summary and AI Analysis
- `canEvaluate` prop: requires `dms.documents.edit` OR `dms.admin`/`system_admin`/`group_admin`

---

## 7. Search Behavior Implemented

### `DmsSearchMode` type

Added to `DmsDocumentFilters`:
```typescript
searchMode?: 'quick' | 'safe_fts' | 'content'
```

### Search modes

| Mode | Behavior |
|------|---------|
| `quick` | ILIKE on `document_no`, `title`, `description`, `legacy_document_code` |
| `safe_fts` | `content_tsv` FTS using `plainto_tsquery('simple',...)` — covers doc_no, title, description, ai_summary |
| `content` | Queries `dms_document_content` by FTS, returns matching document IDs, filters `dms_documents`. Non-admin users: confidential (hr/legal/executive) documents excluded. Never returns content_text. |
| auto (no mode) | Short query (≤3 words or contains 4+ digits) → quick; long query → safe_fts |

### New filter fields

| Filter | Behavior |
|--------|---------|
| `riskLevel` | Filters by `ai_risk_level` value |
| `completenessMin` | `completeness_score >= value` |
| `completenessMax` | `completeness_score <= value` |
| `hasMissingFields` | `missing_fields_json IS NOT NULL` |
| `hasAiSummary` | `ai_summary_status = 'complete'` |
| `expiryState` | expired / expiring_soon (≤30 days) / valid (>30 days) / missing_expiry |
| `hasExtractedText` | Subquery via `dms_document_content` |

---

## 8. Completeness Scoring Algorithm

```
required_ratio = required_fields_with_values / total_required_fields
  (1.0 if no required fields defined for the document type)

base_score = required_ratio × 0.80

+ 0.05 if issue_date is set
+ 0.05 if expiry_date is set AND dms_document_types.requires_expiry_tracking = true
+ 0.05 if dms_document_content row exists with non-null content_text
+ 0.05 if ai_summary exists AND ai_summary_status = 'complete'

final = min(1.0, base_score)
```

**Labels:** ≥90% = Complete, ≥60% = Partial, <60% = Incomplete

**Missing fields JSON** includes:
- Required metadata fields without a value
- `issue_date` if missing
- `expiry_date` if missing AND `requires_expiry_tracking = true`

**Source for "required fields":** `dms_metadata_definitions` where `is_required = true AND is_active = true AND deleted_at IS NULL AND document_type_id = document.document_type_id`.

**Source for expiry bonus:** `dms_document_types.requires_expiry_tracking` (confirmed present in live DB).

---

## 9. Risk Scoring Algorithm

```
risk = 0

Expired (expiry_date < today):                     +0.40
Expiring within 30 days:                           +0.25
Expiry missing (requires_expiry_tracking = true):  +0.20
Issue date missing:                                +0.10
Required metadata missing: +0.05 per field,        max +0.15
AI classification score < 0.5:                     +0.15
Content text truncated:                            +0.05
Confidential (hr/legal/executive) + no owner:      +0.15
Completeness score < 0.5:                          +0.15

final = min(1.0, risk)
```

**Risk levels:** 0–0.10 = none, 0.11–0.30 = low, 0.31–0.55 = medium, 0.56–0.80 = high, 0.81–1.00 = critical

**Risk reasons stored as JSON array:** `[{ code, message, score }]`

**No AI call. No `ai_warnings_json` dependency** (column exists but was never populated; skipped to avoid unreliable input).

**Classification score source:** Latest `dms_ai_extraction_results` row for the document (ordered by `created_at DESC`).

---

## 10. Feature Flag Handling

- `DMS_COMPLETENESS` — checked in `evaluateDmsDocumentCompleteness` and implicitly via `evaluateDmsDocumentIntelligence`
- `DMS_RISK_SCORE` — checked in `evaluateDmsDocumentRisk` and implicitly via `evaluateDmsDocumentIntelligence`
- Both confirmed enabled (`is_enabled = true`) in live DB before implementation
- If disabled: returns controlled error without modifying rows

---

## 11. Confidentiality / Security Handling

- `content_text` never returned in list or search responses
- Content-mode search excludes `hr`, `legal`, `executive` documents for non-admin users (server-side)
- `createAdminClient()` not used for any user-facing operation
- RLS remains unchanged — no policies added, modified, or disabled
- AI summary redaction from Phase 12.1/12.2 remains intact
- Risk/completeness data is not confidential — same permission as document read (`dms.documents.view`)
- Generation requires `dms.documents.edit` or `dms.admin`

---

## 12. Audit / Logging Behavior

**Logged via `logAudit()` (safe metadata only):**
- `completeness_evaluated`: document_id, completeness_score, missing_fields_count, required totals
- `risk_evaluated`: document_id, risk_score, risk_level, risk_reasons_count, missing_fields_count
- `bulk_intelligence_evaluated`: batch_size, processed, failed, resume_from, next_resume

**Never logged:** content_text, OCR text, AI prompts, AI raw responses, extracted personal values, full summary text.

---

## 13. TypeScript Result

```
npx tsc --noEmit → Exit code: 0 (zero errors)
```

---

## 14. Build Result

```
npm run build → Exit code: 0
▲ Next.js 16.2.6 (Turbopack)
✓ Compiled successfully in 7.6s
✓ TypeScript passed in 14.5s
✓ All routes compiled
```

---

## 15. Known Limitations

1. **No admin UI for bulk evaluation.** `bulkEvaluateDmsDocuments` is a callable server action but has no dedicated admin page. Can be invoked from a dev tool or future admin page.

2. **`ai_warnings_json` not used in risk scoring.** This column was added in Phase 12.1 as a placeholder and has never been populated by any workflow. Risk scoring was deliberately built without it to avoid unreliable empty-JSON input. Once a workflow populates it, risk scoring can be enhanced.

3. **Content-mode search (`searchMode: 'content'`) is backend-only.** The `dms-documents-table.tsx` client-side search input does not expose search mode selection. The mode must be passed from a server-side page/filter. A UI search mode selector can be added in a future phase.

4. **`hasExtractedText: false` filter uses NOT IN.** For very large datasets, this could be slow. If performance is an issue, the filter can be replaced with a LEFT JOIN subquery or a dedicated flag column on `dms_documents`.

5. **No snippet returned for content-mode search.** The match is indicated only by document inclusion in results. `ts_headline` was not implemented to avoid complexity with the Supabase client. Can be added in Phase 12.4.

6. **Bulk evaluation processes all non-deleted documents**, not just those without scores. This is intentional for re-scoring after algorithm updates but may be slow for very large datasets. A `scoresMissing` filter can be added if needed.

---

## 16. Next Recommended Phase

**ERP DMS 12.4 — AI Search, Ask AI, Auto Tags, Smart Links**

Includes:
- Natural-language search using AI
- Ask AI about one document
- Ask AI across DMS knowledge base
- Auto-tag suggestions
- Smart ERP link suggestions
- pgvector / semantic embeddings (if approved)

Requires a separate Phase 12.4 prompt from Sameer before implementation.
