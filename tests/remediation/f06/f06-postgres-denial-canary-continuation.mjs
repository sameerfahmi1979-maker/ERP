// MAIN ONLY; AUTHOR-ONLY until independent review. Never import to inspect.
// Required: ALGT_F06_LOCAL_TARGET=postgres-denial-canary-continuation AND
// ALGT_F06_POSTGRES_DENIAL_CONTINUATION=1. No arguments or retry mode.
// This separately authorized observation-only continuation fixes the ORIGINAL
// observer's unreadable GUC projection, not product privileges. It never runs
// the original helper and never modifies its files/receipts/resources.
// It operates ONLY on the exact retained synthetic instance pinned below.
// No image fetch/start/stop/create/remove, schema/data/role/ACL changes or repair.
// Every SQL transaction is READ ONLY and ends ROLLBACK. Six denied calls only.
// Privileged GUC/catalogue metadata is read as postgres before/after; reserved
// roles expose only the minimal public identity expression below.
// Sources: https://www.postgresql.org/docs/17/functions-info.html
// https://www.postgresql.org/docs/17/runtime-config-client.html
// https://github.com/supabase/supautils/pull/190
// No HTTP/PostgREST/Auth/RLS application, migration or full F06 acceptance claim.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../../..');
const evidence = 'C:/dev/agt-erp/CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F06';
const containerId = 'd9bd31376cfcfac9d27e9b7fa786c0c757fd23c43a00e9f460c06baedaab5029';
const containerName = 'f06-postgres-denial-canary-1761113-20261005';
const volumeName = 'f06-postgres-denial-canary-1761113-20261005-data';
const databaseName = 'f06_denial_canary_20261005';
const runNonce = '4fe65ee5-76f4-4a70-a70f-c9c25bf83f83';
const imageId = 'sha256:4c39816ce8d9303a3aba1161c842929c73a40c7109a9ef1b644582478e31832e';
const repoDigest = 'public.ecr.aws/supabase/postgres@sha256:4c39816ce8d9303a3aba1161c842929c73a40c7109a9ef1b644582478e31832e';
const oldHelperHash = 'c23d4e7fdba5acdc9e2b17c5b7701abe7170e6bd824d0c9d2e061493b4d376ad';
const priorPins = Object.freeze({
  'POSTGRES_DENIAL_CANARY_1761113_20261005.json': 'e463cac5543279be144ab07631967b857dd2dee18673bdd5afcb6cc52dedfb8e',
  'POSTGRES_DENIAL_CANARY_1761113_INTENTS_20261005.jsonl': 'fcd6ee5ea8df4cddb9a108d5c29e5a06b8712c25bdf521e47808cec2e1693dd4',
});
const journalFile = path.join(evidence, 'POSTGRES_DENIAL_CANARY_1761113_CONTINUATION_INTENTS_20261005.jsonl');
const receiptFile = path.join(evidence, 'POSTGRES_DENIAL_CANARY_1761113_CONTINUATION_20261005.json');
const dockerExe = 'C:/Program Files/Docker/Docker/resources/bin/docker.exe';
const dockerHost = 'npipe:////./pipe/dockerDesktopLinuxEngine';
const dockerConfig = path.join(evidence, 'F06_CANARY_1761113_CONTINUATION_ABSENT_DOCKER_CONFIG_20261005');
const roles = Object.freeze(['anon', 'authenticated', 'service_role']);
const functions = Object.freeze(['f06_denial_sql_invoker', 'f06_denial_plpgsql_definer']);
const sha = value => createHash('sha256').update(value).digest('hex');
let journal;
let stage = 'preflight';
let sequence = 0;
let previousEventHash = null;
let processFailure;
const startedAt = new Date().toISOString();

function durable(fd, text) {
  const bytes = Buffer.from(text);
  let offset = 0;
  while (offset < bytes.length) {
    const written = fs.writeSync(fd, bytes, offset, bytes.length - offset);
    assert.ok(written > 0);
    offset += written;
  }
  fs.fsyncSync(fd);
}
function append(event, details = {}) {
  const line = JSON.stringify({sequence:++sequence,at:new Date().toISOString(),event,previousEventHash,details})+'\n';
  durable(journal,line);
  previousEventHash = sha(line);
}
function docker(label, args, {input, timeout = 10000} = {}) {
  stage = label;
  assert.equal(fs.existsSync(dockerConfig), false);
  const env = {};
  for (const key of ['SystemRoot','WINDIR','PATH','Path','TEMP','TMP']) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  const result = spawnSync(dockerExe,['--config',dockerConfig,'--host',dockerHost,...args], {
    input,encoding:'utf8',env,shell:false,windowsHide:true,timeout,
    killSignal:'SIGTERM',maxBuffer:8*1024*1024,
  });
  if (result.error || result.signal || result.status !== 0) {
    processFailure = {stage,status:result.status,signal:result.signal,
      timedOut:result.error?.code === 'ETIMEDOUT',outputLimited:result.error?.code === 'ENOBUFS',
      stdoutSha256:sha(result.stdout??''),stderrSha256:sha(result.stderr??'')};
    append('subprocess-failed',processFailure);
    throw new Error('BOUNDED_PROCESS_FAILED');
  }
  return {stdout:result.stdout.trim(),stderr:result.stderr};
}
function metadata(label,args) { return JSON.parse(docker(label,args).stdout); }
function priorUnchanged() {
  for (const [file,hash] of Object.entries(priorPins)) assert.equal(sha(fs.readFileSync(path.join(evidence,file))),hash);
  assert.equal(sha(fs.readFileSync(path.join(root,'tests/remediation/f06/f06-postgres-denial-canary.mjs'))),oldHelperHash);
}
function checkResources(expectedVolume, expectedStart) {
  const image = metadata('exact-image-metadata',['image','inspect',imageId,'--format',
    '{"id":{{json .Id}},"digests":{{json .RepoDigests}},"arch":{{json .Architecture}},"os":{{json .Os}}}']);
  assert.equal(image.id,imageId); assert.ok(image.digests.includes(repoDigest));
  assert.equal(image.arch,'amd64'); assert.equal(image.os,'linux');
  const volume = metadata('exact-volume-metadata',['volume','inspect',volumeName,'--format',
    '{"name":{{json .Name}},"driver":{{json .Driver}},"scope":{{json .Scope}},"createdAt":{{json .CreatedAt}},"labels":{{json .Labels}},"options":{{json .Options}}}']);
  assert.deepEqual(volume,expectedVolume);
  const item = metadata('exact-container-metadata',['container','inspect',containerId,'--format',
    '{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Image}},"labels":{{json .Config.Labels}},"network":{{json .HostConfig.NetworkMode}},"ports":{{json .HostConfig.PortBindings}},"publishAll":{{json .HostConfig.PublishAllPorts}},"binds":{{json .HostConfig.Binds}},"mounts":{{json .Mounts}},"privileged":{{json .HostConfig.Privileged}},"pidMode":{{json .HostConfig.PidMode}},"ipcMode":{{json .HostConfig.IpcMode}},"restartPolicy":{{json .HostConfig.RestartPolicy.Name}},"autoRemove":{{json .HostConfig.AutoRemove}},"running":{{json .State.Running}},"restarting":{{json .State.Restarting}},"oomKilled":{{json .State.OOMKilled}},"restartCount":{{json .RestartCount}},"startedAt":{{json .State.StartedAt}},"pid":{{json .State.Pid}}}']);
  assert.equal(item.id,containerId); assert.equal(item.name,`/${containerName}`); assert.equal(item.image,imageId);
  for (const [key,value] of Object.entries(expectedVolume.labels)) assert.equal(item.labels[key],value);
  assert.equal(item.network,'none'); assert.equal(Object.keys(item.ports??{}).length,0);
  assert.equal(item.publishAll,false); assert.equal((item.binds??[]).length,0);
  assert.equal(item.mounts.length,1); assert.equal(item.mounts[0].Type,'volume');
  assert.equal(item.mounts[0].Name,volumeName); assert.equal(item.mounts[0].Destination,'/var/lib/postgresql/data');
  assert.equal(item.mounts[0].RW,true); assert.equal(item.privileged,false);
  assert.equal(item.pidMode,''); assert.equal(item.ipcMode,'private'); assert.equal(item.restartPolicy,'no');
  assert.equal(item.autoRemove,false); assert.equal(item.running,true); assert.equal(item.restarting,false);
  assert.equal(item.oomKilled,false); assert.equal(item.restartCount,0);
  assert.equal(item.pid,expectedStart.hostPid); assert.equal(item.startedAt,expectedStart.startedAt);
  return {id:item.id,hostPid:item.pid,startedAt:item.startedAt};
}
function logs(label) {
  const result = docker(label,['logs','--timestamps',containerId]);
  const value = result.stdout+'\n'+result.stderr;
  const crash = /segmentation fault|signal 11|PANIC:|terminating any other active server processes|database system was interrupted|database system is in recovery mode|automatic recovery in progress|redo starts at/i.test(value);
  const resultMetadata = {sha256:sha(value),bytes:Buffer.byteLength(value),crash};
  append('all-owned-logs-observed',resultMetadata);
  assert.equal(crash,false);
  return resultMetadata;
}
function sql(label, body) {
  const prefix = "set statement_timeout='5s';set lock_timeout='2s';set idle_in_transaction_session_timeout='10s';set transaction_timeout='20s';\nbegin read only;\n";
  const result = docker(label,['exec','-i','--user','postgres',containerId,
    'psql','-X','-w','-qAt','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','5432','-U','postgres','-d',databaseName],
  {input:prefix+body+'\nrollback;\n',timeout:30000});
  return result.stdout.split(/\r?\n/).map(line => JSON.parse(line));
}

// This expression is the ONLY identity projection used while a reserved role
// is active. No catalogue/settings visibility privilege is required or added.
const minimalIdentitySql = `jsonb_build_object('sessionUser',session_user,'currentUser',current_user,
  'pid',pg_backend_pid(),'postmasterEpoch',extract(epoch from pg_postmaster_start_time())::text,
  'inRecovery',pg_is_in_recovery())`;
// Full observer metadata executes ONLY while current_user = session_user = postgres.
const privilegedStateSql = `jsonb_build_object('identity',jsonb_build_object(
  'database',current_database(),'databaseOid',(select oid from pg_database where datname=current_database()),
  'owner',(select pg_get_userbyid(datdba) from pg_database where datname=current_database()),
  'sessionUser',session_user,'currentUser',current_user,'pid',pg_backend_pid(),
  'postmasterEpoch',extract(epoch from pg_postmaster_start_time())::text,'inRecovery',pg_is_in_recovery(),
  'serverVersion',current_setting('server_version_num'),'hints',current_setting('supautils.hint_roles'),
  'hintGucRegistered',exists(select 1 from pg_settings where name='supautils.hint_roles' and vartype='string'),
  'preload',current_setting('session_preload_libraries'),'sharedPreload',current_setting('shared_preload_libraries'),
  'reservedRoles',current_setting('supautils.reserved_roles'),
  'logDestination',current_setting('log_destination'),'loggingCollector',current_setting('logging_collector'),
  'roleHash',(select md5(jsonb_agg(to_jsonb(r) order by r.oid)::text) from pg_roles r),
  'membershipHash',(select md5(coalesce(jsonb_agg(to_jsonb(m) order by m.roleid,m.member,m.grantor),'[]'::jsonb)::text) from pg_auth_members m)),
  'tables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname !~ '^pg_' and n.nspname<>'information_schema' and c.relkind in ('r','p','m','f')),
  'functions',(select jsonb_agg(jsonb_build_object('oid',p.oid,'name',p.proname,'owner',pg_get_userbyid(p.proowner),
    'definer',p.prosecdef,'acl',p.proacl,'fingerprint',md5(to_jsonb(p)::text),
    'exactBody',case p.proname when 'f06_denial_sql_invoker' then p.prosrc='select 1' and l.lanname='sql'
      when 'f06_denial_plpgsql_definer' then p.prosrc='begin return 1; end' and l.lanname='plpgsql' else false end,
    'exactSignature',p.pronargs=0 and p.prorettype='int4'::regtype and not p.proretset,
    'exactConfig',p.proconfig=array['search_path=""']::text[]) order by p.proname)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang where n.nspname='public'),
  'roles',(select jsonb_agg(jsonb_build_object('name',r.rolname,'login',r.rolcanlogin,'super',r.rolsuper,
    'schemaUsage',has_schema_privilege(r.oid,'public','usage'),
    'sqlExecute',has_function_privilege(r.oid,'public.f06_denial_sql_invoker()','execute'),
    'plpgsqlExecute',has_function_privilege(r.oid,'public.f06_denial_plpgsql_definer()','execute')) order by r.rolname)
    from pg_roles r where r.rolname in ('anon','authenticated','service_role')))`;
const postgresGuardSql = `do $observer$ begin
  if session_user<>'postgres' or current_user<>'postgres' then raise exception 'WRONG_OBSERVER_PRINCIPAL'; end if;
end $observer$;`;
const caseSql = roles.flatMap(role => functions.map(fn => `
set local role ${role};
do $denial$
declare observed text; observed_message text;
begin
  if session_user<>'postgres' or current_user<>'${role}' then raise exception 'WRONG_DENIAL_PRINCIPAL'; end if;
  if not has_schema_privilege(current_user,'public','usage')
     or has_function_privilege(current_user,'public.${fn}()','execute') then
    raise exception 'WRONG_DENIAL_PRIVILEGES';
  end if;
  begin
    perform public.${fn}();
    raise exception 'EXPECTED_EXECUTE_DENIAL';
  exception when insufficient_privilege then
    get stacked diagnostics observed=returned_sqlstate,observed_message=message_text;
    if observed<>'42501' or observed_message<>'permission denied for function ${fn}' then
      raise exception 'WRONG_DENIAL_ERROR';
    end if;
    perform set_config('f06_canary.observed',observed,true);
  end;
end $denial$;
select jsonb_build_object('kind','denial','role','${role}','function','${fn}',
  'sqlstate',current_setting('f06_canary.observed'),'identity',${minimalIdentitySql});
reset role;
`)).join('\n');
const canarySql = `${postgresGuardSql}
select jsonb_build_object('kind','before','state',${privilegedStateSql});
${caseSql}
${postgresGuardSql}
select jsonb_build_object('kind','after','state',${privilegedStateSql});`;

function checkState(state, original, expected) {
  const {pid,...identity} = state.identity;
  const {pid:originalPid,...originalIdentity} = original.identity;
  assert.ok(Number.isInteger(pid) && Number.isInteger(originalPid));
  assert.deepEqual(identity,originalIdentity);
  assert.equal(identity.currentUser,'postgres'); assert.equal(identity.sessionUser,'postgres');
  assert.equal(identity.databaseOid,'16663'); assert.equal(identity.inRecovery,false);
  assert.equal(identity.preload,'supautils'); assert.equal(identity.hintGucRegistered,true);
  assert.deepEqual(identity.hints.split(',').map(s=>s.trim()).sort(),[...roles].sort());
  assert.equal(state.tables,0); assert.deepEqual(state.roles,original.roles);
  assert.equal(state.functions.length,2);
  assert.deepEqual(state.functions.map(({fingerprint,exactBody,exactSignature,exactConfig,...fn}) => {
    assert.match(fingerprint,/^[0-9a-f]{32}$/);
    assert.equal(exactBody,true); assert.equal(exactSignature,true); assert.equal(exactConfig,true);
    return fn;
  }),original.functions);
  if (expected) {
    assert.deepEqual(state.functions,expected.functions);
    assert.deepEqual(state.roles,expected.roles);
  }
}
function finalReceipt(value) {
  const fd = fs.openSync(receiptFile,'wx',0o600);
  try { durable(fd,JSON.stringify(value,null,2)+'\n'); } finally { fs.closeSync(fd); }
}

try {
  assert.equal(process.argv.length,2);
  assert.equal(process.platform,'win32');
  assert.equal(fs.realpathSync(root).replaceAll('\\','/'),'C:/dev/agt-erp-f06');
  assert.equal(fs.realpathSync(evidence).replaceAll('\\','/'),evidence);
  assert.equal(process.env.ALGT_F06_LOCAL_TARGET,'postgres-denial-canary-continuation');
  assert.equal(process.env.ALGT_F06_POSTGRES_DENIAL_CONTINUATION,'1');
  priorUnchanged();
  const priorReceipt = JSON.parse(fs.readFileSync(path.join(evidence,Object.keys(priorPins)[0]),'utf8'));
  const lines = fs.readFileSync(path.join(evidence,Object.keys(priorPins)[1]),'utf8').split('\n');
  assert.equal(lines.pop(),''); assert.equal(lines.length,18);
  let previous = null;
  const priorEvents = lines.map((line,index) => {
    const event = JSON.parse(line);
    assert.equal(event.sequence,index+1); assert.equal(event.previousEventHash,previous);
    previous = sha(line+'\n'); return event;
  });
  const event = name => {
    const matches = priorEvents.filter(item=>item.event===name);
    assert.equal(matches.length,1); return matches[0].details;
  };
  assert.equal(priorReceipt.state,'FAIL_RETAINED'); assert.equal(priorReceipt.stage,'denial-canary');
  assert.equal(priorReceipt.containerId,containerId); assert.equal(priorReceipt.containerName,containerName);
  assert.equal(priorReceipt.volumeName,volumeName); assert.equal(priorReceipt.databaseName,databaseName);
  assert.equal(priorReceipt.runNonce,runNonce); assert.equal(priorReceipt.image.id,imageId);
  assert.equal(priorReceipt.journalSha256,Object.values(priorPins)[1]);
  assert.equal(priorReceipt.lastProcessFailure.status,3); assert.equal(priorReceipt.lastProcessFailure.signal,null);
  assert.equal(priorReceipt.lastProcessFailure.timedOut,false); assert.equal(priorReceipt.lastProcessFailure.outputLimited,false);
  const original = event('synthetic-functions-created');
  const originalVolume = event('volume-created');
  const originalStart = event('startup-qualified');
  assert.equal(originalVolume.labels['org.algt.f06.nonce'],runNonce);
  assert.equal(originalVolume.labels['org.algt.f06.helper-sha256'],oldHelperHash);
  assert.equal(originalStart.containerId,containerId); assert.equal(originalStart.logs.crash,false);
  assert.equal(event('attempt-reserved').runNonce,runNonce);
  assert.deepEqual(original.functions.map(fn=>fn.oid),['16665','16664']);
  assert.equal(fs.existsSync(receiptFile),false);
  journal = fs.openSync(journalFile,'ax',0o600);
  append('continuation-reserved',{startedAt,containerId,containerName,volumeName,databaseName,runNonce,
    imageId,repoDigest,priorPins,helperSha256:sha(fs.readFileSync(new URL(import.meta.url))),
    scope:'Only six caught SQL EXECUTE denials; original observer projection corrected without grants.'});
  const resources = checkResources(originalVolume,originalStart);
  const beforeLogs = logs('all-logs-before');
  const beforeRows = sql('privileged-state-before',`${postgresGuardSql}\nselect ${privilegedStateSql};`);
  assert.equal(beforeRows.length,1);
  const before = beforeRows[0]; checkState(before,original);
  append('exact-preconditions-verified',{resources,state:before,logs:beforeLogs});

  append('six-denials-intent',{containerId,databaseName,roles,functions,sqlSha256:sha(canarySql),rollbackOnly:true});
  const rows = sql('six-denials',canarySql);
  assert.equal(rows.length,8); assert.equal(rows[0].kind,'before'); assert.equal(rows[7].kind,'after');
  checkState(rows[0].state,original,before); checkState(rows[7].state,original,before);
  const backend = rows[0].state.identity;
  assert.equal(rows[7].state.identity.pid,backend.pid);
  const cases = rows.slice(1,7);
  assert.deepEqual(cases.map(row=>[row.role,row.function]),roles.flatMap(role=>functions.map(fn=>[role,fn])));
  for (const row of cases) {
    assert.equal(row.kind,'denial'); assert.equal(row.sqlstate,'42501');
    assert.deepEqual(row.identity,{sessionUser:'postgres',currentUser:row.role,pid:backend.pid,
      postmasterEpoch:backend.postmasterEpoch,inRecovery:false});
  }
  append('six-denials-observed',{cases,before:rows[0].state,after:rows[7].state});
  const afterRows = sql('privileged-state-independent-after',`${postgresGuardSql}\nselect ${privilegedStateSql};`);
  assert.equal(afterRows.length,1); checkState(afterRows[0],original,before);
  assert.deepEqual(checkResources(originalVolume,originalStart),resources);
  const afterLogs = logs('all-logs-after');
  priorUnchanged();
  append('continuation-qualified',{caseCount:6,resourcesRetained:true,priorEvidenceUnchanged:true});
  finalReceipt({state:'PASS_SQL_CANARY_ONLY',startedAt,completedAt:new Date().toISOString(),
    containerId,containerName,volumeName,databaseName,runNonce,imageId,repoDigest,priorPins,
    cases,after:afterRows[0],logs:{before:beforeLogs,after:afterLogs},journalSha256:sha(fs.readFileSync(journalFile)),
    limitation:'SQL denial qualification only; not HTTP, Auth, application RLS, full F06 or migration acceptance. All prior resources/evidence retained.'});
  process.stdout.write('PASS_SQL_CANARY_ONLY; six denials; all resources and prior evidence retained.\n');
} catch {
  // No reconnect/retry/repair in the failure branch. A child timeout alone is
  // not proof of server cancellation; the SQL-side deadlines remain in force.
  if (journal !== undefined) {
    try {
      append('continuation-failed-retained',{stage,containerId,volumeName,databaseName,processFailure:processFailure??null});
      finalReceipt({state:'FAIL_RETAINED',startedAt,stage,containerId,volumeName,databaseName,runNonce,priorPins,
        processFailure:processFailure??null,journalSha256:sha(fs.readFileSync(journalFile)),limitation:'No qualification; no automatic mutation or retry.'});
    } catch { /* Never overwrite evidence to repair reporting. */ }
  }
  process.stderr.write('CONTINUATION_FAILED_CLOSED; prior evidence and resources retained; no qualification.\n');
  process.exitCode = 1;
} finally {
  if (journal !== undefined) fs.closeSync(journal);
}
