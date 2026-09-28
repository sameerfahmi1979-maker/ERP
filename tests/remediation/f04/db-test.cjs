'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const db=require('../f00/local-db.cjs'),api=require('../f00/local-client.cjs');
const dir=path.resolve('CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F04/continuation-20260928');
const q=x=>"'"+String(x).replaceAll("'","''")+"'";
(async()=>{
 db.assertDatabase();const ledger=JSON.parse(fs.readFileSync(path.join(dir,'FIXTURES.json')));
 if(ledger.target!=='algt-f00-local'||ledger.state!=='READY')throw Error('Fixture mismatch');
 const credentials=JSON.parse(fs.readFileSync(path.join(dir,'private/credentials.json')));
 const a=await api.login(credentials),b=await api.login(credentials),cases=[];
 const tokenOther=await api.login(JSON.parse(fs.readFileSync(path.resolve('CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F00/local/private/actors.json'))).find(a=>a.name==='unrelated'));
 // Local GoTrue/PostgREST clock rounding immediately after Docker resume can differ by one second.
 await new Promise(resolve=>setTimeout(resolve,2000));
 const save=()=>fs.writeFileSync(path.join(dir,'DB_RESULTS.json'),JSON.stringify({at:new Date().toISOString(),target:ledger.target,cases,production_writes:0},null,2));
 const check=async(name,fn)=>{try{await fn();cases.push({name,status:'PASS'});}catch(e){cases.push({name,status:'FAIL',error:e.message});save();throw e;}save();};
 const rpc=(token,op,payload,id=null,revision=null,entity='departments')=>api.request('/rest/v1/rpc/save_workspace_record',{method:'POST',token,body:{p_entity:entity,p_operation:op,p_id:id,p_revision:revision,p_data:payload}});
 const code='F04-'+crypto.randomBytes(4).toString('hex'),op=crypto.randomUUID();
 const payload={department_code:code,department_name_en:'F04 SYNTHETIC atomic save',owner_company_id:900101,is_active:false};
 let first,updated;
 await check('Concurrent create, independent sessions: one row and same receipt',async()=>{
  const results=await Promise.all([rpc(a,op,payload),rpc(b,op,payload)]);
  results.forEach(r=>assert.equal(r.ok,true,JSON.stringify(r.data)));first=results[0].data;
  assert.equal(results[1].data.id,first.id);assert.equal(results.filter(r=>r.data.replayed).length,1);
  ledger.records.push({table:'departments',id:first.id,code});fs.writeFileSync(path.join(dir,'FIXTURES.json'),JSON.stringify(ledger,null,2));
  assert.equal(db.sql(`select to_json(count(*)) from public.departments where department_code=${q(code)};`,{json:true}),1);
 });
 await check('Lost response replay returns original revision without new audit',async()=>{
  const r=await rpc(a,op,payload);assert.equal(r.data.id,first.id);assert.equal(r.data.revision,first.revision);assert.equal(r.data.replayed,true);
  assert.equal(db.sql(`select to_json(count(*)) from public.audit_logs where new_values->>'operation_id'=${q(op)};`,{json:true}),1);
 });
 await check('Same operation cannot be reused with changed input',async()=>{const r=await rpc(a,op,{...payload,department_name_en:'different'});assert.equal(r.data.code,'22023');});
 await check('Concurrent independent updates admit exactly one revision',async()=>{
  const results=await Promise.all([rpc(a,crypto.randomUUID(),{description:'Writer A'},first.id,first.revision),rpc(b,crypto.randomUUID(),{description:'Writer B'},first.id,first.revision)]);
  assert.equal(results.filter(r=>r.ok).length,1,JSON.stringify(results));assert.equal(results.find(r=>!r.ok).data.code,'P0409');updated=results.find(r=>r.ok).data;
 });
 await check('Stale retry cannot overwrite winning update',async()=>{const r=await rpc(a,crypto.randomUUID(),{description:'stale'},first.id,first.revision);assert.equal(r.data.code,'P0409');});
 await check('Update without opening revision is rejected',async()=>{const r=await rpc(a,crypto.randomUUID(),{description:'missing'},first.id);assert.equal(r.data.code,'22023');});
 await check('Missing row is not reported as saved',async()=>{const r=await rpc(a,crypto.randomUUID(),{description:'missing'},999999999,'1');assert.equal(r.ok,false);});
 await check('Unauthorized actor cannot change tracked record',async()=>{const r=await rpc(tokenOther,crypto.randomUUID(),{description:'denied'},first.id,updated.revision);assert.equal(r.ok,false);});
 await check('Unauthorized actor cannot recover another actor receipt',async()=>{const r=await rpc(tokenOther,op,payload);assert.equal(r.ok,false);});
 await check('Anonymous caller cannot execute save RPC',async()=>{const r=await rpc(undefined,crypto.randomUUID(),payload);assert.equal(r.ok,false);});
 await check('Protected field cannot be injected',async()=>{const r=await rpc(a,crypto.randomUUID(),{...payload,created_by:1});assert.equal(r.data.code,'22023');});
 await check('Private receipt cannot be forged via Data API',async()=>{const r=await api.request('/rest/v1/workspace_save_receipts',{method:'POST',token:a,body:{actor:ledger.authId}});assert.equal(r.ok,false);});
 await check('Rejected constraint leaves no receipt and no audit',async()=>{
  const bad=crypto.randomUUID();const r=await rpc(a,bad,{...payload,department_code:code+'-BAD',owner_company_id:999999999});assert.equal(r.ok,false);
  assert.equal(db.sql(`select to_json(count(*)) from erp_private.workspace_save_receipts where operation_id=${q(bad)}::uuid;`,{json:true}),0);
 });
 await check('Old direct writer still increments revision',async()=>{
  const r=await api.request('/rest/v1/departments?id=eq.'+first.id,{method:'PATCH',token:a,body:{description:'legacy change'}});assert.equal(r.ok,true);
  const stale=await rpc(b,crypto.randomUUID(),{description:'overwrite legacy'},first.id,updated.revision);assert.equal(stale.data.code,'P0409');
 });
 await check('Receipt writer is not executable; save RPC is invoker',async()=>{
  const r=db.sql("select json_build_object('writer',has_function_privilege('authenticated','erp_private.workspace_receipt()','execute'),'receipt_table',has_table_privilege('authenticated','erp_private.workspace_save_receipts','insert'),'definer',(select prosecdef from pg_proc where oid='public.save_workspace_record(text,uuid,bigint,bigint,jsonb)'::regprocedure));",{json:true});assert.deepEqual(r,{writer:false,receipt_table:false,definer:false});
 });
 console.log(JSON.stringify({passed:cases.length,failed:0,target:'algt-f00-local',record:first.id}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
