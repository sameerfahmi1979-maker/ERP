import {beforeEach, expect, it, vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import type {AuthContext} from '@/lib/rbac/check';
const mock=vi.hoisted(()=>({ctx:{} as AuthContext, ai:[vi.fn(),vi.fn(),vi.fn()],email:[vi.fn(),vi.fn(),vi.fn()],aiClient:vi.fn(()=>null),emailClient:vi.fn(()=>null)}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:async()=>mock.ctx}));
vi.mock('next/navigation',()=>({redirect:()=>{throw Error('ACCESS_DENIED');}}));
vi.mock('@/server/actions/settings/ai-settings',()=>({getAiProviderConfigs:mock.ai[0],getAiFeatureFlags:mock.ai[1],getAiUsageLogs:mock.ai[2]}));
vi.mock('@/server/actions/settings/email-settings',()=>({getEmailProviderConfigs:mock.email[0],getEmailFeatureFlags:mock.email[1],getEmailSendLogs:mock.email[2]}));
vi.mock('@/features/settings/ai/ai-settings-page-client',()=>({AiSettingsPageClient:mock.aiClient}));
vi.mock('@/features/settings/email/email-settings-page-client',()=>({EmailSettingsPageClient:mock.emailClient}));
import AiPage from '@/app/(protected)/admin/settings/ai/page';
import EmailPage from '@/app/(protected)/admin/settings/email/page';
import {LoadError} from '@/components/erp/load-error';
function permissions(codes:string[],scoped=false){mock.ctx={isAccountActive:true,profile:{id:1,must_change_password:false},permissionCodes:codes,globalPermissionCodes:scoped?[]:codes,roleCodes:[],roleAssignments:scoped?[{roleCode:'synthetic_scoped',ownerCompanyId:1,branchId:null,permissionCodes:codes}]:[]} as unknown as AuthContext;}
beforeEach(()=>{vi.clearAllMocks();permissions([]);for(const read of [...mock.ai,...mock.email])read.mockResolvedValue({success:true,data:[]});});
for(const [kind,page,reads,flagPermission,logPermission] of [
 ['ai',AiPage,mock.ai,'view','usage.view'],['email',EmailPage,mock.email,'feature_flags.manage','logs.view'],
] as const){
 for(const [grant,expected] of [['test',[true,false,false]],['secrets.manage',[true,false,false]],[flagPermission,kind==='ai'?[true,true,false]:[false,true,false]],[logPermission,[false,false,true]]] as const){
  it(`${kind}: ${grant} opens only authorized sections without invented grants`,async()=>{
   permissions([`settings.${kind}.${grant}`]);const element=await page();const props=element.props.children.props;
   const flags=kind==='ai'?props.permissions:props;
   expect([flags.canViewProviders,flags.canViewFlags,flags[kind==='ai'?'canViewUsage':'canViewLogs']]).toEqual(expected);
   reads.forEach((read,index)=>expect(read.mock.calls.length).toBe(expected[index]?1:0));
   expect(flags.canManage).toBe(false);expect(flags[kind==='ai'?'canManageSecrets':'canSecrets']).toBe(grant==='secrets.manage');
  });
 }
 for(const grant of ['manage','test','secrets.manage',flagPermission,logPermission])it(`${kind}: company-only ${grant} cannot administer global providers`,async()=>{
  permissions([`settings.${kind}.${grant}`],true);await expect(page()).rejects.toThrow('ACCESS_DENIED');reads.forEach(read=>expect(read).not.toHaveBeenCalled());
 });
 it(`${kind}: no-role, inactive and password-setup principals cannot read settings`,async()=>{
  for(const context of [()=>permissions([]),()=>{permissions([`settings.${kind}.manage`]);mock.ctx.isAccountActive=false;},()=>{permissions([`settings.${kind}.manage`]);mock.ctx.profile!.must_change_password=true;}]){
   context();await expect(page()).rejects.toThrow('ACCESS_DENIED');
  }reads.forEach(read=>expect(read).not.toHaveBeenCalled());
 });
 it(`${kind}: global administrator works without fabricated explicit permission rows`,async()=>{
  permissions([]);mock.ctx.roleAssignments=[{roleCode:'system_admin',ownerCompanyId:null,branchId:null,permissionCodes:[]}];
  const element=await page();const props=element.props.children.props;expect((kind==='ai'?props.permissions:props).canManage).toBe(true);reads.forEach(read=>expect(read).toHaveBeenCalledOnce());
 });
 for(const index of [0,1,2])it(`${kind}: failed section ${index} is not silently presented as empty`,async()=>{
  permissions(['manage',logPermission].map(grant=>`settings.${kind}.${grant}`));
  reads.forEach((read,i)=>read.mockResolvedValue({success:true,data:[{id:i+1,providerName:'COMPANION_ROW',featureName:'COMPANION_ROW'}]}));
  reads[index].mockResolvedValue({success:false,error:'SYNTHETIC_TRANSPORT_DETAIL'});
  const element=await page();const html=renderToStaticMarkup(element);
  expect(element.type).toBe(LoadError);expect(html).toContain('role="alert"');
  expect(html).toContain(`${kind==='ai'?'AI':'Email'} settings could not be loaded`);
  expect(html).toContain(`href="/admin/settings/${kind}"`);expect(html).toContain('Try loading again');
  for(const text of ['SYNTHETIC_TRANSPORT_DETAIL','COMPANION_ROW','No records found','No feature flags found','No send logs yet','Add Provider'])expect(html).not.toContain(text);
  expect(mock.aiClient).not.toHaveBeenCalled();expect(mock.emailClient).not.toHaveBeenCalled();
  reads.forEach(read=>expect(read).toHaveBeenCalledOnce());
 });
 it(`${kind}: unrequested reads cannot force a failure outcome`,async()=>{
  permissions([`settings.${kind}.${logPermission}`]);reads[0].mockImplementation(()=>{throw Error('UNREQUESTED_READ');});reads[1].mockImplementation(()=>{throw Error('UNREQUESTED_READ');});
  const element=await page();expect(element.type).not.toBe(LoadError);renderToStaticMarkup(element);
  expect(kind==='ai'?mock.aiClient:mock.emailClient).toHaveBeenCalledOnce();expect(reads[0]).not.toHaveBeenCalled();expect(reads[1]).not.toHaveBeenCalled();expect(reads[2]).toHaveBeenCalledOnce();
 });
 it(`${kind}: confirmed empty results render the existing permitted client`,async()=>{
  permissions(['manage',logPermission].map(grant=>`settings.${kind}.${grant}`));const element=await page();expect(element.type).not.toBe(LoadError);
  const props=element.props.children.props;expect(props.configs).toEqual([]);expect(props.featureFlags).toEqual([]);expect(props[kind==='ai'?'usageLogs':'sendLogs']).toEqual([]);
  if(kind==='email')expect(props.initialError).toBe(false);
  renderToStaticMarkup(element);expect(kind==='ai'?mock.aiClient:mock.emailClient).toHaveBeenCalledOnce();
 });
 it(`${kind}: a later successful read recovers without altering rows or authority`,async()=>{
  permissions(['manage',logPermission].map(grant=>`settings.${kind}.${grant}`));reads[0].mockResolvedValueOnce({success:false,error:'SYNTHETIC_TRANSPORT_DETAIL'});
  const unavailable=await page();renderToStaticMarkup(unavailable);expect(unavailable.type).toBe(LoadError);expect(kind==='ai'?mock.aiClient:mock.emailClient).not.toHaveBeenCalled();
  const rows=[[{id:41,workspaceRevision:'4',isEnabled:false,isActive:false,isDefault:false,confidenceThreshold:0}],[{id:42,workspaceRevision:'5',isEnabled:false,requiresHumanReview:false,minConfidenceThreshold:0}],[{id:43,durationMs:0,estimatedCost:0,attemptCount:0,errorMessage:'STORED_HISTORY',lastError:'STORED_HISTORY'}]];
  reads.forEach((read,i)=>read.mockResolvedValue({success:true,data:rows[i]}));const recovered=await page();expect(recovered.type).not.toBe(LoadError);
  const props=recovered.props.children.props;expect(props.configs).toBe(rows[0]);expect(props.featureFlags).toBe(rows[1]);expect(props[kind==='ai'?'usageLogs':'sendLogs']).toBe(rows[2]);
  expect((kind==='ai'?props.permissions:props).canManage).toBe(true);if(kind==='email')expect(props.initialError).toBe(false);
  renderToStaticMarkup(recovered);expect(kind==='ai'?mock.aiClient:mock.emailClient).toHaveBeenCalledOnce();reads.forEach(read=>expect(read).toHaveBeenCalledTimes(2));
 });
}
