import { beforeEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
const sync=vi.hoisted(()=>vi.fn());
vi.mock("@/server/actions/dms/document-content",()=>({writeDocumentContentTextSystem:sync}));
import { persistFileOcrResult } from "../persist-file-ocr-result";
type Options={fileError?:boolean;fileMissing?:boolean;readError?:boolean;docError?:boolean;docMissing?:boolean;files?:{ocr_status:string;ocr_text:string|null}[]};
function database(options:Options={}){
  const writes:{table:string;values:Record<string,unknown>;filters:unknown[][]}[]=[];
  const from=vi.fn((table:string)=>{
    let values:Record<string,unknown>|undefined;const filters:unknown[][]=[];
    const result=()=>{
      if(values){const file=table==="dms_document_files";const missing=file?options.fileMissing:options.docMissing;
        return {data:missing?null:{id:file?11:7},error:(file?options.fileError:options.docError)?{message:"synthetic-private-content",code:"42501"}:null};}
      return {data:options.readError?null:options.files??[{ocr_status:"complete",ocr_text:"اختبار TEST-6101"}],error:options.readError?{message:"synthetic-private-content"}:null};
    };
    const query={update:vi.fn((v:Record<string,unknown>)=>{values=v;writes.push({table,values:v,filters});return query;}),
      select:vi.fn(()=>query),eq:vi.fn((...args:unknown[])=>{filters.push(args);return query;}),
      is:vi.fn((...args:unknown[])=>{filters.push(args);return query;}),maybeSingle:async()=>result(),
      then:(resolve:(r:ReturnType<typeof result>)=>unknown)=>Promise.resolve(result()).then(resolve)};
    return query;
  });return {client:{from} as unknown as SupabaseClient,writes,from};
}
const params={fileId:11,documentId:7,text:"اختبار TEST-6101",provider:"vision" as const,model:"gpt-6.1-sol",performedBy:1};
beforeEach(()=>{sync.mockReset();sync.mockResolvedValue({success:true,charCount:20,isTruncated:false});});
it("saves without the nonexistent file updated_at column and checks the exact active file/document binding",async()=>{
  const db=database();const r=await persistFileOcrResult({...params,supabase:db.client});
  expect(r).toMatchObject({fileUpdated:true,documentUpdated:true,contentSynced:true,errors:[]});
  expect(db.writes[0].values).not.toHaveProperty("updated_at");
  expect(db.writes[0].filters).toEqual([["id",11],["document_id",7],["deleted_at",null]]);
  expect(db.writes[0].values).toMatchObject({ocr_text:params.text,ocr_status:"complete",ocr_model:"gpt-6.1-sol"});
  expect(db.writes[1].values).toMatchObject({ocr_text_available:true,ocr_status:"complete"});
});
it.each([{fileError:true},{fileMissing:true}])("does not publish document content/status after a rejected or zero-row file write: %j",async options=>{
  const db=database(options);const r=await persistFileOcrResult({...params,supabase:db.client});
  expect(r.fileUpdated).toBe(false);expect(db.from).toHaveBeenCalledTimes(1);expect(sync).not.toHaveBeenCalled();
  expect(r.errors.join()).not.toContain("synthetic-private-content");
});
it("does not turn a failed file-summary read into an empty successful document",async()=>{
  const db=database({readError:true});const r=await persistFileOcrResult({...params,supabase:db.client});
  expect(r).toMatchObject({fileUpdated:true,documentUpdated:false,contentSynced:false});expect(db.writes).toHaveLength(1);expect(sync).not.toHaveBeenCalled();
});
it.each([{docError:true},{docMissing:true}])("rejects failed or zero-row document synchronization: %j",async options=>{
  const r=await persistFileOcrResult({...params,supabase:database(options).client});
  expect(r.documentUpdated).toBe(false);expect(sync).not.toHaveBeenCalled();
});
it("reports a consolidated-content write failure, not full success",async()=>{
  sync.mockResolvedValueOnce({success:false,error:"synthetic-private-content"});
  const r=await persistFileOcrResult({...params,supabase:database().client});
  expect(r.contentSynced).toBe(false);expect(r.errors).toHaveLength(1);expect(r.errors.join()).not.toContain("synthetic-private-content");
});
it("recomputes summary from other active files, including processing/failed status",async()=>{
  const db=database({files:[{ocr_status:"complete",ocr_text:params.text},{ocr_status:"processing",ocr_text:null},{ocr_status:"failed",ocr_text:null}]});
  await persistFileOcrResult({...params,supabase:db.client});expect(db.writes[1].values.ocr_status).toBe("processing");
});
it("can be retried with the same text and stable file identity",async()=>{
  const db=database();await persistFileOcrResult({...params,supabase:db.client});await persistFileOcrResult({...params,supabase:db.client});
  expect(db.writes.filter(w=>w.table==="dms_document_files").map(w=>w.values.ocr_text)).toEqual([params.text,params.text]);
});
