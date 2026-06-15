# ALGT ERP — Full Implementation Guide for Next Chat Handoff

**Document Type:** Technical handoff guide for ChatGPT / Cursor continuation  
**Generated:** 2026-06-12  
**Last updated:** 2026-06-12 (ERP module map & on-screen structure added)  
**Last closed gate:** ERP BASE 002F.3E.4 — Current Modules Global QA Gate (**PASS WITH NOTES**)  
**Repository:** `c:\dev\agt-erp` (also published to GitHub `sameerfahmi1979-maker/ERP`)

---

## How to Use This Guide

Upload this file to a new ChatGPT chat or reference it at the start of a Cursor session. It summarizes what is **implemented**, what is **closed**, what is **deferred**, the **full ERP module map** (live, placeholder, and planned), and the **rules every future phase must follow**. Do not treat database tables for future party-master modules as proof those modules are built in the UI.

**Quick module counts (see §5.2a for full detail):**

| Category | Count |
|---|---|
| Live & working screens | 32 |
| On screen but disabled / demo placeholder | 16 (8 sidebar "Soon" + 8 dashboard cards) |
| Planned — DB ready, no UI | 5 party-master modules |
| Planned — roadmap only | 40+ operational/platform modules |

**Verification labels used throughout:**

| Label | Meaning |
|---|---|
| **source-verified** | Confirmed by reading source code and/or static build |
| **harness-verified** | Confirmed via dev-only QA harness (`/dev/*`) |
| **manual user-confirmed** | Sameer/Dina confirmed in browser |
| **browser-authenticated pending** | Not yet confirmed in a logged-in browser session |

---

## 5.1 Project Overview

| Field | Value |
|---|---|
| **Project name** | ALGT ERP (Alliance Gulf Transport ERP) |
| **Package name** | `erp-foundation` v0.1.0 |
| **Purpose** | Enterprise ERP foundation for Alliance Gulf — admin, RBAC, master data, party master (Customers first), global numbering, lookups, form runtime standards |
| **Company context** | Alliance Gulf — transport/logistics operator (UAE-focused geography master data) |
| **Supabase project URL** | `https://mmiefuieduzdiiwnqpie.supabase.co` |
| **Supabase MCP to use** | **`user-supabase`** — verified correct ERP project |
| **Supabase MCP to avoid** | **`plugin-supabase-supabase`** — points to unrelated weighing/industrial project (`https://owcfljxxfznifftoezpf.supabase.co`) |

### Technology Stack (source-verified, `package.json`)

| Layer | Technology |
|---|---|
| Framework | Next.js **16.2.6** (App Router) |
| UI | React **19.2.4**, TypeScript **5**, Tailwind CSS **4**, shadcn/ui, Lucide icons |
| Forms | react-hook-form **7.76.1**, Zod **4.4.3** |
| Tables | @tanstack/react-table **8.21.3** |
| Client cache | @tanstack/react-query **5.101.0** |
| Backend | Next.js Server Actions |
| Database | Supabase PostgreSQL + RLS |
| Auth | Custom session via Supabase anon role + cookies (NOT standard Supabase Auth UI flow) |
| Toasts | Sonner |
| Export | jsPDF, xlsx |

### Main Architecture

```
Browser
  └─ Next.js App Router
       ├─ src/app/(protected)/**     — authenticated pages (server components + client features)
       ├─ src/features/**            — domain UI (tables, forms, hooks)
       ├─ src/components/erp/**      — shared ERP UI primitives
       ├─ src/server/actions/**      — server mutations (RBAC + Zod + audit + revalidatePath)
       ├─ src/server/queries/**      — server read helpers (RLS backstop)
       ├─ src/hooks/**               — TanStack Query hooks, useFormDirty, child-table hooks
       └─ src/lib/query/**           — query keys, prefetch, invalidation
            └─ Supabase (RLS-enforced PostgreSQL)
```

**Route protection:** `src/middleware.ts` → `src/lib/supabase/middleware.ts` redirects unauthenticated users from `/dashboard`, `/admin/*`, `/settings`, `/profile` to `/login`.

**Important:** Next.js 16 build warns that the `middleware` file convention is deprecated in favor of `proxy`. Migration is deferred technical debt.

---

## 5.2 Current Phase Status

### ERP BASE 002F.3E — People / Contacts / CRM Foundation (parent)

| Sub-phase | Title | Status | Notes |
|---|---|---|---|
| **002F.3E.2** | Global master data + numbering infrastructure | **CLOSED** | Migrations applied; numbering engine live |
| **002F.3E.3** | Customers module (initial) | **CLOSED** | Parent + child CRUD |
| **002F.3E.3B.2** | Global combobox foundation | **CLOSED** | `ERPCombobox`, geography/finance select wrappers |
| **002F.3E.3B.2D** | Customer form final QA | **CLOSED WITH NOTES** | Form structure verified; some items deferred |
| **002F.3E.3B.3** | Required fields + footer audit | **CLOSED** | `RequiredLabel`, `ERPFormFooter` standard |
| **002F.3E.3B.3F** | Customer save buttons final QA | **CLOSED** | Save / Save & Close behavior |
| **002F.3E.3B.4** | Safe Close standard | **CLOSED** | `useFormDirty`, `UnsavedChangesDialog` |
| **002F.3E.3B.4C** | Safe Close runtime investigation + fix | **CLOSED** | Combobox-only dirty tracking fixed |
| **002F.3E.3B.5** | Global form runtime QA closure gate | **CLOSED WITH NOTES** | Standard enforced across forms |
| **002F.3E.3B.6A** | Performance audit/plan | **CLOSED** | Plan only |
| **002F.3E.3B.6B** | Global lookup cache + hook standard | **CLOSED** | TanStack Query for lookups |
| **002F.3E.3B.6C** | ERPCombobox runtime + debounce + dirty | **CLOSED** | Combobox dirty integration |
| **002F.3E.3B.6D** | Apply optimized hooks to forms | **CLOSED** | Cascading select bug fixed post-phase |
| **002F.3E.3B.6E** | Lazy-load drawer tabs/sections | **CLOSED** | `ERPDrawerSection` `lazyMount` |
| **002F.3E.3B.6F** | Combobox/form performance runtime QA gate | **CLOSED WITH NOTES** | Dev harness created |
| **002F.3E.3B.6G** | Parent form runtime standard (parent) | **CLOSED** | Standard doc + utilities + Customer wiring |
| **002F.3E.3B.6G.1** | Standard doc + prefetch utilities | **CLOSED** | `prefetch-lookups.ts`, `query-keys.child` |
| **002F.3E.3B.6G.2** | Customer basic tab prefetch wiring | **CLOSED** | `useCustomerFormPrefetch` |
| **002F.3E.3B.6G.3** | Customer child tables TanStack migration | **CLOSED** | `useChildTableQuery` pattern |
| **002F.3E.3B.6G.3B** | Customer contacts loading fix | **CLOSED** | staleTime 5 min, skeletons, section prefetch |
| **002F.3E.3B.6G.4** | Generic child table query pattern | **CLOSED** | `createChildInvalidator` factory |
| **002F.3E.3B.6G.5** | Apply standard / future-ready modules | **CLOSED** | Org/Branch declarations, party-master templates |
| **002F.3E.3B.6G.6** | Runtime QA closure + Org/Branch prefetch | **CLOSED WITH NOTES** | Prefetch wired for Org/Branch |
| **002F.3E.3B.7** | Customer module final QA and closure | **CLOSED WITH NOTES** | Reference implementation; `effectiveCustomerId` fix |
| **002F.3E.4** | Current modules global QA gate | **PASS WITH NOTES** | Base stable; browser QA pending |

### Known cross-phase notes

- **Browser-authenticated runtime QA** was unavailable in Cursor agent sessions for 3E.4 and several prior gates → final statuses are **PASS WITH NOTES**, not clean PASS.
- **Customer module** is the **reference implementation** for all future party-master modules.
- **Party-master DB tables exist** (vendors, subcontractors, consultants, government_authorities, recruitment_agencies + child tables) but **have no UI/routes/server actions yet** — schema-ready only.
- Phase trackers in `implementation_Review/ERP_BASE_FULL_PHASE_STATUS_TRACKER.md` and `ERP_FULL_IMPLEMENTATION_ROADMAP_PHASE_TRACKER.md` are **partially stale** (pre-3E.3B arc). Trust closure reports, **§5.2a module map**, and this guide over older tracker rows.

---

## 5.2a ERP Module Map & On-Screen Structure

This section is the authoritative inventory of **what appears on screen today**, **what is shown but not built**, and **what the full ERP is designed to include**. Sources: `src/components/layout/app-sidebar.tsx`, all `src/app/(protected)/**/page.tsx` routes, `src/app/(protected)/dashboard/page.tsx`, `implementation_Review/ERP_FULL_IMPLEMENTATION_ROADMAP_PHASE_TRACKER.md`, and `implementation_Review/Phase_002F_3E_Planning/ERP_BASE_002F_3E_PEOPLE_CONTACTS_CRM_FOUNDATION_TECHNICAL_IMPLEMENTATION_PLAN_REV1.md`.

### Module status legend

| Status | Meaning | On screen? |
|---|---|---|
| **LIVE** | Route exists, module functional | ✅ Sidebar link works |
| **CLOSED** | LIVE + QA closure passed | ✅ (Customer only) |
| **PLACEHOLDER** | Visible in UI but no real module | ⚠ Disabled "Soon" or demo cards |
| **DB-READY** | Supabase tables + RLS exist; no UI | ❌ Not in working sidebar |
| **PLANNED** | In roadmap/planning docs only | ❌ Not built |

### Application folder structure

```
src/
├── app/
│   ├── (protected)/              ← All authenticated ERP pages
│   │   ├── dashboard/              ← Executive dashboard (demo KPI cards)
│   │   ├── profile/                ← User profile (self-service)
│   │   ├── settings/               ← App settings (self-service)
│   │   └── admin/
│   │       ├── users/              ← User management
│   │       ├── roles/              ← Role management
│   │       ├── permissions/        ← Permission viewer
│   │       ├── organizations/      ← Owner companies
│   │       ├── branches/           ← Branch management
│   │       ├── audit/              ← Audit log viewer
│   │       ├── settings/numbering/ ← Global numbering rules
│   │       └── master-data/
│   │           ├── page.tsx        ← Master data hub dashboard
│   │           ├── customers/      ← Party master (reference)
│   │           ├── geography/      ← 5 geography list pages
│   │           ├── finance-basics/ ← 6 finance master pages
│   │           ├── lookups/        ← 3 lookup admin pages
│   │           └── uom/            ← 3 UOM pages
│   ├── dev/                        ← QA harnesses (delete before production)
│   ├── login/, signup/, etc.       ← Auth pages (public)
│   └── layout.tsx                  ← Root layout
├── features/                       ← Domain modules (UI + actions)
│   ├── users/, roles/, permissions/
│   ├── organizations/, branches/
│   ├── numbering/
│   ├── audit/, profile/, auth/
│   └── master-data/
│       ├── customers/              ← Reference party-master module
│       ├── geography/
│       ├── finance-basics/
│       ├── lookups/
│       └── uom/
├── components/
│   ├── erp/                        ← Shared ERP UI primitives
│   └── layout/                     ← app-sidebar, erp-shell, header
├── server/
│   ├── actions/                    ← Server mutations (RBAC + audit)
│   └── queries/                    ← Server read helpers
├── hooks/                          ← TanStack Query, useFormDirty, child tables
└── lib/
    ├── query/                      ← Keys, prefetch, invalidation
    ├── lookups/                    ← Shared master-data fetchers
    ├── rbac/                       ← getAuthContext, hasPermission
    └── supabase/                   ← Client, middleware
```

**Navigation source of truth:** `src/components/layout/app-sidebar.tsx` — static `navGroups` array. Future modules use `comingSoon: true` (disabled, "Soon" badge, not clickable).

**Dashboard module cards:** `src/app/(protected)/dashboard/page.tsx` — shows 8 operational module cards with **fake demo data**; cards are **not linked** to routes.

---

### Complete target sidebar structure

What the ERP sidebar is designed to show when fully built (current state in parentheses):

```text
Overview
  └── Dashboard                                    [LIVE]

Administration
  ├── Users                                        [LIVE]
  ├── Organizations                                [LIVE]
  ├── Branches                                     [LIVE]
  ├── Roles                                        [LIVE]
  ├── Permissions                                  [LIVE]
  ├── Numbering Rules                              [LIVE]
  ├── Master Data (hub)                            [LIVE]
  ├── Lookup Categories                            [LIVE]
  ├── Lookup Values                                [LIVE]
  ├── Locked System Values                         [LIVE]
  └── Audit Logs                                   [LIVE]

Geography & Locations
  ├── Countries                                    [LIVE]
  ├── Regions / Emirates                             [LIVE]
  ├── Cities                                       [LIVE]
  ├── Areas & Zones                                [LIVE]
  ├── Ports                                        [LIVE]
  └── Work Sites                                   [PLANNED — 002F.3C plan, not built]

Party Master
  ├── Customers                                    [LIVE — CLOSED reference]
  ├── Vendors                                      [DB-READY — next priority]
  ├── Subcontractors                               [DB-READY]
  ├── Consultants                                  [DB-READY]
  ├── Government Authorities                       [DB-READY]
  └── Recruitment Agencies                         [DB-READY]

Finance Basics
  ├── Currencies                                   [LIVE]
  ├── Payment Terms                                [LIVE]
  ├── Tax Types                                    [LIVE]
  ├── Banks                                        [LIVE]
  ├── Cost Centers                                 [LIVE]
  ├── Profit Centers                               [LIVE]
  ├── Payment Methods                              [PLANNED — lookup values only, no list page]
  └── Bank Account Types                           [PLANNED — lookup values only, used in forms]

Units & Measurements
  ├── UOM Categories                               [LIVE]
  ├── Units of Measure                             [LIVE]
  └── UOM Conversions                              [LIVE]

Operations                                         [PLACEHOLDER — sidebar "Soon"]
  ├── Fleet Management
  ├── HR & Payroll
  ├── Workshop
  └── HSE

Finance & Supply                                   [PLACEHOLDER — sidebar "Soon"]
  ├── Finance
  ├── Inventory
  ├── Procurement
  └── Documents (DMS)

User area (sidebar footer / header)
  ├── Settings                                     [LIVE]
  └── Profile                                      [LIVE — route exists, header access]
```

---

### Master module inventory tracker

| # | Module / Screen | Sidebar group | Route | UI | DB | Phase / notes |
|---|---|---|---|---|---|---|
| **Overview** |
| 1 | Dashboard | Overview | `/dashboard` | LIVE | — | Demo KPI cards; 8 module cards are placeholders |
| **Administration** |
| 2 | Users | Administration | `/admin/users` | LIVE | ✅ | RBAC user management |
| 3 | Organizations | Administration | `/admin/organizations` | LIVE | ✅ | `owner_companies`; legacy text sync |
| 4 | Branches | Administration | `/admin/branches` | LIVE | ✅ | Interim geography → text fields |
| 5 | Roles | Administration | `/admin/roles` | LIVE | ✅ | Permission assignment drawer |
| 6 | Permissions | Administration | `/admin/permissions` | LIVE | ✅ | Read-focused |
| 7 | Numbering Rules | Administration | `/admin/settings/numbering` | LIVE | ✅ | Global sequence engine |
| 8 | Master Data hub | Administration | `/admin/master-data` | LIVE | ✅ | Lookup stats dashboard |
| 9 | Lookup Categories | Administration | `/admin/master-data/lookups/categories` | LIVE | ✅ | |
| 10 | Lookup Values | Administration | `/admin/master-data/lookups/values` | LIVE | ✅ | |
| 11 | Locked System Values | Administration | `/admin/master-data/lookups/system` | LIVE | ✅ | |
| 12 | Audit Logs | Administration | `/admin/audit` | LIVE | ✅ | |
| **Geography & Locations** |
| 13 | Countries | Geography | `/admin/master-data/geography/countries` | LIVE | ✅ | 245 seeded |
| 14 | Regions / Emirates | Geography | `/admin/master-data/geography/emirates` | LIVE | ✅ | |
| 15 | Cities | Geography | `/admin/master-data/geography/cities` | LIVE | ✅ | Cascading comboboxes |
| 16 | Areas & Zones | Geography | `/admin/master-data/geography/areas` | LIVE | ✅ | |
| 17 | Ports | Geography | `/admin/master-data/geography/ports` | LIVE | ✅ | |
| 18 | Work Sites | Geography | — | PLANNED | ❌ | In 002F.3C plan; not implemented |
| **Party Master** |
| 19 | Customers | Party Master | `/admin/master-data/customers` | **CLOSED** | ✅ | Reference implementation |
| 20 | Vendors | Party Master | — | DB-READY | ✅ | Tables + RLS; **build next** |
| 21 | Subcontractors | Party Master | — | DB-READY | ✅ | After Vendors |
| 22 | Consultants | Party Master | — | DB-READY | ✅ | |
| 23 | Government Authorities | Party Master | — | DB-READY | ✅ | No bank_details table |
| 24 | Recruitment Agencies | Party Master | — | DB-READY | ✅ | |
| **Finance Basics** |
| 25 | Currencies | Finance Basics | `/admin/master-data/finance-basics/currencies` | LIVE | ✅ | |
| 26 | Payment Terms | Finance Basics | `/admin/master-data/finance-basics/payment-terms` | LIVE | ✅ | |
| 27 | Tax Types | Finance Basics | `/admin/master-data/finance-basics/tax-types` | LIVE | ✅ | |
| 28 | Banks | Finance Basics | `/admin/master-data/finance-basics/banks` | LIVE | ✅ | |
| 29 | Cost Centers | Finance Basics | `/admin/master-data/finance-basics/cost-centers` | LIVE | ✅ | |
| 30 | Profit Centers | Finance Basics | `/admin/master-data/finance-basics/profit-centers` | LIVE | ✅ | |
| **Units & Measurements** |
| 31 | UOM Categories | UOM | `/admin/master-data/uom/categories` | LIVE | ✅ | |
| 32 | Units of Measure | UOM | `/admin/master-data/uom/units` | LIVE | ✅ | |
| 33 | UOM Conversions | UOM | `/admin/master-data/uom/conversions` | LIVE | ✅ | |
| **User area** |
| 34 | Profile | Footer/Header | `/profile` | LIVE | ✅ | Self-service |
| 35 | Settings | Footer | `/settings` | LIVE | — | Self-service |
| **Sidebar placeholders (Operations + Finance & Supply)** |
| 36 | Fleet Management | Operations | `/modules/fleet` | PLACEHOLDER | — | Sidebar "Soon"; dashboard demo card |
| 37 | HR & Payroll | Operations | `/modules/hr` | PLACEHOLDER | — | Operational module = roadmap 004 |
| 38 | Workshop | Operations | `/modules/workshop` | PLACEHOLDER | — | Roadmap 006 |
| 39 | HSE | Operations | `/modules/hse` | PLACEHOLDER | — | Roadmap 011 |
| 40 | Finance | Finance & Supply | `/modules/finance` | PLACEHOLDER | — | Roadmap operational finance |
| 41 | Inventory | Finance & Supply | `/modules/inventory` | PLACEHOLDER | — | Roadmap 007 |
| 42 | Procurement | Finance & Supply | `/modules/procurement` | PLACEHOLDER | — | Roadmap 008 |
| 43 | Documents (DMS) | Finance & Supply | `/modules/documents` | PLACEHOLDER | — | Roadmap 009; Customer tab placeholder |

Each **party-master module** (when built) should include on screen: list page, Add/Edit/View drawer, and child sections for **Contacts**, **Addresses**, **Bank Details** (where applicable), and **Documents** (via centralized DMS when ready).

---

### Planned operational modules (roadmap phases 003–018)

Not on sidebar yet. Defined in `ERP_FULL_IMPLEMENTATION_ROADMAP_PHASE_TRACKER.md`:

| Phase | Module | Depends on |
|---|---|---|
| 003 | **CRM** | 002F.3E party master |
| 004 | **HR & Payroll** (operational) | 002F.3F HR master data |
| 005 | **Fleet / Equipment** | 002F.3G fleet master data |
| 006 | **Workshop** | 002F.3G, 002F.3H |
| 007 | **Inventory / Store** | 002F.3H |
| 008 | **Procurement** | 002F.3E, 002F.3H |
| 009 | **DMS / Document Control** | 002F.3I |
| 010 | **Task Management / Workflow** | — |
| 011 | **HSE** (operational) | 002F.3I |
| 012 | **Scrap Trading** | 002F.3J |
| 013 | **Waste Management** | 002F.3J |
| 014 | **Demolition Projects** | 002F.3J |
| 015 | **Transport / Trips** | 002F.3G |
| 016 | **Rental / Equipment Utilization** | 002F.3G |
| 017 | **Fuel / Diesel Management** | 002F.3G, UOM |
| 018 | **Weighbridge Integration** | 002F.3G, hardware |

---

### Planned master-data foundation phases (before operations)

| Phase | Master data area | Feeds |
|---|---|---|
| 002F.3D | Settings foundation (dynamic sidebar, branding, templates) | All modules |
| 002F.3F | HR master data (employees, departments, positions…) | HR module |
| 002F.3G | Fleet / equipment master data | Fleet, Workshop, Transport |
| 002F.3H | Workshop / inventory / procurement master data | Workshop, Inventory, Procurement |
| 002F.3I | HSE / DMS / compliance master data | HSE, DMS |
| 002F.3J | Scrap / waste / demolition master data | Scrap, Waste, Demolition |
| 002F.3K | Master data QA gate | Gate before operations |

---

### Planned platform / cross-cutting modules (roadmap 019–025 + UX phases)

| Module | Phase / reference | Notes |
|---|---|---|
| **Reporting / KPI / Dashboard** (real BI) | 019 | Replace demo dashboard KPIs |
| **Notification / Reminder Engine** | 020 | Expiry alerts, renewals |
| **Approval Workflow Engine** | 021 | Multi-level approvals |
| **Global Print / PDF / Email Output** | 022 | Builds on 002F.3D.3 templates |
| **External Integrations** | 023 | Accounting, GPS, weighbridge, fuel cards |
| **Global Search / Command Palette** | 002F.3E.3C | Deep-link to module drawers |
| **AI Center / AI Assistant** | Future | After DMS + Global Search |
| **Expiry Dashboard** | Phase 001 foundation | Mentioned in original scope |
| **Security / Penetration testing** | 024 | Pre-production |
| **Final QA / UAT / Deployment** | 025 | Go-live |

---

### Recommended build order (from project docs)

```text
1. Vendors                    ← copy Customer pattern (002F.5)
2. Subcontractors
3. Consultants
4. Government Authorities
5. Recruitment Agencies
6. Documents / DMS readiness  ← 002F.4
7. Global Search              ← 002F.3E.3C
8. HR master data → HR module
9. Fleet master data → Fleet module
10. Workshop / Inventory / Procurement master data → those modules
11. Scrap / Waste / Demolition master data → those modules
12. Platform engines (notifications, approvals, reporting)
13. Production cleanup + manual browser QA
```

---

### Critical distinction for AI sessions

| Claim | Valid? |
|---|---|
| "Customers module is built" | ✅ Yes — CLOSED reference |
| "Vendors module is built" | ❌ No — DB tables only |
| "Fleet is in the sidebar" | ⚠ Visible but disabled "Soon" — not a module |
| "Dashboard shows Fleet stats" | ❌ Demo/fake data only |
| "57 Supabase tables exist" | ✅ Yes — includes future party-master tables |
| "32 working ERP screens" | ✅ Yes — all admin/master-data routes |

---

## 5.3 Implemented Modules

> **Full module map:** See **§5.2a** for the complete 43-item tracker (live + placeholder + planned), target sidebar tree, folder structure, and roadmap phases. This section details each **currently implemented** module.

### Summary table (live screens only — 32 working routes)

| Module | Route | Status | Verification |
|---|---|---|---|
| Dashboard | `/dashboard` | OK | source-verified |
| Users | `/admin/users` | OK | source-verified |
| Roles | `/admin/roles` | OK | source-verified |
| Permissions | `/admin/permissions` | OK | source-verified |
| Organizations | `/admin/organizations` | OK | source-verified |
| Branches | `/admin/branches` | OK | source-verified |
| Numbering Rules | `/admin/settings/numbering` | OK | source-verified |
| Lookup Categories | `/admin/master-data/lookups/categories` | OK | source-verified |
| Lookup Values | `/admin/master-data/lookups/values` | OK | source-verified |
| Locked System Values | `/admin/master-data/lookups/system` | OK | source-verified |
| Geography (5 pages) | `/admin/master-data/geography/*` | OK | source-verified |
| Finance Basics (6 pages) | `/admin/master-data/finance-basics/*` | OK | source-verified |
| UOM (3 pages) | `/admin/master-data/uom/*` | OK | source-verified |
| Customers | `/admin/master-data/customers` | **CLOSED (reference)** | source-verified + harness-verified |
| Audit Logs | `/admin/audit` | OK | source-verified |
| Profile | `/profile` | OK | source-verified |
| Settings | `/settings` | OK | source-verified |
| Master Data hub | `/admin/master-data` | OK | navigation hub only |

---

### Dashboard

| Field | Detail |
|---|---|
| **Route** | `/dashboard` |
| **Components** | `src/app/(protected)/dashboard/page.tsx` |
| **Server actions** | None (read-only) |
| **Tables** | None directly |
| **Permissions** | `dashboard.view` |
| **Notes** | Entry point after login |

---

### Users

| Field | Detail |
|---|---|
| **Route** | `/admin/users` |
| **Components** | `src/features/users/*` — table, add/edit dialogs |
| **Server actions** | `src/server/actions/users.ts` |
| **Tables** | `user_profiles`, `user_roles` |
| **Permissions** | View: page-level auth; Manage: `users.manage` |
| **Notes** | RBAC assignment via roles |

---

### Roles

| Field | Detail |
|---|---|
| **Route** | `/admin/roles` |
| **Components** | `src/features/roles/*` — table, form dialog, detail drawer |
| **Server actions** | `src/server/actions/roles.ts` |
| **Tables** | `roles`, `role_permissions`, `user_roles` |
| **Permissions** | `roles.view`, `roles.manage` |
| **Notes** | Permission assignment UI in role detail drawer |

---

### Permissions

| Field | Detail |
|---|---|
| **Route** | `/admin/permissions` |
| **Components** | `src/features/permissions/*` |
| **Server actions** | `src/server/actions/permissions.ts` |
| **Tables** | `permissions`, `role_permissions` |
| **Permissions** | `permissions.view`; manage via `roles.manage` |
| **Notes** | Read-focused page; mutations go through roles |

---

### Organizations

| Field | Detail |
|---|---|
| **Route** | `/admin/organizations` |
| **Components** | `organizations-table.tsx`, `organization-form-dialog.tsx`, `add-organization-button.tsx` |
| **Prefetch** | `ORGANIZATION_FORM_PREFETCH`, `useOrganizationFormPrefetch` (wired 3B.6G.6) |
| **Server actions** | `src/server/actions/organizations.ts` |
| **Tables** | `owner_companies` |
| **Permissions** | `organizations.view`, `organizations.manage` |
| **Known notes** | **Legacy text-column sync:** geography FK selects (`country_id`, `emirate_id`, etc.) sync legacy text name columns on save for backward compatibility (Phase 002F.3C.4B). Structured FK is source of truth. |

---

### Branches

| Field | Detail |
|---|---|
| **Route** | `/admin/branches` |
| **Components** | `branches-table.tsx`, `branch-form-dialog.tsx`, `add-branch-button.tsx` |
| **Prefetch** | `BRANCH_FORM_PREFETCH`, `useBranchFormPrefetch` (wired 3B.6G.6) |
| **Server actions** | `src/server/actions/branches.ts` |
| **Tables** | `branches` |
| **Permissions** | `branches.view`, `branches.manage` |
| **Known notes** | **Interim geography:** Branch form uses geography selects that map to **legacy text fields** (`country`, `emirate`, `city`, `area`) — FK migration deferred. View mode shows "(legacy)" labels for unmigrated text values. `resolveGeographyTextFields()` syncs on save. |

---

### Numbering Rules

| Field | Detail |
|---|---|
| **Route** | `/admin/settings/numbering` |
| **Components** | `src/features/numbering/components/*` |
| **Server actions** | `src/server/actions/numbering.ts` |
| **Tables** | `global_numbering_rules`, `global_numbering_sequence_states`, `global_numbering_generated_references` |
| **Permissions** | `numbering.rules.view`, `numbering.rules.manage` |
| **Known notes** | Page has no page-level permission guard; `getNumberingRules()` is server-checked. Unauthorized users see empty shell (cosmetic UX gap). Uses `generateNextReference()` for sequence generation. |

---

### Lookup Categories / Values / Locked System Values

| Field | Detail |
|---|---|
| **Routes** | `/admin/master-data/lookups/categories`, `/values`, `/system` |
| **Components** | `src/features/master-data/lookups/components/*` |
| **Server actions** | `src/server/actions/master-data/lookups.ts` (22+ permission checks) |
| **Tables** | `global_lookup_categories`, `global_lookup_values` |
| **Permissions** | `master_data.lookups.view`, `master_data.lookups.manage`, `master_data.lookups.lock` (system_admin for lock ops) |
| **Notes** | Drives all `LookupSelect` / enum-like fields across ERP |

---

### Geography Master Data

| Field | Detail |
|---|---|
| **Routes** | `/admin/master-data/geography/countries`, `/emirates`, `/cities`, `/areas`, `/ports` |
| **Components** | `src/features/master-data/geography/components/*` |
| **Server actions** | `src/features/master-data/geography/actions.ts` (27 permission checks) |
| **Tables** | `countries`, `emirates`, `cities`, `areas_zones`, `ports` |
| **Permissions** | `master_data.geography.view`, `master_data.geography.manage` |
| **Notes** | Cascading comboboxes (country → emirate → city → area). City/Port emirate-save bug fixed in 3B.6D. |

---

### Finance Basics Master Data

| Field | Detail |
|---|---|
| **Routes** | `/admin/master-data/finance-basics/currencies`, `/payment-terms`, `/tax-types`, `/banks`, `/cost-centers`, `/profit-centers` |
| **Components** | `src/features/master-data/finance-basics/components/*` |
| **Server actions** | `src/features/master-data/finance-basics/actions.ts` (37 permission checks) |
| **Tables** | `currencies`, `payment_terms`, `tax_types`, `banks`, `cost_centers`, `profit_centers` |
| **Permissions** | `master_data.finance_basics.view`, `master_data.finance_basics.manage` |
| **Notes** | Cost/Profit centers use `LookupSelect` + OwnerCompany/Branch selectors |

---

### UOM / Units Master Data

| Field | Detail |
|---|---|
| **Routes** | `/admin/master-data/uom/categories`, `/units`, `/conversions` |
| **Components** | `src/features/master-data/uom/components/*` |
| **Server actions** | `src/features/master-data/uom/actions.ts` (16 permission checks) |
| **Tables** | `uom_categories`, `units_of_measure`, `uom_conversions` |
| **Permissions** | `master_data.uom.view`, `master_data.uom.manage` |
| **Notes** | Select wrappers ready for future operational modules |

---

### Customers (Reference Implementation)

| Field | Detail |
|---|---|
| **Route** | `/admin/master-data/customers` |
| **Components** | `customers-table.tsx`, `customer-form-drawer.tsx`, child sections (contacts/addresses/bank details) |
| **Prefetch** | `CUSTOMER_FORM_PREFETCH`, `useCustomerFormPrefetch` |
| **Child hooks** | `use-customer-child-queries.ts` → `useChildTableQuery` |
| **Server actions** | `customers.ts`, `customer-contacts.ts`, `customer-addresses.ts`, `customer-bank-details.ts` |
| **Tables** | `customers`, `customer_contacts`, `customer_addresses`, `customer_bank_details`, `customer_documents` |
| **Permissions** | `master_data.party_master.view`, `master_data.party_master.manage`; lock ops need `system_admin` |
| **Numbering** | `CUSTOMER`, `CUSTOMER_CONTACT` document types |
| **Status** | **CLOSED WITH NOTES** — see §5.5 |
| **Known notes** | Documents tab is DMS placeholder; sales owner field in schema but no UI picker yet |

---

### Audit Logs

| Field | Detail |
|---|---|
| **Route** | `/admin/audit` |
| **Components** | `src/features/audit/*` |
| **Server** | `src/server/queries/audit.ts`, `src/server/actions/audit.ts` (`logAudit` helper) |
| **Tables** | `audit_logs` |
| **Permissions** | Page permission-gated |
| **Notes** | `logAudit()` called from all mutation server actions |

---

### Profile / Settings

| Field | Detail |
|---|---|
| **Routes** | `/profile`, `/settings` |
| **Components** | `src/features/profile/*`, settings page |
| **Permissions** | Auth-gated only (self-service by design) |
| **Notes** | No module-specific permission strings |

---

### NOT Implemented (do not claim as built)

See **§5.2a master inventory tracker** rows 18–43 for the full list. Summary:

**DB-ready, no UI (Party Master — build next):**
- Vendors, Subcontractors, Consultants, Government Authorities, Recruitment Agencies — Supabase tables + RLS exist; zero routes, server actions, or sidebar links

**Sidebar placeholders only (`comingSoon: true`):**
- Fleet Management, HR & Payroll, Workshop, HSE, Finance, Inventory, Procurement, Documents/DMS — visible as disabled "Soon" items; no routes

**Dashboard demo cards only (not linked):**
- Same 8 operational modules shown on `/dashboard` with fake KPI data

**Roadmap only (not on screen):**
- CRM, Transport/Trips, Rental, Fuel/Diesel, Weighbridge, Scrap Trading, Waste Management, Demolition, Task Management, Reporting/KPI, Notifications, Approvals, Global Search, AI Center, Work Sites, Settings foundation (dynamic menu, branding, templates)

**Inside Customer drawer:**
- Documents tab = static DMS placeholder text only

---

## 5.4 Global Components

| Component / Utility | Path | Purpose |
|---|---|---|
| **ERPDrawerForm** | `src/components/erp/erp-drawer-form.tsx` | Parent drawer shell (27 usages) |
| **ERPDrawerSection** | exported from `erp-drawer-form.tsx` | Tab sections; supports `lazyMount` |
| **ERPFormFooter** | `src/components/erp/erp-form-footer.tsx` | Cancel / Save / Save & Close / Close (25 form usages) |
| **RequiredLabel** | `src/components/erp/required-label.tsx` | Required field asterisk (31 usages) |
| **ERPCombobox** | `src/components/erp/combobox/erp-combobox.tsx` | Searchable combobox with debounce (19 usages) |
| **LookupSelect** | `src/components/erp/lookup-select.tsx` | Lookup-category-backed combobox (15 usages) |
| **UnsavedChangesDialog** | `src/components/erp/unsaved-changes-dialog.tsx` | Safe Close confirmation (2 usages) |
| **useFormDirty** | `src/hooks/use-form-dirty.ts` | Dirty tracking incl. combobox-only edits (25 form usages) |
| **TanStack Query provider** | `src/components/layout/app-providers.tsx` + `src/lib/query/query-client.ts` | Global query client |
| **query keys** | `src/lib/query/query-keys.ts` | Stable key factories incl. `queryKeys.child.*` |
| **invalidation helpers** | `src/lib/query/invalidation.ts` | `invalidateChildTable`, `createChildInvalidator` |
| **prefetch utilities** | `src/lib/query/prefetch-lookups.ts` | `prefetchLookupCategories`, `prefetchMasterDataQueries`, `seedLookupCategoryValues` |
| **form prefetch types** | `src/lib/query/form-prefetch-types.ts` | `FormPrefetchDeclaration`, descriptors |
| **master data fetchers** | `src/lib/lookups/master-data-fetchers.ts` | Shared fetchers for hooks + prefetch |
| **child table query hook** | `src/hooks/child-tables/use-child-table-query.ts` | Generic child TanStack hook (staleTime 5 min) |
| **Lookup query hooks** | `src/hooks/lookups/use-lookup-queries.ts` | Per-category lookup cache |
| **Geography query hooks** | `src/hooks/lookups/use-geography-queries.ts` | Countries, emirates, cities, etc. |
| **Finance query hooks** | `src/hooks/lookups/use-finance-queries.ts` | Currencies, payment terms, tax types |
| **Domain select wrappers** | `src/components/erp/geography/*`, `finance-basics/*`, `organizations/*`, `uom/*` | Thin wrappers over cached hooks |
| **App sidebar** | `src/components/layout/app-sidebar.tsx` | Static nav; future modules marked `comingSoon` |
| **ERP data table** | `src/components/erp/table/erp-data-table.tsx` | Standard list table |

---

## 5.5 Customer Module Reference Implementation

Use Customer as the template for all future party-master modules (Vendors first).

### Customer list

- **File:** `src/features/master-data/customers/components/customers-table.tsx`
- Page-mount prefetch: `useCustomerFormPrefetch()` in `useEffect`
- Click-time prefetch: `prefetchCustomerForm()` in `openDrawer`
- Drawer keyed by `mode-id` for clean remount

### Add / Edit / View drawer

- **File:** `src/features/master-data/customers/components/customer-form-drawer.tsx`
- Tabs: Basic, Location, Finance, Compliance, Contacts, Documents, Audit
- **Footer:** Add/Edit → Cancel | Save | Save & Close; View → Close only
- **Safe Close:** Escape, outside click, close button → `UnsavedChangesDialog` when dirty
- **View mode:** inputs disabled; dirty tracking off

### Lookup prefetch

- **Declaration:** `src/features/master-data/customers/customer-prefetch.ts` → `CUSTOMER_FORM_PREFETCH`
- **Hook:** `src/features/master-data/customers/hooks/use-customer-form-prefetch.ts`
- Batch prefetches 6 lookup categories + 4 master queries on drawer open
- Child-section lookup categories (`CONTACT_TYPES`, `ADDRESS_TYPES`, etc.) prefetch on section mount (3B.6G.3B)

### Child tables

| Section | Hook | Server actions | Invalidation |
|---|---|---|---|
| Contacts | `useCustomerContactsQuery` | `customer-contacts.ts` | `invalidateCustomerContacts` |
| Addresses | `useCustomerAddressesQuery` | `customer-addresses.ts` | `invalidateCustomerAddresses` |
| Bank details | `useCustomerBankDetailsQuery` | `customer-bank-details.ts` | `invalidateCustomerBankDetails` |

All delegate to `useChildTableQuery`. Skeleton loaders during cold fetch. staleTime **5 minutes**.

### Safe Close + dirty tracking

- `useFormDirty` on form ref
- Combobox `onValueChange` calls `markDirty()`
- Save resets dirty; Save & Close closes on success

### Numbering

- Customer code: `generateNextReference("CUSTOMER")` on create — read-only in UI
- Contact code: `generateNextReference("CUSTOMER_CONTACT")` on create
- Addresses/bank details: no numbered references (by design)

### FormData safety

- Parent save uses **full-payload** `new FormData(form)` — only mounted inputs included
- Basic/Location/Finance/Compliance tabs: **always mounted** (FormData fields)
- Contacts/Documents/Audit tabs: **lazyMount** (FormData-safe — no parent inputs)
- Location/Finance tabs: **partial lazyMount** — parent inputs mounted; child CRUD lazy
- **3B.7 fix:** `effectiveCustomerId = currentCustomer?.id ?? createdCustomerId` unlocks child sections immediately after Add → Save

### Known notes (not blocking)

| Item | Status |
|---|---|
| Documents tab | Static DMS placeholder — "Documents will be managed through the centralized DMS module" |
| Sales owner picker | Column `sales_owner_user_profile_id` in schema/types/validation; **no UI field yet** |
| Browser QA | **browser-authenticated pending** for Sameer/Dina manual pass |

---

## 5.6 Global Runtime Rules

### Safe Close rule
- Any dirty form (text OR combobox-only edit) must intercept close with `UnsavedChangesDialog`
- View mode never marks dirty
- Implemented via `useFormDirty` + drawer/dialog close handlers

### Footer rule
- Add/Edit: **Cancel | Save | Save & Close**
- View: **Close** only
- Save keeps drawer open; Save & Close closes on success
- All forms use shared `ERPFormFooter`

### Required field rule
- Required fields display `RequiredLabel` with asterisk
- Server-side Zod validation is authoritative

### Combobox rule
- Domain selectors use `ERPCombobox` or `LookupSelect` (or documented enum `Select` exception)
- No direct Supabase fetch in selector components — use cached TanStack hooks
- Dependent cascades fetch on parent value change; do not prefetch all combinations
- Combobox changes must call `markDirty()`

### Parent form runtime rule
- Every lookup-heavy parent form exports a `FormPrefetchDeclaration` constant
- Drawer open: `prefetchLookupCategories` (one batch) + `prefetchMasterDataQueries` (parallel)
- Shell renders immediately — never await fetches before showing drawer
- See: `docs/standards/ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md`

### Child table query rule
- Use `useChildTableQuery` — do not copy-paste query logic
- Query enabled only when: tab activated AND parent id exists
- Add mode: "Save parent first" placeholder
- Mutations call `createChildInvalidator(tableName)` — targeted invalidation only
- Child edits do NOT mark parent dirty (separate sub-dialogs)

### FormData lazy mount safety
- **Never lazy-unmount** sections whose inputs feed parent `FormData` save
- Safe to lazy-mount: child CRUD tables, read-only audit, placeholders
- Once lazy-mounted section activates, it stays mounted (CSS hidden, not unmounted)
- Full lazy-mount unlocks only when save becomes patch-style

### Prefetch rule
- Page-mount + click-time prefetch on list tables (Customer, Organization, Branch pattern)
- Batch lookup prefetch seeds individual `queryKeys.lookup.values` entries
- Never invent hand-written query key arrays — use `queryKeys` factories

### Numbering rule
- Auto-generated codes via `generateNextReference(documentType)` — read-only in UI
- No duplicate creation from repeated Save (server-side sequential execution)
- Numbering rules managed at `/admin/settings/numbering`

### Permissions / RLS rule
- Every mutation: `getAuthContext()` + `hasPermission()` server-side
- UI hides/disables actions based on permissions where implemented
- RLS enabled on all module tables (verified live)
- `logAudit()` on all CRUD mutations
- Use **`user-supabase`** MCP for ERP database work

### Runtime QA rule
- Source QA + dev harnesses + static build when browser unavailable
- If no authenticated browser session: status must be **PASS WITH NOTES**, not clean PASS
- Dev harness routes must `notFound()` in production; delete before deployment

---

## 5.7 Current Known Technical Debt

| Item | Severity | Notes |
|---|---|---|
| **Dev harnesses to delete before production** | Required pre-deploy | `/dev/performance-qa`, `/dev/customer-prefetch-qa`, `/dev/customer-child-qa` — guarded with `notFound()` but must be removed |
| **Pre-existing lint debt** | Non-blocking | ~60 errors (mostly `no-explicit-any` in `lookups.ts`); 0 new from recent phases |
| **middleware → proxy deprecation** | Non-blocking | Next.js 16.2.6 build warning; migrate `src/middleware.ts` when ready |
| **Numbering page unauthorized UX** | Minor | Empty shell instead of access-denied card; data still server-protected |
| **Organization/Branch legacy text-column sync** | Known design debt | Geography FK selects sync legacy text name columns on save; Branch still interim text mapping |
| **DMS/Documents placeholder** | Expected | Customer Documents tab is placeholder; centralized DMS module not built |
| **Customer sales owner picker** | Future | DB column exists; no UI picker wired |
| **Browser QA manual acceptance** | Pending | Sameer/Dina click-through checklist not completed in agent sessions |
| **Phase trackers stale** | Documentation | `ERP_BASE_FULL_PHASE_STATUS_TRACKER.md` predates 3B.6G–3E.4 closures |
| **Supabase plugin mismatch** | Tooling | `plugin-supabase-supabase` → wrong project; always use `user-supabase` |
| **Party-master DB without UI** | Informational | Vendor/Subcontractor/etc. tables exist in Supabase; zero app routes |

---

## 5.8 Important Files List

### Standards (read first on any new phase)

```
docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md
docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
docs/standards/ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md
docs/standards/README.md
```

### Latest closure reports

```
implementation_Review/Phase_002F_3E_4_Closure/ERP_BASE_002F_3E_4_CURRENT_MODULES_GLOBAL_QA_GATE_REPORT.md
implementation_Review/Phase_002F_3E_3B7_Closure/ERP_BASE_002F_3E_3B_7_CUSTOMER_MODULE_FINAL_QA_AND_CLOSURE_REPORT.md
implementation_Review/Phase_002F_3E_3B6G6_Implementation/ERP_BASE_002F_3E_3B_6G_6_RUNTIME_QA_CLOSURE_ORGANIZATION_BRANCH_PREFETCH_WIRING_REPORT.md
implementation_Review/Phase_002F_3E_3B6G5_Implementation/ERP_BASE_002F_3E_3B_6G_5_APPLY_STANDARD_TO_EXISTING_FORMS_FUTURE_READY_MODULES_REPORT.md
implementation_Review/Phase_002F_3E_3B6G4_Implementation/ERP_BASE_002F_3E_3B_6G_4_GENERIC_CHILD_TABLE_QUERY_INVALIDATION_PATTERN_REPORT.md
implementation_Review/Phase_002F_3E_3B6G3_Implementation/ERP_BASE_002F_3E_3B_6G_3_CUSTOMER_CHILD_TABLES_TANSTACK_QUERY_MIGRATION_REPORT.md
implementation_Review/Phase_002F_3E_3B6G3B_Investigation/ERP_BASE_002F_3E_3B_6G_3B_CUSTOMER_CONTACTS_LOADING_INVESTIGATION_AND_FIX_REPORT.md
implementation_Review/Phase_002F_3E_3B6G2_Implementation/ERP_BASE_002F_3E_3B_6G_2_CUSTOMER_BASIC_TAB_LOOKUP_PREFETCH_WIRING_REPORT.md
implementation_Review/Phase_002F_3E_3B6G1_Implementation/ERP_BASE_002F_3E_3B_6G_1_GLOBAL_PARENT_FORM_RUNTIME_STANDARD_AND_PREFETCH_UTILITIES_REPORT.md
implementation_Review/Phase_002F_3E_3B6F_ClosureGate/ERP_BASE_002F_3E_3B_6F_GLOBAL_COMBOBOX_FORM_PERFORMANCE_RUNTIME_QA_CLOSURE_GATE_REPORT.md
implementation_Review/Phase_002F_3E_3B5_Implementation/ERP_BASE_002F_3E_3B_5_GLOBAL_FORM_RUNTIME_QA_AND_STANDARD_CLOSURE_GATE_REPORT.md
implementation_Review/Phase_002F_3E_3B4C_Implementation/ERP_BASE_002F_3E_3B_4C_SAFE_CLOSE_RUNTIME_INVESTIGATION_AND_FIX_REPORT.md
implementation_Review/Phase_002F_3E_3B2D_QA/ERP_BASE_002F_3E_3B_2D_CUSTOMER_FORM_FINAL_QA_REPORT.md
```

### Global ERP components

```
src/components/erp/erp-drawer-form.tsx
src/components/erp/erp-form-footer.tsx
src/components/erp/required-label.tsx
src/components/erp/unsaved-changes-dialog.tsx
src/components/erp/combobox/erp-combobox.tsx
src/components/erp/lookup-select.tsx
src/components/erp/table/erp-data-table.tsx
src/components/layout/app-sidebar.tsx
src/components/layout/app-providers.tsx
src/components/layout/erp-shell.tsx
```

### Query / cache / prefetch layer

```
src/lib/query/query-keys.ts
src/lib/query/query-client.ts
src/lib/query/invalidation.ts
src/lib/query/prefetch-lookups.ts
src/lib/query/form-prefetch-types.ts
src/lib/lookups/master-data-fetchers.ts
src/hooks/use-form-dirty.ts
src/hooks/child-tables/use-child-table-query.ts
src/hooks/lookups/use-lookup-queries.ts
src/hooks/lookups/use-geography-queries.ts
src/hooks/lookups/use-finance-queries.ts
```

### Customer reference module

```
src/features/master-data/customers/customer-prefetch.ts
src/features/master-data/customers/hooks/use-customer-form-prefetch.ts
src/features/master-data/customers/hooks/use-customer-child-queries.ts
src/features/master-data/customers/components/customers-table.tsx
src/features/master-data/customers/components/customer-form-drawer.tsx
src/features/master-data/customers/components/customer-contacts-section.tsx
src/features/master-data/customers/components/customer-addresses-section.tsx
src/features/master-data/customers/components/customer-bank-details-section.tsx
src/server/actions/master-data/customers.ts
src/server/actions/master-data/customer-contacts.ts
src/server/actions/master-data/customer-addresses.ts
src/server/actions/master-data/customer-bank-details.ts
```

### Organization / Branch prefetch (wired)

```
src/features/organizations/organization-prefetch.ts
src/features/organizations/hooks/use-organization-form-prefetch.ts
src/features/branches/branch-prefetch.ts
src/features/branches/hooks/use-branch-form-prefetch.ts
```

### Future party-master templates (not wired)

```
src/lib/standards/party-master-prefetch-templates.ts
```

### Server actions (mutations)

```
src/server/actions/users.ts
src/server/actions/roles.ts
src/server/actions/permissions.ts
src/server/actions/organizations.ts
src/server/actions/branches.ts
src/server/actions/numbering.ts
src/server/actions/master-data/lookups.ts
src/server/actions/master-data/customers.ts
src/server/actions/master-data/customer-contacts.ts
src/server/actions/master-data/customer-addresses.ts
src/server/actions/master-data/customer-bank-details.ts
src/server/actions/audit.ts
src/features/master-data/geography/actions.ts
src/features/master-data/finance-basics/actions.ts
src/features/master-data/uom/actions.ts
```

### Auth / RBAC / Supabase

```
src/lib/rbac/check.ts
src/lib/supabase/server.ts
src/lib/supabase/middleware.ts
src/middleware.ts
```

### Dev harnesses (delete before production)

```
src/app/dev/performance-qa/
src/app/dev/customer-prefetch-qa/
src/app/dev/customer-child-qa/
```

### Prompt library (phase prompts)

```
ChatGPT/Phase_002/
ChatGPT/PROMPT_ERP_BASE_002F_3E_4_CURRENT_MODULES_GLOBAL_QA_GATE.md
```

---

## 5.9 Next Recommended Phases

### Immediate sequence

| Order | Phase | Description |
|---|---|---|
| **1** | **ERP BASE 002F.4 — Attachment / Documents Placeholder Readiness** | Prepare centralized DMS attachment pattern; replace Customer Documents placeholder; define upload/storage/RLS standard |
| **2** | **ERP BASE 002F.5 — Party-Master Module Preparation** | Finalize Vendor module plan using Customer as template + `party-master-prefetch-templates.ts` |
| **3** | **First party-master: Vendors** | List + drawer + child tables; copy Customer pattern |
| **4** | Subcontractors | Same pattern |
| **5** | Consultants | Same pattern |
| **6** | Government Authorities | Same pattern |
| **7** | Recruitment Agencies | Same pattern |

### Production cleanup phase (before deployment)

```
1. Delete all /dev/* harness routes
2. Lint cleanup (lookups.ts no-explicit-any debt)
3. middleware → proxy migration (Next.js 16)
4. Manual browser QA acceptance (Sameer/Dina) — full module click-through
5. Remove or finalize "Soon" sidebar placeholders when modules ship
```

### When building the next party-master module, copy this checklist

1. Create `vendor-prefetch.ts` from `party-master-prefetch-templates.ts`
2. Create server actions mirroring customer action chain (Zod → RBAC → numbering → audit → revalidatePath)
3. Create `use-vendor-child-queries.ts` using `useChildTableQuery`
4. Register invalidators via `createChildInvalidator`
5. Build drawer using `ERPDrawerForm` + `ERPFormFooter` + `useFormDirty`
6. Wire prefetch on list page mount + click
7. Apply FormData safety rules from parent form runtime standard
8. Runtime QA checklist from standard §7
9. Write implementation report before closure

---

## 5.10 Instructions for New ChatGPT Chat

### Ready-to-paste opening message

```text
I am continuing development on the ALGT ERP project (Alliance Gulf Transport ERP).

Please read the uploaded handoff guide: ERP_FULL_IMPLEMENTATION_GUIDE_FOR_NEXT_CHAT.md

Key facts:
- Stack: Next.js 16.2.6, React 19, TypeScript, Supabase PostgreSQL + RLS, TanStack Query v5
- Live Supabase: https://mmiefuieduzdiiwnqpie.supabase.co (use user-supabase MCP, NOT plugin-supabase)
- Last closed gate: ERP BASE 002F.3E.4 — PASS WITH NOTES (2026-06-12)
- Customer module is CLOSED and is the reference implementation for party-master modules
- **32 live ERP screens** (admin + master data + Customer); see guide §5.2a for full module map
- **5 party-master modules** have DB tables but NO UI (Vendors next)
- **8 sidebar "Soon" items** + **8 dashboard demo cards** are placeholders only — not real modules
- Global form runtime standards are in docs/standards/ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md
- Do NOT invent modules — only Users/Roles/Orgs/Branches/Numbering/Lookups/Geography/Finance/UOM/Customers are built in UI
- Browser-authenticated QA is still pending manual confirmation by Sameer/Dina

Standards to follow on every task:
1. docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md
2. docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
3. docs/standards/ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md

Recommended next phase: ERP BASE 002F.4 — Attachment / Documents Placeholder Readiness
Then: ERP BASE 002F.5 — Party-Master Module Preparation → Vendors first

Rules:
- Phase-gated workflow — do not skip ahead without explicit approval
- No database schema changes unless the phase prompt explicitly requires migrations
- Fix blocking bugs only during QA gates; no feature creep
- Use Customer module as copy template for party-master modules
- Verify Supabase against mmiefuieduzdiiwnqpie before any DB work
- If browser QA unavailable, report PASS WITH NOTES not clean PASS

I will attach the phase prompt when ready. Confirm you have read the handoff guide and state the current project status before proceeding.
```

### Cursor session startup checklist

1. Read `AGENTS.md` and the three standards in `docs/standards/`
2. Read the latest closure report for the phase you are executing
3. Connect Supabase via **`user-supabase`** — confirm URL is `mmiefuieduzdiiwnqpie`
4. Run `npm run typecheck && npm run build` before closing any implementation phase
5. Write an implementation report in `implementation_Review/` matching prior report naming
6. Do not commit unless explicitly asked

---

## Appendix A — Live Supabase Tables (2026-06-12 verification)

**57 public tables**, all with RLS enabled. Core implemented-module tables plus schema-ready party-master tables:

**Admin/RBAC:** user_profiles, roles, permissions, role_permissions, user_roles, audit_logs  
**Org structure:** owner_companies, branches  
**Numbering:** global_numbering_rules, global_numbering_sequence_states, global_numbering_generated_references  
**Lookups:** global_lookup_categories, global_lookup_values  
**Geography:** countries, emirates, cities, areas_zones, ports  
**Finance:** currencies, payment_terms, tax_types, banks, cost_centers, profit_centers  
**UOM:** uom_categories, units_of_measure, uom_conversions  
**Customer (UI built):** customers, customer_contacts, customer_addresses, customer_bank_details, customer_documents  
**Party-master (DB only, no UI):** vendors, vendor_contacts, vendor_addresses, vendor_bank_details, vendor_documents, subcontractors + children, consultants + children, government_authorities + children, recruitment_agencies + children

---

## Appendix B — Static Test Baseline (3E.4 gate)

| Test | Result |
|---|---|
| `npm run typecheck` | ✅ PASS |
| `npm run build` | ✅ PASS (38 routes) |
| `npm run lint` | ⚠ 60 pre-existing errors; 0 new from recent phases |

---

## Appendix C — Source Search Snapshot (2026-06-12)

| Pattern | Files matching |
|---|---|
| ERPDrawerForm | 27 |
| ERPFormFooter | 25 |
| RequiredLabel | 31 |
| useFormDirty | 25 |
| ERPCombobox | 19 |
| LookupSelect | 15 |
| UnsavedChangesDialog | 2 |
| generateNextReference | 3 |
| getAuthContext | 43 |
| hasPermission | 43 |

---

## Appendix D — ERP Navigation & Route Reference (live routes)

All routes under `src/app/(protected)/` (source-verified, 3E.4 build):

| Route | Module |
|---|---|
| `/dashboard` | Dashboard |
| `/profile` | Profile |
| `/settings` | Settings |
| `/admin/users` | Users |
| `/admin/roles` | Roles |
| `/admin/permissions` | Permissions |
| `/admin/organizations` | Organizations |
| `/admin/branches` | Branches |
| `/admin/audit` | Audit Logs |
| `/admin/settings/numbering` | Numbering Rules |
| `/admin/master-data` | Master Data hub |
| `/admin/master-data/lookups/categories` | Lookup Categories |
| `/admin/master-data/lookups/values` | Lookup Values |
| `/admin/master-data/lookups/system` | Locked System Values |
| `/admin/master-data/geography/countries` | Countries |
| `/admin/master-data/geography/emirates` | Regions / Emirates |
| `/admin/master-data/geography/cities` | Cities |
| `/admin/master-data/geography/areas` | Areas & Zones |
| `/admin/master-data/geography/ports` | Ports |
| `/admin/master-data/finance-basics/currencies` | Currencies |
| `/admin/master-data/finance-basics/payment-terms` | Payment Terms |
| `/admin/master-data/finance-basics/tax-types` | Tax Types |
| `/admin/master-data/finance-basics/banks` | Banks |
| `/admin/master-data/finance-basics/cost-centers` | Cost Centers |
| `/admin/master-data/finance-basics/profit-centers` | Profit Centers |
| `/admin/master-data/uom/categories` | UOM Categories |
| `/admin/master-data/uom/units` | Units of Measure |
| `/admin/master-data/uom/conversions` | UOM Conversions |
| `/admin/master-data/customers` | Customers |

**Dev-only (delete before production):** `/dev/performance-qa`, `/dev/customer-prefetch-qa`, `/dev/customer-child-qa`

**Auth (public):** `/login`, `/signup`, `/forgot-password`, `/reset-password`

---

*End of handoff guide. Last updated 2026-06-12 with ERP module map & on-screen structure (§5.2a).*
