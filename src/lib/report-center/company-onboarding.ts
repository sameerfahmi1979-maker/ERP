/**
 * Governed company branding setup. Existing template content and issued
 * documents are not redesigned here; F08 retains report-engine ownership.
 */
import "server-only";
import {randomUUID} from "node:crypto";
import {z} from "zod";
import {createClient} from "@/lib/supabase/server";
import {getAuthContext,hasGlobalPermission} from "@/lib/rbac/check";
import {brandingPermission} from "@/lib/branding/asset-permissions";

const resultSchema=z.object({
 brandingProfileId:z.number().int().positive().nullable(),
 reportTemplateId:z.number().int().positive().nullable(),
 letterTemplateId:z.number().int().positive().nullable(),
 wasAlreadyPresent:z.boolean(),changed:z.boolean(),replayed:z.boolean(),
});
type OnboardingResult={
 success:boolean;brandingProfileId?:number;reportTemplateId?:number;letterTemplateId?:number;
 wasAlreadyPresent:boolean;changed?:boolean;uncertain?:boolean;error?:string;
};
async function initialize(ownerCompanyId:number,mode:"ensure"|"sync",operationId:string){
 if(!Number.isSafeInteger(ownerCompanyId)||ownerCompanyId<1||!z.string().uuid().safeParse(operationId).success)
  return {success:false as const,error:"Invalid company branding request.",uncertain:false};
 try{
  const ctx=await getAuthContext();
  if(!brandingPermission(ctx,"organizations.manage",ownerCompanyId)||!brandingPermission(ctx,"reports.manage",ownerCompanyId))
   return {success:false as const,error:"Company and report-branding management permissions are required for this company.",uncertain:false};
  const db=await createClient();
  const r=await db.rpc("initialize_company_branding",{p_company:ownerCompanyId,p_mode:mode,p_operation:operationId});
  if(r.error){
   const uncertain=!/^(22|23|42|P0|PT|40)/.test(r.error.code??"");
   return {success:false as const,uncertain,error:r.error.code==="42501"?"This company is unavailable or no longer authorized."
    :r.error.code==="PT409"?"Existing company branding or templates require review; nothing was overwritten."
    :uncertain?"Branding setup is unconfirmed. Retry the same operation.":"Branding setup was rejected. Existing configuration and history are unchanged."};
  }
  const parsed=resultSchema.safeParse(r.data);
  if(!parsed.success)return {success:false as const,uncertain:true,error:"Branding setup response is incomplete. Retry the same operation."};
  return {success:true as const,data:parsed.data};
 }catch{return {success:false as const,uncertain:true,error:"Branding setup is unconfirmed. Retry the same operation."};}
}
export async function ensureReportBrandingForOwnerCompany(ownerCompanyId:number,operationId:string=randomUUID()):Promise<OnboardingResult>{
 const r=await initialize(ownerCompanyId,"ensure",operationId);
 if(!r.success)return {...r,wasAlreadyPresent:false};
 if(!r.data.brandingProfileId)return {success:false,wasAlreadyPresent:false,uncertain:true,error:"Branding setup response is incomplete."};
 return {success:true,brandingProfileId:r.data.brandingProfileId,reportTemplateId:r.data.reportTemplateId??undefined,
  letterTemplateId:r.data.letterTemplateId??undefined,wasAlreadyPresent:r.data.wasAlreadyPresent,changed:r.data.changed};
}
export async function syncReportBrandingProfileFromOrganization(ownerCompanyId:number,operationId:string=randomUUID()):Promise<{success:boolean;synced:boolean;uncertain?:boolean;error?:string}>{
 const r=await initialize(ownerCompanyId,"sync",operationId);
 return r.success?{success:true,synced:r.data.changed}:{...r,synced:false};
}
export async function ensureReportBrandingForAllOwnerCompanies():Promise<{success:boolean;total:number;created:number;skipped:number;errors:string[]}>{
 const fail=(message:string)=>({success:false,total:0,created:0,skipped:0,errors:[message]});
 try{
  const ctx=await getAuthContext();
  if(!hasGlobalPermission(ctx,"organizations.manage")||!hasGlobalPermission(ctx,"reports.manage"))return fail("Global company and branding management permissions are required.");
  const db=await createClient();
  // Fixed bounded pages of the authorized minimal projection, not a new cache.
  // Every company transaction rechecks authority; bulk setup is per-company
  // atomic and reports partial failures without claiming whole-batch rollback.
  const companies:number[]=[];
  for(let from=0;;from+=200){
   const r=await db.from("erp_branding_company_choices").select("id").order("id").range(from,from+199);
   if(r.error||!r.data)return fail("The active company catalogue could not be loaded.");
   companies.push(...r.data.map(c=>c.id));if(r.data.length<200)break;
  }
  let created=0,skipped=0;const errors:string[]=[];
  for(const id of companies){
   const r=await ensureReportBrandingForOwnerCompany(id);
   if(!r.success)errors.push(`Company ${id}: ${r.error}`);
   else if(r.wasAlreadyPresent)skipped++;else created++;
  }
  return {success:errors.length===0,total:companies.length,created,skipped,errors};
 }catch{return fail("Company branding setup could not be completed. Reconcile saved companies before retrying.");}
}
