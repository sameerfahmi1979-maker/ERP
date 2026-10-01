import {guard,sql,runtime} from './full-db.mjs';
import {createClient} from '@supabase/supabase-js';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
guard();
const raw=execFileSync('powershell.exe',['-NoProfile','-Command',"$env:SUPABASE_TELEMETRY_DISABLED='1'; supabase status --workdir '"+runtime+"' --output json"],{encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe']});
const k=JSON.parse(raw);assert.equal(k.API_URL,'http://127.0.0.1:16521');
fs.writeFileSync(path.join(runtime,'keys-private.json'),JSON.stringify(k));
const admin=createClient(k.API_URL,k.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const ledgerFile=path.join(runtime,'fixtures-private.json');
const ledger=fs.existsSync(ledgerFile)?JSON.parse(fs.readFileSync(ledgerFile,'utf8')):{marker:'F09_LOCAL_20260930',actors:{},queueIds:[],scheduleIds:[],productionRowsCopied:0};
assert.equal(Object.keys(ledger.actors).length,0,'Accounts already created; inspect ledger instead of repeating provisioning');
const save=()=>fs.writeFileSync(ledgerFile,JSON.stringify(ledger,null,2));
save();
const insert=async(table,row)=>{const r=await admin.from(table).insert(row).select('id').single();if(r.error)throw Error(table+': '+r.error.message);return r.data.id;};
ledger.companyId??=await insert('owner_companies',{company_code:'F09_LOCAL',legal_name_en:'F09 synthetic company'});save();
const permissions=['notifications.email_queue.view','notifications.email_queue.manage','notifications.email_queue.process','reports.view','reports.run','reports.export','reports.email','reports.schedule.view','reports.schedule.manage','notifications.view'];
for(const permission_code of permissions){const r=await admin.from('permissions').upsert({permission_code,permission_name:permission_code,module_code:'NOTIFICATIONS',action_code:permission_code.split('.').at(-1),is_active:true},{onConflict:'permission_code'});if(r.error)throw Error(r.error.message);}
const codes=await admin.from('permissions').select('id').in('permission_code',permissions);if(codes.error)throw Error(codes.error.message);
for(const name of ['operator','scoped','none']){
 const email='f09-'+name+'@example.invalid',password=randomBytes(24).toString('base64url')+'Aa9!';
 const u=await admin.auth.admin.createUser({email,password,email_confirm:true});if(u.error)throw Error('Create synthetic user: '+u.error.message);
 ledger.actors[name]={email,password,authId:u.data.user.id};save();
 const p=await admin.from('user_profiles').update({full_name:'F09 synthetic '+name,status:'active',must_change_password:false,owner_company_id:ledger.companyId}).eq('auth_user_id',u.data.user.id).select('id').single();
 if(p.error)throw Error('Profile: '+p.error.message);ledger.actors[name].profileId=p.data.id;save();
 if(name!=='none'){
 const role=await insert('roles',{role_code:'f09_'+name,role_name:'F09 synthetic '+name,is_system_role:false,is_active:true});
 const rp=await admin.from('role_permissions').insert(codes.data.map(p=>({role_id:role,permission_id:p.id})));if(rp.error)throw Error(rp.error.message);
 const ur=await insert('user_roles',{user_profile_id:p.data.id,role_id:role,owner_company_id:name==='scoped'?ledger.companyId:null,branch_id:null,is_active:true});
 ledger.actors[name].roleId=role;ledger.actors[name].assignmentId=ur;save();
 }
}
assert.equal(sql('select count(*) from public.erp_email_provider_configs;'),'0');
console.log(JSON.stringify({actors:Object.keys(ledger.actors),companyId:ledger.companyId,realEmailsSent:0,providerConfigs:0}));
