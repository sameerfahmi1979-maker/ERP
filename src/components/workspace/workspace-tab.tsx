"use client";

/**
 * ERP GLOBAL UI.4A — WorkspaceTab chip component
 * ERP GLOBAL WORKSPACE.PERF.1 (WS.1/WS.2):
 *   - data-tab-id attribute for active-tab scroll-into-view
 *   - compact density mode when many tabs are open
 *   - route prefetch on hover so activating the tab is near-instant
 *
 * A single tab in the workspace tab bar.
 */

import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkspaceTab } from "@/lib/workspace/workspace-types";

interface WorkspaceTabProps {
  tab: WorkspaceTab;
  isActive: boolean;
  onActivate: (tabId: string) => void;
  onClose: (tabId: string) => void;
  /** WS.1: reduced min-width + hidden subtitle when many tabs are open */
  compact?: boolean;
}

export function WorkspaceTabChip({
  tab,
  isActive,
  onActivate,
  onClose,
  compact = false,
}: WorkspaceTabProps) {
  const router = useRouter();

  return (
    <div
      role="tab"
      aria-selected={isActive}
      data-tab-id={tab.id}
      className={cn(
        "group relative flex items-center gap-1.5 h-9 shrink-0 select-none cursor-pointer",
        "border-r border-border/40 transition-colors",
        compact ? "max-w-[140px] min-w-[60px] px-2" : "max-w-[180px] min-w-[80px] px-3",
        isActive
          ? "bg-background text-foreground border-b-2 border-b-primary shadow-sm"
          : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground border-b-2 border-b-transparent"
      )}
      onClick={() => onActivate(tab.id)}
      onMouseEnter={() => {
        // WS.2: warm the router cache so switching to this tab is instant
        // (combined with staleTimes.dynamic in next.config.ts).
        if (!isActive) router.prefetch(tab.route);
      }}
      title={tab.subtitle ? `${tab.title} — ${tab.subtitle}` : tab.title}
    >
      {/* Dirty indicator dot */}
      {tab.dirty && (
        <span
          className="absolute left-1.5 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse shrink-0"
          aria-label="Unsaved changes"
        />
      )}

      {/* Title */}
      <span
        className={cn(
          "text-xs font-medium truncate leading-none",
          tab.dirty && "pl-2.5"
        )}
      >
        {tab.title}
      </span>

      {/* Subtitle badge — hidden in compact density */}
      {tab.subtitle && !compact && (
        <span className="text-[10px] text-muted-foreground/70 font-mono truncate hidden lg:block">
          {tab.subtitle}
        </span>
      )}

      {/* Close button — hidden for pinned tabs */}
      {tab.closable && (
        <button
          type="button"
          aria-label={`Close ${tab.title}`}
          className={cn(
            "shrink-0 h-4 w-4 rounded flex items-center justify-center transition-colors ml-0.5",
            "opacity-0 group-hover:opacity-100",
            isActive && "opacity-60",
            "hover:!opacity-100 hover:bg-destructive/10 hover:text-destructive"
          )}
          onClick={(e) => {
            e.stopPropagation();
            onClose(tab.id);
          }}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
