"use server";

/**
 * ERP HR.4 — Time Foundation Server Actions
 *
 * Covers:
 *   - employee_attendance_punches
 *   - employee_attendance_daily_summary + corrections (append-only)
 *   - employee_shift_assignments (references work_calendars, work_shifts)
 *   - employee_leave_requests   (references hr_leave_types)
 *   - employee_leave_balances   (UNIQUE employee/type/year)
 *   - employee_overtime_records
 *   - getEmployeeTimeSummary
 *
 * Security model:
 *   - Most reads use createClient() (RLS enforced: hr.attendance.view / hr.leave.view)
 *   - Leave request/balance lists use createClient() with subject-scoped RLS
 *     (avoids RLS read/write asymmetry where manage can create but RLS blocks list)
 *   - All writes use createClient() with subject-scoped RLS and application capability checks
 *   - No payroll/WPS/AI implementation
 */


import { getAuthContext, hasPermission, isGlobalAdmin } from "@/lib/rbac/check";

import { createClient } from "@/lib/supabase/server";


import{childSaveContract,type ChildSaveContract,type ChildSaveResult,type ChildMutation}from'@/lib/hr/child-save-contract';
import{employeeId as timeEmployeeId}from'@/lib/hr/employee-contract';
import{canUseHrChild}from'@/lib/hr/child-authority';
import{TIME_CHILD_TABLES,type TimeChildKind}from'@/lib/hr/time-child-contract';
import{mutateHrChild}from'./child-mutation';
async function mutateOriginalTime(kind:TimeChildKind,id:number,action:ChildMutation['action'],input:unknown,contract:ChildSaveContract):Promise<ChildSaveResult>{
 if(!timeEmployeeId.safeParse(id).success||!childSaveContract.safeParse(contract).success||contract.revision===null||!canUseHrChild(await getAuthContext(),kind))return{success:false,error:'Original Time revision and current access required.'};
 let query=(await createClient()).from(TIME_CHILD_TABLES[kind]).select('id,employee_id').eq('id',id);if(['shift-assignment','leave-request','overtime'].includes(kind))query=query.is('deleted_at',null);
 const r=await query.maybeSingle();if(r.error||!r.data)return{success:false,error:'Original Time record unavailable.'};
 return mutateHrChild({kind,employeeId:r.data.employee_id,id,revision:contract.revision,action,values:input},contract);
}

// ── Types ──────────────────────────────────────────────────────────────────────

type ActionResult<T = unknown> = { success: boolean; data?: T; error?: string };

export type AttendancePunchRow = {
  id: number;
  employee_id: number;
  punch_datetime: string;
  punch_type: string;
  work_site_id: number | null;
  punch_source: string | null;
  device_reference: string | null;
  external_reference: string | null;
  notes: string | null;
  created_at: string;
  created_by: number | null;
  work_site?: { site_name: string } | null;
};

export type AttendanceDailySummaryRow = {
  id: number;
  employee_id: number;
  attendance_date: string;
  attendance_type: string;
  work_site_id: number | null;
  first_in_at: string | null;
  last_out_at: string | null;
  total_hours: number | null;
  overtime_hours: number;
  late_minutes: number;
  early_out_minutes: number;
  is_missing_punch: boolean;
  approval_status: string;
  approved_by: number | null;
  approved_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
  work_site?: { site_name: string } | null;
  approver?: { display_name: string } | null;
};

export type AttendanceCorrectionRow = {
  id: number;
  summary_id: number;
  employee_id: number;
  correction_reason: string;
  old_values_json: Record<string, unknown> | null;
  new_values_json: Record<string, unknown> | null;
  corrected_by: number;
  created_at: string;
  corrector?: { display_name: string } | null;
};

export type ShiftAssignmentRow = {
  id: number;
  employee_id: number;
  work_calendar_id: number | null;
  work_shift_id: number | null;
  weekly_off_day: string | null;
  overtime_eligible: boolean;
  attendance_required: boolean;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  work_calendar?: { calendar_name: string } | null;
  work_shift?: { shift_name: string } | null;
};

export type LeaveRequestRow = {
  id: number;
  employee_id: number;
  leave_type_id: number;
  request_date: string;
  start_date: string;
  end_date: string;
  total_days: number | null;
  reason: string | null;
  approval_status: string;
  approved_by: number | null;
  approved_at: string | null;
  rejected_by: number | null;
  rejected_at: string | null;
  cancelled_by: number | null;
  cancelled_at: string | null;
  sick_cert_dms_id: number | null;
  return_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  leave_type?: { name_en: string; code: string } | null;
  approver?: { display_name: string } | null;
  employee?: { full_name_en: string; employee_code: string } | null;
};

export type LeaveBalanceRow = {
  id: number;
  employee_id: number;
  leave_type_id: number;
  leave_year: number;
  entitled_days: number;
  used_days: number;
  balance_days: number;
  carry_forward: number;
  updated_at: string;
  created_at: string;
  leave_type?: { name_en: string; code: string } | null;
};

export type OvertimeRecordRow = {
  id: number;
  employee_id: number;
  overtime_date: string;
  hours: number;
  reason: string | null;
  approval_status: string;
  approved_by: number | null;
  approved_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  approver?: { display_name: string } | null;
};

export type EmployeeTimeSummary = {
  currentShiftAssignment: ShiftAssignmentRow | null;
  attendanceThisMonthCount: number;
  leaveBalances: LeaveBalanceRow[];
  pendingLeaveCount: number;
  overtimeHoursThisMonth: number;
};

// ── Zod Schemas ────────────────────────────────────────────────────────────────

// ── Internal Helpers ───────────────────────────────────────────────────────────

import { getEmployeeCtx as getEmployeeCtxRls } from "./_shared/employee-context";

const LEAVE_REQUEST_LIST_SELECT =
  "*, leave_type:hr_leave_types!employee_leave_requests_leave_type_id_fkey(name_en,code), approver:user_profiles!employee_leave_requests_approved_by_fkey(display_name), employee:employees!employee_leave_requests_employee_id_fkey(full_name_en,employee_code)";

function canViewLeave(ctx: Awaited<ReturnType<typeof getAuthContext>>): boolean {
  return (
    hasPermission(ctx, "hr.leave.view") ||
    hasPermission(ctx, "hr.leave.manage") ||
    hasPermission(ctx, "hr.admin") ||
    isGlobalAdmin(ctx)
  );
}

/** Employee IDs visible to the current user via employees RLS; null = unrestricted (global admin). */
async function getAccessibleEmployeeIdsForLeave(
  ctx: Awaited<ReturnType<typeof getAuthContext>>
): Promise<number[] | null> {
  if (isGlobalAdmin(ctx) || hasPermission(ctx, "hr.admin")) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("employees").select("id").is("deleted_at", null);
  if (error) return [];
  return (data ?? []).map((row) => row.id as number);
}



// ── Attendance Punches ─────────────────────────────────────────────────────────

export async function listEmployeeAttendancePunches(
  employeeId: number,
  params?: { page?: number; page_size?: number; date_from?: string; date_to?: string }
): Promise<ActionResult<{ data: AttendancePunchRow[]; count: number }>> {
  const supabase = await createClient();
  const { page = 1, page_size = 50, date_from, date_to } = params ?? {};
  const from = (page - 1) * page_size;
  const to = from + page_size - 1;

  let q = supabase
    .from("employee_attendance_punches")
    .select("*, work_site:work_sites!employee_attendance_punches_work_site_id_fkey(site_name)", { count: "exact" })
    .eq("employee_id", employeeId)
    .order("punch_datetime", { ascending: false })
    .range(from, to);

  if (date_from) q = q.gte("punch_datetime", date_from);
  if (date_to) q = q.lte("punch_datetime", date_to + "T23:59:59Z");

  const { data, error, count } = await q;
  if (error) return { success: false, error: error.message };
  return { success: true, data: { data: (data ?? []) as AttendancePunchRow[], count: count ?? 0 } };
}

export async function createEmployeeAttendancePunch(employeeId:number,input:unknown,contract:ChildSaveContract):Promise<ChildSaveResult>{return mutateHrChild({kind:'attendance-punch',employeeId,id:null,revision:contract?.revision,action:'create',values:input},contract);}

// ── Attendance Daily Summary ───────────────────────────────────────────────────

export async function listEmployeeAttendanceDailySummary(
  employeeId: number,
  params?: { page?: number; page_size?: number; date_from?: string; date_to?: string; approval_status?: string }
): Promise<ActionResult<{ data: AttendanceDailySummaryRow[]; count: number }>> {
  const supabase = await createClient();
  const { page = 1, page_size = 50, date_from, date_to, approval_status } = params ?? {};
  const from = (page - 1) * page_size;
  const to = from + page_size - 1;

  let q = supabase
    .from("employee_attendance_daily_summary")
    .select(
      "*, work_site:work_sites!employee_attendance_daily_summary_work_site_id_fkey(site_name), approver:user_profiles!employee_attendance_daily_summary_approved_by_fkey(display_name)",
      { count: "exact" }
    )
    .eq("employee_id", employeeId)
    .order("attendance_date", { ascending: false })
    .range(from, to);

  if (date_from) q = q.gte("attendance_date", date_from);
  if (date_to) q = q.lte("attendance_date", date_to);
  if (approval_status) q = q.eq("approval_status", approval_status);

  const { data, error, count } = await q;
  if (error) return { success: false, error: error.message };
  return { success: true, data: { data: (data ?? []) as AttendanceDailySummaryRow[], count: count ?? 0 } };
}

export async function listDailyAttendance(params?: {
  page?: number;
  page_size?: number;
  attendance_date?: string;
  date_from?: string;
  date_to?: string;
  approval_status?: string;
  work_site_id?: number;
}): Promise<ActionResult<{ data: AttendanceDailySummaryRow[]; count: number }>> {
  const supabase = await createClient();
  const { page = 1, page_size = 50, attendance_date, date_from, date_to, approval_status, work_site_id } = params ?? {};
  const from = (page - 1) * page_size;
  const to = from + page_size - 1;

  let q = supabase
    .from("employee_attendance_daily_summary")
    .select(
      "*, work_site:work_sites!employee_attendance_daily_summary_work_site_id_fkey(site_name), approver:user_profiles!employee_attendance_daily_summary_approved_by_fkey(display_name)",
      { count: "exact" }
    )
    .order("attendance_date", { ascending: false })
    .range(from, to);

  if (attendance_date) q = q.eq("attendance_date", attendance_date);
  if (date_from) q = q.gte("attendance_date", date_from);
  if (date_to) q = q.lte("attendance_date", date_to);
  if (approval_status) q = q.eq("approval_status", approval_status);
  if (work_site_id) q = q.eq("work_site_id", work_site_id);

  const { data, error, count } = await q;
  if (error) return { success: false, error: error.message };
  return { success: true, data: { data: (data ?? []) as AttendanceDailySummaryRow[], count: count ?? 0 } };
}

export async function createOrUpdateAttendanceDailySummary(employeeId:number,input:unknown,contract:ChildSaveContract,originalId:number|null):Promise<ChildSaveResult>{return mutateHrChild({kind:'attendance-summary',employeeId,id:originalId,revision:contract?.revision,action:originalId===null?'create':'update',values:input},contract);}

export async function approveAttendanceDailySummary(id:number,contract:ChildSaveContract):Promise<ChildSaveResult>{return mutateOriginalTime('attendance-summary',id,'approve',{},contract);}

export async function queryAttendanceDailySummary(id:number,reason:string,contract:ChildSaveContract):Promise<ChildSaveResult>{return mutateOriginalTime('attendance-summary',id,'query',{reason},contract);}

// ── Attendance Corrections (Append-Only) ──────────────────────────────────────

export async function listAttendanceCorrections(
  summaryId: number
): Promise<ActionResult<{ data: AttendanceCorrectionRow[] }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_attendance_corrections")
    .select("*, corrector:user_profiles!employee_attendance_corrections_corrected_by_fkey(display_name)")
    .eq("summary_id", summaryId)
    .order("created_at", { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, data: { data: (data ?? []) as AttendanceCorrectionRow[] } };
}

export async function correctAttendanceDailySummary(id:number,input:unknown,contract:ChildSaveContract):Promise<ChildSaveResult>{return mutateOriginalTime('attendance-summary',id,'correct',input,contract);}

// ── Shift Assignments ──────────────────────────────────────────────────────────

export async function listEmployeeShiftAssignments(
  employeeId: number
): Promise<ActionResult<{ data: ShiftAssignmentRow[] }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_shift_assignments")
    .select(
      "*, work_calendar:work_calendars!employee_shift_assignments_work_calendar_id_fkey(calendar_name), work_shift:work_shifts!employee_shift_assignments_work_shift_id_fkey(shift_name)"
    )
    .eq("employee_id", employeeId)
    .is("deleted_at", null)
    .order("effective_from", { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, data: { data: (data ?? []) as ShiftAssignmentRow[] } };
}

export async function listGlobalShiftAssignments(params?: {
  page?: number;
  page_size?: number;
  work_calendar_id?: number;
  work_shift_id?: number;
}): Promise<ActionResult<{ data: ShiftAssignmentRow[]; count: number }>> {
  const supabase = await createClient();
  const { page = 1, page_size = 50, work_calendar_id, work_shift_id } = params ?? {};
  const from = (page - 1) * page_size;
  const to = from + page_size - 1;

  let q = supabase
    .from("employee_shift_assignments")
    .select(
      "*, work_calendar:work_calendars!employee_shift_assignments_work_calendar_id_fkey(calendar_name), work_shift:work_shifts!employee_shift_assignments_work_shift_id_fkey(shift_name)",
      { count: "exact" }
    )
    .is("deleted_at", null)
    .order("effective_from", { ascending: false })
    .range(from, to);

  if (work_calendar_id) q = q.eq("work_calendar_id", work_calendar_id);
  if (work_shift_id) q = q.eq("work_shift_id", work_shift_id);

  const { data, error, count } = await q;
  if (error) return { success: false, error: error.message };
  return { success: true, data: { data: (data ?? []) as ShiftAssignmentRow[], count: count ?? 0 } };
}

export async function createEmployeeShiftAssignment(employeeId:number,input:unknown,contract:ChildSaveContract):Promise<ChildSaveResult>{return mutateHrChild({kind:'shift-assignment',employeeId,id:null,revision:contract?.revision,action:'create',values:input},contract);}

export async function updateEmployeeShiftAssignment(id:number,input:unknown,contract:ChildSaveContract):Promise<ChildSaveResult>{return mutateOriginalTime('shift-assignment',id,'update',input,contract);}

export async function archiveEmployeeShiftAssignment(id:number,contract:ChildSaveContract):Promise<ChildSaveResult>{return mutateOriginalTime('shift-assignment',id,'archive',{},contract);}

// ── Leave Requests ─────────────────────────────────────────────────────────────

export async function listEmployeeLeaveRequests(
  employeeId: number,
  params?: { page?: number; page_size?: number; approval_status?: string; date_from?: string; date_to?: string }
): Promise<ActionResult<{ data: LeaveRequestRow[]; count: number }>> {
  const ctx = await getAuthContext();
  if (!canViewLeave(ctx)) return { success: false, error: "Permission denied: hr.leave.view required" };

  const emp = await getEmployeeCtxRls(employeeId);
  if (!emp) return { success: false, error: "Employee not found or access denied" };

  const admin = await createClient();
  const { page = 1, page_size = 50, approval_status, date_from, date_to } = params ?? {};
  const from = (page - 1) * page_size;
  const to = from + page_size - 1;

  let q = admin
    .from("employee_leave_requests")
    .select(LEAVE_REQUEST_LIST_SELECT, { count: "exact" })
    .eq("employee_id", employeeId)
    .is("deleted_at", null)
    .order("start_date", { ascending: false })
    .range(from, to);

  if (approval_status) q = q.eq("approval_status", approval_status);
  if (date_from) q = q.gte("start_date", date_from);
  if (date_to) q = q.lte("end_date", date_to);

  const { data, error, count } = await q;
  if (error) return { success: false, error: error.message };
  return { success: true, data: { data: (data ?? []) as LeaveRequestRow[], count: count ?? 0 } };
}

export async function listLeaveRequests(params?: {
  page?: number;
  page_size?: number;
  approval_status?: string;
  date_from?: string;
  date_to?: string;
  employee_id?: number;
}): Promise<ActionResult<{ data: LeaveRequestRow[]; count: number }>> {
  const ctx = await getAuthContext();
  if (!canViewLeave(ctx)) return { success: false, error: "Permission denied: hr.leave.view required" };

  const admin = await createClient();
  const { page = 1, page_size = 50, approval_status, date_from, date_to, employee_id } = params ?? {};
  const from = (page - 1) * page_size;
  const to = from + page_size - 1;

  let q = admin
    .from("employee_leave_requests")
    .select(LEAVE_REQUEST_LIST_SELECT, { count: "exact" })
    .is("deleted_at", null)
    .order("start_date", { ascending: false })
    .range(from, to);

  if (employee_id) {
    const emp = await getEmployeeCtxRls(employee_id);
    if (!emp) return { success: false, error: "Employee not found or access denied" };
    q = q.eq("employee_id", employee_id);
  } else {
    const accessibleIds = await getAccessibleEmployeeIdsForLeave(ctx);
    if (accessibleIds !== null) {
      if (accessibleIds.length === 0) {
        return { success: true, data: { data: [], count: 0 } };
      }
      q = q.in("employee_id", accessibleIds);
    }
  }

  if (approval_status) q = q.eq("approval_status", approval_status);
  if (date_from) q = q.gte("start_date", date_from);
  if (date_to) q = q.lte("end_date", date_to);

  const { data, error, count } = await q;
  if (error) return { success: false, error: error.message };
  return { success: true, data: { data: (data ?? []) as LeaveRequestRow[], count: count ?? 0 } };
}

export async function createLeaveRequest(employeeId:number,input:unknown,contract:ChildSaveContract):Promise<ChildSaveResult>{return mutateHrChild({kind:'leave-request',employeeId,id:null,revision:contract?.revision,action:'create',values:input},contract);}

export async function approveLeaveRequest(id:number,contract:ChildSaveContract):Promise<ChildSaveResult>{return mutateOriginalTime('leave-request',id,'approve',{},contract);}

export async function rejectLeaveRequest(id:number,reason:string,contract:ChildSaveContract):Promise<ChildSaveResult>{return mutateOriginalTime('leave-request',id,'reject',{reason},contract);}

export async function cancelLeaveRequest(id:number,reason:string,contract:ChildSaveContract):Promise<ChildSaveResult>{return mutateOriginalTime('leave-request',id,'cancel',{reason},contract);}

export async function archiveLeaveRequest(id:number,contract:ChildSaveContract):Promise<ChildSaveResult>{return mutateOriginalTime('leave-request',id,'archive',{},contract);}

// ── Leave Balances ─────────────────────────────────────────────────────────────

export type ActiveLeaveTypeOption = { id: number; name_en: string; code: string };

/** Active leave types for employee leave request / balance forms (RLS: hr.leave.view). */
export async function listActiveLeaveTypesForForm(): Promise<
  ActionResult<{ data: ActiveLeaveTypeOption[] }>
> {
  const ctx = await getAuthContext();
  if (
    !hasPermission(ctx, "hr.leave.view") &&
    !hasPermission(ctx, "hr.leave.manage") &&
    !hasPermission(ctx, "hr.admin")
  ) {
    return { success: false, error: "Permission denied" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_leave_types")
    .select("id, name_en, code")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("name_en", { ascending: true });

  if (error) return { success: false, error: error.message };
  return { success: true, data: { data: (data ?? []) as ActiveLeaveTypeOption[] } };
}

export async function listEmployeeLeaveBalances(
  employeeId: number,
  year?: number
): Promise<ActionResult<{ data: LeaveBalanceRow[] }>> {
  const ctx = await getAuthContext();
  if (!canViewLeave(ctx)) return { success: false, error: "Permission denied: hr.leave.view required" };

  const emp = await getEmployeeCtxRls(employeeId);
  if (!emp) return { success: false, error: "Employee not found or access denied" };

  const admin = await createClient();
  let q = admin
    .from("employee_leave_balances")
    .select("*, leave_type:hr_leave_types!employee_leave_balances_leave_type_id_fkey(name_en,code)")
    .eq("employee_id", employeeId)
    .order("leave_year", { ascending: false })
    .order("leave_type_id");

  if (year) q = q.eq("leave_year", year);

  const { data, error } = await q;
  if (error) return { success: false, error: error.message };
  return { success: true, data: { data: (data ?? []) as LeaveBalanceRow[] } };
}

export async function createOrUpdateLeaveBalance(employeeId:number,input:unknown,contract:ChildSaveContract,originalId:number|null):Promise<ChildSaveResult>{return mutateHrChild({kind:'leave-balance',employeeId,id:originalId,revision:contract?.revision,action:originalId===null?'create':'update',values:input},contract);}

export async function recalculateEmployeeLeaveBalance(id:number,fingerprint:string,contract:ChildSaveContract):Promise<ChildSaveResult>{return mutateOriginalTime('leave-balance',id,'recalculate',{fingerprint},contract);}

// ── Overtime Records ───────────────────────────────────────────────────────────

export async function listEmployeeOvertimeRecords(
  employeeId: number,
  params?: { page?: number; page_size?: number; approval_status?: string; date_from?: string; date_to?: string }
): Promise<ActionResult<{ data: OvertimeRecordRow[]; count: number }>> {
  const supabase = await createClient();
  const { page = 1, page_size = 50, approval_status, date_from, date_to } = params ?? {};
  const from = (page - 1) * page_size;
  const to = from + page_size - 1;

  let q = supabase
    .from("employee_overtime_records")
    .select(
      "*, approver:user_profiles!employee_overtime_records_approved_by_fkey(display_name)",
      { count: "exact" }
    )
    .eq("employee_id", employeeId)
    .is("deleted_at", null)
    .order("overtime_date", { ascending: false })
    .range(from, to);

  if (approval_status) q = q.eq("approval_status", approval_status);
  if (date_from) q = q.gte("overtime_date", date_from);
  if (date_to) q = q.lte("overtime_date", date_to);

  const { data, error, count } = await q;
  if (error) return { success: false, error: error.message };
  return { success: true, data: { data: (data ?? []) as OvertimeRecordRow[], count: count ?? 0 } };
}

export async function createOvertimeRecord(employeeId:number,input:unknown,contract:ChildSaveContract):Promise<ChildSaveResult>{return mutateHrChild({kind:'overtime',employeeId,id:null,revision:contract?.revision,action:'create',values:input},contract);}

export async function updateOvertimeRecord(id:number,input:unknown,contract:ChildSaveContract):Promise<ChildSaveResult>{return mutateOriginalTime('overtime',id,'update',input,contract);}

export async function approveOvertimeRecord(id:number,contract:ChildSaveContract):Promise<ChildSaveResult>{return mutateOriginalTime('overtime',id,'approve',{},contract);}

export async function rejectOvertimeRecord(id:number,reason:string,contract:ChildSaveContract):Promise<ChildSaveResult>{return mutateOriginalTime('overtime',id,'reject',{reason},contract);}

export async function archiveOvertimeRecord(id:number,contract:ChildSaveContract):Promise<ChildSaveResult>{return mutateOriginalTime('overtime',id,'archive',{},contract);}

// ── Time Summary ───────────────────────────────────────────────────────────────

export async function getEmployeeTimeSummary(
  employeeId: number
): Promise<ActionResult<EmployeeTimeSummary>> {
  const supabase = await createClient();
  const ctx=await getAuthContext();
  if(!ctx.profile||!ctx.isAccountActive||ctx.profile.must_change_password||!canViewLeave(ctx)||!hasPermission(ctx,'hr.attendance.view')||!timeEmployeeId.safeParse(employeeId).success||!await getEmployeeCtxRls(employeeId))return{success:false,error:'Current employee and time/leave access required.'};
  const today = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const monthStart = today.slice(0,7)+'-01';
  const currentYear = Number(today.slice(0,4));

  const [shiftRes, attRes, balRes, leaveRes, otRes] = await Promise.all([
    supabase
      .from("employee_shift_assignments")
      .select("*, work_calendar:work_calendars!employee_shift_assignments_work_calendar_id_fkey(calendar_name), work_shift:work_shifts!employee_shift_assignments_work_shift_id_fkey(shift_name)")
      .eq("employee_id", employeeId)
      .is("deleted_at", null)
      .lte("effective_from", today)
      .or(`effective_to.is.null,effective_to.gte.${today}`)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from("employee_attendance_daily_summary")
      .select("id", { count: "exact" })
      .eq("employee_id", employeeId)
      .gte("attendance_date", monthStart)
      .lte("attendance_date", today),

    supabase
      .from("employee_leave_balances")
      .select("*, leave_type:hr_leave_types!employee_leave_balances_leave_type_id_fkey(name_en,code)")
      .eq("employee_id", employeeId)
      .eq("leave_year", currentYear),

    supabase
      .from("employee_leave_requests")
      .select("id", { count: "exact" })
      .eq("employee_id", employeeId)
      .eq("approval_status", "pending")
      .is("deleted_at", null),

    supabase
      .from("employee_overtime_records")
      .select("hours")
      .eq("employee_id", employeeId)
      .eq("approval_status", "approved")
      .is("deleted_at", null)
      .gte("overtime_date", monthStart)
      .lte("overtime_date", today),
  ]);

  if([shiftRes,attRes,balRes,leaveRes,otRes].some(result=>result.error))return{success:false,error:'Current time dependencies are unavailable; no zero balances or counts are assumed.'};
  const overtimeHours = (otRes.data ?? []).reduce((sum, r) => sum + Number(r.hours ?? 0), 0);

  return {
    success: true,
    data: {
      currentShiftAssignment: (shiftRes.data as ShiftAssignmentRow | null) ?? null,
      attendanceThisMonthCount: attRes.count ?? 0,
      leaveBalances: (balRes.data ?? []) as LeaveBalanceRow[],
      pendingLeaveCount: leaveRes.count ?? 0,
      overtimeHoursThisMonth: overtimeHours,
    },
  };
}

// ── Lookup Helpers (for time tab comboboxes) ───────────────────────────────────

export type WorkShiftOption = { id: number; shift_name: string; shift_code: string; calendar_id: number };

export async function listWorkShiftsForTimeTab(
  calendarId?: number
): Promise<ActionResult<WorkShiftOption[]>> {
  const supabase = await createClient();
  let q = supabase
    .from("work_shifts")
    .select("id, shift_name, shift_code, calendar_id")
    .is("deleted_at", null)
    .eq("is_active", true)
    .order("shift_name")
    .limit(100);

  if (calendarId) q = q.eq("calendar_id", calendarId);

  const { data, error } = await q;
  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as WorkShiftOption[] };
}
