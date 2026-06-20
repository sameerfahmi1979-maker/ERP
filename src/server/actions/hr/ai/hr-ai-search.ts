"use server";

/**
 * HR.12 — HR AI Search Assist
 *
 * Converts natural-language HR search queries into structured filters
 * that the deterministic HR search (`searchHr`) can execute.
 *
 * Safety rules:
 * - Does not execute search automatically — returns proposed filters only.
 * - User must click "Run Search" to apply.
 * - No sensitive data loaded into prompt.
 * - Fails safe (returns empty proposal) on any error.
 */

import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { callCommonAiStructuredCompletion } from "@/lib/ai/common/provider-bridge";
import { isHrAiMasterEnabled, isHrAiFeatureEnabled } from "@/lib/hr/ai/feature-flags";
import { HR_AI_FEATURE_FLAGS, HrAiSearchSuggestionSchema } from "@/lib/hr/ai/types";
import type { HrAiActionResult, HrAiSearchSuggestion } from "@/lib/hr/ai/types";

export async function generateHrSearchSuggestion(
  query: string
): Promise<HrAiActionResult<HrAiSearchSuggestion>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile?.id) return { success: false, error: "Not authenticated." };
    if (!hasPermission(ctx, "hr.ai.use"))
      return { success: false, error: "Permission denied: hr.ai.use required." };

    const [masterEnabled, featureEnabled] = await Promise.all([
      isHrAiMasterEnabled(),
      isHrAiFeatureEnabled(HR_AI_FEATURE_FLAGS.SEARCH_ASSIST),
    ]);
    if (!masterEnabled || !featureEnabled)
      return { success: false, error: "HR AI search assist is currently disabled.", featureDisabled: true };

    const safeQuery = query.slice(0, 500).replace(/[<>]/g, "");

    const systemPrompt = `You are an HR search intent extractor for an ERP system.
Convert natural-language HR queries into structured search filters.

CRITICAL RULE — proposedFilters:
- If the query mentions a person's name, employee code, or any text to search for, put it in "search" key (string).
- "search" is the free-text search field used to find employees/candidates by name, code, or keyword.
- Example: "show sameer" → {"search": "sameer", "targetArea": "employees"}
- Example: "find John in Operations" → {"search": "John", "department": "Operations"}
- Never put names or search terms in any other key.

Filter keys by category:
- employees: search (text/name), status, department, designation, branch, owner_company, work_site, dateFrom, dateTo
- candidates: search, status, department, designation
- compliance: search, dateFrom, dateTo, document_type
- time: search, dateFrom, dateTo, status
- payroll: search, status, wps_applicable
- operations: search, status, work_site
- actions: search, status, dateFrom, dateTo
- onboarding: search, status

Rules:
- Only include filter keys that are clearly stated in the query.
- confidence: 0.0–1.0
- warning: if query is ambiguous
- Return valid JSON only.`;

    const userPrompt = `HR search query: "${safeQuery}"

Return JSON (put any name/keyword in "search" field):
{
  "interpretedIntent": "short human description of what the user wants",
  "proposedFilters": {"search": "sameer"},
  "targetArea": "employees",
  "targetReportCode": null,
  "warning": null,
  "confidence": 0.9
}`;

    const outcome = await callCommonAiStructuredCompletion(systemPrompt, userPrompt, {
      maxTokens: 600,
      temperature: 0,
    });

    if (!outcome.success) return { success: false, error: outcome.error };

    let parsed: unknown;
    try { parsed = JSON.parse(outcome.rawJson); } catch { return { success: false, error: "AI returned invalid JSON." }; }

    const validated = HrAiSearchSuggestionSchema.safeParse(parsed);
    if (!validated.success) return { success: false, error: "AI response failed validation." };

    return { success: true, data: validated.data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unexpected error." };
  }
}
