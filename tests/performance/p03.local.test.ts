// Explicitly opted-in, synthetic loopback lab only. Never part of ordinary CI.
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createClient as sdk, type SupabaseClient } from "@supabase/supabase-js";
const state=vi.hoisted(()=>({client:null as unknown as SupabaseClient,admin:null as unknown as SupabaseClient}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>state.client}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>state.admin}));
vi.mock("next/cache",()=>({revalidatePath:()=>{}}));
vi.mock("next/headers",()=>({headers:async()=>new Headers()}));
import { withDocumentReadPolicy } from "@/lib/supabase/document-read-policy";
import { getAuthContext } from "@/lib/rbac/check";
import { getReadAuthContext, withReadRequest } from "@/server/reads/read-context";
import {readEmployees} from "@/server/reads/employees";
import {readDepartments} from "@/server/reads/departments";
import {readEmployeeFilterOptions} from "@/server/reads/employee-filter-options";
import {readDmsDocumentPage,readAllDmsDocuments} from "@/server/reads/dms-documents";
import {listEmployees} from "@/server/actions/hr/employees";
import {listDepartments} from "@/server/actions/common-master-data/departments";
import { performanceFetch } from "@/lib/performance/trace";
const actualFetch=globalThis.fetch;
const clients=new Map<string,SupabaseClient>();
const actorProfiles=new Map<string,number>();
const samples: Array<Record<string,unknown>>=[];
const events: Array<Record<string,unknown>>=[];
let calls=0, bytes=0, recording=false;
let bodies:Promise<void>[]=[];
let failureCodes:string[]=[];
let output="";
let signoutFailures=0;
function required(name:string){const value=process.env[name];if(!value)throw new Error("Explicit P02 lab inputs required");return value;}
function read(file:string){return JSON.parse(fs.readFileSync(file,"utf8"));}
beforeAll(async()=>{
  if(process.env.PERF_P03_LOCAL!=="approved-synthetic-only")throw new Error("Local admission required");
  const admission=read(required("PERF_P03_ADMISSION"));
  if(admission.project!=="algt-perf-local"||admission.api!=="http://127.0.0.1:16821"||admission.providersDisabled!==true||admission.verified!==true||Date.now()-Date.parse(admission.at)>600000)throw new Error("Missing/freshness/target admission failure");
  const file=required("PERF_P03_ENVIRONMENT");
  if(crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")!==admission.environmentSha256)throw new Error("Environment changed after admission");
  const config=read(file);
  if(config.project!=="algt-perf-local"||config.syntheticOnly!==true||config.externalDelivery!==false||config.api!==admission.api)throw new Error("Synthetic target mismatch");
  output=required("PERF_P03_OUTPUT");if(fs.existsSync(output))throw new Error("Refusing evidence overwrite");fs.mkdirSync(path.dirname(output),{recursive:true});
  process.env.ERP_WORKERS_ENABLED="false";process.env.F09_EMAIL_WORKER_ENABLED="false";process.env.AI_SECRET_FILE_WRITES_ENABLED="false";
  process.env.ALGT_PERF_ENABLED="false";process.env.ALGT_PERF_LOG_RETENTION_DAYS="1";process.env.ALGT_PERF_SAMPLE_PERCENT="100";process.env.ALGT_PERF_MAX_TRACES_PER_MINUTE="2000";
  vi.spyOn(console,"info").mockImplementation((value:unknown)=>{if(recording&&typeof value==="string"&&value.startsWith('{"event":"algt.perf.v1"'))events.push(JSON.parse(value));});
  vi.stubGlobal("fetch",async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=new URL(input instanceof Request?input.url:String(input));if(url.origin!==config.api)throw new Error("Outbound target rejected");
    const response=await actualFetch(input,init);
    if(recording){calls++;bodies.push(response.clone().arrayBuffer().then(body=>{bytes+=body.byteLength;if(!response.ok){try{const code=JSON.parse(new TextDecoder().decode(body)).code;if(typeof code==="string"&&/^[A-Z0-9_]{1,20}$/.test(code))failureCodes.push(code);}catch{/* never preserve raw errors */}}}));}return response;
  });
  state.admin=sdk(config.api,config.service,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:performanceFetch}});
  const actors=read(required("PERF_P03_ACTORS"));
  for(const name of ["admin","company","none","self","manager","branch","other","combined"]){
    const actor=actors[name];if(typeof actor?.email!=="string"||!actor.email.endsWith("@example.invalid"))throw new Error("Synthetic actor required");
    const client=sdk(config.api,config.anon,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:performanceFetch}});
    const result=await client.auth.signInWithPassword(actor);if(result.error)throw new Error("Synthetic sign-in failed");clients.set(name,withDocumentReadPolicy(client));actorProfiles.set(name,actor.profileId);
  }
});
afterAll(async()=>{
  recording=false;process.env.ALGT_PERF_ENABLED="false";
  for(const client of clients.values()){try{const result=await client.auth.signOut({scope:"local"});if(result.error)signoutFailures++;}catch{signoutFailures++;}}
  vi.restoreAllMocks();vi.unstubAllGlobals();
  if(output)fs.writeFileSync(output,JSON.stringify({at:new Date().toISOString(),kind:"P03_NATIVE_PILOT_MEASUREMENT",samples,signoutFailures,qualification:"Current synthetic lab includes later SQL. Service comparisons do not establish shipping-schema parity, browser readiness or production SLA. F06 scoped configuration compatibility remains open."},null,2),{flag:"wx"});
  expect(signoutFailures).toBe(0);
});


it("independent employee actors retain self/team/company/branch/combined scope",async()=>{
 for(const [actor,total]of Object.entries({admin:1107,company:1103,none:0,self:1,manager:2,branch:1051,other:4,combined:1051})){
  state.client=clients.get(actor)!;const r=await readEmployees({pageSize:25});
  samples.push({scenario:"employees.scope."+actor,success:r.success,total:r.data?.totalCount});
  if(actor==="none")expect(r.success).toBe(false);else {expect(r.success,actor).toBe(true);expect(r.data?.totalCount).toBe(total);expect(r.data?.rows.every(row=>row.blood_group===null)).toBe(true);}
 }
 state.client=clients.get("company")!;const tail=await readEmployees({page:12,pageSize:100});expect(tail.data?.rows).toHaveLength(3);
});
it("employee English/Arabic/literal search and seven complete-result sort keys",async()=>{
 state.client=clients.get("admin")!;
 for(const sortKey of ["employee_code","full_name_en","nationality","department","designation","employee_status","company"] as const){const r=await readEmployees({sortKey,sortDir:"desc"});expect(r.success,sortKey).toBe(true);}
 expect((await readEmployees({search:"PERF-E01107"})).data?.totalCount).toBe(1);
 expect((await readEmployees({search:"موظف تجريبي"})).data?.totalCount).toBe(553);
 for(const search of ["%","_",",),employee_code.neq.",'"',"\\"]){expect((await readEmployees({search})).data?.totalCount).toBe(0);}
});
it("DMS actor scopes, tail pages, count, seven sorts and complete legacy results",async()=>{
 for(const [actor,total]of Object.entries({admin:1107,company:1103,branch:1051,other:4,combined:1055})){
  state.client=clients.get(actor)!;calls=0;bytes=0;bodies=[];failureCodes=[];recording=true;
  const start=performance.now();const r=await readDmsDocumentPage({filters:{excludeArchived:true,search:"PERF-DOC",searchMode:"quick"}});
  recording=false;await Promise.all(bodies);
  samples.push({scenario:"documents.scope."+actor,success:r.success,total:r.data?.totalCount,ms:performance.now()-start,calls,bytes,failureCodes});
  expect(r.success,actor).toBe(true);expect(r.data?.totalCount).toBe(total);
 }
 state.client=clients.get("none")!;expect((await readDmsDocumentPage({})).success).toBe(false);
 state.client=clients.get("company")!;
 expect((await readDmsDocumentPage({filters:{search:"PERF-DOC01107",searchMode:"quick"}})).data?.totalCount).toBe(0);
 expect((await readDmsDocumentPage({page:12,pageSize:100,sortKey:"document_no",sortDir:"asc",filters:{search:"PERF-DOC",searchMode:"quick"}})).data?.rows).toHaveLength(3);
 state.client=clients.get("admin")!;
 for(const sortKey of ["created_at","document_no","title","document_type","status","expiry_date","tags"]){const r=await readDmsDocumentPage({sortKey});expect(r.success,sortKey).toBe(true);}
 expect((await readDmsDocumentPage({filters:{search:"مستند تجريبي",searchMode:"quick"}})).data?.totalCount).toBe(553);
 const all=await readAllDmsDocuments({excludeArchived:true,search:"PERF-DOC",searchMode:"quick"});expect(all.success).toBe(true);expect(all.data).toHaveLength(1107);expect(new Set(all.data?.map(r=>r.id)).size).toBe(1107);
});
it("bounded department choices preserve parents and selected inactive labels",async()=>{
 state.client=clients.get("admin")!;
 const all=await readDepartments();expect(all.success).toBe(true);expect(all.data).toHaveLength(12);
 const selected=await readEmployeeFilterOptions("departments",{owner_company_id:880101,selectedId:880110});expect(selected.data?.find(r=>r.value===880110)?.label).toContain("inactive");
 const foreign=await readEmployeeFilterOptions("departments",{owner_company_id:880101,selectedId:880111});expect(foreign.data?.find(r=>r.value===880111)).toBeUndefined();
 expect((await readEmployeeFilterOptions("designations",{owner_company_id:880101,department_id:880101})).data?.map(r=>r.value)).toEqual([880101]);
 for(const kind of ["countries","companies"] as const)expect((await readEmployeeFilterOptions(kind,{})).success).toBe(true);
 state.client=clients.get("company")!;const scoped=await readDepartments();samples.push({scenario:"departments.F06_scoped_compatibility",success:scoped.success,rows:scoped.data?.length,qualification:"DIAGNOSTIC_NOT_POSITIVE_ACCESS_ACCEPTANCE"});
});
it("database-side file/content filters have complementary exact counts",async()=>{
 state.client=clients.get("admin")!;
 const total=(await readDmsDocumentPage({})).data!.totalCount;
 for(const key of ["has_files","hasExtractedText"]){
  const yes=await readDmsDocumentPage({filters:{[key]:true}}),no=await readDmsDocumentPage({filters:{[key]:false}});
  expect(yes.success,key+" true").toBe(true);expect(no.success,key+" false").toBe(true);
  expect(yes.data!.totalCount+no.data!.totalCount).toBe(total);
 }
 const content=await readDmsDocumentPage({filters:{search:"absent-P03-content",searchMode:"content"}});
 expect(content.success).toBe(true);expect(content.data?.totalCount).toBe(0);
});
it("an existing session loses both pilots after synthetic profile suspension",async()=>{
 state.client=clients.get("company")!;
 const id=actorProfiles.get("company");expect(Number.isSafeInteger(id)).toBe(true);
 const identity=await state.client.auth.getUser();expect(identity.error).toBeNull();
 const before=await state.admin.from("user_profiles").select("id,status,auth_user_id").eq("id",id!).single();
 expect(before.error).toBeNull();expect(before.data!.auth_user_id).toBe(identity.data.user!.id);expect(before.data!.status).toBe("active");
 const changed=await state.admin.from("user_profiles").update({status:"suspended"}).eq("id",id!).eq("auth_user_id",identity.data.user!.id).select("id");expect(changed.error).toBeNull();expect(changed.data).toHaveLength(1);
 try {
  expect((await readEmployees({})).success).toBe(false);expect((await readDmsDocumentPage({})).success).toBe(false);
  // Supplied stale server context must not bypass live database principal validation.
  const raw=await state.client.rpc("f03_read_documents",{},{get:true}).select("id").range(0,0);expect(raw.error).toBeNull();expect(raw.data).toEqual([]);
 } finally {
  const restored=await state.admin.from("user_profiles").update({status:before.data!.status}).eq("id",id!).eq("status","suspended").select("id");expect(restored.error).toBeNull();expect(restored.data).toHaveLength(1);
 }
 samples.push({scenario:"suspended_session",status:"PASS_RESTORED",profileId:id});
});
it("retains ten alternating DMS payload/page comparisons on the same protected SQL",async()=>{
 state.client=clients.get("company")!;
 for(let repeat=0;repeat<10;repeat++)for(const candidate of repeat%2?[true,false]:[false,true]){
  calls=0;bytes=0;bodies=[];failureCodes=[];recording=true;const start=performance.now();
  const ctx=await getAuthContext();
  let rows:number,total:number|undefined;
  if(candidate){const r=await readDmsDocumentPage({filters:{excludeArchived:true}},ctx);expect(r.success).toBe(true);rows=r.data!.rows.length;total=r.data!.totalCount;}
  else {
   // Reproduce the old unbounded list/payload shape on the SAME candidate SQL.
   // This is not a frozen-baseline SQL latency claim and the API cap is explicit.
   await getAuthContext();
   const r=await state.client.from("dms_documents").select("id,document_no,legacy_document_code,title,description,document_type_id,category_id,status,confidentiality_level,owner_user_id,owning_company_id,owning_branch_id,party_id,issue_date,expiry_date,reminder_policy_id,ocr_status,ai_status,review_status,is_archived,archived_at,created_by,created_at,updated_by,updated_at,deleted_at,ai_risk_score,ai_risk_level,completeness_score,superseded_by_document_id,document_type:dms_document_types(type_code,name_en,requires_expiry_tracking,default_confidentiality),category:dms_document_categories(category_code,name_en),tags:dms_document_tags(tag_id,tag:dms_tags(tag_name,color_hex))").is("deleted_at",null).not("status","in",'("archived","superseded")').order("created_at",{ascending:false});
   expect(r.error).toBeNull();rows=r.data!.length;expect(rows).toBe(1000);
  }
  const ms=performance.now()-start;recording=false;await Promise.all(bodies);
  samples.push({scenario:"documents.payload.paired",repeat,candidate,ms,calls,bytes,rows,total,qualification:"same candidate SQL; old payload API-capped at 1000"});
 }
});
it("retains ten alternating service pairs for Employees and Departments",async()=>{
 state.client=clients.get("admin")!;
 for(const scenario of ["employees","departments"]){
  for(let repeat=0;repeat<10;repeat++){
   let expected:number[]|undefined;
   for(const candidate of repeat%2?[true,false]:[false,true]){
    calls=0;bytes=0;bodies=[];failureCodes=[];recording=true;const start=performance.now();
    const ctx=await getAuthContext();
    const result=scenario==="employees"?(candidate?await readEmployees({page:1,pageSize:25},ctx):await listEmployees({page:1,pageSize:25})):(candidate?await readDepartments({},ctx):await listDepartments({}));
    const ms=performance.now()-start;recording=false;await Promise.all(bodies);expect(result.success).toBe(true);
    const data=result.data!;const rows=Array.isArray(data)?data:data.rows;const ids=rows.map(row=>row.id);
    if(expected)expect(ids).toEqual(expected);else expected=ids;
    samples.push({scenario:scenario+".paired",repeat,candidate,ms,calls,bytes,rows:rows.length,success:result.success});
   }
  }
 }
});
