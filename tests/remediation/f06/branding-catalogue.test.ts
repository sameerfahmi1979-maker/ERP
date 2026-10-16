import {beforeEach,expect,it,vi} from 'vitest';
import type {AuthContext} from '@/lib/rbac/check';
const m=vi.hoisted(()=>({ctx:null as unknown as AuthContext,rows:{} as Record<string,Record<string,unknown>[]>,calls:[] as {table:string;cursor:number;limit:number}[],failAfter:false,from:vi.fn()}));
vi.mock('@/lib/rbac/check',async()=>({...await vi.importActual('@/lib/rbac/scope'),getAuthContext:async()=>m.ctx}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({from:m.from})}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>{throw Error('Privileged catalogue forbidden');}}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import {getBrandingEditorChoices,listBrandingProfiles} from '@/server/actions/reports/templates';
beforeEach(()=>{
 vi.resetAllMocks();m.calls=[];m.failAfter=false;
 m.ctx={isAccountActive:true,profile:{id:1,must_change_password:false},roleCodes:['synthetic'],permissionCodes:['reports.manage'],globalPermissionCodes:[],roleAssignments:[{roleCode:'synthetic',ownerCompanyId:1,branchId:null,permissionCodes:['reports.manage']}]} as unknown as AuthContext;
 m.rows={erp_branding_company_choices:Array.from({length:501},(_,i)=>({id:i+1,company_code:`C${i+1}`,legal_name_en:`Synthetic company ${i+1}`,can_sign:false})),
  erp_report_branding_profiles_safe:Array.from({length:201},(_,i)=>({id:i+1,profile_name:`Synthetic ${i+1}`,owner_company_id:1,logo_url:null,small_logo_url:null})),
  erp_branding_assets:Array.from({length:201},(_,i)=>({id:i+1,branding_profile_id:i+1,asset_type:'report_logo'}))};
 m.from.mockImplementation((table:string)=>{
  let cursor=0,limit=100;const q={select:vi.fn(()=>q),order:vi.fn(()=>q),eq:vi.fn(()=>q),is:vi.fn(()=>q),
   gt:vi.fn((column:string,value:number)=>{expect(column).toBe('id');cursor=value;return q;}),limit:vi.fn((n:number)=>{limit=n;return q;}),
   then:(resolve:(r:unknown)=>void)=>{m.calls.push({table,cursor,limit});return Promise.resolve(m.failAfter&&cursor>0?{data:null,error:{message:'PRIVATE'}}:{data:m.rows[table].filter(r=>Number(r.id)>cursor).slice(0,Math.min(limit,100)),error:null}).then(resolve);}};return q;
 });
});
it('all authorized issuing companies remain selectable beyond the old 500 cap and smaller API pages',async()=>{
 const r=await getBrandingEditorChoices();expect(r.success).toBe(true);expect(r.data?.companies).toHaveLength(501);expect(r.data?.companies.some(c=>c.id===501)).toBe(true);expect(r.data?.canCreateGlobal).toBe(false);
 expect(m.calls.length).toBeGreaterThan(1);expect(m.calls.every(c=>c.limit<=200)).toBe(true);
});
it('profile and asset pages are both complete, so late profiles do not falsely lose their logos',async()=>{
 const r=await listBrandingProfiles();expect(r.success).toBe(true);expect(r.data).toHaveLength(201);expect(r.data?.find(p=>p.id===201)?.has_report_logo).toBe(true);
 expect(m.calls.some(c=>c.table==='erp_branding_assets'&&c.cursor>=200)).toBe(true);
});
it('a later failed company page returns failure rather than a partial successful catalogue',async()=>{
 m.failAfter=true;const r=await getBrandingEditorChoices();expect(r.success).toBe(false);expect(r.data).toBeUndefined();expect(r.error).not.toContain('PRIVATE');
});
it('a later failed profile or asset page cannot return false availability',async()=>{
 m.failAfter=true;const r=await listBrandingProfiles();expect(r.success).toBe(false);expect(r.data).toBeUndefined();expect(r.error).not.toContain('PRIVATE');
});
it('no-role callers do not start either catalogue query',async()=>{
 m.ctx={...m.ctx,permissionCodes:[],roleAssignments:[]};expect((await getBrandingEditorChoices()).success).toBe(false);expect((await listBrandingProfiles()).success).toBe(false);expect(m.from).not.toHaveBeenCalled();
});
