import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { createClient as sdk } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const state = vi.hoisted(() => ({ client: null as any, admin: null as any, cookies: new Map<string,string>() }));
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (key: string) => state.cookies.has(key) ? { value: state.cookies.get(key) } : undefined, set: (key: string,value: string) => state.cookies.set(key,value) }), headers: async () => new Headers() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => state.client }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => state.admin }));
import { performPasswordChange } from '@/lib/auth/password-change';
import { getAuthContext, hasPermission, assertAccountActive } from '@/lib/rbac/check';
import { establishPasswordFlow } from '@/lib/auth/password-flow';
import { allowSecurityRequest } from '@/lib/auth/security-email';
const require = createRequire(import.meta.url);
const { keys } = require('../f00/local-client.cjs');
const db = require('../f00/local-db.cjs');
const evidence = path.resolve('CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F03');
let config: { API_URL: string; ANON_KEY: string; SERVICE_ROLE_KEY: string };
let userId: string, profileId: number;
let password = randomBytes(24).toString('base64url') + 'aA9!';
const email = 'f00-f03-auth-' + randomBytes(4).toString('hex') + '@example.invalid';
const fresh = () => sdk(config.API_URL, config.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const record: Record<string,unknown> = { at: new Date().toISOString(), target: 'algt-f00-local', real_emails: 0, production_mutations: 0, cases: [] };
const pass = (name: string) => (record.cases as string[]).push(name);
beforeAll(async () => {
  db.assertDatabase(); config = keys();
  expect(config.API_URL).toBe('http://127.0.0.1:16421');
  state.admin = sdk(config.API_URL, config.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const created = await state.admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error('Local fixture creation failed');
  userId = created.data.user.id;
  const p = await state.admin.from('user_profiles').update({ status: 'active', must_change_password: true, owner_company_id: 900101, branch_id: 900201, full_name: 'F03 synthetic auth only' }).eq('auth_user_id',userId).select('id').single();
  if (p.error || !p.data) throw new Error('Local fixture profile failed');
  profileId = p.data.id;
  fs.writeFileSync(path.join(evidence,'AUTH_TEST_RECORD.json'), JSON.stringify({ target: 'algt-f00-local', auth_user_id: userId, profile_id: profileId, email, owned_by: 'F03', cleanup: 'Delete after this isolated suite; no production record' },null,2));
  state.client = fresh();
  const login = await state.client.auth.signInWithPassword({ email,password });
  if (login.error) throw new Error('Local synthetic sign-in failed');
});
afterAll(async () => {
  if (userId) {
    const deletion = await state.admin.auth.admin.deleteUser(userId);
    record.fixture_deleted = !deletion.error;
  }
  fs.writeFileSync(path.join(evidence,'AUTH_LOCAL_RESULTS.json'),JSON.stringify(record,null,2));
});
it('denies a client-only completion assertion without changing forced state', async () => {
  expect((await performPasswordChange(undefined,'required')).success).toBe(false);
  const p = await state.admin.from('user_profiles').select('must_change_password').eq('id',profileId).single();
  expect(p.data.must_change_password).toBe(true); pass('completion assertion denied');
});
it('keeps the forced-change principal identifiable but denies business capabilities and RLS', async () => {
  const ctx = await getAuthContext(); expect(ctx.profile?.id).toBe(profileId); expect(ctx.isAccountActive).toBe(true);
  expect(hasPermission(ctx,'erp.admin')).toBe(false); expect(() => assertAccountActive(ctx)).toThrow('Password change required');
  const rows = await state.client.from('employees').select('id').eq('id',900301);
  expect(rows.error).toBeNull(); expect(rows.data.length).toBe(0); pass('forced principal / RLS denied');
});
it('changes Auth password before atomic lifecycle completion; old password fails and duplicate is idempotent', async () => {
  const next = randomBytes(24).toString('base64url') + 'bB8!';
  const operationId = randomUUID();
  const result = await performPasswordChange({ newPassword: next, operationId },'required');
  expect(result.success).toBe(true);
  const old = await fresh().auth.signInWithPassword({ email,password }); expect(!!old.error).toBe(true);
  const duplicate = await performPasswordChange({ newPassword: next, operationId },'required'); expect(duplicate.success).toBe(true);
  password = next;
  const logged = await fresh().auth.signInWithPassword({ email,password }); expect(logged.error).toBeNull();
  const p = await state.admin.from('user_profiles').select('must_change_password,password_changed_at').eq('id',profileId).single();
  expect(p.data.must_change_password).toBe(false); expect(!!p.data.password_changed_at).toBe(true); pass('provider change / lifecycle / old rejection / idempotency');
});
it('ordinary session cannot invoke recovery completion', async () => {
  expect((await performPasswordChange({ newPassword: password, operationId: randomUUID() },'recovery')).success).toBe(false); pass('unproven recovery denied');
});
it('a definite same-password rejection allows a new attempt without claiming a change',async()=>{
 const operationId=randomUUID();const result=await performPasswordChange({newPassword:password,operationId},'self');
 expect(result.success).toBe(false);expect(result.canStartNewAttempt).toBe(true);expect(result.passwordChanged).not.toBe(true);
 const receipt=await state.admin.from('erp_auth_password_operations').select('stage').eq('id',operationId).single();expect(receipt.error).toBeNull();expect(receipt.data.stage).toBe('failed');
 expect((await performPasswordChange({newPassword:password,operationId},'self')).canStartNewAttempt).toBe(true);pass('known rejection / explicit safe retry');
});
it('disabling a live account invalidates its principal immediately and reactivation restores the legitimate session',async()=>{
 try {
  const disabled=await state.admin.from('user_profiles').update({status:'inactive'}).eq('id',profileId);expect(disabled.error).toBeNull();
  const ctx=await getAuthContext();expect(()=>assertAccountActive(ctx)).toThrow();
  const r=await performPasswordChange({newPassword:password,operationId:randomUUID()},'self');expect(r.success).toBe(false);expect(r.error).toContain('not active');
 } finally {const active=await state.admin.from('user_profiles').update({status:'active'}).eq('id',profileId);expect(active.error).toBeNull();}
 const ctx=await getAuthContext();expect(()=>assertAccountActive(ctx)).not.toThrow();pass('live disable/reactivate authority');
});
it('genuine one-time recovery grant changes the password; token reuse fails', async () => {
  const link = await state.admin.auth.admin.generateLink({ type: 'recovery', email });
  expect(link.error).toBeNull();
  const client = fresh();
  const verified = await client.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: 'recovery' });
  expect(verified.error).toBeNull();
  state.client = client;
  await establishPasswordFlow(verified.data.session!, 'recovery');
  const next = randomBytes(24).toString('base64url') + 'cC7!';
  const operationId=randomUUID();
  expect((await performPasswordChange({ newPassword: next, operationId },'recovery')).success).toBe(true);
  expect((await performPasswordChange({ newPassword: next, operationId },'recovery')).success).toBe(true);
  password = next;
  const reused = await fresh().auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: 'recovery' });
  expect(!!reused.error).toBe(true); pass('genuine recovery / token consumed');
});
it('revoked session loses app authority before JWT expiry', async () => {
  const session = await state.client.auth.getSession();
  const token = session.data.session.access_token;
  const revoked = await state.admin.auth.admin.signOut(token,'local'); expect(revoked.error).toBeNull();
  const valid = await state.client.rpc('f03_current_session_valid'); expect(valid.data).toBe(false);
  expect((await getAuthContext()).profile).toBeNull(); pass('immediate session revocation');
});
it('durable recovery quota is shared and has a bounded target budget', async () => {
  const results = [];
  for(let i=0;i<4;i++) results.push(await allowSecurityRequest('recovery',email));
  expect(results).toEqual([true,true,true,false]); pass('durable target quota');
});
it('create-first invitation completes real provider token verification and forced password setup',async()=>{
 const address='f00-invite-'+randomBytes(5).toString('hex')+'@example.invalid';
 const created=await state.admin.auth.admin.createUser({email:address,password:randomBytes(24).toString('base64url')+'aA9!',email_confirm:false});expect(created.error).toBeNull();
 const id=created.data.user.id;
 record.invitation_fixture={auth_user_id:id,email:address,deleted:false};
 fs.writeFileSync(path.join(evidence,'AUTH_LOCAL_RESULTS.json'),JSON.stringify(record,null,2));
 try {
  const forced=await state.admin.from('user_profiles').update({status:'active',must_change_password:true,owner_company_id:900101,branch_id:900201}).eq('auth_user_id',id);expect(forced.error).toBeNull();
  const link=await state.admin.auth.admin.generateLink({type:'invite',email:address});expect(link.error).toBeNull();expect(link.data.user.id).toBe(id);
  state.client=fresh();const verify=await state.client.auth.verifyOtp({token_hash:link.data.properties.hashed_token,type:'invite'});expect(verify.error).toBeNull();
  await establishPasswordFlow(verify.data.session,'invite');
  const secret=randomBytes(24).toString('base64url')+'dD6!',operationId=randomUUID();
  expect((await performPasswordChange({newPassword:secret,operationId},'recovery')).success).toBe(true);
  expect((await fresh().auth.signInWithPassword({email:address,password:secret})).error).toBeNull();
  const reuse=await fresh().auth.verifyOtp({token_hash:link.data.properties.hashed_token,type:'invite'});expect(reuse.error).not.toBeNull();
  pass('real create-first invite / setup / login / replay denial');
 } finally {
  const removed=await state.admin.auth.admin.deleteUser(id);expect(removed.error).toBeNull();record.invitation_fixture={auth_user_id:id,email:address,deleted:true};
 }
});
