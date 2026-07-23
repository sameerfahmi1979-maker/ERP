/**
 * ERP PDF Generation — Storage
 * Phase: ERP PDF.1 — Production PDF Generation Framework (2026-07-23)
 *
 * Uploads generated PDF files to the private `erp-generated-pdfs` Supabase Storage bucket.
 * Uses admin client for server-side uploads only.
 */

import { createAdminClient } from "@/lib/supabase/admin";

const PDF_BUCKET = "erp-generated-pdfs";

/**
 * Builds a predictable (but non-guessable) storage path for a generated PDF.
 * Format: {module}/{sourceRecordType}/{ownerCompanyId}/{sourceRecordId}/{timestamp}_{label}.pdf
 */
export function buildPdfStoragePath(params: {
  module: string;
  sourceRecordType: string;
  ownerCompanyId: number;
  sourceRecordId: number;
  templateKey: string;
  outputLabel?: string;
}): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
  const label = params.outputLabel
    ? params.outputLabel.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 50)
    : params.templateKey.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 50);

  return [
    params.module.toLowerCase(),
    params.sourceRecordType.toLowerCase(),
    String(params.ownerCompanyId),
    String(params.sourceRecordId),
    `${ts}_${label}.pdf`,
  ].join("/");
}

/**
 * Uploads a PDF buffer to the private `erp-generated-pdfs` bucket.
 * Returns the storage path on success.
 */
export async function uploadGeneratedPdf(
  buffer: Buffer,
  storagePath: string,
): Promise<string> {
  const supabase = createAdminClient();

  const { error } = await supabase.storage
    .from(PDF_BUCKET)
    .upload(storagePath, buffer, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (error) {
    throw new Error(`[PDF Storage] Upload failed: ${error.message}`);
  }

  return storagePath;
}

/**
 * Creates a signed URL for downloading a generated PDF.
 * Expires in the specified number of seconds (default 1 hour).
 */
export async function createPdfSignedUrl(
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.storage
    .from(PDF_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(`[PDF Storage] Signed URL creation failed: ${error?.message ?? "no URL"}`);
  }

  return data.signedUrl;
}

/**
 * Deletes a PDF file from storage (for failed-generation cleanup).
 * Non-fatal — logs error but does not throw.
 */
export async function deletePdfFromStorage(storagePath: string): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.storage.from(PDF_BUCKET).remove([storagePath]);
  } catch (err) {
    console.error("[PDF Storage] Delete failed (non-fatal):", err);
  }
}
