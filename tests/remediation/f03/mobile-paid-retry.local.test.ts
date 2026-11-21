import {randomUUID} from "node:crypto";
import {spawnSync} from "node:child_process";
import {beforeAll,describe,expect,it,vi} from "vitest";
import type {AuthContext} from "@/lib/rbac/check";
import {processing} from "@/server/mobile/dms-v5/processing";

const f=vi.hoisted(()=>({actor:0,job:0,lookup:vi.fn(),paid:vi.fn(),trusted:vi.fn(),caller:vi.fn()}));
const subject="cccccccc-1111-4000-8000-000000000001";
const session="dddddddd-1111-4000-8000-000000000001";
const documentId=998814;
const context=()=>({profile:{id:f.actor,auth_user_id:subject},roleCodes:[]}) as unknown as AuthContext;
vi.mock("server-only",()=>({}));
vi.mock("@/lib/rbac/check",()=>({getAuthContext:async()=>context(),canUseApplication:()=>true,hasPermission:(_:unknown,cap:string)=>["dms.documents.upload","dms.documents.view","dms.documents.ai.run"].includes(cap)}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@/server/actions/audit",()=>({logAudit:vi.fn()}));
vi.mock("@/lib/dms/ai/factory",()=>({getDmsAiProvider:async()=>({provider:{isConfigured:()=>true,summarize:f.paid},configId:null})}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({rpc:f.trusted})}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({rpc:f.caller,from:(table:string)=>{
 const query={select:()=>query,eq:()=>query,is:()=>query,single:()=>f.lookup(table),maybeSingle:()=>f.lookup(table),update:()=>query,insert:async()=>({error:null})};
 return query;
}})}));

// Explicit opt-in disconnected PostgreSQL rehearsal. The bootstrap installs the F03 synthetic seed.
const database=process.env.M5_DMS_HANDLER_DB??"";
const container="mobile5_hr_2i_20261121";
const docker=(args:string[],input?:string)=>spawnSync("docker",["--context","desktop-linux",...args],{input,encoding:"utf8",timeout:15_000});
function sql(statement:string){
 const out=docker(["exec","-i",container,"psql","-XqAt","-U","postgres","-d",database,"-v","ON_ERROR_STOP=1","-f","-"],"\\set VERBOSITY verbose\n"+statement);
 if(out.status!==0)throw Error(out.stderr||String(out.error));
 return out.stdout.trim();
}
const literal=(value:string)=>"'"+value.replaceAll("'","''")+"'";
const json=(value:unknown)=>literal(JSON.stringify(value))+"::jsonb";
const claims=(role:"service_role"|"authenticated")=>"SET LOCAL ROLE "+role+";SET LOCAL request.jwt.claims="+literal(JSON.stringify(role==="authenticated"?{role,sub:subject,session_id:session}:{role}))+";";
function select(role:"service_role"|"authenticated",expression:string,rollback=false){
 return JSON.parse(sql("BEGIN;"+claims(role)+"SELECT to_jsonb("+expression+");"+(rollback?"ROLLBACK;":"COMMIT;")));
}
function response(call:()=>unknown){
 try{return {data:call(),error:null};}catch(error){
  const code=String(error).match(/ERROR:\s+([0-9A-Z]{5}):/)?.[1];if(!code)throw error;
  return {data:null,error:{code}};
 }
}
type Intent={action:"retry_step";operationId:string;documentId:number;jobId:number;step:"ai_summary";sourceHash:string};
function source(){return select("authenticated","public.mobile_dms_source("+json({documentId})+",ARRAY['dms.documents.preview'])");}
const admit=(intent:Intent,rollback=false)=>select("authenticated","public.mobile_dms_operation('admit',"+json(intent)+")",rollback);
const web=()=>select("service_role","public.mobile_dms_web_retry("+f.job+",'ai_summary',"+literal(randomUUID())+",NULL)",true);
type Finish={p_actor:number;p_operation:string;p_result:Record<string,unknown>;p_status:string};
const finish=(args:Finish)=>select("service_role","public.mobile_dms_finish_retry("+Number(args.p_actor)+","+literal(args.p_operation)+","+json(args.p_result)+","+literal(args.p_status)+")");
const tracker=()=>sql("SELECT jsonb_build_array(orchestration_steps_json,orchestration_status) FROM public.dms_upload_sessions WHERE id="+f.job);
const lease=(operation:string)=>JSON.parse(sql("SELECT jsonb_build_object('settled',t.settled,'state',r.state,'result',r.result->>'state') FROM erp_private.mobile_dms_retries t JOIN erp_private.mobile_dms_receipts r USING(actor,operation) WHERE t.operation="+literal(operation)));
const text=(value:string)=>sql("UPDATE public.dms_document_content SET content_text="+literal(value)+" WHERE document_id=998814");
function sessionActive(active:boolean){sql("BEGIN;SET LOCAL session_replication_role=replica;UPDATE public.user_profiles SET must_change_password="+(!active)+" WHERE id="+f.actor+";COMMIT;");}
function runPermission(active:boolean){
 const permission="SELECT id FROM public.permissions WHERE permission_code='dms.documents.ai.run'";
 sql(active?"INSERT INTO public.role_permissions(role_id,permission_id) SELECT 998810,id FROM public.permissions WHERE permission_code='dms.documents.ai.run' ON CONFLICT DO NOTHING":
  "DELETE FROM public.role_permissions WHERE role_id=998810 AND permission_id=("+permission+")");
}
describe.runIf(Boolean(database))("disconnected native paid retry",()=>{
beforeAll(()=>{
 if(!/^mobile5_dms_task3_handler3[a-z0-9]*$/.test(database))throw Error("Dedicated paid-retry rehearsal database required");
 const info=JSON.parse(docker(["inspect",container]).stdout)[0];
 expect(info.Image).toBe("sha256:be60aee15997daca475b710b734bc6bfe52cd544dcd7e9fd2ff58210b6747d83");
 expect(info.HostConfig.NetworkMode).toBe("none");expect(Object.keys(info.HostConfig.PortBindings??{})).toHaveLength(0);
 expect(sql("SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database()")).toBe("Mobile5 DMS task3 isolated");
 expect(sql("SHOW cron.launch_active_jobs")).toBe("off");
 expect(sql("SELECT count(*) FROM auth.users")).toBe("6");
 f.actor=Number(sql("SELECT id FROM public.user_profiles WHERE auth_user_id="+literal(subject)));
 sql(`BEGIN;
 INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code) VALUES('dms.documents.ai.run','Synthetic','DMS','fixture') ON CONFLICT DO NOTHING;
 INSERT INTO public.role_permissions(role_id,permission_id) SELECT 998810,id FROM public.permissions WHERE permission_code='dms.documents.ai.run' ON CONFLICT DO NOTHING;
 INSERT INTO public.erp_ai_feature_flags(feature_code,feature_name,is_enabled) VALUES('DMS_AI_ORCHESTRATION','Synthetic',true),('DMS_AI_SUMMARY','Synthetic',true) ON CONFLICT(feature_code) DO UPDATE SET is_enabled=true;
 INSERT INTO public.erp_ai_provider_configs(config_code,provider_type,provider_name,is_enabled,is_active) VALUES('DEFAULT_CHAT','local','Offline fixture',true,true);
 INSERT INTO public.dms_document_content(document_id,content_text) VALUES(998814,'Synthetic source text');
 COMMIT;`);
});
it.each(["session","version","capability","authorized","uncertain"] as const)("settles the native handler and real canonical summary for %s",async scenario=>{
 f.job={session:998871,version:998872,uncertain:998873,capability:998875,authorized:998876}[scenario];const code="M5-PAID-"+scenario;
 const steps=[{step:"ai_summary",status:"failed"},{step:"content_sync",status:"completed"}];
 sql("INSERT INTO public.dms_upload_sessions(id,session_code,document_id,uploaded_by,original_filename,mime_type,file_size_bytes,orchestration_steps_json) OVERRIDING SYSTEM VALUE VALUES("+f.job+","+literal(code)+",998814,"+f.actor+",'fixture.pdf','application/pdf',12,"+json(steps)+");"+
  "INSERT INTO public.dms_ai_job_queue(id,job_type,job_status,related_document_id,related_upload_session_id,payload_json,created_by) OVERRIDING SYSTEM VALUE VALUES("+f.job+",'post_approve_orchestration','failed',998814,"+f.job+","+json({documentId,sessionCode:code,uploadSessionId:f.job})+","+f.actor+");");
 const intent:Intent={action:"retry_step",step:"ai_summary",operationId:randomUUID(),jobId:f.job,documentId,sourceHash:source().sourceHash};
 const command={op:"processingAction",...intent} as const;
 const before=tracker();let documentRead=false;
 f.paid.mockReset().mockRejectedValue(Error("Synthetic lost response"));f.trusted.mockReset();f.caller.mockReset();f.lookup.mockReset();
 f.caller.mockImplementation(async(name,args)=>response(()=>{
  if(name==="mobile_dms_source")return select("authenticated","public.mobile_dms_source("+json(args.p_data)+",ARRAY["+args.p_caps.map(literal).join(",")+"])");
  if(name==="mobile_dms_operation")return admit(args.p_data);
  throw Error("Unexpected caller RPC "+name);
 }));
 f.lookup.mockImplementation(async(table)=>{
  if(table==="erp_ai_feature_flags")return {data:{is_enabled:true},error:null};
  if(table==="dms_upload_sessions"){
   const row=select("authenticated","(SELECT jsonb_build_object('id',id,'uploaded_by',uploaded_by,'document_id',document_id,'orchestration_steps_json',orchestration_steps_json) FROM public.dms_upload_sessions WHERE id="+f.job+" AND deleted_at IS NULL)");
   return {data:row,error:null};
  }
  if(table==="dms_documents"){
   documentRead=true;
   expect(lease(intent.operationId).state).toBe("admitted");
   if(scenario==="session")sessionActive(false);
   const row=select("authenticated","coalesce((SELECT jsonb_build_object('id',id,'document_no',document_no,'title',title,'confidentiality_level',confidentiality_level,'ai_summary_status',ai_summary_status) FROM public.dms_documents WHERE id=998814 AND deleted_at IS NULL),'null'::jsonb)");
   if(scenario==="session")expect(row).toBeNull();
   return {data:row,error:row?null:{code:"PGRST116",message:"Document unavailable"}};
  }
  if(table==="dms_document_content"){
   if(scenario==="capability"){runPermission(false);text(" ");}
   if(scenario==="authorized")text(" ");
   if(scenario==="version"){
    sql(`BEGIN;SET LOCAL session_replication_role=replica;
     UPDATE public.dms_document_versions SET is_current=false WHERE id=998814;
     INSERT INTO public.dms_document_versions(id,document_id,version_number,is_current) OVERRIDING SYSTEM VALUE VALUES(998874,998814,2,true);
     UPDATE public.dms_documents SET current_version_id=998874 WHERE id=998814;
     INSERT INTO public.dms_document_files(id,document_id,version_id,file_role,storage_bucket,storage_path,file_name,mime_type,file_size_bytes,sha256_hash) OVERRIDING SYSTEM VALUE VALUES(998874,998814,998874,'original','fixture','synthetic/replacement','v2.pdf','application/pdf',12,repeat('f',64));
     UPDATE public.dms_document_content SET content_text=' ' WHERE document_id=998814;COMMIT;`);
   }
   return {data:select("authenticated","(SELECT jsonb_build_object('content_text',content_text) FROM public.dms_document_content WHERE document_id=998814)"),error:null};
  }
  throw Error("Unexpected read "+table);
 });
 let writes=0;
 f.trusted.mockImplementation(async(name,args:Finish)=>{
  if(name==="dms_question_publish")return {data:false,error:null};
  expect(name).toBe("mobile_dms_finish_retry");writes++;
  if(scenario==="version"&&writes===1)throw Error("Transport lost before commit");
  const settled=response(()=>finish(args));
  if(scenario==="session"&&writes===1&&!settled.error)return {data:null,error:{code:"",message:"Transport lost after commit"},status:0};
  return settled;
 });
 const call=()=>processing(command,context());
 if(scenario==="authorized"){
  try{
   await expect(call()).resolves.toMatchObject({state:"failed",replayed:false});
   const [saved,overall]=JSON.parse(tracker());
   expect(saved).toContainEqual(expect.objectContaining({step:"ai_summary",status:"failed",completedAt:expect.any(String)}));
   expect(saved).toContainEqual(steps[1]);expect(overall).toBe("complete_with_warnings");
   expect(lease(intent.operationId)).toEqual({settled:true,state:"settled",result:"failed"});
   await expect(call()).resolves.toMatchObject({state:"failed",replayed:true});expect(f.paid).not.toHaveBeenCalled();
  }finally{text("Restored synthetic text");}
  return;
 }
 if(scenario==="uncertain"){
  await expect(call()).rejects.toMatchObject({code:"reconciliation_required"});
  expect(documentRead).toBe(true);expect(f.paid).toHaveBeenCalledOnce();expect(writes).toBe(0);
  expect(lease(intent.operationId)).toMatchObject({settled:false,state:"admitted"});
  expect(()=>web()).toThrow(/55000/);expect(()=>admit({...intent,operationId:randomUUID()},true)).toThrow(/PT409|55000/);
  expect(tracker()).toBe(before);return;
 }
 try{
  await expect(call()).rejects.toMatchObject({code:scenario==="version"?"source_changed":"permission_denied"});
  expect(documentRead).toBe(true);expect(f.paid).not.toHaveBeenCalled();expect(tracker()).toBe(before);
  expect(lease(intent.operationId)).toEqual({settled:true,state:"settled",result:"failed"});
  expect(writes).toBe(scenario==="capability"?1:2);const messages=f.trusted.mock.calls.filter(([name])=>name==="mobile_dms_finish_retry").map(([,args])=>args);
  if(writes===2)expect(messages[0]).toEqual(messages[1]);
  const original=messages[0] as Finish;
  expect(original.p_result).toMatchObject({step:"ai_summary",status:"failed",providerEffect:"never_started",intent});expect(original.p_result).not.toHaveProperty("abandoned");
  expect(()=>finish({...original,p_result:{...original.p_result,intent:{...intent,jobId:f.job+9}}})).toThrow(/PT409/);
  expect(()=>finish({...original,p_result:{...original.p_result,status:"completed"}})).toThrow(/PT409/);
 }finally{
  if(scenario==="session")sessionActive(true);
  if(scenario==="capability")runPermission(true);
  text("Revalidated current content");
 }
 if(scenario!=="version")await expect(call()).resolves.toMatchObject({state:"failed",replayed:true});
 else await expect(call()).rejects.toMatchObject({code:"source_changed"});
 expect(f.paid).not.toHaveBeenCalled();expect(tracker()).toBe(before);
 expect(web()).toBe(true);expect(admit({...intent,sourceHash:source().sourceHash,operationId:randomUUID()},true)).toMatchObject({admitted:true});
},60_000);
});
