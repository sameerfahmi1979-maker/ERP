"use server";

import { generateOfficialDocument } from "@/server/actions/output/generate-official-document";

/** Compatibility adapter only. The standalone print/upload/history writer is
 * retired: it cannot honour original-request recovery. No active source caller
 * remains; clients must retain a token or use Employee Letters & Forms. */
export interface GenerateHrLetterPdfInput {
  employeeId: number;
  templateKey?: string;
  clientRequestToken?: string;
}
export interface GenerateHrLetterPdfResult {
  success: true; downloadUrl: string; historyId: number; pageCount: number; fileSizeBytes: number; renderer: string;
}
export interface GenerateHrLetterPdfError { success: false; error: string; gotenbergOffline?: boolean }

export async function generateHrEmploymentLetterPdf(input: GenerateHrLetterPdfInput): Promise<GenerateHrLetterPdfResult | GenerateHrLetterPdfError> {
  if (!input || !Number.isSafeInteger(input.employeeId) || input.employeeId <= 0 ||
      (input.templateKey !== undefined && input.templateKey !== "hr-employment-letter-en") ||
      typeof input.clientRequestToken !== "string" || !/^[A-Za-z0-9_-]{8,200}$/.test(input.clientRequestToken)) {
    return { success: false, error: "Use Employee Letters & Forms, or retain a valid original request token before generating an employment letter." };
  }
  const outcome = await generateOfficialDocument("HR_EMPLOYMENT_LETTER", input.employeeId, {
    issueQr: true, authorizeReissue: true, language: "en", clientRequestToken: input.clientRequestToken,
  });
  if (!outcome.success) return { success: false, error: outcome.error };
  return { success: true, downloadUrl: outcome.downloadUrl ?? "", historyId: outcome.issuanceId, pageCount: 0,
    fileSizeBytes: outcome.fileSizeBytes, renderer: "gotenberg_html" };
}
