// @vitest-environment jsdom
// Real table, menu, dialog and lifecycle hook; grid, server and cache are doubles.
import '../f05/setup';
import type {ReactNode} from 'react';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import type {AuthContext} from '@/lib/rbac/check';
import type {UomCategory,UnitOfMeasureWithCategory,UomConversionWithUnits} from '@/features/master-data/uom/types';
import type {Country,Emirate,CityWithEmirate,AreaZoneWithRelations,PortWithRelations} from '@/features/master-data/geography/types';
import type {CostCenterWithRelations,ProfitCenterWithRelations} from '@/features/master-data/finance-basics/types';
const mock=vi.hoisted(()=>({retire:vi.fn(),refresh:vi.fn(),query:{}}));
vi.mock('@/features/master-data/uom/actions',()=>Object.fromEntries(['UomCategory','UnitOfMeasure','UomConversion'].flatMap(name=>[['toggle'+name+'Status',vi.fn()],['toggle'+name+'Lock',vi.fn()],['delete'+name,mock.retire]])));
vi.mock('@/features/master-data/geography/actions',()=>Object.fromEntries(['Country','Emirate','City','AreaZone','Port'].flatMap(name=>[['toggle'+name+'Status',vi.fn()],['toggle'+name+'Lock',vi.fn()],['delete'+name,mock.retire]])));
vi.mock('@/features/master-data/finance-basics/actions',()=>Object.fromEntries(['CostCenter','ProfitCenter'].flatMap(name=>[['toggle'+name+'Status',vi.fn()],['toggle'+name+'Lock',vi.fn()],['delete'+name,mock.retire]])));
vi.mock('next/navigation',()=>({useRouter:()=>({push:vi.fn(),refresh:mock.refresh})}));
vi.mock('@tanstack/react-query',()=>({useQueryClient:()=>mock.query}));
vi.mock('@/lib/query/invalidation',()=>Object.fromEntries(['Uom','Countries','Emirates','Cities','Areas','Ports','CostCenters','ProfitCenters'].map(name=>['invalidate'+name,vi.fn()])));
vi.mock('sonner',()=>({toast:{success:vi.fn()}}));
vi.mock('@/features/master-data/lookups/hooks/use-lookup-values',()=>({useLookupValues:()=>({values:[],isLoading:false})}));
vi.mock('@/components/erp/table/erp-data-table',()=>({ERPDataTable:({data,columns}:{data:unknown[];columns:{id?:string;cell?:(context:{row:{original:unknown}})=>ReactNode}[]})=><div>{columns.find(c=>c.id==='actions')?.cell?.({row:{original:data[0]}})}</div>}));
import {UomCategoriesTable} from '@/features/master-data/uom/components/uom-categories-table';
import {UnitsTable} from '@/features/master-data/uom/components/units-table';
import {ConversionsTable} from '@/features/master-data/uom/components/conversions-table';
import {CountriesTable} from '@/features/master-data/geography/components/countries-table';
import {EmiratesTable} from '@/features/master-data/geography/components/emirates-table';
import {CitiesTable} from '@/features/master-data/geography/components/cities-table';
import {AreasTable} from '@/features/master-data/geography/components/areas-table';
import {PortsTable} from '@/features/master-data/geography/components/ports-table';
import {CostCentersTable} from '@/features/master-data/finance-basics/components/cost-centers-table';
import {ProfitCentersTable} from '@/features/master-data/finance-basics/components/profit-centers-table';
const auth={profile:{id:1},isAccountActive:true,permissionCodes:['master_data.uom.manage'],globalPermissionCodes:['master_data.uom.manage'],roleCodes:['system_admin'],roleAssignments:[{roleId:1,roleCode:'system_admin',ownerCompanyId:null,branchId:null,permissionCodes:[]}]} as unknown as AuthContext;
const row={id:9,is_active:true,is_locked:false,workspace_revision:3,category_name_en:'Synthetic category',unit_name_en:'Synthetic unit'};
const views=[['category',()=> <UomCategoriesTable categories={[row as unknown as UomCategory]} authContext={auth}/>],['unit',()=> <UnitsTable units={[row as unknown as UnitOfMeasureWithCategory]} authContext={auth}/>],['conversion',()=> <ConversionsTable conversions={[row as unknown as UomConversionWithUnits]} authContext={auth}/>],
 ['country',()=> <CountriesTable countries={[row as unknown as Country]} authContext={auth}/>],
 ['region',()=> <EmiratesTable emirates={[row as unknown as Emirate]} authContext={auth}/>],
 ['city',()=> <CitiesTable cities={[row as unknown as CityWithEmirate]} authContext={auth}/>],
 ['area',()=> <AreasTable areas={[row as unknown as AreaZoneWithRelations]} authContext={auth}/>],
 ['port',()=> <PortsTable ports={[row as unknown as PortWithRelations]} authContext={auth}/>],
 ['cost centre',()=> <CostCentersTable costCenters={[row as unknown as CostCenterWithRelations]} authContext={auth}/>],
 ['profit centre',()=> <ProfitCentersTable profitCenters={[row as unknown as ProfitCenterWithRelations]} authContext={auth}/>]] as const;
beforeEach(()=>{vi.clearAllMocks();mock.retire.mockReset();});afterEach(cleanup);
async function openRetirement(){
 fireEvent.click(screen.getByRole('button',{name:'Record actions'}));
 fireEvent.click(await screen.findByRole('menuitem',{name:'Retire; keep history'}));
 const dialog=await screen.findByRole('alertdialog');
 fireEvent.click(within(dialog).getByRole('button',{name:'Retire; keep history'}));
 return dialog;
}
it.each(views)('%s retirement dependency error remains visible inside its modal',async(_name,view)=>{
 mock.retire.mockResolvedValue({success:false,error:'Retire active dependencies first.'});render(view());
 const dialog=await openRetirement();
 expect((await within(dialog).findByRole('alert')).textContent).toContain('Retire active dependencies first.');
 expect((within(dialog).getByRole('button',{name:'Cancel'}) as HTMLButtonElement).disabled).toBe(false);expect(mock.refresh).not.toHaveBeenCalled();
});
it.each(views)('%s unconfirmed retirement offers same-attempt recovery inside its modal',async(_name,view)=>{
 mock.retire.mockResolvedValueOnce({success:false,uncertain:true,error:'Change unconfirmed.'}).mockResolvedValueOnce({success:true,data:{id:9,revision:'4',changed:true,replayed:true}});render(view());
 const dialog=await openRetirement();const retry=await within(dialog).findByRole('button',{name:'Retry same change'});
 expect((within(dialog).getByRole('button',{name:'Cancel'}) as HTMLButtonElement).disabled).toBe(true);
 expect((within(dialog).getByRole('button',{name:'Retire; keep history'}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(retry);await waitFor(()=>expect(mock.refresh).toHaveBeenCalledOnce());expect(mock.retire.mock.calls[1]).toEqual(mock.retire.mock.calls[0]);
 await waitFor(()=>expect(screen.queryByRole('alertdialog')).toBeNull());
});
