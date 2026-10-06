import {beforeEach,expect,it,vi} from "vitest";
type Call={table:string;ops:[string,unknown[]][]};
type Result={data:unknown;count:number|null;error:unknown};
const state=vi.hoisted(()=>({allowed:true,active:true,forced:false,calls:[] as Call[],respond:undefined as undefined|((call:Call)=>Result)}));
vi.mock("@/lib/rbac/check",()=>({hasPermission:()=>state.allowed,getAuthContext:async()=>({profile:{id:1,must_change_password:state.forced},isAccountActive:state.active})}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({from:(table:string)=>{
 const call={table,ops:[] as [string,unknown[]][]};state.calls.push(call);
 const chain=new Proxy({}, {get:(_,key)=>key==="then"?(resolve:(r:Result)=>unknown)=>Promise.resolve(state.respond?.(call)??{data:[],count:0,error:null}).then(resolve):(...args:unknown[])=>{call.ops.push([String(key),args]);return chain;}});return chain;
}})}));
vi.mock("@/server/actions/email",()=>({sendExportEmail:vi.fn()}));
vi.mock("@/server/actions/audit",()=>({logAudit:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
import {getDmsExpiringDocuments,getDmsExpiryDashboardStats} from "@/server/actions/dms/expiry-reminders";
const row=(id:number)=>({id,document_no:`SYNTH-${id}`,title:"Synthetic expiry",expiry_date:"2026-01-01",issue_date:null,status:"active",confidentiality:"company",expiry_tracking_override:null,expiry_override_reason:null,document_type:{name_en:"Test type",is_renewable:true},category:{category:{name_en:"Test category"}}});
function page(call:Call,total:number,make:(id:number)=>unknown=row):Result{
 const range=call.ops.find(([op])=>op==="range")?.[1] as number[]|undefined;
 const from=range?.[0]??0,to=range?.[1]??199;
 return {data:Array.from({length:Math.min(to-from+1,Math.max(0,total-from))},(_,i)=>make(from+i+1)),count:total,error:null};
}
beforeEach(()=>{state.allowed=true;state.active=true;state.forced=false;state.calls=[];state.respond=undefined;});
it("loads all 1,107 documents with stable bounded pages instead of a silent 200-row cut",async()=>{
 state.respond=c=>c.table==="dms_documents"?page(c,1107):{data:[],count:0,error:null};
 const result=await getDmsExpiringDocuments({view:"expired"});expect(result.success).toBe(true);expect(result.data).toHaveLength(1107);
 const calls=state.calls.filter(c=>c.table==="dms_documents");expect(calls).toHaveLength(3);
 for(const c of calls){expect(c.ops).toContainEqual(["order",["id",{ascending:true}]]);expect(c.ops.some(([op])=>op==="limit")).toBe(false);}
 expect(state.calls.filter(c=>c.table==="dms_document_types")).toHaveLength(0);
});
it.each([null,-1,1.5,10001])("rejects unavailable, invalid or unsafe document count %s",async count=>{
 state.respond=c=>c.table==="dms_documents"?{data:[row(1)],count,error:null}:{data:[],count:0,error:null};
 const result=await getDmsExpiringDocuments({view:"expired"});expect(result.success).toBe(false);expect(result.data).toBeUndefined();
});
it.each(["short","duplicate","changed","malformed","provider"])("does not return partial success on %s",async mode=>{
 state.respond=c=>{if(c.table!=="dms_documents")return{data:[],count:0,error:null};const result=page(c,1107);
  if(mode==="short")result.data=[row(1)];if(mode==="duplicate")result.data=Array(500).fill(row(1));
  if(mode==="changed"&&state.calls.filter(c=>c.table==="dms_documents").length>1)result.count=1108;
  if(mode==="malformed")result.data=[{id:1}];if(mode==="provider")result.error={message:"private provider details"};return result;};
 const result=await getDmsExpiringDocuments({view:"expired"});expect(result.success).toBe(false);expect(result.data).toBeUndefined();expect(result.error).not.toContain("private provider");
});
it.each(["missing_expiry","category","entity"])("fails closed on prerequisite %s read failure",async mode=>{
 state.respond=c=>c.table==="dms_documents"?{data:[row(1)],count:1,error:null}:{data:null,count:null,error:{message:"private prerequisite error"}};
 const result=await getDmsExpiringDocuments({view:mode==="missing_expiry"?mode:"expired",...(mode==="category"?{categoryId:1}:{}),...(mode==="entity"?{entityId:1,entityType:"employee"}:{})});
 expect(result.success).toBe(false);expect(state.calls.some(c=>c.table==="dms_documents")).toBe(false);
});
it("complete entity links use unique link IDs, not repeated document IDs",async()=>{
 state.respond=c=>c.table==="dms_document_links"?page(c,1107,id=>({id,document_id:Math.ceil(id/2)})):c.table==="dms_documents"?{data:[row(554)],count:1,error:null}:{data:[],count:0,error:null};
 const result=await getDmsExpiringDocuments({view:"expired",entityType:"employee",entityId:1});expect(result.success).toBe(true);
 const ids=state.calls.find(c=>c.table==="dms_documents")?.ops.find(([op])=>op==="in")?.[1][1] as number[];expect(ids).toHaveLength(554);expect(ids).toContain(554);
});
it("complete missing-expiry type exclusions include IDs after the backend cap",async()=>{
 state.respond=c=>c.table==="dms_document_types"?page(c,1107,id=>({id})):{data:[],count:0,error:null};
 expect((await getDmsExpiringDocuments({view:"missing_expiry"})).success).toBe(true);
 expect(state.calls.find(c=>c.table==="dms_documents")?.ops).toContainEqual(["not",["document_type_id","in",`(${Array.from({length:1107},(_,i)=>i+1).join(",")})`]]);
});
it.each([{}, {view:"unknown"},{view:"expired",limit:0},{view:"expired",entityType:"employee"},{view:"expired",daysRemainingMin:NaN},{view:"expired",expiryDateFrom:"not-date"}])("rejects invalid criteria without queries %j",async filter=>{
 expect((await getDmsExpiringDocuments(filter as Parameters<typeof getDmsExpiringDocuments>[0])).success).toBe(false);expect(state.calls).toHaveLength(0);
});
it("literal search remains data, not filter syntax",async()=>{
 expect((await getDmsExpiringDocuments({view:"expired",searchText:'a%,x.eq.1_*'})).success).toBe(true);
 const clause=state.calls.find(c=>c.table==="dms_documents")?.ops.find(([op])=>op==="or")?.[1][0];expect(clause).toContain('"%');expect(clause).toContain('\\%');
});
it("legacy explicit limit is a safety bound, never permission to return an incomplete export",async()=>{
 state.respond=c=>c.table==="dms_documents"?page(c,201):{data:[],count:0,error:null};
 expect((await getDmsExpiringDocuments({view:"expired",limit:200})).success).toBe(false);
});
it("inactive, password-setup and denied callers cannot read",async()=>{
 for(const key of ["active","forced","allowed"] as const){state.active=key!=="active";state.forced=key==="forced";state.allowed=key!=="allowed";expect((await getDmsExpiringDocuments()).success).toBe(false);expect((await getDmsExpiryDashboardStats()).success).toBe(false);}
 expect(state.calls).toHaveLength(0);
});
it.each(["error","null","negative","fractional"])("summary %s is unavailable, not a zero count",async mode=>{
 state.respond=c=>c.table==="dms_document_types"?{data:[],count:0,error:null}:{data:null,count:mode==="null"?null:mode==="negative"?-1:mode==="fractional"?1.5:0,error:mode==="error"?{message:"private count failure"}:null};
 const result=await getDmsExpiryDashboardStats();expect(result.success).toBe(false);expect(result.data).toBeUndefined();expect(result.error).not.toContain("private");
});
it("summary preserves a genuine successful zero in all ten metrics",async()=>{
 const result=await getDmsExpiryDashboardStats();expect(result.success).toBe(true);expect(Object.values(result.data!)).toEqual(Array(10).fill(0));
 expect(state.calls).toHaveLength(11);
 expect(state.calls.find(c=>c.table==="dms_renewal_requests")?.ops).toContainEqual(["range",[0,0]]);
});
