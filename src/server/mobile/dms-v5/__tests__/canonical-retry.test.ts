import {beforeEach,expect,it,vi} from "vitest";
import {getDmsOrchestrationStatus,retryDmsOrchestrationStep} from "@/server/actions/dms/orchestration";
import {withMobileStepReceipt,retryProviderEffect} from "../orchestration-receipt";
const f=vi.hoisted(()=>({text:"",summary:"",embed:vi.fn(),steps:[] as Array<{step:string;status:string;safeErrorMessage?:string}>,paid:vi.fn(),write:vi.fn()}));
vi.mock("@/lib/rbac/check",()=>({getAuthContext:async()=>({profile:{id:7},roleCodes:[]}),hasPermission:()=>true}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@/server/actions/audit",()=>({logAudit:vi.fn()}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({rpc:f.write})}));
vi.mock("@/lib/dms/ai/factory",()=>({getDmsAiProvider:async()=>({provider:{isConfigured:()=>true,summarize:f.paid},configId:null}),getDmsEmbeddingProvider:async()=>({provider:{isConfigured:()=>true,embedText:f.embed},modelId:"offline-model",configId:null})}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({from:(table:string)=>{
 const rows:Record<string,unknown>={erp_ai_feature_flags:{is_enabled:true},dms_upload_sessions:{id:22,uploaded_by:7,document_id:10,session_code:"fixture",orchestration_steps_json:f.steps},dms_documents:{id:10,document_no:"T10",title:"Synthetic",confidentiality_level:"internal",ai_summary:f.summary,ai_summary_status:f.summary?"complete":"pending",summary_embedding_status:"pending"},dms_document_content:{content_text:f.text}};
 const query={select:()=>query,eq:()=>query,is:()=>query,maybeSingle:async()=>({data:rows[table],error:null}),single:async()=>({data:rows[table],error:null}),update:()=>query,insert:async()=>({error:null})};
 return query;
}})}));
beforeEach(()=>{vi.resetAllMocks();f.summary="";f.steps=[{step:"ai_summary",status:"failed"}];f.write.mockImplementation(async(name,args)=>{
 if(name==="dms_question_publish")return {data:false,error:null};
 if(name==="mobile_dms_web_retry")return args.p_result?.providerEffect==="started"?{error:{code:"55000"}}:{data:true,error:null};
 throw new Error("Unexpected write");
});f.paid.mockRejectedValue(Error("response unavailable"));});
it.each(["web","native"] as const)("runs the real %s retry and summary preflight and preserves uncertainty once the model starts",async client=>{
 const evidence: string[]=[];
 const run=()=>retryDmsOrchestrationStep({sessionCode:"fixture",stepCode:"ai_summary"});
 const call=()=>client==="web"?run():withMobileStepReceipt("fixture","ai_summary",async()=>{
  const effect=retryProviderEffect();evidence.push(effect);if(effect==="started")throw Error("Unconfirmed");
 },run);
 f.text="  ";const first=await call();expect(first.success).toBe(true);expect(f.paid).not.toHaveBeenCalled();
 f.text="Verified synthetic text";const second=await call();expect(second.success).toBe(false);expect(f.paid).toHaveBeenCalledOnce();
 const seen=client==="web"?f.write.mock.calls.filter(([name,args])=>name==="mobile_dms_web_retry"&&args.p_result).map(([,args])=>args.p_result.providerEffect):evidence;
 expect(seen).toEqual(["never_started","started"]);
});

it.each([{steps:[]},{steps:[{step:"content_sync",status:"skipped"}]},{steps:[{step:"ai_summary",status:"running"}]},{steps:[{step:"ai_summary",status:"failed"},{step:"ai_summary",status:"failed"}]}])("rejects a web target that is absent, busy or ambiguous before reservation",async({steps})=>{
 f.steps=steps;
 const before=structuredClone(f.steps);f.text="Available fixture";
 const result=await retryDmsOrchestrationStep({sessionCode:"fixture",stepCode:"ai_summary"});
 expect(result.success).toBe(false);expect(f.write).not.toHaveBeenCalled();expect(f.paid).not.toHaveBeenCalled();expect(f.steps).toEqual(before);
});
it("retries a skipped step present in a partial web session and reloads the persisted diagnostic",async()=>{
 f.steps=[{step:"ai_summary",status:"skipped"}];f.text="";
 f.write.mockImplementation(async(name,args)=>{
  expect(name).toBe("mobile_dms_web_retry");
  if(args.p_result)f.steps=[{step:"ai_summary",status:args.p_result.status,safeErrorMessage:"Step failed. You can retry it manually."}];
  return {data:true,error:null};
 });
 expect((await retryDmsOrchestrationStep({sessionCode:"fixture",stepCode:"ai_summary"})).success).toBe(true);
 expect((await getDmsOrchestrationStatus({sessionCode:"fixture"})).data?.steps).toEqual([{step:"ai_summary",status:"failed",safeErrorMessage:"Step failed. You can retry it manually."}]);
});
it("publishes an executed content-sync skip from the actual canonical action",async()=>{
 f.steps=[{step:"content_sync",status:"failed"}];f.text="Previously synced";
 const save=vi.fn();
 const outcome=await withMobileStepReceipt("fixture","content_sync",save,()=>retryDmsOrchestrationStep({sessionCode:"fixture",stepCode:"content_sync"}));
 expect(outcome.data).toMatchObject({step:"content_sync",status:"skipped"});
 expect(save.mock.calls[0][0].safeErrorMessage).toBe("Content already synced.");expect(f.paid).not.toHaveBeenCalled();
});

it.each(["summary","extracted"])("completes the canonical embedding retry using the eligible %s source",async source=>{
 f.steps=[{step:"embedding",status:"failed"}];f.summary=source==="summary"?" Verified summary ":"";f.text=" Verified content ";
 f.embed.mockResolvedValue({embedding:[0.125,0.375],model:"offline-model"});
 const save=vi.fn();
 const result=await withMobileStepReceipt("fixture","embedding",save,()=>retryDmsOrchestrationStep({sessionCode:"fixture",stepCode:"embedding"}));
 expect(result.data?.status).toBe("completed");expect(f.embed).toHaveBeenCalledOnce();expect(f.embed.mock.calls[0][0]).toBe(source==="summary"?"Verified summary":"Verified content");
 expect(save.mock.calls[0][0]).toMatchObject({step:"embedding",status:"completed"});
});
