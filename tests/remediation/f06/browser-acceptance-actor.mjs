// MAIN ONLY. Author/review without importing this executable.
// One account, one prepare/observe/retire sequence; failed/uncertain attempts are
// retained for independent reconciliation, NEVER automatically repeated/repaired.
// Required: one of the explicitly registered actors below, and main-local.
// prepare additionally needs ALGT_F06_BROWSER_PASSWORD (fresh >=24 characters).
// Password is stored ONLY in the ignored local credential receipt, never logged.
// Main must protect the existing private runtime directory with its Windows ACL;
// Node mode 0600 is an additional request, NOT a Windows ACL guarantee.
// Close the owned browser session before retire. JWTs already issued can remain
// cryptographically valid until expiry: ban + inactive profile + exact session
// removal is NOT a claim of universal immediate JWT invalidation.
// Sources: fixtures.mjs; local-app-safety.mjs; src/types/database.ts;
// installed @supabase/auth-js GoTrueAdminApi.createUser/updateUserById and:
// https://supabase.com/docs/reference/javascript/auth-admin-createuser
// https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';

const root = path.resolve(import.meta.dirname, '../../..');
const runtime = path.join(root, 'CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F06/local');
// Closed fresh-run registry; never infer an email or accept arbitrary targets.
// The retired0510/0511 helper bytes remain beside their private retirement receipts.
const actors = Object.freeze({F06BROWSER0510:'f06-browser0510@example.invalid', F06BROWSER0511:'f06-browser0511@example.invalid', F06BROWSER0512:'f06-browser0512@example.invalid'});
const marker = process.env.ALGT_F06_BROWSER_ACTOR;
assert.ok(Object.hasOwn(actors, marker));
const email = actors[marker];
const fullName = 'F06 synthetic browser ' + marker;
const apiUrl = 'http://127.0.0.1:16621';
const containerId = '68ba17ecef10f3f77ae563b68d68bd146331bf844eeb735a3dae0d7831fd1d0c';
const dockerExe = 'C:/Program Files/Docker/Docker/resources/bin/docker.exe';
const dockerHost = 'npipe:////./pipe/dockerDesktopLinuxEngine';
const dockerConfig = path.join(runtime, marker + '_ABSENT_DOCKER_CONFIG');
// Main pre-creates this dedicated parent with protected Windows ACLs. Do not
// inherit the broad development-workspace ACL for a newly generated credential.
const privateParent = path.join(runtime, 'browser-acceptance-private');
const privateDir = path.join(privateParent, 'browser-acceptance-actor-' + marker);
const credentialsFile = path.join(privateDir, 'credentials-private.json');
const journalFile = path.join(privateDir, 'intents-private.jsonl');
const lockFile = path.join(privateDir, 'command-lock-private.json');
const sha = value => createHash('sha256').update(value).digest('hex');
const q = value => "'" + String(value).replaceAll("'", "''") + "'";
const numericId = value => { assert.ok(Number.isSafeInteger(value) && value > 0); return value; };
const uuid = value => { assert.match(value, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i); return value; };
let journal, stage = 'preflight', sequence = 0, previousEventHash = null;
let command, reservation;
let lockNonce;
const helperSha256 = sha(fs.readFileSync(new URL(import.meta.url)));

function durable(fd, value) {
  const bytes = Buffer.from(value); let offset = 0;
  while (offset < bytes.length) {
    const count = fs.writeSync(fd, bytes, offset, bytes.length - offset);
    assert.ok(count > 0); offset += count;
  }
  fs.fsyncSync(fd);
}
function exclusive(file, value) {
  const fd = fs.openSync(file, 'wx', 0o600);
  try { durable(fd, JSON.stringify(value, null, 2) + '\n'); } finally { fs.closeSync(fd); }
}
function append(event, details = {}) {
  const line = JSON.stringify({sequence:++sequence, previousEventHash, at:new Date().toISOString(), command, event, details}) + '\n';
  durable(journal, line); previousEventHash = sha(line);
}
function acquireLock() {
  const nonce = randomUUID();
  exclusive(lockFile, {nonce,command,pid:process.pid,helperSha256});
  lockNonce = nonce;
}
function releaseSuccessfulLock() {
  assert.equal(fs.lstatSync(lockFile).isSymbolicLink(), false);
  const lock = JSON.parse(fs.readFileSync(lockFile,'utf8'));
  assert.equal(lock.nonce,lockNonce); assert.equal(lock.pid,process.pid);
  fs.unlinkSync(lockFile); // ONLY our exact successful invocation lock; evidence stays
  lockNonce = undefined;
}
function docker(args, input, timeout = 15000) {
  assert.equal(fs.existsSync(dockerConfig), false);
  const env = {};
  for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'Path', 'TEMP', 'TMP']) if (process.env[key] !== undefined) env[key] = process.env[key];
  const result = spawnSync(dockerExe, ['--config', dockerConfig, '--host', dockerHost, ...args], {
    input, encoding:'utf8', env, shell:false, windowsHide:true,
    timeout, killSignal:'SIGTERM', maxBuffer:4*1024*1024,
  });
  if (result.error || result.signal || result.status !== 0) throw new Error('BOUNDED_LOCAL_PROCESS_FAILED');
  return result.stdout.trim(); // never forward raw diagnostics
}
function guard() {
  const item = JSON.parse(docker(['container', 'inspect', containerId, '--format',
    '{"id":{{json .Id}},"name":{{json .Name}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}},"running":{{json .State.Running}},"restarting":{{json .State.Restarting}},"ports":{{json .HostConfig.PortBindings}}}']));
  assert.equal(item.id, containerId); assert.equal(item.name, '/supabase_db_algt-f06-local');
  assert.equal(item.project, 'algt-f06-local'); assert.equal(item.running, true); assert.equal(item.restarting, false);
  assert.deepEqual(item.ports['5432/tcp'], [{HostIp:'127.0.0.1', HostPort:'16622'}]);
  assert.equal(fs.existsSync(path.join(runtime, 'supabase/.temp/project-ref')), false);
}
function sql(body, write = false) {
  guard();
  const input = `begin ${write ? 'read write' : 'read only'};
set local statement_timeout='20s'; set local lock_timeout='5s';
set local idle_in_transaction_session_timeout='25s'; set local transaction_timeout='30s';
${body}\n${write ? 'commit' : 'rollback'};\n`;
  return docker(['exec', '-i', '-e', 'PGPASSWORD=postgres', containerId,
    'psql', '-X', '-w', '-qAt', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], input, 35000);
}
const query = body => JSON.parse(sql(body));
function projection(ownedAuthId) {
  return query(`select json_build_object(
    'profiles',(select coalesce(jsonb_object_agg(id::text,md5(to_jsonb(p)::text)),'{}') from public.user_profiles p where auth_user_id<>${q(ownedAuthId)}::uuid),
    'assignments',(select coalesce(jsonb_object_agg(id::text,md5(to_jsonb(r)::text)),'{}') from public.user_roles r where user_profile_id not in(select id from public.user_profiles where auth_user_id=${q(ownedAuthId)}::uuid)),
    'roles',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by id),'[]')::text) from public.roles r),
    'permissions',(select md5(coalesce(jsonb_agg(to_jsonb(p) order by id),'[]')::text) from public.permissions p),
    'rolePermissions',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by role_id,permission_id),'[]')::text) from public.role_permissions r),
    'authIdentities',(select coalesce(jsonb_object_agg(id::text,md5(jsonb_build_array(email,role,banned_until,deleted_at)::text)),'{}') from auth.users where id<>${q(ownedAuthId)}::uuid),
    'authProviderIdentities',(select coalesce(jsonb_object_agg(id::text,md5(jsonb_build_array(user_id,provider)::text)),'{}') from auth.identities where user_id<>${q(ownedAuthId)}::uuid),
    'sessions',(select coalesce(jsonb_object_agg(id::text,user_id::text),'{}') from auth.sessions where user_id<>${q(ownedAuthId)}::uuid),
    'refreshIdentities',(select coalesce(jsonb_object_agg(id::text,jsonb_build_array(user_id,session_id)),'{}') from auth.refresh_tokens where user_id<>${q(ownedAuthId)}));`);
}
function preserved(before, after, allowAdditionalSessions = false) {
  for (const key of ['profiles','assignments','roles','permissions','rolePermissions','authIdentities','authProviderIdentities']) assert.deepEqual(after[key], before[key]);
  for (const key of ['sessions','refreshIdentities']) {
    if (allowAdditionalSessions) for (const [id, identity] of Object.entries(before[key])) assert.deepEqual(after[key][id], identity);
    else assert.deepEqual(after[key], before[key]);
  }
}
function providersOff() {
  assert.equal(sql(`select ((select count(*) from public.erp_email_provider_configs where is_enabled is distinct from false)
    +(select count(*) from public.erp_ai_provider_configs where is_enabled is distinct from false))::text;`), '0');
}
function ownership() {
  // Source ledger is read only at main runtime. No original password/key is copied
  // into this helper's receipts; all returned properties are explicit identities.
  const ledger = JSON.parse(fs.readFileSync(path.join(runtime, 'fixtures-private.json'), 'utf8'));
  assert.equal(ledger.marker, 'F06_LOCAL_20261001'); assert.equal(ledger.productionRowsCopied, 0);
  const owner = {roleId:numericId(ledger.actors.admin.roleId), companyId:numericId(ledger.companyIds[0]),
    adminProfileId:numericId(ledger.actors.admin.profileId), adminAuthId:ledger.actors.admin.authId,
    adminAssignmentId:numericId(ledger.actors.admin.assignmentId)};
  assert.match(owner.adminAuthId, /^[0-9a-f-]{36}$/i);
  for (const [table,id] of [['roles',owner.roleId],['owner_companies',owner.companyId],['user_roles',owner.adminAssignmentId]])
    assert.ok(ledger.rows.some(row => row.table === table && row.id === id));
  const check = query(`select json_build_object(
    'role',(select count(*)=1 from public.roles where id=${owner.roleId} and role_code='system_admin' and role_name='F06 synthetic admin' and is_system_role and is_active),
    'company',(select count(*)=1 from public.owner_companies where id=${owner.companyId} and company_code='F06_A' and legal_name_en='F06 synthetic company A' and status='active'),
    'admin',(select count(*)=1 from public.user_roles r join public.user_profiles p on p.id=r.user_profile_id where r.id=${owner.adminAssignmentId} and r.user_profile_id=${owner.adminProfileId} and r.role_id=${owner.roleId} and r.is_active and r.owner_company_id is null and r.branch_id is null and p.auth_user_id=${q(owner.adminAuthId)}::uuid and p.status='active'));`);
  assert.deepEqual(check, {role:true, company:true, admin:true}); return owner;
}
function ownState() {
  const authId = uuid(reservation.authId);
  return query(`select json_build_object(
    'auth',(select json_build_object('id',id,'email',email,'role',role,'confirmed',email_confirmed_at is not null,'banned',banned_until>now(),'marker',raw_app_meta_data->>'f06_marker') from auth.users where id=${q(authId)}::uuid),
    'profiles',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'authId',auth_user_id,'fullName',full_name,'status',status,'companyId',owner_company_id,'mustChangePassword',must_change_password,'notes',notes)),'[]') from public.user_profiles where auth_user_id=${q(authId)}::uuid),
    'assignments',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from public.user_roles r join public.user_profiles p on p.id=r.user_profile_id where p.auth_user_id=${q(authId)}::uuid),
    'sessions',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'userId',user_id) order by id),'[]') from auth.sessions where user_id=${q(authId)}::uuid),
    'refreshIds',(select coalesce(jsonb_agg(id::text order by id),'[]') from auth.refresh_tokens where user_id=${q(authId)}));`);
}
function assertOwned(state, prepared, inactive = false) {
  assert.equal(state.auth?.id, reservation.authId); assert.equal(state.auth.email, email);
  assert.equal(state.auth.role, 'authenticated'); assert.equal(state.auth.confirmed, true); assert.equal(state.auth.marker, marker);
  assert.equal(state.profiles.length, 1); const profile = state.profiles[0];
  assert.equal(profile.id, prepared.profileId); assert.equal(profile.authId, reservation.authId);
  assert.equal(profile.fullName, fullName); assert.equal(profile.notes, marker); assert.equal(profile.companyId, reservation.owner.companyId);
  assert.equal(profile.status, inactive ? 'inactive' : 'active'); assert.equal(profile.mustChangePassword, false);
  assert.equal(state.assignments.length, 1); const assignment = state.assignments[0];
  assert.equal(assignment.id, prepared.assignmentId); assert.equal(assignment.user_profile_id, prepared.profileId);
  assert.equal(assignment.role_id, reservation.owner.roleId); assert.equal(assignment.owner_company_id, null); assert.equal(assignment.branch_id, null);
  assert.equal(assignment.is_active, !inactive);
}
function openExisting() {
  assert.equal(fs.lstatSync(privateDir).isSymbolicLink(), false);
  assert.equal(fs.realpathSync(privateDir).replaceAll('\\','/').toLowerCase(), privateDir.replaceAll('\\','/').toLowerCase());
  acquireLock();
  for (const file of [credentialsFile,journalFile,path.join(privateDir,'prepare-private.json')]) {
    assert.equal(fs.lstatSync(file).isSymbolicLink(), false); assert.equal(fs.lstatSync(file).isFile(), true);
  }
  reservation = JSON.parse(fs.readFileSync(credentialsFile, 'utf8'));
  assert.equal(reservation.marker, marker); assert.equal(reservation.email, email);
  assert.equal(reservation.containerId, containerId); assert.equal(reservation.apiUrl, apiUrl);
  assert.equal(reservation.helperSha256, helperSha256); uuid(reservation.authId); uuid(reservation.nonce);
  const raw = fs.readFileSync(journalFile, 'utf8'); assert.ok(raw.endsWith('\n'));
  const events = [];
  for (const line of raw.trimEnd().split('\n')) {
    const item = JSON.parse(line); assert.equal(item.sequence, ++sequence); assert.equal(item.previousEventHash, previousEventHash);
    previousEventHash = sha(line+'\n'); events.push(item);
  }
  assert.ok(sequence > 0);
  assert.deepEqual(events[0].details, {marker,email,authId:reservation.authId,owner:reservation.owner,helperSha256,containerId,apiUrl,nonce:reservation.nonce});
  const credentialEvents = events.filter(item => item.event === 'private-credential-receipt-written');
  const preparedEvents = events.filter(item => item.event === 'prepared');
  assert.equal(credentialEvents.length,1); assert.equal(preparedEvents.length,1);
  assert.equal(credentialEvents[0].details.sha256,sha(fs.readFileSync(credentialsFile)));
  assert.equal(preparedEvents[0].details.receiptSha256,sha(fs.readFileSync(path.join(privateDir,'prepare-private.json'))));
  assert.equal(events.some(item => item.event === 'failure-retained'),false);
  journal = fs.openSync(journalFile, 'a', 0o600);
}

async function main() {
  assert.equal(process.argv.length, 3); command = process.argv[2]; assert.ok(['prepare','observe','retire'].includes(command));
  assert.equal(process.env.ALGT_F06_BROWSER_ACTOR, marker); assert.equal(process.env.ALGT_F06_LOCAL_TARGET, 'main-local');
  assert.equal(root.replaceAll('\\','/').toLowerCase(), 'c:/dev/agt-erp-f06');
  assert.equal(path.resolve(process.cwd()).replaceAll('\\','/').toLowerCase(), 'c:/dev/agt-erp-f06');
  assert.equal(fs.realpathSync(runtime).replaceAll('\\','/').toLowerCase(), runtime.replaceAll('\\','/').toLowerCase());
  assert.equal(fs.lstatSync(privateParent).isSymbolicLink(), false);
  assert.equal(fs.realpathSync(privateParent).replaceAll('\\','/').toLowerCase(), privateParent.replaceAll('\\','/').toLowerCase());
  assert.ok(fs.readFileSync(path.join(root, '.gitignore'), 'utf8').includes('/CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F06/'));
  guard(); providersOff(); const owner = ownership();
  if (command === 'prepare') {
    stage = 'reserve-new-actor'; assert.equal(fs.existsSync(privateDir), false);
    const password = process.env.ALGT_F06_BROWSER_PASSWORD;
    assert.ok(typeof password === 'string' && password.length >= 24 && password.length <= 128 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password) && /[^a-z0-9]/i.test(password));
    const authId = randomUUID();
    assert.equal(sql(`select ((select count(*) from auth.users where lower(email)=${q(email)} or raw_app_meta_data->>'f06_marker'=${q(marker)} or id=${q(authId)}::uuid)
      +(select count(*) from public.user_profiles where full_name=${q(fullName)} or display_name=${q(fullName)} or notes=${q(marker)} or auth_user_id=${q(authId)}::uuid))::text;`), '0');
    reservation = {marker,email,fullName,authId,nonce:randomUUID(),containerId,apiUrl,helperSha256,owner,createdAt:new Date().toISOString(),password};
    fs.mkdirSync(privateDir, {mode:0o700}); // non-recursive, exclusive new namespace
    acquireLock();
    journal = fs.openSync(journalFile, 'ax', 0o600);
    append('reservation-intent', {marker,email,authId,owner,helperSha256,containerId,apiUrl,nonce:reservation.nonce});
    exclusive(credentialsFile, reservation);
    append('private-credential-receipt-written', {file:'credentials-private.json',sha256:sha(fs.readFileSync(credentialsFile))});
  } else {
    assert.equal(fs.existsSync(path.join(privateDir,command+'-attempt-private.json')), false);
    openExisting(); assert.deepEqual(owner, reservation.owner);
  }
  // Permanent exclusive command intent is the retry guard; lock serializes commands.
  // A failed command deliberately retains this file; never delete it to retry.
  exclusive(path.join(privateDir, command+'-attempt-private.json'), {command,marker,nonce:reservation.nonce,helperSha256,at:new Date().toISOString()});
  append('command-start', {nonce:reservation.nonce});
  const before = projection(reservation.authId);
  append('preservation-preimage', {authId:reservation.authId,baseline:before});
  if (command !== 'prepare') {
    const original = JSON.parse(fs.readFileSync(path.join(privateDir,'prepare-private.json'),'utf8'));
    assert.equal(original.nonce, reservation.nonce); assert.equal(original.helperSha256, helperSha256);
    preserved(original.preservedBaseline, before, true);
  }
  // Read fixed local keys only after target/ownership/private-receipt guards.
  const keys = JSON.parse(fs.readFileSync(path.join(runtime, 'keys-private.json'), 'utf8'));
  assert.equal(keys.API_URL, apiUrl); assert.ok(typeof keys.SERVICE_ROLE_KEY === 'string' && keys.SERVICE_ROLE_KEY.length > 30);
  const boundedFetch = (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    assert.equal(url.origin, apiUrl);
    assert.ok(url.pathname === '/auth/v1/admin/users' || url.pathname === `/auth/v1/admin/users/${reservation.authId}` || url.pathname === `/auth/v1/admin/users/${owner.adminAuthId}`);
    return fetch(input, {...init, redirect:'error', signal:AbortSignal.timeout(15000)});
  };
  const admin = createClient(apiUrl, keys.SERVICE_ROLE_KEY, {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:boundedFetch}});
  stage = 'api-database-identity';
  const authority = await admin.auth.admin.getUserById(owner.adminAuthId);
  assert.equal(Boolean(authority.error), false); assert.equal(authority.data.user?.id, owner.adminAuthId); assert.equal(authority.data.user?.email, 'f06-admin@example.invalid');

  if (command === 'prepare') {
    stage = 'create-one-auth-user';
    append('auth-create-intent', {authId:reservation.authId,email,fullName,appMarker:marker,emailConfirm:true,sendsEmail:false,implicitProfileBootstrap:true});
    const created = await admin.auth.admin.createUser({id:reservation.authId,email,password:reservation.password,email_confirm:true,
      app_metadata:{f06_marker:marker},user_metadata:{full_name:fullName,display_name:fullName}});
    assert.equal(Boolean(created.error), false); assert.equal(created.data.user?.id, reservation.authId); assert.equal(created.data.user?.email, email);
    append('auth-create-result', {authId:reservation.authId,email});
    const bootstrap = ownState(); assert.equal(bootstrap.profiles.length, 1); assert.equal(bootstrap.assignments.length, 0);
    assert.equal(bootstrap.auth?.marker, marker); assert.equal(bootstrap.sessions.length, 0); assert.equal(bootstrap.refreshIds.length, 0);
    const profileId = numericId(bootstrap.profiles[0].id);
    append('profile-and-assignment-intent', {profileId,authId:reservation.authId,roleId:owner.roleId,companyId:owner.companyId,status:'active',mustChangePassword:false,scope:'global',newAssignmentOnly:true});
    stage = 'profile-and-assignment';
    const written = JSON.parse(sql(`
      do $guard$ begin if (select count(*) from public.user_profiles where id=${profileId} and auth_user_id=${q(reservation.authId)}::uuid and full_name=${q(fullName)})<>1
        or exists(select 1 from public.user_roles where user_profile_id=${profileId}) then raise exception 'OWNERSHIP_CHANGED'; end if; end $guard$;
      update public.user_profiles set full_name=${q(fullName)},display_name=${q(fullName)},notes=${q(marker)},status='active',must_change_password=false,owner_company_id=${owner.companyId},branch_id=null where id=${profileId} and auth_user_id=${q(reservation.authId)}::uuid;
      with inserted as (insert into public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
        values(${profileId},${owner.roleId},null,null,true) returning id)
      select json_build_object('profileId',${profileId},'assignmentId',(select id from inserted));`, true));
    numericId(written.assignmentId); append('profile-and-assignment-result', written);
    const state = ownState(); assertOwned(state, written); preserved(before, projection(reservation.authId)); providersOff();
    exclusive(path.join(privateDir,'prepare-private.json'), {marker,nonce:reservation.nonce,helperSha256,...written,authId:reservation.authId,owner,preservedBaseline:before,state});
    append('prepared', {...written,authId:reservation.authId,scope:'global',receiptSha256:sha(fs.readFileSync(path.join(privateDir,'prepare-private.json')))});
  } else {
    const prepared = JSON.parse(fs.readFileSync(path.join(privateDir,'prepare-private.json'),'utf8'));
    let state = ownState(); assertOwned(state, prepared);
    assert.equal(fs.existsSync(path.join(privateDir,'retire-private.json')), false);
    if (command === 'observe') {
      stage = 'observe-owned-browser-sessions';
      assert.ok(state.sessions.length > 0, 'No observed browser login');
      for (const session of state.sessions) { assert.match(session.id,/^[0-9a-f-]{36}$/i); assert.equal(session.userId,reservation.authId); }
      append('owned-browser-sessions-observed', {authId:reservation.authId,sessions:state.sessions,refreshIds:state.refreshIds});
    } else {
      stage = 'ban-owned-account';
      append('auth-ban-intent', {authId:reservation.authId,email,banDuration:'876000h',sessionsBefore:state.sessions,refreshIdsBefore:state.refreshIds});
      const banned = await admin.auth.admin.updateUserById(reservation.authId, {ban_duration:'876000h'});
      assert.equal(Boolean(banned.error), false); assert.equal(banned.data.user?.id, reservation.authId);
      state = ownState(); assert.equal(state.auth.banned, true); assertOwned(state, prepared);
      append('auth-ban-result', {authId:reservation.authId,banned:true,sessionsAfter:state.sessions,refreshIdsAfter:state.refreshIds});
      const sessionIds = state.sessions.map(row => { assert.match(row.id,/^[0-9a-f-]{36}$/i); assert.equal(row.userId,reservation.authId); return row.id; });
      const refreshIds = state.refreshIds.map(id => { assert.match(id,/^[0-9]+$/); return id; });
      append('exact-retirement-intent', {authId:reservation.authId,profileId:prepared.profileId,assignmentId:prepared.assignmentId,roleId:owner.roleId,sessionIds,refreshIds,accountRetained:true});
      stage = 'exact-retirement';
      const sid = sessionIds.length ? sessionIds.map(q).join(',') : 'null';
      const rid = refreshIds.length ? refreshIds.map(q).join(',') : 'null';
      const result = JSON.parse(sql(`
        do $guard$ begin if (select count(*) from public.user_profiles where id=${numericId(prepared.profileId)} and auth_user_id=${q(reservation.authId)}::uuid and notes=${q(marker)} and full_name=${q(fullName)})<>1
          or (select count(*) from public.user_roles where id=${numericId(prepared.assignmentId)} and user_profile_id=${prepared.profileId} and role_id=${owner.roleId} and owner_company_id is null and branch_id is null)<>1
          then raise exception 'OWNERSHIP_CHANGED'; end if; end $guard$;
        update public.user_roles set is_active=false where id=${prepared.assignmentId} and user_profile_id=${prepared.profileId} and role_id=${owner.roleId} and owner_company_id is null and branch_id is null;
        update public.user_profiles set status='inactive' where id=${prepared.profileId} and auth_user_id=${q(reservation.authId)}::uuid and notes=${q(marker)};
        with removed_refresh as (delete from auth.refresh_tokens where user_id=${q(reservation.authId)} and id in (${rid}) returning id),
        removed_sessions as (delete from auth.sessions where user_id=${q(reservation.authId)}::uuid and id in (${sid}) and (select count(*) from removed_refresh)>=0 returning id)
        select json_build_object('profileId',${prepared.profileId},'assignmentId',${prepared.assignmentId},
          'removedRefreshIds',(select coalesce(jsonb_agg(id::text order by id),'[]') from removed_refresh),
          'removedSessionIds',(select coalesce(jsonb_agg(id::text order by id),'[]') from removed_sessions));`, true));
      append('exact-retirement-result', result);
      assert.deepEqual([...result.removedRefreshIds].sort(), [...refreshIds].sort());
      assert.deepEqual([...result.removedSessionIds].sort(), [...sessionIds].sort());
      state = ownState(); assertOwned(state, prepared, true); assert.equal(state.auth.banned, true);
      assert.equal(state.sessions.length, 0); assert.equal(state.refreshIds.length, 0);
    }
    preserved(before, projection(reservation.authId)); providersOff();
    exclusive(path.join(privateDir,command+'-private.json'), {marker,nonce:reservation.nonce,helperSha256,authId:reservation.authId,state,preservedBaseline:true});
    append(command+'-complete', {authId:reservation.authId,sessionCount:state.sessions.length,accountRetained:true});
  }
  guard();
  append('command-success', {nonce:reservation.nonce});
  releaseSuccessfulLock();
  process.stdout.write(JSON.stringify({marker,command,state:'PASS_LOCAL_ACTOR_ONLY',email,authId:reservation.authId,privateDirectory:privateDir})+'\n');
}
try { await main(); }
catch {
  if (journal !== undefined) { try { append('failure-retained', {stage,redacted:true,noAutomaticRetry:true}); } catch { /* keep original evidence */ } }
  process.stderr.write(JSON.stringify({marker,command,state:'FAIL_RETAINED',stage,redacted:true})+'\n'); process.exitCode = 1;
} finally { if (journal !== undefined) fs.closeSync(journal); }
