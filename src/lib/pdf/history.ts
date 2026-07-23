/**
 * ERP PDF Generation — Document History
 * Phase: ERP PDF.1 — Production PDF Generation Framework (2026-07-23)
 *
 * Writes and reads `erp_generated_pdf_documents` rows.
 * Uses admin client — the insert is always server-side.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  PdfRenderRequest,
  PdfRenderResult,
  PdfOutputProfile,
  PdfLocale,
  PdfDirection,
} from "./types";

export interface CreatePdfHistoryParams {
  request: PdfRenderRequest;
  result: PdfRenderResult;
  storagePath: string;
  fileName: string;
  templateId?: number;
  templateVersion?: number;
  module: string;
  generatedBy: number;
}

/**
 * Inserts an immutable `erp_generated_pdf_documents` row after a successful generation.
 * Returns the new row ID.
 */
export async function createPdfHistoryRow(params: CreatePdfHistoryParams): Promise<number> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("erp_generated_pdf_documents")
    .insert({
      template_key: params.request.templateKey,
      template_id: params.templateId ?? null,
      template_version: params.templateVersion ?? 1,
      source_record_type: params.request.sourceRecordType,
      source_record_id: params.request.sourceRecordId,
      owner_company_id: params.request.ownerCompanyId,
      storage_path: params.storagePath,
      file_name: params.fileName,
      mime_type: "application/pdf",
      file_size_bytes: params.result.fileSizeBytes,
      page_count: params.result.pageCount,
      checksum: params.result.checksum,
      renderer: params.result.renderer,
      renderer_version: params.result.rendererVersion,
      output_profile: params.request.outputProfile as PdfOutputProfile,
      locale: params.request.locale as PdfLocale,
      direction: params.request.direction as PdfDirection,
      generated_by: params.generatedBy,
      validation_status: params.result.validationStatus,
      validation_report: params.result.validationReport ?? null,
      approval_status: null,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`[PDF History] Failed to write history row: ${error?.message ?? "no data"}`);
  }

  return data.id as number;
}

/**
 * Marks a history row as having a failed generation (sets failure_reason).
 * Non-fatal — does not throw on secondary failure.
 */
export async function markPdfGenerationFailed(
  historyRowId: number,
  reason: string,
): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase
      .from("erp_generated_pdf_documents")
      .update({ failure_reason: reason.substring(0, 500) })
      .eq("id", historyRowId);
  } catch (err) {
    console.error("[PDF History] markPdfGenerationFailed error (non-fatal):", err);
  }
}

/**
 * Lists PDF history rows for a given source record.
 * Returns the most recent first.
 */
export async function listPdfHistoryForRecord(
  sourceRecordType: string,
  sourceRecordId: number,
  limit = 20,
) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("erp_generated_pdf_documents")
    .select("*")
    .eq("source_record_type", sourceRecordType)
    .eq("source_record_id", sourceRecordId)
    .order("generated_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`[PDF History] List failed: ${error.message}`);
  }

  return data ?? [];
}
