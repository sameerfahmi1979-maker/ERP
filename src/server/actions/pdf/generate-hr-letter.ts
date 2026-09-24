"use server";

/**
 * Server Action: generateHrEmploymentLetterPdf
 * Phase: ERP PDF.1 — Production PDF Generation Framework (2026-07-23)
 *
 * Generates an official HR Employment Letter PDF via Gotenberg.
 *
 * Flow:
 *  1. Authenticate + authorize (reports.pdf.generate permission)
 *  2. Verify employee belongs to a company accessible to the user
 *  3. Call renderPdf() → Gotenberg renders the secure print route
 *  4. Upload to private erp-generated-pdfs bucket
 *  5. Create immutable history row
 *  6. Return signed download URL (60 minute TTL)
 *
 * Called from: src/features/hr/employees/tabs/employee-hr-actions-tab.tsx
 *              src/features/hr/employees/employee-letters-forms.tsx (OUTPUT.4)
 *
 * Error handling:
 *  - Gotenberg offline → descriptive error with startup instructions
 *  - Permission denied → 403-style error
 *  - Employee not found → 404-style error
 */

import { getAuthContext } from "@/lib/rbac/check";
import { getEmployeeAccess } from "@/lib/rbac/employee-access";
import { issuedFileUrl } from "@/lib/output/issued-file-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderPdf } from "@/lib/pdf/renderer";
import {
  buildPdfStoragePath,
  uploadGeneratedPdf,
} from "@/lib/pdf/storage";
import { createPdfHistoryRow, markPdfGenerationFailed } from "@/lib/pdf/history";
import type { PdfRenderRequest } from "@/lib/pdf/types";
import { isLegacyEmploymentLetterPathEnabled } from "@/lib/output/feature-flags";
import { generateOfficialDocument } from "@/server/actions/output/generate-official-document";

export interface GenerateHrLetterPdfInput {
  employeeId: number;
  /** Defaults to 'hr-employment-letter-en' */
  templateKey?: string;
}

export interface GenerateHrLetterPdfResult {
  success: true;
  downloadUrl: string;
  historyId: number;
  pageCount: number;
  fileSizeBytes: number;
  renderer: string;
}

export interface GenerateHrLetterPdfError {
  success: false;
  error: string;
  /** True if Gotenberg is offline — UI should show startup instructions */
  gotenbergOffline?: boolean;
}

export async function generateHrEmploymentLetterPdf(
  input: GenerateHrLetterPdfInput,
): Promise<GenerateHrLetterPdfResult | GenerateHrLetterPdfError> {
  // OUTPUT.2: the employment letter is issued through the global coordinator
  // (registry code HR_EMPLOYMENT_LETTER, Class B). The legacy standalone
  // print-route path is preserved behind OUTPUT_LEGACY_EMPLOYMENT_LETTER_ENABLED
  // as a rollback flag until OUTPUT.5 UAT passes (WP9).
  if (!isLegacyEmploymentLetterPathEnabled()) {
    const outcome = await generateOfficialDocument("HR_EMPLOYMENT_LETTER", input.employeeId, {
      issueQr: true,
      authorizeReissue: true, // regenerating an employment letter is a routine authorized reissue
    });
    if (outcome.success) {
      return {
        success: true,
        downloadUrl: outcome.downloadUrl ?? "",
        historyId: outcome.issuanceId,
        pageCount: 0,
        fileSizeBytes: outcome.fileSizeBytes,
        renderer: "gotenberg_html",
      };
    }
    const isOffline =
      outcome.blocked === "render_failed_retryable" &&
      /unavailable|health check/i.test(outcome.error);
    return { success: false, error: outcome.error, gotenbergOffline: isOffline };
  }

  return generateHrEmploymentLetterPdfLegacy(input);
}

/**
 * LEGACY Pipeline A (pre-OUTPUT.2) — kept verbatim for rollback only.
 * Remove after WP9 (OUTPUT.5) passes and the rollback window closes.
 */
async function generateHrEmploymentLetterPdfLegacy(
  input: GenerateHrLetterPdfInput,
): Promise<GenerateHrLetterPdfResult | GenerateHrLetterPdfError> {
  const ctx = await getAuthContext();
  try {
    const access = await getEmployeeAccess(ctx, input.employeeId);
    if (!access.allows("reports.pdf.generate") || !access.allows("reports.export")) return { success: false, error: "You do not have generation/export permission for this employee." };
  } catch { return { success: false, error: "Employee unavailable or access denied." }; }
  // This rollback path supports exactly one reviewed template, not a client-selected print route.
  if (input.templateKey && input.templateKey !== "hr-employment-letter-en") return { success: false, error: "Unsupported legacy template." };
  const { data: employee, error: empErr } = await createAdminClient().from("employees")
    .select("id,employee_code,full_name_en,owner_company_id").eq("id", input.employeeId).is("deleted_at", null).single();
  if (empErr || !employee) return { success: false, error: "Employee unavailable." };

  const templateKey = input.templateKey ?? "hr-employment-letter-en";
  const outputLabel = `Employment_Letter_${employee.employee_code ?? employee.id}`;
  const storagePath = buildPdfStoragePath({
    module: "hr",
    sourceRecordType: "employee",
    ownerCompanyId: employee.owner_company_id,
    sourceRecordId: employee.id,
    templateKey,
    outputLabel,
  });

  const renderRequest: PdfRenderRequest = {
    templateKey,
    ownerCompanyId: employee.owner_company_id,
    sourceRecordType: "employee",
    sourceRecordId: employee.id,
    locale: "en",
    direction: "ltr",
    pageSize: "A4",
    orientation: "portrait",
    outputProfile: "standard",
    outputLabel,
  };

  const userId = ctx.profile?.id ?? 0;

  // 4. Render via Gotenberg
  let result;
  try {
    result = await renderPdf(renderRequest, { userId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isOffline = msg.includes("Gotenberg service is unavailable");
    return {
      success: false,
      error: msg,
      gotenbergOffline: isOffline,
    };
  }

  // 5. Upload to private storage
  let finalStoragePath: string;
  try {
    finalStoragePath = await uploadGeneratedPdf(result.fileBuffer, storagePath);
  } catch (uploadErr) {
    // Try to create a failed history row for audit purposes
    await createPdfHistoryRow({
      request: renderRequest,
      result: { ...result, fileSizeBytes: 0, pageCount: 0 },
      storagePath: "FAILED",
      fileName: `${outputLabel}_FAILED.pdf`,
      module: "HR",
      generatedBy: userId,
    }).then((id) => markPdfGenerationFailed(id, uploadErr instanceof Error ? uploadErr.message : "Upload failed")).catch(() => {/* non-fatal */});
    return {
      success: false,
      error: `PDF generation succeeded but storage upload failed: ${uploadErr instanceof Error ? uploadErr.message : "unknown error"}`,
    };
  }

  // 6. Create immutable history row
  let historyId: number;
  try {
    historyId = await createPdfHistoryRow({
      request: renderRequest,
      result,
      storagePath: finalStoragePath,
      fileName: `${outputLabel}.pdf`,
      templateId: undefined,
      module: "HR",
      generatedBy: userId,
    });
  } catch (histErr) {
    // Non-fatal — PDF is stored but history tracking failed
    console.error("[generateHrLetter] History row creation failed:", histErr);
    historyId = 0;
  }

  if (!historyId) return { success: false, error: "The file was stored but its history could not be recorded. Administrator reconciliation is required; no download was issued." };
  const downloadUrl = issuedFileUrl(historyId);

  return {
    success: true,
    downloadUrl,
    historyId,
    pageCount: result.pageCount,
    fileSizeBytes: result.fileSizeBytes,
    renderer: result.renderer,
  };
}
