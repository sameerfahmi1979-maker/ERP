/**
 * HR_ONBOARDING_TASKS — Report Fetcher
 * Phase: REPORT.4 — HR.11 Reports + Letters + Forms Library
 */
import type { ReportFetcher, ReportDataResult } from "@/lib/report-center/types";
import { createAdminClient } from "@/lib/supabase/admin";

function agingDays(dueDate: string | null): number | null {
  if (!dueDate) return null;
  return Math.ceil((Date.now() - new Date(dueDate).getTime()) / 86400000);
}

export const onboardingTasksFetcher: ReportFetcher = {
  reportCode: "HR_ONBOARDING_TASKS",

  async fetch(filters: Record<string, unknown>): Promise<ReportDataResult> {
    const db = createAdminClient();

    let q = db
      .from("hr_onboarding_tasks")
      .select(
        `id, candidate_id, employee_id, task_title, task_category, task_status,
         due_date, completed_at,
         assigned_to_profile:profiles!assigned_to(display_name),
         completed_by_profile:profiles!completed_by(display_name),
         candidate:hr_candidates(full_name_en, candidate_code),
         employee:employees(
           full_name_en, employee_code, owner_company_id,
           owner_company:owner_companies(legal_name_en)
         )`
      )
      .is("deleted_at", null)
      .order("due_date", { ascending: true });

    if (filters.employee_status) q = q.eq("task_status", String(filters.employee_status));
    if (filters.date_from) q = q.gte("due_date", String(filters.date_from));
    if (filters.date_to) q = q.lte("due_date", String(filters.date_to));

    const { data, error } = await q.limit(5000);
    if (error) throw new Error(`HR_ONBOARDING_TASKS fetch error: ${error.message}`);

    const rows = (data ?? []).map((r) => {
      const emp = r.employee as unknown as { full_name_en: string; employee_code: string; owner_company_id: number; owner_company?: { legal_name_en: string } | null } | null;
      const cand = r.candidate as unknown as { full_name_en: string; candidate_code: string | null } | null;
      const personName = emp?.full_name_en ?? cand?.full_name_en ?? "";
      const personCode = emp?.employee_code ?? cand?.candidate_code ?? "";
      return {
        person_code: personCode,
        person_name: personName,
        person_type: emp ? "Employee" : "Candidate",
        company: emp?.owner_company?.legal_name_en ?? "",
        task_title: r.task_title,
        task_category: r.task_category ?? "",
        task_status: r.task_status,
        assigned_to: (r.assigned_to_profile as unknown as { display_name: string } | null)?.display_name ?? "",
        due_date: r.due_date ?? "",
        completed_at: r.completed_at ?? "",
        completed_by: (r.completed_by_profile as unknown as { display_name: string } | null)?.display_name ?? "",
        aging_days: agingDays(r.due_date),
        owner_company_id: emp?.owner_company_id ?? 0,
      };
    });

    const ownerCompanyIds = [...new Set(rows.map((r) => r.owner_company_id as number).filter(Boolean))];

    return {
      columns: [
        "person_code", "person_name", "person_type", "company",
        "task_title", "task_category", "task_status",
        "assigned_to", "due_date", "completed_at", "completed_by", "aging_days",
      ],
      rows,
      meta: { total: rows.length, ownerCompanyIds },
    };
  },
};


