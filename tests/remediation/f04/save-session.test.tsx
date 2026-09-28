// @vitest-environment jsdom
import {act, cleanup, renderHook} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {createWorkspaceDraftStore} from '@/lib/workspace/workspace-draft-store';
const context=vi.hoisted(()=>({owner:'first',active:'first',close:vi.fn(),store:null as unknown}));
vi.mock('@/hooks/use-workspace-form-owner',()=>({useWorkspaceFormOwner:()=>({id:context.owner})}));
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>context.store}));
vi.mock('@/hooks/use-workspace',()=>({useWorkspace:()=>({activeTab:{id:context.active},closeTab:context.close})}));
import {useWorkspaceSaveSession} from '@/hooks/use-workspace-save-session';
import {useWorkspaceFormNavigation} from '@/hooks/use-workspace-form-navigation';
import {useWorkspaceFormSection} from '@/hooks/use-workspace-form-section';
beforeEach(()=>{context.owner='first';context.active='first';context.store=createWorkspaceDraftStore();vi.clearAllMocks();});
afterEach(cleanup);
it('legacy sections restore per owner but cannot restore unavailable mode-specific sections',()=>{
 const a=renderHook(()=>useWorkspaceFormSection('test','basic',['basic','details']));
 act(()=>a.result.current[1]('details'));a.unmount();
 const b=renderHook(()=>useWorkspaceFormSection('test','basic',['basic','details']));expect(b.result.current[0]).toBe('details');b.unmount();
 const c=renderHook(()=>useWorkspaceFormSection('test','basic',['basic']));expect(c.result.current[0]).toBe('basic');c.unmount();
 context.owner='second';const d=renderHook(()=>useWorkspaceFormSection('test','basic',['basic','details']));expect(d.result.current[0]).toBe('basic');
});
it('retains the original revision and uncertain operation across a route remount',()=>{
 const a=renderHook(()=>useWorkspaceSaveSession('test',42,1));
 const op=a.result.current.begin({name:'draft'});a.unmount();
 const b=renderHook(()=>useWorkspaceSaveSession('test',42,9));
 expect(b.result.current.begin({name:'draft'})).toEqual(op);
 expect(op.revision).toBe('1');expect(()=>b.result.current.begin({name:'different'})).toThrow('unconfirmed');
});
it('adopts created identity and revision across a new-to-edit remount',()=>{
 const a=renderHook(()=>useWorkspaceSaveSession('test',null,undefined));
 a.result.current.accept({id:42,revision:'1',replayed:false});a.unmount();
 const b=renderHook(()=>useWorkspaceSaveSession('test',null,undefined));
 expect(b.result.current.id).toBe(42);expect(b.result.current.begin({name:'edit'}).revision).toBe('1');
});
it('known rollback frees operation identity but never refreshes a stale opening revision',()=>{
 const a=renderHook(()=>useWorkspaceSaveSession('test',42,1));const first=a.result.current.begin({name:'a'});
 a.result.current.rejected();const second=a.result.current.begin({name:'b'});
 expect(second.operationId).not.toBe(first.operationId);expect(second.revision).toBe('1');
});
it('owner discard removes save state and another tab cannot share it',()=>{
 const a=renderHook(()=>useWorkspaceSaveSession('test',42,1));a.result.current.begin({name:'a'});a.unmount();
 context.owner='second';const b=renderHook(()=>useWorkspaceSaveSession('test',42,3));expect(b.result.current.begin({name:'b'}).revision).toBe('3');b.unmount();
 (context.store as ReturnType<typeof createWorkspaceDraftStore>).clearDraftsForTab('first');context.owner='first';
 const c=renderHook(()=>useWorkspaceSaveSession('test',42,4));expect(c.result.current.begin({name:'c'}).revision).toBe('4');
});
it('legacy close callback targets the owner after the active tab changes',()=>{
 const a=renderHook(()=>useWorkspaceFormNavigation());const close=a.result.current.forceCloseActiveTab;
 context.active='second';a.rerender();expect(a.result.current.activeTab?.id).toBe('first');
 act(()=>close());expect(context.close).toHaveBeenCalledExactlyOnceWith('first',{force:true});
});
