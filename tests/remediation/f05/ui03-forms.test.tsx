// @vitest-environment jsdom
import './setup';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { WorkspaceUiMemoryProvider } from '@/hooks/use-persistent-ui-state';
import { ReportScheduleForm } from '@/features/report-center/report-schedule-form';
import { ReportFilterPanel } from '@/features/report-center/report-filter-panel';
import { NotificationTemplateFormDialog } from '@/features/notifications/admin/notification-template-form-dialog';
import { EmailProviderSecretDialog } from '@/features/settings/email/email-provider-secret-dialog';
import type { ReportSchedule } from '@/server/actions/reports/schedules';
import type { ReactNode } from 'react';
const m=vi.hoisted(()=>({options:vi.fn(),create:vi.fn(),update:vi.fn(),newTemplate:vi.fn(),editTemplate:vi.fn(),secret:vi.fn()}));
vi.mock('@/server/actions/reports/schedule-options',()=>({getScheduleFormOptions:m.options}));
vi.mock('@/server/actions/reports/schedules',()=>({createReportSchedule:m.create,updateReportSchedule:m.update}));
vi.mock('@/server/actions/notifications/templates',()=>({createNotificationTemplate:m.newTemplate,updateNotificationTemplate:m.editTemplate}));
vi.mock('@/server/actions/settings/email-settings',()=>({saveEmailProviderSecret:m.secret}));
function Wrap({children}:{children:ReactNode}){return <FluentProvider theme={webLightTheme}><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><WorkspaceUiMemoryProvider>{children}</WorkspaceUiMemoryProvider></QueryClientProvider></FluentProvider>;}
const choices={success:true,data:{companies:[{value:'1',label:'Synthetic company'}],reports:[{code:'TEST',name:'Synthetic report',companyValues:['1'],formats:['pdf','csv']} ]}};
const schedule={id:1,report:{report_code:'TEST'},owner_company_id:1,schedule_name:'Synthetic schedule',output_format:'pdf',frequency:'weekly',day_of_week:1,day_of_month:null,time_of_day:'07:00:00',timezone:'Asia/Dubai',recipient_to:['qa@example.invalid'],recipient_cc:[],is_active:true,updated_at:'2026-09-30T00:00:00Z'} as ReportSchedule;
beforeEach(()=>{vi.resetAllMocks();m.options.mockResolvedValue(choices);m.update.mockResolvedValue({success:true});});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
function form(editing:ReportSchedule|null=schedule){const close=vi.fn();render(<Wrap><ReportScheduleForm open editing={editing} onOpenChange={close} onSaved={vi.fn()}/></Wrap>);return close;}
it('failed schedule choices are not an empty catalog and retry preserves the draft',async()=>{
  m.options.mockRejectedValueOnce(new Error('PRIVATE'));form();await screen.findByRole('alert');expect(screen.queryByText('PRIVATE')).toBeNull();
  fireEvent.change(screen.getByLabelText('Schedule name'),{target:{value:'Keep me'}});expect(screen.getByRole('button',{name:'Save',exact:true}).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button',{name:'Retry choices'}));await waitFor(()=>expect(screen.getByRole('button',{name:'Save',exact:true}).hasAttribute('disabled')).toBe(false));expect((screen.getByLabelText('Schedule name') as HTMLInputElement).value).toBe('Keep me');
});
it('schedule required and email fields use a linked summary instead of a server request',async()=>{
  form();await waitFor(()=>expect(screen.getByRole('button',{name:'Save',exact:true}).hasAttribute('disabled')).toBe(false));
  fireEvent.change(screen.getByLabelText('Schedule name'),{target:{value:''}});fireEvent.change(screen.getByLabelText('To recipients'),{target:{value:'not-an-email'}});
  fireEvent.click(screen.getByRole('button',{name:'Save',exact:true}));expect(screen.getByRole('alert').textContent).toContain('Schedule name');expect(screen.getByRole('alert').textContent).toContain('To recipients');expect(m.update).not.toHaveBeenCalled();
});
it('schedule save sends the client revision and closes on confirmed success',async()=>{
  const close=form();await waitFor(()=>expect(screen.getByRole('button',{name:'Save',exact:true}).hasAttribute('disabled')).toBe(false));fireEvent.click(screen.getByRole('button',{name:'Save',exact:true}));
  await waitFor(()=>expect(close).toHaveBeenCalledWith(false));expect(m.update).toHaveBeenCalledWith(expect.objectContaining({id:1,expectedUpdatedAt:schedule.updated_at,timeOfDay:'07:00'}));
});
it('schedule response loss retains entries and prevents simultaneous submission',async()=>{
  let reject!:(e:Error)=>void;m.update.mockReturnValue(new Promise((_,r)=>{reject=r;}));const close=form();await waitFor(()=>expect(screen.getByRole('button',{name:'Save',exact:true}).hasAttribute('disabled')).toBe(false));
  const save=screen.getByRole('button',{name:'Save',exact:true});fireEvent.click(save);fireEvent.click(save);expect(m.update).toHaveBeenCalledOnce();reject(new Error('PRIVATE'));await screen.findByRole('alert');expect(close).not.toHaveBeenCalled();expect((screen.getByLabelText('Schedule name') as HTMLInputElement).value).toBe('Synthetic schedule');expect(screen.queryByText('PRIVATE')).toBeNull();
});
it('changing schedule identity creates a fresh session, not the previous draft',async()=>{
  const props={open:true,onOpenChange:vi.fn(),onSaved:vi.fn()};const view=render(<Wrap><ReportScheduleForm {...props} editing={schedule}/></Wrap>);
  fireEvent.change(screen.getByLabelText('Schedule name'),{target:{value:'Private draft A'}});view.rerender(<Wrap><ReportScheduleForm {...props} editing={{...schedule,id:2,schedule_name:'Synthetic B'}}/></Wrap>);expect((screen.getByLabelText('Schedule name') as HTMLInputElement).value).toBe('Synthetic B');
});
it('date range validation blocks inverted report dates',()=>{
  const run=vi.fn();render(<ReportFilterPanel filters={{date_from:'2026-10-10',date_to:'2026-10-01'}} onFilterChange={vi.fn()} onRun={run} onReset={vi.fn()} isLoading={false}/>);
  fireEvent.click(screen.getByRole('button',{name:'Run Report'}));expect(run).not.toHaveBeenCalled();expect(screen.getByRole('alert').textContent).toContain('Date From');
});
it('valid report filters run once and reset is not a submit',async()=>{
  const run=vi.fn(),reset=vi.fn();render(<ReportFilterPanel filters={{date_from:'2026-10-01',date_to:'2026-10-10'}} onFilterChange={vi.fn()} onRun={run} onReset={reset} isLoading={false}/>);
  fireEvent.click(screen.getByRole('button',{name:'Reset'}));expect(run).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Run Report'}));await waitFor(()=>expect(run).toHaveBeenCalledOnce());
});
it('notification templates adopt required summaries and child-form discard protection',()=>{
  render(<NotificationTemplateFormDialog open onClose={vi.fn()} onSuccess={vi.fn()}/>);fireEvent.click(screen.getByRole('button',{name:'Create template'}));expect(screen.getByRole('alert').textContent).toContain('Subject template');expect(m.newTemplate).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Template Name'),{target:{value:'Retain me'}});fireEvent.click(screen.getByRole('button',{name:'Cancel',exact:true}));expect(screen.getByText('Discard unsaved changes?')).toBeTruthy();
});
it('provider secrets clear when the provider identity or opening changes',()=>{
  const props={open:true,onOpenChange:vi.fn(),providerName:'Synthetic',currentMaskedPreview:null};const view=render(<EmailProviderSecretDialog {...props} providerId={1}/>);
  fireEvent.change(screen.getByLabelText('Client secret'),{target:{value:'synthetic-not-real'}});view.rerender(<EmailProviderSecretDialog {...props} providerId={2}/>);expect((screen.getByLabelText('Client secret') as HTMLInputElement).value).toBe('');
  view.rerender(<EmailProviderSecretDialog {...props} open={false} providerId={2}/>);expect(screen.queryByLabelText('Client secret')).toBeNull();
});
it('provider secret required validation does not call the server',()=>{
  render(<EmailProviderSecretDialog open onOpenChange={vi.fn()} providerName="Synthetic" providerId={1} currentMaskedPreview={null}/>);fireEvent.click(screen.getByRole('button',{name:'Save to Vault'}));expect(m.secret).not.toHaveBeenCalled();expect(screen.getByRole('alert').textContent).toContain('Client Secret Value');expect(document.activeElement).toBe(screen.getByLabelText('Client secret'));
});
