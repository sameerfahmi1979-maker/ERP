import "server-only";
import type { PdfRenderRequest, PdfRenderResult } from "./types";

/**
 * Retired URL-based renderer. Supported issuance uses the governed raw-HTML
 * output pipeline and its durable original-request/permission checks.
 * Preserve the compatibility signature, but never sign a legacy capability,
 * contact Gotenberg or load business data through the removed print route.
 */
export async function renderPdf(
  _input: PdfRenderRequest,
  _options?: {
    userId: number;
    includePageNumbers?: boolean;
    paperWidth?: number;
    paperHeight?: number;
  },
): Promise<PdfRenderResult> {
  void _input;
  void _options;
  throw new Error("The legacy URL-based PDF renderer is retired. Use Reports or Employee Letters & Forms.");
}
