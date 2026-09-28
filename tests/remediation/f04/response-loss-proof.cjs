'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),db=require('../f00/local-db.cjs');
db.assertDatabase();const stage=process.argv[2];assert.ok(['committed-response-held','changed-payload-blocked','unchanged-retry-reconciled'].includes(stage));
const dir=path.resolve('CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F04/acceptance-20260928');
const proof=db.sql("select json_build_object('rows',(select json_agg(json_build_object('id',id,'code',department_code,'name',department_name_en,'revision',workspace_revision,'company',owner_company_id)) from public.departments where department_code='F04-LOSS-2809'),'receipts',(select json_agg(json_build_object('operation',operation_id,'id',record_id,'revision',revision)) from erp_private.workspace_save_receipts where entity='departments' and actor='019d4b78-b604-4781-96f4-ae62188c0545' and record_id in(select id from public.departments where department_code='F04-LOSS-2809')));",{json:true});
assert.equal(proof.rows.length,1);assert.equal(proof.receipts.length,1);assert.equal(proof.rows[0].revision,1);assert.equal(proof.rows[0].company,900101);assert.equal(proof.rows[0].name,'F04 RESPONSE LOSS SYNTHETIC');
if(stage!=='committed-response-held'){
 const first=JSON.parse(fs.readFileSync(path.join(dir,'LOSS-committed-response-held.json')));assert.deepEqual(proof,first.proof);
}
fs.writeFileSync(path.join(dir,'LOSS-'+stage+'.json'),JSON.stringify({at:new Date().toISOString(),stage,status:'PASS',target:'algt-f00-local',proof},null,2));console.log(JSON.stringify({stage,status:'PASS',...proof}));
