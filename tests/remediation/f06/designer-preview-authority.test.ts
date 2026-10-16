import {beforeEach,expect,it,vi} from 'vitest';
import type {AuthContext} from '@/lib/rbac/check';
const m=vi.hoisted(()=>({ctx:null as AuthContext|null,company:1,status:'published',map:vi.fn(),branding:vi.fn()}));
vi.mock('@/lib/rbac/check',async()=>({...await vi.importActual('@/lib/rbac/scope'),getAuthContext:async()=>m.ctx}));
vi.mock('@/server/actions/reports/templates',()=>({resolveTemplatePreview:m.branding}));
vi.mock('@/lib/report-designer',()=>({mapRawZonesToExecutiveLedgerDocument:m.map,buildSampleBindingValues:()=>({})}));
vi.mock('@/lib/executive-ledger/html-renderer',()=>({renderExecutiveLedgerHtml:()=>'<p>Sample</p>'}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:()=>{const q={select:()=>q,eq:()=>q,is:()=>q,single:async()=>({data:{id:2,template_name:'Synthetic template',template_type:'letter',is_active:true,governance_status:m.status,branding_profile_id:7,branding_profile:{id:7,owner_company_id:m.company,is_active:true},body_layout_json:{source:'saved'}},error:null})};return q;}})}));
import {previewReportDesignerTemplate} from '@/server/actions/reports/report-designer-preview';
beforeEach(()=>{
 vi.clearAllMocks();m.company=1;m.status='published';m.ctx={isAccountActive:true,profile:{id:1},permissionCodes:['reports.view'],globalPermissionCodes:[],roleCodes:['synthetic'],roleAssignments:[{roleCode:'synthetic',ownerCompanyId:1,branchId:null,permissionCodes:['reports.view']}]} as unknown as AuthContext;
 m.branding.mockResolvedValue({success:true,data:{}});m.map.mockReturnValue({document:{},warnings:[]});
});
it('a viewer cannot submit arbitrary unsaved layouts',async()=>{
 const r=await previewReportDesignerTemplate({templateId:2,bodyLayoutJson:{source:'unapproved'}});expect(r.ok).toBe(false);expect(m.map).not.toHaveBeenCalled();
});
it('a viewer may preview only the stored published layout',async()=>{
 const r=await previewReportDesignerTemplate({templateId:2});expect(r.ok).toBe(true);expect(m.map).toHaveBeenCalledWith(expect.objectContaining({bodyLayoutRaw:{source:'saved'}}));
});
it('company A management does not permit editing company B layout previews',async()=>{
 m.company=2;m.ctx!.permissionCodes.push('reports.manage');m.ctx!.roleAssignments![0].permissionCodes.push('reports.manage');
 expect((await previewReportDesignerTemplate({templateId:2,bodyLayoutJson:{source:'unapproved'}})).ok).toBe(false);expect(m.map).not.toHaveBeenCalled();
});
it('a viewer cannot preview an unpublished draft',async()=>{
 m.status='draft';expect((await previewReportDesignerTemplate({templateId:2})).ok).toBe(false);expect(m.map).not.toHaveBeenCalled();
});
it('a scoped manager can preview draft edits for the same company',async()=>{
 m.status='draft';m.ctx!.permissionCodes.push('reports.manage');m.ctx!.roleAssignments![0].permissionCodes.push('reports.manage');
 expect((await previewReportDesignerTemplate({templateId:2,bodyLayoutJson:{source:'edited'}})).ok).toBe(true);expect(m.map).toHaveBeenCalledWith(expect.objectContaining({bodyLayoutRaw:{source:'edited'}}));
});
it('branding read failure is not replaced by an apparently successful empty brand',async()=>{
 m.branding.mockResolvedValue({success:false,error:'Synthetic branding unavailable'});expect((await previewReportDesignerTemplate({templateId:2})).ok).toBe(false);expect(m.map).not.toHaveBeenCalled();
});
