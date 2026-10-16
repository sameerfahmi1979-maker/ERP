"use server";

/**
 * Server actions for Party Master admin lookup tables.
 * Phase ERP BASE 002F.5A.3
 * Tables: party_types, party_service_categories_master, party_relationship_types
 */

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasGlobalPermission } from "@/lib/rbac/check";
import { z } from "zod";
import type { ActionResult } from "@/features/master-data/parties/party-types";
import {partyTypeSchema,partyTypeUpdateSchema} from '@/lib/master-data/party-type-contract';
import {savePartyType} from '@/server/party-type-save';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import type {WorkspaceSaveResult} from '@/server/workspace-save';
import {workspaceValidationFailure} from '@/lib/workspace/field-errors';



// ─── Party Types ──────────────────────────────────────────────────────────────

export type PartyTypeAdminRow = {
  id: number;
  workspace_revision?: number;
  type_code: string;
  type_name: string;
  type_name_ar: string | null;
  description: string | null;
  icon_name: string | null;
  color_token: string | null;
  is_system: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export async function getPartyTypesAdmin(): Promise<ActionResult<PartyTypeAdminRow[]>> {
  try {
    const ctx=await getAuthContext();
    if(!hasGlobalPermission(ctx,'master_data.parties.view')&&!hasGlobalPermission(ctx,'master_data.parties.manage_types'))return {success:false,error:'You do not have permission to view the shared party-type administration catalogue.'};
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("party_types")
      .select("*")
      .order("sort_order")
      .order("type_name");
    if (error) return { success: false, error:'Party types could not be loaded. Retry before making changes.' };
    return { success: true, data: (data ?? []) as PartyTypeAdminRow[] };
  } catch {
    return { success: false, error:'Party types could not be loaded. Check your session and retry.' };
  }
}

export async function createPartyType(input:z.input<typeof partyTypeSchema>,contract?:WorkspaceSaveContract):Promise<WorkspaceSaveResult>{
 const parsed=partyTypeSchema.safeParse(input);
 return parsed.success?savePartyType(null,parsed.data,contract):workspaceValidationFailure(parsed.error.issues);
}

export async function updatePartyType(id:number,input:Partial<z.input<typeof partyTypeSchema>>,contract?:WorkspaceSaveContract):Promise<WorkspaceSaveResult>{
 const parsed=partyTypeUpdateSchema.safeParse(input);
 return parsed.success?savePartyType(id,parsed.data,contract):workspaceValidationFailure(parsed.error.issues);
}

/** Desired state, never a read-then-invert toggle that can undo a replay. */
export async function togglePartyTypeActive(id:number,isActive:boolean,contract?:WorkspaceSaveContract):Promise<WorkspaceSaveResult>{
 if(typeof isActive!=='boolean')return {success:false,error:'Choose an explicit active or inactive state.'};
 return savePartyType(id,{is_active:isActive},contract);
}

export async function getPartyTypeAdminById(id:number):Promise<ActionResult<PartyTypeAdminRow>>{
 try{
  const ctx=await getAuthContext();
  if(!hasGlobalPermission(ctx,'master_data.parties.manage_types'))return {success:false,error:'You do not have permission to manage party types.'};
  if(!Number.isSafeInteger(id)||id<1)return {success:false,error:'Party type not found.'};
  const client=await createClient(),{data,error}=await client.from('party_types').select('*').eq('id',id).maybeSingle();
  if(error)return {success:false,error:'The saved party type could not be loaded. Retry loading it before making another change.'};
  return data?{success:true,data:data as PartyTypeAdminRow}:{success:false,error:'Party type not found.'};
 }catch{return {success:false,error:'The saved party type could not be loaded. Check your session and retry.'};}
}

// Scoped party lookup reads elsewhere are unchanged; catalogue administration is global.
import {serviceCategorySchema,serviceCategoryUpdateSchema,relationshipTypeSchema,relationshipTypeUpdateSchema,partyAdminMasterPermission,type PartyAdminMasterEntity} from '@/lib/master-data/party-admin-master-contract';
import {savePartyAdminMaster} from '@/server/party-admin-master-save';
type CatalogueRow={id:number;workspace_revision?:number;description:string|null;is_system:boolean;is_active:boolean;sort_order:number;created_at:string;updated_at:string};
export type ServiceCategoryAdminRow=CatalogueRow&{category_code:string;category_name_en:string;category_name_ar:string|null;parent_category_id:number|null;parent_name?:string|null};
export type RelationshipTypeAdminRow=CatalogueRow&{relationship_code:string;name_en:string;name_ar:string|null};
const categoryFields='id,workspace_revision,category_code,category_name_en,category_name_ar,parent_category_id,description,is_system,is_active,sort_order,created_at,updated_at,parent:party_service_categories_master!parent_category_id(category_name_en)';
const relationshipFields='id,workspace_revision,relationship_code,name_en,name_ar,description,is_system,is_active,sort_order,created_at,updated_at';
async function readCatalogue(entity:PartyAdminMasterEntity,id?:number):Promise<ActionResult<unknown>>{
 try{
  const ctx=await getAuthContext();
  if(!hasGlobalPermission(ctx,'master_data.parties.view')&&!hasGlobalPermission(ctx,partyAdminMasterPermission[entity]))return {success:false,error:'You do not have permission to view this shared administration catalogue.'};
  if(id!==undefined&&(!Number.isSafeInteger(id)||id<1))return {success:false,error:'Catalogue record not found.'};
  const client=await createClient();
  const query=client.from(entity).select(entity==='party_service_categories_master'?categoryFields:relationshipFields);
  const {data,error}=id===undefined?await query.order('sort_order').order(entity==='party_service_categories_master'?'category_name_en':'name_en'):await query.eq('id',id).maybeSingle();
  if(error)return {success:false,error:'The catalogue could not be loaded. Retry before making changes.'};
  if(id!==undefined&&!data)return {success:false,error:'Catalogue record not found.'};
  const project=(value:unknown)=>{const row=value as ServiceCategoryAdminRow&{parent?:{category_name_en?:string}|null};const {parent,...fields}=row;return entity==='party_service_categories_master'?{...fields,parent_name:parent?.category_name_en??null}:fields;};
  return {success:true,data:id===undefined?((data as unknown[])??[]).map(project):project(data)};
 }catch{return {success:false,error:'The catalogue could not be loaded. Check your session and retry.'};}
}
export async function getServiceCategoriesAdmin():Promise<ActionResult<ServiceCategoryAdminRow[]>>{return await readCatalogue('party_service_categories_master') as ActionResult<ServiceCategoryAdminRow[]>;}
export async function getRelationshipTypesAdmin():Promise<ActionResult<RelationshipTypeAdminRow[]>>{return await readCatalogue('party_relationship_types') as ActionResult<RelationshipTypeAdminRow[]>;}
export async function getServiceCategoryAdminById(id:number):Promise<ActionResult<ServiceCategoryAdminRow>>{return await readCatalogue('party_service_categories_master',id) as ActionResult<ServiceCategoryAdminRow>;}
export async function getRelationshipTypeAdminById(id:number):Promise<ActionResult<RelationshipTypeAdminRow>>{return await readCatalogue('party_relationship_types',id) as ActionResult<RelationshipTypeAdminRow>;}
export async function createServiceCategory(input:z.input<typeof serviceCategorySchema>,contract?:WorkspaceSaveContract):Promise<WorkspaceSaveResult>{
 const parsed=serviceCategorySchema.safeParse(input);
 return parsed.success?savePartyAdminMaster('party_service_categories_master',null,parsed.data,contract):workspaceValidationFailure(parsed.error.issues);
}
export async function updateServiceCategory(id:number,input:Partial<z.input<typeof serviceCategorySchema>>,contract?:WorkspaceSaveContract):Promise<WorkspaceSaveResult>{
 const parsed=serviceCategoryUpdateSchema.safeParse(input);
 return parsed.success?savePartyAdminMaster('party_service_categories_master',id,parsed.data,contract):workspaceValidationFailure(parsed.error.issues);
}
export async function createRelationshipType(input:z.input<typeof relationshipTypeSchema>,contract?:WorkspaceSaveContract):Promise<WorkspaceSaveResult>{
 const parsed=relationshipTypeSchema.safeParse(input);
 return parsed.success?savePartyAdminMaster('party_relationship_types',null,parsed.data,contract):workspaceValidationFailure(parsed.error.issues);
}
export async function updateRelationshipType(id:number,input:Partial<z.input<typeof relationshipTypeSchema>>,contract?:WorkspaceSaveContract):Promise<WorkspaceSaveResult>{
 const parsed=relationshipTypeUpdateSchema.safeParse(input);
 return parsed.success?savePartyAdminMaster('party_relationship_types',id,parsed.data,contract):workspaceValidationFailure(parsed.error.issues);
}
