/**
 * ERP GLOBAL UI.4A — Workspace Route Registry
 *
 * Maps every implemented protected route to its workspace tab metadata.
 * Unknown routes fall back to a generic "Page" tab.
 *
 * Rules:
 * - All list/utility routes are singleton (re-click switches, no duplicate).
 * - Dashboard is pinned, non-closable.
 * - Record routes (4C+) will be added when implemented.
 */

import type { WorkspaceTabKind, WorkspaceTab } from "./workspace-types";

export type WorkspaceRouteConfig = {
  route: string;
  title: string;
  icon?: string;
  tabKind: WorkspaceTabKind;
  closable?: boolean;
  pinned?: boolean;
  /** Singleton = switch existing tab if already open for this exact route */
  singleton?: boolean;
  moduleCode?: string;
  /** Optional regex pattern for dynamic routes (e.g. record/[id]). Matched when no exact route found. */
  pattern?: RegExp;
  /** Entity type hint for record tabs */
  entityType?: string;
};

const REGISTRY: WorkspaceRouteConfig[] = [
  // ── Dashboard ──────────────────────────────────────────────────────────────
  {
    route: "/dashboard",
    title: "Dashboard",
    icon: "LayoutDashboard",
    tabKind: "dashboard",
    closable: false,
    pinned: true,
    singleton: true,
  },

  // ── Administration ─────────────────────────────────────────────────────────
  {
    route: "/admin/users",
    title: "Users",
    icon: "Users",
    tabKind: "list",
    singleton: true,
    moduleCode: "USERS",
  },
  {
    route: "/admin/organizations",
    title: "Organizations",
    icon: "Building2",
    tabKind: "list",
    singleton: true,
    moduleCode: "ORGANIZATIONS",
  },
  {
    route: "/admin/branches",
    title: "Branches",
    icon: "GitBranch",
    tabKind: "list",
    singleton: true,
    moduleCode: "BRANCHES",
  },
  {
    route: "/admin/roles",
    title: "Roles",
    icon: "Shield",
    tabKind: "list",
    singleton: true,
    moduleCode: "ROLES",
  },
  {
    route: "/admin/permissions",
    title: "Permissions",
    icon: "Shield",
    tabKind: "list",
    singleton: true,
    moduleCode: "PERMISSIONS",
  },
  {
    route: "/admin/settings/numbering",
    title: "Numbering Rules",
    icon: "Binary",
    tabKind: "list",
    singleton: true,
    moduleCode: "NUMBERING",
  },
  {
    route: "/admin/master-data",
    title: "Master Data",
    icon: "Database",
    tabKind: "utility",
    singleton: true,
  },
  {
    route: "/admin/audit",
    title: "Audit Logs",
    icon: "ScrollText",
    tabKind: "list",
    singleton: true,
    moduleCode: "AUDIT",
  },

  // ── Lookups ────────────────────────────────────────────────────────────────
  {
    route: "/admin/master-data/lookups/categories",
    title: "Lookup Categories",
    icon: "FolderTree",
    tabKind: "list",
    singleton: true,
    moduleCode: "LOOKUPS",
  },
  {
    route: "/admin/master-data/lookups/values",
    title: "Lookup Values",
    icon: "FolderTree",
    tabKind: "list",
    singleton: true,
    moduleCode: "LOOKUPS",
  },
  {
    route: "/admin/master-data/lookups/system",
    title: "Locked System Values",
    icon: "Lock",
    tabKind: "list",
    singleton: true,
    moduleCode: "LOOKUPS",
  },

  // ── Geography record tabs (4E.1) ──────────────────────────────────────────
  { route: "/admin/master-data/geography/countries/record/new", title: "New Country", icon: "Globe", tabKind: "record", closable: true, singleton: false, moduleCode: "GEOGRAPHY", entityType: "country" },
  { route: "/admin/master-data/geography/countries/record/", title: "Country Record", icon: "Globe", tabKind: "record", closable: true, singleton: false, moduleCode: "GEOGRAPHY", entityType: "country", pattern: /^\/admin\/master-data\/geography\/countries\/record\/\d+/ },
  { route: "/admin/master-data/geography/emirates/record/new", title: "New Region / Emirate", icon: "Building", tabKind: "record", closable: true, singleton: false, moduleCode: "GEOGRAPHY", entityType: "emirate" },
  { route: "/admin/master-data/geography/emirates/record/", title: "Region / Emirate Record", icon: "Building", tabKind: "record", closable: true, singleton: false, moduleCode: "GEOGRAPHY", entityType: "emirate", pattern: /^\/admin\/master-data\/geography\/emirates\/record\/\d+/ },
  { route: "/admin/master-data/geography/cities/record/new", title: "New City", icon: "MapPin", tabKind: "record", closable: true, singleton: false, moduleCode: "GEOGRAPHY", entityType: "city" },
  { route: "/admin/master-data/geography/cities/record/", title: "City Record", icon: "MapPin", tabKind: "record", closable: true, singleton: false, moduleCode: "GEOGRAPHY", entityType: "city", pattern: /^\/admin\/master-data\/geography\/cities\/record\/\d+/ },
  { route: "/admin/master-data/geography/areas/record/new", title: "New Area / Zone", icon: "Map", tabKind: "record", closable: true, singleton: false, moduleCode: "GEOGRAPHY", entityType: "area_zone" },
  { route: "/admin/master-data/geography/areas/record/", title: "Area / Zone Record", icon: "Map", tabKind: "record", closable: true, singleton: false, moduleCode: "GEOGRAPHY", entityType: "area_zone", pattern: /^\/admin\/master-data\/geography\/areas\/record\/\d+/ },
  { route: "/admin/master-data/geography/ports/record/new", title: "New Port", icon: "Anchor", tabKind: "record", closable: true, singleton: false, moduleCode: "GEOGRAPHY", entityType: "port" },
  { route: "/admin/master-data/geography/ports/record/", title: "Port Record", icon: "Anchor", tabKind: "record", closable: true, singleton: false, moduleCode: "GEOGRAPHY", entityType: "port", pattern: /^\/admin\/master-data\/geography\/ports\/record\/\d+/ },

  // ── Geography ──────────────────────────────────────────────────────────────
  {
    route: "/admin/master-data/geography/countries",
    title: "Countries",
    icon: "Globe",
    tabKind: "list",
    singleton: true,
    moduleCode: "GEOGRAPHY",
  },
  {
    route: "/admin/master-data/geography/emirates",
    title: "Regions / Emirates",
    icon: "Building",
    tabKind: "list",
    singleton: true,
    moduleCode: "GEOGRAPHY",
  },
  {
    route: "/admin/master-data/geography/cities",
    title: "Cities",
    icon: "MapPin",
    tabKind: "list",
    singleton: true,
    moduleCode: "GEOGRAPHY",
  },
  {
    route: "/admin/master-data/geography/areas",
    title: "Areas & Zones",
    icon: "Map",
    tabKind: "list",
    singleton: true,
    moduleCode: "GEOGRAPHY",
  },
  {
    route: "/admin/master-data/geography/ports",
    title: "Ports",
    icon: "Anchor",
    tabKind: "list",
    singleton: true,
    moduleCode: "GEOGRAPHY",
  },

  // ── Party Master ───────────────────────────────────────────────────────────
  {
    route: "/admin/master-data/parties",
    title: "All Parties",
    icon: "Building2",
    tabKind: "list",
    singleton: true,
    moduleCode: "PARTY_MASTER",
  },
  {
    route: "/admin/master-data/parties/customers",
    title: "Customers",
    icon: "Users",
    tabKind: "list",
    singleton: true,
    moduleCode: "PARTY_MASTER",
  },
  {
    route: "/admin/master-data/parties/vendors",
    title: "Vendors",
    icon: "Briefcase",
    tabKind: "list",
    singleton: true,
    moduleCode: "PARTY_MASTER",
  },
  {
    route: "/admin/master-data/parties/subcontractors",
    title: "Subcontractors",
    icon: "HardHat",
    tabKind: "list",
    singleton: true,
    moduleCode: "PARTY_MASTER",
  },
  {
    route: "/admin/master-data/parties/consultants",
    title: "Consultants",
    icon: "UserCheck",
    tabKind: "list",
    singleton: true,
    moduleCode: "PARTY_MASTER",
  },
  {
    route: "/admin/master-data/parties/recruitment-agencies",
    title: "Recruitment Agencies",
    icon: "UserSquare",
    tabKind: "list",
    singleton: true,
    moduleCode: "PARTY_MASTER",
  },
  {
    route: "/admin/master-data/parties/government-authorities",
    title: "Government Authorities",
    icon: "Building",
    tabKind: "list",
    singleton: true,
    moduleCode: "PARTY_MASTER",
  },
  {
    route: "/admin/master-data/parties/insurance-companies",
    title: "Insurance Companies",
    icon: "ShieldCheck",
    tabKind: "list",
    singleton: true,
    moduleCode: "PARTY_MASTER",
  },
  {
    route: "/admin/master-data/parties/license-issuers",
    title: "License Issuers",
    icon: "BadgeDollarSign",
    tabKind: "list",
    singleton: true,
    moduleCode: "PARTY_MASTER",
  },
  {
    route: "/admin/master-data/parties/types",
    title: "Party Types",
    icon: "Tag",
    tabKind: "list",
    singleton: true,
    moduleCode: "PARTY_MASTER",
  },
  {
    route: "/admin/master-data/parties/service-categories",
    title: "Service Categories",
    icon: "FileSearch",
    tabKind: "list",
    singleton: true,
    moduleCode: "PARTY_MASTER",
  },
  {
    route: "/admin/master-data/parties/relationship-types",
    title: "Relationship Types",
    icon: "GitMerge",
    tabKind: "list",
    singleton: true,
    moduleCode: "PARTY_MASTER",
  },

  // ── Party Master record tabs (4D) ─────────────────────────────────────────
  // Routes use /record/* prefix to avoid conflict with [typeSlug] filtered views.
  {
    route: "/admin/master-data/parties/record/new",
    title: "New Party",
    icon: "Building2",
    tabKind: "record",
    closable: true,
    singleton: false,
    moduleCode: "PARTY_MASTER",
    entityType: "party",
  },
  {
    // Dynamic match for /admin/master-data/parties/record/{id}?mode=view/edit
    route: "/admin/master-data/parties/record/",
    title: "Party Record",
    icon: "Building2",
    tabKind: "record",
    closable: true,
    singleton: false,
    moduleCode: "PARTY_MASTER",
    entityType: "party",
    pattern: /^\/admin\/master-data\/parties\/record\/\d+/,
  },

  // ── Lookups record tabs (4E.1) ────────────────────────────────────────────
  { route: "/admin/master-data/lookups/categories/record/new", title: "New Lookup Category", icon: "Tag", tabKind: "record", closable: true, singleton: false, moduleCode: "LOOKUPS", entityType: "lookup_category" },
  { route: "/admin/master-data/lookups/categories/record/", title: "Lookup Category", icon: "Tag", tabKind: "record", closable: true, singleton: false, moduleCode: "LOOKUPS", entityType: "lookup_category", pattern: /^\/admin\/master-data\/lookups\/categories\/record\/\d+/ },
  { route: "/admin/master-data/lookups/values/record/new", title: "New Lookup Value", icon: "List", tabKind: "record", closable: true, singleton: false, moduleCode: "LOOKUPS", entityType: "lookup_value" },
  { route: "/admin/master-data/lookups/values/record/", title: "Lookup Value", icon: "List", tabKind: "record", closable: true, singleton: false, moduleCode: "LOOKUPS", entityType: "lookup_value", pattern: /^\/admin\/master-data\/lookups\/values\/record\/\d+/ },

  // ── Finance Basics record tabs (4E.1) ─────────────────────────────────────
  { route: "/admin/master-data/finance-basics/banks/record/new", title: "New Bank", icon: "Landmark", tabKind: "record", closable: true, singleton: false, moduleCode: "FINANCE_BASICS", entityType: "bank" },
  { route: "/admin/master-data/finance-basics/banks/record/", title: "Bank Record", icon: "Landmark", tabKind: "record", closable: true, singleton: false, moduleCode: "FINANCE_BASICS", entityType: "bank", pattern: /^\/admin\/master-data\/finance-basics\/banks\/record\/\d+/ },
  { route: "/admin/master-data/finance-basics/currencies/record/new", title: "New Currency", icon: "Coins", tabKind: "record", closable: true, singleton: false, moduleCode: "FINANCE_BASICS", entityType: "currency" },
  { route: "/admin/master-data/finance-basics/currencies/record/", title: "Currency Record", icon: "Coins", tabKind: "record", closable: true, singleton: false, moduleCode: "FINANCE_BASICS", entityType: "currency", pattern: /^\/admin\/master-data\/finance-basics\/currencies\/record\/\d+/ },
  { route: "/admin/master-data/finance-basics/payment-terms/record/new", title: "New Payment Term", icon: "CalendarClock", tabKind: "record", closable: true, singleton: false, moduleCode: "FINANCE_BASICS", entityType: "payment_term" },
  { route: "/admin/master-data/finance-basics/payment-terms/record/", title: "Payment Term Record", icon: "CalendarClock", tabKind: "record", closable: true, singleton: false, moduleCode: "FINANCE_BASICS", entityType: "payment_term", pattern: /^\/admin\/master-data\/finance-basics\/payment-terms\/record\/\d+/ },
  { route: "/admin/master-data/finance-basics/tax-types/record/new", title: "New Tax Type", icon: "Percent", tabKind: "record", closable: true, singleton: false, moduleCode: "FINANCE_BASICS", entityType: "tax_type" },
  { route: "/admin/master-data/finance-basics/tax-types/record/", title: "Tax Type Record", icon: "Percent", tabKind: "record", closable: true, singleton: false, moduleCode: "FINANCE_BASICS", entityType: "tax_type", pattern: /^\/admin\/master-data\/finance-basics\/tax-types\/record\/\d+/ },
  { route: "/admin/master-data/finance-basics/cost-centers/record/new", title: "New Cost Center", icon: "Target", tabKind: "record", closable: true, singleton: false, moduleCode: "FINANCE_BASICS", entityType: "cost_center" },
  { route: "/admin/master-data/finance-basics/cost-centers/record/", title: "Cost Center Record", icon: "Target", tabKind: "record", closable: true, singleton: false, moduleCode: "FINANCE_BASICS", entityType: "cost_center", pattern: /^\/admin\/master-data\/finance-basics\/cost-centers\/record\/\d+/ },
  { route: "/admin/master-data/finance-basics/profit-centers/record/new", title: "New Profit Center", icon: "TrendingUp", tabKind: "record", closable: true, singleton: false, moduleCode: "FINANCE_BASICS", entityType: "profit_center" },
  { route: "/admin/master-data/finance-basics/profit-centers/record/", title: "Profit Center Record", icon: "TrendingUp", tabKind: "record", closable: true, singleton: false, moduleCode: "FINANCE_BASICS", entityType: "profit_center", pattern: /^\/admin\/master-data\/finance-basics\/profit-centers\/record\/\d+/ },

  // ── Finance Basics ─────────────────────────────────────────────────────────
  {
    route: "/admin/master-data/finance-basics/currencies",
    title: "Currencies",
    icon: "Coins",
    tabKind: "list",
    singleton: true,
    moduleCode: "FINANCE_BASICS",
  },
  {
    route: "/admin/master-data/finance-basics/payment-terms",
    title: "Payment Terms",
    icon: "CalendarClock",
    tabKind: "list",
    singleton: true,
    moduleCode: "FINANCE_BASICS",
  },
  {
    route: "/admin/master-data/finance-basics/tax-types",
    title: "Tax Types",
    icon: "Percent",
    tabKind: "list",
    singleton: true,
    moduleCode: "FINANCE_BASICS",
  },
  {
    route: "/admin/master-data/finance-basics/banks",
    title: "Banks",
    icon: "Landmark",
    tabKind: "list",
    singleton: true,
    moduleCode: "FINANCE_BASICS",
  },
  {
    route: "/admin/master-data/finance-basics/cost-centers",
    title: "Cost Centers",
    icon: "Target",
    tabKind: "list",
    singleton: true,
    moduleCode: "FINANCE_BASICS",
  },
  {
    route: "/admin/master-data/finance-basics/profit-centers",
    title: "Profit Centers",
    icon: "TrendingUp",
    tabKind: "list",
    singleton: true,
    moduleCode: "FINANCE_BASICS",
  },

  // ── UOM record tabs (4E.1) ─────────────────────────────────────────────────
  { route: "/admin/master-data/uom/categories/record/new", title: "New UOM Category", icon: "Ruler", tabKind: "record", closable: true, singleton: false, moduleCode: "UOM", entityType: "uom_category" },
  { route: "/admin/master-data/uom/categories/record/", title: "UOM Category", icon: "Ruler", tabKind: "record", closable: true, singleton: false, moduleCode: "UOM", entityType: "uom_category", pattern: /^\/admin\/master-data\/uom\/categories\/record\/\d+/ },
  { route: "/admin/master-data/uom/units/record/new", title: "New Unit of Measure", icon: "Ruler", tabKind: "record", closable: true, singleton: false, moduleCode: "UOM", entityType: "unit_of_measure" },
  { route: "/admin/master-data/uom/units/record/", title: "Unit of Measure", icon: "Ruler", tabKind: "record", closable: true, singleton: false, moduleCode: "UOM", entityType: "unit_of_measure", pattern: /^\/admin\/master-data\/uom\/units\/record\/\d+/ },
  { route: "/admin/master-data/uom/conversions/record/new", title: "New UOM Conversion", icon: "Ruler", tabKind: "record", closable: true, singleton: false, moduleCode: "UOM", entityType: "uom_conversion" },
  { route: "/admin/master-data/uom/conversions/record/", title: "UOM Conversion", icon: "Ruler", tabKind: "record", closable: true, singleton: false, moduleCode: "UOM", entityType: "uom_conversion", pattern: /^\/admin\/master-data\/uom\/conversions\/record\/\d+/ },

  // ── Units & Measurements ───────────────────────────────────────────────────
  {
    route: "/admin/master-data/uom/categories",
    title: "UOM Categories",
    icon: "Ruler",
    tabKind: "list",
    singleton: true,
    moduleCode: "UOM",
  },
  {
    route: "/admin/master-data/uom/units",
    title: "Units of Measure",
    icon: "Ruler",
    tabKind: "list",
    singleton: true,
    moduleCode: "UOM",
  },
  {
    route: "/admin/master-data/uom/conversions",
    title: "UOM Conversions",
    icon: "Ruler",
    tabKind: "list",
    singleton: true,
    moduleCode: "UOM",
  },

  // ── Users record tabs (4E.1) ──────────────────────────────────────────────
  { route: "/admin/users/record/new", title: "New User", icon: "UserPlus", tabKind: "record", closable: true, singleton: false, moduleCode: "USERS", entityType: "user" },
  { route: "/admin/users/record/", title: "User Profile", icon: "User", tabKind: "record", closable: true, singleton: false, moduleCode: "USERS", entityType: "user", pattern: /^\/admin\/users\/record\/\d+/ },

  // ── Admin record tabs (4E.1) ──────────────────────────────────────────────
  { route: "/admin/roles/record/new", title: "New Role", icon: "Shield", tabKind: "record", closable: true, singleton: false, moduleCode: "ADMIN", entityType: "role" },
  { route: "/admin/roles/record/", title: "Role", icon: "Shield", tabKind: "record", closable: true, singleton: false, moduleCode: "ADMIN", entityType: "role", pattern: /^\/admin\/roles\/record\/\d+/ },
  { route: "/admin/organizations/record/new", title: "New Organization", icon: "Building2", tabKind: "record", closable: true, singleton: false, moduleCode: "ADMIN", entityType: "organization" },
  { route: "/admin/organizations/record/", title: "Organization", icon: "Building2", tabKind: "record", closable: true, singleton: false, moduleCode: "ADMIN", entityType: "organization", pattern: /^\/admin\/organizations\/record\/\d+/ },
  { route: "/admin/branches/record/new", title: "New Branch", icon: "GitBranch", tabKind: "record", closable: true, singleton: false, moduleCode: "ADMIN", entityType: "branch" },
  { route: "/admin/branches/record/", title: "Branch", icon: "GitBranch", tabKind: "record", closable: true, singleton: false, moduleCode: "ADMIN", entityType: "branch", pattern: /^\/admin\/branches\/record\/\d+/ },
  { route: "/admin/settings/numbering/record/new", title: "New Numbering Rule", icon: "Binary", tabKind: "record", closable: true, singleton: false, moduleCode: "ADMIN", entityType: "numbering_rule" },
  { route: "/admin/settings/numbering/record/", title: "Numbering Rule", icon: "Binary", tabKind: "record", closable: true, singleton: false, moduleCode: "ADMIN", entityType: "numbering_rule", pattern: /^\/admin\/settings\/numbering\/record\/\d+/ },

  // ── Profile / Settings ─────────────────────────────────────────────────────
  {
    route: "/profile",
    title: "Profile",
    icon: "User",
    tabKind: "settings",
    singleton: true,
  },
  {
    route: "/settings",
    title: "Settings",
    icon: "Settings",
    tabKind: "settings",
    singleton: true,
  },

  // ── DMS Admin (DMS.3) ─────────────────────────────────────────────────────
  {
    route: "/admin/dms",
    title: "DMS Admin",
    icon: "LayoutGrid",
    tabKind: "list",
    singleton: true,
    moduleCode: "DMS",
  },
  {
    route: "/admin/dms/categories",
    title: "Document Categories",
    icon: "FolderOpen",
    tabKind: "list",
    singleton: true,
    moduleCode: "DMS",
  },
  {
    route: "/admin/dms/document-types",
    title: "Document Types",
    icon: "FileType2",
    tabKind: "list",
    singleton: true,
    moduleCode: "DMS",
  },
  {
    route: "/admin/dms/metadata-definitions",
    title: "Metadata Definitions",
    icon: "ListTree",
    tabKind: "list",
    singleton: true,
    moduleCode: "DMS",
  },
  {
    route: "/admin/dms/tags",
    title: "DMS Tags",
    icon: "Tag",
    tabKind: "list",
    singleton: true,
    moduleCode: "DMS",
  },
  {
    route: "/admin/dms/retention-policies",
    title: "Retention Policies",
    icon: "Clock",
    tabKind: "list",
    singleton: true,
    moduleCode: "DMS",
  },

  // ── DMS Document Repository (DMS.4) ───────────────────────────────────────
  {
    route: "/dms",
    title: "DMS Dashboard",
    icon: "LayoutDashboard",
    tabKind: "list",
    singleton: true,
    moduleCode: "DMS",
  },
  {
    route: "/dms/documents",
    title: "All Documents",
    icon: "Files",
    tabKind: "list",
    singleton: true,
    moduleCode: "DMS",
  },
  {
    route: "/dms/inbox",
    title: "Upload Inbox",
    icon: "Inbox",
    tabKind: "list",
    singleton: true,
    moduleCode: "DMS",
  },
  {
    route: "/dms/documents/record/new",
    title: "New Document",
    icon: "FilePlus",
    tabKind: "record",
    closable: true,
    singleton: false,
    moduleCode: "DMS",
    entityType: "dms_document",
  },
  // ── Global Notifications (NOTIFICATIONS.1) ────────────────────────────────
  {
    route: "/notifications",
    title: "Notifications",
    icon: "Bell",
    tabKind: "list",
    singleton: true,
    moduleCode: "NOTIFICATIONS",
  },
  {
    route: "/admin/notifications",
    title: "Notification Center",
    icon: "Bell",
    tabKind: "list",
    singleton: true,
    moduleCode: "NOTIFICATIONS",
  },
  {
    route: "/admin/notifications/email-queue",
    title: "Email Queue",
    icon: "Mail",
    tabKind: "list",
    singleton: true,
    moduleCode: "NOTIFICATIONS",
  },
  {
    route: "/admin/notifications/templates",
    title: "Notification Templates",
    icon: "FileText",
    tabKind: "list",
    singleton: true,
    moduleCode: "NOTIFICATIONS",
  },
  {
    route: "/admin/notifications/logs",
    title: "Delivery Logs",
    icon: "ScrollText",
    tabKind: "list",
    singleton: true,
    moduleCode: "NOTIFICATIONS",
  },

  {
    route: "/dms/documents/record/",
    title: "Document",
    icon: "FileText",
    tabKind: "record",
    closable: true,
    singleton: false,
    moduleCode: "DMS",
    entityType: "dms_document",
    pattern: /^\/dms\/documents\/record\/\d+/,
  },

  // ── DMS AI Intake Review (DMS.11) ──────────────────────────────────────────
  {
    route: "/dms/intake/",
    title: "AI Intake Review",
    icon: "Bot",
    tabKind: "record",
    closable: true,
    singleton: false,
    moduleCode: "DMS",
    entityType: "dms_intake_session",
    pattern: /^\/dms\/intake\/[a-zA-Z0-9-]+/,
  },

  // ── DMS Batch Intake list (DMS 13) ─────────────────────────────────────────
  {
    route: "/dms/inbox/batches",
    title: "Batch Intake",
    icon: "Layers",
    tabKind: "list",
    singleton: true,
    moduleCode: "DMS",
  },

  // ── DMS Batch Review Queue (DMS 13) ────────────────────────────────────────
  {
    route: "/dms/inbox/batch/",
    title: "Batch Review",
    icon: "Layers",
    tabKind: "record",
    closable: true,
    singleton: false,
    moduleCode: "DMS",
    entityType: "dms_upload_batch",
    pattern: /^\/dms\/inbox\/batch\/[a-zA-Z0-9-]+/,
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────

/** Exact-match → pattern-match → prefix match for dynamic segments */
export function getWorkspaceRouteConfig(
  route: string
): WorkspaceRouteConfig | null {
  // Strip query string for matching
  const pathname = route.split("?")[0];

  // 1. Exact match
  const exact = REGISTRY.find((r) => r.route === pathname);
  if (exact) return exact;

  // 2. RegExp pattern match (for record routes like /record/123)
  const patternMatch = REGISTRY.find((r) => r.pattern && r.pattern.test(pathname));
  if (patternMatch) return patternMatch;

  // 3. Prefix match for dynamic segments (e.g. /parties/customers is under /parties)
  const prefix = REGISTRY.find(
    (r) => pathname.startsWith(r.route + "/") && r.route !== "/"
  );
  return prefix ?? null;
}

export function isWorkspaceRoute(route: string): boolean {
  return route.startsWith("/") && !route.startsWith("/_next");
}

/** Build a full WorkspaceTab from a route — used for auto-open on direct URL */
export function createTabFromRoute(route: string): WorkspaceTab {
  const config = getWorkspaceRouteConfig(route);
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    route,
    title: config?.title ?? routeToTitle(route),
    icon: config?.icon,
    tabKind: config?.tabKind ?? "list",
    closable: config?.closable ?? true,
    pinned: config?.pinned ?? false,
    singleton: config?.singleton ?? false,
    moduleCode: config?.moduleCode,
    openedAt: now,
    lastActiveAt: now,
  } as WorkspaceTab & { singleton?: boolean };
}

/** Derive a readable title from a route path as a last resort */
function routeToTitle(route: string): string {
  const segments = route.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  if (!last) return "Page";
  return last
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export const DASHBOARD_ROUTE = "/dashboard";
