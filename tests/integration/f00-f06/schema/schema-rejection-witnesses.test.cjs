'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {NEW_MIGRATION,sha256} = require('../../../../tooling/integration/f00-f06/schema/migration-manifest.cjs');
const {witnesses,migrationBody,witnessSql,snapshotSql,runWitness} = require('../../../../tooling/integration/f00-f06/schema/schema-rejection-witnesses.cjs');
const root = path.resolve(__dirname,'../../../..');
const source = fs.readFileSync(path.join(root,'supabase/migrations',NEW_MIGRATION),'utf8').replace(/\r\n/g,'\n');
const manifest = JSON.parse(fs.readFileSync(path.join(root,'docs/integration/f00-f06/schema/MIGRATION_MANIFEST_20261016.json'),'utf8'));
const expectedSha = manifest.migrations.find(row=>row.name===NEW_MIGRATION).sha256;
const body = migrationBody(source,expectedSha);
test('all eight remaining rejection gates have distinct reviewed witnesses',()=>{
  assert.deepEqual(witnesses.map(row=>row.id),['replay','wrong-owner','missing-safe-view','widened-safe-view','altered-helper','raw-table-grant','disabled-rls','extra-permissive-policy']);
  assert.equal(new Set(witnesses.map(row=>row.id)).size,8);
});
test('composition body is exact except outer transaction wrappers and bad hashes fail closed',()=>{
  assert.equal(`BEGIN;\n${body}COMMIT;\n`,source);
  assert.throws(()=>migrationBody(`${source}\n`,expectedSha));
  assert.throws(()=>migrationBody(source,'0'.repeat(64)));
  assert.throws(()=>migrationBody('SELECT 1;',sha256('SELECT 1;')));
});
for(const witness of witnesses) test(`rollback-only transaction preserves every migration guard: ${witness.id}`,()=>{
  const sql = witnessSql(witness,body);
  assert.ok(sql.startsWith('BEGIN;\n') && sql.endsWith('\nROLLBACK;'));
  assert.ok(sql.includes(body));
  assert.doesNotMatch(sql,/^\s*COMMIT\b/im);
  assert.equal(sql.includes('DROP VIEW public.perf_report_template_selection;'),!witness.keepSelector);
  const expectedPrefix=witness.expected.split(':')[0];
  assert.ok(body.includes(expectedPrefix),`Corresponding guard must exist: ${witness.id}`);
  assert.doesNotMatch(witness.mutation,/\bCASCADE\b|\b(?:INSERT|DELETE|UPDATE)\s+(?:INTO|FROM|public\.)/i);
});
test('unreviewed witness and inner commit are rejected before execution',()=>{
  assert.throws(()=>witnessSql({...witnesses[0]},body));
  assert.throws(()=>witnessSql(witnesses[0],'COMMIT;'));
});
function fakeLab(witness,{unexpectedSuccess=false,unrelatedFailure=false,changedCatalog=false}={}){
  const calls=[];let snapshots=0;
  return {calls,sql(sql,timeout,role){
    calls.push({sql,timeout,role});
    if(sql===snapshotSql)return changedCatalog && ++snapshots===2?'changed':'original';
    assert.equal(role,'postgres');assert.equal(timeout,90000);
    if(unexpectedSuccess)return 'unexpected success';
    throw Error(unrelatedFailure?'ERROR:  unrelated database failure':`ERROR:  ${witness.expected}`);
  }};
}
test('a successful witness requires exact expected failure and before/after catalog equality',()=>{
  const witness=witnesses[0],lab=fakeLab(witness);
  runWitness(lab,error=>error.message,witness,body);
  assert.equal(lab.calls.length,3);
  assert.equal(lab.calls[0].sql,snapshotSql);assert.equal(lab.calls[2].sql,snapshotSql);
});
for(const option of ['unexpectedSuccess','unrelatedFailure','changedCatalog'])test(`native runner cannot accept ${option}`,()=>{
  const witness=witnesses[0],lab=fakeLab(witness,{[option]:true});
  assert.throws(()=>runWitness(lab,error=>error.message,witness,body));
  assert.equal(lab.calls.at(-1).sql,snapshotSql,'Cleanup catalog must be inspected even on failure');
});
test('failure-log processing error still triggers independent cleanup snapshot',()=>{
  const witness=witnesses[0],lab=fakeLab(witness);
  assert.throws(()=>runWitness(lab,()=>{throw Error('log unavailable');},witness,body),/log unavailable/);
  assert.equal(lab.calls.at(-1).sql,snapshotSql);
});
test('catalog snapshot is read-only and includes all touched relation and helper authority',()=>{
  assert.ok(snapshotSql.startsWith('BEGIN READ ONLY;') && snapshotSql.endsWith('ROLLBACK;'));
  for(const field of ['to_jsonb(c)','a.attacl','pg_get_viewdef','pg_policy','to_jsonb(p)','pg_get_functiondef','integration_selection_missing_safe_witness'])assert.ok(snapshotSql.includes(field));
});
