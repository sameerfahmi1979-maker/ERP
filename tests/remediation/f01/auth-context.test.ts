import { beforeEach, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({profile:{id:1,auth_user_id:'test',status:'active'},assignments:[] as object[],roles:[] as object[],permissions:[] as object[],links:[] as object[]}));
const query=(table:string)=>{
 const data=table==='user_profiles'?state.profile:table==='user_roles'?state.assignments:table==='roles'?state.roles:table==='role_permissions'?state.links:state.permissions;
 const q:any={select:()=>q,eq:()=>q,in:()=>q,maybeSingle:async()=>({data}),then:(ok:any)=>Promise.resolve({data}).then(ok)};return q;
};
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'test',email:'f00-test@example.invalid'}}})},from:query})}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:query})}));
import { getAuthContext,isGlobalAdmin,hasPermission } from '@/lib/rbac/check';
beforeEach(()=>{state.profile.status='active';state.assignments=[{role_id:1,owner_company_id:900101,branch_id:null}];state.roles=[{id:1,role_code:'system_admin'}];state.permissions=[];state.links=[];});
it('company-scoped system administrator is not a global administrator',async()=>{const ctx=await getAuthContext();expect(isGlobalAdmin(ctx)).toBe(false);expect(hasPermission(ctx,'erp.admin')).toBe(false);expect(ctx.roleCodes).not.toContain('system_admin');});
it('valid global administrator retains authority',async()=>{state.assignments=[{role_id:1,owner_company_id:null,branch_id:null}];const ctx=await getAuthContext();expect(isGlobalAdmin(ctx)).toBe(true);expect(hasPermission(ctx,'erp.admin')).toBe(true);});
it('inactive global administrator loses authority',async()=>{state.profile.status='inactive';state.assignments=[{role_id:1,owner_company_id:null,branch_id:null}];const ctx=await getAuthContext();expect(isGlobalAdmin(ctx)).toBe(false);expect(hasPermission(ctx,'erp.admin')).toBe(false);});
it('unknown account status fails closed',async()=>{state.profile.status='unexpected';expect((await getAuthContext()).isAccountActive).toBe(false);});
