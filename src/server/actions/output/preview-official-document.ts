"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUseApplication, getAuthContext } from "@/lib/rbac/check";
import { getEmployeeAccess } from "@/lib/rbac/employee-access";
import { runReport } from "@/lib/report-center/report-runner";
import { resolveTemplateForExport } from "@/lib/report-center/template-export";
import { requirePermittedLetterhead } from "@/lib/output/letterhead-selection";
import { buildInputsSchema, findMissingDataError, getOfficialDocumentDefinition, isGeneratable } from "@/lib/official-documents/registry";
import { renderOfficialDocumentPrintPackage, OFFICIAL_DOCUMENT_LAYOUT_VERSION } from "@/lib/official-documents/layout/render";
import { renderOfficialHtmlToPdf } from "@/lib/output/html-adapter";
import { renderPlanSchema } from "@/lib/output/recovery-plan";
import { injectDraftWatermark } from "@/lib/output/draft-watermark";
import type { ReportRegistryEntry } from "@/lib/report-center/types";

const requestSchema = z.object({ outputCode: z.string().regex(/^[A-Z0-9_]{1,100}$/), employeeId: z.number().int().positive().refine(Number.isSafeInteger),
  language: z.enum(["en", "ar", "bilingual"]), templateId: z.number().int().positive().refine(Number.isSafeInteger).optional(),
  inputs: z.record(z.string(), z.string().max(5000)).default({}) }).strict();

/** Canonical PDF draft, not an issuance. No serial/link/history/storage writer.
 * Pending business approval may be reviewed as a draft; missing wording may not. */
export async function previewOfficialDocument(request: z.input<typeof requestSchema>) {
  try {
    const parsed = requestSchema.safeParse(request);
    if (!parsed.success) return { success: false as const, error: "Choose a valid document, employee, language and letterhead." };
    const input = parsed.data, ctx = await getAuthContext();
    if (!ctx.profile?.id || !canUseApplication(ctx)) return { success: false as const, error: "Sign in again before previewing a document." };
    const access = await getEmployeeAccess(ctx, input.employeeId);
    const result = await createAdminClient().from("erp_report_registry").select("*").eq("report_code", input.outputCode).eq("is_active", true).is("deleted_at", null).maybeSingle();
    if (result.error) throw Error("Registry unavailable");
    const registry = result.data as (ReportRegistryEntry & { document_class?: string }) | null;
    if (!registry || registry.module_code !== "HR" || !["A", "B", "C", "D"].includes(registry.document_class ?? "")) return { success: false as const, error: "This employee document is not available." };
    const permissions = ["reports.run", "reports.pdf.generate", ...registry.required_permissions];
    if (!permissions.every(access.allows)) return { success: false as const, error: "This document is outside your permitted employee access." };
    const definition = getOfficialDocumentDefinition(input.outputCode);
    if (!definition || !isGeneratable(definition) || !definition.supportedLanguages.includes(input.language)) return { success: false as const, error: "Wording for this document or language is not available for preview." };
    const values = buildInputsSchema(definition).safeParse(input.inputs);
    if (!values.success) return { success: false as const, error: values.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("\n") };
    await requirePermittedLetterhead({ selectedTemplateId: input.templateId, ownerCompanyId: access.subject.owner_company_id,
      canOverride: access.allows("reports.branding.override"), registry, principal: ctx });
    const report = await runReport({ reportCode: input.outputCode, outputFormat: "pdf", filters: { employee_id: String(input.employeeId) },
      ownerCompanyIds: [access.subject.owner_company_id], templateId: input.templateId, requestedByUserId: ctx.profile.id }, ctx);
    const data = report.data;
    if (!report.success || !data?.rows.length) return { success: false as const, error: "Document data could not be completely verified. Refresh the selected record and try again." };
    if (Number(data.meta?.sourceRecordId) !== input.employeeId || data.rows.some(row => Number(row.owner_company_id) !== access.subject.owner_company_id)) throw Error("Mismatched source");
    const missing = findMissingDataError(definition, data.rows[0]);
    if (missing) return { success: false as const, error: missing };
    const templateId = input.templateId ?? report.resolvedTemplateId;
    if (!templateId) return { success: false as const, error: "Select a governed company letterhead to preview this document." };
    const branding = await resolveTemplateForExport({ templateId, reportCode: input.outputCode, principalId: ctx.profile.id, forIssuance: true, omitOfficialMarks: true });
    if (!branding?.provenance || (branding.provenance.ownerCompanyId !== access.subject.owner_company_id && !branding.isGroupProfile && !branding.isNeutralProfile)) throw Error("Unavailable letterhead");
    const now = new Date(), previewId = randomUUID();
    const plan = renderPlanSchema.parse({ ...renderOfficialDocumentPrintPackage(definition, { row: data.rows[0], rows: data.rows, inputs: values.data as Record<string, string>,
      language: input.language, branding, draft: true, serialNo: null, issuedDateEn: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(now),
      issuedDateAr: new Intl.DateTimeFormat("ar-AE-u-nu-arab", { day: "numeric", month: "long", year: "numeric" }).format(now) }), layoutVersion: OFFICIAL_DOCUMENT_LAYOUT_VERSION });
    plan.html = injectDraftWatermark(plan.html);
    if ([plan.html, plan.headerHtml, plan.footerHtml].some(part => /(?:src\s*=\s*["']https?:|url\(\s*["']?https?:|@import|<script\b)/i.test(part ?? ""))) throw Error("Draft resources must be embedded");
    const pdf = await renderOfficialHtmlToPdf(plan);
    // Bound serialized preview responses, not just renderer/Storage limits.
    if (pdf.buffer.length > 8 * 1024 * 1024) return { success: false as const, error: "This preview is too large for an interactive draft. Reduce its content." };
    const fresh = await getAuthContext();
    if (fresh.profile?.id !== ctx.profile.id || !canUseApplication(fresh)) throw Error("Principal changed");
    const current = await getEmployeeAccess(fresh, input.employeeId);
    if (current.subject.owner_company_id !== access.subject.owner_company_id || !permissions.every(current.allows)) throw Error("Access changed");
    const currentBranding = await resolveTemplateForExport({ templateId, reportCode: input.outputCode, principalId: fresh.profile.id, forIssuance: true, omitOfficialMarks: true });
    if (!currentBranding || JSON.stringify(currentBranding.provenance) !== JSON.stringify(branding.provenance)) throw Error("Brand changed during rendering");
    return { success: true as const, previewId, pdfBase64: pdf.buffer.toString("base64"), sha256: pdf.sha256,
      language: input.language, templateId, definitionVersion: definition.version, layoutVersion: OFFICIAL_DOCUMENT_LAYOUT_VERSION,
      asOf: now.toISOString(), notice: "DRAFT - NOT ISSUED. Wording approval and official issuance remain separate. No signature, stamp, serial or active verification link." };
  } catch {
    return { success: false as const, error: "The draft could not be verified or rendered. Your access or letterhead may have changed; refresh and try again. No official document was issued." };
  }
}
