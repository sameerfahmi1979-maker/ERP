// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createTabFromRoute, isWorkspaceRoute, safePersistedWorkspaceRoute } from "@/lib/workspace/workspace-route-registry";
import { getInitialState, persistToStorage, restoreFromStorage, workspaceReducer, MAX_TABS } from "@/lib/workspace/workspace-store";
import { WorkspaceDraftProvider } from "@/components/workspace/workspace-draft-provider";
const nav=vi.hoisted(()=>({pathname:"/dashboard",query:"",push:vi.fn(),replace:vi.fn(),warning:vi.fn()}));
vi.mock("next/navigation",()=>({usePathname:()=>nav.pathname,useSearchParams:()=>new URLSearchParams(nav.query),useRouter:()=>({push:nav.push,replace:nav.replace})}));
vi.mock("sonner",()=>({toast:{warning:nav.warning}}));
vi.mock("@/components/erp/unsaved-changes-dialog",()=>({UnsavedChangesDialog:({open,onStay,onDiscard}:{open:boolean;onStay:()=>void;onDiscard:()=>void})=>open?<div><button onClick={onStay}>Stay</button><button onClick={onDiscard}>Discard</button></div>:null}));
import { WorkspaceProvider, useWorkspaceContext } from "@/components/workspace/workspace-provider";
import { WorkspaceTabBar } from "@/components/workspace/workspace-tab-bar";
let context: NonNullable<ReturnType<typeof useWorkspaceContext>>;
function Observe(){context=useWorkspaceContext()!;return null;}
function mount(principal="actor-a", home="/dashboard"){return render(<WorkspaceDraftProvider><WorkspaceProvider principalId={principal} defaultRoute={home}><Observe/></WorkspaceProvider></WorkspaceDraftProvider>);}
beforeEach(()=>{vi.stubGlobal('localStorage',window.localStorage);localStorage.clear();vi.clearAllMocks();nav.pathname="/dashboard";nav.query="";});
afterEach(cleanup);
const manifestKey="algt_erp_workspace_manifest:v5:actor-a";
it('open child dialog blocks tab activation, opening and bulk close until it closes',()=>{
 mount();const home=context.state.activeTabId!;act(()=>context.openTab({route:'/admin/users'}));const owner=context.state.activeTabId!;
 act(()=>context.dispatch({type:'MARK_CHILD_DIALOG_OPEN',tabId:owner,open:true}));nav.push.mockClear();
 act(()=>{context.setActiveTab(home);context.openTab({route:'/admin/hr/employees'});context.closeTab(owner);context.closeAllClosableTabs();});
 expect(context.state.activeTabId).toBe(owner);expect(context.state.tabs).toHaveLength(2);expect(nav.push).not.toHaveBeenCalled();
 const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);expect(event.defaultPrevented).toBe(true);
 act(()=>context.dispatch({type:'MARK_CHILD_DIALOG_OPEN',tabId:owner,open:false}));act(()=>context.setActiveTab(home));expect(context.state.activeTabId).toBe(home);
});
it('a successful Save and Close may close its own pending tab via the explicit force path',()=>{
 mount();act(()=>context.openTab({route:'/admin/users'}));const owner=context.state.activeTabId!;act(()=>context.dispatch({type:'MARK_CHILD_DIALOG_OPEN',tabId:owner,open:true}));act(()=>context.closeTab(owner,{force:true}));expect(context.state.tabs.some(tab=>tab.id===owner)).toBe(false);
});
it('tab-bar Close all needs exactly one confirmation, not a second provider prompt',()=>{
 vi.stubGlobal('ResizeObserver',class {observe(){} disconnect(){}});
 Element.prototype.scrollIntoView=vi.fn();
 render(<WorkspaceDraftProvider><WorkspaceProvider principalId="actor-a"><Observe/><WorkspaceTabBar/></WorkspaceProvider></WorkspaceDraftProvider>);
 act(()=>context.openTab({route:'/admin/hr/employees/record/new'}));
 act(()=>context.dispatch({type:'MARK_DIRTY',tabId:context.state.activeTabId!,dirty:true}));
 fireEvent.click(screen.getByText('Close all'));expect(screen.getAllByText('Discard')).toHaveLength(1);
 fireEvent.click(screen.getByText('Discard'));expect(screen.queryByText('Discard')).toBeNull();
 expect(context.state.tabs.filter(t=>t.closable)).toHaveLength(0);
});
it.each(['/admin/common-master-data/departments','/admin/hr/recruitment/candidates'])('record routes have safe metadata and stop being New after creation: %s',base=>{
 const tab=createTabFromRoute(base+'/record/new');
 expect(tab.formMode).toBe('add');expect(tab.tabKind).toBe('record');
 expect(safePersistedWorkspaceRoute(base+'/record/42?mode=edit')).toBe(base+'/record/42?mode=edit');
 const state=workspaceReducer({...getInitialState(),tabs:[tab],activeTabId:tab.id},{type:'UPDATE_TAB_ROUTE',tabId:tab.id,route:base+'/record/42?mode=edit',entityId:42,formMode:'edit'});
 expect(state.tabs[0].title).not.toContain('New');
});
it('bulk close asks before discarding and leaves the accessible home route',()=>{
 nav.pathname='/notifications';mount('actor-a','/notifications');
 act(()=>context.openTab({route:'/admin/hr/employees/record/new'}));
 const id=context.state.activeTabId;
 act(()=>context.dispatch({type:'MARK_DIRTY',tabId:id!,dirty:true}));
 act(()=>context.closeAllClosableTabs());expect(screen.getByText('Stay')).toBeTruthy();
 fireEvent.click(screen.getByText('Stay'));expect(context.state.tabs.some(t=>t.id===id)).toBe(true);
 act(()=>context.closeAllClosableTabs());fireEvent.click(screen.getByText('Discard'));
 expect(context.state.tabs.filter(t=>t.closable)).toHaveLength(0);expect(nav.push).toHaveBeenLastCalledWith('/notifications');
});
it("persists only bounded route metadata, not dynamic names, drafts or arbitrary queries",()=>{
  const tab={...createTabFromRoute("/admin/hr/employees/record/6?mode=edit&search=private&token=secret"),title:"Private Name",subtitle:"Private Email",dirty:true};
  persistToStorage([tab],tab.id,"actor-a");
  const raw=localStorage.getItem(manifestKey)!;
  expect(raw).not.toMatch(/Private|search|secret|token|dirty/);
  expect(restoreFromStorage("actor-a")?.tabs[0]).toMatchObject({route:"/admin/hr/employees/record/6?mode=edit",dirty:false});
});
it("does not restore another principal or persist a principal-less manifest",()=>{
  const tab=createTabFromRoute("/dashboard");persistToStorage([tab],tab.id,"actor-a");
  expect(restoreFromStorage("actor-b")).toBeNull();
  const before=localStorage.length;persistToStorage([tab],tab.id);expect(localStorage.length).toBe(before);
});
it("rejects a forged principal in a correctly named key",()=>{
  localStorage.setItem(manifestKey,JSON.stringify({version:5,principalId:"actor-b",tabs:[]}));
  expect(restoreFromStorage("actor-a")).toBeNull();
});
it.each(["not json",JSON.stringify({version:4}),JSON.stringify({version:5,principalId:"actor-a",tabs:[null]})])("rejects malformed metadata: %s",(raw)=>{localStorage.setItem(manifestKey,raw);expect(restoreFromStorage("actor-a")).toBeNull();});
it("rejects duplicate ids and unknown routes in a manifest",()=>{
  const tab=createTabFromRoute("/dashboard");persistToStorage([tab],tab.id,"actor-a");
  const data=JSON.parse(localStorage.getItem(manifestKey)!);data.tabs.push(data.tabs[0]);
  localStorage.setItem(manifestKey,JSON.stringify(data));expect(restoreFromStorage("actor-a")).toBeNull();
  data.tabs=[{...data.tabs[0],route:"//external.invalid"}];localStorage.setItem(manifestKey,JSON.stringify(data));expect(restoreFromStorage("actor-a")).toBeNull();
});
it("derives titles and home pinning again rather than trusting stored display flags",()=>{
  const tab=createTabFromRoute("/admin/users");persistToStorage([tab],"missing","actor-a");
  const data=JSON.parse(localStorage.getItem(manifestKey)!);data.tabs[0].title="forged";data.tabs[0].pinned=true;data.tabs[0].dirty=true;
  localStorage.setItem(manifestKey,JSON.stringify(data));
  const restored=restoreFromStorage("actor-a")!;
  expect(restored.tabs[0].title).not.toBe("forged");expect(restored.tabs[0].dirty).toBe(false);expect(restored.activeTabId).toBeNull();
  const state=workspaceReducer(getInitialState(),{type:"RESTORE_TABS",...restored,defaultRoute:"/notifications"});
  expect(state.tabs.find(t=>t.route==="/notifications")).toMatchObject({pinned:true,closable:false});
  expect(state.tabs.find(t=>t.route==="/admin/users")?.closable).toBe(true);
});
it("retires legacy metadata without removing unrelated browser storage",()=>{
  localStorage.setItem("algt_erp_workspace_tabs","old private title");localStorage.setItem("unrelated","retain");
  restoreFromStorage("actor-a");expect(localStorage.getItem("algt_erp_workspace_tabs")).toBeNull();expect(localStorage.getItem("unrelated")).toBe("retain");
});
it.each(["https://evil.invalid","//evil.invalid","/\\evil.invalid","/dashboard\n"])("rejects unsafe navigation %s",(route)=>expect(isWorkspaceRoute(route)).toBe(false));
it("does not persist unknown path tails or private query values",()=>{
  expect(safePersistedWorkspaceRoute("/admin/users/private-person")).toBeNull();
  expect(safePersistedWorkspaceRoute("/admin/users?email=private@example.invalid")).toBe("/admin/users");
});
it("old close callback reads the current destination and does not hijack navigation",()=>{
  mount();act(()=>context.openTab({route:"/admin/users"}));const owner=context.state.activeTabId!;const oldClose=context.closeTab;
  act(()=>context.openTab({route:"/admin/hr/employees"}));const destination=context.state.activeTabId;nav.push.mockClear();
  act(()=>oldClose(owner,{force:true}));
  expect(context.state.activeTabId).toBe(destination);expect(context.state.tabs.some(t=>t.id===owner)).toBe(false);expect(nav.push).not.toHaveBeenCalled();
});
it("old close callback sees newly dirty state and asks before discarding",()=>{
  mount();act(()=>context.openTab({route:"/admin/users"}));const owner=context.state.activeTabId!;const oldClose=context.closeTab;
  act(()=>context.dispatch({type:"MARK_DIRTY",tabId:owner,dirty:true}));act(()=>oldClose(owner));
  expect(screen.getByText("Stay")).toBeTruthy();fireEvent.click(screen.getByText("Stay"));expect(context.state.tabs.some(t=>t.id===owner)).toBe(true);
  act(()=>oldClose(owner));fireEvent.click(screen.getByText("Discard"));expect(context.state.tabs.some(t=>t.id===owner)).toBe(false);
});
it("same-tick opens cannot exceed the cap or duplicate a route",()=>{
  mount();act(()=>{const open=context.openTab;open({route:"/admin/users"});open({route:"/admin/users"});for(let i=0;i<20;i++)open({route:"/admin/hr/employees/record/"+(i+1)});});
  expect(context.state.tabs.filter(t=>t.closable)).toHaveLength(MAX_TABS);
  expect(context.state.tabs.filter(t=>t.route==="/admin/users")).toHaveLength(1);
  expect(nav.warning).toHaveBeenCalled();
});
it("query-only route changes update the existing tab without losing its dirty state",()=>{
  nav.pathname="/admin/hr/employees/record/6";nav.query="mode=view";
  const view=mount();const owner=context.state.activeTabId!;
  act(()=>context.dispatch({type:"MARK_DIRTY",tabId:owner,dirty:true}));nav.query="mode=edit";
  view.rerender(<WorkspaceDraftProvider><WorkspaceProvider principalId="actor-a"><Observe/></WorkspaceProvider></WorkspaceDraftProvider>);
  expect(context.state.tabs.find(t=>t.id===owner)).toMatchObject({route:nav.pathname+"?mode=edit",dirty:true});
  expect(context.state.tabs.filter(t=>t.route.startsWith(nav.pathname))).toHaveLength(1);
});
it("dirty work registers a reload warning and removing it removes the warning",()=>{
  mount();act(()=>context.openTab({route:"/admin/users"}));const owner=context.state.activeTabId!;
  act(()=>context.dispatch({type:"MARK_DIRTY",tabId:owner,dirty:true}));
  const event=new Event("beforeunload",{cancelable:true});window.dispatchEvent(event);expect(event.defaultPrevented).toBe(true);
  act(()=>context.dispatch({type:"MARK_DIRTY",tabId:owner,dirty:false}));
  const clean=new Event("beforeunload",{cancelable:true});window.dispatchEvent(clean);expect(clean.defaultPrevented).toBe(false);
});
it("restored routes are filtered by current shell access",()=>{
  const tab=createTabFromRoute("/admin/users");persistToStorage([tab],tab.id,"actor-a");nav.pathname="/notifications";
  render(<WorkspaceDraftProvider><WorkspaceProvider principalId="actor-a" defaultRoute="/notifications" canRestoreRoute={route=>route!=="/admin/users"}><Observe/></WorkspaceProvider></WorkspaceDraftProvider>);
  expect(context.state.tabs.some(t=>t.route==="/admin/users")).toBe(false);
});
it("the reducer cannot activate a nonexistent tab or bypass admission through route sync",()=>{
  let state=workspaceReducer(getInitialState(),{type:"RESTORE_TABS",tabs:[],activeTabId:null});
  const active=state.activeTabId;state=workspaceReducer(state,{type:"SET_ACTIVE_TAB",tabId:"unknown"});expect(state.activeTabId).toBe(active);
  for(let i=0;i<15;i++){const tab=createTabFromRoute("/admin/hr/employees/record/"+i);state=workspaceReducer(state,{type:"SYNC_ROUTE",route:tab.route,tab});}
  expect(state.tabs.filter(t=>t.closable)).toHaveLength(MAX_TABS);
});
