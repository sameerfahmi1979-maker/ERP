// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { mayNeedCurrentPage } from '@/lib/observability/stale-page';
import ApplicationError from '@/app/error';

vi.mock('@/lib/observability/safe-diagnostic', () => ({ reportSafeDiagnostic: () => 'support-reference' }));
afterEach(cleanup);

it.each([
  new Error('Failed to find Server Action "old-id". This request might be from an older or newer deployment.'),
  new Error('Server Action "old-id" was not found on the server. \nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action'),
  Object.assign(new Error('unavailable asset'), { name: 'ChunkLoadError' }),
  new Error('Loading chunk 123 failed. (missing asset)'),
])('recognizes framework stale-page hints without classifying write outcomes', error => {
  expect(mayNeedCurrentPage(error)).toBe(true);
});

it.each([null, 'Failed to find Server Action', new Error('permission denied'), new Error('timeout after commit'), new Error('fetch failed')])(
  'does not treat unrelated save/access failures as deployment mismatch: %s', error => {
    expect(mayNeedCurrentPage(error)).toBe(false);
  },
);

it('offers a separate tab, retains the original and never automatically retries or exposes raw error content', async () => {
  const retry = vi.fn();
  window.history.replaceState({}, '', '/dms/documents?view=retained');
  const error = new Error('Failed to find Server Action "private-value".');
  render(<ApplicationError error={error} retry={retry} />);
  const link = await screen.findByRole('link', { name: 'Open current version in a new tab' });
  expect(link.getAttribute('href')).toBe(window.location.origin + '/dms/documents?view=retained');
  expect(link.getAttribute('target')).toBe('_blank');
  expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  expect(screen.getByText(/Keep this tab open/)).toBeTruthy();
  expect(screen.getByText(/check its retained request/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  expect(document.body.textContent).not.toContain('private-value');
  expect(retry).not.toHaveBeenCalled();
});

it('keeps a double-slash path on the current origin rather than creating an external link', async () => {
  window.history.replaceState({}, '', window.location.origin + '//external.invalid/path');
  render(<ApplicationError error={new Error('Failed to find Server Action "old-id".')} retry={vi.fn()} />);
  const link = await screen.findByRole('link');
  expect(new URL(link.getAttribute('href')!).origin).toBe(window.location.origin);
});

it('keeps the normal safe error path for other failures', async () => {
  render(<ApplicationError error={new Error('permission denied')} retry={vi.fn()} />);
  await waitFor(() => expect(screen.getByText(/Support reference/)).toBeTruthy());
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  expect(screen.queryByRole('link')).toBeNull();
});
