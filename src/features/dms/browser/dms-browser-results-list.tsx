"use client";

/**
 * DMS.BROWSER.1 — Left column results list.
 * Shows Layer 1/2 results, AI results, and semantic results in a unified list.
 * Supports infinite scroll (25 rows per page).
 */

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Loader2, FileSearch, SearchX } from "lucide-react";
import { DmsDocumentStatusBadge } from "@/features/dms/documents/dms-document-status-badge";
import { DmsExpiryBadge } from "@/features/dms/documents/dms-expiry-badge";
import type { DmsBrowserDocument } from "@/server/actions/dms/browser";

interface DmsBrowserResultsListProps {
  rows: DmsBrowserDocument[];
  total: number;
  selectedId: number | null;
  onSelect: (doc: DmsBrowserDocument) => void;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  /** Query used for highlighting excerpts */
  query: string;
  /** Indicates that AI search is actively running */
  isAiSearching?: boolean;
  /** Empty state: has the user typed anything? */
  hasQuery: boolean;
}

/**
 * Highlight the first occurrence of each query word in the excerpt.
 * Returns an array of plain/highlighted segments.
 */
function highlightExcerpt(text: string, query: string): React.ReactNode[] {
  if (!query.trim()) return [text];
  const words = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (words.length === 0) return [text];
  const pattern = new RegExp(`(${words.join("|")})`, "gi");
  const parts = text.split(pattern);
  return parts.map((part, i) =>
    pattern.test(part) ? (
      <mark key={i} className="bg-yellow-200 dark:bg-yellow-800 text-foreground rounded-sm px-0.5">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

function MatchBadge({ source }: { source: DmsBrowserDocument["matchSource"] }) {
  if (source === "content" || source === "both") {
    return (
      <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 uppercase tracking-wide">
        Content
      </span>
    );
  }
  return null;
}

export function DmsBrowserResultsList({
  rows,
  total,
  selectedId,
  onSelect,
  isLoading,
  isLoadingMore,
  hasMore,
  onLoadMore,
  query,
  isAiSearching,
  hasQuery,
}: DmsBrowserResultsListProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Infinite scroll: observe the sentinel element at the bottom of the list
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !isLoadingMore && !isLoading) {
          onLoadMore();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, isLoading, onLoadMore]);

  // ── Empty state (no query yet) ─────────────────────────────────────────────
  if (!hasQuery) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-4 text-muted-foreground py-16">
        <FileSearch className="h-8 w-8 opacity-25" />
        <p className="text-sm text-center">
          Start typing to search across all DMS documents.
        </p>
      </div>
    );
  }

  // ── Loading state (initial search) ────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Searching…</span>
      </div>
    );
  }

  // ── No results ─────────────────────────────────────────────────────────────
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-muted-foreground">
        <SearchX className="h-7 w-7 opacity-25" />
        <p className="text-sm text-center">No documents found.</p>
        <p className="text-xs text-center max-w-[200px]">
          Try a different search term or adjust your filters.
          {query.split(/\s+/).length < 4 && (
            <> For smarter results, try typing a full question.</>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Result count */}
      <div className="px-3 py-1.5 border-b border-border/40 shrink-0 flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">
          {total.toLocaleString()} document{total !== 1 ? "s" : ""} found
        </span>
        {isAiSearching && (
          <span className="flex items-center gap-1 text-[10px] text-violet-600 dark:text-violet-400">
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
            AI searching…
          </span>
        )}
      </div>

      {/* Scrollable list */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {rows.map((doc) => {
          const isSelected = doc.id === selectedId;
          return (
            <button
              key={doc.id}
              type="button"
              onClick={() => onSelect(doc)}
              className={cn(
                "w-full text-left px-3 py-2.5 border-b border-border/30 transition-colors",
                "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                isSelected && "bg-primary/8 border-l-2 border-l-primary"
              )}
            >
              {/* Row header: doc no + status */}
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <span className="font-mono text-[10px] text-muted-foreground truncate">
                  {doc.documentNo}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <MatchBadge source={doc.matchSource} />
                  {doc.status && <DmsDocumentStatusBadge status={doc.status} className="text-[9px] px-1 py-0" />}
                </div>
              </div>

              {/* Title */}
              <p className="text-sm font-medium leading-snug line-clamp-2">{doc.title}</p>

              {/* Type + expiry row */}
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                {doc.typeNameEn && (
                  <span className="text-[10px] text-muted-foreground">{doc.typeNameEn}</span>
                )}
                {doc.expiryDate && (
                  <DmsExpiryBadge expiryDate={doc.expiryDate} className="text-[9px]" />
                )}
              </div>

              {/* Content excerpt (D3) */}
              {doc.contentExcerpt && (
                <p className="mt-1 text-[10px] text-muted-foreground leading-relaxed line-clamp-2 italic">
                  {highlightExcerpt(doc.contentExcerpt, query)}
                </p>
              )}
            </button>
          );
        })}

        {/* Infinite scroll sentinel + load-more indicator */}
        <div ref={sentinelRef} className="py-3 flex items-center justify-center">
          {isLoadingMore && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
          {!hasMore && rows.length > 0 && (
            <span className="text-[10px] text-muted-foreground">All results loaded</span>
          )}
        </div>
      </div>
    </div>
  );
}
