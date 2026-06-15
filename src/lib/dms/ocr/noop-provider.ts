/**
 * DMS.9 — No-Op OCR Provider
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
