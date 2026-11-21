import "server-only";
import {getDmsAiProvider} from "@/lib/dms/ai/factory";
import {z} from "zod";
import {createClient} from "@/lib/supabase/server";
import {canUseApplication,getAuthContext,type AuthContext} from "@/lib/rbac/check";
import {source,type Source} from "./contracts";

export class DmsError extends Error {
 constructor(readonly status:number,readonly code:string,message:string,readonly uncertain=false){super(message);}
}
export function unavailable():never {throw new DmsError(503,"source_unavailable","The current source could not be verified.");}
export function denied():never {throw new DmsError(403,"permission_denied","Current access is required.");}
export function conflict():never {throw new DmsError(409,"source_changed","The source changed. Refresh it before continuing.");}
export function invalid():never {throw new DmsError(400,"invalid_request","Invalid Mobile DMS request.");}
export const privateHeaders={"Cache-Control":"private, no-store","Vary":"Authorization","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
export async function readDmsFeatureAvailability() {
 const unavailable = {questions:false,naturalSearch:false,batch:false};
 try {
  const db=await createClient();
  const result=await db.from("erp_ai_feature_flags").select("feature_code,is_enabled")
   .in("feature_code",["DMS_DOCUMENT_QA","DMS_AI_SEARCH","DMS_CROSS_DOC_SEARCH","DMS_BATCH_INTAKE"]);
  if(result.error||!result.data)return unavailable;
  const flags=new Set(result.data.filter(row=>row.is_enabled).map(row=>row.feature_code));
  const ask=flags.has("DMS_DOCUMENT_QA"),search=flags.has("DMS_CROSS_DOC_SEARCH")&&flags.has("DMS_AI_SEARCH");
  let configured=false;
  if(ask||search){try{configured=(await getDmsAiProvider()).provider.isConfigured();}catch{configured=false;}}
  return {questions:ask&&configured,naturalSearch:search&&configured,batch:flags.has("DMS_BATCH_INTAKE")};
 }catch{return unavailable;}
}
type RpcName="mobile_dms_source"|"mobile_dms_comment"|"mobile_dms_document"|"mobile_dms_checklist"|"mobile_dms_requests"|"mobile_dms_renewal_request"|"mobile_dms_operation"|"mobile_dms_shares"|"mobile_dms_collections"|"mobile_dms_question_context"|"mobile_dms_progress";
export async function rpc<T>(name:RpcName,args:Record<string,unknown>,schema:z.ZodType<T>,mutation=false):Promise<T> {
 const db=await createClient();const r=await db.rpc(name,args);
 if(r.error){
  switch(r.error.code){
   case "PT404":throw new DmsError(404,"unavailable","The record is unavailable.");
   case "42501":denied();
   case "PT409":case "23505":case "40001":conflict();
   case "22023":case "22P02":case "22003":case "22007":invalid();
   case "54000":throw new DmsError(413,"size_limit","The selection exceeds the supported limit.");
   case "55000":throw new DmsError(409,"reconciliation_required","The original operation requires reconciliation.",true);
   default:throw new DmsError(503,"operation_unavailable","The result could not be verified.",mutation);
  }
 }
 const parsed=schema.safeParse(r.data);
 if(!parsed.success)throw new DmsError(503,"invalid_receipt","The result could not be verified.",mutation);
 return parsed.data;
}
type Selection={documentId:number;versionId?:number;fileId?:number;sourceHash?:string;historical?:boolean};
export type Capability="dms.documents.view"|"dms.documents.preview"|"dms.documents.download"|"dms.documents.edit"|"dms.documents.manage_tags"|"dms.documents.review_ai"|"dms.documents.share_external"|"dms.renewals.manage"|"dms.admin";
export async function verifySession(ctx:AuthContext) {
 const current=await getAuthContext();
 if(!canUseApplication(current)||!current.profile||!ctx.profile||current.profile.id!==ctx.profile.id||current.profile.auth_user_id!==ctx.profile.auth_user_id)denied();
}
export async function admitMobileDmsSource(ctx:AuthContext,selection:Selection,capabilities:Capability[]=["dms.documents.view"]){
 if(!canUseApplication(ctx))denied();
 const binding=await rpc("mobile_dms_source",{p_data:selection,p_caps:capabilities},source);
 if(binding.documentId!==selection.documentId||selection.versionId!==undefined&&binding.documentVersionId!==selection.versionId||binding.fileId!==(selection.fileId??null)||selection.sourceHash!==undefined&&selection.sourceHash!==binding.sourceHash)conflict();
 return binding;
}
export async function verifyMobileDmsDelivery(ctx:AuthContext,binding:Source,capabilities:Capability[]=["dms.documents.view"],historical=false){
 await verifySession(ctx);
 await admitMobileDmsSource(ctx,{documentId:binding.documentId,versionId:binding.documentVersionId,...(binding.fileId!==null?{fileId:binding.fileId}:{}),sourceHash:binding.sourceHash,historical},capabilities);
}
