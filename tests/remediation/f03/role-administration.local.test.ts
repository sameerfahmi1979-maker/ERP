import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { createClient as sdk } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const state=vi.hoisted(()=>({client:null as any,admin:null as any}));
vi.mock('server-only',()=>({}));
vi.mock('next/cache',()=>({revalidatePath:()=>{}}));
vi.mock('next/headers',()=>({headers:async()=>new Headers()}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>state.client}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>state.admin}));
import { saveRolePermissionDraftChanges } from '@/server/actions/permissions';
import { assignRoleToUser, createUser, deleteUser } from '@/server/actions/users';
import { getUserEffectiveAccess } from '@/server/actions/users/effective-access';
import { getUsersForEmailSelect } from '@/server/actions/lookups/users-for-email';
import { listUserScopeOptions } from '@/server/queries/user-scope-options';
const require=createRequire(import.meta.url),db=require('../f00/local-db.cjs'),api=require('../f00/local-client.cjs');
const run='f03_'+randomBytes(5).toString('hex');
const ledger:any={run,target:'algt-f00-local',production_mutations:0,accounts:[],roles:[],permissions:[],operations:[],cases:[],cleanup:false};
const actors:Record<string,any>={},pids:Record<string,number>={};let targetRole:number;
const save=()=>fs.writeFileSync(path.resolve('CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F03/ROLE_TEST_RECORDS.json'),JSON.stringify(ledger,null,2));
const pass=(name:string)=>{ledger.cases.push({name,status:'PASS'});save();};
async function insert(table:string,row:any){const r=await state.admin.from(table).insert(row).select('id').single();if(r.error)throw new Error(table+': '+r.error.message);return r.data.id as number;}
beforeAll(async()=>{
 db.assertDatabase();const config=api.keys();expect(config.API_URL).toBe('http://127.0.0.1:16421');
 state.admin=sdk(config.API_URL,config.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 for(const code of ['roles.manage','roles.view','permissions.view','users.create','users.view','users.update','users.delete','users.roles.assign','hr.employees.view','hr.medical.view']){
  const r=await state.admin.from('permissions').select('id').eq('permission_code',code).maybeSingle();if(r.error)throw r.error;
  pids[code]=r.data?.id??await insert('permissions',{permission_code:code,permission_name:code,module_code:code.split('.')[0],action_code:'view'});if(!r.data)ledger.permissions.push(pids[code]);save();
 }
 for(const [name,company,branch,caps] of [
  ['editor',null,null,['roles.manage','roles.view','permissions.view']],
  ['assigner',900101,900201,['users.create','users.view','users.update','users.delete','users.roles.assign','roles.view','hr.employees.view']],
  ['target',900101,900201,[]],['other',900102,900203,[]],
 ] as [string,number|null,number|null,string[]][]){
  const role=await insert('roles',{role_code:run+'_'+name,role_name:'F03 role '+name,is_system_role:false});ledger.roles.push(role);save();
  if(caps.length){const rp=await state.admin.from('role_permissions').insert(caps.map(c=>({role_id:role,permission_id:pids[c]})));if(rp.error)throw rp.error;}
  const email='f00-'+run+'-'+name+'@example.invalid',password=randomBytes(24).toString('base64url')+'aA9!';
  const u=await state.admin.auth.admin.createUser({email,password,email_confirm:true});if(u.error)throw u.error;ledger.accounts.push({name,authId:u.data.user.id,email});save();
  const p=await state.admin.from('user_profiles').update({status:'active',must_change_password:false,owner_company_id:company,branch_id:branch,full_name:'F03 role '+name}).eq('auth_user_id',u.data.user.id).select('id').single();if(p.error)throw p.error;
  const ur=await state.admin.from('user_roles').insert({user_profile_id:p.data.id,role_id:role,owner_company_id:company,branch_id:branch});if(ur.error)throw ur.error;
  const client=sdk(config.API_URL,config.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const s=await client.auth.signInWithPassword({email,password});if(s.error)throw s.error;actors[name]={client,id:p.data.id,role};
 }
 targetRole=await insert('roles',{role_code:run+'_delegate',role_name:'F03 delegable employee reader',is_system_role:false});ledger.roles.push(targetRole);save();
},60000);
afterAll(async()=>{
 const failures=[];
 for(const op of ledger.operations){
  const row=await state.admin.from('erp_account_provisioning_operations').select('auth_user_id').eq('id',op).maybeSingle();
  if(row.error)failures.push('operation lookup '+op);
  if(row.data?.auth_user_id&&!ledger.accounts.some((a:any)=>a.authId===row.data.auth_user_id)){const r=await state.admin.auth.admin.deleteUser(row.data.auth_user_id);if(r.error && r.error.status!==404)failures.push('provisioned account '+row.data.auth_user_id);}
  const removed=await state.admin.from('erp_account_provisioning_operations').delete().eq('id',op);if(removed.error)failures.push('operation '+op);
 }
 for(const a of ledger.accounts){const r=await state.admin.auth.admin.deleteUser(a.authId);if(r.error)failures.push('account '+a.authId);}
 for(const id of ledger.roles){await state.admin.from('role_permissions').delete().eq('role_id',id);const r=await state.admin.from('roles').delete().eq('id',id);if(r.error)failures.push('role '+id);}
 for(const id of ledger.permissions){const r=await state.admin.from('permissions').delete().eq('id',id);if(r.error)failures.push('permission '+id);}
 ledger.cleanup=failures.length===0;ledger.cleanupFailures=failures;save();expect(failures).toEqual([]);
},60000);
it('scoped user administration receives minimal company/branch labels without organization-wide read grants',async()=>{
 state.client=actors.assigner.client;const result=await listUserScopeOptions();
 expect(result.companies.map(x=>x.id)).toEqual([900101]);expect(result.branches.map(x=>x.id)).toEqual([900201]);
 expect(Object.keys(result.companies[0]).sort()).toEqual(['company_code','id','legal_name_en']);
 expect(Object.keys(result.branches[0]).sort()).toEqual(['branch_code','branch_name_en','id','owner_company_id']);
 pass('minimal user administration scope options positive and sibling denial');
});
it('unprivileged user receives no user administration scope labels',async()=>{
 state.client=actors.target.client;expect(await listUserScopeOptions()).toEqual({companies:[],branches:[]});pass('user scope labels denied without capability');
});
it('valid permission batch commits grant and audit together',async()=>{
 state.client=actors.editor.client;const result=await saveRolePermissionDraftChanges([{roleId:targetRole,permissionId:pids['hr.employees.view'],action:'grant',permissionCode:'',permissionName:'',roleCode:'',roleName:''}]);expect(result.success).toBe(true);
 const grants=await state.admin.from('role_permissions').select('permission_id').eq('role_id',targetRole);expect(grants.data).toEqual([{permission_id:pids['hr.employees.view']}]);
 const logs=await state.admin.from('audit_logs').select('id').eq('actor_user_profile_id',actors.editor.id).eq('entity_id',targetRole).eq('action','ROLE_PERMISSION_CHANGED');expect(logs.error).toBeNull();expect(logs.data).toHaveLength(1);pass('atomic grant/audit');
});
it('invalid second change rolls back the first change and its audit entry',async()=>{
 const r=await actors.editor.client.rpc('f03_apply_permission_batch',{changes:[{roleId:targetRole,permissionId:pids['hr.employees.view'],action:'revoke'},{roleId:targetRole,permissionId:999999991,action:'grant'}]});expect(r.error).not.toBeNull();
 const grants=await state.admin.from('role_permissions').select('permission_id').eq('role_id',targetRole);expect(grants.data).toEqual([{permission_id:pids['hr.employees.view']}]);
 const logs=await state.admin.from('audit_logs').select('id').eq('actor_user_profile_id',actors.editor.id).eq('entity_id',targetRole).eq('action','ROLE_PERMISSION_CHANGED');expect(logs.data).toHaveLength(1);pass('batch failure rollback including audit');
});
it('cloning a custom role copies its permissions atomically',async()=>{
 const r=await actors.editor.client.rpc('f03_clone_role',{source_id:targetRole,details:{role_code:run+'_clone',role_name:'F03 cloned role'}});expect(r.error).toBeNull();ledger.roles.push(r.data.id);save();expect(r.data.permissions_copied_count).toBe(1);
 const grants=await state.admin.from('role_permissions').select('permission_id').eq('role_id',r.data.id);expect(grants.data).toEqual([{permission_id:pids['hr.employees.view']}]);pass('atomic custom role clone');
});
it('stale reviewed permission state rejects the complete batch without an audit success',async()=>{
 const before=await state.admin.from('audit_logs').select('id').eq('actor_user_profile_id',actors.editor.id).eq('entity_id',targetRole).eq('action','ROLE_PERMISSION_CHANGED');
 const r=await actors.editor.client.rpc('f03_apply_permission_batch',{changes:[
  {roleId:targetRole,permissionId:pids['hr.medical.view'],action:'grant',expectedAssigned:false},
  {roleId:targetRole,permissionId:pids['hr.employees.view'],action:'grant',expectedAssigned:false},
 ]});expect(r.error?.code).toBe('P0001');
 const grants=await state.admin.from('role_permissions').select('permission_id').eq('role_id',targetRole);expect(grants.data).toEqual([{permission_id:pids['hr.employees.view']}]);
 const after=await state.admin.from('audit_logs').select('id').eq('actor_user_profile_id',actors.editor.id).eq('entity_id',targetRole).eq('action','ROLE_PERMISSION_CHANGED');expect(after.data).toEqual(before.data);pass('stale review rollback');
});
it('scoped assigner can delegate only an in-scope capability they hold',async()=>{
 state.client=actors.assigner.client;const good=await assignRoleToUser({user_profile_id:actors.target.id,role_id:targetRole,owner_company_id:900101,branch_id:900201,is_active:true});expect(good.success).toBe(true);
 const bad=await assignRoleToUser({user_profile_id:actors.other.id,role_id:targetRole,owner_company_id:900102,branch_id:900203,is_active:true});expect(bad.success).toBe(false);
 const wide=await assignRoleToUser({user_profile_id:actors.target.id,role_id:targetRole,owner_company_id:900101,branch_id:null,is_active:true});expect(wide.success).toBe(false);pass('delegation positive and scope widening denial');
});
it('concurrent reviewed permission grants have exactly one winner and one conflict',async()=>{
 const before=await state.admin.from('audit_logs').select('id').eq('entity_id',targetRole).eq('action','ROLE_PERMISSION_CHANGED');expect(before.error).toBeNull();
 const batch={changes:[{roleId:targetRole,permissionId:pids['hr.medical.view'],action:'grant',expectedAssigned:false}]};
 const [a,b]=await Promise.all([actors.editor.client.rpc('f03_apply_permission_batch',batch),actors.editor.client.rpc('f03_apply_permission_batch',batch)]);
 expect([a,b].filter(r=>!r.error)).toHaveLength(1);expect([a,b].filter(r=>r.error?.code==='P0001')).toHaveLength(1);
 const rows=await state.admin.from('role_permissions').select('permission_id').eq('role_id',targetRole).eq('permission_id',pids['hr.medical.view']);expect(rows.data).toHaveLength(1);
 const after=await state.admin.from('audit_logs').select('id').eq('entity_id',targetRole).eq('action','ROLE_PERMISSION_CHANGED');expect(after.data!.length-before.data!.length).toBe(1);
 const cleanup=await state.admin.from('role_permissions').delete().eq('role_id',targetRole).eq('permission_id',pids['hr.medical.view']);expect(cleanup.error).toBeNull();
 pass('concurrent permission review one commit / one conflict / one audit');
});
it('scoped assigner cannot add an unheld sensitive capability',async()=>{
 const role=await insert('roles',{role_code:run+'_sensitive',role_name:'F03 sensitive role',is_system_role:false});ledger.roles.push(role);save();
 const rp=await state.admin.from('role_permissions').insert({role_id:role,permission_id:pids['hr.medical.view']});expect(rp.error).toBeNull();
 const r=await actors.assigner.client.from('user_roles').insert({user_profile_id:actors.target.id,role_id:role,owner_company_id:900101,branch_id:900201});expect(r.error).not.toBeNull();pass('sensitive delegated privilege escalation denied');
});
it('ordinary users cannot invoke permission batch or clone RPCs',async()=>{
 const batch=await actors.target.client.rpc('f03_apply_permission_batch',{changes:[{roleId:targetRole,permissionId:pids['hr.medical.view'],action:'grant'}]});expect(batch.error).not.toBeNull();
 const clone=await actors.target.client.rpc('f03_clone_role',{source_id:targetRole,details:{role_code:run+'_denied',role_name:'Denied'}});expect(clone.error).not.toBeNull();pass('unprivileged RPC denial');
});
it('recipient lookup returns only active targets in the lookup capability scope',async()=>{
 state.client=actors.assigner.client;
 const found=await getUsersForEmailSelect(run);
 expect(found.map(r=>r.id).sort()).toEqual([actors.assigner.id,actors.target.id].sort());
 state.client=actors.target.client;expect(await getUsersForEmailSelect(run)).toEqual([]);
 pass('scoped recipient directory positive / foreign and unprivileged denial');
});
it('last administrator and system-role protection hold in a rolled-back transaction',()=>{
 const ids=[actors.target.id,actors.other.id];expect(ids.every(Number.isSafeInteger)).toBe(true);
 // All administrator assignments exist only inside this transaction and are rolled back.
 db.sql(`BEGIN;
 DO $test$ DECLARE rid bigint; blocked boolean:=false; n integer; BEGIN
 SELECT id INTO rid FROM public.roles WHERE role_code='system_admin';
 IF rid IS NULL THEN INSERT INTO public.roles(role_code,role_name,is_system_role,is_assignable,is_active) VALUES('system_admin','F03 rollback-only admin',true,true,true) RETURNING id INTO rid; END IF;
 IF EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id WHERE r.role_code='system_admin' AND ur.is_active AND ur.owner_company_id IS NULL AND ur.branch_id IS NULL) THEN RAISE EXCEPTION 'Unexpected pre-existing local global admin'; END IF;
 UPDATE public.roles SET is_active=true,is_assignable=true WHERE id=rid;
 INSERT INTO public.user_roles(user_profile_id,role_id,is_active) VALUES(${ids[0]},rid,true),(${ids[1]},rid,true);
 SELECT count(*) INTO n FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id JOIN public.user_profiles p ON p.id=ur.user_profile_id WHERE r.id=rid AND r.is_active AND p.status='active' AND ur.is_active AND ur.owner_company_id IS NULL AND ur.branch_id IS NULL;
 IF n<>2 THEN RAISE EXCEPTION 'Rollback fixture expected two active global admins, actual %',n; END IF;
 DELETE FROM public.user_roles WHERE user_profile_id=${ids[0]} AND role_id=rid;
 BEGIN DELETE FROM public.user_roles WHERE user_profile_id=${ids[1]} AND role_id=rid; EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Last-admin delete was allowed'; END IF;
 blocked:=false; BEGIN UPDATE public.user_profiles SET status='inactive' WHERE id=${ids[1]}; EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Last-admin deactivation was allowed'; END IF;
 blocked:=false; BEGIN UPDATE public.roles SET is_active=false WHERE id=rid; EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'System-role deactivation was allowed'; END IF;
 END $test$; ROLLBACK;`);
 pass('last administrator / system role rollback-only checks');
});
it('two independent sessions cannot concurrently remove both last administrators',async()=>{
 const ids=[actors.target.id,actors.other.id];expect(ids.every(Number.isSafeInteger)).toBe(true);
 const baseline=db.sql(`select json_build_object('id',id,'active',is_active,'assignable',is_assignable,
 'assignments',(select count(*) from public.user_roles ur where ur.role_id=roles.id and ur.is_active and ur.owner_company_id is null and ur.branch_id is null))
 from public.roles where role_code='system_admin';`,{json:true});
 expect(baseline.assignments).toBe(0);expect(Number.isSafeInteger(baseline.id)).toBe(true);
 const roleId=baseline.id;ledger.concurrentAdmin={roleId,profileIds:ids,baseline,cleanup:false};save();
 try {
  db.sql(`BEGIN; UPDATE public.roles SET is_active=true,is_assignable=true WHERE id=${roleId};
  INSERT INTO public.user_roles(user_profile_id,role_id,is_active) VALUES(${ids[0]},${roleId},true),(${ids[1]},${roleId},true); COMMIT;`);
  const rows=await state.admin.from('user_roles').select('id,user_profile_id').eq('role_id',roleId).in('user_profile_id',ids);expect(rows.error).toBeNull();expect(rows.data).toHaveLength(2);
  const [a,b]=await Promise.all(['target','other'].map(name=>actors[name].client.from('user_roles').delete().eq('id',rows.data!.find((r:any)=>r.user_profile_id===actors[name].id)!.id).select('id')));
  expect([a,b].filter(r=>!r.error&&r.data?.length===1)).toHaveLength(1);expect([a,b].filter(r=>r.error?.code==='42501')).toHaveLength(1);
  const remaining=await state.admin.from('user_roles').select('id').eq('role_id',roleId).in('user_profile_id',ids);expect(remaining.data).toHaveLength(1);
 } finally {
  // Guarded local fixture teardown only. Restore the precise pre-test role state
  // in one transaction; never ship or use this cleanup on a cloud database.
  db.sql(`BEGIN; ALTER TABLE public.user_roles DISABLE TRIGGER f03_administration_guard;
   ALTER TABLE public.roles DISABLE TRIGGER f03_administration_guard;
   DELETE FROM public.user_roles WHERE role_id=${roleId} AND user_profile_id IN (${ids.join(',')});
   UPDATE public.roles SET is_active=${baseline.active?'true':'false'},is_assignable=${baseline.assignable?'true':'false'} WHERE id=${roleId};
   ALTER TABLE public.roles ENABLE TRIGGER f03_administration_guard;
   ALTER TABLE public.user_roles ENABLE TRIGGER f03_administration_guard; COMMIT;`);
  ledger.concurrentAdmin.cleanup=true;save();
 }
 pass('independent-session simultaneous last-admin removals leave one administrator');
});
it('account creation persists stages, requires password change, and acknowledges duplicate operation without a duplicate user',async()=>{
 state.client=actors.assigner.client;const operationId=randomUUID();ledger.operations.push(operationId);save();
 const input={creation_operation_id:operationId,email:'f00-'+run+'-created@example.invalid',temporary_password:randomBytes(24).toString('base64url')+'aA9!',send_invite_email:false,full_name:'F03 created account',owner_company_id:900101,branch_id:900201,status:'active' as const};
 const first=await createUser(input);expect(first.success).toBe(true);expect(first.data?.stages.identity).toBe('created');
 const p=await state.admin.from('user_profiles').select('auth_user_id,must_change_password').eq('id',first.data!.user_profile_id).single();expect(p.error).toBeNull();expect(p.data.must_change_password).toBe(true);
 ledger.accounts.push({name:'created',authId:p.data.auth_user_id,email:input.email});save();
 const second=await createUser(input);expect(second.success).toBe(true);expect(second.data?.user_profile_id).toBe(first.data?.user_profile_id);
 const receipt=await state.admin.from('erp_account_provisioning_operations').select('state,stages').eq('id',operationId).single();expect(receipt.error).toBeNull();expect(receipt.data.state).toBe('completed');pass('account provisioning stage receipt and idempotency');
});
it('a profile setup failure compensates only the identity created by this attempt',async()=>{
 state.client=actors.assigner.client;const operationId=randomUUID();ledger.operations.push(operationId);save();const real=state.admin;
 state.admin=new Proxy(real,{get(target,key){if(key==='from')return (table:string)=>{
  const builder=target.from(table);if(table!=='user_profiles')return builder;
  return new Proxy(builder,{get(query,method){if(method==='upsert')return ()=>({select:()=>({single:async()=>({data:null,error:{message:'synthetic profile fault'}})})});const v=Reflect.get(query,method);return typeof v==='function'?v.bind(query):v;}});
 };const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
 try {const r=await createUser({creation_operation_id:operationId,email:'f00-'+run+'-compensated@example.invalid',temporary_password:randomBytes(24).toString('base64url')+'aA9!',send_invite_email:false,full_name:'F03 profile fault',owner_company_id:900101,branch_id:900201,status:'active'});expect(r.success).toBe(false);expect(r.error).toContain('newly created identity was removed');}
 finally {state.admin=real;}
 const receipt=await real.from('erp_account_provisioning_operations').select('state,auth_user_id').eq('id',operationId).single();expect(receipt.error).toBeNull();expect(receipt.data.state).toBe('compensated');
 const user=await real.auth.admin.getUserById(receipt.data.auth_user_id);expect(user.data.user).toBeNull();pass('profile fault compensated with durable receipt');
});
it('an interrupted identity response is journaled for reconciliation and cannot silently retry',async()=>{
 state.client=actors.assigner.client;const operationId=randomUUID();ledger.operations.push(operationId);save();const real=state.admin;
 const input={creation_operation_id:operationId,email:'f00-'+run+'-interrupted@example.invalid',temporary_password:randomBytes(24).toString('base64url')+'aA9!',send_invite_email:false,full_name:'F03 interrupted identity',owner_company_id:900101,branch_id:900201,status:'active' as const};
 state.admin=new Proxy(real,{get(target,key){if(key==='auth')return {admin:{createUser:async()=>{throw new Error('synthetic provider interruption');}}};const v=Reflect.get(target,key);return typeof v==='function'?v.bind(target):v;}});
 try {const r=await createUser(input);expect(r.success).toBe(false);expect(r.error).toContain('needs reconciliation');}
 finally {state.admin=real;}
 const receipt=await real.from('erp_account_provisioning_operations').select('state').eq('id',operationId).single();expect(receipt.data.state).toBe('needs_reconciliation');
 const repeated=await createUser(input);expect(repeated.success).toBe(false);expect(repeated.error).toContain('Creation is pending');pass('ambiguous provider failure and replay fail closed');
});

it('scoped user deletion cannot remove another company account',async()=>{
 state.client=actors.assigner.client;
 const denied=await deleteUser(actors.other.id);expect(denied.success).toBe(false);expect(denied.error).toContain('company/branch');
 const profile=await state.admin.from('user_profiles').select('id').eq('id',actors.other.id).single();expect(profile.error).toBeNull();
 pass('cross-company user deletion denied and target preserved');
});
it('effective access keeps repeated role scopes and reports target status, not viewer authority',async()=>{
 const permission=pids['hr.employees.view'];
 const r=await state.admin.from('role_permissions').select('permission_id').eq('role_id',targetRole).eq('permission_id',permission).single();expect(r.error).toBeNull();
 // The earlier positive delegation case already assigned branch 900201.
 const added=await state.admin.from('user_roles').insert({user_profile_id:actors.target.id,role_id:targetRole,owner_company_id:900101,branch_id:900202}).select('id');expect(added.error).toBeNull();
 try {
  state.client=actors.editor.client;
  const result=await getUserEffectiveAccess(actors.target.id);expect(result.success).toBe(true);expect(result.subject?.globalAdmin).toBe(false);
  expect(result.data!.filter(p=>p.source_role_code===run+'_delegate'&&p.permission_code==='hr.employees.view').map(p=>p.branch_id).sort()).toEqual([900201,900202]);
  const inactive=await state.admin.from('user_profiles').update({status:'inactive'}).eq('id',actors.target.id);expect(inactive.error).toBeNull();
  const restricted=await getUserEffectiveAccess(actors.target.id);expect(restricted.success).toBe(true);expect(restricted.subject?.active).toBe(false);expect(restricted.data).toEqual([]);
  state.client=actors.assigner.client;expect((await getUserEffectiveAccess(actors.other.id)).success).toBe(false);
 } finally {
  await state.admin.from('user_profiles').update({status:'active'}).eq('id',actors.target.id);
  await state.admin.from('user_roles').delete().in('id',added.data!.map(x=>x.id));
 }
 pass('effective-access target identity, repeated scopes, disabled target and caller scope');
});
