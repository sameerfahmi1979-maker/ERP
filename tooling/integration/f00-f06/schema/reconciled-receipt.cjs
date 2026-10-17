'use strict';
const assert=require('node:assert/strict');
const {sha256,NEW_MIGRATION}=require('./migration-manifest.cjs');
const {assertDependencyManifest,BRIDGE}=require('./dependency-manifest.cjs');
const BASELINE='7e2263cb4869d93c58e502b455ad181348615e9b794432afeacf49852c83ce4c';
const hash=value=>{assert.match(value,/^[a-f\d]{64}$/);return value;};
const commit=value=>{assert.match(value,/^[a-f\d]{40}$/);return value;};
function parse(bytes){assert.ok(Buffer.isBuffer(bytes),'Independent proof bytes are mandatory');return JSON.parse(bytes.toString('utf8'));}
function assertRows(actual,expected){
 assert.equal(actual.length,expected.length,'Incomplete applied migration set');
 for(let i=0;i<expected.length;i++){
  for(const key of ['order','name','group','path','sha256','bytes'])assert.equal(actual[i][key],expected[i][key],`Applied ${i+1} ${key} differs`);
  commit(actual[i].actualCommit);
  if(expected[i].commit!==null)assert.equal(actual[i].actualCommit,expected[i].commit,'Donor identity differs');
 }
}
// Side-effect-free validation. Caller independently loads the fixed proof files;
// never accept a status field in the reconciliation receipt as fresh replay proof.
function assertReconciledSchemaReceipt(receipt,registry,manifestBytes,proofs){
 assert.ok(Buffer.isBuffer(manifestBytes));
 const manifestText=manifestBytes.toString('utf8').replace(/\r\n/g,'\n');
 const manifest=assertDependencyManifest(JSON.parse(manifestText));
 const manifestSha=sha256(manifestText),db=registry.containers.find(r=>r.service==='db').id;
 assert.equal(receipt.state,'PASS_SCHEMA_ONLY_REPLAY_NOT_APP_ACCEPTANCE');
 assert.equal(receipt.receiptVersion,2);
 assert.equal(receipt.owner,'algt-integration-20261016');
 assert.equal(receipt.api,'http://127.0.0.1:16921');assert.equal(receipt.app,'http://127.0.0.1:16941');
 assert.equal(receipt.containerId,db);assert.equal(receipt.syntheticOnly,true);assert.equal(receipt.externalDelivery,false);
 assert.equal(receipt.productionRowsCopied,0);assert.equal(receipt.baselineSha256,BASELINE);
 assert.equal(receipt.manifestSha256,manifestSha);assert.equal(receipt.orderedMigrationDigest,manifest.digest);
 assert.deepEqual(receipt.source,manifest.source);assertRows(receipt.applied,manifest.migrations);
 const composition=receipt.applied.find(r=>r.name===NEW_MIGRATION),lineage=receipt.applied.find(r=>r.name===BRIDGE);
 assert.equal(receipt.compositionSha256,composition.sha256);assert.equal(receipt.compositionCommit,composition.actualCommit);
 assert.equal(receipt.lineageSha256,lineage.sha256);assert.equal(receipt.lineageCommit,lineage.actualCommit);
 const failed=parse(proofs.failedSchemaReceiptBytes),continued=parse(proofs.failedContinuationReceiptBytes);
 assert.equal(failed.state,'FAILED_RETAINED_DO_NOT_RERUN');assert.equal(failed.containerId,db);assert.equal(failed.productionRowsCopied,0);
 assert.equal(failed.stage,'20261006155439_perf_p04_renewal_read_scope.sql');
 assert.equal(continued.state,'FAILED_CONTINUATION_RETAINED_DO_NOT_RERUN');assert.equal(continued.containerId,db);
 assert.equal(continued.owner,receipt.owner);assert.equal(continued.stage,'20261014030458_perf_candidate_document_subject_set.sql');
 assert.equal(continued.failedReceiptSha256,sha256(proofs.failedSchemaReceiptBytes));
 assertRows(failed.applied,manifest.migrations.slice(0,103));
 assertRows(continued.suffixApplied,manifest.migrations.slice(103,110));
 assert.equal(receipt.recovery.prefixCount,110);
 assert.equal(receipt.recovery.failedSchemaReceiptSha256,sha256(proofs.failedSchemaReceiptBytes));
 assert.equal(receipt.recovery.failedContinuationReceiptSha256,sha256(proofs.failedContinuationReceiptBytes));
 const fresh=parse(proofs.freshReceiptBytes),comparison=parse(proofs.catalogComparisonBytes);
 assert.equal(fresh.state,'PASS_FRESH_FULL_SCHEMA_REPLAY_NOT_APP_ACCEPTANCE');
 assert.equal(fresh.owner,'algt-integration-replay2-20261016');hash(fresh.containerId);assert.notEqual(fresh.containerId,db);
 assert.equal(fresh.manifestSha256,manifestSha);assert.equal(fresh.orderedMigrationDigest,manifest.digest);
 assert.equal(fresh.baselineSha256,BASELINE);assert.equal(fresh.productionRowsCopied,0);
 assert.equal(fresh.externalDelivery,false);assert.deepEqual(fresh.hostPorts,[]);assert.equal(fresh.appFixturesCreated,false);
 assert.equal(fresh.sessionRole,'postgres');assert.equal(fresh.sessionSearchPath,'public');
 assert.deepEqual(fresh.source,manifest.source);assertRows(fresh.applied,manifest.migrations);
 for(let i=0;i<fresh.applied.length;i++)assert.equal(fresh.applied[i].actualCommit,receipt.applied[i].actualCommit,'Fresh and recovered source identities differ');
 assert.equal(receipt.independentFreshReplay.receiptSha256,sha256(proofs.freshReceiptBytes));
 for(const key of ['state','owner','containerId','manifestSha256','orderedMigrationDigest','catalogSha256'])
  assert.equal(receipt.independentFreshReplay[key],fresh[key],`Fresh proof ${key} differs`);
 assert.equal(comparison.state,'PASS_FULL_CATALOG_EQUAL');assert.equal(comparison.manifestSha256,manifestSha);
 assert.equal(comparison.orderedMigrationDigest,manifest.digest);
 assert.equal(comparison.fullStack.containerId,db);assert.equal(comparison.fresh.containerId,fresh.containerId);
 const freshCatalog=parse(proofs.freshCatalogBytes),fullStackCatalog=parse(proofs.fullStackCatalogBytes);
 const catalogKeys=['relations','functions','policies','constraints','indexes','triggers','schemaACL','defaultACL','types','sequences','roles','memberships'];
 assert.deepEqual(Object.keys(freshCatalog).sort(),catalogKeys.sort(),'A complete catalog, not a summary, is required');
 for(const key of catalogKeys)assert.ok(Array.isArray(freshCatalog[key]) && freshCatalog[key].length>0,`Missing catalog section ${key}`);
 for(const name of ['erp_private.document_permission(bigint,text)','erp_private.read_documents()',
  'erp_private.perf_hr_document_subjects_allowed(bigint)','erp_private.perf_recruitment_document_subjects_allowed(bigint)',
  'erp_private.read_documents_filtered(bigint[],text[])','erp_private.read_documents_filtered_v2(bigint[],text[],text[])'])
  assert.ok(freshCatalog.functions.some(row=>row.signature===name && typeof row.definition==='string' && row.definition.length>20),`Missing final function ${name}`);
 assert.ok(freshCatalog.relations.some(row=>row.schema==='public' && row.name==='perf_report_template_selection'));
 assert.deepEqual(freshCatalog,fullStackCatalog,'Independent complete catalog objects differ');
 const catalogSha=sha256(JSON.stringify(freshCatalog));
 assert.equal(hash(fresh.catalogSha256),catalogSha);assert.equal(comparison.fresh.catalogSha256,catalogSha);
 assert.equal(comparison.fullStack.catalogSha256,catalogSha);assert.equal(receipt.catalogSha256,catalogSha);
 assert.equal(receipt.catalogComparisonSha256,sha256(proofs.catalogComparisonBytes));
 return {manifest,composition,lineage};
}
module.exports={assertReconciledSchemaReceipt,assertRows,BASELINE};
