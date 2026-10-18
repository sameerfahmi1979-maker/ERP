import { expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import parse from "pdf-parse/lib/pdf-parse.js";
import { listOfficialDocumentDefinitions, getOfficialDocumentDefinition } from "@/lib/official-documents/registry";
import { officialWordingBlockers } from "@/lib/official-documents/catalogue";
import { renderOfficialDocumentHtml, renderOfficialDocumentPrintPackage } from "@/lib/official-documents/layout/render";
import { renderOfficialHtmlToPdf } from "@/lib/output/html-adapter";
import { generateQrDataUrl } from "@/lib/public-verification/qr";
import type { OfficialDocumentDefinition, OfficialDocumentLanguage, OfficialDocumentRenderContext } from "@/lib/official-documents/types";
// Explicit opt-in backend-renderer laboratory. No ERP browser/session, issuance,
// production data, email, provider or real company stamp/signature is involved.
const enabled = process.env.F08_PDF_MATRIX === "1";
it.skipIf(!enabled)("renders the exact declared technical catalogue and long synthetic content through the local PDF service", async () => {
  expect(process.env.GOTENBERG_URL).toBe("http://127.0.0.1:16908");
  const folder = path.resolve(process.env.F08_PDF_MATRIX_DIR ?? "");
  expect(folder.replaceAll("\\", "/")).toMatch(/^C:\/dev\/agt-erp-f08-lab-20261018\/official-files-\d{2}$/);
  fs.mkdirSync(folder, { recursive: true });
  const svg = (label: string, color: string) => "data:image/svg+xml;base64," + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="70"><rect width="240" height="70" fill="${color}"/><text x="8" y="40" fill="white" font-size="20">${label}</text></svg>`).toString("base64");
  const row: Record<string, unknown> = {
    employee_name: "F08 Synthetic Employee", employee_name_ar: "موظف اختباري", employee_code: "F08-SYNTHETIC-001",
    designation: "Synthetic Supervisor", designation_ar: "مشرف اختباري", department: "Synthetic QA", employment_type: "Full-Time",
    joining_date: "2023-04-15", company_name: "F08 QA COMPANY A", gross_salary: 12500, basic_salary: 8000, currency: "AED",
    passport_number_masked: "QA****01", warning_level: "First", warning_reason: "Synthetic test only", incident_date: "2026-10-01",
    incident_description: "Synthetic test only", clearance_area: "Synthetic QA", checklist_item: "Synthetic profile check",
    area: "QA", ppe_item: "Synthetic Helmet", ppe_category: "Test", quantity: 1, issue_date: "2026-10-18", last_working_date: "2026-10-17",
  };
  const qr = await generateQrDataUrl("https://example.invalid/f08-synthetic-no-public-token");
  const context = (language: OfficialDocumentLanguage, brand = "A"): OfficialDocumentRenderContext => ({
    row: { ...row, company_name: `F08 QA COMPANY ${brand}` }, rows: [row], inputs: {}, language,
    issuedDateEn: "18 October 2026", issuedDateAr: "١٨ أكتوبر ٢٠٢٦", serialNo: "F08-SYNTHETIC-NOT-ISSUED",
    watermarkText: "SYNTHETIC - NOT ISSUED",
    branding: { companyNameEn: `F08 QA COMPANY ${brand}`, companyNameAr: "شركة اختبارية", showLogo: true,
      logoUrl: svg(`QA ${brand} - NOT ALGT`, brand === "A" ? "#123457" : "#513472"), showStamp: true, stampUrl: svg("TEST STAMP", "#a00000"),
      showSignatory: true, signatureUrl: svg("TEST SIGNATURE", "#004477"), signatoryName: "SYNTHETIC APPROVER", signatoryTitleEn: "NOT A REAL SIGNATURE",
      footerTextEn: "F08 SYNTHETIC LABORATORY - NOT AN OFFICIAL DOCUMENT", themePrimaryColor: brand === "A" ? "#123457" : "#513472" },
    verification: { publicUrl: "https://example.invalid/f08-synthetic-no-public-token", qrDataUrl: qr! },
  });
  const receipts: Array<Record<string, unknown>> = [];
  async function render(name: string, definition: OfficialDocumentDefinition, ctx: OfficialDocumentRenderContext, long = false) {
    const html = renderOfficialDocumentHtml(definition, ctx);
    expect(renderOfficialDocumentHtml(definition, structuredClone(ctx))).toBe(html);
    expect(html).not.toMatch(/src="https?:/); // All test assets are embedded; renderer cannot fetch the ERP.
    const output = await renderOfficialHtmlToPdf(renderOfficialDocumentPrintPackage(definition, ctx));
    const parsed = await parse(output.buffer);
    expect(parsed.text).toContain("F08-SYNTHETIC-001");
    expect(parsed.text).toContain("F08-SYNTHETIC-NOT-ISSUED");
    for (let page = 1; page <= parsed.numpages; page++) expect(parsed.text).toContain(`Page ${page} of ${parsed.numpages}`);
    if (long) { expect(parsed.numpages).toBeGreaterThan(1); expect(parsed.text).toContain("F08-END-079"); }
    fs.writeFileSync(path.join(folder, name + ".pdf"), output.buffer, { flag: "wx" });
    receipts.push({ name, code: definition.documentCode, language: ctx.language, pages: parsed.numpages, bytes: output.fileSizeBytes,
      sha256: output.sha256, modelSha256: createHash("sha256").update(JSON.stringify(definition.build(ctx))).digest("hex"),
      htmlSha256: createHash("sha256").update(html).digest("hex"), wordingBlockers: officialWordingBlockers(definition, ctx.language),
      visualAcceptance: "PENDING_SEPARATE_FILE_INSPECTION", officialIssued: false });
  }
  const definitions = listOfficialDocumentDefinitions();
  for (const definition of definitions.filter(def => def.status === "published")) {
    for (const language of definition.supportedLanguages) await render(`${definition.documentCode}-${language}`, definition, context(language));
  }
  const confirmation = getOfficialDocumentDefinition("HR_EMPLOYMENT_CONFIRMATION")!;
  await render("alternate-brand-bilingual", confirmation, context("bilingual", "B"));
  for (const language of confirmation.supportedLanguages) {
    const longDefinition = { ...confirmation, build: (ctx: OfficialDocumentRenderContext) => ({ ...confirmation.build(ctx),
      blocks: Array.from({ length: 80 }, (_, n) => ({ kind: "paragraph" as const, en: `F08-END-${String(n).padStart(3, "0")} Synthetic long narrative. `.repeat(3), ar: `F08-END-${String(n).padStart(3, "0")} نص اختباري طويل. `.repeat(3) })) }) };
    await render(`long-narrative-${language}`, longDefinition, context(language), true);
  }
  const clearance = getOfficialDocumentDefinition("HR_CLEARANCE_FORM")!;
  const longForm = context("bilingual"); longForm.rows = Array.from({ length: 80 }, (_, n) => ({ ...row, clearance_area: `F08-END-${String(n).padStart(3, "0")} Synthetic QA clearance` }));
  await render("long-form-bilingual", clearance, longForm, true);
  expect(receipts).toHaveLength(18);
  fs.writeFileSync(path.join(folder, "manifest.json"), JSON.stringify({ state: "PASS_BACKEND_RENDERER_AND_PARSE_NOT_OFFICIAL_ACCEPTANCE",
    outputs: receipts, disabled: definitions.filter(def => def.status !== "published").map(def => def.documentCode),
    limitations: ["All wording still requires genuine recorded owner approval.", "Four wording-pending templates were not rendered or enabled.", "No new languages were invented for English-only definitions.", "No official issuance/storage/reprint or browser/device acceptance is inferred."] }, null, 2), { flag: "wx" });
}, 180000);
