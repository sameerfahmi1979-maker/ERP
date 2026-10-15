import {beforeEach,expect,it,vi} from "vitest";
type Call={table:string;ops:[string,unknown[]][]};
const s=vi.hoisted(()=>({total:1107,mode:"ok",allowed:true,parent:true,calls:[] as Call[]}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@/lib/rbac/check",()=>({getAuthContext:async()=>({profile:{id:1},isAccountActive:true,roleCodes:[]}),hasPermission:()=>s.allowed}));
vi.mock("@/lib/logger",()=>({logger:{warn:vi.fn(),error:vi.fn(),info:vi.fn()}}));
vi.mock("@/server/actions/audit",()=>({logAudit:()=>{throw Error("No writes");}}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>{throw Error("Ordinary caller only");}}));
vi.mock("@/lib/dms/document-access",()=>({checkDocumentConfidentialityAccess:async()=>({allowed:s.allowed})}));
vi.mock("@/lib/dms/resolve-link-entity-display-name",()=>({resolveDmsLinkEntityDisplayNames:async()=>new Map(),formatDmsLinkEntityFallback:()=>"Synthetic"}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({from:(table:string)=>{
 const c:Call={table,ops:[]};s.calls.push(c);const q=new Proxy({}, {get:(_,key)=>key==="then"?(resolve:(r:unknown)=>unknown)=>{
  if(c.ops.some(([op])=>op==="maybeSingle"))return Promise.resolve({data:s.parent?{id:9}:null,error:null}).then(resolve);
  const [from,to]=(c.ops.filter(([op])=>op==="range").at(-1)?.[1]??[0,999]) as number[];
  const ids=c.ops.find(([op,args])=>op==="in"&&args[0]==="tag_id")?.[1][1] as number[]|undefined;
  const tagCounts=table==="dms_document_tags"&&!!ids;
  const rows=tagCounts?[]:Array.from({length:Math.min(to-from+1,Math.max(0,s.total-from))},(_,i)=>({id:from+i+1,document_id:9,tag_id:from+i+1,entity_id:1,entity_type:"employee",session_code:`SYN-${from+i+1}`,original_filename:"Synthetic.pdf",intake_status:"failed",document:null,ai_result:null}));
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
const readers=[reminders,getDmsDocumentMetadataValues,getMetadataDefinitionsForType,getDmsDocumentComments,getDmsDocumentEvents,getDmsDocumentFiles,getDmsDocumentVersions,getDmsDocumentLinks,getDmsDocumentTags,getDmsTags,getDmsTagSuggestions,getDmsLinkSuggestions,getDocumentApprovalHistory,getDmsUploadBatchDrafts];
beforeEach(()=>Object.assign(s,{total:1107,mode:"ok",allowed:true,parent:true,calls:[]}));
for(const read of readers){
 it(`${read.name} returns the complete 1107-row set with exact counts`,async()=>{const r=await read(9);expect(r.success).toBe(true);expect(r.data).toHaveLength(1107);const pages=s.calls.filter(c=>c.ops.some(([op])=>op==="range"));expect(pages.reduce((n,c)=>n+c.ops.filter(([op])=>op==="range").length,0)).toBeGreaterThanOrEqual(3);for(const c of pages)expect(c.ops.find(([op])=>op==="select")?.[1][1]).toEqual({count:"exact"});});
 it.each(["short","duplicate","null","error","late"])(`${read.name} rejects %s and never returns a partial set`,async mode=>{s.mode=mode;const r=await read(9);expect(r.success).toBe(false);expect(r.data).toBeUndefined();});
 it(`${read.name} preserves legitimate zero results`,async()=>{s.total=0;const r=await read(9);expect(r.success).toBe(true);expect(r.data).toEqual([]);});
}
it("batch drafts require the ordinary caller's parent visibility",async()=>{s.parent=false;expect((await getDmsUploadBatchDrafts(9)).error).toBe("Permission denied");expect(s.calls).toHaveLength(1);});
