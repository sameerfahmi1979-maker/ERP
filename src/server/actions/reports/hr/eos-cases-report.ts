/**
 * HR_EOS_CASES — Report Fetcher
 * Phase: REPORT.4 — HR.11 Reports + Letters + Forms Library
 */
import type { ReportFetcher, ReportDataResult } from "@/lib/report-center/types";
import { createAdminClient } from "@/lib/supabase/admin";

export const eosCasesFetcher: ReportFetcher = {
  reportCode: "HR_EOS_CASES",

  async fetch(filters: Record<string, unknown>): Promise<ReportDataResult> {
    const db = createAdminClient();

    let empIds: number[] | null = null;
    if (filters.owner_company_id || filters.department_id) {
      let empQ = db.from("employees").select("id").is("deleted_at", null);
      if (filters.owner_company_id) empQ = empQ.eq("owner_company_id", Number(filters.owner_company_id));
      if (filters.department_id) empQ = empQ.eq("department_id", Number(filters.department_id));
      const { data } = await empQ.limit(2000);
      empIds = (data ?? []).map((e) => e.id);
      if (empIds.length === 0) return { columns: [], rows: [], meta: { total: 0 } };
    }

    let q = db
      .from("employee_eos_cases")
      .select(
        `id, employee_id, eos_type, case_status, notice_date, last_working_date,
         final_settlement_status, clearance_completed, created_at,
         employee:employees(
           employee_code, full_name_en, owner_company_id,
           department:departments(department_name_en),
           owner_company:owner_companies(legal_name_en)
         )`
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (empIds) q = q.in("employee_id", empIds);
    if (filters.employee_status) q = q.eq("case_status", String(filters.employee_status));
    if (filters.date_from) q = q.gte("notice_date", String(filters.date_from));
    if (filters.date_to) q = q.lte("notice_date", String(filters.date_to));

    const { data, error } = await q.limit(2000);
    if (error) throw new Error(`HR_EOS_CASES fetch error: ${error.message}`);

    const rows = (data ?? []).map((r) => {
      const emp = r.employee as unknown as { employee_code: string; full_name_en: string; owner_company_id: number; department?: { department_name_en: string } | null; owner_company?: { legal_name_en: string } | null } | null;
      return {
        employee_code: emp?.employee_code ?? "",
        employee_name: emp?.full_name_en ?? "",
        company: emp?.owner_company?.legal_name_en ?? "",
        department: emp?.department?.department_name_en ?? "",
        eos_type: r.eos_type,
        case_status: r.case_status,
        notice_date: r.notice_date ?? "",
        last_working_date: r.last_working_date ?? "",
        final_settlement_status: r.final_settlement_status,
        clearance_completed: r.clearance_completed ? "Yes" : "No",
        owner_company_id: emp?.owner_company_id ?? 0,
      };
    });

    const ownerCompanyIds = [...new Set(rows.map((r) => r.owner_company_id as number).filter(Boolean))];

    return {
      columns: [
        "employee_code", "employee_name", "company", "department",
        "eos_type", "case_status", "notice_date", "last_working_date",
        "final_settlement_status", "clearance_completed",
      ],
      rows,
      meta: { total: rows.length, ownerCompanyIds },
    };
  },
};


