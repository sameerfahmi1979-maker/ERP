"use server";

/**
 * DMS 12.4 — AI Link Suggestions Server Actions
 *
 * Suggests ERP entity links (starting with parties) for a document using AI.
 * Suggestions are stored as pending in dms_ai_link_suggestions.
 * Humans must explicitly accept or reject each suggestion.
 *
 * Hard rules:
 *  - Links are NEVER auto-applied.
 *  - Prompts, content text, and raw AI responses are NEVER logged.
 *  - DMS_SMART_LINKS feature flag must be enabled.
 *  - AI must not invent entity IDs — only suggests from confirmed DB records.
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

export type DmsLinkSuggestionRow = {
  id: number;
  documentId: number;
  entityType: string;
  entityId: number | null;
  entityName: string | null;
  confidence: number | null;
  reason: string | null;
  status: "pending" | "accepted" | "rejected" | "superseded";
  createdAt: string;
  reviewedAt: string | null;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const LINK_CONTENT_MAX_CHARS = 1_500;
const LINK_PROMPT_VERSION = "v1.1";
const MAX_PARTY_CONTEXT = 30;
const MAX_LINK_SUGGESTIONS = 5;
const NAME_MATCH_FILL_LIMIT = 15; // max name-matched candidates to include first

// ── Feature flag ──────────────────────────────────────────────────────────────

async function isDmsSmartLinksEnabled(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("erp_ai_feature_flags")
      .select("is_enabled")
      .eq("feature_code", "DMS_SMART_LINKS")
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

// ── Zod schema for AI link suggestions ────────────────────────────────────────

const LinkSuggestionsSchema = z.object({
  suggestions: z
    .array(
      z.object({
        entityType: z.string(),
        entityId: z.number().nullable(),
        entityName: z.string().nullable(),
        confidence: z.number().min(0).max(1),
        reason: z.string(),
      })
    )
    .max(MAX_LINK_SUGGESTIONS),
});

// ── Link suggestion prompt ─────────────────────────────────────────────────────

function buildLinkSystemPrompt(
  parties: { id: number; display_name: string; party_code: string }[]
): string {
  const partyList = parties
    .map((p) => `  - ID ${p.id}: ${p.display_name} (code: ${p.party_code})`)
    .join("\n");

  return `You are a document entity-link suggestion assistant for the Alliance Gulf ERP system (UAE). You have expert Arabic reading ability and understand Arabic-English bilingual UAE business documents.

AVAILABLE PARTIES (ERP records you may suggest linking to):
${partyList}

TASK: Suggest up to ${MAX_LINK_SUGGESTIONS} relevant party links for the document described below.

RULES:
- Only suggest parties from the list above — use their exact ID and name.
- Do NOT invent entity IDs or names not in the list.
- If you are not confident a party is linked to this document, do not suggest it.
- Confidence must be between 0.0 and 1.0.
- Only suggest links where there is clear evidence in the document content or summary.
- Return ONLY a JSON object with a "suggestions" array. No markdown. No explanation.

ARABIC MATCHING RULES:
- Match Arabic company names and English names as equivalent (محمد أحمد للتجارة = Mohammed Ahmed Trading).
- Common Arabic transliteration variants are the same person/company (محمد = Mohammad = Mohammed = Muhammad).
- Match partial Arabic names (الخليج = Gulf may match "Alliance Gulf" party).
- If the document has Arabic names not matching English display names exactly, still suggest if semantically equivalent.
- Confidence should be 0.7+ for Arabic name matches that appear phonetically equivalent.

Each suggestion: entityType (always "party"), entityId (number from list), entityName (string), confidence (0.0-1.0), reason (string).`;
}

function buildLinkUserMessage(params: {
  documentNo: string;
  title: string;
  typeName: string | null;
  issueDate: string | null;
  aiSummary: string | null;
  contentSnippet: string | null;
  existingLinks: { entityType: string; entityId: number }[];
}): string {
  const parts: string[] = [];
  parts.push(`DOCUMENT: ${params.documentNo} — ${params.title}`);
  if (params.typeName) parts.push(`TYPE: ${params.typeName}`);
  if (params.issueDate) parts.push(`ISSUE DATE: ${params.issueDate}`);
  if (params.existingLinks.length > 0) {
    parts.push(
      `EXISTING LINKS: ${params.existingLinks.map((l) => `${l.entityType}#${l.entityId}`).join(", ")}`
    );
  }
  if (params.aiSummary) parts.push(`SUMMARY: ${params.aiSummary.substring(0, 600)}`);
  if (params.contentSnippet) parts.push(`CONTENT SNIPPET: ${params.contentSnippet}`);
  return parts.join("\n");
}

// ── suggestDmsDocumentLinks ────────────────────────────────────────────────────

export async function suggestDmsDocumentLinks(
  documentId: number
): Promise<ActionResult<DmsLinkSuggestionRow[]>> {
  const ctx = await getAuthContext();
  if (!canEditDoc(ctx)) {
    return { success: false, error: "Permission denied. Requires dms.documents.edit or dms.admin." };
  }

  const docIdParsed = z.number().int().positive().safeParse(documentId);
  if (!docIdParsed.success) {
    return { success: false, error: "Invalid document ID." };
  }

  const enabled = await isDmsSmartLinksEnabled();
  if (!enabled) {
    return { success: false, error: "AI Smart Links feature is currently disabled." };
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
        `id, document_no, title, issue_date, ai_summary,
         dms_document_types!left(name_en)`
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
      ai_summary: string | null;
      dms_document_types: { name_en: string } | null;
    };

    // Load existing document links
    const { data: existingLinks } = await supabase
      .from("dms_document_links")
      .select("entity_type, entity_id")
      .eq("document_id", documentId)
      .is("deleted_at", null);

    const existingLinkSet = new Set(
      (existingLinks ?? []).map(
        (l) => `${(l as { entity_type: string }).entity_type}:${(l as { entity_id: number }).entity_id}`
      )
    );

    // Load content snippet (needed for party name matching below)
    const { data: contentRow } = await supabase
      .from("dms_document_content")
      .select("content_text")
      .eq("document_id", documentId)
      .single();

    const rawContent =
      (contentRow as { content_text?: string | null } | null)?.content_text ?? null;
    const contentSnippet = rawContent
      ? rawContent.substring(0, LINK_CONTENT_MAX_CHARS)
      : null;

    // Load available parties — name-match first to improve relevance
    // Step 1: extract search terms from document (English + Arabic)
    const searchText = [
      docRow.title,
      docRow.ai_summary?.substring(0, 400) ?? "",
      contentSnippet?.substring(0, 300) ?? "",
    ].join(" ");

    // English terms (≥ 4 chars, alphanumeric only)
    const termSet = new Set<string>();
    for (const word of searchText.toLowerCase().split(/\s+/)) {
      const clean = word.replace(/[^a-z0-9]/g, "");
      if (clean.length >= 4) termSet.add(clean);
    }
    const terms = Array.from(termSet).slice(0, 12);

    // Arabic terms (≥ 3 Arabic chars) — DMS ARABIC FIX.1: include Arabic name matching
    const arabicTermSet = new Set<string>();
    for (const word of searchText.split(/\s+/)) {
      // Match Arabic Unicode range (U+0600–U+06FF)
      if (/[\u0600-\u06FF]{3,}/.test(word)) {
        arabicTermSet.add(word.replace(/[^\u0600-\u06FF]/g, "").substring(0, 30));
      }
    }
    const arabicTerms = Array.from(arabicTermSet).slice(0, 8);

    // Step 2: find parties whose display_name OR legal_name_ar matches any extracted term
    const matchedPartyIds = new Set<number>();
    if (terms.length > 0 || arabicTerms.length > 0) {
      const englishFilters = terms.map((t) => `display_name.ilike.%${t}%`);
      // Arabic name matching against legal_name_ar and display_name
      const arabicFilters = arabicTerms.map((t) => `legal_name_ar.ilike.%${t}%`);
      const arabicDisplayFilters = arabicTerms.map((t) => `display_name.ilike.%${t}%`);
      const allFilters = [...englishFilters, ...arabicFilters, ...arabicDisplayFilters];

      if (allFilters.length > 0) {
        const orFilter = allFilters.join(",");
        const { data: nameMatched } = await supabase
          .from("parties")
          .select("id, party_code, display_name")
          .is("deleted_at", null)
          .or(orFilter)
          .limit(NAME_MATCH_FILL_LIMIT);
        for (const p of nameMatched ?? []) {
          matchedPartyIds.add((p as { id: number }).id);
        }
      }
    }

    // Step 3: fill remainder with other recent parties
    const remaining = MAX_PARTY_CONTEXT - matchedPartyIds.size;
    let allParties: { id: number; party_code: string; display_name: string }[] = [];

    if (matchedPartyIds.size > 0) {
      const { data: matched } = await supabase
        .from("parties")
        .select("id, party_code, display_name")
        .is("deleted_at", null)
        .in("id", Array.from(matchedPartyIds))
        .limit(NAME_MATCH_FILL_LIMIT);
      allParties = (matched ?? []) as { id: number; party_code: string; display_name: string }[];
    }

    if (remaining > 0) {
      const fillQuery = supabase
        .from("parties")
        .select("id, party_code, display_name")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(remaining);

      // Exclude already-matched IDs if any
      const fillResult = await fillQuery;
      const fillRows = ((fillResult.data ?? []) as { id: number; party_code: string; display_name: string }[])
        .filter((p) => !matchedPartyIds.has(p.id));
      allParties = [...allParties, ...fillRows].slice(0, MAX_PARTY_CONTEXT);
    }

    const partyList = allParties;

    // Call AI
    const result = await provider.callStructuredCompletion(
      buildLinkSystemPrompt(partyList),
      buildLinkUserMessage({
        documentNo: docRow.document_no,
        title: docRow.title,
        typeName: docRow.dms_document_types?.name_en ?? null,
        issueDate: docRow.issue_date,
        aiSummary: docRow.ai_summary,
        contentSnippet,
        existingLinks: (existingLinks ?? []).map((l) => ({
          entityType: (l as { entity_type: string }).entity_type,
          entityId: (l as { entity_id: number }).entity_id,
        })),
      }),
      { maxTokens: 500, temperature: 0.0 }
    );

    const parsed = JSON.parse(result.rawJson) as unknown;
    const validated = LinkSuggestionsSchema.safeParse(parsed);
    if (!validated.success) {
      return { success: false, error: "AI returned unexpected link suggestion format." };
    }

    // Mark previous pending suggestions as superseded
    await supabase
      .from("dms_ai_link_suggestions")
      .update({ status: "superseded", updated_at: new Date().toISOString() })
      .eq("document_id", documentId)
      .eq("status", "pending");

    // Insert new suggestions (skip already-linked entities)
    const toInsert = validated.data.suggestions
      .filter((s) => !existingLinkSet.has(`${s.entityType}:${s.entityId}`))
      .map((s) => ({
        document_id: documentId,
        entity_type: s.entityType,
        entity_id: s.entityId,
        entity_name: s.entityName,
        confidence: s.confidence,
        reason: s.reason,
        status: "pending" as const,
      }));

    if (toInsert.length === 0) {
      return { success: true, data: [] };
    }

    const { data: inserted, error: insertError } = await supabase
      .from("dms_ai_link_suggestions")
      .insert(toInsert)
      .select("id, document_id, entity_type, entity_id, entity_name, confidence, reason, status, created_at, reviewed_at");

    if (insertError) {
      return { success: false, error: "Failed to save link suggestions." };
    }

    // Log AI usage
    await supabase.from("erp_ai_usage_logs").insert({
      feature_area: "DMS_SMART_LINKS",
      operation_type: "link_suggestion",
      document_id: documentId,
      provider_code: provider.providerCode,
      model_id: provider.modelId,
      input_char_count: docRow.title.length + (docRow.ai_summary?.length ?? 0),
      output_char_count: result.rawJson.length,
      prompt_tokens: result.promptTokens ?? null,
      completion_tokens: result.completionTokens ?? null,
      status: "success",
      prompt_version: LINK_PROMPT_VERSION,
      result_count: toInsert.length,
    });

    await logAudit({
      module_code: "DMS",
      action: "dms_link_suggestions_generated",
      
      entity_name: "dms_ai_link_suggestions",
      entity_id: documentId,
      entity_reference: docRow.document_no,
      new_values: { suggestion_count: toInsert.length },
    });

    const rows: DmsLinkSuggestionRow[] = (inserted ?? []).map((r) => ({
      id: (r as { id: number }).id,
      documentId: (r as { document_id: number }).document_id,
      entityType: (r as { entity_type: string }).entity_type,
      entityId: (r as { entity_id: number | null }).entity_id,
      entityName: (r as { entity_name: string | null }).entity_name,
      confidence: (r as { confidence: number | null }).confidence,
      reason: (r as { reason: string | null }).reason,
      status: (r as { status: string }).status as DmsLinkSuggestionRow["status"],
      createdAt: (r as { created_at: string }).created_at,
      reviewedAt: (r as { reviewed_at: string | null }).reviewed_at,
    }));

    return { success: true, data: rows };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Link suggestion failed.",
    };
  }
}

// ── getDmsLinkSuggestions ──────────────────────────────────────────────────────

export async function getDmsLinkSuggestions(
  documentId: number
): Promise<ActionResult<DmsLinkSuggestionRow[]>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "dms.documents.view")) {
    return { success: false, error: "Permission denied." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("dms_ai_link_suggestions")
      .select("id, document_id, entity_type, entity_id, entity_name, confidence, reason, status, created_at, reviewed_at")
      .eq("document_id", documentId)
      .in("status", ["pending", "accepted", "rejected"])
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) return { success: false, error: "Failed to load link suggestions." };

    const rows: DmsLinkSuggestionRow[] = (data ?? []).map((r) => ({
      id: (r as { id: number }).id,
      documentId: (r as { document_id: number }).document_id,
      entityType: (r as { entity_type: string }).entity_type,
      entityId: (r as { entity_id: number | null }).entity_id,
      entityName: (r as { entity_name: string | null }).entity_name,
      confidence: (r as { confidence: number | null }).confidence,
      reason: (r as { reason: string | null }).reason,
      status: (r as { status: string }).status as DmsLinkSuggestionRow["status"],
      createdAt: (r as { created_at: string }).created_at,
      reviewedAt: (r as { reviewed_at: string | null }).reviewed_at,
    }));

    return { success: true, data: rows };
  } catch {
    return { success: false, error: "Failed to load link suggestions." };
  }
}

// ── applyDmsLinkSuggestions ────────────────────────────────────────────────────

export async function applyDmsLinkSuggestions(
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
      .from("dms_ai_link_suggestions")
      .select("id, entity_type, entity_id, entity_name")
      .eq("document_id", documentId)
      .in("id", suggestionIds)
      .eq("status", "pending")
      .is("deleted_at", null);

    if (loadError || !suggestions?.length) {
      return { success: false, error: "No pending link suggestions found." };
    }

    // Load existing links to prevent duplicates
    const { data: existingLinks } = await supabase
      .from("dms_document_links")
      .select("entity_type, entity_id")
      .eq("document_id", documentId)
      .is("deleted_at", null);

    const existingLinkSet = new Set(
      (existingLinks ?? []).map(
        (l) => `${(l as { entity_type: string }).entity_type}:${(l as { entity_id: number }).entity_id}`
      )
    );

    const userId = (ctx.profile?.id as number | undefined) ?? null;
    const now = new Date().toISOString();
    let appliedCount = 0;

    for (const sugg of suggestions as {
      id: number;
      entity_type: string;
      entity_id: number | null;
      entity_name: string | null;
    }[]) {
      if (!sugg.entity_id) continue; // Cannot apply without a resolved entity ID

      const key = `${sugg.entity_type}:${sugg.entity_id}`;
      if (existingLinkSet.has(key)) {
        // Mark as accepted even if already linked
        await supabase
          .from("dms_ai_link_suggestions")
          .update({ status: "accepted", reviewed_by: userId, reviewed_at: now, updated_at: now })
          .eq("id", sugg.id);
        continue;
      }

      // Insert into dms_document_links
      const { error: linkError } = await supabase.from("dms_document_links").insert({
        document_id: documentId,
        entity_type: sugg.entity_type,
        entity_id: sugg.entity_id,
        linked_by: userId,
        linked_at: now,
        notes: `AI suggested — ${sugg.entity_name ?? ""}`.trim(),
      });

      if (!linkError) {
        existingLinkSet.add(key);
        appliedCount++;
        await supabase
          .from("dms_ai_link_suggestions")
          .update({ status: "accepted", reviewed_by: userId, reviewed_at: now, updated_at: now })
          .eq("id", sugg.id);
      }
    }

    await logAudit({
      module_code: "DMS",
      action: "dms_link_suggestions_applied",
      
      entity_name: "dms_ai_link_suggestions",
      entity_id: documentId,
      entity_reference: String(documentId),
      new_values: { applied_count: appliedCount, suggestion_ids: suggestionIds },
    });

    revalidatePath(`/dms/documents/${documentId}`);

    return { success: true, data: { appliedCount } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to apply link suggestions.",
    };
  }
}

// ── rejectDmsLinkSuggestions ──────────────────────────────────────────────────

export async function rejectDmsLinkSuggestions(
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
      .from("dms_ai_link_suggestions")
      .update({ status: "rejected", reviewed_by: userId, reviewed_at: now, updated_at: now })
      .eq("document_id", documentId)
      .in("id", suggestionIds)
      .eq("status", "pending");

    if (error) {
      return { success: false, error: "Failed to reject link suggestions." };
    }

    await logAudit({
      module_code: "DMS",
      action: "dms_link_suggestions_rejected",
      
      entity_name: "dms_ai_link_suggestions",
      entity_id: documentId,
      entity_reference: String(documentId),
      new_values: { suggestion_ids: suggestionIds },
    });

    return { success: true, data: { rejectedCount: suggestionIds.length } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to reject link suggestions.",
    };
  }
}
