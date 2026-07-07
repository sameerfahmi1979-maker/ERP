"use client";

import { useState } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { WorkspaceTabBar } from "@/components/workspace/workspace-tab-bar";
import { WorkspaceContent } from "@/components/workspace/workspace-content";
import { WorkspaceProvider } from "@/components/workspace/workspace-provider";
import { WorkspaceDraftProvider } from "@/components/workspace/workspace-draft-provider";
import { RealtimeProvider } from "@/components/layout/realtime-provider";
import { canAccessRoute } from "@/lib/rbac/route-access-registry";
import type { RuntimeAppBranding } from "@/lib/branding/runtime-types";

// ERP USERS.4 — Priority-ordered fallback routes for the workspace home tab
const HOME_ROUTE_PRIORITY = [
  "/dashboard",
  "/admin/hr/dashboard",
  "/dms",
  "/admin/reports",
  "/admin/users",
  "/admin/master-data/parties",
  "/notifications",
];

function getDefaultRoute(permissionCodes: string[], isGlobalAdmin: boolean): string {
  for (const route of HOME_ROUTE_PRIORITY) {
    if (canAccessRoute(route, permissionCodes, isGlobalAdmin)) return route;
  }
  return "/no-access";
}

type ErpShellProps = {
  children: React.ReactNode;
  displayName?: string | null;
  email?: string | null;
  /** ERP USERS.4 — permission codes for sidebar filtering */
  permissionCodes?: string[];
  /** ERP USERS.4 — true for system_admin and group_admin (bypass all sidebar permission checks) */
  isGlobalAdmin?: boolean;
  /** BRANDING.2 — tenant-global app shell branding */
  appBranding?: RuntimeAppBranding;
};

export function ErpShell({
  children,
  displayName,
  email,
  permissionCodes = [],
  isGlobalAdmin = false,
  appBranding,
}: ErpShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Compute the workspace home tab route based on the user's permissions.
  // This is client-side but uses the permissionCodes passed from the server (layout.tsx).
  const defaultRoute = getDefaultRoute(permissionCodes, isGlobalAdmin);

  return (
    // WorkspaceDraftProvider must wrap WorkspaceProvider so it can consume the draft
    // store context to clear drafts on tab close.
    <WorkspaceDraftProvider>
      <WorkspaceProvider defaultRoute={defaultRoute}>
        <RealtimeProvider>
          <div className="flex h-screen w-full overflow-hidden bg-background">
            <AppSidebar
              collapsed={sidebarCollapsed}
              onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
              displayName={displayName}
              email={email}
              permissionCodes={permissionCodes}
              isGlobalAdmin={isGlobalAdmin}
              appBranding={appBranding}
            />
            <div className="flex flex-1 flex-col overflow-hidden">
              <AppHeader displayName={displayName} email={email} />
              <WorkspaceTabBar />
              <WorkspaceContent>
                {children}
              </WorkspaceContent>
            </div>
          </div>
        </RealtimeProvider>
      </WorkspaceProvider>
    </WorkspaceDraftProvider>
  );
}
