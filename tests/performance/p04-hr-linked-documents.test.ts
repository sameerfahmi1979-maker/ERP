import {beforeEach,expect,it,vi} from "vitest";
const s=vi.hoisted(()=>({active:true,view:true,subject:true,dependent:true,allowed:true,fail:false,short:false,drift:false,duplicate:false,rows:[] as Record<string,unknown>[],calls:[] as {table:string;projection?:string;filters:unknown[][];from:number;to:number;signal?:AbortSignal}[]}));
vi.mock("@/server/reads/read-context",()=>({getReadAuthContext:async()=>({})}));
vi.mock("@/lib/rbac/scope",()=>({canUseApplication:()=>s.active,hasPermission:()=>s.view}));
vi.mock("@/server/reads/hr-subject-access",()=>({hrSubjectPermission:async()=>s.allowed}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({from:(table:string)=>{
 const c:typeof s.calls[number]={table,filters:[],from:0,to:499};s.calls.push(c);
 const q={select:(projection:string)=>{c.projection=projection;return q;},eq:(...a:unknown[])=>{c.filters.push(["eq",...a]);return q;},is:(...a:unknown[])=>{c.filters.push(["is",...a]);return q;},order:()=>q,abortSignal:(signal:AbortSignal)=>{c.signal=signal;return q;},maybeSingle:()=>q,range:(from:number,to:number)=>{c.from=from;c.to=to;return q;},then:(resolve:(r:unknown)=>unknown)=>{
  const data=s.rows.slice(c.from,c.to+1-(s.short?1:0));if(s.duplicate&&c.from>0&&data.length)data[0]=s.rows[0]!;
  return Promise.resolve(table==="dms_document_links"?{data,count:s.rows.length+(s.drift&&c.from>0?1:0),error:s.fail?{}:null}:{data:(table==="employees"?s.subject:s.dependent)?{id:7}:null,error:null}).then(resolve);
 }};return q;
}})}));
import {readHrLinkedDocuments} from "@/server/reads/hr-linked-documents";
const row=(id:number)=>({id,document_id:id+2000,document:{id:id+2000,document_no:`TEST-${id}`,title:`Synthetic ${id}`,status:"active",expiry_date:null,deleted_at:null,document_type:{name_en:"Test"}}});
beforeEach(()=>Object.assign(s,{active:true,view:true,subject:true,dependent:true,allowed:true,fail:false,short:false,drift:false,duplicate:false,rows:Array.from({length:1107},(_,i)=>row(i+1)),calls:[]}));
it("returns all 1107 authorized links through count-checked pages, not the first 1000",async()=>{
 const r=await readHrLinkedDocuments({employeeId:7});expect(r.success).toBe(true);expect(r.data?.rows).toHaveLength(1107);expect(r.data?.rows.at(-1)?.link_id).toBe(1107);
 expect(s.calls.filter(c=>c.table==="dms_document_links").map(c=>c.from)).toEqual([0,500,1000]);
 for(const c of s.calls.filter(c=>c.table==="dms_document_links")){expect(c.filters).toContainEqual(["eq","entity_id",7]);expect(c.filters).toContainEqual(["eq","entity_type","employee"]);expect(c.projection).not.toMatch(/storage|path|ocr|extraction/);expect(c.signal).toBeInstanceOf(AbortSignal);}
});
it.each(["active","view","subject","allowed"]as const)("denies %s before documents",async key=>{
 s[key]=false;expect(await readHrLinkedDocuments({employeeId:7})).toEqual({success:false,error:"Permission denied"});expect(s.calls.some(c=>c.table==="dms_document_links")).toBe(false);
});
it("binds the dependent to its employee before reading links",async()=>{
 s.dependent=false;expect((await readHrLinkedDocuments({employeeId:7,dependentId:99})).success).toBe(false);expect(s.calls.at(-1)?.filters).toContainEqual(["eq","employee_id",7]);expect(s.calls.some(c=>c.table==="dms_document_links")).toBe(false);
 s.dependent=true;s.calls=[];expect((await readHrLinkedDocuments({employeeId:7,dependentId:99})).success).toBe(true);expect(s.calls.at(-1)?.filters).toContainEqual(["eq","entity_id",99]);expect(s.calls.at(-1)?.filters).toContainEqual(["eq","entity_type","employee_dependent"]);
});
it.each(["fail","short","drift","duplicate"]as const)("rejects %s rather than returning a partial success",async key=>{s[key]=true;expect((await readHrLinkedDocuments({employeeId:7})).success).toBe(false);});
it("rejects over-limit and aborted reads",async()=>{
 s.rows=Array.from({length:2001},(_,i)=>row(i+1));expect((await readHrLinkedDocuments({employeeId:7})).success).toBe(false);
 s.rows=[];const abort=new AbortController();abort.abort();expect((await readHrLinkedDocuments({employeeId:7},abort.signal)).success).toBe(false);
});
it("omits inaccessible and deleted documents after complete link collection",async()=>{
 s.rows=[{...row(1),document:null},{...row(2),document:{...row(2).document,deleted_at:"2026-10-13"}},{...row(3),document:{...row(3).document,status:"deleted"}},row(4)];const r=await readHrLinkedDocuments({employeeId:7});expect(r.success).toBe(true);expect(r.data?.rows.map(d=>d.link_id)).toEqual([4]);
});
it("rejects unrecognized input before any query",async()=>{for(const input of [{employeeId:0},{employeeId:7,dependentId:-1},{employeeId:7,table:"secrets"}])expect((await readHrLinkedDocuments(input)).success).toBe(false);expect(s.calls).toHaveLength(0);});
