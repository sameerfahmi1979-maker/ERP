/**
 * HR_EMPLOYEE_LIST — Report Fetcher
 * Phase: REPORT.4 — HR.11 Reports + Letters + Forms Library
 */
import type { ReportFetcher, ReportDataResult } from "@/lib/report-center/types";
import { createAdminClient } from "@/lib/supabase/admin";

export const employeeListFetcher: ReportFetcher = {
  reportCode: "HR_EMPLOYEE_LIST",

  async fetch(filters: Record<string, unknown>): Promise<ReportDataResult> {
    const db = createAdminClient();

    let q = db
      .from("employees")
      .select(
        `id, employee_code, full_name_en, full_name_ar, mobile_number, personal_email,
         employee_status, joining_date, owner_company_id,
         owner_company:owner_companies(id, legal_name_en, company_code),
         branch:branches(id, branch_name_en),
         department:departments(id, department_name_en),
         designation:designations(id, designation_name_en),
         nationality:countries(id, name_en),
         primary_work_site:work_sites(id, site_name)`
      )
      .is("deleted_at", null)
      .order("employee_code");

    if (filters.owner_company_id) q = q.eq("owner_company_id", Number(filters.owner_company_id));
    if (filters.branch_id) q = q.eq("branch_id", Number(filters.branch_id));
    if (filters.department_id) q = q.eq("department_id", Number(filters.department_id));
    if (filters.designation_id) q = q.eq("designation_id", Number(filters.designation_id));
    if (filters.employee_status) q = q.eq("employee_status", String(filters.employee_status));
    if (filters.date_from) q = q.gte("joining_date", String(filters.date_from));
    if (filters.date_to) q = q.lte("joining_date", String(filters.date_to));
    if (filters.search) {
      q = q.or(`full_name_en.ilike.%${filters.search}%,employee_code.ilike.%${filters.search}%`);
    }

    const { data, error } = await q.limit(5000);
    if (error) throw new Error(`HR_EMPLOYEE_LIST fetch error: ${error.message}`);

    const rows = (data ?? []).map((e) => ({
      employee_code: e.employee_code,
      full_name_en: e.full_name_en,
      full_name_ar: e.full_name_ar ?? "",
      owner_company: (e.owner_company as unknown as { legal_name_en: string } | null)?.legal_name_en ?? "",
      branch: (e.branch as unknown as { branch_name_en: string } | null)?.branch_name_en ?? "",
      department: (e.department as unknown as { department_name_en: string } | null)?.department_name_en ?? "",
      designation: (e.designation as unknown as { designation_name_en: string } | null)?.designation_name_en ?? "",
      nationality: (e.nationality as unknown as { name_en: string } | null)?.name_en ?? "",
      employee_status: e.employee_status,
      joining_date: e.joining_date,
      work_site: (e.primary_work_site as unknown as { site_name: string } | null)?.site_name ?? "",
      mobile: e.mobile_number,
      email: e.personal_email ?? "",
      // Hidden from table but used for branding resolution
      owner_company_id: e.owner_company_id,
    }));

    return {
      columns: [
        "employee_code", "full_name_en", "full_name_ar", "owner_company",
        "branch", "department", "designation", "nationality",
        "employee_status", "joining_date", "work_site", "mobile", "email",
      ],
      rows,
      meta: { total: rows.length, ownerCompanyIds: [...new Set(rows.map((r) => r.owner_company_id as number))] },
    };
  },
};


