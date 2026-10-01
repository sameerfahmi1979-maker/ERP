"use client";

import { useState } from "react";
import { Button, Input } from "@fluentui/react-components";
import { Dismiss20Regular, Search20Regular, WindowMultiple20Regular } from "@fluentui/react-icons";
import { AlgtDialog } from "@/components/design-system/algt-dialog";
import { useWorkspace } from "@/hooks/use-workspace";

/** Presentation only: all navigation and close operations go through the F04 engine. */
export function OpenWorkspaces() {
  const { tabs, activeTab, isHydrated, setActiveTab, requestCloseTab } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const changeOpen = (next: boolean) => { setOpen(next); if (!next) setSearch(""); };
  const visible = tabs.filter(tab => `${tab.title} ${tab.subtitle ?? ""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <AlgtDialog open={open} onOpenChange={changeOpen} title="Open workspaces"
    trigger={<Button className="algt-workspaces-trigger" appearance="transparent" disabled={!isHydrated} icon={<WindowMultiple20Regular />} aria-label={`Open workspaces (${isHydrated ? tabs.length : 0})`}>
      <span className="algt-workspaces-label">Open workspaces</span><span className="ml-2" aria-hidden="true">{isHydrated ? tabs.length : "…"}</span>
    </Button>}>
    <Input aria-label="Search open workspaces" value={search} onChange={(_, data) => setSearch(data.value)} contentBefore={<Search20Regular />} style={{ width: "100%" }} />
    <p className="mt-2 text-sm text-muted-foreground">Switch without discarding your draft. Close asks about unsaved work.</p>
    <ul className="algt-workspace-list" aria-label="Workspaces">
      {visible.map(tab => <li key={tab.id} className={tab.id === activeTab?.id ? "is-current" : undefined}>
        <button type="button" className="algt-workspace-destination" aria-current={tab.id === activeTab?.id ? "page" : undefined}
          onClick={() => { changeOpen(false); setActiveTab(tab.id); }}>
          <span className="font-semibold break-words">{tab.title}</span>
          {tab.subtitle && <span className="text-xs break-words">{tab.subtitle}</span>}
          <span className="text-xs">{tab.id === activeTab?.id ? "Current · " : ""}{tab.pinned ? "Home · " : ""}{tab.childDialogOpen ? "Task in progress" : tab.dirty ? "Unsaved changes" : "No unsaved changes"}</span>
        </button>
        {tab.closable && !tab.pinned && <Button appearance="subtle" icon={<Dismiss20Regular />} aria-label={`Close workspace: ${tab.title}`}
          disabled={tab.childDialogOpen} onClick={() => { changeOpen(false); requestCloseTab(tab.id); }} />}
      </li>)}
    </ul>
    {!visible.length && <p role="status" className="py-6">No matching open workspaces.</p>}
  </AlgtDialog>;
}
