import {beforeEach,expect,it,vi} from "vitest";
import type {AuthContext} from "@/lib/rbac/check";
import {processing} from "../processing";
import {search} from "../search";
import {markRetryProviderStarted,publishMobileStepReceipt,reserveWebStep,withRetryEffects} from "../orchestration-receipt";

const f=vi.hoisted(()=>({rpc:vi.fn(),trusted:vi.fn(),read:vi.fn(),admit:vi.fn(),session:vi.fn(),deliver:vi.fn(),retry:vi.fn(),provider:vi.fn(),completion:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({})}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({rpc:f.trusted})}));
vi.mock("@/server/reads/dms-notifications",()=>({readDmsNotifications:f.read}));
vi.mock("@/lib/dms/ai/factory",()=>({getDmsAiProvider:f.provider}));
vi.mock("@/server/actions/dms/orchestration",()=>({retryDmsOrchestrationStep:f.retry}));
vi.mock("../access",async original=>({...await original<typeof import("../access")>(),admitMobileDmsSource:f.admit,verifyMobileDmsDelivery:f.deliver,verifySession:f.session,rpc:f.rpc}));
const actor={profile:{id:7}} as AuthContext;
const command={op:"processingAction",action:"retry_step",step:"ai_summary",documentId:10,jobId:12,sourceHash:"c".repeat(64),operationId:"91a4138d-9687-44d0-8097-230781a8149e"} as const;
const receipt={documentId:10,jobId:12,operationId:command.operationId,state:"failed",replayed:false};
const failure={step:"ai_summary",status:"failed"} as const;
beforeEach(()=>{vi.resetAllMocks();f.admit.mockResolvedValue({documentId:10,documentVersionId:20,sourceHash:command.sourceHash});f.rpc.mockResolvedValue({admitted:true,actor:7,sessionCode:"fixture"});f.provider.mockResolvedValue({provider:{isConfigured:()=>true}});});
it("redacts an initially visible notification after its permission changes during another source read",async()=>{
 const notices=[10,11].map(id=>({id,visible_document_id:id,subject:"Private "+id,message:"Message "+id,status:"new",read_at:null}));
 f.read.mockResolvedValue({success:true,data:{rows:notices,totalCount:2}});
 const admitted:number[]=[];let firstAllowed=true;
 f.admit.mockImplementation(async(_ctx,selection)=>{
  if(selection.documentId===11){await Promise.resolve();expect(admitted).toEqual([10]);firstAllowed=false;}
  admitted.push(selection.documentId);
  return {documentId:selection.documentId,documentVersionId:20,sourceHash:command.sourceHash};
 });
 f.rpc.mockImplementation(async(_name,{p_action,p_data})=>{
  expect(p_action).toBe("notification_targets");expect(p_data.sources).toEqual([10,11].map(documentId=>({documentId,versionId:20,sourceHash:command.sourceHash})));
  return [firstAllowed,true];
 });
 const result=await search({op:"documentNotifications",page:1,unreadOnly:false},actor);
 expect(result).toMatchObject({rows:[{id:10,title:"Document notification",target:null},{id:11,title:"Private 11",target:{documentId:11}}]});expect(JSON.stringify(result)).not.toContain("Message 10");
});
it("settles a native pre-provider failure and recovers the same operation when configuration later changes",async()=>{
 f.trusted.mockResolvedValue({data:receipt,error:null});
 f.retry.mockImplementation(async()=>({success:false,error:"Content unavailable"}));
 await expect(processing(command,actor)).resolves.toEqual(receipt);
 expect(f.trusted.mock.calls[0][1].p_result).toEqual({...failure,providerEffect:"never_started",abandoned:true});expect(f.completion).not.toHaveBeenCalled();
 f.rpc.mockResolvedValue({...receipt,replayed:true});f.provider.mockRejectedValue(Error("disabled"));
 await expect(processing(command,actor)).resolves.toMatchObject({replayed:true});expect(f.retry).toHaveBeenCalledTimes(1);
});
it("holds native retry when a real provider invocation has an unconfirmed outcome",async()=>{
 f.completion.mockRejectedValue(Error("response lost"));f.retry.mockImplementation(async()=>{
  markRetryProviderStarted();await f.completion().catch(()=>undefined);
  await publishMobileStepReceipt("fixture",failure,"failed").catch(()=>undefined);return {success:false};
 });
 await expect(processing(command,actor)).rejects.toMatchObject({code:"reconciliation_required"});expect(f.completion).toHaveBeenCalledOnce();expect(f.trusted).not.toHaveBeenCalled();
});
it.each([false,true])("preserves web provider start evidence at trusted settlement (started %s)",async started=>{
 f.trusted.mockImplementation(async(_name,{p_result})=>p_result?.providerEffect==="started"?{data:null,error:{code:"55000"}}:{data:true,error:null});
 await withRetryEffects(async()=>{
  const settle=await reserveWebStep(22,"fixture","ai_summary");expect(settle).toBeTypeOf("function");
  if(started){markRetryProviderStarted();f.completion();await expect(settle!(failure)).rejects.toThrow("reconciliation");}
  else await settle!(failure);
 });
 expect(f.trusted.mock.calls[1][1].p_result.providerEffect).toBe(started?"started":"never_started");expect(f.completion).toHaveBeenCalledTimes(Number(started));
});

it("marks an executed non-provider skip for normal row settlement",async()=>{
 f.trusted.mockResolvedValue({data:{...receipt,state:"skipped"},error:null});
 f.retry.mockImplementation(async()=>{await publishMobileStepReceipt("fixture",{step:"content_sync",status:"skipped"},"complete");return {success:true};});
 await expect(processing({...command,step:"content_sync"},actor)).resolves.toMatchObject({state:"skipped"});
 expect(f.trusted.mock.calls[0][1].p_result).toEqual({step:"content_sync",status:"skipped",providerEffect:"never_started"});
});
