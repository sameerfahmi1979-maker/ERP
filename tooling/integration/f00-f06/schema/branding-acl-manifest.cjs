'use strict';
// Successor only: the accepted129 source manifest and original128 are immutable.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {sha256,NEW_MIGRATION}=require('./migration-manifest.cjs');
const {buildDependencyManifest,DEPENDENCY_MANIFEST}=require('./dependency-manifest.cjs');
const root=path.resolve(__dirname,'../../../..');
const ACL_MIGRATION='20261016121837_integration_raw_branding_acl_boundary.sql';
const ACL_MANIFEST='docs/integration/f00-f06/schema/DEPENDENCY_MANIFEST_V3_20261016.json';
const HISTORICAL_DEPENDENCY_SHA='2d0bc893a4e43fff6ee02fc9fd9f021c3ec169b324c2daf181ceb299f19ab34c';
function buildBrandingAclManifest(){
 const previousText=fs.readFileSync(path.join(root,DEPENDENCY_MANIFEST),'utf8').replace(/\r\n/g,'\n');
 assert.equal(sha256(previousText),HISTORICAL_DEPENDENCY_SHA,'Accepted129 source changed');
 const previous=JSON.parse(previousText);assert.deepEqual(previous,buildDependencyManifest());
 assert.equal(previous.migrations.length,129);assert.equal(previous.migrations.at(-1).name,NEW_MIGRATION);
 const text=fs.readFileSync(path.join(root,'supabase/migrations',ACL_MIGRATION),'utf8').replace(/\r\n/g,'\n');
 assert.doesNotMatch(text,/\r|\uFEFF/);
 const added={name:ACL_MIGRATION,group:'composition',commit:null,path:`supabase/migrations/${ACL_MIGRATION}`,
  sha256:sha256(text),bytes:Buffer.byteLength(text),normalization:'candidate UTF8 canonical LF only; verify final Git blob before application',originalOrder:null};
 const rows=[...previous.migrations.slice(0,-1),added,previous.migrations.at(-1)].map((r,i)=>({...r,order:i+1}));
 return {...previous,version:3,counts:{...previous.counts,composition:3,total:130},
  previousDependencyManifest:{path:DEPENDENCY_MANIFEST,sha256:HISTORICAL_DEPENDENCY_SHA,digest:previous.digest,count:129},
  dependencyEdges:[...previous.dependencyEdges,{before:previous.migrations.at(-2).name,after:ACL_MIGRATION},{before:ACL_MIGRATION,after:NEW_MIGRATION}],
  digest:sha256(rows.map(r=>`${r.name} ${r.sha256}\n`).join('')),
  applicationRules:[
   'Active candidate uses exact130 dependency order; immutable accepted129 manifest remains historical.',
   'Original128 donor identities/bytes and accepted lineage bridge remain unchanged.',
   'The new penultimate migration admits only faithful PG17 MAINTAIN-only branding ACLs, never restore-artifact Dxt grants.',
   'Restore the archived baseline with faithful creator/default ACLs and independently prove exact catalog parity before migrations.',
   'Require fresh exact130 replay, native positive/negative authority checks and final catalog acceptance.',
   'Standard timestamp CLI push/up is unsupported. No production write, deployment, main merge or F07 authorization.'
  ],migrations:rows};
}
function assertBrandingAclManifest(value){assert.deepEqual(value,buildBrandingAclManifest(),'Only the exact reviewed130 source is admitted');return value;}
if(require.main===module)process.stdout.write(`${JSON.stringify(buildBrandingAclManifest(),null,2)}\n`);
module.exports={buildBrandingAclManifest,assertBrandingAclManifest,ACL_MIGRATION,ACL_MANIFEST,HISTORICAL_DEPENDENCY_SHA};
