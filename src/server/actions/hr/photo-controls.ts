'use server';
import {z} from 'zod';
import {currentPhotoState,loadPhotoSource,photoSubjectSchema} from '@/server/hr-photo-source';
import {createClient} from '@/lib/supabase/server';
import {getAuthContext,hasPermission} from '@/lib/rbac/check';
import {getMetadataDefinitionsForType,getDmsDocumentMetadataValues,saveDmsDocumentMetadataValues} from '@/server/actions/dms/document-metadata-values';
import {photoMetadataRequest} from '@/lib/hr/photo-metadata';

const photoDetailsSubject=photoSubjectSchema.extend({document:z.number().int().positive().safe(),type:z.number().int().positive().safe()}).strict();
export async function readPhotoRequiredDetails(raw:unknown){
 const parsed=photoDetailsSubject.safeParse(raw);if(!parsed.success)return {success:false as const,error:'Choose the saved person and retained photo.'};
 try{
  const p=parsed.data;await loadPhotoSource(p.employee,p.dependent,p.document);
  const definitions=await getMetadataDefinitionsForType(p.type,'all',p.document),values=await getDmsDocumentMetadataValues(p.document);
  if(!definitions.success||!definitions.data||!values.success||!values.data||!values.snapshot)throw Error('Required photo details unavailable.');
  return {success:true as const,details:{definitions:definitions.data,values:values.data,snapshot:values.snapshot}};
 }catch{return {success:false as const,error:'Photo uploaded; its required details could not be checked. Retry Save with current access.'};}
}
export async function completePhotoRequiredDetails(raw:unknown,request:unknown){
 const p=photoDetailsSubject.safeParse(raw),r=photoMetadataRequest.safeParse(request);
 if(!p.success||!r.success)return {success:false as const,error:'Invalid retained photo details.'};
 try{
  await loadPhotoSource(p.data.employee,p.data.dependent,p.data.document);
  // The native reviewed operation checks all required definitions and exact
  // snapshot, then replays the retained receipt after response loss.
  return await saveDmsDocumentMetadataValues(p.data.document,r.data.values,{requestId:r.data.requestId,snapshot:r.data.snapshot});
 }catch{return {success:false as const,uncertain:true,error:'Photo details are unconfirmed. Retry the same saved request.'};}
}

export async function readPhotoDocumentTypes() {
  const ctx=await getAuthContext();
  if(!ctx.profile||!ctx.isAccountActive||ctx.profile.must_change_password||!hasPermission(ctx,'dms.documents.create'))return {success:false as const,error:'Photo upload permission is required.',rows:[]};
  const client=await createClient();
  const result=await client.from('dms_document_types').select('id,type_code,name_en,requires_expiry_tracking').is('deleted_at',null).eq('is_active',true).or('name_en.ilike.%photo%,type_code.ilike.%photo%').order('id').limit(100);
  if(result.error)return {success:false as const,error:'Photo document settings could not be loaded.',rows:[]};
  return {success:true as const,rows:result.data??[]};
}

export async function readSavedSubjectPhoto(raw:unknown) {
  const p=photoSubjectSchema.safeParse(raw);if(!p.success)return {success:false as const,error:'Choose a saved person.'};
  try{return {success:true as const,...(await currentPhotoState(p.data.employee,p.data.dependent)).state};}
  catch{return {success:false as const,error:'Photo unavailable or restricted. The recorded selection is retained.'};}
}
export async function readPhotoFramingSource(raw:unknown) {
  const p=photoSubjectSchema.extend({document:z.number().int().positive().safe()}).safeParse(raw);
  if(!p.success)return {success:false as const,error:'Choose a saved person and photo.'};
  try{const r=await loadPhotoSource(p.data.employee,p.data.dependent,p.data.document);return {success:true as const,source:r.source};}
  catch{return {success:false as const,error:'The original photo could not be verified. Retry before changing its framing.'};}
}
