"use client";
import { LoadedListTools, useLoadedListView, type LoadedListField } from "@/components/erp/table/loaded-list-view";
import { ConfiguredRow } from "@/components/erp/table/list-controls";

import { useState, useTransition, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";

// Stable reference so the `onRowsLoaded` useEffect doesn't fire on every render
// while the query is loading (avoids infinite setState loop from new [] each render)
const EMPTY_DOCS: DmsExpiringDocumentRow[] = [];
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, RefreshCw, Plus, EyeOff, Eye } from "lucide-react";
import { SortColHeader } from "@/components/erp/table/sort-col-header";
import { TablePagination } from "@/components/erp/table/table-pagination";
import { TableSearchInput } from "@/components/erp/table/table-search-input";
import { useSortPaginate } from "@/hooks/use-sort-paginate";
import { queryKeys } from "@/lib/query/query-keys";
import {
  getDmsExpiringDocuments,
  generateDmsExpiryRemindersForDocument,
  setDmsExpiryTrackingOverride,
  type ExpiringDocumentsFilter,
  type DmsExpiringDocumentRow,
} from "@/server/actions/dms/expiry-reminders";
import { DmsExpiryStatusBadge } from "./dms-expiry-status-badge";
import { invalidateDmsExpiry } from "@/lib/query/invalidation";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";

interface DmsExpiringDocumentsTableProps {
  view: "expired" | "expiring" | "missing_expiry" | "ignored";
  onStartRenewal?: (doc: DmsExpiringDocumentRow) => void;
  /** Advanced filter params from the filter bar (optional) */
  advancedFilter?: Omit<ExpiringDocumentsFilter, "view" | "limit">;
  /** Called whenever the full (pre-pagination) row set changes — used for export */
  onRowsLoaded?: (rows: DmsExpiringDocumentRow[]) => void;
  canManage?: boolean;
}

// ── Ignore reason dialog ───────────────────────────────────────────────────────

interface IgnoreDialogProps {
  doc: DmsExpiringDocumentRow | null;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  isSubmitting: boolean;
}

function IgnoreDialog({ doc, onClose, onConfirm, isSubmitting }: IgnoreDialogProps) {
  const [reason, setReason] = useState("");
  if (!doc) return null;
  return (
    <ERPChildDialogForm
      open={!!doc}
      onOpenChange={(v) => { if (!v) { setReason(""); onClose(); } }}
      title="Ignore Expiry Tracking"
      subtitle={doc.title}
      icon={<EyeOff className="h-5 w-5" />}
      mode="edit"
      size="sm"
      isSubmitting={isSubmitting}
      onSubmit={() => onConfirm(reason)}
      submitLabel="Ignore"
      cancelLabel="Cancel"
    >
      <div className="col-span-12 space-y-3">
        <p className="text-sm text-muted-foreground">
          This document will be removed from the <strong>Expired</strong>, <strong>Expiring Soon</strong>, and{" "}
          <strong>Missing Expiry</strong> dashboards. The document itself is not changed — you can reverse this at any time.
        </p>
        <div>
          <label className="text-sm font-medium block mb-1.5">Reason <span className="text-muted-foreground font-normal">(optional)</span></label>
          <textarea
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[72px] resize-y focus:outline-none focus:ring-2 focus:ring-ring"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Document kept for reference only, no renewal required…"
          />
        </div>
      </div>
    </ERPChildDialogForm>
  );
}

const LIST_FIELDS: LoadedListField[] = [
  {
    "id": "document_no",
    "label": "Document",
    "path": "title",
    "type": "text",
    "width": 180,
    "required": true
  },
  {
    "id": "document_type",
    "label": "Type / category",
    "path": "document_type",
    "type": "text",
    "width": 180
  },
  {
    "id": "expiry_date",
    "label": "Expiry",
    "path": "expiry_date",
    "type": "date",
    "width": 180
  },
  {
    "id": "expiry_override_reason",
    "label": "Ignore reason",
    "path": "expiry_override_reason",
    "type": "text",
    "width": 180
  },
  {
    "id": "status",
    "label": "Status",
    "path": "status",
    "type": "text",
    "width": 180
  },
  {
    "id": "actions",
    "label": "Actions",
    "type": "text",
    "width": 160
  }
];
export function DmsExpiringDocumentsTable({ view, onStartRenewal, advancedFilter, onRowsLoaded, canManage = false }: DmsExpiringDocumentsTableProps) {
  const queryClient = useQueryClient();
  const [generatingId, setGeneratingId] = useState<number | null>(null);
  const [ignoreTarget, setIgnoreTarget] = useState<DmsExpiringDocumentRow | null>(null);
  const [isIgnoring, startIgnoreTransition] = useTransition();
  const flight = useRef(false);

  const filterKey: ExpiringDocumentsFilter = { view, ...(advancedFilter ?? {}) };

  const { data: queryData, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.dms.expiringDocuments(filterKey as Record<string, unknown>),
    queryFn: async () => {
      const result = await getDmsExpiringDocuments(filterKey);
      if (!result.success || !Array.isArray(result.data)) throw new Error(result.error ?? "Expiring documents are unavailable");
      return result.data;
    },
    staleTime: 60_000,
  });
  // A denied/failed refresh must not leave cached rows or mutation targets visible.
  const docs = isError || isLoading ? EMPTY_DOCS : queryData ?? EMPTY_DOCS;

  // Expose full row set to parent (for export / email)
  useEffect(() => {
    onRowsLoaded?.(isError || isLoading ? EMPTY_DOCS : docs);
  }, [docs, onRowsLoaded, isError, isLoading]);

  const listView = useLoadedListView("DmsExpiringDocumentsTable", docs, LIST_FIELDS.filter(field => field.id === "expiry_date" ? view !== "missing_expiry" && view !== "ignored" : field.id === "expiry_override_reason" ? view === "ignored" : true));
  const table = useSortPaginate(listView.rows, {
    defaultSortKey: view === "missing_expiry" || view === "ignored" ? "title" : "expiry_date",
    defaultSortDir: "asc",
    defaultPageSize: 25,
    getSearchText: (d) => [d.document_no, d.title, d.document_type ?? "", d.category ?? "", d.status].join(" "),
    comparators: {
      days_remaining: (a, b) => (a.days_remaining ?? 99999) - (b.days_remaining ?? 99999),
    },
  });

  const handleGenerateReminders = async (docId: number) => {
    if (!canManage || isError || flight.current) return;
    flight.current = true;
    setGeneratingId(docId);
    try {
      const result = await generateDmsExpiryRemindersForDocument(docId);
      if (result.success) {
        toast.success(`Reminders generated: ${result.data?.created} created`);
        invalidateDmsExpiry(queryClient);
      } else {
        toast.error(result.error ?? "Failed to generate reminders");
      }
    } catch { toast.error("Generation unconfirmed. Refresh before trying again."); } finally {
      flight.current = false;
      setGeneratingId(null);
    }
  };

  const handleIgnoreConfirm = (reason: string) => {
    if (!ignoreTarget || !canManage || isError || flight.current) return;
    flight.current = true;
    const docId = ignoreTarget.id;
    const docTitle = ignoreTarget.title;
    startIgnoreTransition(async () => {
      try {
      const result = await setDmsExpiryTrackingOverride({ documentId: docId, override: "ignored", reason: reason || undefined });
      if (result.success) {
        toast.success(`"${docTitle}" removed from expiry dashboards.`);
        invalidateDmsExpiry(queryClient);
        setIgnoreTarget(null);
      } else {
        toast.error(result.error ?? "Failed to ignore expiry tracking");
      }
      } catch { toast.error("Change unconfirmed. Refresh before retrying."); }
      finally { flight.current = false; }
    });
  };

  const handleUnignore = (doc: DmsExpiringDocumentRow) => {
    if (!canManage || isError || flight.current) return;
    flight.current = true;
    startIgnoreTransition(async () => {
      try {
      const result = await setDmsExpiryTrackingOverride({ documentId: doc.id, override: null });
      if (result.success) {
        toast.success(`"${doc.title}" restored to expiry tracking.`);
        invalidateDmsExpiry(queryClient);
      } else {
        toast.error(result.error ?? "Failed to restore expiry tracking");
      }
      } catch { toast.error("Change unconfirmed. Refresh before retrying."); }
      finally { flight.current = false; }
    });
  };

  const emptyMessages = {
    expired: "No expired documents",
    expiring: "No documents expiring within 90 days",
    missing_expiry: "No documents with missing expiry date",
    ignored: "No documents with expiry tracking ignored",
  };

  const showExpiryColumn = view !== "missing_expiry" && view !== "ignored";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {isError ? "Document count unavailable" : isLoading ? "Loading document count…" : table.total !== docs.length
            ? `${table.total} of ${docs.length} documents`
            : `${docs.length} document${docs.length !== 1 ? "s" : ""}`}
        </p>
        <TableSearchInput value={table.query} onChange={table.setQuery} placeholder="Search documents…" className="w-52" />
      </div>
      {isError && <div role="alert">Expiring documents could not be loaded. <Button onClick={() => void refetch()}>Retry documents</Button></div>}
      {isLoading && <div role="status" className="py-8 text-center text-sm text-muted-foreground">Loading…</div>}
      <div className="rounded-md border border-border overflow-auto"><LoadedListTools view={listView} search />
        <div role="region" aria-label="DmsExpiringDocumentsTable results" tabIndex={0} className="max-w-full overflow-x-auto"><table className="w-full table-fixed text-sm" style={{minWidth:listView.visible.reduce((sum,c)=>sum+c.width,0)}}><colgroup>{listView.visible.map(c=><col key={c.id} style={{width:c.width}} />)}</colgroup>
          <thead>
            <ConfiguredRow columns={listView.columns} className="bg-muted/20 border-b border-border">
              <SortColHeader data-column="document_no" field="document_no" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} className="px-3 py-2">Document</SortColHeader>
              <SortColHeader data-column="document_type" field="document_type" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} className="px-3 py-2">Type / Category</SortColHeader>
              {showExpiryColumn && (
                <SortColHeader data-column="expiry_date" field="expiry_date" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} className="px-3 py-2">Expiry</SortColHeader>
              )}
              {view === "ignored" && (
                <th data-column="expiry_override_reason" className="px-3 py-2">Ignore Reason</th>
              )}
              <SortColHeader data-column="status" field="status" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} className="px-3 py-2">Status</SortColHeader>
              <th data-column="actions" className="px-3 py-2 w-48" />
            </ConfiguredRow>
          </thead>
          <tbody className="divide-y divide-border/50">
            {!isLoading && !isError && table.rows.length === 0 && (
              <tr>
                <td colSpan={listView.visible.length} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {table.query || listView.rows.length !== docs.length ? "No documents match your search" : emptyMessages[view]}
                </td>
              </tr>
            )}
            {table.rows.map((doc) => (
            <ConfiguredRow columns={listView.columns} key={doc.id} className="hover:bg-muted/10 transition-colors">
              <td data-column="document_no" className="px-3 py-2">
                <div>
                  <p className="font-mono text-xs text-muted-foreground">{doc.document_no}</p>
                  <p className="text-sm font-medium truncate max-w-[220px]">{doc.title}</p>
                </div>
              </td>
              <td data-column="document_type" className="px-3 py-2">
                <div className="text-xs text-muted-foreground">
                  <p>{doc.document_type ?? "—"}</p>
                  {doc.category && <p className="opacity-70">{doc.category}</p>}
                </div>
              </td>
              {showExpiryColumn && (
                <td data-column="expiry_date" className="px-3 py-2">
                  <div className="space-y-1">
                    {doc.expiry_date ? (
                      <p className="text-xs">{format(parseISO(doc.expiry_date), "dd MMM yyyy")}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">—</p>
                    )}
                    <DmsExpiryStatusBadge daysRemaining={doc.days_remaining} />
                  </div>
                </td>
              )}
              {view === "ignored" && (
                <td data-column="expiry_override_reason" className="px-3 py-2">
                  <p className="text-xs text-muted-foreground italic max-w-[200px] truncate">
                    {doc.expiry_override_reason ?? "—"}
                  </p>
                </td>
              )}
              <td data-column="status" className="px-3 py-2">
                <Badge variant="outline" className="text-xs capitalize">{doc.status}</Badge>
              </td>
              <td data-column="actions" className="px-3 py-2">
                <div className="flex items-center gap-1 justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => window.open(`/dms/documents/record/${doc.id}`, "_blank")}
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open
                  </Button>
                  {canManage && view !== "missing_expiry" && view !== "ignored" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      disabled={generatingId !== null || isIgnoring}
                      onClick={() => handleGenerateReminders(doc.id)}
                    >
                      <RefreshCw className={`h-3 w-3 ${generatingId === doc.id ? "animate-spin" : ""}`} />
                      Reminders
                    </Button>
                  )}
                  {onStartRenewal && view !== "missing_expiry" && view !== "ignored" && doc.status !== "superseded" && (
                    doc.is_renewable ? (
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => onStartRenewal(doc)}
                      >
                        <Plus className="h-3 w-3" />
                        Renew
                      </Button>
                    ) : (
                      <span className="text-[10px] text-muted-foreground italic px-1" title="One-time document type — upload a new document instead">
                        One-time
                      </span>
                    )
                  )}
                  {/* DMS EXPIRY.IGNORE.1 — Ignore / Unignore buttons */}
                  {canManage && (view !== "ignored" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                      title="Ignore expiry — removes this document from expiry dashboards"
                      disabled={generatingId !== null || isIgnoring}
                      onClick={() => setIgnoreTarget(doc)}
                    >
                      <EyeOff className="h-3 w-3" />
                      Ignore
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      disabled={isIgnoring}
                      title="Restore expiry tracking — document will reappear in dashboards"
                      onClick={() => handleUnignore(doc)}
                    >
                      <Eye className="h-3 w-3" />
                      Restore
                    </Button>
                  ))}
                </div>
              </td>
            </ConfiguredRow>
          ))}
          </tbody>
        </table></div>
        <TablePagination
          page={table.page}
          totalPages={table.totalPages}
          onPage={table.setPage}
          pageSize={table.pageSize}
          onPageSize={table.setPageSize}
          total={table.total}
        />
      </div>

      <IgnoreDialog
        doc={isError || isLoading || !canManage ? null : ignoreTarget}
        onClose={() => setIgnoreTarget(null)}
        onConfirm={handleIgnoreConfirm}
        isSubmitting={isIgnoring}
      />
    </div>
  );
}
