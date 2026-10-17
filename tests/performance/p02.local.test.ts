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
import { readLookupValues, readLookupSearch } from "@/server/reads/lookup-values";
import { performanceFetch } from "@/lib/performance/trace";
const actualFetch=globalThis.fetch;
const clients=new Map<string,SupabaseClient>();
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
  if(process.env.PERF_P02_LOCAL!=="approved-synthetic-only")throw new Error("Local admission required");
  const admission=read(required("PERF_P02_ADMISSION"));
  if(admission.project!=="algt-perf-local"||admission.api!=="http://127.0.0.1:16821"||admission.providersDisabled!==true||admission.verified!==true||Date.now()-Date.parse(admission.at)>600000)throw new Error("Missing/freshness/target admission failure");
  const file=required("PERF_P02_ENVIRONMENT");
  if(crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")!==admission.environmentSha256)throw new Error("Environment changed after admission");
  const config=read(file);
  if(config.project!=="algt-perf-local"||config.syntheticOnly!==true||config.externalDelivery!==false||config.api!==admission.api)throw new Error("Synthetic target mismatch");
  output=required("PERF_P02_OUTPUT");if(fs.existsSync(output))throw new Error("Refusing evidence overwrite");fs.mkdirSync(path.dirname(output),{recursive:true});
  process.env.ERP_WORKERS_ENABLED="false";process.env.F09_EMAIL_WORKER_ENABLED="false";process.env.AI_SECRET_FILE_WRITES_ENABLED="false";
  process.env.ALGT_PERF_ENABLED="false";process.env.ALGT_PERF_LOG_RETENTION_DAYS="1";process.env.ALGT_PERF_SAMPLE_PERCENT="100";process.env.ALGT_PERF_MAX_TRACES_PER_MINUTE="2000";
  vi.spyOn(console,"info").mockImplementation((value:unknown)=>{if(recording&&typeof value==="string"&&value.startsWith('{"event":"algt.perf.v1"'))events.push(JSON.parse(value));});
  vi.stubGlobal("fetch",async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=new URL(input instanceof Request?input.url:String(input));if(url.origin!==config.api)throw new Error("Outbound target rejected");
    const response=await actualFetch(input,init);
    if(recording){calls++;bodies.push(response.clone().arrayBuffer().then(body=>{bytes+=body.byteLength;if(!response.ok){try{const code=JSON.parse(new TextDecoder().decode(body)).code;if(typeof code==="string"&&/^[A-Z0-9_]{1,20}$/.test(code))failureCodes.push(code);}catch{/* never preserve raw errors */}}}));}return response;
  });
  state.admin=sdk(config.api,config.service,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:performanceFetch}});
  const actors=read(required("PERF_P02_ACTORS"));
  for(const name of ["admin","company","none"]){
    const actor=actors[name];if(typeof actor?.email!=="string"||!actor.email.endsWith("@example.invalid"))throw new Error("Synthetic actor required");
    const client=sdk(config.api,config.anon,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:performanceFetch}});
    const result=await client.auth.signInWithPassword(actor);if(result.error)throw new Error("Synthetic sign-in failed");clients.set(name,withDocumentReadPolicy(client));
  }
});
afterAll(async()=>{
  recording=false;process.env.ALGT_PERF_ENABLED="false";
  for(const client of clients.values()){try{const result=await client.auth.signOut({scope:"local"});if(result.error)signoutFailures++;}catch{signoutFailures++;}}
  vi.restoreAllMocks();vi.unstubAllGlobals();
  if(output)fs.writeFileSync(output,JSON.stringify({at:new Date().toISOString(),kind:"P02_REQUEST_LOCAL_AUTH_PAIRED_MEASUREMENT",samples,signoutFailures,qualification:"Same-source sequential/reused authority pairs; current synthetic lab, not historic schema parity, browser timing or production SLA. Lookup visibility is diagnostic, not rollout acceptance."},null,2),{flag:"wx"});
  expect(signoutFailures).toBe(0);
});

it("measures repeated live authority with and without explicit request-local reuse",async()=>{
 for(const actor of ["admin","company","none"]){
  state.client=clients.get(actor)!;
  for(let repeat=0;repeat<10;repeat++){
   let expected:string|undefined;
   for(const reuse of repeat%2?[true,false]:[false,true]){
    calls=0;bytes=0;bodies=[];failureCodes=[];recording=true;
    const start=performance.now();
    const result=reuse?await withReadRequest(async()=>[await getReadAuthContext(),await getReadAuthContext()]):[await getAuthContext(),await getAuthContext()];
    const ms=performance.now()-start;recording=false;await Promise.all(bodies);
    const digest=crypto.createHash("sha256").update(JSON.stringify(result)).digest("hex");
    if(expected)expect(digest).toBe(expected);else expected=digest;
    expect(result[0].profile).not.toBeNull();expect(result[0].isAccountActive).toBe(true);
    samples.push({scenario:"auth."+actor,repeat,reuse,ms,calls,bytes,resultSha256:digest,success:true});
   }
  }
 }
 for(const actor of ["admin","company","none"]){
  const rows=samples.filter(s=>s.scenario==="auth."+actor);
  for(let repeat=0;repeat<10;repeat++){
   const pair=rows.filter(s=>s.repeat===repeat);
   expect(Number(pair.find(s=>s.reuse)?.calls)*2).toBe(Number(pair.find(s=>!s.reuse)?.calls));
  }
 }
});
it("records current lookup visibility without changing F06 policies",async()=>{
 for(const actor of ["admin","company","none"]){
  state.client=clients.get(actor)!;calls=0;bytes=0;bodies=[];recording=true;
  const result=await withReadRequest(()=>readLookupValues({categoryCode:"PERF_CHOICES"}));
  recording=false;await Promise.all(bodies);
  samples.push({scenario:"lookup."+actor,success:result.success,calls,bytes,rows:result.data?.length??null,qualification:"DIAGNOSTIC_ONLY_EXISTING_F06_SCOPE_NOT_ROLLOUT_ACCEPTANCE"});
 }
});
it("native lookup search pages the same synthetic category and does not widen wildcard searches",async()=>{
 state.client=clients.get("admin")!;
 const all=await readLookupValues({categoryCode:"PERF_CHOICES"});expect(all.success).toBe(true);
 const first=await readLookupSearch({categoryCode:"PERF_CHOICES"});
 const second=await readLookupSearch({categoryCode:"PERF_CHOICES",page:2});
 expect(first.success).toBe(true);expect(second.success).toBe(true);
 expect(first.data?.rows).toHaveLength(25);expect(second.data?.rows).toHaveLength(25);
 expect(first.data?.totalCount).toBe(all.data?.length);expect(second.data?.totalCount).toBe(all.data?.length);
 expect(new Set([...first.data!.rows,...second.data!.rows].map(row=>row.id)).size).toBe(50);
 const literal=await readLookupSearch({categoryCode:"PERF_CHOICES",search:"%"});
 expect(literal.success).toBe(true);expect(literal.data?.rows.every(row=>row.value_label_en.includes("%"))).toBe(true);
 samples.push({scenario:"lookup.native-search",success:true,pageSize:25,totalCount:first.data?.totalCount,distinctRowsAcrossTwoPages:50,literalSearchCount:literal.data?.totalCount});
});
