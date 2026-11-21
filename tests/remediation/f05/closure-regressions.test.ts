// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { syntheticAuthContext } from '../../performance/fixtures/auth-context';
import AiDashboardPage from '@/app/(protected)/admin/ai/dashboard/page';
import DmsObservabilityPage from '@/app/(protected)/admin/dms/ai-observability/page';
import { DmsAiObservabilityPageClient } from '@/features/dms/ai-observability/dms-ai-observability-page-client';

const ai = vi.hoisted(() => ({
  dashboardAvailability: vi.fn(),
  dashboardMetrics: vi.fn(),
  dmsConfig: vi.fn(),
}));
vi.mock('@/lib/rbac/check', async () => ({
  ...await vi.importActual('@/lib/rbac/scope'),
  getAuthContext: async () => syntheticAuthContext(['ai.dashboard.view', 'dms.ai_observability.view']),
}));
vi.mock('@/server/actions/ai/common/dashboard', () => ({
  getAiDailyDashboardAvailability: ai.dashboardAvailability,
  getAiDailyDashboard: ai.dashboardMetrics,
}));
vi.mock('@/server/actions/dms/ai-observability', () => ({
  getDmsAiObservabilityConfig: ai.dmsConfig,
}));

function renderedScreen(element: ReactElement) {
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(element);
  return within(container);
}

const dmsDisabledConfig = {
  featureFlagEnabled: false, setupRequired: false, hasViewPermission: true, hasAdminPermission: false,
};

const read=(file:string)=>readFileSync(file,'utf8');
describe('F05 pre-publication screen regressions',()=>{
  it.each([
    ['attendance','Daily Attendance'], ['leave','Leave Requests'], ['shifts','Shift Calendar'],
  ])('HR time %s has a top-level page heading', (route,title)=>{
    expect(read(`src/app/(protected)/admin/hr/time/${route}/page.tsx`)).toContain(`<h1>${title}</h1>`);
  });
  it('disabled AI dashboard retains its level-one heading and reason', async () => {
    ai.dashboardMetrics.mockClear();
    ai.dashboardAvailability.mockResolvedValue('disabled');
    const status = within(renderedScreen(await AiDashboardPage()).getByRole('status'));
    expect(status.getByRole('heading', { level: 1, name: 'AI Daily Dashboard is disabled' })).toBeTruthy();
    expect(status.getByText('An administrator can review this feature in AI Settings.')).toBeTruthy();
    expect(ai.dashboardMetrics).not.toHaveBeenCalled();
  });
  it('DMS observability denied and disabled states retain their level-one headings and reasons', async () => {
    const denied = renderedScreen(createElement(DmsAiObservabilityPageClient, {
      config: { ...dmsDisabledConfig, hasViewPermission: false },
    }));
    expect(denied.getByRole('heading', { level: 1, name: 'Access Denied' })).toBeTruthy();
    expect(denied.getByText('You do not have permission to view DMS AI Observability.')).toBeTruthy();

    ai.dmsConfig.mockResolvedValue({ success: true, data: dmsDisabledConfig });
    const disabled = within(renderedScreen(await DmsObservabilityPage()).getByRole('status'));
    expect(disabled.getByRole('heading', { level: 1, name: 'DMS AI Observability is disabled' })).toBeTruthy();
    expect(disabled.getByText('An administrator can review this feature in AI Settings.')).toBeTruthy();
  });
  it('distinguishes AI setup guidance from a retryable feature lookup error', async () => {
    ai.dashboardAvailability.mockResolvedValue('setup_required');
    ai.dmsConfig.mockResolvedValue({ success: true, data: { ...dmsDisabledConfig, setupRequired: true } });
    for (const [page, title] of [
      [AiDashboardPage, 'AI Daily Dashboard'],
      [DmsObservabilityPage, 'DMS AI Observability'],
    ] as const) {
      const setup = within(renderedScreen(await page()).getByRole('status'));
      expect(setup.getByRole('heading', { level: 1, name: title + ' setup required' })).toBeTruthy();
      expect(setup.getByText('An administrator needs to complete the feature setup.')).toBeTruthy();
    }

    ai.dashboardAvailability.mockResolvedValue('unavailable');
    ai.dmsConfig.mockResolvedValue({ success: false, error: 'private fixture diagnostic' });
    for (const [page, retryHref] of [
      [AiDashboardPage, '/admin/ai/dashboard'],
      [DmsObservabilityPage, '/admin/dms/ai-observability'],
    ] as const) {
      const screen = renderedScreen(await page());
      const alert = within(screen.getByRole('alert'));
      expect(alert.getByRole('heading', { name: /could not be loaded/i })).toBeTruthy();
      expect(alert.getByRole('link', { name: 'Try loading again' }).getAttribute('href')).toBe(retryHref);
      expect(screen.queryByRole('status')).toBeNull();
      expect(screen.queryByText('private fixture diagnostic')).toBeNull();
    }
  });
  it('employee-only capability cannot trigger forbidden master-data filter reads',()=>{
    const source=read('src/features/hr/employees/employees-table.tsx');
    for(const kind of ['Departments','Designations']){
      expect(source).toContain(`enabled: canFilter${kind}`);
      expect(source).toContain(`hasPermission(authContext, "common_md.${kind.toLowerCase()}.view")`);
      expect(source).toContain(`...(canFilter${kind} ? [`);
    }
    expect(source).toContain('Some filters are unavailable with your current permissions.');
  });
});
