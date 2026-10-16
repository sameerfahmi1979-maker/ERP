'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {execFileSync} = require('node:child_process');
const assert = require('node:assert/strict');
const {sha256} = require('./migration-manifest.cjs');
const labRoot = 'C:/dev/agt-erp-integration-lab-20261016';
const sourceRoot = path.resolve(__dirname,'../../../..');
const baselineSha256 = '7e2263cb4869d93c58e502b455ad181348615e9b794432afeacf49852c83ce4c';
function assertSchemaReceipt(receipt, registry, manifestBytes) {
  const text = manifestBytes.toString('utf8').replace(/\r\n/g,'\n'), manifest=JSON.parse(text);
  assert.equal(receipt.state,'PASS_SCHEMA_ONLY_REPLAY_NOT_APP_ACCEPTANCE');
  assert.equal(receipt.owner,'algt-integration-20261016');
  assert.equal(receipt.api,'http://127.0.0.1:16921');
  assert.equal(receipt.app,'http://127.0.0.1:16941');
  assert.equal(receipt.syntheticOnly,true);assert.equal(receipt.externalDelivery,false);
  assert.equal(receipt.productionRowsCopied,0);
  assert.equal(receipt.containerId,registry.containers.find(row => row.service === 'db').id);
  assert.equal(receipt.baselineSha256,baselineSha256,'Wrong predecessor baseline');
  assert.equal(receipt.manifestSha256,sha256(text),'Schema receipt manifest bytes differ from this reviewed candidate');
  const digest=sha256(manifest.migrations.map(row=>`${row.name} ${row.sha256}\n`).join(''));
  assert.equal(manifest.digest,digest,'Manifest digest must verify independently');
  assert.equal(receipt.orderedMigrationDigest,digest,'Schema receipt chronological migration digest differs');
  assert.deepEqual(receipt.source,manifest.source,'Schema receipt donor identities differ');
  assert.equal(manifest.migrations.length,128);assert.equal(receipt.applied.length,128,'Incomplete schema replay');
  const composition=manifest.migrations.filter(row=>row.group==='composition');assert.equal(composition.length,1);
  assert.equal(receipt.compositionSha256,composition[0].sha256,'Schema receipt selection composition differs');
  for(let index=0;index<manifest.migrations.length;index++){
    const expected=manifest.migrations[index],actual=receipt.applied[index];
    for(const key of ['order','name','group','path','sha256','bytes'])assert.equal(actual[key],expected[key],`Applied migration ${index+1} ${key} differs`);
    assert.match(actual.actualCommit,/^[a-f\d]{40}$/,'Every applied migration needs an immutable source identity');
    if(expected.commit!==null)assert.equal(actual.actualCommit,expected.commit,'Applied donor commit differs');
  }
  assert.equal(receipt.compositionCommit,receipt.applied.find(row=>row.group==='composition').actualCommit,'Composition receipt commit differs from applied source');
  return {manifest,composition:receipt.applied.find(row=>row.group==='composition')};
}
async function guardedLab() {
  assert.equal(process.env.ALGT_SCHEMA_NATIVE_TARGET,'algt-integration-20261016','Explicit isolated native target admission required');
  const lab = await import(pathToFileURL(path.join(labRoot,'bootstrap.mjs')).href);
  const registry = lab.verify();
  const receipt = JSON.parse(fs.readFileSync(path.join(labRoot,'schema-receipt.json'),'utf8'));
  const {composition}=assertSchemaReceipt(receipt,registry,fs.readFileSync(path.join(sourceRoot,'docs/integration/f00-f06/schema/MIGRATION_MANIFEST_20261016.json')));
  const blob=execFileSync('git',['show',`${composition.actualCommit}:${composition.path}`],{cwd:sourceRoot,maxBuffer:1024*1024});
  assert.equal(sha256(blob),composition.sha256,'Applied composition does not resolve to its reviewed immutable Git blob');
  return {sql:lab.sql,verify:lab.verify};
}
function guardFailureMessage(error) {
  const match = String(error?.message).match(/inspect (sql-failure-\d+-private\.log);/);
  if (!match) throw error;
  return fs.readFileSync(path.join(labRoot,match[1]),'utf8');
}
module.exports = {guardedLab,guardFailureMessage,assertSchemaReceipt};
