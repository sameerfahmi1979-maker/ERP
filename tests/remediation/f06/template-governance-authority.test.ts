import {beforeEach,expect,it,vi} from 'vitest';
import type {AuthContext} from '@/lib/rbac/check';
const m=vi.hoisted(()=>({ctx:null as AuthContext|null,company:2,active:true,status:'draft',sensitive:false,admin:vi.fn(),mutation:vi.fn()}));
vi.mock('@/lib/rbac/check',async()=>({...await vi.importActual('@/lib/rbac/scope'),getAuthContext:async()=>m.ctx}));
function template(){return {id:2,template_code:'F06_TEST',template_name:'Synthetic template',template_type:'letter',branding_profile_id:7,is_active:m.active,governance_status:m.status,security_review_status:'passed',security_review_notes:m.sensitive?'sensitive_fields_require_elevated_approval':null,version_no:1,body_html_en:'<p>Test</p>'};}
function query(table:string){const q={select:()=>q,eq:()=>q,is:()=>q,order:()=>q,limit:()=>q,update:(v:unknown)=>{m.mutation(v);return q;},insert:(v:unknown)=>{m.mutation(v);return q;},single:async()=>({data:template(),error:null}),maybeSingle:async()=>({data:table==='erp_report_branding_profiles_safe'?{id:7,owner_company_id:m.company,is_active:true}:template(),error:null}),then:(fn:(v:unknown)=>unknown)=>Promise.resolve({data:[],error:null}).then(fn)};return q;}
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({from:query})}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:m.admin}));
vi.mock('@/server/actions/audit',()=>({logAudit:vi.fn()}));
vi.mock('@/server/actions/notifications/notifications',()=>({createNotification:vi.fn().mockResolvedValue({success:true})}));
vi.mock('@/lib/template-governance/security-review',()=>({runTemplateSecurityReview:()=>({passed:true,severity:'none',findings:[]})}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import {submitTemplateForReview,approveTemplate,rejectTemplate,publishTemplate,archiveTemplate,createTemplateDraftVersion,getTemplateGovernanceHistory,runTemplateSecurityReviewAction,checkTemplateIsIssuable} from '@/server/actions/reports/template-governance';
const contract={operationId:'d3bc6391-0f89-45c0-994b-f348971bec5c',revision:'1'};
const operations=[
 ['submit','draft',()=>submitTemplateForReview(2,contract)],
 ['approve','in_review',()=>approveTemplate({templateId:2},contract)],
 ['reject','in_review',()=>rejectTemplate({templateId:2,reason:'Synthetic test reason'},contract)],
 ['publish','approved',()=>publishTemplate(2,contract)],
 ['archive','published',()=>archiveTemplate({templateId:2},contract)],
 ['new version','published',()=>createTemplateDraftVersion(2,contract)],
 ['security review','draft',()=>runTemplateSecurityReviewAction(2,contract)],
 ['history','published',()=>getTemplateGovernanceHistory(2)],
] as const;
beforeEach(()=>{
 vi.clearAllMocks();m.company=2;m.active=true;m.status='draft';m.sensitive=false;
 const codes=['reports.view','reports.manage','reports.template.approve','reports.publish'];
 m.ctx={isAccountActive:true,profile:{id:1},permissionCodes:codes,globalPermissionCodes:[],roleCodes:['synthetic'],roleAssignments:[{roleCode:'synthetic',ownerCompanyId:1,branchId:null,permissionCodes:[...codes]}]} as unknown as AuthContext;
 m.admin.mockReturnValue({from:query});
});
it.each(operations)('%s refuses a foreign-company template before privileged reads/writes',async(_name,status,run)=>{
 m.status=status;const r=await run();expect(r.success).toBe(false);expect(m.admin).not.toHaveBeenCalled();expect(m.mutation).not.toHaveBeenCalled();
});
it.each(operations)('%s refuses a branch-only grant for company-wide template governance',async(_name,status,run)=>{
 m.company=1;m.ctx!.roleAssignments![0].branchId=1;m.status=status;expect((await run()).success).toBe(false);expect(m.admin).not.toHaveBeenCalled();expect(m.mutation).not.toHaveBeenCalled();
});
it('issuability is not an anonymous or foreign-company metadata oracle',async()=>{
 m.status='published';const r=await checkTemplateIsIssuable(2);expect(r.isIssuable).toBe(false);expect(r.governanceStatus).toBeNull();expect(m.admin).not.toHaveBeenCalled();
});
it('inactive templates cannot be newly issued even if previously published',async()=>{
 m.company=1;m.status='published';m.active=false;expect((await checkTemplateIsIssuable(2)).isIssuable).toBe(false);
});
it('an authorized active approved template remains issuable',async()=>{
 m.company=1;m.status='approved';expect(await checkTemplateIsIssuable(2)).toMatchObject({isIssuable:true,governanceStatus:'approved'});
});
it.each(['approve','publish'])('%s cannot borrow sensitive-field approval from a different company',async operation=>{
 m.company=1;m.sensitive=true;m.status=operation==='approve'?'in_review':'approved';
 m.ctx!.permissionCodes.push('reports.sensitive_fields.approve');m.ctx!.roleAssignments!.push({roleCode:'other-company',ownerCompanyId:2,branchId:null,permissionCodes:['reports.sensitive_fields.approve']});
 const r=operation==='approve'?await approveTemplate({templateId:2},contract):await publishTemplate(2,contract);expect(r.success).toBe(false);expect(m.mutation).not.toHaveBeenCalled();
});
