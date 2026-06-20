"use client";

import { useState } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { WorkspaceTabBar } from "@/components/workspace/workspace-tab-bar";
import { WorkspaceContent } from "@/components/workspace/workspace-content";

type ErpShellProps = {
  children: React.ReactNode;
  displayName?: string | null;
  email?: string | null;
};

export function ErpShell({ children, displayName, email }: ErpShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <AppSidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          displayName={displayName}
          email={email}
        />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AppHeader displayName={displayName} email={email} />
        <WorkspaceTabBar />
        <WorkspaceContent>
          {children}
        </WorkspaceContent>
      </div>
    </div>
  );
}
