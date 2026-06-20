/**
 * HR_LEAVE_BALANCE — Report Fetcher
 * Phase: REPORT.4 — HR.11 Reports + Letters + Forms Library
 */
import type { ReportFetcher, ReportDataResult } from "@/lib/report-center/types";
import { createAdminClient } from "@/lib/supabase/admin";

export const leaveBalanceFetcher: ReportFetcher = {
  reportCode: "HR_LEAVE_BALANCE",

  async fetch(filters: Record<string, unknown>): Promise<ReportDataResult> {
    const db = createAdminClient();

    let empQ = db
      .from("employees")
      .select("id, employee_code, full_name_en, owner_company_id, owner_company:owner_companies(legal_name_en)")
      .is("deleted_at", null)
      .eq("employee_status", "active");

    if (filters.owner_company_id) empQ = empQ.eq("owner_company_id", Number(filters.owner_company_id));
    if (filters.department_id) empQ = empQ.eq("department_id", Number(filters.department_id));

    const { data: employees } = await empQ.limit(2000);
    const empMap = new Map((employees ?? []).map((e) => [e.id, e]));
    const empIds = [...empMap.keys()];
    if (empIds.length === 0) return { columns: [], rows: [], meta: { total: 0 } };

    let balQ = db
      .from("employee_leave_balances")
      .select(`employee_id, leave_year, entitled_days, used_days, balance_days, carry_forward,
               leave_type:hr_leave_types(leave_type_name, leave_type_code)`)
      .in("employee_id", empIds)
      .order("leave_year", { ascending: false });

    if (filters.date_from) balQ = balQ.gte("leave_year", parseInt(String(filters.date_from).slice(0, 4)));
    if (filters.date_to) balQ = balQ.lte("leave_year", parseInt(String(filters.date_to).slice(0, 4)));

    const { data, error } = await balQ.limit(10000);
    if (error) throw new Error(`HR_LEAVE_BALANCE fetch error: ${error.message}`);

    const rows = (data ?? []).map((b) => {
      const emp = empMap.get(b.employee_id);
      return {
        employee_code: emp?.employee_code ?? "",
        employee_name: emp?.full_name_en ?? "",
        company: (emp?.owner_company as unknown as { legal_name_en: string } | null)?.legal_name_en ?? "",
        leave_type: (b.leave_type as unknown as { leave_type_name: string } | null)?.leave_type_name ?? "",
        leave_year: b.leave_year,
        entitled_days: b.entitled_days,
        carry_forward: b.carry_forward,
        used_days: b.used_days,
        balance_days: b.balance_days,
        owner_company_id: emp?.owner_company_id ?? 0,
      };
    });

    const ownerCompanyIds = [...new Set(rows.map((r) => r.owner_company_id as number).filter(Boolean))];

    return {
      columns: [
        "employee_code", "employee_name", "company", "leave_type",
        "leave_year", "entitled_days", "carry_forward", "used_days", "balance_days",
      ],
      rows,
      meta: { total: rows.length, ownerCompanyIds },
    };
  },
};


