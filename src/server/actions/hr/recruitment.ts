"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { z } from "zod";

// ============================================================================
// Shared result type
// ============================================================================

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

// ============================================================================
// Audit helper
// ============================================================================

type RecruitmentAuditParams = {
  action: string;
  entity_name: string;
  entity_id: number;
  entity_reference?: string;
  candidate_id?: number;
  candidate_code?: string;
  candidate_name?: string;
  requisition_id?: number;
  requisition_code?: string;
  employee_id?: number;
  employee_code?: string;
  extra?: Record<string, unknown>;
};

async function recruitmentAuditLog(params: RecruitmentAuditParams): Promise<void> {
  const actionMap: Record<string, "create" | "update" | "delete" | "view" | "archive"> = {
    create: "create", update: "update", delete: "delete", view: "view", archive: "delete",
  };
  await logAudit({
    module_code: "HR",
    entity_name: params.entity_name,
    entity_id: params.entity_id,
    entity_reference: params.entity_reference ?? "",
    action: actionMap[params.action] ?? "update",
    new_values: {
      ...(params.candidate_id !== undefined && { candidate_id: params.candidate_id }),
      ...(params.candidate_code !== undefined && { candidate_code: params.candidate_code }),
      ...(params.candidate_name !== undefined && { candidate_name: params.candidate_name }),
      ...(params.requisition_id !== undefined && { requisition_id: params.requisition_id }),
      ...(params.requisition_code !== undefined && { requisition_code: params.requisition_code }),
      ...(params.employee_id !== undefined && { employee_id: params.employee_id }),
      ...(params.employee_code !== undefined && { employee_code: params.employee_code }),
      ...params.extra,
    },
  });
}

// ============================================================================
// Zod Schemas
// ============================================================================

const recruitmentListParamsSchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  pipelineStage: z.string().optional(),
  requisitionId: z.number().optional(),
  nationalityId: z.number().optional(),
  source: z.string().optional(),
  ownerCompanyId: z.number().optional(),
  departmentId: z.number().optional(),
  interviewerId: z.number().optional(),
  assignedTo: z.number().optional(),
  page: z.number().min(1).default(1),
  pageSize: z.number().min(1).max(200).default(50),
});

const jobRequisitionCreateSchema = z.object({
  requisition_title: z.string().min(1, "Title is required"),
  owner_company_id: z.number().optional().nullable(),
  branch_id: z.number().optional().nullable(),
  department_id: z.number().optional().nullable(),
  designation_id: z.number().optional().nullable(),
  work_site_id: z.number().optional().nullable(),
  requested_by: z.number().optional().nullable(),
  hiring_manager_id: z.number().optional().nullable(),
  employment_type_id: z.number().optional().nullable(),
  employee_category_id: z.number().optional().nullable(),
  vacancies_count: z.number().min(1).default(1),
  target_start_date: z.string().optional().nullable(),
  requisition_status: z.enum(["draft", "open", "on_hold", "filled", "cancelled", "closed"]).default("draft"),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  budgeted_salary_min: z.number().min(0).optional().nullable(),
  budgeted_salary_max: z.number().min(0).optional().nullable(),
  job_description: z.string().optional().nullable(),
  requirements: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
}).refine(
  (d) => {
    if (d.budgeted_salary_min != null && d.budgeted_salary_max != null) {
      return d.budgeted_salary_min <= d.budgeted_salary_max;
    }
    return true;
  },
  { message: "Min salary must not exceed max salary", path: ["budgeted_salary_min"] }
);

const jobRequisitionUpdateSchema = z.object({
  requisition_title: z.string().min(1).optional(),
  owner_company_id: z.number().optional().nullable(),
  branch_id: z.number().optional().nullable(),
  department_id: z.number().optional().nullable(),
  designation_id: z.number().optional().nullable(),
  work_site_id: z.number().optional().nullable(),
  requested_by: z.number().optional().nullable(),
  hiring_manager_id: z.number().optional().nullable(),
  employment_type_id: z.number().optional().nullable(),
  employee_category_id: z.number().optional().nullable(),
  vacancies_count: z.number().min(1).optional(),
  target_start_date: z.string().optional().nullable(),
  requisition_status: z.enum(["draft", "open", "on_hold", "filled", "cancelled", "closed"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  budgeted_salary_min: z.number().min(0).optional().nullable(),
  budgeted_salary_max: z.number().min(0).optional().nullable(),
  job_description: z.string().optional().nullable(),
  requirements: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const candidateCreateSchema = z.object({
  full_name_en: z.string().min(1, "Full name is required"),
  full_name_ar: z.string().optional().nullable(),
  requisition_id: z.number().optional().nullable(),
  gender: z.enum(["male", "female"]).optional().nullable(),
  nationality_id: z.number().optional().nullable(),
  date_of_birth: z.string().optional().nullable(),
  mobile_number: z.string().optional().nullable(),
  email: z.string().email("Invalid email").optional().nullable().or(z.literal("")),
  current_location: z.string().optional().nullable(),
  source: z.enum(["direct", "referral", "agency", "walk_in", "online", "other"]).optional().nullable(),
  agency_name: z.string().optional().nullable(),
  referred_by_employee_id: z.number().optional().nullable(),
  current_employer: z.string().optional().nullable(),
  current_position: z.string().optional().nullable(),
  expected_salary: z.number().min(0).optional().nullable(),
  notice_period_days: z.number().min(0).optional().nullable(),
  candidate_status: z.enum(["new", "screening", "shortlisted", "interview", "selected", "offered", "accepted", "rejected", "withdrawn", "hired", "blacklisted"]).default("new"),
  pipeline_stage: z.enum(["new", "screening", "shortlisted", "interview", "offer", "onboarding", "hired", "closed"]).default("new"),
  rating: z.enum(["excellent", "good", "average", "weak", "not_suitable"]).optional().nullable(),
  availability_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const candidateUpdateSchema = candidateCreateSchema.partial();

const candidateStatusSchema = z.object({
  candidate_status: z.enum(["new", "screening", "shortlisted", "interview", "selected", "offered", "accepted", "rejected", "withdrawn", "hired", "blacklisted"]),
  pipeline_stage: z.enum(["new", "screening", "shortlisted", "interview", "offer", "onboarding", "hired", "closed"]).optional(),
  notes: z.string().optional().nullable(),
});

const candidateDocumentLinkSchema = z.object({
  dms_document_id: z.number(),
  document_purpose: z.enum(["cv", "passport", "certificate", "offer", "photo", "other"]).optional().nullable(),
  notes: z.string().optional().nullable(),
});

const interviewCreateSchema = z.object({
  interview_round: z.enum(["screening", "first", "second", "technical", "final", "other"]).default("first"),
  interview_datetime: z.string().optional().nullable(),
  interview_location: z.string().optional().nullable(),
  interviewer_id: z.number().optional().nullable(),
  interview_status: z.enum(["scheduled", "completed", "cancelled", "no_show", "rescheduled"]).default("scheduled"),
  requisition_id: z.number().optional().nullable(),
  result: z.enum(["pass", "hold", "fail", "pending"]).optional().nullable(),
  score: z.number().min(0).optional().nullable(),
  feedback: z.string().optional().nullable(),
  next_step: z.string().optional().nullable(),
});

const interviewUpdateSchema = interviewCreateSchema.partial();

const interviewCompleteSchema = z.object({
  result: z.enum(["pass", "hold", "fail", "pending"]),
  score: z.number().min(0).optional().nullable(),
  feedback: z.string().optional().nullable(),
  next_step: z.string().optional().nullable(),
});

const offerCreateSchema = z.object({
  requisition_id: z.number().optional().nullable(),
  offer_status: z.enum(["draft", "pending_approval", "approved", "sent", "accepted", "rejected", "withdrawn", "expired", "cancelled"]).default("draft"),
  offer_date: z.string().optional().nullable(),
  valid_until: z.string().optional().nullable(),
  proposed_joining_date: z.string().optional().nullable(),
  owner_company_id: z.number().optional().nullable(),
  branch_id: z.number().optional().nullable(),
  department_id: z.number().optional().nullable(),
  designation_id: z.number().optional().nullable(),
  employment_type_id: z.number().optional().nullable(),
  basic_salary: z.number().min(0).optional().nullable(),
  gross_salary: z.number().min(0).optional().nullable(),
  currency: z.string().default("AED"),
  offer_document_id: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
}).refine(
  (d) => {
    if (d.offer_date && d.valid_until) {
      return new Date(d.valid_until) >= new Date(d.offer_date);
    }
    return true;
  },
  { message: "Valid until must be on or after offer date", path: ["valid_until"] }
);

const offerUpdateSchema = z.object({
  offer_title: z.string().min(1).optional(),
  owner_company_id: z.number().optional().nullable(),
  basic_salary: z.number().min(0).optional().nullable(),
  gross_salary: z.number().min(0).optional().nullable(),
  housing_allowance: z.number().min(0).optional().nullable(),
  transport_allowance: z.number().min(0).optional().nullable(),
  other_allowances: z.number().min(0).optional().nullable(),
  proposed_start_date: z.string().optional().nullable(),
  offer_expiry_date: z.string().optional().nullable(),
  probation_period_months: z.number().int().min(0).max(24).optional().nullable(),
  currency_code: z.string().length(3).optional().nullable(),
  employment_type_id: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const offerStatusSchema = z.object({
  offer_status: z.enum(["draft", "pending_approval", "approved", "sent", "accepted", "rejected", "withdrawn", "expired", "cancelled"]),
  notes: z.string().optional().nullable(),
});

const onboardingTaskCreateSchema = z.object({
  candidate_id: z.number().optional().nullable(),
  employee_id: z.number().optional().nullable(),
  task_title: z.string().min(1, "Task title is required"),
  task_category: z.enum(["document", "medical", "visa", "training", "site_access", "payroll", "it", "operations", "hr", "other"]).optional().nullable(),
  task_status: z.enum(["pending", "in_progress", "completed", "blocked", "not_applicable", "cancelled"]).default("pending"),
  assigned_to: z.number().optional().nullable(),
  due_date: z.string().optional().nullable(),
  dms_document_id: z.number().optional().nullable(),
  related_record_type: z.string().optional().nullable(),
  related_record_id: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const onboardingTaskUpdateSchema = onboardingTaskCreateSchema.partial();

const candidateConversionSchema = z.object({
  candidate_id: z.number(),
  // Fields from offer/requisition or overridden by user
  owner_company_id: z.number(),
  branch_id: z.number().optional().nullable(),
  department_id: z.number().optional().nullable(),
  designation_id: z.number().optional().nullable(),
  employment_type_id: z.number().optional().nullable(),
  employee_category_id: z.number().optional().nullable(),
  joining_date: z.string().min(1, "Joining date is required"),
  employee_status: z.enum(["active", "probation", "suspended", "inactive", "terminated"]).default("active"),
  reporting_manager_id: z.number().optional().nullable(),
  primary_work_site_id: z.number().optional().nullable(),
  conversion_notes: z.string().optional().nullable(),
  offer_id: z.number().optional().nullable(),
  requisition_id: z.number().optional().nullable(),
});

// ============================================================================
// Row types
// ============================================================================

export type JobRequisitionRow = {
  id: number;
  requisition_code: string | null;
  requisition_title: string;
  owner_company_id: number | null;
  branch_id: number | null;
  department_id: number | null;
  designation_id: number | null;
  work_site_id: number | null;
  requested_by: number | null;
  hiring_manager_id: number | null;
  employment_type_id: number | null;
  employee_category_id: number | null;
  vacancies_count: number;
  target_start_date: string | null;
  requisition_status: string;
  priority: string;
  budgeted_salary_min: number | null;
  budgeted_salary_max: number | null;
  job_description: string | null;
  requirements: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  deleted_at: string | null;
  // Joins
  owner_company?: { id: number; legal_name_en: string; company_code: string } | null;
  branch?: { id: number; branch_name_en: string } | null;
  department?: { id: number; department_name_en: string } | null;
  designation?: { id: number; designation_name_en: string } | null;
  work_site?: { id: number; site_name: string } | null;
  employment_type?: { id: number; name_en: string } | null;
};

export type CandidateRow = {
  id: number;
  candidate_code: string | null;
  requisition_id: number | null;
  full_name_en: string;
  full_name_ar: string | null;
  gender: string | null;
  nationality_id: number | null;
  date_of_birth: string | null;
  mobile_number: string | null;
  email: string | null;
  current_location: string | null;
  source: string | null;
  agency_name: string | null;
  referred_by_employee_id: number | null;
  current_employer: string | null;
  current_position: string | null;
  expected_salary: number | null;
  notice_period_days: number | null;
  candidate_status: string;
  pipeline_stage: string;
  rating: string | null;
  availability_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  deleted_at: string | null;
  // Joins
  requisition?: { id: number; requisition_code: string | null; requisition_title: string } | null;
  nationality?: { id: number; name_en: string } | null;
  referred_by?: { id: number; full_name_en: string; employee_code: string } | null;
};

export type InterviewRow = {
  id: number;
  candidate_id: number;
  requisition_id: number | null;
  interview_round: string;
  interview_datetime: string | null;
  interview_location: string | null;
  interviewer_id: number | null;
  interview_status: string;
  result: string | null;
  score: number | null;
  feedback: string | null;
  next_step: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  candidate?: { id: number; candidate_code: string | null; full_name_en: string } | null;
  interviewer?: { id: number; full_name_en: string | null; email: string } | null;
};

export type OfferRow = {
  id: number;
  candidate_id: number;
  requisition_id: number | null;
  offer_status: string;
  offer_date: string | null;
  valid_until: string | null;
  proposed_joining_date: string | null;
  owner_company_id: number | null;
  branch_id: number | null;
  department_id: number | null;
  designation_id: number | null;
  employment_type_id: number | null;
  basic_salary: number | null;
  gross_salary: number | null;
  currency: string;
  offer_document_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  candidate?: { id: number; candidate_code: string | null; full_name_en: string } | null;
  designation?: { id: number; designation_name_en: string } | null;
  department?: { id: number; department_name_en: string } | null;
};

export type OnboardingTaskRow = {
  id: number;
  candidate_id: number | null;
  employee_id: number | null;
  task_title: string;
  task_category: string | null;
  task_status: string;
  assigned_to: number | null;
  due_date: string | null;
  completed_by: number | null;
  completed_at: string | null;
  related_record_type: string | null;
  related_record_id: number | null;
  dms_document_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  candidate?: { id: number; candidate_code: string | null; full_name_en: string } | null;
  assigned_user?: { id: number; full_name_en: string | null; email: string } | null;
};

export type RecruitmentLinkRow = {
  id: number;
  employee_id: number;
  candidate_id: number | null;
  requisition_id: number | null;
  offer_id: number | null;
  converted_at: string;
  converted_by: number | null;
  conversion_notes: string | null;
  candidate?: { id: number; candidate_code: string | null; full_name_en: string } | null;
  requisition?: { id: number; requisition_code: string | null; requisition_title: string } | null;
};

// ============================================================================
// Job Requisitions
// ============================================================================

const REQ_JOINS = [
  "owner_company:owner_companies!hr_job_requisitions_owner_company_id_fkey(id,legal_name_en,company_code)",
  "branch:branches(id,branch_name_en)",
  "department:departments(id,department_name_en)",
  "designation:designations(id,designation_name_en)",
  "work_site:work_sites(id,site_name)",
  "employment_type:hr_employment_types(id,name_en)",
].join(",");

export async function listJobRequisitions(
  params?: Partial<z.infer<typeof recruitmentListParamsSchema>>
): Promise<ActionResult<{ rows: JobRequisitionRow[]; totalCount: number; page: number; pageSize: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.view") && !hasPermission(ctx, "hr.recruitment.manage") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }

    const parsed = recruitmentListParamsSchema.safeParse(params ?? {});
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
    const { search, status, ownerCompanyId, departmentId, page, pageSize } = parsed.data;

    const supabase = await createClient();
    let query = supabase
      .from("hr_job_requisitions")
      .select(`*,${REQ_JOINS}`, { count: "exact" })
      .is("deleted_at", null);

    if (search) query = query.or(`requisition_code.ilike.%${search}%,requisition_title.ilike.%${search}%`);
    if (status) query = query.eq("requisition_status", status);
    if (ownerCompanyId) query = query.eq("owner_company_id", ownerCompanyId);
    if (departmentId) query = query.eq("department_id", departmentId);

    const from = (page - 1) * pageSize;
    const { data, error, count } = await query.order("created_at", { ascending: false }).range(from, from + pageSize - 1);
    if (error) return { success: false, error: error.message };
    return { success: true, data: { rows: (data ?? []) as unknown as JobRequisitionRow[], totalCount: count ?? 0, page, pageSize } };
  } catch (err) {
    console.error("listJobRequisitions error", err);
    return { success: false, error: "Failed to list job requisitions" };
  }
}

export async function getJobRequisition(id: number): Promise<ActionResult<JobRequisitionRow>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.view") && !hasPermission(ctx, "hr.recruitment.manage") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("hr_job_requisitions")
      .select(`*,${REQ_JOINS}`)
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (error || !data) return { success: false, error: "Requisition not found" };
    return { success: true, data: data as unknown as JobRequisitionRow };
  } catch (err) {
    console.error("getJobRequisition error", err);
    return { success: false, error: "Failed to get requisition" };
  }
}

export async function createJobRequisition(
  input: z.infer<typeof jobRequisitionCreateSchema>
): Promise<ActionResult<{ id: number; requisition_code: string }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.manage") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const parsed = jobRequisitionCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };

    const adminClient = createAdminClient();
    const { data: numData, error: numError } = await adminClient.rpc("generate_next_reference_number", {
      p_rule_code: "HR_JOB_REQUISITION",
      p_document_type_code: null,
      p_target_table_name: "hr_job_requisitions",
      p_target_record_id: null,
      p_generation_reason: "New job requisition",
      p_generated_by: ctx.profile?.id ?? null,
    });
    if (numError || !numData || numData.length === 0) return { success: false, error: "Failed to generate requisition code" };
    const requisitionCode: string = numData[0].generated_reference_number;

    const supabase = await createClient();
    const { data: rec, error: insertError } = await supabase
      .from("hr_job_requisitions")
      .insert({ ...parsed.data, requisition_code: requisitionCode, created_by: ctx.profile?.id ?? null, updated_by: ctx.profile?.id ?? null })
      .select("id, requisition_code")
      .single();
    if (insertError || !rec) return { success: false, error: insertError?.message ?? "Insert failed" };

    await recruitmentAuditLog({
      action: "create", entity_name: "hr_job_requisitions", entity_id: rec.id,
      entity_reference: requisitionCode, requisition_id: rec.id, requisition_code: requisitionCode,
      extra: { title: parsed.data.requisition_title },
    });
    revalidatePath("/admin/hr/recruitment");
    revalidatePath("/admin/hr/recruitment/requisitions");
    return { success: true, data: { id: rec.id, requisition_code: requisitionCode } };
  } catch (err) {
    console.error("createJobRequisition error", err);
    return { success: false, error: "Failed to create job requisition" };
  }
}

export async function updateJobRequisition(
  id: number,
  input: z.infer<typeof jobRequisitionUpdateSchema>
): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.manage") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const parsed = jobRequisitionUpdateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };

    const supabase = await createClient();
    const { data: current } = await supabase.from("hr_job_requisitions").select("id, requisition_code").eq("id", id).is("deleted_at", null).single();
    if (!current) return { success: false, error: "Requisition not found" };

    const { error } = await supabase.from("hr_job_requisitions").update({ ...parsed.data, updated_by: ctx.profile?.id ?? null }).eq("id", id).is("deleted_at", null);
    if (error) return { success: false, error: error.message };

    await recruitmentAuditLog({ action: "update", entity_name: "hr_job_requisitions", entity_id: id, entity_reference: current.requisition_code ?? undefined, requisition_id: id, requisition_code: current.requisition_code ?? undefined });
    revalidatePath("/admin/hr/recruitment/requisitions");
    return { success: true };
  } catch (err) {
    console.error("updateJobRequisition error", err);
    return { success: false, error: "Failed to update job requisition" };
  }
}

export async function archiveJobRequisition(id: number): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.manage") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const supabase = await createClient();
    const { data: current } = await supabase.from("hr_job_requisitions").select("id, requisition_code").eq("id", id).is("deleted_at", null).single();
    if (!current) return { success: false, error: "Requisition not found" };

    const { error } = await supabase.from("hr_job_requisitions").update({ deleted_at: new Date().toISOString(), deleted_by: ctx.profile?.id ?? null }).eq("id", id);
    if (error) return { success: false, error: error.message };

    await recruitmentAuditLog({ action: "archive", entity_name: "hr_job_requisitions", entity_id: id, entity_reference: current.requisition_code ?? undefined });
    revalidatePath("/admin/hr/recruitment/requisitions");
    return { success: true };
  } catch (err) {
    console.error("archiveJobRequisition error", err);
    return { success: false, error: "Failed to archive job requisition" };
  }
}

export async function changeJobRequisitionStatus(id: number, status: string, notes?: string): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.manage") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const validStatuses = ["draft", "open", "on_hold", "filled", "cancelled", "closed"];
    if (!validStatuses.includes(status)) return { success: false, error: "Invalid status" };

    const supabase = await createClient();
    const { data: current } = await supabase.from("hr_job_requisitions").select("id, requisition_code, requisition_status").eq("id", id).is("deleted_at", null).single();
    if (!current) return { success: false, error: "Requisition not found" };

    const { error } = await supabase.from("hr_job_requisitions").update({ requisition_status: status, updated_by: ctx.profile?.id ?? null, notes: notes ?? undefined }).eq("id", id);
    if (error) return { success: false, error: error.message };

    await recruitmentAuditLog({ action: "update", entity_name: "hr_job_requisitions", entity_id: id, entity_reference: current.requisition_code ?? undefined, extra: { old_status: current.requisition_status, new_status: status } });
    revalidatePath("/admin/hr/recruitment/requisitions");
    return { success: true };
  } catch (err) {
    console.error("changeJobRequisitionStatus error", err);
    return { success: false, error: "Failed to change status" };
  }
}

// ============================================================================
// Candidates
// ============================================================================

const CAND_JOINS = [
  "requisition:hr_job_requisitions(id,requisition_code,requisition_title)",
  "nationality:countries(id,name_en)",
  "referred_by:employees!hr_candidates_referred_by_employee_id_fkey(id,full_name_en,employee_code)",
].join(",");

export async function listCandidates(
  params?: Partial<z.infer<typeof recruitmentListParamsSchema>>
): Promise<ActionResult<{ rows: CandidateRow[]; totalCount: number; page: number; pageSize: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.view") && !hasPermission(ctx, "hr.recruitment.manage") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const parsed = recruitmentListParamsSchema.safeParse(params ?? {});
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
    const { search, status, pipelineStage, requisitionId, nationalityId, source, page, pageSize } = parsed.data;

    const supabase = await createClient();
    let query = supabase.from("hr_candidates").select(`*,${CAND_JOINS}`, { count: "exact" }).is("deleted_at", null);

    if (search) query = query.or(`candidate_code.ilike.%${search}%,full_name_en.ilike.%${search}%,mobile_number.ilike.%${search}%,email.ilike.%${search}%`);
    if (status) query = query.eq("candidate_status", status);
    if (pipelineStage) query = query.eq("pipeline_stage", pipelineStage);
    if (requisitionId) query = query.eq("requisition_id", requisitionId);
    if (nationalityId) query = query.eq("nationality_id", nationalityId);
    if (source) query = query.eq("source", source);

    const from = (page - 1) * pageSize;
    const { data, error, count } = await query.order("created_at", { ascending: false }).range(from, from + pageSize - 1);
    if (error) return { success: false, error: error.message };
    return { success: true, data: { rows: (data ?? []) as unknown as CandidateRow[], totalCount: count ?? 0, page, pageSize } };
  } catch (err) {
    console.error("listCandidates error", err);
    return { success: false, error: "Failed to list candidates" };
  }
}

export async function getCandidate(id: number): Promise<ActionResult<CandidateRow>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.view") && !hasPermission(ctx, "hr.recruitment.manage") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("hr_candidates")
      .select(`*,${CAND_JOINS}`)
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (error || !data) return { success: false, error: "Candidate not found" };
    return { success: true, data: data as unknown as CandidateRow };
  } catch (err) {
    console.error("getCandidate error", err);
    return { success: false, error: "Failed to get candidate" };
  }
}

export async function createCandidate(
  input: z.infer<typeof candidateCreateSchema>
): Promise<ActionResult<{ id: number; candidate_code: string }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.manage") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const parsed = candidateCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };

    const adminClient = createAdminClient();
    const { data: numData, error: numError } = await adminClient.rpc("generate_next_reference_number", {
      p_rule_code: "HR_CANDIDATE",
      p_document_type_code: null,
      p_target_table_name: "hr_candidates",
      p_target_record_id: null,
      p_generation_reason: "New candidate",
      p_generated_by: ctx.profile?.id ?? null,
    });
    if (numError || !numData || numData.length === 0) return { success: false, error: "Failed to generate candidate code" };
    const candidateCode: string = numData[0].generated_reference_number;

    const supabase = await createClient();
    const { data: rec, error: insertError } = await supabase
      .from("hr_candidates")
      .insert({ ...parsed.data, candidate_code: candidateCode, created_by: ctx.profile?.id ?? null, updated_by: ctx.profile?.id ?? null })
      .select("id, candidate_code")
      .single();
    if (insertError || !rec) return { success: false, error: insertError?.message ?? "Insert failed" };

    await recruitmentAuditLog({ action: "create", entity_name: "hr_candidates", entity_id: rec.id, entity_reference: candidateCode, candidate_id: rec.id, candidate_code: candidateCode, candidate_name: parsed.data.full_name_en });
    revalidatePath("/admin/hr/recruitment/candidates");
    return { success: true, data: { id: rec.id, candidate_code: candidateCode } };
  } catch (err) {
    console.error("createCandidate error", err);
    return { success: false, error: "Failed to create candidate" };
  }
}

export async function updateCandidate(id: number, input: z.infer<typeof candidateUpdateSchema>): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.manage") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const parsed = candidateUpdateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };

    const supabase = await createClient();
    const { data: current } = await supabase.from("hr_candidates").select("id, candidate_code, full_name_en").eq("id", id).is("deleted_at", null).single();
    if (!current) return { success: false, error: "Candidate not found" };

    const { error } = await supabase.from("hr_candidates").update({ ...parsed.data, updated_by: ctx.profile?.id ?? null }).eq("id", id).is("deleted_at", null);
    if (error) return { success: false, error: error.message };

    await recruitmentAuditLog({ action: "update", entity_name: "hr_candidates", entity_id: id, entity_reference: current.candidate_code ?? undefined, candidate_id: id, candidate_code: current.candidate_code ?? undefined, candidate_name: current.full_name_en });
    revalidatePath("/admin/hr/recruitment/candidates");
    revalidatePath(`/admin/hr/recruitment/candidates/record/${id}`);
    return { success: true };
  } catch (err) {
    console.error("updateCandidate error", err);
    return { success: false, error: "Failed to update candidate" };
  }
}

export async function archiveCandidate(id: number): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.manage") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const supabase = await createClient();
    const { data: current } = await supabase.from("hr_candidates").select("id, candidate_code").eq("id", id).is("deleted_at", null).single();
    if (!current) return { success: false, error: "Candidate not found" };

    const { error } = await supabase.from("hr_candidates").update({ deleted_at: new Date().toISOString(), deleted_by: ctx.profile?.id ?? null }).eq("id", id);
    if (error) return { success: false, error: error.message };

    await recruitmentAuditLog({ action: "archive", entity_name: "hr_candidates", entity_id: id, entity_reference: current.candidate_code ?? undefined });
    revalidatePath("/admin/hr/recruitment/candidates");
    return { success: true };
  } catch (err) {
    console.error("archiveCandidate error", err);
    return { success: false, error: "Failed to archive candidate" };
  }
}

export async function changeCandidateStatus(
  id: number,
  input: z.infer<typeof candidateStatusSchema>
): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.manage") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const parsed = candidateStatusSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

    const supabase = await createClient();
    const { data: current } = await supabase.from("hr_candidates").select("id, candidate_code, full_name_en, candidate_status").eq("id", id).is("deleted_at", null).single();
    if (!current) return { success: false, error: "Candidate not found" };

    const updatePayload: Record<string, unknown> = { candidate_status: parsed.data.candidate_status, updated_by: ctx.profile?.id ?? null };
    if (parsed.data.pipeline_stage) updatePayload.pipeline_stage = parsed.data.pipeline_stage;

    const { error } = await supabase.from("hr_candidates").update(updatePayload).eq("id", id);
    if (error) return { success: false, error: error.message };

    await recruitmentAuditLog({ action: "update", entity_name: "hr_candidates", entity_id: id, entity_reference: current.candidate_code ?? undefined, candidate_id: id, candidate_code: current.candidate_code ?? undefined, candidate_name: current.full_name_en, extra: { action_type: "candidate_status_changed", old_status: current.candidate_status, new_status: parsed.data.candidate_status } });
    revalidatePath(`/admin/hr/recruitment/candidates/record/${id}`);
    revalidatePath("/admin/hr/recruitment/candidates");
    return { success: true };
  } catch (err) {
    console.error("changeCandidateStatus error", err);
    return { success: false, error: "Failed to change candidate status" };
  }
}

export async function getCandidatePipelineSummary(
  params?: { requisitionId?: number }
): Promise<ActionResult<Record<string, number>>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.view") && !hasPermission(ctx, "hr.recruitment.manage") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const supabase = await createClient();
    let query = supabase.from("hr_candidates").select("pipeline_stage").is("deleted_at", null);
    if (params?.requisitionId) query = query.eq("requisition_id", params.requisitionId);
    const { data, error } = await query;
    if (error) return { success: false, error: error.message };

    const summary: Record<string, number> = {};
    for (const row of data ?? []) {
      summary[row.pipeline_stage] = (summary[row.pipeline_stage] ?? 0) + 1;
    }
    return { success: true, data: summary };
  } catch (err) {
    console.error("getCandidatePipelineSummary error", err);
    return { success: false, error: "Failed to get pipeline summary" };
  }
}

// ============================================================================
// Candidate Documents
// ============================================================================

export type CandidateDocumentRow = {
  id: number;
  candidate_id: number;
  dms_document_id: number;
  document_purpose: string | null;
  verification_status: string;
  notes: string | null;
  created_at: string;
  deleted_at: string | null;
  dms_document?: { id: number; document_number: string | null; document_title: string | null } | null;
};

export async function listCandidateDocuments(candidateId: number): Promise<ActionResult<CandidateDocumentRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.view") && !hasPermission(ctx, "hr.recruitment.manage") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("hr_candidate_documents")
      .select("*,dms_document:dms_documents(id,document_number,document_title)")
      .eq("candidate_id", candidateId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as unknown as CandidateDocumentRow[] };
  } catch (err) {
    console.error("listCandidateDocuments error", err);
    return { success: false, error: "Failed to list documents" };
  }
}

export async function linkCandidateDmsDocument(
  candidateId: number,
  input: z.infer<typeof candidateDocumentLinkSchema>
): Promise<ActionResult<{ id: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.manage") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const parsed = candidateDocumentLinkSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

    const supabase = await createClient();
    const { data: candidate } = await supabase.from("hr_candidates").select("candidate_code, full_name_en").eq("id", candidateId).is("deleted_at", null).single();
    if (!candidate) return { success: false, error: "Candidate not found" };

    const { data: rec, error } = await supabase
      .from("hr_candidate_documents")
      .insert({ candidate_id: candidateId, ...parsed.data, created_by: ctx.profile?.id ?? null })
      .select("id")
      .single();
    if (error) return { success: false, error: error.message };

    await recruitmentAuditLog({ action: "create", entity_name: "hr_candidate_documents", entity_id: rec!.id, candidate_id: candidateId, candidate_code: candidate.candidate_code ?? undefined, candidate_name: candidate.full_name_en, extra: { action_type: "candidate_document_linked", dms_document_id: parsed.data.dms_document_id } });
    revalidatePath(`/admin/hr/recruitment/candidates/record/${candidateId}`);
    return { success: true, data: { id: rec!.id } };
  } catch (err) {
    console.error("linkCandidateDmsDocument error", err);
    return { success: false, error: "Failed to link document" };
  }
}

export async function verifyCandidateDocument(id: number): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.manage") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const supabase = await createClient();
    const { error } = await supabase.from("hr_candidate_documents").update({ verification_status: "verified" }).eq("id", id).is("deleted_at", null);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    console.error("verifyCandidateDocument error", err);
    return { success: false, error: "Failed to verify document" };
  }
}

export async function archiveCandidateDocument(id: number): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.manage") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const supabase = await createClient();
    const { error } = await supabase.from("hr_candidate_documents").update({ deleted_at: new Date().toISOString(), deleted_by: ctx.profile?.id ?? null }).eq("id", id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    console.error("archiveCandidateDocument error", err);
    return { success: false, error: "Failed to archive document" };
  }
}

// ============================================================================
// Interviews
// ============================================================================

const INT_JOINS = [
  "candidate:hr_candidates(id,candidate_code,full_name_en)",
  "interviewer:user_profiles(id,full_name_en,email)",
  "requisition:hr_job_requisitions(id,requisition_code,requisition_title)",
].join(",");

export async function listCandidateInterviews(candidateId: number): Promise<ActionResult<InterviewRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.view") && !hasPermission(ctx, "hr.recruitment.manage") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("hr_interviews")
      .select(`*,${INT_JOINS}`)
      .eq("candidate_id", candidateId)
      .is("deleted_at", null)
      .order("interview_datetime", { ascending: false });
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as unknown as InterviewRow[] };
  } catch (err) {
    console.error("listCandidateInterviews error", err);
    return { success: false, error: "Failed to list interviews" };
  }
}

export async function listGlobalInterviews(
  params?: Partial<z.infer<typeof recruitmentListParamsSchema>>
): Promise<ActionResult<{ rows: InterviewRow[]; totalCount: number; page: number; pageSize: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.view") && !hasPermission(ctx, "hr.recruitment.manage") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const parsed = recruitmentListParamsSchema.safeParse(params ?? {});
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
    const { status, interviewerId, page, pageSize } = parsed.data;

    const supabase = await createClient();
    let query = supabase.from("hr_interviews").select(`*,${INT_JOINS}`, { count: "exact" }).is("deleted_at", null);
    if (status) query = query.eq("interview_status", status);
    if (interviewerId) query = query.eq("interviewer_id", interviewerId);

    const from = (page - 1) * pageSize;
    const { data, error, count } = await query.order("interview_datetime", { ascending: false }).range(from, from + pageSize - 1);
    if (error) return { success: false, error: error.message };
    return { success: true, data: { rows: (data ?? []) as unknown as InterviewRow[], totalCount: count ?? 0, page, pageSize } };
  } catch (err) {
    console.error("listGlobalInterviews error", err);
    return { success: false, error: "Failed to list interviews" };
  }
}

export async function createInterview(candidateId: number, input: z.infer<typeof interviewCreateSchema>): Promise<ActionResult<{ id: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.manage") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const parsed = interviewCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };

    const supabase = await createClient();
    const { data: candidate } = await supabase.from("hr_candidates").select("candidate_code, full_name_en").eq("id", candidateId).is("deleted_at", null).single();
    if (!candidate) return { success: false, error: "Candidate not found" };

    const { data: rec, error } = await supabase
      .from("hr_interviews")
      .insert({ candidate_id: candidateId, ...parsed.data, created_by: ctx.profile?.id ?? null, updated_by: ctx.profile?.id ?? null })
      .select("id")
      .single();
    if (error || !rec) return { success: false, error: error?.message ?? "Insert failed" };

    await recruitmentAuditLog({ action: "create", entity_name: "hr_interviews", entity_id: rec.id, candidate_id: candidateId, candidate_code: candidate.candidate_code ?? undefined, candidate_name: candidate.full_name_en, extra: { action_type: "interview_scheduled", round: parsed.data.interview_round } });
    revalidatePath(`/admin/hr/recruitment/candidates/record/${candidateId}`);
    revalidatePath("/admin/hr/recruitment/interviews");
    return { success: true, data: { id: rec.id } };
  } catch (err) {
    console.error("createInterview error", err);
    return { success: false, error: "Failed to create interview" };
  }
}

export async function updateInterview(id: number, input: z.infer<typeof interviewUpdateSchema>): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.manage") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const parsed = interviewUpdateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };

    const supabase = await createClient();
    const { data: current } = await supabase.from("hr_interviews").select("id, candidate_id").eq("id", id).is("deleted_at", null).single();
    if (!current) return { success: false, error: "Interview not found" };

    const { error } = await supabase.from("hr_interviews").update({ ...parsed.data, updated_by: ctx.profile?.id ?? null }).eq("id", id);
    if (error) return { success: false, error: error.message };

    revalidatePath(`/admin/hr/recruitment/candidates/record/${current.candidate_id}`);
    revalidatePath("/admin/hr/recruitment/interviews");
    return { success: true };
  } catch (err) {
    console.error("updateInterview error", err);
    return { success: false, error: "Failed to update interview" };
  }
}

export async function archiveInterview(id: number): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.manage") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const supabase = await createClient();
    const { error } = await supabase.from("hr_interviews").update({ deleted_at: new Date().toISOString(), deleted_by: ctx.profile?.id ?? null }).eq("id", id);
    if (error) return { success: false, error: error.message };
    revalidatePath("/admin/hr/recruitment/interviews");
    return { success: true };
  } catch (err) {
    console.error("archiveInterview error", err);
    return { success: false, error: "Failed to archive interview" };
  }
}

export async function completeInterview(id: number, input: z.infer<typeof interviewCompleteSchema>): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.manage") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const parsed = interviewCompleteSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

    const supabase = await createClient();
    const { data: current } = await supabase.from("hr_interviews").select("id, candidate_id").eq("id", id).is("deleted_at", null).single();
    if (!current) return { success: false, error: "Interview not found" };

    const { error } = await supabase.from("hr_interviews").update({ interview_status: "completed", ...parsed.data, updated_by: ctx.profile?.id ?? null }).eq("id", id);
    if (error) return { success: false, error: error.message };

    await recruitmentAuditLog({ action: "update", entity_name: "hr_interviews", entity_id: id, candidate_id: current.candidate_id, extra: { action_type: "interview_completed", result: parsed.data.result } });
    revalidatePath(`/admin/hr/recruitment/candidates/record/${current.candidate_id}`);
    revalidatePath("/admin/hr/recruitment/interviews");
    return { success: true };
  } catch (err) {
    console.error("completeInterview error", err);
    return { success: false, error: "Failed to complete interview" };
  }
}

export async function cancelInterview(id: number, reason: string): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.manage") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const supabase = await createClient();
    const { data: current } = await supabase.from("hr_interviews").select("id, candidate_id").eq("id", id).is("deleted_at", null).single();
    if (!current) return { success: false, error: "Interview not found" };

    const { error } = await supabase.from("hr_interviews").update({ interview_status: "cancelled", next_step: reason, updated_by: ctx.profile?.id ?? null }).eq("id", id);
    if (error) return { success: false, error: error.message };

    revalidatePath(`/admin/hr/recruitment/candidates/record/${current.candidate_id}`);
    revalidatePath("/admin/hr/recruitment/interviews");
    return { success: true };
  } catch (err) {
    console.error("cancelInterview error", err);
    return { success: false, error: "Failed to cancel interview" };
  }
}

// ============================================================================
// Offers
// ============================================================================

const OFFER_JOINS = [
  "candidate:hr_candidates(id,candidate_code,full_name_en)",
  "department:departments(id,department_name_en)",
  "designation:designations(id,designation_name_en)",
  "employment_type:hr_employment_types(id,name_en)",
].join(",");

export async function listCandidateOffers(candidateId: number): Promise<ActionResult<OfferRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.view") && !hasPermission(ctx, "hr.recruitment.manage") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("hr_offers")
      .select(`*,${OFFER_JOINS}`)
      .eq("candidate_id", candidateId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as unknown as OfferRow[] };
  } catch (err) {
    console.error("listCandidateOffers error", err);
    return { success: false, error: "Failed to list offers" };
  }
}

export async function listGlobalOffers(
  params?: Partial<z.infer<typeof recruitmentListParamsSchema>>
): Promise<ActionResult<{ rows: OfferRow[]; totalCount: number; page: number; pageSize: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.view") && !hasPermission(ctx, "hr.recruitment.manage") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const parsed = recruitmentListParamsSchema.safeParse(params ?? {});
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
    const { status, page, pageSize } = parsed.data;

    const supabase = await createClient();
    let query = supabase.from("hr_offers").select(`*,${OFFER_JOINS}`, { count: "exact" }).is("deleted_at", null);
    if (status) query = query.eq("offer_status", status);

    const from = (page - 1) * pageSize;
    const { data, error, count } = await query.order("created_at", { ascending: false }).range(from, from + pageSize - 1);
    if (error) return { success: false, error: error.message };
    return { success: true, data: { rows: (data ?? []) as unknown as OfferRow[], totalCount: count ?? 0, page, pageSize } };
  } catch (err) {
    console.error("listGlobalOffers error", err);
    return { success: false, error: "Failed to list offers" };
  }
}

export async function createOffer(candidateId: number, input: z.infer<typeof offerCreateSchema>): Promise<ActionResult<{ id: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.manage") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const parsed = offerCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };

    const supabase = await createClient();
    const { data: candidate } = await supabase.from("hr_candidates").select("candidate_code, full_name_en").eq("id", candidateId).is("deleted_at", null).single();
    if (!candidate) return { success: false, error: "Candidate not found" };

    const { data: rec, error } = await supabase
      .from("hr_offers")
      .insert({ candidate_id: candidateId, ...parsed.data, created_by: ctx.profile?.id ?? null, updated_by: ctx.profile?.id ?? null })
      .select("id")
      .single();
    if (error || !rec) return { success: false, error: error?.message ?? "Insert failed" };

    await recruitmentAuditLog({ action: "create", entity_name: "hr_offers", entity_id: rec.id, candidate_id: candidateId, candidate_code: candidate.candidate_code ?? undefined, candidate_name: candidate.full_name_en, extra: { action_type: "offer_created" } });
    revalidatePath(`/admin/hr/recruitment/candidates/record/${candidateId}`);
    revalidatePath("/admin/hr/recruitment/offers");
    return { success: true, data: { id: rec.id } };
  } catch (err) {
    console.error("createOffer error", err);
    return { success: false, error: "Failed to create offer" };
  }
}

export async function updateOffer(id: number, input: z.infer<typeof offerUpdateSchema>): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.manage") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const parsed = offerUpdateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };

    const supabase = await createClient();
    const { data: current } = await supabase.from("hr_offers").select("id, candidate_id").eq("id", id).is("deleted_at", null).single();
    if (!current) return { success: false, error: "Offer not found" };

    const { error } = await supabase.from("hr_offers").update({ ...parsed.data, updated_by: ctx.profile?.id ?? null }).eq("id", id);
    if (error) return { success: false, error: error.message };

    revalidatePath(`/admin/hr/recruitment/candidates/record/${current.candidate_id}`);
    revalidatePath("/admin/hr/recruitment/offers");
    return { success: true };
  } catch (err) {
    console.error("updateOffer error", err);
    return { success: false, error: "Failed to update offer" };
  }
}

export async function archiveOffer(id: number): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.manage") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const supabase = await createClient();
    const { error } = await supabase.from("hr_offers").update({ deleted_at: new Date().toISOString(), deleted_by: ctx.profile?.id ?? null }).eq("id", id);
    if (error) return { success: false, error: error.message };
    revalidatePath("/admin/hr/recruitment/offers");
    return { success: true };
  } catch (err) {
    console.error("archiveOffer error", err);
    return { success: false, error: "Failed to archive offer" };
  }
}

export async function changeOfferStatus(id: number, status: string, notes?: string): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.manage") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const validStatuses = ["draft", "pending_approval", "approved", "sent", "accepted", "rejected", "withdrawn", "expired", "cancelled"];
    if (!validStatuses.includes(status)) return { success: false, error: "Invalid status" };

    const supabase = await createClient();
    const { data: current } = await supabase.from("hr_offers").select("id, candidate_id, offer_status").eq("id", id).is("deleted_at", null).single();
    if (!current) return { success: false, error: "Offer not found" };

    const updatePayload: Record<string, unknown> = { offer_status: status, updated_by: ctx.profile?.id ?? null };
    if (notes) updatePayload.notes = notes;
    const { error } = await supabase.from("hr_offers").update(updatePayload).eq("id", id);
    if (error) return { success: false, error: error.message };

    await recruitmentAuditLog({ action: "update", entity_name: "hr_offers", entity_id: id, candidate_id: current.candidate_id, extra: { action_type: `offer_${status}`, old_status: current.offer_status, new_status: status } });
    revalidatePath(`/admin/hr/recruitment/candidates/record/${current.candidate_id}`);
    revalidatePath("/admin/hr/recruitment/offers");
    return { success: true };
  } catch (err) {
    console.error("changeOfferStatus error", err);
    return { success: false, error: "Failed to change offer status" };
  }
}

export async function acceptOffer(id: number) { return changeOfferStatus(id, "accepted"); }
export async function rejectOffer(id: number, reason: string) { return changeOfferStatus(id, "rejected", reason); }
export async function withdrawOffer(id: number, reason: string) { return changeOfferStatus(id, "withdrawn", reason); }

// ============================================================================
// Onboarding Tasks
// ============================================================================

const TASK_JOINS = [
  "candidate:hr_candidates(id,candidate_code,full_name_en)",
  "assigned_user:user_profiles!hr_onboarding_tasks_assigned_to_fkey(id,full_name_en,email)",
].join(",");

export async function listCandidateOnboardingTasks(candidateId: number): Promise<ActionResult<OnboardingTaskRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.view") && !hasPermission(ctx, "hr.recruitment.manage") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("hr_onboarding_tasks")
      .select(`*,${TASK_JOINS}`)
      .eq("candidate_id", candidateId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as unknown as OnboardingTaskRow[] };
  } catch (err) {
    console.error("listCandidateOnboardingTasks error", err);
    return { success: false, error: "Failed to list tasks" };
  }
}

export async function listEmployeeOnboardingTasks(employeeId: number): Promise<ActionResult<OnboardingTaskRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.view") && !hasPermission(ctx, "hr.recruitment.manage") && !hasPermission(ctx, "hr.employees.view") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("hr_onboarding_tasks")
      .select(`*,${TASK_JOINS}`)
      .eq("employee_id", employeeId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as unknown as OnboardingTaskRow[] };
  } catch (err) {
    console.error("listEmployeeOnboardingTasks error", err);
    return { success: false, error: "Failed to list tasks" };
  }
}

export async function listGlobalOnboardingTasks(
  params?: Partial<z.infer<typeof recruitmentListParamsSchema>>
): Promise<ActionResult<{ rows: OnboardingTaskRow[]; totalCount: number; page: number; pageSize: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.view") && !hasPermission(ctx, "hr.recruitment.manage") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const parsed = recruitmentListParamsSchema.safeParse(params ?? {});
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
    const { status, assignedTo, page, pageSize } = parsed.data;

    const supabase = await createClient();
    let query = supabase.from("hr_onboarding_tasks").select(`*,${TASK_JOINS}`, { count: "exact" }).is("deleted_at", null);
    if (status) query = query.eq("task_status", status);
    if (assignedTo) query = query.eq("assigned_to", assignedTo);

    const from = (page - 1) * pageSize;
    const { data, error, count } = await query.order("due_date", { ascending: true, nullsFirst: false }).range(from, from + pageSize - 1);
    if (error) return { success: false, error: error.message };
    return { success: true, data: { rows: (data ?? []) as unknown as OnboardingTaskRow[], totalCount: count ?? 0, page, pageSize } };
  } catch (err) {
    console.error("listGlobalOnboardingTasks error", err);
    return { success: false, error: "Failed to list tasks" };
  }
}

export async function createOnboardingTask(input: z.infer<typeof onboardingTaskCreateSchema>): Promise<ActionResult<{ id: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.manage") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const parsed = onboardingTaskCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };

    const supabase = await createClient();
    const { data: rec, error } = await supabase
      .from("hr_onboarding_tasks")
      .insert({ ...parsed.data, created_by: ctx.profile?.id ?? null, updated_by: ctx.profile?.id ?? null })
      .select("id")
      .single();
    if (error || !rec) return { success: false, error: error?.message ?? "Insert failed" };

    await recruitmentAuditLog({ action: "create", entity_name: "hr_onboarding_tasks", entity_id: rec.id, candidate_id: parsed.data.candidate_id ?? undefined, employee_id: parsed.data.employee_id ?? undefined, extra: { action_type: "onboarding_task_created", task_title: parsed.data.task_title } });
    revalidatePath("/admin/hr/recruitment/onboarding");
    return { success: true, data: { id: rec.id } };
  } catch (err) {
    console.error("createOnboardingTask error", err);
    return { success: false, error: "Failed to create task" };
  }
}

export async function updateOnboardingTask(id: number, input: z.infer<typeof onboardingTaskUpdateSchema>): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.manage") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const parsed = onboardingTaskUpdateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };

    const supabase = await createClient();
    const { data: current } = await supabase.from("hr_onboarding_tasks").select("id, candidate_id, employee_id").eq("id", id).is("deleted_at", null).single();
    if (!current) return { success: false, error: "Task not found" };

    const { error } = await supabase.from("hr_onboarding_tasks").update({ ...parsed.data, updated_by: ctx.profile?.id ?? null }).eq("id", id);
    if (error) return { success: false, error: error.message };

    revalidatePath("/admin/hr/recruitment/onboarding");
    return { success: true };
  } catch (err) {
    console.error("updateOnboardingTask error", err);
    return { success: false, error: "Failed to update task" };
  }
}

export async function completeOnboardingTask(id: number, notes?: string): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.manage") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const supabase = await createClient();
    const { data: current } = await supabase.from("hr_onboarding_tasks").select("id, candidate_id, employee_id, task_title").eq("id", id).is("deleted_at", null).single();
    if (!current) return { success: false, error: "Task not found" };

    const updatePayload: Record<string, unknown> = { task_status: "completed", completed_by: ctx.profile?.id ?? null, completed_at: new Date().toISOString(), updated_by: ctx.profile?.id ?? null };
    if (notes) updatePayload.notes = notes;
    const { error } = await supabase.from("hr_onboarding_tasks").update(updatePayload).eq("id", id);
    if (error) return { success: false, error: error.message };

    await recruitmentAuditLog({ action: "update", entity_name: "hr_onboarding_tasks", entity_id: id, candidate_id: current.candidate_id ?? undefined, employee_id: current.employee_id ?? undefined, extra: { action_type: "onboarding_task_completed", task_title: current.task_title } });
    revalidatePath("/admin/hr/recruitment/onboarding");
    return { success: true };
  } catch (err) {
    console.error("completeOnboardingTask error", err);
    return { success: false, error: "Failed to complete task" };
  }
}

export async function blockOnboardingTask(id: number, reason: string): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.manage") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const supabase = await createClient();
    const { error } = await supabase.from("hr_onboarding_tasks").update({ task_status: "blocked", notes: reason, updated_by: ctx.profile?.id ?? null }).eq("id", id).is("deleted_at", null);
    if (error) return { success: false, error: error.message };
    revalidatePath("/admin/hr/recruitment/onboarding");
    return { success: true };
  } catch (err) {
    console.error("blockOnboardingTask error", err);
    return { success: false, error: "Failed to block task" };
  }
}

export async function markOnboardingTaskNotApplicable(id: number, reason: string): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.manage") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const supabase = await createClient();
    const { error } = await supabase.from("hr_onboarding_tasks").update({ task_status: "not_applicable", notes: reason, updated_by: ctx.profile?.id ?? null }).eq("id", id).is("deleted_at", null);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    console.error("markOnboardingTaskNotApplicable error", err);
    return { success: false, error: "Failed to mark task not applicable" };
  }
}

export async function archiveOnboardingTask(id: number): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.manage") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const supabase = await createClient();
    const { error } = await supabase.from("hr_onboarding_tasks").update({ deleted_at: new Date().toISOString(), deleted_by: ctx.profile?.id ?? null }).eq("id", id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    console.error("archiveOnboardingTask error", err);
    return { success: false, error: "Failed to archive task" };
  }
}

// ============================================================================
// Candidate Conversion
// ============================================================================

export async function prepareCandidateEmployeeConversion(candidateId: number): Promise<ActionResult<{
  candidate: CandidateRow;
  latest_offer: OfferRow | null;
  already_converted: boolean;
}>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.manage") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const supabase = await createClient();
    const { data: candidate, error: candError } = await supabase
      .from("hr_candidates")
      .select(`*,${CAND_JOINS}`)
      .eq("id", candidateId)
      .is("deleted_at", null)
      .single();
    if (candError || !candidate) return { success: false, error: "Candidate not found" };

    const { data: existingLink } = await supabase.from("employee_recruitment_links").select("id").eq("candidate_id", candidateId).single();
    if (existingLink) {
      return { success: true, data: { candidate: candidate as unknown as CandidateRow, latest_offer: null, already_converted: true } };
    }

    const { data: latestOffer } = await supabase
      .from("hr_offers")
      .select(`*,${OFFER_JOINS}`)
      .eq("candidate_id", candidateId)
      .in("offer_status", ["accepted", "approved"])
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    return { success: true, data: { candidate: candidate as unknown as CandidateRow, latest_offer: latestOffer as unknown as OfferRow | null, already_converted: false } };
  } catch (err) {
    console.error("prepareCandidateEmployeeConversion error", err);
    return { success: false, error: "Failed to prepare conversion" };
  }
}

export async function convertCandidateToEmployee(
  candidateId: number,
  input: Omit<z.infer<typeof candidateConversionSchema>, "candidate_id">
): Promise<ActionResult<{ employee_id: number; employee_code: string }>> {
  try {
    const ctx = await getAuthContext();
    if ((!hasPermission(ctx, "hr.recruitment.manage") || !hasPermission(ctx, "hr.employees.create")) && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Requires both hr.recruitment.manage and hr.employees.create permissions" };
    }

    const fullInput = { ...input, candidate_id: candidateId };
    const parsed = candidateConversionSchema.safeParse(fullInput);
    if (!parsed.success) return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };

    const supabase = await createClient();

    const { data: existingLink } = await supabase.from("employee_recruitment_links").select("id").eq("candidate_id", candidateId).single();
    if (existingLink) return { success: false, error: "Candidate has already been converted to an employee" };

    const { data: candidate, error: candError } = await supabase
      .from("hr_candidates")
      .select("id, candidate_code, full_name_en, full_name_ar, gender, nationality_id, date_of_birth, mobile_number, email")
      .eq("id", candidateId)
      .is("deleted_at", null)
      .single();
    if (candError || !candidate) return { success: false, error: "Candidate not found" };

    const adminClient = createAdminClient();
    const { data: numData, error: numError } = await adminClient.rpc("generate_next_reference_number", {
      p_rule_code: "HR_EMPLOYEE",
      p_document_type_code: null,
      p_target_table_name: "employees",
      p_target_record_id: null,
      p_generation_reason: "Employee created from candidate conversion",
      p_generated_by: ctx.profile?.id ?? null,
    });
    if (numError || !numData || numData.length === 0) return { success: false, error: "Failed to generate employee code" };
    const employeeCode: string = numData[0].generated_reference_number;

    const { data: employee, error: insertError } = await supabase
      .from("employees")
      .insert({
        employee_code: employeeCode,
        full_name_en: candidate.full_name_en,
        full_name_ar: candidate.full_name_ar ?? null,
        gender: candidate.gender ?? "male",
        nationality_id: candidate.nationality_id ?? null,
        date_of_birth: candidate.date_of_birth ?? parsed.data.joining_date,
        mobile_number: candidate.mobile_number ?? "",
        personal_email: candidate.email ?? null,
        owner_company_id: parsed.data.owner_company_id,
        branch_id: parsed.data.branch_id ?? null,
        department_id: parsed.data.department_id ?? null,
        designation_id: parsed.data.designation_id ?? null,
        employment_type_id: parsed.data.employment_type_id ?? null,
        employee_category_id: parsed.data.employee_category_id ?? null,
        joining_date: parsed.data.joining_date,
        employee_status: parsed.data.employee_status,
        reporting_manager_id: parsed.data.reporting_manager_id ?? null,
        primary_work_site_id: parsed.data.primary_work_site_id ?? null,
        created_by: ctx.profile?.id ?? null,
        updated_by: ctx.profile?.id ?? null,
      })
      .select("id, employee_code")
      .single();
    if (insertError || !employee) return { success: false, error: insertError?.message ?? "Employee insert failed" };

    await supabase.from("employee_status_events").insert({
      employee_id: employee.id,
      old_status: null,
      new_status: parsed.data.employee_status,
      reason: `Converted from candidate ${candidate.candidate_code}`,
      effective_date: parsed.data.joining_date,
      created_by: ctx.profile?.id ?? null,
    });

    await adminClient.from("employee_recruitment_links").insert({
      employee_id: employee.id,
      candidate_id: candidateId,
      requisition_id: parsed.data.requisition_id ?? null,
      offer_id: parsed.data.offer_id ?? null,
      converted_at: new Date().toISOString(),
      converted_by: ctx.profile?.id ?? null,
      conversion_notes: parsed.data.conversion_notes ?? null,
      created_by: ctx.profile?.id ?? null,
    });

    await supabase.from("hr_candidates").update({ candidate_status: "hired", pipeline_stage: "hired", updated_by: ctx.profile?.id ?? null }).eq("id", candidateId);

    await supabase.from("hr_onboarding_tasks").update({ employee_id: employee.id, updated_by: ctx.profile?.id ?? null }).eq("candidate_id", candidateId).is("deleted_at", null);

    await recruitmentAuditLog({ action: "create", entity_name: "employee_recruitment_links", entity_id: employee.id, entity_reference: employeeCode, candidate_id: candidateId, candidate_code: candidate.candidate_code ?? undefined, candidate_name: candidate.full_name_en, employee_id: employee.id, employee_code: employeeCode, extra: { action_type: "candidate_converted_to_employee" } });
    await logAudit({ module_code: "HR", entity_name: "employees", entity_id: employee.id, entity_reference: employeeCode, action: "create", new_values: { employee_code: employeeCode, source: "candidate_conversion", candidate_id: candidateId } });

    revalidatePath("/admin/hr/employees");
    revalidatePath("/admin/hr/recruitment/candidates");
    revalidatePath(`/admin/hr/recruitment/candidates/record/${candidateId}`);
    return { success: true, data: { employee_id: employee.id, employee_code: employeeCode } };
  } catch (err) {
    console.error("convertCandidateToEmployee error", err);
    return { success: false, error: "Failed to convert candidate to employee" };
  }
}

export async function getEmployeeRecruitmentLink(employeeId: number): Promise<ActionResult<RecruitmentLinkRow | null>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.view") && !hasPermission(ctx, "hr.recruitment.manage") && !hasPermission(ctx, "hr.employees.view") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("employee_recruitment_links")
      .select("*,candidate:hr_candidates(id,candidate_code,full_name_en),requisition:hr_job_requisitions(id,requisition_code,requisition_title)")
      .eq("employee_id", employeeId)
      .single();
    if (error) return { success: true, data: null };
    return { success: true, data: data as unknown as RecruitmentLinkRow };
  } catch (err) {
    console.error("getEmployeeRecruitmentLink error", err);
    return { success: false, error: "Failed to get recruitment link" };
  }
}

// ============================================================================
// Summary
// ============================================================================

export async function getRecruitmentSummary(): Promise<ActionResult<{
  total_requisitions: number;
  open_requisitions: number;
  total_candidates: number;
  active_candidates: number;
  interviews_this_week: number;
  pending_offers: number;
  pending_onboarding_tasks: number;
  conversions_this_month: number;
}>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.view") && !hasPermission(ctx, "hr.recruitment.manage") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const supabase = await createClient();

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const monthStart = new Date();
    monthStart.setDate(1);

    const [reqRes, candRes, intRes, offerRes, taskRes, convRes] = await Promise.all([
      supabase.from("hr_job_requisitions").select("requisition_status").is("deleted_at", null),
      supabase.from("hr_candidates").select("candidate_status").is("deleted_at", null),
      supabase.from("hr_interviews").select("id", { count: "exact" }).is("deleted_at", null).eq("interview_status", "scheduled").gte("interview_datetime", weekStart.toISOString()),
      supabase.from("hr_offers").select("id", { count: "exact" }).is("deleted_at", null).in("offer_status", ["draft", "pending_approval", "sent"]),
      supabase.from("hr_onboarding_tasks").select("id", { count: "exact" }).is("deleted_at", null).in("task_status", ["pending", "in_progress"]),
      supabase.from("employee_recruitment_links").select("id", { count: "exact" }).gte("converted_at", monthStart.toISOString()),
    ]);

    const reqs = Array.isArray(reqRes.data) ? reqRes.data : [];
    const cands = Array.isArray(candRes.data) ? candRes.data : [];
    const activeStatuses = ["new", "screening", "shortlisted", "interview", "selected", "offered", "accepted"];

    return {
      success: true,
      data: {
        total_requisitions: reqs.length,
        open_requisitions: reqs.filter((r) => r.requisition_status === "open").length,
        total_candidates: cands.length,
        active_candidates: cands.filter((c) => activeStatuses.includes(c.candidate_status)).length,
        interviews_this_week: intRes.count ?? 0,
        pending_offers: offerRes.count ?? 0,
        pending_onboarding_tasks: taskRes.count ?? 0,
        conversions_this_month: convRes.count ?? 0,
      },
    };
  } catch (err) {
    console.error("getRecruitmentSummary error", err);
    return { success: false, error: "Failed to get recruitment summary" };
  }
}

export async function getCandidateSummary(candidateId: number): Promise<ActionResult<{
  candidate: CandidateRow | null;
  interview_count: number;
  offer_count: number;
  document_count: number;
  onboarding_task_count: number;
  pending_task_count: number;
}>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.recruitment.view") && !hasPermission(ctx, "hr.recruitment.manage") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }
    const supabase = await createClient();
    const [candRes, intRes, offerRes, docRes, taskRes] = await Promise.all([
      supabase.from("hr_candidates").select(`*,${CAND_JOINS}`).eq("id", candidateId).is("deleted_at", null).single(),
      supabase.from("hr_interviews").select("id", { count: "exact" }).eq("candidate_id", candidateId).is("deleted_at", null),
      supabase.from("hr_offers").select("id", { count: "exact" }).eq("candidate_id", candidateId).is("deleted_at", null),
      supabase.from("hr_candidate_documents").select("id", { count: "exact" }).eq("candidate_id", candidateId).is("deleted_at", null),
      supabase.from("hr_onboarding_tasks").select("task_status").eq("candidate_id", candidateId).is("deleted_at", null),
    ]);

    const tasks = Array.isArray(taskRes.data) ? taskRes.data : [];
    return {
      success: true,
      data: {
        candidate: candRes.data as unknown as CandidateRow | null,
        interview_count: intRes.count ?? 0,
        offer_count: offerRes.count ?? 0,
        document_count: docRes.count ?? 0,
        onboarding_task_count: tasks.length,
        pending_task_count: tasks.filter((t) => t.task_status === "pending" || t.task_status === "in_progress").length,
      },
    };
  } catch (err) {
    console.error("getCandidateSummary error", err);
    return { success: false, error: "Failed to get candidate summary" };
  }
}
