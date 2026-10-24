"use server";

import { isActiveBlock } from "@/lib/hr/operations/status";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { createClient } from "@/lib/supabase/server";
import{childSaveContract,type ChildSaveContract,type ChildSaveResult}from "@/lib/hr/child-save-contract";
import{canUseHrChild}from "@/lib/hr/child-authority";
import{mutateHrChild}from "./child-mutation";
import{OPERATION_ITEM_TABLES,type OperationItemKind}from '@/lib/hr/operation-item-contract';

// ── Types ──────────────────────────────────────────────────────────────────

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

// ── Helpers ────────────────────────────────────────────────────────────────


// ── Zod Schemas ────────────────────────────────────────────────────────────

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
       owner_companies(id, name:legal_name_en),
       branches(id, name:branch_name_en),
       departments(id, name_en:department_name_en),
       designations(id, name_en:designation_name_en),
       work_sites(id, name_en:site_name),
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
  const today = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const { data, error } = await supabase
    .from("employee_assignments")
    .select(
      `id, assignment_type, assignment_status, effective_from, effective_to, notes,
       owner_companies(id, name:legal_name_en),
       branches(id, name:branch_name_en),
       departments(id, name_en:department_name_en),
       designations(id, name_en:designation_name_en),
       work_sites(id, name_en:site_name)`
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
       employees!employee_assignments_employee_id_fkey(id, full_name_en, employee_code),
       owner_companies(id, name:legal_name_en),
       departments(id, name_en:department_name_en),
       designations(id, name_en:designation_name_en),
       work_sites(id, name_en:site_name)`,
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

export async function createEmployeeAssignment(employeeId:number,input:unknown,contract?:ChildSaveContract):Promise<ChildSaveResult>{
 return mutateHrChild({kind:'assignment',employeeId,id:null,revision:null,action:'create',values:input},contract);
}
async function changeAssignment(id:number,action:'update'|'archive',values:unknown,contract?:ChildSaveContract):Promise<ChildSaveResult>{
 const checked=childSaveContract.safeParse(contract);
 if(!Number.isSafeInteger(id)||id<1||!checked.success||checked.data.revision===null)return{success:false,error:'The original assignment opening revision and operation identity are required.'};
 if(!canUseHrChild(await getAuthContext(),'assignment'))return{success:false,error:'Current assignment access is unavailable.',accessDenied:true};
 const row=await(await createClient()).from('employee_assignments').select('employee_id').eq('id',id).is('deleted_at',null).maybeSingle();
 if(row.error||!row.data||!Number.isSafeInteger(row.data.employee_id))return{success:false,error:'Current assignment scope could not be verified.'};
 return mutateHrChild({kind:'assignment',employeeId:row.data.employee_id,id,revision:checked.data.revision,action,values},checked.data);
}
export async function updateEmployeeAssignment(id:number,input:unknown,contract?:ChildSaveContract):Promise<ChildSaveResult>{return changeAssignment(id,'update',input,contract);}
export async function archiveEmployeeAssignment(id:number,contract?:ChildSaveContract):Promise<ChildSaveResult>{return changeAssignment(id,'archive',{},contract);}

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
       designations(id, name_en:designation_name_en)`
    )
    .eq("employee_id", employeeId)
    .is("deleted_at", null)
    .order("requirement_type");

  if (params?.status) query = query.eq("status", params.status);

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data: data ?? [] };
}

export async function createEmployeeRoleRequirement(employeeId:number,input:unknown,contract?:ChildSaveContract):Promise<ChildSaveResult>{return mutateHrChild({kind:'role-requirement',employeeId,id:null,revision:null,action:'create',values:input},contract);}
async function changeRoleRequirement(id:number,action:'update'|'waive'|'archive',values:unknown,contract?:ChildSaveContract):Promise<ChildSaveResult>{
 if(!Number.isSafeInteger(id)||id<1||!childSaveContract.safeParse(contract).success||!contract?.revision)return{success:false,error:'Reopen the original requirement and preserve its operation identity.'};
 try{
  if(!canUseHrChild(await getAuthContext(),'role-requirement'))return{success:false,error:'Permission denied',accessDenied:true};
  const r=await(await createClient()).from('employee_role_requirements').select('employee_id').eq('id',id).is('deleted_at',null).maybeSingle();
  if(r.error||!r.data||!Number.isSafeInteger(r.data.employee_id)||r.data.employee_id<1)return{success:false,error:'Current original requirement access is unavailable.'};
  return mutateHrChild({kind:'role-requirement',employeeId:r.data.employee_id,id,revision:contract.revision,action,values},contract);
 }catch{return{success:false,error:'The original requirement could not be verified. No request was sent.'};}
}
export async function updateEmployeeRoleRequirement(id:number,input:unknown,contract?:ChildSaveContract):Promise<ChildSaveResult>{return changeRoleRequirement(id,'update',input,contract);}
export async function archiveEmployeeRoleRequirement(id:number,contract?:ChildSaveContract):Promise<ChildSaveResult>{return changeRoleRequirement(id,'archive',{},contract);}
export async function waiveEmployeeRoleRequirement(id:number,reason:string,contract?:ChildSaveContract):Promise<ChildSaveResult>{return changeRoleRequirement(id,'waive',{waiver_reason:reason},contract);}
export async function recalculateEmployeeRoleRequirements(employeeId:number,fingerprint:string,contract?:ChildSaveContract):Promise<ChildSaveResult>{return mutateHrChild({kind:'requirements-refresh',employeeId,id:null,revision:null,action:'create',values:{fingerprint}},contract);}

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
       work_sites(id, name_en:site_name),
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
       work_sites(id, name_en:site_name)`,
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

export async function recalculateEmployeeSiteReadiness(employeeId:number,workSiteId:number,fingerprint:string,contract:ChildSaveContract):Promise<ChildSaveResult>{
 return mutateHrChild({kind:'site-readiness',employeeId,id:null,revision:null,action:'create',values:{work_site_id:workSiteId,fingerprint}},contract);
}
/** No implicit bulk writes. Each reviewed site keeps its original operation and
 * outcome; stop at the first unconfirmed/failed command without claiming rollback. */
export async function recalculateAllEmployeeSiteReadiness(employeeId:number,commands:readonly{workSiteId:number;fingerprint:string;contract:ChildSaveContract}[]):Promise<{success:boolean;results:ChildSaveResult[];error?:string}>{
 if(!Array.isArray(commands)||commands.length===0||commands.length>100||new Set(commands.map(c=>c.workSiteId)).size!==commands.length)return{success:false,results:[],error:'Review a finite, unique set of site operations first.'};
 const results:ChildSaveResult[]=[];
 for(const command of commands){const result=await recalculateEmployeeSiteReadiness(employeeId,command.workSiteId,command.fingerprint,command.contract);results.push(result);if(!result.success)return{success:false,results,error:'The batch stopped. Check each earlier receipt; no rollback is inferred.'};}
 return{success:true,results};
}
export async function updateEmployeeSiteReadinessNotes(id:number,notes:string|null,contract:ChildSaveContract):Promise<ChildSaveResult>{
 const ctx=await getAuthContext();if(!ctx||!canUseHrChild(ctx,'site-readiness')||!childSaveContract.safeParse(contract).success)return{success:false,error:'The original readiness revision and current authority are required.'};
 const row=await(await createClient()).from('employee_site_readiness').select('id,employee_id').eq('id',id).is('deleted_at',null).maybeSingle();
 if(row.error||!row.data)return{success:false,error:'Original readiness unavailable.'};
 return mutateHrChild({kind:'site-readiness',employeeId:row.data.employee_id,id,revision:contract.revision,action:'update',values:{notes}},contract);
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

export async function createEmployeeOperationalBlock(employeeId:number,input:unknown,contract?:ChildSaveContract):Promise<ChildSaveResult>{
 return mutateHrChild({kind:'operational-block',employeeId,id:null,revision:null,action:'create',values:input},contract);
}
async function changeOperationalBlock(id:number,action:'release'|'archive',values:unknown,contract?:ChildSaveContract):Promise<ChildSaveResult>{
 if(!Number.isSafeInteger(id)||id<1||!childSaveContract.safeParse(contract).success||!contract?.revision)return{success:false,error:'Reopen the original block and preserve its operation identity.'};
 try{
  if(!canUseHrChild(await getAuthContext(),'operational-block'))return{success:false,error:'Permission denied',accessDenied:true};
  const row=await(await createClient()).from('employee_operational_blocks').select('employee_id').eq('id',id).is('deleted_at',null).maybeSingle();
  if(row.error||!row.data||!Number.isSafeInteger(row.data.employee_id)||row.data.employee_id<1)return{success:false,error:'Current original block access is unavailable.'};
  return mutateHrChild({kind:'operational-block',employeeId:row.data.employee_id,id,revision:contract.revision,action,values},contract);
 }catch{return{success:false,error:'The original block could not be verified. No request was sent.'};}
}
export async function releaseEmployeeOperationalBlock(id:number,releaseReason:string,contract?:ChildSaveContract):Promise<ChildSaveResult>{return changeOperationalBlock(id,'release',{release_reason:releaseReason},contract);}
export async function archiveEmployeeOperationalBlock(id:number,contract?:ChildSaveContract):Promise<ChildSaveResult>{return changeOperationalBlock(id,'archive',{},contract);}

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

async function changeOperationItem(kind:OperationItemKind,id:number,action:'update'|'archive'|'return'|'end',values:unknown,contract?:ChildSaveContract):Promise<ChildSaveResult>{
 const checked=childSaveContract.safeParse(contract);if(!Number.isSafeInteger(id)||id<1||!checked.success||checked.data.revision===null)return{success:false,error:'The original operational opening revision and operation identity are required.'};
 if(!canUseHrChild(await getAuthContext(),kind))return{success:false,error:'Current operational access is unavailable.',accessDenied:true};
 const row=await(await createClient()).from(OPERATION_ITEM_TABLES[kind]).select('employee_id').eq('id',id).is('deleted_at',null).maybeSingle();
 if(row.error||!row.data||!Number.isSafeInteger(row.data.employee_id))return{success:false,error:'Current operational scope could not be verified.'};
 return mutateHrChild({kind,employeeId:row.data.employee_id,id,revision:checked.data.revision,action,values},checked.data);
}

export async function createEmployeeAsset(employeeId:number,input:unknown,contract?:ChildSaveContract):Promise<ChildSaveResult>{return mutateHrChild({kind:'asset',employeeId,id:null,revision:null,action:'create',values:input},contract);}
export async function updateEmployeeAsset(id:number,input:unknown,contract?:ChildSaveContract):Promise<ChildSaveResult>{return changeOperationItem('asset',id,'update',input,contract);}
export async function returnEmployeeAsset(id:number,input:unknown,contract?:ChildSaveContract):Promise<ChildSaveResult>{return changeOperationItem('asset',id,'return',input,contract);}
export async function archiveEmployeeAsset(id:number,contract?:ChildSaveContract):Promise<ChildSaveResult>{return changeOperationItem('asset',id,'archive',{},contract);}

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


export async function createEmployeePpeIssue(employeeId:number,input:unknown,contract?:ChildSaveContract):Promise<ChildSaveResult>{return mutateHrChild({kind:'ppe',employeeId,id:null,revision:null,action:'create',values:input},contract);}
export async function updateEmployeePpeIssue(id:number,input:unknown,contract?:ChildSaveContract):Promise<ChildSaveResult>{return changeOperationItem('ppe',id,'update',input,contract);}
export async function returnEmployeePpeIssue(id:number,input:unknown,contract?:ChildSaveContract):Promise<ChildSaveResult>{return changeOperationItem('ppe',id,'return',input,contract);}
export async function archiveEmployeePpeIssue(id:number,contract?:ChildSaveContract):Promise<ChildSaveResult>{return changeOperationItem('ppe',id,'archive',{},contract);}

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


export async function createEmployeeAccommodationRecord(employeeId:number,input:unknown,contract?:ChildSaveContract):Promise<ChildSaveResult>{return mutateHrChild({kind:'accommodation',employeeId,id:null,revision:null,action:'create',values:input},contract);}
export async function updateEmployeeAccommodationRecord(id:number,input:unknown,contract?:ChildSaveContract):Promise<ChildSaveResult>{return changeOperationItem('accommodation',id,'update',input,contract);}
export async function endEmployeeAccommodationRecord(id:number,input:unknown,contract?:ChildSaveContract):Promise<ChildSaveResult>{return changeOperationItem('accommodation',id,'end',input,contract);}
export async function archiveEmployeeAccommodationRecord(id:number,contract?:ChildSaveContract):Promise<ChildSaveResult>{return changeOperationItem('accommodation',id,'archive',{},contract);}

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
  const today = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

  const [assignmentResult, blocksResult, assetsResult, ppeResult, accommodationResult, readinessResult] =
    await Promise.all([
      supabase
        .from("employee_assignments")
        .select(`id, assignment_type, assignment_status, effective_from, effective_to, departments(name_en:department_name_en), designations(name_en:designation_name_en), work_sites(name_en:site_name)`)
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
        .select("id, readiness_status, work_sites(name_en:site_name), checked_at")
        .eq("employee_id", employeeId)
        .is("deleted_at", null)
        .order("checked_at", { ascending: false }),
    ]);

  if([assignmentResult,blocksResult,assetsResult,ppeResult,accommodationResult,readinessResult].some(result=>result.error))return{success:false,error:'Current operations dependencies are unavailable; no assignment, custody or readiness conclusion is confirmed.'};
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
      .select("id, readiness_status, work_sites(name_en:site_name), checked_at, missing_requirements_json")
      .eq("employee_id", employeeId)
      .is("deleted_at", null)
      .order("checked_at", { ascending: false }),
  ]);

  if (blocksResult.error || readinessResult.error) return {success:false,error:'Current readiness dependencies are unavailable; readiness is not confirmed.'};
  const activeBlocks = (blocksResult.data ?? []).filter(isActiveBlock);
  const siteRecords = readinessResult.data ?? [];

  let overallStatus = "not_ready";
  if (activeBlocks.length > 0) {
    overallStatus = "blocked";
  } else if (siteRecords.length === 0) {
    overallStatus = "needs_review";
  } else if (siteRecords.every((r) => r.readiness_status === "ready")) {
    // Saved calculations are history, not a current-source deployment decision.
    overallStatus = "needs_review";
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
