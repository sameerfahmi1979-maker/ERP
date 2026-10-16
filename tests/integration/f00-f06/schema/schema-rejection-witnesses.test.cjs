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

const widenedWitness = witnesses.find(row=>row.id==='widened-safe-view');
const qualifiedPredicate = 'erp_private.can_read_report_branding(p.owner_company_id)';
const unqualifiedPredicate = 'erp_private.can_read_report_branding(owner_company_id)';
// Synthetic pg_get_viewdef-shaped text, not a native catalog capture or private rows.
const safeViewFixture = (predicate,qualified=false) => ` SELECT id,
    profile_name,
    owner_company_id,
    CASE
        WHEN erp_private.report_branding_permission('sign'::text, owner_company_id) THEN signature_url
        ELSE NULL::text
    END AS signature_url
   FROM public.erp_report_branding_profiles${qualified?' p':''}
  WHERE ((deleted_at IS NULL) AND ${predicate});`;

// Exercise the exact emitted pattern and model its two SQL admission checks.
// This is offline authoring evidence, not execution of PostgreSQL or the guard.
function modelWidenedView(view) {
  const definitions = [...widenedWitness.mutation.matchAll(/authority_pattern constant text := \$predicate\$([^]*?)\$predicate\$;/g)];
  assert.equal(definitions.length,1);
  const pattern = new RegExp(definitions[0][1],'g');
  const matches = [...view.matchAll(pattern)].map(match=>match[0]);
  const widened = view.replace(pattern,'true');
  return {matches,widened,admitted:matches.length===1 && !widened.includes('can_read_report_branding')};
}

test('widening SQL rejects zero/multiple matches and unknown residual calls before executing the mutation',()=>{
  const sql = widenedWitness.mutation;
  const count = "SELECT count(*) INTO predicate_count FROM regexp_matches(original, authority_pattern, 'g');";
  const single = "IF predicate_count <> 1 THEN RAISE EXCEPTION 'Witness requires exactly one known safe-view authority predicate'; END IF;";
  const replace = "widened := regexp_replace(original, authority_pattern, 'true', 'g');";
  const known = "IF strpos(widened, 'can_read_report_branding') > 0 THEN RAISE EXCEPTION 'Witness found an unknown safe-view authority predicate'; END IF;";
  const execute = "EXECUTE 'CREATE OR REPLACE VIEW public.erp_report_branding_profiles_safe WITH (security_barrier=true) AS ' || widened;";
  for(const statement of [count,single,replace,known,execute])assert.equal(sql.split(statement).length,2);
  const positions = [count,single,replace,known,execute].map(statement=>sql.indexOf(statement));
  assert.deepEqual([...positions].sort((a,b)=>a-b),positions);
  assert.equal(widenedWitness.expected,'Reviewed F06 safe branding projection changed');
});

for(const [name,predicate] of [['qualified',qualifiedPredicate],['native-shaped unqualified',unqualifiedPredicate]]) {
  test(`widening recognizes exactly one ${name} predicate and preserves every other byte`,()=>{
    const qualified = name==='qualified';
    const view = safeViewFixture(predicate,qualified),result = modelWidenedView(view);
    assert.deepEqual(result.matches,[predicate]);assert.equal(result.admitted,true);
    assert.equal(result.widened,safeViewFixture('true',qualified));
    if(name==='native-shaped unqualified')assert.equal(view.includes(qualifiedPredicate),false);
  });
}
for(const [name,predicate,expectedMatches] of [
  ['absent','true',0],
  ['duplicate qualified',`${qualifiedPredicate} AND ${qualifiedPredicate}`,2],
  ['duplicate unqualified',`${unqualifiedPredicate} AND ${unqualifiedPredicate}`,2],
  ['mixed known forms',`${qualifiedPredicate} OR ${unqualifiedPredicate}`,2],
  ['unknown alias','erp_private.can_read_report_branding(q.owner_company_id)',0],
  ['unknown argument','erp_private.can_read_report_branding(branding_profile_id)',0],
  ['unknown schema','another_private.can_read_report_branding(owner_company_id)',0],
  ['prefixed schema','other_erp_private.can_read_report_branding(owner_company_id)',0],
  ['quoted schema','"erp_private".can_read_report_branding(owner_company_id)',0],
  ['unknown spacing','erp_private.can_read_report_branding( owner_company_id )',0],
  ['known plus unknown',`${unqualifiedPredicate} OR erp_private.can_read_report_branding(q.owner_company_id)`,1],
])test(`widening refuses ${name} rather than guessing an authority predicate`,()=>{
  const result = modelWidenedView(safeViewFixture(predicate));
  assert.equal(result.matches.length,expectedMatches);assert.equal(result.admitted,false);
});

test('widening keeps the exact migration rejection and rejects its own setup failure as a false pass',()=>{
  const good = fakeLab(widenedWitness);
  runWitness(good,error=>error.message,widenedWitness,body);
  const bad = fakeLab(widenedWitness);
  assert.throws(()=>runWitness(bad,()=> 'ERROR:  Witness requires exactly one known safe-view authority predicate',widenedWitness,body),/Expected widened-safe-view migration guard rejection/);
  assert.equal(bad.calls.at(-1).sql,snapshotSql);
});
