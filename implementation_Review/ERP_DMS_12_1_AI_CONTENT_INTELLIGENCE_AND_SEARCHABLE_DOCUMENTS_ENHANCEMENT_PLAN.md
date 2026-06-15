# ERP DMS 12.1–12.5 — AI Content Intelligence & Searchable Documents Master Plan

**Status:** PLANNING ONLY — No code, migrations, or database changes have been made  
**Last Updated:** 2026-06-15  
**Prepared by:** Cursor AI — based on live DB audit + full codebase review  
**Reviewed by:** Sameer Fahmi (pending)  
**Approval required before any phase implementation begins.**

---

## 1. Executive Summary

The ALGT ERP DMS currently stores, classifies, and extracts metadata from documents through an AI-first intake workflow (DMS.11). However, the **full readable text** of each document is not persistently stored at the document level, which means:

- You cannot search inside document content
- You cannot ask "show me employees who passed offshore medical"
- There is no stored AI summary per document
- There is no risk score, completeness score, or structured duplicate detection
- The list query returns `select('*')` which would expose `content_text` if added directly — **a confirmed risk**

This plan defines a complete, phased transformation of the DMS into a document intelligence platform across Phases 12.1 through 12.5. It is grounded in a full live audit of the database schema, RLS policies, existing indexes, constraints, and code query patterns conducted on 2026-06-15.

**No implementation has been performed. Each phase requires Sameer's explicit approval before a separate implementation prompt is generated.**

---

## 2. Purpose and Business Target

Sameer's required DMS intelligence capabilities:

1. Search inside full document text
2. Search AI summaries
3. Ask natural-language questions across all documents
4. Find documents by meaning, not only exact keywords
5. Detect missing information automatically
6. Detect duplicate or similar documents
7. Auto-suggest tags (human approval required)
8. Auto-suggest related ERP records (human approval required)
9. Identify expiry, validity, and risk
10. Ask questions about one specific document
11. Ask questions across all documents
12. Improve compliance and reduce manual checking

**Example questions that must work after full implementation:**

| Question | Requires |
|----------|---------|
| "show me all employees who passed offshore medical" | content_text search + document type filter + outcome detection |
| "which documents mention Petrofac insurance deductible" | content_text full-text search |
| "find all passports expiring this year" | document type filter + expiry date range |
| "show me trade licenses missing expiry date" | completeness detection |
| "find all documents related to ADNOC approval" | content_text search + entity detection |
| "which certificates say fit for offshore work" | content_text search + outcome hint |

---

## 3. Current System State Confirmed by Audit

### 3.1 Audit Method

Live database introspection was performed via `user-supabase` MCP tool on 2026-06-15. All findings below are confirmed from actual live schema — not assumptions.

### 3.2 What Does NOT Exist on `dms_documents` (Confirmed Missing)

The following columns **do not exist** as of the audit date:

| Column | Status |
|--------|--------|
| `content_text` | ❌ Not present |
| `content_text_updated_at` | ❌ Not present |
| `content_text_source` | ❌ Not present |
| `content_text_sha256` | ❌ Not present |
| `content_text_char_count` | ❌ Not present |
| `content_tsv` | ❌ Not present |
| `ai_summary` | ❌ Not present |
| `ai_summary_updated_at` | ❌ Not present |
| `ai_summary_model` | ❌ Not present |
| `ai_summary_status` | ❌ Not present |
| `ai_summary_error` | ❌ Not present |
| `completeness_score` | ❌ Not present |
| `missing_fields_json` | ❌ Not present |
| `ai_warnings_json` | ❌ Not present |
| `ai_risk_score` | ❌ Not present |
| `ai_risk_level` | ❌ Not present |
| `ai_risk_reasons_json` | ❌ Not present |

### 3.3 What Does Exist (Confirmed Present)

**`dms_documents` live columns:**  
id, document_no, legacy_document_code, migrated_from_table, title, description, document_type_id, category_id, status, confidentiality_level, owner_user_id, owning_company_id, owning_branch_id, issue_date, expiry_date, reminder_policy_id, current_version_id, ocr_status, ai_status, review_status, is_archived, archived_at, created_by, created_at, updated_by, updated_at, deleted_at, ocr_last_run_at, ocr_text_available, party_id

**`dms_document_files` — already has:**
- `ocr_text TEXT` (nullable) — per-file OCR text ✅
- `ocr_status`, `ocr_confidence`, `ocr_provider`, `ocr_model` ✅
- `sha256_hash TEXT` ✅
- `page_count INTEGER` ✅

**`dms_ai_extraction_results` — already has:**
- `raw_ocr_text TEXT` (the OCR input sent to AI) ✅
- `raw_response_json JSONB` (full AI JSON response including `additional_fields` and `detected_entities`) ✅
- `extracted_fields_json JSONB` ✅
- `suggested_links_json JSONB` ✅
- `classification_score NUMERIC`, `classification_confidence TEXT` ✅
- `issue_date_suggestion DATE`, `expiry_date_suggestion DATE` ✅
- `suggested_title TEXT`, `suggested_description TEXT` ✅

**`dms_metadata_definitions` — has:**
- `is_ai_extractable BOOLEAN` — controls which fields AI attempts to extract ✅
- `ai_field_hint TEXT` — hint sent to AI prompt ✅
- `is_required BOOLEAN` — used for completeness scoring ✅
- `field_type TEXT`, `field_code TEXT`, `sort_order INTEGER` ✅

### 3.4 AI Feature Flags — Live State

| Feature Code | Enabled | Requires Human Review | Min Confidence |
|---|---|---|---|
| AI_SEARCH | ✅ true | false | 0.000 |
| DMS_AI_REVIEW | ✅ true | ✅ true | 0.000 |
| DMS_CLASSIFICATION | ✅ true | ✅ true | 0.850 |
| DMS_EXTRACTION | ✅ true | ✅ true | 0.850 |
| DMS_OCR | ✅ true | ✅ true | 0.750 |
| ERP_AI_ASSISTANT | ✅ true | false | 0.000 |
| LOCAL_LLM | false | true | 0.700 |

**Key finding:** `AI_SEARCH` and `ERP_AI_ASSISTANT` flags already exist and are enabled. New Phase 12 feature flags will be inserted with `ON CONFLICT DO NOTHING` to avoid duplicates.

---

## 4. Current DMS Database State

### 4.1 Indexes on `dms_documents` (Live, Confirmed)

| Index Name | Type | Columns |
|-----------|------|---------|
| `dms_documents_pkey` | BTREE UNIQUE | id |
| `dms_documents_no_uq` | BTREE UNIQUE | document_no |
| `idx_dms_documents_no` | BTREE | document_no |
| `idx_dms_documents_status` | BTREE | status |
| `idx_dms_documents_active` | BTREE | status, is_archived, deleted_at |
| `idx_dms_documents_type` | BTREE | document_type_id |
| `idx_dms_documents_category` | BTREE | category_id |
| `idx_dms_documents_expiry` | BTREE | expiry_date (WHERE NOT NULL) |
| `idx_dms_documents_party_id` | BTREE | party_id (WHERE NOT NULL) |
| `idx_dms_documents_company` | BTREE | owning_company_id (WHERE NOT NULL) |
| `idx_dms_documents_branch` | BTREE | owning_branch_id (WHERE NOT NULL) |
| `idx_dms_documents_created_at` | BTREE | created_at DESC |

**No full-text or GIN indexes exist yet.** The `content_tsv` GIN index is entirely new.

### 4.2 Constraints on `dms_documents` (Live, Confirmed)

All FK constraints confirmed. **Zero CHECK constraints exist** on `dms_documents`. All new status/level/score columns must add CHECK constraints to enforce valid values.

### 4.3 RLS State — All DMS Tables (Live, Confirmed)

| Table | RLS Enabled | RLS Forced | Notes |
|-------|------------|------------|-------|
| dms_documents | ✅ | ✅ | SELECT: auth.uid() + dms.documents.view |
| dms_document_files | ✅ | ✅ | SELECT: auth.uid() + dms.documents.preview |
| dms_ai_extraction_jobs | ✅ | ✅ | SELECT: dms.documents.review_ai |
| dms_ai_extraction_results | ✅ | ✅ | SELECT: dms.documents.review_ai |
| dms_document_links | ✅ | ✅ | SELECT: dms.documents.view |
| dms_document_tags | ✅ | ✅ | SELECT: dms.documents.view |
| dms_document_metadata_values | ✅ | ✅ | SELECT: dms.documents.view |
| dms_expiry_reminders | ✅ | ✅ | |
| dms_metadata_definitions | ✅ | ✅ | |
| dms_intake_review_values | ✅ | ❌ (NOT forced) | Policy: ALL for authenticated — **see Section 6** |
| dms_party_document_migration_map | ❌ | ❌ | Legacy migration table — see Section 6 |

---

## 5. Current DMS Code Flow State

### 5.1 List Query — Confirmed `select('*')` Risk

`getDmsDocuments()` in `src/server/actions/dms/documents.ts` uses:
```typescript
.select(`
  *,
  document_type:dms_document_types(...),
  category:dms_document_categories(...),
  tags:dms_document_tags(...)
`)
```

The `*` wildcard expands to ALL columns on `dms_documents`. **If `content_text` or `ai_summary` were added directly to `dms_documents`, they would be returned in every list query to every user with `dms.documents.view` permission — regardless of `confidentiality_level`.**

This is a confirmed architectural risk that directly informs the content storage design decision (Section 8).

### 5.2 Single Document Query — Also `select('*')`

`getDmsDocument()` and `getDmsDocumentRecordData()` also use `select('*')` on `dms_documents`.

### 5.3 AI Intake Flow

`approveAiIntakeAndCreateDocument()` in `ai-intake.ts`:
- Copies file from `dms-temp` bucket to `dms-documents` bucket
- Creates `dms_documents` record
- Creates `dms_document_files` record
- Saves metadata values to `dms_document_metadata_values`
- Saves document links to `dms_document_links`
- Inserts expiry reminders
- Does NOT yet write `content_text` or `ai_summary` — these are planned additions

The extracted text (`raw_ocr_text`) is already available on the AI result at intake approval time — this is the ideal trigger point for writing `content_text`.

### 5.4 File Content Extractor

`src/lib/dms/file-content-extractor.ts` supports:
- PDF → text layer, or rendered page images (scanned PDFs)
- JPEG/PNG/WebP/GIF → passed directly to vision model
- TIFF → converted to PNG
- DOCX → text via mammoth
- DOC → best-effort text fallback
- XLSX/XLS → text via SheetJS

The extractor returns `{ text, images, hasContent, method }`. The `text` field is exactly what should be stored as `content_text`.

### 5.5 Current Search Implementation

Current `getDmsDocuments` search:
```typescript
query.or(`document_no.ilike.${s},title.ilike.${s},description.ilike.${s},legacy_document_code.ilike.${s}`)
```

- ILIKE on 4 text columns — no content search, no FTS, no relevance ranking

---

## 6. Current RLS and Security State

### 6.1 `dms_intake_review_values` — Policy Risk

RLS is enabled but **not forced**. The only policy is:
```sql
-- Policy: auth_users_manage_intake_review_values
-- CMD: ALL, ROLES: {authenticated}, QUAL: true
```

This means any authenticated user can read and write ALL intake review value rows. Since these are transient draft values for documents in the AI intake review step, the practical risk is low, but the policy is over-permissive.

**Recommendation (Phase cleanup, not Phase 12.1):** Restrict policy to `uploaded_by = auth.uid()` or add `FORCE ROW LEVEL SECURITY` once the upload session ownership check is validated.

### 6.2 `dms_party_document_migration_map` — No RLS

This is a legacy migration tracking table. No sensitive data. RLS is off. Not a concern for Phase 12.

### 6.3 Column-Level Confidentiality Gap on `dms_documents`

PostgreSQL RLS protects **rows**, not **columns**. Given that:
- `getDmsDocuments` uses `select('*')`
- `confidentiality_level` values include `hr`, `legal`, `executive`
- Some documents contain full OCR text of medical records, contracts, ID cards

Adding `content_text` directly to `dms_documents` would expose full OCR text to any user with `dms.documents.view` permission in the list query — **this is unacceptable for HR/legal/executive documents.**

This is the primary driver behind the content storage architecture decision in Section 8.

---

## 7. Gap Analysis

| Capability | Current State | Gap |
|-----------|--------------|-----|
| Per-file OCR text | ✅ `dms_document_files.ocr_text` | Not consolidated at document level |
| Document-level full text | ❌ Missing | `content_text` column + sync logic needed |
| Full-text search | ❌ ILIKE only | `content_tsv` GIN index + query upgrade needed |
| AI summary | ❌ Missing | `ai_summary` column + generation needed |
| Completeness scoring | ❌ Missing | Algorithm + `completeness_score` column needed |
| Risk scoring | ❌ Missing | Algorithm + `ai_risk_score` column needed |
| AI search (intent → SQL) | ❌ Missing | Intent extractor + SQL builder needed |
| Per-document Q&A | ❌ Missing | LLM call against stored content needed |
| Cross-document search | ❌ Missing | Intent → SQL across all accessible docs |
| Auto-tag suggestion | ❌ Missing | Post-intake AI step needed |
| Smart ERP link suggestion | ⚠️ Partial | Party matching exists; not persisted as suggestions |
| Duplicate detection (content) | ❌ Missing | SHA-256 only; no metadata/text-based detection |
| Expiry intelligence | ⚠️ Partial | Structured dates work; text-based expiry detection missing |
| pgvector embeddings | ❌ Missing | Future Phase 12.5 |

---

## 8. Architecture Decision: Content Storage Model

### 8.1 The Problem

`getDmsDocuments()` and `getDmsDocument()` both use `select('*')`. If `content_text` is added directly to `dms_documents`:
- Every list-view query returns full OCR text for every document
- Network payloads become very large (list of 100 documents × 100k chars each = 10MB+)
- HR/legal/executive documents expose full text to users who have view permission on the row

### 8.2 Option A — Separate `dms_document_content` Table (Recommended)

Create a dedicated table:
```
dms_document_content
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY
  document_id BIGINT NOT NULL UNIQUE REFERENCES dms_documents(id) ON DELETE CASCADE
  content_text TEXT
  content_text_updated_at TIMESTAMPTZ
  content_text_source TEXT CHECK (content_text_source IN (...))
  content_text_sha256 TEXT
  content_text_char_count INTEGER CHECK (content_text_char_count >= 0)
  is_truncated BOOLEAN NOT NULL DEFAULT false
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
```

**Advantages:**
- Never returned in list queries (explicit join required)
- Separate RLS policy with stricter confidentiality enforcement
- List view performance not degraded by large text blobs
- Easier to add chunk table later (FK to this table)
- Clear API surface: only `getDocumentContentText(documentId)` returns it

**Disadvantages:**
- `content_tsv` must live somewhere — PostgreSQL GENERATED columns require the input columns to be on the same table. Options:
  - Option A1: Put `content_tsv` on `dms_documents` as a regular (non-generated) column, updated by a trigger or server action
  - Option A2: Put `content_tsv` on `dms_document_content` and JOIN in search queries

### 8.3 Option B — Keep on `dms_documents` with Strict Code Rules

Enforce by code:
- All server actions must use explicit column lists, never `select('*')`
- `getDmsDocuments` must never include `content_text`, `ai_summary`, or content-related columns
- Only `getDocumentContentText(documentId)` and `getDmsDocumentRecordData(id)` may return those fields
- `getDmsDocumentRecordData` must check `confidentiality_level` before returning full text

**Advantages:** Simpler — no new table, no JOIN, `content_tsv` is truly a GENERATED column.  
**Disadvantages:** Relies on code discipline. One developer using `select('*')` breaks confidentiality. Future queries are not safe by default.

### 8.4 Final Decision: Option A (Separate Table) with Pragmatic `content_tsv` Placement

**Selected: Option A.** Validated by audit finding that `getDmsDocuments` uses `select('*')`.

For `content_tsv`:
- Add `content_tsv TSVECTOR` as a **non-generated, explicitly managed column** on `dms_documents` (Option A1)
- It contains only safe text: `document_no || title || description || ai_summary` — no raw OCR content
- `ai_summary` is a short 3–5 sentence summary, not the full OCR text — safe to include in the search index
- `content_text` (full OCR) does NOT appear in `content_tsv` — it will be searched separately via a JOIN to `dms_document_content`
- When `content_text` is updated, a server action updates `content_tsv` on `dms_documents` to include safe search tokens derived from content (e.g. extracted names/codes — but NOT the full raw text)
- For Phase 12.1: `content_tsv` covers `document_no + title + description` only
- For Phase 12.2: `content_tsv` is expanded to include `ai_summary`
- Full content search (Phase 12.3) uses a direct `dms_document_content.content_text` FTS query with JOIN — never exposing raw text in the main query result columns

**Final schema for search index:**
- `dms_documents.content_tsv TSVECTOR` — managed by server action, contains `document_no + title + description + ai_summary` only (never raw OCR)
- `dms_document_content.content_text TEXT` — full OCR text, separate table, separate RLS, never returned in list views

---

## 9. Final Recommended Architecture

```
DOCUMENT RECORD (dms_documents)
  content_tsv TSVECTOR  ← safe search index: doc_no + title + desc + ai_summary
  ai_summary TEXT       ← 3-5 sentence summary, safe for search index
  ai_summary_status     ← pending / complete / failed / skipped
  completeness_score    ← computed 0.0-1.0
  missing_fields_json   ← array of missing required fields
  ai_warnings_json      ← AI extraction warnings
  ai_risk_score         ← computed 0.0-1.0
  ai_risk_level         ← none / low / medium / high / critical
  ai_risk_reasons_json  ← array of risk reason strings

CONTENT TEXT (dms_document_content — separate table, separate RLS)
  document_id FK → dms_documents.id
  content_text TEXT     ← full OCR text, max 100,000 chars
  content_text_source   ← ocr / ai_intake / manual_override / truncated / system_resync
  content_text_sha256   ← SHA-256 of content_text
  content_text_char_count INTEGER
  is_truncated BOOLEAN
  ← Separate RLS: requires dms.admin for hr/legal/executive confidentiality_level

PER-FILE OCR (dms_document_files — already exists)
  ocr_text TEXT         ← per-file raw OCR (already in live DB)
  ocr_status, ocr_confidence, etc.

AI EXTRACTION RESULTS (dms_ai_extraction_results — already exists)
  raw_ocr_text          ← OCR input sent to AI
  raw_response_json     ← full AI JSON response
  extracted_fields_json ← structured fields
  additional_fields_json, detected_entities_json ← new columns (Phase 12.2)

FULL-TEXT SEARCH FLOW:
  List/Summary search → content_tsv @@ plainto_tsquery (safe, no raw OCR)
  Content search → JOIN dms_document_content WHERE content_text @@ ... (gated by permission)

FUTURE EMBEDDINGS (dms_document_content_chunks — Phase 12.5)
  chunk_index, chunk_text, embedding VECTOR(1536)
```

---

## 10. Phase Roadmap Overview

| Phase | Title | Dependencies | Effort | Risk |
|-------|-------|-------------|--------|------|
| 12.0 | Bug Fix | — | ✅ Done | — |
| **12.1** | Content Text Foundation + FTS | Phase 12.0 done | 2–3 days | Low |
| **12.2** | AI Summary + Summary UI | Phase 12.1 done | 2–3 days | Low |
| **12.3** | Completeness, Risk, Enhanced Search | Phase 12.2 done | 3–4 days | Medium |
| **12.4** | AI Search, Ask AI, Auto Tags, Smart Links | Phase 12.3 done | 5–7 days | Medium |
| **12.5** | pgvector Embeddings (Future) | Phase 12.4 stable | 5–7 days | High |

**Rule:** Each phase requires Sameer's explicit approval. A separate implementation prompt must be generated per phase. No phase implementation is contained in this plan.

---

## 11. Phase 12.1 — Content Text Foundation and Full-Text Search

### 11.1 Objectives

1. Create `dms_document_content` table (separate from `dms_documents`)
2. Add `content_tsv`, `ai_summary` placeholder columns, and risk/completeness placeholder columns to `dms_documents`
3. Hook `approveAiIntakeAndCreateDocument()` to write `content_text` at approval time
4. Hook OCR completion to write `content_text` after OCR run
5. Upgrade `getDmsDocuments` search to use tsvector for long queries (> 3 words)
6. Add read-only "Extracted Text" card to document record UI (gated by permission)
7. Add admin backfill action for existing documents

### 11.2 New Table: `dms_document_content`

```sql
-- REVIEW ONLY
CREATE TABLE public.dms_document_content (
  id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id               BIGINT NOT NULL
                              REFERENCES public.dms_documents(id) ON DELETE CASCADE,
  content_text              TEXT,
  content_text_updated_at   TIMESTAMPTZ,
  content_text_source       TEXT
                              CHECK (content_text_source IN (
                                'ocr', 'ai_intake', 'manual_override', 'truncated', 'system_resync'
                              )),
  content_text_sha256       TEXT,
  content_text_char_count   INTEGER CHECK (content_text_char_count >= 0),
  is_truncated              BOOLEAN NOT NULL DEFAULT false,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id)
);

ALTER TABLE public.dms_document_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dms_document_content FORCE ROW LEVEL SECURITY;

-- Policy: users who can view the parent document may read content
-- EXCEPTION: hr/legal/executive require dms.admin (enforced in server action layer)
CREATE POLICY dms_doc_content_select ON public.dms_document_content
  FOR SELECT TO public
  USING (
    auth.uid() IS NOT NULL
    AND current_user_has_permission('dms.documents.view')
  );

-- Policy: insert/update only via server actions (service role / admin client)
CREATE POLICY dms_doc_content_manage ON public.dms_document_content
  FOR ALL TO public
  USING (
    current_user_has_permission('dms.documents.edit')
    OR current_user_has_role('system_admin')
  );

CREATE INDEX idx_dms_document_content_doc ON public.dms_document_content (document_id);
```

> **Note:** Full-text search on `content_text` in this table uses a `tsvector` computed at query time, not a generated column. For search, a separate GIN index can be added:
> ```sql
> -- Optional: GIN index for content_text full-text search on dms_document_content
> CREATE INDEX idx_dms_doc_content_fts ON public.dms_document_content
>   USING GIN (to_tsvector('simple', coalesce(content_text, '')));
> ```

### 11.3 Additions to `dms_documents`

```sql
-- REVIEW ONLY — Phase 12.1 columns

-- Search index (covers safe text only — never raw OCR content)
ALTER TABLE public.dms_documents
  ADD COLUMN IF NOT EXISTS content_tsv TSVECTOR;  -- managed by server action, NOT generated

-- AI summary placeholder (columns added in 12.1, generation implemented in 12.2)
ALTER TABLE public.dms_documents
  ADD COLUMN IF NOT EXISTS ai_summary             TEXT,
  ADD COLUMN IF NOT EXISTS ai_summary_updated_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_summary_model       TEXT,
  ADD COLUMN IF NOT EXISTS ai_summary_status      TEXT
                             DEFAULT 'pending'
                             CHECK (ai_summary_status IN (
                               'not_required', 'pending', 'complete', 'failed', 'skipped'
                             )),
  ADD COLUMN IF NOT EXISTS ai_summary_error       TEXT,
  ADD COLUMN IF NOT EXISTS ai_summary_input_char_count  INTEGER,
  ADD COLUMN IF NOT EXISTS ai_summary_input_truncated   BOOLEAN DEFAULT false;

-- Completeness placeholders (scored in 12.3)
ALTER TABLE public.dms_documents
  ADD COLUMN IF NOT EXISTS completeness_score     NUMERIC(5,4)
                             CHECK (completeness_score >= 0 AND completeness_score <= 1),
  ADD COLUMN IF NOT EXISTS missing_fields_json    JSONB,
  ADD COLUMN IF NOT EXISTS ai_warnings_json       JSONB;

-- Risk score placeholders (computed in 12.3)
ALTER TABLE public.dms_documents
  ADD COLUMN IF NOT EXISTS ai_risk_score          NUMERIC(5,4)
                             CHECK (ai_risk_score >= 0 AND ai_risk_score <= 1),
  ADD COLUMN IF NOT EXISTS ai_risk_level          TEXT
                             CHECK (ai_risk_level IN ('none', 'low', 'medium', 'high', 'critical')),
  ADD COLUMN IF NOT EXISTS ai_risk_reasons_json   JSONB,
  ADD COLUMN IF NOT EXISTS ai_risk_updated_at     TIMESTAMPTZ;

-- GIN index on content_tsv
CREATE INDEX IF NOT EXISTS idx_dms_documents_content_tsv
  ON public.dms_documents USING GIN (content_tsv);

-- Partial index for backfill queries
CREATE INDEX IF NOT EXISTS idx_dms_documents_no_summary
  ON public.dms_documents (id)
  WHERE ai_summary IS NULL AND deleted_at IS NULL;
```

### 11.4 Why All Placeholder Columns Are Added in Phase 12.1

The `content_tsv` is a regular column (not a GENERATED column) that is updated by server actions. In Phase 12.1, it covers `document_no + title + description`. In Phase 12.2, the same column is updated to also include `ai_summary`. Since `content_tsv` and `ai_summary` are both regular columns on `dms_documents`, there is no SQL ordering problem — all columns can be added in any order. The **generation of AI summaries** is deferred to Phase 12.2. Only the column definitions are added in Phase 12.1.

### 11.5 Full-Text Search Design

**Configuration: `simple`** (not `english`)

**Reason:** ALGT documents contain:
- UAE ID numbers (`784-XXXX-XXXXXXX-X`) — must not be stemmed
- Passport/licence/TRN/permit numbers — must not be stemmed
- Arabic proper names transliterated to English — stemming breaks them
- Company names like "Petrofac", "ADNOC" — not English words
- `english` config stems "fishing" → "fish", "certificates" → "certif", which drops these matches

`simple` tokenizes and lowercases without stemming — safer for code-heavy, multilingual ERP documents.

**Weighted tsvector design:**

```sql
-- Function to build weighted tsvector for a document (REVIEW ONLY)
-- Called by server action after any change to document_no, title, description, ai_summary
to_tsvector('simple', coalesce(document_no,''))   weighted 'A'  ← highest: doc number
  || to_tsvector('simple', coalesce(title,''))     weighted 'A'  ← highest: title
  || to_tsvector('simple', coalesce(description,'')) weighted 'B'
  || to_tsvector('simple', coalesce(ai_summary,'')) weighted 'B'
```

**Note:** This is NOT a GENERATED column — it is a regular TSVECTOR column updated by server action after each content change. This allows Phase 12.1 to work without `ai_summary` (simply omit the `ai_summary` part of the expression until Phase 12.2 data exists).

**Search query strategy:**
```typescript
// Long queries (> 3 words) or full-content mode: use tsvector
if (searchTerms.split(/\s+/).filter(Boolean).length > 3 || mode === 'full') {
  query.textSearch('content_tsv', searchTerms, { type: 'plain', config: 'simple' });
} else {
  // Short queries / codes / IDs: ILIKE fallback (catches DMS-2026-000001, passport numbers, etc.)
  query.or(`document_no.ilike.%${s}%,title.ilike.%${s}%,description.ilike.%${s}%`);
}
```

**Snippet generation (Phase 12.3 UI):**
```sql
ts_headline('simple', content_text, plainto_tsquery('simple', $1),
  'StartSel=«, StopSel=», MaxWords=30, MinWords=15, MaxFragments=2')
```
This is run on `dms_document_content.content_text` with a JOIN — never on `dms_documents` directly.

### 11.6 Content Text Cap and Truncation Policy

- Maximum `content_text` size: **100,000 characters**
- If the extracted text exceeds 100,000 chars: store first 100,000 chars in `dms_document_content.content_text`, set `is_truncated = true`, set `content_text_source = 'truncated'`
- The full OCR text remains in `dms_document_files.ocr_text` (no cap there)
- Truncation is noted in `dms_documents.ai_warnings_json` as `"Document text truncated — full content in file OCR"`
- For AI summary generation (Phase 12.2): only the first 20,000 chars of `content_text` are sent to the AI (see Section 12)

### 11.7 Multi-File and Multi-Version Rules

- `content_text` reflects only the **current version's files** (files linked to `current_version_id`)
- If `current_version_id` is null, use all non-deleted files linked to the document
- Text from multiple files is concatenated with: `\n\n--- [File: {file_name}] ---\n\n`
- Deleted files (`deleted_at IS NOT NULL`) are excluded
- Files with `ocr_status = 'failed'` are skipped; a warning is added to `ai_warnings_json`
- When `current_version_id` changes (new version made current), `content_text` must be resynced
- Historical version content is NOT deleted — it remains in each version's file OCR text

### 11.8 Content Text Hash

**Column name: `content_text_sha256`** (not `content_text_hash`)

Uses SHA-256 only. The previous plan's suggestion of djb2 is invalid for ERP use — djb2 is a fast non-cryptographic hash prone to collisions. SHA-256 is the standard.

Computed as: `SHA-256(content_text)` as a hex string.  
Purpose: Change detection (is this document's content the same as before a resync?), not security.

### 11.9 Sync Trigger Points

| Event | Action |
|-------|--------|
| `approveAiIntakeAndCreateDocument()` | Write `content_text` from `raw_ocr_text` (already in AI result) |
| `triggerDmsOcrForFile()` completion | Consolidate OCR text → write `content_text` |
| `setCurrentDocumentVersion()` (new version) | Trigger content text resync |
| Admin backfill action | Process existing documents in batches |

### 11.10 Admin Backfill Action

A server action `adminBackfillDmsContentText(options)`:
- Parameters: `{ batchSize: number, resumeFromDocumentId?: number, dryRun?: boolean }`
- Permission: requires `dms.admin`
- Finds documents with `content_text IS NULL` and at least one file with `ocr_text IS NOT NULL`
- Consolidates OCR text from current version files
- Writes to `dms_document_content`
- Returns `{ processed, skipped, errors, nextResumeId }`
- Does NOT call AI — that is a Phase 12.2 action
- Does NOT log OCR text — logs only document_id, processed count, and status

### 11.11 Phase 12.1 Scope Boundary

**In scope:**
- `dms_document_content` table (schema only — no full-text content until backfill/intake sync)
- Placeholder columns on `dms_documents` for `ai_summary*`, `completeness_*`, `ai_risk_*`
- `content_tsv` column on `dms_documents`
- GIN index on `content_tsv`
- `approveAiIntakeAndCreateDocument()` updated to write `content_text` at approval
- OCR completion updated to write `content_text`
- `getDmsDocuments` search updated to use tsvector for > 3 words
- Admin backfill action
- Read-only "Extracted Text" card in document record Overview

**Not in scope (Phase 12.2+):**
- AI summary generation
- Completeness scoring algorithm
- Risk scoring algorithm
- Intent-based AI search
- Ask about document / Ask across DMS
- Auto-tags, smart links
- pgvector

---

## 12. Phase 12.2 — AI Summary

### 12.1 Objectives

1. Implement `generateAndSaveDmsAiSummary(documentId)` server action
2. Call it automatically after `approveAiIntakeAndCreateDocument()` (Phase 12.1) completes
3. Add "Generate Summary" / "Regenerate Summary" button to document record UI
4. Show `ai_summary` in document record Overview tab
5. Show summary snippet in All Documents list view
6. Update `content_tsv` to include `ai_summary` after it is generated
7. Implement `bulkGenerateMissingSummaries(options)` admin backfill

### 12.2 AI Summary Input Cap

**Maximum input to AI for summary generation: 20,000 characters** (not 100,000)

Rationale:
- A 20,000-char extract is approximately 4,000–5,000 tokens — well within GPT-4o's context
- For a document summary, the first 20,000 chars always contain the most relevant structured information
- Long-contract chunked summarization (summarize each chunk → combine) belongs to Phase 12.5
- Set `ai_summary_input_truncated = true` when `content_text` exceeds 20,000 chars

### 12.3 Summary Generation Rules

```
System prompt (Phase 12.2 draft):

You are a document summarisation assistant for the Alliance Gulf Logistics ERP system.
The ERP operates in the UAE (United Arab Emirates) and manages documents for shipping,
logistics, HR, contracts, insurance, and government compliance.

Summarise the document in exactly 3–5 sentences in plain English. Include:
- Document type and its business purpose
- Primary person, company, equipment, or project it concerns
  (include their ID/passport/licence/TRN number if present)
- Issue date and expiry date (if found), stated as facts
- Key outcome or result (e.g. "Fit for offshore duty", "Trade licence valid until 31 Dec 2026",
  "Contract value AED 2.3M for port equipment maintenance")
- Any critical warning found in the document
  (expired, missing required field, signature absent, low scan quality, conflicting dates)

Rules:
- Plain text only. No markdown. No bullet points. No headers. No JSON.
- Do NOT invent data. If a field is not in the document, omit it.
- Do NOT begin with "This document is..." — begin with the subject (e.g. "Emirates ID for...")
- Do NOT log the document content or this prompt anywhere.
```

### 12.4 Summary Confidentiality Rules

- For `confidentiality_level` in `('hr', 'legal', 'executive')`: require `dms.admin` permission before generating or regenerating summary
- `ai_summary` is stored on `dms_documents` (not in the separate content table)
- `ai_summary` is safe to include in `content_tsv` because it is a structured 3–5 sentence description, not raw OCR text
- `ai_summary` must never include sensitive personal data beyond name/ID (e.g. never include full salary, medical diagnosis, passport details in narrative form)
- If the document type is `hr` or `medical`, the summary may say "Medical certificate for [Name] — result: Fit for offshore duty — expires [date]" but must NOT include diagnosis, test results, or personal health details

### 12.5 Summary Cost Tracking

- Log to `erp_ai_usage_logs`: document_id, provider, model, input_char_count, output_char_count, status, duration_ms
- Do NOT log `content_text`, `ai_summary` text, or prompt content in usage logs
- Each summary ≈ $0.001–$0.005 (GPT-4o pricing at 20k input tokens). For 1,000 documents backfill ≈ $1–5.

### 12.6 Phase 12.2 Scope Boundary

**In scope:**
- `generateAndSaveDmsAiSummary(documentId)` server action
- `regenerateDmsAiSummary(documentId)` action
- `bulkGenerateMissingSummaries({ batchSize, resumeFromDocumentId })` admin action
- Auto-trigger after intake approval
- Update `content_tsv` after summary is saved
- AI Summary card in document record Overview
- Summary snippet column in All Documents list view
- Feature flag gate: `DMS_AI_SUMMARY`

**Not in scope:**
- Chunk-based summarization for very long documents
- Arabic-language summarization
- Summary comparison or versioning

---

## 13. Phase 12.3 — Completeness, Risk, Enhanced Search

### 13.1 Completeness Scoring

**Algorithm:**
```
base_score = (required_fields_with_values / total_required_fields_for_type)

bonus:
  + 0.10 if issue_date IS NOT NULL
  + 0.10 if expiry_date IS NOT NULL (only for document types with requires_expiry_tracking = true)
  + 0.05 if content_text IS NOT NULL
  + 0.05 if ai_summary IS NOT NULL

score = LEAST(1.0, base_score * 0.80 + bonuses)
```

`missing_fields_json` stores: array of `{ field_code, field_label_en }` from `dms_metadata_definitions` where `is_required = true` and no corresponding `dms_document_metadata_values` row exists.

### 13.2 Risk Scoring Algorithm

| Risk Factor | Score | Level Contribution |
|------------|-------|-------------------|
| `expiry_date < today` (expired) | +0.40 | critical |
| `expiry_date` within 30 days | +0.25 | high |
| `requires_expiry_tracking = true` AND `expiry_date IS NULL` | +0.20 | high |
| `issue_date IS NULL` | +0.10 | medium |
| Required field missing (each, max 3 fields counted) | +0.05 | medium |
| `classification_score < 0.5` (from AI extraction result) | +0.15 | medium |
| `is_truncated = true` on content (OCR quality concern) | +0.05 | low |
| AI warning in `ai_warnings_json` contains 'duplicate' | +0.20 | high |
| AI warning in `ai_warnings_json` contains 'low quality' | +0.10 | medium |
| `confidentiality_level` in `('hr','legal','executive')` AND `owner_user_id IS NULL` | +0.15 | high |

**Risk levels:**
- 0.00–0.10 = `none`
- 0.11–0.30 = `low`
- 0.31–0.55 = `medium`
- 0.56–0.80 = `high`
- 0.81–1.00 = `critical`

### 13.3 Enhanced Search Modes (All Documents list)

| Mode | Description | Backend |
|------|-------------|---------|
| Quick Search | Keyword: ILIKE on doc_no, title, description | Existing + expanded |
| Summary Search | tsvector: `content_tsv @@ plainto_tsquery('simple', ...)` | New |
| Content Search | Full OCR text: JOIN `dms_document_content` + FTS | New (permission-gated) |
| Advanced Filters | Type, category, expiry range, risk level, confidentiality | Existing + new fields |

### 13.4 Duplicate Detection (Phase 12.3 Addition)

**Layer 1 (existing):** SHA-256 exact hash on upload  
**Layer 2 (new):** Same `document_type_id` + same `party_id` + expiry date within 30 days  
**Layer 3 (new):** Same extracted identifier (passport/EID/licence number from `dms_document_metadata_values`)  
**Layer 4 (Phase 12.5):** Cosine similarity of embeddings

New server action `detectDmsSimilarDocuments(documentId)` runs Layers 2 and 3 and returns up to 5 similar documents. Called after intake approval, shown in AI review card.

UI warning: "⚠ This may be similar to [DMS-2026-000001 — Emirates ID Sameer Fahmi]. Options: View | Attach as new version | Continue | Cancel"

### 13.5 Phase 12.3 Scope Boundary

**In scope:**
- `evaluateDmsDocumentCompleteness(documentId)` server action
- `evaluateDmsDocumentRisk(documentId)` server action
- `detectDmsSimilarDocuments(documentId)` server action
- Completeness/risk/missing fields display in document record Overview
- Risk badge in All Documents list
- Enhanced search UI with modes
- Content search using `dms_document_content` JOIN
- Optional: GIN index on `dms_document_content.content_text`

**Not in scope:**
- Bulk risk/completeness evaluation (separate admin batch later)
- pgvector similarity

---

## 14. Phase 12.4 — AI Search, Ask AI, Auto Tags, Smart Links

### 14.1 AI Search: Intent Extraction + SQL

**Flow:**
```
User question
  ↓  extractDmsSearchIntent(question)  [AI call → structured JSON]
  ↓  searchDmsDocumentsByIntent(intent)  [SQL builder → database query]
  ↓  Result list with matchReason per document
```

**Intent JSON schema:**
```typescript
interface DmsSearchIntent {
  keywords: string[];
  document_type_hint: string | null;    // type_code from dms_document_types
  category_hint: string | null;         // category_code
  person_name_hint: string | null;      // search in metadata/links
  party_name_hint: string | null;       // linked party name
  date_from: string | null;             // ISO YYYY-MM-DD
  date_to: string | null;
  expiry_state: 'expired' | 'expiring_soon' | 'valid' | null;
  outcome_hint: string | null;          // e.g. "fit", "passed", "approved", "rejected"
  risk_hint: 'high' | 'medium' | 'low' | null;
  metadata_filters: Array<{ field_code: string; value: string }>;
  confidentiality_max: 'internal' | 'company' | 'hr' | 'finance' | 'legal' | 'executive' | null;
}
```

**Security rules:**
- `extractDmsSearchIntent` uses the RLS-enforced client (not admin client)
- `searchDmsDocumentsByIntent` always adds `deleted_at IS NULL`
- Search never returns `content_text` in results — only snippets
- For `confidentiality_max`: filter out documents above the requesting user's permitted level
- Feature flag: `DMS_AI_SEARCH`

**Why not RAG/pgvector first:** Full-text tsvector + intent-extracted SQL handles 95% of use cases, returns exact documents (not AI-generated text), is auditable, and has zero embedding cost. pgvector is deferred to Phase 12.5.

### 14.2 Ask About One Document

Server action: `askDmsDocumentQuestion(documentId, question)`

- Loads `content_text` from `dms_document_content` (permission-gated)
- Loads `ai_summary`, `description`, and core metadata from `dms_documents`
- Sends to LLM with strict "answer from document only" prompt
- Input cap: 8,000 chars from `content_text` + 1,000 chars from `ai_summary`
- Returns: `{ answer: string, confidence: 'high'|'medium'|'low', sourceUsed: string }`
- Feature flag: `DMS_DOCUMENT_QA`

**Prompt constraints:**
- Must not hallucinate. If answer not found: "I could not find this information in the document."
- Must cite which section of the document the answer came from

### 14.3 Ask Across DMS

Server action: `askDmsDocumentsQuestion(question)`:
1. Calls `extractDmsSearchIntent(question)`
2. Calls `searchDmsDocumentsByIntent(intent)` → list of matching documents with matchReason
3. Returns: `{ documents: [{id, document_no, title, ai_summary_snippet, matchReason}[]], filtersApplied: intent }`

Does NOT return a narrative LLM answer about documents — returns matching documents only. This prevents hallucination and is more useful operationally.

Feature flag: `DMS_CROSS_DOC_SEARCH`

### 14.4 Auto-Tag Suggestion

- After intake approval: call `suggestDmsDocumentTags(documentId)` (async, non-blocking)
- Reads: `detected_entities_json`, `ai_summary`, `classification` from AI result
- Matches against `dms_tags` using keyword matching
- Returns: `{ tagId, tagName, confidence, reason }[]`
- Requires user approval — shown in document record → Tags tab as pending suggestions
- Feature flag: `DMS_AUTO_TAGS`, `requires_human_review = true`

### 14.5 Smart ERP Link Suggestion

Party matching already exists in `matchEntitiesToParties()` during intake. Phase 12.4 enhancements:
- Persist AI-suggested links as "pending" entries in a new field or table
- Show "Suggested Links" in document record → Links tab with Accept/Reject per suggestion
- AI may only suggest — user must explicitly accept to write to `dms_document_links`
- Feature flag: `DMS_SMART_LINKS`, `requires_human_review = true`

---

## 15. Phase 12.5 — pgvector / Embeddings / Chunked Semantic Search (Future)

### 15.1 When to Implement

- After Phase 12.4 is stable and in production
- After at least 1,000 documents have AI summaries
- After cost/latency of embedding generation is evaluated
- After Sameer confirms vector search is needed beyond what intent + tsvector provides

### 15.2 Proposed Architecture

```sql
-- On dms_documents: summary-level embedding
ALTER TABLE dms_documents ADD COLUMN summary_embedding VECTOR(1536);
CREATE INDEX USING ivfflat (summary_embedding vector_cosine_ops) WITH (lists=100);

-- Chunked content table for large documents
CREATE TABLE dms_document_content_chunks (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id  BIGINT NOT NULL REFERENCES dms_documents(id) ON DELETE CASCADE,
  content_id   BIGINT NOT NULL REFERENCES dms_document_content(id) ON DELETE CASCADE,
  chunk_index  INTEGER NOT NULL,
  chunk_text   TEXT NOT NULL,
  chunk_tokens INTEGER,
  embedding    VECTOR(1536),
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);
-- RLS: ENABLE + FORCE; SELECT policy inherits dms.documents.view
```

### 15.3 Why Not Start with pgvector

- Requires pgvector Postgres extension to be enabled on Supabase
- Every document needs embedding generation: ~$0.0001 per document × 1,000 docs = $0.10 backfill (manageable), but re-indexing on every content update adds ongoing cost
- ivfflat index requires re-creation when data volume grows significantly
- Full-text tsvector + AI intent extraction already handles all stated use cases in Phase 12.4
- pgvector only adds value for "find documents similar to this one" or "find documents with semantically related content" — advanced use cases for Phase 12.5

---

## 16. Database Design Proposal — Review Only

> **All SQL below is REVIEW ONLY. Do not apply any of it without Sameer's explicit approval for the relevant phase. Do not create migration files in `supabase/migrations/` until each phase is separately approved and a dedicated implementation prompt is generated.**

### 16.1 Phase 12.1 SQL Summary

```sql
-- Phase 12.1 — dms_document_content table
CREATE TABLE public.dms_document_content (
  id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id               BIGINT NOT NULL UNIQUE
                              REFERENCES public.dms_documents(id) ON DELETE CASCADE,
  content_text              TEXT,
  content_text_updated_at   TIMESTAMPTZ,
  content_text_source       TEXT CHECK (content_text_source IN (
                              'ocr','ai_intake','manual_override','truncated','system_resync'
                            )),
  content_text_sha256       TEXT,
  content_text_char_count   INTEGER CHECK (content_text_char_count >= 0),
  is_truncated              BOOLEAN NOT NULL DEFAULT false,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.dms_document_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dms_document_content FORCE ROW LEVEL SECURITY;
CREATE INDEX idx_dms_document_content_doc ON public.dms_document_content (document_id);

-- Phase 12.1 — dms_documents new columns
ALTER TABLE public.dms_documents
  ADD COLUMN content_tsv                    TSVECTOR,
  ADD COLUMN ai_summary                     TEXT,
  ADD COLUMN ai_summary_updated_at          TIMESTAMPTZ,
  ADD COLUMN ai_summary_model               TEXT,
  ADD COLUMN ai_summary_status              TEXT DEFAULT 'pending'
    CHECK (ai_summary_status IN ('not_required','pending','complete','failed','skipped')),
  ADD COLUMN ai_summary_error               TEXT,
  ADD COLUMN ai_summary_input_char_count    INTEGER,
  ADD COLUMN ai_summary_input_truncated     BOOLEAN DEFAULT false,
  ADD COLUMN completeness_score             NUMERIC(5,4)
    CHECK (completeness_score >= 0 AND completeness_score <= 1),
  ADD COLUMN missing_fields_json            JSONB,
  ADD COLUMN ai_warnings_json              JSONB,
  ADD COLUMN ai_risk_score                  NUMERIC(5,4)
    CHECK (ai_risk_score >= 0 AND ai_risk_score <= 1),
  ADD COLUMN ai_risk_level                  TEXT
    CHECK (ai_risk_level IN ('none','low','medium','high','critical')),
  ADD COLUMN ai_risk_reasons_json           JSONB,
  ADD COLUMN ai_risk_updated_at             TIMESTAMPTZ;

CREATE INDEX idx_dms_documents_content_tsv ON public.dms_documents USING GIN (content_tsv);
CREATE INDEX idx_dms_documents_risk_level  ON public.dms_documents (ai_risk_level)
  WHERE ai_risk_level IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_dms_documents_no_summary  ON public.dms_documents (id)
  WHERE ai_summary IS NULL AND deleted_at IS NULL;
```

### 16.2 Phase 12.1 — New Feature Flag Rows

```sql
INSERT INTO public.erp_ai_feature_flags
  (feature_code, feature_name, description, is_enabled, requires_human_review, min_confidence_threshold)
VALUES
  ('DMS_CONTENT_TEXT_SYNC', 'DMS Content Text Sync',
   'Write content_text to dms_document_content after OCR or intake approval.',
   true, false, 0.000),
  ('DMS_AI_SUMMARY', 'DMS AI Document Summary',
   '3-5 sentence AI summary per document.',
   true, false, 0.000),
  ('DMS_AI_SEARCH', 'DMS AI Natural Language Search',
   'Intent extraction + SQL search.',
   true, false, 0.000),
  ('DMS_AUTO_TAGS', 'DMS AI Auto-Tag Suggestion',
   'AI suggests tags. User must approve.',
   true, true, 0.700),
  ('DMS_SMART_LINKS', 'DMS AI Smart ERP Linking',
   'AI suggests ERP record links. User must approve.',
   true, true, 0.750),
  ('DMS_RISK_SCORE', 'DMS AI Risk Scoring',
   'Compute risk score from expiry, completeness, AI warnings.',
   true, false, 0.000),
  ('DMS_COMPLETENESS', 'DMS AI Completeness Check',
   'Compute completeness_score from required metadata fields.',
   true, false, 0.000),
  ('DMS_DUPLICATE_DETECT', 'DMS Duplicate Document Detection',
   'Detect similar documents by sha256, metadata, and extracted identifiers.',
   true, true, 0.800),
  ('DMS_EXPIRY_INTEL', 'DMS AI Expiry Intelligence',
   'AI classifies expiry state from document text.',
   true, false, 0.000),
  ('DMS_DOCUMENT_QA', 'DMS Ask About Document',
   'Natural language Q&A for one document using content_text and ai_summary.',
   true, false, 0.000),
  ('DMS_CROSS_DOC_SEARCH', 'DMS Cross-Document AI Search',
   'AI intent extraction + SQL across all accessible documents.',
   true, false, 0.000)
ON CONFLICT (feature_code) DO NOTHING;
```

### 16.3 Phase 12.2 — `dms_ai_extraction_results` New Columns

```sql
ALTER TABLE public.dms_ai_extraction_results
  ADD COLUMN IF NOT EXISTS additional_fields_json  JSONB,
  ADD COLUMN IF NOT EXISTS detected_entities_json  JSONB;
```

### 16.4 Phase 12.5 (Future, Review Only)

```sql
-- pgvector (do not run — future only)
-- CREATE EXTENSION IF NOT EXISTS vector;
-- ALTER TABLE dms_documents ADD COLUMN summary_embedding VECTOR(1536);
-- CREATE INDEX USING ivfflat (summary_embedding vector_cosine_ops) WITH (lists=100);
```

---

## 17. RLS / Security / Confidentiality Rules

### 17.1 `dms_document_content` RLS Policy Design

The SELECT policy on `dms_document_content` grants access to users with `dms.documents.view`. However, **full `content_text` must additionally be filtered by confidentiality in the server action layer:**

```typescript
// Server action: getDocumentContentText(documentId)
// 1. Load dms_documents(id, confidentiality_level) — RLS enforced
// 2. Check:
if (['hr', 'legal', 'executive'].includes(doc.confidentiality_level)) {
  if (!hasPermission(ctx, 'dms.admin')) {
    return { success: false, error: 'Content access denied — document is confidential' };
  }
}
// 3. Only then load content from dms_document_content
```

List views and search results NEVER return `content_text` — they return snippets only.

### 17.2 `getDmsDocuments` Must Not Return Content Text

`getDmsDocuments` uses `select('*')` on `dms_documents`. Since `content_text` is now in `dms_document_content` (separate table), it is NOT returned by `select('*')` on `dms_documents`. This is the primary benefit of the separate-table design.

New columns added to `dms_documents` (`ai_summary`, `content_tsv`, `completeness_score`, `ai_risk_level`, etc.) are safe to return in list queries — they contain structured metadata, not raw OCR text.

`ai_summary` is returned in list queries for display (short text, not sensitive OCR). For confidential documents (`hr`, `legal`, `executive`), the server action should redact `ai_summary` from list results if the user does not have `dms.admin` — or set `ai_summary` to a placeholder like `"[Summary restricted — confidential document]"`.

### 17.3 `dms_intake_review_values` — Policy Issue

Current policy: `ALL for authenticated, QUAL = true`. RLS not forced.

This means any logged-in user can read any other user's intake review values. These are transient draft rows only (deleted after intake approval/discard), so practical risk is low. However:

**Proposed future fix (not Phase 12.1):**
```sql
-- Add FORCE ROW LEVEL SECURITY
ALTER TABLE dms_intake_review_values FORCE ROW LEVEL SECURITY;
-- Restrict to own session
-- (Requires upload_session_id linkage to uploaded_by = auth user profile ID)
```

Include this in Phase 12.x cleanup migration.

### 17.4 `dms_party_document_migration_map` — No RLS

Legacy migration tracking table. No PII. No sensitive content. Not accessible from DMS UI. Acceptable as-is.

---

## 18. AI Feature Flag Rules

Every AI feature in Phase 12 is gated by `erp_ai_feature_flags.is_enabled`. If the flag is disabled, the server action returns `{ success: false, error: 'Feature not enabled' }` without calling any AI.

| Feature Code | Phase | requires_human_review | Who controls |
|---|---|---|---|
| `DMS_CONTENT_TEXT_SYNC` | 12.1 | false | Automatic after OCR/intake |
| `DMS_AI_SUMMARY` | 12.2 | false | Auto after intake; manual regenerate |
| `DMS_COMPLETENESS` | 12.3 | false | Auto after document update |
| `DMS_RISK_SCORE` | 12.3 | false | Auto after document update |
| `DMS_DUPLICATE_DETECT` | 12.3 | **true** | Shows warning; user decides |
| `DMS_AI_SEARCH` | 12.4 | false | User-initiated search |
| `DMS_DOCUMENT_QA` | 12.4 | false | User-initiated Q&A |
| `DMS_CROSS_DOC_SEARCH` | 12.4 | false | User-initiated search |
| `DMS_AUTO_TAGS` | 12.4 | **true** | AI suggests; user approves |
| `DMS_SMART_LINKS` | 12.4 | **true** | AI suggests; user approves |
| `DMS_EXPIRY_INTEL` | 12.4 | false | Auto classification |

**Rule:** `AI_SEARCH` and `ERP_AI_ASSISTANT` flags already exist in the live DB. New flags are inserted with `ON CONFLICT DO NOTHING` to avoid duplicates with any existing flags using the same code.

---

## 19. AI Logging and Audit Rules

**Hard rules — no exceptions:**

| What to log | ✅ Allowed |
|-------------|-----------|
| action type (e.g. "ai_summary_generated") | ✅ |
| document_id | ✅ |
| user_id | ✅ |
| provider, model | ✅ |
| status (success/failed) | ✅ |
| input_char_count (not the text itself) | ✅ |
| output_char_count | ✅ |
| duration_ms | ✅ |
| safe error code/message (e.g. "rate_limit_exceeded") | ✅ |

| What to NEVER log | ❌ Forbidden |
|-------------------|-------------|
| `content_text` | ❌ |
| `ocr_text` | ❌ |
| AI system or user prompt | ❌ |
| Full AI raw response text | ❌ |
| `ai_summary` text | ❌ |
| Any personally identifiable extracted value | ❌ |
| API keys | ❌ |

This extends the existing rule from `erp-ai-settings-standard.mdc`: "No sensitive prompt data in usage logs."

---

## 20. Search Design and Ranking

### 20.1 Search Mode Summary

| Mode | Input | Backend | Returns |
|------|-------|---------|---------|
| Quick | Short keyword / ID | ILIKE on doc_no, title | Exact matches first |
| Summary | 1–3 words | `content_tsv @@ plainto_tsquery('simple',...)` | Ranked by `ts_rank_cd(content_tsv, ...)` |
| Full Content | 3+ words | JOIN `dms_document_content` FTS | Ranked + snippet |
| AI Question | Natural language | Intent extraction → SQL | With matchReason |
| Advanced | Filter panel | SQL filters on all columns | Sorted by date |

### 20.2 Ranking and Snippets

Results include:
- `ts_rank_cd(content_tsv, query)` — relevance score
- `ts_headline('simple', ai_summary, query, 'MaxWords=20, MinWords=8')` — summary snippet
- Content snippet via JOIN: `ts_headline('simple', content_text, query, 'MaxWords=35, MinWords=15, MaxFragments=2')` — full content match snippet
- Match reason label (e.g. "Matched in title and summary", "Found in document content")

Full `content_text` is **NEVER returned** in search results. Only computed `ts_headline` snippets are returned.

### 20.3 ILIKE Fallback for Short Queries

Short queries (≤ 3 words) or queries containing numbers (DMS-2026, 784-XXXX, TRN123) always use ILIKE fallback first, then tsvector. This ensures document numbers, passport numbers, and Emirates IDs are always found.

---

## 21. UI/UX Plan

### 21.1 Document Record — New Sections

| Tab / Section | Phase | Content |
|--------------|-------|---------|
| Overview → "AI Summary" card | 12.2 | `ai_summary` text + model + date + Regenerate button |
| Overview → "Extracted Text" card | 12.1 | `content_text` (read-only, collapsible, permission-gated) |
| Overview → "Completeness" badge | 12.3 | Score badge (green/amber/red) + missing fields list |
| Overview → "Risk" badge | 12.3 | Risk level badge (low/medium/high/critical) + reasons |
| Overview → "Duplicate Alert" | 12.3 | Warning card if similar documents detected |
| Tags tab → "Suggested Tags" | 12.4 | Pending AI-suggested tags with Accept/Reject |
| Links tab → "Suggested Links" | 12.4 | Pending AI-suggested links with Accept/Reject |
| Ask AI button (toolbar) | 12.4 | Opens Q&A drawer for this document |

### 21.2 All Documents List — New Features

| Feature | Phase | Location |
|---------|-------|----------|
| Summary snippet column | 12.2 | Secondary line under title |
| Risk badge | 12.3 | Inline column |
| Search mode toggle | 12.3 | Above search input |
| AI search input | 12.4 | Replaces/extends existing search bar |
| Advanced filter panel | 12.3 | Side panel or sheet |
| Content search mode | 12.3 | Mode toggle option |

### 21.3 General UI Rules

- All new AI-generated content must be clearly labeled with a small "AI" badge
- Confidence levels must be shown where relevant
- Regenerate/refresh actions must have loading states
- Suggested tags/links must show as "Pending AI suggestion" until accepted
- Ask AI drawer shows: "Answers based on extracted document text and summary only"
- Search results show why each document matched (matchReason string)

---

## 22. Backfill and Migration Strategy

### 22.1 Content Text Backfill (Phase 12.1)

- Action: `adminBackfillDmsContentText({ batchSize = 50, resumeFromDocumentId?, dryRun? })`
- Permission: `dms.admin` only
- Finds documents with `dms_document_content` missing AND `dms_document_files.ocr_text IS NOT NULL`
- Consolidates OCR text from current version files
- Writes to `dms_document_content`
- Supports resume (pass `nextDocumentId` from previous run)
- Rate: ~50 documents per batch, no AI calls, fast (< 1s per batch)
- Does NOT auto-run — admin must trigger manually

### 22.2 AI Summary Backfill (Phase 12.2)

- Action: `bulkGenerateMissingSummaries({ batchSize = 20, resumeFromDocumentId?, dryRun? })`
- Permission: `dms.admin` only
- Finds documents with `ai_summary_status = 'pending'` and `content_text IS NOT NULL`
- Calls AI for each document (rate-limited to avoid API throttling)
- Logs token counts, not content
- Recommended daily batch: 100 documents maximum (cost control)
- Does NOT auto-run — admin must trigger manually

### 22.3 Completeness + Risk Backfill (Phase 12.3)

- Action: `bulkEvaluateDocuments({ batchSize = 100, resumeFromDocumentId? })`
- Permission: `dms.admin` only
- No AI calls — pure SQL-based scoring
- Can process 1,000 documents per minute safely
- Safe to run any time

### 22.4 Backfill Principles

- All backfill actions are admin-triggered, never automatic
- All are resumable (next document ID returned in response)
- None log OCR text or document content
- All are idempotent (safe to re-run)
- Each respects `deleted_at IS NULL`
- Each uses RLS-enforced client for record access

---

## 23. QA and Acceptance Criteria

| Test | Expected Result | Phase |
|------|----------------|-------|
| Upload Emirates ID via AI intake + approve | `dms_document_content` row created with `content_text` from OCR | 12.1 |
| `content_text` in list query response | NOT present — only on `dms_document_content` | 12.1 |
| Search "Sameer" (1 word) | ILIKE match on title/doc_no — content_tsv NOT used | 12.1 |
| Search "offshore medical certificate" (3 words) | tsvector match on `content_tsv` | 12.1 |
| AI summary generated after intake | `ai_summary` in document Overview card | 12.2 |
| Search "offshore" includes summary matches | `content_tsv` includes ai_summary weight | 12.2 |
| Document with no required metadata | `completeness_score < 1.0`, missing fields shown | 12.3 |
| Expired document | `ai_risk_level = 'critical'`, badge shown in list | 12.3 |
| AI question: "show me passed offshore medicals" | Returns OFFSHORE_ONSHORE_MEDICAL_REPORT docs | 12.4 |
| Ask about document: "What is the expiry date?" | Returns answer from content_text, cites source | 12.4 |
| Confidential document (hr) list query | `content_text` not in response; `ai_summary` redacted | 12.1 |
| HR document content text access by non-admin | Error: "Content access denied — document is confidential" | 12.1 |
| tsc --noEmit | 0 errors | each phase |
| npm run build | PASS | each phase |
| `content_text_sha256` is valid hex string | `sha256(content_text)` verified | 12.1 |
| CHECK constraint violation | INSERT with invalid `ai_risk_level = 'extreme'` rejected by DB | 12.1 |

---

## 24. Risks and Mitigations

| Risk | Severity | Mitigation |
|------|---------|-----------|
| `select('*')` exposes new columns | High | Separate table design; ai_summary redacted for confidential docs |
| Summary reveals sensitive personal data | High | Prompt rules restrict PII; confidentiality gate |
| AI hallucination in search | Medium | AI only extracts intent (JSON); SQL retrieves actual docs |
| Large content_text slows list queries | High | content_text in separate table — not returned in list |
| `content_tsv` becomes stale | Medium | Server action always updates content_tsv after any change |
| Backfill crashes or times out | Medium | Resumable batch with batchSize parameter |
| AI summary cost overrun | Low | Cap at 20k chars; bulk backfill is admin-controlled |
| RLS bypass via new table | Medium | RLS enabled and forced on dms_document_content |
| pgvector complexity | Medium | Deferred to Phase 12.5 after FTS proves insufficient |

---

## 25. Hard Rejection Criteria

Any implementation prompt or PR for Phase 12 must be rejected if:

1. It implements code without being a matched Phase approval prompt
2. It creates migration files in `supabase/migrations/` before Sameer approves the phase
3. It modifies or disables any RLS policy
4. It uses `select('*')` to return `content_text` in list queries
5. It returns full `content_text` in search results (snippets only allowed)
6. It auto-saves AI tag or link suggestions without explicit user action
7. It returns `content_text` for `hr`/`legal`/`executive` docs without `dms.admin` permission
8. It skips `erp_ai_feature_flags` gate check for any AI feature
9. It logs OCR text, prompts, or full AI responses in any log
10. It sends 100,000 characters blindly to AI (input cap must be enforced)
11. It starts with pgvector before tsvector is working
12. It uses `createAdminClient()` for user-facing document search
13. It creates multiple plan files instead of updating this single master file
14. It adds new columns to `dms_documents` for `content_text` (must use separate table)

---

## 26. What Cursor Must Not Implement Until Separate Phase Approval

| Action | Blocked Until |
|--------|--------------|
| Create `dms_document_content` table | Phase 12.1 approved prompt |
| Add columns to `dms_documents` | Phase 12.1 approved prompt |
| Modify `approveAiIntakeAndCreateDocument()` | Phase 12.1 approved prompt |
| Modify `getDmsDocuments()` search | Phase 12.1 approved prompt |
| Generate AI summaries | Phase 12.2 approved prompt |
| Add completeness/risk scoring | Phase 12.3 approved prompt |
| Add enhanced search UI | Phase 12.3 approved prompt |
| Add intent extraction search | Phase 12.4 approved prompt |
| Add Ask AI feature | Phase 12.4 approved prompt |
| Add auto-tag suggestion | Phase 12.4 approved prompt |
| Add pgvector embeddings | Phase 12.5 approved prompt |
| Modify SOT `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | After phase implementation reports |
| Modify `.cursor/rules/*.mdc` files | After phase implementation reports |
| Add `.cursor/rules/erp-dms-ai-content-intelligence-standard.mdc` | After Phase 12.2 implementation |

---

## 27. Next Step After Sameer Approval

When Sameer approves this master plan, the next instruction to give Cursor is:

> **"Generate Phase 12.1 implementation prompt for ERP DMS — Content Text Foundation and Full-Text Search"**

That prompt will cover:
1. Create `dms_document_content` table with RLS
2. Add Phase 12.1 columns to `dms_documents` (including all placeholder columns for Phases 12.2–12.3)
3. Migration in `supabase/migrations/`
4. Insert new feature flag rows
5. Modify `approveAiIntakeAndCreateDocument()` to write `content_text`
6. Modify OCR completion to write `content_text`
7. Modify `getDmsDocuments` search (tsvector for > 3 words, ILIKE for short queries)
8. Add `updateDocumentContentTsv()` helper
9. Add `adminBackfillDmsContentText()` server action
10. Add read-only "Extracted Text" card to document record Overview
11. TypeScript PASS + build PASS
12. Phase 12.1 implementation report

After Phase 12.1 is implemented and reported, generate the Phase 12.2 prompt, and so on.

---

## 28. Appendix: Validated Audit Findings

| Finding | Confirmed | Impact on Plan |
|---------|----------|---------------|
| `dms_documents` has NO content_text, ai_summary, content_tsv | ✅ | All columns are new |
| `dms_document_files.ocr_text` already exists | ✅ | Source for content_text sync |
| `getDmsDocuments` uses `select('*')` | ✅ | **Drives separate table decision** |
| `getDmsDocument` uses `select('*')` | ✅ | Server action must redact for confidential docs |
| AI_SEARCH and ERP_AI_ASSISTANT flags already enabled | ✅ | New flags use ON CONFLICT DO NOTHING |
| All 27 DMS tables have RLS enabled + forced (except 2) | ✅ | No RLS gaps for new content table |
| `dms_intake_review_values` policy is `ALL for authenticated` | ✅ | Cleanup recommended (not Phase 12.1) |
| `dms_documents` has ZERO CHECK constraints | ✅ | New columns must add CHECK constraints |
| Existing indexes: 12 BTREE indexes, zero GIN | ✅ | GIN index is entirely new |
| `dms_ai_extraction_results` has `raw_response_json` with entities/additional_fields | ✅ | Phase 12.2 extracts to dedicated columns |
| `dms_metadata_definitions` has `is_ai_extractable` and `is_required` | ✅ | Used for completeness scoring algorithm |
| `matchEntitiesToParties()` already exists in ai-intake.ts | ✅ | Phase 12.4 builds on this |
| `file-content-extractor.ts` returns `text` field | ✅ | This is the source for `content_text` |
| No tsvector or FTS anywhere in current codebase | ✅ | Phase 12.1 is entirely new |
| `erp_ai_feature_flags` uses `feature_code` column | ✅ | New rows use `ON CONFLICT (feature_code) DO NOTHING` |

---

## 29. Appendix: Review-Only SQL Notes

The companion SQL review file (`implementation_Review/sql_review/ERP_DMS_12_1_AI_CONTENT_INTELLIGENCE_PROPOSED_SCHEMA.sql`) was generated in the earlier planning session. It will need to be **updated** to reflect the architectural decision to use a separate `dms_document_content` table (instead of adding `content_text` to `dms_documents`), and to use the `simple` text search configuration (instead of `english`).

The updated SQL review file should be regenerated as part of the Phase 12.1 implementation prompt — not now.

**Key differences from the original SQL review file:**
1. `content_text` and related columns → move to `dms_document_content` table
2. `content_tsv` on `dms_documents` → regular column (not GENERATED), covers only safe text
3. Text search config → `simple` (not `english`)
4. `content_text_hash` → renamed to `content_text_sha256`
5. CHECK constraints added to all new status/score/level columns
6. Separate RLS section for `dms_document_content`

The original SQL file remains as a historical reference but is superseded by this updated plan.

---

*This plan is PLANNING ONLY. No code, migrations, server actions, UI files, or database changes have been made.*  
*Status: Awaiting Sameer's approval before Phase 12.1 implementation prompt is generated.*
