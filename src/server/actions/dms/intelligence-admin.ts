"use server";

/**
 * DMS 12.4A — Intelligence Admin Stats
 * DMS Phase 10B — Queue-backed Admin OCR Backfill
 *
 * Aggregate health counts for the DMS Intelligence Admin page,
 * plus admin OCR backfill (dry-run, enqueue, inline) and queue summary.
 *
 * Admin-only. Returns counts only — never document content.
 * Uses createAdminClient() for aggregate counts and queue operations.
 *
 * Security rules:
 *   - Requires dms.admin or system_admin.
 *   - Queue payload stores only IDs + control flags — no OCR text.
 *   - Errors are sanitized before return.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { extractFileContent } from "@/lib/dms/file-content-extractor";
import { getDmsAiProvider } from "@/lib/dms/ai/factory";
import { persistFileOcrResult } from "@/lib/dms/ocr/persist-file-ocr-result";
import { enqueueUniqueDmsAiJob } from "@/lib/dms/ai-jobs/job-runner";
import { DMS_AI_JOB_TYPE, DMS_AI_JOB_STATUS } from "@/lib/dms/ai-jobs/job-types";

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

export type OcrBackfillMode = "dry_run" | "enqueue" | "inline";

export type OcrBackfillInput = {
  /**
   * Backfill mode.
   *   dry_run  — report eligible files, no writes (default for safety).
   *   enqueue  — create one ocr_backfill queue job per eligible file.
   *              Requires DMS_OCR_BACKFILL_QUEUE=true and DMS_AI_JOB_QUEUE=true.
   *   inline   — legacy synchronous OCR (original behaviour, retained as fallback).
   * If dryRun=true is set it overrides mode to "dry_run" for backward compat.
   */
  mode?: OcrBackfillMode;
  /** @deprecated Use mode="dry_run". Kept for backward compat. */
  dryRun?: boolean;
  /**
   * Files to process per call.
   * dry_run / enqueue max 200; inline max 50.
   */
  batchSize?: number;
  /** Resume from document ID (document_id >= resumeFromId). */
  resumeFromId?: number;
  /** Repair only files belonging to this document. */
  targetDocumentId?: number;
  /** When true (enqueue mode) — re-enqueue even if the file already has text. */
  forceRetry?: boolean;
};

export type OcrBackfillResult = {
  mode: OcrBackfillMode;
  /** (inline) Files OCR'd synchronously. */
  processed: number;
  /** (enqueue) Jobs successfully enqueued. */
  queued: number;
  skipped: number;
  failed: number;
  errors: string[];
  nextResumeId: number | null;
};

// ── Feature flag loader ───────────────────────────────────────────────────────

async function loadBackfillFlags(admin: ReturnType<typeof createAdminClient>): Promise<{
  backfillQueueEnabled: boolean;
  jobQueueEnabled: boolean;
}> {
  try {
    const { data } = await admin
      .from("erp_ai_feature_flags")
      .select("feature_code, is_enabled")
      .in("feature_code", ["DMS_OCR_BACKFILL_QUEUE", "DMS_AI_JOB_QUEUE"]);

    const map = new Map<string, boolean>(
      ((data ?? []) as Array<{ feature_code: string; is_enabled: boolean }>)
        .map((r) => [r.feature_code, r.is_enabled])
    );
    return {
      backfillQueueEnabled: map.get("DMS_OCR_BACKFILL_QUEUE") ?? false,
      jobQueueEnabled:      map.get("DMS_AI_JOB_QUEUE")       ?? false,
    };
  } catch {
    return { backfillQueueEnabled: false, jobQueueEnabled: false };
  }
}

/**
 * Admin OCR backfill with three modes: dry_run, enqueue, inline.
 *
 * Admin-only (dms.admin or system_admin).
 * Target: files where ocr_text IS NULL and deleted_at IS NULL.
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

  // Resolve effective mode — dryRun=true overrides mode for backward compat.
  const effectiveMode: OcrBackfillMode =
    input.dryRun === true
      ? "dry_run"
      : (input.mode ?? "dry_run");

  const maxBatch = effectiveMode === "inline" ? 50 : 200;
  const batchSize = Math.min(maxBatch, Math.max(1, input.batchSize ?? 10));
  const resumeFromId    = input.resumeFromId    ?? 1;
  const targetDocumentId = input.targetDocumentId ?? null;
  const forceRetry       = input.forceRetry      ?? false;

  const admin = createAdminClient();

  const result: OcrBackfillResult = {
    mode: effectiveMode,
    processed: 0,
    queued: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    nextResumeId: null,
  };

  try {
    // ── Query eligible files ────────────────────────────────────────────────
    let query = admin
      .from("dms_document_files")
      .select("id, document_id, storage_bucket, storage_path, file_name, mime_type, ocr_status, ocr_text")
      .is("ocr_text", null)
      .is("deleted_at", null)
      .gte("document_id", resumeFromId)
      .order("document_id", { ascending: true })
      .limit(batchSize + 1);

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

    // ── dry_run ─────────────────────────────────────────────────────────────
    if (effectiveMode === "dry_run") {
      return {
        success: true,
        data: { ...result, processed: toProcess.length, queued: 0, skipped: 0, failed: 0 },
      };
    }

    // ── enqueue mode ─────────────────────────────────────────────────────────
    if (effectiveMode === "enqueue") {
      const flags = await loadBackfillFlags(admin);

      if (!flags.backfillQueueEnabled) {
        return {
          success: false,
          error: "Queue-backed backfill is disabled. Enable DMS_OCR_BACKFILL_QUEUE in AI Feature Flags to use Enqueue mode.",
        };
      }
      if (!flags.jobQueueEnabled) {
        return {
          success: false,
          error: "DMS AI Job Queue is disabled. Enable DMS_AI_JOB_QUEUE in AI Feature Flags to use Enqueue mode.",
        };
      }

      for (const file of toProcess) {
        const fileId     = file.id          as number;
        const documentId = file.document_id as number;

        try {
          const enqueueResult = await enqueueUniqueDmsAiJob({
            jobType:          DMS_AI_JOB_TYPE.OCR_BACKFILL,
            payload:          { fileId, documentId, forceRetry, source: "admin_backfill" },
            idempotencyKey:   `ocr_backfill:file:${fileId}`,
            relatedDocumentId: documentId,
            priority:         200,  // lower priority than post_approve (100)
            createdBy:        userId,
          });

          if (enqueueResult.skipped) {
            result.skipped++;
          } else if (enqueueResult.success) {
            result.queued++;
          } else {
            result.failed++;
            result.errors.push(`FILE-${fileId}: enqueue failed — ${(enqueueResult.error ?? "unknown").slice(0, 150)}`);
          }
        } catch (fileErr) {
          result.failed++;
          result.errors.push(`FILE-${fileId}: ${String(fileErr).slice(0, 150)}`);
        }
      }

      return { success: true, data: result };
    }

    // ── inline mode (legacy synchronous, preserved as fallback) ─────────────
    const supabase = await createClient();
    const { provider: aiProvider } = await getDmsAiProvider();
    if (!aiProvider.isConfigured()) {
      return { success: false, error: "No AI provider configured. Cannot run inline OCR backfill." };
    }

    for (const file of toProcess) {
      const fileId       = file.id           as number;
      const documentId   = file.document_id  as number;
      const storagePath  = file.storage_path as string | null;
      const storageBucket = (file.storage_bucket as string | null) ?? "dms-documents";
      const mimeType     = (file.mime_type   as string | null) ?? "application/octet-stream";
      const fileName     = (file.file_name   as string | null) ?? "file";

      if (!storagePath) {
        result.skipped++;
        continue;
      }

      try {
        const { data: blob } = await admin.storage.from(storageBucket).download(storagePath);
        if (!blob) { result.skipped++; continue; }

        const buffer  = Buffer.from(await blob.arrayBuffer());
        const content = await extractFileContent(buffer, mimeType, fileName);

        if (!content.hasContent) { result.skipped++; continue; }

        const aiOutput = await aiProvider.analyze({
          ocrText:          content.text,
          imageFiles:       content.images,
          currentTypeCode:  null,
          typeCandidates:   [],
          metadataFields:   [],
          originalFilename: fileName,
        });

        const transcription  = aiOutput.extraction?.fullTextTranscription;
        const extractedText  = transcription?.trim() || content.text?.trim() || null;

        if (!extractedText) { result.skipped++; continue; }

        const persistResult = await persistFileOcrResult({
          supabase,
          fileId,
          documentId,
          text:        extractedText,
          provider:    "vision",
          model:       (aiProvider.modelId ?? "gpt-4.1").toLowerCase(),
          performedBy: userId,
          source:      "ocr",
        });

        if (persistResult.fileUpdated) {
          result.processed++;
        } else {
          result.failed++;
          result.errors.push(`FILE-${fileId}: persist failed — ${persistResult.errors.join(", ").slice(0, 150)}`);
        }
      } catch (fileErr) {
        result.failed++;
        result.errors.push(`FILE-${fileId}: ${String(fileErr).slice(0, 150)}`);
      }
    }

    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 500) };
  }
}

// ── getDmsOcrBackfillQueueSummary ─────────────────────────────────────────────

export type OcrBackfillQueueSummary = {
  queued:          number;
  running:         number;
  retry_scheduled: number;
  completed:       number;
  failed:          number;
  cancelled:       number;
};

/**
 * Returns job status counts for ocr_backfill jobs in the queue.
 * Admin-only.
 */
export async function getDmsOcrBackfillQueueSummary(): Promise<ActionResult<OcrBackfillQueueSummary>> {
  const ctx = await getAuthContext();
  if (
    !hasPermission(ctx, "dms.admin") &&
    !ctx.roleCodes.includes("system_admin")
  ) {
    return { success: false, error: "Admin permission required." };
  }

  try {
    const admin = createAdminClient();
    const statusCodes = [
      DMS_AI_JOB_STATUS.QUEUED,
      DMS_AI_JOB_STATUS.RUNNING,
      DMS_AI_JOB_STATUS.RETRY_SCHEDULED,
      DMS_AI_JOB_STATUS.COMPLETED,
      DMS_AI_JOB_STATUS.FAILED,
      DMS_AI_JOB_STATUS.CANCELLED,
    ];

    const counts = await Promise.all(
      statusCodes.map(async (status) => {
        const { count } = await admin
          .from("dms_ai_job_queue")
          .select("id", { count: "exact", head: true })
          .eq("job_type", DMS_AI_JOB_TYPE.OCR_BACKFILL)
          .eq("job_status", status);
        return { status, count: count ?? 0 };
      })
    );

    const map = Object.fromEntries(counts.map(({ status, count }) => [status, count]));

    return {
      success: true,
      data: {
        queued:          map[DMS_AI_JOB_STATUS.QUEUED]          ?? 0,
        running:         map[DMS_AI_JOB_STATUS.RUNNING]         ?? 0,
        retry_scheduled: map[DMS_AI_JOB_STATUS.RETRY_SCHEDULED] ?? 0,
        completed:       map[DMS_AI_JOB_STATUS.COMPLETED]       ?? 0,
        failed:          map[DMS_AI_JOB_STATUS.FAILED]          ?? 0,
        cancelled:       map[DMS_AI_JOB_STATUS.CANCELLED]       ?? 0,
      },
    };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

// ── Phase 11 — Semantic Index Backfill ────────────────────────────────────────

export type SemanticIndexBackfillMode = "dry_run" | "enqueue" | "rebuild_all";

export type SemanticIndexBackfillResult = {
  mode:              SemanticIndexBackfillMode;
  eligible:          number;
  queued:            number;
  skipped:           number;
  failed:            number;
  estimatedChunks:   number;
  errors:            string[];
  nextResumeId:      number | null;
};

export type SemanticIndexQueueSummary = {
  queued:          number;
  running:         number;
  retry_scheduled: number;
  completed:       number;
  failed:          number;
  cancelled:       number;
};

async function loadSemanticBackfillFlags(admin: ReturnType<typeof createAdminClient>): Promise<{
  semanticIndexQueueEnabled: boolean;
  jobQueueEnabled:           boolean;
  chunkingEnabled:           boolean;
}> {
  try {
    const { data } = await admin
      .from("erp_ai_feature_flags")
      .select("feature_code, is_enabled")
      .in("feature_code", ["DMS_SEMANTIC_INDEX_QUEUE", "DMS_AI_JOB_QUEUE", "DMS_SEMANTIC_CHUNKING"]);

    const map = new Map<string, boolean>(
      ((data ?? []) as Array<{ feature_code: string; is_enabled: boolean }>)
        .map((r) => [r.feature_code, r.is_enabled])
    );
    return {
      semanticIndexQueueEnabled: map.get("DMS_SEMANTIC_INDEX_QUEUE") ?? false,
      jobQueueEnabled:           map.get("DMS_AI_JOB_QUEUE")        ?? false,
      chunkingEnabled:           map.get("DMS_SEMANTIC_CHUNKING")    ?? false,
    };
  } catch {
    return { semanticIndexQueueEnabled: false, jobQueueEnabled: false, chunkingEnabled: false };
  }
}

/**
 * Admin semantic index backfill with three modes: dry_run, enqueue, rebuild_all.
 *
 * Admin-only (dms.admin or system_admin).
 * Eligible: documents with content_text that have no active chunks,
 *           stale chunks (content_hash differs), or forceRebuild.
 * Queue payload contains only documentId + source + forceRebuild.
 */
export async function adminSemanticIndexBackfill(input: {
  mode?:                  SemanticIndexBackfillMode;
  batchSize?:             number;
  resumeFromDocumentId?:  number;
  targetDocumentId?:      number;
  forceRebuild?:          boolean;
}): Promise<ActionResult<SemanticIndexBackfillResult>> {
  const ctx = await getAuthContext();
  if (
    !hasPermission(ctx, "dms.admin") &&
    !ctx.roleCodes.includes("system_admin")
  ) {
    return { success: false, error: "Admin permission required." };
  }

  const effectiveMode: SemanticIndexBackfillMode = input.mode ?? "dry_run";
  const batchSize        = Math.min(100, Math.max(1, input.batchSize ?? 10));
  const resumeFromId     = input.resumeFromDocumentId ?? 1;
  const targetDocumentId = input.targetDocumentId ?? null;
  const forceRebuild     = input.forceRebuild ?? (effectiveMode === "rebuild_all");

  const admin = createAdminClient();

  const result: SemanticIndexBackfillResult = {
    mode:            effectiveMode,
    eligible:        0,
    queued:          0,
    skipped:         0,
    failed:          0,
    estimatedChunks: 0,
    errors:          [],
    nextResumeId:    null,
  };

  try {
    // ── Query documents with content_text ───────────────────────────────────
    let contentQuery = admin
      .from("dms_document_content")
      .select("document_id, content_text_char_count, content_text_sha256")
      .not("content_text", "is", null)
      .gte("document_id", resumeFromId)
      .order("document_id", { ascending: true })
      .limit(batchSize + 1);

    if (targetDocumentId) {
      contentQuery = contentQuery.eq("document_id", targetDocumentId);
    }

    const { data: contentRows, error: contentErr } = await contentQuery;
    if (contentErr) {
      return { success: false, error: "Failed to query content: " + contentErr.message.slice(0, 100) };
    }

    const allRows = (contentRows ?? []) as Array<{
      document_id: number;
      content_text_char_count: number | null;
      content_text_sha256: string | null;
    }>;

    const hasMore = allRows.length > batchSize;
    const batch   = hasMore ? allRows.slice(0, batchSize) : allRows;
    result.nextResumeId = hasMore ? (allRows[batchSize]?.document_id ?? null) : null;
    result.eligible = batch.length;

    // ── Compute estimated chunks ─────────────────────────────────────────────
    result.estimatedChunks = batch.reduce((sum, r) => {
      const chars = r.content_text_char_count ?? 0;
      return sum + Math.min(200, Math.ceil(chars / 4_000));
    }, 0);

    if (effectiveMode === "dry_run") {
      return { success: true, data: result };
    }

    // ── Check flags for enqueue/rebuild_all ──────────────────────────────────
    const flags = await loadSemanticBackfillFlags(admin);

    if (!flags.semanticIndexQueueEnabled) {
      return { success: false, error: "DMS_SEMANTIC_INDEX_QUEUE must be enabled to enqueue semantic index jobs." };
    }
    if (!flags.jobQueueEnabled) {
      return { success: false, error: "DMS_AI_JOB_QUEUE must be enabled to enqueue jobs." };
    }
    if (!flags.chunkingEnabled) {
      return { success: false, error: "DMS_SEMANTIC_CHUNKING must be enabled before backfilling." };
    }

    const userId = (ctx.profile?.id ?? null) as number | null;

    for (const row of batch) {
      try {
        const idKey = `semantic_document_index:doc:${row.document_id}`;

        const enqueueResult = await enqueueUniqueDmsAiJob({
          jobType:           DMS_AI_JOB_TYPE.SEMANTIC_DOCUMENT_INDEX,
          payload:           { documentId: row.document_id, source: "admin_backfill", forceRebuild },
          idempotencyKey:    idKey,
          priority:          3,
          relatedDocumentId: row.document_id,
          createdBy:         userId ?? undefined,
        });

        if (enqueueResult.success) {
          if (enqueueResult.skipped) {
            result.skipped++;
          } else {
            result.queued++;
          }
        } else {
          result.failed++;
          result.errors.push(`DOC-${row.document_id}: ${(enqueueResult.error ?? "enqueue failed").slice(0, 100)}`);
        }
      } catch (rowErr) {
        result.failed++;
        result.errors.push(`DOC-${row.document_id}: ${String(rowErr).slice(0, 100)}`);
      }
    }

    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 300) };
  }
}

/**
 * Returns job status counts for semantic_document_index jobs in the queue.
 * Admin-only.
 */
export async function getSemanticIndexQueueSummary(): Promise<ActionResult<SemanticIndexQueueSummary>> {
  const ctx = await getAuthContext();
  if (
    !hasPermission(ctx, "dms.admin") &&
    !ctx.roleCodes.includes("system_admin")
  ) {
    return { success: false, error: "Admin permission required." };
  }

  try {
    const admin = createAdminClient();
    const statusCodes = [
      DMS_AI_JOB_STATUS.QUEUED,
      DMS_AI_JOB_STATUS.RUNNING,
      DMS_AI_JOB_STATUS.RETRY_SCHEDULED,
      DMS_AI_JOB_STATUS.COMPLETED,
      DMS_AI_JOB_STATUS.FAILED,
      DMS_AI_JOB_STATUS.CANCELLED,
    ];

    const counts = await Promise.all(
      statusCodes.map((status) =>
        admin
          .from("dms_ai_job_queue")
          .select("id", { count: "exact", head: true })
          .eq("job_type", DMS_AI_JOB_TYPE.SEMANTIC_DOCUMENT_INDEX)
          .eq("job_status", status)
          .then(({ count }) => ({ status, count: count ?? 0 }))
      )
    );

    const map = Object.fromEntries(counts.map((c) => [c.status, c.count])) as Record<string, number>;

    return {
      success: true,
      data: {
        queued:          map[DMS_AI_JOB_STATUS.QUEUED]          ?? 0,
        running:         map[DMS_AI_JOB_STATUS.RUNNING]         ?? 0,
        retry_scheduled: map[DMS_AI_JOB_STATUS.RETRY_SCHEDULED] ?? 0,
        completed:       map[DMS_AI_JOB_STATUS.COMPLETED]       ?? 0,
        failed:          map[DMS_AI_JOB_STATUS.FAILED]          ?? 0,
        cancelled:       map[DMS_AI_JOB_STATUS.CANCELLED]       ?? 0,
      },
    };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

/**
 * Returns the semantic index status (chunk counts) for a single document.
 * Used by the document Semantic tab UI.
 */
export async function getDmsDocumentSemanticIndexStatus(documentId: number): Promise<ActionResult<{
  documentId:      number;
  totalChunks:     number;
  embeddedChunks:  number;
  pendingChunks:   number;
  failedChunks:    number;
  lastContentHash: string | null;
  isStale:         boolean;
}>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "dms.documents.view") && !hasPermission(ctx, "dms.admin") && !ctx.roleCodes.includes("system_admin")) {
    return { success: false, error: "Permission denied." };
  }

  try {
    const admin = createAdminClient();

    // Get chunk counts per status
    const [totalRes, embeddedRes, pendingRes, failedRes, contentRes] = await Promise.all([
      admin
        .from("dms_document_content_chunks")
        .select("id", { count: "exact", head: true })
        .eq("document_id", documentId)
        .eq("is_active", true)
        .is("deleted_at", null),
      admin
        .from("dms_document_content_chunks")
        .select("id", { count: "exact", head: true })
        .eq("document_id", documentId)
        .eq("is_active", true)
        .eq("embedding_status", "complete")
        .is("deleted_at", null),
      admin
        .from("dms_document_content_chunks")
        .select("id", { count: "exact", head: true })
        .eq("document_id", documentId)
        .eq("is_active", true)
        .eq("embedding_status", "pending")
        .is("deleted_at", null),
      admin
        .from("dms_document_content_chunks")
        .select("id", { count: "exact", head: true })
        .eq("document_id", documentId)
        .eq("is_active", true)
        .eq("embedding_status", "failed")
        .is("deleted_at", null),
      admin
        .from("dms_document_content")
        .select("content_text_sha256")
        .eq("document_id", documentId)
        .maybeSingle(),
    ]);

    // Get chunk's content_hash to check staleness
    const { data: chunkHashRow } = await admin
      .from("dms_document_content_chunks")
      .select("content_hash")
      .eq("document_id", documentId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    const currentContentHash = (contentRes.data as { content_text_sha256?: string | null } | null)?.content_text_sha256 ?? null;
    const chunkContentHash   = (chunkHashRow as { content_hash?: string | null } | null)?.content_hash ?? null;
    const isStale = currentContentHash !== null && chunkContentHash !== null && currentContentHash !== chunkContentHash;

    return {
      success: true,
      data: {
        documentId,
        totalChunks:     totalRes.count    ?? 0,
        embeddedChunks:  embeddedRes.count ?? 0,
        pendingChunks:   pendingRes.count  ?? 0,
        failedChunks:    failedRes.count   ?? 0,
        lastContentHash: chunkContentHash,
        isStale,
      },
    };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

/**
 * Enqueues a single semantic_document_index job for a specific document.
 * Used by the document Semantic tab UI admin Rebuild button.
 * Requires dms.admin or system_admin.
 */
export async function enqueueDmsDocumentSemanticIndex(
  documentId: number,
  forceRebuild = false
): Promise<ActionResult<{ jobId: number | undefined; skipped: boolean }>> {
  const ctx = await getAuthContext();
  if (
    !hasPermission(ctx, "dms.admin") &&
    !ctx.roleCodes.includes("system_admin")
  ) {
    return { success: false, error: "Admin permission required." };
  }

  try {
    const admin  = createAdminClient();
    const flags  = await loadSemanticBackfillFlags(admin);

    if (!flags.semanticIndexQueueEnabled) {
      return { success: false, error: "DMS_SEMANTIC_INDEX_QUEUE must be enabled." };
    }
    if (!flags.jobQueueEnabled) {
      return { success: false, error: "DMS_AI_JOB_QUEUE must be enabled." };
    }

    const result = await enqueueUniqueDmsAiJob({
      jobType:           DMS_AI_JOB_TYPE.SEMANTIC_DOCUMENT_INDEX,
      payload:           { documentId, source: "manual_rebuild", forceRebuild },
      idempotencyKey:    `semantic_document_index:doc:${documentId}`,
      priority:          3,
      relatedDocumentId: documentId,
      createdBy:         (ctx.profile?.id ?? null) as number | undefined,
    });

    if (!result.success) {
      return { success: false, error: result.error ?? "Failed to enqueue." };
    }

    return { success: true, data: { jobId: result.jobId, skipped: result.skipped ?? false } };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}
