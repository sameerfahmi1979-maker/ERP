import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({updateUser:vi.fn(),insert:vi.fn(),journal:vi.fn(),complete:vi.fn(),clear:vi.fn(),receiptError:null as unknown}));
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
vi.mock('@/lib/logger',()=>({logger:{warn:vi.fn()}}));
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
