import 'server-only';
import {z} from 'zod';
import type {SupabaseClient} from '@supabase/supabase-js';
import {aiApprovalInputSchema,type AiApprovalInput} from '@/lib/dms/numbered-ai-approval';
import {copyFileToFinalStorage} from '@/lib/dms/approve/approve-ai-intake-storage';
import {readVerifiedIntakeSource} from './dms-verified-intake-source';
const id=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const receipt=z.object({documentId:id,documentNo:z.string().min(1),operationId:z.string().uuid(),approveRunId:id,fileId:id,completed:z.literal(true)}).strict();
const payload=z.object({upload_session_id:id,approve_run_id:id,document_id:id,document_no:z.string().min(1),create_file_version:z.boolean(),
 final_storage_bucket:z.literal('dms-documents'),final_storage_path:z.string().min(1),file_name:z.string().min(1),
 mime_type:z.string().min(1),file_size_bytes:id.max(50*1024*1024),sha256_hash:z.string().regex(/^[a-f0-9]{64}$/)}).passthrough();
const plan=z.object({operationId:z.string().uuid(),actorId:id,authSessionId:z.string().uuid(),request:aiApprovalInputSchema,
 source:z.object({id,path:z.string().min(1),name:z.string().min(1),mime:z.string().min(1),size:id,sha256:z.string().nullable()}).passthrough(),
 payload,receipt:receipt.nullable()}).strict();
export type RetainedBatchResult={success:true;data:{documentId:number;documentNo:string};approveRunId:number;replayed:boolean}|{success:false;error:string;uncertain:true};
const unconfirmed=():RetainedBatchResult=>({success:false,uncertain:true,error:'Finalization is unconfirmed. Its original request and files are retained. Retry this same intake; do not discard or upload a replacement.'});
/** External byte work is outside the atomic business transaction. Neither a
 * copy response nor a network failure can authorize deleting a final object. */
export async function finalizeRetainedBatch(client:SupabaseClient,admin:SupabaseClient,input:AiApprovalInput,proposedName:string,expectedActor:number):Promise<RetainedBatchResult>{
 try{
  const request=aiApprovalInputSchema.parse(input);
  if(request.prepared)return unconfirmed();
  const prepared=await client.rpc('f07_prepare_batch_finalization',{p_request:request,p_name:proposedName});
  const parsed=plan.safeParse(prepared.data);
  if(prepared.error||!parsed.success)return unconfirmed();
  const p=parsed.data,v=p.payload;
  if(p.actorId!==expectedActor||v.upload_session_id!==request.uploadSessionId||p.source.id!==request.uploadSessionId||
   JSON.stringify(p.request)!==JSON.stringify(request))return unconfirmed();
  // JSONB key order is not an identity check; strict canonical data is checked
  // by PostgreSQL at admission and again at the writer. Compare semantically.
  if(p.receipt){
   if(p.receipt.documentId!==v.document_id||p.receipt.documentNo!==v.document_no||p.receipt.operationId!==p.operationId||p.receipt.approveRunId!==v.approve_run_id)return unconfirmed();
   return {success:true,data:{documentId:v.document_id,documentNo:v.document_no},approveRunId:v.approve_run_id,replayed:true};
  }
  let verified;
  if(v.create_file_version){
   const copied=await copyFileToFinalStorage(admin,{tempBucket:'dms-temp',tempPath:p.source.path,finalBucket:v.final_storage_bucket,finalPath:v.final_storage_path,
    mimeType:v.mime_type,originalFilename:p.source.name,fileSizeBytes:v.file_size_bytes,sha256Hash:v.sha256_hash});
   if(!copied.success||!copied.evidence)return unconfirmed();
   verified=copied.evidence;
  }else{
   // An already-attached original is read-only: never recreate or heal it from
   // staging merely because a prior database response was absent.
   const read=await readVerifiedIntakeSource(admin.storage.from(v.final_storage_bucket),{path:v.final_storage_path,name:p.source.name,mime:v.mime_type,size:v.file_size_bytes,sha256:v.sha256_hash});
   verified={object:read.object,sha256:read.proof.sha256};
  }
  const attested=await admin.rpc('f07_attest_batch_finalization',{p_session:v.upload_session_id,p_operation:p.operationId,p_actor:p.actorId,p_auth_session:p.authSessionId,
   p_object:verified.object.id,p_version:verified.object.version,p_updated:verified.object.lastModified,p_sha256:verified.sha256});
  if(attested.error)return unconfirmed();
  const committed=await client.rpc('approve_dms_ai_intake',{p_payload:v});
  const row=z.array(z.object({out_document_id:id,out_document_no:z.string().min(1),out_status:z.literal('db_committed')})).length(1).safeParse(committed.data);
  if(committed.error||!row.success||row.data[0].out_document_id!==v.document_id||row.data[0].out_document_no!==v.document_no)return unconfirmed();
  return {success:true,data:{documentId:v.document_id,documentNo:v.document_no},approveRunId:v.approve_run_id,replayed:false};
 }catch{return unconfirmed();}
}
