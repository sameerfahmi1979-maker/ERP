"use client";
import { RecordCollection } from "@/components/erp/table/record-collection";
import { QueryReadBoundary } from "@/components/erp/query-read-boundary";
import{LeavePeriodBalances}from'../leave-period-balances';

/**
 * ERP HR.4 — Employee Time Tab
 *
 * 4 sections:
 *   1. Attendance (daily summaries + raw punches + corrections)
 *   2. Shift & Calendar (shift assignments)
 *   3. Leave Requests & Balances
 *   4. Overtime
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatHours, getCurrentLeaveYear } from "@/lib/hr/time/date-utils";
import {
  getAttendanceStatusBadge,
  getAttendanceTypeLabel,
  getLeaveApprovalStatusBadge,
  getOvertimeApprovalStatusBadge,
  getPunchSourceLabel,
  getPunchTypeLabel,
} from "@/lib/hr/time/status";
import { invalidateHrEmployeeTime } from "@/lib/query/invalidation";
import type { AuthContext } from "@/lib/rbac/check";
import {useHrTimeRecords} from "@/hooks/use-hr-time-records";
import {timeRecordsReadIdentity} from "@/lib/reads/hr-time-records-schema";
import {useTimeReadAdmission, useTimeChildOpen} from "../time/time-read-admission";

import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  AlertTriangle,
  Archive,
  Ban,
  Calendar,
  CheckCircle,
  ChevronDown, ChevronUp,
  Clock,
  Edit2,
  Plane,
  Plus,
  RefreshCw,
  Timer,
  XCircle,
} from "lucide-react";
import { useCallback, useLayoutEffect, useState} from "react";
import { toast } from "sonner";
import {TimeRecordEditor,type TimeTarget}from'../time-record-editor';
import {HrChildRecoveryPanel}from'../hr-child-recovery-panel';

// ── Props ──────────────────────────────────────────────────────────────────────

type Props = {
  employeeId: number;
  authContext: AuthContext;
  onChildOpen?: (open: boolean) => void;
};

// ── Permission helper (client-safe, no server imports) ─────────────────────────

function checkPerm(ctx: AuthContext, code: string): boolean {
  return (
    ctx.permissionCodes.includes(code) ||
    ctx.roleCodes.includes("system_admin") ||
    ctx.roleCodes.includes("group_admin")
  );
}

// ── Format date safe ───────────────────────────────────────────────────────────

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  try { return format(new Date(d), "dd MMM yyyy"); } catch { return d; }
}

function fmtDatetime(d: string | null | undefined): string {
  if (!d) return "—";
  try { return format(new Date(d), "dd MMM yyyy HH:mm"); } catch { return d; }
}

function TimeReadFeedback({read}: {read: {validationMessage: string | null; detailError: string | null; detailPending: boolean; detailUnavailable: boolean; detailQuery: {refetch: () => Promise<unknown>}}}) {
  return <>{read.validationMessage && <p role="alert" className="mb-2 text-sm text-destructive">{read.validationMessage}</p>}
    {read.detailPending && <p role="status">Checking the selected record…</p>}
    {read.detailUnavailable && <p role="alert">The selected record is no longer available. Its editor has been retired.</p>}
    {read.detailError && <p role="alert">{read.detailError} <Button type="button" variant="outline" onClick={() => void read.detailQuery.refetch()}>Retry selected record</Button></p>}
  </>;
}

// ── Main Tab Component ─────────────────────────────────────────────────────────

export function EmployeeTimeTab({ employeeId, authContext, onChildOpen }: Props) {
  return <TimeSession key={JSON.stringify([employeeId, timeRecordsReadIdentity(authContext)])} employeeId={employeeId} authContext={authContext} onChildOpen={onChildOpen} />;
}

function TimeSession({employeeId, authContext, onChildOpen}: Props) {
  const qc = useQueryClient(), identity = timeRecordsReadIdentity(authContext);
  useLayoutEffect(() => () => {
    const queryKey = ["hr", "time-records-options", identity]; void qc.cancelQueries({queryKey}); qc.removeQueries({queryKey});
  }, [qc, identity]);
  const [subjectDenied, setSubjectDenied] = useState(false);
  const denySubject = useCallback(() => {setSubjectDenied(true); onChildOpen?.(false);}, [onChildOpen]);
  const active = authContext.isAccountActive && !authContext.profile?.must_change_password;
  // Existing F03 suffixes are request hints, never subject grants.
  const canViewAttendance = ["hr.attendance.view", "hr.attendance.view.self", "hr.attendance.view.team"].some(code => checkPerm(authContext, code));
  const canManageAttendance = checkPerm(authContext, "hr.attendance.manage");
  const canViewLeave = ["hr.leave.view", "hr.leave.view.self", "hr.leave.view.team", "hr.leave.manage"].some(code => checkPerm(authContext, code));
  const canManageLeave = checkPerm(authContext, "hr.leave.manage");

  if (!active || subjectDenied || !canViewAttendance && !canViewLeave) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
        <AlertTriangle className="h-4 w-4 mr-2" />
        You do not have permission to view time records.
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6"><HrChildRecoveryPanel authContext={authContext}/>{canViewLeave&&<LeavePeriodBalances employee={employeeId}identity={identity}/>}
      {canViewAttendance && (
        <>
          <AttendanceSection
            authContext={authContext} onSubjectDenied={denySubject}
            employeeId={employeeId}
            canManage={canManageAttendance}
            onChildOpen={onChildOpen}
          />
          <ShiftCalendarSection
            authContext={authContext} onSubjectDenied={denySubject}
            employeeId={employeeId}
            canManage={canManageAttendance}
            onChildOpen={onChildOpen}
          />
          <OvertimeSection
            authContext={authContext} onSubjectDenied={denySubject}
            employeeId={employeeId}
            canManage={canManageAttendance}
            onChildOpen={onChildOpen}
          />
        </>
      )}
      {canViewLeave && (
        <LeaveSection
          authContext={authContext} onSubjectDenied={denySubject}
          employeeId={employeeId}
          canManage={canManageLeave}
          onChildOpen={onChildOpen}
        />
      )}
    </div>
  );
}

// ── 1. Attendance Section ──────────────────────────────────────────────────────

type TimeSectionProps={authContext:AuthContext;onSubjectDenied:()=>void;employeeId:number;canManage:boolean;onChildOpen?:(open:boolean)=>void};
function AttendanceSection({employeeId,authContext,canManage,onChildOpen,onSubjectDenied}:TimeSectionProps){
 const[showPunches,setShowPunches]=useState(false),[showCorrections,setShowCorrections]=useState<number|null>(null);
 const dailyRead=useHrTimeRecords('daily',employeeId,authContext,onSubjectDenied),punchRead=useHrTimeRecords('punches',employeeId,authContext,onSubjectDenied,{enabled:showPunches}),correctionRead=useHrTimeRecords('corrections',employeeId,authContext,onSubjectDenied,{enabled:showCorrections!==null,summaryId:showCorrections??undefined});
 const reads=[...dailyRead.reads,...punchRead.reads,...correctionRead.reads],admission=useTimeReadAdmission(canManage&&dailyRead.access.canManage&&(!showPunches||punchRead.access.canManage),reads,dailyRead.owner);
 const qc=useQueryClient(),[target,setTarget]=useState<TimeTarget|null>(null),isPending=false;useTimeChildOpen(target!==null,onChildOpen);
 const open=async(kind:TimeTarget['kind'],id:number|null,action:TimeTarget['action'])=>{if(!admission.canDispatch()||id!==null&&!(dailyRead.rows).some(row=>row.id===id))return;if(id!==null){const row=await dailyRead.loadDetail(id);if(!row||!admission.isCurrent())return;}setTarget({kind,id,action});};
 if(target?.id!==null&&target&&(dailyRead.detailUnavailable||dailyRead.restricted)){dailyRead.closeDetail();setTarget(null);onChildOpen?.(false);}
 const summaries=dailyRead.rows,punches=punchRead.rows,corrections=correctionRead.rows,handleApprove=(id:number)=>open('attendance-summary',id,'approve'),handleQuery=(id:number)=>open('attendance-summary',id,'query'),openSummary=(id:number)=>open('attendance-summary',id,'update'),openCorrection=(id:number)=>open('attendance-summary',id,'correct');
 const afterSave=()=>{void dailyRead.refresh();if(showPunches)void punchRead.refresh();if(showCorrections!==null)void correctionRead.refresh();};
  return (<>
    <QueryReadBoundary queries={reads}><section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-semibold">Attendance</h3>
          <span className="text-xs text-muted-foreground">({dailyRead.serverRead.totalCount ?? "?"} records)</span>
        </div>
        {canManage && dailyRead.access.canManage && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={!admission.ready} onClick={() => {
              if (!admission.canDispatch()) return;
              open('attendance-punch',null,'create');
            }}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Punch
            </Button>
            <Button size="sm" variant="outline" disabled={!admission.ready} onClick={() => {
              if (!admission.canDispatch()) return;
              dailyRead.closeDetail();
              open('attendance-summary',null,'create');
            }}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Daily Summary
            </Button>
          </div>
        )}
      </div>

      <TimeReadFeedback read={dailyRead} />
      {dailyRead.restricted ? <p role="alert">Attendance access is restricted.</p> : (
        <div className="border rounded-md divide-y">
          <RecordCollection presentation="embedded" id="hr.employee-time-tab.AttendanceSection.summaries" rows={summaries} serverRead={dailyRead.serverRead} isLoading={dailyRead.busy} fields={[{"id":"attendance_date","path":"attendance_date","label":"Attendance Date"},{"id":"approval_status","path":"approval_status","label":"Approval Status"}]} renderRecord={(row) => {
            const badge = getAttendanceStatusBadge(row.approval_status);
            return (
              <div key={row.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                <span className="w-24 text-muted-foreground shrink-0">{fmtDate(row.attendance_date)}</span>
                <span className="w-20 font-medium shrink-0">{getAttendanceTypeLabel(row.attendance_type)}</span>
                <span className="text-muted-foreground shrink-0">{formatHours(row.total_hours)}</span>
                {row.is_missing_punch && <Badge variant="destructive" className="text-xs">Missing Punch</Badge>}
                <Badge variant={badge.variant} className="text-xs">{badge.label}</Badge>
                <div className="ml-auto flex gap-1 shrink-0">
                  {canManage && dailyRead.access.canManage && row.approval_status === "pending" && (
                    <>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => handleApprove(row.id)} disabled={isPending || !admission.ready}>
                        <CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => handleQuery(row.id)} disabled={isPending || !admission.ready}>
                        <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Query
                      </Button>
                    </>
                  )}
                  {canManage && dailyRead.access.canManage && (
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={!admission.ready} onClick={() => void openCorrection(row.id)}>
                      <RefreshCw className="h-3.5 w-3.5 mr-1" /> Correct
                    </Button>
                  )}
                  <Button aria-label="Show correction history" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setShowCorrections(showCorrections === row.id ? null : row.id)}>
                    {showCorrections === row.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </Button>
                  {canManage && dailyRead.access.canManage && (
                    <Button aria-label="Edit record" size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={!admission.ready} onClick={() => void openSummary(row.id)}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          }} />
        </div>
      )}

      {/* Corrections sub-panel */}
      {showCorrections != null && (
        <div className="mt-2 border rounded-md bg-muted/30 p-3 text-xs space-y-1">
          <p className="font-medium text-muted-foreground mb-2">Correction History</p>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowCorrections(null)}>Close history</Button>
          <TimeReadFeedback read={correctionRead} />
          {correctionRead.collectionUnavailable ? <p role="alert">The selected attendance record is no longer available. Close its history or select another permitted record.</p> : <RecordCollection presentation="embedded" id="hr.employee-time-tab.AttendanceSection.corrections" rows={corrections} serverRead={correctionRead.serverRead} isLoading={correctionRead.busy} fields={[{"id":"created_at","path":"created_at","label":"Created At"}]} renderRecord={(c) => (
            <div key={c.id} className="flex gap-2 text-muted-foreground">
              <span className="shrink-0">{fmtDatetime(c.created_at)}</span>
              <span>{c.correction_reason}</span>
            </div>
          )} />}
        </div>
      )}

      {/* Raw punches toggle */}
      <div className="mt-3">
        <Button size="sm" variant="ghost" className="text-xs text-muted-foreground" onClick={() => setShowPunches(!showPunches)}>
          {showPunches ? "Hide" : "Show"} Raw Punches ({punchRead.serverRead.totalCount ?? "?"})
        </Button>
        {showPunches && (
          <div className="mt-2 border rounded-md divide-y text-xs">
            <TimeReadFeedback read={punchRead} />
            <RecordCollection presentation="embedded" id="hr.employee-time-tab.AttendanceSection.punches" rows={punches} serverRead={punchRead.serverRead} isLoading={punchRead.busy} fields={[{"id":"punch_datetime","path":"punch_datetime","label":"Punch Datetime"},{"id":"punch_type","path":"punch_type","label":"Punch Type"}]} renderRecord={(p) => (
              <div key={p.id} className="px-3 py-2 flex gap-3 text-muted-foreground">
                <span>{fmtDatetime(p.punch_datetime)}</span>
                <span className="font-medium">{getPunchTypeLabel(p.punch_type)}</span>
                <span>{getPunchSourceLabel(p.punch_source)}</span>
              </div>
            )} />
          </div>
        )}
      </div>

      </section></QueryReadBoundary>{target&&<TimeRecordEditor target={target}employeeId={employeeId}authContext={authContext}canDispatch={()=>admission.canDispatch()&&(target.id===null||dailyRead.isDetailCurrent(target.id))}blocked={!admission.ready}retry={admission.retry}onClose={()=>{dailyRead.closeDetail();setTarget(null);onChildOpen?.(false);}}onDenied={onSubjectDenied}onSaved={()=>{invalidateHrEmployeeTime(qc,employeeId);toast.success('Time change saved');afterSave();}}/>}</>);}
function ShiftCalendarSection({employeeId,authContext,canManage,onChildOpen,onSubjectDenied}:TimeSectionProps){
 const recordRead=useHrTimeRecords('shifts',employeeId,authContext,onSubjectDenied),reads=recordRead.reads,admission=useTimeReadAdmission(canManage&&recordRead.access.canManage,reads,recordRead.owner);
 const qc=useQueryClient(),[target,setTarget]=useState<TimeTarget|null>(null),isPending=false;useTimeChildOpen(target!==null,onChildOpen);
 const open=async(kind:TimeTarget['kind'],id:number|null,action:TimeTarget['action'])=>{if(!admission.canDispatch()||id!==null&&!(recordRead.rows).some(row=>row.id===id))return;if(id!==null){const row=await recordRead.loadDetail(id);if(!row||!admission.isCurrent())return;}setTarget({kind,id,action});};
 if(target?.id!==null&&target&&(recordRead.detailUnavailable||recordRead.restricted)){recordRead.closeDetail();setTarget(null);onChildOpen?.(false);}
 const assignments=recordRead.rows,openEdit=(id:number)=>open('shift-assignment',id,'update'),handleArchive=(id:number)=>open('shift-assignment',id,'archive'),afterSave=()=>{void recordRead.refresh();};
  return (<>
    <QueryReadBoundary queries={reads}><section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-semibold">Shift & Calendar</h3>
        </div>
        {canManage && recordRead.access.canManage && (
          <Button size="sm" variant="outline" disabled={!admission.ready} onClick={() => {
            if (!admission.canDispatch()) return;
            recordRead.closeDetail();
            open('shift-assignment',null,'create');
          }}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Assignment
          </Button>
        )}
      </div>

      <TimeReadFeedback read={recordRead} />
      {recordRead.restricted ? <p role="alert">Shift access is restricted.</p> : (
        <div className="border rounded-md divide-y">
          <RecordCollection presentation="embedded" id="hr.employee-time-tab.ShiftCalendarSection.assignments" rows={assignments} serverRead={recordRead.serverRead} isLoading={recordRead.busy} fields={[{"id":"effective_from","path":"effective_from","label":"Effective From"},{"id":"effective_to","path":"effective_to","label":"Effective To"}]} renderRecord={(row) => (
            <div key={row.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
              <div className="flex-1 min-w-0">
                <p className="font-medium">{row.work_shift?.shift_name ?? "—"}</p>
                <p className="text-xs text-muted-foreground">{row.work_calendar?.calendar_name ?? "No calendar"} · {fmtDate(row.effective_from)} → {row.effective_to ? fmtDate(row.effective_to) : "Ongoing"}</p>
              </div>
              {row.overtime_eligible && <Badge variant="secondary" className="text-xs">OT Eligible</Badge>}
              {!row.attendance_required && <Badge variant="outline" className="text-xs">No Att. Req.</Badge>}
              {canManage && recordRead.access.canManage && (
                <div className="flex gap-1 shrink-0">
                  <Button aria-label="Edit record" size="sm" variant="ghost" className="h-7 px-2" disabled={!admission.ready} onClick={() => void openEdit(row.id)}>
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                    <Button aria-label="Archive record" size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => handleArchive(row.id)} disabled={isPending || !admission.ready}>
                    <Archive className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          )} />
        </div>
      )}

      </section></QueryReadBoundary>{target&&<TimeRecordEditor target={target}employeeId={employeeId}authContext={authContext}canDispatch={()=>admission.canDispatch()&&(target.id===null||recordRead.isDetailCurrent(target.id))}blocked={!admission.ready}retry={admission.retry}onClose={()=>{recordRead.closeDetail();setTarget(null);onChildOpen?.(false);}}onDenied={onSubjectDenied}onSaved={()=>{invalidateHrEmployeeTime(qc,employeeId);toast.success('Time change saved');afterSave();}}/>}</>);}
function LeaveSection({employeeId,authContext,canManage,onChildOpen,onSubjectDenied}:TimeSectionProps){
 const currentYear=getCurrentLeaveYear(),leaveRead=useHrTimeRecords('leave',employeeId,authContext,onSubjectDenied),balanceRead=useHrTimeRecords('balances',employeeId,authContext,onSubjectDenied,{year:currentYear}),reads=[...leaveRead.reads,...balanceRead.reads],admission=useTimeReadAdmission(canManage&&leaveRead.access.canManage&&balanceRead.access.canManage,reads,leaveRead.owner);
 const qc=useQueryClient(),[target,setTarget]=useState<TimeTarget|null>(null),isPending=false;useTimeChildOpen(target!==null,onChildOpen);
 const open=async(kind:TimeTarget['kind'],id:number|null,action:TimeTarget['action'])=>{if(!admission.canDispatch()||id!==null&&!([...leaveRead.rows,...balanceRead.rows]).some(row=>row.id===id))return;if(id!==null){const row=await (kind==='leave-balance'?balanceRead:leaveRead).loadDetail(id);if(!row||!admission.isCurrent())return;}setTarget({kind,id,action});};
 if(target?.id!==null&&target&&(leaveRead.detailUnavailable||leaveRead.restricted)){leaveRead.closeDetail();setTarget(null);onChildOpen?.(false);}
 const leaves=leaveRead.rows,balances=balanceRead.rows,handleApprove=(id:number)=>open('leave-request',id,'approve'),openDecision=(id:number,action:'reject'|'cancel')=>open('leave-request',id,action),afterSave=()=>{void leaveRead.refresh();void balanceRead.refresh();};
  return (<>
    <QueryReadBoundary queries={reads}><section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Plane className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-semibold">Leave Requests & Balances</h3>
        </div>
        {canManage && leaveRead.access.canManage && balanceRead.access.canManage && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={!admission.ready} onClick={() => {
              if (!admission.canDispatch()) return;
              open('leave-balance',null,'create');
            }}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Update Balance
            </Button>
            <Button size="sm" variant="outline" disabled={!admission.ready} onClick={() => {
              if (!admission.canDispatch()) return;
              open('leave-request',null,'create');
            }}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Leave Request
            </Button>
          </div>
        )}
      </div>

      {/* Leave Balances */}
      <TimeReadFeedback read={leaveRead} />
      {(leaveRead.restricted || balanceRead.restricted) && <p role="alert">Leave records are not available with your current access.</p>}
      <div className="mb-2 flex items-center gap-3 text-xs" aria-label="Leave balance pages">
        <span>{currentYear} leave balances: {balanceRead.serverRead.totalCount ?? "unknown"}</span>
        <Button size="sm" variant="outline" disabled={balanceRead.busy || balanceRead.serverRead.pagination.pageIndex === 0} onClick={() => balanceRead.serverRead.onPaginationChange(old => ({...old, pageIndex: Math.max(0, old.pageIndex - 1)}))}>Previous balances</Button>
        <Button size="sm" variant="outline" disabled={balanceRead.busy || balanceRead.serverRead.totalCount == null || (balanceRead.serverRead.pagination.pageIndex + 1) * balanceRead.serverRead.pagination.pageSize >= balanceRead.serverRead.totalCount} onClick={() => balanceRead.serverRead.onPaginationChange(old => ({...old, pageIndex: old.pageIndex + 1}))}>Next balances</Button>
      </div>
      {balances.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          {balances.map((b) => (
            <div key={b.id} className="border rounded-md p-3 text-xs">
              <p className="font-medium text-muted-foreground">{b.leave_type?.name_en ?? "—"}</p>
              <p className="text-lg font-bold mt-1">{b.balance_days ?? "—"}<span className="text-xs font-normal text-muted-foreground ml-1">recorded days</span></p>
              <p className="text-muted-foreground">{b.used_days}/{b.entitled_days} used · Current availability requires period and reservation review below.</p>
            </div>
          ))}
        </div>
      )}

      {/* Leave Requests */}
      {(
        <div className="border rounded-md divide-y">
          <RecordCollection presentation="embedded" id="hr.employee-time-tab.LeaveSection.leaves" rows={leaves} serverRead={leaveRead.serverRead} fields={[{"id":"start_date","path":"start_date","label":"Start Date"},{"id":"end_date","path":"end_date","label":"End Date"},{"id":"approval_status","path":"approval_status","label":"Approval Status"}]} renderRecord={(row) => {
            const badge = getLeaveApprovalStatusBadge(row.approval_status);
            return (
              <div key={row.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{row.leave_type?.name_en ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{fmtDate(row.start_date)} → {fmtDate(row.end_date)} · {row.total_days ?? 0} day(s)</p>
                </div>
                <Badge variant={badge.variant} className="text-xs">{badge.label}</Badge>
                {canManage && leaveRead.access.canManage && (
                  <div className="flex gap-1 shrink-0">
                    {row.approval_status === "pending" && (
                      <>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => handleApprove(row.id)} disabled={isPending || !admission.ready}>
                          <CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive" disabled={!admission.ready} onClick={() => void openDecision(row.id, "reject")}>
                          <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                        </Button>
                      </>
                    )}
                    {["pending", "approved"].includes(row.approval_status) && (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={!admission.ready} onClick={() => void openDecision(row.id, "cancel")}>
                        <Ban className="h-3.5 w-3.5 mr-1" /> Cancel
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          }} />
        </div>
      )}

      </section></QueryReadBoundary>{target&&<TimeRecordEditor target={target}employeeId={employeeId}authContext={authContext}canDispatch={()=>admission.canDispatch()&&(target.id===null||(target.kind==='leave-balance'?balanceRead:leaveRead).isDetailCurrent(target.id))}blocked={!admission.ready}retry={admission.retry}onClose={()=>{leaveRead.closeDetail();setTarget(null);onChildOpen?.(false);}}onDenied={onSubjectDenied}onSaved={()=>{invalidateHrEmployeeTime(qc,employeeId);toast.success('Time change saved');afterSave();}}/>}</>);}
function OvertimeSection({employeeId,authContext,canManage,onChildOpen,onSubjectDenied}:TimeSectionProps){
 const recordRead=useHrTimeRecords('overtime',employeeId,authContext,onSubjectDenied),reads=recordRead.reads,admission=useTimeReadAdmission(canManage&&recordRead.access.canManage,reads,recordRead.owner);
 const qc=useQueryClient(),[target,setTarget]=useState<TimeTarget|null>(null),isPending=false;useTimeChildOpen(target!==null,onChildOpen);
 const open=async(kind:TimeTarget['kind'],id:number|null,action:TimeTarget['action'])=>{if(!admission.canDispatch()||id!==null&&!(recordRead.rows).some(row=>row.id===id))return;if(id!==null){const row=await recordRead.loadDetail(id);if(!row||!admission.isCurrent())return;}setTarget({kind,id,action});};
 if(target?.id!==null&&target&&(recordRead.detailUnavailable||recordRead.restricted)){recordRead.closeDetail();setTarget(null);onChildOpen?.(false);}
 const records=recordRead.rows,totalApprovedHours=records.filter(r=>r.approval_status==='approved').reduce((s,r)=>s+Number(r.hours),0),handleApprove=(id:number)=>open('overtime',id,'approve'),openRecord=(id:number,reject=false)=>open('overtime',id,reject?'reject':'update'),handleArchive=(id:number)=>open('overtime',id,'archive'),afterSave=()=>{void recordRead.refresh();};
  return (<>
    <QueryReadBoundary queries={recordRead.reads}><section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Timer className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-semibold">Overtime</h3>
          {totalApprovedHours > 0 && (
            <span className="text-xs text-muted-foreground">(Approved on this page: {formatHours(totalApprovedHours)})</span>
          )}
        </div>
        {canManage && recordRead.access.canManage && (
          <Button size="sm" variant="outline" disabled={!admission.ready} onClick={() => {
            if (!admission.canDispatch()) return;
            open('overtime',null,'create');
          }}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Overtime
          </Button>
        )}
      </div>

      <TimeReadFeedback read={recordRead} />
      {recordRead.restricted && <p role="alert">Overtime records are not available with your current access.</p>}
      {(
        <div className="border rounded-md divide-y">
          <RecordCollection presentation="embedded" id="hr.employee-time-tab.OvertimeSection.records" rows={records} serverRead={recordRead.serverRead} fields={[{"id":"overtime_date","path":"overtime_date","label":"Overtime Date"},{"id":"approval_status","path":"approval_status","label":"Approval Status"}]} renderRecord={(row) => {
            const badge = getOvertimeApprovalStatusBadge(row.approval_status);
            return (
              <div key={row.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                <span className="w-24 text-muted-foreground shrink-0">{fmtDate(row.overtime_date)}</span>
                <span className="font-medium shrink-0">{formatHours(row.hours)}</span>
                <span className="text-xs text-muted-foreground truncate flex-1">{row.reason ?? ""}</span>
                <Badge variant={badge.variant} className="text-xs">{badge.label}</Badge>
                {canManage && recordRead.access.canManage && (
                  <div className="flex gap-1 shrink-0">
                    {row.approval_status === "pending" && (
                      <>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => handleApprove(row.id)} disabled={isPending || !admission.ready}>
                          <CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive" disabled={!admission.ready} onClick={() => void openRecord(row.id, true)}>
                          <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                        </Button>
                        <Button aria-label="Edit record" size="sm" variant="ghost" className="h-7 px-2" disabled={!admission.ready} onClick={() => void openRecord(row.id)}>
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    <Button aria-label="Archive record" size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => handleArchive(row.id)} disabled={isPending || !admission.ready}>
                      <Archive className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            );
          }} />
        </div>
      )}

      </section></QueryReadBoundary>{target&&<TimeRecordEditor target={target}employeeId={employeeId}authContext={authContext}canDispatch={()=>admission.canDispatch()&&(target.id===null||recordRead.isDetailCurrent(target.id))}blocked={!admission.ready}retry={admission.retry}onClose={()=>{recordRead.closeDetail();setTarget(null);onChildOpen?.(false);}}onDenied={onSubjectDenied}onSaved={()=>{invalidateHrEmployeeTime(qc,employeeId);toast.success('Time change saved');afterSave();}}/>}</>);}
