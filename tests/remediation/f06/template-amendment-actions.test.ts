import {beforeEach,expect,it,vi} from 'vitest';
import type {AuthContext} from '@/lib/rbac/check';
import {canEditPublishedTemplate,templateAmendmentReceipt} from '@/lib/report-center/template-amendment';
import {publishedTemplate,amendmentState} from './template-amendment-fixture';
const m=vi.hoisted(()=>({ctx:null as AuthContext|null,valid:true,claims:true,company:null as number|null,admin:vi.fn(),rpc:vi.fn(),scan:vi.fn(),cache:vi.fn()}));
vi.mock('@/lib/rbac/check',async()=>({...await vi.importActual('@/lib/rbac/scope'),getAuthContext:async()=>m.ctx}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({
 from:(table:string)=>{const q={select:()=>q,eq:()=>q,is:()=>q,maybeSingle:async()=>({data:table==='erp_report_templates'?{...publishedTemplate,branding_profile_id:m.company==null?null:7}:{id:7,owner_company_id:m.company,is_active:true},error:null})};return q;},
 auth:{getClaims:async()=>({data:{claims:{session_id:m.claims?'dddddddd-0030-4000-8000-000000000001':null}},error:null})},rpc:async()=>({data:m.valid,error:null})
})}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:m.admin}));
vi.mock('@/lib/template-governance/security-review',()=>({runTemplateSecurityReview:m.scan}));
vi.mock('next/cache',()=>({revalidatePath:m.cache}));
import {getTemplateAmendment,saveTemplateAmendment,transitionTemplateAmendment} from '@/server/actions/reports/template-amendments';
const contract={operationId:'cccccccc-0030-4000-8000-000000000001',revision:'3'};
const input={id:42,template_name:'Proposed settings',template_type:'letter' as const};
function principal(role='system_admin',company:number|null=null,branch:number|null=null):AuthContext{
 const codes=['reports.manage','reports.template.approve','reports.publish'];
 return {profile:{id:1,must_change_password:false},isAccountActive:true,permissionCodes:codes,globalPermissionCodes:company===null?codes:[],roleCodes:[role],
  roleAssignments:[{roleCode:role,ownerCompanyId:company,branchId:branch,permissionCodes:codes}]} as AuthContext;
}
beforeEach(()=>{vi.resetAllMocks();m.ctx=principal();m.valid=true;m.claims=true;m.company=null;
 m.admin.mockReturnValue({rpc:m.rpc});m.rpc.mockResolvedValue({data:amendmentState(),error:null});m.scan.mockReturnValue({passed:true,severity:'none',findings:[]});});
it.each([['system_admin',null,null,true],['system_admin',1,null,false],['system_admin',1,2,false],['group_admin',null,null,false],['company_admin',1,null,false],['branch_admin',1,2,false]] as const)('special editor requires exact %s/%s/%s assignment', (role,company,branch,allowed)=>{
 expect(canEditPublishedTemplate(principal(role,company,branch))).toBe(allowed);
});
it('inactive or forced-password accounts cannot inherit editor access',()=>{
 m.ctx!.isAccountActive=false;expect(canEditPublishedTemplate(m.ctx!)).toBe(false);
 m.ctx=principal();m.ctx.profile!.must_change_password=true;expect(canEditPublishedTemplate(m.ctx)).toBe(false);
});
it.each(['group_admin','company_admin','ordinary'])('a %s cannot use the edit endpoint despite aggregate permissions',async role=>{
 m.ctx=principal(role);expect((await saveTemplateAmendment(input,contract)).success).toBe(false);expect(m.admin).not.toHaveBeenCalled();
});
it.each([false,true])('company/branch foreign read fails before service use (%s)',async branch=>{
 m.ctx=principal('reviewer',1,branch?2:null);m.company=2;expect((await getTemplateAmendment(42)).success).toBe(false);expect(m.admin).not.toHaveBeenCalled();
});
it('read-only users cannot inspect private pending edits',async()=>{
 m.ctx=principal('viewer');m.ctx.permissionCodes=['reports.view'];m.ctx.globalPermissionCodes=['reports.view'];m.ctx.roleAssignments![0].permissionCodes=['reports.view'];
 expect((await getTemplateAmendment(42)).success).toBe(false);expect(m.admin).not.toHaveBeenCalled();
});
it('does not trust malformed payloads, contracts or actions',async()=>{
 expect((await saveTemplateAmendment({...input,governance_status:'published'} as typeof input,contract)).success).toBe(false);
 expect((await saveTemplateAmendment(input)).success).toBe(false);
 expect((await transitionTemplateAmendment(42,'save' as 'submit',contract)).success).toBe(false);expect(m.admin).not.toHaveBeenCalled();
});
it.each(['valid','claims'] as const)('a missing %s session proof prevents the privileged call',async key=>{
 m[key]=false;expect((await saveTemplateAmendment(input,contract)).success).toBe(false);expect(m.admin).not.toHaveBeenCalled();
});
it('derives actor and session on the server and preserves operation/revision identity',async()=>{
 const result=await saveTemplateAmendment(input,contract);expect(result.success).toBe(true);
 expect(m.rpc).toHaveBeenCalledWith('edit_report_template',expect.objectContaining({p_actor:1,p_session:'dddddddd-0030-4000-8000-000000000001',p_operation:contract.operationId,p_revision:'3',p_id:42,p_action:'save',p_data:{template_name:'Proposed settings',template_type:'letter'}}));
});
it('scans the exact draft including structured content before submission',async()=>{
 const state={...amendmentState('draft'),revision:'3',template:{...publishedTemplate,body_schema_json:{schemaVersion:1,blocks:[]}}};m.rpc.mockResolvedValue({data:state,error:null});
 expect((await transitionTemplateAmendment(42,'submit',contract)).success).toBe(true);expect(m.scan).toHaveBeenCalledWith(expect.objectContaining({body_schema_json:state.template.body_schema_json}));
 expect(m.rpc.mock.calls[1][1].p_review).toEqual({passed:true,severity:'none',findings:[]});
});
it('cannot submit unsafe content',async()=>{
 m.rpc.mockResolvedValue({data:{...amendmentState('draft'),revision:'3'},error:null});m.scan.mockReturnValue({passed:false,severity:'block',findings:[]});
 expect((await transitionTemplateAmendment(42,'submit',contract)).success).toBe(false);expect(m.rpc).toHaveBeenCalledTimes(1);
});
it('a lost submit response reaches its durable receipt even after the revision advanced',async()=>{
 m.rpc.mockResolvedValue({data:amendmentState('in_review'),error:null});
 expect((await transitionTemplateAmendment(42,'submit',contract)).success).toBe(true);expect(m.scan).not.toHaveBeenCalled();
 expect(m.rpc.mock.calls[1][1]).toMatchObject({p_revision:'3',p_operation:contract.operationId,p_action:'submit',p_review:null});
});
it.each(['PT409','42501','22023','23514'])('known database rollback %s is not alleged to have committed',async code=>{
 m.rpc.mockResolvedValue({data:null,error:{code}});const result=await saveTemplateAmendment(input,contract);expect(result.success).toBe(false);expect(result.uncertain).not.toBe(true);
});
it.each(['lost-response','malformed'])('retains an uncertain %s for reconciliation',async kind=>{
 if(kind==='lost-response')m.rpc.mockRejectedValue(Error('SYNTHETIC NETWORK FAILURE'));else m.rpc.mockResolvedValue({data:{id:42},error:null});
 expect(await saveTemplateAmendment(input,contract)).toMatchObject({success:false,uncertain:true});
});
it('cache invalidation cannot turn a durable success into an alleged failed save',async()=>{
 m.cache.mockImplementation(()=>{throw Error('synthetic cache error');});m.rpc.mockResolvedValue({data:{...amendmentState('draft'),changed:true},error:null});
 expect((await saveTemplateAmendment(input,contract)).success).toBe(true);
});
it('validates both published and draft configuration before exposing controls',()=>{
 expect(templateAmendmentReceipt.safeParse({...amendmentState(),published_template:{id:42}}).success).toBe(false);
 expect(templateAmendmentReceipt.safeParse({...amendmentState(),template:{...publishedTemplate,show_stamp:'true'}}).success).toBe(false);
});
