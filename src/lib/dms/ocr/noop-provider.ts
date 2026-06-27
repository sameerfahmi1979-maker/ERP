/**
 * DMS.9 — No-Op OCR Provider
 *
 * Phase 1 inventory (2026-06-21): UNUSED — not imported by factory or OCR pipeline.
 * Active OCR uses GPT-4.1 vision via triggerDmsOcrForFile. Retained as fallback stub.
 *
 * Returned when no real OCR provider is configured.
 * Always marks the job as "provider_not_configured" so the UI can show a
 * clear message and the job record is still created for auditability.
 */

import type { IOcrProvider, OcrInput, OcrResult, OcrProviderCode } from "./types";

export class NoopOcrProvider implements IOcrProvider {
  readonly providerCode: OcrProviderCode = "noop";
  readonly providerName = "No OCR Provider Configured";
  readonly supportedMimeTypes: string[] = [];

  isConfigured(): boolean {
    return false;
  }

  supports(_mimeType: string): boolean {
    return false;
  }

  async extractText(_input: OcrInput): Promise<OcrResult> {
    return {
      text: "",
      pageCount: 0,
      model: "noop",
    };
  }
}
