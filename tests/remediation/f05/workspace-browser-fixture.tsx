"use client";
// Synthetic, browser-only integration harness. No auth, database or external provider.
import {useRef, useState, useSyncExternalStore, type ReactNode} from "react";
import {usePathname} from "next/navigation";
import {useTheme} from "next-themes";
import {Button} from "@fluentui/react-components";
import {WorkspaceProvider} from "@/components/workspace/workspace-provider";
import {WorkspaceDraftProvider, useWorkspaceDraftStoreContext} from "@/components/workspace/workspace-draft-provider";
import {OpenWorkspaces} from "@/components/workspace/open-workspaces";
import {useWorkspace} from "@/hooks/use-workspace";
import {useWorkspaceFormDraft} from "@/hooks/use-workspace-form-draft";
import {ThemeProvider} from "@/components/layout/theme-provider";
import {AlgtFluentProvider} from "@/components/design-system/fluent-provider";
import {Toaster} from "@/components/ui/sonner";

function Tools({revoke}:{revoke:(route:string)=>void}){
 const workspace=useWorkspace(),next=useRef(900001),{resolvedTheme,setTheme}=useTheme();
 const add=()=>{const id=next.current++;const paths=["/admin/hr/employees/record/","/dms/documents/record/","/admin/common-master-data/departments/record/"];workspace.openTab({route:paths[id%3]+id,title:`Synthetic screen ${id-900000}`});};
 return <><header className="algt-global-header"><strong>ALGT workspace test laboratory</strong><OpenWorkspaces/></header>
 <div style={{display:"flex",flexWrap:"wrap",gap:8,padding:16}}><Button onClick={add}>Open next screen</Button><Button onClick={()=>{for(let i=0;i<10;i++)add();}}>Open 10 screens</Button>
 <Button onClick={()=>setTheme(resolvedTheme==="dark"?"light":"dark")}>Toggle theme</Button><Button disabled={!workspace.activeTab?.closable} onClick={()=>revoke(workspace.activeTab!.route)}>Revoke current route</Button>
 <output aria-label="Working screens">{workspace.tabs.filter(tab=>tab.closable).length} working screens</output></div></>;
}
export function WorkspaceBrowserHarness({children}:{children:ReactNode}){
 const [actor,setActor]=useState("synthetic-a"),[denied,setDenied]=useState<string[]>([]);
 return <ThemeProvider><AlgtFluentProvider><div className="algt-shell">
 <div style={{padding:8}}><span>Synthetic account: {actor} </span><Button onClick={()=>{setActor(actor==="synthetic-a"?"synthetic-b":"synthetic-a");setDenied([]);}}>Switch synthetic account</Button></div>
 <WorkspaceDraftProvider key={actor}><WorkspaceProvider principalId={actor} defaultRoute="/dashboard" canRestoreRoute={route=>!denied.includes(route)}><Tools revoke={route=>setDenied(old=>[...old,route])}/><main style={{padding:24,overflow:"auto"}}>{children}</main><Toaster/></WorkspaceProvider></WorkspaceDraftProvider>
 </div></AlgtFluentProvider></ThemeProvider>;
}
export function WorkspaceBrowserRecord(){
 const pathname=usePathname();return <Record key={pathname} route={pathname}/>;
}
function Record({route}:{route:string}){
 const {tabs,markDirty,markChildDialogOpen}=useWorkspace();const owner=tabs.find(tab=>tab.route.split("?")[0]===route);
 const {getDraftDefault,syncDraft,clearDraft}=useWorkspaceFormDraft({formId:"synthetic-workspace-record",ownerRoute:route});
 const store=useWorkspaceDraftStoreContext()!;
 const draftCount=useSyncExternalStore(store.subscribe,()=>tabs.filter(tab=>store.hasDraft(`draft:tab:${tab.id}:synthetic-workspace-record`)).length,()=>0);
 return <section data-testid="mounted-record-editor"><h1>{owner?.title ?? "Workspace laboratory"}</h1><p>All controls here use synthetic data. No business record can be saved.</p>
 <output aria-label="Retained synthetic drafts">{draftCount} retained synthetic drafts</output>
 <form id="synthetic-workspace-record" onInput={()=>{syncDraft();if(owner)markDirty(owner.id,true);}}>
 <label htmlFor="synthetic-notes">Synthetic notes</label><textarea id="synthetic-notes" name="notes" defaultValue={getDraftDefault("notes")} rows={6} style={{display:"block",width:"100%",maxWidth:700,border:"1px solid var(--border)",padding:8}}/>
 </form><div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:12}}>
 <Button onClick={()=>{clearDraft();if(owner)markDirty(owner.id,false);}}>Clear synthetic draft</Button>
 <Button disabled={!owner?.closable || owner?.childDialogOpen} onClick={()=>owner&&markChildDialogOpen(owner.id,true)}>Start pending task</Button>
 <Button disabled={!owner?.childDialogOpen} onClick={()=>owner&&markChildDialogOpen(owner.id,false)}>Finish pending task</Button></div>
 <label style={{display:"block",marginTop:20}}>Synthetic Status <select aria-label="Synthetic Status" defaultValue="Active"><option>Active</option><option>Probation</option><option>Archived</option></select></label>
 </section>;
}
