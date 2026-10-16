"use server";

import {createClient} from '@/lib/supabase/server';
import {getAuthContext,hasGlobalPermission} from '@/lib/rbac/check';
import {revalidatePath} from 'next/cache';
import {authorizePartyChildRead} from '@/server/party-child-read-authority';
import type {ActionResult} from '@/features/master-data/parties/party-types';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import {addServiceAssignmentSchema,addServiceAssignmentContract,removeServiceAssignmentContract,serviceAssignmentId,serviceAssignmentReceipt,type AddServiceAssignmentInput,type RemoveServiceAssignmentContract,type ServiceAssignmentReceipt,type ServiceAssignmentRequest} from '@/lib/master-data/party-service-assignment-contract';

export type PartyServiceCategoryAssignment={id:number;party_id:number;service_category_id:number;workspace_revision:number;is_primary:boolean;is_active:boolean;remarks:string|null;created_at:string;updated_at:string;category_code?:string;category_name_en?:string};
export async function getPartyServiceCategoryAssignments(partyId:number):Promise<ActionResult<PartyServiceCategoryAssignment[]>>{
 try{
  const admitted=await authorizePartyChildRead(partyId);
  if(!admitted.success)return {success:false,error:admitted.error};
  const {data,error}=await admitted.client.from('party_service_category_assignments')
   .select('id,party_id,service_category_id,workspace_revision,is_primary,is_active,remarks,created_at,updated_at,party_service_categories_master!service_category_id(category_code,category_name_en)')
   .eq('party_id',partyId).eq('is_active',true).order('is_primary',{ascending:false}).order('id');
  if(error)return {success:false,error:'Service assignments could not be loaded. Try again.'};
  const rows=(data??[]).map((row:Record<string,unknown>)=>{
   const category=row.party_service_categories_master as {category_code?:string;category_name_en?:string}|null;
   const {party_service_categories_master:joined,...fields}=row;void joined;
   return {...fields,category_code:category?.category_code,category_name_en:category?.category_name_en} as PartyServiceCategoryAssignment;
  });
  return {success:true,data:rows};
 }catch{return {success:false,error:'Service assignments could not be loaded. Try again.'};}
}
export async function getServiceCategoriesForSelect():Promise<ActionResult<{id:number;category_code:string;category_name_en:string;parent_category_id:number|null}[]>>{
 try{
  if(!hasGlobalPermission(await getAuthContext(),'master_data.parties.view'))return {success:false,error:'You do not have permission to view shared party categories.'};
  const client=await createClient();
  const {data,error}=await client.from('party_service_categories_master').select('id,category_code,category_name_en,parent_category_id').eq('is_active',true).order('sort_order').order('category_name_en');
  return error?{success:false,error:'Service categories could not be loaded. Try again.'}:{success:true,data:data??[]};
 }catch{return {success:false,error:'Service categories could not be loaded. Try again.'};}
}
async function save(request:ServiceAssignmentRequest,operationId:string):Promise<ActionResult<ServiceAssignmentReceipt>>{
 let dispatched=false;
 try{
  const ctx=await getAuthContext();
  if(!hasGlobalPermission(ctx,'master_data.parties.manage_services')||!hasGlobalPermission(ctx,'master_data.parties.view'))return {success:false,error:'You do not have permission to view and manage shared party services.'};
  const client=await createClient();dispatched=true;
  const {data,error}=await client.rpc('save_party_service_assignment',{p_operation:operationId,p_action:request.action,p_party:request.partyId,p_id:request.id,p_revision:request.revision,p_data:request.fields});
  if(error){
   const rollback=(typeof error.code==='string'&&error.code.length===5&&(/^(?:22|23|42|P0|PT)[0-9A-Z]{3}$/.test(error.code)||['40000','40001','40002','40P01','55P03','57014'].includes(error.code)));
   return {success:false,uncertain:!rollback,error:error.code==='PT409'||error.code==='40001'?'The assignment changed. Reload the saved assignments and review them before retrying.':
    error.code==='PT404'?'This assignment is unavailable. Reload the saved assignments.':
    error.code==='42501'?'The party is unavailable or your service permission changed.':
    error.code==='23505'?'This category is already assigned with different details, or another primary category is active. Remove the relevant assignment first.':
    error.code==='23503'?'Choose an active category and an active available party before adding a service.':
    rollback?'The service change was rejected. Check the assignment fields.':'Save unconfirmed. Retry the same unchanged request to recover its result.'};
  }
  const receipt=serviceAssignmentReceipt.safeParse(data);
  if(!receipt.success||receipt.data.party_id!==request.partyId||(request.id!==null&&receipt.data.id!==request.id)||(request.action==='add'&&(receipt.data.service_category_id!==request.fields.service_category_id||!receipt.data.is_active))||(request.action==='remove'&&receipt.data.is_active))return {success:false,uncertain:true,error:'Save response incomplete. Retry the same unchanged request.'};
  try{revalidatePath('/admin/master-data/parties');}catch{/* A receipt already confirms the database commit. */}
  return {success:true,data:receipt.data};
 }catch{return {success:false,uncertain:dispatched,error:dispatched?'Save unconfirmed. Retry the same unchanged request.':'The service change could not start. Check your session and try again.'};}
}
export async function addPartyServiceCategory(input:AddServiceAssignmentInput,contract?:WorkspaceSaveContract):Promise<ActionResult<ServiceAssignmentReceipt>>{
 const values=addServiceAssignmentSchema.safeParse(input),attempt=addServiceAssignmentContract.safeParse(contract);
 if(!values.success||!attempt.success)return {success:false,error:'Check the service fields and reopen the assignment dialog if its save identity is unavailable.'};
 const {party_id,...fields}=values.data;
 return save({action:'add',partyId:party_id,id:null,revision:null,fields},attempt.data.operationId);
}
export async function removePartyServiceCategory(id:number,contract?:RemoveServiceAssignmentContract):Promise<ActionResult<ServiceAssignmentReceipt>>{
 const identity=serviceAssignmentId.safeParse(id),attempt=removeServiceAssignmentContract.safeParse(contract);
 if(!identity.success||!attempt.success)return {success:false,error:'Reload this assignment before removing it. Its identity or revision is unavailable.'};
 return save({action:'remove',partyId:attempt.data.partyId,id:identity.data,revision:attempt.data.revision,fields:{}},attempt.data.operationId);
}
