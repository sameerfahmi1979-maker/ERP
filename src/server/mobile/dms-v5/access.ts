import "server-only";
import {AsyncLocalStorage} from "node:async_hooks";

import {getDmsAiProvider} from "@/lib/dms/ai/factory";
import {z} from "zod";
import {createClient} from "@/lib/supabase/server";
import {canUseApplication,getAuthContext,type AuthContext} from "@/lib/rbac/check";
import {hrReadIdentity} from "@/lib/reads/hr-read-identity";
import {source,type Source} from "./contracts";

// Request-local: only a successful transactional write marks later delivery errors ambiguous.
const effects=new AsyncLocalStorage<{committed:boolean}>();
export function withMutationEffect<T>(run:()=>Promise<T>){return effects.run({committed:false},run);}
export function mutationCommitted(){return effects.getStore()?.committed===true;}

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
type RpcName="mobile_dms_receipt"|"mobile_dms_source"|"mobile_dms_comment"|"mobile_dms_document"|"mobile_dms_checklist"|"mobile_dms_requests"|"mobile_dms_renewal_request"|"mobile_dms_operation"|"mobile_dms_shares"|"mobile_dms_collections"|"mobile_dms_question_context"|"mobile_dms_progress"|"mobile_dms_request_evidence"|"mobile_dms_search_sources";
export async function rpc<T>(name:RpcName,args:Record<string,unknown>,schema:z.ZodType<T>,mutation=false,signal?:AbortSignal):Promise<T> {
 signal?.throwIfAborted();
 const db=await createClient();signal?.throwIfAborted();
 const query=db.rpc(name,args),r=await (signal?query.abortSignal(signal):query);
 signal?.throwIfAborted();
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
 const active=effects.getStore();if(mutation&&active)active.committed=true;
 const parsed=schema.safeParse(r.data);
 if(!parsed.success)throw new DmsError(503,"invalid_receipt","The result could not be verified.",mutation);
 return parsed.data;
}
type Selection={documentId:number;versionId?:number;fileId?:number;sourceHash?:string;historical?:boolean};
export type Capability="dms.documents.view"|"dms.documents.preview"|"dms.documents.download"|"dms.documents.edit"|"dms.documents.manage_tags"|"dms.documents.review_ai"|"dms.documents.share_external"|"dms.renewals.manage"|"dms.admin";
export async function verifySession(ctx:AuthContext,requireSameScope=false) {
 const current=await getAuthContext();
 if(!canUseApplication(current)||!current.profile||!ctx.profile||current.profile.id!==ctx.profile.id||current.profile.auth_user_id!==ctx.profile.auth_user_id)denied();
 if(requireSameScope&&hrReadIdentity(current)!==hrReadIdentity(ctx))denied();
}
export async function admitMobileDmsSource(ctx:AuthContext,selection:Selection,capabilities:Capability[]=["dms.documents.view"],signal?:AbortSignal){
 if(!canUseApplication(ctx))denied();
 const binding=await rpc("mobile_dms_source",{p_data:selection,p_caps:capabilities},source,false,signal);
 if(binding.documentId!==selection.documentId||selection.versionId!==undefined&&binding.documentVersionId!==selection.versionId||binding.fileId!==(selection.fileId??null)||selection.sourceHash!==undefined&&selection.sourceHash!==binding.sourceHash)conflict();
 return binding;
}
export async function verifyMobileDmsDelivery(ctx:AuthContext,binding:Source,capabilities:Capability[]=["dms.documents.view"],historical=false){
 await verifySession(ctx);
 await recheckMobileDmsSource(ctx,binding,capabilities,historical);
}

// A pack checks actor identity at its phase boundaries. The source RPC still
// verifies the current session, exact scope and binding independently every time.
export async function recheckMobileDmsSource(ctx:AuthContext,binding:Source,capabilities:Capability[],historical=false,signal?:AbortSignal){
 await admitMobileDmsSource(ctx,{documentId:binding.documentId,versionId:binding.documentVersionId,...(binding.fileId!==null?{fileId:binding.fileId}:{}),sourceHash:binding.sourceHash,historical},capabilities,signal);
}

export async function verifyEmployeeDocument(employeeId:number,documentId:number){
 return rpc("mobile_dms_document",{p_action:"employee_link",p_data:{employeeId,documentId}},z.literal(true));
}
