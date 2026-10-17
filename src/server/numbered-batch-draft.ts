import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {batchDraftRpcReceiptSchema,type BatchDraftInput,type BatchDraftResult} from '@/lib/dms/numbered-batch-draft';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import {parseBatchDraftRecovery,parseBatchDraftPreparation,type RecoveryFailure,type RecoveryEnvelope,type PrepareEnvelope} from '@/lib/dms/numbered-batch-draft';
import type {BatchReceipt,BatchOrigin} from '@/lib/dms/batch-admission';

export function batchDraftRecoveryError(code?:unknown):RecoveryFailure{
 const known=typeof code==='string'&&code.length===5&&(/^(?:22|23|42|P0|PT)[0-9A-Z]{3}$/.test(code)||['40000','40001','40002','40P01'].includes(code));
 if(!known)return {success:false,code:'unconfirmed',uncertain:true,error:'Draft recovery is unconfirmed. Retain the original request for reconciliation.'};
 return {success:false,code:code==='42501'?'unavailable':code==='PT409'||code==='23505'?'conflict':'rejected',uncertain:false,
  error:code==='42501'?'The batch or its current permissions are unavailable.':code==='PT409'||code==='23505'?'The retained batch conflicts with the current source. Keep its original identity for reconciliation.':'This draft recovery request was rejected. Retain any earlier unconfirmed request.'};
}
export async function readNumberedBatchDraftRecovery(client:SupabaseClient,receipt:BatchReceipt,origin:BatchOrigin):Promise<{success:true;data:RecoveryEnvelope}|RecoveryFailure>{
 try{
  const {data,error}=await client.rpc('read_dms_batch_draft_recovery',{p_admission_operation:receipt.operation_id}).retry(false);
  if(error)return batchDraftRecoveryError(error.code);
  const value=parseBatchDraftRecovery(data,receipt,origin);
  return value?{success:true,data:value}:batchDraftRecoveryError();
 }catch{return batchDraftRecoveryError();}
}
export async function prepareRecoverableNumberedBatchDraft(client:SupabaseClient,receipt:BatchReceipt,origin:BatchOrigin,position:number):Promise<{success:true;data:PrepareEnvelope}|RecoveryFailure>{
 try{
  const member=receipt.members[position];
  if(!member)return batchDraftRecoveryError('22023');
  const {data,error}=await client.rpc('prepare_recoverable_dms_batch_draft',{p_session:member.id}).retry(false);
  if(error)return batchDraftRecoveryError(error.code);
  const value=parseBatchDraftPreparation(data,receipt,origin,position);
  return value?{success:true,data:value}:batchDraftRecoveryError();
 }catch{return batchDraftRecoveryError();}
}


export function batchDraftSaveError(code?:string):BatchDraftResult{
 // A received abort resolves only this invocation, never an earlier unknown one.
 const rollback=typeof code==='string'&&code.length===5&&(/^(?:22|23|42|P0|PT)[0-9A-Z]{3}$/.test(code)||['40000','40001','40002','40P01'].includes(code));
 return {success:false,uncertain:!rollback,error:code==='42501'?'The upload, analysis, or selected scope is unavailable, or its required permissions changed.':code==='PT409'?'The upload or analysis changed. The draft was not created by this attempt; retain an earlier unconfirmed request for reconciliation.':code==='P0002'?'An active document type, analysis result, or numbering rule is unavailable.':rollback?'The draft save was rejected; this attempt committed no draft or number.':'Draft save unconfirmed. Retry the retained request to recover its result.'};
}

export async function createNumberedBatchDraft(client:SupabaseClient,input:BatchDraftInput,contract:WorkspaceSaveContract):Promise<BatchDraftResult>{
 try{
  const {data,error}=await client.rpc('create_numbered_dms_batch_draft',{p_operation:contract.operationId,p_request:input});
  if(error)return batchDraftSaveError(error.code);
  const receipt=batchDraftRpcReceiptSchema.safeParse(data);
  if(!receipt.success||receipt.data.operation_id!==contract.operationId||receipt.data.upload_session_id!==input.uploadSessionId)return {success:false,uncertain:true,error:'Draft response incomplete. Retry the retained request to recover its result.'};
  const {reference_id:_,...value}=receipt.data;void _;
  return {success:true,data:value};
 }catch{return batchDraftSaveError();}
}
