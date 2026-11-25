// @vitest-environment jsdom
import {act,cleanup,render} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {WorkspaceProvider,useWorkspaceContext} from '@/components/workspace/workspace-provider';
import {WorkspaceDraftProvider} from '@/components/workspace/workspace-draft-provider';

vi.mock('next/navigation',()=>({
 usePathname:()=>'/dashboard',
 useSearchParams:()=>new URLSearchParams(),
 useRouter:()=>({push:()=>{},replace:()=>{}}),
}));
vi.mock('sonner',()=>({toast:{warning:()=>{}}}));
vi.mock('@/components/erp/unsaved-changes-dialog',()=>({UnsavedChangesDialog:()=>null}));

let context: NonNullable<ReturnType<typeof useWorkspaceContext>>;
let renders = 0;
function Capture(){context=useWorkspaceContext()!;renders++;return null;}
afterEach(()=>{cleanup();vi.restoreAllMocks();});

it('dirty state updates do not rewrite unchanged workspace metadata',()=>{
 window.localStorage.clear();
 const writes=vi.spyOn(window.Storage.prototype,'setItem');
 render(<WorkspaceDraftProvider><WorkspaceProvider principalId="synthetic-actor" defaultRoute="/dashboard"><Capture/></WorkspaceProvider></WorkspaceDraftProvider>);
 act(()=>context.openTab({route:'/dms/documents/record/123?mode=edit'}));
 const tabId=context.state.activeTabId!;
 expect(context.state.tabs.find(tab=>tab.id===tabId)?.route).toBe('/dms/documents/record/123?mode=edit');
 writes.mockClear();
 act(()=>context.dispatch({type:'MARK_DIRTY',tabId,dirty:true}));
 const rendersAfterTransition = renders;
 for(let i=0;i<2;i++)act(()=>context.dispatch({type:'MARK_DIRTY',tabId,dirty:true}));
 const manifests=writes.mock.calls.filter(([key])=>key==='algt_erp_workspace_manifest:v5:synthetic-actor');
 expect(context.state.tabs.find(tab=>tab.id===tabId)?.dirty).toBe(true);
 expect(renders).toBe(rendersAfterTransition);
 expect(manifests).toHaveLength(0);
 const stored = localStorage.getItem('algt_erp_workspace_manifest:v5:synthetic-actor');
 const tab=JSON.parse(String(stored)).tabs.find((entry:{id:string})=>entry.id===tabId);
 expect(Object.keys(tab).sort()).toEqual(['id','lastActiveAt','openedAt','route']);

 act(()=>context.dispatch({type:'UPDATE_TAB_ROUTE',tabId,route:'/dms/documents/record/123?mode=view'}));
 const changed = writes.mock.calls.filter(([key])=>key==='algt_erp_workspace_manifest:v5:synthetic-actor');
 expect(changed).toHaveLength(1);
 expect(JSON.parse(String(changed[0][1]))).toMatchObject({activeTabId:tabId,tabs:expect.arrayContaining([
   expect.objectContaining({id:tabId,route:'/dms/documents/record/123?mode=view'}),
 ])});
});
