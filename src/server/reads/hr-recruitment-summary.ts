import "server-only";
import {getAuthContext, hasPermission, type AuthContext} from "@/lib/rbac/check";
import {createClient} from "@/lib/supabase/server";
import {recruitmentSummaryCriteriaSchema, recruitmentSummarySchema, candidateSummaryCriteriaSchema, candidateSummarySchema} from "@/lib/reads/hr-recruitment-summary-schema";
const permitted = (ctx: AuthContext) => hasPermission(ctx, "hr.recruitment.view") || hasPermission(ctx, "hr.recruitment.manage");
const validCounts = (results: {error: unknown; count: number | null}[]) => results.every(r => !r.error && r.count !== null && Number.isSafeInteger(r.count) && r.count >= 0);

export async function readRecruitmentSummary(input: unknown, context?: AuthContext) {
  if (!recruitmentSummaryCriteriaSchema.safeParse(input).success) return {success: false, error: "Invalid recruitment summary criteria"};
  try {
    const ctx = context ?? await getAuthContext();
    if (!permitted(ctx)) return {success: false, error: "Permission denied"};
    const db = await createClient();
    // Preserve the original server-local rolling Sunday/month-start semantics.
    // Changing business time boundaries belongs to the HR workflow decision.
    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const monthStart = new Date(); monthStart.setDate(1);
    const results = await Promise.all([
      db.from("hr_job_requisitions").select("id", {count: "exact", head: true}).is("deleted_at", null),
      db.from("hr_job_requisitions").select("id", {count: "exact", head: true}).is("deleted_at", null).eq("requisition_status", "open"),
      db.from("hr_candidates").select("id", {count: "exact", head: true}).is("deleted_at", null),
      db.from("hr_candidates").select("id", {count: "exact", head: true}).is("deleted_at", null).in("candidate_status", ["new", "screening", "shortlisted", "interview", "selected", "offered", "accepted"]),
      db.from("hr_interviews").select("id", {count: "exact", head: true}).is("deleted_at", null).eq("interview_status", "scheduled").gte("interview_datetime", weekStart.toISOString()),
      db.from("hr_offers").select("id", {count: "exact", head: true}).is("deleted_at", null).in("offer_status", ["draft", "pending_approval", "sent"]),
      db.from("hr_onboarding_tasks").select("id", {count: "exact", head: true}).is("deleted_at", null).in("task_status", ["pending", "in_progress"]),
      db.from("employee_recruitment_links").select("id", {count: "exact", head: true}).gte("converted_at", monthStart.toISOString()),
    ]);
    if (!validCounts(results)) throw Error("Incomplete recruitment counts");
    const parsed = recruitmentSummarySchema.safeParse(Object.fromEntries(Object.keys(recruitmentSummarySchema.shape).map((key, index) => [key, results[index].count])));
    if (!parsed.success) throw Error("Inconsistent recruitment counts");
    return {success: true, data: parsed.data};
  } catch {return {success: false, error: "Recruitment summary could not be completely loaded. Please retry."};}
}

export async function readCandidateSummary(input: unknown) {
  const parsed = candidateSummaryCriteriaSchema.safeParse(input);
  if (!parsed.success) return {success: false, error: "Invalid candidate summary criteria"};
  try {
    if (!permitted(await getAuthContext())) return {success: false, error: "Permission denied"};
    const db = await createClient(), candidateId = parsed.data.candidateId;
    const [candidate, ...results] = await Promise.all([
      db.from("hr_candidates").select("id").eq("id", candidateId).is("deleted_at", null).maybeSingle(),
      db.from("hr_interviews").select("id", {count: "exact", head: true}).eq("candidate_id", candidateId).is("deleted_at", null),
      db.from("hr_offers").select("id", {count: "exact", head: true}).eq("candidate_id", candidateId).is("deleted_at", null),
      db.from("hr_candidate_documents").select("id", {count: "exact", head: true}).eq("candidate_id", candidateId).is("deleted_at", null),
      db.from("hr_onboarding_tasks").select("id", {count: "exact", head: true}).eq("candidate_id", candidateId).is("deleted_at", null),
      db.from("hr_onboarding_tasks").select("id", {count: "exact", head: true}).eq("candidate_id", candidateId).is("deleted_at", null).in("task_status", ["pending", "in_progress"]),
    ]);
    if (candidate.error) throw Error("Candidate authorization unavailable");
    // An error-free point read with no visible subject is not an authorized
    // empty summary. Do not disclose whether it is absent or outside the scope.
    if (!candidate.data) return {success: false, error: "Permission denied"};
    if (candidate.data.id !== candidateId || !validCounts(results)) throw Error("Candidate counts unavailable");
    const safe = candidateSummarySchema.safeParse({candidateId, interview_count: results[0].count, offer_count: results[1].count, document_count: results[2].count, onboarding_task_count: results[3].count, pending_task_count: results[4].count});
    if (!safe.success) throw Error("Inconsistent candidate counts");
    return {success: true, data: safe.data};
  } catch {return {success: false, error: "Candidate summary could not be completely loaded. Please retry."};}
}
