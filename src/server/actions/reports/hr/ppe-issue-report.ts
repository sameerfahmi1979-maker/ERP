/**
 * HR_PPE_ISSUE_REPORT — Report Fetcher
 * Phase: REPORT.4 — HR.11 Reports + Letters + Forms Library
 */
import type { ReportFetcher, ReportDataResult } from "@/lib/report-center/types";
import { createAdminClient } from "@/lib/supabase/admin";

export const ppeIssueReportFetcher: ReportFetcher = {
  reportCode: "HR_PPE_ISSUE_REPORT",

  async fetch(filters: Record<string, unknown>): Promise<ReportDataResult> {
    const db = createAdminClient();

    let empIds: number[] | null = null;
    if (filters.owner_company_id || filters.department_id || filters.work_site_id) {
      let empQ = db.from("employees").select("id").is("deleted_at", null);
      if (filters.owner_company_id) empQ = empQ.eq("owner_company_id", Number(filters.owner_company_id));
      if (filters.department_id) empQ = empQ.eq("department_id", Number(filters.department_id));
      if (filters.work_site_id) empQ = empQ.eq("primary_work_site_id", Number(filters.work_site_id));
      const { data } = await empQ.limit(2000);
      empIds = (data ?? []).map((e) => e.id);
      if (empIds.length === 0) return { columns: [], rows: [], meta: { total: 0 } };
    }

    let q = db
      .from("employee_ppe_issues")
      .select(
        `id, employee_id, ppe_item_name, ppe_category, issue_date, quantity, condition_at_issue,
         return_date, return_condition, ppe_status, notes,
         issued_by_profile:profiles!issued_by(display_name),
         employee:employees(
           employee_code, full_name_en, owner_company_id,
           department:departments(department_name_en),
           owner_company:owner_companies(legal_name_en)
         )`
      )
      .is("deleted_at", null)
      .order("issue_date", { ascending: false });

    if (empIds) q = q.in("employee_id", empIds);
    if (filters.date_from) q = q.gte("issue_date", String(filters.date_from));
    if (filters.date_to) q = q.lte("issue_date", String(filters.date_to));
    if (filters.employee_status) q = q.eq("ppe_status", String(filters.employee_status));

    const { data, error } = await q.limit(5000);
    if (error) throw new Error(`HR_PPE_ISSUE_REPORT fetch error: ${error.message}`);

    const rows = (data ?? []).map((r) => {
      const emp = r.employee as unknown as { employee_code: string; full_name_en: string; owner_company_id: number; department?: { department_name_en: string } | null; owner_company?: { legal_name_en: string } | null } | null;
      return {
        employee_code: emp?.employee_code ?? "",
        employee_name: emp?.full_name_en ?? "",
        company: emp?.owner_company?.legal_name_en ?? "",
        department: emp?.department?.department_name_en ?? "",
        ppe_item: r.ppe_item_name,
        ppe_category: r.ppe_category ?? "",
        quantity: r.quantity ?? 1,
        condition_at_issue: r.condition_at_issue ?? "",
        issue_date: r.issue_date,
        return_date: r.return_date ?? "",
        return_condition: r.return_condition ?? "",
        ppe_status: r.ppe_status,
        issued_by: (r.issued_by_profile as unknown as { display_name: string } | null)?.display_name ?? "",
        owner_company_id: emp?.owner_company_id ?? 0,
      };
    });

    const ownerCompanyIds = [...new Set(rows.map((r) => r.owner_company_id as number).filter(Boolean))];

    return {
      columns: [
        "employee_code", "employee_name", "company", "department",
        "ppe_item", "ppe_category", "quantity", "condition_at_issue",
        "issue_date", "return_date", "return_condition", "ppe_status", "issued_by",
      ],
      rows,
      meta: { total: rows.length, ownerCompanyIds },
    };
  },
};


