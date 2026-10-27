// Real security actions with controlled Auth/Data API/mail/cache ports. No browser or network.
import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({
 auth:vi.fn(),active:vi.fn(),global:vi.fn(),scope:vi.fn(),isGlobal:vi.fn(),from:vi.fn(),rpc:vi.fn(),authority:vi.fn(),getUser:vi.fn(),generate:vi.fn(),send:vi.fn(),invite:vi.fn(),limit:vi.fn(),audit:vi.fn(),cache:vi.fn(),warn:vi.fn(),
 target:{id:41,auth_user_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',owner_company_id:1,branch_id:2,status:'active',full_name:'Synthetic H07'},
 user:{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',email:'h07@example.invalid',email_confirmed_at:'2026-01-01' as string|null},
 updates:[] as Record<string,unknown>[],targetError:null as unknown,updateError:null as unknown,throwUpdate:false,
}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({rpc:m.authority})}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:m.from,rpc:m.rpc,auth:{admin:{getUserById:m.getUser,generateLink:m.generate}}})}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:m.auth,assertAccountActive:m.active,hasGlobalPermission:m.global,hasPermissionInScope:m.scope,isGlobalAdmin:m.isGlobal}));
vi.mock('@/lib/auth/invitations',()=>({issueAccountInvitation:m.invite}));
vi.mock('@/lib/auth/security-email',()=>({allowSecurityRequest:m.limit,sendSecurityTemplate:m.send}));
vi.mock('@/lib/auth/password-change',()=>({performPasswordChange:vi.fn()}));
vi.mock('@/server/actions/audit',()=>({logAudit:m.audit}));
vi.mock('@/lib/logger',()=>({logger:{warn:m.warn}}));
vi.mock('next/cache',()=>({revalidatePath:m.cache}));
import {adminGenerateAndSendInviteEmail,adminSendPasswordResetEmail,requestPasswordReset} from '@/server/actions/users/account-security';
interface Chain {select(...args:unknown[]):Chain;eq(...args:unknown[]):Chain;is(...args:unknown[]):Chain;update(values:Record<string,unknown>):Chain;maybeSingle():Promise<unknown>;then(resolve:(value:unknown)=>unknown):Promise<unknown>}
beforeEach(()=>{
 vi.resetAllMocks();m.target.status='active';m.user.email_confirmed_at='2026-01-01';m.updates=[];m.targetError=null;m.updateError=null;m.throwUpdate=false;
 m.auth.mockResolvedValue({profile:{id:71}});m.active.mockReturnValue(undefined);m.global.mockReturnValue(true);m.scope.mockReturnValue(true);m.isGlobal.mockReturnValue(true);
 m.authority.mockResolvedValue({data:true,error:null});m.getUser.mockImplementation(async()=>({data:{user:{...m.user}},error:null}));
 m.rpc.mockImplementation(async()=>({data:[{profile_id:41,auth_user_id:m.user.id,display_name:'Synthetic H07'}],error:null}));
 m.generate.mockImplementation(async()=>({data:{user:{...m.user},properties:{hashed_token:'a'.repeat(56)}},error:null}));
 m.invite.mockResolvedValue({actionLink:'https://erp.algt.net/auth/invite?token=synthetic-only',expiresAt:'2026-10-28T12:00:00Z'});
 m.limit.mockResolvedValue(true);m.send.mockResolvedValue({accepted:true,recorded:true,attemptId:'synthetic-attempt'});m.audit.mockResolvedValue({success:true});
 m.from.mockImplementation((table:string)=>{if(!['user_profiles','user_roles'].includes(table))throw Error('Unexpected table');const q:Chain={select:()=>q,eq:()=>q,is:()=>q,update:values=>{m.updates.push(values);if(m.throwUpdate)throw Error('SYNTHETIC_PRIVATE_UPDATE');return q;},maybeSingle:async()=>({data:{...m.target},error:m.targetError}),then:async resolve=>resolve({data:table==='user_roles'?[]:[{id:41}],error:m.updateError})};return q;});
});
it('invalid recovery input returns generic success without obtaining a link',async()=>{expect(await requestPasswordReset('bad')).toEqual({success:true});expect(m.rpc).not.toHaveBeenCalled();});
it('rate-limited recovery never allocates a link or email',async()=>{m.limit.mockResolvedValue(false);expect(await requestPasswordReset(m.user.email)).toEqual({success:true});expect(m.rpc).not.toHaveBeenCalled();expect(m.send).not.toHaveBeenCalled();});
it.each([{data:null,error:null},{data:null,error:{code:'SYNTHETIC'}}])('absent/unavailable recovery target retains anti-enumeration %j',async value=>{m.rpc.mockResolvedValue(value);expect(await requestPasswordReset(m.user.email)).toEqual({success:true});expect(m.generate).not.toHaveBeenCalled();});
it.each([{data:{properties:{hashed_token:'a'.repeat(56)},user:{id:'other'}},error:null},{data:null,error:{code:'SYNTHETIC'}},{data:{user:{id:m.user.id},properties:{}},error:null}])('unverified recovery link cannot send or stamp %j',async value=>{m.generate.mockResolvedValue(value);expect(await requestPasswordReset(m.user.email)).toEqual({success:true});expect(m.send).not.toHaveBeenCalled();expect(m.updates).toEqual([]);});
it.each([false,true])('only provider acceptance records reset-sent time: %s',async accepted=>{m.send.mockResolvedValue({accepted,recorded:true,attemptId:'synthetic'});expect(await requestPasswordReset(m.user.email)).toEqual({success:true});expect(m.updates).toHaveLength(accepted?1:0);if(accepted)expect(Object.keys(m.updates[0])).toEqual(['password_reset_sent_at']);});
it('recovery transport interruption stays generic without claiming a timestamp',async()=>{m.send.mockRejectedValue(Error('SYNTHETIC_PRIVATE_TRANSPORT'));expect(await requestPasswordReset(m.user.email)).toEqual({success:true});expect(m.updates).toEqual([]);});
it('inactive requester cannot administer a target',async()=>{m.active.mockImplementation(()=>{throw Error('inactive');});expect((await adminSendPasswordResetEmail(41)).success).toBe(false);expect(m.from).not.toHaveBeenCalled();});
it('current identity scope is checked before provider capability',async()=>{m.authority.mockResolvedValue({data:false,error:null});expect((await adminSendPasswordResetEmail(41)).success).toBe(false);expect(m.generate).not.toHaveBeenCalled();expect(m.send).not.toHaveBeenCalled();});
it('company/branch scope denial cannot obtain a provider link',async()=>{m.scope.mockReturnValue(false);expect((await adminSendPasswordResetEmail(41)).success).toBe(false);expect(m.authority).not.toHaveBeenCalled();expect(m.getUser).not.toHaveBeenCalled();});
it('inactive target cannot receive setup email',async()=>{m.target.status='inactive';expect((await adminSendPasswordResetEmail(41)).success).toBe(false);expect(m.generate).not.toHaveBeenCalled();});
it('an unconfirmed account gets the ERP-only invitation mechanism',async()=>{m.user.email_confirmed_at=null;expect(await adminGenerateAndSendInviteEmail(41)).toEqual({success:true});expect(m.invite).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({profileId:41,authUserId:m.user.id,email:m.user.email}));expect(m.generate).not.toHaveBeenCalled();expect(m.send).toHaveBeenCalledWith(expect.objectContaining({kind:'invite'}));});
it('a confirmed account gets recovery without recreating an invitation',async()=>{expect(await adminGenerateAndSendInviteEmail(41)).toEqual({success:true});expect(m.invite).not.toHaveBeenCalled();expect(m.generate).toHaveBeenCalledExactlyOnceWith({type:'recovery',email:m.user.email});});
it('invitation interruption cannot fall back to recovery or mutate restrictions',async()=>{m.user.email_confirmed_at=null;m.invite.mockRejectedValue(Error('SYNTHETIC_PRIVATE_INVITE'));expect((await adminGenerateAndSendInviteEmail(41)).success).toBe(false);expect(m.generate).not.toHaveBeenCalled();expect(m.send).not.toHaveBeenCalled();expect(m.updates).toEqual([]);});
it('provider rejection does not force password changes or timestamp delivery',async()=>{m.send.mockResolvedValue({accepted:false,recorded:true,attemptId:'synthetic'});expect((await adminSendPasswordResetEmail(41)).success).toBe(false);expect(m.updates).toEqual([]);});
it.each(['update','audit','cache'] as const)('accepted setup email remains accepted after a thrown %s postcommit step',async step=>{if(step==='update')m.throwUpdate=true;if(step==='audit')m.audit.mockRejectedValue(Error('SYNTHETIC_PRIVATE_AUDIT'));if(step==='cache')m.cache.mockImplementation(()=>{throw Error('SYNTHETIC_PRIVATE_CACHE');});const r=await adminSendPasswordResetEmail(41);expect(r.success).toBe(true);expect(r.error).toMatch(/Provider accepted.*review.*Do not resend/i);expect(m.send).toHaveBeenCalledTimes(1);expect(m.generate).toHaveBeenCalledTimes(1);expect(JSON.stringify(r)).not.toContain('SYNTHETIC_PRIVATE');});
it.each(['receipt','state','audit'] as const)('accepted setup email reports an unconfirmed %s without a resend',async step=>{if(step==='receipt')m.send.mockResolvedValue({accepted:true,recorded:false,attemptId:'synthetic'});if(step==='state')m.updateError={code:'SYNTHETIC'};if(step==='audit')m.audit.mockResolvedValue({success:false});const r=await adminSendPasswordResetEmail(41);expect(r).toMatchObject({success:true});expect(r.error).toMatch(/Do not resend/i);expect(m.send).toHaveBeenCalledTimes(1);});
