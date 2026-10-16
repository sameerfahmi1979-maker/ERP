// MAIN ONLY. AUTHOR-ONLY until independent review. Never import this helper.
// No arguments, pull, retry, reset, reuse, stop or cleanup mode. All resources
// remain retained on success/failure for independently authorized inspection.
// Required opt-ins: ALGT_F06_LOCAL_TARGET=postgres-denial-canary and
// ALGT_F06_POSTGRES_DENIAL_CANARY=1. Exact linux/amd64 image pins were independently
// inspected by main and this author on 2026-10-05. No image is fetched here.
//
// Startup provenance (read 2026-10-05):
// https://github.com/supabase/postgres/blob/17.6.1.113/Dockerfile-17
// https://github.com/supabase/postgres/blob/17.6.1.113/ansible/files/postgresql_config/pg_hba.conf.j2
// https://github.com/supabase/postgres/blob/17.6.1.113/ansible/files/postgresql_config/supautils.conf.j2
// https://github.com/docker-library/postgres/blob/6edb0a8c4def40c371514b34aef9037ec82d9110/17/alpine3.23/docker-entrypoint.sh
// Official entrypoint initializes an EMPTY PGDATA, boots bundled migrations,
// stops its temporary socket-only server, then execs postgres -D /etc/postgresql.
// We preserve that command, authentication/configuration and built-in roles.
// The official HBA already trusts 127.0.0.1 INSIDE the container. We do not add a
// trust override, publish ports, attach a network or use external credentials.
// A generated synthetic bootstrap password is passed by environment NAME only,
// never printed, journalled, persisted in this checkout or read from user files.
// Docker retains that synthetic value in the owned container; do not dump Env.
//
// Qualification is ONLY this exact image/build/platform + SQL denial shape.
// No HTTP, PostgREST, Auth-session, migration replay or full F06 acceptance claim.
// Main must independently provision/review the candidate image before running.
// Image metadata alone cannot prove its binary matches the published recipe;
// the actual denied-call canary is required. No downgrade/config workaround.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash, randomBytes, randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

const root = path.resolve(import.meta.dirname, '../../..');
const evidence = 'C:/dev/agt-erp/CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F06';
const imageTag = 'public.ecr.aws/supabase/postgres:17.6.1.113';
const expectedImageId = 'sha256:4c39816ce8d9303a3aba1161c842929c73a40c7109a9ef1b644582478e31832e';
const expectedRepoDigest = 'public.ecr.aws/supabase/postgres@sha256:4c39816ce8d9303a3aba1161c842929c73a40c7109a9ef1b644582478e31832e';
const expectedArch = 'amd64';
const containerName = 'f06-postgres-denial-canary-1761113-20261005';
const volumeName = 'f06-postgres-denial-canary-1761113-20261005-data';
const databaseName = 'f06_denial_canary_20261005';
const journalFile = path.join(evidence, 'POSTGRES_DENIAL_CANARY_1761113_INTENTS_20261005.jsonl');
const receiptFile = path.join(evidence, 'POSTGRES_DENIAL_CANARY_1761113_20261005.json');
const dockerExe = 'C:/Program Files/Docker/Docker/resources/bin/docker.exe';
// Observed local Desktop Linux endpoint; an inherited remote DOCKER_HOST/context
// cannot redirect this helper. No global context/config change is performed.
const dockerHost = 'npipe:////./pipe/dockerDesktopLinuxEngine';
// The CLI receives a deliberately NONEXISTENT config directory and only a
// local --host. It must not consult the user's Docker auth/configuration files.
// These non-config-mutating commands do not create this path; existence fails.
const dockerConfig = path.join(evidence, 'F06_CANARY_1761113_ABSENT_DOCKER_CONFIG_20261005');
const roles = Object.freeze(['anon', 'authenticated', 'service_role']);
const functions = Object.freeze(['f06_denial_sql_invoker', 'f06_denial_plpgsql_definer']);
const sha = value => createHash('sha256').update(value).digest('hex');
const normalized = value => value.replaceAll('\\', '/');
const runNonce = randomUUID();
let journal;
let stage = 'preflight';
let containerId;
let volumeIdentity;
let pinnedImage;
let lastProcessFailure;
let sequence = 0;
let previousEventHash = null;
const results = {};
const startedAt = new Date().toISOString();

// Pure serializers never include subprocess args, SQL text, raw stderr, errors,
// image/container Env, passwords, logs or arbitrary caught exception messages.
function append(event, details = {}) {
  assert.ok(journal !== undefined, 'Journal not reserved');
  const record = {sequence: ++sequence, at: new Date().toISOString(), event,
    previousEventHash, details};
  const line = JSON.stringify(record) + '\n';
  fs.writeSync(journal, line);
  fs.fsyncSync(journal);
  previousEventHash = sha(line);
}
function childEnv(extra = {}) {
  // Do not forward arbitrary user environment (PG*, Supabase keys, proxies,
  // Docker host/context/TLS credentials or Node loader options).
  const result = {};
  for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'Path', 'TEMP', 'TMP']) {
    if (process.env[key] !== undefined) result[key] = process.env[key];
  }
  return {...result, ...extra};
}
function docker(label, args, {input, timeout = 10000, extraEnv, allowed = [0]} = {}) {
  stage = label;
  assert.equal(fs.existsSync(dockerConfig), false, 'Unexpected Docker config path');
  const proc = spawnSync(dockerExe, ['--config', dockerConfig, '--host', dockerHost, ...args], {
    encoding: 'utf8', input, timeout, killSignal: 'SIGTERM', windowsHide: true,
    shell: false, maxBuffer: 8 * 1024 * 1024, env: childEnv(extraEnv),
  });
  if (proc.error || proc.signal || !allowed.includes(proc.status)) {
    lastProcessFailure = {stage: label, status: proc.status, signal: proc.signal,
      timedOut: proc.error?.code === 'ETIMEDOUT', outputLimited: proc.error?.code === 'ENOBUFS',
      stdoutSha256: sha(proc.stdout ?? ''), stderrSha256: sha(proc.stderr ?? '')};
    if (journal !== undefined) append('subprocess-failed', lastProcessFailure);
    throw new Error('BOUNDED_SUBPROCESS_FAILED');
  }
  return {stdout: proc.stdout.trim(), stderr: proc.stderr, status: proc.status};
}
function json(label, args) {
  return JSON.parse(docker(label, args).stdout);
}
function labelArgs(labels) {
  return Object.entries(labels).flatMap(([key, value]) => ['--label', `${key}=${value}`]);
}
function inspectVolume() {
  return json('owned-volume-metadata', ['volume', 'inspect', volumeName, '--format',
    '{"name":{{json .Name}},"driver":{{json .Driver}},"scope":{{json .Scope}},"createdAt":{{json .CreatedAt}},"labels":{{json .Labels}},"options":{{json .Options}}}']);
}
function inspectContainer() {
  assert.match(containerId, /^[0-9a-f]{64}$/);
  return json('owned-container-metadata', ['container', 'inspect', containerId, '--format',
    '{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Image}},"labels":{{json .Config.Labels}},"networkMode":{{json .HostConfig.NetworkMode}},"ports":{{json .HostConfig.PortBindings}},"publishAllPorts":{{json .HostConfig.PublishAllPorts}},"binds":{{json .HostConfig.Binds}},"mounts":{{json .Mounts}},"privileged":{{json .HostConfig.Privileged}},"pidMode":{{json .HostConfig.PidMode}},"ipcMode":{{json .HostConfig.IpcMode}},"restartPolicy":{{json .HostConfig.RestartPolicy.Name}},"autoRemove":{{json .HostConfig.AutoRemove}},"running":{{json .State.Running}},"status":{{json .State.Status}},"restarting":{{json .State.Restarting}},"oomKilled":{{json .State.OOMKilled}},"restartCount":{{json .RestartCount}},"startedAt":{{json .State.StartedAt}},"pid":{{json .State.Pid}}}']);
}
function assertOwned(labels, expectRunning) {
  assert.deepEqual(inspectVolume(), volumeIdentity, 'Owned volume identity changed');
  const item = inspectContainer();
  assert.equal(item.id, containerId);
  assert.equal(item.name, `/${containerName}`);
  assert.equal(item.image, pinnedImage.id);
  for (const [key, value] of Object.entries(labels)) assert.equal(item.labels[key], value);
  assert.equal(item.networkMode, 'none');
  assert.equal(Object.keys(item.ports ?? {}).length, 0);
  assert.equal(item.publishAllPorts, false);
  assert.equal((item.binds ?? []).length, 0);
  assert.equal(item.mounts.length, 1);
  assert.equal(item.mounts[0].Type, 'volume');
  assert.equal(item.mounts[0].Name, volumeName);
  assert.equal(item.mounts[0].Destination, '/var/lib/postgresql/data');
  assert.equal(item.mounts[0].RW, true);
  assert.equal(item.privileged, false);
  assert.equal(item.pidMode, '');
  assert.equal(item.ipcMode, 'private');
  assert.equal(item.restartPolicy, 'no');
  assert.equal(item.autoRemove, false);
  assert.equal(item.restarting, false);
  assert.equal(item.oomKilled, false);
  assert.equal(item.restartCount, 0);
  assert.equal(item.running, expectRunning);
  return item;
}
function sql(label, text, {user = 'postgres', database = databaseName} = {}) {
  // All SQL targets only the immutable ID created by this attempt, at its own
  // loopback interface. Never an application port, DSN or existing container.
  assert.match(containerId, /^[0-9a-f]{64}$/);
  assert.ok(['postgres', 'supabase_admin'].includes(user));
  assert.ok(['postgres', databaseName].includes(database));
  const prefix = "set statement_timeout='5s';set lock_timeout='2s';set idle_in_transaction_session_timeout='10s';set transaction_timeout='20s';\n";
  const output = docker(label, ['exec', '-i', '--user', 'postgres', containerId,
    'psql', '-X', '-w', '-qAt', '-v', 'ON_ERROR_STOP=1',
    '-h', '127.0.0.1', '-p', '5432', '-U', user, '-d', database],
  {input: prefix + text, timeout: 30000}).stdout;
  return output ? output.split(/\r?\n/).map(line => JSON.parse(line)) : [];
}
function logs(label) {
  // Read ALL logs of this exact newly-owned container. No tail truncation,
  // rotation override or raw emission. Buffer overflow is a qualification fail.
  const response = docker(label, ['logs', '--timestamps', containerId], {timeout: 10000});
  const content = response.stdout + '\n' + response.stderr;
  const crash = /segmentation fault|signal 11|PANIC:|terminating any other active server processes|database system was interrupted|database system is in recovery mode|automatic recovery in progress|redo starts at/i.test(content);
  const metadata = {sha256: sha(content), bytes: Buffer.byteLength(content), crash};
  append('owned-logs-observed', metadata);
  assert.equal(crash, false, 'Crash/recovery log signature');
  return metadata;
}

const identitySql = `jsonb_build_object(
  'database',current_database(),'databaseOid',(select oid from pg_database where datname=current_database()),
  'owner',(select pg_get_userbyid(datdba) from pg_database where datname=current_database()),
  'sessionUser',session_user,'currentUser',current_user,'pid',pg_backend_pid(),
  'postmasterEpoch',extract(epoch from pg_postmaster_start_time())::text,
  'inRecovery',pg_is_in_recovery(),'serverVersion',current_setting('server_version_num'),
  'hints',current_setting('supautils.hint_roles'),
  'hintGucRegistered',exists(select 1 from pg_settings where name='supautils.hint_roles' and vartype='string'),
  'preload',current_setting('session_preload_libraries'),
  'sharedPreload',current_setting('shared_preload_libraries'),
  'reservedRoles',current_setting('supautils.reserved_roles'),
  'logDestination',current_setting('log_destination'),'loggingCollector',current_setting('logging_collector'),
  'roleHash',(select md5(jsonb_agg(to_jsonb(r) order by r.oid)::text) from pg_roles r),
  'membershipHash',(select md5(coalesce(jsonb_agg(to_jsonb(m) order by m.roleid,m.member,m.grantor),'[]'::jsonb)::text) from pg_auth_members m))`;
const setupSql = `begin;
create function public.f06_denial_sql_invoker() returns integer language sql security invoker
set search_path='' as 'select 1';
create function public.f06_denial_plpgsql_definer() returns integer language plpgsql security definer
set search_path='' as $$begin return 1; end$$;
revoke all on function public.f06_denial_sql_invoker(),public.f06_denial_plpgsql_definer()
  from public,anon,authenticated,service_role;
commit;
select jsonb_build_object('kind','setup','identity',${identitySql},
  'tables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p','m','f')),
  'functions',(select jsonb_agg(jsonb_build_object('oid',p.oid,'name',p.proname,'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'acl',p.proacl) order by p.proname)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'),
  'roles',(select jsonb_agg(jsonb_build_object('name',r.rolname,'super',r.rolsuper,'login',r.rolcanlogin,
    'schemaUsage',has_schema_privilege(r.oid,'public','usage'),
    'sqlExecute',has_function_privilege(r.oid,'public.f06_denial_sql_invoker()','execute'),
    'plpgsqlExecute',has_function_privilege(r.oid,'public.f06_denial_plpgsql_definer()','execute')) order by r.rolname)
    from pg_roles r where r.rolname in ('anon','authenticated','service_role')));`;

// An unexpected grant must fail, not convert to an application-raised 42501.
// The caught message is checked inside PostgreSQL but never emitted. Schema
// USAGE is asserted first so a schema denial cannot masquerade as EXECUTE denial.
const caseSql = roles.flatMap(role => functions.map(fn => `
set local role ${role};
do $canary$
declare observed text; observed_message text;
begin
  if session_user <> 'postgres' or current_user <> '${role}' then
    raise exception 'CANARY_WRONG_PRINCIPAL';
  end if;
  if not has_schema_privilege(current_user,'public','usage')
     or has_function_privilege(current_user,'public.${fn}()','execute') then
    raise exception 'CANARY_WRONG_PRIVILEGES';
  end if;
  begin
    perform public.${fn}();
    raise exception 'CANARY_EXPECTED_EXECUTE_DENIAL';
  exception when insufficient_privilege then
    get stacked diagnostics observed=returned_sqlstate,observed_message=message_text;
    if observed <> '42501' or observed_message <> 'permission denied for function ${fn}' then
      raise exception 'CANARY_WRONG_ERROR';
    end if;
    perform set_config('f06_canary.observed',observed,true);
  end;
end $canary$;
select jsonb_build_object('kind','denial','role','${role}','function','${fn}',
  'sqlstate',current_setting('f06_canary.observed'),'identity',${identitySql});
reset role;
`)).join('\n');
const canarySql = `begin;
select jsonb_build_object('kind','before','identity',${identitySql});
${caseSql}
select jsonb_build_object('kind','after','identity',${identitySql});
rollback;`;

function checkIdentity(item, {role = 'postgres', expected, sameBackend = false} = {}) {
  assert.equal(item.database, databaseName);
  assert.equal(item.owner, 'postgres');
  assert.equal(item.sessionUser, 'postgres');
  assert.equal(item.currentUser, role);
  assert.equal(item.inRecovery, false);
  assert.equal(item.serverVersion, '170006');
  assert.equal(item.hintGucRegistered, true); // registered GUC, not a placeholder
  assert.deepEqual(item.hints.split(',').map(s => s.trim()).sort(), [...roles].sort());
  assert.ok(item.preload.split(',').map(s => s.trim()).includes('supautils'));
  assert.equal(item.logDestination, 'stderr');
  assert.equal(item.loggingCollector, 'off');
  for (const roleName of roles) assert.ok(item.reservedRoles.split(',').map(s => s.trim()).includes(`${roleName}*`));
  if (expected) {
    for (const key of ['databaseOid','postmasterEpoch','roleHash','membershipHash','hints','preload','sharedPreload','reservedRoles']) {
      assert.deepEqual(item[key], expected[key], 'Database/process/authority settings changed');
    }
    if (sameBackend) assert.equal(item.pid, expected.pid, 'Backend changed during denial tests');
  }
}

try {
  assert.equal(process.argv.length, 2, 'No arguments or reuse mode');
  assert.equal(process.platform, 'win32');
  assert.equal(normalized(fs.realpathSync(root)), 'C:/dev/agt-erp-f06');
  assert.equal(normalized(fs.realpathSync(evidence)), evidence);
  assert.equal(process.env.ALGT_F06_LOCAL_TARGET, 'postgres-denial-canary');
  assert.equal(process.env.ALGT_F06_POSTGRES_DENIAL_CANARY, '1');
  assert.match(expectedImageId, /^sha256:[0-9a-f]{64}$/);
  assert.match(expectedRepoDigest, /^public\.ecr\.aws\/supabase\/postgres@sha256:[0-9a-f]{64}$/);
  assert.ok(['amd64', 'arm64'].includes(expectedArch));
  assert.equal(fs.existsSync(receiptFile), false, 'Prior receipt must be preserved');
  journal = fs.openSync(journalFile, 'ax', 0o600);
  const helperSha256 = sha(fs.readFileSync(new URL(import.meta.url)));
  const labels = {'org.algt.f06.task': 'postgres-denial-canary-20261005',
    'org.algt.f06.owner': 'main-only', 'org.algt.f06.nonce': runNonce,
    'org.algt.f06.helper-sha256': helperSha256};
  append('attempt-reserved', {containerName,volumeName,databaseName,imageTag,
    expectedImageId,expectedRepoDigest,expectedArch,helperSha256,runNonce,startedAt,
    scope: 'SQL EXECUTE-denial qualification only; not HTTP or F06 acceptance'});

  pinnedImage = json('image-metadata', ['image','inspect',imageTag,'--format',
    '{"id":{{json .Id}},"repoDigests":{{json .RepoDigests}},"architecture":{{json .Architecture}},"os":{{json .Os}},"entrypoint":{{json .Config.Entrypoint}},"cmd":{{json .Config.Cmd}},"user":{{json (index .Config "User")}},"volumes":{{json (index .Config "Volumes")}}}']);
  assert.equal(pinnedImage.id, expectedImageId);
  assert.ok(pinnedImage.repoDigests.includes(expectedRepoDigest));
  assert.equal(pinnedImage.architecture, expectedArch);
  assert.equal(pinnedImage.os, 'linux');
  assert.deepEqual(pinnedImage.entrypoint, ['docker-entrypoint.sh']);
  assert.deepEqual(pinnedImage.cmd, ['postgres','-D','/etc/postgresql']);
  assert.ok([null, '', 'root', '0'].includes(pinnedImage.user));
  assert.ok(Object.keys(pinnedImage.volumes ?? {}).every(key => key === '/var/lib/postgresql/data'));
  append('image-pinned', pinnedImage);
  // Only exact-name filtered inventories; never inspect any pre-existing
  // container/volume. Docker atomically rejects a container name collision.
  assert.equal(docker('name-absent', ['container','ls','--all','--filter',`name=^/${containerName}$`,'--format','{{.ID}}']).stdout, '');
  assert.equal(docker('volume-absent', ['volume','ls','--filter',`name=^${volumeName}$`,'--format','{{.Name}}']).stdout, '');
  append('volume-create-intent', {volumeName,labels});
  assert.equal(docker('volume-create', ['volume','create','--driver','local',...labelArgs(labels),volumeName]).stdout, volumeName);
  volumeIdentity = inspectVolume();
  assert.equal(volumeIdentity.name, volumeName);
  assert.equal(volumeIdentity.driver, 'local');
  assert.equal(volumeIdentity.scope, 'local');
  assert.equal(Object.keys(volumeIdentity.options ?? {}).length, 0);
  assert.deepEqual(volumeIdentity.labels, labels); // refuses reuse/race winner
  append('volume-created', volumeIdentity);

  append('container-create-intent', {containerName,volumeName,imageId:pinnedImage.id,
    repoDigest:expectedRepoDigest,platform:`linux/${expectedArch}`,labels});
  containerId = docker('container-create', ['create','--pull','never','--name',containerName,
    '--platform',`linux/${expectedArch}`,'--network','none','--ipc','private','--restart','no',
    '--memory','1g','--memory-swap','1g','--cpus','1','--pids-limit','256','--shm-size','128m',
    '--log-driver','json-file',...labelArgs(labels),
    '--mount',`type=volume,source=${volumeName},target=/var/lib/postgresql/data,volume-nocopy`,
    '--env','POSTGRES_PASSWORD','--env','POSTGRES_USER=supabase_admin','--env','POSTGRES_DB=postgres',
    '--env','PGDATA=/var/lib/postgresql/data',pinnedImage.id],
  {extraEnv:{POSTGRES_PASSWORD:randomBytes(48).toString('hex')},timeout:30000}).stdout;
  assert.match(containerId, /^[0-9a-f]{64}$/);
  append('container-created', {containerId});
  assertOwned(labels, false);
  append('container-start-intent', {containerId,volumeName});
  docker('container-start', ['start',containerId], {timeout:30000});
  append('container-started', {containerId});

  // Bounded readiness polling ONLY, never reruns start/SQL after failure. TCP
  // readiness excludes the official entrypoint's temporary socket-only server.
  const readinessDeadline = Date.now() + 90000;
  let ready = false;
  while (Date.now() < readinessDeadline) {
    assertOwned(labels, true);
    const probe = docker('startup-readiness', ['exec','--user','postgres',containerId,
      'pg_isready','-h','127.0.0.1','-p','5432','-U','postgres','-d','postgres','-t','2'],
    {timeout:4000,allowed:[0,1,2]});
    if (probe.status === 0) { ready = true; break; }
    await delay(1000);
  }
  assert.equal(ready, true, 'Startup readiness deadline');
  const running = assertOwned(labels, true);
  append('startup-qualified', {containerId,hostPid:running.pid,startedAt:running.startedAt,logs:logs('startup-logs')});

  append('synthetic-database-create-intent', {containerId,databaseName,owner:'postgres',template:'template0'});
  sql('synthetic-database-create', `create database ${databaseName} owner postgres template template0;`, {user:'supabase_admin',database:'postgres'});
  append('synthetic-database-created', {containerId,databaseName});
  const [initial] = sql('database-baseline', `select ${identitySql};`);
  checkIdentity(initial);
  append('database-baseline', initial);
  append('synthetic-functions-create-intent', {containerId,databaseName,functions,sqlSha256:sha(setupSql)});
  const setupRows = sql('synthetic-functions-create', setupSql);
  assert.equal(setupRows.length, 1);
  const setup = setupRows[0];
  checkIdentity(setup.identity, {expected:initial});
  assert.equal(setup.tables, 0);
  assert.deepEqual(setup.functions.map(fn => fn.name).sort(), [...functions].sort());
  assert.ok(setup.functions.every(fn => fn.owner === 'postgres'));
  assert.deepEqual(setup.roles.map(role => role.name).sort(), [...roles].sort());
  for (const role of setup.roles) {
    assert.equal(role.super, false); assert.equal(role.login, false);
    assert.equal(role.schemaUsage, true);
    assert.equal(role.sqlExecute, false); assert.equal(role.plpgsqlExecute, false);
  }
  append('synthetic-functions-created', setup);
  append('denial-canary-intent', {containerId,databaseName,roles,functions,sqlSha256:sha(canarySql),expectedCases:6});
  const rows = sql('denial-canary', canarySql);
  assert.equal(rows.length, 8);
  assert.equal(rows[0].kind, 'before'); assert.equal(rows[7].kind, 'after');
  const before = rows[0].identity;
  checkIdentity(before, {expected:initial});
  const cases = rows.slice(1,7);
  assert.deepEqual(cases.map(row => [row.role,row.function]), roles.flatMap(role => functions.map(fn => [role,fn])));
  for (const row of cases) {
    assert.equal(row.kind, 'denial'); assert.equal(row.sqlstate, '42501');
    checkIdentity(row.identity, {role:row.role,expected:before,sameBackend:true});
  }
  checkIdentity(rows[7].identity, {expected:before,sameBackend:true});
  append('denial-canary-observed', {cases,after:rows[7].identity});
  const [after] = sql('post-canary-independent-health', `select ${identitySql};`);
  checkIdentity(after, {expected:initial});
  const finalContainer = assertOwned(labels, true);
  assert.equal(finalContainer.pid, running.pid);
  assert.equal(finalContainer.startedAt, running.startedAt);
  results.cases = cases;
  results.after = after;
  results.logs = logs('post-canary-logs');
  results.container = {id:containerId,hostPid:finalContainer.pid,startedAt:finalContainer.startedAt};
  append('qualification-complete', {caseCount:6,resourcesRetained:true});
  const receipt = {state:'PASS_SQL_CANARY_ONLY',startedAt,completedAt:new Date().toISOString(),
    image:pinnedImage,containerName,containerId,volume:volumeIdentity,databaseName,runNonce,
    results,journalSha256:sha(fs.readFileSync(journalFile)),
    limitation:'Not HTTP/PostgREST/Auth/RLS application acceptance, migration replay, or approval to alter any existing stack. Resources retained.'};
  const receiptFd = fs.openSync(receiptFile, 'wx', 0o600);
  try { fs.writeSync(receiptFd, JSON.stringify(receipt,null,2)+'\n'); fs.fsyncSync(receiptFd); }
  finally { fs.closeSync(receiptFd); }
  process.stdout.write('PASS_SQL_CANARY_ONLY; owned resources retained; private receipt saved.\n');
} catch {
  // No retries or container/volume/role/database repairs, including on timeout.
  // Terminating docker.exe does NOT establish server-side SQL termination; the
  // statement/transaction deadlines provide the additional SQL-side bound.
  // If create timed out before returning an ID, the durable intent + exact
  // name/nonce remain the handoff for main-only investigation; do not reuse it.
  if (journal !== undefined) {
    try {
      append('qualification-failed-resources-retained', {stage,containerName,containerId:containerId??null,
        volumeName,volumeIdentity:volumeIdentity??null,databaseName,lastProcessFailure:lastProcessFailure??null});
      const receiptFd = fs.openSync(receiptFile, 'wx', 0o600);
      try {
        fs.writeSync(receiptFd, JSON.stringify({state:'FAIL_RETAINED',stage,startedAt,
          containerName,containerId:containerId??null,volumeName,databaseName,runNonce,
          image:pinnedImage??null,lastProcessFailure:lastProcessFailure??null,
          journalSha256:sha(fs.readFileSync(journalFile)),
          limitation:'No qualification. Resources may exist or still be initializing; inspect exact owned resources before any separately authorized action.'},null,2)+'\n');
        fs.fsyncSync(receiptFd);
      } finally { fs.closeSync(receiptFd); }
    } catch { /* Preserve existing evidence; never overwrite to repair a receipt. */ }
  }
  process.stderr.write('CANARY_FAILED_CLOSED; no automatic retry/cleanup; any owned resources and prior evidence retained.\n');
  process.exitCode = 1;
} finally {
  if (journal !== undefined) fs.closeSync(journal);
}
