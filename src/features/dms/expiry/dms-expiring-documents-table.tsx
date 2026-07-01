"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, RefreshCw, Plus, CheckCircle2, XCircle } from "lucide-react";
import { SortColHeader } from "@/components/erp/table/sort-col-header";
import { TablePagination } from "@/components/erp/table/table-pagination";
import { TableSearchInput } from "@/components/erp/table/table-search-input";
import { useSortPaginate } from "@/hooks/use-sort-paginate";
import { queryKeys } from "@/lib/query/query-keys";
import {
  getDmsExpiringDocuments,
  generateDmsExpiryRemindersForDocument,
  type ExpiringDocumentsFilter,
  type DmsExpiringDocumentRow,
} from "@/server/actions/dms/expiry-reminders";
import { DmsExpiryStatusBadge } from "./dms-expiry-status-badge";
import { invalidateDmsExpiry } from "@/lib/query/invalidation";

interface DmsExpiringDocumentsTableProps {
  view: "expired" | "expiring" | "missing_expiry";
  onStartRenewal?: (doc: DmsExpiringDocumentRow) => void;
}

export function DmsExpiringDocumentsTable({ view, onStartRenewal }: DmsExpiringDocumentsTableProps) {
  const queryClient = useQueryClient();
  const [generatingId, setGeneratingId] = useState<number | null>(null);

  const filterKey: ExpiringDocumentsFilter = { view };

  const { data: docs = [], isLoading } = useQuery({
    queryKey: queryKeys.dms.expiringDocuments(filterKey),
    queryFn: async () => {
      const result = await getDmsExpiringDocuments(filterKey);
      if (!result.success) throw new Error(result.error);
      return result.data ?? [];
    },
    staleTime: 60_000,
  });

  const table = useSortPaginate(docs, {
    defaultSortKey: view === "missing_expiry" ? "title" : "expiry_date",
    defaultSortDir: "asc",
    defaultPageSize: 25,
    getSearchText: (d) => [d.document_no, d.title, d.document_type ?? "", d.category ?? "", d.status].join(" "),
    comparators: {
      days_remaining: (a, b) => (a.days_remaining ?? 99999) - (b.days_remaining ?? 99999),
    },
  });

  const handleGenerateReminders = async (docId: number) => {
    setGeneratingId(docId);
    try {
      const result = await generateDmsExpiryRemindersForDocument(docId);
      if (result.success) {
        toast.success(`Reminders generated: ${result.data?.created} created`);
        invalidateDmsExpiry(queryClient);
      } else {
        toast.error(result.error ?? "Failed to generate reminders");
      }
    } finally {
      setGeneratingId(null);
    }
  };

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>;
  }

  if (docs.length === 0 && !isLoading) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        {view === "expired" ? "No expired documents" :
         view === "expiring" ? "No documents expiring within 90 days" :
         "No documents with missing expiry date"}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {table.total !== docs.length
            ? `${table.total} of ${docs.length} documents`
            : `${docs.length} document${docs.length !== 1 ? "s" : ""}`}
        </p>
        <TableSearchInput value={table.query} onChange={table.setQuery} placeholder="Search documents…" className="w-52" />
      </div>
      <div className="rounded-md border border-border overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/20 border-b border-border">
              <SortColHeader field="document_no" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} className="px-3 py-2">Document</SortColHeader>
              <SortColHeader field="document_type" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} className="px-3 py-2">Type / Category</SortColHeader>
              {view !== "missing_expiry" && (
                <SortColHeader field="expiry_date" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} className="px-3 py-2">Expiry</SortColHeader>
              )}
              <SortColHeader field="status" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} className="px-3 py-2">Status</SortColHeader>
              <th className="px-3 py-2 w-40" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {table.rows.length === 0 && (
              <tr>
                <td colSpan={view === "missing_expiry" ? 4 : 5} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {table.query ? "No documents match your search" : "No documents found"}
                </td>
              </tr>
            )}
            {table.rows.map((doc) => (
            <tr key={doc.id} className="hover:bg-muted/10 transition-colors">
              <td className="px-3 py-2">
                <div>
                  <p className="font-mono text-xs text-muted-foreground">{doc.document_no}</p>
                  <p className="text-sm font-medium truncate max-w-[220px]">{doc.title}</p>
                </div>
              </td>
              <td className="px-3 py-2">
                <div className="text-xs text-muted-foreground">
                  <p>{doc.document_type ?? "—"}</p>
                  {doc.category && <p className="opacity-70">{doc.category}</p>}
                </div>
              </td>
              {view !== "missing_expiry" && (
                <td className="px-3 py-2">
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
              <td className="px-3 py-2">
                <Badge variant="outline" className="text-xs capitalize">{doc.status}</Badge>
              </td>
              <td className="px-3 py-2">
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
                  {view !== "missing_expiry" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      disabled={generatingId === doc.id}
                      onClick={() => handleGenerateReminders(doc.id)}
                    >
                      <RefreshCw className={`h-3 w-3 ${generatingId === doc.id ? "animate-spin" : ""}`} />
                      Reminders
                    </Button>
                  )}
                  {onStartRenewal && view !== "missing_expiry" && doc.status !== "superseded" && (
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
                </div>
              </td>
            </tr>
          ))}
          </tbody>
        </table>
        <TablePagination
          page={table.page}
          totalPages={table.totalPages}
          onPage={table.setPage}
          pageSize={table.pageSize}
          onPageSize={table.setPageSize}
          total={table.total}
        />
      </div>
    </div>
  );
}
