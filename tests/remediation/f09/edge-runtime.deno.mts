/// <reference lib="deno.ns" />
// Execute with Deno, not the Next.js/Node test compiler.
// Captures the actual handler; no listening socket, DB call or provider send.
let handler: ((req: Request) => Promise<Response>) | undefined;
const originalServe=Deno.serve, originalFetch=globalThis.fetch;
const secret="f09-local-only-machine-token-not-a-production-secret";
Deno.env.set("SUPABASE_URL","http://127.0.0.1:16521");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY","f09-synthetic-no-provider-credentials");
Deno.env.set("DMS_SCHEDULER_SECRET",secret);
Deno.env.set("INTERNAL_API_SECRET",secret);
Deno.env.set("APP_URL","http://127.0.0.1:16509");
Object.defineProperty(Deno,"serve",{configurable:true,value:(fn: typeof handler)=>{handler=fn;return {};}});
let calls=0;
globalThis.fetch=(()=>{calls++;throw Error("External I/O forbidden in health/auth runtime tests");}) as typeof fetch;
await import("../../../supabase/functions/dms-expiry-scheduler/index.ts");
const request=(method:string,mode:string,credential?:string)=>new Request("http://127.0.0.1/scheduler?mode="+mode,{method,headers:credential?{"x-dms-scheduler-secret":credential}:{}});
function eq(actual:unknown,expected:unknown){if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error("Runtime assertion failed");}
Deno.test("actual Edge handler refuses GET",async()=>{eq((await handler!(request("GET","health",secret))).status,405);eq(calls,0);});
Deno.test("actual Edge handler requires machine authentication",async()=>{eq((await handler!(request("POST","health"))).status,401);eq(calls,0);});
Deno.test("actual Edge handler rejects wrong credential",async()=>{eq((await handler!(request("POST","health","x".repeat(48)))).status,401);eq(calls,0);});
Deno.test("actual authenticated health is strictly no-work",async()=>{const r=await handler!(request("POST","health",secret));eq(r.status,200);eq(await r.json(),{ok:true,mode:"health",processed:0,sent:0});eq(calls,0);});
Deno.test("actual Edge handler refuses unknown mode",async()=>{eq((await handler!(request("POST","unknown",secret))).status,400);eq(calls,0);});
Deno.test("missing internal credential fails readiness closed",async()=>{Deno.env.delete("INTERNAL_API_SECRET");try{eq((await handler!(request("POST","health",secret))).status,503);eq(calls,0);}finally{Deno.env.set("INTERNAL_API_SECRET",secret);}});
globalThis.addEventListener("unload",()=>{Object.defineProperty(Deno,"serve",{value:originalServe});globalThis.fetch=originalFetch;});
