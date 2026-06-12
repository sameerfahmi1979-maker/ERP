"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2Icon,
  ClipboardListIcon,
  GitBranchIcon,
  LayoutDashboardIcon,
  ShieldIcon,
  UsersIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const mainNav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
];

const adminNav = [
  { href: "/admin/users", label: "Users", icon: UsersIcon },
  { href: "/admin/roles", label: "Roles", icon: ShieldIcon },
  { href: "/admin/permissions", label: "Permissions", icon: ShieldIcon },
  { href: "/admin/organizations", label: "Organizations", icon: Building2Icon },
  { href: "/admin/branches", label: "Branches", icon: GitBranchIcon },
  { href: "/admin/audit", label: "Audit Logs", icon: ClipboardListIcon },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar>
      <SidebarHeader className="border-b px-4 py-3">
        <Link href="/dashboard" className="font-semibold tracking-tight">
          ERP Foundation
        </Link>
        <p className="text-xs text-muted-foreground">Alliance Gulf Transport</p>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={pathname === item.href}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Administration</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {adminNav.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={pathname.startsWith(item.href)}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Future Modules</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {[
                "HR",
                "Fleet",
                "Workshop",
                "Operations",
                "Rental",
                "DMS",
                "HSE",
                "Inventory",
                "Procurement",
                "Finance",
              ].map((label) => (
                <SidebarMenuItem key={label}>
                  <SidebarMenuButton disabled className={cn("opacity-60")}>
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
