"use client";

import { DmsListTools, useDmsListView, type DmsListField } from "@/features/dms/dms-list-view";
import { ConfiguredRow } from "@/components/erp/table/list-controls";
import { DmsLoadError } from "@/features/dms/dms-load-error";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ExternalLink, CheckCircle2, XCircle } from "lucide-react";
import { SortColHeader } from "@/components/erp/table/sort-col-header";
import { TablePagination } from "@/components/erp/table/table-pagination";
import { TableSearchInput } from "@/components/erp/table/table-search-input";
import { useSortPaginate } from "@/hooks/use-sort-paginate";
import { queryKeys } from "@/lib/query/query-keys";
import {
  getDmsRenewalRequests,
  cancelDmsRenewalRequest,
  type DmsRenewalRequestRow,
  type RenewalRequestsFilter,
} from "@/server/actions/dms/renewals";
import { DmsRenewalStatusBadge } from "./dms-renewal-status-badge";
import { DmsCompleteRenewalDialog } from "./dms-complete-renewal-dialog";
import { invalidateDmsRenewals } from "@/lib/query/invalidation";

interface DmsRenewalRequestsTableProps {
  filter?: RenewalRequestsFilter;
}

const DMS_LIST_FIELDS: DmsListField[] = [
  {
    "id": "renewal_no",
    "label": "Renewal number",
    "path": "renewal_no",
    "type": "text",
    "width": 160,
    "required": true
  },
  {
    "id": "document",
    "label": "Document",
    "path": "document.title",
    "type": "text",
    "width": 260
  },
  {
    "id": "status",
    "label": "Status",
    "path": "status",
    "type": "text",
    "width": 160
  },
  {
    "id": "priority",
    "label": "Priority",
    "path": "priority",
    "type": "text",
    "width": 160
  },
  {
    "id": "target_renewal_date",
    "label": "Target date",
    "path": "target_renewal_date",
    "type": "date",
    "width": 160
  },
  {
    "id": "assignee",
    "label": "Assigned to",
    "path": "assignee.full_name",
    "type": "text",
    "width": 160
  },
  {
    "id": "actions",
    "label": "Actions",
    "type": "text",
    "width": 160
  }
];

export function DmsRenewalRequestsTable({ filter = {} }: DmsRenewalRequestsTableProps) {
  const queryClient = useQueryClient();
  const [completeDialog, setCompleteDialog] = useState<{ renewal: DmsRenewalRequestRow } | null>(null);

  const { data: renewals = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: queryKeys.dms.renewalRequests(filter as Record<string, unknown>),
    queryFn: async () => {
      const result = await getDmsRenewalRequests(filter);
      if (!result.success) throw new Error(result.error);
      return result.data ?? [];
    },
    staleTime: 30_000,
  });

  const listView = useDmsListView("renewals", renewals, DMS_LIST_FIELDS);
  const table = useSortPaginate(listView.rows, {
    memoryKey: "dms:renewals",
    defaultSortKey: "created_at",
    defaultSortDir: "desc",
    defaultPageSize: 25,
    getSearchText: (r) => {
      const doc = r.document as Record<string, unknown> | null | undefined;
      const assignee = r.assignee as Record<string, unknown> | null | undefined;
      return [r.renewal_no ?? "", String(doc?.document_no ?? ""), String(doc?.title ?? ""), r.status, r.priority, String(assignee?.full_name ?? "")].join(" ");
    },
  });

  const handleCancel = async (id: number) => {
    const result = await cancelDmsRenewalRequest(id, "Cancelled from dashboard");
    if (result.success) {
      toast.success("Renewal request cancelled");
      invalidateDmsRenewals(queryClient);
    } else {
      toast.error(result.error ?? "Failed to cancel");
    }
  };

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>;
  }

  if (isError) return <DmsLoadError subject="renewal requests" retry={refetch} pending={isFetching} />;

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-muted-foreground">
            {table.total !== renewals.length
              ? `${table.total} of ${renewals.length} renewal${renewals.length !== 1 ? "s" : ""}`
              : `${renewals.length} renewal${renewals.length !== 1 ? "s" : ""}`}
          </p>
          <TableSearchInput value={table.query} onChange={table.setQuery} placeholder="Search renewals…" className="w-52" />
        </div>
        <DmsListTools view={listView} />
<div className="rounded-md border border-border overflow-auto">
          <div role="region" aria-label="renewals table" tabIndex={0} className="max-w-full overflow-x-auto"><table className="w-full table-fixed text-sm" style={{ minWidth: listView.visible.reduce((sum, column) => sum + column.width, 0) }}><colgroup>{listView.visible.map(column => <col key={column.id} style={{ width: column.width }} />)}</colgroup>
            <thead>
              <ConfiguredRow columns={listView.columns} className="bg-muted/20 border-b border-border">
                <SortColHeader data-column="renewal_no" field="renewal_no" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} className="px-3 py-2">Renewal No</SortColHeader>
                <th data-column="document" className="text-left px-3 py-2 text-xs font-medium text-muted-foreground uppercase">Document</th>
                <SortColHeader data-column="status" field="status" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} className="px-3 py-2">Status</SortColHeader>
                <SortColHeader data-column="priority" field="priority" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} className="px-3 py-2">Priority</SortColHeader>
                <SortColHeader data-column="target_renewal_date" field="target_renewal_date" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} className="px-3 py-2">Target Date</SortColHeader>
                <th data-column="assignee" className="text-left px-3 py-2 text-xs font-medium text-muted-foreground uppercase">Assigned To</th>
                <th data-column="actions" className="px-3 py-2 w-36" />
              </ConfiguredRow>
            </thead>
            <tbody className="divide-y divide-border/50">
              {table.rows.length === 0 && (
                <tr>
                  <td colSpan={listView.visible.length} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    {table.query ? "No renewals match your search" : "No renewal requests found"}
                  </td>
                </tr>
              )}
              {table.rows.map((r) => {
              const doc = r.document as Record<string, unknown> | null | undefined;
              const assignee = r.assignee as Record<string, unknown> | null | undefined;
              return (
                <ConfiguredRow columns={listView.columns} key={r.id} className="hover:bg-muted/10 transition-colors">
                  <td data-column="renewal_no" className="px-3 py-2 font-mono text-xs">{r.renewal_no ?? `#${r.id}`}</td>
                  <td data-column="document" className="px-3 py-2">
                    {doc ? (
                      <div>
                        <p className="font-mono text-xs text-muted-foreground">{doc.document_no as string}</p>
                        <p className="text-sm truncate max-w-[180px]">{doc.title as string}</p>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td data-column="status" className="px-3 py-2">
                    <DmsRenewalStatusBadge status={r.status} />
                  </td>
                  <td data-column="priority" className="px-3 py-2 capitalize text-xs">{r.priority}</td>
                  <td data-column="target_renewal_date" className="px-3 py-2 text-xs">
                    {r.target_renewal_date ? format(parseISO(r.target_renewal_date), "dd MMM yyyy") : "—"}
                  </td>
                  <td data-column="assignee" className="px-3 py-2 text-xs">
                    {(assignee?.full_name as string | null) ?? "—"}
                  </td>
                  <td data-column="actions" className="px-3 py-2">
                    <div className="flex items-center gap-1 justify-end">
                      {doc && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => window.open(`/dms/documents/record/${doc.id}`, "_blank")}
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      )}
                      {!["renewed", "cancelled", "rejected"].includes(r.status) && (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => setCompleteDialog({ renewal: r })}
                          >
                            <CheckCircle2 className="h-3 w-3 text-green-500" />
                            Complete
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
                            onClick={() => handleCancel(r.id)}
                          >
                            <XCircle className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </ConfiguredRow>
              );
            })}
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
        </div>

      {completeDialog && (
        <DmsCompleteRenewalDialog
          open
          onOpenChange={(v) => { if (!v) setCompleteDialog(null); }}
          renewalId={completeDialog.renewal.id}
          renewalNo={completeDialog.renewal.renewal_no ?? `#${completeDialog.renewal.id}`}
          documentId={completeDialog.renewal.document_id}
          documentTypeId={completeDialog.renewal.document?.document_type_id ?? null}
          onSuccess={() => setCompleteDialog(null)}
        />
      )}
    </>
  );
}
