'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const db=require('../f00/local-db.cjs'),api=require('../f00/local-client.cjs');
const dir=path.resolve('CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F04/acceptance-20260928');
const file=path.join(dir,'SECOND_ACTOR.json');
const q=x=>"'"+String(x).replaceAll("'","''")+"'";
(async()=>{
 db.assertDatabase();const mode=process.argv[2];assert.ok(['create','retire','proof'].includes(mode));
 if(mode==='create'){
  assert.equal(fs.existsSync(file),false);fs.mkdirSync(path.join(dir,'private'),{recursive:true});
  const email='f00-f04-switch-'+crypto.randomBytes(4).toString('hex')+'@example.invalid';
  const r={at:new Date().toISOString(),target:'algt-f00-local',state:'PREPARING',email,role_grants:0,production_writes:0};
  const save=()=>fs.writeFileSync(file,JSON.stringify(r,null,2));save();
  const password=crypto.randomBytes(24).toString('base64url')+'aA9!';
  const u=await api.request('/auth/v1/admin/users',{method:'POST',admin:true,body:{email,password,email_confirm:true}});assert.equal(u.ok,true);
  r.authId=u.data.id;save();
  r.profileId=db.sql(`update public.user_profiles set status='active',must_change_password=false,full_name='F04 ACCOUNT SWITCH SYNTHETIC' where auth_user_id=${q(r.authId)} returning to_json(id);`,{json:true});save();
  assert.equal(db.sql(`select to_json(count(*)) from public.user_roles where user_profile_id=${Number(r.profileId)};`,{json:true}),0);
  fs.writeFileSync(path.join(dir,'private/second-credentials.json'),JSON.stringify({email,password}),{mode:0o600});r.state='READY';save();
  console.log(JSON.stringify({status:'PASS',authId:r.authId,profileId:r.profileId,roles:0,local_only:true}));
 }else if(mode==='retire'){
  const r=JSON.parse(fs.readFileSync(file));assert.equal(r.target,'algt-f00-local');assert.equal(r.state,'READY');
  const u=await api.request('/auth/v1/admin/users/'+r.authId,{admin:true});assert.equal(u.data.email,r.email);
  const result=await api.request('/auth/v1/admin/users/'+r.authId,{admin:true,method:'PUT',body:{ban_duration:'876000h'}});assert.equal(result.ok,true);
  db.sql(`delete from auth.sessions where user_id=${q(r.authId)}; update auth.refresh_tokens set revoked=true where user_id=${q(r.authId)};`,{transaction:true});
  const proof=db.sql(`select json_build_object('sessions',(select count(*) from auth.sessions where user_id=${q(r.authId)}),'refresh',(select count(*) from auth.refresh_tokens where user_id=${q(r.authId)} and not revoked),'roles',(select count(*) from public.user_roles where user_profile_id=${Number(r.profileId)}));`,{json:true});
  assert.equal(proof.sessions,0);assert.equal(proof.refresh,0);assert.equal(proof.roles,0);
  fs.writeFileSync(file,JSON.stringify({...r,state:'RETIRED',retiredAt:new Date().toISOString(),...proof},null,2));console.log(JSON.stringify({status:'PASS',...proof}));
 }else{
  const result=db.sql("select json_build_object('departments',(select coalesce(json_agg(json_build_object('id',id,'code',department_code,'name',department_name_en,'revision',workspace_revision)),'[]'::json) from public.departments where department_code='F04-LOSS-2809'),'signatories',(select coalesce(json_agg(json_build_object('id',id,'company_id',company_id,'name',full_name,'active',is_active)),'[]'::json) from public.owner_company_signatories where full_name='F04 CHILD ACCEPTANCE 2809'));",{json:true});
  fs.writeFileSync(path.join(dir,'BUSINESS_RECORDS.json'),JSON.stringify({at:new Date().toISOString(),...result},null,2));console.log(JSON.stringify(result));
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
