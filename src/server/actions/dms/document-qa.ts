"use server";

/**
 * DMS 12.4 — Document Q&A Server Action
 *
 * Answers a question about a single document using only that document's
 * content_text, ai_summary, and metadata.
 *
 * Hard rules:
 *  - Question text, prompt, content, and raw AI response are NEVER logged.
 *  - For hr/legal/executive documents, dms.admin permission is required.
 *  - Content text is capped at 8,000 chars for the prompt.
 *  - AI answers must be grounded to the document — no external knowledge.
 *  - createAdminClient() is NEVER used.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import { getDmsAiProvider, getDmsEmbeddingProvider } from "@/lib/dms/ai/factory";
import type { DmsDocumentQuestionAnswer } from "@/lib/dms/ai/types";
import { logDmsAiUsage } from "@/lib/ai/observability/log-dms-ai-usage";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const CONFIDENTIAL_ADMIN_REQUIRED = ["hr", "legal", "executive"] as const;
const QA_CONTENT_MAX_CHARS = 8_000;
const QA_SUMMARY_MAX_CHARS = 1_000;
const QA_PROMPT_VERSION = "v1.1";
const QA_CHUNK_TOP_K = 5;
const QA_CHUNK_SIMILARITY_THRESHOLD = 0.25;

// ── Feature flags ──────────────────────────────────────────────────────────────

async function isDmsDocumentQaEnabled(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("erp_ai_feature_flags")
      .select("is_enabled")
      .eq("feature_code", "DMS_DOCUMENT_QA")
      .single();
    return (data as { is_enabled?: boolean } | null)?.is_enabled ?? false;
  } catch {
    return false;
  }
}

async function isChunkSearchEnabled(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("erp_ai_feature_flags")
      .select("is_enabled")
      .eq("feature_code", "DMS_SEMANTIC_SEARCH_CHUNKS")
      .single();
    return (data as { is_enabled?: boolean } | null)?.is_enabled ?? false;
  } catch {
    return false;
  }
}

/** Format embedding as pgvector literal. */
function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

/** Supabase returns pgvector columns as JSON array strings, not number[]. */
function parseEmbeddingVector(embedding: unknown): number[] | null {
  if (Array.isArray(embedding)) {
    return embedding.every((v) => typeof v === "number") ? (embedding as number[]) : null;
  }
  if (typeof embedding === "string") {
    try {
      const parsed = JSON.parse(embedding) as unknown;
      return Array.isArray(parsed) && parsed.every((v) => typeof v === "number")
        ? (parsed as number[])
        : null;
    } catch {
      return null;
    }
  }
  return null;
}

// ── Permission helpers ─────────────────────────────────────────────────────────

function isAdminUser(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return (
    hasPermission(ctx, "dms.admin") || ctx.roleCodes.includes("system_admin")
  );
}

// ── Zod schema for Q&A response ───────────────────────────────────────────────

const QaResponseSchema = z.object({
  answer: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  sourceUsed: z.enum(["content_text", "ai_summary", "metadata", "not_found", "chunk_text"]),
});

// ── Q&A prompt builders ───────────────────────────────────────────────────────

function buildQaSystemPrompt(): string {
  return `You are a document question-answering assistant for the Alliance Gulf ERP system.

You will be given information about a single document including its metadata, AI summary, and extracted text content.

RULES:
- Answer ONLY from the provided document information.
- Do NOT use external knowledge, general facts, or information from outside this document.
- If the answer is not found in the provided document information, respond with: "I could not find this information in the document."
- Do NOT guess or infer beyond what is written.
- Do NOT reveal confidential data, personal medical details, salary, or private information not relevant to the question.
- Keep your answer concise and factual.
- Return ONLY a JSON object with these fields:
  - answer: string (your answer based only on this document)
  - confidence: "high" | "medium" | "low"
  - sourceUsed: "content_text" | "ai_summary" | "metadata" | "not_found"

No markdown. No explanation. JSON only.`;
}

function buildQaUserMessage(params: {
  documentNo: string;
  title: string;
  typeName: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  confidentialityLevel: string | null;
  aiSummary: string | null;
  contentText: string | null;
  question: string;
  chunkContext?: string | null;
}): string {
  const parts: string[] = [];

  parts.push(`DOCUMENT REFERENCE: ${params.documentNo}`);
  parts.push(`TITLE: ${params.title}`);
  if (params.typeName) parts.push(`TYPE: ${params.typeName}`);
  if (params.issueDate) parts.push(`ISSUE DATE: ${params.issueDate}`);
  if (params.expiryDate) parts.push(`EXPIRY DATE: ${params.expiryDate}`);
  if (params.confidentialityLevel) parts.push(`CONFIDENTIALITY: ${params.confidentialityLevel}`);

  if (params.aiSummary) {
    parts.push(`\nAI SUMMARY:\n${params.aiSummary.substring(0, QA_SUMMARY_MAX_CHARS)}`);
  }

  // Use chunk context if available (chunk-grounded path); otherwise use full content_text
  if (params.chunkContext) {
    parts.push(`\nRELEVANT DOCUMENT SECTIONS (retrieved by semantic similarity):\n${params.chunkContext}`);
  } else if (params.contentText) {
    const capped = params.contentText.substring(0, QA_CONTENT_MAX_CHARS);
    const wasCapped = params.contentText.length > QA_CONTENT_MAX_CHARS;
    parts.push(
      `\nEXTRACTED DOCUMENT CONTENT:\n${capped}${wasCapped ? "\n[... content truncated ...]" : ""}`
    );
  }

  parts.push(`\nQUESTION: ${params.question}`);

  return parts.join("\n");
}

// ── askDmsDocumentQuestion ─────────────────────────────────────────────────────

export async function askDmsDocumentQuestion(
  documentId: number,
  question: string
): Promise<ActionResult<DmsDocumentQuestionAnswer>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "dms.documents.view")) {
    return { success: false, error: "Permission denied." };
  }

  const docIdParsed = z.number().int().positive().safeParse(documentId);
  if (!docIdParsed.success) {
    return { success: false, error: "Invalid document ID." };
  }

  if (!question || question.trim().length < 3) {
    return { success: false, error: "Please enter a question." };
  }

  if (question.trim().length > 500) {
    return { success: false, error: "Question must be 500 characters or less." };
  }

  const enabled = await isDmsDocumentQaEnabled();
  if (!enabled) {
    return { success: false, error: "Document Q&A feature is currently disabled." };
  }

  const isAdmin = isAdminUser(ctx);

  try {
    const supabase = await createClient();

    // Load document metadata
    const { data: doc, error: docError } = await supabase
      .from("dms_documents")
      .select(
        `id, document_no, title, issue_date, expiry_date, confidentiality_level,
         ai_summary, dms_document_types!left(name_en)`
      )
      .eq("id", documentId)
      .is("deleted_at", null)
      .single();

    if (docError || !doc) {
      return { success: false, error: "Document not found." };
    }

    const docRow = doc as unknown as {
      id: number;
      document_no: string;
      title: string;
      issue_date: string | null;
      expiry_date: string | null;
      confidentiality_level: string | null;
      ai_summary: string | null;
      dms_document_types: { name_en: string } | null;
    };

    // Confidentiality gate
    const isConfidential = CONFIDENTIAL_ADMIN_REQUIRED.includes(
      (docRow.confidentiality_level ?? "") as (typeof CONFIDENTIAL_ADMIN_REQUIRED)[number]
    );
    if (isConfidential && !isAdmin) {
      return {
        success: false,
        error: "Ask AI is restricted for this document type. Contact a DMS administrator.",
      };
    }

    // Load content_text
    const { data: contentRow } = await supabase
      .from("dms_document_content")
      .select("content_text")
      .eq("document_id", documentId)
      .single();

    const contentText =
      (contentRow as { content_text?: string | null } | null)?.content_text ?? null;

    // ── Phase 11: Attempt chunk-grounded Q&A ────────────────────────────────
    let chunkContext: string | null = null;
    let chunkCitations: Array<{ chunkIndex: number; snippet: string }> | undefined;
    const useChunks = await isChunkSearchEnabled();

    if (useChunks) {
      try {
        const { provider: embeddingProvider } = await getDmsEmbeddingProvider();
        if (embeddingProvider.isConfigured()) {
          const embResult = await embeddingProvider.embedText(question.trim());
          if (embResult.embedding && embResult.embedding.length === 1536) {
            const vectorLiteral = toVectorLiteral(embResult.embedding);

            // Retrieve top-K chunks for this specific document using direct query
            // We query chunks directly (not via the RPC) so we can filter by document_id
            const { data: chunkRows } = await supabase
              .from("dms_document_content_chunks")
              .select("chunk_index, chunk_text, embedding")
              .eq("document_id", documentId)
              .eq("is_active", true)
              .eq("embedding_status", "complete")
              .is("deleted_at", null)
              .not("embedding", "is", null)
              .limit(QA_CHUNK_TOP_K * 4);

            if (chunkRows && (chunkRows as unknown[]).length > 0) {
              type ChunkRow = { chunk_index: number; chunk_text: string; embedding: number[] | null };
              const rows = chunkRows as ChunkRow[];

              // Compute cosine similarity locally for the per-document ranking
              // (the search_dms_document_chunks_by_embedding RPC does cross-document search)
              void vectorLiteral; // vectorLiteral used for future direct RPC call
              const scored = rows.map((r) => {
                const chunkEmbedding = parseEmbeddingVector(r.embedding);
                if (!chunkEmbedding) return { ...r, sim: 0 };
                // Cosine similarity via dot product (vectors are already unit-normalized by text-embedding-3-small)
                const dot = embResult.embedding.reduce(
                  (sum, v, i) => sum + v * (chunkEmbedding[i] ?? 0),
                  0
                );
                return { ...r, sim: dot };
              });

              const topChunks = scored
                .filter((r) => r.sim >= QA_CHUNK_SIMILARITY_THRESHOLD)
                .sort((a, b) => b.sim - a.sim)
                .slice(0, QA_CHUNK_TOP_K);

              if (topChunks.length > 0) {
                // Build grounding context from top chunks (internally only)
                chunkContext = topChunks
                  .map((c, i) => `[Section ${i + 1}]\n${c.chunk_text}`)
                  .join("\n\n---\n\n");
                // Return only short snippets to caller — never full chunk text
                chunkCitations = topChunks.map((c) => ({
                  chunkIndex: c.chunk_index,
                  snippet:    c.chunk_text.slice(0, 200),
                }));
              }
            }
          }
        }
      } catch {
        // Chunk retrieval failed — fall through to raw text path
        chunkContext = null;
        chunkCitations = undefined;
      }
    }

    const { provider, configId } = await getDmsAiProvider();
    if (!provider.isConfigured()) {
      return { success: false, error: "AI provider is not configured." };
    }

    const userMessage = buildQaUserMessage({
      documentNo: docRow.document_no,
      title: docRow.title,
      typeName: docRow.dms_document_types?.name_en ?? null,
      issueDate: docRow.issue_date,
      expiryDate: docRow.expiry_date,
      confidentialityLevel: docRow.confidentiality_level,
      aiSummary: docRow.ai_summary,
      contentText: chunkContext ? null : contentText, // skip raw text when chunks used
      question: question.trim(),
      chunkContext,
    });

    const startMs = Date.now();
    const result = await provider.callStructuredCompletion(
      buildQaSystemPrompt(),
      userMessage,
      { maxTokens: 400, temperature: 0.0 }
    );
    const durationMs = Date.now() - startMs;

    const parsed = JSON.parse(result.rawJson) as unknown;
    const validated = QaResponseSchema.safeParse(parsed);
    if (!validated.success) {
      return { success: false, error: "AI returned an unexpected response format." };
    }

    // Log usage — no question text, no answer, no content
    void logDmsAiUsage({
      providerConfigId: configId ?? null,
      featureArea: "DMS_DOCUMENT_QA",
      operationType: "document_question_answer",
      modelId: result.model,
      status: "success",
      inputTokenCount: result.promptTokens ?? null,
      outputTokenCount: result.completionTokens ?? null,
      durationMs,
      documentId,
      createdBy: ctx.profile?.id ?? null,
      metadata: {
        input_char_count: question.length,
        output_char_count: result.rawJson.length,
        prompt_version: QA_PROMPT_VERSION,
        source_used: chunkContext ? "chunk_text" : "content_text",
        used_chunks: !!chunkContext,
      },
    });

    await logAudit({
      module_code: "DMS",
      action: "dms_document_question_asked",
      
      entity_name: "dms_documents",
      entity_id: documentId,
      entity_reference: docRow.document_no,
      new_values: {
        question_char_count: question.length,
        source_used: validated.data.sourceUsed,
        confidence: validated.data.confidence,
      },
    });

    return {
      success: true,
      data: {
        ...validated.data,
        ...(chunkCitations ? { chunkCitations } : {}),
        sourceUsed: chunkContext ? "chunk_text" : validated.data.sourceUsed,
      } satisfies DmsDocumentQuestionAnswer,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Document Q&A failed.",
    };
  }
}
