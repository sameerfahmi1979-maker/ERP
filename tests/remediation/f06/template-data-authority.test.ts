// Actual visual-preview action. Data/rendering/employee-access doubles; not DB/RLS acceptance.
import {beforeEach,expect,it,vi} from 'vitest';
import type {AuthContext} from '@/lib/rbac/check';
const m=vi.hoisted(()=>({ctx:null as AuthContext|null,employee:vi.fn(),employeeBindings:vi.fn(),companyBindings:vi.fn(),sensitive:vi.fn(),render:vi.fn(),assets:vi.fn(),authClient:{},adminClient:{},active:true,brandingCompany:1,permissions:['reports.view']}));
vi.mock('@/lib/rbac/check',async()=>({...await vi.importActual('@/lib/rbac/scope'),getAuthContext:async()=>m.ctx}));
vi.mock('@/lib/rbac/employee-access',()=>({getEmployeeAccess:m.employee}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>m.authClient}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>m.adminClient}));
vi.mock('@/server/actions/audit',()=>({logAudit:vi.fn()}));vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('@/lib/branding/resolve-report-branding-assets',()=>({resolveReportBrandingProfileAssetUrls:m.assets}));
vi.mock('@/lib/report-designer/production-renderer',()=>({templateHasVisualLayout:()=>true,renderVisualTemplateZones:m.render}));
vi.mock('@/lib/report-designer/test-data-resolver',()=>({resolveEmployeeBindingValues:m.employeeBindings,resolveOwnerCompanyBindingValues:m.companyBindings,resolveDocumentBindingValues:()=>({}),redactDesignerTestBindingValues:(values:Record<string,string>)=>({values,redactedKeys:[]})}));
vi.mock('@/lib/report-designer',()=>({buildSampleBindingValues:()=>({'employee.full_name_en':'Synthetic sample'})}));
vi.mock('@/lib/report-designer/sensitive-field-masking',()=>({resolveOfficialSensitiveFields:m.sensitive}));
vi.mock('@/lib/report-designer/field-registry',()=>({REPORT_FIELD_REGISTRY:[{fieldPath:'employee.basic_salary'}]}));
import {renderVisualTemplateForLetterPreview} from '@/server/actions/reports/templates';
beforeEach(()=>{
 vi.clearAllMocks();m.active=true;m.brandingCompany=1;m.permissions=['reports.view'];
 m.ctx={isAccountActive:true,profile:{id:1},permissionCodes:['reports.view'],globalPermissionCodes:[],roleCodes:['synthetic'],roleAssignments:[{roleCode:'synthetic',ownerCompanyId:1,branchId:null,permissionCodes:['reports.view']}]} as unknown as AuthContext;
 m.adminClient={from:()=>{const q={select:()=>q,eq:()=>q,is:()=>q,single:async()=>({error:null,data:{id:2,template_name:'F06 synthetic template',template_code:'F06_TEMPLATE',template_type:'letter',governance_status:'approved',is_active:m.active,branding_profile_id:7,branding_profile:{id:7,owner_company_id:m.brandingCompany,is_active:true}}})};return q;}};
 m.authClient={from:(table:string)=>{const q={select:()=>q,eq:()=>q,is:()=>q,maybeSingle:async()=>({error:null,data:table==='erp_report_templates'?{id:2,template_name:'F06 synthetic template',template_type:'letter',is_active:m.active,branding_profile_id:7}:{id:7,owner_company_id:m.brandingCompany,is_active:true}})};return q;}};
 m.employee.mockImplementation(async()=>({subject:{id:11,owner_company_id:1,branch_id:1,reporting_manager_id:null},allows:(code:string)=>m.permissions.includes(code),scopedContext:{...m.ctx,permissionCodes:m.permissions}}));
 m.assets.mockResolvedValue({});m.employeeBindings.mockResolvedValue({values:{'employee.full_name_en':'F06 employee'},warnings:[],ownerCompanyId:1});m.companyBindings.mockResolvedValue({values:{'company.name':'F06 company'},warnings:[]});m.sensitive.mockResolvedValue({values:{},warnings:[]});m.render.mockReturnValue({html:'Synthetic HTML',hasVisualLayout:true,warnings:[]});
});
it('an authorized employee preview uses authenticated reads, not the privileged template client',async()=>{
 const r=await renderVisualTemplateForLetterPreview({templateId:2,employeeId:11,ownerCompanyId:1});expect(r.ok).toBe(true);expect(m.employee).toHaveBeenCalledWith(m.ctx,11);expect(m.employeeBindings).toHaveBeenCalledWith(11,m.authClient);expect(m.companyBindings).toHaveBeenCalledWith(1,m.authClient);
});
it('template management cannot substitute for employee access',async()=>{
 m.ctx!.permissionCodes.push('reports.manage');m.employee.mockRejectedValue(Error('Synthetic employee denial'));const r=await renderVisualTemplateForLetterPreview({templateId:2,employeeId:99});expect(r.ok).toBe(false);expect(m.employeeBindings).not.toHaveBeenCalled();expect(m.sensitive).not.toHaveBeenCalled();expect(r.error).not.toContain('Synthetic');
});
it('employee access in one company cannot borrow report permission in another',async()=>{
 m.permissions=[];const r=await renderVisualTemplateForLetterPreview({templateId:2,employeeId:11});expect(r.ok).toBe(false);expect(m.employeeBindings).not.toHaveBeenCalled();
});
it('the caller cannot replace the employee data company using a letterhead override',async()=>{
 const r=await renderVisualTemplateForLetterPreview({templateId:2,employeeId:11,ownerCompanyId:2});expect(r.ok).toBe(false);expect(m.employeeBindings).not.toHaveBeenCalled();expect(m.companyBindings).not.toHaveBeenCalled();
});
it('company-only preview requires authority for that actual company',async()=>{
 const r=await renderVisualTemplateForLetterPreview({templateId:2,ownerCompanyId:2});expect(r.ok).toBe(false);expect(m.companyBindings).not.toHaveBeenCalled();
});
it('a foreign-company sensitive grant cannot resolve this employee salary',async()=>{
 m.ctx!.permissionCodes.push('reports.sensitive_fields.use');const r=await renderVisualTemplateForLetterPreview({templateId:2,employeeId:11});expect(r.ok).toBe(true);expect(m.sensitive).not.toHaveBeenCalled();
});
it('sensitive resolution receives only employee-scoped capabilities and the authenticated client',async()=>{
 m.permissions=['reports.view','reports.sensitive_fields.use','hr.payroll.view'];const r=await renderVisualTemplateForLetterPreview({templateId:2,employeeId:11});expect(r.ok).toBe(true);expect(m.sensitive).toHaveBeenCalledWith(expect.objectContaining({supabase:m.authClient,context:expect.objectContaining({userPermissions:m.permissions})}));
});
it('branding denial stops rendering instead of silently producing an unbranded preview',async()=>{
 m.brandingCompany=2;const r=await renderVisualTemplateForLetterPreview({templateId:2,employeeId:11});expect(r.ok).toBe(false);expect(m.render).not.toHaveBeenCalled();expect(m.employeeBindings).not.toHaveBeenCalled();
});
it('retired templates are unavailable even if they still contain an approved layout',async()=>{
 m.active=false;const r=await renderVisualTemplateForLetterPreview({templateId:2});expect(r.ok).toBe(false);expect(m.render).not.toHaveBeenCalled();
});
it.each([{templateId:0},{templateId:2,employeeId:-1},{templateId:2,ownerCompanyId:1.5}])('invalid selection is rejected before employee resolution: %j',async input=>{
 expect((await renderVisualTemplateForLetterPreview(input)).ok).toBe(false);expect(m.employee).not.toHaveBeenCalled();expect(m.render).not.toHaveBeenCalled();
});
