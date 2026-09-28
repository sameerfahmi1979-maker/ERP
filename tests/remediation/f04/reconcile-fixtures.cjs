'use strict';
const fs=require('node:fs'),path=require('node:path'),db=require('../f00/local-db.cjs');
const file=path.resolve('CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F04/continuation-20260928/FIXTURES.json');
const ledger=JSON.parse(fs.readFileSync(file));db.assertDatabase();
if(ledger.target!=='algt-f00-local'||!Number.isSafeInteger(ledger.profileId))throw Error('Fixture mismatch');
for(const [table,code] of [['departments','department_code'],['employees','employee_code'],['hr_candidates','candidate_code']]) {
 const rows=db.sql(`select coalesce(json_agg(json_build_object('table','${table}','id',id,'code',${code},'revision',workspace_revision::text)),'[]') from public.${table} where created_by=${ledger.profileId} and ${code} like 'F04%';`,{json:true});
 for(const row of rows){const existing=ledger.records.find(r=>r.table===table&&r.id===row.id);if(existing)Object.assign(existing,row);else ledger.records.push(row);}
}
ledger.reconciledAt=new Date().toISOString();fs.writeFileSync(file,JSON.stringify(ledger,null,2));console.log(JSON.stringify({records:ledger.records,target:ledger.target}));
