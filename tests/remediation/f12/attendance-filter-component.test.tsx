// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({ choices: vi.fn() }));
vi.mock('@/server/actions/hr/attendance-workbench', () => ({ readAttendanceChoices: mocks.choices, readRecentAttendance: vi.fn() }));
vi.mock('@/hooks/use-read-lifetime', () => ({ useReadLifetime: () => ({ enabled: true, active: true }) }));
vi.mock('@/components/erp/combobox', () => ({
  ERPCombobox: ({ ariaLabel, disabled, options, onValueChange }: { ariaLabel: string; disabled: boolean; options: { value: number; label: string }[]; onValueChange: (v: number) => void }) =>
    <select aria-label={ariaLabel} disabled={disabled} defaultValue="" onChange={e => onValueChange(Number(e.target.value))}>
      <option value="">All</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>,
}));
import { AttendanceFilter } from '@/features/hr/time/attendance/attendance-support';

let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});
afterEach(() => { cleanup(); client.clear(); });
function show(onChange = vi.fn()) {
  render(<QueryClientProvider client={client}><AttendanceFilter kind="site" company={1} branch={2} date="2026-10-25" authority="synthetic-only" value={null} disabled={false} onChange={onChange} /></QueryClientProvider>);
}
it('keeps a single-page catalogue compact and selects only its supplied option', async () => {
  mocks.choices.mockResolvedValue({ success: true, rows: [{ id: 11, label: 'Synthetic site' }], hasMore: false });
  const onChange = vi.fn();
  show(onChange);
  await screen.findByRole('option', { name: 'Synthetic site' });
  expect(screen.queryByRole('button', { name: 'First choices' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'More choices' })).toBeNull();
  fireEvent.change(screen.getByLabelText('Attendance site'), { target: { value: '11' } });
  expect(onChange).toHaveBeenCalledWith(11);
});
it('retains scoped cursor paging and can return from the last choice page', async () => {
  mocks.choices.mockImplementation(({ after }) => Promise.resolve({ success: true, rows: [{ id: after ? 12 : 11, label: after ? 'Second synthetic site' : 'First synthetic site' }], hasMore: !after }));
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'More choices' }));
  await screen.findByRole('option', { name: 'Second synthetic site' });
  expect(mocks.choices).toHaveBeenLastCalledWith({ kind: 'site', company: 1, branch: 2, date: '2026-10-25', search: '', after: 11 });
  expect(screen.queryByRole('button', { name: 'More choices' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'First choices' }));
  await screen.findByRole('option', { name: 'First synthetic site' });
  await waitFor(() => expect(mocks.choices).toHaveBeenLastCalledWith(expect.objectContaining({ after: 0, company: 1, branch: 2 })));
});
it('unavailable choices stay disabled and retain an explicit retry', async () => {
  mocks.choices.mockResolvedValueOnce({ success: false, error: 'Synthetic failure' }).mockResolvedValue({ success: true, rows: [], hasMore: false });
  show();
  const retry = await screen.findByRole('button', { name: 'Retry choices' });
  expect(screen.getByLabelText('Attendance site').hasAttribute('disabled')).toBe(true);
  fireEvent.click(retry);
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Retry choices' })).toBeNull());
  expect(mocks.choices).toHaveBeenCalledTimes(2);
});
