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
 *   - All writes: createClient() + subject-scoped payroll/banking RLS
 *   - Sensitive data: IBAN/account never in audit, salary masked for unauthorized
 *   - No payroll run, no payslips, no accounting
 */

import { createClient } from "@/lib/supabase/server";

import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { z } from "zod";
import{childSaveContract,type ChildSaveContract,type ChildSaveResult}from'@/lib/hr/child-save-contract';
import{employeeId as payrollEmployeeId}from'@/lib/hr/employee-contract';
import{canUseHrChild}from'@/lib/hr/child-authority';
import{PAYROLL_CHILD_TABLES,type PayrollChildKind}from'@/lib/hr/payroll-child-contract';
import{mutateHrChild}from'./child-mutation';
async function mutateOriginalPayroll(kind:PayrollChildKind,id:number,action:'update'|'archive'|'release',input:unknown,contract:ChildSaveContract):Promise<ChildSaveResult>{
 if(!payrollEmployeeId.safeParse(id).success||!childSaveContract.safeParse(contract).success||contract.revision===null||!canUseHrChild(await getAuthContext(),kind))return{success:false,error:'Original payroll revision and current access required.'};
 const r=await(await createClient()).from(PAYROLL_CHILD_TABLES[kind]).select('id,employee_id').eq('id',id).is('deleted_at',null).maybeSingle();
 if(r.error||!r.data)return{success:false,error:'Original payroll record unavailable.'};
 return mutateHrChild({kind,employeeId:r.data.employee_id,id,revision:contract.revision,action,values:input},contract);
}
import {
  redactWpsProfile,
  redactSalaryComponent,
  redactSalaryRevision,
  maskMoney,
} from "@/lib/hr/payroll/redaction";
import {
  checkWpsReadiness,
  calculateGrossSalary,
  calculateBasicSalary,
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
  approver?: { display_name: string } | null;
  creator?: { display_name: string } | null;
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
  releaser?: { display_name: string } | null;
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





/** End-date active basic component(s) and insert a new basic row from revision effective date. */

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

export async function createOrUpdateEmployeePayrollProfile(employeeId:number,input:unknown,contract:ChildSaveContract,originalId:number|null):Promise<ChildSaveResult>{return mutateHrChild({kind:'payroll-profile',employeeId,id:originalId,revision:contract?.revision,action:originalId===null?'create':'update',values:input},contract);}

export async function archiveEmployeePayrollProfile(id:number,contract:ChildSaveContract):Promise<ChildSaveResult>{return mutateOriginalPayroll('payroll-profile',id,'archive',{},contract);}

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

export async function createEmployeeSalaryComponent(employeeId:number,input:unknown,contract:ChildSaveContract):Promise<ChildSaveResult>{return mutateHrChild({kind:'salary-component',employeeId,id:null,revision:null,action:'create',values:input},contract);}

export async function updateEmployeeSalaryComponent(id:number,input:unknown,contract:ChildSaveContract):Promise<ChildSaveResult>{return mutateOriginalPayroll('salary-component',id,'update',input,contract);}

export async function archiveEmployeeSalaryComponent(id:number,contract:ChildSaveContract):Promise<ChildSaveResult>{return mutateOriginalPayroll('salary-component',id,'archive',{},contract);}

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

export async function calculateEmployeeBasicSalary(
  employeeId: number
): Promise<ActionResult<{ basic: number }>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "hr.payroll.view"))
    return { success: false, error: "Permission denied: hr.payroll.view required" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_salary_components")
    .select("amount, is_active, deleted_at, component_type:hr_salary_component_types!employee_salary_components_component_type_id_fkey(is_basic)")
    .eq("employee_id", employeeId)
    .is("deleted_at", null);

  if (error) return { success: false, error: error.message };

  const basic = calculateBasicSalary(
    (data ?? []).map((c) => ({
      amount: Number(c.amount) || 0,
      is_active: c.is_active,
      deleted_at: c.deleted_at,
      component_type: c.component_type as unknown as { is_basic?: boolean } | null,
    }))
  );
  return { success: true, data: { basic } };
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
    .select("*, approver:user_profiles!employee_salary_revisions_approved_by_fkey(display_name), creator:user_profiles!employee_salary_revisions_created_by_fkey(display_name)")
    .eq("employee_id", employeeId)
    .order("effective_date", { ascending: false });

  if (error) return { success: false, error: error.message };

  const rows = (data ?? []).map((r) =>
    redactSalaryRevision(r as SalaryRevisionRow, canView)
  );
  return { success: true, data: rows };
}

export async function createEmployeeSalaryRevision(employeeId:number,input:unknown,contract:ChildSaveContract):Promise<ChildSaveResult>{return mutateHrChild({kind:'salary-revision',employeeId,id:null,revision:null,action:'create',values:input},contract);}

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
    .select("*, releaser:user_profiles!employee_payroll_holds_released_by_fkey(display_name)")
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

export async function placeEmployeePayrollHold(employeeId:number,input:unknown,contract:ChildSaveContract):Promise<ChildSaveResult>{return mutateHrChild({kind:'payroll-hold',employeeId,id:null,revision:null,action:'create',values:input},contract);}

export async function releaseEmployeePayrollHold(id:number,contract:ChildSaveContract):Promise<ChildSaveResult>{return mutateOriginalPayroll('payroll-hold',id,'release',{},contract);}

export async function archiveEmployeePayrollHold(id:number,contract:ChildSaveContract):Promise<ChildSaveResult>{return mutateOriginalPayroll('payroll-hold',id,'archive',{},contract);}

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

export async function createOrUpdateEmployeeWpsProfile(employeeId:number,input:unknown,contract:ChildSaveContract,originalId:number|null):Promise<ChildSaveResult>{return mutateHrChild({kind:'wps-profile',employeeId,id:originalId,revision:contract?.revision,action:originalId===null?'create':'update',values:input},contract);}

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
