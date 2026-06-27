/**
 * ERP DMS AI Phase 11 — Chunk Embedder
 *
 * Embeds pending active chunks for a single document using the configured
 * DMS embedding provider (getDmsEmbeddingProvider).
 *
 * Security rules:
 *   - Uses createAdminClient() — worker-safe, no user session required.
 *   - Never logs chunk_text, content_text, or any document content.
 *   - Stores only vector + safe metadata; never stores raw provider response.
 *   - Validates embedding dimension == 1536 before writing.
 *   - On provider disabled: leaves chunks pending (not failed).
 *   - On error: marks chunk failed with sanitized error code/message.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getDmsEmbeddingProvider } from "@/lib/dms/ai/factory";
import { logger } from "@/lib/logger";
import { logDmsAiUsage } from "@/lib/ai/observability/log-dms-ai-usage";

// ── Constants ──────────────────────────────────────────────────────────────────

const EXPECTED_EMBEDDING_DIM = 1536;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface EmbedDocumentChunksInput {
  documentId: number;
  /** Max chunks to embed per call (default 50). Cost guard. */
  maxChunks?: number;
}

export interface EmbedDocumentChunksResult {
  embedded:         number;
  skipped:          number;
  failed:           number;
  pendingRemaining: number;
  providerCode?:    string;
  model?:           string;
  totalInputTokens?: number;
}

// ── Feature flag helper ─────────────────────────────────────────────────────────

async function isEmbeddingsEnabled(): Promise<boolean> {
  try {
    const db = createAdminClient();
    const { data } = await db
      .from("erp_ai_feature_flags")
      .select("is_enabled")
      .eq("feature_code", "DMS_SEMANTIC_EMBEDDINGS")
      .single();
    return (data as { is_enabled?: boolean } | null)?.is_enabled === true;
  } catch {
    return false;
  }
}

// ── Error sanitizer ─────────────────────────────────────────────────────────────

function safeEmbedErrorCode(err: unknown): { code: string; message: string } {
  const msg = err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200);
  if (/timeout|ETIMEDOUT/i.test(msg))    return { code: "provider_timeout",    message: "Request timed out." };
  if (/rate.?limit|429/i.test(msg))      return { code: "provider_rate_limit", message: "Rate limit reached." };
  if (/unavailable|503|502/i.test(msg))  return { code: "provider_unavailable", message: "Provider unavailable." };
  if (/network|ECONNREFUSED/i.test(msg)) return { code: "network_error",        message: "Network error." };
  if (/dimension|length/i.test(msg))     return { code: "dimension_mismatch",   message: "Embedding dimension mismatch." };
  return { code: "unexpected", message: "Embedding failed." };
}

// ── Main export ──────────────────────────────────────────────────────────────────

/**
 * Embed pending active chunks for a document.
 * Uses the configured DMS embedding provider.
 * Returns counts only — never returns or logs chunk text.
 */
export async function embedPendingDocumentChunks(
  input: EmbedDocumentChunksInput
): Promise<EmbedDocumentChunksResult> {
  const { documentId, maxChunks = 50 } = input;
  const db = createAdminClient();

  const result: EmbedDocumentChunksResult = {
    embedded: 0,
    skipped:  0,
    failed:   0,
    pendingRemaining: 0,
  };

  // ── Feature flag check ──────────────────────────────────────────────────────
  if (!(await isEmbeddingsEnabled())) {
    // Leave chunks pending — provider flag is off, not a failure
    const { count } = await db
      .from("dms_document_content_chunks")
      .select("id", { count: "exact", head: true })
      .eq("document_id", documentId)
      .eq("embedding_status", "pending")
      .eq("is_active", true)
      .is("deleted_at", null);
    result.pendingRemaining = count ?? 0;
    result.skipped = result.pendingRemaining;
    return result;
  }

  // ── Get embedding provider ──────────────────────────────────────────────────
  const { provider, configCode, configId, modelId } = await getDmsEmbeddingProvider();

  if (!provider.isConfigured()) {
    // Provider not configured — leave chunks pending
    const { count } = await db
      .from("dms_document_content_chunks")
      .select("id", { count: "exact", head: true })
      .eq("document_id", documentId)
      .eq("embedding_status", "pending")
      .eq("is_active", true)
      .is("deleted_at", null);
    result.pendingRemaining = count ?? 0;
    result.skipped = result.pendingRemaining;
    logger.warn("[chunk-embedder] provider not configured", { documentId });
    return result;
  }

  result.providerCode = configCode ?? undefined;
  result.model = modelId;

  // Accumulate input tokens across chunks for batch logging
  let batchInputTokens = 0;
  const batchStartMs = Date.now();

  // ── Load pending chunks ────────────────────────────────────────────────────
  const { data: pendingChunks, error: fetchErr } = await db
    .from("dms_document_content_chunks")
    .select("id, chunk_text")
    .eq("document_id", documentId)
    .eq("embedding_status", "pending")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("chunk_index", { ascending: true })
    .limit(maxChunks + 1);

  if (fetchErr || !pendingChunks) {
    logger.warn("[chunk-embedder] failed to load pending chunks", {
      documentId,
      error: fetchErr?.message?.slice(0, 100),
    });
    return result;
  }

  const rows = pendingChunks as Array<{ id: number; chunk_text: string }>;

  // Count remaining after this batch
  const hasMore = rows.length > maxChunks;
  const batch = hasMore ? rows.slice(0, maxChunks) : rows;
  result.pendingRemaining = hasMore ? rows.length - maxChunks : 0;

  const now = new Date().toISOString();

  // ── Embed each chunk ─────────────────────────────────────────────────────────
  for (const chunk of batch) {
    try {
      const embResult = await provider.embedText(chunk.chunk_text, { model: modelId });

      // Accumulate tokens for batch log
      if (embResult.inputTokenCount) batchInputTokens += embResult.inputTokenCount;

      // Validate dimension — must match vector(1536) column
      if (!embResult.embedding || embResult.embedding.length !== EXPECTED_EMBEDDING_DIM) {
        const errMsg = `Expected ${EXPECTED_EMBEDDING_DIM} dims, got ${embResult.embedding?.length ?? 0}.`;
        await db
          .from("dms_document_content_chunks")
          .update({
            embedding_status:        "failed",
            embedding_error_code:    "dimension_mismatch",
            embedding_error_message: errMsg,
            updated_at:              now,
          })
          .eq("id", chunk.id);
        result.failed++;
        continue;
      }

      // Write embedding vector (Supabase expects a string literal for vector columns)
      const vectorLiteral = `[${embResult.embedding.join(",")}]`;

      await db
        .from("dms_document_content_chunks")
        .update({
          embedding:               vectorLiteral,
          embedding_status:        "complete",
          embedding_provider:      configCode ?? null,
          embedding_model:         embResult.model ?? modelId,
          embedded_at:             now,
          embedding_error_code:    null,
          embedding_error_message: null,
          updated_at:              now,
        })
        .eq("id", chunk.id);

      result.embedded++;
    } catch (err) {
      const { code, message } = safeEmbedErrorCode(err);
      await db
        .from("dms_document_content_chunks")
        .update({
          embedding_status:        "failed",
          embedding_error_code:    code,
          embedding_error_message: message,
          updated_at:              now,
        })
        .eq("id", chunk.id);
      result.failed++;
      logger.warn("[chunk-embedder] chunk embed failed", {
        documentId,
        chunkId: chunk.id,
        code,
      });
    }
  }

  // ── Batch usage log ────────────────────────────────────────────────────────
  if (batch.length > 0) {
    result.totalInputTokens = batchInputTokens > 0 ? batchInputTokens : undefined;
    const batchStatus = result.failed > 0 && result.embedded === 0
      ? "failed"
      : result.failed > 0
      ? "success"
      : "success";

    void logDmsAiUsage({
      providerConfigId: configId ?? null,
      featureArea: "DMS_SEMANTIC_CHUNKING",
      operationType: "semantic_chunk_embedding_batch",
      modelId: modelId ?? null,
      status: batchStatus,
      inputTokenCount: batchInputTokens > 0 ? batchInputTokens : null,
      outputTokenCount: null,
      durationMs: Date.now() - batchStartMs,
      documentId,
      aiJobId: null, // jobId not passed into embedder — documented
      metadata: {
        chunk_count: batch.length,
        embedded_count: result.embedded,
        failed_count: result.failed,
        model: modelId ?? null,
        source: configCode ?? null,
      },
    });
  }

  return result;
}
