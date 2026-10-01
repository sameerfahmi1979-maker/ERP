"use client";
import { useGuardedTransition as useTransition } from "@/hooks/use-guarded-transition";
import { RecordCollection } from "@/components/erp/table/record-collection";
import { QueryReadBoundary } from "@/components/erp/query-read-boundary";

/**
 * ERP HR.7 — Employee HR Actions Tab
 *
 * 7 sections:
 *   1. PRO Processes
 *   2. HR Actions
 *   3. Performance
 *   4. Disciplinary & Warnings
 *   5. HR Notes
 *   6. Approval Requests
 *   7. EOS & Clearance
 */

import { ERPCombobox } from "@/components/erp/combobox";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  invalidateHrEmployeeActions,
  invalidateHrEmployeeApprovals,
  invalidateHrEmployeeClearance,
  invalidateHrEmployeeDisciplinary,
  invalidateHrEmployeeEos,
  invalidateHrEmployeeHrActions,
  invalidateHrEmployeeNotes,
  invalidateHrEmployeePerformance,
  invalidateHrEmployeeProProcesses,
} from "@/lib/query/invalidation";
import { queryKeys } from "@/lib/query/query-keys";
import type { AuthContext } from "@/lib/rbac/check";
import {
  acknowledgeEmployeeDisciplinaryRecord,
  approveEmployeeApprovalRequest,
  approveEmployeePerformanceRecord,
  archiveEmployeeDisciplinaryRecord,
  archiveEmployeeHrAction,
  archiveEmployeeHrNote,
  archiveEmployeePerformanceRecord,
  archiveEmployeeProProcess,
  blockEmployeeClearanceItem,
  cancelEmployeeApprovalRequest,
  clearEmployeeClearanceItem,
  closeEmployeeHrAction,
  createEmployeeApprovalRequest,
  createEmployeeClearanceItem,
  createEmployeeDisciplinaryRecord,
  createEmployeeEosCase,
  createEmployeeHrAction,
  createEmployeeHrNote,
  createEmployeePerformanceRecord,
  createEmployeeProProcess,
  listEmployeeApprovalRequests,
  listEmployeeClearanceItems,
  listEmployeeDisciplinaryRecords,
  listEmployeeEosCases,
  listEmployeeHrActions,
  listEmployeeHrNotes,
  listEmployeePerformanceRecords,
  listEmployeeProProcesses,
  rejectEmployeeApprovalRequest,
  submitEmployeePerformanceRecord,
  updateEmployeeDisciplinaryRecord,
  updateEmployeeEosCase,
  updateEmployeeHrAction,
  updateEmployeePerformanceRecord,
  updateEmployeeProProcess,
  type DisciplinaryRow,
  type EosCaseRow,
  type HrActionRow, type PerformanceRow,
  type ProProcessRow
} from "@/server/actions/hr/actions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  Archive, CheckCircle,
  CheckSquare,
  Edit2,
  Globe,
  Plus,
  StickyNote,
  TrendingUp,
  UserMinus,
  XCircle,
  Zap
} from "lucide-react";
import { useCallback, useState} from "react";
import { toast } from "sonner";

// ─── Types ─────────────────────────────────────────────────────────────────

type Props = {
  employeeId: number;
  authContext: AuthContext;
  onChildOpen?: (open: boolean) => void;
};

// ─── Status helpers ─────────────────────────────────────────────────────────

function statusBadge(status: string, type: "process" | "action" | "perf" | "disc" | "approval" | "eos" | "clearance") {
  const color: Record<string, string> = {
    // process
    draft: "bg-muted text-foreground",
    requested: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-200",
    in_progress: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200",
    waiting_for_document: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-200",
    submitted: "bg-indigo-100 text-indigo-700",
    approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
    rejected: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200",
    cancelled: "bg-muted text-muted-foreground",
    completed: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-200",
    // actions
    open: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-200",
    closed: "bg-muted text-muted-foreground",
    // performance
    // perf uses same as process
    // disciplinary
    under_review: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200",
    // approvals
    pending: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200",
    // eos
    notice_served: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-200",
    clearance_in_progress: "bg-indigo-100 text-indigo-700",
    pending_final_settlement: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-200",
    // clearance items
    cleared: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-200",
    not_applicable: "bg-muted text-muted-foreground",
    blocked: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200",
  };
  const label = status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color[status] ?? "bg-muted text-muted-foreground"}`}>
      {label}
    </span>
  );
}

function severityBadge(severity: string) {
  const map: Record<string, string> = {
    low: "bg-muted text-muted-foreground",
    medium: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200",
    high: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-200",
    critical: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${map[severity] ?? "bg-muted text-muted-foreground"}`}>
      {severity.charAt(0).toUpperCase() + severity.slice(1)}
    </span>
  );
}

// ─── Section header ──────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, count, onAdd, addLabel }: {
  icon: React.ElementType;
  title: string;
  count?: number;
  onAdd?: () => void;
  addLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="font-semibold text-sm text-foreground">{title}</span>
        {count !== undefined && (
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{count}</span>
        )}
      </div>
      {onAdd && (
        <Button size="sm" variant="outline" onClick={onAdd} className="gap-1 h-7 text-xs">
          <Plus className="h-3 w-3" /> {addLabel ?? "Add"}
        </Button>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="text-center py-8 text-sm text-muted-foreground">{text}</div>;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function EmployeeHrActionsTab({ employeeId, authContext, onChildOpen }: Props) {
  const qc = useQueryClient();
  const canManage = authContext.permissionCodes.includes("hr.actions.manage") ||
    authContext.roleCodes.includes("system_admin") || authContext.roleCodes.includes("group_admin");

  const setDialogOpen = useCallback((open: boolean) => {
    onChildOpen?.(open);
  }, [onChildOpen]);

  return (
    <div className="space-y-8 pb-8">
      <ProProcessesSection employeeId={employeeId} canManage={canManage} qc={qc} onChildOpen={setDialogOpen} />
      <HrActionsSection employeeId={employeeId} canManage={canManage} qc={qc} onChildOpen={setDialogOpen} />
      <PerformanceSection employeeId={employeeId} canManage={canManage} qc={qc} onChildOpen={setDialogOpen} />
      <DisciplinarySection employeeId={employeeId} canManage={canManage} qc={qc} onChildOpen={setDialogOpen} />
      <HrNotesSection employeeId={employeeId} canManage={canManage} qc={qc} onChildOpen={setDialogOpen} />
      <ApprovalsSection employeeId={employeeId} canManage={canManage} qc={qc} onChildOpen={setDialogOpen} />
      <EosSection employeeId={employeeId} canManage={canManage} qc={qc} onChildOpen={setDialogOpen} />
    </div>
  );
}

// =============================================================================
// 1. PRO PROCESSES
// =============================================================================

function ProProcessesSection({ employeeId, canManage, qc, onChildOpen }: {
  employeeId: number; canManage: boolean; qc: ReturnType<typeof useQueryClient>; onChildOpen: (open: boolean) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProProcessRow | null>(null);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({ process_title: "", process_status: "draft", priority: "normal", request_date: new Date().toISOString().split("T")[0], target_date: "", notes: "" });

  const uiRead1 = useQuery({
    queryKey: queryKeys.hr.actions.proProcesses(employeeId),
    queryFn: () => listEmployeeProProcesses(employeeId),
  });
  const { data: items = [], isLoading } = uiRead1;

  const openDialog = (item?: ProProcessRow) => {
    setEditing(item ?? null);
    if (item) {
      setForm({ process_title: item.process_title, process_status: item.process_status, priority: item.priority, request_date: item.request_date, target_date: item.target_date ?? "", notes: item.notes ?? "" });
    } else {
      setForm({ process_title: "", process_status: "draft", priority: "normal", request_date: new Date().toISOString().split("T")[0], target_date: "", notes: "" });
    }
    setDialogOpen(true);
    onChildOpen(true);
  };

  const handleClose = () => { setDialogOpen(false); onChildOpen(false); };

  const handleSubmit = () => {
    startTransition(async () => {
      const input = { ...form, target_date: form.target_date || null, notes: form.notes || null };
      const result = editing
        ? await updateEmployeeProProcess(editing.id, input)
        : await createEmployeeProProcess(employeeId, input);
      if (result.success) {
        toast.success(editing ? "PRO process updated" : "PRO process created");
        invalidateHrEmployeeProProcesses(qc, employeeId);
        invalidateHrEmployeeActions(qc, employeeId);
        handleClose();
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleArchive = (id: number) => {
    startTransition(async () => {
      const result = await archiveEmployeeProProcess(id);
      if (result.success) { toast.success("Archived"); invalidateHrEmployeeProProcesses(qc, employeeId); }
      else toast.error(result.error);
    });
  };

  const PRO_STATUSES = ["draft","requested","in_progress","waiting_for_document","submitted","approved","rejected","cancelled","completed"].map(s => ({ value: s, label: s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) }));
  const PRIORITIES = ["low","normal","high","urgent"].map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }));

  return (
    <QueryReadBoundary queries={[uiRead1]}><div className="rounded-lg border bg-card p-4">
      <SectionHeader icon={Globe} title="PRO Processes" count={items.length} onAdd={canManage ? () => openDialog() : undefined} addLabel="Add Process" />
      {isLoading ? <Skeleton className="h-16 w-full" /> : items.length === 0 ? <EmptyState text="No PRO processes recorded." /> : (
        <div className="space-y-2">
          <RecordCollection id="hr.employee-hr-actions-tab.ProProcessesSection.items" rows={items} fields={[{"id":"process_title","path":"process_title","label":"Process Title"},{"id":"process_status","path":"process_status","label":"Process Status"},{"id":"request_date","path":"request_date","label":"Request Date"}]} renderRecord={item => (
            <div key={item.id} className="flex items-start justify-between p-3 rounded border bg-background hover:bg-accent/30 transition">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{item.process_title}</span>
                  {statusBadge(item.process_status, "process")}
                  <span className={`text-xs px-1.5 py-0.5 rounded ${item.priority === "urgent" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200" : item.priority === "high" ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-200" : "bg-muted text-muted-foreground"}`}>{item.priority}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">Requested: {item.request_date}{item.target_date ? ` · Target: ${item.target_date}` : ""}</div>
              </div>
              {canManage && (
                <div className="flex gap-1 ml-2 shrink-0">
                  <Button aria-label="Edit record" size="icon" variant="ghost" className="h-7 w-7" onClick={() => openDialog(item)}><Edit2 className="h-3.5 w-3.5" /></Button>
                  <Button aria-label="Archive record" size="icon" variant="ghost" className="h-7 w-7 text-red-500 dark:text-red-300" onClick={() => handleArchive(item.id)}><Archive className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </div>
          )} />
        </div>
      )}

      <ERPChildDialogForm
        open={dialogOpen}
        onOpenChange={handleClose}
        title={editing ? "Edit PRO Process" : "Add PRO Process"}
        icon={<Globe className="h-5 w-5" />}
        mode={editing ? "edit" : "add"}
        isSubmitting={isPending}
        onSubmit={handleSubmit}
        size="lg"
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12">
            <Label>Process Title <span className="text-red-500 dark:text-red-300">*</span></Label>
            <Input aria-label="Process Title" required value={form.process_title} onChange={e => setForm(f => ({ ...f, process_title: e.target.value }))} placeholder="e.g. Visa Renewal" />
          </div>
          <div className="col-span-6">
            <Label>Status</Label>
            <ERPCombobox ariaLabel="Status" value={form.process_status} onValueChange={v => setForm(f => ({ ...f, process_status: String(v ?? "") }))} options={PRO_STATUSES} placeholder="Select status" />
          </div>
          <div className="col-span-6">
            <Label>Priority</Label>
            <ERPCombobox ariaLabel="Priority" value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: String(v ?? "") }))} options={PRIORITIES} placeholder="Select priority" />
          </div>
          <div className="col-span-6">
            <Label>Request Date <span className="text-red-500 dark:text-red-300">*</span></Label>
            <Input aria-label="Request Date" required type="date" value={form.request_date} onChange={e => setForm(f => ({ ...f, request_date: e.target.value }))} />
          </div>
          <div className="col-span-6">
            <Label>Target Date</Label>
            <Input aria-label="Target Date" type="date" value={form.target_date} onChange={e => setForm(f => ({ ...f, target_date: e.target.value }))} />
          </div>
          <div className="col-span-12">
            <Label>Notes</Label>
            <Textarea aria-label="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
          </div>
        </div>
      </ERPChildDialogForm>
    </div></QueryReadBoundary>
  );
}

// =============================================================================
// 2. HR ACTIONS
// =============================================================================

function HrActionsSection({ employeeId, canManage, qc, onChildOpen }: {
  employeeId: number; canManage: boolean; qc: ReturnType<typeof useQueryClient>; onChildOpen: (open: boolean) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<HrActionRow | null>(null);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({ action_type: "general", action_title: "", action_status: "open", action_date: new Date().toISOString().split("T")[0], due_date: "", notes: "" });

  const uiRead1 = useQuery({
    queryKey: queryKeys.hr.actions.hrActions(employeeId),
    queryFn: () => listEmployeeHrActions(employeeId),
  });
  const { data: items = [], isLoading } = uiRead1;

  const openDialog = (item?: HrActionRow) => {
    setEditing(item ?? null);
    if (item) {
      setForm({ action_type: item.action_type, action_title: item.action_title, action_status: item.action_status, action_date: item.action_date, due_date: item.due_date ?? "", notes: item.notes ?? "" });
    } else {
      setForm({ action_type: "general", action_title: "", action_status: "open", action_date: new Date().toISOString().split("T")[0], due_date: "", notes: "" });
    }
    setDialogOpen(true);
    onChildOpen(true);
  };

  const handleClose = () => { setDialogOpen(false); onChildOpen(false); };

  const handleSubmit = () => {
    startTransition(async () => {
      const input = { ...form, due_date: form.due_date || null, notes: form.notes || null };
      const result = editing ? await updateEmployeeHrAction(editing.id, input) : await createEmployeeHrAction(employeeId, input);
      if (result.success) {
        toast.success(editing ? "HR action updated" : "HR action created");
        invalidateHrEmployeeHrActions(qc, employeeId);
        invalidateHrEmployeeActions(qc, employeeId);
        handleClose();
      } else toast.error(result.error);
    });
  };

  const handleClose2 = (id: number, notes?: string) => {
    startTransition(async () => {
      const result = await closeEmployeeHrAction(id, notes);
      if (result.success) { toast.success("Action closed"); invalidateHrEmployeeHrActions(qc, employeeId); }
      else toast.error(result.error);
    });
  };

  const ACTION_TYPES = ["general","probation_review","transfer","promotion","increment_recommendation","status_change","warning","memo","other"].map(s => ({ value: s, label: s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) }));
  const ACTION_STATUSES = ["open","in_progress","closed","cancelled"].map(s => ({ value: s, label: s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) }));

  return (
    <QueryReadBoundary queries={[uiRead1]}><div className="rounded-lg border bg-card p-4">
      <SectionHeader icon={Zap} title="HR Actions" count={items.length} onAdd={canManage ? () => openDialog() : undefined} addLabel="Add Action" />
      {isLoading ? <Skeleton className="h-16 w-full" /> : items.length === 0 ? <EmptyState text="No HR actions recorded." /> : (
        <div className="space-y-2">
          <RecordCollection id="hr.employee-hr-actions-tab.HrActionsSection.items" rows={items} fields={[{"id":"action_title","path":"action_title","label":"Action Title"},{"id":"action_status","path":"action_status","label":"Action Status"},{"id":"action_date","path":"action_date","label":"Action Date"}]} renderRecord={item => (
            <div key={item.id} className="flex items-start justify-between p-3 rounded border bg-background hover:bg-accent/30 transition">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{item.action_title}</span>
                  {statusBadge(item.action_status, "action")}
                  <span className="text-xs text-muted-foreground">{item.action_type.replace(/_/g, " ")}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{item.action_date}{item.due_date ? ` · Due: ${item.due_date}` : ""}</div>
              </div>
              {canManage && (
                <div className="flex gap-1 ml-2 shrink-0">
                  <Button aria-label="Edit record" size="icon" variant="ghost" className="h-7 w-7" onClick={() => openDialog(item)}><Edit2 className="h-3.5 w-3.5" /></Button>
                  {item.action_status === "open" || item.action_status === "in_progress" ? (
                    <Button aria-label="Close" size="icon" variant="ghost" className="h-7 w-7 text-green-600 dark:text-green-300" title="Close" onClick={() => handleClose2(item.id)}><CheckCircle className="h-3.5 w-3.5" /></Button>
                  ) : null}
                  <Button aria-label="Archive record" size="icon" variant="ghost" className="h-7 w-7 text-red-500 dark:text-red-300" onClick={async () => { const r = await archiveEmployeeHrAction(item.id); if (r.success) { toast.success("Archived"); invalidateHrEmployeeHrActions(qc, employeeId); } else toast.error(r.error); }}><Archive className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </div>
          )} />
        </div>
      )}

      <ERPChildDialogForm open={dialogOpen} onOpenChange={handleClose} title={editing ? "Edit HR Action" : "Add HR Action"} icon={<Zap className="h-5 w-5" />} mode={editing ? "edit" : "add"} isSubmitting={isPending} onSubmit={handleSubmit} size="lg">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-8">
            <Label>Action Title <span className="text-red-500 dark:text-red-300">*</span></Label>
            <Input aria-label="Action Title" required value={form.action_title} onChange={e => setForm(f => ({ ...f, action_title: e.target.value }))} placeholder="e.g. Probation Review" />
          </div>
          <div className="col-span-4">
            <Label>Type</Label>
            <ERPCombobox ariaLabel="Type" value={form.action_type} onValueChange={v => setForm(f => ({ ...f, action_type: String(v ?? "") }))} options={ACTION_TYPES} placeholder="Select type" />
          </div>
          <div className="col-span-4">
            <Label>Status</Label>
            <ERPCombobox ariaLabel="Status" value={form.action_status} onValueChange={v => setForm(f => ({ ...f, action_status: String(v ?? "") }))} options={ACTION_STATUSES} placeholder="Select status" />
          </div>
          <div className="col-span-4">
            <Label>Action Date <span className="text-red-500 dark:text-red-300">*</span></Label>
            <Input aria-label="Action Date" required type="date" value={form.action_date} onChange={e => setForm(f => ({ ...f, action_date: e.target.value }))} />
          </div>
          <div className="col-span-4">
            <Label>Due Date</Label>
            <Input aria-label="Due Date" type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
          </div>
          <div className="col-span-12">
            <Label>Notes</Label>
            <Textarea aria-label="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
          </div>
        </div>
      </ERPChildDialogForm>
    </div></QueryReadBoundary>
  );
}

// =============================================================================
// 3. PERFORMANCE
// =============================================================================

function PerformanceSection({ employeeId, canManage, qc, onChildOpen }: {
  employeeId: number; canManage: boolean; qc: ReturnType<typeof useQueryClient>; onChildOpen: (open: boolean) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PerformanceRow | null>(null);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({ review_type: "annual", review_date: new Date().toISOString().split("T")[0], rating: "", summary: "", status: "draft" });

  const uiRead1 = useQuery({
    queryKey: queryKeys.hr.actions.performance(employeeId),
    queryFn: () => listEmployeePerformanceRecords(employeeId),
  });
  const { data: items = [], isLoading } = uiRead1;

  const openDialog = (item?: PerformanceRow) => {
    setEditing(item ?? null);
    if (item) {
      setForm({ review_type: item.review_type, review_date: item.review_date, rating: item.rating ?? "", summary: item.summary ?? "", status: item.status });
    } else {
      setForm({ review_type: "annual", review_date: new Date().toISOString().split("T")[0], rating: "", summary: "", status: "draft" });
    }
    setDialogOpen(true);
    onChildOpen(true);
  };

  const handleClose = () => { setDialogOpen(false); onChildOpen(false); };

  const handleSubmit = () => {
    startTransition(async () => {
      const input = { ...form, rating: form.rating || null, summary: form.summary || null };
      const result = editing ? await updateEmployeePerformanceRecord(editing.id, input) : await createEmployeePerformanceRecord(employeeId, input);
      if (result.success) {
        toast.success(editing ? "Review updated" : "Review created");
        invalidateHrEmployeePerformance(qc, employeeId);
        invalidateHrEmployeeActions(qc, employeeId);
        handleClose();
      } else toast.error(result.error);
    });
  };

  const REVIEW_TYPES = ["probation","annual","project","incident_followup","other"].map(s => ({ value: s, label: s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) }));
  const RATINGS = ["excellent","good","satisfactory","needs_improvement","unsatisfactory"].map(s => ({ value: s, label: s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) }));
  const PERF_STATUSES = ["draft","submitted","approved","closed","cancelled"].map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }));

  return (
    <QueryReadBoundary queries={[uiRead1]}><div className="rounded-lg border bg-card p-4">
      <SectionHeader icon={TrendingUp} title="Performance Reviews" count={items.length} onAdd={canManage ? () => openDialog() : undefined} addLabel="Add Review" />
      {isLoading ? <Skeleton className="h-16 w-full" /> : items.length === 0 ? <EmptyState text="No performance reviews recorded." /> : (
        <div className="space-y-2">
          <RecordCollection id="hr.employee-hr-actions-tab.PerformanceSection.items" rows={items} fields={[{"id":"review_period_start","path":"review_period_start","label":"Review Period Start"},{"id":"status","path":"status","label":"Status"}]} renderRecord={item => (
            <div key={item.id} className="flex items-start justify-between p-3 rounded border bg-background hover:bg-accent/30 transition">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm capitalize">{item.review_type.replace(/_/g, " ")} Review</span>
                  {statusBadge(item.status, "perf")}
                  {item.rating && <span className="text-xs text-muted-foreground capitalize">{item.rating.replace(/_/g, " ")}</span>}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{item.review_date}</div>
              </div>
              {canManage && (
                <div className="flex gap-1 ml-2 shrink-0">
                  {item.status === "draft" && <Button aria-label="Edit record" size="icon" variant="ghost" className="h-7 w-7" onClick={() => openDialog(item)}><Edit2 className="h-3.5 w-3.5" /></Button>}
                  {item.status === "draft" && <Button aria-label="Submit" size="icon" variant="ghost" className="h-7 w-7 text-blue-500 dark:text-blue-300" title="Submit" onClick={async () => { const r = await submitEmployeePerformanceRecord(item.id); if (r.success) { toast.success("Submitted"); invalidateHrEmployeePerformance(qc, employeeId); } else toast.error(r.error); }}><CheckSquare className="h-3.5 w-3.5" /></Button>}
                  {item.status === "submitted" && <Button aria-label="Approve" size="icon" variant="ghost" className="h-7 w-7 text-green-600 dark:text-green-300" title="Approve" onClick={async () => { const r = await approveEmployeePerformanceRecord(item.id); if (r.success) { toast.success("Approved"); invalidateHrEmployeePerformance(qc, employeeId); } else toast.error(r.error); }}><CheckCircle className="h-3.5 w-3.5" /></Button>}
                  <Button aria-label="Archive record" size="icon" variant="ghost" className="h-7 w-7 text-red-500 dark:text-red-300" onClick={async () => { const r = await archiveEmployeePerformanceRecord(item.id); if (r.success) { toast.success("Archived"); invalidateHrEmployeePerformance(qc, employeeId); } else toast.error(r.error); }}><Archive className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </div>
          )} />
        </div>
      )}

      <ERPChildDialogForm open={dialogOpen} onOpenChange={handleClose} title={editing ? "Edit Performance Review" : "Add Performance Review"} icon={<TrendingUp className="h-5 w-5" />} mode={editing ? "edit" : "add"} isSubmitting={isPending} onSubmit={handleSubmit} size="lg">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-6">
            <Label>Review Type <span className="text-red-500 dark:text-red-300">*</span></Label>
            <ERPCombobox ariaLabel="Review Type" required value={form.review_type} onValueChange={v => setForm(f => ({ ...f, review_type: String(v ?? "") }))} options={REVIEW_TYPES} placeholder="Select type" />
          </div>
          <div className="col-span-6">
            <Label>Review Date <span className="text-red-500 dark:text-red-300">*</span></Label>
            <Input aria-label="Review Date" required type="date" value={form.review_date} onChange={e => setForm(f => ({ ...f, review_date: e.target.value }))} />
          </div>
          <div className="col-span-6">
            <Label>Rating</Label>
            <ERPCombobox ariaLabel="Rating" value={form.rating} onValueChange={v => setForm(f => ({ ...f, rating: String(v ?? "") }))} options={RATINGS} placeholder="Select rating" />
          </div>
          <div className="col-span-6">
            <Label>Status</Label>
            <ERPCombobox ariaLabel="Status" value={form.status} onValueChange={v => setForm(f => ({ ...f, status: String(v ?? "") }))} options={PERF_STATUSES} placeholder="Select status" />
          </div>
          <div className="col-span-12">
            <Label>Summary</Label>
            <Textarea aria-label="Summary" value={form.summary} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))} rows={3} />
          </div>
        </div>
      </ERPChildDialogForm>
    </div></QueryReadBoundary>
  );
}

// =============================================================================
// 4. DISCIPLINARY
// =============================================================================

function DisciplinarySection({ employeeId, canManage, qc, onChildOpen }: {
  employeeId: number; canManage: boolean; qc: ReturnType<typeof useQueryClient>; onChildOpen: (open: boolean) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DisciplinaryRow | null>(null);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({ disciplinary_type: "verbal_warning", record_date: new Date().toISOString().split("T")[0], severity: "medium", subject: "", description: "", status: "open" });

  const uiRead1 = useQuery({
    queryKey: queryKeys.hr.actions.disciplinary(employeeId),
    queryFn: () => listEmployeeDisciplinaryRecords(employeeId),
  });
  const { data: items = [], isLoading } = uiRead1;

  const openDialog = (item?: DisciplinaryRow) => {
    setEditing(item ?? null);
    if (item) {
      setForm({ disciplinary_type: item.disciplinary_type, record_date: item.record_date, severity: item.severity, subject: item.subject, description: item.description ?? "", status: item.status });
    } else {
      setForm({ disciplinary_type: "verbal_warning", record_date: new Date().toISOString().split("T")[0], severity: "medium", subject: "", description: "", status: "open" });
    }
    setDialogOpen(true);
    onChildOpen(true);
  };

  const handleClose = () => { setDialogOpen(false); onChildOpen(false); };

  const handleSubmit = () => {
    startTransition(async () => {
      const input = { ...form, description: form.description || null };
      const result = editing ? await updateEmployeeDisciplinaryRecord(editing.id, input) : await createEmployeeDisciplinaryRecord(employeeId, input);
      if (result.success) {
        toast.success(editing ? "Record updated" : "Disciplinary record created");
        invalidateHrEmployeeDisciplinary(qc, employeeId);
        invalidateHrEmployeeActions(qc, employeeId);
        handleClose();
      } else toast.error(result.error);
    });
  };

  const DISC_TYPES = ["verbal_warning","written_warning","final_warning","suspension_notice","incident","other"].map(s => ({ value: s, label: s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) }));
  const SEVERITIES = ["low","medium","high","critical"].map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }));
  const DISC_STATUSES = ["open","under_review","closed","cancelled"].map(s => ({ value: s, label: s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) }));

  return (
    <QueryReadBoundary queries={[uiRead1]}><div className="rounded-lg border bg-card p-4">
      <SectionHeader icon={AlertTriangle} title="Disciplinary & Warnings" count={items.length} onAdd={canManage ? () => openDialog() : undefined} addLabel="Add Record" />
      {isLoading ? <Skeleton className="h-16 w-full" /> : items.length === 0 ? <EmptyState text="No disciplinary records." /> : (
        <div className="space-y-2">
          <RecordCollection id="hr.employee-hr-actions-tab.DisciplinarySection.items" rows={items} fields={[{"id":"incident_date","path":"incident_date","label":"Incident Date"},{"id":"status","path":"status","label":"Status"}]} renderRecord={item => (
            <div key={item.id} className="flex items-start justify-between p-3 rounded border bg-background hover:bg-accent/30 transition">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{item.subject}</span>
                  {severityBadge(item.severity)}
                  {statusBadge(item.status, "disc")}
                  <span className="text-xs text-muted-foreground capitalize">{item.disciplinary_type.replace(/_/g, " ")}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{item.record_date}{item.acknowledged_by_employee ? " · ✓ Acknowledged" : ""}</div>
              </div>
              {canManage && (
                <div className="flex gap-1 ml-2 shrink-0">
                  <Button aria-label="Edit record" size="icon" variant="ghost" className="h-7 w-7" onClick={() => openDialog(item)}><Edit2 className="h-3.5 w-3.5" /></Button>
                  {!item.acknowledged_by_employee && (
                    <Button aria-label="Mark acknowledged" size="icon" variant="ghost" className="h-7 w-7 text-blue-500 dark:text-blue-300" title="Mark acknowledged" onClick={async () => { const r = await acknowledgeEmployeeDisciplinaryRecord(item.id); if (r.success) { toast.success("Acknowledged"); invalidateHrEmployeeDisciplinary(qc, employeeId); } else toast.error(r.error); }}><CheckCircle className="h-3.5 w-3.5" /></Button>
                  )}
                  <Button aria-label="Archive record" size="icon" variant="ghost" className="h-7 w-7 text-red-500 dark:text-red-300" onClick={async () => { const r = await archiveEmployeeDisciplinaryRecord(item.id); if (r.success) { toast.success("Archived"); invalidateHrEmployeeDisciplinary(qc, employeeId); } else toast.error(r.error); }}><Archive className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </div>
          )} />
        </div>
      )}

      <ERPChildDialogForm open={dialogOpen} onOpenChange={handleClose} title={editing ? "Edit Disciplinary Record" : "Add Disciplinary Record"} icon={<AlertTriangle className="h-5 w-5" />} mode={editing ? "edit" : "add"} isSubmitting={isPending} onSubmit={handleSubmit} size="lg">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-8">
            <Label>Subject <span className="text-red-500 dark:text-red-300">*</span></Label>
            <Input aria-label="Subject" required value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="Brief description of the issue" />
          </div>
          <div className="col-span-4">
            <Label>Record Date <span className="text-red-500 dark:text-red-300">*</span></Label>
            <Input aria-label="Record Date" required type="date" value={form.record_date} onChange={e => setForm(f => ({ ...f, record_date: e.target.value }))} />
          </div>
          <div className="col-span-4">
            <Label>Type <span className="text-red-500 dark:text-red-300">*</span></Label>
            <ERPCombobox ariaLabel="Type" required value={form.disciplinary_type} onValueChange={v => setForm(f => ({ ...f, disciplinary_type: String(v ?? "") }))} options={DISC_TYPES} placeholder="Select type" />
          </div>
          <div className="col-span-4">
            <Label>Severity</Label>
            <ERPCombobox ariaLabel="Severity" value={form.severity} onValueChange={v => setForm(f => ({ ...f, severity: String(v ?? "") }))} options={SEVERITIES} placeholder="Select severity" />
          </div>
          <div className="col-span-4">
            <Label>Status</Label>
            <ERPCombobox ariaLabel="Status" value={form.status} onValueChange={v => setForm(f => ({ ...f, status: String(v ?? "") }))} options={DISC_STATUSES} placeholder="Select status" />
          </div>
          <div className="col-span-12">
            <Label>Description</Label>
            <Textarea aria-label="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} />
          </div>
        </div>
      </ERPChildDialogForm>
    </div></QueryReadBoundary>
  );
}

// =============================================================================
// 5. HR NOTES
// =============================================================================

function HrNotesSection({ employeeId, canManage, qc, onChildOpen }: {
  employeeId: number; canManage: boolean; qc: ReturnType<typeof useQueryClient>; onChildOpen: (open: boolean) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({ note_type: "general", note_text: "", visibility: "hr_only" });

  const uiRead1 = useQuery({
    queryKey: queryKeys.hr.actions.notes(employeeId),
    queryFn: () => listEmployeeHrNotes(employeeId),
  });
  const { data: items = [], isLoading } = uiRead1;

  const openDialog = () => {
    setForm({ note_type: "general", note_text: "", visibility: "hr_only" });
    setDialogOpen(true);
    onChildOpen(true);
  };
  const handleClose = () => { setDialogOpen(false); onChildOpen(false); };

  const handleSubmit = () => {
    startTransition(async () => {
      const result = await createEmployeeHrNote(employeeId, form);
      if (result.success) {
        toast.success("Note added");
        invalidateHrEmployeeNotes(qc, employeeId);
        handleClose();
      } else toast.error(result.error);
    });
  };

  const NOTE_TYPES = ["general","confidential","management","legal","other"].map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }));
  const VISIBILITIES = [
    { value: "hr_only", label: "HR Only" },
    { value: "management", label: "Management" },
    { value: "restricted", label: "Restricted" },
  ];

  return (
    <QueryReadBoundary queries={[uiRead1]}><div className="rounded-lg border bg-card p-4">
      <SectionHeader icon={StickyNote} title="HR Notes" count={items.length} onAdd={canManage ? openDialog : undefined} addLabel="Add Note" />
      <p className="text-xs text-amber-600 mb-3 flex items-center gap-1 dark:text-amber-300"><AlertCircle className="h-3 w-3" /> Restricted visibility. Contents not shown in overview.</p>
      {isLoading ? <Skeleton className="h-16 w-full" /> : items.length === 0 ? <EmptyState text="No HR notes." /> : (
        <div className="space-y-2">
          <RecordCollection id="hr.employee-hr-actions-tab.HrNotesSection.items" rows={items} fields={[{"id":"note_type","path":"note_type","label":"Note Type"},{"id":"created_at","path":"created_at","label":"Created At"}]} renderRecord={item => (
            <div key={item.id} className="p-3 rounded border bg-background">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium capitalize">{item.note_type}</span>
                  <span className="text-xs text-muted-foreground">({item.visibility.replace(/_/g, " ")})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleDateString()}</span>
                  {canManage && (
                    <Button aria-label="Archive record" size="icon" variant="ghost" className="h-6 w-6 text-red-500 dark:text-red-300" onClick={async () => { const r = await archiveEmployeeHrNote(item.id); if (r.success) { toast.success("Deleted"); invalidateHrEmployeeNotes(qc, employeeId); } else toast.error(r.error); }}><Archive className="h-3 w-3" /></Button>
                  )}
                </div>
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap">{item.note_text}</p>
            </div>
          )} />
        </div>
      )}

      <ERPChildDialogForm open={dialogOpen} onOpenChange={handleClose} title="Add HR Note" icon={<StickyNote className="h-5 w-5" />} mode="add" isSubmitting={isPending} onSubmit={handleSubmit} size="md">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-6">
            <Label>Note Type</Label>
            <ERPCombobox ariaLabel="Note Type" value={form.note_type} onValueChange={v => setForm(f => ({ ...f, note_type: String(v ?? "") }))} options={NOTE_TYPES} placeholder="Select type" />
          </div>
          <div className="col-span-6">
            <Label>Visibility</Label>
            <ERPCombobox ariaLabel="Visibility" value={form.visibility} onValueChange={v => setForm(f => ({ ...f, visibility: String(v ?? "") }))} options={VISIBILITIES} placeholder="Select visibility" />
          </div>
          <div className="col-span-12">
            <Label>Note <span className="text-red-500 dark:text-red-300">*</span></Label>
            <Textarea aria-label="Note" required value={form.note_text} onChange={e => setForm(f => ({ ...f, note_text: e.target.value }))} rows={5} placeholder="Enter note text..." />
          </div>
        </div>
      </ERPChildDialogForm>
    </div></QueryReadBoundary>
  );
}

// =============================================================================
// 6. APPROVAL REQUESTS
// =============================================================================

function ApprovalsSection({ employeeId, canManage, qc, onChildOpen }: {
  employeeId: number; canManage: boolean; qc: ReturnType<typeof useQueryClient>; onChildOpen: (open: boolean) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [decisionDialog, setDecisionDialog] = useState<{ id: number; action: "approve" | "reject" | "cancel" } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({ approval_type: "hr_action", request_title: "" });
  const [decisionReason, setDecisionReason] = useState("");

  const uiRead1 = useQuery({
    queryKey: queryKeys.hr.actions.approvals(employeeId),
    queryFn: () => listEmployeeApprovalRequests(employeeId),
  });
  const { data: items = [], isLoading } = uiRead1;

  const openDialog = () => {
    setForm({ approval_type: "hr_action", request_title: "" });
    setDialogOpen(true);
    onChildOpen(true);
  };
  const handleClose = () => { setDialogOpen(false); onChildOpen(false); };
  const handleDecisionClose = () => { setDecisionDialog(null); setDecisionReason(""); onChildOpen(false); };

  const handleSubmit = () => {
    startTransition(async () => {
      const result = await createEmployeeApprovalRequest(employeeId, form);
      if (result.success) {
        toast.success("Approval request created");
        invalidateHrEmployeeApprovals(qc, employeeId);
        invalidateHrEmployeeActions(qc, employeeId);
        handleClose();
      } else toast.error(result.error);
    });
  };

  const handleDecision = () => {
    if (!decisionDialog) return;
    startTransition(async () => {
      let result;
      if (decisionDialog.action === "approve") result = await approveEmployeeApprovalRequest(decisionDialog.id, decisionReason);
      else if (decisionDialog.action === "reject") result = await rejectEmployeeApprovalRequest(decisionDialog.id, decisionReason);
      else result = await cancelEmployeeApprovalRequest(decisionDialog.id, decisionReason);
      if (result.success) {
        toast.success(`Request ${decisionDialog.action}d`);
        invalidateHrEmployeeApprovals(qc, employeeId);
        invalidateHrEmployeeActions(qc, employeeId);
        handleDecisionClose();
      } else toast.error(result.error);
    });
  };

  const APPROVAL_TYPES = ["hr_action","pro_process","performance","disciplinary","eos","clearance","other"].map(s => ({ value: s, label: s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) }));

  return (
    <QueryReadBoundary queries={[uiRead1]}><div className="rounded-lg border bg-card p-4">
      <SectionHeader icon={CheckSquare} title="Approval Requests" count={items.length} onAdd={canManage ? openDialog : undefined} addLabel="New Request" />
      {isLoading ? <Skeleton className="h-16 w-full" /> : items.length === 0 ? <EmptyState text="No approval requests." /> : (
        <div className="space-y-2">
          <RecordCollection id="hr.employee-hr-actions-tab.ApprovalsSection.items" rows={items} fields={[{"id":"request_title","path":"request_title","label":"Request Title"},{"id":"request_status","path":"request_status","label":"Request Status"}]} renderRecord={item => (
            <div key={item.id} className="flex items-start justify-between p-3 rounded border bg-background hover:bg-accent/30 transition">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{item.request_title}</span>
                  {statusBadge(item.request_status, "approval")}
                  <span className="text-xs text-muted-foreground capitalize">{item.approval_type.replace(/_/g, " ")}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{new Date(item.requested_at).toLocaleDateString()}{item.decision_reason ? ` · ${item.decision_reason}` : ""}</div>
              </div>
              {canManage && item.request_status === "pending" && (
                <div className="flex gap-1 ml-2 shrink-0">
                  <Button size="sm" variant="outline" className="h-7 text-xs text-green-700 border-green-300 dark:text-green-200 dark:border-green-800" onClick={() => { setDecisionDialog({ id: item.id, action: "approve" }); onChildOpen(true); }}>Approve</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs text-red-700 border-red-300 dark:text-red-200 dark:border-red-800" onClick={() => { setDecisionDialog({ id: item.id, action: "reject" }); onChildOpen(true); }}>Reject</Button>
                  <Button aria-label="Reject" size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => { setDecisionDialog({ id: item.id, action: "cancel" }); onChildOpen(true); }}><XCircle className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </div>
          )} />
        </div>
      )}

      <ERPChildDialogForm open={dialogOpen} onOpenChange={handleClose} title="New Approval Request" icon={<CheckSquare className="h-5 w-5" />} mode="add" isSubmitting={isPending} onSubmit={handleSubmit} size="md">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-6">
            <Label>Type <span className="text-red-500 dark:text-red-300">*</span></Label>
            <ERPCombobox ariaLabel="Type" required value={form.approval_type} onValueChange={v => setForm(f => ({ ...f, approval_type: String(v ?? "") }))} options={APPROVAL_TYPES} placeholder="Select type" />
          </div>
          <div className="col-span-12">
            <Label>Request Title <span className="text-red-500 dark:text-red-300">*</span></Label>
            <Input aria-label="Request Title" required value={form.request_title} onChange={e => setForm(f => ({ ...f, request_title: e.target.value }))} placeholder="e.g. Approve Transfer to Dubai Branch" />
          </div>
        </div>
      </ERPChildDialogForm>

      {decisionDialog && (
        <ERPChildDialogForm
          open={!!decisionDialog}
          onOpenChange={handleDecisionClose}
          title={decisionDialog.action === "approve" ? "Approve Request" : decisionDialog.action === "reject" ? "Reject Request" : "Cancel Request"}
          mode={decisionDialog.action === "approve" ? "edit" : "add"}
          submitLabel={decisionDialog.action === "approve" ? "Approve" : decisionDialog.action === "reject" ? "Reject" : "Cancel Request"}
          isSubmitting={isPending}
          onSubmit={handleDecision}
          size="sm"
        >
          <div className="space-y-3">
            <Label>{decisionDialog.action === "approve" ? "Decision Notes (optional)" : "Reason *"}</Label>
            <Textarea value={decisionReason} onChange={e => setDecisionReason(e.target.value)} rows={3} placeholder="Enter reason..." />
          </div>
        </ERPChildDialogForm>
      )}
    </div></QueryReadBoundary>
  );
}

// =============================================================================
// 7. EOS & CLEARANCE
// =============================================================================

function EosSection({ employeeId, canManage, qc, onChildOpen }: {
  employeeId: number; canManage: boolean; qc: ReturnType<typeof useQueryClient>; onChildOpen: (open: boolean) => void;
}) {
  const [eosDialogOpen, setEosDialogOpen] = useState(false);
  const [clearanceDialogOpen, setClearanceDialogOpen] = useState(false);
  const [editingEos, setEditingEos] = useState<EosCaseRow | null>(null);
  const [selectedEosId, setSelectedEosId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const [eosForm, setEosForm] = useState({ eos_type: "resignation", case_status: "draft", notice_date: "", last_working_date: "", reason: "" });
  const [clearanceForm, setClearanceForm] = useState({ clearance_area: "hr", item_title: "", item_status: "pending" });

  const uiRead1 = useQuery({
    queryKey: queryKeys.hr.actions.eosCases(employeeId),
    queryFn: () => listEmployeeEosCases(employeeId),
  });
  const { data: eosCases = [], isLoading: eosLoading } = uiRead1;

  const activeCaseId = selectedEosId ?? (eosCases[0]?.id ?? null);

  const uiRead2 = useQuery({
    queryKey: activeCaseId ? queryKeys.hr.actions.clearanceItems(activeCaseId) : ["hr", "actions", "clearance-items", "none"],
    queryFn: () => activeCaseId ? listEmployeeClearanceItems(activeCaseId) : Promise.resolve([]),
    enabled: !!activeCaseId,
  });
  const { data: clearanceItems = [] } = uiRead2;

  const openEosDialog = (item?: EosCaseRow) => {
    setEditingEos(item ?? null);
    if (item) {
      setEosForm({ eos_type: item.eos_type, case_status: item.case_status, notice_date: item.notice_date ?? "", last_working_date: item.last_working_date ?? "", reason: item.reason ?? "" });
    } else {
      setEosForm({ eos_type: "resignation", case_status: "draft", notice_date: "", last_working_date: "", reason: "" });
    }
    setEosDialogOpen(true);
    onChildOpen(true);
  };
  const handleEosClose = () => { setEosDialogOpen(false); onChildOpen(false); };

  const handleEosSubmit = () => {
    startTransition(async () => {
      const input = { ...eosForm, notice_date: eosForm.notice_date || null, last_working_date: eosForm.last_working_date || null, reason: eosForm.reason || null };
      const result = editingEos ? await updateEmployeeEosCase(editingEos.id, input) : await createEmployeeEosCase(employeeId, input);
      if (result.success) {
        toast.success(editingEos ? "EOS case updated" : "EOS case created");
        invalidateHrEmployeeEos(qc, employeeId);
        invalidateHrEmployeeActions(qc, employeeId);
        handleEosClose();
      } else toast.error(result.error);
    });
  };

  const openClearanceDialog = (eosId: number) => {
    setSelectedEosId(eosId);
    setClearanceForm({ clearance_area: "hr", item_title: "", item_status: "pending" });
    setClearanceDialogOpen(true);
    onChildOpen(true);
  };
  const handleClearanceClose = () => { setClearanceDialogOpen(false); onChildOpen(false); };

  const handleClearanceSubmit = () => {
    if (!activeCaseId) return;
    startTransition(async () => {
      const result = await createEmployeeClearanceItem(activeCaseId, clearanceForm);
      if (result.success) {
        toast.success("Clearance item added");
        invalidateHrEmployeeClearance(qc, activeCaseId, employeeId);
        handleClearanceClose();
      } else toast.error(result.error);
    });
  };

  const EOS_TYPES = ["resignation","termination","contract_end","absconding","death","other"].map(s => ({ value: s, label: s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) }));
  const EOS_STATUSES = ["draft","notice_served","clearance_in_progress","pending_final_settlement","closed","cancelled"].map(s => ({ value: s, label: s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) }));
  const CLEARANCE_AREAS = ["hr","operations","it","finance","camp","workshop","store","hse","other"].map(s => ({ value: s, label: s.toUpperCase() }));

  return (
    <QueryReadBoundary queries={[uiRead1,uiRead2]}><div className="rounded-lg border bg-card p-4">
      <SectionHeader icon={UserMinus} title="EOS & Clearance" count={eosCases.length} onAdd={canManage ? () => openEosDialog() : undefined} addLabel="Open EOS Case" />
      <p className="text-xs text-muted-foreground mb-3">End-of-service process shell. Financial settlement handled by Finance.</p>

      {eosLoading ? <Skeleton className="h-16 w-full" /> : eosCases.length === 0 ? <EmptyState text="No EOS cases." /> : (
        <div className="space-y-4">
          <RecordCollection id="hr.employee-hr-actions-tab.EosSection.eosCases" rows={eosCases} fields={[{"id":"eos_type","path":"eos_type","label":"Eos Type"},{"id":"case_status","path":"case_status","label":"Case Status"},{"id":"last_working_date","path":"last_working_date","label":"Last Working Date"}]} renderRecord={eos => {
            const isSelected = activeCaseId === eos.id;
            const caseItems = isSelected ? clearanceItems : [];
            return (
              <div key={eos.id} className="rounded border bg-background">
                <div className="flex items-start justify-between p-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm capitalize">{eos.eos_type.replace(/_/g, " ")}</span>
                      {statusBadge(eos.case_status, "eos")}
                      <span className="text-xs text-muted-foreground">Settlement: {eos.final_settlement_status.replace(/_/g, " ")}</span>
                    </div>
                    {eos.last_working_date && <div className="text-xs text-muted-foreground mt-0.5">Last working date: {eos.last_working_date}</div>}
                  </div>
                  {canManage && (
                    <div className="flex gap-1 ml-2 shrink-0">
                      <Button aria-label="Edit record" size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEosDialog(eos)}><Edit2 className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => openClearanceDialog(eos.id)}><Plus className="h-3 w-3" />Clearance</Button>
                    </div>
                  )}
                </div>

                {isSelected && caseItems.length > 0 && (
                  <div className="border-t px-3 pb-3 pt-2">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Clearance Checklist ({caseItems.filter(i => i.item_status === "cleared").length}/{caseItems.length} cleared)</p>
                    <div className="grid grid-cols-1 gap-1.5">
                      {<RecordCollection id={`employee-clearance-items-${eos.id}`} rows={caseItems} fields={[{"id":"item_title","label":"Item","path":"item_title"},{"id":"clearance_area","label":"Clearance area","path":"clearance_area"},{"id":"item_status","label":"Status","path":"item_status"}]} renderRecord={ci => (
                        <div key={ci.id} className="flex items-center justify-between text-xs p-2 rounded bg-muted">
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground uppercase text-[10px] font-medium">{ci.clearance_area}</span>
                            <span>{ci.item_title}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            {statusBadge(ci.item_status, "clearance")}
                            {canManage && ci.item_status === "pending" && (
                              <>
                                <Button aria-label="Clear" disabled={isPending} size="icon" variant="ghost" className="h-5 w-5 text-green-600 dark:text-green-300" title="Clear" onClick={() => startTransition(async () => { const r = await clearEmployeeClearanceItem(ci.id); if (r.success) { toast.success("Cleared"); invalidateHrEmployeeClearance(qc, eos.id, employeeId); } else toast.error(r.error); })}><CheckCircle className="h-3 w-3" /></Button>
                                <Button aria-label="Block" disabled={isPending} size="icon" variant="ghost" className="h-5 w-5 text-red-500 dark:text-red-300" title="Block" onClick={() => startTransition(async () => { const r = await blockEmployeeClearanceItem(ci.id); if (r.success) { toast.success("Blocked"); invalidateHrEmployeeClearance(qc, eos.id, employeeId); } else toast.error(r.error); })}><XCircle className="h-3 w-3" /></Button>
                              </>
                            )}
                          </div>
                        </div>
                      )} />}
                    </div>
                  </div>
                )}
              </div>
            );
          }} />
        </div>
      )}

      <ERPChildDialogForm open={eosDialogOpen} onOpenChange={handleEosClose} title={editingEos ? "Edit EOS Case" : "Open EOS Case"} icon={<UserMinus className="h-5 w-5" />} mode={editingEos ? "edit" : "add"} isSubmitting={isPending} onSubmit={handleEosSubmit} size="lg">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-6">
            <Label>EOS Type <span className="text-red-500 dark:text-red-300">*</span></Label>
            <ERPCombobox ariaLabel="EOS Type" required value={eosForm.eos_type} onValueChange={v => setEosForm(f => ({ ...f, eos_type: String(v ?? "") }))} options={EOS_TYPES} placeholder="Select type" />
          </div>
          <div className="col-span-6">
            <Label>Status</Label>
            <ERPCombobox ariaLabel="Status" value={eosForm.case_status} onValueChange={v => setEosForm(f => ({ ...f, case_status: String(v ?? "") }))} options={EOS_STATUSES} placeholder="Select status" />
          </div>
          <div className="col-span-6">
            <Label>Notice Date</Label>
            <Input aria-label="Notice Date" type="date" value={eosForm.notice_date} onChange={e => setEosForm(f => ({ ...f, notice_date: e.target.value }))} />
          </div>
          <div className="col-span-6">
            <Label>Last Working Date</Label>
            <Input aria-label="Last Working Date" type="date" value={eosForm.last_working_date} onChange={e => setEosForm(f => ({ ...f, last_working_date: e.target.value }))} />
          </div>
          <div className="col-span-12">
            <Label>Reason</Label>
            <Textarea aria-label="Reason" value={eosForm.reason} onChange={e => setEosForm(f => ({ ...f, reason: e.target.value }))} rows={3} />
          </div>
          <div className="col-span-12 bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-700 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-200">
            Financial / gratuity settlement is handled by the Finance module. EOS case here is a process shell only.
          </div>
        </div>
      </ERPChildDialogForm>

      <ERPChildDialogForm open={clearanceDialogOpen} onOpenChange={handleClearanceClose} title="Add Clearance Item" icon={<CheckSquare className="h-5 w-5" />} mode="add" isSubmitting={isPending} onSubmit={handleClearanceSubmit} size="md">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-6">
            <Label>Clearance Area <span className="text-red-500 dark:text-red-300">*</span></Label>
            <ERPCombobox ariaLabel="Clearance Area" required value={clearanceForm.clearance_area} onValueChange={v => setClearanceForm(f => ({ ...f, clearance_area: String(v ?? "") }))} options={CLEARANCE_AREAS} placeholder="Select area" />
          </div>
          <div className="col-span-12">
            <Label>Item Title <span className="text-red-500 dark:text-red-300">*</span></Label>
            <Input aria-label="Item Title" required value={clearanceForm.item_title} onChange={e => setClearanceForm(f => ({ ...f, item_title: e.target.value }))} placeholder="e.g. Return company laptop" />
          </div>
        </div>
      </ERPChildDialogForm>
    </div></QueryReadBoundary>
  );
}




