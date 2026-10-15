import {beforeEach,expect,it,vi} from "vitest";
import {syntheticAuthContext} from "./fixtures/auth-context";
const s=vi.hoisted(()=>({auth:vi.fn(),calls:[] as unknown[][],rows:[] as Record<string,unknown>[],error:null as unknown,count:null as number|null,detail:false}));
vi.mock("@/lib/rbac/check",async original=>({...await original<typeof import("@/lib/rbac/check")>(),getAuthContext:s.auth}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({from:(table:string)=>{
  s.calls.push(["from",table]);let head=false,from=0,to=49,detail=false;const q:Record<string,unknown>={};
  for(const method of ["select","eq","gte","lt","or","order","range","abortSignal","maybeSingle"])q[method]=(...args:unknown[])=>{s.calls.push([method,...args]);if(method==="select")head=!!(args[1]as{head?:boolean})?.head;if(method==="range"){from=Number(args[0]);to=Number(args[1]);}if(method==="maybeSingle")detail=true;return q;};
  q.then=(resolve:(r:unknown)=>unknown)=>Promise.resolve({data:detail?s.rows[0]??null:head?null:s.rows.slice(from,to+1),count:s.count??s.rows.length,error:s.error,status:200}).then(resolve);return q;
}})}));
import {readAudit} from "@/server/reads/audit";
import {POST} from "@/app/api/reads/audit/route";
const row=(id:number)=>({id,created_at:"2026-10-15T10:00:00Z",action:"TEST",module_code:"hr",entity_id:1,entity_name:"employees",entity_reference:"Synthetic",actor_user_profile_id:1});
beforeEach(()=>{vi.clearAllMocks();s.calls=[];s.rows=Array.from({length:1107},(_,i)=>row(i+1));s.error=null;s.count=null;s.auth.mockResolvedValue(syntheticAuthContext(["audit.view"]));});
it("reaches the tail beyond the old 300-row cap and never selects payloads for a list",async()=>{
  const r=await readAudit({page:23,pageSize:50});expect(r).toMatchObject({success:true,data:{rows:Array.from({length:7},(_,i)=>({id:1101+i})),totalCount:1107}});expect(s.calls).toContainEqual(["range",1100,1149]);
  const fields=s.calls.find(c=>c[0]==="select")![1];expect(fields).not.toMatch(/\*|old_values|new_values|user_agent|ip_address/);
});
it("literal filters and full final day are applied before paging, with a unique order tie",async()=>{
  await readAudit({search:'%,_("ع")',actor:2,module:"hr",date_from:"2026-10-01",date_to:"2026-10-15"});
  expect(s.calls).toContainEqual(["eq","actor_user_profile_id",2]);expect(s.calls).toContainEqual(["lt","created_at","2026-10-16T00:00:00.000Z"]);expect(s.calls).toContainEqual(["order","id",{ascending:true}]);
  expect(String(s.calls.find(c=>c[0]==="or")![1])).toContain("\\\\%");
});
it("the explicit selected detail redacts nested credentials on the server",async()=>{
  s.rows=[{...row(1),old_values:{password:"PRIVATE",nested:{token:"PRIVATE"}},new_values:{name:"Visible"}}];
  const r=await readAudit({mode:"detail",id:1});expect(r).toMatchObject({success:true,data:{id:1,new_values:{name:"Visible"}}});expect(JSON.stringify(r)).not.toContain("PRIVATE");
});
it.each(["error","count","short","duplicate"])("refuses %s instead of presenting successful empty audit history",async fault=>{
  if(fault==="error")s.error={message:"PRIVATE"};if(fault==="count")s.count=-1;if(fault==="short")s.rows.length=1,s.count=1107;if(fault==="duplicate")s.rows[1]=s.rows[0];
  const r=await readAudit({});expect(r.success).toBe(false);expect(JSON.stringify(r)).not.toContain("PRIVATE");
});
it("rejects unauthorized and malformed reads before any data access",async()=>{
  s.auth.mockResolvedValue(syntheticAuthContext([]));expect((await readAudit({})).success).toBe(false);expect(s.calls).toHaveLength(0);
  expect((await readAudit({page:0})).success).toBe(false);expect((await readAudit({date_from:"2026-12-31",date_to:"2026-01-01"})).success).toBe(false);
});
it("uses the shared private response contract and cancellation",async()=>{
  const response=await POST(new Request("http://offline.test/api/reads/audit",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"}));expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toContain("private, no-store");
  const c=new AbortController();c.abort();const cancelled=await POST(new Request("http://offline.test/api/reads/audit",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}",signal:c.signal}));expect(cancelled.headers.get("X-ERP-Read-Outcome")).toBe("cancelled");
});
