/**
 * HR_ATTENDANCE_SUMMARY — Report Fetcher
 * Phase: REPORT.4 — HR.11 Reports + Letters + Forms Library
 */
import type { ReportFetcher, ReportDataResult } from "@/lib/report-center/types";
import { createAdminClient } from "@/lib/supabase/admin";

export const attendanceSummaryFetcher: ReportFetcher = {
  reportCode: "HR_ATTENDANCE_SUMMARY",

  async fetch(filters: Record<string, unknown>): Promise<ReportDataResult> {
    const db = createAdminClient();

    let q = db
      .from("employee_attendance_daily_summary")
      .select(
        `id, employee_id, attendance_date, attendance_type, first_in_at, last_out_at,
         total_hours, late_minutes, early_out_minutes, is_missing_punch, approval_status,
         work_site_id,
         employee:employees(
           id, employee_code, full_name_en, owner_company_id,
           department:departments(department_name_en),
           owner_company:owner_companies(legal_name_en)
         ),
         work_site:work_sites(site_name)`
      )
      .order("attendance_date", { ascending: false });

    if (filters.date_from) q = q.gte("attendance_date", String(filters.date_from));
    if (filters.date_to) q = q.lte("attendance_date", String(filters.date_to));
    if (filters.work_site_id) q = q.eq("work_site_id", Number(filters.work_site_id));
    if (filters.attendance_status) q = q.eq("attendance_type", String(filters.attendance_status));

    // Filter by company/department via subquery approach: filter employee list first
    let empIds: number[] | null = null;
    if (filters.owner_company_id || filters.department_id) {
      let empQ = db.from("employees").select("id").is("deleted_at", null);
      if (filters.owner_company_id) empQ = empQ.eq("owner_company_id", Number(filters.owner_company_id));
      if (filters.department_id) empQ = empQ.eq("department_id", Number(filters.department_id));
      const { data: empData } = await empQ.limit(2000);
      empIds = (empData ?? []).map((e) => e.id);
      if (empIds.length === 0) return { columns: [], rows: [], meta: { total: 0 } };
      q = q.in("employee_id", empIds);
    }

    const { data, error } = await q.limit(10000);
    if (error) throw new Error(`HR_ATTENDANCE_SUMMARY fetch error: ${error.message}`);

    const rows = (data ?? []).map((r) => {
      const emp = r.employee as unknown as { employee_code: string; full_name_en: string; owner_company_id: number; department?: { department_name_en: string } | null; owner_company?: { legal_name_en: string } | null } | null;
      return {
        employee_code: emp?.employee_code ?? "",
        employee_name: emp?.full_name_en ?? "",
        company: emp?.owner_company?.legal_name_en ?? "",
        department: emp?.department?.department_name_en ?? "",
        attendance_date: r.attendance_date,
        attendance_type: r.attendance_type,
        first_in: r.first_in_at ? r.first_in_at.slice(11, 16) : "",
        last_out: r.last_out_at ? r.last_out_at.slice(11, 16) : "",
        total_hours: r.total_hours ?? 0,
        late_minutes: r.late_minutes ?? 0,
        early_out_minutes: r.early_out_minutes ?? 0,
        missing_punch: r.is_missing_punch ? "Yes" : "No",
        approval_status: r.approval_status,
        work_site: (r.work_site as unknown as { site_name: string } | null)?.site_name ?? "",
        owner_company_id: emp?.owner_company_id ?? 0,
      };
    });

    const ownerCompanyIds = [...new Set(rows.map((r) => r.owner_company_id as number).filter(Boolean))];

    return {
      columns: [
        "employee_code", "employee_name", "company", "department",
        "attendance_date", "attendance_type", "first_in", "last_out",
        "total_hours", "late_minutes", "early_out_minutes",
        "missing_punch", "approval_status", "work_site",
      ],
      rows,
      meta: { total: rows.length, ownerCompanyIds },
    };
  },
};


