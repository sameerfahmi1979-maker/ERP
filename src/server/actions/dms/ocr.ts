"use server";

/**
 * DMS.9 — OCR Pipeline Server Actions
 *
 * Manual OCR trigger, status queries, text retrieval, retry and skip.
 * No AI classification or field extraction is performed.
 * OCR text is never logged in audit records.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import { getOcrProvider, isOcrSupported } from "@/lib/dms/ocr/factory";
import type { OcrStatus } from "@/lib/dms/ocr/types";
import { revalidatePath } from "next/cache";
import { writeDocumentContentTextSystem } from "@/server/actions/dms/document-content";
import { normalizeDmsContentText, contentTextFileSeparator } from "@/lib/dms/content-text";

// ── Types ────────────────────────────────────────────────────────────────────

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type DmsOcrFileStatus = {
  file_id: number;
  file_name: string;
  mime_type: string;
  ocr_status: OcrStatus;
  ocr_provider: string | null;
  ocr_model: string | null;
  ocr_started_at: string | null;
  ocr_completed_at: string | null;
  ocr_error_message: string | null;
  ocr_confidence: number | null;
  ocr_page_count: number | null;
  ocr_language: string | null;
  has_text: boolean;
};

export type DmsOcrDocumentStatus = {
  document_id: number;
  ocr_status: OcrStatus;
  ocr_last_run_at: string | null;
  ocr_text_available: boolean;
  files: DmsOcrFileStatus[];
};

export type DmsOcrJobRow = {
  id: number;
  document_id: number | null;
  file_id: number | null;
  job_type: string;
  provider: string | null;
  model: string | null;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
};

// ── Permission helpers ────────────────────────────────────────────────────────

function canViewOcr(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return (
    hasPermission(ctx, "dms.documents.ocr.view") ||
    hasPermission(ctx, "dms.documents.view") ||
    hasPermission(ctx, "dms.documents.preview") ||
    hasPermission(ctx, "dms.admin")
  );
}

function canTriggerOcr(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return (
    hasPermission(ctx, "dms.documents.ocr.trigger") ||
    hasPermission(ctx, "dms.documents.edit") ||
    hasPermission(ctx, "dms.admin")
  );
}

function canRetryOcr(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return (
    hasPermission(ctx, "dms.documents.ocr.retry") ||
    hasPermission(ctx, "dms.documents.edit") ||
    hasPermission(ctx, "dms.admin")
  );
}

function canAdminOcr(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return hasPermission(ctx, "dms.ocr.admin") || hasPermission(ctx, "dms.admin");
}

// ── File select fragment (excludes ocr_text for list views) ──────────────────

const OCR_FILE_SELECT = `
  id, file_name, mime_type, ocr_status, ocr_provider, ocr_model,
  ocr_started_at, ocr_completed_at, ocr_error_message,
  ocr_confidence, ocr_page_count, ocr_language
` as const;

function toFileStatus(row: Record<string, unknown>): DmsOcrFileStatus {
  return {
    file_id: row.id as number,
    file_name: row.file_name as string,
    mime_type: row.mime_type as string,
    ocr_status: (row.ocr_status ?? "not_started") as OcrStatus,
    ocr_provider: (row.ocr_provider as string | null) ?? null,
    ocr_model: (row.ocr_model as string | null) ?? null,
    ocr_started_at: (row.ocr_started_at as string | null) ?? null,
    ocr_completed_at: (row.ocr_completed_at as string | null) ?? null,
    ocr_error_message: (row.ocr_error_message as string | null) ?? null,
    ocr_confidence: (row.ocr_confidence as number | null) ?? null,
    ocr_page_count: (row.ocr_page_count as number | null) ?? null,
    ocr_language: (row.ocr_language as string | null) ?? null,
    has_text: false, // populated separately in text-fetch actions
  };
}

// ── getDmsOcrStatus ───────────────────────────────────────────────────────────

export async function getDmsOcrStatus(
  documentId: number
): Promise<ActionResult<DmsOcrDocumentStatus>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canViewOcr(ctx)) return { success: false, error: "Permission denied" };

    const { data: doc, error: docErr } = await supabase
      .from("dms_documents")
      .select("id, ocr_status, ocr_last_run_at, ocr_text_available")
      .eq("id", documentId)
      .is("deleted_at", null)
      .single();

    if (docErr || !doc) return { success: false, error: docErr?.message ?? "Document not found" };

    const { data: files, error: filesErr } = await supabase
      .from("dms_document_files")
      .select(OCR_FILE_SELECT)
      .eq("document_id", documentId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (filesErr) return { success: false, error: filesErr.message };

    return {
      success: true,
      data: {
        document_id: documentId,
        ocr_status: (doc.ocr_status ?? "not_required") as OcrStatus,
        ocr_last_run_at: doc.ocr_last_run_at ?? null,
        ocr_text_available: doc.ocr_text_available ?? false,
        files: (files ?? []).map((f) => toFileStatus(f as Record<string, unknown>)),
      },
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── getDmsFileOcrText ─────────────────────────────────────────────────────────

export async function getDmsFileOcrText(
  fileId: number
): Promise<ActionResult<{ file_id: number; ocr_text: string | null; ocr_status: OcrStatus }>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canViewOcr(ctx)) return { success: false, error: "Permission denied" };

    const { data, error } = await supabase
      .from("dms_document_files")
      .select("id, ocr_text, ocr_status, document_id")
      .eq("id", fileId)
      .is("deleted_at", null)
      .single();

    if (error || !data) return { success: false, error: error?.message ?? "File not found" };

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_document_files",
      entity_id: fileId,
      entity_reference: `FILE-${fileId}`,
      action: "view",
      new_values: { event: "ocr_text_viewed", file_id: fileId, document_id: data.document_id },
    });

    return {
      success: true,
      data: {
        file_id: fileId,
        ocr_text: (data.ocr_text as string | null) ?? null,
        ocr_status: (data.ocr_status ?? "not_started") as OcrStatus,
      },
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── getDmsDocumentOcrText ─────────────────────────────────────────────────────

export async function getDmsDocumentOcrText(
  documentId: number
): Promise<ActionResult<{ document_id: number; combined_text: string; file_count: number }>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canViewOcr(ctx)) return { success: false, error: "Permission denied" };

    const { data, error } = await supabase
      .from("dms_document_files")
      .select("id, file_name, ocr_text, ocr_status")
      .eq("document_id", documentId)
      .eq("ocr_status", "complete")
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    if (error) return { success: false, error: error.message };

    const parts = (data ?? [])
      .filter((f) => f.ocr_text)
      .map((f) => `--- ${f.file_name} ---\n${f.ocr_text}`);

    return {
      success: true,
      data: {
        document_id: documentId,
        combined_text: parts.join("\n\n"),
        file_count: parts.length,
      },
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── triggerDmsOcrForFile ──────────────────────────────────────────────────────

const TriggerOcrSchema = z.object({
  fileId: z.number().int().positive(),
  forceRetry: z.boolean().optional().default(false),
});

export async function triggerDmsOcrForFile(
  input: z.infer<typeof TriggerOcrSchema>
): Promise<ActionResult<{ job_id: number; status: OcrStatus; message: string }>> {
  try {
    const parsed = TriggerOcrSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

    const { fileId, forceRetry } = parsed.data;
    const supabase = await createClient();
    const adminClient = await createAdminClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canTriggerOcr(ctx)) return { success: false, error: "Permission denied" };

    // 1. Load file record
    const { data: file, error: fileErr } = await supabase
      .from("dms_document_files")
      .select("id, document_id, storage_bucket, storage_path, file_name, mime_type, ocr_status, file_size_bytes")
      .eq("id", fileId)
      .is("deleted_at", null)
      .single();

    if (fileErr || !file) return { success: false, error: fileErr?.message ?? "File not found" };

    const documentId: number = file.document_id as number;

    // 2. Guard: don't re-run unless forceRetry is set
    const currentStatus = (file.ocr_status ?? "not_started") as OcrStatus;
    if (!forceRetry && currentStatus === "complete") {
      return { success: false, error: "OCR already completed for this file. Use forceRetry to re-run." };
    }
    if (!forceRetry && currentStatus === "processing") {
      return { success: false, error: "OCR is already processing for this file." };
    }

    const provider = getOcrProvider(file.mime_type as string);
    const supported = isOcrSupported(file.mime_type as string);

    // 3. Create OCR job record (pending)
    const { data: job, error: jobErr } = await supabase
      .from("dms_ai_extraction_jobs")
      .insert({
        document_id: documentId,
        file_id: fileId,
        job_type: "ocr",
        provider: provider.providerCode,
        model: provider.providerName,
        status: "pending",
        created_by: ctx.profile.id,
      })
      .select("id")
      .single();

    if (jobErr || !job) return { success: false, error: jobErr?.message ?? "Failed to create OCR job" };

    const jobId: number = job.id as number;

    // 4. If mime type not supported, mark immediately
    if (!supported) {
      const skipStatus: OcrStatus = "not_supported";
      await supabase
        .from("dms_document_files")
        .update({ ocr_status: skipStatus, ocr_provider: provider.providerCode, ocr_error_message: `MIME type not supported: ${file.mime_type}` })
        .eq("id", fileId);
      await supabase
        .from("dms_ai_extraction_jobs")
        .update({ status: "cancelled", error_message: `MIME type not supported: ${file.mime_type}`, completed_at: new Date().toISOString() })
        .eq("id", jobId);
      await insertDocumentEvent(supabase, documentId, fileId, "ocr_skipped", ctx.profile.id, { reason: "not_supported", mime_type: file.mime_type });
      return { success: true, data: { job_id: jobId, status: skipStatus, message: `File type ${file.mime_type} is not supported for OCR` } };
    }

    // 5. Mark processing
    await supabase
      .from("dms_document_files")
      .update({ ocr_status: "processing", ocr_provider: provider.providerCode, ocr_started_at: new Date().toISOString(), ocr_error_message: null })
      .eq("id", fileId);
    await supabase
      .from("dms_ai_extraction_jobs")
      .update({ status: "processing", started_at: new Date().toISOString() })
      .eq("id", jobId);

    await insertDocumentEvent(supabase, documentId, fileId, "ocr_started", ctx.profile.id, {
      provider: provider.providerCode,
      file_name: file.file_name,
      mime_type: file.mime_type,
    });

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_document_files",
      entity_id: fileId,
      entity_reference: `FILE-${fileId}`,
      action: "update",
      new_values: { event: "ocr_started", provider: provider.providerCode, job_id: jobId },
    });

    // 6. Download the file from storage
    const startMs = Date.now();
    let fileBuffer: Buffer;
    try {
      const { data: fileData, error: downloadErr } = await adminClient.storage
        .from(file.storage_bucket as string)
        .download(file.storage_path as string);

      if (downloadErr || !fileData) throw new Error(downloadErr?.message ?? "Failed to download file");
      fileBuffer = Buffer.from(await fileData.arrayBuffer());
    } catch (downloadEx) {
      const msg = String(downloadEx);
      await markOcrFailed(supabase, fileId, jobId, documentId, ctx.profile.id, msg, Date.now() - startMs);
      return { success: false, error: `Failed to download file for OCR: ${msg}` };
    }

    // 7. Run OCR
    let finalStatus: OcrStatus = "complete";
    let extractedText = "";
    let pageCount: number | undefined;
    let confidence: number | undefined;
    let language: string | undefined;
    let model: string | undefined;
    let ocrError: string | null = null;

    try {
      const result = await provider.extractText({
        buffer: fileBuffer,
        mimeType: file.mime_type as string,
        fileName: file.file_name as string,
      });
      extractedText = result.text ?? "";
      pageCount = result.pageCount;
      confidence = result.confidence;
      language = result.language;
      model = result.model;
    } catch (ocrEx) {
      ocrError = String(ocrEx);
      finalStatus = "failed";
    }

    const durationMs = Date.now() - startMs;
    const completedAt = new Date().toISOString();

    // 8. Save results
    if (finalStatus === "complete") {
      await supabase
        .from("dms_document_files")
        .update({
          ocr_status: "complete",
          ocr_text: extractedText || null,
          ocr_model: model ?? null,
          ocr_completed_at: completedAt,
          ocr_page_count: pageCount ?? null,
          ocr_confidence: confidence ?? null,
          ocr_language: language ?? null,
          ocr_error_message: null,
        })
        .eq("id", fileId);

      await supabase
        .from("dms_ai_extraction_jobs")
        .update({ status: "completed", completed_at: completedAt, duration_ms: durationMs, model })
        .eq("id", jobId);

      // Update document-level OCR summary
      await supabase
        .from("dms_documents")
        .update({
          ocr_status: "complete",
          ocr_last_run_at: completedAt,
          ocr_text_available: (extractedText?.trim().length ?? 0) > 0,
        })
        .eq("id", documentId);

      await insertDocumentEvent(supabase, documentId, fileId, "ocr_completed", ctx.profile.id, {
        provider: provider.providerCode,
        duration_ms: durationMs,
        page_count: pageCount,
        has_text: (extractedText?.trim().length ?? 0) > 0,
      });

      await logAudit({
        module_code: "DMS",
        entity_name: "dms_document_files",
        entity_id: fileId,
        entity_reference: `FILE-${fileId}`,
        action: "update",
        new_values: { event: "ocr_completed", job_id: jobId, provider: provider.providerCode, duration_ms: durationMs, page_count: pageCount },
      });

      // ── Sync content text for parent document (DMS 12.1 — non-fatal) ──
      if (extractedText && extractedText.trim().length > 0) {
        try {
          // Consolidate all complete OCR text for this document
          const { data: allFiles } = await supabase
            .from("dms_document_files")
            .select("id, file_name, ocr_text, version_id, created_at")
            .eq("document_id", documentId)
            .eq("ocr_status", "complete")
            .is("deleted_at", null)
            .order("created_at", { ascending: true });

          const { data: docInfo } = await supabase
            .from("dms_documents")
            .select("current_version_id")
            .eq("id", documentId)
            .single();

          const currentVersionId = (docInfo as Record<string, unknown> | null)?.current_version_id as number | null ?? null;

          const usableFiles = (allFiles ?? []).filter((f) => {
            if (!(f.ocr_text as string | null)?.trim()) return false;
            if (currentVersionId) return f.version_id === currentVersionId;
            return true;
          });

          if (usableFiles.length > 0) {
            const consolidatedText = usableFiles
              .map((f, i) =>
                i === 0
                  ? normalizeDmsContentText((f.ocr_text as string) ?? "")
                  : contentTextFileSeparator(f.file_name as string) +
                    normalizeDmsContentText((f.ocr_text as string) ?? "")
              )
              .join("");

            await writeDocumentContentTextSystem({
              documentId,
              text: consolidatedText,
              source: "ocr",
              performedBy: ctx.profile.id,
            });
          }
        } catch (contentSyncErr) {
          console.warn("[DMS 12.1] Content text sync after OCR failed (non-fatal):", String(contentSyncErr));
        }
      }
    } else {
      await markOcrFailed(supabase, fileId, jobId, documentId, ctx.profile.id, ocrError ?? "Unknown error", durationMs);
    }

    revalidatePath(`/dms/documents/record/${documentId}`);

    return {
      success: finalStatus === "complete",
      data: {
        job_id: jobId,
        status: finalStatus,
        message:
          finalStatus === "complete"
            ? extractedText.trim().length > 0
              ? `OCR completed — ${extractedText.trim().split(/\s+/).length} words extracted`
              : "OCR completed — no text found (scanned image or empty PDF)"
            : `OCR failed: ${ocrError}`,
      },
      error: finalStatus === "failed" ? (ocrError ?? "OCR failed") : undefined,
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── triggerDmsOcrForDocument ──────────────────────────────────────────────────

export async function triggerDmsOcrForDocument(
  documentId: number,
  options?: { forceRetry?: boolean }
): Promise<ActionResult<{ triggered: number; results: { file_id: number; status: OcrStatus; message: string }[] }>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canTriggerOcr(ctx)) return { success: false, error: "Permission denied" };

    const { data: files, error } = await supabase
      .from("dms_document_files")
      .select("id, mime_type, ocr_status")
      .eq("document_id", documentId)
      .is("deleted_at", null);

    if (error) return { success: false, error: error.message };
    if (!files || files.length === 0) return { success: false, error: "No files found for this document" };

    const results: { file_id: number; status: OcrStatus; message: string }[] = [];
    let triggered = 0;

    for (const file of files) {
      const result = await triggerDmsOcrForFile({ fileId: file.id as number, forceRetry: options?.forceRetry ?? false });
      const status = result.data?.status ?? (result.success ? "complete" : "failed");
      results.push({ file_id: file.id as number, status, message: result.data?.message ?? result.error ?? "" });
      if (result.success) triggered++;
    }

    return { success: true, data: { triggered, results } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── retryDmsOcrJob ────────────────────────────────────────────────────────────

export async function retryDmsOcrJob(
  jobId: number
): Promise<ActionResult<{ job_id: number; status: OcrStatus; message: string }>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canRetryOcr(ctx)) return { success: false, error: "Permission denied" };

    const { data: job, error: jobErr } = await supabase
      .from("dms_ai_extraction_jobs")
      .select("id, file_id, document_id, status, retry_count")
      .eq("id", jobId)
      .single();

    if (jobErr || !job) return { success: false, error: "OCR job not found" };
    if (job.status !== "failed" && job.status !== "cancelled") {
      return { success: false, error: "Only failed or cancelled jobs can be retried" };
    }
    if (!job.file_id) return { success: false, error: "Job has no file_id — cannot retry" };

    await supabase
      .from("dms_ai_extraction_jobs")
      .update({ retry_count: (job.retry_count ?? 0) + 1, updated_at: new Date().toISOString() })
      .eq("id", jobId);

    const result = await triggerDmsOcrForFile({ fileId: job.file_id as number, forceRetry: true });

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_ai_extraction_jobs",
      entity_id: jobId,
      entity_reference: `JOB-${jobId}`,
      action: "update",
      new_values: { event: "ocr_retried", file_id: job.file_id, outcome: result.success ? "success" : "failed" },
    });

    if (result.data?.status && job.document_id) {
      await insertDocumentEvent(supabase, job.document_id as number, job.file_id as number, "ocr_retried", ctx.profile.id, { job_id: jobId });
    }

    return result.data
      ? { success: result.success, data: result.data }
      : { success: false, error: result.error };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── getDmsOcrJobs ─────────────────────────────────────────────────────────────

const OcrJobsFilterSchema = z.object({
  documentId: z.number().int().positive().optional(),
  fileId: z.number().int().positive().optional(),
  status: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional().default(50),
  offset: z.number().int().min(0).optional().default(0),
});

export async function getDmsOcrJobs(
  filters: z.infer<typeof OcrJobsFilterSchema>
): Promise<ActionResult<DmsOcrJobRow[]>> {
  try {
    const parsed = OcrJobsFilterSchema.safeParse(filters);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

    const { documentId, fileId, status, limit, offset } = parsed.data;
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canAdminOcr(ctx) && !canViewOcr(ctx)) return { success: false, error: "Permission denied" };

    let query = supabase
      .from("dms_ai_extraction_jobs")
      .select("id, document_id, file_id, job_type, provider, model, status, started_at, completed_at, duration_ms, error_message, retry_count, created_at")
      .eq("job_type", "ocr")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (documentId) query = query.eq("document_id", documentId);
    if (fileId) query = query.eq("file_id", fileId);
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as DmsOcrJobRow[] };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── markDmsOcrSkipped ─────────────────────────────────────────────────────────

export async function markDmsOcrSkipped(
  fileId: number,
  reason: string
): Promise<ActionResult<{ file_id: number }>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canTriggerOcr(ctx)) return { success: false, error: "Permission denied" };

    const { data: file, error: fileErr } = await supabase
      .from("dms_document_files")
      .select("id, document_id")
      .eq("id", fileId)
      .is("deleted_at", null)
      .single();

    if (fileErr || !file) return { success: false, error: "File not found" };

    await supabase
      .from("dms_document_files")
      .update({ ocr_status: "skipped", ocr_error_message: reason })
      .eq("id", fileId);

    await insertDocumentEvent(supabase, file.document_id as number, fileId, "ocr_skipped", ctx.profile.id, { reason });

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_document_files",
      entity_id: fileId,
      entity_reference: `FILE-${fileId}`,
      action: "update",
      new_values: { event: "ocr_skipped", reason, file_id: fileId },
    });

    revalidatePath(`/dms/documents/record/${file.document_id}`);
    return { success: true, data: { file_id: fileId } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Private helpers ───────────────────────────────────────────────────────────

async function markOcrFailed(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  fileId: number,
  jobId: number,
  documentId: number,
  userId: number,
  errorMsg: string,
  durationMs: number
) {
  const completedAt = new Date().toISOString();

  await supabase
    .from("dms_document_files")
    .update({ ocr_status: "failed", ocr_error_message: errorMsg, ocr_completed_at: completedAt })
    .eq("id", fileId);

  await supabase
    .from("dms_ai_extraction_jobs")
    .update({ status: "failed", error_message: errorMsg, completed_at: completedAt, duration_ms: durationMs })
    .eq("id", jobId);

  await supabase
    .from("dms_documents")
    .update({ ocr_status: "failed", ocr_last_run_at: completedAt })
    .eq("id", documentId);

  await insertDocumentEvent(supabase, documentId, fileId, "ocr_failed", userId, {
    error_summary: errorMsg.slice(0, 200),
    duration_ms: durationMs,
  });

  await logAudit({
    module_code: "DMS",
    entity_name: "dms_document_files",
    entity_id: fileId,
    entity_reference: `FILE-${fileId}`,
    action: "update",
    new_values: { event: "ocr_failed", job_id: jobId, duration_ms: durationMs },
  });
}

async function insertDocumentEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  documentId: number,
  fileId: number,
  eventType: string,
  userId: number,
  meta: Record<string, unknown>
) {
  await supabase.from("dms_document_events").insert({
    document_id: documentId,
    event_type: eventType,
    description: `OCR event: ${eventType} for file ${fileId}`,
    performed_by: userId,
    metadata_json: meta,
  });
}
