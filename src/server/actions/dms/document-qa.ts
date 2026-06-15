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
import { getDmsAiProvider } from "@/lib/dms/ai/factory";
import type { DmsDocumentQuestionAnswer } from "@/lib/dms/ai/types";

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
const QA_PROMPT_VERSION = "v1.0";

// ── Feature flag ──────────────────────────────────────────────────────────────

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
  sourceUsed: z.enum(["content_text", "ai_summary", "metadata", "not_found"]),
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

  if (params.contentText) {
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

    const { provider } = await getDmsAiProvider();
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
      contentText,
      question: question.trim(),
    });

    const result = await provider.callStructuredCompletion(
      buildQaSystemPrompt(),
      userMessage,
      { maxTokens: 400, temperature: 0.0 }
    );

    const parsed = JSON.parse(result.rawJson) as unknown;
    const validated = QaResponseSchema.safeParse(parsed);
    if (!validated.success) {
      return { success: false, error: "AI returned an unexpected response format." };
    }

    // Log usage — no question text, no answer, no content
    await supabase.from("erp_ai_usage_logs").insert({
      feature_area: "DMS_DOCUMENT_QA",
      operation_type: "document_question_answer",
      document_id: documentId,
      provider_code: provider.providerCode,
      model_id: provider.modelId,
      input_char_count: question.length,
      output_char_count: result.rawJson.length,
      prompt_tokens: result.promptTokens ?? null,
      completion_tokens: result.completionTokens ?? null,
      status: "success",
      prompt_version: QA_PROMPT_VERSION,
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

    return { success: true, data: validated.data };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Document Q&A failed.",
    };
  }
}
