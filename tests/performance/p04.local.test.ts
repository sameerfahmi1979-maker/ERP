// Explicitly opted-in synthetic loopback lab. Never run against a hosted project.
import {afterAll,beforeAll,expect,it,vi} from "vitest";
import fs from "node:fs";
import crypto from "node:crypto";
import {createClient as sdk,type SupabaseClient} from "@supabase/supabase-js";
const state=vi.hoisted(()=>({client:null as unknown as SupabaseClient,admin:null as unknown as SupabaseClient,writeIds: new Set<number>()}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>state.client}));
vi.mock("@/lib/supabase/client",()=>({createClient:()=>state.client}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>state.admin}));
vi.mock("next/cache",()=>({revalidatePath:()=>{}}));
vi.mock("next/headers",()=>({headers:async()=>new Headers()}));
vi.mock("@/server/actions/email",()=>({sendExportEmail:()=>{throw Error("Delivery forbidden in read-only lab");}}));
vi.mock("@/server/actions/audit",()=>({logAudit:(entry:{entity_id?:number})=>{if(!entry.entity_id||!state.writeIds.has(entry.entity_id))throw Error("Only registered synthetic archive fixtures may be audited");}}));
vi.mock("@/lib/dms/review-queue/review-queue-upsert",()=>({isDmsAiReviewEnabled:async()=>true,createDmsReviewQueueNotification:()=>{throw Error("No delivery");},upsertDmsReviewQueueItem:()=>{throw Error("No queue mutation");}}));
import {readDmsSection} from "@/server/reads/dms-section";
import {getAuthContext,hasPermission} from "@/lib/rbac/check";
import {getDmsReviewQueueItems,getDmsReviewQueueCounts,getDmsReviewQueueItem} from "@/server/actions/dms/review-queue";
import {readDmsInboxPage} from "@/server/reads/dms-inbox";
import {getDmsUploadBatchDrafts,listDmsUploadBatches} from "@/server/actions/dms/batch-intake";
import {withDocumentReadPolicy} from "@/lib/supabase/document-read-policy";
import {fetchConfigurationChoices,type ConfigurationResource} from "@/lib/lookups/configuration-fetchers";
import {archiveDmsDocument,unarchiveDmsDocument} from "@/server/actions/dms/documents";
import {readDmsArchivePage} from "@/server/reads/dms-archive";
import {getDmsExpiringDocuments,getDmsExpiryDashboardStats} from "@/server/actions/dms/expiry-reminders";
import {getDmsRenewalRequests} from "@/server/actions/dms/renewals";
import {POST as expiryRoute} from "@/app/api/reads/dms-expiring/route";
import {POST as summaryRoute} from "@/app/api/reads/dms-expiry-summary/route";
import {POST as renewalRoute} from "@/app/api/reads/dms-renewals/route";
import {POST as renewalPageRoute} from "@/app/api/reads/dms-renewal-page/route";
import {POST as expiryPageRoute} from "@/app/api/reads/dms-expiry-page/route";
import {POST as expiryOutputRoute} from "@/app/api/reads/dms-expiry-output/route";
import {expiryDocumentRowsSchema} from "@/server/reads/dms-expiry-contract";
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
 if(output)fs.writeFileSync(output,JSON.stringify({at:new Date().toISOString(),kind:"P04_NATIVE_SYNTHETIC_READS_AND_REGISTERED_LIFECYCLE",samples,signoutFailures,qualification:"Current synthetic lab, not exact shipping-schema or production evidence. Configuration RLS is unchanged. Empty sets do not establish positive role access. No browser measurements."},null,2),{flag:"wx"});
 expect(signoutFailures).toBe(0);
});
const resources:[ConfigurationResource,string,string][]=[
 ["currencies","currencies","is_active"],["banks","banks","is_active"],["paymentTerms","payment_terms","is_active"],["taxTypes","tax_types","is_active"],["uomCategories","uom_categories","is_active"],["unitsOfMeasure","units_of_measure","is_active"],
 ["ownerCompanies","owner_companies","status"],["branches","branches","status"],["costCenters","cost_centers","is_active"],["profitCenters","profit_centers","is_active"],["countries","countries","is_active"],["emirates","emirates","is_active"],["cities","cities","is_active"],["areas","areas_zones","is_active"],["ports","ports","is_active"],
];
it("expiry paging and complete outputs preserve scoped full sets, views, filters and tails",async()=>{
 const call=async(route:typeof expiryPageRoute,params:unknown)=>{
  const start=performance.now();const response=await route(new Request("http://127.0.0.1:16801/api/reads/expiry",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(params)}));
  const body=await response.json();expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
  return {status:response.status,body,elapsedMs:Math.round(performance.now()-start)};
 };
 for(const actor of ["admin","company","branch"]){
  state.client=clients.get(actor)!;
  for(const view of actor==="admin"?["all","expired","expiring","missing_expiry","ignored"] as const:["all"] as const){
   const baseline=await getDmsExpiringDocuments({view});
   if(!baseline.success){
    const diagnostic=await state.client.from("dms_documents").select("id,document_no,title,expiry_date,issue_date,status,confidentiality:confidentiality_level,expiry_tracking_override,expiry_override_reason,document_type:dms_document_types!document_type_id(name_en,is_renewable),category:dms_document_types!document_type_id(category:dms_document_categories!category_id(name_en))",{count:"exact"}).is("deleted_at",null).neq("status","superseded").order("expiry_date",{ascending:true,nullsFirst:false}).order("id").range(0,24);
    const shape=expiryDocumentRowsSchema.safeParse(diagnostic.data);
    samples.push({actor,resource:"expiry-reference-diagnostic",status:diagnostic.status,count:diagnostic.count,error:diagnostic.error?{code:diagnostic.error.code,message:diagnostic.error.message}:null,shape:shape.success?"valid":shape.error.issues.map(i=>({path:i.path,code:i.code})),candidateStatus:(await call(expiryPageRoute,{view})).status});
   }
   expect(baseline.success,`${actor}/${view} reference`).toBe(true);
   const rows=baseline.data!,first=await call(expiryPageRoute,{view});expect(first.status,`${actor}/${view} first`).toBe(200);expect(first.body.data.rows).toEqual(rows.slice(0,25));expect(first.body.data.totalCount).toBe(rows.length);
   const complete=await call(expiryOutputRoute,{view});expect(complete.status,`${actor}/${view} complete`).toBe(200);expect(complete.body.data.rows).toEqual(rows);expect(complete.body.data.totalCount).toBe(rows.length);
   samples.push({actor,resource:"expiry-page-output",view,total:rows.length,firstRows:first.body.data.rows.length,pageMs:first.elapsedMs,completeMs:complete.elapsedMs});
   if(view==="all"){
    expect(rows.length,`${actor} positive scope beyond backend cap`).toBeGreaterThan(1000);
    const last=Math.ceil(rows.length/25),tail=await call(expiryPageRoute,{view,page:last}),outside=await call(expiryPageRoute,{view,page:last+1});
    expect(tail.status).toBe(200);expect(tail.body.data.rows).toEqual(rows.slice((last-1)*25));expect(outside.status).toBe(200);expect(outside.body.data).toMatchObject({rows:[],totalCount:rows.length});
    const search=rows[0].document_no,filtered=rows.filter(r=>[r.document_no,r.title,r.status,r.document_type??"",r.category??"",r.expiry_override_reason??""].some(v=>v.toLowerCase().includes(search.toLowerCase())));
    const found=await call(expiryOutputRoute,{view,search});expect(found.status).toBe(200);expect(found.body.data.rows.map((r:{id:number})=>r.id)).toEqual(filtered.map(r=>r.id));
    const column=rows[0].title,byTitle=await call(expiryOutputRoute,{view,columnFilters:{document_no:column}});expect(byTitle.status).toBe(200);expect(byTitle.body.data.rows).toEqual(rows.filter(r=>r.title.toLowerCase().includes(column.toLowerCase())));
    const sorted=await call(expiryPageRoute,{view,sortKey:"document_type",sortDir:"asc"});expect(sorted.status,`${actor} relation sort`).toBe(200);expect(sorted.body.data.totalCount).toBe(rows.length);
    samples.push({actor,resource:"expiry-tail-filter-sort",last,tail:tail.body.data.rows.length,searchCount:filtered.length,relationSort:true});
   }
  }
 }
 state.client=clients.get("none")!;
 for(const route of [expiryPageRoute,expiryOutputRoute]){const denied=await call(route,{view:"all"});expect(denied.status).toBe(403);expect(denied.body.data).toBeUndefined();}
 samples.push({actor:"none",resource:"expiry-page-output",denied:true});
},180000);
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
 // The interactive reader must match independently counted/full authorized
 // results without requiring the UI to download those complete rows.
 const ordered=renewals.data!;
 const lastPage=Math.ceil(ordered.length/25);
 const chosen=ordered.find(row=>row.document?.title&&row.renewal_no)!;
 expect(chosen).toBeTruthy();
 const pageCases=[
  {name:"first",params:{includeCompleted:true,page:1},expected:ordered.slice(0,25),total:ordered.length},
  {name:"tail",params:{includeCompleted:true,page:lastPage},expected:ordered.slice((lastPage-1)*25),total:ordered.length},
  {name:"outside",params:{includeCompleted:true,page:lastPage+1},expected:[],total:ordered.length},
  {name:"document-filter",params:{includeCompleted:true,columnFilters:{document:chosen.document!.title}},expected:ordered.filter(row=>row.document?.title.toLowerCase().includes(chosen.document!.title.toLowerCase())).slice(0,25),total:ordered.filter(row=>row.document?.title.toLowerCase().includes(chosen.document!.title.toLowerCase())).length},
  {name:"renewal-search",params:{includeCompleted:true,search:chosen.renewal_no!},expected:ordered.filter(row=>[row.renewal_no,row.status,row.priority,row.document?.document_no,row.document?.title,row.assignee?.full_name].some(value=>value?.toLowerCase().includes(chosen.renewal_no!.toLowerCase()))).slice(0,25),total:ordered.filter(row=>[row.renewal_no,row.status,row.priority,row.document?.document_no,row.document?.title,row.assignee?.full_name].some(value=>value?.toLowerCase().includes(chosen.renewal_no!.toLowerCase()))).length},
 ];
 for(const testCase of pageCases){
  const start=performance.now();
  const response=await renewalPageRoute(new Request("http://127.0.0.1:16801/api/reads/dms-renewal-page",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(testCase.params)}));
  expect(response.status,testCase.name).toBe(200);expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
  const body=await response.json();expect(body.data.totalCount,testCase.name).toBe(testCase.total);expect(body.data.rows,testCase.name).toEqual(testCase.expected);
  samples.push({actor:"admin",resource:"renewal-page-"+testCase.name,success:true,total:testCase.total,rows:body.data.rows.length,elapsedMs:Math.round(performance.now()-start),qualification:"Native handler/SDK observation, not browser timing or production guarantee"});
 }
 for(const actor of ["company","branch"]){
  state.client=clients.get(actor)!;
  const prior=await state.client.from("dms_renewal_requests").select("id",{count:"exact"}).is("deleted_at",null).order("created_at",{ascending:false}).order("id").range(0,24);
  expect(prior.error).toBeNull();expect(prior.count).not.toBeNull();
  const response=await renewalPageRoute(new Request("http://127.0.0.1:16801/api/reads/dms-renewal-page",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({includeCompleted:true})}));
  const body=await response.json();expect(response.status).toBe(200);expect(body.data.totalCount).toBe(prior.count);expect(body.data.rows.map((row:{id:number})=>row.id)).toEqual(prior.data!.map(row=>row.id));
  const docIds=[...new Set(body.data.rows.map((row:{document_id:number})=>row.document_id))] as number[];
  const documents=await state.client.from("dms_documents").select("id,document_no,title,expiry_date,document_type_id",{count:"exact"}).in("id",docIds).order("id").range(0,docIds.length-1);
  expect(documents.error).toBeNull();expect(documents.data!.length).toBe(documents.count);
  const docMap=new Map(documents.data!.map(row=>[row.id,row]));for(const row of body.data.rows)expect(row.document).toEqual(docMap.get(row.document_id)??null);
  const fullIds:number[]=[];
  for(let offset=0;offset<prior.count!;offset+=100){const r=await state.client.from("dms_renewal_requests").select("id",{count:"exact"}).is("deleted_at",null).order("created_at",{ascending:false}).order("id").range(offset,offset+99);expect(r.error).toBeNull();expect(r.count).toBe(prior.count);fullIds.push(...r.data!.map(row=>row.id as number));}
  const fullStart=performance.now(),full=await getDmsRenewalRequests({includeCompleted:true});expect(full.success).toBe(true);expect(full.data!.map(row=>row.id)).toEqual(fullIds);expect(full.data!.slice(0,25)).toEqual(body.data.rows);
  samples.push({actor,resource:"renewals-full-scoped",count:full.data!.length,elapsedMs:Math.round(performance.now()-fullStart),completeIdsVerified:true});
  samples.push({actor,resource:"renewal-page-scope-and-document-projection",status:response.status,authorizedTotal:prior.count,positiveScopeAcceptance:Boolean(prior.count),qualification:"Independent ordinary-caller IDs/count/protected document fields; not legacy full joined-reader acceptance"});
 }
 state.client=clients.get("admin")!;
 // Execute the actual route handlers with the same ordinary caller-backed reads.
 // This is native route composition, not an HTTP-server/browser measurement.
 const routes=[{name:"expiry",run:expiryRoute,params:{view:"all"},ids},{name:"summary",run:summaryRoute,params:{}},{name:"renewals",run:renewalRoute,params:{includeCompleted:true},ids:renewalIds}];
 for(const route of routes){
  const response=await route.run(new Request("http://127.0.0.1:16801/api/reads/test",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(route.params)}));
  expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
  const body=await response.json();expect(body.success).toBe(true);
  if(route.ids)expect(body.data.map((row:{id:number})=>row.id).sort((a:number,b:number)=>a-b)).toEqual(route.ids);
  else expect(Object.keys(body.data)).toHaveLength(10);
  samples.push({actor:"admin",resource:"native-route-"+route.name,success:true,total:route.ids?.length,qualification:"Actual handler plus SDK-backed reads, not HTTP/browser timing"});
 }
 state.client=clients.get("none")!;
 const deniedPage=await renewalPageRoute(new Request("http://127.0.0.1:16801/api/reads/dms-renewal-page",{method:"POST",headers:{"content-type":"application/json"},body:"{}"}));
 expect(deniedPage.status).toBe(403);expect((await deniedPage.json()).data).toBeUndefined();samples.push({actor:"none",resource:"renewal-page",status:403});
 for(const denied of [await getDmsExpiringDocuments(),await getDmsExpiryDashboardStats(),await getDmsRenewalRequests()]){samples.push({actor:"none",resource:"expiry-denial",success:denied.success});expect(denied.success).toBe(false);expect(denied.data).toBeUndefined();}
 for(const route of routes){
  const response=await route.run(new Request("http://127.0.0.1:16801/api/reads/test",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(route.params)}));
  expect(response.status).toBe(403);expect((await response.json()).data).toBeUndefined();samples.push({actor:"none",resource:"native-route-"+route.name,status:403});
 }
});

it("DMS item 2 populated archive replacement restore and cleanup",async()=>{
 const stamp="PERF-P04-S2-"+Date.now(),registered:number[]=[];let testRole:number|null=null;const supportIds:Record<string,number[]>={};
 const register=(ids:number[])=>{registered.push(...ids);ids.forEach(id=>state.writeIds.add(id));fs.writeFileSync(output+".fixtures.json",JSON.stringify({marker:stamp,project:"algt-perf-local",ids:registered,supportIds,status:"REGISTERED",productionWrites:0},null,2));};
 try{
  state.client=clients.get("branch")!;
  const basis=await state.client.from("dms_documents").select("id,document_type_id,category_id,owning_company_id,owning_branch_id").is("deleted_at",null).eq("confidentiality_level","internal").order("id").limit(1);
  expect(basis.error).toBeNull();expect(basis.data).toHaveLength(1);
  const {id:_basisId,...scope}=basis.data![0];
  register([]); // Register the unique marker before inserting generated identities.
  const made=await state.admin.from("dms_documents").insert([
   {...scope,document_no:stamp+"-A",title:stamp+" archived approved",status:"active",is_archived:false,approval_status:"approved",confidentiality_level:"internal"},
   {...scope,document_no:stamp+"-R",title:stamp+" replacement",status:"active",is_archived:false,confidentiality_level:"internal"},
   {...scope,document_no:stamp+"-O",title:stamp+" old",status:"superseded",is_archived:true,confidentiality_level:"internal"}
  ]).select("id,document_no").order("document_no");
  expect(made.error,made.error?.message).toBeNull();expect(made.data).toHaveLength(3);
  register(made.data!.map(row=>row.id));
  const a=made.data!.find(row=>row.document_no.endsWith("-A"))!.id,o=made.data!.find(row=>row.document_no.endsWith("-O"))!.id,replacement=made.data!.find(row=>row.document_no.endsWith("-R"))!.id;
  expect((await state.admin.from("dms_documents").update({superseded_by_document_id:replacement}).eq("id",o)).error).toBeNull();
  state.client=clients.get("none")!;expect((await archiveDmsDocument(a)).success).toBe(false);expect((await unarchiveDmsDocument(a)).success).toBe(false);
  state.client=clients.get("admin")!;expect((await archiveDmsDocument(a)).success).toBe(true);
  for(const actor of ["admin","company","branch"]){
   state.client=clients.get(actor)!;const page=await readDmsArchivePage({search:stamp});
   expect(page.success,actor).toBe(true);expect(page.data!.totalCount).toBe(2);expect(page.data!.rows.map(row=>row.id).sort()).toEqual([a,o].sort());
   expect(page.data!.rows.find(row=>row.id===o)?.superseded_by?.id).toBe(replacement);
   const filtered=await readDmsArchivePage({search:stamp,reason:"archived"});expect(filtered.data!.rows.map(row=>row.id)).toEqual([a]);
   const tail=await readDmsArchivePage({search:stamp,page:3,pageSize:1});expect(tail.success).toBe(true);expect(tail.data!.totalCount).toBe(2);expect(tail.data!.rows).toEqual([]);
   samples.push({actor,resource:"archive-populated",count:2,replacementVerified:true,outOfRangeVerified:true});
  }
  state.client=clients.get("branch")!;const testOwner=(await getAuthContext()).profile!.id;
  const role=await state.admin.from("roles").insert({role_code:stamp,role_name:stamp,is_system_role:false}).select("id").single();expect(role.error).toBeNull();testRole=role.data!.id;supportIds.roles=[role.data!.id];register([]);
  const permissionCodes=["dms.documents.upload","dms.documents.review_ai","dms.review_queue.view"];
  const existing=await state.admin.from("permissions").select("permission_code").in("permission_code",permissionCodes);expect(existing.error).toBeNull();
  const missing=permissionCodes.filter(code=>!existing.data!.some(p=>p.permission_code===code));
  if(missing.length){const added=await state.admin.from("permissions").insert(missing.map(code=>({permission_code:code,permission_name:stamp,module_code:"DMS",action_code:code.split(".").at(-1)}))).select("id");expect(added.error).toBeNull();supportIds.permissions=added.data!.map(p=>p.id);register([]);}
  const permissions=await state.admin.from("permissions").select("id").in("permission_code",["dms.documents.upload","dms.documents.review_ai","dms.review_queue.view"]).eq("is_active",true);expect(permissions.error).toBeNull();expect(permissions.data).toHaveLength(3);
  const grants=await state.admin.from("role_permissions").insert(permissions.data!.map(p=>({role_id:testRole,permission_id:p.id}))).select("id");expect(grants.error).toBeNull();supportIds.role_permissions=grants.data!.map(r=>r.id);register([]);
  const assignment=await state.admin.from("user_roles").insert({user_profile_id:testOwner,role_id:testRole,owner_company_id:scope.owning_company_id,branch_id:scope.owning_branch_id}).select("id");expect(assignment.error).toBeNull();supportIds.user_roles=assignment.data!.map(r=>r.id);register([]);
  // Native queue visibility uses real RLS/permissions. Only the optional feature flag is enabled in the test adapter.
  const queued=await state.admin.from("dms_review_queue").insert([{document_id:a,review_type:"ocr_failure_review",status:"open",idempotency_key:stamp+"-review",reason_message:stamp}]).select("id");
  expect(queued.error,queued.error?.message).toBeNull();expect(queued.data).toHaveLength(1);supportIds.review_queue=queued.data!.map(r=>r.id);register([]);
  for(const actor of ["admin","company","branch","none"]){
   state.client=clients.get(actor)!;const ctx=await getAuthContext();const canReview=["dms.review_queue.view","dms.review_queue.manage","dms.documents.review_ai","dms.admin"].some(p=>hasPermission(ctx,p))||ctx.roleCodes.includes("system_admin");
   const reviewed=await getDmsReviewQueueItems({documentId:a,pageSize:1});
   if(canReview){expect(reviewed.success,actor+" review "+reviewed.error).toBe(true);expect(reviewed.data!.total).toBe(1);expect((await getDmsReviewQueueItem(queued.data![0].id)).success).toBe(true);const summary=await getDmsReviewQueueCounts();if(!summary.success){const d=await state.client.from("dms_review_queue").select("id,document:dms_documents!document_id()",{count:"exact"}).or("document_id.not.is.null,upload_session_id.not.is.null").eq("status","open").is("deleted_at",null).limit(1);samples.push({actor,resource:"review-count-diagnostic",error:d.error,count:d.count});}expect(summary.success,summary.error).toBe(true);}
   else expect(reviewed.success).toBe(false);
   samples.push({actor,resource:"review-native",canReview,success:reviewed.success,total:reviewed.data?.total,featureFlag:"test-adapter-only"});
  }
  state.client=clients.get("branch")!;const owner=(await getAuthContext()).profile!.id;
  const batch=await state.admin.from("dms_upload_batches").insert({batch_code:stamp,created_by:owner,total_files:3}).select("id").single();expect(batch.error,batch.error?.message).toBeNull();supportIds.batches=[batch.data!.id];register([]);
  const uploads=await state.admin.from("dms_upload_sessions").insert([0,1,2].map(i=>({session_code:stamp+"-"+i,original_filename:stamp+"-"+i+".pdf",mime_type:"application/pdf",file_size_bytes:12,uploaded_by:owner,owning_company_id:scope.owning_company_id,owning_branch_id:scope.owning_branch_id,batch_id:batch.data!.id,status:i===2?"completed":"uploaded",intake_status:"failed"}))).select("id");expect(uploads.error,uploads.error?.message).toBeNull();supportIds.uploads=uploads.data!.map(r=>r.id);register([]);
  for(const actor of ["admin","branch"]){state.client=clients.get(actor)!;
   const page=await readDmsInboxPage({search:stamp,pageSize:1,page:2});expect(page.success,actor+" inbox "+page.error).toBe(true);expect(page.data!.rows).toHaveLength(1);expect(page.data!.totalCount).toBe(2);
   const drafts=await getDmsUploadBatchDrafts(batch.data!.id);expect(drafts.success,drafts.error).toBe(true);expect(drafts.data).toHaveLength(3);
   const batches=await listDmsUploadBatches();expect(batches.success,batches.error).toBe(true);expect(batches.data?.find(r=>r.id===batch.data!.id)?.failedCount).toBe(3);
   samples.push({actor,resource:"inbox-batch-native",inboxCount:2,batchDrafts:3,summaryFailedCount:3});
  }
  state.client=clients.get("none")!;expect((await readDmsInboxPage({search:stamp})).success).toBe(false);expect((await getDmsUploadBatchDrafts(batch.data!.id)).success).toBe(false);
  state.client=clients.get("admin")!;
  for(const kind of ["getDmsDocumentComments","getDmsDocumentFiles","getDmsDocumentVersions","getDmsDocumentMetadataValues","getDmsDocumentTags","getDmsDocumentLinks","getDmsAiMetadataApplyHistory","getEligibleUploadSessionsForVersionLink","getDocumentApprovalHistory"]){
   const result=await readDmsSection({kind,args:[a]});expect(result.success,kind+" "+result.error).toBe(true);samples.push({actor:"admin",resource:"native-section-contract",kind,success:true,fixture:"registered synthetic document"});
  }
  // A replacement losing visibility must not leak its title through the old record.
  expect((await state.admin.from("dms_documents").update({confidentiality_level:"executive"}).eq("id",replacement)).error).toBeNull();
  state.client=clients.get("branch")!;const hidden=await readDmsArchivePage({search:stamp});expect(hidden.success).toBe(true);expect(hidden.data!.rows.find(row=>row.id===o)?.superseded_by).toBeNull();
  state.client=clients.get("admin")!;expect((await unarchiveDmsDocument(a)).success).toBe(true);
  const restored=await state.admin.from("dms_documents").select("status,is_archived,approval_status").eq("id",a).single();
  expect(restored.error).toBeNull();expect(restored.data).toEqual({status:"approved",is_archived:false,approval_status:"approved"});
  expect((await readDmsArchivePage({search:stamp})).data!.rows.map(row=>row.id)).toEqual([o]);
  samples.push({resource:"approved-archive-restore",noRoleDenied:true,restoredStatus:"approved",hiddenReplacementNull:true});
 }finally{
  if(testRole!==null){for(const table of ["user_roles","role_permissions"]){expect((await state.admin.from(table).delete().eq("role_id",testRole)).error).toBeNull();expect((await state.admin.from(table).select("id",{count:"exact"}).eq("role_id",testRole)).count).toBe(0);}expect((await state.admin.from("roles").delete().eq("id",testRole).eq("role_code",stamp)).error).toBeNull();expect((await state.admin.from("roles").select("id",{count:"exact"}).eq("id",testRole)).count).toBe(0);}
  if(supportIds.permissions?.length){expect((await state.admin.from("permissions").delete().in("id",supportIds.permissions).eq("permission_name",stamp)).error).toBeNull();expect((await state.admin.from("permissions").select("id",{count:"exact"}).in("id",supportIds.permissions)).count).toBe(0);}
  if(registered.length){
   expect((await state.admin.from("dms_review_queue").delete().eq("idempotency_key",stamp+"-review")).error).toBeNull();
   expect((await state.admin.from("dms_upload_sessions").delete().like("session_code",stamp+"-%")).error).toBeNull();
   expect((await state.admin.from("dms_upload_batches").delete().eq("batch_code",stamp)).error).toBeNull();
   for(const [table,column,marker] of [["dms_review_queue","idempotency_key",stamp+"-review"],["dms_upload_sessions","session_code",stamp+"-%"],["dms_upload_batches","batch_code",stamp]]){const remaining=await state.admin.from(table).select("id",{count:"exact"}).like(column,marker);expect(remaining.error).toBeNull();expect(remaining.count).toBe(0);}
   expect((await state.admin.from("dms_document_events").delete().in("document_id",registered)).error).toBeNull();
   expect((await state.admin.from("dms_documents").delete().in("id",registered).like("document_no",stamp+"%")).error).toBeNull();
   const remains=await state.admin.from("dms_documents").select("id",{count:"exact"}).in("id",registered);
   expect(remains.error).toBeNull();expect(remains.count).toBe(0);
   fs.writeFileSync(output+".fixtures.json",JSON.stringify({marker:stamp,project:"algt-perf-local",ids:registered,status:"REMOVED_VERIFIED",productionWrites:0},null,2));
   state.writeIds.clear();samples.push({resource:"archive-fixture-cleanup",registered:registered.length,remaining:0});
  }
 }
},180000);
