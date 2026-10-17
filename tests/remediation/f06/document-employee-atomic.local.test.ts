import {nativeApiOrigin} from './native-api-origin.mjs';
// MAIN ONLY. Pinned isolated loopback; metadata fixtures only, no storage/provider calls.
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import {spawn,spawnSync,type ChildProcessWithoutNullStreams} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {runtime,evidence} from './local-db.mjs';
import {planDmsFixturePermission,dmsFixtureSessionIdentity,cleanDmsFixtureSessions,type DmsFixtureAuthSession} from './dms-numbered-create-harness-guards';

describe.skipIf(process.env.ALGT_F06_DOCUMENT_EMPLOYEE_TESTS!=='1')('retained HR document employee consumer',()=>{
 const marker='FDE'+Date.now().toString(36).toUpperCase();
 type Ledger={actors:Record<string,{profileId:number;email:string;password:string}>;rows:object[];intents:object[]};
 let ledger:Ledger,actor:number,client:SupabaseClient,pinned:string,company:number,otherCompany:number,hrGrant:number,dmsGrant:number,numberGrant:number,category:number,docType:number,identityType:number,trainingType:number,claims:object;
 const owned:{table:string;id:number}[]=[],borrowed:{table:string;id:number;column:string;original:boolean}[]=[],sessions:DmsFixtureAuthSession[]=[],rolePermissions:{roleId:number;permissionId:number;permissionCode:string}[]=[];
 const borrowedCatalogues:{table:'hr_identity_document_types';id:number;code:string;is_active:boolean;deleted_at:string|null}[]=[];
 const operations:{operation:string;result?:Record<string,unknown>;name:string}[]=[],faults:string[]=[];
 type Holder={name:string;pid:number|null;backendStart:string|null;closed:boolean;child:ChildProcessWithoutNullStreams};type Witness={pid:number;database:number;backend_start:string;xact_start:string;query_start:string;query_hash:string};const holders=new Set<Holder>(),holderManifest:{name:string;pid:number|null;backendStart:string|null}[]=[];
 const hrCodes=['hr.employees.create','hr.employees.view','hr.employees.update','hr.compliance.manage','hr.compliance.view','hr.medical.manage','hr.medical.view','hr.settings.view'];
 const dmsCodes=['dms.documents.view','dms.documents.preview','dms.documents.edit'];const codes=[...hrCodes,...dmsCodes,'numbering.rules.generate'];
 const q=(value:unknown)=>value==null?'null':typeof value==='number'||typeof value==='boolean'?String(value):"'"+String(value).replaceAll("'","''")+"'";


 function guard(){
  expect(runtime.replaceAll('\\','/')).toBe('C:/dev/agt-erp-f06/CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F06/native77c');
  expect(fs.existsSync(path.join(runtime,'supabase/.temp/project-ref'))).toBe(false);
  const inspect=(args:string[])=>{
   const result=spawnSync('docker',['--host','npipe:////./pipe/dockerDesktopLinuxEngine',...args],{encoding:'utf8',windowsHide:true,timeout:5000,maxBuffer:4*1024*1024});
   if(result.error||result.signal||result.status!==0)throw Error('Bounded native identity inspection failed');
   return JSON.parse(result.stdout)[0];
  };
  const container=inspect(['inspect','supabase_db_algt-f06-native77c']);
  expect(container.Config.Labels['com.supabase.cli.project']).toBe('algt-f06-native77c');
  expect(container.State.Running).toBe(true);expect(container.Id).toMatch(/^[a-f0-9]{64}$/);
  expect(container.Image).toBe('sha256:4c39816ce8d9303a3aba1161c842929c73a40c7109a9ef1b644582478e31832e');
  expect(container.HostConfig.PortBindings['5432/tcp']).toEqual([{HostIp:'127.0.0.1',HostPort:'16882'}]);
  const receipt=JSON.parse(fs.readFileSync(path.join(runtime,'startup-qualified.json'),'utf8'));
  expect(receipt.code).toBe(0);
  expect(receipt.resources.find((row:{name:string;id:string})=>row.name==='/supabase_db_algt-f06-native77c')?.id).toBe(container.Id);
  const name='algt-f06-native77c-loopback';expect(Object.keys(container.NetworkSettings.Networks)).toEqual([name]);
  const network=inspect(['network','inspect',name]);
  expect(network.Id).toBe(JSON.parse(fs.readFileSync(path.join(runtime,'startup-intent.json'),'utf8')).networkId);
  expect(network.Internal).toBe(false);expect(network.Labels['algt.owner']).toBe('f06');
  expect(network.Options['com.docker.network.bridge.host_binding_ipv4']).toBe('127.0.0.1');
  return container.Id as string;
 }

 // Own the actual async body, not merely Vitest's timeout wrapper.
 let stopped=false,cleanupBegun=false,cleanupUnresolved=false,signInUncertain=false,sqlUncertain=false,cleanupAdmitted=false,sessionAbsenceProven=false;
 let journal:number|undefined,bodyAbort:AbortController|undefined,bodyDeadline=Infinity;
 const activeBodies=new Set<string>(),pendingCalls=new Map<string,{operation:string|null;rpc:string}>();
 const resultPath=path.join(evidence,'DOCUMENT_EMPLOYEE_RESOURCES_'+marker+'.json');
 function durable(fd:number,value:unknown){const bytes=Buffer.from(JSON.stringify(value)+'\n');let offset=0;while(offset<bytes.length){const n=fs.writeSync(fd,bytes,offset,bytes.length-offset);if(n<=0)throw Error('Harness journal made no progress');offset+=n;}fs.fsyncSync(fd);}
 function note(event:string,details:object={}){if(journal===undefined)throw Error('Harness journal unavailable');durable(journal,{at:new Date().toISOString(),marker,event,...details});}
 function writeResult(details:object){const fd=fs.openSync(resultPath,'wx',0o600);try{durable(fd,details);}finally{fs.closeSync(fd);}}
 function assertRunning(){if(performance.now()>=bodyDeadline){stopped=true;bodyAbort?.abort();}if(stopped||cleanupBegun||bodyAbort?.signal.aborted)throw Error('Harness fail-stop: no new work admitted');}
 function unresolved(reason:string){stopped=true;cleanupUnresolved=true;note('unresolved',{reason});}
 // Only normal sql(), admitted cleanup, and fixed identity-proof operations below call this primitive.
 function executeSql(input:string){
  if(sqlUncertain)throw Error('Owner SQL uncertainty forbids further database commands');
  const transaction=/^\s*begin\b/i.test(input)?input:'begin;'+input+';commit;';
  const result=spawnSync('docker',['--host','npipe:////./pipe/dockerDesktopLinuxEngine','exec','-i','-e','PGPASSWORD=postgres',pinned,'psql','-w','-X','-qAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],{
   input:"set statement_timeout='8s';set lock_timeout='2s';set idle_in_transaction_session_timeout='15s';"+transaction,
   encoding:'utf8',timeout:20000,windowsHide:true,maxBuffer:32*1024*1024});
  if(result.error||result.signal){sqlUncertain=true;unresolved('Owner SQL process outcome unknown');throw Error('Owner SQL process outcome unknown');}
  if(result.status!==0){if(result.status!==3||!/ERROR:\s+[0-9A-Z]{5}:/.test(result.stderr)){sqlUncertain=true;unresolved('Owner SQL transport completion unknown');}throw Error(result.stderr.slice(-3500));}
  return result.stdout.trim();
 }
 function sql(input:string){assertRunning();return executeSql(input);}
 function cleanupSql(input:string){
  if(!cleanupAdmitted||!sessionAbsenceProven||!cleanupBegun||activeBodies.size||pendingCalls.size||holders.size||signInUncertain||sqlUncertain||cleanupUnresolved)throw Error('Cleanup SQL requires settled bodies, requests, holders and absent sessions');
  return executeSql(input);
 }
 function remainingCapturedSessions(ids:string[]){
  if(!cleanupBegun||activeBodies.size||pendingCalls.size||holders.size||signInUncertain||sqlUncertain||cleanupUnresolved)throw Error('Session proof requires settled work');
  expect(ids.every(id=>sessions.some(session=>session.sessionId===id))).toBe(true);
  return JSON.parse(executeSql("select coalesce(json_agg(id::text),'[]') from auth.sessions where id in ("+ids.map(q).join(',')+")"));
 }
 const localFetch:typeof fetch=async(input,init)=>{
  const url=new URL(input instanceof Request?input.url:String(input));
  expect(url.origin).toBe(nativeApiOrigin);
  const logout=cleanupBegun&&url.pathname==='/auth/v1/logout';
  if(!logout)assertRunning();
  const requestId=randomUUID(),rpcName=url.pathname.startsWith('/rest/v1/rpc/')?url.pathname.split('/').at(-1)!:null;
  let operation:string|null=null;
  if(rpcName){try{const data=JSON.parse(String(init?.body??'{}'));operation=typeof data.p_operation==='string'?data.p_operation:null;}catch{/* Remain unbound and fail closed on unknown transport. */}
   pendingCalls.set(requestId,{operation,rpc:rpcName});note('rpc-http-intent',{requestId,operation,rpc:rpcName});}
  try{
   const response=await fetch(input,{...init,redirect:'error',signal:AbortSignal.any([
    ...(logout?[]:bodyAbort?[bodyAbort.signal]:[]),...(init?.signal?[init.signal]:[]),AbortSignal.timeout(20000)])});
   if(rpcName){
    // An actual completed PostgREST response proves its request transaction ended.
    // A gateway/transport failure does not. Consume a clone before releasing ownership.
    const payload:unknown=await response.clone().json();
    const code=payload&&typeof payload==='object'&&'code'in payload?String(payload.code):'';
    if(response.ok||/^[0-9A-Z]{5}$/.test(code))pendingCalls.delete(requestId);
    else{stopped=true;note('rpc-http-unresolved',{requestId,operation,rpc:rpcName,status:response.status});}
   }
   return response;
  }catch(error){if(rpcName){stopped=true;note('rpc-http-unresolved',{requestId,operation,rpc:rpcName});}throw error;}
 };
 function caseTest(name:string,body:()=>unknown|Promise<unknown>,timeout?:number){
  it(name,async({signal,task})=>{
   if(stopped||cleanupBegun||activeBodies.size||pendingCalls.size){stopped=true;throw Error('Previous full body or request unresolved; next test forbidden');}
   const key=randomUUID();activeBodies.add(key);const abort=new AbortController();bodyAbort=abort;bodyDeadline=performance.now()+(task.timeout>0?task.timeout:60000);
   const cancel=()=>{stopped=true;abort.abort();};signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
   try{assertRunning();await body();assertRunning();}
   catch(error){stopped=true;throw error;}
   finally{signal.removeEventListener('abort',cancel);activeBodies.delete(key);if(bodyAbort===abort){bodyAbort=undefined;bodyDeadline=Infinity;}}
  },timeout);
 }
 function withheld(reason:string){
  note('cleanup-withheld',{reason,activeBodies:[...activeBodies],signInUncertain,sqlUncertain,pendingCalls:[...pendingCalls.values()]});
  writeResult({marker,actor,owned,borrowed,rolePermissions,operations,sessions,holders:holderManifest,faults,
   cleanupWithheld:true,cleanupVerified:false,reason,activeBodies:[...activeBodies],signInUncertain,sqlUncertain,pendingCalls:[...pendingCalls.values()],
   unresolvedHolders:[...holders].map(h=>({name:h.name,pid:h.pid,backendStart:h.backendStart})),fullNativeAcceptance:false});
 }
 async function admitCleanup(){
  cleanupBegun=true;stopped=true;
  if(activeBodies.size){bodyAbort?.abort();try{await waitFor(()=>activeBodies.size===0,'actual setup/test bodies');}catch{withheld('Actual body still running; journal retained open');throw Error('Cleanup withheld: active body');}}
  if(signInUncertain||sqlUncertain||pendingCalls.size||cleanupUnresolved){withheld('Unknown Auth/SQL/RPC outcome; no grant restoration or retirement');if(journal!==undefined){fs.closeSync(journal);journal=undefined;}throw Error('Cleanup withheld: unresolved outcome');}
  for(const holder of [...holders])try{await release(holder);}catch{withheld('Exact holder end unproven');throw Error('Cleanup withheld: holder');}
  const result=await cleanDmsFixtureSessions(client?{none:client}:{},sessions,remainingCapturedSessions);
  note('session-cleanup-before-restoration',{result,sessions});
  if(result.failures.length){withheld('Exact session absence unproven; restoration and retirement withheld');if(journal!==undefined){fs.closeSync(journal);journal=undefined;}throw Error('Cleanup withheld: Auth session');}
  sessionAbsenceProven=true;cleanupAdmitted=true;
  return result;
 }
 const persist=()=>fs.writeFileSync(path.join(runtime,'fixtures-private.json'),JSON.stringify(ledger,null,2));
 const intent=(value:object)=>{note('intent',value);ledger.intents.push({marker,...value});persist();};
 const tracked=(table:string,id:number)=>ledger.rows.some(value=>{const row=value as {table?:string;id?:number};return row.table===table&&row.id===id;});
 const record=(table:string,id:number)=>{expect(Number.isSafeInteger(id)&&id>0).toBe(true);if(!owned.some(row=>row.table===table&&row.id===id)){owned.push({table,id});ledger.rows.push({marker,table,id});persist();}return id;};
 function put(table:string,values:Record<string,unknown>){assertRunning();intent({operation:'Create exact synthetic HR document employee fixture',table,values});return record(table,Number(sql(`insert into public.${table}(${Object.keys(values).join(',')}) values(${Object.values(values).map(q).join(',')}) returning id`)));}
 function grant(codeList:string[],scope:number|null=null){const role=put('roles',{role_code:marker+'_'+owned.length,role_name:marker,is_active:true});for(const code of codeList){const permission=Number(sql(`select id from public.permissions where permission_code=${q(code)} and is_active`));expect(permission).toBeGreaterThan(0);intent({table:'role_permissions',role_id:role,permission_id:permission,permissionCode:code});sql(`insert into public.role_permissions(role_id,permission_id)values(${role},${permission})`);rolePermissions.push({roleId:role,permissionId:permission,permissionCode:code});ledger.rows.push({marker,table:'role_permissions',role_id:role,permission_id:permission});persist();}return put('user_roles',{user_profile_id:actor,role_id:role,owner_company_id:scope,branch_id:null,is_active:true});}
 function setGrant(id:number,active:boolean){if(active){assertRunning();if(pendingCalls.size||signInUncertain||sqlUncertain)throw Error('Cannot restore authority while work is unresolved');}expect(owned.some(row=>row.table==='user_roles'&&row.id===id)).toBe(true);intent({table:'user_roles',id,is_active:active,operation:'Exact fixture authority change'});expect(sql(`update public.user_roles set is_active=${active} where id=${id} and user_profile_id=${actor} returning id`)).toBe(String(id));}
 beforeAll(async()=>{
  if(activeBodies.size||cleanupBegun)throw Error('Setup overlap forbidden');activeBodies.add('setup');
  const setupAbort=new AbortController();bodyAbort=setupAbort;bodyDeadline=performance.now()+80000;
  const timer=setTimeout(()=>{stopped=true;setupAbort.abort();},80000);
  try{
  expect(process.env.ALGT_F06_NATIVE_TARGET).toBe('native77c');expect(nativeApiOrigin).toBe('http://127.0.0.1:16881');
  expect(process.env.ALGT_F06_LOCAL_TARGET).toBeUndefined();pinned=guard();
  journal=fs.openSync(path.join(evidence,'DOCUMENT_EMPLOYEE_HARNESS_'+marker+'.jsonl'),'wx',0o600);note('setup-admitted',{pinned});
  const keys=JSON.parse(fs.readFileSync(path.join(runtime,'keys-private.json'),'utf8'));expect(keys.API_URL).toBe(nativeApiOrigin);ledger=JSON.parse(fs.readFileSync(path.join(runtime,'fixtures-private.json'),'utf8'));actor=ledger.actors.none.profileId;
  expect(sql(`select count(*) from public.user_roles where user_profile_id=${actor} and is_active`)).toBe('0');
  intent({operation:'Main-approved isolated HR14A acceptance; synthetic metadata only, exact sessions/holders; retain numbers/history and never restore counters.'});
  for(const code of codes){const prior=JSON.parse(sql(`select coalesce(json_agg(json_build_object('id',id,'active',is_active)),'[]') from public.permissions where permission_code=${q(code)}`));const plan=planDmsFixturePermission(prior,ledger.rows);if(plan.kind==='create')put('permissions',{permission_code:code,permission_name:marker,module_code:'HR',action_code:code.split('.').at(-1),is_active:true});else if(plan.kind==='borrow'){borrowed.push({table:'permissions',id:plan.id,column:'is_active',original:false});intent({table:'permissions',id:plan.id,operation:'Activate exact ledger-owned permission; restore false'});sql(`update public.permissions set is_active=true where id=${plan.id}`);}}
  const rule=JSON.parse(sql("select coalesce(json_agg(json_build_object('id',id,'active',is_active)),'[]') from public.global_numbering_rules where rule_code='HR_EMPLOYEE'"));expect(rule.length).toBeLessThanOrEqual(1);
  if(rule.length){expect(tracked('global_numbering_rules',rule[0].id),'Canonical numbering rule must already be ledger-owned synthetic data').toBe(true);borrowed.push({table:'global_numbering_rules',id:rule[0].id,column:'is_active',original:rule[0].active});intent({table:'global_numbering_rules',id:rule[0].id,operation:'Activate synthetic rule; restore flag only, never sequence'});sql(`update public.global_numbering_rules set is_active=true where id=${rule[0].id}`);}
  else put('global_numbering_rules',{rule_code:'HR_EMPLOYEE',rule_name:marker,module_code:'HR',module_name:'Synthetic HR14A',document_type_code:marker,document_type_name:marker,document_prefix:'F06DE',format_template:'{DOC}-{SEQ6}',sequence_length:6,padding_character:'0',separator:'-',starting_sequence_number:1,reset_policy:'never',is_active:true,is_locked:false});
  const flags=JSON.parse(sql("select coalesce(json_agg(json_build_object('id',id,'enabled',is_enabled)),'[]') from public.erp_ai_feature_flags where feature_code='ERP_AI_HR_DOCUMENT_TO_EMPLOYEE'"));expect(flags.length).toBeLessThanOrEqual(1);
  if(flags.length&&!flags[0].enabled){borrowed.push({table:'erp_ai_feature_flags',id:flags[0].id,column:'is_enabled',original:false});intent({table:'erp_ai_feature_flags',id:flags[0].id,featureCode:'ERP_AI_HR_DOCUMENT_TO_EMPLOYEE',operation:'Temporarily enable exact local canonical feature flag; restore false in finally'});sql(`update public.erp_ai_feature_flags set is_enabled=true where id=${flags[0].id} and feature_code='ERP_AI_HR_DOCUMENT_TO_EMPLOYEE'`);}
  else if(!flags.length)put('erp_ai_feature_flags',{feature_code:'ERP_AI_HR_DOCUMENT_TO_EMPLOYEE',feature_name:marker,is_enabled:true});
  company=put('owner_companies',{company_code:marker+'A',legal_name_en:marker,status:'active'});otherCompany=put('owner_companies',{company_code:marker+'B',legal_name_en:marker,status:'active'});
  hrGrant=grant(hrCodes);dmsGrant=grant(dmsCodes);numberGrant=grant(['numbering.rules.generate']);
  category=put('dms_document_categories',{category_code:marker,name_en:marker,is_active:true,is_system:false});docType=put('dms_document_types',{type_code:marker,name_en:marker,category_id:category,is_active:true,is_system:false});
  identityType=put('hr_identity_document_types',{code:marker,name_en:marker,is_active:true});trainingType=put('hr_training_types',{code:marker,name_en:marker,is_active:true});
  client=createClient(keys.API_URL,keys.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:localFetch}});intent({operation:'Sign in exact local actor; record session then local signout in finally',profileId:actor});assertRunning();signInUncertain=true;const login=await client.auth.signInWithPassword({email:ledger.actors.none.email,password:ledger.actors.none.password});expect(login.error===null).toBe(true);
  const identity=dmsFixtureSessionIdentity(login.data.session?.access_token,login.data.user?.id);sessions.push({actor:'none',profileId:actor,...identity});claims={role:'authenticated',sub:identity.authUserId,session_id:identity.sessionId};ledger.rows.push({marker,table:'auth.sessions',id:identity.sessionId,authUserId:identity.authUserId});persist();
  expect(sql(`select count(*) from auth.sessions s join public.user_profiles p on p.auth_user_id=s.user_id where s.id=${q(identity.sessionId)}::uuid and s.user_id=${q(identity.authUserId)}::uuid and p.id=${actor}`)).toBe('1');
  const valid=await client.rpc('f03_current_session_valid');expect(valid.error).toBeNull();expect(valid.data).toBe(true);
  signInUncertain=false;assertRunning();note('signin-bound',{sessionId:identity.sessionId,authUserId:identity.authUserId,actor});
  }catch(error){stopped=true;throw error;}
  finally{clearTimeout(timer);activeBodies.delete('setup');if(bodyAbort===setupAbort){bodyAbort=undefined;bodyDeadline=Infinity;}}
 },90_000);
 function source(scope=company,confidentiality='internal'){return put('dms_documents',{document_no:marker+'D'+owned.length,title:marker,document_type_id:docType,category_id:category,owning_company_id:scope,confidentiality_level:confidentiality,status:'active',created_by:actor});}
 function sourceFile(doc:number){return put('dms_document_files',{document_id:doc,storage_bucket:'dms-documents',storage_path:marker+'/metadata-only/'+owned.length,file_name:'synthetic.txt',mime_type:'text/plain',file_size_bytes:1,created_by:actor});}
 async function prepare(ids:number[]){const result=await client.rpc('prepare_document_employee_sources',{p_ids:ids});expect(result.error).toBeNull();return result.data.map((row:{documentId:number;fingerprint:string})=>({documentId:row.documentId,fingerprint:row.fingerprint}));}
 async function request(doc=source(),patch:Record<string,unknown>={}){const operation=randomUUID(),name=marker+' '+operation;const data={selectedDocumentIds:[doc],full_name_en:name,gender:'male',date_of_birth:'1990-01-01',mobile_number:operation,owner_company_id:company,joining_date:'2026-10-04',employee_status:'active',emergency_contact_name:'Synthetic contact',emergency_contact_mobile:'000',complianceRecords:[] as object[],conflictsReviewed:0,totalDocumentsSelected:1,...patch};const sources=await prepare(data.selectedDocumentIds);operations.push({operation,name});intent({operation:'Retained exact HR14A request',operationId:operation,fields:data,sources});return {operation,data,sources};}
 type Request=Awaited<ReturnType<typeof request>>;
 function recordResult(operation:string,result:Record<string,unknown>){operations.find(row=>row.operation===operation)!.result=result;record('employees',Number(result.employeeId));record('global_numbering_generated_references',Number(result.referenceId));for(const link of result.linkIds as number[])record('dms_document_links',link);for(const child of result.childRecords as {kind:string;id:number}[])record(child.kind==='identity_document'?'employee_identity_documents':child.kind==='medical_insurance'?'employee_medical_insurances':'employee_training_certificates',child.id);}
 async function rpc(r:Request){const result=await client.rpc('create_numbered_document_employee',{p_operation:r.operation,p_sources:r.sources,p_data:r.data});if(result.data)recordResult(r.operation,result.data);return result;}
 const counts=(r:Request)=>JSON.parse(sql(`select jsonb_build_object('receipts',(select count(*) from erp_private.document_employee_receipts where actor=(select auth_user_id from public.user_profiles where id=${actor}) and operation_id=${q(r.operation)}),'numbers',(select count(*) from erp_private.numbering_requests where actor_id=${actor} and operation_id=${q(r.operation)}),'audits',(select count(*) from public.audit_logs where actor_user_profile_id=${actor} and new_values->>'operation_id'=${q(r.operation)}),'events',(select count(*) from public.dms_document_events where performed_by=${actor} and metadata_json->>'operation_id'=${q(r.operation)}))`));
 const untouched=(r:Request)=>{expect(counts(r)).toEqual({receipts:0,numbers:0,audits:0,events:0});expect(sql(`select count(*) from public.employees where full_name_en=${q(r.data.full_name_en)}`)).toBe('0');for(const table of ['document_employee_insert_proofs','document_employee_insert_facts'])expect(sql(`select count(*) from erp_private.${table} where operation_id=${q(r.operation)}`)).toBe('0');};
 const children=(doc:number)=>[{kind:'identity_document',tempId:'identity',sourceDocumentId:doc,dms_document_id:doc,document_type_id:identityType,document_number:marker},{kind:'medical_insurance',tempId:'medical',sourceDocumentId:doc,dms_document_id:doc,insurance_provider:marker,policy_number:marker,expiry_date:'2027-01-01',employee_covered:false,dependent_coverage_included:false},{kind:'training_certificate',tempId:'training',sourceDocumentId:doc,dms_document_id:doc,training_type_id:trainingType}];
 caseTest('creates all reviewed child kinds, status, links/events/audit and one consumed bound number',async()=>{const doc=source(),r=await request(doc,{complianceRecords:children(doc)}),result=await rpc(r);expect(result.error).toBeNull();expect(result.data).toMatchObject({employeeRevision:'1',documentsLinked:1,complianceRecordsCreated:3,replayed:false});expect(counts(r)).toEqual({receipts:1,numbers:1,audits:3,events:1});expect(sql(`select generation_status||':'||target_table_name||':'||target_record_id from public.global_numbering_generated_references where id=${result.data.referenceId}`)).toBe('consumed:employees:'+result.data.employeeId);expect(sql(`select employee_covered::text||':'||dependent_coverage_included::text from public.employee_medical_insurances where employee_id=${result.data.employeeId}`)).toBe('false:false');});
 caseTest('sequential and concurrent same-operation replay creates exactly one employee',async()=>{const r=await request(),results=await Promise.all([rpc(r),rpc(r)]);for(const result of results)expect(result.error).toBeNull();expect(new Set(results.map(result=>result.data.employeeId)).size).toBe(1);expect(results.filter(result=>result.data.replayed)).toHaveLength(1);const result=await rpc(r);expect(result.error).toBeNull();expect(result.data.replayed).toBe(true);expect(counts(r)).toEqual({receipts:1,numbers:1,audits:3,events:1});});
 caseTest('changed payload or source fingerprint cannot reuse a committed operation',async()=>{const r=await request();expect((await rpc(r)).error).toBeNull();const before=counts(r);for(const changed of [{...r,data:{...r.data,emergency_contact_name:'Other'}},{...r,sources:r.sources.map((s:{documentId:number;fingerprint:string})=>({...s,fingerprint:'a'.repeat(64)}))}])expect((await rpc(changed)).error?.code).toBe('22023');expect(counts(r)).toEqual(before);});
 caseTest('source metadata changed since review rejects before allocation',async()=>{const r=await request();intent({table:'dms_documents',id:r.data.selectedDocumentIds[0],operation:'Exact competing source edit'});sql(`update public.dms_documents set title=${q(marker+' changed')} where id=${r.data.selectedDocumentIds[0]}`);expect((await rpc(r)).error?.code).toBe('P0409');untouched(r);});
 caseTest('new extraction after review rejects before allocation',async()=>{const r=await request(),job=put('dms_ai_extraction_jobs',{document_id:r.data.selectedDocumentIds[0],job_type:'extraction',status:'completed'});put('dms_ai_extraction_results',{document_id:r.data.selectedDocumentIds[0],job_id:job,ai_status:'pending_review',extracted_fields_json:'{}'});expect((await rpc(r)).error?.code).toBe('P0409');untouched(r);});
 caseTest('soft-deleted source denies new mutation and replay without new side effects',async()=>{const r=await request();expect((await rpc(r)).error).toBeNull();const before=counts(r);intent({table:'dms_documents',id:r.data.selectedDocumentIds[0],operation:'Exact source retirement'});sql(`update public.dms_documents set deleted_at=clock_timestamp() where id=${r.data.selectedDocumentIds[0]}`);expect((await rpc(r)).error?.code).toBe('42501');expect(counts(r)).toEqual(before);});
 caseTest('malformed identifiers, dates, protected fields and omitted contact are rejected atomically',async()=>{for(const patch of [{owner_company_id:0},{date_of_birth:'2026-02-30'},{created_by:actor},{emergency_contact_name:'  '},{selectedDocumentIds:[]}]){const r=await request();const changed={...r,data:{...r.data,...patch}};expect((await rpc(changed)).error).not.toBeNull();untouched(r);}},30_000);
 caseTest('unselected or unequal child source is rejected, never silently discarded',async()=>{const r=await request(),other=source();for(const child of [{...children(r.data.selectedDocumentIds[0])[0],dms_document_id:other},{...children(other)[0]}]){expect((await rpc({...r,data:{...r.data,complianceRecords:[child]}})).error?.code).toBe('22023');untouched(r);}});
 caseTest('invalid included child rolls back employee, number and history',async()=>{const r=await request();r.data.complianceRecords=[{...children(r.data.selectedDocumentIds[0])[0],document_number:''}];expect((await rpc(r)).error).not.toBeNull();untouched(r);});
 caseTest('missing numbering denies initial mutation and receipt replay',async()=>{const saved=await request();expect((await rpc(saved)).error).toBeNull();const fresh=await request(),before=counts(saved);try{setGrant(numberGrant,false);expect((await rpc(fresh)).error?.code).toBe('42501');expect((await rpc(saved)).error?.code).toBe('42501');untouched(fresh);expect(counts(saved)).toEqual(before);}finally{setGrant(numberGrant,true);}});
 caseTest('employee create without manage cannot bypass status or link policy',async()=>{const r=await request(),limited=grant(hrCodes.filter(code=>code!=='hr.employees.update'));try{setGrant(hrGrant,false);expect((await rpc(r)).error?.code).toBe('42501');untouched(r);}finally{setGrant(limited,false);setGrant(hrGrant,true);}},30_000);
 caseTest('medical manage and view remain separate from ordinary compliance',async()=>{const doc=source(),r=await request(doc,{complianceRecords:[children(doc)[1]]}),limited=grant(hrCodes.filter(code=>!code.startsWith('hr.medical.')));try{setGrant(hrGrant,false);expect((await rpc(r)).error?.code).toBe('42501');untouched(r);}finally{setGrant(limited,false);setGrant(hrGrant,true);}},30_000);
 caseTest('source preview alone does not grant DMS linking edit',async()=>{const r=await request(),limited=grant(dmsCodes.filter(code=>code!=='dms.documents.edit'));try{setGrant(dmsGrant,false);expect((await rpc(r)).error?.code).toBe('42501');untouched(r);}finally{setGrant(limited,false);setGrant(dmsGrant,true);}});
 caseTest('scoped-only HR and document grants accept own destination and reject foreign scopes',async()=>{const allowed=await request(),foreign=await request(source(otherCompany),{owner_company_id:otherCompany}),h=grant(hrCodes,company),d=grant(dmsCodes,company);try{setGrant(hrGrant,false);setGrant(dmsGrant,false);expect((await rpc(allowed)).error).toBeNull();expect((await rpc(foreign)).error?.code).toBe('42501');untouched(foreign);}finally{setGrant(h,false);setGrant(d,false);setGrant(hrGrant,true);setGrant(dmsGrant,true);}},30_000);
 caseTest('sensitive document classification is not bypassed by broad ordinary DMS capabilities',async()=>{const doc=source(company,'hr');const result=await client.rpc('prepare_document_employee_sources',{p_ids:[doc]});expect(result.error?.code).toBe('42501');});
 caseTest('preparation returns fingerprints and reviewed data without raw OCR/storage/provider response',async()=>{const doc=source(),result=await client.rpc('prepare_document_employee_sources',{p_ids:[doc]});expect(result.error).toBeNull();expect(result.data[0].fingerprint).toMatch(/^[a-f0-9]{64}$/);expect(result.data[0]).toMatchObject({documentId:doc,document:{id:doc,title:marker},extraction:null});expect(JSON.stringify(result.data)).not.toMatch(/storage_path|raw_ocr_text|raw_response_json/);});
 caseTest('ordinary duplicates remain warnings rather than an invented global uniqueness rule',async()=>{const first=await request();expect((await rpc(first)).error).toBeNull();const next=await request(source(),{mobile_number:first.data.mobile_number,full_name_en:first.data.full_name_en});const result=await rpc(next);expect(result.error).toBeNull();expect(result.data.warnings).toHaveLength(2);});
 caseTest('accessible active/pending passport duplicates still block after normalization',async()=>{
  const existing=JSON.parse(sql("select coalesce((select jsonb_build_object('id',id,'code',code,'is_active',is_active,'deleted_at',deleted_at) from public.hr_identity_document_types where upper(code)='PASSPORT' order by id limit 1),'null'::jsonb)"));
  if(existing&&(!existing.is_active||existing.deleted_at!==null)){
   expect(tracked('hr_identity_document_types',existing.id),'Only an already tracked synthetic canonical lookup may be restored for a repeat test').toBe(true);
   borrowedCatalogues.push({table:'hr_identity_document_types',...existing});
   intent({operation:'Temporarily restore exact previously owned canonical passport lookup; preserve original active/archive values for cleanup',table:'hr_identity_document_types',...existing});
   expect(sql(`update public.hr_identity_document_types set is_active=true,deleted_at=null where id=${existing.id} and code=${q(existing.code)} returning id`)).toBe(String(existing.id));
  }
  const passport=existing?Number(existing.id):put('hr_identity_document_types',{code:'PASSPORT',name_en:marker,is_active:true});const doc=source(),first=await request(doc,{complianceRecords:[{...children(doc)[0],document_type_id:passport,document_number:marker+'-P',status:'active'}]});expect((await rpc(first)).error).toBeNull();const nextDoc=source(),next=await request(nextDoc,{complianceRecords:[{...children(nextDoc)[0],document_type_id:passport,document_number:marker.toLowerCase()+' p',status:'pending'}]});expect((await rpc(next)).error?.code).toBe('PT409');untouched(next);
 },30_000);
 caseTest('late audit fault rolls all business rows and numbering back',async()=>{const r=await request(),fault='f06_de_fault_'+r.operation.replaceAll('-','');faults.push(fault);intent({operation:'Exact operation audit fault; remove in finally',operationId:r.operation,function:'erp_private.'+fault,trigger:fault});try{sql(`create function erp_private.${fault}() returns trigger language plpgsql set search_path='' as $$begin if new.action='document_to_employee.create' and new.new_values->>'operation_id'=${q(r.operation)} then raise exception 'Synthetic audit rejection' using errcode='P0001';end if;return new;end$$;create trigger ${fault} before insert on public.audit_logs for each row execute function erp_private.${fault}()`);expect((await rpc(r)).error?.code).toBe('P0001');untouched(r);}finally{sql(`drop trigger if exists ${fault} on public.audit_logs;drop function if exists erp_private.${fault}()`);}});
 const requestHash=(r:Request)=>`encode(sha256(convert_to(jsonb_build_array(${q(JSON.stringify(r.sources))}::jsonb,${q(JSON.stringify(r.data))}::jsonb)::text,'UTF8')),'hex')`;
 const actorSql=(body:string)=>`begin;do $$begin perform set_config('request.jwt.claims',${q(JSON.stringify(claims))},true);end$$;set local role authenticated;${body};set constraints all immediate;rollback;`;
 const contextSql=(r:Request,result:object={})=>`select set_config('erp.document_employee',(jsonb_build_object('operation_id',${q(r.operation)},'hash',${requestHash(r)},'payload',${q(JSON.stringify(r.data))}::jsonb,'sources',${q(JSON.stringify(r.sources))}::jsonb,'result',${q(JSON.stringify(result))}::jsonb))::text,true)`;
 const auditSql=(r:Request,result:Record<string,unknown>)=>`insert into public.audit_logs(actor_user_profile_id,owner_company_id,module_code,entity_name,entity_id,entity_reference,action,new_values) values(${actor},${company},'HR','employees',${result.employeeId},${q(result.employeeCode)},'document_to_employee.create',${q(JSON.stringify({operation_id:r.operation,selected_document_ids:r.data.selectedDocumentIds,created_child_record_counts:r.data.complianceRecords.length,documents_linked:r.data.selectedDocumentIds.length,conflict_count:r.data.conflictsReviewed,source:'HR.14A'}))}::jsonb)`;
 caseTest('authenticated SQL cannot forge a receipt using correct hash, GUC and caller-owned audit JSON',async()=>{const saved=await request(),result=await rpc(saved);expect(result.error).toBeNull();const forged=await request(saved.data.selectedDocumentIds[0]);intent({operation:'Exact authenticated direct-SQL receipt forgery negative; correct request hash, no INSERT proof',operationId:forged.operation});expect(()=>sql(actorSql(`${contextSql(forged,{...result.data,operationId:forged.operation})};${auditSql(forged,result.data)}`))).toThrow(/created in this transaction/);untouched(forged);});
 caseTest('authenticated callers cannot write any private receipt or INSERT-proof table',()=>{for(const table of ['document_employee_receipts','document_employee_insert_proofs','document_employee_insert_facts'])expect(()=>sql(actorSql(`delete from erp_private.${table} where false`))).toThrow(/permission denied/);});
 caseTest('updating an existing employee cannot manufacture INSERT proof even with correct hash and audit facts',async()=>{const saved=await request(),result=await rpc(saved);expect(result.error).toBeNull();const forged=await request(saved.data.selectedDocumentIds[0],saved.data);intent({operation:'Exact owned employee update/xmin forgery negative; transaction must roll back',operationId:forged.operation,employeeId:result.data.employeeId});expect(()=>sql(actorSql(`update public.employees set updated_by=${actor} where id=${result.data.employeeId};${contextSql(forged,{...result.data,operationId:forged.operation})};${auditSql(forged,result.data)}`))).toThrow(/consumed matching number/);expect(counts(forged)).toEqual({receipts:0,numbers:0,audits:0,events:0});});
 for(const mismatch of ['code','operation','allocation-request'] as const)caseTest(`INSERT proof rejects a mismatched numbering ${mismatch}`,async()=>{
  const r=await request();intent({operation:'Exact authenticated mismatched numbering INSERT proof probe; transaction must roll back',operationId:r.operation,mismatch});
  const payload={...r.data,employee_code:marker+'manual',created_by:actor,updated_by:actor} as Record<string,unknown>;for(const key of ['selectedDocumentIds','complianceRecords','conflictsReviewed','totalDocumentsSelected'])delete payload[key];
  const columns=Object.keys(payload).join(','),values=Object.keys(payload).map(key=>key==='employee_code'&&mismatch!=='code'?`v_number->>'generated_reference_number'`:`r.${key}`).join(',');
  const allocate=`public.allocate_numbering_reference(${q(mismatch==='operation'?randomUUID():r.operation)}::uuid,null,'HR_EMPLOYEE',null,'reserved','employees',null,${mismatch==='allocation-request'?q('Wrong consumer'):`'F06 HR document employee '||${requestHash(r)}`})`;
  expect(()=>sql(actorSql(`${contextSql(r)};do $$declare v_number jsonb;begin v_number:=${allocate};insert into public.employees(${columns}) select ${values} from jsonb_populate_record(null::public.employees,${q(JSON.stringify(payload))}::jsonb) r;end$$`))).toThrow(/matching reserved number/);untouched(r);
 });
 caseTest('a valid INSERT proof cannot commit an incomplete business transaction or survive as an orphan',async()=>{
  const r=await request(),payload={...r.data,employee_code:marker,created_by:actor,updated_by:actor} as Record<string,unknown>;for(const key of ['selectedDocumentIds','complianceRecords','conflictsReviewed','totalDocumentsSelected'])delete payload[key];
  intent({operation:'Exact authenticated incomplete transaction negative; deferred proof guard must roll back',operationId:r.operation});const columns=Object.keys(payload).join(','),values=Object.keys(payload).map(key=>key==='employee_code'?`v_number->>'generated_reference_number'`:`r.${key}`).join(',');
  expect(()=>sql(actorSql(`${contextSql(r)};do $$declare v_number jsonb;begin v_number:=public.allocate_numbering_reference(${q(r.operation)}::uuid,null,'HR_EMPLOYEE',null,'reserved','employees',null,'F06 HR document employee '||${requestHash(r)});insert into public.employees(${columns}) select ${values} from jsonb_populate_record(null::public.employees,${q(JSON.stringify(payload))}::jsonb) r;end$$`))).toThrow(/transaction is incomplete/);untouched(r);expect(sql(`select count(*) from erp_private.document_employee_insert_proofs where operation_id=${q(r.operation)}`)).toBe('0');
 });

 const waitFor=async(check:()=>boolean,label:string)=>{const deadline=Date.now()+8_000;while(!check()){if(Date.now()>deadline)throw Error('Timed out waiting for '+label);await new Promise(resolve=>setTimeout(resolve,75));}};
 const holderIdentity=(holder:Holder)=>{
  if(holder.pid===null||holder.backendStart===null)throw Error('Missing exact holder identity');
  return `datname=current_database() and pid=${holder.pid} and backend_start=${q(holder.backendStart)}::timestamptz and application_name=${q(holder.name)}`;
 };
 const backendIdentity=(w:Witness)=>`datname=current_database() and datid=${w.database} and pid=${w.pid} and backend_start=${q(w.backend_start)}::timestamptz`;
 async function observeWait(holder:Holder,rpcName:string){
  let witness:Witness|undefined;
  await waitFor(()=>{
   assertRunning();
   const rows=JSON.parse(sql(`select coalesce(jsonb_agg(jsonb_build_object('pid',pid,'database',datid,'backend_start',backend_start,'xact_start',xact_start,'query_start',query_start,'query_hash',md5(query))),'[]') from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and state='active' and xact_start is not null and wait_event_type='Lock' and ${holder.pid}=any(pg_blocking_pids(pid)) and query like ${q('%'+rpcName+'%')} and exists(select 1 from pg_stat_activity where ${holderIdentity(holder)})`));
   expect(rows.length).toBeLessThanOrEqual(1);
   if(rows.length===1){witness=rows[0];return true;}return false;
  },'exact RPC wait');
  note('exact-wait',{holder:{name:holder.name,pid:holder.pid,backendStart:holder.backendStart},witness});return witness!;
 }
 function retainedWait(holder:Holder,w:Witness){
  expect(sql(`select count(*) from pg_stat_activity where ${backendIdentity(w)} and xact_start=${q(w.xact_start)}::timestamptz and query_start=${q(w.query_start)}::timestamptz and md5(query)=${q(w.query_hash)} and state='active' and wait_event_type='Lock' and ${holder.pid}=any(pg_blocking_pids(pid)) and exists(select 1 from pg_stat_activity where ${holderIdentity(holder)})`)).toBe('1');
 }
 async function transactionEnded(w:Witness,operation:string){
  await waitFor(()=>executeSql(`select count(*) from pg_stat_activity where ${backendIdentity(w)} and (xact_start=${q(w.xact_start)}::timestamptz or (state<>'idle' and query_start=${q(w.query_start)}::timestamptz and md5(query)=${q(w.query_hash)}))`)==='0','exact contender transaction end');
  // Called only for the single dispatch bound to this exact witnessed wait.
  for(const [key,value]of pendingCalls)if(value.operation===operation)pendingCalls.delete(key);
  note('exact-transaction-ended',{operation,witness:w});
 }
 async function hold(rowId:number,table:'dms_documents'|'dms_document_files'='dms_documents'){
  assertRunning();expect(owned.some(row=>row.table===table&&row.id===rowId)).toBe(true);
  const name=marker+'_LOCK_'+randomUUID().replaceAll('-','').slice(0,10);
  intent({table,id:rowId,applicationName:name,containerId:pinned,operation:'Exact row holder; rollback and original-backend end proof'});
  const child=spawn('docker',['--host','npipe:////./pipe/dockerDesktopLinuxEngine','exec','-i','-e','PGPASSWORD=postgres',pinned,'psql','-w','-X','-qAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],{windowsHide:true,timeout:30000});
  const holder:Holder={child,name,pid:null,backendStart:null,closed:false};holders.add(holder);
  let output='',failure:Error|null=null;
  child.stdout.on('data',chunk=>{
   output+=String(chunk);const match=output.match(/HOLDER:(\{[^\r\n]*\})/);if(!match)return;
   try{const identity=JSON.parse(match[1]);if(!Number.isSafeInteger(identity.pid)||identity.pid<1||typeof identity.backend_start!=='string')throw Error('Invalid holder identity');holder.pid=identity.pid;holder.backendStart=identity.backend_start;}catch{failure=Error('Invalid holder identity');}
  });
  child.stderr.on('data',()=>{});child.on('error',error=>{failure=error;});child.stdin.on('error',error=>{failure=error;});child.on('close',()=>{holder.closed=true;});
  child.stdin.write(`begin;set local application_name=${q(name)};set local statement_timeout='10s';set local idle_in_transaction_session_timeout='20s';select 'HOLDER:'||json_build_object('pid',pid,'backend_start',backend_start)::text from pg_stat_activity where pid=pg_backend_pid();select id from public.${table} where id=${rowId} for update;select 'READY:'||pg_backend_pid();\n`);
  try{
   await waitFor(()=>{assertRunning();if(failure||holder.closed)throw failure??Error('Holder exited before ready');return /READY:\d+/.test(output);},'exact holder ready');
   expect(holder.pid).toBe(Number(output.match(/READY:(\d+)/)![1]));expect(holder.backendStart).not.toBeNull();
   holderManifest.push({name,pid:holder.pid,backendStart:holder.backendStart});note('holder-ready',{name,pid:holder.pid,backendStart:holder.backendStart});return holder;
  }catch(error){await release(holder);throw error;}
 }
 async function release(holder:Holder){
  if(!holders.has(holder))return;
  try{
   if(!holder.closed&&!holder.child.stdin.destroyed)holder.child.stdin.end('rollback;\n\\q\n');
   const exact=holderIdentity(holder);
   try{await waitFor(()=>holder.closed,'holder process end');}
   finally{executeSql(`select pg_terminate_backend(pid) from pg_stat_activity where ${exact}`);await waitFor(()=>executeSql(`select count(*) from pg_stat_activity where ${exact}`)==='0','exact holder backend end');}
   holders.delete(holder);note('holder-ended',{name:holder.name,pid:holder.pid,backendStart:holder.backendStart});
  }catch(error){unresolved('Exact holder end unproven');throw error;}
 }
 async function lateAuthority(revoke:boolean,replay:boolean,fileWait=false){
  assertRunning();const doc=source(),file=fileWait?sourceFile(doc):null,r=await request(doc);if(replay)expect((await rpc(r)).error).toBeNull();const before=counts(r);
  let holder:Holder|undefined,witness:Witness|undefined,pending:PromiseLike<unknown>|undefined,dispatched=false,ended=false;
  const abort=new AbortController();
  try{
   assertRunning();holder=await hold(file??doc,fileWait?'dms_document_files':'dms_documents');assertRunning();
   note('wait-rpc-dispatch',{operation:r.operation,rpc:'create_numbered_document_employee',holder:{pid:holder.pid,backendStart:holder.backendStart,name:holder.name}});
   dispatched=true;const response=Promise.resolve(client.rpc('create_numbered_document_employee',{p_operation:r.operation,p_sources:r.sources,p_data:r.data}).abortSignal(abort.signal));pending=response;
   witness=await observeWait(holder,'create_numbered_document_employee');
   if(revoke)setGrant(dmsGrant,false);
   retainedWait(holder,witness);note('wait-retained-after-authority',{operation:r.operation,revoke,witness});
   await release(holder);const result=await response;
   await transactionEnded(witness,r.operation);ended=true;
   if(revoke){expect(result.error?.code).toBe('42501');expect(counts(r)).toEqual(before);}
   else{expect(result.error).toBeNull();expect(result.data.replayed).toBe(replay);recordResult(r.operation,result.data);}
  }finally{
   try{if(holder)await release(holder);}
   finally{
    abort.abort();if(pending)await Promise.resolve(pending).catch(()=>undefined);
    if(dispatched&&!ended){
     if(!witness){unresolved('Dispatched RPC has no exact transaction witness');throw Error('Grant restoration withheld: RPC witness missing');}
     try{await transactionEnded(witness,r.operation);ended=true;}catch(error){unresolved('Contender transaction end unproven');throw error;}
    }
    if(!stopped&&!cleanupBegun&&!cleanupUnresolved)setGrant(dmsGrant,true);
    else note('grant-restoration-withheld',{grant:dmsGrant,operation:r.operation,ended,stopped,cleanupBegun});
   }
  }
 }
 caseTest('source wait positive control commits once',()=>lateAuthority(false,false),45_000);
 caseTest('source wait late revoke rolls back all effects',()=>lateAuthority(true,false),45_000);
 caseTest('replay source wait positive control returns the committed receipt',()=>lateAuthority(false,true),45_000);
 caseTest('replay source wait late revoke returns no receipt or additional effects',()=>lateAuthority(true,true),45_000);
 caseTest('later file wait positive control commits once',()=>lateAuthority(false,false,true),45_000);
 caseTest('later file wait late revoke rolls back all effects',()=>lateAuthority(true,false,true),45_000);
 caseTest('replay later file wait late revoke returns no receipt',()=>lateAuthority(true,true,true),45_000);
 afterAll(async()=>{
  if(!ledger)return;const authCleanup=await admitCleanup();const failures:string[]=[];
  // Only fixed allowlisted summaries are retained, never raw errors/rows/keys.
  const cleanup=(fn:()=>void,resource='unclassified exact fixture')=>{note('cleanup-step-intent',{resource});try{fn();note('cleanup-step-finished',{resource});}catch(error){const raw=error instanceof Error?error.message:'';const reason=/foreign key/i.test(raw)?'23503 foreign-key dependency':/permission denied/i.test(raw)?'42501 permission denied':/check constraint/i.test(raw)?'23514 integrity guard':/timeout|timed out/i.test(raw)?'timeout bounded operation':/expected|assert/i.test(raw)?'assertion exact outcome mismatch':'unknown inspect exact resource';failures.push(`${resource}: ${reason}`);note('cleanup-step-failed',{resource,reason});}};
  try{
   for(const holder of [...holders])try{await release(holder);}catch{failures.push('Exact HR14A holder cleanup failed.');}
   for(const fault of faults)cleanup(()=>cleanupSql(`drop trigger if exists ${fault} on public.audit_logs;drop function if exists erp_private.${fault}()`),`fault:${fault}`);
   for(const op of operations)cleanup(()=>{const receipts=JSON.parse(cleanupSql(`select coalesce(jsonb_agg(result),'[]') from erp_private.document_employee_receipts where actor=(select auth_user_id from public.user_profiles where id=${actor}) and operation_id=${q(op.operation)}`));if(receipts.length){expect(receipts).toHaveLength(1);recordResult(op.operation,receipts[0]);}for(const id of JSON.parse(cleanupSql(`select coalesce(json_agg(id),'[]') from public.audit_logs where actor_user_profile_id=${actor} and new_values->>'operation_id'=${q(op.operation)}`)))record('audit_logs',id);for(const id of JSON.parse(cleanupSql(`select coalesce(json_agg(id),'[]') from public.dms_document_events where performed_by=${actor} and metadata_json->>'operation_id'=${q(op.operation)}`)))record('dms_document_events',id);},`receipt/history operation:${op.operation}`);
   for(const row of owned.filter(row=>row.table==='employees'))cleanup(()=>{for(const id of JSON.parse(cleanupSql(`select coalesce(json_agg(id),'[]') from public.employee_status_events where employee_id=${row.id}`)))record('employee_status_events',id);},`employee_status_events employee:${row.id}`);
   for(const table of ['employee_identity_documents','employee_medical_insurances','employee_training_certificates','dms_document_links','employees','dms_document_files','dms_documents','dms_document_types','dms_document_categories','hr_identity_document_types','hr_training_types'])for(const row of owned.filter(row=>row.table===table))cleanup(()=>{intent({operation:'Soft retire exact synthetic HR14A row; retain history/numbers',table,id:row.id});const hrLookup=['hr_identity_document_types','hr_training_types'].includes(table);cleanupSql(`update public.${table} set ${hrLookup?'is_active=false,':''}deleted_at=coalesce(deleted_at,clock_timestamp()) where id=${row.id}`);},`${table}:${row.id}`);
   for(const row of owned.filter(row=>['user_roles','roles','global_numbering_rules'].includes(row.table)))cleanup(()=>cleanupSql(`update public.${row.table} set is_active=false where id=${row.id}`),`${row.table}:${row.id}`);
   for(const row of owned.filter(row=>row.table==='owner_companies'))cleanup(()=>cleanupSql(`update public.owner_companies set status='inactive' where id=${row.id}`),`owner_companies:${row.id}`);
   for(const row of owned.filter(row=>row.table==='dms_ai_extraction_results'))cleanup(()=>cleanupSql(`update public.dms_ai_extraction_results set ai_status='superseded' where id=${row.id}`),`dms_ai_extraction_results:${row.id}`);
  }finally{
   for(const row of owned.filter(row=>row.table==='permissions'))cleanup(()=>{intent({table:'permissions',id:row.id,permissionName:marker,operation:'Retire exact newly-created synthetic permission definition'});expect(cleanupSql(`update public.permissions set is_active=false where id=${row.id} and permission_name=${q(marker)} returning id`)).toBe(String(row.id));},`permissions:${row.id}`);
   for(const row of owned.filter(row=>row.table==='erp_ai_feature_flags'))cleanup(()=>{expect(cleanupSql(`update public.erp_ai_feature_flags set is_enabled=false where id=${row.id} and feature_name=${q(marker)} returning id`)).toBe(String(row.id));},`erp_ai_feature_flags:${row.id}`);
   for(const row of borrowed)cleanup(()=>{cleanupSql(`update public.${row.table} set ${row.column}=${row.original} where id=${row.id}`);expect(cleanupSql(`select ${row.column} from public.${row.table} where id=${row.id}`)).toBe(row.original?'t':'f');},`borrowed ${row.table}:${row.id}`);
   for(const row of borrowedCatalogues)cleanup(()=>{
    intent({operation:'Restore exact canonical HR lookup preimage after owned children retired; preserve revisions/history',...row});
    expect(cleanupSql(`update public.hr_identity_document_types set is_active=${row.is_active},deleted_at=${q(row.deleted_at)}::timestamptz where id=${row.id} and code=${q(row.code)} returning id`)).toBe(String(row.id));
    expect(cleanupSql(`select is_active=${row.is_active} and deleted_at is not distinct from ${q(row.deleted_at)}::timestamptz from public.hr_identity_document_types where id=${row.id}`)).toBe('t');
   },`borrowed HR catalogue:${row.id}`);
   const result={marker,actor,owned,borrowed,borrowedCatalogues,rolePermissions,operations,sessions,holders:holderManifest,faults,authCleanup,cleanupFailures:failures,retainedHistory:true,productionWrites:0,providerCalls:0};
   note('cleanup-finished',{cleanupFailures:failures,cleanupVerified:failures.length===0,fullNativeAcceptance:false});writeResult({...result,cleanupVerified:failures.length===0,fullNativeAcceptance:false});
   if(journal!==undefined){fs.closeSync(journal);journal=undefined;}expect(failures).toEqual([]);
  }
 },120_000);
});
