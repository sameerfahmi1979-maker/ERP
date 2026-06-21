"use client";

/**
 * ERP HR.4 — Employee Time Tab
 *
 * 4 sections:
 *   1. Attendance (daily summaries + raw punches + corrections)
 *   2. Shift & Calendar (shift assignments)
 *   3. Leave Requests & Balances
 *   4. Overtime
 */

import { useState, useTransition, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Clock, Calendar, Plane, Timer,
  Plus, Edit2, Archive, CheckCircle, XCircle, Ban, AlertTriangle,
  RefreshCw, ChevronDown, ChevronUp,
} from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { ERPCombobox } from "@/components/erp/combobox";
import { queryKeys } from "@/lib/query/query-keys";
import {
  getAttendanceStatusBadge,
  getLeaveApprovalStatusBadge,
  getOvertimeApprovalStatusBadge,
  getAttendanceTypeLabel,
  getPunchTypeLabel,
  getPunchSourceLabel,
} from "@/lib/hr/time/status";
import { formatHours, formatMinutes, calculateLeaveDays, getCurrentLeaveYear } from "@/lib/hr/time/date-utils";
import {
  listEmployeeAttendanceDailySummary,
  listEmployeeAttendancePunches,
  listAttendanceCorrections,
  createEmployeeAttendancePunch,
  createOrUpdateAttendanceDailySummary,
  approveAttendanceDailySummary,
  queryAttendanceDailySummary,
  correctAttendanceDailySummary,
  listEmployeeShiftAssignments,
  createEmployeeShiftAssignment,
  updateEmployeeShiftAssignment,
  archiveEmployeeShiftAssignment,
  listEmployeeLeaveRequests,
  createLeaveRequest,
  approveLeaveRequest,
  rejectLeaveRequest,
  cancelLeaveRequest,
  listEmployeeLeaveBalances,
  createOrUpdateLeaveBalance,
  listEmployeeOvertimeRecords,
  createOvertimeRecord,
  updateOvertimeRecord,
  approveOvertimeRecord,
  rejectOvertimeRecord,
  archiveOvertimeRecord,
  listWorkShiftsForTimeTab,
  type AttendanceDailySummaryRow,
  listActiveLeaveTypesForForm,
  type AttendancePunchRow,
  type AttendanceCorrectionRow,
  type ShiftAssignmentRow,
  type LeaveRequestRow,
  type LeaveBalanceRow,
  type OvertimeRecordRow,
} from "@/server/actions/hr/time";
import { getWorkCalendarComboboxOptions } from "@/server/actions/common-master-data/work-calendars";
import type { AuthContext } from "@/lib/rbac/check";

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

// ── Main Tab Component ─────────────────────────────────────────────────────────

export function EmployeeTimeTab({ employeeId, authContext, onChildOpen }: Props) {
  const canViewAttendance = checkPerm(authContext, "hr.attendance.view");
  const canManageAttendance = checkPerm(authContext, "hr.attendance.manage");
  const canViewLeave = checkPerm(authContext, "hr.leave.view");
  const canManageLeave = checkPerm(authContext, "hr.leave.manage");

  if (!canViewAttendance && !canViewLeave) {
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
            employeeId={employeeId}
            canManage={canManageAttendance}
            onChildOpen={onChildOpen}
          />
          <ShiftCalendarSection
            employeeId={employeeId}
            canManage={canManageAttendance}
            onChildOpen={onChildOpen}
          />
          <OvertimeSection
            employeeId={employeeId}
            canManage={canManageAttendance}
            onChildOpen={onChildOpen}
          />
        </>
      )}
      {canViewLeave && (
        <LeaveSection
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
  employeeId,
  canManage,
  onChildOpen,
}: {
  employeeId: number;
  canManage: boolean;
  onChildOpen?: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [showPunches, setShowPunches] = useState(false);
  const [showCorrections, setShowCorrections] = useState<number | null>(null);

  // Add/Edit Summary dialog
  const [summaryDialog, setSummaryDialog] = useState(false);
  const [editSummary, setEditSummary] = useState<AttendanceDailySummaryRow | null>(null);
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

  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: queryKeys.hr.time.attendanceSummary(employeeId),
    queryFn: async () => {
      const r = await listEmployeeAttendanceDailySummary(employeeId, { page_size: 30 });
      return r.success ? r.data : null;
    },
  });

  const { data: punchData } = useQuery({
    queryKey: queryKeys.hr.time.attendancePunches(employeeId),
    enabled: showPunches,
    queryFn: async () => {
      const r = await listEmployeeAttendancePunches(employeeId, { page_size: 50 });
      return r.success ? r.data : null;
    },
  });

  const { data: correctionData } = useQuery({
    queryKey: showCorrections != null ? queryKeys.hr.time.attendanceCorrections(showCorrections) : ["__disabled__"],
    enabled: showCorrections != null,
    queryFn: async () => {
      if (showCorrections == null) return null;
      const r = await listAttendanceCorrections(showCorrections);
      return r.success ? r.data : null;
    },
  });

  function resetSummaryForm(row?: AttendanceDailySummaryRow) {
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
      const r = await approveAttendanceDailySummary(id);
      if (r.success) {
        toast.success("Attendance approved");
        qc.invalidateQueries({ queryKey: queryKeys.hr.time.attendanceSummary(employeeId) });
      } else toast.error(r.error ?? "Failed to approve");
    });
  }

  function handleQuery(id: number) {
    const reason = prompt("Enter query reason:");
    if (!reason) return;
    startTransition(async () => {
      const r = await queryAttendanceDailySummary(id, reason);
      if (r.success) {
        toast.success("Attendance queried");
        qc.invalidateQueries({ queryKey: queryKeys.hr.time.attendanceSummary(employeeId) });
      } else toast.error(r.error ?? "Failed to query");
    });
  }

  function handleSummarySubmit() {
    startTransition(async () => {
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
        toast.success(editSummary ? "Attendance updated" : "Attendance recorded");
        openDialog(false, setSummaryDialog);
        setEditSummary(null);
        qc.invalidateQueries({ queryKey: queryKeys.hr.time.attendanceSummary(employeeId) });
      } else toast.error(r.error ?? "Failed to save");
    });
  }

  function handlePunchSubmit() {
    startTransition(async () => {
      const r = await createEmployeeAttendancePunch(employeeId, {
        punch_datetime: new Date(punchForm.punch_datetime).toISOString(),
        punch_type: punchForm.punch_type,
        punch_source: punchForm.punch_source,
        notes: punchForm.notes || null,
      });
      if (r.success) {
        toast.success("Punch recorded");
        openDialog(false, setPunchDialog);
        qc.invalidateQueries({ queryKey: queryKeys.hr.time.attendancePunches(employeeId) });
      } else toast.error(r.error ?? "Failed to record punch");
    });
  }

  function handleCorrectSubmit(summaryId: number) {
    if (!correctForm.correction_reason.trim()) {
      toast.error("Correction reason is required");
      return;
    }
    startTransition(async () => {
      const r = await correctAttendanceDailySummary(summaryId, {
        correction_reason: correctForm.correction_reason,
        notes: correctForm.notes || null,
      });
      if (r.success) {
        toast.success("Correction recorded");
        setCorrectDialog(null);
        onChildOpen?.(false);
        qc.invalidateQueries({ queryKey: queryKeys.hr.time.attendanceSummary(employeeId) });
        qc.invalidateQueries({ queryKey: queryKeys.hr.time.attendanceCorrections(summaryId) });
      } else toast.error(r.error ?? "Failed to record correction");
    });
  }

  const summaries = summaryData?.data ?? [];
  const punches = punchData?.data ?? [];
  const corrections = correctionData?.data ?? [];

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-semibold">Attendance</h3>
          <span className="text-xs text-muted-foreground">({summaryData?.count ?? 0} records)</span>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => {
              setPunchForm({ punch_datetime: new Date().toISOString().slice(0, 16), punch_type: "in", punch_source: "manual", notes: "" });
              openDialog(true, setPunchDialog);
            }}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Punch
            </Button>
            <Button size="sm" variant="outline" onClick={() => {
              resetSummaryForm();
              setEditSummary(null);
              openDialog(true, setSummaryDialog);
            }}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Daily Summary
            </Button>
          </div>
        )}
      </div>

      {summaryLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : summaries.length === 0 ? (
        <div className="text-sm text-muted-foreground py-6 text-center border rounded-md">No attendance records yet.</div>
      ) : (
        <div className="border rounded-md divide-y">
          {summaries.map((row) => {
            const badge = getAttendanceStatusBadge(row.approval_status);
            return (
              <div key={row.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                <span className="w-24 text-muted-foreground shrink-0">{fmtDate(row.attendance_date)}</span>
                <span className="w-20 font-medium shrink-0">{getAttendanceTypeLabel(row.attendance_type)}</span>
                <span className="text-muted-foreground shrink-0">{formatHours(row.total_hours)}</span>
                {row.is_missing_punch && <Badge variant="destructive" className="text-xs">Missing Punch</Badge>}
                <Badge variant={badge.variant} className="text-xs">{badge.label}</Badge>
                <div className="ml-auto flex gap-1 shrink-0">
                  {canManage && row.approval_status === "pending" && (
                    <>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => handleApprove(row.id)} disabled={isPending}>
                        <CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => handleQuery(row.id)} disabled={isPending}>
                        <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Query
                      </Button>
                    </>
                  )}
                  {canManage && (
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => {
                      setCorrectForm({ correction_reason: "", notes: "" });
                      setCorrectDialog(row.id);
                      onChildOpen?.(true);
                    }}>
                      <RefreshCw className="h-3.5 w-3.5 mr-1" /> Correct
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setShowCorrections(showCorrections === row.id ? null : row.id)}>
                    {showCorrections === row.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </Button>
                  {canManage && (
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => {
                      resetSummaryForm(row);
                      setEditSummary(row);
                      openDialog(true, setSummaryDialog);
                    }}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Corrections sub-panel */}
      {showCorrections != null && corrections.length > 0 && (
        <div className="mt-2 border rounded-md bg-muted/30 p-3 text-xs space-y-1">
          <p className="font-medium text-muted-foreground mb-2">Correction History</p>
          {corrections.map((c) => (
            <div key={c.id} className="flex gap-2 text-muted-foreground">
              <span className="shrink-0">{fmtDatetime(c.created_at)}</span>
              <span>{c.correction_reason}</span>
            </div>
          ))}
        </div>
      )}

      {/* Raw punches toggle */}
      <div className="mt-3">
        <Button size="sm" variant="ghost" className="text-xs text-muted-foreground" onClick={() => setShowPunches(!showPunches)}>
          {showPunches ? "Hide" : "Show"} Raw Punches ({punchData?.count ?? "?"})
        </Button>
        {showPunches && punches.length > 0 && (
          <div className="mt-2 border rounded-md divide-y text-xs">
            {punches.map((p) => (
              <div key={p.id} className="px-3 py-2 flex gap-3 text-muted-foreground">
                <span>{fmtDatetime(p.punch_datetime)}</span>
                <span className="font-medium">{getPunchTypeLabel(p.punch_type)}</span>
                <span>{getPunchSourceLabel(p.punch_source)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Summary Dialog */}
      <ERPChildDialogForm
        open={summaryDialog}
        onOpenChange={(open) => openDialog(open, setSummaryDialog)}
        title={editSummary ? "Edit Daily Attendance" : "Add Daily Attendance"}
        subtitle="Record approved daily attendance summary"
        icon={<Clock className="h-5 w-5" />}
        mode={editSummary ? "edit" : "add"}
        size="md"
        isSubmitting={isPending}
        onSubmit={handleSummarySubmit}
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-6">
            <Label>Date <span className="text-destructive">*</span></Label>
            <Input type="date" value={summaryForm.attendance_date} onChange={(e) => setSummaryForm(f => ({ ...f, attendance_date: e.target.value }))} />
          </div>
          <div className="col-span-6">
            <Label>Attendance Type <span className="text-destructive">*</span></Label>
            <ERPCombobox
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
            <Input type="number" step="0.25" min="0" max="24" value={summaryForm.total_hours} onChange={(e) => setSummaryForm(f => ({ ...f, total_hours: e.target.value }))} placeholder="0.00" />
          </div>
          <div className="col-span-4">
            <Label>Overtime Hours</Label>
            <Input type="number" step="0.25" min="0" max="24" value={summaryForm.overtime_hours} onChange={(e) => setSummaryForm(f => ({ ...f, overtime_hours: e.target.value }))} />
          </div>
          <div className="col-span-4">
            <Label>Late (min)</Label>
            <Input type="number" min="0" value={summaryForm.late_minutes} onChange={(e) => setSummaryForm(f => ({ ...f, late_minutes: e.target.value }))} />
          </div>
          <div className="col-span-6 flex items-center gap-2 mt-1">
            <Switch checked={summaryForm.is_missing_punch} onCheckedChange={(v) => setSummaryForm(f => ({ ...f, is_missing_punch: v }))} id="missing-punch" />
            <Label htmlFor="missing-punch">Missing Punch</Label>
          </div>
          <div className="col-span-12">
            <Label>Notes</Label>
            <Textarea value={summaryForm.notes} onChange={(e) => setSummaryForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
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
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12">
            <Label>Punch Date/Time <span className="text-destructive">*</span></Label>
            <Input type="datetime-local" value={punchForm.punch_datetime} onChange={(e) => setPunchForm(f => ({ ...f, punch_datetime: e.target.value }))} />
          </div>
          <div className="col-span-6">
            <Label>Punch Type <span className="text-destructive">*</span></Label>
            <ERPCombobox
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
            <ERPCombobox
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
            <Input value={punchForm.notes} onChange={(e) => setPunchForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
      </ERPChildDialogForm>

      {/* Correct Dialog */}
      {correctDialog != null && (
        <ERPChildDialogForm
          open={true}
          onOpenChange={(open) => {
            if (!open) { setCorrectDialog(null); onChildOpen?.(false); }
          }}
          title="Record Attendance Correction"
          subtitle="Append-only correction audit entry"
          icon={<RefreshCw className="h-5 w-5" />}
          mode="add"
          size="sm"
          submitLabel="Record Correction"
          isSubmitting={isPending}
          onSubmit={() => handleCorrectSubmit(correctDialog)}
        >
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12">
              <Label>Correction Reason <span className="text-destructive">*</span></Label>
              <Textarea value={correctForm.correction_reason} onChange={(e) => setCorrectForm(f => ({ ...f, correction_reason: e.target.value }))} rows={3} placeholder="Describe the correction..." />
            </div>
            <div className="col-span-12">
              <Label>Notes</Label>
              <Input value={correctForm.notes} onChange={(e) => setCorrectForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
        </ERPChildDialogForm>
      )}
    </section>
  );
}

// ── 2. Shift & Calendar Section ────────────────────────────────────────────────

function ShiftCalendarSection({
  employeeId,
  canManage,
  onChildOpen,
}: {
  employeeId: number;
  canManage: boolean;
  onChildOpen?: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ShiftAssignmentRow | null>(null);
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

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.hr.time.shiftAssignments(employeeId),
    queryFn: async () => {
      const r = await listEmployeeShiftAssignments(employeeId);
      return r.success ? r.data?.data ?? [] : [];
    },
  });

  const { data: calendarOptions } = useQuery({
    queryKey: ["common", "work-calendars-options"],
    queryFn: async () => {
      const r = await getWorkCalendarComboboxOptions();
      return r.success ? r.data ?? [] : [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: shiftOptions } = useQuery({
    queryKey: ["common", "work-shifts-options", form.work_calendar_id],
    queryFn: async () => {
      const calId = form.work_calendar_id ? parseInt(form.work_calendar_id) : undefined;
      const r = await listWorkShiftsForTimeTab(calId);
      return r.success ? (r.data ?? []).map(s => ({ value: String(s.id), label: `${s.shift_name} (${s.shift_code})` })) : [];
    },
    staleTime: 2 * 60 * 1000,
  });

  function resetForm(row?: ShiftAssignmentRow) {
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
        toast.success(editing ? "Shift assignment updated" : "Shift assignment created");
        openDialog(false);
        setEditing(null);
        qc.invalidateQueries({ queryKey: queryKeys.hr.time.shiftAssignments(employeeId) });
        qc.invalidateQueries({ queryKey: queryKeys.hr.time.summary(employeeId) });
      } else toast.error(r.error ?? "Failed to save");
    });
  }

  function handleArchive(id: number) {
    if (!confirm("Archive this shift assignment?")) return;
    startTransition(async () => {
      const r = await archiveEmployeeShiftAssignment(id);
      if (r.success) {
        toast.success("Shift assignment archived");
        qc.invalidateQueries({ queryKey: queryKeys.hr.time.shiftAssignments(employeeId) });
        qc.invalidateQueries({ queryKey: queryKeys.hr.time.summary(employeeId) });
      } else toast.error(r.error ?? "Failed to archive");
    });
  }

  const assignments = data ?? [];

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-semibold">Shift & Calendar</h3>
        </div>
        {canManage && (
          <Button size="sm" variant="outline" onClick={() => {
            resetForm();
            setEditing(null);
            openDialog(true);
          }}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Assignment
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : assignments.length === 0 ? (
        <div className="text-sm text-muted-foreground py-6 text-center border rounded-md">No shift assignments yet.</div>
      ) : (
        <div className="border rounded-md divide-y">
          {assignments.map((row) => (
            <div key={row.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
              <div className="flex-1 min-w-0">
                <p className="font-medium">{row.work_shift?.shift_name ?? "—"}</p>
                <p className="text-xs text-muted-foreground">{row.work_calendar?.calendar_name ?? "No calendar"} · {fmtDate(row.effective_from)} → {row.effective_to ? fmtDate(row.effective_to) : "Ongoing"}</p>
              </div>
              {row.overtime_eligible && <Badge variant="secondary" className="text-xs">OT Eligible</Badge>}
              {!row.attendance_required && <Badge variant="outline" className="text-xs">No Att. Req.</Badge>}
              {canManage && (
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => {
                    resetForm(row);
                    setEditing(row);
                    openDialog(true);
                  }}>
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => handleArchive(row.id)} disabled={isPending}>
                    <Archive className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ERPChildDialogForm
        open={dialogOpen}
        onOpenChange={openDialog}
        title={editing ? "Edit Shift Assignment" : "Add Shift Assignment"}
        subtitle="Assign employee to work calendar and shift"
        icon={<Calendar className="h-5 w-5" />}
        mode={editing ? "edit" : "add"}
        size="md"
        isSubmitting={isPending}
        onSubmit={handleSubmit}
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-6">
            <Label>Work Calendar</Label>
            <ERPCombobox
              value={form.work_calendar_id}
              onValueChange={(v) => setForm(f => ({ ...f, work_calendar_id: String(v ?? ""), work_shift_id: "" }))}
              options={calendarOptions ?? []}
              placeholder="Select calendar..."
            />
          </div>
          <div className="col-span-6">
            <Label>Work Shift</Label>
            <ERPCombobox
              value={form.work_shift_id}
              onValueChange={(v) => setForm(f => ({ ...f, work_shift_id: String(v ?? "") }))}
              options={shiftOptions ?? []}
              placeholder={form.work_calendar_id ? "Select shift..." : "Select calendar first..."}
            />
          </div>
          <div className="col-span-6">
            <Label>Effective From <span className="text-destructive">*</span></Label>
            <Input type="date" value={form.effective_from} onChange={(e) => setForm(f => ({ ...f, effective_from: e.target.value }))} />
          </div>
          <div className="col-span-6">
            <Label>Effective To</Label>
            <Input type="date" value={form.effective_to} onChange={(e) => setForm(f => ({ ...f, effective_to: e.target.value }))} />
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
            <Textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
        </div>
      </ERPChildDialogForm>
    </section>
  );
}

// ── 3. Leave Section ───────────────────────────────────────────────────────────

function LeaveSection({
  employeeId,
  canManage,
  onChildOpen,
}: {
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

  const { data: leaveData, isLoading: leaveLoading, isError: leaveError, error: leaveQueryError } = useQuery({
    queryKey: queryKeys.hr.time.leaveRequests(employeeId),
    queryFn: async () => {
      const r = await listEmployeeLeaveRequests(employeeId, { page_size: 30 });
      if (!r.success) throw new Error(r.error ?? "Failed to load leave requests");
      return r.data;
    },
    refetchOnMount: "always",
  });

  const { data: balData } = useQuery({
    queryKey: queryKeys.hr.time.leaveBalances(employeeId),
    queryFn: async () => {
      const r = await listEmployeeLeaveBalances(employeeId);
      return r.success ? r.data?.data ?? [] : [];
    },
  });

  const { data: leaveTypeOptions, refetch: refetchLeaveTypes } = useQuery({
    queryKey: queryKeys.hr.time.activeLeaveTypes(),
    queryFn: async () => {
      const r = await listActiveLeaveTypesForForm();
      return r.success ? (r.data?.data ?? []).map((lt) => ({ value: String(lt.id), label: lt.name_en })) : [];
    },
    enabled: canManage,
  });

  const totalDays = form.start_date && form.end_date ? calculateLeaveDays(form.start_date, form.end_date) : 0;

  function handleLeaveSubmit() {
    startTransition(async () => {
      const r = await createLeaveRequest(employeeId, {
        leave_type_id: parseInt(form.leave_type_id),
        start_date: form.start_date,
        end_date: form.end_date,
        reason: form.reason || null,
        notes: form.notes || null,
      });
      if (r.success) {
        toast.success("Leave request created");
        openDialog(false, setDialogOpen);
        qc.invalidateQueries({ queryKey: queryKeys.hr.time.leaveRequests(employeeId) });
        qc.invalidateQueries({ queryKey: queryKeys.hr.time.summary(employeeId) });
      } else toast.error(r.error ?? "Failed to create leave request");
    });
  }

  function handleApprove(id: number) {
    startTransition(async () => {
      const r = await approveLeaveRequest(id);
      if (r.success) {
        toast.success("Leave approved");
        qc.invalidateQueries({ queryKey: queryKeys.hr.time.leaveRequests(employeeId) });
        qc.invalidateQueries({ queryKey: queryKeys.hr.time.leaveBalances(employeeId) });
        qc.invalidateQueries({ queryKey: queryKeys.hr.time.summary(employeeId) });
      } else toast.error(r.error ?? "Failed to approve");
    });
  }

  function handleDecisionSubmit() {
    if (!decisionDialog) return;
    startTransition(async () => {
      const r = decisionDialog.action === "reject"
        ? await rejectLeaveRequest(decisionDialog.id, decisionReason)
        : await cancelLeaveRequest(decisionDialog.id, decisionReason);
      if (r.success) {
        toast.success(decisionDialog.action === "reject" ? "Leave rejected" : "Leave cancelled");
        setDecisionDialog(null);
        onChildOpen?.(false);
        qc.invalidateQueries({ queryKey: queryKeys.hr.time.leaveRequests(employeeId) });
        qc.invalidateQueries({ queryKey: queryKeys.hr.time.summary(employeeId) });
      } else toast.error(r.error ?? "Failed");
    });
  }

  function handleBalanceSubmit() {
    startTransition(async () => {
      const r = await createOrUpdateLeaveBalance(employeeId, {
        leave_type_id: parseInt(balForm.leave_type_id),
        leave_year: parseInt(balForm.leave_year),
        entitled_days: parseFloat(balForm.entitled_days) || 0,
        used_days: parseFloat(balForm.used_days) || 0,
        carry_forward: parseFloat(balForm.carry_forward) || 0,
      });
      if (r.success) {
        toast.success("Leave balance updated");
        openDialog(false, setBalanceDialogOpen);
        qc.invalidateQueries({ queryKey: queryKeys.hr.time.leaveBalances(employeeId) });
        qc.invalidateQueries({ queryKey: queryKeys.hr.time.summary(employeeId) });
      } else toast.error(r.error ?? "Failed to update balance");
    });
  }

  const leaves = leaveData?.data ?? [];
  const balances = balData ?? [];

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Plane className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-semibold">Leave Requests & Balances</h3>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => {
              setBalForm({ leave_type_id: "", leave_year: String(currentYear), entitled_days: "", used_days: "0", carry_forward: "0" });
              void refetchLeaveTypes();
              openDialog(true, setBalanceDialogOpen);
            }}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Update Balance
            </Button>
            <Button size="sm" variant="outline" onClick={() => {
              setForm({ leave_type_id: "", start_date: new Date().toISOString().slice(0, 10), end_date: new Date().toISOString().slice(0, 10), reason: "", notes: "" });
              void refetchLeaveTypes();
              openDialog(true, setDialogOpen);
            }}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Leave Request
            </Button>
          </div>
        )}
      </div>

      {/* Leave Balances */}
      {balances.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          {balances.filter(b => b.leave_year === currentYear).map((b) => (
            <div key={b.id} className="border rounded-md p-3 text-xs">
              <p className="font-medium text-muted-foreground">{b.leave_type?.name_en ?? "—"}</p>
              <p className="text-lg font-bold mt-1">{b.balance_days ?? 0}<span className="text-xs font-normal text-muted-foreground ml-1">days</span></p>
              <p className="text-muted-foreground">{b.used_days}/{b.entitled_days} used</p>
            </div>
          ))}
        </div>
      )}

      {/* Leave Requests */}
      {leaveLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : leaveError ? (
        <div className="text-sm text-destructive py-6 text-center border rounded-md">
          {leaveQueryError instanceof Error ? leaveQueryError.message : "Failed to load leave requests"}
        </div>
      ) : leaves.length === 0 ? (
        <div className="text-sm text-muted-foreground py-6 text-center border rounded-md">No leave requests yet.</div>
      ) : (
        <div className="border rounded-md divide-y">
          {leaves.map((row) => {
            const badge = getLeaveApprovalStatusBadge(row.approval_status);
            return (
              <div key={row.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{row.leave_type?.name_en ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{fmtDate(row.start_date)} → {fmtDate(row.end_date)} · {row.total_days ?? 0} day(s)</p>
                </div>
                <Badge variant={badge.variant} className="text-xs">{badge.label}</Badge>
                {canManage && (
                  <div className="flex gap-1 shrink-0">
                    {row.approval_status === "pending" && (
                      <>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => handleApprove(row.id)} disabled={isPending}>
                          <CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive" onClick={() => {
                          setDecisionReason("");
                          setDecisionDialog({ id: row.id, action: "reject" });
                          onChildOpen?.(true);
                        }}>
                          <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                        </Button>
                      </>
                    )}
                    {["pending", "approved"].includes(row.approval_status) && (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => {
                        setDecisionReason("");
                        setDecisionDialog({ id: row.id, action: "cancel" });
                        onChildOpen?.(true);
                      }}>
                        <Ban className="h-3.5 w-3.5 mr-1" /> Cancel
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
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
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12">
            <Label>Leave Type <span className="text-destructive">*</span></Label>
            <ERPCombobox
              value={form.leave_type_id}
              onValueChange={(v) => setForm(f => ({ ...f, leave_type_id: String(v ?? "") }))}
              options={leaveTypeOptions ?? []}
              placeholder="Select leave type..."
            />
          </div>
          <div className="col-span-6">
            <Label>Start Date <span className="text-destructive">*</span></Label>
            <Input type="date" value={form.start_date} onChange={(e) => setForm(f => ({ ...f, start_date: e.target.value }))} />
          </div>
          <div className="col-span-6">
            <Label>End Date <span className="text-destructive">*</span></Label>
            <Input type="date" value={form.end_date} onChange={(e) => setForm(f => ({ ...f, end_date: e.target.value }))} />
          </div>
          <div className="col-span-12 text-xs text-muted-foreground">
            Duration: <span className="font-medium text-foreground">{totalDays} day(s)</span>
          </div>
          <div className="col-span-12">
            <Label>Reason</Label>
            <Textarea value={form.reason} onChange={(e) => setForm(f => ({ ...f, reason: e.target.value }))} rows={2} />
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
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12">
            <Label>Leave Type <span className="text-destructive">*</span></Label>
            <ERPCombobox
              value={balForm.leave_type_id}
              onValueChange={(v) => setBalForm(f => ({ ...f, leave_type_id: String(v ?? "") }))}
              options={leaveTypeOptions ?? []}
              placeholder="Select leave type..."
            />
          </div>
          <div className="col-span-6">
            <Label>Year <span className="text-destructive">*</span></Label>
            <Input type="number" value={balForm.leave_year} onChange={(e) => setBalForm(f => ({ ...f, leave_year: e.target.value }))} min={2020} max={2100} />
          </div>
          <div className="col-span-6">
            <Label>Entitled Days <span className="text-destructive">*</span></Label>
            <Input type="number" step="0.5" min="0" value={balForm.entitled_days} onChange={(e) => setBalForm(f => ({ ...f, entitled_days: e.target.value }))} />
          </div>
          <div className="col-span-6">
            <Label>Used Days</Label>
            <Input type="number" step="0.5" min="0" value={balForm.used_days} onChange={(e) => setBalForm(f => ({ ...f, used_days: e.target.value }))} />
          </div>
          <div className="col-span-6">
            <Label>Carry Forward</Label>
            <Input type="number" step="0.5" min="0" value={balForm.carry_forward} onChange={(e) => setBalForm(f => ({ ...f, carry_forward: e.target.value }))} />
          </div>
        </div>
      </ERPChildDialogForm>

      {/* Reject / Cancel Dialog */}
      {decisionDialog != null && (
        <ERPChildDialogForm
          open={true}
          onOpenChange={(open) => {
            if (!open) { setDecisionDialog(null); onChildOpen?.(false); }
          }}
          title={decisionDialog.action === "reject" ? "Reject Leave Request" : "Cancel Leave Request"}
          subtitle="Provide a reason for this action"
          icon={decisionDialog.action === "reject" ? <XCircle className="h-5 w-5" /> : <Ban className="h-5 w-5" />}
          mode="edit"
          size="sm"
          submitLabel={decisionDialog.action === "reject" ? "Reject" : "Cancel Leave"}
          isSubmitting={isPending}
          onSubmit={handleDecisionSubmit}
        >
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12">
              <Label>Reason</Label>
              <Textarea value={decisionReason} onChange={(e) => setDecisionReason(e.target.value)} rows={3} placeholder="Optional reason..." />
            </div>
          </div>
        </ERPChildDialogForm>
      )}
    </section>
  );
}

// ── 4. Overtime Section ────────────────────────────────────────────────────────

function OvertimeSection({
  employeeId,
  canManage,
  onChildOpen,
}: {
  employeeId: number;
  canManage: boolean;
  onChildOpen?: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<OvertimeRecordRow | null>(null);
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

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.hr.time.overtimeRecords(employeeId),
    queryFn: async () => {
      const r = await listEmployeeOvertimeRecords(employeeId, { page_size: 30 });
      return r.success ? r.data : null;
    },
  });

  function resetForm(row?: OvertimeRecordRow) {
    setForm({
      overtime_date: row?.overtime_date ?? new Date().toISOString().slice(0, 10),
      hours: row?.hours != null ? String(row.hours) : "",
      reason: row?.reason ?? "",
      notes: row?.notes ?? "",
    });
  }

  function handleSubmit() {
    startTransition(async () => {
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
        toast.success(editing ? "Overtime updated" : "Overtime recorded");
        openDialog(false);
        setEditing(null);
        qc.invalidateQueries({ queryKey: queryKeys.hr.time.overtimeRecords(employeeId) });
        qc.invalidateQueries({ queryKey: queryKeys.hr.time.summary(employeeId) });
      } else toast.error(r.error ?? "Failed to save");
    });
  }

  function handleApprove(id: number) {
    startTransition(async () => {
      const r = await approveOvertimeRecord(id);
      if (r.success) {
        toast.success("Overtime approved");
        qc.invalidateQueries({ queryKey: queryKeys.hr.time.overtimeRecords(employeeId) });
        qc.invalidateQueries({ queryKey: queryKeys.hr.time.summary(employeeId) });
      } else toast.error(r.error ?? "Failed to approve");
    });
  }

  function handleRejectSubmit() {
    if (!decisionDialog) return;
    startTransition(async () => {
      const r = await rejectOvertimeRecord(decisionDialog.id, decisionReason);
      if (r.success) {
        toast.success("Overtime rejected");
        setDecisionDialog(null);
        onChildOpen?.(false);
        qc.invalidateQueries({ queryKey: queryKeys.hr.time.overtimeRecords(employeeId) });
      } else toast.error(r.error ?? "Failed to reject");
    });
  }

  function handleArchive(id: number) {
    if (!confirm("Archive this overtime record?")) return;
    startTransition(async () => {
      const r = await archiveOvertimeRecord(id);
      if (r.success) {
        toast.success("Overtime archived");
        qc.invalidateQueries({ queryKey: queryKeys.hr.time.overtimeRecords(employeeId) });
      } else toast.error(r.error ?? "Failed to archive");
    });
  }

  const records = data?.data ?? [];
  const totalApprovedHours = records.filter(r => r.approval_status === "approved").reduce((s, r) => s + Number(r.hours), 0);

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Timer className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-semibold">Overtime</h3>
          {totalApprovedHours > 0 && (
            <span className="text-xs text-muted-foreground">(Approved: {formatHours(totalApprovedHours)})</span>
          )}
        </div>
        {canManage && (
          <Button size="sm" variant="outline" onClick={() => {
            resetForm();
            setEditing(null);
            openDialog(true);
          }}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Overtime
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : records.length === 0 ? (
        <div className="text-sm text-muted-foreground py-6 text-center border rounded-md">No overtime records yet.</div>
      ) : (
        <div className="border rounded-md divide-y">
          {records.map((row) => {
            const badge = getOvertimeApprovalStatusBadge(row.approval_status);
            return (
              <div key={row.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                <span className="w-24 text-muted-foreground shrink-0">{fmtDate(row.overtime_date)}</span>
                <span className="font-medium shrink-0">{formatHours(row.hours)}</span>
                <span className="text-xs text-muted-foreground truncate flex-1">{row.reason ?? ""}</span>
                <Badge variant={badge.variant} className="text-xs">{badge.label}</Badge>
                {canManage && (
                  <div className="flex gap-1 shrink-0">
                    {row.approval_status === "pending" && (
                      <>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => handleApprove(row.id)} disabled={isPending}>
                          <CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive" onClick={() => {
                          setDecisionReason("");
                          setDecisionDialog({ id: row.id, action: "reject" });
                          onChildOpen?.(true);
                        }}>
                          <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => {
                          resetForm(row);
                          setEditing(row);
                          openDialog(true);
                        }}>
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => handleArchive(row.id)} disabled={isPending}>
                      <Archive className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ERPChildDialogForm
        open={dialogOpen}
        onOpenChange={openDialog}
        title={editing ? "Edit Overtime" : "Add Overtime Record"}
        subtitle="Record overtime hours"
        icon={<Timer className="h-5 w-5" />}
        mode={editing ? "edit" : "add"}
        size="sm"
        isSubmitting={isPending}
        onSubmit={handleSubmit}
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-6">
            <Label>Date <span className="text-destructive">*</span></Label>
            <Input type="date" value={form.overtime_date} onChange={(e) => setForm(f => ({ ...f, overtime_date: e.target.value }))} />
          </div>
          <div className="col-span-6">
            <Label>Hours <span className="text-destructive">*</span></Label>
            <Input type="number" step="0.5" min="0" max="24" value={form.hours} onChange={(e) => setForm(f => ({ ...f, hours: e.target.value }))} placeholder="0.0" />
          </div>
          <div className="col-span-12">
            <Label>Reason</Label>
            <Textarea value={form.reason} onChange={(e) => setForm(f => ({ ...f, reason: e.target.value }))} rows={2} />
          </div>
          <div className="col-span-12">
            <Label>Notes</Label>
            <Input value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
      </ERPChildDialogForm>

      {decisionDialog != null && (
        <ERPChildDialogForm
          open={true}
          onOpenChange={(open) => {
            if (!open) { setDecisionDialog(null); onChildOpen?.(false); }
          }}
          title="Reject Overtime Record"
          subtitle="Provide a reason for rejection"
          icon={<XCircle className="h-5 w-5" />}
          mode="edit"
          size="sm"
          submitLabel="Reject"
          isSubmitting={isPending}
          onSubmit={handleRejectSubmit}
        >
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12">
              <Label>Reason</Label>
              <Textarea value={decisionReason} onChange={(e) => setDecisionReason(e.target.value)} rows={3} placeholder="Optional reason..." />
            </div>
          </div>
        </ERPChildDialogForm>
      )}
    </section>
  );
}
