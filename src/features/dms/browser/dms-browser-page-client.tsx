"use client";

/**
 * DMS.BROWSER.1 — Page shell client component.
 *
 * Orchestrates:
 *  - 2-column resizable layout (left = search+results, right = preview)
 *  - Layer 1+2 search via searchDmsBrowser server action
 *  - Layer 3 AI intent search via askDmsDocumentsQuestion (≥4 words)
 *  - Layer 4 semantic search via semanticSearchDmsDocuments (when toggle on)
 *  - Column width persistence (localStorage)
 *  - Infinite scroll
 */

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { DmsBrowserSearchBar } from "./dms-browser-search-bar";
import { DmsBrowserFilterBar, DEFAULT_FILTERS } from "./dms-browser-filter-bar";
import type { DmsBrowserActiveFilters } from "./dms-browser-filter-bar";
import { DmsBrowserResultsList } from "./dms-browser-results-list";
import { DmsBrowserPreview } from "./dms-browser-preview";
import { DmsBrowserResizeHandle } from "./dms-browser-resize-handle";
import {
  searchDmsBrowser,
  type DmsBrowserDocument,
  type DmsBrowserDocType,
} from "@/server/actions/dms/browser";
import { askDmsDocumentsQuestion } from "@/server/actions/dms/ai-search";
import { semanticSearchDmsDocuments } from "@/server/actions/dms/semantic-search";
import type { DmsAiSearchResult, DmsSearchIntent } from "@/lib/dms/ai/types";
import type { DmsSemanticSearchResult } from "@/lib/dms/ai/types";
import { DmsBrowserIntentBanner } from "./dms-browser-intent-banner";

// ── Layout constants ────────────────────────────────────────────────────────────
const COL_WIDTH_KEY = "dms-browser-col-widths-v1";
const COL_DEFAULT = 380;
const COL_MIN = 280;
const COL_MAX = 640;
const PAGE_SIZE = 25;
const AI_WORD_THRESHOLD = 4; // D2: fire AI intent search at ≥4 words

function loadColWidth(): number {
  if (typeof window === "undefined") return COL_DEFAULT;
  try {
    const saved = JSON.parse(localStorage.getItem(COL_WIDTH_KEY) ?? "null");
    if (typeof saved === "number" && saved >= COL_MIN && saved <= COL_MAX) return saved;
  } catch { /* ignore */ }
  return COL_DEFAULT;
}

// Convert DmsAiSearchResult rows to DmsBrowserDocument shape for merging
function aiResultToBrowserDoc(r: DmsAiSearchResult): DmsBrowserDocument {
  return {
    id: r.documentId,
    documentNo: r.documentNo,
    title: r.title,
    typeNameEn: null,
    typeCode: null,
    status: "active",
    issueDate: null,
    expiryDate: r.expiryDate ?? null,
    matchSource: "metadata" as const,
    contentExcerpt: r.matchReason ? r.matchReason.substring(0, 120) : (r.contentSnippet ?? null),
    files: [],
  };
}

function semanticResultToBrowserDoc(r: DmsSemanticSearchResult): DmsBrowserDocument {
  return {
    id: r.documentId,
    documentNo: r.documentNo,
    title: r.title,
    typeNameEn: null,
    typeCode: null,
    status: "active",
    issueDate: null,
    expiryDate: r.expiryDate ?? null,
    matchSource: "metadata" as const,
    contentExcerpt: r.aiSummarySnippet ? r.aiSummarySnippet.substring(0, 120) : (r.matchReason ?? null),
    files: [],
  };
}

interface DmsBrowserPageClientProps {
  docTypes: DmsBrowserDocType[];
}

export function DmsBrowserPageClient({ docTypes }: DmsBrowserPageClientProps) {
  // ── Column resize state ────────────────────────────────────────────────────
  const [leftWidth, setLeftWidth] = useState<number>(() => loadColWidth());
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = leftWidth;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }, [leftWidth]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = e.clientX - dragStartX.current;
      const newWidth = Math.min(COL_MAX, Math.max(COL_MIN, dragStartWidth.current + delta));
      setLeftWidth(newWidth);
    };
    const onUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      setLeftWidth((w) => {
        localStorage.setItem(COL_WIDTH_KEY, JSON.stringify(w));
        return w;
      });
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

  // ── Search state ───────────────────────────────────────────────────────────
  const [currentQuery, setCurrentQuery] = useState("");
  const [filters, setFilters] = useState<DmsBrowserActiveFilters>(DEFAULT_FILTERS);
  const [rows, setRows] = useState<DmsBrowserDocument[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<DmsBrowserDocument | null>(null);

  const [isPending, startTransition] = useTransition();
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isAiSearching, setIsAiSearching] = useState(false);
  const [aiIntent, setAiIntent] = useState<DmsSearchIntent | null>(null);

  // ── Merged rows: base (L1/L2) + AI additions + semantic additions ──────────
  // We keep a stable ID set to deduplicate across layers
  const baseIdSet = useRef(new Set<number>());

  const runBaseSearch = useCallback(
    (query: string, activeFilters: DmsBrowserActiveFilters, newOffset: number, append: boolean) => {
      startTransition(async () => {
        const result = await searchDmsBrowser({
          query,
          documentTypeIds: activeFilters.documentTypeIds,
          status: activeFilters.status || undefined,
          issueDateFrom: activeFilters.issueDateFrom || undefined,
          issueDateTo: activeFilters.issueDateTo || undefined,
          linkedEntityType: activeFilters.linkedEntityType || undefined,
          offset: newOffset,
          limit: PAGE_SIZE,
        });

        if (!result.success || !result.data) {
          if (!append) {
            setRows([]);
            setTotal(0);
            setHasMore(false);
          }
          return;
        }

        const { rows: newRows, total: newTotal } = result.data;

        if (append) {
          setRows((prev) => {
            const merged = [...prev];
            for (const r of newRows) {
              if (!baseIdSet.current.has(r.id)) {
                baseIdSet.current.add(r.id);
                merged.push(r);
              }
            }
            return merged;
          });
        } else {
          baseIdSet.current = new Set(newRows.map((r) => r.id));
          setRows(newRows);
          setTotal(newTotal);
        }
        setHasMore(newOffset + PAGE_SIZE < newTotal);
        setOffset(newOffset + PAGE_SIZE);
      });
    },
    []
  );

  const runAiSearch = useCallback(
    async (query: string) => {
      setIsAiSearching(true);
      setAiIntent(null);
      try {
        const result = await askDmsDocumentsQuestion(query);
        if (result.success && result.data) {
          // Store the extracted intent for the banner
          setAiIntent(result.data.intent);

          const aiRows = result.data.results.map(aiResultToBrowserDoc);
          setRows((prev) => {
            const merged = [...prev];
            for (const r of aiRows) {
              if (!baseIdSet.current.has(r.id)) {
                baseIdSet.current.add(r.id);
                merged.push(r);
              }
            }
            return merged;
          });
          setTotal((t) => t + aiRows.filter((r) => !baseIdSet.current.has(r.id)).length);
        }
      } catch {
        // AI search failure is silent — other layers still show results
      } finally {
        setIsAiSearching(false);
      }
    },
    []
  );

  const runSemanticSearch = useCallback(
    async (query: string) => {
      try {
        const result = await semanticSearchDmsDocuments(query);
        if (result.success && result.data) {
          const semRows = result.data.map(semanticResultToBrowserDoc);
          setRows((prev) => {
            const merged = [...prev];
            for (const r of semRows) {
              if (!baseIdSet.current.has(r.id)) {
                baseIdSet.current.add(r.id);
                merged.push(r);
              }
            }
            return merged;
          });
        }
      } catch {
        // Semantic search failure is silent
      }
    },
    []
  );

  // ── Main search trigger ────────────────────────────────────────────────────
  const handleSearch = useCallback(
    (query: string) => {
      setCurrentQuery(query);
      setSelectedDoc(null);
      setOffset(0);
      setAiIntent(null); // clear previous intent banner on new search

      if (!query.trim() && Object.values(filters).every((v) => !v || (Array.isArray(v) && v.length === 0))) {
        setRows([]);
        setTotal(0);
        setHasMore(false);
        return;
      }

      // Reset and fire base search
      runBaseSearch(query, filters, 0, false);

      // Layer 3: AI intent (≥4 words)
      const wordCount = query.trim().split(/\s+/).filter(Boolean).length;
      if (wordCount >= AI_WORD_THRESHOLD) {
        void runAiSearch(query);
      }

      // Layer 4: semantic (only when toggle is on)
      if (filters.semanticOn && query.trim()) {
        void runSemanticSearch(query);
      }
    },
    [filters, runBaseSearch, runAiSearch, runSemanticSearch]
  );

  // Re-run search when filters change (but query stays the same)
  const handleFiltersChange = useCallback(
    (newFilters: DmsBrowserActiveFilters) => {
      setFilters(newFilters);
      setSelectedDoc(null);
      setOffset(0);

      if (
        !currentQuery.trim() &&
        Object.values(newFilters).every((v) => !v || (Array.isArray(v) && v.length === 0))
      ) {
        setRows([]);
        setTotal(0);
        setHasMore(false);
        return;
      }

      runBaseSearch(currentQuery, newFilters, 0, false);

      const wordCount = currentQuery.trim().split(/\s+/).filter(Boolean).length;
      if (wordCount >= AI_WORD_THRESHOLD) {
        void runAiSearch(currentQuery);
      }
      if (newFilters.semanticOn && currentQuery.trim()) {
        void runSemanticSearch(currentQuery);
      }
    },
    [currentQuery, runBaseSearch, runAiSearch, runSemanticSearch]
  );

  // ── Infinite scroll load more ──────────────────────────────────────────────
  const handleLoadMore = useCallback(() => {
    if (!hasMore || isLoadingMore || isPending) return;
    setIsLoadingMore(true);
    startTransition(async () => {
      const result = await searchDmsBrowser({
        query: currentQuery,
        documentTypeIds: filters.documentTypeIds,
        status: filters.status || undefined,
        issueDateFrom: filters.issueDateFrom || undefined,
        issueDateTo: filters.issueDateTo || undefined,
        linkedEntityType: filters.linkedEntityType || undefined,
        offset,
        limit: PAGE_SIZE,
      });

      if (result.success && result.data) {
        const { rows: moreRows, total: newTotal } = result.data;
        setRows((prev) => {
          const merged = [...prev];
          for (const r of moreRows) {
            if (!baseIdSet.current.has(r.id)) {
              baseIdSet.current.add(r.id);
              merged.push(r);
            }
          }
          return merged;
        });
        setTotal(newTotal);
        setHasMore(offset + PAGE_SIZE < newTotal);
        setOffset((o) => o + PAGE_SIZE);
      } else if (!result.success) {
        toast.error("Failed to load more results");
      }
      setIsLoadingMore(false);
    });
  }, [hasMore, isLoadingMore, isPending, currentQuery, filters, offset]);

  const hasQuery = !!currentQuery.trim() || Object.values(filters).some(
    (v) => v && !(Array.isArray(v) && v.length === 0) && v !== false
  );

  return (
    <div
      className="flex h-[calc(100vh-190px)] min-h-[480px] rounded-lg border overflow-hidden bg-background"
      suppressHydrationWarning
    >
      {/* LEFT COLUMN: search + filters + results */}
      <div
        className="flex flex-col border-r border-border/60 overflow-hidden shrink-0"
        style={{ width: leftWidth }}
      >
        <DmsBrowserSearchBar
          onSearch={handleSearch}
          isLoading={isPending}
          isAiSearching={isAiSearching}
        />

        <DmsBrowserFilterBar
          docTypes={docTypes}
          filters={filters}
          onChange={handleFiltersChange}
        />

        {/* AI intent banner — only visible after AI search fired */}
        {(aiIntent ?? isAiSearching) && (
          <div className="border-b border-border/40 bg-slate-50/60 px-3">
            <DmsBrowserIntentBanner
              intent={aiIntent}
              resultCount={aiIntent ? rows.length : null}
              isLoading={isAiSearching}
            />
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-hidden">
          <DmsBrowserResultsList
            rows={rows}
            total={total}
            selectedId={selectedDoc?.id ?? null}
            onSelect={setSelectedDoc}
            isLoading={isPending && rows.length === 0}
            isLoadingMore={isLoadingMore}
            hasMore={hasMore}
            onLoadMore={handleLoadMore}
            query={currentQuery}
            isAiSearching={isAiSearching}
            hasQuery={hasQuery}
          />
        </div>
      </div>

      {/* Resize handle */}
      <DmsBrowserResizeHandle onMouseDown={handleResizeMouseDown} />

      {/* RIGHT COLUMN: preview */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <DmsBrowserPreview document={selectedDoc} />
      </div>
    </div>
  );
}
