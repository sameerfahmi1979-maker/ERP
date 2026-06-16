"use server";

/**
 * DMS 12.4A — Intelligence Admin Stats
 *
 * Aggregate health counts for the DMS Intelligence Admin page.
 * Admin-only. Returns counts only — never document content.
 *
 * Uses createAdminClient() for aggregate counts only (not document reads/search).
 * Callers must hold dms.admin or system_admin.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { extractFileContent } from "@/lib/dms/file-content-extractor";
import { getDmsAiProvider } from "@/lib/dms/ai/factory";
import { persistFileOcrResult } from "@/lib/dms/ocr/persist-file-ocr-result";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DmsIntelligenceAdminStats = {
  totalDocuments: number;
  documentsWithExtractedText: number;
  documentsMissingExtractedText: number;
  documentsWithAiSummary: number;
  documentsMissingAiSummary: number;
  documentsWithCompletenessScore: number;
  highRiskDocuments: number;
  criticalRiskDocuments: number;
  pendingTagSuggestions: number;
  pendingLinkSuggestions: number;
  // DMS 12.5 — embeddings
  documentsWithEmbedding: number;
  documentsMissingEmbedding: number;
  failedEmbeddings: number;
};

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

// ── getDmsIntelligenceAdminStats ────────────────────────────────────────────────

export async function getDmsIntelligenceAdminStats(): Promise<
  ActionResult<DmsIntelligenceAdminStats>
> {
  const ctx = await getAuthContext();
  if (
    !hasPermission(ctx, "dms.admin") &&
    !ctx.roleCodes.includes("system_admin")
  ) {
    return { success: false, error: "Permission denied — requires dms.admin." };
  }

  try {
    const supabase = createAdminClient();

    // Run all counts in parallel
    const [
      totalResult,
      contentResult,
      summaryResult,
      completenessResult,
      highRiskResult,
      criticalRiskResult,
      pendingTagsResult,
      pendingLinksResult,
      withEmbeddingResult,
      failedEmbeddingResult,
    ] = await Promise.all([
      // Total non-deleted documents
      supabase
        .from("dms_documents")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null),

      // Documents with extracted text
      supabase
        .from("dms_document_content")
        .select("document_id", { count: "exact", head: true })
        .not("content_text", "is", null),

      // Documents with AI summary complete
      supabase
        .from("dms_documents")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .eq("ai_summary_status", "complete"),

      // Documents with completeness score
      supabase
        .from("dms_documents")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .not("completeness_score", "is", null),

      // High risk
      supabase
        .from("dms_documents")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .eq("ai_risk_level", "high"),

      // Critical risk
      supabase
        .from("dms_documents")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .eq("ai_risk_level", "critical"),

      // Pending tag suggestions
      supabase
        .from("dms_ai_tag_suggestions")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .is("deleted_at", null),

      // Pending link suggestions
      supabase
        .from("dms_ai_link_suggestions")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .is("deleted_at", null),

      // Documents with a complete embedding (DMS 12.5)
      supabase
        .from("dms_documents")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .eq("summary_embedding_status", "complete"),

      // Documents with a failed embedding (DMS 12.5)
      supabase
        .from("dms_documents")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .eq("summary_embedding_status", "failed"),
    ]);

    const totalDocuments = totalResult.count ?? 0;
    const withText = contentResult.count ?? 0;
    const withSummary = summaryResult.count ?? 0;
    const withCompleteness = completenessResult.count ?? 0;
    const withEmbedding = withEmbeddingResult.count ?? 0;

    return {
      success: true,
      data: {
        totalDocuments,
        documentsWithExtractedText: withText,
        documentsMissingExtractedText: Math.max(0, totalDocuments - withText),
        documentsWithAiSummary: withSummary,
        documentsMissingAiSummary: Math.max(0, totalDocuments - withSummary),
        documentsWithCompletenessScore: withCompleteness,
        highRiskDocuments: highRiskResult.count ?? 0,
        criticalRiskDocuments: criticalRiskResult.count ?? 0,
        pendingTagSuggestions: pendingTagsResult.count ?? 0,
        pendingLinkSuggestions: pendingLinksResult.count ?? 0,
        documentsWithEmbedding: withEmbedding,
        documentsMissingEmbedding: Math.max(0, totalDocuments - withEmbedding),
        failedEmbeddings: failedEmbeddingResult.count ?? 0,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load intelligence stats.",
    };
  }
}

// ── adminBackfillMissingOcrText ───────────────────────────────────────────────

export type OcrBackfillInput = {
  /** If true, report what would be processed without actually running OCR. */
  dryRun?: boolean;
  /** Number of documents to process per run. Default 10, max 50. */
  batchSize?: number;
  /** Resume from this document ID (process documents with id >= resumeFromId). */
  resumeFromId?: number;
  /** Repair only this specific document (by its integer ID). */
  targetDocumentId?: number;
};

export type OcrBackfillResult = {
  processed: number;
  skipped: number;
  failed: number;
  errors: string[];
  nextResumeId: number | null;
};

/**
 * Repairs documents with missing OCR text by running vision OCR on their files.
 *
 * Admin-only (dms.admin or system_admin).
 * Broken criteria: file ocr_text IS NULL, or document ocr_text_available = false.
 * Never logs OCR text or content text.
 */
export async function adminBackfillMissingOcrText(
  input: OcrBackfillInput
): Promise<ActionResult<OcrBackfillResult>> {
  const ctx = await getAuthContext();
  if (
    !hasPermission(ctx, "dms.admin") &&
    !ctx.roleCodes.includes("system_admin")
  ) {
    return { success: false, error: "Admin permission required." };
  }
  if (!ctx.profile) return { success: false, error: "Not authenticated." };

  const userId = ctx.profile.id as number;
  const dryRun = input.dryRun ?? false;
  const batchSize = Math.min(50, Math.max(1, input.batchSize ?? 10));
  const resumeFromId = input.resumeFromId ?? 1;
  const targetDocumentId = input.targetDocumentId ?? null;

  const supabase = await createClient();
  const admin = await createAdminClient();

  const result: OcrBackfillResult = { processed: 0, skipped: 0, failed: 0, errors: [], nextResumeId: null };

  try {
    // Query broken files: ocr_text IS NULL, not deleted
    let query = admin
      .from("dms_document_files")
      .select("id, document_id, storage_bucket, storage_path, file_name, mime_type, ocr_status, ocr_text")
      .is("ocr_text", null)
      .is("deleted_at", null)
      .gte("document_id", resumeFromId)
      .order("document_id", { ascending: true })
      .limit(batchSize + 1); // +1 to detect if more exist

    if (targetDocumentId) {
      query = admin
        .from("dms_document_files")
        .select("id, document_id, storage_bucket, storage_path, file_name, mime_type, ocr_status, ocr_text")
        .is("ocr_text", null)
        .is("deleted_at", null)
        .eq("document_id", targetDocumentId)
        .order("id", { ascending: true })
        .limit(batchSize + 1);
    }

    const { data: brokenFiles, error: queryErr } = await query;
    if (queryErr) return { success: false, error: queryErr.message };

    const files = brokenFiles ?? [];
    const hasMore = files.length > batchSize;
    const toProcess = files.slice(0, batchSize);

    if (hasMore && toProcess.length > 0) {
      const lastDoc = toProcess[toProcess.length - 1];
      result.nextResumeId = (lastDoc?.document_id as number | null) ?? null;
    }

    if (dryRun) {
      return {
        success: true,
        data: { ...result, processed: toProcess.length, skipped: 0, failed: 0, nextResumeId: result.nextResumeId },
      };
    }

    const { provider: aiProvider } = await getDmsAiProvider();
    if (!aiProvider.isConfigured()) {
      return { success: false, error: "No AI provider configured. Cannot run OCR backfill." };
    }

    for (const file of toProcess) {
      const fileId = file.id as number;
      const documentId = file.document_id as number;
      const storagePath = file.storage_path as string | null;
      const storageBucket = (file.storage_bucket as string | null) ?? "dms-documents";
      const mimeType = (file.mime_type as string | null) ?? "application/octet-stream";
      const fileName = (file.file_name as string | null) ?? "file";

      if (!storagePath) {
        result.skipped++;
        continue;
      }

      try {
        const { data: blob } = await admin.storage.from(storageBucket).download(storagePath);
        if (!blob) {
          result.skipped++;
          continue;
        }
        const buffer = Buffer.from(await blob.arrayBuffer());
        const content = await extractFileContent(buffer, mimeType, fileName);

        if (!content.hasContent) {
          result.skipped++;
          continue;
        }

        const aiOutput = await aiProvider.analyze({
          ocrText: content.text,
          imageFiles: content.images,
          currentTypeCode: null,
          typeCandidates: [],
          metadataFields: [],
          originalFilename: fileName,
        });

        const transcription = aiOutput.extraction?.fullTextTranscription;
        const extractedText = transcription?.trim() || content.text?.trim() || null;

        if (!extractedText) {
          result.skipped++;
          continue;
        }

        const persistResult = await persistFileOcrResult({
          supabase,
          fileId,
          documentId,
          text: extractedText,
          provider: "vision",
          model: (aiProvider.modelId ?? "gpt-4.1").toLowerCase(),
          performedBy: userId,
          source: "ocr",
        });

        if (persistResult.fileUpdated) {
          result.processed++;
        } else {
          result.failed++;
          result.errors.push(`FILE-${fileId}: persist failed — ${persistResult.errors.join(", ")}`);
        }
      } catch (fileErr) {
        result.failed++;
        const msg = String(fileErr).slice(0, 200);
        result.errors.push(`FILE-${fileId}: ${msg}`);
      }
    }

    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 500) };
  }
}
