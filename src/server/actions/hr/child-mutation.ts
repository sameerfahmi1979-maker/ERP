'use server';
import{z}from 'zod';
import{canUseComplianceDocumentEntry}from'@/server/hr-compliance-document-access';
import{COMPLIANCE_CHILD_TABLES,complianceChildKind}from'@/lib/hr/compliance-child-contract';
import{getAuthContext,hasPermission}from '@/lib/rbac/check';
import{createClient}from '@/lib/supabase/server';
import{revalidatePath}from 'next/cache';
import{childMutationSchema,childSaveContract,childReceiptSchema,childOperationValues,proProcessOpeningValues,hrActionOpeningValues,performanceOpeningValues,disciplinaryOpeningValues,approvalOpeningValues,eosCaseOpeningValues,assignmentOpeningValues,clearanceOpeningValues,childReceiptCursor,recentChildReceiptSchema,type ChildKind,type ChildSaveResult,type ChildReceiptCursor,type RecentChildReceipt}from '@/lib/hr/child-save-contract';
import{canUseHrChild}from'@/lib/hr/child-authority';
import{employeeId,isDefiniteEmployeeRejection}from '@/lib/hr/employee-contract';
import{roleRequirementOpeningValues,requirementRefreshValues}from'@/lib/hr/role-requirement-contract';
import{siteReadinessValues}from'@/lib/hr/site-readiness-contract';
import{payrollChildKind,payrollOpeningValues,PAYROLL_CHILD_COLUMNS,PAYROLL_CHILD_TABLES}from'@/lib/hr/payroll-child-contract';
import{timeChildKind,timeOpeningValues,TIME_CHILD_COLUMNS,TIME_CHILD_TABLES}from'@/lib/hr/time-child-contract';
import{operationalBlockOpeningValues}from'@/lib/hr/operational-block-contract';
import{employeeDate}from '@/lib/hr/employee-contract';
import{operationItemKind,operationItemOpeningValues,OPERATION_ITEM_TABLES,OPERATION_ITEM_PROJECTIONS,type OperationItemKind}from '@/lib/hr/operation-item-contract';
async function authorized(kind?:ChildKind){return canUseHrChild(await getAuthContext(),kind);}
export async function readTimeChildOpening(rawKind:unknown,employee:number,id:number|null=null,action='create',rawBalance?:unknown):Promise<{success:boolean;id?:number|null;revision?:string|null;values?:Record<string,unknown>;error?:string;denied?:true}>{
 const parsed=timeChildKind.safeParse(rawKind),balance=z.object({leave_type_id:employeeId,leave_year:z.number().int().min(2000).max(2100)}).strict().safeParse(rawBalance);
 if(!parsed.success||!employeeId.safeParse(employee).success||id!==null&&!employeeId.safeParse(id).success||!['create','update','archive','approve','reject','cancel','query','correct','recalculate'].includes(action)||rawBalance!==undefined&&!balance.success)return{success:false,error:'Invalid time opening identity.'};
 const kind=parsed.data;
 try{
  if(!await authorized(kind))return{success:false,error:'Current scoped Time read and manage access are required.',denied:true};
  const client=await createClient(),subject=await client.from('employees').select('id').eq('id',employee).is('deleted_at',null).maybeSingle();
  if(subject.error||subject.data?.id!==employee)return{success:false,error:'Current employee access unavailable.',denied:true};
  if(id===null&&!(kind==='leave-balance'&&balance.success))return{success:true,id:null,revision:null,values:{}};
  let query=client.from(TIME_CHILD_TABLES[kind]).select('id,employee_id,workspace_revision,'+TIME_CHILD_COLUMNS[kind]).eq('employee_id',employee);
  if(['shift-assignment','leave-request','overtime'].includes(kind))query=query.is('deleted_at',null);
  if(id!==null)query=query.eq('id',id);else if(balance.success)query=query.eq('leave_type_id',balance.data.leave_type_id).eq('leave_year',balance.data.leave_year);
  const r=await query.maybeSingle();if(r.error)return{success:false,error:'The complete original Time record could not be verified.'};
  if(!r.data)return id!==null?{success:false,error:'Original Time record unavailable.',denied:true}:{success:true,id:null,revision:null,values:balance.success?balance.data:{}};
  const row=r.data as unknown as Record<string,unknown>,{id:recordId,employee_id,workspace_revision,...values}=row;
  if(employee_id!==employee||!employeeId.safeParse(recordId).success||!employeeId.safeParse(workspace_revision).success||!timeOpeningValues(kind).safeParse(values).success)return{success:false,error:'The complete Time opening or revision is invalid.'};
  let opening=values;
  if(action==='correct')opening={correction_reason:'',notes:values.notes};
  else if(['query','reject','cancel'].includes(action))opening={reason:''};
  else if(['archive','approve'].includes(action))opening={};
  else if(action==='recalculate'){const fingerprint=await client.rpc('f11_leave_balance_opening',{p_employee:employee,p_id:recordId});if(fingerprint.error||!z.string().regex(/^[0-9a-f]{64}$/).safeParse(fingerprint.data).success)return{success:false,error:'Complete leave sources unavailable.'};opening={fingerprint:fingerprint.data};}
  if(!await authorized(kind))return{success:false,error:'Current Time access changed.',denied:true};
  return{success:true,id:recordId as number,revision:String(workspace_revision),values:opening};
 }catch{return{success:false,error:'Time opening unavailable. No request was sent.'};}
}
export async function readPayrollChildOpening(rawKind:unknown,employee:number,id:number|null=null,action='create'):Promise<{success:boolean;id?:number|null;revision?:string|null;values?:Record<string,unknown>;error?:string;denied?:true}>{
 const parsed=payrollChildKind.safeParse(rawKind);
 if(!parsed.success||!employeeId.safeParse(employee).success||id!==null&&!employeeId.safeParse(id).success||!['create','update','archive','release'].includes(action))return{success:false,error:'Invalid payroll opening identity.'};
 const kind=parsed.data;
 try{
  if(!await authorized(kind))return{success:false,error:'Current payroll and separate banking access are required.',denied:true};
  const client=await createClient();
  const subject=await client.from('employees').select('id').eq('id',employee).is('deleted_at',null).maybeSingle();
  if(subject.error||subject.data?.id!==employee)return{success:false,error:'Current employee access unavailable.',denied:true};
  if(kind==='salary-revision'){
   if(id!==null||action!=='create')return{success:false,error:'Salary revisions are append-only.'};
   const r=await client.rpc('f11_salary_revision_opening',{p_employee:employee}),values=payrollOpeningValues(kind).safeParse({fingerprint:r.data});
   if(r.error||!values.success)return{success:false,error:'The complete current salary component set could not be verified.'};
   if(!await authorized(kind))return{success:false,error:'Current salary access changed.',denied:true};
   return{success:true,id:null,revision:null,values:values.data};
  }
  const singleton=kind==='payroll-profile'||kind==='wps-profile';
  if(id===null&&!singleton)return{success:true,id:null,revision:null,values:{}};
  let query=client.from(PAYROLL_CHILD_TABLES[kind]).select(`id,employee_id,workspace_revision,${PAYROLL_CHILD_COLUMNS[kind]}${kind==='payroll-hold'?',is_active':''}`).eq('employee_id',employee).is('deleted_at',null);
  if(id!==null)query=query.eq('id',id);
  const r=await query.maybeSingle();if(r.error)return{success:false,error:'The complete original payroll record could not be verified.'};
  if(!r.data){if(id!==null)return{success:false,error:'Original payroll record unavailable.',denied:true};return{success:true,id:null,revision:null,values:{}};}
  const row=r.data as unknown as Record<string,unknown>,{id:recordId,employee_id,workspace_revision,...values}=row;
  if(kind==='payroll-hold')delete values.is_active;
  if(employee_id!==employee||!employeeId.safeParse(recordId).success||!employeeId.safeParse(workspace_revision).success||!payrollOpeningValues(kind).safeParse(values).success)return{success:false,error:'The complete payroll opening or revision is invalid.'};
  if(kind==='payroll-hold'&&action==='release'&&row.is_active!==true)return{success:false,error:'This payroll hold is no longer active.'};
  if(!await authorized(kind))return{success:false,error:'Current payroll access changed.',denied:true};
  return{success:true,id:recordId as number,revision:String(workspace_revision),values};
 }catch{return{success:false,error:'Payroll opening unavailable. No change was sent.'};}
}
export async function readSiteReadinessOpening(employee:number,site:number):Promise<{success:boolean;values?:z.infer<typeof siteReadinessValues>;error?:string;denied?:true}>{
 if(![employee,site].every(value=>employeeId.safeParse(value).success))return{success:false,error:'Choose a valid work site.'};
 try{
  if(!await authorized('site-readiness'))return{success:false,error:'Readiness needs current operations, compliance and medical read access.',denied:true};
  const result=await(await createClient()).rpc('f11_site_readiness_opening',{p_employee:employee,p_site:site}),parsed=siteReadinessValues.safeParse(result.data);
  if(result.error||!parsed.success||parsed.data.work_site_id!==site)return{success:false,error:'The site and complete readiness sources could not be verified.'};
  if(!await authorized('site-readiness'))return{success:false,error:'Current readiness access changed.',denied:true};
  return{success:true,values:parsed.data};
 }catch{return{success:false,error:'Readiness sources are unavailable. No calculation was saved.'};}
}
/** Immediate archive/verification starts with its own minimal scoped opening.
 * Editors must continue using the full row captured before editing. */
export async function readComplianceChildRevision(kind:import('@/lib/hr/compliance-child-contract').ComplianceChildKind,employee:number,id:number):Promise<{success:boolean;revision?:string;error?:string}>{
 if(!complianceChildKind.safeParse(kind).success||![employee,id].every(v=>employeeId.safeParse(v).success))return{success:false,error:'Invalid compliance opening identity.'};
 try{
  if(!await authorized(kind))return{success:false,error:'Current compliance access unavailable.'};
  const r=await(await createClient()).from(COMPLIANCE_CHILD_TABLES[kind]).select('id,employee_id,workspace_revision').eq('id',id).eq('employee_id',employee).is('deleted_at',null).maybeSingle();
  const row=z.object({id:z.literal(id),employee_id:z.literal(employee),workspace_revision:employeeId}).strict().safeParse(r.data);
  if(r.error||!row.success||!await authorized(kind))return{success:false,error:'The original compliance revision is unavailable.'};
  return{success:true,revision:String(row.data.workspace_revision)};
 }catch{return{success:false,error:'The original compliance opening could not be verified. No change was sent.'};}
}
export async function mutateHrChild(raw:unknown,rawContract:unknown):Promise<ChildSaveResult>{
 let dispatched=false;
 try{
  const request=childMutationSchema.safeParse(raw),contract=childSaveContract.safeParse(rawContract);
  if(!request.success||!contract.success||request.data.revision!==contract.data.revision)return{success:false,error:'The opening revision or operation identity is missing. Reopen the record.'};
  const r=request.data,c=contract.data;
  if(!await authorized(r.kind))return{success:false,error:'Permission denied',accessDenied:true};
  const parsed=childOperationValues(r.kind,r.action).safeParse(r.values);
  if(!parsed.success)return{success:false,error:'Check the child fields before saving.',fieldErrors:Object.fromEntries(parsed.error.issues.map(issue=>[issue.path.join('.'),issue.message]))};
  if(complianceChildKind.safeParse(r.kind).success&&parsed.data.entry_source==='document'&&!await canUseComplianceDocumentEntry(await getAuthContext()))return{success:false,error:'The document-to-record entry is unavailable with current access or settings.',accessDenied:true};
  const client=await createClient();dispatched=true;
  const result=await client.rpc(complianceChildKind.safeParse(r.kind).success?'f11_mutate_compliance_child':timeChildKind.safeParse(r.kind).success?'f11_mutate_time_child':payrollChildKind.safeParse(r.kind).success?'f11_mutate_payroll_child':r.kind==='site-readiness'?'f11_mutate_site_readiness':['role-requirement','requirements-refresh'].includes(r.kind)?'f11_mutate_role_requirement':r.kind==='operational-block'?'f11_mutate_operational_block':['asset','ppe','accommodation'].includes(r.kind)?'f11_mutate_operation_item':r.kind==='assignment'?'f11_mutate_assignment':r.kind==='hr-note'?'f11_mutate_hr_child':r.kind==='pro-process'?'f11_mutate_pro_process':r.kind==='performance'?'f11_mutate_performance':r.kind==='disciplinary'?'f11_mutate_disciplinary':r.kind==='approval'?'f11_mutate_approval':r.kind==='eos-case'?'f11_mutate_eos_case':r.kind==='clearance'?'f11_mutate_clearance':'f11_mutate_hr_action',{p_kind:r.kind,p_employee:r.employeeId,p_id:r.id,p_revision:c.revision,p_operation:c.operationId,p_action:r.action,p_data:parsed.data});
  if(result.error){const definite=isDefiniteEmployeeRejection(result.error.code);return{success:false,uncertain:!definite,...(result.error.code==='42501'?{accessDenied:true as const}:{}),error:result.error.code==='P0409'?'This record changed after opening. Reopen and compare before changing it.':result.error.code==='42501'?'Current access to this employee or confidential record is unavailable.':definite?'The change was rejected. Check the fields and current record.':'The outcome is unconfirmed. Keep the original request for reconciliation.'};}
  const receipt=childReceiptSchema.safeParse(result.data);
  if(!receipt.success||receipt.data.employee_id!==r.employeeId||receipt.data.kind!==r.kind||receipt.data.operation_id!==c.operationId||(r.id!==null&&receipt.data.id!==r.id)||(r.kind==='clearance'&&receipt.data.eos_case_id!==r.values.eos_case_id))return{success:false,uncertain:true,error:'The save response could not be verified. Keep the original request for reconciliation.'};
  try{revalidatePath(`/admin/hr/employees/record/${r.employeeId}`);}catch{/* A confirmed transaction is not undone by refresh failure. */}
  return{success:true,data:receipt.data};
 }catch{return{success:false,uncertain:dispatched,error:dispatched?'The outcome is unconfirmed. Keep the original request for reconciliation.':'Required access or recovery checks could not be completed. No request was sent.'};}
}
export async function reconcileHrChild(operationId:string):Promise<ChildSaveResult>{
 if(!z.string().uuid().safeParse(operationId).success)return{success:false,error:'Invalid recovery identity.'};
 try{
  if(!await authorized())return{success:false,uncertain:true,error:'Current access is unavailable. The earlier outcome remains unresolved.'};
  const result=await(await createClient()).rpc('f11_reconcile_hr_child',{p_operation:operationId});
  if(result.error||!result.data)return{success:false,uncertain:true,error:'No currently authorized receipt is available. No private fields were replayed.'};
  const receipt=childReceiptSchema.safeParse(result.data);
  return receipt.success&&receipt.data.operation_id===operationId&&receipt.data.replayed?{success:true,data:receipt.data}:{success:false,uncertain:true,error:'The recovery response could not be verified.'};
 }catch{return{success:false,uncertain:true,error:'Recovery is unavailable. No fields were replayed.'};}
}
export async function readHrNoteRevision(employee:number,id:number):Promise<{success:boolean;revision?:string;error?:string}>{
 if(!employeeId.safeParse(employee).success||!employeeId.safeParse(id).success)return{success:false,error:'Invalid note identity.'};
 try{
  if(!await authorized('hr-note'))return{success:false,error:'Permission denied'};
  const r=await(await createClient()).from('employee_hr_notes').select('id,employee_id,workspace_revision').eq('id',id).eq('employee_id',employee).is('deleted_at',null).maybeSingle();
  const row=z.object({id:z.literal(id),employee_id:z.literal(employee),workspace_revision:employeeId}).safeParse(r.data);
  return!r.error&&row.success?{success:true,revision:String(row.data.workspace_revision)}:{success:false,error:'The current note revision is unavailable. Refresh or retry before archiving.'};
 }catch{return{success:false,error:'The current note revision could not be verified.'};}
}
/** Read one scoped row and its revision together; retain unrendered DB fields. */
export async function readProProcessOpening(employee:number,id:number):Promise<{success:boolean;revision?:string;values?:z.infer<typeof proProcessOpeningValues>;error?:string;denied?:true}>{
 if(!employeeId.safeParse(employee).success||!employeeId.safeParse(id).success)return{success:false,error:'Invalid process identity.'};
 try{
  if(!await authorized('pro-process'))return{success:false,error:'Permission denied',denied:true};
  const r=await(await createClient()).from('employee_pro_processes').select('id,employee_id,workspace_revision,process_title,process_status,priority,request_date,target_date,notes').eq('id',id).eq('employee_id',employee).is('deleted_at',null).maybeSingle();
  if(r.error?.code==='42501'||!r.error&&r.data===null)return{success:false,error:'Current access to this process could not be verified.',denied:true};
  const row=z.object({id:z.literal(id),employee_id:z.literal(employee),workspace_revision:employeeId,...proProcessOpeningValues.shape}).strict().safeParse(r.data);
  if(r.error||!row.success)return{success:false,error:'The current process and revision could not be verified.'};
  const {id:_id,employee_id:_employee,workspace_revision,...values}=row.data;void _id;void _employee;
  return{success:true,revision:String(workspace_revision),values};
 }catch{return{success:false,error:'The current process and revision could not be verified.'};}
}
export async function readHrActionOpening(employee:number,id:number):Promise<{success:boolean;revision?:string;values?:z.infer<typeof hrActionOpeningValues>;error?:string;denied?:true}>{
 if(!employeeId.safeParse(employee).success||!employeeId.safeParse(id).success)return{success:false,error:'Invalid action identity.'};
 try{
  if(!await authorized('hr-action'))return{success:false,error:'Permission denied',denied:true};
  const r=await(await createClient()).from('employee_hr_actions').select('id,employee_id,workspace_revision,action_title,action_type,action_status,action_date,due_date,notes').eq('id',id).eq('employee_id',employee).is('deleted_at',null).maybeSingle();
  if(r.error?.code==='42501'||!r.error&&r.data===null)return{success:false,error:'Current access to this action could not be verified.',denied:true};
  const row=z.object({id:z.literal(id),employee_id:z.literal(employee),workspace_revision:employeeId,...hrActionOpeningValues.shape}).strict().safeParse(r.data);
  if(r.error||!row.success)return{success:false,error:'The current action and revision could not be verified.'};
  const {id:_id,employee_id:_employee,workspace_revision,...values}=row.data;void _id;void _employee;
  return{success:true,revision:String(workspace_revision),values};
 }catch{return{success:false,error:'The current action and revision could not be verified.'};}
}

export async function readPerformanceOpening(employee:number,id:number):Promise<{success:boolean;revision?:string;values?:z.infer<typeof performanceOpeningValues>;error?:string;denied?:true}>{
 if(!employeeId.safeParse(employee).success||!employeeId.safeParse(id).success)return{success:false,error:'Invalid review identity.'};
 try{
  if(!await authorized('performance'))return{success:false,error:'Permission denied',denied:true};
  const r=await(await createClient()).from('employee_performance_records').select('id,employee_id,workspace_revision,review_type,review_date,rating,summary,status').eq('id',id).eq('employee_id',employee).is('deleted_at',null).maybeSingle();
  if(r.error?.code==='42501'||!r.error&&r.data===null)return{success:false,error:'Current access to this confidential review could not be verified.',denied:true};
  const row=z.object({id:z.literal(id),employee_id:z.literal(employee),workspace_revision:employeeId,...performanceOpeningValues.shape}).strict().safeParse(r.data);
  if(r.error||!row.success)return{success:false,error:'The current review and revision could not be verified.'};
  const {id:_id,employee_id:_employee,workspace_revision,...values}=row.data;void _id;void _employee;
  return{success:true,revision:String(workspace_revision),values};
 }catch{return{success:false,error:'The current review and revision could not be verified.'};}
}
export async function readDisciplinaryOpening(employee:number,id:number):Promise<{success:boolean;revision?:string;values?:z.infer<typeof disciplinaryOpeningValues>;error?:string;denied?:true}>{
 if(!employeeId.safeParse(employee).success||!employeeId.safeParse(id).success)return{success:false,error:'Invalid disciplinary record identity.'};
 try{
  if(!await authorized('disciplinary'))return{success:false,error:'Permission denied',denied:true};
  const r=await(await createClient()).from('employee_disciplinary_records').select('id,employee_id,workspace_revision,subject,disciplinary_type,record_date,incident_date,severity,status,description,action_taken,creates_operational_block').eq('id',id).eq('employee_id',employee).is('deleted_at',null).maybeSingle();
  if(r.error?.code==='42501'||!r.error&&r.data===null)return{success:false,error:'Current access to this confidential disciplinary record could not be verified.',denied:true};
  const row=z.object({id:z.literal(id),employee_id:z.literal(employee),workspace_revision:employeeId,...disciplinaryOpeningValues.shape}).strict().safeParse(r.data);
  if(r.error||!row.success)return{success:false,error:'The current disciplinary record and revision could not be verified.'};
  const {id:_id,employee_id:_employee,workspace_revision,...values}=row.data;void _id;void _employee;
  return{success:true,revision:String(workspace_revision),values};
 }catch{return{success:false,error:'The current disciplinary record and revision could not be verified.'};}
}

export async function readApprovalOpening(employee:number,id:number,action:string):Promise<{success:boolean;revision?:string;values?:z.infer<typeof approvalOpeningValues>;error?:string;denied?:true}>{
 if(!employeeId.safeParse(employee).success||!employeeId.safeParse(id).success||!['approve','reject','cancel','archive'].includes(action))return{success:false,error:'Invalid approval opening identity or action.'};
 try{
  if(!await authorized('approval'))return{success:false,error:'Permission denied',denied:true};
  const r=await(await createClient()).from('employee_approval_requests').select('id,employee_id,workspace_revision,approval_type,request_title,request_status,requested_by,created_by,approval_role_id').eq('id',id).eq('employee_id',employee).is('deleted_at',null).maybeSingle();
  if(r.error?.code==='42501'||!r.error&&r.data===null)return{success:false,error:'Current access to this approval request could not be verified.',denied:true};
  const row=z.object({id:z.literal(id),employee_id:z.literal(employee),workspace_revision:employeeId,...approvalOpeningValues.shape,request_status:z.enum(['pending','approved','rejected','cancelled']),requested_by:employeeId.nullable(),created_by:employeeId.nullable(),approval_role_id:employeeId.nullable()}).strict().safeParse(r.data);
  if(r.error||!row.success)return{success:false,error:'The current request and revision could not be verified.'};
  const ctx=await getAuthContext();if(!ctx.profile||!ctx.isAccountActive||ctx.profile.must_change_password||!['hr.actions.view','hr.actions.manage'].every(code=>hasPermission(ctx,code)))return{success:false,error:'Current access is unavailable.',denied:true};
  if(action!=='archive'&&row.data.request_status!=='pending')return{success:false,error:'This request is no longer pending. Reopen its current history.'};
  if(['approve','reject'].includes(action)){
   if(row.data.approval_role_id!==null)return{success:false,error:'This request is held for approval-role mapping review. No reviewer assignment will be guessed.'};
   if(row.data.requested_by===null||row.data.created_by===null)return{success:false,error:'The original requester or author is unresolved. Independent review cannot be verified.'};
   if([row.data.requested_by,row.data.created_by].includes(ctx.profile.id))return{success:false,error:'The requester or author cannot decide their own request. Ask a different authorized HR reviewer.'};
  }
  return{success:true,revision:String(row.data.workspace_revision),values:{approval_type:row.data.approval_type,request_title:row.data.request_title}};
 }catch{return{success:false,error:'The approval opening could not be verified.'};}
}
export async function readRoleRequirementOpening(employee:number,id:number,action:string):Promise<{success:boolean;revision?:string;values?:z.infer<typeof roleRequirementOpeningValues>;error?:string;denied?:true}>{
 if(![employee,id].every(value=>employeeId.safeParse(value).success)||!['update','waive','archive'].includes(action))return{success:false,error:'Invalid original requirement identity or action.'};
 try{
  if(!await authorized('role-requirement'))return{success:false,error:'Permission denied',denied:true};
  const r=await(await createClient()).from('employee_role_requirements').select('id,employee_id,workspace_revision,requirement_name,requirement_type,status,expiry_date,is_required').eq('id',id).eq('employee_id',employee).is('deleted_at',null).maybeSingle();
  if(r.error?.code==='42501'||!r.error&&r.data===null)return{success:false,error:'Current original requirement access is unavailable.',denied:true};
  const row=z.object({id:z.literal(id),employee_id:z.literal(employee),workspace_revision:employeeId,...roleRequirementOpeningValues.shape}).strict().safeParse(r.data);
  if(r.error||!row.success)return{success:false,error:'The complete original requirement and revision could not be verified.'};
  if(action==='waive'&&row.data.status==='waived')return{success:false,error:'This requirement is already waived. Its original history remains available.'};
  if(!await authorized('role-requirement'))return{success:false,error:'Current requirement access changed.',denied:true};
  const{id:_id,employee_id:_employee,workspace_revision,...values}=row.data;void _id;void _employee;
  return{success:true,revision:String(workspace_revision),values};
 }catch{return{success:false,error:'The original requirement opening could not be verified.'};}
}
export async function readRequirementRefreshOpening(employee:number):Promise<{success:boolean;values?:z.infer<typeof requirementRefreshValues>;error?:string;denied?:true}>{
 if(!employeeId.safeParse(employee).success)return{success:false,error:'Invalid employee identity.'};
 try{
  if(!await authorized('requirements-refresh'))return{success:false,error:'Permission denied',denied:true};
  const r=await(await createClient()).rpc('f11_requirement_refresh_fingerprint',{p_employee:employee}),values=requirementRefreshValues.safeParse({fingerprint:r.data});
  if(r.error||!values.success)return{success:false,error:'The complete current requirement set could not be verified.'};
  if(!await authorized('requirements-refresh'))return{success:false,error:'Current requirement access changed.',denied:true};
  return{success:true,values:values.data};
 }catch{return{success:false,error:'The requirement recalculation opening is unavailable.'};}
}
export async function readOperationalBlockOpening(employee:number,id:number,action:string):Promise<{success:boolean;revision?:string;values?:z.infer<typeof operationalBlockOpeningValues>;error?:string;denied?:true}>{
 if(![employee,id].every(value=>employeeId.safeParse(value).success)||!['release','archive'].includes(action))return{success:false,error:'Invalid original block identity or action.'};
 try{
  if(!await authorized('operational-block'))return{success:false,error:'Permission denied',denied:true};
  const r=await(await createClient()).from('employee_operational_blocks').select('id,employee_id,workspace_revision,block_type,block_reason,effective_from,effective_to,notes,block_status').eq('id',id).eq('employee_id',employee).is('deleted_at',null).maybeSingle();
  if(r.error?.code==='42501'||!r.error&&r.data===null)return{success:false,error:'Current access to the original block is unavailable.',denied:true};
  const row=z.object({id:z.literal(id),employee_id:z.literal(employee),workspace_revision:employeeId,...operationalBlockOpeningValues.shape,block_status:z.enum(['active','released','expired','cancelled'])}).strict().safeParse(r.data);
  if(r.error||!row.success)return{success:false,error:'The complete original block and revision could not be verified.'};
  if(action==='release'&&row.data.block_status!=='active')return{success:false,error:'This block is no longer active. Its history remains available.'};
  if(!await authorized('operational-block'))return{success:false,error:'Current block access changed.',denied:true};
  const{id:_id,employee_id:_employee,workspace_revision,block_status:_status,...values}=row.data;void _id;void _employee;void _status;
  return{success:true,revision:String(workspace_revision),values};
 }catch{return{success:false,error:'The original block opening could not be verified.'};}
}
/** Owner-requested recovery after a hard reload cannot depend on a lost
 * in-memory UUID. List only the current actor's currently authorized receipts,
 * never private wording. Missing receipts are not evidence of rollback. */
export async function listRecentHrChildReceipts(cursor?:ChildReceiptCursor):Promise<{success:boolean;rows?:RecentChildReceipt[];nextCursor?:ChildReceiptCursor|null;error?:string}>{
 if(cursor!==undefined&&!childReceiptCursor.safeParse(cursor).success)return{success:false,error:'Invalid recovery continuation.'};
 try{
  if(!await authorized())return{success:false,error:'Current child-recovery access is unavailable.'};
  const result=await(await createClient()).rpc('f11_recent_hr_child_receipts',{p_before:cursor?.createdAt??null,p_before_operation:cursor?.operationId??null,p_limit:26});
  const rows=z.array(recentChildReceiptSchema).max(26).safeParse(result.data);
  if(result.error||!rows.success||new Set(rows.data.map(r=>r.operation_id)).size!==rows.data.length||cursor&&rows.data.some(r=>r.operation_id===cursor.operationId))return{success:false,error:'Recent saved changes could not be completely verified. No rollback has been inferred.'};
  const page=rows.data.slice(0,25),last=page.at(-1);
  return{success:true,rows:page,nextCursor:rows.data.length>25&&last?{createdAt:last.created_at,operationId:last.operation_id}:null};
 }catch{return{success:false,error:'Recent saved changes are unavailable. No rollback has been inferred.'};}
}
/** Finance state, clearance certification and evidence links are not editable form fields. */
export async function readEosCaseOpening(employee:number,id:number,action='update'):Promise<{success:boolean;revision?:string;values?:z.infer<typeof eosCaseOpeningValues>;error?:string;denied?:true}>{
 if(!employeeId.safeParse(employee).success||!employeeId.safeParse(id).success||!['update','archive'].includes(action))return{success:false,error:'Invalid case opening identity or operation.'};
 try{
  if(!await authorized('eos-case'))return{success:false,error:'Permission denied',denied:true};
  const r=await(await createClient()).from('employee_eos_cases').select('id,employee_id,workspace_revision,eos_type,case_status,notice_date,last_working_date,reason').eq('id',id).eq('employee_id',employee).is('deleted_at',null).maybeSingle();
  if(r.error?.code==='42501'||!r.error&&r.data===null)return{success:false,error:'Current case access is unavailable.',denied:true};
  const row=z.object({id:z.literal(id),employee_id:z.literal(employee),workspace_revision:employeeId,...eosCaseOpeningValues.shape}).strict().safeParse(r.data);
  if(r.error||!row.success)return{success:false,error:'The case and its opening revision could not be verified.'};
  if(!await authorized('eos-case'))return{success:false,error:'Current case access changed.',denied:true};
  if(action==='update'&&row.data.case_status==='closed')return{success:false,error:'A closed EOS case cannot be edited. Its history remains available.'};
  const{id:_id,employee_id:_employee,workspace_revision,...values}=row.data;void _id;void _employee;
  return{success:true,revision:String(workspace_revision),values};
 }catch{return{success:false,error:'The case opening could not be verified.'};}
}
export async function readClearanceOpening(employee:number,caseId:number,id:number):Promise<{success:boolean;revision?:string;values?:z.infer<typeof clearanceOpeningValues>;error?:string;denied?:true}>{
 if(![employee,caseId,id].every(value=>employeeId.safeParse(value).success))return{success:false,error:'Invalid employee, case or clearance identity.'};
 try{
  if(!await authorized('clearance'))return{success:false,error:'Permission denied',denied:true};
  const client=await createClient();
  const parent=await client.from('employee_eos_cases').select('id,employee_id,case_status').eq('id',caseId).eq('employee_id',employee).is('deleted_at',null).maybeSingle();
  const checkedParent=z.object({id:z.literal(caseId),employee_id:z.literal(employee),case_status:eosCaseOpeningValues.shape.case_status}).strict().safeParse(parent.data);
  if(parent.error?.code==='42501'||!parent.error&&parent.data===null)return{success:false,error:'Current access to the original case is unavailable.',denied:true};
  if(parent.error||!checkedParent.success)return{success:false,error:'The original case could not be verified.'};
  if(['closed','cancelled'].includes(checkedParent.data.case_status))return{success:false,error:'The original case is closed or cancelled. Its clearance history is read-only.'};
  const r=await client.from('employee_clearance_items').select('id,employee_id,workspace_revision,eos_case_id,clearance_area,item_title,item_status,notes').eq('id',id).eq('employee_id',employee).eq('eos_case_id',caseId).is('deleted_at',null).maybeSingle();
  if(r.error?.code==='42501'||!r.error&&r.data===null)return{success:false,error:'Current clearance access is unavailable.',denied:true};
  const row=z.object({id:z.literal(id),employee_id:z.literal(employee),workspace_revision:employeeId,...clearanceOpeningValues.shape,eos_case_id:z.literal(caseId)}).strict().safeParse(r.data);
  if(r.error||!row.success)return{success:false,error:'The clearance item and revision could not be verified.'};
  if(!await authorized('clearance'))return{success:false,error:'Current clearance access changed.',denied:true};
  const{id:_id,employee_id:_employee,workspace_revision,...values}=row.data;void _id;void _employee;
  return{success:true,revision:String(workspace_revision),values};
 }catch{return{success:false,error:'The clearance opening could not be verified.'};}
}

/** The assignment form edits five visible fields, not employee/company/manager mappings. */
export async function readAssignmentOpening(employee:number,id:number):Promise<{success:boolean;revision?:string;values?:z.infer<typeof assignmentOpeningValues>;error?:string;denied?:true}>{
 if(!employeeId.safeParse(employee).success||!employeeId.safeParse(id).success)return{success:false,error:'Invalid assignment opening identity.'};
 try{
  if(!await authorized('assignment'))return{success:false,error:'Permission denied',denied:true};
  const r=await(await createClient()).from('employee_assignments').select('id,employee_id,workspace_revision,assignment_type,assignment_status,effective_from,effective_to,notes').eq('id',id).eq('employee_id',employee).is('deleted_at',null).maybeSingle();
  if(r.error?.code==='42501'||!r.error&&r.data===null)return{success:false,error:'Current assignment access is unavailable.',denied:true};
  const row=z.object({id:z.literal(id),employee_id:z.literal(employee),workspace_revision:employeeId,...assignmentOpeningValues.shape}).strict().safeParse(r.data);
  if(r.error||!row.success)return{success:false,error:'The complete assignment and opening revision could not be verified.'};
  if(!await authorized('assignment'))return{success:false,error:'Current assignment access changed.',denied:true};
  const{id:_id,employee_id:_employee,workspace_revision,...values}=row.data;void _id;void _employee;
  return{success:true,revision:String(workspace_revision),values};
 }catch{return{success:false,error:'The complete assignment and opening revision could not be verified.'};}
}

export async function readOperationItemOpening(kind:OperationItemKind,employee:number,id:number,action:string):Promise<{success:boolean;revision?:string;values?:Record<string,unknown>;error?:string;denied?:true}>{
 if(!operationItemKind.safeParse(kind).success||![employee,id].every(value=>employeeId.safeParse(value).success)||!['update','archive',...(kind==='accommodation'?['end']:['return'])].includes(action))return{success:false,error:'Invalid operational opening identity or action.'};
 try{
  if(!await authorized(kind))return{success:false,error:'Permission denied',denied:true};
  const r=await(await createClient()).from(OPERATION_ITEM_TABLES[kind]).select(`id,employee_id,workspace_revision,status,${OPERATION_ITEM_PROJECTIONS[kind]}${kind==='accommodation'?'':',returned_date'}`).eq('id',id).eq('employee_id',employee).is('deleted_at',null).maybeSingle();
  if(r.error?.code==='42501'||!r.error&&r.data===null)return{success:false,error:'Current operational record access is unavailable.',denied:true};
  const status=kind==='accommodation'?z.enum(['active','ended','cancelled']):kind==='asset'?z.enum(['issued','returned','lost','damaged','cancelled']):z.enum(['issued','returned','expired','lost','damaged','cancelled']);
  const meta=z.object({id:z.literal(id),employee_id:z.literal(employee),workspace_revision:employeeId,status,...(kind==='accommodation'?{}:{returned_date:employeeDate.nullable()})}).passthrough().safeParse(r.data);
  if(r.error||!meta.success)return{success:false,error:'The complete operational record and revision could not be verified.'};
  const schema=operationItemOpeningValues(kind),values=schema.safeParse(Object.fromEntries(Object.keys(schema.shape).map(key=>[key,meta.data[key]])));
  if(!values.success)return{success:false,error:'The complete operational wording could not be verified.'};
  if((action==='return'&&meta.data.status!=='issued')||(action==='end'&&meta.data.status!=='active'))return{success:false,error:'This record is no longer eligible for this operation. Reopen its current history.'};
  if(!await authorized(kind))return{success:false,error:'Current operational access changed.',denied:true};
  return{success:true,revision:String(meta.data.workspace_revision),values:values.data};
 }catch{return{success:false,error:'The complete operational opening could not be verified.'};}
}
