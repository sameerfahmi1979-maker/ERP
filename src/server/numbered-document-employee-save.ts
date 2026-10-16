import 'server-only';
import {createClient} from '@/lib/supabase/server';
import {documentEmployeeReceiptSchema,type DocumentEmployeeContract,type DocumentEmployeeInput,type DocumentEmployeeResult} from '@/lib/hr/numbered-document-employee-contract';

export async function saveNumberedDocumentEmployee(payload:DocumentEmployeeInput,contract:DocumentEmployeeContract):Promise<DocumentEmployeeResult>{
 try{
  const client=await createClient();
  const {data,error}=await client.rpc('create_numbered_document_employee',{p_operation:contract.operationId,p_sources:contract.reviewedSources,p_data:payload});
  if(error){
   const code=error.code;
   // Completion-unknown is not rollback; malformed codes must not match a prefix.
   const rollback=typeof code==='string'&&code.length===5&&(/^(?:22|23|42|P0|PT)[0-9A-Z]{3}$/.test(code)||['40000','40001','40002','40P01'].includes(code));
   return {success:false,uncertain:!rollback,error:error.code==='42501'?'Source, employee, compliance, or numbering access is unavailable.':error.code==='P0409'?'A reviewed document or extraction changed. Prepare and review the documents again.':error.code==='PT409'?'The request or identity document conflicts with an existing result. Review before starting another operation.':rollback?'The request was rejected. No part of this attempt was saved. Check every included record.':'Save unconfirmed. Retry the retained original request.'};
  }
  const receipt=documentEmployeeReceiptSchema.safeParse(data);
  if(!receipt.success||receipt.data.operationId!==contract.operationId||JSON.stringify([...receipt.data.sourceDocumentIds].sort((a,b)=>a-b))!==JSON.stringify([...payload.selectedDocumentIds].sort((a,b)=>a-b))
   ||JSON.stringify(receipt.data.childRecords.map(child=>`${child.kind}:${child.sourceDocumentId}`).sort())!==JSON.stringify((payload.complianceRecords??[]).map(child=>`${child.kind}:${child.sourceDocumentId}`).sort()))return {success:false,uncertain:true,error:'Save response incomplete. Retry the retained original request.'};
  return {success:true,data:receipt.data};
 }catch{return {success:false,uncertain:true,error:'Save unconfirmed. Retry the retained original request.'};}
}
