"use client";
import {hasHrReadCapability} from "@/lib/reads/hr-read-identity";
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

import { Button } from "@/components/ui/button";
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
import{HrNoteEditor}from '../hr-note-editor';
import{ProProcessEditor}from '../pro-process-editor';
import{HrRecordEditor}from '../hr-record-editor';
import{ClearanceEditor}from '../clearance-editor';
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
    const predicate = (query: {queryKey: readonly unknown[]}) => query.queryKey[0] === "hr" && (
      query.queryKey[1] === "actions" && privateRecordKinds.has(String(query.queryKey[2]))
      && (typeof query.queryKey[3] === "number" || (query.queryKey[2] === "clearance-items" && query.queryKey[3] === "none"))
      && (query.queryKey.length === 4 || ((identity !== retired || !canView) && query.queryKey.at(-1) === retired))
      || ['f11-pro-opening','f11-action-opening','f11-note-opening','f11-performance-opening','f11-disciplinary-opening','f11-approval-opening','f11-eos-opening'].includes(String(query.queryKey[1])) && (identity !== retired || !canView) && query.queryKey[2] === retired);
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
      {canViewActions && <ProProcessesSection employeeId={employeeId} authContext={authContext} canManage={canManage} qc={qc} onChildOpen={setDialogOpen} />}
      {canViewActions && <HrActionsSection employeeId={employeeId} authContext={authContext} canManage={canManage} qc={qc} onChildOpen={setDialogOpen} />}
      {canViewConfidential && <PerformanceSection employeeId={employeeId} authContext={authContext} canManage={canManage&&hasPermission(authContext,'hr.confidential.manage')} qc={qc} onChildOpen={setDialogOpen} />}
      {canViewConfidential && <DisciplinarySection employeeId={employeeId} authContext={authContext} canManage={canManage&&hasPermission(authContext,'hr.confidential.manage')} qc={qc} onChildOpen={setDialogOpen} />}
      {canViewConfidential && <HrNotesSection employeeId={employeeId} authContext={authContext} canManage={canManage&&hasPermission(authContext,'hr.confidential.manage')} qc={qc} onChildOpen={setDialogOpen} />}
      {canViewActions && <ApprovalsSection employeeId={employeeId} authContext={authContext} canManage={canManage} qc={qc} onChildOpen={setDialogOpen} />}
      <EosSection employeeId={employeeId} authContext={authContext} canManage={canManage||hasPermission(authContext,'hr.eos.manage')} qc={qc} onChildOpen={setDialogOpen} />
    </div>
  );
}

// =============================================================================
// 1. PRO PROCESSES
// =============================================================================

function ProProcessesSection({ employeeId, authContext, canManage, qc, onChildOpen }: {
  employeeId: number; authContext: AuthContext; canManage: boolean; qc: ReturnType<typeof useQueryClient>; onChildOpen: (open: boolean) => void;
}) {
  const [opening,setOpening]=useState<{target:{id:number;action:'update'|'archive'}|null}|null>(null);
  const {onDenied}=useContext(HrActionsReadIdentity);
  const uiRead1=useHrActionQuery("pro",employeeId),{data:items=[]}=uiRead1;
  const openDialog=(selected?:{id:number},action:'update'|'archive'='update')=>{
    if(!canManage||!uiRead1.canDispatch())return;
    setOpening({target:selected?{id:selected.id,action}:null});onChildOpen(true);
  };
  const handleClose=()=>{setOpening(null);onChildOpen(false);};
  return (<>
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
                  <Button aria-label="Archive record" size="icon" variant="ghost" className="h-7 w-7 text-red-500 dark:text-red-300" onClick={() => openDialog(item,'archive')}><Archive className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </div>
          )} />
        </div>
      }



    </div></QueryReadBoundary>
      {opening&&<ProProcessEditor employeeId={employeeId} authContext={authContext} target={opening.target} canDispatch={()=>canManage&&uiRead1.canDispatch()} onDenied={onDenied} onClose={handleClose} onSaved={(_receipt,action)=>{
        toast.success(action==='archive'?'PRO process archived':action==='update'?'PRO process updated':'PRO process created');
        invalidateHrEmployeeProProcesses(qc,employeeId);invalidateHrEmployeeActions(qc,employeeId);
      }}/>}
    </>
  );
}

// =============================================================================
// 2. HR ACTIONS
// =============================================================================

function HrActionsSection({ employeeId, authContext, canManage, qc, onChildOpen }: {
  employeeId: number; authContext:AuthContext; canManage: boolean; qc: ReturnType<typeof useQueryClient>; onChildOpen: (open: boolean) => void;
}) {
  const [opening,setOpening]=useState<{target:{id:number;action:'update'|'archive'|'close'}|null}|null>(null);
  const {onDenied}=useContext(HrActionsReadIdentity);
  const uiRead1=useHrActionQuery("actions",employeeId),{data:items=[]}=uiRead1;
  const openDialog=(selected?:{id:number},action:'update'|'archive'|'close'='update')=>{
    if(!canManage||!uiRead1.canDispatch())return;
    setOpening({target:selected?{id:selected.id,action}:null});onChildOpen(true);
  };
  const handleClose=()=>{setOpening(null);onChildOpen(false);};
  return (<>
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
                    <Button aria-label="Close" size="icon" variant="ghost" className="h-7 w-7 text-green-600 dark:text-green-300" title="Close" onClick={() => openDialog(item,'close')}><CheckCircle className="h-3.5 w-3.5" /></Button>
                  ) : null}
                  <Button aria-label="Archive record" size="icon" variant="ghost" className="h-7 w-7 text-red-500 dark:text-red-300" onClick={() => openDialog(item,'archive')}><Archive className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </div>
          )} />
        </div>
      }


    </div></QueryReadBoundary>
    {opening&&<HrRecordEditor kind="hr-action" employeeId={employeeId} authContext={authContext} target={opening.target} canDispatch={()=>canManage&&uiRead1.canDispatch()} onDenied={onDenied} onClose={handleClose} onSaved={(_receipt,action)=>{
      toast.success(action==='archive'?'HR action archived':action==='close'?'HR action closed':action==='update'?'HR action updated':'HR action created');
      invalidateHrEmployeeHrActions(qc,employeeId);invalidateHrEmployeeActions(qc,employeeId);
    }}/>}
  </>
  );
}

// =============================================================================
// 3. PERFORMANCE
// =============================================================================

function PerformanceSection({ employeeId, authContext, canManage, qc, onChildOpen }: {
 employeeId:number;authContext:AuthContext;canManage:boolean;qc:ReturnType<typeof useQueryClient>;onChildOpen:(open:boolean)=>void;
}) {
 const [opening,setOpening]=useState<{target:{id:number;action:'update'|'archive'|'submit'|'approve'|'close'}|null}|null>(null);
 const {onDenied}=useContext(HrActionsReadIdentity);
 const uiRead1=useHrActionQuery("performance",employeeId),{data:items=[]}=uiRead1;
 const openDialog=(selected?:{id:number},action:'update'|'archive'|'submit'|'approve'|'close'='update')=>{
  if(!canManage||!uiRead1.canDispatch())return;
  setOpening({target:selected?{id:selected.id,action}:null});onChildOpen(true);
 };
 const handleClose=()=>{setOpening(null);onChildOpen(false);};
  return (<>
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
                  {item.status === "draft" && <Button aria-label="Submit" size="icon" variant="ghost" className="h-7 w-7 text-blue-500 dark:text-blue-300" title="Submit" onClick={() => openDialog(item,'submit')}><CheckSquare className="h-3.5 w-3.5" /></Button>}
                  {item.status === "submitted" && <Button aria-label="Approve" size="icon" variant="ghost" className="h-7 w-7 text-green-600 dark:text-green-300" title="Approve" onClick={() => openDialog(item,'approve')}><CheckCircle className="h-3.5 w-3.5" /></Button>}
                  {item.status === "approved" && <Button aria-label="Close review" size="icon" variant="ghost" className="h-7 w-7" title="Close review" onClick={() => openDialog(item,'close')}><CheckCircle className="h-3.5 w-3.5" /></Button>}
                  <Button aria-label="Archive record" size="icon" variant="ghost" className="h-7 w-7 text-red-500 dark:text-red-300" onClick={() => openDialog(item,'archive')}><Archive className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </div>
          )} />
        </div>
      }


    </div></QueryReadBoundary>
    {opening&&<HrRecordEditor kind="performance" employeeId={employeeId} authContext={authContext} target={opening.target} canDispatch={()=>canManage&&uiRead1.canDispatch()} onDenied={onDenied} onClose={handleClose} onSaved={(_receipt,action)=>{
     toast.success(action==='archive'?'Review archived':action==='submit'?'Review submitted':action==='approve'?'Review approved':'Review saved');
     invalidateHrEmployeePerformance(qc,employeeId);invalidateHrEmployeeActions(qc,employeeId);
    }}/>}
    </>
  );
}

// =============================================================================
// 4. DISCIPLINARY
// =============================================================================

function DisciplinarySection({ employeeId, authContext, canManage, qc, onChildOpen }: {
 employeeId:number;authContext:AuthContext;canManage:boolean;qc:ReturnType<typeof useQueryClient>;onChildOpen:(open:boolean)=>void;
}) {
 const [opening,setOpening]=useState<{target:{id:number;action:'update'|'archive'|'acknowledge'|'correct-acknowledgement'|'close'}|null}|null>(null);
 const {onDenied}=useContext(HrActionsReadIdentity);
 const uiRead1=useHrActionQuery("disciplinary",employeeId),{data:items=[]}=uiRead1;
 const openDialog=(selected?:{id:number},action:'update'|'archive'|'acknowledge'|'correct-acknowledgement'|'close'='update')=>{
  if(!canManage||!uiRead1.canDispatch())return;
  setOpening({target:selected?{id:selected.id,action}:null});onChildOpen(true);
 };
 const handleClose=()=>{setOpening(null);onChildOpen(false);};
  return (<>
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
                    <Button aria-label="Mark acknowledged" size="icon" variant="ghost" className="h-7 w-7 text-blue-500 dark:text-blue-300" title="Mark acknowledged" onClick={() => openDialog(item,'acknowledge')}><CheckCircle className="h-3.5 w-3.5" /></Button>
                  )}
                  {item.acknowledged_by_employee&&<Button aria-label="Correct acknowledgement" size="icon" variant="ghost" className="h-7 w-7" onClick={()=>openDialog(item,'correct-acknowledgement')}><Edit2 className="h-3.5 w-3.5"/></Button>}
                  {['open','under_review'].includes(item.status)&&<Button aria-label="Close record" size="icon" variant="ghost" className="h-7 w-7" onClick={()=>openDialog(item,'close')}><CheckCircle className="h-3.5 w-3.5"/></Button>}
                  <Button aria-label="Archive record" size="icon" variant="ghost" className="h-7 w-7 text-red-500 dark:text-red-300" onClick={() => openDialog(item,'archive')}><Archive className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </div>
          )} />
        </div>
      }


    </div></QueryReadBoundary>
    {opening&&<HrRecordEditor kind="disciplinary" employeeId={employeeId} authContext={authContext} target={opening.target} canDispatch={()=>canManage&&uiRead1.canDispatch()} onDenied={onDenied} onClose={handleClose} onSaved={(_receipt,action)=>{
     toast.success(action==='archive'?'Record archived':action==='acknowledge'?'Acknowledgement recorded':action==='correct-acknowledgement'?'Acknowledgement corrected':'Record saved');
     invalidateHrEmployeeDisciplinary(qc,employeeId);invalidateHrEmployeeActions(qc,employeeId);
    }}/>}
    </>
  );
}

// =============================================================================
// 5. HR NOTES
// =============================================================================

function HrNotesSection({ employeeId, authContext, canManage, qc, onChildOpen }: {
  employeeId: number; authContext:AuthContext; canManage: boolean; qc: ReturnType<typeof useQueryClient>; onChildOpen: (open: boolean) => void;
}) {
  const {onDenied}=useContext(HrActionsReadIdentity);
  const [dialog,setDialog]=useState<{target:{id:number}|null}|null>(null);

  const uiRead1 = useHrActionQuery("notes", employeeId);
  const { data: items = [] } = uiRead1;

  const openDialog = () => {
    if(!canManage||!uiRead1.canDispatch())return;
    setDialog({target:null});
    onChildOpen(true);
  };
  const handleClose = () => {setDialog(null);onChildOpen(false);};

  return (<>
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
                    <Button aria-label="Archive record" size="icon" variant="ghost" className="h-6 w-6 text-red-500 dark:text-red-300" onClick={()=>{if(canManage&&uiRead1.canDispatch()){setDialog({target:{id:item.id}});onChildOpen(true);}}}><Archive className="h-3 w-3" /></Button>
                  )}
                </div>
              </div>
              <ActionWording recordId={item.id} load={uiRead1.loadDetail} fields={[{id: "note_text", label: "Note"}]} />
            </div>
          )} />
        </div>
      }


    </div></QueryReadBoundary>
      {dialog&&<HrNoteEditor employeeId={employeeId} authContext={authContext} target={dialog.target} canDispatch={uiRead1.canDispatch} onDenied={onDenied} onClose={handleClose} onSaved={(_receipt,action)=>{toast.success(action==='archive'?'Note archived':'Note added');invalidateHrEmployeeNotes(qc,employeeId);}}/>}
    </>
  );
}

// =============================================================================
// 6. APPROVAL REQUESTS
// =============================================================================

function ApprovalsSection({ employeeId, authContext, canManage, qc, onChildOpen }: {
  employeeId: number; authContext:AuthContext; canManage: boolean; qc: ReturnType<typeof useQueryClient>; onChildOpen: (open: boolean) => void;
}) {
  const [opening,setOpening]=useState<{target:{id:number;action:'approve'|'reject'|'cancel'}|null}|null>(null);
  const {onDenied}=useContext(HrActionsReadIdentity);
  const uiRead1=useHrActionQuery("approvals",employeeId),{data:items=[]}=uiRead1;
  const openDialog=()=>{if(!canManage||!uiRead1.canDispatch())return;setOpening({target:null});onChildOpen(true);};
  const handleClose=()=>{setOpening(null);onChildOpen(false);};
  return <>
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
                  <Button size="sm" variant="outline" className="h-7 text-xs text-green-700 border-green-300 dark:text-green-200 dark:border-green-800" onClick={() => { setOpening({target:{ id: item.id, action: "approve" }}); onChildOpen(true); }}>Approve</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs text-red-700 border-red-300 dark:text-red-200 dark:border-red-800" onClick={() => { setOpening({target:{ id: item.id, action: "reject" }}); onChildOpen(true); }}>Reject</Button>
                  <Button aria-label="Cancel request" size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => { setOpening({target:{ id: item.id, action: "cancel" }}); onChildOpen(true); }}><XCircle className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </div>
          )} />
        </div>
      }


    </div></QueryReadBoundary>
    {opening&&<HrRecordEditor kind="approval" employeeId={employeeId} authContext={authContext} target={opening.target} canDispatch={()=>canManage&&uiRead1.canDispatch()} admission={{blocked:!canManage||!uiRead1.ready,message:'Current approval list is unavailable. Your draft is retained; retry the list before saving.',retry:()=>void uiRead1.refetch()}} onDenied={onDenied} onClose={handleClose} onSaved={(_receipt,action)=>{toast.success(action==='approve'?'Request approved':action==='reject'?'Request rejected':action==='cancel'?'Request cancelled':'Approval request created');invalidateHrEmployeeApprovals(qc,employeeId);invalidateHrEmployeeActions(qc,employeeId);void qc.invalidateQueries({queryKey:['hr','actions','global-approvals'],refetchType:'none'});}}/>}
  </>;
}

// =============================================================================
// 7. EOS & CLEARANCE
// =============================================================================

function EosSection({ employeeId, authContext, canManage, qc, onChildOpen }: {
  employeeId: number; authContext:AuthContext; canManage: boolean; qc: ReturnType<typeof useQueryClient>; onChildOpen: (open: boolean) => void;
}) {
  type ClearanceTarget = { employeeId: number; caseId: number; identity: string; item?:{id:number;action:'clear'|'block'} };
  const [eosOpening,setEosOpening]=useState<{target:{id:number;action:'update'|'archive'}|null}|null>(null);
  const [clearanceDialogOpen, setClearanceDialogOpen] = useState(false);
  const [clearanceTarget, setClearanceTarget] = useState<ClearanceTarget | null>(null);
  const clearanceOwner = useRef<{
    active: boolean; target: ClearanceTarget | null;
    mayOpen: (caseId: number) => boolean; maySubmit: (target: ClearanceTarget) => boolean;
  }>({active: false, target: null, mayOpen: () => false, maySubmit: () => false});
  const {identity,onDenied} = useContext(HrActionsReadIdentity);
  const [selectedEosId, setSelectedEosId] = usePersistentUiState<number | null>(`hr:action-records:${identity}:${employeeId}:selected-eos`, null);

  const uiRead1 = useHrActionQuery("eos", employeeId);
  const { data: eosCases = [] } = uiRead1;

  const activeCaseId = eosCases.some(eos => eos.id === selectedEosId) ? selectedEosId : eosCases[0]?.id ?? null;

  const uiRead2 = useHrActionQuery("clearance", employeeId, activeCaseId ?? undefined);
  const { data: clearanceItems = [] } = uiRead2;

  const eosReady = uiRead1.data !== undefined && !uiRead1.isLoading && !uiRead1.isFetching && !uiRead1.isError;
  const checklistReady = uiRead2.data !== undefined && !uiRead2.isLoading && !uiRead2.isFetching && !uiRead2.isError;
  const clearanceAdmitted = canManage && clearanceDialogOpen && clearanceTarget !== null
    && clearanceTarget.employeeId === employeeId && clearanceTarget.identity === identity
    && eosReady && eosCases.some(eos => eos.id === clearanceTarget.caseId&&!['closed','cancelled'].includes(eos.case_status))
    && activeCaseId === clearanceTarget.caseId && checklistReady && (!clearanceTarget.item||clearanceItems.some(item=>item.id===clearanceTarget.item!.id));
  useLayoutEffect(() => {
    const owner = clearanceOwner.current;
    owner.active = true;
    return () => { owner.active = false; owner.target = null; };
  }, []);
  useLayoutEffect(() => {
    const owner = clearanceOwner.current;
    owner.mayOpen = caseId => canManage && eosReady && eosCases.some(eos => eos.id === caseId&&!['closed','cancelled'].includes(eos.case_status));
    owner.maySubmit = target => clearanceAdmitted && target === clearanceTarget;
    return () => { owner.mayOpen = () => false; owner.maySubmit = () => false; };
  }, [canManage, eosReady, eosCases, clearanceAdmitted, clearanceTarget]);

  const openEosDialog=(selected?:{id:number})=>{if(!canManage||!uiRead1.canDispatch())return;setEosOpening({target:selected?{id:selected.id,action:'update'}:null});onChildOpen(true);};
  const handleEosClose=()=>{setEosOpening(null);onChildOpen(false);};

  const openClearanceDialog = (eosId: number,item?:{id:number;action:'clear'|'block'}) => {
    const owner = clearanceOwner.current;
    if (!owner.active || !owner.mayOpen(eosId)) return;
    // This object identifies one opening, independently of the browsing selection.
    const target = {employeeId, caseId: eosId, identity,...(item?{item}:{})};
    owner.target = target;
    setClearanceTarget(target);
    setSelectedEosId(eosId);
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

  return (
    <><QueryReadBoundary queries={[uiRead1,uiRead2]}><div className="rounded-lg border bg-card p-4">
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
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={['closed','cancelled'].includes(eos.case_status)} onClick={() => openClearanceDialog(eos.id)}><Plus className="h-3 w-3" />Clearance</Button>
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
                                <Button aria-label="Clear" disabled={!uiRead1.ready||!uiRead2.ready||['closed','cancelled'].includes(eos.case_status)} size="icon" variant="ghost" className="h-5 w-5 text-green-600 dark:text-green-300" title="Clear" onClick={()=>openClearanceDialog(eos.id,{id:ci.id,action:'clear'})}><CheckCircle className="h-3 w-3" /></Button>
                                <Button aria-label="Block" disabled={!uiRead1.ready||!uiRead2.ready||['closed','cancelled'].includes(eos.case_status)} size="icon" variant="ghost" className="h-5 w-5 text-red-500 dark:text-red-300" title="Block" onClick={()=>openClearanceDialog(eos.id,{id:ci.id,action:'block'})}><XCircle className="h-3 w-3" /></Button>
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

    </div></QueryReadBoundary>
    {clearanceDialogOpen&&clearanceTarget&&<ClearanceEditor employeeId={employeeId}caseId={clearanceTarget.caseId}authContext={authContext}target={clearanceTarget.item??null}admitted={clearanceAdmitted}canDispatch={()=>{const owner=clearanceOwner.current;return owner.active&&owner.target===clearanceTarget&&owner.maySubmit(clearanceTarget)&&uiRead1.canDispatch()&&uiRead2.canDispatch();}}retry={()=>{void uiRead1.refetch();if(activeCaseId===clearanceTarget.caseId)void uiRead2.refetch();}}onDenied={onDenied}onClose={handleClearanceClose}onSaved={(_receipt,action)=>{invalidateHrEmployeeClearance(qc,clearanceTarget.caseId,clearanceTarget.employeeId);if(clearanceOwner.current.active&&clearanceOwner.current.target===clearanceTarget)toast.success(action==='clear'?'Clearance recorded':action==='block'?'Clearance blocked':'Clearance item added');}}/>}
    {eosOpening&&<HrRecordEditor kind="eos-case" employeeId={employeeId} authContext={authContext} target={eosOpening.target} canDispatch={()=>canManage&&uiRead1.canDispatch()} admission={{blocked:!canManage||!uiRead1.ready,message:'Current EOS cases are unavailable. Your draft is retained; retry before saving.',retry:()=>void uiRead1.refetch()}} onDenied={onDenied} onClose={handleEosClose} onSaved={(_receipt,action)=>{toast.success(action==='archive'?'EOS case archived':eosOpening.target?'EOS case updated':'EOS case created');invalidateHrEmployeeEos(qc,employeeId);invalidateHrEmployeeActions(qc,employeeId);void qc.invalidateQueries({queryKey:['hr','actions','global-eos-cases'],refetchType:'none'});}}/>}
    </>
  );
}
