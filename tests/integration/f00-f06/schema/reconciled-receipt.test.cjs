'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {sha256,NEW_MIGRATION}=require('../../../../tooling/integration/f00-f06/schema/migration-manifest.cjs');
const {DEPENDENCY_MANIFEST,BRIDGE}=require('../../../../tooling/integration/f00-f06/schema/dependency-manifest.cjs');
const {assertReconciledSchemaReceipt,BASELINE}=require('../../../../tooling/integration/f00-f06/schema/reconciled-receipt.cjs');
const bytes=fs.readFileSync(path.resolve(__dirname,'../../../..',DEPENDENCY_MANIFEST));
const manifest=JSON.parse(bytes),encode=value=>Buffer.from(JSON.stringify(value));
const registry={containers:[{service:'db',id:'1'.repeat(64)}]};
function packet(){
 const applied=manifest.migrations.map(r=>({...r,actualCommit:r.commit??(r.name===BRIDGE?'a'.repeat(40):'fe3d74886048c27f22f0e33b2996c187210746e2')}));
 const catalog=Object.fromEntries(['relations','functions','policies','constraints','indexes','triggers','schemaACL','defaultACL','types','sequences','roles','memberships'].map(k=>[k,[{syntheticUnitFixture:true}]]));
 catalog.relations=[{schema:'public',name:'perf_report_template_selection'}];
 catalog.functions=['erp_private.document_permission(bigint,text)','erp_private.read_documents()',
  'erp_private.perf_hr_document_subjects_allowed(bigint)','erp_private.perf_recruitment_document_subjects_allowed(bigint)',
  'erp_private.read_documents_filtered(bigint[],text[])','erp_private.read_documents_filtered_v2(bigint[],text[],text[])']
  .map(signature=>({signature,definition:'synthetic unit fixture definition, not native evidence'}));
 const catalogSha=sha256(JSON.stringify(catalog)),manifestSha=sha256(bytes.toString().replace(/\r\n/g,'\n'));
 const failed={state:'FAILED_RETAINED_DO_NOT_RERUN',containerId:'1'.repeat(64),productionRowsCopied:0,stage:'20261006155439_perf_p04_renewal_read_scope.sql',applied:applied.slice(0,103)};
 const continued={state:'FAILED_CONTINUATION_RETAINED_DO_NOT_RERUN',containerId:'1'.repeat(64),owner:'algt-integration-20261016',stage:'20261014030458_perf_candidate_document_subject_set.sql',suffixApplied:applied.slice(103,110),failedReceiptSha256:sha256(encode(failed))};
 const fresh={state:'PASS_FRESH_FULL_SCHEMA_REPLAY_NOT_APP_ACCEPTANCE',owner:'algt-integration-replay2-20261016',containerId:'2'.repeat(64),
  externalDelivery:false,hostPorts:[],appFixturesCreated:false,sessionRole:'postgres',sessionSearchPath:'public',
  baselineSha256:BASELINE,productionRowsCopied:0,source:manifest.source,applied,manifestSha256:manifestSha,orderedMigrationDigest:manifest.digest,catalogSha256:catalogSha};
 const comparison={state:'PASS_FULL_CATALOG_EQUAL',manifestSha256:manifestSha,orderedMigrationDigest:manifest.digest,
  fullStack:{containerId:'1'.repeat(64),catalogSha256:catalogSha},fresh:{containerId:'2'.repeat(64),catalogSha256:catalogSha}};
 const composition=applied.find(r=>r.name===NEW_MIGRATION),lineage=applied.find(r=>r.name===BRIDGE);
 const receipt={receiptVersion:2,state:'PASS_SCHEMA_ONLY_REPLAY_NOT_APP_ACCEPTANCE',owner:'algt-integration-20261016',containerId:'1'.repeat(64),
  api:'http://127.0.0.1:16921',app:'http://127.0.0.1:16941',syntheticOnly:true,externalDelivery:false,productionRowsCopied:0,
  baselineSha256:BASELINE,manifestSha256:manifestSha,orderedMigrationDigest:manifest.digest,source:manifest.source,applied,
  compositionSha256:composition.sha256,compositionCommit:composition.actualCommit,lineageSha256:lineage.sha256,lineageCommit:lineage.actualCommit,
  catalogSha256:catalogSha,catalogComparisonSha256:sha256(encode(comparison)),
  independentFreshReplay:{...Object.fromEntries(['state','owner','containerId','manifestSha256','orderedMigrationDigest','catalogSha256'].map(k=>[k,fresh[k]])),receiptSha256:sha256(encode(fresh))},
  recovery:{prefixCount:110,failedSchemaReceiptSha256:sha256(encode(failed)),failedContinuationReceiptSha256:sha256(encode(continued))}};
 return{receipt,proofs:{freshReceiptBytes:encode(fresh),catalogComparisonBytes:encode(comparison),failedSchemaReceiptBytes:encode(failed),failedContinuationReceiptBytes:encode(continued),freshCatalogBytes:encode(catalog),fullStackCatalogBytes:encode(catalog)}};
}
const accept=p=>assertReconciledSchemaReceipt(p.receipt,registry,bytes,p.proofs);
test('exact129 recovered source plus independent fresh source and complete equal catalogs pass unit admission',()=>assert.doesNotThrow(()=>accept(packet())));
for(const field of ['receiptVersion','state','owner','api','app','containerId','baselineSha256','manifestSha256','orderedMigrationDigest','compositionCommit','compositionSha256','lineageCommit','lineageSha256','catalogSha256','catalogComparisonSha256'])test(`reconciliation rejects changed ${field}`,()=>{
 const p=packet();p.receipt[field]='wrong';assert.throws(()=>accept(p));
});
test('missing proofs cannot be replaced with receipt success claims',()=>{const p=packet();assert.throws(()=>assertReconciledSchemaReceipt(p.receipt,registry,bytes,{}));});
for(const field of ['freshReceiptBytes','catalogComparisonBytes','failedSchemaReceiptBytes','failedContinuationReceiptBytes'])test(`independent ${field} bytes must match their linked hash`,()=>{
 const p=packet();p.proofs[field]=Buffer.concat([p.proofs[field],Buffer.from(' ')]);assert.throws(()=>accept(p));
});
test('matching catalog summary claims do not admit different actual catalogs',()=>{const p=packet();const c=JSON.parse(p.proofs.fullStackCatalogBytes);c.policies.push({unauthorized:true});p.proofs.fullStackCatalogBytes=encode(c);assert.throws(()=>accept(p));});
test('empty or partial actual catalogs cannot count as complete replay',()=>{
 const p=packet();p.proofs.freshCatalogBytes=encode({});p.proofs.fullStackCatalogBytes=encode({});assert.throws(()=>accept(p));
});
test('missing, duplicate or reordered applied rows reject exact-head acceptance',()=>{
 for(const mode of ['missing','duplicate','reorder']){const p=packet();if(mode==='missing')p.receipt.applied.pop();if(mode==='duplicate')p.receipt.applied[112]=p.receipt.applied[111];
  if(mode==='reorder')[p.receipt.applied[111],p.receipt.applied[113]]=[p.receipt.applied[113],p.receipt.applied[111]];assert.throws(()=>accept(p));}
});
test('retained failed prefix and continuation must prove103+7 exact original rows',()=>{
 const p=packet(),continued=JSON.parse(p.proofs.failedContinuationReceiptBytes);continued.suffixApplied.pop();p.proofs.failedContinuationReceiptBytes=encode(continued);
 p.receipt.recovery.failedContinuationReceiptSha256=sha256(p.proofs.failedContinuationReceiptBytes);assert.throws(()=>accept(p));
});
test('fresh replay cannot reuse recovered DB identity or omit one original migration',()=>{
 for(const mode of ['same-db','missing-row']){const p=packet(),f=JSON.parse(p.proofs.freshReceiptBytes);
  if(mode==='same-db')f.containerId=p.receipt.containerId;else f.applied.pop();p.proofs.freshReceiptBytes=encode(f);
  p.receipt.independentFreshReplay={...p.receipt.independentFreshReplay,containerId:f.containerId,receiptSha256:sha256(p.proofs.freshReceiptBytes)};assert.throws(()=>accept(p));}
});
test('external delivery and production rows never admit native application tests',()=>{
 for(const [k,v]of [['externalDelivery',true],['syntheticOnly',false],['productionRowsCopied',1]]){const p=packet();p.receipt[k]=v;assert.throws(()=>accept(p));}
});
test('fresh replay safety fields cannot differ despite a rehashed receipt',()=>{
 for(const [k,v]of [['externalDelivery',true],['hostPorts',[5432]],['appFixturesCreated',true],['sessionRole','supabase_admin'],['sessionSearchPath','auth']]){
  const p=packet(),f=JSON.parse(p.proofs.freshReceiptBytes);f[k]=v;p.proofs.freshReceiptBytes=encode(f);
  p.receipt.independentFreshReplay.receiptSha256=sha256(p.proofs.freshReceiptBytes);assert.throws(()=>accept(p));
 }
});
