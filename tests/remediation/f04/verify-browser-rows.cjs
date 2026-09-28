'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),db=require('../f00/local-db.cjs');
const dir=path.resolve('CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F04/continuation-20260928');
db.assertDatabase();const ledger=JSON.parse(fs.readFileSync(path.join(dir,'FIXTURES.json')));
if(ledger.target!=='algt-f00-local'||ledger.profileId!==844)throw Error('Fixture mismatch');
const rows=db.sql(`select json_build_object('departments',(select json_agg(json_build_object('id',id,'code',department_code,'name',department_name_en,'description',description,'active',is_active,'revision',workspace_revision::text)) from public.departments where created_by=844 and department_code='F04-UI-2809'),'employee',(select json_build_object('id',id,'name',full_name_en,'revision',workspace_revision::text) from public.employees where created_by=844 and id=8995),'candidate',(select json_build_object('id',id,'name',full_name_en,'notes',notes,'revision',workspace_revision::text) from public.hr_candidates where created_by=844 and id=112));`,{json:true});
assert.equal(rows.departments.length,1);assert.equal(rows.departments[0].active,false);assert.equal(rows.departments[0].description,'F04 unsaved notes across history');
assert.equal(rows.employee.name,'F04 Browser employee retained');assert.equal(rows.candidate.name,'F04 Browser winning editor');assert.equal(rows.candidate.notes,'F04 draft notes');
fs.writeFileSync(path.join(dir,'BROWSER_ROW_PROOF.json'),JSON.stringify({at:new Date().toISOString(),target:'algt-f00-local',status:'PASS',rows},null,2));console.log(JSON.stringify({status:'PASS',department:6,employee:8995,candidate:112}));
