import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { createClient as sdk } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const state=vi.hoisted(()=>({client:null as any,admin:null as any,cookies:new Map<string,string>()}));
vi.mock('server-only',()=>({}));
vi.mock('next/headers',()=>({cookies:async()=>({get:(key:string)=>state.cookies.has(key)?{value:state.cookies.get(key)}:undefined,set:(key:string,value:string)=>state.cookies.set(key,value)})}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>state.client}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>state.admin}));
import { performPasswordChange } from '@/lib/auth/password-change';
import { establishPasswordFlow } from '@/lib/auth/password-flow';
import { issueAccountInvitation, claimAccountInvitation } from '@/lib/auth/invitations';
const require=createRequire(import.meta.url),db=require('../f00/local-db.cjs'),authProcess=require('./secure-auth-process.cjs');
const output=path.resolve('CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F03/SECURE_PASSWORD_LOCAL_2026_09_25.json');
const r={at:new Date().toISOString(),target:'algt-f00-local',production_mutations:0,external_emails:0,cases:[] as string[],fixtures:[] as {id:string;email:string;profile:number;deleted:boolean}[],container:'',container_removed:false,cleanup:false};
const save=()=>fs.writeFileSync(output,JSON.stringify(r,null,2));const pass=(name:string)=>{r.cases.push(name);save();};
const strong=()=>randomBytes(24).toString('base64url')+'aA9!';
let service:any,subject:any,password=strong();
function fresh(admin=false){
 const k=service.keys;
 return sdk(k.API_URL,admin?k.SERVICE_ROLE_KEY:k.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(input,init)=>{
  const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
  if(!url.startsWith(k.API_URL+'/'))throw Error('Unexpected test API target');
  return fetch(url.startsWith(k.API_URL+'/auth/v1/')?service.base+url.slice((k.API_URL+'/auth/v1').length):url,init);
 }}});
}
async function fixture(confirmed=true){
 const email='f00-f03-secure-'+randomBytes(5).toString('hex')+'@example.invalid';
 const c=await state.admin.auth.admin.createUser({email,password,email_confirm:confirmed});expect(c.error).toBeNull();
 const entry={id:c.data.user.id,email,profile:0,deleted:false};r.fixtures.push(entry);save();
 const p=await state.admin.from('user_profiles').update({status:'active',must_change_password:!confirmed,full_name:'F03 secure-password synthetic',owner_company_id:null,branch_id:null}).eq('auth_user_id',entry.id).select('id').single();expect(p.error).toBeNull();entry.profile=p.data.id;save();return entry;
}
async function age(client:any,hours:number){
 const claims=await client.auth.getClaims();const id=claims.data.claims.session_id;
 expect(id).toMatch(/^[0-9a-f-]{36}$/);
 db.sql(`UPDATE auth.sessions SET created_at=now()-interval '${hours} hours' WHERE id='${id}' AND user_id='${subject.id}';`);
}
beforeAll(async()=>{
 service=await authProcess.start();r.container=service.name;save();state.admin=fresh(true);subject=await fixture();
 state.client=fresh();expect((await state.client.auth.signInWithPassword({email:subject.email,password})).error).toBeNull();
});
afterAll(async()=>{
 try{
  for(const f of r.fixtures){const gone=await state.admin.auth.admin.deleteUser(f.id);f.deleted=!gone.error;}
  if(r.fixtures.length){const ids=r.fixtures.map(f=>`'${f.id}'`).join(',');const counts=db.sql(`SELECT json_build_object('users',(SELECT count(*) FROM auth.users WHERE id IN (${ids})),'profiles',(SELECT count(*) FROM public.user_profiles WHERE auth_user_id IN (${ids})),'sessions',(SELECT count(*) FROM auth.sessions WHERE user_id IN (${ids})));`,{json:true});r.cleanup=r.fixtures.every(f=>f.deleted)&&Object.values(counts).every(n=>n===0);}
 }finally{if(service){service.stop();r.container_removed=true;}save();}
 expect(r.cleanup&&r.container_removed).toBe(true);
});
it('24-hour-old session cannot update the provider password without fresh verification',async()=>{
 await age(state.client,25);const attempt=await state.client.auth.updateUser({password:strong()});expect(attempt.error?.code).toBe('reauthentication_needed');pass('provider rejects aged session');
});
it('actual ERP action records definite rejection and requests fresh sign-in without clearing restrictions',async()=>{
 const id=randomUUID();const result=await performPasswordChange({newPassword:strong(),operationId:id},'self');
 expect(result).toMatchObject({success:false,requiresFreshSignIn:true,canStartNewAttempt:true});
 const receipt=await state.admin.from('erp_auth_password_operations').select('stage').eq('id',id).single();expect(receipt.data.stage).toBe('failed');
 const p=await state.admin.from('user_profiles').select('password_changed_at').eq('id',subject.profile).single();expect(p.data.password_changed_at).toBeNull();pass('ERP rejected operation / no completion');
});
it('refreshing a token does not turn the same aged session into a recent sign-in',async()=>{
 expect((await state.client.auth.refreshSession()).error).toBeNull();
 const r=await state.client.auth.updateUser({password:strong()});expect(r.error?.code).toBe('reauthentication_needed');pass('token refresh is not fresh verification');
});
it('fresh sign-in permits actual ERP password change and old password stops working',async()=>{
 expect((await state.client.auth.signOut({scope:'local'})).error).toBeNull();
 state.client=fresh();expect((await state.client.auth.signInWithPassword({email:subject.email,password})).error).toBeNull();
 const next=strong();expect((await performPasswordChange({newPassword:next,operationId:randomUUID()},'self')).success).toBe(true);
 expect((await fresh().auth.signInWithPassword({email:subject.email,password})).error).not.toBeNull();password=next;
 expect((await fresh().auth.signInWithPassword({email:subject.email,password})).error).toBeNull();pass('fresh verification / change / old-password rejection / new login');
});
it('a genuine recovery flow works without the old password under secure-password-change policy',async()=>{
 const link=await state.admin.auth.admin.generateLink({type:'recovery',email:subject.email});expect(link.error).toBeNull();
 state.client=fresh();const verified=await state.client.auth.verifyOtp({type:'recovery',token_hash:link.data.properties.hashed_token});expect(verified.error).toBeNull();
 await establishPasswordFlow(verified.data.session!,'recovery');const next=strong();
 expect((await performPasswordChange({newPassword:next,operationId:randomUUID()},'recovery')).success).toBe(true);password=next;
 expect((await fresh().auth.signInWithPassword({email:subject.email,password})).error).toBeNull();pass('recovery without old password');
});
it('ERP-only 24-hour invitation still completes first-time password setup without the old password',async()=>{
 const f=await fixture(false);const issued=await issueAccountInvitation({profileId:f.profile,authUserId:f.id,email:f.email,siteUrl:'http://127.0.0.1:16403'});
 const token=new URL(issued.actionLink).searchParams.get('invitation')!;const claimed=await claimAccountInvitation(token);expect(claimed).not.toBeNull();
 const link=await state.admin.auth.admin.generateLink({type:'invite',email:f.email});expect(link.error).toBeNull();
 state.client=fresh();const verified=await state.client.auth.verifyOtp({type:'invite',token_hash:link.data.properties.hashed_token});expect(verified.error).toBeNull();
 await establishPasswordFlow(verified.data.session!,'invite');const next=strong();
 expect((await performPasswordChange({newPassword:next,operationId:randomUUID()},'recovery')).success).toBe(true);
 expect((await fresh().auth.signInWithPassword({email:f.email,password:next})).error).toBeNull();
 const roles=await state.admin.from('user_roles').select('id').eq('user_profile_id',f.profile).eq('is_active',true);expect(roles.data).toHaveLength(0);pass('ERP invitation / first password / fresh login / no role');
});
