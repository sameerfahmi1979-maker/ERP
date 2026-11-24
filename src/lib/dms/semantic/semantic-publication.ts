import "server-only";
import { z } from "zod";
import { logDmsAiUsage } from "@/lib/ai/observability/log-dms-ai-usage";
import { currentJobClaim, type JobClaim } from "@/lib/dms/ai-jobs/claim-scope";
import { getDmsEmbeddingProvider } from "@/lib/dms/ai/factory";
import { createAdminClient } from "@/lib/supabase/admin";
import { questionTextHash } from "@/server/dms-question-publication";
import { buildSemanticChunkDrafts, type SemanticChunkDraft } from "./chunk-builder";
import { EXPECTED_EMBEDDING_DIM, safeEmbedErrorCode } from "./chunk-embedder";
import type { SemanticDocumentIndexInput, SemanticDocumentIndexResult } from "./semantic-indexer";

const source = z.object({
  versionId: z.number().int().positive(),
  contentId: z.number().int().positive(),
  sourceHash: z.string().regex(/^[0-9a-f]{64}$/),
  sourceProof: z.string().regex(/^[0-9a-f]{64}$/),
  isTruncated: z.boolean(),
  embeddingsEnabled: z.boolean(),
});
const ready = source.extend({ success: z.literal(true), status: z.literal("ready") });
const held = z.object({ success: z.literal(false), status: z.literal("held"), reason: z.string() });
const published = source.extend({
  success: z.literal(true),
  status: z.enum(["published", "unchanged"]),
  chunksCreated: z.number().int().min(0).max(200),
  chunksEmbedded: z.number().int().min(0).max(200),
  pendingRemaining: z.number().int().min(0).max(200),
}).refine((receipt) => {
  if (receipt.embeddingsEnabled && receipt.pendingRemaining !== 0) return false;
  if (receipt.status === "unchanged") return receipt.chunksCreated === 0 && receipt.chunksEmbedded === 0;
  return receipt.chunksCreated > 0 && receipt.chunksCreated === receipt.chunksEmbedded + receipt.pendingRemaining &&
    (receipt.embeddingsEnabled || receipt.chunksEmbedded === 0);
});

export type SemanticPublicationExpectation = z.infer<typeof source> & { documentId: number; chunkCount: number };
type SemanticReceipt = z.infer<typeof published>;
type Draft = Omit<SemanticChunkDraft, "documentId" | "contentId" | "contentHash"> & {
  embedding?: number[];
  embeddingProvider?: string;
  embeddingModel?: string;
};
const MAX_EMBED_CHUNKS_PER_ATTEMPT = 50;
// The claim lease is ten minutes. Leave time for an in-flight call and publication.
const EMBEDDING_WORK_DEADLINE_MS = 8 * 60_000;

function matchesPublication(receipt: SemanticReceipt, expected: SemanticPublicationExpectation) {
  return receipt.versionId === expected.versionId && receipt.contentId === expected.contentId &&
    receipt.sourceHash === expected.sourceHash && receipt.sourceProof === expected.sourceProof &&
    receipt.isTruncated === expected.isTruncated && receipt.embeddingsEnabled === expected.embeddingsEnabled &&
    (receipt.status === "unchanged" || receipt.chunksCreated === expected.chunkCount);
}

export async function confirmSemanticPublication(
  db: ReturnType<typeof createAdminClient>,
  claim: { jobId: number; token: string },
  expected: SemanticPublicationExpectation,
): Promise<boolean> {
  const { documentId, versionId, contentId, sourceHash, sourceProof, isTruncated, embeddingsEnabled } = expected;
  try {
    const { data, error } = await db.rpc("f07_semantic_index", { p_action: "receipt", p_data: {
      jobId: claim.jobId, token: claim.token, documentId, versionId, contentId, sourceHash, sourceProof, isTruncated, embeddingsEnabled,
    } });
    const receipt = published.safeParse(data);
    return !error && receipt.success && matchesPublication(receipt.data, expected);
  } catch { return false; }
}

function fromReceipt(base: SemanticDocumentIndexResult, receipt: SemanticReceipt): SemanticDocumentIndexResult {
  return {
    ...base,
    success: true,
    status: receipt.status === "unchanged" ? "skipped" : receipt.pendingRemaining > 0 ? "partial" : "indexed",
    chunksCreated: receipt.chunksCreated,
    chunksEmbedded: receipt.chunksEmbedded,
    pendingRemaining: receipt.pendingRemaining,
  };
}

function fromHold(base: SemanticDocumentIndexResult, reason: string): SemanticDocumentIndexResult {
  const safeSkip = reason === "no_content" ? "No content text available."
    : reason === "chunking_disabled" ? "DMS_SEMANTIC_CHUNKING disabled."
    : reason === "search_index_preserved" ? "Embeddings are disabled. The searchable generation was retained."
    : null;
  if (safeSkip) return { ...base, success: true, status: "skipped", safeMessage: safeSkip, retryable: false };
  return { ...base, errorCode: "publication_rejected", retryable: reason === "embedding_policy_changed",
    safeMessage: reason === "source_unproven" ? "Document content has no current verification proof." : "Semantic publication was held." };
}

async function stageEmbeddings(
  db: ReturnType<typeof createAdminClient>, claim: JobClaim, drafts: Draft[], documentId: number, deadline: number,
) {
  const { provider, configCode, configId, modelId } = await getDmsEmbeddingProvider();
  if (!configCode || !provider.isConfigured()) return { errorCode: "provider_not_configured", retryable: false };

  const start = Date.now();
  let inputTokens = 0;
  let attempted = 0;
  let embedded = 0;
  let errorCode: string | undefined;
  for (const draft of drafts) {
    if (performance.now() >= deadline) {
      errorCode = "stale_lock";
      break;
    }
    const asserted = await db.rpc("f07_ai_worker", { p_action: "assert", p_data: { jobId: claim.jobId, token: claim.token } });
    if (asserted.error || asserted.data?.success !== true) return { errorCode: "stale_lock", retryable: true };
    if (performance.now() >= deadline) {
      errorCode = "stale_lock";
      break;
    }
    try {
      attempted++;
      const result = await provider.embedText(draft.chunkText, { model: modelId });
      inputTokens += result.inputTokenCount ?? 0;
      if (!Array.isArray(result.embedding) || result.embedding.length !== EXPECTED_EMBEDDING_DIM ||
          !result.embedding.every(value => typeof value === "number" && Number.isFinite(Math.fround(value))) ||
          !result.embedding.some(value => Math.fround(value) !== 0)) {
        errorCode = "dimension_mismatch";
        break;
      }
      draft.embedding = result.embedding;
      draft.embeddingProvider = configCode;
      draft.embeddingModel = result.model || modelId;
      embedded++;
    } catch (error) {
      errorCode = safeEmbedErrorCode(error).code;
      break;
    }
  }
  if (attempted > 0) await logDmsAiUsage({
    providerConfigId: configId,
    documentId,
    aiJobId: claim.jobId,
    featureArea: "DMS_SEMANTIC_CHUNKING",
    operationType: "semantic_chunk_embedding_batch",
    modelId,
    status: errorCode ? "failed" : "success",
    inputTokenCount: inputTokens || null,
    durationMs: Date.now() - start,
    metadata: { chunk_count: attempted, embedded_count: embedded,
      failed_count: attempted - embedded, model: modelId, source: configCode },
  });
  return errorCode ? { errorCode, retryable: errorCode !== "dimension_mismatch" } : undefined;
}

export async function indexClaimedDmsDocument(
  input: SemanticDocumentIndexInput,
  base: SemanticDocumentIndexResult,
): Promise<SemanticDocumentIndexResult> {
  const claim = currentJobClaim();
  if (!claim || claim.failed || claim.semanticPublication) return { ...base, errorCode: "publication_rejected", retryable: false };
  const deadline = performance.now() + EMBEDDING_WORK_DEADLINE_MS;
  const { documentId, forceRebuild = false, maxEmbedChunks = MAX_EMBED_CHUNKS_PER_ATTEMPT } = input;
  const db = createAdminClient();
  const binding = { jobId: claim.jobId, token: claim.token, documentId, forceRebuild };
  const inspection = await db.rpc("f07_semantic_index", { p_action: "inspect", p_data: binding });
  const state = ready.safeParse(inspection.data);
  if (inspection.error) return { ...base, errorCode: "database_error", retryable: true };
  if (!state.success) {
    const hold = held.safeParse(inspection.data);
    if (hold.success) return fromHold(base, hold.data.reason);
    const prior = published.safeParse(inspection.data);
    return prior.success ? fromReceipt(base, prior.data)
      : { ...base, errorCode: "database_error", retryable: true };
  }

  const { versionId, contentId, sourceHash, sourceProof, isTruncated, embeddingsEnabled } = state.data;
  const { data: row, error } = await db.from("dms_document_content")
    .select("id, content_text, is_truncated")
    .eq("document_id", documentId).eq("id", contentId)
    .maybeSingle().retry(false);
  if (error) return { ...base, errorCode: "database_error", retryable: true };
  if (!row || row.id !== contentId ||
      (row.is_truncated ?? false) !== isTruncated || typeof row.content_text !== "string" ||
      questionTextHash(row.content_text) !== sourceHash) return fromHold(base, "source_changed");

  const drafts: Draft[] = buildSemanticChunkDrafts({ documentId, contentId, contentHash: sourceHash,
    contentText: row.content_text, isTruncated, preserveSourceText: true })
    .map(({ chunkIndex, chunkText, chunkHash, sourceKind, tokenEstimate, charCount }) => ({
      chunkIndex, chunkText, chunkHash, sourceKind, tokenEstimate, charCount,
    }));
  if (!drafts.length) return fromHold(base, "no_content");
  if (embeddingsEnabled) {
    if (!Number.isSafeInteger(maxEmbedChunks) || drafts.length > Math.min(maxEmbedChunks, MAX_EMBED_CHUNKS_PER_ATTEMPT)) {
      return { ...base, errorCode: "validation_error", retryable: false, safeMessage: "The index exceeds the embedding attempt budget." };
    }
    const failed = await stageEmbeddings(db, claim, drafts, documentId, deadline);
    if (failed) return { ...base, ...failed };
    if (performance.now() >= deadline) return { ...base, errorCode: "stale_lock", retryable: true };
  }
  if (claim.failed) return { ...base, errorCode: "publication_rejected", retryable: !claim.uncertainWrite };

  const expected = { documentId, versionId, contentId, sourceHash, sourceProof, isTruncated, embeddingsEnabled, chunkCount: drafts.length };
  // Keep the expected result in request-local state until the write has a confirmed outcome.
  claim.semanticPublication = expected;
  const write = await db.rpc("f07_semantic_index", { p_action: "publish", p_data: {
    ...binding, versionId, contentId, sourceHash, sourceProof, isTruncated, embeddingsEnabled, chunks: drafts,
  } });
  if (!write.error) {
    const hold = held.safeParse(write.data);
    if (hold.success) {
      claim.semanticPublication = undefined;
      return fromHold(base, hold.data.reason);
    }
    const receipt = published.safeParse(write.data);
    if (receipt.success && matchesPublication(receipt.data, expected)) {
      claim.semanticPublication = undefined;
      return fromReceipt(base, receipt.data);
    }
  }
  return { ...base, errorCode: "publication_rejected", retryable: false };
}
