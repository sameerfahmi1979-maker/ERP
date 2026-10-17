import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {z} from 'zod';
const idSchema=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const receiptSchema=z.object({documentId:idSchema,archived:z.boolean(),status:z.string().min(1),replayed:z.boolean()}).strict();
export async function changeDocumentArchive(client:SupabaseClient,id:number,archive:boolean){
 let dispatched=false;
 try{
  if(!idSchema.safeParse(id).success)return {success:false,error:'Invalid document.'};
  const read=await client.from('dms_documents').select('id,updated_at').eq('id',id).is('deleted_at',null).maybeSingle();
  if(read.error||!read.data)return {success:false,error:'The document is unavailable. Refresh and check your access.'};
  dispatched=true;
  const result=await client.rpc('f07_archive_document',{p_document:id,p_archive:archive,p_expected:read.data.updated_at});
  if(result.error){const known=/^(?:22|23|42|P0|PT)[A-Z0-9]{3}$/.test(result.error.code??'');return {success:false,uncertain:!known,error:result.error.code==='PT409'
   ?'The archive action conflicts with the current content, approval or renewal history. Refresh; legacy archives require verified pre-archive history before restoration.'
   :known?'The archive action was not completed. Check your access and active approval.':'The archive outcome is unconfirmed. Refresh and check the document before retrying.'};}
  const receipt=receiptSchema.safeParse(result.data);
  if(!receipt.success||receipt.data.documentId!==id||receipt.data.archived!==archive)return {success:false,uncertain:true,error:'The archive outcome could not be verified. Refresh before continuing.'};
  return {success:true,data:receipt.data};
 }catch{return {success:false,uncertain:dispatched,error:dispatched?'The archive outcome is unconfirmed. Refresh before retrying.':'The document could not be checked. No archive request was sent.'};}
}
