import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ scope: true, active: true, changedActor: false, revokedBrand: false, renderer: vi.fn(), runner: vi.fn(), brand: vi.fn(), resolver:vi.fn(), selected: vi.fn(), from: vi.fn(), registry: {} as Record<string, unknown> }));
vi.mock("@/lib/rbac/check", () => ({ getAuthContext: async () => ({ profile: { id: m.changedActor ? 12 : 11 } }), canUseApplication: () => m.active }));
vi.mock("@/lib/rbac/employee-access", () => ({ getEmployeeAccess: async () => ({ subject: { id: 1, owner_company_id: 1 }, allows: () => m.scope }) }));
vi.mock("@/lib/report-center/report-runner", () => ({ runReport: m.runner }));
vi.mock("@/lib/report-center/template-export", () => ({ resolveTemplateForExport: m.brand }));
vi.mock('@/lib/report-center/branding-resolver',()=>({resolveReportBranding:m.resolver}));
vi.mock("@/lib/output/letterhead-selection", () => ({ requirePermittedLetterhead: m.selected }));
vi.mock("@/lib/output/html-adapter", async () => ({ ...await vi.importActual("@/lib/output/html-adapter"), renderOfficialHtmlToPdf: m.renderer }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: m.from }) }));
import { previewOfficialDocument } from "@/server/actions/output/preview-official-document";
import { OutputRenderError } from "@/lib/output/html-adapter";
const request = { outputCode: "HR_EMPLOYMENT_CONFIRMATION", employeeId: 1, language: "bilingual" as const, inputs: {} };
const branding = () => ({ companyNameEn: "SYNTHETIC EMPLOYER", companyNameAr: "شركة اختبار", provenance: { schemaVersion: 1, templateId: 2, ownerCompanyId: 1, templateRevision: "1", templateVersion: 1, brandingProfileId: 3, brandingRevision: "1", assets: [] } });
const data = () => ({ success: true, resolvedTemplateId: 2, data: { columns: [], rows: [{ employee_name: "SYNTHETIC EMPLOYEE", employee_name_ar: "موظف اختبار", employee_code: "SYN-1", designation: "Synthetic role", designation_ar: "وظيفة", joining_date: "2024-01-01", company_name: "SYNTHETIC EMPLOYER", owner_company_id: 1 }], meta: { sourceRecordId: 1 } } });
beforeEach(() => {
  vi.resetAllMocks(); m.scope = true; m.active = true; m.changedActor = false;
  m.registry = { report_code: request.outputCode, module_code: "HR", document_class: "A", required_permissions: [] };
  m.from.mockImplementation((table: string) => { expect(table).toBe("erp_report_registry"); const query = { select: () => query, eq: () => query, is: () => query, maybeSingle: async () => ({ data: m.registry, error: null }) }; return query; });
  m.runner.mockResolvedValue(data()); m.brand.mockImplementation(async () => branding());
  m.resolver.mockResolvedValue({resolvedTemplate:{id:2},requiresManualTemplateSelection:false});
  m.renderer.mockResolvedValue({ buffer: Buffer.from("%PDF-synthetic-unit-only"), sha256: "a".repeat(64) });
});
it.each(['HR_EMPLOYMENT_LETTER','HR_EMPLOYMENT_CONFIRMATION','HR_EXPERIENCE_LETTER','HR_SALARY_CERT_WITH_AMOUNT','HR_SALARY_CERT_GENERAL','HR_NOC','HR_WARNING_LETTER','HR_CLEARANCE_FORM','HR_JOINING_CHECKLIST','HR_PPE_ISSUE_FORM','HR_BANK_SALARY_TRANSFER','HR_EMBASSY_LETTER','HR_HANDOVER_FORM','HR_LEAVE_CONFIRMATION'])('previews %s as labelled sample wording without fetching employee facts',async outputCode=>{
 m.registry={...m.registry,report_code:outputCode};
 const result=await previewOfficialDocument({...request,outputCode,wordingReview:true});
 expect(result).toMatchObject({success:true,notice:expect.stringContaining('SYNTHETIC DETAILS ONLY')});
 expect(m.runner).not.toHaveBeenCalled();
 const html=m.renderer.mock.calls[0][0].html;
 expect(html).toContain('WORDING REVIEW — SAMPLE DATA ONLY — NOT ISSUED');expect(html).toContain('SAMPLE EMPLOYEE');
 expect(html).not.toContain('SYNTHETIC EMPLOYEE');expect(html).not.toContain('/verify/');expect(html).not.toContain('<div class="od-signature">');
 expect(m.from.mock.calls.every(([table])=>table==='erp_report_registry')).toBe(true);
});
it.each(['HR_BANK_SALARY_TRANSFER','HR_EMBASSY_LETTER','HR_HANDOVER_FORM','HR_LEAVE_CONFIRMATION'])('does not render %s with missing source selection or particulars',async outputCode=>{
 m.registry={...m.registry,report_code:outputCode};expect(await previewOfficialDocument({...request,outputCode})).toMatchObject({success:false,error:expect.any(String)});
 expect(m.renderer).not.toHaveBeenCalled();
});
it('sample previews still require current employee scope and discard bytes after revocation',async()=>{
 m.renderer.mockImplementation(async()=>{m.scope=false;return {buffer:Buffer.from('%PDF sample'),sha256:'a'.repeat(64)};});
 const result=await previewOfficialDocument({...request,wordingReview:true});expect(result.success).toBe(false);expect(result).not.toHaveProperty('pdfBase64');
});
it('sample mode cannot take a foreign default letterhead or bypass manual-selection requirements',async()=>{
 m.resolver.mockResolvedValue({requiresManualTemplateSelection:true,resolvedTemplate:{id:2}});
 expect(await previewOfficialDocument({...request,wordingReview:true})).toMatchObject({success:false,error:expect.stringContaining('Select a governed company letterhead')});
 expect(m.renderer).not.toHaveBeenCalled();
});
it("uses canonical bilingual draft layout, exact employee/company and no official writer", async () => {
  const result = await previewOfficialDocument(request); expect(result.success).toBe(true);
  expect(m.runner).toHaveBeenCalledWith(expect.objectContaining({ filters: { employee_id: "1" }, ownerCompanyIds: [1] }), expect.anything());
  expect(m.brand).toHaveBeenCalledWith(expect.objectContaining({ templateId: 2, forIssuance: true, omitOfficialMarks: true }));
  const plan = m.renderer.mock.calls[0][0]; expect(plan.html).toContain("Draft — Not Officially Issued"); expect(plan.html).toContain("SYNTHETIC EMPLOYEE");expect(plan.html).not.toContain('<div class="od-signature">');
  expect(plan.footerHtml).toContain('class="totalPages"'); expect(plan.html).not.toContain("/verify/");
  expect(m.from.mock.calls.every(([table]) => table === "erp_report_registry")).toBe(true);
});
it("permits clearly labelled drafts without inventing business wording approval", async () => { expect(await previewOfficialDocument(request)).toMatchObject({ success: true, notice: expect.stringContaining("No signature, stamp, serial or active verification link") }); });
it("rejects a named bilingual recipient without its Arabic value before rendering",async()=>{
  expect(await previewOfficialDocument({...request,inputs:{recipient_mode:'specific',recipient_organization_en:'QA Bank'}})).toMatchObject({success:false,error:expect.stringContaining('Arabic')});
  expect(m.runner).not.toHaveBeenCalled();expect(m.renderer).not.toHaveBeenCalled();
});
it("embeds the named recipient in the current draft while keeping the source subject fixed",async()=>{
  expect(await previewOfficialDocument({...request,inputs:{recipient_mode:'specific',recipient_organization_en:'QA Bank',recipient_department_ar:'قسم الاختبار'}})).toMatchObject({success:true,definitionVersion:2});
  expect(m.renderer.mock.calls[0][0].html).toContain('QA Bank');expect(m.renderer.mock.calls[0][0].html).toContain('قسم الاختبار');
  expect(m.runner.mock.calls[0][0].filters).toEqual({employee_id:'1'});
});
it("keeps missing-wording definitions unavailable", async () => { expect(await previewOfficialDocument({ ...request, outputCode: "HR_EMBASSY_LETTER" })).toMatchObject({ success: false }); expect(m.renderer).not.toHaveBeenCalled(); });
it("rejects undeclared inputs and invalid languages before rendering", async () => { expect(await previewOfficialDocument({ ...request, inputs: { html: "<script>" } })).toMatchObject({ success: false }); expect(await previewOfficialDocument({ ...request, language: "xx" as "en" })).toMatchObject({ success: false }); expect(m.renderer).not.toHaveBeenCalled(); });
it("gives a useful missing-field list instead of rendering blank personal data", async () => { const report = data(); report.data.rows[0].employee_name = ""; m.runner.mockResolvedValue(report); const result = await previewOfficialDocument(request); expect(result).toMatchObject({ success: false, error: expect.stringMatching(/name/i) }); expect(m.renderer).not.toHaveBeenCalled(); });
it.each(["subject", "company"])("rejects mismatched %s data", async mode => { const report = data(); if (mode === "subject") report.data.meta.sourceRecordId = 9; else report.data.rows[0].owner_company_id = 9; m.runner.mockResolvedValue(report); expect(await previewOfficialDocument(request)).toMatchObject({ success: false }); expect(m.renderer).not.toHaveBeenCalled(); });
it("does not substitute an unrelated company's letterhead", async () => { m.brand.mockResolvedValue({ ...branding(), provenance: { ...branding().provenance, ownerCompanyId: 9 } }); expect(await previewOfficialDocument(request)).toMatchObject({ success: false }); expect(m.renderer).not.toHaveBeenCalled(); });
it("fails closed on inactive/missing current permissions", async () => { m.scope = false; expect(await previewOfficialDocument(request)).toMatchObject({ success: false }); expect(m.runner).not.toHaveBeenCalled(); m.active = false; expect(await previewOfficialDocument(request)).toMatchObject({ success: false }); });
it.each(["actor", "scope", "brand"])("discards completed bytes after a concurrent %s change", async mode => {
  m.renderer.mockImplementation(async () => { if (mode === "actor") m.changedActor = true; if (mode === "scope") m.scope = false; if (mode === "brand") m.brand.mockResolvedValue(null); return { buffer: Buffer.from("%PDF-unit"), sha256: "a".repeat(64) }; });
  const result = await previewOfficialDocument(request); expect(result.success).toBe(false); expect(result).not.toHaveProperty("pdfBase64");
});
it("fails closed on renderer errors without returning private error text", async () => { m.renderer.mockRejectedValue(Error("PRIVATE_DATA_FAILURE")); const result = await previewOfficialDocument(request); expect(result).toMatchObject({ success: false }); expect(JSON.stringify(result)).not.toContain("PRIVATE_DATA"); });
it.each([true, false])("explains renderer failure safely (retryable=%s) without blaming permissions", async retryable => {
  m.renderer.mockRejectedValue(new OutputRenderError("PRIVATE_RENDERER_URL_AND_PAYLOAD", retryable));
  const result = await previewOfficialDocument(request);
  expect(result).toMatchObject({success: false, error: expect.stringContaining(retryable ? "PDF preview service is unavailable" : "PDF service could not render")});
  expect(result).not.toHaveProperty("pdfBase64");
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE_|access or letterhead may have changed/);
  expect(m.brand).toHaveBeenCalledTimes(1);
});
it("bounds serialized draft bytes", async () => { m.renderer.mockResolvedValue({ buffer: Buffer.alloc(8 * 1024 * 1024 + 1), sha256: "a".repeat(64) }); expect(await previewOfficialDocument(request)).toMatchObject({ success: false, error: expect.stringContaining("too large") }); });
