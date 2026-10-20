"use server";
import { traceRequest } from "@/lib/performance/request";
import {saveWorkspaceRecord, type WorkspaceSaveResult} from "@/server/workspace-save";
import type {WorkspaceSaveContract} from "@/lib/workspace/save-contract";
import { workspaceValidationFailure } from "@/lib/workspace/field-errors";
import { canBrowseEmployees, getEmployeeAccess } from "@/lib/rbac/employee-access";
import { EMPLOYEE_PUBLIC_FIELDS } from "@/lib/hr/employee-public-fields";
import {employeeCreateSchema,employeeUpdateSchema,employeeCreateShape,employeeDate,isDefiniteEmployeeRejection} from '@/lib/hr/employee-contract';
import {employmentEventSchema,type EmployeeEmploymentEvent}from '@/lib/hr/employment-event-contract';

import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
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

export type EmployeeRow = {
  id: number;
  employee_code: string;
  // Personal
  full_name_en: string;
  full_name_ar: string | null;
  known_name: string | null;
  gender: "male" | "female";
  nationality_id: number | null;
  date_of_birth: string;
  marital_status: string | null;
  mobile_number: string;
  personal_email: string | null;
  uae_address: string | null;
  home_country_address: string | null;
  blood_group: string | null;
  photo_dms_document_id: number | null;
  // Employment
  owner_company_id: number;
  branch_id: number | null;
  department_id: number | null;
  designation_id: number | null;
  employee_category_id: number | null;
  employment_type_id: number | null;
  joining_date: string;
  actual_joining_date: string | null;
  employee_status: string;
  reporting_manager_id: number | null;
  supervisor_id: number | null;
  primary_work_site_id: number | null;
  sponsor_company_id: number | null;
  mohre_establishment_id: number | null;
  // Contract
  probation_start_date: string | null;
  probation_end_date: string | null;
  contract_type: string | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  notice_period_days: number | null;
  // Status extras
  inactive_date: string | null;
  inactive_reason: string | null;
  // Emergency
  emergency_contact_name: string;
  emergency_contact_mobile: string;
  emergency_contact_relationship_type_id: number | null;
  // Metadata
  created_at: string;
  updated_at: string;
  workspace_revision: number;
  created_by: number | null;
  updated_by: number | null;
  deleted_at: string | null;
  deleted_by: number | null;
};

export type EmployeeListRow = EmployeeRow & {
  /** A failed sensitive projection must not masquerade as a known null value. */
  medical_field_unavailable?:true;
  nationality?: { id: number; name_en: string } | null;
  owner_company?: { id: number; legal_name_en: string; company_code: string } | null;
  branch?: { id: number; branch_name_en: string; branch_code: string } | null;
  department?: { id: number; department_name_en: string } | null;
  designation?: { id: number; designation_name_en: string } | null;
  employee_category?: { id: number; name_en: string } | null;
  employment_type?: { id: number; name_en: string } | null;
  primary_work_site?: { id: number; site_name: string } | null;
  mohre_establishment?: {
    id: number;
    establishment_name: string;
    establishment_number: string;
  } | null;
};

export type EmployeeStatusEvent = {
  id: number;
  employee_id: number;
  old_status: string | null;
  new_status: string;
  reason: string | null;
  effective_date: string | null;
  created_at: string;
  created_by: number | null;
};

// ============================================================================
// Zod Schemas
// ============================================================================

const employeeListParamsSchema = z.object({
  search: z.string().optional(),
  ownerCompanyId: z.number().int().positive().optional(),
  branchId: z.number().int().positive().optional(),
  departmentId: z.number().int().positive().optional(),
  designationId: z.number().int().positive().optional(),
  employeeCategoryId: z.number().int().positive().optional(),
  employmentTypeId: z.number().int().positive().optional(),
  employeeStatus: z.string().optional(),
  nationalityId: z.number().int().positive().optional(),
  primaryWorkSiteId: z.number().int().positive().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
});

export type EmployeeCreateInput = z.infer<typeof employeeCreateSchema>;
export type EmployeeUpdateInput = z.infer<typeof employeeUpdateSchema>;
export type EmployeeListParams = z.infer<typeof employeeListParamsSchema>;

// ============================================================================
// listEmployees
// ============================================================================

export async function listEmployees(params?: Partial<EmployeeListParams>) {
  return traceRequest("employees.list", () => listEmployeesImpl(params));
}

async function listEmployeesImpl(params?: Partial<EmployeeListParams>): Promise<
  ActionResult<{ rows: EmployeeListRow[]; totalCount: number; page: number; pageSize: number }>
> {
  try {
    const ctx = await getAuthContext();
    if (!canBrowseEmployees(ctx)) {
      return { success: false, error: "Permission denied" };
    }

    const parsed = employeeListParamsSchema.safeParse(params ?? {});
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }

    const {
      search,
      ownerCompanyId,
      branchId,
      departmentId,
      designationId,
      employeeCategoryId,
      employmentTypeId,
      employeeStatus,
      nationalityId,
      primaryWorkSiteId,
      page,
      pageSize,
    } = parsed.data;

    const supabase = await createClient();

    const JOINS = [
      "nationality:countries(id,name_en)",
      "owner_company:owner_companies!employees_owner_company_id_fkey(id,legal_name_en,company_code)",
      "branch:branches(id,branch_name_en,branch_code)",
      "department:departments(id,department_name_en)",
      "designation:designations(id,designation_name_en)",
      "employee_category:hr_employee_categories(id,name_en)",
      "employment_type:hr_employment_types(id,name_en)",
      "primary_work_site:work_sites(id,site_name)",
      "mohre_establishment:hr_mohre_establishments!employees_mohre_establishment_id_fkey(id,establishment_name,establishment_number)",
    ].join(",");

    let query = supabase
      .from("employees")
      .select(`${EMPLOYEE_PUBLIC_FIELDS},${JOINS}`, { count: "exact" })
      .is("deleted_at", null);

    if (search) {
      query = query.or(
        `employee_code.ilike.%${search}%,full_name_en.ilike.%${search}%,full_name_ar.ilike.%${search}%,known_name.ilike.%${search}%,mobile_number.ilike.%${search}%,personal_email.ilike.%${search}%`
      );
    }
    if (ownerCompanyId) query = query.eq("owner_company_id", ownerCompanyId);
    if (branchId) query = query.eq("branch_id", branchId);
    if (departmentId) query = query.eq("department_id", departmentId);
    if (designationId) query = query.eq("designation_id", designationId);
    if (employeeCategoryId) query = query.eq("employee_category_id", employeeCategoryId);
    if (employmentTypeId) query = query.eq("employment_type_id", employmentTypeId);
    if (employeeStatus) query = query.eq("employee_status", employeeStatus);
    if (nationalityId) query = query.eq("nationality_id", nationalityId);
    if (primaryWorkSiteId) query = query.eq("primary_work_site_id", primaryWorkSiteId);

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query
      .order("employee_code", { ascending: true })
      .range(from, to);

    if (error) {
      logger.error("listEmployees error", error);
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data: {
        rows: (data ?? []).map(row=>({...row as unknown as Omit<EmployeeListRow,"blood_group">,blood_group:null})),
        totalCount: count ?? 0,
        page,
        pageSize,
      },
    };
  } catch (err) {
    logger.error("listEmployees exception", err);
    return { success: false, error: "Failed to list employees" };
  }
}

// ============================================================================
// getEmployee
// ============================================================================

export async function getEmployee(employeeId: number): Promise<ActionResult<EmployeeListRow>> {
  try {
    const ctx = await getAuthContext();
    if (!canBrowseEmployees(ctx)) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();

    const JOINS = [
      "nationality:countries(id,name_en)",
      "owner_company:owner_companies!employees_owner_company_id_fkey(id,legal_name_en,company_code)",
      "branch:branches(id,branch_name_en,branch_code)",
      "department:departments(id,department_name_en)",
      "designation:designations(id,designation_name_en)",
      "employee_category:hr_employee_categories(id,name_en)",
      "employment_type:hr_employment_types(id,name_en)",
      "primary_work_site:work_sites(id,site_name)",
      "mohre_establishment:hr_mohre_establishments!employees_mohre_establishment_id_fkey(id,establishment_name,establishment_number)",
    ].join(",");

    const { data, error } = await supabase
      .from("employees")
      .select(`${EMPLOYEE_PUBLIC_FIELDS},${JOINS}`)
      .eq("id", employeeId)
      .is("deleted_at", null)
      .single();

    if (error) {
      logger.error("getEmployee error", error);
      return { success: false, error: error.message };
    }

    try {
      const medical = await supabase.rpc("f03_employee_blood_group", { employee_id: employeeId });
      const value = z.enum(['A+','A-','B+','B-','O+','O-','AB+','AB-']).nullable().safeParse(medical.data);
      if (!medical.error && value.success) return {success:true,data:{...data as unknown as Omit<EmployeeListRow,'blood_group'>,blood_group:value.data}};
    } catch { /* A separate field outage must not hide an authorized profile. */ }
    return {success:true,data:{...data as unknown as Omit<EmployeeListRow,'blood_group'>,blood_group:null,medical_field_unavailable:true}};
  } catch (err) {
    logger.error("getEmployee exception", err);
    return { success: false, error: "Failed to get employee" };
  }
}

// ============================================================================
// getEmployeeOverview
// ============================================================================

export type EmployeeOverview = {
  employee: EmployeeListRow;
  statusHistory: EmployeeStatusEvent[];
};

export async function getEmployeeOverview(
  employeeId: number
): Promise<ActionResult<EmployeeOverview>> {
  try {
    const ctx = await getAuthContext();
    if (!canBrowseEmployees(ctx)) {
      return { success: false, error: "Permission denied" };
    }

    const [empResult, histResult] = await Promise.all([
      getEmployee(employeeId),
      getEmployeeStatusHistory(employeeId),
    ]);

    if (!empResult.success || !empResult.data) {
      return { success: false, error: empResult.error ?? "Employee not found" };
    }
    if(!histResult.success)return {success:false,error:histResult.error??'Employee history could not be loaded.'};

    return {
      success: true,
      data: {
        employee: empResult.data,
        statusHistory: histResult.data ?? [],
      },
    };
  } catch (err) {
    logger.error("getEmployeeOverview exception", err);
    return { success: false, error: "Failed to get employee overview" };
  }
}

// ============================================================================
// createEmployee
// ============================================================================

export async function createEmployee(input: EmployeeCreateInput, contract: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  const ctx=await getAuthContext();
  if(!hasPermission(ctx,"hr.employees.create")&&!ctx.roleCodes?.includes("system_admin")) return {success:false,error:"Permission denied"};
  const parsed=employeeCreateSchema.safeParse(input);
  if(!parsed.success) return workspaceValidationFailure(parsed.error.issues);
  const result=await saveWorkspaceRecord("employees",null,parsed.data,contract);
  if(result.success){try{revalidatePath("/admin/hr/employees");}catch{logger.warn('Employee saved; list refresh unavailable');}}
  return result;
}

// ============================================================================
// updateEmployee
// ============================================================================

export async function updateEmployee(employeeId: number,input: EmployeeUpdateInput,contract: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  const ctx=await getAuthContext();
  if(!hasPermission(ctx,"hr.employees.update")&&!ctx.roleCodes?.includes("system_admin")) return {success:false,error:"Permission denied"};
  const parsed=employeeUpdateSchema.safeParse(input);
  if(!parsed.success) return workspaceValidationFailure(parsed.error.issues);
  const access=await getEmployeeAccess(ctx,employeeId);
  if(!access.allows("hr.medical.manage")) delete parsed.data.blood_group;
  const result=await saveWorkspaceRecord("employees",employeeId,parsed.data,contract);
  if(result.success) {try{revalidatePath("/admin/hr/employees");revalidatePath(`/admin/hr/employees/record/${employeeId}`);}catch{logger.warn('Employee saved; record refresh unavailable');}}
  return result;
}

// ============================================================================
// archiveEmployee
// ============================================================================

export async function archiveEmployee(
  employeeId: number,
  reason: string,
  contract: WorkspaceSaveContract,
  effectiveDate: string
): Promise<WorkspaceSaveResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.employees.archive") && !ctx.roleCodes?.includes("system_admin")) {
      return { success: false, error: "Permission denied" };
    }

    const parsed=z.object({id:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),reason:z.string().trim().min(1).max(2000),effectiveDate:employeeDate,operationId:z.string().uuid(),revision:z.string().regex(/^[1-9]\d*$/)}).safeParse({id:employeeId,reason,effectiveDate,...contract});
    if(!parsed.success)return workspaceValidationFailure(parsed.error.issues);
    const supabase=await createClient();
    const result=await supabase.rpc('f11_archive_employee',{p_operation:parsed.data.operationId,p_id:parsed.data.id,p_revision:parsed.data.revision,p_reason:parsed.data.reason,p_effective:parsed.data.effectiveDate});
    if(result.error){const code=result.error.code;return {success:false,uncertain:!isDefiniteEmployeeRejection(code),error:code==='P0409'?'This employee changed. Reopen the latest record before archiving.':code==='42501'?'Employee unavailable or archive permission changed.':'Archive unconfirmed or rejected. Keep the same request to reconcile safely.'};}
    const receipt=z.object({id:z.literal(employeeId),revision:z.string().regex(/^[1-9]\d*$/),replayed:z.boolean()}).safeParse(result.data);
    if(!receipt.success)return {success:false,uncertain:true,error:'Archive response incomplete. Retry the unchanged request.'};

    try{revalidatePath("/admin/hr/employees");revalidatePath(`/admin/hr/employees/record/${employeeId}`);}catch{logger.warn('Employee archived; list refresh unavailable');}

    return { success: true,data:receipt.data };
  } catch (err) {
    logger.error("archiveEmployee exception", err);
    return { success: false,uncertain:true, error: "Archive unconfirmed. Retry the unchanged request." };
  }
}

// ============================================================================
// changeEmployeeStatus
// ============================================================================

export async function changeEmployeeStatus(
  employeeId: number,
  newStatus: string,
  reason: string,
  effectiveDate: string,
  contract: WorkspaceSaveContract
): Promise<WorkspaceSaveResult> {
  const status=employeeCreateShape.employee_status.safeParse(newStatus);
  if(!status.success||typeof reason!=='string'||!reason.trim())return {success:false,error:'Select a valid status and enter a reason.'};
  return updateEmployee(employeeId,{employee_status:status.data,employment_change_reason:reason,employment_effective_date:effectiveDate},contract);
}

// ============================================================================
// getEmployeeStatusHistory
// ============================================================================

export async function getEmployeeStatusHistory(
  employeeId: number
): Promise<ActionResult<EmployeeStatusEvent[]>> {
  try {
    const ctx = await getAuthContext();
    if (!canBrowseEmployees(ctx)) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("employee_status_events")
      .select("*")
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("getEmployeeStatusHistory error", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: (data ?? []) as EmployeeStatusEvent[] };
  } catch (err) {
    logger.error("getEmployeeStatusHistory exception", err);
    return { success: false, error: "Failed to get status history" };
  }
}

export type {EmployeeEmploymentEvent};
export async function getEmployeeEmploymentHistory(employeeId:number,beforeId?:number):Promise<ActionResult<{rows:EmployeeEmploymentEvent[];nextCursor:number|null}>>{
  const ctx=await getAuthContext();
  if(!canBrowseEmployees(ctx))return {success:false,error:'Permission denied'};
  if(!Number.isSafeInteger(employeeId)||employeeId<=0||(beforeId!==undefined&&(!Number.isSafeInteger(beforeId)||beforeId<=0)))return {success:false,error:'Invalid history request'};
  try{
    const client=await createClient();
    const subject=await client.from('employees').select('id').eq('id',employeeId).is('deleted_at',null).maybeSingle();
    if(subject.error||!subject.data)return {success:false,error:'Employee unavailable'};
    let query=client.from('employee_employment_events').select('id,employee_id,old_values,new_values,reason,effective_date,created_at,created_by,revision').eq('employee_id',employeeId).order('id',{ascending:false}).limit(51);
    if(beforeId!==undefined)query=query.lt('id',beforeId);
    const result=await query;
    if(result.error)return {success:false,error:'Employment history could not be loaded. Retry without changing the employee.'};
    const rows=z.array(employmentEventSchema).max(51).parse(result.data);
    if(rows.some((row,index)=>row.employee_id!==employeeId||(beforeId!==undefined&&row.id>=beforeId)||(index>0&&row.id>=rows[index-1].id)))throw Error('Invalid history projection');
    return {success:true,data:{rows:rows.slice(0,50),nextCursor:rows.length>50?rows[49].id:null}};
  }catch{return {success:false,error:'Employment history could not be loaded. Retry without changing the employee.'};}
}

export async function reconcileEmployeeOperation(operationId:string):Promise<WorkspaceSaveResult>{
 if(!z.string().uuid().safeParse(operationId).success)return {success:false,error:'Invalid recovery identity'};
 try{
  const ctx=await getAuthContext();if(!ctx.profile||!ctx.isAccountActive||ctx.profile.must_change_password)return {success:false,error:'Permission denied',uncertain:true};
  const client=await createClient(),result=await client.rpc('f11_reconcile_employee',{p_operation:operationId});
  if(result.error||result.data===null)return {success:false,uncertain:true,error:'Earlier save remains unresolved or unavailable. No private fields were replayed.'};
  const receipt=z.object({id:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),revision:z.string().regex(/^[1-9]\d*$/),replayed:z.literal(true)}).safeParse(result.data);
  return receipt.success?{success:true,data:receipt.data}:{success:false,uncertain:true,error:'Recovery response could not be verified'};
 }catch{return {success:false,uncertain:true,error:'Recovery unconfirmed. No private fields were replayed.'};}
}
