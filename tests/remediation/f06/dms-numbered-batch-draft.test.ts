import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createHash} from 'node:crypto';
import type {BatchRequest,BatchReceipt} from '@/lib/dms/batch-admission';
import * as durable from '@/lib/dms/numbered-batch-draft';

const ai=vi.hoisted(()=>({factory:vi.fn(),azure:vi.fn(),analyze:vi.fn(),configured:vi.fn(),extract:vi.fn(),flags:vi.fn(),route:vi.fn(),candidates:vi.fn(),load:vi.fn(),fields:vi.fn(),usage:vi.fn(),reviewEnabled:vi.fn(),review:vi.fn(),log:vi.fn(),warn:vi.fn(),error:vi.fn(),approval:vi.fn(),unexpected:vi.fn()}));
vi.mock('@/lib/dms/ai/factory',()=>({getDmsAiProvider:ai.factory,getAzureDocumentIntelligenceProvider:ai.azure}));
vi.mock('@/lib/dms/file-content-extractor',()=>({extractFileContent:ai.extract}));
vi.mock('@/lib/dms/ocr/ocr-router',()=>({loadOcrFeatureFlags:ai.flags,routeOcr:ai.route}));
vi.mock('@/lib/dms/ai/classification-candidate-builder',()=>({buildClassificationCandidates:ai.candidates,loadClassificationCandidateData:ai.load,formatClassificationPacketsForPrompt:ai.unexpected}));
vi.mock('@/lib/dms/ai/load-metadata-fields',()=>({loadMetadataFieldsForDocumentType:ai.fields}));
vi.mock('@/lib/ai/observability/log-dms-ai-usage',()=>({logDmsAiUsage:ai.usage}));
vi.mock('@/lib/dms/review-queue/review-queue-upsert',()=>({isDmsAiReviewEnabled:ai.reviewEnabled,upsertDmsReviewQueueItem:ai.review}));
vi.mock('@/lib/logger',()=>({logger:{info:ai.log,warn:ai.warn,error:ai.error}}));
vi.mock('@/server/numbered-ai-approval',()=>({approveNumberedAiIntake:ai.approval}));

const m=vi.hoisted(()=>({client:vi.fn(),admin:vi.fn(),auth:vi.fn(),permission:vi.fn(),usable:vi.fn(),rpc:vi.fn(),from:vi.fn(),analysis:vi.fn(),audit:vi.fn(),cache:vi.fn(),info:vi.fn(),download:vi.fn(),sign:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:m.client}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:m.admin}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:m.auth,hasPermission:m.permission,canUseApplication:m.usable}));
vi.mock('next/cache',()=>({revalidatePath:m.cache}));
vi.mock('@/server/actions/audit',()=>({logAudit:m.audit}));
vi.mock('@/server/actions/dms/upload-sessions',()=>({createDmsUploadSession:vi.fn()}));
vi.mock('@/server/actions/dms/ai-intake',()=>({startAiIntakeFromUploadSession:m.analysis,retryAiIntake:vi.fn()}));
vi.mock('@/server/actions/dms/standard-file-name',()=>({resolveStandardFileNameForIntakeApprove:vi.fn()}));
vi.mock('@/lib/dms/approve/approve-ai-intake',()=>({runApproveAiIntakeSaga:vi.fn()}));
import {startAiIntakeAndCreateDraft,isDmsBatchIntakeEnabled,readDmsUploadBatchDraftRecovery,prepareDmsUploadBatchMemberDraft} from '@/server/actions/dms/batch-intake';
import type {BatchDraftSnapshot} from '@/lib/dms/numbered-batch-draft';

describe('W16 preparation and consumer SQLSTATE boundaries',()=>{
 const boundaries=[{stage:'prepare',value:()=>input},{stage:'consume',value:()=>prepared}];
 it.each(boundaries.flatMap(row=>['40003','08007','40ZZZ','57014','PGRST000','XX000',undefined,'','40','4000','23','PT','40003suffix','40001suffix','42501suffix',' 40003','40003 ','40003\n','40001\n','42501\n','40p01',40001,{}].map(code=>({...row,code}))))('$stage unknown/malformed $code stops without analysis',async({value,code})=>{
  m.rpc.mockResolvedValue({data:null,error:{code,message:'W16_PRIVATE',details:'W16_PRIVATE',hint:'W16_PRIVATE'}});
  const result=await call(value(),contract);expect(result).toMatchObject({success:false,uncertain:true});expect(result.error).toMatch(/unconfirmed/i);expect(JSON.stringify(result)).not.toMatch(/W16_PRIVATE|rejected|committed/i);
  expect(m.rpc).toHaveBeenCalledOnce();expect(m.analysis).not.toHaveBeenCalled();expect(m.admin).not.toHaveBeenCalled();expect(m.audit).not.toHaveBeenCalled();expect(m.cache).not.toHaveBeenCalled();
 });
 it.each(boundaries.flatMap(row=>['40000','40001','40002','40P01','22023','23514','42501','PT409','P0001','P0002'].map(code=>({...row,code}))))('$stage preserves definite $code',async({value,code})=>{
  m.rpc.mockResolvedValue({error:{code}});expect(await call(value(),contract)).toMatchObject({uncertain:false});
 });
 it.each(boundaries)('$stage does not classify 55P03 as definite',async({value})=>{m.rpc.mockResolvedValue({error:{code:'55P03'}});expect(await call(value(),contract)).toMatchObject({uncertain:true});});
 it.each(boundaries.flatMap(row=>['40003','08007'].map(code=>({...row,code}))))('$stage exact explicit retry after $code',async({stage,value,code})=>{
  m.rpc.mockResolvedValueOnce({error:{code},data:null}).mockResolvedValueOnce({data:stage==='prepare'?{kind:'prepared',snapshot}:{...receipt,replayed:true},error:null});
  expect(await call(value(),contract)).toMatchObject({success:false,uncertain:true});expect(m.rpc).toHaveBeenCalledOnce();expect(m.analysis).not.toHaveBeenCalled();
  const retry=await call(value(),contract);expect(retry).toMatchObject(stage==='prepare'?{success:false,prepared:{operation_id:contract.operationId,snapshot}}:{success:true,data:{replayed:true}});
  expect(m.rpc.mock.calls[1]).toEqual(m.rpc.mock.calls[0]);expect(m.analysis).not.toHaveBeenCalled();
 });
});


const input={uploadSessionId:17,allowDuplicate:false};
const contract={operationId:'00000000-0000-4000-8000-000000000001',revision:null};
const snapshot:BatchDraftSnapshot={upload_session_id:17,session_code:'S17',batch_id:null,analysis_result_id:19,owning_company_id:20,owning_branch_id:21,party_id:null,document_type_id:22,category_id:23,title:'Synthetic',description:null,confidentiality_level:'internal',issue_date:null,expiry_date:null,confidence:'high',source_fingerprint:'a'.repeat(64)};
const prepared={...input,prepared:snapshot};
const receipt={documentId:42,documentNo:'DMS-42',status:'pending_ai_review',confidence:'high',operation_id:contract.operationId,upload_session_id:17,replayed:false,reference_id:51};
const call=startAiIntakeAndCreateDraft as (...args:unknown[])=>Promise<{success:boolean;error?:string;uncertain?:boolean;data?:unknown}>;
function read(data:unknown){const chain={select:vi.fn(),eq:vi.fn(),is:vi.fn(),single:vi.fn(),maybeSingle:vi.fn()};for(const name of ['select','eq','is'] as const)chain[name].mockReturnValue(chain);chain.single.mockResolvedValue({data,error:null});chain.maybeSingle.mockResolvedValue({data,error:null});return chain;}
beforeEach(()=>{
 vi.resetAllMocks();m.auth.mockResolvedValue({profile:{id:5},roleCodes:[],permissionCodes:[]});m.permission.mockReturnValue(true);
 m.client.mockResolvedValue({from:m.from,rpc:(...args:unknown[])=>{const result=Promise.resolve(m.rpc(...args));return Object.assign(result,{retry:(value:boolean)=>{expect(value).toBe(false);return result;}});}});m.admin.mockReturnValue({from:m.from});
 m.from.mockImplementation((table:string)=>read(table==='erp_ai_feature_flags'?{is_enabled:true}:table==='dms_upload_sessions'?{id:17,session_code:'S17',document_id:42,intake_status:'review_pending',batch_id:null,batch_draft_operation_id:null,original_filename:'Synthetic.pdf'}:{id:42,document_no:'DMS-42',status:'pending_ai_review'}));
 m.analysis.mockResolvedValue({success:true,data:{sessionCode:'S17',status:'review_pending'}});
});

describe('batch draft preparation is separate from commit',()=>{
 it('ready analysis returns a bound snapshot without allocation or provider work',async()=>{m.rpc.mockResolvedValue({data:{kind:'prepared',snapshot},error:null});const r=await startAiIntakeAndCreateDraft(input,contract);expect(r).toEqual({success:false,prepared:{operation_id:contract.operationId,snapshot}});expect(m.rpc).toHaveBeenCalledExactlyOnceWith('prepare_numbered_dms_batch_draft',{p_session:17});expect(m.analysis).not.toHaveBeenCalled();expect(m.admin).not.toHaveBeenCalled();});
 it('database source admission precedes provider; post-analysis preparation still allocates nothing',async()=>{m.rpc.mockResolvedValueOnce({data:{kind:'analysis_required',processing:false,session_code:'S17',batch_id:null}}).mockResolvedValueOnce({data:{kind:'prepared',snapshot}});const r=await startAiIntakeAndCreateDraft(input,contract);expect(r.success).toBe(false);expect('prepared' in r&&r.prepared?.snapshot).toEqual(snapshot);expect(m.analysis).toHaveBeenCalledExactlyOnceWith({uploadSessionId:17,allowDuplicate:false});expect(m.rpc.mock.invocationCallOrder[0]).toBeLessThan(m.analysis.mock.invocationCallOrder[0]);expect(m.analysis.mock.invocationCallOrder[0]).toBeLessThan(m.rpc.mock.invocationCallOrder[1]);expect(m.rpc.mock.calls.every(v=>v[0]==='prepare_numbered_dms_batch_draft')).toBe(true);});
 it('source denial prevents any provider access',async()=>{m.rpc.mockResolvedValue({error:{code:'42501',message:'private SQL'}});expect(await call(input,contract)).toMatchObject({success:false,uncertain:false});expect(m.analysis).not.toHaveBeenCalled();});
 it('in-progress analysis retains a retry, without calling the provider again',async()=>{m.rpc.mockResolvedValue({data:{kind:'analysis_required',processing:true,session_code:'S17',batch_id:null}});expect(await call(input,contract)).toMatchObject({success:false,uncertain:true});expect(m.analysis).not.toHaveBeenCalled();});
 it('provider failure does not allocate or expose provider diagnostics',async()=>{m.rpc.mockResolvedValue({data:{kind:'analysis_required',processing:false,session_code:'S17',batch_id:null}});m.analysis.mockResolvedValue({success:false,error:'private provider key'});const r=await call(input,contract);expect(r).toMatchObject({success:false,uncertain:true});expect(JSON.stringify(r)).not.toContain('private provider');expect(m.rpc).toHaveBeenCalledOnce();});
 it('provider completion alone is not readiness',async()=>{m.rpc.mockResolvedValue({data:{kind:'analysis_required',processing:false,session_code:'S17',batch_id:null}});expect(await call(input,contract)).toMatchObject({success:false,uncertain:true});expect(m.rpc).toHaveBeenCalledTimes(2);});
 it.each([{...snapshot,upload_session_id:99},{...snapshot,created_by:5},{...snapshot,source_fingerprint:'bad'},{...snapshot,issue_date:'2026-02-31'}])('unverifiable preparation is not dispatched: %j',async snapshot=>{m.rpc.mockResolvedValue({data:{kind:'prepared',snapshot}});expect(await call(input,contract)).toMatchObject({success:false,uncertain:true});expect(m.rpc).toHaveBeenCalledOnce();expect(m.analysis).not.toHaveBeenCalled();});
});

describe('atomic consumer adapter',()=>{
 it.each([false,true])('receipt accepted and exact prepared request submitted (replayed=%s)',async replayed=>{m.rpc.mockResolvedValue({data:{...receipt,replayed}});const result=await call(prepared,contract);expect(result).toMatchObject({success:true,data:{documentId:42,replayed}});expect(m.rpc).toHaveBeenCalledExactlyOnceWith('create_numbered_dms_batch_draft',{p_operation:contract.operationId,p_request:prepared});expect(m.analysis).not.toHaveBeenCalled();expect(m.admin).not.toHaveBeenCalled();expect(JSON.stringify(result)).not.toContain('reference_id');});
 it('cache failure does not revoke a committed receipt',async()=>{m.rpc.mockResolvedValue({data:receipt});m.cache.mockImplementation(()=>{throw Error('cache');});expect((await call(prepared,contract)).success).toBe(true);});
 it.each(['42501','PT409','P0002','23514','40001','22023'])('known database rollback %s is safe and private',async code=>{m.rpc.mockResolvedValue({error:{code,message:'private table detail',details:'secret'}});const r=await call(prepared,contract);expect(r).toMatchObject({success:false,uncertain:false});expect(JSON.stringify(r)).not.toMatch(/private|secret/);});
 it.each(['57014','PGRST000',undefined])('unconfirmed error %s retains retry',async code=>{m.rpc.mockResolvedValue({error:{code,message:'private'}});expect(await call(prepared,contract)).toMatchObject({success:false,uncertain:true});});
 it('transport throw is uncertain without leaking diagnostics',async()=>{m.rpc.mockRejectedValue(Error('secret transport'));expect(await call(prepared,contract)).toMatchObject({success:false,uncertain:true});expect(JSON.stringify(await call(prepared,contract))).not.toContain('secret');});
 it.each([null,{}, {...receipt,operation_id:'00000000-0000-4000-8000-000000000099'},{...receipt,upload_session_id:99},{...receipt,reference_id:null},{...receipt,extra:'bad'}])('invalid/mismatched receipt stays unconfirmed: %j',async data=>{m.rpc.mockResolvedValue({data});expect(await call(prepared,contract)).toMatchObject({success:false,uncertain:true});expect(m.cache).not.toHaveBeenCalled();});
 it('prepared session mismatch is rejected before transport',async()=>{expect((await call({...prepared,prepared:{...snapshot,upload_session_id:18}},contract)).success).toBe(false);expect(m.client).not.toHaveBeenCalled();});
});

describe('ordinary DMS batch UI feature admission',()=>{
 it('scoped admitted actor reads only the one flag boolean',async()=>{m.auth.mockResolvedValue({profile:{id:5},roleCodes:[],permissionCodes:['dms.documents.upload'],roleAssignments:[{ownerCompanyId:20,branchId:21}]});m.permission.mockImplementation((_ctx,code)=>code==='dms.documents.upload');expect(await isDmsBatchIntakeEnabled()).toBe(true);expect(m.from).toHaveBeenCalledExactlyOnceWith('erp_ai_feature_flags');const query=m.from.mock.results[0].value;expect(query.select).toHaveBeenCalledExactlyOnceWith('is_enabled');expect(query.eq).toHaveBeenCalledExactlyOnceWith('feature_code','DMS_BATCH_INTAKE');});
 it('no-role actor does not reach privileged flag lookup',async()=>{m.permission.mockReturnValue(false);expect(await isDmsBatchIntakeEnabled()).toBe(false);expect(m.admin).not.toHaveBeenCalled();});
 it('unauthenticated actor does not reach privileged flag lookup',async()=>{m.auth.mockResolvedValue({profile:null});expect(await isDmsBatchIntakeEnabled()).toBe(false);expect(m.admin).not.toHaveBeenCalled();});
 it.each([false,null])('disabled/missing flag %j fails closed',async is_enabled=>{m.from.mockReturnValue(read(is_enabled===null?null:{is_enabled}));expect(await isDmsBatchIntakeEnabled()).toBe(false);});
 it('flag read failure fails closed',async()=>{m.from.mockImplementation(()=>{throw Error('private settings error');});expect(await isDmsBatchIntakeEnabled()).toBe(false);});
});
describe('batch draft exact request admission',()=>{
 it.each([undefined,null,{}, {...contract,operationId:'invalid'},{...contract,revision:'1'},{...contract,extra:true}])('missing/invalid contract fails before client/provider dispatch: %j',async value=>{
  const result=await call(input,value);expect(result.success).toBe(false);expect(m.client).not.toHaveBeenCalled();expect(m.analysis).not.toHaveBeenCalled();expect(m.rpc).not.toHaveBeenCalled();
 });
 it('an existing session document does not authorize an unbound creation receipt',async()=>{expect((await call(input,undefined)).success).toBe(false);expect(m.from).not.toHaveBeenCalled();});
 it('missing independent numbering authority denies before provider/client dispatch',async()=>{m.permission.mockImplementation((_ctx,code)=>code!=='numbering.rules.generate');expect((await call(input,contract)).success).toBe(false);expect(m.client).not.toHaveBeenCalled();expect(m.analysis).not.toHaveBeenCalled();});
 it('missing upload authority denies without relying on dms.admin fallback',async()=>{m.permission.mockImplementation((_ctx,code)=>code!=='dms.documents.upload');expect((await call(input,contract)).success).toBe(false);expect(m.client).not.toHaveBeenCalled();expect(m.analysis).not.toHaveBeenCalled();});
 it.each([{...input,uploadSessionId:0},{...input,created_by:99},{...input,owning_company_id:99}])('invalid/protected input fails before client/provider dispatch: %j',async data=>{expect((await call(data,contract)).success).toBe(false);expect(m.client).not.toHaveBeenCalled();expect(m.analysis).not.toHaveBeenCalled();});
});

const durableAuth="00000000-0000-4000-8000-000000000002";
const durableOperation="aaaaaaaa-0000-4000-8000-000000000003";
const durableRequest:BatchRequest={manifest:{version:1,context:null,files:[{position:0,original_filename:"a.pdf",mime_type:"application/pdf",file_size_bytes:1,sha256_hash:createHash("sha256").update("x").digest("hex")}]},contract};
function durableReceipt():BatchReceipt{return {version:1,operation_id:contract.operationId,auth_user_id:durableAuth,profile_id:5,fingerprint:createHash("sha256").update(JSON.stringify(["dms-batch-admission/v1",null,[[0,"a.pdf","application/pdf",1,durableRequest.manifest.files[0].sha256_hash]]])).digest("hex"),manifest:durableRequest.manifest,batch_id:6,batch_code:"B"+"C".repeat(32),company_id:20,branch_id:21,members:[{position:0,id:17,code:"D".repeat(32),bucket:"dms-temp",path:"sessions/"+"D".repeat(32)+"/a.pdf",name:"a.pdf",mime:"application/pdf",size:1,sha256:durableRequest.manifest.files[0].sha256_hash}]};}
function durableAnchors(){const r=durableReceipt();return {version:1 as const,admission_operation_id:r.operation_id,admission_fingerprint:r.fingerprint,auth_user_id:r.auth_user_id,profile_id:r.profile_id,batch_id:r.batch_id,owning_company_id:r.company_id,owning_branch_id:r.branch_id};}
function durableMember(kind:"prepared"|"unprepared"|"analysis_required"|"historical"="prepared",processing=false){
 const source={position:0,upload_session_id:17,session_code:"D".repeat(32)};
 if(kind==="historical")return {...source,kind,draft_operation_id:null};
 const request={uploadSessionId:17,allowDuplicate:false};
 if(kind==="prepared")return {...source,kind,draft_operation_id:durableOperation,request:{...request,prepared:{...snapshot,session_code:source.session_code,batch_id:6}}};
 return {...source,kind,draft_operation_id:durableOperation,request,...(kind==="analysis_required"?{processing}:{})};
}
const durableRecovery=()=>({...durableAnchors(),members:[durableMember()]});
const durablePrepare=(kind:"prepared"|"analysis_required"="prepared",processing=false)=>({...durableAnchors(),member:durableMember(kind,processing)});

describe("W22 actual AI modern single-winner gate (offline ports)",()=>{
 type Operation={table:string;action:string;payload:Record<string,unknown>|undefined;filters:Record<string,unknown>;selection:string|undefined;retry:unknown};
 let row:Record<string,unknown>;
 let operations:Operation[];
 let claimResult:unknown;
 let postGuard:unknown;
 let prepareCount:number;
 let hidden=false;
 let resultWriteError=false;
 const real=()=>vi.importActual<typeof import("@/server/actions/dms/ai-intake")>("@/server/actions/dms/ai-intake");
 function query(table:string){
  const op:Operation={table,action:"read",payload:undefined,filters:{},selection:undefined,retry:undefined};
  const execute=async()=>{
   operations.push(structuredClone(op));
   if(!["dms_upload_sessions","dms_ai_extraction_jobs","dms_ai_extraction_results"].includes(table)){ai.unexpected(table,op);throw Error("Unexpected offline table");}
   if(op.action==="read")return {data:table==="dms_upload_sessions"&&!hidden?structuredClone(row):null,error:null};
   if(op.action==="update"&&op.payload?.intake_status==="ocr_processing"){
    if(claimResult==="committed-lost"){Object.assign(row,op.payload);throw Error("W22_PRIVATE_LOST");}
    if(claimResult instanceof Error)throw claimResult;
    if(claimResult!==undefined)return claimResult;
    const matches=Object.entries(op.filters).every(([key,value])=>row[key]===value);
    if(matches)Object.assign(row,op.payload);
    return {data:matches?[{id:17,batch_draft_operation_id:row.batch_draft_operation_id,intake_status:"ocr_processing"}]:[],error:null};
   }
   if(op.action==="insert")return table==="dms_ai_extraction_results"&&resultWriteError?{data:null,error:{code:"08007",message:"W22_PRIVATE_RESULT",details:"W22_PRIVATE_DETAILS",hint:"W22_PRIVATE_HINT"}}:{data:{id:table==="dms_ai_extraction_jobs"?71:72},error:null};
   if(table==="dms_upload_sessions"&&op.payload)Object.assign(row,op.payload);
   return {data:null,error:null};
  };
  const q={select:vi.fn((value:string)=>{op.selection=value;return q;}),eq:vi.fn((key:string,value:unknown)=>{op.filters[key]=value;return q;}),is:vi.fn((key:string,value:unknown)=>{op.filters[key]=value;return q;}),in:vi.fn(()=>q),retry:vi.fn((value:unknown)=>{op.retry=value;return q;}),update:vi.fn((value:Record<string,unknown>)=>{op.action="update";op.payload=value;return q;}),insert:vi.fn((value:Record<string,unknown>)=>{op.action="insert";op.payload=value;return q;}),single:vi.fn(execute),maybeSingle:vi.fn(execute),then:(ok:(v:unknown)=>unknown,bad:(e:unknown)=>unknown)=>execute().then(ok,bad)};
  return q;
 }
 beforeEach(()=>{
  row={id:17,session_code:"D".repeat(32),batch_id:6,admission_position:0,batch_draft_operation_id:durableOperation,uploaded_by:5,owning_company_id:20,owning_branch_id:21,status:"uploaded",intake_status:"uploaded",updated_at:"2026-10-05T00:00:00.000Z",deleted_at:null,document_id:null,ai_result_id:null,temp_cleaned_at:null,temp_storage_path:"sessions/"+"D".repeat(32)+"/a.pdf",original_filename:"a.pdf",mime_type:"application/pdf"};
  operations=[];claimResult=undefined;postGuard=undefined;prepareCount=0;hidden=false;resultWriteError=false;
  m.auth.mockResolvedValue({profile:{id:5,auth_user_id:durableAuth},isAccountActive:true});m.usable.mockReturnValue(true);
  m.from.mockImplementation(query);
  m.rpc.mockImplementation(async(name:string)=>{
   if(name==="read_dms_upload_batch_admission")return {data:durableReceipt(),error:null};
   if(name==="prepare_recoverable_dms_batch_draft"){
    prepareCount++;
    if(prepareCount>1&&postGuard instanceof Error)throw postGuard;
    if(prepareCount>1&&postGuard!==undefined)return postGuard;
    return {data:durablePrepare("analysis_required",row.intake_status==="ocr_processing"||row.intake_status==="ai_processing"),error:null};
   }
   ai.unexpected(name);throw Error("unexpected business RPC");
  });
  ai.configured.mockReturnValue(true);ai.factory.mockResolvedValue({provider:{providerCode:"offline",modelId:"fixture",isConfigured:ai.configured,analyze:ai.analyze},configId:2});
  ai.load.mockResolvedValue({});ai.candidates.mockResolvedValue({packets:[],typeCandidates:[],scoredTypes:[]});ai.fields.mockResolvedValue([]);
  ai.flags.mockResolvedValue({dmsOcrRouter:false});ai.extract.mockResolvedValue({text:"synthetic",images:[],method:"offline"});
  ai.analyze.mockImplementation(async()=>({classification:{suggestedTypeCode:null,confidenceScore:0.9,confidenceLabel:"high",reason:"fixture"},extraction:{fields:[],additionalFields:[]},detectedEntities:[],suggestedLinks:[]}));
  ai.reviewEnabled.mockResolvedValue(false);
  m.download.mockResolvedValue({data:new Blob(["x"]),error:null});
  m.admin.mockReturnValue({storage:{from:(bucket:string)=>{expect(bucket).toBe("dms-temp");return {download:m.download};}}});
 });
 function noPipeline(){
  expect(m.download).not.toHaveBeenCalled();expect(ai.extract).not.toHaveBeenCalled();expect(ai.route).not.toHaveBeenCalled();expect(ai.analyze).not.toHaveBeenCalled();expect(ai.load).not.toHaveBeenCalled();expect(ai.usage).not.toHaveBeenCalled();expect(m.audit).not.toHaveBeenCalled();expect(ai.approval).not.toHaveBeenCalled();
 }
 afterEach(()=>{expect(ai.unexpected).not.toHaveBeenCalled();expect(ai.error).not.toHaveBeenCalled();});
 it.each([false,true])("elects one actual configured pipeline when both saw uploaded (reverse config responses=%s)",async reverse=>{
  const resolvers:Array<(value:unknown)=>void>=[];
  const configured={provider:{providerCode:"offline",modelId:"fixture",isConfigured:ai.configured,analyze:ai.analyze},configId:2};
  ai.factory.mockImplementation(()=>new Promise(resolve=>resolvers.push(resolve)));
  const {startAiIntakeFromUploadSession:start}=await real();
  const one=start(input),two=start(input);
  await vi.waitFor(()=>expect(resolvers).toHaveLength(2));
  (reverse?[...resolvers].reverse():resolvers).forEach(resolve=>resolve(configured));
  const results=await Promise.all([one,two]);
  expect(results.filter(r=>r.success&&r.data?.status==="review_pending")).toHaveLength(1);
  expect(results.filter(r=>!r.success)).toHaveLength(1);
  expect(results.find(r=>!r.success)).toEqual({success:false,error:"Analysis start is unconfirmed. Retain this batch for reconciliation."});
  expect(ai.warn).not.toHaveBeenCalled();
  const claims=operations.filter(o=>o.payload?.intake_status==="ocr_processing");
  expect(claims).toHaveLength(2);
  for(const claim of claims){
   expect(claim).toMatchObject({table:"dms_upload_sessions",action:"update",selection:"id,batch_draft_operation_id,intake_status",retry:false,filters:{id:17,batch_draft_operation_id:durableOperation,batch_id:6,admission_position:0,uploaded_by:5,intake_status:"uploaded",status:"uploaded",updated_at:"2026-10-05T00:00:00.000Z",deleted_at:null,document_id:null,ai_result_id:null,temp_cleaned_at:null}});
   expect(claim.payload).toEqual({intake_status:"ocr_processing",updated_at:expect.any(String)});
  }
  expect(m.download).toHaveBeenCalledExactlyOnceWith("sessions/"+"D".repeat(32)+"/a.pdf");expect(ai.extract).toHaveBeenCalledOnce();expect(ai.analyze).toHaveBeenCalledOnce();expect(ai.usage).toHaveBeenCalledOnce();
  expect(operations.filter(o=>o.action==="insert").map(o=>[o.table,o.payload?.upload_session_id])).toEqual([["dms_ai_extraction_jobs",17],["dms_ai_extraction_results",17]]);
  expect(row).toMatchObject({intake_status:"review_pending",ai_job_id:71,ai_result_id:72});
  expect(m.audit.mock.calls.filter(([v])=>v.new_values?.event==="ai_intake_started")).toHaveLength(1);
  expect(m.rpc.mock.calls.filter(([n])=>n==="prepare_recoverable_dms_batch_draft")).toHaveLength(3);
  expect(m.rpc.mock.calls).toEqual(Array.from({length:3},()=>["prepare_recoverable_dms_batch_draft",{p_session:17}]));
 });
 it.each(["zero","duplicate","wrong-id","wrong-marker","wrong-state","missing","40003","08007","throw"])("claim %s outcome never dispatches or retries",async kind=>{
  const returned={id:17,batch_draft_operation_id:durableOperation,intake_status:"ocr_processing"};
  claimResult=kind==="throw"?Error("W22_PRIVATE_MESSAGE"):kind==="40003"||kind==="08007"?{data:null,error:{code:kind,message:"W22_PRIVATE_MESSAGE",details:"W22_PRIVATE_DETAILS",hint:"W22_PRIVATE_HINT"}}:{data:kind==="zero"?[]:kind==="duplicate"?[returned,returned]:kind==="missing"?null:[{...returned,...(kind==="wrong-id"?{id:99}:kind==="wrong-marker"?{batch_draft_operation_id:contract.operationId}:{intake_status:"uploaded"})}],error:null};
  const result=await (await real()).startAiIntakeFromUploadSession(input);
  expect(result).toMatchObject({success:false});expect(JSON.stringify(result)).not.toMatch(/W22_PRIVATE/);noPipeline();
  expect(operations.filter(o=>o.action==="update")).toHaveLength(1);expect(ai.log).not.toHaveBeenCalled();
 });
 it.each(["42501","40003","foreign","marker","scope","admission-operation","admission-fingerprint","sealed","throw"])("fresh ordinary postclaim %s gate blocks provider",async kind=>{
  postGuard=kind==="throw"?Error("W22_PRIVATE"):kind==="42501"||kind==="40003"?{data:null,error:{code:kind,message:"W22_PRIVATE"}}:{data:kind==="sealed"?durablePrepare():{...durablePrepare("analysis_required",true),...(kind==="foreign"?{profile_id:99}:kind==="scope"?{owning_company_id:99}:kind==="admission-operation"?{admission_operation_id:durableOperation}:kind==="admission-fingerprint"?{admission_fingerprint:"b".repeat(64)}:{member:{...durableMember("analysis_required",true),draft_operation_id:contract.operationId}})},error:null};
  const result=await (await real()).startAiIntakeFromUploadSession(input);
  expect(result).toMatchObject({success:false});expect(JSON.stringify(result)).not.toContain("W22_PRIVATE");noPipeline();expect(row.intake_status).toBe("ocr_processing");expect(prepareCount).toBe(2);expect(ai.log).not.toHaveBeenCalled();
 });
 it.each(["2026-10-05T00:00:00.000Z",new Date().toISOString(),null,"bad"])("processing timestamp %s never sweeps or restarts modern work",async updated_at=>{
  row.intake_status="ocr_processing";row.updated_at=updated_at;
  expect(await (await real()).startAiIntakeFromUploadSession(input)).toMatchObject({success:true,data:{status:"already_processing"}});
  noPipeline();expect(ai.factory).not.toHaveBeenCalled();expect(operations.every(o=>o.action==="read")).toBe(true);
 });
 it.each(["failed","missing","invalid","foreign"])("modern unsafe source %s fails before provider/claim",async kind=>{
  if(kind==="failed")row.intake_status="failed";if(kind==="missing")delete row.batch_draft_operation_id;if(kind==="invalid")row.batch_draft_operation_id="bad";if(kind==="foreign")row.uploaded_by=99;
  expect(await (await real()).startAiIntakeFromUploadSession(input)).toMatchObject({success:false});noPipeline();expect(ai.factory).not.toHaveBeenCalled();expect(operations.every(o=>o.action==="read")).toBe(true);
 });
 it("unconfigured modern provider leaves uploaded without unclaimed failed status/audit",async()=>{
  ai.configured.mockReturnValue(false);
  expect(await (await real()).startAiIntakeFromUploadSession(input)).toMatchObject({success:false,data:{status:"provider_not_configured"}});
  noPipeline();expect(row.intake_status).toBe("uploaded");expect(operations.every(o=>o.action==="read")).toBe(true);
 });
 it.each(["uploaded","ocr_processing","failed","review_pending","missing","hidden"])("direct retry %s cannot reset modern/unknown provenance",async state=>{
  row.intake_status=state;if(state==="missing")delete row.batch_draft_operation_id;
  if(state==="hidden")hidden=true;
  expect(await (await real()).retryAiIntake(17)).toMatchObject({success:false});noPipeline();expect(ai.factory).not.toHaveBeenCalled();expect(operations.every(o=>o.action==="read")).toBe(true);
  expect(operations).toHaveLength(1);expect(operations[0]).toMatchObject({table:"dms_upload_sessions",action:"read",selection:"batch_draft_operation_id",filters:{id:17,deleted_at:null}});
 });
 it("explicit NULL legacy reset keeps original payload with a NULL database predicate",async()=>{
  row.batch_draft_operation_id=null;ai.configured.mockReturnValue(false);
  await (await real()).retryAiIntake(17);
  const reset=operations.find(o=>o.payload?.intake_status==="uploaded");
  expect(reset).toMatchObject({table:"dms_upload_sessions",filters:{id:17,batch_draft_operation_id:null},payload:{intake_status:"uploaded",review_status:"not_started",ai_result_id:null,updated_at:expect.any(String)}});
  expect(m.rpc).not.toHaveBeenCalled();expect(ai.factory).toHaveBeenCalledOnce();expect(m.download).not.toHaveBeenCalled();
 });
 it("committed claim with lost response never reads back ownership, resets or dispatches",async()=>{
  claimResult="committed-lost";
  expect(await (await real()).startAiIntakeFromUploadSession(input)).toEqual({success:false,error:"Analysis start is unconfirmed. Retain this batch for reconciliation."});
  expect(row.intake_status).toBe("ocr_processing");noPipeline();expect(operations.map(o=>o.action)).toEqual(["read","update"]);expect(m.rpc.mock.calls).toEqual([["prepare_recoverable_dms_batch_draft",{p_session:17}]]);
 });
 it("initial provenance-read transport failure is safe before modern/legacy is known",async()=>{
  const query=read(null);query.single.mockRejectedValue(Error("W22_PRIVATE_SOURCE"));m.from.mockReturnValue(query);
  expect(await (await real()).startAiIntakeFromUploadSession(input)).toEqual({success:false,error:"Analysis start is unconfirmed. Retain this batch for reconciliation."});noPipeline();expect(ai.factory).not.toHaveBeenCalled();
 });
 it.each(["denied","sealed","ai_processing"])("initial governed %s stops before configuration/claim",async kind=>{
  if(kind==="ai_processing")row.intake_status="ai_processing";
  else m.rpc.mockResolvedValue(kind==="denied"?{data:null,error:{code:"42501",message:"W22_PRIVATE"}}:{data:durablePrepare(),error:null});
  const result=await (await real()).startAiIntakeFromUploadSession(input);
  expect(result).toMatchObject(kind==="denied"?{success:false}:{success:true,data:{status:kind==="sealed"?"review_pending":"already_processing"}});noPipeline();expect(ai.factory).not.toHaveBeenCalled();expect(operations.map(o=>o.action)).toEqual(["read"]);
  expect(m.rpc.mock.calls).toEqual([["prepare_recoverable_dms_batch_draft",{p_session:17}]]);
 });
 it("explicit NULL aged legacy processing preserves existing sweeper and pipeline",async()=>{
  row.batch_draft_operation_id=null;row.intake_status="ocr_processing";
  expect(await (await real()).startAiIntakeFromUploadSession(input)).toMatchObject({success:true,data:{status:"review_pending"}});
  expect(operations).toContainEqual(expect.objectContaining({table:"dms_ai_extraction_jobs",action:"update",payload:expect.objectContaining({status:"failed",error_message:"Stale run — superseded by a new AI Fill request"})}));
  expect(ai.analyze).toHaveBeenCalledOnce();expect(m.rpc).not.toHaveBeenCalled();expect(ai.warn).toHaveBeenCalledOnce();
 });
 it("actual durable wrapper delegates one real start; unconfirmed claim never consumes",async()=>{
  claimResult="committed-lost";
  const baseRpc=m.rpc.getMockImplementation()!;
  m.rpc.mockImplementation((name:string,...args:unknown[])=>name==="dms_upload_batch_eligibility"?Promise.resolve({data:{eligible:true,positions:[0]},error:null}):baseRpc(name,...args));
  m.analysis.mockImplementation((value)=>real().then(module=>module.startAiIntakeFromUploadSession(value)));
  m.info.mockResolvedValue({data:{id:"00000000-0000-4000-8000-000000000020",version:"v1",name:row.temp_storage_path,bucketId:"dms-temp",size:1},error:null});
  m.download.mockReturnValue({asStream:async()=>({data:new ReadableStream({start(c){c.enqueue(new Uint8Array([120]));c.close();}}),error:null})});
  m.admin.mockReturnValue({storage:{from:()=>({info:m.info,download:m.download})}});
  const result=await prepareDmsUploadBatchMemberDraft({request:durableRequest,position:0});
  expect(result).toMatchObject({success:false,code:"unconfirmed",uncertain:true});expect(result).not.toHaveProperty("receipt");expect(m.analysis).toHaveBeenCalledExactlyOnceWith(input);
  expect(row.intake_status).toBe("ocr_processing");expect(ai.analyze).not.toHaveBeenCalled();expect(m.audit).not.toHaveBeenCalled();expect(m.download).toHaveBeenCalledOnce();
  expect(m.rpc.mock.calls.some(([name])=>name==="create_numbered_dms_batch_draft")).toBe(false);
 });
 it.each(["provider","result-write","extraction","empty-extraction"])("modern %s diagnostics never leak to response/log/persisted error",async boundary=>{
  if(boundary==="provider")ai.analyze.mockRejectedValue(Error("W22_PRIVATE_PROVIDER"));
  if(boundary==="result-write")resultWriteError=true;
  if(boundary==="extraction")ai.extract.mockRejectedValue(Error("W22_PRIVATE_EXTRACTION"));
  if(boundary==="empty-extraction")ai.extract.mockResolvedValue({text:"",images:[],method:"offline-empty"});
  const result=await (await real()).startAiIntakeFromUploadSession(input);
  expect(result.success).toBe(false);
  const unreadable = boundary==="extraction" || boundary==="empty-extraction";
  expect(ai.analyze).toHaveBeenCalledTimes(unreadable?0:1);
  if(unreadable){expect(ai.usage).not.toHaveBeenCalled();expect(operations.filter(o=>o.action==="insert")).toHaveLength(0);expect(row.intake_status).toBe("failed");}
  expect(JSON.stringify({result,operations,usage:ai.usage.mock.calls,info:ai.log.mock.calls,warn:ai.warn.mock.calls,error:ai.error.mock.calls})).not.toContain("W22_PRIVATE");
  expect(operations.filter(o=>o.payload?.intake_status==="ocr_processing")).toHaveLength(1);
 });
});


describe("W22 durable ordinary read and preparation",()=>{
 const origin={authUserId:durableAuth,profileId:5};
 let preparation:unknown;
 let recovery:unknown;
 let current:BatchReceipt;
 const storageInfo=()=>({id:"00000000-0000-4000-8000-000000000020",version:"v1",name:current.members[0].path,bucketId:"dms-temp",size:1});
 beforeEach(()=>{
  current=durableReceipt();preparation=durablePrepare();recovery=durableRecovery();
  m.auth.mockResolvedValue({profile:{id:5,auth_user_id:durableAuth},isAccountActive:true});
  m.usable.mockReturnValue(true);
  m.rpc.mockImplementation(async(name:string)=>{
   if(name==="read_dms_upload_batch_admission")return {data:structuredClone(current),error:null};
   if(name==="read_dms_batch_draft_recovery")return {data:structuredClone(recovery),error:null};
   if(name==="prepare_recoverable_dms_batch_draft")return {data:structuredClone(preparation),error:null};
   if(name==="dms_upload_batch_eligibility")return {data:{eligible:true,positions:[0]},error:null};
   throw Error("unexpected business RPC");
  });
  m.info.mockImplementation(async()=>({data:storageInfo(),error:null}));
  m.download.mockReturnValue({asStream:async()=>({data:new ReadableStream({start(c){c.enqueue(new Uint8Array([120]));c.close();}}),error:null})});
  m.admin.mockReturnValue({storage:{from:()=>({info:m.info,download:m.download,createSignedUploadUrl:m.sign})}});
 });
 it.each(["prepared","unprepared","historical"] as const)("complete %s recovery is read-only, not consumed",async kind=>{
  recovery={...durableAnchors(),members:[durableMember(kind)]};
  const result=await readDmsUploadBatchDraftRecovery(durableRequest);
  expect(result).toEqual({success:true,receipt:current,recovery});
  expect(durable.batchDraftRecoveryResultSchema.safeParse(result).success).toBe(true);
  expect(m.rpc.mock.calls).toEqual([["read_dms_upload_batch_admission",{p_operation:contract.operationId}],["read_dms_batch_draft_recovery",{p_admission_operation:contract.operationId}],["read_dms_upload_batch_admission",{p_operation:contract.operationId}]]);
  expect(m.admin).not.toHaveBeenCalled();expect(m.analysis).not.toHaveBeenCalled();expect(m.cache).not.toHaveBeenCalled();expect(m.audit).not.toHaveBeenCalled();
 });
 it.each([{auth_user_id:contract.operationId},{profile_id:99},{batch_id:99},{owning_company_id:99},{owning_branch_id:null},{admission_operation_id:durableOperation},{admission_fingerprint:"b".repeat(64)},{members:[]},{extra:true}])("rejects complete-envelope mutation %j without partial data",async change=>{
  recovery={...durableRecovery(),...change};const result=await readDmsUploadBatchDraftRecovery(durableRequest);
  expect(result).toMatchObject({success:false,code:"unconfirmed",uncertain:true});expect(result).not.toHaveProperty("receipt");expect(result).not.toHaveProperty("recovery");expect(m.admin).not.toHaveBeenCalled();
 });
 it.each([{upload_session_id:99},{position:1},{session_code:"E".repeat(32)},{draft_operation_id:null},{draft_operation_id:durableOperation.toUpperCase()},{request:{uploadSessionId:17,allowDuplicate:true}},{request:{uploadSessionId:17,allowDuplicate:false,prepared:{...snapshot,batch_id:6,session_code:"D".repeat(32),party_id:99}}}])("rejects member/source/scope binding %j",async change=>{
  recovery={...durableAnchors(),members:[{...durableMember(),...change}]};
  expect(await readDmsUploadBatchDraftRecovery(durableRequest)).toMatchObject({success:false});expect(m.analysis).not.toHaveBeenCalled();
 });
 it("pure parser rejects mixed, duplicate, missing-null and hidden sentinel graphs",()=>{
  const historical=durableMember("historical");
  for(const raw of [{...durableRecovery(),members:[durableMember(),{...historical,position:1,upload_session_id:18,session_code:"E".repeat(32)}]},{...durableRecovery(),members:[durableMember(),{...durableMember(),position:1,upload_session_id:18,session_code:"E".repeat(32)}]},{...durableRecovery(),owning_branch_id:undefined},{...durableRecovery(),members:[{...historical,request:input}]},{...durableRecovery(),members:[{kind:"hidden"}]}])expect(durable.batchDraftRecoveryEnvelopeSchema.safeParse(raw).success).toBe(false);
  expect(durable.parseBatchDraftRecovery(durableRecovery(),current,{...origin,profileId:99})).toBeNull();
 });
 it.each(["read","prepare"] as const)("maps exact numbered failures and unknowns for %s without diagnostic leaks",async stage=>{
  for(const [code,expected,uncertain] of [["42501","unavailable",false],["PT409","conflict",false],["23505","conflict",false],["22023","rejected",false],["40000","rejected",false],["40001","rejected",false],["40002","rejected",false],["40P01","rejected",false],["P0001","rejected",false],["40003","unconfirmed",true],["08007","unconfirmed",true],["55P03","unconfirmed",true],["57014","unconfirmed",true],["40001\n","unconfirmed",true],[40001,"unconfirmed",true]] as const){
   m.rpc.mockImplementation(async(name:string)=>name==="read_dms_upload_batch_admission"?{data:current,error:null}:{data:null,error:{code,message:"W22_PRIVATE_MESSAGE",details:"W22_PRIVATE_DETAILS",hint:"W22_PRIVATE_HINT"}});
   const result=stage==="read"?await readDmsUploadBatchDraftRecovery(durableRequest):await prepareDmsUploadBatchMemberDraft({request:durableRequest,position:0});
   expect(result).toMatchObject({success:false,code:expected,uncertain});expect(JSON.stringify(result)).not.toMatch(/W22_PRIVATE/);expect(result).not.toHaveProperty("receipt");
  }
  expect(m.analysis).not.toHaveBeenCalled();expect(m.admin).not.toHaveBeenCalled();
 });
 it.each(["read","prepare"] as const)("rejects malformed selectors and current-origin loss for %s",async stage=>{
  const invoke=(request:BatchRequest)=>stage==="read"?readDmsUploadBatchDraftRecovery(request):prepareDmsUploadBatchMemberDraft({request,position:0});
  expect(await invoke({...durableRequest,actor:5} as BatchRequest)).toMatchObject({success:false});expect(m.rpc).not.toHaveBeenCalled();
  m.auth.mockResolvedValueOnce({profile:{id:5,auth_user_id:durableAuth}}).mockResolvedValue({profile:{id:99,auth_user_id:durableAuth}});
  expect(await invoke(durableRequest)).toMatchObject({success:false});expect(m.admin).not.toHaveBeenCalled();
 });
 it("bound prepared and processing results bypass bytes/provider; exact existing seal retained",async()=>{
  for(const value of [durablePrepare(),durablePrepare("analysis_required",true)]){
   preparation=value;
   expect(await prepareDmsUploadBatchMemberDraft({request:durableRequest,position:0})).toEqual({success:true,receipt:current,preparation:value});
  }
  expect(m.admin).not.toHaveBeenCalled();expect(m.analysis).not.toHaveBeenCalled();
  expect(m.rpc.mock.calls.filter(([n])=>n==="prepare_recoverable_dms_batch_draft")).toEqual([["prepare_recoverable_dms_batch_draft",{p_session:17}],["prepare_recoverable_dms_batch_draft",{p_session:17}]]);
 });
 it("bytes then second ordinary prepare then AI then rebind+prepare; never consumes",async()=>{
  preparation=durablePrepare("analysis_required",false);
  m.analysis.mockImplementation(async()=>{preparation=durablePrepare();return {success:true,data:{sessionCode:"D".repeat(32),status:"review_pending"}};});
  expect(await prepareDmsUploadBatchMemberDraft({request:durableRequest,position:0})).toEqual({success:true,receipt:current,preparation:durablePrepare()});
  expect(m.analysis).toHaveBeenCalledExactlyOnceWith({uploadSessionId:17,allowDuplicate:false});expect(m.sign).not.toHaveBeenCalled();
  const prepares=m.rpc.mock.calls.flatMap(([name],i)=>name==="prepare_recoverable_dms_batch_draft"?[m.rpc.mock.invocationCallOrder[i]]:[]);
  expect(prepares).toHaveLength(3);expect(prepares[0]).toBeLessThan(m.download.mock.invocationCallOrder[0]);expect(m.download.mock.invocationCallOrder[0]).toBeLessThan(prepares[1]);expect(prepares[1]).toBeLessThan(m.analysis.mock.invocationCallOrder[0]);expect(m.analysis.mock.invocationCallOrder[0]).toBeLessThan(prepares[2]);
  expect(m.rpc.mock.calls.some(([n])=>n==="create_numbered_dms_batch_draft"||n==="admit_dms_upload_batch")).toBe(false);
 });
 it.each(["prepared","processing"])("a %s outcome after bytes suppresses AI",async kind=>{
  preparation=durablePrepare("analysis_required",false);
  m.download.mockImplementation(()=>{preparation=kind==="prepared"?durablePrepare():durablePrepare("analysis_required",true);return {asStream:async()=>({data:new ReadableStream({start(c){c.enqueue(new Uint8Array([120]));c.close();}}),error:null})};});
  expect(await prepareDmsUploadBatchMemberDraft({request:durableRequest,position:0})).toMatchObject({success:true});expect(m.analysis).not.toHaveBeenCalled();
 });
 it.each(["absent","failed","throw","coded-throw","malformed","wrong-code"])("unconfirmed byte/AI %s keeps original identity and never consumes",async kind=>{
  preparation=durablePrepare("analysis_required",false);
  if(kind==="absent")m.info.mockResolvedValue({data:null,error:{status:404,statusCode:"NoSuchKey"}});
  if(kind==="failed")m.analysis.mockResolvedValue({success:false,error:"W22_PRIVATE"});
  if(kind==="throw")m.analysis.mockRejectedValue(Error("W22_PRIVATE"));
  if(kind==="coded-throw")m.analysis.mockRejectedValue({code:"40001",message:"W22_PRIVATE"});
  if(kind==="malformed")m.analysis.mockResolvedValue({success:true});
  if(kind==="wrong-code")m.analysis.mockResolvedValue({success:true,data:{sessionCode:"foreign",status:"review_pending"}});
  const result=await prepareDmsUploadBatchMemberDraft({request:durableRequest,position:0});
  expect(result).toMatchObject({success:false,code:"unconfirmed",uncertain:true});expect(JSON.stringify(result)).not.toContain("W22_PRIVATE");
  expect(result).not.toHaveProperty("receipt");expect(result).not.toHaveProperty("preparation");expect(m.analysis).toHaveBeenCalledTimes(kind==="absent"?0:1);
  if(kind!=="absent")expect(m.analysis).toHaveBeenCalledWith({uploadSessionId:17,allowDuplicate:false});
  expect(m.rpc.mock.calls.some(([n])=>n==="create_numbered_dms_batch_draft")).toBe(false);expect(m.sign).not.toHaveBeenCalled();
 });
 it("modern provenance cannot enter the legacy unprepared bridge; missing also denies",async()=>{
  for(const marker of [durableOperation,undefined]){
   m.from.mockReturnValue(read({batch_draft_operation_id:marker}));
   expect(await call(input,contract)).toMatchObject({success:false});expect(m.analysis).not.toHaveBeenCalled();expect(m.rpc).not.toHaveBeenCalled();
  }
 });

 it("valid two-member governed graph binds all sources and rejects only-duplicate operation or omission",async()=>{
  const first=durableMember();
  const second={...durableMember("unprepared"),position:1,upload_session_id:18,session_code:"E".repeat(32),draft_operation_id:"bbbbbbbb-0000-4000-8000-000000000003",request:{uploadSessionId:18,allowDuplicate:false}};
  const pair={...durableAnchors(),members:[first,second]};
  const r={...current,manifest:{...current.manifest,files:[current.manifest.files[0],{...current.manifest.files[0],position:1}]},members:[current.members[0],{...current.members[0],position:1,id:18,code:"E".repeat(32),path:"sessions/"+"E".repeat(32)+"/a.pdf"}]};
  expect(durable.batchDraftRecoveryEnvelopeSchema.safeParse(pair).success).toBe(true);
  expect(durable.parseBatchDraftRecovery(pair,r,origin)).toEqual(pair);
  expect(durable.batchDraftRecoveryEnvelopeSchema.safeParse({...pair,members:[first,{...second,draft_operation_id:durableOperation}]}).success).toBe(false);
  expect(durable.parseBatchDraftRecovery({...pair,members:[first]},r,origin)).toBeNull();
 });
 it.each(["read","prepare"] as const)("same-principal final admission denial or immutable drift withholds %s data",async stage=>{
  for(const outcome of ["denied","drift"]){
   const initial=current;let durableSeen=false;
   m.rpc.mockImplementation(async(name:string)=>{
    if(name==="read_dms_upload_batch_admission")return durableSeen?(outcome==="denied"?{data:null,error:{code:"42501"}}:{data:{...initial,batch_id:99},error:null}):{data:initial,error:null};
    durableSeen=true;return {data:stage==="read"?durableRecovery():durablePrepare(),error:null};
   });
   const result=stage==="read"?await readDmsUploadBatchDraftRecovery(durableRequest):await prepareDmsUploadBatchMemberDraft({request:durableRequest,position:0});
   expect(result).toMatchObject({success:false});expect(result).not.toHaveProperty("receipt");expect(result).not.toHaveProperty(stage==="read"?"recovery":"preparation");expect(m.analysis).not.toHaveBeenCalled();expect(m.admin).not.toHaveBeenCalled();
  }
 });
 it.each([{position:1},{upload_session_id:18},{draft_operation_id:undefined},{request:{uploadSessionId:17,allowDuplicate:false,prepared:{...snapshot,session_code:"D".repeat(32),batch_id:6,owning_branch_id:99}}}])("preparation member mutation %j cannot escape binding",async change=>{
  preparation={...durablePrepare(),member:{...durableMember(),...change}};
  expect(await prepareDmsUploadBatchMemberDraft({request:durableRequest,position:0})).toMatchObject({success:false,uncertain:true});expect(m.admin).not.toHaveBeenCalled();expect(m.analysis).not.toHaveBeenCalled();
 });
 it.each(["40003","08007"])("durable unknown %s then known then explicit success preserves exact tuples",async code=>{
  for(const stage of ["read","prepare"]){
   const business=stage==="read"?"read_dms_batch_draft_recovery":"prepare_recoverable_dms_batch_draft";
   let attempt=0;const start=m.rpc.mock.calls.length;
   m.rpc.mockImplementation(async(name:string)=>{
    if(name==="read_dms_upload_batch_admission")return {data:current,error:null};
    attempt++;return attempt<3?{data:null,error:{code:attempt===1?code:"40001"}}:{data:stage==="read"?durableRecovery():durablePrepare(),error:null};
   });
   const invoke=()=>stage==="read"?readDmsUploadBatchDraftRecovery(durableRequest):prepareDmsUploadBatchMemberDraft({request:durableRequest,position:0});
   expect(await invoke()).toMatchObject({success:false,code:"unconfirmed",uncertain:true});expect(attempt).toBe(1);
   expect(await invoke()).toMatchObject({success:false,code:"rejected",uncertain:false});expect(attempt).toBe(2);
   expect(await invoke()).toMatchObject({success:true});expect(attempt).toBe(3);
   const calls=m.rpc.mock.calls.slice(start);const tuple=[business,stage==="read"?{p_admission_operation:contract.operationId}:{p_session:17}];
   expect(calls).toEqual([["read_dms_upload_batch_admission",{p_operation:contract.operationId}],tuple,["read_dms_upload_batch_admission",{p_operation:contract.operationId}],tuple,["read_dms_upload_batch_admission",{p_operation:contract.operationId}],tuple,["read_dms_upload_batch_admission",{p_operation:contract.operationId}]]);
  }
  expect(m.admin).not.toHaveBeenCalled();expect(m.analysis).not.toHaveBeenCalled();
 });
 it.each(["hidden","error"])("legacy bridge %s provenance is never inferred NULL",async kind=>{
  if(kind==="hidden")m.from.mockReturnValue(read(null));
  else {const query=read(null);query.single.mockResolvedValue({data:null,error:{code:"42501"}});m.from.mockReturnValue(query);}
  expect(await call(input,contract)).toMatchObject({success:false});expect(m.rpc).not.toHaveBeenCalled();expect(m.analysis).not.toHaveBeenCalled();
 });


 it.each(["read","prepare"] as const)("initial/final unknown admission remains unconfirmed for %s",async stage=>{
  for(const at of ["initial","final"]){
   for(const response of [{data:null,error:{code:"40003",message:"W22_PRIVATE"}},{data:null,error:{code:"08007",details:"W22_PRIVATE"}},{data:{...current,profile_id:99},error:null},{data:null,error:null}]){
    let durableSeen=false;
    m.rpc.mockImplementation(async(name:string)=>{
     if(name==="read_dms_upload_batch_admission")return at==="initial"||durableSeen?response:{data:current,error:null};
     durableSeen=true;return {data:stage==="read"?durableRecovery():durablePrepare(),error:null};
    });
    const result=stage==="read"?await readDmsUploadBatchDraftRecovery(durableRequest):await prepareDmsUploadBatchMemberDraft({request:durableRequest,position:0});
    expect(result).toMatchObject({success:false,code:"unconfirmed",uncertain:true});expect(result).not.toHaveProperty("receipt");expect(JSON.stringify(result)).not.toContain("W22_PRIVATE");
   }
  }
 });

 it("replayed consumer skips batch-summary mutation",async()=>{
  m.rpc.mockResolvedValue({data:{...receipt,replayed:true}});m.from.mockImplementation(()=>{throw Error("recompute must not run");});
  expect(await call({...prepared,prepared:{...snapshot,batch_id:6}},contract)).toMatchObject({success:true,data:{replayed:true}});
  expect(m.from).not.toHaveBeenCalled();expect(m.admin).not.toHaveBeenCalled();expect(m.audit).not.toHaveBeenCalled();
 });
});
