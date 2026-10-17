"use client";
import {hasHrReadCapability} from "@/lib/reads/hr-read-identity";
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
import type { AuthContext } from "@/lib/rbac/check";
import { hasPermission } from "@/lib/rbac/scope";
import { hrReadIdentity as hrActionsReadIdentity } from "@/lib/reads/hr-read-identity";
import {HR_ACTION_RECORD_CONFIG, type HrActionRecordKind} from "@/lib/reads/hr-action-records-schema";
import {useHrActionRecords} from "@/hooks/use-hr-action-records";
import {usePersistentUiState} from "@/hooks/use-persistent-ui-state";
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
import { useQueryClient } from "@tanstack/react-query";
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
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";

// ─── Types ─────────────────────────────────────────────────────────────────

type Props = {
  employeeId: number;
  authContext: AuthContext;
  onChildOpen?: (open: boolean) => void;
};

// ─── Status helpers ─────────────────────────────────────────────────────────

function statusBadge(status: string, _type: "process" | "action" | "perf" | "disc" | "approval" | "eos" | "clearance") {
  void _type; // The shared status palette intentionally applies across record kinds.
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

/** Long protected wording is loaded only after an explicit read. Closing or a
 * parent identity remount removes it from the screen; cache retirement is owned
 * by the tab boundary. No editable JSON or business mutation is introduced. */
function ActionWording({recordId, load, fields}: {recordId: number; load: (id: number) => Promise<Record<string, unknown> | null>; fields: {id: string; label: string}[]}) {
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null), [busy, setBusy] = useState(false);
  return <div className="mt-2">
    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={async () => {
      if (detail) {setDetail(null); return;}
      setBusy(true); try {setDetail(await load(recordId));} finally {setBusy(false);}
    }}>{busy ? "Loading complete details…" : detail ? "Hide complete details" : "View complete details"}</Button>
    {detail && <dl className="mt-2 space-y-2">{fields.map(field => <div key={field.id}><dt className="text-xs font-medium text-muted-foreground">{field.label}</dt><dd className="text-sm whitespace-pre-wrap break-words">{typeof detail[field.id] === "string" && detail[field.id] ? String(detail[field.id]) : "Not recorded"}</dd></div>)}</dl>}
  </div>;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

const HrActionsReadIdentity = createContext<{identity: string; onDenied?: () => void}>({identity: ""});
const privateRecordKinds = new Set(["pro-processes", "hr-actions", "performance", "disciplinary", "notes", "approvals", "eos-cases", "clearance-items"]);

/** Existing invalidation prefixes, private memory and F05 list controls remain.
 * Native scoped authorization is enforced for every page and point detail. */
function useHrActionQuery<K extends HrActionRecordKind>(kind: K, employeeId: number, eosCaseId?: number) {
  const {identity, onDenied} = useContext(HrActionsReadIdentity);
  return useHrActionRecords(kind, employeeId, identity, eosCaseId, onDenied);
}

export function EmployeeHrActionsTab(props: Props) {
  const {onChildOpen} = props;
  const identity = hrActionsReadIdentity(props.authContext), previous = useRef(identity), qc = useQueryClient();
  const [deniedIdentity, setDeniedIdentity] = useState<string | null>(null);
  const onDenied = useCallback(() => setDeniedIdentity(identity), [identity]);
  const canView = deniedIdentity !== identity && (hasHrReadCapability(props.authContext, "hr.actions.view") || hasHrReadCapability(props.authContext, "hr.eos.view"));
  useEffect(() => {
    const retired = previous.current;
    const predicate = (query: {queryKey: readonly unknown[]}) => query.queryKey[0] === "hr" && query.queryKey[1] === "actions"
      && privateRecordKinds.has(String(query.queryKey[2])) && (typeof query.queryKey[3] === "number" || (query.queryKey[2] === "clearance-items" && query.queryKey[3] === "none"))
      && (query.queryKey.length === 4 || ((identity !== retired || !canView) && query.queryKey.at(-1) === retired));
    void qc.cancelQueries({predicate});
    qc.removeQueries({predicate});
    if (identity !== retired || !canView) onChildOpen?.(false);
    previous.current = identity;
  }, [identity, canView, qc, onChildOpen]);
  return <HrActionsReadIdentity.Provider value={{identity, onDenied}}>
    {canView ? <EmployeeHrActionsTabContent key={`${props.employeeId}:${identity}`} {...props} />
      : <p className="p-8 text-sm text-muted-foreground">You do not have permission to view HR actions.</p>}
  </HrActionsReadIdentity.Provider>;
}

function EmployeeHrActionsTabContent({ employeeId, authContext, onChildOpen }: Props) {
  const qc = useQueryClient();
  const canManage = hasPermission(authContext, "hr.actions.manage");
  const canViewActions = hasHrReadCapability(authContext, "hr.actions.view");
  const canViewConfidential = canViewActions && hasHrReadCapability(authContext, "hr.confidential.view");

  const setDialogOpen = useCallback((open: boolean) => {
    onChildOpen?.(open);
  }, [onChildOpen]);

  return (
    <div className="space-y-8 pb-8">
      {canViewActions && <ProProcessesSection employeeId={employeeId} canManage={canManage} qc={qc} onChildOpen={setDialogOpen} />}
      {canViewActions && <HrActionsSection employeeId={employeeId} canManage={canManage} qc={qc} onChildOpen={setDialogOpen} />}
      {canViewConfidential && <PerformanceSection employeeId={employeeId} canManage={canManage} qc={qc} onChildOpen={setDialogOpen} />}
      {canViewConfidential && <DisciplinarySection employeeId={employeeId} canManage={canManage} qc={qc} onChildOpen={setDialogOpen} />}
      {canViewConfidential && <HrNotesSection employeeId={employeeId} canManage={canManage} qc={qc} onChildOpen={setDialogOpen} />}
      {canViewActions && <ApprovalsSection employeeId={employeeId} canManage={canManage} qc={qc} onChildOpen={setDialogOpen} />}
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

  const uiRead1 = useHrActionQuery("pro", employeeId);
  const { data: items = [] } = uiRead1;

  const openDialog = async (selected?: {id: number}) => {
    const detail = selected ? await uiRead1.loadDetail(selected.id) : null;
    if (selected && !detail) return;
    const item = detail as ProProcessRow | null;
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
      if (!canManage || !uiRead1.canDispatch()) return;
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
      if (!canManage || !uiRead1.canDispatch()) return;
      const result = await archiveEmployeeProProcess(id);
      if (result.success) { toast.success("Archived"); invalidateHrEmployeeProProcesses(qc, employeeId); }
      else toast.error(result.error);
    });
  };

  const PRO_STATUSES = ["draft","requested","in_progress","waiting_for_document","submitted","approved","rejected","cancelled","completed"].map(s => ({ value: s, label: s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) }));
  const PRIORITIES = ["low","normal","high","urgent"].map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }));

  return (
    <QueryReadBoundary queries={[uiRead1]}><div className="rounded-lg border bg-card p-4">
      <SectionHeader icon={Globe} title="PRO Processes" count={uiRead1.collection.serverRead.totalCount ?? undefined} onAdd={canManage ? () => {void openDialog();} : undefined} addLabel="Add Process" />
      {
        <div className="space-y-2">
          <RecordCollection presentation="embedded" id="hr.employee-hr-actions-tab.ProProcessesSection.items" rows={items} fields={[...HR_ACTION_RECORD_CONFIG.pro.fields]} {...uiRead1.collection} renderRecord={item => (
            <div key={item.id} className="flex items-start justify-between p-3 rounded border bg-background hover:bg-accent/30 transition">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{item.process_title}</span>
                  {statusBadge(item.process_status, "process")}
                  <span className={`text-xs px-1.5 py-0.5 rounded ${item.priority === "urgent" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200" : item.priority === "high" ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-200" : "bg-muted text-muted-foreground"}`}>{item.priority}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">Requested: {item.request_date}{item.target_date ? ` · Target: ${item.target_date}` : ""}</div>
                <ActionWording recordId={item.id} load={uiRead1.loadDetail} fields={[{id: "notes", label: "Notes"}]} />
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
      }

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

  const uiRead1 = useHrActionQuery("actions", employeeId);
  const { data: items = [] } = uiRead1;

  const openDialog = async (selected?: {id: number}) => {
    const detail = selected ? await uiRead1.loadDetail(selected.id) : null;
    if (selected && !detail) return;
    const item = detail as HrActionRow | null;
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
      if (!canManage || !uiRead1.canDispatch()) return;
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
      if (!canManage || !uiRead1.canDispatch()) return;
      const result = await closeEmployeeHrAction(id, notes);
      if (result.success) { toast.success("Action closed"); invalidateHrEmployeeHrActions(qc, employeeId); }
      else toast.error(result.error);
    });
  };

  const ACTION_TYPES = ["general","probation_review","transfer","promotion","increment_recommendation","status_change","warning","memo","other"].map(s => ({ value: s, label: s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) }));
  const ACTION_STATUSES = ["open","in_progress","closed","cancelled"].map(s => ({ value: s, label: s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) }));

  return (
    <QueryReadBoundary queries={[uiRead1]}><div className="rounded-lg border bg-card p-4">
      <SectionHeader icon={Zap} title="HR Actions" count={uiRead1.collection.serverRead.totalCount ?? undefined} onAdd={canManage ? () => {void openDialog();} : undefined} addLabel="Add Action" />
      {
        <div className="space-y-2">
          <RecordCollection presentation="embedded" id="hr.employee-hr-actions-tab.HrActionsSection.items" rows={items} fields={[...HR_ACTION_RECORD_CONFIG.actions.fields]} {...uiRead1.collection} renderRecord={item => (
            <div key={item.id} className="flex items-start justify-between p-3 rounded border bg-background hover:bg-accent/30 transition">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{item.action_title}</span>
                  {statusBadge(item.action_status, "action")}
                  <span className="text-xs text-muted-foreground">{item.action_type.replace(/_/g, " ")}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{item.action_date}{item.due_date ? ` · Due: ${item.due_date}` : ""}</div>
                <ActionWording recordId={item.id} load={uiRead1.loadDetail} fields={[{id: "notes", label: "Notes"}]} />
              </div>
              {canManage && (
                <div className="flex gap-1 ml-2 shrink-0">
                  <Button aria-label="Edit record" size="icon" variant="ghost" className="h-7 w-7" onClick={() => openDialog(item)}><Edit2 className="h-3.5 w-3.5" /></Button>
                  {item.action_status === "open" || item.action_status === "in_progress" ? (
                    <Button aria-label="Close" size="icon" variant="ghost" className="h-7 w-7 text-green-600 dark:text-green-300" title="Close" onClick={() => handleClose2(item.id)}><CheckCircle className="h-3.5 w-3.5" /></Button>
                  ) : null}
                  <Button aria-label="Archive record" size="icon" variant="ghost" className="h-7 w-7 text-red-500 dark:text-red-300" onClick={async () => { if (!canManage || !uiRead1.canDispatch()) return; const r = await archiveEmployeeHrAction(item.id); if (r.success) { toast.success("Archived"); invalidateHrEmployeeHrActions(qc, employeeId); } else toast.error(r.error); }}><Archive className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </div>
          )} />
        </div>
      }

      <ERPChildDialogForm open={dialogOpen} onOpenChange={handleClose} title={editing ? "Edit HR Action" : "Add HR Action"} icon={<Zap className="h-5 w-5" />} mode={editing ? "edit" : "add"} isSubmitting={isPending} submitDisabled={!canManage || !uiRead1.ready} onSubmit={handleSubmit} size="lg">
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

  const uiRead1 = useHrActionQuery("performance", employeeId);
  const { data: items = [] } = uiRead1;

  const openDialog = async (selected?: {id: number}) => {
    const detail = selected ? await uiRead1.loadDetail(selected.id) : null;
    if (selected && !detail) return;
    const item = detail as PerformanceRow | null;
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
      if (!canManage || !uiRead1.canDispatch()) return;
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
      <SectionHeader icon={TrendingUp} title="Performance Reviews" count={uiRead1.collection.serverRead.totalCount ?? undefined} onAdd={canManage ? () => {void openDialog();} : undefined} addLabel="Add Review" />
      {
        <div className="space-y-2">
          <RecordCollection presentation="embedded" id="hr.employee-hr-actions-tab.PerformanceSection.items" rows={items} fields={[...HR_ACTION_RECORD_CONFIG.performance.fields]} {...uiRead1.collection} renderRecord={item => (
            <div key={item.id} className="flex items-start justify-between p-3 rounded border bg-background hover:bg-accent/30 transition">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm capitalize">{item.review_type.replace(/_/g, " ")} Review</span>
                  {statusBadge(item.status, "perf")}
                  {item.rating && <span className="text-xs text-muted-foreground capitalize">{item.rating.replace(/_/g, " ")}</span>}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{item.review_date}</div>
                <ActionWording recordId={item.id} load={uiRead1.loadDetail} fields={[{id: "summary", label: "Summary"}, {id: "strengths", label: "Strengths"}, {id: "improvement_areas", label: "Improvement areas"}]} />
              </div>
              {canManage && (
                <div className="flex gap-1 ml-2 shrink-0">
                  {item.status === "draft" && <Button aria-label="Edit record" size="icon" variant="ghost" className="h-7 w-7" onClick={() => openDialog(item)}><Edit2 className="h-3.5 w-3.5" /></Button>}
                  {item.status === "draft" && <Button aria-label="Submit" size="icon" variant="ghost" className="h-7 w-7 text-blue-500 dark:text-blue-300" title="Submit" onClick={async () => { if (!canManage || !uiRead1.canDispatch()) return; const r = await submitEmployeePerformanceRecord(item.id); if (r.success) { toast.success("Submitted"); invalidateHrEmployeePerformance(qc, employeeId); } else toast.error(r.error); }}><CheckSquare className="h-3.5 w-3.5" /></Button>}
                  {item.status === "submitted" && <Button aria-label="Approve" size="icon" variant="ghost" className="h-7 w-7 text-green-600 dark:text-green-300" title="Approve" onClick={async () => { if (!canManage || !uiRead1.canDispatch()) return; const r = await approveEmployeePerformanceRecord(item.id); if (r.success) { toast.success("Approved"); invalidateHrEmployeePerformance(qc, employeeId); } else toast.error(r.error); }}><CheckCircle className="h-3.5 w-3.5" /></Button>}
                  <Button aria-label="Archive record" size="icon" variant="ghost" className="h-7 w-7 text-red-500 dark:text-red-300" onClick={async () => { if (!canManage || !uiRead1.canDispatch()) return; const r = await archiveEmployeePerformanceRecord(item.id); if (r.success) { toast.success("Archived"); invalidateHrEmployeePerformance(qc, employeeId); } else toast.error(r.error); }}><Archive className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </div>
          )} />
        </div>
      }

      <ERPChildDialogForm open={dialogOpen} onOpenChange={handleClose} title={editing ? "Edit Performance Review" : "Add Performance Review"} icon={<TrendingUp className="h-5 w-5" />} mode={editing ? "edit" : "add"} isSubmitting={isPending} submitDisabled={!canManage || !uiRead1.ready} onSubmit={handleSubmit} size="lg">
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

  const uiRead1 = useHrActionQuery("disciplinary", employeeId);
  const { data: items = [] } = uiRead1;

  const openDialog = async (selected?: {id: number}) => {
    const detail = selected ? await uiRead1.loadDetail(selected.id) : null;
    if (selected && !detail) return;
    const item = detail as DisciplinaryRow | null;
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
      if (!canManage || !uiRead1.canDispatch()) return;
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
      <SectionHeader icon={AlertTriangle} title="Disciplinary & Warnings" count={uiRead1.collection.serverRead.totalCount ?? undefined} onAdd={canManage ? () => {void openDialog();} : undefined} addLabel="Add Record" />
      {
        <div className="space-y-2">
          <RecordCollection presentation="embedded" id="hr.employee-hr-actions-tab.DisciplinarySection.items" rows={items} fields={[...HR_ACTION_RECORD_CONFIG.disciplinary.fields]} {...uiRead1.collection} renderRecord={item => (
            <div key={item.id} className="flex items-start justify-between p-3 rounded border bg-background hover:bg-accent/30 transition">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{item.subject}</span>
                  {severityBadge(item.severity)}
                  {statusBadge(item.status, "disc")}
                  <span className="text-xs text-muted-foreground capitalize">{item.disciplinary_type.replace(/_/g, " ")}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{item.record_date}{item.acknowledged_by_employee ? " · ✓ Acknowledged" : ""}</div>
                <ActionWording recordId={item.id} load={uiRead1.loadDetail} fields={[{id: "description", label: "Description"}, {id: "action_taken", label: "Action taken"}]} />
              </div>
              {canManage && (
                <div className="flex gap-1 ml-2 shrink-0">
                  <Button aria-label="Edit record" size="icon" variant="ghost" className="h-7 w-7" onClick={() => openDialog(item)}><Edit2 className="h-3.5 w-3.5" /></Button>
                  {!item.acknowledged_by_employee && (
                    <Button aria-label="Mark acknowledged" size="icon" variant="ghost" className="h-7 w-7 text-blue-500 dark:text-blue-300" title="Mark acknowledged" onClick={async () => { if (!canManage || !uiRead1.canDispatch()) return; const r = await acknowledgeEmployeeDisciplinaryRecord(item.id); if (r.success) { toast.success("Acknowledged"); invalidateHrEmployeeDisciplinary(qc, employeeId); } else toast.error(r.error); }}><CheckCircle className="h-3.5 w-3.5" /></Button>
                  )}
                  <Button aria-label="Archive record" size="icon" variant="ghost" className="h-7 w-7 text-red-500 dark:text-red-300" onClick={async () => { if (!canManage || !uiRead1.canDispatch()) return; const r = await archiveEmployeeDisciplinaryRecord(item.id); if (r.success) { toast.success("Archived"); invalidateHrEmployeeDisciplinary(qc, employeeId); } else toast.error(r.error); }}><Archive className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </div>
          )} />
        </div>
      }

      <ERPChildDialogForm open={dialogOpen} onOpenChange={handleClose} title={editing ? "Edit Disciplinary Record" : "Add Disciplinary Record"} icon={<AlertTriangle className="h-5 w-5" />} mode={editing ? "edit" : "add"} isSubmitting={isPending} submitDisabled={!canManage || !uiRead1.ready} onSubmit={handleSubmit} size="lg">
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

  const uiRead1 = useHrActionQuery("notes", employeeId);
  const { data: items = [] } = uiRead1;

  const openDialog = () => {
    setForm({ note_type: "general", note_text: "", visibility: "hr_only" });
    setDialogOpen(true);
    onChildOpen(true);
  };
  const handleClose = () => { setDialogOpen(false); onChildOpen(false); };

  const handleSubmit = () => {
    startTransition(async () => {
      if (!canManage || !uiRead1.canDispatch()) return;
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
      <SectionHeader icon={StickyNote} title="HR Notes" count={uiRead1.collection.serverRead.totalCount ?? undefined} onAdd={canManage ? openDialog : undefined} addLabel="Add Note" />
      <p className="text-xs text-amber-600 mb-3 flex items-center gap-1 dark:text-amber-300"><AlertCircle className="h-3 w-3" /> Restricted visibility. Contents not shown in overview.</p>
      {
        <div className="space-y-2">
          <RecordCollection presentation="embedded" id="hr.employee-hr-actions-tab.HrNotesSection.items" rows={items} fields={[...HR_ACTION_RECORD_CONFIG.notes.fields]} {...uiRead1.collection} renderRecord={item => (
            <div key={item.id} className="p-3 rounded border bg-background">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium capitalize">Note #{item.id} · {item.note_type}</span>
                  <span className="text-xs text-muted-foreground">({item.visibility.replace(/_/g, " ")})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleDateString()}</span>
                  {canManage && (
                    <Button aria-label="Archive record" size="icon" variant="ghost" className="h-6 w-6 text-red-500 dark:text-red-300" onClick={async () => { if (!canManage || !uiRead1.canDispatch()) return; const r = await archiveEmployeeHrNote(item.id); if (r.success) { toast.success("Deleted"); invalidateHrEmployeeNotes(qc, employeeId); } else toast.error(r.error); }}><Archive className="h-3 w-3" /></Button>
                  )}
                </div>
              </div>
              <ActionWording recordId={item.id} load={uiRead1.loadDetail} fields={[{id: "note_text", label: "Note"}]} />
            </div>
          )} />
        </div>
      }

      <ERPChildDialogForm open={dialogOpen} onOpenChange={handleClose} title="Add HR Note" icon={<StickyNote className="h-5 w-5" />} mode="add" isSubmitting={isPending} submitDisabled={!canManage || !uiRead1.ready} onSubmit={handleSubmit} size="md">
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

  const uiRead1 = useHrActionQuery("approvals", employeeId);
  const { data: items = [] } = uiRead1;

  const openDialog = () => {
    setForm({ approval_type: "hr_action", request_title: "" });
    setDialogOpen(true);
    onChildOpen(true);
  };
  const handleClose = () => { setDialogOpen(false); onChildOpen(false); };
  const handleDecisionClose = () => { setDecisionDialog(null); setDecisionReason(""); onChildOpen(false); };

  const handleSubmit = () => {
    startTransition(async () => {
      if (!canManage || !uiRead1.canDispatch()) return;
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
      if (!canManage || !uiRead1.canDispatch()) return;
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
      <SectionHeader icon={CheckSquare} title="Approval Requests" count={uiRead1.collection.serverRead.totalCount ?? undefined} onAdd={canManage ? openDialog : undefined} addLabel="New Request" />
      {
        <div className="space-y-2">
          <RecordCollection presentation="embedded" id="hr.employee-hr-actions-tab.ApprovalsSection.items" rows={items} fields={[...HR_ACTION_RECORD_CONFIG.approvals.fields]} {...uiRead1.collection} renderRecord={item => (
            <div key={item.id} className="flex items-start justify-between p-3 rounded border bg-background hover:bg-accent/30 transition">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{item.request_title}</span>
                  {statusBadge(item.request_status, "approval")}
                  <span className="text-xs text-muted-foreground capitalize">{item.approval_type.replace(/_/g, " ")}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{new Date(item.requested_at).toLocaleDateString()}</div>
                <ActionWording recordId={item.id} load={uiRead1.loadDetail} fields={[{id: "decision_reason", label: "Decision reason"}]} />
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
      }

      <ERPChildDialogForm open={dialogOpen} onOpenChange={handleClose} title="New Approval Request" icon={<CheckSquare className="h-5 w-5" />} mode="add" isSubmitting={isPending} submitDisabled={!canManage || !uiRead1.ready} onSubmit={handleSubmit} size="md">
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
  type ClearanceTarget = { employeeId: number; caseId: number; identity: string };
  const [eosDialogOpen, setEosDialogOpen] = useState(false);
  const [clearanceDialogOpen, setClearanceDialogOpen] = useState(false);
  const [clearanceTarget, setClearanceTarget] = useState<ClearanceTarget | null>(null);
  const clearanceOwner = useRef<{
    active: boolean; target: ClearanceTarget | null;
    mayOpen: (caseId: number) => boolean; maySubmit: (target: ClearanceTarget) => boolean;
  }>({active: false, target: null, mayOpen: () => false, maySubmit: () => false});
  const [editingEos, setEditingEos] = useState<EosCaseRow | null>(null);
  const {identity} = useContext(HrActionsReadIdentity);
  const [selectedEosId, setSelectedEosId] = usePersistentUiState<number | null>(`hr:action-records:${identity}:${employeeId}:selected-eos`, null);
  const [isPending, startTransition] = useTransition();
  const [eosForm, setEosForm] = useState({ eos_type: "resignation", case_status: "draft", notice_date: "", last_working_date: "", reason: "" });
  const [clearanceForm, setClearanceForm] = useState({ clearance_area: "hr", item_title: "", item_status: "pending" });

  const uiRead1 = useHrActionQuery("eos", employeeId);
  const { data: eosCases = [] } = uiRead1;

  const activeCaseId = eosCases.some(eos => eos.id === selectedEosId) ? selectedEosId : eosCases[0]?.id ?? null;

  const uiRead2 = useHrActionQuery("clearance", employeeId, activeCaseId ?? undefined);
  const { data: clearanceItems = [] } = uiRead2;

  const eosReady = uiRead1.data !== undefined && !uiRead1.isLoading && !uiRead1.isFetching && !uiRead1.isError;
  const checklistReady = uiRead2.data !== undefined && !uiRead2.isLoading && !uiRead2.isFetching && !uiRead2.isError;
  const clearanceAdmitted = canManage && clearanceDialogOpen && clearanceTarget !== null
    && clearanceTarget.employeeId === employeeId && clearanceTarget.identity === identity
    && eosReady && eosCases.some(eos => eos.id === clearanceTarget.caseId)
    && activeCaseId === clearanceTarget.caseId && checklistReady;
  useLayoutEffect(() => {
    const owner = clearanceOwner.current;
    owner.active = true;
    return () => { owner.active = false; owner.target = null; };
  }, []);
  useLayoutEffect(() => {
    const owner = clearanceOwner.current;
    owner.mayOpen = caseId => canManage && eosReady && eosCases.some(eos => eos.id === caseId);
    owner.maySubmit = target => clearanceAdmitted && target === clearanceTarget;
    return () => { owner.mayOpen = () => false; owner.maySubmit = () => false; };
  }, [canManage, eosReady, eosCases, clearanceAdmitted, clearanceTarget]);

  const openEosDialog = async (selected?: {id: number}) => {
    const detail = selected ? await uiRead1.loadDetail(selected.id) : null;
    if (selected && !detail) return;
    const item = detail as EosCaseRow | null;
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
      if (!canManage || !uiRead1.canDispatch()) return;
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
    const owner = clearanceOwner.current;
    if (!owner.active || !owner.mayOpen(eosId)) return;
    // This object identifies one opening, independently of the browsing selection.
    const target = {employeeId, caseId: eosId, identity};
    owner.target = target;
    setClearanceTarget(target);
    setSelectedEosId(eosId);
    setClearanceForm({ clearance_area: "hr", item_title: "", item_status: "pending" });
    setClearanceDialogOpen(true);
    onChildOpen(true);
  };
  const handleClearanceClose = () => {
    const owner = clearanceOwner.current;
    if (!owner.active || !clearanceTarget || owner.target !== clearanceTarget) return;
    owner.target = null;
    setClearanceTarget(null);
    setClearanceDialogOpen(false);
    onChildOpen(false);
  };

  const handleClearanceSubmit = () => {
    const owner = clearanceOwner.current, target = clearanceTarget;
    if (!target || !owner.active || owner.target !== target || !owner.maySubmit(target)) return;
    const input = {...clearanceForm};
    startTransition(async () => {
      if (!canManage || !uiRead1.canDispatch()) return;
      if (!owner.active || owner.target !== target || !owner.maySubmit(target)) return;
      const result = await createEmployeeClearanceItem(target.caseId, input);
      if (result.success) {
        // A confirmed write still belongs to its original case after read/owner retirement.
        invalidateHrEmployeeClearance(qc, target.caseId, target.employeeId);
        if (!owner.active || owner.target !== target) return;
        toast.success("Clearance item added");
        handleClearanceClose();
      } else if (owner.active && owner.target === target) toast.error(result.error);
    });
  };

  const EOS_TYPES = ["resignation","termination","contract_end","absconding","death","other"].map(s => ({ value: s, label: s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) }));
  const EOS_STATUSES = ["draft","notice_served","clearance_in_progress","pending_final_settlement","closed","cancelled"].map(s => ({ value: s, label: s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) }));
  const CLEARANCE_AREAS = ["hr","operations","it","finance","camp","workshop","store","hse","other"].map(s => ({ value: s, label: s.toUpperCase() }));

  return (
    <QueryReadBoundary queries={[uiRead1,uiRead2]}><div className="rounded-lg border bg-card p-4">
      <SectionHeader icon={UserMinus} title="EOS & Clearance" count={uiRead1.collection.serverRead.totalCount ?? undefined} onAdd={canManage ? () => {void openEosDialog();} : undefined} addLabel="Open EOS Case" />
      <p className="text-xs text-muted-foreground mb-3">End-of-service process shell. Financial settlement handled by Finance.</p>

      {
        <div className="space-y-4">
          <RecordCollection presentation="embedded" id="hr.employee-hr-actions-tab.EosSection.eosCases" rows={eosCases} fields={[...HR_ACTION_RECORD_CONFIG.eos.fields]} {...uiRead1.collection} renderRecord={eos => {
            const isSelected = activeCaseId === eos.id;
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
                    <ActionWording recordId={eos.id} load={uiRead1.loadDetail} fields={[{id: "reason", label: "Reason"}, {id: "notes", label: "Notes"}]} />
                    <Button type="button" size="sm" variant="outline" aria-pressed={isSelected} className="mt-2" onClick={() => setSelectedEosId(eos.id)}>Show clearance checklist</Button>
                  </div>
                  {canManage && (
                    <div className="flex gap-1 ml-2 shrink-0">
                      <Button aria-label="Edit record" size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEosDialog(eos)}><Edit2 className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => openClearanceDialog(eos.id)}><Plus className="h-3 w-3" />Clearance</Button>
                    </div>
                  )}
                </div>

                {isSelected && (
                  <div className="border-t px-3 pb-3 pt-2">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Clearance Checklist</p>
                    <div className="grid grid-cols-1 gap-1.5">
                      {<RecordCollection presentation="embedded" id={`employee-clearance-items-${eos.id}`} rows={clearanceItems} fields={[...HR_ACTION_RECORD_CONFIG.clearance.fields]} {...uiRead2.collection} renderRecord={ci => (
                        <div key={ci.id} className="flex items-center justify-between text-xs p-2 rounded bg-muted">
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground uppercase text-[10px] font-medium">{ci.clearance_area}</span>
                            <span>{ci.item_title}</span>
                            <ActionWording recordId={ci.id} load={uiRead2.loadDetail} fields={[{id: "notes", label: "Notes"}]} />
                          </div>
                          <div className="flex items-center gap-1">
                            {statusBadge(ci.item_status, "clearance")}
                            {canManage && ci.item_status === "pending" && (
                              <>
                                <Button aria-label="Clear" disabled={isPending} size="icon" variant="ghost" className="h-5 w-5 text-green-600 dark:text-green-300" title="Clear" onClick={() => startTransition(async () => {
      if (!canManage || !uiRead1.canDispatch()) return; if (!uiRead2.canDispatch()) return; const r = await clearEmployeeClearanceItem(ci.id); if (r.success) { toast.success("Cleared"); invalidateHrEmployeeClearance(qc, eos.id, employeeId); } else toast.error(r.error); })}><CheckCircle className="h-3 w-3" /></Button>
                                <Button aria-label="Block" disabled={isPending} size="icon" variant="ghost" className="h-5 w-5 text-red-500 dark:text-red-300" title="Block" onClick={() => startTransition(async () => {
      if (!canManage || !uiRead1.canDispatch()) return; if (!uiRead2.canDispatch()) return; const r = await blockEmployeeClearanceItem(ci.id); if (r.success) { toast.success("Blocked"); invalidateHrEmployeeClearance(qc, eos.id, employeeId); } else toast.error(r.error); })}><XCircle className="h-3 w-3" /></Button>
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
      }

      <ERPChildDialogForm open={eosDialogOpen} onOpenChange={handleEosClose} title={editingEos ? "Edit EOS Case" : "Open EOS Case"} icon={<UserMinus className="h-5 w-5" />} mode={editingEos ? "edit" : "add"} isSubmitting={isPending} submitDisabled={!canManage || !uiRead1.ready} onSubmit={handleEosSubmit} size="lg">
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

      <ERPChildDialogForm open={clearanceDialogOpen} onOpenChange={handleClearanceClose} title="Add Clearance Item" subtitle={clearanceAdmitted ? undefined : "The original case and its checklist must be available before adding this item. Your draft is retained."} icon={<CheckSquare className="h-5 w-5" />} mode="add" isSubmitting={isPending} submitDisabled={!clearanceAdmitted} onSubmit={handleClearanceSubmit} size="md">
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
