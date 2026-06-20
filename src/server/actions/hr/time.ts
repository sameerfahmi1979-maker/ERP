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
 *   - All reads use createClient() (RLS enforced: hr.attendance.view / hr.leave.view)
 *   - All writes use createAdminClient() + explicit hasPermission + employee-access check
 *   - No payroll/WPS/AI implementation
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { z } from "zod";
import { calculateLeaveDays } from "@/lib/hr/time/date-utils";

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
  approver?: { full_name_en: string } | null;
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
  corrector?: { full_name_en: string } | null;
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
  leave_type?: { leave_type_name: string; leave_type_code: string } | null;
  approver?: { full_name_en: string } | null;
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
  leave_type?: { leave_type_name: string; leave_type_code: string } | null;
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
  approver?: { full_name_en: string } | null;
};

export type EmployeeTimeSummary = {
  currentShiftAssignment: ShiftAssignmentRow | null;
  attendanceThisMonthCount: number;
  leaveBalances: LeaveBalanceRow[];
  pendingLeaveCount: number;
  overtimeHoursThisMonth: number;
};

// ── Zod Schemas ────────────────────────────────────────────────────────────────

const attendancePunchCreateSchema = z.object({
  punch_datetime: z.string().min(1, "Punch datetime is required"),
  punch_type: z.enum(["in", "out", "break_start", "break_end"]),
  work_site_id: z.number().int().positive().nullable().optional(),
  punch_source: z.enum(["biometric", "mobile", "manual", "import"]).optional(),
  device_reference: z.string().max(100).nullable().optional(),
  external_reference: z.string().max(100).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

const attendanceDailySummaryUpsertSchema = z.object({
  attendance_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  attendance_type: z.enum(["site", "office", "yard", "workshop", "remote", "on_leave", "absent", "holiday"]),
  work_site_id: z.number().int().positive().nullable().optional(),
  first_in_at: z.string().nullable().optional(),
  last_out_at: z.string().nullable().optional(),
  total_hours: z.number().min(0).max(24).nullable().optional(),
  overtime_hours: z.number().min(0).max(24).default(0),
  late_minutes: z.number().int().min(0).default(0),
  early_out_minutes: z.number().int().min(0).default(0),
  is_missing_punch: z.boolean().default(false),
  notes: z.string().max(500).nullable().optional(),
});

const attendanceCorrectionSchema = z.object({
  correction_reason: z.string().min(1, "Correction reason is required").max(500),
  attendance_type: z.enum(["site", "office", "yard", "workshop", "remote", "on_leave", "absent", "holiday"]).optional(),
  work_site_id: z.number().int().positive().nullable().optional(),
  first_in_at: z.string().nullable().optional(),
  last_out_at: z.string().nullable().optional(),
  total_hours: z.number().min(0).max(24).nullable().optional(),
  overtime_hours: z.number().min(0).max(24).optional(),
  late_minutes: z.number().int().min(0).optional(),
  early_out_minutes: z.number().int().min(0).optional(),
  is_missing_punch: z.boolean().optional(),
  notes: z.string().max(500).nullable().optional(),
});

const shiftAssignmentCreateSchema = z.object({
  work_calendar_id: z.number().int().positive().nullable().optional(),
  work_shift_id: z.number().int().positive().nullable().optional(),
  weekly_off_day: z.string().max(50).nullable().optional(),
  overtime_eligible: z.boolean().default(false),
  attendance_required: z.boolean().default(true),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  effective_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

const shiftAssignmentUpdateSchema = shiftAssignmentCreateSchema.partial();

const leaveRequestBaseSchema = z.object({
  leave_type_id: z.number().int().positive(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().max(1000).nullable().optional(),
  sick_cert_dms_id: z.number().int().positive().nullable().optional(),
  return_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

const leaveRequestCreateSchema = leaveRequestBaseSchema.refine(
  (d) => new Date(d.start_date) <= new Date(d.end_date),
  { message: "Start date must be on or before end date", path: ["end_date"] }
);

const leaveRequestUpdateSchema = leaveRequestBaseSchema.partial();

const leaveDecisionSchema = z.object({
  reason: z.string().max(500).nullable().optional(),
});

const leaveBalanceUpsertSchema = z.object({
  leave_type_id: z.number().int().positive(),
  leave_year: z.number().int().min(2000).max(2100),
  entitled_days: z.number().min(0).max(365),
  used_days: z.number().min(0).max(365).default(0),
  carry_forward: z.number().min(0).max(365).default(0),
});

const overtimeCreateSchema = z.object({
  overtime_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hours: z.number().min(0).max(24),
  reason: z.string().max(500).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

const overtimeUpdateSchema = overtimeCreateSchema.partial();

const overtimeDecisionSchema = z.object({
  reason: z.string().max(500).nullable().optional(),
});

// ── Internal Helpers ───────────────────────────────────────────────────────────

async function getEmployeeCtx(
  employeeId: number,
  admin: ReturnType<typeof createAdminClient>
): Promise<{ employee_code: string; full_name_en: string; owner_company_id: number } | null> {
  const { data } = await admin
    .from("employees")
    .select("employee_code, full_name_en, owner_company_id")
    .eq("id", employeeId)
    .single();
  return data ?? null;
}

function empRevalidate(employeeId: number) {
  revalidatePath(`/admin/hr/employees/record/${employeeId}`);
  revalidatePath("/admin/hr/time/attendance");
  revalidatePath("/admin/hr/time/leave");
  revalidatePath("/admin/hr/time/shifts");
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

export async function createEmployeeAttendancePunch(
  employeeId: number,
  input: unknown
): Promise<ActionResult<{ id: number }>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.attendance.manage"))
    return { success: false, error: "Permission denied: hr.attendance.manage required" };

  const parsed = attendancePunchCreateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

  const admin = createAdminClient();
  const emp = await getEmployeeCtx(employeeId, admin);
  if (!emp) return { success: false, error: "Employee not found" };

  const { data, error } = await admin
    .from("employee_attendance_punches")
    .insert({ employee_id: employeeId, ...parsed.data, created_by: ctx.profile?.id })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };

  await logAudit({
    module_code: "HR",
    entity_name: "employee_attendance_punches",
    entity_id: data.id,
    entity_reference: `${emp.employee_code}-PUNCH-${data.id}`,
    action: "create",
    new_values: { ...parsed.data, parent_employee_id: employeeId, employee_code: emp.employee_code, employee_name: emp.full_name_en, related_record_type: "attendance_punch" },
    owner_company_id: emp.owner_company_id,
  });

  empRevalidate(employeeId);
  return { success: true, data: { id: data.id } };
}

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
      "*, work_site:work_sites!employee_attendance_daily_summary_work_site_id_fkey(site_name), approver:user_profiles!employee_attendance_daily_summary_approved_by_fkey(full_name_en)",
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
      "*, work_site:work_sites!employee_attendance_daily_summary_work_site_id_fkey(site_name), approver:user_profiles!employee_attendance_daily_summary_approved_by_fkey(full_name_en)",
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

export async function createOrUpdateAttendanceDailySummary(
  employeeId: number,
  input: unknown
): Promise<ActionResult<{ id: number }>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.attendance.manage"))
    return { success: false, error: "Permission denied: hr.attendance.manage required" };

  const parsed = attendanceDailySummaryUpsertSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

  const admin = createAdminClient();
  const emp = await getEmployeeCtx(employeeId, admin);
  if (!emp) return { success: false, error: "Employee not found" };

  const payload = {
    employee_id: employeeId,
    ...parsed.data,
    updated_by: ctx.profile?.id,
  };

  const { data, error } = await admin
    .from("employee_attendance_daily_summary")
    .upsert(payload, { onConflict: "employee_id,attendance_date" })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };

  await logAudit({
    module_code: "HR",
    entity_name: "employee_attendance_daily_summary",
    entity_id: data.id,
    entity_reference: `${emp.employee_code}-ATT-${parsed.data.attendance_date}`,
    action: "upsert",
    new_values: { parent_employee_id: employeeId, employee_code: emp.employee_code, employee_name: emp.full_name_en, related_record_type: "attendance_summary", ...parsed.data },
    owner_company_id: emp.owner_company_id,
  });

  empRevalidate(employeeId);
  return { success: true, data: { id: data.id } };
}

export async function approveAttendanceDailySummary(
  summaryId: number
): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.attendance.manage"))
    return { success: false, error: "Permission denied: hr.attendance.manage required" };

  const admin = createAdminClient();

  const { data: summary, error: fetchErr } = await admin
    .from("employee_attendance_daily_summary")
    .select("id, employee_id, attendance_date")
    .eq("id", summaryId)
    .single();

  if (fetchErr || !summary) return { success: false, error: "Attendance record not found" };

  const emp = await getEmployeeCtx(summary.employee_id, admin);
  if (!emp) return { success: false, error: "Employee not found" };

  const { error } = await admin
    .from("employee_attendance_daily_summary")
    .update({
      approval_status: "approved",
      approved_by: ctx.profile?.id,
      approved_at: new Date().toISOString(),
      updated_by: ctx.profile?.id,
    })
    .eq("id", summaryId);

  if (error) return { success: false, error: error.message };

  await logAudit({
    module_code: "HR",
    entity_name: "employee_attendance_daily_summary",
    entity_id: summaryId,
    entity_reference: `${emp.employee_code}-ATT-${summary.attendance_date}`,
    action: "approve",
    new_values: { parent_employee_id: summary.employee_id, employee_code: emp.employee_code, employee_name: emp.full_name_en, related_record_type: "attendance_summary", approval_status: "approved" },
    owner_company_id: emp.owner_company_id,
  });

  empRevalidate(summary.employee_id);
  return { success: true };
}

export async function queryAttendanceDailySummary(
  summaryId: number,
  reason: string
): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.attendance.manage"))
    return { success: false, error: "Permission denied: hr.attendance.manage required" };

  const admin = createAdminClient();

  const { data: summary, error: fetchErr } = await admin
    .from("employee_attendance_daily_summary")
    .select("id, employee_id, attendance_date")
    .eq("id", summaryId)
    .single();

  if (fetchErr || !summary) return { success: false, error: "Attendance record not found" };

  const emp = await getEmployeeCtx(summary.employee_id, admin);
  if (!emp) return { success: false, error: "Employee not found" };

  const { error } = await admin
    .from("employee_attendance_daily_summary")
    .update({
      approval_status: "queried",
      notes: reason,
      updated_by: ctx.profile?.id,
    })
    .eq("id", summaryId);

  if (error) return { success: false, error: error.message };

  await logAudit({
    module_code: "HR",
    entity_name: "employee_attendance_daily_summary",
    entity_id: summaryId,
    entity_reference: `${emp.employee_code}-ATT-${summary.attendance_date}`,
    action: "query",
    new_values: { parent_employee_id: summary.employee_id, employee_code: emp.employee_code, employee_name: emp.full_name_en, related_record_type: "attendance_summary", approval_status: "queried", reason },
    owner_company_id: emp.owner_company_id,
  });

  empRevalidate(summary.employee_id);
  return { success: true };
}

// ── Attendance Corrections (Append-Only) ──────────────────────────────────────

export async function listAttendanceCorrections(
  summaryId: number
): Promise<ActionResult<{ data: AttendanceCorrectionRow[] }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_attendance_corrections")
    .select("*, corrector:user_profiles!employee_attendance_corrections_corrected_by_fkey(full_name_en)")
    .eq("summary_id", summaryId)
    .order("created_at", { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, data: { data: (data ?? []) as AttendanceCorrectionRow[] } };
}

export async function correctAttendanceDailySummary(
  summaryId: number,
  input: unknown
): Promise<ActionResult<{ correctionId: number }>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.attendance.manage"))
    return { success: false, error: "Permission denied: hr.attendance.manage required" };

  const parsed = attendanceCorrectionSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

  const admin = createAdminClient();

  const { data: oldSummary, error: fetchErr } = await admin
    .from("employee_attendance_daily_summary")
    .select("*")
    .eq("id", summaryId)
    .single();

  if (fetchErr || !oldSummary) return { success: false, error: "Attendance record not found" };

  const emp = await getEmployeeCtx(oldSummary.employee_id, admin);
  if (!emp) return { success: false, error: "Employee not found" };

  const { correction_reason, ...updateFields } = parsed.data;
  const cleanUpdate: Record<string, unknown> = { updated_by: ctx.profile?.id };

  const allowedUpdateFields = [
    "attendance_type", "work_site_id", "first_in_at", "last_out_at",
    "total_hours", "overtime_hours", "late_minutes", "early_out_minutes",
    "is_missing_punch", "notes",
  ] as const;

  for (const key of allowedUpdateFields) {
    if (updateFields[key as keyof typeof updateFields] !== undefined) {
      cleanUpdate[key] = updateFields[key as keyof typeof updateFields];
    }
  }

  const oldValuesJson: Record<string, unknown> = {};
  for (const key of allowedUpdateFields) {
    if (key in cleanUpdate) {
      oldValuesJson[key] = oldSummary[key as keyof typeof oldSummary];
    }
  }

  const { error: updateErr } = await admin
    .from("employee_attendance_daily_summary")
    .update(cleanUpdate)
    .eq("id", summaryId);

  if (updateErr) return { success: false, error: updateErr.message };

  const { data: correctionData, error: corrErr } = await admin
    .from("employee_attendance_corrections")
    .insert({
      summary_id: summaryId,
      employee_id: oldSummary.employee_id,
      correction_reason,
      old_values_json: oldValuesJson,
      new_values_json: { ...cleanUpdate },
      corrected_by: ctx.profile?.id as number,
    })
    .select("id")
    .single();

  if (corrErr) return { success: false, error: corrErr.message };

  await logAudit({
    module_code: "HR",
    entity_name: "employee_attendance_corrections",
    entity_id: correctionData.id,
    entity_reference: `${emp.employee_code}-CORR-${correctionData.id}`,
    action: "correct",
    old_values: oldValuesJson,
    new_values: { parent_employee_id: oldSummary.employee_id, employee_code: emp.employee_code, employee_name: emp.full_name_en, related_record_type: "attendance_correction", correction_reason, ...cleanUpdate },
    owner_company_id: emp.owner_company_id,
  });

  empRevalidate(oldSummary.employee_id);
  return { success: true, data: { correctionId: correctionData.id } };
}

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

export async function createEmployeeShiftAssignment(
  employeeId: number,
  input: unknown
): Promise<ActionResult<{ id: number }>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.attendance.manage"))
    return { success: false, error: "Permission denied: hr.attendance.manage required" };

  const parsed = shiftAssignmentCreateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

  const admin = createAdminClient();
  const emp = await getEmployeeCtx(employeeId, admin);
  if (!emp) return { success: false, error: "Employee not found" };

  const { data, error } = await admin
    .from("employee_shift_assignments")
    .insert({ employee_id: employeeId, ...parsed.data, created_by: ctx.profile?.id, updated_by: ctx.profile?.id })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };

  await logAudit({
    module_code: "HR",
    entity_name: "employee_shift_assignments",
    entity_id: data.id,
    entity_reference: `${emp.employee_code}-SHIFT-${data.id}`,
    action: "create",
    new_values: { parent_employee_id: employeeId, employee_code: emp.employee_code, employee_name: emp.full_name_en, related_record_type: "shift_assignment", ...parsed.data },
    owner_company_id: emp.owner_company_id,
  });

  empRevalidate(employeeId);
  return { success: true, data: { id: data.id } };
}

export async function updateEmployeeShiftAssignment(
  id: number,
  input: unknown
): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.attendance.manage"))
    return { success: false, error: "Permission denied: hr.attendance.manage required" };

  const parsed = shiftAssignmentUpdateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

  const admin = createAdminClient();

  const { data: existing, error: fetchErr } = await admin
    .from("employee_shift_assignments")
    .select("employee_id")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (fetchErr || !existing) return { success: false, error: "Shift assignment not found" };

  const emp = await getEmployeeCtx(existing.employee_id, admin);
  if (!emp) return { success: false, error: "Employee not found" };

  const { error } = await admin
    .from("employee_shift_assignments")
    .update({ ...parsed.data, updated_by: ctx.profile?.id })
    .eq("id", id);

  if (error) return { success: false, error: error.message };

  await logAudit({
    module_code: "HR",
    entity_name: "employee_shift_assignments",
    entity_id: id,
    entity_reference: `${emp.employee_code}-SHIFT-${id}`,
    action: "update",
    new_values: { parent_employee_id: existing.employee_id, employee_code: emp.employee_code, employee_name: emp.full_name_en, related_record_type: "shift_assignment", ...parsed.data },
    owner_company_id: emp.owner_company_id,
  });

  empRevalidate(existing.employee_id);
  return { success: true };
}

export async function archiveEmployeeShiftAssignment(id: number): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.attendance.manage"))
    return { success: false, error: "Permission denied: hr.attendance.manage required" };

  const admin = createAdminClient();

  const { data: existing, error: fetchErr } = await admin
    .from("employee_shift_assignments")
    .select("employee_id")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (fetchErr || !existing) return { success: false, error: "Shift assignment not found" };

  const emp = await getEmployeeCtx(existing.employee_id, admin);
  if (!emp) return { success: false, error: "Employee not found" };

  const { error } = await admin
    .from("employee_shift_assignments")
    .update({ deleted_at: new Date().toISOString(), deleted_by: ctx.profile?.id })
    .eq("id", id);

  if (error) return { success: false, error: error.message };

  await logAudit({
    module_code: "HR",
    entity_name: "employee_shift_assignments",
    entity_id: id,
    entity_reference: `${emp.employee_code}-SHIFT-${id}`,
    action: "archive",
    new_values: { parent_employee_id: existing.employee_id, employee_code: emp.employee_code, employee_name: emp.full_name_en, related_record_type: "shift_assignment" },
    owner_company_id: emp.owner_company_id,
  });

  empRevalidate(existing.employee_id);
  return { success: true };
}

// ── Leave Requests ─────────────────────────────────────────────────────────────

export async function listEmployeeLeaveRequests(
  employeeId: number,
  params?: { page?: number; page_size?: number; approval_status?: string; date_from?: string; date_to?: string }
): Promise<ActionResult<{ data: LeaveRequestRow[]; count: number }>> {
  const supabase = await createClient();
  const { page = 1, page_size = 50, approval_status, date_from, date_to } = params ?? {};
  const from = (page - 1) * page_size;
  const to = from + page_size - 1;

  let q = supabase
    .from("employee_leave_requests")
    .select(
      "*, leave_type:hr_leave_types!employee_leave_requests_leave_type_id_fkey(leave_type_name,leave_type_code), approver:user_profiles!employee_leave_requests_approved_by_fkey(full_name_en)",
      { count: "exact" }
    )
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
  const supabase = await createClient();
  const { page = 1, page_size = 50, approval_status, date_from, date_to, employee_id } = params ?? {};
  const from = (page - 1) * page_size;
  const to = from + page_size - 1;

  let q = supabase
    .from("employee_leave_requests")
    .select(
      "*, leave_type:hr_leave_types!employee_leave_requests_leave_type_id_fkey(leave_type_name,leave_type_code), approver:user_profiles!employee_leave_requests_approved_by_fkey(full_name_en)",
      { count: "exact" }
    )
    .is("deleted_at", null)
    .order("start_date", { ascending: false })
    .range(from, to);

  if (approval_status) q = q.eq("approval_status", approval_status);
  if (date_from) q = q.gte("start_date", date_from);
  if (date_to) q = q.lte("end_date", date_to);
  if (employee_id) q = q.eq("employee_id", employee_id);

  const { data, error, count } = await q;
  if (error) return { success: false, error: error.message };
  return { success: true, data: { data: (data ?? []) as LeaveRequestRow[], count: count ?? 0 } };
}

export async function createLeaveRequest(
  employeeId: number,
  input: unknown
): Promise<ActionResult<{ id: number }>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.leave.manage"))
    return { success: false, error: "Permission denied: hr.leave.manage required" };

  const parsed = leaveRequestCreateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

  const admin = createAdminClient();
  const emp = await getEmployeeCtx(employeeId, admin);
  if (!emp) return { success: false, error: "Employee not found" };

  const totalDays = calculateLeaveDays(parsed.data.start_date, parsed.data.end_date);

  const { data, error } = await admin
    .from("employee_leave_requests")
    .insert({
      employee_id: employeeId,
      ...parsed.data,
      total_days: totalDays,
      approval_status: "pending",
      created_by: ctx.profile?.id,
      updated_by: ctx.profile?.id,
    })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };

  await logAudit({
    module_code: "HR",
    entity_name: "employee_leave_requests",
    entity_id: data.id,
    entity_reference: `${emp.employee_code}-LEAVE-${data.id}`,
    action: "create",
    new_values: { parent_employee_id: employeeId, employee_code: emp.employee_code, employee_name: emp.full_name_en, related_record_type: "leave_request", ...parsed.data, total_days: totalDays },
    owner_company_id: emp.owner_company_id,
  });

  revalidatePath(`/admin/hr/employees/record/${employeeId}`);
  revalidatePath("/admin/hr/time/leave");
  return { success: true, data: { id: data.id } };
}

export async function approveLeaveRequest(id: number): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.leave.manage"))
    return { success: false, error: "Permission denied: hr.leave.manage required" };

  const admin = createAdminClient();

  const { data: req, error: fetchErr } = await admin
    .from("employee_leave_requests")
    .select("id, employee_id, leave_type_id, total_days, approval_status, start_date")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (fetchErr || !req) return { success: false, error: "Leave request not found" };
  if (req.approval_status !== "pending")
    return { success: false, error: `Cannot approve leave in '${req.approval_status}' status` };

  const emp = await getEmployeeCtx(req.employee_id, admin);
  if (!emp) return { success: false, error: "Employee not found" };

  const { error } = await admin
    .from("employee_leave_requests")
    .update({
      approval_status: "approved",
      approved_by: ctx.profile?.id,
      approved_at: new Date().toISOString(),
      updated_by: ctx.profile?.id,
    })
    .eq("id", id);

  if (error) return { success: false, error: error.message };

  if (req.total_days && req.total_days > 0) {
    const leaveYear = new Date(req.start_date).getFullYear();
    const { data: balance } = await admin
      .from("employee_leave_balances")
      .select("id, used_days")
      .eq("employee_id", req.employee_id)
      .eq("leave_type_id", req.leave_type_id)
      .eq("leave_year", leaveYear)
      .single();

    if (balance) {
      await admin
        .from("employee_leave_balances")
        .update({
          used_days: Number(balance.used_days) + Number(req.total_days),
          updated_by: ctx.profile?.id,
        })
        .eq("id", balance.id);
    }
  }

  await logAudit({
    module_code: "HR",
    entity_name: "employee_leave_requests",
    entity_id: id,
    entity_reference: `${emp.employee_code}-LEAVE-${id}`,
    action: "approve",
    new_values: { parent_employee_id: req.employee_id, employee_code: emp.employee_code, employee_name: emp.full_name_en, related_record_type: "leave_request", approval_status: "approved" },
    owner_company_id: emp.owner_company_id,
  });

  revalidatePath(`/admin/hr/employees/record/${req.employee_id}`);
  revalidatePath("/admin/hr/time/leave");
  return { success: true };
}

export async function rejectLeaveRequest(id: number, reason?: string): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.leave.manage"))
    return { success: false, error: "Permission denied: hr.leave.manage required" };

  const admin = createAdminClient();

  const { data: req, error: fetchErr } = await admin
    .from("employee_leave_requests")
    .select("id, employee_id, approval_status")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (fetchErr || !req) return { success: false, error: "Leave request not found" };
  if (req.approval_status !== "pending")
    return { success: false, error: `Cannot reject leave in '${req.approval_status}' status` };

  const emp = await getEmployeeCtx(req.employee_id, admin);
  if (!emp) return { success: false, error: "Employee not found" };

  const { error } = await admin
    .from("employee_leave_requests")
    .update({
      approval_status: "rejected",
      rejected_by: ctx.profile?.id,
      rejected_at: new Date().toISOString(),
      notes: reason ?? null,
      updated_by: ctx.profile?.id,
    })
    .eq("id", id);

  if (error) return { success: false, error: error.message };

  await logAudit({
    module_code: "HR",
    entity_name: "employee_leave_requests",
    entity_id: id,
    entity_reference: `${emp.employee_code}-LEAVE-${id}`,
    action: "reject",
    new_values: { parent_employee_id: req.employee_id, employee_code: emp.employee_code, employee_name: emp.full_name_en, related_record_type: "leave_request", approval_status: "rejected", reason },
    owner_company_id: emp.owner_company_id,
  });

  revalidatePath(`/admin/hr/employees/record/${req.employee_id}`);
  revalidatePath("/admin/hr/time/leave");
  return { success: true };
}

export async function cancelLeaveRequest(id: number, reason?: string): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.leave.manage"))
    return { success: false, error: "Permission denied: hr.leave.manage required" };

  const admin = createAdminClient();

  const { data: req, error: fetchErr } = await admin
    .from("employee_leave_requests")
    .select("id, employee_id, approval_status")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (fetchErr || !req) return { success: false, error: "Leave request not found" };

  if (!["pending", "approved"].includes(req.approval_status))
    return { success: false, error: `Cannot cancel leave in '${req.approval_status}' status` };

  const emp = await getEmployeeCtx(req.employee_id, admin);
  if (!emp) return { success: false, error: "Employee not found" };

  if (req.approval_status === "approved") {
    // HR.4 limitation: cancelling an approved leave does not reverse used_days.
    // Balance reversal must be done manually via updateLeaveBalance.
  }

  const { error } = await admin
    .from("employee_leave_requests")
    .update({
      approval_status: "cancelled",
      cancelled_by: ctx.profile?.id,
      cancelled_at: new Date().toISOString(),
      notes: reason ?? null,
      updated_by: ctx.profile?.id,
    })
    .eq("id", id);

  if (error) return { success: false, error: error.message };

  await logAudit({
    module_code: "HR",
    entity_name: "employee_leave_requests",
    entity_id: id,
    entity_reference: `${emp.employee_code}-LEAVE-${id}`,
    action: "cancel",
    new_values: { parent_employee_id: req.employee_id, employee_code: emp.employee_code, employee_name: emp.full_name_en, related_record_type: "leave_request", approval_status: "cancelled", reason },
    owner_company_id: emp.owner_company_id,
  });

  revalidatePath(`/admin/hr/employees/record/${req.employee_id}`);
  revalidatePath("/admin/hr/time/leave");
  return { success: true };
}

export async function archiveLeaveRequest(id: number): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.leave.manage"))
    return { success: false, error: "Permission denied: hr.leave.manage required" };

  const admin = createAdminClient();

  const { data: req, error: fetchErr } = await admin
    .from("employee_leave_requests")
    .select("id, employee_id")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (fetchErr || !req) return { success: false, error: "Leave request not found" };

  const { error } = await admin
    .from("employee_leave_requests")
    .update({ deleted_at: new Date().toISOString(), deleted_by: ctx.profile?.id })
    .eq("id", id);

  if (error) return { success: false, error: error.message };

  revalidatePath(`/admin/hr/employees/record/${req.employee_id}`);
  revalidatePath("/admin/hr/time/leave");
  return { success: true };
}

// ── Leave Balances ─────────────────────────────────────────────────────────────

export async function listEmployeeLeaveBalances(
  employeeId: number,
  year?: number
): Promise<ActionResult<{ data: LeaveBalanceRow[] }>> {
  const supabase = await createClient();
  let q = supabase
    .from("employee_leave_balances")
    .select("*, leave_type:hr_leave_types!employee_leave_balances_leave_type_id_fkey(leave_type_name,leave_type_code)")
    .eq("employee_id", employeeId)
    .order("leave_year", { ascending: false })
    .order("leave_type_id");

  if (year) q = q.eq("leave_year", year);

  const { data, error } = await q;
  if (error) return { success: false, error: error.message };
  return { success: true, data: { data: (data ?? []) as LeaveBalanceRow[] } };
}

export async function createOrUpdateLeaveBalance(
  employeeId: number,
  input: unknown
): Promise<ActionResult<{ id: number }>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.leave.manage"))
    return { success: false, error: "Permission denied: hr.leave.manage required" };

  const parsed = leaveBalanceUpsertSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

  const admin = createAdminClient();
  const emp = await getEmployeeCtx(employeeId, admin);
  if (!emp) return { success: false, error: "Employee not found" };

  const { data, error } = await admin
    .from("employee_leave_balances")
    .upsert(
      {
        employee_id: employeeId,
        leave_type_id: parsed.data.leave_type_id,
        leave_year: parsed.data.leave_year,
        entitled_days: parsed.data.entitled_days,
        used_days: parsed.data.used_days,
        carry_forward: parsed.data.carry_forward,
        updated_by: ctx.profile?.id,
      },
      { onConflict: "employee_id,leave_type_id,leave_year" }
    )
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };

  await logAudit({
    module_code: "HR",
    entity_name: "employee_leave_balances",
    entity_id: data.id,
    entity_reference: `${emp.employee_code}-BAL-${data.id}`,
    action: "upsert",
    new_values: { parent_employee_id: employeeId, employee_code: emp.employee_code, employee_name: emp.full_name_en, related_record_type: "leave_balance", ...parsed.data },
    owner_company_id: emp.owner_company_id,
  });

  revalidatePath(`/admin/hr/employees/record/${employeeId}`);
  return { success: true, data: { id: data.id } };
}

export async function recalculateEmployeeLeaveBalance(
  employeeId: number,
  leaveTypeId: number,
  year: number
): Promise<ActionResult<{ used_days: number }>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.leave.manage"))
    return { success: false, error: "Permission denied: hr.leave.manage required" };

  const admin = createAdminClient();

  const { data: approvedLeaves, error: fetchErr } = await admin
    .from("employee_leave_requests")
    .select("total_days, start_date")
    .eq("employee_id", employeeId)
    .eq("leave_type_id", leaveTypeId)
    .eq("approval_status", "approved")
    .is("deleted_at", null);

  if (fetchErr) return { success: false, error: fetchErr.message };

  const usedDays = (approvedLeaves ?? [])
    .filter((r) => new Date(r.start_date).getFullYear() === year)
    .reduce((sum, r) => sum + Number(r.total_days ?? 0), 0);

  const { error } = await admin
    .from("employee_leave_balances")
    .update({ used_days: usedDays, updated_by: ctx.profile?.id })
    .eq("employee_id", employeeId)
    .eq("leave_type_id", leaveTypeId)
    .eq("leave_year", year);

  if (error) return { success: false, error: error.message };

  revalidatePath(`/admin/hr/employees/record/${employeeId}`);
  return { success: true, data: { used_days: usedDays } };
}

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
      "*, approver:user_profiles!employee_overtime_records_approved_by_fkey(full_name_en)",
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

export async function createOvertimeRecord(
  employeeId: number,
  input: unknown
): Promise<ActionResult<{ id: number }>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.attendance.manage"))
    return { success: false, error: "Permission denied: hr.attendance.manage required" };

  const parsed = overtimeCreateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

  const admin = createAdminClient();
  const emp = await getEmployeeCtx(employeeId, admin);
  if (!emp) return { success: false, error: "Employee not found" };

  const { data, error } = await admin
    .from("employee_overtime_records")
    .insert({ employee_id: employeeId, ...parsed.data, created_by: ctx.profile?.id, updated_by: ctx.profile?.id })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };

  await logAudit({
    module_code: "HR",
    entity_name: "employee_overtime_records",
    entity_id: data.id,
    entity_reference: `${emp.employee_code}-OT-${data.id}`,
    action: "create",
    new_values: { parent_employee_id: employeeId, employee_code: emp.employee_code, employee_name: emp.full_name_en, related_record_type: "overtime", ...parsed.data },
    owner_company_id: emp.owner_company_id,
  });

  empRevalidate(employeeId);
  return { success: true, data: { id: data.id } };
}

export async function updateOvertimeRecord(id: number, input: unknown): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.attendance.manage"))
    return { success: false, error: "Permission denied: hr.attendance.manage required" };

  const parsed = overtimeUpdateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

  const admin = createAdminClient();

  const { data: existing, error: fetchErr } = await admin
    .from("employee_overtime_records")
    .select("employee_id, approval_status")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (fetchErr || !existing) return { success: false, error: "Overtime record not found" };
  if (existing.approval_status !== "pending")
    return { success: false, error: "Only pending overtime records can be edited" };

  const emp = await getEmployeeCtx(existing.employee_id, admin);
  if (!emp) return { success: false, error: "Employee not found" };

  const { error } = await admin
    .from("employee_overtime_records")
    .update({ ...parsed.data, updated_by: ctx.profile?.id })
    .eq("id", id);

  if (error) return { success: false, error: error.message };

  await logAudit({
    module_code: "HR",
    entity_name: "employee_overtime_records",
    entity_id: id,
    entity_reference: `${emp.employee_code}-OT-${id}`,
    action: "update",
    new_values: { parent_employee_id: existing.employee_id, employee_code: emp.employee_code, employee_name: emp.full_name_en, related_record_type: "overtime", ...parsed.data },
    owner_company_id: emp.owner_company_id,
  });

  empRevalidate(existing.employee_id);
  return { success: true };
}

export async function approveOvertimeRecord(id: number): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.attendance.manage"))
    return { success: false, error: "Permission denied: hr.attendance.manage required" };

  const admin = createAdminClient();

  const { data: existing, error: fetchErr } = await admin
    .from("employee_overtime_records")
    .select("employee_id, approval_status, overtime_date")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (fetchErr || !existing) return { success: false, error: "Overtime record not found" };
  if (existing.approval_status !== "pending")
    return { success: false, error: `Cannot approve overtime in '${existing.approval_status}' status` };

  const emp = await getEmployeeCtx(existing.employee_id, admin);
  if (!emp) return { success: false, error: "Employee not found" };

  const { error } = await admin
    .from("employee_overtime_records")
    .update({
      approval_status: "approved",
      approved_by: ctx.profile?.id,
      approved_at: new Date().toISOString(),
      updated_by: ctx.profile?.id,
    })
    .eq("id", id);

  if (error) return { success: false, error: error.message };

  await logAudit({
    module_code: "HR",
    entity_name: "employee_overtime_records",
    entity_id: id,
    entity_reference: `${emp.employee_code}-OT-${id}`,
    action: "approve",
    new_values: { parent_employee_id: existing.employee_id, employee_code: emp.employee_code, employee_name: emp.full_name_en, related_record_type: "overtime", approval_status: "approved" },
    owner_company_id: emp.owner_company_id,
  });

  empRevalidate(existing.employee_id);
  return { success: true };
}

export async function rejectOvertimeRecord(id: number, reason?: string): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.attendance.manage"))
    return { success: false, error: "Permission denied: hr.attendance.manage required" };

  const admin = createAdminClient();

  const { data: existing, error: fetchErr } = await admin
    .from("employee_overtime_records")
    .select("employee_id, approval_status")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (fetchErr || !existing) return { success: false, error: "Overtime record not found" };
  if (existing.approval_status !== "pending")
    return { success: false, error: `Cannot reject overtime in '${existing.approval_status}' status` };

  const emp = await getEmployeeCtx(existing.employee_id, admin);
  if (!emp) return { success: false, error: "Employee not found" };

  const { error } = await admin
    .from("employee_overtime_records")
    .update({
      approval_status: "rejected",
      notes: reason ?? null,
      updated_by: ctx.profile?.id,
    })
    .eq("id", id);

  if (error) return { success: false, error: error.message };

  await logAudit({
    module_code: "HR",
    entity_name: "employee_overtime_records",
    entity_id: id,
    entity_reference: `${emp.employee_code}-OT-${id}`,
    action: "reject",
    new_values: { parent_employee_id: existing.employee_id, employee_code: emp.employee_code, employee_name: emp.full_name_en, related_record_type: "overtime", approval_status: "rejected", reason },
    owner_company_id: emp.owner_company_id,
  });

  empRevalidate(existing.employee_id);
  return { success: true };
}

export async function archiveOvertimeRecord(id: number): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.attendance.manage"))
    return { success: false, error: "Permission denied: hr.attendance.manage required" };

  const admin = createAdminClient();

  const { data: existing, error: fetchErr } = await admin
    .from("employee_overtime_records")
    .select("employee_id")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (fetchErr || !existing) return { success: false, error: "Overtime record not found" };

  const { error } = await admin
    .from("employee_overtime_records")
    .update({ deleted_at: new Date().toISOString(), deleted_by: ctx.profile?.id })
    .eq("id", id);

  if (error) return { success: false, error: error.message };

  empRevalidate(existing.employee_id);
  return { success: true };
}

// ── Time Summary ───────────────────────────────────────────────────────────────

export async function getEmployeeTimeSummary(
  employeeId: number
): Promise<ActionResult<EmployeeTimeSummary>> {
  const supabase = await createClient();
  const today = new Date();
  const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  const currentYear = today.getFullYear();

  const [shiftRes, attRes, balRes, leaveRes, otRes] = await Promise.all([
    supabase
      .from("employee_shift_assignments")
      .select("*, work_calendar:work_calendars!employee_shift_assignments_work_calendar_id_fkey(calendar_name), work_shift:work_shifts!employee_shift_assignments_work_shift_id_fkey(shift_name)")
      .eq("employee_id", employeeId)
      .is("deleted_at", null)
      .is("effective_to", null)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from("employee_attendance_daily_summary")
      .select("id", { count: "exact" })
      .eq("employee_id", employeeId)
      .gte("attendance_date", monthStart),

    supabase
      .from("employee_leave_balances")
      .select("*, leave_type:hr_leave_types!employee_leave_balances_leave_type_id_fkey(leave_type_name,leave_type_code)")
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
      .gte("overtime_date", monthStart),
  ]);

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
