"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Navigation20Regular, Search20Regular } from "@fluentui/react-icons";
import { User, Settings, LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { signOut } from "@/lib/auth/logout-client";
import { NotificationBell } from "@/components/erp/notification-bell";
import { toast } from "sonner";
import { navigateAfterIdentityChange } from "@/lib/auth/client-session";
import { OpenWorkspaces } from "@/components/workspace/open-workspaces";
import { useWorkspaceContext } from "@/components/workspace/workspace-provider";

type AppHeaderProps = {
  displayName?: string | null;
  email?: string | null;
  appName?: string;
  canSearch?: boolean;
  onOpenNavigation?: () => void;
};

export function AppHeader({ displayName, email, appName = "ALGT ERP", canSearch = false, onOpenNavigation }: AppHeaderProps) {
  const workspace = useWorkspaceContext();
  const activeTab = workspace?.state.tabs.find(tab => tab.id === workspace.state.activeTabId);
  const isHydrated = workspace?.state.isHydrated ?? false;
  useEffect(() => {
    if (isHydrated && activeTab?.title) document.title = `${activeTab.title} | ${appName}`;
  }, [activeTab?.title, appName, isHydrated]);
  const initials = (displayName ?? email ?? "U").slice(0, 2).toUpperCase();
  const handleSignOut = async () => {
    try {
      const result = await signOut();
      if (!result.success) toast.error(result.error);
      else navigateAfterIdentityChange();
    } catch { toast.error("Sign out could not be confirmed. Please retry."); }
  };
  return <>
    <header className="algt-global-header">
      {onOpenNavigation && <Button type="button" variant="ghost" size="icon" className="algt-mobile-menu" onClick={onOpenNavigation} aria-label="Open navigation"><Navigation20Regular /></Button>}
      <span className="algt-shell-brand">{appName}</span>
      <div className="flex-1" />
      {canSearch && <Link href="/search" aria-label="Search ERP" className="inline-flex items-center gap-2 p-2 text-sm"><Search20Regular /><span className="hidden lg:inline">Search</span></Link>}
      {workspace && <OpenWorkspaces />}
      <ThemeToggle className="h-10 w-10 p-0 [&_svg]:h-4 [&_svg]:w-4" />
      <NotificationBell />
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" aria-label={`Account menu for ${displayName ?? email ?? "user"}`} className="h-10 px-2">
          <Avatar className="h-7 w-7"><AvatarFallback className="text-xs font-semibold bg-white/15 text-white">{initials}</AvatarFallback></Avatar>
          <span className="hidden xl:inline max-w-36 truncate">{displayName ?? email}</span>
        </Button>} />
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem render={<Link href="/profile" />}><User className="mr-2 h-4 w-4" />Profile</DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/settings" />}><Settings className="mr-2 h-4 w-4" />Settings</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut} variant="destructive"><LogOut className="mr-2 h-4 w-4" />Sign out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
    <div className="algt-page-identity truncate" title={activeTab?.title}>{isHydrated ? activeTab?.title ?? appName : appName}</div>
  </>;
}
