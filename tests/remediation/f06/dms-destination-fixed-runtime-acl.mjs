// MAIN ONLY. Author-only until independently reviewed. Never import to inspect.
// One exact candidate function + its owner/ACL, in one explicit BEGIN/ROLLBACK.
// No application tables, authority stubs, authorized body call or committed SQL.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {exactDestinationDefinition, migrationSha256, signature, deniedRoles} from './dms-destination-fixed-runtime-acl-contract.mjs';

const root = path.resolve(import.meta.dirname, '../../..');
const evidence = 'C:/dev/agt-erp/CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F06';
const containerId = 'd9bd31376cfcfac9d27e9b7fa786c0c757fd23c43a00e9f460c06baedaab5029';
const containerName = 'f06-postgres-denial-canary-1761113-20261005';
const volumeName = 'f06-postgres-denial-canary-1761113-20261005-data';
const databaseName = 'f06_denial_canary_20261005';
const runNonce = '4fe65ee5-76f4-4a70-a70f-c9c25bf83f83';
const imageId = 'sha256:4c39816ce8d9303a3aba1161c842929c73a40c7109a9ef1b644582478e31832e';
const repoDigest = 'public.ecr.aws/supabase/postgres@sha256:4c39816ce8d9303a3aba1161c842929c73a40c7109a9ef1b644582478e31832e';
const originalHelperHash = 'c23d4e7fdba5acdc9e2b17c5b7701abe7170e6bd824d0c9d2e061493b4d376ad';
const priorPins = Object.freeze({
  'POSTGRES_DENIAL_CANARY_1761113_20261005.json': 'e463cac5543279be144ab07631967b857dd2dee18673bdd5afcb6cc52dedfb8e',
  'POSTGRES_DENIAL_CANARY_1761113_INTENTS_20261005.jsonl': 'fcd6ee5ea8df4cddb9a108d5c29e5a06b8712c25bdf521e47808cec2e1693dd4',
  'POSTGRES_DENIAL_CANARY_1761113_CONTINUATION_20261005.json': '2071c2a0f8519fb7b07e2890d76cc11e9b1112453134a7679ac5546e6a3785b9',
  'POSTGRES_DENIAL_CANARY_1761113_CONTINUATION_INTENTS_20261005.jsonl': '25012f4142458d26efc7464e99bba1562fc63f300c3388e603d4d1baefad5e4e',
});
const journalFile = path.join(evidence, 'DMS_DESTINATION_FIXED_RUNTIME_ACL_INTENTS_20261005.jsonl');
const receiptFile = path.join(evidence, 'DMS_DESTINATION_FIXED_RUNTIME_ACL_20261005.json');
const dockerExe = 'C:/Program Files/Docker/Docker/resources/bin/docker.exe';
const dockerHost = 'npipe:////./pipe/dockerDesktopLinuxEngine';
const dockerConfig = path.join(evidence, 'DMS_DESTINATION_ACL_ABSENT_DOCKER_CONFIG_20261005');
const migrationFile = path.join(root, 'supabase/migrations/20261004193518_f06_numbered_ai_intake_approval.sql');
const sha = value => createHash('sha256').update(value).digest('hex');
const startedAt = new Date().toISOString();
let journal, processFailure;
let stage = 'preflight', sequence = 0, previousEventHash = null;

function durable(fd, text) {
  const bytes = Buffer.from(text);
  for (let offset = 0; offset < bytes.length;) {
    const written = fs.writeSync(fd, bytes, offset, bytes.length - offset);
    assert.ok(written > 0); offset += written;
  }
  fs.fsyncSync(fd);
}
function append(event, details = {}) {
  const line = JSON.stringify({sequence: ++sequence, at: new Date().toISOString(), event, previousEventHash, details}) + '\n';
  durable(journal, line); previousEventHash = sha(line);
}
function priorUnchanged() {
  for (const [file, hash] of Object.entries(priorPins)) assert.equal(sha(fs.readFileSync(path.join(evidence, file))), hash);
  assert.equal(sha(fs.readFileSync(migrationFile)), migrationSha256);
  assert.equal(sha(fs.readFileSync(path.join(root, 'tests/remediation/f06/f06-postgres-denial-canary.mjs'))), originalHelperHash);
}
function events(file) {
  const lines = fs.readFileSync(path.join(evidence, file), 'utf8').split('\n');
  assert.equal(lines.pop(), ''); let previous = null;
  return lines.map((line, index) => {
    const value = JSON.parse(line); assert.equal(value.sequence, index + 1); assert.equal(value.previousEventHash, previous);
    previous = sha(line + '\n'); return value;
  });
}
function event(rows, name) { const found = rows.filter(row => row.event === name); assert.equal(found.length, 1); return found[0].details; }
function docker(label, args, {input, timeout = 10000} = {}) {
  stage = label; assert.equal(fs.existsSync(dockerConfig), false);
  const env = {};
  for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'Path', 'TEMP', 'TMP']) if (process.env[key] !== undefined) env[key] = process.env[key];
  const result = spawnSync(dockerExe, ['--config', dockerConfig, '--host', dockerHost, ...args], {
    input, encoding: 'utf8', env, shell: false, windowsHide: true, timeout, killSignal: 'SIGTERM', maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.signal || result.status !== 0) {
    processFailure = {stage, status: result.status, signal: result.signal, timedOut: result.error?.code === 'ETIMEDOUT',
      outputLimited: result.error?.code === 'ENOBUFS', stdoutSha256: sha(result.stdout ?? ''), stderrSha256: sha(result.stderr ?? '')};
    append('subprocess-failed', processFailure); throw Error('BOUNDED_PROCESS_FAILED');
  }
  return {stdout: result.stdout.trim(), stderr: result.stderr};
}
function metadata(label, args) { return JSON.parse(docker(label, args).stdout); }
function checkResources(expectedVolume, expectedStart) {
  const image = metadata('exact-image', ['image', 'inspect', imageId, '--format', '{"id":{{json .Id}},"digests":{{json .RepoDigests}},"arch":{{json .Architecture}},"os":{{json .Os}}}']);
  assert.equal(image.id, imageId); assert.ok(image.digests.includes(repoDigest)); assert.equal(image.arch, 'amd64'); assert.equal(image.os, 'linux');
  const volume = metadata('exact-volume', ['volume', 'inspect', volumeName, '--format', '{"name":{{json .Name}},"driver":{{json .Driver}},"scope":{{json .Scope}},"createdAt":{{json .CreatedAt}},"labels":{{json .Labels}},"options":{{json .Options}}}']);
  assert.deepEqual(volume, expectedVolume);
  const item = metadata('exact-container', ['container', 'inspect', containerId, '--format', '{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Image}},"labels":{{json .Config.Labels}},"network":{{json .HostConfig.NetworkMode}},"ports":{{json .HostConfig.PortBindings}},"publishAll":{{json .HostConfig.PublishAllPorts}},"binds":{{json .HostConfig.Binds}},"mounts":{{json .Mounts}},"privileged":{{json .HostConfig.Privileged}},"pidMode":{{json .HostConfig.PidMode}},"ipcMode":{{json .HostConfig.IpcMode}},"restartPolicy":{{json .HostConfig.RestartPolicy.Name}},"autoRemove":{{json .HostConfig.AutoRemove}},"running":{{json .State.Running}},"restarting":{{json .State.Restarting}},"oomKilled":{{json .State.OOMKilled}},"restartCount":{{json .RestartCount}},"startedAt":{{json .State.StartedAt}},"pid":{{json .State.Pid}}}']);
  assert.equal(item.id, containerId); assert.equal(item.name, `/${containerName}`); assert.equal(item.image, imageId);
  for (const [key, value] of Object.entries(expectedVolume.labels)) assert.equal(item.labels[key], value);
  assert.equal(item.network, 'none'); assert.equal(Object.keys(item.ports ?? {}).length, 0); assert.equal(item.publishAll, false);
  assert.equal((item.binds ?? []).length, 0); assert.equal(item.mounts.length, 1);
  assert.equal(item.mounts[0].Type, 'volume'); assert.equal(item.mounts[0].Name, volumeName); assert.equal(item.mounts[0].Destination, '/var/lib/postgresql/data'); assert.equal(item.mounts[0].RW, true);
  assert.equal(item.privileged, false); assert.equal(item.pidMode, ''); assert.equal(item.ipcMode, 'private'); assert.equal(item.restartPolicy, 'no');
  assert.equal(item.autoRemove, false); assert.equal(item.running, true); assert.equal(item.restarting, false); assert.equal(item.oomKilled, false); assert.equal(item.restartCount, 0);
  assert.equal(item.pid, expectedStart.hostPid); assert.equal(item.startedAt, expectedStart.startedAt);
  return {id: item.id, hostPid: item.pid, startedAt: item.startedAt};
}
function logs(label) {
  const result = docker(label, ['logs', '--timestamps', containerId]); const value = result.stdout + '\n' + result.stderr;
  const crash = /segmentation fault|signal 11|PANIC:|terminating any other active server processes|database system was interrupted|database system is in recovery mode|automatic recovery in progress|redo starts at/i.test(value);
  const observed = {sha256: sha(value), bytes: Buffer.byteLength(value), crash}; append('logs-observed', observed); assert.equal(crash, false); return observed;
}
function sql(label, input) {
  const result = docker(label, ['exec', '-i', '--user', 'postgres', containerId, 'psql', '-X', '-w', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', '5432', '-U', 'postgres', '-d', databaseName], {input, timeout: 30000});
  return result.stdout.split(/\r?\n/).map(line => JSON.parse(line));
}
const deadlines = "set local statement_timeout='5s';set local lock_timeout='2s';set local idle_in_transaction_session_timeout='10s';set local transaction_timeout='20s';";
const postgresGuard = `do $observer$ begin if session_user<>'postgres' or current_user<>'postgres' then raise exception 'WRONG_OBSERVER_PRINCIPAL'; end if; end $observer$;`;
const minimalIdentitySql = `jsonb_build_object('sessionUser',session_user,'currentUser',current_user,'pid',pg_backend_pid(),'postmasterEpoch',extract(epoch from pg_postmaster_start_time())::text,'inRecovery',pg_is_in_recovery())`;
// This privileged projection is never evaluated with a reserved role active.
const baselineStateSql = `jsonb_build_object('identity',jsonb_build_object(
 'database',current_database(),'databaseOid',(select oid from pg_database where datname=current_database()),'owner',(select pg_get_userbyid(datdba) from pg_database where datname=current_database()),
 'sessionUser',session_user,'currentUser',current_user,'pid',pg_backend_pid(),'postmasterEpoch',extract(epoch from pg_postmaster_start_time())::text,'inRecovery',pg_is_in_recovery(),
 'serverVersion',current_setting('server_version_num'),'hints',current_setting('supautils.hint_roles'),'hintGucRegistered',exists(select 1 from pg_settings where name='supautils.hint_roles' and vartype='string'),
 'preload',current_setting('session_preload_libraries'),'sharedPreload',current_setting('shared_preload_libraries'),'reservedRoles',current_setting('supautils.reserved_roles'),'logDestination',current_setting('log_destination'),'loggingCollector',current_setting('logging_collector'),
 'roleHash',(select md5(jsonb_agg(to_jsonb(r) order by r.oid)::text) from pg_roles r),'membershipHash',(select md5(coalesce(jsonb_agg(to_jsonb(m) order by m.roleid,m.member,m.grantor),'[]'::jsonb)::text) from pg_auth_members m)),
 'tables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname !~ '^pg_' and n.nspname<>'information_schema' and c.relkind in ('r','p','m','f')),
 'functions',(select jsonb_agg(jsonb_build_object('oid',p.oid,'name',p.proname,'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'acl',p.proacl,'fingerprint',md5(to_jsonb(p)::text),
 'exactBody',case p.proname when 'f06_denial_sql_invoker' then p.prosrc='select 1' and l.lanname='sql' when 'f06_denial_plpgsql_definer' then p.prosrc='begin return 1; end' and l.lanname='plpgsql' else false end,
 'exactSignature',p.pronargs=0 and p.prorettype='int4'::regtype and not p.proretset,'exactConfig',p.proconfig=array['search_path=""']::text[]) order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang where n.nspname='public'),
 'roles',(select jsonb_agg(jsonb_build_object('name',r.rolname,'login',r.rolcanlogin,'super',r.rolsuper,'schemaUsage',has_schema_privilege(r.oid,'public','usage'),'sqlExecute',has_function_privilege(r.oid,'public.f06_denial_sql_invoker()','execute'),'plpgsqlExecute',has_function_privilege(r.oid,'public.f06_denial_plpgsql_definer()','execute')) order by r.rolname) from pg_roles r where r.rolname in ('anon','authenticated','service_role')))`;
const absentSql = `to_regnamespace('erp_private') is null`;
const schemaHashSql = `(select encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_object('oid',oid,'name',nspname,'owner',nspowner,'acl',nspacl) order by nspname),'[]'::jsonb)::text,'UTF8')),'hex') from pg_namespace where nspname !~ '^pg_' and nspname<>'information_schema')`;
const snapshotSql = `select jsonb_build_object('state',${baselineStateSql},'privateSchemaAbsent',${absentSql},'schemaSha256',${schemaHashSql},'functionBodyChecks',current_setting('check_function_bodies'));`;
function observe(label) { const rows = sql(label, `begin read only;${deadlines}\n${postgresGuard}\n${snapshotSql}\nrollback;`); assert.equal(rows.length, 1); return rows[0]; }
function checkState(state, expected) {
  const {pid, ...identity} = state.identity, {pid: oldPid, ...oldIdentity} = expected.identity;
  assert.ok(Number.isInteger(pid) && Number.isInteger(oldPid)); assert.deepEqual(identity, oldIdentity);
  assert.equal(identity.database, databaseName); assert.equal(identity.databaseOid, '16663'); assert.equal(identity.owner, 'postgres'); assert.equal(identity.currentUser, 'postgres'); assert.equal(identity.sessionUser, 'postgres');
  assert.equal(identity.inRecovery, false); assert.equal(identity.preload, 'supautils'); assert.equal(identity.hintGucRegistered, true);
  assert.deepEqual(identity.hints.split(',').map(value => value.trim()).sort(), ['anon', 'authenticated', 'service_role']);
  assert.equal(state.tables, 0); assert.equal(state.functions.length, 2); assert.deepEqual(state.functions, expected.functions); assert.deepEqual(state.roles, expected.roles);
}
function finalReceipt(value) { const fd = fs.openSync(receiptFile, 'wx', 0o600); try { durable(fd, JSON.stringify(value, null, 2) + '\n'); } finally { fs.closeSync(fd); } }

try {
  assert.equal(process.argv.length, 2); assert.equal(process.platform, 'win32');
  assert.equal(fs.realpathSync(root).replaceAll('\\', '/'), 'C:/dev/agt-erp-f06'); assert.equal(fs.realpathSync(evidence).replaceAll('\\', '/'), evidence);
  assert.equal(process.env.ALGT_F06_LOCAL_TARGET, 'dms-destination-fixed-runtime-acl'); assert.equal(process.env.ALGT_F06_DMS_DESTINATION_FIXED_RUNTIME_ACL, '1');
  priorUnchanged();
  const held = exactDestinationDefinition(fs.readFileSync(migrationFile));
  const prior = JSON.parse(fs.readFileSync(path.join(evidence, 'POSTGRES_DENIAL_CANARY_1761113_CONTINUATION_20261005.json'), 'utf8'));
  assert.equal(prior.state, 'PASS_SQL_CANARY_ONLY'); assert.equal(prior.containerId, containerId); assert.equal(prior.containerName, containerName); assert.equal(prior.volumeName, volumeName); assert.equal(prior.databaseName, databaseName);
  assert.equal(prior.runNonce, runNonce); assert.equal(prior.imageId, imageId); assert.equal(prior.repoDigest, repoDigest); assert.equal(prior.logs.after.crash, false);
  assert.equal(prior.journalSha256, priorPins['POSTGRES_DENIAL_CANARY_1761113_CONTINUATION_INTENTS_20261005.jsonl']);
  assert.equal(prior.cases.length, 6); assert.ok(prior.cases.every(row => row.sqlstate === '42501'));
  const originalEvents = events('POSTGRES_DENIAL_CANARY_1761113_INTENTS_20261005.jsonl');
  const qualifiedEvents = events('POSTGRES_DENIAL_CANARY_1761113_CONTINUATION_INTENTS_20261005.jsonl');
  const originalVolume = event(originalEvents, 'volume-created'), originalStart = event(originalEvents, 'startup-qualified');
  assert.equal(originalVolume.labels['org.algt.f06.nonce'], runNonce); assert.equal(originalVolume.labels['org.algt.f06.helper-sha256'], originalHelperHash);
  assert.equal(originalStart.containerId, containerId); assert.equal(originalStart.logs.crash, false);
  const qualified = event(qualifiedEvents, 'exact-preconditions-verified');
  assert.equal(qualified.resources.id, containerId); assert.equal(qualified.resources.hostPid, originalStart.hostPid); assert.equal(qualified.resources.startedAt, originalStart.startedAt);
  assert.equal(event(qualifiedEvents, 'continuation-qualified').caseCount, 6);
  assert.equal(fs.existsSync(receiptFile), false); journal = fs.openSync(journalFile, 'ax', 0o600);
  append('reserved', {startedAt, containerId, databaseName, runNonce, imageId, repoDigest, priorPins, migrationSha256, ddlSha256: held.ddlSha256, bodySha256: held.bodySha256,
    helperSha256: sha(fs.readFileSync(new URL(import.meta.url))), contractSha256: sha(fs.readFileSync(new URL('./dms-destination-fixed-runtime-acl-contract.mjs', import.meta.url))),
    testOnlySchemaAccess: 'Transaction-only USAGE for anon/authenticated/service_role; not production schema parity or an application permission change.'});
  const resources = checkResources(originalVolume, originalStart), beforeLogs = logs('logs-before');
  const before = observe('baseline-before'); checkState(before.state, prior.after); assert.equal(before.privateSchemaAbsent, true); assert.match(before.schemaSha256, /^[a-f0-9]{64}$/); assert.equal(before.functionBodyChecks, 'on');
  append('baseline-verified', {resources, before, beforeLogs});

  const functionMetadataSql = `select jsonb_build_object('kind','candidate','pid',pg_backend_pid(),'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'config',p.proconfig,'language',l.lanname,
    'exactSignature',p.pronargs=1 and p.proargtypes[0]='jsonb'::regtype and p.prorettype='jsonb'::regtype and not p.proretset,
    'bodySha256',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),
    'acl',(select jsonb_agg(jsonb_build_object('grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable) order by a.grantee::regrole::text,a.privilege_type) from aclexplode(p.proacl) a),
    'anon',has_function_privilege('anon',p.oid,'execute'),'human',has_function_privilege('authenticated',p.oid,'execute'),'service',has_function_privilege('service_role',p.oid,'execute'),
    'schemaUsage',(select jsonb_agg(jsonb_build_object('role',r.role_name,'usage',has_schema_privilege(r.role_name,'erp_private','usage')) order by r.role_name) from unnest(array['anon','authenticated','service_role']) as r(role_name)))
    from pg_proc p join pg_language l on l.oid=p.prolang where p.oid='${signature}'::regprocedure;`;
  const deniedSql = deniedRoles.map(role => `set local role ${role};
do $denial$
declare observed text; observed_message text;
begin
 if session_user<>'postgres' or current_user<>'${role}' then raise exception 'WRONG_DENIAL_PRINCIPAL'; end if;
 if not has_schema_privilege(current_user,'erp_private','usage') or has_function_privilege(current_user,'${signature}','execute') then raise exception 'WRONG_DENIAL_PRIVILEGES'; end if;
 begin
  perform erp_private.ai_approval_destination_snapshot('{}'::jsonb);
  raise exception 'EXPECTED_FUNCTION_EXECUTE_DENIAL';
 exception when insufficient_privilege then
  get stacked diagnostics observed=returned_sqlstate,observed_message=message_text;
  if observed<>'42501' or observed_message<>'permission denied for function ai_approval_destination_snapshot' then raise exception 'WRONG_DENIAL_ERROR'; end if;
  perform set_config('f06_destination_acl.sqlstate',observed,true); perform set_config('f06_destination_acl.message',observed_message,true);
 end;
end $denial$;
select jsonb_build_object('kind','denial','role','${role}','sqlstate',current_setting('f06_destination_acl.sqlstate'),'message',current_setting('f06_destination_acl.message'),'identity',${minimalIdentitySql});
reset role;`).join('\n');
  // No dependency stubs and no check_function_bodies override. Creation failure
  // is a failure, never grounds for substituting or invoking another function.
  const probeSql = `begin;${deadlines}\n${postgresGuard}\n${snapshotSql}
do $absent$ begin if to_regnamespace('erp_private') is not null then raise exception 'PROBE_SCHEMA_ALREADY_EXISTS'; end if; end $absent$;
do $validation$ begin if current_setting('check_function_bodies')<>'on' then raise exception 'FUNCTION_BODY_VALIDATION_DISABLED'; end if; end $validation$;
create schema erp_private authorization postgres;
grant usage on schema erp_private to anon,authenticated,service_role;
${held.ddl}
${functionMetadataSql}
${deniedSql}
${postgresGuard}
${snapshotSql}
rollback;
${postgresGuard}
${snapshotSql}`;
  append('candidate-acl-probe-intent', {signature, deniedRoles, sqlSha256: sha(probeSql), exactCandidateDdlSha256: held.ddlSha256, rollbackOnly: true, authorizedBodyExecutions: 0});
  const rows = sql('candidate-acl-probe', probeSql);
  assert.equal(rows.length, 6); checkState(rows[0].state, before.state); assert.equal(rows[0].privateSchemaAbsent, true); assert.equal(rows[0].functionBodyChecks, 'on');
  const backend = rows[0].state.identity, candidate = rows[1], cases = rows.slice(2, 4);
  assert.equal(candidate.kind, 'candidate'); assert.equal(candidate.pid, backend.pid); assert.equal(candidate.owner, 'postgres'); assert.equal(candidate.definer, true);
  assert.deepEqual(candidate.config, ['search_path=""']); assert.equal(candidate.language, 'plpgsql'); assert.equal(candidate.exactSignature, true); assert.equal(candidate.bodySha256, held.bodySha256);
  assert.equal(candidate.anon, false); assert.equal(candidate.service, false); assert.equal(candidate.human, true);
  assert.deepEqual(candidate.acl, [{grantee: 'authenticated', grantor: 'postgres', privilege: 'EXECUTE', grantable: false}, {grantee: 'postgres', grantor: 'postgres', privilege: 'EXECUTE', grantable: false}]);
  assert.deepEqual(candidate.schemaUsage, ['anon', 'authenticated', 'service_role'].map(role => ({role, usage: true})));
  assert.deepEqual(cases.map(row => row.role), [...deniedRoles]);
  for (const row of cases) {
    assert.equal(row.kind, 'denial'); assert.equal(row.sqlstate, '42501'); assert.equal(row.message, 'permission denied for function ai_approval_destination_snapshot');
    assert.deepEqual(row.identity, {sessionUser: 'postgres', currentUser: row.role, pid: backend.pid, postmasterEpoch: backend.postmasterEpoch, inRecovery: false});
  }
  checkState(rows[4].state, before.state); assert.equal(rows[4].state.identity.pid, backend.pid); assert.equal(rows[4].privateSchemaAbsent, false); assert.equal(rows[4].functionBodyChecks, 'on');
  checkState(rows[5].state, before.state); assert.equal(rows[5].state.identity.pid, backend.pid); assert.equal(rows[5].privateSchemaAbsent, true); assert.equal(rows[5].schemaSha256, before.schemaSha256); assert.equal(rows[5].functionBodyChecks, 'on');
  append('candidate-acl-and-rollback-observed', {candidate, cases, sameBackend: true, schemaAbsentAfterRollback: true});
  const after = observe('independent-after-rollback'); checkState(after.state, before.state); assert.equal(after.privateSchemaAbsent, true); assert.equal(after.schemaSha256, before.schemaSha256); assert.equal(after.functionBodyChecks, 'on');
  assert.deepEqual(checkResources(originalVolume, originalStart), resources); const afterLogs = logs('logs-after'); priorUnchanged();
  append('qualified', {caseCount: 2, originalCanaryFunctionsUnchanged: true, rolesAndMembershipUnchanged: true, priorEvidenceUnchanged: true, schemaAbsentAfterRollback: true});
  finalReceipt({state: 'PASS_EXACT_CANDIDATE_FUNCTION_EXECUTE_ACL_ONLY', startedAt, completedAt: new Date().toISOString(), containerId, containerName, volumeName, databaseName, runNonce, imageId, repoDigest,
    priorPins, migrationSha256, ddlSha256: held.ddlSha256, bodySha256: held.bodySha256, candidate, cases, after, logs: {before: beforeLogs, after: afterLogs}, journalSha256: sha(fs.readFileSync(journalFile)),
    committedSql: false, authorizedBodyExecutions: 0, applicationTablesCreated: 0, authorityStubsCreated: 0,
    testOnlySchemaAccess: 'New empty erp_private schema with transaction-only USAGE to anon/authenticated/service_role; this is not production schema parity or an application permission change.',
    limitation: 'Exact candidate function body/owner/EXECUTE ACL on the qualified .113 image only. NOT HTTP, Auth, full AI51, main runtime or full F06 acceptance. No authorized body was executed. Transaction rollback may still advance internal OID/WAL/log bookkeeping; no bit-identical server claim.'});
  process.stdout.write('PASS_EXACT_CANDIDATE_FUNCTION_EXECUTE_ACL_ONLY; two denials; explicit rollback and independent schema-absence proof.\n');
} catch {
  // ON_ERROR_STOP closes an uncommitted failed session; PostgreSQL rolls it back.
  // A timeout/crash does NOT prove backend cancellation or rollback completion.
  // Preserve failure for main-only inspection; never reconnect/retry or repair.
  if (journal !== undefined) try {
    append('failed-retained', {stage, processFailure: processFailure ?? null});
    finalReceipt({state: 'FAIL_RETAINED', startedAt, stage, containerId, databaseName, priorPins, migrationSha256, processFailure: processFailure ?? null,
      journalSha256: sha(fs.readFileSync(journalFile)), limitation: 'No qualification or rollback-completion claim. No automatic retry, stubs, weakened validation, resource deletion or evidence overwrite.'});
  } catch { /* Preserve existing evidence even if failure reporting cannot finish. */ }
  process.stderr.write('DMS_DESTINATION_ACL_FAILED_CLOSED; no qualification; main-only reconciliation required.\n'); process.exitCode = 1;
} finally { if (journal !== undefined) fs.closeSync(journal); }
