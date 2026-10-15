import {beforeEach,expect,it,vi} from "vitest";
const s=vi.hoisted(()=>({mode:"ok",allowed:true,total:1107,calls:[] as {table:string;ops:[string,unknown[]][]}[]}));
const database=vi.hoisted(()=>()=>({from:(table:string)=>{
 const c={table,ops:[] as [string,unknown[]][]};s.calls.push(c);
 const q=new Proxy({}, {get:(_,key)=>key==="then"?(resolve:(r:unknown)=>unknown)=>{
  if(c.ops.some(([op])=>op==="single"||op==="maybeSingle"))return Promise.resolve({data:{id:9,document_type_id:2,confidentiality_level:"internal"},error:null}).then(resolve);
  const [from,to]=(c.ops.find(([op])=>op==="range")?.[1]??[0,999]) as number[];
  const children=table==="dms_ai_metadata_apply_items";
  const total=children?0:s.total;
  const rows=Array.from({length:Math.min(to-from+1,Math.max(0,total-from))},(_,i)=>({id:from+i+1,document_id:9,ai_result_id:null,document_type_id:2,original_filename:"Synthetic.pdf"}));
  return Promise.resolve({data:s.mode==="short"?rows.slice(0,1):rows,count:s.mode==="null"?null:total,error:s.mode==="error"||s.mode==="late"&&from>0||s.mode==="child"&&children?{message:"Unavailable"}:null}).then(resolve);
 }:(...args:unknown[])=>{c.ops.push([String(key),args]);return q;}});return q;
}}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>database()}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>database()}));
vi.mock("@/lib/rbac/check",()=>({getAuthContext:async()=>({profile:{id:1},isAccountActive:true,roleCodes:[]}),hasPermission:()=>s.allowed}));
vi.mock("@/server/actions/audit",()=>({logAudit:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:()=>{throw Error("No mutation");}}));
import {getDmsAiExtractionResults,getDmsAiMetadataApplyHistory} from "@/server/actions/dms/ai-analysis";
import {getEligibleUploadSessionsForVersionLink} from "@/server/actions/dms/document-upload-attach";
const readers=[getDmsAiExtractionResults,getDmsAiMetadataApplyHistory,getEligibleUploadSessionsForVersionLink];
beforeEach(()=>{Object.assign(s,{mode:"ok",total:1107,allowed:true,calls:[]});});
for(const read of readers){
 it(read.name+" is complete beyond backend response and old preview caps",async()=>{const r=await read(9);expect(r.success).toBe(true);expect(r.data).toHaveLength(1107);});
 it.each(["short","null","error","late"])(read.name+" rejects %s without a partial history",async mode=>{s.mode=mode;const r=await read(9);expect(r.success).toBe(false);expect(r.data).toBeUndefined();});
 it(read.name+" preserves permission denial",async()=>{s.allowed=false;expect((await read(9)).success).toBe(false);expect(s.calls).toHaveLength(0);});
}
it("failed metadata history children are never reported as empty items",async()=>{s.mode="child";const r=await getDmsAiMetadataApplyHistory(9);expect(r.success).toBe(false);expect(r.data).toBeUndefined();});
