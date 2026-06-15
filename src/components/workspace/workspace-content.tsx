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

interface WorkspaceContentProps {
  children: ReactNode;
  className?: string;
}

export function WorkspaceContent({ children, className }: WorkspaceContentProps) {
  return (
    <main
      className={cn(
        "flex-1 overflow-auto bg-gray-50/40 dark:bg-slate-950/40 p-6 lg:p-8",
        className
      )}
    >
      {children}
    </main>
  );
}
