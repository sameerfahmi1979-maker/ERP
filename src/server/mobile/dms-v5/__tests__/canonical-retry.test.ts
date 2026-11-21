import {beforeEach,expect,it,vi} from "vitest";
import {retryDmsOrchestrationStep} from "@/server/actions/dms/orchestration";
import {withMobileStepReceipt,retryProviderEffect} from "../orchestration-receipt";
const f=vi.hoisted(()=>({text:"",paid:vi.fn(),write:vi.fn()}));
vi.mock("@/lib/rbac/check",()=>({getAuthContext:async()=>({profile:{id:7},roleCodes:[]}),hasPermission:()=>true}));
vi.mock("@/server/actions/audit",()=>({logAudit:vi.fn()}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({rpc:f.write})}));
vi.mock("@/lib/dms/ai/factory",()=>({getDmsAiProvider:async()=>({provider:{isConfigured:()=>true,summarize:f.paid},configId:null})}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({from:(table:string)=>{
 const rows:Record<string,unknown>={erp_ai_feature_flags:{is_enabled:true},dms_upload_sessions:{id:22,uploaded_by:7,document_id:10,orchestration_steps_json:[{step:"ai_summary",status:"failed"}]},dms_documents:{id:10,document_no:"T10",title:"Synthetic",confidentiality_level:"internal"},dms_document_content:{content_text:f.text}};
 const query={select:()=>query,eq:()=>query,is:()=>query,single:async()=>({data:rows[table],error:null}),update:()=>query,insert:async()=>({error:null})};
 return query;
}})}));
beforeEach(()=>{vi.resetAllMocks();f.write.mockImplementation(async(name,args)=>{
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
