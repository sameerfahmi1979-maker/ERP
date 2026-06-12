"use client";

import { useState } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";

type ErpShellProps = {
  children: React.ReactNode;
  displayName?: string | null;
  email?: string | null;
};

export function ErpShell({ children, displayName, email }: ErpShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <AppSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AppHeader displayName={displayName} email={email} />
        <main className="flex-1 overflow-auto bg-gray-50/40 dark:bg-slate-950/40 p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
