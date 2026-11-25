// @vitest-environment jsdom
import {act,render,screen,cleanup,waitFor} from '@testing-library/react';
import type {ReactNode} from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import type {AuthContext} from '@/lib/rbac/check';
import type {ERPTableServerRead} from '@/components/erp/table/erp-table-types';
import type {PartyCatalogueRow} from '@/features/master-data/parties/party-catalogue';
const m=vi.hoisted(()=>({ctx:null as AuthContext|null,page:vi.fn(),output:vi.fn(),table:null as null|{data:PartyCatalogueRow[];serverRead:ERPTableServerRead<PartyCatalogueRow>;toolbarSlot:ReactNode}}));
vi.mock('@/lib/rbac/check',async()=>({...await import('@/lib/rbac/scope'),getAuthContext:async()=>m.ctx}));
vi.mock('next/navigation',()=>({redirect:(url:string)=>{throw Error('Redirect '+url);},notFound:()=>{throw Error('Not found');},useRouter:()=>({refresh:vi.fn()})}));
vi.mock('@/hooks/use-workspace',()=>({useWorkspace:()=>({openTab:vi.fn()})}));
vi.mock('@/hooks/realtime/use-realtime-sync',()=>({useRealtimeSync:vi.fn()}));
vi.mock('@tanstack/react-query',()=>({useQueryClient:()=>({})}));
vi.mock('@/features/master-data/parties/party-form-prefetch',()=>({prefetchPartyFormData:vi.fn()}));
vi.mock('@/components/erp/table/erp-data-table',()=>({ERPDataTable:(props:NonNullable<typeof m.table>)=>{m.table=props;return <div>{props.toolbarSlot}</div>;}}));
vi.mock('@/server/actions/master-data/parties',()=>({getPartyById:async()=>({success:true,data:{id:1}}),getPartyCataloguePage:m.page,getPartyCatalogueExport:m.output,deactivateParty:vi.fn(),reactivateParty:vi.fn()}));
vi.mock('@/features/master-data/parties/party-workspace-form',()=>({PartyWorkspaceForm:({mode}:{mode:string})=><div data-testid="mode">{mode}</div>}));
import {PartiesTable} from '@/features/master-data/parties/parties-table';
import NewPage from '@/app/(protected)/admin/master-data/parties/record/new/page';
import RecordPage from '@/app/(protected)/admin/master-data/parties/record/[id]/page';
const context=(codes:string[],admin=false):AuthContext=>({profile:{id:1} as AuthContext['profile'],email:null,isAccountActive:true,accountStatus:'active',permissionCodes:codes,globalPermissionCodes:codes,roleCodes:admin?['system_admin']:[],roleAssignments:admin?[{roleId:1,roleCode:'system_admin',ownerCompanyId:null,branchId:null,permissionCodes:[]}]:[]});
beforeEach(()=>{m.ctx=context([]);m.page.mockReset();m.output.mockReset();m.table=null;});afterEach(cleanup);
it('global administrator sees Add without duplicated explicit permission grants',()=>{render(<PartiesTable parties={[]} totalCount={0} authContext={context([],true)}/>);expect(screen.queryByRole('button',{name:'Add Party'})).not.toBeNull();});
it('party creator with numbering authority enters the new form, without unrelated manage permission',async()=>{m.ctx=context(['master_data.parties.view','master_data.parties.create','numbering.rules.generate']);render(await NewPage({searchParams:Promise.resolve({})}));expect(screen.getByTestId('mode').textContent).toBe('add');});
it('party editor enters edit mode using the same permission as the update action',async()=>{m.ctx=context(['master_data.parties.view','master_data.parties.edit']);render(await RecordPage({params:Promise.resolve({id:'1'}),searchParams:Promise.resolve({mode:'edit'})}));expect(screen.getByTestId('mode').textContent).toBe('edit');});
it('no numbering authority does not advertise creation that the database rejects',async()=>{m.ctx=context(['master_data.parties.view','master_data.parties.create']);render(<PartiesTable parties={[]} totalCount={0} authContext={m.ctx}/>);expect(screen.queryByRole('button',{name:'Add Party'})).toBeNull();await expect(NewPage({searchParams:Promise.resolve({})})).rejects.toThrow('Redirect');});
it('view-only actor remains read-only on a manually entered edit URL',async()=>{m.ctx=context(['master_data.parties.view']);render(await RecordPage({params:Promise.resolve({id:'1'}),searchParams:Promise.resolve({mode:'edit'})}));expect(screen.getByTestId('mode').textContent).toBe('view');});
it('inactive administrators do not receive creation controls',()=>{render(<PartiesTable parties={[]} totalCount={0} authContext={{...context([],true),isAccountActive:false,accountStatus:'suspended'}}/>);expect(screen.queryByRole('button',{name:'Add Party'})).toBeNull();});
it('typed-list creation requires assignment authority, while unclassified creation remains permitted',()=>{
 const ctx=context(['master_data.parties.view','master_data.parties.create','numbering.rules.generate']);
 const view=render(<PartiesTable parties={[]} totalCount={0} authContext={ctx} defaultTypeCode="CUSTOMER"/>);expect(screen.queryByRole('button',{name:'Add Party'})).toBeNull();
 view.rerender(<PartiesTable parties={[]} totalCount={0} authContext={ctx}/>);expect(screen.queryByRole('button',{name:'Add Party'})).not.toBeNull();
});
it('typed-list creator with assignment authority retains Add',()=>{render(<PartiesTable parties={[]} totalCount={0} authContext={context(['master_data.parties.view','master_data.parties.create','numbering.rules.generate','master_data.parties.manage_types'])} defaultTypeCode="CUSTOMER"/>);expect(screen.queryByRole('button',{name:'Add Party'})).not.toBeNull();});

const listedParty = (id:number):PartyCatalogueRow => ({ id,party_code:`PRT${id}`,display_name:`Party ${id}`,legal_name_en:`Party ${id}`,main_phone:null,main_mobile:null,main_email:null,country_id:1,emirate_id:null,city_id:null,area_zone_id:null,is_active:true,is_locked:false,updated_at:'2026-11-23T00:00:00Z' });

it('uses the authorized initial page without another request, and loads an exact subsequent typed page',async()=>{
 const first=Array.from({length:25},(_,i)=>listedParty(i+1)),second=Array.from({length:25},(_,i)=>listedParty(i+26));
 m.page.mockResolvedValue({success:true,data:{rows:second,totalCount:1250}});
 render(<PartiesTable parties={first} totalCount={1250} authContext={context(['master_data.parties.view'])} defaultTypeCode="CUSTOMER"/>);
 expect(m.table?.data).toEqual(first);expect(m.page).not.toHaveBeenCalled();
 act(()=>m.table?.serverRead.onPaginationChange({pageIndex:1,pageSize:25}));
 await waitFor(()=>expect(m.table?.data).toEqual(second));
 expect(m.page).toHaveBeenCalledWith(expect.objectContaining({pageIndex:1,pageSize:25,typeCode:'CUSTOMER'}));
 m.output.mockResolvedValue({success:true,data:[first[0],second[0]]});
 await expect(m.table?.serverRead.exportSelection?.load(['1','26'])).resolves.toEqual([first[0],second[0]]);
 expect(m.output).toHaveBeenCalledWith(expect.objectContaining({typeCode:'CUSTOMER',selectedIds:[1,26]}));
});

it('ignores late criteria and export results after the worklist changes scope',async()=>{
 let finishFirst:(v:unknown)=>void=()=>{},finishExport:(v:unknown)=>void=()=>{};
 m.page.mockReturnValueOnce(new Promise(resolve=>{finishFirst=resolve;})).mockResolvedValueOnce({success:true,data:{rows:[listedParty(4)],totalCount:1}});
 m.output.mockReturnValueOnce(new Promise(resolve=>{finishExport=resolve;}));
 const view=render(<PartiesTable key="customer" parties={[listedParty(1)]} totalCount={1} authContext={context(['master_data.parties.view'])} defaultTypeCode="CUSTOMER"/>);
 const exportResult=m.table?.serverRead.loadExportData?.();
 const handledExport=expect(exportResult).rejects.toThrow('changed');
 act(()=>m.table?.serverRead.onGlobalFilterChange('first'));
 await waitFor(()=>expect(m.page).toHaveBeenCalledTimes(1));
 view.rerender(<PartiesTable key="vendor" parties={[listedParty(2)]} totalCount={1} authContext={context(['master_data.parties.view'])} defaultTypeCode="VENDOR"/>);
 act(()=>m.table?.serverRead.onGlobalFilterChange('second'));
 await waitFor(()=>expect(m.table?.data.map(row=>row.id)).toEqual([4]));
 await act(async()=>{finishFirst({success:true,data:{rows:[listedParty(3)],totalCount:1}});finishExport({success:true,data:[listedParty(1)]});});
 await handledExport;
 expect(m.table?.data.map(row=>row.id)).toEqual([4]);
});
