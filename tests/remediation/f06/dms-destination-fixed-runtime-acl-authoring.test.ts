// Source text only: NEVER import/execute the actual helper or read private evidence.
import {expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.resolve('tests/remediation/f06/dms-destination-fixed-runtime-acl.mjs'), 'utf8');
const section = (start: string, end: string) => source.split(start)[1].split(end)[0];

it('pins the exact network-none qualified image, retained container, nonce and all four prior receipts', () => {
  for (const value of [
    'd9bd31376cfcfac9d27e9b7fa786c0c757fd23c43a00e9f460c06baedaab5029',
    '4fe65ee5-76f4-4a70-a70f-c9c25bf83f83',
    '4c39816ce8d9303a3aba1161c842929c73a40c7109a9ef1b644582478e31832e',
    'e463cac5543279be144ab07631967b857dd2dee18673bdd5afcb6cc52dedfb8e',
    'fcd6ee5ea8df4cddb9a108d5c29e5a06b8712c25bdf521e47808cec2e1693dd4',
    '2071c2a0f8519fb7b07e2890d76cc11e9b1112453134a7679ac5546e6a3785b9',
    '25012f4142458d26efc7464e99bba1562fc63f300c3388e603d4d1baefad5e4e',
    'c23d4e7fdba5acdc9e2b17c5b7701abe7170e6bd824d0c9d2e061493b4d376ad',
    "prior.state, 'PASS_SQL_CANARY_ONLY'", 'prior.cases.length, 6', "row.sqlstate === '42501'",
    "process.platform, 'win32'", "process.argv.length, 2", "'C:/dev/agt-erp-f06'",
    "process.env.ALGT_F06_LOCAL_TARGET, 'dms-destination-fixed-runtime-acl'",
    "process.env.ALGT_F06_DMS_DESTINATION_FIXED_RUNTIME_ACL, '1'",
    'assert.deepEqual(volume, expectedVolume)', 'item.startedAt, expectedStart.startedAt',
    'item.pid, expectedStart.hostPid', "item.network, 'none'", 'item.mounts.length, 1',
    'item.restartCount, 0', 'item.privileged, false', 'item.autoRemove, false',
    'qualified.resources.hostPid, originalStart.hostPid', 'qualified.resources.startedAt, originalStart.startedAt',
  ]) expect(source).toContain(value);
});

it('writes an exclusive durable intent before the single candidate transaction and never overwrites evidence', () => {
  for (const value of ['DMS_DESTINATION_FIXED_RUNTIME_ACL_INTENTS_20261005.jsonl', 'DMS_DESTINATION_FIXED_RUNTIME_ACL_20261005.json',
    "fs.openSync(journalFile, 'ax', 0o600)", "fs.openSync(receiptFile, 'wx', 0o600)",
    'fs.fsyncSync(fd)', 'offset += written', 'value.previousEventHash, previous',
    'previousEventHash = sha(line)', 'helperSha256:', 'contractSha256:', 'priorUnchanged();']) expect(source).toContain(value);
  expect(source.indexOf("append('candidate-acl-probe-intent'")).toBeLessThan(source.indexOf("sql('candidate-acl-probe'"));
  expect(source.match(/sql\('candidate-acl-probe'/g)).toHaveLength(1);
  expect(source).not.toMatch(/unlink|rmSync|writeFileSync|copyFileSync|renameSync/);
});

it('uses one explicit mutating transaction for exact candidate DDL, with explicit rollback and no COMMIT', () => {
  const probe = section('const probeSql = `', '`;\n  append(');
  expect(probe).toMatch(/^begin;\$\{deadlines\}/);
  expect(probe.match(/\bbegin;/g)).toHaveLength(1);
  expect(probe.match(/\brollback;/g)).toHaveLength(1);
  expect(probe).not.toContain('begin read only');
  const ordered = ['${postgresGuard}', '${snapshotSql}', "to_regnamespace('erp_private')", "current_setting('check_function_bodies')",
    'create schema erp_private authorization postgres;', 'grant usage on schema erp_private to anon,authenticated,service_role;',
    '${held.ddl}', '${functionMetadataSql}', '${deniedSql}', 'rollback;'];
  for (let index = 1; index < ordered.length; index++) expect(probe.indexOf(ordered[index])).toBeGreaterThan(probe.indexOf(ordered[index - 1]));
  expect(probe.slice(probe.indexOf('rollback;'))).toContain('${snapshotSql}');
  expect(source).not.toMatch(/\bcommit\s*;/i);
  expect(source).not.toMatch(/\b(?:create|alter|drop)\s+(?:table|database|role|user|extension)\b/i);
  expect(source).not.toMatch(/\b(?:insert\s+into|update\s+public\.|delete\s+from)\b/i);
});

it('requires real body validation and exact extracted source without replacing missing dependencies', () => {
  expect(source).toContain('exactDestinationDefinition(fs.readFileSync(migrationFile))');
  expect(source).toContain("current_setting('check_function_bodies')<>'on'");
  expect(source).toContain("before.functionBodyChecks, 'on'");
  expect(source).toContain("after.functionBodyChecks, 'on'");
  expect(source).toContain("rows[0].functionBodyChecks, 'on'");
  expect(source).not.toMatch(/set(?:\s+local|\s+session)?\s+check_function_bodies\s*=|set_config\('check_function_bodies'/i);
  expect(source).not.toMatch(/create (?:or replace )?function/i);
  expect(source).toContain('No dependency stubs');
  expect(source).toContain('Creation failure');
});

it('checks exact candidate body, postgres ownership, definer setting and expanded EXECUTE ACL independently', () => {
  for (const value of ["p.proargtypes[0]='jsonb'::regtype", "p.prorettype='jsonb'::regtype", "sha256(convert_to(p.prosrc,'UTF8'))",
    'aclexplode(p.proacl)', 'candidate.bodySha256, held.bodySha256', "candidate.owner, 'postgres'", 'candidate.definer, true',
    "candidate.language, 'plpgsql'", "candidate.config, ['search_path=\"\"']", 'candidate.exactSignature, true',
    'candidate.anon, false', 'candidate.service, false', 'candidate.human, true',
    "{grantee: 'authenticated', grantor: 'postgres', privilege: 'EXECUTE', grantable: false}",
    "{grantee: 'postgres', grantor: 'postgres', privilege: 'EXECUTE', grantable: false}",
    "candidate.schemaUsage, ['anon', 'authenticated', 'service_role'].map(role => ({role, usage: true}))",
  ]) expect(source).toContain(value);
});

it('isolates denied function execution from schema access, checks exact 42501 and never calls the authorized body', () => {
  const denial = section('const deniedSql = ', "// No dependency stubs");
  expect(denial).toContain('deniedRoles.map(role => `set local role ${role};');
  expect(denial).toContain("if not has_schema_privilege(current_user,'erp_private','usage') or has_function_privilege(current_user,'${signature}','execute')");
  expect(denial).toContain("perform erp_private.ai_approval_destination_snapshot('{}'::jsonb);");
  expect(denial).toContain('exception when insufficient_privilege then');
  expect(denial).toContain('observed=returned_sqlstate,observed_message=message_text');
  expect(denial).toContain("observed<>'42501' or observed_message<>'permission denied for function ai_approval_destination_snapshot'");
  expect(denial).toContain("raise exception 'EXPECTED_FUNCTION_EXECUTE_DENIAL'");
  expect(denial).toContain('reset role;');
  expect(source.match(/perform erp_private\.ai_approval_destination_snapshot\(/g)).toHaveLength(1);
  expect(source).not.toMatch(/set (?:local )?role (?:authenticated|postgres)/i);
  expect(source).toContain('Transaction-only USAGE for anon/authenticated/service_role; not production schema parity or an application permission change.');
});

it('never evaluates privileged catalogue/GUC observations while a denied reserved role is active', () => {
  const denial = section('const deniedSql = ', '// No dependency stubs');
  const minimal = section('const minimalIdentitySql = `', '`;');
  expect(denial).toContain('${minimalIdentitySql}');
  expect(denial).not.toMatch(/pg_roles|pg_auth_members|pg_settings|supautils|preload|baselineStateSql|snapshotSql/);
  expect(minimal).not.toMatch(/current_setting|pg_roles|pg_auth_members|pg_settings|supautils|preload/);
  for (const value of ['session_user', 'current_user', 'pg_backend_pid()', 'pg_postmaster_start_time()', 'pg_is_in_recovery()']) expect(minimal).toContain(value);
});

it('proves same-backend denials/rollback, independent schema absence and unchanged original functions/roles', () => {
  for (const value of ['assert.equal(rows.length, 6)', 'candidate.pid, backend.pid', 'rows[4].state.identity.pid, backend.pid',
    'rows[5].state.identity.pid, backend.pid', 'postmasterEpoch: backend.postmasterEpoch, inRecovery: false',
    'assert.deepEqual(identity, oldIdentity)', 'assert.deepEqual(state.functions, expected.functions)', 'assert.deepEqual(state.roles, expected.roles)',
    'state.tables, 0', 'state.functions.length, 2', "identity.databaseOid, '16663'", 'pg_auth_members',
    "p.prosrc='select 1'", "p.prosrc='begin return 1; end'", "p.proconfig=array['search_path=\"\"']::text[]",
    'before.privateSchemaAbsent, true', 'rows[4].privateSchemaAbsent, false', 'rows[5].privateSchemaAbsent, true',
    'rows[5].schemaSha256, before.schemaSha256', "observe('independent-after-rollback')", 'after.privateSchemaAbsent, true',
    'after.schemaSha256, before.schemaSha256', 'checkResources(originalVolume, originalStart), resources',
  ]) expect(source).toContain(value);
  expect(source).toContain('begin read only;${deadlines}');
  expect(source).toContain('originalCanaryFunctionsUnchanged: true');
  expect(source).toContain('rolesAndMembershipUnchanged: true');
});

it('bounds every command/transaction, retains failures without retry and never claims rollback on uncertain outcome', () => {
  for (const value of ['timeout = 10000', 'timeout: 30000', "statement_timeout='5s'", "lock_timeout='2s'",
    "idle_in_transaction_session_timeout='10s'", "transaction_timeout='20s'", "killSignal: 'SIGTERM'", 'maxBuffer: 8 * 1024 * 1024',
    "'ON_ERROR_STOP=1'", "state: 'FAIL_RETAINED'", 'No qualification or rollback-completion claim.', 'No automatic retry',
    'segmentation fault|signal 11|PANIC:', 'database system was interrupted', 'assert.equal(crash, false)',
  ]) expect(source).toContain(value);
  const failureStart = source.indexOf('} catch {\n  // ON_ERROR_STOP');
  expect(failureStart).toBeGreaterThan(0);
  const failure = source.slice(failureStart);
  expect(failure).not.toMatch(/\b(?:sql|observe|docker|checkResources)\(/);
  expect(source).not.toMatch(/while\s*\(|setTimeout|retryCount|sleep\(/);
});

it('has no alternate target or Docker lifecycle mutation and emits metadata only', () => {
  for (const value of ["['--config', dockerConfig, '--host', dockerHost, ...args]", "['logs', '--timestamps', containerId]",
    "'psql', '-X', '-w', '-qAt'", 'shell: false', "['SystemRoot', 'WINDIR', 'PATH', 'Path', 'TEMP', 'TMP']",
    'stdoutSha256: sha(result.stdout', 'stderrSha256: sha(result.stderr', 'sha256: sha(value)',
  ]) expect(source).toContain(value);
  expect(source).not.toMatch(/['"](?:create|rm|remove|prune|restart|start|stop|kill|pull|run)['"]\s*[,\]]/);
  expect(source).not.toMatch(/\.Config\.Env|pg_dump|pg_restore|fixtures-private|keys-private|\.env['"]|POSTGRES_PASSWORD|\.\.\.process\.env/);
  expect(source).not.toMatch(/console\.(?:log|error)|process\.(?:stdout|stderr)\.write\((?:result|error|value)/);
});

it('limits qualification to the exact candidate function ACL rather than broader application acceptance', () => {
  for (const value of ['PASS_EXACT_CANDIDATE_FUNCTION_EXECUTE_ACL_ONLY',
    'committedSql: false', 'authorizedBodyExecutions: 0', 'applicationTablesCreated: 0', 'authorityStubsCreated: 0',
    'NOT HTTP, Auth, full AI51, main runtime or full F06 acceptance.',
    'Transaction rollback may still advance internal OID/WAL/log bookkeeping; no bit-identical server claim.',
  ]) expect(source).toContain(value);
});
