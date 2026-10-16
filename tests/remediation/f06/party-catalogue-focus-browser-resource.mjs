// MAIN ONLY. Read-only observer for the two exact retained browser fixtures.
// UI alone performs description changes. Never overwrites the original run.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {guard,sql,evidence} from './local-db.mjs';
import {focusSteps as steps,focusDefinitions as definitions,validateFocusActor,validateFocusSnapshot} from './party-catalogue-focus-validation.mjs';

assert.equal(process.env.ALGT_F06_LOCAL_TARGET,undefined);
const containerId=guard();
assert.equal(containerId,'68ba17ecef10f3f77ae563b68d68bd146331bf844eeb735a3dae0d7831fd1d0c');
const marker='F06FOCUS0512',originalMarker='F06BROWSER0511';
// Main supplies these non-secret IDs from its successful fresh0512 preparation
// receipt. Never infer them from a name/prefix or read browser credentials.
assert.match(process.env.ALGT_F06_FOCUS_PROFILE_ID??'',/^[1-9][0-9]*$/);
const expectedActor={marker:'F06BROWSER0512',profileId:Number(process.env.ALGT_F06_FOCUS_PROFILE_ID),authId:process.env.ALGT_F06_FOCUS_AUTH_ID};
validateFocusActor(expectedActor);
assert.equal(process.argv.length,3);
const step=process.argv[2],index=steps.indexOf(step);assert.ok(index>=0);
const output=name=>path.join(evidence,`PARTY_CATALOGUE_FOCUS_${marker}_${name}.json`);
assert.equal(fs.existsSync(output(step)),false,'Keep the original evidence; recorded steps cannot be repeated.');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const originalFile=path.join(evidence,`PARTY_CATALOGUE_BROWSER_${originalMarker}_final.json`);
const originalBytes=fs.readFileSync(originalFile),original=JSON.parse(originalBytes);
assert.equal(original.marker,originalMarker);assert.equal(original.step,'final');assert.equal(original.retirementComplete,true);
const state=definitions.map(({table,key,code,id})=>({table,code,...JSON.parse(sql(`begin transaction read only;set local statement_timeout='15s';set local lock_timeout='3s';
 select json_build_object(
 'rows',(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from public.${table} r where id=${id} and ${key}='${code}'),
 'unrelated',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by id),'[]')::text) from public.${table} r where id<>${id}),
 'audits',(select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]') from public.audit_logs a where a.entity_name='${table}' and a.entity_id=${id}),
 'receipts',(select coalesce(jsonb_agg(to_jsonb(r) order by operation_id),'[]') from erp_private.master_lifecycle_receipts r where entity='${table}' and record_id=${id}));rollback;`))}));
let previousSha256=null;
const priorStates=[];
for(const priorStep of steps.slice(0,index)){
 const previousBytes=fs.readFileSync(output(priorStep)),previous=JSON.parse(previousBytes);
 assert.equal(previous.originalSha256,sha(originalBytes));assert.equal(previous.marker,marker);
 assert.equal(previous.step,priorStep);assert.equal(previous.containerId,containerId);
 assert.deepEqual(previous.expectedActor,expectedActor,'Reserved browser actor identity changed.');
 assert.equal(previous.previousSha256,previousSha256,'Earlier focus receipt chain changed.');
 priorStates.push(previous.state);previousSha256=sha(previousBytes);
}
validateFocusSnapshot(step,state,original.state,priorStates,expectedActor);
const result={at:new Date().toISOString(),marker,step,containerId,expectedActor,originalSha256:sha(originalBytes),previousSha256,state,
 intent:step==='reserve'?'Reuse only inactive category105 and relationship43: append the specified description sentence through UI, unchanged save, dirty cancel/discard, then restore the original description through UI. Never activate, reclassify, delete or overwrite history.':undefined,
 observerDatabaseWrites:0,productionWrites:0,casePassClaim:false,restorationComplete:step==='final'};
fs.writeFileSync(output(step),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({marker,step,restorationComplete:result.restorationComplete,casePassClaim:false,state:state.map(item=>({table:item.table,id:item.rows[0].id,revision:item.rows[0].workspace_revision,audits:item.audits.length,receipts:item.receipts.length}))}));
