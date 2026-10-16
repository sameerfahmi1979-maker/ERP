// Real helpers behind named action ports; no network, Storage or server runtime.
// @vitest-environment node
import '../f05/setup';
import {afterAll,afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {StrictMode,type ReactNode} from 'react';
import {FluentProvider,webLightTheme} from '@fluentui/react-components';
import {ReadCacheBoundary} from '@/components/layout/read-cache-boundary';
import type {ReportTemplate,ReportBrandingProfile} from '@/lib/report-center/types';
import type {AppBrandingSettings} from '@/lib/branding';
import type {RuntimeAppBranding} from '@/lib/branding/runtime-types';
const dom=await vi.hoisted(async()=>{const {builtinEnvironments}=await import('vitest/runtime');return builtinEnvironments.jsdom.setup(globalThis,{jsdom:{url:'http://localhost:3000'}});});
afterAll(async()=>{await act(async()=>{await new Promise<void>(resolve=>setImmediate(resolve));});dom.teardown(globalThis);});
const m=vi.hoisted(()=>({business:vi.fn(),load:vi.fn(),history:vi.fn(),settings:vi.fn(),profileCreate:vi.fn(),profileUpdate:vi.fn(),templateCreate:vi.fn(),templateUpdate:vi.fn(),approve:vi.fn(),reject:vi.fn(),publish:vi.fn(),copy:vi.fn(),review:vi.fn(),upload:vi.fn(),retire:vi.fn(),toast:vi.fn(),error:vi.fn(),refresh:vi.fn(),updated:vi.fn(),created:vi.fn(),storage:vi.fn(),ackFails:false}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn(),revalidateTag:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:m.refresh}),usePathname:()=>'/synthetic'}));
vi.mock('sonner',()=>({toast:{success:m.toast,error:m.error,warning:m.toast}}));
vi.mock('@/hooks/use-workspace-tab-dirty',()=>({useWorkspaceTabDirty:()=>{}}));
vi.mock('@/hooks/use-workspace-navigation-lock',()=>({useWorkspaceNavigationLock:()=>{}}));
vi.mock('@/server/branding-invalidation',()=>({invalidateCommittedBranding:vi.fn()}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:async()=>({profile:{id:41}})}));
vi.mock('@/server/report-template-authority',()=>({requireReportTemplateCapability:async()=>({template:{security_review_notes:null},companyId:1})}));
vi.mock('@/lib/branding/asset-permissions',()=>({brandingPermission:()=>true,canManageAppBranding:()=>true,canUploadBrandingAssets:()=>true,validateScopeAndType:()=>null}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({rpc:async(name:string,args:unknown)=>name==='f03_current_session_valid'?{data:true,error:null}:m.business(name,args),auth:{getClaims:async()=>({data:{claims:{session_id:'synthetic-session'}},error:null})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{id:1,owner_company_id:1,is_active:true},error:null})})})})})}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({rpc:m.business,storage:{from:()=>({upload:m.storage})}})}));
vi.mock('@/server/branding-image',()=>({verifyBrandingImage:async()=>({bytes:Buffer.from('clean synthetic image'),metadata:{mime:'image/png',sha256:'synthetic',width:1,height:1}})}));
vi.mock('@/lib/workspace/save-contract',async(importOriginal)=>{const real=await importOriginal<typeof import('@/lib/workspace/save-contract')>();return {...real,createWorkspaceSaveAttempt:()=>{const a=real.createWorkspaceSaveAttempt();return {...a,resolved:()=>{a.resolved();if(m.ackFails)throw Error('PRIVATE ACK');}};}};});
vi.mock('@/server/actions/branding/app-settings',()=>({updateAppBrandingSettings:m.settings}));
vi.mock('@/server/actions/branding/assets',()=>({uploadBrandingAsset:m.upload,deactivateBrandingAsset:m.retire}));
vi.mock('@/server/actions/reports/templates',()=>({createBrandingProfile:m.profileCreate,updateBrandingProfile:m.profileUpdate,createReportTemplate:m.templateCreate,updateReportTemplate:m.templateUpdate,getReportTemplate:m.load,getBrandingProfile:m.load,getBrandingEditorChoices:async()=>({success:true,data:{companies:[{id:1,company_code:'A',legal_name_en:'Company A',can_sign:false}],canCreateGlobal:true,canSignGlobal:false}})}));
vi.mock('@/server/actions/reports/template-governance',()=>({approveTemplate:m.approve,rejectTemplate:m.reject,publishTemplate:m.publish,createTemplateDraftVersion:m.copy,submitTemplateForReview:vi.fn(),archiveTemplate:vi.fn(),runTemplateSecurityReviewAction:m.review,getTemplateGovernanceHistory:m.history}));
import {saveBrandingMutation} from '@/server/branding-save';
import {saveTemplateConfiguration} from '@/server/template-configuration-save';
import {saveTemplateGovernance} from '@/server/template-governance-save';
import {saveBrandingUpload,retireBrandingAsset} from '@/server/branding-asset-save';
import {AppBrandingSettingsPageClient} from '@/features/branding/app-branding-settings-page-client';
import {BrandingProfileForm} from '@/features/report-center/branding-profile-form';
import {TemplateForm} from '@/features/report-center/template-form';
import {BrandingAssetUploadCard} from '@/features/branding/branding-asset-upload-card';
import {GovernanceActionsDropdown,TemplateGovernanceHistoryDialog} from '@/features/report-center/template-governance-actions';
type Contract=import('@/lib/workspace/save-contract').WorkspaceSaveContract;
const receipt={id:1,revision:'8',changed:true,replayed:true,owner_company_id:1};
const governanceReceipt={...receipt,source_id:1,governance_status:'approved',security_review_status:'passed',review:null};
const row={id:1,workspace_revision:7,template_code:'TEST',template_name:'Template A',template_type:'report',governance_status:'in_review',is_active:true,default_orientation:'portrait',page_size:'a4',font_family:'Inter',language_mode:'en',show_logo:false,show_stamp:false,show_signatory:false} as ReportTemplate;
const profile={id:1,workspace_revision:7,profile_code:'TEST',profile_name:'Profile A',profile_type:'company',owner_company_id:1,is_active:true,can_manage:true,can_sign:false,theme_primary_color:'#123456',theme_secondary_color:'#123456',theme_header_bg_color:'#123456',theme_header_text_color:'#ffffff',is_group_profile:false,is_neutral_profile:false,is_default_for_company:false} as ReportBrandingProfile;
const settings={id:1,workspace_revision:7,app_name:'Synthetic ERP'} as AppBrandingSettings;
const runtime={settingsId:1,settingsRevision:'7',assets:{},assetStatus:'ready'} as RuntimeAppBranding;
const wrap=(children:ReactNode,account='A')=><StrictMode><FluentProvider theme={webLightTheme}><ReadCacheBoundary authUserId={account} scopeVersion="1">{children}</ReadCacheBoundary></FluentProvider></StrictMode>;
function page(s=settings){return <AppBrandingSettingsPageClient settings={s} runtimeBranding={runtime} canManage canUpload={false}/>;}
function governance(r=row){return <GovernanceActionsDropdown template={r} canManage canApprove canPublish onTemplateUpdated={m.updated} onNewVersionCreated={m.created}/>;}
function asset(){return <BrandingAssetUploadCard label="Report Logo" description="Synthetic" scope="report" brandingProfileId={1} ownerCompanyId={1} assetType="report_logo" parentRevision="7" asset={null} canUpload onChanged={m.updated}/>;}
function fail(code:string){return {error:{code,message:'PRIVATE MESSAGE',details:'PRIVATE DETAILS',hint:'PRIVATE HINT'},data:null};}
beforeEach(()=>{
 vi.resetAllMocks();m.ackFails=false;m.business.mockResolvedValue({data:receipt,error:null});m.storage.mockResolvedValue({error:null});
 m.load.mockImplementation(async(id:number)=>({success:true,data:{...row,id,workspace_revision:8}}));m.history.mockResolvedValue({success:true,data:[]});
 m.settings.mockImplementation(({id,...data}:{id:number},c:Contract)=>saveBrandingMutation('app',id,data,c));
 m.profileCreate.mockImplementation((data:object,c:Contract)=>saveBrandingMutation('report',null,data,c));m.profileUpdate.mockImplementation(({id,...data}:{id:number},c:Contract)=>saveBrandingMutation('report',id,data,c));
 m.templateCreate.mockImplementation((data:object,c:Contract)=>saveTemplateConfiguration(null,data,c));m.templateUpdate.mockImplementation(({id,...data}:{id:number},c:Contract)=>saveTemplateConfiguration(id,data,c));
 m.approve.mockImplementation(async({templateId,notes}:{templateId:number;notes?:string},c:Contract)=>{const r=await saveTemplateGovernance(templateId,'approve',notes??null,c);return {...r,receipt:r.data};});
 m.reject.mockImplementation(async({templateId,reason}:{templateId:number;reason:string},c:Contract)=>{const r=await saveTemplateGovernance(templateId,'reject',reason,c);return {...r,receipt:r.data};});
 m.publish.mockImplementation(async(id:number,c:Contract)=>{const r=await saveTemplateGovernance(id,'publish',null,c);return {...r,receipt:r.data};});
 m.copy.mockImplementation(async(id:number,c:Contract)=>{const r=await saveTemplateGovernance(id,'new_version',null,c);return {...r,receipt:r.data};});
 m.upload.mockImplementation(saveBrandingUpload);m.retire.mockImplementation((id:number,c:Parameters<typeof retireBrandingAsset>[2])=>retireBrandingAsset(id,'deactivate',c));
});
afterEach(cleanup);
async function click(name:string){const button=await screen.findByRole('button',{name});await waitFor(()=>expect((button as HTMLButtonElement).disabled).toBe(false));fireEvent.click(button);}
async function menu(name:string){await click('Governance actions');fireEvent.click(await screen.findByRole('menuitem',{name}));}
it('a later authoritative revision admits publishing after a completed approval',async()=>{
 m.business.mockResolvedValueOnce({data:governanceReceipt,error:null}).mockResolvedValueOnce({data:{...governanceReceipt,revision:'10',governance_status:'published'},error:null});const v=render(wrap(governance()));
 await menu('Approve');await waitFor(()=>expect(m.updated).toHaveBeenCalledOnce());v.rerender(wrap(governance({...row,workspace_revision:9,governance_status:'approved'})));
 await menu('Publish');await waitFor(()=>expect(m.business).toHaveBeenCalledTimes(2));expect(m.business.mock.calls[1][1]).toMatchObject({p_id:1,p_revision:'9',p_action:'publish'});expect(m.business.mock.calls[1][1].p_operation).not.toBe(m.business.mock.calls[0][1].p_operation);
});
it('same-receipt review is read-only but a content revision admits a new review',async()=>{
 m.review.mockResolvedValue({success:true,receipt:{...governanceReceipt,governance_status:'draft'}});m.load.mockResolvedValue({success:true,data:{...row,workspace_revision:8,governance_status:'draft'}});const v=render(wrap(governance({...row,governance_status:'draft'})));
 await menu('Run Security Review');await waitFor(()=>expect(m.updated).toHaveBeenCalledOnce());v.rerender(wrap(governance({...row,workspace_revision:8,governance_status:'draft'})));await menu('Run Security Review');await waitFor(()=>expect(m.updated).toHaveBeenCalledTimes(2));expect(m.review).toHaveBeenCalledOnce();
 v.rerender(wrap(governance({...row,workspace_revision:9,governance_status:'draft'})));m.review.mockResolvedValue({success:true,receipt:{...governanceReceipt,revision:'10',governance_status:'draft'}});await menu('Run Security Review');await waitFor(()=>expect(m.review).toHaveBeenCalledTimes(2));expect(m.review.mock.calls[1]).toEqual([1,{revision:'9',operationId:expect.any(String)}]);expect(m.review.mock.calls[1][1].operationId).not.toBe(m.review.mock.calls[0][1].operationId);
});
it('failed effects remain read-only even when newer authoritative props allow a different action',async()=>{
 m.business.mockResolvedValue({data:governanceReceipt,error:null});m.updated.mockImplementationOnce(()=>{throw Error('PRIVATE CALLBACK');});const v=render(wrap(governance()));await menu('Approve');await screen.findByText(/Saved, but/);v.rerender(wrap(governance({...row,workspace_revision:9,governance_status:'approved'})));
 await menu('Publish');await waitFor(()=>expect(m.updated).toHaveBeenCalledTimes(2));expect(m.business).toHaveBeenCalledOnce();expect(m.publish).not.toHaveBeenCalled();
 m.business.mockResolvedValue({data:{...governanceReceipt,revision:'10',governance_status:'published'},error:null});await menu('Publish');await waitFor(()=>expect(m.publish).toHaveBeenCalledOnce());expect(m.business.mock.calls[1][1]).toMatchObject({p_action:'publish',p_revision:'9'});
});
it('new-version destination revision never replaces the unchanged source revision for another action',async()=>{
 m.business.mockResolvedValueOnce({data:{...governanceReceipt,id:2,revision:'1',governance_status:'draft'},error:null}).mockResolvedValueOnce({data:governanceReceipt,error:null});const v=render(wrap(governance()));await menu('Create New Version');await waitFor(()=>expect(m.created).toHaveBeenCalledOnce());expect(m.created.mock.calls[0][0].id).toBe(2);
 v.rerender(wrap(governance({...row})));await menu('Approve');await waitFor(()=>expect(m.business).toHaveBeenCalledTimes(2));expect(m.business.mock.calls[1][1]).toMatchObject({p_id:1,p_revision:'7',p_action:'approve'});expect(m.business.mock.calls[1][1].p_operation).not.toBe(m.business.mock.calls[0][1].p_operation);
});
for(const failedRead of [false,true])it(`new-version replay retains admitted source revision through refreshed props and ${failedRead?'failed':'successful'} read`,async()=>{
 m.business.mockResolvedValueOnce(fail('40003')).mockResolvedValueOnce({data:{...governanceReceipt,id:2,revision:'1',governance_status:'draft'},error:null}).mockResolvedValueOnce({data:{...governanceReceipt,id:3,revision:'1',governance_status:'draft'},error:null});const v=render(wrap(governance()));await menu('Create New Version');await screen.findByText(/Change unconfirmed/i);
 v.rerender(wrap(governance({...row,workspace_revision:9})));if(failedRead)m.load.mockResolvedValueOnce({success:false});await click('Retry last action / reload saved result');
 if(failedRead){await screen.findByText(/Saved, but/);await click('Retry last action / reload saved result');}
 await waitFor(()=>expect(m.created).toHaveBeenCalledOnce());expect(m.business.mock.calls[1]).toEqual(m.business.mock.calls[0]);expect(m.created.mock.calls[0][0].id).toBe(2);
 // The synthetic server admits a later copy after intervening lineage work.
 // Revision9 is newer than the admitted source7, not the replay render's9.
 await menu('Create New Version');await waitFor(()=>expect(m.business).toHaveBeenCalledTimes(3));expect(m.business.mock.calls[2][1]).toMatchObject({p_id:1,p_revision:'9',p_action:'new_version'});expect(m.business.mock.calls[2][1].p_operation).not.toBe(m.business.mock.calls[0][1].p_operation);await waitFor(()=>expect(m.created.mock.calls[1][0].id).toBe(3));
});
for(const code of ['40003','08007'])it(`settings real helper ${code} then known rejection preserves tuple and confirmed refresh`,async()=>{
 m.business.mockResolvedValueOnce(fail(code)).mockResolvedValueOnce(fail('40P01'));m.toast.mockImplementation(()=>{throw Error('PRIVATE TOAST');});
 render(wrap(page()));await click('Save Settings');await screen.findByText(/Save unconfirmed/i);await click('Save Settings');await screen.findByText(/earlier settings save is still unconfirmed/i);expect(m.business).toHaveBeenCalledTimes(2);
 fireEvent.change(screen.getByRole('textbox',{name:/App Name/}),{target:{value:'Changed'}});await click('Save Settings');expect(m.business).toHaveBeenCalledTimes(2);
 fireEvent.change(screen.getByRole('textbox',{name:/App Name/}),{target:{value:settings.app_name}});await click('Save Settings');await waitFor(()=>expect(m.refresh).toHaveBeenCalledOnce());expect(m.business.mock.calls[2]).toEqual(m.business.mock.calls[0]);expect(m.business.mock.calls[0][0]).toBe('save_branding_configuration');
 await click('Save Settings');expect(m.business).toHaveBeenCalledTimes(3);expect(document.body.textContent).not.toContain('PRIVATE');
});
for(const kind of ['profile','template'] as const)for(const create of [false,true])it(`${kind} ${create?'create':'edit'} uses real helper and saves once across acknowledgement failure`,async()=>{
 m.business.mockResolvedValueOnce(fail('40003')).mockResolvedValueOnce(fail('40001'));m.ackFails=true;
 if(kind==='profile')m.load.mockImplementation(async(id:number)=>({success:true,data:{...profile,id,workspace_revision:8}}));
 render(wrap(kind==='profile'?<BrandingProfileForm open profile={create?null:profile} canUpload={false} onOpenChange={()=>{}} onSaved={m.updated}/>:<TemplateForm open template={create?null:row} profiles={[]} onOpenChange={()=>{}} onSaved={m.updated}/>));
 if(create){fireEvent.change(screen.getByRole('textbox',{name:'Code'}),{target:{value:'NEW_TEST'}});fireEvent.change(screen.getByRole('textbox',{name:kind==='profile'?'Profile Name':'Name'}),{target:{value:'Created'}});if(kind==='profile'){await screen.findByText('A — Company A');fireEvent.change(screen.getByLabelText('Issuing Company'),{target:{value:'1'}});}}
 const button=create?'Add':'Save';await click(button);await screen.findByText(/Save unconfirmed/i);await click(button);await screen.findByText(/earlier save is still unconfirmed/i);await click(button);
 await screen.findByText(/Saved, but/);expect(m.business).toHaveBeenCalledTimes(3);expect(m.business.mock.calls[2]).toEqual(m.business.mock.calls[0]);expect(m.business.mock.calls[0][0]).toBe(kind==='profile'?'save_branding_configuration':'save_template_configuration');
 m.ackFails=false;await click(kind==='profile'?'Reload saved profile':'Reload saved template');await waitFor(()=>expect(m.updated).toHaveBeenCalledOnce());expect(m.business).toHaveBeenCalledTimes(3);expect(document.body.textContent).not.toContain('PRIVATE');
});
it('actual governance keeps admitted approve after refused reject and later known rejection',async()=>{
 m.business.mockResolvedValueOnce(fail('40003')).mockResolvedValueOnce(fail('42501')).mockResolvedValue({data:governanceReceipt,error:null});render(wrap(governance()));
 await menu('Approve');await screen.findByText(/Change unconfirmed/i);await menu('Reject');fireEvent.change(screen.getByRole('textbox',{name:/reason/i}),{target:{value:'Other decision'}});await click('Confirm');await screen.findByText(/previous change is unconfirmed/i);expect(m.reject).not.toHaveBeenCalled();
 await click('Cancel');await click('Discard changes');await click('Retry last action / reload saved result');await screen.findByText(/earlier change is still unconfirmed/i);expect(m.business).toHaveBeenCalledTimes(2);await click('Retry last action / reload saved result');await waitFor(()=>expect(m.updated).toHaveBeenCalledOnce());expect(m.business.mock.calls[2]).toEqual(m.business.mock.calls[0]);expect(m.business.mock.calls[0][0]).toBe('transition_report_template');expect(m.business.mock.calls[2][1]).toMatchObject({p_id:1,p_action:'approve',p_note:null,p_revision:'7',p_actor:41,p_session:'synthetic-session'});
});
it('new-version confirmation survives callback and acknowledgement faults without copying again',async()=>{
 m.business.mockResolvedValue({data:{...governanceReceipt,id:2,revision:'1',governance_status:'draft'},error:null});m.created.mockImplementationOnce(()=>{throw Error('PRIVATE CALLBACK');});m.ackFails=true;render(wrap(governance()));
 await menu('Create New Version');await screen.findByText(/Saved, but/);expect(m.created.mock.calls[0][0].id).toBe(2);m.ackFails=false;await click('Retry last action / reload saved result');await waitFor(()=>expect(m.created).toHaveBeenCalledTimes(2));expect(m.business).toHaveBeenCalledOnce();expect(m.load).toHaveBeenNthCalledWith(2,2);expect(document.body.textContent).not.toContain('PRIVATE');
});
it('published parent callback failure cannot skip the confirmed child callback or cause republish',async()=>{
 m.business.mockResolvedValue({data:{...governanceReceipt,governance_status:'published'},error:null});m.load.mockImplementation(async(id:number)=>({success:true,data:{...row,id,parent_template_id:id===1?3:null,governance_status:id===1?'published':'archived'}}));m.updated.mockImplementationOnce(()=>{throw Error('PRIVATE PARENT');});render(wrap(governance({...row,governance_status:'approved'})));
 await menu('Publish');await screen.findByText(/Saved, but/);expect(m.updated.mock.calls.map(call=>call[0].id)).toEqual([3,1]);await click('Retry last action / reload saved result');await waitFor(()=>expect(m.updated).toHaveBeenCalledTimes(4));expect(m.business).toHaveBeenCalledOnce();
});
for(const stage of ['prepare','finalize'] as const)it(`asset real ${stage} failure preserves actual File and complete RPC identity`,async()=>{
 let calls=0;m.business.mockImplementation(async(name:string)=>{if(name==='prepare_branding_asset_change'&&stage==='finalize')return {data:{status:'prepared',path:'report/company-1/profile-1/report_logo/v1.png',version:1},error:null};calls++;return calls===1?fail('08007'):calls===2?fail('40P01'):{data:stage==='prepare'?{status:'complete',receipt:{...receipt,parent_revision:'8'}}:{...receipt,parent_revision:'8'},error:null};});
 render(wrap(asset()));const file=new File(['original'],'original.png',{type:'image/png'});fireEvent.change(screen.getByLabelText('Choose Report Logo file'),{target:{files:[file]}});await click('Retry unchanged asset operation');await screen.findByText(/earlier asset save is still unconfirmed/i);await click('Retry unchanged asset operation');await waitFor(()=>expect(m.updated).toHaveBeenCalledOnce());
 const bodies=m.upload.mock.calls.map(call=>call[0] as FormData);for(const body of bodies){expect(body.get('file')).toBe(file);expect(body.get('metadata')).toBe(bodies[0].get('metadata'));expect(body.get('contract')).toBe(bodies[0].get('contract'));}
 const deciding=m.business.mock.calls.filter(call=>call[0]===`${stage}_branding_asset_change`);expect(deciding).toHaveLength(3);expect(deciding[2]).toEqual(deciding[0]);expect(m.storage).toHaveBeenCalledTimes(stage==='finalize'?3:0);
});
it('asset retirement helper retries only the original contract through unknown then known',async()=>{
 m.business.mockResolvedValueOnce(fail('40003')).mockResolvedValueOnce(fail('40001')).mockResolvedValue({data:{status:'complete',receipt:{...receipt,parent_revision:'8'}},error:null});render(wrap(<BrandingAssetUploadCard label="Logo" description="Synthetic" scope="report" brandingProfileId={1} ownerCompanyId={1} assetType="report_logo" parentRevision="7" asset={{id:1,workspaceRevision:'7',versionNo:1,updatedAt:'2026-10-13'}} canUpload onChanged={m.updated}/>));
 await click('Deactivate Logo');await click('Deactivate');await click('Retry unchanged asset operation');await screen.findByText(/earlier asset save is still unconfirmed/i);await click('Retry unchanged asset operation');await waitFor(()=>expect(m.updated).toHaveBeenCalledOnce());expect(m.business.mock.calls[2]).toEqual(m.business.mock.calls[0]);expect(m.business.mock.calls[0][0]).toBe('retire_branding_asset_change');
});
it('history transient failure has one explicit read-only retry and safe details',async()=>{
 m.history.mockRejectedValue(Error('PRIVATE HISTORY'));render(wrap(<TemplateGovernanceHistoryDialog template={row} open onOpenChange={()=>{}}/>));
 // StrictMode retires the first cache activation and admits its replacement.
 // Both mounted reads fail; retry:false must leave their count exactly two.
 await screen.findByRole('alert');expect(m.history.mock.calls).toEqual([[1],[1]]);expect(screen.queryByText(/No governance events/)).toBeNull();
 m.history.mockResolvedValueOnce({success:true,data:[{id:1,template_id:1,event_type:'template_approved',occurred_at:'2026-10-13',notes:null,payload_json:{revision:'8',secret:'PRIVATE PAYLOAD'}}]});
 await click('Retry governance history');await screen.findByText('Record revision 8');expect(m.history.mock.calls).toEqual([[1],[1],[1]]);expect(m.business).not.toHaveBeenCalled();expect(document.body.textContent).not.toContain('PRIVATE');
});
it('settings account A to B to A retires the old result even with identical record identity',async()=>{
 let resolve!:(value:unknown)=>void;m.business.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));const v=render(wrap(page()));await click('Save Settings');await waitFor(()=>expect(m.business).toHaveBeenCalledOnce());v.rerender(wrap(page(),'B'));v.rerender(wrap(page(),'A'));await act(async()=>resolve({data:receipt,error:null}));expect(m.toast).not.toHaveBeenCalled();expect(m.refresh).not.toHaveBeenCalled();await click('Save Settings');await waitFor(()=>expect(m.refresh).toHaveBeenCalledOnce());expect(m.business).toHaveBeenCalledTimes(2);
});
it('late history reads cannot populate another account and template',async()=>{
 const resolves:Array<(r:unknown)=>void>=[];m.history.mockImplementation(()=>new Promise(resolve=>resolves.push(resolve)));
 const history=(template:ReportTemplate)=><TemplateGovernanceHistoryDialog template={template} open onOpenChange={()=>{}}/>;
 const v=render(wrap(history(row),'A'));await waitFor(()=>expect(m.history.mock.calls).toEqual([[1],[1]]));v.rerender(wrap(history({...row,id:2}),'B'));await waitFor(()=>expect(m.history.mock.calls).toEqual([[1],[1],[2],[2]]));
 const event=(id:number,notes:string)=>({success:true,data:[{id,template_id:id,event_type:'template_approved',occurred_at:'2026-10-13',notes,payload_json:{revision:'8'}}]});
 await act(async()=>{resolves[2](event(2,'Current B history'));resolves[3](event(2,'Current B history'));});await screen.findByText('Current B history');
 await act(async()=>{resolves[0](event(1,'Retired A history'));resolves[1](event(1,'Retired A history'));});expect(screen.queryByText('Retired A history')).toBeNull();expect(screen.getByText('Current B history')).toBeTruthy();expect(m.business).not.toHaveBeenCalled();
});
for(const kind of ['profile','template'] as const)it(`${kind} confirmed notification and callback faults are independent and reload only`,async()=>{
 if(kind==='profile')m.load.mockImplementation(async(id:number)=>({success:true,data:{...profile,id}}));m.toast.mockImplementation(()=>{throw Error('PRIVATE TOAST');});m.updated.mockImplementationOnce(()=>{throw Error('PRIVATE CALLBACK');});
 render(wrap(kind==='profile'?<BrandingProfileForm open profile={profile} canUpload={false} onOpenChange={()=>{}} onSaved={m.updated}/>:<TemplateForm open template={row} profiles={[]} onOpenChange={()=>{}} onSaved={m.updated}/>));await click('Save');await screen.findByText(/Saved, but/);expect(m.updated).toHaveBeenCalledOnce();
 m.toast.mockReset();await click(kind==='profile'?'Reload saved profile':'Reload saved template');await waitFor(()=>expect(m.updated).toHaveBeenCalledTimes(2));expect(m.business).toHaveBeenCalledOnce();expect(document.body.textContent).not.toContain('PRIVATE');
});
for(const kind of ['profile','template'] as const)it(`${kind} first known rejection allows corrected entries with a new operation`,async()=>{
 m.business.mockResolvedValueOnce(fail('40001'));if(kind==='profile')m.load.mockImplementation(async(id:number)=>({success:true,data:{...profile,id}}));
 render(wrap(kind==='profile'?<BrandingProfileForm open profile={profile} canUpload={false} onOpenChange={()=>{}} onSaved={m.updated}/>:<TemplateForm open template={row} profiles={[]} onOpenChange={()=>{}} onSaved={m.updated}/>));await click('Save');await screen.findByText(/rolled back/i);
 fireEvent.change(screen.getByRole('textbox',{name:kind==='profile'?'Profile Name':'Name'}),{target:{value:'Corrected'}});await click('Save');await waitFor(()=>expect(m.updated).toHaveBeenCalledOnce());expect(m.business).toHaveBeenCalledTimes(2);expect(m.business.mock.calls[1][1].p_operation).not.toBe(m.business.mock.calls[0][1].p_operation);
});
it('governance record A to B to A retires an old authoritative read',async()=>{
 let resolve!:(value:unknown)=>void;m.business.mockResolvedValue({data:governanceReceipt,error:null});m.load.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));const v=render(wrap(governance()));await menu('Approve');await waitFor(()=>expect(m.load).toHaveBeenCalledOnce());v.rerender(wrap(governance({...row,id:2})));v.rerender(wrap(governance()));await act(async()=>resolve({success:true,data:row}));expect(m.updated).not.toHaveBeenCalled();expect(m.toast).not.toHaveBeenCalled();await menu('Approve');await waitFor(()=>expect(m.updated).toHaveBeenCalledOnce());
});
