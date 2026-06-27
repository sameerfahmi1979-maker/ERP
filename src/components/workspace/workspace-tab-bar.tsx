"use client";

/**
 * ERP GLOBAL UI.4A — WorkspaceTabBar
 * ERP GLOBAL UI.4G — z-index lowered to z-[30] so child dialog overlay (z-[100])
 *   intentionally covers and blocks the tab bar while a child form is open.
 *   Design decision: child forms are blocking modal tasks; tab switching is
 *   disabled while a child dialog is open.
 *
 * Chrome-style horizontal tab bar rendered below AppHeader.
 * Height: h-10 (40px).
 */

import { useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/hooks/use-workspace";
import { WorkspaceTabChip } from "./workspace-tab";
import { UnsavedChangesDialog } from "@/components/erp/unsaved-changes-dialog";

export function WorkspaceTabBar() {
  const { tabs, activeTab, setActiveTab, closeTab, closeAllClosableTabs, isHydrated } = useWorkspace();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [confirmCloseAllOpen, setConfirmCloseAllOpen] = useState(false);

  // Sort: pinned tabs first, then by openedAt
  const sortedTabs = [...tabs].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime();
  });

  const closableTabs = tabs.filter((t) => t.closable);
  const dirtyCount = closableTabs.filter((t) => t.dirty).length;

  const handleCloseAll = () => {
    if (closableTabs.length === 0) return;
    if (dirtyCount > 0) {
      setConfirmCloseAllOpen(true);
    } else {
      closeAllClosableTabs();
    }
  };

  if (!isHydrated) {
    // Render a skeleton bar while hydrating to avoid layout shift
    return (
      <div className="h-10 border-b border-border/60 bg-muted/30 flex items-end px-2 shrink-0 z-[30] relative pointer-events-auto" />
    );
  }

  return (
    <>
      <div
        className={cn(
          "h-10 border-b border-border/60 bg-muted/30 flex items-end",
          // z-[30]: child dialog overlay (z-[100]) must cover the tab bar while
          // a child form is open, intentionally blocking tab switching.
          "shrink-0 z-[30] relative pointer-events-auto"
        )}
      >
        {/* Scrollable tab row */}
        <div
          ref={scrollRef}
          className="flex items-end overflow-x-auto scrollbar-none flex-1 min-w-0"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {sortedTabs.map((tab) => (
            <WorkspaceTabChip
              key={tab.id}
              tab={tab}
              isActive={activeTab?.id === tab.id}
              onActivate={setActiveTab}
              onClose={closeTab}
            />
          ))}
        </div>

        {/* Close All button — only visible when there are closable tabs open */}
        {closableTabs.length > 0 && (
          <button
            onClick={handleCloseAll}
            title="Close all tabs"
            className={cn(
              "flex items-center gap-1 shrink-0 h-7 px-2 mx-1 mb-1 rounded",
              "text-xs text-muted-foreground",
              "border border-border/50",
              "hover:text-destructive hover:border-destructive/40 hover:bg-destructive/5",
              "transition-colors duration-150"
            )}
          >
            <X className="h-3 w-3" />
            Close all
          </button>
        )}
      </div>

      {/* Dirty-aware close-all confirmation dialog */}
      <UnsavedChangesDialog
        open={confirmCloseAllOpen}
        onOpenChange={setConfirmCloseAllOpen}
        title="Close all tabs?"
        description={
          dirtyCount === 1
            ? "1 tab has unsaved changes. Closing all tabs will discard those changes."
            : `${dirtyCount} tabs have unsaved changes. Closing all tabs will discard those changes.`
        }
        stayLabel="Keep tabs open"
        discardLabel="Close all & discard"
        onStay={() => setConfirmCloseAllOpen(false)}
        onDiscard={() => {
          setConfirmCloseAllOpen(false);
          closeAllClosableTabs();
        }}
      />
    </>
  );
}
