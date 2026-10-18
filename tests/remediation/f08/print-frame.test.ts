import { expect, it } from "vitest";
import { getOfficialDocumentDefinition } from "@/lib/official-documents/registry";
import { renderOfficialDocumentPrintPackage, renderOfficialDocumentHtml, OFFICIAL_DOCUMENT_LAYOUT_VERSION } from "@/lib/official-documents/layout/render";
import type { OfficialDocumentRenderContext } from "@/lib/official-documents/types";
const context: OfficialDocumentRenderContext = { row: { employee_name: "Synthetic", employee_code: "QA", designation: "QA", company_name: "QA", joining_date: "2026-01-01" }, rows: [], inputs: {}, language: "en", issuedDateEn: "18 October 2026", issuedDateAr: "", serialNo: '<img src="https://bad.invalid">', branding: { companyNameEn: "QA <script>alert(1)</script>", footerTextEn: "QA & retained", trn: "TEST", showTrn: false } };
it("shares canonical body with a separately versioned, escaped repeating print frame", () => {
  const result = renderOfficialDocumentPrintPackage(getOfficialDocumentDefinition("HR_EMPLOYMENT_LETTER")!, context);
  expect(OFFICIAL_DOCUMENT_LAYOUT_VERSION).toBe(3);
  expect(result.html).toContain(".od-footer{display:none}");
  expect(result.headerHtml).toContain("&lt;script&gt;"); expect(result.headerHtml).not.toContain("<script>");
  expect(result.footerHtml).toContain("pageNumber"); expect(result.footerHtml).toContain("totalPages");
  expect(result.footerHtml).toContain("QA &amp; retained"); expect(result.footerHtml).not.toContain("TRN:");
  expect(result.marginsMm).toEqual({ top: 18, bottom: 20, left: 18, right: 18 });
});
it('embeds Arabic even in an English document when its company header contains Arabic',()=>{
 const result=renderOfficialDocumentPrintPackage(getOfficialDocumentDefinition('HR_EMPLOYMENT_CONFIRMATION')!,{...context,branding:{companyNameEn:'QA',companyNameAr:'شركة اختبارية'}});expect(result.html).toContain('@font-face');
 const arabic=renderOfficialDocumentPrintPackage(getOfficialDocumentDefinition('HR_EMPLOYMENT_CONFIRMATION')!,{...context,language:'ar',branding:{companyNameEn:'QA',companyNameAr:'شركة اختبارية'}});expect(arabic.headerHtml).toContain('@font-face');expect(arabic.headerHtml).toContain('شركة اختبارية');
});
it('does not hide a separately authorized stamp when a form omits signature lines',()=>{
 const def=getOfficialDocumentDefinition('HR_EMPLOYMENT_CONFIRMATION')!;const stamp='data:image/png;base64,AAAA';
 const html=renderOfficialDocumentHtml({...def,build:ctx=>({...def.build(ctx),showSignature:false})},{...context,branding:{showStamp:true,stampUrl:stamp,showSignatory:false}});
 expect(html).toContain('alt="Stamp"');expect(html).not.toContain('alt="Signature"');expect(html).not.toContain('<div class="od-sig-rule">');
});
