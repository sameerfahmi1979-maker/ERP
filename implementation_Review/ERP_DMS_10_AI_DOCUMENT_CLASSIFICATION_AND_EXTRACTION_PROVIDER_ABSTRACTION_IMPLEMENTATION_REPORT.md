# ERP DMS.10 — AI Document Classification and Extraction Provider Abstraction
## Implementation Report

**Phase:** ERP DMS.10  
**Completed:** 2026-06-15  
**Status:** CLOSED / PASS ✅  
**Stack:** Next.js 16 + TypeScript + Supabase PostgreSQL + RLS  

---

## 1. Executive Summary

ERP DMS.10 establishes the AI classification and metadata extraction **suggestion foundation** for the DMS. Building on the OCR text pipeline from DMS.9, this phase:

- Creates a DMS AI provider abstraction layer that wraps the SETTINGS.1 AI provider factory.
- Builds a combined classify+extract flow using OpenAI-compatible chat completion (fetch-native, no SDK).
- Stores AI results in `dms_ai_extraction_results` with per-field confidence scores.
- Adds an "AI Analysis" tab to the DMS document record UI showing all suggestions.
- **Never auto-saves** metadata, never changes document type, never creates links.
- All AI output requires human review (DMS.11).

---

## 2. DMS.9 Dependency Confirmation

- `dms_document_files.ocr_text` — populated by DMS.9 OCR pipeline.
- `dms_document_files.ocr_status` — checked for `complete` before AI analysis.
- OCR trigger UI (OCR / Text tab) — already in place.
- If no OCR text exists, `runDmsAiAnalysisForDocument` returns clear error: *"No OCR text available. Please run OCR on the document files first."*

---

## 3. AI Provider Strategy

**Priority chain (in order):**

| Priority | Config Code | Purpose |
|---|---|---|
| 1 | `DEFAULT_DMS_CLASSIFIER` | DMS-specific classifier |
| 2 | `DEFAULT_DMS_EXTRACTOR` | DMS-specific extractor |
| 3 | `DEFAULT_CHAT` | Fallback general chat |
| — | noop | Returns `provider_not_configured` |

All provider configs already seeded from SETTINGS.1. Factory (`src/lib/dms/ai/factory.ts`) returns `NoopDmsAiProvider` when no enabled+configured provider is found. The noop provider's `isConfigured()` returns `false` — the server action records a `provider_not_configured` job status and returns a clear user message.

**API key resolution:** `process.env[secretRef]` — key reference stored in DB, never the key itself.

---

## 4. Migration / Schema Changes

**Migration file:** `supabase/migrations/20260615020000_erp_dms_10_ai_classification_extraction_foundation.sql`
**Applied to live DB:** ✅ via `user-supabase` MCP

### `dms_ai_extraction_jobs` — 3 columns added

| Column | Type | Description |
|---|---|---|
| `run_source` | TEXT NULL | `manual \| bulk \| system` |
| `input_text_hash` | TEXT NULL | djb2 hash of OCR text — for deduplication, not security |
| `prompt_version` | TEXT NULL | Prompt template version tag (e.g., `v1.0`) |

### `dms_ai_extraction_results` — 7 columns added

| Column | Type | Description |
|---|---|---|
| `file_id` | BIGINT → dms_document_files | Source file (if file-level) |
| `result_type` | TEXT NULL | `classification \| extraction \| combined` |
| `ai_status` | TEXT DEFAULT 'pending_review' | `pending_review \| accepted \| rejected \| superseded` |
| `field_confidence_json` | JSONB NULL | Per-field confidence: `{fieldCode: {score, label, source_snippet}}` |
| `classification_reason` | TEXT NULL | AI reasoning text (max 500 chars) |
| `suggested_title` | TEXT NULL | AI-suggested title — requires DMS.11 before saving |
| `suggested_description` | TEXT NULL | AI-suggested description — requires DMS.11 before saving |

### New indexes (3)

- `idx_dms_ai_results_document_status` on `(document_id, ai_status)`
- `idx_dms_ai_results_file` on `(file_id)`
- `idx_dms_ai_jobs_run_source` on `(run_source)`

### New permissions (4)

| Permission Code | Description |
|---|---|
| `dms.documents.ai.view` | View AI classification and extraction results |
| `dms.documents.ai.run` | Trigger AI classification/extraction |
| `dms.documents.ai.retry` | Retry failed AI analysis jobs |
| `dms.documents.ai.supersede` | Mark AI result as superseded |

---

## 5. AI Job Model

- `job_type = 'classify_extract'` (combined, single call)
- Job statuses: `pending → processing → completed \| failed \| provider_not_configured \| skipped`
- One job per analysis run per document
- `run_source = 'manual'` for user-triggered analyses
- On provider not configured: job created with `status = 'provider_not_configured'`, clear error returned
- On AI failure: job set to `failed`, `error_message` stored (max 500 chars)

---

## 6. Prompt / Output Schema

### Prompt strategy

- **Single combined prompt** — classification + extraction in one API call
- System prompt defines strict JSON output format
- Type candidates passed (up to 20 active document types)
- Metadata fields passed (only `is_ai_extractable = true` fields for current doc type)
- OCR text truncated at 12,000 characters (~6,000 tokens)
- `PROMPT_VERSION = 'v1.0'` stored on each job

### Expected JSON output

```json
{
  "classification": {
    "suggested_type_code": "TRADE_LICENSE",
    "confidence_score": 0.92,
    "confidence_label": "high",
    "reason": "Document contains trade license number and issuing authority."
  },
  "suggested_title": "Trade License - ABC Company",
  "suggested_description": "Trade license document...",
  "fields": [
    {
      "field_code": "license_number",
      "value": "CN-123456",
      "confidence_score": 0.95,
      "confidence_label": "high",
      "source_snippet": "License No: CN-123456"
    }
  ],
  "suggested_links": [],
  "warnings": []
}
```

### Validation (`result-validator.ts`)

- Strips markdown code fences before JSON parse
- Falls back to `{` ... `}` extraction if needed
- All confidence scores clamped to 0.0–1.0
- `confidenceLabel` re-derived from score if invalid string supplied
- Unknown fields → warnings (not field list)
- Expiry date auto-detected from field values matching `^\d{4}-\d{2}-\d{2}$`
- Raw response stored sanitized (no large OCR text content)

---

## 7. Server Actions Created

**File:** `src/server/actions/dms/ai-analysis.ts`

| Action | Description |
|---|---|
| `getDmsAiAnalysisStatus(documentId)` | Returns AI status, pending job count, latest result |
| `getDmsAiExtractionResults(documentId)` | Returns all non-superseded results (last 10) |
| `getDmsAiExtractionResult(resultId)` | Returns single result by ID |
| `runDmsAiAnalysisForDocument(input)` | Main action: checks OCR, runs AI, stores result |
| `retryDmsAiAnalysisJob(jobId)` | Retries failed/cancelled jobs |
| `markDmsAiResultSuperseded(resultId)` | Marks result as superseded |

All actions: `getAuthContext()` → `hasPermission()` → Zod validation → Supabase query → AI provider → `logAudit()` → `dms_document_events` insert → `revalidatePath()`.

---

## 8. Provider / Factory Files Created

| File | Description |
|---|---|
| `src/lib/dms/ai/types.ts` | IDmsAiProvider, DmsAiOutput, DmsClassificationResult, DmsExtractionResult, DmsAiInput, confidenceLabelFromScore |
| `src/lib/dms/ai/factory.ts` | getDmsAiProvider() with priority fallback chain, NoopDmsAiProvider |
| `src/lib/dms/ai/openai-dms-adapter.ts` | OpenAiDmsAdapter — fetch-native chat completion, API key from env var |
| `src/lib/dms/ai/prompt-builders.ts` | buildCombinedPrompt(), hashOcrText(), PROMPT_VERSION |
| `src/lib/dms/ai/result-validator.ts` | validateAiOutput() — JSON extraction, type-safe parsing, confidence normalization |

---

## 9. UI Changes

### New components

- `src/features/dms/ai/dms-ai-confidence-badge.tsx` — Confidence level badge (high/medium/low/needs_manual_review) with percentage display
- `src/features/dms/documents/sections/dms-document-ai-section.tsx` — Full AI Analysis section:
  - AI status header with current status badge
  - "Run AI Analysis" / "Re-run AI Analysis" button (canRun prop)
  - Empty state with instructions
  - `AiResultCard` — expandable card showing:
    - Classification suggestion + confidence badge
    - Suggested title/description
    - Fields table (field code, suggested value, confidence, source snippet)
    - Expiry date suggestion
    - Suggested links (if any)
    - Warnings
    - Supersede / Retry buttons
  - Historical results (collapsed list)
  - Info notice: *"AI suggestions require human review and are not saved automatically."*

### Modified files

- `src/features/dms/documents/dms-document-record-form.tsx`:
  - Added `Brain` icon import
  - Added `DmsDocumentAiSection` import
  - Added `ai` section to sections array (between OCR and Approvals)
  - Added AI section panel with `canRun` and `canView` from `authContext`

### Query keys added (`src/lib/query/query-keys.ts`)

- `documentAiStatus(documentId)`
- `documentAiResults(documentId)`
- `aiResult(resultId)`

### Invalidation added (`src/lib/query/invalidation.ts`)

- `invalidateDmsAiAnalysis(queryClient, documentId)`

---

## 10. Result Storage Behavior

### Stored in `dms_ai_extraction_results`

- `job_id`, `document_id`, `result_type = 'combined'`
- `ai_status = 'pending_review'`
- `suggested_document_type_id` (resolved from type_code → DB lookup)
- `classification_confidence` (label), `classification_score` (numeric)
- `classification_reason` (text, max 500)
- `extracted_fields_json` (`{fieldCode: value}`)
- `field_confidence_json` (`{fieldCode: {score, label, source_snippet}}`)
- `suggested_links_json` (array)
- `expiry_date_suggestion` (date string if detected)
- `suggested_title`, `suggested_description`
- `raw_ocr_text = NULL` — never stored (already in dms_document_files)
- `raw_response_json` — sanitized (no large text blocks)

### NOT written

- `dms_document_metadata_values` ✅
- `dms_documents.document_type_id` ✅
- `dms_documents.title` / `.description` ✅
- `dms_document_links` ✅

---

## 11. Security / Privacy Behavior

| Rule | Status |
|---|---|
| OCR text never logged in audit | ✅ |
| AI prompts never logged in audit | ✅ |
| API keys never returned to frontend | ✅ |
| AI keys resolved from `process.env[secretRef]` only | ✅ |
| AI results not shown to unauthorized users | ✅ (canView check) |
| Confidential documents (hr/legal/executive) require dms.admin | ✅ |
| AI analysis never triggers on page load | ✅ (only on explicit button click) |
| AI results never auto-saved | ✅ |

---

## 12. Human-Review-Required Confirmation

All AI output is stored with `ai_status = 'pending_review'`. The UI clearly states: *"AI suggestions require human review and are not saved automatically. Accepting suggestions and writing them to document metadata will be available in DMS.11 (AI Review Queue)."*

No Accept/Reject buttons exist in this phase.

---

## 13. AI Non-Autosave Confirmation

The following fields are **never written automatically** by any DMS.10 server action:

- `dms_document_metadata_values` rows
- `dms_documents.document_type_id`
- `dms_documents.title` / `description`
- `dms_document_links` rows

---

## 14. Audit Events Implemented

| Event | Logged in `dms_document_events` | Logged in `logAudit()` |
|---|---|---|
| `ai_analysis_started` | ✅ | ✅ |
| `ai_classification_completed` | ✅ | ✅ |
| `ai_analysis_failed` | ✅ | ✅ |
| `ai_analysis_retried` | ✅ | ✅ |
| `ai_result_viewed` | — | ✅ (in getDmsAiExtractionResults) |
| `ai_result_superseded` | ✅ | ✅ |

All events log: `job_id`, `result_id`, `provider`, `model`, `document_id`, `confidence_label`, `duration_ms`, `error_summary`. OCR text and prompts are never logged.

---

## 15. Source-of-Truth / Rule Updates

- `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` — updated with full DMS.10 closure gate summary.
- `implementation_Review/ERP_DMS_10_AI_DOCUMENT_CLASSIFICATION_AND_EXTRACTION_PROVIDER_ABSTRACTION_IMPLEMENTATION_REPORT.md` — this file.

---

## 16. TypeScript / Lint / Build QA

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ PASS — 0 errors |
| `npm run build` | ✅ PASS — all routes compiled |

**Errors encountered and fixed:**

1. `runDmsAiAnalysisForDocument` parameter type used `z.infer` (output type, making optional fields required). Fixed: changed to `z.input<typeof RunAnalysisSchema>`.
2. `DmsAiResultRow` missing `raw_response_json` field. Fixed: added to type definition and all SELECT queries.

---

## 17. Manual Browser QA Checklist

| Check | Expected |
|---|---|
| Open DMS document with OCR text | AI Analysis tab visible in section nav |
| AI Analysis tab with no results | Empty state with "Run AI Analysis" button |
| Click Run AI Analysis — no AI provider | Job created with `provider_not_configured`, clear error toast |
| Click Run AI Analysis — provider configured | Job runs, AI result card appears |
| AI result card expanded | Shows classification, confidence badge, field table, expiry, links, warnings |
| Field table | Shows fieldCode, suggested value, confidence badge, source snippet |
| No metadata auto-saved | `dms_document_metadata_values` unchanged |
| No document type auto-changed | `dms_documents.document_type_id` unchanged |
| Re-run AI Analysis | New result added, previous shown in "Previous Results" |
| Supersede result | Result status changes to "Superseded", card shows dimmed |
| Confidential document (hr/legal) without dms.admin | Error: "AI analysis not permitted for confidential documents" |
| No OCR text | Error: "No OCR text available. Please run OCR first." |
| AI text not in audit log | Verify audit log entries have no OCR/prompt text |
| API key not in network response | DevTools Network tab shows no secrets |

---

## 18. Database QA Checklist

| Check | Expected |
|---|---|
| `dms_ai_extraction_jobs` row created | `job_type = 'classify_extract'`, `run_source = 'manual'` |
| `dms_ai_extraction_results` row created | `ai_status = 'pending_review'`, `result_type = 'combined'` |
| `extracted_fields_json` populated | `{fieldCode: value, ...}` |
| `field_confidence_json` populated | `{fieldCode: {score, label, source_snippet}}` |
| `suggested_document_type_id` set | FK to matching `dms_document_types` row |
| `raw_ocr_text` | NULL (never stored) |
| `dms_document_metadata_values` | Unchanged |
| `dms_documents.document_type_id` | Unchanged |
| `dms_document_links` | Unchanged |
| `dms_document_events` row inserted | `event_type = 'ai_analysis_started'` and `'ai_classification_completed'` |
| No secrets in any table | Confirmed by schema inspection |

---

## 19. Issues / Deferred Items

| Item | Deferred To |
|---|---|
| Accept/Edit/Reject AI suggestions | DMS.11 — AI Review Queue |
| Auto-write accepted fields to `dms_document_metadata_values` | DMS.11 |
| Confirm-save document type change after review | DMS.11 |
| Create ERP links after human confirmation | DMS.11 |
| Suggested link matching (party name lookup) | DMS.11 (optional, simple matching) |
| Bulk AI analysis across multiple documents | Future admin tooling |
| Background/async job queue (not synchronous) | Future — currently synchronous with 60s timeout |
| Azure Document Intelligence provider | Future phase |
| Google Document AI provider | Future phase |

---

## 20. Recommended Next Phase

```
ERP DMS.11 — AI Review Queue and Confirm-Save Workflow
```

**DMS.11 will:**
- Present AI suggestions for human review in a dedicated review queue.
- Allow Accept / Edit / Reject per field.
- Save accepted field values into `dms_document_metadata_values`.
- Optionally update document type / title / description after confirmation.
- Create/confirm ERP links after review.
- Set `ai_status = 'accepted'` on the result row.
- Maintain full audit trail of review decisions.
