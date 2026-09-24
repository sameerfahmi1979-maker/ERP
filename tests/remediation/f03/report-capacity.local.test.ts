import { expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const state=vi.hoisted(()=>({admin:null as any,client:null as any}));
vi.mock('server-only',()=>({}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>state.admin}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>state.client}));
import { getAuthContext } from '@/lib/rbac/check';
import { getAuthorizedReportEmployees } from '@/lib/rbac/employee-access';
const require=createRequire(import.meta.url),db=require('../f00/local-db.cjs'),api=require('../f00/local-client.cjs');

it('exact 1000-subject ceiling succeeds; 1001 fails explicitly instead of generating a partial report',async()=>{
 db.assertDatabase();const k=api.keys();expect(k.API_URL).toBe('http://127.0.0.1:16421');
 const run='f03cap-'+randomBytes(4).toString('hex');
 const ledger:any={run,target:'algt-f00-local',production_mutations:0,employees:[],cleanup:false};
 const save=()=>fs.writeFileSync(path.resolve('CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F03/REPORT_CAPACITY_RECORDS.json'),JSON.stringify(ledger,null,2));save();
 state.admin=createClient(k.API_URL,k.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 try {
  const role=await state.admin.from('roles').insert({role_code:run,role_name:'F03 synthetic capacity',is_system_role:false}).select('id').single();expect(role.error).toBeNull();ledger.role=role.data.id;save();
  const permission=await state.admin.from('permissions').select('id').eq('permission_code','hr.employees.view').single();expect(permission.error).toBeNull();
  const grant=await state.admin.from('role_permissions').insert({role_id:ledger.role,permission_id:permission.data.id});expect(grant.error).toBeNull();
  const password=randomBytes(24).toString('base64url')+'aA9!',email='f00-'+run+'@example.invalid';
  const user=await state.admin.auth.admin.createUser({email,password,email_confirm:true});expect(user.error).toBeNull();ledger.authId=user.data.user.id;save();
  const profile=await state.admin.from('user_profiles').update({status:'active',must_change_password:false,owner_company_id:900101,branch_id:900201}).eq('auth_user_id',ledger.authId).select('id').single();expect(profile.error).toBeNull();ledger.profileId=profile.data.id;save();
  const assignment=await state.admin.from('user_roles').insert({user_profile_id:ledger.profileId,role_id:ledger.role,owner_company_id:900101,branch_id:900201});expect(assignment.error).toBeNull();
  state.client=createClient(k.API_URL,k.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});expect((await state.client.auth.signInWithPassword({email,password})).error).toBeNull();
  const ctx=await getAuthContext();const initial=await getAuthorizedReportEmployees(ctx);expect(initial.ids.length).toBeLessThan(1000);ledger.initialCount=initial.ids.length;
  const needed=1001-initial.ids.length;
  for(let start=0;start<needed;start+=200){
   const rows=Array.from({length:Math.min(200,needed-start)},(_,i)=>({employee_code:run+'-'+(start+i),full_name_en:'F03 synthetic capacity '+(start+i),gender:'male',date_of_birth:'1990-01-01',mobile_number:'0000000000',owner_company_id:900101,branch_id:900201,joining_date:'2026-01-01',emergency_contact_name:'Synthetic only',emergency_contact_mobile:'0000000000',employee_status:'active'}));
   const created=await state.admin.from('employees').insert(rows).select('id');expect(created.error).toBeNull();ledger.employees.push(...created.data.map((r:any)=>r.id));save();expect(created.data).toHaveLength(rows.length);
  }
  let started=performance.now();await expect(getAuthorizedReportEmployees(ctx)).rejects.toThrow('1,000-employee access-scope limit');ledger.over_limit_ms=Math.round(performance.now()-started);save();
  const last=ledger.employees.at(-1);const removed=await state.admin.from('employees').delete().eq('id',last).like('employee_code',run+'-%');expect(removed.error).toBeNull();ledger.removedAtBoundary=last;save();
  started=performance.now();const complete=await getAuthorizedReportEmployees(ctx);ledger.at_limit_ms=Math.round(performance.now()-started);expect(complete.ids).toHaveLength(1000);expect(new Set(complete.ids).size).toBe(1000);
  const active=await state.client.auth.getSession();const claims=JSON.parse(Buffer.from(active.data.session.access_token.split('.')[1],'base64url').toString('utf8'));
  const quoted=JSON.stringify(claims).replaceAll("'","''");
  ledger.authenticated_page_plan=db.sql(`BEGIN; DO $$ BEGIN PERFORM set_config('request.jwt.claims','${quoted}',true); END $$; SET LOCAL ROLE authenticated; EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT id,owner_company_id,branch_id FROM public.employees WHERE deleted_at IS NULL AND owner_company_id=900101 AND branch_id=900201 ORDER BY id LIMIT 20; ROLLBACK;`,{json:true});
  expect(ledger.authenticated_page_plan[0].Plan['Actual Rows']).toBe(20);ledger.pass=true;save();
 } finally {
  const errors=[];
  for(let i=0;i<ledger.employees.length;i+=200){const r=await state.admin.from('employees').delete().in('id',ledger.employees.slice(i,i+200)).like('employee_code',run+'-%');if(r.error)errors.push(r.error.message);}
  if(ledger.authId){const r=await state.admin.auth.admin.deleteUser(ledger.authId);if(r.error)errors.push(r.error.message);}
  if(ledger.role){await state.admin.from('role_permissions').delete().eq('role_id',ledger.role);const r=await state.admin.from('roles').delete().eq('id',ledger.role);if(r.error)errors.push(r.error.message);}
  ledger.cleanup=errors.length===0;ledger.cleanupErrors=errors;save();expect(errors).toEqual([]);
 }
},60000);
