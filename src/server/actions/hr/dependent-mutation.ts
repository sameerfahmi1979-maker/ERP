'use server';
import {getAuthContext,hasPermission} from '@/lib/rbac/check';
import {dependentMutationSchema,dependentSchema,dependentSaveContract} from '@/lib/hr/dependent-contract';
import {saveDependentRecord,type DependentSaveResult} from '@/server/dependent-save';
import {revalidatePath} from 'next/cache';
import {isHrAiFeatureEnabled} from '@/lib/hr/ai/feature-flags';
import {createClient} from '@/lib/supabase/server';
import {z} from 'zod';
export async function reconcileDependentMutation(operationId:string):Promise<DependentSaveResult>{
 if(!z.string().uuid().safeParse(operationId).success)return {success:false,error:'Invalid recovery identity.'};
 try{
  const client=await createClient(),result=await client.rpc('f11_reconcile_dependent',{p_operation:operationId});
  if(result.error||!result.data)return {success:false,uncertain:true,error:'No currently authorized committed result is available. The earlier request remains unresolved; do not create a replacement.'};
  const receipt=z.object({id:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),employee_id:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),operation_id:z.literal(operationId),revision:z.string().regex(/^[1-9]\d*$/),replayed:z.literal(true)}).safeParse(result.data);
  return receipt.success?{success:true,data:receipt.data}:{success:false,uncertain:true,error:'Recovery response incomplete. Keep the recovery identity for review.'};
 }catch{return {success:false,uncertain:true,error:'Recovery unavailable. The original request has not been replayed.'};}
}
export async function mutateEmployeeDependent(raw:unknown,rawContract:unknown):Promise<DependentSaveResult>{
 const ctx=await getAuthContext();if(!hasPermission(ctx,'hr.compliance.manage')&&!hasPermission(ctx,'hr.admin'))return {success:false,error:'Permission denied'};
 const request=dependentMutationSchema.safeParse(raw),contract=dependentSaveContract.safeParse(rawContract);
 if(!request.success||!contract.success)return {success:false,error:'Dependent save identity or revision is missing.'};
 const r=request.data,c=contract.data;
 if(r.entry==='document'){
  const isAdmin=ctx.roleCodes?.some(code=>code==='system_admin'||code==='group_admin');
  if(!isAdmin&&(!hasPermission(ctx,'dms.documents.view')&&!hasPermission(ctx,'dms.admin')||!await isHrAiFeatureEnabled('ERP_AI_HR_DOCUMENT_TO_RECORD')))return {success:false,error:'Document-to-Record access is not available.'};
 }
 if(r.revision!==c.revision||JSON.stringify(r.addDocumentIds)!==JSON.stringify(c.addDocumentIds)||JSON.stringify(r.removeDocumentIds)!==JSON.stringify(c.removeDocumentIds))return {success:false,error:'Retained dependent request does not match its save contract.'};
 if(r.kind==='archive'&&(Object.keys(r.values).length||r.addDocumentIds.length||r.removeDocumentIds.length))return {success:false,error:'Archive cannot change dependent fields or evidence.'};
 const fields=(r.id===null?dependentSchema:dependentSchema.partial()).safeParse(r.values);
 if(r.kind!=='archive'&&!fields.success)return {success:false,error:fields.error.issues[0]?.message??'Invalid dependent fields'};
 const result=await saveDependentRecord(r.employeeId,r.id,r.kind,r.kind==='archive'?{}:fields.success?fields.data:{},c);
 if(result.success){try{revalidatePath(`/admin/hr/employees/record/${r.employeeId}`);}catch{/* The committed result remains authoritative. */}}
 return result;
}
