// @vitest-environment jsdom
import '../f05/setup';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import type {AuthContext} from '@/lib/rbac/check';
import type {ReactNode} from 'react';
import type {WorkCalendarRow} from '@/server/actions/common-master-data/work-calendars';
import {queryKeys} from '@/lib/query/query-keys';
const mock=vi.hoisted(()=>({archive:vi.fn(),refresh:vi.fn(),invalidate:vi.fn(),success:vi.fn()}));
vi.mock('@/server/actions/common-master-data/work-calendars',()=>({softDeleteWorkCalendar:mock.archive}));
vi.mock('@/features/common-master-data/master-archive-panel',()=>({MasterArchivePanel:()=>null}));
vi.mock('@tanstack/react-query',()=>({useQueryClient:()=>({invalidateQueries:mock.invalidate})}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:mock.refresh}),usePathname:()=>'/calendar-test'}));
vi.mock('sonner',()=>({toast:{success:mock.success}}));
vi.mock('@/components/erp/table/erp-data-table',()=>({ERPDataTable:({data,columns}:{data:WorkCalendarRow[];columns:{cell:(context:{row:{original:WorkCalendarRow}})=>ReactNode}[]})=><div>{data.map(row=><div key={row.id}>{row.calendar_name}{columns.at(-1)?.cell({row:{original:row}})}</div>)}</div>}));
import {WorkCalendarsListClient} from '@/features/common-master-data/work-calendars/work-calendars-list-client';
const ctx={profile:{id:1},isAccountActive:true,permissionCodes:['common_md.manage'],globalPermissionCodes:[],roleCodes:[],roleAssignments:[{roleCode:'company_manager',ownerCompanyId:1,branchId:null,permissionCodes:['common_md.manage']}]} as unknown as AuthContext;
const row={id:8,calendar_code:'FCAL',calendar_name:'Synthetic calendar',owner_company_id:1,workspace_revision:3} as WorkCalendarRow;
beforeEach(()=>{vi.resetAllMocks();mock.invalidate.mockResolvedValue(undefined);mock.archive.mockResolvedValue({success:true,data:{id:8,revision:'4',replayed:false,archived:true,changed:true,calendar_id:null},archived:true,changed:true});});afterEach(cleanup);
const mount=()=>render(<WorkCalendarsListClient calendars={[row]} authContext={ctx}/>);
async function confirm(){fireEvent.click(screen.getByRole('button',{name:'Archive FCAL'}));fireEvent.click(screen.getByRole('button',{name:'Archive calendar'}));}
it('company-only manager cannot see an archive action for a global calendar',()=>{render(<WorkCalendarsListClient calendars={[{...row,owner_company_id:null}]} authContext={ctx}/>);expect(screen.queryByRole('button',{name:'Archive FCAL'})).toBeNull();});
it('confirmed archive removes only its record and refreshes the existing query key',async()=>{mount();await confirm();await waitFor(()=>expect(screen.queryByText('Synthetic calendar')).toBeNull());expect(mock.invalidate).toHaveBeenCalledWith({queryKey:queryKeys.commonMd.workCalendars()});});
it('uncertain archive retries the same revision and operation',async()=>{mock.archive.mockResolvedValueOnce({success:false,uncertain:true,error:'Unconfirmed archive'});mount();await confirm();await screen.findByText('Unconfirmed archive');expect((screen.getByRole('button',{name:'Cancel'}) as HTMLButtonElement).disabled).toBe(true);fireEvent.click(screen.getByRole('button',{name:'Archive calendar'}));await waitFor(()=>expect(mock.archive).toHaveBeenCalledTimes(2));expect(mock.archive.mock.calls[1]).toEqual(mock.archive.mock.calls[0]);});
it('wrong receipt identity does not remove the row or report success',async()=>{mock.archive.mockResolvedValueOnce({success:true,data:{id:9,revision:'4'},archived:true});mount();await confirm();await screen.findByText(/Archive could not be confirmed/);expect(screen.getByText('Synthetic calendar')).toBeTruthy();expect(mock.success).not.toHaveBeenCalled();});
it('post-commit view failure has a read-only refresh without another mutation',async()=>{mock.invalidate.mockRejectedValueOnce(Error('cache failure'));mount();await confirm();await screen.findByText(/Calendar archived, but/);fireEvent.click(screen.getByRole('button',{name:'Refresh calendars'}));await waitFor(()=>expect(screen.queryByText(/Calendar archived, but/)).toBeNull());expect(mock.archive).toHaveBeenCalledOnce();});
it.each([false,true])('confirmed archive survives notification failure, refresh failure=%s',async refreshFails=>{
 mock.success.mockImplementation(()=>{throw Error('private toast');});if(refreshFails)mock.invalidate.mockRejectedValueOnce(Error('cache'));
 mount();await confirm();await waitFor(()=>expect(screen.queryByRole('alertdialog')).toBeNull());expect(screen.queryByText('Synthetic calendar')).toBeNull();
 expect(mock.invalidate).toHaveBeenCalledOnce();expect(document.body.textContent).not.toContain('Archive could not be confirmed');
 if(refreshFails){await screen.findByText(/Calendar archived, but/);fireEvent.click(screen.getByRole('button',{name:'Refresh calendars'}));await waitFor(()=>expect(screen.queryByText(/Calendar archived, but/)).toBeNull());}
 expect(mock.archive).toHaveBeenCalledOnce();expect(mock.refresh).toHaveBeenCalledOnce();
});
it('refresh-only recovery of A cannot clear B\'s genuinely pending archive',async()=>{
 mock.success.mockImplementation(()=>{throw Error('notification');});mock.invalidate.mockRejectedValueOnce(Error('cache'));
 mock.archive.mockResolvedValueOnce({success:true,data:{id:8,revision:'4',replayed:false,archived:true,changed:true,calendar_id:null},archived:true,changed:true})
  .mockResolvedValueOnce({success:false,uncertain:true,error:'B unconfirmed'})
  .mockResolvedValueOnce({success:true,data:{id:9,revision:'4',replayed:true,archived:true,changed:true,calendar_id:null},archived:true,changed:true});
 render(<WorkCalendarsListClient calendars={[row,{...row,id:9,calendar_code:'B',calendar_name:'Calendar B'}]} authContext={ctx}/>);await confirm();await screen.findByText(/Calendar archived, but/);
 expect(screen.queryByText('Synthetic calendar')).toBeNull();expect(screen.getByText('Calendar B')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Archive B'}));fireEvent.click(screen.getByRole('button',{name:'Archive calendar'}));await screen.findByText('B unconfirmed');
 // Respect the real modal isolation: users cannot reach A's background refresh while B is unresolved.
 expect(screen.queryByRole('button',{name:'Refresh calendars'})).toBeNull();
 expect(mock.archive).toHaveBeenCalledTimes(2);expect(screen.getByRole('button',{name:'Cancel'})).toHaveProperty('disabled',true);
 fireEvent.click(screen.getByRole('button',{name:'Archive calendar'}));await waitFor(()=>expect(mock.archive).toHaveBeenCalledTimes(3));expect(mock.archive.mock.calls[2]).toEqual(mock.archive.mock.calls[1]);
 await waitFor(()=>expect(screen.queryByRole('alertdialog')).toBeNull());expect(screen.queryByText('Calendar B')).toBeNull();
});
