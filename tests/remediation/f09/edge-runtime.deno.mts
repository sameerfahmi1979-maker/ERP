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
Deno.test('settings failure cannot default to enabled or report successful processing',async()=>{
 const prior=globalThis.fetch;let writes=0;
 globalThis.fetch=async(_input,init)=>{if(init?.method&&init.method!=='GET')writes++;return Response.json({message:'PRIVATE SETTINGS ERROR'},{status:503});};
 try{const response=await handler!(request('POST','run',secret));eq(response.status,500);const body=await response.text();if(body.includes('PRIVATE SETTINGS ERROR'))throw Error('Private failure leaked');eq(writes,0);}
 finally{globalThis.fetch=prior;}
});
Deno.test('partial recipient failure leaves source eligible and does not hide the failure',async()=>{
 const prior=globalThis.fetch;let inserts=0,markers=0;
 globalThis.fetch=async(input,init)=>{
  const url=String(input),method=init?.method??'GET';
  if(url.includes('/dms_notification_settings'))return Response.json({is_enabled:true,email_enabled:false,include_document_owner:true,include_document_creator:true});
  if(url.includes('/dms_expiry_reminders')&&method==='GET')return Response.json([{id:1,document_id:2,reminder_days_before:7,document:{id:2,document_no:'SYNTHETIC',title:'Synthetic',status:'active',owner_user_id:3,created_by:4,expiry_date:'2099-01-01'}}]);
  if(url.includes('/dms_expiry_reminders')&&method==='PATCH'){markers++;return Response.json(null);}
  if(url.includes('/dms_notification_queue')&&method==='POST'){inserts++;return inserts===1?new Response(null,{status:201}):Response.json({message:'PRIVATE INSERT ERROR'},{status:400});}
  if(url.includes('/dms_notification_queue')&&method==='GET')return Response.json([]);
  throw Error('Unexpected synthetic request');
 };
 try{const response=await handler!(request('POST','run',secret));eq(response.status,500);eq(inserts,2);eq(markers,0);const body=await response.text();if(body.includes('PRIVATE INSERT ERROR'))throw Error('Private failure leaked');}
 finally{globalThis.fetch=prior;}
});
globalThis.addEventListener("unload",()=>{Object.defineProperty(Deno,"serve",{value:originalServe});globalThis.fetch=originalFetch;});
