/** Local contracts cover legacy registry rows whose JSON filter schema is null.
 * They expose only filters actually implemented by the registered fetchers.
 * Entity values still come from the scoped, paged criterion selectors.
 */
const companyDepartment = ['owner_company_id','department_id'];
const dates = ['date_from','date_to'];
export const REPORT_FILTER_CONTRACTS: Record<string, readonly string[]> = {
 ADMIN_PERMISSION_MATRIX: [],
 HR_EMPLOYEE_PROFILE: ['employee_id'],
 HR_EMPLOYEE_LIST: [...companyDepartment,'branch_id','designation_id','employee_status',...dates,'search'],
 HR_COMPLIANCE_EXPIRY: [...companyDepartment,'expiry_from','expiry_to','status'],
 HR_ATTENDANCE_SUMMARY: [...companyDepartment,'work_site_id',...dates,'attendance_status'],
 HR_LEAVE_BALANCE: [...companyDepartment,...dates],
 HR_LEAVE_REQUESTS: [...companyDepartment,...dates,'leave_status'],
 HR_WPS_READINESS: [...companyDepartment,'readiness_status'],
 HR_ASSIGNMENT_BY_SITE: ['owner_company_id','work_site_id',...dates,'employee_status'],
 HR_PRO_PROCESSES: [...companyDepartment,...dates,'employee_status'],
 HR_CANDIDATE_PIPELINE: ['candidate_status','requisition_status',...dates,'search'],
 HR_REQUISITIONS: [...companyDepartment,...dates,'requisition_status'],
 HR_ONBOARDING_TASKS: [...dates,'employee_status'],
 HR_DISCIPLINARY_SUMMARY: [...companyDepartment,...dates,'employee_status'],
 HR_OVERTIME_REPORT: [...companyDepartment,...dates,'leave_status'],
 HR_ABSENT_LATE_SUMMARY: [...companyDepartment,...dates,'attendance_status'],
 HR_EOS_CASES: [...companyDepartment,...dates,'employee_status'],
 HR_PPE_ISSUE_REPORT: [...companyDepartment,'work_site_id',...dates,'employee_status'],
 HR_ASSET_ISSUE_REPORT: [...companyDepartment,...dates,'employee_status'],
};
const subjectOutputs = new Set(['HR_EXPERIENCE_LETTER','HR_EMPLOYMENT_LETTER','HR_EMPLOYMENT_CONFIRMATION','HR_WARNING_LETTER','HR_SALARY_CERT_GENERAL','HR_SALARY_CERT_WITH_AMOUNT','HR_NOC','HR_EMPLOYEE_ID_CARD','HR_PPE_ISSUE_FORM','HR_JOINING_CHECKLIST','HR_CLEARANCE_FORM']);
export function reportFilterKeys(code: string, schema: unknown): string[] {
 const candidate = schema && typeof schema === 'object' && 'filters' in schema ? schema.filters : null;
 const keys = Array.isArray(candidate) && candidate.every(k=>typeof k==='string') ? candidate as string[] : REPORT_FILTER_CONTRACTS[code] ?? [];
 return [...new Set([...keys,...(subjectOutputs.has(code)||code==='HR_EMPLOYEE_PROFILE'?['employee_id']:[])])];
}
