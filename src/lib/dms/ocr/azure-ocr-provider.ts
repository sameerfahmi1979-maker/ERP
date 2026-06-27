/**
 * DMS Phase 10A — Azure Document Intelligence OCR Provider
 *
 * Wraps AzureDocumentIntelligenceAdapter to implement the IOcrProvider interface.
 * Delegates to analyzeWithAzureOcr() for the actual HTTP call and result parsing.
 *
 * Security rules (same as the underlying adapter):
 *   - API key resolved from process.env[secretRef] — never stored or logged.
 *   - Raw Azure JSON response never stored — only extracted text is returned.
 *   - OCR text is never logged.
 *
 * Supported file types:
 *   PDF, JPEG, PNG, WebP, GIF, TIFF — same as Azure DI prebuilt-read.
 *
 * Not supported: DOCX, XLSX — use local extraction (extractFileContent) instead.
 */

import type { IOcrProvider, OcrInput, OcrResult, OcrProviderCode } from "./types";
import type { AzureDocumentIntelligenceAdapter } from "@/lib/dms/ai/azure-document-intelligence-adapter";

const AZURE_SUPPORTED_MIMES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/tiff",
  "image/tif",
];

export class AzureOcrProvider implements IOcrProvider {
  readonly providerCode: OcrProviderCode = "azure_doc_intel";
  readonly providerName = "Azure Document Intelligence";
  readonly supportedMimeTypes: string[] = AZURE_SUPPORTED_MIMES;

  constructor(private readonly adapter: AzureDocumentIntelligenceAdapter) {}

  isConfigured(): boolean {
    return this.adapter.isConfigured();
  }

  supports(mimeType: string): boolean {
    const normalized = mimeType.toLowerCase().split(";")[0].trim();
    return AZURE_SUPPORTED_MIMES.includes(normalized);
  }

  async extractText(input: OcrInput): Promise<OcrResult> {
    if (!this.isConfigured()) {
      throw new Error("Azure Document Intelligence provider is not configured.");
    }

    if (!this.supports(input.mimeType)) {
      throw new Error(
        `Azure Document Intelligence does not support MIME type: ${input.mimeType}`
      );
    }

    // Convert buffer to base64 for Azure API
    const base64 = input.buffer.toString("base64");

    const result = await this.adapter.analyzeWithAzureOcr(base64, input.mimeType);

    if (!result.success) {
      throw new Error(result.error ?? "Azure Document Intelligence extraction failed");
    }

    const text = (result.text ?? "").trim();

    return {
      text,
      model: "prebuilt-read",
      sourceKind: "scanned",
      fallbackUsed: false,
      method: "azure-di",
    };
  }
}
