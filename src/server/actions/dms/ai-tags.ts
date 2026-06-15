"use server";

/**
 * DMS 12.4 — AI Tag Suggestions Server Actions
 *
 * Suggests DMS tags for a document using AI + existing tag list.
 * Suggestions are stored as pending in dms_ai_tag_suggestions.
 * Humans must explicitly accept or reject each suggestion.
 *
 * Hard rules:
 *  - Tags are NEVER auto-applied.
 *  - Prompts, content text, and raw AI responses are NEVER logged.
 *  - DMS_AUTO_TAGS feature flag must be enabled.
 *  - Duplicate pending suggestions for the same document+tag are prevented.
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

export type DmsTagSuggestionRow = {
  id: number;
  documentId: number;
  tagId: number | null;
  suggestedTagName: string | null;
  confidence: number | null;
  reason: string | null;
  status: "pending" | "accepted" | "rejected" | "superseded";
  createdAt: string;
  reviewedAt: string | null;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const TAG_CONTENT_MAX_CHARS = 2_000;
const TAG_PROMPT_VERSION = "v1.0";
const MAX_TAG_SUGGESTIONS = 5;

// ── Feature flag ──────────────────────────────────────────────────────────────

async function isDmsAutoTagsEnabled(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("erp_ai_feature_flags")
      .select("is_enabled")
      .eq("feature_code", "DMS_AUTO_TAGS")
      .single();
    return (data as { is_enabled?: boolean } | null)?.is_enabled ?? false;
  } catch {
    return false;
  }
}

// ── Permission helpers ─────────────────────────────────────────────────────────

function canEditDoc(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return (
    hasPermission(ctx, "dms.documents.edit") ||
    hasPermission(ctx, "dms.admin") ||
    ctx.roleCodes.includes("system_admin")
  );
}

// ── Zod schema for AI tag suggestions ─────────────────────────────────────────

const TagSuggestionsSchema = z.object({
  suggestions: z
    .array(
      z.object({
        tagId: z.number().nullable(),
        tagName: z.string(),
        confidence: z.number().min(0).max(1),
        reason: z.string(),
      })
    )
    .max(MAX_TAG_SUGGESTIONS),
});

// ── Tag suggestion prompt ──────────────────────────────────────────────────────

function buildTagSystemPrompt(availableTags: { id: number; tag_name: string }[]): string {
  const tagList = availableTags
    .map((t) => `  - ID ${t.id}: ${t.tag_name}`)
    .join("\n");

  return `You are a document tag suggestion assistant for the Alliance Gulf ERP Document Management System (UAE).

AVAILABLE TAGS:
${tagList}

TASK: Suggest up to ${MAX_TAG_SUGGESTIONS} relevant tags for the document described below.

RULES:
- Prefer existing tags (use their exact ID and name).
- If a relevant tag does not exist in the list, return tagId: null and suggest a new tag name.
- Confidence must be between 0.0 and 1.0.
- Only suggest tags that clearly apply to this document.
- Do NOT suggest more than ${MAX_TAG_SUGGESTIONS} tags.
- Return ONLY a JSON object with a "suggestions" array.
- No markdown. No explanation. JSON only.

Each suggestion has: tagId (number or null), tagName (string), confidence (0.0-1.0), reason (string).`;
}

function buildTagUserMessage(params: {
  documentNo: string;
  title: string;
  typeName: string | null;
  categoryName: string | null;
  aiSummary: string | null;
  contentSnippet: string | null;
  existingTagNames: string[];
}): string {
  const parts: string[] = [];
  parts.push(`DOCUMENT: ${params.documentNo} — ${params.title}`);
  if (params.typeName) parts.push(`TYPE: ${params.typeName}`);
  if (params.categoryName) parts.push(`CATEGORY: ${params.categoryName}`);
  if (params.existingTagNames.length > 0) {
    parts.push(`EXISTING TAGS: ${params.existingTagNames.join(", ")}`);
  }
  if (params.aiSummary) parts.push(`SUMMARY: ${params.aiSummary.substring(0, 600)}`);
  if (params.contentSnippet) parts.push(`CONTENT SNIPPET: ${params.contentSnippet}`);
  return parts.join("\n");
}

// ── suggestDmsDocumentTags ─────────────────────────────────────────────────────

export async function suggestDmsDocumentTags(
  documentId: number
): Promise<ActionResult<DmsTagSuggestionRow[]>> {
  const ctx = await getAuthContext();
  if (!canEditDoc(ctx)) {
    return { success: false, error: "Permission denied. Requires dms.documents.edit or dms.admin." };
  }

  const docIdParsed = z.number().int().positive().safeParse(documentId);
  if (!docIdParsed.success) {
    return { success: false, error: "Invalid document ID." };
  }

  const enabled = await isDmsAutoTagsEnabled();
  if (!enabled) {
    return { success: false, error: "AI Tag Suggestions feature is currently disabled." };
  }

  const { provider } = await getDmsAiProvider();
  if (!provider.isConfigured()) {
    return { success: false, error: "AI provider is not configured." };
  }

  try {
    const supabase = await createClient();

    // Load document
    const { data: doc, error: docError } = await supabase
      .from("dms_documents")
      .select(
        `id, document_no, title, ai_summary,
         dms_document_types!left(name_en),
         dms_document_categories!left(name_en)`
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
      ai_summary: string | null;
      dms_document_types: { name_en: string } | null;
      dms_document_categories: { name_en: string } | null;
    };

    // Load existing tags on this document
    const { data: existingDocTags } = await supabase
      .from("dms_document_tags")
      .select("tag_id, dms_tags!inner(tag_name)")
      .eq("document_id", documentId);

    const existingTagNames = (existingDocTags ?? []).map(
      (t) => ((t as { dms_tags?: { tag_name?: string } | null }).dms_tags?.tag_name) ?? ""
    ).filter(Boolean);

    const existingTagIds = new Set(
      (existingDocTags ?? []).map((t) => (t as { tag_id: number }).tag_id)
    );

    // Load all available active tags
    const { data: allTags } = await supabase
      .from("dms_tags")
      .select("id, tag_name")
      .eq("is_active", true)
      .is("deleted_at", null)
      .limit(100);

    const availableTags = (allTags ?? []) as { id: number; tag_name: string }[];

    // Load a snippet of content_text
    const { data: contentRow } = await supabase
      .from("dms_document_content")
      .select("content_text")
      .eq("document_id", documentId)
      .single();

    const rawContent =
      (contentRow as { content_text?: string | null } | null)?.content_text ?? null;
    const contentSnippet = rawContent
      ? rawContent.substring(0, TAG_CONTENT_MAX_CHARS)
      : null;

    // Call AI
    const result = await provider.callStructuredCompletion(
      buildTagSystemPrompt(availableTags),
      buildTagUserMessage({
        documentNo: docRow.document_no,
        title: docRow.title,
        typeName: docRow.dms_document_types?.name_en ?? null,
        categoryName: docRow.dms_document_categories?.name_en ?? null,
        aiSummary: docRow.ai_summary,
        contentSnippet,
        existingTagNames,
      }),
      { maxTokens: 500, temperature: 0.1 }
    );

    const parsed = JSON.parse(result.rawJson) as unknown;
    const validated = TagSuggestionsSchema.safeParse(parsed);
    if (!validated.success) {
      return { success: false, error: "AI returned unexpected tag suggestion format." };
    }

    // Mark existing pending suggestions as superseded
    await supabase
      .from("dms_ai_tag_suggestions")
      .update({ status: "superseded", updated_at: new Date().toISOString() })
      .eq("document_id", documentId)
      .eq("status", "pending");

    // Insert new suggestions (skip tags already applied)
    const userId = (ctx.profile?.id as number | undefined) ?? null;
    const toInsert = validated.data.suggestions
      .filter((s) => !existingTagIds.has(s.tagId ?? -1))
      .map((s) => ({
        document_id: documentId,
        tag_id: s.tagId,
        suggested_tag_name: s.tagName,
        confidence: s.confidence,
        reason: s.reason,
        status: "pending" as const,
        suggested_by_user_id: userId,
      }));

    if (toInsert.length === 0) {
      return { success: true, data: [] };
    }

    const { data: inserted, error: insertError } = await supabase
      .from("dms_ai_tag_suggestions")
      .insert(toInsert)
      .select("id, document_id, tag_id, suggested_tag_name, confidence, reason, status, created_at, reviewed_at");

    if (insertError) {
      return { success: false, error: "Failed to save tag suggestions." };
    }

    // Log AI usage
    await supabase.from("erp_ai_usage_logs").insert({
      feature_area: "DMS_AUTO_TAGS",
      operation_type: "tag_suggestion",
      document_id: documentId,
      provider_code: provider.providerCode,
      model_id: provider.modelId,
      input_char_count: docRow.title.length + (docRow.ai_summary?.length ?? 0),
      output_char_count: result.rawJson.length,
      prompt_tokens: result.promptTokens ?? null,
      completion_tokens: result.completionTokens ?? null,
      status: "success",
      prompt_version: TAG_PROMPT_VERSION,
      result_count: toInsert.length,
    });

    await logAudit({
      module_code: "DMS",
      action: "dms_tag_suggestions_generated",
      
      entity_name: "dms_ai_tag_suggestions",
      entity_id: documentId,
      entity_reference: docRow.document_no,
      new_values: { suggestion_count: toInsert.length },
    });

    const rows: DmsTagSuggestionRow[] = (inserted ?? []).map((r) => ({
      id: (r as { id: number }).id,
      documentId: (r as { document_id: number }).document_id,
      tagId: (r as { tag_id: number | null }).tag_id,
      suggestedTagName: (r as { suggested_tag_name: string | null }).suggested_tag_name,
      confidence: (r as { confidence: number | null }).confidence,
      reason: (r as { reason: string | null }).reason,
      status: (r as { status: string }).status as DmsTagSuggestionRow["status"],
      createdAt: (r as { created_at: string }).created_at,
      reviewedAt: (r as { reviewed_at: string | null }).reviewed_at,
    }));

    return { success: true, data: rows };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Tag suggestion failed.",
    };
  }
}

// ── getDmsTagSuggestions ───────────────────────────────────────────────────────

export async function getDmsTagSuggestions(
  documentId: number
): Promise<ActionResult<DmsTagSuggestionRow[]>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "dms.documents.view")) {
    return { success: false, error: "Permission denied." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("dms_ai_tag_suggestions")
      .select("id, document_id, tag_id, suggested_tag_name, confidence, reason, status, created_at, reviewed_at")
      .eq("document_id", documentId)
      .in("status", ["pending", "accepted", "rejected"])
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) return { success: false, error: "Failed to load tag suggestions." };

    const rows: DmsTagSuggestionRow[] = (data ?? []).map((r) => ({
      id: (r as { id: number }).id,
      documentId: (r as { document_id: number }).document_id,
      tagId: (r as { tag_id: number | null }).tag_id,
      suggestedTagName: (r as { suggested_tag_name: string | null }).suggested_tag_name,
      confidence: (r as { confidence: number | null }).confidence,
      reason: (r as { reason: string | null }).reason,
      status: (r as { status: string }).status as DmsTagSuggestionRow["status"],
      createdAt: (r as { created_at: string }).created_at,
      reviewedAt: (r as { reviewed_at: string | null }).reviewed_at,
    }));

    return { success: true, data: rows };
  } catch {
    return { success: false, error: "Failed to load tag suggestions." };
  }
}

// ── applyDmsTagSuggestions ─────────────────────────────────────────────────────

export async function applyDmsTagSuggestions(
  documentId: number,
  suggestionIds: number[]
): Promise<ActionResult<{ appliedCount: number }>> {
  const ctx = await getAuthContext();
  if (!canEditDoc(ctx)) {
    return { success: false, error: "Permission denied." };
  }

  const parsed = z
    .object({
      documentId: z.number().int().positive(),
      suggestionIds: z.array(z.number().int().positive()).min(1).max(20),
    })
    .safeParse({ documentId, suggestionIds });

  if (!parsed.success) {
    return { success: false, error: "Invalid input." };
  }

  try {
    const supabase = await createClient();

    // Load suggestions to apply
    const { data: suggestions, error: loadError } = await supabase
      .from("dms_ai_tag_suggestions")
      .select("id, tag_id, suggested_tag_name")
      .eq("document_id", documentId)
      .in("id", suggestionIds)
      .eq("status", "pending")
      .is("deleted_at", null);

    if (loadError || !suggestions?.length) {
      return { success: false, error: "No pending suggestions found." };
    }

    // Load existing document tag IDs to prevent duplicates
    const { data: existingTags } = await supabase
      .from("dms_document_tags")
      .select("tag_id")
      .eq("document_id", documentId);

    const existingTagIds = new Set(
      (existingTags ?? []).map((t) => (t as { tag_id: number }).tag_id)
    );

    const userId = (ctx.profile?.id as number | undefined) ?? null;
    const now = new Date().toISOString();
    let appliedCount = 0;

    for (const sugg of suggestions as { id: number; tag_id: number | null; suggested_tag_name: string | null }[]) {
      if (!sugg.tag_id) continue; // Cannot apply suggestion without a resolved tag ID
      if (existingTagIds.has(sugg.tag_id)) {
        // Mark as accepted even if already present
        await supabase
          .from("dms_ai_tag_suggestions")
          .update({ status: "accepted", reviewed_by: userId, reviewed_at: now, updated_at: now })
          .eq("id", sugg.id);
        continue;
      }

      // Insert into dms_document_tags
      const { error: tagError } = await supabase
        .from("dms_document_tags")
        .insert({ document_id: documentId, tag_id: sugg.tag_id, created_by: userId });

      if (!tagError) {
        existingTagIds.add(sugg.tag_id);
        appliedCount++;
        await supabase
          .from("dms_ai_tag_suggestions")
          .update({ status: "accepted", reviewed_by: userId, reviewed_at: now, updated_at: now })
          .eq("id", sugg.id);
      }
    }

    await logAudit({
      module_code: "DMS",
      action: "dms_tag_suggestions_applied",
      
      entity_name: "dms_ai_tag_suggestions",
      entity_id: documentId,
      entity_reference: String(documentId),
      new_values: { applied_count: appliedCount, suggestion_ids: suggestionIds },
    });

    revalidatePath(`/dms/documents/${documentId}`);

    return { success: true, data: { appliedCount } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to apply tag suggestions.",
    };
  }
}

// ── rejectDmsTagSuggestions ────────────────────────────────────────────────────

export async function rejectDmsTagSuggestions(
  documentId: number,
  suggestionIds: number[]
): Promise<ActionResult<{ rejectedCount: number }>> {
  const ctx = await getAuthContext();
  if (!canEditDoc(ctx)) {
    return { success: false, error: "Permission denied." };
  }

  const parsed = z
    .object({
      documentId: z.number().int().positive(),
      suggestionIds: z.array(z.number().int().positive()).min(1).max(20),
    })
    .safeParse({ documentId, suggestionIds });

  if (!parsed.success) {
    return { success: false, error: "Invalid input." };
  }

  try {
    const supabase = await createClient();
    const userId = (ctx.profile?.id as number | undefined) ?? null;
    const now = new Date().toISOString();

    const { error } = await supabase
      .from("dms_ai_tag_suggestions")
      .update({ status: "rejected", reviewed_by: userId, reviewed_at: now, updated_at: now })
      .eq("document_id", documentId)
      .in("id", suggestionIds)
      .eq("status", "pending");

    if (error) {
      return { success: false, error: "Failed to reject tag suggestions." };
    }

    await logAudit({
      module_code: "DMS",
      action: "dms_tag_suggestions_rejected",
      
      entity_name: "dms_ai_tag_suggestions",
      entity_id: documentId,
      entity_reference: String(documentId),
      new_values: { suggestion_ids: suggestionIds },
    });

    return { success: true, data: { rejectedCount: suggestionIds.length } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to reject tag suggestions.",
    };
  }
}
