// @vitest-environment jsdom
// Real form + LookupSelect + ERPCombobox. Only transport/navigation are doubles.
import '../f05/setup';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import type {ReactNode} from 'react';
import type {AuthContext} from '@/lib/rbac/check';
import type {FinanceCenterEntity} from '@/lib/master-data/finance-center-save-contract';
import type {CenterRecord} from '@/features/master-data/finance-basics/center-form-state';
const state=vi.hoisted(()=>({save:vi.fn(),error:vi.fn(),lookup:vi.fn()}));
vi.mock('@/features/master-data/finance-basics/actions',()=>Object.fromEntries(['CostCenter','ProfitCenter'].flatMap(n=>[['create'+n,state.save],['update'+n,state.save]])));
vi.mock('@/hooks/lookups',()=>({useLookupValuesQuery:state.lookup}));
vi.mock('@tanstack/react-query',()=>({useQueryClient:()=>({})}));
vi.mock('@/lib/query/invalidation',()=>({invalidateCostCenters:vi.fn(),invalidateProfitCenters:vi.fn()}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:state.error}}));
vi.mock('next/navigation',()=>({useRouter:()=>({replace:vi.fn()}),usePathname:()=>'/f06-finance-type',useSearchParams:()=>new URLSearchParams()}));
vi.mock('@/hooks/use-workspace-form-navigation',()=>({useWorkspaceFormNavigation:()=>({activeTab:null,closeTab:vi.fn(),markDirty:vi.fn()})}));
vi.mock('@/hooks/use-workspace-form-section',()=>({useWorkspaceFormSection:()=>['basic',vi.fn()]}));
vi.mock('@/hooks/use-workspace-form-draft',()=>({useWorkspaceFormDraft:()=>({getDraftDefault:(_:string,v:unknown)=>v,clearDraft:vi.fn(),writeDraftField:vi.fn(),restoredFromDraft:false})}));
vi.mock('@/components/workspace/erp-record-workspace-form',()=>({ERPRecordWorkspaceForm:({children,onSave}:{children:ReactNode;onSave?:()=>void})=><div>{children}<button onClick={onSave}>Test save</button></div>,ERPRecordSectionPanel:({children}:{children:ReactNode})=><section>{children}</section>}));
vi.mock('@/components/erp/organizations',()=>({OwnerCompanySelect:()=>null,BranchSelect:()=>null}));
vi.mock('@/components/erp/finance-basics',()=>({CostCenterSelect:()=>null,ProfitCenterSelect:()=>null}));
import {FinanceCenterWorkspaceForm} from '@/features/master-data/finance-basics/components/finance-center-workspace-form';
const auth={profile:{id:1},isAccountActive:true,globalPermissionCodes:['master_data.finance_basics.manage'],roleCodes:[],roleAssignments:[]} as unknown as AuthContext;
const input=(name:string,value:string)=>fireEvent.change(document.querySelector(`[name="${name}"]`)!,{target:{value}});
const displayed=(name:string)=>(screen.getByRole('textbox',{name,exact:true}) as HTMLInputElement).value;
beforeEach(()=>{
 vi.clearAllMocks();
 state.save.mockResolvedValue({success:true,data:{id:81,revision:'1',changed:true,replayed:false}});
 state.lookup.mockImplementation((category:string)=>({data:[{id:741,category_id:71,value_code:category.startsWith('COST')?'F06_COST':'F06_PROFIT',value_label_en:'Synthetic finance type',is_active:true}],isLoading:false,error:null}));
});
afterEach(cleanup);
for(const prefix of ['cost','profit']){
 const entity=prefix+'_centers' as FinanceCenterEntity;
 it(`${prefix}: populated type submits its stable code, not the numeric lookup ID`,async()=>{
  render(<FinanceCenterWorkspaceForm entity={entity} mode="add" authContext={auth}/>);
  input(prefix+'_center_code','F06_TYPED');input(prefix+'_center_name_en','Synthetic typed centre');
  fireEvent.click(screen.getByRole('combobox',{name:prefix+' center type code'}));
  fireEvent.click(await screen.findByRole('option',{name:'Synthetic finance type'}));
  fireEvent.click(screen.getByRole('button',{name:'Test save'}));
  await waitFor(()=>expect(state.save).toHaveBeenCalledOnce());
  expect(state.save.mock.calls[0][0][prefix+'_center_type_code']).toBe('F06_'+prefix.toUpperCase());
 });
 it(`${prefix}: persisted type reopens with its label and can be cleared deliberately`,async()=>{
  const row={id:81,workspace_revision:1,[prefix+'_center_code']:'F06_TYPED',[prefix+'_center_name_en']:'Synthetic typed centre',[prefix+'_center_type_code']:'F06_'+prefix.toUpperCase(),is_active:false,sort_order:0,created_at:'2026-10-01',updated_at:'2026-10-01'} as unknown as CenterRecord;
  render(<FinanceCenterWorkspaceForm entity={entity} mode="edit" record={row} authContext={auth}/>);
  expect(screen.getByRole('combobox',{name:prefix+' center type code'}).textContent).toContain('Synthetic finance type');
  fireEvent.click(screen.getByRole('button',{name:'Clear '+prefix+' center type code'}));
  fireEvent.click(screen.getByRole('button',{name:'Test save'}));
  await waitFor(()=>expect(state.save).toHaveBeenCalledOnce());
  expect(state.save.mock.calls[0][0][prefix+'_center_type_code']).toBeNull();
 });
 it(`${prefix}: view-only record uses authorized labels without editable lookup requests`,()=>{
  const row={id:81,[prefix+'_center_code']:'F06_READ',[prefix+'_center_name_en']:'Read only',owner_company_id:1,branch_id:2,['parent_'+prefix+'_center_id']:3,
   [prefix+'_center_type_code']:'HISTORIC',owner_company:{company_code:'A',legal_name_en:'Synthetic Company A'},branch:{branch_code:'A1',branch_name_en:'Synthetic Branch A1'},
   parent:{[prefix+'_center_code']:'P',[prefix+'_center_name_en']:'Historical Parent'},type_label:{value_code:'HISTORIC',value_label_en:'Retired type'},created_at:'2026-10-01',updated_at:'2026-10-01'} as unknown as CenterRecord;
  render(<FinanceCenterWorkspaceForm entity={entity} mode="view" record={row} authContext={auth}/>);
  expect(displayed('Owner company')).toBe('Synthetic Company A');
  expect(displayed('Branch')).toBe('Synthetic Branch A1');
  expect(displayed('Parent centre')).toBe('Historical Parent');
  expect(displayed('Type')).toBe('Retired type');
  expect(state.lookup).not.toHaveBeenCalled();
 });
 it(`${prefix}: unavailable reference is not shown as an empty or global assignment`,()=>{
  const row={id:81,[prefix+'_center_code']:'F06_READ',[prefix+'_center_name_en']:'Read only',owner_company_id:1,branch_id:2,['parent_'+prefix+'_center_id']:3,
   [prefix+'_center_type_code']:'OLD_CODE',created_at:'2026-10-01',updated_at:'2026-10-01'} as unknown as CenterRecord;
  render(<FinanceCenterWorkspaceForm entity={entity} mode="view" record={row} authContext={auth}/>);
  expect(displayed('Owner company')).toBe('Company unavailable');
  expect(displayed('Branch')).toBe('Branch unavailable');
  expect(displayed('Parent centre')).toBe('Parent unavailable');
  expect(displayed('Type')).toBe('OLD_CODE (label unavailable)');
 });
}
