"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  LayoutDashboard, Bell, Settings, LogOut, ChevronLeft, ChevronDown, ChevronRight,
  ChevronUp, Search, X,
  Users, UsersRound, UserSearch, UserRoundCheck, ClipboardList, FileText, ShieldAlert,
  CheckCircle2, CalendarDays, CalendarClock, BriefcaseBusiness, Handshake, ClipboardCheck,
  BadgeDollarSign, Landmark, MonitorCheck, Ban,
  FolderOpen, UploadCloud, Inbox, RefreshCcw, Tags, Database, ShieldCheck, Brain,
  Truck, Wrench, DollarSign, Boxes, ShoppingCart,
  BarChart3, Palette, History,
  Building2, Building, MapPin, Globe2, Ship, Factory, Scale,
  Banknote, CreditCard, Percent, Ruler, Repeat,
  KeyRound, LockKeyhole, Hash, Mail, Send,
  Bot, Sparkles, ScanSearch, CircleGauge, AlertTriangle, CopyCheck,
  ListChecks,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  icon: LucideIcon;
  path: string;
  disabled?: boolean;
}

interface NavSubSection {
  kind: "subsection";
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

type NavChild = NavItem | NavSubSection;

interface NavSection {
  label: string;
  icon: LucideIcon;
  color: string;      // Tailwind bg color for the icon badge
  textColor: string;  // Tailwind text color for the section header
  iconColor: string;  // Tailwind text color for Level 3 item icons
  children: NavChild[];
}

function isSubSection(child: NavChild): child is NavSubSection {
  return (child as NavSubSection).kind === "subsection";
}

function getAllPaths(section: NavSection): string[] {
  const paths: string[] = [];
  for (const child of section.children) {
    if (isSubSection(child)) {
      for (const item of child.items) paths.push(item.path);
    } else {
      paths.push(child.path);
    }
  }
  return paths;
}

// ─── Navigation Structure ─────────────────────────────────────────────────────

const navSections: NavSection[] = [
  {
    label: "Overview",
    icon: LayoutDashboard,
    color: "bg-blue-500",
    textColor: "text-blue-600 dark:text-blue-400",
    iconColor: "text-blue-400 dark:text-blue-500",
    children: [
      { label: "Dashboard",     icon: LayoutDashboard, path: "/dashboard" },
      { label: "Notifications", icon: Bell,            path: "/notifications" },
    ],
  },
  {
    label: "Human Resource",
    icon: Users,
    color: "bg-emerald-500",
    textColor: "text-emerald-700 dark:text-emerald-400",
    iconColor: "text-emerald-500/70 dark:text-emerald-400/60",
    children: [
      {
        kind: "subsection", label: "HR", icon: UsersRound,
        items: [
          { label: "Dashboard", icon: LayoutDashboard, path: "/admin/hr/dashboard" },
          { label: "Search",    icon: Search,          path: "/admin/hr/search" },
          { label: "Employees", icon: UsersRound,      path: "/admin/hr/employees" },
        ],
      },
      {
        kind: "subsection", label: "HR Actions", icon: ClipboardList,
        items: [
          { label: "PRO Processes",           icon: FileText,     path: "/admin/hr/actions/pro" },
          { label: "Disciplinary & Warnings", icon: ShieldAlert,  path: "/admin/hr/actions/disciplinary" },
          { label: "Approval Requests",       icon: CheckCircle2, path: "/admin/hr/actions/approvals" },
          { label: "EOS & Clearance",         icon: LogOut,       path: "/admin/hr/actions/eos" },
        ],
      },
      {
        kind: "subsection", label: "Attendance & Leave", icon: CalendarDays,
        items: [
          { label: "Daily Attendance", icon: CalendarDays,  path: "/admin/hr/time/attendance" },
          { label: "Leave Requests",   icon: ClipboardList, path: "/admin/hr/time/leave" },
          { label: "Shift Calendar",   icon: CalendarClock, path: "/admin/hr/time/shifts" },
        ],
      },
      {
        kind: "subsection", label: "Recruitment", icon: UserSearch,
        items: [
          { label: "Job Requisitions", icon: BriefcaseBusiness, path: "/admin/hr/recruitment/requisitions" },
          { label: "Candidates",       icon: UserSearch,         path: "/admin/hr/recruitment/candidates" },
          { label: "Interviews",       icon: UserRoundCheck,     path: "/admin/hr/recruitment/interviews" },
          { label: "Offers",           icon: Handshake,          path: "/admin/hr/recruitment/offers" },
          { label: "Onboarding",       icon: ClipboardCheck,     path: "/admin/hr/recruitment/onboarding" },
        ],
      },
      {
        kind: "subsection", label: "Payroll & WPS", icon: BadgeDollarSign,
        items: [
          { label: "Salary Profiles", icon: BadgeDollarSign, path: "/admin/hr/payroll/salaries" },
          { label: "WPS Readiness",   icon: Landmark,        path: "/admin/hr/payroll/wps" },
        ],
      },
      {
        kind: "subsection", label: "HR Operations", icon: MonitorCheck,
        items: [
          { label: "Assignments",        icon: BriefcaseBusiness, path: "/admin/hr/operations/assignments" },
          { label: "Readiness Monitor",  icon: MonitorCheck,       path: "/admin/hr/operations/readiness" },
          { label: "Operational Blocks", icon: Ban,                path: "/admin/hr/operations/blocks" },
        ],
      },
      {
        kind: "subsection", label: "HR Admin", icon: Settings,
        items: [
          { label: "HR Settings", icon: Settings, path: "/admin/hr/settings" },
        ],
      },
    ],
  },
  {
    label: "Documents",
    icon: FolderOpen,
    color: "bg-sky-500",
    textColor: "text-sky-700 dark:text-sky-400",
    iconColor: "text-sky-500/70 dark:text-sky-400/60",
    children: [
      { label: "DMS Dashboard",    icon: LayoutDashboard, path: "/dms" },
      { label: "All Documents",    icon: FolderOpen,      path: "/dms/documents" },
      { label: "Upload Inbox",     icon: UploadCloud,     path: "/dms/inbox" },
      { label: "Batch Intake",     icon: Inbox,           path: "/dms/inbox/batches" },
      { label: "Review Queue",     icon: ListChecks,      path: "/dms/review-queue" },
      { label: "Expiry & Renewals", icon: RefreshCcw,    path: "/dms/expiring" },
      { label: "Notifications",    icon: Bell,            path: "/dms/notifications" },
      {
        kind: "subsection", label: "DMS Admin", icon: Settings,
        items: [
          { label: "DMS Overview",         icon: FolderOpen,  path: "/admin/dms" },
          { label: "Document Categories",  icon: Tags,        path: "/admin/dms/categories" },
          { label: "Document Types",       icon: FileText,    path: "/admin/dms/document-types" },
          { label: "Metadata Definitions", icon: Database,    path: "/admin/dms/metadata-definitions" },
          { label: "Tags",                 icon: Tags,        path: "/admin/dms/tags" },
          { label: "Retention Policies",   icon: ShieldCheck, path: "/admin/dms/retention-policies" },
          { label: "AI Intelligence",      icon: Brain,        path: "/admin/dms/intelligence" },
          { label: "AI Observability",     icon: CircleGauge,  path: "/admin/dms/ai-observability" },
        ],
      },
    ],
  },
  {
    label: "Operations",
    icon: Truck,
    color: "bg-orange-500",
    textColor: "text-orange-700 dark:text-orange-400",
    iconColor: "text-orange-400/70 dark:text-orange-400/60",
    children: [
      { label: "Fleet Management", icon: Truck,       path: "/modules/fleet",       disabled: true },
      { label: "Workshop",         icon: Wrench,      path: "/modules/workshop",    disabled: true },
      { label: "HSE",              icon: ShieldCheck, path: "/modules/hse",         disabled: true },
    ],
  },
  {
    label: "Finance & Supply",
    icon: DollarSign,
    color: "bg-yellow-500",
    textColor: "text-yellow-700 dark:text-yellow-400",
    iconColor: "text-yellow-600/70 dark:text-yellow-400/60",
    children: [
      { label: "Finance",     icon: DollarSign,   path: "/modules/finance",     disabled: true },
      { label: "Inventory",   icon: Boxes,        path: "/modules/inventory",   disabled: true },
      { label: "Procurement", icon: ShoppingCart, path: "/modules/procurement", disabled: true },
    ],
  },
  {
    label: "Reports",
    icon: BarChart3,
    color: "bg-violet-500",
    textColor: "text-violet-700 dark:text-violet-400",
    iconColor: "text-violet-500/70 dark:text-violet-400/60",
    children: [
      { label: "Report Center",        icon: BarChart3,     path: "/admin/reports" },
      { label: "Templates & Branding", icon: Palette,       path: "/admin/reports/templates" },
      { label: "Report History",       icon: History,       path: "/admin/reports/history" },
      { label: "Report Schedules",     icon: CalendarClock, path: "/admin/reports/schedules" },
    ],
  },
  {
    label: "Master Data",
    icon: Database,
    color: "bg-slate-500",
    textColor: "text-slate-700 dark:text-slate-400",
    iconColor: "text-slate-400/80 dark:text-slate-500/70",
    children: [
      {
        kind: "subsection", label: "Common Master Data", icon: Database,
        items: [
          { label: "Common MD Overview",  icon: Database,     path: "/admin/common-master-data" },
          { label: "Departments",         icon: Building2,    path: "/admin/common-master-data/departments" },
          { label: "Designations",        icon: Users,        path: "/admin/common-master-data/designations" },
          { label: "Work Sites",          icon: MapPin,       path: "/admin/common-master-data/work-sites" },
          { label: "Work Calendars",      icon: CalendarDays, path: "/admin/common-master-data/work-calendars" },
          { label: "Approval Roles",      icon: CheckCircle2, path: "/admin/common-master-data/approval-roles" },
          { label: "Required Doc. Rules", icon: FileText,     path: "/admin/common-master-data/dms-required-documents" },
        ],
      },
      {
        kind: "subsection", label: "Geography & Locations", icon: Globe2,
        items: [
          { label: "Countries",          icon: Globe2,    path: "/admin/master-data/geography/countries" },
          { label: "Regions / Emirates", icon: MapPin,    path: "/admin/master-data/geography/emirates" },
          { label: "Cities",             icon: Building,  path: "/admin/master-data/geography/cities" },
          { label: "Areas & Zones",      icon: MapPin,    path: "/admin/master-data/geography/areas" },
          { label: "Ports",              icon: Ship,      path: "/admin/master-data/geography/ports" },
        ],
      },
      {
        kind: "subsection", label: "Party Master", icon: UsersRound,
        items: [
          { label: "All Parties",            icon: UsersRound,    path: "/admin/master-data/parties" },
          { label: "Customers",              icon: Handshake,     path: "/admin/master-data/parties/customers" },
          { label: "Vendors",                icon: Factory,       path: "/admin/master-data/parties/vendors" },
          { label: "Subcontractors",         icon: Wrench,        path: "/admin/master-data/parties/subcontractors" },
          { label: "Consultants",            icon: Users,         path: "/admin/master-data/parties/consultants" },
          { label: "Recruitment Agencies",   icon: UserSearch,    path: "/admin/master-data/parties/recruitment-agencies" },
          { label: "Government Authorities", icon: Landmark,      path: "/admin/master-data/parties/government-authorities" },
          { label: "Insurance Companies",    icon: ShieldCheck,   path: "/admin/master-data/parties/insurance-companies" },
          { label: "License Issuers",        icon: FileText,      path: "/admin/master-data/parties/license-issuers" },
          { label: "Party Types",            icon: Tags,          path: "/admin/master-data/parties/types" },
          { label: "Service Categories",     icon: ClipboardList, path: "/admin/master-data/parties/service-categories" },
          { label: "Relationship Types",     icon: Scale,         path: "/admin/master-data/parties/relationship-types" },
        ],
      },
      {
        kind: "subsection", label: "Finance Basics", icon: Banknote,
        items: [
          { label: "Currencies",     icon: Banknote,    path: "/admin/master-data/finance-basics/currencies" },
          { label: "Payment Terms",  icon: CreditCard,  path: "/admin/master-data/finance-basics/payment-terms" },
          { label: "Tax Types",      icon: Percent,     path: "/admin/master-data/finance-basics/tax-types" },
          { label: "Banks",          icon: Landmark,    path: "/admin/master-data/finance-basics/banks" },
          { label: "Cost Centers",   icon: CircleGauge, path: "/admin/master-data/finance-basics/cost-centers" },
          { label: "Profit Centers", icon: CircleGauge, path: "/admin/master-data/finance-basics/profit-centers" },
        ],
      },
      {
        kind: "subsection", label: "Units & Measurements", icon: Ruler,
        items: [
          { label: "UOM Categories",   icon: Ruler,  path: "/admin/master-data/uom/categories" },
          { label: "Units of Measure", icon: Ruler,  path: "/admin/master-data/uom/units" },
          { label: "UOM Conversions",  icon: Repeat, path: "/admin/master-data/uom/conversions" },
        ],
      },
    ],
  },
  {
    label: "Administration",
    icon: Settings,
    color: "bg-rose-500",
    textColor: "text-rose-700 dark:text-rose-400",
    iconColor: "text-rose-400/70 dark:text-rose-400/60",
    children: [
      { label: "Users",                icon: Users,          path: "/admin/users" },
      { label: "Organizations",        icon: Building2,      path: "/admin/organizations" },
      { label: "Branches",             icon: Building,       path: "/admin/branches" },
      { label: "Roles",                icon: KeyRound,       path: "/admin/roles" },
      { label: "Permissions",          icon: LockKeyhole,    path: "/admin/permissions" },
      { label: "Numbering Rules",      icon: Hash,           path: "/admin/settings/numbering" },
      { label: "Email Settings",       icon: Mail,           path: "/admin/settings/email" },
      { label: "Notifications",        icon: Bell,           path: "/admin/notifications" },
      { label: "Email Queue",          icon: Send,           path: "/admin/notifications/email-queue" },
      { label: "Notif. Templates",     icon: FileText,       path: "/admin/notifications/templates" },
      { label: "Delivery Logs",        icon: History,        path: "/admin/notifications/logs" },
      { label: "Master Data",          icon: Database,       path: "/admin/master-data" },
      { label: "Lookup Categories",    icon: Tags,           path: "/admin/master-data/lookups/categories" },
      { label: "Lookup Values",        icon: Database,       path: "/admin/master-data/lookups/values" },
      { label: "Locked System Values", icon: LockKeyhole,    path: "/admin/master-data/lookups/system" },
      { label: "Audit Logs",           icon: ClipboardCheck, path: "/admin/audit" },
      {
        kind: "subsection", label: "AI", icon: Bot,
        items: [
          { label: "AI Settings",        icon: Settings,      path: "/admin/settings/ai" },
          { label: "AI Daily Dashboard", icon: Bot,           path: "/admin/ai/dashboard" },
          { label: "AI Audit Explainer", icon: ScanSearch,    path: "/admin/ai/audit-explainer" },
          { label: "AI Data Quality",    icon: Sparkles,      path: "/admin/ai/data-quality" },
          { label: "AI Duplicates",      icon: CopyCheck,     path: "/admin/ai/duplicates" },
          { label: "AI Compliance",      icon: ShieldCheck,   path: "/admin/ai/compliance" },
          { label: "AI Risk",            icon: AlertTriangle, path: "/admin/ai/risk" },
          { label: "AI Search",          icon: Search,        path: "/search" },
          { label: "AI Assistant",       icon: Bot,           path: "/assistant" },
        ],
      },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    const parts = name.trim().split(" ").filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return "??";
}

// ─── Animated collapse wrapper ────────────────────────────────────────────────

function Collapsible({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("grid transition-[grid-template-rows] duration-200 ease-in-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
      <div className="overflow-hidden">
        {children}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  displayName?: string | null;
  email?: string | null;
}

export function AppSidebar({ collapsed, onToggle, displayName, email }: AppSidebarProps) {
  const pathname = usePathname();
  const { openTab, activeTab, isHydrated } = useWorkspace();

  const [expandedSections, setExpandedSections] = useState<string[]>([]);
  const [expandedSubSections, setExpandedSubSections] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

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

  useEffect(() => { updateScrollState(); }, [expandedSections, expandedSubSections, collapsed, updateScrollState]);

  const scrollBy = (direction: "up" | "down") => {
    scrollRef.current?.scrollBy({ top: direction === "down" ? 120 : -120, behavior: "smooth" });
  };

  const toggleSection = (label: string) =>
    setExpandedSections((prev) => prev.includes(label) ? prev.filter((s) => s !== label) : [...prev, label]);

  const toggleSubSection = (key: string) =>
    setExpandedSubSections((prev) => prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]);

  const activeRoute = isHydrated ? (activeTab?.route ?? pathname) : pathname;
  const isActive = (path: string) => activeRoute === path;

  // Compute which section contains the active route
  const activeSectionLabel = useMemo(() =>
    navSections.find((s) => getAllPaths(s).includes(activeRoute))?.label ?? null,
    [activeRoute]
  );

  const handleNavClick = (item: NavItem) => {
    if (item.disabled) return;
    openTab({ route: item.path, title: item.label, icon: item.icon.displayName ?? item.icon.name });
  };

  // Filter items by search query
  const q = searchQuery.toLowerCase().trim();
  const isFiltering = q.length > 0;

  // ── Nav item ──────────────────────────────────────────────────────────────
  const renderNavItem = (item: NavItem, iconColor: string) => {
    const active = isActive(item.path);
    if (isFiltering && !item.label.toLowerCase().includes(q)) return null;

    const btn = item.disabled ? (
      <div
        key={item.path}
        aria-disabled="true"
        className={cn(
          "flex items-center gap-2 w-full rounded-md text-[13px] font-medium cursor-not-allowed select-none",
          collapsed ? "justify-center p-2.5" : "px-2.5 py-[5px]",
          "text-muted-foreground/30"
        )}
      >
        <item.icon className="h-[14px] w-[14px] shrink-0 opacity-40" strokeWidth={1.75} />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </div>
    ) : (
      <button
        key={item.path}
        type="button"
        onClick={() => handleNavClick(item)}
        className={cn(
          "relative flex items-center gap-2 w-full rounded-md text-[13px] font-medium transition-colors text-left overflow-hidden",
          collapsed ? "justify-center p-2.5" : "px-2.5 py-[5px]",
          active
            ? "bg-primary/10 text-primary dark:bg-primary/20 font-semibold"
            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-slate-800/50"
        )}
      >
        {/* Active left-accent bar */}
        {active && !collapsed && (
          <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-primary" />
        )}
        <item.icon
          className={cn("h-[14px] w-[14px] shrink-0", active ? "text-primary" : iconColor)}
          strokeWidth={1.75}
        />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </button>
    );

    if (collapsed) {
      return (
        <Tooltip key={item.path}>
          <TooltipTrigger render={btn} />
          <TooltipContent side="right" className="text-xs">
            {item.disabled ? `${item.label} (not available)` : item.label}
          </TooltipContent>
        </Tooltip>
      );
    }
    return <div key={item.path}>{btn}</div>;
  };

  // ── Subsection ────────────────────────────────────────────────────────────
  const renderSubSection = (sub: NavSubSection, sectionLabel: string, iconColor: string) => {
    const key = `${sectionLabel}::${sub.label}`;
    const isExpanded = expandedSubSections.includes(key);
    const visibleItems = sub.items.filter((item) => !isFiltering || item.label.toLowerCase().includes(q));
    if (isFiltering && visibleItems.length === 0) return null;

    if (collapsed) {
      return (
        <div key={key} className="space-y-0.5">
          {sub.items.map((item) => renderNavItem(item, iconColor))}
        </div>
      );
    }

    return (
      <div key={key} className="mt-0.5">
        <button
          type="button"
          onClick={() => !isFiltering && toggleSubSection(key)}
          className={cn(
            "flex items-center justify-between w-full px-2 py-1.5 rounded-md",
            "text-[11px] font-semibold uppercase tracking-wide transition-colors",
            isExpanded || isFiltering
              ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
              : "bg-amber-500/[0.05] text-amber-600/70 dark:text-amber-500/60 hover:bg-amber-500/10 hover:text-amber-700 dark:hover:text-amber-400"
          )}
        >
          <div className="flex items-center gap-1.5">
            <sub.icon className="h-3 w-3 shrink-0" strokeWidth={2} />
            <span>{sub.label}</span>
          </div>
          {!isFiltering && (
            isExpanded
              ? <ChevronDown className="h-3 w-3 opacity-70" />
              : <ChevronRight className="h-3 w-3 opacity-50" />
          )}
        </button>
        <Collapsible open={isExpanded || isFiltering}>
          <div className="mt-0.5 space-y-0.5 border-l-2 border-amber-400/30 ml-3 pl-1.5 pb-0.5">
            {(isFiltering ? visibleItems : sub.items).map((item) => renderNavItem(item, iconColor))}
          </div>
        </Collapsible>
      </div>
    );
  };


  const initials = getInitials(displayName, email);
  const displayLabel = displayName ?? email?.split("@")[0] ?? "User";

  return (
    <TooltipProvider delay={0}>
      <aside
        className={cn(
          "h-screen flex flex-col border-r border-border/40 bg-card transition-all duration-300 shrink-0",
          collapsed ? "w-[68px]" : "w-[260px]"
        )}
      >
        {/* ── Logo ─────────────────────────────────────────────────────────── */}
        <div className="h-14 flex items-center px-4 border-b border-border/40 shrink-0">
          {!collapsed ? (
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-primary-foreground">AG</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground leading-none">Alliance Gulf</p>
                <p className="text-[10px] text-muted-foreground">Transport ERP</p>
              </div>
            </div>
          ) : (
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center mx-auto">
              <span className="text-xs font-bold text-primary-foreground">AG</span>
            </div>
          )}
        </div>

        {/* ── Search bar ───────────────────────────────────────────────────── */}
        {!collapsed && (
          <div className="px-3 py-2 border-b border-border/30 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter menu…"
                className="h-7 pl-7 pr-7 text-xs bg-muted/40 border-0 focus-visible:ring-1 focus-visible:ring-primary/40 placeholder:text-muted-foreground/40"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Navigation ───────────────────────────────────────────────────── */}
        <div className="relative flex-1 min-h-0 flex flex-col">
          {canScrollUp && (
            <button type="button" onClick={() => scrollBy("up")}
              className="absolute top-0 left-0 right-0 z-10 flex items-center justify-center h-6 bg-gradient-to-b from-card to-transparent hover:from-muted/80 transition-colors">
              <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}

          <div ref={scrollRef}
            className="flex-1 overflow-y-auto overscroll-contain py-2 scrollbar-none"
            style={{ scrollbarWidth: "none" }}>
            <nav className="px-2 space-y-0.5">
              {navSections.map((section) => {
                const isSectionExpanded = expandedSections.includes(section.label);
                const isSectionActive = activeSectionLabel === section.label;

                // In filter mode: only show sections that have matching items
                const visibleDirectItems = section.children
                  .filter((c) => !isSubSection(c))
                  .filter((c) => !isFiltering || (c as NavItem).label.toLowerCase().includes(q)) as NavItem[];
                const visibleSubSections = section.children
                  .filter(isSubSection)
                  .filter((s) => !isFiltering || s.items.some((i) => i.label.toLowerCase().includes(q)));

                if (isFiltering && visibleDirectItems.length === 0 && visibleSubSections.length === 0) return null;

                const hasDirectItems = section.children.some((c) => !isSubSection(c));
                const hasSubSections = section.children.some(isSubSection);

                return (
                  <div key={section.label} className="mb-1">
                    {/* ── Level 1 Section Header ─────────────────────────── */}
                    {!collapsed ? (
                      <button
                        type="button"
                        onClick={() => !isFiltering && toggleSection(section.label)}
                        className={cn(
                          "flex items-center justify-between w-full px-2 py-1.5 rounded-md",
                          "text-[11px] font-bold uppercase tracking-widest transition-colors",
                          isSectionActive || isSectionExpanded
                            ? "text-foreground"
                            : "text-muted-foreground hover:text-foreground/80"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          {/* Colored icon badge */}
                          <div className={cn(
                            "h-5 w-5 rounded flex items-center justify-center shrink-0",
                            section.color,
                            "opacity-90"
                          )}>
                            <section.icon className="h-3 w-3 text-white" strokeWidth={2.5} />
                          </div>
                          <span className={cn(isSectionActive ? section.textColor : "")}>{section.label}</span>
                        </div>
                        {!isFiltering && (
                          isSectionExpanded
                            ? <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                            : <ChevronRight className="h-3.5 w-3.5 opacity-40" />
                        )}
                      </button>
                    ) : (
                      /* Collapsed: show colored icon button */
                      <Tooltip>
                        <TooltipTrigger render={
                          <button
                            type="button"
                            onClick={() => toggleSection(section.label)}
                            className={cn(
                              "flex items-center justify-center w-full p-2 rounded-md transition-colors",
                              isSectionActive ? "bg-primary/10" : "hover:bg-muted/40"
                            )}
                          >
                            <div className={cn(
                              "h-6 w-6 rounded flex items-center justify-center",
                              section.color, "opacity-85"
                            )}>
                              <section.icon className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
                            </div>
                          </button>
                        } />
                        <TooltipContent side="right" className="text-xs font-semibold">
                          {section.label}
                        </TooltipContent>
                      </Tooltip>
                    )}

                    {/* ── Section children ───────────────────────────────── */}
                    <Collapsible open={collapsed || isSectionExpanded || isFiltering}>
                      <div className="space-y-0.5 mt-0.5 px-0.5">
                        {/* Direct items (e.g. DMS top-level links) */}
                        {hasDirectItems && (
                          <div className="space-y-0.5">
                            {section.children
                              .filter((c) => !isSubSection(c))
                              .map((c) => renderNavItem(c as NavItem, section.iconColor))}
                          </div>
                        )}
                        {/* Separator between direct items and subsections */}
                        {hasDirectItems && hasSubSections && !collapsed && (
                          <div className="my-1 mx-1 h-px bg-border/40" />
                        )}
                        {/* Subsections */}
                        {section.children
                          .filter(isSubSection)
                          .map((c) => renderSubSection(c as NavSubSection, section.label, section.iconColor))}
                      </div>
                    </Collapsible>
                  </div>
                );
              })}
            </nav>
          </div>

          {canScrollDown && (
            <button type="button" onClick={() => scrollBy("down")}
              className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-center h-6 bg-gradient-to-t from-card to-transparent hover:from-muted/80 transition-colors">
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* ── Footer: User avatar ──────────────────────────────────────────── */}
        <div className="border-t border-border/40 shrink-0">
          {/* User avatar row */}
          {!collapsed ? (
            <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border/30">
              <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0 ring-1 ring-primary/20">
                <span className="text-[10px] font-bold text-primary">{initials}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-foreground truncate leading-tight">{displayLabel}</p>
                {email && <p className="text-[10px] text-muted-foreground truncate leading-tight">{email}</p>}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-2 border-b border-border/30">
              <Tooltip>
                <TooltipTrigger render={
                  <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center ring-1 ring-primary/20 cursor-default">
                    <span className="text-[10px] font-bold text-primary">{initials}</span>
                  </div>
                } />
                <TooltipContent side="right" className="text-xs">{displayLabel}</TooltipContent>
              </Tooltip>
            </div>
          )}

        </div>

        {/* ── Collapse toggle ───────────────────────────────────────────────── */}
        <div className="border-t border-border/40 p-2 shrink-0">
          <Button variant="ghost" size="sm" onClick={onToggle}
            className="w-full h-8 text-muted-foreground hover:text-foreground">
            <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
            {!collapsed && <span className="ml-2 text-xs">Collapse</span>}
          </Button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
