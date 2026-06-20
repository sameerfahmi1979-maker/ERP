"use server";

/**
 * ERP HR.7 — HR Actions Server Actions
 *
 * Action groups:
 *   PRO Processes, HR Actions, Performance, Disciplinary,
 *   HR Notes, Approval Requests, EOS Cases, Clearance Items, Summary
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { z } from "zod";

// ── Types ──────────────────────────────────────────────────────────────────

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

// ── Local audit helper ─────────────────────────────────────────────────────

type HrAuditParams = {
  action: string;
  entity_type: string;
  entity_id: number;
  parent_entity_type?: string;
  parent_entity_id?: number;
  description: string;
  metadata?: Record<string, unknown>;
};

async function hrAuditLog(params: HrAuditParams): Promise<void> {
  try {
    await logAudit({
      module_code: "HR",
      entity_name: params.entity_type,
      entity_id: params.entity_id,
      entity_reference: `${params.entity_type}-${params.entity_id}`,
      action: params.action.toLowerCase(),
      new_values: {
        description: params.description,
        parent_entity_type: params.parent_entity_type,
        parent_entity_id: params.parent_entity_id,
        ...params.metadata,
      },
    });
  } catch {
    // Non-critical: log audit failure should not break the mutation
  }
}

// ── Employee context helper ────────────────────────────────────────────────

async function getEmployeeContext(employeeId: number) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("employees")
    .select("id, employee_code, full_name_en")
    .eq("id", employeeId)
    .single();
  return data;
}

// ── Row types ──────────────────────────────────────────────────────────────

export type ProProcessRow = {
  id: number;
  employee_id: number;
  process_type_id: number | null;
  process_title: string;
  process_status: string;
  priority: string;
  request_date: string;
  target_date: string | null;
  submitted_date: string | null;
  completed_date: string | null;
  assigned_to: number | null;
  related_document_id: number | null;
  related_record_type: string | null;
  related_record_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
  deleted_at: string | null;
  // joined
  process_type?: { name_en: string } | null;
  assigned_to_profile?: { display_name: string } | null;
};

export type HrActionRow = {
  id: number;
  employee_id: number;
  action_type: string;
  action_title: string;
  action_status: string;
  action_date: string;
  due_date: string | null;
  assigned_to: number | null;
  related_record_type: string | null;
  related_record_id: number | null;
  dms_document_id: number | null;
  requires_approval: boolean;
  approval_request_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
  deleted_at: string | null;
};

export type PerformanceRow = {
  id: number;
  employee_id: number;
  review_type: string;
  review_period_start: string | null;
  review_period_end: string | null;
  review_date: string;
  reviewer_id: number | null;
  rating: string | null;
  summary: string | null;
  strengths: string | null;
  improvement_areas: string | null;
  next_review_date: string | null;
  status: string;
  dms_document_id: number | null;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
  deleted_at: string | null;
  // joined
  reviewer?: { display_name: string } | null;
};

export type DisciplinaryRow = {
  id: number;
  employee_id: number;
  disciplinary_type: string;
  incident_date: string | null;
  record_date: string;
  severity: string;
  subject: string;
  description: string | null;
  action_taken: string | null;
  status: string;
  issued_by: number | null;
  acknowledged_by_employee: boolean;
  acknowledged_at: string | null;
  dms_document_id: number | null;
  creates_operational_block: boolean;
  operational_block_id: number | null;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
  deleted_at: string | null;
  // joined
  issued_by_profile?: { display_name: string } | null;
};

export type HrNoteRow = {
  id: number;
  employee_id: number;
  note_type: string;
  note_text: string;
  visibility: string;
  related_record_type: string | null;
  related_record_id: number | null;
  created_at: string;
  created_by: number | null;
  deleted_at: string | null;
};

export type ApprovalRequestRow = {
  id: number;
  employee_id: number;
  approval_type: string;
  request_title: string;
  request_status: string;
  approval_role_id: number | null;
  requested_by: number | null;
  requested_at: string;
  approved_by: number | null;
  approved_at: string | null;
  rejected_by: number | null;
  rejected_at: string | null;
  cancelled_by: number | null;
  cancelled_at: string | null;
  decision_reason: string | null;
  related_record_type: string | null;
  related_record_id: number | null;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
  deleted_at: string | null;
  // joined
  approval_role?: { name: string } | null;
  requested_by_profile?: { display_name: string } | null;
};

export type EosCaseRow = {
  id: number;
  employee_id: number;
  eos_type: string;
  case_status: string;
  notice_date: string | null;
  last_working_date: string | null;
  reason: string | null;
  final_settlement_status: string;
  clearance_completed: boolean;
  dms_document_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
  deleted_at: string | null;
};

export type ClearanceItemRow = {
  id: number;
  eos_case_id: number;
  employee_id: number;
  clearance_area: string;
  item_title: string;
  item_status: string;
  responsible_user_id: number | null;
  cleared_by: number | null;
  cleared_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
  deleted_at: string | null;
};

export type HrActionsSummary = {
  open_pro_processes: number;
  open_hr_actions: number;
  performance_reviews: number;
  open_disciplinary: number;
  pending_approvals: number;
  open_eos_case: boolean;
};

// ── Zod Schemas ────────────────────────────────────────────────────────────

const proProcessSchema = z.object({
  process_type_id: z.number().int().positive().nullable().optional(),
  process_title: z.string().min(1).max(500),
  process_status: z.enum(["draft","requested","in_progress","waiting_for_document","submitted","approved","rejected","cancelled","completed"]).default("draft"),
  priority: z.enum(["low","normal","high","urgent"]).default("normal"),
  request_date: z.string().min(1),
  target_date: z.string().nullable().optional(),
  submitted_date: z.string().nullable().optional(),
  completed_date: z.string().nullable().optional(),
  assigned_to: z.number().int().positive().nullable().optional(),
  related_document_id: z.number().int().positive().nullable().optional(),
  related_record_type: z.string().max(100).nullable().optional(),
  related_record_id: z.number().int().positive().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

const hrActionSchema = z.object({
  action_type: z.enum(["general","probation_review","transfer","promotion","increment_recommendation","status_change","warning","memo","other"]),
  action_title: z.string().min(1).max(500),
  action_status: z.enum(["open","in_progress","closed","cancelled"]).default("open"),
  action_date: z.string().min(1),
  due_date: z.string().nullable().optional(),
  assigned_to: z.number().int().positive().nullable().optional(),
  related_record_type: z.string().max(100).nullable().optional(),
  related_record_id: z.number().int().positive().nullable().optional(),
  dms_document_id: z.number().int().positive().nullable().optional(),
  requires_approval: z.boolean().default(false),
  approval_request_id: z.number().int().positive().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

const performanceSchema = z.object({
  review_type: z.enum(["probation","annual","project","incident_followup","other"]),
  review_period_start: z.string().nullable().optional(),
  review_period_end: z.string().nullable().optional(),
  review_date: z.string().min(1),
  reviewer_id: z.number().int().positive().nullable().optional(),
  rating: z.enum(["excellent","good","satisfactory","needs_improvement","unsatisfactory"]).nullable().optional(),
  summary: z.string().max(5000).nullable().optional(),
  strengths: z.string().max(5000).nullable().optional(),
  improvement_areas: z.string().max(5000).nullable().optional(),
  next_review_date: z.string().nullable().optional(),
  status: z.enum(["draft","submitted","approved","closed","cancelled"]).default("draft"),
  dms_document_id: z.number().int().positive().nullable().optional(),
});

const disciplinarySchema = z.object({
  disciplinary_type: z.enum(["verbal_warning","written_warning","final_warning","suspension_notice","incident","other"]),
  incident_date: z.string().nullable().optional(),
  record_date: z.string().min(1),
  severity: z.enum(["low","medium","high","critical"]).default("medium"),
  subject: z.string().min(1).max(500),
  description: z.string().max(5000).nullable().optional(),
  action_taken: z.string().max(5000).nullable().optional(),
  status: z.enum(["open","under_review","closed","cancelled"]).default("open"),
  issued_by: z.number().int().positive().nullable().optional(),
  acknowledged_by_employee: z.boolean().default(false),
  acknowledged_at: z.string().nullable().optional(),
  dms_document_id: z.number().int().positive().nullable().optional(),
  creates_operational_block: z.boolean().default(false),
  operational_block_id: z.number().int().positive().nullable().optional(),
});

const hrNoteSchema = z.object({
  note_type: z.enum(["general","confidential","management","legal","other"]).default("general"),
  note_text: z.string().min(1).max(10000),
  visibility: z.enum(["hr_only","management","restricted"]).default("hr_only"),
  related_record_type: z.string().max(100).nullable().optional(),
  related_record_id: z.number().int().positive().nullable().optional(),
});

const approvalRequestSchema = z.object({
  approval_type: z.enum(["hr_action","pro_process","performance","disciplinary","eos","clearance","other"]),
  request_title: z.string().min(1).max(500),
  approval_role_id: z.number().int().positive().nullable().optional(),
  related_record_type: z.string().max(100).nullable().optional(),
  related_record_id: z.number().int().positive().nullable().optional(),
});

const eosSchema = z.object({
  eos_type: z.enum(["resignation","termination","contract_end","absconding","death","other"]),
  case_status: z.enum(["draft","notice_served","clearance_in_progress","pending_final_settlement","closed","cancelled"]).default("draft"),
  notice_date: z.string().nullable().optional(),
  last_working_date: z.string().nullable().optional(),
  reason: z.string().max(5000).nullable().optional(),
  final_settlement_status: z.enum(["not_started","pending_finance","completed"]).default("not_started"),
  clearance_completed: z.boolean().default(false),
  dms_document_id: z.number().int().positive().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

const clearanceItemSchema = z.object({
  clearance_area: z.enum(["hr","operations","it","finance","camp","workshop","store","hse","other"]),
  item_title: z.string().min(1).max(500),
  item_status: z.enum(["pending","cleared","not_applicable","blocked"]).default("pending"),
  responsible_user_id: z.number().int().positive().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

// =============================================================================
// PRO PROCESSES
// =============================================================================

export async function listEmployeeProProcesses(
  employeeId: number,
  params?: Record<string, unknown>
): Promise<ProProcessRow[]> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.view")) throw new Error("No permission");
  const supabase = await createClient();
  let query = supabase
    .from("employee_pro_processes")
    .select("*, process_type:hr_pro_process_types(name_en), assigned_to_profile:user_profiles!assigned_to(display_name)")
    .eq("employee_id", employeeId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (params?.status) query = query.eq("process_status", params.status as string);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ProProcessRow[];
}

export async function listGlobalProProcesses(
  params?: Record<string, unknown>
): Promise<ProProcessRow[]> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.view")) throw new Error("No permission");
  const supabase = await createClient();
  let query = supabase
    .from("employee_pro_processes")
    .select("*, process_type:hr_pro_process_types(name_en), assigned_to_profile:user_profiles!assigned_to(display_name)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (params?.status) query = query.eq("process_status", params.status as string);
  if (params?.priority) query = query.eq("priority", params.priority as string);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ProProcessRow[];
}

export async function createEmployeeProProcess(
  employeeId: number,
  input: unknown
): Promise<ActionResult<ProProcessRow>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.manage")) return { success: false, error: "No permission" };
  const parsed = proProcessSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.message };
  const empCtx = await getEmployeeContext(employeeId);
  if (!empCtx) return { success: false, error: "Employee not found" };
  const adminClient = await createAdminClient();
  const { data, error } = await adminClient
    .from("employee_pro_processes")
    .insert({ ...parsed.data, employee_id: employeeId, created_by: ctx.profile?.id, updated_by: ctx.profile?.id })
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  await hrAuditLog({
    action: "CREATE", entity_type: "employee_pro_processes", entity_id: data.id,
    parent_entity_type: "employees", parent_entity_id: employeeId,
    description: `Created PRO process: ${parsed.data.process_title}`,
    metadata: { employee_code: empCtx.employee_code, employee_name: empCtx.full_name_en },
  });
  revalidatePath(`/admin/hr/employees`);
  return { success: true, data: data as ProProcessRow };
}

export async function updateEmployeeProProcess(
  id: number,
  input: unknown
): Promise<ActionResult<ProProcessRow>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.manage")) return { success: false, error: "No permission" };
  const parsed = proProcessSchema.partial().safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.message };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("employee_pro_processes").select("employee_id").eq("id", id).is("deleted_at", null).single();
  if (!existing) return { success: false, error: "PRO process not found" };
  const empCtx = await getEmployeeContext(existing.employee_id);
  const adminClient = await createAdminClient();
  const { data, error } = await adminClient
    .from("employee_pro_processes")
    .update({ ...parsed.data, updated_by: ctx.profile?.id })
    .eq("id", id)
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  await hrAuditLog({
    action: "UPDATE", entity_type: "employee_pro_processes", entity_id: id,
    parent_entity_type: "employees", parent_entity_id: existing.employee_id,
    description: `Updated PRO process`,
    metadata: { employee_code: empCtx?.employee_code, employee_name: empCtx?.full_name_en },
  });
  revalidatePath(`/admin/hr/employees`);
  return { success: true, data: data as ProProcessRow };
}

export async function archiveEmployeeProProcess(id: number): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.manage")) return { success: false, error: "No permission" };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("employee_pro_processes").select("employee_id, process_title").eq("id", id).is("deleted_at", null).single();
  if (!existing) return { success: false, error: "PRO process not found" };
  const adminClient = await createAdminClient();
  const { error } = await adminClient.from("employee_pro_processes").update({ deleted_at: new Date().toISOString(), deleted_by: ctx.profile?.id }).eq("id", id);
  if (error) return { success: false, error: error.message };
  await hrAuditLog({
    action: "ARCHIVE", entity_type: "employee_pro_processes", entity_id: id,
    parent_entity_type: "employees", parent_entity_id: existing.employee_id,
    description: `Archived PRO process: ${existing.process_title}`,
  });
  revalidatePath(`/admin/hr/employees`);
  return { success: true, data: undefined };
}

export async function changeEmployeeProProcessStatus(
  id: number,
  status: string,
  notes?: string
): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.manage")) return { success: false, error: "No permission" };
  const validStatuses = ["draft","requested","in_progress","waiting_for_document","submitted","approved","rejected","cancelled","completed"];
  if (!validStatuses.includes(status)) return { success: false, error: "Invalid status" };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("employee_pro_processes").select("employee_id, process_title").eq("id", id).is("deleted_at", null).single();
  if (!existing) return { success: false, error: "PRO process not found" };
  const updates: Record<string, unknown> = { process_status: status, updated_by: ctx.profile?.id };
  if (status === "submitted") updates.submitted_date = new Date().toISOString().split("T")[0];
  if (status === "completed") updates.completed_date = new Date().toISOString().split("T")[0];
  if (notes) updates.notes = notes;
  const adminClient = await createAdminClient();
  const { error } = await adminClient.from("employee_pro_processes").update(updates).eq("id", id);
  if (error) return { success: false, error: error.message };
  await hrAuditLog({
    action: "STATUS_CHANGE", entity_type: "employee_pro_processes", entity_id: id,
    parent_entity_type: "employees", parent_entity_id: existing.employee_id,
    description: `PRO process status changed to ${status}`,
  });
  revalidatePath(`/admin/hr/employees`);
  return { success: true, data: undefined };
}

// =============================================================================
// HR ACTIONS
// =============================================================================

export async function listEmployeeHrActions(
  employeeId: number,
  params?: Record<string, unknown>
): Promise<HrActionRow[]> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.view")) throw new Error("No permission");
  const supabase = await createClient();
  let query = supabase
    .from("employee_hr_actions")
    .select("*")
    .eq("employee_id", employeeId)
    .is("deleted_at", null)
    .order("action_date", { ascending: false });
  if (params?.status) query = query.eq("action_status", params.status as string);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as HrActionRow[];
}

export async function listGlobalHrActions(params?: Record<string, unknown>): Promise<HrActionRow[]> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.view")) throw new Error("No permission");
  const supabase = await createClient();
  let query = supabase
    .from("employee_hr_actions")
    .select("*")
    .is("deleted_at", null)
    .order("action_date", { ascending: false });
  if (params?.status) query = query.eq("action_status", params.status as string);
  if (params?.type) query = query.eq("action_type", params.type as string);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as HrActionRow[];
}

export async function createEmployeeHrAction(
  employeeId: number,
  input: unknown
): Promise<ActionResult<HrActionRow>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.manage")) return { success: false, error: "No permission" };
  const parsed = hrActionSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.message };
  const empCtx = await getEmployeeContext(employeeId);
  if (!empCtx) return { success: false, error: "Employee not found" };
  const adminClient = await createAdminClient();
  const { data, error } = await adminClient
    .from("employee_hr_actions")
    .insert({ ...parsed.data, employee_id: employeeId, created_by: ctx.profile?.id, updated_by: ctx.profile?.id })
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  await hrAuditLog({
    action: "CREATE", entity_type: "employee_hr_actions", entity_id: data.id,
    parent_entity_type: "employees", parent_entity_id: employeeId,
    description: `Created HR action: ${parsed.data.action_title}`,
    metadata: { employee_code: empCtx.employee_code, employee_name: empCtx.full_name_en },
  });
  revalidatePath(`/admin/hr/employees`);
  return { success: true, data: data as HrActionRow };
}

export async function updateEmployeeHrAction(
  id: number,
  input: unknown
): Promise<ActionResult<HrActionRow>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.manage")) return { success: false, error: "No permission" };
  const parsed = hrActionSchema.partial().safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.message };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("employee_hr_actions").select("employee_id").eq("id", id).is("deleted_at", null).single();
  if (!existing) return { success: false, error: "HR action not found" };
  const adminClient = await createAdminClient();
  const { data, error } = await adminClient
    .from("employee_hr_actions")
    .update({ ...parsed.data, updated_by: ctx.profile?.id })
    .eq("id", id)
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  await hrAuditLog({
    action: "UPDATE", entity_type: "employee_hr_actions", entity_id: id,
    parent_entity_type: "employees", parent_entity_id: existing.employee_id,
    description: `Updated HR action`,
  });
  revalidatePath(`/admin/hr/employees`);
  return { success: true, data: data as HrActionRow };
}

export async function archiveEmployeeHrAction(id: number): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.manage")) return { success: false, error: "No permission" };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("employee_hr_actions").select("employee_id, action_title").eq("id", id).is("deleted_at", null).single();
  if (!existing) return { success: false, error: "HR action not found" };
  const adminClient = await createAdminClient();
  const { error } = await adminClient.from("employee_hr_actions").update({ deleted_at: new Date().toISOString(), deleted_by: ctx.profile?.id }).eq("id", id);
  if (error) return { success: false, error: error.message };
  await hrAuditLog({
    action: "ARCHIVE", entity_type: "employee_hr_actions", entity_id: id,
    parent_entity_type: "employees", parent_entity_id: existing.employee_id,
    description: `Archived HR action: ${existing.action_title}`,
  });
  revalidatePath(`/admin/hr/employees`);
  return { success: true, data: undefined };
}

export async function closeEmployeeHrAction(id: number, notes?: string): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.manage")) return { success: false, error: "No permission" };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("employee_hr_actions").select("employee_id").eq("id", id).is("deleted_at", null).single();
  if (!existing) return { success: false, error: "HR action not found" };
  const adminClient = await createAdminClient();
  const updates: Record<string, unknown> = { action_status: "closed", updated_by: ctx.profile?.id };
  if (notes) updates.notes = notes;
  const { error } = await adminClient.from("employee_hr_actions").update(updates).eq("id", id);
  if (error) return { success: false, error: error.message };
  await hrAuditLog({
    action: "STATUS_CHANGE", entity_type: "employee_hr_actions", entity_id: id,
    parent_entity_type: "employees", parent_entity_id: existing.employee_id,
    description: "HR action closed",
  });
  revalidatePath(`/admin/hr/employees`);
  return { success: true, data: undefined };
}

export async function cancelEmployeeHrAction(id: number, reason: string): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.manage")) return { success: false, error: "No permission" };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("employee_hr_actions").select("employee_id").eq("id", id).is("deleted_at", null).single();
  if (!existing) return { success: false, error: "HR action not found" };
  const adminClient = await createAdminClient();
  const { error } = await adminClient.from("employee_hr_actions").update({ action_status: "cancelled", notes: reason, updated_by: ctx.profile?.id }).eq("id", id);
  if (error) return { success: false, error: error.message };
  await hrAuditLog({
    action: "STATUS_CHANGE", entity_type: "employee_hr_actions", entity_id: id,
    parent_entity_type: "employees", parent_entity_id: existing.employee_id,
    description: `HR action cancelled`,
  });
  revalidatePath(`/admin/hr/employees`);
  return { success: true, data: undefined };
}

// =============================================================================
// PERFORMANCE
// =============================================================================

export async function listEmployeePerformanceRecords(
  employeeId: number,
  params?: Record<string, unknown>
): Promise<PerformanceRow[]> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.view")) throw new Error("No permission");
  const supabase = await createClient();
  let query = supabase
    .from("employee_performance_records")
    .select("*, reviewer:user_profiles!reviewer_id(display_name)")
    .eq("employee_id", employeeId)
    .is("deleted_at", null)
    .order("review_date", { ascending: false });
  if (params?.status) query = query.eq("status", params.status as string);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PerformanceRow[];
}

export async function createEmployeePerformanceRecord(
  employeeId: number,
  input: unknown
): Promise<ActionResult<PerformanceRow>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.manage")) return { success: false, error: "No permission" };
  const parsed = performanceSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.message };
  const empCtx = await getEmployeeContext(employeeId);
  if (!empCtx) return { success: false, error: "Employee not found" };
  const adminClient = await createAdminClient();
  const { data, error } = await adminClient
    .from("employee_performance_records")
    .insert({ ...parsed.data, employee_id: employeeId, created_by: ctx.profile?.id, updated_by: ctx.profile?.id })
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  await hrAuditLog({
    action: "CREATE", entity_type: "employee_performance_records", entity_id: data.id,
    parent_entity_type: "employees", parent_entity_id: employeeId,
    description: `Created ${parsed.data.review_type} performance review`,
    metadata: { employee_code: empCtx.employee_code, employee_name: empCtx.full_name_en },
  });
  revalidatePath(`/admin/hr/employees`);
  return { success: true, data: data as PerformanceRow };
}

export async function updateEmployeePerformanceRecord(
  id: number,
  input: unknown
): Promise<ActionResult<PerformanceRow>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.manage")) return { success: false, error: "No permission" };
  const parsed = performanceSchema.partial().safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.message };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("employee_performance_records").select("employee_id, status").eq("id", id).is("deleted_at", null).single();
  if (!existing) return { success: false, error: "Performance record not found" };
  if (existing.status === "closed" || existing.status === "approved") return { success: false, error: "Cannot modify a closed/approved review" };
  const adminClient = await createAdminClient();
  const { data, error } = await adminClient
    .from("employee_performance_records")
    .update({ ...parsed.data, updated_by: ctx.profile?.id })
    .eq("id", id)
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  await hrAuditLog({
    action: "UPDATE", entity_type: "employee_performance_records", entity_id: id,
    parent_entity_type: "employees", parent_entity_id: existing.employee_id,
    description: "Updated performance record",
  });
  revalidatePath(`/admin/hr/employees`);
  return { success: true, data: data as PerformanceRow };
}

export async function archiveEmployeePerformanceRecord(id: number): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.manage")) return { success: false, error: "No permission" };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("employee_performance_records").select("employee_id").eq("id", id).is("deleted_at", null).single();
  if (!existing) return { success: false, error: "Record not found" };
  const adminClient = await createAdminClient();
  const { error } = await adminClient.from("employee_performance_records").update({ deleted_at: new Date().toISOString(), deleted_by: ctx.profile?.id }).eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath(`/admin/hr/employees`);
  return { success: true, data: undefined };
}

export async function submitEmployeePerformanceRecord(id: number): Promise<ActionResult> {
  return changePerformanceStatus(id, "submitted");
}

export async function approveEmployeePerformanceRecord(id: number): Promise<ActionResult> {
  return changePerformanceStatus(id, "approved");
}

export async function closeEmployeePerformanceRecord(id: number): Promise<ActionResult> {
  return changePerformanceStatus(id, "closed");
}

async function changePerformanceStatus(id: number, status: string): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.manage")) return { success: false, error: "No permission" };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("employee_performance_records").select("employee_id").eq("id", id).is("deleted_at", null).single();
  if (!existing) return { success: false, error: "Record not found" };
  const adminClient = await createAdminClient();
  const { error } = await adminClient.from("employee_performance_records").update({ status, updated_by: ctx.profile?.id }).eq("id", id);
  if (error) return { success: false, error: error.message };
  await hrAuditLog({
    action: "STATUS_CHANGE", entity_type: "employee_performance_records", entity_id: id,
    parent_entity_type: "employees", parent_entity_id: existing.employee_id,
    description: `Performance record status → ${status}`,
  });
  revalidatePath(`/admin/hr/employees`);
  return { success: true, data: undefined };
}

// =============================================================================
// DISCIPLINARY
// =============================================================================

export async function listEmployeeDisciplinaryRecords(
  employeeId: number,
  params?: Record<string, unknown>
): Promise<DisciplinaryRow[]> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.view")) throw new Error("No permission");
  const supabase = await createClient();
  let query = supabase
    .from("employee_disciplinary_records")
    .select("*, issued_by_profile:user_profiles!issued_by(display_name)")
    .eq("employee_id", employeeId)
    .is("deleted_at", null)
    .order("record_date", { ascending: false });
  if (params?.status) query = query.eq("status", params.status as string);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as DisciplinaryRow[];
}

export async function listGlobalDisciplinaryRecords(params?: Record<string, unknown>): Promise<DisciplinaryRow[]> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.view")) throw new Error("No permission");
  const supabase = await createClient();
  let query = supabase
    .from("employee_disciplinary_records")
    .select("*, issued_by_profile:user_profiles!issued_by(display_name)")
    .is("deleted_at", null)
    .order("record_date", { ascending: false });
  if (params?.status) query = query.eq("status", params.status as string);
  if (params?.severity) query = query.eq("severity", params.severity as string);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as DisciplinaryRow[];
}

export async function createEmployeeDisciplinaryRecord(
  employeeId: number,
  input: unknown
): Promise<ActionResult<DisciplinaryRow>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.manage")) return { success: false, error: "No permission" };
  const parsed = disciplinarySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.message };
  const empCtx = await getEmployeeContext(employeeId);
  if (!empCtx) return { success: false, error: "Employee not found" };
  const adminClient = await createAdminClient();
  const { data, error } = await adminClient
    .from("employee_disciplinary_records")
    .insert({ ...parsed.data, employee_id: employeeId, created_by: ctx.profile?.id, updated_by: ctx.profile?.id })
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  await hrAuditLog({
    action: "CREATE", entity_type: "employee_disciplinary_records", entity_id: data.id,
    parent_entity_type: "employees", parent_entity_id: employeeId,
    description: `Created disciplinary record: ${parsed.data.subject}`,
    metadata: { employee_code: empCtx.employee_code, employee_name: empCtx.full_name_en, severity: parsed.data.severity },
  });
  revalidatePath(`/admin/hr/employees`);
  return { success: true, data: data as DisciplinaryRow };
}

export async function updateEmployeeDisciplinaryRecord(
  id: number,
  input: unknown
): Promise<ActionResult<DisciplinaryRow>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.manage")) return { success: false, error: "No permission" };
  const parsed = disciplinarySchema.partial().safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.message };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("employee_disciplinary_records").select("employee_id").eq("id", id).is("deleted_at", null).single();
  if (!existing) return { success: false, error: "Disciplinary record not found" };
  const adminClient = await createAdminClient();
  const { data, error } = await adminClient
    .from("employee_disciplinary_records")
    .update({ ...parsed.data, updated_by: ctx.profile?.id })
    .eq("id", id)
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  await hrAuditLog({
    action: "UPDATE", entity_type: "employee_disciplinary_records", entity_id: id,
    parent_entity_type: "employees", parent_entity_id: existing.employee_id,
    description: "Updated disciplinary record",
  });
  revalidatePath(`/admin/hr/employees`);
  return { success: true, data: data as DisciplinaryRow };
}

export async function archiveEmployeeDisciplinaryRecord(id: number): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.manage")) return { success: false, error: "No permission" };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("employee_disciplinary_records").select("employee_id, subject").eq("id", id).is("deleted_at", null).single();
  if (!existing) return { success: false, error: "Record not found" };
  const adminClient = await createAdminClient();
  const { error } = await adminClient.from("employee_disciplinary_records").update({ deleted_at: new Date().toISOString(), deleted_by: ctx.profile?.id }).eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath(`/admin/hr/employees`);
  return { success: true, data: undefined };
}

export async function acknowledgeEmployeeDisciplinaryRecord(id: number): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.manage")) return { success: false, error: "No permission" };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("employee_disciplinary_records").select("employee_id").eq("id", id).is("deleted_at", null).single();
  if (!existing) return { success: false, error: "Record not found" };
  const adminClient = await createAdminClient();
  const { error } = await adminClient.from("employee_disciplinary_records").update({ acknowledged_by_employee: true, acknowledged_at: new Date().toISOString(), updated_by: ctx.profile?.id }).eq("id", id);
  if (error) return { success: false, error: error.message };
  await hrAuditLog({
    action: "ACKNOWLEDGE", entity_type: "employee_disciplinary_records", entity_id: id,
    parent_entity_type: "employees", parent_entity_id: existing.employee_id,
    description: "Disciplinary record acknowledged by employee",
  });
  revalidatePath(`/admin/hr/employees`);
  return { success: true, data: undefined };
}

export async function closeEmployeeDisciplinaryRecord(id: number, notes?: string): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.manage")) return { success: false, error: "No permission" };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("employee_disciplinary_records").select("employee_id").eq("id", id).is("deleted_at", null).single();
  if (!existing) return { success: false, error: "Record not found" };
  const updates: Record<string, unknown> = { status: "closed", updated_by: ctx.profile?.id };
  if (notes) updates.action_taken = notes;
  const adminClient = await createAdminClient();
  const { error } = await adminClient.from("employee_disciplinary_records").update(updates).eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath(`/admin/hr/employees`);
  return { success: true, data: undefined };
}

// =============================================================================
// HR NOTES
// =============================================================================

export async function listEmployeeHrNotes(
  employeeId: number,
  params?: Record<string, unknown>
): Promise<HrNoteRow[]> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.view")) throw new Error("No permission");
  const supabase = await createClient();
  let query = supabase
    .from("employee_hr_notes")
    .select("*")
    .eq("employee_id", employeeId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (params?.note_type) query = query.eq("note_type", params.note_type as string);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as HrNoteRow[];
}

export async function createEmployeeHrNote(
  employeeId: number,
  input: unknown
): Promise<ActionResult<HrNoteRow>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.manage")) return { success: false, error: "No permission" };
  const parsed = hrNoteSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.message };
  const empCtx = await getEmployeeContext(employeeId);
  if (!empCtx) return { success: false, error: "Employee not found" };
  const adminClient = await createAdminClient();
  const { data, error } = await adminClient
    .from("employee_hr_notes")
    .insert({ ...parsed.data, employee_id: employeeId, created_by: ctx.profile?.id })
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  await hrAuditLog({
    action: "CREATE", entity_type: "employee_hr_notes", entity_id: data.id,
    parent_entity_type: "employees", parent_entity_id: employeeId,
    description: `Added ${parsed.data.note_type} HR note`,
    metadata: { employee_code: empCtx.employee_code, employee_name: empCtx.full_name_en },
  });
  revalidatePath(`/admin/hr/employees`);
  return { success: true, data: data as HrNoteRow };
}

export async function archiveEmployeeHrNote(id: number): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.manage")) return { success: false, error: "No permission" };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("employee_hr_notes").select("employee_id").eq("id", id).is("deleted_at", null).single();
  if (!existing) return { success: false, error: "Note not found" };
  const adminClient = await createAdminClient();
  const { error } = await adminClient.from("employee_hr_notes").update({ deleted_at: new Date().toISOString(), deleted_by: ctx.profile?.id }).eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath(`/admin/hr/employees`);
  return { success: true, data: undefined };
}

// =============================================================================
// APPROVAL REQUESTS
// =============================================================================

export async function listEmployeeApprovalRequests(
  employeeId: number,
  params?: Record<string, unknown>
): Promise<ApprovalRequestRow[]> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.view")) throw new Error("No permission");
  const supabase = await createClient();
  let query = supabase
    .from("employee_approval_requests")
    .select("*, approval_role:approval_roles(name), requested_by_profile:user_profiles!requested_by(display_name)")
    .eq("employee_id", employeeId)
    .is("deleted_at", null)
    .order("requested_at", { ascending: false });
  if (params?.status) query = query.eq("request_status", params.status as string);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ApprovalRequestRow[];
}

export async function listGlobalApprovalRequests(params?: Record<string, unknown>): Promise<ApprovalRequestRow[]> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.view")) throw new Error("No permission");
  const supabase = await createClient();
  let query = supabase
    .from("employee_approval_requests")
    .select("*, approval_role:approval_roles(name), requested_by_profile:user_profiles!requested_by(display_name)")
    .is("deleted_at", null)
    .order("requested_at", { ascending: false });
  if (params?.status) query = query.eq("request_status", params.status as string);
  if (params?.type) query = query.eq("approval_type", params.type as string);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ApprovalRequestRow[];
}

export async function createEmployeeApprovalRequest(
  employeeId: number,
  input: unknown
): Promise<ActionResult<ApprovalRequestRow>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.manage")) return { success: false, error: "No permission" };
  const parsed = approvalRequestSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.message };
  const empCtx = await getEmployeeContext(employeeId);
  if (!empCtx) return { success: false, error: "Employee not found" };
  const adminClient = await createAdminClient();
  const { data, error } = await adminClient
    .from("employee_approval_requests")
    .insert({
      ...parsed.data,
      employee_id: employeeId,
      request_status: "pending",
      requested_by: ctx.profile?.id,
      requested_at: new Date().toISOString(),
      created_by: ctx.profile?.id,
      updated_by: ctx.profile?.id,
    })
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  await hrAuditLog({
    action: "CREATE", entity_type: "employee_approval_requests", entity_id: data.id,
    parent_entity_type: "employees", parent_entity_id: employeeId,
    description: `Created approval request: ${parsed.data.request_title}`,
    metadata: { employee_code: empCtx.employee_code, employee_name: empCtx.full_name_en },
  });
  revalidatePath(`/admin/hr/employees`);
  return { success: true, data: data as ApprovalRequestRow };
}

export async function approveEmployeeApprovalRequest(id: number, reason?: string): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.manage")) return { success: false, error: "No permission" };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("employee_approval_requests").select("employee_id, request_title, request_status").eq("id", id).is("deleted_at", null).single();
  if (!existing) return { success: false, error: "Approval request not found" };
  if (existing.request_status !== "pending") return { success: false, error: "Only pending requests can be approved" };
  const adminClient = await createAdminClient();
  const { error } = await adminClient.from("employee_approval_requests").update({
    request_status: "approved",
    approved_by: ctx.profile?.id,
    approved_at: new Date().toISOString(),
    decision_reason: reason ?? null,
    updated_by: ctx.profile?.id,
  }).eq("id", id);
  if (error) return { success: false, error: error.message };
  await hrAuditLog({
    action: "APPROVE", entity_type: "employee_approval_requests", entity_id: id,
    parent_entity_type: "employees", parent_entity_id: existing.employee_id,
    description: `Approved: ${existing.request_title}`,
  });
  revalidatePath(`/admin/hr/employees`);
  return { success: true, data: undefined };
}

export async function rejectEmployeeApprovalRequest(id: number, reason: string): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.manage")) return { success: false, error: "No permission" };
  if (!reason?.trim()) return { success: false, error: "Rejection reason is required" };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("employee_approval_requests").select("employee_id, request_title, request_status").eq("id", id).is("deleted_at", null).single();
  if (!existing) return { success: false, error: "Approval request not found" };
  if (existing.request_status !== "pending") return { success: false, error: "Only pending requests can be rejected" };
  const adminClient = await createAdminClient();
  const { error } = await adminClient.from("employee_approval_requests").update({
    request_status: "rejected",
    rejected_by: ctx.profile?.id,
    rejected_at: new Date().toISOString(),
    decision_reason: reason,
    updated_by: ctx.profile?.id,
  }).eq("id", id);
  if (error) return { success: false, error: error.message };
  await hrAuditLog({
    action: "REJECT", entity_type: "employee_approval_requests", entity_id: id,
    parent_entity_type: "employees", parent_entity_id: existing.employee_id,
    description: `Rejected: ${existing.request_title}`,
  });
  revalidatePath(`/admin/hr/employees`);
  return { success: true, data: undefined };
}

export async function cancelEmployeeApprovalRequest(id: number, reason: string): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.manage")) return { success: false, error: "No permission" };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("employee_approval_requests").select("employee_id, request_status").eq("id", id).is("deleted_at", null).single();
  if (!existing) return { success: false, error: "Approval request not found" };
  if (existing.request_status !== "pending") return { success: false, error: "Only pending requests can be cancelled" };
  const adminClient = await createAdminClient();
  const { error } = await adminClient.from("employee_approval_requests").update({
    request_status: "cancelled",
    cancelled_by: ctx.profile?.id,
    cancelled_at: new Date().toISOString(),
    decision_reason: reason,
    updated_by: ctx.profile?.id,
  }).eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath(`/admin/hr/employees`);
  return { success: true, data: undefined };
}

export async function archiveEmployeeApprovalRequest(id: number): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.manage")) return { success: false, error: "No permission" };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("employee_approval_requests").select("employee_id").eq("id", id).is("deleted_at", null).single();
  if (!existing) return { success: false, error: "Request not found" };
  const adminClient = await createAdminClient();
  const { error } = await adminClient.from("employee_approval_requests").update({ deleted_at: new Date().toISOString(), deleted_by: ctx.profile?.id }).eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath(`/admin/hr/employees`);
  return { success: true, data: undefined };
}

// =============================================================================
// EOS CASES
// =============================================================================

export async function listEmployeeEosCases(
  employeeId: number,
  params?: Record<string, unknown>
): Promise<EosCaseRow[]> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.view") && !hasPermission(ctx, "hr.eos.view")) throw new Error("No permission");
  const supabase = await createClient();
  let query = supabase
    .from("employee_eos_cases")
    .select("*")
    .eq("employee_id", employeeId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (params?.status) query = query.eq("case_status", params.status as string);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as EosCaseRow[];
}

export async function listGlobalEosCases(params?: Record<string, unknown>): Promise<EosCaseRow[]> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.view") && !hasPermission(ctx, "hr.eos.view")) throw new Error("No permission");
  const supabase = await createClient();
  let query = supabase
    .from("employee_eos_cases")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (params?.status) query = query.eq("case_status", params.status as string);
  if (params?.type) query = query.eq("eos_type", params.type as string);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as EosCaseRow[];
}

export async function createEmployeeEosCase(
  employeeId: number,
  input: unknown
): Promise<ActionResult<EosCaseRow>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.manage") && !hasPermission(ctx, "hr.eos.manage")) return { success: false, error: "No permission" };
  const parsed = eosSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.message };
  const empCtx = await getEmployeeContext(employeeId);
  if (!empCtx) return { success: false, error: "Employee not found" };
  const adminClient = await createAdminClient();
  const { data, error } = await adminClient
    .from("employee_eos_cases")
    .insert({ ...parsed.data, employee_id: employeeId, created_by: ctx.profile?.id, updated_by: ctx.profile?.id })
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  await hrAuditLog({
    action: "CREATE", entity_type: "employee_eos_cases", entity_id: data.id,
    parent_entity_type: "employees", parent_entity_id: employeeId,
    description: `Created EOS case: ${parsed.data.eos_type}`,
    metadata: { employee_code: empCtx.employee_code, employee_name: empCtx.full_name_en },
  });
  revalidatePath(`/admin/hr/employees`);
  return { success: true, data: data as EosCaseRow };
}

export async function updateEmployeeEosCase(
  id: number,
  input: unknown
): Promise<ActionResult<EosCaseRow>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.manage") && !hasPermission(ctx, "hr.eos.manage")) return { success: false, error: "No permission" };
  const parsed = eosSchema.partial().safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.message };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("employee_eos_cases").select("employee_id, case_status").eq("id", id).is("deleted_at", null).single();
  if (!existing) return { success: false, error: "EOS case not found" };
  if (existing.case_status === "closed") return { success: false, error: "Cannot modify a closed EOS case" };
  const adminClient = await createAdminClient();
  const { data, error } = await adminClient
    .from("employee_eos_cases")
    .update({ ...parsed.data, updated_by: ctx.profile?.id })
    .eq("id", id)
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  await hrAuditLog({
    action: "UPDATE", entity_type: "employee_eos_cases", entity_id: id,
    parent_entity_type: "employees", parent_entity_id: existing.employee_id,
    description: "Updated EOS case",
  });
  revalidatePath(`/admin/hr/employees`);
  return { success: true, data: data as EosCaseRow };
}

export async function archiveEmployeeEosCase(id: number): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.manage") && !hasPermission(ctx, "hr.eos.manage")) return { success: false, error: "No permission" };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("employee_eos_cases").select("employee_id").eq("id", id).is("deleted_at", null).single();
  if (!existing) return { success: false, error: "EOS case not found" };
  const adminClient = await createAdminClient();
  const { error } = await adminClient.from("employee_eos_cases").update({ deleted_at: new Date().toISOString(), deleted_by: ctx.profile?.id }).eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath(`/admin/hr/employees`);
  return { success: true, data: undefined };
}

export async function changeEmployeeEosCaseStatus(
  id: number,
  status: string,
  notes?: string
): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.manage") && !hasPermission(ctx, "hr.eos.manage")) return { success: false, error: "No permission" };
  const validStatuses = ["draft","notice_served","clearance_in_progress","pending_final_settlement","closed","cancelled"];
  if (!validStatuses.includes(status)) return { success: false, error: "Invalid status" };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("employee_eos_cases").select("employee_id, eos_type").eq("id", id).is("deleted_at", null).single();
  if (!existing) return { success: false, error: "EOS case not found" };
  const updates: Record<string, unknown> = { case_status: status, updated_by: ctx.profile?.id };
  if (notes) updates.notes = notes;
  const adminClient = await createAdminClient();
  const { error } = await adminClient.from("employee_eos_cases").update(updates).eq("id", id);
  if (error) return { success: false, error: error.message };
  await hrAuditLog({
    action: "STATUS_CHANGE", entity_type: "employee_eos_cases", entity_id: id,
    parent_entity_type: "employees", parent_entity_id: existing.employee_id,
    description: `EOS case status → ${status}`,
  });
  revalidatePath(`/admin/hr/employees`);
  return { success: true, data: undefined };
}

// =============================================================================
// CLEARANCE ITEMS
// =============================================================================

export async function listEmployeeClearanceItems(eosCaseId: number): Promise<ClearanceItemRow[]> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.view") && !hasPermission(ctx, "hr.eos.view")) throw new Error("No permission");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_clearance_items")
    .select("*")
    .eq("eos_case_id", eosCaseId)
    .is("deleted_at", null)
    .order("clearance_area")
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as ClearanceItemRow[];
}

export async function createEmployeeClearanceItem(
  eosCaseId: number,
  input: unknown
): Promise<ActionResult<ClearanceItemRow>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.manage") && !hasPermission(ctx, "hr.eos.manage")) return { success: false, error: "No permission" };
  const parsed = clearanceItemSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.message };
  const supabase = await createClient();
  const { data: eosCase } = await supabase.from("employee_eos_cases").select("employee_id").eq("id", eosCaseId).is("deleted_at", null).single();
  if (!eosCase) return { success: false, error: "EOS case not found" };
  const adminClient = await createAdminClient();
  const { data, error } = await adminClient
    .from("employee_clearance_items")
    .insert({ ...parsed.data, eos_case_id: eosCaseId, employee_id: eosCase.employee_id, created_by: ctx.profile?.id, updated_by: ctx.profile?.id })
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  await hrAuditLog({
    action: "CREATE", entity_type: "employee_clearance_items", entity_id: data.id,
    parent_entity_type: "employee_eos_cases", parent_entity_id: eosCaseId,
    description: `Added clearance item: ${parsed.data.item_title} (${parsed.data.clearance_area})`,
  });
  revalidatePath(`/admin/hr/employees`);
  return { success: true, data: data as ClearanceItemRow };
}

export async function updateEmployeeClearanceItem(
  id: number,
  input: unknown
): Promise<ActionResult<ClearanceItemRow>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.manage") && !hasPermission(ctx, "hr.eos.manage")) return { success: false, error: "No permission" };
  const parsed = clearanceItemSchema.partial().safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.message };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("employee_clearance_items").select("eos_case_id, employee_id").eq("id", id).is("deleted_at", null).single();
  if (!existing) return { success: false, error: "Clearance item not found" };
  const adminClient = await createAdminClient();
  const { data, error } = await adminClient
    .from("employee_clearance_items")
    .update({ ...parsed.data, updated_by: ctx.profile?.id })
    .eq("id", id)
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  revalidatePath(`/admin/hr/employees`);
  return { success: true, data: data as ClearanceItemRow };
}

export async function clearEmployeeClearanceItem(id: number, notes?: string): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.manage") && !hasPermission(ctx, "hr.eos.manage")) return { success: false, error: "No permission" };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("employee_clearance_items").select("eos_case_id, employee_id").eq("id", id).is("deleted_at", null).single();
  if (!existing) return { success: false, error: "Item not found" };
  const adminClient = await createAdminClient();
  const { error } = await adminClient.from("employee_clearance_items").update({
    item_status: "cleared",
    cleared_by: ctx.profile?.id,
    cleared_at: new Date().toISOString(),
    notes: notes ?? null,
    updated_by: ctx.profile?.id,
  }).eq("id", id);
  if (error) return { success: false, error: error.message };
  await hrAuditLog({
    action: "CLEAR", entity_type: "employee_clearance_items", entity_id: id,
    parent_entity_type: "employee_eos_cases", parent_entity_id: existing.eos_case_id,
    description: "Clearance item marked cleared",
  });
  revalidatePath(`/admin/hr/employees`);
  return { success: true, data: undefined };
}

export async function blockEmployeeClearanceItem(id: number, notes?: string): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.manage") && !hasPermission(ctx, "hr.eos.manage")) return { success: false, error: "No permission" };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("employee_clearance_items").select("eos_case_id").eq("id", id).is("deleted_at", null).single();
  if (!existing) return { success: false, error: "Item not found" };
  const adminClient = await createAdminClient();
  const { error } = await adminClient.from("employee_clearance_items").update({ item_status: "blocked", notes: notes ?? null, updated_by: ctx.profile?.id }).eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath(`/admin/hr/employees`);
  return { success: true, data: undefined };
}

export async function archiveEmployeeClearanceItem(id: number): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.manage") && !hasPermission(ctx, "hr.eos.manage")) return { success: false, error: "No permission" };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("employee_clearance_items").select("eos_case_id").eq("id", id).is("deleted_at", null).single();
  if (!existing) return { success: false, error: "Item not found" };
  const adminClient = await createAdminClient();
  const { error } = await adminClient.from("employee_clearance_items").update({ deleted_at: new Date().toISOString(), deleted_by: ctx.profile?.id }).eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath(`/admin/hr/employees`);
  return { success: true, data: undefined };
}

// =============================================================================
// SUMMARY
// =============================================================================

export async function getEmployeeHrActionsSummary(employeeId: number): Promise<HrActionsSummary> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.actions.view")) {
    return { open_pro_processes: 0, open_hr_actions: 0, performance_reviews: 0, open_disciplinary: 0, pending_approvals: 0, open_eos_case: false };
  }
  const supabase = await createClient();
  const [proRes, actionRes, perfRes, discRes, approvalRes, eosRes] = await Promise.all([
    supabase.from("employee_pro_processes").select("id", { count: "exact", head: true }).eq("employee_id", employeeId).is("deleted_at", null).not("process_status", "in", '("completed","cancelled","rejected")'),
    supabase.from("employee_hr_actions").select("id", { count: "exact", head: true }).eq("employee_id", employeeId).is("deleted_at", null).not("action_status", "in", '("closed","cancelled")'),
    supabase.from("employee_performance_records").select("id", { count: "exact", head: true }).eq("employee_id", employeeId).is("deleted_at", null),
    supabase.from("employee_disciplinary_records").select("id", { count: "exact", head: true }).eq("employee_id", employeeId).is("deleted_at", null).not("status", "in", '("closed","cancelled")'),
    supabase.from("employee_approval_requests").select("id", { count: "exact", head: true }).eq("employee_id", employeeId).is("deleted_at", null).eq("request_status", "pending"),
    supabase.from("employee_eos_cases").select("id", { count: "exact", head: true }).eq("employee_id", employeeId).is("deleted_at", null).not("case_status", "in", '("closed","cancelled")'),
  ]);
  return {
    open_pro_processes: proRes.count ?? 0,
    open_hr_actions: actionRes.count ?? 0,
    performance_reviews: perfRes.count ?? 0,
    open_disciplinary: discRes.count ?? 0,
    pending_approvals: approvalRes.count ?? 0,
    open_eos_case: (eosRes.count ?? 0) > 0,
  };
}
