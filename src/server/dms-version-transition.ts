import 'server-only';
import {z} from 'zod';
import type {SupabaseClient} from '@supabase/supabase-js';

export const versionIdentity=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const receiptSchema=z.object({documentId:versionIdentity,versionId:versionIdentity,operation:z.enum(['promote','unlink']),
 filesRemoved:z.number().int().nonnegative(),promotedVersionNumber:z.number().int().positive().nullable(),documentHasNoVersion:z.boolean(),replayed:z.boolean()}).strict();
export async function changeDocumentVersion(client:SupabaseClient,documentId:number,versionId:number,operation:'promote'|'unlink'){
 let dispatched=false;
 try{
  if(!versionIdentity.safeParse(documentId).success||!versionIdentity.safeParse(versionId).success)return {success:false,error:'The selected document or version is invalid.'};
  const snapshot=await client.from('dms_documents').select('id,current_version_id').eq('id',documentId).is('deleted_at',null).maybeSingle();
  if(snapshot.error||!snapshot.data)return {success:false,error:'The document could not be verified. Refresh and check your access.'};
  dispatched=true;
  const response=await client.rpc('f07_change_document_version',{p_document:documentId,p_version:versionId,p_operation:operation,p_expected_current:snapshot.data.current_version_id});
  if(response.error){const code=response.error.code,known=typeof code==='string'&&/^(?:22|23|42|P0|PT)[A-Z0-9]{3}$/.test(code);return {success:false,uncertain:!known,error:code==='PT409'
   ?'The version or approval changed. Refresh and review the current state before continuing.'
   :known?'The version action was not completed. Check your access, active approval and renewal references.'
    :'The version action could not be confirmed. Keep this request and check its current state before retrying.'};}
  const receipt=receiptSchema.safeParse(response.data);
  if(!receipt.success||receipt.data.documentId!==documentId||receipt.data.versionId!==versionId||receipt.data.operation!==operation)return {success:false,uncertain:true,error:'The version outcome could not be verified. Refresh before continuing.'};
  return {success:true,data:receipt.data};
 }catch{return {success:false,uncertain:dispatched,error:dispatched?'The version outcome could not be confirmed. Refresh before continuing.':'The document could not be verified. No version change was sent.'};}
}
