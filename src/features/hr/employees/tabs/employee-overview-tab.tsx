"use client";

import { useQuery } from "@tanstack/react-query";
import type { EmployeeListRow } from "@/server/actions/hr/employees";
import { getEmployeeComplianceSummary } from "@/server/actions/hr/compliance";
import { getEmployeeTimeSummary } from "@/server/actions/hr/time";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import {
  User, Briefcase, Phone, FileText, Clock, Shield,
  FileKey2, Heart, Users, CreditCard, GraduationCap, Activity,
  Calendar, Plane, Timer, DollarSign, Landmark, PauseCircle, Lock,
  MapPin, AlertOctagon, Package, HardHat, Home, ShieldCheck,
  Globe, Zap, TrendingUp, AlertTriangle, CheckSquare, UserMinus,
} from "lucide-react";
import { queryKeys } from "@/lib/query/query-keys";
import { formatHours } from "@/lib/hr/time/date-utils";
import { getEmployeePayrollSummary } from "@/server/actions/hr/payroll";
import {
  getWpsReadinessLabel,
  getWpsReadinessBadgeVariant,
} from "@/lib/hr/payroll/wps-readiness";
import { getEmployeeOperationsSummary } from "@/server/actions/hr/operations";
import { getReadinessStatusBadge } from "@/lib/hr/operations/status";
import { getEmployeeHrActionsSummary } from "@/server/actions/hr/actions";
import { getEmployeeRecruitmentLink } from "@/server/actions/hr/recruitment";
import Link from "next/link";

type Props = {
  employee: EmployeeListRow;
  canViewCompliance?: boolean;
  canViewTime?: boolean;
  canViewPayroll?: boolean;
  canViewOperations?: boolean;
  canViewHrActions?: boolean;
  canViewRecruitment?: boolean;
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  active: "default",
  probation: "secondary",
  on_leave: "secondary",
  inactive: "outline",
  suspended: "destructive",
  terminated: "destructive",
  archived: "outline",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  probation: "Probation",
  on_leave: "On Leave",
  inactive: "Inactive",
  suspended: "Suspended",
  terminated: "Terminated",
  archived: "Archived",
};

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value || "—"}</span>
    </div>
  );
}

function PlaceholderCard({ title, phase }: { title: string; phase: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="pt-6 pb-4 flex flex-col items-center gap-2 text-center text-muted-foreground">
        <Clock className="h-6 w-6 opacity-40" />
        <p className="text-sm font-medium">{title}</p>
        <span className="text-xs bg-muted px-2 py-0.5 rounded-full">Available in {phase}</span>
      </CardContent>
    </Card>
  );
}

export function EmployeeOverviewTab({ employee, canViewCompliance, canViewTime, canViewPayroll, canViewOperations, canViewHrActions, canViewRecruitment }: Props) {
  return (
    <div className="space-y-6 p-6">
      {/* Employee Identity */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <User className="h-4 w-4" />
            Employee Identity
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <InfoRow label="Employee Code" value={employee.employee_code} />
          <InfoRow label="Full Name (EN)" value={employee.full_name_en} />
          <InfoRow label="Full Name (AR)" value={employee.full_name_ar} />
          <InfoRow label="Known Name" value={employee.known_name} />
          <InfoRow
            label="Gender"
            value={employee.gender === "male" ? "Male" : employee.gender === "female" ? "Female" : employee.gender}
          />
          <InfoRow label="Nationality" value={(employee.nationality as { name_en?: string } | null)?.name_en} />
          <InfoRow
            label="Date of Birth"
            value={employee.date_of_birth ? format(new Date(employee.date_of_birth), "dd MMM yyyy") : undefined}
          />
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">Status</span>
            <Badge variant={STATUS_VARIANT[employee.employee_status] ?? "outline"} className="w-fit">
              {STATUS_LABEL[employee.employee_status] ?? employee.employee_status}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Employment Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Briefcase className="h-4 w-4" />
            Employment Details
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <InfoRow label="Company" value={(employee.owner_company as { legal_name_en?: string } | null)?.legal_name_en} />
          <InfoRow label="Branch" value={(employee.branch as { branch_name_en?: string } | null)?.branch_name_en} />
          <InfoRow label="Department" value={(employee.department as { department_name_en?: string } | null)?.department_name_en} />
          <InfoRow label="Designation" value={(employee.designation as { designation_name_en?: string } | null)?.designation_name_en} />
          <InfoRow label="Category" value={(employee.employee_category as { name_en?: string } | null)?.name_en} />
          <InfoRow label="Employment Type" value={(employee.employment_type as { name_en?: string } | null)?.name_en} />
          <InfoRow
            label="Joining Date"
            value={employee.joining_date ? format(new Date(employee.joining_date), "dd MMM yyyy") : undefined}
          />
          <InfoRow label="Work Site" value={(employee.primary_work_site as { site_name?: string } | null)?.site_name} />
        </CardContent>
      </Card>

      {/* Contact / Emergency */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Phone className="h-4 w-4" />
            Contact & Emergency
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <InfoRow label="Mobile" value={employee.mobile_number} />
          <InfoRow label="Personal Email" value={employee.personal_email} />
          <InfoRow label="Emergency Contact" value={employee.emergency_contact_name} />
          <InfoRow label="Emergency Mobile" value={employee.emergency_contact_mobile} />
        </CardContent>
      </Card>

      {/* Contract / Probation */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-4 w-4" />
            Contract & Probation
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <InfoRow label="Contract Type" value={employee.contract_type} />
          <InfoRow
            label="Contract Start"
            value={employee.contract_start_date ? format(new Date(employee.contract_start_date), "dd MMM yyyy") : undefined}
          />
          <InfoRow
            label="Contract End"
            value={employee.contract_end_date ? format(new Date(employee.contract_end_date), "dd MMM yyyy") : undefined}
          />
          <InfoRow
            label="Notice Period"
            value={employee.notice_period_days != null ? `${employee.notice_period_days} days` : undefined}
          />
          <InfoRow
            label="Probation Start"
            value={employee.probation_start_date ? format(new Date(employee.probation_start_date), "dd MMM yyyy") : undefined}
          />
          <InfoRow
            label="Probation End"
            value={employee.probation_end_date ? format(new Date(employee.probation_end_date), "dd MMM yyyy") : undefined}
          />
        </CardContent>
      </Card>

      {/* Compliance Summary (HR.3) */}
      <ComplianceSummarySection employeeId={employee.id} canView={canViewCompliance ?? false} />

      {/* Time Summary (HR.4) */}
      <TimeSummarySection employeeId={employee.id} canView={canViewTime ?? false} />

      {/* Payroll Summary (HR.5) */}
      <PayrollSummarySection employeeId={employee.id} canView={canViewPayroll ?? false} />

      {/* Operations Summary (HR.6) */}
      <OperationsSummarySection employeeId={employee.id} canView={canViewOperations ?? false} />

      {/* HR Actions Summary (HR.7) */}
      <HrActionsSummarySection employeeId={employee.id} canView={canViewHrActions ?? false} />

      {/* Recruitment Link (HR.8) */}
      <RecruitmentLinkSection employeeId={employee.id} canView={canViewRecruitment ?? false} />

      {/* Future Phase Placeholders */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <PlaceholderCard title="AI Review" phase="HR.12" />
      </div>
    </div>
  );
}

// ── Recruitment Link Component (HR.8) ────────────────────────────────────────

function RecruitmentLinkSection({ employeeId, canView }: { employeeId: number; canView: boolean }) {
  const { data: linkRes, isLoading } = useQuery({
    queryKey: queryKeys.recruitment.employeeRecruitmentLink(employeeId),
    enabled: canView,
    queryFn: () => getEmployeeRecruitmentLink(employeeId),
    staleTime: 60_000,
  });

  if (!canView) return null;

  const link = linkRes?.data;
  if (!isLoading && !link) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Users className="h-4 w-4" />
          Recruitment Origin
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-8 bg-muted animate-pulse rounded" />
        ) : link ? (
          <div className="text-sm space-y-1">
            {link.candidate && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Candidate:</span>
                <Link href={`/admin/hr/recruitment/candidates/record/${link.candidate_id}`} className="text-blue-600 hover:underline font-medium">
                  {link.candidate.full_name_en} {link.candidate.candidate_code ? `(${link.candidate.candidate_code})` : ""}
                </Link>
              </div>
            )}
            {link.requisition && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Requisition:</span>
                <span className="font-medium">{link.requisition.requisition_code ?? ""} — {link.requisition.requisition_title}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Converted:</span>
              <span className="font-medium">{new Date(link.converted_at).toLocaleDateString()}</span>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ── HR Actions Summary Component (HR.7) ──────────────────────────────────────

function HrActionsSummarySection({ employeeId, canView }: { employeeId: number; canView: boolean }) {
  const { data: summary, isLoading } = useQuery({
    queryKey: queryKeys.hr.actions.summary(employeeId),
    enabled: canView,
    queryFn: () => getEmployeeHrActionsSummary(employeeId),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Zap className="h-4 w-4 text-muted-foreground" />
          HR Actions Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!canView ? (
          <div className="text-xs text-muted-foreground flex items-center gap-2 py-2">
            <Lock className="h-3.5 w-3.5" />
            <span>Requires HR actions view permission.</span>
          </div>
        ) : isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1 p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Open PRO Processes</span>
              </div>
              <p className={`text-xl font-bold ${(summary?.open_pro_processes ?? 0) > 0 ? "text-blue-600" : ""}`}>{summary?.open_pro_processes ?? 0}</p>
            </div>
            <div className="flex flex-col gap-1 p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Open HR Actions</span>
              </div>
              <p className={`text-xl font-bold ${(summary?.open_hr_actions ?? 0) > 0 ? "text-amber-600" : ""}`}>{summary?.open_hr_actions ?? 0}</p>
            </div>
            <div className="flex flex-col gap-1 p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Performance Reviews</span>
              </div>
              <p className="text-xl font-bold">{summary?.performance_reviews ?? 0}</p>
            </div>
            <div className="flex flex-col gap-1 p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Open Disciplinary</span>
              </div>
              <p className={`text-xl font-bold ${(summary?.open_disciplinary ?? 0) > 0 ? "text-destructive" : ""}`}>{summary?.open_disciplinary ?? 0}</p>
            </div>
            <div className="flex flex-col gap-1 p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-1.5">
                <CheckSquare className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Pending Approvals</span>
              </div>
              <p className={`text-xl font-bold ${(summary?.pending_approvals ?? 0) > 0 ? "text-amber-600" : ""}`}>{summary?.pending_approvals ?? 0}</p>
            </div>
            <div className="flex flex-col gap-1 p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-1.5">
                <UserMinus className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">EOS Case</span>
              </div>
              <p className={`text-sm font-bold ${summary?.open_eos_case ? "text-orange-600" : "text-muted-foreground"}`}>
                {summary?.open_eos_case ? "Active" : "None"}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Compliance Summary Component ──────────────────────────────────────────────

function ComplianceSummarySection({ employeeId, canView }: { employeeId: number; canView: boolean }) {
  const { data: summary, isLoading } = useQuery({
    queryKey: queryKeys.hr.compliance.summary(employeeId),
    enabled: canView,
    queryFn: async () => {
      const r = await getEmployeeComplianceSummary(employeeId);
      return r.success ? r.data ?? null : null;
    },
  });

  if (!canView) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Shield className="h-4 w-4" />
          Compliance Overview
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && <Skeleton className="h-16 w-full" />}
        {!isLoading && !summary && (
          <p className="text-sm text-muted-foreground">No compliance data available.</p>
        )}
        {!isLoading && summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <ComplianceMiniCard
              icon={FileKey2}
              label="Identity Docs"
              total={summary.identityDocuments.total}
              active={summary.identityDocuments.active}
              expiringSoon={summary.identityDocuments.expiringSoon}
              expired={summary.identityDocuments.expired}
            />
            <ComplianceMiniCard
              icon={Heart}
              label="Medical Insurance"
              total={summary.medicalInsurances.total}
              active={summary.medicalInsurances.active}
              expiringSoon={summary.medicalInsurances.expiringSoon}
              expired={summary.medicalInsurances.expired}
            />
            <ComplianceMiniCard
              icon={Users}
              label="Dependents"
              total={summary.dependents.total}
              active={summary.dependents.active}
            />
            <ComplianceMiniCard
              icon={CreditCard}
              label="Access Cards"
              total={summary.accessCards.total}
              active={summary.accessCards.active}
              expiringSoon={summary.accessCards.expiringSoon}
              expired={summary.accessCards.expired}
            />
            <ComplianceMiniCard
              icon={GraduationCap}
              label="Training"
              total={summary.trainingCertificates.total}
              active={summary.trainingCertificates.valid}
              expiringSoon={summary.trainingCertificates.expiringSoon}
              expired={summary.trainingCertificates.expired}
            />
            {summary.medicalRecords !== null && (
              <div className="flex flex-col gap-1 p-3 rounded-lg border bg-card">
                <div className="flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Medical Fitness</span>
                </div>
                <p className="text-xl font-bold">{summary.medicalRecords.total}</p>
                <p className="text-xs text-muted-foreground">
                  {summary.medicalRecords.fit} fit
                </p>
              </div>
            )}
            <div className="flex flex-col gap-1 p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">DMS Documents</span>
              </div>
              <p className="text-xl font-bold">{summary.dmsDocuments.total}</p>
              <p className="text-xs text-muted-foreground">linked</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ComplianceMiniCard({
  icon: Icon, label, total, active, expiringSoon, expired,
}: {
  icon: React.ElementType;
  label: string;
  total: number;
  active?: number;
  expiringSoon?: number;
  expired?: number;
}) {
  return (
    <div className="flex flex-col gap-1 p-3 rounded-lg border bg-card">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-xl font-bold">{total}</p>
      <div className="flex gap-2 flex-wrap">
        {active !== undefined && active > 0 && (
          <span className="text-xs text-emerald-600">{active} active</span>
        )}
        {expiringSoon !== undefined && expiringSoon > 0 && (
          <span className="text-xs text-amber-600">{expiringSoon} expiring</span>
        )}
        {expired !== undefined && expired > 0 && (
          <span className="text-xs text-destructive">{expired} expired</span>
        )}
        {total === 0 && <span className="text-xs text-muted-foreground">none</span>}
      </div>
    </div>
  );
}

// ── Payroll Summary Component (HR.5) ──────────────────────────────────────────

function PayrollSummarySection({ employeeId, canView }: { employeeId: number; canView: boolean }) {
  const { data: summary, isLoading } = useQuery({
    queryKey: queryKeys.hr.payroll.summary(employeeId),
    enabled: canView,
    queryFn: async () => {
      const r = await getEmployeePayrollSummary(employeeId);
      return r.success ? r.data ?? null : null;
    },
  });

  if (!canView) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <DollarSign className="h-4 w-4" />
            Payroll & WPS Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Lock className="h-4 w-4" />
            Payroll information is restricted.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <DollarSign className="h-4 w-4" />
          Payroll & WPS Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && <Skeleton className="h-16 w-full" />}
        {!isLoading && !summary && (
          <p className="text-sm text-muted-foreground">No payroll data available.</p>
        )}
        {!isLoading && summary && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="flex flex-col gap-1 p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Payroll Status</span>
              </div>
              <p className="text-sm font-bold capitalize">{summary.payrollStatus ?? "—"}</p>
            </div>
            <div className="flex flex-col gap-1 p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Gross Salary</span>
              </div>
              <p className="text-sm font-bold text-green-700">
                {summary.grossSalary !== null
                  ? `AED ${summary.grossSalary.toLocaleString("en-AE", { minimumFractionDigits: 2 })}`
                  : "***"}
              </p>
            </div>
            <div className="flex flex-col gap-1 p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-1.5">
                <Landmark className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">WPS Status</span>
              </div>
              <p className="text-sm font-bold capitalize">{summary.wpsStatus ?? "—"}</p>
            </div>
            <div className="flex flex-col gap-1 p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-1.5">
                <Landmark className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">WPS Readiness</span>
              </div>
              {summary.wpsReadiness ? (
                <Badge variant={getWpsReadinessBadgeVariant(summary.wpsReadiness.status)} className="w-fit text-xs">
                  {getWpsReadinessLabel(summary.wpsReadiness.status)}
                </Badge>
              ) : (
                <p className="text-sm font-bold text-muted-foreground">—</p>
              )}
            </div>
            <div className="flex flex-col gap-1 p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-1.5">
                <PauseCircle className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Payroll Hold</span>
              </div>
              <p className={`text-sm font-bold ${summary.hasActiveHold ? "text-destructive" : "text-muted-foreground"}`}>
                {summary.hasActiveHold ? "Active Hold" : "None"}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Time Summary Component (HR.4) ─────────────────────────────────────────────

function TimeSummarySection({ employeeId, canView }: { employeeId: number; canView: boolean }) {
  const { data: summary, isLoading } = useQuery({
    queryKey: queryKeys.hr.time.summary(employeeId),
    enabled: canView,
    queryFn: async () => {
      const r = await getEmployeeTimeSummary(employeeId);
      return r.success ? r.data ?? null : null;
    },
  });

  if (!canView) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Clock className="h-4 w-4" />
          Time Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && <Skeleton className="h-16 w-full" />}
        {!isLoading && !summary && (
          <p className="text-sm text-muted-foreground">No time data available.</p>
        )}
        {!isLoading && summary && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="flex flex-col gap-1 p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Attendance (Month)</span>
              </div>
              <p className="text-xl font-bold">{summary.attendanceThisMonthCount}</p>
              <p className="text-xs text-muted-foreground">days recorded</p>
            </div>
            <div className="flex flex-col gap-1 p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Current Shift</span>
              </div>
              <p className="text-sm font-bold truncate">
                {summary.currentShiftAssignment?.work_shift?.shift_name ?? "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                {summary.currentShiftAssignment?.work_calendar?.calendar_name ?? "No calendar"}
              </p>
            </div>
            <div className="flex flex-col gap-1 p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-1.5">
                <Plane className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Pending Leave</span>
              </div>
              <p className="text-xl font-bold">{summary.pendingLeaveCount}</p>
              <p className="text-xs text-muted-foreground">request(s)</p>
            </div>
            <div className="flex flex-col gap-1 p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-1.5">
                <Plane className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Leave Balances</span>
              </div>
              <p className="text-xl font-bold">{summary.leaveBalances.length}</p>
              <p className="text-xs text-muted-foreground">type(s) configured</p>
            </div>
            <div className="flex flex-col gap-1 p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-1.5">
                <Timer className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">OT (Month)</span>
              </div>
              <p className="text-xl font-bold">{formatHours(summary.overtimeHoursThisMonth)}</p>
              <p className="text-xs text-muted-foreground">approved</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Operations Summary Component (HR.6) ──────────────────────────────────────

function OperationsSummarySection({ employeeId, canView }: { employeeId: number; canView: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.hr.operations.summary(employeeId),
    queryFn: () => getEmployeeOperationsSummary(employeeId),
    enabled: canView,
  });

  const summary = data?.success ? data.data : null;

  const readinessRecords = (summary?.siteReadinessRecords ?? []) as Record<string, unknown>[];
  const overallReadiness =
    readinessRecords.length > 0
      ? readinessRecords[0]?.readiness_status ?? "not_ready"
      : "needs_review";
  const readinessBadge = getReadinessStatusBadge(overallReadiness as string);

  const currentAssignment = summary?.currentAssignment as Record<string, unknown> | null;
  const dept = (currentAssignment?.departments as Record<string, unknown> | null)?.name_en;
  const desg = (currentAssignment?.designations as Record<string, unknown> | null)?.name_en;
  const site = (currentAssignment?.work_sites as Record<string, unknown> | null)?.name_en;
  const assignmentLabel = [dept, desg, site].filter(Boolean).join(" · ") || null;

  const activeAccommodation = summary?.activeAccommodation as Record<string, unknown> | null;
  const accommodationLabel = activeAccommodation?.accommodation_location as string | null ?? null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <MapPin className="h-4 w-4" />
          Operations &amp; Readiness
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!canView ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Lock className="h-4 w-4" />
            <span>Requires operations view permission.</span>
          </div>
        ) : isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1 p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Current Assignment</span>
              </div>
              <p className="text-sm font-bold truncate">{assignmentLabel ?? "—"}</p>
              <p className="text-xs text-muted-foreground">{currentAssignment ? "Active" : "No current assignment"}</p>
            </div>
            <div className="flex flex-col gap-1 p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Readiness Status</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`text-sm font-bold ${readinessBadge.variant === "destructive" ? "text-destructive" : readinessBadge.variant === "secondary" ? "text-amber-600" : "text-green-600"}`}>
                  {readinessBadge.label}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {readinessRecords.length > 0 ? `${readinessRecords.length} site(s) tracked` : "No readiness calculated"}
              </p>
            </div>
            <div className="flex flex-col gap-1 p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-1.5">
                <AlertOctagon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Active Blocks</span>
              </div>
              <p className={`text-xl font-bold ${(summary?.activeBlockCount ?? 0) > 0 ? "text-destructive" : ""}`}>
                {summary?.activeBlockCount ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">operational block(s)</p>
            </div>
            <div className="flex flex-col gap-1 p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Assets Issued</span>
              </div>
              <p className="text-xl font-bold">{summary?.issuedAssetCount ?? 0}</p>
              <p className="text-xs text-muted-foreground">item(s)</p>
            </div>
            <div className="flex flex-col gap-1 p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-1.5">
                <HardHat className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">PPE Issued</span>
              </div>
              <p className="text-xl font-bold">{summary?.issuedPpeCount ?? 0}</p>
              <p className="text-xs text-muted-foreground">item(s)</p>
            </div>
            <div className="flex flex-col gap-1 p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-1.5">
                <Home className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Accommodation</span>
              </div>
              <p className="text-sm font-bold truncate">{accommodationLabel ?? "—"}</p>
              <p className="text-xs text-muted-foreground">
                {activeAccommodation ? "Active" : "No accommodation record"}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
