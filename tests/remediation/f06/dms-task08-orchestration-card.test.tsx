// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DmsOrchestrationProgressCard } from '@/features/dms/orchestration/dms-orchestration-progress-card';

const mocks = vi.hoisted(() => ({ run: vi.fn(), read: vi.fn(), success: vi.fn() }));
vi.mock('@/server/actions/dms/orchestration', () => ({
  runDmsAiOrchestrationPostDraft: mocks.run,
  retryDmsOrchestrationStep: vi.fn(),
}));
vi.mock('@/lib/query/invalidation', () => ({ invalidateDmsOrchestrationStatus: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, info: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <DmsOrchestrationProgressCard sessionCode="SYNTHETIC" documentId={77} autoTrigger />
    </QueryClientProvider>,
  );
  return () => {
    view.unmount();
    client.clear();
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockImplementation(async () => Response.json({
    data: { orchestrationStatus: 'skipped_feature_disabled', steps: [] },
  }));
  mocks.run.mockResolvedValue({ success: true, data: { orchestrationStatus: 'skipped_feature_disabled' } });
  vi.stubGlobal('fetch', mocks.read);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('reads status on each intake mount without automatically restarting skipped orchestration', async () => {
  for (let reopen = 0; reopen < 2; reopen++) {
    const close = mount();
    await screen.findByText(/Standard AI Fill is available/);
    close();
  }
  expect(mocks.read).toHaveBeenCalledTimes(2);
  expect(mocks.run).not.toHaveBeenCalled();
});

it('only rechecks orchestration when the skipped card action is selected', async () => {
  const close = mount();
  const recheck = await screen.findByRole('button', { name: 'Run AI pipeline if enabled' });
  expect(mocks.run).not.toHaveBeenCalled();
  fireEvent.click(recheck);
  await waitFor(() => expect(mocks.run).toHaveBeenCalledExactlyOnceWith({ sessionCode: 'SYNTHETIC' }));
  await waitFor(() => expect((recheck as HTMLButtonElement).disabled).toBe(false));
  expect(mocks.success).not.toHaveBeenCalled();
  close();
});

