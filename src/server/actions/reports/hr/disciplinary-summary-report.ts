/**
 * HR_DISCIPLINARY_SUMMARY — Report Fetcher
 * Phase: REPORT.4 — HR.11 Reports + Letters + Forms Library
 *
 * SECURITY: Does NOT expose description text or notes by default.
 * Only status, type, date, severity, and counts.
 */
import type { ReportFetcher, ReportDataResult } from "@/lib/report-center/types";
import { createAdminClient } from "@/lib/supabase/admin";

export const disciplinarySummaryFetcher: ReportFetcher = {
  reportCode: "HR_DISCIPLINARY_SUMMARY",

  async fetch(filters: Record<string, unknown>, permissionCodes: string[]): Promise<ReportDataResult> {
    const db = createAdminClient();
    const canViewDetails = permissionCodes.includes("hr.actions.manage");

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
      .from("employee_disciplinary_records")
      .select(
        `id, employee_id, disciplinary_type, incident_date, record_date, severity, subject, status,
         acknowledged_by_employee, creates_operational_block,
         employee:employees(
           employee_code, full_name_en, owner_company_id,
           department:departments(department_name_en),
           owner_company:owner_companies(legal_name_en)
         )`
      )
      .is("deleted_at", null)
      .order("record_date", { ascending: false });

    if (empIds) q = q.in("employee_id", empIds);
    if (filters.date_from) q = q.gte("record_date", String(filters.date_from));
    if (filters.date_to) q = q.lte("record_date", String(filters.date_to));
    if (filters.employee_status) q = q.eq("status", String(filters.employee_status));

    const { data, error } = await q.limit(5000);
    if (error) throw new Error(`HR_DISCIPLINARY_SUMMARY fetch error: ${error.message}`);

    const rows = (data ?? []).map((r) => {
      const emp = r.employee as unknown as { employee_code: string; full_name_en: string; owner_company_id: number; department?: { department_name_en: string } | null; owner_company?: { legal_name_en: string } | null } | null;
      return {
        employee_code: emp?.employee_code ?? "",
        employee_name: emp?.full_name_en ?? "",
        company: emp?.owner_company?.legal_name_en ?? "",
        department: emp?.department?.department_name_en ?? "",
        disciplinary_type: r.disciplinary_type,
        severity: r.severity,
        subject: canViewDetails ? r.subject : "[Restricted]",
        incident_date: r.incident_date ?? "",
        record_date: r.record_date,
        status: r.status,
        acknowledged: r.acknowledged_by_employee ? "Yes" : "No",
        creates_block: r.creates_operational_block ? "Yes" : "No",
        owner_company_id: emp?.owner_company_id ?? 0,
      };
    });

    const ownerCompanyIds = [...new Set(rows.map((r) => r.owner_company_id as number).filter(Boolean))];

    return {
      columns: [
        "employee_code", "employee_name", "company", "department",
        "disciplinary_type", "severity", "subject",
        "incident_date", "record_date", "status", "acknowledged", "creates_block",
      ],
      rows,
      meta: { total: rows.length, ownerCompanyIds },
    };
  },
};


