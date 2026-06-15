"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bell, Search, Moon, Sun, User, Settings, LogOut } from "lucide-react";
import { useTheme } from "next-themes";
import { signOut } from "@/features/auth/actions";

type AppHeaderProps = {
  displayName?: string | null;
  email?: string | null;
};

export function AppHeader({ displayName, email }: AppHeaderProps) {
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();

  const getPageTitle = () => {
    if (pathname === "/" || pathname === "/dashboard") return "Dashboard";
    if (pathname === "/admin/users") return "User Management";
    if (pathname === "/admin/organizations") return "Organizations";
    if (pathname === "/admin/branches") return "Branches";
    if (pathname === "/admin/roles") return "Roles & Permissions";
    if (pathname === "/admin/permissions") return "Permissions";
    if (pathname === "/admin/audit") return "Audit Logs";
    if (pathname === "/profile") return "Profile";
    if (pathname === "/settings") return "Settings";
    return "ERP";
  };

  const initials = (displayName ?? email ?? "U").slice(0, 2).toUpperCase();

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <header className="h-14 border-b border-border/40 bg-card px-4 flex items-center justify-between shrink-0">
      {/* Left: Page title */}
      <div className="flex items-center gap-4">
        <h2 className="text-base font-semibold text-foreground">{getPageTitle()}</h2>
      </div>

      {/* Center: Search */}
      <div className="hidden md:flex flex-1 max-w-md mx-8">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search modules, users, records..."
            className="pl-9 h-9 text-sm bg-muted/30 border-border/40 focus:bg-background"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border/60 font-mono">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1">
        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Moon className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>

        {/* Notifications */}
        <Button variant="ghost" size="sm" className="h-9 w-9 p-0 relative">
          <Bell className="h-4 w-4 text-muted-foreground" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-red-500 rounded-full" />
        </Button>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger render={
            <Button variant="ghost" size="sm" className="h-9 gap-2 px-2 ml-1">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="text-[10px] font-semibold bg-primary/10 text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="hidden lg:flex flex-col items-start">
                <span className="text-xs font-medium text-foreground">{displayName ?? email?.split('@')[0]}</span>
                <span className="text-[10px] text-muted-foreground">Administrator</span>
              </div>
            </Button>
          } />
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem render={<Link href="/profile" />}>
              <User className="h-4 w-4 mr-2" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/settings" />}>
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<div onClick={handleSignOut} className="flex w-full items-center cursor-pointer" />} variant="destructive">
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
