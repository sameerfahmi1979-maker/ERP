// @vitest-environment jsdom
// Real party form, shared validation, comboboxes and React portal events.
// Read actions/navigation are doubles; the separate local suite proves writes.
import '../f05/setup';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {AuthContext} from '@/lib/rbac/check';
import type {Party} from '@/features/master-data/parties/party-types';
import {collectWorkspaceFieldIssues} from '@/lib/workspace/form-validation';
import {createWorkspaceDraftStore} from '@/lib/workspace/workspace-draft-store';
const owned=vi.hoisted(()=>({store:null as unknown}));
vi.mock('@/hooks/use-workspace-form-owner',()=>({useWorkspaceFormOwner:()=>({id:'party-test'})}));
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>owned.store}));
beforeEach(()=>{owned.store=createWorkspaceDraftStore();});
const m=vi.hoisted(()=>({sync:vi.fn(),create:vi.fn(),duplicates:vi.fn(),update:vi.fn(),dirty:vi.fn(),overviewDirty:false}));
vi.mock('next/navigation',()=>({useRouter:()=>({replace:vi.fn()}),usePathname:()=>'/party-test'}));
vi.mock('@/hooks/use-workspace-form-navigation',()=>({useWorkspaceFormNavigation:()=>({closeTab:vi.fn(),renameTab:vi.fn(),updateTabRoute:vi.fn(),markDirty:vi.fn(),forceCloseActiveTab:vi.fn(),activeTab:{id:'party-test'}})}));
vi.mock('@/hooks/use-workspace-form-dirty',async()=>{const {useFormDirty}=await import('@/hooks/use-form-dirty');return {useWorkspaceFormDirty:(options:Parameters<typeof useFormDirty>[0])=>{const dirty=useFormDirty(options);return {...dirty,isDirty:m.overviewDirty||dirty.isDirty};}};});
vi.mock('@/hooks/use-workspace-tab-dirty',()=>({useWorkspaceTabDirty:m.dirty}));
vi.mock('@/hooks/use-workspace-scroll-state',()=>({useWorkspaceScrollState:vi.fn()}));
vi.mock('@/hooks/use-workspace-section-state',()=>({useWorkspaceSectionState:()=>useState('basic')}));
vi.mock('@/hooks/use-workspace-form-draft',()=>({useWorkspaceFormDraft:()=>({getDraftDefault:(_:string,v:unknown)=>v??'',getDraftNullableId:(_:string,v:unknown)=>v,syncDraft:m.sync,writeDraftField:vi.fn(),clearDraft:vi.fn()})}));
vi.mock('@/features/master-data/parties/use-numbered-party-creation',()=>({useNumberedPartyCreation:()=>m.create}));
vi.mock('@tanstack/react-query',()=>({useQuery:()=>({data:[]})}));
vi.mock('@/hooks/lookups',()=>({useCountriesQuery:()=>({options:[],isLoading:false}),useEmiratesQuery:()=>({options:[],isLoading:false}),useCitiesQuery:()=>({options:[],isLoading:false}),useAreasQuery:()=>({options:[],isLoading:false})}));
vi.mock('@/components/erp/party-select',()=>({PartySelect:()=>null}));
vi.mock('@/components/erp/erp-drawer-form',async(importOriginal)=>({...await importOriginal<typeof import('@/components/erp/erp-drawer-form')>(),ERPDrawerForm:({children,isDirty}:{children:ReactNode;isDirty:boolean})=><div data-testid="drawer-dirty" data-dirty={String(isDirty)}>{children}</div>,ERPDrawerBody:({children}:{children:ReactNode})=><div>{children}</div>,ERPDrawerSection:({children}:{children:ReactNode})=><section>{children}</section>,ERPDrawerSectionNav:()=>null}));
vi.mock('@/features/ai/common/compliance-checker',()=>({ComplianceFindingAlert:()=>null}));
vi.mock('@/features/ai/common/duplicate-detection',()=>({DuplicateCandidateAlert:()=>null}));
vi.mock('@/features/ai/common/field-suggestions',()=>({AiFieldSuggestionsPanel:()=>null}));
vi.mock('@/features/ai/common/risk-scoring',()=>({RiskScoreAlert:()=>null}));
vi.mock('@/features/master-data/parties/party-addresses-tab',()=>({PartyAddressesTab:()=>null}));
vi.mock('@/features/master-data/parties/party-audit-tab',()=>({PartyAuditTab:()=>null}));
vi.mock('@/features/master-data/parties/party-bank-details-tab',()=>({PartyBankDetailsTab:()=>null}));
vi.mock('@/features/master-data/parties/party-dms-documents-tab',()=>({PartyDmsDocumentsTab:()=>null}));
vi.mock('@/features/master-data/parties/party-licenses-tab',()=>({PartyLicensesTab:()=>null}));
vi.mock('@/features/master-data/parties/party-notes-tab',()=>({PartyNotesTab:()=>null}));
vi.mock('@/features/master-data/parties/party-services-tab',()=>({PartyServicesTab:()=>null}));
vi.mock('@/features/master-data/parties/party-tax-finance-tab',()=>({PartyTaxFinanceTab:()=>null}));
vi.mock('@/features/master-data/parties/party-types-tab',()=>({PartyTypesTab:({onDirtyChange}:{onDirtyChange:(dirty:boolean)=>void})=><><input aria-label="Inline type selection" type="checkbox" onChange={()=>onDirtyChange(true)}/><button type="button" onClick={()=>onDirtyChange(true)}>Test edit types</button><button type="button" onClick={()=>onDirtyChange(false)}>Test types saved</button></>}));
vi.mock('@/features/master-data/parties/party-contacts-tab',()=>({PartyContactsTab:()=>createPortal(<form aria-label="Synthetic child"><input aria-label="Child name"/><button type="submit">Child submit</button></form>,document.body)}));
vi.mock('@/server/actions/master-data/parties',()=>({createParty:m.create,updateParty:m.update,detectPartyDuplicates:m.duplicates,getPartyNatures:async()=>({success:true,data:[]}),getPartyStatuses:async()=>({success:true,data:[]})}));
vi.mock('@/components/workspace/erp-record-workspace-form',async()=>{
 const real=await import('@/lib/workspace/form-validation');
 return {ERPRecordWorkspaceForm:({children,onSave}:{children:ReactNode;onSave:()=>void})=><div>{children}<button onClick={()=>{const f=document.getElementById('party-workspace-form') as HTMLFormElement;if(!real.collectWorkspaceFieldIssues(f).length)onSave();}}>Test save</button></div>,ERPRecordSectionPanel:({children}:{children:ReactNode})=><section data-workspace-section="basic">{children}</section>};
});
import {PartyWorkspaceForm} from '@/features/master-data/parties/party-workspace-form';
import {PartyFormDrawer} from '@/features/master-data/parties/party-form-drawer';
const ctx={profile:{id:1},isAccountActive:true,roleCodes:['system_admin'],roleAssignments:[{roleCode:'system_admin',ownerCompanyId:null,branchId:null,permissionCodes:[]}],permissionCodes:[],globalPermissionCodes:[]} as unknown as AuthContext;
beforeEach(()=>{vi.clearAllMocks();m.overviewDirty=false;m.duplicates.mockResolvedValue({success:true,data:[]});m.update.mockResolvedValue({success:false,error:'Synthetic blocked'});});afterEach(cleanup);
const open=(edit=false)=>render(<PartyWorkspaceForm mode={edit?'edit':'add'} party={edit?{id:38,workspace_revision:4,display_name:'Synthetic',legal_name_en:'Synthetic',party_code:'F06-38',party_nature_id:9,party_status_id:9,country_id:27,is_active:true} as Party:null} authContext={ctx}/>);
it.each(['workspace','drawer'])('%s cannot offer an activation change to an editor without lifecycle permission',kind=>{
 const editor={...ctx,roleCodes:['party_editor'],roleAssignments:[{roleCode:'party_editor',ownerCompanyId:null,branchId:null,permissionCodes:['master_data.parties.edit','master_data.parties.view']}],permissionCodes:['master_data.parties.edit','master_data.parties.view'],globalPermissionCodes:['master_data.parties.edit','master_data.parties.view']} as AuthContext;
 const party={id:38,workspace_revision:4,is_active:true} as Party;
 render(kind==='workspace'?<PartyWorkspaceForm mode="edit" party={party} authContext={editor}/>:<PartyFormDrawer open mode="edit" party={party} authContext={editor} onOpenChange={vi.fn()}/>);
 const control=screen.getByRole('switch',{name:'Active'});expect(control.hasAttribute('data-disabled')).toBe(true);
 const checked=control.getAttribute('aria-checked');fireEvent.click(control);expect(control.getAttribute('aria-checked')).toBe(checked);
 expect(screen.getByText(/Changing active status requires party activation permission/)).not.toBeNull();
});
it('new party creation still supports an initial inactive state',()=>{open();expect(screen.getByRole('switch',{name:'Active'}).hasAttribute('data-disabled')).toBe(false);fireEvent.click(screen.getByRole('switch',{name:'Active'}));expect(screen.getByRole('switch',{name:'Active'}).getAttribute('aria-checked')).toBe('false');});
it('all five mandatory fields participate in the shared linked validation contract',()=>{open();const issues=collectWorkspaceFieldIssues(document.getElementById('party-workspace-form') as HTMLFormElement);expect(issues.map(i=>i.label)).toEqual(['Display Name','Legal Name (English)','Party Nature','Country','Party Status']);expect(issues.every(i=>!!i.control&&i.section==='basic')).toBe(true);});
it('missing required choices cannot reach duplicate detection or mutation',()=>{open();fireEvent.change(screen.getByRole('textbox',{name:/Display Name/}),{target:{value:'Synthetic'}});fireEvent.change(screen.getByRole('textbox',{name:/Legal Name \(English\)/}),{target:{value:'Synthetic'}});fireEvent.click(screen.getByRole('button',{name:'Test save'}));expect(m.duplicates).not.toHaveBeenCalled();expect(m.create).not.toHaveBeenCalled();});
it('native parent edits still capture the parent draft',()=>{open();fireEvent.input(screen.getByRole('textbox',{name:/Display Name/}),{target:{value:'Synthetic'}});expect(m.sync).toHaveBeenCalled();});
it('portal child input never captures or dirties the parent draft',()=>{open(true);fireEvent.input(screen.getByRole('textbox',{name:'Child name'}),{target:{value:'Synthetic child edit'}});expect(m.sync).not.toHaveBeenCalled();});
it('portal child change never captures the parent draft',()=>{open(true);fireEvent.change(screen.getByRole('textbox',{name:'Child name'}),{target:{value:'Synthetic child edit'}});expect(m.sync).not.toHaveBeenCalled();});
it('a child form submission does not invoke the parent save',async()=>{open(true);fireEvent.submit(screen.getByRole('form',{name:'Synthetic child'}));await waitFor(()=>expect(m.duplicates).not.toHaveBeenCalled());expect(m.update).not.toHaveBeenCalled();});
it('overview save cannot discard unsaved type selections',async()=>{open(true);fireEvent.click(screen.getByRole('button',{name:'Test edit types'}));fireEvent.click(screen.getByRole('button',{name:'Test save'}));await waitFor(()=>expect(m.dirty).toHaveBeenLastCalledWith({isDirty:true,enabled:true}));expect(m.update).not.toHaveBeenCalled();});
it('saving child selections cannot clear the unsaved overview flag',()=>{m.overviewDirty=true;open(true);fireEvent.click(screen.getByRole('button',{name:'Test edit types'}));fireEvent.click(screen.getByRole('button',{name:'Test types saved'}));expect(m.dirty).toHaveBeenLastCalledWith({isDirty:true,enabled:true});});
it('native inline child changes belong to their own save boundary, not the overview',()=>{
 open(true);const input=screen.getByRole('checkbox',{name:'Inline type selection'});
 expect(input.closest('form')).toBeNull();fireEvent.click(input);
 expect(m.sync).not.toHaveBeenCalled();expect(m.dirty).toHaveBeenLastCalledWith({isDirty:true,enabled:true});
 fireEvent.click(screen.getByRole('button',{name:'Test types saved'}));expect(m.dirty).toHaveBeenLastCalledWith({isDirty:false,enabled:true});
});
it('native overview edits remain dirty after an independently saved inline child',()=>{
 open(true);fireEvent.input(screen.getByRole('textbox',{name:/Display Name/}),{target:{value:'Unsaved overview'}});
 fireEvent.click(screen.getByRole('checkbox',{name:'Inline type selection'}));fireEvent.click(screen.getByRole('button',{name:'Test types saved'}));
 expect(m.dirty).toHaveBeenLastCalledWith({isDirty:true,enabled:true});
});
it('drawer independently saved child input does not contaminate native overview dirty tracking',()=>{
 render(<PartyFormDrawer open mode="edit" party={{id:38,display_name:'Synthetic',legal_name_en:'Synthetic',workspace_revision:4} as Party} authContext={ctx} onOpenChange={vi.fn()}/>);
 const type=screen.getByRole('checkbox',{name:'Inline type selection'});expect(type.closest('form')).toBeNull();
 fireEvent.click(type);expect(screen.getByTestId('drawer-dirty').getAttribute('data-dirty')).toBe('true');
 fireEvent.click(screen.getByRole('button',{name:'Test types saved'}));expect(screen.getByTestId('drawer-dirty').getAttribute('data-dirty')).toBe('false');
 fireEvent.input(screen.getByRole('textbox',{name:/Display Name/}),{target:{value:'Unsaved drawer'}});
 fireEvent.click(type);fireEvent.click(screen.getByRole('button',{name:'Test types saved'}));expect(screen.getByTestId('drawer-dirty').getAttribute('data-dirty')).toBe('true');
});
it('the real parent form supplies the opening revision and advances from a confirmed edit',async()=>{
 m.update.mockResolvedValue({success:true,data:{id:38,revision:'5',changed:true,replayed:false}});open(true);
 fireEvent.change(screen.getByRole('textbox',{name:/Display Name/}),{target:{value:'First edit'}});fireEvent.click(screen.getByRole('button',{name:'Test save'}));
 await waitFor(()=>expect(m.update).toHaveBeenCalledTimes(1));expect(m.update.mock.calls[0][1]).toMatchObject({revision:'4'});
 expect(m.update.mock.calls[0][0]).not.toHaveProperty('primary_party_type_id');
 await waitFor(()=>expect(screen.getByRole('button',{name:'Test save'}).isConnected).toBe(true));
 fireEvent.change(screen.getByRole('textbox',{name:/Display Name/}),{target:{value:'Next edit'}});fireEvent.click(screen.getByRole('button',{name:'Test save'}));
 await waitFor(()=>expect(m.update).toHaveBeenCalledTimes(2));expect(m.update.mock.calls[1][1]).toMatchObject({revision:'5'});expect(m.update.mock.calls[1][0]).toMatchObject({id:38,display_name:'Next edit'});
});
it('saved nature and geography labels remain visible when the active catalogues exclude them',()=>{
 render(<PartyWorkspaceForm mode="edit" party={{id:38,display_name:'Synthetic',legal_name_en:'Synthetic',party_code:'F06-38',party_nature_id:9,party_nature_name:'Retired nature',party_status_id:9,party_status_name:'Retained status',country_id:27,country_name:'Retired country',emirate_id:4,emirate_name:'Retired region',city_id:5,city_name:'Retired city',area_zone_id:6,area_zone_name:'Retired area',is_active:false} as Party} authContext={ctx}/>);
 for(const label of ['Retired nature','Retained status','Retired country','Retired region','Retired city','Retired area'])expect(screen.getByText(`${label} (saved selection)`)).not.toBeNull();
 expect(m.update).not.toHaveBeenCalled();expect(m.sync).not.toHaveBeenCalled();
});
