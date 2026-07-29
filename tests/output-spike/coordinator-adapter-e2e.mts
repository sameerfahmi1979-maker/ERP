/**
 * OUTPUT.2 — Live E2E: Executive Ledger letter → official HTML adapter → Gotenberg.
 *
 * Validates the exact render path the issuance coordinator uses, against the
 * real Gotenberg container (no app auth needed). Run with:
 *   npx tsx tests/output-spike/coordinator-adapter-e2e.mts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

process.env.GOTENBERG_URL = process.env.GOTENBERG_URL ?? "http://localhost:3100";

const { renderExecutiveLedgerHtml } = await import("../../src/lib/executive-ledger/html-renderer.ts");
const { buildLetterExecutiveLedgerDocument } = await import("../../src/lib/output/letter-document-builder.ts");
const { renderOfficialHtmlToPdf } = await import("../../src/lib/output/html-adapter.ts");
const { findUnresolvedTokens } = await import("../../src/lib/output/variable-allowlist.ts");

const OUT_DIR = join(process.cwd(), "tests", "output-spike", "evidence", "coordinator-e2e");
mkdirSync(OUT_DIR, { recursive: true });

// Synthetic employment-letter row exactly as the HR_EMPLOYMENT_LETTER fetcher shapes it.
const columns = [
  "employee_name", "employee_code", "designation", "department",
  "employment_type", "employee_status", "joining_date", "company_name", "generated_date",
];
const row: Record<string, unknown> = {
  employee_name: "Test Employee E2E",
  employee_code: "EMP-E2E-001",
  designation: "Site Engineer",
  department: "Projects",
  employment_type: "Full Time",
  employee_status: "active",
  joining_date: "2024-03-15",
  company_name: "Alliance Gulf Transport and Construction L.L.C",
  generated_date: new Date().toISOString().slice(0, 10),
};

const doc = buildLetterExecutiveLedgerDocument({
  columns,
  row,
  documentTitle: "Employment Letter",
  documentRef: "Employment_Letter_EMP-E2E-001.pdf",
  verification: {
    publicUrl: "https://erp.algt.net/verify/e2e-test-token-not-real-0000000000",
    qrDataUrl: null,
    label: "Scan to verify",
  },
});

const html = renderExecutiveLedgerHtml(doc);
const leftover = findUnresolvedTokens(html);
if (leftover.length > 0) {
  console.error("FAIL: unresolved tokens in final HTML:", leftover);
  process.exit(1);
}

const t0 = Date.now();
const result = await renderOfficialHtmlToPdf({ html });
const elapsed = Date.now() - t0;

const pdfPath = join(OUT_DIR, "employment-letter-e2e.pdf");
writeFileSync(pdfPath, result.buffer);
writeFileSync(join(OUT_DIR, "employment-letter-e2e.html"), html);

const header = result.buffer.subarray(0, 5).toString("latin1");
const recomputed = createHash("sha256").update(result.buffer).digest("hex");

const checks = {
  pdf_header_ok: header === "%PDF-",
  sha256_matches_adapter: recomputed === result.sha256,
  size_bytes: result.fileSizeBytes,
  size_plausible: result.fileSizeBytes > 10_000,
  renderer_version: result.rendererVersion,
  render_ms: elapsed,
};
writeFileSync(join(OUT_DIR, "e2e-result.json"), JSON.stringify(checks, null, 2));
console.log(JSON.stringify(checks, null, 2));

if (!checks.pdf_header_ok || !checks.sha256_matches_adapter || !checks.size_plausible) {
  console.error("FAIL: coordinator adapter E2E failed acceptance checks.");
  process.exit(1);
}
console.log("PASS: coordinator adapter E2E (EL letter → Gotenberg HTML → verified PDF bytes).");
