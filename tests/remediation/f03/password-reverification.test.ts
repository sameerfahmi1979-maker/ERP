import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({updateUser:vi.fn(),insert:vi.fn(),journal:vi.fn(),complete:vi.fn(),clear:vi.fn(),warn:vi.fn(),receiptError:null as unknown}));
vi.mock('server-only',()=>({}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{
 getUser:async()=>({data:{user:{id:'actor'}},error:null}),
 getClaims:async()=>({data:{claims:{session_id:'session'}},error:null}),updateUser:m.updateUser,
},rpc:async()=>({data:true,error:null})})}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({
 from:(table:string)=>{
  const q={eq:()=>q,maybeSingle:async()=>({data:table==='user_profiles'?{id:1,status:'active',must_change_password:false,last_password_security_action_at:null}:null,error:null})};
  return {select:()=>q,insert:m.insert,update:(input:unknown)=>{m.journal(input);return {eq:async()=>({error:m.receiptError})};}};
 },rpc:m.complete,
})}));
vi.mock('@/lib/auth/password-flow',()=>({getPasswordFlow:async()=> 'synthetic-proof',clearPasswordFlow:m.clear}));
vi.mock('@/lib/logger',()=>({logger:{warn:m.warn}}));
import { performPasswordChange } from '@/lib/auth/password-change';
const input={newPassword:'SyntheticTestOnly82!',operationId:'5e608d3d-49aa-4882-a5b3-f9f58ea6c086'};
beforeEach(()=>{vi.clearAllMocks();m.receiptError=null;m.insert.mockResolvedValue({error:null});});

it.each(['self','required','recovery'] as const)('provider freshness rejection has a safe sign-in next step for %s',async mode=>{
 m.updateUser.mockResolvedValue({data:{user:null},error:{status:400,code:'reauthentication_needed'}});
 const result=await performPasswordChange(input,mode);
 expect(result).toMatchObject({success:false,requiresFreshSignIn:true,canStartNewAttempt:true});
 expect(result.passwordChanged).not.toBe(true);expect(m.journal).toHaveBeenCalledWith({stage:'failed'});
 expect(m.complete).not.toHaveBeenCalled();expect(m.clear).not.toHaveBeenCalled();
});
it('failed rejection journaling requires review instead of advertising a safe retry',async()=>{
 m.receiptError={code:'synthetic_write_failure'};
 m.updateUser.mockResolvedValue({data:{user:null},error:{status:400,code:'reauthentication_needed'}});
 expect(await performPasswordChange(input,'self')).toMatchObject({success:false,requiresFreshSignIn:false,canStartNewAttempt:false});
 expect(m.complete).not.toHaveBeenCalled();
});
it('ordinary validation failure does not falsely demand a new login',async()=>{
 m.updateUser.mockResolvedValue({data:{user:null},error:{status:422,code:'same_password'}});
 const r=await performPasswordChange(input,'self');expect(r.canStartNewAttempt).toBe(true);expect(r.requiresFreshSignIn).not.toBe(true);
});
it('a provider timeout does not classify an uncertain password change as rejected',async()=>{
 m.updateUser.mockRejectedValue(new Error('synthetic interrupted response'));
 const r=await performPasswordChange(input,'self');expect(r.requiresFreshSignIn).not.toBe(true);expect(r.canStartNewAttempt).not.toBe(true);
 expect(m.journal).toHaveBeenCalledWith({stage:'needs_reconciliation'});
});

it.each([
 [{status:422,code:'same_password'},'different from your current password','same_password',false],
 [{status:422,code:'weak_password',reasons:['pwned']},'known data breaches','leaked_password',false],
 [{status:422,code:'weak_password',reasons:['length','characters']},'at least 10 characters','weak_password',false],
 [{status:422,code:'weak_password',reasons:['unknown-provider-value']},'Choose a stronger password','weak_password',false],
 [{status:401,code:'session_expired'},'session is no longer valid','session_expired',true],
 [{status:403,code:'session_not_found'},'session is no longer valid','session_expired',true],
 [{status:400,code:'reauthentication_not_valid'},'sign in again','reauthentication_required',true],
 [{status:429,code:'over_request_rate_limit'},'Wait a few minutes','rate_limited',false],
 [{status:429,code:'unknown'},'Wait a few minutes','rate_limited',false],
 [{status:400,code:'untrusted-provider-code'},'Contact your administrator','provider_rejected',false],
] as const)('maps provider rejection %j without disclosing provider data',async(error,message,category,requiresFreshSignIn)=>{
 m.updateUser.mockResolvedValue({data:{user:null},error:{...error,message:'SECRET_PROVIDER_PAYLOAD',extra:'SECRET_UNTRUSTED_CONTEXT'}});
 const result=await performPasswordChange(input,'recovery');
 expect(result).toMatchObject({success:false,canStartNewAttempt:true,requiresFreshSignIn});
 expect(result.error).toContain(message);expect(result.passwordChanged).not.toBe(true);
 expect(m.journal).toHaveBeenCalledWith({stage:'failed'});expect(m.complete).not.toHaveBeenCalled();expect(m.clear).not.toHaveBeenCalled();
 expect(m.warn).toHaveBeenCalledWith('auth credential operation',{operationId:input.operationId,mode:'recovery',category,status:error.status,journalSaved:true});
 const exposed=JSON.stringify({result,logs:m.warn.mock.calls});
 expect(exposed).not.toContain(input.newPassword);expect(exposed).not.toContain('SECRET_');expect(exposed).not.toContain('untrusted-provider-code');
});
it('a failed same-password receipt never tells the user it is safe to resubmit',async()=>{
 m.receiptError={code:'synthetic_write_failure'};
 m.updateUser.mockResolvedValue({data:{user:null},error:{status:422,code:'same_password'}});
 const result=await performPasswordChange(input,'self');
 expect(result).toMatchObject({success:false,canStartNewAttempt:false,requiresFreshSignIn:false});
 expect(result.error).toContain('administrator review');expect(m.complete).not.toHaveBeenCalled();
});
it('an ambiguous provider 500 stays uncertain even when it carries a familiar rejection code',async()=>{
 m.updateUser.mockResolvedValue({data:{user:null},error:{status:500,code:'same_password',message:'SECRET_PROVIDER_PAYLOAD'}});
 const result=await performPasswordChange(input,'self');
 expect(result.error).toContain('uncertain');expect(result.canStartNewAttempt).not.toBe(true);
 expect(m.journal).toHaveBeenCalledWith({stage:'needs_reconciliation'});
 expect(JSON.stringify(m.warn.mock.calls)).not.toContain('SECRET_');
});
