import 'server-only';
import {readBoundedDmsObject,verifyDmsBlob} from '@/server/dms-file-verification';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {resolveStandardFileName} from '@/lib/dms/resolve-standard-file-name';
import {uploadCreationContractSchema,uploadCreationInputSchema,uploadCreationPlanSchema,uploadCreationReceiptSchema,
 uploadCreationSnapshotSchema,type UploadCreationInput,type UploadCreationResult} from '@/lib/dms/numbered-upload-create';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import {z} from 'zod';

const unconfirmed='Document creation is unconfirmed. Retry this retained request; do not upload or create it again.';
function failure(code:string|undefined,retained?:{documentId:number;documentNo:string}):UploadCreationResult{
 // A received abort resolves only this invocation, never an earlier unknown one.
 const rollback=typeof code==='string'&&code.length===5&&(/^(?:22|23|42|P0|PT)[0-9A-Z]{3}$/.test(code)||['40000','40001','40002','40P01'].includes(code));
 return {success:false,uncertain:!!retained||!rollback,retained,error:retained?
  `Document ${retained.documentNo} is retained, but its attachment is incomplete. Retry this same request; do not create it again.`:
  code==='42501'?'This upload or its destination is unavailable, or you no longer have permission to complete it.':
  rollback?'The request was rejected. Check the upload and its metadata; no new document was committed.':unconfirmed};
}
async function verifiedSource(storage:ReturnType<ReturnType<typeof createAdminClient>['storage']['from']>,source:z.infer<typeof uploadCreationSnapshotSchema>['source'],sha256=source.sha256_hash){
 const body=await readBoundedDmsObject(storage,source.temp_storage_path,source.file_size_bytes);
 const proof=await verifyDmsBlob(body,{name:source.original_filename,mime:source.mime_type,size:source.file_size_bytes,sha256});
 return {body,proof};
}
const objectIdentity=z.object({id:z.string().uuid(),version:z.string().min(1),lastModified:z.string().datetime({offset:true})});

/** Bounded upload consumer: read-only preparation, retained atomic creation,
 * existing storage copy, atomic attachment completion. Never deletes/overwrites
 * a retained document, allocated reference, source or destination object. */
export async function createNumberedDocumentFromUpload(input:UploadCreationInput,contract?:WorkspaceSaveContract):Promise<UploadCreationResult>{
 const identity=uploadCreationContractSchema.safeParse(contract),parsed=uploadCreationInputSchema.safeParse(input);
 if(!identity.success)return {success:false,error:'Reopen this dialog before saving. Its creation request identity is missing.'};
 if(!parsed.success)return {success:false,error:parsed.error.issues[0]?.message??'Invalid creation request.'};
 let retained:{documentId:number;documentNo:string}|undefined;
 let dispatched=false;
 try{
  const client=await createClient();
  const request=parsed.data;
  if(!request.prepared){
   const response=await client.rpc('prepare_numbered_dms_upload',{p_session:request.uploadSessionId,p_type:request.document_type_id});
   if(response.error)return failure(response.error.code);
   const snapshot=uploadCreationSnapshotSchema.safeParse(response.data);
   if(!snapshot.success||snapshot.data.source.id!==request.uploadSessionId||snapshot.data.type.id!==request.document_type_id||
    (request.owning_company_id!==undefined&&request.owning_company_id!==snapshot.data.source.owning_company_id))return {success:false,error:'The upload source could not be verified.'};
   // Admission is caller-bound and current BEFORE privileged file access.
   const storage=createAdminClient();
   const {proof}=await verifiedSource(storage.storage.from('dms-temp'),snapshot.data.source);
   const contentSha=proof.sha256;
   return {success:false,prepared:{operation_id:identity.data.operationId,snapshot:{...snapshot.data,content_sha256:contentSha}}};
  }
  dispatched=true;
  const begun=await client.rpc('create_numbered_dms_upload',{p_operation:identity.data.operationId,p_request:request});
  if(begun.error)return failure(begun.error.code);
  const plan=uploadCreationPlanSchema.safeParse(begun.data);
  if(!plan.success||plan.data.operation_id!==identity.data.operationId||plan.data.upload_session_id!==request.uploadSessionId)return {success:false,uncertain:true,error:unconfirmed};
  const {documentId,documentNo}=plan.data;
  retained={documentId,documentNo};
  if(plan.data.completed)return {success:true,data:uploadCreationReceiptSchema.parse({documentId,documentNo,
   operation_id:identity.data.operationId,upload_session_id:request.uploadSessionId,replayed:plan.data.replayed,completed:true})};
  const source=request.prepared.source;
  const storage=createAdminClient();
  const original=await verifiedSource(storage.storage.from('dms-temp'),source,request.prepared.content_sha256);
  // Immutable document-bound destination; neither upsert nor cleanup is allowed.
  // An ambiguous upload reply can be recovered ONLY by independently checking
  // exact bytes under a stable object identity/version at this operation's
  // newly allocated document path. This does not attest the first uploader.
  // Storage sends Blob uploads as multipart and uses the Blob's own MIME type.
  // The bounded reader intentionally returns untyped bytes; attach only the
  // actual verified type so the immutable copy passes its native attestation.
  await storage.storage.from('dms-documents').upload(plan.data.storage_path,new Blob([original.body],{type:original.proof.mime}),{contentType:original.proof.mime,upsert:false});
  const rechecked=await client.rpc('create_numbered_dms_upload',{p_operation:identity.data.operationId,p_request:request});
  const admission=uploadCreationPlanSchema.safeParse(rechecked.data);
  if(rechecked.error||!admission.success||admission.data.operation_id!==identity.data.operationId||admission.data.documentId!==documentId||
   admission.data.upload_session_id!==request.uploadSessionId||admission.data.storage_path!==plan.data.storage_path||
   admission.data.actor_id!==plan.data.actor_id||admission.data.auth_session_id!==plan.data.auth_session_id)return failure(rechecked.error?.code,retained);
  const before=await storage.storage.from('dms-documents').info(plan.data.storage_path);
  const beforeIdentity=objectIdentity.safeParse(before.data);
  if(before.error||!beforeIdentity.success)return failure(undefined,retained);
  await verifiedSource(storage.storage.from('dms-documents'),{...source,temp_storage_path:plan.data.storage_path},request.prepared.content_sha256);
  const after=await storage.storage.from('dms-documents').info(plan.data.storage_path);
  const afterIdentity=objectIdentity.safeParse(after.data);
  if(after.error||!afterIdentity.success||JSON.stringify(beforeIdentity.data)!==JSON.stringify(afterIdentity.data))return failure('PT409',retained);
  const fileName=resolveStandardFileName({typeCode:request.prepared.type.type_code,
   requiresExpiryTracking:request.prepared.type.requires_expiry_tracking,expiryDate:request.expiry_date??null,
   documentNo,originalFilename:source.original_filename,mimeType:source.mime_type});
  // A private server-only receipt, not client-writable object metadata. The
  // service RPC can record copy provenance only; it cannot write DMS records.
  const attested=await storage.rpc('attest_numbered_dms_upload',{p_actor:plan.data.actor_id,p_session:plan.data.auth_session_id,
   p_operation:identity.data.operationId,p_request:request,p_document:documentId,p_path:plan.data.storage_path,
   p_object:afterIdentity.data.id,p_version:afterIdentity.data.version,p_updated_at:afterIdentity.data.lastModified,
   p_sha256:request.prepared.content_sha256,p_size:source.file_size_bytes,p_file_name:fileName});
  if(attested.error)return failure(attested.error.code,retained);
  const finished=await client.rpc('finish_numbered_dms_upload',{p_operation:identity.data.operationId,p_request:request,p_file_name:fileName});
  if(finished.error)return failure(finished.error.code,retained);
  const receipt=uploadCreationReceiptSchema.safeParse(finished.data);
  if(!receipt.success||receipt.data.operation_id!==identity.data.operationId||receipt.data.upload_session_id!==request.uploadSessionId||
   receipt.data.documentId!==documentId||receipt.data.documentNo!==documentNo)return failure(undefined,retained);
  return {success:true,data:receipt.data};
 }catch{return retained?failure(undefined,retained):{success:false,uncertain:dispatched,error:dispatched?unconfirmed:'The upload could not be verified. No creation request was dispatched.'};}
}
