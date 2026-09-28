import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({existing:null as any,result:null as any,exchange:vi.fn(),verify:vi.fn(),flow:vi.fn(),revoke:vi.fn(),set:vi.fn(),pending:null as any}));
vi.mock('server-only',()=>({}));
vi.mock('next/headers',()=>({cookies:async()=>({getAll:()=>[{name:'existing-cookie',value:'synthetic'}],set:m.set})}));
vi.mock('@supabase/ssr',()=>({createServerClient:(_u:any,_k:any,options:any)=>{
 m.pending=options.cookies.setAll;
 return {auth:{getUser:async()=>m.existing,exchangeCodeForSession:m.exchange,verifyOtp:m.verify}};
}}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({auth:{admin:{signOut:m.revoke}}})}));
vi.mock('@/lib/auth/password-flow',()=>({establishPasswordFlow:m.flow}));
vi.mock('@/lib/auth/invitations',()=>({claimAccountInvitation:vi.fn(),invitationStillUsable:vi.fn()}));
import { claimAccountInvitation, invitationStillUsable } from '@/lib/auth/invitations';
import { confirmAuthLink } from '@/lib/auth/confirm-link';
beforeEach(()=>{
 vi.clearAllMocks();m.existing={data:{user:null},error:null};m.result={data:{user:{id:'test-b'},session:{access_token:'synthetic-not-a-token'}},error:null};
 const exchange=async()=>{m.pending([{name:'new-cookie',value:'synthetic-new',options:{httpOnly:true}}]);return m.result;};
 m.exchange.mockImplementation(exchange);m.verify.mockImplementation(exchange);m.flow.mockResolvedValue(undefined);m.revoke.mockResolvedValue({error:null});
});
it.each(['recovery'] as const)('verified %s establishes password proof before committing cookies',async type=>{
 expect(await confirmAuthLink({token_hash:'x'.repeat(64),type})).toBe('/reset-password');expect(m.flow).toHaveBeenCalledWith(m.result.data.session,type);expect(m.set).toHaveBeenCalledOnce();
 expect(m.flow.mock.invocationCallOrder[0]).toBeLessThan(m.set.mock.invocationCallOrder[0]);
});
it('a signed-in same account can complete recovery',async()=>{
 m.existing.data.user={id:'test-b'};expect(await confirmAuthLink({token_hash:'x'.repeat(64),type:'recovery'})).toBe('/reset-password');expect(m.set).toHaveBeenCalledOnce();
});
it('wrong-account link preserves current cookies and revokes only the newly exchanged session',async()=>{
 m.existing.data.user={id:'test-a'};expect(await confirmAuthLink({token_hash:'x'.repeat(64),type:'recovery'})).toBe('/auth/link-error?reason=account_mismatch&flow=recovery');expect(m.set).not.toHaveBeenCalled();expect(m.flow).not.toHaveBeenCalled();expect(m.revoke).toHaveBeenCalledWith('synthetic-not-a-token','local');
});
it('expired or reused provider links cannot commit cookies',async()=>{
 m.result.error={message:'expired'};expect(await confirmAuthLink({token_hash:'x'.repeat(64),type:'recovery'})).toBe('/auth/link-error?reason=invalid_invite_link&flow=recovery');expect(m.set).not.toHaveBeenCalled();expect(m.flow).not.toHaveBeenCalled();
});
it('proof-store failure revokes the exchanged session without committing it',async()=>{
 m.flow.mockRejectedValue(new Error('synthetic persistence failure'));expect(await confirmAuthLink({token_hash:'x'.repeat(64),type:'recovery'})).toBe('/auth/link-error?reason=auth_unavailable&flow=recovery');expect(m.revoke).toHaveBeenCalledOnce();expect(m.set).not.toHaveBeenCalled();
});
it('Auth outage stops before consuming a valid link',async()=>{
 m.existing.error={status:503};expect(await confirmAuthLink({code:'synthetic'})).toBe('/auth/link-error?reason=auth_unavailable&flow=recovery');expect(m.exchange).not.toHaveBeenCalled();expect(m.set).not.toHaveBeenCalled();
});
it('ordinary PKCE never treats an attacker destination as a recovery proof or external redirect',async()=>{
 expect(await confirmAuthLink({code:'synthetic',next:'https://evil.invalid'})).toBe('/start');expect(m.flow).not.toHaveBeenCalled();
});
it('SDK-confirmed PKCE recovery establishes the recovery flow',async()=>{
 m.result.data.redirectType='recovery';expect(await confirmAuthLink({code:'synthetic',next:'https://evil.invalid'})).toBe('/reset-password');expect(m.flow).toHaveBeenCalledWith(m.result.data.session,'recovery');
});
it('ERP invitation exchanges a just-in-time provider proof only after the one-time claim',async()=>{
 vi.mocked(claimAccountInvitation).mockResolvedValue({tokenHash:'fresh-synthetic',authUserId:'test-b',id:'test-invitation'});
 vi.mocked(invitationStillUsable).mockResolvedValue(true);
 expect(await confirmAuthLink({invitation:'a'.repeat(43)})).toBe('/reset-password');
 expect(m.verify).toHaveBeenCalledWith({token_hash:'fresh-synthetic',type:'invite'});expect(m.set).toHaveBeenCalledOnce();expect(m.flow).toHaveBeenCalledWith(m.result.data.session,'invite');
});
it('legacy provider-invite proof cannot bypass the ERP invitation expiry/revocation ledger',async()=>{
 expect(await confirmAuthLink({token_hash:'x'.repeat(64),type:'invite'})).toContain('reason=invalid_invite_link');
 expect(m.verify).not.toHaveBeenCalled();expect(m.set).not.toHaveBeenCalled();
});
it('failed ERP claim never touches the provider verification or cookie store',async()=>{
 vi.mocked(claimAccountInvitation).mockResolvedValue({error:'account_mismatch'});
 expect(await confirmAuthLink({invitation:'a'.repeat(43)})).toContain('reason=account_mismatch');
 expect(m.verify).not.toHaveBeenCalled();expect(m.set).not.toHaveBeenCalled();
});
it('revocation during exchange revokes the new session rather than publishing it',async()=>{
 vi.mocked(claimAccountInvitation).mockResolvedValue({tokenHash:'fresh-synthetic',authUserId:'test-b',id:'test-invitation'});
 vi.mocked(invitationStillUsable).mockResolvedValue(false);
 expect(await confirmAuthLink({invitation:'a'.repeat(43)})).toContain('reason=invalid_invite_link');
 expect(m.revoke).toHaveBeenCalledOnce();expect(m.set).not.toHaveBeenCalled();expect(m.flow).not.toHaveBeenCalled();
});
