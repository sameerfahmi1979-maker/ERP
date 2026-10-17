'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {sha256}=require('../../../../tooling/integration/f00-f06/schema/migration-manifest.cjs');
const {assertSchemaReceipt}=require('../../../../tooling/integration/f00-f06/schema/guarded-lab.cjs');
const bytes=fs.readFileSync(path.resolve(__dirname,'../../../../docs/integration/f00-f06/schema/MIGRATION_MANIFEST_20261016.json'));
const manifest=JSON.parse(bytes);
const registry={containers:[{service:'db',id:'1'.repeat(64)}]};
function receipt(){return{state:'PASS_SCHEMA_ONLY_REPLAY_NOT_APP_ACCEPTANCE',owner:'algt-integration-20261016',api:'http://127.0.0.1:16921',app:'http://127.0.0.1:16941',syntheticOnly:true,externalDelivery:false,productionRowsCopied:0,containerId:'1'.repeat(64),
  baselineSha256:'7e2263cb4869d93c58e502b455ad181348615e9b794432afeacf49852c83ce4c',manifestSha256:sha256(bytes.toString('utf8').replace(/\r\n/g,'\n')),
  orderedMigrationDigest:manifest.digest,compositionSha256:manifest.migrations.at(-1).sha256,compositionCommit:'fe3d74886048c27f22f0e33b2996c187210746e2',source:structuredClone(manifest.source),
  applied:manifest.migrations.map(row=>({...row,actualCommit:row.commit??'fe3d74886048c27f22f0e33b2996c187210746e2'}))};}
test('completed isolated receipt pins all128 applied rows and source digests',()=>assert.doesNotThrow(()=>assertSchemaReceipt(receipt(),registry,bytes)));
for(const field of ['state','containerId','baselineSha256','manifestSha256','orderedMigrationDigest','compositionSha256'])test(`schema receipt rejects changed ${field}`,()=>{
  const value=receipt();value[field]='wrong';assert.throws(()=>assertSchemaReceipt(value,registry,bytes));
});
test('schema receipt rejects an incomplete or reordered migration set',()=>{
  const value=receipt();value.applied.pop();assert.throws(()=>assertSchemaReceipt(value,registry,bytes));
  const other=receipt();[other.applied[26],other.applied[27]]=[other.applied[27],other.applied[26]];assert.throws(()=>assertSchemaReceipt(other,registry,bytes));
});
for(const field of ['sha256','actualCommit','bytes','path'])test(`schema receipt rejects divergent applied ${field}`,()=>{
  const value=receipt();value.applied[50][field]='wrong';assert.throws(()=>assertSchemaReceipt(value,registry,bytes));
});
test('schema receipt rejects unreviewed donor identity and production rows',()=>{
  const value=receipt();value.source.F06='0'.repeat(40);assert.throws(()=>assertSchemaReceipt(value,registry,bytes));
  const other=receipt();other.productionRowsCopied=1;assert.throws(()=>assertSchemaReceipt(other,registry,bytes));
});
test('schema receipt rejects changed composition commit even if its source hash is claimed unchanged',()=>{
  const value=receipt();value.compositionCommit='0'.repeat(40);assert.throws(()=>assertSchemaReceipt(value,registry,bytes));
});
test('schema receipt cannot redirect testing to another owner/endpoint or allow external delivery',()=>{
  for(const field of ['owner','api','app','syntheticOnly','externalDelivery']){
    const value=receipt();value[field]=typeof value[field]==='boolean'?!value[field]:'wrong';assert.throws(()=>assertSchemaReceipt(value,registry,bytes));
  }
});
