"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";

type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

// ============================================================================
// Types
// ============================================================================

export type DashboardFilters = {
  ownerCompanyId?: number | null;
  branchId?: number | null;
  departmentId?: number | null;
  designationId?: number | null;
  expiryThresholdDays?: number;
};

export type AttentionItem = {
  id: string;
  severity: "critical" | "warning" | "info";
  category:
    | "employee"
    | "compliance"
    | "time"
    | "payroll"
    | "operations"
    | "actions"
    | "recruitment";
  title: string;
  description: string;
  employeeId?: number;
  employeeCode?: string;
  employeeName?: string;
  candidateId?: number;
  candidateCode?: string;
  dueDate?: string;
  linkHref: string;
  linkLabel: string;
};

export type EmployeeOverview = {
  total: number;
  active: number;
  probation: number;
  on_leave: number;
  suspended: number;
  terminated_archived: number;
  new_joiners_this_month: number;
};

export type ComplianceOverview = {
  expired_documents: number;
  expiring_soon: number;
  missing_unverified: number;
  active_access_cards: number;
  expired_access_cards: number;
  training_expiring_soon: number;
  medical_expired: number | null;
  linked_dms_documents: number;
};

export type TimeOverview = {
  attendance_pending_approval: number;
  missing_punches: number;
  absent_today: number;
  approved_leave_today: number;
  pending_leave_requests: number;
  overtime_pending_approval: number;
};

export type PayrollOverview = {
  payroll_profiles_configured: number;
  missing_payroll_profile: number;
  wps_ready: number;
  wps_incomplete: number;
  on_payroll_hold: number;
  missing_iban_bank: number;
} | null;

export type OperationsOverview = {
  current_assignments: number;
  ready_employees: number;
  not_ready_employees: number;
  blocked_employees: number;
  active_blocks: number;
  assets_issued: number;
  ppe_due_replacement: number;
  accommodation_active: number;
};

export type ActionsOverview = {
  open_pro_processes: number;
  open_hr_actions: number;
  pending_approvals: number;
  open_disciplinary: number;
  open_eos_cases: number;
  pending_clearance_items: number;
};

export type RecruitmentOverview = {
  open_requisitions: number;
  active_candidates: number;
  interviews_this_week: number;
  offers_pending: number;
  offers_accepted: number;
  onboarding_tasks_pending: number;
  converted_this_month: number;
} | null;

export type DashboardSummary = {
  employee_total: number;
  employee_active: number;
  compliance_issues: number;
  attendance_pending: number;
  wps_ready_pct: number | null;
  active_blocks: number;
  recruitment_active: number | null;
};

// ============================================================================
// Date helpers
// ============================================================================

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function startOfMonthStr() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0];
}

function startOfWeekStr() {
  const d = new Date();
  const start = new Date(d);
  start.setDate(d.getDate() - d.getDay());
  return start.toISOString().split("T")[0];
}

function endOfWeekStr() {
  const d = new Date();
  const end = new Date(d);
  end.setDate(d.getDate() + (6 - d.getDay()));
  return end.toISOString().split("T")[0];
}

function futureDateStr(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

// Helper to get filtered employee IDs
async function getFilteredEmpIds(
  admin: ReturnType<typeof createAdminClient>,
  filters: DashboardFilters,
  statusFilter?: string[]
): Promise<number[]> {
  let q = admin.from("employees").select("id").is("deleted_at", null);
  if (filters.ownerCompanyId) q = q.eq("owner_company_id", filters.ownerCompanyId);
  if (filters.branchId) q = q.eq("branch_id", filters.branchId);
  if (filters.departmentId) q = q.eq("department_id", filters.departmentId);
  if (filters.designationId) q = q.eq("designation_id", filters.designationId);
  if (statusFilter) q = q.in("employee_status", statusFilter);
  const res = await q.limit(5000);
  return (res.data ?? []).map((e: { id: number }) => e.id);
}

// ============================================================================
// getHrDashboardEmployeeOverview
// ============================================================================

export async function getHrDashboardEmployeeOverview(
  filters: DashboardFilters = {}
): Promise<EmployeeOverview> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.employees.view")) {
    return { total: 0, active: 0, probation: 0, on_leave: 0, suspended: 0, terminated_archived: 0, new_joiners_this_month: 0 };
  }

  const admin = createAdminClient();
  const today = todayStr();
  const startOfMonth = startOfMonthStr();

  const base = () => {
    let q = admin.from("employees").select("id", { count: "exact", head: true }).is("deleted_at", null);
    if (filters.ownerCompanyId) q = q.eq("owner_company_id", filters.ownerCompanyId);
    if (filters.branchId) q = q.eq("branch_id", filters.branchId);
    if (filters.departmentId) q = q.eq("department_id", filters.departmentId);
    if (filters.designationId) q = q.eq("designation_id", filters.designationId);
    return q;
  };

  const [allRes, activeRes, probRes, leaveRes, suspRes, termRes, newRes] = await Promise.all([
    base(),
    base().eq("employee_status", "active"),
    base().eq("employee_status", "probation"),
    base().eq("employee_status", "on_leave"),
    base().eq("employee_status", "suspended"),
    base().in("employee_status", ["terminated", "resigned", "archived"]),
    base().gte("joining_date", startOfMonth).lte("joining_date", today),
  ]);

  return {
    total: allRes.count ?? 0,
    active: activeRes.count ?? 0,
    probation: probRes.count ?? 0,
    on_leave: leaveRes.count ?? 0,
    suspended: suspRes.count ?? 0,
    terminated_archived: termRes.count ?? 0,
    new_joiners_this_month: newRes.count ?? 0,
  };
}

// ============================================================================
// getHrDashboardComplianceOverview
// ============================================================================

export async function getHrDashboardComplianceOverview(
  filters: DashboardFilters = {}
): Promise<ComplianceOverview> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.compliance.view")) {
    return { expired_documents: 0, expiring_soon: 0, missing_unverified: 0, active_access_cards: 0, expired_access_cards: 0, training_expiring_soon: 0, medical_expired: null, linked_dms_documents: 0 };
  }

  const admin = createAdminClient();
  const canViewMedical = hasPermission(ctx, "hr.medical.view");
  const today = todayStr();
  const threshold = futureDateStr(filters.expiryThresholdDays ?? 60);

  const empIds = await getFilteredEmpIds(admin, filters);
  if (empIds.length === 0) {
    return { expired_documents: 0, expiring_soon: 0, missing_unverified: 0, active_access_cards: 0, expired_access_cards: 0, training_expiring_soon: 0, medical_expired: canViewMedical ? 0 : null, linked_dms_documents: 0 };
  }

  const [expiredDocs, expiringSoon, unverified, activeCards, expiredCards, trainExpiring, dmsLinked] = await Promise.all([
    admin.from("employee_identity_documents").select("id", { count: "exact", head: true }).in("employee_id", empIds).lt("expiry_date", today).is("deleted_at", null),
    admin.from("employee_identity_documents").select("id", { count: "exact", head: true }).in("employee_id", empIds).gte("expiry_date", today).lte("expiry_date", threshold).is("deleted_at", null),
    admin.from("employee_identity_documents").select("id", { count: "exact", head: true }).in("employee_id", empIds).eq("verification_status", "pending").is("deleted_at", null),
    admin.from("employee_access_cards").select("id", { count: "exact", head: true }).in("employee_id", empIds).eq("card_status", "active").is("deleted_at", null),
    admin.from("employee_access_cards").select("id", { count: "exact", head: true }).in("employee_id", empIds).lt("valid_to", today).is("deleted_at", null),
    admin.from("employee_training_certificates").select("id", { count: "exact", head: true }).in("employee_id", empIds).gte("expiry_date", today).lte("expiry_date", threshold).is("deleted_at", null),
    admin.from("employee_dms_links").select("id", { count: "exact", head: true }).in("employee_id", empIds),
  ]);

  let medicalExpired: number | null = null;
  if (canViewMedical) {
    const medRes = await admin.from("employee_medical_records").select("id", { count: "exact", head: true }).in("employee_id", empIds).lt("valid_until", today).is("deleted_at", null);
    medicalExpired = medRes.count ?? 0;
  }

  return {
    expired_documents: expiredDocs.count ?? 0,
    expiring_soon: expiringSoon.count ?? 0,
    missing_unverified: unverified.count ?? 0,
    active_access_cards: activeCards.count ?? 0,
    expired_access_cards: expiredCards.count ?? 0,
    training_expiring_soon: trainExpiring.count ?? 0,
    medical_expired: medicalExpired,
    linked_dms_documents: dmsLinked.count ?? 0,
  };
}

// ============================================================================
// getHrDashboardTimeOverview
// ============================================================================

export async function getHrDashboardTimeOverview(
  filters: DashboardFilters = {}
): Promise<TimeOverview> {
  const ctx = await getAuthContext();
  const canAttendance = hasPermission(ctx, "hr.attendance.view");
  const canLeave = hasPermission(ctx, "hr.leave.view");

  if (!canAttendance && !canLeave) {
    return { attendance_pending_approval: 0, missing_punches: 0, absent_today: 0, approved_leave_today: 0, pending_leave_requests: 0, overtime_pending_approval: 0 };
  }

  const admin = createAdminClient();
  const today = todayStr();

  const empIds = await getFilteredEmpIds(admin, filters, ["active", "probation"]);
  if (empIds.length === 0) {
    return { attendance_pending_approval: 0, missing_punches: 0, absent_today: 0, approved_leave_today: 0, pending_leave_requests: 0, overtime_pending_approval: 0 };
  }

  const zero = { count: 0 as number | null };

  const [pendingAtt, missingPunch, approvedLeave, pendingLeave, pendingOt] = await Promise.all([
    canAttendance ? admin.from("employee_attendance_daily_summary").select("id", { count: "exact", head: true }).in("employee_id", empIds).eq("approval_status", "pending") : Promise.resolve(zero),
    canAttendance ? admin.from("employee_attendance_daily_summary").select("id", { count: "exact", head: true }).in("employee_id", empIds).eq("attendance_date", today).eq("is_missing_punch", true) : Promise.resolve(zero),
    canLeave ? admin.from("employee_leave_requests").select("id", { count: "exact", head: true }).in("employee_id", empIds).eq("approval_status", "approved").lte("start_date", today).gte("end_date", today).is("deleted_at", null) : Promise.resolve(zero),
    canLeave ? admin.from("employee_leave_requests").select("id", { count: "exact", head: true }).in("employee_id", empIds).eq("approval_status", "pending").is("deleted_at", null) : Promise.resolve(zero),
    canAttendance ? admin.from("employee_overtime_records").select("id", { count: "exact", head: true }).in("employee_id", empIds).eq("approval_status", "pending").is("deleted_at", null) : Promise.resolve(zero),
  ]);

  return {
    attendance_pending_approval: pendingAtt.count ?? 0,
    missing_punches: missingPunch.count ?? 0,
    absent_today: 0,
    approved_leave_today: approvedLeave.count ?? 0,
    pending_leave_requests: pendingLeave.count ?? 0,
    overtime_pending_approval: pendingOt.count ?? 0,
  };
}

// ============================================================================
// getHrDashboardPayrollOverview
// ============================================================================

export async function getHrDashboardPayrollOverview(
  filters: DashboardFilters = {}
): Promise<PayrollOverview> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.payroll.view")) return null;

  const admin = createAdminClient();
  const empIds = await getFilteredEmpIds(admin, filters, ["active", "probation"]);
  const totalActive = empIds.length;
  if (totalActive === 0) return { payroll_profiles_configured: 0, missing_payroll_profile: 0, wps_ready: 0, wps_incomplete: 0, on_payroll_hold: 0, missing_iban_bank: 0 };

  const [profilesRes, holdsRes, wpsRes] = await Promise.all([
    admin.from("employee_payroll_profiles").select("id", { count: "exact", head: true }).in("employee_id", empIds).is("deleted_at", null),
    admin.from("employee_payroll_holds").select("id", { count: "exact", head: true }).in("employee_id", empIds).eq("is_active", true).is("deleted_at", null),
    admin.from("employee_wps_profiles").select("id, iban, bank_id").in("employee_id", empIds).is("deleted_at", null),
  ]);

  const wpsData = (wpsRes.data ?? []) as { iban?: string | null; bank_id?: number | null }[];
  const wpsReady = wpsData.filter((w) => w.iban && w.bank_id).length;
  const wpsIncomplete = wpsData.length - wpsReady;
  const missingIban = wpsData.filter((w) => !w.iban).length;
  const profileCount = profilesRes.count ?? 0;

  return {
    payroll_profiles_configured: profileCount,
    missing_payroll_profile: Math.max(0, totalActive - profileCount),
    wps_ready: wpsReady,
    wps_incomplete: wpsIncomplete,
    on_payroll_hold: holdsRes.count ?? 0,
    missing_iban_bank: missingIban,
  };
}

// ============================================================================
// getHrDashboardOperationsOverview
// ============================================================================

export async function getHrDashboardOperationsOverview(
  filters: DashboardFilters = {}
): Promise<OperationsOverview> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.assignments.view")) {
    return { current_assignments: 0, ready_employees: 0, not_ready_employees: 0, blocked_employees: 0, active_blocks: 0, assets_issued: 0, ppe_due_replacement: 0, accommodation_active: 0 };
  }

  const admin = createAdminClient();
  const today = todayStr();
  const empIds = await getFilteredEmpIds(admin, filters, ["active", "probation"]);
  if (empIds.length === 0) {
    return { current_assignments: 0, ready_employees: 0, not_ready_employees: 0, blocked_employees: 0, active_blocks: 0, assets_issued: 0, ppe_due_replacement: 0, accommodation_active: 0 };
  }

  const [assignRes, readyRes, notReadyRes, blockedDataRes, activeBlocksRes, assetsRes, ppeRes, accomRes] = await Promise.all([
    admin.from("employee_assignments").select("id", { count: "exact", head: true }).in("employee_id", empIds).eq("assignment_status", "active").is("deleted_at", null),
    admin.from("employee_site_readiness").select("id", { count: "exact", head: true }).in("employee_id", empIds).eq("readiness_status", "ready").is("deleted_at", null),
    admin.from("employee_site_readiness").select("id", { count: "exact", head: true }).in("employee_id", empIds).neq("readiness_status", "ready").is("deleted_at", null),
    admin.from("employee_operational_blocks").select("employee_id").in("employee_id", empIds).eq("is_active", true).is("deleted_at", null),
    admin.from("employee_operational_blocks").select("id", { count: "exact", head: true }).in("employee_id", empIds).eq("is_active", true).is("deleted_at", null),
    admin.from("employee_assets").select("id", { count: "exact", head: true }).in("employee_id", empIds).eq("asset_status", "issued").is("deleted_at", null),
    admin.from("employee_ppe_issues").select("id", { count: "exact", head: true }).in("employee_id", empIds).lt("expiry_date", today).is("return_date", null).is("deleted_at", null),
    admin.from("employee_accommodation_records").select("id", { count: "exact", head: true }).in("employee_id", empIds).eq("accommodation_status", "active").is("deleted_at", null),
  ]);

  const blockedEmployeeIds = new Set((blockedDataRes.data ?? []).map((b: { employee_id: number }) => b.employee_id));

  return {
    current_assignments: assignRes.count ?? 0,
    ready_employees: readyRes.count ?? 0,
    not_ready_employees: notReadyRes.count ?? 0,
    blocked_employees: blockedEmployeeIds.size,
    active_blocks: activeBlocksRes.count ?? 0,
    assets_issued: assetsRes.count ?? 0,
    ppe_due_replacement: ppeRes.count ?? 0,
    accommodation_active: accomRes.count ?? 0,
  };
}

// ============================================================================
// getHrDashboardActionsOverview
// ============================================================================

export async function getHrDashboardActionsOverview(
  filters: DashboardFilters = {}
): Promise<ActionsOverview> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.view")) {
    return { open_pro_processes: 0, open_hr_actions: 0, pending_approvals: 0, open_disciplinary: 0, open_eos_cases: 0, pending_clearance_items: 0 };
  }

  const admin = createAdminClient();
  const empIds = await getFilteredEmpIds(admin, filters);
  if (empIds.length === 0) {
    return { open_pro_processes: 0, open_hr_actions: 0, pending_approvals: 0, open_disciplinary: 0, open_eos_cases: 0, pending_clearance_items: 0 };
  }

  const [proRes, actionsRes, approvalsRes, discRes, eosRes, clearRes] = await Promise.all([
    admin.from("employee_pro_processes").select("id", { count: "exact", head: true }).in("employee_id", empIds).in("process_status", ["pending", "in_progress"]).is("deleted_at", null),
    admin.from("employee_hr_actions").select("id", { count: "exact", head: true }).in("employee_id", empIds).in("action_status", ["pending", "in_progress"]).is("deleted_at", null),
    admin.from("employee_approval_requests").select("id", { count: "exact", head: true }).in("employee_id", empIds).eq("approval_status", "pending").is("deleted_at", null),
    admin.from("employee_disciplinary_records").select("id", { count: "exact", head: true }).in("employee_id", empIds).in("disciplinary_status", ["open", "under_review"]).is("deleted_at", null),
    admin.from("employee_eos_cases").select("id", { count: "exact", head: true }).in("employee_id", empIds).in("eos_status", ["initiated", "in_progress", "pending_clearance"]).is("deleted_at", null),
    admin.from("employee_clearance_items").select("id", { count: "exact", head: true }).eq("clearance_status", "pending").is("deleted_at", null),
  ]);

  return {
    open_pro_processes: proRes.count ?? 0,
    open_hr_actions: actionsRes.count ?? 0,
    pending_approvals: approvalsRes.count ?? 0,
    open_disciplinary: discRes.count ?? 0,
    open_eos_cases: eosRes.count ?? 0,
    pending_clearance_items: clearRes.count ?? 0,
  };
}

// ============================================================================
// getHrDashboardRecruitmentOverview
// ============================================================================

export async function getHrDashboardRecruitmentOverview(
  filters: DashboardFilters = {}
): Promise<RecruitmentOverview> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.recruitment.view")) return null;

  const admin = createAdminClient();
  const today = todayStr();
  const weekEnd = endOfWeekStr();
  const weekStart = startOfWeekStr();
  const monthStart = startOfMonthStr();

  const [reqRes, candRes, interviewRes, offerPendRes, offerAccRes, onboardRes, convertedRes] = await Promise.all([
    admin.from("hr_job_requisitions").select("id", { count: "exact", head: true }).eq("requisition_status", "open").is("deleted_at", null),
    admin.from("hr_candidates").select("id", { count: "exact", head: true }).in("candidate_status", ["active", "in_review", "interview", "offer"]).is("deleted_at", null),
    admin.from("hr_interviews").select("id", { count: "exact", head: true }).gte("scheduled_at", weekStart).lte("scheduled_at", weekEnd + "T23:59:59").eq("interview_status", "scheduled").is("deleted_at", null),
    admin.from("hr_offers").select("id", { count: "exact", head: true }).eq("offer_status", "sent").is("deleted_at", null),
    admin.from("hr_offers").select("id", { count: "exact", head: true }).eq("offer_status", "accepted").is("deleted_at", null),
    admin.from("hr_onboarding_tasks").select("id", { count: "exact", head: true }).eq("task_status", "pending").is("deleted_at", null),
    admin.from("employee_recruitment_links").select("id", { count: "exact", head: true }).gte("created_at", monthStart + "T00:00:00").lte("created_at", today + "T23:59:59"),
  ]);

  return {
    open_requisitions: reqRes.count ?? 0,
    active_candidates: candRes.count ?? 0,
    interviews_this_week: interviewRes.count ?? 0,
    offers_pending: offerPendRes.count ?? 0,
    offers_accepted: offerAccRes.count ?? 0,
    onboarding_tasks_pending: onboardRes.count ?? 0,
    converted_this_month: convertedRes.count ?? 0,
  };
}

// ============================================================================
// getHrDashboardAttentionItems
// ============================================================================

export async function getHrDashboardAttentionItems(
  filters: DashboardFilters = {}
): Promise<AttentionItem[]> {
  const ctx = await getAuthContext();
  const items: AttentionItem[] = [];
  const threshold = filters.expiryThresholdDays ?? 60;
  const today = todayStr();
  const soonDate = futureDateStr(threshold);
  const admin = createAdminClient();

  const empRes = await (async () => {
    let q = admin.from("employees").select("id, employee_code, full_name_en").is("deleted_at", null).in("employee_status", ["active", "probation"]);
    if (filters.ownerCompanyId) q = q.eq("owner_company_id", filters.ownerCompanyId);
    if (filters.branchId) q = q.eq("branch_id", filters.branchId);
    if (filters.departmentId) q = q.eq("department_id", filters.departmentId);
    if (filters.designationId) q = q.eq("designation_id", filters.designationId);
    return q.limit(5000);
  })();

  const employees = empRes.data ?? [];
  const empIds = employees.map((e: { id: number }) => e.id);
  const empMap = new Map(employees.map((e: { id: number; employee_code: string; full_name_en: string }) => [e.id, e]));

  if (empIds.length === 0 && !hasPermission(ctx, "hr.recruitment.view")) return [];

  const fetches: Promise<void>[] = [];

  // Compliance: expired identity docs
  if (empIds.length > 0 && hasPermission(ctx, "hr.compliance.view")) {
    fetches.push(
      (async () => {
        const { data } = await admin.from("employee_identity_documents")
          .select("employee_id, document_type, expiry_date")
          .in("employee_id", empIds)
          .lt("expiry_date", today)
          .is("deleted_at", null)
          .order("expiry_date", { ascending: true })
          .limit(15);
        for (const doc of (data ?? []) as { employee_id: number; document_type: string; expiry_date: string }[]) {
          const emp = empMap.get(doc.employee_id);
          items.push({
            id: `comp-expired-${doc.employee_id}-${doc.document_type}`,
            severity: "critical",
            category: "compliance",
            title: `Expired: ${doc.document_type}`,
            description: emp ? `${emp.full_name_en} (${emp.employee_code})` : `Employee #${doc.employee_id}`,
            employeeId: doc.employee_id,
            employeeCode: emp?.employee_code,
            employeeName: emp?.full_name_en,
            dueDate: doc.expiry_date,
            linkHref: `/admin/hr/employees/record/${doc.employee_id}`,
            linkLabel: "View Employee",
          });
        }
      })()
    );

    fetches.push(
      (async () => {
        const { data } = await admin.from("employee_identity_documents")
          .select("employee_id, document_type, expiry_date")
          .in("employee_id", empIds)
          .gte("expiry_date", today)
          .lte("expiry_date", soonDate)
          .is("deleted_at", null)
          .order("expiry_date", { ascending: true })
          .limit(10);
        for (const doc of (data ?? []) as { employee_id: number; document_type: string; expiry_date: string }[]) {
          const emp = empMap.get(doc.employee_id);
          items.push({
            id: `comp-expiring-${doc.employee_id}-${doc.document_type}`,
            severity: "warning",
            category: "compliance",
            title: `Expiring soon: ${doc.document_type}`,
            description: emp ? `${emp.full_name_en} (${emp.employee_code})` : `Employee #${doc.employee_id}`,
            employeeId: doc.employee_id,
            employeeCode: emp?.employee_code,
            employeeName: emp?.full_name_en,
            dueDate: doc.expiry_date,
            linkHref: `/admin/hr/employees/record/${doc.employee_id}`,
            linkLabel: "View Employee",
          });
        }
      })()
    );
  }

  // Actions: pending approvals
  if (empIds.length > 0 && hasPermission(ctx, "hr.actions.view")) {
    fetches.push(
      (async () => {
        const { data } = await admin.from("employee_approval_requests")
          .select("employee_id, request_type, created_at")
          .in("employee_id", empIds)
          .eq("approval_status", "pending")
          .is("deleted_at", null)
          .order("created_at", { ascending: true })
          .limit(10);
        for (const req of (data ?? []) as { employee_id: number; request_type: string; created_at: string }[]) {
          const emp = empMap.get(req.employee_id);
          items.push({
            id: `action-approval-${req.employee_id}-${req.created_at}`,
            severity: "warning",
            category: "actions",
            title: `Pending approval: ${req.request_type}`,
            description: emp ? `${emp.full_name_en} (${emp.employee_code})` : `Employee #${req.employee_id}`,
            employeeId: req.employee_id,
            employeeCode: emp?.employee_code,
            employeeName: emp?.full_name_en,
            linkHref: "/admin/hr/actions/approvals",
            linkLabel: "View Approvals",
          });
        }
      })()
    );
  }

  // Operations: active blocks
  if (empIds.length > 0 && hasPermission(ctx, "hr.assignments.view")) {
    fetches.push(
      (async () => {
        const { data } = await admin.from("employee_operational_blocks")
          .select("employee_id, block_reason, effective_from")
          .in("employee_id", empIds)
          .eq("is_active", true)
          .is("deleted_at", null)
          .order("effective_from", { ascending: true })
          .limit(10);
        for (const blk of (data ?? []) as { employee_id: number; block_reason: string; effective_from: string }[]) {
          const emp = empMap.get(blk.employee_id);
          items.push({
            id: `ops-block-${blk.employee_id}-${blk.effective_from}`,
            severity: "critical",
            category: "operations",
            title: "Operational block active",
            description: emp ? `${emp.full_name_en} (${emp.employee_code})` : `Employee #${blk.employee_id}`,
            employeeId: blk.employee_id,
            employeeCode: emp?.employee_code,
            employeeName: emp?.full_name_en,
            dueDate: blk.effective_from,
            linkHref: "/admin/hr/operations/blocks",
            linkLabel: "View Blocks",
          });
        }
      })()
    );
  }

  // Recruitment: offers expiring soon
  if (hasPermission(ctx, "hr.recruitment.view")) {
    const offerExpiry = futureDateStr(14);
    fetches.push(
      (async () => {
        const { data } = await admin.from("hr_offers")
          .select("id, candidate_id, offer_expiry_date, hr_candidates(full_name_en, candidate_code)")
          .eq("offer_status", "sent")
          .gte("offer_expiry_date", today)
          .lte("offer_expiry_date", offerExpiry)
          .is("deleted_at", null)
          .order("offer_expiry_date", { ascending: true })
          .limit(10);
        for (const o of (data ?? []) as { id: number; candidate_id: number; offer_expiry_date: string; hr_candidates: unknown[] | { full_name_en: string; candidate_code: string } | null }[]) {
          const cand = Array.isArray(o.hr_candidates) ? (o.hr_candidates[0] as { full_name_en: string; candidate_code: string } | undefined) : (o.hr_candidates as { full_name_en: string; candidate_code: string } | null);
          items.push({
            id: `recruit-offer-${o.id}`,
            severity: "warning",
            category: "recruitment",
            title: "Offer expiring soon",
            description: cand ? `${cand.full_name_en} (${cand.candidate_code})` : `Candidate #${o.candidate_id}`,
            candidateId: o.candidate_id,
            candidateCode: cand?.candidate_code,
            dueDate: o.offer_expiry_date,
            linkHref: `/admin/hr/recruitment/candidates/record/${o.candidate_id}`,
            linkLabel: "View Candidate",
          });
        }
      })()
    );

    fetches.push(
      (async () => {
        const { data } = await admin.from("hr_onboarding_tasks")
          .select("id, candidate_id, task_title, due_date, hr_candidates(full_name_en, candidate_code)")
          .eq("task_status", "pending")
          .lt("due_date", today)
          .is("deleted_at", null)
          .order("due_date", { ascending: true })
          .limit(10);
        for (const t of (data ?? []) as { id: number; candidate_id: number; task_title: string; due_date: string; hr_candidates: unknown[] | { full_name_en: string; candidate_code: string } | null }[]) {
          const cand = Array.isArray(t.hr_candidates) ? (t.hr_candidates[0] as { full_name_en: string; candidate_code: string } | undefined) : (t.hr_candidates as { full_name_en: string; candidate_code: string } | null);
          items.push({
            id: `recruit-onboard-${t.id}`,
            severity: "warning",
            category: "recruitment",
            title: `Overdue onboarding: ${t.task_title}`,
            description: cand ? `${cand.full_name_en} (${cand.candidate_code})` : `Candidate #${t.candidate_id}`,
            candidateId: t.candidate_id,
            candidateCode: cand?.candidate_code,
            dueDate: t.due_date,
            linkHref: `/admin/hr/recruitment/candidates/record/${t.candidate_id}`,
            linkLabel: "View Candidate",
          });
        }
      })()
    );
  }

  await Promise.all(fetches);

  items.sort((a, b) => {
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    const so = severityOrder[a.severity] - severityOrder[b.severity];
    if (so !== 0) return so;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    return 0;
  });

  return items.slice(0, 50);
}

// ============================================================================
// getHrDashboardSummary (top KPI bar)
// ============================================================================

export async function getHrDashboardSummary(
  filters: DashboardFilters = {}
): Promise<DashboardSummary> {
  const ctx = await getAuthContext();
  const admin = createAdminClient();

  const canCompliance = hasPermission(ctx, "hr.compliance.view");
  const canAttendance = hasPermission(ctx, "hr.attendance.view");
  const canPayroll = hasPermission(ctx, "hr.payroll.view");
  const canAssignments = hasPermission(ctx, "hr.assignments.view");
  const canRecruitment = hasPermission(ctx, "hr.recruitment.view");

  const allEmpIds = await getFilteredEmpIds(admin, filters);
  const activeEmpIds = await getFilteredEmpIds(admin, filters, ["active", "probation"]);

  const today = todayStr();
  const soonDate = futureDateStr(filters.expiryThresholdDays ?? 60);
  const zero = { count: 0 as number | null };

  const [complianceRes, attendanceRes, blocksRes, recruitmentRes] = await Promise.all([
    canCompliance && allEmpIds.length > 0
      ? admin.from("employee_identity_documents").select("id", { count: "exact", head: true }).in("employee_id", allEmpIds).lte("expiry_date", soonDate).is("deleted_at", null)
      : Promise.resolve(zero),
    canAttendance && activeEmpIds.length > 0
      ? admin.from("employee_attendance_daily_summary").select("id", { count: "exact", head: true }).in("employee_id", activeEmpIds).eq("approval_status", "pending")
      : Promise.resolve(zero),
    canAssignments && allEmpIds.length > 0
      ? admin.from("employee_operational_blocks").select("id", { count: "exact", head: true }).in("employee_id", allEmpIds).eq("is_active", true).is("deleted_at", null)
      : Promise.resolve(zero),
    canRecruitment
      ? admin.from("hr_candidates").select("id", { count: "exact", head: true }).in("candidate_status", ["active", "in_review", "interview", "offer"]).is("deleted_at", null)
      : Promise.resolve(zero),
  ]);

  let wpsReadyPct: number | null = null;
  if (canPayroll && activeEmpIds.length > 0) {
    const wpsRes = await admin.from("employee_wps_profiles").select("iban, bank_id").in("employee_id", activeEmpIds).is("deleted_at", null);
    const wpsData = (wpsRes.data ?? []) as { iban?: string | null; bank_id?: number | null }[];
    if (wpsData.length > 0) {
      const ready = wpsData.filter((w) => w.iban && w.bank_id).length;
      wpsReadyPct = Math.round((ready / wpsData.length) * 100);
    }
  }

  return {
    employee_total: allEmpIds.length,
    employee_active: activeEmpIds.length,
    compliance_issues: complianceRes.count ?? 0,
    attendance_pending: attendanceRes.count ?? 0,
    wps_ready_pct: wpsReadyPct,
    active_blocks: blocksRes.count ?? 0,
    recruitment_active: canRecruitment ? (recruitmentRes.count ?? 0) : null,
  };
}

// ============================================================================
// getHeadcountByCategory
// ============================================================================

export type HeadcountByCategoryItem = {
  categoryId: number | null;
  categoryName: string;
  count: number;
};

export async function getHeadcountByCategory(): Promise<ActionResult<HeadcountByCategoryItem[]>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.employees.view")) {
    return { success: false, error: "Permission denied" };
  }

  const admin = createAdminClient();

  const [empRes, catRes] = await Promise.all([
    admin
      .from("employees")
      .select("employee_category_id")
      .in("employee_status", ["active", "probation"])
      .is("deleted_at", null),
    admin
      .from("hr_employee_categories")
      .select("id, name_en")
      .is("deleted_at", null)
      .order("name_en", { ascending: true }),
  ]);

  if (empRes.error) return { success: false, error: empRes.error.message };
  if (catRes.error) return { success: false, error: catRes.error.message };

  const employees = (empRes.data ?? []) as { employee_category_id: number | null }[];
  const categories = (catRes.data ?? []) as { id: number; name_en: string }[];

  const countMap = new Map<number | null, number>();
  for (const emp of employees) {
    const key = emp.employee_category_id;
    countMap.set(key, (countMap.get(key) ?? 0) + 1);
  }

  const result: HeadcountByCategoryItem[] = [];

  for (const cat of categories) {
    const count = countMap.get(cat.id) ?? 0;
    if (count > 0) {
      result.push({ categoryId: cat.id, categoryName: cat.name_en, count });
    }
  }

  const uncatCount = countMap.get(null) ?? 0;
  if (uncatCount > 0) {
    result.push({ categoryId: null, categoryName: "Uncategorised", count: uncatCount });
  }

  result.sort((a, b) => b.count - a.count);

  return { success: true, data: result };
}
