/**
 * HR_CANDIDATE_PIPELINE — Report Fetcher
 * Phase: REPORT.4 — HR.11 Reports + Letters + Forms Library
 *
 * SECURITY: Does NOT expose expected_salary, offer amounts, or personal notes.
 */
import type { ReportFetcher, ReportDataResult } from "@/lib/report-center/types";
import { createAdminClient } from "@/lib/supabase/admin";

export const candidatePipelineFetcher: ReportFetcher = {
  reportCode: "HR_CANDIDATE_PIPELINE",

  async fetch(filters: Record<string, unknown>): Promise<ReportDataResult> {
    const db = createAdminClient();

    let q = db
      .from("hr_candidates")
      .select(
        `id, candidate_code, full_name_en, source, candidate_status, pipeline_stage,
         rating, availability_date, created_at,
         requisition:hr_job_requisitions(
           id, requisition_code, requisition_title,
           designation:designations(designation_name_en)
         ),
         nationality:countries(name_en)`
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (filters.candidate_status) q = q.eq("candidate_status", String(filters.candidate_status));
    if (filters.requisition_status) q = q.eq("pipeline_stage", String(filters.requisition_status));
    if (filters.date_from) q = q.gte("created_at", String(filters.date_from));
    if (filters.date_to) q = q.lte("created_at", String(filters.date_to));
    if (filters.search) q = q.ilike("full_name_en", `%${filters.search}%`);

    const { data: candidates, error } = await q.limit(2000);
    if (error) throw new Error(`HR_CANDIDATE_PIPELINE fetch error: ${error.message}`);

    // Fetch latest interview per candidate
    const candidateIds = (candidates ?? []).map((c) => c.id);
    const { data: interviews } = candidateIds.length
      ? await db
          .from("hr_interviews")
          .select("candidate_id, interview_datetime, interview_status, result")
          .in("candidate_id", candidateIds)
          .is("deleted_at", null)
          .order("interview_datetime", { ascending: false })
      : { data: [] };

    const lastInterview = new Map<number, { interview_datetime: string | null; result: string | null }>();
    for (const iv of interviews ?? []) {
      if (!lastInterview.has(iv.candidate_id)) {
        lastInterview.set(iv.candidate_id, { interview_datetime: iv.interview_datetime, result: iv.result });
      }
    }

    // Fetch offer status per candidate
    const { data: offers } = candidateIds.length
      ? await db
          .from("hr_offers")
          .select("candidate_id, offer_status, owner_company_id")
          .in("candidate_id", candidateIds)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
      : { data: [] };

    const offerMap = new Map<number, { offer_status: string; owner_company_id: number | null }>();
    for (const offer of offers ?? []) {
      if (!offerMap.has(offer.candidate_id)) {
        offerMap.set(offer.candidate_id, { offer_status: offer.offer_status, owner_company_id: offer.owner_company_id });
      }
    }

    const rows = (candidates ?? []).map((c) => {
      const req = c.requisition as unknown as { requisition_code: string | null; requisition_title: string; designation?: { designation_name_en: string } | null } | null;
      const iv = lastInterview.get(c.id);
      const offer = offerMap.get(c.id);
      return {
        candidate_code: c.candidate_code ?? "",
        candidate_name: c.full_name_en,
        nationality: (c.nationality as unknown as { name_en: string } | null)?.name_en ?? "",
        requisition: req?.requisition_title ?? "",
        designation: req?.designation?.designation_name_en ?? "",
        candidate_status: c.candidate_status,
        pipeline_stage: c.pipeline_stage,
        source: c.source ?? "",
        rating: c.rating ?? "",
        last_interview_date: iv?.interview_datetime ?? "",
        interview_result: iv?.result ?? "",
        offer_status: offer?.offer_status ?? "none",
        // expected_salary and offer amount intentionally omitted
        owner_company_id: offer?.owner_company_id ?? 0,
      };
    });

    const ownerCompanyIds = [...new Set(rows.map((r) => r.owner_company_id as number).filter(Boolean))];

    return {
      columns: [
        "candidate_code", "candidate_name", "nationality",
        "requisition", "designation", "candidate_status", "pipeline_stage",
        "source", "rating", "last_interview_date", "interview_result", "offer_status",
      ],
      rows,
      meta: { total: rows.length, ownerCompanyIds },
    };
  },
};


