/**
 * DMS Phase 10B — Shared System-Level OCR Processing Service
 *
 * Single entry point for executing OCR on a DMS document file using the
 * Phase 10A three-tier OCR router.  Designed for use from:
 *   - Worker context (ocr_backfill job handler, no user session)
 *   - Server action context (future: manual OCR refactor)
 *
 * Uses createAdminClient() for all DB operations — callers must ensure this
 * is only invoked after explicit permission checks (e.g. admin backfill) or
 * from the WORKER_SECRET-authenticated worker route.
 *
 * Security rules:
 *   - Never logs OCR text, document content, AI prompts, or API keys.
 *   - Never stores raw Azure/GPT responses.
 *   - All error messages are sanitized before return.
 *   - performedBy=0 is used for system/worker context (non-FK field in persist path).
 *
 * Content sync limitation:
 *   - writeDocumentContentTextSystem() is called via persistFileOcrResult().
 *   - In worker context, that function's internal createClient() uses anon session,
 *     which may fail RLS for dms_document_content upsert if DMS_CONTENT_TEXT_SYNC=true.
 *   - This is non-fatal: file-level OCR text is always persisted via admin client.
 *   - Content sync can be re-run separately via the Admin Content Backfill tool.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getDmsAiProvider, getAzureDocumentIntelligenceProvider } from "@/lib/dms/ai/factory";
import { loadOcrFeatureFlags, routeOcr } from "@/lib/dms/ocr/ocr-router";
import { AzureOcrProvider } from "@/lib/dms/ocr/azure-ocr-provider";
import { persistFileOcrResult } from "@/lib/dms/ocr/persist-file-ocr-result";
import type { OcrProviderCode } from "@/lib/dms/ocr/types";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ProcessDmsFileOcrSystemInput {
  /** dms_document_files.id (required). */
  fileId: number;
  /** dms_documents.id — loaded from DB if not supplied. */
  documentId?: number | null;
  /** Storage bucket — loaded from DB if not supplied. */
  storageBucket?: string | null;
  /** Storage path — loaded from DB if not supplied. */
  storagePath?: string | null;
  /** File name — loaded from DB if not supplied. */
  fileName?: string | null;
  /** MIME type — loaded from DB if not supplied. */
  mimeType?: string | null;
  /**
   * Audit user ID.
   * Use 0 in worker/system context — performedBy is not a FK and is only
   * forwarded to writeDocumentContentTextSystem which does not write it to the DB.
   */
  performedBy?: number | null;
  /** Source label for content sync audit. Defaults to "ocr". */
  source?: "ocr" | "ai_intake" | "admin_backfill";
  /**
   * If false (default), skip processing when the file already has ocr_text.
   * Set to true to force re-extraction even when text exists.
   */
  forceRetry?: boolean;
}

export interface ProcessDmsFileOcrSystemResult {
  success: boolean;
  /** Provider code that produced the result (e.g. "pdf_text", "azure_doc_intel", "vision", "noop"). */
  providerCode: string;
  /** Model identifier (e.g. "pdf-parse@text-layer", "prebuilt-read", "gpt-4.1"). */
  model: string | null;
  /** True if OCR produced non-empty text. */
  hasText: boolean;
  /** Document ID (resolved from DB if not provided). */
  documentId: number | null;
  /** File ID. */
  fileId: number;
  /** Error code for non-retryable/retryable classification. */
  errorCode?: string;
  /** Short safe message — no OCR text, no raw provider responses. */
  safeMessage?: string;
  /** True when the error is transient and the caller should retry. */
  retryable?: boolean;
}

// ── Retryable error codes ──────────────────────────────────────────────────────

const RETRYABLE_ERROR_CODES = new Set([
  "provider_timeout",
  "provider_rate_limit",
  "provider_unavailable",
  "network_error",
  "storage_download_failed",
  "database_error",
]);

function isRetryable(code: string): boolean {
  return RETRYABLE_ERROR_CODES.has(code);
}

function safeErrorCode(err: unknown): { code: string; message: string } {
  const msg = (err instanceof Error ? err.message : String(err)).slice(0, 300);
  if (/timeout|ETIMEDOUT/i.test(msg))           return { code: "provider_timeout",     message: "Request timed out." };
  if (/rate.?limit|429/i.test(msg))             return { code: "provider_rate_limit",  message: "Rate limit reached." };
  if (/unavailable|503|502/i.test(msg))         return { code: "provider_unavailable", message: "Provider unavailable." };
  if (/network|ECONNREFUSED|ENOTFOUND/i.test(msg)) return { code: "network_error",     message: "Network error." };
  if (/storage|download|blob/i.test(msg))       return { code: "storage_download_failed", message: "File download failed." };
  if (/database|db error/i.test(msg))           return { code: "database_error",       message: "Database error." };
  return { code: "unexpected",                  message: msg.slice(0, 200) };
}

// ── Main function ──────────────────────────────────────────────────────────────

/**
 * Runs OCR on a DMS document file using the Phase 10A three-tier router.
 * Uses createAdminClient() for all storage and DB operations.
 * Safe to call from worker context — no user session required.
 */
export async function processDmsFileOcrSystem(
  input: ProcessDmsFileOcrSystemInput
): Promise<ProcessDmsFileOcrSystemResult> {
  const { fileId, forceRetry = false } = input;
  const performedBy = input.performedBy ?? 0;

  const admin = createAdminClient();

  // ── 1. Load file row from DB (fill any missing fields) ─────────────────────

  let documentId    = input.documentId ?? null;
  let storageBucket = input.storageBucket ?? null;
  let storagePath   = input.storagePath  ?? null;
  let fileName      = input.fileName     ?? null;
  let mimeType      = input.mimeType     ?? null;

  const needsLoad = !documentId || !storagePath || !fileName || !mimeType;

  if (needsLoad) {
    const { data: fileRow, error: fileErr } = await admin
      .from("dms_document_files")
      .select("id, document_id, storage_bucket, storage_path, file_name, mime_type, ocr_text, deleted_at")
      .eq("id", fileId)
      .single();

    if (fileErr || !fileRow) {
      return { success: false, fileId, documentId, providerCode: "noop", model: null, hasText: false, errorCode: "file_not_found", safeMessage: "File not found in database.", retryable: false };
    }

    const row = fileRow as Record<string, unknown>;

    if (row.deleted_at) {
      return { success: false, fileId, documentId, providerCode: "noop", model: null, hasText: false, errorCode: "file_deleted", safeMessage: "File has been deleted.", retryable: false };
    }

    documentId    = documentId    ?? (row.document_id    as number | null);
    storageBucket = storageBucket ?? (row.storage_bucket as string | null) ?? "dms-documents";
    storagePath   = storagePath   ?? (row.storage_path   as string | null);
    fileName      = fileName      ?? (row.file_name      as string | null) ?? "file";
    mimeType      = mimeType      ?? (row.mime_type      as string | null) ?? "application/octet-stream";

    // Guard: skip if already has OCR text and forceRetry=false
    if (!forceRetry) {
      const existingText = (row.ocr_text as string | null)?.trim() ?? "";
      if (existingText.length > 0) {
        return {
          success:     true,
          fileId,
          documentId,
          providerCode: "noop",
          model:        null,
          hasText:      true,
          safeMessage:  "File already has OCR text. Skipped.",
        };
      }
    }
  }

  // ── 2. Validate storage path ────────────────────────────────────────────────

  if (!storagePath) {
    return { success: false, fileId, documentId, providerCode: "noop", model: null, hasText: false, errorCode: "missing_storage_path", safeMessage: "File has no storage path.", retryable: false };
  }

  // ── 3. Validate document exists and is not deleted ─────────────────────────

  if (documentId) {
    const { data: docRow, error: docErr } = await admin
      .from("dms_documents")
      .select("id, deleted_at")
      .eq("id", documentId)
      .single();

    if (docErr || !docRow) {
      return { success: false, fileId, documentId, providerCode: "noop", model: null, hasText: false, errorCode: "document_not_found", safeMessage: "Document not found.", retryable: false };
    }
    if ((docRow as Record<string, unknown>).deleted_at) {
      return { success: false, fileId, documentId, providerCode: "noop", model: null, hasText: false, errorCode: "document_not_found", safeMessage: "Document has been deleted.", retryable: false };
    }
  }

  // ── 4. Download file from storage ───────────────────────────────────────────

  let fileBuffer: Buffer;
  try {
    const bucket = storageBucket ?? "dms-documents";
    const { data: blob, error: downloadErr } = await admin.storage
      .from(bucket)
      .download(storagePath);

    if (downloadErr || !blob) {
      const msg = downloadErr?.message ?? "Download returned no data";
      // 404/object not found → non-retryable; all others → retryable
      const isObjectMissing = /not found|404|no such key/i.test(msg);
      return {
        success:     false,
        fileId,
        documentId,
        providerCode: "noop",
        model:        null,
        hasText:      false,
        errorCode:    "storage_download_failed",
        safeMessage:  isObjectMissing ? "File object not found in storage." : "File download failed.",
        retryable:    !isObjectMissing,
      };
    }

    fileBuffer = Buffer.from(await blob.arrayBuffer());
  } catch (downloadEx) {
    const { code, message } = safeErrorCode(downloadEx);
    return { success: false, fileId, documentId, providerCode: "noop", model: null, hasText: false, errorCode: code, safeMessage: message, retryable: isRetryable(code) };
  }

  // ── 5. Load OCR feature flags ───────────────────────────────────────────────

  const featureFlags = await loadOcrFeatureFlags(admin);

  if (!featureFlags.dmsOcr) {
    return { success: false, fileId, documentId, providerCode: "noop", model: null, hasText: false, errorCode: "ocr_disabled", safeMessage: "DMS OCR is disabled (DMS_OCR=false).", retryable: false };
  }

  // ── 6. Load AI providers ────────────────────────────────────────────────────

  let gptProvider;
  try {
    const { provider } = await getDmsAiProvider();
    gptProvider = provider.isConfigured() ? provider : null;
  } catch {
    gptProvider = null;
  }

  let azureOcrProvider = null;
  try {
    const { provider: azureAdapter } = await getAzureDocumentIntelligenceProvider();
    azureOcrProvider = azureAdapter ? new AzureOcrProvider(azureAdapter) : null;
  } catch {
    azureOcrProvider = null;
  }

  if (!gptProvider && !azureOcrProvider) {
    return { success: false, fileId, documentId, providerCode: "noop", model: null, hasText: false, errorCode: "provider_not_configured", safeMessage: "No OCR provider is configured.", retryable: false };
  }

  // ── 7. Route OCR ────────────────────────────────────────────────────────────

  let routerResult;
  try {
    routerResult = await routeOcr({
      buffer:       fileBuffer,
      mimeType:     mimeType!,
      fileName:     fileName!,
      featureFlags: {
        ...featureFlags,
        // Backfill handler always uses three-tier routing regardless of DMS_OCR_ROUTER flag.
        // The router flag only gates legacy path in triggerDmsOcrForFile; the backfill is a
        // new code path that opts into router behavior unconditionally.
        dmsOcrRouter: true,
      },
      azureProvider: azureOcrProvider,
      gptProvider,
    });
  } catch (routerEx) {
    const { code, message } = safeErrorCode(routerEx);
    return { success: false, fileId, documentId, providerCode: "noop", model: null, hasText: false, errorCode: code, safeMessage: message, retryable: isRetryable(code) };
  }

  // ── 8. Persist OCR result ───────────────────────────────────────────────────

  let persistResult;
  try {
    persistResult = await persistFileOcrResult({
      supabase:    admin,
      fileId,
      documentId:  documentId!,
      text:        routerResult.text || null,
      provider:    routerResult.providerCode as OcrProviderCode,
      model:       routerResult.model ?? null,
      performedBy,
      source:      "ocr",
    });
  } catch (persistEx) {
    const { code, message } = safeErrorCode(persistEx);
    return { success: false, fileId, documentId, providerCode: routerResult.providerCode, model: routerResult.model ?? null, hasText: false, errorCode: code, safeMessage: message, retryable: isRetryable(code) };
  }

  if (!persistResult.fileUpdated) {
    const errSummary = persistResult.errors.slice(0, 3).join("; ").slice(0, 200);
    return {
      success:     false,
      fileId,
      documentId,
      providerCode: routerResult.providerCode,
      model:        routerResult.model ?? null,
      hasText:      false,
      errorCode:    "database_error",
      safeMessage:  `OCR persist failed: ${errSummary}`,
      retryable:    true,
    };
  }

  return {
    success:     true,
    fileId,
    documentId,
    providerCode: routerResult.providerCode,
    model:        routerResult.model ?? null,
    hasText:      persistResult.hasText,
  };
}
