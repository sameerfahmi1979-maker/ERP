import { beforeEach, expect, it, vi } from "vitest";
type Call = { table: string; ops: [string, unknown[]][] };
const state = vi.hoisted(() => ({ active: true, allowed: true, forced: false, mode: "ok", total: 1107, calls: [] as Call[] }));
vi.mock("@/lib/rbac/check", () => ({ getAuthContext: async () => ({ profile: { id: 9, must_change_password: state.forced }, isAccountActive: state.active }), hasPermission: () => state.allowed }));
vi.mock("@/lib/logger", () => ({logger:{warn:vi.fn()}}));
const row = (id: number) => ({ id, document_id: id, renewal_no: `TEST-${id}`, status: "requested", priority: "normal", requested_by: null, assigned_to: null, requested_at: "2026-01-01", target_renewal_date: null, old_expiry_date: null, new_expiry_date: null, replacement_document_id: null, replacement_version_id: null, notes: null, completed_at: null, cancelled_at: null, created_by: null, created_at: "2026-01-01", updated_at: "2026-01-01", document: null, requester: null, assignee: null });
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: (table: string) => {
 const c = {table,ops:[] as [string,unknown[]][]};state.calls.push(c);
 const chain=new Proxy({}, {get:(_,key)=>key==="then"?(resolve:(result:unknown)=>unknown)=>{
  const [from,to]=(c.ops.filter(([op])=>op==="range").at(-1)?.[1]??[0,24]) as number[];
  const relation=table!=="dms_renewal_requests";
  const requested=c.ops.find(([op])=>op==="in")?.[1][1] as number[]|undefined;
  const hydrate=relation&&requested!==undefined;
  const total=relation?(hydrate?requested.length:state.mode==="lookup-empty"?0:2):state.total;
  const data=hydrate?requested.map(id=>table==="dms_documents"?{id,document_no:`DOC-${id}`,title:`Document ${id}`,expiry_date:null,document_type_id:1}:{id,full_name:`User ${id}`}):Array.from({length:Math.min(to-from+1,Math.max(0,total-from))},(_,i)=>relation?{id:from+i+100}:row(from+i+1));
  if(hydrate&&state.mode==="hidden-reference")return Promise.resolve({data:[],count:0,error:null}).then(resolve);
  if(hydrate&&state.mode==="failed-reference")return Promise.resolve({data:null,count:null,error:{message:"private relation error"}}).then(resolve);
  if(hydrate&&state.mode==="extra-reference")return Promise.resolve({data:[{id:99999,document_no:"WRONG",title:"Wrong",expiry_date:null,document_type_id:1}],count:1,error:null}).then(resolve);
  if(hydrate&&state.mode==="short-reference")return Promise.resolve({data:data.slice(0,1),count:total,error:null}).then(resolve);
  if(state.mode==="range416"&&from>=total)return Promise.resolve({data:null,count:null,status:416,error:{code:"PGRST103"}}).then(resolve);
  return Promise.resolve({data:state.mode==="duplicate"?data.map(()=>row(1)):state.mode==="short"?data.slice(0,1):state.mode==="malformed"?[{id:1}]:data,count:state.mode==="null"?null:total,error:state.mode==="error"||relation&&state.mode==="lookup-error"?{message:"private provider detail"}:null}).then(resolve);
 }:(...args:unknown[])=>{c.ops.push([String(key),args]);return chain;}});return chain;
 } }) }));
import { readDmsRenewalPage } from "@/server/reads/dms-renewal-page";
import { POST } from "@/app/api/reads/dms-renewal-page/route";
beforeEach(()=>{state.active=true;state.allowed=true;state.forced=false;state.mode="ok";state.total=1107;state.calls=[];});
it("fetches only a single 25-row page with stable tie ordering and an exact total",async()=>{
 const result=await readDmsRenewalPage({page:3});expect(result.success).toBe(true);expect(result.data?.rows.map(r=>r.id)).toEqual(Array.from({length:25},(_,i)=>i+51));expect(result.data?.totalCount).toBe(1107);expect(state.calls.filter(c=>c.table==="dms_renewal_requests")).toHaveLength(1);
 expect(state.calls.find(c=>c.table==="dms_documents")?.ops).toContainEqual(["in",["id",Array.from({length:25},(_,i)=>i+51)]]);
 expect(state.calls[0].ops).toEqual(expect.arrayContaining([["range",[50,74]],["order",["created_at",{ascending:false,nullsFirst:false}]],["order",["id",{ascending:true}]]]));
});
it("preserves base criteria, current assignee and completed inclusion",async()=>{
 await readDmsRenewalPage({documentId:4,status:"requested",assignedToMe:true,includeCompleted:true,sortKey:"priority",sortDir:"asc"});
 expect(state.calls[0].ops).toEqual(expect.arrayContaining([["eq",["document_id",4]],["eq",["status","requested"]],["eq",["assigned_to",9]],["order",["priority",{ascending:true,nullsFirst:false}]]]));
 expect(state.calls[0].ops.some(([op])=>op==="not")).toBe(false);
});
it("applies all column filters before paging through protected relation lookups",async()=>{
 await readDmsRenewalPage({columnFilters:{document:"Document",assignee:"User",renewal_no:"%_",status:"request",priority:"urgent",target_renewal_date:"2026-12-31"}});
 const main=state.calls.find(c=>c.table==="dms_renewal_requests")!;
 expect(main.ops).toEqual(expect.arrayContaining([["in",["document_id",[100,101]]],["in",["assigned_to",[100,101]]],["ilike",["renewal_no","%\\%\\_%"]],["eq",["target_renewal_date","2026-12-31"]]]));
 expect(state.calls.find(c=>c.table==="dms_documents")?.ops).toContainEqual(["ilike",["title","%Document%"]]);
});
it("global search includes permitted document and assignee identities, not just loaded rows",async()=>{
 await readDmsRenewalPage({search:"later page"});const main=state.calls.find(c=>c.table==="dms_renewal_requests")!;
 expect(main.ops.find(([op])=>op==="or")?.[1][0]).toContain("document_id.in.(100,101)");
 expect(main.ops.find(([op])=>op==="or")?.[1][0]).toContain("assigned_to.in.(100,101)");
});
it("empty related matches are a verified zero, but failed lookups never are",async()=>{
 state.mode="lookup-empty";expect((await readDmsRenewalPage({columnFilters:{document:"none"}})).data?.totalCount).toBe(0);
 state.mode="lookup-error";expect((await readDmsRenewalPage({search:"failure"})).success).toBe(false);
});
it.each(["duplicate","short","null","malformed","error"])("rejects %s page rather than partial success",async mode=>{
 state.mode=mode;const result=await readDmsRenewalPage({});expect(result.success).toBe(false);expect(result.data).toBeUndefined();expect(result.error).not.toContain("private");
});
it("accepts a counted short final page and an empty out-of-range page",async()=>{
 expect((await readDmsRenewalPage({page:45})).data?.rows).toHaveLength(7);
 expect((await readDmsRenewalPage({page:46})).data).toMatchObject({rows:[],totalCount:1107,page:46});
});
it("recovers a genuine PostgREST 416 using the identical filtered first-row count",async()=>{
 state.mode="range416";expect((await readDmsRenewalPage({page:46})).data).toMatchObject({rows:[],totalCount:1107,page:46});
 expect(state.calls).toHaveLength(1);expect(state.calls[0].ops.filter(([op])=>op==="range")).toEqual([["range",[1125,1149]],["range",[0,0]]]);
});
it("keeps denied relation projections null without losing an otherwise permitted renewal",async()=>{
 state.mode="hidden-reference";const result=await readDmsRenewalPage({});expect(result.success).toBe(true);expect(result.data?.rows).toHaveLength(25);expect(result.data?.rows.every(row=>row.document===null)).toBe(true);
});
it.each(["failed-reference","extra-reference","short-reference"])("rejects %s rather than joining unverified reference data",async mode=>{
 state.mode=mode;const result=await readDmsRenewalPage({});expect(result.success).toBe(false);expect(result.data).toBeUndefined();
});
it.each([{page:0},{pageSize:101},{sortKey:"notes"},{sortDir:"DROP"},{companyId:1},{columnFilters:{secret:"x"}},{columnFilters:{target_renewal_date:"yesterday"}}])("rejects unreviewed criteria %j before any read",async params=>{
 expect((await readDmsRenewalPage(params)).success).toBe(false);expect(state.calls).toHaveLength(0);
});
it("denies inactive, password-restricted and no-role callers before any read",async()=>{
 for(const mode of ["active","forced","allowed"]){state.active=mode!=="active";state.forced=mode==="forced";state.allowed=mode!=="allowed";expect((await readDmsRenewalPage({})).error).toBe("Permission denied");}
 expect(state.calls).toHaveLength(0);
});
it("publishes only a private no-store route and maps denial to 403",async()=>{
 const request=()=>new Request("http://localhost/api/reads/dms-renewal-page",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});
 const response=await POST(request());expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
 state.allowed=false;expect((await POST(request())).status).toBe(403);
});
