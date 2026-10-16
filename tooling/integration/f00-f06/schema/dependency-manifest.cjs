'use strict';
// One reviewed composition DAG, never a generic timestamp/history repair tool.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {buildManifest,sha256}=require('./migration-manifest.cjs');
const root=path.resolve(__dirname,'../../../..');
const HISTORICAL_MANIFEST='docs/integration/f00-f06/schema/MIGRATION_MANIFEST_20261016.json';
const HISTORICAL_SHA='73589b225359030d071f3649ff7b3a27b2f467abcdac2236026f5bb48a74c990';
const DEPENDENCY_MANIFEST='docs/integration/f00-f06/schema/DEPENDENCY_MANIFEST_20261016.json';
const BRIDGE='20261016111938_integration_perf_document_lineage.sql';
const PREFIX_END='20261013125825_perf_hr_compliance_read_subjects.sql';
const CANDIDATE='20261014030458_perf_candidate_document_subject_set.sql';
const CANDIDATE_VIEW='20261014040457_perf_candidate_document_read_projection.sql';
const STATEMENT='20261014065706_perf_item4_statement_permission_reads.sql';
const NOTIFICATION='20261014072522_perf_dms_notification_subject_sets.sql';
const EDGES=[ [PREFIX_END,BRIDGE], [BRIDGE,STATEMENT], [STATEMENT,NOTIFICATION],
 [NOTIFICATION,CANDIDATE], [CANDIDATE,CANDIDATE_VIEW] ];
let reviewedHistorical;
function historicalManifest(){
 const raw=fs.readFileSync(path.join(root,HISTORICAL_MANIFEST));
 // Git checkouts may have CRLF; the accepted immutable historical blob is canonical LF.
 const text=raw.toString('utf8').replace(/\r\n/g,'\n');
 assert.equal(sha256(text),HISTORICAL_SHA,'Historical manifest must remain unchanged');
 const value=JSON.parse(text);
 if(!reviewedHistorical){assert.deepEqual(value,buildManifest());reviewedHistorical=value;}
 else assert.deepEqual(value,reviewedHistorical);
 return value;
}
function canonicalBridge(){
 const text=fs.readFileSync(path.join(root,'supabase/migrations',BRIDGE),'utf8').replace(/\r\n/g,'\n');
 assert.doesNotMatch(text,/\r|\uFEFF/,'Bridge must use canonical UTF8 LF');return Buffer.from(text);
}
function orderedRecords(old,bridge){
 assert.equal(old.migrations[109].name,PREFIX_END);
 assert.equal(old.migrations[110].name,CANDIDATE);
 const names=[...old.migrations.slice(0,110).map(r=>r.name),BRIDGE,STATEMENT,NOTIFICATION,
  ...old.migrations.slice(110).filter(r=>![STATEMENT,NOTIFICATION].includes(r.name)).map(r=>r.name)];
 const rows=new Map(old.migrations.map(r=>[r.name,{...r,originalOrder:r.order}]));
 rows.set(BRIDGE,{...bridge,originalOrder:null});
 return names.map((name,i)=>({...rows.get(name),order:i+1}));
}
function buildDependencyManifest(){
 const old=historicalManifest(),bytes=canonicalBridge();
 const rows=orderedRecords(old,{name:BRIDGE,group:'composition',commit:null,path:`supabase/migrations/${BRIDGE}`,
  sha256:sha256(bytes),bytes:bytes.length,normalization:'candidate UTF8 canonical LF only; verify final Git blob before application'});
 return {version:2,kind:'reviewed-explicit-dependency-source-manifest-not-application-receipt',
  source:old.source,counts:{predecessor:26,F06:85,PERF:16,composition:2,total:129},baseline:old.baseline,
  historicalManifest:{path:HISTORICAL_MANIFEST,sha256:HISTORICAL_SHA,digest:old.digest,count:128},
  dependencyEdges:EDGES.map(([before,after])=>({before,after})),
  relocations:[STATEMENT,NOTIFICATION].map(name=>({name,originalOrder:old.migrations.find(r=>r.name===name).order,
   reason:'Both original guards require pre-candidate-expansion reader hash; statement policy is the notification prerequisite.'})),
  digest:sha256(rows.map(r=>`${r.name} ${r.sha256}\n`).join('')),
  applicationRules:[
   'Only this exact129 dependency order is reviewed. Standard timestamp-sorted CLI push/up is unsupported.',
   'Original128 migration bytes and donor identities remain immutable; only the two named relocations are permitted.',
   'The CLI-created current-timestamp bridge runs after original110; never backdate or rename it.',
   'Reconcile actual catalog/history and preserve failed receipts. No fake applied rows or guard bypass.',
   'Require independent fresh full replay, complete catalog equivalence, authority parity and exact-candidate acceptance.',
   'This source manifest does not authorize production writes, deployment or F07.'
  ],migrations:rows};
}
function assertDependencyManifest(manifest){
 const expected=buildDependencyManifest();
 assert.deepEqual(manifest,expected,'Only the reviewed explicit dependency DAG and exact bytes are accepted');
 return manifest;
}
if(require.main===module)process.stdout.write(`${JSON.stringify(buildDependencyManifest(),null,2)}\n`);
module.exports={buildDependencyManifest,assertDependencyManifest,historicalManifest,canonicalBridge,
 DEPENDENCY_MANIFEST,HISTORICAL_MANIFEST,HISTORICAL_SHA,BRIDGE,PREFIX_END,CANDIDATE,CANDIDATE_VIEW,STATEMENT,NOTIFICATION,EDGES};
