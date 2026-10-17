import {beforeEach,expect,it,vi} from "vitest";
type Call={table:string;ops:[string,unknown[]][]};
const s=vi.hoisted(()=>({total:1107,mode:"ok",allowed:true,parent:true,calls:[] as Call[]}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@/lib/rbac/check",()=>({getAuthContext:async()=>({profile:{id:1},isAccountActive:true,roleCodes:[]}),hasPermission:()=>s.allowed,canUseApplication:()=>s.allowed}));
vi.mock("@/lib/logger",()=>({logger:{warn:vi.fn(),error:vi.fn(),info:vi.fn()}}));
vi.mock("@/server/actions/audit",()=>({logAudit:()=>{throw Error("No writes");}}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>{throw Error("Ordinary caller only");}}));
vi.mock("@/lib/dms/document-access",()=>({checkDocumentConfidentialityAccess:async()=>({allowed:s.allowed})}));
vi.mock("@/lib/dms/resolve-link-entity-display-name",()=>({resolveDmsLinkEntityDisplayNames:async()=>new Map(),formatDmsLinkEntityFallback:()=>"Synthetic"}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({rpc:async(name:string,args:unknown)=>{
 s.calls.push({table:name,ops:[["rpc",[args]]]});
 const values=Array.from({length:s.total},(_,i)=>({id:i+1,document_id:9,definition_id:i+1,value_text:"Synthetic",value_number:null,value_date:null,value_datetime:null,value_boolean:null,value_json:null}));
 if(s.mode==="lost-snapshot")throw Error("Synthetic lost snapshot response");
 return {data:s.mode==="null"?null:{documentId:9,snapshot:s.mode==="no-snapshot-proof"?undefined:"a".repeat(64),sourceSnapshot:null,values:s.mode==="foreign-snapshot"?values.map(v=>({...v,document_id:99})):values},error:s.mode==="error"?{code:"42501",message:"private"}:null};
},from:(table:string)=>{
 const c:Call={table,ops:[]};s.calls.push(c);const q=new Proxy({}, {get:(_,key)=>key==="then"?(resolve:(r:unknown)=>unknown)=>{
  if(c.ops.some(([op])=>op==="maybeSingle"))return Promise.resolve({data:s.parent?{id:9}:null,error:null}).then(resolve);
  const [from,to]=(c.ops.filter(([op])=>op==="range").at(-1)?.[1]??[0,999]) as number[];
  const ids=c.ops.find(([op,args])=>op==="in"&&args[0]==="tag_id")?.[1][1] as number[]|undefined;
  const tagCounts=table==="dms_document_tags"&&!!ids;
  const rows=tagCounts?[]:Array.from({length:Math.min(to-from+1,Math.max(0,s.total-from))},(_,i)=>({id:from+i+1,document_id:9,tag_id:from+i+1,entity_id:1,entity_type:"employee",session_code:`SYN-${from+i+1}`,original_filename:"Synthetic.pdf",intake_status:"failed",document:null,ai_result:null,event_type:"synthetic",description:null,performed_by:null,performed_at:"2026-10-17T10:00:00Z",metadata_json:{},performer:null}));
  return Promise.resolve({data:s.mode==="short"?rows.slice(0,1):s.mode==="duplicate"?rows.map(()=>rows[0]):rows,count:s.mode==="null"?null:tagCounts?0:s.total,error:s.mode==="error"||s.mode==="late"&&from>0?{message:"private"}:null}).then(resolve);
 }:(...args:unknown[])=>{c.ops.push([String(key),args]);return q;}});return q;
}})}));
import {getDmsDocumentComments} from "@/server/actions/dms/document-comments";
import {getDmsDocumentEvents} from "@/server/actions/dms/document-events";
import {getDmsDocumentFiles,getDmsDocumentVersions} from "@/server/actions/dms/document-files";
import {getDmsDocumentLinks} from "@/server/actions/dms/document-links";
import {getDmsDocumentTags} from "@/server/actions/dms/document-tags";
import {getDmsTags} from "@/server/actions/dms/tags";
import {getDmsTagSuggestions} from "@/server/actions/dms/ai-tags";
import {getDmsLinkSuggestions} from "@/server/actions/dms/ai-links";
import {getDocumentApprovalHistory} from "@/server/actions/dms/document-approvals";
import {getDmsUploadBatchDrafts} from "@/server/actions/dms/batch-intake";
import {getDmsDocumentMetadataValues,getMetadataDefinitionsForType} from "@/server/actions/dms/document-metadata-values";
import {getDmsExpiryReminders} from "@/server/actions/dms/expiry-reminders";
const reminders=()=>getDmsExpiryReminders({documentId:9});
// Metadata now arrives as one atomic server JSON snapshot, not row-capped
// PostgREST table pages. Keep all original paging/failure cases for paged reads;
// separately prove the full snapshot and its required review envelope below.
const readers=[reminders,getMetadataDefinitionsForType,getDmsDocumentComments,getDmsDocumentEvents,getDmsDocumentFiles,getDmsDocumentVersions,getDmsDocumentLinks,getDmsDocumentTags,getDmsTags,getDmsTagSuggestions,getDmsLinkSuggestions,getDocumentApprovalHistory,getDmsUploadBatchDrafts];
beforeEach(()=>Object.assign(s,{total:1107,mode:"ok",allowed:true,parent:true,calls:[]}));
for(const read of readers){
 it(`${read.name} returns the complete 1107-row set with exact counts`,async()=>{const r=await read(9);expect(r.success).toBe(true);expect(r.data).toHaveLength(1107);const pages=s.calls.filter(c=>c.ops.some(([op])=>op==="range"));expect(pages.reduce((n,c)=>n+c.ops.filter(([op])=>op==="range").length,0)).toBeGreaterThanOrEqual(3);for(const c of pages){const options=c.ops.find(([op])=>op==="select")?.[1][1] as {count?:string;head?:boolean};expect(options).toMatchObject({count:"exact"});expect(options.head??false).toBe(false);}});
 it.each(["short","duplicate","null","error","late"])(`${read.name} rejects %s and never returns a partial set`,async mode=>{s.mode=mode;const r=await read(9);expect(r.success).toBe(false);expect(r.data).toBeUndefined();});
 it(`${read.name} preserves legitimate zero results`,async()=>{s.total=0;const r=await read(9);expect(r.success).toBe(true);expect(r.data).toEqual([]);});
}
it("batch drafts require the ordinary caller's parent visibility",async()=>{s.parent=false;expect((await getDmsUploadBatchDrafts(9)).error).toBe("Permission denied");expect(s.calls).toHaveLength(1);});
it("metadata returns all 1107 values and their authoritative review snapshot through one ordinary RPC",async()=>{const r=await getDmsDocumentMetadataValues(9);expect(r.success).toBe(true);expect(r.data).toHaveLength(1107);expect(r.data?.at(-1)?.id).toBe(1107);expect(r.snapshot).toBe("a".repeat(64));expect(s.calls).toEqual([{table:"f07_metadata_operation",ops:[["rpc",[{p_action:"snapshot",p_data:{documentId:9}}]]]}]);});
it("metadata preserves a genuine empty snapshot without substituting unversioned data",async()=>{s.total=0;const r=await getDmsDocumentMetadataValues(9);expect(r).toMatchObject({success:true,data:[],snapshot:"a".repeat(64)});});
it.each([["no-snapshot-proof","missing authoritative snapshot"],["foreign-snapshot","foreign document values"],["null","missing result"],["error","denied snapshot"],["lost-snapshot","lost snapshot response"]])("metadata rejects %s (%s) without partial success",async mode=>{s.mode=mode;const r=await getDmsDocumentMetadataValues(9);expect(r.success).toBe(false);expect(r.data).toBeUndefined();});
