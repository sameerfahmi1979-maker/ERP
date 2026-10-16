"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Input } from "@fluentui/react-components";
import { Dismiss20Regular, Search20Regular, WindowMultiple20Regular } from "@fluentui/react-icons";
import { AlgtDialog } from "@/components/design-system/algt-dialog";
import { useWorkspace } from "@/hooks/use-workspace";
import { MAX_TABS } from "@/lib/workspace/workspace-store";

/** Presentation only: all navigation and close operations go through the F04 engine. */
export function OpenWorkspaces() {
  const { tabs, activeTab, isHydrated, setActiveTab, requestCloseTab, closeAllClosableTabs, closeConfirmationOpen } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const closeAllRef = useRef<HTMLButtonElement>(null);
  const closeButtons = useRef(new Map<string, HTMLButtonElement>());
  const returnContext = useRef<{ids:string[];scroll:number;bulk:boolean}|null>(null);
  const working = tabs.filter(tab => tab.closable && !tab.pinned);
  const changeOpen = (next: boolean) => { setOpen(next); if (!next) setSearch(""); };
  const visible = tabs.filter(tab => `${tab.title} ${tab.subtitle ?? ""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const rememberClose = (id?:string) => {
    const index = visible.findIndex(tab => tab.id === id);
    returnContext.current = {
      ids:id ? [id,...visible.slice(index+1).map(tab=>tab.id),...visible.slice(0,index).reverse().map(tab=>tab.id)] : [],
      scroll:listRef.current?.closest(".algt-dialog-content")?.scrollTop ?? 0,
      bulk:!id,
    };
  };
  useEffect(() => {
    if(!open || closeConfirmationOpen || !returnContext.current) return;
    // Fluent mounts its portal/focus trap before restoring the list context.
    const frame=requestAnimationFrame(()=>{
      const context=returnContext.current;
      if(!context) return;
      const next=context.ids.map(id=>closeButtons.current.get(id)).find(button=>button?.isConnected && !button.disabled);
      const target=next ?? (context.bulk && closeAllRef.current && !closeAllRef.current.disabled ? closeAllRef.current : searchRef.current);
      target?.focus({preventScroll:true});
      const scroller=listRef.current?.closest(".algt-dialog-content");
      if(scroller) scroller.scrollTop=context.scroll;
      returnContext.current=null;
    });
    return ()=>cancelAnimationFrame(frame);
  },[tabs,open,closeConfirmationOpen]);
  return <AlgtDialog open={open && !closeConfirmationOpen} onOpenChange={changeOpen} title="Open workspaces"
    actions={<Button ref={closeAllRef} disabled={!working.length || working.some(tab=>tab.childDialogOpen)} onClick={()=>{rememberClose();closeAllClosableTabs();}}>Close all</Button>}
    trigger={<Button className="algt-workspaces-trigger" appearance="transparent" disabled={!isHydrated} icon={<WindowMultiple20Regular />} aria-label={`Open workspaces (${isHydrated ? working.length : 0} of ${MAX_TABS} working screens, plus Home)`}>
      <span className="algt-workspaces-label">Open workspaces</span><span className="ml-2" aria-hidden="true">{isHydrated ? `${working.length} / ${MAX_TABS}` : "…"}</span>
    </Button>}>
    <Input ref={searchRef} aria-label="Search open workspaces" value={search} onChange={(_, data) => setSearch(data.value)} contentBefore={<Search20Regular />} style={{ width: "100%" }} />
    <p className="mt-2 text-sm text-muted-foreground">{working.length} of {MAX_TABS} working screens, plus Home. Close all includes screens hidden by this search and keeps Home. Unsaved work asks for confirmation.</p>
    {working.some(tab=>tab.childDialogOpen) && <p role="status" className="mt-2 text-sm">Finish open tasks and saves before closing all workspaces.</p>}
    <ul ref={listRef} className="algt-workspace-list" aria-label="Workspaces">
      {visible.map(tab => <li key={tab.id} className={tab.id === activeTab?.id ? "is-current" : undefined}>
        <button type="button" className="algt-workspace-destination" aria-current={tab.id === activeTab?.id ? "page" : undefined}
          onClick={() => { changeOpen(false); setActiveTab(tab.id); }}>
          <span className="font-semibold break-words">{tab.title}</span>
          {tab.subtitle && <span className="text-xs break-words">{tab.subtitle}</span>}
          <span className="text-xs">{tab.id === activeTab?.id ? "Current · " : ""}{tab.pinned ? "Home · " : ""}{tab.childDialogOpen ? "Task in progress" : tab.dirty ? "Unsaved changes" : "No unsaved changes"}</span>
        </button>
        {tab.closable && !tab.pinned && <Button appearance="subtle" icon={<Dismiss20Regular />} aria-label={`Close workspace: ${tab.title}`}
          ref={button=>{if(button instanceof HTMLButtonElement)closeButtons.current.set(tab.id,button);else closeButtons.current.delete(tab.id);}}
          disabled={tab.childDialogOpen} onClick={() => { rememberClose(tab.id); requestCloseTab(tab.id); }} />}
      </li>)}
    </ul>
    {!visible.length && <p role="status" className="py-6">No matching open workspaces.</p>}
  </AlgtDialog>;
}
