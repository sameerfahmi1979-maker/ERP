// @vitest-environment jsdom
// Actual editor, dialog validation/save session; table rendering, lookup reads,
// realtime and server actions are doubles. This is not real-browser evidence.
import '../f05/setup';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createWorkspaceDraftStore} from '@/lib/workspace/workspace-draft-store';
import type {PartyAddress} from '@/features/master-data/parties/party-types';
import type {ReactNode} from 'react';
type TestTable={data:PartyAddress[];columns:{id?:string;cell?:(props:{row:{original:PartyAddress}})=>ReactNode}[]};
const m=vi.hoisted(()=>({rows:[] as PartyAddress[],create:vi.fn(),update:vi.fn(),archive:vi.fn(),invalidate:vi.fn(),success:vi.fn(),error:vi.fn(),store:null as unknown}));
vi.mock('@/hooks/use-workspace-form-owner',()=>({useWorkspaceFormOwner:()=>({id:'address-editor'})}));
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>m.store}));
vi.mock('@/hooks/use-workspace-navigation-lock',()=>({useWorkspaceNavigationLock:vi.fn()}));
vi.mock('@/server/actions/master-data/party-addresses',()=>({createPartyAddress:m.create,updatePartyAddress:m.update,deletePartyAddress:vi.fn()}));
vi.mock('@/server/actions/master-data/party-child-lifecycle',()=>({setPartyChildArchived:m.archive}));
vi.mock('@/server/actions/master-data/parties',()=>({getPartyAddressTypes:vi.fn()}));
vi.mock('@/features/master-data/parties/hooks/use-party-child-queries',()=>({usePartyAddressesQuery:()=>({items:m.rows,isLoading:false,refetch:vi.fn()})}));
vi.mock('@/hooks/realtime/use-realtime-sync',()=>({useRealtimeSync:vi.fn()}));
vi.mock('@/lib/query/invalidation',()=>({invalidatePartyAddresses:m.invalidate}));
vi.mock('sonner',()=>({toast:{success:m.success,error:m.error}}));
vi.mock('@tanstack/react-query',()=>({useQueryClient:()=>({}),useQuery:()=>({data:[{id:1,name_en:'Synthetic type'}]})}));
vi.mock('@/components/erp/table/erp-data-table',async()=>{
 const {flexRender}=await import('@tanstack/react-table');
 return {ERPDataTable:({data,columns}:TestTable)=><div>{data.map(row=><div key={row.id}>{flexRender(columns.find(c=>c.id==='actions')?.cell,{row:{original:row}})}</div>)}</div>};
});
vi.mock('@/components/erp/combobox',()=>({ERPCombobox:({value,ariaLabel,required}:{value?:number|string|null;ariaLabel?:string;required?:boolean})=><input aria-label={ariaLabel} required={required} value={value??''} readOnly/>}));
vi.mock('@/components/erp/geography',()=>({CountrySelect:({value}:{value?:number|string|null})=><input aria-label="Country" value={value??''} readOnly/>,EmirateSelect:()=>null,CitySelect:()=>null,AreaZoneSelect:()=>null}));
import {PartyAddressesTab} from '@/features/master-data/parties/party-addresses-tab';
const row={id:8,party_id:4,address_code:'F06-8',workspace_revision:4,address_type_id:1,address_name:'Synthetic address',country_id:1,emirate_id:null,city_id:null,area_zone_id:null,latitude:0,longitude:54.32,is_active:false,is_primary:false,is_billing_address:false,is_shipping_address:false,is_site_address:false} as PartyAddress;
beforeEach(()=>{vi.resetAllMocks();m.store=createWorkspaceDraftStore();m.rows=[row];m.update.mockImplementation(async input=>({success:true,data:{id:input.id,revision:'5',changed:true,replayed:false}}));});afterEach(cleanup);
const open=()=>{render(<PartyAddressesTab partyId={4}/>);fireEvent.click(screen.getAllByRole('button',{name:'Edit record'})[0]);};
const submit=()=>fireEvent.click(screen.getByRole('button',{name:'Save',exact:true}));
it('address archive dialog survives real TanStack cell remount and refreshes its list',async()=>{
 m.archive.mockResolvedValue({success:true,data:{id:8,revision:'5',changed:true,replayed:false,archived:true}});
 render(<PartyAddressesTab partyId={4}/>);fireEvent.click(screen.getByRole('button',{name:'Archive record'}));
 expect(screen.getByRole('dialog')).toBeTruthy();fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Archive record'}));
 await waitFor(()=>expect(m.invalidate).toHaveBeenCalled());expect(m.archive.mock.calls[0][3].revision).toBe('4');await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
});
it('editing preserves stored coordinates and false flags instead of clearing hidden fields',async()=>{
 open();fireEvent.change(screen.getByRole('textbox',{name:'Address Name / Label'}),{target:{value:'Edited label'}});submit();
 await waitFor(()=>expect(m.update).toHaveBeenCalledTimes(1));expect(m.update.mock.calls[0][0]).toMatchObject({id:8,party_id:4,address_name:'Edited label',latitude:0,longitude:54.32,is_active:false,is_primary:false});expect(m.update.mock.calls[0][1].revision).toBe('4');
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());expect(m.invalidate).toHaveBeenCalled();
});
it('reopening another row uses that row identity and revision',async()=>{
 m.rows=[row,{...row,id:9,address_code:'F06-9',workspace_revision:2}];open();submit();await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
 fireEvent.click(screen.getAllByRole('button',{name:'Edit record'})[1]);submit();await waitFor(()=>expect(m.update).toHaveBeenCalledTimes(2));expect(m.update.mock.calls[1][0].id).toBe(9);expect(m.update.mock.calls[1][1].revision).toBe('2');
});
it('uncertain save keeps dialog and draft, disables closing, and retries the same operation',async()=>{
 m.update.mockResolvedValueOnce({success:false,uncertain:true,error:'Unknown outcome'});open();submit();
 await waitFor(()=>expect(screen.getByRole('button',{name:'Cancel'}).hasAttribute('disabled')).toBe(true));expect(screen.getByRole('alert').textContent).toContain('not confirmed');
 submit();await waitFor(()=>expect(m.update).toHaveBeenCalledTimes(2));expect(m.update.mock.calls[1]).toEqual(m.update.mock.calls[0]);await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
});
it('known conflict retains draft without falsely reporting success',async()=>{
 m.update.mockResolvedValueOnce({success:false,error:'This address changed'});open();fireEvent.change(screen.getByRole('textbox',{name:'Address Name / Label'}),{target:{value:'Unsaved local value'}});submit();
 await waitFor(()=>expect(m.error).toHaveBeenCalledWith('This address changed'));expect((screen.getByRole('textbox',{name:'Address Name / Label'}) as HTMLInputElement).value).toBe('Unsaved local value');expect(m.success).not.toHaveBeenCalled();expect(m.invalidate).not.toHaveBeenCalled();
});
it('unchanged save shows a truthful message',async()=>{
 m.update.mockResolvedValueOnce({success:true,data:{id:8,revision:'4',changed:false,replayed:false}});open();submit();await waitFor(()=>expect(m.success).toHaveBeenCalledWith('No changes to save'));
});
