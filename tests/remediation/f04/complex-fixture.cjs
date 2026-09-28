'use strict';
// Reuse only the exact retired synthetic local identity. Never alter its role or password.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const db=require('../f00/local-db.cjs'),api=require('../f00/local-client.cjs');
const base=path.resolve('CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F04');
const dir=path.join(base,process.argv[3]==='--closure'?'closure-20260928':process.argv[3]==='--acceptance'?'acceptance-20260928':'complex-adapters-20260928');
(async()=>{
 const mode=process.argv[2];assert.ok(['resume','retire'].includes(mode));db.assertDatabase();
 const original=JSON.parse(fs.readFileSync(path.join(base,'continuation-20260928/FIXTURES.json')));
 assert.equal(original.target,'algt-f00-local');assert.equal(original.profileId,844);assert.equal(original.authId,'019d4b78-b604-4781-96f4-ae62188c0545');assert.equal(original.state,'AUTH_RETIRED_ADMIN_GUARD_RETAINED');
 const user=await api.request('/auth/v1/admin/users/'+original.authId,{admin:true});assert.equal(user.data.email,original.email);
 const profile=db.sql("select json_build_object('auth',auth_user_id,'name',full_name) from public.user_profiles where id=844",{json:true});assert.equal(profile.auth,original.authId);assert.equal(profile.name,'F04 SYNTHETIC WORKSPACE TEST');
 const receipt=path.join(dir,'FIXTURE_SESSION.json');
 if(mode==='resume'){
  if(fs.existsSync(receipt))assert.equal(JSON.parse(fs.readFileSync(receipt)).state,'RETIRED');
  assert.ok(Date.parse(user.data.banned_until)>Date.now());
  const result=await api.request('/auth/v1/admin/users/'+original.authId,{admin:true,method:'PUT',body:{ban_duration:'none'}});assert.equal(result.ok,true);
  fs.writeFileSync(receipt,JSON.stringify({at:new Date().toISOString(),state:'ACTIVE_LOCAL_TEST',target:original.target,authId:original.authId,profileId:844,records_created:[],roles_changed:[],source_ledger:'../continuation-20260928/FIXTURES.json',production_writes:0},null,2));
 }else{
  const recorded=JSON.parse(fs.readFileSync(receipt));assert.equal(recorded.state,'ACTIVE_LOCAL_TEST');assert.equal(recorded.authId,original.authId);
  const result=await api.request('/auth/v1/admin/users/'+original.authId,{admin:true,method:'PUT',body:{ban_duration:'876000h'}});assert.equal(result.ok,true);
  db.sql("delete from auth.sessions where user_id='019d4b78-b604-4781-96f4-ae62188c0545'; update auth.refresh_tokens set revoked=true where user_id='019d4b78-b604-4781-96f4-ae62188c0545';",{transaction:true});
  const proof=db.sql("select json_build_object('sessions',(select count(*) from auth.sessions where user_id='019d4b78-b604-4781-96f4-ae62188c0545'),'refresh',(select count(*) from auth.refresh_tokens where user_id='019d4b78-b604-4781-96f4-ae62188c0545' and not revoked))",{json:true});assert.equal(proof.sessions,0);assert.equal(proof.refresh,0);
  const final=await api.request('/auth/v1/admin/users/'+original.authId,{admin:true});assert.ok(Date.parse(final.data.banned_until)>Date.now());
  fs.writeFileSync(receipt,JSON.stringify({...recorded,state:'RETIRED',retiredAt:new Date().toISOString(),auth_banned:true,...proof,protected_admin_assignment:'unchanged'},null,2));
 }
 console.log(JSON.stringify({mode,target:original.target,status:'PASS',production_writes:0}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
