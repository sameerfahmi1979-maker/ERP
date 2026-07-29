/**
 * OFFICIAL DOCS.1 — Gate 3 visual baselines.
 *
 * Renders representative official documents (EN / AR / bilingual narrative /
 * bilingual form / checklist / sensitive) through the REAL layout engine
 * (renderOfficialDocumentHtml) and the REAL Gotenberg Chromium pipeline
 * (gotenbergConvertHtml), then writes PDF + HTML evidence to ./evidence.
 *
 * SAFETY:
 * - All data is fictitious SPECIMEN data. Every PDF carries a SPECIMEN watermark.
 * - No real branding, stamp, or signature assets are read — placeholder inline
 *   SVG data-URIs labeled SPECIMEN are used instead (protected-asset exposure = zero).
 * - Nothing touches the database or storage. No issuance records are created.
 *
 * Run:  npx tsx spikes/official-docs-gate3/render-visual-baselines.ts
 * Requires GOTENBERG_URL (default http://localhost:3100) to be reachable.
 */

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import QRCode from "qrcode";

import {
  renderOfficialDocumentHtml,
  OFFICIAL_DOCUMENT_PAGE_MARGINS_MM,
} from "../../src/lib/official-documents/layout/render";
import type {
  OfficialDocumentDefinition,
  OfficialDocumentRenderContext,
  OfficialDocumentLanguage,
} from "../../src/lib/official-documents/types";
import { getOfficialDocumentDefinition } from "../../src/lib/official-documents/registry";
import { gotenbergConvertHtml } from "../../src/lib/pdf/gotenberg";
import type { ExportBrandingContext } from "../../src/lib/export/export-types";

const OUT_DIR = join(__dirname, "evidence");

// ── SPECIMEN placeholder assets (inline SVG — no protected assets touched) ──
function svgDataUri(label: string, w: number, h: number, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="none" stroke="${color}" stroke-width="2" rx="8"/><text x="50%" y="55%" font-family="Arial" font-size="14" fill="${color}" text-anchor="middle">${label}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

const SPECIMEN_BRANDING: ExportBrandingContext = {
  companyNameEn: "SPECIMEN TRANSPORT & CONSTRUCTION L.L.C",
  companyNameAr: "شركة سبيسيمن للنقل والمقاولات ذ.م.م",
  logoUrl: svgDataUri("SPECIMEN LOGO", 150, 62, "#1e3a5f"),
  stampUrl: svgDataUri("SPECIMEN STAMP", 110, 110, "#7a1f1f"),
  signatureUrl: svgDataUri("SPECIMEN SIGNATURE", 140, 46, "#333333"),
  showLogo: true,
  showStamp: true,
  showSignatory: true,
  signatoryName: "Specimen Signatory",
  signatoryTitleEn: "Human Resources Manager",
  themePrimaryColor: "#1e3a5f",
  addressBlockEn: "P.O. Box 00000, Specimen City, United Arab Emirates",
  phone: "+971 0 000 0000",
  email: "hr@specimen.example",
  website: "www.specimen.example",
  trn: "100000000000000",
  tradeLicenseNo: "CN-0000000",
  footerTextEn: "SPECIMEN — visual baseline only, not an official document.",
  showTrn: true,
  showLicense: true,
} as ExportBrandingContext;

// ── SPECIMEN employee row (fictitious) ───────────────────────────────────────
const ROW: Record<string, unknown> = {
  employee_name: "John Specimen",
  employee_name_ar: "جون سبيسيمن",
  employee_code: "EMP-SPEC-001",
  designation: "Senior Site Engineer",
  designation_ar: "مهندس موقع أول",
  department: "Projects",
  employment_type: "Full-Time",
  joining_date: "2023-03-15",
  last_working_date: "2026-08-31",
  company_name: "SPECIMEN TRANSPORT & CONSTRUCTION L.L.C",
  currency: "AED",
  gross_salary: 18500,
  passport_number_masked: "P•••••789",
  warning_level: "First Warning",
  warning_reason: "Repeated late attendance",
  incident_description: "Employee arrived more than 60 minutes late on five occasions within one month.",
  incident_date: "2026-07-02",
};

const CLEARANCE_ROWS = [
  { clearance_area: "Human Resources" },
  { clearance_area: "Finance / Payroll" },
  { clearance_area: "IT & Systems Access" },
  { clearance_area: "Operations / Site Assets" },
  { clearance_area: "Document Control" },
  { clearance_area: "Safety Equipment Return" },
];

const CHECKLIST_ROWS = Array.from({ length: 26 }, (_, i) => ({
  checklist_item: `Specimen onboarding step ${i + 1} — verify, record and file the required item`,
  area: ["HR", "Compliance", "Payroll", "Operations", "DMS", "Safety", "IT"][i % 7],
}));

const PPE_ROWS = [
  { ppe_item: "Safety Helmet", ppe_category: "Head Protection", quantity: 1, issue_date: "2026-07-01" },
  { ppe_item: "Safety Boots", ppe_category: "Foot Protection", quantity: 1, issue_date: "2026-07-01" },
  { ppe_item: "High-Visibility Vest", ppe_category: "Body Protection", quantity: 2, issue_date: "2026-07-01" },
];

interface Fixture {
  file: string;
  code: string;
  language: OfficialDocumentLanguage;
  rows?: Record<string, unknown>[];
  inputs?: Record<string, string>;
  withQr?: boolean;
}

const FIXTURES: Fixture[] = [
  { file: "01-employment-certificate-en", code: "HR_EMPLOYMENT_LETTER", language: "en", withQr: true },
  { file: "02-employment-confirmation-ar", code: "HR_EMPLOYMENT_CONFIRMATION", language: "ar", withQr: true },
  { file: "03-employment-confirmation-bilingual", code: "HR_EMPLOYMENT_CONFIRMATION", language: "bilingual", withQr: true },
  { file: "04-clearance-form-bilingual", code: "HR_CLEARANCE_FORM", language: "bilingual", rows: CLEARANCE_ROWS },
  { file: "05-joining-checklist-en-multipage", code: "HR_JOINING_CHECKLIST", language: "en", rows: CHECKLIST_ROWS },
  { file: "06-ppe-issue-form-en", code: "HR_PPE_ISSUE_FORM", language: "en", rows: PPE_ROWS },
  {
    file: "07-salary-certificate-with-amount-en",
    code: "HR_SALARY_CERT_WITH_AMOUNT",
    language: "en",
    inputs: { addressee: "Specimen Bank PJSC" },
    withQr: true,
  },
  {
    file: "08-noc-en",
    code: "HR_NOC",
    language: "en",
    inputs: { purpose: "applying for a short-term visit visa", validity_period: "30 days" },
    withQr: true,
  },
  // Warning letter: QR intentionally absent (registry qr_policy_override = none).
  { file: "09-warning-letter-en-no-qr", code: "HR_WARNING_LETTER", language: "en", withQr: false },
];

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const qrDataUrl = await QRCode.toDataURL("https://erp.algt.net/verify/SPECIMEN-VISUAL-BASELINE", {
    width: 220,
    margin: 1,
  });

  const manifest: Array<Record<string, unknown>> = [];

  for (const f of FIXTURES) {
    const def: OfficialDocumentDefinition | null = getOfficialDocumentDefinition(f.code);
    if (!def) throw new Error(`Definition not found in registry: ${f.code}`);
    if (!def.supportedLanguages.includes(f.language)) {
      throw new Error(`${f.code} does not support language ${f.language}`);
    }

    const ctx: OfficialDocumentRenderContext = {
      row: ROW,
      rows: f.rows ?? [ROW],
      inputs: f.inputs ?? {},
      language: f.language,
      branding: SPECIMEN_BRANDING,
      verification: f.withQr
        ? { publicUrl: "https://erp.algt.net/verify/SPECIMEN-VISUAL-BASELINE", qrDataUrl }
        : undefined,
      serialNo: "SPECIMEN/2026/0001",
      issuedDateEn: "28 July 2026",
      issuedDateAr: "٢٨ يوليو ٢٠٢٦",
      watermarkText: "SPECIMEN",
    };

    const html = renderOfficialDocumentHtml(def, ctx);
    writeFileSync(join(OUT_DIR, `${f.file}.html`), html, "utf8");

    const t0 = Date.now();
    const { buffer, checksum, fileSizeBytes } = await gotenbergConvertHtml({
      html,
      paperWidth: 210,
      paperHeight: 297,
      marginTop: OFFICIAL_DOCUMENT_PAGE_MARGINS_MM.top,
      marginBottom: OFFICIAL_DOCUMENT_PAGE_MARGINS_MM.bottom,
      marginLeft: OFFICIAL_DOCUMENT_PAGE_MARGINS_MM.left,
      marginRight: OFFICIAL_DOCUMENT_PAGE_MARGINS_MM.right,
      printBackground: true,
      waitForExpression: "document.fonts.status === 'loaded'",
      timeout: 60000,
    });
    const ms = Date.now() - t0;

    const pdfPath = join(OUT_DIR, `${f.file}.pdf`);
    writeFileSync(pdfPath, buffer);

    const pages = (buffer.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length || 1;
    manifest.push({
      fixture: f.file,
      documentCode: f.code,
      language: f.language,
      qr: !!f.withQr,
      pages,
      bytes: fileSizeBytes,
      sha256: checksum,
      renderMs: ms,
    });
    console.log(`OK  ${f.file}  (${pages} page(s), ${fileSizeBytes} bytes, ${ms}ms)`);
  }

  writeFileSync(join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  console.log(`\nDone. ${manifest.length} PDFs written to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
