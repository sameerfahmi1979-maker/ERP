/**
 * OUTPUT.3A — Template Studio demo evidence generator.
 *
 * Builds four studio body schemas (short certificate EN, long multi-page
 * letter EN, Arabic RTL certificate, PPE issuance table form), validates
 * them, maps each through the canonical Studio → Executive Ledger mapping,
 * renders HTML, and (when Gotenberg is reachable) produces A4 PDFs.
 * Also runs an intentionally-invalid schema to capture validation errors.
 *
 * Run with: npx tsx tests/output-spike/template-studio-demo.mts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

process.env.GOTENBERG_URL = process.env.GOTENBERG_URL ?? "http://localhost:3100";

const { parseStudioBodySchema } = await import("../../src/lib/template-studio/schema.ts");
const { validateStudioBody } = await import("../../src/lib/template-studio/validate.ts");
const { buildStudioExecutiveLedgerDocument } = await import("../../src/lib/template-studio/schema-to-el.ts");
const { getStudioFixture } = await import("../../src/lib/template-studio/fixtures.ts");
const { renderExecutiveLedgerHtml } = await import("../../src/lib/executive-ledger/html-renderer.ts");
const { renderOfficialHtmlToPdf } = await import("../../src/lib/output/html-adapter.ts");

const OUT_DIR = join(process.cwd(), "tests", "output-spike", "evidence", "template-studio");
mkdirSync(OUT_DIR, { recursive: true });

function pm(text: string) {
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}
function pmChips(parts: (string | { chip: string })[]) {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: parts.map((p) =>
          typeof p === "string"
            ? { type: "text", text: p }
            : { type: "bindingToken", attrs: { path: p.chip } }
        ),
      },
    ],
  };
}

// ── Demo 1: short certificate (EN) ───────────────────────────────────────────
const shortCert = {
  version: 1,
  direction: "ltr" as const,
  blocks: [
    { id: "h1", kind: "heading" as const, text: "TO WHOM IT MAY CONCERN", level: 1 as const, align: "center" as const },
    { id: "sp1", kind: "spacer" as const, heightPt: 12 },
    {
      id: "p1",
      kind: "paragraph" as const,
      rich: pmChips([
        "This is to certify that ",
        { chip: "employee.full_name_en" },
        " (Employee No. ",
        { chip: "employee.employee_code" },
        ") is employed with ",
        { chip: "employee.owner_company" },
        " as ",
        { chip: "employee.designation" },
        " since ",
        { chip: "employee.joining_date" },
        ".",
      ]),
    },
    { id: "p2", kind: "paragraph" as const, rich: pm("This certificate is issued upon the employee's request without any liability on the company.") },
  ],
};

// ── Demo 2: long multi-page letter (EN) ──────────────────────────────────────
const longClauses = Array.from({ length: 14 }, (_, i) => ({
  id: `c${i}`,
  kind: "clause" as const,
  title: `Contractual Provision ${i + 1}`,
  rich: pm(
    "The employee shall comply with all applicable company policies, health and safety regulations, and site-specific operating procedures. " +
      "This provision applies to all work sites operated by the company within the United Arab Emirates and extends to any temporary assignment, " +
      "secondment, or project posting. Any breach shall be handled per the approved disciplinary matrix and UAE Labour Law. " +
      "The employee acknowledges receipt of the relevant policy documents and confirms understanding of the obligations described herein."
  ),
}));
const longLetter = {
  version: 1,
  direction: "ltr" as const,
  blocks: [
    { id: "h1", kind: "heading" as const, text: "EMPLOYMENT TERMS CONFIRMATION", level: 1 as const, align: "center" as const },
    {
      id: "kv1",
      kind: "key_value" as const,
      title: "Employee Details",
      rows: [
        { label: "Employee Name", value: "{{employee.full_name_en}}" },
        { label: "Employee No", value: "{{employee.employee_code}}" },
        { label: "Designation", value: "{{employee.designation}}" },
        { label: "Department", value: "{{employee.department}}" },
        { label: "Joining Date", value: "{{employee.joining_date}}", emphasized: true },
      ],
    },
    { id: "d1", kind: "divider" as const, label: "TERMS" },
    ...longClauses,
  ],
};

// ── Demo 3: Arabic RTL certificate ───────────────────────────────────────────
const arabicCert = {
  version: 1,
  direction: "rtl" as const,
  blocks: [
    { id: "h1", kind: "heading" as const, text: "إلى من يهمه الأمر", level: 1 as const, align: "center" as const },
    { id: "sp1", kind: "spacer" as const, heightPt: 10 },
    {
      id: "p1",
      kind: "paragraph" as const,
      rich: pmChips([
        "نشهد بأن السيد/ ",
        { chip: "employee.full_name_ar" },
        " (رقم الموظف: ",
        { chip: "employee.employee_code" },
        ") يعمل لدى ",
        { chip: "company.legal_name_ar" },
        " ولا يزال على رأس عمله حتى تاريخه.",
      ]),
    },
    { id: "p2", kind: "paragraph" as const, rich: pm("وقد أعطيت له هذه الشهادة بناءً على طلبه دون أدنى مسؤولية على الشركة.") },
  ],
};

// ── Demo 4: PPE issuance table form ──────────────────────────────────────────
const ppeForm = {
  version: 1,
  direction: "ltr" as const,
  blocks: [
    { id: "h1", kind: "heading" as const, text: "PPE ISSUANCE RECORD", level: 1 as const, align: "center" as const },
    {
      id: "kv1",
      kind: "key_value" as const,
      rows: [
        { label: "Employee", value: "{{employee.full_name_en}} ({{employee.employee_code}})" },
        { label: "Work Site", value: "{{employee.work_site}}" },
      ],
    },
    {
      id: "t1",
      kind: "table" as const,
      title: "Issued Items",
      headers: ["Item", "Qty", "Size", "Condition", "Remarks"],
      rows: [
        ["Safety Helmet", "1", "Universal", "New", "White — supervisor"],
        ["Hi-Vis Vest", "2", "L", "New", ""],
        ["Safety Boots", "1", "43", "New", "Steel toe"],
        ["Protective Gloves", "3", "L", "New", "Monthly replacement"],
        ["Safety Goggles", "1", "Universal", "New", ""],
      ],
      showHeader: true,
    },
    { id: "sp1", kind: "spacer" as const, heightPt: 16 },
    {
      id: "cols1",
      kind: "columns" as const,
      layout: "equal" as const,
      left: pm("Issued by: ____________________\nHSE Officer"),
      right: pm("Received by: ____________________\nEmployee signature"),
    },
  ],
};

// ── Demo 5: INVALID schema (validation-error evidence) ───────────────────────
const invalidBody = {
  version: 1,
  direction: "ltr" as const,
  blocks: [
    { id: "h1", kind: "heading" as const, text: "Salary of {{payroll.secret_salary}}", level: 1 as const, align: "left" as const },
    {
      id: "p1",
      kind: "paragraph" as const,
      rich: {
        type: "doc",
        content: [
          { type: "htmlBlock", html: "<script>steal()</script>" },
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Styled", marks: [{ type: "textStyle", attrs: { fontSize: 96, color: "red" } }] },
            ],
          },
        ],
      },
    },
  ],
};

const demos = [
  { name: "01-short-certificate-en", body: shortCert, locale: "en" as const, title: "Employment Certificate" },
  { name: "02-long-letter-multipage-en", body: longLetter, locale: "en" as const, title: "Employment Terms Confirmation" },
  { name: "03-arabic-certificate-rtl", body: arabicCert, locale: "ar" as const, title: "شهادة لمن يهمه الأمر" },
  { name: "04-ppe-table-form", body: ppeForm, locale: "en" as const, title: "PPE Issuance Record" },
];

let gotenbergUp = true;
const report: string[] = ["# OUTPUT.3A Template Studio — Demo Evidence", ""];

for (const demo of demos) {
  const parsed = parseStudioBodySchema(demo.body);
  if (!parsed.ok) {
    console.error(`FAIL: ${demo.name} schema invalid:`, parsed.errors);
    process.exit(1);
  }
  const validation = validateStudioBody(parsed.schema);
  if (!validation.ok) {
    console.error(`FAIL: ${demo.name} failed validation:`, validation.errors);
    process.exit(1);
  }

  const doc = buildStudioExecutiveLedgerDocument({
    schema: parsed.schema,
    bindingValues: getStudioFixture(demo.locale),
    documentTitle: demo.title,
    documentRef: `STUDIO/DEMO/${demo.name}`,
  });
  const html = renderExecutiveLedgerHtml(doc);
  writeFileSync(join(OUT_DIR, `${demo.name}.html`), html, "utf8");

  let pdfNote = "PDF: skipped (Gotenberg unreachable)";
  if (gotenbergUp) {
    try {
      const t0 = Date.now();
      const r = await renderOfficialHtmlToPdf({ html });
      writeFileSync(join(OUT_DIR, `${demo.name}.pdf`), r.buffer);
      pdfNote = `PDF: ${r.buffer.length} bytes in ${Date.now() - t0}ms (${r.rendererVersion})`;
    } catch (e) {
      gotenbergUp = false;
      pdfNote = `PDF: skipped — ${(e as Error).message}`;
    }
  }
  const line = `- ${demo.name}: schema OK, validation OK, variables=[${validation.variables.join(", ")}], ${pdfNote}`;
  report.push(line);
  console.log(line);
}

// Validation-error evidence
const invalidParsed = parseStudioBodySchema(invalidBody);
if (invalidParsed.ok) {
  const v = validateStudioBody(invalidParsed.schema);
  if (v.ok) {
    console.error("FAIL: invalid demo unexpectedly passed validation");
    process.exit(1);
  }
  report.push("", "## Validation-error demo (expected rejections)", "");
  for (const err of v.errors) report.push(`- ${err}`);
  console.log(`Validation-error demo: ${v.errors.length} errors captured (expected).`);
} else {
  report.push("", "## Validation-error demo — rejected at schema parse", "");
  for (const err of invalidParsed.errors) report.push(`- ${err}`);
}

writeFileSync(join(OUT_DIR, "DEMO_EVIDENCE.md"), report.join("\n") + "\n", "utf8");
console.log(`\nEvidence written to ${OUT_DIR}`);
