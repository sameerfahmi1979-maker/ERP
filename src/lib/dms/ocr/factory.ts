/**
 * DMS.9 — OCR Provider Factory
 *
 * Returns the best available OCR provider for a given MIME type.
 * Priority order:
 *   1. PDF text-layer provider  (application/pdf)
 *   2. No-op provider           (all other / not configured)
 *
 * Future phases may add Tesseract and Azure Document Intelligence
 * by inserting them into the priority chain here.
 */

import type { IOcrProvider } from "./types";
import { PdfTextProvider } from "./pdf-text-provider";
import { NoopOcrProvider } from "./noop-provider";

let _pdfProvider: PdfTextProvider | null = null;
let _noopProvider: NoopOcrProvider | null = null;

function getPdfProvider(): PdfTextProvider {
  if (!_pdfProvider) _pdfProvider = new PdfTextProvider();
  return _pdfProvider;
}

function getNoopProvider(): NoopOcrProvider {
  if (!_noopProvider) _noopProvider = new NoopOcrProvider();
  return _noopProvider;
}

/**
 * Returns the most capable OCR provider that supports the given MIME type.
 * Never throws — always returns at least the noop provider.
 */
export function getOcrProvider(mimeType: string): IOcrProvider {
  const normalizedMime = mimeType.toLowerCase().split(";")[0].trim();

  const pdf = getPdfProvider();
  if (pdf.supports(normalizedMime)) return pdf;

  return getNoopProvider();
}

/**
 * Returns true if any real (non-noop) provider supports this MIME type.
 */
export function isOcrSupported(mimeType: string): boolean {
  const provider = getOcrProvider(mimeType);
  return provider.providerCode !== "noop" && provider.isConfigured();
}

/**
 * Returns all provider codes that are available and configured in this environment.
 */
export function getAvailableOcrProviders(): IOcrProvider[] {
  const pdf = getPdfProvider();
  return pdf.isConfigured() ? [pdf] : [];
}
