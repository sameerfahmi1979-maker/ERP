'use strict';
// Import is inert. This is source order, not permission to apply migrations.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {sha256}=require('./migration-manifest.cjs');
const {buildTemplateSetManifest,MANIFEST:PREVIOUS}=require('./template-set-manifest.cjs');
const root=path.resolve(__dirname,'../../../..');
const MIGRATION='20261017092052_perf_upload_inbox_authority_set.sql';
const MANIFEST='docs/integration/f00-f06/schema/DEPENDENCY_MANIFEST_V5_20261017.json';
const PREVIOUS_SHA='c05ee4715b6d30a251ff27be9707594cbb846c43f01727effec286dc4bf9464b';
function buildInboxAuthorityManifest(){
 const before=fs.readFileSync(path.join(root,PREVIOUS),'utf8').replace(/\r\n/g,'\n');
 assert.equal(sha256(before),PREVIOUS_SHA,'Immutable131 manifest changed');
 const prior=JSON.parse(before);assert.deepEqual(prior,buildTemplateSetManifest());assert.equal(prior.migrations.length,131);
 const text=fs.readFileSync(path.join(root,'supabase/migrations',MIGRATION),'utf8').replace(/\r\n/g,'\n');
 assert.ok(!/[\r\uFEFF]/.test(text));
 const added={order:132,name:MIGRATION,group:'composition',commit:null,path:`supabase/migrations/${MIGRATION}`,sha256:sha256(text),bytes:Buffer.byteLength(text),normalization:'candidate UTF8 canonical LF only; verify final Git blob before application',originalOrder:null};
 const rows=[...prior.migrations,added];
 return {...prior,version:5,counts:{...prior.counts,composition:5,total:132},
  previousInboxManifest:{path:PREVIOUS,sha256:PREVIOUS_SHA,digest:prior.digest,count:131},
  dependencyEdges:[...prior.dependencyEdges,{before:prior.migrations.at(-1).name,after:MIGRATION}],
  digest:sha256(rows.map(r=>`${r.name} ${r.sha256}\n`).join('')),
  applicationRules:[
   'Immutable131 dependency prefix plus one additive Inbox SELECT-authority performance migration.',
   'Reconcile the exact live ERP history/catalog; skip already applied predecessors without rewriting their history.',
   'The new migration requires the accepted131 preimage and preserves F03 point authority and all write predicates.',
   'Rollback-only native differentials are not committed132 replay, ordinary SDK acceptance or production performance.',
   'Before release require exact132 application/replay/catalog receipts, affected native acceptance, backup/recovery and matching application checks.',
   'A source manifest is not a main-merge, deployment or production-write authorization.'
  ],migrations:rows};
}
if(require.main===module){const manifest=buildInboxAuthorityManifest();if(process.argv.includes('--write')){fs.writeFileSync(path.join(root,MANIFEST),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({path:MANIFEST,count:manifest.counts.total,digest:manifest.digest}));}else process.stdout.write(JSON.stringify(manifest,null,2)+'\n');}
module.exports={buildInboxAuthorityManifest,MIGRATION,MANIFEST,PREVIOUS_SHA};
