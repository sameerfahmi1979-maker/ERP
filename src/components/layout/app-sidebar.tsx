"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  LayoutDashboard,
  Users,
  Building2,
  GitBranch,
  Shield,
  ScrollText,
  Truck,
  UserCog,
  Wrench,
  HardHat,
  DollarSign,
  Package,
  FileText,
  ShoppingCart,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Settings,
  LogOut,
  Binary,
  Database,
  FolderTree,
  Lock,
  Globe,
  MapPin,
  Building,
  Map,
  Anchor,
  Coins,
  CalendarClock,
  Percent,
  Landmark,
  Target,
  TrendingUp,
  Ruler,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { signOut } from "@/features/auth/actions";

interface NavItem {
  label: string;
  icon: LucideIcon;
  path: string;
  badge?: string;
  /** Future module — no route exists yet; rendered disabled (3E.4 QA gate). */
  comingSoon?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Users", icon: Users, path: "/admin/users" },
      { label: "Organizations", icon: Building2, path: "/admin/organizations" },
      { label: "Branches", icon: GitBranch, path: "/admin/branches" },
      { label: "Roles", icon: Shield, path: "/admin/roles" },
      { label: "Permissions", icon: Shield, path: "/admin/permissions" },
      { label: "Numbering Rules", icon: Binary, path: "/admin/settings/numbering" },
      { label: "Master Data", icon: Database, path: "/admin/master-data" },
      { label: "Lookup Categories", icon: FolderTree, path: "/admin/master-data/lookups/categories" },
      { label: "Lookup Values", icon: FolderTree, path: "/admin/master-data/lookups/values" },
      { label: "Locked System Values", icon: Lock, path: "/admin/master-data/lookups/system" },
      { label: "Audit Logs", icon: ScrollText, path: "/admin/audit" },
    ],
  },
  {
    label: "Geography & Locations",
    items: [
      { label: "Countries", icon: Globe, path: "/admin/master-data/geography/countries" },
      { label: "Regions / Emirates", icon: Building, path: "/admin/master-data/geography/emirates" },
      { label: "Cities", icon: MapPin, path: "/admin/master-data/geography/cities" },
      { label: "Areas & Zones", icon: Map, path: "/admin/master-data/geography/areas" },
      { label: "Ports", icon: Anchor, path: "/admin/master-data/geography/ports" },
    ],
  },
  {
    label: "Party Master",
    items: [
      { label: "Customers", icon: Users, path: "/admin/master-data/customers" },
    ],
  },
  {
    label: "Finance Basics",
    items: [
      { label: "Currencies", icon: Coins, path: "/admin/master-data/finance-basics/currencies" },
      { label: "Payment Terms", icon: CalendarClock, path: "/admin/master-data/finance-basics/payment-terms" },
      { label: "Tax Types", icon: Percent, path: "/admin/master-data/finance-basics/tax-types" },
      { label: "Banks", icon: Landmark, path: "/admin/master-data/finance-basics/banks" },
      { label: "Cost Centers", icon: Target, path: "/admin/master-data/finance-basics/cost-centers" },
      { label: "Profit Centers", icon: TrendingUp, path: "/admin/master-data/finance-basics/profit-centers" },
    ],
  },
  {
    label: "Units & Measurements",
    items: [
      { label: "UOM Categories", icon: Ruler, path: "/admin/master-data/uom/categories" },
      { label: "Units of Measure", icon: Ruler, path: "/admin/master-data/uom/units" },
      { label: "UOM Conversions", icon: Ruler, path: "/admin/master-data/uom/conversions" },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Fleet Management", icon: Truck, path: "/modules/fleet", comingSoon: true },
      { label: "HR & Payroll", icon: UserCog, path: "/modules/hr", comingSoon: true },
      { label: "Workshop", icon: Wrench, path: "/modules/workshop", comingSoon: true },
      { label: "HSE", icon: HardHat, path: "/modules/hse", comingSoon: true },
    ],
  },
  {
    label: "Finance & Supply",
    items: [
      { label: "Finance", icon: DollarSign, path: "/modules/finance", comingSoon: true },
      { label: "Inventory", icon: Package, path: "/modules/inventory", comingSoon: true },
      { label: "Procurement", icon: ShoppingCart, path: "/modules/procurement", comingSoon: true },
      { label: "Documents", icon: FileText, path: "/modules/documents", comingSoon: true },
    ],
  },
];

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function AppSidebar({ collapsed, onToggle }: AppSidebarProps) {
  const pathname = usePathname();
  
  // Initialize with all groups collapsed - manual control only
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);

  // Manual multi-open behavior: toggle individual groups without affecting others
  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) =>
      prev.includes(label)
        ? prev.filter((g) => g !== label)  // Close this group
        : [...prev, label]                   // Open this group, keep others
    );
  };

  const isActive = (path: string) => pathname === path;

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <TooltipProvider delay={0}>
      <aside
        className={cn(
          "h-screen flex flex-col border-r border-border/40 bg-card transition-all duration-300 shrink-0",
          collapsed ? "w-[68px]" : "w-[260px]"
        )}
      >
        {/* Logo */}
        <div className="h-14 flex items-center px-4 border-b border-border/40 shrink-0">
          {!collapsed && (
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-xs font-bold text-primary-foreground">AG</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground leading-none">Alliance Gulf</p>
                <p className="text-[10px] text-muted-foreground">Transport ERP</p>
              </div>
            </div>
          )}
          {collapsed && (
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center mx-auto">
              <span className="text-xs font-bold text-primary-foreground">AG</span>
            </div>
          )}
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 py-2">
          <nav className="px-2 space-y-1">
            {navGroups.map((group) => (
              <div key={group.label} className="mb-1">
                {!collapsed && (
                  <button
                    onClick={() => toggleGroup(group.label)}
                    className="flex items-center justify-between w-full px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 hover:text-muted-foreground transition-colors"
                  >
                    {group.label}
                    {expandedGroups.includes(group.label) ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                  </button>
                )}
                {(collapsed || expandedGroups.includes(group.label)) && (
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const active = isActive(item.path);
                      // Future modules have no routes yet — render disabled, never a dead link.
                      const NavButton = item.comingSoon ? (
                        <div
                          key={item.path}
                          aria-disabled="true"
                          className={cn(
                            "flex items-center gap-2.5 w-full rounded-md text-sm font-medium cursor-not-allowed select-none",
                            collapsed ? "justify-center p-2.5" : "px-2.5 py-2",
                            "text-muted-foreground/40"
                          )}
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                          {!collapsed && <span className="truncate">{item.label}</span>}
                          {!collapsed && (
                            <span className="ml-auto text-[10px] bg-muted text-muted-foreground/60 px-1.5 py-0.5 rounded-full font-medium">
                              Soon
                            </span>
                          )}
                        </div>
                      ) : (
                        <Link
                          key={item.path}
                          href={item.path}
                          className={cn(
                            "flex items-center gap-2.5 w-full rounded-md text-sm font-medium transition-colors",
                            collapsed ? "justify-center p-2.5" : "px-2.5 py-2",
                            active
                              ? "bg-primary/10 text-primary dark:bg-primary/20"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                          )}
                        >
                          <item.icon className={cn("h-4 w-4 shrink-0", active && "text-primary")} />
                          {!collapsed && <span className="truncate">{item.label}</span>}
                          {!collapsed && item.badge && (
                            <span className="ml-auto text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
                              {item.badge}
                            </span>
                          )}
                        </Link>
                      );

                      if (collapsed) {
                        return (
                          <Tooltip key={item.path}>
                            <TooltipTrigger render={NavButton} />
                            <TooltipContent side="right" className="text-xs">
                              {item.comingSoon ? `${item.label} (coming soon)` : item.label}
                            </TooltipContent>
                          </Tooltip>
                        );
                      }
                      return NavButton;
                    })}
                  </div>
                )}
              </div>
            ))}
          </nav>
        </ScrollArea>

        {/* Footer */}
        <div className="border-t border-border/40 p-2 shrink-0 space-y-0.5">
          {collapsed ? (
            <>
              <Tooltip>
                <TooltipTrigger render={
                  <Link href="/settings" className="flex items-center justify-center w-full p-2.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                    <Settings className="h-4 w-4" />
                  </Link>
                } />
                <TooltipContent side="right" className="text-xs">Settings</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger render={
                  <button
                    onClick={handleSignOut}
                    className="flex items-center justify-center w-full p-2.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                } />
                <TooltipContent side="right" className="text-xs">Logout</TooltipContent>
              </Tooltip>
            </>
          ) : (
            <>
              <Link href="/settings" className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </Link>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                <span>Logout</span>
              </button>
            </>
          )}
        </div>

        {/* Collapse toggle */}
        <div className="border-t border-border/40 p-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            className="w-full h-8 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
            {!collapsed && <span className="ml-2 text-xs">Collapse</span>}
          </Button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
