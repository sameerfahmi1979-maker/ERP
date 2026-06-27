/**
 * DMS Phase 10A — OCR Router
 *
 * Central routing function for all DMS OCR operations.
 * Decides which provider to use based on:
 *   - File MIME type
 *   - Whether the PDF has a text layer (digital vs scanned)
 *   - Feature flags (DMS_OCR_ROUTER, DMS_OCR_AZURE, DMS_OCR_GPT_VISION_FALLBACK)
 *   - Provider availability (Azure configured, GPT configured)
 *
 * Three-tier routing:
 *   1. Digital PDF / Office docs → local text extraction (zero AI cost)
 *   2. Scanned PDF / images → Azure Document Intelligence (when configured + enabled)
 *   3. Scanned PDF / images → GPT-4.1 vision fallback (when Azure disabled or fails)
 *
 * Security rules:
 *   - Raw OCR text is never logged.
 *   - Raw Azure responses are never stored.
 *   - API keys are never logged or passed through this module.
 *   - Error messages are sanitized (safe strings only).
 *
 * Rollback: when DMS_OCR_ROUTER=false, all callers must use their legacy path.
 * This module is only called when the router flag is explicitly enabled.
 */

import type { IOcrProvider } from "./types";
import type { IDmsAiProvider } from "@/lib/dms/ai/types";
import { extractFileContent } from "@/lib/dms/file-content-extractor";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OcrFeatureFlags {
  /** Master OCR gate. If false, OCR is disabled. */
  dmsOcr: boolean;
  /** Whether the new OCR router is active. */
  dmsOcrRouter: boolean;
  /** Whether Azure Document Intelligence should be tried for scanned PDFs/images. */
  dmsOcrAzure: boolean;
  /** Whether GPT-4.1 vision may be used as fallback when Azure fails or is disabled. */
  dmsOcrGptVisionFallback: boolean;
}

export interface OcrRouterInput {
  /** Raw file buffer. */
  buffer: Buffer;
  /** MIME type of the file. */
  mimeType: string;
  /** Original file name (used for diagnostics and extraction hints). */
  fileName: string;
  /** Resolved feature flags. */
  featureFlags: OcrFeatureFlags;
  /** Azure DI OCR provider (implements IOcrProvider). Null if not configured. */
  azureProvider?: IOcrProvider | null;
  /** GPT-4.1 provider for vision OCR fallback. Null if not configured. */
  gptProvider?: IDmsAiProvider | null;
}

export interface OcrRouterResult {
  /** Extracted text — may be empty if no text was found. */
  text: string;
  /** Provider code that produced the result. */
  providerCode: string;
  /** Model identifier used (e.g. "pdf-parse@text-layer", "prebuilt-read", "gpt-4.1"). */
  model: string | null;
  /** Extraction method (diagnostic, not stored). */
  method: string;
  /** Confidence score if available. */
  confidence?: number | null;
  /** Page count if available. */
  pageCount?: number | null;
  /** Detected language if available. */
  language?: string | null;
  /** How the source document was classified. */
  sourceKind: "digital" | "scanned" | "image" | "office" | "unknown";
  /** True when Azure was configured but failed, and GPT vision was used as fallback. */
  fallbackUsed: boolean;
  /** Safe, non-sensitive warnings. Never contain document content. */
  warnings: string[];
}

// ── MIME type helpers ─────────────────────────────────────────────────────────

const IMAGE_MIMES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/webp",
  "image/gif", "image/tiff", "image/tif",
]);

const OFFICE_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

function normalizeMime(mimeType: string): string {
  return mimeType.toLowerCase().split(";")[0].trim();
}

function isImageMime(mime: string): boolean {
  return IMAGE_MIMES.has(mime);
}

function isOfficeMime(mime: string): boolean {
  return OFFICE_MIMES.has(mime);
}

function isPdfMime(mime: string): boolean {
  return mime === "application/pdf";
}

// ── Router ────────────────────────────────────────────────────────────────────

/**
 * Route an OCR request to the best available provider.
 *
 * Must only be called when DMS_OCR_ROUTER=true.
 * Callers must check featureFlags.dmsOcrRouter before calling.
 */
export async function routeOcr(input: OcrRouterInput): Promise<OcrRouterResult> {
  const { buffer, mimeType, fileName, featureFlags, azureProvider, gptProvider } = input;
  const mime = normalizeMime(mimeType);

  // ── Step 1: Local fast path — office documents ────────────────────────────
  // DOCX, XLSX, DOC, XLS: always use local extraction, never send to AI for OCR.
  if (isOfficeMime(mime)) {
    const content = await extractFileContent(buffer, mime, fileName);
    const text = content.text.trim();
    return {
      text,
      providerCode: "pdf_text",
      model: "local-office-extraction",
      method: content.method,
      sourceKind: "office",
      fallbackUsed: false,
      warnings: text.length === 0 ? ["Office document produced no text"] : [],
    };
  }

  // ── Step 2: PDF — detect text layer ──────────────────────────────────────
  if (isPdfMime(mime)) {
    const content = await extractFileContent(buffer, mime, fileName);

    if (content.method === "pdf-text-layer") {
      // Digital PDF: has an embedded text layer — use it, no AI call needed.
      const text = content.text.trim();
      return {
        text,
        providerCode: "pdf_text",
        model: "pdf-parse@text-layer",
        method: "pdf-text-layer",
        pageCount: null,
        sourceKind: "digital",
        fallbackUsed: false,
        warnings: [],
      };
    }

    // Scanned PDF: no text layer — need Azure or GPT vision for OCR.
    // Fall through to the scanned/image routing below with rendered page images.
    if (content.images.length > 0) {
      return routeScannedOrImage(
        { buffer, mimeType: mime, fileName, featureFlags, azureProvider, gptProvider },
        content.images,
        "scanned"
      );
    }

    // PDF with no text and no renderable pages (corrupted or empty)
    return {
      text: "",
      providerCode: "noop",
      model: null,
      method: "pdf-no-content",
      sourceKind: "scanned",
      fallbackUsed: false,
      warnings: ["PDF could not be rendered — file may be corrupted or empty"],
    };
  }

  // ── Step 3: Native images ────────────────────────────────────────────────
  if (isImageMime(mime)) {
    const content = await extractFileContent(buffer, mime, fileName);
    if (!content.hasContent || content.images.length === 0) {
      return {
        text: "",
        providerCode: "noop",
        model: null,
        method: "image-no-content",
        sourceKind: "image",
        fallbackUsed: false,
        warnings: ["Image could not be processed — file may be corrupted"],
      };
    }

    return routeScannedOrImage(
      { buffer, mimeType: mime, fileName, featureFlags, azureProvider, gptProvider },
      content.images,
      "image"
    );
  }

  // ── Step 4: Unsupported MIME type ────────────────────────────────────────
  return {
    text: "",
    providerCode: "noop",
    model: null,
    method: `unsupported:${mime}`,
    sourceKind: "unknown",
    fallbackUsed: false,
    warnings: [`Unsupported MIME type for OCR: ${mime}`],
  };
}

// ── Scanned/image routing (Azure → GPT fallback) ─────────────────────────────

interface ExtractedImage {
  fileName: string;
  base64: string;
  mimeType: string;
}

async function routeScannedOrImage(
  input: OcrRouterInput,
  images: ExtractedImage[],
  sourceKind: "scanned" | "image"
): Promise<OcrRouterResult> {
  const { mimeType, fileName, featureFlags, azureProvider, gptProvider } = input;

  // ── Azure Document Intelligence ──────────────────────────────────────────
  if (featureFlags.dmsOcrAzure && azureProvider?.isConfigured() && azureProvider.supports(mimeType)) {
    try {
      const azureResult = await azureProvider.extractText({
        buffer: input.buffer,
        mimeType,
        fileName,
      });

      // Azure succeeded — return result.
      return {
        text: azureResult.text.trim(),
        providerCode: "azure_doc_intel",
        model: azureResult.model ?? "prebuilt-read",
        method: "azure-di",
        confidence: azureResult.confidence ?? null,
        pageCount: azureResult.pageCount ?? null,
        language: azureResult.language ?? null,
        sourceKind,
        fallbackUsed: false,
        warnings:
          azureResult.text.trim().length === 0
            ? ["Azure OCR completed but returned no text"]
            : [],
      };
    } catch (azureErr) {
      const safeErr = String(azureErr).slice(0, 200);

      // Azure failed — fallback to GPT if allowed.
      if (!featureFlags.dmsOcrGptVisionFallback) {
        return {
          text: "",
          providerCode: "azure_doc_intel",
          model: null,
          method: "azure-di-failed",
          sourceKind,
          fallbackUsed: false,
          warnings: [
            `Azure OCR failed and GPT vision fallback is disabled (${safeErr})`,
          ],
        };
      }

      // Fall through to GPT, mark fallbackUsed=true
      const gptResult = await tryGptVision(images, fileName, gptProvider);
      return { ...gptResult, sourceKind, fallbackUsed: true };
    }
  }

  // ── GPT-4.1 vision (primary when Azure disabled, fallback when Azure fails) ─
  if (featureFlags.dmsOcrGptVisionFallback) {
    const gptResult = await tryGptVision(images, fileName, gptProvider);
    return { ...gptResult, sourceKind, fallbackUsed: false };
  }

  // ── No provider available ────────────────────────────────────────────────
  return {
    text: "",
    providerCode: "noop",
    model: null,
    method: "provider_not_configured",
    sourceKind,
    fallbackUsed: false,
    warnings: [
      "No OCR provider is available for this file type. Enable DMS_OCR_AZURE or DMS_OCR_GPT_VISION_FALLBACK.",
    ],
  };
}

// ── GPT-4.1 vision helper ─────────────────────────────────────────────────────

async function tryGptVision(
  images: ExtractedImage[],
  fileName: string,
  gptProvider: IDmsAiProvider | null | undefined
): Promise<Omit<OcrRouterResult, "sourceKind" | "fallbackUsed">> {
  if (!gptProvider?.isConfigured()) {
    return {
      text: "",
      providerCode: "vision",
      model: null,
      method: "gpt-vision-not-configured",
      warnings: ["GPT-4.1 vision provider is not configured"],
    };
  }

  if (images.length === 0) {
    return {
      text: "",
      providerCode: "vision",
      model: gptProvider.modelId ?? "gpt-4.1",
      method: "gpt-vision-no-images",
      warnings: ["No images to process for GPT vision OCR"],
    };
  }

  const aiOutput = await gptProvider.analyze({
    ocrText: "",
    imageFiles: images,
    currentTypeCode: null,
    typeCandidates: [],
    metadataFields: [],
    originalFilename: fileName,
  });

  const transcription = aiOutput.extraction?.fullTextTranscription;
  const text = (transcription?.trim() ?? "");

  return {
    text,
    providerCode: "vision",
    model: gptProvider.modelId ?? "gpt-4.1",
    method: "gpt-vision",
    warnings: [],
  };
}

// ── Feature flag loader ───────────────────────────────────────────────────────

/**
 * Load OCR-specific feature flags from erp_ai_feature_flags.
 * Safe defaults: router=false (current behavior), azure=false, gptFallback=true.
 *
 * Requires a Supabase client with read access to erp_ai_feature_flags.
 * Use admin client in worker/system contexts; user client in request contexts.
 */
export async function loadOcrFeatureFlags(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<OcrFeatureFlags> {
  const OCR_FLAG_CODES = [
    "DMS_OCR",
    "DMS_OCR_ROUTER",
    "DMS_OCR_AZURE",
    "DMS_OCR_GPT_VISION_FALLBACK",
  ];

  try {
    const { data } = await supabase
      .from("erp_ai_feature_flags")
      .select("feature_code, is_enabled")
      .in("feature_code", OCR_FLAG_CODES);

    const flagMap = new Map<string, boolean>(
      ((data ?? []) as Array<{ feature_code: string; is_enabled: boolean }>).map(
        (r) => [r.feature_code, r.is_enabled]
      )
    );

    return {
      dmsOcr: flagMap.get("DMS_OCR") ?? true,
      dmsOcrRouter: flagMap.get("DMS_OCR_ROUTER") ?? false,
      dmsOcrAzure: flagMap.get("DMS_OCR_AZURE") ?? false,
      dmsOcrGptVisionFallback: flagMap.get("DMS_OCR_GPT_VISION_FALLBACK") ?? true,
    };
  } catch {
    // Safe fallback: preserve current behavior, router disabled.
    return { dmsOcr: true, dmsOcrRouter: false, dmsOcrAzure: false, dmsOcrGptVisionFallback: true };
  }
}
