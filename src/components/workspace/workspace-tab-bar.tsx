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

import { useRef } from "react";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/hooks/use-workspace";
import { WorkspaceTabChip } from "./workspace-tab";

export function WorkspaceTabBar() {
  const { tabs, activeTab, setActiveTab, closeTab, isHydrated } = useWorkspace();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Sort: pinned tabs first, then by openedAt
  const sortedTabs = [...tabs].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime();
  });

  if (!isHydrated) {
    // Render a skeleton bar while hydrating to avoid layout shift
    return (
      <div className="h-10 border-b border-border/60 bg-muted/30 flex items-end px-2 shrink-0 z-[30] relative pointer-events-auto" />
    );
  }

  return (
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
    </div>
  );
}
