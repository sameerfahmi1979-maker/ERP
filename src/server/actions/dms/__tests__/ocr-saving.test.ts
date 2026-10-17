import { beforeEach, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({denied:false,statusError:false,zeroJob:false,persist:vi.fn(),route:vi.fn(),calls:[] as {table:string;values:Record<string,unknown>}[]}));
const client=vi.hoisted(()=>({from:(table:string)=>{
  let values:Record<string,unknown>|undefined;let textOnly=false;
  const result=()=>{
    if(state.statusError && table==="dms_document_files"&&!values)return {data:null,error:{message:"Synthetic read failed"}};
    if(table==="dms_documents")return {data:{id:7,ocr_status:"complete",ocr_text_available:true,ocr_last_run_at:null},error:null};
    if(table==="dms_document_files")return {data:textOnly?[{id:11}]:values?{id:11}:file,error:null};
    return {data:state.zeroJob&&values?.status==="completed"?null:{id:13},error:null};
  };
  const file={id:11,document_id:7,file_name:"synthetic.png",mime_type:"image/png",storage_bucket:"dms-documents",storage_path:"synthetic/path",ocr_status:"not_started",file_size_bytes:50};
  const query={select:()=>query,eq:()=>query,is:()=>query,not:()=>{textOnly=true;return query;},neq:()=>query,
    order:async()=>({data:[file],error:null}),single:async()=>result(),maybeSingle:async()=>result(),
    insert:(v:Record<string,unknown>)=>{values=v;state.calls.push({table,values:v});return query;},
    update:(v:Record<string,unknown>)=>{values=v;state.calls.push({table,values:v});return query;},
    then:(resolve:(r:ReturnType<typeof result>)=>unknown)=>Promise.resolve(result()).then(resolve)};
  return query;
},storage:{from:()=>({download:async()=>({data:new Blob(["synthetic"]),error:null})})}}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>client}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>client}));
vi.mock("@/lib/rbac/check",()=>({getAuthContext:async()=>({profile:{id:1}}),hasPermission:()=>!state.denied}));
vi.mock("@/server/actions/audit",()=>({logAudit:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@/lib/dms/review-queue/review-queue-upsert",()=>({upsertDmsReviewQueueItem:vi.fn(),isDmsAiReviewEnabled:async()=>false}));
vi.mock("@/lib/dms/ai/factory",()=>({getDmsAiProvider:async()=>({provider:{isConfigured:()=>true,modelId:"gpt-6.1-sol"}}),getAzureDocumentIntelligenceProvider:async()=>({provider:null})}));
vi.mock("@/lib/dms/ocr/ocr-router",()=>({loadOcrFeatureFlags:async()=>({dmsOcr:true,dmsOcrRouter:true,dmsOcrAzure:false,dmsOcrGptVisionFallback:true}),routeOcr:state.route}));
vi.mock("@/lib/dms/ocr/persist-file-ocr-result",()=>({persistFileOcrResult:state.persist}));
import { getDmsOcrStatus, triggerDmsOcrForFile } from "../ocr";
beforeEach(()=>{
  state.denied=false;state.statusError=false;state.zeroJob=false;state.calls=[];state.persist.mockReset();state.route.mockReset();
  state.persist.mockResolvedValue({fileUpdated:true,documentUpdated:true,contentSynced:true,hasText:true,errors:[]});
  state.route.mockResolvedValue({text:"اختبار TEST-6101",model:"gpt-6.1-sol",providerCode:"vision"});
});
it("reports completion only after file, document, content and job writes succeed",async()=>{
  const r=await triggerDmsOcrForFile({fileId:11});expect(r.success).toBe(true);expect(r.data?.status).toBe("complete");
  expect(state.calls.some(c=>c.table==="dms_ai_extraction_jobs"&&c.values.status==="completed")).toBe(true);
});
it.each(["fileUpdated","documentUpdated","contentSynced"])("does not mark completion after %s fails",async key=>{
  state.persist.mockResolvedValueOnce({fileUpdated:true,documentUpdated:true,contentSynced:true,hasText:true,[key]:false});
  const r=await triggerDmsOcrForFile({fileId:11});expect(r.success).toBe(false);expect(r.data?.status).toBe("failed");
  expect(state.calls.some(c=>c.table==="dms_ai_extraction_jobs"&&c.values.status==="completed")).toBe(false);
});
it("handles a thrown persistence failure without leaving a successful result",async()=>{
  state.persist.mockRejectedValueOnce(Error("synthetic secret"));const r=await triggerDmsOcrForFile({fileId:11});
  expect(r.success).toBe(false);expect(r.data?.status).toBe("failed");expect(r.error).not.toContain("synthetic secret");
});
it("does not claim a zero-row job update succeeded",async()=>{state.zeroJob=true;expect((await triggerDmsOcrForFile({fileId:11})).success).toBe(false);});
it("forwards explicit visual mode to the router",async()=>{
  await triggerDmsOcrForFile({fileId:11,forceVision:true});expect(state.route).toHaveBeenCalledWith(expect.objectContaining({forceVision:true}));
});
it("never saves an empty provider result as completed",async()=>{
  state.route.mockResolvedValueOnce({text:"",model:null,providerCode:"noop"});expect((await triggerDmsOcrForFile({fileId:11})).success).toBe(false);expect(state.persist).not.toHaveBeenCalled();
});
it("retains authorization checks and avoids all writes for denied callers",async()=>{
  state.denied=true;expect((await triggerDmsOcrForFile({fileId:11})).success).toBe(false);expect(state.calls).toHaveLength(0);expect(state.route).not.toHaveBeenCalled();
});
it("marks text availability without returning OCR body in a file-status response",async()=>{
  const r=await getDmsOcrStatus(7);expect(r.success).toBe(true);expect(r.data?.files[0].has_text).toBe(true);expect(r.data?.files[0]).not.toHaveProperty("ocr_text");
});
it("returns failed reads as errors, never successful empty lists",async()=>{
  state.statusError=true;const r=await getDmsOcrStatus(7);expect(r.success).toBe(false);expect(r.data).toBeUndefined();
});
