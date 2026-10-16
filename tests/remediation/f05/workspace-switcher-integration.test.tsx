// @vitest-environment jsdom
import "./setup";
import {act, cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {FluentProvider, webLightTheme} from "@fluentui/react-components";
import {WorkspaceDraftProvider} from "@/components/workspace/workspace-draft-provider";
const nav=vi.hoisted(()=>({push:vi.fn(),replace:vi.fn()}));
vi.mock("next/navigation",()=>({usePathname:()=>"/dashboard",useSearchParams:()=>new URLSearchParams(),useRouter:()=>nav}));
import {WorkspaceProvider, useWorkspaceContext} from "@/components/workspace/workspace-provider";
import {OpenWorkspaces} from "@/components/workspace/open-workspaces";
let engine:NonNullable<ReturnType<typeof useWorkspaceContext>>;
function Observe(){engine=useWorkspaceContext()!;return <OpenWorkspaces/>;}
function mount(){render(<FluentProvider theme={webLightTheme}><WorkspaceDraftProvider><WorkspaceProvider principalId="switcher-test"><Observe/></WorkspaceProvider></WorkspaceDraftProvider></FluentProvider>);}
function openScreens(count:number){act(()=>{for(let i=1;i<=count;i++)engine.openTab({route:`/admin/hr/employees/record/${i}`,title:`Synthetic screen ${i}`});});}
beforeEach(()=>{vi.stubGlobal("localStorage",window.localStorage);localStorage.clear();vi.clearAllMocks();});
afterEach(cleanup);
it("closes five screens without reopening the switcher and restores focus to the next close",async()=>{
 mount();openScreens(6);fireEvent.click(screen.getByRole("button",{name:/^Open workspaces/}));
 for(let i=1;i<=5;i++){fireEvent.click(screen.getByRole("button",{name:`Close workspace: Synthetic screen ${i}`}));expect(screen.getByRole("dialog",{name:"Open workspaces"})).toBeTruthy();}
 await waitFor(()=>expect(document.activeElement).toBe(screen.getByRole("button",{name:"Close workspace: Synthetic screen 6"})));
 expect(engine.state.tabs.filter(t=>t.closable)).toHaveLength(1);
});
it("keeps search and scroll after cancelling dirty close, then restores the list after discard",async()=>{
 mount();openScreens(3);const owner=engine.state.tabs.find(t=>t.title==="Synthetic screen 1")!.id;
 act(()=>engine.dispatch({type:"MARK_DIRTY",tabId:owner,dirty:true}));fireEvent.click(screen.getByRole("button",{name:/^Open workspaces/}));
 fireEvent.change(screen.getByRole("textbox",{name:"Search open workspaces"}),{target:{value:"screen 1"}});
 const content=screen.getByRole("textbox",{name:"Search open workspaces"}).closest(".algt-dialog-content")!;content.scrollTop=85;
 fireEvent.click(screen.getByRole("button",{name:"Close workspace: Synthetic screen 1"}));
 expect(screen.queryByRole("dialog",{name:"Open workspaces"})).toBeNull();fireEvent.click(screen.getByRole("button",{name:"Stay on Tab"}));
 await waitFor(()=>expect(screen.getByRole("textbox",{name:"Search open workspaces"})).toHaveProperty("value","screen 1"));
 await waitFor(()=>expect(screen.getByRole("textbox",{name:"Search open workspaces"}).closest(".algt-dialog-content")!.scrollTop).toBe(85));
 fireEvent.click(screen.getByRole("button",{name:"Close workspace: Synthetic screen 1"}));fireEvent.click(screen.getByRole("button",{name:"Discard Changes"}));
 await waitFor(()=>expect(screen.getByText("No matching open workspaces.")).toBeTruthy());expect(engine.state.tabs.some(t=>t.id===owner)).toBe(false);
});
it("Close all includes filtered-out screens, keeps Home and returns to an empty switcher",async()=>{
 mount();openScreens(4);fireEvent.click(screen.getByRole("button",{name:/^Open workspaces/}));fireEvent.change(screen.getByRole("textbox",{name:"Search open workspaces"}),{target:{value:"screen 1"}});
 fireEvent.click(screen.getByRole("button",{name:"Close all"}));
 expect(engine.state.tabs).toHaveLength(1);expect(engine.state.tabs[0].pinned).toBe(true);expect(screen.getByRole("dialog",{name:"Open workspaces"})).toBeTruthy();
 expect((screen.getByRole("button",{name:"Close all"}) as HTMLButtonElement).disabled).toBe(true);
 await waitFor(()=>expect(document.activeElement).toBe(screen.getByRole("textbox",{name:"Search open workspaces"})));
});
