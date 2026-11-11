import {beforeEach,describe,expect,it,vi} from "vitest";
import {runDocumentPreparationJob} from "@/server/dms-preparation-worker";
const m=vi.hoisted(()=>({db:vi.fn(),claim:vi.fn(),complete:vi.fn(),ocr:vi.fn(),bytes:vi.fn(),provider:vi.fn()}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:m.db}));vi.mock("@/lib/dms/ai-jobs/claim-scope",()=>({currentJobClaim:m.claim}));
vi.mock("@/lib/ai/common/provider-bridge",()=>({callCommonAiStructuredCompletion:m.complete}));vi.mock("@/server/dms-verified-intake-source",()=>({readVerifiedIntakeSource:m.bytes}));vi.mock("@/lib/dms/ocr/ocr-router",()=>({routeOcr:m.ocr}));vi.mock("@/lib/dms/ai/factory",()=>({getDmsAiProvider:m.provider}));
const hash="a".repeat(64),stage=new Map<string,unknown>();let context:any,published:any,failPublication=false,rpc:ReturnType<typeof vi.fn>;
const output=(code="CERTIFICATE")=>({documentTypeCode:code,title:"SYNTHETIC certificate",description:null,summary:"SYNTHETIC source summary",issueDate:null,expiryDate:null,fields:[{code:"number",value:"ABC",confidence:0.9,fileId:2,snippet:"ABC"}],tagNames:[],warnings:[],bundle:"single"});
const response=(code="CERTIFICATE")=>({success:true,rawJson:JSON.stringify(output(code)),providerCode:"SYNTHETIC",model:"SYNTHETIC",configId:9,promptTokens:10,completionTokens:10,durationMs:1});
beforeEach(()=>{vi.resetAllMocks();stage.clear();published=null;failPublication=false;m.claim.mockReturnValue({jobId:10,token:"00000000-0000-4000-8000-000000000001"});
 context={source:{documentId:1,documentNo:"SYN-DOC",documentTypeId:3,categoryId:4,snapshot:hash,profileHash:hash,profile:null,subject:null,typeName:"Certificate",typeCode:"CERTIFICATE",current:{title:"Old",description:null,issue_date:null,expiry_date:null},fields:[{id:5,code:"number",label:"Number",type:"text",required:false,aiExtractable:true,current:null}],existingTags:[],files:[{id:2,versionId:6,sha256:hash,name:"SYN.pdf",mime:"application/pdf",size:10,text:"SYNTHETIC ABC",bucket:"dms",path:"synthetic/SYN.pdf"}]},mode:"reuse_text",fileIds:[2],state:"queued",resultId:null};
 rpc=vi.fn(async(_name:string,args:any)=>{if(_name==='ai_mod05_model_gate')return {data:{success:true,quality:'synthetic_test_boundary'},error:null};const action=args.p_action,p=args.p_data;if(action==="context")return {data:{success:true,preparation:true,context},error:null};if(action==="bind_type")return {data:{documentTypeId:7,typeCode:"OTHER",typeName:"Other registered type",categoryId:8,categoryName:"Other",profile:null,profileHash:hash,schemaHash:hash,fields:context.source.fields,canApply:true,holdReason:null},error:null};if(action==="begin"){const old=stage.get(p.stage);if(old===undefined){stage.set(p.stage,"started");return {data:{success:true,state:"started",value:null}};}return {data:{success:true,state:old==="started"?"uncertain":"completed",value:old==="started"?null:old}};}if(action==="complete"){stage.set(p.stage,p.value);return {data:{success:true,state:"completed",value:p.value}};}if(action==="publish"){published=p;context.resultId=99;if(failPublication)throw Error("lost after commit");return {data:{success:true,resultId:99,replayed:false}};}throw Error(action);});
 const data=(table:string)=>table==="erp_ai_feature_flags"?[{feature_code:"DMS_OCR",is_enabled:true},{feature_code:"DMS_OCR_ROUTER",is_enabled:true}]:[{type_code:"CERTIFICATE",name_en:"Certificate"},{type_code:"OTHER",name_en:"Other"}];
 m.db.mockReturnValue({rpc,storage:{from:vi.fn(()=>({}))},from:(table:string)=>{const chain:any={select:()=>chain,eq:()=>chain,is:()=>chain,order:()=>chain,limit:async()=>({data:data(table),error:null}),in:async()=>({data:data(table),error:null})};return chain;}});
 m.complete.mockResolvedValue(response());m.provider.mockResolvedValue({provider:{providerCode:"SYNTHETIC",modelId:"SYNTHETIC"}});m.bytes.mockResolvedValue({bytes:Buffer.from("synthetic"),proof:{sha256:hash}});m.ocr.mockResolvedValue({success:true,text:"SYNTHETIC ABC fresh text",providerCode:"SYNTHETIC",model:"SYNTHETIC",method:"synthetic",pageCount:1});
});
describe("document preparation worker adoption",()=>{
 it("retains a received malformed result and its usage before validation; recovery never repeats the paid call",async()=>{
  m.complete.mockResolvedValue({...response(),rawJson:'{"fields":"invalid"}'});
  expect(await runDocumentPreparationJob(1)).toMatchObject({success:false,errorCode:"provider_output_invalid",retryable:false});
  expect(stage.get("analysis")).toMatchObject({receiptVersion:2,rawJson:'{"fields":"invalid"}',promptTokens:10,model:"SYNTHETIC"});
  expect(await runDocumentPreparationJob(1)).toMatchObject({errorCode:"provider_output_invalid"});
  expect(m.complete).toHaveBeenCalledOnce();expect(published).toBeNull();
 });
 it.each(["provider_refusal","provider_output_incomplete"])("retains %s without publishing or paying again",async(code)=>{
  m.complete.mockResolvedValue({...response(),responseIssue:code});
  expect(await runDocumentPreparationJob(1)).toMatchObject({errorCode:code,retryable:false});
  expect(stage.get("analysis")).toMatchObject({responseIssue:code});
  expect(await runDocumentPreparationJob(1)).toMatchObject({errorCode:code});
  expect(m.complete).toHaveBeenCalledOnce();expect(published).toBeNull();
 });
 it("preserves the provider failure category without logging or returning its private error",async()=>{
  m.complete.mockResolvedValue({success:false,errorCode:"provider_request_rejected",error:"PRIVATE PROVIDER BODY"});
  const result=await runDocumentPreparationJob(1);
  expect(result).toMatchObject({errorCode:"provider_request_rejected",retryable:false});
  expect(JSON.stringify(result)).not.toContain("PRIVATE");expect(published).toBeNull();
 });
 it("does not mark analysis started when pre-call quality admission fails",async()=>{
  const original=rpc.getMockImplementation()!;rpc.mockImplementation(async(name,args)=>name==='ai_mod05_model_gate'?{error:{code:'55000'},data:null}:original(name,args));
  expect(await runDocumentPreparationJob(1)).toMatchObject({errorCode:"quality_evaluation_held"});
  expect(stage.has("analysis")).toBe(false);expect(m.complete).not.toHaveBeenCalled();
 });
 it("recovers a received valid result after publication failure with no new paid analysis",async()=>{
  const original=rpc.getMockImplementation()!;let once=true;
  rpc.mockImplementation(async(name,args)=>{if(args.p_action==='publish'&&once){once=false;return {error:{code:'XX000'},data:null};}return original(name,args);});
  expect(await runDocumentPreparationJob(1)).toMatchObject({errorCode:"database_error"});
  expect((await runDocumentPreparationJob(1))?.success).toBe(true);expect(m.complete).toHaveBeenCalledOnce();
 });
 it("replays legacy validated receipts without a provider call",async()=>{
  const original=rpc.getMockImplementation()!;let once=true;
  rpc.mockImplementation(async(name,args)=>{if(args.p_action==='publish'&&once){once=false;return {error:{code:'XX000'},data:null};}return original(name,args);});
  await runDocumentPreparationJob(1);
  const metadata={...stage.get("analysis") as Record<string,unknown>};
  delete metadata.receiptVersion;delete metadata.rawJson;
  stage.set("analysis",{...metadata,output:output()});
  expect((await runDocumentPreparationJob(1))?.success).toBe(true);expect(m.complete).toHaveBeenCalledOnce();
 });
 it("reuses retained text and prepares all supported sections in one model call",async()=>{expect((await runDocumentPreparationJob(1))?.success).toBe(true);expect(m.complete).toHaveBeenCalledTimes(1);expect(m.ocr).not.toHaveBeenCalled();expect(published.candidate.summary).toContain("SYNTHETIC");expect(published.candidate.sourceSnapshot).toBe(hash);});
 it("re-reads attested originals into pending candidates without changing accepted source text",async()=>{context.mode="reread_files";expect((await runDocumentPreparationJob(1))?.success).toBe(true);expect(m.bytes).toHaveBeenCalledTimes(1);expect(m.ocr).toHaveBeenCalledTimes(1);expect(context.source.files[0].text).toBe("SYNTHETIC ABC");expect(published.candidateText).toContain("fresh text");expect(m.ocr.mock.calls[0][0]).toMatchObject({forceVision:false,azureProvider:null,featureFlags:{dmsOcrAzure:false}});});
 it("never OCRs or pays to infer identity from portraits",async()=>{context.mode="reread_files";context.source.typeCode="EMPLOYEE_PHOTO";context.source.typeName="Employee photo";context.source.subject={kind:"employee",id:1,name:"SYNTHETIC person"};expect((await runDocumentPreparationJob(1))?.success).toBe(true);expect(m.ocr).not.toHaveBeenCalled();expect(m.complete).not.toHaveBeenCalled();expect(published.candidate.applicability).toBe("portrait");});
 it("recovers a lost publication response without another model pass",async()=>{failPublication=true;expect((await runDocumentPreparationJob(1))?.success).toBe(false);expect((await runDocumentPreparationJob(1))?.success).toBe(true);expect(m.complete).toHaveBeenCalledTimes(1);});
 it("never repeats an uncertain paid stage",async()=>{m.complete.mockRejectedValue(Error("provider transport lost"));expect((await runDocumentPreparationJob(1))?.success).toBe(false);expect((await runDocumentPreparationJob(1))?.success).toBe(false);expect(m.complete).toHaveBeenCalledTimes(1);expect(published).toBeNull();});
 it("admits at most one targeted pass for a different verified registered type",async()=>{m.complete.mockResolvedValue(response("OTHER"));expect((await runDocumentPreparationJob(1))?.success).toBe(true);expect(m.complete).toHaveBeenCalledTimes(2);expect(published.candidate.proposedType.typeCode).toBe("OTHER");expect(published.candidate.values.some((v:any)=>v.key==="document_type_id")).toBe(true);});
 it("context rejection is a hold and never a legacy fallback",async()=>{rpc.mockResolvedValue({error:{code:"42501"},data:null});expect(await runDocumentPreparationJob(1)).toMatchObject({success:false,retryable:false});expect(m.complete).not.toHaveBeenCalled();});
 it("rejects a different document binding without a provider call",async()=>{expect(await runDocumentPreparationJob(77)).toMatchObject({success:false,errorCode:"source_changed"});expect(m.complete).not.toHaveBeenCalled();});
 it('holds changed provider quality before any paid call',async()=>{const original=rpc.getMockImplementation()!;rpc.mockImplementation(async(name,args)=>name==='ai_mod05_model_gate'?{error:{code:'55000'},data:null}:original(name,args));expect((await runDocumentPreparationJob(1))?.success).toBe(false);expect(m.complete).not.toHaveBeenCalled();expect(published).toBeNull();});
 it('also checks the actual returned model and never publishes or repeats a rejected paid result',async()=>{const original=rpc.getMockImplementation()!;rpc.mockImplementation(async(name,args)=>name==='ai_mod05_model_gate'&&args.p_model==='UNREVIEWED'?{error:{code:'55000'},data:null}:original(name,args));m.complete.mockResolvedValue({...response(),model:'UNREVIEWED'});expect((await runDocumentPreparationJob(1))?.success).toBe(false);expect((await runDocumentPreparationJob(1))?.success).toBe(false);expect(m.complete).toHaveBeenCalledOnce();expect(published).toBeNull();});
});
