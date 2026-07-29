/**
 * OUTPUT.3B — Template Studio visual regression baselines.
 *
 * Renders fixed studio fixtures through the canonical mapping + Executive
 * Ledger HTML builder with a FIXED issue date, then records SHA-256 hashes of
 * the canonical HTML (deterministic baseline). Gotenberg PDFs are rendered as
 * visual artifacts (page counts recorded; PDF bytes are not hashed because
 * Chromium embeds timestamps).
 *
 * Run:            npx tsx tests/output-spike/template-studio-baselines.mts
 * Verify mode:    npx tsx tests/output-spike/template-studio-baselines.mts --verify
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

process.env.GOTENBERG_URL = process.env.GOTENBERG_URL ?? "http://localhost:3100";

const { buildStudioExecutiveLedgerDocument } = await import("../../src/lib/template-studio/schema-to-el.ts");
const { parseStudioBodySchema } = await import("../../src/lib/template-studio/schema.ts");
const { getStudioFixture } = await import("../../src/lib/template-studio/fixtures.ts");
const { renderExecutiveLedgerHtml } = await import("../../src/lib/executive-ledger/html-renderer.ts");
const { renderOfficialHtmlToPdf } = await import("../../src/lib/output/html-adapter.ts");

const OUT_DIR = join(process.cwd(), "tests", "output-spike", "evidence", "template-studio-baselines");
mkdirSync(OUT_DIR, { recursive: true });
const BASELINE_FILE = join(OUT_DIR, "baselines.json");
const FIXED_DATE = "01 July 2026";
const verifyMode = process.argv.includes("--verify");

function pm(text: string) {
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}

const cases: { name: string; locale: "en" | "ar"; title: string; body: unknown }[] = [
  {
    name: "baseline-certificate-en",
    locale: "en",
    title: "Employment Certificate",
    body: {
      version: 1,
      direction: "ltr",
      blocks: [
        { id: "h1", kind: "heading", text: "TO WHOM IT MAY CONCERN", level: 1, align: "center" },
        { id: "sp1", kind: "spacer", heightPt: 12 },
        { id: "kv1", kind: "key_value", rows: [
          { label: "Employee", value: "{{employee.full_name_en}}" },
          { label: "Employee No", value: "{{employee.employee_code}}" },
        ] },
        { id: "p1", kind: "paragraph", rich: pm("This baseline paragraph must render identically across releases.") },
        { id: "d1", kind: "divider" },
        { id: "t1", kind: "table", headers: ["Item", "Qty"], rows: [["Helmet", "1"]], showHeader: true },
      ],
    },
  },
  {
    name: "baseline-certificate-ar",
    locale: "ar",
    title: "شهادة عمل",
    body: {
      version: 1,
      direction: "rtl",
      blocks: [
        { id: "h1", kind: "heading", text: "إلى من يهمه الأمر", level: 1, align: "center" },
        { id: "p1", kind: "paragraph", rich: pm("فقرة أساسية للمقارنة البصرية بين الإصدارات.") },
        { id: "kv1", kind: "key_value", rows: [{ label: "الموظف", value: "{{employee.full_name_ar}}" }] },
      ],
    },
  },
];

const results: Record<string, { htmlSha256: string; pdfPages: number | null; pdfBytes: number | null }> = {};
let gotenbergUp = true;

for (const c of cases) {
  const parsed = parseStudioBodySchema(c.body);
  if (!parsed.ok) {
    console.error(`FAIL: ${c.name} schema invalid`, parsed.errors);
    process.exit(1);
  }
  const doc = buildStudioExecutiveLedgerDocument({
    schema: parsed.schema,
    bindingValues: getStudioFixture(c.locale),
    documentTitle: c.title,
    documentRef: `STUDIO/BASELINE/${c.name}`,
    issuedDate: FIXED_DATE,
  });
  const html = renderExecutiveLedgerHtml(doc);
  const htmlSha256 = createHash("sha256").update(html).digest("hex");
  writeFileSync(join(OUT_DIR, `${c.name}.html`), html, "utf8");

  let pdfPages: number | null = null;
  let pdfBytes: number | null = null;
  if (gotenbergUp) {
    try {
      const r = await renderOfficialHtmlToPdf({ html });
      writeFileSync(join(OUT_DIR, `${c.name}.pdf`), r.buffer);
      pdfBytes = r.buffer.length;
      pdfPages = (r.buffer.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    } catch (e) {
      gotenbergUp = false;
      console.warn(`WARN: Gotenberg unavailable — PDF skipped (${(e as Error).message})`);
    }
  }
  results[c.name] = { htmlSha256, pdfPages, pdfBytes };
  console.log(`${c.name}: html sha256=${htmlSha256.slice(0, 16)}… pages=${pdfPages ?? "-"}`);
}

if (verifyMode) {
  if (!existsSync(BASELINE_FILE)) {
    console.error("FAIL: no baselines.json to verify against.");
    process.exit(1);
  }
  const baseline = JSON.parse(readFileSync(BASELINE_FILE, "utf8")) as typeof results;
  let failed = false;
  for (const [name, r] of Object.entries(results)) {
    const b = baseline[name];
    if (!b) {
      console.error(`FAIL: ${name} missing from baseline.`);
      failed = true;
      continue;
    }
    if (b.htmlSha256 !== r.htmlSha256) {
      console.error(`FAIL: ${name} canonical HTML drifted (baseline ${b.htmlSha256.slice(0, 12)}… vs ${r.htmlSha256.slice(0, 12)}…).`);
      failed = true;
    } else {
      console.log(`OK: ${name} matches baseline.`);
    }
  }
  process.exit(failed ? 1 : 0);
} else {
  writeFileSync(BASELINE_FILE, JSON.stringify(results, null, 2) + "\n", "utf8");
  console.log(`Baselines written to ${BASELINE_FILE}`);
}
