/**
 * HR_ASSIGNMENT_BY_SITE — Report Fetcher
 * Phase: REPORT.4 — HR.11 Reports + Letters + Forms Library
 */
import type { ReportFetcher, ReportDataResult } from "@/lib/report-center/types";
import { createAdminClient } from "@/lib/supabase/admin";

export const assignmentBySiteFetcher: ReportFetcher = {
  reportCode: "HR_ASSIGNMENT_BY_SITE",

  async fetch(filters: Record<string, unknown>): Promise<ReportDataResult> {
    const db = createAdminClient();

    let q = db
      .from("employee_assignments")
      .select(
        `id, employee_id, work_site_id, assignment_start, assignment_end, assignment_status,
         notes,
         employee:employees(
           employee_code, full_name_en, owner_company_id,
           owner_company:owner_companies(legal_name_en)
         ),
         work_site:work_sites(site_name, site_code)`
      )
      .is("deleted_at", null)
      .order("assignment_start", { ascending: false });

    if (filters.work_site_id) q = q.eq("work_site_id", Number(filters.work_site_id));
    if (filters.date_from) q = q.gte("assignment_start", String(filters.date_from));
    if (filters.date_to) q = q.lte("assignment_start", String(filters.date_to));
    if (filters.employee_status) q = q.eq("assignment_status", String(filters.employee_status));

    if (filters.owner_company_id) {
      const { data: empData } = await db
        .from("employees")
        .select("id")
        .eq("owner_company_id", Number(filters.owner_company_id))
        .is("deleted_at", null)
        .limit(2000);
      const ids = (empData ?? []).map((e) => e.id);
      if (ids.length === 0) return { columns: [], rows: [], meta: { total: 0 } };
      q = q.in("employee_id", ids);
    }

    const { data, error } = await q.limit(5000);
    if (error) throw new Error(`HR_ASSIGNMENT_BY_SITE fetch error: ${error.message}`);

    const rows = (data ?? []).map((r) => {
      const emp = r.employee as unknown as { employee_code: string; full_name_en: string; owner_company_id: number; owner_company?: { legal_name_en: string } | null } | null;
      return {
        employee_code: emp?.employee_code ?? "",
        employee_name: emp?.full_name_en ?? "",
        company: emp?.owner_company?.legal_name_en ?? "",
        site: (r.work_site as unknown as { site_name: string } | null)?.site_name ?? "",
        assignment_start: r.assignment_start,
        assignment_end: r.assignment_end ?? "",
        assignment_status: r.assignment_status,
        owner_company_id: emp?.owner_company_id ?? 0,
      };
    });

    const ownerCompanyIds = [...new Set(rows.map((r) => r.owner_company_id as number).filter(Boolean))];

    return {
      columns: [
        "employee_code", "employee_name", "company", "site",
        "assignment_start", "assignment_end", "assignment_status",
      ],
      rows,
      meta: { total: rows.length, ownerCompanyIds },
    };
  },
};


