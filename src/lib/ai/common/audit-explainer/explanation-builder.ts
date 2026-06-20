// ERP COMMON AI.14 — Explanation Builder
// Uses provider bridge for AI explanations with deterministic fallback.
// No direct OpenAI imports. No raw response storage.

import { z } from "zod";
import { callCommonAiStructuredCompletion } from "@/lib/ai/common/provider-bridge";
import { buildAuditExplainerPrompt } from "./prompt-builder";
import { AI_REVIEW_LINKS, buildEntityRoute } from "./route-links";
import type { AuditTimelineItem, AuditExplanationOutput, AuditExplainerSourceType } from "./types";

// ── Output schema ──────────────────────────────────────────────────────────────

const ExplanationSchema = z.object({
  title: z.string().max(120),
  plainEnglishSummary: z.string().max(1000),
  whatChanged: z.array(z.string().max(200)),
  whoAndWhen: z.string().max(300),
  businessImpact: z.string().max(500).nullable(),
  recommendedReviewLinks: z.array(z.object({ label: z.string(), href: z.string() })),
  confidence: z.enum(["high", "medium", "low"]),
});

// ── Deterministic fallback ─────────────────────────────────────────────────────

export function buildDeterministicAuditSummary(
  items: AuditTimelineItem[],
  context?: { entityType?: string; entityId?: number; scope?: string }
): string {
  if (items.length === 0) {
    return "No audit events found for this scope.";
  }

  const actionCounts: Record<string, number> = {};
  const entities = new Set<string>();
  for (const item of items) {
    actionCounts[item.action] = (actionCounts[item.action] ?? 0) + 1;
    entities.add(item.entityType);
  }

  const topActions = Object.entries(actionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([a, c]) => `${a} (×${c})`)
    .join(", ");

  const entityCtx = context?.entityType
    ? `for ${context.entityType}${context.entityId ? ` #${context.entityId}` : ""}`
    : `across ${Array.from(entities).slice(0, 3).join(", ")}`;

  const latest = items[0];
  return `${items.length} audit event${items.length !== 1 ? "s" : ""} recorded ${entityCtx} in ${context?.scope ?? "this period"}. Top actions: ${topActions}. Most recent: ${latest.safeLabel} at ${new Date(latest.occurredAt).toLocaleString()}.`;
}

// ── AI explanation ─────────────────────────────────────────────────────────────

export interface GenerateExplanationResult {
  explanation: AuditExplanationOutput | null;
  deterministicSummary: string;
  isAiGenerated: boolean;
  modelName?: string;
  promptTokens?: number;
  completionTokens?: number;
  durationMs?: number;
  error?: string;
}

export async function generateAuditExplanation(
  items: AuditTimelineItem[],
  context?: { entityType?: string; entityId?: number; scope?: string; sourceType?: AuditExplainerSourceType }
): Promise<GenerateExplanationResult> {
  const deterministicSummary = buildDeterministicAuditSummary(items, context);

  if (items.length === 0) {
    return { explanation: null, deterministicSummary, isAiGenerated: false };
  }

  const { systemPrompt, userPrompt } = buildAuditExplainerPrompt(items, context);

  const outcome = await callCommonAiStructuredCompletion(systemPrompt, userPrompt, {
    maxTokens: 1500,
    temperature: 0,
  });

  if (!outcome.success) {
    return {
      explanation: null,
      deterministicSummary,
      isAiGenerated: false,
      error: outcome.error,
    };
  }

  try {
    const stripped = outcome.rawJson
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const parsed = JSON.parse(stripped);
    const validated = ExplanationSchema.parse(parsed);

    // Build recommended links from context
    const links: AuditExplanationOutput["recommendedReviewLinks"] = [...validated.recommendedReviewLinks];
    if (context?.entityType && context?.entityId) {
      const route = buildEntityRoute(context.entityType, context.entityId);
      if (route) links.push({ label: `View ${context.entityType} record`, href: route });
    }
    if (context?.sourceType === "ai_event_group") {
      links.push(AI_REVIEW_LINKS.risk);
      links.push(AI_REVIEW_LINKS.compliance);
    }

    return {
      explanation: { ...validated, recommendedReviewLinks: links.slice(0, 5) },
      deterministicSummary,
      isAiGenerated: true,
      modelName: outcome.model ?? undefined,
      promptTokens: outcome.promptTokens ?? undefined,
      completionTokens: outcome.completionTokens ?? undefined,
      durationMs: outcome.durationMs,
    };
  } catch {
    return {
      explanation: null,
      deterministicSummary,
      isAiGenerated: false,
      error: "Failed to parse AI response — deterministic summary provided.",
    };
  }
}
