/**
 * Global ERP Report Center — Report Fetcher Dispatch Map
 * Phase: REPORT.4 — HR.11 Reports + Letters + Forms Library
 *
 * Server-side only. Do NOT import in client components.
 */

import type { ReportFetcher, ReportDataResult } from "./types";
import { createAdminClient } from "@/lib/supabase/admin";

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN_PERMISSION_MATRIX fetcher
// ─────────────────────────────────────────────────────────────────────────────

const adminPermissionMatrixFetcher: ReportFetcher = {
  reportCode: "ADMIN_PERMISSION_MATRIX",
  async fetch(): Promise<ReportDataResult> {
    const db = createAdminClient();
    const { data: perms } = await db
      .from("permissions")
      .select("permission_code, permission_name, module_code, action_code, is_active")
      .eq("is_active", true)
      .order("module_code")
      .order("permission_code");

    const rows = (perms ?? []).map((p) => ({
      module_code: p.module_code,
      permission_code: p.permission_code,
      permission_name: p.permission_name,
      action_code: p.action_code,
      is_active: p.is_active ? "Yes" : "No",
    }));

    return {
      columns: ["module_code", "permission_code", "permission_name", "action_code", "is_active"],
      rows,
      meta: { total: rows.length },
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// HR Report Fetchers (REPORT.4)
// ─────────────────────────────────────────────────────────────────────────────

import { employeeListFetcher } from "@/server/actions/reports/hr/employee-list-report";
import { employeeProfileFetcher } from "@/server/actions/reports/hr/employee-profile-report";
import { complianceExpiryFetcher } from "@/server/actions/reports/hr/compliance-expiry-report";
import { attendanceSummaryFetcher } from "@/server/actions/reports/hr/attendance-summary-report";
import { leaveBalanceFetcher } from "@/server/actions/reports/hr/leave-balance-report";
import { leaveRequestsFetcher } from "@/server/actions/reports/hr/leave-requests-report";
import { wpsReadinessFetcher } from "@/server/actions/reports/hr/wps-readiness-report";
import { assignmentBySiteFetcher } from "@/server/actions/reports/hr/assignment-by-site-report";
import { proProcessesFetcher } from "@/server/actions/reports/hr/pro-processes-report";
import { candidatePipelineFetcher } from "@/server/actions/reports/hr/candidate-pipeline-report";
import { requisitionsFetcher } from "@/server/actions/reports/hr/requisitions-report";
import { onboardingTasksFetcher } from "@/server/actions/reports/hr/onboarding-tasks-report";
import { disciplinarySummaryFetcher } from "@/server/actions/reports/hr/disciplinary-summary-report";
import { overtimeReportFetcher } from "@/server/actions/reports/hr/overtime-report";
import { absentLateSummaryFetcher } from "@/server/actions/reports/hr/absent-late-summary-report";
import { eosCasesFetcher } from "@/server/actions/reports/hr/eos-cases-report";
import { ppeIssueReportFetcher } from "@/server/actions/reports/hr/ppe-issue-report";
import { assetIssueReportFetcher } from "@/server/actions/reports/hr/asset-issue-report";
import {
  experienceLetterFetcher,
  salaryCertGeneralFetcher,
  salaryCertWithAmountFetcher,
  nocFetcher,
  employeeIdCardFetcher,
  ppeIssueFormFetcher,
  joiningChecklistFetcher,
  clearanceFormFetcher,
} from "@/server/actions/reports/hr/hr-letter-documents";

// ─────────────────────────────────────────────────────────────────────────────
// Dispatch map — add new fetchers here as phases are implemented
// ─────────────────────────────────────────────────────────────────────────────

export const REPORT_FETCHERS: Record<string, ReportFetcher> = {
  // Admin
  ADMIN_PERMISSION_MATRIX: adminPermissionMatrixFetcher,

  // HR Core Reports
  HR_EMPLOYEE_LIST: employeeListFetcher,
  HR_EMPLOYEE_PROFILE: employeeProfileFetcher,
  HR_COMPLIANCE_EXPIRY: complianceExpiryFetcher,
  HR_ATTENDANCE_SUMMARY: attendanceSummaryFetcher,
  HR_LEAVE_BALANCE: leaveBalanceFetcher,
  HR_LEAVE_REQUESTS: leaveRequestsFetcher,
  HR_WPS_READINESS: wpsReadinessFetcher,
  HR_ASSIGNMENT_BY_SITE: assignmentBySiteFetcher,
  HR_PRO_PROCESSES: proProcessesFetcher,
  HR_CANDIDATE_PIPELINE: candidatePipelineFetcher,
  HR_REQUISITIONS: requisitionsFetcher,
  HR_ONBOARDING_TASKS: onboardingTasksFetcher,

  // HR Important Reports
  HR_DISCIPLINARY_SUMMARY: disciplinarySummaryFetcher,
  HR_OVERTIME_REPORT: overtimeReportFetcher,
  HR_ABSENT_LATE_SUMMARY: absentLateSummaryFetcher,
  HR_EOS_CASES: eosCasesFetcher,
  HR_PPE_ISSUE_REPORT: ppeIssueReportFetcher,
  HR_ASSET_ISSUE_REPORT: assetIssueReportFetcher,

  // HR Letters / Certificates / Forms
  HR_EXPERIENCE_LETTER: experienceLetterFetcher,
  HR_SALARY_CERT_GENERAL: salaryCertGeneralFetcher,
  HR_SALARY_CERT_WITH_AMOUNT: salaryCertWithAmountFetcher,
  HR_NOC: nocFetcher,
  HR_EMPLOYEE_ID_CARD: employeeIdCardFetcher,
  HR_PPE_ISSUE_FORM: ppeIssueFormFetcher,
  HR_JOINING_CHECKLIST: joiningChecklistFetcher,
  HR_CLEARANCE_FORM: clearanceFormFetcher,
};
