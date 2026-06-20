"use server";

import { createClient } from "@/lib/supabase/server";
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
// Row types
// ============================================================================

export type HrSettingsRow = {
  id: number;
  code: string;
  name_en: string;
  name_ar: string | null;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type HrGradeRow = HrSettingsRow & { grade_level: number | null };

export type HrIdentityDocTypeRow = HrSettingsRow & {
  requires_issue_date: boolean;
  requires_expiry_date: boolean;
  requires_document_number: boolean;
  default_expiry_alert_days: number;
  is_government_document: boolean;
  is_sensitive: boolean;
};

export type HrAccessCardTypeRow = HrSettingsRow & {
  default_expiry_alert_days: number;
  scope_type: string;
  requires_work_site: boolean;
  requires_client_authority: boolean;
};

export type HrTrainingTypeRow = HrSettingsRow & {
  training_category_id: number | null;
  default_validity_months: number | null;
  default_expiry_alert_days: number;
  requires_certificate_number: boolean;
  requires_provider: boolean;
  is_site_required: boolean;
  is_designation_required: boolean;
  training_category?: { id: number; name_en: string } | null;
};

export type HrMedicalRecordTypeRow = HrSettingsRow & {
  default_validity_months: number | null;
  default_expiry_alert_days: number;
  is_confidential: boolean;
  requires_dms_document: boolean;
};

export type HrLeaveTypeRow = HrSettingsRow & {
  is_paid: boolean;
  requires_document: boolean;
  requires_approval: boolean;
  default_entitlement_days: number | null;
  reset_basis: string;
  allow_half_day: boolean;
};

export type HrSalaryComponentTypeRow = HrSettingsRow & {
  component_kind: string;
  is_basic: boolean;
  is_wps_component: boolean;
  is_taxable: boolean;
};

export type HrPayrollGroupRow = HrSettingsRow & {
  pay_frequency: string;
  wps_applicable_default: boolean;
};

export type HrMohreEstablishmentRow = {
  id: number;
  owner_company_id: number;
  establishment_number: string;
  establishment_name: string;
  emirate_id: number | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  owner_company?: { id: number; legal_name_en: string } | null;
  emirate?: { id: number; name_en: string } | null;
};

export type HrProProcessTypeRow = HrSettingsRow & {
  default_due_days: number | null;
  default_expiry_alert_days: number;
  requires_dms_document: boolean;
};

export type HrReadinessRuleRow = {
  id: number;
  rule_code: string;
  rule_name_en: string;
  rule_name_ar: string | null;
  readiness_dimension: string;
  requirement_type: string;
  required_document_type_id: number | null;
  required_training_type_id: number | null;
  required_access_card_type_id: number | null;
  required_medical_record_type_id: number | null;
  applies_to_category_id: number | null;
  applies_to_designation_id: number | null;
  applies_to_work_site_id: number | null;
  is_critical: boolean;
  expiry_buffer_days: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type HrApprovalWorkflowRow = {
  id: number;
  workflow_code: string;
  workflow_name_en: string;
  workflow_name_ar: string | null;
  workflow_type: string;
  approval_step: number;
  approval_role_id: number | null;
  is_required: boolean;
  sla_hours: number | null;
  escalation_role_id: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  approval_role?: { id: number; role_name: string } | null;
};

// ============================================================================
// Auth helpers
// ============================================================================

type AuthCtx = Awaited<ReturnType<typeof getAuthContext>>;

function canView(ctx: AuthCtx): boolean {
  return (
    hasPermission(ctx, "hr.settings.view") ||
    hasPermission(ctx, "hr.settings.manage") ||
    hasPermission(ctx, "hr.admin") ||
    hasPermission(ctx, "hr.employees.view") ||
    hasPermission(ctx, "hr.compliance.view") ||
    hasPermission(ctx, "hr.payroll.view") ||
    hasPermission(ctx, "hr.leave.view") ||
    hasPermission(ctx, "hr.attendance.view") ||
    hasPermission(ctx, "hr.recruitment.view")
  );
}

function canManage(ctx: AuthCtx): boolean {
  return hasPermission(ctx, "hr.settings.manage") || hasPermission(ctx, "hr.admin");
}

const HR_PATH = "/admin/hr/settings";

// ============================================================================
// List params
// ============================================================================

export type HrSettingsListParams = {
  search?: string;
  is_active?: boolean;
  page?: number;
  page_size?: number;
};

// ============================================================================
// Schemas
// ============================================================================

const lookup = z.object({
  code: z.string().min(1).max(50),
  name_en: z.string().min(1).max(200),
  name_ar: z.string().max(200).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});

const gradeS = lookup.extend({ grade_level: z.number().int().min(1).optional().nullable() });

const idDocS = lookup.extend({
  requires_issue_date: z.boolean().default(true),
  requires_expiry_date: z.boolean().default(true),
  requires_document_number: z.boolean().default(true),
  default_expiry_alert_days: z.number().int().min(1).max(365).default(60),
  is_government_document: z.boolean().default(true),
  is_sensitive: z.boolean().default(true),
});

const accessCardS = lookup.extend({
  default_expiry_alert_days: z.number().int().min(1).max(365).default(60),
  scope_type: z.enum(["global", "site", "client", "configurable"]).default("configurable"),
  requires_work_site: z.boolean().default(false),
  requires_client_authority: z.boolean().default(true),
});

const trainingTypeS = lookup.extend({
  training_category_id: z.number().int().positive().optional().nullable(),
  default_validity_months: z.number().int().min(1).optional().nullable(),
  default_expiry_alert_days: z.number().int().min(1).max(365).default(60),
  requires_certificate_number: z.boolean().default(true),
  requires_provider: z.boolean().default(false),
  is_site_required: z.boolean().default(false),
  is_designation_required: z.boolean().default(false),
});

const medicalS = lookup.extend({
  default_validity_months: z.number().int().min(1).optional().nullable(),
  default_expiry_alert_days: z.number().int().min(1).max(365).default(60),
  is_confidential: z.boolean().default(true),
  requires_dms_document: z.boolean().default(true),
});

const leaveS = lookup.extend({
  is_paid: z.boolean().default(true),
  requires_document: z.boolean().default(false),
  requires_approval: z.boolean().default(true),
  default_entitlement_days: z.number().min(0).max(365).optional().nullable(),
  reset_basis: z.enum(["joining_anniversary", "calendar_year", "manual"]).default("joining_anniversary"),
  allow_half_day: z.boolean().default(true),
});

const salaryCompS = lookup.extend({
  component_kind: z.enum(["earning", "deduction", "info"]).default("earning"),
  is_basic: z.boolean().default(false),
  is_wps_component: z.boolean().default(true),
  is_taxable: z.boolean().default(false),
});

const payrollGroupS = lookup.extend({
  pay_frequency: z.enum(["monthly", "weekly", "biweekly", "manual"]).default("monthly"),
  wps_applicable_default: z.boolean().default(true),
});

const mohreS = z.object({
  owner_company_id: z.number().int().positive(),
  establishment_number: z.string().min(1).max(100),
  establishment_name: z.string().min(1).max(200),
  emirate_id: z.number().int().positive().optional().nullable(),
  status: z.enum(["active", "inactive"]).default("active"),
  notes: z.string().max(2000).optional().nullable(),
});

const proProcessS = lookup.extend({
  default_due_days: z.number().int().min(1).optional().nullable(),
  default_expiry_alert_days: z.number().int().min(1).max(365).default(60),
  requires_dms_document: z.boolean().default(false),
});

const readinessS = z.object({
  rule_code: z.string().min(1).max(100),
  rule_name_en: z.string().min(1).max(200),
  rule_name_ar: z.string().max(200).optional().nullable(),
  readiness_dimension: z.enum(["legal","medical","training","cicpa","adnoc","offshore","driver","insurance","general"]),
  requirement_type: z.enum(["identity_document","training","access_card","medical_record","insurance","custom"]),
  required_document_type_id: z.number().int().positive().optional().nullable(),
  required_training_type_id: z.number().int().positive().optional().nullable(),
  required_access_card_type_id: z.number().int().positive().optional().nullable(),
  required_medical_record_type_id: z.number().int().positive().optional().nullable(),
  applies_to_category_id: z.number().int().positive().optional().nullable(),
  applies_to_designation_id: z.number().int().positive().optional().nullable(),
  applies_to_work_site_id: z.number().int().positive().optional().nullable(),
  is_critical: z.boolean().default(true),
  expiry_buffer_days: z.number().int().min(1).max(365).default(60),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});

const approvalS = z.object({
  workflow_code: z.string().min(1).max(100),
  workflow_name_en: z.string().min(1).max(200),
  workflow_name_ar: z.string().max(200).optional().nullable(),
  workflow_type: z.enum(["leave","payroll_change","pro_process","eos","recruitment","general"]),
  approval_step: z.number().int().min(1).default(1),
  approval_role_id: z.number().int().positive().optional().nullable(),
  is_required: z.boolean().default(true),
  sla_hours: z.number().int().min(1).optional().nullable(),
  escalation_role_id: z.number().int().positive().optional().nullable(),
  is_active: z.boolean().default(true),
});

// ============================================================================
// Generic helpers
// ============================================================================

async function hrl<T>(
  table: string,
  params: HrSettingsListParams = {},
  joinSelect?: string
): Promise<ActionResult<{ data: T[]; total: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!canView(ctx)) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    const ps = params.page_size ?? 50;
    const from = ((params.page ?? 1) - 1) * ps;
    const to = from + ps - 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const sel = joinSelect ? `*, ${joinSelect}` : "*";
    let q = sb.from(table).select(sel).is("deleted_at", null).order("sort_order", { ascending: true }).order("name_en", { ascending: true }).range(from, to);
    if (params.search) q = q.ilike("name_en", `%${params.search}%`);
    if (params.is_active !== undefined) q = q.eq("is_active", params.is_active);
    let cq = sb.from(table).select("id", { count: "exact", head: true }).is("deleted_at", null);
    if (params.search) cq = cq.ilike("name_en", `%${params.search}%`);
    if (params.is_active !== undefined) cq = cq.eq("is_active", params.is_active);
    const [{ data, error }, { count, error: ce }] = await Promise.all([q, cq]);
    if (error || ce) return { success: false, error: (error ?? ce)?.message };
    return { success: true, data: { data: (data ?? []) as T[], total: count ?? 0 } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function hrc(table: string, values: Record<string, unknown>, codeRef: string, ctx: AuthCtx): Promise<ActionResult<{ id: number }>> {
  try {
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from(table).insert({ ...values, created_by: ctx.profile?.id, updated_by: ctx.profile?.id }).select("id").single();
    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "HR", entity_name: table, entity_id: data.id, entity_reference: codeRef, action: "create", new_values: values });
    revalidatePath(HR_PATH);
    return { success: true, data: { id: data.id } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function hru(table: string, id: number, values: Record<string, unknown>, ctx: AuthCtx): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from(table).update({ ...values, updated_by: ctx.profile?.id, updated_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null);
    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "HR", entity_name: table, entity_id: id, entity_reference: String(id), action: "update", new_values: values });
    revalidatePath(HR_PATH);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ============================================================================
// 1. Employee Categories
// ============================================================================

export async function listHrEmployeeCategories(p?: HrSettingsListParams) {
  return hrl<HrSettingsRow>("hr_employee_categories", p);
}
export async function createHrEmployeeCategory(input: z.infer<typeof lookup>): Promise<ActionResult<{ id: number }>> {
  const parsed = lookup.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues.map(i => i.message).join("; ") };
  const ctx = await getAuthContext();
  if (!canManage(ctx)) return { success: false, error: "Permission denied" };
  return hrc("hr_employee_categories", parsed.data, parsed.data.code, ctx);
}
export async function updateHrEmployeeCategory(id: number, input: Partial<z.infer<typeof lookup>>): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!canManage(ctx)) return { success: false, error: "Permission denied" };
  return hru("hr_employee_categories", id, input as Record<string, unknown>, ctx);
}

// ============================================================================
// 2. Employment Types
// ============================================================================

export async function listHrEmploymentTypes(p?: HrSettingsListParams) {
  return hrl<HrSettingsRow>("hr_employment_types", p);
}
export async function createHrEmploymentType(input: z.infer<typeof lookup>): Promise<ActionResult<{ id: number }>> {
  const parsed = lookup.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues.map(i => i.message).join("; ") };
  const ctx = await getAuthContext();
  if (!canManage(ctx)) return { success: false, error: "Permission denied" };
  return hrc("hr_employment_types", parsed.data, parsed.data.code, ctx);
}
export async function updateHrEmploymentType(id: number, input: Partial<z.infer<typeof lookup>>): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!canManage(ctx)) return { success: false, error: "Permission denied" };
  return hru("hr_employment_types", id, input as Record<string, unknown>, ctx);
}

// ============================================================================
// 3. Grades
// ============================================================================

export async function listHrGrades(p?: HrSettingsListParams) {
  return hrl<HrGradeRow>("hr_grades", p);
}
export async function createHrGrade(input: z.infer<typeof gradeS>): Promise<ActionResult<{ id: number }>> {
  const parsed = gradeS.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues.map(i => i.message).join("; ") };
  const ctx = await getAuthContext();
  if (!canManage(ctx)) return { success: false, error: "Permission denied" };
  return hrc("hr_grades", parsed.data, parsed.data.code, ctx);
}
export async function updateHrGrade(id: number, input: Partial<z.infer<typeof gradeS>>): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!canManage(ctx)) return { success: false, error: "Permission denied" };
  return hru("hr_grades", id, input as Record<string, unknown>, ctx);
}

// ============================================================================
// 4. Identity Document Types
// ============================================================================

export async function listHrIdentityDocumentTypes(p?: HrSettingsListParams) {
  return hrl<HrIdentityDocTypeRow>("hr_identity_document_types", p);
}
export async function createHrIdentityDocumentType(input: z.infer<typeof idDocS>): Promise<ActionResult<{ id: number }>> {
  const parsed = idDocS.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues.map(i => i.message).join("; ") };
  const ctx = await getAuthContext();
  if (!canManage(ctx)) return { success: false, error: "Permission denied" };
  return hrc("hr_identity_document_types", parsed.data, parsed.data.code, ctx);
}
export async function updateHrIdentityDocumentType(id: number, input: Partial<z.infer<typeof idDocS>>): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!canManage(ctx)) return { success: false, error: "Permission denied" };
  return hru("hr_identity_document_types", id, input as Record<string, unknown>, ctx);
}

// ============================================================================
// 5. Access Card Types
// ============================================================================

export async function listHrAccessCardTypes(p?: HrSettingsListParams) {
  return hrl<HrAccessCardTypeRow>("hr_access_card_types", p);
}
export async function createHrAccessCardType(input: z.infer<typeof accessCardS>): Promise<ActionResult<{ id: number }>> {
  const parsed = accessCardS.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues.map(i => i.message).join("; ") };
  const ctx = await getAuthContext();
  if (!canManage(ctx)) return { success: false, error: "Permission denied" };
  return hrc("hr_access_card_types", parsed.data, parsed.data.code, ctx);
}
export async function updateHrAccessCardType(id: number, input: Partial<z.infer<typeof accessCardS>>): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!canManage(ctx)) return { success: false, error: "Permission denied" };
  return hru("hr_access_card_types", id, input as Record<string, unknown>, ctx);
}

// ============================================================================
// 6. Training Categories
// ============================================================================

export async function listHrTrainingCategories(p?: HrSettingsListParams) {
  return hrl<HrSettingsRow>("hr_training_categories", p);
}
export async function createHrTrainingCategory(input: z.infer<typeof lookup>): Promise<ActionResult<{ id: number }>> {
  const parsed = lookup.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues.map(i => i.message).join("; ") };
  const ctx = await getAuthContext();
  if (!canManage(ctx)) return { success: false, error: "Permission denied" };
  return hrc("hr_training_categories", parsed.data, parsed.data.code, ctx);
}
export async function updateHrTrainingCategory(id: number, input: Partial<z.infer<typeof lookup>>): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!canManage(ctx)) return { success: false, error: "Permission denied" };
  return hru("hr_training_categories", id, input as Record<string, unknown>, ctx);
}

// ============================================================================
// 7. Training Types
// ============================================================================

export async function listHrTrainingTypes(p?: HrSettingsListParams) {
  return hrl<HrTrainingTypeRow>("hr_training_types", p, "training_category:hr_training_categories(id,name_en)");
}
export async function createHrTrainingType(input: z.infer<typeof trainingTypeS>): Promise<ActionResult<{ id: number }>> {
  const parsed = trainingTypeS.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues.map(i => i.message).join("; ") };
  const ctx = await getAuthContext();
  if (!canManage(ctx)) return { success: false, error: "Permission denied" };
  return hrc("hr_training_types", parsed.data, parsed.data.code, ctx);
}
export async function updateHrTrainingType(id: number, input: Partial<z.infer<typeof trainingTypeS>>): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!canManage(ctx)) return { success: false, error: "Permission denied" };
  return hru("hr_training_types", id, input as Record<string, unknown>, ctx);
}

// ============================================================================
// 8. Medical Record Types
// ============================================================================

export async function listHrMedicalRecordTypes(p?: HrSettingsListParams) {
  return hrl<HrMedicalRecordTypeRow>("hr_medical_record_types", p);
}
export async function createHrMedicalRecordType(input: z.infer<typeof medicalS>): Promise<ActionResult<{ id: number }>> {
  const parsed = medicalS.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues.map(i => i.message).join("; ") };
  const ctx = await getAuthContext();
  if (!canManage(ctx)) return { success: false, error: "Permission denied" };
  return hrc("hr_medical_record_types", parsed.data, parsed.data.code, ctx);
}
export async function updateHrMedicalRecordType(id: number, input: Partial<z.infer<typeof medicalS>>): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!canManage(ctx)) return { success: false, error: "Permission denied" };
  return hru("hr_medical_record_types", id, input as Record<string, unknown>, ctx);
}

// ============================================================================
// 9. Leave Types
// ============================================================================

export async function listHrLeaveTypes(p?: HrSettingsListParams) {
  return hrl<HrLeaveTypeRow>("hr_leave_types", p);
}
export async function createHrLeaveType(input: z.infer<typeof leaveS>): Promise<ActionResult<{ id: number }>> {
  const parsed = leaveS.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues.map(i => i.message).join("; ") };
  const ctx = await getAuthContext();
  if (!canManage(ctx)) return { success: false, error: "Permission denied" };
  return hrc("hr_leave_types", parsed.data, parsed.data.code, ctx);
}
export async function updateHrLeaveType(id: number, input: Partial<z.infer<typeof leaveS>>): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!canManage(ctx)) return { success: false, error: "Permission denied" };
  return hru("hr_leave_types", id, input as Record<string, unknown>, ctx);
}

// ============================================================================
// 10. Relationship Types
// ============================================================================

export async function listHrRelationshipTypes(p?: HrSettingsListParams) {
  return hrl<HrSettingsRow>("hr_relationship_types", p);
}
export async function createHrRelationshipType(input: z.infer<typeof lookup>): Promise<ActionResult<{ id: number }>> {
  const parsed = lookup.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues.map(i => i.message).join("; ") };
  const ctx = await getAuthContext();
  if (!canManage(ctx)) return { success: false, error: "Permission denied" };
  return hrc("hr_relationship_types", parsed.data, parsed.data.code, ctx);
}
export async function updateHrRelationshipType(id: number, input: Partial<z.infer<typeof lookup>>): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!canManage(ctx)) return { success: false, error: "Permission denied" };
  return hru("hr_relationship_types", id, input as Record<string, unknown>, ctx);
}

// ============================================================================
// 11. Salary Component Types
// ============================================================================

export async function listHrSalaryComponentTypes(p?: HrSettingsListParams) {
  return hrl<HrSalaryComponentTypeRow>("hr_salary_component_types", p);
}
export async function createHrSalaryComponentType(input: z.infer<typeof salaryCompS>): Promise<ActionResult<{ id: number }>> {
  const parsed = salaryCompS.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues.map(i => i.message).join("; ") };
  const ctx = await getAuthContext();
  if (!canManage(ctx)) return { success: false, error: "Permission denied" };
  return hrc("hr_salary_component_types", parsed.data, parsed.data.code, ctx);
}
export async function updateHrSalaryComponentType(id: number, input: Partial<z.infer<typeof salaryCompS>>): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!canManage(ctx)) return { success: false, error: "Permission denied" };
  return hru("hr_salary_component_types", id, input as Record<string, unknown>, ctx);
}

// ============================================================================
// 12. Payroll Groups
// ============================================================================

export async function listHrPayrollGroups(p?: HrSettingsListParams) {
  return hrl<HrPayrollGroupRow>("hr_payroll_groups", p);
}
export async function createHrPayrollGroup(input: z.infer<typeof payrollGroupS>): Promise<ActionResult<{ id: number }>> {
  const parsed = payrollGroupS.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues.map(i => i.message).join("; ") };
  const ctx = await getAuthContext();
  if (!canManage(ctx)) return { success: false, error: "Permission denied" };
  return hrc("hr_payroll_groups", parsed.data, parsed.data.code, ctx);
}
export async function updateHrPayrollGroup(id: number, input: Partial<z.infer<typeof payrollGroupS>>): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!canManage(ctx)) return { success: false, error: "Permission denied" };
  return hru("hr_payroll_groups", id, input as Record<string, unknown>, ctx);
}

// ============================================================================
// 13. MOHRE Establishments
// ============================================================================

export async function listHrMohreEstablishments(params?: {
  owner_company_id?: number;
  status?: string;
  search?: string;
  page?: number;
  page_size?: number;
}): Promise<ActionResult<{ data: HrMohreEstablishmentRow[]; total: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!canView(ctx)) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const ps = params?.page_size ?? 50;
    const from = ((params?.page ?? 1) - 1) * ps;
    const to = from + ps - 1;
    let q = sb.from("hr_mohre_establishments")
      .select("*, owner_company:owner_companies(id,legal_name_en), emirate:emirates(id,name_en)")
      .is("deleted_at", null).order("establishment_name").range(from, to);
    if (params?.owner_company_id) q = q.eq("owner_company_id", params.owner_company_id);
    if (params?.status) q = q.eq("status", params.status);
    if (params?.search) q = q.ilike("establishment_name", `%${params.search}%`);
    let cq = sb.from("hr_mohre_establishments").select("id", { count: "exact", head: true }).is("deleted_at", null);
    if (params?.owner_company_id) cq = cq.eq("owner_company_id", params.owner_company_id);
    if (params?.status) cq = cq.eq("status", params.status);
    if (params?.search) cq = cq.ilike("establishment_name", `%${params.search}%`);
    const [{ data, error }, { count, error: ce }] = await Promise.all([q, cq]);
    if (error || ce) return { success: false, error: (error ?? ce)?.message };
    return { success: true, data: { data: (data ?? []) as HrMohreEstablishmentRow[], total: count ?? 0 } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
export async function createHrMohreEstablishment(input: z.infer<typeof mohreS>): Promise<ActionResult<{ id: number }>> {
  const parsed = mohreS.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues.map(i => i.message).join("; ") };
  const ctx = await getAuthContext();
  if (!canManage(ctx)) return { success: false, error: "Permission denied" };
  return hrc("hr_mohre_establishments", parsed.data, parsed.data.establishment_number, ctx);
}
export async function updateHrMohreEstablishment(id: number, input: Partial<z.infer<typeof mohreS>>): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!canManage(ctx)) return { success: false, error: "Permission denied" };
  return hru("hr_mohre_establishments", id, input as Record<string, unknown>, ctx);
}

// ============================================================================
// 14. PRO Process Types
// ============================================================================

export async function listHrProProcessTypes(p?: HrSettingsListParams) {
  return hrl<HrProProcessTypeRow>("hr_pro_process_types", p);
}
export async function createHrProProcessType(input: z.infer<typeof proProcessS>): Promise<ActionResult<{ id: number }>> {
  const parsed = proProcessS.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues.map(i => i.message).join("; ") };
  const ctx = await getAuthContext();
  if (!canManage(ctx)) return { success: false, error: "Permission denied" };
  return hrc("hr_pro_process_types", parsed.data, parsed.data.code, ctx);
}
export async function updateHrProProcessType(id: number, input: Partial<z.infer<typeof proProcessS>>): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!canManage(ctx)) return { success: false, error: "Permission denied" };
  return hru("hr_pro_process_types", id, input as Record<string, unknown>, ctx);
}

// ============================================================================
// 15. Readiness Rule Templates
// ============================================================================

export async function listHrReadinessRuleTemplates(params?: HrSettingsListParams): Promise<ActionResult<{ data: HrReadinessRuleRow[]; total: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!canView(ctx)) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const ps = params?.page_size ?? 50;
    const from = ((params?.page ?? 1) - 1) * ps;
    const to = from + ps - 1;
    let q = sb.from("hr_readiness_rule_templates").select("*").is("deleted_at", null).order("sort_order").order("rule_name_en").range(from, to);
    if (params?.search) q = q.ilike("rule_name_en", `%${params.search}%`);
    if (params?.is_active !== undefined) q = q.eq("is_active", params.is_active);
    let cq = sb.from("hr_readiness_rule_templates").select("id", { count: "exact", head: true }).is("deleted_at", null);
    if (params?.search) cq = cq.ilike("rule_name_en", `%${params.search}%`);
    if (params?.is_active !== undefined) cq = cq.eq("is_active", params.is_active);
    const [{ data, error }, { count, error: ce }] = await Promise.all([q, cq]);
    if (error || ce) return { success: false, error: (error ?? ce)?.message };
    return { success: true, data: { data: (data ?? []) as HrReadinessRuleRow[], total: count ?? 0 } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
export async function createHrReadinessRuleTemplate(input: z.infer<typeof readinessS>): Promise<ActionResult<{ id: number }>> {
  const parsed = readinessS.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues.map(i => i.message).join("; ") };
  const ctx = await getAuthContext();
  if (!canManage(ctx)) return { success: false, error: "Permission denied" };
  return hrc("hr_readiness_rule_templates", parsed.data, parsed.data.rule_code, ctx);
}
export async function updateHrReadinessRuleTemplate(id: number, input: Partial<z.infer<typeof readinessS>>): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!canManage(ctx)) return { success: false, error: "Permission denied" };
  return hru("hr_readiness_rule_templates", id, input as Record<string, unknown>, ctx);
}

// ============================================================================
// 16. Role Requirement Matrix
// ============================================================================

export type HrRoleReqMatrixRow = {
  id: number;
  employee_category_id: number | null;
  designation_id: number | null;
  readiness_rule_template_id: number;
  is_required: boolean;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export async function listHrRoleRequirementMatrix(params?: { is_active?: boolean; page?: number; page_size?: number }): Promise<ActionResult<{ data: HrRoleReqMatrixRow[]; total: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!canView(ctx)) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const ps = params?.page_size ?? 50;
    const from = ((params?.page ?? 1) - 1) * ps;
    const to = from + ps - 1;
    let q = sb.from("hr_role_requirement_matrix")
      .select("*, employee_category:hr_employee_categories(id,name_en,code), readiness_rule:hr_readiness_rule_templates(id,rule_name_en,rule_code)")
      .is("deleted_at", null).order("id", { ascending: false }).range(from, to);
    if (params?.is_active !== undefined) q = q.eq("is_active", params.is_active);
    let cq = sb.from("hr_role_requirement_matrix").select("id", { count: "exact", head: true }).is("deleted_at", null);
    if (params?.is_active !== undefined) cq = cq.eq("is_active", params.is_active);
    const [{ data, error }, { count, error: ce }] = await Promise.all([q, cq]);
    if (error || ce) return { success: false, error: (error ?? ce)?.message };
    return { success: true, data: { data: (data ?? []) as HrRoleReqMatrixRow[], total: count ?? 0 } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
export async function createHrRoleRequirementMatrix(input: { employee_category_id?: number | null; designation_id?: number | null; readiness_rule_template_id: number; is_required?: boolean; notes?: string | null }): Promise<ActionResult<{ id: number }>> {
  const ctx = await getAuthContext();
  if (!canManage(ctx)) return { success: false, error: "Permission denied" };
  return hrc("hr_role_requirement_matrix", input as Record<string, unknown>, String(input.readiness_rule_template_id), ctx);
}

// ============================================================================
// 17. Site Requirement Matrix
// ============================================================================

export type HrSiteReqMatrixRow = {
  id: number;
  work_site_id: number | null;
  access_card_type_id: number | null;
  training_type_id: number | null;
  medical_record_type_id: number | null;
  readiness_rule_template_id: number | null;
  is_required: boolean;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export async function listHrSiteRequirementMatrix(params?: { work_site_id?: number; is_active?: boolean; page?: number; page_size?: number }): Promise<ActionResult<{ data: HrSiteReqMatrixRow[]; total: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!canView(ctx)) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const ps = params?.page_size ?? 50;
    const from = ((params?.page ?? 1) - 1) * ps;
    const to = from + ps - 1;
    let q = sb.from("hr_site_requirement_matrix")
      .select("*, work_site:work_sites(id,site_name), access_card_type:hr_access_card_types(id,name_en,code)")
      .is("deleted_at", null).order("id", { ascending: false }).range(from, to);
    if (params?.work_site_id) q = q.eq("work_site_id", params.work_site_id);
    if (params?.is_active !== undefined) q = q.eq("is_active", params.is_active);
    let cq = sb.from("hr_site_requirement_matrix").select("id", { count: "exact", head: true }).is("deleted_at", null);
    if (params?.work_site_id) cq = cq.eq("work_site_id", params.work_site_id);
    if (params?.is_active !== undefined) cq = cq.eq("is_active", params.is_active);
    const [{ data, error }, { count, error: ce }] = await Promise.all([q, cq]);
    if (error || ce) return { success: false, error: (error ?? ce)?.message };
    return { success: true, data: { data: (data ?? []) as HrSiteReqMatrixRow[], total: count ?? 0 } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
export async function createHrSiteRequirementMatrix(input: { work_site_id?: number | null; access_card_type_id?: number | null; training_type_id?: number | null; medical_record_type_id?: number | null; readiness_rule_template_id?: number | null; is_required?: boolean; notes?: string | null }): Promise<ActionResult<{ id: number }>> {
  const ctx = await getAuthContext();
  if (!canManage(ctx)) return { success: false, error: "Permission denied" };
  return hrc("hr_site_requirement_matrix", input as Record<string, unknown>, String(input.work_site_id ?? ""), ctx);
}

// ============================================================================
// 18. Approval Workflows
// ============================================================================

export async function listHrApprovalWorkflows(params?: { workflow_type?: string; is_active?: boolean; page?: number; page_size?: number }): Promise<ActionResult<{ data: HrApprovalWorkflowRow[]; total: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!canView(ctx)) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const ps = params?.page_size ?? 50;
    const from = ((params?.page ?? 1) - 1) * ps;
    const to = from + ps - 1;
    let q = sb.from("hr_approval_workflows")
      .select("*, approval_role:approval_roles(id,role_name)")
      .is("deleted_at", null).order("workflow_code").order("approval_step").range(from, to);
    if (params?.workflow_type) q = q.eq("workflow_type", params.workflow_type);
    if (params?.is_active !== undefined) q = q.eq("is_active", params.is_active);
    let cq = sb.from("hr_approval_workflows").select("id", { count: "exact", head: true }).is("deleted_at", null);
    if (params?.workflow_type) cq = cq.eq("workflow_type", params.workflow_type);
    if (params?.is_active !== undefined) cq = cq.eq("is_active", params.is_active);
    const [{ data, error }, { count, error: ce }] = await Promise.all([q, cq]);
    if (error || ce) return { success: false, error: (error ?? ce)?.message };
    return { success: true, data: { data: (data ?? []) as HrApprovalWorkflowRow[], total: count ?? 0 } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
export async function createHrApprovalWorkflow(input: z.infer<typeof approvalS>): Promise<ActionResult<{ id: number }>> {
  const parsed = approvalS.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues.map(i => i.message).join("; ") };
  const ctx = await getAuthContext();
  if (!canManage(ctx)) return { success: false, error: "Permission denied" };
  return hrc("hr_approval_workflows", parsed.data, parsed.data.workflow_code, ctx);
}
export async function updateHrApprovalWorkflow(id: number, input: Partial<z.infer<typeof approvalS>>): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!canManage(ctx)) return { success: false, error: "Permission denied" };
  return hru("hr_approval_workflows", id, input as Record<string, unknown>, ctx);
}

// ============================================================================
// Generic activate/archive
// ============================================================================

export async function archiveHrSettingsRow(table: string, id: number, entityRef?: string): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!canManage(ctx)) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from(table).update({ deleted_at: new Date().toISOString(), is_active: false, deleted_by: ctx.profile?.id, updated_by: ctx.profile?.id }).eq("id", id);
    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "HR", entity_name: table, entity_id: id, entity_reference: entityRef ?? String(id), action: "archive" });
    revalidatePath(HR_PATH);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function toggleHrSettingsRowActive(table: string, id: number, is_active: boolean): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!canManage(ctx)) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from(table).update({ is_active, updated_by: ctx.profile?.id, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "HR", entity_name: table, entity_id: id, entity_reference: String(id), action: is_active ? "activate" : "deactivate" });
    revalidatePath(HR_PATH);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
