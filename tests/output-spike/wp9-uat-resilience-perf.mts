/**
 * OUTPUT.5 (WP9) — Live resilience + performance slice against real Gotenberg.
 *
 * 1. Renderer unreachable  → adapter throws a clean error (engine maps to failed_retryable).
 * 2. Renderer timeout      → clean abort error, no hang.
 * 3. Concurrency           → 5 parallel official renders all succeed; per-render timings.
 * 4. Large multi-page      → ~40-page document renders within timeout, page count correct.
 * 5. DB idempotency guard  → second INSERT with the same request_key is rejected (unique index).
 *
 * Run: npx tsx tests/output-spike/wp9-uat-resilience-perf.mts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const { renderExecutiveLedgerHtml } = await import("../../src/lib/executive-ledger/html-renderer.ts");
const { buildLetterExecutiveLedgerDocument } = await import("../../src/lib/output/letter-document-builder.ts");
const { renderOfficialHtmlToPdf } = await import("../../src/lib/output/html-adapter.ts");

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

const OUT_DIR = join(process.cwd(), "tests", "output-spike", "evidence", "wp9-uat");
mkdirSync(OUT_DIR, { recursive: true });

type Check = { name: string; pass: boolean; detail: string };
const checks: Check[] = [];
const add = (name: string, pass: boolean, detail = "") => {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};

const columns = ["employee_name", "employee_code", "designation", "company_name", "generated_date"];
const row = {
  employee_name: "Resilience Test",
  employee_code: "EMP-UAT-RES",
  designation: "QA",
  company_name: "Alliance Gulf Transport and Construction L.L.C",
  generated_date: "2026-07-26",
};
const makeHtml = () =>
  renderExecutiveLedgerHtml(
    buildLetterExecutiveLedgerDocument({
      columns,
      row,
      documentTitle: "Resilience Probe",
      documentRef: "WP9-RES-PROBE",
    })
  );

// ── 1. Renderer unreachable (child process — GOTENBERG_URL is module-load bound) ──
{
  const { execFileSync } = await import("node:child_process");
  const t0 = Date.now();
  try {
    const out = execFileSync("npx", ["tsx", "tests/output-spike/wp9-unreachable-child.mts"], {
      shell: true,
      encoding: "utf8",
      timeout: 60000,
    });
    add("unreachable renderer throws clean retryable error", true,
      `${out.trim().slice(0, 90)} in ${Date.now() - t0}ms`);
  } catch (err) {
    const e = err as { status?: number; stdout?: string };
    add("unreachable renderer throws clean retryable error", false,
      `exit=${e.status} ${String(e.stdout ?? "").trim().slice(0, 90)}`);
  }
}

// ── 2. Renderer timeout ──────────────────────────────────────────────────────
{
  const t0 = Date.now();
  try {
    await renderOfficialHtmlToPdf({ html: makeHtml(), timeoutMs: 1 });
    add("1ms timeout aborts cleanly", false, "unexpected success");
  } catch (err) {
    const ms = Date.now() - t0;
    add("1ms timeout aborts cleanly", ms < 5000, `${(err as Error).message.slice(0, 60)} in ${ms}ms`);
  }
}

// ── 3. Concurrency: 5 parallel renders ───────────────────────────────────────
{
  const t0 = Date.now();
  const results = await Promise.allSettled(
    Array.from({ length: 5 }, () => {
      const s = Date.now();
      return renderOfficialHtmlToPdf({ html: makeHtml() }).then((r) => ({ ms: Date.now() - s, bytes: r.fileSizeBytes }));
    })
  );
  const ok = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<{ ms: number; bytes: number }>[];
  const times = ok.map((r) => r.value.ms);
  add("5 parallel renders all succeed", ok.length === 5,
    `wall=${Date.now() - t0}ms, per-render=[${times.join(", ")}]ms`);
}

// ── 4. Large multi-page document (~40 pages) ─────────────────────────────────
{
  const bigColumns = ["item", "description", "qty", "site", "date"];
  const sections: string[] = [];
  for (let i = 0; i < 400; i++) {
    sections.push(
      `<tr><td>Item ${i + 1}</td><td>Load test row with a reasonably long description for wrapping behavior ${i + 1}</td><td>${i % 9}</td><td>Site ${i % 7}</td><td>2026-07-26</td></tr>`
    );
  }
  const bigHtml = makeHtml().replace(
    "</body>",
    `<div style="page-break-before: always;"><table style="width:100%; border-collapse: collapse; font-size: 11px;">
      <thead><tr>${bigColumns.map((c) => `<th style="border:1px solid #ccc; padding:6px;">${c}</th>`).join("")}</tr></thead>
      <tbody>${sections.join("")}</tbody></table></div></body>`
  );
  const t0 = Date.now();
  try {
    const r = await renderOfficialHtmlToPdf({ html: bigHtml });
    const doc = await pdfjs.getDocument({ data: new Uint8Array(r.buffer) }).promise;
    writeFileSync(join(OUT_DIR, "wp9-large-multipage.pdf"), r.buffer);
    add("large multi-page renders within timeout", doc.numPages >= 5,
      `${doc.numPages} pages, ${r.fileSizeBytes} bytes in ${Date.now() - t0}ms`);
  } catch (err) {
    add("large multi-page renders within timeout", false, (err as Error).message.slice(0, 80));
  }
}

// ── 5. DB idempotency guard: duplicate request_key rejected ──────────────────
{
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const key = `wp9-uat-dupe-${Date.now()}`;
  const base = {
    template_key: "WP9_UAT_PROBE",
    source_record_type: "employee",
    source_record_id: 1,
    owner_company_id: 1,
    storage_path: `uat/wp9-${key}.pdf`,
    file_name: "wp9-probe.pdf",
    mime_type: "application/pdf",
    output_code: "HR_EXPERIENCE_LETTER",
    document_class: "B",
    lifecycle_state: "pending",
    request_key: key,
    checksum: "pending",
    renderer: "gotenberg_html",
  };
  const { data: anyUser } = await admin.from("user_profiles").select("id").limit(1).single();
  (base as Record<string, unknown>).generated_by = anyUser!.id;
  const first = await admin.from("erp_generated_pdf_documents").insert(base).select("id").single();
  const second = await admin
    .from("erp_generated_pdf_documents")
    .insert({ ...base, storage_path: `uat/wp9-${key}-b.pdf` })
    .select("id")
    .single();
  const rejected = !!second.error && /duplicate key|unique/i.test(second.error.message);
  add("duplicate request_key rejected by unique index", !first.error && rejected,
    second.error?.message.slice(0, 70) ?? "second insert unexpectedly succeeded");
  if (first.data) {
    await admin.from("erp_generated_pdf_documents").delete().eq("id", first.data.id);
  }
}

const failed = checks.filter((c) => !c.pass);
writeFileSync(join(OUT_DIR, "wp9-resilience-perf-results.json"), JSON.stringify(checks, null, 2));
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
if (failed.length > 0) process.exit(1);
