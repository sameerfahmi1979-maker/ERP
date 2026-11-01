import { expect, it } from "vitest";
import { getOfficialDocumentDefinition } from "@/lib/official-documents/registry";
import { renderOfficialDocumentPrintPackage, renderOfficialDocumentHtml, OFFICIAL_DOCUMENT_LAYOUT_VERSION } from "@/lib/official-documents/layout/render";
import type { OfficialDocumentRenderContext } from "@/lib/official-documents/types";
const context: OfficialDocumentRenderContext = { row: { employee_name: "Synthetic", employee_code: "QA", designation: "QA", company_name: "QA", joining_date: "2026-01-01" }, rows: [], inputs: {}, language: "en", issuedDateEn: "18 October 2026", issuedDateAr: "", serialNo: '<img src="https://bad.invalid">', branding: { companyNameEn: "QA <script>alert(1)</script>", footerTextEn: "QA & retained", trn: "TEST", showTrn: false } };
it("shares canonical body with a separately versioned, escaped repeating print frame", () => {
  const result = renderOfficialDocumentPrintPackage(getOfficialDocumentDefinition("HR_EMPLOYMENT_LETTER")!, context);
  expect(OFFICIAL_DOCUMENT_LAYOUT_VERSION).toBe(7);
  expect(result.html).toContain(".od-footer,.od-header{display:none}");
  expect(result.headerHtml).toContain("&lt;script&gt;"); expect(result.headerHtml).not.toContain("<script>");
  expect(result.footerHtml).toContain("pageNumber"); expect(result.footerHtml).toContain("totalPages");
  expect(result.footerHtml).toContain("QA &amp; retained"); expect(result.footerHtml).not.toContain("TRN:");
  expect(result.marginsMm).toEqual({ top: 25, bottom: 20, left: 18, right: 18 });
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
it('centres the right-hand company block and keeps its complete address/contact row',()=>{
 const html=renderOfficialDocumentHtml(getOfficialDocumentDefinition('HR_EMPLOYMENT_CONFIRMATION')!,{...context,branding:{companyNameEn:'QA COMPANY',companyNameAr:'شركة اختبار',addressBlockEn:'Abu Dhabi,\n UAE',phone:'+971-2-4910131',email:'info@algt.net',website:'https://www.algt.net'}});
 expect(html).toContain('.od-header-names { min-width:0; text-align:center;');
 expect(html).toContain('<div class="od-header-contact" dir="ltr">Abu Dhabi, UAE · Tel: +971-2-4910131 · info@algt.net · https://www.algt.net</div>');
 expect(html.match(/class="od-header-contact"/g)).toHaveLength(1);
 expect(html).toContain('overflow-wrap:anywhere');
});
it('escapes combined contact details and omits empty items without dangling separators',()=>{
 const html=renderOfficialDocumentHtml(getOfficialDocumentDefinition('HR_EMPLOYMENT_CONFIRMATION')!,{...context,branding:{companyNameEn:'QA',addressBlockEn:'QA <script>',email:'qa@example.invalid'}});
 expect(html).toContain('QA &lt;script&gt; · qa@example.invalid</div>');expect(html).not.toContain('QA <script>');
 const empty=renderOfficialDocumentHtml(getOfficialDocumentDefinition('HR_EMPLOYMENT_CONFIRMATION')!,{...context,branding:{companyNameEn:'QA'}});
 expect(empty).not.toContain('class="od-header-contact"');
});
it('places the complete letterhead in the repeating PDF frame without an extra small heading or duplicate body masthead',()=>{
 const result=renderOfficialDocumentPrintPackage(getOfficialDocumentDefinition('HR_EMPLOYMENT_CONFIRMATION')!,{...context,branding:{companyNameEn:'QA',showLogo:true,logoUrl:'data:image/png;base64,AAAA',addressBlockEn:'QA address'}});
 expect(result.headerHtml).toContain('class="od-header-logo"');expect(result.headerHtml).toContain('class="od-header-names"');
 expect(result.headerHtml.match(/class="od-header"/g)).toHaveLength(1);expect(result.headerHtml).not.toContain('running-company');
 expect(result.html).toContain('.od-footer,.od-header{display:none}');expect(result.footerHtml).toContain('.legal{text-align:center;');
});
it('lets the names block use the available width when no logo is configured',()=>{
 const result=renderOfficialDocumentPrintPackage(getOfficialDocumentDefinition('HR_EMPLOYMENT_CONFIRMATION')!,{...context,branding:{companyNameEn:'QA without logo',showLogo:false}});
 expect(result.headerHtml).not.toContain('<td class="od-header-logo">');expect(result.headerHtml).toContain('QA without logo');
 expect(result.headerHtml).not.toContain('<img');
});
it('places the complete letterhead in the repeating PDF frame without an extra small heading or duplicate body masthead',()=>{
 const result=renderOfficialDocumentPrintPackage(getOfficialDocumentDefinition('HR_EMPLOYMENT_CONFIRMATION')!,{...context,branding:{companyNameEn:'QA',showLogo:true,logoUrl:'data:image/png;base64,AAAA',addressBlockEn:'QA address'}});
 expect(result.headerHtml).toContain('class="od-header-logo"');expect(result.headerHtml).toContain('class="od-header-names"');
 expect(result.headerHtml.match(/class="od-header"/g)).toHaveLength(1);expect(result.headerHtml).not.toContain('running-company');
 expect(result.html).toContain('.od-footer,.od-header{display:none}');expect(result.footerHtml).toContain('.legal{text-align:center;');
});
it('lets the names block use the available width when no logo is configured',()=>{
 const result=renderOfficialDocumentPrintPackage(getOfficialDocumentDefinition('HR_EMPLOYMENT_CONFIRMATION')!,{...context,branding:{companyNameEn:'QA without logo',showLogo:false}});
 expect(result.headerHtml).not.toContain('<td class="od-header-logo">');expect(result.headerHtml).toContain('QA without logo');
 expect(result.headerHtml).not.toContain('<img');
});
