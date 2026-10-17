"use client";
import { useGuardedTransition as useTransition } from "@/hooks/use-guarded-transition";
import { RecordCollection } from "@/components/erp/table/record-collection";
import { QueryReadBoundary } from "@/components/erp/query-read-boundary";

/**
 * ERP HR.4 — Employee Time Tab
 *
 * 4 sections:
 *   1. Attendance (daily summaries + raw punches + corrections)
 *   2. Shift & Calendar (shift assignments)
 *   3. Leave Requests & Balances
 *   4. Overtime
 */

import { ERPCombobox } from "@/components/erp/combobox";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { calculateLeaveDays, formatHours, getCurrentLeaveYear } from "@/lib/hr/time/date-utils";
import {
  getAttendanceStatusBadge,
  getAttendanceTypeLabel,
  getLeaveApprovalStatusBadge,
  getOvertimeApprovalStatusBadge,
  getPunchSourceLabel,
  getPunchTypeLabel,
} from "@/lib/hr/time/status";
import { queryKeys } from "@/lib/query/query-keys";
import { invalidateHrEmployeeTime } from "@/lib/query/invalidation";
import type { AuthContext } from "@/lib/rbac/check";
import {useHrTimeRecords} from "@/hooks/use-hr-time-records";
import {timeRecordsReadIdentity, type TimeRecordDetailMap} from "@/lib/reads/hr-time-records-schema";
import {TimeReadPause, useTimeReadAdmission, useTimeDialogLifetime, useTimeChildOpen} from "../time/time-read-admission";
import {getWorkCalendarComboboxOptions,listActiveLeaveTypesForForm,listWorkShiftsForTimeTab} from "@/lib/reads/hr-time-choice-client";
import {useRecordReadActive} from "@/hooks/use-record-read-active";
import {
  approveAttendanceDailySummary,
  approveLeaveRequest,
  approveOvertimeRecord,
  archiveEmployeeShiftAssignment,
  archiveOvertimeRecord,
  cancelLeaveRequest,
  correctAttendanceDailySummary,
  createEmployeeAttendancePunch,
  createEmployeeShiftAssignment,
  createLeaveRequest,
  createOrUpdateAttendanceDailySummary,
  createOrUpdateLeaveBalance,
  createOvertimeRecord,
  queryAttendanceDailySummary,
  rejectLeaveRequest,
  rejectOvertimeRecord,
  updateEmployeeShiftAssignment,
  updateOvertimeRecord,
} from "@/server/actions/hr/time";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
    <div className="space-y-6 p-6">
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

function AttendanceSection({
  authContext, onSubjectDenied,
  employeeId,
  canManage,
  onChildOpen,
}: {
  authContext: AuthContext; onSubjectDenied: () => void;
  employeeId: number;
  canManage: boolean;
  onChildOpen?: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [showPunches, setShowPunches] = useState(false);
  const [queryDialog, setQueryDialog] = useState<number | null>(null), [queryReason, setQueryReason] = useState("");
  const [showCorrections, setShowCorrections] = useState<number | null>(null);

  // Add/Edit Summary dialog
  const [summaryDialog, setSummaryDialog] = useState(false);
  const [editSummary, setEditSummary] = useState<TimeRecordDetailMap["daily"] | null>(null);
  const [summaryForm, setSummaryForm] = useState({
    attendance_date: new Date().toISOString().slice(0, 10),
    attendance_type: "site" as const,
    total_hours: "",
    overtime_hours: "0",
    late_minutes: "0",
    early_out_minutes: "0",
    is_missing_punch: false,
    notes: "",
  });

  // Add Punch dialog
  const [punchDialog, setPunchDialog] = useState(false);
  const [punchForm, setPunchForm] = useState({
    punch_datetime: new Date().toISOString().slice(0, 16),
    punch_type: "in" as const,
    punch_source: "manual" as const,
    notes: "",
  });

  // Correct dialog
  const [correctDialog, setCorrectDialog] = useState<number | null>(null);
  const [correctForm, setCorrectForm] = useState({ correction_reason: "", notes: "" });

  const openDialog = useCallback((open: boolean, setter: (v: boolean) => void) => {
    setter(open);
    onChildOpen?.(open);
  }, [onChildOpen]);

  const dailyRead = useHrTimeRecords("daily", employeeId, authContext, onSubjectDenied);
  const punchRead = useHrTimeRecords("punches", employeeId, authContext, onSubjectDenied, {enabled: showPunches});
  const correctionRead = useHrTimeRecords("corrections", employeeId, authContext, onSubjectDenied, {enabled: showCorrections !== null, summaryId: showCorrections ?? undefined});
  const reads = [...dailyRead.reads, ...punchRead.reads, ...correctionRead.reads];
  const admission = useTimeReadAdmission(canManage && dailyRead.access.canManage && (!showPunches || punchRead.access.canManage), reads, dailyRead.owner);
  const summaryCurrent = useTimeDialogLifetime(`${dailyRead.owner}:summary:${editSummary?.id ?? "new"}`, summaryDialog);
  const punchCurrent = useTimeDialogLifetime(`${dailyRead.owner}:punch`, punchDialog);
  const correctionCurrent = useTimeDialogLifetime(`${dailyRead.owner}:correct:${correctDialog}`, correctDialog !== null);
  const queryCurrent = useTimeDialogLifetime(`${dailyRead.owner}:query:${queryDialog}`, queryDialog !== null);
  useTimeChildOpen(summaryDialog || punchDialog || correctDialog !== null || queryDialog !== null, onChildOpen);
  if ((dailyRead.detailUnavailable || dailyRead.restricted) && (summaryDialog || correctDialog !== null || queryDialog !== null)) {
    dailyRead.closeDetail(); setSummaryDialog(false); setEditSummary(null); setCorrectDialog(null); setQueryDialog(null);
    setSummaryForm({attendance_date: "", attendance_type: "site", total_hours: "", overtime_hours: "0", late_minutes: "0", early_out_minutes: "0", is_missing_punch: false, notes: ""});
    setCorrectForm({correction_reason: "", notes: ""}); setQueryReason("");
  }
  if ((dailyRead.restricted || punchRead.restricted) && punchDialog) {
    setPunchDialog(false); setPunchForm({punch_datetime: "", punch_type: "in", punch_source: "manual", notes: ""});
  }

  function resetSummaryForm(row?: TimeRecordDetailMap["daily"]) {
    setSummaryForm({
      attendance_date: row?.attendance_date ?? new Date().toISOString().slice(0, 10),
      attendance_type: (row?.attendance_type as "site") ?? "site",
      total_hours: row?.total_hours != null ? String(row.total_hours) : "",
      overtime_hours: String(row?.overtime_hours ?? 0),
      late_minutes: String(row?.late_minutes ?? 0),
      early_out_minutes: String(row?.early_out_minutes ?? 0),
      is_missing_punch: row?.is_missing_punch ?? false,
      notes: row?.notes ?? "",
    });
  }

  function handleApprove(id: number) {
    startTransition(async () => {
      if (!admission.canDispatch() || !dailyRead.isRowCurrent(id, ["pending"])) return;
      const r = await approveAttendanceDailySummary(id);
      if (r.success) {
        qc.invalidateQueries({ queryKey: queryKeys.hr.time.attendanceSummary(employeeId) });
        invalidateHrEmployeeTime(qc, employeeId);
      }
      if (!admission.isCurrent()) return;
      if (r.success) {
        toast.success("Attendance approved");
        void dailyRead.refresh();
      } else toast.error(r.error ?? "Failed to approve");
    });
  }

  async function handleQuery(id: number) {
    if (!admission.canDispatch()) return;
    const row = await dailyRead.loadDetail(id);
    if (!row || row.approval_status !== "pending" || !admission.isCurrent()) return;
    setQueryReason(""); setQueryDialog(id); onChildOpen?.(true);
  }
  function submitQuery() {
    startTransition(async () => {
      if (!queryCurrent() || queryDialog === null || !queryReason.trim() || !admission.canDispatch() || !dailyRead.isDetailCurrent(queryDialog, ["pending"])) return;
      const r = await queryAttendanceDailySummary(queryDialog, queryReason.trim());
      if (r.success) {
        qc.invalidateQueries({ queryKey: queryKeys.hr.time.attendanceSummary(employeeId) });
        invalidateHrEmployeeTime(qc, employeeId);
      }
      if (!admission.isCurrent()) return;
      if (r.success) {
        if (queryCurrent()) {dailyRead.closeDetail(); setQueryDialog(null); onChildOpen?.(false);}
        toast.success("Attendance queried");
        void dailyRead.refresh();
      } else toast.error(r.error ?? "Failed to query");
    });
  }

  function handleSummarySubmit() {
    startTransition(async () => {
      if (!admission.canDispatch() || !summaryCurrent() || editSummary && !dailyRead.isDetailCurrent(editSummary.id)) return;
      const r = await createOrUpdateAttendanceDailySummary(employeeId, {
        attendance_date: summaryForm.attendance_date,
        attendance_type: summaryForm.attendance_type,
        total_hours: summaryForm.total_hours ? parseFloat(summaryForm.total_hours) : null,
        overtime_hours: parseFloat(summaryForm.overtime_hours) || 0,
        late_minutes: parseInt(summaryForm.late_minutes) || 0,
        early_out_minutes: parseInt(summaryForm.early_out_minutes) || 0,
        is_missing_punch: summaryForm.is_missing_punch,
        notes: summaryForm.notes || null,
      });
      if (r.success) {
        qc.invalidateQueries({ queryKey: queryKeys.hr.time.attendanceSummary(employeeId) });
        invalidateHrEmployeeTime(qc, employeeId);
      }
      if (!admission.isCurrent()) return;
      if (r.success) {
        toast.success(editSummary ? "Attendance updated" : "Attendance recorded");
        if (summaryCurrent()) {openDialog(false, setSummaryDialog); setEditSummary(null); dailyRead.closeDetail();}
        void dailyRead.refresh();
      } else toast.error(r.error ?? "Failed to save");
    });
  }

  function handlePunchSubmit() {
    startTransition(async () => {
      if (!admission.canDispatch() || !punchCurrent()) return;
      const r = await createEmployeeAttendancePunch(employeeId, {
        punch_datetime: new Date(punchForm.punch_datetime).toISOString(),
        punch_type: punchForm.punch_type,
        punch_source: punchForm.punch_source,
        notes: punchForm.notes || null,
      });
      if (r.success) {
        qc.invalidateQueries({ queryKey: queryKeys.hr.time.attendancePunches(employeeId) });
        invalidateHrEmployeeTime(qc, employeeId);
      }
      if (!admission.isCurrent()) return;
      if (r.success) {
        toast.success("Punch recorded");
        if (punchCurrent()) openDialog(false, setPunchDialog);
        void punchRead.refresh();
      } else toast.error(r.error ?? "Failed to record punch");
    });
  }

  function handleCorrectSubmit(summaryId: number) {
    if (!correctForm.correction_reason.trim()) {
      toast.error("Correction reason is required");
      return;
    }
    startTransition(async () => {
      if (!admission.canDispatch() || !correctionCurrent() || correctDialog !== summaryId || !dailyRead.isDetailCurrent(summaryId)) return;
      const r = await correctAttendanceDailySummary(summaryId, {
        correction_reason: correctForm.correction_reason,
        notes: correctForm.notes || null,
      });
      if (r.success) {
        qc.invalidateQueries({ queryKey: queryKeys.hr.time.attendanceSummary(employeeId) });
        qc.invalidateQueries({ queryKey: queryKeys.hr.time.attendanceCorrections(summaryId) });
        invalidateHrEmployeeTime(qc, employeeId);
      }
      if (!admission.isCurrent()) return;
      if (r.success) {
        toast.success("Correction recorded");
        if (correctionCurrent()) {setCorrectDialog(null); dailyRead.closeDetail(); onChildOpen?.(false);}
        void dailyRead.refresh(); void correctionRead.refresh();
      } else toast.error(r.error ?? "Failed to record correction");
    });
  }

  const summaries = dailyRead.rows, punches = punchRead.rows, corrections = correctionRead.rows;
  async function openSummary(id: number) {
    if (!admission.canDispatch()) return;
    const row = await dailyRead.loadDetail(id);
    if (!row || !admission.isCurrent()) return;
    resetSummaryForm(row); setEditSummary(row); openDialog(true, setSummaryDialog);
  }
  async function openCorrection(id: number) {
    if (!admission.canDispatch()) return;
    const row = await dailyRead.loadDetail(id);
    if (!row || !admission.isCurrent()) return;
    setCorrectForm({correction_reason: "", notes: ""}); setCorrectDialog(id); onChildOpen?.(true);
  }

  return (
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
              setPunchForm({ punch_datetime: new Date().toISOString().slice(0, 16), punch_type: "in", punch_source: "manual", notes: "" });
              openDialog(true, setPunchDialog);
            }}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Punch
            </Button>
            <Button size="sm" variant="outline" disabled={!admission.ready} onClick={() => {
              if (!admission.canDispatch()) return;
              dailyRead.closeDetail();
              resetSummaryForm();
              setEditSummary(null);
              openDialog(true, setSummaryDialog);
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

      {/* Add/Edit Summary Dialog */}
      <ERPChildDialogForm
        open={summaryDialog}
        onOpenChange={(open) => {if (!open) dailyRead.closeDetail(); openDialog(open, setSummaryDialog);}}
        title={editSummary ? "Edit Daily Attendance" : "Add Daily Attendance"}
        subtitle="Record approved daily attendance summary"
        icon={<Clock className="h-5 w-5" />}
        mode={editSummary ? "edit" : "add"}
        size="md"
        isSubmitting={isPending}
        onSubmit={handleSummarySubmit}
        submitDisabled={!admission.ready}
      >
        <TimeReadPause admission={admission} />
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-6">
            <Label>Date <span className="text-destructive">*</span></Label>
            <Input aria-label="Date" required type="date" value={summaryForm.attendance_date} onChange={(e) => setSummaryForm(f => ({ ...f, attendance_date: e.target.value }))} />
          </div>
          <div className="col-span-6">
            <Label>Attendance Type <span className="text-destructive">*</span></Label>
            <ERPCombobox ariaLabel="Attendance Type" required
              value={summaryForm.attendance_type}
              onValueChange={(v) => setSummaryForm(f => ({ ...f, attendance_type: v as typeof f.attendance_type }))}
              options={[
                { value: "site", label: "Site" },
                { value: "office", label: "Office" },
                { value: "yard", label: "Yard" },
                { value: "workshop", label: "Workshop" },
                { value: "remote", label: "Remote" },
                { value: "on_leave", label: "On Leave" },
                { value: "absent", label: "Absent" },
                { value: "holiday", label: "Holiday" },
              ]}
              placeholder="Select type..."
            />
          </div>
          <div className="col-span-4">
            <Label>Total Hours</Label>
            <Input aria-label="Total Hours" type="number" step="0.25" min="0" max="24" value={summaryForm.total_hours} onChange={(e) => setSummaryForm(f => ({ ...f, total_hours: e.target.value }))} placeholder="0.00" />
          </div>
          <div className="col-span-4">
            <Label>Overtime Hours</Label>
            <Input aria-label="Overtime Hours" type="number" step="0.25" min="0" max="24" value={summaryForm.overtime_hours} onChange={(e) => setSummaryForm(f => ({ ...f, overtime_hours: e.target.value }))} />
          </div>
          <div className="col-span-4">
            <Label>Late (min)</Label>
            <Input aria-label="Late (min)" type="number" min="0" value={summaryForm.late_minutes} onChange={(e) => setSummaryForm(f => ({ ...f, late_minutes: e.target.value }))} />
          </div>
          <div className="col-span-6 flex items-center gap-2 mt-1">
            <Switch checked={summaryForm.is_missing_punch} onCheckedChange={(v) => setSummaryForm(f => ({ ...f, is_missing_punch: v }))} id="missing-punch" />
            <Label htmlFor="missing-punch">Missing Punch</Label>
          </div>
          <div className="col-span-12">
            <Label>Notes</Label>
            <Textarea aria-label="Notes" value={summaryForm.notes} onChange={(e) => setSummaryForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
        </div>
      </ERPChildDialogForm>

      {/* Add Punch Dialog */}
      <ERPChildDialogForm
        open={punchDialog}
        onOpenChange={(open) => openDialog(open, setPunchDialog)}
        title="Add Attendance Punch"
        subtitle="Record a manual punch entry"
        icon={<Clock className="h-5 w-5" />}
        mode="add"
        size="sm"
        isSubmitting={isPending}
        onSubmit={handlePunchSubmit}
        submitDisabled={!admission.ready}
      >
        <TimeReadPause admission={admission} />
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12">
            <Label>Punch Date/Time <span className="text-destructive">*</span></Label>
            <Input aria-label="Punch Date/Time" required type="datetime-local" value={punchForm.punch_datetime} onChange={(e) => setPunchForm(f => ({ ...f, punch_datetime: e.target.value }))} />
          </div>
          <div className="col-span-6">
            <Label>Punch Type <span className="text-destructive">*</span></Label>
            <ERPCombobox ariaLabel="Punch Type" required
              value={punchForm.punch_type}
              onValueChange={(v) => setPunchForm(f => ({ ...f, punch_type: v as typeof f.punch_type }))}
              options={[
                { value: "in", label: "In" },
                { value: "out", label: "Out" },
                { value: "break_start", label: "Break Start" },
                { value: "break_end", label: "Break End" },
              ]}
              placeholder="Select..."
            />
          </div>
          <div className="col-span-6">
            <Label>Source</Label>
            <ERPCombobox ariaLabel="Source"
              value={punchForm.punch_source}
              onValueChange={(v) => setPunchForm(f => ({ ...f, punch_source: v as typeof f.punch_source }))}
              options={[
                { value: "manual", label: "Manual" },
                { value: "biometric", label: "Biometric" },
                { value: "mobile", label: "Mobile" },
                { value: "import", label: "Import" },
              ]}
              placeholder="Select..."
            />
          </div>
          <div className="col-span-12">
            <Label>Notes</Label>
            <Input aria-label="Notes" value={punchForm.notes} onChange={(e) => setPunchForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
      </ERPChildDialogForm>

      {/* Correct Dialog */}
      {correctDialog != null && (
        <ERPChildDialogForm
          open={true}
          onOpenChange={(open) => {
            if (!open) {dailyRead.closeDetail(); setCorrectDialog(null); onChildOpen?.(false); }
          }}
          title="Record Attendance Correction"
          subtitle="Append-only correction audit entry"
          icon={<RefreshCw className="h-5 w-5" />}
          mode="add"
          size="sm"
          submitLabel="Record Correction"
          isSubmitting={isPending}
          onSubmit={() => handleCorrectSubmit(correctDialog)}
          submitDisabled={!admission.ready}
        >
          <TimeReadPause admission={admission} />
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12">
              <Label>Correction Reason <span className="text-destructive">*</span></Label>
              <Textarea aria-label="Correction Reason" required value={correctForm.correction_reason} onChange={(e) => setCorrectForm(f => ({ ...f, correction_reason: e.target.value }))} rows={3} placeholder="Describe the correction..." />
            </div>
            <div className="col-span-12">
              <Label>Notes</Label>
              <Input aria-label="Notes" value={correctForm.notes} onChange={(e) => setCorrectForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
        </ERPChildDialogForm>
      )}
      {queryDialog !== null && <ERPChildDialogForm open onOpenChange={open => {if (!open) {dailyRead.closeDetail(); setQueryDialog(null); onChildOpen?.(false);}}}
        title="Query attendance record" subtitle="Review the selected record before continuing." mode="add" size="md" submitLabel="Continue"
        onSubmit={submitQuery} submitDisabled={!admission.ready} isSubmitting={isPending}>
        <TimeReadPause admission={admission} /><label className="grid gap-2 text-sm">Reason *
          <Textarea aria-label="Reason" required value={queryReason} onChange={event => setQueryReason(event.target.value)} maxLength={2000} />
        </label>
      </ERPChildDialogForm>}
    </section></QueryReadBoundary>
  );
}

// ── 2. Shift & Calendar Section ────────────────────────────────────────────────

function ShiftCalendarSection({
  authContext, onSubjectDenied,
  employeeId,
  canManage,
  onChildOpen,
}: {
  authContext: AuthContext; onSubjectDenied: () => void;
  employeeId: number;
  canManage: boolean;
  onChildOpen?: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TimeRecordDetailMap["shifts"] | null>(null);
  const [form, setForm] = useState({
    work_calendar_id: "",
    work_shift_id: "",
    effective_from: new Date().toISOString().slice(0, 10),
    effective_to: "",
    overtime_eligible: false,
    attendance_required: true,
    weekly_off_day: "",
    notes: "",
  });

  const openDialog = useCallback((open: boolean) => {
    setDialogOpen(open);
    onChildOpen?.(open);
  }, [onChildOpen]);

  const recordRead = useHrTimeRecords("shifts", employeeId, authContext, onSubjectDenied);
  const sectionActive = useRecordReadActive();

  const uiRead2 = useQuery({
    queryKey: ["hr", "time-records-options", recordRead.identity, "calendars", form.work_calendar_id],
    enabled: sectionActive && canManage && recordRead.access.canManage && dialogOpen,
    queryFn: async ({signal}) => {
      const r = await getWorkCalendarComboboxOptions({selectedIds: form.work_calendar_id ? [Number(form.work_calendar_id)] : [], signal});
      if (!r.success || !Array.isArray(r.data)) throw new Error("Records or choices could not be loaded."); return r.data;
    },
    staleTime: 5 * 60 * 1000,
  });
  const { data: calendarOptions } = uiRead2;

  const uiRead3 = useQuery({
    queryKey: ["hr", "time-records-options", recordRead.identity, "shifts", form.work_calendar_id, form.work_shift_id],
    enabled: sectionActive && canManage && recordRead.access.canManage && dialogOpen,
    queryFn: async ({signal}) => {
      const calId = form.work_calendar_id ? parseInt(form.work_calendar_id) : undefined;
      const r = await listWorkShiftsForTimeTab(calId, {selectedIds: form.work_shift_id ? [Number(form.work_shift_id)] : [], signal});
      if (!r.success || !Array.isArray(r.data)) throw new Error("Records or choices could not be loaded."); return r.data.map(s => ({ value: String(s.id), label: `${s.shift_name} (${s.shift_code})` }));
    },
    staleTime: 2 * 60 * 1000,
  });
  const { data: shiftOptions } = uiRead3;
  const reads = [...recordRead.reads, ...(dialogOpen ? [uiRead2, uiRead3] : [])];
  const admission = useTimeReadAdmission(canManage && recordRead.access.canManage, reads, recordRead.owner);
  const dialogCurrent = useTimeDialogLifetime(`${recordRead.owner}:${editing?.id ?? "new"}`, dialogOpen);
  useTimeChildOpen(dialogOpen, onChildOpen);
  if ((recordRead.detailUnavailable || recordRead.restricted) && dialogOpen) {
    recordRead.closeDetail(); setDialogOpen(false); setEditing(null);
    setForm({work_calendar_id: "", work_shift_id: "", effective_from: "", effective_to: "", overtime_eligible: false, attendance_required: true, weekly_off_day: "", notes: ""});
  }

  function resetForm(row?: TimeRecordDetailMap["shifts"]) {
    setForm({
      work_calendar_id: row?.work_calendar_id ? String(row.work_calendar_id) : "",
      work_shift_id: row?.work_shift_id ? String(row.work_shift_id) : "",
      effective_from: row?.effective_from ?? new Date().toISOString().slice(0, 10),
      effective_to: row?.effective_to ?? "",
      overtime_eligible: row?.overtime_eligible ?? false,
      attendance_required: row?.attendance_required ?? true,
      weekly_off_day: row?.weekly_off_day ?? "",
      notes: row?.notes ?? "",
    });
  }

  function handleSubmit() {
    startTransition(async () => {
      if (!admission.canDispatch() || !dialogCurrent() || editing && !recordRead.isDetailCurrent(editing.id)) return;
      const payload = {
        work_calendar_id: form.work_calendar_id ? parseInt(form.work_calendar_id) : null,
        work_shift_id: form.work_shift_id ? parseInt(form.work_shift_id) : null,
        effective_from: form.effective_from,
        effective_to: form.effective_to || null,
        overtime_eligible: form.overtime_eligible,
        attendance_required: form.attendance_required,
        weekly_off_day: form.weekly_off_day || null,
        notes: form.notes || null,
      };

      const r = editing
        ? await updateEmployeeShiftAssignment(editing.id, payload)
        : await createEmployeeShiftAssignment(employeeId, payload);
      if (r.success) {
        qc.invalidateQueries({ queryKey: queryKeys.hr.time.shiftAssignments(employeeId) });
        invalidateHrEmployeeTime(qc, employeeId);
      }
      if (!admission.isCurrent()) return;
      if (r.success) {
        toast.success(editing ? "Shift assignment updated" : "Shift assignment created");
        if (dialogCurrent()) {openDialog(false); setEditing(null); recordRead.closeDetail();}
        void recordRead.refresh();
      } else toast.error(r.error ?? "Failed to save");
    });
  }

  function handleArchive(id: number) {
    if (!admission.canDispatch() || !recordRead.isRowCurrent(id)) return;
    if (!confirm("Archive this shift assignment?")) return;
    startTransition(async () => {
      if (!admission.canDispatch() || !recordRead.isRowCurrent(id)) return;
      const r = await archiveEmployeeShiftAssignment(id);
      if (r.success) {
        qc.invalidateQueries({ queryKey: queryKeys.hr.time.shiftAssignments(employeeId) });
        invalidateHrEmployeeTime(qc, employeeId);
      }
      if (!admission.isCurrent()) return;
      if (r.success) {
        toast.success("Shift assignment archived");
        void recordRead.refresh();
      } else toast.error(r.error ?? "Failed to archive");
    });
  }

  const assignments = recordRead.rows;
  async function openEdit(id: number) {
    if (!admission.canDispatch()) return;
    const row = await recordRead.loadDetail(id);
    if (!row || !admission.isCurrent()) return;
    resetForm(row); setEditing(row); openDialog(true);
  }

  return (
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
            resetForm();
            setEditing(null);
            openDialog(true);
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

      <ERPChildDialogForm
        open={dialogOpen}
        onOpenChange={open => {if (!open) recordRead.closeDetail(); openDialog(open);}}
        title={editing ? "Edit Shift Assignment" : "Add Shift Assignment"}
        subtitle="Assign employee to work calendar and shift"
        icon={<Calendar className="h-5 w-5" />}
        mode={editing ? "edit" : "add"}
        size="md"
        isSubmitting={isPending}
        onSubmit={handleSubmit}
        submitDisabled={!admission.ready}
      >
        <TimeReadPause admission={admission} />
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-6">
            <Label>Work Calendar</Label>
            <ERPCombobox ariaLabel="Work Calendar"
              value={form.work_calendar_id}
              onValueChange={(v) => setForm(f => ({ ...f, work_calendar_id: String(v ?? ""), work_shift_id: "" }))}
              options={calendarOptions ?? []}
              placeholder="Select calendar..."
            />
          </div>
          <div className="col-span-6">
            <Label>Work Shift</Label>
            <ERPCombobox ariaLabel="Work Shift"
              value={form.work_shift_id}
              onValueChange={(v) => setForm(f => ({ ...f, work_shift_id: String(v ?? "") }))}
              options={shiftOptions ?? []}
              placeholder={form.work_calendar_id ? "Select shift..." : "Select calendar first..."}
            />
          </div>
          <div className="col-span-6">
            <Label>Effective From <span className="text-destructive">*</span></Label>
            <Input aria-label="Effective From" required type="date" value={form.effective_from} onChange={(e) => setForm(f => ({ ...f, effective_from: e.target.value }))} />
          </div>
          <div className="col-span-6">
            <Label>Effective To</Label>
            <Input aria-label="Effective To" type="date" value={form.effective_to} onChange={(e) => setForm(f => ({ ...f, effective_to: e.target.value }))} />
          </div>
          <div className="col-span-6 flex items-center gap-2 mt-1">
            <Switch checked={form.overtime_eligible} onCheckedChange={(v) => setForm(f => ({ ...f, overtime_eligible: v }))} id="ot-eligible" />
            <Label htmlFor="ot-eligible">Overtime Eligible</Label>
          </div>
          <div className="col-span-6 flex items-center gap-2 mt-1">
            <Switch checked={form.attendance_required} onCheckedChange={(v) => setForm(f => ({ ...f, attendance_required: v }))} id="att-req" />
            <Label htmlFor="att-req">Attendance Required</Label>
          </div>
          <div className="col-span-12">
            <Label>Notes</Label>
            <Textarea aria-label="Notes" value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
        </div>
      </ERPChildDialogForm>
    </section></QueryReadBoundary>
  );
}

// ── 3. Leave Section ───────────────────────────────────────────────────────────

function LeaveSection({
  authContext, onSubjectDenied,
  employeeId,
  canManage,
  onChildOpen,
}: {
  authContext: AuthContext; onSubjectDenied: () => void;
  employeeId: number;
  canManage: boolean;
  onChildOpen?: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [balanceDialogOpen, setBalanceDialogOpen] = useState(false);
  const [decisionDialog, setDecisionDialog] = useState<{ id: number; action: "reject" | "cancel" } | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const currentYear = getCurrentLeaveYear();
  const [form, setForm] = useState({
    leave_type_id: "",
    start_date: new Date().toISOString().slice(0, 10),
    end_date: new Date().toISOString().slice(0, 10),
    reason: "",
    notes: "",
  });
  const [balForm, setBalForm] = useState({
    leave_type_id: "",
    leave_year: String(currentYear),
    entitled_days: "",
    used_days: "0",
    carry_forward: "0",
  });

  const openDialog = useCallback((open: boolean, setter: (v: boolean) => void) => {
    setter(open);
    onChildOpen?.(open);
  }, [onChildOpen]);

  const leaveRead = useHrTimeRecords("leave", employeeId, authContext, onSubjectDenied);
  const sectionActive = useRecordReadActive();
  const balanceRead = useHrTimeRecords("balances", employeeId, authContext, onSubjectDenied, {year: currentYear});
  const uiRead3 = useQuery({
    queryKey: ["hr", "time-records-options", timeRecordsReadIdentity(authContext), "leave-types", form.leave_type_id, balForm.leave_type_id],
    queryFn: async ({signal}) => {
      const r = await listActiveLeaveTypesForForm({selectedIds: [...new Set([form.leave_type_id,balForm.leave_type_id].filter(Boolean).map(Number))], signal});
      if (!r.success || !Array.isArray(r.data?.data)) throw new Error("Records or choices could not be loaded.");
      return r.data.data.map((lt) => ({ value: String(lt.id), label: lt.name_en }));
    },
    enabled: sectionActive && canManage && (dialogOpen || balanceDialogOpen),
  });
  const { data: leaveTypeOptions } = uiRead3;
  const reads = [...leaveRead.reads, ...balanceRead.reads, ...(dialogOpen || balanceDialogOpen ? [uiRead3] : [])];
  const admission = useTimeReadAdmission(canManage && leaveRead.access.canManage && balanceRead.access.canManage, reads, leaveRead.owner);
  const leaveCurrent = useTimeDialogLifetime(`${leaveRead.owner}:create`, dialogOpen);
  const balanceCurrent = useTimeDialogLifetime(`${balanceRead.owner}:balance`, balanceDialogOpen);
  const decisionCurrent = useTimeDialogLifetime(`${leaveRead.owner}:decision:${decisionDialog?.id}:${decisionDialog?.action}`, decisionDialog !== null);
  useTimeChildOpen(dialogOpen || balanceDialogOpen || decisionDialog !== null, onChildOpen);
  if ((leaveRead.detailUnavailable || leaveRead.restricted) && decisionDialog !== null) {
    leaveRead.closeDetail(); setDecisionDialog(null); setDecisionReason("");
  }
  if ((leaveRead.restricted || balanceRead.restricted) && (dialogOpen || balanceDialogOpen)) {
    setDialogOpen(false); setBalanceDialogOpen(false);
    setForm({leave_type_id: "", start_date: "", end_date: "", reason: "", notes: ""});
    setBalForm({leave_type_id: "", leave_year: "", entitled_days: "", used_days: "", carry_forward: ""});
  }

  const totalDays = form.start_date && form.end_date ? calculateLeaveDays(form.start_date, form.end_date) : 0;

  function handleLeaveSubmit() {
    startTransition(async () => {
      if (!admission.canDispatch() || !leaveCurrent()) return;
      const r = await createLeaveRequest(employeeId, {
        leave_type_id: parseInt(form.leave_type_id),
        start_date: form.start_date,
        end_date: form.end_date,
        reason: form.reason || null,
        notes: form.notes || null,
      });
      if (r.success) {
        qc.invalidateQueries({ queryKey: queryKeys.hr.time.leaveRequests(employeeId) });
        invalidateHrEmployeeTime(qc, employeeId);
      }
      if (!admission.isCurrent()) return;
      if (r.success) {
        toast.success("Leave request created");
        if (leaveCurrent()) openDialog(false, setDialogOpen);
        void leaveRead.refresh();
      } else toast.error(r.error ?? "Failed to create leave request");
    });
  }

  function handleApprove(id: number) {
    startTransition(async () => {
      if (!admission.canDispatch() || !leaveRead.isRowCurrent(id, ["pending"])) return;
      const r = await approveLeaveRequest(id);
      if (r.success) {
        qc.invalidateQueries({ queryKey: queryKeys.hr.time.leaveRequests(employeeId) });
        qc.invalidateQueries({ queryKey: queryKeys.hr.time.leaveBalances(employeeId) });
        invalidateHrEmployeeTime(qc, employeeId);
      }
      if (!admission.isCurrent()) return;
      if (r.success) {
        toast.success("Leave approved");
        void leaveRead.refresh(); void balanceRead.refresh();
      } else toast.error(r.error ?? "Failed to approve");
    });
  }

  function handleDecisionSubmit() {
    if (!decisionDialog) return;
    startTransition(async () => {
      if (!admission.canDispatch() || !decisionCurrent() || !leaveRead.isDetailCurrent(decisionDialog.id, decisionDialog.action === "reject" ? ["pending"] : ["pending", "approved"])) return;
      const r = decisionDialog.action === "reject"
        ? await rejectLeaveRequest(decisionDialog.id, decisionReason)
        : await cancelLeaveRequest(decisionDialog.id, decisionReason);
      if (r.success) {
        qc.invalidateQueries({ queryKey: queryKeys.hr.time.leaveRequests(employeeId) });
        invalidateHrEmployeeTime(qc, employeeId);
      }
      if (!admission.isCurrent()) return;
      if (r.success) {
        toast.success(decisionDialog.action === "reject" ? "Leave rejected" : "Leave cancelled");
        void leaveRead.refresh(); void balanceRead.refresh();
        if (decisionCurrent()) {leaveRead.closeDetail(); setDecisionDialog(null); onChildOpen?.(false);}
      } else toast.error(r.error ?? "Failed");
    });
  }

  function handleBalanceSubmit() {
    startTransition(async () => {
      if (!admission.canDispatch() || !balanceCurrent()) return;
      const r = await createOrUpdateLeaveBalance(employeeId, {
        leave_type_id: parseInt(balForm.leave_type_id),
        leave_year: parseInt(balForm.leave_year),
        entitled_days: parseFloat(balForm.entitled_days) || 0,
        used_days: parseFloat(balForm.used_days) || 0,
        carry_forward: parseFloat(balForm.carry_forward) || 0,
      });
      if (r.success) {
        qc.invalidateQueries({ queryKey: queryKeys.hr.time.leaveBalances(employeeId) });
        invalidateHrEmployeeTime(qc, employeeId);
      }
      if (!admission.isCurrent()) return;
      if (r.success) {
        toast.success("Leave balance updated");
        void balanceRead.refresh();
        if (balanceCurrent()) openDialog(false, setBalanceDialogOpen);
      } else toast.error(r.error ?? "Failed to update balance");
    });
  }

  const leaves = leaveRead.rows, balances = balanceRead.rows;
  async function openDecision(id: number, action: "reject" | "cancel") {
    if (!admission.canDispatch()) return;
    const row = await leaveRead.loadDetail(id);
    if (!row || !admission.isCurrent() || !(action === "reject" ? ["pending"] : ["pending", "approved"]).includes(row.approval_status)) return;
    setDecisionReason(""); setDecisionDialog({id, action}); onChildOpen?.(true);
  }

  return (
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
              setBalForm({ leave_type_id: "", leave_year: String(currentYear), entitled_days: "", used_days: "0", carry_forward: "0" });
              openDialog(true, setBalanceDialogOpen);
            }}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Update Balance
            </Button>
            <Button size="sm" variant="outline" disabled={!admission.ready} onClick={() => {
              if (!admission.canDispatch()) return;
              setForm({ leave_type_id: "", start_date: new Date().toISOString().slice(0, 10), end_date: new Date().toISOString().slice(0, 10), reason: "", notes: "" });
              openDialog(true, setDialogOpen);
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
              <p className="text-lg font-bold mt-1">{b.balance_days ?? "—"}<span className="text-xs font-normal text-muted-foreground ml-1">days</span></p>
              <p className="text-muted-foreground">{b.used_days}/{b.entitled_days} used</p>
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

      {/* Create Leave Request Dialog */}
      <ERPChildDialogForm
        open={dialogOpen}
        onOpenChange={(open) => openDialog(open, setDialogOpen)}
        title="Create Leave Request"
        subtitle="Submit a new leave request"
        icon={<Plane className="h-5 w-5" />}
        mode="add"
        size="md"
        isSubmitting={isPending}
        onSubmit={handleLeaveSubmit}
        submitDisabled={!admission.ready}
      >
        <TimeReadPause admission={admission} />
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12">
            <Label>Leave Type <span className="text-destructive">*</span></Label>
            <ERPCombobox ariaLabel="Leave Type" required
              value={form.leave_type_id}
              onValueChange={(v) => setForm(f => ({ ...f, leave_type_id: String(v ?? "") }))}
              options={leaveTypeOptions ?? []}
              placeholder="Select leave type..."
            />
          </div>
          <div className="col-span-6">
            <Label>Start Date <span className="text-destructive">*</span></Label>
            <Input aria-label="Start Date" required type="date" value={form.start_date} onChange={(e) => setForm(f => ({ ...f, start_date: e.target.value }))} />
          </div>
          <div className="col-span-6">
            <Label>End Date <span className="text-destructive">*</span></Label>
            <Input aria-label="End Date" required type="date" value={form.end_date} onChange={(e) => setForm(f => ({ ...f, end_date: e.target.value }))} />
          </div>
          <div className="col-span-12 text-xs text-muted-foreground">
            Duration: <span className="font-medium text-foreground">{totalDays} day(s)</span>
          </div>
          <div className="col-span-12">
            <Label>Reason</Label>
            <Textarea aria-label="Reason" value={form.reason} onChange={(e) => setForm(f => ({ ...f, reason: e.target.value }))} rows={2} />
          </div>
        </div>
      </ERPChildDialogForm>

      {/* Balance Update Dialog */}
      <ERPChildDialogForm
        open={balanceDialogOpen}
        onOpenChange={(open) => openDialog(open, setBalanceDialogOpen)}
        title="Update Leave Balance"
        subtitle="Set entitlement, used days, and carry forward"
        icon={<Plane className="h-5 w-5" />}
        mode="edit"
        size="sm"
        isSubmitting={isPending}
        onSubmit={handleBalanceSubmit}
        submitDisabled={!admission.ready}
      >
        <TimeReadPause admission={admission} />
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12">
            <Label>Leave Type <span className="text-destructive">*</span></Label>
            <ERPCombobox ariaLabel="Leave Type" required
              value={balForm.leave_type_id}
              onValueChange={(v) => setBalForm(f => ({ ...f, leave_type_id: String(v ?? "") }))}
              options={leaveTypeOptions ?? []}
              placeholder="Select leave type..."
            />
          </div>
          <div className="col-span-6">
            <Label>Year <span className="text-destructive">*</span></Label>
            <Input aria-label="Year" required type="number" value={balForm.leave_year} onChange={(e) => setBalForm(f => ({ ...f, leave_year: e.target.value }))} min={2020} max={2100} />
          </div>
          <div className="col-span-6">
            <Label>Entitled Days <span className="text-destructive">*</span></Label>
            <Input aria-label="Entitled Days" required type="number" step="0.5" min="0" value={balForm.entitled_days} onChange={(e) => setBalForm(f => ({ ...f, entitled_days: e.target.value }))} />
          </div>
          <div className="col-span-6">
            <Label>Used Days</Label>
            <Input aria-label="Used Days" type="number" step="0.5" min="0" value={balForm.used_days} onChange={(e) => setBalForm(f => ({ ...f, used_days: e.target.value }))} />
          </div>
          <div className="col-span-6">
            <Label>Carry Forward</Label>
            <Input aria-label="Carry Forward" type="number" step="0.5" min="0" value={balForm.carry_forward} onChange={(e) => setBalForm(f => ({ ...f, carry_forward: e.target.value }))} />
          </div>
        </div>
      </ERPChildDialogForm>

      {/* Reject / Cancel Dialog */}
      {decisionDialog != null && (
        <ERPChildDialogForm
          open={true}
          onOpenChange={(open) => {
            if (!open) { leaveRead.closeDetail(); setDecisionDialog(null); onChildOpen?.(false); }
          }}
          title={decisionDialog.action === "reject" ? "Reject Leave Request" : "Cancel Leave Request"}
          subtitle="Provide a reason for this action"
          icon={decisionDialog.action === "reject" ? <XCircle className="h-5 w-5" /> : <Ban className="h-5 w-5" />}
          mode="edit"
          size="sm"
          submitLabel={decisionDialog.action === "reject" ? "Reject" : "Cancel Leave"}
          isSubmitting={isPending}
          onSubmit={handleDecisionSubmit}
          submitDisabled={!admission.ready}
        >
          <TimeReadPause admission={admission} />
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12">
              <Label>Reason</Label>
              <Textarea aria-label="Reason" value={decisionReason} onChange={(e) => setDecisionReason(e.target.value)} rows={3} placeholder="Optional reason..." />
            </div>
          </div>
        </ERPChildDialogForm>
      )}
    </section></QueryReadBoundary>
  );
}

// ── 4. Overtime Section ────────────────────────────────────────────────────────

function OvertimeSection({
  authContext, onSubjectDenied,
  employeeId,
  canManage,
  onChildOpen,
}: {
  authContext: AuthContext; onSubjectDenied: () => void;
  employeeId: number;
  canManage: boolean;
  onChildOpen?: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TimeRecordDetailMap["overtime"] | null>(null);
  const [decisionDialog, setDecisionDialog] = useState<{ id: number; action: "reject" } | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const [form, setForm] = useState({
    overtime_date: new Date().toISOString().slice(0, 10),
    hours: "",
    reason: "",
    notes: "",
  });

  const openDialog = useCallback((open: boolean) => {
    setDialogOpen(open);
    onChildOpen?.(open);
  }, [onChildOpen]);

  const recordRead = useHrTimeRecords("overtime", employeeId, authContext, onSubjectDenied);
  const admission = useTimeReadAdmission(canManage && recordRead.access.canManage, recordRead.reads, recordRead.owner);
  const dialogCurrent = useTimeDialogLifetime(`${recordRead.owner}:edit:${editing?.id ?? "new"}`, dialogOpen);
  const decisionCurrent = useTimeDialogLifetime(`${recordRead.owner}:reject:${decisionDialog?.id}`, decisionDialog !== null);
  useTimeChildOpen(dialogOpen || decisionDialog !== null, onChildOpen);
  if ((recordRead.detailUnavailable || recordRead.restricted) && (dialogOpen || decisionDialog !== null)) {
    recordRead.closeDetail(); setDialogOpen(false); setEditing(null); setDecisionDialog(null); setDecisionReason("");
    setForm({overtime_date: "", hours: "", reason: "", notes: ""});
  }
  async function openRecord(id: number, reject = false) {
    if (!admission.canDispatch()) return;
    const row = await recordRead.loadDetail(id);
    if (!row || !admission.isCurrent() || row.approval_status !== "pending") return;
    if (reject) {setDecisionReason(""); setDecisionDialog({id, action: "reject"}); onChildOpen?.(true);}
    else {resetForm(row); setEditing(row); openDialog(true);}
  }
  function resetForm(row?: TimeRecordDetailMap["overtime"]) {
    setForm({
      overtime_date: row?.overtime_date ?? new Date().toISOString().slice(0, 10),
      hours: row?.hours != null ? String(row.hours) : "",
      reason: row?.reason ?? "",
      notes: row?.notes ?? "",
    });
  }

  function handleSubmit() {
    startTransition(async () => {
      if (!admission.canDispatch() || !dialogCurrent() || editing && !recordRead.isDetailCurrent(editing.id, ["pending"])) return;
      const payload = {
        overtime_date: form.overtime_date,
        hours: parseFloat(form.hours) || 0,
        reason: form.reason || null,
        notes: form.notes || null,
      };

      const r = editing
        ? await updateOvertimeRecord(editing.id, payload)
        : await createOvertimeRecord(employeeId, payload);
      if (r.success) {
        qc.invalidateQueries({ queryKey: queryKeys.hr.time.overtimeRecords(employeeId) });
        invalidateHrEmployeeTime(qc, employeeId);
      }
      if (!admission.isCurrent()) return;
      if (r.success) {
        toast.success(editing ? "Overtime updated" : "Overtime recorded");
        void recordRead.refresh();
        if (dialogCurrent()) {recordRead.closeDetail(); openDialog(false); setEditing(null);}
      } else toast.error(r.error ?? "Failed to save");
    });
  }

  function handleApprove(id: number) {
    startTransition(async () => {
      if (!admission.canDispatch() || !recordRead.isRowCurrent(id, ["pending"])) return;
      const r = await approveOvertimeRecord(id);
      if (r.success) {
        qc.invalidateQueries({ queryKey: queryKeys.hr.time.overtimeRecords(employeeId) });
        invalidateHrEmployeeTime(qc, employeeId);
      }
      if (!admission.isCurrent()) return;
      if (r.success) {
        toast.success("Overtime approved");
        void recordRead.refresh();
      } else toast.error(r.error ?? "Failed to approve");
    });
  }

  function handleRejectSubmit() {
    if (!decisionDialog) return;
    startTransition(async () => {
      if (!admission.canDispatch() || !decisionCurrent() || !recordRead.isDetailCurrent(decisionDialog.id, ["pending"])) return;
      const r = await rejectOvertimeRecord(decisionDialog.id, decisionReason);
      if (r.success) {
        qc.invalidateQueries({ queryKey: queryKeys.hr.time.overtimeRecords(employeeId) });
        invalidateHrEmployeeTime(qc, employeeId);
      }
      if (!admission.isCurrent()) return;
      if (r.success) {
        toast.success("Overtime rejected");
        void recordRead.refresh();
        if (decisionCurrent()) {recordRead.closeDetail(); setDecisionDialog(null); onChildOpen?.(false);}
      } else toast.error(r.error ?? "Failed to reject");
    });
  }

  function handleArchive(id: number) {
    if (!admission.canDispatch() || !recordRead.isRowCurrent(id) || !confirm("Archive this overtime record?")) return;
    startTransition(async () => {
      if (!admission.canDispatch() || !recordRead.isRowCurrent(id)) return;
      const r = await archiveOvertimeRecord(id);
      if (r.success) {
        qc.invalidateQueries({ queryKey: queryKeys.hr.time.overtimeRecords(employeeId) });
        invalidateHrEmployeeTime(qc, employeeId);
      }
      if (!admission.isCurrent()) return;
      if (r.success) {
        toast.success("Overtime archived");
        void recordRead.refresh();
      } else toast.error(r.error ?? "Failed to archive");
    });
  }

  const records = recordRead.rows;
  const totalApprovedHours = records.filter(r => r.approval_status === "approved").reduce((s, r) => s + Number(r.hours), 0);

  return (
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
            resetForm();
            setEditing(null);
            openDialog(true);
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

      <ERPChildDialogForm
        open={dialogOpen}
        onOpenChange={open => {if (!open) recordRead.closeDetail(); openDialog(open);}}
        title={editing ? "Edit Overtime" : "Add Overtime Record"}
        subtitle="Record overtime hours"
        icon={<Timer className="h-5 w-5" />}
        mode={editing ? "edit" : "add"}
        size="sm"
        isSubmitting={isPending}
        onSubmit={handleSubmit}
        submitDisabled={!admission.ready}
      >
        <TimeReadPause admission={admission} />
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-6">
            <Label>Date <span className="text-destructive">*</span></Label>
            <Input aria-label="Date" required type="date" value={form.overtime_date} onChange={(e) => setForm(f => ({ ...f, overtime_date: e.target.value }))} />
          </div>
          <div className="col-span-6">
            <Label>Hours <span className="text-destructive">*</span></Label>
            <Input aria-label="Hours" required type="number" step="0.5" min="0" max="24" value={form.hours} onChange={(e) => setForm(f => ({ ...f, hours: e.target.value }))} placeholder="0.0" />
          </div>
          <div className="col-span-12">
            <Label>Reason</Label>
            <Textarea aria-label="Reason" value={form.reason} onChange={(e) => setForm(f => ({ ...f, reason: e.target.value }))} rows={2} />
          </div>
          <div className="col-span-12">
            <Label>Notes</Label>
            <Input aria-label="Notes" value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
      </ERPChildDialogForm>

      {decisionDialog != null && (
        <ERPChildDialogForm
          open={true}
          onOpenChange={(open) => {
            if (!open) { recordRead.closeDetail(); setDecisionDialog(null); onChildOpen?.(false); }
          }}
          title="Reject Overtime Record"
          subtitle="Provide a reason for rejection"
          icon={<XCircle className="h-5 w-5" />}
          mode="edit"
          size="sm"
          submitLabel="Reject"
          isSubmitting={isPending}
          onSubmit={handleRejectSubmit}
          submitDisabled={!admission.ready}
        >
          <TimeReadPause admission={admission} />
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12">
              <Label>Reason</Label>
              <Textarea aria-label="Reason" value={decisionReason} onChange={(e) => setDecisionReason(e.target.value)} rows={3} placeholder="Optional reason..." />
            </div>
          </div>
        </ERPChildDialogForm>
      )}
    </section></QueryReadBoundary>
  );
}
