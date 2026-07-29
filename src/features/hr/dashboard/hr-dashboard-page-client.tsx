"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  Users, ShieldCheck, Clock, Landmark, AlertOctagon, Briefcase,
  ClipboardList, RefreshCw, UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ERPSectionCard } from "@/components/erp/section-card";
import { HrDashboardSectionCard, HrDashboardStatItem, type SectionSeverity } from "./hr-dashboard-section-card";
import { HrDashboardAlerts } from "./hr-dashboard-alerts";
import { HrHeadcountByCategoryWidget } from "./hr-headcount-by-category-widget";
import { HrKpiCards, type HrKpiCard } from "./hr-kpi-cards";
import { HrWorkforceReadinessRing } from "./hr-workforce-readiness-ring";
import { queryKeys } from "@/lib/query/query-keys";
import {
  getHrDashboardEmployeeOverview,
  getHrDashboardComplianceOverview,
  getHrDashboardTimeOverview,
  getHrDashboardPayrollOverview,
  getHrDashboardOperationsOverview,
  getHrDashboardActionsOverview,
  getHrDashboardRecruitmentOverview,
  getHrDashboardAttentionItems,
  getHrDashboardSummary,
  type DashboardFilters,
} from "@/server/actions/hr/dashboard";

// ============================================================================
// Permissions shape passed from server
// ============================================================================

export type HrDashboardPermissions = {
  canViewEmployees: boolean;
  canViewCompliance: boolean;
  canViewMedical: boolean;
  canViewAttendance: boolean;
  canViewLeave: boolean;
  canViewPayroll: boolean;
  canViewAssignments: boolean;
  canViewActions: boolean;
  canViewEos: boolean;
  canViewRecruitment: boolean;
};

// ============================================================================
// Helpers
// ============================================================================

function SectionSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-7 w-full" />
      ))}
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

interface HrDashboardPageClientProps {
  permissions: HrDashboardPermissions;
  initialFilters?: DashboardFilters;
}

export function HrDashboardPageClient({ permissions, initialFilters = {} }: HrDashboardPageClientProps) {
  const [filters] = useState<DashboardFilters>(initialFilters);

  const filtersKey = JSON.stringify(filters);
  const filtersObj = filters && Object.keys(filters).length > 0 ? filters : undefined;

  // ── Queries ──────────────────────────────────────────────────────────────

  const summaryQuery = useQuery({
    queryKey: queryKeys.hr.dashboard.summary(filtersObj),
    queryFn: () => getHrDashboardSummary(filters),
    staleTime: 2 * 60 * 1000,
  });

  const employeeQuery = useQuery({
    queryKey: queryKeys.hr.dashboard.employeeOverview(filtersObj),
    queryFn: () => getHrDashboardEmployeeOverview(filters),
    staleTime: 2 * 60 * 1000,
    enabled: permissions.canViewEmployees,
  });

  const complianceQuery = useQuery({
    queryKey: queryKeys.hr.dashboard.complianceOverview(filtersObj),
    queryFn: () => getHrDashboardComplianceOverview(filters),
    staleTime: 2 * 60 * 1000,
    enabled: permissions.canViewCompliance,
  });

  const timeQuery = useQuery({
    queryKey: queryKeys.hr.dashboard.timeOverview(filtersObj),
    queryFn: () => getHrDashboardTimeOverview(filters),
    staleTime: 2 * 60 * 1000,
    enabled: permissions.canViewAttendance || permissions.canViewLeave,
  });

  const payrollQuery = useQuery({
    queryKey: queryKeys.hr.dashboard.payrollOverview(filtersObj),
    queryFn: () => getHrDashboardPayrollOverview(filters),
    staleTime: 2 * 60 * 1000,
    enabled: permissions.canViewPayroll,
  });

  const operationsQuery = useQuery({
    queryKey: queryKeys.hr.dashboard.operationsOverview(filtersObj),
    queryFn: () => getHrDashboardOperationsOverview(filters),
    staleTime: 2 * 60 * 1000,
    enabled: permissions.canViewAssignments,
  });

  const actionsQuery = useQuery({
    queryKey: queryKeys.hr.dashboard.actionsOverview(filtersObj),
    queryFn: () => getHrDashboardActionsOverview(filters),
    staleTime: 2 * 60 * 1000,
    enabled: permissions.canViewActions,
  });

  const recruitmentQuery = useQuery({
    queryKey: queryKeys.hr.dashboard.recruitmentOverview(filtersObj),
    queryFn: () => getHrDashboardRecruitmentOverview(filters),
    staleTime: 2 * 60 * 1000,
    enabled: permissions.canViewRecruitment,
  });

  const attentionQuery = useQuery({
    queryKey: queryKeys.hr.dashboard.attentionItems(filtersObj),
    queryFn: () => getHrDashboardAttentionItems(filters),
    staleTime: 60 * 1000,
  });

  const isRefreshing =
    summaryQuery.isFetching ||
    employeeQuery.isFetching ||
    complianceQuery.isFetching ||
    timeQuery.isFetching ||
    payrollQuery.isFetching ||
    operationsQuery.isFetching ||
    actionsQuery.isFetching ||
    recruitmentQuery.isFetching ||
    attentionQuery.isFetching;

  const handleRefresh = useCallback(() => {
    summaryQuery.refetch();
    employeeQuery.refetch();
    complianceQuery.refetch();
    timeQuery.refetch();
    payrollQuery.refetch();
    operationsQuery.refetch();
    actionsQuery.refetch();
    recruitmentQuery.refetch();
    attentionQuery.refetch();
  }, [summaryQuery, employeeQuery, complianceQuery, timeQuery, payrollQuery, operationsQuery, actionsQuery, recruitmentQuery, attentionQuery]);

  // ── Data shortcuts ────────────────────────────────────────────────────────

  const summary = summaryQuery.data;
  const emp = employeeQuery.data;
  const comp = complianceQuery.data;
  const time = timeQuery.data;
  const payroll = payrollQuery.data;
  const ops = operationsQuery.data;
  const acts = actionsQuery.data;
  const recruit = recruitmentQuery.data;
  const attention = attentionQuery.data ?? [];

  // ── KPI top strip ─────────────────────────────────────────────────────────

  const kpiCards: HrKpiCard[] = [
    {
      label: "Total Employees",
      value: summaryQuery.isLoading ? "—" : (summary?.employee_total ?? 0).toLocaleString(),
      sub: `${summary?.employee_active ?? 0} active`,
      href: "/admin/hr/employees",
      icon: Users,
      accent: "blue",
    },
    {
      label: "Compliance Issues",
      value: summaryQuery.isLoading ? "—" : (summary?.compliance_issues ?? 0).toLocaleString(),
      sub: "expired / expiring docs",
      href: "/admin/hr/employees",
      icon: ShieldCheck,
      accent: summary && summary.compliance_issues > 0 ? "amber" : "slate",
    },
    {
      label: "Attendance Pending",
      value: summaryQuery.isLoading ? "—" : (summary?.attendance_pending ?? 0).toLocaleString(),
      sub: "awaiting approval",
      href: "/admin/hr/time/attendance",
      icon: Clock,
      accent: summary && summary.attendance_pending > 0 ? "amber" : "slate",
    },
    {
      label: "WPS Ready",
      value: summaryQuery.isLoading ? "—" : (summary?.wps_ready_pct != null ? `${summary.wps_ready_pct}%` : "—"),
      sub: "of WPS-enrolled staff",
      href: "/admin/hr/payroll/wps",
      icon: Landmark,
      accent: "emerald",
    },
    {
      label: "Active Blocks",
      value: summaryQuery.isLoading ? "—" : (summary?.active_blocks ?? 0).toLocaleString(),
      sub: "operational blocks",
      href: "/admin/hr/operations/blocks",
      icon: AlertOctagon,
      accent: summary && summary.active_blocks > 0 ? "red" : "slate",
    },
    {
      label: "Active Candidates",
      value: summaryQuery.isLoading ? "—" : (summary?.recruitment_active != null ? String(summary.recruitment_active) : "—"),
      sub: "in pipeline",
      href: "/admin/hr/recruitment/candidates",
      icon: Briefcase,
      accent: "teal",
    },
  ];

  // ── Section severity — computed from real thresholds, drives the status dot ─

  const employeeSeverity: SectionSeverity = (emp?.suspended ?? 0) > 0 ? "danger" : "ok";

  const complianceSeverity: SectionSeverity =
    (comp?.expired_documents ?? 0) > 0 || (comp?.expired_access_cards ?? 0) > 0
      ? "danger"
      : (comp?.expiring_soon ?? 0) > 0 || (comp?.missing_unverified ?? 0) > 0 || (comp?.training_expiring_soon ?? 0) > 0 || (comp?.medical_expired ?? 0) > 0
      ? "warning"
      : "ok";

  const timeSeverity: SectionSeverity =
    (time?.attendance_pending_approval ?? 0) > 0 ||
    (time?.missing_punches ?? 0) > 0 ||
    (time?.pending_leave_requests ?? 0) > 0 ||
    (time?.overtime_pending_approval ?? 0) > 0
      ? "warning"
      : "ok";

  const payrollSeverity: SectionSeverity =
    (payroll?.on_payroll_hold ?? 0) > 0
      ? "danger"
      : (payroll?.missing_payroll_profile ?? 0) > 0 || (payroll?.wps_incomplete ?? 0) > 0 || (payroll?.missing_iban_bank ?? 0) > 0
      ? "warning"
      : "ok";

  const operationsSeverity: SectionSeverity =
    (ops?.blocked_employees ?? 0) > 0 || (ops?.active_blocks ?? 0) > 0
      ? "danger"
      : (ops?.not_ready_employees ?? 0) > 0 || (ops?.ppe_due_replacement ?? 0) > 0
      ? "warning"
      : "ok";

  const actionsSeverity: SectionSeverity =
    (acts?.pending_approvals ?? 0) > 0
      ? "danger"
      : (acts?.open_pro_processes ?? 0) > 0 ||
        (acts?.open_hr_actions ?? 0) > 0 ||
        (acts?.open_disciplinary ?? 0) > 0 ||
        (acts?.open_eos_cases ?? 0) > 0 ||
        (acts?.pending_clearance_items ?? 0) > 0
      ? "warning"
      : "ok";

  const recruitmentSeverity: SectionSeverity = (recruit?.offers_pending ?? 0) > 0 ? "warning" : "ok";

  return (
    <div className="space-y-6 max-w-[1600px]">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <UsersRound className="h-[18px] w-[18px]" />
          </span>
          <div>
            <h1 className="text-lg font-semibold leading-tight">HR Dashboard</h1>
            <p className="text-xs text-muted-foreground">
              Live workforce operations — headcount, compliance, payroll, and readiness
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          {isRefreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {/* Hero row — readiness ring + KPI strip */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        <div className="lg:col-span-1">
          <HrWorkforceReadinessRing
            ready={ops?.ready_employees ?? 0}
            notReady={ops?.not_ready_employees ?? 0}
            blocked={ops?.blocked_employees ?? 0}
            isLoading={operationsQuery.isLoading}
            hasAccess={permissions.canViewAssignments}
          />
        </div>
        <div className="lg:col-span-3">
          <HrKpiCards cards={kpiCards} />
        </div>
      </div>

      {/* Section label */}
      <div className="flex items-center gap-2 pt-1">
        <UsersRound className="h-3.5 w-3.5 text-muted-foreground" />
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Operations by Domain
        </h2>
      </div>

      {/* Main Dashboard Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

        {/* 1. Employee Overview */}
        <HrDashboardSectionCard
          title="Employee Overview"
          icon={Users}
          iconColor="text-blue-600"
          href="/admin/hr/employees"
          restricted={!permissions.canViewEmployees}
          severity={permissions.canViewEmployees ? employeeSeverity : undefined}
        >
          {employeeQuery.isLoading ? (
            <SectionSkeleton />
          ) : (
            <>
              <HrDashboardStatItem label="Total employees" value={emp?.total ?? 0} href="/admin/hr/employees" />
              <HrDashboardStatItem label="Active" value={emp?.active ?? 0} href="/admin/hr/employees?status=active" variant="success" />
              <HrDashboardStatItem label="Probation" value={emp?.probation ?? 0} href="/admin/hr/employees?status=probation" variant="warning" />
              <HrDashboardStatItem label="On leave" value={emp?.on_leave ?? 0} href="/admin/hr/employees?status=on_leave" />
              <HrDashboardStatItem label="Suspended" value={emp?.suspended ?? 0} href="/admin/hr/employees?status=suspended" variant={emp?.suspended ? "danger" : "default"} />
              <HrDashboardStatItem label="Terminated / Archived" value={emp?.terminated_archived ?? 0} href="/admin/hr/employees?status=terminated" variant="muted" />
              <HrDashboardStatItem label="New joiners this month" value={emp?.new_joiners_this_month ?? 0} variant="success" />
            </>
          )}
        </HrDashboardSectionCard>

        {/* 2. Compliance Overview */}
        <HrDashboardSectionCard
          title="Compliance"
          icon={ShieldCheck}
          iconColor="text-amber-600"
          href="/admin/hr/employees"
          restricted={!permissions.canViewCompliance}
          severity={permissions.canViewCompliance ? complianceSeverity : undefined}
        >
          {complianceQuery.isLoading ? (
            <SectionSkeleton />
          ) : (
            <>
              <HrDashboardStatItem label="Expired documents" value={comp?.expired_documents ?? 0} variant={comp?.expired_documents ? "danger" : "default"} />
              <HrDashboardStatItem label="Expiring soon (60 days)" value={comp?.expiring_soon ?? 0} variant={comp?.expiring_soon ? "warning" : "default"} />
              <HrDashboardStatItem label="Pending / unverified" value={comp?.missing_unverified ?? 0} variant={comp?.missing_unverified ? "warning" : "default"} />
              <HrDashboardStatItem label="Active access cards" value={comp?.active_access_cards ?? 0} variant="success" />
              <HrDashboardStatItem label="Expired access cards" value={comp?.expired_access_cards ?? 0} variant={comp?.expired_access_cards ? "danger" : "default"} />
              <HrDashboardStatItem label="Training expiring soon" value={comp?.training_expiring_soon ?? 0} variant={comp?.training_expiring_soon ? "warning" : "default"} />
              {comp?.medical_expired !== null && comp?.medical_expired !== undefined && (
                <HrDashboardStatItem label="Medical records expired" value={comp.medical_expired} variant={comp.medical_expired > 0 ? "danger" : "default"} />
              )}
              <HrDashboardStatItem label="Linked DMS documents" value={comp?.linked_dms_documents ?? 0} />
            </>
          )}
        </HrDashboardSectionCard>

        {/* 3. Time & Attendance Overview */}
        <HrDashboardSectionCard
          title="Attendance & Leave"
          icon={Clock}
          iconColor="text-purple-600"
          href="/admin/hr/time/attendance"
          restricted={!permissions.canViewAttendance && !permissions.canViewLeave}
          severity={permissions.canViewAttendance || permissions.canViewLeave ? timeSeverity : undefined}
        >
          {timeQuery.isLoading ? (
            <SectionSkeleton />
          ) : (
            <>
              <HrDashboardStatItem label="Attendance pending approval" value={time?.attendance_pending_approval ?? 0} href="/admin/hr/time/attendance" variant={time?.attendance_pending_approval ? "warning" : "default"} />
              <HrDashboardStatItem label="Missing punches" value={time?.missing_punches ?? 0} href="/admin/hr/time/attendance" variant={time?.missing_punches ? "warning" : "default"} />
              <HrDashboardStatItem label="Approved leave today" value={time?.approved_leave_today ?? 0} href="/admin/hr/time/leave" />
              <HrDashboardStatItem label="Pending leave requests" value={time?.pending_leave_requests ?? 0} href="/admin/hr/time/leave" variant={time?.pending_leave_requests ? "warning" : "default"} />
              <HrDashboardStatItem label="Overtime pending approval" value={time?.overtime_pending_approval ?? 0} href="/admin/hr/time/attendance" variant={time?.overtime_pending_approval ? "warning" : "default"} />
            </>
          )}
        </HrDashboardSectionCard>

        {/* 4. Payroll & WPS */}
        <HrDashboardSectionCard
          title="Payroll & WPS"
          icon={Landmark}
          iconColor="text-emerald-600"
          href="/admin/hr/payroll/wps"
          restricted={!permissions.canViewPayroll}
          severity={permissions.canViewPayroll ? payrollSeverity : undefined}
        >
          {payrollQuery.isLoading ? (
            <SectionSkeleton />
          ) : !payroll ? (
            <p className="text-xs text-muted-foreground py-2">No payroll access.</p>
          ) : (
            <>
              <HrDashboardStatItem label="Payroll profiles configured" value={payroll.payroll_profiles_configured} href="/admin/hr/payroll/salaries" variant="success" />
              <HrDashboardStatItem label="Missing payroll profile" value={payroll.missing_payroll_profile} variant={payroll.missing_payroll_profile > 0 ? "warning" : "default"} />
              <HrDashboardStatItem label="WPS ready" value={payroll.wps_ready} href="/admin/hr/payroll/wps" variant="success" />
              <HrDashboardStatItem label="WPS incomplete" value={payroll.wps_incomplete} href="/admin/hr/payroll/wps" variant={payroll.wps_incomplete > 0 ? "warning" : "default"} />
              <HrDashboardStatItem label="On payroll hold" value={payroll.on_payroll_hold} variant={payroll.on_payroll_hold > 0 ? "danger" : "default"} />
              <HrDashboardStatItem label="Missing IBAN / bank" value={payroll.missing_iban_bank} href="/admin/hr/payroll/wps" variant={payroll.missing_iban_bank > 0 ? "warning" : "default"} />
            </>
          )}
        </HrDashboardSectionCard>

        {/* 5. Operations & Readiness */}
        <HrDashboardSectionCard
          title="Operations & Readiness"
          icon={AlertOctagon}
          iconColor="text-slate-600"
          href="/admin/hr/operations/readiness"
          restricted={!permissions.canViewAssignments}
          severity={permissions.canViewAssignments ? operationsSeverity : undefined}
        >
          {operationsQuery.isLoading ? (
            <SectionSkeleton />
          ) : (
            <>
              <HrDashboardStatItem label="Current assignments" value={ops?.current_assignments ?? 0} href="/admin/hr/operations/assignments" />
              <HrDashboardStatItem label="Ready employees" value={ops?.ready_employees ?? 0} href="/admin/hr/operations/readiness" variant="success" />
              <HrDashboardStatItem label="Not ready employees" value={ops?.not_ready_employees ?? 0} href="/admin/hr/operations/readiness" variant={ops?.not_ready_employees ? "warning" : "default"} />
              <HrDashboardStatItem label="Blocked employees" value={ops?.blocked_employees ?? 0} href="/admin/hr/operations/blocks" variant={ops?.blocked_employees ? "danger" : "default"} />
              <HrDashboardStatItem label="Active operational blocks" value={ops?.active_blocks ?? 0} href="/admin/hr/operations/blocks" variant={ops?.active_blocks ? "danger" : "default"} />
              <HrDashboardStatItem label="Assets issued" value={ops?.assets_issued ?? 0} />
              <HrDashboardStatItem label="PPE due for replacement" value={ops?.ppe_due_replacement ?? 0} variant={ops?.ppe_due_replacement ? "warning" : "default"} />
              <HrDashboardStatItem label="Accommodation active" value={ops?.accommodation_active ?? 0} />
            </>
          )}
        </HrDashboardSectionCard>

        {/* 6. HR Actions */}
        <HrDashboardSectionCard
          title="HR Actions"
          icon={ClipboardList}
          iconColor="text-red-600"
          href="/admin/hr/actions/approvals"
          restricted={!permissions.canViewActions}
          severity={permissions.canViewActions ? actionsSeverity : undefined}
        >
          {actionsQuery.isLoading ? (
            <SectionSkeleton />
          ) : (
            <>
              <HrDashboardStatItem label="Open PRO processes" value={acts?.open_pro_processes ?? 0} href="/admin/hr/actions/pro" variant={acts?.open_pro_processes ? "warning" : "default"} />
              <HrDashboardStatItem label="Open HR actions" value={acts?.open_hr_actions ?? 0} variant={acts?.open_hr_actions ? "warning" : "default"} />
              <HrDashboardStatItem label="Pending approvals" value={acts?.pending_approvals ?? 0} href="/admin/hr/actions/approvals" variant={acts?.pending_approvals ? "danger" : "default"} />
              <HrDashboardStatItem label="Open disciplinary records" value={acts?.open_disciplinary ?? 0} href="/admin/hr/actions/disciplinary" variant={acts?.open_disciplinary ? "warning" : "default"} />
              <HrDashboardStatItem label="Open EOS cases" value={acts?.open_eos_cases ?? 0} href="/admin/hr/actions/eos" variant={acts?.open_eos_cases ? "warning" : "default"} />
              <HrDashboardStatItem label="Pending clearance items" value={acts?.pending_clearance_items ?? 0} href="/admin/hr/actions/eos" variant={acts?.pending_clearance_items ? "warning" : "default"} />
            </>
          )}
        </HrDashboardSectionCard>

        {/* 7. Recruitment & Onboarding */}
        <HrDashboardSectionCard
          title="Recruitment & Onboarding"
          icon={Briefcase}
          iconColor="text-teal-600"
          href="/admin/hr/recruitment/candidates"
          restricted={!permissions.canViewRecruitment}
          className="md:col-span-2 xl:col-span-1"
          severity={permissions.canViewRecruitment ? recruitmentSeverity : undefined}
        >
          {recruitmentQuery.isLoading ? (
            <SectionSkeleton />
          ) : !recruit ? (
            <p className="text-xs text-muted-foreground py-2">No recruitment access.</p>
          ) : (
            <>
              <HrDashboardStatItem label="Open requisitions" value={recruit.open_requisitions} href="/admin/hr/recruitment/requisitions" />
              <HrDashboardStatItem label="Active candidates" value={recruit.active_candidates} href="/admin/hr/recruitment/candidates" />
              <HrDashboardStatItem label="Interviews this week" value={recruit.interviews_this_week} href="/admin/hr/recruitment/interviews" variant={recruit.interviews_this_week > 0 ? "warning" : "default"} />
              <HrDashboardStatItem label="Offers pending" value={recruit.offers_pending} href="/admin/hr/recruitment/offers" variant={recruit.offers_pending > 0 ? "warning" : "default"} />
              <HrDashboardStatItem label="Offers accepted" value={recruit.offers_accepted} href="/admin/hr/recruitment/offers" variant="success" />
              <HrDashboardStatItem label="Onboarding tasks pending" value={recruit.onboarding_tasks_pending} href="/admin/hr/recruitment/onboarding" variant={recruit.onboarding_tasks_pending > 0 ? "warning" : "default"} />
              <HrDashboardStatItem label="Converted this month" value={recruit.converted_this_month} href="/admin/hr/employees" variant="success" />
            </>
          )}
        </HrDashboardSectionCard>

        {/* 8. Headcount by Category */}
        {permissions.canViewEmployees && <HrHeadcountByCategoryWidget />}

      </div>

      {/* Attention Items */}
      <ERPSectionCard
        title="Attention Required"
        description="Items requiring HR team action — sorted by severity then due date"
        actions={
          <span className="text-xs text-muted-foreground">
            {attentionQuery.isLoading ? "Loading…" : `${attention.length} item${attention.length !== 1 ? "s" : ""}`}
          </span>
        }
      >
        {attentionQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <HrDashboardAlerts items={attention} />
        )}
      </ERPSectionCard>
    </div>
  );
}
