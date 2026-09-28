/**
 * HR_REQUISITIONS — Report Fetcher
 * Phase: REPORT.4 — HR.11 Reports + Letters + Forms Library
 */
import type { ReportFetcher, ReportDataResult } from "@/lib/report-center/types";
import type { ReportReadClient } from "@/lib/report-center/scoped-read-client";

export const requisitionsFetcher: ReportFetcher = {
  reportCode: "HR_REQUISITIONS",

  async fetch(filters: Record<string, unknown>, _permissions: string[], db: ReportReadClient): Promise<ReportDataResult> {


    let q = db
      .from("hr_job_requisitions")
      .select(
        `id, requisition_code, requisition_title, headcount_required:vacancies_count, requisition_status,
         opened_date:created_at, target_fill_date:target_start_date, owner_company_id,
         department:departments(department_name_en),
         designation:designations(designation_name_en),
         owner_company:owner_companies(legal_name_en)`
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (filters.owner_company_id) q = q.eq("owner_company_id", Number(filters.owner_company_id));
    if (filters.department_id) q = q.eq("department_id", Number(filters.department_id));
    if (filters.requisition_status) q = q.eq("requisition_status", String(filters.requisition_status));
    if (filters.date_from) q = q.gte("created_at", String(filters.date_from));
    if (filters.date_to) q = q.lte("created_at", String(filters.date_to));

    const { data: reqs, error } = await q.limit(2000);
    if (error) throw new Error(`HR_REQUISITIONS fetch error: ${error.message}`);

    const reqIds = (reqs ?? []).map((r) => r.id);

    // Count candidates per requisition
    const { data: candidateCounts } = reqIds.length
      ? await db
          .from("hr_candidates")
          .select("requisition_id, candidate_status")
          .in("requisition_id", reqIds)
          .is("deleted_at", null)
      : { data: [] };

    const countMap = new Map<number, { hired: number; pending: number; total: number }>();
    for (const c of candidateCounts ?? []) {
      if (!c.requisition_id) continue;
      const existing = countMap.get(c.requisition_id) ?? { hired: 0, pending: 0, total: 0 };
      existing.total++;
      if (c.candidate_status === "hired") existing.hired++;
      else if (!["rejected", "withdrawn", "hired"].includes(c.candidate_status)) existing.pending++;
      countMap.set(c.requisition_id, existing);
    }

    const rows = (reqs ?? []).map((r) => {
      const counts = countMap.get(r.id) ?? { hired: 0, pending: 0, total: 0 };
      return {
        requisition_code: r.requisition_code ?? "",
        title: r.requisition_title,
        department: (r.department as unknown as { department_name_en: string } | null)?.department_name_en ?? "",
        designation: (r.designation as unknown as { designation_name_en: string } | null)?.designation_name_en ?? "",
        company: (r.owner_company as unknown as { legal_name_en: string } | null)?.legal_name_en ?? "",
        requested_count: r.headcount_required ?? 1,
        status: r.requisition_status,
        opened_date: r.opened_date ?? "",
        target_date: r.target_fill_date ?? "",
        total_candidates: counts.total,
        hired_count: counts.hired,
        pending_count: counts.pending,
        owner_company_id: r.owner_company_id ?? 0,
      };
    });

    const ownerCompanyIds = [...new Set(rows.map((r) => r.owner_company_id as number).filter(Boolean))];

    return {
      columns: [
        "requisition_code", "title", "department", "designation", "company",
        "requested_count", "status", "opened_date", "target_date",
        "total_candidates", "hired_count", "pending_count",
      ],
      rows,
      meta: { total: rows.length, ownerCompanyIds },
    };
  },
};


