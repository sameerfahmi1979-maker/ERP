"use client";

import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, parseISO } from "date-fns";
import { ArrowDown, ArrowUp, ArrowUpDown, CheckCircle2, ClipboardCheck, ExternalLink, RefreshCw, Undo2, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ConfiguredRow, EditColumns, EditFilters, useListColumns, type ListColumn } from "@/components/erp/table/list-controls";
import { usePersistentUiState } from "@/hooks/use-persistent-ui-state";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { DmsApprovalActionDialog, type ApprovalDialogMode } from "./dms-approval-action-dialog";
import { DmsApprovalStatusBadge } from "./dms-approval-status-badge";

import { invalidateDmsApprovalOutcome } from "@/lib/query/invalidation";
import type { ApprovalQueueRow } from "@/server/actions/dms/document-approvals";
import type { AuthContext } from "@/lib/rbac/check";
import { dmsApprovalReadIdentity } from "@/lib/reads/dms-approvals-schema";
import { useDmsApprovalQueue } from "@/hooks/use-dms-approvals";

// ── Types ─────────────────────────────────────────────────────────────────────

type SortBy = "submitted_at" | "document_no" | "title";
type SortDir = "asc" | "desc";
type StatusFilter = "pending_approval" | "approved" | "rejected" | "withdrawn" | "all";

interface Filters {
  status: StatusFilter;
  search: string;
  sortBy: SortBy;
  sortDir: SortDir;
  page: number;
}

const PAGE_SIZE = 20;

// ── Sort header ───────────────────────────────────────────────────────────────

function SortHeader({
  field, label, sortBy, sortDir, onSort, className, "data-column": column,
}: {
  field: SortBy;
  label: string;
  sortBy: SortBy;
  sortDir: SortDir;
  onSort: (f: SortBy) => void;
  className?: string;
  "data-column"?: string;
}) {
  const active = sortBy === field;
  return (
    <th
      data-column={column}
      aria-sort={active ? sortDir === "asc" ? "ascending" : "descending" : "none"}
      className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap ${className ?? ""}`}
    >
      <button type="button" onClick={() => onSort(field)} className="inline-flex items-center gap-1 focus-visible:outline-2 focus-visible:outline-primary">
        {label}
        {active ? (
          sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-35" />
        )}
      </button>
    </th>
  );
}

// ── Days pending badge ─────────────────────────────────────────────────────────

function DaysPendingBadge({ days }: { days: number | null }) {
  if (days === null) return <span className="text-muted-foreground text-xs">—</span>;
  const cls =
    days >= 7 ? "bg-red-100 text-red-700 border-red-200" :
    days >= 3 ? "bg-amber-100 text-amber-700 border-amber-200" :
    "bg-slate-100 text-slate-500 border-slate-200";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold border ${cls}`}>
      {days}d
    </span>
  );
}

// ── Tab buttons ───────────────────────────────────────────────────────────────

const STATUS_TABS: { label: string; value: StatusFilter }[] = [
  { label: "Pending My Action", value: "pending_approval" },
  { label: "All", value: "all" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
  { label: "Withdrawn", value: "withdrawn" },
];

const COLUMNS: ListColumn[] = [
  { id: "document_no", label: "Document number", width: 160, visible: true, required: true },
  { id: "title", label: "Title", width: 260, visible: true },
  { id: "type", label: "Type", width: 160, visible: true },
  { id: "submitted_at", label: "Submitted", width: 160, visible: true },
  { id: "submitter", label: "Submitted by", width: 160, visible: true },
  { id: "status", label: "Status", width: 160, visible: true },
  { id: "pending", label: "Pending", width: 110, visible: true },
  { id: "actions", label: "Actions", width: 160, visible: true },
];

// ── Main page client ──────────────────────────────────────────────────────────

interface Props {
  canAct: boolean;
  isAdmin: boolean;
  authContext: AuthContext;
}

export function DmsApprovalsQueuePageClient(props: Props) {
  return <DmsApprovalsQueueSession key={dmsApprovalReadIdentity(props.authContext)} {...props} />;
}
function DmsApprovalsQueueSession({ authContext }: Props) {
  const qc = useQueryClient();
  const listColumns = useListColumns("dms:approval-queue:v1", COLUMNS);

  const [filters, setFilters] = usePersistentUiState<Filters>("dms:approval-queue:criteria", {
    status: "pending_approval",
    search: "",
    sortBy: "submitted_at",
    sortDir: "desc",
    page: 1,
  });
  const read = useDmsApprovalQueue(authContext, {status: filters.status, search: filters.search, sortBy: filters.sortBy,
    sortDirection: filters.sortDir, page: filters.page, pageSize: PAGE_SIZE});
  const rows = read.data?.rows ?? [], total = read.data?.totalCount ?? null, isPending = read.busy;
  const loadError = read.invalid ? "Check the search and page criteria before retrying."
    : read.denied ? "Approval information is not available for your current access."
    : read.error ? "Could not load the approval queue. This is not an empty result. Check your access and connection, then retry." : null;
  const loaded = read.ready || !!loadError;

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<ApprovalDialogMode>("approve");
  const [dialogRow, setDialogRow] = useState<ApprovalQueueRow | null>(null);
  const currentDialogRow = dialogRow && rows.find(row => row.documentId === dialogRow.documentId);
  const canConfirm = read.ready && !!currentDialogRow && currentDialogRow.currentApprovalId === dialogRow?.currentApprovalId
    && (dialogMode === "withdraw" ? currentDialogRow.canWithdraw : (dialogMode === "approve" || dialogMode === "reject") && currentDialogRow.canAct);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const applyFilters = (next: Partial<Filters>) => {
    const updated = { ...filters, ...next, page: 1 };
    setFilters(updated);
  };

  const handleSort = (field: SortBy) => {
    const nextDir: SortDir = filters.sortBy === field && filters.sortDir === "desc" ? "asc" : "desc";
    applyFilters({ sortBy: field, sortDir: nextDir });
  };

  const handlePageChange = (p: number) => {
    const updated = { ...filters, page: p };
    setFilters(updated);
  };

  const handleRefresh = () => {
    read.retry();
  };

  const openDialog = (row: ApprovalQueueRow, mode: ApprovalDialogMode) => {
    if (!read.isCurrent()) return;
    setDialogRow(row);
    setDialogMode(mode);
    setDialogOpen(true);
  };

  const handleActionSuccess = () => {
    if (dialogRow) {
      invalidateDmsApprovalOutcome(qc, dialogRow.documentId);
    }
  };

  // ── Pagination ────────────────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil((total ?? 0) / PAGE_SIZE));

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <TooltipProvider>
      <div className="space-y-4">

        {/* ── Tabs ─────────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-1 border-b border-border pb-0">
          {STATUS_TABS.map((tab) => (
            <button
              type="button"
              aria-pressed={filters.status === tab.value}
              key={tab.value}
              onClick={() => applyFilters({ status: tab.value })}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                filters.status === tab.value
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
          <div className="ml-auto" />
        </div>

        {/* ── Search + Refresh ─────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3">
          <Input
            aria-label="Search approval queue"
            placeholder="Search by document no or title…"
            value={filters.search}
            onChange={(e) => applyFilters({ search: e.target.value })}
            className="max-w-sm h-8 text-sm"
          />
          <div className="ml-auto flex items-center gap-2">
            {total !== null && total > 0 && (
              <span className="text-xs text-muted-foreground">
                {total} record{total !== 1 ? "s" : ""}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isPending || read.invalid || read.denied}
              className="h-8 gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <EditColumns columns={listColumns.columns} defaults={COLUMNS} onApply={listColumns.setColumns} />
          <EditFilters definitions={[{ id: "status", label: "Approval status", type: "select", options: STATUS_TABS }, { id: "search", label: "Search", type: "text" }]}
            values={{ status: filters.status === "all" ? "" : filters.status, search: filters.search }}
            onApply={values => applyFilters({ status: STATUS_TABS.some(tab => tab.value === values.status) ? values.status as StatusFilter : "all", search: values.search ?? "" })}
            scopeLabel="These criteria are applied by the server to all approval records you may access, before pagination." />
        </div>

        {/* ── Table ────────────────────────────────────────────────────────── */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          {!loaded || isPending ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="px-4 py-3 flex items-center gap-4">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-48 flex-1" />
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-6 w-6" />
                </div>
              ))}
            </div>
          ) : loadError ? (
            <div className="p-8 text-center space-y-3">
              <p role="alert" className="text-sm text-destructive">{loadError}</p>
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={read.invalid || read.denied}>
                Retry
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center">
              <ClipboardCheck className="mx-auto h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">
                {filters.status === "pending_approval"
                  ? "No pending approvals for you right now."
                  : filters.search
                  ? "No results matching your search."
                  : "No approval records found."}
              </p>
            </div>
          ) : (
            <div role="region" aria-label="Approval queue table" tabIndex={0} className="max-w-full overflow-x-auto">
              <table className="w-full table-fixed text-sm" style={{ minWidth: listColumns.visible.reduce((sum, column) => sum + column.width, 0) }}><colgroup>{listColumns.visible.map(column => <col key={column.id} style={{ width: column.width }} />)}</colgroup>
                <thead className="bg-muted/40 border-b border-border">
                  <ConfiguredRow columns={listColumns.columns}>
                    <SortHeader data-column="document_no" field="document_no" label="Doc No" sortBy={filters.sortBy} sortDir={filters.sortDir} onSort={handleSort} className="w-32" />
                    <SortHeader data-column="title" field="title" label="Title" sortBy={filters.sortBy} sortDir={filters.sortDir} onSort={handleSort} />
                    <th data-column="type" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">Type</th>
                    <SortHeader data-column="submitted_at" field="submitted_at" label="Submitted" sortBy={filters.sortBy} sortDir={filters.sortDir} onSort={handleSort} className="w-36" />
                    <th data-column="submitter" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">Submitted By</th>
                    <th data-column="status" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">Status</th>
                    <th data-column="pending" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">Pending</th>
                    <th data-column="actions" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">Actions</th>
                  </ConfiguredRow>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row) => (
                    <ConfiguredRow columns={listColumns.columns} key={row.documentId} className="hover:bg-muted/30 transition-colors">
                      {/* Doc No */}
                      <td data-column="document_no" className="px-4 py-3 whitespace-nowrap">
                        <Link
                          href={`/dms/documents/record/${row.documentId}`}
                          className="font-mono text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
                        >
                          {row.documentNo}
                          <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                        </Link>
                      </td>


                      {/* Title */}
                      <td data-column="title" className="px-4 py-3 max-w-xs">
                        <span className="text-sm font-medium line-clamp-1" title={row.title}>
                          {row.title}
                        </span>
                      </td>

                      {/* Type */}
                      <td data-column="type" className="px-4 py-3 whitespace-nowrap">
                        {row.documentTypeName ? (
                          <span className="text-xs text-muted-foreground">{row.documentTypeName}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">—</span>
                        )}
                      </td>

                      {/* Submitted At */}
                      <td data-column="submitted_at" className="px-4 py-3 whitespace-nowrap">
                        {row.submittedAt ? (
                          <Tooltip>
                            <TooltipTrigger>
                              <span className="text-xs text-muted-foreground cursor-default">
                                {formatDistanceToNow(parseISO(row.submittedAt), { addSuffix: true })}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {new Date(row.submittedAt).toLocaleString("en-GB", {
                                day: "2-digit", month: "short", year: "numeric",
                                hour: "2-digit", minute: "2-digit",
                              })}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">—</span>
                        )}
                      </td>

                      {/* Submitted By */}
                      <td data-column="submitter" className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs text-muted-foreground">{row.submittedByName ?? "—"}</span>
                      </td>

                      {/* Status */}
                      <td data-column="status" className="px-4 py-3 whitespace-nowrap">
                        <DmsApprovalStatusBadge status={row.approvalStatus as "pending_approval" | "approved" | "rejected" | "withdrawn" | null} />
                      </td>

                      {/* Days Pending */}
                      <td data-column="pending" className="px-4 py-3 whitespace-nowrap">
                        {row.approvalStatus === "pending_approval" ? (
                          <DaysPendingBadge days={row.daysPending} />
                        ) : (
                          <span className="text-xs text-muted-foreground/50">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td data-column="actions" className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          {/* View Document */}
                          <Tooltip>
                            <TooltipTrigger>
                              <Link href={`/dms/documents/record/${row.documentId}`}>
                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </Button>
                              </Link>
                            </TooltipTrigger>
                            <TooltipContent>View Document</TooltipContent>
                          </Tooltip>

                          {/* Approve */}
                          {row.canAct && row.approvalStatus === "pending_approval" && (
                            <Tooltip>
                              <TooltipTrigger>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                  onClick={() => openDialog(row, "approve")}
                                  disabled={!row.currentApprovalId}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {row.currentApprovalId ? "Approve" : "Approval request is not ready for action."}
                              </TooltipContent>
                            </Tooltip>
                          )}

                          {/* Reject */}
                          {row.canAct && row.approvalStatus === "pending_approval" && (
                            <Tooltip>
                              <TooltipTrigger>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => openDialog(row, "reject")}
                                  disabled={!row.currentApprovalId}
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {row.currentApprovalId ? "Reject" : "Approval request is not ready for action."}
                              </TooltipContent>
                            </Tooltip>
                          )}

                          {/* Withdraw */}
                          {row.canWithdraw && row.approvalStatus === "pending_approval" && (
                            <Tooltip>
                              <TooltipTrigger>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-slate-500 hover:text-slate-700"
                                  onClick={() => openDialog(row, "withdraw")}
                                  disabled={!row.currentApprovalId}
                                >
                                  <Undo2 className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {row.currentApprovalId ? "Withdraw" : "Approval request is not ready for action."}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </td>
                    </ConfiguredRow>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Pagination ───────────────────────────────────────────────────── */}
        {read.ready && !loadError && total !== null && total > PAGE_SIZE && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Page {filters.page} of {totalPages} &nbsp;·&nbsp; {total} total
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-3"
                disabled={filters.page <= 1 || isPending}
                onClick={() => handlePageChange(filters.page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-3"
                disabled={filters.page >= totalPages || isPending}
                onClick={() => handlePageChange(filters.page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Action dialog ─────────────────────────────────────────────────── */}
      {dialogRow && !read.denied && (
        <DmsApprovalActionDialog
          authContext={authContext}
          canConfirm={canConfirm}
          isActionCurrent={read.isCurrent}
          onRefreshStatus={read.retry}
          statusRefreshing={read.busy}
          statusRefreshDisabled={read.denied || read.invalid}
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) setDialogRow(null);
          }}
          mode={dialogMode}
          documentId={dialogRow.documentId}
          approvalId={dialogRow.currentApprovalId}
          onSuccess={handleActionSuccess}
        />
      )}
    </TooltipProvider>
  );
}
