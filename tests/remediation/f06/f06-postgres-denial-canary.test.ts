// PURE STATIC author checks: this file reads source, NEVER imports the canary.
// No child processes, Docker, database, credentials, private receipts or network.
// Author-only until main independently elects to run these checks.
import {expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
const source = fs.readFileSync(path.resolve('tests/remediation/f06/f06-postgres-denial-canary.mjs'), 'utf8');

it('requires main-only opt-in, exact image pins, no arguments, and one new namespace', () => {
  for (const fragment of ["assert.equal(process.argv.length, 2", "process.platform, 'win32'",
    "process.env.ALGT_F06_LOCAL_TARGET, 'postgres-denial-canary'",
    "process.env.ALGT_F06_POSTGRES_DENIAL_CANARY, '1'", "const expectedArch = 'amd64'",
    "const expectedImageId = 'sha256:4c39816ce8d9303a3aba1161c842929c73a40c7109a9ef1b644582478e31832e'",
    "const expectedRepoDigest = 'public.ecr.aws/supabase/postgres@sha256:4c39816ce8d9303a3aba1161c842929c73a40c7109a9ef1b644582478e31832e'",
    "const imageTag = 'public.ecr.aws/supabase/postgres:17.6.1.113'",
    "const containerName = 'f06-postgres-denial-canary-1761113-20261005'",
    "const volumeName = 'f06-postgres-denial-canary-1761113-20261005-data'",
    "const databaseName = 'f06_denial_canary_20261005'"]) expect(source).toContain(fragment);
  expect(source).not.toMatch(/process\.argv\[|\b(?:import|require)\s*\(?\s*['"][^'"]*(?:local-db|candidate-replay)/);
});

it('reserves exclusive durable evidence before writes and preserves previous resources', () => {
  expect(source).toContain("fs.openSync(journalFile, 'ax', 0o600)");
  expect(source).toContain('fs.fsyncSync(journal)');
  expect(source).toContain("fs.openSync(receiptFile, 'wx', 0o600)");
  expect(source).toContain('fs.fsyncSync(receiptFd)');
  expect(source).toContain('previousEventHash = sha(line)');
  for (const [intent, mutation] of [
    ["append('volume-create-intent'", "docker('volume-create'"],
    ["append('container-create-intent'", "docker('container-create'"],
    ["append('container-start-intent'", "docker('container-start'"],
    ["append('synthetic-database-create-intent'", "sql('synthetic-database-create'"],
    ["append('synthetic-functions-create-intent'", "sql('synthetic-functions-create'"],
    ["append('denial-canary-intent'", "sql('denial-canary'"]]) {
    expect(source.indexOf(intent)).toBeGreaterThan(-1);
    expect(source.indexOf(intent)).toBeLessThan(source.indexOf(mutation));
  }
  expect(source).toContain('assert.deepEqual(volumeIdentity.labels, labels)');
  expect(source).toContain('qualification-failed-resources-retained');
  expect(source).not.toMatch(/['"](?:rm|remove|prune|restart|stop|kill|pull|run)['"]\s*[,\]]/);
  expect(source).not.toMatch(/\b(?:drop|alter)\s+(?:role|user|database)\b/i);
});

it('pins local transport and immutable image, rejects ports/networks/mount sharing', () => {
  for (const fragment of ["npipe:////./pipe/dockerDesktopLinuxEngine", "['--config', dockerConfig, '--host', dockerHost, ...args]",
    'assert.equal(fs.existsSync(dockerConfig), false',
    "assert.equal(pinnedImage.id, expectedImageId)", 'pinnedImage.repoDigests.includes(expectedRepoDigest)',
    'assert.equal(pinnedImage.architecture, expectedArch)', "'create','--pull','never'",
    "'--network','none','--ipc','private','--restart','no'", 'volume-nocopy',
    "pinnedImage.id],", "assert.equal(item.mounts.length, 1)",
    "assert.equal(item.networkMode, 'none')", 'Object.keys(item.ports ?? {}).length, 0',
    "assert.equal(item.pidMode, '')", "assert.equal(item.restartPolicy, 'no')",
    'assert.equal(item.restartCount, 0)', 'assert.equal(item.privileged, false)']) expect(source).toContain(fragment);
  expect(source).not.toMatch(/['"]--(?:publish|publish-all|volumes-from|privileged|entrypoint|env-file|use-api-socket)['"]/);
  expect(source).not.toContain('.Config.Env');
});

it('preserves official startup and hints without loading external data or credentials', () => {
  for (const fragment of ["pinnedImage.entrypoint, ['docker-entrypoint.sh']",
    "pinnedImage.cmd, ['postgres','-D','/etc/postgresql']", "'--env','POSTGRES_PASSWORD'",
    "POSTGRES_PASSWORD:randomBytes(48).toString('hex')", 'hintGucRegistered',
    "current_setting('supautils.hint_roles')", "includes('supautils')",
    "item.hints.split(',').map(s => s.trim()).sort(), [...roles].sort()",
    "'hints','preload','sharedPreload','reservedRoles'", "supabase/postgres/blob/17.6.1.113/Dockerfile-17"]) expect(source).toContain(fragment);
  expect(source).not.toMatch(/(?:set|SET)\s+(?:supautils\.|session_preload_libraries|shared_preload_libraries)/);
  expect(source).not.toMatch(/['"]POSTGRES_HOST_AUTH_METHOD(?:=|['"])/);
  expect(source).not.toMatch(/pg_dump|pg_restore|fixtures-private|keys-private|readFileSync\([^\n]*['"]\.env/);
  expect(source).not.toContain('...process.env');
});

it('runs six caught EXECUTE denials in one unchanged backend with separate independent health', () => {
  for (const fragment of ["['anon', 'authenticated', 'service_role']",
    "['f06_denial_sql_invoker', 'f06_denial_plpgsql_definer']", 'security invoker', 'security definer',
    'from public,anon,authenticated,service_role', 'exception when insufficient_privilege',
    'get stacked diagnostics observed=returned_sqlstate,observed_message=message_text',
    "observed <> '42501'", "observed_message <> 'permission denied for function ${fn}'",
    'CANARY_EXPECTED_EXECUTE_DENIAL', 'CANARY_WRONG_PRIVILEGES',
    'assert.equal(rows.length, 8)', 'sameBackend:true', 'item.pid, expected.pid',
    "'postmasterEpoch'", "'post-canary-independent-health'", 'item.inRecovery, false',
    'assert.equal(finalContainer.pid, running.pid)', 'assert.equal(finalContainer.startedAt, running.startedAt)',
    'segmentation fault|signal 11|PANIC:', 'database system was interrupted',
    "['logs', '--timestamps', containerId]", "assert.equal(crash, false"]) expect(source).toContain(fragment);
});

it('bounds subprocess and SQL time, redacts raw failures and explicitly limits acceptance', () => {
  for (const fragment of ['timeout = 10000', "killSignal: 'SIGTERM'", 'windowsHide: true',
    'shell: false', 'maxBuffer: 8 * 1024 * 1024', 'timeout:30000', "statement_timeout='5s'",
    "lock_timeout='2s'", "idle_in_transaction_session_timeout='10s'", "transaction_timeout='20s'",
    'readinessDeadline = Date.now() + 90000', 'stdoutSha256: sha(proc.stdout',
    'stderrSha256: sha(proc.stderr', "state:'PASS_SQL_CANARY_ONLY'", "state:'FAIL_RETAINED'",
    'Not HTTP/PostgREST/Auth/RLS application acceptance', 'No qualification. Resources may exist']) expect(source).toContain(fragment);
  expect(source).not.toMatch(/console\.(?:log|error)|process\.(?:stdout|stderr)\.write\((?:proc|response|error|content)/);
  expect(source).not.toMatch(/fs\.(?:writeFileSync|appendFileSync)\([^\n]*(?:stdout|stderr|password|content)/i);
});
