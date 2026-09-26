import { beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
const m=vi.hoisted(()=>({cookie:'',row:null as unknown,error:null as unknown,select:vi.fn(),eq:vi.fn(),is:vi.fn(),gt:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('next/headers',()=>({cookies:async()=>({get:()=>({value:m.cookie})})}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:()=>{
 const q={select:(v:string)=>{m.select(v);return q;},eq:(...v:unknown[])=>{m.eq(...v);return q;},is:(...v:unknown[])=>{m.is(...v);return q;},gt:(...v:unknown[])=>{m.gt(...v);return q;},maybeSingle:async()=>({data:m.row,error:m.error})};return q;
}})}));
import { getPasswordFlow, getPasswordFlowContext } from '@/lib/auth/password-flow';
beforeEach(()=>{vi.clearAllMocks();m.cookie='a'.repeat(43);m.row=null;m.error=null;});
it.each(['invite','recovery'] as const)('uses only the scoped unconsumed %s server grant for context',async type=>{
 const hash=createHash('sha256').update(m.cookie).digest('hex');m.row={token_hash:hash,flow_type:type};
 expect(await getPasswordFlowContext('actor','session')).toEqual({hash,type});
 expect(await getPasswordFlow('actor','session')).toBe(hash);
 expect(m.eq).toHaveBeenCalledWith('token_hash',hash);expect(m.eq).toHaveBeenCalledWith('auth_user_id','actor');expect(m.eq).toHaveBeenCalledWith('session_id','session');
 expect(m.is).toHaveBeenCalledWith('consumed_at',null);expect(m.gt).toHaveBeenCalledWith('expires_at',expect.any(String));
});
it.each([null,{flow_type:'other'},{flow_type:'invite'}])('fails closed for absent, unsupported or errored grants %j',async row=>{
 m.row=row;if(row?.flow_type==='invite')m.error={code:'synthetic_failure'};
 expect(await getPasswordFlowContext('actor','session')).toBeNull();
});
it.each(['','invalid','a'.repeat(44)])('does not query a malformed setup cookie',async value=>{
 m.cookie=value;expect(await getPasswordFlowContext('actor','session')).toBeNull();expect(m.select).not.toHaveBeenCalled();
});
