import 'server-only';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {getAuthContext,hasPermission} from '@/lib/rbac/check';
import {revalidatePath} from 'next/cache';
import {resolveStandardFileNameForIntakeApprove} from '@/server/actions/dms/standard-file-name';
import {validateStandardFileName} from '@/lib/dms/standard-file-name';
import {runPostCommitOcr} from '@/lib/dms/approve/approve-ai-intake';
import {triggerDmsPostApproveOrchestration} from '@/lib/dms/orchestration/post-approve-orchestration';
import {aiApprovalContractSchema,aiApprovalInputSchema,aiApprovalSnapshotSchema,aiApprovalPlanSchema,aiApprovalReceiptSchema,type AiApprovalResult} from '@/lib/dms/numbered-ai-approval';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';

const identity=z.object({id:z.string().uuid(),version:z.string().min(1),lastModified:z.string().datetime({offset:true})});
const hash=async(blob:Blob)=>createHash('sha256').update(Buffer.from(await blob.arrayBuffer())).digest('hex');
const lost='Approval is unconfirmed. Retry this retained request; do not create another document.';
function failure(code?:string,retained?:{documentId:number;documentNo:string}):AiApprovalResult{
 // Use one exact decision for both recovery state and safe feedback.
 const rollback=typeof code==='string'&&code.length===5&&(/^(?:22|23|42|P0|PT)[0-9A-Z]{3}$/.test(code)||['40000','40001','40002','40P01'].includes(code));
 return {success:false,uncertain:!!retained||!rollback,retained,
  error:retained?`Reference ${retained.documentNo} is reserved for this approval. Retry the same request; its document is not yet confirmed.`:
   code==='42501'?'This intake or destination is unavailable, or approval permission changed.':rollback?'Approval was rejected. Review the intake and its selected records.':lost};
}

/** Single-file only. Storage is outside the invoker transaction. A durable
 * reservation is not a document or a successful approval; never compensate an
 * uncertain outcome by deleting bytes, voiding a number or replacing identity. */
export async function approveNumberedAiIntake(input:unknown,contract?:WorkspaceSaveContract):Promise<AiApprovalResult>{
 const c=aiApprovalContractSchema.safeParse(contract),parsed=aiApprovalInputSchema.safeParse(input);
 if(!c.success)return {success:false,error:'Reopen this intake before approving. Its request identity is missing.'};
 if(!parsed.success)return {success:false,error:parsed.error.issues[0]?.message??'Invalid approval request.'};
 const preparationFailure=(result:AiApprovalResult):AiApprovalResult=>!parsed.data.prepared&&!result.success&&!result.uncertain&&!result.prepared&&!result.retained
  ?{...result,uncertain:false,preparationRejected:{operation_id:c.data.operationId,upload_session_id:parsed.data.uploadSessionId}}:result;
 let retained:{documentId:number;documentNo:string}|undefined,dispatched=false;
 try{
  const ctx=await getAuthContext();
  if(!ctx.profile||!['dms.documents.upload','dms.documents.review_ai','dms.admin'].some(code=>hasPermission(ctx,code))||!hasPermission(ctx,'numbering.rules.generate'))return preparationFailure(failure('42501'));
  const client=await createClient(),request=parsed.data;
  if(!request.prepared){
   const prepared=await client.rpc('prepare_numbered_ai_intake',{p_request:request});
   if(prepared.error)return preparationFailure(failure(prepared.error.code));
   const snapshot=aiApprovalSnapshotSchema.safeParse(prepared.data);
   if(!snapshot.success||snapshot.data.source.id!==request.uploadSessionId||snapshot.data.type.id!==request.documentTypeId)return {success:false,error:'The approval context could not be verified.'};
   if(request.standardFileName&&!validateStandardFileName(request.standardFileName,{requiresExpiryTracking:snapshot.data.type.requires_expiry_tracking}).valid)return preparationFailure({success:false,error:'Standard file name is incomplete. Review it before approving.'});
   const storage=createAdminClient(),source=snapshot.data.source;
   const original=await storage.storage.from('dms-temp').download(source.temp_storage_path);
   if(original.error||!original.data||original.data.size!==source.file_size_bytes)return preparationFailure({success:false,error:'The source file is unavailable or changed. No reference was reserved.'});
   const sha=await hash(original.data);
   if(source.sha256_hash&&source.sha256_hash.toLowerCase()!==sha)return preparationFailure({success:false,error:'The source file does not match its recorded content. No reference was reserved.'});
   return {success:false,prepared:{operation_id:c.data.operationId,snapshot:{...snapshot.data,content_sha256:sha}}};
  }
  dispatched=true;
  const begun=await client.rpc('reserve_numbered_ai_intake',{p_operation:c.data.operationId,p_request:request});
  if(begun.error)return failure(begun.error.code);
  const plan=aiApprovalPlanSchema.safeParse(begun.data);
  if(!plan.success||plan.data.operation_id!==c.data.operationId||plan.data.upload_session_id!==request.uploadSessionId||plan.data.actor_id!==ctx.profile.id)return {success:false,uncertain:true,error:lost};
  const p=plan.data;retained={documentId:p.documentId,documentNo:p.documentNo};
  if(p.completed){const receipt=aiApprovalReceiptSchema.safeParse({documentId:p.documentId,documentNo:p.documentNo,upload_session_id:p.upload_session_id,operation_id:p.operation_id,approve_run_id:p.approve_run_id,file_id:p.file_id,completed:true,replayed:true});return receipt.success?{success:true,data:receipt.data}:failure(undefined,retained);}
  const source=request.prepared.source;
  const fileName=await resolveStandardFileNameForIntakeApprove({uploadSessionId:request.uploadSessionId,documentTypeId:request.documentTypeId,
   expiryDate:request.expiryDate??null,documentNo:p.documentNo,partyId:request.partyId??null,links:request.links,metadataValues:request.metadataValues,
   standardFileName:request.standardFileName??null,originalFilename:source.original_filename,aiResultId:request.prepared.analysis_result_id,
   description:request.description??null,title:request.title});
  if(!validateStandardFileName(fileName,{requiresExpiryTracking:request.prepared.type.requires_expiry_tracking}).valid)return failure('22023',retained);
  const storage=createAdminClient(),original=await storage.storage.from('dms-temp').download(source.temp_storage_path);
  if(original.error||!original.data||original.data.size!==source.file_size_bytes||await hash(original.data)!==request.prepared.content_sha256)return failure('PT409',retained);
  await storage.storage.from('dms-documents').upload(p.storage_path,original.data,{contentType:source.mime_type,upsert:false});
  const recheck=await client.rpc('reserve_numbered_ai_intake',{p_operation:c.data.operationId,p_request:request});
  const current=aiApprovalPlanSchema.safeParse(recheck.data);
  if(recheck.error||!current.success||['documentId','documentNo','operation_id','upload_session_id','approve_run_id','storage_path','actor_id','auth_session_id'].some(key=>current.data[key as keyof typeof current.data]!==p[key as keyof typeof p]))return failure(recheck.error?.code,retained);
  if(current.data.completed){
   const replay=aiApprovalReceiptSchema.safeParse({documentId:p.documentId,documentNo:p.documentNo,upload_session_id:p.upload_session_id,operation_id:p.operation_id,
    approve_run_id:p.approve_run_id,file_id:current.data.file_id,completed:true,replayed:true});
   return replay.success?{success:true,data:replay.data}:failure(undefined,retained);
  }
  const before=await storage.storage.from('dms-documents').info(p.storage_path),beforeId=identity.safeParse(before.data);
  if(before.error||!beforeId.success)return failure(undefined,retained);
  const copied=await storage.storage.from('dms-documents').download(p.storage_path);
  if(copied.error||!copied.data||copied.data.size!==source.file_size_bytes||await hash(copied.data)!==request.prepared.content_sha256)return failure('PT409',retained);
  const after=await storage.storage.from('dms-documents').info(p.storage_path),afterId=identity.safeParse(after.data);
  if(after.error||!afterId.success||JSON.stringify(afterId.data)!==JSON.stringify(beforeId.data))return failure('PT409',retained);
  const proof=await storage.rpc('attest_numbered_ai_intake',{p_actor:p.actor_id,p_session:p.auth_session_id,p_operation:c.data.operationId,p_request:request,
   p_object:afterId.data.id,p_version:afterId.data.version,p_updated_at:afterId.data.lastModified,p_sha256:request.prepared.content_sha256,p_size:source.file_size_bytes,p_file_name:fileName});
  if(proof.error)return failure(proof.error.code,retained);
  const finished=await client.rpc('finish_numbered_ai_intake',{p_operation:c.data.operationId,p_request:request,p_file_name:fileName});
  if(finished.error)return failure(finished.error.code,retained);
  const receipt=aiApprovalReceiptSchema.safeParse(finished.data);
  if(!receipt.success||receipt.data.operation_id!==c.data.operationId||receipt.data.upload_session_id!==request.uploadSessionId||receipt.data.documentId!==p.documentId||receipt.data.documentNo!==p.documentNo||receipt.data.approve_run_id!==p.approve_run_id)return failure(undefined,retained);
  // Only post-commit effects are best-effort. Mandatory business children,
  // history and the numbering consumption have already committed atomically.
  if(!receipt.data.replayed){
   try{await runPostCommitOcr(client,storage,{documentId:p.documentId,aiResultId:request.prepared.analysis_result_id,fileId:receipt.data.file_id,createFileVersion:true,sessionCode:source.session_code,userId:p.actor_id,mimeType:source.mime_type,resolvedFileName:fileName});}catch{}
   try{await triggerDmsPostApproveOrchestration({sessionCode:source.session_code,documentId:p.documentId,uploadSessionId:request.uploadSessionId,approveRunId:p.approve_run_id,source:'single_file_approve'});}catch{}
  }
  try{revalidatePath('/dms/documents');revalidatePath('/dms/inbox');revalidatePath(`/dms/intake/${source.session_code}`);}catch{}
  return {success:true,data:receipt.data};
 }catch{return retained?failure(undefined,retained):{success:false,uncertain:dispatched,error:dispatched?lost:'The intake could not be verified. No approval request was dispatched.'};}
}
