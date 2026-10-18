import 'server-only';
import {z} from 'zod';
import {createAdminClient} from '@/lib/supabase/admin';
import type {AuthContext} from '@/lib/rbac/check';
import {canUseApplication,hasGlobalPermission,hasPermissionInScope,isGlobalAdmin} from '@/lib/rbac/scope';
import {getEmployeeAccess} from '@/lib/rbac/employee-access';
import {boundedQuery} from '@/lib/email/queue/runtime-limits';

const id=z.number().int().positive().refine(Number.isSafeInteger);
const subject=z.object({employee_id:id});
const evidence=[
 ['employee_access_cards','dms_document_id',['hr.compliance.view']],
 ['employee_assets','dms_document_id',['hr.assignments.view']],
 ['employee_disciplinary_records','dms_document_id',['hr.actions.view','hr.confidential.view']],
 ['employee_eos_cases','dms_document_id',['hr.eos.view']],
 ['employee_hr_actions','dms_document_id',['hr.actions.view']],
 ['employee_identity_documents','dms_document_id',['hr.compliance.view']],
 ['employee_medical_insurances','dms_document_id',['hr.medical.view']],
 ['employee_medical_records','dms_document_id',['hr.medical.view']],
 ['employee_performance_records','dms_document_id',['hr.actions.view','hr.confidential.view']],
 ['employee_ppe_issues','dms_document_id',['hr.assignments.view']],
 ['employee_pro_processes','related_document_id',['hr.actions.view']],
 ['employee_training_certificates','dms_document_id',['hr.compliance.view']],
 ['employee_dependents','dms_document_id',['hr.compliance.view']],
] as const;

/** Machine recipient admission has no user's login cookie. Reuse F03's scoped
 * employee predicates and retain every direct evidence link, not only generic
 * DMS links. This does not grant access or impersonate an authenticated session.
 * Lookup outages are retryable, never evidence of an absent relationship. */
export async function notificationDocumentSubjectsAllowed(ctx:AuthContext,documentId:number):Promise<boolean>{
 if(!canUseApplication(ctx)||!id.safeParse(documentId).success)return false;
 if(isGlobalAdmin(ctx))return true; // Same explicit exception as F03 document_permission.
 const db=createAdminClient();
 async function rows(table:string,projection:string,column='dms_document_id'){
  const r=await boundedQuery(db.from(table).select(projection).eq(column,documentId).is('deleted_at',null).limit(501));
  if(r.error||!Array.isArray(r.data)||r.data.length>500)throw Error('Linked notification authority unavailable');
  return r.data;
 }
 const [direct,links,documentLinks,candidateDocuments,offers,onboarding]=await Promise.all([
  Promise.all(evidence.map(async([table,column,caps])=>({rows:await rows(table,'employee_id',column),caps}))),
  rows('dms_document_links','entity_type,entity_id','document_id'),
  rows('employee_document_links','employee_id,related_record_type'),
  rows('hr_candidate_documents','candidate_id'),
  rows('hr_offers','candidate_id,owner_company_id,branch_id','offer_document_id'),
  rows('hr_onboarding_tasks','candidate_id,employee_id'),
 ]);
 const requirements=new Map<number,Set<string>>();
 const add=(employee:number,caps:readonly string[])=>{const prior=requirements.get(employee)??new Set<string>();caps.forEach(c=>prior.add(c));requirements.set(employee,prior);};
 for(const group of direct)for(const row of group.rows)add(subject.parse(row).employee_id,group.caps);
 for(const row of links){
  const link=z.object({entity_type:z.string(),entity_id:id}).parse(row);
  if(link.entity_type==='employee')add(link.entity_id,[]);
  else if(!['owner_company','party','work_site','project'].includes(link.entity_type))return false;
 }
 for(const row of documentLinks){const link=subject.extend({related_record_type:z.string().nullable()}).parse(row);add(link.employee_id,['medical_record','medical_insurance'].includes(link.related_record_type??'')?['hr.medical.view']:[]);}
 const employeeAccess=new Map<number,Awaited<ReturnType<typeof getEmployeeAccess>>>();
 async function employee(employeeId:number){
  const cached=employeeAccess.get(employeeId);if(cached)return cached;
  try{const access=await getEmployeeAccess(ctx,employeeId);employeeAccess.set(employeeId,access);return access;}
  catch(error){if(error instanceof Error&&error.message==='Employee unavailable or access denied')return null;throw error;}
 }
 for(const [employeeId,caps]of requirements){const access=await employee(employeeId);if(!access||![...caps].every(c=>access.allows(c)))return false;}
 function recruitment(company:number|null,branch:number|null){return ['hr.recruitment.view','hr.recruitment.manage'].some(code=>company===null?hasGlobalPermission(ctx,code):hasPermissionInScope(ctx,code,company,branch));}
 const candidateAccess=new Map<number,boolean>();
 async function candidate(candidateId:number){
  if(candidateAccess.has(candidateId))return candidateAccess.get(candidateId)!;
  const c=await boundedQuery(db.from('hr_candidates').select('requisition_id').eq('id',candidateId).is('deleted_at',null).maybeSingle());
  if(c.error)throw Error('Recruitment notification authority unavailable');if(!c.data)return false;
  let allowed=false;
  if(c.data.requisition_id){
   const r=await boundedQuery(db.from('hr_job_requisitions').select('owner_company_id,branch_id').eq('id',c.data.requisition_id).is('deleted_at',null).maybeSingle());
   if(r.error)throw Error('Recruitment scope unavailable');allowed=!!r.data&&recruitment(r.data.owner_company_id,r.data.branch_id);
  }else allowed=recruitment(null,null);
  candidateAccess.set(candidateId,allowed);return allowed;
 }
 for(const row of candidateDocuments)if(!await candidate(z.object({candidate_id:id}).parse(row).candidate_id))return false;
 for(const row of offers){
  const offer=z.object({candidate_id:id,owner_company_id:id.nullable(),branch_id:id.nullable()}).parse(row);
  if(!await candidate(offer.candidate_id)||!recruitment(offer.owner_company_id,offer.branch_id)||
   !(offer.owner_company_id===null?hasGlobalPermission(ctx,'hr.payroll.view'):hasPermissionInScope(ctx,'hr.payroll.view',offer.owner_company_id,offer.branch_id)))return false;
 }
 for(const row of onboarding){
  const task=z.object({candidate_id:id.nullable(),employee_id:id.nullable()}).parse(row);
  if(task.candidate_id!==null&&!await candidate(task.candidate_id))return false;
  if(task.employee_id!==null){const access=await employee(task.employee_id);if(!access||!recruitment(access.subject.owner_company_id,access.subject.branch_id))return false;}
  if(task.candidate_id===null&&task.employee_id===null&&!recruitment(null,null))return false;
 }
 return true;
}
