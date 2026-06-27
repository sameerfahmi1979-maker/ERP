/**
 * ERP DMS AI Phase 11 — Semantic Indexer
 *
 * Orchestrates the full semantic indexing pipeline for a single document:
 *   1. Load dms_document_content (canonical text + hash).
 *   2. Compare content_hash with existing active chunks.
 *   3. If changed (or forceRebuild): soft-invalidate old chunks, build new chunks.
 *   4. If DMS_SEMANTIC_EMBEDDINGS enabled: embed pending chunks.
 *
 * Security rules:
 *   - Uses createAdminClient() exclusively — worker-safe, no user session.
 *   - Never logs chunk_text, content_text, or any document content.
 *   - Idempotent: unchanged content produces no new rows.
 *   - Max 200 chunks per document enforced by chunk builder.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { buildSemanticChunkDrafts } from "./chunk-builder";
import { embedPendingDocumentChunks } from "./chunk-embedder";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SemanticDocumentIndexInput {
  documentId:      number;
  source:          "post_approve_orchestration" | "admin_backfill" | "manual_rebuild" | "content_sync_trigger";
  forceRebuild?:   boolean;
  maxEmbedChunks?: number;
}

export interface SemanticDocumentIndexResult {
  success:          boolean;
  documentId:       number;
  status:           "indexed" | "skipped" | "partial" | "failed";
  chunksCreated:    number;
  chunksEmbedded:   number;
  chunksSkipped:    number;
  chunksFailed:     number;
  pendingRemaining: number;
  errorCode?:       string;
  safeMessage?:     string;
  retryable?:       boolean;
}

// ── Feature flag helper ─────────────────────────────────────────────────────────

async function loadSemanticFlags(): Promise<{
  chunkingEnabled:   boolean;
  embeddingsEnabled: boolean;
}> {
  try {
    const db = createAdminClient();
    const { data } = await db
      .from("erp_ai_feature_flags")
      .select("feature_code, is_enabled")
      .in("feature_code", ["DMS_SEMANTIC_CHUNKING", "DMS_SEMANTIC_EMBEDDINGS"]);

    const map = new Map<string, boolean>(
      ((data ?? []) as Array<{ feature_code: string; is_enabled: boolean }>)
        .map((r) => [r.feature_code, r.is_enabled])
    );
    return {
      chunkingEnabled:   map.get("DMS_SEMANTIC_CHUNKING")   ?? false,
      embeddingsEnabled: map.get("DMS_SEMANTIC_EMBEDDINGS") ?? false,
    };
  } catch {
    return { chunkingEnabled: false, embeddingsEnabled: false };
  }
}

// ── Main export ──────────────────────────────────────────────────────────────────

/**
 * Index a single document's content text into semantic chunks + embeddings.
 * Idempotent: unchanged content produces no new rows.
 * Safe for worker context: uses admin client, no user session required.
 */
export async function indexDmsDocumentSemantically(
  input: SemanticDocumentIndexInput
): Promise<SemanticDocumentIndexResult> {
  const { documentId, source, forceRebuild = false, maxEmbedChunks = 50 } = input;

  const baseResult: SemanticDocumentIndexResult = {
    success:          false,
    documentId,
    status:           "failed",
    chunksCreated:    0,
    chunksEmbedded:   0,
    chunksSkipped:    0,
    chunksFailed:     0,
    pendingRemaining: 0,
  };

  try {
    // ── Feature flags ──────────────────────────────────────────────────────────
    const flags = await loadSemanticFlags();
    if (!flags.chunkingEnabled) {
      return {
        ...baseResult,
        success:     true,
        status:      "skipped",
        safeMessage: "DMS_SEMANTIC_CHUNKING disabled.",
        retryable:   false,
      };
    }

    const db = createAdminClient();

    // ── Load document content ──────────────────────────────────────────────────
    const { data: contentRow, error: contentErr } = await db
      .from("dms_document_content")
      .select("id, content_text, content_text_sha256, is_truncated")
      .eq("document_id", documentId)
      .maybeSingle();

    if (contentErr) {
      return {
        ...baseResult,
        errorCode:   "database_error",
        safeMessage: "Failed to load document content.",
        retryable:   true,
      };
    }

    if (!contentRow) {
      return {
        ...baseResult,
        success:     true,
        status:      "skipped",
        safeMessage: "No content row found.",
        retryable:   false,
      };
    }

    const row = contentRow as {
      id: number;
      content_text: string | null;
      content_text_sha256: string | null;
      is_truncated: boolean | null;
    };

    const contentText = row.content_text?.trim() ?? null;
    const contentHash = row.content_text_sha256 ?? null;

    if (!contentText || contentText.length === 0) {
      return {
        ...baseResult,
        success:     true,
        status:      "skipped",
        safeMessage: "No content text available.",
        retryable:   false,
      };
    }

    // Use empty string as content_hash sentinel if sha256 is missing
    const effectiveHash = contentHash ?? `len:${contentText.length}`;

    // ── Check for existing active chunks ────────────────────────────────────────
    const { data: existingChunks } = await db
      .from("dms_document_content_chunks")
      .select("id, content_hash")
      .eq("document_id", documentId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .limit(1);

    const existingHash = (existingChunks as Array<{ id: number; content_hash: string }> | null)?.[0]?.content_hash ?? null;

    if (existingHash === effectiveHash && !forceRebuild) {
      // Content unchanged — check if there are pending embeddings to process
      if (flags.embeddingsEnabled) {
        const embedResult = await embedPendingDocumentChunks({ documentId, maxChunks: maxEmbedChunks });
        return {
          ...baseResult,
          success:          embedResult.embedded > 0 || embedResult.pendingRemaining === 0,
          status:           embedResult.pendingRemaining > 0 ? "partial" : "skipped",
          chunksEmbedded:   embedResult.embedded,
          chunksSkipped:    embedResult.skipped,
          chunksFailed:     embedResult.failed,
          pendingRemaining: embedResult.pendingRemaining,
          safeMessage:      "Content unchanged — processed pending embeddings only.",
        };
      }
      return {
        ...baseResult,
        success:     true,
        status:      "skipped",
        safeMessage: "Content unchanged, no rebuild needed.",
      };
    }

    // ── Soft-invalidate existing active chunks ─────────────────────────────────
    if (existingHash !== null) {
      await db
        .from("dms_document_content_chunks")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("document_id", documentId)
        .eq("is_active", true)
        .is("deleted_at", null);
    }

    // ── Build new chunks ───────────────────────────────────────────────────────
    const drafts = buildSemanticChunkDrafts({
      documentId,
      contentId:   row.id,
      contentText,
      contentHash: effectiveHash,
      isTruncated: row.is_truncated ?? false,
    });

    if (drafts.length === 0) {
      return {
        ...baseResult,
        success:     true,
        status:      "skipped",
        safeMessage: "No chunks produced from content.",
        retryable:   false,
      };
    }

    // ── Insert new chunk rows ──────────────────────────────────────────────────
    const now = new Date().toISOString();
    const insertRows = drafts.map((d) => ({
      document_id:      d.documentId,
      content_id:       d.contentId,
      chunk_index:      d.chunkIndex,
      chunk_text:       d.chunkText,
      chunk_hash:       d.chunkHash,
      content_hash:     d.contentHash,
      source_kind:      d.sourceKind,
      token_estimate:   d.tokenEstimate,
      char_count:       d.charCount,
      embedding_status: "pending" as const,
      is_active:        true,
      created_at:       now,
      updated_at:       now,
      created_by:       0,  // system context
    }));

    const { error: insertErr } = await db
      .from("dms_document_content_chunks")
      .insert(insertRows);

    if (insertErr) {
      logger.warn("[semantic-indexer] chunk insert failed", {
        documentId,
        error: insertErr.message?.slice(0, 100),
      });
      return {
        ...baseResult,
        errorCode:   "database_error",
        safeMessage: "Failed to insert chunks.",
        retryable:   true,
      };
    }

    logger.info("[semantic-indexer] chunks created", {
      documentId,
      source,
      count: drafts.length,
    });

    // ── Embed chunks ──────────────────────────────────────────────────────────
    let chunksEmbedded = 0;
    let chunksSkipped = 0;
    let chunksFailed = 0;
    let pendingRemaining = 0;

    if (flags.embeddingsEnabled) {
      const embedResult = await embedPendingDocumentChunks({ documentId, maxChunks: maxEmbedChunks });
      chunksEmbedded   = embedResult.embedded;
      chunksSkipped    = embedResult.skipped;
      chunksFailed     = embedResult.failed;
      pendingRemaining = embedResult.pendingRemaining;
    } else {
      pendingRemaining = drafts.length;
    }

    const status: SemanticDocumentIndexResult["status"] =
      pendingRemaining > 0 ? "partial" : "indexed";

    return {
      success:          true,
      documentId,
      status,
      chunksCreated:    drafts.length,
      chunksEmbedded,
      chunksSkipped,
      chunksFailed,
      pendingRemaining,
    };
  } catch (err) {
    const safeMsg = err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200);
    logger.error("[semantic-indexer] unexpected error", { documentId, error: safeMsg });
    return {
      ...baseResult,
      errorCode:   "unexpected",
      safeMessage: "Unexpected error during semantic indexing.",
      retryable:   true,
    };
  }
}
