'use strict';
// Retire only this run's local login; retain synthetic business/audit rows for evidence.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),db=require('../f00/local-db.cjs'),api=require('../f00/local-client.cjs');
const dir=path.resolve('CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F04/continuation-20260928');
const q=v=>"'"+String(v).replaceAll("'","''")+"'";
(async()=>{
 db.assertDatabase();const ledger=JSON.parse(fs.readFileSync(path.join(dir,'FIXTURES.json')));
 if(ledger.target!=='algt-f00-local'||ledger.state!=='READY'||ledger.profileId!==844||ledger.authId!=='019d4b78-b604-4781-96f4-ae62188c0545')throw Error('Wrong/already retired fixture');
 const u=await api.request('/auth/v1/admin/users/'+ledger.authId,{admin:true});assert.equal(u.data.email,ledger.email);
 const ban=await api.request('/auth/v1/admin/users/'+ledger.authId,{method:'PUT',admin:true,body:{ban_duration:'876000h'}});assert.equal(ban.ok,true);
 let protectedAdmin=false;
 try { db.sql(`do $$ begin if not exists(select 1 from public.user_profiles where id=844 and auth_user_id=${q(ledger.authId)} and full_name='F04 SYNTHETIC WORKSPACE TEST') then raise exception 'Profile ownership mismatch'; end if; end $$;
 delete from public.user_roles where user_profile_id=844 and role_id=${ledger.role.id};
 update public.user_profiles set status='inactive' where id=844;
 delete from auth.sessions where user_id=${q(ledger.authId)};
 update auth.refresh_tokens set revoked=true where user_id=${q(ledger.authId)};
 update public.roles set is_active=${ledger.role.active?'true':'false'} where id=${ledger.role.id} and not exists(select 1 from public.user_roles where role_id=${ledger.role.id} and is_active);
 `,{transaction:true}); } catch(e) {
  if(!e.message.includes('Cannot remove the last active system administrator'))throw e;
  protectedAdmin=true;
  fs.writeFileSync(path.join(dir,'CLEANUP_GUARD.json'),JSON.stringify({at:new Date().toISOString(),target:ledger.target,transaction_rolled_back:true,reason:'Last-active-system-administrator protection refused profile/role retirement; no trigger was disabled.'},null,2));
  // Preserve the F03 guard. A banned identity with no sessions cannot use this retained local assignment.
  db.sql(`delete from auth.sessions where user_id=${q(ledger.authId)}; update auth.refresh_tokens set revoked=true where user_id=${q(ledger.authId)};`,{transaction:true});
 }
 const proof=db.sql(`select json_build_object('status',(select status from public.user_profiles where id=844),'roles',(select count(*) from public.user_roles where user_profile_id=844),'sessions',(select count(*) from auth.sessions where user_id=${q(ledger.authId)}),'refresh',(select count(*) from auth.refresh_tokens where user_id=${q(ledger.authId)} and not revoked),'role_active',(select is_active from public.roles where id=${ledger.role.id}));`,{json:true});
 assert.equal(proof.sessions,0);assert.equal(proof.refresh,0);
 const finalUser=await api.request('/auth/v1/admin/users/'+ledger.authId,{admin:true});assert.ok(Date.parse(finalUser.data.banned_until)>Date.now());
 if(!protectedAdmin){assert.equal(proof.status,'inactive');assert.equal(proof.roles,0);assert.equal(proof.role_active,ledger.role.active);}
 ledger.state=protectedAdmin?'AUTH_RETIRED_ADMIN_GUARD_RETAINED':'RETIRED';ledger.retiredAt=new Date().toISOString();fs.writeFileSync(path.join(dir,'FIXTURES.json'),JSON.stringify(ledger,null,2));
 const receipt={at:ledger.retiredAt,status:protectedAdmin?'PARTIAL_PROTECTED_ADMIN_RETAINED':'PASS',target:ledger.target,profile_state:proof.status,roles:proof.roles,sessions:proof.sessions,refresh:proof.refresh,role_active:proof.role_active,auth_banned:true,admin_guard_preserved:true,synthetic_business_records:'retained with exact IDs in FIXTURES.json',production_writes:0};
 fs.writeFileSync(path.join(dir,'CLEANUP.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
