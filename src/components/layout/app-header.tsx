"use client";

import Link from "next/link";
import { LogOutIcon, UserIcon } from "lucide-react";
import { signOut } from "@/features/auth/actions";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";

type AppHeaderProps = {
  displayName?: string | null;
  email?: string | null;
};

export function AppHeader({ displayName, email }: AppHeaderProps) {
  const initials = (displayName ?? email ?? "U").slice(0, 2).toUpperCase();

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger />
      <div className="flex-1" />
      <ThemeToggle />
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" className="flex items-center gap-2 px-2">
              <Avatar>
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <span className="hidden text-sm sm:inline">{displayName ?? email}</span>
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem render={<Link href="/profile" />}>
            <UserIcon />
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/settings" />}>
            Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            render={
              <form action={signOut}>
                <button type="submit" className="flex w-full items-center gap-2">
                  <LogOutIcon />
                  Sign out
                </button>
              </form>
            }
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
