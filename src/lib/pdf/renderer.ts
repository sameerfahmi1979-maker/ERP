/**
 * ERP PDF Generation — Renderer Dispatcher
 * Phase: ERP PDF.1 — Production PDF Generation Framework (2026-07-23)
 *
 * SECURITY: Never call from client-side code.
 * Always resolve branding, template, and ownership on the server.
 *
 * ─── URL configuration ────────────────────────────────────────────────────
 * INTERNAL_SITE_URL  — The URL that Gotenberg (inside Docker) uses to fetch the
 *                      print route. On Windows/Mac local dev: http://host.docker.internal:3000
 *                      On Linux: http://172.17.0.1:3000 (docker0 bridge) or compose service name.
 *                      In production: internal app hostname (not public internet URL).
 *
 * NEXT_PUBLIC_SITE_URL — The public-facing URL (https://erp.algt.net).
 *                        NOT used for Gotenberg fetches.
 */

import {
  PdfRenderRequest,
  PdfRenderRequestSchema,
  PdfRenderResult,
} from "./types";
import {
  gotenbergConvertUrl,
  getGotenbergVersion,
  isGotenbergHealthy,
} from "./gotenberg";
import { signPrintToken } from "./print-token";
import { createHash } from "crypto";

/**
 * The URL that Gotenberg (inside Docker) uses to reach the ERP print route.
 * MUST NOT be the public internet URL when Gotenberg cannot reach it.
 *
 * Priority: INTERNAL_SITE_URL > NEXT_PUBLIC_SITE_URL > localhost:3000
 */
const INTERNAL_SITE_URL =
  process.env.INTERNAL_SITE_URL ??
  process.env.NEXT_PUBLIC_SITE_URL ??
  "http://localhost:3000";

/**
 * Main PDF render dispatcher.
 *
 * Flow:
 *   1. Validate the request (Zod schema).
 *   2. Check if Gotenberg is available.
 *   3. Sign a short-lived print token.
 *   4. Build the private print URL.
 *   5. Call Gotenberg to convert the URL to PDF.
 *   6. Return the PDF buffer with metadata.
 *
 * If Gotenberg is unavailable and `allowFallback` is true,
 * throws a descriptive error — do NOT silently fall back to
 * lower-quality client-side PDF generation for official documents.
 */
export async function renderPdf(
  input: PdfRenderRequest,
  options?: {
    /** User ID performing the generation (for token signing) */
    userId: number;
    /** If true, passes a Gotenberg footer with page numbers */
    includePageNumbers?: boolean;
    /** Extra Gotenberg options */
    paperWidth?: number;
    paperHeight?: number;
  },
): Promise<PdfRenderResult> {
  const req = PdfRenderRequestSchema.parse(input);

  // Guard: PDF/A and PDF/UA are not supported without veraPDF.
  // Remove these profile requests until veraPDF is installed and wired.
  if (req.outputProfile === "pdfa" || req.outputProfile === "pdfua") {
    throw new Error(
      `[PDF] Output profile "${req.outputProfile}" requires veraPDF validation which is not installed. ` +
        "Use outputProfile: 'standard' until veraPDF is configured. " +
        "See .cursor/rules/pdf-testing.mdc for setup instructions.",
    );
  }

  // Guard: PDF_PRINT_TOKEN_SECRET must be set
  if (!process.env.PDF_PRINT_TOKEN_SECRET || process.env.PDF_PRINT_TOKEN_SECRET.length < 32) {
    throw new Error(
      "[PDF] PDF_PRINT_TOKEN_SECRET is not set or too short (min 32 chars). " +
        "Add it to .env.local or your production secrets.",
    );
  }

  // Gotenberg health check
  const healthy = await isGotenbergHealthy();
  if (!healthy) {
    const gotenbergUrl = process.env.GOTENBERG_URL ?? "http://localhost:3100";
    const isLocal = gotenbergUrl.includes("localhost") || gotenbergUrl.includes("127.0.0.1");
    const hint = isLocal
      ? "Local dev: docker run --rm -p 3100:3100 gotenberg/gotenberg:8\n" +
        "Set GOTENBERG_URL=http://localhost:3100 and INTERNAL_SITE_URL=http://host.docker.internal:3000 (Windows/Mac) or http://172.17.0.1:3000 (Linux) in .env.local."
      : "Production: ensure the Gotenberg service is running and reachable at the configured GOTENBERG_URL.\n" +
        "On Railway: add a Gotenberg Docker service and set GOTENBERG_URL=http://<service>.railway.internal:3100\n" +
        "Also set INTERNAL_SITE_URL to your app's public URL so Gotenberg can fetch print routes.";
    throw new Error(
      `[PDF] Gotenberg service is unavailable at ${gotenbergUrl}.\n${hint}`,
    );
  }

  const userId = options?.userId ?? 0;

  // Sign a short-lived print token
  const token = signPrintToken({
    templateKey: req.templateKey,
    recordType: req.sourceRecordType,
    recordId: req.sourceRecordId,
    userId,
    ownerCompanyId: req.ownerCompanyId,
  });

  // Build the secure print URL — this is what GOTENBERG fetches, not the public URL
  const printUrl = `${INTERNAL_SITE_URL}/print/${encodeURIComponent(req.templateKey)}/${encodeURIComponent(req.sourceRecordType)}/${req.sourceRecordId}?token=${token}`;

  // Landscape dimensions
  const isLandscape = req.orientation === "landscape";
  const paperWidth = options?.paperWidth ?? (isLandscape ? 297 : 210);
  const paperHeight = options?.paperHeight ?? (isLandscape ? 210 : 297);

  // Optional footer with page numbers (Gotenberg footer template HTML)
  const footerHtml = options?.includePageNumbers
    ? `<html><body style="font-size:8pt;color:#757575;font-family:Arial;margin:0;padding:2mm 14mm;display:flex;justify-content:space-between;">
         <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
       </body></html>`
    : undefined;

  const { buffer, checksum, fileSizeBytes } = await gotenbergConvertUrl({
    url: printUrl,
    paperWidth,
    paperHeight,
    marginTop: 18,
    marginBottom: 20,
    marginLeft: 14,
    marginRight: 14,
    printBackground: true,
    scale: 1.0,
    footerHtml,
    waitForExpression: "document.fonts.status === 'loaded'",
    timeout: 45000,
  });

  const rendererVersion = await getGotenbergVersion();

  // Page count — read from PDF cross-reference (simple heuristic)
  const pageCount = countPdfPages(buffer);

  return {
    fileBuffer: buffer,
    pageCount,
    renderer: "gotenberg",
    rendererVersion,
    checksum,
    validationStatus: "skipped",
    fileSizeBytes,
  };
}

/**
 * Simple heuristic page-count from PDF bytes.
 * Counts "/Type /Page" (non-Pages) occurrences.
 * Not perfectly accurate for all PDFs — use as estimate only.
 */
function countPdfPages(buffer: Buffer): number {
  const str = buffer.toString("latin1");
  const matches = str.match(/\/Type\s*\/Page[^s]/g);
  return matches ? matches.length : 1;
}
