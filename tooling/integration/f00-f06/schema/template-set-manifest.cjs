'use strict';
// Source-only manifest builder. Import never connects or writes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {sha256}=require('./migration-manifest.cjs');
const {buildBrandingAclManifest,ACL_MANIFEST}=require('./branding-acl-manifest.cjs');
const root=path.resolve(__dirname,'../../../..');
const MIGRATION='20261016193054_perf_template_branding_statement_set.sql';
const MANIFEST='docs/integration/f00-f06/schema/DEPENDENCY_MANIFEST_V4_20261016.json';
const PREVIOUS_SHA='d8836382b9a9aa2367ef774e4d86839d7a6607c058ad75acc65d853add13156b';
function buildTemplateSetManifest(){
 const priorText=fs.readFileSync(path.join(root,ACL_MANIFEST),'utf8').replace(/\r\n/g,'\n');
 assert.equal(sha256(priorText),PREVIOUS_SHA,'Immutable130 source manifest changed');
 const prior=JSON.parse(priorText);assert.deepEqual(prior,buildBrandingAclManifest());assert.equal(prior.migrations.length,130);
 const text=fs.readFileSync(path.join(root,'supabase/migrations',MIGRATION),'utf8').replace(/\r\n/g,'\n');
 const added={order:131,name:MIGRATION,group:'composition',commit:null,path:`supabase/migrations/${MIGRATION}`,
  sha256:sha256(text),bytes:Buffer.byteLength(text),normalization:'candidate UTF8 canonical LF only; verify final Git blob before application',originalOrder:null};
 const rows=[...prior.migrations,added];
 return {...prior,version:4,counts:{...prior.counts,composition:4,total:131},
  previousTemplateManifest:{path:ACL_MANIFEST,sha256:PREVIOUS_SHA,digest:prior.digest,count:130},
  dependencyEdges:[...prior.dependencyEdges,{before:prior.migrations.at(-1).name,after:MIGRATION}],
  digest:sha256(rows.map(r=>`${r.name} ${r.sha256}\n`).join('')),
  applicationRules:[
   'Use exact131 explicit dependency order: immutable130 prefix plus one additive template-authority performance migration.',
   'Previous128/129/130 manifests and all existing migration bytes remain historical and immutable.',
   'The new migration requires the exact accepted130 native preimage; never apply it to an unverified or failed schema.',
   'Supabase timestamp sorting/push is not the dependency-aware release procedure. Do not fabricate migration history.',
   'Require exact source-pinned application receipt, successor catalog qualification, old-point differentials and unchanged24 native/app cases.',
   'Require actual ordinary-authenticated plans/timings with original8-second timeout and >1000-row workload; STABLE is not measured acceptance.',
   'No production write, deployment or F07 authorization.'
  ],migrations:rows};
}
function assertTemplateSetManifest(value){assert.deepEqual(value,buildTemplateSetManifest(),'Only exact131 source is admitted');return value;}
if(require.main===module)process.stdout.write(JSON.stringify(buildTemplateSetManifest(),null,2)+'\n');
module.exports={buildTemplateSetManifest,assertTemplateSetManifest,MIGRATION,MANIFEST,PREVIOUS_SHA};
