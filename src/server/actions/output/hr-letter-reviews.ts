'use server';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {getAuthContext,canUseApplication} from '@/lib/rbac/check';
import {getEmployeeAccess} from '@/lib/rbac/employee-access';
import {HR_LETTER_CAPABILITIES} from '@/lib/official-documents/hr-source-contract';
import {letterReviewRequest,letterReviewRow,REVIEWED_LETTER_CODES} from '@/lib/official-documents/hr-source-review';
const id=z.number().int().positive().safe();
const request=z.object({employeeId:id,code:z.enum(REVIEWED_LETTER_CODES),action:z.enum(['list','read','submit','approve','reject','options']),id:id.optional(),after:z.number().int().min(0).safe().default(0),kind:z.enum(['evidence','receiver']).optional(),submission:letterReviewRequest.optional()}).strict();
export async function hrLetterReview(raw:z.input<typeof request>){
 let mutation=false;
 try{
  const p=request.parse(raw),ctx=await getAuthContext();if(!canUseApplication(ctx)||!ctx.profile)throw Error();
  const employee=await getEmployeeAccess(ctx,p.employeeId),caps=['reports.run','reports.pdf.generate',...(HR_LETTER_CAPABILITIES[p.code]??[])];
  if(!caps.every(employee.allows))throw Error();
  if(p.action==='submit'&&(!p.submission||p.submission.employeeId!==p.employeeId||p.submission.code!==p.code))throw Error();
  const db=await createClient(),s=p.submission;mutation=['submit','approve','reject'].includes(p.action);
  const result=await db.rpc('hr_letter_source_review',{p_employee:p.employeeId,p_code:p.code,p_action:p.action,p_id:p.id??null,p_after:p.after,p_operation:s?.operationId??null,
   p_data:s?{source_id:s.sourceId,receiver_id:s.receiverId,document_id:s.documentId,version_id:s.versionId,facts:s.facts}:p.kind?{kind:p.kind}:null});
  if(result.error)return {success:false as const,uncertain:mutation&&!['42501','22023','23514','PT409'].includes(result.error.code),error:'The source review was not confirmed. Check source/evidence access and the original values. A different authorised person must approve it.'};
  const fresh=await getAuthContext();if(fresh.profile?.id!==ctx.profile.id||!canUseApplication(fresh))throw Error();
  const current=await getEmployeeAccess(fresh,p.employeeId);if(!caps.every(current.allows))throw Error();
  if(p.action==='options')return {success:true as const,options:z.array(z.object({id,label:z.string(),version:id.optional()})).max(26).parse(result.data)};
  const rows=p.action==='list'?z.array(letterReviewRow).max(26).parse(result.data):[letterReviewRow.parse(result.data)];
  if(rows.some(row=>row.employee_id!==p.employeeId||row.code!==p.code))throw Error();
  return {success:true as const,rows};
 }catch{return {success:false as const,uncertain:mutation,error:'Source review could not be confirmed. Retry the retained request or refresh the review list; do not submit a replacement.'};}
}
