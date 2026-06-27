# ERP DMS AI Corrected Phase 10 — OCR Pipeline Upgrade / Azure OCR Wiring Plan

**Phase:** ERP DMS AI Phase 10  
**Type:** Planning only — no implementation  
**Date:** 2026-06-22  
**Depends on:** Phase 9 (Async AI Job Queue) migrations applied and UAT complete  
**Prepared by:** Senior ERP / DMS / OCR / AI Architect

---

## 1. Executive Summary

Phase 10 upgrades the DMS OCR pipeline from a single-provider GPT-4.1-vision-for-everything architecture to a **three-tier routing architecture**:

1. **Digital PDF / Office docs** → local text extraction (zero AI cost, instant)
2. **Scanned PDF / images** → Azure Document Intelligence (better quality, lower cost, Arabic-native)
3. **GPT-4.1 vision** → fallback when Azure is disabled or fails

The Azure Document Intelligence adapter already exists and is fully implemented (`AzureDocumentIntelligenceAdapter`). The `PdfTextProvider` already exists. `extractFileContent` already has an internal PDF text-layer fast path. Neither is wired as the primary OCR decision maker — GPT-4.1 handles everything today regardless of file type.

**Key discovery:** `extractFileContent` already detects whether a PDF has a text layer and returns early with extracted text. But `triggerDmsOcrForFile` ignores this and sends everything to GPT-4.1 anyway. The biggest quick win is wiring the text-layer short-circuit so digital PDFs skip GPT-4.1 entirely.

**Phase 10 scope:**
- Phase 10A: Wire OCR router into existing synchronous paths (intake, manual, approval-time)
- Phase 10B: Queue-backed admin OCR backfill (gated for Phase 10B after 10A stable)

No auto-approval, no semantic chunking, no review queue, no token dashboard.

---

## 2. Planning Scope and Non-Implementation Rule

This document is a **planning-only artifact**. No source code, migrations, or schema changes have been made.

**Cursor may in Phase 10 implementation:**
- Create `src/lib/dms/ocr/ocr-router.ts`
- Modify `triggerDmsOcrForFile` to call the router
- Modify intake OCR paths to call the router
- Add `ARABIC_OCR_AZURE` config row via migration
- Add `DMS_OCR_AZURE` and `DMS_OCR_GPT_VISION_FALLBACK` feature flags
- Update `ocr_provider` column values to reflect new routing

**Cursor must NOT in Phase 10:**
- Move intake OCR fully async without a separate UX plan
- Add Apply-to-ERP writes
- Add semantic chunking
- Add review queue activation
- Add token/cost dashboard
- Add auto-approval or auto-save metadata
- Store raw Azure JSON responses without explicit sanitization plan
- Log OCR text, prompts, or API keys

---

## 3. Files and Source-of-Truth Reviewed

| File | Status | Notes |
|------|--------|-------|
| `src/lib/dms/ocr/types.ts` | ✅ Read | `IOcrProvider`, `OcrResult`, `OcrProviderCode` — `azure_doc_intel` listed but deferred |
| `src/lib/dms/ocr/factory.ts` | ✅ Read | Only exports `isOcrSupported()` — NOT a real provider factory |
| `src/lib/dms/ocr/pdf-text-provider.ts` | ✅ Read | `PdfTextProvider` exists and works — **UNUSED, not wired** |
| `src/lib/dms/ocr/noop-provider.ts` | ✅ Read | Stub fallback — exists |
| `src/lib/dms/ocr/persist-file-ocr-result.ts` | ✅ Read | Single persistence path — correct, keep as-is |
| `src/lib/dms/ocr/derive-document-ocr-summary.ts` | ✅ Read | Read-path helper — no changes needed |
| `src/lib/dms/ai/factory.ts` | ✅ Read | `getDmsAiProvider()` + `getAzureDocumentIntelligenceProvider()` — Azure function exists but never called from OCR paths |
| `src/lib/dms/ai/azure-document-intelligence-adapter.ts` | ✅ Read | Full Azure DI adapter with `analyzeWithAzureOcr()` — **EXISTS but not wired to OCR** |
| `src/lib/dms/file-content-extractor.ts` | ✅ Read | Already has PDF text-layer fast path — **result not used to skip GPT** |
| `src/server/actions/dms/ocr.ts` | ✅ Read | `triggerDmsOcrForFile` — all file types go to GPT-4.1 |
| `src/lib/dms/approve/approve-ai-intake.ts` | ✅ Read | Approval-time OCR also calls `extractFileContent` + GPT-4.1 |
| `src/server/actions/dms/ai-intake.ts` | ✅ Read | Intake uses `extractFileContent` + GPT-4.1 |
| Live DB: `erp_ai_feature_flags` | ✅ Checked | Only `DMS_OCR=true` exists — no Azure/routing flags |
| Live DB: `erp_ai_provider_configs` | ✅ Checked | `DEFAULT_DMS_OCR (tesseract, disabled)` — no `ARABIC_OCR_AZURE` row |
| Live DB: `dms_document_files` OCR columns | ✅ Checked | 10 columns: status, text, provider, model, started_at, completed_at, error_message, confidence, page_count, language |

**Missing files (not in codebase):**
- `src/lib/dms/ocr/ocr-router.ts` — does not exist, planned in Phase 10
- `src/lib/dms/ai/azure-document-intelligence-ocr-provider.ts` — wrapping the adapter as an `IOcrProvider` — planned
- No admin OCR backfill queue handler — planned for Phase 10B

---

## 4. Phase 9 Queue Status and Dependency Review

Phase 9 provides `dms_ai_job_queue` infrastructure. Phase 10 uses it for:

| Phase 10 Operation | Queue Usage |
|-------------------|-------------|
| Manual OCR re-run | Phase 10A: synchronous; Phase 10B: optionally queued |
| Intake OCR | Keep synchronous (user waiting) |
| Approval-time OCR | Keep synchronous (approval path, non-fatal) |
| Admin OCR backfill | Phase 10B: queue `ocr_backfill` job type |
| Post-approval content sync | Already queue-enabled via Phase 9 — no change |

Phase 10A does not require Phase 9 migrations to be applied — it only touches synchronous OCR routing. Phase 10B does require Phase 9 queue to be live.

---

## 5. Current OCR Pipeline Inventory

### 5.1 Manual OCR — Document Record

| Attribute | Value |
|-----------|-------|
| Entry function | `triggerDmsOcrForFile(fileId, forceRetry)` in `ocr.ts` |
| UI trigger | "Run OCR" button in DMS document OCR tab |
| Provider used | Always GPT-4.1 via `getDmsAiProvider()` |
| File source | `dms_document_files` → storage download via `createAdminClient()` |
| Storage bucket | `dms-documents` |
| Result table/field | `dms_document_files.ocr_text` + `ocr_status` + `ocr_provider` + `ocr_model` |
| Status field | `dms_document_files.ocr_status` |
| Error behavior | Sets `ocr_status=failed`, writes sanitized error |
| Sensitive logging | No — audit logs event type + duration only, not OCR text |
| Safe to queue? | Phase 10B: yes |
| Must remain sync? | Phase 10A: yes — user expects immediate result |

**Key issue:** `extractFileContent` returns early with text for digital PDFs, but `triggerDmsOcrForFile` ignores this and always calls GPT-4.1. **Costs GPT tokens unnecessarily for every digital PDF.**

### 5.2 Document-level OCR (all files)

| Attribute | Value |
|-----------|-------|
| Entry function | `triggerDmsOcrForDocument(documentId)` |
| Behavior | Loops all document files, calls `triggerDmsOcrForFile` per file |
| Issues | Same as 5.1 — all files sent to GPT regardless |

### 5.3 Single-file Intake OCR

| Attribute | Value |
|-----------|-------|
| Entry function | `startAiIntakeFromUploadSession()` in `ai-intake.ts` |
| UI trigger | "Start AI Analysis" on intake session page |
| Provider used | GPT-4.1 via `getDmsAiProvider()` |
| File source | `dms-temp` bucket |
| Result table | `dms_ai_extraction_results` (AI fields), NOT `dms_document_files` (no doc yet) |
| Status field | `dms_upload_sessions.intake_status` |
| Error behavior | Sets `intake_status=failed`, user can retry |
| Sensitive logging | No — OCR text flows through memory, not logged |
| Safe to queue? | **No** — user is waiting on the intake screen |
| Must remain sync? | **Yes** — UX requires synchronous response |

### 5.4 Batch Intake OCR

| Attribute | Value |
|-----------|-------|
| Entry function | `processBatchIntakeSession()` in `batch-intake.ts` |
| Provider used | GPT-4.1 via `getDmsAiProvider()` |
| File source | `dms-temp` bucket |
| Result table | `dms_ai_extraction_results` per session |
| Must remain sync? | **Yes** — per-file sequential, user can monitor |

### 5.5 Approval-time OCR Sync

| Attribute | Value |
|-----------|-------|
| Entry function | `approveAiIntakeSaga()` in `approve-ai-intake.ts`, step 6b |
| Trigger | Immediately after successful approve RPC — best-effort |
| Provider used | GPT-4.1 via `getDmsAiProvider()` |
| File source | `dms-documents` bucket (already moved) |
| Result table | `dms_document_files.ocr_text` via `persistFileOcrResult` |
| Error behavior | Non-fatal — OCR failure does not roll back approval |
| Must remain sync? | **Yes** — runs in same request as approval (best-effort) |

### 5.6 AI Analysis OCR Fallback

| Attribute | Value |
|-----------|-------|
| Entry function | `runAiAnalysis()` in `ai-analysis.ts` — extracts content for analysis |
| Provider used | GPT-4.1 via `getDmsAiProvider()` |
| Purpose | Content extraction for AI analysis, not standalone OCR |
| Must remain sync? | Yes |

### 5.7 Admin OCR Backfill

| Attribute | Value |
|-----------|-------|
| Entry function | `intelligenceAdmin.ts` — runs OCR on documents without text |
| Provider used | GPT-4.1 via `triggerDmsOcrForFile` |
| Safe to queue? | **Phase 10B: yes** — admin batch operation, not user-facing |

### 5.8 Post-Approval Content Sync (Phase 9 system pipeline)

| Attribute | Value |
|-----------|-------|
| Entry function | `runContentSyncStepSystem()` in `system-pipeline.ts` |
| What it does | Reads existing `ocr_text` → writes to `dms_document_content` |
| Does NOT re-run OCR | Correct — content sync only, no new OCR calls |
| Phase 10 impact | None — this step is fine as-is |

---

## 6. Current OCR / AI Provider Inventory

### 6.1 `IOcrProvider` implementations

| Class | Code | Status | Notes |
|-------|------|--------|-------|
| `PdfTextProvider` | `pdf_text` | **EXISTS, UNUSED** | Extracts text layer from digital PDFs. Correctly returns empty for scanned PDFs. Works in serverless. |
| `NoopOcrProvider` | `noop` | EXISTS, UNUSED | Stub — returns `provider_not_configured` |
| *(planned)* `AzureOcrProvider` | `azure_doc_intel` | PLANNED | Wrapper adapting `AzureDocumentIntelligenceAdapter.analyzeWithAzureOcr()` to `IOcrProvider` |

### 6.2 `IDmsAiProvider` implementations

| Class | Code | Status | Notes |
|-------|------|--------|-------|
| `OpenAiDmsAdapter` | `openai` / `azure_openai` | ACTIVE | GPT-4.1 — used for everything including OCR |
| `AzureDocumentIntelligenceAdapter` | `azure_document_intelligence` | **EXISTS, NOT WIRED TO OCR PATH** | `analyzeWithAzureOcr()` is the key OCR method. Not called from `triggerDmsOcrForFile`. |
| `NoopDmsAiProvider` | `noop` | EXISTS | Fallback stub |

### 6.3 Live `erp_ai_provider_configs` rows

| config_code | provider_type | model_id | is_enabled | Notes |
|-------------|--------------|----------|------------|-------|
| `DEFAULT_DMS_CLASSIFIER` | `openai` | `gpt-4.1` | true | Used for intake classification + OCR |
| `DEFAULT_DMS_EXTRACTOR` | `openai` | `gpt-4.1` | true | Used for metadata extraction |
| `DEFAULT_CHAT` | `openai` | `gpt-4.1` | true | General fallback |
| `DEFAULT_EMBEDDING` | `openai` | `text-embedding-3-small` | true | Vector embeddings |
| `DEFAULT_DMS_OCR` | `tesseract` | null | **false** | Tesseract stub — disabled, not implemented |
| `LOCAL_LLM_DEFAULT` | `local_ollama` | null | false | Local LLM stub |
| **`ARABIC_OCR_AZURE`** | — | — | — | **DOES NOT EXIST** in live DB — needs to be added |

### 6.4 Live `erp_ai_feature_flags` — OCR-related

| feature_code | is_enabled | Notes |
|-------------|-----------|-------|
| `DMS_OCR` | **true** | Master OCR gate |
| `DMS_OCR_AZURE` | — | **DOES NOT EXIST** — planned |
| `DMS_OCR_GPT_VISION_FALLBACK` | — | **DOES NOT EXIST** — planned |
| `DMS_OCR_ROUTER` | — | **DOES NOT EXIST** — planned |

### 6.5 Arabic OCR Status

`getAzureDocumentIntelligenceProvider()` exists in `factory.ts` and checks for `ARABIC_OCR_AZURE` or `DEFAULT_ARABIC_OCR` config codes. Neither exists in the live DB. Arabic documents currently fall through to GPT-4.1 like all other files.

---

## 7. Azure OCR Wiring Options Compared

### Option A — Azure as primary OCR for all scanned/image files

Azure is used for all non-digital-PDF files. GPT-4.1 remains only as fallback.

**Pros:** Best quality for scanned docs and images; large cost reduction for scanned PDFs; Arabic-native.  
**Cons:** Requires Azure provisioned and configured; higher routing complexity.

### Option B — Three-tier routing (RECOMMENDED)

```
Digital PDF / DOCX / XLSX → local extraction (zero AI cost)
Scanned PDF / image       → Azure DI (if configured + enabled)
Scanned PDF / image       → GPT-4.1 vision (if Azure disabled or fails)
Unknown                   → mark skipped + safe error
```

**Pros:** Lowest total cost; preserves existing GPT fallback; uses Azure where it excels; minimal behavior change when Azure not configured; can be rolled out incrementally.  
**Cons:** More routing logic; need a new feature flag per tier.

### Option C — Keep GPT-4.1 primary, Azure as opt-in for Arabic only

No change to normal pipeline. Azure only triggers for Arabic documents (where already wired as `ARABIC_OCR_AZURE`).

**Pros:** Minimal change.  
**Cons:** Does not address GPT-4.1 cost for digital PDFs; misses the biggest win (text-layer short-circuit); Azure stays underused.

---

## 8. Recommended Azure OCR Strategy

**Recommendation: Option B — Three-tier routing**

Rationale:
1. `extractFileContent` already has the digital PDF text-layer detection. The biggest single win is short-circuiting GPT-4.1 for digital PDFs — this requires no Azure at all. Do this first.
2. Azure is available in the codebase and only needs a config row + feature flag to activate.
3. GPT-4.1 fallback is preserved. Existing behavior is unchanged when Azure is not configured.
4. `DMS_OCR_AZURE=false` by default — zero behavior change until enabled.

**Rollout order within Phase 10A:**
1. Wire text-layer fast path in `triggerDmsOcrForFile` (local extraction → skip GPT for digital PDFs)
2. Wire Azure provider for scanned PDFs/images (behind `DMS_OCR_AZURE=false` flag)
3. Keep GPT-4.1 as fallback when Azure disabled or fails

---

## 9. OCR Router Architecture Plan

### 9.1 New file: `src/lib/dms/ocr/ocr-router.ts`

Central routing function. Takes file buffer, MIME type, and config; returns an `OcrResult`.

```typescript
export interface OcrRouterInput {
  buffer:          Buffer;
  mimeType:        string;
  fileName:        string;
  featureFlags:    OcrFeatureFlags;
  azureProvider?:  AzureDocumentIntelligenceAdapter | null;
  gptProvider?:    IDmsAiProvider | null;
}

export interface OcrFeatureFlags {
  dmsOcr:              boolean;  // master gate
  dmsOcrAzure:         boolean;  // use Azure for scanned/image
  dmsOcrGptFallback:   boolean;  // allow GPT fallback
}

export interface OcrRouterResult {
  text:         string;
  providerCode: OcrProviderCode | "ai_intake";
  model:        string | null;
  method:       string;  // e.g. "pdf-text-layer" | "azure-di" | "gpt-vision-fallback"
  confidence?:  number;
  pageCount?:   number;
  language?:    string;
  fallbackUsed: boolean;
}

export async function routeOcr(input: OcrRouterInput): Promise<OcrRouterResult>
```

### 9.2 Routing logic

```
DOCX / XLSX / DOC:
  → extractFileContent() → text only path
  → model = "local-mammoth" | "local-xlsx"
  → providerCode = "pdf_text"

Digital PDF (text layer detected by extractFileContent):
  → extractFileContent() returns { method: "pdf-text-layer" }
  → model = "pdf-parse@text-layer"
  → providerCode = "pdf_text"
  → No AI call. Zero cost.

Scanned PDF (extractFileContent returns images, no text):
  → if DMS_OCR_AZURE=true AND azureProvider.isConfigured():
      → azureProvider.analyzeWithAzureOcr(base64, mime)
      → if success: providerCode = "azure_doc_intel"
      → if fail: fallback to GPT-4.1 vision (if DMS_OCR_GPT_VISION_FALLBACK=true)
  → else if DMS_OCR_GPT_VISION_FALLBACK=true AND gptProvider.isConfigured():
      → gptProvider.analyze({ imageFiles: pages, ... })
      → providerCode = "vision"
  → else:
      → return { text: "", providerCode: "noop", method: "provider_not_configured" }

Image (JPEG/PNG/WebP/TIFF/GIF):
  → same as scanned PDF path above

Unknown MIME:
  → return { text: "", method: "unsupported_mime", providerCode: "noop" }
```

### 9.3 New file: `src/lib/dms/ocr/azure-ocr-provider.ts`

Wraps `AzureDocumentIntelligenceAdapter.analyzeWithAzureOcr()` to implement `IOcrProvider`:

```typescript
export class AzureOcrProvider implements IOcrProvider {
  readonly providerCode: OcrProviderCode = "azure_doc_intel";
  readonly providerName = "Azure Document Intelligence";
  readonly supportedMimeTypes = [
    "application/pdf", "image/jpeg", "image/png",
    "image/webp", "image/tiff", "image/gif"
  ];

  constructor(private adapter: AzureDocumentIntelligenceAdapter) {}

  isConfigured(): boolean { return this.adapter.isConfigured(); }
  supports(mimeType: string): boolean { return this.supportedMimeTypes.includes(...); }
  async extractText(input: OcrInput): Promise<OcrResult> {
    // Convert buffer to base64 and call analyzeWithAzureOcr
    ...
  }
}
```

### 9.4 Modified: `triggerDmsOcrForFile`

After routing decision is delegated to `routeOcr()`:
- Still creates `dms_ai_extraction_jobs` record
- Calls `routeOcr()` instead of inline GPT calls
- `persistFileOcrResult()` is unchanged — same call as today
- `ocr_provider` now records actual provider used (`pdf_text`, `azure_doc_intel`, or `vision`)

### 9.5 How `OcrProviderCode` must be extended

Current: `"pdf_text" | "vision" | "tesseract" | "azure_doc_intel" | "noop"`

No change needed to the type — `"azure_doc_intel"` is already defined. ✅

The `OcrProviderCode` type in `persist-file-ocr-result.ts` param also allows `"ai_intake"` and `"ai_analysis"` as string — no change needed there either. ✅

---

## 10. Feature Flag Plan

### New flags needed (migration required)

| Feature Code | Default | Purpose |
|-------------|---------|---------|
| `DMS_OCR_AZURE` | `false` | Enable Azure Document Intelligence for scanned PDFs/images |
| `DMS_OCR_GPT_VISION_FALLBACK` | `true` | Allow GPT-4.1 vision as fallback when Azure disabled or fails |
| `DMS_OCR_ROUTER` | `false` | Enable new OCR router (gates the entire Phase 10 routing logic) |

### Existing flags (no change)

| Feature Code | Current | Phase 10 role |
|-------------|---------|--------------|
| `DMS_OCR` | `true` | Master OCR gate — unchanged |

### Behavior matrix

| `DMS_OCR_ROUTER` | `DMS_OCR_AZURE` | `DMS_OCR_GPT_VISION_FALLBACK` | Effect |
|-----------------|----------------|------------------------------|--------|
| false | any | any | **Current behavior** — all files to GPT-4.1 (no change) |
| true | false | true | Text-layer fast path + GPT-4.1 for scanned (existing GPT behavior) |
| true | true | true | Three-tier: local → Azure → GPT fallback |
| true | true | false | Three-tier: local → Azure; fail if Azure fails |

**Rollout:** Enable `DMS_OCR_ROUTER=true` only after UAT confirms text-layer fast path works correctly.

---

## 11. Provider Config / AI Settings Plan

### New provider config row needed

```sql
INSERT INTO public.erp_ai_provider_configs
  (config_code, provider_type, provider_name, purpose, model_id,
   api_endpoint, api_version, secret_ref, is_enabled, is_active,
   requires_human_review, notes)
VALUES
  ('ARABIC_OCR_AZURE',
   'azure_document_intelligence',
   'Azure Document Intelligence (OCR)',
   'DMS document OCR — scanned PDFs, images, Arabic documents',
   'prebuilt-read',
   NULL,  -- admin must enter endpoint URL
   '2024-11-30',
   'AZURE_DOCUMENT_INTELLIGENCE_KEY',  -- env var name
   false,  -- disabled until admin configures endpoint and sets key
   true,
   true,
   'Phase 10 — OCR router Azure provider. Set api_endpoint to your Azure DI endpoint URL. Set AZURE_DOCUMENT_INTELLIGENCE_KEY env var. Enable is_enabled when ready.'
  )
ON CONFLICT (config_code) DO NOTHING;
```

### Config code naming

The factory already checks `ARABIC_OCR_AZURE` as the first priority for Azure DI. The OCR router will use the same code. No new config code is needed.

### Admin UI changes

Minimal — in the existing AI Settings admin page:
- `ARABIC_OCR_AZURE` row will appear once migrated
- Admin can set the endpoint URL and enable/disable through existing UI
- `last_test_status` / `last_test_at` columns can be used with existing Test Connection if wired

### Secret management rules (unchanged)

- API key stored only in environment variable `AZURE_DOCUMENT_INTELLIGENCE_KEY`
- Only `secret_ref = "AZURE_DOCUMENT_INTELLIGENCE_KEY"` stored in DB
- Key never returned to client
- Masked preview only if admin explicitly enters it

---

## 12. Queue Integration Plan

### Phase 10A — Synchronous OCR (no queue changes)

All existing OCR paths remain synchronous. The OCR router is introduced but calls are inline.

| Path | Phase 10A |
|------|-----------|
| Manual file OCR | Sync — router inline |
| Intake OCR | Sync — router inline |
| Approval-time OCR | Sync — router inline (non-fatal) |
| Post-approval content sync | No change (already separate via Phase 9) |

### Phase 10B — Queued admin OCR backfill (deferred)

Add new Phase 9 job type: `ocr_backfill`

```typescript
// Job type (Phase 10B addition to job-types.ts)
OCR_BACKFILL: "ocr_backfill",
```

Payload: `{ fileId, documentId, forceRetry: boolean }`

Handler: `ocr-backfill.handler.ts` — calls `routeOcr()` using admin client, then `persistFileOcrResult()`.

**Phase 10B is NOT part of Phase 10A implementation. Requires a separate approved prompt.**

---

## 13. Database Schema Review

### Current `dms_document_files` OCR columns (verified live)

| Column | Type | Notes |
|--------|------|-------|
| `ocr_status` | text | Sufficient |
| `ocr_text` | text | Sufficient — capped at 500,000 chars in persist helper |
| `ocr_provider` | text | Sufficient — will now record `pdf_text`, `azure_doc_intel`, or `vision` |
| `ocr_model` | text | Sufficient — will record `pdf-parse@text-layer`, `prebuilt-read`, or `gpt-4.1` |
| `ocr_started_at` | timestamptz | Sufficient |
| `ocr_completed_at` | timestamptz | Sufficient |
| `ocr_error_message` | text | Sufficient |
| `ocr_confidence` | numeric | Sufficient |
| `ocr_page_count` | integer | Sufficient |
| `ocr_language` | text | Sufficient |

### New columns — NOT recommended in Phase 10A

| Column | Decision | Reason |
|--------|----------|--------|
| `ocr_provider_route` | ❌ Skip | `ocr_provider` already tracks this |
| `ocr_fallback_used` | ❌ Skip | Can be inferred from provider field |
| `ocr_layout_json` | ❌ Skip | Raw Azure response — confidentiality/RLS risk; no clear use case yet |
| `ocr_page_json` | ❌ Skip | Same as above |
| `ocr_cost_estimate` | ❌ Skip | Phase 14 (cost observability) — not Phase 10 |
| `ocr_attempt_id` | ❌ Skip | Phase 10B (queue integration) — not Phase 10A |

**Conclusion: No schema migration needed for Phase 10A.** The existing columns fully support the new routing. The `ocr_provider` column will simply record different values (`pdf_text`, `azure_doc_intel`, `vision`) than it does today (only `vision`).

Schema migration needed only for:
1. New feature flags (3 rows in `erp_ai_feature_flags`)
2. New provider config row (`ARABIC_OCR_AZURE` in `erp_ai_provider_configs`)

---

## 14. OCR Result Normalization Plan

### Current state

`OcrResult` in `ocr/types.ts` is already a good normalized interface:

```typescript
export interface OcrResult {
  text:       string;
  pages?:     OcrPage[];
  pageCount?: number;
  confidence?: number;
  language?:  string;
  model?:     string;
}
```

### Additions needed

```typescript
export interface OcrResult {
  text:          string;
  pages?:        OcrPage[];
  pageCount?:    number;
  confidence?:   number;
  language?:     string;
  model?:        string;
  // Phase 10 additions:
  sourceKind?:   "digital" | "scanned" | "image" | "office";  // helps UI display route
  isTruncated?:  boolean;   // true if text was capped
  warnings?:     string[];  // safe, non-sensitive warnings (e.g. "PDF text layer sparse")
  fallbackUsed?: boolean;   // true when Azure failed and GPT took over
}
```

### Rules (unchanged from current)

- `persistFileOcrResult` remains the single persistence path — all providers go through it
- `writeDocumentContentTextSystem` remains the document-level content sync path
- OCR text capped at 500,000 chars before persistence
- Metadata extraction consumes only normalized text from `dms_document_content`

---

## 15. Error Handling and Fallback Plan

### Safe error codes for OCR router

| Error Code | Trigger | Retryable |
|-----------|---------|----------|
| `provider_not_configured` | No provider available for file type | No |
| `provider_disabled` | Provider exists but `is_enabled=false` | No |
| `azure_endpoint_missing` | Config row has no `api_endpoint` | No |
| `azure_key_missing` | Env var for `secret_ref` not set | No |
| `azure_timeout` | Azure polling timed out (50s) | Yes |
| `azure_rate_limit` | Azure returned 429 | Yes |
| `azure_analysis_failed` | Azure returned `status: "failed"` | Yes |
| `pdf_render_failed` | `convertPdfPagesToImages` failed | Yes |
| `vision_fallback_failed` | GPT-4.1 call failed | Yes |
| `unsupported_mime_type` | File type not in any provider's supported list | No |
| `no_text_extracted` | OCR completed but returned empty text | No (not an error per se) |

### Fallback chain

```
Azure fails (timeout/error):
  → if DMS_OCR_GPT_VISION_FALLBACK=true:
      → try GPT-4.1 vision
      → if success: result.fallbackUsed = true
      → if fail: mark failed with error code
  → else:
      → mark failed with azure_* error code

Azure not configured:
  → if DMS_OCR_GPT_VISION_FALLBACK=true:
      → go straight to GPT-4.1 vision (current behavior)
  → else:
      → mark failed with provider_not_configured
```

### Rules

- Raw Azure response body never stored in DB
- Raw stack traces never stored in DB
- Error messages capped at 500 chars
- Azure analysis result JSON (`result.analyzeResult`) extracted to text only — raw JSON discarded
- OCR text is not logged in audit records (existing rule preserved)

---

## 16. UI / UX Plan

### Document OCR tab — provider badge

Current: shows `ocr_provider` as raw text (e.g. "vision").  
Planned change: map provider codes to human-readable labels:

| `ocr_provider` value | Badge label |
|---------------------|------------|
| `pdf_text` | "Local Text Layer" |
| `azure_doc_intel` | "Azure Document Intelligence" |
| `vision` | "GPT Vision" |
| `vision` + fallback flag | "GPT Vision (Azure fallback)" |
| `noop` | "Not Configured" |

The `ocr_provider` column is already surfaced in the OCR tab. This is a cosmetic change to a mapping function.

### Admin Intelligence / OCR admin

No major change. Provider route will be visible via `ocr_provider` in the existing OCR job table.

### AI Settings admin

When the `ARABIC_OCR_AZURE` provider config row exists (after migration), it will automatically appear in the existing AI Settings provider list. Admin can set the endpoint and enable it. No new UI page needed.

### What is NOT changing

- No new OCR tab UI design
- No Re-run OCR dropdown changes beyond provider badge
- No cost dashboard
- No Azure test result detailed UI
- No major DMS page redesign

---

## 17. Security and Confidentiality Plan

| Rule | Status |
|------|--------|
| Azure API key stored only in env var via `secret_ref` | ✅ Enforced in `AzureDocumentIntelligenceAdapter.isConfigured()` |
| Raw Azure response body not stored | ✅ `extractTextFromAzureResult()` extracts text only, discards JSON |
| Raw OCR text not logged | ✅ Existing rule — preserved |
| Confidential document OCR text gated by `dms.documents.view` | ✅ Existing RLS — no change |
| `triggerDmsOcrForFile` requires `dms.documents.ocr.trigger` or `dms.documents.edit` | ✅ Existing check — no change |
| Worker context (Phase 10B): uses `createAdminClient()` after system-level check | ✅ Consistent with Phase 9 pattern |
| `AZURE_DOCUMENT_INTELLIGENCE_KEY` env var must not be logged | Must be documented in `.env.example` |

---

## 18. Backward Compatibility Plan

| Scenario | Behavior |
|---------|---------|
| `DMS_OCR_ROUTER=false` (default after migration) | Exact current behavior — all files to GPT-4.1 |
| `DMS_OCR_ROUTER=true`, `DMS_OCR_AZURE=false`, `DMS_OCR_GPT_VISION_FALLBACK=true` | Text-layer fast path for PDFs; GPT for scanned/images |
| `DMS_OCR_ROUTER=true`, `DMS_OCR_AZURE=true`, Azure not configured | Azure check fails → GPT fallback |
| Azure configured but `DMS_OCR_AZURE=false` | Azure not used; GPT path |
| `DMS_OCR=false` | No OCR anywhere (existing master gate) |
| Phase 9 queue not yet applied | Phase 10A has no dependency on Phase 9 tables |

**Zero behavior change until `DMS_OCR_ROUTER=true` is set. Safe to deploy code and migrate flags before enabling.**

---

## 19. Recommended Corrected Phase 10 Implementation Scope

### Phase 10A (this phase)

| Item | Deliverable |
|------|------------|
| New file | `src/lib/dms/ocr/azure-ocr-provider.ts` — wraps `AzureDocumentIntelligenceAdapter` as `IOcrProvider` |
| New file | `src/lib/dms/ocr/ocr-router.ts` — `routeOcr()` with three-tier logic |
| Modified | `src/server/actions/dms/ocr.ts` — `triggerDmsOcrForFile` uses `routeOcr()` |
| Modified | `src/lib/dms/approve/approve-ai-intake.ts` — approval-time OCR uses `routeOcr()` |
| Modified | `src/server/actions/dms/ai-intake.ts` — intake OCR uses `routeOcr()` |
| Modified | `src/lib/dms/ocr/types.ts` — add `sourceKind`, `fallbackUsed`, `warnings`, `isTruncated` to `OcrResult` |
| Migration | 1 migration: 3 feature flag rows + 1 provider config row |
| No schema change | No new columns on `dms_document_files` |

### Phase 10B (separate phase, requires separate prompt)

| Item | Deliverable |
|------|------------|
| New job type | `OCR_BACKFILL` in `job-types.ts` |
| New handler | `ocr-backfill.handler.ts` |
| Modified | `intelligence-admin.ts` — admin backfill enqueues jobs instead of running inline |

---

## 20. Implementation Sequence for Future Phase 10 Execution

1. Read this plan and the Phase 9 implementation report
2. Read `src/lib/dms/ocr/types.ts` — extend `OcrResult` with new fields
3. Create `src/lib/dms/ocr/azure-ocr-provider.ts` implementing `IOcrProvider`
4. Create `src/lib/dms/ocr/ocr-router.ts` with `routeOcr()` and `OcrFeatureFlags`
5. Write migration: `20260622160000_erp_dms_ai_phase10_ocr_flags_and_provider.sql`
   - Insert `DMS_OCR_AZURE`, `DMS_OCR_GPT_VISION_FALLBACK`, `DMS_OCR_ROUTER` flags
   - Insert `ARABIC_OCR_AZURE` provider config row
6. Modify `triggerDmsOcrForFile` — replace inline GPT block with `routeOcr()` call
7. Modify approval-time OCR in `approve-ai-intake.ts` — same router
8. Modify intake OCR in `ai-intake.ts` — same router
9. Modify `batch-intake.ts` if it has its own inline OCR calls
10. Run `npx tsc --noEmit` — must be clean
11. Run ESLint — must be clean
12. Test: digital PDF → `pdf_text` provider (no GPT call)
13. Test: scanned PDF with `DMS_OCR_AZURE=false` → GPT-4.1 (existing behavior)
14. Test: scanned PDF with `DMS_OCR_AZURE=true` + Azure configured → Azure
15. Write implementation report

---

## 21. Acceptance Criteria for Future Implementation

| Code | Criterion |
|------|-----------|
| AC-01 | Digital PDFs with text layer use local extraction — `ocr_provider = "pdf_text"`, no GPT call |
| AC-02 | Scanned PDFs/images use Azure Document Intelligence when `DMS_OCR_AZURE=true` and configured |
| AC-03 | GPT vision fallback is available when Azure is disabled or fails (`DMS_OCR_GPT_VISION_FALLBACK=true`) |
| AC-04 | Existing single-file intake OCR flow remains functional |
| AC-05 | Existing batch intake OCR flow remains functional |
| AC-06 | Existing manual OCR re-run (`triggerDmsOcrForFile`) remains functional |
| AC-07 | `persistFileOcrResult` remains the single persistence path — all router branches call it |
| AC-08 | `writeDocumentContentTextSystem` remains the document-level content sync path |
| AC-09 | OCR text, prompts, raw Azure responses, and API keys are not logged |
| AC-10 | Azure API key is resolved from env var only via `secret_ref` |
| AC-11 | `DMS_OCR_ROUTER=false` (default) preserves current behavior exactly |
| AC-12 | Confidential OCR text remains gated by existing RLS and permission checks |
| AC-13 | `npx tsc --noEmit` passes after implementation |

---

## 22. Full Test Plan

### T-01: Digital PDF text-layer fast path

**Purpose:** Confirm digital PDFs use local extraction and skip GPT  
**Setup:** `DMS_OCR_ROUTER=true`, `DMS_OCR_AZURE=false`  
**Steps:**
1. Upload a digitally-created PDF (not scanned)
2. Trigger OCR via "Run OCR" button on document record
3. Observe `dms_document_files.ocr_provider`

**Expected result:** `ocr_provider = "pdf_text"`, `ocr_model = "pdf-parse@text-layer"`, text extracted  
**DB state:** `ocr_status = "complete"`, `ocr_text` populated  
**Risk covered:** AC-01, cost reduction for digital PDFs

---

### T-02: Scanned PDF — GPT fallback when Azure disabled

**Purpose:** Confirm existing behavior preserved when router enabled but Azure disabled  
**Setup:** `DMS_OCR_ROUTER=true`, `DMS_OCR_AZURE=false`, `DMS_OCR_GPT_VISION_FALLBACK=true`  
**Steps:**
1. Upload a scanned PDF (no text layer)
2. Trigger OCR

**Expected result:** `ocr_provider = "vision"`, `ocr_model = "gpt-4.1"`, text extracted (if any)  
**Risk covered:** AC-03, AC-11 backward compat

---

### T-03: Scanned PDF — Azure primary

**Purpose:** Confirm Azure DI is used when configured and enabled  
**Setup:** `DMS_OCR_ROUTER=true`, `DMS_OCR_AZURE=true`, Azure configured  
**Steps:**
1. Upload scanned PDF
2. Trigger OCR

**Expected result:** `ocr_provider = "azure_doc_intel"`, `ocr_model = "prebuilt-read"`, `fallbackUsed = false`  
**DB state:** `ocr_status = "complete"`  
**Risk covered:** AC-02

---

### T-04: Azure timeout — GPT fallback

**Purpose:** Confirm GPT fallback fires when Azure times out  
**Setup:** `DMS_OCR_AZURE=true` but Azure endpoint returns 408 / poll never succeeds  
**Expected result:** `ocr_provider = "vision"`, `fallbackUsed = true`, `ocr_status = "complete"` or `"failed"`  
**Risk covered:** AC-03, error handling

---

### T-05: Image OCR — JPEG

**Purpose:** Confirm JPEG images use Azure or GPT  
**Setup:** `DMS_OCR_ROUTER=true`, `DMS_OCR_AZURE=true`  
**Steps:** Upload JPEG → OCR  
**Expected:** `ocr_provider = "azure_doc_intel"` or `"vision"` (fallback)  
**Risk covered:** AC-02

---

### T-06: Office document — DOCX

**Purpose:** Confirm DOCX uses local extraction  
**Setup:** Any  
**Steps:** Upload DOCX → OCR  
**Expected:** `ocr_provider = "pdf_text"`, `ocr_model = "local-mammoth"`, text extracted  
**Risk covered:** AC-01 (office docs also go text-layer fast path)

---

### T-07: Single-file intake still works

**Purpose:** Confirm intake OCR flow unchanged  
**Setup:** Any feature flag state  
**Steps:** Upload → Start AI Analysis  
**Expected:** Intake completes normally, review screen loads  
**Risk covered:** AC-04

---

### T-08: Batch intake still works

**Purpose:** Confirm batch intake unchanged  
**Setup:** Any  
**Steps:** Batch upload → process  
**Expected:** Batch completes normally  
**Risk covered:** AC-05

---

### T-09: Approval-time OCR works

**Purpose:** Confirm OCR during approval is non-fatal and uses router  
**Steps:** Approve a document → check `dms_document_files.ocr_provider`  
**Expected:** OCR runs, `ocr_status = "complete"` or `"failed"` (non-fatal if failed)  
**Risk covered:** AC-06

---

### T-10: Router disabled — exact current behavior

**Purpose:** Confirm zero change when `DMS_OCR_ROUTER=false`  
**Steps:** Keep flag false → run all OCR paths  
**Expected:** All files use GPT-4.1 as before, `ocr_provider = "vision"`  
**Risk covered:** AC-11

---

### T-11: No sensitive logging

**Purpose:** Confirm OCR text not logged  
**Steps:** Run OCR on any file, check `audit_logs`, `erp_ai_usage_logs`, application logs  
**Expected:** No OCR text in any log table  
**Risk covered:** AC-09

---

### T-12: Content sync after Azure OCR

**Purpose:** Confirm `dms_document_content` is updated after Azure OCR  
**Steps:** Azure OCR completes → check `dms_document_content.content_text`  
**Expected:** Content updated  
**Risk covered:** AC-08

---

### T-13: Confidentiality gate

**Purpose:** Confirm OCR text view still gated for confidential docs  
**Setup:** Mark document confidential  
**Steps:** Try to view OCR text as non-admin user  
**Expected:** Access denied  
**Risk covered:** AC-12

---

### T-14: typecheck/build

**Steps:** `npx tsc --noEmit`  
**Expected:** 0 errors  
**Risk covered:** AC-13

---

## 23. Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Azure DI polling is slow (up to 50s per file) | Medium | Already handled with `AZURE_TIMEOUT_MS=60000` in adapter; fallback to GPT if timeout |
| PDF text layer detection false positives (sparse text counted as digital) | Low | `isPdfTextEmpty()` already exists in codebase — router should call it |
| Azure endpoint not configured → all scanned PDFs fail | Low | Flag default `false`; fallback to GPT when Azure disabled |
| Intake OCR takes too long with Azure polling | Medium | Intake keeps synchronous GPT path; Azure only applies to `triggerDmsOcrForFile` and approval-time paths |
| `ocr_provider` column has no CHECK constraint | Low | No enforcement needed — provider codes are informational strings |
| TIFF files fail Azure (Azure accepts JPEG/PNG/PDF) | Medium | TIFF already converted to PNG by `extractFileContent` before any provider call |

---

## 24. What Must Not Be Implemented in Phase 10

```
✗ Apply-to-ERP writes
✗ Semantic chunking implementation
✗ Review queue activation
✗ Token/cost dashboard
✗ Full observability dashboard
✗ Auto-approval
✗ Auto-save AI suggestions
✗ Moving intake OCR fully async without separate UX plan
✗ Storing raw Azure provider JSON without sanitization
✗ Logging OCR text
✗ Logging prompts
✗ Logging API keys
✗ Major UI redesign
✗ Phase 10B queue backfill (separate phase, separate prompt)
```

---

## 25. Corrected Roadmap After Phase 10

| Phase | Name | Status |
|-------|------|--------|
| Phase 1 | Stabilization | ✅ CLOSED |
| Phase 2 | Metadata Definitions Upgrade | ✅ CLOSED |
| Phase 3 | Metadata-Aware Classification | ✅ CLOSED |
| Phase 4 | Transactional Approve & Save | ✅ CLOSED |
| Phase 5 | Orchestration Unification | ✅ CLOSED |
| Phase 6 | AI Analysis Apply-to-Metadata | ✅ CLOSED |
| Phase 7 | Apply History | ✅ CLOSED |
| Phase 8 | ERP Mapping Registry (Read-only) | ✅ CLOSED |
| Phase 9 | Async AI Job Queue | ✅ CODE COMPLETE — migrations pending live apply |
| **Phase 10A** | **OCR Pipeline Upgrade / Azure OCR Wiring** | **PLANNED** |
| Phase 10B | Queue-backed Admin OCR Backfill | PLANNED (after 10A stable) |
| Phase 11 | ERP Mapping Apply-to-ERP Writes | FUTURE |
| Phase 12 | Token/Cost Observability (erp_ai_usage_logs) | FUTURE |

---

## 26. Recommended Next Cursor Implementation Prompt

The next implementation prompt should:

```text
Title: ERP DMS AI Phase 10A — OCR Pipeline Upgrade / Azure OCR Wiring Implementation

Scope:
  - Create src/lib/dms/ocr/azure-ocr-provider.ts
  - Create src/lib/dms/ocr/ocr-router.ts
  - Modify triggerDmsOcrForFile to use routeOcr()
  - Modify approval-time OCR in approve-ai-intake.ts
  - Modify intake OCR in ai-intake.ts (for consistency)
  - Add OcrResult.sourceKind / fallbackUsed / warnings / isTruncated
  - Create migration for 3 feature flags + ARABIC_OCR_AZURE provider config
  - DMS_OCR_ROUTER defaults to false
  - tsc + ESLint must pass

Forbidden:
  - Phase 10B queue backfill
  - Apply-to-ERP writes
  - New schema columns on dms_document_files
  - Storing raw Azure JSON
  - Logging OCR text or prompts
```

---

## 27. Final Recommendation

**Phase 10A is safe, incremental, and high-value.** The two biggest wins are:

1. **Text-layer fast path** — digital PDFs skip GPT-4.1 entirely. This is a cost reduction that requires no Azure configuration and no risk. The `extractFileContent` already detects text layers; we just need the router to act on that result before calling GPT.

2. **Azure wiring** — the adapter, factory function, and all plumbing already exist. What's missing is the `ocr-router.ts` call path and the `ARABIC_OCR_AZURE` DB row. The router is feature-flag gated (`DMS_OCR_ROUTER=false` by default) so the live system is unaffected until explicitly enabled.

**Recommended migration approach:**
1. Apply Phase 9 migrations (prerequisite for UAT, not for Phase 10A code)
2. Implement Phase 10A code
3. Apply Phase 10A migration (flags + provider config)
4. UAT with `DMS_OCR_ROUTER=true`, `DMS_OCR_AZURE=false` → confirm text-layer fast path
5. Configure Azure endpoint + key → enable `DMS_OCR_AZURE=true` → UAT scanned PDF path
6. Enable in production
