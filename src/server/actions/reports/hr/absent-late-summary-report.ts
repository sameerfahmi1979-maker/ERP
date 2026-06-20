/**
 * HR_ABSENT_LATE_SUMMARY — Report Fetcher
 * Phase: REPORT.4 — HR.11 Reports + Letters + Forms Library
 */
import type { ReportFetcher, ReportDataResult } from "@/lib/report-center/types";
import { createAdminClient } from "@/lib/supabase/admin";

export const absentLateSummaryFetcher: ReportFetcher = {
  reportCode: "HR_ABSENT_LATE_SUMMARY",

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
      .from("employee_attendance_daily_summary")
      .select(
        `employee_id, attendance_date, attendance_type, late_minutes, early_out_minutes, is_missing_punch,
         employee:employees(
           employee_code, full_name_en, owner_company_id,
           department:departments(department_name_en),
           owner_company:owner_companies(legal_name_en)
         )`
      )
      .in("attendance_type", ["absent", "late", "half_day", "missing_punch"])
      .order("attendance_date", { ascending: false });

    if (empIds) q = q.in("employee_id", empIds);
    if (filters.date_from) q = q.gte("attendance_date", String(filters.date_from));
    if (filters.date_to) q = q.lte("attendance_date", String(filters.date_to));
    if (filters.attendance_status) q = q.eq("attendance_type", String(filters.attendance_status));

    const { data, error } = await q.limit(10000);
    if (error) throw new Error(`HR_ABSENT_LATE_SUMMARY fetch error: ${error.message}`);

    const rows = (data ?? []).map((r) => {
      const emp = r.employee as unknown as { employee_code: string; full_name_en: string; owner_company_id: number; department?: { department_name_en: string } | null; owner_company?: { legal_name_en: string } | null } | null;
      return {
        employee_code: emp?.employee_code ?? "",
        employee_name: emp?.full_name_en ?? "",
        company: emp?.owner_company?.legal_name_en ?? "",
        department: emp?.department?.department_name_en ?? "",
        attendance_date: r.attendance_date,
        attendance_type: r.attendance_type,
        late_minutes: r.late_minutes ?? 0,
        early_out_minutes: r.early_out_minutes ?? 0,
        missing_punch: r.is_missing_punch ? "Yes" : "No",
        owner_company_id: emp?.owner_company_id ?? 0,
      };
    });

    const ownerCompanyIds = [...new Set(rows.map((r) => r.owner_company_id as number).filter(Boolean))];

    return {
      columns: [
        "employee_code", "employee_name", "company", "department",
        "attendance_date", "attendance_type", "late_minutes", "early_out_minutes", "missing_punch",
      ],
      rows,
      meta: { total: rows.length, ownerCompanyIds },
    };
  },
};


