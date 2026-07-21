"use client";

import { useState, useCallback, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, ClipboardCheck, ExternalLink, CheckCircle2, XCircle, Undo2, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { toast } from "sonner";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { DmsApprovalStatusBadge } from "./dms-approval-status-badge";
import { DmsApprovalActionDialog, type ApprovalDialogMode } from "./dms-approval-action-dialog";

import {
  listPendingDocumentApprovalsForCurrentUser,
  type ApprovalQueueRow,
} from "@/server/actions/dms/document-approvals";
import { queryKeys } from "@/lib/query/query-keys";

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
  field, label, sortBy, sortDir, onSort, className,
}: {
  field: SortBy;
  label: string;
  sortBy: SortBy;
  sortDir: SortDir;
  onSort: (f: SortBy) => void;
  className?: string;
}) {
  const active = sortBy === field;
  return (
    <th
      onClick={() => onSort(field)}
      className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 cursor-pointer select-none hover:text-slate-800 transition-colors whitespace-nowrap ${className ?? ""}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-35" />
        )}
      </span>
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

// ── Main page client ──────────────────────────────────────────────────────────

interface Props {
  canAct: boolean;
  isAdmin: boolean;
}

export function DmsApprovalsQueuePageClient({ canAct, isAdmin }: Props) {
  const qc = useQueryClient();
  const [isPending, startTransition] = useTransition();

  const [rows, setRows] = useState<ApprovalQueueRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [filters, setFilters] = useState<Filters>({
    status: "pending_approval",
    search: "",
    sortBy: "submitted_at",
    sortDir: "desc",
    page: 1,
  });

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<ApprovalDialogMode>("approve");
  const [dialogRow, setDialogRow] = useState<ApprovalQueueRow | null>(null);

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchQueue = useCallback((f: Filters) => {
    startTransition(async () => {
      setLoadError(null);
      const result = await listPendingDocumentApprovalsForCurrentUser({
        status: f.status,
        search: f.search.trim() || undefined,
        sortBy: f.sortBy,
        sortDirection: f.sortDir,
        page: f.page,
        pageSize: PAGE_SIZE,
      });
      if (result.success && result.data) {
        setRows(result.data.rows);
        setTotal(result.data.total);
        setLoaded(true);
      } else {
        setLoadError(result.error ?? "Failed to load approval queue.");
        setLoaded(true);
      }
    });
  }, []);

  // Auto-fetch on mount
  const [didMount, setDidMount] = useState(false);
  if (!didMount) {
    setDidMount(true);
    fetchQueue(filters);
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  const applyFilters = (next: Partial<Filters>) => {
    const updated = { ...filters, ...next, page: 1 };
    setFilters(updated);
    fetchQueue(updated);
  };

  const handleSort = (field: SortBy) => {
    const nextDir: SortDir = filters.sortBy === field && filters.sortDir === "desc" ? "asc" : "desc";
    applyFilters({ sortBy: field, sortDir: nextDir });
  };

  const handlePageChange = (p: number) => {
    const updated = { ...filters, page: p };
    setFilters(updated);
    fetchQueue(updated);
  };

  const handleRefresh = () => {
    fetchQueue(filters);
    qc.invalidateQueries({ queryKey: queryKeys.dms.approvalsQueue() });
  };

  const openDialog = (row: ApprovalQueueRow, mode: ApprovalDialogMode) => {
    setDialogRow(row);
    setDialogMode(mode);
    setDialogOpen(true);
  };

  const handleActionSuccess = () => {
    fetchQueue(filters);
    qc.invalidateQueries({ queryKey: queryKeys.dms.approvalsQueue() });
    qc.invalidateQueries({ queryKey: ["dms", "approvals", "queue"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
    if (dialogRow) {
      qc.invalidateQueries({ queryKey: queryKeys.dms.approvalState(dialogRow.documentId) });
      qc.invalidateQueries({ queryKey: queryKeys.dms.approvalHistory(dialogRow.documentId) });
    }
  };

  // ── Pagination ────────────────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <TooltipProvider>
      <div className="space-y-4">

        {/* ── Tabs ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-1 border-b border-border pb-0">
          {STATUS_TABS.map((tab) => (
            <button
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
        <div className="flex items-center gap-3">
          <Input
            placeholder="Search by document no, title, or submitter…"
            value={filters.search}
            onChange={(e) => applyFilters({ search: e.target.value })}
            className="max-w-sm h-8 text-sm"
          />
          <div className="ml-auto flex items-center gap-2">
            {total > 0 && (
              <span className="text-xs text-muted-foreground">
                {total} record{total !== 1 ? "s" : ""}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isPending}
              className="h-8 gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
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
              <p className="text-sm text-destructive">{loadError}</p>
              <Button variant="outline" size="sm" onClick={handleRefresh}>
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b border-border">
                  <tr>
                    <SortHeader field="document_no" label="Doc No" sortBy={filters.sortBy} sortDir={filters.sortDir} onSort={handleSort} className="w-32" />
                    <SortHeader field="title" label="Title" sortBy={filters.sortBy} sortDir={filters.sortDir} onSort={handleSort} />
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">Type</th>
                    <SortHeader field="submitted_at" label="Submitted" sortBy={filters.sortBy} sortDir={filters.sortDir} onSort={handleSort} className="w-36" />
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">Submitted By</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">Pending</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row) => (
                    <tr key={row.documentId} className="hover:bg-muted/30 transition-colors">
                      {/* Doc No */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Link
                          href={`/dms/documents/record/${row.documentId}`}
                          className="font-mono text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
                        >
                          {row.documentNo}
                          <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                        </Link>
                      </td>


                      {/* Title */}
                      <td className="px-4 py-3 max-w-xs">
                        <span className="text-sm font-medium line-clamp-1" title={row.title}>
                          {row.title}
                        </span>
                      </td>

                      {/* Type */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.documentTypeName ? (
                          <span className="text-xs text-muted-foreground">{row.documentTypeName}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">—</span>
                        )}
                      </td>

                      {/* Submitted At */}
                      <td className="px-4 py-3 whitespace-nowrap">
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
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs text-muted-foreground">{row.submittedByName ?? "—"}</span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <DmsApprovalStatusBadge status={row.approvalStatus as "pending_approval" | "approved" | "rejected" | "withdrawn" | null} />
                      </td>

                      {/* Days Pending */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.approvalStatus === "pending_approval" ? (
                          <DaysPendingBadge days={row.daysPending} />
                        ) : (
                          <span className="text-xs text-muted-foreground/50">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 whitespace-nowrap">
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
                          {(canAct || row.canAct) && row.approvalStatus === "pending_approval" && (
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
                          {(canAct || row.canAct) && row.approvalStatus === "pending_approval" && (
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Pagination ───────────────────────────────────────────────────── */}
        {loaded && !loadError && total > PAGE_SIZE && (
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
      {dialogRow && (
        <DmsApprovalActionDialog
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
