'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const db=require('../f00/local-db.cjs'),api=require('../f00/local-client.cjs');
const dir=path.resolve('CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F04/continuation-20260928');
const q=x=>"'"+String(x).replaceAll("'","''")+"'";
(async()=>{
 db.assertDatabase();const file=path.join(dir,'FIXTURES.json'),ledger=JSON.parse(fs.readFileSync(file));
 if(ledger.target!=='algt-f00-local'||ledger.state!=='READY')throw Error('Fixture mismatch');
 const save=()=>fs.writeFileSync(file,JSON.stringify(ledger,null,2));
 for(const [code,prefix] of [['HR_EMPLOYEE','F04EMP'],['HR_CANDIDATE','F04CAND']]) {
  const rows=db.sql(`with r as (insert into public.global_numbering_rules(rule_code,rule_name,module_code,module_name,document_type_code,document_type_name,document_prefix,format_template) values(${q(code)},'F04 LOCAL SYNTHETIC','HR','HR',${q(code)},'F04 test',${q(prefix)},'{DOC}-{SEQ6}') on conflict(rule_code) do nothing returning id) select coalesce(json_agg(id),'[]') from r;`,{json:true});
  rows.forEach(id=>ledger.records.push({table:'global_numbering_rules',id,code}));save();
 }
 if(!ledger.category) {ledger.category=db.sql("insert into public.hr_employee_categories(code,name_en) values('F04_SYNTHETIC','F04 synthetic category') returning to_json(id);",{json:true});ledger.records.push({table:'hr_employee_categories',id:ledger.category,code:'F04_SYNTHETIC'});save();}
 const credentials=JSON.parse(fs.readFileSync(path.join(dir,'private/credentials.json'))),token=await api.login(credentials);
 await new Promise(r=>setTimeout(r,2000));
 const rpc=(entity,op,payload,id=null,revision=null)=>api.request('/rest/v1/rpc/save_workspace_record',{method:'POST',token,body:{p_entity:entity,p_operation:op,p_id:id,p_revision:revision,p_data:payload}});
 const cases=[];const check=async(name,fn)=>{try{await fn();cases.push({name,status:'PASS'});}catch(e){cases.push({name,status:'FAIL',error:e.message});throw e;}finally{fs.writeFileSync(path.join(dir,'HR_DB_RESULTS.json'),JSON.stringify({at:new Date().toISOString(),cases,target:ledger.target},null,2));}};
 for(const entity of ['employees','hr_candidates']) {
  const op=crypto.randomUUID();let created,updated;
  const payload=entity==='employees'?{full_name_en:'F04 SYNTHETIC Employee',gender:'male',date_of_birth:'1990-01-01',mobile_number:'0000000000',owner_company_id:900101,branch_id:900201,joining_date:'2026-01-01',employee_category_id:ledger.category,employee_status:'active',emergency_contact_name:'F04 Contact',emergency_contact_mobile:'0000000000'}:{full_name_en:'F04 SYNTHETIC Candidate',candidate_status:'new',pipeline_stage:'new'};
  await check(entity+': atomic create with numbering',async()=>{const r=await rpc(entity,op,payload);assert.equal(r.ok,true,JSON.stringify(r.data));created=r.data;ledger.records.push({table:entity,id:created.id,code:created.employee_code||created.candidate_code});save();});
  await check(entity+': replay does not allocate another number or audit',async()=>{const r=await rpc(entity,op,payload);assert.equal(r.data.id,created.id);assert.equal(r.data.replayed,true);assert.equal(db.sql(`select to_json(count(*)) from public.audit_logs where new_values->>'operation_id'=${q(op)};`,{json:true}),1);});
  await check(entity+': valid update returns next revision',async()=>{const r=await rpc(entity,crypto.randomUUID(),{full_name_en:'F04 SYNTHETIC Updated',...(entity==='employees'?{employee_status:'inactive',inactive_reason:'F04 test'}:{})},created.id,created.revision);assert.equal(r.ok,true,JSON.stringify(r.data));updated=r.data;assert.equal(updated.revision,'2');});
  await check(entity+': stale update denied',async()=>{const r=await rpc(entity,crypto.randomUUID(),{full_name_en:'stale'},created.id,created.revision);assert.equal(r.data.code,'P0409');});
  await check(entity+': failure rolls back numbering and receipt',async()=>{const bad=crypto.randomUUID();const rule=entity==='employees'?'HR_EMPLOYEE':'HR_CANDIDATE';const before=db.sql(`select to_json(next_sequence_number) from public.global_numbering_rules where rule_code=${q(rule)};`,{json:true});const r=await rpc(entity,bad,{...payload,full_name_en:null});assert.equal(r.ok,false);assert.equal(db.sql(`select to_json(next_sequence_number) from public.global_numbering_rules where rule_code=${q(rule)};`,{json:true}),before);assert.equal(db.sql(`select to_json(count(*)) from erp_private.workspace_save_receipts where operation_id=${q(bad)}::uuid;`,{json:true}),0);});
  if(entity==='employees') await check('Employee status and row save commit together exactly once',async()=>{assert.equal(db.sql(`select to_json(count(*)) from public.employee_status_events where employee_id=${created.id};`,{json:true}),2);});
 }
 console.log(JSON.stringify({passed:cases.length,failed:0,target:ledger.target}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
