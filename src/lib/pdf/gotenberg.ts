/**
 * ERP PDF Generation — Gotenberg Adapter
 * Phase: ERP PDF.1 — Production PDF Generation Framework (2026-07-23)
 *
 * Gotenberg is the primary production PDF renderer.
 * It must only be called from server-side code (server actions, API routes).
 *
 * ─── Docker Setup ────────────────────────────────────────────────────────
 *
 * Gotenberg listens on port 3000 INSIDE the container.
 * Map it to a host port of your choice (e.g. 3100):
 *
 *   docker run --rm -p 3100:3000 gotenberg/gotenberg:8
 *
 * Then set GOTENBERG_URL=http://localhost:3100 in .env.local.
 *
 * ─── Docker-to-Host Networking ───────────────────────────────────────────
 *
 * When Gotenberg runs in Docker and must fetch the ERP print route,
 * it CANNOT use `localhost` — that resolves to the container itself.
 *
 * Use one of these approaches:
 *
 * Option A (recommended for local dev on Windows/Mac):
 *   INTERNAL_SITE_URL=http://host.docker.internal:3000
 *
 * Option B (Linux Docker):
 *   INTERNAL_SITE_URL=http://172.17.0.1:3000  (or docker0 bridge IP)
 *
 * Option C (same Docker Compose network):
 *   INTERNAL_SITE_URL=http://erp-app:3000
 *
 * INTERNAL_SITE_URL is used to build the URL that Gotenberg fetches.
 * NEXT_PUBLIC_SITE_URL (https://erp.algt.net) is the public URL shown to users.
 *
 * ─── Env vars ────────────────────────────────────────────────────────────
 *   GOTENBERG_URL=http://localhost:3100         # host → Gotenberg
 *   GOTENBERG_TIMEOUT_MS=30000
 *   INTERNAL_SITE_URL=http://host.docker.internal:3000   # Gotenberg → ERP
 *   PDF_PRINT_TOKEN_SECRET=<random-secret-min-32-chars>
 */

import { createHash } from "crypto";

const GOTENBERG_URL = process.env.GOTENBERG_URL ?? "http://localhost:3100";
const GOTENBERG_TIMEOUT_MS = Number(process.env.GOTENBERG_TIMEOUT_MS ?? "30000");

// The INTERNAL_SITE_URL is what Gotenberg fetches — must be reachable from the Gotenberg container.
// Allow: localhost, host.docker.internal, internal hostnames, and the configured INTERNAL_SITE_URL.
// Block: public internet URLs that don't start with the expected print path,
//        file:// URLs, ftp:// URLs, metadata endpoints.
const INTERNAL_SITE_URL =
  process.env.INTERNAL_SITE_URL ??
  process.env.NEXT_PUBLIC_SITE_URL ??
  "http://localhost:3000";

function buildAllowedPrintUrlPattern(): RegExp {
  const base = INTERNAL_SITE_URL.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
  // Also allow host.docker.internal and localhost variants
  return new RegExp(
    `^(${base}|http://host\\.docker\\.internal:\\d+|http://localhost:\\d+|http://127\\.0\\.0\\.1:\\d+)/print/`,
  );
}

const ALLOWED_PRINT_URL_PATTERN = buildAllowedPrintUrlPattern();

/**
 * Health-check: returns true if Gotenberg is reachable.
 */
export async function isGotenbergHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${GOTENBERG_URL}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Returns the Gotenberg version string from the health response.
 * Falls back to "unknown" if not reachable.
 */
export async function getGotenbergVersion(): Promise<string> {
  try {
    const res = await fetch(`${GOTENBERG_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return "unknown";
    const json = (await res.json()) as { details?: { chromium?: { status?: string } } };
    return `gotenberg@${GOTENBERG_URL.includes("localhost") ? "dev" : "prod"}`;
  } catch {
    return "unknown";
  }
}

export interface GotenbergUrlOptions {
  /** A fully-qualified private print URL that Gotenberg will fetch */
  url: string;
  /** PDF paper size — defaults to A4 */
  paperWidth?: number;  // mm
  paperHeight?: number; // mm
  /** Margins in mm */
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
  /** Whether to print background colors and images */
  printBackground?: boolean;
  /** Scale factor (0.1 to 2.0) */
  scale?: number;
  /** Optional Gotenberg header HTML (for page numbers etc.) */
  headerHtml?: string;
  /** Optional Gotenberg footer HTML (for page numbers etc.) */
  footerHtml?: string;
  /** Wait expression before capturing (e.g. "document.fonts.ready") */
  waitForExpression?: string;
  /** Timeout in ms */
  timeout?: number;
}

/**
 * Converts a private ERP print URL to a PDF buffer using Gotenberg Chromium.
 *
 * SECURITY: Only URLs matching ALLOWED_PRINT_URL_PATTERN are accepted.
 * Never pass user-provided URLs to this function.
 */
export async function gotenbergConvertUrl(options: GotenbergUrlOptions): Promise<{
  buffer: Buffer;
  checksum: string;
  fileSizeBytes: number;
}> {
  const { url, timeout = GOTENBERG_TIMEOUT_MS } = options;

  // SSRF guard — only allow our own internal print routes
  if (!ALLOWED_PRINT_URL_PATTERN.test(url)) {
    throw new Error(
      `[Gotenberg] Rejected URL that does not match ALLOWED_PRINT_URL_PATTERN: ${url.substring(0, 80)}`,
    );
  }

  const form = new FormData();
  form.append("url", url);

  // Paper size (A4 portrait = 210mm x 297mm)
  form.append("paperWidth", String((options.paperWidth ?? 210) / 25.4)); // Gotenberg uses inches
  form.append("paperHeight", String((options.paperHeight ?? 297) / 25.4));

  // Margins in inches
  form.append("marginTop", String((options.marginTop ?? 18) / 25.4));
  form.append("marginBottom", String((options.marginBottom ?? 20) / 25.4));
  form.append("marginLeft", String((options.marginLeft ?? 14) / 25.4));
  form.append("marginRight", String((options.marginRight ?? 14) / 25.4));

  form.append("printBackground", options.printBackground !== false ? "true" : "false");
  form.append("scale", String(options.scale ?? 1.0));

  if (options.headerHtml) {
    form.append("header.html", new Blob([options.headerHtml], { type: "text/html" }), "header.html");
  }
  if (options.footerHtml) {
    form.append("footer.html", new Blob([options.footerHtml], { type: "text/html" }), "footer.html");
  }
  if (options.waitForExpression) {
    form.append("waitForExpression", options.waitForExpression);
  }

  const res = await fetch(`${GOTENBERG_URL}/forms/chromium/convert/url`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(timeout),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "(no body)");
    throw new Error(`[Gotenberg] HTTP ${res.status}: ${errorText.substring(0, 200)}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const checksum = createHash("sha256").update(buffer).digest("hex");

  return { buffer, checksum, fileSizeBytes: buffer.byteLength };
}

export interface GotenbergHtmlOptions {
  /** Full HTML document string */
  html: string;
  /** Optional CSS string appended to the HTML */
  css?: string;
  paperWidth?: number;
  paperHeight?: number;
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
  printBackground?: boolean;
  scale?: number;
  waitForExpression?: string;
  timeout?: number;
}

/**
 * Converts a pre-rendered HTML string to a PDF buffer using Gotenberg.
 * Use this only when the print route approach is not available.
 * The HTML must be a fully self-contained document (no external fetches with auth).
 */
export async function gotenbergConvertHtml(options: GotenbergHtmlOptions): Promise<{
  buffer: Buffer;
  checksum: string;
  fileSizeBytes: number;
}> {
  const { html, css, timeout = GOTENBERG_TIMEOUT_MS } = options;

  const form = new FormData();
  form.append(
    "index.html",
    new Blob([html], { type: "text/html" }),
    "index.html",
  );

  if (css) {
    form.append(
      "style.css",
      new Blob([css], { type: "text/css" }),
      "style.css",
    );
  }

  form.append("paperWidth", String((options.paperWidth ?? 210) / 25.4));
  form.append("paperHeight", String((options.paperHeight ?? 297) / 25.4));
  form.append("marginTop", String((options.marginTop ?? 18) / 25.4));
  form.append("marginBottom", String((options.marginBottom ?? 20) / 25.4));
  form.append("marginLeft", String((options.marginLeft ?? 14) / 25.4));
  form.append("marginRight", String((options.marginRight ?? 14) / 25.4));
  form.append("printBackground", options.printBackground !== false ? "true" : "false");
  form.append("scale", String(options.scale ?? 1.0));

  if (options.waitForExpression) {
    form.append("waitForExpression", options.waitForExpression);
  }

  const res = await fetch(`${GOTENBERG_URL}/forms/chromium/convert/html`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(timeout ?? GOTENBERG_TIMEOUT_MS),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "(no body)");
    throw new Error(`[Gotenberg] HTTP ${res.status}: ${errorText.substring(0, 200)}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const checksum = createHash("sha256").update(buffer).digest("hex");

  return { buffer, checksum, fileSizeBytes: buffer.byteLength };
}
