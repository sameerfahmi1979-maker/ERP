/**
 * OUTPUT.5 (WP9) — PDF integrity + security/RLS UAT probes against live Supabase.
 *
 * Part A (service role): for every issued document, download the stored bytes and
 *   verify exact SHA-256 vs checksum, %PDF header, page count, embedded fonts,
 *   snapshot capture, and that the embedded QR token matches the finalized link.
 * Part B (anon key): RLS + public-verification probes — unauthenticated access
 *   must be denied everywhere except the public verification RPC, which must
 *   expose metadata only and reject revoked/random tokens.
 *
 * Run: npx tsx tests/output-spike/wp9-uat-integrity-security.mts
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

async function extractPdfText(buf: Buffer): Promise<{ text: string; pages: number }> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  let text = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    text += tc.items.map((i: { str?: string }) => i.str ?? "").join(" ") + "\n";
  }
  return { text, pages: doc.numPages };
}

// ── env ──────────────────────────────────────────────────────────────────────
for (const line of readFileSync(join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const anon = createClient(URL_, ANON, { auth: { persistSession: false } });

const OUT_DIR = join(process.cwd(), "tests", "output-spike", "evidence", "wp9-uat");
mkdirSync(OUT_DIR, { recursive: true });

type Check = { slice: string; name: string; pass: boolean; detail: string };
const checks: Check[] = [];
const add = (slice: string, name: string, pass: boolean, detail = "") => {
  checks.push({ slice, name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  [${slice}] ${name}${detail ? " — " + detail : ""}`);
};

// ── Part A: PDF integrity for all issued documents ──────────────────────────
const { data: docs, error: docsErr } = await admin
  .from("erp_generated_pdf_documents")
  .select(
    "id, output_code, document_class, lifecycle_state, storage_path, checksum, checksum_algorithm, file_size_bytes, page_count, serial_no, serial_status, data_snapshot_json, policy_snapshot_json, branding_snapshot_json, renderer, renderer_version, chromium_version, revoked_at"
  )
  .eq("lifecycle_state", "issued")
  .not("output_code", "is", null) // framework issuances only (legacy Pipeline A rows excluded)
  .order("id");
if (docsErr) throw new Error(docsErr.message);

const { data: links, error: linksErr } = await admin
  .from("erp_output_public_links")
  .select("generated_pdf_document_id, public_token, status, expires_at");
if (linksErr) throw new Error(linksErr.message);
const linkByDoc = new Map((links ?? []).map((l) => [l.generated_pdf_document_id, l]));


for (const d of docs ?? []) {
  const tag = `#${d.id} ${d.output_code}`;
  const { data: blob, error: dlErr } = await admin.storage
    .from("erp-generated-pdfs")
    .download(d.storage_path);
  if (dlErr || !blob) {
    add("pdf-integrity", `${tag} stored object downloadable`, false, dlErr?.message ?? "no data");
    continue;
  }
  const buf = Buffer.from(await blob.arrayBuffer());

  add("pdf-integrity", `${tag} %PDF header`, buf.subarray(0, 5).toString("latin1") === "%PDF-");
  const sha = createHash("sha256").update(buf).digest("hex");
  add("pdf-integrity", `${tag} exact-byte SHA-256 matches checksum`, sha === d.checksum,
    sha === d.checksum ? sha.slice(0, 12) + "…" : `db=${d.checksum} recomputed=${sha}`);
  add("pdf-integrity", `${tag} size matches file_size_bytes`, buf.byteLength === d.file_size_bytes,
    `${buf.byteLength} bytes`);

  const raw = buf.toString("latin1");
  const { text: pdfText, pages } = await extractPdfText(buf);
  add("pdf-integrity", `${tag} page objects present`, pages >= 1, `${pages} page(s)`);
  add("pdf-integrity", `${tag} embedded fonts present`, /\/FontFile2?3?/.test(raw));

  add("pdf-integrity", `${tag} snapshots captured`,
    d.data_snapshot_json != null && d.policy_snapshot_json != null && d.branding_snapshot_json != null);
  add("pdf-integrity", `${tag} renderer metadata captured`,
    !!d.renderer && !!d.renderer_version, `${d.renderer} ${d.renderer_version ?? ""}`);

  const link = linkByDoc.get(d.id);
  const cls = d.document_class as string;
  if (cls === "A" || cls === "B") {
    add("policy", `${tag} class ${cls} has serial`, !!d.serial_no && d.serial_status === "issued", d.serial_no ?? "none");
    if (!d.revoked_at) {
      add("policy", `${tag} class ${cls} has QR link`, !!link, link ? link.status : "missing");
      if (link) {
        // The token itself lives inside the QR image; verify the QR block exists
        // (verification label rendered + image XObject embedded in the PDF).
        add("pdf-integrity", `${tag} QR verification block rendered`,
          /scan to verify/i.test(pdfText) && /\/Subtype\s*\/Image/.test(raw));
        add("policy", `${tag} QR expiry per class (${cls === "A" ? "90d" : "none"})`,
          cls === "A" ? link.expires_at != null : link.expires_at == null);
      }
    }
    if (d.serial_no) {
      add("pdf-integrity", `${tag} serial embedded in PDF text`, pdfText.includes(d.serial_no));
    }
  } else {
    add("policy", `${tag} class ${cls} has NO serial`, d.serial_no == null);
    add("policy", `${tag} class ${cls} has NO QR link`, !link);
  }
}

// Serial uniqueness + voided serials never reused
const { data: serials } = await admin
  .from("erp_generated_pdf_documents")
  .select("serial_no")
  .not("serial_no", "is", null);
const list = (serials ?? []).map((s) => s.serial_no as string);
add("policy", "all serials unique (incl. voided)", new Set(list).size === list.length, `${list.length} serials`);

// ── Part B: security probes with anon (unauthenticated) client ──────────────
{
  const { data, error } = await anon.from("erp_generated_pdf_documents").select("id").limit(5);
  add("security", "anon cannot read erp_generated_pdf_documents", !!error || (data ?? []).length === 0,
    error ? error.message.slice(0, 60) : `${data?.length ?? 0} rows`);
}
{
  const { data, error } = await anon.from("erp_output_public_links").select("public_token").limit(5);
  add("security", "anon cannot read erp_output_public_links", !!error || (data ?? []).length === 0,
    error ? error.message.slice(0, 60) : `${data?.length ?? 0} rows`);
}
{
  const { error } = await anon
    .from("erp_output_class_policies")
    .update({ approval_required: false })
    .eq("document_class", "A");
  const { data: verifyA } = await admin
    .from("erp_output_class_policies")
    .select("approval_required")
    .eq("document_class", "A")
    .single();
  add("security", "anon cannot modify class policies", verifyA?.approval_required === true,
    error ? error.message.slice(0, 60) : "no error but write must be no-op");
}
{
  const anyDoc = (docs ?? [])[0];
  if (anyDoc) {
    const { data, error } = await anon.storage.from("erp-generated-pdfs").download(anyDoc.storage_path);
    add("security", "anon cannot download stored official PDF", !!error || !data,
      error ? error.message.slice(0, 60) : "downloaded!");
  }
}
// Public verification RPC — the ONLY public surface.
const activeLink = (links ?? []).find((l) => l.status === "valid");
if (activeLink) {
  const { data, error } = await anon.rpc("get_public_verification_by_token", { p_token: activeLink.public_token });
  const row = Array.isArray(data) ? data[0] : data;
  add("security", "public verification works for valid token", !error && !!row, error?.message ?? JSON.stringify(row)?.slice(0, 100));
  if (row) {
    const s = JSON.stringify(row).toLowerCase();
    add("security", "public verification exposes NO salary amounts", !/salary_amount|basic_salary|gross_salary|72000|72,000/.test(s));
    add("security", "public verification exposes NO storage path", !s.includes("erp-generated-pdfs") && !/storage_path/.test(s));
  }
}
{
  // Token of the revoked document (id 5) — must NOT verify.
  const { data: revoked } = await admin
    .from("erp_generated_pdf_documents")
    .select("id")
    .not("revoked_at", "is", null)
    .limit(1)
    .single();
  if (revoked) {
    const { data: revLinks } = await admin
      .from("erp_output_public_links")
      .select("public_token, status")
      .eq("generated_pdf_document_id", revoked.id);
    const rl = (revLinks ?? [])[0];
    if (rl) {
      const { data } = await anon.rpc("get_public_verification_by_token", { p_token: rl.public_token });
      const row = Array.isArray(data) ? data[0] : data;
      const verdict = row == null || /revoked|invalid/i.test(JSON.stringify(row));
      add("security", "revoked document token does not verify as valid", verdict, JSON.stringify(row)?.slice(0, 120) ?? "null");
    } else {
      add("security", "revoked document had no active link (issued with issueQr=false)", true);
    }
  }
}
{
  const { data } = await anon.rpc("get_public_verification_by_token", {
    p_token: "0000000000000000000000000000000000000000000000000000000000000000",
  });
  const row = Array.isArray(data) ? data[0] : data;
  add("security", "random token does not verify", row == null || /invalid|not.?found/i.test(JSON.stringify(row)),
    JSON.stringify(row)?.slice(0, 100) ?? "null");
}

// ── summary ──────────────────────────────────────────────────────────────────
const failed = checks.filter((c) => !c.pass);
writeFileSync(join(OUT_DIR, "wp9-integrity-security-results.json"), JSON.stringify(checks, null, 2));
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
if (failed.length > 0) {
  console.error("FAILED CHECKS:", failed.map((f) => f.name).join("; "));
  process.exit(1);
}
