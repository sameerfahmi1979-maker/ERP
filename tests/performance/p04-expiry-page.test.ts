import { beforeEach, expect, it, vi } from "vitest";
type Call = { table: string; ops: [string, unknown[]][] };
const s = vi.hoisted(() => ({ allowed: true, active: true, forced: false, total: 1107, mode: "ok", reads: 0, calls: [] as Call[] }));
vi.mock("@/lib/rbac/check", () => ({ getAuthContext: async () => ({ profile: {id:9,must_change_password:s.forced}, isAccountActive:s.active }), hasPermission: () => s.allowed }));
vi.mock("@/lib/logger",()=>({logger:{warn:vi.fn()}}));
const row = (id:number) => ({ id, document_no:`DOC-${id}`, title:`Synthetic ${id}`, expiry_date:"2026-01-01",issue_date:null,status:"active",confidentiality:"company",
  expiry_tracking_override:null,expiry_override_reason:null,document_type:{name_en:"Synthetic type",is_renewable:true},category:{category:{name_en:"Synthetic category"}} });
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({from:(table:string)=>{
  const call:Call={table,ops:[]};s.calls.push(call);
  const builder=new Proxy({}, {get(_target,key){if(key==="then")return (resolve:(v:unknown)=>void)=>{
    const range=call.ops.filter(([k])=>k==="range").at(-1)?.[1] as number[] ?? [0,24];
    const total=table==="dms_documents"?s.total:s.mode==="lookup-empty"?0:2;
    if(table==="dms_documents")s.reads++;
    const count=s.mode==="null-count"?null:s.mode==="changed-count"&&s.reads>1?total+1:total;
    let data:Record<string,unknown>[]=Array.from({length:Math.min(range[1]-range[0]+1,Math.max(0,total-range[0]))},(_,i)=>table==="dms_documents"?row(range[0]+i+1):{id:range[0]+i+1,document_id:range[0]+i+1});
    if(table==="dms_documents"){
      if(s.mode==="short")data=data.slice(1);
      if(s.mode==="duplicate"&&data.length>1)data[1]=data[0];
      if(s.mode==="changed-same-count"&&s.reads>3)data=data.map(r=>({...r,title:"Changed"}));
      if(s.mode==="malformed")data=[{id:1} as never];
      if(s.mode==="hidden-label")data=data.map(r=>({...r,document_type:null,category:null}));
      if(s.mode==="large-output")data=data.map(r=>({...r,title:"x".repeat(3_100_000)}));
      if(s.mode==="range416"&&range[0]>=total)return resolve({status:416,error:{code:"PGRST103"},count:null,data:null});
    }
    const failed=s.mode==="error"||(s.mode==="lookup-error"&&table!=="dms_documents")||(s.mode==="second-pass-error"&&s.reads>3);
    resolve({data,error:failed?{message:"private database message"}:null,count,status:200});
  };return (...args:unknown[])=>{call.ops.push([String(key),args]);return builder;};}});return builder;
}})}));
import { readDmsExpiryPage, readDmsExpiryOutput } from "@/server/reads/dms-expiry-page";
import { POST as pageRoute } from "@/app/api/reads/dms-expiry-page/route";
import { POST as outputRoute } from "@/app/api/reads/dms-expiry-output/route";
beforeEach(()=>{Object.assign(s,{allowed:true,active:true,forced:false,total:1107,mode:"ok",reads:0,calls:[]});});
it("fetches exactly one bounded page with an exact complete count and stable sort",async()=>{
 const result=await readDmsExpiryPage({view:"expired",page:2});expect(result.success).toBe(true);expect(result.data).toMatchObject({page:2,pageSize:25,totalCount:1107});expect(result.data!.rows.map(r=>r.id)).toEqual(Array.from({length:25},(_,i)=>i+26));expect(s.reads).toBe(1);
 expect(s.calls[0].ops).toEqual(expect.arrayContaining([["range",[25,49]],["order",["expiry_date",{ascending:true,nullsFirst:false}]],["order",["id",{ascending:true}]]]));
});
it("complete output includes the final record beyond page one and the backend page cap",async()=>{
 const output=await readDmsExpiryOutput({view:"expired"});expect(output.success).toBe(true);expect(output.data!.rows).toHaveLength(1107);expect(output.data!.rows.at(-1)?.id).toBe(1107);expect(output.data!.totalCount).toBe(1107);expect(output.data!.fingerprint).toMatch(/^[a-f0-9]{64}$/);expect(s.reads).toBe(6);
});
it.each(["short","duplicate","null-count","malformed","error"])("page rejects %s instead of false success",async mode=>{s.mode=mode;const r=await readDmsExpiryPage({view:"expired"});expect(r.success).toBe(false);expect(r.data).toBeUndefined();expect(r.error).not.toContain("private");});
it.each(["short","duplicate","null-count","malformed","error","changed-count","changed-same-count","second-pass-error"])("complete output rejects %s without any partial rows",async mode=>{s.mode=mode;const r=await readDmsExpiryOutput({view:"expired"});expect(r.success).toBe(false);expect(r.data).toBeUndefined();});
it("fails closed above the output safety ceiling while interactive paging still works",async()=>{s.total=10001;expect((await readDmsExpiryPage({view:"expired"})).data!.rows).toHaveLength(25);expect((await readDmsExpiryOutput({view:"expired"})).success).toBe(false);});
it("verifies empty and short tail pages including a real out-of-range 416",async()=>{
 expect((await readDmsExpiryPage({view:"expired",page:45})).data!.rows).toHaveLength(7);s.mode="range416";expect((await readDmsExpiryPage({view:"expired",page:46})).data).toMatchObject({rows:[],totalCount:1107});
 s.total=0;s.mode="ok";expect((await readDmsExpiryOutput({view:"expired"})).data).toMatchObject({rows:[],totalCount:0});
});
it.each(["expired","expiring","missing_expiry","ignored","all"] as const)("preserves %s view criteria and deleted/superseded exclusion",async view=>{
 await readDmsExpiryPage({view});const ops=s.calls.find(c=>c.table==="dms_documents")!.ops;
 expect(ops).toEqual(expect.arrayContaining([["is",["deleted_at",null]],["neq",["status","superseded"]]]));
 if(view==="expired")expect(ops.some(([key])=>key==="lt")).toBe(true);
 if(view==="expiring")expect(ops.some(([key])=>key==="lte")).toBe(true);
 if(view==="missing_expiry")expect(ops).toContainEqual(["neq",["status","archived"]]);
 if(view==="ignored")expect(ops).toContainEqual(["eq",["expiry_tracking_override","ignored"]]);
});
it("both output passes apply all advanced and column filters, never page-only filters",async()=>{
 await readDmsExpiryOutput({view:"all",documentTypeId:2,categoryId:3,entityType:"employee",entityId:4,status:"active",searchText:"%_",expiryDateFrom:"2026-01-01",expiryDateTo:"2026-12-31",daysRemainingMin:-5,daysRemainingMax:90,
  columnFilters:{document_no:"Synthetic",document_type:"Type",expiry_date:"2026-01-01",expiry_override_reason:"retained",status:"act"},search:"category",sortKey:"document_type",sortDir:"desc"});
 const main=s.calls.filter(c=>c.table==="dms_documents");expect(main).toHaveLength(2);
 for(const {ops} of main){expect(ops).toEqual(expect.arrayContaining([["eq",["document_type_id",2]],["eq",["status","active"]],["ilike",["title","%Synthetic%"]],["ilike",["expiry_override_reason","%retained%"]],["order",["document_type(name_en)",{ascending:false,nullsFirst:false}]]]));expect(ops.filter(([op])=>op==="or")).toHaveLength(2);}
});
it("missing or denied relation labels remain null",async()=>{s.mode="hidden-label";const r=await readDmsExpiryPage({view:"all"});expect(r.success).toBe(true);expect(r.data!.rows[0]).toMatchObject({document_type:null,category:null});});
it("empty relation matches are a genuine zero; relation failures are not",async()=>{s.mode="lookup-empty";expect((await readDmsExpiryPage({view:"all",columnFilters:{document_type:"none"}})).data?.totalCount).toBe(0);s.mode="lookup-error";expect((await readDmsExpiryOutput({view:"all",categoryId:3})).success).toBe(false);});
it.each([{pageSize:101},{page:0},{sortKey:"secret"},{columnFilters:{secret:"x"}},{limit:25},{entityId:1},{expiryDateFrom:"2026-02-30"}])("rejects invalid criteria %j before reading",async params=>{expect((await readDmsExpiryPage({view:"expired",...params})).success).toBe(false);expect(s.calls).toHaveLength(0);});
it("complete output explicitly rejects pagination so a page cannot masquerade as an export",async()=>{for(const params of [{page:1},{pageSize:25}])expect((await readDmsExpiryOutput({view:"expired",...params})).success).toBe(false);expect(s.calls).toHaveLength(0);});
it("denies no-role, inactive and forced-password sessions",async()=>{for(const mode of ["allowed","active","forced"]){s.allowed=mode!=="allowed";s.active=mode!=="active";s.forced=mode==="forced";expect((await readDmsExpiryPage({view:"expired"})).error).toBe("Permission denied");expect((await readDmsExpiryOutput({view:"expired"})).error).toBe("Permission denied");}expect(s.calls).toHaveLength(0);});
it("private POST routes reject invalid input and denial without leaking data",async()=>{
 const request=(params:unknown)=>new Request("http://localhost/api/reads/test",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(params)});
 for(const route of [pageRoute,outputRoute]){s.allowed=true;const r=await route(request({view:"expired"}));expect(r.status).toBe(200);expect(r.headers.get("cache-control")).toBe("private, no-store, max-age=0");s.allowed=false;expect((await route(request({view:"expired"}))).status).toBe(403);expect((await route(request({view:"expired",evil:true}))).status).toBe(400);}
});
it("rejects oversized complete output rather than returning a truncated payload",async()=>{
 s.total=2;s.mode="large-output";const result=await readDmsExpiryOutput({view:"all"});expect(result.success).toBe(false);expect(result.data).toBeUndefined();
});
it("freezes the business date across both output passes",async()=>{
 const clock=vi.spyOn(Date,"now").mockReturnValueOnce(Date.parse("2026-10-13T23:59:59Z")).mockReturnValue(Date.parse("2026-10-14T00:00:01Z"));
 try{
  await readDmsExpiryOutput({view:"expiring"});const main=s.calls.filter(c=>c.table==="dms_documents");expect(main).toHaveLength(2);
  for(const {ops} of main)expect(ops).toEqual(expect.arrayContaining([["gte",["expiry_date","2026-10-13"]],["lte",["expiry_date","2027-01-11"]]]));
 }finally{clock.mockRestore();}
});
