'use server';
import{z}from'zod';
import{revalidatePath}from'next/cache';
import{createClient}from'@/lib/supabase/server';
import{getAuthContext,hasPermission}from'@/lib/rbac/check';
import{employeeId}from'@/lib/hr/employee-contract';
import{recruitmentLifecycleRequest,recruitmentLifecycleReceipt,recruitmentLifecycleKind,isDefiniteRecruitmentRejection,type RecruitmentLifecycleResult}from'@/lib/hr/recruitment-lifecycle-contract';
import{readCandidateChildren}from'@/server/reads/hr-candidate-children';
async function admitted(){const ctx=await getAuthContext();return!!ctx.profile?.id&&hasPermission(ctx,'hr.recruitment.manage');}
export async function mutateRecruitmentLifecycle(raw:unknown,operation:unknown):Promise<RecruitmentLifecycleResult>{
 let dispatched=false;
 try{
  const r=recruitmentLifecycleRequest.safeParse(raw),op=z.string().uuid().safeParse(operation);
  if(!r.success||!op.success)return{success:false,error:'Check the original opening, required fields and decision reason. No request was sent.'};
  if(!await admitted())return{success:false,error:'Current recruitment management access is required.'};
  const db=await createClient();dispatched=true;const result=await db.rpc('f12_mutate_recruitment',{p_operation:op.data,p_request:r.data});
  if(result.error)return{success:false,uncertain:!isDefiniteRecruitmentRejection(result.error.code),error:['40001','PT409'].includes(result.error.code)?'This record changed since opening. Reopen and review it; your stale changes were not applied.':result.error.code==='42501'?'Current subject, assignee or independent approval authority is unavailable.':isDefiniteRecruitmentRejection(result.error.code)?'The decision was rejected. Review the current state, terms, assignment and evidence requirements.':'The outcome is unconfirmed. Keep the original request and check its receipt.'};
  const parsed=recruitmentLifecycleReceipt.safeParse(result.data);
  if(!parsed.success||parsed.data.operation_id!==op.data||parsed.data.kind!==r.data.kind||parsed.data.candidate_id!==r.data.candidateId||parsed.data.employee_id!==(r.data.employeeId??null)||r.data.id!==null&&parsed.data.id!==r.data.id)return{success:false,uncertain:true,error:'The returned receipt could not be matched. Do not submit a new operation.'};
  // A cache failure after commit is never represented as a failed save.
  try{if(r.data.candidateId)revalidatePath(`/admin/hr/recruitment/candidates/record/${r.data.candidateId}`);revalidatePath('/admin/hr/recruitment/requisitions');revalidatePath('/admin/hr/recruitment/onboarding');revalidatePath('/admin/hr/recruitment/offers');revalidatePath('/admin/hr/recruitment/interviews');}catch{/* Receipt is authoritative. */}
  return{success:true,data:parsed.data};
 }catch{return{success:false,uncertain:dispatched,error:dispatched?'The outcome is unconfirmed. Check the original receipt before another save.':'Recruitment is unavailable. No request was sent.'};}
}
export async function reconcileRecruitmentLifecycle(operation:unknown):Promise<RecruitmentLifecycleResult>{
 const op=z.string().uuid().safeParse(operation);if(!op.success)return{success:false,error:'Invalid original operation.'};
 try{if(!await admitted())return{success:false,error:'Current access unavailable.'};const r=await(await createClient()).rpc('f12_reconcile_recruitment',{p_operation:op.data});const parsed=recruitmentLifecycleReceipt.safeParse(r.data);if(r.error||!parsed.success||parsed.data.operation_id!==op.data||!parsed.data.replayed)return{success:false,uncertain:true,error:'The original outcome is not confirmed. No fields were replayed.'};return{success:true,data:parsed.data};}catch{return{success:false,uncertain:true,error:'Receipt verification unavailable. No request was replayed.'};}
}
export async function readRecruitmentAssignees(candidate:number|null,employee:number|null,search='',after=0){
 if(!employeeId.nullable().safeParse(candidate).success||!employeeId.nullable().safeParse(employee).success||candidate===null&&employee===null||search.length>100||!Number.isSafeInteger(after)||after<0)return{success:false as const,error:'Invalid assignee lookup.'};
 try{if(!await admitted())return{success:false as const,error:'Current access unavailable.'};const r=await(await createClient()).rpc('f12_recruitment_assignees',{p_candidate:candidate,p_employee:employee,p_search:search,p_after:after});const parsed=z.array(z.object({id:employeeId,full_name:z.string().nullable()}).strict()).max(26).safeParse(r.data);if(r.error||!parsed.success)return{success:false as const,error:'Authorized assignees could not be verified.'};return{success:true as const,rows:parsed.data.slice(0,25),hasMore:parsed.data.length>25};}catch{return{success:false as const,error:'Assignees unavailable. No person has been selected automatically.'};}
}
export async function readRecruitmentLifecycleHistory(raw:unknown){
 const input=z.object({candidate:employeeId.nullable(),employee:employeeId.nullable(),kind:recruitmentLifecycleKind,id:employeeId,before:employeeId.optional()}).strict().safeParse(raw);
 if(!input.success)return{success:false as const,error:'Invalid history request.'};
 try{if(!await admitted())return{success:false as const,error:'Current access unavailable.'};const p=input.data,r=await(await createClient()).rpc('f12_recruitment_history',{p_candidate:p.candidate,p_employee:p.employee,p_kind:p.kind,p_record:p.id,...(p.before?{p_before:p.before}:{})});const parsed=z.array(z.object({id:employeeId,action:z.string(),actor_id:employeeId,created_at:z.string().datetime({offset:true}),reason:z.string().nullable(),revision:z.string().regex(/^[1-9]\d*$/)}).strict()).max(26).safeParse(r.data);if(r.error||!parsed.success)return{success:false as const,error:'Complete history unavailable.'};return{success:true as const,rows:parsed.data.slice(0,25),hasMore:parsed.data.length>25};}catch{return{success:false as const,error:'History unavailable. No historical decision was reconstructed.'};}
}
export async function readRecentRecruitmentReceipts(raw:unknown){
 const input=z.object({candidate:employeeId.nullable(),employee:employeeId.nullable(),before:z.string().datetime({offset:true}).optional(),operation:z.string().uuid().optional()}).strict().refine(v=>!!v.before===!!v.operation).safeParse(raw);
 if(!input.success)return{success:false as const,error:'Invalid receipt request.'};
 try{if(!await admitted())return{success:false as const,error:'Current access unavailable.'};const p=input.data,r=await(await createClient()).rpc('f12_recent_recruitment_receipts',{p_candidate:p.candidate,p_employee:p.employee,...(p.before?{p_before:p.before,p_operation:p.operation}:{})});const parsed=z.array(z.object({receipt:recruitmentLifecycleReceipt,created_at:z.string().datetime({offset:true})}).strict()).max(26).safeParse(r.data);if(r.error||!parsed.success||parsed.data.some(x=>x.receipt.candidate_id!==p.candidate||x.receipt.employee_id!==p.employee||!x.receipt.replayed))return{success:false as const,error:'Original receipts could not be verified.'};return{success:true as const,rows:parsed.data.slice(0,25),hasMore:parsed.data.length>25};}catch{return{success:false as const,error:'Receipt history unavailable. No fields were replayed.'};}
}
export async function readRecruitmentTaskChoices(raw:unknown){
 const input=z.object({candidate:employeeId,kind:z.enum(['evidence','prerequisite']),page:z.number().int().min(1).max(100000),search:z.string().trim().max(200)}).strict().safeParse(raw);
 if(!input.success)return{success:false as const,error:'Invalid task choices.'};
 try{if(!await admitted())return{success:false as const,error:'Current access unavailable.'};const p=input.data,r=await readCandidateChildren({operation:'page',kind:p.kind==='evidence'?'documents':'onboarding',candidateId:p.candidate,page:p.page,pageSize:25,search:p.search});if(!r.success||!r.data||r.data.operation!=='page')return{success:false as const,error:'Complete choices unavailable.'};const rows=r.data.rows.flatMap(row=>'dms_document'in row?row.dms_document?[{id:row.dms_document_id,label:row.dms_document.document_title??row.dms_document.document_number??`Document #${row.dms_document_id}`}]:[]:'task_title'in row?[{id:row.id,label:row.task_title}]:[]);return{success:true as const,rows,hasMore:p.page*25<r.data.totalCount};}catch{return{success:false as const,error:'Task choices unavailable. No record was inferred.'};}
}
export async function readRequisitionCapacity(id:unknown){
 const input=employeeId.safeParse(id);if(!input.success)return{success:false as const,error:'Invalid requisition.'};
 try{const ctx=await getAuthContext();if(!ctx.profile?.id||!hasPermission(ctx,'hr.recruitment.view')&&!hasPermission(ctx,'hr.recruitment.manage'))return{success:false as const,error:'Current access unavailable.'};const r=await(await createClient()).rpc('f12_requisition_capacity',{p_id:input.data}),count=z.number().int().nonnegative().safe(),p=z.object({id:employeeId,vacancies:count,filled:count,remaining:count}).strict().safeParse(r.data);if(r.error||!p.success||p.data.id!==input.data||p.data.remaining!==Math.max(0,p.data.vacancies-p.data.filled))return{success:false as const,error:'Actual capacity unavailable.'};return{success:true as const,data:p.data};}catch{return{success:false as const,error:'Capacity unavailable. No zero count was assumed.'};}
}
export async function prepareJoiningTask(candidate:unknown){
 const id=employeeId.safeParse(candidate);if(!id.success)return{success:false as const,error:'Invalid candidate.'};
 try{if(!await admitted())return{success:false as const,error:'Current access unavailable.'};const r=await(await createClient()).rpc('f12_prepare_joining_task',{p_candidate:id.data}),p=z.object({candidate_id:z.literal(id.data),employee_id:employeeId.nullable()}).strict().safeParse(r.data);if(r.error||!p.success)return{success:false as const,error:'The actual joining subject could not be verified.'};return{success:true as const,data:p.data};}catch{return{success:false as const,error:'Joining subject unavailable. No employee link was guessed.'};}
}
