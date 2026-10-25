import 'server-only';
import {z} from 'zod';import {createClient} from '@/lib/supabase/server';
import {dependentSaveContract,type DependentSaveReceipt} from '@/lib/hr/dependent-contract';
import {employeeId,isDefiniteEmployeeRejection} from '@/lib/hr/employee-contract';
export type DependentSaveResult={success:boolean;data?:DependentSaveReceipt;error?:string;uncertain?:boolean;retired?:true};
export async function saveDependentRecord(employee:number,id:number|null,kind:'save'|'archive',payload:object,rawContract:unknown):Promise<DependentSaveResult>{
 const contract=dependentSaveContract.safeParse(rawContract);
 if(!employeeId.safeParse(employee).success||!contract.success||(id===null?contract.data.revision!==null:!employeeId.safeParse(id).success||contract.data.revision===null))return {success:false,error:'Reopen the dependent before saving. Its operation identity or revision is missing.'};
 const c=contract.data;
 const photo=payload as {photo_framing?:import('@/lib/hr/photo-framing').PhotoFraming|null;photo_dms_document_id?:number|null};
 if(photo.photo_framing){try{if(id===null)throw Error('Save the person first');const {validateSavedPhotoFraming}=await import('@/server/hr-photo-source');await validateSavedPhotoFraming(employee,id,photo.photo_dms_document_id,photo.photo_framing);}catch{return {success:false,error:'Photo source could not be verified. Reopen its current framing before saving.'};}}
 try{
  const client=await createClient();const result=await client.rpc('f11_save_dependent',{p_operation:c.operationId,p_employee:employee,p_id:id,p_revision:c.revision,p_kind:kind,p_data:payload,p_add:c.addDocumentIds,p_remove:c.removeDocumentIds});
  if(result.error){const code=result.error.code;return {success:false,uncertain:!isDefiniteEmployeeRejection(code),error:code==='P0409'?'This dependent changed after opening. Your entries are retained; reopen and compare before saving.':code==='42501'?'Dependent or evidence access is unavailable. Nothing was partly saved.':isDefiniteEmployeeRejection(code)?'The dependent save was rejected. Check the fields and evidence selections.':'Dependent save unconfirmed. Retry the unchanged request to reconcile safely.'};}
  const receipt=z.object({id:employeeId,employee_id:z.literal(employee),operation_id:z.literal(c.operationId),revision:z.string().regex(/^[1-9]\d*$/),replayed:z.boolean()}).safeParse(result.data);
  if(!receipt.success||(id!==null&&receipt.data.id!==id))return {success:false,uncertain:true,error:'Dependent response incomplete. Retry the unchanged request to reconcile safely.'};
  return {success:true,data:receipt.data};
 }catch{return {success:false,uncertain:true,error:'Dependent save unconfirmed. Retry the unchanged request to reconcile safely.'};}
}
