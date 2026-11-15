const recruitmentReportCodes = new Set([
  "HR_CANDIDATE_PIPELINE",
  "HR_REQUISITIONS",
  "HR_ONBOARDING_TASKS",
]);

export function isRecruitmentReport(code: string): boolean {
  return recruitmentReportCodes.has(code);
}

export function usesFreshAnalyticalExport(code: string): boolean {
  return isRecruitmentReport(code) || code === "HR_ABSENT_LATE_SUMMARY" || code === "HR_ATTENDANCE_SUMMARY" ||
    code === "HR_COMPLIANCE_EXPIRY" || code === "HR_WPS_READINESS";
}
