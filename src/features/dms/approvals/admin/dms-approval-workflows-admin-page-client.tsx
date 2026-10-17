"use client";

import { DmsListTools, useDmsListView, type DmsListField } from "@/features/dms/dms-list-view";
import { ConfiguredRow } from "@/components/erp/table/list-controls";

import { useState, useCallback, useTransition, useRef } from "react";
import { usePersistentUiState } from "@/hooks/use-persistent-ui-state";
import { useQueryClient } from "@tanstack/react-query";
import { PlusCircle, RefreshCw, Pencil, Power, ArrowUp, ArrowDown, ArrowUpDown, Loader2 } from "lucide-react";
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
import { getDmsDocumentTypes, type DmsDocumentTypeRow } from "@/server/actions/dms/document-types";
import { queryKeys } from "@/lib/query/query-keys";

// ── Types ─────────────────────────────────────────────────────────────────────

type SortKey = "workflowCode" | "nameEn" | "documentTypeNames" | "stepCount" | "updatedAt";
type SortDir = "asc" | "desc";

function useSortFilter(rows: WorkflowRow[], search: string, statusFilter: "all" | "active" | "inactive") {
  const [sortKey, setSortKey] = useState<SortKey>("workflowCode");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const toggle = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  };

  const filtered = rows.filter((r) => {
    const matchSearch = !search || [r.workflowCode, r.nameEn, r.nameAr ?? "", ...(r.documentTypeNames ?? [])]
      .join(" ").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || (statusFilter === "active" ? r.isActive : !r.isActive);
    return matchSearch && matchStatus;
  });

  const sorted = [...filtered].sort((a, b) => {
    let va: string | number;
    let vb: string | number;
    if (sortKey === "documentTypeNames") {
      va = (a.documentTypeNames ?? []).join(", ").toLowerCase();
      vb = (b.documentTypeNames ?? []).join(", ").toLowerCase();
    } else {
      va = (a[sortKey] ?? "") as string | number;
      vb = (b[sortKey] ?? "") as string | number;
      if (typeof va === "string") va = va.toLowerCase();
      if (typeof vb === "string") vb = vb.toLowerCase();
    }
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
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
      className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 cursor-pointer select-none hover:text-slate-800 transition-colors whitespace-nowrap ${className ?? ""}`}
    >
      <button type="button" onClick={() => onSort(field)} className="inline-flex items-center gap-1 text-foreground focus-visible:outline-2 focus-visible:outline-primary">
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

// ── Status badge ──────────────────────────────────────────────────────────────

function ActiveBadge({ active }: { active: boolean }) {
  return active
    ? <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800">Active</Badge>
    : <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground border-border">Inactive</Badge>;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  initialWorkflows: WorkflowRow[];
  documentTypes: DmsDocumentTypeRow[];
  initialLoadFailed?: boolean;
  initialTypesFailed?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

const DMS_FIELDS: DmsListField[] = [
  {
    "id": "workflowCode",
    "label": "Code",
    "path": "workflowCode",
    "type": "text",
    "width": 160,
    "required": true
  },
  {
    "id": "nameEn",
    "label": "Name",
    "path": "nameEn",
    "type": "text",
    "width": 160
  },
  {
    "id": "types",
    "label": "Document types",
    "type": "text",
    "width": 160
  },
  {
    "id": "stepCount",
    "label": "Steps",
    "path": "stepCount",
    "type": "number",
    "width": 160
  },
  {
    "id": "isActive",
    "label": "Active",
    "path": "isActive",
    "type": "select",
    "width": 160,
    "options": [
      {
        "value": "true",
        "label": "Active"
      },
      {
        "value": "false",
        "label": "Inactive"
      }
    ]
  },
  {
    "id": "updatedAt",
    "label": "Updated",
    "path": "updatedAt",
    "type": "date",
    "width": 160
  },
  {
    "id": "actions",
    "label": "Actions",
    "type": "text",
    "width": 160
  }
];

export function DmsApprovalWorkflowsAdminPageClient({ initialWorkflows, documentTypes: initialDocumentTypes, initialLoadFailed = false, initialTypesFailed = false }: Props) {
  const qc = useQueryClient();
  const [isPending, startTransition] = useTransition();

  const [workflows, setWorkflows] = useState<WorkflowRow[]>(initialWorkflows);
  const [loadError, setLoadError] = useState<string | null>(initialLoadFailed ? "Could not load approval workflows. Retry when connected." : null);
  const [documentTypes, setDocumentTypes] = useState(initialDocumentTypes);
  const [typesFailed, setTypesFailed] = useState(initialTypesFailed);
  const [actionError, setActionError] = useState<string | null>(null);
  const readSequence = useRef(0);

  // Filters
  const [search, setSearch] = usePersistentUiState("dms:workflows:search", "");
  const [statusFilter, setStatusFilter] = usePersistentUiState<"all" | "active" | "inactive">("dms:workflows:status", "active");

  // Dialogs
  const [formOpen, setFormOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowWithSteps | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<WorkflowRow | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  const listView = useDmsListView("workflow-admin", workflows, DMS_FIELDS);
  // Sort + filter
  const { sorted, sortKey, sortDir, toggle } = useSortFilter(listView.rows, search, statusFilter);

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchWorkflows = useCallback(() => {
    const sequence = ++readSequence.current;
    startTransition(async () => {
      setLoadError(null);
      try {
      const [result, types] = await Promise.all([adminListApprovalWorkflows(), getDmsDocumentTypes({ is_active: true })]);
      if (sequence !== readSequence.current) return;
      setTypesFailed(!types.success || !types.data);
      if (types.success && types.data) setDocumentTypes(types.data);
      if (result.success && result.data) {
        setWorkflows(result.data);
      } else {
        setLoadError("Could not load approval workflows. Check your connection and access, then retry.");
      }
      } catch {
        if (sequence === readSequence.current) { setTypesFailed(true); setLoadError("Could not load approval workflows. This does not mean there are no workflows. Retry when connected."); }
      }
    });
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleRefresh = () => {
    fetchWorkflows();
    qc.invalidateQueries({ queryKey: queryKeys.dms.approvalsQueue() });
  };

  // Per-row edit loading state
  const [editingId, setEditingId] = useState<number | null>(null);

  const handleNewWorkflow = () => {
    setEditingWorkflow(null);
    setFormOpen(true);
  };

  const handleEditWorkflow = async (row: WorkflowRow) => {
    setActionError(null);
    setEditingId(row.id);
    startTransition(async () => {
      try {
        const result = await adminGetApprovalWorkflow(row.id);
        if (result.success && result.data) {
          setEditingWorkflow(result.data);
          setFormOpen(true);
        } else {
          toast.error(result.error ?? "Failed to load workflow details.");
        }
      } catch {
        setActionError("Could not load this workflow. Check your connection and access, then try again.");
      } finally {
        setEditingId(null);
      }
    });
  };

  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    setDeactivating(true);
    setActionError(null);
    try {
      const result = await adminDeactivateApprovalWorkflow(deactivateTarget.id, deactivateTarget.updatedAt);
      if (result.success) {
        toast.success(`Workflow "${deactivateTarget.nameEn}" deactivated.`);
        setDeactivateTarget(null);
        fetchWorkflows();
        qc.invalidateQueries({ queryKey: queryKeys.dms.approvalsQueue() });
      } else {
        setActionError("The workflow was not deactivated. Check its current state and your access.");
      }
    } catch {
      setActionError("The change could not be confirmed. Refresh to check the workflow before retrying.");
    } finally {
      setDeactivating(false);
    }
  };

  const handleReactivate = async (row: WorkflowRow) => {
    setActionError(null);
    startTransition(async () => {
      try {
      const result = await adminUpdateApprovalWorkflow(row.id, { is_active: true, expected_updated_at: row.updatedAt });
      if (result.success) {
        toast.success(`Workflow "${row.nameEn}" reactivated.`);
        fetchWorkflows();
        qc.invalidateQueries({ queryKey: queryKeys.dms.approvalsQueue() });
      } else {
        setActionError("The workflow was not reactivated. Check its current state and your access.");
      }
      } catch { setActionError("The change could not be confirmed. Refresh to check the workflow before retrying."); }
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
      {typesFailed && <p role="alert" className="rounded border border-destructive/40 p-3 text-sm text-destructive">Document types could not be loaded. Refresh before creating or editing a workflow; unavailable choices are not an empty selection.</p>}
      {actionError && <p role="alert" className="rounded border border-destructive/40 p-3 text-sm text-destructive">{actionError}</p>}

      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <Input aria-label="Search workflows"
          placeholder="Search by code or name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs h-8 text-sm"
        />

        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 bg-muted/30">
          {(["all", "active", "inactive"] as const).map((v) => (
            <button
              type="button" aria-pressed={statusFilter === v}
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
          <Button size="sm" onClick={handleNewWorkflow} disabled={isPending || typesFailed || !!loadError} className="h-8 gap-1.5">
            <PlusCircle className="h-3.5 w-3.5" />
            New Workflow
          </Button>
        </div>
      </div>

      <DmsListTools view={listView} />
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
            <p role="alert" className="text-sm text-destructive">{loadError}</p>
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
            <div role="region" aria-label="workflow-admin table" tabIndex={0} className="max-w-full overflow-x-auto"><table className="w-full table-fixed text-sm" style={{ minWidth: listView.visible.reduce((sum, column) => sum + column.width, 0) }}><colgroup>{listView.visible.map(column => <col key={column.id} style={{ width: column.width }} />)}</colgroup>
              <thead className="bg-muted/40 border-b border-border">
                <ConfiguredRow columns={listView.columns}>
                  <SortHeader data-column="workflowCode" field="workflowCode" label="Code" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
                  <SortHeader data-column="nameEn" field="nameEn" label="Name" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
                  <SortHeader data-column="types" field="documentTypeNames" label="Document Types" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
                  <SortHeader data-column="stepCount" field="stepCount" label="Steps" sortKey={sortKey} sortDir={sortDir} onSort={toggle} className="w-16" />
                  <th data-column="isActive" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">Status</th>
                  <SortHeader data-column="updatedAt" field="updatedAt" label="Updated" sortKey={sortKey} sortDir={sortDir} onSort={toggle} className="w-32" />
                  <th data-column="actions" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">Actions</th>
                </ConfiguredRow>
              </thead>
              <tbody className="divide-y divide-border">
                {sorted.map((row) => (
                  <ConfiguredRow columns={listView.columns} key={row.id} className="hover:bg-muted/30 transition-colors">
                    <td data-column="workflowCode" className="px-4 py-3 whitespace-nowrap">
                      <span className="font-mono text-xs font-semibold">{row.workflowCode}</span>
                    </td>
                    <td data-column="nameEn" className="px-4 py-3">
                      <div className="text-sm font-medium">{row.nameEn}</div>
                      {row.nameAr && <div className="text-xs text-muted-foreground" dir="rtl">{row.nameAr}</div>}
                      {row.description && <div className="text-xs text-muted-foreground/70 line-clamp-1 mt-0.5">{row.description}</div>}
                    </td>
                    <td data-column="types" className="px-4 py-3">
                      {(row.documentTypeNames ?? []).length === 0 ? (
                        <span className="text-xs text-muted-foreground/50">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {row.documentTypeNames.slice(0, 2).map((name) => (
                            <Badge key={name} variant="secondary" className="text-[10px] font-normal px-1.5 py-0.5">
                              {name}
                            </Badge>
                          ))}
                          {row.documentTypeNames.length > 2 && (
                            <Badge variant="outline" className="text-[10px] font-normal px-1.5 py-0.5 text-muted-foreground">
                              +{row.documentTypeNames.length - 2} more
                            </Badge>
                          )}
                        </div>
                      )}
                    </td>
                    <td data-column="stepCount" className="px-4 py-3 whitespace-nowrap text-center">
                      <Badge variant="outline" className="text-[10px] font-semibold">{row.stepCount}</Badge>
                    </td>
                    <td data-column="isActive" className="px-4 py-3 whitespace-nowrap">
                      <ActiveBadge active={row.isActive} />
                    </td>
                    <td data-column="updatedAt" className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs text-muted-foreground">
                        {new Date(row.updatedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                      </span>
                    </td>
                    <td data-column="actions" className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 gap-1 text-xs"
                          onClick={() => handleEditWorkflow(row)}
                          disabled={isPending || typesFailed || editingId === row.id}
                        >
                          {editingId === row.id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Pencil className="h-3 w-3" />}
                          Edit
                        </Button>
                        {row.isActive ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 gap-1 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:text-amber-200 dark:hover:bg-amber-950"
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
                            className="h-7 px-2 gap-1 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:text-emerald-200 dark:hover:bg-emerald-950"
                            onClick={() => handleReactivate(row)}
                            disabled={isPending}
                          >
                            <Power className="h-3 w-3" />
                            Reactivate
                          </Button>
                        )}
                      </div>
                    </td>
                  </ConfiguredRow>
                ))}
              </tbody>
            </table></div>
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
