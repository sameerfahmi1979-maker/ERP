"use client";

/**
 * ERP GLOBAL UI.4A — WorkspaceTabBar
 * ERP GLOBAL UI.4G — z-index lowered to z-[30] so child dialog overlay (z-[100])
 *   intentionally covers and blocks the tab bar while a child form is open.
 *   Design decision: child forms are blocking modal tasks; tab switching is
 *   disabled while a child dialog is open.
 * ERP GLOBAL WORKSPACE.PERF.1 (WS.1) — tab overflow UX:
 *   - active tab auto-scrolls into view
 *   - left/right chevron scroll buttons appear when the strip overflows
 *   - mouse wheel scrolls the strip horizontally
 *   - "All tabs" dropdown lists every open tab (activate + close)
 *   - compact chip density when many tabs are open
 *
 * Chrome-style horizontal tab bar rendered below AppHeader.
 * Height: h-10 (40px).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/hooks/use-workspace";
import { WorkspaceTabChip } from "./workspace-tab";
import { UnsavedChangesDialog } from "@/components/erp/unsaved-changes-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Chip density switches to compact above this open-tab count (WS.1). */
const COMPACT_THRESHOLD = 8;
/** Pixels scrolled per chevron click. */
const CHEVRON_SCROLL_STEP = 240;

export function WorkspaceTabBar() {
  const { tabs, activeTab, setActiveTab, closeTab, closeAllClosableTabs, isHydrated } = useWorkspace();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [confirmCloseAllOpen, setConfirmCloseAllOpen] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Sort: pinned tabs first, then by openedAt
  const sortedTabs = [...tabs].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime();
  });

  const closableTabs = tabs.filter((t) => t.closable);
  const dirtyCount = closableTabs.filter((t) => t.dirty).length;
  const compact = sortedTabs.length > COMPACT_THRESHOLD;
  const isOverflowing = canScrollLeft || canScrollRight;

  // ── WS.1: overflow detection (scroll + resize + tab count changes) ─────────
  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // 1px tolerance for sub-pixel rounding
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener("scroll", updateScrollState, { passive: true });
    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(el);
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      resizeObserver.disconnect();
    };
  }, [updateScrollState, sortedTabs.length]);

  // ── WS.1: auto-scroll the active tab into view ──────────────────────────────
  useEffect(() => {
    if (!activeTab) return;
    const el = scrollRef.current;
    if (!el) return;
    const chip = el.querySelector<HTMLElement>(`[data-tab-id="${activeTab.id}"]`);
    chip?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
  }, [activeTab, sortedTabs.length]);

  // ── WS.1: mouse wheel → horizontal scroll (Chrome tab-strip behavior) ──────
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    el.scrollLeft += delta;
  }, []);

  const scrollByStep = useCallback((direction: -1 | 1) => {
    scrollRef.current?.scrollBy({ left: direction * CHEVRON_SCROLL_STEP, behavior: "smooth" });
  }, []);

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
        {/* Left chevron — only when scrolled right of the start */}
        {isOverflowing && (
          <button
            type="button"
            aria-label="Scroll tabs left"
            disabled={!canScrollLeft}
            onClick={() => scrollByStep(-1)}
            className={cn(
              "shrink-0 h-9 w-6 flex items-center justify-center border-r border-border/40",
              "text-muted-foreground hover:text-foreground hover:bg-muted transition-colors",
              !canScrollLeft && "opacity-30 pointer-events-none"
            )}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}

        {/* Scrollable tab row */}
        <div
          ref={scrollRef}
          onWheel={handleWheel}
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
              compact={compact}
            />
          ))}
        </div>

        {/* Right chevron — only when more tabs exist to the right */}
        {isOverflowing && (
          <button
            type="button"
            aria-label="Scroll tabs right"
            disabled={!canScrollRight}
            onClick={() => scrollByStep(1)}
            className={cn(
              "shrink-0 h-9 w-6 flex items-center justify-center border-l border-border/40",
              "text-muted-foreground hover:text-foreground hover:bg-muted transition-colors",
              !canScrollRight && "opacity-30 pointer-events-none"
            )}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}

        {/* WS.1: "All tabs" dropdown — every open tab reachable regardless of overflow */}
        {sortedTabs.length > 1 && (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="List all open tabs"
              title="All open tabs"
              className={cn(
                "flex items-center gap-0.5 shrink-0 h-7 px-1.5 mx-1 mb-1 rounded",
                "text-xs text-muted-foreground border border-border/50",
                "hover:text-foreground hover:bg-muted transition-colors duration-150"
              )}
            >
              <ChevronDown className="h-3.5 w-3.5" />
              <span className="tabular-nums">{sortedTabs.length}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 max-h-96">
              {/* Base UI: GroupLabel must live inside a Menu.Group */}
              <DropdownMenuGroup>
                <DropdownMenuLabel>Open tabs ({sortedTabs.length})</DropdownMenuLabel>
              </DropdownMenuGroup>
              {sortedTabs.map((tab) => (
                <DropdownMenuItem
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-2",
                    activeTab?.id === tab.id && "bg-accent/60"
                  )}
                >
                  {/* Dirty indicator */}
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full shrink-0",
                      tab.dirty ? "bg-amber-500 animate-pulse" : "bg-transparent"
                    )}
                  />
                  <span className="flex-1 min-w-0 truncate text-sm">{tab.title}</span>
                  {tab.subtitle && (
                    <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[80px]">
                      {tab.subtitle}
                    </span>
                  )}
                  {tab.closable && (
                    <span
                      role="button"
                      aria-label={`Close ${tab.title}`}
                      className="shrink-0 h-4 w-4 rounded flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        closeTab(tab.id);
                      }}
                    >
                      <X className="h-3 w-3" />
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

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
            {!compact && "Close all"}
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
