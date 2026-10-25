// @vitest-environment jsdom
import '../f05/setup';
vi.mock('@/components/erp/export/erp-export-menu',()=>({ERPExportMenu:()=>null}));
import { act, cleanup, fireEvent, render as renderUI, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createWorkspaceDraftStore } from '@/lib/workspace/workspace-draft-store';
import type { AuthContext } from '@/lib/rbac/check';
const ctx=vi.hoisted(()=>({store:null as ReturnType<typeof createWorkspaceDraftStore>|null, save:vi.fn(), sigSave:vi.fn(), db:vi.fn(), dispatch:vi.fn(), markDirty:vi.fn()}));
vi.mock('next/navigation',()=>({usePathname:()=>'/test',useRouter:()=>({refresh:vi.fn()})}));
vi.mock('@/components/workspace/workspace-provider',()=>({useWorkspaceContext:()=>({state:{activeTabId:'owner',tabs:[{id:'owner',route:'/test'}]},dispatch:ctx.dispatch})}));
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>ctx.store}));
vi.mock('@/hooks/use-workspace-form-navigation',()=>({useWorkspaceFormNavigation:()=>({activeTab:{id:'owner'},markDirty:ctx.markDirty,closeTab:vi.fn(),forceCloseActiveTab:vi.fn(),updateTabRoute:vi.fn(),renameTab:vi.fn(),isTabActive:()=>true})}));
vi.mock('@/components/workspace/erp-record-workspace-form',()=>({ERPRecordWorkspaceForm:({children,onSave,isDirty,isSubmitting}:any)=><div>{children}<output>{isDirty?'Unsaved':'Clean'}</output><button disabled={isSubmitting} onClick={onSave}>Test save</button></div>,ERPRecordSectionPanel:({children}:any)=><section>{children}</section>}));
vi.mock('@/features/dms/entity-documents',()=>({DmsEntityDocumentsTab:()=>null}));
vi.mock('@/components/erp/geography/country-select',()=>({CountrySelect:({value,onValueChange}:any)=><select aria-label="Country" value={value??''} onChange={e=>onValueChange(e.target.value?Number(e.target.value):null)}><option value="">Clear</option><option value="1">One</option><option value="2">Two</option></select>}));
vi.mock('@/components/erp/geography/emirate-select',()=>({EmirateSelect:({value,onValueChange}:any)=><select aria-label="Emirate" value={value??''} onChange={e=>onValueChange(e.target.value?Number(e.target.value):null)}><option value="">Clear</option><option value="10">Ten</option><option value="20">Twenty</option></select>}));
vi.mock('@/components/erp/geography/city-select',()=>({CitySelect:({value,onValueChange}:any)=><select aria-label="City" value={value??''} onChange={e=>onValueChange(e.target.value?Number(e.target.value):null)}><option value="">Clear</option><option value="100">Hundred</option></select>}));
vi.mock('@/components/erp/geography/area-zone-select',()=>({AreaZoneSelect:({value,onValueChange}:any)=><select aria-label="Area" value={value??''} onChange={e=>onValueChange(e.target.value?Number(e.target.value):null)}><option value="">Clear</option><option value="1000">Thousand</option></select>}));
vi.mock('@/server/actions/common-master-data/work-sites',()=>({createWorkSite:(data:unknown)=>ctx.save(data),updateWorkSite:(data:unknown)=>ctx.save(data)}));
vi.mock('@/server/actions/branches',()=>({createBranch:(data:unknown)=>ctx.save(data),updateBranch:(data:unknown)=>ctx.save(data)}));
vi.mock('@/server/actions/organizations',()=>({createOrganization:(data:unknown)=>ctx.save(data),updateOrganization:(data:unknown)=>ctx.save(data)}));
vi.mock('@/server/actions/common-master-data/owner-company-signatories',()=>({listCompanySignatories:vi.fn(),createCompanySignatory:(data:unknown)=>ctx.sigSave(data),updateCompanySignatory:(data:unknown)=>ctx.sigSave(data),softDeleteCompanySignatory:vi.fn()}));
vi.mock('@tanstack/react-query',async importOriginal=>({
 ...await importOriginal<typeof import('@tanstack/react-query')>(),
 // Lookup rows stay offline; invalidation, cancellation and batching use the real cache.
 useQuery:()=>({data:[],isPending:false,isError:false,refetch:vi.fn()}),
}));
vi.mock('@/features/ai/common/compliance-checker',()=>({ComplianceFindingAlert:()=>null}));
vi.mock('@/features/ai/common/duplicate-detection',()=>({DuplicateCandidateAlert:()=>null}));
vi.mock('@/features/ai/common/field-suggestions',()=>({AiFieldSuggestionsPanel:()=>null}));
vi.mock('@/features/ai/common/risk-scoring',()=>({RiskScoreAlert:()=>null}));
vi.mock('@/features/organizations/organization-branding-section',()=>({OrganizationBrandingSection:()=>null}));
vi.mock('@/components/erp/finance-basics/currency-select',()=>({CurrencySelect:({value,onValueChange}:any)=><select aria-label="Currency" value={value??''} onChange={e=>onValueChange(e.target.value?Number(e.target.value):null)}><option value="">Clear</option><option value="5">Currency five</option><option value="6">Currency six</option></select>}));
vi.mock('@/lib/supabase/client',()=>({createClient:()=>({from:(table:string)=>{const q:any={select:()=>q,eq:()=>q,single:()=>ctx.db(table,'single'),maybeSingle:()=>ctx.db(table,'single'),then:(resolve:any,reject:any)=>Promise.resolve(ctx.db(table,'list')).then(resolve,reject)};return q;}})}));
import { WorkSiteWorkspaceForm } from '@/features/common-master-data/work-sites/work-site-workspace-form';
import { BranchWorkspaceForm } from '@/features/branches/branch-workspace-form';
import { OrganizationWorkspaceForm } from '@/features/organizations/organization-workspace-form';
const site:any={id:50,site_code:'SYNTHETIC',site_name:'Synthetic',owner_company_id:1,site_type:'office',country_id:1,emirate_id:10,city_id:100};
const branch:any={id:60,workspace_revision:1,branch_code:'SYNTHETIC',branch_name_en:'Synthetic',owner_company_id:1,emirate:'Old Emirate',city:'Old City',area:'Old Area'};
const companies:any=[{id:1,legal_name_en:'Synthetic company',company_code:'SYN'}];
const auth:any={permissionCodes:[]};
// These tests exercise authorized editors' draft/lookup failures, not permission denial.
// Keep branch and organization grants on their precise fixture scopes.
const administrationAuth:AuthContext={profile:{id:1} as AuthContext['profile'],email:null,accountStatus:'active',isAccountActive:true,
 roleCodes:['branch_editor','organization_editor'],permissionCodes:['branches.manage','organizations.manage'],globalPermissionCodes:[],roleAssignments:[
  {roleId:1,roleCode:'branch_editor',ownerCompanyId:1,branchId:60,permissionCodes:['branches.manage']},
  {roleId:2,roleCode:'organization_editor',ownerCompanyId:50,branchId:null,permissionCodes:['organizations.manage']},
 ]};
// Only these child-positive cases require the register's existing GLOBAL read
// and manage admission. Parent/branch fixtures retain their scoped grants.
const signatoryAuth:AuthContext={...administrationAuth,permissionCodes:[...administrationAuth.permissionCodes,'organizations.view'],globalPermissionCodes:['organizations.view','organizations.manage'],roleAssignments:[...administrationAuth.roleAssignments!,{roleId:3,roleCode:'signatory_editor',ownerCompanyId:null,branchId:null,permissionCodes:['organizations.view','organizations.manage']}]};
let queryClient:QueryClient;
const render=(node:ReactElement)=>renderUI(node,{wrapper:({children})=><QueryClientProvider client={queryClient}>{children}</QueryClientProvider>});
beforeEach(()=>{
 queryClient=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
 vi.spyOn(console,'error');vi.spyOn(console,'warn');
});
beforeEach(()=>{ctx.store=createWorkspaceDraftStore();ctx.save.mockReset().mockImplementation(async(data:{id?:number})=>({success:true,data:{id:data.id??50,revision:'2',changed:true,replayed:false}}));ctx.markDirty.mockReset();ctx.db.mockReset().mockImplementation((table,kind)=>kind==='single'?{data:table==='currencies'?{id:5,currency_code:'SYN'}:{name_en:'Resolved'},error:null}:{data:table==='emirates'?[{id:10,country_id:1,name_en:'Old Emirate',emirate_code:'OLD'}]:table==='cities'?[{id:100,country_id:1,emirate_id:10,name_en:'Old City',city_code:'OLD'}]:[{id:1000,city_id:100,name_en:'Old Area',area_code:'OLD'}],error:null});});
afterEach(async()=>{
 cleanup();await Promise.resolve();
 try{expect(console.error).not.toHaveBeenCalled();expect(console.warn).not.toHaveBeenCalled();}
 finally{queryClient.clear();vi.restoreAllMocks();}
});
it('organization child validates independently without triggering the parent save',async()=>{
 const ui=org(signatoryAuth);fireEvent.click(ui.getByRole('button',{name:'Add Signatory'}));fireEvent.click(ui.getByRole('button',{name:'Save',exact:true}));expect(document.activeElement).toBe(ui.getByLabelText('Full Name *'));expect(ctx.save).not.toHaveBeenCalled();expect(ctx.sigSave).not.toHaveBeenCalled();
});
it('organization child keeps its entries after request rejection and respects an inactive unchecked flag',async()=>{
 ctx.sigSave.mockReset().mockRejectedValueOnce(Error('offline'));const ui=org(signatoryAuth);fireEvent.click(ui.getByRole('button',{name:'Add Signatory'}));fireEvent.change(ui.getByLabelText('Full Name *'),{target:{value:'F04 CHILD ACCEPTANCE'}});fireEvent.click(ui.getByRole('checkbox',{name:'Active',exact:true}));fireEvent.change(document.getElementById('sig_notes')!,{target:{value:'Retained notes'}});fireEvent.click(ui.getByRole('button',{name:'Save',exact:true}));await waitFor(()=>expect(ctx.sigSave).toHaveBeenCalledTimes(1));expect(ctx.sigSave.mock.calls[0][0]).toMatchObject({full_name:'F04 CHILD ACCEPTANCE',is_active:false,notes:'Retained notes'});expect((ui.getByLabelText('Full Name *') as HTMLInputElement).value).toBe('F04 CHILD ACCEPTANCE');expect(ctx.save).not.toHaveBeenCalled();
});
const worksite=()=>render(<WorkSiteWorkspaceForm site={site} mode="edit" authContext={auth} companies={companies}/>);
const branchForm=()=>render(<BranchWorkspaceForm branch={branch} mode="edit" authContext={administrationAuth} companies={companies}/>);
it('branch stored relationship IDs win over ambiguous legacy text without rewriting them on unrelated save',async()=>{
 ctx.db.mockResolvedValue({data:{country_id:1,name_en:'Stored region'},error:null});
 const ui=render(<BranchWorkspaceForm branch={{...branch,emirate_id:20,city_id:100,area_zone_id:1000}} mode="edit" authContext={administrationAuth} companies={companies}/>);
 await waitFor(()=>expect((ui.getByLabelText('Emirate') as HTMLSelectElement).value).toBe('20'));
 expect((ui.getByLabelText('Country') as HTMLSelectElement).value).toBe('1');
 fireEvent.click(ui.getByText('Test save'));await waitFor(()=>expect(ctx.save).toHaveBeenCalled());
 expect(ctx.save.mock.calls[0][0]).not.toHaveProperty('emirate_id');expect(ctx.save.mock.calls[0][0]).not.toHaveProperty('city_id');
});
it('branch explicit geography clearing is submitted as null IDs and survives a remount',async()=>{
 const first=branchForm();await waitFor(()=>expect((first.getByLabelText('City') as HTMLSelectElement).value).toBe('100'));
 fireEvent.change(first.getByLabelText('Emirate'),{target:{value:''}});first.unmount();
 const next=branchForm();fireEvent.click(next.getByText('Test save'));await waitFor(()=>expect(ctx.save).toHaveBeenCalled());
 expect(ctx.save.mock.calls[0][0]).toMatchObject({emirate_id:null,city_id:null,area_zone_id:null,emirate:null,city:null,area:null});
});
const organization:any={id:50,workspace_revision:1,legal_name_en:'Synthetic',company_code:'SYN',default_currency:'SYN',country_id:1,emirate_id:10,city_id:100,area_zone_id:1000,office_emirate_id:10,office_city_id:100};
const org=(context=administrationAuth)=>render(<OrganizationWorkspaceForm organization={organization} mode="edit" authContext={context}/>);
it('ordinary scoped company editor does not inherit administrator signatory authority',()=>{const ui=org();expect(ui.queryByRole('button',{name:'Add Signatory'})).toBeNull();expect(ui.getByRole('alert').textContent).toContain('Signatory read access for this company is required.');expect(ctx.save).not.toHaveBeenCalled();});
it('organization draft restores geography, currency and office child clears independently',async()=>{
 const first=org();await waitFor(()=>expect((first.getByLabelText('Currency') as HTMLSelectElement).value).toBe('5'));
 fireEvent.change(first.getByLabelText('Country'),{target:{value:'2'}});fireEvent.change(first.getByLabelText('Currency'),{target:{value:'6'}});fireEvent.change(first.getAllByLabelText('Emirate')[1],{target:{value:'20'}});first.unmount();
 const next=org();expect((next.getByLabelText('Country') as HTMLSelectElement).value).toBe('2');expect((next.getAllByLabelText('City')[0] as HTMLSelectElement).value).toBe('');expect((next.getAllByLabelText('City')[1] as HTMLSelectElement).value).toBe('');expect((next.getByLabelText('Currency') as HTMLSelectElement).value).toBe('6');
});
it('organization cleared currency cannot silently become AED or the original saved currency',async()=>{
 ctx.store!.writeField('draft:tab:owner:organization-workspace-form','currency_id','');const ui=org();fireEvent.click(ui.getByText('Test save'));await waitFor(()=>expect((ui.getByText('Test save') as HTMLButtonElement).disabled).toBe(false));expect(ctx.save).not.toHaveBeenCalled();expect(ui.getByText('Unsaved')).toBeTruthy();
});
it('organization missing default currency is distinct from a failed lookup',async()=>{
 ctx.db.mockResolvedValue({data:null,error:null});const ui=org();await ui.findByText('The default currency is unavailable. Choose an active currency before saving.');expect(ctx.save).not.toHaveBeenCalled();
});
it('organization lookup failure is visible and choosing a currency clears its notice',async()=>{
 ctx.db.mockResolvedValue({data:null,error:{message:'Synthetic unavailable'}});const ui=org();await ui.findByText('The default currency could not be loaded. Choose an available currency or reload this record.');fireEvent.change(ui.getByLabelText('Currency'),{target:{value:'6'}});expect(ui.queryByText(/The default currency could not be loaded/)).toBeNull();expect(ctx.save).not.toHaveBeenCalled();
});
it('organization never writes a stale currency code when lookup verification fails',async()=>{
 ctx.store!.writeField('draft:tab:owner:organization-workspace-form','currency_id','6');ctx.db.mockResolvedValue({data:null,error:{message:'offline'}});const ui=org();fireEvent.click(ui.getByText('Test save'));await waitFor(()=>expect((ui.getByText('Test save') as HTMLButtonElement).disabled).toBe(false));expect(ctx.save).not.toHaveBeenCalled();expect(ui.getByText('Unsaved')).toBeTruthy();
});
it('organization save synchronizes cleared geography IDs and legacy text',async()=>{
 for(const field of ['country_id','emirate_id','city_id','area_zone_id'])ctx.store!.writeField('draft:tab:owner:organization-workspace-form',field,'');ctx.store!.writeField('draft:tab:owner:organization-workspace-form','currency_id','6');
 const ui=org();fireEvent.click(ui.getByText('Test save'));await waitFor(()=>expect(ctx.save).toHaveBeenCalled());expect(ctx.save.mock.calls[0][0]).toMatchObject({country_id:null,emirate_id:null,city_id:null,area_zone_id:null,country:null,emirate:null,city:null,area:null,default_currency:'SYN'});
});
it('work-site country cascade survives a remount with both descendants explicitly cleared',()=>{
 const first=worksite();fireEvent.change(first.getByLabelText('Country'),{target:{value:'2'}});expect(first.getByText('Unsaved')).toBeTruthy();first.unmount();
 const next=worksite();expect((next.getByLabelText('Country') as HTMLSelectElement).value).toBe('2');expect((next.getByLabelText('Emirate') as HTMLSelectElement).value).toBe('');expect((next.getByLabelText('City') as HTMLSelectElement).value).toBe('');
});
it('work-site emirate cascade retains country and clears the previously selected city',()=>{
 const first=worksite();fireEvent.change(first.getByLabelText('Emirate'),{target:{value:'20'}});first.unmount();const next=worksite();expect((next.getByLabelText('Country') as HTMLSelectElement).value).toBe('1');expect((next.getByLabelText('Emirate') as HTMLSelectElement).value).toBe('20');expect((next.getByLabelText('City') as HTMLSelectElement).value).toBe('');
});
it('work-site checkbox false is restored rather than the server true',()=>{
 ctx.store!.writeField('draft:tab:owner:work-site-workspace-form','is_restricted_area','false');
 const ui=render(<WorkSiteWorkspaceForm site={{...site,is_restricted_area:true}} mode="edit" authContext={auth} companies={companies}/>);
 expect(ui.container.querySelector('[name="is_restricted_area"]')).toBeTruthy();expect(ui.getByRole('checkbox',{name:/Restricted Area/i}).getAttribute('aria-checked')).toBe('false');
});
it('failed work-site request retains controlled geography and releases the retry guard',async()=>{
 ctx.save.mockRejectedValueOnce(new Error('offline'));const ui=worksite();fireEvent.change(ui.getByLabelText('Country'),{target:{value:'2'}});fireEvent.click(ui.getByText('Test save'));
 await waitFor(()=>expect((ui.getByText('Test save') as HTMLButtonElement).disabled).toBe(false));expect(ui.getByText('Unsaved')).toBeTruthy();fireEvent.click(ui.getByText('Test save'));await waitFor(()=>expect(ctx.save).toHaveBeenCalledTimes(2));expect(ctx.save.mock.calls[1][0]).toMatchObject({country_id:2,emirate_id:null,city_id:null});
});
it('late legacy branch lookups do not overwrite restored cleared geography',async()=>{
 for(const field of ['country_id','emirate_id','city_id','area_zone_id'])ctx.store!.writeField('draft:tab:owner:branch-workspace-form',field,'');
 const ui=branchForm();await waitFor(()=>expect(ctx.db).toHaveBeenCalledTimes(3));expect((ui.getByLabelText('Country') as HTMLSelectElement).value).toBe('');fireEvent.click(ui.getByText('Test save'));await waitFor(()=>expect(ctx.save).toHaveBeenCalled());expect(ctx.save.mock.calls[0][0]).toMatchObject({emirate:null,city:null,area:null});
});
it('branch user edits win over a late initializer and retained children remain cleared',async()=>{
 let release!:(v:any)=>void;const response=new Promise(resolve=>{release=resolve;});ctx.db.mockImplementationOnce(()=>response);
 const ui=branchForm();fireEvent.change(ui.getByLabelText('Country'),{target:{value:'2'}});
 await act(async()=>release({data:[{id:10,country_id:1,name_en:'Old Emirate',emirate_code:'OLD'}]}));
 await waitFor(()=>expect(ctx.db).toHaveBeenCalledTimes(3));expect((ui.getByLabelText('Country') as HTMLSelectElement).value).toBe('2');expect((ui.getByLabelText('Emirate') as HTMLSelectElement).value).toBe('');
});
it('branch lookup rejection blocks the save without a stuck spinner or losing its draft',async()=>{
 const ui=branchForm();await waitFor(()=>expect((ui.getByLabelText('Emirate') as HTMLSelectElement).value).toBe('10'));
 fireEvent.change(ui.getByLabelText('Emirate'),{target:{value:'20'}});ctx.db.mockRejectedValueOnce(new Error('lookup unavailable'));fireEvent.click(ui.getByText('Test save'));
 await waitFor(()=>expect((ui.getByText('Test save') as HTMLButtonElement).disabled).toBe(false));expect(ctx.save).not.toHaveBeenCalled();expect(ui.getByText('Unsaved')).toBeTruthy();fireEvent.click(ui.getByText('Test save'));await waitFor(()=>expect(ctx.save).toHaveBeenCalledTimes(1));
});
