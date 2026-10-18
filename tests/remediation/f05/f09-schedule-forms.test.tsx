// @vitest-environment jsdom
import './setup';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {FluentProvider,webLightTheme} from '@fluentui/react-components';
import {WorkspaceUiMemoryProvider} from '@/hooks/use-persistent-ui-state';
import {ReportScheduleForm} from '@/features/report-center/report-schedule-form';
import type {ReportSchedule} from '@/server/actions/reports/schedules';
import type {ReactNode} from 'react';
const m=vi.hoisted(()=>({options:vi.fn(),create:vi.fn(),update:vi.fn()}));
vi.mock('@/server/actions/reports/schedule-options',()=>({getScheduleFormOptions:m.options}));
vi.mock('@/server/actions/reports/schedules',()=>({createReportSchedule:m.create,updateReportSchedule:m.update}));
function Wrap({children}:{children:ReactNode}){return <FluentProvider theme={webLightTheme}><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><WorkspaceUiMemoryProvider>{children}</WorkspaceUiMemoryProvider></QueryClientProvider></FluentProvider>;}
const choices={success:true,data:{companies:[{value:'1',label:'Synthetic company'}],reports:[{code:'TEST',name:'Synthetic report',companyValues:['1'],formats:['pdf','csv']}]}};
const schedule={id:1,report:{report_code:'TEST'},owner_company_id:1,schedule_name:'Synthetic schedule',output_format:'pdf',frequency:'weekly',day_of_week:1,day_of_month:null,time_of_day:'07:00:00',timezone:'Asia/Dubai',recipient_to:['qa@example.invalid'],recipient_cc:[],is_active:true,workspace_revision:1,updated_at:'2026-09-30T00:00:00Z'} as ReportSchedule;
beforeEach(()=>{vi.resetAllMocks();m.options.mockResolvedValue(choices);m.update.mockResolvedValue({success:true,data:{id:1,revision:'2',replayed:false}});});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
function form(){const close=vi.fn();render(<Wrap><ReportScheduleForm open editing={schedule} onOpenChange={close} onSaved={vi.fn()}/></Wrap>);return close;}
it('restored F09 choices failure preserves entries and supports retry',async()=>{
 m.options.mockRejectedValueOnce(new Error('PRIVATE'));form();await screen.findByRole('alert');expect(screen.queryByText('PRIVATE')).toBeNull();
 fireEvent.change(screen.getByLabelText('Schedule name'),{target:{value:'Keep me'}});expect(screen.getByRole('button',{name:'Save',exact:true}).hasAttribute('disabled')).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Retry choices'}));await waitFor(()=>expect(screen.getByRole('button',{name:'Save',exact:true}).hasAttribute('disabled')).toBe(false));expect((screen.getByLabelText('Schedule name') as HTMLInputElement).value).toBe('Keep me');
});
it('restored F09 required and email fields use a linked validation summary',async()=>{
 form();await waitFor(()=>expect(screen.getByRole('button',{name:'Save',exact:true}).hasAttribute('disabled')).toBe(false));
 fireEvent.change(screen.getByLabelText('Schedule name'),{target:{value:''}});fireEvent.change(screen.getByLabelText('To recipients'),{target:{value:'not-an-email'}});
 fireEvent.click(screen.getByRole('button',{name:'Save',exact:true}));expect(screen.getByRole('alert').textContent).toContain('Schedule name');expect(screen.getByRole('alert').textContent).toContain('To recipients');expect(m.update).not.toHaveBeenCalled();
});
it('restored F09 save sends the original revision and closes on confirmation',async()=>{
 const close=form();await waitFor(()=>expect(screen.getByRole('button',{name:'Save',exact:true}).hasAttribute('disabled')).toBe(false));fireEvent.click(screen.getByRole('button',{name:'Save',exact:true}));
 await waitFor(()=>expect(close).toHaveBeenCalledWith(false));expect(m.update).toHaveBeenCalledWith(expect.objectContaining({id:1,expectedRevision:'1',requestId:expect.any(String),timeOfDay:'07:00'}));
});
it('restored F09 response loss retains entries and rejects simultaneous submission',async()=>{
 let reject!:(e:Error)=>void;m.update.mockReturnValue(new Promise((_,r)=>{reject=r;}));const close=form();await waitFor(()=>expect(screen.getByRole('button',{name:'Save',exact:true}).hasAttribute('disabled')).toBe(false));
 const save=screen.getByRole('button',{name:'Save',exact:true});fireEvent.click(save);fireEvent.click(save);expect(m.update).toHaveBeenCalledOnce();reject(new Error('PRIVATE'));await screen.findByRole('alert');expect(close).not.toHaveBeenCalled();expect((screen.getByLabelText('Schedule name') as HTMLInputElement).value).toBe('Synthetic schedule');expect(screen.queryByText('PRIVATE')).toBeNull();
});
it('restored F09 record identity changes cannot reuse the previous private draft',()=>{
 const props={open:true,onOpenChange:vi.fn(),onSaved:vi.fn()};const view=render(<Wrap><ReportScheduleForm {...props} editing={schedule}/></Wrap>);
 fireEvent.change(screen.getByLabelText('Schedule name'),{target:{value:'Private draft A'}});view.rerender(<Wrap><ReportScheduleForm {...props} editing={{...schedule,id:2,schedule_name:'Synthetic B'}}/></Wrap>);expect((screen.getByLabelText('Schedule name') as HTMLInputElement).value).toBe('Synthetic B');
});
