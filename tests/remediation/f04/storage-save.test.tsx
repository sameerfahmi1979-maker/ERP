// @vitest-environment jsdom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {WorkspaceUiMemoryProvider,usePersistentUiState} from '@/hooks/use-persistent-ui-state';
import {createWorkspaceDraftStore} from '@/lib/workspace/workspace-draft-store';
import {isDraftFieldAllowed} from '@/lib/workspace/workspace-draft-types';
import {createWorkspaceSaveAttempt} from '@/lib/workspace/save-contract';
beforeEach(()=>{vi.stubGlobal('localStorage',window.localStorage);localStorage.clear();});
afterEach(cleanup);
it('keeps search and filters out of both durable stores',()=>{
 const h=renderHook(()=>usePersistentUiState('query',{search:'',filters:{}}),{wrapper:WorkspaceUiMemoryProvider});
 act(()=>h.result.current[1]({search:'synthetic personal name',filters:{email:'private'}}));
 expect(h.result.current[0].search).toBe('synthetic personal name');expect(localStorage.length).toBe(0);expect(sessionStorage.length).toBe(0);
});
it('restores per-key session state when returning to a route',()=>{
 const h=renderHook(({key})=>usePersistentUiState(key,''),{initialProps:{key:'a'},wrapper:WorkspaceUiMemoryProvider});
 act(()=>h.result.current[1]('private'));h.rerender({key:'b'});expect(h.result.current[0]).toBe('');h.rerender({key:'a'});expect(h.result.current[0]).toBe('private');
});
it('separate principal providers cannot share memory',()=>{
 const a=renderHook(()=>usePersistentUiState('same',''),{wrapper:WorkspaceUiMemoryProvider});act(()=>a.result.current[1]('private'));
 const b=renderHook(()=>usePersistentUiState('same',''),{wrapper:WorkspaceUiMemoryProvider});expect(b.result.current[0]).toBe('');
});
it('array selections preserve an explicit empty set and cannot leak after provider teardown',()=>{
 const a=renderHook(({key})=>usePersistentUiState<string[]|null>(key,null),{initialProps:{key:'report-view:one:columns'},wrapper:WorkspaceUiMemoryProvider});
 act(()=>a.result.current[1](['name','department']));a.rerender({key:'report-view:two:columns'});expect(a.result.current[0]).toBeNull();a.rerender({key:'report-view:one:columns'});expect(a.result.current[0]).toEqual(['name','department']);
 act(()=>a.result.current[1]([]));a.rerender({key:'report-view:two:columns'});a.rerender({key:'report-view:one:columns'});expect(a.result.current[0]).toEqual([]);a.unmount();
 const b=renderHook(()=>usePersistentUiState<string[]|null>('report-view:one:columns',null),{wrapper:WorkspaceUiMemoryProvider});expect(b.result.current[0]).toBeNull();expect(localStorage.length).toBe(0);
});
it('draft subscription sees custom writes and tab cleanup, and unsubscribe stops delivery',()=>{
 const store=createWorkspaceDraftStore(),listener=vi.fn();const unsubscribe=store.subscribe(listener);
 store.writeField('draft:tab:one:form','company_id','1');expect(listener).toHaveBeenCalledTimes(1);store.clearDraftsForTab('one');expect(listener).toHaveBeenCalledTimes(2);expect(store.hasDraft('draft:tab:one:form')).toBe(false);
 unsubscribe();store.writeField('draft:tab:one:form','company_id','2');expect(listener).toHaveBeenCalledTimes(2);
});
it('retires only owned legacy storage without restoring its values',()=>{
 localStorage.setItem('algt_erp_workspace_page_state:route:old:q','private');localStorage.setItem('erp_table_prefs:v2:default:test','private');localStorage.setItem('unrelated','keep');
 const h=renderHook(()=>usePersistentUiState('algt_erp_workspace_page_state:route:old:q','safe'),{wrapper:WorkspaceUiMemoryProvider});
 expect(h.result.current[0]).toBe('safe');expect(Object.keys(localStorage)).toEqual(['unrelated']);
});
it.each(['account.otp','user[pin]','apiKey','passwordConfirmation','credentials.refreshToken','attachments[0]','__proto__'])('excludes credential/file field %s',name=>expect(isDraftFieldAllowed(name)).toBe(false));
it('draft values are runtime checked and snapshots cannot mutate the store',()=>{
 const s=createWorkspaceDraftStore();s.setDraft('x',{name:'old',file:{blob:true}} as never);const a=s.getDraft('x')!;a.name='changed';expect(s.getDraft('x')).toEqual({name:'old'});
});
it('uncertain save reuses operation identity and rejects changed input',()=>{
 const a=createWorkspaceSaveAttempt();const first=a.begin({name:'one'},null);expect(a.begin({name:'one'},null)).toEqual(first);expect(()=>a.begin({name:'two'},null)).toThrow('unconfirmed');a.resolved();expect(a.begin({name:'two'},'1').operationId).not.toBe(first.operationId);
});
