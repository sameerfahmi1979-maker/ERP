import {nativeApiOrigin} from './native-api-origin.mjs';
// MAIN ONLY. Authenticated RPCs against the pinned isolated F06 loopback stack.
// Opt-in, exact fixture intents before writes, no provider/browser/mail calls.
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import {spawn,spawnSync,type ChildProcessWithoutNullStreams} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {runtime,evidence} from './local-db.mjs';
import {planDmsFixturePermission,dmsFixtureSessionIdentity,cleanDmsFixtureSessions,type DmsFixtureAuthSession} from './dms-numbered-create-harness-guards';

describe.skipIf(process.env.ALGT_F06_RECRUITMENT_TESTS!=='1')('retained numbered recruitment consumers',()=>{
 const marker='FRC'+Date.now().toString(36).toUpperCase();
 type Ledger={actors:Record<string,{profileId:number;email:string;password:string}>;rows:object[];intents:object[]};
 let ledger:Ledger,actor:number,client:SupabaseClient,pinned:string,company:number,otherCompany:number,hrGrant:number,numberGrant:number;
 const owned:{table:string;id:number}[]=[],borrowed:{table:string;id:number;originalActive:boolean}[]=[],operations:{operation:string;kind:string;candidateId:number|null;result?:unknown}[]=[],sessions:DmsFixtureAuthSession[]=[],rolePermissions:{roleId:number;permissionId:number;permissionCode:string}[]=[];
 const faults:string[]=[];type Holder={name:string;pid:number|null;backendStart:string|null;closed:boolean;child:ChildProcessWithoutNullStreams};type Witness={pid:number;database:number;backend_start:string;xact_start:string;query_start:string;query_hash:string};const holders=new Set<Holder>(),holderManifest:{name:string;pid:number|null;backendStart:string|null}[]=[];
 const codes=['hr.recruitment.manage','hr.recruitment.view','hr.employees.create','hr.employees.view','hr.employees.update','numbering.rules.generate'];
 const payrollCodes=['hr.payroll.view','hr.payroll.manage'];
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
 const resultPath=path.join(evidence,'NUMBERED_RECRUITMENT_RESOURCES_'+marker+'.json');
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
 function put(table:string,values:Record<string,unknown>){assertRunning();intent({operation:'Create exact synthetic recruitment fixture',table,values});return record(table,Number(sql(`insert into public.${table}(${Object.keys(values).join(',')}) values(${Object.values(values).map(q).join(',')}) returning id`)));}
 function grant(codeList:string[],scope:number|null=null){const role=put('roles',{role_code:marker+'_'+owned.length,role_name:marker,is_active:true});for(const code of codeList){const permission=Number(sql(`select id from public.permissions where permission_code=${q(code)} and is_active`));expect(permission).toBeGreaterThan(0);intent({table:'role_permissions',role_id:role,permission_id:permission,permissionCode:code});sql(`insert into public.role_permissions(role_id,permission_id)values(${role},${permission})`);rolePermissions.push({roleId:role,permissionId:permission,permissionCode:code});ledger.rows.push({marker,table:'role_permissions',role_id:role,permission_id:permission});persist();}return put('user_roles',{user_profile_id:actor,role_id:role,owner_company_id:scope,branch_id:null,is_active:true});}
 function setGrant(id:number,active:boolean){if(active){assertRunning();if(pendingCalls.size||signInUncertain||sqlUncertain)throw Error('Cannot restore authority while work is unresolved');}expect(owned.some(row=>row.table==='user_roles'&&row.id===id)).toBe(true);intent({table:'user_roles',id,is_active:active,operation:'Exact fixture authority change'});expect(sql(`update public.user_roles set is_active=${active} where id=${id} and user_profile_id=${actor} returning id`)).toBe(String(id));}
 beforeAll(async()=>{
  if(activeBodies.size||cleanupBegun)throw Error('Setup overlap forbidden');activeBodies.add('setup');
  const setupAbort=new AbortController();bodyAbort=setupAbort;bodyDeadline=performance.now()+25000;
  const timer=setTimeout(()=>{stopped=true;setupAbort.abort();},25000);
  try{
  expect(process.env.ALGT_F06_NATIVE_TARGET).toBe('native77c');expect(nativeApiOrigin).toBe('http://127.0.0.1:16881');
  expect(process.env.ALGT_F06_LOCAL_TARGET).toBeUndefined();pinned=guard();
  journal=fs.openSync(path.join(evidence,'NUMBERED_RECRUITMENT_HARNESS_'+marker+'.jsonl'),'wx',0o600);note('setup-admitted',{pinned});
  const keys=JSON.parse(fs.readFileSync(path.join(runtime,'keys-private.json'),'utf8'));expect(keys.API_URL).toBe(nativeApiOrigin);ledger=JSON.parse(fs.readFileSync(path.join(runtime,'fixtures-private.json'),'utf8'));actor=ledger.actors.none.profileId;
  expect(sql(`select count(*) from public.user_roles where user_profile_id=${actor} and is_active`)).toBe('0');
  intent({operation:'Main-approved isolated recruitment consumer acceptance; exact Auth session, synthetic candidates/requisitions/employees, retained allocated number/history; no counter restoration or reuse.'});
  for(const code of [...codes,...payrollCodes]){const prior=JSON.parse(sql(`select coalesce(json_agg(json_build_object('id',id,'active',is_active)),'[]') from public.permissions where permission_code=${q(code)}`));const plan=planDmsFixturePermission(prior,ledger.rows);if(plan.kind==='create')put('permissions',{permission_code:code,permission_name:marker,module_code:'HR',action_code:code.split('.').at(-1),is_active:true});else if(plan.kind==='borrow'){borrowed.push({table:'permissions',id:plan.id,originalActive:false});intent({table:'permissions',id:plan.id,operation:'Activate exact ledger-owned permission; restore false'});sql(`update public.permissions set is_active=true where id=${plan.id}`);}}
  for(const [code,prefix] of [['HR_JOB_REQUISITION','F06RQ'],['HR_EMPLOYEE','F06RE']]){
   const prior=JSON.parse(sql(`select coalesce(json_agg(json_build_object('id',id,'active',is_active)),'[]') from public.global_numbering_rules where rule_code=${q(code)}`));expect(prior.length).toBeLessThanOrEqual(1);
   if(prior.length){const id=Number(prior[0].id);expect(tracked('global_numbering_rules',id),'Existing canonical rule must be an exact ledger-owned synthetic rule; main must reconcile otherwise').toBe(true);borrowed.push({table:'global_numbering_rules',id,originalActive:prior[0].active});if(!prior[0].active){intent({table:'global_numbering_rules',id,operation:'Activate exact synthetic canonical rule; restore its flag, never its counters'});sql(`update public.global_numbering_rules set is_active=true where id=${id}`);}}
   else put('global_numbering_rules',{rule_code:code,rule_name:marker,module_code:'HR',module_name:'Synthetic recruitment',document_type_code:prefix,document_type_name:'Synthetic recruitment',document_prefix:prefix,format_template:'{DOC}-{SEQ6}',sequence_length:6,padding_character:'0',separator:'-',starting_sequence_number:1,reset_policy:'never',is_active:true,is_locked:false});
  }
  hrGrant=grant(codes.filter(code=>code!=='numbering.rules.generate'));numberGrant=grant(['numbering.rules.generate']);
  company=put('owner_companies',{company_code:marker+'A',legal_name_en:marker,status:'active'});otherCompany=put('owner_companies',{company_code:marker+'B',legal_name_en:marker,status:'active'});
  client=createClient(keys.API_URL,keys.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:localFetch}});intent({operation:'Sign in exact local actor; record session and sign out locally in finally',profileId:actor});assertRunning();signInUncertain=true;const login=await client.auth.signInWithPassword({email:ledger.actors.none.email,password:ledger.actors.none.password});expect(login.error===null).toBe(true);
  const identity=dmsFixtureSessionIdentity(login.data.session?.access_token,login.data.user?.id);sessions.push({actor:'none',profileId:actor,...identity});ledger.rows.push({marker,table:'auth.sessions',id:identity.sessionId,authUserId:identity.authUserId});persist();
  expect(sql(`select count(*) from auth.sessions s join public.user_profiles p on p.auth_user_id=s.user_id where s.id=${q(identity.sessionId)}::uuid and s.user_id=${q(identity.authUserId)}::uuid and p.id=${actor}`)).toBe('1');
  const valid=await client.rpc('f03_current_session_valid');expect(valid.error).toBeNull();expect(valid.data).toBe(true);
  signInUncertain=false;assertRunning();note('signin-bound',{sessionId:identity.sessionId,authUserId:identity.authUserId,actor});
  }catch(error){stopped=true;throw error;}
  finally{clearTimeout(timer);activeBodies.delete('setup');if(bodyAbort===setupAbort){bodyAbort=undefined;bodyDeadline=Infinity;}}
 },30_000);
 const payload=()=>({owner_company_id:company,joining_date:'2026-10-04',employee_status:'active',emergency_contact_name:'Synthetic contact',emergency_contact_mobile:'0000000000'});
 function candidate(requisition:number|null=null){return put('hr_candidates',{candidate_code:marker+'C'+owned.length,full_name_en:marker,requisition_id:requisition,candidate_status:'selected',pipeline_stage:'onboarding',gender:'male',date_of_birth:'1990-01-01',mobile_number:'0000000000'});}
 function request(kind:'requisition'|'conversion',candidateId:number|null=null,fields:object=kind==='requisition'?{requisition_title:marker,vacancies_count:1,requisition_status:'draft',priority:'normal'}:payload(),revision='1'){
  const operation=randomUUID();operations.push({operation,kind,candidateId});intent({operation:'Retained exact consumer request',operationId:operation,kind,candidateId,revision,fields});return {kind,operation,candidateId,fields,revision};
 }
 type Request=ReturnType<typeof request>;
 async function rpc(r:Request){const response=await client.rpc(r.kind==='requisition'?'create_numbered_job_requisition':'convert_candidate_to_employee_atomic',{p_operation:r.operation,p_data:r.fields,...(r.kind==='conversion'?{p_candidate:r.candidateId,p_revision:r.revision}:{})});if(response.data){operations.find(op=>op.operation===r.operation)!.result=response.data;if(r.kind==='requisition')record('hr_job_requisitions',response.data.id);else{record('employees',response.data.employee_id);record('employee_recruitment_links',response.data.link_id);}record('global_numbering_generated_references',response.data.reference_id);}return response;}
 const counts=(r:Request)=>JSON.parse(sql(`select jsonb_build_object('receipts',(select count(*) from erp_private.recruitment_consumer_receipts where actor=(select auth_user_id from public.user_profiles where id=${actor}) and operation_id=${q(r.operation)}),'numbers',(select count(*) from erp_private.numbering_requests where actor_id=${actor} and operation_id=${q(r.operation)}),'audits',(select count(*) from public.audit_logs where actor_user_profile_id=${actor} and new_values->>'operation_id'=${q(r.operation)}))`));
 const untouched=(r:Request)=>expect(counts(r)).toEqual({receipts:0,numbers:0,audits:0});
 caseTest('inherited recruitment capability helpers preserve allowed decisions with fixed resolution',async()=>{for(const name of ['current_user_can_view_hr_recruitment','current_user_can_manage_hr_recruitment']){const r=await client.rpc(name);expect(r.error).toBeNull();expect(r.data).toBe(true);}});
 caseTest('inherited recruitment capability helpers preserve denied decisions after authority removal',async()=>{try{setGrant(hrGrant,false);for(const name of ['current_user_can_view_hr_recruitment','current_user_can_manage_hr_recruitment']){const r=await client.rpc(name);expect(r.error).toBeNull();expect(r.data).toBe(false);}}finally{setGrant(hrGrant,true);}});
 caseTest('creates and replays one requisition with one bound consumed number and complete audit',async()=>{const r=request('requisition'),first=await rpc(r);expect(first.error).toBeNull();expect((await rpc(r)).data).toEqual({...first.data,replayed:true});expect(counts(r)).toEqual({receipts:1,numbers:1,audits:3});expect(sql(`select generation_status||':'||target_table_name||':'||target_record_id from public.global_numbering_generated_references where id=${first.data.reference_id}`)).toBe('consumed:hr_job_requisitions:'+first.data.id);});
 caseTest('converts candidate, onboarding, event, link, receipt, number and audits atomically; exact replay is a no-op',async()=>{const c=candidate(),task=put('hr_onboarding_tasks',{candidate_id:c,task_title:marker});const r=request('conversion',c),first=await rpc(r);expect(first.error).toBeNull();expect(first.data).toMatchObject({candidate_id:c,candidate_revision:'2',employee_revision:'1',replayed:false});expect((await rpc(r)).data).toEqual({...first.data,replayed:true});expect(sql(`select employee_id from public.hr_onboarding_tasks where id=${task}`)).toBe(String(first.data.employee_id));expect(sql(`select count(*) from public.employee_status_events where employee_id=${first.data.employee_id}`)).toBe('1');expect(counts(r)).toEqual({receipts:1,numbers:1,audits:5});expect(sql(`select candidate_status||':'||pipeline_stage from public.hr_candidates where id=${c}`)).toBe('hired:hired');});
 caseTest('same-operation concurrent submissions allocate once',async()=>{const r=request('conversion',candidate()),results=await Promise.all([rpc(r),rpc(r)]);for(const result of results)expect(result.error).toBeNull();expect(new Set(results.map(result=>result.data.employee_id)).size).toBe(1);expect(results.filter(result=>result.data.replayed)).toHaveLength(1);expect(counts(r)).toEqual({receipts:1,numbers:1,audits:5});});
 caseTest('distinct-operation conversion race cannot create two employees or reuse a number',async()=>{const c=candidate(),requests=[request('conversion',c),request('conversion',c)],results=await Promise.all(requests.map(rpc));expect(results.filter(result=>!result.error)).toHaveLength(1);expect(results.filter(result=>result.error)).toHaveLength(1);expect(sql(`select count(*) from public.employee_recruitment_links where candidate_id=${c}`)).toBe('1');for(let i=0;i<results.length;i++)if(results[i].error)untouched(requests[i]);});
 caseTest('rejects changed replay payload without changing original receipt',async()=>{const r=request('requisition');expect((await rpc(r)).error).toBeNull();const before=counts(r);expect((await rpc({...r,fields:{...r.fields,requisition_title:'Changed'}})).error?.code).toBe('22023');expect(counts(r)).toEqual(before);});
 caseTest('stale candidate revision rejects before allocation',async()=>{const c=candidate(),r=request('conversion',c);intent({table:'hr_candidates',id:c,operation:'Exact competing source edit'});sql(`update public.hr_candidates set full_name_en=${q(marker+' edited')} where id=${c}`);expect((await rpc(r)).error?.code).toBe('P0409');untouched(r);});
 caseTest('missing required contact or malformed input commits nothing',async()=>{for(const fields of [{...payload(),emergency_contact_name:''},{...payload(),owner_company_id:0},{...payload(),joining_date:'2026-02-30'},{...payload(),created_by:actor}]){const r=request('conversion',candidate(),fields);expect((await rpc(r)).error).not.toBeNull();untouched(r);}});
 caseTest('unknown or logically deleted candidate cannot allocate',async()=>{const c=candidate();intent({table:'hr_candidates',id:c,operation:'Soft retire exact synthetic source'});sql(`update public.hr_candidates set deleted_at=clock_timestamp() where id=${c}`);for(const id of [c,Number.MAX_SAFE_INTEGER]){const r=request('conversion',id);expect((await rpc(r)).error?.code).toBe('42501');untouched(r);}});
 caseTest('unrelated offer cannot be bound to another candidate',async()=>{const source=candidate(),other=candidate(),offer=put('hr_offers',{candidate_id:other,owner_company_id:company,offer_status:'accepted'}),r=request('conversion',source,{...payload(),offer_id:offer});expect((await rpc(r)).error?.code).toBe('42501');untouched(r);});
 caseTest('salary-budget write still requires independent payroll authority',async()=>{const r=request('requisition',null,{requisition_title:marker,budgeted_salary_min:0});expect((await rpc(r)).error?.code).toBe('42501');untouched(r);});
 caseTest('employee creation alone cannot bypass status/link management policy',async()=>{const limited=grant(codes.filter(code=>!['numbering.rules.generate','hr.employees.update'].includes(code))),r=request('conversion',candidate());try{setGrant(hrGrant,false);expect((await rpc(r)).error?.code).toBe('42501');untouched(r);}finally{setGrant(limited,false);setGrant(hrGrant,true);}});
 caseTest('conversion preparation exposes no salary or unnecessary candidate data',async()=>{const c=candidate(),response=await client.rpc('prepare_numbered_candidate_conversion',{p_candidate:c});expect(response.error).toBeNull();expect(response.data).toEqual({candidate:{id:c,workspace_revision:1,requisition_id:null},latest_offer:null,already_converted:false});});
 caseTest('missing numbering authority denies both consumers and replay',async()=>{const saved=request('requisition');expect((await rpc(saved)).error).toBeNull();const before=counts(saved),a=request('requisition'),b=request('conversion',candidate());try{setGrant(numberGrant,false);for(const r of [saved,a,b])expect((await rpc(r)).error?.code).toBe('42501');expect(counts(saved)).toEqual(before);untouched(a);untouched(b);}finally{setGrant(numberGrant,true);}});
 caseTest('scoped recruitment grant cannot create an unscoped requisition or foreign destination',async()=>{const scoped=grant(codes.filter(code=>code!=='numbering.rules.generate'),company);try{setGrant(hrGrant,false);for(const fields of [{requisition_title:marker},{requisition_title:marker,owner_company_id:otherCompany}]){const r=request('requisition',null,fields);expect((await rpc(r)).error?.code).toBe('42501');untouched(r);}const allowed=request('requisition',null,{requisition_title:marker,owner_company_id:company});expect((await rpc(allowed)).error).toBeNull();}finally{setGrant(scoped,false);setGrant(hrGrant,true);}});
 caseTest('scoped source authority cannot create a foreign employee destination',async()=>{const req=put('hr_job_requisitions',{requisition_code:marker+'SCOPE',requisition_title:marker,owner_company_id:company}),c=candidate(req),scoped=grant(codes.filter(code=>code!=='numbering.rules.generate'),company),r=request('conversion',c,{...payload(),owner_company_id:otherCompany,requisition_id:req});try{setGrant(hrGrant,false);expect((await rpc(r)).error?.code).toBe('42501');untouched(r);}finally{setGrant(scoped,false);setGrant(hrGrant,true);}});
 caseTest('late audit fault rolls every conversion write and allocation back',async()=>{const c=candidate(),r=request('conversion',c),fault='f06_rec_fault_'+r.operation.replaceAll('-','');faults.push(fault);intent({operation:'Exact operation audit fault; remove in finally',operationId:r.operation,function:'erp_private.'+fault,trigger:fault});try{sql(`create function erp_private.${fault}() returns trigger language plpgsql set search_path='' as $$begin if new.entity_name='hr_candidates' and new.new_values->>'operation_id'=${q(r.operation)} then raise exception 'Synthetic late audit rejection' using errcode='P0001';end if;return new;end$$;create trigger ${fault} before insert on public.audit_logs for each row execute function erp_private.${fault}()`);expect((await rpc(r)).error?.code).toBe('P0001');untouched(r);expect(sql(`select workspace_revision||':'||candidate_status from public.hr_candidates where id=${c}`)).toBe('1:selected');expect(sql(`select count(*) from public.employee_recruitment_links where candidate_id=${c}`)).toBe('0');}finally{sql(`drop trigger if exists ${fault} on public.audit_logs;drop function if exists erp_private.${fault}()`);}});
 // These adversarial SQL probes ALWAYS roll back. SET CONSTRAINTS forces the
 // commit proof before rollback; a vulnerable baseline is observed, not kept.
 const probe=(body:string)=>{const session=sessions[0];expect(session).toBeTruthy();return `begin;do $$begin perform set_config('request.jwt.claims',${q(JSON.stringify({role:'authenticated',sub:session.authUserId,session_id:session.sessionId}))},true);end$$;set local role authenticated;${body};set constraints all immediate;rollback;`;};
 const hash=(r:Request)=>`encode(sha256(convert_to(jsonb_build_array(${q(r.kind)},${r.kind==='conversion'?`${r.candidateId}::bigint,${q(r.revision)}::bigint,`:''}${q(JSON.stringify(r.fields))}::jsonb)::text,'UTF8')),'hex')`;
 const context=(r:Request)=>`perform set_config('erp.recruitment_consumer',jsonb_build_object('kind',${q(r.kind)},'operation_id',${q(r.operation)},'hash',${hash(r)},'reference_id',v_number->'id','payload',${q(JSON.stringify(r.fields))}::jsonb,'candidate_id',${r.candidateId??'null'},'revision',${q(r.revision)}::bigint)::text,true);`;
 for(const mismatch of ['missing-allocation','code','operation','allocation-request','missing-audit','unconsumed','changed-target'] as const)caseTest(`direct SQL requisition receipt rejects ${mismatch}`,()=>{
  const r=request('requisition',null,{requisition_title:marker,owner_company_id:company});intent({operation:'Rollback-only authenticated requisition forgery probe',operationId:r.operation,mismatch});
  const allocation=mismatch==='missing-allocation'?`jsonb_build_object('id',1,'generated_reference_number',${q(marker+'manual')})`:`public.allocate_numbering_reference(${q(mismatch==='operation'?randomUUID():r.operation)}::uuid,null,'HR_JOB_REQUISITION',null,'reserved','hr_job_requisitions',null,${mismatch==='allocation-request'?q('Wrong consumer'):`'F06 requisition '||${hash(r)}`})`;
  const code=mismatch==='code'?q(marker+'manual'):`v_number->>'generated_reference_number'`;
  const body=`do $$declare v_number jsonb;v_id bigint;begin v_number:=${allocation};${context(r)}insert into public.hr_job_requisitions(requisition_code,requisition_title,owner_company_id,created_by,updated_by) values(${code},${q(marker)},${company},${actor},${actor});select id into v_id from public.hr_job_requisitions where requisition_code=${code};
   ${mismatch==='unconsumed'?'':`perform public.finish_numbering_reservation(${q(r.operation)}::uuid,'consumed','hr_job_requisitions',v_id,null);`}
   ${mismatch==='missing-audit'?'':`insert into public.audit_logs(actor_user_profile_id,owner_company_id,module_code,entity_name,entity_id,entity_reference,action,new_values) values(${actor},${company},'HR','hr_job_requisitions',v_id,${code},'create',jsonb_build_object('operation_id',${q(r.operation)}));`}
   ${mismatch==='changed-target'?`update public.hr_job_requisitions set requisition_title=${q(marker+' altered')} where id=v_id;`:''}end$$`;
  expect(()=>sql(probe(body))).toThrow(/matching reserved number|fact count is incomplete|consumed matching allocation|target facts changed/);untouched(r);
 },30_000);
 for(const field of ['notes','job_description','requirements','target_start_date','budgeted_salary_min','budgeted_salary_max'] as const)caseTest(`direct SQL cannot add omitted requisition ${field} to a numbered receipt`,async()=>{
  const r=request('requisition',null,{requisition_title:marker,owner_company_id:company});
  // Salary authority is deliberately present for these two probes: the existing
  // F03 BEFORE guard must not mask the separate reviewed-payload integrity check.
  const salaryGrant=field.startsWith('budgeted_salary_')?grant(payrollCodes):null;
  intent({operation:'Rollback-only authenticated extra business field omitted from requisition request',operationId:r.operation,field,salaryGrant});
  const value=field==='target_start_date'?'2026-11-01':field.startsWith('budgeted_salary_')?123:marker+' unreviewed';
  const body=`do $$declare v_number jsonb;v_id bigint;begin v_number:=public.allocate_numbering_reference(${q(r.operation)}::uuid,null,'HR_JOB_REQUISITION',null,'reserved','hr_job_requisitions',null,'F06 requisition '||${hash(r)});${context(r)}
   insert into public.hr_job_requisitions(requisition_code,requisition_title,owner_company_id,${field},created_by,updated_by) values(v_number->>'generated_reference_number',${q(marker)},${company},${q(value)},${actor},${actor});
   select id into v_id from public.hr_job_requisitions where requisition_code=v_number->>'generated_reference_number';
   perform public.finish_numbering_reservation(${q(r.operation)}::uuid,'consumed','hr_job_requisitions',v_id,null);
   insert into public.audit_logs(actor_user_profile_id,owner_company_id,module_code,entity_name,entity_id,entity_reference,action,new_values) values(${actor},${company},'HR','hr_job_requisitions',v_id,v_number->>'generated_reference_number','create',jsonb_build_object('operation_id',${q(r.operation)}));end$$`;
  try{
   expect(()=>sql(probe(body))).toThrow(/Requisition does not match authorized payload/);untouched(r);
   const reviewed=request('requisition',null,{...r.fields,[field]:value}),accepted=await rpc(reviewed);
   expect(accepted.error).toBeNull();expect(counts(reviewed)).toEqual({receipts:1,numbers:1,audits:3});
   expect(JSON.parse(sql(`select to_jsonb(${field}) from public.hr_job_requisitions where id=${accepted.data.id}`))).toBe(value);
  }finally{if(salaryGrant!==null)setGrant(salaryGrant,false);}
 },30_000);
 for(const updateOld of [false,true])caseTest(`direct SQL cannot convert an existing employee${updateOld?' by changing its xmin':''}`,()=>{
  const c=candidate(),old=put('employees',{employee_code:marker+'OLD'+owned.length,full_name_en:marker,gender:'male',date_of_birth:'1990-01-01',mobile_number:'000',owner_company_id:company,joining_date:'2026-10-04',employee_status:'active',emergency_contact_name:'Synthetic contact',emergency_contact_mobile:'0000000000',created_by:actor,updated_by:actor}),r=request('conversion',c);
  intent({operation:'Rollback-only existing employee conversion receipt forgery probe',operationId:r.operation,employeeId:old,updateOld});
  const body=`do $$declare v_number jsonb;begin v_number:=public.allocate_numbering_reference(${q(r.operation)}::uuid,null,'HR_EMPLOYEE',null,'reserved','employees',null,'F06 candidate conversion '||${hash(r)});${context(r)}${updateOld?`update public.employees set updated_by=${actor} where id=${old};`:''}insert into public.employee_recruitment_links(employee_id,candidate_id,converted_by,created_by) values(${old},${c},${actor},${actor});end$$`;
  expect(()=>sql(probe(body))).toThrow(/authoritative INSERT proof/);untouched(r);expect(sql(`select count(*) from public.employee_recruitment_links where candidate_id=${c}`)).toBe('0');
 },30_000);
 for(const omitted of ['candidate-update','onboarding-update','audit'] as const)caseTest(`direct SQL conversion cannot omit ${omitted} completion`,()=>{
  const c=candidate(),task=put('hr_onboarding_tasks',{candidate_id:c,task_title:marker}),r=request('conversion',c);intent({operation:'Rollback-only complete target but incomplete conversion proof',operationId:r.operation,omitted,task});
  const body=`do $$declare v_number jsonb;v_employee bigint;v_link bigint;v_revision bigint;begin v_number:=public.allocate_numbering_reference(${q(r.operation)}::uuid,null,'HR_EMPLOYEE',null,'reserved','employees',null,'F06 candidate conversion '||${hash(r)});${context(r)}
   insert into public.employees(employee_code,full_name_en,full_name_ar,gender,nationality_id,date_of_birth,mobile_number,personal_email,owner_company_id,joining_date,employee_status,emergency_contact_name,emergency_contact_mobile,created_by,updated_by)
   select v_number->>'generated_reference_number',full_name_en,full_name_ar,coalesce(gender,'male'),nationality_id,coalesce(date_of_birth,'2026-10-04'::date),coalesce(mobile_number,''),email,${company},'2026-10-04','active','Synthetic contact','0000000000',${actor},${actor} from public.hr_candidates where id=${c};
   select id into v_employee from public.employees where employee_code=v_number->>'generated_reference_number';
   insert into public.employee_status_events(employee_id,old_status,new_status,reason,effective_date,created_by) select v_employee,null,'active','Converted from candidate '||coalesce(candidate_code,''),'2026-10-04',${actor} from public.hr_candidates where id=${c};
   ${omitted==='candidate-update'?'':`update public.hr_candidates set candidate_status='hired',pipeline_stage='hired',updated_by=${actor} where id=${c};`}select workspace_revision into v_revision from public.hr_candidates where id=${c};
   ${omitted==='onboarding-update'?'':`update public.hr_onboarding_tasks set employee_id=v_employee,updated_by=${actor} where id=${task};`}
   insert into public.employee_recruitment_links(employee_id,candidate_id,converted_by,created_by) values(v_employee,${c},${actor},${actor}) returning id into v_link;
   ${omitted==='audit'?'':`insert into public.audit_logs(actor_user_profile_id,owner_company_id,module_code,entity_name,entity_id,entity_reference,action,new_values) values
    (${actor},${company},'HR','employees',v_employee,v_number->>'generated_reference_number','create',jsonb_build_object('operation_id',${q(r.operation)},'candidate_id',${c},'source','candidate_conversion')),
    (${actor},${company},'HR','employee_recruitment_links',v_link,v_number->>'generated_reference_number','create',jsonb_build_object('operation_id',${q(r.operation)},'candidate_id',${c},'employee_id',v_employee)),
    (${actor},${company},'HR','hr_candidates',${c},(select candidate_code from public.hr_candidates where id=${c}),'update',jsonb_build_object('operation_id',${q(r.operation)},'candidate_status','hired','pipeline_stage','hired','revision',v_revision::text));`}
   perform public.finish_numbering_reservation(${q(r.operation)}::uuid,'consumed','employees',v_employee,null);end$$`;
  expect(()=>sql(probe(body))).toThrow(/completion.*(?:unavailable|incomplete)/);untouched(r);expect(sql(`select workspace_revision||':'||candidate_status from public.hr_candidates where id=${c}`)).toBe('1:selected');expect(sql(`select employee_id is null from public.hr_onboarding_tasks where id=${task}`)).toBe('t');
 },30_000);
 caseTest('private receipt and proof tables are not caller-writable',()=>{for(const table of ['recruitment_consumer_receipts','recruitment_consumer_proofs','recruitment_consumer_facts'])expect(()=>sql(probe(`delete from erp_private.${table} where false`))).toThrow(/permission denied/);});

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
 async function hold(rowId:number,table:'hr_candidates'='hr_candidates'){
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
 async function lateAuthority(revoke:boolean,replay:boolean){
  assertRunning();const c=candidate(),r=request('conversion',c);if(replay)expect((await rpc(r)).error).toBeNull();const before=counts(r);
  let holder:Holder|undefined,witness:Witness|undefined,pending:PromiseLike<unknown>|undefined,dispatched=false,ended=false;
  const abort=new AbortController();
  try{
   assertRunning();holder=await hold(c);assertRunning();
   note('wait-rpc-dispatch',{operation:r.operation,rpc:'convert_candidate_to_employee_atomic',holder:{pid:holder.pid,backendStart:holder.backendStart,name:holder.name}});
   dispatched=true;const response=Promise.resolve(client.rpc('convert_candidate_to_employee_atomic',{p_candidate:c,p_operation:r.operation,p_revision:r.revision,p_data:r.fields}).abortSignal(abort.signal));pending=response;
   witness=await observeWait(holder,'convert_candidate_to_employee_atomic');
   if(revoke)setGrant(hrGrant,false);
   retainedWait(holder,witness);note('wait-retained-after-authority',{operation:r.operation,revoke,witness});
   await release(holder);const result=await response;
   await transactionEnded(witness,r.operation);ended=true;
   if(revoke){expect(result.error?.code).toBe('42501');expect(counts(r)).toEqual(before);}
   else{expect(result.error).toBeNull();expect(result.data.replayed).toBe(replay);operations.find(op=>op.operation===r.operation)!.result=result.data;record('employees',result.data.employee_id);record('employee_recruitment_links',result.data.link_id);record('global_numbering_generated_references',result.data.reference_id);}
  }finally{
   try{if(holder)await release(holder);}
   finally{
    abort.abort();if(pending)await Promise.resolve(pending).catch(()=>undefined);
    if(dispatched&&!ended){
     if(!witness){unresolved('Dispatched RPC has no exact transaction witness');throw Error('Grant restoration withheld: RPC witness missing');}
     try{await transactionEnded(witness,r.operation);ended=true;}catch(error){unresolved('Contender transaction end unproven');throw error;}
    }
    if(!stopped&&!cleanupBegun&&!cleanupUnresolved)setGrant(hrGrant,true);
    else note('grant-restoration-withheld',{grant:hrGrant,operation:r.operation,ended,stopped,cleanupBegun});
   }
  }
 }
 caseTest('candidate lock wait positive control commits once',()=>lateAuthority(false,false),45_000);
 caseTest('authority revoked during candidate wait rolls back all effects',()=>lateAuthority(true,false),45_000);
 caseTest('replay lock wait rejects revoked authority without changing prior history',()=>lateAuthority(true,true),45_000);
 caseTest('replay wait positive control returns exact committed result',()=>lateAuthority(false,true),45_000);
 afterAll(async()=>{
  if(!ledger)return;const authCleanup=await admitCleanup();const failures:string[]=[];const cleanup=(fn:()=>void)=>{note('cleanup-step-intent');try{fn();note('cleanup-step-finished');}catch{failures.push('Exact recruitment fixture cleanup failed; inspect private manifest.');note('cleanup-step-failed');}};
  try{
   for(const holder of [...holders])try{await release(holder);}catch{failures.push('Exact recruitment holder cleanup failed.');}
   for(const fault of faults)cleanup(()=>cleanupSql(`drop trigger if exists ${fault} on public.audit_logs;drop function if exists erp_private.${fault}()`));
   for(const r of operations)cleanup(()=>{const receipts=JSON.parse(cleanupSql(`select coalesce(jsonb_agg(result),'[]') from erp_private.recruitment_consumer_receipts where actor=(select auth_user_id from public.user_profiles where id=${actor}) and operation_id=${q(r.operation)}`));if(receipts.length){expect(receipts).toHaveLength(1);r.result=receipts[0];const result=receipts[0];if(r.kind==='requisition')record('hr_job_requisitions',result.id);else{record('employees',result.employee_id);record('employee_recruitment_links',result.link_id);}record('global_numbering_generated_references',result.reference_id);}for(const id of JSON.parse(cleanupSql(`select coalesce(json_agg(id),'[]') from public.audit_logs where actor_user_profile_id=${actor} and new_values->>'operation_id'=${q(r.operation)}`)))record('audit_logs',id);});
   for(const row of owned.filter(row=>row.table==='employees'))cleanup(()=>{for(const id of JSON.parse(cleanupSql(`select coalesce(json_agg(id),'[]') from public.employee_status_events where employee_id=${row.id}`)))record('employee_status_events',id);});
   for(const table of ['hr_onboarding_tasks','hr_offers','hr_candidates','employees','hr_job_requisitions'])for(const row of owned.filter(row=>row.table===table))cleanup(()=>{intent({operation:'Soft retire exact synthetic recruitment row; retain links/events/numbers/audit/receipts',table,id:row.id});cleanupSql(`update public.${table} set deleted_at=coalesce(deleted_at,clock_timestamp()) where id=${row.id}`);});
   for(const row of owned.filter(row=>['user_roles','roles','global_numbering_rules'].includes(row.table)))cleanup(()=>cleanupSql(`update public.${row.table} set is_active=false where id=${row.id}`));
   for(const row of owned.filter(row=>row.table==='owner_companies'))cleanup(()=>cleanupSql(`update public.owner_companies set status='inactive' where id=${row.id}`));
  }finally{
   // Only definitions created by this run are owned here. A canonical code is
   // not authority to deactivate a pre-existing active definition.
   for(const row of owned.filter(row=>row.table==='permissions'))cleanup(()=>{intent({table:'permissions',id:row.id,permissionName:marker,operation:'Retire exact newly-created synthetic permission definition'});expect(cleanupSql(`update public.permissions set is_active=false where id=${row.id} and permission_name=${q(marker)} returning id`)).toBe(String(row.id));expect(cleanupSql(`select count(*) from public.permissions where id=${row.id} and permission_name=${q(marker)} and is_active=false`)).toBe('1');});
   for(const row of borrowed)cleanup(()=>{cleanupSql(`update public.${row.table} set is_active=${row.originalActive} where id=${row.id}`);expect(cleanupSql(`select is_active from public.${row.table} where id=${row.id}`)).toBe(row.originalActive?'t':'f');});
   const result={marker,actor,owned,borrowed,rolePermissions,operations,sessions,holders:holderManifest,faults,authCleanup,cleanupFailures:failures,retainedHistory:true,productionWrites:0,providerCalls:0};
   note('cleanup-finished',{cleanupFailures:failures,cleanupVerified:failures.length===0,fullNativeAcceptance:false});writeResult({...result,cleanupVerified:failures.length===0,fullNativeAcceptance:false});
   if(journal!==undefined){fs.closeSync(journal);journal=undefined;}expect(failures).toEqual([]);
  }
 },120_000);
});
