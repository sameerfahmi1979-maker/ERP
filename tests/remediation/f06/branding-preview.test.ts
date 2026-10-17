import {beforeEach,expect,it,vi} from 'vitest';
import type {AuthContext} from '@/lib/rbac/check';
const m=vi.hoisted(()=>({ctx:null as AuthContext|null,assets:vi.fn(),admin:vi.fn()}));
vi.mock('@/lib/rbac/check',async()=>({...await vi.importActual('@/lib/rbac/scope'),getAuthContext:async()=>m.ctx}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:m.admin}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({from:(table:string)=>{const q={select:()=>q,eq:()=>q,is:()=>q,maybeSingle:async()=>({error:null,data:table==='erp_report_templates'?{id:2,branding_profile_id:1,is_active:true,show_stamp:true,show_signatory:true}:{id:1,owner_company_id:1,is_active:true,stamp_url:'https://synthetic.invalid/stamp',signature_url:'https://synthetic.invalid/signature'}})};return q;}})}));
vi.mock('@/lib/branding/resolve-report-branding-assets',()=>({resolveReportBrandingProfileAssetUrls:m.assets}));
vi.mock('@/server/actions/audit',()=>({logAudit:vi.fn()}));vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import {resolveTemplatePreview} from '@/server/actions/reports/templates';
beforeEach(()=>{vi.clearAllMocks();m.ctx={isAccountActive:true,profile:{id:1,must_change_password:false},permissionCodes:['reports.view','reports.sign'],globalPermissionCodes:[],roleCodes:['synthetic'],roleAssignments:[{roleCode:'synthetic',ownerCompanyId:1,branchId:null,permissionCodes:['reports.view']},{roleCode:'synthetic',ownerCompanyId:2,branchId:null,permissionCodes:['reports.sign']}]} as unknown as AuthContext;m.assets.mockResolvedValue({});m.admin.mockReturnValue({from:()=>{const q={select:()=>q,eq:()=>q,is:()=>q,single:async()=>({error:null,data:{id:2,is_active:true,show_stamp:true,show_signatory:true,branding_profile:{id:1,owner_company_id:1,is_active:true,stamp_url:'https://synthetic.invalid/stamp',signature_url:'https://synthetic.invalid/signature'}}})};return q;}});});
it('legacy stamp/signature fallback cannot borrow a signing role from another company',async()=>{const r=await resolveTemplatePreview({templateId:2});expect(r.success).toBe(true);expect(r.data).toMatchObject({stampUrl:null,signatureUrl:null});});
it('a separately granted same-company signer may use the retained legacy image',async()=>{m.ctx!.roleAssignments![0].permissionCodes.push('reports.sign');const r=await resolveTemplatePreview({templateId:2});expect(r.success).toBe(true);expect(r.data).toMatchObject({stampUrl:'https://synthetic.invalid/stamp',signatureUrl:'https://synthetic.invalid/signature'});});
it('a company-B report grant does not authorize company-A template branding',async()=>{
 m.ctx!.roleAssignments![0].ownerCompanyId=2;const r=await resolveTemplatePreview({templateId:2});expect(r.success).toBe(false);expect(r.data).toBeUndefined();expect(m.assets).not.toHaveBeenCalled();
});
it('a branch-only report grant is not company-wide template authority',async()=>{
 m.ctx!.roleAssignments![0].branchId=1;const r=await resolveTemplatePreview({templateId:2});expect(r.success).toBe(false);expect(m.assets).not.toHaveBeenCalled();
});
