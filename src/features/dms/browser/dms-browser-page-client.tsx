"use client";

import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {useQueryClient} from "@tanstack/react-query";
import type {AuthContext} from "@/lib/rbac/check";
import {dmsBrowserIdentity, dmsBrowserRowSchema, dmsBrowserSearchCriteria, type DmsBrowserResponse} from "@/lib/reads/dms-browser-schema";
import {dmsBrowserPrefix, useDmsBrowserRead, useDmsBrowserSearch} from "@/hooks/use-dms-browser";
import {DmsBrowserSearchBar} from "./dms-browser-search-bar";
import {DmsBrowserFilterBar, DEFAULT_FILTERS, type DmsBrowserActiveFilters} from "./dms-browser-filter-bar";
import {DmsBrowserResultsList} from "./dms-browser-results-list";
import {DmsBrowserPreview} from "./dms-browser-preview";
import {DmsBrowserResizeHandle} from "./dms-browser-resize-handle";
import {DmsBrowserIntentBanner} from "./dms-browser-intent-banner";
import type {DmsBrowserDocument} from "@/server/actions/dms/browser";
import {askDmsDocumentsQuestion} from "@/server/actions/dms/ai-search";
import {semanticSearchDmsDocuments} from "@/server/actions/dms/semantic-search";
import type {DmsAiSearchResult, DmsSemanticSearchResult, DmsSearchIntent} from "@/lib/dms/ai/types";

const COL_WIDTH_KEY = "dms-browser-col-widths-v1", COL_DEFAULT = 380, COL_MIN = 280, COL_MAX = 640;
const PAGE_SIZE = 25, AI_WORD_THRESHOLD = 4;
function loadColWidth(): number {
  if (typeof window === "undefined") return COL_DEFAULT;
  try {const saved = JSON.parse(localStorage.getItem(COL_WIDTH_KEY) ?? "null"); if (typeof saved === "number" && saved >= COL_MIN && saved <= COL_MAX) return saved;} catch { /* Display preference only. */ }
  return COL_DEFAULT;
}
function suggestion(r: DmsAiSearchResult | DmsSemanticSearchResult, excerpt: string | null): DmsBrowserDocument {
  return {...dmsBrowserRowSchema.parse({id: r.documentId, documentNo: r.documentNo, title: r.title, typeNameEn: null, typeCode: null,
    status: "active", issueDate: null, expiryDate: r.expiryDate ?? null, matchSource: "metadata", contentExcerpt: excerpt?.slice(0, 120) ?? null}), files: []};
}
function ReadNotice({children, retry, label}: {children: React.ReactNode; retry?: () => void; label?: string}) {
  return <div role="alert" className="p-4 text-sm space-y-2"><p>{children}</p>{retry && <button className="underline" onClick={retry}>{label}</button>}</div>;
}
function isAvailableFilePage(value: DmsBrowserResponse | undefined): value is Extract<DmsBrowserResponse, {document: unknown}> {
  return value?.availability === "available" && "document" in value;
}

/** A changed account or assignment scope remounts every selected record and
 * provider callback. Query caches are independently retired by the read hooks. */
export function DmsBrowserPageClient({authContext}: {authContext: AuthContext}) {
  return <BrowserSession key={dmsBrowserIdentity(authContext)} authContext={authContext}/>;
}
function BrowserSession({authContext}: {authContext: AuthContext}) {
  const queryClient = useQueryClient(), identity = dmsBrowserIdentity(authContext);
  const [leftWidth, setLeftWidth] = useState(loadColWidth);
  const isDragging = useRef(false), dragStartX = useRef(0), dragStartWidth = useRef(0);
  const handleResizeMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    isDragging.current = true; dragStartX.current = e.clientX; dragStartWidth.current = leftWidth;
    document.body.style.userSelect = "none"; document.body.style.cursor = "col-resize";
  }, [leftWidth]);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {if (isDragging.current) setLeftWidth(Math.min(COL_MAX, Math.max(COL_MIN, dragStartWidth.current + e.clientX - dragStartX.current)));};
    const onUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false; document.body.style.userSelect = ""; document.body.style.cursor = "";
      setLeftWidth(w => {try {localStorage.setItem(COL_WIDTH_KEY, JSON.stringify(w));} catch { /* Optional display preference. */ } return w;});
    };
    document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp);
    return () => {document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); if (isDragging.current) {document.body.style.userSelect = ""; document.body.style.cursor = "";}};
  }, []);

  const [currentQuery, setCurrentQuery] = useState(""), [filters, setFilters] = useState<DmsBrowserActiveFilters>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<number | null>(null), [fileOffset, setFileOffset] = useState(0), [accessDenied, setAccessDenied] = useState(false);
  const [aiIntent, setAiIntent] = useState<DmsSearchIntent | null>(null), [aiRows, setAiRows] = useState<DmsBrowserDocument[]>([]), [semanticRows, setSemanticRows] = useState<DmsBrowserDocument[]>([]);
  const [isAiSearching, setIsAiSearching] = useState(false), [providerFailed, setProviderFailed] = useState(false);
  const epoch = useRef(0), mounted = useRef(true);
  useEffect(() => {mounted.current = true; return () => {mounted.current = false;};}, []);
  const onDenied = useCallback(() => {
    epoch.current++; setAccessDenied(true); setSelectedId(null); setAiRows([]); setSemanticRows([]); setAiIntent(null); setIsAiSearching(false);
    const queryKey = dmsBrowserPrefix(identity); void queryClient.cancelQueries({queryKey}); queryClient.removeQueries({queryKey});
  }, [identity, queryClient]);
  const hasQuery = currentQuery.trim().length > 0 || Object.values(filters).some(v => Array.isArray(v) ? v.length > 0 : !!v);
  const parsed = dmsBrowserSearchCriteria.safeParse({operation: "search", query: currentQuery, documentTypeIds: filters.documentTypeIds, status: filters.status,
    issueDateFrom: filters.issueDateFrom, issueDateTo: filters.issueDateTo, linkedEntityType: filters.linkedEntityType, limit: PAGE_SIZE});
  const types = useDmsBrowserRead(authContext, {operation: "types"}, {enabled: !accessDenied, onDenied});
  const search = useDmsBrowserSearch(authContext, parsed.success ? parsed.data : dmsBrowserSearchCriteria.parse({operation: "search"}), {enabled: !accessDenied && hasQuery && parsed.success, onDenied});
  const visible = !accessDenied && parsed.success && search.data?.availability === "available";
  const rows: DmsBrowserDocument[] = visible ? search.data!.rows.map(row => ({...row, files: []})) : [];
  const seen = new Set(rows.map(row => row.id));
  const additions = visible ? [...aiRows, ...semanticRows].filter(row => {if (seen.has(row.id)) return false; seen.add(row.id); return true;}) : [];
  const selected = [...rows, ...additions].find(row => row.id === selectedId);
  const files = useDmsBrowserRead(authContext, {operation: "files", documentId: selectedId ?? 1, offset: fileOffset, limit: PAGE_SIZE}, {enabled: !!selected && visible, onDenied});
  const fileResponse = files.data;
  const filePage = isAvailableFilePage(fileResponse) ? fileResponse : undefined;
  const selectedDocumentId = selected?.id ?? null;
  const selectedDoc: DmsBrowserDocument | null = useMemo(() => selectedDocumentId !== null && filePage
    ? {...filePage.document, files: filePage.rows} : null, [selectedDocumentId, filePage]);
  // Retain the choice while a refresh is pending, but retire it once the fresh
  // complete result no longer contains it. Reappearance must not auto-open it.
  if (selectedId !== null && visible && !selected) {setSelectedId(null); setFileOffset(0);}

  // Existing paid-provider actions/thresholds are unchanged. They are additive
  // top-N suggestions, never part of the exact metadata/content total. No retry.
  const runProviders = useCallback((query: string, active: DmsBrowserActiveFilters, token: number) => {
    const current = () => mounted.current && epoch.current === token;
    if (query.trim().split(/\s+/).filter(Boolean).length >= AI_WORD_THRESHOLD) {
      setIsAiSearching(true);
      void askDmsDocumentsQuestion(query).then(result => {
        if (!current()) return;
        if (result.success && result.data) {setAiRows(result.data.results.map(row => suggestion(row, row.matchReason || row.contentSnippet))); setAiIntent(result.data.intent);} else setProviderFailed(true);
      }).catch(() => {if (current()) setProviderFailed(true);}).finally(() => {if (current()) setIsAiSearching(false);});
    }
    if (active.semanticOn && query.trim()) {
      void semanticSearchDmsDocuments(query).then(result => {
        if (!current()) return;
        if (result.success && result.data) setSemanticRows(result.data.map(row => suggestion(row, row.aiSummarySnippet || row.matchReason))); else setProviderFailed(true);
      }).catch(() => {if (current()) setProviderFailed(true);});
    }
  }, []);
  const change = useCallback((query: string, active: DmsBrowserActiveFilters) => {
    const token = ++epoch.current;
    setCurrentQuery(query); setFilters(active); setSelectedId(null); setFileOffset(0); setAiRows([]); setSemanticRows([]); setAiIntent(null); setIsAiSearching(false); setProviderFailed(false);
    if (!accessDenied && query.trim().length <= 200) runProviders(query, active, token);
  }, [accessDenied, runProviders]);
  const selectDocument = (row: DmsBrowserDocument) => {setSelectedId(row.id); setFileOffset(0);};
  const typeRows = types.data?.availability === "available" ? types.data.rows : [];

  return <div className="flex h-[calc(100vh-190px)] min-h-[480px] rounded-lg border overflow-hidden bg-background" suppressHydrationWarning>
    <div className="flex flex-col min-h-0 border-r border-border/60 overflow-hidden shrink-0" style={{width: leftWidth}}>
      <div className="shrink-0">
        <DmsBrowserSearchBar onSearch={query => change(query, filters)} isLoading={search.isFetching && !search.isFetchingNextPage} isAiSearching={isAiSearching}/>
        {types.isError ? <ReadNotice retry={types.retry} label="Retry document types">Document types could not be loaded. Existing search criteria have been retained.</ReadNotice>
          : types.data?.availability === "too_large" ? <ReadNotice>Too many document types to verify safely. Contact your administrator.</ReadNotice>
          : types.data?.availability === "available" ? <DmsBrowserFilterBar docTypes={typeRows} filters={filters} onChange={active => change(currentQuery, active)}/>
          : !accessDenied && <p role="status" className="text-xs text-muted-foreground">Loading document filters…</p>}
      </div>
      {accessDenied || search.denied || types.denied ? <ReadNotice>Access could not be verified. Previous records and previews have been cleared. Reload or sign in again.</ReadNotice>
        : !parsed.success ? <ReadNotice>Search criteria are invalid. Use up to 200 characters and valid dates.</ReadNotice>
        : hasQuery && search.failed ? <ReadNotice retry={search.retry} label="Retry search">Documents could not be completely loaded. Please retry.</ReadNotice>
        : search.data?.availability === "too_large" ? <ReadNotice>Too many matching records to verify safely. Refine your search or filters; no partial results are shown.</ReadNotice>
        : <>
          <div className="flex-1 min-h-0 overflow-hidden"><DmsBrowserResultsList rows={rows} total={search.data?.totalCount ?? 0} selectedId={selectedId} onSelect={selectDocument}
            isLoading={hasQuery && !search.data && !search.failed} isLoadingMore={search.isFetchingNextPage}
            hasMore={visible && search.hasNextPage} onLoadMore={search.loadMore} query={currentQuery} hasQuery={hasQuery}/></div>
          {visible && (aiIntent || isAiSearching) && <DmsBrowserIntentBanner intent={aiIntent} isLoading={isAiSearching} resultCount={aiRows.length}/>}
          {visible && (additions.length > 0 || providerFailed) && <section aria-label="Limited search suggestions" className="border-t border-border/60 p-3 max-h-48 overflow-y-auto space-y-2">
            <p className="text-xs text-muted-foreground">AI and semantic suggestions are limited to the provider’s top 25 results each. They are not an exact total and may use different filters.</p>
            {providerFailed && <p role="status" className="text-xs">Some suggestions could not be loaded. The exact search above is unchanged.</p>}
            {additions.map(row => <button key={row.id} onClick={() => selectDocument(row)} className="block text-left text-sm w-full rounded p-2 hover:bg-muted">{row.title}<span className="block text-xs text-muted-foreground">{row.contentExcerpt}</span></button>)}
          </section>}
        </>}
    </div>
    <DmsBrowserResizeHandle onMouseDown={handleResizeMouseDown}/>
    <div className="flex-1 min-w-0 min-h-0 flex flex-col">
      {!visible || !selected ? <DmsBrowserPreview document={null}/>
        : files.isError ? <ReadNotice retry={files.retry} label="Retry files">Document files could not be loaded. Please retry.</ReadNotice>
        : fileResponse?.availability === "unavailable" ? <ReadNotice>This document is no longer available. Search again or choose another result.</ReadNotice>
        : !filePage ? <div role="status" className="p-4 text-sm">Loading selected document files…</div>
        : fileOffset > 0 && filePage.rows.length === 0 ? <ReadNotice retry={() => setFileOffset(0)} label="First files page">This file page is no longer available. Return to the first page.</ReadNotice>
        : <>
          <div className="flex-1 min-h-0"><DmsBrowserPreview document={selectedDoc} canPreview={filePage.canPreview} canDownload={filePage.canDownload} totalFiles={filePage.totalCount}/></div>
          {filePage.totalCount > PAGE_SIZE && <nav aria-label="Selected document file pages" className="flex items-center justify-between border-t p-2 text-sm">
            <button disabled={fileOffset === 0} onClick={() => setFileOffset(n => Math.max(0, n - PAGE_SIZE))}>Previous files</button>
            <span>{fileOffset + 1}–{fileOffset + filePage.rows.length} of {filePage.totalCount} files</span>
            <button disabled={fileOffset + PAGE_SIZE >= filePage.totalCount} onClick={() => setFileOffset(n => n + PAGE_SIZE)}>Next files</button>
          </nav>}
        </>}
    </div>
  </div>;
}
