// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Edit2, RefreshCw } from 'lucide-react';
import { HrIconButton } from '@/features/hr/employees/hr-icon-button';

afterEach(cleanup);

it('keeps the accessible name and invokes the original action without submitting a parent form', () => {
  const action = vi.fn(), submit = vi.fn(e => e.preventDefault());
  render(<form onSubmit={submit}><HrIconButton aria-label="Edit record" onClick={action}><Edit2 /></HrIconButton></form>);
  const button = screen.getByRole('button', { name: 'Edit record' });
  expect(button.textContent).toBe('');
  expect(button.querySelector('svg')).not.toBeNull();
  expect(button.getAttribute('type')).toBe('button');
  fireEvent.click(button);
  expect(action).toHaveBeenCalledTimes(1);
  expect(submit).not.toHaveBeenCalled();
});

it.each(['focus', 'hover'])('shows the action description on %s', async method => {
  render(<HrIconButton aria-label="Edit record"><Edit2 /></HrIconButton>);
  const button = screen.getByRole('button', { name: 'Edit record' });
  if (method === 'focus') act(() => button.focus());
  else { fireEvent.mouseEnter(button); fireEvent.mouseMove(button); }
  const description = await screen.findByText('Edit record', { exact: true });
  expect(description.getAttribute('data-slot')).toBe('tooltip-content');
});

it('retains disabled and busy protection while allowing the tooltip to be read', async () => {
  const action = vi.fn();
  render(<HrIconButton aria-label="Refresh" disabled aria-busy onClick={action}><RefreshCw /></HrIconButton>);
  const button = screen.getByRole('button', { name: 'Refresh' });
  expect(button.getAttribute('aria-disabled')).toBe('true');
  expect(button.getAttribute('aria-busy')).toBe('true');
  fireEvent.click(button);
  expect(action).not.toHaveBeenCalled();
  act(() => button.focus());
  expect((await screen.findByText('Refresh')).getAttribute('data-slot')).toBe('tooltip-content');
});

it('preserves toggle state and uses a longer existing explanation without duplicate native tooltips', async () => {
  render(<HrIconButton aria-label="View photo" aria-expanded={false} title="View the permitted saved photo"><Edit2 /></HrIconButton>);
  const button = screen.getByRole('button', { name: 'View photo' });
  expect(button.getAttribute('aria-expanded')).toBe('false');
  expect(button.hasAttribute('title')).toBe(false);
  expect(button.className).toContain('size-11');
  expect(button.className).toContain('sm:size-9');
  act(() => button.focus());
  expect(await screen.findByText('View the permitted saved photo')).toBeTruthy();
});
