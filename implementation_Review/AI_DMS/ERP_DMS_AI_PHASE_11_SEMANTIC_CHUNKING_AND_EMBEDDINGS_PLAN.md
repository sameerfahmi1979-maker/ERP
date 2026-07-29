# ERP DMS AI Phase 11 — Semantic Chunking and Embeddings Plan

**Created:** 2026-06-24  
**Status:** PLANNING ONLY — no implementation yet  
**Prior phase:** Phase 10B — Queue-backed Admin OCR Backfill (CLOSED)  
**Planned by:** Cursor AI coding agent (planning-only pass)

---

## 1. Executive Summary

The DMS AI semantic layer currently provides **document-level embeddings** only (Phase 12.5). Each document receives one embedding vector derived from its AI summary (or a truncated 8 000-character snippet of its `content_text`). The RPC `search_dms_documents_by_embedding` performs cosine similarity search at the document granularity.

Phase 11 upgrades this into a **chunk-level semantic layer**:

- Split each document's full `content_text` into overlapping text chunks.
- Store chunks in a new `dms_document_content_chunks` table with per-chunk embeddings.
- Queue chunk embedding jobs through the Phase 9 `dms_ai_job_queue`.
- Upgrade semantic search to query chunks, then aggregate and deduplicate by document.
- Upgrade Document Q&A to retrieve relevant chunks and ground answers in them.
- Provide admin dry-run / enqueue / backfill tooling.
- Enforce RLS and confidentiality gates at the chunk layer.
- Keep existing document-level `summary_embedding` behavior unchanged (additive only).

Phase 11 must **not** change the OCR pipeline, intake pipeline, classification pipeline, or approval pipeline.

---

## 2. Planning Scope and Non-Implementation Rule

This document is a **planning-only deliverable**.

**Cursor must not:**
- Change any source code file.
- Add any migration.
- Modify any database schema.
- Modify any UI component.
- Modify any server action.

This plan is authored for ChatGPT review before implementation begins.

---

## 3. Files and Source-of-Truth Reviewed

### Source-of-truth documents read

| File | Status |
|------|--------|
| `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md` | Read — post Phase 10B |
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | Read via SOT |
| `implementation_Review/ERP_DMS_AI_PHASE_10B_QUEUE_BACKED_ADMIN_OCR_BACKFILL_IMPLEMENTATION_REPORT.md` | Read |

### Semantic/embedding code read

| File | Found | Notes |
|------|-------|-------|
| `src/server/actions/dms/semantic-search.ts` | ✅ | Document-level embedding generation + search |
| `src/server/actions/dms/ask-ai.ts` | ❌ MISSING | File does not exist |
| `src/server/actions/dms/document-qa.ts` | ✅ | Single-doc Q&A action (the actual "Ask AI" backend) |
| `src/server/actions/dms/document-content.ts` | Not read — not needed for planning |
| `src/lib/dms/content-text.ts` | ✅ | Normalise / cap / sha256 helpers |
| `src/lib/dms/semantic/*` | ❌ MISSING — directory does not exist |
| `src/lib/dms/embedding/*` | ❌ MISSING — directory does not exist |
| `src/lib/dms/ai/factory.ts` | ✅ | `getDmsEmbeddingProvider()` |
| `src/lib/dms/ai/types.ts` | ✅ | `DmsEmbeddingOutput`, `IDmsAiProvider.embedText` |
| `src/lib/dms/ai/openai-dms-adapter.ts` | ✅ | `embedText()` implementation |
| `src/lib/dms/orchestration/system-pipeline.ts` | ✅ | `runEmbeddingStepSystem()` step |
| `src/lib/dms/ai-jobs/job-types.ts` | ✅ | `EMBEDDING` type defined, no handler |
| `src/lib/dms/ai-jobs/job-registry.ts` | ✅ | Only `POST_APPROVE_ORCHESTRATION` + `OCR_BACKFILL` registered |
| `src/lib/dms/ai-jobs/job-runner.ts` | ✅ | `enqueueUniqueDmsAiJob`, `processNextDmsAiJobs` |

### UI files read

| File | Found | Notes |
|------|-------|-------|
| `src/features/dms/documents/sections/dms-document-semantic-section.tsx` | ✅ | Embedding status, find similar, generate/regenerate |
| `src/features/dms/documents/sections/dms-document-ask-ai-section.tsx` | ✅ | Single-doc chat UI, uses `document-qa.ts` |
| `src/features/dms/admin/dms-intelligence-admin-page-client.tsx` | ✅ | Inline bulk embedding backfill card exists |

### Migrations read

| File | Content |
|------|---------|
| `20260615060000_erp_dms_12_1_content_text_foundation.sql` | `dms_document_content` table, RLS, `content_text_sha256`, FTS index |
| `20260615100000_erp_dms_12_5_semantic_search_pgvector.sql` | `vector` extension, `summary_embedding` column (1536d), HNSW index, `search_dms_documents_by_embedding` RPC, `DMS_SEMANTIC_SEARCH` flag |
| `20260616180000_erp_common_ai_0_governance_feature_flags_permissions.sql` | No embedding-specific flags |
| `20260622152000_erp_dms_ai_phase9_feature_flags.sql` | `DMS_AI_JOB_QUEUE`, `DMS_AI_JOB_QUEUE_WORKER_ENABLED` only |
| `20260622160000_erp_dms_ai_phase10a_ocr_flags_and_provider.sql` | OCR routing flags |

---

## 4. Current Semantic / Embedding Inventory

### 4.1 Tables

| Table / Column | Location | Status |
|----------------|----------|--------|
| `dms_documents.summary_embedding` | `vector(1536)` | Active — document-level |
| `dms_documents.summary_embedding_model` | `text` | Active |
| `dms_documents.summary_embedding_status` | `text CHECK (pending/complete/failed/skipped/not_required)` | Active |
| `dms_documents.summary_embedding_source` | `text CHECK (ai_summary/content_text)` | Active |
| `dms_documents.summary_embedding_updated_at` | `timestamptz` | Active |
| `dms_documents.summary_embedding_error` | `text` | Active |
| `dms_document_content_chunks` | — | **DOES NOT EXIST** |

### 4.2 pgvector extension

- `CREATE EXTENSION IF NOT EXISTS vector` — applied in migration `20260615100000`.
- pgvector version: v0.8.0 (per migration comment). Supports HNSW.
- HNSW index already created: `idx_dms_documents_summary_embedding` using `vector_cosine_ops`.

### 4.3 Embedding dimension

- Confirmed: **1536 dimensions** (`text-embedding-3-small`).
- `EMBEDDING_MODEL_DEFAULT = "text-embedding-3-small"` in `openai-dms-adapter.ts`.
- `DEFAULT_EMBEDDING` provider config: `text-embedding-3-small`, confirmed in `20260614191500` migration.

### 4.4 Feature flags (confirmed from migrations and code)

| Flag | Source | Default | Notes |
|------|--------|---------|-------|
| `DMS_SEMANTIC_SEARCH` | Migration 12.5 | `true` | Controls semantic search + embedding generation UI |
| `DMS_EMBEDDING` | Referenced in `system-pipeline.ts:442` — **NOT in any migration** | **UNKNOWN — gap!** | Used to gate `runEmbeddingStepSystem`. May default false or throw on miss |
| `DMS_CONTENT_TEXT_SYNC` | Migration 12.1 | `true` | Controls content text sync |
| `DMS_DOCUMENT_QA` | Migration 12.1 | `true` | Controls document Q&A |
| `DMS_AI_JOB_QUEUE` | Phase 9 migration | `false` | Master queue gate |
| `DMS_AI_JOB_QUEUE_WORKER_ENABLED` | Phase 9 migration | `false` | Worker route gate |

**Critical gap:** `DMS_EMBEDDING` is referenced in `system-pipeline.ts` but has no corresponding migration. It must be created in Phase 11 (or verified as already in DB via live query before implementation).

### 4.5 RPC functions

| Function | Location | Behavior |
|----------|----------|----------|
| `search_dms_documents_by_embedding(p_query_embedding, p_match_count, p_match_threshold, p_is_admin, p_exclude_document_id)` | Migration 12.5 | SECURITY INVOKER. Searches `dms_documents` by cosine similarity. Excludes hr/legal/executive for non-admin. Returns document metadata only — no content text. |

### 4.6 Server actions (semantic)

| Action | File | Behavior |
|--------|------|----------|
| `generateDmsDocumentEmbedding` | `semantic-search.ts` | Single doc — embed AI summary / content fallback |
| `regenerateDmsDocumentEmbedding` | `semantic-search.ts` | Force re-embed |
| `getDmsDocumentEmbeddingStatus` | `semantic-search.ts` | Status check |
| `bulkGenerateMissingDmsEmbeddings` | `semantic-search.ts` | Inline synchronous backfill (max 50 / run) |
| `semanticSearchDmsDocuments` | `semantic-search.ts` | Query → embed → RPC → return results |
| `findSimilarDmsDocuments` | `semantic-search.ts` | Use source doc's embedding to find similar |
| `askDmsDocumentQuestion` | `document-qa.ts` | Q&A for single doc — uses content_text (8k cap) + summary, NOT chunk-based |

### 4.7 Ask AI / Document Q&A — current behavior

- **`askDmsDocumentQuestion`** (`document-qa.ts`): loads `content_text` (truncated to 8 000 chars) and `ai_summary` (truncated to 1 000 chars) and feeds them as context to GPT.
- **No chunk retrieval.** The full 8k raw text is passed inline.
- **No semantic vector search** used to find relevant passages — the whole truncated text is used.
- Supported by feature flag `DMS_DOCUMENT_QA`.

### 4.8 Orchestration pipeline embedding step

`runEmbeddingStepSystem` in `system-pipeline.ts`:
- Called at step `embedding` after content sync, AI summary, and AI intelligence.
- Checks `DMS_EMBEDDING` feature flag (not in migrations — gap).
- Embeds the AI summary (preferred) or `content_text` as a single vector.
- Stores to `dms_documents.summary_embedding`.
- Does NOT create chunks.

### 4.9 Job queue

- `DMS_AI_JOB_TYPE.EMBEDDING = "embedding"` is defined in `job-types.ts`.
- **No handler is registered** in `job-registry.ts`.
- No semantic chunking job type exists at all.
- Inline backfill `bulkGenerateMissingDmsEmbeddings` is the only backfill path.

### 4.10 Summary of current embedding behavior

```
Embedding type:         document-level ONLY
Embedding source:       ai_summary (preferred) OR content_text first 8000 chars (fallback)
Embedding storage:      dms_documents.summary_embedding vector(1536)
Semantic search:        one embedding per document
Q&A grounding:          raw content_text (8k chars) — no chunk retrieval
Chunk table:            DOES NOT EXIST
Chunk-level embeddings: DOES NOT EXIST
Queue-backed embeddings: NOT WIRED (job type exists, no handler)
```

---

## 5. Current Content Source Review

### 5.1 `dms_document_content` table

```sql
id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY
document_id             BIGINT NOT NULL UNIQUE REFERENCES dms_documents(id)
content_text            TEXT                          -- capped at 100 000 chars
content_text_updated_at TIMESTAMPTZ
content_text_source     TEXT CHECK ('ocr','ai_intake','manual_override','truncated','system_resync')
content_text_sha256     TEXT                          -- sha256 hex of stored text
content_text_char_count INTEGER
is_truncated            BOOLEAN DEFAULT false
created_at              TIMESTAMPTZ
updated_at              TIMESTAMPTZ
```

### 5.2 Other content columns

| Column / Table | Purpose | Chunking relevance |
|----------------|---------|-------------------|
| `dms_document_files.ocr_text` | Per-file OCR text | Raw source before content sync — do NOT chunk directly |
| `dms_document_content.content_text` | Canonical document text (normalized, capped) | **PRIMARY chunking source** |
| `dms_documents.ai_summary` | 2–4 sentence summary | Useful for document-level embedding only; too short for chunking |
| `dms_ai_extraction_results.raw_ocr_text` | AI intake OCR transcript | Already promoted to `content_text` on approval — do NOT re-use |
| `dms_document_metadata_values` | Typed metadata fields | Not a text corpus — do NOT chunk |

### 5.3 Canonical chunking source — confirmed

**`dms_document_content.content_text`** is the canonical source for chunking.

Rationale:
- Already normalized (line endings, trimmed).
- Already capped at 100 000 chars.
- SHA256 hash already computed (`content_text_sha256`) — ideal for invalidation.
- 1:1 with `dms_documents`.
- RLS enforced.

### 5.4 Fallback rules

```
If dms_document_content row does not exist:
  → skip; mark chunk build as no_content
If content_text IS NULL or trim() = '':
  → skip; mark chunk build as no_content
If content_text length < 200 chars:
  → create one chunk (the full text) instead of splitting
  → mark source_kind = 'short_document'
If content_text is truncated (is_truncated = true):
  → chunk from truncated text; mark chunk.source_kind = 'truncated_content'
```

---

## 6. Current Gaps and Risks

| # | Gap / Risk | Severity | Phase 11 action |
|---|-----------|----------|----------------|
| G-01 | No chunk table — semantic search is document-level only | HIGH | Create `dms_document_content_chunks` |
| G-02 | `DMS_EMBEDDING` flag referenced in code but NOT in any migration | HIGH | Add migration to insert flag (default false) |
| G-03 | `EMBEDDING` job type has no handler — all embeddings are inline | HIGH | Register handler (wires queue to embedding) |
| G-04 | Document Q&A uses raw 8k text — no chunk retrieval, poor long-doc quality | MEDIUM | Plan chunk-grounded Q&A path |
| G-05 | `bulkGenerateMissingDmsEmbeddings` is synchronous, inline — no queue backfill | MEDIUM | Plan queue-backed semantic index backfill |
| G-06 | `src/lib/dms/semantic/*` and `src/lib/dms/embedding/*` directories are empty | HIGH | Create these modules in Phase 11 |
| G-07 | No content_hash change detection for chunks — no invalidation strategy | HIGH | Plan hash-based invalidation |
| G-08 | Semantic search returns document-level match, no snippet | LOW | Plan chunk-snippet retrieval in search results |
| G-09 | Ask AI uses `document-qa.ts` not `ask-ai.ts` — file referenced in prompt does not exist | INFO | Document correctly; no rename needed |
| G-10 | No admin dry-run / enqueue for semantic index backfill | MEDIUM | Plan admin tools |
| G-11 | No cost controls on batch embedding runs | MEDIUM | Plan chunk/batch limits |
| G-12 | pgvector HNSW index only on `summary_embedding` — no chunk embedding index | HIGH | Plan HNSW index on chunk embedding column |

---

## 7. Recommended Chunking Strategy

### 7.1 Algorithm

Use **paragraph-aware sliding window** chunking:

1. Split `content_text` into paragraphs (double newline `\n\n` boundary).
2. Group paragraphs into chunks of approximately **1 000 tokens** (estimated as ≈ 4 000 characters).
3. Carry forward a **200-character overlap** from the end of the previous chunk into the start of the next chunk to preserve context across boundaries.
4. Never split mid-sentence within a paragraph where avoidable.
5. Store `chunk_index` (0-based, sequential).
6. Compute `chunk_hash` as sha256 of the `chunk_text`.
7. Store `content_hash` copied from `dms_document_content.content_text_sha256` at chunk creation time (allows future invalidation without re-reading the full text).

### 7.2 Rationale

- `text-embedding-3-small` maximum input: 8 191 tokens. Our chunks (~1 000 tokens) are far within the limit — no risk of truncation.
- Paragraph boundaries respect document structure better than fixed byte splits.
- 200-char overlap ensures context is not lost at chunk boundaries (critical for answers that reference concepts spanning paragraphs).

### 7.3 Exact first-implementation values

| Parameter | Value | Reason |
|-----------|-------|--------|
| Target chunk character count | 4 000 chars | ≈ 1 000 tokens — well within 8 191 token limit |
| Maximum chunk character count | 6 000 chars | Safety cap for very long paragraphs |
| Overlap | 200 chars | Context preservation |
| Minimum chunk size (skip below) | 100 chars | Avoid embedding noise/whitespace chunks |
| Maximum chunks per document | 200 | Cost guard — 200 × ~1k tokens = ~200k tokens per doc max |
| Short document threshold | 200 chars | Produce one chunk with full text |

### 7.4 Page and language metadata

- `page_start` / `page_end`: store as `null` in Phase 11 (not available from `content_text`). Future Phase may derive from OCR page markers.
- `language`: store as `null` in Phase 11. Future Phase may use language detection.
- `token_estimate`: store as `ROUND(char_count / 4)` (estimate — no tokenizer in server).

---

## 8. Chunk Table / Schema Plan

### 8.1 New table: `dms_document_content_chunks`

```sql
CREATE TABLE public.dms_document_content_chunks (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id         BIGINT NOT NULL
                        REFERENCES public.dms_documents(id) ON DELETE CASCADE,
  content_id          BIGINT NULL
                        REFERENCES public.dms_document_content(id) ON DELETE SET NULL,
  chunk_index         INTEGER NOT NULL,
  chunk_text          TEXT NOT NULL,
  chunk_hash          TEXT NOT NULL,
  content_hash        TEXT NOT NULL,
  source_kind         TEXT NOT NULL DEFAULT 'document_content'
                        CHECK (source_kind IN ('document_content','truncated_content','short_document')),
  language            TEXT NULL,
  page_start          INTEGER NULL,
  page_end            INTEGER NULL,
  token_estimate      INTEGER NULL,
  char_count          INTEGER NOT NULL,
  embedding_status    TEXT NOT NULL DEFAULT 'pending'
                        CHECK (embedding_status IN ('pending','complete','failed','skipped','not_required')),
  embedding_provider  TEXT NULL,
  embedding_model     TEXT NULL,
  embedding           vector(1536) NULL,
  embedded_at         TIMESTAMPTZ NULL,
  embedding_error_code    TEXT NULL,
  embedding_error_message TEXT NULL,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          BIGINT NULL,
  updated_by          BIGINT NULL,
  deleted_at          TIMESTAMPTZ NULL
);
```

### 8.2 Unique constraint

```sql
-- One active chunk per (document_id, chunk_index, content_hash)
CREATE UNIQUE INDEX IF NOT EXISTS uidx_dms_chunks_doc_idx_hash
  ON public.dms_document_content_chunks (document_id, chunk_index, content_hash)
  WHERE is_active = true AND deleted_at IS NULL;
```

### 8.3 Rules

- BIGINT only. No UUIDs.
- `chunk_text` is stored in the DB (needed for Q&A grounding and search snippets).
- `embedding` column is `vector(1536)` matching confirmed provider dimension.
- `is_active = false` is used for soft-invalidated chunks (when content changes).
- `deleted_at` for soft-delete (future admin cleanup).
- `content_hash` is copied from `dms_document_content.content_text_sha256` at chunk creation time — this is the key for invalidation detection.

### 8.4 Why store `chunk_text`?

- Required for Q&A grounding (must pass relevant chunk text to AI prompt).
- Required for search snippet display.
- RLS-protected — only users with `dms.documents.view` can read.
- Chunks do NOT appear in queue payloads (IDs only).

---

## 9. Embedding Provider Review

### 9.1 Current configuration

| Config code | Provider type | Model | Status |
|-------------|---------------|-------|--------|
| `DEFAULT_EMBEDDING` | `openai` | `text-embedding-3-small` | Active — confirmed in migration |
| `DEFAULT_CHAT` | `openai` | chat model | Fallback when `DEFAULT_EMBEDDING` unavailable |

`getDmsEmbeddingProvider()` in `src/lib/dms/ai/factory.ts`:
- Prioritizes `DEFAULT_EMBEDDING`.
- Falls back to `DEFAULT_CHAT` credentials but forces `text-embedding-3-small` model.
- Returns noop if neither is configured.

### 9.2 Embedding dimension verification

- Migration `20260615100000` creates `summary_embedding vector(1536)`.
- Adapter default: `EMBEDDING_MODEL_DEFAULT = "text-embedding-3-small"`.
- OpenAI `text-embedding-3-small` output dimension: **1536**.
- Phase 11 must use **`vector(1536)`** for chunk embeddings.

### 9.3 Azure OpenAI embedding support

- `OpenAiDmsAdapter.embedText()` supports Azure endpoints: `baseUrl = this.config.apiEndpoint?.replace(/\/$/, "") ?? "https://api.openai.com/v1"`.
- If `DEFAULT_EMBEDDING` points to an Azure OpenAI endpoint, embedding still works.
- No separate Azure Embedding config exists today — not needed.

### 9.4 Provider disabled behavior

- `provider.isConfigured()` returns false if `secretRef` env var is missing or if the config is inactive/disabled.
- When not configured, chunks should be created with `embedding_status = 'pending'` and embeddings deferred until provider is available.
- **No embedding generation must block chunk creation.** Chunking and embedding are separate steps.

### 9.5 Model dimension validation

- Before creating the `vector(1536)` chunk column, the implementation must verify via `getDmsEmbeddingProvider()` that the returned `modelId` is indeed a 1536-dimension model.
- If the provider returns a different dimension (e.g., a custom Azure model), the migration must be adjusted. For Phase 11, 1536 is assumed confirmed.

---

## 10. Embedding Generation Flow

### 10.1 Proposed two-step flow

```
Step A — CHUNK BUILDER
  Input:  document_id
  Source: dms_document_content.content_text
  Output: N rows in dms_document_content_chunks (embedding_status = pending)
  Logic:
    1. Load content_text + content_text_sha256
    2. If content_text_sha256 unchanged since last chunk batch → skip (idempotent)
    3. Soft-invalidate all current active chunks for this document (is_active = false)
    4. Build new chunks using sliding-window paragraph algorithm
    5. Insert new chunks with embedding_status = 'pending'
    6. No embedding calls made here

Step B — CHUNK EMBEDDER
  Input:  document_id (or chunk_id batch)
  Source: dms_document_content_chunks WHERE embedding_status = 'pending' AND is_active = true
  Output: chunk.embedding vector filled; embedding_status = 'complete'
  Logic:
    1. Load pending chunks for document
    2. For each chunk (or batch of chunks):
       a. Call getDmsEmbeddingProvider().provider.embedText(chunk.chunk_text)
       b. Write embedding vector to chunk row
       c. Mark embedding_status = 'complete'
    3. Respect max-chunks-per-run limit
    4. On provider error: mark embedding_status = 'failed' with error code
```

### 10.2 Recommended: combine into one job

For Phase 11, combine both steps into a single `semantic_document_index` job handler:

1. Job payload: `{ documentId, source, forceRebuild? }`
2. Handler: load content → build chunks → embed each chunk → write results.
3. Within one job, call embedding provider up to `max_chunks_per_run` times (e.g., 50 chunks per job invocation).
4. If a document has > 50 chunks, the handler completes as much as possible; remaining chunks stay `pending`. A follow-up job can be enqueued (or the worker can loop).

Rationale: Fewer job rows, simpler failure tracking. If splitting becomes necessary (for very long documents), Phase 12 can split into separate chunk and embed jobs.

### 10.3 Do NOT generate embeddings inline inside user requests

- No embedding calls inside `approveAiIntakeAndCreateDocument`.
- No embedding calls inside document save server actions.
- Post-approve orchestration already queues a `post_approve_orchestration` job; the semantic index job can be enqueued at the same time or as a downstream step.

---

## 11. Queue Integration Plan

### 11.1 New job type: `semantic_document_index`

Add to `DMS_AI_JOB_TYPE`:

```typescript
SEMANTIC_DOCUMENT_INDEX: "semantic_document_index",
```

### 11.2 Payload schema

```typescript
const SemanticDocumentIndexPayloadSchema = z.object({
  documentId:   z.number().int().positive(),
  source:       z.enum([
    "post_approve_orchestration",
    "admin_backfill",
    "manual_rebuild",
    "content_sync_trigger",
  ]),
  forceRebuild: z.boolean().optional().default(false),
});
```

**NEVER include:** `content_text`, `chunk_text`, `ocr_text`, or any prompt/response text in the payload.

### 11.3 Job defaults

```typescript
JOB_TYPE_MAX_ATTEMPTS: {
  ...existing,
  semantic_document_index: 3,
}
```

Priority: lower than `post_approve_orchestration` (which is priority 10) and `ocr_backfill` (priority 5). Recommend **priority = 3** for semantic index jobs.

### 11.4 Idempotency key

```
semantic_document_index:doc:{documentId}
```

One active semantic index job per document. If content changes and a rebuild is needed while a job is already queued, use `forceRebuild: true` to cancel the existing queued job and enqueue a new one, OR simply let the queued job detect the content_hash change at execution time.

### 11.5 Existing `EMBEDDING` job type

`DMS_AI_JOB_TYPE.EMBEDDING = "embedding"` currently has no handler. Two options:

**Option A (recommended):** Keep `EMBEDDING` as the existing document-level summary embedding job. Register a handler for it separately. `semantic_document_index` handles chunk-level indexing.

**Option B:** Deprecate/merge `EMBEDDING` into `semantic_document_index`. The chunk-level embedding subsumes the document-level one.

**Recommendation:** Option A. Keep both, because the document-level summary embedding (for `find_similar_documents` RPC) is independent of chunk-level indexing. Document-level embedding is fast (one call per doc). Chunk-level indexing is slower (N calls per doc). They serve different purposes.

### 11.6 Option comparison: combined vs separate chunk/embed jobs

| Approach | Pros | Cons |
|----------|------|------|
| **Combined `semantic_document_index` (recommended)** | Simpler, fewer job rows, one retry boundary | Longer job duration for long docs; handler must respect per-run limits |
| Separate `semantic_chunk_document` + `embed_document_chunks` | Finer retry granularity | Two jobs per document, more complexity in job registry |

**Phase 11 recommendation:** Combined. Phase 12 can split if needed.

---

## 12. Content Change and Invalidation Plan

### 12.1 Change detection

`dms_document_content.content_text_sha256` is already computed and stored. This is the invalidation key.

### 12.2 Invalidation algorithm

On `semantic_document_index` handler execution:

```
1. Load dms_document_content WHERE document_id = ?
2. Compute content_hash from content_text_sha256

3. Query existing active chunks:
   SELECT DISTINCT content_hash FROM dms_document_content_chunks
   WHERE document_id = ? AND is_active = true
   LIMIT 1

4. If existing content_hash == current content_text_sha256 AND forceRebuild != true:
   → Return early: content unchanged, no rebuild needed

5. If content changed (or forceRebuild):
   a. Soft-invalidate all active chunks:
      UPDATE dms_document_content_chunks
      SET is_active = false, updated_at = now()
      WHERE document_id = ? AND is_active = true
   
   b. Build new chunks from current content_text
   
   c. Insert new chunks with is_active = true, embedding_status = 'pending'
   
   d. Embed new chunks
```

### 12.3 Triggers for re-indexing

| Event | Trigger mechanism | Notes |
|-------|------------------|-------|
| OCR re-run changes `ocr_text` | `writeDocumentContentTextSystem` updates `content_text_sha256` → enqueue `semantic_document_index` | Via `DMS_CONTENT_TEXT_SYNC` pipeline |
| Manual content backfill | Server action must enqueue `semantic_document_index` | Not automatic today — needs wiring |
| Document file version change | Via OCR re-run path | Indirect |
| Metadata changes | **No re-index** — metadata is not chunked | Correct: chunks are text only |
| Admin manual rebuild | Admin UI → enqueue with `forceRebuild: true` | Phase 11 admin tools |
| Post-approval orchestration | Enqueue `semantic_document_index` after `post_approve_orchestration` completes | New pipeline step in Phase 11 |

### 12.4 Duplicate chunk prevention

- Unique index `uidx_dms_chunks_doc_idx_hash (document_id, chunk_index, content_hash) WHERE is_active = true` prevents duplicate active chunks.
- Soft-invalidating old chunks before inserting new ones prevents conflicts.
- `ON CONFLICT DO NOTHING` can be used as a safety net in the upsert.

---

## 13. RLS and Confidentiality Plan

### 13.1 RLS policies for `dms_document_content_chunks`

```sql
-- SELECT: user must be able to view the parent document
CREATE POLICY dms_chunks_select
  ON public.dms_document_content_chunks
  FOR SELECT TO public
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.dms_documents d
      WHERE d.id = document_id
        AND d.deleted_at IS NULL
        AND current_user_has_permission('dms.documents.view')
    )
  );

-- ALL (INSERT/UPDATE/DELETE): dms.documents.edit or system_admin
CREATE POLICY dms_chunks_manage
  ON public.dms_document_content_chunks
  FOR ALL TO public
  USING (
    current_user_has_permission('dms.documents.edit')
    OR current_user_has_role('system_admin')
  )
  WITH CHECK (
    current_user_has_permission('dms.documents.edit')
    OR current_user_has_role('system_admin')
  );
```

Enable RLS + Force RLS on the table.

### 13.2 Confidentiality gate

Chunk RLS inherits from the parent document via the `EXISTS` subquery. The `dms_documents` table already has confidentiality-level RLS policies. However, the chunk SELECT policy uses `dms.documents.view` which grants access to non-confidential documents. For hr/legal/executive documents:

- Either: join to `dms_documents` and check `confidentiality_level NOT IN (...)` OR `current_user_has_permission('dms.admin')`.
- Or: rely on the parent document's RLS to protect document rows, which cascades to chunk access.

**Recommended approach:** Make the chunk SELECT policy require `dms.admin` for chunks whose parent document has `confidentiality_level IN ('hr','legal','executive')`:

```sql
-- Enhanced confidentiality check in SELECT policy
USING (
  auth.uid() IS NOT NULL
  AND current_user_has_permission('dms.documents.view')
  AND EXISTS (
    SELECT 1 FROM public.dms_documents d
    WHERE d.id = document_id
      AND d.deleted_at IS NULL
      AND (
        d.confidentiality_level NOT IN ('hr','legal','executive')
        OR current_user_has_permission('dms.admin')
        OR current_user_has_role('system_admin')
      )
  )
);
```

### 13.3 Admin/worker access

- Worker operations use `createAdminClient()` (service role) — bypasses RLS entirely.
- All chunk creation, invalidation, and embedding writes in the job handler use `createAdminClient()`.
- Never expose `createAdminClient()` to user-facing server actions.

### 13.4 Chunk text exposure in UI

- **Semantic search results:** Return only a short snippet (e.g., 200 chars from the most relevant chunk). Do not return the full chunk text in search results.
- **Document Q&A:** Pass relevant chunk text to AI internally. Return only the AI's answer + citation metadata (chunk_index, page_start/end if available). Do not return raw chunk text in the response.
- **Admin debug view:** Admin may see chunk count, embedding status, last indexed at, and provider/model. No raw chunk text in the admin UI.
- **No chunk browser** for normal users.

### 13.5 Queue payload confidentiality

- Queue payloads contain **only IDs** (`documentId`, `source`, `forceRebuild`).
- No `chunk_text`, `content_text`, `ocr_text`, or AI response text in any queue payload or attempt log.
- Error messages stored in `dms_ai_job_queue.last_error_message` must be sanitized (no document content).

---

## 14. Semantic Search Plan

### 14.1 Current state

Searches `dms_documents.summary_embedding` (one vector per document). Returns document-level results with no snippet.

### 14.2 Phase 11 improved search

#### Step 1 — Query embedding

Embed the user's query text using `getDmsEmbeddingProvider()`. (Same as current.)

#### Step 2 — Chunk similarity search

New RPC `search_dms_document_chunks_by_embedding`:

```sql
CREATE OR REPLACE FUNCTION public.search_dms_document_chunks_by_embedding(
  p_query_embedding vector(1536),
  p_match_count     integer  DEFAULT 50,
  p_match_threshold double precision DEFAULT 0.2,
  p_is_admin        boolean  DEFAULT false,
  p_document_type_id bigint  DEFAULT NULL,
  p_entity_type     text     DEFAULT NULL,
  p_entity_id       bigint   DEFAULT NULL
)
RETURNS TABLE (
  chunk_id         bigint,
  document_id      bigint,
  document_no      text,
  title            text,
  chunk_index      integer,
  snippet          text,     -- first 250 chars of chunk_text
  similarity       double precision,
  confidentiality_level text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    c.id,
    d.id,
    d.document_no,
    d.title,
    c.chunk_index,
    left(c.chunk_text, 250),
    1 - (c.embedding <=> p_query_embedding),
    d.confidentiality_level
  FROM public.dms_document_content_chunks c
  JOIN public.dms_documents d ON d.id = c.document_id
  WHERE c.is_active = true
    AND c.deleted_at IS NULL
    AND c.embedding_status = 'complete'
    AND c.embedding IS NOT NULL
    AND d.deleted_at IS NULL
    AND (p_is_admin = true
         OR d.confidentiality_level NOT IN ('hr','legal','executive'))
    AND (p_document_type_id IS NULL OR d.document_type_id = p_document_type_id)
    AND (1 - (c.embedding <=> p_query_embedding)) >= p_match_threshold
  ORDER BY c.embedding <=> p_query_embedding
  LIMIT GREATEST(1, LEAST(p_match_count, 100))
$$;
```

#### Step 3 — Deduplicate by document

After fetching top-N chunk results, group by `document_id`. For each document, keep the highest-similarity chunk and its snippet. Return up to 25 documents.

#### Step 4 — Result shape

```typescript
interface DmsChunkSearchResult {
  documentId:      number;
  documentNo:      string;
  title:           string;
  topChunkIndex:   number;
  snippet:         string;     // 250-char snippet from best matching chunk
  similarity:      number;
  matchReason:     string;     // e.g. "92% match in chunk 3"
  riskLevel:       string | null;
  expiryDate:      string | null;
}
```

#### Step 5 — Fallback

If chunk search returns 0 results (no chunks indexed yet), fall back to existing document-level `search_dms_documents_by_embedding` RPC. This ensures backward compatibility during the rollout period.

#### Step 6 — Filters

Phase 11 should support basic filters:
- `document_type_id` filter (from dropdown)
- Minimal date range (optional)
- Confidentiality category (admin-only toggle)

Full filter expansion (entity, tags) can come in Phase 13.

---

## 15. Ask AI Grounding Plan

### 15.1 Current state

`askDmsDocumentQuestion` (in `document-qa.ts`) loads `content_text` (first 8 000 chars) + `ai_summary` (first 1 000 chars) and passes them directly to the LLM. This is a basic retrieval approach that works for short documents but degrades for documents > 8 000 chars.

### 15.2 Phase 11 chunk-grounded Q&A plan

#### Step 1 — Check if chunks are indexed

```
IF document has active chunks with embedding_status = 'complete':
  → Use chunk-based retrieval (Phase 11 path)
ELSE:
  → Fall back to existing raw-text path (Phase 12.4 path)
```

#### Step 2 — Embed the question

Use `getDmsEmbeddingProvider().provider.embedText(question)` to get the query embedding.

#### Step 3 — Retrieve top-K relevant chunks

Query `dms_document_content_chunks` for this specific `document_id`:

```sql
SELECT chunk_index, chunk_text, 1 - (embedding <=> ?) as similarity
FROM dms_document_content_chunks
WHERE document_id = ?
  AND is_active = true
  AND embedding_status = 'complete'
  AND embedding IS NOT NULL
ORDER BY embedding <=> ?
LIMIT 5
```

Note: for single-document Q&A, the SECURITY INVOKER policy on the chunk table (enforced via `createClient()`) ensures RLS is respected. The user can only reach this if they have `dms.documents.view`.

#### Step 4 — Build grounded prompt

Pass the top-5 retrieved chunks (not the full text) as context to the AI:

```
Context [chunk 3 of 12]:
<chunk_text snippet — first 2000 chars>

Context [chunk 7 of 12]:
<chunk_text snippet>
...
```

Total context: up to 5 chunks × 2 000 chars = 10 000 chars. Better coverage than the current 8k single-text approach.

#### Step 5 — Return answer + citations

Return:
- AI answer text
- `citations: [{ chunkIndex, snippet }]` — first 150 chars of each cited chunk

Do NOT return full chunk text in the API response.

#### Step 6 — If no chunks

If chunk-grounded path fails (no chunks, provider down, etc.):
- Fall back to existing raw-text path.
- Log a warning (not an error).

### 15.3 Guard against no-evidence hallucination

If retrieved chunks have similarity < 0.3 (low relevance), do not send them as context. Instead, tell the AI "No indexed relevant content was found for this question." and let the AI state that clearly in its response.

---

## 16. Admin Backfill / Rebuild Plan

### 16.1 Functions needed

| Function | Mode | Description |
|----------|------|-------------|
| `adminSemanticIndexBackfill` | `dry_run` | Count eligible docs, estimate chunk count |
| `adminSemanticIndexBackfill` | `enqueue` | Enqueue `semantic_document_index` jobs for eligible docs |
| `adminSemanticIndexBackfill` | `rebuild_all` | Enqueue with `forceRebuild: true` for all docs |
| `getSemanticIndexQueueSummary` | — | Count of `semantic_document_index` jobs by status |
| `adminRebuildOneDocument` | — | Enqueue one doc for rebuild (from document record form) |

### 16.2 Eligibility criteria for backfill

A document is eligible for semantic indexing if:
- Has `dms_document_content.content_text` that is non-null and non-empty.
- Either has no active chunks, OR has active chunks with `embedding_status != 'complete'`, OR has active chunks whose `content_hash != current content_text_sha256` (stale).

### 16.3 Feature flag gate

```
adminSemanticIndexBackfill must check:
  DMS_SEMANTIC_CHUNKING = true         → chunk creation enabled
  DMS_SEMANTIC_EMBEDDINGS = true       → embedding generation enabled
  DMS_SEMANTIC_INDEX_QUEUE = true      → queue-backed processing enabled
  DMS_AI_JOB_QUEUE = true              → master queue gate
```

### 16.4 Resume support

Support `resumeFromDocumentId` parameter (same pattern as OCR backfill and embedding backfill).

---

## 17. Feature Flag Plan

### 17.1 Missing flag to create

`DMS_EMBEDDING` is referenced in `system-pipeline.ts` but has no migration. This must be added.

### 17.2 New Phase 11 flags

| Flag | Default | Purpose |
|------|---------|---------|
| `DMS_EMBEDDING` | `false` | Gates document-level summary embedding in orchestration pipeline. **Must be added — exists in code but not in DB** |
| `DMS_SEMANTIC_CHUNKING` | `false` | Gates chunk creation (Step A of indexing) |
| `DMS_SEMANTIC_EMBEDDINGS` | `false` | Gates chunk embedding generation (Step B) |
| `DMS_SEMANTIC_INDEX_QUEUE` | `false` | Gates queue-based semantic index backfill |
| `DMS_SEMANTIC_SEARCH_CHUNKS` | `false` | Gates use of chunk-level search RPC (when false, falls back to document-level search) |

**Do NOT change `DMS_SEMANTIC_SEARCH`** — it is already `true` and controls the existing document-level semantic search feature. Renaming or disabling it would break current search behavior.

### 17.3 Rollout sequence

```
1. Deploy code → all new flags = false → zero behavior change
2. Enable DMS_EMBEDDING → document-level embedding runs in post-approve pipeline
3. Enable DMS_SEMANTIC_CHUNKING → chunks created on indexing jobs
4. Enable DMS_SEMANTIC_EMBEDDINGS → chunks embedded when created
5. Enable DMS_SEMANTIC_INDEX_QUEUE → admin can enqueue backfill
6. Run admin backfill → index existing documents
7. Enable DMS_SEMANTIC_SEARCH_CHUNKS → search uses chunk-level RPC
8. Monitor and verify
```

### 17.4 Migration for feature flags

Single migration (e.g., `20260625100000_erp_dms_ai_phase11_semantic_chunking_flags.sql`):

```sql
INSERT INTO public.erp_ai_feature_flags
  (feature_code, feature_name, description, is_enabled, requires_human_review, min_confidence_threshold)
VALUES
  ('DMS_EMBEDDING', 'DMS Document-Level Embedding',
   'Enables document-level summary embedding in post-approve orchestration pipeline.',
   false, false, 0.000),

  ('DMS_SEMANTIC_CHUNKING', 'DMS Semantic Chunking',
   'Enables splitting document content_text into overlapping text chunks for semantic indexing.',
   false, false, 0.000),

  ('DMS_SEMANTIC_EMBEDDINGS', 'DMS Chunk Embeddings',
   'Enables embedding generation for document content chunks. Requires DMS_SEMANTIC_CHUNKING.',
   false, false, 0.000),

  ('DMS_SEMANTIC_INDEX_QUEUE', 'DMS Semantic Index Queue',
   'Enables queue-backed semantic indexing and backfill. Requires DMS_AI_JOB_QUEUE.',
   false, false, 0.000),

  ('DMS_SEMANTIC_SEARCH_CHUNKS', 'DMS Chunk-Level Semantic Search',
   'When enabled, semantic search uses chunk-level vectors. Falls back to document-level when disabled.',
   false, false, 0.000)

ON CONFLICT (feature_code) DO UPDATE SET
  feature_name = EXCLUDED.feature_name,
  description = EXCLUDED.description;
```

---

## 18. Cost Control Plan

### 18.1 Per-document limits

| Limit | Value | Enforced by |
|-------|-------|-------------|
| Max chunks per document | 200 | Chunk builder truncates at 200 chunks |
| Max content chars per indexing run | 100 000 (already capped by `dms_document_content`) | `content_text` cap |
| Max batch size for admin backfill | 20 docs / enqueue call (default) | Server action param |
| Max batch size (admin override) | 100 docs | Server action param cap |

### 18.2 Per-run embedding limits

The `semantic_document_index` job handler should embed a maximum of **50 chunks per job run**. If a document has >50 chunks, the first 50 are embedded per run and the job can be re-queued for the remainder (or a follow-up admin run completes it).

### 18.3 Skip unchanged content

The content_hash check (`content_text_sha256` comparison) ensures documents with unchanged content are **not re-embedded**. This is the primary cost control.

### 18.4 Provider disabled safety

If `getDmsEmbeddingProvider()` returns a noop provider (not configured), the handler:
- Creates/invalidates chunks (no cost).
- Sets `embedding_status = 'pending'` (not `failed`).
- Logs a warning.
- Does NOT count this as a job failure.

### 18.5 Queue priority

`semantic_document_index` priority = 3 (lower than OCR backfill = 5, orchestration = 10). This ensures OCR and approval workflows are not starved by bulk indexing.

### 18.6 No token/cost dashboard in Phase 11

Full observability is Phase 14. Phase 11 only writes to `erp_ai_usage_logs` (already existing table) per embedding call with:
- `feature_area = 'DMS_SEMANTIC_CHUNKING'`
- `operation_type = 'chunk_embed'`
- `input_token_count` from provider response
- `metadata_json: { document_id, chunk_index, chunk_id }`

---

## 19. Database Index and Performance Plan

### 19.1 Indexes for `dms_document_content_chunks`

```sql
-- Primary document lookup
CREATE INDEX IF NOT EXISTS idx_dms_chunks_document_id
  ON public.dms_document_content_chunks (document_id)
  WHERE is_active = true AND deleted_at IS NULL;

-- Content hash lookup (for invalidation detection)
CREATE INDEX IF NOT EXISTS idx_dms_chunks_content_hash
  ON public.dms_document_content_chunks (document_id, content_hash)
  WHERE is_active = true;

-- Chunk hash lookup (for deduplication)
CREATE INDEX IF NOT EXISTS idx_dms_chunks_chunk_hash
  ON public.dms_document_content_chunks (chunk_hash)
  WHERE is_active = true AND deleted_at IS NULL;

-- Embedding status (for backfill / queue processing)
CREATE INDEX IF NOT EXISTS idx_dms_chunks_embedding_status
  ON public.dms_document_content_chunks (document_id, embedding_status)
  WHERE is_active = true AND deleted_at IS NULL;

-- HNSW cosine vector index (for semantic search)
CREATE INDEX IF NOT EXISTS idx_dms_chunks_embedding_hnsw
  ON public.dms_document_content_chunks
  USING hnsw (embedding vector_cosine_ops)
  WHERE is_active = true AND embedding IS NOT NULL AND embedding_status = 'complete';
```

### 19.2 HNSW vs IVFFlat

- pgvector v0.8.0 (confirmed by migration comment) supports HNSW.
- HNSW requires no training (no `ivfflat.lists` parameter needed).
- HNSW is recommended for Supabase-hosted instances.
- Use `vector_cosine_ops` (consistent with existing `summary_embedding` index).
- HNSW parameters: use defaults (`m = 16`, `ef_construction = 64`) for Phase 11. Tune in Phase 15.

### 19.3 Partial HNSW index

The partial HNSW index (`WHERE is_active = true AND embedding IS NOT NULL AND embedding_status = 'complete'`) is critical:
- Prevents indexing null vectors (which cause errors).
- Prevents indexing inactive/deleted chunks.
- Reduces index size and build time significantly.

### 19.4 Existing HNSW index on `dms_documents.summary_embedding`

- `idx_dms_documents_summary_embedding` — already in place from Phase 12.5.
- Must NOT be dropped or modified in Phase 11.

---

## 20. UI / UX Plan

### 20.1 Document Semantic Section (`dms-document-semantic-section.tsx`)

**Current:** Shows document-level embedding status (complete/pending/failed), model, source, generate/regenerate buttons, "find similar" button, similar document results.

**Phase 11 additions (minimal):**

| Addition | Description |
|----------|-------------|
| Chunk count badge | Shows `N chunks indexed` or `Not indexed` |
| Chunk embedding status | Progress: `X of N chunks embedded` |
| Last indexed at | Timestamp of last successful `semantic_document_index` job |
| Provider/model line | e.g., `text-embedding-3-small via DEFAULT_EMBEDDING` |
| Rebuild Index button | Admin-only. Enqueues `semantic_document_index` with `forceRebuild: true` |

No major redesign. Append to the existing section layout.

### 20.2 Admin Intelligence Page (`dms-intelligence-admin-page-client.tsx`)

**Current:** Has "Embedding Backfill" card using `bulkGenerateMissingDmsEmbeddings` (inline, synchronous).

**Phase 11 additions:**

Add a new **Semantic Index Backfill** card:

| Control | Description |
|---------|-------------|
| Mode selector | `dry_run` / `enqueue` / `rebuild_all` |
| Batch size input | Default 10, max 100 |
| Resume from document ID | Optional |
| Run button | Calls `adminSemanticIndexBackfill` |
| Result panel | Shows eligible, queued, skipped, failed |
| Queue summary panel | Shows `semantic_document_index` jobs by status (same pattern as OCR backfill queue summary) |

**Warning banners for enqueue/rebuild_all modes:**
- `DMS_SEMANTIC_INDEX_QUEUE` must be enabled.
- `DMS_AI_JOB_QUEUE` must be enabled.
- `DMS_AI_JOB_QUEUE_WORKER_ENABLED` must be enabled and worker must be running.

### 20.3 No other UI changes in Phase 11

- Do NOT redesign the semantic search page.
- Do NOT redesign the Ask AI section (only backend grounding changes).
- Do NOT add a chunk browser.
- Do NOT add a cost dashboard.

---

## 21. Recommended Phase 11 Implementation Scope

The following is the **minimum viable scope** for Phase 11:

| # | Item | Priority |
|---|------|----------|
| 1 | Migration: `dms_document_content_chunks` table + indexes + RLS + HNSW | CRITICAL |
| 2 | Migration: Phase 11 feature flags (5 new flags incl. `DMS_EMBEDDING` fix) | CRITICAL |
| 3 | Migration: `search_dms_document_chunks_by_embedding` RPC | CRITICAL |
| 4 | `src/lib/dms/semantic/chunk-builder.ts` — sliding window paragraph chunker | CRITICAL |
| 5 | `src/lib/dms/semantic/chunk-embedder.ts` — embed pending chunks for a document | CRITICAL |
| 6 | `src/lib/dms/semantic/semantic-indexer.ts` — orchestrates chunk build + embed for a document | CRITICAL |
| 7 | Add `SEMANTIC_DOCUMENT_INDEX` job type + payload schema to `job-types.ts` | CRITICAL |
| 8 | `src/lib/dms/ai-jobs/handlers/semantic-document-index.handler.ts` | CRITICAL |
| 9 | Register handler in `job-registry.ts` | CRITICAL |
| 10 | Server action `adminSemanticIndexBackfill` + `getSemanticIndexQueueSummary` | HIGH |
| 11 | Update `dms-intelligence-admin-page-client.tsx` with Semantic Index Backfill card | HIGH |
| 12 | Update `semanticSearchDmsDocuments` to use chunk-level RPC (with fallback) | HIGH |
| 13 | Update `askDmsDocumentQuestion` to use chunk retrieval when chunks available | HIGH |
| 14 | Update `dms-document-semantic-section.tsx` with chunk count / rebuild button | MEDIUM |
| 15 | Register `EMBEDDING` job type handler (document-level summary embedding) | MEDIUM |
| 16 | Enqueue `semantic_document_index` from post-approve orchestration pipeline | MEDIUM |
| 17 | `tsc --noEmit` + lint checks | CRITICAL |
| 18 | Update SOT docs + create implementation report | CRITICAL |

**Deferred to Phase 12+:**

- Full cost dashboard / token accounting.
- Tag/link suggestions from chunk content.
- Review queue activation.
- Multi-language chunk splitting.
- Page-level chunk metadata (requires OCR page-break markers).

---

## 22. Implementation Sequence for Future Phase 11 Execution

```
Step 0  — Read all required files (fresh)
Step 1  — Create migration: dms_document_content_chunks table + RLS + indexes + HNSW index
Step 2  — Create migration: Phase 11 feature flags
Step 3  — Create migration: search_dms_document_chunks_by_embedding RPC
Step 4  — Create src/lib/dms/semantic/chunk-builder.ts
Step 5  — Create src/lib/dms/semantic/chunk-embedder.ts
Step 6  — Create src/lib/dms/semantic/semantic-indexer.ts
Step 7  — Update src/lib/dms/ai-jobs/job-types.ts (add SEMANTIC_DOCUMENT_INDEX)
Step 8  — Create src/lib/dms/ai-jobs/handlers/semantic-document-index.handler.ts
Step 9  — Update src/lib/dms/ai-jobs/job-registry.ts (register handler)
Step 10 — Update src/server/actions/dms/intelligence-admin.ts (semantic backfill actions)
Step 11 — Update src/features/dms/admin/dms-intelligence-admin-page-client.tsx
Step 12 — Update src/server/actions/dms/semantic-search.ts (chunk search path + fallback)
Step 13 — Update src/server/actions/dms/document-qa.ts (chunk-grounded Q&A)
Step 14 — Update src/features/dms/documents/sections/dms-document-semantic-section.tsx
Step 15 — Register EMBEDDING job type handler (src/lib/dms/ai-jobs/handlers/embedding.handler.ts)
Step 16 — Wire semantic_document_index enqueue into post-approve orchestration (system-pipeline.ts)
Step 17 — npx tsc --noEmit + ReadLints
Step 18 — Update SOT + create Phase 11 implementation report
```

---

## 23. Acceptance Criteria for Future Implementation

| ID | Criterion |
|----|-----------|
| AC-01 | Documents with `content_text` can be chunked deterministically — same content always produces same chunk set. |
| AC-02 | Chunking is idempotent: running `semantic_document_index` twice on unchanged content produces no new chunks. |
| AC-03 | Changed content (`content_text_sha256` differs) invalidates/rebuilds chunks safely — old chunks set `is_active = false`. |
| AC-04 | Embeddings are generated only when `DMS_SEMANTIC_EMBEDDINGS = true` and provider is configured. |
| AC-05 | Embedding vectors are stored in `dms_document_content_chunks.embedding vector(1536)`. |
| AC-06 | Queue payload for `semantic_document_index` contains only `documentId`, `source`, `forceRebuild` — no content text. |
| AC-07 | `semantic_document_index` jobs can be enqueued and processed by the Phase 9 worker. |
| AC-08 | Semantic search retrieves only active chunks (`is_active = true`, `embedding_status = 'complete'`) accessible to the user. |
| AC-09 | Chunks for hr/legal/executive documents are not returned to unauthorized users. |
| AC-10 | Document Q&A uses top-K chunk evidence when chunks are indexed; citations include chunk_index. |
| AC-11 | Admin can dry-run and enqueue semantic indexing / backfill from Admin Intelligence page. |
| AC-12 | Max 200 chunks per document enforced in chunk builder. |
| AC-13 | No raw provider response, prompt, OCR text, or chunk text stored in queue payloads or attempt error fields. |
| AC-14 | Manual OCR, OCR backfill, AI intake, classification, and approval workflows remain unchanged. |
| AC-15 | `tsc --noEmit` + lint pass. |
| AC-16 | `DMS_EMBEDDING` feature flag row exists in `erp_ai_feature_flags` after migration. |

---

## 24. Full Test Plan

### TC-01: Empty content → no chunks created

| Field | Value |
|-------|-------|
| Test name | Empty content skip |
| Purpose | Verify that a document with no `content_text` is not chunked |
| Setup | Document with no `dms_document_content` row, or `content_text = NULL` |
| Steps | Enqueue `semantic_document_index`; process job |
| Expected result | Job completes as success; no rows inserted in `dms_document_content_chunks` |
| DB state | No chunk rows for this document |
| UI state | Semantic section shows "Not indexed" |
| Risk covered | G-01, AC-02 |

---

### TC-02: Short content → single chunk

| Field | Value |
|-------|-------|
| Test name | Short document single chunk |
| Purpose | Documents < 200 chars produce exactly one chunk |
| Setup | Document with `content_text = "Short test document."` |
| Steps | Enqueue and process `semantic_document_index` |
| Expected result | 1 row in `dms_document_content_chunks` with `source_kind = 'short_document'`, `chunk_index = 0` |
| DB state | 1 chunk row, `is_active = true`, `char_count = 20` |
| UI state | Semantic section shows "1 chunk indexed" |
| Risk covered | AC-01 |

---

### TC-03: Long content → multiple chunks with overlap

| Field | Value |
|-------|-------|
| Test name | Long document multi-chunk with overlap |
| Purpose | Documents > 4 000 chars are split into multiple overlapping chunks |
| Setup | Document with `content_text` of 12 000 chars (3+ chunks expected) |
| Steps | Enqueue and process `semantic_document_index` |
| Expected result | ≥ 3 chunk rows; consecutive chunks share overlap text |
| DB state | All chunks `is_active = true`, sequential `chunk_index`, `content_hash` all equal |
| UI state | Semantic section shows "N chunks indexed" |
| Risk covered | AC-01, G-01 |

---

### TC-04: Unchanged content → no duplicate chunks

| Field | Value |
|-------|-------|
| Test name | Idempotent chunking |
| Purpose | Re-running `semantic_document_index` on same content produces no new chunks |
| Setup | Document already indexed (N chunks, `is_active = true`) |
| Steps | Enqueue and process `semantic_document_index` again (no content change) |
| Expected result | Handler returns early; same N chunks remain; no new rows |
| DB state | Unchanged; `updated_at` unchanged |
| UI state | No change |
| Risk covered | AC-02 |

---

### TC-05: Changed content → invalidates old chunks and creates new

| Field | Value |
|-------|-------|
| Test name | Content change invalidation |
| Purpose | Changed `content_text` triggers soft-invalidation of old chunks |
| Setup | Document with N chunks (`is_active = true`). Simulate OCR re-run (update `content_text` and `content_text_sha256`) |
| Steps | Enqueue and process `semantic_document_index` |
| Expected result | Old chunks set to `is_active = false`; M new chunks created with new `content_hash` |
| DB state | Old chunks: `is_active = false`. New chunks: `is_active = true`, different `content_hash` |
| UI state | Chunk count may differ from before |
| Risk covered | AC-03, G-07 |

---

### TC-06: Provider disabled → chunks created, embeddings deferred

| Field | Value |
|-------|-------|
| Test name | Provider disabled safe handling |
| Purpose | Chunk creation succeeds even when embedding provider is unavailable |
| Setup | `DMS_SEMANTIC_EMBEDDINGS = false` OR `DEFAULT_EMBEDDING` provider disabled |
| Steps | Enqueue and process `semantic_document_index` |
| Expected result | Chunks created with `embedding_status = 'pending'`; job completes successfully |
| DB state | Chunks exist, `embedding = NULL`, `embedding_status = 'pending'` |
| UI state | "N chunks, 0 embedded" |
| Risk covered | AC-04 |

---

### TC-07: Embedding generation writes vector

| Field | Value |
|-------|-------|
| Test name | Embedding vector stored |
| Purpose | Confirm chunk embedding is written to DB |
| Setup | Document with N chunks, provider configured, `DMS_SEMANTIC_EMBEDDINGS = true` |
| Steps | Enqueue and process `semantic_document_index` |
| Expected result | All chunks have `embedding IS NOT NULL`, `embedding_status = 'complete'`, `embedded_at IS NOT NULL` |
| DB state | `embedding` column contains 1536-dimension vector |
| UI state | "N/N chunks embedded" |
| Risk covered | AC-05 |

---

### TC-08: Queue payload IDs only

| Field | Value |
|-------|-------|
| Test name | Queue payload content safety |
| Purpose | Verify job payload never contains document content |
| Setup | Enqueue `semantic_document_index` for any document |
| Steps | Query `dms_ai_job_queue.payload_json` for the job |
| Expected result | Payload JSON contains only `documentId`, `source`, `forceRebuild` |
| DB state | `payload_json = {"documentId": 123, "source": "admin_backfill", "forceRebuild": false}` |
| Risk covered | AC-06, AC-13 |

---

### TC-09: Semantic search returns only active chunks

| Field | Value |
|-------|-------|
| Test name | Active chunk search only |
| Purpose | Inactive/stale chunks do not appear in search results |
| Setup | Document with both active and inactive (is_active = false) chunks |
| Steps | Run semantic search query likely to match this document |
| Expected result | Only active, complete-embedding chunks are returned |
| DB state | n/a |
| UI state | Search result shows current content snippet, not stale chunk |
| Risk covered | AC-08 |

---

### TC-10: Confidential document chunks hidden from unauthorized user

| Field | Value |
|-------|-------|
| Test name | Confidential chunk access denied |
| Purpose | Chunks for hr/legal/executive documents not accessible to normal users |
| Setup | Document with `confidentiality_level = 'hr'`, indexed with chunks |
| Steps | Normal user (no `dms.admin`) attempts semantic search matching HR doc |
| Expected result | HR document not returned in results |
| Steps (direct) | Normal user attempts to fetch chunks from `dms_document_content_chunks` WHERE document_id = HR doc |
| Expected result | RLS rejects — zero rows returned |
| Risk covered | AC-09, Section 13 |

---

### TC-11: Ask AI uses chunk evidence

| Field | Value |
|-------|-------|
| Test name | Chunk-grounded Q&A |
| Purpose | Q&A retrieves relevant chunks when available |
| Setup | Document with 10 indexed chunks; question about a topic in chunk 7 |
| Steps | Call `askDmsDocumentQuestion` |
| Expected result | Answer references content from chunk 7; citation includes `chunk_index: 6` (0-based) |
| DB state | n/a |
| UI state | Answer shown with citation |
| Risk covered | AC-10 |

---

### TC-12: No OCR/chunk text in job payload or error fields

| Field | Value |
|-------|-------|
| Test name | No sensitive text in job records |
| Purpose | Queue attempt logs do not contain document content |
| Setup | Process a `semantic_document_index` job that encounters an embedding error |
| Steps | Inspect `dms_ai_job_attempts.safe_error_message` and `dms_ai_job_queue.last_error_message` |
| Expected result | Only error codes and safe messages (e.g., "Provider unavailable", "Rate limit exceeded") — no document text |
| Risk covered | AC-13 |

---

### TC-13: Admin enqueue backfill works

| Field | Value |
|-------|-------|
| Test name | Admin semantic backfill enqueue |
| Purpose | Admin can enqueue semantic index jobs for eligible documents |
| Setup | Multiple documents with content_text but no chunks |
| Steps | Admin runs Semantic Index Backfill in `enqueue` mode (batch = 5) |
| Expected result | 5 `semantic_document_index` jobs created in `dms_ai_job_queue` |
| DB state | 5 job rows with `job_type = 'semantic_document_index'`, `job_status = 'queued'` |
| UI state | Queue summary shows "5 queued" |
| Risk covered | AC-11 |

---

### TC-14: RLS rejects anonymous access

| Field | Value |
|-------|-------|
| Test name | Anon access denied |
| Purpose | Unauthenticated requests cannot read chunk data |
| Setup | Supabase anon key (no auth) |
| Steps | Query `dms_document_content_chunks` via anon client |
| Expected result | 0 rows returned (RLS policy requires `auth.uid() IS NOT NULL`) |
| Risk covered | Section 13 |

---

### TC-15: Typecheck and build pass

| Field | Value |
|-------|-------|
| Test name | TypeScript and lint |
| Purpose | No type errors or lint violations introduced |
| Setup | All Phase 11 files created/modified |
| Steps | `npx tsc --noEmit`; ReadLints on modified files |
| Expected result | 0 errors |
| Risk covered | AC-15 |

---

## 25. Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| R-01: Embedding cost overrun during backfill | HIGH | MEDIUM | 200-chunk-per-document cap; default batch size 10; `DMS_SEMANTIC_INDEX_QUEUE` flag defaults false |
| R-02: HNSW index build time with many chunks | MEDIUM | LOW | `CREATE INDEX CONCURRENTLY` on chunk embedding column (do not block table) |
| R-03: `content_text_sha256` NULL for older documents | MEDIUM | MEDIUM | Handle NULL as "unknown" — treat as changed and rebuild chunks |
| R-04: `DMS_EMBEDDING` flag missing in DB breaks pipeline | HIGH | HIGH | Phase 11 migration adds it immediately; code falls back to `false` if missing |
| R-05: Chunk text exposure via RPC | HIGH | LOW | SECURITY INVOKER RPC; confidentiality check in WHERE clause; snippet capped at 250 chars |
| R-06: Very long documents exceed 200 chunks cap | LOW | LOW | Truncation logged; excess content not indexed in Phase 11 |
| R-07: Worker not running when backfill enqueued | MEDIUM | MEDIUM | Admin warned via banner; jobs stay `queued` and process when worker starts |
| R-08: Duplicate chunk rows on concurrent jobs | MEDIUM | LOW | Unique index + `ON CONFLICT DO NOTHING` prevents duplicates |
| R-09: Q&A grounding path degrades for very short/low-similarity results | LOW | MEDIUM | Similarity threshold (0.3); fallback to raw text path |
| R-10: Embedding dimension mismatch if provider model changes | HIGH | LOW | Validate `embedding.length === 1536` before writing to column; fail job if mismatch |

---

## 26. What Must Not Be Implemented in Phase 11

```
✗ Review queue activation (Phase 12)
✗ Validation / conflict detection (Phase 13)
✗ Owner matching implementation (Phase 13)
✗ Token/cost dashboard (Phase 14)
✗ Full observability dashboard (Phase 14)
✗ Apply-to-ERP writes (Phase 16)
✗ Auto-approval
✗ Auto-save metadata
✗ Deleting source documents or files
✗ Changing OCR routing rules
✗ Moving intake OCR / classification to queue
✗ Raw provider response storage (only safe metadata in usage logs)
✗ Raw prompt storage
✗ Storing chunk text in queue payload or attempt logs
✗ Major UI redesign
✗ Removing or replacing existing document-level summary_embedding behavior
✗ Dropping or renaming DMS_SEMANTIC_SEARCH flag (currently true, controls existing search)
✗ Full chunk text returned in search API results (snippets only)
```

---

## 27. Corrected Roadmap After Phase 11

```
Phase 9   — Async AI Job Queue / Workflow Runner              CLOSED
Phase 10A — OCR Pipeline Upgrade / Azure OCR Wiring            CLOSED
Phase 10B — Queue-backed Admin OCR Backfill                    CLOSED
Phase 11  — Semantic Chunking and Embeddings                   ← THIS PHASE
Phase 12  — Review Queue Activation                            FUTURE
Phase 13  — Validation, Conflict Detection, Owner Matching      FUTURE
Phase 14  — Token / Cost / Observability                       FUTURE
Phase 15  — Testing, Performance, Hardening                    FUTURE
Phase 16  — Human-Reviewed Apply-to-ERP Records                FUTURE / HIGH-RISK
```

After Phase 11:
- Semantic search operates at chunk level (with document-level fallback).
- Document Q&A is grounded in relevant chunks.
- Admin can index/backfill via queue.
- Document-level summary embedding (`summary_embedding`) is still maintained (additive, not replaced).

---

## 28. Recommended Next Cursor Implementation Prompt

When this plan is approved by ChatGPT, the implementation prompt for Cursor should:

1. Reference this plan file: `ERP_DMS_AI_PHASE_11_SEMANTIC_CHUNKING_AND_EMBEDDINGS_PLAN.md`.
2. Follow the 18-step implementation sequence in Section 22 exactly.
3. Apply the feature flags from Section 17 (all defaulting to `false`).
4. Confirm `vector(1536)` dimension against `getDmsEmbeddingProvider()` before creating the column.
5. Use `createAdminClient()` in all worker/handler code.
6. Use `createClient()` (user session) in all user-facing semantic search and Q&A server actions.
7. Never include chunk text or content text in queue payloads.
8. Verify `tsc --noEmit` passes before closing.
9. Run `ReadLints` on all modified files.
10. Create the implementation report at: `implementation_Review/ERP_DMS_AI_PHASE_11_SEMANTIC_CHUNKING_AND_EMBEDDINGS_IMPLEMENTATION_REPORT.md`
11. Update `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md` and `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`.

---

## 29. Final Recommendation

Phase 11 is a well-scoped, high-value upgrade that transforms the DMS AI semantic layer from document-granularity to chunk-granularity. The existing infrastructure (Phase 9 queue, Phase 10A/10B OCR pipeline, Phase 12.5 pgvector, Phase 12.1 content sync) provides a solid foundation.

**Key recommendations:**

1. **Fix the `DMS_EMBEDDING` flag gap first** — it is referenced in production code but has no migration. This is a hidden bug that must be resolved in Phase 11 Step 2.

2. **Use combined `semantic_document_index` job** (chunk + embed in one handler) for Phase 11 simplicity. Do not split into two job types yet.

3. **Keep `summary_embedding` on `dms_documents` intact.** The `find_similar_documents` feature and document-level search depend on it. Chunk-level search is additive.

4. **Default all Phase 11 flags to `false`.** This ensures zero behavior change on deployment. Enable flags one by one during rollout.

5. **200-chunk cap per document** is the primary cost guard. Do not raise it until Phase 14 token/cost observability is in place.

6. **Q&A grounding is high-value.** The current 8k raw-text approach is functionally limited for documents > 8 000 chars (all long contracts, policies, insurance certificates). Chunk-grounded Q&A directly addresses this with minimal code change.

7. **The HNSW partial index** (`WHERE is_active = true AND embedding IS NOT NULL`) is critical for performance — include it in the migration, do not skip it.

**Ready for ChatGPT review.** No source code, UI, migration, or schema changes have been made.
