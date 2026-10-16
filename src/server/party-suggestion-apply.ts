import 'server-only';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';

const receipt=z.object({suggestionId:z.number().int().positive(),partyId:z.number().int().positive(),field:z.enum(['display_name','legal_name_en','legal_name_ar','main_email','main_phone','website']),changed:z.boolean(),revision:z.string().regex(/^[1-9]\d*$/),replayed:z.boolean()}).strict();
const childReceipt=receipt.extend({field:z.enum(['license_number','expiry_date','tax_registration_number']),targetTable:z.enum(['party_licenses','party_tax_registrations']),targetId:z.number().int().positive()});
export async function applyPartyChildSuggestion(suggestionId:number,partyId:number,targetTable:string,targetField:string,targetId:number,acceptPending=false){
 try{
  const client=await createClient();
  const {data,error}=await client.rpc('apply_party_child_field_suggestion',{p_suggestion:suggestionId,p_accept_pending:acceptPending});
  if(error)return {success:false,message:error.code==='42501'?'You do not have access to the reviewed party, child record or source document.':error.code==='PT409'?'The reviewed record is unavailable or changed. Generate and review a new suggestion.':error.code==='PT404'?'The reviewed target no longer exists.':(typeof error.code==='string'&&error.code.length===5&&(/^(?:22|23|42|P0)[0-9A-Z]{3}$/.test(error.code)||['40000','40001','40002','40P01'].includes(error.code)))?'The suggestion was rejected; no field change was committed.':'Apply unconfirmed. Retry this same suggestion to recover its result.'};
  const parsed=childReceipt.safeParse(data),field=targetTable==='party_tax_registrations'&&targetField==='trn'?'tax_registration_number':targetField;
  if(!parsed.success||parsed.data.suggestionId!==suggestionId||parsed.data.partyId!==partyId||parsed.data.targetId!==targetId||parsed.data.targetTable!==targetTable||parsed.data.field!==field)return {success:false,message:'Apply response incomplete. Retry this same suggestion.'};
  return {success:true,message:parsed.data.replayed?'This reviewed suggestion was already applied.':parsed.data.changed?'The reviewed child field was updated.':'The child field already matches the reviewed value.'};
 }catch{return {success:false,message:'Apply unconfirmed. Retry this same suggestion to recover its result.'};}
}
export async function applyPartySuggestion(suggestionId:number,partyId:number,acceptPending=false){
 try{
  const client=await createClient();
  const {data,error}=await client.rpc('apply_party_field_suggestion',{p_suggestion:suggestionId,p_accept_pending:acceptPending});
  if(error)return {success:false,message:error.code==='42501'?'You no longer have permission to apply this party suggestion, or the party is locked.':error.code==='PT409'?'The party or reviewed suggestion changed. Compare the current values and review again.':error.code==='PT404'?'The party suggestion is no longer available.':(typeof error.code==='string'&&error.code.length===5&&(/^(?:22|23|42|P0)[0-9A-Z]{3}$/.test(error.code)||['40000','40001','40002','40P01'].includes(error.code)))?'The suggestion was rejected; no field change was committed.':'Apply unconfirmed. Retry this same suggestion to recover its result.'};
  const parsed=receipt.safeParse(data);
  if(!parsed.success||parsed.data.suggestionId!==suggestionId||parsed.data.partyId!==partyId)return {success:false,message:'Apply response incomplete. Retry this same suggestion to recover its result.'};
  return {success:true,message:parsed.data.replayed?'This suggestion was already applied.':parsed.data.changed?'The reviewed field was updated.':'The field already matches the reviewed value.'};
 }catch{return {success:false,message:'Apply unconfirmed. Retry this same suggestion to recover its result.'};}
}
