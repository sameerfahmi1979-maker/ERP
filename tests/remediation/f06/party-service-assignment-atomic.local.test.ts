import {nativeApiOrigin} from './native-api-origin.mjs';
// Main-only opted-in Auth/RPC tests. Every fixture, request, fault and holder is
// tagged in the existing isolated private ledger before any corresponding write.
import {afterAll,beforeAll as rawBeforeAll,describe,expect,it as rawIt} from 'vitest';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {spawn,spawnSync,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {guard,runtime} from './local-db.mjs';

describe.skipIf(process.env.ALGT_F06_SERVICE_ASSIGNMENT_TESTS!=='1')('atomic shared-party service assignments',()=>{
 const marker='FSA'+Date.now().toString(36).toUpperCase();
 type Ledger={actors:Record<string,{email:string;password:string;profileId:number}>;rows:object[];intents:object[]};
 let ledger:Ledger,client:SupabaseClient,pinned:string,claims:string,actor:number,role:number,globalGrant:number,adminRole:number,adminGrant:number|undefined;
 let nature:number,status:number,country:number,category:number,otherCategory:number,inactiveCategory:number;
 const owned:{table:string;id:number}[]=[],borrowed:number[]=[];
 const faults=new Set<string>();
 type Holder={child:ChildProcessWithoutNullStreams;name:string;pid:number|null;backendStart:string|null};const holders=new Set<Holder>();
 const q=(value:unknown)=>value===null?'null':typeof value==='number'||typeof value==='boolean'?String(value):"'"+String(value).replaceAll("'","''")+"'";
 const persist=()=>fs.writeFileSync(path.join(runtime,'fixtures-private.json'),JSON.stringify(ledger,null,2));

 type RpcResult=Awaited<ReturnType<SupabaseClient['rpc']>>;
 type Worker={pid:number;database:number;backend_start:string;query_start:string;xact_start:string;query_hash:string};
 type RequestRun={operation:string;promise:Promise<RpcResult>;settled:boolean;responseComplete:boolean;worker?:Worker};
 const requests:RequestRun[]=[],bodies=new Set<object>();let admissionClosed=false,cleanupBegun=false,authSignInUncertain=false,authSignOutUncertain=false,sqlUncertain=false,bodyDeadlineAt=0,sessionId:string|undefined;
 // BEGIN W38 OFFLINE-VERIFIED REGISTRATION
 // Suite hooks have zero arguments; tests destructure the real TestContext.
 // These are genuine callbacks, not rest-argument proxies or altered toString.
 const beforeAll=(run:()=>Promise<unknown>,timeout?:number)=>rawBeforeAll(async()=>ownBody(run),timeout);
 const it=(name:string,run:()=>unknown|Promise<unknown>,timeout?:number)=>rawIt(name,async({signal})=>ownBody(async()=>run(),signal),timeout);
 // END W38 OFFLINE-VERIFIED REGISTRATION
 function assertRunning(){if(bodyDeadlineAt&&Date.now()>=bodyDeadlineAt)admissionClosed=true;if(admissionClosed||cleanupBegun||sqlUncertain)throw Error('Owned lifecycle stopped; new effects forbidden');}
 function cleanupSql(input:string){
  if(sqlUncertain)throw Error('Prior SQL process unresolved; no further database work admitted');
  const result=spawnSync('docker',['exec','-i','-e','PGPASSWORD=postgres',pinned,'psql','-X','-qAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],{input:"set statement_timeout='2s';set lock_timeout='500ms';"+input,encoding:'utf8',windowsHide:true,timeout:4000,maxBuffer:32*1024*1024});
  if(result.error||result.status===null){sqlUncertain=true;admissionClosed=true;throw Error('Owned SQL process outcome unknown');}
  // psql ON_ERROR_STOP=1 uses status 3 for a server SQL error. Docker/psql
  // connection/transport exits (including 1/2/125) do not prove completion.
  if(result.status!==0){if(result.status!==3){sqlUncertain=true;admissionClosed=true;}throw Error('Owned bounded SQL rejected or transport outcome unknown');}return result.stdout.trim();
 }
 const sql=(input:string)=>{assertRunning();return cleanupSql(input);};
 const deadline=async<T,>(promise:Promise<T>,ms:number):Promise<T>=>{let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([promise,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Owned request deadline exceeded')),ms);})]);}finally{if(timer)clearTimeout(timer);}};
 async function ownBody<T>(run:()=>Promise<T>,signal?:AbortSignal):Promise<T>{
  if(admissionClosed||cleanupBegun||bodies.size)throw Error('Prior full body unresolved; main reconciliation required');
  if(requests.some(entry=>!complete(entry))){admissionClosed=true;throw Error('Previous RPC transaction unresolved; no next case admission');}
  const token={expired:false};bodies.add(token);bodyDeadlineAt=Date.now()+25000;const stop=()=>{token.expired=true;admissionClosed=true;};
  const timer=setTimeout(stop,25000);signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();
  try{assertRunning();const result=await run();assertRunning();if(token.expired)throw Error('Full-body watchdog expired');return result;}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',stop);bodies.delete(token);bodyDeadlineAt=0;}
 }
 function beginRpc(args:Record<string,unknown>):RequestRun{
  assertRunning();return beginRequest(String(args.p_operation),client.rpc('save_party_service_assignment',args));
 }
 function beginRequest(operation:string,request:PromiseLike<RpcResult>):RequestRun{
  assertRunning();const entry:RequestRun={operation,promise:null!,settled:false,responseComplete:false};
  requests.push(entry);
  entry.promise=Promise.resolve(request).then(result=>{entry.settled=true;entry.responseComplete=result.status>=200&&result.status<500;if(!entry.responseComplete)admissionClosed=true;return result;},error=>{entry.settled=true;admissionClosed=true;throw error;});
  // Attach a rejection observer immediately while SQL waits are inspected.
  void entry.promise.catch(()=>undefined);
  return entry;
 }
 function captureWorker(entry:RequestRun,holderPid:number|null){
  if(holderPid===null)throw Error('Owned holder PID missing');
  const found:Worker[]=JSON.parse(sql(`select coalesce(json_agg(json_build_object('pid',pid,'database',datid,'backend_start',backend_start::text,'query_start',query_start::text,'xact_start',xact_start::text,'query_hash',md5(query))),'[]') from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and wait_event_type='Lock' and ${holderPid}=any(pg_blocking_pids(pid)) and query like '%save_party_service_assignment%'`));
  if(found.length!==1)return false;
  const worker={...found[0],pid:Number(found[0].pid),database:Number(found[0].database)};
  if(!Number.isSafeInteger(worker.pid)||worker.pid<1||!Number.isSafeInteger(worker.database)||worker.database<1||![worker.backend_start,worker.query_start,worker.xact_start].every(value=>typeof value==='string'&&Number.isFinite(Date.parse(value)))||!/^[a-f0-9]{32}$/.test(worker.query_hash))throw Error('Invalid exact RPC transaction identity');
  if(entry.worker&&(entry.worker.pid!==worker.pid||entry.worker.backend_start!==worker.backend_start||entry.worker.xact_start!==worker.xact_start))throw Error('RPC worker identity changed');
  if(!entry.worker){entry.worker=worker;ledger.rows.push({marker,operationId:entry.operation,rpcWorker:worker});persist();}
  return true;
 }
 const workerPredicate=(worker:Worker)=>`datname=current_database() and datid=${worker.database} and pid=${worker.pid} and backend_start=${q(worker.backend_start)}::timestamptz and (xact_start=${q(worker.xact_start)}::timestamptz or (state<>'idle' and query_start=${q(worker.query_start)}::timestamptz and md5(query)=${q(worker.query_hash)}))`;
 function complete(entry:RequestRun){
  // HTTP transport cancellation is not completion proof. A known backend must
  // end the exact transaction; unknown workers require an actual server response.
  const databaseDone=entry.worker?cleanupSql(`select count(*) from pg_stat_activity where ${workerPredicate(entry.worker)}`)==='0':entry.responseComplete;
  return entry.settled&&databaseDone;
 }
 async function drainRequests(){
  for(const entry of requests){
   if(complete(entry))continue;
   try{await waitFor(()=>complete(entry),'actual RPC database completion');}
   catch{
    // Terminate only the captured exact transaction, never a guessed pool PID.
    if(entry.worker)cleanupSql(`select pg_terminate_backend(pid) from pg_stat_activity where ${workerPredicate(entry.worker)}`);
    try{await waitFor(()=>complete(entry),'exact RPC transaction termination');}
    catch{admissionClosed=true;throw Error('Unknown or active RPC worker; preserve fixtures and grants for main reconciliation');}
   }
  }
 }
 const tracked=(table:string,id:number)=>ledger.rows.some(row=>{const r=row as {table?:string;id?:number};return r.table===table&&r.id===id;});
 const record=(table:string,id:number)=>{if(!owned.some(row=>row.table===table&&row.id===id)){owned.push({table,id});ledger.rows.push({marker,table,id});persist();}return id;};
 const intent=(value:object)=>{ledger.intents.push({marker,...value});persist();};
 function put(table:string,values:Record<string,unknown>){intent({table,values,operation:'Insert exact synthetic service-assignment fixture'});return record(table,Number(sql(`insert into public.${table}(${Object.keys(values).join(',')}) values(${Object.values(values).map(q).join(',')}) returning id`)));}
 function assign(roleId:number,company:number|null=null){return put('user_roles',{user_profile_id:actor,role_id:roleId,owner_company_id:company,branch_id:null,is_active:true});}
 function setGrant(id:number,active:boolean){expect(tracked('user_roles',id)).toBe(true);intent({table:'user_roles',id,operation:'Set exact tracked local grant',is_active:active});expect(sql(`update public.user_roles set is_active=${active} where id=${id} and user_profile_id=${actor} returning id`)).toBe(String(id));}
 function makeRole(suffix:string,codes:string[]){const id=put('roles',{role_code:marker+suffix,role_name:marker,is_active:true});for(const code of codes){const permission=Number(sql(`select id from public.permissions where permission_code=${q(code)} and is_active`));expect(permission).toBeGreaterThan(0);intent({table:'role_permissions',role_id:id,permission_id:permission});sql(`insert into public.role_permissions(role_id,permission_id)values(${id},${permission})`);ledger.rows.push({marker,table:'role_permissions',role_id:id,permission_id:permission});persist();}return id;}
 beforeAll(async()=>{
  pinned=guard();const keys=JSON.parse(fs.readFileSync(path.join(runtime,'keys-private.json'),'utf8'));expect(keys.API_URL).toBe(nativeApiOrigin);
  ledger=JSON.parse(fs.readFileSync(path.join(runtime,'fixtures-private.json'),'utf8'));actor=ledger.actors.none.profileId;
  intent({operation:'Bounded service assignment atomic and late-authority acceptance. Exact synthetic rows/grants, single local Auth session; retain assignment/audit/receipt history. No production/provider/mail.'});
  expect(sql(`select count(*) from public.user_roles where user_profile_id=${actor} and is_active`)).toBe('0');
  for(const code of ['master_data.parties.manage_services','master_data.parties.view']){
   const found=JSON.parse(sql(`select coalesce(json_agg(json_build_object('id',id,'active',is_active)),'[]') from public.permissions where permission_code=${q(code)}`));
   if(!found.length)put('permissions',{permission_code:code,permission_name:marker,module_code:'MASTER_DATA',action_code:code.split('.').at(-1),is_active:true});
   else if(!found[0].active){const id=Number(found[0].id);expect(tracked('permissions',id),'Borrow only a tracked inactive local definition').toBe(true);borrowed.push(id);intent({table:'permissions',id,operation:'Activate exact tracked permission; restore false in finally'});sql(`update public.permissions set is_active=true where id=${id}`);}
  }
  role=makeRole('_MANAGER',['master_data.parties.manage_services','master_data.parties.view']);globalGrant=assign(role);
  adminRole=Number(sql("select id from public.roles where role_code='system_admin' and is_active"));expect(adminRole).toBeGreaterThan(0);
  const prior=JSON.parse(sql(`select coalesce(json_agg(json_build_object('id',id,'active',is_active)),'[]') from public.user_roles where user_profile_id=${actor} and role_id=${adminRole} and owner_company_id is null and branch_id is null`));expect(prior.length).toBeLessThanOrEqual(1);
  if(prior.length){expect(prior[0].active).toBe(false);expect(tracked('user_roles',Number(prior[0].id))).toBe(true);adminGrant=Number(prior[0].id);intent({table:'user_roles',id:adminGrant,operation:'Borrow exact inactive admin assignment; restore false'});}
  else adminGrant=put('user_roles',{user_profile_id:actor,role_id:adminRole,owner_company_id:null,branch_id:null,is_active:false});
  nature=put('party_natures',{nature_code:marker,name_en:marker,is_active:true});status=put('party_statuses',{status_code:marker,name_en:marker,is_active:true});
  const code=sql("select chr(90-n/26)||chr(90-n%26) from generate_series(0,675)n where not exists(select 1 from public.countries where country_code=chr(90-n/26)||chr(90-n%26) or iso3_code='Q'||chr(90-n/26)||chr(90-n%26)) order by n limit 1");expect(code).toMatch(/^[A-Z]{2}$/);
  country=put('countries',{country_code:code,iso3_code:'Q'+code,name_en:marker,nationality_en:'Synthetic',is_active:true});
  category=put('party_service_categories_master',{category_code:marker+'A',category_name_en:marker,is_active:true});
  otherCategory=put('party_service_categories_master',{category_code:marker+'B',category_name_en:marker,is_active:true});
  inactiveCategory=put('party_service_categories_master',{category_code:marker+'I',category_name_en:marker,is_active:false});
  const boundedFetch:typeof fetch=(input,init)=>fetch(input,{...init,signal:AbortSignal.any([...(init?.signal?[init.signal]:[]),AbortSignal.timeout(12000)])});
  client=createClient(keys.API_URL,keys.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:boundedFetch}});
  assertRunning();authSignInUncertain=true;const login=await deadline(client.auth.signInWithPassword({email:ledger.actors.none.email,password:ledger.actors.none.password}),12000);expect(login.error).toBeNull();
  const decoded=JSON.parse(Buffer.from(login.data.session!.access_token.split('.')[1],'base64url').toString('utf8'));
  sessionId=decoded.session_id;expect(sessionId).toMatch(/^[0-9a-f-]{36}$/i);
  claims=JSON.stringify({sub:decoded.sub,session_id:decoded.session_id,role:'authenticated',aal:decoded.aal});ledger.rows.push({marker,table:'auth.sessions',id:decoded.session_id,operation:'Exact local session; local sign-out in finally'});persist();
  authSignInUncertain=false;
 },30_000);
 function party(locked=false){return put('parties',{party_code:marker+'_'+owned.length,display_name:marker,legal_name_en:'Synthetic service party',party_nature_id:nature,country_id:country,party_status_id:status,is_active:true,is_locked:locked});}
 function args(partyId:number,fields:object={service_category_id:category,is_primary:false,remarks:null}){const operation=randomUUID();intent({operation:'Exact add request',operationId:operation,partyId,fields});return {p_operation:operation,p_action:'add',p_party:partyId,p_id:null as number|null,p_revision:null as string|null,p_data:fields};}
 type Args=ReturnType<typeof args>;
 function retire(partyId:number,id:number,revision='1'):Args{const request={p_operation:randomUUID(),p_action:'remove',p_party:partyId,p_id:id,p_revision:revision,p_data:{}};intent({operation:'Exact soft-retirement request',operationId:request.p_operation,partyId,id,revision});return request;}
 async function rpc(request:Args){const result=await deadline(beginRpc(request).promise,12000);if(result.data?.id)record('party_service_category_assignments',Number(result.data.id));return result;}
 const rows=(partyId:number)=>JSON.parse(sql(`select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]'::jsonb) from public.party_service_category_assignments a where party_id=${partyId}`));
 const auditCount=(id:number)=>Number(sql(`select count(*) from public.audit_logs where entity_name='party_service_category_assignments' and entity_id=${id}`));
 function untouched(request:Args){expect(sql(`select count(*) from erp_private.master_lifecycle_receipts where operation_id=${q(request.p_operation)}`)).toBe('0');expect(sql(`select count(*) from public.audit_logs where new_values->>'operation_id'=${q(request.p_operation)}`)).toBe('0');}
 it('adds false/null once, replays exactly and makes an identical new operation a no-op',async()=>{const p=party(),request=args(p);const first=await rpc(request);expect(first.error).toBeNull();expect(first.data).toMatchObject({party_id:p,service_category_id:category,revision:'1',is_active:true,changed:true,replayed:false});expect((await rpc(request)).data).toMatchObject({...first.data,replayed:true});expect((await rpc(args(p))).data).toMatchObject({id:first.data.id,revision:'1',changed:false});expect(rows(p)).toHaveLength(1);expect(rows(p)[0]).toMatchObject({is_primary:false,remarks:null});expect(auditCount(first.data.id)).toBe(1);});
 it('retains soft-retirement history, replay/no-op and a later distinct reassignment',async()=>{const p=party(),created=await rpc(args(p));expect(created.error).toBeNull();const request=retire(p,created.data.id),removed=await rpc(request);expect(removed.data).toMatchObject({id:created.data.id,is_active:false,revision:'2',changed:true});expect((await rpc(request)).data).toMatchObject({replayed:true,is_active:false});expect((await rpc(retire(p,created.data.id,'2'))).data).toMatchObject({changed:false,revision:'2'});expect(auditCount(created.data.id)).toBe(2);const next=await rpc(args(p));expect(next.error).toBeNull();expect(next.data.id).not.toBe(created.data.id);expect(rows(p)).toHaveLength(2);});
 it('does not overwrite a duplicate active category with different remarks',async()=>{const p=party();expect((await rpc(args(p))).error).toBeNull();const request=args(p,{service_category_id:category,is_primary:false,remarks:'Different'}),before=rows(p);expect((await rpc(request)).error?.code).toBe('23505');expect(rows(p)).toEqual(before);untouched(request);});
 it('does not silently reassign the primary category',async()=>{const p=party(),first=await rpc(args(p,{service_category_id:category,is_primary:true}));expect(first.error).toBeNull();const request=args(p,{service_category_id:otherCategory,is_primary:true});expect((await rpc(request)).error?.code).toBe('23505');expect(rows(p)).toHaveLength(1);expect(rows(p)[0].is_primary).toBe(true);untouched(request);});
 it('concurrent copies of one retained operation create one assignment, audit and receipt',async()=>{
  const p=party(),request=args(p);
  const results=await Promise.all([rpc(request),rpc({...request})]);
  expect(results.map(result=>result.error)).toEqual([null,null]);
  expect(new Set(results.map(result=>result.data.id)).size).toBe(1);
  expect(results.map(result=>result.data.replayed).sort()).toEqual([false,true]);
  for(const result of results)expect(result.data).toMatchObject({party_id:p,service_category_id:category,revision:'1',is_active:true,changed:true});
  const retained=rows(p);expect(retained).toHaveLength(1);expect(retained[0]).toMatchObject({id:results[0].data.id,is_active:true,is_primary:false,workspace_revision:1});
  expect(auditCount(retained[0].id)).toBe(1);
  expect(sql(`select count(*) from erp_private.master_lifecycle_receipts where operation_id=${q(request.p_operation)}`)).toBe('1');
 },30_000);
 it('concurrent distinct operations for the same category truthfully return one create and one no-op',async()=>{
  const p=party(),requests=[args(p),args(p)];
  const results=await Promise.all(requests.map(request=>rpc(request)));
  expect(results.map(result=>result.error)).toEqual([null,null]);
  expect(new Set(results.map(result=>result.data.id)).size).toBe(1);
  expect(results.map(result=>result.data.changed).sort()).toEqual([false,true]);
  for(const result of results)expect(result.data).toMatchObject({party_id:p,service_category_id:category,revision:'1',is_active:true,replayed:false});
  const retained=rows(p);expect(retained).toHaveLength(1);expect(retained[0].workspace_revision).toBe(1);expect(auditCount(retained[0].id)).toBe(1);
  const receipts=JSON.parse(sql(`select jsonb_agg(result) from erp_private.master_lifecycle_receipts where operation_id in (${requests.map(request=>q(request.p_operation)).join(',')})`));
  expect(receipts).toHaveLength(2);expect(receipts.map((receipt:{changed:boolean})=>receipt.changed).sort()).toEqual([false,true]);
 },30_000);
 it('concurrent primary adds for distinct categories yield one winner and one conflict without reassignment',async()=>{
  const p=party(),requests=[args(p,{service_category_id:category,is_primary:true}),args(p,{service_category_id:otherCategory,is_primary:true})];
  const results=await Promise.all(requests.map(request=>rpc(request)));
  const winner=results.findIndex(result=>result.error===null),loser=results.findIndex(result=>result.error!==null);
  expect(winner).toBeGreaterThanOrEqual(0);expect(loser).toBeGreaterThanOrEqual(0);expect(results.filter(result=>result.error===null)).toHaveLength(1);
  expect(results[loser].error?.code).toBe('23505');untouched(requests[loser]);
  const retained=rows(p);expect(retained).toHaveLength(1);
  expect(retained[0]).toMatchObject({id:results[winner].data.id,service_category_id:winner===0?category:otherCategory,is_active:true,is_primary:true,workspace_revision:1});
  expect(results[winner].data).toMatchObject({service_category_id:retained[0].service_category_id,changed:true,replayed:false,revision:'1'});
  expect(auditCount(retained[0].id)).toBe(1);
  expect(sql(`select count(*) from erp_private.master_lifecycle_receipts where operation_id in (${requests.map(request=>q(request.p_operation)).join(',')})`)).toBe('1');
 },30_000);
 it('rejects operation reuse with different exact inputs',async()=>{const request=args(party());expect((await rpc(request)).error).toBeNull();expect((await rpc({...request,p_data:{...request.p_data,remarks:'Changed'}})).error?.code).toBe('22023');});
 it('stale removal preserves the competing update',async()=>{const p=party(),created=await rpc(args(p));intent({table:'party_service_category_assignments',id:created.data.id,operation:'Exact trusted competing edit for stale revision proof'});sql(`update public.party_service_category_assignments set remarks='Competing edit' where id=${created.data.id}`);const request=retire(p,created.data.id),before=rows(p);expect((await rpc(request)).error?.code).toBe('PT409');expect(rows(p)).toEqual(before);untouched(request);});
 it('missing and mismatched-parent removals cannot invent success',async()=>{const p=party(),other=party(),created=await rpc(args(p));for(const request of [retire(p,Number.MAX_SAFE_INTEGER),retire(other,created.data.id)]){expect((await rpc(request)).error?.code).toBe('PT404');untouched(request);}expect(rows(p)[0].is_active).toBe(true);});
 it('rejects protected fields, coercion, null booleans and oversized remarks',async()=>{const p=party();for(const fields of [{service_category_id:category,is_active:false},{service_category_id:category,is_primary:'false'},{service_category_id:category,is_primary:null},{service_category_id:0},{service_category_id:1.5},{service_category_id:category,remarks:'x'.repeat(4001)}]){const request=args(p,fields);expect((await rpc(request)).error).not.toBeNull();untouched(request);}expect(rows(p)).toEqual([]);});
 it('rejects malformed create/remove identities and revision contracts',async()=>{const p=party();for(const patch of [{p_party:0},{p_id:0},{p_revision:'1'},{p_action:'other'},{p_action:'remove',p_id:1,p_revision:null},{p_action:'remove',p_id:1,p_revision:'1',p_data:{remarks:'Hidden'}}]){const request={...args(p),...patch};expect((await rpc(request)).error?.code).toBe('22023');untouched(request);}expect(rows(p)).toEqual([]);});
 it('refuses an inactive category or parent without a write',async()=>{const p=party(),inactive=args(p,{service_category_id:inactiveCategory});expect((await rpc(inactive)).error?.code).toBe('23503');untouched(inactive);intent({table:'parties',id:p,operation:'Retire exact synthetic parent'});sql(`update public.parties set is_active=false where id=${p}`);const request=args(p);expect((await rpc(request)).error?.code).toBe('23503');untouched(request);expect(rows(p)).toEqual([]);});
 it('allows explicit retirement on an inactive parent without reactivating it',async()=>{const p=party(),created=await rpc(args(p));intent({table:'parties',id:p,operation:'Retire exact synthetic parent before dependency cleanup'});sql(`update public.parties set is_active=false where id=${p}`);expect((await rpc(retire(p,created.data.id))).data).toMatchObject({is_active:false});expect(sql(`select is_active from public.parties where id=${p}`)).toBe('f');});
 it('fails closed with no role',async()=>{const request=args(party());try{setGrant(globalGrant,false);expect((await rpc(request)).error?.code).toBe('42501');untouched(request);}finally{await drainRequests();setGrant(globalGrant,true);}});
 it('does not widen scoped-only manage/view assignments',async()=>{const p=party(),company=put('owner_companies',{company_code:marker+'_SCOPE',legal_name_en:marker,status:'active'}),scoped=assign(role,company),request=args(p);try{setGrant(globalGrant,false);expect((await rpc(request)).error?.code).toBe('42501');untouched(request);}finally{await drainRequests();setGrant(scoped,false);setGrant(globalGrant,true);}});
 it('requires global view as well as manage services',async()=>{const roleId=makeRole('_MANAGE_ONLY',['master_data.parties.manage_services']),grant=assign(roleId),request=args(party());try{setGrant(globalGrant,false);expect((await rpc(request)).error?.code).toBe('42501');untouched(request);}finally{await drainRequests();setGrant(grant,false);setGrant(globalGrant,true);}});
 it('cannot mutate a locked parent without exact global system_admin',async()=>{const request=args(party(true));expect((await rpc(request)).error?.code).toBe('42501');untouched(request);});
 it('authenticated raw table writes cannot bypass the transaction',async()=>{const p=party(),created=await rpc(args(p));expect((await deadline(beginRequest(randomUUID(),client.from('party_service_category_assignments').insert({party_id:p,service_category_id:otherCategory})).promise,12000)).error).not.toBeNull();expect((await deadline(beginRequest(randomUUID(),client.from('party_service_category_assignments').update({remarks:'Bypass'}).eq('id',created.data.id)).promise,12000)).error).not.toBeNull();expect((await deadline(beginRequest(randomUUID(),client.from('party_service_category_assignments').delete().eq('id',created.data.id)).promise,12000)).error).not.toBeNull();expect(rows(p)).toHaveLength(1);expect(rows(p)[0].remarks).toBeNull();});
 it('late audit rejection rolls assignment and receipt back together',async()=>{const request=args(party()),fault='f06_service_fault_'+request.p_operation.replaceAll('-','');intent({operation:'Exact operation-only audit rejection; remove exact fault in finally',operationId:request.p_operation,function:'erp_private.'+fault,trigger:fault});faults.add(fault);try{sql(`create function erp_private.${fault}() returns trigger language plpgsql set search_path='' as $$begin if new.new_values->>'operation_id'=${q(request.p_operation)} then raise exception 'Synthetic service audit rejection' using errcode='P0001';end if;return new;end$$;create trigger ${fault} before insert on public.audit_logs for each row execute function erp_private.${fault}()`);expect((await rpc(request)).error?.code).toBe('P0001');expect(rows(request.p_party)).toEqual([]);untouched(request);}finally{await drainRequests();cleanupSql(`drop trigger if exists ${fault} on public.audit_logs;drop function if exists erp_private.${fault}()`);faults.delete(fault);}expect(sql(`select count(*) from pg_proc where proname=${q(fault)}`)).toBe('0');expect(sql(`select count(*) from pg_trigger where tgname=${q(fault)}`)).toBe('0');});

 const waitFor=async(test:()=>boolean,label:string)=>{const deadline=Date.now()+8_000;while(!test()){if(Date.now()>=deadline)throw Error('Timed out waiting for synthetic '+label);await new Promise(resolve=>setTimeout(resolve,80));}};
 async function hold(table:'party_service_category_assignments'|'party_service_categories_master',id:number){
  expect(owned.some(row=>row.table===table&&row.id===id)).toBe(true);const name=marker+'_LOCK_'+randomUUID().replaceAll('-','').slice(0,12);intent({table,id,applicationName:name,containerId:pinned,operation:'Exact synthetic row lock; rollback/terminate exact backend in finally'});
  assertRunning();const child=spawn('docker',['exec','-i','-e','PGPASSWORD=postgres',pinned,'psql','-X','-q','-A','-t','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],{windowsHide:true,timeout:25000});
  const holder:Holder={child,name,pid:null,backendStart:null};holders.add(holder);let output='',failure:Error|null=null;child.on('error',error=>{failure=error;});child.stdin.on('error',error=>{failure=error;});child.stdout.on('data',chunk=>{output+=String(chunk);const match=output.match(/HOLDER_ID:(\{[^\r\n]*\})/);if(match){const identity=JSON.parse(match[1]);holder.pid=identity.pid;holder.backendStart=identity.backend_start;}});child.stderr.on('data',()=>{});
  assertRunning();child.stdin.write(`begin;set local application_name=${q(name)};set local statement_timeout='8s';set local lock_timeout='6s';set local idle_in_transaction_session_timeout='15s';select 'HOLDER_ID:'||json_build_object('pid',pid,'backend_start',backend_start)::text from pg_stat_activity where pid=pg_backend_pid();select id from public.${table} where id=${id} for update;select 'LOCK_READY:'||pg_backend_pid();\n`);
  try{await waitFor(()=>{if(failure)throw failure;return /LOCK_READY:\d+/.test(output);},'service row holder');holder.pid=Number(output.match(/LOCK_READY:(\d+)/)![1]);ledger.rows.push({marker,backendPid:holder.pid,applicationName:name});persist();return holder;}catch(error){await release(holder);throw error;}
 }
 async function release(holder:Holder){if(!holders.has(holder))return;try{if(holder.child.exitCode===null&&!holder.child.stdin.destroyed)holder.child.stdin.end('rollback;\n\\q\n');await waitFor(()=>holder.child.exitCode!==null,'service row release');}finally{if(holder.pid===null||!holder.backendStart){admissionClosed=true;throw Error('Unknown holder identity; cleanup withheld');}const target=`datname=current_database() and application_name=${q(holder.name)} and pid=${holder.pid} and backend_start=${q(holder.backendStart)}::timestamptz`;cleanupSql(`select pg_terminate_backend(pid) from pg_stat_activity where ${target}`);await waitFor(()=>cleanupSql(`select count(*) from pg_stat_activity where ${target}`)==='0','exact blocker disappearance');holders.delete(holder);}}
 function snapshot(request:Args){return JSON.parse(sql(`select jsonb_build_object('assignments',(select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]'::jsonb) from public.party_service_category_assignments a where party_id=${request.p_party}),'audits',(select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]'::jsonb) from public.audit_logs a where new_values->>'operation_id'=${q(request.p_operation)}),'receipts',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from erp_private.master_lifecycle_receipts r where operation_id=${q(request.p_operation)}))`));}
 async function blocked(revoke:boolean,replay=false){
  const request=args(party(true));let holder:Holder|undefined;
  try{
   setGrant(adminGrant!,true);let id=category;
   if(replay){const first=await rpc(request);expect(first.error).toBeNull();id=first.data.id;}
   const before=snapshot(request);holder=await hold(replay?'party_service_category_assignments':'party_service_categories_master',id);
   const pending=beginRpc(request);const resultPromise=deadline(pending.promise,12000);void resultPromise.catch(()=>undefined);
   await waitFor(()=>captureWorker(pending,holder!.pid),'service RPC row wait');
   if(revoke){setGrant(adminGrant!,false);expect(sql(`begin;set local request.jwt.claims=${q(claims)};select erp_private.permission_in_scope('master_data.parties.manage_services',null,null) and erp_private.permission_in_scope('master_data.parties.view',null,null);rollback;`)).toBe('t');}
   await release(holder);const result=await resultPromise;
   if(revoke){expect(result.error?.code).toBe('42501');expect(snapshot(request)).toEqual(before);if(!replay)untouched(request);else{expect(before.audits).toHaveLength(1);expect(before.receipts).toHaveLength(1);}}
   else{expect(result.error).toBeNull();record('party_service_category_assignments',result.data.id);expect(result.data).toMatchObject({revision:'1',changed:true,replayed:replay});expect(snapshot(request).audits).toHaveLength(1);expect(snapshot(request).receipts).toHaveLength(1);}
  }finally{try{if(holder)await release(holder);}finally{await drainRequests();setGrant(adminGrant!,false);}}
 }
 it('category wait succeeds when locked-party admin authority remains current',()=>blocked(false),45_000);
 it('late system_admin-only revocation after category wait rolls everything back',()=>blocked(true),45_000);
 it('assignment-row replay wait rejects revoked system_admin without altering prior history',()=>blocked(true,true),45_000);
 it('assignment-row replay wait retains its positive current-authority control',()=>blocked(false,true),45_000);
 afterAll(async()=>{
  if(!ledger)return;cleanupBegun=true;const failures:string[]=[],checks:object[]=[];
  const resourcePath=path.join(runtime,`PARTY_SERVICE_ASSIGNMENT_RESOURCES_${marker}.json`);
  const receipt=(withheld:boolean)=>({marker,owned,borrowed,sessionId,adminGrant,historyRetained:true,productionWrites:0,cleanupWithheld:withheld||authSignOutUncertain||sqlUncertain,authSignInUncertain,authSignOutUncertain,sqlUncertain,activeBodies:bodies.size,pending:requests.map(entry=>({operation:entry.operation,settled:entry.settled,responseComplete:entry.responseComplete,worker:entry.worker})),holders:[...holders].map(holder=>({name:holder.name,pid:holder.pid,backendStart:holder.backendStart})),checks,failures});
  const save=(withheld:boolean)=>fs.writeFileSync(resourcePath,JSON.stringify(receipt(withheld),null,2),{flag:'wx'});
  // A timed-out Vitest callback may still be unwinding. Do not touch shared
  // grants, fixtures, sessions or ledger until full bodies and actual DB work end.
  try{
   await waitFor(()=>bodies.size===0,'full setup/test body unwind');
   for(const holder of [...holders])await release(holder);
   await drainRequests();
   if(authSignInUncertain||sqlUncertain)throw Error('Unknown Auth or SQL outcome');
  }catch{failures.push('Unresolved full body, database worker, holder or Auth outcome; cleanup withheld for main.');save(true);throw Error(failures[0]);}
  const cleanup=(label:string,run:()=>void)=>{try{run();}catch{failures.push(label);}};
  const parents=owned.filter(row=>row.table==='parties').map(row=>row.id);
  if(parents.length)cleanup('discover exact owned assignments',()=>{const ids:number[]=JSON.parse(cleanupSql(`select coalesce(json_agg(id),'[]') from public.party_service_category_assignments where party_id in (${parents.join(',')})`));for(const id of ids)record('party_service_category_assignments',id);});
  for(const fault of faults)cleanup('exact owned fault removal',()=>{cleanupSql(`drop trigger if exists ${fault} on public.audit_logs;drop function if exists erp_private.${fault}()`);expect(cleanupSql(`select (select count(*) from pg_proc where proname=${q(fault)})+(select count(*) from pg_trigger where tgname=${q(fault)})`)).toBe('0');});
  const order=['user_roles','roles','party_service_category_assignments','parties','party_service_categories_master','owner_companies','countries','party_statuses','party_natures','permissions'];
  try{
   for(const table of order){
    const ids=[...new Set([...owned.filter(row=>row.table===table).map(row=>row.id),...(table==='permissions'?borrowed:[]),...(table==='user_roles'&&adminGrant!==undefined?[adminGrant]:[])])].sort((a,b)=>a-b);
    if(!ids.length)continue;
    cleanup(`retire and verify ${table}`,()=>{
     expect(ids.every(id=>Number.isSafeInteger(id)&&id>0)).toBe(true);
     const column=table==='owner_companies'?'status':'is_active',target=table==='owner_companies'?"'inactive'":'false';
     const metadata=['countries','currencies'].includes(table)?',deactivated_at=clock_timestamp()':'';
     const rows=JSON.parse(cleanupSql(`begin;update public.${table} set ${column}=${target}${metadata} where id in (${ids.join(',')});select coalesce(json_agg(json_build_object('id',id,'inactive',${column}=${target}) order by id),'[]') from public.${table} where id in (${ids.join(',')});commit;`));
     checks.push({table,ids,rows});expect(rows.map((row:{id:number})=>row.id)).toEqual(ids);expect(rows.every((row:{inactive:boolean})=>row.inactive)).toBe(true);
    });
   }

  }finally{
   if(client&&sessionId&&!sqlUncertain){try{authSignOutUncertain=true;const result=await deadline(client.auth.signOut({scope:'local'}),8000);expect(result.error).toBeNull();authSignOutUncertain=false;}catch{failures.push('Exact local sign-out failed or unconfirmed');}
    cleanup('exact session absence',()=>{const remaining=Number(cleanupSql(`select count(*) from auth.sessions where id=${q(sessionId)}::uuid`));checks.push({sessionId,remaining});expect(remaining).toBe(0);});
   }
   save(false);
  }
  expect(failures).toEqual([]);
 },60000);
});
