/**
 * HR_EMPLOYEE_PROFILE — Report Fetcher (single employee detail)
 * Phase: REPORT.4 — HR.11 Reports + Letters + Forms Library
 *
 * Returns a flattened multi-section row for one employee.
 * Sensitive sections are redacted server-side based on permissions.
 */
import type { ReportFetcher, ReportDataResult } from "@/lib/report-center/types";
import { createAdminClient } from "@/lib/supabase/admin";

export const employeeProfileFetcher: ReportFetcher = {
  reportCode: "HR_EMPLOYEE_PROFILE",

  async fetch(filters: Record<string, unknown>, permissionCodes: string[]): Promise<ReportDataResult> {
    const employeeId = filters.employee_id ? Number(filters.employee_id) : null;
    if (!employeeId) throw new Error("employee_id filter is required for HR_EMPLOYEE_PROFILE");

    const db = createAdminClient();

    const { data: emp, error } = await db
      .from("employees")
      .select(
        `id, employee_code, full_name_en, full_name_ar, mobile_number, personal_email,
         gender, date_of_birth, marital_status, blood_group,
         employee_status, joining_date, actual_joining_date, contract_type,
         contract_start_date, contract_end_date, probation_end_date,
         owner_company_id,
         owner_company:owner_companies(id, legal_name_en, company_code),
         branch:branches(id, branch_name_en),
         department:departments(id, department_name_en),
         designation:designations(id, designation_name_en),
         nationality:countries(id, name_en),
         primary_work_site:work_sites(id, site_name),
         employee_category:employee_categories(id, name_en),
         employment_type:employment_types(id, name_en)`
      )
      .eq("id", employeeId)
      .is("deleted_at", null)
      .single();

    if (error || !emp) throw new Error("Employee not found");

    const canViewPayroll = permissionCodes.includes("hr.payroll.view");
    const canViewMedical = permissionCodes.includes("hr.medical.view");

    const row: Record<string, unknown> = {
      employee_code: emp.employee_code,
      full_name_en: emp.full_name_en,
      full_name_ar: emp.full_name_ar ?? "",
      gender: emp.gender,
      date_of_birth: canViewMedical ? emp.date_of_birth : "[REDACTED]",
      marital_status: emp.marital_status ?? "",
      mobile_number: emp.mobile_number,
      personal_email: emp.personal_email ?? "",
      owner_company: (emp.owner_company as unknown as { legal_name_en: string } | null)?.legal_name_en ?? "",
      owner_company_id: emp.owner_company_id,
      branch: (emp.branch as unknown as { branch_name_en: string } | null)?.branch_name_en ?? "",
      department: (emp.department as unknown as { department_name_en: string } | null)?.department_name_en ?? "",
      designation: (emp.designation as unknown as { designation_name_en: string } | null)?.designation_name_en ?? "",
      nationality: (emp.nationality as unknown as { name_en: string } | null)?.name_en ?? "",
      work_site: (emp.primary_work_site as unknown as { site_name: string } | null)?.site_name ?? "",
      employee_category: (emp.employee_category as unknown as { name_en: string } | null)?.name_en ?? "",
      employment_type: (emp.employment_type as unknown as { name_en: string } | null)?.name_en ?? "",
      employee_status: emp.employee_status,
      joining_date: emp.joining_date,
      contract_type: emp.contract_type ?? "",
      contract_start_date: emp.contract_start_date ?? "",
      contract_end_date: emp.contract_end_date ?? "",
      probation_end_date: emp.probation_end_date ?? "",
      salary_info: canViewPayroll ? "See payroll module" : "[Requires hr.payroll.view]",
    };

    return {
      columns: [
        "employee_code", "full_name_en", "full_name_ar", "gender", "date_of_birth",
        "marital_status", "mobile_number", "personal_email",
        "owner_company", "branch", "department", "designation", "nationality",
        "work_site", "employee_category", "employment_type", "employee_status",
        "joining_date", "contract_type", "contract_start_date", "contract_end_date",
        "probation_end_date", "salary_info",
      ],
      rows: [row],
      meta: { report_type: "detail", employee_id: employeeId, ownerCompanyIds: [emp.owner_company_id] },
    };
  },
};


