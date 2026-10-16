import 'server-only';
import {createClient} from '@/lib/supabase/server';
import {dmsCreationContractSchema,dmsCreationRpcReceiptSchema,type DmsCreationReceipt} from '@/lib/dms/numbered-document-create';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';

export type DmsCreationResult={success:boolean;data?:DmsCreationReceipt;error?:string;uncertain?:boolean};
/** One transaction owns the allocator, document, event and audit. There is no
 * server-generated operation ID and no independently committed direct insert. */
export async function createNumberedDmsDocument(payload:object,contract:WorkspaceSaveContract):Promise<DmsCreationResult>{
 const parsed=dmsCreationContractSchema.safeParse(contract);
 if(!parsed.success)return {success:false,error:'Reopen this form before saving. Its creation request identity is missing.'};
 try{
  const client=await createClient();
  const {data,error}=await client.rpc('create_numbered_dms_document',{p_operation:parsed.data.operationId,p_data:payload});
  if(error){
   const code=error.code;
   // Completion-unknown is not rollback; malformed codes must not match a prefix.
   const rollback=typeof code==='string'&&code.length===5&&(/^(?:22|23|42|P0|PT)[0-9A-Z]{3}$/.test(code)||['40000','40001','40002','40P01'].includes(code));
   return {success:false,uncertain:!rollback,error:error.code==='42501'?'This document or its selected scope is unavailable, or you no longer have permission to create it.':error.code==='P0002'?'No active, effective document numbering rule is available.':rollback?'The save was rejected. Check the values; no document or number was committed.':'Save unconfirmed. Retry the original request to recover its result.'};
  }
  const receipt=dmsCreationRpcReceiptSchema.safeParse(data);
  if(!receipt.success||receipt.data.operation_id!==parsed.data.operationId)return {success:false,uncertain:true,error:'Save response incomplete. Retry the original request to recover its result.'};
  const {id,document_no,operation_id,replayed}=receipt.data;
  return {success:true,data:{id,document_no,operation_id,replayed}};
 }catch{return {success:false,uncertain:true,error:'Save unconfirmed. Retry the original request to recover its result.'};}
}
