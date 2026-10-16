// MAIN ONLY. Author-only until independently reviewed. Never import to inspect.
// Explicit ALGT_F06_LOCAL_TARGET=candidate-replay AND ALGT_F06_REPLAY72=1.
// No arguments, reset, drop, retry, credentials file, Auth, API or Storage calls.
// Prior databases/receipts remain retained. An interrupted attempt needs review,
// not an automated reuse of this exact target or append to its old journal.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {canonicalPgOid} from './candidate-replay-oid.mjs';

assert.equal(process.argv.length, 2, 'No replay arguments or reuse mode supported');
assert.equal(process.env.ALGT_F06_LOCAL_TARGET, 'candidate-replay');
assert.equal(process.env.ALGT_F06_REPLAY72, '1', 'Main-only explicit opt-in required');
const root = path.resolve(import.meta.dirname, '../../..');
assert.equal(root.replaceAll('\\', '/'), 'C:/dev/agt-erp-f06');
const runtime = path.join(root, 'CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F06/replay');
const evidence = 'C:/dev/agt-erp/CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F06';
const container = 'supabase_db_algt-f06-replay';
const source = 'f06_pre_candidate_recovery_20261003';
const failedTarget = 'f06_candidate_v72_20261005';
const retainedTarget = 'f06_candidate_v72_fixed_20261005';
const target = 'f06_candidate_v72_qualified_20261005';
const receiptFile = path.join(evidence, 'CANDIDATE_MIGRATION_REPLAY_V72_QUALIFIED_20261005.json');
const journalFile = path.join(evidence, 'CANDIDATE_MIGRATION_REPLAY_V72_QUALIFIED_INTENTS_20261005.jsonl');
const sha = value => createHash('sha256').update(value).digest('hex');
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
const ident = value => '"' + String(value).replaceAll('"', '""') + '"';
const qualified = row => `${ident(row.schema)}.${ident(row.name)}`;
const digestSql = value => `encode(sha256(convert_to(${value},'UTF8')),'hex')`;
const pinnedReceiptHashes = {
  'CANDIDATE_RECOVERY_20261003.json': '89cdf49b328b9ddc1937b071eda65a311caa7b8383948b929d22641e457abfe8',
  'CANDIDATE_MIGRATION_REPLAY_20261003.json': '351ba34af4e3604b1cf08117b1947cea10634bef6ba557023f77e5cea2308cf6',
  'CANDIDATE_MIGRATION_REPLAY_V69_FIXED_20261004.json': '73b5d52b168c00d6270b4ed5e90f266a8f10671a15258c6e5569bbfd7da11d09',
  'CANDIDATE_MIGRATION_REPLAY_V72_20261005.json': '312b875580ee940dded6659daccfc6a8b027999a59ceece958e4b2017cbb1c05',
  'CANDIDATE_MIGRATION_REPLAY_V72_FIXED_20261005.json': '78fc4b624fe2b4438d6f32a2d3212a0c15526629f57ea0ad64a16742d63db8e9',
};
const pinnedReceipts = Object.fromEntries(Object.entries(pinnedReceiptHashes).map(([name, hash]) => {
  const bytes = fs.readFileSync(path.join(evidence, name));
  assert.equal(sha(bytes), hash, `Reviewed receipt changed: ${name}`);
  return [name, JSON.parse(bytes)];
}));
const recovery = pinnedReceipts['CANDIDATE_RECOVERY_20261003.json'];
const historical = pinnedReceipts['CANDIDATE_MIGRATION_REPLAY_20261003.json'];
const previous = pinnedReceipts['CANDIDATE_MIGRATION_REPLAY_V69_FIXED_20261004.json'];
const failed = pinnedReceipts['CANDIDATE_MIGRATION_REPLAY_V72_20261005.json'];
const retained = pinnedReceipts['CANDIDATE_MIGRATION_REPLAY_V72_FIXED_20261005.json'];
assert.equal(recovery.state, 'PASS'); assert.equal(recovery.container, container); assert.equal(recovery.target, source);
assert.equal(previous.state, 'PASS'); assert.equal(previous.container, container); assert.equal(previous.source, source);
assert.equal(previous.applied.length, 69); assert.equal(previous.backupSha256, recovery.backupSha256);
assert.equal(historical.backupSha256, recovery.backupSha256); assert.equal(historical.rows.length, 3);
assert.equal(failed.state, 'FAILED'); assert.equal(failed.failedStage, 'preflight');
assert.deepEqual(failed.applied, []); assert.equal(failed.targetIdentity, null);
assert.equal(failed.container, container); assert.equal(failed.containerId, previous.containerId);
assert.equal(failed.source, source); assert.equal(failed.target, failedTarget);
assert.equal(failed.backupSha256, recovery.backupSha256);
assert.deepEqual(failed.failurePreservation, {priorReceiptsUnchanged: true, priorDatabaseIdentitiesUnchanged: true, baselineUnchanged: true});
assert.equal(failed.sourceOverwritten, false); assert.equal(failed.priorTargetsDeleted, 0);
assert.equal(retained.state, 'FAILED'); assert.equal(retained.failedStage, 'clone new database');
assert.deepEqual(retained.applied, []);
assert.deepEqual(retained.targetIdentity, {oid: '90018', name: retainedTarget, owner: 'supabase_admin', allowConnections: true});
assert.equal(canonicalPgOid(retained.targetIdentity.oid), '90018');
assert.equal(retained.container, container); assert.equal(retained.containerId, previous.containerId);
assert.equal(retained.source, source); assert.equal(retained.target, retainedTarget);
assert.equal(retained.backupSha256, recovery.backupSha256);
assert.deepEqual(retained.failurePreservation, {priorReceiptsUnchanged: true, priorDatabaseIdentitiesUnchanged: true, baselineUnchanged: true});
assert.equal(retained.sourceOverwritten, false); assert.equal(retained.priorTargetsDeleted, 0);
// F03 prerequisites seed authorization metadata, not synthetic business data.
// These exact codes come from employee_subject_scopes (25) and role_administration_guards (1).
const expectedPermissionCodes = [
  'hr.employees.view.self', 'hr.employees.view.team', 'hr.compliance.view.self', 'hr.compliance.view.team',
  'hr.attendance.view.self', 'hr.attendance.view.team', 'hr.leave.view.self', 'hr.leave.view.team',
  'hr.assignments.view.self', 'hr.assignments.view.team', 'hr.actions.view.self', 'hr.actions.view.team',
  'hr.payroll.view.self', 'hr.payroll.view.team', 'hr.medical.view.self', 'hr.medical.view.team',
  'hr.banking.view', 'hr.banking.manage', 'hr.banking.view.self', 'hr.banking.view.team',
  'hr.confidential.view', 'hr.confidential.manage', 'hr.confidential.view.self', 'hr.confidential.view.team',
  'users.employee_link.manage', 'users.roles.assign',
].sort();
const expectedPermissionSha256 = '37a93058ffbb3575a375c4f1f3559108c5222b2de6bd501e6633ff79a651f379';
assert.equal(expectedPermissionCodes.length, 26); assert.equal(new Set(expectedPermissionCodes).size, 26);
const amended68 = {file: '20261004182739_f06_numbered_recruitment_consumers.sql', sha256: '2024485ce0cd63ceef1919deb691662057c3f97433c8de016b94f1c1b1d6ac22'};
assert.equal(previous.applied[67].file, amended68.file);
assert.equal(previous.applied[67].sha256, 'c7a78b8499fa795140a3a26fcaeaa64725f9f3a7522081f70b89829d8f6cef32');
const expected = previous.applied.map((row, index) => index === 67 ? amended68 : row).concat([
  {file: '20261004192342_f06_numbered_hr_document_employee_consumer.sql', sha256: 'f81d063be875e9982b9fcfee3ff19de5dab81aaeb470bf147fa78b7b6d9847d6'},
  {file: '20261004193518_f06_numbered_ai_intake_approval.sql', sha256: 'af63a8897a38aaf02485f659d29133bdab1f7b53a13e184b2bd087de3ffae31b'},
  {file: '20261004195946_f06_existing_helper_search_paths.sql', sha256: '7e177e2cfa1d816a6f1041d01de38b2f512f710626403c0c782ac98b4b3cdda8'},
]);
assert.equal(failed.heldManifestSha256, sha(JSON.stringify(expected)), 'Failed attempt must concern the same reviewed candidate');
assert.equal(retained.heldManifestSha256, sha(JSON.stringify(expected)), 'Retained clone must concern the same reviewed candidate');
const migrationDir = path.join(root, 'supabase/migrations');
const files = fs.readdirSync(migrationDir).filter(name => /^202610\d{8}_f06_[a-z_]+\.sql$/.test(name)).sort();
assert.equal(files.length, 72); assert.deepEqual(files, expected.map(row => row.file));
// Read each migration ONCE before any subprocess or database use. Apply the same
// immutable string that was hashed, never reopen source to apply or receipt it.
const migrations = expected.map(row => {
  const bytes = fs.readFileSync(path.join(migrationDir, row.file));
  assert.equal(sha(bytes), row.sha256, `Unreviewed candidate bytes: ${row.file}`);
  const text = bytes.toString('utf8'); assert.equal(Buffer.compare(Buffer.from(text, 'utf8'), bytes), 0);
  return Object.freeze({...row, text});
});
Object.freeze(migrations);
// Preserve every existing replay/recovery receipt, not only the pinned inputs.
const priorReceipts = fs.readdirSync(evidence).filter(name => /^(?:CANDIDATE_MIGRATION_REPLAY|CANDIDATE_RECOVERY|CLEAN_CANDIDATE_BASELINE).*\.json$/.test(name)).sort().map(name => {
  const bytes = fs.readFileSync(path.join(evidence, name));
  return {name, sha256: sha(bytes), target: JSON.parse(bytes).target ?? null};
});
// Only the pinned preflight failure never created a target. Unrelated failed
// receipts still require their existing database identities to be retained.
const priorDatabaseNames = [...new Set([source, 'postgres', ...priorReceipts.map(row => row.target).filter(name => typeof name === 'string' && /^f06_candidate_v\d+(?:_[a-z]+)?_\d{8}$/.test(name) && name !== failedTarget)])].sort();
assert.ok(!priorDatabaseNames.includes(target));
assert.ok(priorDatabaseNames.includes(retainedTarget), 'The failed clone must remain an existing protected database');
assert.ok(!fs.existsSync(receiptFile) && !fs.existsSync(journalFile), 'Preserve prior attempt; no automatic retry');
// O_EXCL + O_APPEND: one owner, append-only durable intents, never truncate.
const journal = fs.openSync(journalFile, 'ax', 0o600);
let eventNo = 0, stage = 'reserved', containerId = null, baseline = null, targetIdentity = null, initialDatabases = null;
let before72 = null, before71Legacy = null;
const applied = [];
const append = (kind, data = {}) => { fs.writeSync(journal, JSON.stringify({event: ++eventNo, at: new Date().toISOString(), kind, ...data}) + '\n'); fs.fsyncSync(journal); };
const snapshotFiles = () => {
  for (const row of priorReceipts) assert.equal(sha(fs.readFileSync(path.join(evidence, row.name))), row.sha256, `Prior receipt altered: ${row.name}`);
};
append('reserved', {source, target, expected, reviewedChange: {ordinal: 68, previous: previous.applied[67], current: amended68},
  priorReceipts, pinnedReceiptHashes, backupSha256: recovery.backupSha256, baselineDumpRead: false,
  priorFailedAttempt: {target: failedTarget, receiptSha256: pinnedReceiptHashes['CANDIDATE_MIGRATION_REPLAY_V72_20261005.json'], appliedCount: 0, targetIdentity: null},
  retainedFailedClone: {identity: retained.targetIdentity, receiptSha256: pinnedReceiptHashes['CANDIDATE_MIGRATION_REPLAY_V72_FIXED_20261005.json'], appliedCount: 0},
  limits: {inspectMs: 10000, readProcessMs: 30000, statementMs: 20000, migrationProcessMs: 75000, schemaDumpMs: 60000}});

function processRun(args, input, timeout, purpose) {
  const result = spawnSync('docker', args, {input, encoding: 'utf8', timeout, killSignal: 'SIGTERM', windowsHide: true, maxBuffer: 32 * 1024 * 1024});
  if (result.error || result.status !== 0) {
    // Database error text can contain field values; retain only diagnostic
    // identity/digest, never raw stderr/stdout or statement text in failures.
    append('subprocess-failed', {purpose, status: result.status, signal: result.signal, code: result.error?.code ?? null, stderrSha256: sha(result.stderr ?? '')});
    throw Error(`Bounded subprocess failed: ${purpose}`);
  }
  return result.stdout.trim();
}
function guard() {
  assert.ok(!fs.existsSync(path.join(runtime, 'supabase/.temp/project-ref')), 'Replay stack must remain unlinked');
  const inspected = JSON.parse(processRun(['inspect', container], undefined, 10000, 'inspect isolated replay container'));
  assert.equal(inspected.length, 1); const current = inspected[0];
  assert.equal(current.Config.Labels['com.supabase.cli.project'], 'algt-f06-replay');
  assert.deepEqual(current.HostConfig.PortBindings['5432/tcp'], [{HostIp: '127.0.0.1', HostPort: '16662'}]);
  assert.equal(current.State.Running, true); assert.match(current.Id, /^[a-f0-9]{64}$/);
  if (containerId !== null) assert.equal(current.Id, containerId, 'Immutable replay container changed');
  return current.Id;
}
function psql(database, statement, {readonly = true, migration = false} = {}) {
  assert.ok([source, target, 'postgres'].includes(database), 'Closed database allowlist');
  guard();
  const input = readonly ? `begin transaction isolation level repeatable read read only;set local statement_timeout='20s';set local lock_timeout='3s';${statement};rollback;` : statement;
  return processRun(['exec', '-i', '-e', 'PGPASSWORD=postgres', '-e', 'PGCONNECT_TIMEOUT=5', '-e', 'PGOPTIONS=-c statement_timeout=20000 -c lock_timeout=3000 -c idle_in_transaction_session_timeout=25000',
    containerId, 'psql', '-w', '-X', '-q', '-A', '-t', '-U', 'supabase_admin', '-d', database, '-v', 'ON_ERROR_STOP=1'], input, migration ? 75000 : 30000, migration ? `apply ${stage}` : `read ${database}: ${stage}`);
}
const json = (database, statement) => JSON.parse(psql(database, statement));
function identities() {
  const observed = json('postgres', `select coalesce(jsonb_agg(jsonb_build_object('name',datname,'oid',oid,'owner',pg_get_userbyid(datdba),'allowConnections',datallowconn) order by datname),'[]') from pg_database where datname in (${[...priorDatabaseNames, target, failedTarget].map(quote).join(',')})`);
  for (const row of observed) canonicalPgOid(row.oid);
  return observed;
}
function schemaFingerprint(database) {
  guard(); assert.ok([source, target].includes(database));
  const dump = processRun(['exec', '-e', 'PGPASSWORD=postgres', '-e', 'PGCONNECT_TIMEOUT=5', '-e', 'PGOPTIONS=-c statement_timeout=20000 -c lock_timeout=3000', containerId,
    'pg_dump', '-w', '-U', 'supabase_admin', '-d', database, '--schema-only', '--lock-wait-timeout=5s'], undefined, 60000, `schema fingerprint ${database}`);
  // PostgreSQL17+ emits fresh psql restrict tokens; they are transport guards,
  // not schema. Retain ALL actual object definitions/owners/ACLs/comments.
  const normalized = dump.replaceAll('\r\n', '\n').split('\n').filter(line => !/^\\(?:un)?restrict\s+/.test(line)).join('\n');
  return {sha256: sha(normalized), normalizedRestrictTokensOnly: true};
}
function tableCatalogue(database) {
  const result = json(database, `select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,'columns',(select jsonb_agg(a.attname order by a.attnum) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped)) order by n.nspname,c.relname),'[]') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not like 'pg_%' and n.nspname<>'information_schema' and c.relkind in ('r','p','m','f')`);
  assert.ok(result.length > 0 && result.length <= 1000);
  assert.ok(result.every(row => row.kind !== 'f'), 'Foreign tables must never be fingerprinted');
  return result;
}
function tableData(database, catalogue) {
  // All non-system ordinary/partitioned/materialized tables, including Auth,
  // Storage and private metadata. Row bodies stay inside PostgreSQL. The row
  // multiset hash includes duplicates and is independent of physical order.
  const selects = catalogue.map(row => {
    assert.ok(row.columns.length > 0);
    const projection = row.columns.map(column => `t.${ident(column)}`).join(',');
    const hash = digestSql('to_jsonb(projected)::text');
    return `select ${quote(row.schema)}::text as schema,${quote(row.name)}::text as name,count(*)::bigint as rows,${digestSql(`coalesce(string_agg(h,'' order by h),'')`)} as sha256 from (select ${hash} as h from (select ${projection} from ${qualified(row)} t) projected) row_digests`;
  });
  return json(database, `select jsonb_agg(t order by schema,name) from (${selects.join(' union all ')}) t`);
}
function snapshot(database) {
  const catalogue = tableCatalogue(database);
  const data = tableData(database, catalogue);
  // Hash full ordered sequence JSON inside PostgreSQL: bigint fields must never
  // round-trip through JavaScript numbers. Historical JS hashes are unchanged
  // and are NOT comparable to this algorithm; both snapshots in this run use it.
  const sequenceSha256 = psql(database, `select ${digestSql("coalesce(jsonb_agg(to_jsonb(s) order by schemaname,sequencename),'[]'::jsonb)::text")} from pg_sequences s where schemaname not like 'pg_%' and schemaname<>'information_schema'`);
  assert.match(sequenceSha256, /^[a-f0-9]{64}$/);
  return {catalogue, data, sequenceSha256, sequenceHashAlgorithm: 'postgres-jsonb-ordered-sha256-v1', schema: schemaFingerprint(database)};
}
function safeBaseline() {
  return json(source, `select jsonb_build_object('authUsers',(select count(*) from auth.users),'emailQueue',(select count(*) from public.erp_email_queue),
    'subscriptions',(select count(*) from pg_subscription),'foreignServers',(select count(*) from pg_foreign_server),'largeObjects',(select count(*) from pg_largeobject_metadata),
    'publicTables',(select count(*) from pg_tables where schemaname='public'),'publicPolicies',(select count(*) from pg_policies where schemaname='public'),
    'candidateCurrencyFunctions',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='erp_private' and p.proname='save_currency_record'))`);
}
function historicalRows(database) {
  const ids = Object.fromEntries(historical.rows.map(row => [row.table, row.id]));
  for (const id of Object.values(ids)) assert.ok(Number.isSafeInteger(id) && id > 0);
  return json(database, `select jsonb_build_object(
    'company',coalesce((select jsonb_build_object('code',company_code,'name',legal_name_en,'status',status)=${quote(JSON.stringify(historical.before.company))}::jsonb from public.owner_companies where id=${ids.owner_companies}),false),
    'department',coalesce((select jsonb_build_object('code',department_code,'name',department_name_en,'owner_company_id',owner_company_id,'is_active',is_active)=${quote(JSON.stringify(historical.before.department))}::jsonb from public.departments where id=${ids.departments}),false),
    'currency',coalesce((select jsonb_build_object('code',currency_code,'name',currency_name_en,'decimal_places',decimal_places,'is_active',is_active,'sort_order',sort_order,'is_system',is_system,'is_locked',is_locked,'is_base_currency',is_base_currency)=${quote(JSON.stringify(historical.before.currency))}::jsonb from public.currencies where id=${ids.currencies}),false))`);
}
function functionMetadata(signatures) {
  const values = signatures.map(signature => `(${quote(signature)},${quote(signature)}::regprocedure)`).join(',');
  return json(target, `select jsonb_agg(jsonb_build_object('signature',v.signature,'oid',p.oid,'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'config',p.proconfig,'acl',p.proacl::text,'args',pg_get_function_identity_arguments(p.oid),'result',pg_get_function_result(p.oid),'language',l.lanname,'volatility',p.provolatile,'strict',p.proisstrict,'leakproof',p.proleakproof,'parallel',p.proparallel,'bodySha256',${digestSql("replace(p.prosrc,E'\\r\\n',E'\\n')")},'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'human',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service',has_function_privilege('service_role',p.oid,'EXECUTE')) order by v.signature) from (values ${values}) v(signature,id) join pg_proc p on p.oid=v.id join pg_language l on l.oid=p.prolang`);
}
const helpers72 = ['current_user_can_view_hr_recruitment', 'current_user_can_manage_hr_recruitment', 'set_updated_at', 'update_updated_at_column', 'set_updated_at_output_public_links', 'validate_lookup_value_parent', 'prevent_checksum_update', 'update_dms_document_content_tsv'].map(name => `public.${name}()`);
function verify72() {
  const after = functionMetadata(helpers72); assert.equal(after.length, 8);
  const changedBodies = new Set(['public.current_user_can_view_hr_recruitment()', 'public.current_user_can_manage_hr_recruitment()', 'public.update_dms_document_content_tsv()']);
  for (const row of after) {
    const old = before72.find(value => value.signature === row.signature); assert.ok(old);
    const withoutMutable = value => Object.fromEntries(Object.entries(value).filter(([key]) => !['bodySha256', 'config'].includes(key)));
    assert.deepEqual(withoutMutable(row), withoutMutable(old), '72 must preserve exact identities/ACLs/owners and execution properties');
    assert.deepEqual(row.config, ['search_path=""']);
    if (!changedBodies.has(row.signature)) assert.equal(row.bodySha256, old.bodySha256);
    else {
      const name = row.signature.slice('public.'.length, -2);
      const body = migrations[71].text.match(new RegExp(`create or replace function public\\.${name}\\(\\)[\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`, 'i'))?.[1];
      assert.ok(body, 'Exact72 body missing from held reviewed source'); assert.equal(row.bodySha256, sha(body.replaceAll('\r\n', '\n')));
    }
  }
  return after;
}
function boundaryChecks() {
  const human = ['public.create_numbered_dms_batch_draft(uuid,jsonb)', 'public.create_numbered_job_requisition(uuid,jsonb)',
    'public.convert_candidate_to_employee_atomic(bigint,uuid,bigint,jsonb)', 'public.prepare_numbered_dms_upload(bigint,bigint)',
    'public.create_numbered_dms_upload(uuid,jsonb)', 'public.finish_numbered_dms_upload(uuid,jsonb,text)',
    'public.prepare_numbered_candidate_conversion(bigint)', 'public.prepare_document_employee_sources(jsonb)',
    'public.create_numbered_document_employee(uuid,jsonb,jsonb)', 'public.prepare_numbered_ai_intake(jsonb)',
    'public.reserve_numbered_ai_intake(uuid,jsonb)', 'public.finish_numbered_ai_intake(uuid,jsonb,text)'];
  const attestation = ['public.attest_numbered_dms_upload(bigint,uuid,uuid,jsonb,bigint,text,uuid,text,timestamptz,text,bigint,text)',
    'public.attest_numbered_ai_intake(bigint,uuid,uuid,jsonb,uuid,text,timestamptz,text,bigint,text)'];
  const triggers68 = ['prove_recruitment_target_insert', 'prove_recruitment_fact', 'capture_recruitment_consumer_receipt', 'complete_recruitment_consumer_proof'];
  const triggers70 = ['prove_document_employee_insert', 'require_document_employee_completion', 'prove_document_employee_fact_insert', 'capture_document_employee_receipt'];
  const closed = [...triggers68, ...triggers70].map(name => `erp_private.${name}()`);
  const functions = functionMetadata([...human, ...attestation, ...closed]);
  assert.equal(functions.length, human.length + attestation.length + closed.length);
  for (const row of functions) {
    assert.deepEqual(row.config, ['search_path=""']); assert.equal(row.anon, false);
    if (human.includes(row.signature)) { assert.equal(row.definer, false); assert.equal(row.human, true); assert.equal(row.service, false); }
    else { assert.equal(row.owner, 'postgres'); assert.equal(row.definer, true); assert.equal(row.human, false); assert.equal(row.service, attestation.includes(row.signature)); }
  }
  const tables = ['recruitment_consumer_receipts', 'recruitment_consumer_proofs', 'recruitment_consumer_facts',
    'upload_verified_copies', 'upload_creation_completions', 'document_employee_receipts', 'document_employee_insert_proofs',
    'document_employee_insert_facts', 'ai_approval_plans', 'ai_approval_verified_copies'];
  const tableBoundary = json(target, `select jsonb_agg(jsonb_build_object('name',c.relname,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'anon',has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') or has_any_column_privilege('anon',c.oid,'SELECT,INSERT,UPDATE'),'human',has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') or has_any_column_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE'),'service',has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE') or has_any_column_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE'),'ownerInsert',has_table_privilege('postgres',c.oid,'INSERT')) order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='erp_private' and c.relname in (${tables.map(quote).join(',')})`);
  assert.equal(tableBoundary.length, tables.length);
  for (const row of tableBoundary) assert.deepEqual({...row, name: undefined}, {name: undefined, owner: 'postgres', rls: true, anon: false, human: false, service: false, ownerInsert: true});
  // Exact trigger table/function/event/timing/deferral bindings from immutable
  // reviewed68/70 bytes, not a loose global trigger-name count.
  const bindings = [migrations[67], migrations[69]].flatMap(migration => [...migration.text.matchAll(/create\s+(constraint\s+)?trigger\s+(\w+)\s+(before|after)\s+([\s\S]*?)\s+on\s+([\w.]+)\s+([\s\S]*?)execute function\s+([\w.]+)\(\);/gi)].map(match => {
    const events = match[4].toLowerCase(), rest = match[6].toLowerCase();
    return {name: match[2], table: match[5], function: match[7] + '()', type: (/for each row/.test(rest) ? 1 : 0) + (match[3].toLowerCase() === 'before' ? 2 : 0) + (/\binsert\b/.test(events) ? 4 : 0) + (/\bdelete\b/.test(events) ? 8 : 0) + (/\bupdate\b/.test(events) ? 16 : 0), constraint: !!match[1], deferred: /deferrable initially deferred/.test(rest)};
  }));
  assert.equal(bindings.length, 22, 'Reviewed68/70 trigger inventory changed');
  const exactTriggers = json(target, `select jsonb_agg(jsonb_build_object('name',v.name,'table',v.relation,'function',v.fn,'ok',coalesce(t.tgfoid=v.fn::regprocedure and t.tgtype=v.kind and t.tgenabled='O' and (t.tgconstraint<>0)=v.constrained and t.tgdeferrable=v.deferred and t.tginitdeferred=v.deferred,false)) order by v.relation,v.name) from (values ${bindings.map(row => `(${quote(row.name)},${quote(row.table)},${quote(row.function)},${row.type},${row.constraint},${row.deferred})`).join(',')}) v(name,relation,fn,kind,constrained,deferred) left join pg_trigger t on t.tgrelid=v.relation::regclass and t.tgname=v.name and not t.tgisinternal`);
  assert.equal(exactTriggers.length, bindings.length); assert.ok(exactTriggers.every(row => row.ok));
  const completionTables = [['recruitment_consumer_facts', 'recruitment_consumer_proofs'], ['document_employee_insert_facts', 'document_employee_insert_proofs']];
  const proofKeys = {
    recruitment_consumer_receipts: ['actor', 'operation_id'], recruitment_consumer_proofs: ['actor', 'operation_id'],
    recruitment_consumer_facts: ['actor', 'operation_id', 'table_name', 'record_id'], document_employee_receipts: ['actor', 'operation_id'],
    document_employee_insert_proofs: ['actor', 'operation_id'], document_employee_insert_facts: ['actor', 'operation_id', 'table_name', 'record_id'],
    ai_approval_plans: ['actor_id', 'operation_id'], ai_approval_verified_copies: ['actor_id', 'operation_id'],
  };
  const checks = [
    `select 'upload_timestamp_binding' as name, strpos(prosrc,'date_trunc(''milliseconds'',o.updated_at) is distinct from p_updated_at')>0 and strpos(prosrc,'p_path,p_object,p_version,o.updated_at,p_sha256')>0 as ok from pg_proc where oid=${quote(attestation[0])}::regprocedure`,
    `select 'upload_review_policies',count(*)=4 from pg_policies where schemaname='public' and tablename='dms_intake_review_values' and policyname in ('f01_intake_select','f01_intake_insert','f01_intake_update','f01_intake_delete') and coalesce(qual,with_check) like '%upload_session_permission%'`,
    `select 'signatory_direct_dml_denied',not(has_table_privilege('authenticated','public.owner_company_signatories','INSERT,UPDATE,DELETE') or has_any_column_privilege('authenticated','public.owner_company_signatories','INSERT,UPDATE'))`,
    ...completionTables.map(([child, parent]) => `select ${quote(child + ':proof-cascade')},exists(select 1 from pg_constraint where conrelid=${quote('erp_private.' + child)}::regclass and confrelid=${quote('erp_private.' + parent)}::regclass and contype='f' and confdeltype='c')`),
    ...Object.entries(proofKeys).map(([table, keys]) => `select ${quote(table + ':exact-primary-key')},(select jsonb_agg(a.attname order by k.ordinality) from pg_constraint c cross join lateral unnest(c.conkey) with ordinality k(attnum,ordinality) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum where c.conrelid=${quote('erp_private.' + table)}::regclass and c.contype='p')=${quote(JSON.stringify(keys))}::jsonb`),
    `select 'ai_verified_copy_plan_binding',exists(select 1 from pg_constraint where conrelid='erp_private.ai_approval_verified_copies'::regclass and confrelid='erp_private.ai_approval_plans'::regclass and contype='f')`,
    ...tables.map(table => `select ${quote(table + ':empty')},count(*)=0 from erp_private.${ident(table)}`),
    `select 'legacy_ai_batch_gate',strpos(prosrc,'IF v_mode IS DISTINCT FROM ''existing_batch_draft'' THEN')>0 from pg_proc where oid='public.approve_dms_ai_intake(jsonb)'::regprocedure`,
    `select 'auth_users_empty',count(*)=0 from auth.users`, `select 'email_queue_empty',count(*)=0 from public.erp_email_queue`,
  ];
  const observations = json(target, `select jsonb_agg(t) from (${checks.join(' union all ')}) t`);
  assert.equal(observations.length, checks.length); assert.ok(observations.every(row => row.ok));
  const legacy = functionMetadata(['public.approve_dms_ai_intake(jsonb)'])[0];
  const sansBody = row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'bodySha256'));
  assert.deepEqual(sansBody(legacy), sansBody(before71Legacy), 'Retained legacy batch API identity/ACL/owner changed');
  return {functions, tableBoundary, exactTriggers, observations, legacyBatchPreserved: true, helpers72: verify72()};
}

let result;
try {
  stage = 'preflight'; containerId = guard();
  // Bind to the same observed stack as the last completed replay, not merely a
  // recycled Docker project name with matching port/labels.
  assert.equal(containerId, previous.containerId);
  const beforeDatabases = identities();
  initialDatabases = beforeDatabases;
  assert.ok(!beforeDatabases.some(row => row.name === failedTarget), 'Pinned preflight-failed target must remain absent');
  assert.deepEqual(beforeDatabases.map(row => row.name), priorDatabaseNames);
  assert.deepEqual(beforeDatabases.find(row => row.name === retainedTarget), retained.targetIdentity, 'Retained failed clone identity changed');
  const baselineIdentity = beforeDatabases.find(row => row.name === source);
  assert.equal(baselineIdentity.owner, 'supabase_admin'); assert.equal(baselineIdentity.allowConnections, true);
  const safety = safeBaseline();
  assert.deepEqual(safety, {authUsers: 0, emailQueue: 0, subscriptions: 0, foreignServers: 0, largeObjects: 0, publicTables: 280, publicPolicies: 1203, candidateCurrencyFunctions: 0});
  assert.deepEqual(historicalRows(source), {company: true, department: true, currency: true});
  baseline = snapshot(source);
  const publicRows = baseline.data.filter(row => row.schema === 'public');
  assert.deepEqual(publicRows.filter(row => row.rows !== 0).map(({name, rows}) => ({name, rows})), [
    {name: 'currencies', rows: 1}, {name: 'departments', rows: 1}, {name: 'owner_companies', rows: 1}, {name: 'permissions', rows: 26},
  ], 'Require three synthetic business rows, 26 F03 permission definitions, and zero rows in every other public table');
  assert.equal(publicRows.find(row => row.name === 'permissions').sha256, expectedPermissionSha256);
  assert.deepEqual(json(source, `select coalesce(jsonb_agg(permission_code order by permission_code collate "C"),'[]') from public.permissions`), expectedPermissionCodes);
  append('baseline-observed', {container, containerId, identity: baselineIdentity, safety, snapshot: baseline, priorDatabaseIdentities: beforeDatabases, historicalSyntheticMatches: true,
    failedTargetAbsent: failedTarget, syntheticBusinessRows: 3, prerequisitePermissionRows: 26, prerequisitePermissionSha256: expectedPermissionSha256});
  snapshotFiles();
  stage = 'clone new database'; append('create-database-intent', {source, sourceOid: baselineIdentity.oid, target, owner: 'supabase_admin'});
  psql('postgres', `create database ${ident(target)} with template ${ident(source)} owner supabase_admin`, {readonly: false});
  const cloned = identities(); targetIdentity = cloned.find(row => row.name === target);
  assert.ok(targetIdentity); canonicalPgOid(targetIdentity.oid);
  assert.equal(targetIdentity.owner, 'supabase_admin'); assert.equal(targetIdentity.allowConnections, true);
  assert.notEqual(canonicalPgOid(targetIdentity.oid), canonicalPgOid(baselineIdentity.oid));
  assert.notEqual(canonicalPgOid(targetIdentity.oid), canonicalPgOid(retained.targetIdentity.oid));
  assert.deepEqual(cloned.filter(row => row.name !== target), beforeDatabases);
  append('database-created', {identity: targetIdentity});
  assert.deepEqual(snapshot(target), baseline, 'Fresh clone differs before any candidate migration');
  for (let index = 0; index < migrations.length; index++) {
    const migration = migrations[index]; stage = migration.file;
    if (index === 70) before71Legacy = functionMetadata(['public.approve_dms_ai_intake(jsonb)'])[0];
    if (index === 71) before72 = functionMetadata(helpers72);
    append('migration-intent', {ordinal: index + 1, file: migration.file, sha256: migration.sha256, targetOid: targetIdentity.oid});
    assert.deepEqual(identities(), cloned, 'Database resource identities changed during replay');
    psql(target, migration.text, {readonly: false, migration: true});
    applied.push({file: migration.file, sha256: migration.sha256});
    append('migration-applied', {ordinal: index + 1, ...applied.at(-1)});
  }
  stage = 'postflight';
  const boundaries = boundaryChecks();
  assert.deepEqual(snapshot(source), baseline, 'Recovered baseline schema/data/sequence state changed');
  assert.deepEqual(safeBaseline(), safety);
  assert.deepEqual(identities(), cloned, 'Prior database OID/owner identity changed');
  assert.deepEqual(tableData(target, baseline.catalogue), baseline.data, 'An original table row/field was changed; new columns alone are allowed');
  assert.deepEqual(historicalRows(target), {company: true, department: true, currency: true});
  const targetSnapshot = snapshot(target);
  snapshotFiles();
  result = {state: 'PASS', boundaries, preservedOriginalTables: baseline.catalogue.length, preservedSyntheticRows: 3, preservedPrerequisitePermissionRows: 26, targetSnapshot};
  append('postflight-pass', {preservedOriginalTables: baseline.catalogue.length, preservedSyntheticRows: 3, preservedPrerequisitePermissionRows: 26, failedTargetAbsent: failedTarget, baselineSchemaSha256: baseline.schema.sha256, targetSchemaSha256: targetSnapshot.schema.sha256});
} catch (error) {
  // Failed target and every committed migration remain retained. No reset/drop,
  // recovery retry, permission relaxation or raw PostgreSQL diagnostic output.
  result = {state: 'FAILED', failedStage: stage, failureType: error?.name ?? 'Error', failureMessageSha256: sha(String(error?.message ?? error))};
  append('failed-retained', result);
  // Best-effort bounded READ-ONLY preservation proof even on failure. A failed
  // check is recorded, never treated as authority to restore or repair anything.
  const preservation = {priorReceiptsUnchanged: false, priorDatabaseIdentitiesUnchanged: null, baselineUnchanged: null};
  try { snapshotFiles(); preservation.priorReceiptsUnchanged = true; } catch { /* fail closed in receipt */ }
  if (initialDatabases && containerId) {
    try { assert.deepEqual(identities().filter(row => row.name !== target), initialDatabases); preservation.priorDatabaseIdentitiesUnchanged = true; }
    catch { preservation.priorDatabaseIdentitiesUnchanged = false; }
  }
  if (baseline && containerId) {
    try { assert.deepEqual(snapshot(source), baseline); preservation.baselineUnchanged = true; }
    catch { preservation.baselineUnchanged = false; }
  }
  result.failurePreservation = preservation; append('failure-preservation-observed', preservation);
}
append('completed', {state: result.state, appliedCount: applied.length, source, target, targetOid: targetIdentity?.oid ?? null});
fs.closeSync(journal);
const receipt = {at: new Date().toISOString(), container, containerId, source, target, targetIdentity, ...result, applied,
  heldManifestSha256: sha(JSON.stringify(expected)), reviewedChangeFrom69: {ordinal: 68, previous: previous.applied[67], current: amended68},
  journal: path.basename(journalFile), journalSha256: sha(fs.readFileSync(journalFile)), priorReceipts,
  backupSha256: recovery.backupSha256, priorEvidencePreserved: result.state === 'PASS', sourceOverwritten: false,
  limitations: ['The historical recovery receipt has no cryptographic whole-schema/all-table fingerprint. This run checks its recorded schema counts/three historical synthetic business records plus the 26 F03 prerequisite permission definitions against their exact reviewed codes and current observed row-multiset hash, then captures all-table/schema fingerprints and proves their in-run preservation; it does not retroactively prove identity to the historical backup bytes.',
    'All non-system ordinary/partitioned/materialized table rows are fingerprinted, not emitted. Foreign tables and large objects are rejected. PostgreSQL system catalog rows/shared globals are not business-data fingerprints; source schema definitions/ACLs/owners/comments are covered by normalized schema-only pg_dump.',
    'No baseline dump is read or restored. No prior database is reset, dropped, resumed or written. Prior database identity and receipt bytes are checked, not complete contents of every old candidate database.',
    'Each bounded read uses a read-only repeatable-read transaction; schema/table/sequence captures span connections. Main must serialize replay work and exclude concurrent users/writers. Detected changes fail closed; no cross-database global snapshot is claimed.',
    'This run hashes full ordered sequence JSON inside PostgreSQL to preserve bigint precision for both source and new target. Historical JavaScript-parsed sequence hashes are retained unchanged and are not comparable to this versioned algorithm.',
    'Migration SQL retains its own60-second statement limits; child execution is bounded75seconds. Docker client termination is not proof of server backend exit after a timeout. A timeout leaves a retained failed attempt for exact main-only inspection, never an automatic retry.',
    'Schema replay and structural ACL/trigger checks do not replace actual Auth/RLS transaction cases, browser/output acceptance, infrastructure recovery certification or phase/deployment approval.'],
  baselineDumpRead: false, productionRowsCopied: 0, providersActivated: 0, priorTargetsDeleted: 0};
fs.writeFileSync(receiptFile, JSON.stringify(receipt, null, 2), {flag: 'wx', mode: 0o600});
console.log(JSON.stringify({state: result.state, migrations: applied.length, target, receipt: path.basename(receiptFile), journal: path.basename(journalFile), sourceOverwritten: false, priorTargetsDeleted: 0}));
assert.equal(result.state, 'PASS', 'Replay failed; retained exact journal/target require review; no automatic reuse');
