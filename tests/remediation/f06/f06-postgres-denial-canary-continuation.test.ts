// Pure source-text author checks. NEVER import/execute the continuation or read
// private evidence. Main owns any later static check / actual canary execution.
import {expect,it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
const source = fs.readFileSync(path.resolve('tests/remediation/f06/f06-postgres-denial-canary-continuation.mjs'),'utf8');

it('pins exactly the retained failed attempt and a separate exclusive continuation',()=>{
  for (const value of ['d9bd31376cfcfac9d27e9b7fa786c0c757fd23c43a00e9f460c06baedaab5029',
    '4fe65ee5-76f4-4a70-a70f-c9c25bf83f83',
    'e463cac5543279be144ab07631967b857dd2dee18673bdd5afcb6cc52dedfb8e',
    'fcd6ee5ea8df4cddb9a108d5c29e5a06b8712c25bdf521e47808cec2e1693dd4',
    'c23d4e7fdba5acdc9e2b17c5b7701abe7170e6bd824d0c9d2e061493b4d376ad',
    '4c39816ce8d9303a3aba1161c842929c73a40c7109a9ef1b644582478e31832e',
    "['16665','16664']","identity.databaseOid,'16663'",
    "process.argv.length,2", "process.env.ALGT_F06_POSTGRES_DENIAL_CONTINUATION,'1'",
    "process.env.ALGT_F06_LOCAL_TARGET,'postgres-denial-canary-continuation'",
    "priorReceipt.state,'FAIL_RETAINED'", "priorReceipt.lastProcessFailure.status,3",
    'CONTINUATION_INTENTS_20261005.jsonl','CONTINUATION_20261005.json',
    "fs.openSync(journalFile,'ax',0o600)","fs.openSync(receiptFile,'wx',0o600)",
    'fs.fsyncSync(fd)', 'event.previousEventHash,previous', 'priorUnchanged();']) expect(source).toContain(value);
  expect(source.indexOf("append('six-denials-intent'")).toBeLessThan(source.indexOf("sql('six-denials'"));
});

it('never reads privileged GUCs or catalogues under reserved roles',()=>{
  const minimal = source.split('const minimalIdentitySql = `')[1].split('`;')[0];
  expect(minimal).toContain('pg_backend_pid()');
  expect(minimal).toContain('pg_postmaster_start_time()');
  expect(minimal).toContain('pg_is_in_recovery()');
  expect(minimal).not.toMatch(/current_setting|pg_settings|pg_roles|pg_auth_members|preload|supautils/);
  const cases = source.split('const caseSql = ')[1].split('const canarySql = ')[0];
  expect(cases).toContain('${minimalIdentitySql}');
  expect(cases).not.toMatch(/privilegedStateSql|pg_settings|pg_roles|pg_auth_members|preload|supautils/);
  expect(cases).toContain("current_setting('f06_canary.observed')");
  const canary = source.split('const canarySql = `')[1].split('`;')[0];
  expect(canary.indexOf('${postgresGuardSql}')).toBeLessThan(canary.indexOf('${privilegedStateSql}'));
  expect(canary.indexOf('${caseSql}')).toBeLessThan(canary.lastIndexOf('${postgresGuardSql}'));
  expect(source).toContain("current_user<>'postgres'");
  expect(source).not.toContain('pg_read_all_settings');
});

it('issues only rollback-only read-only SQL and six explicit caught EXECUTE denials',()=>{
  for (const value of ["begin read only;\\n", "body+'\\nrollback;\\n'",
    "['anon', 'authenticated', 'service_role']", "['f06_denial_sql_invoker', 'f06_denial_plpgsql_definer']",
    'exception when insufficient_privilege', 'observed=returned_sqlstate',
    "observed<>'42501'", "observed_message<>'permission denied for function ${fn}'",
    'EXPECTED_EXECUTE_DENIAL','WRONG_DENIAL_PRIVILEGES','reset role;',
    'assert.equal(rows.length,8)', "assert.equal(row.sqlstate,'42501')"]) expect(source).toContain(value);
  expect(source).not.toMatch(/\b(?:create|drop|alter)\s+(?:database|role|user|function|table|schema)\b/i);
  expect(source).not.toMatch(/\b(?:grant|revoke)\s+\w|\bcommit\s*;/i);
  expect(source).not.toMatch(/(?:set|SET)\s+(?:supautils\.|session_preload_libraries|shared_preload_libraries)/);
});

it('validates exact retained identities, function bodies, ACLs and role preimages',()=>{
  for (const value of ['assert.deepEqual(volume,expectedVolume)', 'item.startedAt,expectedStart.startedAt',
    'item.pid,expectedStart.hostPid', "item.network,'none'", 'item.mounts.length,1',
    'item.restartCount,0','item.privileged,false','item.autoRemove,false',
    'assert.deepEqual(identity,originalIdentity)', 'assert.deepEqual(state.roles,original.roles)',
    'assert.deepEqual(state.functions,expected.functions)', "p.prosrc='select 1'",
    "p.prosrc='begin return 1; end'", "p.proconfig=array['search_path=\"\"']::text[]",
    'assert.equal(exactBody,true)', 'assert.equal(exactSignature,true)', 'assert.equal(exactConfig,true)',
    'state.tables,0','rows[7].state.identity.pid,backend.pid',
    "sessionUser:'postgres',currentUser:row.role,pid:backend.pid", 'postmasterEpoch:backend.postmasterEpoch,inRecovery:false']) expect(source).toContain(value);
});

it('has no resource mutation or alternate target, and never outputs raw errors or secrets',()=>{
  expect(source).toContain("['--config',dockerConfig,'--host',dockerHost,...args]");
  expect(source).toContain("['logs','--timestamps',containerId]");
  expect(source).toContain("'psql','-X','-w','-qAt'");
  expect(source).not.toMatch(/['"](?:create|rm|remove|prune|restart|start|stop|kill|pull|run)['"]\s*[,\]]/);
  expect(source).not.toMatch(/\.Config\.Env|pg_dump|pg_restore|fixtures-private|keys-private|\.env['"]|POSTGRES_PASSWORD/);
  expect(source).not.toContain('...process.env');
  expect(source).not.toMatch(/console\.(?:log|error)|process\.(?:stdout|stderr)\.write\((?:result|error|value)/);
  expect(source).toContain('stdoutSha256:sha(result.stdout');
  expect(source).toContain('stderrSha256:sha(result.stderr');
});

it('bounds all processes and SQL and explicitly limits qualification',()=>{
  for (const value of ['timeout = 10000', 'timeout:30000', "statement_timeout='5s'",
    "lock_timeout='2s'", "transaction_timeout='20s'", "idle_in_transaction_session_timeout='10s'",
    "killSignal:'SIGTERM'", 'maxBuffer:8*1024*1024', 'shell:false',
    'segmentation fault|signal 11|PANIC:', 'database system was interrupted',
    "'privileged-state-independent-after'", "state:'PASS_SQL_CANARY_ONLY'", "state:'FAIL_RETAINED'",
    'not HTTP, Auth, application RLS, full F06 or migration acceptance']) expect(source).toContain(value);
});
