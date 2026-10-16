// @vitest-environment jsdom
import '../f05/setup';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import type {AuthContext} from '@/lib/rbac/check';
import type {DepartmentRow} from '@/server/actions/common-master-data/departments';
import {queryKeys} from '@/lib/query/query-keys';
const mock=vi.hoisted(()=>({archive:vi.fn(),update:vi.fn(),refresh:vi.fn(),invalidate:vi.fn(),success:vi.fn(),error:vi.fn()}));
vi.mock('@/server/actions/common-master-data/departments',()=>({softDeleteDepartment:mock.archive,updateDepartment:mock.update}));
vi.mock('@/features/common-master-data/master-archive-panel',()=>({MasterArchivePanel:({refreshVersion}:any)=><p>Archive recovery version {refreshVersion}</p>}));
vi.mock('@tanstack/react-query',async importOriginal=>{
 const actual=await importOriginal<typeof import('@tanstack/react-query')>();
 const queryClient=new actual.QueryClient();
 // Exercise the real PERF invalidation helper; only its refresh outcome is injected.
 queryClient.invalidateQueries=mock.invalidate;
 return {...actual,useQueryClient:()=>queryClient};
});
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:mock.refresh,push:vi.fn()}),usePathname:()=>'/department-test'}));
vi.mock('sonner',()=>({toast:{success:mock.success,error:mock.error}}));
vi.mock('@/components/erp/table/erp-data-table',()=>({ERPDataTable:({data,columns}:any)=><div>{data.map((row:any)=><div key={row.id}>{row.department_name_en}{columns.at(-1).cell({row:{original:row}})}</div>)}</div>}));
vi.mock('@/components/ui/dropdown-menu',()=>({DropdownMenu:({children}:any)=><div>{children}</div>,DropdownMenuTrigger:({children,...props}:any)=><button {...props}>{children}</button>,DropdownMenuContent:({children}:any)=><div>{children}</div>,DropdownMenuItem:({children,...props}:any)=><button {...props}>{children}</button>,DropdownMenuSeparator:()=>null}));
import {DepartmentsListClient} from '@/features/common-master-data/departments/departments-list-client';
const ctx={profile:{id:1},isAccountActive:true,permissionCodes:['common_md.manage'],globalPermissionCodes:[],roleCodes:[],roleAssignments:[{roleCode:'branch_manager',ownerCompanyId:1,branchId:11,permissionCodes:['common_md.manage']}]} as unknown as AuthContext;
const row={id:8,department_code:'FDEP',department_name_en:'Synthetic department',owner_company_id:1,branch_id:11,workspace_revision:3,is_active:true} as DepartmentRow;
beforeEach(()=>{vi.clearAllMocks();mock.invalidate.mockResolvedValue(undefined);mock.archive.mockResolvedValue({success:true,data:{id:8,revision:'4'},archived:true,changed:true});mock.update.mockResolvedValue({success:true,data:{id:8,revision:'4',changed:true,replayed:false}});});afterEach(cleanup);
const mount=(rows=[row],auth=ctx)=>render(<DepartmentsListClient departments={rows} canManage={true} authContext={auth}/>);
async function confirm(){fireEvent.click(screen.getByRole('button',{name:'Archive',exact:true}));fireEvent.click(screen.getByRole('button',{name:'Archive',exact:true}));}
it('offers archive recovery even when the working list is empty',()=>{mount([]);expect(screen.getByText('Archive recovery version 0')).toBeTruthy();});
it.each([null,12])('branch manager has no mutation actions for branch %s',branch=>{mount([{...row,branch_id:branch}]);expect(screen.queryByRole('button',{name:'Archive',exact:true})).toBeNull();});
it('foreign company does not inherit a matching branch capability',()=>{mount([{...row,owner_company_id:2}]);expect(screen.queryByRole('button',{name:'Archive',exact:true})).toBeNull();});
it('confirmed archive removes only its record and invalidates the existing department key',async()=>{mount();await confirm();await waitFor(()=>expect(screen.queryByText('Synthetic department')).toBeNull());expect(mock.invalidate).toHaveBeenCalledWith({queryKey:queryKeys.commonMd.departments()},{throwOnError:true});expect(screen.getByText('Archive recovery version 1')).toBeTruthy();});
it('uncertain archive cannot be dismissed and retries the exact operation',async()=>{mock.archive.mockResolvedValueOnce({success:false,uncertain:true,error:'Unconfirmed archive'});mount();await confirm();await screen.findByText('Unconfirmed archive');expect((screen.getByRole('button',{name:'Cancel',exact:true}) as HTMLButtonElement).disabled).toBe(true);fireEvent.click(screen.getAllByRole('button',{name:'Archive',exact:true}).at(-1)!);await waitFor(()=>expect(mock.archive).toHaveBeenCalledTimes(2));expect(mock.archive.mock.calls[1]).toEqual(mock.archive.mock.calls[0]);});
it('mismatched archive receipt does not remove or acknowledge the row',async()=>{mock.archive.mockResolvedValueOnce({success:true,data:{id:9,revision:'4'},archived:true});mount();await confirm();await screen.findByText(/could not be confirmed/);expect(screen.getByText('Synthetic department')).toBeTruthy();expect(mock.success).not.toHaveBeenCalled();});
it('committed archive with refresh failure offers read-only recovery',async()=>{mock.invalidate.mockRejectedValueOnce(Error('PRIVATE cache failure'));mount();await confirm();await screen.findByText(/Department saved, but/);expect(screen.queryByText('Synthetic department')).toBeNull();expect(screen.getByText('Archive recovery version 1')).toBeTruthy();expect(screen.queryByText(/PRIVATE cache failure/)).toBeNull();expect(mock.refresh).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Refresh departments'}));await waitFor(()=>expect(screen.queryByText(/Department saved, but/)).toBeNull());expect(mock.refresh).toHaveBeenCalledOnce();expect(mock.archive).toHaveBeenCalledOnce();});
it('uncertain status change freezes competing actions and retains the same request',async()=>{mock.update.mockResolvedValueOnce({success:false,uncertain:true,error:'Status unconfirmed'});mount();fireEvent.click(screen.getByRole('button',{name:'Deactivate',exact:true}));await screen.findByText('Status unconfirmed');expect((screen.getByRole('button',{name:'Cancel',exact:true}) as HTMLButtonElement).disabled).toBe(true);fireEvent.click(screen.getByRole('button',{name:'Retry status change'}));await waitFor(()=>expect(mock.update).toHaveBeenCalledTimes(2));expect(mock.update.mock.calls[1]).toEqual(mock.update.mock.calls[0]);});
it('wrong status receipt does not flip the visible state',async()=>{mock.update.mockResolvedValueOnce({success:true,data:{id:9,revision:'4',changed:true,replayed:false}});mount();fireEvent.click(screen.getByRole('button',{name:'Deactivate',exact:true}));await screen.findByText(/could not be confirmed/);expect(mock.success).not.toHaveBeenCalled();});
