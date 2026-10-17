import type {AuthContext} from "@/lib/rbac/check";
import {payrollInquiryCriteriaSchema, payrollInquiryPageSchema, type PayrollInquiryKind} from "@/lib/reads/hr-payroll-inquiries-schema";
export const payrollInquiryContext = {profile: {id: 6, auth_user_id: "synthetic-payroll-inquiry", must_change_password: false, owner_company_id: 880101, branch_id: 880201}, email: null, accountStatus: "active", isAccountActive: true, roleCodes: ["hr_scoped"], permissionCodes: ["hr.payroll.view", "hr.banking.view"], globalPermissionCodes: [], roleAssignments: [{roleId: 880106, roleCode: "hr_scoped", ownerCompanyId: 880101, branchId: 880201, permissionCodes: ["hr.payroll.view", "hr.banking.view"]}]} as unknown as AuthContext;
export function payrollInquiryRow(kind: PayrollInquiryKind, id = 1) {
  const employee = {employee_id: id, employee_code: `PAY-${id}`, full_name_en: `Synthetic payroll employee ${id}`};
  return kind === "salary" ? {...employee, payroll_status: "active", payroll_group_name: "Synthetic payroll group", gross_salary: 1234.5, currency: "AED"} : {...employee, wps_status: "active", salary_payment_method: "bank_transfer", has_active_hold: false, readiness_status: "ready"};
}
export function payrollInquiryPage(input: unknown, {first, count = 1107}: {first?: number; count?: number} = {}) {
  const p = payrollInquiryCriteriaSchema.parse(input), offset = (p.page - 1) * p.pageSize;
  return payrollInquiryPageSchema.parse({contractVersion: 1, kind: p.kind, page: p.page, pageSize: p.pageSize, totalCount: count, rows: Array.from({length: Math.min(p.pageSize, Math.max(0, count - offset))}, (_, i) => payrollInquiryRow(p.kind, (first ?? offset + 1) + i))});
}
