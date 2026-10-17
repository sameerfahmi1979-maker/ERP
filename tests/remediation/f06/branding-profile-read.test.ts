import {beforeEach,expect,it,vi} from 'vitest';
import type {AuthContext} from '@/lib/rbac/check';
const m=vi.hoisted(()=>({ctx:null as unknown as AuthContext,profile:vi.fn(),assets:vi.fn(),from:vi.fn()}));
vi.mock('@/lib/rbac/check',async()=>({...await vi.importActual('@/lib/rbac/scope'),getAuthContext:async()=>m.ctx}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({from:m.from})}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>{throw Error('Privileged read forbidden');}}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import {getBrandingProfile} from '@/server/actions/reports/templates';
beforeEach(()=>{
 vi.resetAllMocks();m.ctx={isAccountActive:true,profile:{id:1,must_change_password:false},roleCodes:['synthetic'],permissionCodes:['reports.manage'],globalPermissionCodes:[],roleAssignments:[{roleCode:'synthetic',ownerCompanyId:1,branchId:null,permissionCodes:['reports.manage']}]} as unknown as AuthContext;
 m.profile.mockResolvedValue({data:{id:7,profile_name:'Synthetic',owner_company_id:1,logo_url:null,small_logo_url:null,stamp_url:null,signature_url:null},error:null});m.assets.mockResolvedValue({data:[{asset_type:'report_logo'}],error:null});
 m.from.mockImplementation((table:string)=>{expect(['erp_report_branding_profiles_safe','erp_branding_assets']).toContain(table);const q={select:vi.fn(()=>q),eq:vi.fn(()=>q),is:vi.fn(()=>q),maybeSingle:m.profile,then:(resolve:(r:unknown)=>void)=>m.assets().then(resolve)};return q;});
});
it('point reload retains uploaded logo availability without needing a legacy URL',async()=>{const r=await getBrandingProfile(7);expect(r.success).toBe(true);expect(r.data?.has_report_logo).toBe(true);expect(r.data?.has_small_logo).toBe(false);});
it('failed asset lookup cannot return a misleading saved profile with missing images',async()=>{m.assets.mockResolvedValue({data:null,error:{message:'PRIVATE'}});const r=await getBrandingProfile(7);expect(r.success).toBe(false);expect(r.data).toBeUndefined();expect(r.error).not.toContain('PRIVATE');});
it('signing availability remains undisclosed without a same-company signing grant',async()=>{m.assets.mockResolvedValue({data:[{asset_type:'stamp'},{asset_type:'signature'}],error:null});const r=await getBrandingProfile(7);expect(r.data?.has_stamp).toBeUndefined();expect(r.data?.has_signature).toBeUndefined();expect(r.data?.can_sign).toBe(false);});
it('a same-company signer sees current signing-file availability',async()=>{m.ctx.roleAssignments![0].permissionCodes.push('reports.sign');m.assets.mockResolvedValue({data:[{asset_type:'stamp'}],error:null});const r=await getBrandingProfile(7);expect(r.data?.has_stamp).toBe(true);expect(r.data?.has_signature).toBe(false);});
it('no visible profile produces unavailable, not an asset query or an empty success',async()=>{m.profile.mockResolvedValue({data:null,error:null});expect((await getBrandingProfile(7)).success).toBe(false);expect(m.assets).not.toHaveBeenCalled();});
