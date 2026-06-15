"use server";

/**
 * DMS 12.2 — AI Document Summary Server Actions
 *
 * Generates, stores, and bulk-backfills AI summaries for DMS documents.
 *
 * Hard rules:
 *  - content_text, prompts, OCR text, full AI responses are NEVER logged.
 *  - Summary generation/regeneration for hr/legal/executive requires dms.admin.
 *  - DMS_AI_SUMMARY feature flag must be enabled.
 *  - AI summaries are stored on dms_documents.ai_summary.
 *  - content_tsv auto-updates via the DB trigger on ai_summary change.
 *  - Never use createAdminClient() for user-facing reads.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import { getDmsAiProvider } from "@/lib/dms/ai/factory";
import { revalidatePath } from "next/cache";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type AiSummaryStatus = "not_required" | "pending" | "complete" | "failed" | "skipped";

export type DocumentAiSummaryRow = {
  documentId: number;
  aiSummary: string | null;
  aiSummaryStatus: AiSummaryStatus | null;
  aiSummaryUpdatedAt: string | null;
  aiSummaryModel: string | null;
  aiSummaryError: string | null;
  aiSummaryInputCharCount: number | null;
  aiSummaryInputTruncated: boolean;
};

const CONFIDENTIAL_ADMIN_REQUIRED = ["hr", "legal", "executive"];
const SUMMARY_INPUT_MAX_CHARS = 20_000;
const SUMMARY_PROMPT_VERSION = "v1.0";

// ── Permission helpers ────────────────────────────────────────────────────────

function canRunAi(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return (
    hasPermission(ctx, "dms.documents.ai.run") ||
    hasPermission(ctx, "dms.admin") ||
    ctx.roleCodes.includes("system_admin")
  );
}

function isAdminUser(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return (
    hasPermission(ctx, "dms.admin") ||
    ctx.roleCodes.includes("system_admin")
  );
}

// ── Feature flag helper ───────────────────────────────────────────────────────

async function isDmsAiSummaryEnabled(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("erp_ai_feature_flags")
      .select("is_enabled")
      .eq("feature_code", "DMS_AI_SUMMARY")
      .single();
    return (data as { is_enabled?: boolean } | null)?.is_enabled ?? false;
  } catch {
    return false;
  }
}

// ── Build summary prompt ──────────────────────────────────────────────────────

function buildSummarySystemPrompt(): string {
  return `You are a document summarisation assistant for the Alliance Gulf ERP system.
The ERP operates in the United Arab Emirates and manages documents for logistics, transport, offshore/onshore work, HR, contracts, insurance, scrap, demolition, government compliance, and fleet/workshop operations.

Summarise the document in exactly 3 to 5 sentences in plain English.
Include only facts visible in the provided document text.

Include where available:
- document type and business purpose;
- primary person, company, equipment, vehicle, project, or authority;
- important dates such as issue date and expiry date;
- key outcome or result, such as fit for offshore duty, approved, rejected, valid, expired, certificate issued, contract value, or licence validity;
- critical warnings, such as expired document, missing signature, unclear date, low scan quality, conflicting information, or missing required information.

Rules:
- Plain text only.
- No markdown.
- No bullet points.
- No JSON.
- Do not invent or guess.
- If a field is not visible, omit it.
- Do not include unnecessary personal medical details, salary details, or sensitive private details.
- For medical or HR documents, summarise only business-relevant status such as fitness result and validity; do not include diagnosis or personal health details.
- Keep the summary concise and professional.`;
}

function buildSummaryUserMessage(params: {
  documentNo: string;
  title: string;
  typeName: string | null;
  categoryName: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  contentText: string;
}): string {
  const lines: string[] = [];
  lines.push(`Document No: ${params.documentNo}`);
  lines.push(`Title: ${params.title}`);
  if (params.typeName) lines.push(`Document Type: ${params.typeName}`);
  if (params.categoryName) lines.push(`Category: ${params.categoryName}`);
  if (params.issueDate) lines.push(`Issue Date: ${params.issueDate}`);
  if (params.expiryDate) lines.push(`Expiry Date: ${params.expiryDate}`);
  lines.push("");
  lines.push("Extracted Text:");
  lines.push(params.contentText);
  return lines.join("\n");
}

// ── Internal shared core ──────────────────────────────────────────────────────

async function runSummaryForDocument(params: {
  documentId: number;
  ctx: Awaited<ReturnType<typeof getAuthContext>>;
  forceRegenerate: boolean;
  calledFromBulk: boolean;
}): Promise<{
  success: boolean;
  charCount?: number;
  outputCharCount?: number;
  model?: string | null;
  error?: string;
  skipped?: boolean;
}> {
  const { documentId, ctx, forceRegenerate } = params;
  const supabase = await createClient();
  const userId = ctx.profile!.id as number;

  // 1. Load document
  const { data: doc, error: docErr } = await supabase
    .from("dms_documents")
    .select(`
      id, document_no, title, issue_date, expiry_date, confidentiality_level, ai_summary_status,
      document_type:dms_document_types(type_code, name_en),
      category:dms_document_categories(category_code, name_en)
    `)
    .eq("id", documentId)
    .is("deleted_at", null)
    .single();

  if (docErr || !doc) {
    return { success: false, error: docErr?.message ?? "Document not found" };
  }

  const typedDoc = doc as Record<string, unknown>;
  const confidentiality = (typedDoc.confidentiality_level as string) ?? "internal";
  const docType = typedDoc.document_type as { name_en?: string } | null;
  const category = typedDoc.category as { name_en?: string } | null;
  const currentStatus = (typedDoc.ai_summary_status as string | null) ?? "pending";

  // 2. Confidentiality gate
  if (CONFIDENTIAL_ADMIN_REQUIRED.includes(confidentiality) && !isAdminUser(ctx)) {
    return { success: false, error: "Summary generation for HR, legal, or executive documents requires administrator access." };
  }

  // 3. Skip if already complete and not forced
  if (!forceRegenerate && currentStatus === "complete") {
    if (params.calledFromBulk) return { success: true, skipped: true };
    return { success: false, error: "Summary already exists. Use regenerate to overwrite." };
  }

  // 4. Load content text
  const { data: contentRow, error: contentErr } = await supabase
    .from("dms_document_content")
    .select("content_text, content_text_char_count")
    .eq("document_id", documentId)
    .single();

  if (contentErr && contentErr.code !== "PGRST116") {
    return { success: false, error: "Failed to load document content: " + contentErr.message };
  }

  const fullContentText = (contentRow as Record<string, unknown> | null)?.content_text as string | null;

  if (!fullContentText || fullContentText.trim().length === 0) {
    // Mark as skipped if called from bulk
    if (params.calledFromBulk) {
      await supabase
        .from("dms_documents")
        .update({ ai_summary_status: "skipped", updated_at: new Date().toISOString() })
        .eq("id", documentId);
      return { success: true, skipped: true };
    }
    return { success: false, error: "No extracted text available. Run OCR or AI intake first, then return here to generate a summary." };
  }

  // 5. Cap input at 20,000 characters
  const isTruncated = fullContentText.length > SUMMARY_INPUT_MAX_CHARS;
  const inputText = isTruncated ? fullContentText.slice(0, SUMMARY_INPUT_MAX_CHARS) : fullContentText;
  const inputCharCount = inputText.length;

  // 6. Get AI provider
  const { provider, configId } = await getDmsAiProvider();
  if (!provider.isConfigured()) {
    return { success: false, error: "AI provider is not configured. Please configure an AI provider in Administration → Settings → AI Settings." };
  }

  // 7. Build prompts (never log these)
  const systemPrompt = buildSummarySystemPrompt();
  const userMessage = buildSummaryUserMessage({
    documentNo: typedDoc.document_no as string,
    title: typedDoc.title as string,
    typeName: docType?.name_en ?? null,
    categoryName: category?.name_en ?? null,
    issueDate: (typedDoc.issue_date as string | null) ?? null,
    expiryDate: (typedDoc.expiry_date as string | null) ?? null,
    contentText: inputText,
  });

  const startMs = Date.now();
  let summaryResult: { summary: string; model: string | null; promptTokens?: number; completionTokens?: number } | null = null;
  let summaryError: string | null = null;

  // 8. Call AI
  try {
    summaryResult = await provider.summarize(systemPrompt, userMessage);
    if (!summaryResult.summary || summaryResult.summary.trim().length === 0) {
      throw new Error("AI returned an empty summary.");
    }
  } catch (aiErr) {
    summaryError = String(aiErr);
  }

  const durationMs = Date.now() - startMs;
  const now = new Date().toISOString();

  // 9. Save result
  if (summaryResult) {
    const { error: updateErr } = await supabase
      .from("dms_documents")
      .update({
        ai_summary: summaryResult.summary.trim(),
        ai_summary_status: "complete",
        ai_summary_updated_at: now,
        ai_summary_model: summaryResult.model ?? provider.providerCode,
        ai_summary_error: null,
        ai_summary_input_char_count: inputCharCount,
        ai_summary_input_truncated: isTruncated,
        updated_at: now,
      })
      .eq("id", documentId);

    if (updateErr) {
      return { success: false, error: "Failed to save summary: " + updateErr.message };
    }
  } else {
    await supabase
      .from("dms_documents")
      .update({
        ai_summary_status: "failed",
        ai_summary_error: summaryError?.substring(0, 500) ?? "Unknown error",
        ai_summary_updated_at: now,
        updated_at: now,
      })
      .eq("id", documentId);
  }

  // 10. Log to erp_ai_usage_logs (safe metadata only)
  await supabase.from("erp_ai_usage_logs").insert({
    provider_config_id: configId,
    feature_area: "DMS_AI_SUMMARY",
    operation_type: forceRegenerate ? "summary_regenerate" : "summary_generate",
    model_id: summaryResult?.model ?? provider.modelId,
    status: summaryResult ? "complete" : "failed",
    input_token_count: summaryResult?.promptTokens ?? null,
    output_token_count: summaryResult?.completionTokens ?? null,
    duration_ms: durationMs,
    error_message: summaryError?.substring(0, 300) ?? null,
    metadata_json: {
      document_id: documentId,
      prompt_version: SUMMARY_PROMPT_VERSION,
      input_char_count: inputCharCount,
      input_truncated: isTruncated,
      output_char_count: summaryResult ? summaryResult.summary.trim().length : 0,
    },
    created_by: userId,
    created_at: now,
  });

  // 11. Audit log (safe metadata only — never log content)
  await logAudit({
    module_code: "DMS",
    entity_name: "dms_documents",
    entity_id: documentId,
    entity_reference: typedDoc.document_no as string,
    action: "update",
    new_values: {
      action: summaryResult ? (forceRegenerate ? "ai_summary_regenerated" : "ai_summary_generated") : "ai_summary_failed",
      document_id: documentId,
      provider: provider.providerCode,
      model: summaryResult?.model ?? null,
      status: summaryResult ? "complete" : "failed",
      input_char_count: inputCharCount,
      output_char_count: summaryResult ? summaryResult.summary.trim().length : 0,
      duration_ms: durationMs,
    },
  });

  if (!summaryResult) {
    return { success: false, error: `AI summary generation failed: ${summaryError}` };
  }

  return {
    success: true,
    charCount: inputCharCount,
    outputCharCount: summaryResult.summary.trim().length,
    model: summaryResult.model,
  };
}

// ── getDmsAiSummaryStatus ────────────────────────────────────────────────────
// Lightweight action to load just summary fields for the UI card.

export async function getDmsAiSummaryStatus(
  documentId: number
): Promise<ActionResult<DocumentAiSummaryRow>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx, "dms.documents.view") && !isAdminUser(ctx)) {
      return { success: false, error: "Permission denied" };
    }

    const { data, error } = await supabase
      .from("dms_documents")
      .select(`
        id, confidentiality_level,
        ai_summary, ai_summary_status, ai_summary_updated_at,
        ai_summary_model, ai_summary_error,
        ai_summary_input_char_count, ai_summary_input_truncated
      `)
      .eq("id", documentId)
      .is("deleted_at", null)
      .single();

    if (error || !data) return { success: false, error: error?.message ?? "Document not found" };

    const d = data as Record<string, unknown>;

    // Redact summary text for confidential documents if non-admin
    const confidentiality = (d.confidentiality_level as string) ?? "internal";
    const isAdmin = isAdminUser(ctx);
    const summaryText = (d.ai_summary as string | null) ?? null;
    const displaySummary =
      !isAdmin && CONFIDENTIAL_ADMIN_REQUIRED.includes(confidentiality) && summaryText
        ? "[Summary restricted — confidential document]"
        : summaryText;

    return {
      success: true,
      data: {
        documentId,
        aiSummary: displaySummary,
        aiSummaryStatus: (d.ai_summary_status as AiSummaryStatus | null) ?? null,
        aiSummaryUpdatedAt: (d.ai_summary_updated_at as string | null) ?? null,
        aiSummaryModel: (d.ai_summary_model as string | null) ?? null,
        aiSummaryError: (d.ai_summary_error as string | null) ?? null,
        aiSummaryInputCharCount: (d.ai_summary_input_char_count as number | null) ?? null,
        aiSummaryInputTruncated: (d.ai_summary_input_truncated as boolean | null) ?? false,
      },
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── generateAndSaveDmsAiSummary ───────────────────────────────────────────────

export async function generateAndSaveDmsAiSummary(
  documentId: number
): Promise<ActionResult<{ documentId: number; charCount: number; outputCharCount: number; model: string | null }>> {
  try {
    const parsed = z.number().int().positive().safeParse(documentId);
    if (!parsed.success) return { success: false, error: "Invalid document ID" };

    if (!(await isDmsAiSummaryEnabled())) {
      return { success: false, error: "DMS AI Summary feature is not enabled." };
    }

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canRunAi(ctx)) return { success: false, error: "Permission denied" };

    const result = await runSummaryForDocument({
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
      data: {
        documentId,
        charCount: result.charCount ?? 0,
        outputCharCount: result.outputCharCount ?? 0,
        model: result.model ?? null,
      },
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── regenerateDmsAiSummary ────────────────────────────────────────────────────

export async function regenerateDmsAiSummary(
  documentId: number
): Promise<ActionResult<{ documentId: number; charCount: number; outputCharCount: number; model: string | null }>> {
  try {
    const parsed = z.number().int().positive().safeParse(documentId);
    if (!parsed.success) return { success: false, error: "Invalid document ID" };

    if (!(await isDmsAiSummaryEnabled())) {
      return { success: false, error: "DMS AI Summary feature is not enabled." };
    }

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canRunAi(ctx)) return { success: false, error: "Permission denied" };

    const result = await runSummaryForDocument({
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
      data: {
        documentId,
        charCount: result.charCount ?? 0,
        outputCharCount: result.outputCharCount ?? 0,
        model: result.model ?? null,
      },
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── bulkGenerateMissingSummaries ──────────────────────────────────────────────

const BulkSummarySchema = z.object({
  batchSize: z.number().int().min(1).max(50).optional().default(20),
  resumeFromDocumentId: z.number().int().positive().optional(),
  dryRun: z.boolean().optional().default(false),
});

export async function bulkGenerateMissingSummaries(
  input: z.infer<typeof BulkSummarySchema>
): Promise<ActionResult<{
  processed: number;
  skipped: number;
  failed: number;
  errors: Array<{ documentId: number; documentNo?: string; error: string }>;
  nextResumeFromDocumentId: number | null;
}>> {
  try {
    const parsed = BulkSummarySchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

    const { batchSize, resumeFromDocumentId, dryRun } = parsed.data;

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!isAdminUser(ctx)) return { success: false, error: "Permission denied — requires dms.admin" };

    if (!(await isDmsAiSummaryEnabled())) {
      return { success: false, error: "DMS AI Summary feature is not enabled." };
    }

    const supabase = await createClient();

    // Find documents that have content text but are missing / failed summaries
    // Step 1: get IDs from dms_document_content that have real text
    const { data: contentRows, error: contentErr } = await supabase
      .from("dms_document_content")
      .select("document_id")
      .not("content_text", "is", null);

    if (contentErr) return { success: false, error: "Failed to query content: " + contentErr.message };

    const contentDocIds = (contentRows ?? []).map((r) => (r as Record<string, unknown>).document_id as number);

    if (contentDocIds.length === 0) {
      return { success: true, data: { processed: 0, skipped: 0, failed: 0, errors: [], nextResumeFromDocumentId: null } };
    }

    // Step 2: find documents needing summary
    let docsQuery = supabase
      .from("dms_documents")
      .select("id, document_no, ai_summary_status, ai_summary")
      .is("deleted_at", null)
      .in("id", contentDocIds)
      .or("ai_summary.is.null,ai_summary_status.in.(pending,failed,skipped)")
      .order("id", { ascending: true })
      .limit(batchSize + 1);

    if (resumeFromDocumentId) {
      docsQuery = docsQuery.gte("id", resumeFromDocumentId);
    }

    const { data: docRows, error: docsErr } = await docsQuery;
    if (docsErr) return { success: false, error: "Failed to query documents: " + docsErr.message };

    const rows = (docRows ?? []) as Array<{ id: number; document_no: string; ai_summary_status: string | null; ai_summary: string | null }>;
    const hasMore = rows.length > batchSize;
    const batch = hasMore ? rows.slice(0, batchSize) : rows;
    const nextResumeFromDocumentId = hasMore ? rows[batchSize]?.id ?? null : null;

    if (dryRun) {
      return {
        success: true,
        data: {
          processed: 0,
          skipped: 0,
          failed: 0,
          errors: [],
          nextResumeFromDocumentId: hasMore ? nextResumeFromDocumentId : null,
        },
      };
    }

    let processed = 0;
    let skipped = 0;
    let failed = 0;
    const errors: Array<{ documentId: number; documentNo?: string; error: string }> = [];

    for (const row of batch) {
      try {
        const result = await runSummaryForDocument({
          documentId: row.id,
          ctx,
          forceRegenerate: false,
          calledFromBulk: true,
        });

        if (result.skipped) {
          skipped++;
        } else if (result.success) {
          processed++;
        } else {
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
      entity_reference: "BULK_SUMMARY",
      action: "update",
      new_values: {
        action: "ai_summary_bulk_generate",
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
