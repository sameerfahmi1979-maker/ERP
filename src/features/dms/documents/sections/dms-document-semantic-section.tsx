"use client";

/**
 * DMS 12.5 — DmsDocumentSemanticSection
 *
 * Shows the document's embedding status and lets authorized users generate /
 * regenerate the summary embedding and find semantically similar documents.
 *
 * Security:
 *  - Generate/Regenerate hidden unless user has dms.documents.ai.run or dms.admin.
 *  - "Find Similar" for confidential source documents is enforced server-side (admin only).
 *  - No raw content text or vectors are ever shown.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Compass,
  RefreshCw,
  Sparkles,
  AlertCircle,
  Clock,
  Info,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import { queryKeys } from "@/lib/query/query-keys";
import { useWorkspace } from "@/hooks/use-workspace";
import { DmsRiskBadge } from "../dms-risk-badge";
import {
  getDmsDocumentEmbeddingStatus,
  generateDmsDocumentEmbedding,
  regenerateDmsDocumentEmbedding,
  findSimilarDmsDocuments,
} from "@/server/actions/dms/semantic-search";
import type {
  DmsDocumentEmbeddingStatusRow,
  DmsEmbeddingStatus,
  DmsSemanticSearchResult,
} from "@/lib/dms/ai/types";

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: DmsEmbeddingStatus | null }) {
  if (!status) return <Badge variant="outline">Unknown</Badge>;
  const config: Record<
    DmsEmbeddingStatus,
    { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
  > = {
    complete: { label: "Complete", variant: "default" },
    pending: { label: "Pending", variant: "outline" },
    failed: { label: "Failed", variant: "destructive" },
    skipped: { label: "Skipped", variant: "secondary" },
    not_required: { label: "Not Required", variant: "secondary" },
  };
  const c = config[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={c.variant}>{c.label}</Badge>;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface DmsDocumentSemanticSectionProps {
  documentId: number;
  canGenerate?: boolean;
}

export function DmsDocumentSemanticSection({
  documentId,
  canGenerate = false,
}: DmsDocumentSemanticSectionProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { openTab } = useWorkspace();
  const [working, setWorking] = useState(false);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [similar, setSimilar] = useState<DmsSemanticSearchResult[] | null>(null);
  const [similarError, setSimilarError] = useState<string | null>(null);

  const {
    data: row,
    isLoading,
    error: queryError,
    refetch,
  } = useQuery<DmsDocumentEmbeddingStatusRow | null>({
    queryKey: queryKeys.dms.documentEmbedding(documentId),
    queryFn: async () => {
      const r = await getDmsDocumentEmbeddingStatus(documentId);
      if (!r.success) throw new Error(r.error ?? "Failed to load embedding status");
      return r.data ?? null;
    },
    staleTime: 30_000,
    retry: false,
  });

  async function handleGenerate(regenerate: boolean) {
    setWorking(true);
    try {
      const action = regenerate
        ? regenerateDmsDocumentEmbedding
        : generateDmsDocumentEmbedding;
      const result = await action(documentId);
      if (!result.success) {
        toast.error(result.error ?? "Embedding generation failed");
      } else {
        toast.success(
          result.data?.status === "skipped"
            ? "No summary or text available — embedding skipped."
            : `Embedding ${regenerate ? "regenerated" : "generated"}.`
        );
        await refetch();
        await queryClient.invalidateQueries({ queryKey: queryKeys.dms.documents() });
      }
    } catch (e) {
      toast.error(String(e));
    } finally {
      setWorking(false);
    }
  }

  async function handleFindSimilar() {
    setSimilarLoading(true);
    setSimilar(null);
    setSimilarError(null);
    try {
      const r = await findSimilarDmsDocuments(documentId);
      if (r.success && r.data) {
        setSimilar(r.data);
      } else {
        setSimilarError(r.error ?? "Failed to find similar documents.");
      }
    } catch (e) {
      setSimilarError(String(e));
    } finally {
      setSimilarLoading(false);
    }
  }

  function openDocument(id: number) {
    openTab({ route: `/dms/documents/record/${id}?mode=edit`, title: `Document #${id}` });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
        Loading embedding status…
      </div>
    );
  }

  if (queryError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <AlertCircle className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">
          {queryError instanceof Error ? queryError.message : "Failed to load embedding status"}
        </p>
      </div>
    );
  }

  if (!row) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <Compass className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">Embedding data unavailable.</p>
      </div>
    );
  }

  const hasEmbedding = row.hasEmbedding && row.status === "complete";

  return (
    <div className="space-y-4 p-1">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Compass className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Semantic Embedding</span>
          <Badge variant="outline" className="gap-1 text-xs">
            <Sparkles className="h-3 w-3" />
            AI
          </Badge>
        </div>
        <StatusBadge status={row.status} />
        {row.source && (
          <span className="text-xs text-muted-foreground">
            Source: {row.source === "ai_summary" ? "AI Summary" : "Extracted Text"}
          </span>
        )}
        {row.updatedAt && (
          <span className="text-xs text-muted-foreground">
            Updated {format(parseISO(row.updatedAt), "d MMM yyyy HH:mm")}
          </span>
        )}
        {row.model && (
          <span className="text-xs text-muted-foreground">Model: {row.model}</span>
        )}
        {canGenerate && (
          <div className="ml-auto flex items-center gap-2">
            {hasEmbedding ? (
              <Button size="sm" variant="outline" onClick={() => handleGenerate(true)} disabled={working}>
                {working ? (
                  <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                )}
                Regenerate Embedding
              </Button>
            ) : (
              <Button size="sm" onClick={() => handleGenerate(false)} disabled={working}>
                {working ? (
                  <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-3.5 w-3.5" />
                )}
                Generate Embedding
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Failed */}
      {row.status === "failed" && row.error && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Embedding failed: {row.error}</span>
        </div>
      )}

      {/* No embedding yet */}
      {!hasEmbedding && row.status !== "failed" && (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <Clock className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">No embedding yet</p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              {row.status === "skipped"
                ? "Embedding was skipped — generate an AI summary or run OCR first, then generate the embedding."
                : "Generate an embedding to enable semantic similarity for this document."}
            </p>
          </div>
        </div>
      )}

      {/* Find similar */}
      {hasEmbedding && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleFindSimilar} disabled={similarLoading}>
              {similarLoading ? (
                <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Compass className="mr-2 h-3.5 w-3.5" />
              )}
              Find Similar Documents
            </Button>
            <Button size="sm" variant="ghost" onClick={() => router.refresh()}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>

          {similarError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {similarError}
            </div>
          )}

          {similar !== null && !similarLoading && (
            <>
              {similar.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No similar documents found. Other documents need generated embeddings to appear here.
                </p>
              ) : (
                <div className="space-y-2">
                  {similar.map((r) => (
                    <div
                      key={r.documentId}
                      className="rounded-md border border-border bg-card hover:bg-muted/20 transition-colors p-3 cursor-pointer"
                      onClick={() => openDocument(r.documentId)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs text-primary font-medium">{r.documentNo}</span>
                            <span className="font-medium text-sm truncate">{r.title}</span>
                            <Badge variant="outline" className="text-[9px] px-1 py-0 border-sky-400 text-sky-600">
                              {Math.round(r.similarity * 100)}% similar
                            </Badge>
                            {r.riskLevel && r.riskLevel !== "none" && <DmsRiskBadge level={r.riskLevel} />}
                          </div>
                          {r.aiSummarySnippet && (
                            <p className="text-xs text-muted-foreground mt-0.5 italic line-clamp-2">
                              {r.aiSummarySnippet}
                            </p>
                          )}
                        </div>
                        <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground mt-1" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Disclaimer */}
      <div className="flex items-start gap-2 rounded-md border border-blue-100 bg-blue-50/50 px-3 py-2 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Embeddings index the AI summary (or extracted text) so documents can be found by meaning.
          They never expose raw content, and the original document remains the source of truth.
        </span>
      </div>
    </div>
  );
}
