// @vitest-environment jsdom
import './setup';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {FluentProvider,webLightTheme} from '@fluentui/react-components';
import {WorkspaceUiMemoryProvider} from '@/hooks/use-persistent-ui-state';
import type {ReactNode} from 'react';
import type {ReportTemplate} from '@/lib/report-center/types';
import {TemplateGovernanceHistoryDialog} from '@/features/report-center/template-governance-actions';
import {PublicLinksAdminClient,safeVerificationPath} from '@/app/(protected)/admin/reports/public-links/public-links-admin-client';
import {EmailProviderConfigList} from '@/features/settings/email/email-provider-config-list';
import {DmsReminderScheduleTable} from '@/features/dms/expiry/dms-reminder-schedule-table';
import type {EmailProviderConfig} from '@/lib/email/providers/types';
const m=vi.hoisted(()=>({history:vi.fn(),links:vi.fn(),cancel:vi.fn(),reminders:vi.fn(),dismiss:vi.fn(),handled:vi.fn()}));
vi.mock('next/navigation',()=>({usePathname:()=>'/synthetic'}));
vi.mock('@/components/erp/export/erp-export-menu',()=>({ERPExportMenu:()=>null}));
vi.mock('@/server/actions/reports/template-governance',()=>({getTemplateGovernanceHistory:m.history,approveTemplate:vi.fn(),archiveTemplate:vi.fn(),createTemplateDraftVersion:vi.fn(),publishTemplate:vi.fn(),rejectTemplate:vi.fn(),runTemplateSecurityReviewAction:vi.fn(),submitTemplateForReview:vi.fn()}));
vi.mock('@/server/actions/reports/public-verification',()=>({listOutputPublicLinks:m.links,cancelOutputPublicLink:m.cancel}));
vi.mock('@/server/actions/dms/expiry-reminders',()=>({getDmsExpiryReminders:m.reminders,dismissDmsExpiryReminder:m.dismiss,markDmsExpiryReminderHandled:m.handled}));
vi.mock('@/server/actions/settings/email-settings',()=>({deleteEmailProviderConfig:vi.fn(),setDefaultEmailProviderConfig:vi.fn(),testEmailProviderConnection:vi.fn(),updateEmailProviderConfig:vi.fn(),saveEmailProviderSecret:vi.fn(),sendTestEmail:vi.fn()}));
function Wrap({children}:{children:ReactNode}){return <FluentProvider theme={webLightTheme}><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><WorkspaceUiMemoryProvider>{children}</WorkspaceUiMemoryProvider></QueryClientProvider></FluentProvider>;}
beforeEach(()=>{vi.resetAllMocks();m.history.mockResolvedValue({success:true,data:[]});m.reminders.mockResolvedValue({success:true,data:[]});});afterEach(()=>cleanup());
it('governance history loads on opening and template change',async()=>{
 const props={open:true,onOpenChange:vi.fn()};const v=render(<Wrap><TemplateGovernanceHistoryDialog {...props} template={{id:3,template_name:'Synthetic A'} as ReportTemplate}/></Wrap>);await waitFor(()=>expect(m.history).toHaveBeenCalledWith(3));
 v.rerender(<Wrap><TemplateGovernanceHistoryDialog {...props} template={{id:4,template_name:'Synthetic B'} as ReportTemplate}/></Wrap>);await waitFor(()=>expect(m.history).toHaveBeenCalledWith(4));
});
it('governance failure shows retry, not no events',async()=>{
 m.history.mockRejectedValueOnce(Error('private'));render(<Wrap><TemplateGovernanceHistoryDialog open onOpenChange={vi.fn()} template={{id:3,template_name:'Synthetic'} as ReportTemplate}/></Wrap>);await screen.findByRole('button',{name:'Retry governance history'});expect(screen.queryByText('No governance events recorded yet.')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Retry governance history'}));await screen.findByText('No governance events recorded yet.');
});
it.each(['https://evil.invalid/verify/a','//evil.invalid','javascript:alert(1)','/verify/%2f%2fevil','/admin/users','/verify/a?redirect=x'])('reject unsafe verification path %s',value=>expect(safeVerificationPath(value)).toBeNull());
it('accept local verification path',()=>expect(safeVerificationPath('/verify/Abc_123-xyz')).toBe('/verify/Abc_123-xyz'));
it('public links have list tools and read-only users cannot cancel',()=>{
 render(<Wrap><PublicLinksAdminClient initialLinks={[{id:1,document_title:'Synthetic',status:'valid',public_url_path:'/verify/synthetic'}]} totalLinks={200} canManage={false}/></Wrap>);expect(screen.getByRole('button',{name:'Edit columns'})).toBeTruthy();expect(screen.getByRole('button',{name:/Edit filters/})).toBeTruthy();expect(screen.queryByRole('button',{name:'Cancel link'})).toBeNull();expect(screen.getByText(/1 loaded of 200/)).toBeTruthy();
});
it('public-link read failure preserves rows but disables cancellation',async()=>{
 m.links.mockRejectedValue(Error('private'));render(<Wrap><PublicLinksAdminClient initialLinks={[{id:1,document_title:'Synthetic',status:'valid'}]} totalLinks={1} canManage/></Wrap>);fireEvent.click(screen.getByRole('button',{name:'Refresh links'}));await screen.findByRole('alert');expect(screen.getByRole('button',{name:'Cancel verification for Synthetic'}).hasAttribute('disabled')).toBe(true);expect(screen.queryByText('private')).toBeNull();
});
it('read-only provider list has no mutation, test or secret controls',()=>{
 render(<Wrap><EmailProviderConfigList configs={[{id:1,providerName:'Synthetic',providerCode:'TEST',providerType:'microsoft_graph',isEnabled:false} as EmailProviderConfig]} onRefresh={vi.fn()} onAdd={vi.fn()}/></Wrap>);expect(screen.getByRole('button',{name:'Edit columns'})).toBeTruthy();for(const name of ['Edit','Update secret','Send test email','Test connection','Enable','Delete'])expect(screen.queryByRole('button',{name,exact:true})).toBeNull();
});
it('reminder error is not an empty history',async()=>{
 m.reminders.mockRejectedValue(Error('private'));render(<Wrap><DmsReminderScheduleTable documentId={4}/></Wrap>);await screen.findByRole('button',{name:'Retry reminders'});expect(screen.queryByText(/No reminders generated/)).toBeNull();
});
it('read-only reminder rows omit mutation actions',async()=>{
 m.reminders.mockResolvedValue({success:true,data:[{id:2,reminder_days_before:5,reminder_date:'2026-10-01',status:'pending'}]});render(<Wrap><DmsReminderScheduleTable documentId={4}/></Wrap>);await screen.findByText('-5d');expect(screen.queryByRole('button',{name:'Mark reminder 2 handled'})).toBeNull();expect(screen.queryByRole('button',{name:'Dismiss reminder 2'})).toBeNull();
});
