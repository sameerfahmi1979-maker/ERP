// Offline source contracts only. NEVER import the executable replay helper or
// read private receipts here. Main alone reviews/runs the local Docker replay.
import {expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const read = (file: string) => fs.readFileSync(path.resolve(file), 'utf8');
const source = read('tests/remediation/f06/candidate-replay-v73.mjs');
const previous = read('tests/remediation/f06/candidate-replay-v72.mjs');
const migration = read('supabase/migrations/20261004220907_f06_ai_approval_automatic_reminders.sql');
const historical73LastFile = '20261004220907_f06_ai_approval_automatic_reminders.sql';
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const between = (value: string, first: string, last: string) => {
  const start = value.indexOf(first), end = value.indexOf(last, start + first.length);
  expect(start).toBeGreaterThanOrEqual(0); expect(end).toBeGreaterThan(start);
  return value.slice(start, end);
};

it('keeps the qualified72 executable byte-frozen and explicitly historical', () => {
  expect(sha(fs.readFileSync(path.resolve('tests/remediation/f06/candidate-replay-v73.mjs')))).toBe('2005e97b4d87223e9d64e23a168e568da2a867d0593d9969272f162ed06b9677');
  expect(sha(fs.readFileSync(path.resolve('tests/remediation/f06/candidate-replay-v72.mjs')))).toBe('86cc5314afcfc3c9452e099fa7c856b78d25ee0d8217a8c43d433aa686c985bd');
  expect(source).toContain('Qualified72 stays a historical first72 receipt, not whole-current-candidate acceptance');
  expect(source).toContain('no v72 result is relabelled as v73');
  expect(previous).toContain('assert.equal(files.length, 72)');
  const author = read('tests/remediation/f06/candidate-replay-v72-authoring.test.ts');
  expect(author).toContain('const files = allFiles.filter(file => file <= expected[3].file)');
  expect(author).toContain('not the whole current candidate');
});

it('requires exact new opt-ins, path, target, journal and receipt without reuse arguments', () => {
  for (const value of ["assert.equal(process.argv.length, 2", "assert.equal(process.env.ALGT_F06_LOCAL_TARGET, 'candidate-replay')",
    "assert.equal(process.env.ALGT_F06_REPLAY73, '1'", "'C:/dev/agt-erp-f06'", "const target = 'f06_candidate_v73_20261005'",
    "'CANDIDATE_MIGRATION_REPLAY_V73_20261005.json'", "'CANDIDATE_MIGRATION_REPLAY_V73_INTENTS_20261005.jsonl'",
    "assert.ok(!fs.existsSync(receiptFile) && !fs.existsSync(journalFile)", "fs.openSync(journalFile, 'ax', 0o600)", "{flag: 'wx', mode: 0o600}"])
    expect(source).toContain(value);
  expect(source).not.toMatch(/process\.argv\[|\b(?:drop|alter) database\s+\$\{/i);
  expect(source).not.toContain("from './local-db.mjs'");
});

it('pins qualified72 receipt, complete target identity and manifest before opening the new journal', () => {
  for (const value of ["'CANDIDATE_MIGRATION_REPLAY_V72_QUALIFIED_20261005.json': '3c9b780c39b8a241f6bf1c91d7883276b91491a8c05a8a0ef981744b36935f5c'",
    "assert.equal(qualified72.state, 'PASS')", 'assert.equal(qualified72.applied.length, 72)',
    'assert.equal(qualified72.containerId, previous.containerId)', 'assert.equal(qualified72.source, source)',
    'assert.equal(qualified72.target, qualifiedTarget)', "{oid: '90019', name: qualifiedTarget, owner: 'supabase_admin', allowConnections: true}",
    'assert.equal(qualified72.backupSha256, recovery.backupSha256)', 'assert.equal(qualified72.priorEvidencePreserved, true)',
    'assert.equal(qualified72.sourceOverwritten, false)', 'assert.equal(qualified72.priorTargetsDeleted, 0)',
    'assert.deepEqual(qualified72.applied, historical72', 'assert.equal(qualified72.heldManifestSha256, sha(JSON.stringify(historical72)))']) {
    expect(source).toContain(value);
    expect(source.indexOf(value)).toBeLessThan(source.indexOf('fs.openSync(journalFile'));
  }
});

it('checks historical first73 extending reviewed first72, not whole-current-candidate replay acceptance', () => {
  expect(source).toContain('const expected = historical72.concat([added73])');
  expect(source).toContain('assert.equal(files.length, 73); assert.deepEqual(files, expected.map(row => row.file))');
  expect(source).toContain("const added73 = {file: '20261004220907_f06_ai_approval_automatic_reminders.sql', sha256: 'c5c798e7b3ddcd18eb50dd8adef2d872c6c4eaaa0235bdfee172c44b650bc93f'}");
  expect(sha(Buffer.from(migration))).toBe('c5c798e7b3ddcd18eb50dd8adef2d872c6c4eaaa0235bdfee172c44b650bc93f');
  const allFiles = fs.readdirSync(path.resolve('supabase/migrations')).filter(file => /^202610\d{8}_f06_[a-z_]+\.sql$/.test(file)).sort();
  const files = allFiles.filter(file => file <= historical73LastFile);
  expect(files).toHaveLength(73); expect(files[72]).toBe(historical73LastFile);
  expect(source.match(/fs\.readFileSync\(path\.join\(migrationDir,/g)).toHaveLength(1);
  expect(source).toContain('return Object.freeze({...row, text})');
  expect(source.indexOf('const migrations = expected.map')).toBeLessThan(source.indexOf('fs.openSync(journalFile'));
  expect(source).toContain('psql(target, migration.text, {readonly: false, migration: true})');
});

it('bounds the exact authorized post-V73 source inventory without claiming it was replayed', () => {
  const allFiles = fs.readdirSync(path.resolve('supabase/migrations')).filter(file => /^202610\d{8}_f06_[a-z_]+\.sql$/.test(file)).sort();
  expect(allFiles).toHaveLength(85);
  const suffix = allFiles.filter(file => file > historical73LastFile);
  expect(suffix).toEqual(['20261005083645_f06_atomic_batch_admission.sql','20261005153627_f06_durable_batch_draft_recovery.sql',
    '20261013064202_f06_finance_wait_authority.sql','20261013064225_f06_provider_wait_authority.sql',
    '20261014035305_f06_batch_graph_record_dispatch.sql','20261014040817_f06_legacy_batch_source_dispatch.sql',
    '20261014041444_f06_batch_authority_record_binding.sql','20261014042017_f06_batch_context_active_status.sql',
    '20261014082836_f06_batch_recovery_parameterized_seals.sql','20261015122044_f06_lookup_atomic_contract.sql',
    '20261015180904_f06_finance_reference_atomic_contract.sql','20261015203354_f06_finance_receipt_read_privilege.sql']);
  expect(sha(fs.readFileSync(path.resolve('supabase/migrations',suffix[0])))).toBe('41df2415cb2aedb063d16aed60eeefa335dcaa094fcfc74fa618da4218eee956');
  expect(sha(fs.readFileSync(path.resolve('supabase/migrations',suffix[1])))).toBe('f93a7204ff727eb20a0de13ed7c91a158cdde1bf88b77043210f882668cb9e7e');
  expect(sha(fs.readFileSync(path.resolve('supabase/migrations',suffix[2])))).toBe('35b91543de275eb62b7e3c3c43a0422bec84b836d124ee50876296deb301947a');
  expect(sha(fs.readFileSync(path.resolve('supabase/migrations',suffix[3])))).toBe('c86edd08fa71f63ef06dd4021e1f547d4cfbb565c4c97723e112dadd1c7c7a97');
  expect(sha(fs.readFileSync(path.resolve('supabase/migrations',suffix[4])))).toBe('4492d4884b086b903bb6f3bb5e7269057aadadf33dea859a057b1841b6b81da7');
  expect(sha(fs.readFileSync(path.resolve('supabase/migrations',suffix[5])))).toBe('12774d9e04986d90409ca0d445b22d550e0f0a8ed8a9941a986d61519b72e91e');
  expect(sha(fs.readFileSync(path.resolve('supabase/migrations',suffix[6])))).toBe('9bc9bde27a8537900518bb84ba46e15ca4c252e14ec36640775c65b0cc99d051');
  expect(sha(fs.readFileSync(path.resolve('supabase/migrations',suffix[7])))).toBe('260ae6a5c6ed545ea2020f8c752233e9bcc9dc8c51e0b6a13979ac1f5ff44617');
  expect(sha(fs.readFileSync(path.resolve('supabase/migrations',suffix[8])))).toBe('b05978d09a3478839c9f0ade897d1ec7f7ead9563867d566aed329092772ad63');
  expect(sha(fs.readFileSync(path.resolve('supabase/migrations',suffix[9])))).toBe('aa75b3c06dd680a0e0325729a5bec37c16fb37524404dbdaa758d73e8b20f87a');
  expect(sha(fs.readFileSync(path.resolve('supabase/migrations',suffix[10])))).toBe('a56d60469ceb6da3e8c3a56a62baeb034c20344c570afb1c6c4c0314c371b025');
  expect(sha(fs.readFileSync(path.resolve('supabase/migrations',suffix[11])))).toBe('f804f23c52992d6fd12d4cf9fdc564939b1d27702413fca6d7969cc9b59312f9');
});

it('retains the exact preflight-failed absence and failed clone while protecting qualified72', () => {
  for (const value of ["const failedTarget = 'f06_candidate_v72_20261005'", "const retainedTarget = 'f06_candidate_v72_fixed_20261005'",
    "const qualifiedTarget = 'f06_candidate_v72_qualified_20261005'", 'assert.equal(failed.targetIdentity, null)',
    "{oid: '90018', name: retainedTarget, owner: 'supabase_admin', allowConnections: true}",
    'assert.equal(failed.heldManifestSha256, sha(JSON.stringify(historical72))',
    'assert.equal(retained.heldManifestSha256, sha(JSON.stringify(historical72))',
    'assert.ok(priorDatabaseNames.includes(retainedTarget)', 'assert.ok(priorDatabaseNames.includes(qualifiedTarget)',
    'assert.deepEqual(beforeDatabases.find(row => row.name === qualifiedTarget), qualified72.targetIdentity',
    'assert.notEqual(canonicalPgOid(targetIdentity.oid), canonicalPgOid(qualified72.targetIdentity.oid))']) expect(source).toContain(value);
  expect(between(source, 'const priorDatabaseNames =', 'assert.ok(!priorDatabaseNames.includes(target))')).not.toMatch(/\.state|\.failedStage|\.targetIdentity|\.applied/);
  expect(source.indexOf('assert.deepEqual(beforeDatabases.find(row => row.name === qualifiedTarget)')).toBeLessThan(source.indexOf("append('create-database-intent'"));
});

it('reuses reviewed bounded guard, read-only fingerprinting and historical boundary mechanics unchanged', () => {
  const ranges = [
    ['function processRun(', 'const helpers72 ='],
    ['const helpers72 =', 'function boundaryChecks()'],
  ];
  expect(between(source, ranges[0][0], ranges[0][1])).toBe(between(previous, ranges[0][0], ranges[0][1]));
  expect(between(source, ranges[1][0], 'const functions73 =')).toBe(between(previous, ranges[1][0], ranges[1][1]));
  const oldBoundaries = between(previous, 'function boundaryChecks()', 'let result;');
  const newBoundaries = between(source, 'function boundaryChecks()', 'let result;');
  expect(newBoundaries).toBe(oldBoundaries.replace('helpers72: verify72()}', 'helpers72: verify72(), automaticReminders73: verify73()}'));
  expect(source).toContain("timeout, killSignal: 'SIGTERM'");
  expect(source).toContain("repeatable read read only;set local statement_timeout='20s'");
  expect(source).toContain('Docker client termination is not proof of server backend exit after a timeout');
});

it('observes73 before application and requires exact bodies, OIDs, ACLs and execution properties afterwards', () => {
  expect(source).toContain("const functions73 = ['erp_private.complete_ai_approval(uuid,jsonb)', 'public.finish_numbered_ai_intake(uuid,jsonb,text)']");
  expect(source).toContain('if (index === 72) before73 = capture73Boundary()');
  expect(source.indexOf('if (index === 72)')).toBeLessThan(source.indexOf("append('migration-intent'"));
  expect(source).toContain("Object.entries(row).filter(([key]) => key !== 'bodySha256')");
  expect(source).toContain('assert.deepEqual(sansBodies(after.functions), sansBodies(before73.functions)');
  expect(source).toContain("assert.equal(row.definer, row.signature.startsWith('erp_private.'))");
  expect(source).toContain("if (row.definer) assert.equal(row.owner, 'postgres')");
  expect(source).toContain('assert.equal(row.anon, false); assert.equal(row.human, true); assert.equal(row.service, false)');
  expect(source).toContain('migrations[72].text.match(new RegExp(');
  expect(source).toContain("assert.equal(row.bodySha256, sha(body.replaceAll('\\r\\n', '\\n')))");
  for (const name of ['erp_private.complete_ai_approval', 'public.finish_numbered_ai_intake']) {
    const body = migration.match(new RegExp(`create or replace function ${name.replaceAll('.', '\\.')}\\([\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`, 'i'))?.[1];
    expect(body).toBeTruthy(); expect(sha(body!)).toMatch(/^[a-f0-9]{64}$/);
  }
});

it('checks all other ERP functions and every policy plus table access/rows, without executing approval functions', () => {
  const boundary = between(source, 'function capture73Boundary()', 'function boundaryChecks()');
  expect(boundary).toContain("n.nspname in ('public','erp_private') and p.oid not in");
  expect(boundary).toContain('from pg_policies p');
  expect(boundary).toContain("'acl',c.relacl,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity");
  expect(boundary).toContain("'number',a.attnum,'acl',a.attacl");
  expect(boundary).toContain("['otherFunctions', 'policiesSha256', 'relationAccessSha256', 'catalogue', 'data']");
  expect(boundary).toContain('data: tableData(target, catalogue)');
  expect(boundary).toContain('actualApprovalFunctionsExecuted: false');
  expect(boundary).not.toMatch(/(?:select|perform) (?:public\.finish_numbered_ai_intake|erp_private\.complete_ai_approval)\(/i);
  expect(source).toContain('do not accept the separately blocked original-image ACL probe or AR01-AR20 runtime behavior');
});

it('preserves baseline and prior evidence, logs intents before each write and retains failed targets without repair', () => {
  for (const value of ['assert.deepEqual(snapshot(source), baseline', 'assert.deepEqual(tableData(target, baseline.catalogue), baseline.data',
    "append('failure-preservation-observed'", 'snapshotFiles(); preservation.priorReceiptsUnchanged = true',
    'assert.deepEqual(identities().filter(row => row.name !== target), initialDatabases)',
    "fs.fsyncSync(journal)", 'baselineDumpRead: false, productionRowsCopied: 0, providersActivated: 0, priorTargetsDeleted: 0']) expect(source).toContain(value);
  expect(source.indexOf("append('create-database-intent'")).toBeLessThan(source.indexOf('create database ${ident(target)}'));
  expect(source.indexOf("append('migration-intent'")).toBeLessThan(source.indexOf('psql(target, migration.text'));
  expect(source).not.toMatch(/keys-private|fixtures-private|readFileSync\([^\n]*\.dump/);
});
