/**
 * OUTPUT.2 — Official Gotenberg raw-HTML renderer adapter.
 *
 * Promoted from the passing OUTPUT.SPIKE.1 fidelity spike: self-contained
 * HTML (Executive Ledger output) is converted server-side by Gotenberg
 * Chromium. This is the canonical renderer for designed documents (v6.1).
 *
 * Error classification:
 *  - network / timeout / 5xx / unhealthy  → retryable
 *  - HTTP 4xx (bad input)                 → terminal
 */

import {
  gotenbergConvertHtml,
  isGotenbergHealthy,
  getGotenbergVersion,
} from "@/lib/pdf/gotenberg";

export class OutputRenderError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "OutputRenderError";
    this.retryable = retryable;
  }
}

export interface OfficialHtmlRenderResult {
  buffer: Buffer;
  sha256: string;
  fileSizeBytes: number;
  rendererVersion: string;
}

/** Matches the spike-proven settings: fonts loaded, backgrounds printed. */
const WAIT_FOR_FONTS = "document.fonts.status === 'loaded'";

export function classifyGotenbergError(err: unknown): OutputRenderError {
  const message = err instanceof Error ? err.message : String(err);
  const httpMatch = message.match(/HTTP (\d{3})/);
  if (httpMatch) {
    const status = Number(httpMatch[1]);
    // 4xx = our input is bad; retrying identical input cannot succeed.
    return new OutputRenderError(message, status >= 500);
  }
  // Timeouts, aborts, connection refused → retryable
  return new OutputRenderError(message, true);
}

/**
 * Render self-contained official HTML to PDF bytes.
 * Executive Ledger HTML carries its own @page margins, so Gotenberg margins
 * default to zero to avoid double margins (spike finding). Official-documents
 * layout HTML (OFFICIAL DOCS.1) is margin-free by design and passes explicit
 * engine margins so continuation pages get identical white margins.
 */
export async function renderOfficialHtmlToPdf(input: {
  html: string;
  paperWidthMm?: number;
  paperHeightMm?: number;
  timeoutMs?: number;
  marginsMm?: { top: number; bottom: number; left: number; right: number };
}): Promise<OfficialHtmlRenderResult> {
  const healthy = await isGotenbergHealthy();
  if (!healthy) {
    throw new OutputRenderError("Gotenberg renderer is unavailable (health check failed).", true);
  }

  try {
    const { buffer, checksum, fileSizeBytes } = await gotenbergConvertHtml({
      html: input.html,
      paperWidth: input.paperWidthMm ?? 210,
      paperHeight: input.paperHeightMm ?? 297,
      marginTop: input.marginsMm?.top ?? 0,
      marginBottom: input.marginsMm?.bottom ?? 0,
      marginLeft: input.marginsMm?.left ?? 0,
      marginRight: input.marginsMm?.right ?? 0,
      printBackground: true,
      waitForExpression: WAIT_FOR_FONTS,
      timeout: input.timeoutMs,
    });
    const rendererVersion = await getGotenbergVersion();
    return { buffer, sha256: checksum, fileSizeBytes, rendererVersion };
  } catch (err) {
    if (err instanceof OutputRenderError) throw err;
    throw classifyGotenbergError(err);
  }
}
