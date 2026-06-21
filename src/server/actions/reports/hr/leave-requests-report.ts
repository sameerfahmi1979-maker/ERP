/**
 * HR_LEAVE_REQUESTS — Report Fetcher
 * Phase: REPORT.4 — HR.11 Reports + Letters + Forms Library
 */
import type { ReportFetcher, ReportDataResult } from "@/lib/report-center/types";
import { createAdminClient } from "@/lib/supabase/admin";

export const leaveRequestsFetcher: ReportFetcher = {
  reportCode: "HR_LEAVE_REQUESTS",

  async fetch(filters: Record<string, unknown>): Promise<ReportDataResult> {
    const db = createAdminClient();

    let empIds: number[] | null = null;
    if (filters.owner_company_id || filters.department_id) {
      let empQ = db.from("employees").select("id").is("deleted_at", null);
      if (filters.owner_company_id) empQ = empQ.eq("owner_company_id", Number(filters.owner_company_id));
      if (filters.department_id) empQ = empQ.eq("department_id", Number(filters.department_id));
      const { data: empData } = await empQ.limit(2000);
      empIds = (empData ?? []).map((e) => e.id);
      if (empIds.length === 0) return { columns: [], rows: [], meta: { total: 0 } };
    }

    let q = db
      .from("employee_leave_requests")
      .select(
        `id, employee_id, start_date, end_date, total_days, reason, approval_status,
         approved_at, request_date,
         leave_type:hr_leave_types(name_en),
         approver:profiles!approved_by(display_name),
         employee:employees(
           employee_code, full_name_en, owner_company_id,
           owner_company:owner_companies(legal_name_en)
         )`
      )
      .is("deleted_at", null)
      .order("request_date", { ascending: false });

    if (empIds) q = q.in("employee_id", empIds);
    if (filters.date_from) q = q.gte("start_date", String(filters.date_from));
    if (filters.date_to) q = q.lte("end_date", String(filters.date_to));
    if (filters.leave_status) q = q.eq("approval_status", String(filters.leave_status));

    const { data, error } = await q.limit(5000);
    if (error) throw new Error(`HR_LEAVE_REQUESTS fetch error: ${error.message}`);

    const rows = (data ?? []).map((r) => {
      const emp = r.employee as unknown as { employee_code: string; full_name_en: string; owner_company_id: number; owner_company?: { legal_name_en: string } | null } | null;
      return {
        employee_code: emp?.employee_code ?? "",
        employee_name: emp?.full_name_en ?? "",
        company: emp?.owner_company?.legal_name_en ?? "",
        leave_type: (r.leave_type as unknown as { name_en: string } | null)?.name_en ?? "",
        request_date: r.request_date,
        start_date: r.start_date,
        end_date: r.end_date,
        total_days: r.total_days ?? "",
        approval_status: r.approval_status,
        approved_by: (r.approver as unknown as { display_name: string } | null)?.display_name ?? "",
        approved_at: r.approved_at ?? "",
        owner_company_id: emp?.owner_company_id ?? 0,
      };
    });

    const ownerCompanyIds = [...new Set(rows.map((r) => r.owner_company_id as number).filter(Boolean))];

    return {
      columns: [
        "employee_code", "employee_name", "company", "leave_type",
        "request_date", "start_date", "end_date", "total_days",
        "approval_status", "approved_by", "approved_at",
      ],
      rows,
      meta: { total: rows.length, ownerCompanyIds },
    };
  },
};


