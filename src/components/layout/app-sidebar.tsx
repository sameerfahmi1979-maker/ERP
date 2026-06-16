"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
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
  ChevronUp,
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
  Tag,
  Briefcase,
  HardHat as SubcontractorIcon,
  UserCheck,
  UserSquare,
  Building as BuildingIcon,
  ShieldCheck,
  BadgeDollarSign,
  FileSearch,
  GitMerge,
  Brain,
  Mail,
  FolderOpen,
  FileType2,
  ListTree,
  Clock,
  LayoutGrid,
  Files,
  LayoutDashboard as DmsDashboardIcon,
  CalendarX,
  RefreshCw,
  Bell,
  Layers,
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
      { label: "Notifications", icon: Bell, path: "/notifications" },
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
      { label: "AI Settings", icon: Brain, path: "/admin/settings/ai" },
      { label: "Email Settings", icon: Mail, path: "/admin/settings/email" },
      { label: "Notifications", icon: Bell, path: "/admin/notifications" },
      { label: "Email Queue", icon: Mail, path: "/admin/notifications/email-queue" },
      { label: "Notif. Templates", icon: FileText, path: "/admin/notifications/templates" },
      { label: "Delivery Logs", icon: ScrollText, path: "/admin/notifications/logs" },
      { label: "Master Data", icon: Database, path: "/admin/master-data" },
      { label: "Lookup Categories", icon: FolderTree, path: "/admin/master-data/lookups/categories" },
      { label: "Lookup Values", icon: FolderTree, path: "/admin/master-data/lookups/values" },
      { label: "Locked System Values", icon: Lock, path: "/admin/master-data/lookups/system" },
      { label: "Audit Logs", icon: ScrollText, path: "/admin/audit" },
    ],
  },
  {
    label: "Common Master Data",
    items: [
      { label: "Common MD Overview", icon: Layers, path: "/admin/common-master-data" },
      { label: "Departments", icon: Building, path: "/admin/common-master-data/departments" },
      { label: "Designations", icon: UserCog, path: "/admin/common-master-data/designations" },
      { label: "Work Sites", icon: HardHat, path: "/admin/common-master-data/work-sites" },
      { label: "Work Calendars", icon: Clock, path: "/admin/common-master-data/work-calendars" },
      { label: "Approval Roles", icon: ShieldCheck, path: "/admin/common-master-data/approval-roles" },
      { label: "Required Doc. Rules", icon: FileText, path: "/admin/common-master-data/dms-required-documents" },
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
      { label: "All Parties", icon: Building2, path: "/admin/master-data/parties" },
      { label: "Customers", icon: Users, path: "/admin/master-data/parties/customers" },
      { label: "Vendors", icon: Briefcase, path: "/admin/master-data/parties/vendors" },
      { label: "Subcontractors", icon: SubcontractorIcon, path: "/admin/master-data/parties/subcontractors" },
      { label: "Consultants", icon: UserCheck, path: "/admin/master-data/parties/consultants" },
      { label: "Recruitment Agencies", icon: UserSquare, path: "/admin/master-data/parties/recruitment-agencies" },
      { label: "Government Authorities", icon: BuildingIcon, path: "/admin/master-data/parties/government-authorities" },
      { label: "Insurance Companies", icon: ShieldCheck, path: "/admin/master-data/parties/insurance-companies" },
      { label: "License Issuers", icon: BadgeDollarSign, path: "/admin/master-data/parties/license-issuers" },
      { label: "Party Types", icon: Tag, path: "/admin/master-data/parties/types" },
      { label: "Service Categories", icon: FileSearch, path: "/admin/master-data/parties/service-categories" },
      { label: "Relationship Types", icon: GitMerge, path: "/admin/master-data/parties/relationship-types" },
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
    label: "Documents",
    items: [
      { label: "DMS Dashboard", icon: DmsDashboardIcon, path: "/dms" },
      { label: "All Documents", icon: Files, path: "/dms/documents" },
      { label: "Upload Inbox", icon: FileSearch, path: "/dms/inbox" },
      { label: "Batch Intake", icon: Layers, path: "/dms/inbox/batches" },
      { label: "Expiry & Renewals", icon: CalendarX, path: "/dms/expiring" },
      { label: "Notifications", icon: Bell, path: "/dms/notifications" },
    ],
  },
  {
    label: "DMS Admin",
    items: [
      { label: "DMS Overview", icon: LayoutGrid, path: "/admin/dms" },
      { label: "Document Categories", icon: FolderOpen, path: "/admin/dms/categories" },
      { label: "Document Types", icon: FileType2, path: "/admin/dms/document-types" },
      { label: "Metadata Definitions", icon: ListTree, path: "/admin/dms/metadata-definitions" },
      { label: "Tags", icon: Tag, path: "/admin/dms/tags" },
      { label: "Retention Policies", icon: Clock, path: "/admin/dms/retention-policies" },
      { label: "AI Intelligence", icon: Brain, path: "/admin/dms/intelligence" },
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
  const { openTab, activeTab, isHydrated } = useWorkspace();

  // Initialize with all groups collapsed - manual control only
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);

  // Scroll state for nav area
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 8);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 8);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener("scroll", updateScrollState, { passive: true });
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", updateScrollState); ro.disconnect(); };
  }, [updateScrollState]);

  // Re-check when groups expand/collapse
  useEffect(() => { updateScrollState(); }, [expandedGroups, collapsed, updateScrollState]);

  const scrollBy = (direction: "up" | "down") => {
    scrollRef.current?.scrollBy({ top: direction === "down" ? 120 : -120, behavior: "smooth" });
  };

  // Manual multi-open behavior: toggle individual groups without affecting others
  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) =>
      prev.includes(label)
        ? prev.filter((g) => g !== label)  // Close this group
        : [...prev, label]                   // Open this group, keep others
    );
  };

  // Active state: use workspace active tab route when hydrated, fallback to pathname
  const isActive = (path: string) =>
    isHydrated ? activeTab?.route === path : pathname === path;

  const handleNavClick = (item: NavItem) => {
    if (item.comingSoon) return;
    openTab({ route: item.path, title: item.label, icon: item.icon.displayName ?? item.icon.name });
  };

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
        <div className="relative flex-1 min-h-0 flex flex-col">
          {/* Scroll up button */}
          {canScrollUp && (
            <button
              type="button"
              onClick={() => scrollBy("up")}
              className="absolute top-0 left-0 right-0 z-10 flex items-center justify-center h-6 bg-gradient-to-b from-card to-transparent hover:from-muted/80 transition-colors"
            >
              <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}

          {/* Scrollable nav content */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto overscroll-contain py-2 scrollbar-none"
            style={{ scrollbarWidth: "none" }}
          >
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
                        <button
                          key={item.path}
                          type="button"
                          onClick={() => handleNavClick(item)}
                          className={cn(
                            "flex items-center gap-2.5 w-full rounded-md text-sm font-medium transition-colors text-left",
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
                        </button>
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
          </div>

          {/* Scroll down button */}
          {canScrollDown && (
            <button
              type="button"
              onClick={() => scrollBy("down")}
              className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-center h-6 bg-gradient-to-t from-card to-transparent hover:from-muted/80 transition-colors"
            >
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border/40 p-2 shrink-0 space-y-0.5">
          {collapsed ? (
            <>
              <Tooltip>
                <TooltipTrigger render={
                  <button
                    type="button"
                    onClick={() => openTab({ route: "/settings", title: "Settings" })}
                    className="flex items-center justify-center w-full p-2.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                  >
                    <Settings className="h-4 w-4" />
                  </button>
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
              <button
                type="button"
                onClick={() => openTab({ route: "/settings", title: "Settings" })}
                className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </button>
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
