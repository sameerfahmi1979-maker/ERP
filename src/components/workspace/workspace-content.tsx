"use client";

/**
 * ERP GLOBAL UI.4A — WorkspaceContent
 *
 * Thin wrapper around the main page content area.
 * In 4A this simply renders children with standard padding.
 * Future phases (4B+) can use this to provide per-tab context.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";
import { useWorkspaceContext } from "./workspace-provider";
import { isWorkspaceRoute } from "@/lib/workspace/workspace-route-registry";

interface WorkspaceContentProps {
  children: ReactNode;
  className?: string;
}

export function WorkspaceContent({ children, className }: WorkspaceContentProps) {
  const workspace = useWorkspaceContext();
  const pathname = usePathname();
  const awaitingOwner = workspace && (!workspace.state.isHydrated ||
    (isWorkspaceRoute(pathname) && !workspace.state.tabs.some(tab => tab.route.split("?")[0] === pathname)));
  return (
    <main
      className={cn(
        "flex-1 overflow-auto bg-gray-50/40 dark:bg-slate-950/40 p-6 lg:p-8",
        className
      )}
    >
      {awaitingOwner ? <div role="status">Preparing workspace…</div> : children}
    </main>
  );
}
