// @vitest-environment jsdom
import './setup';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { WorkspaceUiMemoryProvider } from '@/hooks/use-persistent-ui-state';
import { ReportFilterPanel } from '@/features/report-center/report-filter-panel';
import { NotificationTemplateFormDialog } from '@/features/notifications/admin/notification-template-form-dialog';
import { EmailProviderSecretDialog } from '@/features/settings/email/email-provider-secret-dialog';
import type { ReactNode } from 'react';
const m=vi.hoisted(()=>({options:vi.fn(),create:vi.fn(),update:vi.fn(),newTemplate:vi.fn(),editTemplate:vi.fn(),secret:vi.fn()}));
vi.mock('@/server/actions/notifications/templates',()=>({createNotificationTemplate:m.newTemplate,updateNotificationTemplate:m.editTemplate}));
vi.mock('@/server/actions/settings/email-settings',()=>({saveEmailProviderSecret:m.secret}));
function Wrap({children}:{children:ReactNode}){return <FluentProvider theme={webLightTheme}><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><WorkspaceUiMemoryProvider>{children}</WorkspaceUiMemoryProvider></QueryClientProvider></FluentProvider>;}
beforeEach(()=>{vi.resetAllMocks();});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
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
