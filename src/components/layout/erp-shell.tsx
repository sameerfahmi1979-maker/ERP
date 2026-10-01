"use client";

import { useState } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { WorkspaceContent } from "@/components/workspace/workspace-content";
import { WorkspaceProvider } from "@/components/workspace/workspace-provider";
import { WorkspaceDraftProvider } from "@/components/workspace/workspace-draft-provider";
import { WorkspaceUiMemoryProvider } from "@/hooks/use-persistent-ui-state";
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
  principalId: string;
  children: React.ReactNode;
  displayName?: string | null;
  email?: string | null;
  /** ERP USERS.4 — permission codes for sidebar filtering */
  permissionCodes?: string[];
  globalPermissionCodes?: string[];
  /** ERP USERS.4 — true for system_admin and group_admin (bypass all sidebar permission checks) */
  isGlobalAdmin?: boolean;
  /** BRANDING.2 — tenant-global app shell branding */
  appBranding?: RuntimeAppBranding;
};

export function ErpShell({
  principalId,
  children,
  displayName,
  email,
  permissionCodes = [],
  globalPermissionCodes = [],
  isGlobalAdmin = false,
  appBranding,
}: ErpShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavigation, setMobileNavigation] = useState(false);

  // Compute the workspace home tab route based on the user's permissions.
  // This is client-side but uses the permissionCodes passed from the server (layout.tsx).
  const defaultRoute = getDefaultRoute(permissionCodes, isGlobalAdmin);

  return (
    // WorkspaceDraftProvider must wrap WorkspaceProvider so it can consume the draft
    // store context to clear drafts on tab close.
    <WorkspaceUiMemoryProvider key={principalId}><WorkspaceDraftProvider key={principalId}>
      <WorkspaceProvider defaultRoute={defaultRoute} principalId={principalId} canRestoreRoute={route => canAccessRoute(route.split("?")[0], permissionCodes, isGlobalAdmin)}>
        <RealtimeProvider>
          <div className="algt-shell">
            <a className="algt-skip-link" href="#erp-main-content">Skip to content</a>
            <AppHeader displayName={displayName} email={email} appName={appBranding?.appName}
              canSearch={canAccessRoute('/search', permissionCodes, isGlobalAdmin)} onOpenNavigation={() => setMobileNavigation(true)} />
            <div className="algt-shell-body">
            <div className="algt-desktop-nav">
            <AppSidebar
              collapsed={sidebarCollapsed}
              onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
              displayName={displayName}
              email={email}
              permissionCodes={permissionCodes}
              globalPermissionCodes={globalPermissionCodes}
              isGlobalAdmin={isGlobalAdmin}
              appBranding={appBranding}
            />
            </div>
            <Dialog open={mobileNavigation} onOpenChange={setMobileNavigation}>
              <DialogContent className="algt-mobile-nav max-w-none w-full p-0 gap-0 rounded-none translate-x-0 translate-y-0 left-0 top-0 h-dvh">
                <DialogTitle className="p-4 border-b">Navigation</DialogTitle>
                <AppSidebar collapsed={false} onToggle={() => setMobileNavigation(false)}
                  onNavigate={() => setMobileNavigation(false)} displayName={displayName} email={email}
                  permissionCodes={permissionCodes} globalPermissionCodes={globalPermissionCodes} isGlobalAdmin={isGlobalAdmin} appBranding={appBranding} />
              </DialogContent>
            </Dialog>
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              <WorkspaceContent>
                {children}
              </WorkspaceContent>
            </div>
            </div>
          </div>
        </RealtimeProvider>
      </WorkspaceProvider>
    </WorkspaceDraftProvider></WorkspaceUiMemoryProvider>
  );
}
