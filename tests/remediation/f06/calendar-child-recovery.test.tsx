// @vitest-environment jsdom
import '../f05/setup';
vi.mock('@/server/actions/common-master-data/archive',()=>({listArchivedMasters:vi.fn(),restoreArchivedMaster:vi.fn()}));
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type {AuthContext} from '@/lib/rbac/check';
import type {WorkCalendarRow,WorkShiftRow} from '@/server/actions/common-master-data/work-calendars';
const mock=vi.hoisted(()=>({read:vi.fn(),create:vi.fn(),update:vi.fn(),remove:vi.fn(),success:vi.fn(),error:vi.fn()}));
vi.mock('sonner',()=>({toast:{success:mock.success,error:mock.error}}));
vi.mock('@/server/actions/common-master-data/work-calendars',()=>({getWorkCalendarById:mock.read,createWorkShift:mock.create,updateWorkShift:mock.update,softDeleteWorkShift:mock.remove,createWorkCalendar:vi.fn(),updateWorkCalendar:vi.fn()}));
vi.mock('@/hooks/use-workspace-form-navigation',()=>({useWorkspaceFormNavigation:()=>({closeTab:vi.fn(),markDirty:vi.fn(),forceCloseActiveTab:vi.fn()})}));
vi.mock('next/navigation',()=>({useRouter:()=>({replace:vi.fn()}),usePathname:()=>'/admin/common-master-data/work-calendars/record/50'}));
vi.mock('@/hooks/use-workspace-form-section',()=>({useWorkspaceFormSection:()=>['shifts',vi.fn()]}));
vi.mock('@/hooks/use-workspace-form-dirty',()=>({useWorkspaceFormDirty:()=>({isDirty:false,resetDirty:vi.fn()})}));
vi.mock('@/hooks/use-workspace-form-draft',()=>({useWorkspaceFormDraft:()=>({getDraftDefault:(_:string,v:unknown)=>String(v),writeDraftField:vi.fn(),syncDraft:vi.fn(),clearDraft:vi.fn()})}));
vi.mock('@/components/workspace/erp-record-workspace-form',()=>({ERPRecordWorkspaceForm:({children}:{children:ReactNode})=><div>{children}</div>,ERPRecordSectionPanel:({children}:{children:ReactNode})=><section>{children}</section>}));
// Isolate data-refresh behavior; real table/dialog focus is covered in browser tests.
vi.mock('@/components/erp/table/erp-data-table',()=>({ERPDataTable:({data,columns}:{data:WorkShiftRow[];columns:{cell:(context:{row:{original:WorkShiftRow}})=>ReactNode}[]})=><div>{data.map(row=><div key={row.id}>{row.shift_name}{columns.at(-1)?.cell({row:{original:row}})}</div>)}</div>}));
import { WorkCalendarWorkspaceForm } from '@/features/common-master-data/work-calendars/work-calendar-workspace-form';
const shift={id:51,workspace_revision:1,shift_code:'FUIQA_SHIFT',shift_name:'Current shift',shift_start_time:'08:00',shift_end_time:'17:00',calendar_id:50,deleted_at:null};
function mount(mode:'view'|'edit'='edit'){const client=new QueryClient({defaultOptions:{queries:{retry:false}}});return render(<QueryClientProvider client={client}><WorkCalendarWorkspaceForm calendar={{id:50,workspace_revision:1,owner_company_id:null,calendar_code:'FUIQA',calendar_name:'Synthetic',shifts:[]} as unknown as WorkCalendarRow} mode={mode} authContext={{profile:{id:1},isAccountActive:true,permissionCodes:['common_md.work_calendars.manage'],globalPermissionCodes:['common_md.work_calendars.manage'],roleCodes:[],roleAssignments:[{roleCode:'test_calendar_manager',ownerCompanyId:null,branchId:null,permissionCodes:['common_md.work_calendars.manage']}]} as unknown as AuthContext}/></QueryClientProvider>);}
afterEach(()=>{cleanup();vi.restoreAllMocks();});
beforeEach(()=>{vi.resetAllMocks();mock.read.mockResolvedValue({success:true,data:{shifts:[shift]}});mock.create.mockResolvedValue({success:true,data:{id:51,revision:'1',replayed:false,changed:true,owner_company_id:null,calendar_id:50}});mock.update.mockResolvedValue({success:true,data:{id:51,revision:'2',replayed:false,changed:true,owner_company_id:null,calendar_id:50}});mock.remove.mockResolvedValue({success:true,data:{id:51,revision:'2',replayed:false,archived:true,changed:true,calendar_id:50},archived:true,changed:true});vi.spyOn(window,'confirm').mockReturnValue(true);});

it('history rejection retains the editable child draft and explains the new-shift path',async()=>{
 const message='This shift has employee assignment history. Create a new shift for different working times; existing history is unchanged.';
 mock.update.mockResolvedValue({success:false,error:message});mount();await screen.findByText('Current shift');
 fireEvent.click(screen.getByRole('button',{name:'Edit shift'}));
 expect(screen.getByText(/If this shift has employee assignment history/)).toBeTruthy();
 fireEvent.change(screen.getByLabelText('Shift Name *'),{target:{value:'Retained history edit'}});
 fireEvent.click(screen.getByRole('button',{name:'Save Shift'}));
 await screen.findByText(message);
 expect((screen.getByLabelText('Shift Name *') as HTMLInputElement).value).toBe('Retained history edit');
 expect(screen.getByLabelText('Shift Name *').closest('fieldset')?.disabled).toBe(false);
 expect(screen.getByRole('button',{name:'Cancel'}).getAttribute('disabled')).toBeNull();
 expect(mock.update).toHaveBeenCalledTimes(1);
});

it.each([
 ['wrong identity',{id:52,revision:'2',changed:true,replayed:false,owner_company_id:null,calendar_id:50}],
 ['wrong parent',{id:51,revision:'2',changed:true,replayed:false,owner_company_id:null,calendar_id:99}],
 ['incomplete result',{id:51,revision:'2',replayed:false,owner_company_id:null,calendar_id:50}],
])('%s freezes the child and retries the same submitted values',async(_label,data)=>{
 mock.update.mockResolvedValueOnce({success:true,data});mount();await screen.findByText('Current shift');
 fireEvent.click(screen.getByRole('button',{name:'Edit shift'}));
 fireEvent.change(screen.getByLabelText('Shift Name *'),{target:{value:'Retained child'}});
 fireEvent.click(screen.getByRole('button',{name:'Save Shift'}));
 await screen.findByText(/The shift was not saved/);
 expect(screen.getByLabelText('Shift Name *').closest('fieldset')?.disabled).toBe(true);
 expect((screen.getByRole('button',{name:'Cancel'}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Save Shift'}));
 await waitFor(()=>expect(mock.update).toHaveBeenCalledTimes(2));expect(mock.update.mock.calls[1]).toEqual(mock.update.mock.calls[0]);
 await waitFor(()=>expect(screen.queryByLabelText('Shift Name *')).toBeNull());
});
it('child transport failure hides technical detail and remains replayable',async()=>{
 mock.update.mockRejectedValueOnce(Error('private provider secret'));mount();await screen.findByText('Current shift');
 fireEvent.click(screen.getByRole('button',{name:'Edit shift'}));fireEvent.click(screen.getByRole('button',{name:'Save Shift'}));
 await screen.findByText(/Save unconfirmed/);expect(document.body.textContent).not.toContain('private provider secret');
 fireEvent.click(screen.getByRole('button',{name:'Save Shift'}));await waitFor(()=>expect(mock.update).toHaveBeenCalledTimes(2));
 expect(mock.update.mock.calls[1]).toEqual(mock.update.mock.calls[0]);
});
it('in-flight child save disables cancellation',async()=>{
 mock.update.mockImplementation(()=>new Promise(()=>{}));mount();await screen.findByText('Current shift');
 fireEvent.click(screen.getByRole('button',{name:'Edit shift'}));fireEvent.click(screen.getByRole('button',{name:'Save Shift'}));
 await waitFor(()=>expect(mock.update).toHaveBeenCalledOnce());
 expect((screen.getByRole('button',{name:'Cancel'}) as HTMLButtonElement).disabled).toBe(true);
});
it('committed child save with refresh failure has a working list retry, not an uncertain save',async()=>{
 vi.spyOn(QueryClient.prototype,'invalidateQueries').mockRejectedValueOnce(Error('synthetic cache failure'));
 mount();await screen.findByText('Current shift');fireEvent.click(screen.getByRole('button',{name:'Edit shift'}));
 fireEvent.click(screen.getByRole('button',{name:'Save Shift'}));
 await screen.findByText(/Work shifts could not be refreshed/);expect(screen.queryByLabelText('Shift Name *')).toBeNull();
 expect(document.body.textContent).not.toContain('Save unconfirmed');
 fireEvent.click(screen.getByRole('button',{name:'Retry shifts'}));
 await waitFor(()=>expect(screen.queryByText(/Work shifts could not be refreshed/)).toBeNull());expect(mock.update).toHaveBeenCalledOnce();
});
it('committed removal with refresh failure remains recoverable without a stuck confirmation',async()=>{
 vi.spyOn(QueryClient.prototype,'invalidateQueries').mockRejectedValueOnce(Error('synthetic cache failure'));
 mount();await screen.findByText('Current shift');fireEvent.click(screen.getByRole('button',{name:'Remove shift'}));
 fireEvent.click(await screen.findByRole('button',{name:'Archive shift'}));
 await screen.findByText(/Work shifts could not be refreshed/);expect(screen.queryByRole('alertdialog')).toBeNull();
 expect((screen.getByRole('button',{name:'Add Shift'}) as HTMLButtonElement).disabled).toBe(false);
 mock.read.mockResolvedValue({success:true,data:{shifts:[]}});fireEvent.click(screen.getByRole('button',{name:'Retry shifts'}));
 await waitFor(()=>expect(screen.queryByText('Current shift')).toBeNull());expect(mock.remove).toHaveBeenCalledOnce();
});
const seasonalShift={...shift,is_active:false,is_overnight:false,total_hours:7.25,ramadan_start_time:'09:00',ramadan_end_time:'15:00',summer_start_time:'07:30',summer_end_time:'15:30'};
async function openSeasonal(){mock.read.mockResolvedValue({success:true,data:{shifts:[seasonalShift]}});mount();await screen.findByText('Current shift');fireEvent.click(screen.getByRole('button',{name:'Edit shift'}));}
it('exposes and preserves both seasonal timing pairs and inactive status on an unchanged child save',async()=>{
 await openSeasonal();for(const [label,value]of [['Ramadan start','09:00'],['Ramadan end','15:00'],['Summer start','07:30'],['Summer end','15:30']])expect(screen.getByLabelText(label)).toHaveProperty('value',value);
 fireEvent.click(screen.getByRole('button',{name:'Save Shift'}));await waitFor(()=>expect(mock.update).toHaveBeenCalledOnce());
 expect(mock.update.mock.calls[0][0]).toMatchObject({ramadan_start_time:'09:00',ramadan_end_time:'15:00',summer_start_time:'07:30',summer_end_time:'15:30',is_active:false,total_hours:7.25});
});
it('clears seasonal timings explicitly instead of retaining stale hidden values',async()=>{
 await openSeasonal();fireEvent.change(screen.getByLabelText('Ramadan start'),{target:{value:''}});fireEvent.change(screen.getByLabelText('Ramadan end'),{target:{value:''}});
 fireEvent.click(screen.getByRole('button',{name:'Save Shift'}));await waitFor(()=>expect(mock.update).toHaveBeenCalledOnce());expect(mock.update.mock.calls[0][0]).toMatchObject({ramadan_start_time:null,ramadan_end_time:null,summer_start_time:'07:30',summer_end_time:'15:30'});
});
it('incomplete seasonal interval is rejected locally with linked field feedback and entries retained',async()=>{
 await openSeasonal();fireEvent.change(screen.getByLabelText('Summer end'),{target:{value:''}});fireEvent.click(screen.getByRole('button',{name:'Save Shift'}));
 await screen.findByRole('button',{name:/Summer end: Enter both start and end times/});expect(mock.update).not.toHaveBeenCalled();expect(screen.getByLabelText('Summer start')).toHaveProperty('value','07:30');await waitFor(()=>expect(screen.getByLabelText('Summer end')).toBe(document.activeElement));
});
it('equivalent seasonal times with different precision never reach the writer',async()=>{
 await openSeasonal();fireEvent.change(screen.getByLabelText('Ramadan start'),{target:{value:'08:00'}});fireEvent.change(screen.getByLabelText('Ramadan end'),{target:{value:'08:00:00'}});fireEvent.click(screen.getByRole('button',{name:'Save Shift'}));
 await screen.findByRole('button',{name:/Ramadan end: Start and end must differ/});expect(mock.update).not.toHaveBeenCalled();
});
it('seasonal save preserves the identical payload after a lost response',async()=>{
 await openSeasonal();mock.update.mockResolvedValueOnce({success:false,uncertain:true,error:'Save unconfirmed'});fireEvent.click(screen.getByRole('button',{name:'Save Shift'}));await screen.findByText('Save unconfirmed');fireEvent.click(screen.getByRole('button',{name:'Save Shift'}));await waitFor(()=>expect(mock.update).toHaveBeenCalledTimes(2));expect(mock.update.mock.calls[1]).toEqual(mock.update.mock.calls[0]);expect(mock.update.mock.calls[0][0].summer_start_time).toBe('07:30');
});
it.each([false,true])('confirmed seasonal edit closes despite notification failure, refresh failure=%s',async refreshFails=>{
 const invalidate=vi.spyOn(QueryClient.prototype,'invalidateQueries');if(refreshFails)invalidate.mockRejectedValueOnce(Error('cache'));
 mock.success.mockImplementation(()=>{throw Error('notification');});await openSeasonal();fireEvent.click(screen.getByRole('button',{name:'Save Shift'}));
 await waitFor(()=>expect(screen.queryByLabelText('Shift Name *')).toBeNull());expect(mock.update).toHaveBeenCalledOnce();expect(invalidate).toHaveBeenCalled();
 expect(document.body.textContent).not.toContain('Save unconfirmed');expect(screen.getByRole('button',{name:'Add Shift'})).toHaveProperty('disabled',false);
 if(refreshFails){await screen.findByText(/Work shifts could not be refreshed/);fireEvent.click(screen.getByRole('button',{name:'Retry shifts'}));await waitFor(()=>expect(screen.queryByText(/Work shifts could not be refreshed/)).toBeNull());expect(mock.update).toHaveBeenCalledOnce();}
 fireEvent.click(screen.getByRole('button',{name:'Edit shift'}));expect(screen.getByRole('button',{name:'Cancel'})).toHaveProperty('disabled',false);
});
it('confirmed child creation closes and refreshes despite notification failure',async()=>{
 const invalidate=vi.spyOn(QueryClient.prototype,'invalidateQueries');mock.success.mockImplementation(()=>{throw Error('notification');});mount();await screen.findByText('Current shift');
 fireEvent.click(screen.getByRole('button',{name:'Add Shift'}));
 for(const [name,value] of [['shift_code','NEW'],['shift_name','New synthetic'],['shift_start_time','08:00'],['shift_end_time','17:00']])fireEvent.change(document.querySelector(`#work-shift-task-form [name="${name}"]`)!,{target:{value}});
 fireEvent.click(screen.getByRole('button',{name:'Save Shift'}));await waitFor(()=>expect(screen.queryByLabelText('Shift Name *')).toBeNull());
 expect(mock.create).toHaveBeenCalledOnce();expect(invalidate).toHaveBeenCalled();expect(document.body.textContent).not.toContain('Save unconfirmed');
});
it.each([true,false])('confirmed shift archive changed=%s survives notification and refresh failures',async changed=>{
 mock.remove.mockResolvedValue({success:true,data:{id:51,revision:'2',replayed:!changed,archived:true,changed,calendar_id:50},archived:true,changed});
 mock.success.mockImplementation(()=>{throw Error('notification');});vi.spyOn(QueryClient.prototype,'invalidateQueries').mockRejectedValueOnce(Error('cache'));
 mount();await screen.findByText('Current shift');fireEvent.click(screen.getByRole('button',{name:'Remove shift'}));fireEvent.click(await screen.findByRole('button',{name:'Archive shift'}));
 await screen.findByText(/Work shifts could not be refreshed/);expect(screen.queryByRole('alertdialog')).toBeNull();expect(screen.getByRole('button',{name:'Add Shift'})).toHaveProperty('disabled',false);
 expect(mock.success).toHaveBeenCalledWith(changed?'Shift archived; history retained':'Shift already archived');
 fireEvent.click(screen.getByRole('button',{name:'Retry shifts'}));await waitFor(()=>expect(screen.queryByText(/Work shifts could not be refreshed/)).toBeNull());expect(mock.remove).toHaveBeenCalledOnce();
});
it.each(['throw','uncertain'])('genuinely %s shift removal retains the exact contract and blocks cancellation',async kind=>{
 if(kind==='throw')mock.remove.mockRejectedValueOnce(Error('private transport'));else mock.remove.mockResolvedValueOnce({success:false,uncertain:true,error:'Removal could not be confirmed'});
 mount();await screen.findByText('Current shift');fireEvent.click(screen.getByRole('button',{name:'Remove shift'}));fireEvent.click(await screen.findByRole('button',{name:'Archive shift'}));
 await screen.findByText(/Removal could not be confirmed/);expect(screen.getByRole('button',{name:'Cancel'})).toHaveProperty('disabled',true);
 expect(screen.queryByRole('button',{name:'Add Shift'})).toBeNull();expect(screen.getByText('Add Shift').closest('button')).toHaveProperty('disabled',true);
 fireEvent.click(screen.getByRole('button',{name:'Archive shift'}));await waitFor(()=>expect(mock.remove).toHaveBeenCalledTimes(2));expect(mock.remove.mock.calls[1]).toEqual(mock.remove.mock.calls[0]);expect(mock.remove.mock.calls[0]).toEqual([51,50,expect.objectContaining({revision:'1'})]);
});
it('known shift archive dependency rejection permits cancellation',async()=>{
 mock.remove.mockResolvedValue({success:false,error:'Linked history retained'});mount();await screen.findByText('Current shift');fireEvent.click(screen.getByRole('button',{name:'Remove shift'}));fireEvent.click(await screen.findByRole('button',{name:'Archive shift'}));
 await screen.findByText('Linked history retained');expect(screen.getByRole('button',{name:'Cancel'})).toHaveProperty('disabled',false);expect(mock.success).not.toHaveBeenCalled();
});
