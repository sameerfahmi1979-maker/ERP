import {nativeApiOrigin} from './native-api-origin.mjs';
// MAIN ONLY. Opt-in guarded isolated Auth/RLS/RPC + tiny synthetic local Storage
// fixtures. No provider/AI/email/browser/publication. Do not run from a helper.
import {afterAll,beforeAll,beforeEach,describe,expect,it as rawIt,vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {runtime,evidence} from './local-db.mjs';
import {createDmsLocalSafety} from './w38-dms-local-safety';
import {cleanDmsFixtureSessions,dmsFixtureSessionIdentity,planDmsFixturePermission,type DmsFixtureAuthSession} from './dms-numbered-create-harness-guards';
import {assertAutomaticReminderSchema,automaticReminderSchemaPreflightSql,automaticReminderDates,pendingReminderProbeSql,reminderRowsSql,reminderSnapshotSql} from './automatic-reminder-probe-contract';
import type {AiApprovalInput} from '@/lib/dms/numbered-ai-approval';
const state=vi.hoisted(()=>({client:null as SupabaseClient|null,admin:null as unknown,cache:vi.fn(),postCommit:vi.fn(),rpcDiagnostics:[] as {rpc:string;code:string|null;table:string|null;classification:string|null}[]}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>new Proxy(state.client!,{get(target,key){if(key==='rpc')return async(name:string,args:Record<string,unknown>)=>{const response=await target.rpc(name,args);const tables=['dms_documents','dms_document_versions','dms_document_files','dms_document_metadata_values','dms_document_tags','dms_document_links','dms_expiry_reminders','dms_upload_sessions','dms_approve_runs','dms_ai_extraction_results','owner_companies','branches','dms_metadata_definitions'];const known=['Intake file unavailable','Approval taxonomy unavailable','Destination company unavailable','Destination branch unavailable','Selected tag unavailable'];state.rpcDiagnostics.push({rpc:['prepare_numbered_ai_intake','reserve_numbered_ai_intake','finish_numbered_ai_intake'].includes(name)?name:'other',code:response.error&&/^[A-Z0-9]{5}$/.test(response.error.code)?response.error.code:null,table:tables.find(table=>response.error?.message.includes('"'+table+'"'))??null,classification:response.error&&known.includes(response.error.message)?response.error.message:null});return response;};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}})}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>state.admin}));
vi.mock('next/cache',()=>({revalidatePath:state.cache}));
vi.mock('@/lib/dms/approve/approve-ai-intake',()=>({runPostCommitOcr:state.postCommit}));
vi.mock('@/lib/dms/orchestration/post-approve-orchestration',()=>({triggerDmsPostApproveOrchestration:state.postCommit}));
vi.mock('@/lib/dms/ai/factory',()=>({getDmsAiProvider:()=>{throw Error('Provider forbidden');},getAzureDocumentIntelligenceProvider:()=>{throw Error('Provider forbidden');}}));
vi.mock('@/server/actions/email',()=>({sendExportEmail:()=>{throw Error('Email forbidden');}}));
import {approveAiIntakeAndCreateDocument} from '@/server/actions/dms/ai-intake';
import {generateDmsExpiryRemindersForDocument,rebuildDmsExpiryReminders} from '@/server/actions/dms/expiry-reminders';

type Row={table:string;id:number|string;marker?:string};
type Ledger={actors:Record<string,{email:string;password:string;profileId:number}>;companyIds:number[];rows:Row[];intents:object[]};
const marker='FDAI'+Date.now().toString(36).toUpperCase(),owned:Row[]=[],operations:string[]=[],requests:object[]=[],clients:Record<string,SupabaseClient>={},roles:Record<string,number[]>={};
const safety=createDmsLocalSafety(marker),{guard,sql,runBlockedRace,runAutomaticReminderSourceRace}=safety,it=safety.wrapIt(rawIt);
const borrowedPermissions:{id:number;code:string;originalActive:false;restored?:boolean}[]=[],authSessions:DmsFixtureAuthSession[]=[];
const rolePermissions:{role_id:number;permission_id:number}[]=[],faultObjects:{fn:string;trigger:string;table?:string}[]=[],holderStatements:string[]=[];
type CompanyLinkGrant={caseName:string;actor:'reader';companyId:number;permissionId:number;permissionOriginallyActive:boolean;permissionCreated:boolean;roleId?:number;assignmentId?:number;retired:boolean;permissionRestored:boolean};
const companyLinkGrants:CompanyLinkGrant[]=[],caseCleanupFailures:string[]=[];
// Keep the manifest field for historical checker compatibility. SQL73 automatic
// defaults must never create a case-local reminder administration grant.
const reminderAdminGrants:never[]=[];
const automaticReminderProbes:{caseName:string;documentId:number;sourceId:number;operationId:string;before:string;after:string;unchanged:boolean}[]=[];
const automaticReminderRaces:Record<string,unknown>[]=[];
type StorageFixture={bucket:string;path:string;purpose:string;expectedExists:boolean;absent?:true;id?:string;version?:string};
const objects:StorageFixture[]=[],storageCalls:{bucket:string;path:string;kind:string}[]=[];
const attestationDiagnostics:{code:string|null;classification:string}[]=[];
let mutateAttestation:((args:Record<string,unknown>)=>Record<string,unknown>)|null=null;
type BaselineAssignment={id:number;profile_id:number;role_id:number;role_code:string;company_id:number|null;branch_id:number|null;permissions:{id:number;code:string;active:boolean}[]};
let baselineAssignments:BaselineAssignment[]|null=null,baselineUnchanged:boolean|null=null;
let ledger:Ledger,admin:SupabaseClient,rule:number,category:number,documentType:number,branch:number;
const codes=['dms.documents.view','dms.documents.upload','dms.documents.edit','dms.documents.preview','dms.documents.review_ai','numbering.rules.generate'];
const q=(value:unknown)=>value==null?'null':typeof value==='number'||typeof value==='boolean'?String(value):"'"+String(value).replaceAll("'","''")+"'";
const persist=()=>fs.writeFileSync(path.join(runtime,'fixtures-private.json'),JSON.stringify(ledger,null,2));
const intent=(value:object)=>{ledger.intents.push({marker,...value});persist();};
function readBaselineAssignments():BaselineAssignment[]{return JSON.parse(sql(`select coalesce(jsonb_agg(jsonb_build_object('id',ur.id,'profile_id',ur.user_profile_id,'role_id',r.id,'role_code',r.role_code,'company_id',ur.owner_company_id,'branch_id',ur.branch_id,'permissions',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'code',p.permission_code,'active',p.is_active) order by p.id),'[]'::jsonb) from public.role_permissions rp join public.permissions p on p.id=rp.permission_id where rp.role_id=r.id)) order by ur.id),'[]'::jsonb) from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_profile_id in (${['reader','companyA','none'].map(actor=>ledger.actors[actor].profileId).join(',')}) and ur.is_active and r.is_active`));}
function track(table:string,id:number|string){if(!owned.some(row=>row.table===table&&row.id===id)){owned.push({table,id});ledger.rows.push({marker,table,id});persist();}return id;}
function put(table:string,data:Record<string,unknown>){intent({operation:'Create exact synthetic retained upload fixture',table,data});return Number(track(table,Number(sql(`insert into public.${table}(${Object.keys(data).join(',')}) values(${Object.values(data).map(q).join(',')}) returning id`))));}
function grant(actor:string,scope:number|null,permissions:string[]){const role=put('roles',{role_code:marker+actor+owned.length,role_name:marker,is_active:true});const ids:number[]=JSON.parse(sql(`select coalesce(json_agg(id),'[]') from public.permissions where is_active and permission_code in (${permissions.map(q).join(',')})`));expect(ids).toHaveLength(permissions.length);intent({operation:'Grant exact permission pairs to own fixture role',role,permissionIds:ids});sql(`insert into public.role_permissions(role_id,permission_id) select ${role},id from public.permissions where id in (${ids.join(',')})`);rolePermissions.push(...ids.map(permission_id=>({role_id:role,permission_id})));put('user_roles',{user_profile_id:ledger.actors[actor].profileId,role_id:role,owner_company_id:scope,is_active:true});(roles[actor]??=[]).push(role);}
const contract=()=>{const operationId=randomUUID();operations.push(operationId);intent({operation:'Attempt exact upload creation operation; retain allocation/copy/completion history',operationId});return {operationId,revision:null};};
const issued=()=>Number(sql(`select count(*) from public.global_numbering_generated_references where numbering_rule_id=${rule}`));
function recordRequest(input:AiApprovalInput,c:{operationId:string}){requests.push({input,operationId:c.operationId});intent({operation:'Retain exact immutable prepared request before creation',input,operationId:c.operationId});}
async function source(suffix:string,actor='reader',company?:number){
 const bytes=Buffer.from('Synthetic F06 upload '+marker+' '+suffix),sha=createHash('sha256').update(bytes).digest('hex');
 const objectPath=marker+'/'+suffix+'.txt';
 const id=put('dms_upload_sessions',{session_code:marker+suffix,status:'uploaded',intake_status:'review_pending',original_filename:suffix+'.txt',mime_type:'text/plain',file_size_bytes:bytes.length,sha256_hash:sha,temp_storage_path:objectPath,uploaded_by:ledger.actors[actor].profileId});
 const companyId=company??ledger.companyIds[0];
 intent({operation:'Pin exact newly created synthetic source scope after F03 uploader pin; no profile or trigger change',id,companyId,branchId:companyId===ledger.companyIds[0]?branch:null});
 expect(sql(`update public.dms_upload_sessions set owning_company_id=${companyId},owning_branch_id=${companyId===ledger.companyIds[0]?branch:'null'} where id=${id} and auth.uid() is null returning id`)).toBe(String(id));
 const object:StorageFixture={bucket:'dms-temp',path:objectPath,purpose:'Retained tiny synthetic original source',expectedExists:false};objects.push(object);intent({operation:'Upload exact synthetic original bytes to isolated private local bucket',bucket:'dms-temp',path:objectPath,sha256:sha,size:bytes.length});
 const stored=await admin.storage.from('dms-temp').upload(objectPath,bytes,{contentType:'text/plain',upsert:false});if(!stored.error)object.expectedExists=true;expect(stored.error===null,'Synthetic source upload').toBe(true);
 const job=put('dms_ai_extraction_jobs',{upload_session_id:id,job_type:'full_pipeline',status:'completed',created_by:ledger.actors[actor].profileId});
 const analysis=put('dms_ai_extraction_results',{job_id:job,upload_session_id:id,suggested_document_type_id:documentType,suggested_title:marker+suffix,classification_confidence:'high',ai_status:'pending_review'});
 intent({operation:'Bind only exact synthetic completed analysis to its own source',id,analysis});sql(`update public.dms_upload_sessions set ai_result_id=${analysis} where id=${id}`);
 return {id,bytes,sha,analysis,input:{uploadSessionId:id,title:marker+suffix,documentTypeId:documentType,owningCompanyId:companyId,owningBranchId:companyId===ledger.companyIds[0]?branch:null,standardFileName:marker+'_Owner_123_NoExpiry.txt',aiResultId:analysis,allowDuplicate:false,metadataValues:[],tagIds:[],links:[]} satisfies AiApprovalInput};
}
async function preparedWith(suffix:string,patch:Partial<AiApprovalInput>={},actor='reader',company?:number){const fixture=await source(suffix,actor,company),c=contract();state.client=clients[actor];const submitted={...fixture.input,...patch};const r=await approveAiIntakeAndCreateDocument(submitted,c);expect(!r.success&&r.prepared,'Read-only source preparation').toBeTruthy();if(r.success||!r.prepared)throw Error('Preparation failed');const input={...submitted,prepared:r.prepared.snapshot};recordRequest(input,c);return {...fixture,c,input};}
async function prepared(suffix:string,actor='reader',company?:number){return preparedWith(suffix,{},actor,company);}
const begin=(f:Awaited<ReturnType<typeof prepared>>,client=state.client!)=>client.rpc('reserve_numbered_ai_intake',{p_operation:f.c.operationId,p_request:f.input});
const finish=(f:Awaited<ReturnType<typeof prepared>>,fileName=f.input.standardFileName!,client=state.client!)=>client.rpc('finish_numbered_ai_intake',{p_operation:f.c.operationId,p_request:f.input,p_file_name:fileName});
async function complete(f:Awaited<ReturnType<typeof prepared>>){return approveAiIntakeAndCreateDocument(f.input,f.c);}
function fault(operation:string,event:string){const fn='f06_'+marker.toLowerCase()+'_'+faultObjects.length,trigger=fn;faultObjects.push({fn,trigger});intent({operation:'Install exact operation-bound synthetic audit fault; remove in finally',fn,trigger,targetOperation:operation,event});sql(`create function erp_private.${fn}() returns trigger language plpgsql as $$begin if new.new_values->>'operation_id'=${q(operation)} and new.new_values->>'event'=${q(event)} then raise exception 'synthetic audit fault';end if;return new;end$$;create trigger ${trigger} before insert on public.audit_logs for each row execute function erp_private.${fn}()`);return()=>sql(`drop trigger if exists ${trigger} on public.audit_logs;drop function if exists erp_private.${fn}()`);}
async function callerSql(f:Awaited<ReturnType<typeof prepared>>,fileName?:string|null){const session=(await clients.reader.auth.getSession()).data.session;expect(session).not.toBeNull();const claims=JSON.parse(Buffer.from(session!.access_token.split('.')[1],'base64url').toString('utf8'));expect(claims.role).toBe('authenticated');return `set local role authenticated;select set_config('request.jwt.claims',${q(JSON.stringify(claims))},true) is not null;select public.${fileName?'finish_numbered_ai_intake':'reserve_numbered_ai_intake'}(${q(f.c.operationId)}::uuid,${q(JSON.stringify(f.input))}::jsonb${fileName?','+q(fileName):''});`;}
// Direct private helper probes use only this exact tracked live caller session.
// Claims stay in memory; neither test intents nor manifests retain JWTs/claims.
async function helperCaller(actor:'reader'|'companyA'|'none'){
 const session=(await clients[actor].auth.getSession()).data.session;expect(session).not.toBeNull();
 const claims=JSON.parse(Buffer.from(session!.access_token.split('.')[1],'base64url').toString('utf8'));
 expect(claims.role).toBe('authenticated');expect(authSessions.some(s=>s.actor===actor&&s.sessionId===claims.session_id&&s.authUserId===claims.sub)).toBe(true);
 return `set local role authenticated;select set_config('request.jwt.claims',${q(JSON.stringify(claims))},true) is not null;`;
}
async function assertNoCompanyLinkRead(actor:'reader'|'companyA'){
 const caller=await helperCaller(actor);
 expect(()=>sql(`begin;${caller}do $$begin
  if public.current_user_has_permission_in_company('organizations.view',${ledger.companyIds[0]})
   or public.current_user_has_permission_in_company('organizations.manage',${ledger.companyIds[0]})
   or exists(select 1 from public.owner_companies where id in (${ledger.companyIds.join(',')})) then
   raise exception 'Unexpected baseline organization target read; no baseline grants were changed';end if;
 end$$;rollback;`)).not.toThrow();
}
async function destinationDenied(input:AiApprovalInput,actor:'reader'|'companyA'|'none',code:'42501'|'23503'|'22023'='42501'){
 const caller=await helperCaller(actor),before=issued();
 intent({operation:'Read-only direct private destination negative control',sourceId:input.uploadSessionId,actor,expectedCode:code});
 expect(()=>sql(`begin;${caller}do $$declare refused boolean:=false;begin begin
  perform erp_private.ai_approval_destination_snapshot(${q(JSON.stringify(input))}::jsonb);
  exception when sqlstate '${code}' then refused:=true;end;
  if not refused then raise exception 'Unexpected destination admission';end if;
 end$$;rollback;`)).not.toThrow();expect(issued()).toBe(before);
}
async function withCompanyLinkRead<T>(caseName:string,body:()=>Promise<T>):Promise<T>{
 await assertNoCompanyLinkRead('reader');
 const code='organizations.view',old=JSON.parse(sql(`select coalesce(json_agg(json_build_object('id',id,'active',is_active)),'[]') from public.permissions where permission_code=${q(code)}`));
 const plan=planDmsFixturePermission(old,ledger.rows),originalActive=plan.kind==='retain';
 // Even an owned inactive definition must not activate an unrelated dormant
 // baseline assignment when its definition is temporarily enabled.
 if(plan.kind==='borrow')expect((baselineAssignments??[]).some(a=>a.permissions.some(p=>p.id===plan.id)),'Inactive target-read definition has a baseline assignment; refusing activation').toBe(false);
 const permission=plan.kind==='create'?put('permissions',{permission_code:code,permission_name:marker,module_code:'F06_TEST',action_code:'test',is_active:false}):plan.id;
 const entry:CompanyLinkGrant={caseName,actor:'reader',companyId:ledger.companyIds[0],permissionId:permission,permissionOriginallyActive:originalActive,permissionCreated:plan.kind==='create',retired:false,permissionRestored:false};companyLinkGrants.push(entry);
 try{
  intent({operation:'Open exact case-local company-link target-read window',caseName,actor:entry.actor,companyId:entry.companyId,permissionId:permission,permissionOriginallyActive:originalActive,permissionCreated:entry.permissionCreated});
  if(!originalActive){
   if(plan.kind==='borrow'&&!borrowedPermissions.some(p=>p.id===permission)){borrowedPermissions.push({id:permission,code,originalActive:false});intent({operation:'Temporarily activate exact ledger-owned permission; restore original false finally',id:permission,code});}
   intent({operation:'Activate exact case-local company-link permission definition',caseName,id:permission,code,originalActive:false});
   expect(sql(`update public.permissions set is_active=true where id=${permission} and permission_code=${q(code)} and not is_active returning id`)).toBe(String(permission));
  }
  entry.roleId=put('roles',{role_code:marker+'LINK'+companyLinkGrants.length,role_name:marker,is_active:true});
  intent({operation:'Grant exact permission pairs to own fixture role',role:entry.roleId,permissionIds:[permission]});
  sql(`insert into public.role_permissions(role_id,permission_id) values(${entry.roleId},${permission})`);rolePermissions.push({role_id:entry.roleId,permission_id:permission});
  entry.assignmentId=put('user_roles',{user_profile_id:ledger.actors.reader.profileId,role_id:entry.roleId,owner_company_id:entry.companyId,is_active:true});
  intent({operation:'Bind exact case-local company-link grant identity',caseName,permissionId:permission,roleId:entry.roleId,assignmentId:entry.assignmentId,actor:entry.actor,companyId:entry.companyId});
  return await body();
 }finally{
  const failures:string[]=[];
  try{intent({operation:'Close exact case-local company-link target-read window',caseName,permissionId:permission,roleId:entry.roleId??null,assignmentId:entry.assignmentId??null,permissionOriginallyActive:originalActive});}catch{failures.push('Case target-read cleanup intent failed: '+caseName);}
  for(const [table,id] of [['user_roles',entry.assignmentId],['roles',entry.roleId]] as const){if(!id)continue;try{sql(`update public.${table} set is_active=false where id=${id}`);expect(sql(`select count(*) from public.${table} where id=${id} and not is_active`)).toBe('1');}catch{failures.push('Case target-read retirement failed: '+table+'/'+id);}}
  entry.retired=failures.length===0;
  try{if(!originalActive)sql(`update public.permissions set is_active=false where id=${permission} and permission_code=${q(code)}`);entry.permissionRestored=sql(`select count(*) from public.permissions where id=${permission} and permission_code=${q(code)} and is_active=${originalActive}`)==='1';if(!entry.permissionRestored)throw Error();}catch{failures.push('Case target-read permission restoration failed: '+permission);}
  caseCleanupFailures.push(...failures);expect(failures).toEqual([]);
 }
}

async function assertReminderAdminScope(companyOne:boolean,companyTwo:boolean,actor='reader'){
 for(const [companyId,expected] of [[ledger.companyIds[0],companyOne],[ledger.companyIds[1],companyTwo]] as const){
  const result=await clients[actor].rpc('current_user_has_permission_in_company',{permission_code:'dms.admin',target_owner_company_id:companyId});
  expect(result.error).toBeNull();expect(result.data).toBe(expected);
 }
 const scoped=await clients[actor].rpc('current_user_has_permission_in_branch',{permission_code:'dms.admin',target_branch_id:branch});
 expect(scoped.error).toBeNull();expect(scoped.data).toBe(companyOne);
 const global=await clients[actor].rpc('current_user_has_role',{role_code:'system_admin'});
 expect(global.error).toBeNull();expect(global.data).toBe(false);
}
function assertNoApprovalBusinessChildren(documentId:number,sourceId:number,operationId:string,referenceId:number){
 expect(sql(`select count(*) from public.dms_documents where id=${documentId}`)).toBe('0');
 for(const table of ['dms_document_versions','dms_document_files','dms_document_events','dms_document_metadata_values','dms_document_tags','dms_document_links','dms_expiry_reminders'])expect(sql(`select count(*) from public.${table} where document_id=${documentId}`)).toBe('0');
 expect(sql(`select count(*) from public.dms_upload_sessions where id=${sourceId} and document_id is null`)).toBe('1');
 expect(sql(`select count(*) from public.dms_ai_extraction_results where upload_session_id=${sourceId} and document_id is null and ai_status='pending_review'`)).toBe('1');
 expect(sql(`select count(*) from erp_private.ai_approval_plans p join public.dms_approve_runs a on a.id=p.approve_run_id where p.operation_id=${q(operationId)} and p.document_id=${documentId} and p.reference_id=${referenceId} and p.result is null and a.status='started' and a.document_id is null`)).toBe('1');
 expect(sql(`select count(*) from public.global_numbering_generated_references where id=${referenceId} and generation_status='reserved' and target_record_id is null`)).toBe('1');
 expect(sql(`select count(*) from public.audit_logs where entity_name='dms_documents' and entity_id=${documentId} and new_values->>'operation_id'=${q(operationId)} and new_values->>'event'='single_file_ai_approval_completed'`)).toBe('0');
}
type ApprovalFixture=Awaited<ReturnType<typeof prepared>>;
function assertAutomaticReminders(documentId:number,expiry:string|null){
 const rows=JSON.parse(sql(`select coalesce(jsonb_agg(jsonb_build_object('days',reminder_days_before,'date',reminder_date,'status',status) order by reminder_days_before),'[]'::jsonb) from public.dms_expiry_reminders where document_id=${documentId}`));
 expect(rows).toEqual(expiry?automaticReminderDates(expiry):[]);
 expect(sql(`select count(*) from public.dms_expiry_reminders where document_id=${documentId} and (notification_status is distinct from 'pending' or retry_count is distinct from 0 or escalation_level is distinct from 0 or sent_at is not null or last_notification_at is not null or dismissed_by is not null or dismissed_at is not null or dismissal_reason is not null or assigned_to is not null or department_code is not null or recipients_json is not null)`)).toBe('0');
}
async function completedExpiry(suffix:string,actor='reader'){
 await assertReminderAdminScope(false,false,actor);
 const f=await preparedWith(suffix,{expiryDate:'2027-01-01'},actor),result=await complete(f);
 expect(result.success).toBe(true);if(!result.success)throw Error('Expiry completion failed');
 assertAutomaticReminders(result.data.documentId,f.input.expiryDate!);
 return {...f,documentId:result.data.documentId};
}
async function verifiedExpiry(suffix:string,patch:Partial<AiApprovalInput>={}){
 const f=await preparedWith(suffix,{...patch,expiryDate:'2027-01-01'}),reserved=await begin(f);expect(reserved.error).toBeNull();
 const remove=fault(f.c.operationId,'single_file_ai_approval_completed');
 try{expect((await complete(f)).success).toBe(false);}finally{remove();}
 expect(sql(`select count(*) from erp_private.ai_approval_verified_copies where actor_id=${ledger.actors.reader.profileId} and operation_id=${q(f.c.operationId)}`)).toBe('1');
 assertNoApprovalBusinessChildren(reserved.data.documentId,f.id,f.c.operationId,reserved.data.reference_id);
 return {...f,documentId:Number(reserved.data.documentId),referenceId:Number(reserved.data.reference_id)};
}
function completeExpression(f:ApprovalFixture){return `erp_private.complete_ai_approval(${q(f.c.operationId)}::uuid,${q(JSON.stringify(f.input))}::jsonb)`;}
function deniedExpression(expression:string,code:'42501'|'PT409'|'22023'){
 return `do $$declare refused boolean:=false;begin begin perform ${expression};exception when sqlstate '${code}' then refused:=true;end;if not refused then raise exception 'Expected exact completion denial ${code}';end if;end$$;`;
}
async function rollbackReminderProbe(f:ApprovalFixture&{documentId:number},caseName:string,setup:string,body:string,actor:'reader'|'companyA'|'none'='reader'){
 const identity={documentId:f.documentId,sourceId:f.id,operationId:f.c.operationId},before=sql(reminderSnapshotSql(identity));
 expect(before).toMatch(/^[a-f0-9]{64}$/);const caller=await helperCaller(actor);
 intent({operation:'Automatic reminder explicit rollback-only probe; no committed repair',caseName,...identity});
 try{expect(()=>sql(`begin;set local statement_timeout='15s';set local lock_timeout='5s';${setup}${caller}${body}rollback;`)).not.toThrow();}
 finally{const after=sql(reminderSnapshotSql(identity));automaticReminderProbes.push({caseName,...identity,before,after,unchanged:before===after});expect(after,'Exact pre-probe business/proof/history rows must survive rollback unchanged').toBe(before);}
}
function installReminderWait(documentId:number){
 const key=743000+faultObjects.length,fn='f06_'+marker.toLowerCase()+'_'+faultObjects.length,trigger=fn,table='dms_expiry_reminders';
 faultObjects.push({fn,trigger,table});
 // Same exact-resource fault intent/manifest contract as the prior four faults;
 // kind distinguishes a controlled wait without weakening historical checks.
 intent({operation:'Install exact document-bound mandatory child fault; remove in finally',kind:'automatic-reminder-wait',fn,trigger,table,documentId,key});
 sql(`create function erp_private.${fn}() returns trigger language plpgsql as $$begin if new.document_id=${documentId} then perform pg_advisory_xact_lock(${key});end if;return new;end$$;create trigger ${trigger} before insert on public.${table} for each row execute function erp_private.${fn}()`);
 return {key,remove:()=>sql(`drop trigger if exists ${trigger} on public.${table};drop function if exists erp_private.${fn}()`)};
}
async function withFinanceView<T>(body:(role:number,permission:number)=>Promise<T>){
 const code='dms.documents.view.finance',old=JSON.parse(sql(`select coalesce(json_agg(json_build_object('id',id,'active',is_active)),'[]') from public.permissions where permission_code=${q(code)}`));
 const permissionPlan=planDmsFixturePermission(old,ledger.rows),originalActive=permissionPlan.kind==='retain';
 if(permissionPlan.kind==='borrow')expect(sql(`select count(*) from public.user_roles ur join public.roles r on r.id=ur.role_id join public.role_permissions rp on rp.role_id=r.id where ur.is_active and r.is_active and rp.permission_id=${permissionPlan.id}`),'No unrelated dormant finance grant may become effective').toBe('0');
 const permission=permissionPlan.kind==='create'?put('permissions',{permission_code:code,permission_name:marker,module_code:'F06_TEST',action_code:'test',is_active:false}):permissionPlan.id;
 let role:number|undefined,assignment:number|undefined;
 intent({operation:'Open exact automatic-reminder finance-view-only company window',permission,originalActive,created:permissionPlan.kind==='create',profileId:ledger.actors.reader.profileId,companyId:ledger.companyIds[0]});
 try{
  if(!originalActive){
   if(permissionPlan.kind==='borrow'&&!borrowedPermissions.some(row=>row.id===permission)){borrowedPermissions.push({id:permission,code,originalActive:false});intent({operation:'Temporarily activate exact ledger-owned permission; restore original false finally',id:permission,code});}
   intent({operation:'Activate exact synthetic finance-view definition; restore original false finally',permission,code});sql(`update public.permissions set is_active=true where id=${permission} and permission_code=${q(code)}`);
  }
  role=put('roles',{role_code:marker+'FINANCEVIEW',role_name:marker,is_active:true});
  intent({operation:'Grant exact permission pairs to own fixture role',role,permissionIds:[permission]});sql(`insert into public.role_permissions(role_id,permission_id) values(${role},${permission})`);rolePermissions.push({role_id:role,permission_id:permission});
  assignment=put('user_roles',{user_profile_id:ledger.actors.reader.profileId,role_id:role,owner_company_id:ledger.companyIds[0],is_active:true});
  intent({operation:'Bind exact automatic-reminder finance-view-only window',permission,role,assignment});
  return await body(role,permission);
 }finally{
  const failures:string[]=[];try{intent({operation:'Close exact automatic-reminder finance-view-only window',permission,role:role??null,assignment:assignment??null,originalActive});}catch{failures.push('Exact finance-view cleanup intent persistence failed');}
  for(const [table,id] of [['user_roles',assignment],['roles',role]] as const){if(id===undefined)continue;try{sql(`update public.${table} set is_active=false where id=${id}`);expect(sql(`select count(*) from public.${table} where id=${id} and not is_active`)).toBe('1');}catch{failures.push('Exact finance-view window retirement failed: '+table+'/'+id);}}
  try{if(!originalActive)sql(`update public.permissions set is_active=false where id=${permission} and permission_code=${q(code)}`);expect(sql(`select is_active::text from public.permissions where id=${permission}`)).toBe(String(originalActive));}catch{failures.push('Exact finance-view permission flag restoration failed: '+permission);}
  caseCleanupFailures.push(...failures);expect(failures).toEqual([]);
 }
}

describe.skipIf(process.env.ALGT_F06_AI_APPROVAL_TESTS!=='1')('guarded single-file AI approval numbering consumer',{timeout:30000},()=>{
 beforeAll(()=>safety.setup(async()=>{
  guard();expect(process.env.ALGT_F06_LOCAL_TARGET).toBeUndefined();assertAutomaticReminderSchema(JSON.parse(sql(automaticReminderSchemaPreflightSql())));
  const keys=JSON.parse(fs.readFileSync(path.join(runtime,'keys-private.json'),'utf8'));expect(keys.API_URL).toBe(nativeApiOrigin);ledger=JSON.parse(fs.readFileSync(path.join(runtime,'fixtures-private.json'),'utf8'));
  admin=createClient(keys.API_URL,keys.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:safety.fetch}});
  // Existing isolated private buckets are a reviewed prerequisite. This suite
  // does not invent bucket policies/configuration or alter shared Storage setup.
  for(const bucket of ['dms-temp','dms-documents']){const result=await admin.storage.getBucket(bucket);expect(result.error===null,`Existing private local bucket ${bucket} required`).toBe(true);expect(result.data?.public).toBe(false);}
  intent({operation:'Main-approved exact retained numbered upload proof. Tiny local Storage bytes only; retain source/destination, document, number, event, audit, private copy/completion history; retire own UI resources and grants.'});
  const prior=JSON.parse(sql("select coalesce(json_agg(json_build_object('id',id,'active',is_active)),'[]') from public.global_numbering_rules where rule_code='MASTER_DMS_DOCUMENT'"));
  if(prior.length){expect(prior).toHaveLength(1);expect(prior[0].active).toBe(false);expect(ledger.rows.some(row=>row.table==='global_numbering_rules'&&row.id===prior[0].id)).toBe(true);}
  // Preserve unrelated baseline master-data roles. Capture before temporarily
  // activating any definitions; dormant relevant grants must not become an
  // accidental authority source when those exact definitions are activated.
  baselineAssignments=readBaselineAssignments();intent({operation:'Observe and preserve exact pre-existing active actor assignments, roles and complete permission sets; never revoke baseline roles',assignments:baselineAssignments});
  for(const assignment of baselineAssignments){expect(['system_admin','group_admin'].includes(assignment.role_code)&&assignment.company_id===null&&assignment.branch_id===null,'No baseline Global Admin authority may be borrowed').toBe(false);expect(assignment.permissions.filter(p=>(p.active||codes.includes(p.code))&&/^(dms\.|numbering\.)/.test(p.code)),'No effective DMS/numbering baseline capability may contaminate this proof').toEqual([]);}
  for(const code of codes){const old=JSON.parse(sql(`select coalesce(json_agg(json_build_object('id',id,'active',is_active)),'[]') from public.permissions where permission_code=${q(code)}`)),plan=planDmsFixturePermission(old,ledger.rows);if(plan.kind==='create')put('permissions',{permission_code:code,permission_name:marker,module_code:'F06_TEST',action_code:'test',is_active:true});else if(plan.kind==='borrow'){borrowedPermissions.push({id:plan.id,code,originalActive:false});intent({operation:'Temporarily activate exact ledger-owned permission; restore original false finally',id:plan.id,code});sql(`update public.permissions set is_active=true where id=${plan.id} and permission_code=${q(code)}`);}}
  grant('reader',null,codes);grant('companyA',ledger.companyIds[0],codes.filter(code=>code!=='numbering.rules.generate'));grant('companyA',null,['numbering.rules.generate']);
  category=put('dms_document_categories',{category_code:marker,name_en:marker,is_system:false,is_active:true});documentType=put('dms_document_types',{type_code:marker,name_en:marker,category_id:category,is_system:false,is_active:true});branch=put('branches',{branch_code:marker,branch_name_en:marker,owner_company_id:ledger.companyIds[0],status:'active'});
  if(prior.length){rule=prior[0].id;intent({operation:'Activate exact retired synthetic numbering rule, then restore inactive',id:rule});sql(`update public.global_numbering_rules set is_active=true where id=${rule}`);}else rule=put('global_numbering_rules',{rule_code:'MASTER_DMS_DOCUMENT',rule_name:marker,module_code:'DMS',module_name:'F06 synthetic upload',document_type_code:'F06UPLOAD',document_type_name:'F06 synthetic upload',document_prefix:'F06UPLOAD',format_template:'{DOC}-{SEQ6}',sequence_length:6,padding_character:'0',separator:'-',starting_sequence_number:1,reset_policy:'never',is_active:true,is_locked:false});
  for(const actor of ['reader','companyA','none']){const client=createClient(keys.API_URL,keys.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:safety.fetch}});clients[actor]=client;intent({operation:'Create exact local Auth session; track returned UUID and sign out finally',actor,profileId:ledger.actors[actor].profileId});safety.authStart(actor,ledger.actors[actor].email,ledger.actors[actor].profileId);const response=await client.auth.signInWithPassword({email:ledger.actors[actor].email,password:ledger.actors[actor].password});expect(response.error===null,'Fixture sign-in').toBe(true);const session={actor,profileId:ledger.actors[actor].profileId,...dmsFixtureSessionIdentity(response.data.session?.access_token,response.data.user?.id)};authSessions.push(session);ledger.rows.push({marker,table:'auth.sessions',id:session.sessionId});persist();safety.authResolved(actor,session.sessionId,session.authUserId);}
  clients.anonymous=createClient(keys.API_URL,keys.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:safety.fetch}});
  state.admin={from:(table:string)=>{if(!['user_profiles','user_roles','roles','role_permissions','permissions'].includes(table))throw Error('Only identity bootstrap reads permitted');return {select:(columns:string)=>admin.from(table).select(columns)};},rpc:async(name:string,args:Record<string,unknown>)=>{expect(name).toBe('attest_numbered_ai_intake');const result=await admin.rpc(name,mutateAttestation?mutateAttestation(args):args);const allowed=['Verification identity unavailable','Verification plan mismatch','Verified source changed','Verified destination changed','Copy attestation is immutable','Verification session ended'];attestationDiagnostics.push({code:result.error?.code??null,classification:result.error?allowed.includes(result.error.message)?result.error.message:'Other database error':'accepted'});return result;},storage:{from:(bucket:string)=>{
   expect(['dms-temp','dms-documents']).toContain(bucket);const api=admin.storage.from(bucket);
   const observe=(kind:string,objectPath:string)=>{storageCalls.push({bucket,path:objectPath,kind});if(bucket==='dms-temp')expect(objectPath.startsWith(marker+'/')).toBe(true);else expect(objectPath).toContain('/'+marker+'/');};
   return {download:(objectPath:string)=>{observe('download',objectPath);return api.download(objectPath);},info:(objectPath:string)=>{observe('info',objectPath);return api.info(objectPath);},upload:async(objectPath:string,body:Blob,options:{upsert:boolean;contentType:string})=>{observe('upload',objectPath);expect(options.upsert).toBe(false);let object=objects.find(object=>object.bucket===bucket&&object.path===objectPath);if(!object){object={bucket,path:objectPath,purpose:'Retained exact synthetic document-bound destination',expectedExists:false};objects.push(object);intent({operation:'Copy exact source bytes to immutable own document destination; never upsert/delete',bucket,path:objectPath});}const result=await api.upload(objectPath,body,options);if(!result.error)object.expectedExists=true;return result;}};
  }}};
 }),120000);
 beforeEach(context=>{safety.admission(context);state.client=clients.reader;state.cache.mockReset();mutateAttestation=null;});
 afterAll(()=>safety.cleanup(async()=>{
  if(!ledger)return;const cleanupFailures:string[]=[...caseCleanupFailures];
  try{
   for(const f of faultObjects){try{sql(`drop trigger if exists ${f.trigger} on public.${f.table??'audit_logs'};drop function if exists erp_private.${f.fn}()`);}catch{cleanupFailures.push('Exact audit fault '+f.fn+' remains');}}
   if(operations.length){const refs:number[]=JSON.parse(sql(`select coalesce(json_agg(reference_id),'[]') from erp_private.numbering_requests where actor_id in (${ledger.actors.reader.profileId},${ledger.actors.companyA.profileId}) and operation_id in (${operations.map(q).join(',')})`));for(const id of refs)track('global_numbering_generated_references',id);if(refs.length)for(const id of JSON.parse(sql(`select coalesce(json_agg(target_record_id),'[]') from public.global_numbering_generated_references where id in (${refs.join(',')}) and target_table_name='dms_documents' and generation_status='consumed'`)))track('dms_documents',id);}
   const sessions=owned.filter(row=>row.table==='dms_upload_sessions').map(row=>row.id);if(sessions.length)for(const id of JSON.parse(sql(`select coalesce(json_agg(id),'[]') from public.dms_approve_runs where upload_session_id in (${sessions.join(',')})`)))track('dms_approve_runs',id);
   const docs=owned.filter(row=>row.table==='dms_documents').map(row=>row.id);if(docs.length){for(const table of ['dms_document_versions','dms_document_files','dms_document_events','dms_document_metadata_values','dms_document_links','dms_expiry_reminders'])for(const id of JSON.parse(sql(`select coalesce(json_agg(id),'[]') from public.${table} where document_id in (${docs.join(',')})`)))track(table,id);for(const pair of JSON.parse(sql(`select coalesce(json_agg(document_id::text||':'||tag_id::text),'[]') from public.dms_document_tags where document_id in (${docs.join(',')})`)))track('dms_document_tags',pair);intent({operation:'Archive only exact consumer-created synthetic documents; retain history',ids:docs});sql(`update public.dms_documents set is_archived=true,archived_at=clock_timestamp() where id in (${docs.join(',')})`);}
   const refs=owned.filter(row=>row.table==='global_numbering_generated_references').map(row=>row.id),terms=[docs.length?`(entity_name='dms_documents' and entity_id in (${docs.join(',')}))`:null,refs.length?`(entity_name='global_numbering_generated_references' and entity_id in (${refs.join(',')}))`:null,sessions.length?`(entity_name='dms_upload_sessions' and entity_id in (${sessions.join(',')}))`:null].filter(Boolean);if(terms.length)for(const id of JSON.parse(sql(`select coalesce(json_agg(id),'[]') from public.audit_logs where ${terms.join(' or ')}`)))track('audit_logs',id);
  }catch{cleanupFailures.push('Exact business history capture/archive failed');}
  finally{
   // History discovery or one rejected catalogue update must never skip the
   // remaining owned grants. Each exact recorded resource is independent.
   const retirement=owned.filter(row=>['roles','user_roles','permissions','dms_document_types','dms_document_categories','dms_metadata_definitions','dms_tags','global_numbering_rules','branches','dms_upload_sessions'].includes(row.table));
   try{intent({operation:'Retire only exact tracked catalogue/role/source fixtures, preserving reserved numbers and bytes without void/delete policy',rows:retirement});}catch{cleanupFailures.push('Exact retirement intent persistence failed');}
   for(const row of [...retirement].reverse()){
    try{
     if(['roles','user_roles','permissions','dms_document_types','dms_document_categories','dms_metadata_definitions','dms_tags','global_numbering_rules'].includes(row.table))sql(`update public.${row.table} set is_active=false where id=${row.id}`);
     if(row.table==='branches')sql(`update public.branches set status='inactive' where id=${row.id}`);
     if(row.table==='dms_upload_sessions')sql(`update public.dms_upload_sessions set status='cancelled',intake_status='discarded' where id=${row.id}`);
    }catch{cleanupFailures.push('Exact fixture retirement failed: '+row.table+'/'+row.id);}
   }
   if(rule){try{sql(`update public.global_numbering_rules set is_active=false where id=${rule}`);}catch{cleanupFailures.push('Exact borrowed numbering rule retirement failed: '+rule);}}
   for(const permission of borrowedPermissions){try{sql(`update public.permissions set is_active=false where id=${permission.id} and permission_code=${q(permission.code)}`);permission.restored=sql(`select count(*) from public.permissions where id=${permission.id} and permission_code=${q(permission.code)} and is_active=false`)==='1';if(!permission.restored)cleanupFailures.push('Borrowed permission '+permission.id+' remains active');}catch{cleanupFailures.push('Borrowed permission '+permission.id+' restoration failed');}}
   if(baselineAssignments!==null){try{expect(readBaselineAssignments()).toEqual(baselineAssignments);baselineUnchanged=true;}catch{baselineUnchanged=false;cleanupFailures.push('Pre-existing active assignment/role/permission set changed; no baseline repair attempted');}}
   const authCleanup=await cleanDmsFixtureSessions(clients,authSessions,ids=>JSON.parse(sql(`select coalesce(json_agg(id::text),'[]') from auth.sessions where id in (${ids.map(q).join(',')})`)));cleanupFailures.push(...authCleanup.failures);
   for(const object of objects){try{const info=await admin.storage.from(object.bucket).info(object.path);if(info.error){if(!object.expectedExists&&sql(`select count(*) from storage.objects where bucket_id=${q(object.bucket)} and name=${q(object.path)}`)==='0'){object.absent=true;continue;}throw Error();}object.id=info.data.id;object.version=info.data.version;}catch{cleanupFailures.push('Exact retained storage object unavailable: '+object.bucket+'/'+object.path);}}
   let proofHistory={plans:[],verified:[]};try{if(operations.length)proofHistory=JSON.parse(sql(`select json_build_object('plans',(select coalesce(json_agg(json_build_object('actor_id',actor_id,'operation_id',operation_id,'upload_session_id',upload_session_id,'document_id',document_id,'reference_id',reference_id,'approve_run_id',approve_run_id,'completed',result is not null)),'[]') from erp_private.ai_approval_plans where operation_id in (${operations.map(q).join(',')})),'verified',(select coalesce(json_agg(json_build_object('actor_id',actor_id,'operation_id',operation_id,'object_id',object_id,'object_version',object_version)),'[]') from erp_private.ai_approval_verified_copies where operation_id in (${operations.map(q).join(',')})))`));}catch{cleanupFailures.push('Exact private proof capture failed; no missing history inferred');}
   if(automaticReminderProbes.some(probe=>!probe.unchanged))cleanupFailures.push('Automatic reminder rollback probe changed exact retained rows');
   if(automaticReminderRaces.some(event=>event.stage==='cleanup'&&event.absent!==true))cleanupFailures.push('Automatic reminder exact race backend remains');
   fs.writeFileSync(path.join(evidence,`DMS_NUMBERED_AI_APPROVAL_RESOURCES_${marker}.json`),JSON.stringify({marker,owned,operations,requests,rule,borrowedPermissions,companyLinkGrants,reminderAdminGrants,automaticReminderProbes,automaticReminderRaces,authSessions,authCleanup,rolePermissions,faultObjects,holderStatements,objects,storageCalls,attestationDiagnostics,rpcDiagnostics:state.rpcDiagnostics,proofHistory,baselineAssignments,baselineUnchanged,cleanupFailures,retainedHistory:true,providerCalls:0,productionWrites:0},null,2));expect(cleanupFailures).toEqual([]);
  }
 }),120000);
 it('preparation checks existing analysis/source with no allocation or provider',async()=>{const before=issued(),f=await prepared('PREP');expect(f.input.prepared.source.owning_company_id).toBe(ledger.companyIds[0]);expect(f.input.prepared.analysis_result_id).toBe(f.analysis);expect(f.input.prepared.content_sha256).toBe(f.sha);expect(issued()).toBe(before);});
 it('direct destination helper returns only exact scope identity without organization-read authority',async()=>{
  const f=await source('DESTONLY','companyA'),before=issued(),copies=storageCalls.filter(v=>v.kind==='upload').length;await assertNoCompanyLinkRead('companyA');
  const expected=JSON.parse(sql(`select jsonb_build_object('company',(select jsonb_build_object('id',id,'status',status,'workspace_revision',workspace_revision) from public.owner_companies where id=${ledger.companyIds[0]}),'branch',(select jsonb_build_object('id',id,'owner_company_id',owner_company_id,'status',status,'workspace_revision',workspace_revision) from public.branches where id=${branch}))`)),caller=await helperCaller('companyA');
  intent({operation:'Read-only direct private destination exact projection control',sourceId:f.id,actor:'companyA',companyId:ledger.companyIds[0],branchId:branch});
  expect(()=>sql(`begin;${caller}do $$declare actual jsonb;begin actual:=erp_private.ai_approval_destination_snapshot(${q(JSON.stringify(f.input))}::jsonb);if actual is distinct from ${q(JSON.stringify(expected))}::jsonb then raise exception 'Exact destination projection mismatch';end if;end$$;rollback;`)).not.toThrow();
  expect((await clients.companyA.rpc('prepare_numbered_ai_intake',{p_request:f.input})).error).toBeNull();expect(issued()).toBe(before);
  expect(sql(`select count(*) from erp_private.ai_approval_plans where upload_session_id=${f.id}`)).toBe('0');expect(storageCalls.filter(v=>v.kind==='upload')).toHaveLength(copies);
 });
 it('direct destination helper independently rejects foreign source, destination, absent role and confidentiality',async()=>{
  const own=await source('DIRECTOWN','companyA'),foreign=await source('DIRECTFOREIGN','reader',ledger.companyIds[1]);
  await destinationDenied({...foreign.input,owningCompanyId:ledger.companyIds[0],owningBranchId:branch},'companyA');
  await destinationDenied({...own.input,owningCompanyId:ledger.companyIds[1],owningBranchId:null},'companyA');
  await destinationDenied(own.input,'none');await destinationDenied({...own.input,confidentialityLevel:'finance'},'companyA');
 });
 it('direct destination helper enforces actual active branch/company relationship',async()=>{
  const f=await source('DIRECTBRANCH');
  await destinationDenied({...f.input,owningCompanyId:ledger.companyIds[1],owningBranchId:branch},'reader','23503');
  await destinationDenied({...f.input,owningCompanyId:null},'reader','22023');
  expect(sql(`select status from public.branches where id=${branch}`)).toBe('active');
  intent({operation:'Temporarily retire exact owned branch for direct destination negative; restore finally',id:branch});
  try{sql(`update public.branches set status='inactive' where id=${branch}`);await destinationDenied(f.input,'reader','23503');}
  finally{sql(`update public.branches set status='active' where id=${branch}`);}
 });
 it.each(codes)('direct private destination admission requires current %s',async code=>{
  const f=await source('DIRECTCAP'+codes.indexOf(code)),role=roles.reader[0],permission=Number(sql(`select id from public.permissions where permission_code=${q(code)}`));
  expect(owned.some(row=>row.table==='roles'&&row.id===role)).toBe(true);expect(rolePermissions.some(row=>row.role_id===role&&row.permission_id===permission)).toBe(true);
  intent({operation:'Temporarily revoke only exact fixture permission pair; restore finally',role,permission});
  try{sql(`delete from public.role_permissions where role_id=${role} and permission_id=${permission}`);await destinationDenied(f.input,'reader');}
  finally{sql(`insert into public.role_permissions(role_id,permission_id) values(${role},${permission}) on conflict do nothing`);}
 });
 it('destination helper ACL metadata denies anonymous/service execute; no unsafe role-body probe on this runtime',()=>{
  // Exact role-body denial is separately qualified on the isolated .113 canary.
  // See dms-destination-fixed-runtime-acl.mjs. This catalogue assertion does NOT
  // replace the original failed main-runtime denial case or qualify this image.
  // Do not execute the known crash-shaped anon/service DO probe in this suite.
  expect(JSON.parse(sql("select json_build_object('owner',pg_get_userbyid(proowner),'definer',prosecdef,'anon',has_function_privilege('anon',oid,'EXECUTE'),'service',has_function_privilege('service_role',oid,'EXECUTE'),'human',has_function_privilege('authenticated',oid,'EXECUTE')) from pg_proc where oid='erp_private.ai_approval_destination_snapshot(jsonb)'::regprocedure"))).toEqual({owner:'postgres',definer:true,anon:false,service:false,human:true});
 });
 it('company links require independent scoped target read while no-link DMS preparation does not',async()=>{
  const f=await source('LINKSCOPE'),before=issued();await assertNoCompanyLinkRead('reader');
  expect((await clients.reader.rpc('prepare_numbered_ai_intake',{p_request:f.input})).error).toBeNull();
  const linked={...f.input,links:[{entityType:'company',entityId:ledger.companyIds[0]}]};
  expect((await clients.reader.rpc('prepare_numbered_ai_intake',{p_request:linked})).error?.code).toBe('23503');
  await withCompanyLinkRead('LINK_SCOPE',async()=>{
   expect((await clients.reader.rpc('prepare_numbered_ai_intake',{p_request:linked})).error).toBeNull();
   expect((await clients.reader.rpc('prepare_numbered_ai_intake',{p_request:{...linked,links:[{entityType:'company',entityId:ledger.companyIds[1]}]}})).error?.code).toBe('23503');
  });
  await assertNoCompanyLinkRead('reader');expect((await clients.reader.rpc('prepare_numbered_ai_intake',{p_request:linked})).error?.code).toBe('23503');expect(issued()).toBe(before);
 });
 it('reservation retains number/ID/run but creates no document, version, or source binding',async()=>{const f=await prepared('RESERVE'),before=issued(),r=await begin(f);expect(r.error).toBeNull();expect(r.data.completed).toBe(false);expect(issued()).toBe(before+1);expect(sql(`select count(*) from public.dms_documents where id=${r.data.documentId}`)).toBe('0');expect(sql(`select count(*) from public.dms_upload_sessions where id=${f.id} and document_id is null and approve_status='processing'`)).toBe('1');expect(sql(`select generation_status from public.global_numbering_generated_references where id=${r.data.reference_id}`)).toBe('reserved');});
 it.each(['alternate_tuple','wrong_rule','stale_snapshot'])('direct private plan rejects %s even with a matching reason and caller-owned run',async kind=>{
  const f=await preparedWith('DIRECT'+kind,{expiryDate:'2027-01-01'}),before=issued(),actor=ledger.actors.reader.profileId;
  // Every adversarial allocation/run lives in an explicitly rolled-back test
  // transaction. No alternate allocator receipt or forged private plan survives.
  const alternate=kind==='wrong_rule'?put('global_numbering_rules',{rule_code:marker+'OTHER',rule_name:marker,module_code:'DMS',module_name:marker,document_type_code:marker+'OTHER',document_type_name:marker,document_prefix:marker+'OTHER',format_template:'{DOC}-{SEQ6}',sequence_length:6,padding_character:'0',separator:'-',starting_sequence_number:1,reset_policy:'never',is_active:true,is_locked:false}):rule;
  const session=(await clients.reader.auth.getSession()).data.session!;
  const claims=JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url').toString('utf8'));
  const request=q(JSON.stringify(f.input)),reason=`'F06 AI approval '||encode(sha256(convert_to((${request}::jsonb)::text,'UTF8')),'hex')`;
  intent({operation:'Rolled-back direct private plan negative control only; exact source/operation',kind,id:f.id,operationId:f.c.operationId,alternateRule:alternate});
  const statements=`begin;set local role authenticated;select set_config('request.jwt.claims',${q(JSON.stringify(claims))},true);select public.allocate_numbering_reference(${q(f.c.operationId)}::uuid,${kind==='stale_snapshot'?'null':alternate},${kind==='stale_snapshot'?"'MASTER_DMS_DOCUMENT'":'null'},null,'reserved','dms_documents',null,${reason});insert into public.dms_approve_runs(upload_session_id,ai_result_id,run_key,status,stage,started_by) values(${f.id},${f.analysis},${q('f06-ai:'+actor+':'+f.c.operationId)},'started','f06_reference_reserved',${actor});${kind==='stale_snapshot'?`update public.dms_ai_extraction_results set suggested_title='Changed synthetic analysis' where id=${f.analysis};`:''}do $$declare refused boolean:=false;begin begin perform erp_private.ai_approval_plan(${q(f.c.operationId)}::uuid,${request}::jsonb,(select id from public.dms_approve_runs where upload_session_id=${f.id} and run_key=${q('f06-ai:'+actor+':'+f.c.operationId)}));exception when sqlstate '${kind==='stale_snapshot'?'PT409':'42501'}' then refused:=true;end;if not refused then raise exception 'Direct plan unexpectedly accepted';end if;end$$;rollback;`;
  expect(()=>sql(statements)).not.toThrow();expect(issued()).toBe(before);expect(sql(`select count(*) from erp_private.ai_approval_plans where operation_id=${q(f.c.operationId)}`)).toBe('0');
 });
 it('AR03 no-expiry action commits one document/version/file/analysis/run/reference/event/audit atomically',async()=>{const f=await prepared('COMPLETE'),r=await complete(f);expect(r.success,'Scoped invoker completion; inspect sanitized RPC diagnostics if false').toBe(true);if(!r.success)throw Error('Completion failed');expect(sql(`select count(*) from public.dms_documents d join public.dms_document_versions v on v.id=d.current_version_id join public.dms_document_files x on x.version_id=v.id where d.id=${r.data.documentId} and v.version_number=1 and x.sha256_hash=${q(f.sha)}`)).toBe('1');expect(sql(`select count(*) from erp_private.ai_approval_plans where operation_id=${q(f.c.operationId)} and result is not null`)).toBe('1');expect(sql(`select count(*) from public.dms_ai_extraction_results where id=${f.analysis} and ai_status='accepted' and document_id=${r.data.documentId}`)).toBe('1');assertAutomaticReminders(r.data.documentId,null);});
 it('AR04 authorized source and different independently authorized destination receive expiry defaults',async()=>{await assertReminderAdminScope(false,false);const f=await preparedWith('DIFFERENT',{owningCompanyId:ledger.companyIds[1],owningBranchId:null,expiryDate:'2027-01-01'}),r=await complete(f);expect(r.success).toBe(true);if(!r.success)throw Error('Completion failed');expect(sql(`select owning_company_id from public.dms_documents where id=${r.data.documentId}`)).toBe(String(ledger.companyIds[1]));expect(sql(`select owning_company_id from public.dms_upload_sessions where id=${f.id}`)).toBe(String(ledger.companyIds[0]));assertAutomaticReminders(r.data.documentId,f.input.expiryDate!);});
 it('AR01 company-scoped expiry approval creates exactly six defaults without reminder admin',async()=>{await completedExpiry('SCOPED','companyA');});
 it('AR02 exact branch-only DMS role allows its branch and rejects a foreign destination',async()=>{
  const role=roles.companyA[0],actor=ledger.actors.companyA.profileId;
  const sibling=put('branches',{branch_code:marker+'SIBLING',branch_name_en:marker,owner_company_id:ledger.companyIds[0],status:'active'});
  const assignment=Number(sql(`select id from public.user_roles where role_id=${role} and user_profile_id=${actor} and owner_company_id=${ledger.companyIds[0]} and branch_id is null and is_active`));
  expect(owned.some(row=>row.table==='user_roles'&&row.id===assignment)).toBe(true);
  intent({operation:'Temporarily narrow exact owned DMS assignment to owned branch; restore original null finally',assignment,role,actor,branch});
  try{
   expect(sql(`update public.user_roles set branch_id=${branch} where id=${assignment} and role_id=${role} and user_profile_id=${actor} and branch_id is null returning id`)).toBe(String(assignment));
   const f=await completedExpiry('BRANCH','companyA'),before=issued();
   expect((await clients.companyA.rpc('prepare_numbered_ai_intake',{p_request:{...f.input,prepared:undefined,owningBranchId:sibling}})).error?.code).toBe('42501');
   expect((await clients.companyA.rpc('prepare_numbered_ai_intake',{p_request:{...f.input,prepared:undefined,owningCompanyId:ledger.companyIds[1],owningBranchId:null}})).error?.code).toBe('42501');
   expect(issued()).toBe(before);
  }finally{
   sql(`update public.user_roles set branch_id=null where id=${assignment} and role_id=${role} and user_profile_id=${actor}`);
   expect(sql(`select count(*) from public.user_roles where id=${assignment} and owner_company_id=${ledger.companyIds[0]} and branch_id is null and is_active`)).toBe('1');
  }
 },60000);
 it('AR05 automatic approval does not grant manual reminder INSERT UPDATE DELETE or generation',async()=>{
  const f=await completedExpiry('MANUALDENY');
  await rollbackReminderProbe(f,'AR05_MANUAL','',`do $$declare refused boolean:=false;n integer;before_rows jsonb:=${reminderRowsSql(f.documentId)};begin
   begin insert into public.dms_expiry_reminders(document_id,reminder_days_before,reminder_date,status) values(${f.documentId},3,'2026-12-29','pending');exception when insufficient_privilege then refused:=true;end;
   if not refused then raise exception 'Manual reminder INSERT became available';end if;
   update public.dms_expiry_reminders set status='cancelled' where document_id=${f.documentId};get diagnostics n=row_count;if n<>0 then raise exception 'Manual reminder UPDATE changed rows';end if;
   delete from public.dms_expiry_reminders where document_id=${f.documentId};get diagnostics n=row_count;if n<>0 then raise exception 'Manual reminder DELETE changed rows';end if;
   if ${reminderRowsSql(f.documentId)} is distinct from before_rows then raise exception 'Manual denial changed reminders';end if;end$$;`);
  const before=sql(reminderSnapshotSql({documentId:f.documentId,sourceId:f.id,operationId:f.c.operationId}));
  expect(await generateDmsExpiryRemindersForDocument(f.documentId)).toMatchObject({success:false,error:'Permission denied'});
  expect(await rebuildDmsExpiryReminders(f.documentId)).toMatchObject({success:false,error:'Permission denied'});
  expect(sql(reminderSnapshotSql({documentId:f.documentId,sourceId:f.id,operationId:f.c.operationId}))).toBe(before);
 },60000);
 it('AR06 concurrent same-operation finishes commit one document audit receipt and six reminders',async()=>{
  const f=await verifiedExpiry('REMCONCURRENT'),before=issued();
  const results=await Promise.all([finish(f),finish(f),finish(f)]);expect(results.map(result=>result.error)).toEqual([null,null,null]);
  expect(results.filter(result=>result.data.replayed===false)).toHaveLength(1);expect(results.filter(result=>result.data.replayed===true)).toHaveLength(2);
  expect(new Set(results.map(result=>result.data.documentId))).toEqual(new Set([f.documentId]));expect(issued()).toBe(before);assertAutomaticReminders(f.documentId,f.input.expiryDate!);
  expect(sql(`select count(*) from public.audit_logs where entity_name='dms_documents' and entity_id=${f.documentId} and new_values->>'event'='single_file_ai_approval_completed' and new_values->>'operation_id'=${q(f.c.operationId)}`)).toBe('1');
 },60000);
 it.each(['sent','dismissed','cancelled','missing'] as const)('AR07 AR08 completed replay preserves exact %s reminder rows without reconstruction',async kind=>{
  const f=await completedExpiry('REPLAY'+kind);
  const setup=kind==='missing'?`delete from public.dms_expiry_reminders where document_id=${f.documentId} and reminder_days_before=90;`:
   `update public.dms_expiry_reminders set status=${q(kind)},notification_status='handled',retry_count=2,escalation_level=1,department_code=${q(marker)},recipients_json='[{"synthetic":true}]'::jsonb where document_id=${f.documentId} and reminder_days_before=90;`;
  await rollbackReminderProbe(f,'AR_REPLAY_'+kind,setup,`do $$declare before_rows jsonb:=${reminderRowsSql(f.documentId)};v_replayed_receipt jsonb;begin v_replayed_receipt:=${completeExpression(f)};if v_replayed_receipt->'replayed' is distinct from 'true'::jsonb or (v_replayed_receipt->>'documentId')::bigint<>${f.documentId} then raise exception 'Expected original receipt replay';end if;if ${reminderRowsSql(f.documentId)} is distinct from before_rows then raise exception 'Replay modified reminder history';end if;end$$;`);
 });
 it('AR09 caller schedule keys and changed retained expiry cannot allocate or rewrite defaults',async()=>{
  const f=await preparedWith('EXTRAKEYS',{expiryDate:'2027-01-01'}),before=issued();
  for(const patch of [{reminders:[]},{recipients:['synthetic']},{days:[3]},{status:'sent'}])expect((await clients.reader.rpc('reserve_numbered_ai_intake',{p_operation:f.c.operationId,p_request:{...f.input,...patch}})).error?.code).toBe('22023');
  expect(issued()).toBe(before);expect((await begin(f)).error).toBeNull();
  expect((await clients.reader.rpc('reserve_numbered_ai_intake',{p_operation:f.c.operationId,p_request:{...f.input,expiryDate:'2027-02-01'}})).error?.code).toBe('PT409');expect(issued()).toBe(before+1);
 });
 it('AR11 direct completion with a real reservation and copy but missing business facts cannot insert defaults',async()=>{
  const f=await verifiedExpiry('DIRECTPARTIAL');
  await rollbackReminderProbe(f,'AR11_PARTIAL','',deniedExpression(completeExpression(f),'PT409'));
  assertNoApprovalBusinessChildren(f.documentId,f.id,f.c.operationId,f.referenceId);
 });
 it('AR12 direct completion binds actor operation request hash and private copy before any default',async()=>{
  const f=await completedExpiry('DIRECTIDENTITY'),pending=pendingReminderProbeSql({documentId:f.documentId,sourceId:f.id,operationId:f.c.operationId});
  await rollbackReminderProbe(f,'AR12_ACTOR',pending,deniedExpression(completeExpression(f),'42501'),'companyA');
  await rollbackReminderProbe(f,'AR12_OPERATION',pending,deniedExpression(`erp_private.complete_ai_approval(${q(randomUUID())}::uuid,${q(JSON.stringify(f.input))}::jsonb)`,'42501'));
  for(const [name,patch] of [['REQUEST',{title:'Changed synthetic request'}],['HASH',{prepared:{...f.input.prepared,content_sha256:'0'.repeat(64)}}]] as const){
   await rollbackReminderProbe(f,'AR12_'+name,pending,deniedExpression(`erp_private.complete_ai_approval(${q(f.c.operationId)}::uuid,${q(JSON.stringify({...f.input,...patch}))}::jsonb)`,'42501'));
  }
  await rollbackReminderProbe(f,'AR12_COPY',pending+`delete from erp_private.ai_approval_verified_copies where actor_id=${ledger.actors.reader.profileId} and operation_id=${q(f.c.operationId)};`,deniedExpression(completeExpression(f),'42501'));
 },60000);
 it('AR13 direct completion requires unchanged target and full audit number file child facts',async()=>{
  const f=await completedExpiry('DIRECTFACTS'),pending=pendingReminderProbeSql({documentId:f.documentId,sourceId:f.id,operationId:f.c.operationId});
  const changes=[
   ['EXPIRY',`update public.dms_documents set expiry_date='2027-02-01' where id=${f.documentId};`],
   ['OWNER',`update public.dms_documents set owner_user_id=${ledger.actors.companyA.profileId} where id=${f.documentId};`],
   ['ARCHIVED',`update public.dms_documents set is_archived=true where id=${f.documentId};`],
   ['IGNORED',`update public.dms_documents set expiry_tracking_override='ignored' where id=${f.documentId};`],
   ['FILE',`update public.dms_document_files set file_name='different-synthetic.txt' where document_id=${f.documentId};`],
   ['LINK',`insert into public.dms_document_links(document_id,entity_type,entity_id,link_role,is_primary) values(${f.documentId},'company',${ledger.companyIds[0]},'related',false);`],
   ['AUDIT',`delete from public.audit_logs where entity_name='dms_documents' and entity_id=${f.documentId} and new_values->>'operation_id'=${q(f.c.operationId)} and new_values->>'event'='single_file_ai_approval_completed';`],
   ['NUMBER',`update public.global_numbering_generated_references set generation_status='reserved',target_record_id=null where id=(select reference_id from erp_private.ai_approval_plans where actor_id=${ledger.actors.reader.profileId} and operation_id=${q(f.c.operationId)});`],
  ];
  for(const [name,change] of changes)await rollbackReminderProbe(f,'AR13_'+name,pending+change,deniedExpression(completeExpression(f),'PT409'));
 },60000);
 it.each(['complete','partial'] as const)('AR14 pending completion rejects pre-existing %s reminder schedules without adopting them',async kind=>{
  const f=await completedExpiry('PREEXIST'+kind),pending=pendingReminderProbeSql({documentId:f.documentId,sourceId:f.id,operationId:f.c.operationId},true);
  await rollbackReminderProbe(f,'AR14_'+kind,pending+(kind==='partial'?`delete from public.dms_expiry_reminders where document_id=${f.documentId} and reminder_days_before<>90;`:''),`do $$declare before_rows jsonb:=${reminderRowsSql(f.documentId)};refused boolean:=false;begin begin perform ${completeExpression(f)};exception when sqlstate 'PT409' then refused:=true;end;if not refused then raise exception 'Existing schedule was adopted';end if;if ${reminderRowsSql(f.documentId)} is distinct from before_rows then raise exception 'Existing schedule was changed';end if;end$$;`);
 });
 it('AR15 sensitive document replay requires current classification permission, even for its creator',async()=>{
  const f=await completedExpiry('SENSITIVE'),classification=`update public.dms_documents set confidentiality_level='finance' where id=${f.documentId};`;
  await rollbackReminderProbe(f,'AR15_DENY',classification,deniedExpression(completeExpression(f),'42501'));
  // The exact owned role gets this one definition/pair inside a transaction that
  // always rolls back. No permission activation/grant is committed or borrowed.
  const role=roles.reader[0];expect(owned.some(row=>row.table==='roles'&&row.id===role)).toBe(true);
  const grant=`do $$declare p bigint;begin select id into p from public.permissions where permission_code='dms.documents.view.finance';if p is null then insert into public.permissions(permission_code,permission_name,module_code,action_code,is_active) values('dms.documents.view.finance',${q(marker)},'F06_TEST','test',true) returning id into p;else update public.permissions set is_active=true where id=p;end if;insert into public.role_permissions(role_id,permission_id) values(${role},p) on conflict do nothing;end$$;`;
  const permissionSnapshot=()=>sql(`select jsonb_build_object('permission',(select to_jsonb(p) from public.permissions p where permission_code='dms.documents.view.finance'),'pairs',(select coalesce(jsonb_agg(to_jsonb(p) order by permission_id),'[]'::jsonb) from public.role_permissions p where role_id=${role}))`),before=permissionSnapshot();
  try{await rollbackReminderProbe(f,'AR15_CURRENT_PERMISSION',classification+grant,`do $$declare r jsonb;begin r:=${completeExpression(f)};if r->'replayed' is distinct from 'true'::jsonb then raise exception 'Authorized replay unavailable';end if;end$$;`);}
  finally{expect(permissionSnapshot()).toBe(before);}
 },60000);
 it('AR16 direct completion keeps linked employee medical subject restrictions',async()=>{
  const f=await completedExpiry('SUBJECT'),employeeCode=marker+'ROLLBACKMEDICAL';
  intent({operation:'Rollback-only synthetic employee evidence rows; no committed HR fixture',employeeCode,documentId:f.documentId});
  const setup=`with e as (insert into public.employees(employee_code,full_name_en,gender,date_of_birth,mobile_number,owner_company_id,branch_id,joining_date,emergency_contact_name,emergency_contact_mobile) values(${q(employeeCode)},${q(marker)},'male','1990-01-01','0500000000',${ledger.companyIds[0]},${branch},'2026-01-01','Synthetic contact','0500000001') returning id)
   insert into public.employee_document_links(employee_id,dms_document_id,related_record_type,relation_purpose) select id,${f.documentId},'medical_record','synthetic rollback-only evidence' from e;`;
  await rollbackReminderProbe(f,'AR16_MEDICAL_SUBJECT',setup,`do $$begin if erp_private.hr_document_evidence_allowed(${f.documentId}) then raise exception 'Expected actual linked-subject denial';end if;end$$;`+deniedExpression(completeExpression(f),'42501'));
  expect(sql(`select count(*) from public.employees where employee_code=${q(employeeCode)}`)).toBe('0');
 });
 it.each([...codes,'control'])('AR17 reminder INSERT wait rechecks current %s before committing facts or receipt',async code=>{
  const f=await verifiedExpiry('REMWAIT'+codes.indexOf(code)),wait=installReminderWait(f.documentId),role=roles.reader[0];
  const permission=code==='control'?null:Number(sql(`select id from public.permissions where permission_code=${q(code)}`));
  if(permission!==null)expect(rolePermissions.some(pair=>pair.role_id===role&&pair.permission_id===permission)).toBe(true);
  const hold=`select pg_advisory_xact_lock(${wait.key})${permission===null?'':`;delete from public.role_permissions where role_id=${role} and permission_id=${permission}`}`;
  holderStatements.push(hold);intent({operation:'Automatic reminder wait with exact owned permission pair; restore finally',documentId:f.documentId,operationId:f.c.operationId,role,permission,code});
  try{
   const result=await runBlockedRace(hold,await callerSql(f,f.input.standardFileName));expect(result.blocked).toBe(true);
   if(permission===null){expect(result.second.code).toBe(0);assertAutomaticReminders(f.documentId,f.input.expiryDate!);}
   else{expect(result.second.code).not.toBe(0);expect(result.second.error).toContain('42501');assertNoApprovalBusinessChildren(f.documentId,f.id,f.c.operationId,f.referenceId);}
  }finally{
   try{wait.remove();}finally{if(permission!==null){sql(`insert into public.role_permissions(role_id,permission_id) values(${role},${permission}) on conflict do nothing`);expect(sql(`select count(*) from public.role_permissions where role_id=${role} and permission_id=${permission}`)).toBe('1');}}
  }
 },60000);
 it.each(['session','principal'] as const)('AR18 reminder wait rejects a revoked exact %s and restores only that fixture',async kind=>{
  const f=await verifiedExpiry('REMPRINCIPAL'+kind),wait=installReminderWait(f.documentId),session=authSessions.find(session=>session.actor==='reader')!;
  expect(session.profileId).toBe(ledger.actors.reader.profileId);
  const before=kind==='session'?sql(`select coalesce(not_after::text,'NULL') from auth.sessions where id=${q(session.sessionId)} and user_id=${q(session.authUserId)}`):sql(`select status from public.user_profiles where id=${session.profileId} and auth_user_id=${q(session.authUserId)}`);
  expect(before).not.toBe('');if(kind==='principal')expect(before).toBe('active');
  const change=kind==='session'?`update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=${q(session.sessionId)} and user_id=${q(session.authUserId)}`:`update public.user_profiles set status='inactive' where id=${session.profileId} and auth_user_id=${q(session.authUserId)}`;
  const restore=kind==='session'?`update auth.sessions set not_after=${before==='NULL'?'null':q(before)+'::timestamptz'} where id=${q(session.sessionId)} and user_id=${q(session.authUserId)}`:`update public.user_profiles set status=${q(before)} where id=${session.profileId} and auth_user_id=${q(session.authUserId)}`;
  intent({operation:'Automatic reminder wait revokes only exact tracked principal/session; restore original field finally',kind,profileId:session.profileId,sessionId:session.sessionId,authUserId:session.authUserId,original:before});
  const hold=`select pg_advisory_xact_lock(${wait.key});${change}`;holderStatements.push(hold);
  try{const result=await runBlockedRace(hold,await callerSql(f,f.input.standardFileName));expect(result.blocked).toBe(true);expect(result.second.code).not.toBe(0);expect(result.second.error).toContain('42501');assertNoApprovalBusinessChildren(f.documentId,f.id,f.c.operationId,f.referenceId);}
  finally{try{wait.remove();}finally{sql(restore);expect(kind==='session'?sql(`select coalesce(not_after::text,'NULL') from auth.sessions where id=${q(session.sessionId)} and user_id=${q(session.authUserId)}`):sql(`select status from public.user_profiles where id=${session.profileId} and auth_user_id=${q(session.authUserId)}`)).toBe(before);}}
 },60000);
 it('AR17 reminder wait rejects late sensitive-class read revocation without reminder-admin grants',async()=>withFinanceView(async(role,permission)=>{
  await assertReminderAdminScope(false,false);
  const f=await verifiedExpiry('REMSENSITIVE',{confidentialityLevel:'finance'}),wait=installReminderWait(f.documentId);
  const hold=`select pg_advisory_xact_lock(${wait.key});delete from public.role_permissions where role_id=${role} and permission_id=${permission}`;
  holderStatements.push(hold);intent({operation:'Automatic reminder sensitive read wait revokes only exact company finance-view pair; restore finally',documentId:f.documentId,role,permission});
  try{const result=await runBlockedRace(hold,await callerSql(f,f.input.standardFileName));expect(result.blocked).toBe(true);expect(result.second.code).not.toBe(0);expect(result.second.error).toContain('42501');assertNoApprovalBusinessChildren(f.documentId,f.id,f.c.operationId,f.referenceId);}
  finally{try{wait.remove();}finally{sql(`insert into public.role_permissions(role_id,permission_id) values(${role},${permission}) on conflict do nothing`);expect(sql(`select count(*) from public.role_permissions where role_id=${role} and permission_id=${permission}`)).toBe('1');}}
 }),60000);
 it('AR19 second full proof rejects a completion fact changed during the reminder wait',async()=>{
  const f=await completedExpiry('SECONDPROOF'),wait=installReminderWait(f.documentId),identity={documentId:f.documentId,sourceId:f.id,operationId:f.c.operationId},before=sql(reminderSnapshotSql(identity));
  const audit=JSON.parse(sql(`select jsonb_build_object('id',id,'values',new_values) from public.audit_logs where entity_name='dms_documents' and entity_id=${f.documentId} and new_values->>'event'='single_file_ai_approval_completed' and new_values->>'operation_id'=${q(f.c.operationId)}`));
  const hold=`select pg_advisory_xact_lock(${wait.key});update public.audit_logs set new_values=jsonb_set(new_values,'{event}','"synthetic_changed_completion"'::jsonb) where id=${audit.id}`;
  holderStatements.push(hold);intent({operation:'Change only exact own completion audit fact during reminder wait; restore original JSON finally',auditId:audit.id,original:audit.values,...identity});
  try{
   const contender=pendingReminderProbeSql(identity)+await helperCaller('reader')+`select ${completeExpression(f)};rollback;`;
   const result=await runBlockedRace(hold,contender);expect(result.blocked).toBe(true);expect(result.second.code).not.toBe(0);expect(result.second.error).toContain('PT409');
  }finally{try{wait.remove();}finally{sql(`update public.audit_logs set new_values=${q(JSON.stringify(audit.values))}::jsonb where id=${audit.id}`);expect(sql(reminderSnapshotSql(identity))).toBe(before);}}
 },60000);
 it('AR20 normal finish and direct completion use source before plan and converge on one receipt',async()=>{
  const f=await verifiedExpiry('SOURCEORDER'),before=issued(),sourceLock=`select id from public.dms_upload_sessions where id=${f.id} for update`;
  // Persist only a non-secret statement fragment, never JWT claims.
  holderStatements.push(sourceLock);intent({operation:'Source-only holder must acquire plan only after direct completion blocks; no authority bypass',documentId:f.documentId,operationId:f.c.operationId});
  const observe=(event:Record<string,unknown>)=>{automaticReminderRaces.push(event);intent({operation:'Automatic reminder exact staged-race observation',...event});};
  const result=await runAutomaticReminderSourceRace(sourceLock,await callerSql(f,f.input.standardFileName),await helperCaller('reader')+`do $$declare r jsonb;begin r:=${completeExpression(f)};if r->'replayed' is distinct from 'true'::jsonb or (r->>'documentId')::bigint<>${f.documentId} then raise exception 'Expected convergent completed receipt';end if;end$$;`,observe);
  expect(result.blocked).toBe(true);expect(result.second.code).toBe(0);expect(issued()).toBe(before);assertAutomaticReminders(f.documentId,f.input.expiryDate!);
 },60000);
 it('foreign destination and branch/company mismatch reject before allocation',async()=>{const f=await source('FOREIGNDEST','companyA'),before=issued();for(const patch of [{owningCompanyId:ledger.companyIds[1],owningBranchId:null},{owningCompanyId:ledger.companyIds[1],owningBranchId:branch}]){const c=contract();state.client=clients.companyA;expect((await approveAiIntakeAndCreateDocument({...f.input,...patch},c)).success).toBe(false);}expect(issued()).toBe(before);});
 it('foreign source, absent actor, and unauthenticated calls cannot prepare',async()=>{const f=await source('FOREIGNSOURCE','reader',ledger.companyIds[1]);for(const client of [clients.companyA,clients.none,clients.anonymous])expect((await client.rpc('prepare_numbered_ai_intake',{p_request:{...f.input,metadataValues:[],tagIds:[],links:[]}})).error).not.toBeNull();});
 it('same-operation concurrent reservation retains one exact ID/run/reference',async()=>{const f=await prepared('SAME'),before=issued(),all=await Promise.all([begin(f),begin(f),begin(f)]);expect(all.map(r=>r.error)).toEqual([null,null,null]);expect(new Set(all.map(r=>r.data.documentId)).size).toBe(1);expect(new Set(all.map(r=>r.data.approve_run_id)).size).toBe(1);expect(issued()).toBe(before+1);});
 it('AR06 distinct operations serialize on the source; only the winner gets a document and six reminders',async()=>{
  const f=await preparedWith('DISTINCT',{expiryDate:'2027-01-01'}),c=contract(),before=issued();recordRequest(f.input,c);
  const all=await Promise.all([begin(f),clients.reader.rpc('reserve_numbered_ai_intake',{p_operation:c.operationId,p_request:f.input})]);
  expect(all.filter(r=>!r.error)).toHaveLength(1);expect(all.filter(r=>r.error?.code==='PT409')).toHaveLength(1);expect(issued()).toBe(before+1);
  const winner=all[0].error?c:f.c,result=await approveAiIntakeAndCreateDocument(f.input,winner);
  expect(result.success).toBe(true);if(!result.success)throw Error('Winning completion failed');assertAutomaticReminders(result.data.documentId,f.input.expiryDate!);expect(issued()).toBe(before+1);
 },60000);
 it('lost reservation response recovers original reference; lost completion response copies nothing again',async()=>{const f=await preparedWith('LOST',{expiryDate:'2027-01-01'}),r=await begin(f);expect(r.error).toBeNull();const before=issued();expect(await complete(f)).toMatchObject({success:true,data:{documentId:r.data.documentId}});const uploads=storageCalls.filter(v=>v.kind==='upload').length;expect(await complete(f)).toMatchObject({success:true,data:{replayed:true,documentId:r.data.documentId}});expect(storageCalls.filter(v=>v.kind==='upload')).toHaveLength(uploads);expect(issued()).toBe(before);});
 it('modified retained payload or actor cannot reuse a reservation',async()=>{const f=await prepared('MODIFIED');expect((await begin(f)).error).toBeNull();for(const patch of [{title:'changed'},{owningCompanyId:ledger.companyIds[1],owningBranchId:null},{prepared:{...f.input.prepared,content_sha256:'0'.repeat(64)}}])expect((await clients.reader.rpc('reserve_numbered_ai_intake',{p_operation:f.c.operationId,p_request:{...f.input,...patch}})).error).not.toBeNull();expect((await clients.companyA.rpc('reserve_numbered_ai_intake',{p_operation:f.c.operationId,p_request:f.input})).error).not.toBeNull();});
 it.each(['source','analysis','taxonomy'])('stale %s after preparation fails before allocation',async kind=>{const f=await prepared('STALE'+kind),before=issued();intent({operation:'Change only exact synthetic context for stale preparation negative control',kind,id:f.id,analysis:f.analysis,documentType});if(kind==='source')sql(`update public.dms_upload_sessions set original_filename='changed.txt' where id=${f.id}`);if(kind==='analysis')sql(`update public.dms_ai_extraction_results set suggested_title='changed' where id=${f.analysis}`);if(kind==='taxonomy')sql(`update public.dms_document_types set is_active=false where id=${documentType}`);try{expect((await begin(f)).error).not.toBeNull();expect(issued()).toBe(before);}finally{if(kind==='taxonomy')sql(`update public.dms_document_types set is_active=true where id=${documentType}`);}},30000);
 it('direct legacy single-file RPC is rejected while existing_batch_draft body remains callable',async()=>{const f=await prepared('LEGACY'),before=issued();expect((await clients.reader.rpc('approve_dms_ai_intake',{p_payload:{mode:'single_file_new_document',upload_session_id:f.id,document_no:'FORGED',document_id:999999}})).error?.code).toBe('22023');expect(issued()).toBe(before);expect((await clients.reader.rpc('approve_dms_ai_intake',{p_payload:{mode:'existing_batch_draft',upload_session_id:f.id,document_no:'NOT-A-DRAFT'}})).error?.message).not.toContain('retained approval protocol');});
 it('authenticated callers cannot invoke trusted attestation or finish without private proof',async()=>{const f=await prepared('NOPROOF'),r=await begin(f);expect(r.error).toBeNull();expect((await clients.reader.rpc('attest_numbered_ai_intake',{p_actor:ledger.actors.reader.profileId,p_session:r.data.auth_session_id,p_operation:f.c.operationId,p_request:f.input,p_object:randomUUID(),p_version:'forged',p_updated_at:new Date().toISOString(),p_sha256:f.sha,p_size:f.bytes.length,p_file_name:f.input.standardFileName})).error?.code).toBe('42501');expect((await finish(f)).error?.code).toBe('42501');expect(sql(`select count(*) from public.dms_documents where id=${r.data.documentId}`)).toBe('0');});
 it('wrong attested object/version/time rejects, valid millisecond API identity retains exact DB timestamp',async()=>{const f=await prepared('TIME');for(const field of ['p_object','p_version','p_updated_at'] as const){mutateAttestation=args=>({...args,[field]:field==='p_object'?randomUUID():field==='p_version'?'wrong':new Date(Date.parse(String(args.p_updated_at))+1).toISOString()});try{expect((await complete(f)).success).toBe(false);}finally{mutateAttestation=null;}}expect((await complete(f)).success).toBe(true);expect(sql(`select count(*) from erp_private.ai_approval_verified_copies p join storage.objects o on o.id=p.object_id where p.operation_id=${q(f.c.operationId)} and p.object_version=o.version and p.object_updated_at=o.updated_at`)).toBe('1');});
 it('reservation audit failure rolls back allocator, run, plan and source status',async()=>{const f=await prepared('RESERVEFAULT'),before=issued(),remove=fault(f.c.operationId,'ai_approval_reference_reserved');try{expect((await begin(f)).error).not.toBeNull();expect(issued()).toBe(before);expect(sql(`select count(*) from erp_private.ai_approval_plans where operation_id=${q(f.c.operationId)}`)).toBe('0');expect(sql(`select count(*) from public.dms_approve_runs where upload_session_id=${f.id}`)).toBe('0');}finally{remove();}});
 it('completion audit failure leaves reserved reference and proof but no business children; exact retry succeeds',async()=>{const f=await prepared('FINISHFAULT'),r=await begin(f);expect(r.error).toBeNull();const remove=fault(f.c.operationId,'single_file_ai_approval_completed');try{expect((await complete(f)).success).toBe(false);expect(sql(`select count(*) from public.dms_documents where id=${r.data.documentId}`)).toBe('0');expect(sql(`select generation_status from public.global_numbering_generated_references where id=${r.data.reference_id}`)).toBe('reserved');expect(sql(`select count(*) from erp_private.ai_approval_verified_copies where operation_id=${q(f.c.operationId)}`)).toBe('1');}finally{remove();}expect((await complete(f)).success).toBe(true);});
 // SQL73 restores automatic defaults without broadening manual reminder RLS.
 // Historical reminder-admin windows remain validated by the unchanged checker.
 it('metadata/tag/link/reminder payloads are mandatory atomic children without reminder admin',async()=>withCompanyLinkRead('CHILDREN',async()=>{await assertReminderAdminScope(false,false);const f=await source('CHILDREN'),definition=put('dms_metadata_definitions',{document_type_id:documentType,field_code:marker+'FIELD',field_label_en:marker,field_type:'text',is_active:true}),tag=put('dms_tags',{tag_code:marker,tag_name:marker,is_active:true}),c=contract();const submitted={...f.input,expiryDate:'2027-01-01',metadataValues:[{definitionId:definition,fieldType:'text' as const,rawValue:'Synthetic value'}],tagIds:[tag],links:[{entityType:'company' as const,entityId:ledger.companyIds[0]}]};const p=await approveAiIntakeAndCreateDocument(submitted,c);expect(!p.success&&p.prepared).toBeTruthy();if(p.success||!p.prepared)throw Error('Preparation failed');const request={...submitted,prepared:p.prepared.snapshot};recordRequest(request,c);const r=await approveAiIntakeAndCreateDocument(request,c);expect(r.success).toBe(true);if(!r.success)throw Error('Completion failed');for(const [table,count] of [['dms_document_metadata_values',1],['dms_document_tags',1],['dms_document_links',1],['dms_expiry_reminders',6]] as const)expect(sql(`select count(*) from public.${table} where document_id=${r.data.documentId}`)).toBe(String(count));assertAutomaticReminders(r.data.documentId,submitted.expiryDate);}));
 it.each(['dms.documents.upload','dms.documents.preview','dms.documents.review_ai','numbering.rules.generate'])('current %s removal rejects replay, restored authority recovers it',async code=>{const f=await prepared('REVOKE'+codes.indexOf(code));expect((await complete(f)).success).toBe(true);const role=roles.reader[0],permission=Number(sql(`select id from public.permissions where permission_code=${q(code)}`));intent({operation:'Temporarily revoke only exact fixture permission pair; restore finally',role,permission});sql(`delete from public.role_permissions where role_id=${role} and permission_id=${permission}`);try{expect((await begin(f)).error?.code).toBe('42501');}finally{sql(`insert into public.role_permissions(role_id,permission_id) values(${role},${permission})`);}expect((await begin(f)).data.completed).toBe(true);});
 it.each(['dms.documents.upload','dms.documents.preview','dms.documents.review_ai'])('source lock wait rechecks %s independently',async code=>{const f=await prepared('WAIT'+codes.indexOf(code)),role=roles.reader[0],permission=Number(sql(`select id from public.permissions where permission_code=${q(code)}`)),hold=`select 1 from public.dms_upload_sessions where id=${f.id} for update;delete from public.role_permissions where role_id=${role} and permission_id=${permission}`;holderStatements.push(hold);intent({operation:'Source lock late-current-capability race on exact fixture pair',role,permission,id:f.id});try{const r=await runBlockedRace(hold,await callerSql(f));expect(r.blocked).toBe(true);expect(r.second.code).not.toBe(0);expect(r.second.error).toContain('42501');}finally{sql(`insert into public.role_permissions(role_id,permission_id) values(${role},${permission}) on conflict do nothing`);}},30000);
 it('ACLs retain invoker consumers, postgres-owned private tables, service provenance only',()=>{for(const fn of ['prepare_numbered_ai_intake(jsonb)','reserve_numbered_ai_intake(uuid,jsonb)','finish_numbered_ai_intake(uuid,jsonb,text)'])expect(JSON.parse(sql(`select json_build_object('definer',prosecdef,'anon',has_function_privilege('anon',oid,'EXECUTE'),'service',has_function_privilege('service_role',oid,'EXECUTE'),'human',has_function_privilege('authenticated',oid,'EXECUTE')) from pg_proc where oid=${q('public.'+fn)}::regprocedure`))).toEqual({definer:false,anon:false,service:false,human:true});for(const table of ['ai_approval_plans','ai_approval_verified_copies'])expect(JSON.parse(sql(`select json_build_object('owner',pg_get_userbyid(relowner),'human_write',has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE'),'service_write',has_table_privilege('service_role',oid,'INSERT,UPDATE,DELETE')) from pg_class where oid=${q('erp_private.'+table)}::regclass`))).toEqual({owner:'postgres',human_write:false,service_write:false});});
 it.each(['dms.documents.upload','dms.documents.preview','dms.documents.review_ai'])('final audit wait rechecks current %s and rolls all business children back',async code=>{
  const f=await prepared('FINAL'+codes.indexOf(code)),initial=await begin(f);expect(initial.error).toBeNull();
  const proofFault=fault(f.c.operationId,'single_file_ai_approval_completed');try{expect((await complete(f)).success).toBe(false);}finally{proofFault();}
  expect(sql(`select count(*) from erp_private.ai_approval_verified_copies where operation_id=${q(f.c.operationId)}`)).toBe('1');
  const role=roles.reader[0],permission=Number(sql(`select id from public.permissions where permission_code=${q(code)}`)),key=721000+faultObjects.length,
   fn='f06_'+marker.toLowerCase()+'_'+faultObjects.length,trigger=fn;
  faultObjects.push({fn,trigger});intent({operation:'Install exact operation-bound synthetic audit wait; remove in finally',fn,trigger,key,operationId:f.c.operationId});
  sql(`create function erp_private.${fn}() returns trigger language plpgsql as $$begin if new.new_values->>'operation_id'=${q(f.c.operationId)} and new.new_values->>'event'='single_file_ai_approval_completed' then perform pg_advisory_xact_lock(${key});end if;return new;end$$;create trigger ${trigger} before insert on public.audit_logs for each row execute function erp_private.${fn}()`);
  const hold=`select pg_advisory_xact_lock(${key});delete from public.role_permissions where role_id=${role} and permission_id=${permission}`;holderStatements.push(hold);intent({operation:'Final audit wait with exact fixture permission revocation; restore finally',role,permission,key});
  try{const r=await runBlockedRace(hold,await callerSql(f,f.input.standardFileName));expect(r.blocked).toBe(true);expect(r.second.code).not.toBe(0);expect(r.second.error).toContain('42501');expect(sql(`select count(*) from public.dms_documents where id=${initial.data.documentId}`)).toBe('0');expect(sql(`select generation_status from public.global_numbering_generated_references where id=${initial.data.reference_id}`)).toBe('reserved');}
  finally{sql(`drop trigger if exists ${trigger} on public.audit_logs;drop function if exists erp_private.${fn}();insert into public.role_permissions(role_id,permission_id) values(${role},${permission}) on conflict do nothing`);}
 },30000);
 it.each(['dms_document_metadata_values','dms_document_tags','dms_document_links','dms_expiry_reminders'])('AR10 mandatory %s failure cannot leave a partial approved document without reminder admin',async table=>withCompanyLinkRead('CHILD_FAULT_'+table,async()=>{
  await assertReminderAdminScope(false,false);
  const f=await source('CHILDFAULT'+owned.length),definition=put('dms_metadata_definitions',{document_type_id:documentType,field_code:marker+'F'+owned.length,field_label_en:marker,field_type:'text',is_active:true}),tag=put('dms_tags',{tag_code:marker+owned.length,tag_name:marker+owned.length,is_active:true}),c=contract();
  const submitted={...f.input,expiryDate:'2027-01-01',metadataValues:[{definitionId:definition,fieldType:'text' as const,rawValue:'Synthetic'}],tagIds:[tag],links:[{entityType:'company' as const,entityId:ledger.companyIds[0]}]};
  const p=await approveAiIntakeAndCreateDocument(submitted,c);expect(!p.success&&p.prepared).toBeTruthy();if(p.success||!p.prepared)throw Error('Preparation failed');const request={...submitted,prepared:p.prepared.snapshot};recordRequest(request,c);
  const begin=await clients.reader.rpc('reserve_numbered_ai_intake',{p_operation:c.operationId,p_request:request});expect(begin.error).toBeNull();
  const fn='f06_'+marker.toLowerCase()+'_'+faultObjects.length,trigger=fn;faultObjects.push({fn,trigger,table});intent({operation:'Install exact document-bound mandatory child fault; remove in finally',fn,trigger,table,documentId:begin.data.documentId});
  sql(`create function erp_private.${fn}() returns trigger language plpgsql as $$begin if new.document_id=${begin.data.documentId} then raise exception 'synthetic mandatory child fault' using errcode='23514';end if;return new;end$$;create trigger ${trigger} before insert on public.${table} for each row execute function erp_private.${fn}()`);
  const diagnosticStart=state.rpcDiagnostics.length,afterReservation=issued();
  try{expect((await approveAiIntakeAndCreateDocument(request,c)).success).toBe(false);expect(state.rpcDiagnostics.slice(diagnosticStart).some(d=>d.rpc==='finish_numbered_ai_intake'&&d.code==='23514'),'Injected mandatory child failure must be reached, not an unrelated earlier denial').toBe(true);expect(sql(`select count(*) from public.dms_documents where id=${begin.data.documentId}`)).toBe('0');expect(sql(`select count(*) from public.dms_upload_sessions where id=${f.id} and document_id is null`)).toBe('1');expect(sql(`select generation_status from public.global_numbering_generated_references where id=${begin.data.reference_id}`)).toBe('reserved');assertNoApprovalBusinessChildren(begin.data.documentId,f.id,c.operationId,begin.data.reference_id);}
  finally{sql(`drop trigger if exists ${trigger} on public.${table};drop function if exists erp_private.${fn}()`);}
  // A BEFORE INSERT fault alone does not establish automatic reminder admission.
  // Recover the exact retained request/operation with no reminder-admin grant.
  // The adapter may repeat upload(upsert:false) and receive a collision. Verify
  // the existing attested object/version is unchanged, not zero upload calls.
  const retainedCopy=()=>sql(`select json_build_object('id',o.id,'version',o.version,'updated_at',o.updated_at,'sha256',p.content_sha256,'size',p.file_size_bytes) from erp_private.ai_approval_verified_copies p join storage.objects o on o.id=p.object_id and o.version=p.object_version and o.updated_at=p.object_updated_at where p.actor_id=${ledger.actors.reader.profileId} and p.operation_id=${q(c.operationId)}`);
  const copyBeforeRetry=retainedCopy();expect(copyBeforeRetry).not.toBe('');
  const recovered=await approveAiIntakeAndCreateDocument(request,c);
  expect(recovered).toMatchObject({success:true,data:{documentId:begin.data.documentId}});expect(issued()).toBe(afterReservation);
  expect(retainedCopy()).toBe(copyBeforeRetry);
  for(const [child,count] of [['dms_document_metadata_values',1],['dms_document_tags',1],['dms_document_links',1],['dms_expiry_reminders',6]] as const)expect(sql(`select count(*) from public.${child} where document_id=${begin.data.documentId}`)).toBe(String(count));
 }),60000);
});
