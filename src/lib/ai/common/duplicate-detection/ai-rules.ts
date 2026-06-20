/**
 * ERP COMMON AI.3 — AI-Assisted Duplicate Detection Rules
 *
 * Limited AI rules: name similarity + wrong document link.
 * Max 50 AI calls per scan. No prompt/response logging.
 */

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { callCommonAiStructuredCompletion } from "@/lib/ai/common/provider-bridge";
import type { DuplicateRuleResult } from "./types";
import { DUPLICATE_AI_MIN_CONFIDENCE } from "./types";
import { normalizeName } from "./candidate-builder";

const NAME_SIMILARITY_PROMPT_VERSION = "v1.0";
const LINK_MISMATCH_PROMPT_VERSION = "v1.0";

const nameSimilarityOutputSchema = z.object({
  pairs: z.array(
    z.object({
      entityType: z.enum(["party", "company"]),
      entityIdA: z.number().int().positive(),
      entityIdB: z.number().int().positive(),
      nameA: z.string().max(200),
      nameB: z.string().max(200),
      confidence: z.number().min(0).max(1),
      reason: z.string().max(300),
    })
  ).max(25),
});

const linkMismatchOutputSchema = z.object({
  mismatches: z.array(
    z.object({
      documentId: z.number().int().positive(),
      linkedEntityType: z.string(),
      linkedEntityId: z.number().int().positive(),
      linkedEntityName: z.string().max(200),
      extractedEntityName: z.string().max(200).optional(),
      confidence: z.number().min(0).max(1),
      reason: z.string().max(300),
    })
  ).max(25),
});

function levenshteinRatio(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] =
        b[i - 1] === a[j - 1]
          ? matrix[i - 1][j - 1]
          : Math.min(matrix[i - 1][j - 1], matrix[i][j - 1], matrix[i - 1][j]) + 1;
    }
  }
  const dist = matrix[b.length][a.length];
  return 1 - dist / Math.max(a.length, b.length);
}

export interface AiRuleContext {
  supabase: SupabaseClient;
  aiCallLimit: number;
  aiCallsMade: number;
}

export async function detectSimilarNamesWithAi(
  ctx: AiRuleContext
): Promise<{ results: DuplicateRuleResult[]; aiCallsMade: number }> {
  if (ctx.aiCallsMade >= ctx.aiCallLimit) {
    return { results: [], aiCallsMade: ctx.aiCallsMade };
  }

  const { data: parties } = await ctx.supabase
    .from("parties")
    .select("id, display_name, legal_name_ar")
    .is("deleted_at", null)
    .not("display_name", "is", null)
    .limit(200);

  const { data: companies } = await ctx.supabase
    .from("owner_companies")
    .select("id, trade_name, legal_name_en")
    .is("deleted_at", null)
    .not("trade_name", "is", null)
    .limit(100);

  type PrefilterPair = {
    entityType: "party" | "company";
    idA: number;
    idB: number;
    nameA: string;
    nameB: string;
  };

  const prefilter: PrefilterPair[] = [];

  const partyRows = (parties ?? []) as { id: number; display_name: string; legal_name_ar: string | null }[];
  for (let i = 0; i < partyRows.length; i++) {
    for (let j = i + 1; j < partyRows.length; j++) {
      const nA = normalizeName(partyRows[i].display_name);
      const nB = normalizeName(partyRows[j].display_name);
      if (!nA || !nB || nA === nB) continue;
      const ratio = levenshteinRatio(nA, nB);
      if (ratio >= 0.65 && ratio < 0.98) {
        prefilter.push({
          entityType: "party",
          idA: partyRows[i].id,
          idB: partyRows[j].id,
          nameA: partyRows[i].display_name.slice(0, 100),
          nameB: partyRows[j].display_name.slice(0, 100),
        });
      }
    }
  }

  const companyRows = (companies ?? []) as { id: number; trade_name: string }[];
  for (let i = 0; i < companyRows.length; i++) {
    for (let j = i + 1; j < companyRows.length; j++) {
      const nA = normalizeName(companyRows[i].trade_name);
      const nB = normalizeName(companyRows[j].trade_name);
      if (!nA || !nB || nA === nB) continue;
      const ratio = levenshteinRatio(nA, nB);
      if (ratio >= 0.65 && ratio < 0.98) {
        prefilter.push({
          entityType: "company",
          idA: companyRows[i].id,
          idB: companyRows[j].id,
          nameA: companyRows[i].trade_name.slice(0, 100),
          nameB: companyRows[j].trade_name.slice(0, 100),
        });
      }
    }
  }

  const batch = prefilter.slice(0, 20);
  if (batch.length === 0) return { results: [], aiCallsMade: ctx.aiCallsMade };

  const systemPrompt = `You are an ERP duplicate detection assistant for a UAE company.
Compare entity name pairs and identify likely duplicates considering Arabic/English transliteration variants.
Return JSON only: { "pairs": [{ "entityType", "entityIdA", "entityIdB", "nameA", "nameB", "confidence", "reason" }] }
confidence 0-1. Only include pairs with confidence >= 0.70 likely duplicates.
Prompt version: ${NAME_SIMILARITY_PROMPT_VERSION}`;

  const userPrompt = JSON.stringify({ candidatePairs: batch });

  const outcome = await callCommonAiStructuredCompletion(systemPrompt, userPrompt, {
    maxTokens: 1500,
    temperature: 0,
  });

  let aiCallsMade = ctx.aiCallsMade + 1;
  if (!outcome.success) return { results: [], aiCallsMade };

  let parsed: z.infer<typeof nameSimilarityOutputSchema>;
  try {
    parsed = nameSimilarityOutputSchema.parse(JSON.parse(outcome.rawJson));
  } catch {
    return { results: [], aiCallsMade };
  }

  const results: DuplicateRuleResult[] = [];
  for (const pair of parsed.pairs) {
    if (pair.confidence < DUPLICATE_AI_MIN_CONFIDENCE) continue;
    if (pair.entityIdA === pair.entityIdB) continue;
    const [a, b] = pair.entityIdA < pair.entityIdB
      ? [pair.entityIdA, pair.entityIdB]
      : [pair.entityIdB, pair.entityIdA];

    results.push({
      candidateType: "similar_name",
      detectionMethod: "ai",
      entityTypeA: pair.entityType,
      entityIdA: a,
      entityTypeB: pair.entityType,
      entityIdB: b,
      conflictField: "name",
      valueA: pair.nameA.slice(0, 100),
      valueB: pair.nameB.slice(0, 100),
      valueKind: "name",
      confidenceScore: pair.confidence,
      aiReason: pair.reason.slice(0, 500),
      evidenceJson: { promptVersion: NAME_SIMILARITY_PROMPT_VERSION },
    });
  }

  return { results, aiCallsMade };
}

export async function detectWrongDocumentLinkWithAi(
  ctx: AiRuleContext
): Promise<{ results: DuplicateRuleResult[]; aiCallsMade: number }> {
  if (ctx.aiCallsMade >= ctx.aiCallLimit) {
    return { results: [], aiCallsMade: ctx.aiCallsMade };
  }

  const { data: links } = await ctx.supabase
    .from("dms_document_links")
    .select("document_id, entity_type, entity_id")
    .in("entity_type", ["party", "company"])
    .is("deleted_at", null)
    .limit(40);

  if (!links?.length) return { results: [], aiCallsMade: ctx.aiCallsMade };

  const docIds = [...new Set((links as { document_id: number }[]).map((l) => l.document_id))].slice(0, 25);

  const { data: docs } = await ctx.supabase
    .from("dms_documents")
    .select("id, document_no, title, ai_summary, confidentiality_level")
    .in("id", docIds)
    .is("deleted_at", null);

  if (!docs?.length) return { results: [], aiCallsMade: ctx.aiCallsMade };

  type LinkRow = { document_id: number; entity_type: string; entity_id: number };
  const linkRows = links as LinkRow[];

  const payloads: Array<{
    documentId: number;
    documentNo: string | null;
    title: string | null;
    summarySnippet: string | null;
    linkedEntityType: string;
    linkedEntityId: number;
    linkedEntityName: string;
  }> = [];

  for (const doc of docs as {
    id: number;
    document_no: string | null;
    title: string | null;
    ai_summary: string | null;
    confidentiality_level: string | null;
  }[]) {
    if (["hr", "legal", "executive"].includes(doc.confidentiality_level ?? "")) continue;

    const docLinks = linkRows.filter((l) => l.document_id === doc.id);
    for (const link of docLinks.slice(0, 2)) {
      let linkedEntityName = `Entity ${link.entity_id}`;
      if (link.entity_type === "party") {
        const { data: party } = await ctx.supabase
          .from("parties")
          .select("display_name")
          .eq("id", link.entity_id)
          .maybeSingle();
        linkedEntityName = (party as { display_name?: string } | null)?.display_name ?? linkedEntityName;
      } else if (link.entity_type === "company") {
        const { data: co } = await ctx.supabase
          .from("owner_companies")
          .select("trade_name, legal_name_en")
          .eq("id", link.entity_id)
          .maybeSingle();
        const row = co as { trade_name?: string; legal_name_en?: string } | null;
        linkedEntityName = row?.trade_name ?? row?.legal_name_en ?? linkedEntityName;
      }

      payloads.push({
        documentId: doc.id,
        documentNo: doc.document_no,
        title: doc.title?.slice(0, 120) ?? null,
        summarySnippet: doc.ai_summary?.slice(0, 400) ?? null,
        linkedEntityType: link.entity_type,
        linkedEntityId: link.entity_id,
        linkedEntityName: linkedEntityName.slice(0, 120),
      });
    }
  }

  const batch = payloads.slice(0, 20);
  if (batch.length === 0) return { results: [], aiCallsMade: ctx.aiCallsMade };

  const systemPrompt = `You are an ERP document link validator for a UAE company.
Given document title/summary and the linked entity name, detect if the document likely belongs to a DIFFERENT entity.
Return JSON: { "mismatches": [{ "documentId", "linkedEntityType", "linkedEntityId", "linkedEntityName", "extractedEntityName", "confidence", "reason" }] }
Only include mismatches with confidence >= 0.70.
Prompt version: ${LINK_MISMATCH_PROMPT_VERSION}`;

  const outcome = await callCommonAiStructuredCompletion(
    systemPrompt,
    JSON.stringify({ documents: batch }),
    { maxTokens: 1500, temperature: 0 }
  );

  let aiCallsMade = ctx.aiCallsMade + 1;
  if (!outcome.success) return { results: [], aiCallsMade };

  let parsed: z.infer<typeof linkMismatchOutputSchema>;
  try {
    parsed = linkMismatchOutputSchema.parse(JSON.parse(outcome.rawJson));
  } catch {
    return { results: [], aiCallsMade };
  }

  const results: DuplicateRuleResult[] = [];
  for (const m of parsed.mismatches) {
    if (m.confidence < DUPLICATE_AI_MIN_CONFIDENCE) continue;
    results.push({
      candidateType: "wrong_document_link",
      detectionMethod: "ai",
      entityTypeA: m.linkedEntityType,
      entityIdA: m.linkedEntityId,
      entityTypeB: "dms_document",
      entityIdB: m.documentId,
      conflictField: "entity_link",
      valueA: m.linkedEntityName.slice(0, 100),
      valueB: (m.extractedEntityName ?? m.reason).slice(0, 100),
      valueKind: "name",
      confidenceScore: m.confidence,
      aiReason: m.reason.slice(0, 500),
      sourceDocumentId: m.documentId,
      evidenceJson: {
        documentId: m.documentId,
        promptVersion: LINK_MISMATCH_PROMPT_VERSION,
      },
    });
  }

  return { results, aiCallsMade };
}

export async function runAiAssistedRules(
  ctx: AiRuleContext
): Promise<{ results: DuplicateRuleResult[]; aiCallsMade: number }> {
  const all: DuplicateRuleResult[] = [];
  let aiCallsMade = ctx.aiCallsMade;

  const nameCtx = { ...ctx, aiCallsMade };
  const nameResult = await detectSimilarNamesWithAi(nameCtx);
  all.push(...nameResult.results);
  aiCallsMade = nameResult.aiCallsMade;

  if (aiCallsMade < ctx.aiCallLimit) {
    const linkResult = await detectWrongDocumentLinkWithAi({ ...ctx, aiCallsMade });
    all.push(...linkResult.results);
    aiCallsMade = linkResult.aiCallsMade;
  }

  return { results: all, aiCallsMade };
}
