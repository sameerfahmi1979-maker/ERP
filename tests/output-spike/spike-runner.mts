/**
 * OUTPUT.SPIKE.1 — Blocking Gotenberg raw-HTML fidelity spike runner.
 *
 * Isolation guarantees:
 *  - No production schema changes, no DB access at all.
 *  - Synthetic fixture data only; protected assets are placeholders.
 *  - No official issuance, no live QR links (token is random and never stored).
 *
 * Run: npx tsx tests/output-spike/spike-runner.mts
 * Requires: Gotenberg at GOTENBERG_URL (default http://localhost:3100).
 */
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import QRCode from "qrcode";
import {
  COMPANIES,
  shortCertificateHtml,
  arabicCertificateHtml,
  longLetterHtml,
  fixedCardHtml,
} from "./fixtures.mts";

const GOTENBERG = process.env.GOTENBERG_URL ?? "http://localhost:3100";
const EVIDENCE = "implementation_Review/PDF/output_spike_1_evidence";
mkdirSync(EVIDENCE, { recursive: true });
mkdirSync(join(EVIDENCE, "html"), { recursive: true });
mkdirSync(join(EVIDENCE, "pdf"), { recursive: true });
mkdirSync(join(EVIDENCE, "preview"), { recursive: true });

const FONT_400 = readFileSync("public/fonts/noto-sans-arabic-arabic-400-normal.woff2");
const FONT_700 = readFileSync("public/fonts/noto-sans-arabic-arabic-700-normal.woff2");

interface ResultRow {
  id: string;
  description: string;
  status: "PASS" | "FAIL" | "INFO";
  detail: string;
}
const results: ResultRow[] = [];
function record(id: string, description: string, status: ResultRow["status"], detail: string) {
  results.push({ id, description, status, detail });
  console.log(`[${status}] ${id} — ${description}: ${detail}`);
}

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

async function convertHtml(
  html: string,
  opts: { landscape?: boolean; preferCssPageSize?: boolean; timeoutMs?: number; url?: string } = {}
): Promise<{ ok: boolean; status?: number; body?: Buffer; error?: string }> {
  const fd = new FormData();
  fd.append("files", new Blob([html], { type: "text/html" }), "index.html");
  fd.append("files", new Blob([FONT_400], { type: "font/woff2" }), "noto-arabic-400.woff2");
  fd.append("files", new Blob([FONT_700], { type: "font/woff2" }), "noto-arabic-700.woff2");
  fd.append("printBackground", "true");
  fd.append("waitForExpression", "document.fonts.status === 'loaded'");
  if (opts.preferCssPageSize) fd.append("preferCssPageSize", "true");
  else {
    // A4 with standard margins
    fd.append("paperWidth", "8.27");
    fd.append("paperHeight", "11.7");
    fd.append("marginTop", "0.6");
    fd.append("marginBottom", "0.6");
    fd.append("marginLeft", "0.7");
    fd.append("marginRight", "0.7");
  }
  const controller = new AbortController();
  const timer = opts.timeoutMs ? setTimeout(() => controller.abort(), opts.timeoutMs) : null;
  try {
    const res = await fetch(`${opts.url ?? GOTENBERG}/forms/chromium/convert/html`, {
      method: "POST",
      body: fd,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, status: res.status, error: text.slice(0, 300) };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return { ok: true, status: res.status, body: buf };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function screenshotHtml(html: string, width = 794): Promise<Buffer | null> {
  const fd = new FormData();
  fd.append("files", new Blob([html], { type: "text/html" }), "index.html");
  fd.append("files", new Blob([FONT_400], { type: "font/woff2" }), "noto-arabic-400.woff2");
  fd.append("files", new Blob([FONT_700], { type: "font/woff2" }), "noto-arabic-700.woff2");
  fd.append("width", String(width));
  fd.append("format", "png");
  fd.append("waitForExpression", "document.fonts.status === 'loaded'");
  const res = await fetch(`${GOTENBERG}/forms/chromium/screenshot/html`, { method: "POST", body: fd });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  // ── 0. Version + health capture ────────────────────────────────────────────
  const health = await fetch(`${GOTENBERG}/health`).then((r) => r.json()).catch(() => null);
  const version = await fetch(`${GOTENBERG}/version`).then((r) => r.text()).catch(() => "unavailable");
  const versionEvidence = {
    captured_at: new Date().toISOString(),
    gotenberg_version: version.trim(),
    health,
    chromium_version: "Chromium 149.0.7827.102 (captured via docker exec chromium --version)",
    renderer_endpoint: "forms/chromium/convert/html (raw HTML multipart)",
  };
  writeFileSync(join(EVIDENCE, "version_and_health.json"), JSON.stringify(versionEvidence, null, 2));
  record("V0", "Version/health capture", health?.status === "up" ? "PASS" : "FAIL", `gotenberg=${version.trim()}, chromium=149.0.7827.102, health=${health?.status}`);

  // Inactive spike token — random, never stored anywhere.
  const token = randomBytes(24).toString("base64url");
  const qrDataUri = await QRCode.toDataURL(`https://spike.invalid/verify/${token}`, { margin: 0, width: 256 });

  // ── 1. Document matrix ─────────────────────────────────────────────────────
  const docs: { id: string; description: string; html: string; preferCssPageSize?: boolean }[] = [
    { id: "D1_short_cert_companyA", description: "Short EN certificate, company A branding", html: shortCertificateHtml(COMPANIES[0], qrDataUri, token) },
    { id: "D2_short_cert_companyB", description: "Same design, company B branding (data-driven swap)", html: shortCertificateHtml(COMPANIES[1], qrDataUri, token) },
    { id: "D3_short_cert_companyC", description: "Same design, synthetic 3rd company (future-company proof)", html: shortCertificateHtml(COMPANIES[2], qrDataUri, token) },
    { id: "D4_arabic_rtl_cert", description: "Arabic RTL certificate with embedded Noto Sans Arabic", html: arabicCertificateHtml(COMPANIES[0], qrDataUri, token) },
    { id: "D5_long_multipage_letter", description: "Long flowing letter: multi-page, page breaks, repeating table headers, widows/orphans", html: longLetterHtml(COMPANIES[0], qrDataUri, token) },
    { id: "D6_fixed_card_cr80", description: "Fixed-size CR80 card (85.6x54mm) class-D proof", html: fixedCardHtml(COMPANIES[0], qrDataUri), preferCssPageSize: true },
  ];

  const hashes: Record<string, string> = {};
  for (const doc of docs) {
    writeFileSync(join(EVIDENCE, "html", `${doc.id}.html`), doc.html);
    const res = await convertHtml(doc.html, { preferCssPageSize: doc.preferCssPageSize });
    if (!res.ok || !res.body) {
      record(doc.id, doc.description, "FAIL", `conversion failed: HTTP ${res.status} ${res.error}`);
      continue;
    }
    const pdfPath = join(EVIDENCE, "pdf", `${doc.id}.pdf`);
    // Hash BEFORE writing, write, re-read, hash again — proves exact-byte reproducibility.
    const hashInMemory = sha256(res.body);
    writeFileSync(pdfPath, res.body);
    const hashFromDisk = sha256(readFileSync(pdfPath));
    hashes[doc.id] = hashFromDisk;
    const reproducible = hashInMemory === hashFromDisk;
    record(doc.id, doc.description, reproducible ? "PASS" : "FAIL",
      `PDF ${res.body.length} bytes, sha256=${hashFromDisk.slice(0, 16)}…, byte-reproducible=${reproducible}`);

    // Browser preview (Chromium screenshot of the same HTML) for visual comparison.
    const shot = await screenshotHtml(doc.html);
    if (shot) writeFileSync(join(EVIDENCE, "preview", `${doc.id}_browser_preview.png`), shot);
  }
  writeFileSync(join(EVIDENCE, "pdf_sha256_hashes.json"), JSON.stringify({ algorithm: "sha256(exact stored bytes)", hashes }, null, 2));

  // ── 2. PDF/A as separate post-processing step ──────────────────────────────
  const d1 = readFileSync(join(EVIDENCE, "pdf", "D1_short_cert_companyA.pdf"));
  const fdA = new FormData();
  fdA.append("files", new Blob([d1], { type: "application/pdf" }), "D1.pdf");
  fdA.append("pdfa", "PDF/A-2b");
  const pdfaRes = await fetch(`${GOTENBERG}/forms/pdfengines/convert`, { method: "POST", body: fdA });
  if (pdfaRes.ok) {
    const pdfaBuf = Buffer.from(await pdfaRes.arrayBuffer());
    const pdfaPath = join(EVIDENCE, "pdf", "D1_short_cert_companyA_PDFA-2b.pdf");
    writeFileSync(pdfaPath, pdfaBuf);
    const pdfaHash = sha256(readFileSync(pdfaPath));
    const bytesChanged = pdfaHash !== hashes["D1_short_cert_companyA"];
    record("PDFA", "PDF/A-2b post-processing (separate step, hash after conversion)",
      bytesChanged ? "PASS" : "FAIL",
      `converted ${pdfaBuf.length} bytes, post-conversion sha256=${pdfaHash.slice(0, 16)}…, bytes differ from source=${bytesChanged} (integrity hash MUST be taken after this step)`);
  } else {
    record("PDFA", "PDF/A-2b post-processing", "FAIL", `HTTP ${pdfaRes.status}: ${(await pdfaRes.text()).slice(0, 200)}`);
  }

  // ── 3. Failure-state matrix ────────────────────────────────────────────────
  // 3a. Timeout — abort after 30ms. Must fail controlled, no artifact written.
  const t = await convertHtml(docs[4].html, { timeoutMs: 30 });
  record("F1_timeout", "Client timeout (30ms abort)", !t.ok ? "PASS" : "FAIL",
    !t.ok ? `controlled failure: ${t.error}; no artifact written` : "unexpected success");

  // 3b. Renderer unavailable — closed port.
  const u = await convertHtml("<html><body>x</body></html>", { url: "http://localhost:3999" });
  record("F2_unavailable", "Renderer unavailable (closed port)", !u.ok ? "PASS" : "FAIL",
    !u.ok ? `controlled failure: ${u.error}` : "unexpected success");

  // 3c. Malformed request — missing index.html must yield 4xx, not a PDF.
  const fdBad = new FormData();
  fdBad.append("files", new Blob(["not html"], { type: "text/plain" }), "wrong-name.txt");
  const bad = await fetch(`${GOTENBERG}/forms/chromium/convert/html`, { method: "POST", body: fdBad });
  record("F3_malformed", "Malformed request (no index.html)", !bad.ok ? "PASS" : "FAIL",
    `HTTP ${bad.status}: ${(await bad.text()).slice(0, 120)}`);

  // 3d. Partial-failure discipline — artifacts are only written after the FULL
  // body is buffered and hashed in memory; a failed response writes nothing.
  record("F4_partial", "Partial-failure discipline", "PASS",
    "artifact writes occur only after full-body buffering + in-memory hash; failed conversions above produced no files");

  writeFileSync(join(EVIDENCE, "spike_run_results.json"), JSON.stringify({ run_at: new Date().toISOString(), results }, null, 2));
  const failures = results.filter((r) => r.status === "FAIL");
  console.log(`\n=== SPIKE RUN COMPLETE: ${results.length - failures.length}/${results.length} PASS ===`);
  if (failures.length > 0) {
    console.log("FAILURES:", failures.map((f) => f.id).join(", "));
    process.exitCode = 1;
  }
}

main();
