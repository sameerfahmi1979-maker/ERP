import "server-only";
import {getAuthContext, hasPermission, hasGlobalPermission, hasPermissionInScope, type AuthContext} from "@/lib/rbac/check";
import {createClient} from "@/lib/supabase/server";
import {candidateRecordCriteriaSchema, candidateRecordRowSchema, candidateRecordSchema, candidateSalaryReadSchema, candidateSalaryAccessSchema} from "@/lib/reads/hr-candidate-record-schema";
import {z} from "zod";

const COLUMNS = "id,candidate_code,requisition_id,full_name_en,full_name_ar,gender,nationality_id,date_of_birth,mobile_number,email,current_location,source,agency_name,referred_by_employee_id,current_employer,current_position,expected_salary,notice_period_days,candidate_status,pipeline_stage,rating,availability_date,notes,created_at,updated_at,workspace_revision,created_by,deleted_at,requisition:hr_job_requisitions(id,requisition_code,requisition_title),nationality:countries(id,name_en),referred_by:employees!hr_candidates_referred_by_employee_id_fkey(id,full_name_en,employee_code)";
const nativeScope = z.object({id: z.number().int().positive(), owner_company_id: z.number().int().positive().nullable(), branch_id: z.number().int().positive().nullable()}).strip();
const denied = {success: false as const, error: "Permission denied"};

/** Request-bound native F03 projection. No admin client, arbitrary columns or client-supplied scope. */
export async function readCandidateRecord(input: unknown, context?: AuthContext) {
  const criteria = candidateRecordCriteriaSchema.safeParse(input);
  if (!criteria.success) return {success: false as const, error: "Invalid candidate record criteria"};
  try {
    const ctx = context ?? await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.view") && !hasPermission(ctx, "hr.recruitment.manage")) return denied;
    const db = await createClient();
    let candidate: ReturnType<typeof candidateRecordRowSchema.parse> | null = null;
    if (criteria.data.kind === "record") {
      const result = await db.from("hr_candidates").select(COLUMNS).eq("id", criteria.data.candidateId).is("deleted_at", null).maybeSingle();
      if (result.error) throw Error("Candidate authorization unavailable");
      if (!result.data) return denied;
      candidate = candidateRecordRowSchema.parse(result.data);
      if (candidate.id !== criteria.data.candidateId || candidate.requisition && candidate.requisition.id !== candidate.requisition_id) throw Error("Candidate identity mismatch");
    }
    const requisitionId = criteria.data.kind === "record" ? candidate!.requisition_id : criteria.data.requisitionId;
    let companyId: number | null = null, branchId: number | null = null;
    if (requisitionId !== null) {
      const result = await db.from("hr_job_requisitions").select("id,owner_company_id,branch_id").eq("id", requisitionId).is("deleted_at", null).maybeSingle();
      if (result.error) throw Error("Requisition authorization unavailable");
      if (!result.data) return denied;
      const scope = nativeScope.parse(result.data);
      if (scope.id !== requisitionId || scope.owner_company_id === null && scope.branch_id !== null) throw Error("Requisition scope mismatch");
      companyId = scope.owner_company_id; branchId = scope.branch_id;
    }
    const allowed = (code: string) => companyId === null ? hasGlobalPermission(ctx, code) : hasPermissionInScope(ctx, code, companyId, branchId);
    const canView = allowed("hr.payroll.view");
    const salaryAccess = candidateSalaryAccessSchema.parse({canView, canManage: canView && allowed("hr.payroll.manage"), canManageCandidate: allowed("hr.recruitment.manage"), companyId, branchId});
    if (candidate) return {success: true as const, updatedAt: Date.now(), data: candidateRecordSchema.parse({kind: "record", candidate: {...candidate, expected_salary: canView ? candidate.expected_salary : null}, salaryAccess})};
    return {success: true as const, updatedAt: Date.now(), data: candidateSalaryReadSchema.parse({kind: "salary-access", requisitionId, salaryAccess})};
  } catch {return {success: false as const, error: "Candidate record could not be completely loaded. Please retry."};}
}
