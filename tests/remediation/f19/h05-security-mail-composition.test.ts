// Real account action -> quota/journal -> branded mail -> controlled provider.
// Auth/Data API/provider boundaries are offline; no browser or actual email.
import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({from:vi.fn(),rpc:vi.fn(),send:vi.fn(),warn:vi.fn(),inserts:[] as Record<string,unknown>[],updates:[] as Record<string,unknown>[],profileUpdates:[] as Record<string,unknown>[],journal:'exact' as 'exact'|'missing'|'throw'|'initial-failure'}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:m.from,rpc:m.rpc,auth:{admin:{getUserById:async()=>({data:{user:{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',email:'h05@example.invalid',email_confirmed_at:'2026-01-01'}},error:null}),generateLink:async()=>({data:{properties:{hashed_token:'a'.repeat(56)},user:{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}},error:null})}}})}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({rpc:async()=>({data:true,error:null})})}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:async()=>({profile:{id:71}}),assertAccountActive:()=>{},hasGlobalPermission:()=>true,hasPermissionInScope:()=>true,isGlobalAdmin:()=>true}));
vi.mock('@/lib/email/providers/factory',()=>({getDefaultEmailProviderSystem:async()=>({sendEmail:m.send})}));
vi.mock('@/lib/branding/load-runtime-app-branding',()=>({loadRuntimeAppBranding:async()=>({appName:'ALGT ERP',supportEmail:'support@example.invalid',assets:{app_logo:{publicUrl:'/api/branding/public/app_logo?v=1'}}})}));
vi.mock('@/lib/logger',()=>({logger:{warn:m.warn}}));
vi.mock('@/server/actions/audit',()=>({logAudit:async()=>({success:true})}));
vi.mock('next/cache',()=>({revalidatePath:()=>{}}));
vi.mock('next/headers',()=>({headers:async()=>new Headers()}));
import {adminSendPasswordResetEmail} from '@/server/actions/users/account-security';
interface Chain {select(...args:unknown[]):Chain;eq(...args:unknown[]):Chain;maybeSingle():Promise<unknown>;then(resolve:(value:unknown)=>unknown):Promise<unknown>}
beforeEach(()=>{
 vi.clearAllMocks();m.journal='exact';m.inserts=[];m.updates=[];m.profileUpdates=[];m.rpc.mockResolvedValue({data:true,error:null});m.send.mockResolvedValue({ok:true,status:'sent'});
 m.from.mockImplementation((table:string)=>{
  if(table==='erp_security_email_attempts')return {
   insert:async(row:Record<string,unknown>)=>{if(m.journal==='initial-failure')throw Error('SYNTHETIC_PRIVATE_INSERT');m.inserts.push(row);return {error:null};},
   update:(row:Record<string,unknown>)=>{m.updates.push(row);return {eq:()=>({select:()=>({maybeSingle:async()=>{if(m.journal==='throw')throw Error('SYNTHETIC_PRIVATE_RECEIPT');return {data:m.journal==='missing'?null:{id:m.inserts[0]?.id},error:null};}})})};},
  };
  if(table!=='user_profiles')throw Error('Unexpected table');
  const q:Chain={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{id:41,auth_user_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',owner_company_id:1,branch_id:null,status:'active',full_name:'Synthetic H05'},error:null}),then:async resolve=>resolve({data:[{id:41}],error:null})};
  return {...q,update:(row:Record<string,unknown>)=>{m.profileUpdates.push(row);return q;}};
 });
});
it.each(['throw','missing'] as const)('real transport acceptance survives %s journal confirmation through the real action',async mode=>{
 m.journal=mode;const r=await adminSendPasswordResetEmail(41);expect(r.success).toBe(true);expect(r.error).toMatch(/Provider accepted.*Do not resend/i);expect(m.send).toHaveBeenCalledTimes(1);expect(m.inserts).toHaveLength(1);expect(m.updates).toHaveLength(1);expect(m.profileUpdates).toHaveLength(1);
 expect(JSON.stringify([m.inserts,m.updates,m.warn.mock.calls,r])).not.toContain('token_hash');expect(JSON.stringify([m.inserts,m.updates,m.warn.mock.calls,r])).not.toContain('a'.repeat(56));expect(JSON.stringify(r)).not.toContain('SYNTHETIC_PRIVATE');
});
it('an initial journal interruption prevents mail dispatch through the real action',async()=>{m.journal='initial-failure';expect((await adminSendPasswordResetEmail(41)).success).toBe(false);expect(m.send).not.toHaveBeenCalled();expect(m.profileUpdates).toEqual([]);});
it('unknown provider outcome cannot stamp delivery even when receipt confirmation also fails',async()=>{m.journal='throw';m.send.mockResolvedValue({ok:false,status:'failed'});expect((await adminSendPasswordResetEmail(41)).success).toBe(false);expect(m.send).toHaveBeenCalledTimes(1);expect(m.profileUpdates).toEqual([]);expect(m.updates[0]).toMatchObject({state:'unknown'});});
it('confirmed provider and exact journal return one successful action without a warning',async()=>{expect(await adminSendPasswordResetEmail(41)).toEqual({success:true});expect(m.send).toHaveBeenCalledTimes(1);expect(m.inserts).toHaveLength(1);expect(m.updates[0]).toMatchObject({state:'provider_accepted'});});
