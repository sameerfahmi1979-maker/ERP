/**
 * ERP COMMON AI.6 — DMS Bridge
 *
 * Delegates to existing DMS search actions. Does NOT rewrite DMS search logic.
 * Returns safe ErpSearchResult[] — never content_text, OCR text, or raw AI.
 */

import { semanticSearchDmsDocuments } from "@/server/actions/dms/semantic-search";
import type { ErpSearchResult, ErpSearchFilters } from "./types";

const CONFIDENTIAL_LEVELS = new Set(["hr", "legal", "executive"]);

// ── Semantic DMS search (DMS.8 — DMS_SEMANTIC_SEARCH gated) ──────────────────

export async function bridgeDmsSemanticSearch(
  input: ErpSearchFilters,
  isAdmin: boolean
): Promise<{ results: ErpSearchResult[]; source: string; failed: boolean }> {
  const source = "dms_semantic";
  try {
    const actionResult = await semanticSearchDmsDocuments(input.query);
    if (!actionResult.success || !actionResult.data) {
      return { results: [], source, failed: !actionResult.success };
    }

    const results: ErpSearchResult[] = actionResult.data.map((doc) => {
      const isConfidential = false;
      const similarity = doc.similarity ?? 0;
      const pct = Math.round(similarity * 100);

      return {
        key: `dms_document:${doc.documentId}`,
        resultType: "dms_document" as const,
        entityType: "dms_document" as const,
        entityId: doc.documentId,
        title: doc.title || doc.documentNo || `Document #${doc.documentId}`,
        subtitle: doc.documentNo || null,
        snippet: isConfidential
          ? null
          : doc.aiSummarySnippet
            ? doc.aiSummarySnippet.substring(0, 200)
            : null,
        route: `/dms/documents/record/${doc.documentId}`,
        semanticSimilarity: similarity,
        isConfidential,
        badges: {
          riskLevel:
            (doc.riskLevel as ErpSearchResult["badges"] extends undefined
              ? never
              : NonNullable<ErpSearchResult["badges"]>["riskLevel"]) ?? null,
        },
        relevanceScore: 50 + Math.round(similarity * 40),
        updatedAt: null,
        ...(doc.aiSummarySnippet && !isConfidential
          ? { snippet: `${pct}% semantic match — ${doc.aiSummarySnippet.substring(0, 150)}` }
          : {}),
      };
    });

    void isAdmin;
    return { results, source, failed: false };
  } catch {
    return { results: [], source, failed: true };
  }
}

export function isConfidentialDoc(confidentialityLevel: string | null): boolean {
  return !!confidentialityLevel && CONFIDENTIAL_LEVELS.has(confidentialityLevel);
}
