"use client";

import { DmsListTools, useDmsListView, type DmsListField } from "@/features/dms/dms-list-view";
import { ConfiguredRow } from "@/components/erp/table/list-controls";
import { DmsLoadError } from "@/features/dms/dms-load-error";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ExternalLink, CheckCircle2, XCircle } from "lucide-react";
import { SortColHeader } from "@/components/erp/table/sort-col-header";
import { TablePagination } from "@/components/erp/table/table-pagination";
import { TableSearchInput } from "@/components/erp/table/table-search-input";
import { usePersistentUiState } from "@/hooks/use-persistent-ui-state";
import { canonicalReadParams, useServerPage } from "@/hooks/use-server-page";
import {
  cancelDmsRenewalRequest,
  type DmsRenewalRequestRow,
  type RenewalRequestsFilter,
} from "@/server/actions/dms/renewals";
import { DmsRenewalStatusBadge } from "./dms-renewal-status-badge";
import { DmsCompleteRenewalDialog } from "./dms-complete-renewal-dialog";
import { invalidateDmsRenewals } from "@/lib/query/invalidation";
import { ReadError } from "@/lib/reads/client";

interface DmsRenewalRequestsTableProps {
  filter?: RenewalRequestsFilter;
  canManage?: boolean;
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

export function DmsRenewalRequestsTable({ filter = {}, canManage = false }: DmsRenewalRequestsTableProps) {
  const queryClient = useQueryClient();
  const [completeDialog, setCompleteDialog] = useState<{ renewal: DmsRenewalRequestRow; owner: string } | null>(null);
  const viewState = useDmsListView<DmsRenewalRequestRow>("renewals", [], DMS_LIST_FIELDS, { serverFiltered: true });
  const [search, setSearch] = usePersistentUiState("dms:renewals:search", "");
  const [page, setPage] = usePersistentUiState("dms:renewals:page", 1);
  const [pageSize, setPageSize] = usePersistentUiState("dms:renewals:size", 25);
  const [sortKey, setSortKey] = usePersistentUiState("dms:renewals:sort", "created_at");
  const [sortDir, setSortDir] = usePersistentUiState<"asc" | "desc">("dms:renewals:direction", "desc");
  const criteria = { ...filter, search: search.trim(), columnFilters: viewState.filters };
  const criteriaKey = canonicalReadParams(criteria);
  const [appliedCriteria, setAppliedCriteria] = usePersistentUiState("dms:renewals:criteria", criteriaKey);
  const effectivePage = criteriaKey === appliedCriteria ? page : 1;
  const owner = canonicalReadParams({ ...criteria, page: effectivePage, pageSize, sortKey, sortDir });
  useEffect(() => {
    if (criteriaKey !== appliedCriteria) { setAppliedCriteria(criteriaKey); setPage(1); }
  }, [criteriaKey, appliedCriteria, setAppliedCriteria, setPage]);
  const read = useServerPage<DmsRenewalRequestRow>({
    resource: "dms-renewal-page", keyPrefix: ["dms", "renewals", "page"],
    params: { ...criteria, page: effectivePage, pageSize, sortKey, sortDir },
    // No full-list SSR seed: fetch the first bounded page under current authority.
    seedParams: {}, seed: { rows: [], totalCount: 0, page: 1, pageSize: 25 }, updatedAt: 0,
  });
  const { isError, refetch, isFetching } = read;
  const isLoading = read.isBusy || read.isPending;
  const visibleRenewals = isLoading || isError ? [] : read.data?.rows ?? [];
  const total = isLoading || isError ? undefined : read.data?.totalCount;
  const totalPages = Math.max(1, Math.ceil((total ?? 0) / pageSize));
  useEffect(() => {
    if (total !== undefined && effectivePage > totalPages) {
      // A prior page's cached count is now known to be stale. Reverify it when
      // moving back, instead of reviving an older count from the same account.
      void queryClient.invalidateQueries({ queryKey: ["dms", "renewals", "page"], refetchType: "none" });
      setPage(totalPages);
    }
  }, [total, effectivePage, totalPages, setPage, queryClient]);
  const listView = { ...viewState, rows: visibleRenewals, loadedCount: visibleRenewals.length, totalCount: total };
  const table = {
    rows: visibleRenewals, total: total ?? 0, page: effectivePage, totalPages, pageSize, sortKey, sortDir,
    query: search, setQuery: setSearch,
    setPage: (value: number) => setPage(Math.max(1, Math.min(value, totalPages))),
    setPageSize: (value: number) => { setPageSize(value); setPage(1); },
    toggleSort: (key: string) => { if (key === sortKey) setSortDir(value => value === "asc" ? "desc" : "asc"); else { setSortKey(key); setSortDir("asc"); } setPage(1); },
  };
  // Retire targets when identity/criteria/authority change, not merely during a
  // same-criteria background refresh. Keep that dialog mounted but hidden so a
  // temporary read failure cannot destroy an entered, unsaved completion draft.
  const denied = read.error instanceof ReadError && [401, 403].includes(read.error.status);
  if (completeDialog && (completeDialog.owner !== owner || !canManage || denied ||
      (!isLoading && !isError && !visibleRenewals.some(row => row.id === completeDialog.renewal.id && row.document_id === completeDialog.renewal.document_id)))) setCompleteDialog(null);

  const handleCancel = async (id: number) => {
    if (!canManage || isError || isLoading || !visibleRenewals.some(row => row.id === id)) return;
    const result = await cancelDmsRenewalRequest(id, "Cancelled from dashboard");
    if (result.success) {
      toast.success("Renewal request cancelled");
      invalidateDmsRenewals(queryClient);
    } else {
      toast.error(result.error ?? "Failed to cancel");
    }
  };

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-muted-foreground">
            {isError ? "Renewal count unavailable" : isLoading ? "Loading renewals…" : `${total} renewal${total !== 1 ? "s" : ""}`}
          </p>
          <TableSearchInput value={table.query} onChange={table.setQuery} placeholder="Search renewals…" className="w-52" />
        </div>
        <DmsListTools view={listView} />
        {isError ? <DmsLoadError subject="renewal requests" retry={refetch} pending={isFetching} /> : isLoading ? <div role="status" className="py-8 text-center text-sm text-muted-foreground">Loading…</div> : <>
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
                      {canManage && !["renewed", "cancelled", "rejected"].includes(r.status) && (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => setCompleteDialog({ renewal: r, owner })}
                          >
                            <CheckCircle2 className="h-3 w-3 text-green-500" />
                            Complete
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
                            aria-label="Cancel renewal"
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
          </>}
        </div>

      {canManage && completeDialog && completeDialog.owner === owner && !denied && (
        <DmsCompleteRenewalDialog
          open={!isError && !isLoading}
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
