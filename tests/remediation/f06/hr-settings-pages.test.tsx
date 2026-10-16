import {beforeEach,expect,it,vi} from 'vitest';
import type {AuthContext} from '@/lib/rbac/check';
const mock=vi.hoisted(()=>({ctx:{} as AuthContext,client:vi.fn()}));
vi.mock('@/lib/rbac/check',async()=>({...await import('@/lib/rbac/scope'),getAuthContext:async()=>mock.ctx}));
vi.mock('@/lib/supabase/server',()=>({createClient:mock.client}));
vi.mock('@/server/actions/audit',()=>({logAudit:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('@/features/hr/settings/hr-settings-lookup-page',()=>({HrSettingsLookupPage:()=>null}));
vi.mock('@/features/hr/settings/hr-leave-types-settings-page-client',()=>({HrLeaveTypesSettingsPageClient:()=>null}));
vi.mock('@/features/hr/settings/hr-mohre-establishments-page',()=>({HrMohreEstablishmentsPage:()=>null}));
const base={profile:{id:1},isAccountActive:true,roleCodes:[],permissionCodes:['hr.settings.manage'],globalPermissionCodes:[],roleAssignments:[{roleCode:'scoped_hr',ownerCompanyId:1,branchId:null,permissionCodes:['hr.settings.manage']}]} as unknown as AuthContext;
beforeEach(()=>{vi.clearAllMocks();mock.ctx=base;const query:Record<string,unknown>={};for(const name of ['select','retry','is','order','range','eq','ilike'])query[name]=()=>query;query.then=(resolve:(v:unknown)=>unknown)=>Promise.resolve({data:[],count:0,error:null}).then(resolve);mock.client.mockResolvedValue({from:()=>query});});
const pages=[
 ['grades',()=>import('@/app/(protected)/admin/hr/settings/grades/page')],
 ['access-card-types',()=>import('@/app/(protected)/admin/hr/settings/access-card-types/page')],
 ['identity-document-types',()=>import('@/app/(protected)/admin/hr/settings/identity-document-types/page')],
 ['training-types',()=>import('@/app/(protected)/admin/hr/settings/training-types/page')],
 ['employee-categories',()=>import('@/app/(protected)/admin/hr/settings/employee-categories/page')],
 ['payroll-groups',()=>import('@/app/(protected)/admin/hr/settings/payroll-groups/page')],
 ['employment-types',()=>import('@/app/(protected)/admin/hr/settings/employment-types/page')],
 ['mohre-establishments',()=>import('@/app/(protected)/admin/hr/settings/mohre-establishments/page')],
 ['pro-process-types',()=>import('@/app/(protected)/admin/hr/settings/pro-process-types/page')],
 ['medical-record-types',()=>import('@/app/(protected)/admin/hr/settings/medical-record-types/page')],
 ['relationship-types',()=>import('@/app/(protected)/admin/hr/settings/relationship-types/page')],
 ['training-categories',()=>import('@/app/(protected)/admin/hr/settings/training-categories/page')],
 ['leave-types',()=>import('@/app/(protected)/admin/hr/settings/leave-types/page')],
 ['salary-component-types',()=>import('@/app/(protected)/admin/hr/settings/salary-component-types/page')],
] as const;
for(const [name,load]of pages){
 it(name+' denies company-scoped editing on the actual page',async()=>{const page=await load();const view=await page.default();expect(view.props.canManage).toBe(false);});
 it(name+' enables the existing globally authorized editor',async()=>{mock.ctx={...base,globalPermissionCodes:['hr.settings.manage'],roleAssignments:base.roleAssignments?.map(a=>({...a,ownerCompanyId:null}))};const page=await load();const view=await page.default();expect(view.props.canManage).toBe(true);});
}

const optionCases=[
 ['grades',{grade_level:5}],
 ['identity-document-types',{requires_issue_date:false,requires_expiry_date:false,requires_document_number:false,default_expiry_alert_days:7,is_government_document:false,is_sensitive:false}],
 ['access-card-types',{scope_type:'site',default_expiry_alert_days:7,requires_work_site:true,requires_client_authority:false}],
 ['training-types',{default_validity_months:6,default_expiry_alert_days:7,requires_certificate_number:false,requires_provider:true,is_site_required:true,is_designation_required:true}],
 ['medical-record-types',{default_validity_months:6,default_expiry_alert_days:7,is_confidential:false,requires_dms_document:false}],
 ['leave-types',{is_paid:false,requires_document:true,requires_approval:false,default_entitlement_days:0,reset_basis:'manual',allow_half_day:false}],
 ['salary-component-types',{component_kind:'deduction',is_basic:true,is_wps_component:false,is_taxable:true}],
 ['payroll-groups',{pay_frequency:'manual',wps_applicable_default:false}],
 ['pro-process-types',{default_due_days:7,default_expiry_alert_days:7,requires_dms_document:true}],
] as const;
for(const [name,options]of optionCases)it(name+' forwards selected configuration instead of overwriting it with defaults',async()=>{
 mock.ctx={...base,globalPermissionCodes:['hr.settings.manage']};
 const queryClient=await mock.client();const rpc=vi.fn().mockResolvedValue({data:null,error:{code:'42501'}});
 mock.client.mockResolvedValue({...queryClient,rpc});
 const entry=pages.find(p=>p[0]===name)!;const page=await entry[1]();const view=await page.default();
 await view.props.onCreate({code:'F06_OPTIONS',name_en:'F06 options',is_active:false,sort_order:0,...options},{operationId:crypto.randomUUID(),revision:null});
 expect(rpc).toHaveBeenCalledOnce();expect(rpc.mock.calls[0][1].p_data).toMatchObject(options);
});
