/// <reference lib="deno.ns" />
// Actual Edge handler with controlled HTTP responses, never browser/provider I/O.
let handler:((req:Request)=>Promise<Response>)|undefined;
const originalServe=Deno.serve,originalFetch=globalThis.fetch;
const secret='F10_SYNTHETIC_ONLY_MACHINE_TOKEN_NOT_A_REAL_CREDENTIAL';
for(const [key,value]of Object.entries({SUPABASE_URL:'http://127.0.0.1:16998',SUPABASE_SERVICE_ROLE_KEY:'synthetic-only',DMS_SCHEDULER_SECRET:secret,INTERNAL_API_SECRET:secret,APP_URL:'http://127.0.0.1:16999',F10_DURABLE_NOTIFICATIONS:'true'}))Deno.env.set(key,value);
Object.defineProperty(Deno,'serve',{configurable:true,value:(fn:typeof handler)=>{handler=fn;return {};}});
globalThis.fetch=()=>{throw Error('Unadmitted network in F10 Edge acceptance');};
await import('../../../supabase/functions/dms-expiry-scheduler/index.ts');
function eq(a:unknown,b:unknown){if(JSON.stringify(a)!==JSON.stringify(b))throw Error('F10 Edge assertion failed: '+JSON.stringify({a,b}));}
const request=()=>new Request('http://127.0.0.1/scheduler?mode=run',{method:'POST',headers:{'x-dms-scheduler-secret':secret}});
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const settings={is_enabled:true,in_app_enabled:true,email_enabled:false,include_document_owner:false,include_document_creator:true,recipient_roles:['reviewer'],recipient_user_ids:[4,3]};
const reminder={id:1,document_id:2,reminder_days_before:0,document:{id:2,document_no:'SYNTHETIC',title:'Synthetic',status:'active',owner_user_id:3,created_by:3,expiry_date:today}};
type Receipt={writes:Record<string,unknown>[];markers:number;unexpected:number};
function arrange(overrides:{settings?:unknown;rolesError?:boolean;insertFailure?:boolean}={}):Receipt{
 const receipt:Receipt={writes:[],markers:0,unexpected:0};
 globalThis.fetch=async(input,init)=>{
  const url=String(input),method=init?.method??'GET';
  if(url.includes('/dms_notification_settings'))return Response.json(overrides.settings??settings);
  if(url.includes('/dms_expiry_reminders')&&method==='GET')return Response.json([reminder]);
  if(url.includes('/dms_expiry_reminders')&&method==='PATCH'){receipt.markers++;return Response.json(null);}
  if(url.includes('/user_roles'))return overrides.rolesError?Response.json({message:'PRIVATE_ROLE_FAILURE'},{status:503}):Response.json([
   {user_profile_id:3,role:{role_code:'reviewer',is_active:true}},{user_profile_id:5,role:{role_code:'reviewer',is_active:false}},
  ]);
  if(url.includes('/dms_notification_queue')&&method==='POST'){
   const body=JSON.parse(String(init?.body));receipt.writes.push(body);
   return overrides.insertFailure&&receipt.writes.length>1?Response.json({message:'PRIVATE_WRITE_FAILURE'},{status:400}):new Response(null,{status:201});
  }
  if(url.includes('/dms_notification_queue')&&method==='GET')return Response.json([]);
  receipt.unexpected++;throw Error('Unexpected F10 Edge transport request');
 };return receipt;
}
Deno.test('durable mode honors creator independently of owner, deduplicates active configured users/roles, never bridges or sends',async()=>{
 const r=arrange();const response=await handler!(request());eq(response.status,200);eq(r.writes.map(x=>x.recipient_user_id).sort(),[3,4]);eq(r.markers,1);eq(r.unexpected,0);
 const result=await response.json();eq(result.steps.durableAdmission,{queuedForCurrentRecipientAuthorization:true,deliveryConfirmed:false});
});
Deno.test('expiry day zero remains an expiry reminder, not prematurely expired',async()=>{
 const r=arrange();eq((await handler!(request())).status,200);eq(r.writes.every(x=>x.notification_type==='expiry_reminder'),true);
});
Deno.test('both channels disabled produce no source records, bridge calls or delivery',async()=>{
 const r=arrange({settings:{...settings,in_app_enabled:false,email_enabled:false}});eq((await handler!(request())).status,200);eq(r.writes.length,0);eq(r.markers,0);eq(r.unexpected,0);
});
Deno.test('role inventory failure is unconfirmed and cannot mark reminder generated',async()=>{
 const r=arrange({rolesError:true});const response=await handler!(request());eq(response.status,500);eq(r.writes.length,0);eq(r.markers,0);eq((await response.text()).includes('PRIVATE_ROLE_FAILURE'),false);
});
Deno.test('partial recipient failure keeps reminder eligible and does not claim delivery',async()=>{
 const r=arrange({insertFailure:true});const response=await handler!(request());eq(response.status,503);eq(r.writes.length,2);eq(r.markers,0);eq((await response.text()).includes('PRIVATE_WRITE_FAILURE'),false);
});
Deno.test('durable mode never invokes the legacy sender even if its old follow-on flag is enabled',async()=>{
 const before=Deno.env.get('F09_EMAIL_TRIGGER_ENABLED');Deno.env.set('F09_EMAIL_TRIGGER_ENABLED','true');
 try{const r=arrange({settings:{...settings,email_enabled:true}});eq((await handler!(request())).status,200);eq(r.unexpected,0);eq(r.writes.length,2);}
 finally{if(before===undefined)Deno.env.delete('F09_EMAIL_TRIGGER_ENABLED');else Deno.env.set('F09_EMAIL_TRIGGER_ENABLED',before);}
});
globalThis.addEventListener('unload',()=>{Object.defineProperty(Deno,'serve',{value:originalServe});globalThis.fetch=originalFetch;});
