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
 *              src/features/report-center/hr-letter-generator.tsx (Gotenberg option)
 *
 * Error handling:
 *  - Gotenberg offline → descriptive error with startup instructions
 *  - Permission denied → 403-style error
 *  - Employee not found → 404-style error
 */

import { getAuthContext } from "@/lib/rbac/check";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderPdf } from "@/lib/pdf/renderer";
import {
  buildPdfStoragePath,
  uploadGeneratedPdf,
  createPdfSignedUrl,
} from "@/lib/pdf/storage";
import { createPdfHistoryRow, markPdfGenerationFailed } from "@/lib/pdf/history";
import type { PdfRenderRequest } from "@/lib/pdf/types";

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
  // 1. Authenticate
  const ctx = await getAuthContext();
  if (!ctx) {
    return { success: false, error: "Not authenticated" };
  }

  // 2. Authorize — requires reports.pdf.generate permission
  const hasPermission =
    ctx.permissionCodes.includes("reports.pdf.generate") ||
    ctx.roleCodes.includes("system_admin") ||
    ctx.roleCodes.includes("group_admin") ||
    ctx.roleCodes.includes("company_admin");

  if (!hasPermission) {
    return {
      success: false,
      error: "You do not have permission to generate official PDFs (reports.pdf.generate).",
    };
  }

  const supabase = createAdminClient();

  // 3. Verify employee exists and belongs to an accessible company
  const { data: employee, error: empErr } = await supabase
    .from("employees")
    .select("id, employee_code, full_name_en, owner_company_id")
    .eq("id", input.employeeId)
    .single();

  if (empErr || !employee) {
    return { success: false, error: `Employee #${input.employeeId} not found.` };
  }

  const isGlobalAdmin =
    ctx.roleCodes.includes("system_admin") || ctx.roleCodes.includes("group_admin");

  // Company access check
  // (or be a group/system admin). We skip the per-company check for global admins.
  if (!isGlobalAdmin) {
    // Fetch user's accessible company IDs from user_roles
    const { data: userRoles } = await supabase
      .from("user_roles")
      .select("owner_company_id")
      .eq("user_id", ctx.profile?.id ?? 0)
      .not("owner_company_id", "is", null);

    const userCompanyIds = (userRoles ?? [])
      .map((r) => r.owner_company_id)
      .filter((id): id is number => id !== null);

    if (!userCompanyIds.includes(employee.owner_company_id)) {
      return {
        success: false,
        error: "You do not have access to this employee's company.",
      };
    }
  }

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

  // 7. Create signed download URL (60 min TTL)
  let downloadUrl: string;
  try {
    downloadUrl = await createPdfSignedUrl(finalStoragePath, 3600);
  } catch (urlErr) {
    return {
      success: false,
      error: `PDF was generated and stored, but signed URL creation failed: ${urlErr instanceof Error ? urlErr.message : "unknown"}`,
    };
  }

  return {
    success: true,
    downloadUrl,
    historyId,
    pageCount: result.pageCount,
    fileSizeBytes: result.fileSizeBytes,
    renderer: result.renderer,
  };
}
