import {z} from "zod";
import {ReadError} from "@/lib/reads/client";
import {candidateChildCriteriaSchema, candidateChildNativeDetailSchemas, type CandidateChildKind} from "@/lib/reads/hr-candidate-children-schema";

/** TEST DATA ONLY. Completes older deliberately-short synthetic UI fixtures;
 * production transport never defaults missing columns. New malformed/partial
 * transport cases must bypass this builder so they remain genuine failures. */
export async function candidateChildFixtureReply(input: unknown, fixtureResult: unknown) {
  const request = candidateChildCriteriaSchema.parse(input);
  const result = z.object({success: z.boolean(), data: z.array(z.record(z.string(), z.unknown())).optional()}).parse(await fixtureResult);
  if (!result.success) throw new ReadError("Controlled child collection failure", 503);
  const rows = (result.data ?? []).map(source => candidateChildFixtureRow(request.kind, request.candidateId, source));
  if (request.operation === "detail") {
    const row = rows.find(value => value.id === request.recordId);
    if (!row) throw new ReadError("Controlled child detail unavailable", 403);
    return {success: true as const, data: {...request, row}};
  }
  const from = (request.page - 1) * request.pageSize;
  return {success: true as const, data: {operation: "page" as const, kind: request.kind, candidateId: request.candidateId,
    page: request.page, pageSize: request.pageSize, totalCount: rows.length, rows: rows.slice(from, from + request.pageSize)}};
}

export function candidateChildFixtureRow(kind: CandidateChildKind, candidateId: number, source: Record<string, unknown>) {
  const base = {candidate_id: candidateId, created_at: "2026-10-04T00:00:00Z", notes: null};
  const defaults = {
    documents: {document_purpose: null, verification_status: "unverified", dms_document: null},
    interviews: {workspace_revision:1,interviewer_id:null,interview_round: "first", interview_status: "scheduled", interview_datetime: null, interview_location: null, result: null, score: null, feedback: null, next_step: null},
    offers: {workspace_revision:1,terms_version:1,approved_terms_version:null,accepted_terms_version:null,housing_allowance:null,transport_allowance:null,other_allowances:null,owner_company_id: null, branch_id: null, offer_status: "draft", offer_date: null, proposed_joining_date: null, valid_until: null, basic_salary: null, gross_salary: null, currency: "AED", designation: null},
    onboarding: {employee_id:null,workspace_revision:1,checklist_version:1,is_required:true,completion_criteria:null,evidence_required:false,prerequisite_task_id:null,assigned_to:null,dms_document_id:null,completed_by:null,completed_at:null,task_category: null, task_status: "pending", due_date: null},
  };
  const joined = kind === "documents" && source.dms_document && typeof source.dms_document === "object"
    ? {dms_document: {id: source.dms_document_id, document_number: null, document_title: null, ...source.dms_document}} : {};
  const row = candidateChildNativeDetailSchemas[kind].parse({...base, ...defaults[kind], ...source, ...joined});
  return kind === "offers" && "owner_company_id" in row
    ? {...row, salaryAccess: source.salaryAccess ?? {companyId: row.owner_company_id, branchId: row.branch_id, canView: true, canManage: true}} : row;
}
