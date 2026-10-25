import 'server-only';
import {z} from 'zod';
import {createHash} from 'node:crypto';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {getAuthContext} from '@/lib/rbac/check';
import {checkDocumentConfidentialityAccess} from '@/lib/dms/document-access';
import {readBoundedDmsObject} from '@/server/dms-file-verification';
import {inspectPhotoImage} from '@/server/hr-photo-image';
import {photoFramingSchema,PHOTO_MAX_BYTES,type PhotoFraming} from '@/lib/hr/photo-framing';

const id=z.number().int().positive().safe();
export const photoSubjectSchema=z.object({employee:id,dependent:id.nullable()}).strict();
export const photoChoiceSchema=z.object({document_id:id,version_id:id,file_id:id,label:z.string()}).strict();
export const photoStateSchema=z.object({documentId:id.nullable(),framing:photoFramingSchema.nullable(),photo:photoChoiceSchema.nullable(),canDownload:z.boolean()}).strict();
export async function currentPhotoState(employee:number,dependent:number|null) {
  photoSubjectSchema.parse({employee,dependent});
  const ctx=await getAuthContext();
  if(!ctx.profile||!ctx.isAccountActive||ctx.profile.must_change_password)throw Error('Current account required.');
  const client=await createClient(),r=await client.rpc('hr_subject_photo_state',{p_employee:employee,p_dependent:dependent});
  if(r.error)throw Error('Photo access unavailable.');
  return {client,ctx,state:photoStateSchema.parse(r.data)};
}
export async function loadPhotoSource(employee:number,dependent:number|null,documentId:number,download=false) {
  photoSubjectSchema.parse({employee,dependent});id.parse(documentId);
  const ctx=await getAuthContext();
  if(!ctx.profile||!ctx.isAccountActive||ctx.profile.must_change_password)throw Error('Current account required.');
  const client=await createClient(),r=await client.rpc('f12_subject_photo',{p_employee:employee,p_dependent:dependent,p_document:documentId});
  const choices=z.array(photoChoiceSchema).length(1).safeParse(r.data);
  if(r.error||!choices.success)throw Error('Choose a currently permitted photo linked to this person.');
  const choice=choices.data[0];
  const record=await client.from('dms_document_files').select('id,document_id,version_id,storage_bucket,storage_path,file_name,mime_type,file_size_bytes,sha256_hash').eq('id',choice.file_id).is('deleted_at',null).single();
  const file=record.data;
  if(record.error||!file||file.document_id!==documentId||file.version_id!==choice.version_id||file.storage_bucket!=='dms-documents'||Number(file.file_size_bytes)>PHOTO_MAX_BYTES||Number(file.file_size_bytes)<1)throw Error('Photo source unavailable.');
  const required=download?'dms.documents.download':'dms.documents.preview';
  if(!(await checkDocumentConfidentialityAccess(client,documentId,ctx,required)).allowed)throw Error('Photo access unavailable.');
  const admin=createAdminClient(),blob=await readBoundedDmsObject(admin.storage.from(file.storage_bucket),file.storage_path,Number(file.file_size_bytes));
  const bytes=Buffer.from(await blob.arrayBuffer());
  if(bytes.length!==Number(file.file_size_bytes)||createHash('sha256').update(bytes).digest('hex')!==file.sha256_hash)throw Error('Photo integrity could not be verified.');
  const image=await inspectPhotoImage(bytes,file.mime_type);
  const again=await client.rpc('f12_subject_photo',{p_employee:employee,p_dependent:dependent,p_document:documentId});
  if(again.error||JSON.stringify(again.data)!==JSON.stringify(r.data)||!(await checkDocumentConfidentialityAccess(client,documentId,ctx,required)).allowed)throw Error('Photo access changed.');
  const source={...image,documentId,versionId:choice.version_id,fileId:choice.file_id};
  const claims=await client.auth.getClaims();
  if(claims.error||claims.data?.claims.sub!==ctx.profile.auth_user_id)throw Error('Photo session changed.');
  const attested=await admin.rpc('hr_attest_photo_image',{p_employee:employee,p_dependent:dependent,p_source:source,p_claims:{sub:claims.data.claims.sub,session_id:claims.data.claims.session_id}});
  if(attested.error||attested.data!==true)throw Error('Photo decoding could not be recorded.');
  return {client,admin,ctx,bytes,file,source,label:choice.label};
}
export async function validateSavedPhotoFraming(employee:number,dependent:number|null,documentId:number|null|undefined,framing:PhotoFraming|null|undefined) {
  if(!framing)return;
  if(!documentId||framing.source.documentId!==documentId)throw Error('Photo selection and framing do not match.');
  const saved=await currentPhotoState(employee,dependent);
  if(saved.state.documentId===documentId&&JSON.stringify(saved.state.framing)===JSON.stringify(framing))return;
  const loaded=await loadPhotoSource(employee,dependent,documentId);
  if(JSON.stringify(loaded.source)!==JSON.stringify({...loaded.source,...framing.source}))throw Error('Photo source changed. Adjust its current framing.');
}
