// @vitest-environment jsdom
// Actual providers and query clients; no service, auth, storage or network transport.
import React, {StrictMode, useEffect} from 'react';
import {act, cleanup, render} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {QueryClient, QueryClientProvider, useQueryClient} from '@tanstack/react-query';
import {ReadCacheBoundary} from '@/components/layout/read-cache-boundary';
import {clearPrivateCaches} from '@/lib/query/private-cache';

const observed = new Map<string, QueryClient>();
function Observe({label}: {label: string}) {
  const client = useQueryClient();
  useEffect(() => { observed.set(label, client); }, [client, label]);
  return <p>{label}</p>;
}
beforeEach(() => {
  observed.clear();
  vi.stubGlobal('fetch', vi.fn(() => { throw Error('No network permitted in base17 compatibility tests'); }));
});
afterEach(() => { cleanup(); clearPrivateCaches(); vi.unstubAllGlobals(); });

it('retains the same protected client during navigation and replaces it for a principal/scope key change', async () => {
  const outer = new QueryClient();
  outer.setQueryData(['public-root'], 'not identity owned');
  const tree = (key: string, label: string) => <QueryClientProvider client={outer}><ReadCacheBoundary key={key}><Observe label={label}/></ReadCacheBoundary></QueryClientProvider>;
  const view = render(tree('actor-a:scope-1', 'first'));
  const old = observed.get('first')!;
  expect(old).not.toBe(outer);
  old.setQueryData(['private'], 'old synthetic rows');
  view.rerender(tree('actor-a:scope-1', 'ordinary-navigation'));
  expect(observed.get('ordinary-navigation')).toBe(old);
  expect(old.getQueryData(['private'])).toBe('old synthetic rows');

  let finish!: (value: string) => void;
  let signal!: AbortSignal;
  const pending = old.fetchQuery({queryKey: ['late'], retry: false, queryFn: context => {
    signal = context.signal;
    return new Promise<string>(resolve => { finish = resolve; });
  }}).catch(() => undefined);
  view.rerender(tree('actor-a:scope-2', 'narrowed'));
  const narrowed = observed.get('narrowed')!;
  expect(narrowed).not.toBe(old);
  expect(signal.aborted).toBe(true);
  expect(old.getQueryCache().getAll()).toHaveLength(0);
  narrowed.setQueryData(['private'], 'replacement synthetic rows');
  await act(async () => { finish('obsolete synthetic rows'); await pending; });
  expect(old.getQueryData(['late'])).toBeUndefined();
  expect(narrowed.getQueryData(['late'])).toBeUndefined();
  expect(narrowed.getQueryData(['private'])).toBe('replacement synthetic rows');

  view.rerender(tree('actor-b:scope-2', 'replacement-account'));
  expect(observed.get('replacement-account')).not.toBe(narrowed);
  expect(narrowed.getQueryCache().getAll()).toHaveLength(0);
  expect(outer.getQueryData(['public-root'])).toBe('not identity owned');
  view.unmount();
  outer.clear();
});

it('unmount cancels and clears the actual cache, then unregisters it from later identity clears', async () => {
  const view = render(<StrictMode><ReadCacheBoundary><Observe label="owned"/></ReadCacheBoundary></StrictMode>);
  const owned = observed.get('owned')!;
  let signal!: AbortSignal;
  let finish!: (value: string) => void;
  owned.setQueryData(['warm'], 'synthetic');
  const pending = owned.fetchQuery({queryKey: ['pending'], retry: false, queryFn: context => {
    signal = context.signal;
    return new Promise<string>(resolve => { finish = resolve; });
  }}).catch(() => undefined);
  view.unmount();
  expect(signal.aborted).toBe(true);
  expect(owned.getQueryCache().getAll()).toHaveLength(0);
  await act(async () => { finish('obsolete'); await pending; });
  expect(owned.getQueryCache().getAll()).toHaveLength(0);
  // A deliberately re-used, detached synthetic client is no longer registered.
  owned.setQueryData(['detached'], 'not mounted');
  clearPrivateCaches();
  expect(owned.getQueryData(['detached'])).toBe('not mounted');
  owned.clear();
});

it('identity clearing reaches every mounted protected cache but never an unregistered root client', () => {
  const outer = new QueryClient();
  outer.setQueryData(['root'], 'public');
  render(<QueryClientProvider client={outer}><ReadCacheBoundary><Observe label="a"/></ReadCacheBoundary><ReadCacheBoundary><Observe label="b"/></ReadCacheBoundary></QueryClientProvider>);
  const a = observed.get('a')!, b = observed.get('b')!;
  expect(a).not.toBe(b);
  a.setQueryData(['private'], 'a'); b.setQueryData(['private'], 'b');
  clearPrivateCaches();
  expect(a.getQueryCache().getAll()).toHaveLength(0);
  expect(b.getQueryCache().getAll()).toHaveLength(0);
  expect(outer.getQueryData(['root'])).toBe('public');
  outer.clear();
});
