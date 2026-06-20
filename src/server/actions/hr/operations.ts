"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { z } from "zod";
import { calculateEmployeeReadiness } from "@/lib/hr/operations/readiness";
import { isActiveBlock, isCurrentAssignment } from "@/lib/hr/operations/status";

// ── Types ──────────────────────────────────────────────────────────────────

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

// ── Helpers ────────────────────────────────────────────────────────────────

async function getEmployeeContext(employeeId: number) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("employees")
    .select("id, employee_code, full_name_en")
    .eq("id", employeeId)
    .single();
  return data;
}

// ── Zod Schemas ────────────────────────────────────────────────────────────

const assignmentSchema = z.object({
  owner_company_id: z.number().int().positive().nullable().optional(),
  branch_id: z.number().int().positive().nullable().optional(),
  department_id: z.number().int().positive().nullable().optional(),
  designation_id: z.number().int().positive().nullable().optional(),
  work_site_id: z.number().int().positive().nullable().optional(),
  assignment_type: z.enum(["primary", "temporary", "project", "site", "department", "relief"]).default("primary"),
  assignment_status: z.enum(["active", "planned", "completed", "cancelled"]).default("active"),
  effective_from: z.string().min(1),
  effective_to: z.string().nullable().optional(),
  reporting_manager_id: z.number().int().positive().nullable().optional(),
  supervisor_id: z.number().int().positive().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const roleRequirementSchema = z.object({
  designation_id: z.number().int().positive().nullable().optional(),
  requirement_type: z.enum(["document", "training", "medical", "access_card", "license", "other"]),
  requirement_source: z.string().max(500).nullable().optional(),
  required_reference_id: z.number().int().positive().nullable().optional(),
  requirement_name: z.string().min(1).max(500),
  is_required: z.boolean().default(true),
  is_met: z.boolean().default(false),
  met_record_type: z.string().max(100).nullable().optional(),
  met_record_id: z.number().int().positive().nullable().optional(),
  expiry_date: z.string().nullable().optional(),
  status: z.enum(["met", "missing", "expired", "expiring_soon", "waived", "not_required"]).default("missing"),
  notes: z.string().max(2000).nullable().optional(),
});

const operationalBlockSchema = z.object({
  block_type: z.enum(["compliance", "medical", "training", "access", "payroll", "hr_hold", "operations", "safety", "other"]),
  block_reason: z.string().min(1).max(2000),
  block_status: z.enum(["active", "released", "expired", "cancelled"]).default("active"),
  effective_from: z.string().min(1),
  effective_to: z.string().nullable().optional(),
  related_record_type: z.string().max(100).nullable().optional(),
  related_record_id: z.number().int().positive().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const assetSchema = z.object({
  asset_type: z.enum(["id_card", "phone", "sim", "laptop", "vehicle", "tool", "key", "other"]),
  asset_reference: z.string().max(200).nullable().optional(),
  asset_description: z.string().min(1).max(1000),
  issued_date: z.string().min(1),
  return_due_date: z.string().nullable().optional(),
  returned_date: z.string().nullable().optional(),
  status: z.enum(["issued", "returned", "lost", "damaged", "cancelled"]).default("issued"),
  condition_on_issue: z.string().max(500).nullable().optional(),
  condition_on_return: z.string().max(500).nullable().optional(),
  dms_document_id: z.number().int().positive().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const ppeIssueSchema = z.object({
  ppe_item: z.string().min(1).max(500),
  standard_or_size: z.string().max(200).nullable().optional(),
  quantity: z.number().positive().default(1),
  issued_date: z.string().min(1),
  expiry_or_replacement_date: z.string().nullable().optional(),
  returned_date: z.string().nullable().optional(),
  status: z.enum(["issued", "returned", "expired", "lost", "damaged", "cancelled"]).default("issued"),
  dms_document_id: z.number().int().positive().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const accommodationSchema = z.object({
  accommodation_type: z.enum(["company_camp", "rented_room", "allowance", "other"]).nullable().optional(),
  accommodation_location: z.string().max(500).nullable().optional(),
  room_or_bed_no: z.string().max(100).nullable().optional(),
  assigned_from: z.string().min(1),
  assigned_to: z.string().nullable().optional(),
  status: z.enum(["active", "ended", "cancelled"]).default("active"),
  notes: z.string().max(2000).nullable().optional(),
});

// ══════════════════════════════════════════════════════════════════════
// ASSIGNMENTS
// ══════════════════════════════════════════════════════════════════════

export async function listEmployeeAssignments(
  employeeId: number,
  params?: { status?: string; limit?: number; offset?: number }
): Promise<ActionResult<unknown[]>> {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.view")) {
    return { success: false, error: "Unauthorized" };
  }
  const supabase = await createClient();
  let query = supabase
    .from("employee_assignments")
    .select(
      `id, assignment_type, assignment_status, effective_from, effective_to, notes,
       created_at, updated_at,
       owner_companies(id, name),
       branches(id, name),
       departments(id, name_en),
       designations(id, name_en),
       work_sites(id, name_en),
       reporting_manager:employees!employee_assignments_reporting_manager_id_fkey(id, full_name_en, employee_code),
       supervisor:employees!employee_assignments_supervisor_id_fkey(id, full_name_en, employee_code)`
    )
    .eq("employee_id", employeeId)
    .is("deleted_at", null)
    .order("effective_from", { ascending: false });

  if (params?.status) query = query.eq("assignment_status", params.status);
  if (params?.limit) query = query.limit(params.limit);
  if (params?.offset) query = query.range(params.offset, (params.offset ?? 0) + (params.limit ?? 50) - 1);

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data: data ?? [] };
}

export async function getCurrentEmployeeAssignment(employeeId: number): Promise<ActionResult<unknown | null>> {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.view")) {
    return { success: false, error: "Unauthorized" };
  }
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("employee_assignments")
    .select(
      `id, assignment_type, assignment_status, effective_from, effective_to, notes,
       owner_companies(id, name),
       branches(id, name),
       departments(id, name_en),
       designations(id, name_en),
       work_sites(id, name_en)`
    )
    .eq("employee_id", employeeId)
    .eq("assignment_status", "active")
    .is("deleted_at", null)
    .lte("effective_from", today)
    .or(`effective_to.is.null,effective_to.gte.${today}`)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { success: false, error: error.message };
  return { success: true, data: data ?? null };
}

export async function listGlobalEmployeeAssignments(params?: {
  status?: string;
  work_site_id?: number;
  department_id?: number;
  designation_id?: number;
  limit?: number;
  offset?: number;
}): Promise<ActionResult<{ data: unknown[]; count: number }>> {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.view")) {
    return { success: false, error: "Unauthorized" };
  }
  const supabase = await createClient();
  let query = supabase
    .from("employee_assignments")
    .select(
      `id, assignment_type, assignment_status, effective_from, effective_to,
       employees(id, full_name_en, employee_code),
       owner_companies(id, name),
       departments(id, name_en),
       designations(id, name_en),
       work_sites(id, name_en)`,
      { count: "exact" }
    )
    .is("deleted_at", null)
    .order("effective_from", { ascending: false });

  if (params?.status) query = query.eq("assignment_status", params.status);
  if (params?.work_site_id) query = query.eq("work_site_id", params.work_site_id);
  if (params?.department_id) query = query.eq("department_id", params.department_id);
  if (params?.designation_id) query = query.eq("designation_id", params.designation_id);

  const limit = params?.limit ?? 50;
  const offset = params?.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data: { data: data ?? [], count: count ?? 0 } };
}

export async function createEmployeeAssignment(
  employeeId: number,
  input: unknown
): Promise<ActionResult<{ id: number }>> {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.manage")) {
    return { success: false, error: "Unauthorized" };
  }
  const parsed = assignmentSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.message };

  const emp = await getEmployeeContext(employeeId);
  if (!emp) return { success: false, error: "Employee not found" };

  const admin = createAdminClient();
  const { data: inserted, error } = await admin
    .from("employee_assignments")
    .insert({ employee_id: employeeId, ...parsed.data, created_by: ctx.profile?.id })
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };

  await logAudit({
    module_code: "HR",
    entity_name: "employee_assignments",
    entity_id: inserted.id,
    entity_reference: `${emp.employee_code}-assignment`,
    action: "assignment_created",
    new_values: {
      parent_employee_id: employeeId,
      employee_code: emp.employee_code,
      employee_name: emp.full_name_en,
      related_record_type: "employee_assignment",
    },
  });
  revalidatePath(`/admin/hr/employees/${employeeId}`);
  return { success: true, data: { id: inserted.id } };
}

export async function updateEmployeeAssignment(
  id: number,
  input: unknown
): Promise<ActionResult<{ id: number }>> {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.manage")) {
    return { success: false, error: "Unauthorized" };
  }
  const parsed = assignmentSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.message };

  const admin = createAdminClient();
  const { data: existing, error: fetchError } = await admin
    .from("employee_assignments")
    .select("id, employee_id, employees(employee_code, full_name_en)")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (fetchError || !existing) return { success: false, error: "Assignment not found" };

  const { error } = await admin
    .from("employee_assignments")
    .update({ ...parsed.data, updated_by: ctx.profile?.id })
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  const emp = existing.employees as unknown as { employee_code: string; full_name_en: string } | null;
  await logAudit({
    module_code: "HR",
    entity_name: "employee_assignments",
    entity_id: id,
    entity_reference: `${emp?.employee_code ?? ""}-assignment`,
    action: "assignment_updated",
    new_values: {
      parent_employee_id: existing.employee_id,
      employee_code: emp?.employee_code,
      employee_name: emp?.full_name_en,
      related_record_type: "employee_assignment",
    },
  });
  revalidatePath(`/admin/hr/employees/${existing.employee_id}`);
  return { success: true, data: { id } };
}

export async function archiveEmployeeAssignment(id: number): Promise<ActionResult<undefined>> {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.manage")) {
    return { success: false, error: "Unauthorized" };
  }
  const admin = createAdminClient();
  const { data: existing, error: fetchError } = await admin
    .from("employee_assignments")
    .select("id, employee_id, employees(employee_code, full_name_en)")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (fetchError || !existing) return { success: false, error: "Assignment not found" };

  const { error } = await admin
    .from("employee_assignments")
    .update({ deleted_at: new Date().toISOString(), deleted_by: ctx.profile?.id })
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  const emp = existing.employees as unknown as { employee_code: string; full_name_en: string } | null;
  await logAudit({
    module_code: "HR",
    entity_name: "employee_assignments",
    entity_id: id,
    entity_reference: `${emp?.employee_code ?? ""}-assignment`,
    action: "assignment_archived",
    new_values: {
      parent_employee_id: existing.employee_id,
      employee_code: emp?.employee_code,
      employee_name: emp?.full_name_en,
      related_record_type: "employee_assignment",
    },
  });
  revalidatePath(`/admin/hr/employees/${existing.employee_id}`);
  return { success: true, data: undefined };
}

// ══════════════════════════════════════════════════════════════════════
// ROLE REQUIREMENTS
// ══════════════════════════════════════════════════════════════════════

export async function listEmployeeRoleRequirements(
  employeeId: number,
  params?: { status?: string }
): Promise<ActionResult<unknown[]>> {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.view")) {
    return { success: false, error: "Unauthorized" };
  }
  const supabase = await createClient();
  let query = supabase
    .from("employee_role_requirements")
    .select(
      `id, requirement_type, requirement_name, is_required, is_met, status,
       expiry_date, waived_at, waiver_reason, met_record_type, met_record_id,
       created_at, updated_at,
       designations(id, name_en)`
    )
    .eq("employee_id", employeeId)
    .is("deleted_at", null)
    .order("requirement_type");

  if (params?.status) query = query.eq("status", params.status);

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data: data ?? [] };
}

export async function createEmployeeRoleRequirement(
  employeeId: number,
  input: unknown
): Promise<ActionResult<{ id: number }>> {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.manage")) {
    return { success: false, error: "Unauthorized" };
  }
  const parsed = roleRequirementSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.message };

  const emp = await getEmployeeContext(employeeId);
  if (!emp) return { success: false, error: "Employee not found" };

  const admin = createAdminClient();
  const { data: inserted, error } = await admin
    .from("employee_role_requirements")
    .insert({ employee_id: employeeId, ...parsed.data, created_by: ctx.profile?.id })
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };

  await logAudit({
    module_code: "HR",
    entity_name: "employee_role_requirements",
    entity_id: inserted.id,
    entity_reference: `${emp.employee_code}-role-req`,
    action: "role_requirement_created",
    new_values: {
      parent_employee_id: employeeId,
      employee_code: emp.employee_code,
      employee_name: emp.full_name_en,
      related_record_type: "employee_role_requirement",
    },
  });
  revalidatePath(`/admin/hr/employees/${employeeId}`);
  return { success: true, data: { id: inserted.id } };
}

export async function updateEmployeeRoleRequirement(
  id: number,
  input: unknown
): Promise<ActionResult<{ id: number }>> {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.manage")) {
    return { success: false, error: "Unauthorized" };
  }
  const parsed = roleRequirementSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.message };

  const admin = createAdminClient();
  const { data: existing, error: fetchError } = await admin
    .from("employee_role_requirements")
    .select("id, employee_id, employees(employee_code, full_name_en)")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (fetchError || !existing) return { success: false, error: "Requirement not found" };

  const { error } = await admin
    .from("employee_role_requirements")
    .update({ ...parsed.data, updated_by: ctx.profile?.id })
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  const emp = existing.employees as unknown as { employee_code: string; full_name_en: string } | null;
  await logAudit({
    module_code: "HR",
    entity_name: "employee_role_requirements",
    entity_id: id,
    entity_reference: `${emp?.employee_code ?? ""}-role-req`,
    action: "role_requirement_updated",
    new_values: {
      parent_employee_id: existing.employee_id,
      employee_code: emp?.employee_code,
      employee_name: emp?.full_name_en,
      related_record_type: "employee_role_requirement",
    },
  });
  revalidatePath(`/admin/hr/employees/${existing.employee_id}`);
  return { success: true, data: { id } };
}

export async function archiveEmployeeRoleRequirement(id: number): Promise<ActionResult<undefined>> {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.manage")) {
    return { success: false, error: "Unauthorized" };
  }
  const admin = createAdminClient();
  const { data: existing, error: fetchError } = await admin
    .from("employee_role_requirements")
    .select("id, employee_id, employees(employee_code, full_name_en)")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (fetchError || !existing) return { success: false, error: "Requirement not found" };

  const { error } = await admin
    .from("employee_role_requirements")
    .update({ deleted_at: new Date().toISOString(), deleted_by: ctx.profile?.id })
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  const emp = existing.employees as unknown as { employee_code: string; full_name_en: string } | null;
  await logAudit({
    module_code: "HR",
    entity_name: "employee_role_requirements",
    entity_id: id,
    entity_reference: `${emp?.employee_code ?? ""}-role-req`,
    action: "role_requirement_archived",
    new_values: {
      parent_employee_id: existing.employee_id,
      employee_code: emp?.employee_code,
      employee_name: emp?.full_name_en,
      related_record_type: "employee_role_requirement",
    },
  });
  revalidatePath(`/admin/hr/employees/${existing.employee_id}`);
  return { success: true, data: undefined };
}

export async function waiveEmployeeRoleRequirement(
  id: number,
  reason: string
): Promise<ActionResult<undefined>> {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.manage")) {
    return { success: false, error: "Unauthorized" };
  }
  if (!reason?.trim()) return { success: false, error: "Waiver reason is required" };

  const admin = createAdminClient();
  const { data: existing, error: fetchError } = await admin
    .from("employee_role_requirements")
    .select("id, employee_id, requirement_name, employees(employee_code, full_name_en)")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (fetchError || !existing) return { success: false, error: "Requirement not found" };

  const { error } = await admin
    .from("employee_role_requirements")
    .update({
      status: "waived",
      is_met: true,
      waived_by: ctx.profile?.id,
      waived_at: new Date().toISOString(),
      waiver_reason: reason,
      updated_by: ctx.profile?.id,
    })
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  const emp = existing.employees as unknown as { employee_code: string; full_name_en: string } | null;
  await logAudit({
    module_code: "HR",
    entity_name: "employee_role_requirements",
    entity_id: id,
    entity_reference: `${emp?.employee_code ?? ""}-role-req-waiver`,
    action: "role_requirement_waived",
    new_values: {
      parent_employee_id: existing.employee_id,
      employee_code: emp?.employee_code,
      employee_name: emp?.full_name_en,
      related_record_type: "employee_role_requirement",
      waiver_reason: reason,
    },
  });
  revalidatePath(`/admin/hr/employees/${existing.employee_id}`);
  return { success: true, data: undefined };
}

export async function recalculateEmployeeRoleRequirements(
  employeeId: number
): Promise<ActionResult<undefined>> {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.manage")) {
    return { success: false, error: "Unauthorized" };
  }
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: reqs } = await supabase
    .from("employee_role_requirements")
    .select("id, status, expiry_date, is_met")
    .eq("employee_id", employeeId)
    .is("deleted_at", null);

  if (!reqs) return { success: true, data: undefined };

  const admin = createAdminClient();
  for (const req of reqs) {
    let newStatus = req.status;
    if (req.status === "waived") continue;
    if (req.expiry_date && req.expiry_date < today) {
      newStatus = "expired";
    } else if (req.is_met) {
      newStatus = "met";
    }
    if (newStatus !== req.status) {
      await admin.from("employee_role_requirements").update({ status: newStatus }).eq("id", req.id);
    }
  }

  revalidatePath(`/admin/hr/employees/${employeeId}`);
  return { success: true, data: undefined };
}

// ══════════════════════════════════════════════════════════════════════
// SITE READINESS
// ══════════════════════════════════════════════════════════════════════

export async function listEmployeeSiteReadiness(employeeId: number): Promise<ActionResult<unknown[]>> {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.view")) {
    return { success: false, error: "Unauthorized" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_site_readiness")
    .select(
      `id, readiness_status, checked_at, notes, missing_requirements_json,
       work_sites(id, name_en),
       hr_access_card_types(id, name_en)`
    )
    .eq("employee_id", employeeId)
    .is("deleted_at", null)
    .order("checked_at", { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, data: data ?? [] };
}

export async function listGlobalSiteReadiness(params?: {
  status?: string;
  work_site_id?: number;
  limit?: number;
  offset?: number;
}): Promise<ActionResult<{ data: unknown[]; count: number }>> {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.view")) {
    return { success: false, error: "Unauthorized" };
  }
  const supabase = await createClient();
  let query = supabase
    .from("employee_site_readiness")
    .select(
      `id, readiness_status, checked_at,
       employees(id, full_name_en, employee_code),
       work_sites(id, name_en)`,
      { count: "exact" }
    )
    .is("deleted_at", null)
    .order("checked_at", { ascending: false });

  if (params?.status) query = query.eq("readiness_status", params.status);
  if (params?.work_site_id) query = query.eq("work_site_id", params.work_site_id);

  const limit = params?.limit ?? 50;
  const offset = params?.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data: { data: data ?? [], count: count ?? 0 } };
}

export async function recalculateEmployeeSiteReadiness(
  employeeId: number,
  workSiteId: number
): Promise<ActionResult<{ status: string; missingCount: number }>> {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.manage")) {
    return { success: false, error: "Unauthorized" };
  }

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [empResult, blocksResult, identityResult, accessResult, medicalResult, insuranceResult, trainingResult] =
    await Promise.all([
      supabase
        .from("employees")
        .select("id, employee_code, full_name_en")
        .eq("id", employeeId)
        .single(),
      supabase
        .from("employee_operational_blocks")
        .select("id, block_status, effective_from, effective_to")
        .eq("employee_id", employeeId)
        .eq("block_status", "active")
        .is("deleted_at", null),
      supabase
        .from("employee_identity_documents")
        .select("id, expiry_date")
        .eq("employee_id", employeeId)
        .is("deleted_at", null)
        .limit(1),
      supabase
        .from("employee_access_cards")
        .select("id, expiry_date, work_site_id")
        .eq("employee_id", employeeId)
        .is("deleted_at", null)
        .eq("work_site_id", workSiteId)
        .limit(1),
      supabase
        .from("employee_medical_records")
        .select("id, expiry_date, record_type")
        .eq("employee_id", employeeId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1),
      supabase
        .from("employee_medical_insurances")
        .select("id, expiry_date")
        .eq("employee_id", employeeId)
        .is("deleted_at", null)
        .limit(1),
      supabase
        .from("employee_training_certificates")
        .select("id, expiry_date, training_type_id")
        .eq("employee_id", employeeId)
        .is("deleted_at", null),
    ]);

  const emp = empResult.data;
  if (!emp) return { success: false, error: "Employee not found" };

  const activeBlocks = (blocksResult.data ?? []).filter(isActiveBlock);
  const identityDoc = identityResult.data?.[0];
  const accessCard = accessResult.data?.[0];
  const medicalRecord = medicalResult.data?.[0];
  const insurance = insuranceResult.data?.[0];
  const trainings = trainingResult.data ?? [];

  const readinessInput = {
    employeeId,
    hasCurrentAssignment: true,
    activeBlockCount: activeBlocks.length,
    hasValidIdentityDoc: !!identityDoc,
    identityDocExpired: identityDoc ? (identityDoc.expiry_date ? identityDoc.expiry_date < today : false) : false,
    requiredAccessCardTypeId: null,
    hasValidAccessCard: !!accessCard,
    accessCardExpired: accessCard ? (accessCard.expiry_date ? accessCard.expiry_date < today : false) : false,
    hasMedicalFitness: !!medicalRecord,
    medicalFitnessExpired: medicalRecord
      ? (medicalRecord.expiry_date ? medicalRecord.expiry_date < today : false)
      : false,
    medicalRestricted: false,
    hasValidInsurance: !!insurance,
    insuranceExpired: insurance ? (insurance.expiry_date ? insurance.expiry_date < today : false) : false,
    trainingRequirements: trainings.map((t) => ({
      met: true,
      expired: t.expiry_date ? t.expiry_date < today : false,
      required: false,
      name: "Training",
    })),
    roleRequirementsMissingCritical: 0,
    roleRequirementsExpired: 0,
  };

  const result = calculateEmployeeReadiness(readinessInput);

  const admin = createAdminClient();
  await admin.from("employee_site_readiness").upsert(
    {
      employee_id: employeeId,
      work_site_id: workSiteId,
      readiness_status: result.status,
      missing_requirements_json: result.missingRequirements.length > 0 ? result.missingRequirements : null,
      checked_at: new Date().toISOString(),
      checked_by: ctx.profile?.id,
      updated_by: ctx.profile?.id,
    },
    { onConflict: "employee_id,work_site_id" }
  );

  await logAudit({
    module_code: "HR",
    entity_name: "employee_site_readiness",
    entity_id: employeeId,
    entity_reference: `${emp.employee_code}-readiness-site-${workSiteId}`,
    action: "site_readiness_recalculated",
    new_values: {
      parent_employee_id: employeeId,
      employee_code: emp.employee_code,
      employee_name: emp.full_name_en,
      related_record_type: "employee_site_readiness",
      readiness_status: result.status,
    },
  });
  revalidatePath(`/admin/hr/employees/${employeeId}`);
  return { success: true, data: { status: result.status, missingCount: result.missingRequirements.length } };
}

export async function recalculateAllEmployeeSiteReadiness(
  employeeId: number
): Promise<ActionResult<undefined>> {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.manage")) {
    return { success: false, error: "Unauthorized" };
  }
  const supabase = await createClient();
  const { data: sites } = await supabase
    .from("employee_site_readiness")
    .select("work_site_id")
    .eq("employee_id", employeeId)
    .is("deleted_at", null);

  for (const row of sites ?? []) {
    await recalculateEmployeeSiteReadiness(employeeId, row.work_site_id);
  }
  return { success: true, data: undefined };
}

export async function updateEmployeeSiteReadinessNotes(
  id: number,
  notes: string
): Promise<ActionResult<undefined>> {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.manage")) {
    return { success: false, error: "Unauthorized" };
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("employee_site_readiness")
    .update({ notes, updated_by: ctx.profile?.id })
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  return { success: true, data: undefined };
}

// ══════════════════════════════════════════════════════════════════════
// OPERATIONAL BLOCKS
// ══════════════════════════════════════════════════════════════════════

export async function listEmployeeOperationalBlocks(
  employeeId: number,
  params?: { status?: string }
): Promise<ActionResult<unknown[]>> {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.view")) {
    return { success: false, error: "Unauthorized" };
  }
  const supabase = await createClient();
  let query = supabase
    .from("employee_operational_blocks")
    .select(
      `id, block_type, block_reason, block_status, effective_from, effective_to,
       released_at, release_reason, related_record_type, notes, created_at`
    )
    .eq("employee_id", employeeId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (params?.status) query = query.eq("block_status", params.status);

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data: data ?? [] };
}

export async function getEmployeeActiveOperationalBlocks(employeeId: number): Promise<ActionResult<unknown[]>> {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.view")) {
    return { success: false, error: "Unauthorized" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_operational_blocks")
    .select("id, block_type, block_reason, block_status, effective_from, effective_to")
    .eq("employee_id", employeeId)
    .eq("block_status", "active")
    .is("deleted_at", null);

  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []).filter(isActiveBlock) };
}

export async function listGlobalOperationalBlocks(params?: {
  status?: string;
  block_type?: string;
  limit?: number;
  offset?: number;
}): Promise<ActionResult<{ data: unknown[]; count: number }>> {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.view")) {
    return { success: false, error: "Unauthorized" };
  }
  const supabase = await createClient();
  let query = supabase
    .from("employee_operational_blocks")
    .select(
      `id, block_type, block_reason, block_status, effective_from, effective_to, created_at,
       employees(id, full_name_en, employee_code)`,
      { count: "exact" }
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (params?.status) query = query.eq("block_status", params.status);
  if (params?.block_type) query = query.eq("block_type", params.block_type);

  const limit = params?.limit ?? 50;
  const offset = params?.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data: { data: data ?? [], count: count ?? 0 } };
}

export async function createEmployeeOperationalBlock(
  employeeId: number,
  input: unknown
): Promise<ActionResult<{ id: number }>> {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.manage")) {
    return { success: false, error: "Unauthorized" };
  }
  const parsed = operationalBlockSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.message };

  const emp = await getEmployeeContext(employeeId);
  if (!emp) return { success: false, error: "Employee not found" };

  const admin = createAdminClient();
  const { data: inserted, error } = await admin
    .from("employee_operational_blocks")
    .insert({ employee_id: employeeId, ...parsed.data, created_by: ctx.profile?.id })
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };

  await logAudit({
    module_code: "HR",
    entity_name: "employee_operational_blocks",
    entity_id: inserted.id,
    entity_reference: `${emp.employee_code}-op-block`,
    action: "operational_block_created",
    new_values: {
      parent_employee_id: employeeId,
      employee_code: emp.employee_code,
      employee_name: emp.full_name_en,
      related_record_type: "employee_operational_block",
    },
  });
  revalidatePath(`/admin/hr/employees/${employeeId}`);
  return { success: true, data: { id: inserted.id } };
}

export async function releaseEmployeeOperationalBlock(
  id: number,
  releaseReason: string
): Promise<ActionResult<undefined>> {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.manage")) {
    return { success: false, error: "Unauthorized" };
  }
  if (!releaseReason?.trim()) return { success: false, error: "Release reason is required" };

  const admin = createAdminClient();
  const { data: existing, error: fetchError } = await admin
    .from("employee_operational_blocks")
    .select("id, employee_id, employees(employee_code, full_name_en)")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (fetchError || !existing) return { success: false, error: "Block not found" };

  const { error } = await admin
    .from("employee_operational_blocks")
    .update({
      block_status: "released",
      released_by: ctx.profile?.id,
      released_at: new Date().toISOString(),
      release_reason: releaseReason,
      updated_by: ctx.profile?.id,
    })
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  const emp = existing.employees as unknown as { employee_code: string; full_name_en: string } | null;
  await logAudit({
    module_code: "HR",
    entity_name: "employee_operational_blocks",
    entity_id: id,
    entity_reference: `${emp?.employee_code ?? ""}-op-block`,
    action: "operational_block_released",
    new_values: {
      parent_employee_id: existing.employee_id,
      employee_code: emp?.employee_code,
      employee_name: emp?.full_name_en,
      related_record_type: "employee_operational_block",
      release_reason: releaseReason,
    },
  });
  revalidatePath(`/admin/hr/employees/${existing.employee_id}`);
  return { success: true, data: undefined };
}

export async function archiveEmployeeOperationalBlock(id: number): Promise<ActionResult<undefined>> {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.manage")) {
    return { success: false, error: "Unauthorized" };
  }
  const admin = createAdminClient();
  const { data: existing, error: fetchError } = await admin
    .from("employee_operational_blocks")
    .select("id, employee_id, employees(employee_code, full_name_en)")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (fetchError || !existing) return { success: false, error: "Block not found" };

  const { error } = await admin
    .from("employee_operational_blocks")
    .update({ deleted_at: new Date().toISOString(), deleted_by: ctx.profile?.id })
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  const emp = existing.employees as unknown as { employee_code: string; full_name_en: string } | null;
  await logAudit({
    module_code: "HR",
    entity_name: "employee_operational_blocks",
    entity_id: id,
    entity_reference: `${emp?.employee_code ?? ""}-op-block`,
    action: "operational_block_archived",
    new_values: {
      parent_employee_id: existing.employee_id,
      employee_code: emp?.employee_code,
      employee_name: emp?.full_name_en,
      related_record_type: "employee_operational_block",
    },
  });
  revalidatePath(`/admin/hr/employees/${existing.employee_id}`);
  return { success: true, data: undefined };
}

// ══════════════════════════════════════════════════════════════════════
// ASSETS
// ══════════════════════════════════════════════════════════════════════

export async function listEmployeeAssets(
  employeeId: number,
  params?: { status?: string }
): Promise<ActionResult<unknown[]>> {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.view")) {
    return { success: false, error: "Unauthorized" };
  }
  const supabase = await createClient();
  let query = supabase
    .from("employee_assets")
    .select(
      `id, asset_type, asset_reference, asset_description, issued_date,
       return_due_date, returned_date, status, condition_on_issue, condition_on_return, notes, created_at`
    )
    .eq("employee_id", employeeId)
    .is("deleted_at", null)
    .order("issued_date", { ascending: false });

  if (params?.status) query = query.eq("status", params.status);
  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data: data ?? [] };
}

export async function createEmployeeAsset(
  employeeId: number,
  input: unknown
): Promise<ActionResult<{ id: number }>> {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.manage")) {
    return { success: false, error: "Unauthorized" };
  }
  const parsed = assetSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.message };

  const emp = await getEmployeeContext(employeeId);
  if (!emp) return { success: false, error: "Employee not found" };

  const admin = createAdminClient();
  const { data: inserted, error } = await admin
    .from("employee_assets")
    .insert({ employee_id: employeeId, ...parsed.data, created_by: ctx.profile?.id })
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };

  await logAudit({
    module_code: "HR",
    entity_name: "employee_assets",
    entity_id: inserted.id,
    entity_reference: `${emp.employee_code}-asset`,
    action: "asset_created",
    new_values: {
      parent_employee_id: employeeId,
      employee_code: emp.employee_code,
      employee_name: emp.full_name_en,
      related_record_type: "employee_asset",
    },
  });
  revalidatePath(`/admin/hr/employees/${employeeId}`);
  return { success: true, data: { id: inserted.id } };
}

export async function updateEmployeeAsset(
  id: number,
  input: unknown
): Promise<ActionResult<{ id: number }>> {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.manage")) {
    return { success: false, error: "Unauthorized" };
  }
  const parsed = assetSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.message };

  const admin = createAdminClient();
  const { data: existing, error: fetchError } = await admin
    .from("employee_assets")
    .select("id, employee_id, employees(employee_code, full_name_en)")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (fetchError || !existing) return { success: false, error: "Asset not found" };

  const { error } = await admin
    .from("employee_assets")
    .update({ ...parsed.data, updated_by: ctx.profile?.id })
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  const emp = existing.employees as unknown as { employee_code: string; full_name_en: string } | null;
  await logAudit({
    module_code: "HR",
    entity_name: "employee_assets",
    entity_id: id,
    entity_reference: `${emp?.employee_code ?? ""}-asset`,
    action: "asset_updated",
    new_values: {
      parent_employee_id: existing.employee_id,
      employee_code: emp?.employee_code,
      employee_name: emp?.full_name_en,
      related_record_type: "employee_asset",
    },
  });
  revalidatePath(`/admin/hr/employees/${existing.employee_id}`);
  return { success: true, data: { id } };
}

export async function returnEmployeeAsset(
  id: number,
  input: { returned_date: string; condition_on_return?: string }
): Promise<ActionResult<undefined>> {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.manage")) {
    return { success: false, error: "Unauthorized" };
  }
  const admin = createAdminClient();
  const { data: existing, error: fetchError } = await admin
    .from("employee_assets")
    .select("id, employee_id, employees(employee_code, full_name_en)")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (fetchError || !existing) return { success: false, error: "Asset not found" };

  const { error } = await admin
    .from("employee_assets")
    .update({
      status: "returned",
      returned_date: input.returned_date,
      condition_on_return: input.condition_on_return ?? null,
      updated_by: ctx.profile?.id,
    })
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  const emp = existing.employees as unknown as { employee_code: string; full_name_en: string } | null;
  await logAudit({
    module_code: "HR",
    entity_name: "employee_assets",
    entity_id: id,
    entity_reference: `${emp?.employee_code ?? ""}-asset-return`,
    action: "asset_returned",
    new_values: {
      parent_employee_id: existing.employee_id,
      employee_code: emp?.employee_code,
      employee_name: emp?.full_name_en,
      related_record_type: "employee_asset",
    },
  });
  revalidatePath(`/admin/hr/employees/${existing.employee_id}`);
  return { success: true, data: undefined };
}

export async function archiveEmployeeAsset(id: number): Promise<ActionResult<undefined>> {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.manage")) {
    return { success: false, error: "Unauthorized" };
  }
  const admin = createAdminClient();
  const { data: existing, error: fetchError } = await admin
    .from("employee_assets")
    .select("id, employee_id, employees(employee_code, full_name_en)")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (fetchError || !existing) return { success: false, error: "Asset not found" };

  const { error } = await admin
    .from("employee_assets")
    .update({ deleted_at: new Date().toISOString(), deleted_by: ctx.profile?.id })
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  const emp = existing.employees as unknown as { employee_code: string; full_name_en: string } | null;
  await logAudit({
    module_code: "HR",
    entity_name: "employee_assets",
    entity_id: id,
    entity_reference: `${emp?.employee_code ?? ""}-asset`,
    action: "asset_archived",
    new_values: {
      parent_employee_id: existing.employee_id,
      employee_code: emp?.employee_code,
      employee_name: emp?.full_name_en,
      related_record_type: "employee_asset",
    },
  });
  revalidatePath(`/admin/hr/employees/${existing.employee_id}`);
  return { success: true, data: undefined };
}

// ══════════════════════════════════════════════════════════════════════
// PPE ISSUES
// ══════════════════════════════════════════════════════════════════════

export async function listEmployeePpeIssues(
  employeeId: number,
  params?: { status?: string }
): Promise<ActionResult<unknown[]>> {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.view")) {
    return { success: false, error: "Unauthorized" };
  }
  const supabase = await createClient();
  let query = supabase
    .from("employee_ppe_issues")
    .select(
      `id, ppe_item, standard_or_size, quantity, issued_date,
       expiry_or_replacement_date, returned_date, status, notes, created_at`
    )
    .eq("employee_id", employeeId)
    .is("deleted_at", null)
    .order("issued_date", { ascending: false });

  if (params?.status) query = query.eq("status", params.status);
  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data: data ?? [] };
}

export async function createEmployeePpeIssue(
  employeeId: number,
  input: unknown
): Promise<ActionResult<{ id: number }>> {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.manage")) {
    return { success: false, error: "Unauthorized" };
  }
  const parsed = ppeIssueSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.message };

  const emp = await getEmployeeContext(employeeId);
  if (!emp) return { success: false, error: "Employee not found" };

  const admin = createAdminClient();
  const { data: inserted, error } = await admin
    .from("employee_ppe_issues")
    .insert({ employee_id: employeeId, ...parsed.data, issued_by: ctx.profile?.id, created_by: ctx.profile?.id })
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };

  await logAudit({
    module_code: "HR",
    entity_name: "employee_ppe_issues",
    entity_id: inserted.id,
    entity_reference: `${emp.employee_code}-ppe`,
    action: "ppe_issued",
    new_values: {
      parent_employee_id: employeeId,
      employee_code: emp.employee_code,
      employee_name: emp.full_name_en,
      related_record_type: "employee_ppe_issue",
    },
  });
  revalidatePath(`/admin/hr/employees/${employeeId}`);
  return { success: true, data: { id: inserted.id } };
}

export async function updateEmployeePpeIssue(
  id: number,
  input: unknown
): Promise<ActionResult<{ id: number }>> {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.manage")) {
    return { success: false, error: "Unauthorized" };
  }
  const parsed = ppeIssueSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.message };

  const admin = createAdminClient();
  const { data: existing, error: fetchError } = await admin
    .from("employee_ppe_issues")
    .select("id, employee_id, employees(employee_code, full_name_en)")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (fetchError || !existing) return { success: false, error: "PPE issue not found" };

  const { error } = await admin
    .from("employee_ppe_issues")
    .update({ ...parsed.data, updated_by: ctx.profile?.id })
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  const emp = existing.employees as unknown as { employee_code: string; full_name_en: string } | null;
  await logAudit({
    module_code: "HR",
    entity_name: "employee_ppe_issues",
    entity_id: id,
    entity_reference: `${emp?.employee_code ?? ""}-ppe`,
    action: "ppe_updated",
    new_values: {
      parent_employee_id: existing.employee_id,
      employee_code: emp?.employee_code,
      employee_name: emp?.full_name_en,
      related_record_type: "employee_ppe_issue",
    },
  });
  revalidatePath(`/admin/hr/employees/${existing.employee_id}`);
  return { success: true, data: { id } };
}

export async function returnEmployeePpeIssue(
  id: number,
  input: { returned_date: string }
): Promise<ActionResult<undefined>> {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.manage")) {
    return { success: false, error: "Unauthorized" };
  }
  const admin = createAdminClient();
  const { data: existing, error: fetchError } = await admin
    .from("employee_ppe_issues")
    .select("id, employee_id, employees(employee_code, full_name_en)")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (fetchError || !existing) return { success: false, error: "PPE issue not found" };

  const { error } = await admin
    .from("employee_ppe_issues")
    .update({ status: "returned", returned_date: input.returned_date, updated_by: ctx.profile?.id })
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  const emp = existing.employees as unknown as { employee_code: string; full_name_en: string } | null;
  await logAudit({
    module_code: "HR",
    entity_name: "employee_ppe_issues",
    entity_id: id,
    entity_reference: `${emp?.employee_code ?? ""}-ppe-return`,
    action: "ppe_returned",
    new_values: {
      parent_employee_id: existing.employee_id,
      employee_code: emp?.employee_code,
      employee_name: emp?.full_name_en,
      related_record_type: "employee_ppe_issue",
    },
  });
  revalidatePath(`/admin/hr/employees/${existing.employee_id}`);
  return { success: true, data: undefined };
}

export async function archiveEmployeePpeIssue(id: number): Promise<ActionResult<undefined>> {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.manage")) {
    return { success: false, error: "Unauthorized" };
  }
  const admin = createAdminClient();
  const { data: existing, error: fetchError } = await admin
    .from("employee_ppe_issues")
    .select("id, employee_id, employees(employee_code, full_name_en)")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (fetchError || !existing) return { success: false, error: "PPE issue not found" };

  const { error } = await admin
    .from("employee_ppe_issues")
    .update({ deleted_at: new Date().toISOString(), deleted_by: ctx.profile?.id })
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  const emp = existing.employees as unknown as { employee_code: string; full_name_en: string } | null;
  await logAudit({
    module_code: "HR",
    entity_name: "employee_ppe_issues",
    entity_id: id,
    entity_reference: `${emp?.employee_code ?? ""}-ppe`,
    action: "ppe_archived",
    new_values: {
      parent_employee_id: existing.employee_id,
      employee_code: emp?.employee_code,
      employee_name: emp?.full_name_en,
      related_record_type: "employee_ppe_issue",
    },
  });
  revalidatePath(`/admin/hr/employees/${existing.employee_id}`);
  return { success: true, data: undefined };
}

// ══════════════════════════════════════════════════════════════════════
// ACCOMMODATION
// ══════════════════════════════════════════════════════════════════════

export async function listEmployeeAccommodationRecords(
  employeeId: number,
  params?: { status?: string }
): Promise<ActionResult<unknown[]>> {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.view")) {
    return { success: false, error: "Unauthorized" };
  }
  const supabase = await createClient();
  let query = supabase
    .from("employee_accommodation_records")
    .select(
      `id, accommodation_type, accommodation_location, room_or_bed_no,
       assigned_from, assigned_to, status, notes, created_at`
    )
    .eq("employee_id", employeeId)
    .is("deleted_at", null)
    .order("assigned_from", { ascending: false });

  if (params?.status) query = query.eq("status", params.status);
  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data: data ?? [] };
}

export async function createEmployeeAccommodationRecord(
  employeeId: number,
  input: unknown
): Promise<ActionResult<{ id: number }>> {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.manage")) {
    return { success: false, error: "Unauthorized" };
  }
  const parsed = accommodationSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.message };

  const emp = await getEmployeeContext(employeeId);
  if (!emp) return { success: false, error: "Employee not found" };

  const admin = createAdminClient();
  const { data: inserted, error } = await admin
    .from("employee_accommodation_records")
    .insert({ employee_id: employeeId, ...parsed.data, created_by: ctx.profile?.id })
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };

  await logAudit({
    module_code: "HR",
    entity_name: "employee_accommodation_records",
    entity_id: inserted.id,
    entity_reference: `${emp.employee_code}-accommodation`,
    action: "accommodation_created",
    new_values: {
      parent_employee_id: employeeId,
      employee_code: emp.employee_code,
      employee_name: emp.full_name_en,
      related_record_type: "employee_accommodation",
    },
  });
  revalidatePath(`/admin/hr/employees/${employeeId}`);
  return { success: true, data: { id: inserted.id } };
}

export async function updateEmployeeAccommodationRecord(
  id: number,
  input: unknown
): Promise<ActionResult<{ id: number }>> {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.manage")) {
    return { success: false, error: "Unauthorized" };
  }
  const parsed = accommodationSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.message };

  const admin = createAdminClient();
  const { data: existing, error: fetchError } = await admin
    .from("employee_accommodation_records")
    .select("id, employee_id, employees(employee_code, full_name_en)")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (fetchError || !existing) return { success: false, error: "Accommodation record not found" };

  const { error } = await admin
    .from("employee_accommodation_records")
    .update({ ...parsed.data, updated_by: ctx.profile?.id })
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  const emp = existing.employees as unknown as { employee_code: string; full_name_en: string } | null;
  await logAudit({
    module_code: "HR",
    entity_name: "employee_accommodation_records",
    entity_id: id,
    entity_reference: `${emp?.employee_code ?? ""}-accommodation`,
    action: "accommodation_updated",
    new_values: {
      parent_employee_id: existing.employee_id,
      employee_code: emp?.employee_code,
      employee_name: emp?.full_name_en,
      related_record_type: "employee_accommodation",
    },
  });
  revalidatePath(`/admin/hr/employees/${existing.employee_id}`);
  return { success: true, data: { id } };
}

export async function endEmployeeAccommodationRecord(
  id: number,
  input: { assigned_to: string }
): Promise<ActionResult<undefined>> {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.manage")) {
    return { success: false, error: "Unauthorized" };
  }
  const admin = createAdminClient();
  const { data: existing, error: fetchError } = await admin
    .from("employee_accommodation_records")
    .select("id, employee_id, employees(employee_code, full_name_en)")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (fetchError || !existing) return { success: false, error: "Accommodation record not found" };

  const { error } = await admin
    .from("employee_accommodation_records")
    .update({ status: "ended", assigned_to: input.assigned_to, updated_by: ctx.profile?.id })
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  const emp = existing.employees as unknown as { employee_code: string; full_name_en: string } | null;
  await logAudit({
    module_code: "HR",
    entity_name: "employee_accommodation_records",
    entity_id: id,
    entity_reference: `${emp?.employee_code ?? ""}-accommodation`,
    action: "accommodation_ended",
    new_values: {
      parent_employee_id: existing.employee_id,
      employee_code: emp?.employee_code,
      employee_name: emp?.full_name_en,
      related_record_type: "employee_accommodation",
    },
  });
  revalidatePath(`/admin/hr/employees/${existing.employee_id}`);
  return { success: true, data: undefined };
}

export async function archiveEmployeeAccommodationRecord(id: number): Promise<ActionResult<undefined>> {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.manage")) {
    return { success: false, error: "Unauthorized" };
  }
  const admin = createAdminClient();
  const { data: existing, error: fetchError } = await admin
    .from("employee_accommodation_records")
    .select("id, employee_id, employees(employee_code, full_name_en)")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (fetchError || !existing) return { success: false, error: "Accommodation record not found" };

  const { error } = await admin
    .from("employee_accommodation_records")
    .update({ deleted_at: new Date().toISOString(), deleted_by: ctx.profile?.id })
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  const emp = existing.employees as unknown as { employee_code: string; full_name_en: string } | null;
  await logAudit({
    module_code: "HR",
    entity_name: "employee_accommodation_records",
    entity_id: id,
    entity_reference: `${emp?.employee_code ?? ""}-accommodation`,
    action: "accommodation_archived",
    new_values: {
      parent_employee_id: existing.employee_id,
      employee_code: emp?.employee_code,
      employee_name: emp?.full_name_en,
      related_record_type: "employee_accommodation",
    },
  });
  revalidatePath(`/admin/hr/employees/${existing.employee_id}`);
  return { success: true, data: undefined };
}

// ══════════════════════════════════════════════════════════════════════
// SUMMARY
// ══════════════════════════════════════════════════════════════════════

export type EmployeeOperationsSummary = {
  currentAssignment: unknown | null;
  activeBlockCount: number;
  issuedAssetCount: number;
  issuedPpeCount: number;
  activeAccommodation: unknown | null;
  siteReadinessRecords: unknown[];
};

export async function getEmployeeOperationsSummary(
  employeeId: number
): Promise<ActionResult<EmployeeOperationsSummary>> {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.view")) {
    return { success: false, error: "Unauthorized" };
  }

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [assignmentResult, blocksResult, assetsResult, ppeResult, accommodationResult, readinessResult] =
    await Promise.all([
      supabase
        .from("employee_assignments")
        .select(`id, assignment_type, assignment_status, effective_from, effective_to, departments(name_en), designations(name_en), work_sites(name_en)`)
        .eq("employee_id", employeeId)
        .eq("assignment_status", "active")
        .is("deleted_at", null)
        .lte("effective_from", today)
        .or(`effective_to.is.null,effective_to.gte.${today}`)
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("employee_operational_blocks")
        .select("id, block_status, effective_from, effective_to")
        .eq("employee_id", employeeId)
        .eq("block_status", "active")
        .is("deleted_at", null),
      supabase
        .from("employee_assets")
        .select("id", { count: "exact", head: true })
        .eq("employee_id", employeeId)
        .eq("status", "issued")
        .is("deleted_at", null),
      supabase
        .from("employee_ppe_issues")
        .select("id", { count: "exact", head: true })
        .eq("employee_id", employeeId)
        .eq("status", "issued")
        .is("deleted_at", null),
      supabase
        .from("employee_accommodation_records")
        .select("id, accommodation_type, accommodation_location, room_or_bed_no, assigned_from, status")
        .eq("employee_id", employeeId)
        .eq("status", "active")
        .is("deleted_at", null)
        .order("assigned_from", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("employee_site_readiness")
        .select("id, readiness_status, work_sites(name_en), checked_at")
        .eq("employee_id", employeeId)
        .is("deleted_at", null)
        .order("checked_at", { ascending: false }),
    ]);

  const activeBlocks = (blocksResult.data ?? []).filter(isActiveBlock);

  return {
    success: true,
    data: {
      currentAssignment: assignmentResult.data,
      activeBlockCount: activeBlocks.length,
      issuedAssetCount: assetsResult.count ?? 0,
      issuedPpeCount: ppeResult.count ?? 0,
      activeAccommodation: accommodationResult.data,
      siteReadinessRecords: readinessResult.data ?? [],
    },
  };
}

export type EmployeeReadinessSummary = {
  overallStatus: string;
  siteReadinessRecords: unknown[];
  activeBlockCount: number;
  missingRequirements: unknown[];
};

export async function getEmployeeReadinessSummary(
  employeeId: number
): Promise<ActionResult<EmployeeReadinessSummary>> {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, "hr.assignments.view")) {
    return { success: false, error: "Unauthorized" };
  }

  const supabase = await createClient();

  const [blocksResult, readinessResult] = await Promise.all([
    supabase
      .from("employee_operational_blocks")
      .select("id, block_status, effective_from, effective_to")
      .eq("employee_id", employeeId)
      .eq("block_status", "active")
      .is("deleted_at", null),
    supabase
      .from("employee_site_readiness")
      .select("id, readiness_status, work_sites(name_en), checked_at, missing_requirements_json")
      .eq("employee_id", employeeId)
      .is("deleted_at", null)
      .order("checked_at", { ascending: false }),
  ]);

  const activeBlocks = (blocksResult.data ?? []).filter(isActiveBlock);
  const siteRecords = readinessResult.data ?? [];

  let overallStatus = "not_ready";
  if (activeBlocks.length > 0) {
    overallStatus = "blocked";
  } else if (siteRecords.length === 0) {
    overallStatus = "needs_review";
  } else if (siteRecords.every((r) => r.readiness_status === "ready")) {
    overallStatus = "ready";
  } else if (siteRecords.some((r) => r.readiness_status === "blocked" || r.readiness_status === "expired")) {
    overallStatus = "expired";
  } else if (siteRecords.some((r) => r.readiness_status === "not_ready")) {
    overallStatus = "not_ready";
  } else {
    overallStatus = "needs_review";
  }

  const allMissing = siteRecords
    .flatMap((r) => (r.missing_requirements_json as unknown[] | null) ?? [])
    .slice(0, 20);

  return {
    success: true,
    data: {
      overallStatus,
      siteReadinessRecords: siteRecords,
      activeBlockCount: activeBlocks.length,
      missingRequirements: allMissing,
    },
  };
}
