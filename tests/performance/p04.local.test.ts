// Explicitly opted-in synthetic loopback lab. Never run against a hosted project.
import {afterAll,beforeAll,expect,it,vi} from "vitest";
import fs from "node:fs";
import crypto from "node:crypto";
import {createClient as sdk,type SupabaseClient} from "@supabase/supabase-js";
const state=vi.hoisted(()=>({client:null as unknown as SupabaseClient,admin:null as unknown as SupabaseClient}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>state.client}));
vi.mock("@/lib/supabase/client",()=>({createClient:()=>state.client}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>state.admin}));
vi.mock("next/cache",()=>({revalidatePath:()=>{}}));
vi.mock("next/headers",()=>({headers:async()=>new Headers()}));
vi.mock("@/server/actions/email",()=>({sendExportEmail:()=>{throw Error("Delivery forbidden in read-only lab");}}));
vi.mock("@/server/actions/audit",()=>({logAudit:()=>{throw Error("Business writes forbidden in read-only lab");}}));
import {withDocumentReadPolicy} from "@/lib/supabase/document-read-policy";
import {fetchConfigurationChoices,type ConfigurationResource} from "@/lib/lookups/configuration-fetchers";
import {readDmsArchivePage} from "@/server/reads/dms-archive";
import {getDmsExpiringDocuments,getDmsExpiryDashboardStats} from "@/server/actions/dms/expiry-reminders";
import {getDmsRenewalRequests} from "@/server/actions/dms/renewals";
const clients=new Map<string,SupabaseClient>(),samples:Record<string,unknown>[]=[];
const actualFetch=globalThis.fetch;
let output="",signoutFailures=0;
const required=(key:string)=>{const v=process.env[key];if(!v)throw Error("Explicit local admission required");return v;};
beforeAll(async()=>{
 if(process.env.PERF_P04_LOCAL!=="approved-synthetic-only")throw Error("Local admission required");
 const admission=JSON.parse(fs.readFileSync(required("PERF_P04_ADMISSION"),"utf8"));
 if(admission.project!=="algt-perf-local"||admission.api!=="http://127.0.0.1:16821"||!admission.verified||!admission.providersDisabled||Date.now()-Date.parse(admission.at)>600000)throw Error("Target/freshness failure");
 const file=required("PERF_P04_ENVIRONMENT");
 if(crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")!==admission.environmentSha256)throw Error("Environment changed");
 const config=JSON.parse(fs.readFileSync(file,"utf8"));
 if(config.project!=="algt-perf-local"||config.api!==admission.api||config.syntheticOnly!==true||config.externalDelivery!==false)throw Error("Wrong target");
 output=required("PERF_P04_OUTPUT");if(fs.existsSync(output))throw Error("Refusing evidence overwrite");
 vi.stubGlobal("fetch",(input:RequestInfo|URL,init?:RequestInit)=>{const url=new URL(input instanceof Request?input.url:String(input));if(url.origin!==config.api)throw Error("Outbound target rejected");return actualFetch(input,init);});
 state.admin=sdk(config.api,config.service,{auth:{persistSession:false,autoRefreshToken:false}});
 const actors=JSON.parse(fs.readFileSync(required("PERF_P04_ACTORS"),"utf8"));
 for(const name of ["admin","company","none","branch"]){
  const actor=actors[name];if(!actor?.email?.endsWith("@example.invalid"))throw Error("Synthetic actor required");
  const client=sdk(config.api,config.anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const result=await client.auth.signInWithPassword(actor);if(result.error)throw Error("Synthetic sign-in failed");clients.set(name,withDocumentReadPolicy(client));
 }
});
afterAll(async()=>{
 for(const client of clients.values()){try{if((await client.auth.signOut({scope:"local"})).error)signoutFailures++;}catch{signoutFailures++;}}
 vi.unstubAllGlobals();
 if(output)fs.writeFileSync(output,JSON.stringify({at:new Date().toISOString(),kind:"P04_NATIVE_READ_ONLY",samples,signoutFailures,qualification:"Current synthetic lab, not exact shipping-schema or production evidence. Configuration RLS is unchanged. Empty sets do not establish positive role access. No browser measurements."},null,2),{flag:"wx"});
 expect(signoutFailures).toBe(0);
});
const resources:[ConfigurationResource,string,string][]=[
 ["currencies","currencies","is_active"],["banks","banks","is_active"],["paymentTerms","payment_terms","is_active"],["taxTypes","tax_types","is_active"],["uomCategories","uom_categories","is_active"],["unitsOfMeasure","units_of_measure","is_active"],
 ["ownerCompanies","owner_companies","status"],["branches","branches","status"],["costCenters","cost_centers","is_active"],["profitCenters","profit_centers","is_active"],["countries","countries","is_active"],["emirates","emirates","is_active"],["cities","cities","is_active"],["areas","areas_zones","is_active"],["ports","ports","is_active"],
];
it("15 configuration families preserve the same actor's complete active identity sets",async()=>{
 for(const actor of ["admin","company","branch"]){
  state.client=clients.get(actor)!;
  for(const [resource,table,active] of resources){
   const ids:number[]=[];let count:number|null=null;
   for(let from=0;from===0||from<count!;from+=100){
    const result=await state.client.from(table).select("id",{count:"exact"}).eq(active,active==="status"?"active":true).order("id").range(from,from+99);
    expect(result.error,resource).toBeNull();expect(result.count).not.toBeNull();if(count!==null)expect(result.count).toBe(count);count=result.count!;
    expect(result.data!.length).toBe(Math.min(100,Math.max(0,count-from)));ids.push(...result.data!.map(r=>r.id as number));if(count>10000)throw Error("Fixture cap exceeded");
   }
   const result=await fetchConfigurationChoices(resource);
   samples.push({actor,resource,total:result.length,baseline:ids.length});
   expect(result.map(r=>r.id).sort((a,b)=>a-b),actor+" "+resource).toEqual(ids);expect(new Set(ids).size).toBe(ids.length);
  }
 }
});
it("archive route data preserves authorized empty/nonempty counts and denies the no-role actor",async()=>{
 for(const actor of ["admin","company","branch","none"]){
  state.client=clients.get(actor)!;const result=await readDmsArchivePage();samples.push({actor,resource:"archive",success:result.success,total:result.data?.totalCount,rows:result.data?.rows.length});
  if(actor==="none"){expect(result.success).toBe(false);expect(result.error).toBe("Permission denied");}
  else {expect(result.success,actor).toBe(true);expect(result.data!.rows.length).toBe(Math.min(25,result.data!.totalCount));}
 }
});

it("expiry continuation preserves the complete admin identity set and rejects no-role reads",async()=>{
 state.client=clients.get("admin")!;
 const ids:number[]=[];let total=0;
 for(let from=0;from===0||from<total;from+=100){
  const result=await state.client.from("dms_documents").select("id",{count:"exact"}).is("deleted_at",null).neq("status","superseded").order("id").range(from,from+99);
  expect(result.error).toBeNull();expect(result.count).not.toBeNull();if(from)expect(result.count).toBe(total);total=result.count!;
  expect(total).toBeLessThanOrEqual(10000);expect(result.data!.length).toBe(Math.min(100,Math.max(0,total-from)));ids.push(...result.data!.map(row=>row.id as number));
 }
 const start=performance.now(),result=await getDmsExpiringDocuments({view:"all"});
 samples.push({actor:"admin",resource:"expiry-all",success:result.success,total:result.data?.length,baseline:ids.length,elapsedMs:Math.round(performance.now()-start)});
 expect(result.success).toBe(true);expect(ids.length).toBeGreaterThan(200);expect(result.data!.map(row=>row.id).sort((a,b)=>a-b)).toEqual(ids);
 const summary=await getDmsExpiryDashboardStats();samples.push({actor:"admin",resource:"expiry-summary",success:summary.success,metrics:summary.data?Object.keys(summary.data).length:0});
 if(!summary.success){
  // Read-only diagnostics contain table/error identifiers only, never rows or credentials.
  for(const table of ["dms_document_types","dms_documents","dms_expiry_reminders","dms_renewal_requests"]){
   const result=await state.client.from(table).select("id",{count:"exact",head:true});samples.push({resource:"summary-diagnostic",table,status:result.status,count:result.count,error:result.error?{code:result.error.code,message:result.error.message}:null});
   if(result.error){const detail=await state.client.from(table).select("id",{count:"exact"}).limit(1);samples.push({resource:"summary-diagnostic-detail",table,status:detail.status,error:detail.error?{code:detail.error.code,message:detail.error.message}:null});}
  }
 }
 expect(summary.success).toBe(true);
 const renewalIds:number[]=[];let renewalTotal=0;
 for(let from=0;from===0||from<renewalTotal;from+=100){
  const baseline=await state.client.from("dms_renewal_requests").select("id",{count:"exact"}).is("deleted_at",null).order("id").range(from,from+99);
  expect(baseline.error).toBeNull();expect(baseline.count).not.toBeNull();if(from)expect(baseline.count).toBe(renewalTotal);renewalTotal=baseline.count!;
  expect(renewalTotal).toBeLessThanOrEqual(10000);expect(baseline.data!.length).toBe(Math.min(100,Math.max(0,renewalTotal-from)));renewalIds.push(...baseline.data!.map(row=>row.id as number));
 }
 const renewalStart=performance.now(),renewals=await getDmsRenewalRequests({includeCompleted:true});samples.push({actor:"admin",resource:"renewals-all",success:renewals.success,total:renewals.data?.length,baseline:renewalTotal,elapsedMs:Math.round(performance.now()-renewalStart)});
 expect(renewals.success).toBe(true);expect(renewalTotal).toBeGreaterThan(200);expect(renewals.data!.map(row=>row.id).sort((a,b)=>a-b)).toEqual(renewalIds);
 state.client=clients.get("none")!;
 for(const denied of [await getDmsExpiringDocuments(),await getDmsExpiryDashboardStats(),await getDmsRenewalRequests()]){samples.push({actor:"none",resource:"expiry-denial",success:denied.success});expect(denied.success).toBe(false);expect(denied.data).toBeUndefined();}
});
