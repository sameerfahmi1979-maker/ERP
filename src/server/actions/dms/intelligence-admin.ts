"use server";

/**
 * DMS 12.4A — Intelligence Admin Stats
 *
 * Aggregate health counts for the DMS Intelligence Admin page.
 * Admin-only. Returns counts only — never document content.
 *
 * Uses createAdminClient() for aggregate counts only (not document reads/search).
 * Callers must hold dms.admin or system_admin.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DmsIntelligenceAdminStats = {
  totalDocuments: number;
  documentsWithExtractedText: number;
  documentsMissingExtractedText: number;
  documentsWithAiSummary: number;
  documentsMissingAiSummary: number;
  documentsWithCompletenessScore: number;
  highRiskDocuments: number;
  criticalRiskDocuments: number;
  pendingTagSuggestions: number;
  pendingLinkSuggestions: number;
  // DMS 12.5 — embeddings
  documentsWithEmbedding: number;
  documentsMissingEmbedding: number;
  failedEmbeddings: number;
};

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

// ── getDmsIntelligenceAdminStats ────────────────────────────────────────────────

export async function getDmsIntelligenceAdminStats(): Promise<
  ActionResult<DmsIntelligenceAdminStats>
> {
  const ctx = await getAuthContext();
  if (
    !hasPermission(ctx, "dms.admin") &&
    !ctx.roleCodes.includes("system_admin")
  ) {
    return { success: false, error: "Permission denied — requires dms.admin." };
  }

  try {
    const supabase = createAdminClient();

    // Run all counts in parallel
    const [
      totalResult,
      contentResult,
      summaryResult,
      completenessResult,
      highRiskResult,
      criticalRiskResult,
      pendingTagsResult,
      pendingLinksResult,
      withEmbeddingResult,
      failedEmbeddingResult,
    ] = await Promise.all([
      // Total non-deleted documents
      supabase
        .from("dms_documents")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null),

      // Documents with extracted text
      supabase
        .from("dms_document_content")
        .select("document_id", { count: "exact", head: true })
        .not("content_text", "is", null),

      // Documents with AI summary complete
      supabase
        .from("dms_documents")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .eq("ai_summary_status", "complete"),

      // Documents with completeness score
      supabase
        .from("dms_documents")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .not("completeness_score", "is", null),

      // High risk
      supabase
        .from("dms_documents")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .eq("ai_risk_level", "high"),

      // Critical risk
      supabase
        .from("dms_documents")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .eq("ai_risk_level", "critical"),

      // Pending tag suggestions
      supabase
        .from("dms_ai_tag_suggestions")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .is("deleted_at", null),

      // Pending link suggestions
      supabase
        .from("dms_ai_link_suggestions")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .is("deleted_at", null),

      // Documents with a complete embedding (DMS 12.5)
      supabase
        .from("dms_documents")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .eq("summary_embedding_status", "complete"),

      // Documents with a failed embedding (DMS 12.5)
      supabase
        .from("dms_documents")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .eq("summary_embedding_status", "failed"),
    ]);

    const totalDocuments = totalResult.count ?? 0;
    const withText = contentResult.count ?? 0;
    const withSummary = summaryResult.count ?? 0;
    const withCompleteness = completenessResult.count ?? 0;
    const withEmbedding = withEmbeddingResult.count ?? 0;

    return {
      success: true,
      data: {
        totalDocuments,
        documentsWithExtractedText: withText,
        documentsMissingExtractedText: Math.max(0, totalDocuments - withText),
        documentsWithAiSummary: withSummary,
        documentsMissingAiSummary: Math.max(0, totalDocuments - withSummary),
        documentsWithCompletenessScore: withCompleteness,
        highRiskDocuments: highRiskResult.count ?? 0,
        criticalRiskDocuments: criticalRiskResult.count ?? 0,
        pendingTagSuggestions: pendingTagsResult.count ?? 0,
        pendingLinkSuggestions: pendingLinksResult.count ?? 0,
        documentsWithEmbedding: withEmbedding,
        documentsMissingEmbedding: Math.max(0, totalDocuments - withEmbedding),
        failedEmbeddings: failedEmbeddingResult.count ?? 0,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load intelligence stats.",
    };
  }
}
