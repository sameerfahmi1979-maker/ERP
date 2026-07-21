"use client";

import { useState, useCallback, useTransition, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PlusCircle, RefreshCw, Pencil, Power, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { DmsApprovalWorkflowFormDialog } from "./dms-approval-workflow-form-dialog";

import {
  adminListApprovalWorkflows,
  adminGetApprovalWorkflow,
  adminDeactivateApprovalWorkflow,
  adminUpdateApprovalWorkflow,
  type WorkflowRow,
  type WorkflowWithSteps,
} from "@/server/actions/dms/document-approvals";
import type { DmsDocumentTypeRow } from "@/server/actions/dms/document-types";
import { queryKeys } from "@/lib/query/query-keys";

// ── Types ─────────────────────────────────────────────────────────────────────

type SortKey = "workflowCode" | "nameEn" | "documentTypeName" | "stepCount" | "updatedAt";
type SortDir = "asc" | "desc";

function useSortFilter(rows: WorkflowRow[], search: string, statusFilter: "all" | "active" | "inactive") {
  const [sortKey, setSortKey] = useState<SortKey>("workflowCode");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const toggle = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  };

  const filtered = rows.filter((r) => {
    const matchSearch = !search || [r.workflowCode, r.nameEn, r.nameAr ?? "", r.documentTypeName ?? ""]
      .join(" ").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || (statusFilter === "active" ? r.isActive : !r.isActive);
    return matchSearch && matchStatus;
  });

  const sorted = [...filtered].sort((a, b) => {
    let va = a[sortKey] ?? "";
    let vb = b[sortKey] ?? "";
    if (typeof va === "string") va = va.toLowerCase();
    if (typeof vb === "string") vb = vb.toLowerCase();
    if (va < vb) return sortDir === "asc" ? -1 : 1;
    if (va > vb) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  return { sorted, sortKey, sortDir, toggle };
}

// ── Sort header ───────────────────────────────────────────────────────────────

function SortHeader({ field, label, sortKey, sortDir, onSort, className }: {
  field: SortKey; label: string; sortKey: SortKey; sortDir: SortDir;
  onSort: (f: SortKey) => void; className?: string;
}) {
  const active = sortKey === field;
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

// ── Status badge ──────────────────────────────────────────────────────────────

function ActiveBadge({ active }: { active: boolean }) {
  return active
    ? <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">Active</Badge>
    : <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-500 border-slate-200">Inactive</Badge>;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  initialWorkflows: WorkflowRow[];
  documentTypes: DmsDocumentTypeRow[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DmsApprovalWorkflowsAdminPageClient({ initialWorkflows, documentTypes }: Props) {
  const qc = useQueryClient();
  const [isPending, startTransition] = useTransition();

  const [workflows, setWorkflows] = useState<WorkflowRow[]>(initialWorkflows);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("active");

  // Dialogs
  const [formOpen, setFormOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowWithSteps | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<WorkflowRow | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  // Sort + filter
  const { sorted, sortKey, sortDir, toggle } = useSortFilter(workflows, search, statusFilter);

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchWorkflows = useCallback(() => {
    startTransition(async () => {
      setLoadError(null);
      const result = await adminListApprovalWorkflows();
      if (result.success && result.data) {
        setWorkflows(result.data);
      } else {
        setLoadError(result.error ?? "Failed to load workflows.");
      }
    });
  }, []);

  useEffect(() => {
    // Only re-fetch on mount if initial data was empty (SSR already populated otherwise)
    if (initialWorkflows.length === 0) fetchWorkflows();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleRefresh = () => {
    fetchWorkflows();
    qc.invalidateQueries({ queryKey: queryKeys.dms.approvalsQueue() });
  };

  const handleNewWorkflow = () => {
    setEditingWorkflow(null);
    setFormOpen(true);
  };

  const handleEditWorkflow = async (row: WorkflowRow) => {
    startTransition(async () => {
      const result = await adminGetApprovalWorkflow(row.id);
      if (result.success && result.data) {
        setEditingWorkflow(result.data);
      } else {
        toast.error(result.error ?? "Failed to load workflow details.");
        return;
      }
      setFormOpen(true);
    });
  };

  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    setDeactivating(true);
    try {
      const result = await adminDeactivateApprovalWorkflow(deactivateTarget.id);
      if (result.success) {
        toast.success(`Workflow "${deactivateTarget.nameEn}" deactivated.`);
        setDeactivateTarget(null);
        fetchWorkflows();
        qc.invalidateQueries({ queryKey: queryKeys.dms.approvalsQueue() });
      } else {
        toast.error(result.error ?? "Failed to deactivate workflow.");
      }
    } finally {
      setDeactivating(false);
    }
  };

  const handleReactivate = async (row: WorkflowRow) => {
    startTransition(async () => {
      const result = await adminUpdateApprovalWorkflow(row.id, { is_active: true });
      if (result.success) {
        toast.success(`Workflow "${row.nameEn}" reactivated.`);
        fetchWorkflows();
        qc.invalidateQueries({ queryKey: queryKeys.dms.approvalsQueue() });
      } else {
        toast.error(result.error ?? "Failed to reactivate workflow.");
      }
    });
  };

  const handleFormSuccess = () => {
    fetchWorkflows();
    qc.invalidateQueries({ queryKey: queryKeys.dms.approvalsQueue() });
    qc.invalidateQueries({ queryKey: ["dms", "approval-workflows"] });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <Input
          placeholder="Search by code or name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs h-8 text-sm"
        />

        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 bg-muted/30">
          {(["all", "active", "inactive"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setStatusFilter(v)}
              className={`px-3 py-1 text-xs rounded-md font-medium transition-colors capitalize ${
                statusFilter === v ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {sorted.length > 0 && (
            <span className="text-xs text-muted-foreground">{sorted.length} workflow{sorted.length !== 1 ? "s" : ""}</span>
          )}
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isPending} className="h-8 gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={handleNewWorkflow} disabled={isPending} className="h-8 gap-1.5">
            <PlusCircle className="h-3.5 w-3.5" />
            New Workflow
          </Button>
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {isPending && workflows.length === 0 ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="px-4 py-3 flex items-center gap-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-48 flex-1" />
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div className="p-8 text-center space-y-3">
            <p className="text-sm text-destructive">{loadError}</p>
            <Button variant="outline" size="sm" onClick={handleRefresh}>Retry</Button>
          </div>
        ) : sorted.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              {search || statusFilter !== "all"
                ? "No workflows match your filters."
                : "No approval workflows configured yet."}
            </p>
            {!search && statusFilter === "all" && (
              <Button size="sm" onClick={handleNewWorkflow} className="gap-1.5 mt-2">
                <PlusCircle className="h-3.5 w-3.5" />
                Create First Workflow
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b border-border">
                <tr>
                  <SortHeader field="workflowCode" label="Code" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
                  <SortHeader field="nameEn" label="Name" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
                  <SortHeader field="documentTypeName" label="Document Type" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
                  <SortHeader field="stepCount" label="Steps" sortKey={sortKey} sortDir={sortDir} onSort={toggle} className="w-16" />
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">Status</th>
                  <SortHeader field="updatedAt" label="Updated" sortKey={sortKey} sortDir={sortDir} onSort={toggle} className="w-32" />
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sorted.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-mono text-xs font-semibold">{row.workflowCode}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium">{row.nameEn}</div>
                      {row.nameAr && <div className="text-xs text-muted-foreground" dir="rtl">{row.nameAr}</div>}
                      {row.description && <div className="text-xs text-muted-foreground/70 line-clamp-1 mt-0.5">{row.description}</div>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs text-muted-foreground">{row.documentTypeName ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center">
                      <Badge variant="outline" className="text-[10px] font-semibold">{row.stepCount}</Badge>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <ActiveBadge active={row.isActive} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs text-muted-foreground">
                        {new Date(row.updatedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 gap-1 text-xs"
                          onClick={() => handleEditWorkflow(row)}
                          disabled={isPending}
                        >
                          <Pencil className="h-3 w-3" />
                          Edit
                        </Button>
                        {row.isActive ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 gap-1 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                            onClick={() => setDeactivateTarget(row)}
                            disabled={isPending}
                          >
                            <Power className="h-3 w-3" />
                            Deactivate
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 gap-1 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                            onClick={() => handleReactivate(row)}
                            disabled={isPending}
                          >
                            <Power className="h-3 w-3" />
                            Reactivate
                          </Button>
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

      {/* ── Form Dialog ────────────────────────────────────────────────────── */}
      <DmsApprovalWorkflowFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editingWorkflow}
        documentTypes={documentTypes}
        onSuccess={handleFormSuccess}
      />

      {/* ── Deactivate Confirmation ─────────────────────────────────────── */}
      <AlertDialog open={!!deactivateTarget} onOpenChange={(o) => { if (!o) setDeactivateTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Workflow?</AlertDialogTitle>
            <AlertDialogDescription>
              Deactivating <strong>{deactivateTarget?.nameEn}</strong> will prevent it from being assigned to new approval submissions.
              Existing in-progress approvals will not be affected. This can be undone by reactivating the workflow.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deactivating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeactivate}
              disabled={deactivating}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {deactivating ? "Deactivating…" : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
