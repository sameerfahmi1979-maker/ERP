import {guard,sql,runtime,evidence} from './local-db.mjs';
import {createClient} from '@supabase/supabase-js';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
guard();
const raw=execFileSync('powershell.exe',['-NoProfile','-Command',`supabase status --workdir '${runtime}' --output json`],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']});
const keys=JSON.parse(raw);assert.equal(keys.API_URL,'http://127.0.0.1:16621');
fs.writeFileSync(path.join(runtime,'keys-private.json'),JSON.stringify(keys));
const file=path.join(runtime,'fixtures-private.json');
assert.ok(!fs.existsSync(file),'Fixtures already registered; do not duplicate');
const ledger={marker:'F06_LOCAL_20261001',actors:{},rows:[],intents:[],companyIds:[],branchIds:[],productionRowsCopied:0};
const save=()=>{
 fs.writeFileSync(file,JSON.stringify(ledger,null,2));
 fs.writeFileSync(path.join(evidence,'SYNTHETIC_RESOURCES.json'),JSON.stringify({...ledger,actors:Object.fromEntries(Object.entries(ledger.actors).map(([name,a])=>[name,{email:a.email,authId:a.authId,profileId:a.profileId,roleId:a.roleId,assignmentId:a.assignmentId}]))},null,2));
};save();
const admin=createClient(keys.API_URL,keys.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
async function insert(table,row){
 ledger.intents.push({table,marker:row.company_code??row.branch_code??row.role_code??row.permission_code??ledger.marker});save();
 const r=await admin.from(table).insert(row).select('id').single();if(r.error)throw Error(table+': '+r.error.message);
 ledger.rows.push({table,id:r.data.id});save();return r.data.id;
}
for(const name of ['A','B'])ledger.companyIds.push(await insert('owner_companies',{company_code:'F06_'+name,legal_name_en:'F06 synthetic company '+name}));save();
for(const name of ['A1','A2','B1'])ledger.branchIds.push(await insert('branches',{branch_code:'F06_'+name,branch_name_en:'F06 synthetic branch '+name,owner_company_id:ledger.companyIds[name==='B1'?1:0]}));save();
const codes=['common_md.view','common_md.manage','common_md.departments.view','common_md.departments.manage','common_md.work_calendars.view','common_md.work_calendars.manage','hr.settings.view','hr.settings.manage'];
const permissionIds={};for(const code of codes)permissionIds[code]=await insert('permissions',{permission_code:code,permission_name:code,module_code:code.startsWith('hr.')?'hr':'common_md',action_code:code.split('.').at(-1),is_active:true});
for(const name of ['admin','companyA','branchA1','companyB','reader','none']){
 const email=`f06-${name.toLowerCase()}@example.invalid`,password=randomBytes(24).toString('base64url')+'Aa9!';
 ledger.actors[name]={email,password,status:'PLANNED'};save();
 const u=await admin.auth.admin.createUser({email,password,email_confirm:true});if(u.error)throw Error('Create synthetic user: '+u.error.message);
 const actor=ledger.actors[name];actor.authId=u.data.user.id;actor.status='CREATED';save();
 const p=await admin.from('user_profiles').update({full_name:'F06 synthetic '+name,status:'active',must_change_password:false,owner_company_id:ledger.companyIds[name==='companyB'?1:0]}).eq('auth_user_id',actor.authId).select('id').single();if(p.error)throw Error(p.error.message);
 actor.profileId=p.data.id;save();
 if(name!=='none'){
  actor.roleId=await insert('roles',{role_code:name==='admin'?'system_admin':'f06_'+name.toLowerCase(),role_name:'F06 synthetic '+name,is_system_role:name==='admin',is_active:true});save();
  // The synthetic global administrator intentionally has no explicit permission
  // links: this exposes the recorded UI/DB global-admin discrepancy in Grades.
  const grants=name==='admin'?[]:codes.filter(c=>name!=='reader'||c.endsWith('.view'));
  if(grants.length){const r=await admin.from('role_permissions').insert(grants.map(code=>({role_id:actor.roleId,permission_id:permissionIds[code]})));if(r.error)throw Error(r.error.message);}
  actor.assignmentId=await insert('user_roles',{user_profile_id:actor.profileId,role_id:actor.roleId,owner_company_id:name==='admin'?null:ledger.companyIds[name==='companyB'?1:0],branch_id:name==='branchA1'?ledger.branchIds[0]:null,is_active:true});save();
 }
}
assert.equal(sql('select count(*) from public.erp_email_provider_configs;'),'0');
console.log(JSON.stringify({actors:Object.keys(ledger.actors),companies:ledger.companyIds,branches:ledger.branchIds,realEmailsSent:0,providerConfigs:0}));
