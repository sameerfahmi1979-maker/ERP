'use strict';
// Coordinator-only execution after isolated replay. No production admission,
// no fixture records, no persistent authority change and no migration rewrite.
const {test,before} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const {guardedLab,guardFailureMessage} = require('../../../../tooling/integration/f00-f06/schema/guarded-lab.cjs');
const {NEW_MIGRATION} = require('../../../../tooling/integration/f00-f06/schema/migration-manifest.cjs');
const {witnesses,migrationBody,runWitness} = require('../../../../tooling/integration/f00-f06/schema/schema-rejection-witnesses.cjs');
const root = path.resolve(__dirname,'../../../..');
const manifest = JSON.parse(fs.readFileSync(path.join(root,'docs/integration/f00-f06/schema/MIGRATION_MANIFEST_20261016.json'),'utf8'));
const body = migrationBody(fs.readFileSync(path.join(root,'supabase/migrations',NEW_MIGRATION),'utf8'),manifest.migrations.find(row=>row.name===NEW_MIGRATION).sha256);
let lab;
before(async()=>{lab=await guardedLab();});
for(const witness of witnesses) test(`native schema guard rejection with exact rollback: ${witness.id}`,()=>{
  runWitness(lab,guardFailureMessage,witness,body);
});
