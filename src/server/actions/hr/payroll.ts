"use server";

/**
 * ERP HR.5 — Payroll & WPS Readiness Server Actions
 *
 * Covers:
 *   - employee_payroll_profiles (create/update, archive)
 *   - employee_salary_components (CRUD + archive)
 *   - employee_salary_revisions (append-only: list + create)
 *   - employee_payroll_holds (place / release / archive)
 *   - employee_wps_profiles (upsert)
 *   - calculateEmployeeGrossSalary (server-side)
 *   - getEmployeeWpsReadiness (deterministic)
 *   - listWpsReadiness (global page)
 *   - getEmployeePayrollSummary (overview cards)
 *   - listHrSalaryComponentTypesForPayroll (combobox helper)
 *   - listHrPayrollGroupsForPayroll (combobox helper)
 *   - listHrMohreEstablishmentsForPayroll (combobox helper)
 *
 * Security model:
 *   - All reads: createClient() (RLS enforced, hr.payroll.view required)
 *   - All writes: createAdminClient() + hasPermission(hr.payroll.manage)
 *   - Sensitive data: IBAN/account never in audit, salary masked for unauthorized
 *   - No payroll run, no payslips, no accounting
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { z } from "zod";
import {
  redactWpsProfile,
  redactSalaryComponent,
  redactSalaryRevision,
  maskMoney,
} from "@/lib/hr/payroll/redaction";
import {
  checkWpsReadiness,
  calculateGrossSalary,
  type WpsReadinessResult,
} from "@/lib/hr/payroll/wps-readiness";

// ── Types ──────────────────────────────────────────────────────────────────────

type ActionResult<T = unknown> = { success: boolean; data?: T; error?: string };

export type PayrollProfileRow = {
  id: number;
  employee_id: number;
  payroll_group_id: number | null;
  effective_date: string;
  currency: string;
  payroll_status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
  deleted_at: string | null;
  payroll_group?: { id: number; name_en: string; pay_frequency: string } | null;
};

export type SalaryComponentRow = {
  id: number;
  employee_id: number;
  component_type_id: number;
  amount: number | null; // null = redacted
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  component_type?: {
    id: number;
    code: string;
    name_en: string;
    component_kind: string;
    is_wps_component: boolean;
  } | null;
};

export type SalaryRevisionRow = {
  id: number;
  employee_id: number;
  effective_date: string;
  revision_reason: string | null;
  old_gross: number | null; // null = redacted
  new_gross: number | null; // null = redacted
  approved_by: number | null;
  created_at: string;
  created_by: number | null;
  approver?: { full_name_en: string } | null;
};

export type PayrollHoldRow = {
  id: number;
  employee_id: number;
  hold_reason: string;
  hold_date: string;
  release_date: string | null;
  released_by: number | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  releaser?: { full_name_en: string } | null;
};

export type WpsProfileRow = {
  id: number;
  employee_id: number;
  wps_applicable: boolean;
  wps_status: string;
  bank_id: number | null;
  account_holder_name: string | null;
  account_number: string | null;   // raw — only in DB
  iban: string | null;              // raw — only in DB
  iban_masked: string;              // always returned instead of raw
  account_number_masked: string;   // always returned instead of raw
  exchange_house: string | null;
  salary_payment_method: string;
  labour_card_number: string | null;
  mohre_person_code: string | null;
  mohre_establishment_id: number | null;
  salary_effective_date: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  bank?: { id: number; bank_name_en: string; bank_code: string } | null;
  mohre_establishment?: { id: number; establishment_name: string; establishment_number: string } | null;
};

export type EmployeePayrollSummary = {
  payrollStatus: string | null;
  grossSalary: number | null;        // null = redacted
  wpsReadiness: WpsReadinessResult | null;
  hasActiveHold: boolean;
  wpsStatus: string | null;
};

export type SalaryComponentTypeOption = {
  id: number;
  code: string;
  name_en: string;
  component_kind: string;
  is_wps_component: boolean;
};

export type PayrollGroupOption = {
  id: number;
  code: string;
  name_en: string;
  pay_frequency: string;
};

export type MohreEstablishmentOption = {
  id: number;
  establishment_number: string;
  establishment_name: string;
};

// ── Zod Schemas ────────────────────────────────────────────────────────────────

const payrollProfileSchema = z.object({
  payroll_group_id: z.number().int().positive().nullable().optional(),
  effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  currency: z.string().min(1).max(10).default("AED"),
  payroll_status: z.enum(["active", "hold", "inactive", "not_configured"]).default("active"),
  notes: z.string().max(2000).nullable().optional(),
});

const salaryComponentBaseSchema = z.object({
  component_type_id: z.number().int().positive(),
  amount: z.number().min(0),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effective_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  is_active: z.boolean().default(true),
  notes: z.string().max(1000).nullable().optional(),
});

const salaryComponentCreateSchema = salaryComponentBaseSchema.refine(
  (d) => !d.effective_to || new Date(d.effective_from) <= new Date(d.effective_to),
  { message: "effective_from must be on or before effective_to", path: ["effective_to"] }
);

const salaryComponentUpdateSchema = salaryComponentBaseSchema.partial();

const salaryRevisionCreateSchema = z.object({
  effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  revision_reason: z.string().max(1000).nullable().optional(),
  old_gross: z.number().min(0).nullable().optional(),
  new_gross: z.number().min(0).nullable().optional(),
  approved_by: z.number().int().positive().nullable().optional(),
});

const payrollHoldCreateSchema = z.object({
  hold_reason: z.string().min(1).max(500),
  hold_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(
    () => new Date().toISOString().slice(0, 10)
  ),
  notes: z.string().max(1000).nullable().optional(),
});

const wpsProfileSchema = z.object({
  wps_applicable: z.boolean().default(true),
  wps_status: z.enum(["active", "hold", "exempt", "not_enrolled"]).default("active"),
  bank_id: z.number().int().positive().nullable().optional(),
  account_holder_name: z.string().max(200).nullable().optional(),
  account_number: z.string().max(50).nullable().optional(),
  iban: z
    .string()
    .max(34)
    .nullable()
    .optional()
    .refine(
      (v) => !v || v.startsWith("AE") ? (v?.length ?? 0) === 23 || !v?.startsWith("AE") : true,
      { message: "UAE IBAN must be 23 characters starting with AE" }
    ),
  exchange_house: z.string().max(200).nullable().optional(),
  salary_payment_method: z.enum(["bank_transfer", "exchange_house", "cheque"]).default("bank_transfer"),
  labour_card_number: z.string().max(100).nullable().optional(),
  mohre_person_code: z.string().max(100).nullable().optional(),
  mohre_establishment_id: z.number().int().positive().nullable().optional(),
  salary_effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

const wpsReadinessParamsSchema = z.object({
  page: z.number().int().min(1).default(1),
  page_size: z.number().int().min(1).max(100).default(50),
  wps_status: z.string().optional(),
  missing_iban: z.boolean().optional(),
  missing_labour_card: z.boolean().optional(),
  on_hold: z.boolean().optional(),
  owner_company_id: z.number().int().positive().optional(),
});

// ── Helpers ────────────────────────────────────────────────────────────────────

import { getEmployeeCtxAdmin as getEmployeeCtx } from "./_shared/employee-context";

function empRevalidate(employeeId: number) {
  revalidatePath(`/admin/hr/employees/record/${employeeId}`);
  revalidatePath("/admin/hr/payroll/salaries");
  revalidatePath("/admin/hr/payroll/wps");
}

// ── Payroll Profile ────────────────────────────────────────────────────────────

export async function getEmployeePayrollProfile(
  employeeId: number
): Promise<ActionResult<PayrollProfileRow | null>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.payroll.view"))
    return { success: false, error: "Permission denied: hr.payroll.view required" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_payroll_profiles")
    .select("*, payroll_group:hr_payroll_groups!employee_payroll_profiles_payroll_group_id_fkey(id,name_en,pay_frequency)")
    .eq("employee_id", employeeId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return { success: false, error: error.message };
  return { success: true, data: (data as PayrollProfileRow) ?? null };
}

export async function createOrUpdateEmployeePayrollProfile(
  employeeId: number,
  input: unknown
): Promise<ActionResult<{ id: number }>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.payroll.manage"))
    return { success: false, error: "Permission denied: hr.payroll.manage required" };

  const parsed = payrollProfileSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

  const admin = createAdminClient();
  const emp = await getEmployeeCtx(employeeId);
  if (!emp) return { success: false, error: "Employee not found" };

  // Check for existing profile
  const { data: existing } = await admin
    .from("employee_payroll_profiles")
    .select("id")
    .eq("employee_id", employeeId)
    .is("deleted_at", null)
    .maybeSingle();

  let id: number;

  if (existing) {
    const { error } = await admin
      .from("employee_payroll_profiles")
      .update({ ...parsed.data, updated_by: ctx.profile?.id })
      .eq("id", existing.id);
    if (error) return { success: false, error: error.message };
    id = existing.id;
    await logAudit({
      module_code: "HR",
      entity_name: "employee_payroll_profiles",
      entity_id: id,
      entity_reference: `${emp.employee_code}-payroll`,
      action: "payroll_profile_updated",
      new_values: { parent_employee_id: employeeId, employee_code: emp.employee_code, employee_name: emp.full_name_en, related_record_type: "payroll_profile" },
    });
  } else {
    const { data: inserted, error } = await admin
      .from("employee_payroll_profiles")
      .insert({ employee_id: employeeId, ...parsed.data, created_by: ctx.profile?.id })
      .select("id")
      .single();
    if (error) return { success: false, error: error.message };
    id = inserted.id;
    await logAudit({
      module_code: "HR",
      entity_name: "employee_payroll_profiles",
      entity_id: id,
      entity_reference: `${emp.employee_code}-payroll`,
      action: "payroll_profile_created",
      new_values: { parent_employee_id: employeeId, employee_code: emp.employee_code, employee_name: emp.full_name_en, related_record_type: "payroll_profile" },
    });
  }

  empRevalidate(employeeId);
  return { success: true, data: { id } };
}

export async function archiveEmployeePayrollProfile(
  id: number
): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.payroll.manage"))
    return { success: false, error: "Permission denied: hr.payroll.manage required" };

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("employee_payroll_profiles")
    .select("employee_id")
    .eq("id", id)
    .single();
  if (!row) return { success: false, error: "Payroll profile not found" };

  const emp = await getEmployeeCtx(row.employee_id);
  const { error } = await admin
    .from("employee_payroll_profiles")
    .update({ deleted_at: new Date().toISOString(), deleted_by: ctx.profile?.id })
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  await logAudit({
    module_code: "HR",
    entity_name: "employee_payroll_profiles",
    entity_id: id,
    entity_reference: `${emp?.employee_code ?? ""}-payroll`,
    action: "payroll_profile_archived",
    new_values: { parent_employee_id: row.employee_id, employee_code: emp?.employee_code, employee_name: emp?.full_name_en, related_record_type: "payroll_profile" },
  });
  empRevalidate(row.employee_id);
  return { success: true };
}

// ── Salary Components ──────────────────────────────────────────────────────────

export async function listEmployeeSalaryComponents(
  employeeId: number
): Promise<ActionResult<SalaryComponentRow[]>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.payroll.view"))
    return { success: false, error: "Permission denied: hr.payroll.view required" };

  const canView = hasPermission(ctx, "hr.payroll.view");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_salary_components")
    .select("*, component_type:hr_salary_component_types!employee_salary_components_component_type_id_fkey(id,code,name_en,component_kind,is_wps_component)")
    .eq("employee_id", employeeId)
    .is("deleted_at", null)
    .order("is_active", { ascending: false })
    .order("effective_from", { ascending: false });

  if (error) return { success: false, error: error.message };

  const rows = (data ?? []).map((r) =>
    redactSalaryComponent(r as SalaryComponentRow, canView)
  );
  return { success: true, data: rows };
}

export async function createEmployeeSalaryComponent(
  employeeId: number,
  input: unknown
): Promise<ActionResult<{ id: number }>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.payroll.manage"))
    return { success: false, error: "Permission denied: hr.payroll.manage required" };

  const parsed = salaryComponentCreateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

  const admin = createAdminClient();
  const emp = await getEmployeeCtx(employeeId);
  if (!emp) return { success: false, error: "Employee not found" };

  const { data, error } = await admin
    .from("employee_salary_components")
    .insert({ employee_id: employeeId, ...parsed.data, created_by: ctx.profile?.id })
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };

  await logAudit({
    module_code: "HR",
    entity_name: "employee_salary_components",
    entity_id: data.id,
    entity_reference: `${emp.employee_code}-comp-${data.id}`,
    action: "salary_component_created",
    new_values: { parent_employee_id: employeeId, employee_code: emp.employee_code, employee_name: emp.full_name_en, related_record_type: "salary_component", component_type_id: parsed.data.component_type_id },
  });
  empRevalidate(employeeId);
  return { success: true, data: { id: data.id } };
}

export async function updateEmployeeSalaryComponent(
  id: number,
  input: unknown
): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.payroll.manage"))
    return { success: false, error: "Permission denied: hr.payroll.manage required" };

  const parsed = salaryComponentUpdateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("employee_salary_components")
    .select("employee_id")
    .eq("id", id)
    .single();
  if (!row) return { success: false, error: "Salary component not found" };

  const emp = await getEmployeeCtx(row.employee_id);
  const { error } = await admin
    .from("employee_salary_components")
    .update({ ...parsed.data, updated_by: ctx.profile?.id })
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  await logAudit({
    module_code: "HR",
    entity_name: "employee_salary_components",
    entity_id: id,
    entity_reference: `${emp?.employee_code ?? ""}-comp-${id}`,
    action: "salary_component_updated",
    new_values: { parent_employee_id: row.employee_id, employee_code: emp?.employee_code, employee_name: emp?.full_name_en, related_record_type: "salary_component" },
  });
  empRevalidate(row.employee_id);
  return { success: true };
}

export async function archiveEmployeeSalaryComponent(id: number): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.payroll.manage"))
    return { success: false, error: "Permission denied: hr.payroll.manage required" };

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("employee_salary_components")
    .select("employee_id")
    .eq("id", id)
    .single();
  if (!row) return { success: false, error: "Salary component not found" };

  const emp = await getEmployeeCtx(row.employee_id);
  const { error } = await admin
    .from("employee_salary_components")
    .update({ deleted_at: new Date().toISOString(), deleted_by: ctx.profile?.id, is_active: false })
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  await logAudit({
    module_code: "HR",
    entity_name: "employee_salary_components",
    entity_id: id,
    entity_reference: `${emp?.employee_code ?? ""}-comp-${id}`,
    action: "salary_component_archived",
    new_values: { parent_employee_id: row.employee_id, employee_code: emp?.employee_code, employee_name: emp?.full_name_en, related_record_type: "salary_component" },
  });
  empRevalidate(row.employee_id);
  return { success: true };
}

export async function calculateEmployeeGrossSalary(
  employeeId: number
): Promise<ActionResult<{ gross: number }>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.payroll.view"))
    return { success: false, error: "Permission denied: hr.payroll.view required" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_salary_components")
    .select("amount, is_active, deleted_at, component_type:hr_salary_component_types!employee_salary_components_component_type_id_fkey(component_kind)")
    .eq("employee_id", employeeId);

  if (error) return { success: false, error: error.message };

  const gross = calculateGrossSalary(
    (data ?? []).map((c) => ({
      amount: c.amount ?? 0,
      is_active: c.is_active,
      deleted_at: c.deleted_at,
      component_type: c.component_type as unknown as { component_kind: string } | null,
    }))
  );
  return { success: true, data: { gross } };
}

// ── Salary Revisions ───────────────────────────────────────────────────────────

export async function listEmployeeSalaryRevisions(
  employeeId: number
): Promise<ActionResult<SalaryRevisionRow[]>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.payroll.view"))
    return { success: false, error: "Permission denied: hr.payroll.view required" };

  const canView = hasPermission(ctx, "hr.payroll.view");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_salary_revisions")
    .select("*, approver:user_profiles!employee_salary_revisions_approved_by_fkey(full_name_en)")
    .eq("employee_id", employeeId)
    .order("effective_date", { ascending: false });

  if (error) return { success: false, error: error.message };

  const rows = (data ?? []).map((r) =>
    redactSalaryRevision(r as SalaryRevisionRow, canView)
  );
  return { success: true, data: rows };
}

export async function createEmployeeSalaryRevision(
  employeeId: number,
  input: unknown
): Promise<ActionResult<{ id: number }>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.payroll.manage"))
    return { success: false, error: "Permission denied: hr.payroll.manage required" };

  const parsed = salaryRevisionCreateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

  const admin = createAdminClient();
  const emp = await getEmployeeCtx(employeeId);
  if (!emp) return { success: false, error: "Employee not found" };

  const { data, error } = await admin
    .from("employee_salary_revisions")
    .insert({ employee_id: employeeId, ...parsed.data, created_by: ctx.profile?.id })
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };

  await logAudit({
    module_code: "HR",
    entity_name: "employee_salary_revisions",
    entity_id: data.id,
    entity_reference: `${emp.employee_code}-rev-${data.id}`,
    action: "salary_revision_created",
    new_values: { parent_employee_id: employeeId, employee_code: emp.employee_code, employee_name: emp.full_name_en, related_record_type: "salary_revision", effective_date: parsed.data.effective_date, revision_reason: parsed.data.revision_reason },
  });
  empRevalidate(employeeId);
  return { success: true, data: { id: data.id } };
}

// ── Payroll Holds ──────────────────────────────────────────────────────────────

export async function listEmployeePayrollHolds(
  employeeId: number
): Promise<ActionResult<PayrollHoldRow[]>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.payroll.view"))
    return { success: false, error: "Permission denied: hr.payroll.view required" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_payroll_holds")
    .select("*, releaser:user_profiles!employee_payroll_holds_released_by_fkey(full_name_en)")
    .eq("employee_id", employeeId)
    .is("deleted_at", null)
    .order("hold_date", { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as PayrollHoldRow[] };
}

export async function getEmployeeActivePayrollHold(
  employeeId: number
): Promise<ActionResult<PayrollHoldRow | null>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.payroll.view"))
    return { success: false, error: "Permission denied: hr.payroll.view required" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_payroll_holds")
    .select("*")
    .eq("employee_id", employeeId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return { success: false, error: error.message };
  return { success: true, data: (data as PayrollHoldRow) ?? null };
}

export async function placeEmployeePayrollHold(
  employeeId: number,
  input: unknown
): Promise<ActionResult<{ id: number }>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.payroll.manage"))
    return { success: false, error: "Permission denied: hr.payroll.manage required" };

  const parsed = payrollHoldCreateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

  const admin = createAdminClient();
  const emp = await getEmployeeCtx(employeeId);
  if (!emp) return { success: false, error: "Employee not found" };

  const { data, error } = await admin
    .from("employee_payroll_holds")
    .insert({ employee_id: employeeId, ...parsed.data, is_active: true, created_by: ctx.profile?.id })
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };

  // Sync payroll profile status to 'hold'
  await admin
    .from("employee_payroll_profiles")
    .update({ payroll_status: "hold", updated_by: ctx.profile?.id })
    .eq("employee_id", employeeId)
    .is("deleted_at", null);

  await logAudit({
    module_code: "HR",
    entity_name: "employee_payroll_holds",
    entity_id: data.id,
    entity_reference: `${emp.employee_code}-hold-${data.id}`,
    action: "payroll_hold_placed",
    new_values: { parent_employee_id: employeeId, employee_code: emp.employee_code, employee_name: emp.full_name_en, related_record_type: "payroll_hold", hold_reason: parsed.data.hold_reason },
  });
  empRevalidate(employeeId);
  return { success: true, data: { id: data.id } };
}

export async function releaseEmployeePayrollHold(id: number): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.payroll.manage"))
    return { success: false, error: "Permission denied: hr.payroll.manage required" };

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("employee_payroll_holds")
    .select("employee_id")
    .eq("id", id)
    .single();
  if (!row) return { success: false, error: "Payroll hold not found" };

  const emp = await getEmployeeCtx(row.employee_id);
  const { error } = await admin
    .from("employee_payroll_holds")
    .update({
      is_active: false,
      release_date: new Date().toISOString().slice(0, 10),
      released_by: ctx.profile?.id,
      updated_by: ctx.profile?.id,
    })
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  // Check if there are still active holds; if not, restore payroll status
  const { data: activeHolds } = await admin
    .from("employee_payroll_holds")
    .select("id")
    .eq("employee_id", row.employee_id)
    .eq("is_active", true)
    .is("deleted_at", null);

  if (!activeHolds || activeHolds.length === 0) {
    await admin
      .from("employee_payroll_profiles")
      .update({ payroll_status: "active", updated_by: ctx.profile?.id })
      .eq("employee_id", row.employee_id)
      .eq("payroll_status", "hold")
      .is("deleted_at", null);
  }

  await logAudit({
    module_code: "HR",
    entity_name: "employee_payroll_holds",
    entity_id: id,
    entity_reference: `${emp?.employee_code ?? ""}-hold-${id}`,
    action: "payroll_hold_released",
    new_values: { parent_employee_id: row.employee_id, employee_code: emp?.employee_code, employee_name: emp?.full_name_en, related_record_type: "payroll_hold" },
  });
  empRevalidate(row.employee_id);
  return { success: true };
}

export async function archiveEmployeePayrollHold(id: number): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.payroll.manage"))
    return { success: false, error: "Permission denied: hr.payroll.manage required" };

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("employee_payroll_holds")
    .select("employee_id")
    .eq("id", id)
    .single();
  if (!row) return { success: false, error: "Payroll hold not found" };

  const emp = await getEmployeeCtx(row.employee_id);
  const { error } = await admin
    .from("employee_payroll_holds")
    .update({ deleted_at: new Date().toISOString(), deleted_by: ctx.profile?.id, is_active: false })
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  await logAudit({
    module_code: "HR",
    entity_name: "employee_payroll_holds",
    entity_id: id,
    entity_reference: `${emp?.employee_code ?? ""}-hold-${id}`,
    action: "payroll_hold_archived",
    new_values: { parent_employee_id: row.employee_id, employee_code: emp?.employee_code, employee_name: emp?.full_name_en, related_record_type: "payroll_hold" },
  });
  empRevalidate(row.employee_id);
  return { success: true };
}

// ── WPS Profile ────────────────────────────────────────────────────────────────

export async function getEmployeeWpsProfile(
  employeeId: number
): Promise<ActionResult<WpsProfileRow | null>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.payroll.view"))
    return { success: false, error: "Permission denied: hr.payroll.view required" };

  const canView = hasPermission(ctx, "hr.payroll.view");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_wps_profiles")
    .select("*, bank:banks!employee_wps_profiles_bank_id_fkey(id,bank_name_en,bank_code), mohre_establishment:hr_mohre_establishments!employee_wps_profiles_mohre_establishment_id_fkey(id,establishment_name,establishment_number)")
    .eq("employee_id", employeeId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return { success: false, error: error.message };
  if (!data) return { success: true, data: null };

  const redacted = redactWpsProfile(data, canView);
  return { success: true, data: redacted as WpsProfileRow };
}

export async function createOrUpdateEmployeeWpsProfile(
  employeeId: number,
  input: unknown
): Promise<ActionResult<{ id: number }>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.payroll.manage"))
    return { success: false, error: "Permission denied: hr.payroll.manage required" };

  const parsed = wpsProfileSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

  const admin = createAdminClient();
  const emp = await getEmployeeCtx(employeeId);
  if (!emp) return { success: false, error: "Employee not found" };

  const { data: existing } = await admin
    .from("employee_wps_profiles")
    .select("id")
    .eq("employee_id", employeeId)
    .is("deleted_at", null)
    .maybeSingle();

  let id: number;

  if (existing) {
    const { error } = await admin
      .from("employee_wps_profiles")
      .update({ ...parsed.data, updated_by: ctx.profile?.id })
      .eq("id", existing.id);
    if (error) return { success: false, error: error.message };
    id = existing.id;
    await logAudit({
      module_code: "HR",
      entity_name: "employee_wps_profiles",
      entity_id: id,
      entity_reference: `${emp.employee_code}-wps`,
      action: "wps_profile_updated",
      new_values: { parent_employee_id: employeeId, employee_code: emp.employee_code, employee_name: emp.full_name_en, related_record_type: "wps_profile", wps_status: parsed.data.wps_status, salary_payment_method: parsed.data.salary_payment_method },
    });
  } else {
    const { data: inserted, error } = await admin
      .from("employee_wps_profiles")
      .insert({ employee_id: employeeId, ...parsed.data, created_by: ctx.profile?.id })
      .select("id")
      .single();
    if (error) return { success: false, error: error.message };
    id = inserted.id;
    await logAudit({
      module_code: "HR",
      entity_name: "employee_wps_profiles",
      entity_id: id,
      entity_reference: `${emp.employee_code}-wps`,
      action: "wps_profile_created",
      new_values: { parent_employee_id: employeeId, employee_code: emp.employee_code, employee_name: emp.full_name_en, related_record_type: "wps_profile", wps_status: parsed.data.wps_status },
    });
  }

  empRevalidate(employeeId);
  return { success: true, data: { id } };
}

export async function getEmployeeWpsReadiness(
  employeeId: number
): Promise<ActionResult<WpsReadinessResult>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.payroll.view"))
    return { success: false, error: "Permission denied: hr.payroll.view required" };

  const supabase = await createClient();

  const [wpsRes, holdsRes, componentsRes] = await Promise.all([
    supabase
      .from("employee_wps_profiles")
      .select("wps_applicable, wps_status, bank_id, account_number, iban, exchange_house, salary_payment_method, labour_card_number, mohre_person_code")
      .eq("employee_id", employeeId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("employee_payroll_holds")
      .select("id")
      .eq("employee_id", employeeId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .limit(1),
    supabase
      .from("employee_salary_components")
      .select("amount, is_active, deleted_at, component_type:hr_salary_component_types!employee_salary_components_component_type_id_fkey(component_kind)")
      .eq("employee_id", employeeId),
  ]);

  const components = (componentsRes.data ?? []).map((c) => ({
    amount: c.amount ?? 0,
    is_active: c.is_active,
    deleted_at: c.deleted_at,
    component_type: c.component_type as unknown as { component_kind: string } | null,
  }));

  const gross = calculateGrossSalary(components);
  const result = checkWpsReadiness({
    wpsProfile: wpsRes.data ?? null,
    hasActivePayrollHold: (holdsRes.data ?? []).length > 0,
    hasSalaryComponents: components.filter((c) => c.is_active && !c.deleted_at).length > 0,
    grossSalary: gross,
  });

  return { success: true, data: result };
}

export async function listWpsReadiness(
  params?: unknown
): Promise<ActionResult<{ data: Array<{
  employee_id: number;
  employee_code: string;
  full_name_en: string;
  wps_status: string | null;
  salary_payment_method: string | null;
  has_active_hold: boolean;
  readiness_status: string;
}>; count: number }>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.payroll.view"))
    return { success: false, error: "Permission denied: hr.payroll.view required" };

  const parsed = wpsReadinessParamsSchema.safeParse(params ?? {});
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

  const { page, page_size, wps_status, owner_company_id } = parsed.data;
  const from = (page - 1) * page_size;
  const to = from + page_size - 1;

  const supabase = await createClient();

  let q = supabase
    .from("employees")
    .select(
      `id, employee_code, full_name_en,
       wps_profile:employee_wps_profiles!employee_wps_profiles_employee_id_fkey(wps_status, salary_payment_method, wps_applicable, bank_id, iban, account_number, exchange_house, labour_card_number, mohre_person_code),
       payroll_holds:employee_payroll_holds!employee_payroll_holds_employee_id_fkey(id, is_active, deleted_at),
       salary_components:employee_salary_components!employee_salary_components_employee_id_fkey(id, amount, is_active, deleted_at, component_type:hr_salary_component_types!employee_salary_components_component_type_id_fkey(component_kind))`,
      { count: "exact" }
    )
    .is("deleted_at", null)
    .order("full_name_en")
    .range(from, to);

  if (owner_company_id) q = q.eq("owner_company_id", owner_company_id);

  const { data, error, count } = await q;
  if (error) return { success: false, error: error.message };

  const rows = (data ?? []).map((emp) => {
    const wpsArr = emp.wps_profile as unknown[];
    const wpsProfile = (wpsArr && wpsArr.length > 0 ? wpsArr[0] : null) as {
      wps_applicable: boolean;
      wps_status: string;
      bank_id: number | null;
      account_number: string | null;
      iban: string | null;
      exchange_house: string | null;
      salary_payment_method: string;
      labour_card_number: string | null;
      mohre_person_code: string | null;
    } | null;

    const holdsArr = (emp.payroll_holds as unknown[]) ?? [];
    const hasActiveHold = holdsArr.some(
      (h) => (h as { is_active: boolean; deleted_at: string | null }).is_active && !(h as { deleted_at: string | null }).deleted_at
    );

    const componentsArr = (emp.salary_components as unknown[]) ?? [];
    const activeComponents = componentsArr.filter(
      (c) => (c as { is_active: boolean; deleted_at: string | null }).is_active && !(c as { deleted_at: string | null }).deleted_at
    ).map((c) => ({
      amount: (c as { amount: number }).amount ?? 0,
      is_active: true,
      deleted_at: null,
      component_type: (c as { component_type: { component_kind: string } | null }).component_type,
    }));

    const gross = calculateGrossSalary(activeComponents);
    const readiness = checkWpsReadiness({
      wpsProfile,
      hasActivePayrollHold: hasActiveHold,
      hasSalaryComponents: activeComponents.length > 0,
      grossSalary: gross,
    });

    return {
      employee_id: emp.id,
      employee_code: emp.employee_code,
      full_name_en: emp.full_name_en,
      wps_status: wpsProfile?.wps_status ?? null,
      salary_payment_method: wpsProfile?.salary_payment_method ?? null,
      has_active_hold: hasActiveHold,
      readiness_status: readiness.status,
    };
  }).filter((row) => !wps_status || row.wps_status === wps_status);

  return { success: true, data: { data: rows, count: count ?? 0 } };
}

// ── Global Salary Profiles List ────────────────────────────────────────────────

export async function listGlobalSalaryProfiles(params?: {
  page?: number;
  page_size?: number;
  owner_company_id?: number;
  payroll_status?: string;
}): Promise<ActionResult<{ data: Array<{
  employee_id: number;
  employee_code: string;
  full_name_en: string;
  payroll_status: string | null;
  payroll_group_name: string | null;
  gross_salary: number | null;
  currency: string | null;
}>; count: number }>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.payroll.view"))
    return { success: false, error: "Permission denied: hr.payroll.view required" };

  const canView = hasPermission(ctx, "hr.payroll.view");
  const { page = 1, page_size = 50, owner_company_id, payroll_status } = params ?? {};
  const from = (page - 1) * page_size;
  const to = from + page_size - 1;

  const supabase = await createClient();

  let q = supabase
    .from("employees")
    .select(
      `id, employee_code, full_name_en,
       payroll_profile:employee_payroll_profiles!employee_payroll_profiles_employee_id_fkey(payroll_status, currency, payroll_group:hr_payroll_groups!employee_payroll_profiles_payroll_group_id_fkey(name_en)),
       salary_components:employee_salary_components!employee_salary_components_employee_id_fkey(amount, is_active, deleted_at, component_type:hr_salary_component_types!employee_salary_components_component_type_id_fkey(component_kind))`,
      { count: "exact" }
    )
    .is("deleted_at", null)
    .order("full_name_en")
    .range(from, to);

  if (owner_company_id) q = q.eq("owner_company_id", owner_company_id);

  const { data, error, count } = await q;
  if (error) return { success: false, error: error.message };

  const rows = (data ?? [])
    .map((emp) => {
      const profileArr = emp.payroll_profile as unknown[];
      const profile = (profileArr && profileArr.length > 0 ? profileArr[0] : null) as {
        payroll_status: string;
        currency: string;
        payroll_group: { name_en: string } | null;
      } | null;

      const componentsArr = (emp.salary_components as unknown[]) ?? [];
      const components = componentsArr.map((c) => ({
        amount: (c as { amount: number }).amount ?? 0,
        is_active: (c as { is_active: boolean }).is_active,
        deleted_at: (c as { deleted_at: string | null }).deleted_at,
        component_type: (c as { component_type: { component_kind: string } | null }).component_type,
      }));

      const gross = calculateGrossSalary(components);

      return {
        employee_id: emp.id,
        employee_code: emp.employee_code,
        full_name_en: emp.full_name_en,
        payroll_status: profile?.payroll_status ?? null,
        payroll_group_name: profile?.payroll_group?.name_en ?? null,
        gross_salary: maskMoney(gross, canView),
        currency: profile?.currency ?? null,
      };
    })
    .filter((r) => !payroll_status || r.payroll_status === payroll_status);

  return { success: true, data: { data: rows, count: count ?? 0 } };
}

// ── Summary for Overview Tab ───────────────────────────────────────────────────

export async function getEmployeePayrollSummary(
  employeeId: number
): Promise<ActionResult<EmployeePayrollSummary>> {
  const ctx = await getAuthContext();

  if (!hasPermission(ctx, "hr.payroll.view")) {
    return {
      success: true,
      data: {
        payrollStatus: null,
        grossSalary: null,
        wpsReadiness: null,
        hasActiveHold: false,
        wpsStatus: null,
      },
    };
  }

  const supabase = await createClient();

  const [profileRes, wpsRes, holdsRes, componentsRes] = await Promise.all([
    supabase
      .from("employee_payroll_profiles")
      .select("payroll_status")
      .eq("employee_id", employeeId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("employee_wps_profiles")
      .select("wps_applicable, wps_status, bank_id, account_number, iban, exchange_house, salary_payment_method, labour_card_number, mohre_person_code")
      .eq("employee_id", employeeId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("employee_payroll_holds")
      .select("id")
      .eq("employee_id", employeeId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .limit(1),
    supabase
      .from("employee_salary_components")
      .select("amount, is_active, deleted_at, component_type:hr_salary_component_types!employee_salary_components_component_type_id_fkey(component_kind)")
      .eq("employee_id", employeeId),
  ]);

  const components = (componentsRes.data ?? []).map((c) => ({
    amount: c.amount ?? 0,
    is_active: c.is_active,
    deleted_at: c.deleted_at,
    component_type: c.component_type as unknown as { component_kind: string } | null,
  }));

  const gross = calculateGrossSalary(components);
  const hasActiveHold = (holdsRes.data ?? []).length > 0;

  const readiness = checkWpsReadiness({
    wpsProfile: wpsRes.data ?? null,
    hasActivePayrollHold: hasActiveHold,
    hasSalaryComponents: components.filter((c) => c.is_active && !c.deleted_at).length > 0,
    grossSalary: gross,
  });

  return {
    success: true,
    data: {
      payrollStatus: profileRes.data?.payroll_status ?? null,
      grossSalary: gross,
      wpsReadiness: readiness,
      hasActiveHold,
      wpsStatus: wpsRes.data?.wps_status ?? null,
    },
  };
}

// ── Combobox Helpers ───────────────────────────────────────────────────────────

export async function listHrSalaryComponentTypesForPayroll(): Promise<
  ActionResult<SalaryComponentTypeOption[]>
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_salary_component_types")
    .select("id, code, name_en, component_kind, is_wps_component")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("sort_order");

  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as SalaryComponentTypeOption[] };
}

export async function listHrPayrollGroupsForPayroll(): Promise<
  ActionResult<PayrollGroupOption[]>
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_payroll_groups")
    .select("id, code, name_en, pay_frequency")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("name_en");

  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as PayrollGroupOption[] };
}

export async function listHrMohreEstablishmentsForPayroll(): Promise<
  ActionResult<MohreEstablishmentOption[]>
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_mohre_establishments")
    .select("id, establishment_number, establishment_name")
    .is("deleted_at", null)
    .order("establishment_name");

  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as MohreEstablishmentOption[] };
}
