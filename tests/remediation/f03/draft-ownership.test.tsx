// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({active:'permission-tab',drafts:new Map<string,Record<string,string>>(),dispatch:vi.fn()}));
vi.mock('@/components/workspace/workspace-provider',()=>({useWorkspaceContext:()=>({state:{activeTabId:state.active,tabs:[{id:'permission-tab',route:'/admin/permissions'},{id:'users-tab',route:'/admin/users'}]},dispatch:state.dispatch})}));
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>({getDraft:(key:string)=>state.drafts.get(key),hasDraft:(key:string)=>state.drafts.has(key),writeField:(key:string,field:string,value:string)=>state.drafts.set(key,{...state.drafts.get(key),[field]:value}),clearDraft:(key:string)=>state.drafts.delete(key)})}));
import { useWorkspaceFormDraft } from '@/hooks/use-workspace-form-draft';
beforeEach(()=>{state.active='permission-tab';state.drafts.clear();state.dispatch.mockClear();});
afterEach(cleanup);
it('a routed permission form cannot write or clear the newly active tab during navigation',()=>{
 const hook=renderHook(()=>useWorkspaceFormDraft({formId:'permission-command-center',ownerRoute:'/admin/permissions'}));
 const key=hook.result.current.draftKey;
 act(()=>hook.result.current.writeDraftField('permission_changes','first'));
 state.active='users-tab';hook.rerender();
 expect(hook.result.current.draftKey).toBe(key);
 act(()=>hook.result.current.writeDraftField('permission_changes','second'));
 expect([...state.drafts.keys()]).toEqual([key]);
 expect(state.drafts.get(key)?.permission_changes).toBe('second');
 act(()=>hook.result.current.clearDraft());expect(state.drafts.size).toBe(0);
});
it('restores the owning permission draft after navigation without changing another tab',()=>{
 const key='draft:tab:permission-tab:permission-command-center';state.drafts.set(key,{permission_changes:'retained'});state.active='users-tab';
 const hook=renderHook(()=>useWorkspaceFormDraft({formId:'permission-command-center',ownerRoute:'/admin/permissions'}));
 expect(hook.result.current.getDraftDefault('permission_changes')).toBe('retained');
 expect(state.dispatch).toHaveBeenCalledWith({type:'MARK_DIRTY',tabId:'permission-tab',dirty:true});
});
it('still excludes credentials and disables draft writes in view-only mode',()=>{
 const hook=renderHook(()=>useWorkspaceFormDraft({formId:'permission-command-center',ownerRoute:'/admin/permissions'}));
 act(()=>hook.result.current.writeDraftField('password','never-store'));expect(state.drafts.size).toBe(0);
 const viewer=renderHook(()=>useWorkspaceFormDraft({formId:'permission-command-center',ownerRoute:'/admin/permissions',enabled:false}));
 act(()=>viewer.result.current.writeDraftField('permission_changes','not-allowed'));expect(state.drafts.size).toBe(0);
});
