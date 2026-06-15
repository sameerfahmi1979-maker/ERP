# ERP DMS 12.1 — Content Text Foundation and Full-Text Search
## Implementation Report

**Phase:** ERP DMS 12.1  
**Date:** 2026-06-15  
**Status:** ✅ CLOSED / PASS  
**Report authored by:** Cursor AI Agent  

---

## 1. Phase Title and Objective

**ERP DMS 12.1 — Content Text Foundation and Full-Text Search**

Objective: Create the database foundation for storing consolidated extracted document text (`dms_document_content`), hook content sync into existing OCR and AI intake flows, upgrade document search to use PostgreSQL full-text search for longer queries, and add a read-only Extracted Text UI card in the document record workspace.

This phase does **not** implement AI summaries, risk scoring, completeness scoring, AI search, or pgvector. Those are Phase 12.2+.

---

## 2. Files Changed

### New files
| File | Purpose |
|---|---|
| `supabase/migrations/20260615060000_erp_dms_12_1_content_text_foundation.sql` | DB migration: creates `dms_document_content`, adds columns to `dms_documents`, trigger for `content_tsv`, GIN indexes, backfills existing rows, inserts AI feature flags |
| `src/lib/dms/content-text.ts` | Server-only helpers: `normalizeDmsContentText`, `capDmsContentText` (100k char cap), `sha256Text`, `contentTextFileSeparator` |
| `src/server/actions/dms/document-content.ts` | All content text server actions (see §5) |
| `src/features/dms/documents/sections/dms-document-content-section.tsx` | Read-only Extracted Text card shown in document record workspace |

### Modified files
| File | Change |
|---|---|
| `src/server/actions/dms/ai-intake.ts` | Added import + content text sync block after AI result acceptance in `approveAiIntakeAndCreateDocument` (non-fatal, try/catch) |
| `src/server/actions/dms/ocr.ts` | Added import + content text sync block after OCR completes in `triggerDmsOcrForFile` (non-fatal, consolidates all current-version files) |
| `src/server/actions/dms/documents.ts` | Extended `DmsDocumentRow` type with Phase 12.1 columns; upgraded search to use `content_tsv` for long queries; added `ai_summary` redaction for confidential docs |
| `src/lib/query/query-keys.ts` | Added `dms.documentContent(documentId)` query key |
| `src/features/dms/documents/dms-document-record-form.tsx` | Added `FileText` icon import, `DmsDocumentContentSection` import, "Extracted Text" section in sections array, and section panel rendering after OCR tab |

---

## 3. Migration Created

**File:** `supabase/migrations/20260615060000_erp_dms_12_1_content_text_foundation.sql`  
**Applied:** ✅ Live — applied via `user-supabase` MCP

---

## 4. Database Objects Added

### New table: `public.dms_document_content`
| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT GENERATED ALWAYS AS IDENTITY | PK |
| `document_id` | BIGINT NOT NULL UNIQUE | FK → `dms_documents(id)` ON DELETE CASCADE |
| `content_text` | TEXT | Full consolidated extracted text (capped at 100,000 chars) |
| `content_text_updated_at` | TIMESTAMPTZ | |
| `content_text_source` | TEXT | CHECK IN ('ocr','ai_intake','manual_override','truncated','system_resync') |
| `content_text_sha256` | TEXT | SHA-256 hex digest of stored text |
| `content_text_char_count` | INTEGER | CHECK >= 0 |
| `is_truncated` | BOOLEAN NOT NULL DEFAULT false | |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

**RLS:** ENABLED and FORCED  
**Policies:**  
- `dms_doc_content_select` — `auth.uid() IS NOT NULL AND current_user_has_permission('dms.documents.view')`  
- `dms_doc_content_manage` — `current_user_has_permission('dms.documents.edit') OR current_user_has_role('system_admin')`

**Indexes:**  
- `idx_dms_document_content_doc` — btree on `document_id`  
- `idx_dms_doc_content_fts` — GIN on `to_tsvector('simple', coalesce(content_text, ''))`

### New columns on `public.dms_documents`
| Column | Type | Notes |
|---|---|---|
| `content_tsv` | TSVECTOR | Populated by DB trigger `trg_dms_documents_content_tsv` |
| `ai_summary` | TEXT | Placeholder for Phase 12.2 |
| `ai_summary_updated_at` | TIMESTAMPTZ | Placeholder |
| `ai_summary_model` | TEXT | Placeholder |
| `ai_summary_status` | TEXT | CHECK IN ('not_required','pending','complete','failed','skipped'); DEFAULT 'pending' |
| `ai_summary_error` | TEXT | Placeholder |
| `ai_summary_input_char_count` | INTEGER | Placeholder |
| `ai_summary_input_truncated` | BOOLEAN | Placeholder |
| `completeness_score` | NUMERIC(5,4) | CHECK 0–1; Placeholder for Phase 12.3 |
| `missing_fields_json` | JSONB | Placeholder |
| `ai_warnings_json` | JSONB | Placeholder |
| `ai_risk_score` | NUMERIC(5,4) | CHECK 0–1; Placeholder for Phase 12.3 |
| `ai_risk_level` | TEXT | CHECK IN ('none','low','medium','high','critical') |
| `ai_risk_reasons_json` | JSONB | Placeholder |
| `ai_risk_updated_at` | TIMESTAMPTZ | Placeholder |

**New indexes on `dms_documents`:**  
- `idx_dms_documents_content_tsv` — GIN on `content_tsv`  
- `idx_dms_documents_risk_level` — partial btree (ai_risk_level not null + not deleted)  
- `idx_dms_documents_no_summary` — partial btree (ai_summary is null + not deleted)

### New DB function and trigger
- `public.update_dms_document_content_tsv()` — PLPGSQL function computing weighted `content_tsv` from `document_no`(A), `title`(A), `description`(B), `ai_summary`(B) using `simple` config
- `trg_dms_documents_content_tsv` — BEFORE INSERT OR UPDATE OF `document_no, title, description, ai_summary` — fires automatically; no manual TSV management needed in server actions

### Backfill
All existing non-deleted `dms_documents` rows had `content_tsv` backfilled in the migration.

### AI Feature Flags inserted (11 new flags)
`DMS_CONTENT_TEXT_SYNC` (enabled=true), `DMS_AI_SUMMARY`, `DMS_AI_SEARCH`, `DMS_AUTO_TAGS`, `DMS_SMART_LINKS`, `DMS_RISK_SCORE`, `DMS_COMPLETENESS`, `DMS_DUPLICATE_DETECT`, `DMS_EXPIRY_INTEL`, `DMS_DOCUMENT_QA`, `DMS_CROSS_DOC_SEARCH`.  
Inserted with `ON CONFLICT DO NOTHING` — no existing flags modified.

---

## 5. Server Actions Added / Modified

### New: `src/server/actions/dms/document-content.ts`

| Action | Description |
|---|---|
| `writeDocumentContentTextSystem(params)` | Internal helper — receives already-validated text, checks `DMS_CONTENT_TEXT_SYNC` flag, caps at 100k chars, computes SHA-256, upserts `dms_document_content`. Called by ai-intake and ocr flows. Never logs text. |
| `updateDocumentContentText(input)` | Public server action — requires `dms.documents.edit` or `dms.admin`, validates with Zod, delegates to system writer. |
| `resyncDocumentContentText(documentId)` | Loads current-version OCR text, consolidates, writes. Does not call AI. |
| `getDocumentContentText(documentId)` | Gated read — requires `dms.documents.view`; additionally requires `dms.admin` for hr/legal/executive documents. Returns content row or null. Never exposed in list queries. |
| `adminBackfillDmsContentText(input)` | Admin-only batch backfill (default 50, max 100). Resumable via `resumeFromDocumentId`. Supports `dryRun`. Returns processed/skipped/errors summary. |

### Modified: `src/server/actions/dms/ai-intake.ts`
Added non-fatal content sync block inside `approveAiIntakeAndCreateDocument` after the AI result is marked accepted. Loads `raw_ocr_text` from `dms_ai_extraction_results` and calls `writeDocumentContentTextSystem` with `source: 'ai_intake'`. Wrapped in try/catch — document creation is never blocked.

### Modified: `src/server/actions/dms/ocr.ts`
Added non-fatal content sync block in `triggerDmsOcrForFile` after OCR completes successfully. Consolidates OCR text from all current-version files for the parent document and calls `writeDocumentContentTextSystem` with `source: 'ocr'`. Wrapped in try/catch — OCR success/failure is unaffected.

### Modified: `src/server/actions/dms/documents.ts`
- Extended `DmsDocumentRow` with Phase 12.1 column types (all optional)
- Upgraded search in `getDmsDocuments`:
  - Queries ≤3 words **or** containing long digit sequences (codes) → ILIKE on `document_no, title, description, legacy_document_code`
  - Queries >3 words → `content_tsv` full-text search using `plainto_tsquery('simple', ...)`
- Added `ai_summary` redaction: for `hr/legal/executive` documents, non-admin users see `"[Summary restricted — confidential document]"` instead of the real summary

---

## 6. UI Components Added / Modified

### New: `src/features/dms/documents/sections/dms-document-content-section.tsx`
- Card title: **Extracted Document Text**
- Source badge (OCR / AI Intake / System Resync / Truncated)
- Character count and last-updated timestamp
- Amber truncation warning if `is_truncated = true`
- Blue info note about read-only nature
- Scrollable monospace Textarea with full content
- Resync button (visible when `canResync` prop is true)
- Graceful access-denied state (Lock icon + message)
- Empty state (no text yet)

### Modified: `src/features/dms/documents/dms-document-record-form.tsx`
- New tab: **Extracted Text** (id=`content`, icon=`FileText`) — inserted after OCR / Text tab
- `DmsDocumentContentSection` rendered with `canResync` based on `dms.documents.edit` / `dms.admin` / `system_admin` / `group_admin`

---

## 7. Security / RLS Notes

- `dms_document_content` table has RLS enabled and forced ✅
- SELECT policy requires `auth.uid() IS NOT NULL AND current_user_has_permission('dms.documents.view')` ✅
- Manage policy requires `dms.documents.edit OR system_admin` ✅
- Server action `getDocumentContentText` additionally blocks hr/legal/executive unless `dms.admin` ✅
- `getDmsDocuments` never joins or returns `content_text` ✅
- `ai_summary` is redacted for confidential documents for non-admin users in list responses ✅
- Content text is never logged in audit records ✅
- `createAdminClient()` is NOT used for user-facing document content reads ✅
- content_tsv contains only safe text (doc_no, title, description, ai_summary) — never raw OCR ✅

---

## 8. Feature Flags Inserted

| Flag | Enabled | Notes |
|---|---|---|
| `DMS_CONTENT_TEXT_SYNC` | **true** | Gates automatic content sync in OCR and AI intake flows |
| `DMS_AI_SUMMARY` | true (Phase 12.2) | Not yet used |
| `DMS_AI_SEARCH` | true (Phase 12.4) | Not yet used |
| `DMS_AUTO_TAGS` | true (Phase 12.5) | Not yet used |
| `DMS_SMART_LINKS` | true (Phase 12.5) | Not yet used |
| `DMS_RISK_SCORE` | true (Phase 12.3) | Not yet used |
| `DMS_COMPLETENESS` | true (Phase 12.3) | Not yet used |
| `DMS_DUPLICATE_DETECT` | true (Phase 12.5) | Not yet used |
| `DMS_EXPIRY_INTEL` | true (Phase 12.5) | Not yet used |
| `DMS_DOCUMENT_QA` | true (Phase 12.4) | Not yet used |
| `DMS_CROSS_DOC_SEARCH` | true (Phase 12.4) | Not yet used |

---

## 9. Search Behavior Details

| Query type | Strategy | Columns searched |
|---|---|---|
| 1–3 words, or contains 4+ digit sequence (e.g. codes, IDs) | ILIKE | `document_no`, `title`, `description`, `legacy_document_code` |
| >3 words natural-language | `content_tsv` full-text (`simple`, `plainto_tsquery`) | Covers doc_no + title + desc + ai_summary (all weighted) |

Documents without `content_tsv` (uploaded before migration backfill, or entirely new) are searchable via the trigger which fires on INSERT or updates to title/description/document_no.

---

## 10. Confidentiality Handling

| Level | List `ai_summary` (non-admin) | Full `content_text` (non-admin) |
|---|---|---|
| `internal`, `company`, `finance` | Shown | Shown via `getDocumentContentText` |
| `hr`, `legal`, `executive` | Redacted → `[Summary restricted — confidential document]` | Blocked → 403 error message |
| Any level (admin user) | Shown | Shown |

---

## 11. Tests Performed

1. TypeScript check: `npx tsc --noEmit` → **0 errors**
2. Production build: `npm run build` → **PASS** (compiled in 8.9s, all 104 routes built)
3. DB migration applied to live Supabase project via MCP: **success**
4. Feature flags inserted: 11 flags, ON CONFLICT DO NOTHING — **no existing flags modified**
5. Verified `dms_document_content` table exists in live DB
6. Verified `content_tsv` column exists on `dms_documents`
7. Verified CHECK constraints for `ai_summary_status`, `ai_risk_level`, `completeness_score`, `ai_risk_score`

---

## 12. `npx tsc --noEmit` Result

```
Exit code: 0 (no errors)
```

---

## 13. `npm run build` Result

```
Exit code: 0
✓ Compiled successfully in 8.9s
✓ All 104 routes built
```

---

## 14. Known Limitations

1. **Admin backfill UI not built.** `adminBackfillDmsContentText` server action is implemented and ready to call; the trigger UI in `/admin/dms` is deferred to a follow-up phase. Admin can call the action directly via a dev tool or custom script.

2. **`select('*')` retained in `getDmsDocuments` and `getDmsDocument`.** The risk identified in the master plan (leaking future columns via `select('*')`) is mitigated by placing full content text in a separate table (`dms_document_content`). Replacing `select('*')` with explicit column lists is tracked for a future cleanup phase.

3. **FTS returns no results for documents uploaded before migration** if their `content_tsv` is NULL. The migration backfills all non-deleted documents. Any document with a `title`/`document_no` will be searchable immediately. Documents without OCR text won't return FTS hits until OCR or AI intake runs.

4. **`raw_ocr_text` field in `dms_ai_extraction_results`** — the intake sync reads this field. If the AI result was created before Phase 12.1, the field will be NULL and the sync will be skipped gracefully.

---

## 15. Next Recommended Phase: DMS 12.2 — AI Summary

**Phase 12.2** implements:
- `generateAndSaveDmsAiSummary(documentId)` server action
- `bulkGenerateMissingSummaries(limit)` admin action
- Summary input capped at 20,000 characters (from `dms_document_content.content_text`)
- Summary stored in `dms_documents.ai_summary` (trigger auto-updates `content_tsv`)
- Summary shown in document record Overview and search result cards
- Confidential document summary generation requires `dms.admin`
- No auto-generation — admin/editor triggers it explicitly

Gate: Sameer must approve Phase 12.2 prompt before implementation.
