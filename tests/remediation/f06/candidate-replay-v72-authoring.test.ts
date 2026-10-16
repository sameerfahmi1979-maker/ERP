// Static author checks only. The replay helper is read as text, NEVER imported.
// No subprocess, database, Auth, Storage or provider is used by this file.
import {expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const source = fs.readFileSync(path.resolve('tests/remediation/f06/candidate-replay-v72.mjs'), 'utf8');
const sha = (value: Buffer) => createHash('sha256').update(value).digest('hex');
it('has exactly scoped opt-ins and no reset/resume or arbitrary target arguments', () => {
  expect(source).toContain("assert.equal(process.argv.length, 2");
  expect(source).toContain("assert.equal(process.env.ALGT_F06_LOCAL_TARGET, 'candidate-replay')");
  expect(source).toContain("assert.equal(process.env.ALGT_F06_REPLAY72, '1'");
  expect(source).toContain("const failedTarget = 'f06_candidate_v72_20261005'");
  expect(source).toContain("const retainedTarget = 'f06_candidate_v72_fixed_20261005'");
  expect(source).toContain("const target = 'f06_candidate_v72_qualified_20261005'");
  expect(source).toContain("path.join(evidence, 'CANDIDATE_MIGRATION_REPLAY_V72_QUALIFIED_20261005.json')");
  expect(source).toContain("path.join(evidence, 'CANDIDATE_MIGRATION_REPLAY_V72_QUALIFIED_INTENTS_20261005.jsonl')");
  expect(source).not.toMatch(/process\.argv\[|\b(?:drop|alter) database\s+\$\{/i);
  expect(source).not.toContain("from './local-db.mjs'");
});
it('pins the second failed attempt and requires its exact retained OID and complete database identity', () => {
  expect(source).toContain("'CANDIDATE_MIGRATION_REPLAY_V72_FIXED_20261005.json': '78fc4b624fe2b4438d6f32a2d3212a0c15526629f57ea0ad64a16742d63db8e9'");
  for (const check of ["assert.equal(retained.state, 'FAILED')", "assert.equal(retained.failedStage, 'clone new database')",
    'assert.deepEqual(retained.applied, [])',
    "assert.deepEqual(retained.targetIdentity, {oid: '90018', name: retainedTarget, owner: 'supabase_admin', allowConnections: true})",
    'assert.equal(retained.containerId, previous.containerId)', 'assert.equal(retained.source, source)',
    'assert.equal(retained.target, retainedTarget)', 'assert.equal(retained.backupSha256, recovery.backupSha256)',
    'assert.deepEqual(retained.failurePreservation, {priorReceiptsUnchanged: true, priorDatabaseIdentitiesUnchanged: true, baselineUnchanged: true})',
    'assert.equal(retained.heldManifestSha256, sha(JSON.stringify(expected))',
    'assert.ok(priorDatabaseNames.includes(retainedTarget)',
    'assert.deepEqual(beforeDatabases.find(row => row.name === retainedTarget), retained.targetIdentity']) expect(source).toContain(check);
  expect(source.indexOf('assert.deepEqual(beforeDatabases.find(row => row.name === retainedTarget)')).toBeLessThan(source.indexOf("append('create-database-intent'"));
  expect(source).toContain("import {canonicalPgOid} from './candidate-replay-oid.mjs'");
  expect(source).toContain('for (const row of observed) canonicalPgOid(row.oid)');
  expect(source).toContain('assert.notEqual(canonicalPgOid(targetIdentity.oid), canonicalPgOid(baselineIdentity.oid))');
  expect(source).toContain('assert.notEqual(canonicalPgOid(targetIdentity.oid), canonicalPgOid(retained.targetIdentity.oid))');
  expect(source).toContain("assert.equal(targetIdentity.allowConnections, true)");
  expect(source).not.toContain('Number.isInteger(targetIdentity.oid)');
  expect(source).not.toMatch(/\b(?:targetIdentity|baselineIdentity|retained\.targetIdentity|row)\.oid\s*=(?!=)|parseInt\(|parseFloat\(/);
});
it('hashes full ordered sequence JSON inside PostgreSQL without lossy JS bigint conversion', () => {
  // Reproduce why hashing JSON.parse output would conflate adjacent bigint state.
  const first = '[{"last_value":9007199254740992}]';
  const second = '[{"last_value":9007199254740993}]';
  expect(JSON.stringify(JSON.parse(first))).toBe(JSON.stringify(JSON.parse(second)));
  expect(sha(Buffer.from(first))).not.toBe(sha(Buffer.from(second)));
  const snapshot = source.slice(source.indexOf('function snapshot(database)'), source.indexOf('function safeBaseline()'));
  expect(snapshot).toContain('const sequenceSha256 = psql(database,');
  expect(snapshot).toContain('digestSql("coalesce(jsonb_agg(to_jsonb(s) order by schemaname,sequencename),\'[]\'::jsonb)::text")');
  expect(snapshot).toContain("from pg_sequences s where schemaname not like 'pg_%' and schemaname<>'information_schema'");
  expect(snapshot).toContain("sequenceHashAlgorithm: 'postgres-jsonb-ordered-sha256-v1'");
  expect(snapshot).not.toContain('JSON.parse'); expect(snapshot).not.toContain('JSON.stringify');
  expect(source).toContain('Historical JavaScript-parsed sequence hashes are retained unchanged and are not comparable');
});
it('pins the prior preflight failure and admits only its exactly absent target exception', () => {
  expect(source).toContain("'CANDIDATE_MIGRATION_REPLAY_V72_20261005.json': '312b875580ee940dded6659daccfc6a8b027999a59ceece958e4b2017cbb1c05'");
  for (const check of ["assert.equal(failed.state, 'FAILED')", "assert.equal(failed.failedStage, 'preflight')",
    'assert.deepEqual(failed.applied, [])', 'assert.equal(failed.targetIdentity, null)',
    'assert.equal(failed.containerId, previous.containerId)', 'assert.equal(failed.source, source)',
    'assert.equal(failed.target, failedTarget)', 'assert.equal(failed.backupSha256, recovery.backupSha256)',
    'assert.deepEqual(failed.failurePreservation, {priorReceiptsUnchanged: true, priorDatabaseIdentitiesUnchanged: true, baselineUnchanged: true})',
    'assert.equal(failed.heldManifestSha256, sha(JSON.stringify(expected))']) expect(source).toContain(check);
  const names = source.slice(source.indexOf('const priorDatabaseNames ='), source.indexOf('assert.ok(!priorDatabaseNames.includes(target))'));
  expect(names).toContain('priorReceipts.map(row => row.target)');
  expect(names).toContain('&& name !== failedTarget');
  expect(names).not.toMatch(/\.state|\.failedStage|\.targetIdentity|\.applied/);
  expect(source).toContain('[...priorDatabaseNames, target, failedTarget].map(quote)');
  expect(source).toContain("assert.ok(!beforeDatabases.some(row => row.name === failedTarget), 'Pinned preflight-failed target must remain absent')");
  expect(source.indexOf('assert.ok(!beforeDatabases.some')).toBeLessThan(source.indexOf("append('create-database-intent'"));
  expect(source.indexOf('assert.equal(failed.state')).toBeLessThan(source.indexOf('fs.openSync(journalFile'));
});
it('binds the 26 prerequisite permission codes to the two actual F03 seed sources', () => {
  const employeeSeed = fs.readFileSync(path.resolve('supabase/migrations/20260923070453_f03_employee_subject_scopes.sql'), 'utf8');
  const rolesSeed = fs.readFileSync(path.resolve('supabase/migrations/20260923064605_f03_role_administration_guards.sql'), 'utf8');
  const codeBlock = employeeSeed.match(/INSERT INTO public\.permissions[\s\S]*?unnest\(ARRAY\[([\s\S]*?)\]\) code ON CONFLICT/);
  expect(codeBlock).not.toBeNull();
  const employeeCodes = [...codeBlock![1].matchAll(/'([^']+)'/g)].map(match => match[1]);
  expect(employeeCodes).toHaveLength(25);
  expect(rolesSeed).toContain("VALUES('users.roles.assign','Assign scoped user roles','users','assign',true) ON CONFLICT(permission_code) DO NOTHING");
  const heldBlock = source.match(/const expectedPermissionCodes = \[([\s\S]*?)\]\.sort\(\);/);
  expect(heldBlock).not.toBeNull();
  const heldCodes = [...heldBlock![1].matchAll(/'([^']+)'/g)].map(match => match[1]);
  expect(heldCodes.sort()).toEqual([...employeeCodes, 'users.roles.assign'].sort());
  expect(new Set(heldCodes).size).toBe(26);
  expect(heldCodes.filter(code => /\.(self|team)$/.test(code))).toHaveLength(20);
  expect(heldCodes.filter(code => !/\.(self|team)$/.test(code))).toEqual([
    'hr.banking.manage', 'hr.banking.view', 'hr.confidential.manage', 'hr.confidential.view', 'users.employee_link.manage', 'users.roles.assign',
  ]);
});
it('requires exactly three business rows plus pinned permission metadata before any clone', () => {
  const baselineChecks = source.slice(source.indexOf('const publicRows = baseline.data.filter'), source.indexOf("append('baseline-observed'"));
  expect(baselineChecks).toContain("row.schema === 'public'");
  expect(baselineChecks).toContain('publicRows.filter(row => row.rows !== 0).map(({name, rows}) => ({name, rows}))');
  expect(baselineChecks).toContain("{name: 'currencies', rows: 1}, {name: 'departments', rows: 1}, {name: 'owner_companies', rows: 1}, {name: 'permissions', rows: 26}");
  expect(baselineChecks).toContain("assert.equal(publicRows.find(row => row.name === 'permissions').sha256, expectedPermissionSha256)");
  expect(baselineChecks).toContain('jsonb_agg(permission_code order by permission_code collate "C")');
  expect(baselineChecks).toContain('from public.permissions`), expectedPermissionCodes)');
  expect(source).toContain("const expectedPermissionSha256 = '37a93058ffbb3575a375c4f1f3559108c5222b2de6bd501e6633ff79a651f379'");
  expect(source).not.toContain('reduce((sum, row) => sum + row.rows, 0), 3');
  expect(source.indexOf('const publicRows =')).toBeLessThan(source.indexOf("append('create-database-intent'"));
  expect(source).toContain('preservedSyntheticRows: 3, preservedPrerequisitePermissionRows: 26');
  expect(source).toContain('does not retroactively prove identity to the historical backup bytes');
});
it('references historical first72 metadata and checks its four reviewed changes, not the whole current candidate', () => {
  // The actual replay verifies the private receipt. Offline CI must not read
  // private audit artifacts or pretend static checks independently verify it.
  expect(source).toContain("'CANDIDATE_MIGRATION_REPLAY_V69_FIXED_20261004.json': '73b5d52b168c00d6270b4ed5e90f266a8f10671a15258c6e5569bbfd7da11d09'");
  expect(source).toContain('assert.equal(sha(bytes), hash');
  expect(source).toContain('assert.equal(previous.applied.length, 69)');
  const expected: Array<{file: string; sha256: string}> = [
    {file: '20261004182739_f06_numbered_recruitment_consumers.sql', sha256: '2024485ce0cd63ceef1919deb691662057c3f97433c8de016b94f1c1b1d6ac22'},
    {file: '20261004192342_f06_numbered_hr_document_employee_consumer.sql', sha256: 'f81d063be875e9982b9fcfee3ff19de5dab81aaeb470bf147fa78b7b6d9847d6'},
    {file: '20261004193518_f06_numbered_ai_intake_approval.sql', sha256: 'af63a8897a38aaf02485f659d29133bdab1f7b53a13e184b2bd087de3ffae31b'},
    {file: '20261004195946_f06_existing_helper_search_paths.sql', sha256: '7e177e2cfa1d816a6f1041d01de38b2f512f710626403c0c782ac98b4b3cdda8'},
  ];
  const dir = path.resolve('supabase/migrations');
  // This helper/receipt is frozen historical first72 evidence. Later migrations
  // require their own replay; their presence must not rewrite or invalidate it.
  const allFiles = fs.readdirSync(dir).filter(file => /^202610\d{8}_f06_[a-z_]+\.sql$/.test(file)).sort();
  const files = allFiles.filter(file => file <= expected[3].file);
  expect(files).toHaveLength(72);
  expect(files[67]).toBe(expected[0].file);
  expect(files.slice(69)).toEqual(expected.slice(1).map(row => row.file));
  expect(source).toContain('assert.deepEqual(files, expected.map(row => row.file))');
  for (const row of expected) expect(sha(fs.readFileSync(path.join(dir, row.file)))).toBe(row.sha256);
  expect(source.indexOf('const migrations = expected.map')).toBeLessThan(source.indexOf('fs.openSync(journalFile'));
  expect(source.match(/fs\.readFileSync\(path\.join\(migrationDir,/g)).toHaveLength(1);
  expect(source).toContain('psql(target, migration.text, {readonly: false, migration: true})');
  expect(source).toContain('sha256: migration.sha256');
});
it('exclusively appends intents before writes and never overwrites a receipt', () => {
  expect(source).toContain("fs.openSync(journalFile, 'ax', 0o600)");
  expect(source).toContain('fs.fsyncSync(journal)');
  expect(source).toContain("{flag: 'wx', mode: 0o600}");
  expect(source.indexOf("append('create-database-intent'")).toBeLessThan(source.indexOf('create database ${ident(target)}'));
  expect(source.indexOf("append('migration-intent'")).toBeLessThan(source.indexOf('psql(target, migration.text'));
  expect(source).not.toMatch(/keys-private|fixtures-private|readFileSync\([^\n]*\.dump/);
});
it('bounds process/SQL reads and preserves baseline identity/schema/all-table fingerprints', () => {
  expect(source).toContain("timeout, killSignal: 'SIGTERM'");
  expect(source).toContain("repeatable read read only;set local statement_timeout='20s'");
  expect(source).toContain('assert.equal(containerId, previous.containerId)');
  expect(source).toContain('assert.deepEqual(snapshot(source), baseline');
  expect(source).toContain('assert.deepEqual(tableData(target, baseline.catalogue), baseline.data');
  expect(source).toContain('assert.deepEqual(identities(), cloned');
  expect(source).toContain("append('failure-preservation-observed'");
  expect(source).toContain("'--schema-only', '--lock-wait-timeout=5s'");
  expect(source).toContain('Row bodies stay inside PostgreSQL');
});
it('retains prior69 controls and adds exact68/70/71/72 structural boundaries', () => {
  for (const value of ['upload_timestamp_binding', 'upload_review_policies', 'signatory_direct_dml_denied',
    'recruitment_consumer_proofs', 'recruitment_consumer_facts', 'document_employee_insert_proofs',
    'document_employee_insert_facts', 'ai_approval_verified_copies', 'exact-primary-key', 'legacy_ai_batch_gate',
    "assert.equal(bindings.length, 22", '72 must preserve exact identities/ACLs/owners']) expect(source).toContain(value);
});
