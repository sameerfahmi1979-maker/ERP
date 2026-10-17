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
import { listEmployees } from "@/server/actions/hr/employees";
import { listDepartments, getDepartmentComboboxOptions } from "@/server/actions/common-master-data/departments";
import { getDmsDocuments } from "@/server/actions/dms/documents";
import { performanceFetch, traceOperation, tracedJsonResponse } from "@/lib/performance/trace";
const actualFetch=globalThis.fetch;
const clients=new Map<string,SupabaseClient>();
const samples: Array<Record<string,unknown>>=[];
const events: Array<Record<string,unknown>>=[];
let calls=0, bytes=0, recording=false;
let bodies:Promise<void>[]=[];
let failureCodes:string[]=[];
let output="";
let signoutFailures=0;
function required(name:string){const value=process.env[name];if(!value)throw new Error("Explicit P01 lab inputs required");return value;}
function read(file:string){return JSON.parse(fs.readFileSync(file,"utf8"));}
beforeAll(async()=>{
  if(process.env.PERF_P01_LOCAL!=="approved-synthetic-only")throw new Error("Local admission required");
  const admission=read(required("PERF_P01_ADMISSION"));
  if(admission.project!=="algt-perf-local"||admission.api!=="http://127.0.0.1:16821"||admission.providersDisabled!==true||admission.verified!==true||Date.now()-Date.parse(admission.at)>600000)throw new Error("Missing/freshness/target admission failure");
  const file=required("PERF_P01_ENVIRONMENT");
  if(crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")!==admission.environmentSha256)throw new Error("Environment changed after admission");
  const config=read(file);
  if(config.project!=="algt-perf-local"||config.syntheticOnly!==true||config.externalDelivery!==false||config.api!==admission.api)throw new Error("Synthetic target mismatch");
  output=required("PERF_P01_OUTPUT");if(fs.existsSync(output))throw new Error("Refusing evidence overwrite");fs.mkdirSync(path.dirname(output),{recursive:true});
  process.env.ERP_WORKERS_ENABLED="false";process.env.F09_EMAIL_WORKER_ENABLED="false";process.env.AI_SECRET_FILE_WRITES_ENABLED="false";
  process.env.ALGT_PERF_ENABLED="false";process.env.ALGT_PERF_LOG_RETENTION_DAYS="1";process.env.ALGT_PERF_SAMPLE_PERCENT="100";process.env.ALGT_PERF_MAX_TRACES_PER_MINUTE="2000";
  vi.spyOn(console,"info").mockImplementation((value:unknown)=>{if(recording&&typeof value==="string"&&value.startsWith('{"event":"algt.perf.v1"'))events.push(JSON.parse(value));});
  vi.stubGlobal("fetch",async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=new URL(input instanceof Request?input.url:String(input));if(url.origin!==config.api)throw new Error("Outbound target rejected");
    const response=await actualFetch(input,init);
    if(recording){calls++;bodies.push(response.clone().arrayBuffer().then(body=>{bytes+=body.byteLength;if(!response.ok){try{const code=JSON.parse(new TextDecoder().decode(body)).code;if(typeof code==="string"&&/^[A-Z0-9_]{1,20}$/.test(code))failureCodes.push(code);}catch{/* never preserve raw errors */}}}));}return response;
  });
  state.admin=sdk(config.api,config.service,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:performanceFetch}});
  const actors=read(required("PERF_P01_ACTORS"));
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
  if(output)fs.writeFileSync(output,JSON.stringify({at:new Date().toISOString(),kind:"CURRENT_P01_SERVICE_DIAGNOSTICS_NOT_BROWSER_NOT_OLD_BASELINE",samples,signoutFailures,qualification:"Same-source on/off observations; laboratory database already includes separately owned performance migrations. No historic schema parity, production SLA or P02-P04 acceptance inferred."},null,2),{flag:"wx"});
  expect(signoutFailures).toBe(0);
});
it("measures current protected operations with paired telemetry off/on and unchanged results",async()=>{
  const tasks=[
    {name:"employees.admin",actor:"admin",read:()=>listEmployees({page:1,pageSize:25})},
    {name:"employees.company",actor:"company",read:()=>listEmployees({page:1,pageSize:25})},
    {name:"departments.admin",actor:"admin",read:()=>listDepartments({})},
    {name:"departments.lookup",actor:"admin",read:()=>getDepartmentComboboxOptions()},
    {name:"documents.company",actor:"company",read:()=>getDmsDocuments({excludeArchived:true})},
  ];
  for(const task of tasks){
    state.client=clients.get(task.actor)!;
    for(let repeat=0;repeat<10;repeat++){
      let expected:string|undefined;
      let timeouts=0;
      // Alternate order to reduce a fixed warm-cache bias; no parallel benchmarks.
      for(const enabled of repeat%2?[true,false]:[false,true]){
        process.env.ALGT_PERF_ENABLED=String(enabled);calls=0;bytes=0;bodies=[];failureCodes=[];events.length=0;recording=true;
        const start=performance.now();let result;
        try{result=await task.read();}finally{recording=false;}
        const ms=performance.now()-start;await Promise.all(bodies);
        const digest=crypto.createHash("sha256").update(JSON.stringify(result)).digest("hex");
        samples.push({scenario:task.name,repeat,enabled,ms,calls,bytes,resultSha256:digest,success:result.success,failureCodes:[...failureCodes],events:structuredClone(events)});
        // A known database timeout is a diagnostic finding, NEVER a successful read/budget pass.
        if(!result.success){expect(task.name).toBe("documents.company");expect(failureCodes).toContain("57014");timeouts++;}
        if(expected)expect(digest).toBe(expected);else expected=digest;
        if(enabled)expect(events.length).toBeGreaterThan(0);else expect(events).toEqual([]);
      }
      if(timeouts){expect(timeouts).toBe(2);break;} // Do not execute 18 redundant known-timeout probes.
    }
  }
  state.client=clients.get("none")!;process.env.ALGT_PERF_ENABLED="true";
  expect((await listEmployees({page:1,pageSize:25})).success).toBe(false);
  expect((await getDmsDocuments({excludeArchived:true})).success).toBe(false);
  expect(samples.length).toBeGreaterThanOrEqual(82);
});
it("separately records UTF-8 serialization time/bytes for a synthetic response",async()=>{
  recording=true;events.length=0;const value={rows:Array.from({length:25},(_,i)=>({id:i,label:"synthetic"}))};
  const response=await traceOperation("session.route",async()=>tracedJsonResponse(value));recording=false;
  expect(await response.json()).toEqual(value);samples.push({scenario:"synthetic.json.serialization",events:structuredClone(events)});
});
