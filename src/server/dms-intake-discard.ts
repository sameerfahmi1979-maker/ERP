import 'server-only';
import {z} from 'zod';
import type {SupabaseClient} from '@supabase/supabase-js';
const id=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const request=z.object({sessionId:id,documentId:id.nullable(),reason:z.string().max(500).optional()}).strict();
const receipt=z.object({uploadSessionId:id,documentId:id.nullable(),batchId:id.nullable(),retained:z.literal(true),replayed:z.boolean()}).strict();
/** No privileged Storage client, destructive fallback or new operation on retry. */
export async function discardRetainedIntake(client:SupabaseClient,input:z.input<typeof request>){
 const p=request.safeParse(input);
 if(!p.success)return {ok:false as const,error:'Invalid discard request.'};
 try{
  const r=await client.rpc('f07_discard_intake',{p_session:p.data.sessionId,p_document:p.data.documentId,p_reason:p.data.reason??null});
  if(r.error){const rejected=/^(?:22|23|42|P0|PT)[A-Z0-9]{3}$/.test(r.error.code??'');return {ok:false as const,uncertain:!rejected,error:rejected?
   r.error.code==='42501'?'You cannot discard this intake with your current access. A retained approval must be cancelled by its original uploader.':
   'Discard was not completed. This intake may already have a document or a conflicting operation. Refresh the Inbox and review its current state; all files remain retained.':
   'Discard is unconfirmed. Retry the same intake and reason; no file has been deleted.'};}
  const parsed=receipt.safeParse(r.data);
  if(!parsed.success||parsed.data.uploadSessionId!==p.data.sessionId||parsed.data.documentId!==p.data.documentId)throw Error('Unverified receipt');
  return {ok:true as const,batchId:parsed.data.batchId};
 }catch{return {ok:false as const,uncertain:true,error:'Discard is unconfirmed. Retry the same intake and reason; no file has been deleted.'};}
}
