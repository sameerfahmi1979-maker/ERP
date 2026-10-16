import 'server-only';
import {createClient} from '@/lib/supabase/server';
import {candidateConversionReceiptSchema,requisitionCreationReceiptSchema,type CandidateConversionReceipt,type RequisitionCreationReceipt,type RecruitmentMutationResult} from '@/lib/hr/numbered-recruitment-contract';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';

export async function saveNumberedRecruitment(kind:'requisition',payload:object,contract:WorkspaceSaveContract):Promise<RecruitmentMutationResult<RequisitionCreationReceipt>>;
export async function saveNumberedRecruitment(kind:'conversion',payload:object,contract:WorkspaceSaveContract,candidateId:number):Promise<RecruitmentMutationResult<CandidateConversionReceipt>>;
export async function saveNumberedRecruitment(kind:'requisition'|'conversion',payload:object,contract:WorkspaceSaveContract,candidateId?:number):Promise<RecruitmentMutationResult<RequisitionCreationReceipt|CandidateConversionReceipt>>{
 try{
  const client=await createClient();
  const {data,error}=await client.rpc(kind==='requisition'?'create_numbered_job_requisition':'convert_candidate_to_employee_atomic',{
   p_operation:contract.operationId,p_data:payload,...(kind==='conversion'?{p_candidate:candidateId,p_revision:contract.revision}:{}),
  });
  if(error){
   const code=error.code;
   // Completion-unknown is not rollback; malformed codes must not match a prefix.
   const rollback=typeof code==='string'&&code.length===5&&(/^(?:22|23|42|P0|PT)[0-9A-Z]{3}$/.test(code)||['40000','40001','40002','40P01'].includes(code));
   return {success:false,uncertain:!rollback,error:error.code==='42501'?'The source or destination is unavailable, or the required recruitment, employee, and numbering permissions are missing.':error.code==='P0409'?'The candidate changed since review. Reopen the candidate before starting a new conversion.':error.code==='PT409'?'This candidate or operation was already processed differently. Review its existing result.':error.code==='P0002'?'An eligible numbering rule or required source is unavailable.':rollback?'The request was rejected. Check its values; this attempt committed no changes.':'Save unconfirmed. Retry the original request to recover its result.'};
  }
  const parsed=(kind==='requisition'?requisitionCreationReceiptSchema:candidateConversionReceiptSchema).safeParse(data);
  if(!parsed.success||parsed.data.operation_id!==contract.operationId||(kind==='conversion'&&(!('candidate_id' in parsed.data)||parsed.data.candidate_id!==candidateId)))return {success:false,uncertain:true,error:'Save response incomplete. Retry the original request to recover its result.'};
  return {success:true,data:parsed.data};
 }catch{return {success:false,uncertain:true,error:'Save unconfirmed. Retry the original request to recover its result.'};}
}
