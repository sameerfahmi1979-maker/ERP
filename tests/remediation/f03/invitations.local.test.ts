import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createClient as sdk, type SupabaseClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const state=vi.hoisted(()=>({admin:null as unknown as SupabaseClient,cookies:new Map<string,string>()}));
vi.mock('server-only',()=>({}));
vi.mock('next/headers',()=>({cookies:async()=>({getAll:()=>[...state.cookies].map(([name,value])=>({name,value})),get:(name:string)=>state.cookies.has(name)?{value:state.cookies.get(name)}:undefined,set:(name:string,value:string)=>state.cookies.set(name,value)})}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>state.admin}));
import { issueAccountInvitation, claimAccountInvitation, hashInvitationToken } from '@/lib/auth/invitations';
import { confirmAuthLink } from '@/lib/auth/confirm-link';
import { performPasswordChange } from '@/lib/auth/password-change';
import { createClient } from '@/lib/supabase/server';
const require=createRequire(import.meta.url);
const db=require('../f00/local-db.cjs');
const {keys}=require('../f00/local-client.cjs');
const evidence=path.resolve('CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F03/BRANDED_INVITATIONS_LOCAL_2026_09_25.json');
let config:{API_URL:string;ANON_KEY:string;SERVICE_ROLE_KEY:string};
const fixtures:Array<{authId:string;profileId:number;email:string;deleted?:boolean}>=[];
const result={at:new Date().toISOString(),target:'algt-f00-local',production_mutations:0,mail_sends:0,fixtures,cases:[] as string[]};
const persist=()=>fs.writeFileSync(evidence,JSON.stringify(result,null,2));
const pass=(name:string)=>{result.cases.push(name);persist();};
beforeAll(()=>{
 db.assertDatabase();config=keys();expect(config.API_URL).toBe('http://127.0.0.1:16421');
 vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL',config.API_URL);vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY',config.ANON_KEY);
 state.admin=sdk(config.API_URL,config.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});persist();
});
afterAll(async()=>{
 const client=await createClient();await client.auth.signOut({scope:'local'});
 for(const fixture of fixtures){const deleted=await state.admin.auth.admin.deleteUser(fixture.authId);fixture.deleted=!deleted.error;}
 state.cookies.clear();vi.unstubAllEnvs();persist();
 expect(fixtures.every(f=>f.deleted)).toBe(true);
});
async function fixture(){
 const email='f00-f03-invite-'+randomBytes(7).toString('hex')+'@example.invalid';
 const created=await state.admin.auth.admin.createUser({email,email_confirm:false});
 if(created.error||!created.data.user)throw new Error('Local synthetic fixture failed');
 const row={authId:created.data.user.id,profileId:0,email};fixtures.push(row);persist();
 const p=await state.admin.from('user_profiles').update({full_name:'F03 invitation synthetic only',status:'active',must_change_password:true,owner_company_id:null,branch_id:null}).eq('auth_user_id',row.authId).select('id').single();
 if(p.error)throw new Error('Local fixture profile failed');row.profileId=p.data.id;persist();
 return row;
}
const issue=(f:{authId:string;profileId:number;email:string})=>issueAccountInvitation({profileId:f.profileId,authUserId:f.authId,email:f.email,siteUrl:'http://127.0.0.1:16403'});
const token=(link:{actionLink:string})=>new URL(link.actionLink).searchParams.get('invitation')!;
it('stores only a token hash and database-enforced 24-hour lifetime, without provider generation at send time',async()=>{
 const f=await fixture();const link=await issue(f);const row=await state.admin.from('erp_account_invitations').select('*').eq('id',link.id).single();
 expect(row.error).toBeNull();expect(Date.parse(row.data.expires_at)-Date.parse(row.data.issued_at)).toBe(86400000);
 expect(row.data.token_hash).toBe(hashInvitationToken(token(link)));expect(JSON.stringify(row.data)).not.toContain(token(link));
 expect((await state.admin.auth.admin.getUserById(f.authId)).data.user?.invited_at).toBeFalsy();pass('hash-only / exactly 24 hours / no provider token at issue');
});
it('wrong signed-in account does not consume invitation',async()=>{
 const f=await fixture();const link=await issue(f);expect(await claimAccountInvitation(token(link),randomUUID())).toEqual({error:'account_mismatch'});
 expect((await state.admin.from('erp_account_invitations').select('consumed_at').eq('id',link.id).single()).data?.consumed_at).toBeNull();pass('wrong-account non-consumption');
});
it('resend replaces the previous token without creating another identity',async()=>{
 const f=await fixture();const old=await issue(f);const fresh=await issue(f);
 expect(await claimAccountInvitation(token(old))).toEqual({error:'invalid_invite_link'});
 expect((await claimAccountInvitation(token(fresh))).authUserId).toBe(f.authId);pass('resend revocation / identity binding');
});
it('tampered/unknown tokens cannot cause identity generation',async()=>{
 expect(await claimAccountInvitation('bad')).toEqual({error:'invalid_invite_link'});
 expect(await claimAccountInvitation(randomBytes(32).toString('base64url'))).toEqual({error:'invalid_invite_link'});pass('malformed / unknown token rejection');
});
it('two simultaneous claims produce exactly one winner',async()=>{
 const f=await fixture();const link=await issue(f);const outcomes=await Promise.all([claimAccountInvitation(token(link)),claimAccountInvitation(token(link))]);
 expect(outcomes.filter(o=>'tokenHash' in o)).toHaveLength(1);expect(outcomes.filter(o=>o.error==='invalid_invite_link')).toHaveLength(1);pass('atomic concurrent claims / replay denied');
});
it('invitation older than provider one-hour expiry still starts a fresh provider exchange before 24 hours',async()=>{
 const f=await fixture();const link=await issue(f);
 db.sql(`UPDATE public.erp_account_invitations SET issued_at=now()-interval '23 hours 59 minutes',expires_at=now()+interval '1 minute' WHERE id='${link.id}';`);
 const claimed=await claimAccountInvitation(token(link));expect(claimed.authUserId).toBe(f.authId);pass('23h59m ERP invitation accepted with just-in-time provider token');
});
it('expiry at the 24-hour boundary denies claim using database time',async()=>{
 const f=await fixture();const link=await issue(f);
 const output=db.sql(`BEGIN; UPDATE public.erp_account_invitations SET issued_at=now()-interval '24 hours',expires_at=now() WHERE id='${link.id}'; SELECT to_json(count(*)) FROM public.f03_claim_invitation('${hashInvitationToken(token(link))}'); COMMIT;`,{json:true});
 expect(output).toBe(0);expect(await claimAccountInvitation(token(link))).toEqual({error:'invalid_invite_link'});pass('exact expiry / after-expiry denied');
});
it('disabled account and changed recipient cannot redeem a pending token',async()=>{
 const f=await fixture();const link=await issue(f);await state.admin.from('user_profiles').update({status:'inactive'}).eq('id',f.profileId);
 expect(await claimAccountInvitation(token(link))).toEqual({error:'invalid_invite_link'});
 await state.admin.from('user_profiles').update({status:'active'}).eq('id',f.profileId);
 await state.admin.auth.admin.updateUserById(f.authId,{email:'changed-'+f.email});
 expect(await claimAccountInvitation(token(link))).toEqual({error:'invalid_invite_link'});pass('disabled / changed-email binding denied');
});
it('public clients cannot read, issue or claim invitation records',async()=>{
 const anon=sdk(config.API_URL,config.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 expect((await anon.from('erp_account_invitations').select('id')).error).not.toBeNull();
 expect((await anon.rpc('f03_claim_invitation',{p_token_hash:'a'.repeat(64)})).error).not.toBeNull();
 const grants=db.sql("SELECT json_build_object('read',has_table_privilege('authenticated','public.erp_account_invitations','SELECT'),'issue',has_function_privilege('authenticated','public.f03_issue_invitation(bigint,uuid,text,text)','EXECUTE'),'claim',has_function_privilege('authenticated','public.f03_claim_invitation(text)','EXECUTE'));",{json:true});
 expect(grants).toEqual({read:false,issue:false,claim:false});pass('anon/authenticated storage and RPC denied');
});
it('real local invitation completes password setup, allows fresh login and retains no-role restrictions',async()=>{
 const f=await fixture();const link=await issue(f);state.cookies.clear();
 expect(await confirmAuthLink({invitation:token(link)})).toBe('/reset-password');
 const password=randomBytes(24).toString('base64url')+'aA9!';
 expect((await performPasswordChange({newPassword:password,operationId:randomUUID()},'recovery')).success).toBe(true);
 const fresh=sdk(config.API_URL,config.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const login=await fresh.auth.signInWithPassword({email:f.email,password});expect(login.error).toBeNull();
 const p=await state.admin.from('user_profiles').select('must_change_password').eq('id',f.profileId).single();expect(p.data?.must_change_password).toBe(false);
 const business=await fresh.from('employees').select('id').eq('id',900301);expect(business.data??[]).toHaveLength(0);
 expect((await state.admin.from('user_roles').select('id').eq('user_profile_id',f.profileId)).data).toHaveLength(0);
 expect(await claimAccountInvitation(token(link))).toEqual({error:'invalid_invite_link'});
 await fresh.auth.signOut({scope:'global'});pass('real provider verification / password setup / fresh login / zero-role deny / consumed link');
});
