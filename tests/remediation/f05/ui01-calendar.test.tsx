// @vitest-environment jsdom
import './setup';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
const mock=vi.hoisted(()=>({read:vi.fn(),create:vi.fn(),update:vi.fn(),remove:vi.fn()}));
vi.mock('@/server/actions/common-master-data/work-calendars',()=>({getWorkCalendarById:mock.read,createWorkShift:mock.create,updateWorkShift:mock.update,softDeleteWorkShift:mock.remove,createWorkCalendar:vi.fn(),updateWorkCalendar:vi.fn()}));
vi.mock('@/hooks/use-workspace-form-navigation',()=>({useWorkspaceFormNavigation:()=>({closeTab:vi.fn(),markDirty:vi.fn(),forceCloseActiveTab:vi.fn()})}));
vi.mock('@/hooks/use-workspace-form-section',()=>({useWorkspaceFormSection:()=>['shifts',vi.fn()]}));
vi.mock('@/hooks/use-workspace-form-dirty',()=>({useWorkspaceFormDirty:()=>({isDirty:false,resetDirty:vi.fn()})}));
vi.mock('@/hooks/use-workspace-form-draft',()=>({useWorkspaceFormDraft:()=>({getDraftDefault:(_:string,v:unknown)=>v,syncDraft:vi.fn(),clearDraft:vi.fn()})}));
vi.mock('@/components/workspace/erp-record-workspace-form',()=>({ERPRecordWorkspaceForm:({children}:{children:ReactNode})=><div>{children}</div>,ERPRecordSectionPanel:({children}:{children:ReactNode})=><section>{children}</section>}));
// Isolate data-refresh behavior; real table/dialog focus is covered in browser tests.
vi.mock('@/components/erp/table/erp-data-table',()=>({ERPDataTable:({data,columns}:any)=><div>{data.map((row:any)=><div key={row.id}>{row.shift_name}{columns.at(-1).cell({row:{original:row}})}</div>)}</div>}));
import { WorkCalendarWorkspaceForm } from '@/features/common-master-data/work-calendars/work-calendar-workspace-form';
const shift={id:51,shift_code:'FUIQA_SHIFT',shift_name:'Current shift',shift_start_time:'08:00',shift_end_time:'17:00',calendar_id:50,deleted_at:null};
function mount(mode:'view'|'edit'='edit'){const client=new QueryClient({defaultOptions:{queries:{retry:false}}});return render(<QueryClientProvider client={client}><WorkCalendarWorkspaceForm calendar={{id:50,calendar_code:'FUIQA',calendar_name:'Synthetic',shifts:[]} as any} mode={mode} authContext={{} as any}/></QueryClientProvider>);}
afterEach(cleanup);
beforeEach(()=>{vi.clearAllMocks();mock.read.mockResolvedValue({success:true,data:{shifts:[shift]}});mock.create.mockResolvedValue({success:true});mock.update.mockResolvedValue({success:true});mock.remove.mockResolvedValue({success:true});vi.spyOn(window,'confirm').mockReturnValue(true);});
it('reads current shifts through the existing authorized action instead of immutable props',async()=>{mount();await screen.findByText('Current shift');expect(mock.read).toHaveBeenCalledWith(50);});
it('refreshes after edit and shows the changed row',async()=>{mount();await screen.findByText('Current shift');fireEvent.click(screen.getByRole('button',{name:'Edit shift'}));fireEvent.change(screen.getByLabelText('Shift Name *'),{target:{value:'Edited shift'}});mock.read.mockResolvedValue({success:true,data:{shifts:[{...shift,shift_name:'Edited shift'}]}});fireEvent.click(screen.getByRole('button',{name:'Save Shift'}));await screen.findByText('Edited shift');expect(mock.update).toHaveBeenCalledOnce();expect(mock.read.mock.calls.length).toBeGreaterThan(1);});
it('rejection retains child input and durable error instead of dismissing the editor',async()=>{mock.update.mockResolvedValue({success:false});mount();await screen.findByText('Current shift');fireEvent.click(screen.getByRole('button',{name:'Edit shift'}));fireEvent.change(screen.getByLabelText('Shift Name *'),{target:{value:'Retain me'}});fireEvent.click(screen.getByRole('button',{name:'Save Shift'}));await screen.findByText(/The save could not be confirmed/);expect((screen.getByLabelText('Shift Name *') as HTMLInputElement).value).toBe('Retain me');});
it('refreshes after remove and never clears rows when removal is rejected',async()=>{mock.remove.mockResolvedValueOnce({success:false});mount();await screen.findByText('Current shift');fireEvent.click(screen.getByRole('button',{name:'Remove shift'}));await screen.findByText(/The shift was not removed/);expect(screen.getByText('Current shift')).toBeTruthy();mock.read.mockResolvedValue({success:true,data:{shifts:[]}});fireEvent.click(screen.getByRole('button',{name:'Remove shift'}));await waitFor(()=>expect(screen.queryByText('Current shift')).toBeNull());});
it('read failure has a retry and recovers without an empty success',async()=>{mock.read.mockResolvedValueOnce({success:false});mount();await screen.findByText(/Work shifts could not be refreshed/);fireEvent.click(screen.getByRole('button',{name:'Retry shifts'}));await screen.findByText('Current shift');});
it('view mode exposes no shift mutation controls',async()=>{mount('view');await screen.findByText('Current shift');expect(screen.queryByRole('button',{name:'Add Shift'})).toBeNull();expect(screen.queryByRole('button',{name:'Edit shift'})).toBeNull();expect(screen.queryByRole('button',{name:'Remove shift'})).toBeNull();});
