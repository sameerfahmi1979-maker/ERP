/**
 * DMS.9 — PDF Text Layer Provider
 *
 * Phase 1 inventory (2026-06-21): UNUSED — not imported by factory or OCR pipeline.
 * Active OCR uses GPT-4.1 vision via triggerDmsOcrForFile. Retained for a future
 * local/pdf-text fast path; do not wire without a dedicated phase prompt.
 *
 * Extracts embedded text from digital PDFs using pdf-parse v1 (pure JS, no
 * native binaries, no web worker required). Works only for PDFs that already
 * contain a text layer (i.e. digitally-created PDFs). Scanned-image PDFs
 * return empty text.
 *
 * pdf-parse v1 uses pdfjs-dist v2 which does NOT require DOMMatrix or a
 * web worker — making it fully compatible with Next.js server / serverless.
 *
 * API: pdfParse(buffer) → Promise<{ text, numpages, info }>
 */

import type { IOcrProvider, OcrInput, OcrResult, OcrProviderCode } from "./types";

const PDF_MIME_TYPES = ["application/pdf"];
const DEFAULT_MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

export class PdfTextProvider implements IOcrProvider {
  readonly providerCode: OcrProviderCode = "pdf_text";
  readonly providerName = "PDF Text Layer Extraction";
  readonly supportedMimeTypes: string[] = PDF_MIME_TYPES;

  isConfigured(): boolean {
    return true;
  }

  supports(mimeType: string): boolean {
    return PDF_MIME_TYPES.includes(mimeType.toLowerCase().split(";")[0].trim());
  }

  async extractText(input: OcrInput): Promise<OcrResult> {
    const maxSize = input.maxFileSizeBytes ?? DEFAULT_MAX_SIZE_BYTES;

    if (input.buffer.length > maxSize) {
      throw new Error(
        `PDF file exceeds maximum size for text extraction (${Math.round(input.buffer.length / 1024 / 1024)} MB > ${Math.round(maxSize / 1024 / 1024)} MB)`
      );
    }

    // Require from the internal lib path to bypass pdf-parse's test-file
    // self-check (which tries to open test/data/05-versions-space.pdf and
    // throws ENOENT in Next.js / serverless environments).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (
      buffer: Buffer,
      options?: Record<string, unknown>
    ) => Promise<{ text: string; numpages: number; info: Record<string, unknown> }>;

    const parsed = await pdfParse(input.buffer);

    const text = (parsed.text ?? "").trim();
    const pageCount = parsed.numpages ?? 0;

    return {
      text,
      pageCount,
      model: "pdf-parse@text-layer",
    };
  }
}
