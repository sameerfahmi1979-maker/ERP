import {expect,it,vi,beforeEach} from "vitest";
import {getAuthContext,type AuthContext} from "@/lib/rbac/check";
import {createClient} from "@/lib/supabase/server";
import {getDmsAiProvider} from "@/lib/dms/ai/factory";
import {askDmsDocumentQuestion,askVerifiedDmsQuestion} from "@/server/actions/dms/document-qa";
import {parseQr} from "../search";
import {processing} from "../processing";
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({rpc:async()=>({data:true,error:null})})}));
vi.mock("@/lib/supabase/server",()=>({createClient:vi.fn()}));
vi.mock("@/lib/rbac/check",async o=>({...await o<typeof import("@/lib/rbac/check")>(),getAuthContext:vi.fn()}));
vi.mock("@/lib/dms/ai/factory",()=>({getDmsAiProvider:vi.fn()}));
vi.mock("@/server/actions/audit",()=>({logAudit:vi.fn()}));
vi.mock("@/lib/ai/observability/log-dms-ai-usage",()=>({logDmsAiUsage:vi.fn()}));
const actor={email:"fixture@example.invalid",profile:{id:7,auth_user_id:"07000000-0000-4000-8000-000000000007",must_change_password:false},isAccountActive:true,accountStatus:"active",roleCodes:[],permissionCodes:["dms.documents.view"]} as unknown as AuthContext;
const source={documentId:9,documentVersionId:2,documentRevision:"r",fileId:null,fileSha256:null,sourceHash:"a".repeat(64)};
const question={op:"documentQuestion",documentId:9,sourceHash:source.sourceHash,question:"Which reference appears?"};
const artifact=(versionId:number,text:string)=>({kind:"prepared_text",documentId:9,versionId,artifactId:"32/21",artifactContentHash:"c".repeat(64),proofHash:"b".repeat(64),fileBindings:[{fileId:21,versionId,sha256:"d".repeat(64)}],derivationHashes:[],text,truncated:false});
const store={flag:true,artifacts:[artifact(1,"V1 stale content")],title:"Header",progress:{} as object};
const model=vi.fn();const rpc=vi.fn(async(name:string)=>{
 if(name==="mobile_dms_source")return {data:source,error:null};
 if(name==="mobile_dms_progress")return {data:store.progress,error:null};
 return {data:{source,metadata:{title:store.title},artifacts:store.artifacts},error:null};
});
beforeEach(()=>{
 vi.clearAllMocks();store.flag=true;store.title="Header";store.artifacts=[artifact(1,"V1 stale content")];
 vi.mocked(getAuthContext).mockResolvedValue(actor);
 vi.mocked(createClient).mockResolvedValue({rpc,auth:{getClaims:async()=>({data:{claims:{sub:actor.profile!.auth_user_id,session_id:"624028b6-e928-4e97-9058-68dcb72e4974"}}})},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{is_enabled:store.flag},error:null})})})})} as unknown as Awaited<ReturnType<typeof createClient>>);
 vi.mocked(getDmsAiProvider).mockResolvedValue({provider:{isConfigured:()=>true,callStructuredCompletion:model}} as unknown as Awaited<ReturnType<typeof getDmsAiProvider>>);
});
it("calls no provider for an unproven current version, then answers from newly published current preparation",async()=>{
 await expect(askVerifiedDmsQuestion(question)).rejects.toMatchObject({code:"question_source_preparation_required"});expect(model).not.toHaveBeenCalled();expect(getDmsAiProvider).not.toHaveBeenCalled();
 store.artifacts.push(artifact(2,"Verified V2 ABC-9"));model.mockResolvedValue({rawJson:JSON.stringify({answer:"ABC-9",sourceUsed:"prepared_text",confidence:"high",passageIndices:[0]})});
 const r=await askVerifiedDmsQuestion(question);expect(r.citations[0]).toMatchObject({documentId:9,versionId:2,fileId:21,snippet:"Verified V2 ABC-9",groundingHash:r.grounding.groundingHash});expect(model.mock.calls[0][1]).not.toContain("V1 stale content");
});
it("withholds the original prompt when provider configuration lookup changes grounding",async()=>{
 store.artifacts=[artifact(2,"Private current V2")];
 vi.mocked(getDmsAiProvider).mockImplementationOnce(async()=>{
  store.title="Changed during lookup";
  return {provider:{isConfigured:()=>true,callStructuredCompletion:model}} as unknown as Awaited<ReturnType<typeof getDmsAiProvider>>;
 });
 await expect(askVerifiedDmsQuestion(question)).rejects.toMatchObject({code:"source_changed"});
 expect(model).not.toHaveBeenCalled();
});
it("returns the canonical chunk index and snippet through the existing web action",async()=>{
 store.artifacts=[{...artifact(2,"Quoted registered chunk"),kind:"chunk_text",chunkIndex:7} as ReturnType<typeof artifact>];
 model.mockResolvedValue({rawJson:JSON.stringify({answer:"Registered",confidence:"high",sourceUsed:"chunk_text",passageIndices:[0]})});
 const result=await askDmsDocumentQuestion(9,"Which reference appears?");
 expect(result.data?.chunkCitations).toEqual([{chunkIndex:7,snippet:"Quoted registered chunk"}]);
});
it("withholds an answer when verified grounding changes during the call on the same version",async()=>{
 store.artifacts=[artifact(2,"Verified V2 ABC-9")];
 model.mockImplementation(async()=>{store.title="Changed after provider call";return {rawJson:JSON.stringify({answer:"ABC-9",sourceUsed:"prepared_text",confidence:"high",passageIndices:[0]})};});
 await expect(askVerifiedDmsQuestion(question)).rejects.toMatchObject({code:"source_changed"});
});
it("metadata-only uses accepted metadata exclusively, and disabled providers do no work",async()=>{
 model.mockResolvedValue({rawJson:JSON.stringify({answer:"Unavailable",sourceUsed:"not_found",confidence:"low",passageIndices:[]})});
 expect((await askVerifiedDmsQuestion({...question,contextMode:"metadata_only"})).grounding.sourceKinds).toEqual(["metadata"]);expect(model.mock.calls[0][1]).not.toContain("V1 stale");
 store.flag=false;await expect(askVerifiedDmsQuestion(question)).rejects.toMatchObject({code:"question_disabled"});expect(model).toHaveBeenCalledTimes(1);
});
it("projects worker holds without exposing candidate text or starting a paid operation",async()=>{
 store.progress={documentId:9,sourceHash:source.sourceHash,jobId:19,requestId:null,stage:"held",queueStatus:"queued",workerHealthy:false,createdAt:null,startedAt:null,updatedAt:"2026-11-21T00:00:00Z",errorCode:null,holdReason:"daily_limit",steps:[],actions:[],preparation:null};
 const result=await processing({op:"processingStatus",documentId:9,jobId:19},actor);expect(result).toMatchObject({holdReason:"daily_limit",actions:[],workerHealthy:false});expect(model).not.toHaveBeenCalled();
 store.progress={...store.progress,candidate:{private:"x"}};
 await expect(processing({op:"processingStatus",documentId:9,jobId:19},actor)).rejects.toMatchObject({code:"invalid_receipt"});
});
it("resolves only a versioned document reference or exact document number",()=>{
 expect(parseQr("ALGT:DMS:1:8")).toEqual({id:8});expect(parseQr("DMSD-08")).toEqual({number:"DMSD-08"});
 for(const value of ["ALGT:DMS:2:8","https://erp.algt.net/doc/8","algt-erp://dms/share/8","ALGT:DMS:1:08","ALGT:DMS:1:9007199254740992"])expect(()=>parseQr(value)).toThrow();
});
