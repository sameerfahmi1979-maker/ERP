import {nativeApiOrigin} from './native-api-origin.mjs';
// Main alone runs this opted-in Auth/RPC suite against its pinned isolated DB.
// No trigger injection: blockers hold only this suite's exact synthetic rows.
import {afterAll,beforeAll as rawBeforeAll,describe,expect,it as rawIt} from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {spawn,spawnSync,type ChildProcessWithoutNullStreams} from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {guard,runtime} from './local-db.mjs';

describe.skipIf(process.env.ALGT_F06_FINANCE_LOCK_TESTS !== '1')('locked-party finance authority across row waits', () => {
  const marker = 'FFL' + Date.now().toString(36).toUpperCase();
  type Ledger = { actors: Record<string, { email: string; password: string; profileId: number }>; rows: object[]; intents: object[] };
  type Holder = { child: ChildProcessWithoutNullStreams; name: string; pid: number | null; backendStart:string|null };
  let ledger: Ledger, client: SupabaseClient, pinned: string, claims: string;
  let actor: number, adminRole: number, adminGrant: number | undefined, editGrant: number;
  let nature: number, status: number, country: number, currency: number;
  const owned: { table: string; id: number }[] = [], borrowedPermissions: number[] = [];
  const holders = new Set<Holder>();
  const persist = () => fs.writeFileSync(path.join(runtime, 'fixtures-private.json'), JSON.stringify(ledger, null, 2));
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
  assertRunning();return beginRequest(String(args.p_operation),client.rpc('save_party_finance_profile',args));
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
  const found:Worker[]=JSON.parse(sql(`select coalesce(json_agg(json_build_object('pid',pid,'database',datid,'backend_start',backend_start::text,'query_start',query_start::text,'xact_start',xact_start::text,'query_hash',md5(query))),'[]') from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and wait_event_type='Lock' and ${holderPid}=any(pg_blocking_pids(pid)) and query like '%save_party_finance_profile%'`));
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
  const q = (value: unknown) => value === null ? 'null' : typeof value === 'number' || typeof value === 'boolean' ? String(value) : "'" + String(value).replaceAll("'", "''") + "'";
  const tracked = (table: string, id: number) => ledger.rows.some(row => {
    const entry = row as { table?: string; id?: number }; return entry.table === table && entry.id === id;
  });
  function put(table: string, values: Record<string, unknown>) {
    ledger.intents.push({ marker, table, operation: 'Insert exact synthetic locked-party finance fixture', values }); persist();
    const id = Number(sql(`insert into public.${table}(${Object.keys(values).join(',')}) values(${Object.values(values).map(q).join(',')}) returning id`));
    expect(Number.isSafeInteger(id) && id > 0).toBe(true);
    owned.push({ table, id }); ledger.rows.push({ marker, table, id }); persist(); return id;
  }
  function authority() {
    // The authenticated probe uses only this test's live local session. Do not
    // print/store token material; the persisted ledger records session ID only.
    return JSON.parse(sql(`begin;set local request.jwt.claims=${q(claims)};select jsonb_build_object(
      'active',erp_private.business_principal_is_active(),
      'edit',erp_private.permission_in_scope('master_data.parties.edit',null,null),
      'view',erp_private.permission_in_scope('master_data.parties.view',null,null),
      'admin',exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
        where ur.user_profile_id=${actor} and ur.is_active and r.is_active and ur.owner_company_id is null and ur.branch_id is null and r.role_code='system_admin'));rollback;`));
  }
  function setAdmin(active: boolean) {
    expect(adminGrant).toBeDefined();
    expect(tracked('user_roles', adminGrant!)).toBe(true);
    ledger.intents.push({ marker, table: 'user_roles', id: adminGrant, operation: active ? 'Activate exact temporary global system_admin assignment; restore false in finally' : 'Revoke only exact temporary global system_admin assignment', is_active: active }); persist();
    expect(sql(`update public.user_roles set is_active=${active} where id=${adminGrant} and user_profile_id=${actor} and role_id=${adminRole} and owner_company_id is null and branch_id is null returning id`)).toBe(String(adminGrant));
  }
  beforeAll(async () => {
    pinned = guard();
    const keys = JSON.parse(fs.readFileSync(path.join(runtime, 'keys-private.json'), 'utf8'));
    expect(keys.API_URL).toBe(nativeApiOrigin);
    ledger = JSON.parse(fs.readFileSync(path.join(runtime, 'fixtures-private.json'), 'utf8'));
    actor = ledger.actors.none.profileId;
    ledger.intents.push({ marker, operation: 'Late system_admin-only revocation on locked synthetic parties; keep separate GLOBAL parties.edit/view grant. Retain finance/audit/receipt history, retire fixtures, revoke exact local session. No production, mail, provider, fault trigger or service-role client.', tables: ['permissions', 'roles', 'role_permissions', 'user_roles', 'party_natures', 'party_statuses', 'countries', 'currencies', 'parties', 'party_finance_profiles', 'audit_logs', 'erp_private.master_lifecycle_receipts'] }); persist();
    // Refuse interference from another suite: main must execute serially.
    expect(sql(`select count(*) from public.user_roles where user_profile_id=${actor} and is_active`)).toBe('0');
    adminRole = Number(sql("select id from public.roles where role_code='system_admin' and is_active"));
    expect(Number.isSafeInteger(adminRole) && adminRole > 0).toBe(true);
    const priorGrants = JSON.parse(sql(`select coalesce(json_agg(json_build_object('id',id,'active',is_active)),'[]') from public.user_roles where user_profile_id=${actor} and role_id=${adminRole} and owner_company_id is null and branch_id is null`));
    expect(priorGrants.length).toBeLessThanOrEqual(1);
    if (priorGrants.length) {
      expect(priorGrants[0].active).toBe(false);
      expect(tracked('user_roles', Number(priorGrants[0].id)), 'Only an already-ledgered inactive local assignment may be borrowed').toBe(true);
      adminGrant = Number(priorGrants[0].id);
      ledger.intents.push({ marker, table: 'user_roles', id: adminGrant, operation: 'Borrow exact tracked inactive global system_admin assignment; preserve false on cleanup' }); persist();
    } else adminGrant = put('user_roles', { user_profile_id: actor, role_id: adminRole, owner_company_id: null, branch_id: null, is_active: false });
    const editRole = put('roles', { role_code: marker + '_EDITOR', role_name: marker, is_active: true });
    for (const action of ['edit', 'view']) {
      const code = 'master_data.parties.' + action;
      const found = JSON.parse(sql(`select coalesce(json_agg(json_build_object('id',id,'active',is_active)),'[]') from public.permissions where permission_code=${q(code)}`));
      let permissionId: number;
      if (!found.length) permissionId = put('permissions', { permission_code: code, permission_name: marker, module_code: 'MASTER_DATA', action_code: action, is_active: true });
      else {
        permissionId = Number(found[0].id);
        if (!found[0].active) {
          expect(tracked('permissions', permissionId), 'Never activate an untracked baseline permission').toBe(true);
          borrowedPermissions.push(permissionId);
          ledger.intents.push({ marker, table: 'permissions', id: permissionId, operation: 'Activate exact tracked local definition; restore false in finally' }); persist();
          sql(`update public.permissions set is_active=true where id=${permissionId}`);
        }
      }
      ledger.intents.push({ marker, table: 'role_permissions', role_id: editRole, permission_id: permissionId }); persist();
      sql(`insert into public.role_permissions(role_id,permission_id) values(${editRole},${permissionId})`);
      ledger.rows.push({ marker, table: 'role_permissions', role_id: editRole, permission_id: permissionId }); persist();
    }
    editGrant = put('user_roles', { user_profile_id: actor, role_id: editRole, owner_company_id: null, branch_id: null, is_active: true });
    nature = put('party_natures', { nature_code: marker, name_en: marker, is_active: true });
    status = put('party_statuses', { status_code: marker, name_en: marker, is_active: true });
    const countryCode = sql("select chr(90-n/26)||chr(90-n%26) from generate_series(0,675)n where not exists(select 1 from public.countries where country_code=chr(90-n/26)||chr(90-n%26) or iso3_code='Q'||chr(90-n/26)||chr(90-n%26)) order by n limit 1");
    expect(countryCode).toMatch(/^[A-Z]{2}$/);
    country = put('countries', { country_code: countryCode, iso3_code: 'Q' + countryCode, name_en: marker, nationality_en: 'Synthetic', is_active: true });
    const currencyCode = sql("select 'Q'||chr(65+n/26)||chr(65+n%26) from generate_series(0,675)n where not exists(select 1 from public.currencies where currency_code='Q'||chr(65+n/26)||chr(65+n%26)) order by n limit 1");
    expect(currencyCode).toMatch(/^[A-Z]{3}$/);
    currency = put('currencies', { currency_code: currencyCode, currency_name_en: marker, is_active: true, is_base_currency: false });
  const boundedFetch:typeof fetch=(input,init)=>fetch(input,{...init,signal:AbortSignal.any([...(init?.signal?[init.signal]:[]),AbortSignal.timeout(12000)])});
  client=createClient(keys.API_URL,keys.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:boundedFetch}});
    assertRunning();authSignInUncertain=true;const login = await deadline(client.auth.signInWithPassword({ email: ledger.actors.none.email, password: ledger.actors.none.password }),12000);
    expect(login.error).toBeNull();
    const decoded = JSON.parse(Buffer.from(login.data.session!.access_token.split('.')[1], 'base64url').toString('utf8'));
    sessionId=decoded.session_id;expect(sessionId).toMatch(/^[0-9a-f-]{36}$/i);
    claims = JSON.stringify({ sub: decoded.sub, session_id: decoded.session_id, role: 'authenticated', aal: decoded.aal });
    ledger.rows.push({ marker, table: 'auth.sessions', id: decoded.session_id, operation: 'Exact local session; sign out locally in finally' }); persist();
    authSignInUncertain=false;
    expect(authority()).toEqual({ active: true, edit: true, view: true, admin: false });
  }, 30_000);

  const waitFor = async (condition: () => boolean, label: string) => {
    const deadline = Date.now() + 8_000;
    while (!condition()) {
      if (Date.now() >= deadline) throw Error('Timed out waiting for synthetic ' + label);
      await new Promise(resolve => setTimeout(resolve, 80));
    }
  };
  async function hold(table: 'party_finance_profiles' | 'currencies', id: number) {
    expect(owned.some(row => row.table === table && row.id === id)).toBe(true);
    const name = marker + '_LOCK_' + randomUUID().replaceAll('-', '').slice(0, 12);
    ledger.intents.push({ marker, object: name, table, id, containerId: pinned, operation: 'Exact row FOR UPDATE blocker; rollback/exact named-backend termination in finally' }); persist();
    assertRunning();const child = spawn('docker', ['exec', '-i', '-e', 'PGPASSWORD=postgres', pinned, 'psql', '-X', '-q', '-A', '-t', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { windowsHide: true,timeout:25000 });
    const holder: Holder = { child, name, pid: null,backendStart:null }; holders.add(holder);
    let output = '', failure: Error | null = null;
    child.on('error', error => { failure = error; });
    child.stdin.on('error', error => { failure = error; });
    child.stdout.on('data', chunk => { output += String(chunk);const match=output.match(/HOLDER_ID:(\{[^\r\n]*\})/);if(match){const identity=JSON.parse(match[1]);holder.pid=identity.pid;holder.backendStart=identity.backend_start;} });
    child.stderr.on('data', () => { /* Drain diagnostics; never persist SQL output. */ });
    // SELECT FOR UPDATE deliberately does not acquire the mutation-domain
    // advisory locks. Thus the RPC reaches the intended child/lookup wait.
    assertRunning();child.stdin.write(`begin;set local application_name=${q(name)};set local statement_timeout='8s';set local lock_timeout='6s';set local idle_in_transaction_session_timeout='15s';select 'HOLDER_ID:'||json_build_object('pid',pid,'backend_start',backend_start)::text from pg_stat_activity where pid=pg_backend_pid();select id from public.${table} where id=${id} for update;select 'LOCK_READY:'||pg_backend_pid();\n`);
    try {
      await waitFor(() => { if (failure) throw failure; return /LOCK_READY:\d+/.test(output); }, table + ' lock');
      holder.pid = Number(output.match(/LOCK_READY:(\d+)/)![1]);
      ledger.rows.push({ marker, backendPid: holder.pid, applicationName: name }); persist(); return holder;
    } catch (error) { await release(holder); throw error; }
  }
  async function release(holder: Holder) {
    if (!holders.has(holder)) return;
    try {
      if (holder.child.exitCode === null && !holder.child.stdin.destroyed) holder.child.stdin.end('rollback;\n\\q\n');
      await waitFor(() => holder.child.exitCode !== null, 'finance blocker release');
    } finally {
      if(holder.pid===null||!holder.backendStart){admissionClosed=true;throw Error('Unknown holder identity; cleanup withheld');}
      const target = `datname=current_database() and application_name=${q(holder.name)} and pid=${holder.pid} and backend_start=${q(holder.backendStart)}::timestamptz`;
      cleanupSql(`select pg_terminate_backend(pid) from pg_stat_activity where ${target}`);
      expect(cleanupSql(`select count(*) from pg_stat_activity where ${target}`)).toBe('0');
      holders.delete(holder);
    }
  }
  function fixture() {
    const party = put('parties', { party_code: marker + '_' + owned.length, display_name: marker, legal_name_en: 'Synthetic locked finance party', party_nature_id: nature, country_id: country, party_status_id: status, is_active: true, is_locked: true });
    const profile = put('party_finance_profiles', { party_id: party, credit_limit: 0, finance_hold: false });
    return { party, profile };
  }
  type Fixture = ReturnType<typeof fixture>;
  const snapshot = (f: Fixture, operation: string) => JSON.parse(sql(`select jsonb_build_object(
    'party',(select to_jsonb(p) from public.parties p where id=${f.party}),
    'profile',(select to_jsonb(p) from public.party_finance_profiles p where id=${f.profile}),
    'audits',(select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb) from public.audit_logs a where (entity_name='party_finance_profiles' and entity_id=${f.profile}) or new_values->>'operation_id'=${q(operation)}),
    'receipts',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from erp_private.master_lifecycle_receipts r where operation_id=${q(operation)}))`));
  async function runBlocked(target: 'profile' | 'currency', revoke: boolean, replay = false) {
    // A replay returns before currency lookup; only profile-lock replay is real.
    expect(!replay || target === 'profile').toBe(true);
    const f = fixture(), operation = randomUUID();
    const data = { finance_remarks: marker + ' reviewed edit', ...(target === 'currency' ? { default_currency_id: currency } : {}) };
    const args = { p_operation: operation, p_party_id: f.party, p_revision: '1', p_data: data };
    ledger.intents.push({ marker, partyId: f.party, profileId: f.profile, operationId: operation, test: { target, revoke, replay }, operation: 'Exact finance request; retain audit/receipt history if committed' }); persist();
    let holder: Holder | undefined;
    try {
      setAdmin(true);
      expect(authority()).toEqual({ active: true, edit: true, view: true, admin: true });
      if (replay) {
        const first = await deadline(beginRpc(args).promise,12000);
        expect(first.error).toBeNull(); expect(first.data).toMatchObject({ id: f.profile, revision: '2', changed: true, replayed: false });
      }
      const before = snapshot(f, operation);
      expect(before.party).toMatchObject({ is_locked: true, is_active: true });
      expect(before.audits).toHaveLength(replay ? 1 : 0); expect(before.receipts).toHaveLength(replay ? 1 : 0);
      holder = await hold(target === 'profile' ? 'party_finance_profiles' : 'currencies', target === 'profile' ? f.profile : currency);
      const pending=beginRpc(args),request=deadline(pending.promise,12000);void request.catch(()=>undefined);
      await waitFor(() => captureWorker(pending,holder!.pid), target + ' RPC wait');
      if (revoke) {
        setAdmin(false);
        expect(sql(`select is_active from public.user_roles where id=${editGrant}`)).toBe('t');
        expect(authority()).toEqual({ active: true, edit: true, view: true, admin: false });
      }
      await release(holder);
      const result = await request;
      const after = snapshot(f, operation);
      if (revoke) {
        expect(result.error?.code).toBe('42501'); expect(result.data).toBeNull();
        // For replay, the one existing receipt/audit must remain byte-for-byte
        // unchanged. For a new request, neither may exist after rollback.
        expect(after).toEqual(before);
        expect(after.audits).toHaveLength(replay ? 1 : 0); expect(after.receipts).toHaveLength(replay ? 1 : 0);
      } else {
        expect(result.error).toBeNull(); expect(result.data).toMatchObject({ id: f.profile, revision: '2', changed: true, replayed: replay });
        expect(after.profile).toMatchObject({ ...data, workspace_revision: 2, credit_limit: 0, finance_hold: false });
        expect(after.party).toEqual(before.party);
        expect(after.audits).toHaveLength(1); expect(after.receipts).toHaveLength(1);
        if (replay) expect(after).toEqual(before);
      }
    } finally {
      try { if (holder) await release(holder); } finally {
        await drainRequests();
        setAdmin(false);
      }
    }
  }
  for(const target of ['profile','currency'] as const)it(`${target} wait preserves a no-revocation save`,()=>runBlocked(target,false),45_000);
  for(const target of ['profile','currency'] as const)it(`${target} wait rejects revoked system_admin without target/audit/receipt effects`,()=>runBlocked(target,true),45_000);
  it('profile wait permits a current-authority replay exactly once', () => runBlocked('profile', false, true), 45_000);
  it('profile wait rejects replay after only system_admin is revoked', () => runBlocked('profile', true, true), 45_000);

 afterAll(async()=>{
  if(!ledger)return;cleanupBegun=true;const failures:string[]=[],checks:object[]=[];
  const resourcePath=path.join(runtime,`PARTY_FINANCE_LOCK_RESOURCES_${marker}.json`);
  const receipt=(withheld:boolean)=>({marker,owned,borrowedPermissions,sessionId,adminGrant,historyRetained:true,productionWrites:0,cleanupWithheld:withheld||authSignOutUncertain||sqlUncertain,authSignInUncertain,authSignOutUncertain,sqlUncertain,activeBodies:bodies.size,pending:requests.map(entry=>({operation:entry.operation,settled:entry.settled,responseComplete:entry.responseComplete,worker:entry.worker})),holders:[...holders].map(holder=>({name:holder.name,pid:holder.pid,backendStart:holder.backendStart})),checks,failures});
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

  const order=['user_roles','roles','parties','currencies','countries','party_statuses','party_natures','permissions'];
  try{
   for(const table of order){
    const ids=[...new Set([...owned.filter(row=>row.table===table).map(row=>row.id),...(table==='permissions'?borrowedPermissions:[]),...(table==='user_roles'&&adminGrant!==undefined?[adminGrant]:[])])].sort((a,b)=>a-b);
    if(!ids.length)continue;
    cleanup(`retire and verify ${table}`,()=>{
     expect(ids.every(id=>Number.isSafeInteger(id)&&id>0)).toBe(true);
     const column=table==='owner_companies'?'status':'is_active',target=table==='owner_companies'?"'inactive'":'false';
     const metadata=['countries','currencies'].includes(table)?',deactivated_at=clock_timestamp()':'';
     const rows=JSON.parse(cleanupSql(`begin;update public.${table} set ${column}=${target}${metadata} where id in (${ids.join(',')});select coalesce(json_agg(json_build_object('id',id,'inactive',${column}=${target}) order by id),'[]') from public.${table} where id in (${ids.join(',')});commit;`));
     checks.push({table,ids,rows});expect(rows.map((row:{id:number})=>row.id)).toEqual(ids);expect(rows.every((row:{inactive:boolean})=>row.inactive)).toBe(true);
    });
   }
   const profiles=owned.filter(row=>row.table==='party_finance_profiles').map(row=>row.id);
   if(profiles.length)cleanup('retained finance profiles',()=>{const count=Number(cleanupSql(`select count(*) from public.party_finance_profiles where id in (${profiles.join(',')})`));checks.push({retainedProfiles:profiles,count});expect(count).toBe(profiles.length);});
  }finally{
   if(client&&sessionId&&!sqlUncertain){try{authSignOutUncertain=true;const result=await deadline(client.auth.signOut({scope:'local'}),8000);expect(result.error).toBeNull();authSignOutUncertain=false;}catch{failures.push('Exact local sign-out failed or unconfirmed');}
    cleanup('exact session absence',()=>{const remaining=Number(cleanupSql(`select count(*) from auth.sessions where id=${q(sessionId)}::uuid`));checks.push({sessionId,remaining});expect(remaining).toBe(0);});
   }
   save(false);
  }
  expect(failures).toEqual([]);
 },60000);
});
