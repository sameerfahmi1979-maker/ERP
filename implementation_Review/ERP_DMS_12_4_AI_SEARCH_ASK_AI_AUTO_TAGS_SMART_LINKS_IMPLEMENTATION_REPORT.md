# ERP DMS 12.4 — AI Search, Ask AI, Auto Tags, Smart Links
## Implementation Report

**Phase:** ERP DMS 12.4  
**Status:** CLOSED / PASS  
**Date Completed:** 2026-06-15  
**Implemented by:** Cursor AI  

---

## 1. Phase Objective

Implement intelligent document discovery and suggestion capabilities for the ALGT ERP DMS:

1. AI natural-language document search using intent extraction + SQL
2. Ask AI about one document (grounded to document content only)
3. Ask AI across DMS (returns matched documents, not hallucinated narrative)
4. AI tag suggestions with human approval workflow
5. AI smart ERP link suggestions (parties) with human approval workflow
6. Search mode selector UI in All Documents
7. Ask AI tab in Document Record
8. Pending suggestion panels in Tags and Links sections

---

## 2. Files Created

### Database Migration
- `supabase/migrations/20260615080000_erp_dms_12_4_suggestion_tables.sql`
  - Created `dms_ai_tag_suggestions` table with RLS
  - Created `dms_ai_link_suggestions` table with RLS
  - Both applied to live Supabase project

### Server Actions
- `src/server/actions/dms/ai-search.ts`
  - `extractDmsSearchIntent(question)` — AI intent extraction via `callStructuredCompletion`
  - `searchDmsDocumentsByIntent(intent)` — DB query from structured intent (no AI hallucination)
  - `askDmsDocumentsQuestion(question)` — Combined: extract intent → search DB → return results
- `src/server/actions/dms/document-qa.ts`
  - `askDmsDocumentQuestion(documentId, question)` — Q&A grounded to single document only
- `src/server/actions/dms/ai-tags.ts`
  - `suggestDmsDocumentTags(documentId)` — AI suggests tags, stores as pending
  - `getDmsTagSuggestions(documentId)` — Load pending/accepted/rejected suggestions
  - `applyDmsTagSuggestions(documentId, suggestionIds)` — Accept: writes to `dms_document_tags`
  - `rejectDmsTagSuggestions(documentId, suggestionIds)` — Reject: marks rejected, no tag write
- `src/server/actions/dms/ai-links.ts`
  - `suggestDmsDocumentLinks(documentId)` — AI suggests party links, stores as pending
  - `getDmsLinkSuggestions(documentId)` — Load pending/accepted/rejected link suggestions
  - `applyDmsLinkSuggestions(documentId, suggestionIds)` — Accept: writes to `dms_document_links`
  - `rejectDmsLinkSuggestions(documentId, suggestionIds)` — Reject: marks rejected, no link write

### UI Components
- `src/features/dms/documents/sections/dms-document-ask-ai-section.tsx`
  - Ask AI tab in document record (grounded Q&A, confidence badge, source badge, disclaimer)
  - Lock message for confidential documents if non-admin

---

## 3. Files Modified

### AI Provider
- `src/lib/dms/ai/types.ts`
  - Added `DmsStructuredCompletionOutput` interface
  - Added `DmsSearchIntent`, `DmsAiSearchResult`, `DmsDocumentQuestionAnswer`, `DmsTagSuggestion`, `DmsLinkSuggestion` types
  - Extended `IDmsAiProvider` with `callStructuredCompletion()` method
- `src/lib/dms/ai/openai-dms-adapter.ts`
  - Implemented `callStructuredCompletion()` using fetch-native, `json_object` response format, 30s timeout
- `src/lib/dms/ai/factory.ts`
  - Added `callStructuredCompletion()` no-op to `NoopDmsAiProvider`

### Query Keys
- `src/lib/query/query-keys.ts`
  - Added `dms.aiSearch(questionOrHash)`
  - Added `dms.documentQa(documentId)`
  - Added `dms.documentTagSuggestions(documentId)`
  - Added `dms.documentLinkSuggestions(documentId)`

### Documents Table
- `src/features/dms/documents/dms-documents-table.tsx`
  - Added search mode selector: Auto / Quick / Safe Search / Content Search / AI Search
  - Added AI search question input (shown when mode = AI Search)
  - Added AI search results panel (card-based, with match reason, risk badge, completeness score, expiry)
  - Added collapsible intent summary panel

### Tags Section
- `src/features/dms/documents/sections/dms-document-tags-section.tsx`
  - Added AI Tag Suggestions subsection (Suggest Tags button, pending suggestions list)
  - Accept/Reject buttons per suggestion
  - Confidence badge, reason, "New" badge for unresolved tag IDs

### Links Section
- `src/features/dms/documents/sections/dms-document-links-section.tsx`
  - Added AI Link Suggestions subsection (Suggest Links button, pending suggestions list)
  - Accept/Reject buttons per suggestion
  - Entity type badge, entity name, confidence, reason

### Document Record Form
- `src/features/dms/documents/dms-document-record-form.tsx`
  - Added "Ask AI" tab between Intelligence and AI Analysis
  - Imported `DmsDocumentAskAiSection`

---

## 4. Migration Created / Applied

**File:** `supabase/migrations/20260615080000_erp_dms_12_4_suggestion_tables.sql`  
**Applied:** Yes — applied to live Supabase project via MCP tool.

### `dms_ai_tag_suggestions`
- Stores AI-proposed tags before human approval
- Status: pending → accepted | rejected | superseded
- Unique index prevents duplicate pending suggestions for same document + tag
- RLS: SELECT requires `dms.documents.view`; write requires `dms.documents.edit` or `dms.admin`

### `dms_ai_link_suggestions`
- Stores AI-proposed entity links before human approval
- Status: pending → accepted | rejected | superseded
- RLS: SELECT requires `dms.documents.view`; write requires `dms.documents.edit` or `dms.admin`

---

## 5. Server Actions Summary

| Action | File | Feature Flag | Permission |
|---|---|---|---|
| `extractDmsSearchIntent` | ai-search.ts | DMS_AI_SEARCH | dms.documents.view |
| `searchDmsDocumentsByIntent` | ai-search.ts | — | dms.documents.view |
| `askDmsDocumentsQuestion` | ai-search.ts | DMS_CROSS_DOC_SEARCH | dms.documents.view |
| `askDmsDocumentQuestion` | document-qa.ts | DMS_DOCUMENT_QA | dms.documents.view (dms.admin if confidential) |
| `suggestDmsDocumentTags` | ai-tags.ts | DMS_AUTO_TAGS | dms.documents.edit |
| `getDmsTagSuggestions` | ai-tags.ts | — | dms.documents.view |
| `applyDmsTagSuggestions` | ai-tags.ts | — | dms.documents.edit |
| `rejectDmsTagSuggestions` | ai-tags.ts | — | dms.documents.edit |
| `suggestDmsDocumentLinks` | ai-links.ts | DMS_SMART_LINKS | dms.documents.edit |
| `getDmsLinkSuggestions` | ai-links.ts | — | dms.documents.view |
| `applyDmsLinkSuggestions` | ai-links.ts | — | dms.documents.edit |
| `rejectDmsLinkSuggestions` | ai-links.ts | — | dms.documents.edit |

---

## 6. AI Provider Changes

- Added `callStructuredCompletion(systemPrompt, userMessage, opts)` to `IDmsAiProvider`
- OpenAI adapter uses `response_format: { type: "json_object" }`, 30s timeout, configurable maxTokens
- No-op provider throws informative error
- All calls use fetch-native (no OpenAI SDK)
- API key resolved from `process.env[secretRef]` — never exposed to frontend

### Prompt Versions
- Intent extraction: `v1.0` — returns `DmsSearchIntent` JSON
- Document Q&A: `v1.0` — returns `{ answer, confidence, sourceUsed }`
- Tag suggestions: `v1.0` — returns `{ suggestions: DmsTagSuggestion[] }`
- Link suggestions: `v1.0` — returns `{ suggestions: DmsLinkSuggestion[] }`

---

## 7. UI Changes

### All Documents Page
- **Search Mode Selector**: Dropdown (Auto / Quick / Safe Search / Content Search / AI Search)
- When AI Search is selected: table is hidden, AI question input shown
- AI search results displayed as cards with: document number, title, risk badge, match reason, AI summary snippet, completeness score, expiry date
- Collapsible intent summary (keywords, type, expiry state, risk, outcome, party)

### Document Record — Ask AI Tab
- Between "Intelligence" and "AI Analysis" tabs
- Shows question textarea (500 char limit), Ask button
- Answer card with confidence badge (high/medium/low) and source badge
- Lock message for confidential documents if non-admin
- Disclaimer: "Answer is based only on extracted text, AI summary, and metadata for this document."

### Document Record — Tags Section
- "AI Tag Suggestions" subsection with "Suggest Tags" button
- Lists pending suggestions with tag name, reason, confidence %, "New" badge for unresolved
- Accept button (for suggestions with resolved `tag_id`), Reject button
- Note about "New" tags requiring admin creation first

### Document Record — Links Section
- "AI Link Suggestions" subsection with "Suggest Links" button
- Lists pending suggestions with entity type badge, entity name, confidence %, reason
- Accept button (for suggestions with resolved `entity_id`), Reject button

---

## 8. Security / Confidentiality Handling

- `content_text` is **never** returned in list or search responses
- `hr`/`legal`/`executive` documents:
  - Ask AI requires `dms.admin`
  - Content search excludes them for non-admin users
  - AI summary remains redacted in search results for non-admin users
- `createAdminClient()` is **not used** for any user-facing search or read
- All user-facing queries use RLS-enforced `createClient()`
- No RLS policies modified, disabled, or weakened
- No pgvector or embeddings implemented
- Tags and links **never auto-applied** — human approval required for every suggestion

---

## 9. Feature Flags Used

All confirmed enabled in `erp_ai_feature_flags`:

| Flag | Used By |
|---|---|
| `DMS_AI_SEARCH` | `extractDmsSearchIntent` |
| `DMS_CROSS_DOC_SEARCH` | `askDmsDocumentsQuestion` |
| `DMS_DOCUMENT_QA` | `askDmsDocumentQuestion` |
| `DMS_AUTO_TAGS` | `suggestDmsDocumentTags` |
| `DMS_SMART_LINKS` | `suggestDmsDocumentLinks` |

---

## 10. Logging / Audit Behaviour

### `erp_ai_usage_logs` (safe metadata only)
- `feature_area`, `operation_type`, `document_id`, `provider_code`, `model_id`
- `input_char_count`, `output_char_count`, `prompt_tokens`, `completion_tokens`
- `status`, `prompt_version`, `result_count`
- **Never logged:** question text, prompt content, `content_text`, answer text, raw AI response

### `logAudit` events
- `dms_ai_search_used` — result count + question char count only
- `dms_document_question_asked` — source_used + confidence only (no question/answer)
- `dms_tag_suggestions_generated` — suggestion count
- `dms_tag_suggestions_applied` — applied count + suggestion IDs
- `dms_tag_suggestions_rejected` — suggestion IDs
- `dms_link_suggestions_generated` — suggestion count
- `dms_link_suggestions_applied` — applied count + suggestion IDs
- `dms_link_suggestions_rejected` — suggestion IDs

---

## 11. Known Limitations

1. **Link suggestions: party only** — Phase 12.4 implements party suggestions only. Other entity types (employee, vehicle, equipment) will be added in a future phase when those master tables are confirmed.
2. **Tag suggestions require resolved `tag_id`** — Suggestions for new tags (not in `dms_tags`) cannot be auto-applied; a DMS admin must first create the tag.
3. **AI search uses `simple` FTS config** — Same as existing `content_tsv` configuration; handles proper nouns and IDs correctly in UAE context.
4. **Party context for link suggestions capped at 30** — To keep prompts manageable. Future improvement: filter parties by detected names.
5. **Intent extraction uses up to 500 chars of question** — Sufficient for natural-language queries; longer inputs are truncated client-side.
6. **AI search results capped at 25** — Prevents over-wide queries from returning noise.

---

## 12. TypeScript Result

```
npx tsc --noEmit → Exit code: 0 (0 errors)
```

---

## 13. Build Result

```
npm run build → Exit code: 0
✓ Compiled successfully in 9.4s
✓ TypeScript: Finished in 15.8s
✓ Static pages generated
```

---

## 14. Next Recommended Phase

**DMS 12.5 — Semantic Search / pgvector (Future Optional)**
- Add `pgvector` extension
- Store summary embeddings in `dms_documents.summary_embedding`
- Implement cosine similarity search
- Requires careful RLS design for vector columns
- Only implement with explicit Sameer/Dina approval
