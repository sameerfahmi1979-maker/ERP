"use client";
import {useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent} from "react";
import {useQueryClient} from "@tanstack/react-query";
import type {ColumnFiltersState, PaginationState, SortingState, Updater} from "@tanstack/react-table";
import type {AuthContext} from "@/lib/rbac/check";
import {hasPermission} from "@/lib/rbac/scope";
import {Button} from "@/components/ui/button";
import {usePersistentUiState} from "@/hooks/use-persistent-ui-state";
import {useHrDocumentBrowser, hrBrowserPrefix, retireHrBrowserSeed, type HrBrowserSeed} from "@/hooks/use-hr-document-browser";
import {hrDocumentBrowserIdentity, hrBrowserDocumentsCriteria, hrBrowserFilesPage, type HrBrowserDocument} from "@/lib/reads/hr-document-browser-schema";
import type {ERPTableServerRead} from "@/components/erp/table/erp-table-types";
import {HrDocBrowserNavigator} from "./hr-doc-browser-navigator";
import {HrDocBrowserDocList} from "./hr-doc-browser-doc-list";
import {HrDocBrowserPreview} from "./hr-doc-browser-preview";
import {HrDocBrowserResizeHandle} from "./hr-doc-browser-resize-handle";
import {HrBrowserPagination, HrBrowserReadState} from "./hr-doc-browser-read-state";
import type {BrowserEntitySelection} from "./hr-doc-browser-types";

const DEFAULT_WIDTHS = {nav: 280, list: 360}, limits = {nav: [200, 420], list: [260, 560]} as const;
type Props = {authContext: AuthContext; initialRead?: HrBrowserSeed};
export function HrDocBrowserPageClient(props: Props) {
  const identity = hrDocumentBrowserIdentity(props.authContext), qc = useQueryClient(), previous = useRef(identity);
  const [deniedIdentity, setDeniedIdentity] = useState<string | null>(null);
  const allowed = hasPermission(props.authContext, "hr.employees.view") && (hasPermission(props.authContext, "dms.documents.view") || hasPermission(props.authContext, "dms.admin"));
  const denied = !allowed || deniedIdentity === identity;
  const onDenied = useCallback(() => {retireHrBrowserSeed(props.initialRead); setDeniedIdentity(identity);}, [identity, props.initialRead]);
  useEffect(() => {
    if (previous.current !== identity) {const old = hrBrowserPrefix(previous.current); void qc.cancelQueries({queryKey: old}); qc.removeQueries({queryKey: old}); previous.current = identity;}
    if (denied) {retireHrBrowserSeed(props.initialRead); const old = hrBrowserPrefix(identity); void qc.cancelQueries({queryKey: old}); qc.removeQueries({queryKey: old});}
  }, [identity, denied, qc, props.initialRead]);
  if (denied) return <p role="alert">Access to a selected record or the document browser changed. Reopen this page to verify current access. Previous records and previews have been cleared.</p>;
  return <BrowserSession key={identity} {...props} onDenied={onDenied} />;
}
function BrowserSession({authContext, initialRead, onDenied}: Props & {onDenied: () => void}) {
  const [selection, setSelection] = useState<BrowserEntitySelection | null>(null);
  const [widths, setWidths] = usePersistentUiState("hr-document-browser:widths:v2", DEFAULT_WIDTHS);
  const dragCleanup = useRef<(() => void) | null>(null), qc = useQueryClient(), identity = hrDocumentBrowserIdentity(authContext);
  useEffect(() => () => {dragCleanup.current?.();}, []);
  const resize = useCallback((column: keyof typeof DEFAULT_WIDTHS, value: number) => {const [min, max] = limits[column]; setWidths(current => ({...current, [column]: Math.min(max, Math.max(min, value))}));}, [setWidths]);
  const startDrag = (column: keyof typeof DEFAULT_WIDTHS, event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault(); dragCleanup.current?.(); const x = event.clientX, w = widths[column];
    const move = (e: globalThis.MouseEvent) => resize(column, w + e.clientX - x);
    const stop = () => {document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", stop); dragCleanup.current = null;};
    dragCleanup.current = stop; document.addEventListener("mousemove", move); document.addEventListener("mouseup", stop);
  };
  const style = {"--hr-nav-width": widths.nav + "px", "--hr-list-width": widths.list + "px"} as CSSProperties;
  return <div className="min-w-0 space-y-3">
    <div className="flex gap-2 items-center justify-end"><Button variant="outline" size="sm" onClick={() => {void qc.invalidateQueries({queryKey: hrBrowserPrefix(identity)}, {cancelRefetch: false});}}>Refresh browser</Button>
      <Button className="hidden xl:inline-flex" variant="outline" size="sm" onClick={() => setWidths(DEFAULT_WIDTHS)}>Reset panel widths</Button></div>
    <div style={style} className="grid min-w-0 gap-3 xl:gap-0 xl:h-[calc(100dvh-240px)] xl:min-h-[480px] xl:grid-cols-[minmax(200px,var(--hr-nav-width))_6px_minmax(260px,var(--hr-list-width))_6px_minmax(240px,1fr)] rounded-sm border bg-background">
      <section aria-label="Employees and dependents" className="min-w-0 h-80 xl:h-full overflow-hidden"><HrDocBrowserNavigator authContext={authContext} seed={initialRead} selection={selection} onSelect={setSelection} onDenied={onDenied} /></section>
      <HrDocBrowserResizeHandle label="Employee panel width" value={widths.nav} min={200} max={420} onResize={value => resize("nav", value)} onMouseDown={event => startDrag("nav", event)} />
      {selection ? <DocumentsSession key={`${selection.type}:${selection.id}`} authContext={authContext} selection={selection} onDenied={onDenied} width={widths.list} resize={value => resize("list", value)} startDrag={event => startDrag("list", event)} />
        : <><section aria-label="Selected employee documents" className="min-w-0 h-96 xl:h-full p-4 text-sm text-muted-foreground">Select an employee or dependent to see their documents.</section>
          <HrDocBrowserResizeHandle label="Documents panel width" value={widths.list} min={260} max={560} onResize={value => resize("list", value)} onMouseDown={event => startDrag("list", event)} />
          <section aria-label="Document preview" className="min-w-0 h-96 xl:h-full p-4 text-sm text-muted-foreground">Select a document from the list to preview it here.</section></>}
    </div>
  </div>;
}
const resolve = <T,>(update: Updater<T>, previous: T) => typeof update === "function" ? (update as (p: T) => T)(previous) : update;
function DocumentsSession({authContext, selection, onDenied, width, resize, startDrag}: {authContext: AuthContext; selection: BrowserEntitySelection; onDenied: () => void; width: number; resize: (value: number) => void; startDrag: (event: MouseEvent<HTMLDivElement>) => void}) {
  const [pagination, setPagination] = useState<PaginationState>({pageIndex: 0, pageSize: 25}), [sorting, setSorting] = useState<SortingState>([{id: "expiryDate", desc: false}]);
  const [search, setSearch] = useState(""), [debounced, setDebounced] = useState(""), [filters, setFilters] = useState<ColumnFiltersState>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  useEffect(() => {const timer = setTimeout(() => setDebounced(search), 250); return () => clearTimeout(timer);}, [search]);
  const parsed = hrBrowserDocumentsCriteria.safeParse({operation: "documents", entityType: selection.type, entityId: selection.id, page: pagination.pageIndex + 1, pageSize: pagination.pageSize,
    search: debounced, sortKey: sorting[0]?.id ?? "expiryDate", sortDir: sorting[0]?.desc ? "desc" : "asc", columnFilters: Object.fromEntries(filters.map(f => [f.id, String(f.value)]))});
  // Table callbacks only emit the allowlisted fields. Invalid persisted/adaptor
  // input must not query a broader fallback result or become a successful zero.
  const criteria = parsed.success ? parsed.data : hrBrowserDocumentsCriteria.parse({operation: "documents", entityType: selection.type, entityId: selection.id});
  const read = useHrDocumentBrowser(authContext, criteria, {onDenied, enabled: parsed.success});
  const data = parsed.success && search === debounced ? read.data : undefined, rows = data && "rows" in data ? data.rows : [];
  const total = data && "totalCount" in data ? data.totalCount : null, oversized = data && "availability" in data && data.availability === "too_large";
  const busy = read.isFetching || search !== debounced, selected = rows.find(row => row.key === selectedKey) ?? rows[0] ?? null;
  if (total !== null && pagination.pageIndex > Math.max(0, Math.ceil(total / pagination.pageSize) - 1)) setPagination(value => ({...value, pageIndex: Math.max(0, Math.ceil(total / value.pageSize) - 1)}));
  const serverRead: ERPTableServerRead<HrBrowserDocument> = {
    pagination, sorting, globalFilter: search, columnFilters: filters, totalCount: total,
    onPaginationChange: update => setPagination(value => {const next = resolve(update, value); return next.pageSize === value.pageSize ? next : {...next, pageIndex: 0};}),
    onSortingChange: update => {setSorting(old => resolve(update, old).slice(0, 1)); setPagination(old => ({...old, pageIndex: 0}));},
    onGlobalFilterChange: update => {setSearch(old => resolve(update, old)); setPagination(old => ({...old, pageIndex: 0}));},
    onColumnFiltersChange: update => {setFilters(old => resolve(update, old)); setPagination(old => ({...old, pageIndex: 0}));},
    filters: [{id: "title", label: "Document", type: "text"}, {id: "typeNameEn", label: "Type", type: "text"}, {id: "source", label: "Source", type: "text"}],
  };
  return <>
    <section aria-label="Selected employee documents" className="min-w-0 h-96 xl:h-full overflow-auto" aria-busy={busy}>
      <HrBrowserReadState noun="documents" busy={busy} failed={read.isError || !parsed.success} oversized={oversized} retry={read.retry} />
      <HrDocBrowserDocList entity={selection} documents={rows} serverRead={serverRead} isLoading={busy} selectedIndex={selected ? rows.indexOf(selected) : null} onSelect={index => setSelectedKey(rows[index]?.key ?? null)} />
    </section>
    <HrDocBrowserResizeHandle label="Documents panel width" value={width} min={260} max={560} onResize={resize} onMouseDown={startDrag} />
    <section aria-label="Document preview" className="min-w-0 h-96 xl:h-full overflow-auto">
      {selected ? <FilesSession key={selected.key} authContext={authContext} entity={selection} document={selected} onDenied={onDenied} /> : <p className="p-4 text-sm text-muted-foreground">Select an available document to preview it here.</p>}
    </section>
  </>;
}
function FilesSession({authContext, entity, document, onDenied}: {authContext: AuthContext; entity: BrowserEntitySelection; document: HrBrowserDocument; onDenied: () => void}) {
  if (document.id === null) return <HrDocBrowserPreview entity={entity} document={document} files={[]} totalFiles={0} canPreview={false} canDownload={false} />;
  return <DmsFiles authContext={authContext} entity={entity} document={document} documentId={document.id} onDenied={onDenied} />;
}
function DmsFiles({authContext, entity, document, documentId, onDenied}: {authContext: AuthContext; entity: BrowserEntitySelection; document: HrBrowserDocument; documentId: number; onDenied: () => void}) {
  const [page, setPage] = useState(1);
  const read = useHrDocumentBrowser(authContext, {operation: "files", entityType: entity.type, entityId: entity.id, documentId, page, pageSize: 25}, {onDenied});
  const payload = read.data;
  const unavailable = payload?.availability === "unavailable", available = hrBrowserFilesPage.safeParse(payload), data = available.success ? available.data : undefined;
  // A confirmed inaccessible selected record retires the readonly browser
  // session (not an unrelated form/draft). No stale metadata or iframe survives.
  useEffect(() => {if (unavailable) onDenied();}, [unavailable, onDenied]);
  if (data && page > Math.max(1, Math.ceil(data.totalCount / 25))) setPage(Math.max(1, Math.ceil(data.totalCount / 25)));
  return <div className="flex flex-col h-full"><HrBrowserReadState noun="files" busy={read.isFetching} failed={read.isError} retry={read.retry} />
    {data && <><div className="flex-1 min-h-0"><HrDocBrowserPreview entity={entity} document={document} files={data.rows} totalFiles={data.totalCount} canPreview={data.canPreview} canDownload={data.canDownload} /></div>
      {data.totalCount > 25 && <HrBrowserPagination label="files" page={page} pageSize={25} total={data.totalCount} busy={read.isFetching} onPage={setPage} />}</>}
  </div>;
}
