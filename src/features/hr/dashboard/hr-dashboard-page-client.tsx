"use client";

import { ERPSectionCard } from "@/components/erp/section-card";
import { QueryReadBoundary } from "@/components/erp/query-read-boundary";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type {AuthContext} from "@/lib/rbac/check";
import {useHrDashboard, type HrDashboardSeed} from "@/hooks/use-hr-dashboard";
import type {HrDashboardCriteria as DashboardFilters, HrDashboardMetric} from "@/lib/reads/hr-dashboard-schema";
import {
  AlertOctagon, Briefcase,
  ClipboardList,
  Clock, Landmark,
  RefreshCw,
  ShieldCheck,
  Users,
  UsersRound,
} from "lucide-react";
import { useState } from "react";
import { HrDashboardAlerts } from "./hr-dashboard-alerts";
import { HrDashboardSectionCard, HrDashboardStatItem, type SectionSeverity } from "./hr-dashboard-section-card";
import { HrHeadcountByCategoryWidget } from "./hr-headcount-by-category-widget";
import { HrKpiCards, type HrKpiCard } from "./hr-kpi-cards";
import { HrWorkforceReadinessRing } from "./hr-workforce-readiness-ring";

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
  authContext: AuthContext;
  permissions: HrDashboardPermissions;
  initialFilters?: DashboardFilters;
  initialRead?: HrDashboardSeed;
}

/** Only confirmed values become numbers. Unknown/restricted metrics stay absent. */
function numbers<T extends Record<string, HrDashboardMetric>>(metrics?: T): {[K in keyof T]: number | undefined} | undefined {
  return metrics ? Object.fromEntries(Object.entries(metrics).map(([key, metric]) => [key, metric.status === "ready" ? metric.value : undefined])) as {[K in keyof T]: number | undefined} : undefined;
}
function allReady(metrics?: Record<string, HrDashboardMetric>) {return !!metrics && Object.values(metrics).every(m => m.status === "ready");}
export function HrDashboardPageClient({ authContext, permissions, initialFilters = {}, initialRead }: HrDashboardPageClientProps) {
  const [filters] = useState<DashboardFilters>(initialFilters);

  const read = useHrDashboard(authContext, filters, initialRead);
  const isRefreshing = read.isFetching, handleRefresh = read.retry;
  const loading = {isLoading: read.isPending || read.isFetching};
  const summaryQuery = loading, employeeQuery = loading, complianceQuery = loading, timeQuery = loading;
  const payrollQuery = loading, operationsQuery = loading, actionsQuery = loading, recruitmentQuery = loading, attentionQuery = loading;
  const summary = numbers(read.data?.summary), emp = numbers(read.data?.employee), comp = numbers(read.data?.compliance);
  const time = numbers(read.data?.time), payroll = numbers(read.data?.payroll), ops = numbers(read.data?.operations);
  const acts = numbers(read.data?.actions), recruit = numbers(read.data?.recruitment), attention = read.data?.attention.items ?? [];
  const metrics = read.data ? [read.data.employee, read.data.compliance, read.data.time, read.data.payroll, read.data.operations, read.data.actions, read.data.recruitment, read.data.summary].flatMap(v => Object.values(v)) : [];
  const partialFailure = metrics.some(m => m.status === "failed");

  // ── KPI top strip ─────────────────────────────────────────────────────────

  const kpiCards: HrKpiCard[] = [
    {
      label: "Total Employees",
      value: summaryQuery.isLoading ? "—" : (summary?.employee_total?.toLocaleString() ?? "—"),
      sub: `${summary?.employee_active ?? "—"} active / probation`,
      href: "/admin/hr/employees",
      icon: Users,
      accent: "blue",
    },
    {
      label: "Compliance Issues",
      value: summaryQuery.isLoading ? "—" : (summary?.compliance_issues?.toLocaleString() ?? "—"),
      sub: "expired / expiring docs",
      href: "/admin/hr/employees",
      icon: ShieldCheck,
      accent: summary && (summary.compliance_issues ?? 0) > 0 ? "amber" : "slate",
    },
    {
      label: "Attendance Pending",
      value: summaryQuery.isLoading ? "—" : (summary?.attendance_pending?.toLocaleString() ?? "—"),
      sub: "awaiting approval",
      href: "/admin/hr/time/attendance",
      icon: Clock,
      accent: summary && (summary.attendance_pending ?? 0) > 0 ? "amber" : "slate",
    },
    {
      label: "WPS Ready",
      value: summaryQuery.isLoading ? "—" : (summary?.wps_ready_pct != null ? `${summary.wps_ready_pct}%` : "—"),
      sub: "of permitted active/probation WPS enrolments",
      href: "/admin/hr/payroll/wps",
      icon: Landmark,
      accent: "emerald",
    },
    {
      label: "Active Blocks",
      value: summaryQuery.isLoading ? "—" : (summary?.active_blocks?.toLocaleString() ?? "—"),
      sub: "operational blocks",
      href: "/admin/hr/operations/blocks",
      icon: AlertOctagon,
      accent: summary && (summary.active_blocks ?? 0) > 0 ? "red" : "slate",
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

  if (read.denied) return <div role="alert">Your dashboard access could not be verified. Sign in again or contact your administrator.</div>;
  return (
    <QueryReadBoundary queries={[read]}>
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
              Workforce records — headcount, compliance, payroll, and readiness
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

      <p className="text-xs text-muted-foreground">Counts cover records permitted by your current access. A dash means unavailable or restricted, not zero. Recruitment, category and clearance totals retain their all-permitted-record scope.</p>
      {read.data&&<p className="text-xs text-muted-foreground">Refreshed {new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dubai',dateStyle:'medium',timeStyle:'short'}).format(new Date(read.data.asOf))} Dubai time. Counts are read-time observations, not an atomic historical report. Weekly interviews use Sunday–Saturday in Dubai; task counts include unfinished and blocked work.</p>}
      <p className="text-xs text-muted-foreground">Site readiness counts are saved checks, not unique currently deployable employees. Recheck current evidence, rules and restrictions before assignment; active blocks are a separate people count.</p>
      {partialFailure && <p role="status" className="text-sm text-destructive">Some dashboard counts could not be loaded. Use Refresh to retry; unavailable values are not an all-clear result.</p>}
      {metrics.some(m => m.status === "unavailable" && m.reason === "scope") && <p role="status" className="text-xs text-muted-foreground">Some payroll totals cannot be verified across the selected employee scope.</p>}
      {read.data?.compliance.medical_expired.status === "unavailable" && <p className="text-xs text-muted-foreground">Medical expiry needs an agreed validity rule. A next examination date is not an expiry date.</p>}

      {/* Hero row — readiness ring + KPI strip */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        <div className="lg:col-span-1">
          <HrWorkforceReadinessRing
            ready={ops?.ready_employees ?? 0}
            notReady={ops?.not_ready_employees ?? 0}
            blocked={ops?.blocked_employees ?? 0}
            isLoading={operationsQuery.isLoading}
            hasAccess={permissions.canViewAssignments}
            unavailable={read.isError || !!read.data && [read.data.operations.ready_employees, read.data.operations.not_ready_employees, read.data.operations.blocked_employees].some(m => m.status !== "ready")}
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
          severity={permissions.canViewEmployees && allReady(read.data?.employee) ? employeeSeverity : undefined}
        >
          {employeeQuery.isLoading ? (
            <SectionSkeleton />
          ) : (
            <>
              <HrDashboardStatItem label="Total employees" value={emp?.total ?? "—"} href="/admin/hr/employees" />
              <HrDashboardStatItem label="Active" value={emp?.active ?? "—"} href="/admin/hr/employees?status=active" variant="success" />
              <HrDashboardStatItem label="Probation" value={emp?.probation ?? "—"} href="/admin/hr/employees?status=probation" variant="warning" />
              <HrDashboardStatItem label="On leave" value={emp?.on_leave ?? "—"} href="/admin/hr/employees?status=on_leave" />
              <HrDashboardStatItem label="Suspended" value={emp?.suspended ?? "—"} href="/admin/hr/employees?status=suspended" variant={emp?.suspended ? "danger" : "default"} />
              <HrDashboardStatItem label="Terminated / resigned / archived" value={emp?.terminated_archived ?? "—"} href="/admin/hr/employees" variant="muted" />
              <HrDashboardStatItem label="New joiners this month" value={emp?.new_joiners_this_month ?? "—"} variant="success" />
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
          severity={permissions.canViewCompliance && allReady(read.data?.compliance) ? complianceSeverity : undefined}
        >
          {complianceQuery.isLoading ? (
            <SectionSkeleton />
          ) : (
            <>
              <HrDashboardStatItem label="Expired documents" value={comp?.expired_documents ?? "—"} variant={comp?.expired_documents ? "danger" : "default"} />
              <HrDashboardStatItem label={`Expiring soon (${read.data?.filters.expiryThresholdDays ?? 60} days)`} value={comp?.expiring_soon ?? "—"} variant={comp?.expiring_soon ? "warning" : "default"} />
              <HrDashboardStatItem label="Unverified / failed evidence" value={comp?.missing_unverified ?? "—"} variant={comp?.missing_unverified ? "warning" : "default"} />
              <HrDashboardStatItem label="Active access cards" value={comp?.active_access_cards ?? "—"} variant="success" />
              <HrDashboardStatItem label="Expired access cards" value={comp?.expired_access_cards ?? "—"} variant={comp?.expired_access_cards ? "danger" : "default"} />
              <HrDashboardStatItem label="Training expiring soon" value={comp?.training_expiring_soon ?? "—"} variant={comp?.training_expiring_soon ? "warning" : "default"} />
              {read.data && read.data.compliance.medical_expired.status !== "restricted" && (
                <HrDashboardStatItem label="Medical records expired" value={comp?.medical_expired ?? "—"} variant={(comp?.medical_expired ?? 0) > 0 ? "danger" : "default"} />
              )}
              <HrDashboardStatItem label="Linked DMS documents" value={comp?.linked_dms_documents ?? "—"} />
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
          severity={(permissions.canViewAttendance || permissions.canViewLeave) && allReady(read.data?.time) ? timeSeverity : undefined}
        >
          {timeQuery.isLoading ? (
            <SectionSkeleton />
          ) : (
            <>
              <HrDashboardStatItem label="Attendance pending approval" value={time?.attendance_pending_approval ?? "—"} href="/admin/hr/time/attendance" variant={time?.attendance_pending_approval ? "warning" : "default"} />
              <HrDashboardStatItem label="Missing punches" value={time?.missing_punches ?? "—"} href="/admin/hr/time/attendance" variant={time?.missing_punches ? "warning" : "default"} />
              <HrDashboardStatItem label="Approved leave today" value={time?.approved_leave_today ?? "—"} href="/admin/hr/time/leave" />
              <HrDashboardStatItem label="Pending leave requests" value={time?.pending_leave_requests ?? "—"} href="/admin/hr/time/leave" variant={time?.pending_leave_requests ? "warning" : "default"} />
              <HrDashboardStatItem label="Overtime pending approval" value={time?.overtime_pending_approval ?? "—"} href="/admin/hr/time/attendance" variant={time?.overtime_pending_approval ? "warning" : "default"} />
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
          severity={permissions.canViewPayroll && allReady(read.data?.payroll) ? payrollSeverity : undefined}
        >
          {payrollQuery.isLoading ? (
            <SectionSkeleton />
          ) : !payroll ? (
            <p className="text-xs text-muted-foreground py-2">No payroll access.</p>
          ) : (
            <>
              <HrDashboardStatItem label="Payroll profiles configured" value={payroll.payroll_profiles_configured ?? "—"} href="/admin/hr/payroll/salaries" variant="success" />
              <HrDashboardStatItem label="Missing payroll profile" value={payroll.missing_payroll_profile ?? "—"} variant={(payroll.missing_payroll_profile ?? 0) > 0 ? "warning" : "default"} />
              <HrDashboardStatItem label="WPS ready" value={payroll.wps_ready ?? "—"} href="/admin/hr/payroll/wps" variant="success" />
              <HrDashboardStatItem label="WPS incomplete" value={payroll.wps_incomplete ?? "—"} href="/admin/hr/payroll/wps" variant={(payroll.wps_incomplete ?? 0) > 0 ? "warning" : "default"} />
              <HrDashboardStatItem label="On payroll hold" value={payroll.on_payroll_hold ?? "—"} variant={(payroll.on_payroll_hold ?? 0) > 0 ? "danger" : "default"} />
              <HrDashboardStatItem label="Missing IBAN / bank" value={payroll.missing_iban_bank ?? "—"} href="/admin/hr/payroll/wps" variant={(payroll.missing_iban_bank ?? 0) > 0 ? "warning" : "default"} />
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
          severity={permissions.canViewAssignments && allReady(read.data?.operations) ? operationsSeverity : undefined}
        >
          {operationsQuery.isLoading ? (
            <SectionSkeleton />
          ) : (
            <>
              <HrDashboardStatItem label="Current assignments" value={ops?.current_assignments ?? "—"} href="/admin/hr/operations/assignments" />
              <HrDashboardStatItem label="Saved Ready checks" value={ops?.ready_employees ?? "—"} href="/admin/hr/operations/readiness" variant="success" />
              <HrDashboardStatItem label="Saved not-ready checks" value={ops?.not_ready_employees ?? "—"} href="/admin/hr/operations/readiness" variant={ops?.not_ready_employees ? "warning" : "default"} />
              <HrDashboardStatItem label="People with active blocks" value={ops?.blocked_employees ?? "—"} href="/admin/hr/operations/blocks" variant={ops?.blocked_employees ? "danger" : "default"} />
              <HrDashboardStatItem label="Active operational blocks" value={ops?.active_blocks ?? "—"} href="/admin/hr/operations/blocks" variant={ops?.active_blocks ? "danger" : "default"} />
              <HrDashboardStatItem label="Assets issued" value={ops?.assets_issued ?? "—"} />
              <HrDashboardStatItem label="PPE due for replacement" value={ops?.ppe_due_replacement ?? "—"} variant={ops?.ppe_due_replacement ? "warning" : "default"} />
              <HrDashboardStatItem label="Accommodation active" value={ops?.accommodation_active ?? "—"} />
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
          severity={permissions.canViewActions && allReady(read.data?.actions) ? actionsSeverity : undefined}
        >
          {actionsQuery.isLoading ? (
            <SectionSkeleton />
          ) : (
            <>
              <HrDashboardStatItem label="Open PRO processes" value={acts?.open_pro_processes ?? "—"} href="/admin/hr/actions/pro" variant={acts?.open_pro_processes ? "warning" : "default"} />
              <HrDashboardStatItem label="Open HR actions" value={acts?.open_hr_actions ?? "—"} href="/admin/hr/actions" variant={acts?.open_hr_actions ? "warning" : "default"} />
              <HrDashboardStatItem label="Pending approvals" value={acts?.pending_approvals ?? "—"} href="/admin/hr/actions/approvals" variant={acts?.pending_approvals ? "danger" : "default"} />
              <HrDashboardStatItem label="Open disciplinary records" value={acts?.open_disciplinary ?? "—"} href="/admin/hr/actions/disciplinary" variant={acts?.open_disciplinary ? "warning" : "default"} />
              <HrDashboardStatItem label="Open EOS cases" value={acts?.open_eos_cases ?? "—"} href="/admin/hr/actions/eos" variant={acts?.open_eos_cases ? "warning" : "default"} />
              <HrDashboardStatItem label="Pending clearance items" value={acts?.pending_clearance_items ?? "—"} href="/admin/hr/actions/eos" variant={acts?.pending_clearance_items ? "warning" : "default"} />
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
          severity={permissions.canViewRecruitment && allReady(read.data?.recruitment) ? recruitmentSeverity : undefined}
        >
          {recruitmentQuery.isLoading ? (
            <SectionSkeleton />
          ) : !recruit ? (
            <p className="text-xs text-muted-foreground py-2">No recruitment access.</p>
          ) : (
            <>
              <HrDashboardStatItem label="Open requisitions" value={recruit.open_requisitions ?? "—"} href="/admin/hr/recruitment/requisitions" />
              <HrDashboardStatItem label="Active candidates" value={recruit.active_candidates ?? "—"} href="/admin/hr/recruitment/candidates" />
              <HrDashboardStatItem label="Interviews this week" value={recruit.interviews_this_week ?? "—"} href="/admin/hr/recruitment/interviews" variant={(recruit.interviews_this_week ?? 0) > 0 ? "warning" : "default"} />
              <HrDashboardStatItem label="Offers pending" value={recruit.offers_pending ?? "—"} href="/admin/hr/recruitment/offers" variant={(recruit.offers_pending ?? 0) > 0 ? "warning" : "default"} />
              <HrDashboardStatItem label="Offers accepted" value={recruit.offers_accepted ?? "—"} href="/admin/hr/recruitment/offers" variant="success" />
              <HrDashboardStatItem label="Onboarding tasks pending" value={recruit.onboarding_tasks_pending ?? "—"} href="/admin/hr/recruitment/onboarding" variant={(recruit.onboarding_tasks_pending ?? 0) > 0 ? "warning" : "default"} />
              <HrDashboardStatItem label="Converted this month" value={recruit.converted_this_month ?? "—"} href="/admin/hr/employees" variant="success" />
            </>
          )}
        </HrDashboardSectionCard>

        {/* 8. Headcount by Category */}
        {permissions.canViewEmployees && <HrHeadcountByCategoryWidget data={read.data?.headcount} isLoading={loading.isLoading} retry={read.retry} />}

      </div>

      {/* Attention Items */}
      <ERPSectionCard
        title="Attention Required"
        description="Items requiring HR team action — sorted by severity then due date"
        actions={
          <span className="text-xs text-muted-foreground">
            {attentionQuery.isLoading ? "Loading…" : !read.data ? "Unavailable" : `${attention.length} shown${read.data.attention.limited ? " · limited priority list" : ""}`}
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
          <>
            {!!read.data?.attention.failedSources.length && <p role="status" className="text-sm text-destructive mb-3">Some attention checks failed ({read.data.attention.failedSources.join(", ")}). Use Refresh to retry; this is not an all-clear result.</p>}
            {attention.length > 0 || (read.data?.attention.availableSources ?? 0) > 0 && read.data?.attention.failedSources.length === 0 ? <HrDashboardAlerts items={attention} /> : read.data?.attention.availableSources === 0 ? <p>Attention checks are restricted by your access.</p> : null}
          </>
        )}
      </ERPSectionCard>
    </div>
    </QueryReadBoundary>
  );
}
