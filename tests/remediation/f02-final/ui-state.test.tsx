// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook } from '@testing-library/react';
import { StrictMode, useRef, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createUiPreferenceStore, usePersistentUiState, WorkspaceUiMemoryProvider } from '@/hooks/use-persistent-ui-state';
import { useWorkspaceScrollState } from '@/hooks/use-workspace-scroll-state';
import { useWorkspaceTableState } from '@/hooks/use-workspace-table-state';
import { useResizableColumns } from '@/components/erp/table/use-resizable-columns';
import { buildPageStateKey, clearPageState, clearScopePageState } from '@/lib/workspace/workspace-page-state';

function Memory({children}:{children:ReactNode}) {return <StrictMode><WorkspaceUiMemoryProvider>{children}</WorkspaceUiMemoryProvider></StrictMode>;}

beforeEach(() => { vi.stubGlobal('localStorage', window.localStorage); localStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
describe('actual UI preference store and workspace hooks', () => {
  it('uses stable SSR and client snapshots, not a new object on every read', () => {
    const fallback = { expanded: false };
    const store = createUiPreferenceStore(fallback);
    expect(store.getServerSnapshot()).toBe(fallback);
    localStorage.setItem('pref', '{"expanded":true}');
    expect(store.getSnapshot()).toEqual({ expanded: false });
    store.set({expanded:true});expect(store.getSnapshot()).toEqual({expanded:true});
    expect(store.getSnapshot()).toBe(store.getSnapshot());
    expect(store.getServerSnapshot()).toBe(fallback);
  });
  it.each(['broken json', 'null', '[]', '42', '"wrong"'])('rejects malformed/root-incompatible persisted data: %s', raw => {
    localStorage.setItem('pref', raw);
    const fallback = { expanded: false };
    expect(createUiPreferenceStore(fallback).getSnapshot()).toBe(fallback);
  });
  it('runs updater once in StrictMode and restores the selected memory key without reading legacy disk values', () => {
    localStorage.setItem('first', '5'); localStorage.setItem('second', '42');
    const hook = renderHook(({ name }) => usePersistentUiState(name, 0), { initialProps: { name: 'first' }, wrapper: Memory });
    expect(hook.result.current[0]).toBe(0);
    const update = vi.fn((n: number) => n + 1);
    act(() => hook.result.current[1](update));
    expect(update).toHaveBeenCalledTimes(1);
    hook.rerender({ name: 'second' });
    expect(hook.result.current[0]).toBe(0);
    hook.rerender({name:'first'}); expect(hook.result.current[0]).toBe(1);
    expect(localStorage.getItem('first')).toBe('5');
    expect(localStorage.getItem('second')).toBe('42');
  });
  it('does not hydrate or mutate active page state from legacy disk writers', () => {
    const key = buildPageStateKey('record', 'employee:synthetic', 'tab');
    const hook = renderHook(() => usePersistentUiState(key, 'profile'));
    act(() => localStorage.setItem(key, JSON.stringify('documents')));
    expect(hook.result.current[0]).toBe('profile');
    act(() => clearPageState(key)); expect(hook.result.current[0]).toBe('profile');
    act(() => localStorage.setItem(key, JSON.stringify('payroll')));
    act(() => clearScopePageState('record', 'employee:synthetic'));
    expect(hook.result.current[0]).toBe('profile');
  });
  it('separates storage keys and removes event listeners on unsubscribe', () => {
    const a = createUiPreferenceStore(0), b = createUiPreferenceStore(0);
    const listenerA = vi.fn(), listenerB = vi.fn();
    const offA = a.subscribe(listenerA), offB = b.subscribe(listenerB);
    b.set(4); expect(listenerA).not.toHaveBeenCalled(); expect(listenerB).toHaveBeenCalled();
    offA(); offB(); listenerB.mockClear();
    window.dispatchEvent(new StorageEvent('storage', { key: 'b', newValue: '3' }));
    expect(listenerB).not.toHaveBeenCalled();
  });
  it('retains usable in-memory state when storage access is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Blocked'); });
    const hook = renderHook(() => usePersistentUiState('blocked', 1));
    act(() => hook.result.current[1](n => n + 1));
    expect(hook.result.current[0]).toBe(2);
    act(() => hook.result.current[1](n => n + 1));
    expect(hook.result.current[0]).toBe(3);
  });
  it('keeps table state isolated by route and restores filters/pagination', () => {
    const hook = renderHook(({ route }) => useWorkspaceTableState({ key:'test-grid', identifier:route }), { initialProps:{ route:'/first' }, wrapper:Memory });
    act(() => { hook.result.current.setSearch('synthetic'); hook.result.current.setPagination({pageIndex:3,pageSize:50}); });
    hook.rerender({route:'/second'}); expect(hook.result.current.search).toBe('');
    act(() => hook.result.current.setSearch('second'));
    hook.rerender({route:'/first'}); expect(hook.result.current.search).toBe('synthetic');
    expect(hook.result.current.pagination).toEqual({pageIndex:3,pageSize:50});
    act(() => hook.result.current.resetTableState()); expect(hook.result.current.search).toBe('');
  });
  it('saves the old record scroll under the old key, not the next record key', () => {
    const second = buildPageStateKey('record', 'employee:2', 'body');
    localStorage.setItem(second, JSON.stringify({scrollTop:70,scrollLeft:5}));
    function Scroll({ id }: { id:number }) {
      const ref=useRef<HTMLDivElement>(null);
      useWorkspaceScrollState({ key:'body',ref,recordType:'employee',recordId:id });
      return <div ref={ref} data-testid="scroller" />;
    }
    const ui=render(<Scroll id={1}/>,{wrapper:Memory}), el=ui.getByTestId('scroller');
    el.scrollTop=140; el.scrollLeft=9;
    ui.rerender(<Scroll id={2}/>);
    expect(el.scrollTop).toBe(0); expect(el.scrollLeft).toBe(0);
    el.scrollTop=70;el.scrollLeft=5;
    ui.rerender(<Scroll id={1}/>);expect(el.scrollTop).toBe(140);expect(el.scrollLeft).toBe(9);
    ui.rerender(<Scroll id={2}/>);expect(el.scrollTop).toBe(70);expect(el.scrollLeft).toBe(5);
    expect(localStorage.getItem(buildPageStateKey('record','employee:1','body'))).toBeNull();
  });
  it('ignores unscoped legacy widths without overwriting them', () => {
    localStorage.setItem('widths', JSON.stringify({name:222,invalid:-4}));
    const hook=renderHook(()=>useResizableColumns({name:100,invalid:90},{storageKey:'widths'}));
    expect(hook.result.current.widths).toEqual({name:100,invalid:90});
    expect(JSON.parse(localStorage.getItem('widths')!).name).toBe(222);
  });
  it('cleans an active resize when its grid unmounts', () => {
    function Grid() { const col=useResizableColumns({name:100},{storageKey:'resize'}); return <button onMouseDown={e=>col.startResize('name',e)}>{col.widths.name}</button>; }
    const ui=render(<Grid/>);
    fireEvent.mouseDown(ui.getByRole('button'),{clientX:10});
    fireEvent.mouseMove(document,{clientX:40});
    expect(ui.getByRole('button').textContent).toBe('130');
    ui.unmount(); fireEvent.mouseMove(document,{clientX:80});
    expect(localStorage.getItem('resize')).toBeNull();
  });
});
