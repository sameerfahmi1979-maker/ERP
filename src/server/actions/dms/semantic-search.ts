"use server";

/**
 * DMS 12.5 — Semantic Search / pgvector / Embeddings
 *
 * Generates embeddings of AI summaries (fallback: content text) and performs
 * cosine-similarity search via the search_dms_documents_by_embedding RPC.
 *
 * Hard rules:
 *  - Semantic search is additive — it never replaces existing search modes.
 *  - Raw content_text is NEVER returned in any result.
 *  - Embedding source text, query text, OCR text, and raw vectors are NEVER logged.
 *  - hr/legal/executive documents are excluded for non-admin users.
 *  - For a confidential source document, findSimilar requires dms.admin.
 *  - RLS is enforced (RPC is SECURITY INVOKER; user-facing reads use the RLS client).
 *  - No tags/links/metadata are auto-applied from semantic search.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import { getDmsEmbeddingProvider } from "@/lib/dms/ai/factory";
import { revalidatePath } from "next/cache";
import type {
  DmsSemanticSearchResult,
  DmsEmbeddingStatus,
  DmsDocumentEmbeddingStatusRow,
} from "@/lib/dms/ai/types";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const CONFIDENTIAL_ADMIN_REQUIRED = ["hr", "legal", "executive"];
const CONTENT_FALLBACK_MAX_CHARS = 8_000;
const SEMANTIC_PROMPT_VERSION = "v1.0";
const SEARCH_MAX_RESULTS = 25;
const SIMILAR_MAX_RESULTS = 10;
const MATCH_THRESHOLD = 0.2;

// ── Permission helpers ──────────────────────────────────────────────────────────

function canRunAi(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return (
    hasPermission(ctx, "dms.documents.ai.run") ||
    hasPermission(ctx, "dms.admin") ||
    ctx.roleCodes.includes("system_admin")
  );
}

function isAdminUser(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return hasPermission(ctx, "dms.admin") || ctx.roleCodes.includes("system_admin");
}

// ── Feature flag ──────────────────────────────────────────────────────────────

async function isSemanticSearchEnabled(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("erp_ai_feature_flags")
      .select("is_enabled")
      .eq("feature_code", "DMS_SEMANTIC_SEARCH")
      .single();
    return (data as { is_enabled?: boolean } | null)?.is_enabled ?? false;
  } catch {
    return false;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

/** Format a float array as a pgvector literal string for safe casting. */
function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

// ── Internal: embed one document ────────────────────────────────────────────────

async function runEmbeddingForDocument(params: {
  documentId: number;
  ctx: Awaited<ReturnType<typeof getAuthContext>>;
  forceRegenerate: boolean;
  calledFromBulk: boolean;
}): Promise<{
  success: boolean;
  status?: DmsEmbeddingStatus;
  model?: string | null;
  source?: "ai_summary" | "content_text";
  error?: string;
  skipped?: boolean;
}> {
  const { documentId, ctx, forceRegenerate, calledFromBulk } = params;
  const supabase = await createClient();
  const userId = ctx.profile!.id as number;
  const now = new Date().toISOString();

  // 1. Load document summary fields
  const { data: doc, error: docErr } = await supabase
    .from("dms_documents")
    .select(
      "id, document_no, confidentiality_level, ai_summary, ai_summary_status, summary_embedding_status"
    )
    .eq("id", documentId)
    .is("deleted_at", null)
    .single();

  if (docErr || !doc) {
    return { success: false, error: docErr?.message ?? "Document not found" };
  }

  const typedDoc = doc as Record<string, unknown>;
  const confidentiality = (typedDoc.confidentiality_level as string) ?? "internal";
  const documentNo = typedDoc.document_no as string;
  const currentStatus = (typedDoc.summary_embedding_status as string | null) ?? "pending";

  // 2. Confidentiality gate
  if (CONFIDENTIAL_ADMIN_REQUIRED.includes(confidentiality) && !isAdminUser(ctx)) {
    return {
      success: false,
      error: "Embedding generation for HR, legal, or executive documents requires administrator access.",
    };
  }

  // 3. Skip if already complete and not forced
  if (!forceRegenerate && currentStatus === "complete") {
    if (calledFromBulk) return { success: true, skipped: true, status: "complete" };
    return { success: false, error: "Embedding already exists. Use regenerate to overwrite." };
  }

  // 4. Resolve embedding source: prefer ai_summary, fallback to content_text
  const aiSummary = (typedDoc.ai_summary as string | null) ?? null;
  const aiSummaryStatus = (typedDoc.ai_summary_status as string | null) ?? null;

  let sourceText: string | null = null;
  let source: "ai_summary" | "content_text" | null = null;

  if (aiSummaryStatus === "complete" && aiSummary && aiSummary.trim().length > 0) {
    sourceText = aiSummary.trim();
    source = "ai_summary";
  } else {
    const { data: contentRow } = await supabase
      .from("dms_document_content")
      .select("content_text")
      .eq("document_id", documentId)
      .single();
    const contentText = (contentRow as Record<string, unknown> | null)?.content_text as
      | string
      | null;
    if (contentText && contentText.trim().length > 0) {
      sourceText = contentText.trim().slice(0, CONTENT_FALLBACK_MAX_CHARS);
      source = "content_text";
    }
  }

  // 5. Nothing to embed → mark skipped
  if (!sourceText || !source) {
    await supabase
      .from("dms_documents")
      .update({
        summary_embedding_status: "skipped",
        summary_embedding_error: null,
        summary_embedding_updated_at: now,
        updated_at: now,
      })
      .eq("id", documentId);
    if (calledFromBulk) return { success: true, skipped: true, status: "skipped" };
    return {
      success: false,
      error: "No AI summary or extracted text available to embed. Generate a summary or run OCR first.",
    };
  }

  // 6. Get embedding provider
  const { provider, configId, modelId } = await getDmsEmbeddingProvider();
  if (!provider.isConfigured()) {
    return { success: false, error: "DMS embedding provider is not configured." };
  }

  // 7. Embed (never log sourceText)
  const startMs = Date.now();
  let embedding: number[] | null = null;
  let usedModel: string | null = null;
  let inputTokens: number | null = null;
  let embedError: string | null = null;

  try {
    const result = await provider.embedText(sourceText, { model: modelId });
    if (!result.embedding || result.embedding.length === 0) {
      throw new Error("Provider returned an empty embedding.");
    }
    embedding = result.embedding;
    usedModel = result.model;
    inputTokens = result.inputTokenCount ?? null;
  } catch (err) {
    embedError = String(err);
  }

  const durationMs = Date.now() - startMs;

  // 8. Save result
  if (embedding) {
    const { error: updateErr } = await supabase
      .from("dms_documents")
      .update({
        summary_embedding: toVectorLiteral(embedding),
        summary_embedding_model: usedModel ?? modelId,
        summary_embedding_status: "complete",
        summary_embedding_source: source,
        summary_embedding_updated_at: now,
        summary_embedding_error: null,
        updated_at: now,
      })
      .eq("id", documentId);

    if (updateErr) {
      return { success: false, error: "Failed to save embedding: " + updateErr.message };
    }
  } else {
    await supabase
      .from("dms_documents")
      .update({
        summary_embedding_status: "failed",
        summary_embedding_error: embedError?.substring(0, 500) ?? "Unknown error",
        summary_embedding_updated_at: now,
        updated_at: now,
      })
      .eq("id", documentId);
  }

  // 9. Usage log (safe metadata only — never log source text or vector)
  await supabase.from("erp_ai_usage_logs").insert({
    provider_config_id: configId,
    feature_area: "DMS_SEMANTIC_SEARCH",
    operation_type: forceRegenerate ? "embedding_regenerate" : "embedding_generate",
    model_id: usedModel ?? modelId,
    status: embedding ? "complete" : "failed",
    input_token_count: inputTokens,
    output_token_count: null,
    duration_ms: durationMs,
    error_message: embedError?.substring(0, 300) ?? null,
    metadata_json: {
      document_id: documentId,
      prompt_version: SEMANTIC_PROMPT_VERSION,
      source,
      input_char_count: sourceText.length,
      vector_dims: embedding?.length ?? 0,
    },
    created_by: userId,
    created_at: now,
  });

  // 10. Audit (safe metadata only)
  await logAudit({
    module_code: "DMS",
    entity_name: "dms_documents",
    entity_id: documentId,
    entity_reference: documentNo,
    action: "update",
    new_values: {
      action: embedding
        ? forceRegenerate
          ? "dms_embedding_regenerated"
          : "dms_embedding_generated"
        : "dms_embedding_failed",
      document_id: documentId,
      source,
      model: usedModel ?? modelId,
      status: embedding ? "complete" : "failed",
      duration_ms: durationMs,
    },
  });

  if (!embedding) {
    return { success: false, error: `Embedding generation failed: ${embedError}`, status: "failed" };
  }

  return { success: true, status: "complete", model: usedModel, source };
}

// ── getDmsDocumentEmbeddingStatus ───────────────────────────────────────────────

export async function getDmsDocumentEmbeddingStatus(
  documentId: number
): Promise<ActionResult<DmsDocumentEmbeddingStatusRow>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx, "dms.documents.view") && !isAdminUser(ctx)) {
      return { success: false, error: "Permission denied" };
    }

    const { data, error } = await supabase
      .from("dms_documents")
      .select(
        `id, summary_embedding_status, summary_embedding_model, summary_embedding_source,
         summary_embedding_updated_at, summary_embedding_error,
         summary_embedding`
      )
      .eq("id", documentId)
      .is("deleted_at", null)
      .single();

    if (error || !data) return { success: false, error: error?.message ?? "Document not found" };

    const d = data as Record<string, unknown>;
    return {
      success: true,
      data: {
        documentId,
        status: (d.summary_embedding_status as DmsEmbeddingStatus | null) ?? null,
        model: (d.summary_embedding_model as string | null) ?? null,
        source: (d.summary_embedding_source as "ai_summary" | "content_text" | null) ?? null,
        updatedAt: (d.summary_embedding_updated_at as string | null) ?? null,
        error: (d.summary_embedding_error as string | null) ?? null,
        hasEmbedding: d.summary_embedding != null,
      },
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── generateDmsDocumentEmbedding ─────────────────────────────────────────────────

export async function generateDmsDocumentEmbedding(
  documentId: number
): Promise<ActionResult<{ documentId: number; status: DmsEmbeddingStatus; source?: string }>> {
  try {
    const parsed = z.number().int().positive().safeParse(documentId);
    if (!parsed.success) return { success: false, error: "Invalid document ID" };

    if (!(await isSemanticSearchEnabled())) {
      return { success: false, error: "DMS Semantic Search feature is not enabled." };
    }

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canRunAi(ctx)) return { success: false, error: "Permission denied" };

    const result = await runEmbeddingForDocument({
      documentId,
      ctx,
      forceRegenerate: false,
      calledFromBulk: false,
    });

    if (!result.success) return { success: false, error: result.error };

    revalidatePath(`/dms/documents/record/${documentId}`);
    revalidatePath("/dms/documents");

    return {
      success: true,
      data: { documentId, status: result.status ?? "complete", source: result.source },
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── regenerateDmsDocumentEmbedding ───────────────────────────────────────────────

export async function regenerateDmsDocumentEmbedding(
  documentId: number
): Promise<ActionResult<{ documentId: number; status: DmsEmbeddingStatus; source?: string }>> {
  try {
    const parsed = z.number().int().positive().safeParse(documentId);
    if (!parsed.success) return { success: false, error: "Invalid document ID" };

    if (!(await isSemanticSearchEnabled())) {
      return { success: false, error: "DMS Semantic Search feature is not enabled." };
    }

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canRunAi(ctx)) return { success: false, error: "Permission denied" };

    const result = await runEmbeddingForDocument({
      documentId,
      ctx,
      forceRegenerate: true,
      calledFromBulk: false,
    });

    if (!result.success) return { success: false, error: result.error };

    revalidatePath(`/dms/documents/record/${documentId}`);
    revalidatePath("/dms/documents");

    return {
      success: true,
      data: { documentId, status: result.status ?? "complete", source: result.source },
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── bulkGenerateMissingDmsEmbeddings ─────────────────────────────────────────────

const BulkEmbeddingSchema = z.object({
  batchSize: z.number().int().min(1).max(50).optional().default(20),
  resumeFromDocumentId: z.number().int().positive().optional(),
  dryRun: z.boolean().optional().default(false),
});

export async function bulkGenerateMissingDmsEmbeddings(
  input: z.infer<typeof BulkEmbeddingSchema>
): Promise<
  ActionResult<{
    processed: number;
    skipped: number;
    failed: number;
    errors: Array<{ documentId: number; documentNo?: string; error: string }>;
    nextResumeFromDocumentId: number | null;
  }>
> {
  try {
    const parsed = BulkEmbeddingSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

    const { batchSize, resumeFromDocumentId, dryRun } = parsed.data;

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!isAdminUser(ctx)) return { success: false, error: "Permission denied — requires dms.admin" };

    if (!(await isSemanticSearchEnabled())) {
      return { success: false, error: "DMS Semantic Search feature is not enabled." };
    }

    const supabase = await createClient();

    // Documents that have content text (used as fallback source)
    const { data: contentRows } = await supabase
      .from("dms_document_content")
      .select("document_id")
      .not("content_text", "is", null);
    const contentDocIds = (contentRows ?? []).map(
      (r) => (r as Record<string, unknown>).document_id as number
    );

    // Documents needing an embedding: missing/pending/failed/skipped status,
    // and have either an AI summary or extracted content to embed.
    let docsQuery = supabase
      .from("dms_documents")
      .select("id, document_no, ai_summary, ai_summary_status, summary_embedding_status")
      .is("deleted_at", null)
      .or("summary_embedding_status.is.null,summary_embedding_status.in.(pending,failed,skipped)")
      .order("id", { ascending: true })
      .limit(batchSize + 1);

    if (resumeFromDocumentId) docsQuery = docsQuery.gte("id", resumeFromDocumentId);

    const { data: docRows, error: docsErr } = await docsQuery;
    if (docsErr) return { success: false, error: "Failed to query documents: " + docsErr.message };

    const allRows = (docRows ?? []) as Array<{
      id: number;
      document_no: string;
      ai_summary: string | null;
      ai_summary_status: string | null;
    }>;

    // Keep only docs with an embeddable source (AI summary complete OR has content text)
    const embeddable = allRows.filter(
      (r) =>
        (r.ai_summary_status === "complete" && !!r.ai_summary) ||
        contentDocIds.includes(r.id)
    );

    const hasMore = embeddable.length > batchSize;
    const batch = hasMore ? embeddable.slice(0, batchSize) : embeddable;
    const nextResumeFromDocumentId = hasMore ? embeddable[batchSize]?.id ?? null : null;

    if (dryRun) {
      return {
        success: true,
        data: { processed: 0, skipped: 0, failed: 0, errors: [], nextResumeFromDocumentId },
      };
    }

    let processed = 0;
    let skipped = 0;
    let failed = 0;
    const errors: Array<{ documentId: number; documentNo?: string; error: string }> = [];

    for (const row of batch) {
      try {
        const result = await runEmbeddingForDocument({
          documentId: row.id,
          ctx,
          forceRegenerate: false,
          calledFromBulk: true,
        });
        if (result.skipped) skipped++;
        else if (result.success) processed++;
        else {
          failed++;
          errors.push({ documentId: row.id, documentNo: row.document_no, error: result.error ?? "Unknown error" });
        }
      } catch (rowErr) {
        failed++;
        errors.push({ documentId: row.id, documentNo: row.document_no, error: String(rowErr) });
      }
    }

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_documents",
      entity_id: 0,
      entity_reference: "BULK_EMBEDDING",
      action: "update",
      new_values: {
        action: "dms_embeddings_bulk_generated",
        batch_size: batchSize,
        processed,
        skipped,
        failed,
        resume_from: resumeFromDocumentId ?? null,
        next_resume: nextResumeFromDocumentId,
      },
    });

    revalidatePath("/dms/documents");

    return {
      success: true,
      data: { processed, skipped, failed, errors, nextResumeFromDocumentId },
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── semanticSearchDmsDocuments ───────────────────────────────────────────────────

export async function semanticSearchDmsDocuments(
  question: string
): Promise<ActionResult<DmsSemanticSearchResult[]>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx, "dms.documents.view") && !isAdminUser(ctx)) {
      return { success: false, error: "Permission denied." };
    }

    if (!question || question.trim().length < 3) {
      return { success: false, error: "Please enter a search phrase (at least 3 characters)." };
    }

    if (!(await isSemanticSearchEnabled())) {
      return { success: false, error: "DMS Semantic Search feature is not enabled." };
    }

    const { provider, configId, modelId } = await getDmsEmbeddingProvider();
    if (!provider.isConfigured()) {
      return { success: false, error: "DMS embedding provider is not configured." };
    }

    const isAdmin = isAdminUser(ctx);
    const queryText = question.trim().slice(0, 1_000);

    const startMs = Date.now();
    let queryEmbedding: number[] | null = null;
    let usedModel: string | null = null;
    let inputTokens: number | null = null;
    try {
      const emb = await provider.embedText(queryText, { model: modelId });
      queryEmbedding = emb.embedding;
      usedModel = emb.model;
      inputTokens = emb.inputTokenCount ?? null;
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to embed query." };
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("search_dms_documents_by_embedding", {
      p_query_embedding: toVectorLiteral(queryEmbedding),
      p_match_count: SEARCH_MAX_RESULTS,
      p_match_threshold: MATCH_THRESHOLD,
      p_is_admin: isAdmin,
      p_exclude_document_id: null,
    });

    const durationMs = Date.now() - startMs;

    if (error) {
      return { success: false, error: "Semantic search query failed." };
    }

    const rows = (data ?? []) as Record<string, unknown>[];
    const results: DmsSemanticSearchResult[] = rows.map((row) => {
      const similarity = typeof row.similarity === "number" ? row.similarity : 0;
      const pct = Math.round(similarity * 100);
      const summary =
        typeof row.ai_summary === "string" && row.ai_summary
          ? (row.ai_summary as string).substring(0, 160) +
            ((row.ai_summary as string).length > 160 ? "…" : "")
          : null;
      return {
        documentId: row.document_id as number,
        documentNo: (row.document_no as string) ?? "",
        title: (row.title as string) ?? "",
        aiSummarySnippet: summary,
        similarity,
        riskLevel: (row.ai_risk_level as string | null) ?? null,
        completenessScore: typeof row.completeness_score === "number" ? row.completeness_score : null,
        expiryDate: (row.expiry_date as string | null) ?? null,
        matchReason: `Semantically similar to your query (${pct}% match)`,
      };
    });

    // Usage log (no query text)
    await supabase.from("erp_ai_usage_logs").insert({
      provider_config_id: configId,
      feature_area: "DMS_SEMANTIC_SEARCH",
      operation_type: "semantic_search",
      model_id: usedModel ?? modelId,
      status: "complete",
      input_token_count: inputTokens,
      output_token_count: null,
      duration_ms: durationMs,
      metadata_json: {
        prompt_version: SEMANTIC_PROMPT_VERSION,
        query_char_count: queryText.length,
        result_count: results.length,
      },
      created_by: ctx.profile.id,
      created_at: new Date().toISOString(),
    });

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_documents",
      entity_id: null,
      entity_reference: "",
      action: "dms_semantic_search_used",
      new_values: { result_count: results.length, query_char_count: queryText.length },
    });

    return { success: true, data: results };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── findSimilarDmsDocuments ──────────────────────────────────────────────────────

export async function findSimilarDmsDocuments(
  documentId: number
): Promise<ActionResult<DmsSemanticSearchResult[]>> {
  try {
    const parsed = z.number().int().positive().safeParse(documentId);
    if (!parsed.success) return { success: false, error: "Invalid document ID" };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx, "dms.documents.view") && !isAdminUser(ctx)) {
      return { success: false, error: "Permission denied." };
    }

    if (!(await isSemanticSearchEnabled())) {
      return { success: false, error: "DMS Semantic Search feature is not enabled." };
    }

    const supabase = await createClient();
    const isAdmin = isAdminUser(ctx);

    // Load source document embedding + confidentiality
    const { data: srcDoc, error: srcErr } = await supabase
      .from("dms_documents")
      .select("id, confidentiality_level, summary_embedding, summary_embedding_status")
      .eq("id", documentId)
      .is("deleted_at", null)
      .single();

    if (srcErr || !srcDoc) return { success: false, error: "Document not found." };

    const typedSrc = srcDoc as Record<string, unknown>;
    const confidentiality = (typedSrc.confidentiality_level as string) ?? "internal";

    // Confidential source document requires admin
    if (CONFIDENTIAL_ADMIN_REQUIRED.includes(confidentiality) && !isAdmin) {
      return { success: false, error: "Finding similar documents for a confidential document requires administrator access." };
    }

    if (typedSrc.summary_embedding == null) {
      return { success: false, error: "This document has no embedding yet. Generate an embedding first." };
    }

    // summary_embedding comes back as the pgvector text representation "[...]".
    const srcVectorLiteral = String(typedSrc.summary_embedding);

    const startMs = Date.now();
    const { data, error } = await supabase.rpc("search_dms_documents_by_embedding", {
      p_query_embedding: srcVectorLiteral,
      p_match_count: SIMILAR_MAX_RESULTS,
      p_match_threshold: MATCH_THRESHOLD,
      p_is_admin: isAdmin,
      p_exclude_document_id: documentId,
    });
    const durationMs = Date.now() - startMs;

    if (error) return { success: false, error: "Similar-document search failed." };

    const rows = (data ?? []) as Record<string, unknown>[];
    const results: DmsSemanticSearchResult[] = rows.map((row) => {
      const similarity = typeof row.similarity === "number" ? row.similarity : 0;
      const pct = Math.round(similarity * 100);
      const summary =
        typeof row.ai_summary === "string" && row.ai_summary
          ? (row.ai_summary as string).substring(0, 160) +
            ((row.ai_summary as string).length > 160 ? "…" : "")
          : null;
      return {
        documentId: row.document_id as number,
        documentNo: (row.document_no as string) ?? "",
        title: (row.title as string) ?? "",
        aiSummarySnippet: summary,
        similarity,
        riskLevel: (row.ai_risk_level as string | null) ?? null,
        completenessScore: typeof row.completeness_score === "number" ? row.completeness_score : null,
        expiryDate: (row.expiry_date as string | null) ?? null,
        matchReason: `${pct}% similar`,
      };
    });

    await supabase.from("erp_ai_usage_logs").insert({
      feature_area: "DMS_SEMANTIC_SEARCH",
      operation_type: "find_similar_documents",
      status: "complete",
      duration_ms: durationMs,
      metadata_json: { document_id: documentId, result_count: results.length },
      created_by: ctx.profile.id,
      created_at: new Date().toISOString(),
    });

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_documents",
      entity_id: documentId,
      entity_reference: "",
      action: "dms_similar_documents_searched",
      new_values: { document_id: documentId, result_count: results.length },
    });

    return { success: true, data: results };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
