import 'server-only';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {revalidatePath} from 'next/cache';
import {logger} from '@/lib/logger';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import type {ActionResult} from '@/features/master-data/parties/party-types';

const codes={parties:'party_code',party_contacts:'contact_code',party_addresses:'address_code',party_bank_details:'bank_detail_code',party_licenses:'license_code',party_tax_registrations:'tax_registration_code',party_documents:'document_code',party_notes:'note_code'} as const;
type Entity=keyof typeof codes;
const contractSchema=z.object({operationId:z.string().uuid(),revision:z.null()}).strict();
const receiptSchema=z.object({id:z.number().int().positive(),entity:z.enum(Object.keys(codes) as [Entity,...Entity[]]),reference:z.string().min(1),reference_id:z.number().int().positive(),operation_id:z.string().uuid(),replayed:z.boolean(),revision:z.string().regex(/^[1-9]\d*$/)}).strict();
type Created<E extends Entity>={id:number;replayed:boolean;revision:string}&Record<(typeof codes)[E],string>;

/** No server-minted retry identity: the form retains its original request. */
export async function createNumberedParty<E extends Entity>(entity:E,payload:object,contract:WorkspaceSaveContract):Promise<ActionResult<Created<E>>>{
 const parsed=contractSchema.safeParse(contract);
 if(!parsed.success)return {success:false,error:'Reopen this form before saving. Its creation request identity is missing.'};
 try{
  const client=await createClient();
  const {data,error}=await client.rpc('create_numbered_party_record',{p_entity:entity,p_operation:parsed.data.operationId,p_data:payload});
  if(error){
   const code=error.code;
   // Completion-unknown is not rollback; malformed codes must not match a prefix.
   const rollback=typeof code==='string'&&code.length===5&&(/^(?:22|23|42|P0|PT)[0-9A-Z]{3}$/.test(code)||['40000','40001','40002','40P01'].includes(code));
   return {success:false,uncertain:!rollback,error:error.code==='42501'?'This record is unavailable or you no longer have permission to create it.':error.code==='23505'?'A record with these unique details already exists. Check it before trying again.':error.code==='P0002'?'No active, effective numbering rule is available for this record.':rollback?'The save was rejected. Check the values; no record or number was committed.':'Save unconfirmed. Keep the same values and retry to recover the original result.'};
  }
  const receipt=receiptSchema.safeParse(data);
  if(!receipt.success||receipt.data.entity!==entity||receipt.data.operation_id!==parsed.data.operationId)return {success:false,uncertain:true,error:'Save response incomplete. Keep the same values and retry to recover the original result.'};
  try{revalidatePath('/admin/master-data/parties');revalidatePath('/admin/settings/numbering');}
  catch{logger.warn('Party creation committed; refreshing its views is temporarily unavailable.');}
  return {success:true,data:{id:receipt.data.id,[codes[entity]]:receipt.data.reference,replayed:receipt.data.replayed,revision:receipt.data.revision} as Created<E>};
 }catch{return {success:false,uncertain:true,error:'Save unconfirmed. Keep the same values and retry to recover the original result.'};}
}
