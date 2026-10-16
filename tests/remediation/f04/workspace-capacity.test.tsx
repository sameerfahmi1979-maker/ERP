// @vitest-environment jsdom
import {act, cleanup, fireEvent, render, screen} from "@testing-library/react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {WorkspaceDraftProvider, useWorkspaceDraftStoreContext} from "@/components/workspace/workspace-draft-provider";
import {getInitialState, persistToStorage, restoreFromStorage, workspaceReducer} from "@/lib/workspace/workspace-store";
import {createTabFromRoute} from "@/lib/workspace/workspace-route-registry";
const nav=vi.hoisted(()=>({push:vi.fn(),replace:vi.fn(),warning:vi.fn()}));
vi.mock("next/navigation",()=>({usePathname:()=>"/dashboard",useSearchParams:()=>new URLSearchParams(),useRouter:()=>({push:nav.push,replace:nav.replace})}));
vi.mock("sonner",()=>({toast:{warning:nav.warning}}));
vi.mock("@/components/erp/unsaved-changes-dialog",()=>({UnsavedChangesDialog:({open,onStay,onDiscard}:{open:boolean;onStay:()=>void;onDiscard:()=>void})=>open?<div><button onClick={onStay}>Keep open</button><button onClick={onDiscard}>Confirm discard</button></div>:null}));
import {WorkspaceProvider, useWorkspaceContext} from "@/components/workspace/workspace-provider";
let workspace:NonNullable<ReturnType<typeof useWorkspaceContext>>;
let drafts:NonNullable<ReturnType<typeof useWorkspaceDraftStoreContext>>;
function Observe(){workspace=useWorkspaceContext()!;drafts=useWorkspaceDraftStoreContext()!;return null;}
function mount(){render(<WorkspaceDraftProvider><WorkspaceProvider principalId="capacity-test"><Observe/></WorkspaceProvider></WorkspaceDraftProvider>);}
function open(id:number){workspace.openTab({route:`/admin/hr/employees/record/${id}`});}
beforeEach(()=>{vi.stubGlobal("localStorage",window.localStorage);localStorage.clear();vi.clearAllMocks();});
afterEach(cleanup);

it("admits 1/10/29/30 screens plus Home, rejects 31, and keeps all existing drafts",()=>{
 mount();const ids:string[]=[];
 for(let i=1;i<=30;i++){act(()=>open(i));ids.push(workspace.state.activeTabId!);if([1,10,29,30].includes(i))expect(workspace.state.tabs.filter(t=>t.closable)).toHaveLength(i);drafts.writeField(`draft:tab:${ids.at(-1)}:main`,"name",`draft-${i}`);}
 const active=workspace.state.activeTabId;act(()=>open(31));
 expect(workspace.state.tabs).toHaveLength(31);expect(workspace.state.activeTabId).toBe(active);expect(nav.warning).toHaveBeenCalledTimes(1);
 ids.forEach((id,i)=>expect(drafts.getDraft(`draft:tab:${id}:main`)?.name).toBe(`draft-${i+1}`));
});
it.each([10,30])("restores an existing %i-screen safe manifest without saving draft values",count=>{
 const home=createTabFromRoute("/dashboard"),tabs=[home,...Array.from({length:count},(_,i)=>({...createTabFromRoute(`/admin/hr/employees/record/${i+1}`),dirty:true,title:"private synthetic name"}))];
 persistToStorage(tabs,tabs.at(-1)!.id,"capacity-test");const restored=restoreFromStorage("capacity-test")!;
 expect(restored.tabs).toHaveLength(count+1);expect(restored.tabs.every(tab=>!tab.dirty)).toBe(true);
 expect(localStorage.getItem("algt_erp_workspace_manifest:v5:capacity-test")).not.toContain("private synthetic name");
 const state=workspaceReducer(getInitialState(),{type:"RESTORE_TABS",...restored});expect(state.tabs.filter(t=>t.closable)).toHaveLength(count);
});
it("rejects a forged 31-working-screen manifest without Home",()=>{
 const tabs=Array.from({length:31},(_,i)=>createTabFromRoute(`/admin/hr/employees/record/${i+1}`));persistToStorage(tabs,tabs[0].id,"capacity-test");expect(restoreFromStorage("capacity-test")).toBeNull();
});
it("single discard rechecks a save that started while confirmation was open",()=>{
 mount();act(()=>open(1));const id=workspace.state.activeTabId!;act(()=>workspace.dispatch({type:"MARK_DIRTY",tabId:id,dirty:true}));drafts.writeField(`draft:tab:${id}:main`,"name","keep");
 act(()=>workspace.closeTab(id));expect(workspace.closeConfirmationOpen).toBe(true);
 act(()=>workspace.dispatch({type:"MARK_CHILD_DIALOG_OPEN",tabId:id,open:true}));fireEvent.click(screen.getByText("Confirm discard"));
 expect(workspace.state.tabs.some(t=>t.id===id)).toBe(true);expect(drafts.getDraft(`draft:tab:${id}:main`)?.name).toBe("keep");
});
it("bulk discard is atomic when a target starts saving after confirmation",()=>{
 mount();act(()=>{open(1);open(2);});const [first,second]=workspace.state.tabs.filter(t=>t.closable).map(t=>t.id);act(()=>workspace.dispatch({type:"MARK_DIRTY",tabId:first,dirty:true}));
 drafts.writeField(`draft:tab:${first}:main`,"name","keep");act(()=>workspace.closeAllClosableTabs());
 act(()=>workspace.dispatch({type:"MARK_CHILD_DIALOG_OPEN",tabId:second,open:true}));fireEvent.click(screen.getByText("Confirm discard"));
 expect(workspace.state.tabs.filter(t=>t.closable)).toHaveLength(2);expect(drafts.getDraft(`draft:tab:${first}:main`)?.name).toBe("keep");
});
it("changed close-all targets require a new request instead of discarding a stale selection",()=>{
 mount();act(()=>open(1));const first=workspace.state.activeTabId!;act(()=>workspace.dispatch({type:"MARK_DIRTY",tabId:first,dirty:true}));act(()=>workspace.closeAllClosableTabs());
 act(()=>open(2));fireEvent.click(screen.getByText("Confirm discard"));expect(workspace.state.tabs.filter(t=>t.closable)).toHaveLength(2);expect(workspace.closeConfirmationOpen).toBe(false);
});
it("confirmed close-all clears owned drafts, preserves Home and leaves no closable workspace",()=>{
 mount();act(()=>{for(let i=1;i<=30;i++)open(i);});const ids=workspace.state.tabs.filter(t=>t.closable).map(t=>t.id);act(()=>workspace.dispatch({type:"MARK_DIRTY",tabId:ids[0],dirty:true}));
 ids.forEach(id=>drafts.writeField(`draft:tab:${id}:main`,"name","test"));act(()=>workspace.closeAllClosableTabs());fireEvent.click(screen.getByText("Confirm discard"));
 expect(workspace.state.tabs).toHaveLength(1);expect(workspace.state.tabs[0].pinned).toBe(true);expect(nav.push).toHaveBeenLastCalledWith("/dashboard");ids.forEach(id=>expect(drafts.hasDraft(`draft:tab:${id}:main`)).toBe(false));
});
it("scope revocation removes a route and its draft during the same account session",()=>{
 let allowed=true;const tree=()=> <WorkspaceDraftProvider><WorkspaceProvider principalId="capacity-test" canRestoreRoute={route=>allowed || route==="/dashboard"}><Observe/></WorkspaceProvider></WorkspaceDraftProvider>;
 const view=render(tree());act(()=>open(1));const id=workspace.state.activeTabId!;drafts.writeField(`draft:tab:${id}:main`,"name","private synthetic draft");
 allowed=false;view.rerender(tree());expect(workspace.state.tabs.some(tab=>tab.id===id)).toBe(false);expect(drafts.hasDraft(`draft:tab:${id}:main`)).toBe(false);expect(nav.replace).toHaveBeenLastCalledWith("/dashboard");
});
it("revocation of every route never recreates an unauthorized pinned Home",()=>{
 let allowed=true;const tree=()=> <WorkspaceDraftProvider><WorkspaceProvider principalId="capacity-test" canRestoreRoute={()=>allowed}><Observe/></WorkspaceProvider></WorkspaceDraftProvider>;
 const view=render(tree());act(()=>open(1));allowed=false;view.rerender(tree());expect(workspace.state.tabs).toHaveLength(0);expect(workspace.state.activeTabId).toBeNull();
});
it("Close others does not discard targets if the requested kept workspace disappears",()=>{
 mount();act(()=>{open(1);open(2);});const [first,keep]=workspace.state.tabs.filter(tab=>tab.closable).map(tab=>tab.id);
 act(()=>workspace.dispatch({type:"MARK_DIRTY",tabId:first,dirty:true}));act(()=>workspace.closeOtherTabs(keep));act(()=>workspace.closeTab(keep,{force:true}));fireEvent.click(screen.getByText("Confirm discard"));
 expect(workspace.state.tabs.some(tab=>tab.id===first)).toBe(true);
});
