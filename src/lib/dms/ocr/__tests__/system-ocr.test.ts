import { beforeEach, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({route:vi.fn(),persist:vi.fn()}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({from:()=>{
  const q={select:()=>q,eq:()=>q,single:async()=>({data:{id:7,deleted_at:null},error:null})};return q;
},storage:{from:()=>({download:async()=>({data:new Blob(["synthetic"]),error:null})})}})}));
vi.mock("@/lib/dms/ai/factory",()=>({getDmsAiProvider:async()=>({provider:{isConfigured:()=>true}}),getAzureDocumentIntelligenceProvider:async()=>({provider:null})}));
vi.mock("../ocr-router",()=>({loadOcrFeatureFlags:async()=>({dmsOcr:true,dmsOcrRouter:true,dmsOcrAzure:false,dmsOcrGptVisionFallback:true}),routeOcr:state.route}));
vi.mock("../persist-file-ocr-result",()=>({persistFileOcrResult:state.persist}));
import { processDmsFileOcrSystem } from "../process-file-ocr";
const input={fileId:11,documentId:7,storageBucket:"dms-documents",storagePath:"synthetic/path",fileName:"synthetic.pdf",mimeType:"application/pdf"};
beforeEach(()=>{state.route.mockReset();state.persist.mockReset();state.route.mockResolvedValue({text:"اختبار TEST-6101",providerCode:"vision",model:"gpt-6.1-sol"});state.persist.mockResolvedValue({fileUpdated:true,documentUpdated:true,contentSynced:true,hasText:true,errors:[]});});
it("reports success only after all OCR persistence stages complete",async()=>{expect((await processDmsFileOcrSystem(input)).success).toBe(true);});
it.each(["fileUpdated","documentUpdated","contentSynced"])("reports retryable database failure when %s is false",async key=>{
  state.persist.mockResolvedValueOnce({fileUpdated:true,documentUpdated:true,contentSynced:true,hasText:true,errors:["safe failure"],[key]:false});
  expect(await processDmsFileOcrSystem(input)).toMatchObject({success:false,errorCode:"database_error",retryable:true});
});
it("does not persist unavailable/empty OCR as a completed file",async()=>{
  state.route.mockResolvedValueOnce({text:"",providerCode:"noop",model:null});expect(await processDmsFileOcrSystem(input)).toMatchObject({success:false,errorCode:"no_readable_text"});expect(state.persist).not.toHaveBeenCalled();
});
it("forwards explicit visual mode to the shared router",async()=>{
  await processDmsFileOcrSystem({...input,forceVision:true});expect(state.route).toHaveBeenCalledWith(expect.objectContaining({forceVision:true}));
});
