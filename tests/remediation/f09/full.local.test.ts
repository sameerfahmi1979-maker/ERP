import {beforeAll,expect,it,vi} from "vitest";
import fs from "node:fs";
import path from "node:path";
import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
const state=vi.hoisted(()=>({admin:null as unknown as ReturnType<typeof createClient>,client:null as unknown as ReturnType<typeof createClient>}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>state.admin}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>state.client}));
vi.mock("next/cache",()=>({revalidatePath:()=>{}}));
import {queueEmail,getEmailQueue,cancelEmailQueueItem,retryEmailQueueItem,processEmailQueueItem} from "@/server/actions/notifications/email-queue";
import {runReportScheduleNow} from "@/server/actions/reports/schedules";
import {getAuthContext} from "@/lib/rbac/check";
const runtime=path.resolve("CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F09/local");
const keys=JSON.parse(fs.readFileSync(path.join(runtime,"keys-private.json"),"utf8"));
const ledger=JSON.parse(fs.readFileSync(path.join(runtime,"fixtures-private.json"),"utf8"));
const clients:Record<string,ReturnType<typeof createClient>>={};
const save=()=>fs.writeFileSync(path.join(runtime,"fixtures-private.json"),JSON.stringify(ledger,null,2));
const base={source_module:"SYSTEM",to_emails:["f09@example.invalid"],subject:"F09 synthetic API",text_body:"Synthetic only",priority:"normal" as const,max_attempts:3};
beforeAll(async()=>{
 expect(keys.API_URL).toBe("http://127.0.0.1:16521");
 state.admin=createClient(keys.API_URL,keys.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 for(const [name,value] of Object.entries(ledger.actors)){
 const actor=value as {email:string;password:string};
 const c=createClient(keys.API_URL,keys.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const r=await c.auth.signInWithPassword(actor);expect(r.error).toBeNull();clients[name]=c;
 }
 vi.stubEnv("F09_EMAIL_WORKER_ENABLED","false");
});
it("real Auth sessions distinguish global queue operator, company scope and no role",async()=>{
 for(const name of ["operator","scoped","none"]){state.client=clients[name];const ctx=await getAuthContext();expect(ctx.profile).not.toBeNull();expect(ctx.isAccountActive).toBe(true);expect((await getEmailQueue()).success).toBe(name==="operator");}
});
it("anonymous and ordinary JWTs cannot execute admission or forge queue rows",async()=>{
 for(const c of [createClient(keys.API_URL,keys.ANON_KEY),clients.none,clients.scoped,clients.operator]){
 expect((await c.rpc("f09_admit_email_dispatch",{p_id:1,p_owner:randomUUID(),p_token:randomUUID(),p_provider_id:1,p_expected:{}})).error).not.toBeNull();
 expect((await c.from("erp_email_queue").insert({source_module:"SYSTEM",to_emails:["f09@example.invalid"],subject:"forged"})).error).not.toBeNull();
 expect((await c.from("erp_email_provider_dispatches").select("*")).error).not.toBeNull();
 }
});
it("permission-checked action deduplicates a repeated request with real PostgREST",async()=>{
 state.client=clients.operator;const input={...base,request_id:randomUUID()};
 const [a,b]=await Promise.all([queueEmail(input),queueEmail(input)]);expect(a.success).toBe(true);expect(b.success).toBe(true);expect(a.data?.id).toBe(b.data?.id);
 ledger.apiQueueId=a.data!.id;ledger.queueIds.push(a.data!.id);save();
 const row=await state.admin.from("erp_email_queue").select("*").eq("id",a.data!.id).single();expect(row.error).toBeNull();expect(row.data.status).toBe("pending");
 expect(row.data.created_by).toBe(ledger.actors.operator.profileId);
});
it("scoped/no-role users cannot enqueue, cancel or retry a global queue item",async()=>{
 for(const name of ["none","scoped"]){state.client=clients[name];expect((await queueEmail({...base,request_id:randomUUID()})).success).toBe(false);
 expect((await cancelEmailQueueItem(ledger.apiQueueId)).success).toBe(false);expect((await retryEmailQueueItem(ledger.apiQueueId)).success).toBe(false);}
});
it("disabled worker never marks a queued request as sent; cancellation is durable",async()=>{
 state.client=clients.operator;const id=ledger.apiQueueId;
 const r=await processEmailQueueItem(id);expect(r.success).toBe(false);expect(r.data?.status).toBe("paused");
 expect((await cancelEmailQueueItem(id)).success).toBe(true);
 expect((await cancelEmailQueueItem(id)).success).toBe(false);
 expect((await retryEmailQueueItem(id)).success).toBe(false);
});
it("full-schema admission, event and projection commit together without external sending",async()=>{
 const p=await state.admin.from("erp_email_provider_configs").insert({provider_code:"F09_LOCAL_QUOTA_"+randomUUID(),provider_type:"microsoft_graph",provider_name:"Synthetic no credentials",is_enabled:true,is_active:true,is_default:true,throttle_per_minute:1,daily_send_limit:1}).select("*").single();expect(p.error).toBeNull();ledger.providerId=p.data.id;save();
 state.client=clients.operator;const queued=await queueEmail({...base,request_id:randomUUID()});expect(queued.success).toBe(true);const id=queued.data!.id;ledger.queueIds.push(id);save();
 const owner=randomUUID(),claim=await state.admin.rpc("f09_claim_email",{p_owner:owner,p_id:id,p_module:null});expect(claim.error).toBeNull();const q=claim.data[0];
 const fence={p_id:id,p_owner:owner,p_token:q.lease_token};
 const admitted=await state.admin.rpc("f09_admit_email_dispatch",{...fence,p_provider_id:p.data.id,p_expected:p.data});expect(admitted.error).toBeNull();expect(admitted.data).toBe("allowed");
 // Simulated provider response: no transport called, never evidence of delivery.
 const done=await state.admin.rpc("f09_finish_provider_email",{...fence,p_outcome:"accepted",p_retry_after:null});expect(done.error).toBeNull();expect(done.data).toBe(true);
 expect((await state.admin.from("erp_email_queue").select("delivery_state").eq("id",id).single()).data?.delivery_state).toBe("provider_accepted");
 const logs=await state.admin.from("erp_notification_delivery_logs").select("status").eq("email_queue_id",id);expect(logs.error).toBeNull();expect(logs.data?.[0].status).toBe("provider_accepted");
 await state.admin.from("erp_email_provider_configs").update({is_enabled:false}).eq("id",p.data.id);
});
it("real schedule run-now preserves creator and deduplicates the submitted UUID",async()=>{
 state.client=clients.operator;
 const r=await state.admin.from("erp_report_registry").insert({report_code:"F09_LOCAL_REPORT_"+randomUUID(),report_name_en:"F09 synthetic report",module_code:"SYSTEM",report_category:"list",document_class:"E",is_active:true,supports_scheduling:true,required_permissions:[]}).select("id").single();expect(r.error).toBeNull();ledger.reportId=r.data.id;save();
 const s=await state.admin.from("erp_report_schedules").insert({report_id:r.data.id,created_by:ledger.actors.operator.profileId,owner_company_id:ledger.companyId,schedule_name:"F09 synthetic daily schedule",output_format:"csv",recipient_to:["f09@example.invalid"],frequency:"daily",time_of_day:"07:00:00",next_run_at:"2099-01-01T03:00:00Z"}).select("id").single();expect(s.error).toBeNull();ledger.scheduleIds.push(s.data.id);save();
 const key=randomUUID(),a=await runReportScheduleNow(s.data.id,key),b=await runReportScheduleNow(s.data.id,key);
 expect(a.success).toBe(true);expect(b.success).toBe(true);
 const runs=await state.admin.from("erp_report_schedule_runs").select("*").eq("schedule_id",s.data.id);expect(runs.error).toBeNull();expect(runs.data).toHaveLength(1);expect(runs.data![0].status).toBe("queued");
 const q=await state.admin.from("erp_email_queue").select("*").eq("report_schedule_run_id",runs.data![0].id).single();expect(q.error).toBeNull();expect(q.data.created_by).toBe(ledger.actors.operator.profileId);ledger.queueIds.push(q.data.id);save();
 state.client=clients.none;expect((await runReportScheduleNow(s.data.id,randomUUID())).success).toBe(false);
});
