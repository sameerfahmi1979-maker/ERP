/**
 * HR_PRO_PROCESSES — Report Fetcher
 * Phase: REPORT.4 — HR.11 Reports + Letters + Forms Library
 */
import type { ReportFetcher, ReportDataResult } from "@/lib/report-center/types";
import { createAdminClient } from "@/lib/supabase/admin";

function agingDays(requestDate: string): number {
  return Math.ceil((Date.now() - new Date(requestDate).getTime()) / 86400000);
}

export const proProcessesFetcher: ReportFetcher = {
  reportCode: "HR_PRO_PROCESSES",

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
      .from("employee_pro_processes")
      .select(
        `id, employee_id, process_title, process_status, priority, request_date,
         target_date, submitted_date, completed_date,
         process_type:hr_pro_process_types(name_en),
         assigned_to_profile:profiles!assigned_to(display_name),
         employee:employees(
           employee_code, full_name_en, owner_company_id,
           owner_company:owner_companies(legal_name_en)
         )`
      )
      .is("deleted_at", null)
      .order("request_date", { ascending: false });

    if (empIds) q = q.in("employee_id", empIds);
    if (filters.employee_status) q = q.eq("process_status", String(filters.employee_status));
    if (filters.date_from) q = q.gte("request_date", String(filters.date_from));
    if (filters.date_to) q = q.lte("request_date", String(filters.date_to));

    const { data, error } = await q.limit(5000);
    if (error) throw new Error(`HR_PRO_PROCESSES fetch error: ${error.message}`);

    const rows = (data ?? []).map((r) => {
      const emp = r.employee as unknown as { employee_code: string; full_name_en: string; owner_company_id: number; owner_company?: { legal_name_en: string } | null } | null;
      return {
        employee_code: emp?.employee_code ?? "",
        employee_name: emp?.full_name_en ?? "",
        company: emp?.owner_company?.legal_name_en ?? "",
        process_type: (r.process_type as unknown as { name_en: string } | null)?.name_en ?? "",
        process_title: r.process_title,
        process_status: r.process_status,
        priority: r.priority,
        request_date: r.request_date,
        target_date: r.target_date ?? "",
        completed_date: r.completed_date ?? "",
        assigned_to: (r.assigned_to_profile as unknown as { display_name: string } | null)?.display_name ?? "",
        aging_days: agingDays(r.request_date),
        owner_company_id: emp?.owner_company_id ?? 0,
      };
    });

    const ownerCompanyIds = [...new Set(rows.map((r) => r.owner_company_id as number).filter(Boolean))];

    return {
      columns: [
        "employee_code", "employee_name", "company", "process_type",
        "process_title", "process_status", "priority",
        "request_date", "target_date", "completed_date", "assigned_to", "aging_days",
      ],
      rows,
      meta: { total: rows.length, ownerCompanyIds },
    };
  },
};


