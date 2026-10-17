// Explicitly admitted loopback-only native read acceptance. Fixture setup and exact
// cleanup are performed by the guarded private runner, never by production APIs.
import {beforeAll,afterAll,expect,it,vi} from "vitest";
import fs from "node:fs";
import crypto from "node:crypto";
import {createClient as sdk,type SupabaseClient} from "@supabase/supabase-js";
const state=vi.hoisted(()=>({client:null as unknown as SupabaseClient,admin:null as unknown as SupabaseClient}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>state.client}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>state.admin}));
vi.mock("next/headers",()=>({headers:async()=>new Headers()}));
import {POST as historyRoute} from "@/app/api/reads/report-history/route";
import {POST as criteriaRoute} from "@/app/api/reads/report-criteria/route";
import {POST as savedRoute} from "@/app/api/reads/report-saved-filters/route";
import {POST as selectionRoute} from "@/app/api/reads/report-template-selection/route";
import {POST as notificationsRoute} from "@/app/api/reads/notifications/route";
import {POST as queueRoute} from "@/app/api/reads/email-queue/route";
import {POST as logsRoute} from "@/app/api/reads/notification-deliveries/route";
import {POST as templatesRoute} from "@/app/api/reads/notification-templates/route";
import {POST as templateDetailRoute} from "@/app/api/reads/notification-template-detail/route";
import {POST as deliveriesRoute} from "@/app/api/reads/report-deliveries/route";
import {POST as dmsRoute} from "@/app/api/reads/dms-notifications/route";
import {GET as bellRoute} from "@/app/api/notifications/bell/route";
const clients=new Map<string,SupabaseClient>(),samples:Record<string,unknown>[]=[],sessions:{id:string;actor:string}[]=[];
let marker="",base=0,output="",journal="",signoutFailures=0,networkRequests=0;
const actualFetch=globalThis.fetch;
const required=(key:string)=>{const v=process.env[key];if(!v)throw Error("Explicit local admission required");return v;};
beforeAll(async()=>{
 if(process.env.PERF_P04_LOCAL!=="approved-synthetic-only")throw Error("Explicit local admission required");
 const a=JSON.parse(fs.readFileSync(required("PERF_P04_ADMISSION"),"utf8")),envFile=required("PERF_P04_ENVIRONMENT");
 if(a.project!=="algt-perf-local"||a.api!=="http://127.0.0.1:16821"||!a.verified||!a.providersDisabled||Date.now()-Date.parse(a.at)>600000||crypto.createHash("sha256").update(fs.readFileSync(envFile)).digest("hex")!==a.environmentSha256)throw Error("Admission failure");
 const e=JSON.parse(fs.readFileSync(envFile,"utf8"));if(e.project!==a.project||e.api!==a.api||!e.syntheticOnly||e.externalDelivery!==false)throw Error("Target failure");
 marker=a.marker;base=a.base;output=required("PERF_P04_OUTPUT");journal=a.journal;
 if(!/^PERF_ITEM4_\d+$/.test(marker)||base!==2143000000000||fs.existsSync(output)||fs.existsSync(journal))throw Error("Fixture/output identity failure");
 vi.stubGlobal("fetch",async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(input instanceof Request?input.url:String(input));if(url.origin!==e.api)throw Error("Outbound target rejected");networkRequests++;
  const response=await actualFetch(input,init);
  if(!response.ok&&url.pathname.startsWith("/rest/v1/")){
   const error=await response.clone().json().catch(()=>({}));
   // Only the SQL/PostgREST code and known timeout classification, not query
   // strings, headers, bodies, tokens or arbitrary database error text.
   samples.push({diagnostic:true,table:url.pathname.split("/").at(-1),status:response.status,code:/^[A-Z0-9]{5,12}$/.test(error.code??"")?error.code:"unknown",statementTimeout:/statement timeout/i.test(error.message??"")});
  }
  return response;
 });
 state.admin=sdk(e.api,e.service,{auth:{persistSession:false,autoRefreshToken:false}});
 const actors=JSON.parse(fs.readFileSync(required("PERF_P04_ACTORS"),"utf8"));
 for(const name of ["admin","none","company"]){
  if(!actors[name]?.email?.endsWith("@example.invalid"))throw Error("Synthetic actor required");
  const c=sdk(e.api,e.anon,{auth:{persistSession:false,autoRefreshToken:false}});clients.set(name,c);
  const r=await c.auth.signInWithPassword(actors[name]);if(r.error||!r.data.session)throw Error("Synthetic sign in failed");
  const claims=JSON.parse(Buffer.from(r.data.session.access_token.split(".")[1],"base64url").toString("utf8"));sessions.push({id:claims.session_id,actor:name});
  fs.writeFileSync(journal,JSON.stringify({sessions,productionWrites:0},null,2));
 }
});
afterAll(async()=>{
 for(const c of clients.values()){try{if((await c.auth.signOut({scope:"local"})).error)signoutFailures++;}catch{signoutFailures++;}}
 vi.unstubAllGlobals();
 if(output)fs.writeFileSync(output,JSON.stringify({at:new Date().toISOString(),kind:"ITEM4_NATIVE_POSTGREST_AND_ROUTE_HANDLERS",samples,signoutFailures,networkRequests,qualification:"Synthetic laboratory only; real PostgREST and auth with in-process Next route handlers. Not a browser or hosted Next transport measurement. Template selection positive acceptance remains blocked on reviewed F06 projection."},null,2),{flag:"wx"});
 expect(signoutFailures).toBe(0);
});
type Route=(request:Request)=>Promise<Response>;
async function request(name:string,route:Route,body:unknown,actor="admin",expected=200){
 state.client=clients.get(actor)!;const before=networkRequests,start=performance.now(),r=await route(new Request("http://localhost/api/reads/"+name,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}));
 const text=await r.text();samples.push({resource:name,actor,status:r.status,ms:Math.round(performance.now()-start),requests:networkRequests-before,bytes:Buffer.byteLength(text)});
 expect(r.headers.get("Cache-Control")).toContain("private, no-store");expect(r.status,text).toBe(expected);
 return JSON.parse(text);
}
for(const [name,route,criteria] of [
 ["email-queue",queueRoute,()=>({search:marker})],["notification-deliveries",logsRoute,()=>({status:marker})],
 ["notification-templates",templatesRoute,()=>({search:marker})],["report-deliveries",deliveriesRoute,()=>({search:marker,runId:base+1})],
 ["dms-notifications",dmsRoute,()=>({search:marker,audience:"all"})],
] as const){
 it("native "+name+" has complete counts beyond 1000 and no bulk private payloads",async()=>{
  const filter=criteria(),total=1105;
  const first=await request(name,route,{...filter,page:1,pageSize:100});expect(first.data.totalCount).toBe(total);expect(first.data.rows).toHaveLength(100);expect(JSON.stringify(first)).not.toContain("PRIVATE_");
  const tail=await request(name,route,{...filter,page:12,pageSize:100});expect(tail.data.totalCount).toBe(total);expect(tail.data.rows).toHaveLength(5);expect(new Set([...first.data.rows,...tail.data.rows].map((r:{id:number})=>r.id)).size).toBe(105);
  const gone=await request(name,route,{...filter,page:99,pageSize:100});expect(gone.data).toMatchObject({totalCount:total,rows:[]});
 },120000);
}
it("native no-role notification ownership, admin own/all and unread count remain truthful",async()=>{
 const own=await request("notifications",notificationsRoute,{audience:"my",search:marker,page:12,pageSize:100},"none");expect(own.data.totalCount).toBe(1103);expect(own.data.rows).toHaveLength(3);expect(own.data.rows.every((r:{recipientUserId:number})=>r.recipientUserId===2)).toBe(true);
 const admin=await request("notifications",notificationsRoute,{audience:"my",search:marker});expect(admin.data.totalCount).toBe(2);
 const all=await request("notifications",notificationsRoute,{audience:"admin",search:marker,page:12,pageSize:100});expect(all.data.totalCount).toBe(1105);expect(all.data.rows).toHaveLength(5);
 state.client=clients.get("none")!;const r=await bellRoute(new Request("http://localhost/api/notifications/bell"));expect(r.status).toBe(200);const count=await r.json();expect(count.data.count).toBeGreaterThanOrEqual(552);
},120000);
it("native permission denials perform no privileged list fallback",async()=>{
 for(const [name,route]of [["queue",queueRoute],["logs",logsRoute],["templates",templatesRoute],["report-deliveries",deliveriesRoute],["history",historyRoute],["criteria",criteriaRoute],["saved",savedRoute],["dms",dmsRoute]]as const){
  const body=name==="criteria"?{reportCode:marker,key:"employee_id"}:name==="saved"?{reportCode:marker}:{};
  await request(name,route,body,"none",403);
 }
},120000);
it("native history uses real view serialization and hides private list fields",async()=>{
 const r=await request("report-history",historyRoute,{search:marker,page:12,pageSize:100});expect(r.data.totalCount).toBe(1105);expect(r.data.rows).toHaveLength(5);expect(JSON.stringify(r)).not.toContain("PRIVATE_FILTERS");
 const detail=await request("report-history",historyRoute,{mode:"detail",recordId:base+1});expect(detail.data.record.id).toBe(base+1);expect(JSON.stringify(detail)).not.toContain("PRIVATE_FILTERS");
},120000);
it("native saved-filter list excludes other owners private filters and detail is point-bound",async()=>{
 const r=await request("report-saved-filters",savedRoute,{reportCode:marker,page:12,pageSize:100});expect(r.data.totalCount).toBe(1104);expect(r.data.rows).toHaveLength(4);expect(r.data.rows.some((x:{id:number})=>x.id===base+1105)).toBe(false);expect(JSON.stringify(r)).not.toContain("filters_json");
 const detail=await request("report-saved-filters",savedRoute,{reportCode:marker,mode:"detail",id:base+1105});expect(detail.data.record).toBeNull();
},120000);
it("native criterion lookup recovers an employee outside the current page without old 500 cap",async()=>{
 const r=await request("report-criteria",criteriaRoute,{reportCode:marker,key:"employee_id",page:12,pageSize:100,selectedId:880301});expect(r.data.totalCount).toBeGreaterThan(1000);expect(r.data.rows.length).toBeGreaterThan(0);expect(r.data.selected.value).toBe(880301);
},120000);
it("native template body is loaded only for one explicitly selected authorized record",async()=>{
 const r=await request("notification-template-detail",templateDetailRoute,{id:base+1105});expect(r.data.id).toBe(base+1105);expect(r.data.textTemplate).toBe("PRIVATE_TEMPLATE_TEXT");
 await request("notification-template-detail",templateDetailRoute,{id:base+1105},"none",403);
},120000);
it("missing reviewed F06 template-selection projection fails closed and is not positive acceptance",async()=>{
 const r=await request("report-template-selection",selectionRoute,{},"admin",503);expect(r.success).toBe(false);expect(r.error).toBe("Records could not be loaded. Please retry.");
});
