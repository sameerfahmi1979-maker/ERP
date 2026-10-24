"use server";

/**
 * ERP HR.7 — HR Actions Server Actions
 *
 * Action groups:
 *   PRO Processes, HR Actions, Performance, Disciplinary,
 *   HR Notes, Approval Requests, EOS Cases, Clearance Items, Summary
 */

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { z } from "zod";
import{childSaveContract,clearanceCreateFields,type ChildSaveContract,type ChildSaveResult}from '@/lib/hr/child-save-contract';
import{canUseHrChild}from '@/lib/hr/child-authority';
import{mutateHrChild,readProProcessOpening}from './child-mutation';

// ── Types ──────────────────────────────────────────────────────────────────

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
  employee?: { full_name_en: string; employee_code: string } | null;
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
  const admin = await createClient();
  let query = admin
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

export async function createEmployeeProProcess(employeeId:number,input:unknown,contract?:ChildSaveContract):Promise<ChildSaveResult>{
 return mutateHrChild({kind:'pro-process',employeeId,id:null,revision:null,action:'create',values:input},contract);
}
async function proOpeningForChange(id:number,contract?:ChildSaveContract){
 const c=childSaveContract.safeParse(contract);
 if(!c.success||c.data.revision===null)return null;
 const ctx=await getAuthContext();
 if(!ctx.profile||!ctx.isAccountActive||ctx.profile.must_change_password||!hasPermission(ctx,'hr.actions.view')||!hasPermission(ctx,'hr.actions.manage'))return null;
 const r=await(await createClient()).from('employee_pro_processes').select('employee_id').eq('id',id).is('deleted_at',null).maybeSingle();
 return!r.error&&r.data?{employeeId:r.data.employee_id,contract:c.data}:null;
}
export async function updateEmployeeProProcess(id:number,input:unknown,contract?:ChildSaveContract):Promise<ChildSaveResult>{
 const opening=await proOpeningForChange(id,contract);
 if(!opening)return{success:false,error:'Current access and an original opening contract are required.'};
 return mutateHrChild({kind:'pro-process',employeeId:opening.employeeId,id,revision:opening.contract.revision,action:'update',values:input},opening.contract);
}
export async function archiveEmployeeProProcess(id:number,contract?:ChildSaveContract):Promise<ChildSaveResult>{
 const opening=await proOpeningForChange(id,contract);
 if(!opening)return{success:false,error:'Current access and an original opening contract are required.'};
 return mutateHrChild({kind:'pro-process',employeeId:opening.employeeId,id,revision:opening.contract.revision,action:'archive',values:{}},opening.contract);
}
export async function changeEmployeeProProcessStatus(id:number,status:string,notes?:string,contract?:ChildSaveContract):Promise<ChildSaveResult>{
 const opening=await proOpeningForChange(id,contract);
 if(!opening)return{success:false,error:'Current access and an original opening contract are required.'};
 const current=await readProProcessOpening(opening.employeeId,id);
 if(!current.success||!current.values)return{success:false,error:'The current process could not be verified.'};
 return mutateHrChild({kind:'pro-process',employeeId:opening.employeeId,id,revision:opening.contract.revision,action:'update',values:{...current.values,process_status:status,...(notes!==undefined?{notes}:{})}},opening.contract);
}

// =============================================================================
//
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
  const admin = await createClient();
  let query = admin
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

export async function createEmployeeHrAction(employeeId:number,input:unknown,contract?:ChildSaveContract):Promise<ChildSaveResult>{
 return mutateHrChild({kind:'hr-action',employeeId,id:null,revision:null,action:'create',values:input},contract);
}
async function hrOpeningForChange(id:number,contract?:ChildSaveContract){
 const c=childSaveContract.safeParse(contract);
 if(!c.success||c.data.revision===null)return null;
 const ctx=await getAuthContext();
 if(!ctx.profile||!ctx.isAccountActive||ctx.profile.must_change_password||!hasPermission(ctx,'hr.actions.view')||!hasPermission(ctx,'hr.actions.manage'))return null;
 const r=await(await createClient()).from('employee_hr_actions').select('employee_id').eq('id',id).is('deleted_at',null).maybeSingle();
 return!r.error&&r.data?{employeeId:r.data.employee_id,contract:c.data}:null;
}
export async function updateEmployeeHrAction(id:number,input:unknown,contract?:ChildSaveContract):Promise<ChildSaveResult>{
 const opening=await hrOpeningForChange(id,contract);
 if(!opening)return{success:false,error:'Current access and an original opening contract are required.'};
 return mutateHrChild({kind:'hr-action',employeeId:opening.employeeId,id,revision:opening.contract.revision,action:'update',values:input},opening.contract);
}
export async function archiveEmployeeHrAction(id:number,contract?:ChildSaveContract):Promise<ChildSaveResult>{
 const opening=await hrOpeningForChange(id,contract);
 if(!opening)return{success:false,error:'Current access and an original opening contract are required.'};
 return mutateHrChild({kind:'hr-action',employeeId:opening.employeeId,id,revision:opening.contract.revision,action:'archive',values:{}},opening.contract);
}
export async function closeEmployeeHrAction(id:number,notes?:string,contract?:ChildSaveContract):Promise<ChildSaveResult>{
 const opening=await hrOpeningForChange(id,contract);
 if(!opening)return{success:false,error:'Current access and an original opening contract are required.'};
 return mutateHrChild({kind:'hr-action',employeeId:opening.employeeId,id,revision:opening.contract.revision,action:'close',values:notes?{notes}:{}},opening.contract);
}
export async function cancelEmployeeHrAction(id:number,reason:string,contract?:ChildSaveContract):Promise<ChildSaveResult>{
 const opening=await hrOpeningForChange(id,contract);
 if(!opening)return{success:false,error:'Current access and an original opening contract are required.'};
 return mutateHrChild({kind:'hr-action',employeeId:opening.employeeId,id,revision:opening.contract.revision,action:'cancel',values:{reason}},opening.contract);
}

// =============================================================================
//
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


export async function createEmployeePerformanceRecord(employeeId:number,input:unknown,contract?:ChildSaveContract):Promise<ChildSaveResult>{
 return mutateHrChild({kind:'performance',employeeId,id:null,revision:null,action:'create',values:input},contract);
}
async function performanceOpeningForChange(id:number,contract?:ChildSaveContract){
 const checked=childSaveContract.safeParse(contract);
 if(!checked.success||checked.data.revision===null||!Number.isSafeInteger(id)||id<1)return null;
 const ctx=await getAuthContext();
 if(!ctx.profile||!ctx.isAccountActive||ctx.profile.must_change_password||!['hr.actions.view','hr.actions.manage','hr.confidential.view','hr.confidential.manage'].every(code=>hasPermission(ctx,code)))return null;
 const row=await(await createClient()).from('employee_performance_records').select('employee_id').eq('id',id).is('deleted_at',null).maybeSingle();
 return !row.error&&row.data&&Number.isSafeInteger(row.data.employee_id)?{employeeId:row.data.employee_id,contract:checked.data}:null;
}
async function changePerformance(id:number,action:'update'|'archive'|'submit'|'approve'|'close',values:unknown,contract?:ChildSaveContract):Promise<ChildSaveResult>{
 const opening=await performanceOpeningForChange(id,contract);
 if(!opening)return{success:false,error:'Current confidential access and the original opening contract are required.'};
 return mutateHrChild({kind:'performance',employeeId:opening.employeeId,id,revision:opening.contract.revision,action,values},opening.contract);
}
export async function updateEmployeePerformanceRecord(id:number,input:unknown,contract?:ChildSaveContract):Promise<ChildSaveResult>{return changePerformance(id,'update',input,contract);}
export async function archiveEmployeePerformanceRecord(id:number,contract?:ChildSaveContract):Promise<ChildSaveResult>{return changePerformance(id,'archive',{},contract);}
export async function submitEmployeePerformanceRecord(id:number,contract?:ChildSaveContract):Promise<ChildSaveResult>{return changePerformance(id,'submit',{},contract);}
export async function approveEmployeePerformanceRecord(id:number,contract?:ChildSaveContract):Promise<ChildSaveResult>{return changePerformance(id,'approve',{},contract);}
export async function closeEmployeePerformanceRecord(id:number,contract?:ChildSaveContract):Promise<ChildSaveResult>{return changePerformance(id,'close',{},contract);}

// =============================================================================
// // DISCIPLINARY
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
  const admin = await createClient();
  let query = admin
    .from("employee_disciplinary_records")
    .select("*, issued_by_profile:user_profiles!issued_by(display_name), employee:employees!employee_id(full_name_en, employee_code)")
    .is("deleted_at", null)
    .order("record_date", { ascending: false });
  if (params?.status) query = query.eq("status", params.status as string);
  if (params?.severity) query = query.eq("severity", params.severity as string);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as DisciplinaryRow[];
}


export async function createEmployeeDisciplinaryRecord(employeeId:number,input:unknown,contract?:ChildSaveContract):Promise<ChildSaveResult>{
 return mutateHrChild({kind:'disciplinary',employeeId,id:null,revision:null,action:'create',values:input},contract);
}
async function changeDisciplinary(id:number,action:'update'|'archive'|'acknowledge'|'close',values:unknown,contract?:ChildSaveContract):Promise<ChildSaveResult>{
 const checked=childSaveContract.safeParse(contract);if(!checked.success||checked.data.revision===null||!Number.isSafeInteger(id)||id<1)return{success:false,error:'The original opening contract is required.'};
 const ctx=await getAuthContext();if(!ctx.profile||!ctx.isAccountActive||ctx.profile.must_change_password||!['hr.actions.view','hr.actions.manage','hr.confidential.view','hr.confidential.manage'].every(code=>hasPermission(ctx,code)))return{success:false,error:'Current confidential access is unavailable.',accessDenied:true};
 const row=await(await createClient()).from('employee_disciplinary_records').select('employee_id').eq('id',id).is('deleted_at',null).maybeSingle();
 if(row.error||!row.data||!Number.isSafeInteger(row.data.employee_id))return{success:false,error:'Current disciplinary scope could not be verified.'};
 return mutateHrChild({kind:'disciplinary',employeeId:row.data.employee_id,id,revision:checked.data.revision,action,values},checked.data);
}
export async function updateEmployeeDisciplinaryRecord(id:number,input:unknown,contract?:ChildSaveContract):Promise<ChildSaveResult>{return changeDisciplinary(id,'update',input,contract);}
export async function archiveEmployeeDisciplinaryRecord(id:number,contract?:ChildSaveContract):Promise<ChildSaveResult>{return changeDisciplinary(id,'archive',{},contract);}
export async function acknowledgeEmployeeDisciplinaryRecord(id:number,contract?:ChildSaveContract):Promise<ChildSaveResult>{return changeDisciplinary(id,'acknowledge',{},contract);}
export async function closeEmployeeDisciplinaryRecord(id:number,notes?:string,contract?:ChildSaveContract):Promise<ChildSaveResult>{return changeDisciplinary(id,'close',notes?{notes}:{},contract);}

// =============================================================================
// // HR NOTES
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
  input: unknown,
  contract?:ChildSaveContract
): Promise<ChildSaveResult> {
  return mutateHrChild({kind:'hr-note',employeeId,id:null,revision:null,action:'create',values:input},contract);
}

export async function archiveEmployeeHrNote(id: number,contract?:ChildSaveContract): Promise<ChildSaveResult> {
  const c=childSaveContract.safeParse(contract);
  if(!c.success||c.data.revision===null)return{success:false,error:'Reopen the note with its current revision before archiving.'};
  try{
    const r=await(await createClient()).from('employee_hr_notes').select('employee_id').eq('id',id).is('deleted_at',null).maybeSingle();
    if(r.error||!r.data)return{success:false,error:'The note is unavailable with current access.'};
    return mutateHrChild({kind:'hr-note',employeeId:r.data.employee_id,id,revision:c.data.revision,action:'archive',values:{}},c.data);
  }catch{return{success:false,error:'Required note access could not be verified. No archive request was sent.'};}
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
    .select("*, approval_role:approval_roles(name:role_name), requested_by_profile:user_profiles!requested_by(display_name)")
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
  const admin = await createClient();
  let query = admin
    .from("employee_approval_requests")
    .select("*, approval_role:approval_roles(name:role_name), requested_by_profile:user_profiles!requested_by(display_name)")
    .is("deleted_at", null)
    .order("requested_at", { ascending: false });
  if (params?.status) query = query.eq("request_status", params.status as string);
  if (params?.type) query = query.eq("approval_type", params.type as string);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ApprovalRequestRow[];
}

export async function createEmployeeApprovalRequest(employeeId:number,input:unknown,contract?:ChildSaveContract):Promise<ChildSaveResult>{
 if(!contract)return{success:false,error:'The original save identity is required. Reopen the request.'};
 return mutateHrChild({kind:'approval',employeeId,id:null,revision:null,action:'create',values:input},contract);
}
async function changeApproval(id:number,action:'approve'|'reject'|'cancel'|'archive',values:unknown,contract?:ChildSaveContract):Promise<ChildSaveResult>{
 const checked=childSaveContract.safeParse(contract);
 if(!Number.isSafeInteger(id)||id<1||!checked.success||!checked.data.revision)return{success:false,error:'The original opening identity and revision are required.'};
 const ctx=await getAuthContext();
 if(!ctx.profile||!ctx.isAccountActive||ctx.profile.must_change_password||!['hr.actions.view','hr.actions.manage'].every(code=>hasPermission(ctx,code)))return{success:false,error:'Current access is unavailable.',accessDenied:true};
 const row=await(await createClient()).from('employee_approval_requests').select('employee_id').eq('id',id).is('deleted_at',null).maybeSingle();
 if(row.error||!row.data||!Number.isSafeInteger(row.data.employee_id))return{success:false,error:'The current request is unavailable.'};
 return mutateHrChild({kind:'approval',employeeId:row.data.employee_id,id,revision:checked.data.revision,action,values},checked.data);
}
export async function approveEmployeeApprovalRequest(id:number,reason?:string,contract?:ChildSaveContract):Promise<ChildSaveResult>{return changeApproval(id,'approve',{reason:reason??''},contract);}
export async function rejectEmployeeApprovalRequest(id:number,reason:string,contract?:ChildSaveContract):Promise<ChildSaveResult>{return changeApproval(id,'reject',{reason},contract);}
export async function cancelEmployeeApprovalRequest(id:number,reason:string,contract?:ChildSaveContract):Promise<ChildSaveResult>{return changeApproval(id,'cancel',{reason},contract);}
export async function archiveEmployeeApprovalRequest(id:number,contract?:ChildSaveContract):Promise<ChildSaveResult>{return changeApproval(id,'archive',{},contract);}

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
  const admin = await createClient();
  let query = admin
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

export async function createEmployeeEosCase(employeeId:number,input:unknown,contract?:ChildSaveContract):Promise<ChildSaveResult>{
 if(!contract)return{success:false,error:'The original case save identity is required.'};
 return mutateHrChild({kind:'eos-case',employeeId,id:null,revision:null,action:'create',values:input},contract);
}
async function changeEosCase(id:number,action:'update'|'archive'|'set-status',values:unknown,contract?:ChildSaveContract):Promise<ChildSaveResult>{
 const checked=childSaveContract.safeParse(contract);
 if(!Number.isSafeInteger(id)||id<1||!checked.success||!checked.data.revision)return{success:false,error:'The original case opening identity and revision are required.'};
 if(!canUseHrChild(await getAuthContext(),'eos-case'))return{success:false,error:'Current case access is unavailable.',accessDenied:true};
 const row=await(await createClient()).from('employee_eos_cases').select('employee_id').eq('id',id).is('deleted_at',null).maybeSingle();
 if(row.error||!row.data||!Number.isSafeInteger(row.data.employee_id))return{success:false,error:'The current case is unavailable.'};
 return mutateHrChild({kind:'eos-case',employeeId:row.data.employee_id,id,revision:checked.data.revision,action,values},checked.data);
}
export async function updateEmployeeEosCase(id:number,input:unknown,contract?:ChildSaveContract):Promise<ChildSaveResult>{return changeEosCase(id,'update',input,contract);}
export async function archiveEmployeeEosCase(id:number,contract?:ChildSaveContract):Promise<ChildSaveResult>{return changeEosCase(id,'archive',{},contract);}
export async function changeEmployeeEosCaseStatus(id:number,status:string,notes?:string,contract?:ChildSaveContract):Promise<ChildSaveResult>{return changeEosCase(id,'set-status',{case_status:status,...(notes===undefined?{}:{notes})},contract);}

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

export async function createEmployeeClearanceItem(caseId:number,input:unknown,contract?:ChildSaveContract):Promise<ChildSaveResult>{
 const checked=childSaveContract.safeParse(contract),fields=clearanceCreateFields.safeParse(input);
 if(!checked.success||checked.data.revision!==null||!fields.success||!Number.isSafeInteger(caseId)||caseId<1)return{success:false,error:'Original case/save identity and valid clearance fields are required.'};
 if(!canUseHrChild(await getAuthContext(),'clearance'))return{success:false,error:'Current clearance access is unavailable.',accessDenied:true};
 const parent=await(await createClient()).from('employee_eos_cases').select('employee_id').eq('id',caseId).is('deleted_at',null).maybeSingle();
 if(parent.error||!parent.data||!Number.isSafeInteger(parent.data.employee_id))return{success:false,error:'The original case could not be verified.'};
 return mutateHrChild({kind:'clearance',employeeId:parent.data.employee_id,id:null,revision:null,action:'create',values:{...fields.data,eos_case_id:caseId}},checked.data);
}
async function changeClearance(id:number,action:'update'|'clear'|'block'|'archive',values:unknown,contract?:ChildSaveContract):Promise<ChildSaveResult>{
 const checked=childSaveContract.safeParse(contract),fields=z.record(z.string(),z.unknown()).safeParse(values);
 if(!Number.isSafeInteger(id)||id<1||!checked.success||!checked.data.revision||!fields.success||'eos_case_id'in fields.data)return{success:false,error:'Original clearance opening/revision and case-bound fields are required.'};
 if(!canUseHrChild(await getAuthContext(),'clearance'))return{success:false,error:'Current clearance access is unavailable.',accessDenied:true};
 const row=await(await createClient()).from('employee_clearance_items').select('employee_id,eos_case_id').eq('id',id).is('deleted_at',null).maybeSingle();
 if(row.error||!row.data||!Number.isSafeInteger(row.data.employee_id)||!Number.isSafeInteger(row.data.eos_case_id))return{success:false,error:'The current clearance item is unavailable.'};
 return mutateHrChild({kind:'clearance',employeeId:row.data.employee_id,id,revision:checked.data.revision,action,values:{...fields.data,eos_case_id:row.data.eos_case_id}},checked.data);
}
export async function updateEmployeeClearanceItem(id:number,input:unknown,contract?:ChildSaveContract):Promise<ChildSaveResult>{return changeClearance(id,'update',input,contract);}
export async function clearEmployeeClearanceItem(id:number,notes?:string,contract?:ChildSaveContract):Promise<ChildSaveResult>{return changeClearance(id,'clear',notes===undefined?{}:{notes},contract);}
export async function blockEmployeeClearanceItem(id:number,notes?:string,contract?:ChildSaveContract):Promise<ChildSaveResult>{return changeClearance(id,'block',notes===undefined?{}:{notes},contract);}
export async function archiveEmployeeClearanceItem(id:number,contract?:ChildSaveContract):Promise<ChildSaveResult>{return changeClearance(id,'archive',{},contract);}

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
