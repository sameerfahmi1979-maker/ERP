import 'server-only';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {verifyDmsBlob,readBoundedDmsObject} from '@/server/dms-file-verification';
import {resolveStandardFileNameForExistingDocument} from '@/server/actions/dms/standard-file-name';
const id=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const attachmentInputSchema=z.object({uploadSessionId:id,documentId:id,changeNotes:z.string().max(2000).optional(),versionLabel:z.string().max(100).optional(),allowDuplicate:z.boolean().optional().default(false)}).strict();
export type AttachmentInput=z.input<typeof attachmentInputSchema>;
const receiptSchema=z.object({documentId:id,versionId:id,fileId:id,operationId:z.string().uuid(),uploadSessionId:id,replayed:z.boolean()}).strict();
const planSchema=z.object({operationId:z.string().uuid(),actorId:id,authSessionId:z.string().uuid(),documentId:id,uploadSessionId:id,versionNumber:id,storagePath:z.string().min(1),
 source:z.object({path:z.string().min(1),name:z.string().min(1),mime:z.string().min(1),size:id,sha256:z.string().nullable(),company:id.nullable(),branch:id.nullable(),aiResult:id.nullable()}).strict(),receipt:receiptSchema.nullable()}).strict();
const objectSchema=z.object({id:z.string().uuid(),version:z.string().min(1),lastModified:z.string().datetime({offset:true})});
const unknown='Attachment outcome is unconfirmed. Keep this Inbox upload and retry the same destination and wording; do not upload it again. No copied file has been deleted.';
export async function attachVerifiedDocumentVersion(input:AttachmentInput){
 const parsed=attachmentInputSchema.safeParse(input);
 if(!parsed.success)return {success:false,error:'Invalid attachment request.'};
 let dispatched=false;
 try{
  const request=parsed.data,client=await createClient();
  const args={p_session:request.uploadSessionId,p_document:request.documentId,p_notes:request.changeNotes??null,p_label:request.versionLabel??null};
  dispatched=true;
  const prepared=await client.rpc('f07_prepare_attachment',args);
  if(prepared.error)return failure(prepared.error.code);
  const verified=planSchema.safeParse(prepared.data);
  if(!verified.success||verified.data.documentId!==request.documentId||verified.data.uploadSessionId!==request.uploadSessionId)return {success:false,uncertain:true,error:unknown};
  const plan=verified.data;
  if(plan.receipt){if(plan.receipt.operationId!==plan.operationId||plan.receipt.documentId!==plan.documentId||plan.receipt.uploadSessionId!==plan.uploadSessionId)return {success:false,uncertain:true,error:unknown};return {success:true,data:{...plan.receipt,replayed:true}};}
  const storage=createAdminClient();
  const original=await readBoundedDmsObject(storage.storage.from('dms-temp'),plan.source.path,plan.source.size);
  const bytes=await verifyDmsBlob(original,plan.source);
  // No upsert and no compensating deletion: an ambiguous copy can already exist.
  await storage.storage.from('dms-documents').upload(plan.storagePath,new Blob([original],{type:bytes.mime}),{contentType:bytes.mime,upsert:false});
  const readmitted=await client.rpc('f07_prepare_attachment',args);
  if(readmitted.error)return failure(readmitted.error.code);
  const refreshed=planSchema.safeParse(readmitted.data);
  if(!refreshed.success||refreshed.data.operationId!==plan.operationId||refreshed.data.storagePath!==plan.storagePath||JSON.stringify(refreshed.data.source)!==JSON.stringify(plan.source))return {success:false,uncertain:true,error:unknown};
  const before=await storage.storage.from('dms-documents').info(plan.storagePath),beforeId=objectSchema.safeParse(before.data);
  if(before.error||!beforeId.success)return {success:false,uncertain:true,error:unknown};
  const copied=await readBoundedDmsObject(storage.storage.from('dms-documents'),plan.storagePath,plan.source.size);
  await verifyDmsBlob(copied,{...plan.source,sha256:bytes.sha256});
  const after=await storage.storage.from('dms-documents').info(plan.storagePath),afterId=objectSchema.safeParse(after.data);
  if(after.error||!afterId.success||JSON.stringify(beforeId.data)!==JSON.stringify(afterId.data))return {success:false,uncertain:true,error:unknown};
  const fileName=await resolveStandardFileNameForExistingDocument({documentId:plan.documentId,originalFilename:plan.source.name,mimeType:bytes.mime});
  const attested=await storage.rpc('f07_attest_attachment',{p_session:plan.uploadSessionId,p_actor:plan.actorId,p_auth_session:plan.authSessionId,p_operation:plan.operationId,
   p_object:afterId.data.id,p_version:afterId.data.version,p_updated:afterId.data.lastModified,p_sha256:bytes.sha256,p_size:bytes.size,p_file_name:fileName});
  if(attested.error)return failure(attested.error.code);
  const finished=await client.rpc('f07_finish_attachment',args);
  if(finished.error)return failure(finished.error.code);
  const receipt=receiptSchema.safeParse(finished.data);
  if(!receipt.success||receipt.data.operationId!==plan.operationId||receipt.data.documentId!==plan.documentId||receipt.data.uploadSessionId!==plan.uploadSessionId)return {success:false,uncertain:true,error:unknown};
  return {success:true,data:receipt.data};
 }catch{return {success:false,uncertain:dispatched,error:unknown};}
}
function failure(code:string|undefined){
 const known=/^(?:22|23|42|P0|PT)[A-Z0-9]{3}$/.test(code??'');
 return {success:false,uncertain:!known,error:known?'The attachment was rejected. Check file format, upload expiry, review status, current version and scoped upload/edit/preview permissions. Retained copies are not deleted.':unknown};
}
