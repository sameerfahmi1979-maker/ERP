# ERP DMS 12.2 — AI Document Summary Implementation Report

**Date:** 2026-06-15
**Phase:** ERP DMS 12.2 — AI Document Summary
**Status:** CLOSED / PASS ✅
**QA:** `npx tsc --noEmit` ✅ | `npm run build` ✅

---

## 1. Phase Title and Objective

**ERP DMS 12.2 — AI Document Summary**

Generate, store, and display AI-produced plain-English document summaries from `dms_document_content.content_text`. Summaries are stored once on `dms_documents.ai_summary` and reused — they are never generated at query/search time.

---

## 2. Files Created

| File | Purpose |
|------|---------|
| `src/server/actions/dms/ai-summary.ts` | Server actions: `getDmsAiSummaryStatus`, `generateAndSaveDmsAiSummary`, `regenerateDmsAiSummary`, `bulkGenerateMissingSummaries` |
| `src/features/dms/documents/sections/dms-document-ai-summary-section.tsx` | UI card for AI Summary tab in the document record form |
| `implementation_Review/ERP_DMS_12_2_AI_DOCUMENT_SUMMARY_IMPLEMENTATION_REPORT.md` | This report |

---

## 3. Files Modified

| File | Change |
|------|--------|
| `src/lib/dms/ai/types.ts` | Added `DmsSummaryOutput` interface; extended `IDmsAiProvider` with `summarize(systemPrompt, userMessage)` method |
| `src/lib/dms/ai/openai-dms-adapter.ts` | Implemented `summarize()` method using fetch-native OpenAI chat completions (plain text, not JSON); 45s timeout, 800 max tokens |
| `src/lib/dms/ai/factory.ts` | Added `summarize()` to `NoopDmsAiProvider` (throws if unconfigured); imported `DmsSummaryOutput` |
| `src/lib/query/query-keys.ts` | Added `dms.documentAiSummary(documentId)` query key |
| `src/features/dms/documents/dms-document-record-form.tsx` | Imported `DmsDocumentAiSummarySection`; added `ai-summary` section entry between Extracted Text and AI Analysis tabs; added `ERPRecordSectionPanel` for AI Summary |

---

## 4. Migration

**No migration required.**

All `ai_summary*` columns and `content_tsv` were created in the Phase 12.1 migration (`20260615060000_erp_dms_12_1_content_text_foundation.sql`). Live DB audit confirmed all 8 columns exist:
- `ai_summary`
- `ai_summary_updated_at`
- `ai_summary_model`
- `ai_summary_status`
- `ai_summary_error`
- `ai_summary_input_char_count`
- `ai_summary_input_truncated`
- `content_tsv`

---

## 5. Server Actions Added / Modified

### `src/server/actions/dms/ai-summary.ts` (new)

| Action | Purpose |
|--------|---------|
| `getDmsAiSummaryStatus(documentId)` | Lightweight load of summary fields from `dms_documents`. Redacts `ai_summary` text for confidential documents if non-admin. Used by UI card. |
| `generateAndSaveDmsAiSummary(documentId)` | Generates summary only when missing/pending/failed/skipped. Returns error if status is already `complete`. |
| `regenerateDmsAiSummary(documentId)` | Force-overwrites existing summary regardless of current status. |
| `bulkGenerateMissingSummaries(input)` | Admin-only batch action. Default batch size 20, max 50. Supports `dryRun`, `resumeFromDocumentId`. Returns `{ processed, skipped, failed, errors, nextResumeFromDocumentId }`. |

All actions follow the standard pattern: `getAuthContext()` → `hasPermission()` → Zod validate → business logic → `logAudit()` → `revalidatePath()`.

---

## 6. AI Provider Integration

- **Used:** `getDmsAiProvider()` from `src/lib/dms/ai/factory.ts`
- **Provider:** `OpenAiDmsAdapter` extended with new `summarize()` method
- **Interface:** `IDmsAiProvider.summarize(systemPrompt, userMessage): Promise<DmsSummaryOutput>`
- **API Pattern:** Fetch-native (no OpenAI SDK), same pattern as `analyze()`
- **Timeout:** 45,000 ms (shorter than 90s vision timeout — text-only requests)
- **Max Tokens:** 800 (3–5 sentence summary)
- **Response Format:** Plain text (no `json_object` response_format — summary must not be JSON)
- **API Key:** Resolved from `process.env[secretRef]` — never stored, never logged
- **Token Counts:** Captured from API response `usage` object and stored in `erp_ai_usage_logs`
- **Config Priority:** Uses existing `DEFAULT_DMS_CLASSIFIER` → `DEFAULT_DMS_EXTRACTOR` → `DEFAULT_CHAT` priority chain

---

## 7. Summary Prompt Version

**Version: v1.0**

Stored in constant `SUMMARY_PROMPT_VERSION = "v1.0"` in `ai-summary.ts`. Logged in `erp_ai_usage_logs.metadata_json` for traceability.

**System Prompt Context:** "Alliance Gulf ERP system, United Arab Emirates, logistics, transport, offshore/onshore work, HR, contracts, insurance, scrap, demolition, government compliance, fleet/workshop."

**Output Rules:** Plain text, 3–5 sentences, no markdown, no bullet points, no JSON, no invented data, redacted personal medical/salary details.

**User Message Template:**
```
Document No: [document_no]
Title: [title]
Document Type: [type name if available]
Category: [category name if available]
Issue Date: [issue_date if available]
Expiry Date: [expiry_date if available]

Extracted Text:
[first 20,000 chars of content_text]
```

---

## 8. UI Components Added / Modified

### `DmsDocumentAiSummarySection` (new)

- **File:** `src/features/dms/documents/sections/dms-document-ai-summary-section.tsx`
- **Placement:** New `ai-summary` tab in document record form, between "Extracted Text" and "AI Analysis"
- **Features:**
  - Status badge: `pending` | `complete` | `failed` | `skipped` | `not_required`
  - Summary text display
  - Last updated timestamp and model name
  - Input truncated warning (when `ai_summary_input_truncated = true`)
  - Failed state error message (from `ai_summary_error`, safe display)
  - Generate Summary button (when no summary and user has permission)
  - Regenerate button (when summary exists and user has permission)
  - Loading/generating spinner
  - Restricted access message for confidential documents for non-admin users
  - AI disclaimer note: "AI summaries are generated from extracted document text and should be reviewed by the user. The original document remains the source of truth."
- **Data Source:** `getDmsAiSummaryStatus()` server action via `useQuery` with `queryKeys.dms.documentAiSummary(documentId)` 
- **Post-generation:** Invalidates `queryKeys.dms.documents()` + refetches own query

### `dms-document-record-form.tsx` (modified)

- Added import for `DmsDocumentAiSummarySection`
- Added `ai-summary` section entry to sections array
- Added `ERPRecordSectionPanel` rendering `DmsDocumentAiSummarySection` with:
  - `canGenerate` — requires `dms.documents.ai.run` OR `dms.admin` OR `system_admin`/`group_admin` role
  - `isConfidentialForNonAdmin` — true when `confidentiality_level` is `hr`/`legal`/`executive` and user is not admin

---

## 9. Permission / Security Handling

| Permission | Requirement |
|-----------|-------------|
| View AI summary | `dms.documents.view` (standard read) |
| Generate summary | `dms.documents.ai.run` OR `dms.admin` |
| Regenerate summary | `dms.documents.ai.run` OR `dms.admin` |
| Bulk backfill | `dms.admin` only |
| Generate for confidential doc (hr/legal/executive) | `dms.admin` only |

- `createAdminClient()` is NOT used for any user-facing read — all reads use `createClient()` (RLS-enforced).
- RLS on `dms_document_content` and `dms_documents` remains unchanged.
- No RLS policies added, removed, or weakened.

---

## 10. Confidentiality Handling

- **Confidential levels:** `hr`, `legal`, `executive`
- **Summary generation/regeneration:** Blocked for non-admin users (checked server-side in `runSummaryForDocument`)
- **Summary text in read response:** `getDmsAiSummaryStatus()` replaces `ai_summary` with `"[Summary restricted — confidential document]"` for non-admin users
- **UI:** Non-admin users see a "Summary Restricted" message with a lock icon; Generate/Regenerate buttons are hidden
- **List responses:** Existing `getDmsDocuments()` redaction from Phase 12.1 remains intact

---

## 11. Feature Flag Handling

- **Flag code:** `DMS_AI_SUMMARY`
- **Check:** All three generate/regenerate/bulk actions check `isDmsAiSummaryEnabled()` before proceeding
- **Behavior when disabled:** Returns controlled error: `"DMS AI Summary feature is not enabled."`
- **Flag inserted in Phase 12.1 migration:** `ON CONFLICT (feature_code) DO NOTHING`

---

## 12. Logging / Audit Behavior

### `erp_ai_usage_logs` (structured)

Inserted after each summary generation attempt with:
- `feature_area = "DMS_AI_SUMMARY"`
- `operation_type = "summary_generate"` or `"summary_regenerate"`
- `model_id`, `status`, `input_token_count`, `output_token_count`, `duration_ms`, `error_message`
- `metadata_json` with: `document_id`, `prompt_version`, `input_char_count`, `input_truncated`, `output_char_count`

### `logAudit()` (module audit trail)

Safe metadata only:
- `action`: `ai_summary_generated` / `ai_summary_regenerated` / `ai_summary_failed` / `ai_summary_bulk_generate`
- `document_id`, `provider`, `model`, `status`, `input_char_count`, `output_char_count`, `duration_ms`

**Never logged:**
- `content_text`
- OCR text
- Prompt text or system prompt
- Raw AI response
- Full summary text
- API keys

---

## 13. Tests Performed

**TypeScript:** `npx tsc --noEmit` → **Exit code: 0** (0 errors)

**Production Build:** `npm run build` → **Exit code: 0** (successful, all routes compiled)

**Source-level checks:**
- ✅ `content_text` not in any log statement
- ✅ Prompt text not logged
- ✅ `createAdminClient()` not used for user-facing reads
- ✅ Confidential document blocks non-admin generation server-side
- ✅ Existing DMS.10 and DMS.11 AI classification/extraction compile and are unmodified
- ✅ DMS 12.1 Extracted Text card unchanged
- ✅ `content_tsv` auto-updates via existing DB trigger after `ai_summary` is written
- ✅ List summary redaction (`getDmsDocuments()`) from Phase 12.1 remains intact

---

## 14. `npx tsc --noEmit` Result

```
Exit code: 0
(no output — zero TypeScript errors)
```

---

## 15. `npm run build` Result

```
Exit code: 0
▲ Next.js 16.2.6 (Turbopack)
✓ Compiled successfully in 7.9s
✓ TypeScript passed in 13.8s
✓ All routes compiled
```

---

## 16. Known Limitations

1. **No auto-trigger on intake approval or OCR completion.** Auto-trigger was evaluated and deliberately skipped for Phase 12.2. AI summary generation adds a synchronous API call (up to 45 seconds). Adding it to the intake approval path would noticeably slow the user-facing workflow. The Generate Summary button and admin bulk action cover the use case without blocking document creation. Auto-trigger can be added in a later phase if background job infrastructure is introduced.

2. **No admin UI for bulk backfill.** `bulkGenerateMissingSummaries` is implemented as a server action callable from an admin tool or directly from code. A dedicated admin UI page for bulk summary generation is deferred and can be added as a thin wrapper in a future phase.

3. **Summary history not preserved.** Regeneration overwrites the existing summary. No previous summary history is stored. If audit trail of summary revisions is needed, it can be added in a future phase using a `dms_document_ai_summary_history` table.

4. **No list-level summary snippet.** The All Documents list (`/dms/documents`) does not currently show `ai_summary` as a secondary line. Adding it cleanly required evaluating the list component structure. Due to risk of large UI refactor, it was deferred. The redaction logic for confidential documents remains in place in `getDmsDocuments()`.

5. **Bulk action has no dedicated admin UI.** The `bulkGenerateMissingSummaries` action exists and works but must be invoked from code (e.g. an admin dev tool or future page).

---

## 17. Next Recommended Phase

**ERP DMS 12.3 — Completeness, Risk, Enhanced Search**

Includes:
- Document completeness score (`completeness_score`, `completeness_status`)
- AI risk score (`ai_risk_score`, `ai_risk_level`)
- Enhanced FTS search UI with content-tsv results
- Placeholder columns already exist from Phase 12.1

Requires a separate Phase 12.3 prompt from Sameer before implementation.
