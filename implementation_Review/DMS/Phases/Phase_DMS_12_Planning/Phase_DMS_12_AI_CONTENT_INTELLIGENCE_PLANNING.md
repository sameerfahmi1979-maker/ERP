# ERP DMS Phase 12 — AI Content Intelligence & Semantic Search Planning

**Prepared:** 2026-06-15  
**Author:** Sameer Fahmi (concept) / AI Lead (documentation)  
**Status:** PLANNING — ready for ChatGPT review and phase approval  
**Parent Module:** DMS (Document Management System)

---

## Context & Motivation

The DMS currently:
- Uploads and stores documents
- Extracts text via OCR
- Runs AI classification + field extraction (issue date, expiry, type, etc.)
- Saves extracted suggestions and lets the user approve them

**What it cannot do yet:**
1. Store the full readable content of a document in the database for full-text search
2. Summarise a document in plain language and save it as a searchable cell
3. Answer natural-language questions that span across all documents (e.g. "show me everyone who passed their offshore medical")

The following three features address this gap.

---

## Feature 1 — AI Full-Text Content Cell (`content_text`)

### Problem
The OCR text is extracted to `dms_ocr_results` but is not stored on the document itself. You cannot filter or search by it from the documents list. It is also not visible in the document overview.

### Proposed Solution
Add a `content_text TEXT` column to `dms_documents`. After OCR or AI extraction completes, store the full cleaned text in this column. Also expose it as a read-only "Full Text" field on the document record.

### Database Change
```sql
ALTER TABLE dms_documents
  ADD COLUMN IF NOT EXISTS content_text TEXT,
  ADD COLUMN IF NOT EXISTS content_text_updated_at TIMESTAMPTZ;

-- Full-text search index (PostgreSQL tsvector)
ALTER TABLE dms_documents
  ADD COLUMN IF NOT EXISTS content_tsv TSVECTOR
    GENERATED ALWAYS AS (
      to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,'') || ' ' || coalesce(content_text,''))
    ) STORED;

CREATE INDEX IF NOT EXISTS idx_dms_documents_content_tsv
  ON dms_documents USING GIN (content_tsv);
```

### Server Action Changes
- After `approveAiIntakeAndCreateDocument` succeeds, call `updateDocumentContentText(documentId, extractedText)`.
- After OCR run completes (existing `runDmsOcr`), also write to `content_text`.
- Keep `content_text` and `dms_ocr_results` in sync — `content_text` is the denormalised fast-search copy.

### UI Changes
- **Document record → Overview section**: Show a collapsible "Extracted Document Text" card (read-only `<pre>` or `<Textarea readonly>`).
- **DMS Admin → each document**: Allow manual override of `content_text` by an admin.

### Why
- Enables native PostgreSQL `to_tsvector` / `plainto_tsquery` keyword search across all document content without calling an AI model at search time.
- Makes the All Documents search box meaningfully search inside files, not just titles.

---

## Feature 2 — AI Document Summary Cell (`ai_summary`)

### Problem
Users need a human-readable one-paragraph summary of each document to quickly understand what it contains without opening it. They also want to be able to search by summary content (e.g. "show me medicals that say fit for offshore").

### Proposed Solution
Add an `ai_summary TEXT` column to `dms_documents`. After AI extraction, call the LLM with the extracted content and ask it to produce a concise summary (3–5 sentences). Store the result.

### Database Change
```sql
ALTER TABLE dms_documents
  ADD COLUMN IF NOT EXISTS ai_summary TEXT,
  ADD COLUMN IF NOT EXISTS ai_summary_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_summary_model VARCHAR(100);
```

### AI Prompt (Summary Generation)
```
You are a document summarisation assistant for a logistics and transport ERP.

Summarise the document in 3–5 sentences. Include:
- The document type and its purpose
- The primary person or entity it concerns (name, ID number if present)
- Key dates (issue, expiry, validity period)
- Any key outcome or result (e.g. "Fit for offshore work", "Visa valid until...", "Contract value AED X")
- Any critical warning or note

Return plain text only. No markdown, no bullet points.
```

### Server Action Changes
- Add `generateAndSaveDmsAiSummary(documentId)` server action in `src/server/actions/dms/ai-summary.ts`.
- Call automatically after `approveAiIntakeAndCreateDocument` (non-blocking, background).
- Allow re-generation from the document record UI (button: "Regenerate AI Summary").

### UI Changes
- **Document record → Overview section**: Show "AI Summary" card below document details.
  - Shows summary text, model used, and "last updated" timestamp.
  - "Regenerate" button (admin/editor only).
- **All Documents list**: Show summary as a tooltip or secondary line on hover.

### Why
- Creates a natural-language synopsis that bridges raw OCR text and user understanding.
- Summary is stored in the DB → searchable via `ILIKE` or full-text index.
- Enables queries like: "offshore medical fitness certificates where result is fit" by searching `ai_summary ILIKE '%fit for offshore%'`.

---

## Feature 3 — AI-Powered Semantic Document Search

### Problem
The current "All Documents" search is keyword-only (title, description, document_no). Users want to ask questions like:
- "Show me all employees whose offshore medical expired this year"
- "Find all contracts with Alliance Gulf for 2024"
- "Which people passed the offshore fitness test?"

These queries need to understand the *meaning* of document content, not just match keywords.

### Proposed Solution: Two-Stage Approach

#### Stage A — Enhanced Keyword Search (Quick Win, Phase 12.1)
Use PostgreSQL full-text search (`to_tsquery`) across `title + description + content_text + ai_summary` to power the existing search box. No AI call needed at query time.

**Implementation:**
- Add `content_tsv` generated column (already described in Feature 1).
- Modify `listDmsDocuments` filter to use `content_tsv @@ plainto_tsquery('english', :query)` when the search term is longer than 3 words.
- Fall back to `ilike` for short / code-based queries.

#### Stage B — Natural Language AI Search (Phase 12.2)
Add a dedicated "AI Search" mode to the All Documents page, separate from the standard filter bar.

**How it works:**
1. User types a natural language question in the AI Search input.
2. Frontend sends the question to a new server action `askDmsDocumentQuestion(question)`.
3. The action:
   a. Uses `ai_summary` + `content_text` columns already in the DB — NO file downloads needed.
   b. Builds a retrieval query: extract key terms from the question using a lightweight LLM call, then search the DB using those terms + date filters.
   c. Scores and ranks matching documents.
   d. Returns an array of `{ documentId, score, matchReason }` objects.
4. Frontend displays the results as a filtered document list, with the `matchReason` shown as a badge/tooltip.

**Architecture options:**

| Option | Approach | Pros | Cons |
|--------|----------|------|------|
| A (Recommended) | LLM extracts search intent → SQL filter | Fast, no vector DB, works with existing Supabase | Limited semantic depth |
| B | pgvector embeddings on `ai_summary` | True semantic search | Requires pgvector extension + re-embedding pipeline |
| C | Full RAG (retrieve + generate answer) | Most powerful | Very complex, high latency, high cost |

**Recommendation: Start with Option A for Phase 12.2, plan pgvector (Option B) for Phase 12.3.**

### Option A Detail — Intent Extraction + SQL Search

```typescript
// Pseudocode
async function askDmsDocumentQuestion(question: string) {
  // Step 1: Ask LLM to parse intent into structured filters
  const intent = await openai.chat({
    messages: [{
      role: "system",
      content: `Extract search filters from the user's document search question.
Return JSON: {
  keywords: string[],          // words to search in title/summary/content
  document_type_hint: string | null,  // e.g. "medical", "passport", "contract"
  person_name_hint: string | null,
  date_from: string | null,    // ISO date
  date_to: string | null,
  outcome_hint: string | null  // e.g. "passed", "fit", "expired"
}`
    }, {
      role: "user",
      content: question
    }]
  });

  // Step 2: Build SQL query from parsed intent
  const filters = parseIntentJson(intent);
  const results = await searchDmsDocumentsByIntent(filters);

  // Step 3: Return matched documents with reason
  return results;
}
```

### Database additions for semantic search
```sql
-- Enable pgvector for Phase 12.3 (optional, future)
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE dms_documents
  ADD COLUMN IF NOT EXISTS summary_embedding VECTOR(1536); -- OpenAI text-embedding-3-small

CREATE INDEX IF NOT EXISTS idx_dms_documents_embedding
  ON dms_documents USING ivfflat (summary_embedding vector_cosine_ops)
  WITH (lists = 100);
```

---

## Bugs Fixed in This Cycle (Pre-Phase 12)

| # | Bug | Root Cause | Fix Applied |
|---|-----|-----------|-------------|
| 1 | Document Number shows `[object Object]` | `ai-intake.ts` called `String(docNoData)` on the raw RPC array response instead of extracting `docNoRows[0].generated_reference_number` | Fixed in `src/server/actions/dms/ai-intake.ts` |
| 2 | Metadata section appears empty | Document type "Offshore / Onshore medical Report" has no metadata definitions configured | Not a code bug — go to DMS Admin → Metadata Definitions → Add fields for this document type |

---

## Implementation Phases Summary

| Phase | Feature | Effort | Priority |
|-------|---------|--------|----------|
| 12.0 | Bug fix: document_no `[object Object]` | Done | Critical |
| 12.1 | `content_text` column + tsvector full-text index | Small (1 migration + 2 server action changes) | High |
| 12.2 | `ai_summary` column + AI summary generation | Medium (migration + new server action + UI card) | High |
| 12.3 | Enhanced keyword search using tsvector in list | Small (modify `listDmsDocuments` filter) | Medium |
| 12.4 | AI Search UI + intent extraction | Medium-Large (new search bar, new server action) | Medium |
| 12.5 | pgvector embeddings + cosine-similarity search | Large (embedding pipeline, nightly re-index) | Low (future) |

---

## Files to Create / Modify

### New files
- `supabase/migrations/20260616_dms_content_text_and_summary.sql` — adds `content_text`, `content_tsv`, `ai_summary`, `summary_embedding` columns
- `src/server/actions/dms/ai-summary.ts` — `generateAndSaveDmsAiSummary`, `askDmsDocumentQuestion`
- `src/features/dms/documents/sections/dms-document-content-text-section.tsx` — read-only full-text card
- `src/features/dms/documents/sections/dms-document-ai-summary-section.tsx` — summary card with regenerate button
- `src/features/dms/search/dms-ai-search-bar.tsx` — AI search input for All Documents page

### Modified files
- `src/server/actions/dms/ai-intake.ts` — call `updateDocumentContentText` and `generateAndSaveDmsAiSummary` after approval
- `src/server/actions/dms/documents.ts` — update `listDmsDocuments` to use `content_tsv` for full search
- `src/features/dms/documents/dms-document-record-form.tsx` — add new sections
- `src/features/dms/documents/dms-all-documents-page-client.tsx` — add AI Search bar toggle
- `src/server/actions/dms/ocr.ts` — write OCR text to `content_text` after OCR run

---

## Open Questions for Review

1. **Summary auto-generation timing:** Should summary generation be synchronous (user waits) or a background job? Synchronous is simpler but adds ~5s to the intake approval. Background requires a job queue.
2. **Summary regeneration cost control:** Should we limit re-generation to admins only, or allow any editor?
3. **AI Search scope:** Should AI search include soft-deleted documents? Should it respect confidentiality-level permissions?
4. **pgvector timing:** Do we want to set up the embedding pipeline now (so documents accumulate embeddings from day one) or wait until we have enough documents to justify it?
5. **`content_text` size limits:** Very large documents (multi-page contracts, scanned books) may produce huge text. Should we cap `content_text` at e.g. 50,000 characters and store the rest only in `dms_ocr_results`?

---

*This document is ready for ChatGPT review and phase approval before implementation begins.*
