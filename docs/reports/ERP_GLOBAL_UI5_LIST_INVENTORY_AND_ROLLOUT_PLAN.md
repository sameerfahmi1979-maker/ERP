# ERP GLOBAL UI.5 — List Inventory & Rollout Plan

**Phase:** ERP GLOBAL UI.5 — Universal List UI Standard  
**Report date:** 2026-07-02  
**Audit scope:** Full codebase scan — all list/table/grid screens  
**Visual reference standard:** `/dms/documents` (All Documents)  
**Rule file:** `.cursor/rules/erp-global-list-ui-standard.mdc`  
**Status:** PLANNING — no code changes applied in this report

---

## 1. Executive Summary

| Metric | Count |
|--------|------:|
| Total list/table screens identified | ~95 |
| Workspace routes with `tabKind: "list"` | 74 |
| Additional unregistered list UIs | ~21 |
| Screens using `ERPDataTable` | 23 |
| Screens using DMS Custom table stack | 10 |
| Screens using Employees Custom (UI.5-aligned) | 1 |
| Screens using plain HTML `<table>` | 18 |
| Screens using card/list layout (no `<table>`) | 38+ |
| Screens with unknown/legacy table component | 1 |
| Screens with `ERPPageHeader` ✓ | ~40 |
| Screens with two-row labeled filter toolbar ✓ | 2 (DMS Documents + Employees) |
| Screens with active filter chips ✓ | 2 (DMS Documents + Employees) |
| Screens with `TablePagination` ✓ | ~15 |
| Screens with column resize ✓ | ~25 (ERPDataTable + 2 custom) |

### Overall Assessment

**The ERP is visually fragmented across five different list patterns.** Only two screens — All Documents and Employees — are fully aligned to the UI.5 standard. The majority of HR, notifications, and settings screens use ad-hoc card/list layouts with no shared toolbar, filter, or pagination components.

**Complexity:** Medium-to-high. The migration path is clear (extend All Documents patterns), but there are ~95 screens to touch across 8+ modules. The ERPDataTable family (23 screens) is the easiest batch — primarily needs toolbar/filter alignment. The card-layout HR screens are the most work — they need structural re-architecture.

**Pilot recommendation:** Proceed directly with UI.5B–C to align the 23 ERPDataTable-based screens, starting with Parties (highest traffic, missing ERPPageHeader). Employees is already UI.5-compliant as of UI.5A pilot.

---

## 2. Full Inventory Table

> Gap Levels: **Low** = close to standard | **Medium** = needs toolbar/filter polish | **High** = major mismatch | **Critical** = broken/inconsistent
> 
> Priority: **P0** = must fix before wider rollout | **P1** = first batch | **P2** = second batch | **P3** = later

### DMS Module

| # | Module | Screen | Route | Main Component | Table System | Current Status | UI.5 Gap | Recommended Action | Priority |
|---|--------|--------|-------|---------------|-------------|---------------|----------|-------------------|----------|
| 1 | DMS | All Documents ★ | `/dms/documents` | `dms-documents-table.tsx` | DMS Custom | **REFERENCE** | — | Maintain as canonical reference | — |
| 2 | DMS | Upload Inbox | `/dms/inbox` | `dms-upload-session-table.tsx` | Plain HTML | Missing toolbar | Medium | Two-row toolbar, pagination | P2 |
| 3 | DMS | Batch Intake | `/dms/inbox/batches` | `dms-batch-list-client.tsx` | DMS Custom | Partial | Medium | Add labeled filters, filter chips | P2 |
| 4 | DMS | Review Queue | `/dms/review-queue` | `dms-review-queue-table.tsx` | Plain HTML | Missing pagination | Medium | Port to DMS Custom stack, add pagination | P2 |
| 5 | DMS | Document Renewals | `/dms/renewals` | `dms-renewal-requests-table.tsx` | DMS Custom | Partial | Medium | Add ERPPageHeader, labeled filters | P2 |
| 6 | DMS | Expiry Dashboard | `/dms/expiring` | `dms-expiring-documents-table.tsx` | DMS Custom | Partial | Medium | Add ERPPageHeader, labeled filters | P2 |
| 7 | DMS | DMS Notifications | `/dms/notifications` | `dms-notifications-table.tsx` | Plain HTML | No standard components | High | Full toolbar + pagination rework | P3 |
| 8 | DMS Admin | Document Categories | `/admin/dms/categories` | `dms-categories-table.tsx` | DMS Custom | Missing filters | Medium | Add labeled filter for category type | P2 |
| 9 | DMS Admin | Document Types | `/admin/dms/document-types` | `dms-document-types-table.tsx` | DMS Custom | Select instead of ERPCombobox | Medium | Replace filter with ERPCombobox | P2 |
| 10 | DMS Admin | Metadata Definitions | `/admin/dms/metadata-definitions` | `dms-metadata-definitions-table.tsx` | ERPDataTable | No labeled filter panel | Low | Add toolbar slot with labeled filter | P2 |
| 11 | DMS Admin | DMS Tags | `/admin/dms/tags` | `dms-tags-table.tsx` | DMS Custom | Missing filters | Low | Minor polish | P3 |
| 12 | DMS Admin | Retention Policies | `/admin/dms/retention-policies` | `dms-retention-policies-table.tsx` | DMS Custom | Missing filters | Low | Minor polish | P3 |
| 13 | DMS Admin | AI Observability | `/admin/dms/ai-observability` | `ai-recent-usage-events-table.tsx` | Plain HTML | No standard | High | Rebuild with DMS Custom or ERPDataTable | P3 |

### HR Module

| # | Module | Screen | Route | Main Component | Table System | Current Status | UI.5 Gap | Recommended Action | Priority |
|---|--------|--------|-------|---------------|-------------|---------------|----------|-------------------|----------|
| 14 | HR | **Employees** ★ | `/admin/hr/employees` | `employees-table.tsx` | Employees Custom | **UI.5-COMPLIANT** | None | Maintain; use as non-DMS reference | — |
| 15 | HR | Daily Attendance | `/admin/hr/time/attendance` | `hr-attendance-page-client.tsx` | Card/list | Custom CSS grid | High | ERPDataTable or DMS Custom + ERPPageHeader | P2 |
| 16 | HR | Leave Requests | `/admin/hr/time/leave` | `hr-leave-page-client.tsx` | Card/list | Custom CSS grid | High | ERPDataTable + toolbar | P2 |
| 17 | HR | Shift Calendar | `/admin/hr/time/shifts` | `hr-shifts-page-client.tsx` | Card/list | Custom grid, no toolbar | High | Redesign with ERPDataTable | P3 |
| 18 | HR | PRO Processes | `/admin/hr/actions/pro` | `hr-pro-processes-page-client.tsx` | Plain HTML | Custom `<h1>` header | High | ERPPageHeader + ERPDataTable | P2 |
| 19 | HR | Disciplinary | `/admin/hr/actions/disciplinary` | `hr-disciplinary-page-client.tsx` | Plain HTML | No standard | High | ERPPageHeader + ERPDataTable | P2 |
| 20 | HR | Approval Requests | `/admin/hr/actions/approvals` | `hr-approvals-page-client.tsx` | Plain HTML | No standard | High | ERPPageHeader + ERPDataTable | P2 |
| 21 | HR | EOS & Clearance | `/admin/hr/actions/eos` | `hr-eos-page-client.tsx` | Plain HTML | No standard | High | ERPPageHeader + ERPDataTable | P2 |
| 22 | HR | Job Requisitions | `/admin/hr/recruitment/requisitions` | `requisitions-page-client.tsx` | Card/list | divide-y rows | High | ERPDataTable + two-row toolbar | P2 |
| 23 | HR | Candidates | `/admin/hr/recruitment/candidates` | `candidates-page-client.tsx` | Card/list | divide-y rows | High | ERPDataTable | P2 |
| 24 | HR | Interviews | `/admin/hr/recruitment/interviews` | `interviews-page-client.tsx` | Card/list | divide-y rows | High | ERPDataTable | P2 |
| 25 | HR | Offers | `/admin/hr/recruitment/offers` | `offers-page-client.tsx` | Card/list | divide-y rows | High | ERPDataTable | P2 |
| 26 | HR | Onboarding | `/admin/hr/recruitment/onboarding` | `global-onboarding-page-client.tsx` | Card/list | divide-y rows | High | ERPDataTable | P2 |
| 27 | HR | Salary Profiles | `/admin/hr/payroll/salaries` | `hr-salaries-page-client.tsx` | Plain HTML | No standard | High | ERPDataTable + ERPPageHeader | P2 |
| 28 | HR | WPS Readiness | `/admin/hr/payroll/wps` | `hr-wps-page-client.tsx` | Plain HTML | No standard | High | ERPDataTable | P2 |
| 29 | HR | Assignments | `/admin/hr/operations/assignments` | `hr-assignments-page-client.tsx` | Card/list | Status toggle rows | High | ERPDataTable | P2 |
| 30 | HR | Readiness Monitor | `/admin/hr/operations/readiness` | `hr-readiness-page-client.tsx` | Card/list | No standard | High | ERPDataTable | P3 |
| 31 | HR | Operational Blocks | `/admin/hr/operations/blocks` | `hr-blocks-page-client.tsx` | Card/list | No standard | High | ERPDataTable | P3 |
| 32 | HR Settings | Employment Types | `/admin/hr/settings/employment-types` | shared `hr-settings-lookup-page.tsx` | Card/list | Shared lookup page | Medium | Convert to ERPDataTable or DMS-custom | P3 |
| 33 | HR Settings | Employee Categories | `.../employee-categories` | shared | Card/list | Same | Medium | Same | P3 |
| 34 | HR Settings | Grades | `.../grades` | shared | Card/list | Same | Medium | Same | P3 |
| 35 | HR Settings | Leave Types | `.../leave-types` | `hr-leave-types-settings-page-client.tsx` | Card/list | Dedicated page | Medium | ERPDataTable | P3 |
| 36 | HR Settings | MOHRE Establishments | `.../mohre-establishments` | custom page | Card/list | Custom | Medium | ERPDataTable | P3 |
| 37 | HR Settings | Approval Workflows | `.../approval-workflows` | custom page | Card/list | Grouped rows | Medium | ERPDataTable | P3 |
| 38 | HR Settings | Readiness Rule Templates | `.../readiness-rule-templates` | custom page | Card/list | Custom | Medium | ERPDataTable | P3 |
| 39 | HR Settings | Role Requirement Matrix | `.../role-requirement-matrix` | custom page | Matrix layout | Matrix — special | High | Keep matrix but add ERPPageHeader | P3 |
| 40 | HR Settings | Site Requirement Matrix | `.../site-requirement-matrix` | custom page | Matrix layout | Matrix — special | High | Keep matrix but add ERPPageHeader | P3 |
| 41–45 | HR Settings | (Other lookup screens) | various | shared | Card/list | Shared | Medium | ERPDataTable per screen | P3 |

### Master Data — Parties

| # | Module | Screen | Route | Main Component | Table System | Current Status | UI.5 Gap | Recommended Action | Priority |
|---|--------|--------|-------|---------------|-------------|---------------|----------|-------------------|----------|
| 46 | Parties | All Parties | `/admin/master-data/parties` | `parties-table.tsx` | ERPDataTable | Missing ERPPageHeader | **Medium** | Add ERPPageHeader + labeled filter toolbar slot | **P1** |
| 47 | Parties | Customers | `.../parties/customers` | same | ERPDataTable | Missing ERPPageHeader | Medium | Same | P1 |
| 48 | Parties | Vendors | `.../parties/vendors` | same | ERPDataTable | Missing ERPPageHeader | Medium | Same | P1 |
| 49 | Parties | Subcontractors | `.../parties/subcontractors` | same | ERPDataTable | Missing ERPPageHeader | Medium | Same | P1 |
| 50 | Parties | Consultants | `.../parties/consultants` | same | ERPDataTable | Missing ERPPageHeader | Medium | Same | P1 |
| 51 | Parties | Recruitment Agencies | `.../parties/recruitment-agencies` | same | ERPDataTable | Missing ERPPageHeader | Medium | Same | P1 |
| 52 | Parties | Government Authorities | `.../parties/government-authorities` | same | ERPDataTable | Missing ERPPageHeader | Medium | Same | P1 |
| 53 | Parties | Insurance Companies | `.../parties/insurance-companies` | same | ERPDataTable | Missing ERPPageHeader | Medium | Same | P1 |
| 54 | Parties | License Issuers | `.../parties/license-issuers` | same | ERPDataTable | Missing ERPPageHeader | Medium | Same | P1 |
| 55 | Parties | Party Types | `.../parties/types` | `party-types-admin-table.tsx` | Plain HTML | No standard | High | ERPDataTable | P2 |
| 56 | Parties | Service Categories | `.../parties/service-categories` | `service-categories-admin-table.tsx` | Plain HTML | No standard | High | ERPDataTable | P2 |
| 57 | Parties | Relationship Types | `.../parties/relationship-types` | `relationship-types-admin-table.tsx` | Plain HTML | No standard | High | ERPDataTable | P2 |

### Master Data — Geography, Finance Basics, UOM

| # | Module | Screen | Route | Main Component | Table System | Current Status | UI.5 Gap | Recommended Action | Priority |
|---|--------|--------|-------|---------------|-------------|---------------|----------|-------------------|----------|
| 58 | Geography | Countries | `.../geography/countries` | `countries-table.tsx` | ERPDataTable | No labeled filter panel | Low | Add toolbar filter slot | P1 |
| 59 | Geography | Emirates | `.../emirates` | `emirates-table.tsx` | ERPDataTable | Same | Low | Same | P1 |
| 60 | Geography | Cities | `.../cities` | `cities-table.tsx` | ERPDataTable | Same | Low | Same | P1 |
| 61 | Geography | Areas | `.../areas` | `areas-table.tsx` | ERPDataTable | Same | Low | Same | P1 |
| 62 | Geography | Ports | `.../ports` | `ports-table.tsx` | ERPDataTable | Same | Low | Same | P1 |
| 63 | Finance Basics | Currencies | `.../finance-basics/currencies` | `currencies-table.tsx` | ERPDataTable | No filter panel | Low | Add toolbar filter slot | P1 |
| 64 | Finance Basics | Payment Terms | `.../payment-terms` | `payment-terms-table.tsx` | ERPDataTable | Same | Low | Same | P1 |
| 65 | Finance Basics | Tax Types | `.../tax-types` | `tax-types-table.tsx` | ERPDataTable | Same | Low | Same | P1 |
| 66 | Finance Basics | Banks | `.../banks` | `banks-table.tsx` | ERPDataTable | Same | Low | Same | P1 |
| 67 | Finance Basics | Cost Centers | `.../cost-centers` | `cost-centers-table.tsx` | ERPDataTable | Same | Low | Same | P1 |
| 68 | Finance Basics | Profit Centers | `.../profit-centers` | `profit-centers-table.tsx` | ERPDataTable | Same | Low | Same | P1 |
| 69 | UOM | UOM Categories | `.../uom/categories` | `uom-categories-table.tsx` | ERPDataTable | No filter panel | Low | Add toolbar filter slot | P1 |
| 70 | UOM | Units of Measure | `.../uom/units` | `units-table.tsx` | ERPDataTable | Same | Low | Same | P1 |
| 71 | UOM | UOM Conversions | `.../uom/conversions` | `conversions-table.tsx` | ERPDataTable | Same | Low | Same | P1 |

### Master Data — Lookups & Common Master Data

| # | Module | Screen | Route | Table System | UI.5 Gap | Priority |
|---|--------|--------|-------|-------------|----------|----------|
| 72 | Lookups | Lookup Categories | `.../lookups/categories` | ERPDataTable | Low | P1 |
| 73 | Lookups | Lookup Values | `.../lookups/values` | ERPDataTable | Low | P1 |
| 74 | Lookups | Locked System Values | `.../lookups/system` | Card/list | Medium | P2 |
| 75 | Common MD | Departments | `/admin/common-master-data/departments` | Card/list (divide-y) | High | P2 |
| 76 | Common MD | Designations | `.../designations` | Card/list (divide-y) | High | P2 |
| 77 | Common MD | Work Sites | `.../work-sites` | Card/list | High | P2 |
| 78 | Common MD | Work Calendars | `.../work-calendars` | Card/list | High | P2 |
| 79 | Common MD | Approval Roles | `.../approval-roles` | Card/list | High | P2 |
| 80 | Common MD | DMS Required Document Rules | `.../dms-required-documents` | Card/list | High | P2 |

### Admin Module

| # | Module | Screen | Route | Main Component | Table System | Current Status | UI.5 Gap | Recommended Action | Priority |
|---|--------|--------|-------|---------------|-------------|---------------|----------|-------------------|----------|
| 81 | Admin | Users | `/admin/users` | `users-table.tsx` | ERPDataTable + toolbar | Closest to UI.5 in admin | **Low** | Align toolbar to UI.5 labeled filter style | **P1** |
| 82 | Admin | Organizations | `/admin/organizations` | `organizations-table.tsx` | ERPDataTable | Stat cards above table | Low | Add labeled filter slot | P1 |
| 83 | Admin | Branches | `/admin/branches` | `branches-table.tsx` | ERPDataTable | No filter panel | Low | Add labeled filter slot | P1 |
| 84 | Admin | Roles | `/admin/roles` | `roles-table.tsx` | Plain HTML | shadcn Table | High | Port to ERPDataTable | P1 |
| 85 | Admin | Permissions | `/admin/permissions` | `permissions-table.tsx` | Unknown (legacy) | Legacy `data-table` component | **Critical** | Audit + migrate to ERPDataTable | **P0** |
| 86 | Admin | Audit Logs | `/admin/audit` | `audit-logs-table.tsx` | ERPDataTable | No labeled filter panel | Low | Add toolbar filter slot | P1 |
| 87 | Admin | Numbering Rules | `/admin/settings/numbering` | `numbering-rules-table.tsx` | ERPDataTable | Partial ERPPageHeader | Low | Complete ERPPageHeader + filter slot | P1 |

### Notifications, Reports, Settings, AI

| # | Module | Screen | Route | Table System | UI.5 Gap | Priority |
|---|--------|--------|-------|-------------|----------|----------|
| 88 | Notifications | My Notifications | `/notifications` | Card/list | High | P2 |
| 89 | Notifications | Email Queue | `/admin/notifications/email-queue` | Plain HTML | High | P2 |
| 90 | Notifications | Notification Templates | `/admin/notifications/templates` | Plain HTML | High | P2 |
| 91 | Notifications | Delivery Logs | `/admin/notifications/logs` | Plain HTML | High | P2 |
| 92 | Reports | Report Center (Registry) | `/admin/reports` | Plain HTML | High | P2 |
| 93 | Reports | Report Results | `/admin/reports/run/[code]` | Plain HTML | Medium | P3 |
| 94 | Reports | Report History | `/admin/reports/history` | Card/list | High | P3 |
| 95 | Reports | Report Schedules | `/admin/reports/schedules` | Plain HTML | High | P3 |
| 96 | Settings | AI Provider Configs | `/admin/settings/ai` | Card/list | Medium | P3 |
| 97 | Settings | AI Usage Log | (tab) | Plain HTML | High | P3 |
| 98 | Settings | Email Provider Configs | `/admin/settings/email` | Card/list | Medium | P3 |
| 99 | AI Center | AI Data Quality | `/admin/ai/data-quality` | Plain HTML | High | P3 |
| 100 | AI Center | AI Duplicates | `/admin/ai/duplicates` | Card/list | High | P3 |

---

## 3. Module-by-Module Notes

### DMS

**Current list style:** The All Documents screen (`dms-documents-table.tsx`) is the reference. It uses a fully custom DMS Custom stack: `SortColHeader` + `TablePagination` + `useResizableColumns` + `useSortPaginate` + two-row labeled filter toolbar + active filter chips. The remaining DMS screens (Inbox, Batch Intake, Review Queue, Renewals, Expiry) use the same stack but are **partially implemented** — they are missing labeled filter panels, filter chips, and/or `ERPPageHeader`.

**Problems vs UI.5:** The DMS screens inside `/dms/` diverge slightly from each other (inconsistent toolbar presence, missing pagination on Review Queue). The DMS Admin screens (categories/types/tags/retention) have no filter panel — they rely only on the built-in search of `TablePagination`.

**Recommended table system:** Keep DMS Custom stack for all `/dms/` list screens. DMS Admin screens that are simple lookup tables may migrate to ERPDataTable if adding full toolbar would be overkill.

**Special risks:** The AI/semantic search mode in All Documents is a unique DMS feature. Other DMS list screens should NOT inherit the AI search mode — they use standard two-row toolbar only.

---

### HR — Employees

**Current list style:** Employees (`employees-table.tsx`) is the most complete non-DMS list. It uses the same DMS Custom stack pattern plus `useWorkspaceTableState` for tab-state persistence, server-side pagination (API-driven), and two-row labeled filter toolbar with active filter chips.

**Problems vs UI.5:** None — fully compliant as of UI.5A pilot.

**Special note:** `useWorkspaceTableState` is currently only used here. For future server-side paginated lists with workspace tab state (HR lists, large party lists), this hook should be used.

---

### HR — Other Lists (time, actions, recruitment, payroll, operations)

**Current list style:** A mix of plain HTML tables and card/list layouts using `divide-y` CSS rows. No consistent use of `ERPPageHeader`, no two-row toolbar, no `ERPCombobox` filters, no pagination component, no column resize.

**Problems vs UI.5:** Major layout and component mismatch across 18+ screens. Most have custom `<h1>` or Card headers instead of `ERPPageHeader`. Filters are ad-hoc or missing.

**Recommended table system:** ERPDataTable for all HR action/recruitment/payroll/operations lists (they are medium-complexity tables with 5–10 columns). ERPDataTable provides sort, resize, visibility, and pagination built-in — only a labeled filter `toolbarSlot` needs to be added.

**Special risks:** These screens are action-heavy (approve, reject, archive, reassign). Permission-aware action visibility must be preserved exactly. Do not rewrite any business logic.

---

### HR Settings Lookup Screens

**Current list style:** A shared `hr-settings-lookup-page.tsx` component that renders a card/list with inline CRUD via `ERPChildDialogForm`. The pattern is functional but visually inconsistent with UI.5.

**Recommended approach:** Convert to a shared `ERPDataTable`-based HR settings lookup pattern. Create one shared component that takes the lookup data, column definitions, and CRUD callbacks — replaces the current card layout while keeping the `ERPChildDialogForm` CRUD unchanged.

---

### Master Data — Parties

**Current list style:** `parties-table.tsx` uses `ERPDataTable` correctly but is wrapped in a plain `Card` with a manual breadcrumb/header instead of `ERPPageHeader`. The ERPDataTable itself provides sort/resize/visibility/pagination.

**Problems vs UI.5:** Missing `ERPPageHeader`. The page shell uses a `Card` wrapper and custom breadcrumb. There is no labeled filter panel — the ERPDataTable's `toolbarSlot` is either empty or uses a simpler search-only approach.

**Recommended action:** Replace `Card` + manual header with `ERPPageHeader`, add a labeled filter `toolbarSlot` (owner company, party type, status), and align spacing to `p-6 space-y-4`. All 9 party-type filtered views share the same component so this is a single migration.

---

### Master Data — Geography, Finance Basics, UOM, Lookups

**Current list style:** All use `ERPDataTable`. They have `ERPPageHeader` on the page.tsx (mostly), built-in sort/resize/pagination from ERPDataTable. Most lack a filter panel `toolbarSlot`.

**Problems vs UI.5:** Mostly Low gap. The only missing elements are the labeled filter panel and filter chips (accessible via ERPDataTable's `toolbarSlot`). For small lookup lists (currencies, UOM), a filter panel may not be needed — these screens can be Low-priority polish.

**Recommended action:** Add `toolbarSlot` with labeled ERPCombobox filters where relevant filters exist (e.g., country filter for Cities, UOM category filter for Units). Skip for screens where the only data fits on one page with no useful filters.

---

### Admin

**Current list style:** Mixed. Users has the closest admin screen to UI.5 (ERPDataTable + `UsersListToolbar` with URL-driven filters). Organizations, Branches, Audit Logs, and Numbering use ERPDataTable with no labeled filter panel. Roles uses shadcn Table. Permissions uses an unknown legacy component.

**Problems vs UI.5:** 
- Users: has toolbar but it uses URL-driven `UsersListToolbar` instead of the UI.5 labeled filter panel pattern — alignment needed
- Roles: shadcn Table — needs ERPDataTable migration + ERPPageHeader
- Permissions: legacy `@/components/tables/data-table` — must audit before any other work (P0)
- Audit Logs: no filter panel — should add date-range, user, module, action filters

**Special risk for Permissions:** The legacy `data-table` import from `@/components/tables/data-table` may be a stale/abandoned component. This needs investigation before the UI.5C admin rollout. Do not migrate Permissions until the legacy component is identified and removed safely.

---

### Notifications

**Current list style:** All notification screens use plain HTML tables or card/list layouts with no shared ERP components. No `ERPPageHeader`, no `TablePagination`, no labeled filters.

**Recommended approach:** My Notifications and Notification Center are card-style notification lists — they may legitimately remain card-layout (not every list requires a tabular `<table>`). Email Queue, Notification Templates, and Delivery Logs should use ERPDataTable.

---

### Reports

**Current list style:** The Report Center Registry uses a plain shadcn `Table`. Report results use a custom plain-HTML dynamic results table. The Report History and Schedules screens use card/list layouts.

**Special note:** The Report Results table (`report-results-table.tsx`) is intentionally dynamic — columns vary per report. This is a documented exception to the fixed-column ERPDataTable pattern. It should keep its plain-HTML dynamic approach but adopt `ERPPageHeader`, row tokens, and empty/loading states from UI.5.

---

## 4. Recommended Rollout Plan

### UI.5A — Pilot: Employees List (COMPLETED 2026-07-02)

**Status:** ✅ DONE  
**Scope:** Employees list screen (`/admin/hr/employees`)  
**Outcome:** `employees-table.tsx` is fully UI.5 compliant. Serves as the non-DMS reference implementation.

---

### UI.5B — ERPDataTable Toolbar Alignment (Admin, Geography, Finance Basics, UOM, Lookups, Audit)

**Phase goal:** Align all ERPDataTable screens to have a consistent UI.5 `p-6 space-y-4` shell, `ERPPageHeader`, and labeled filter `toolbarSlot` where filters are appropriate.

**Scope:** ~20 screens  
**Screens:** Users, Organizations, Branches, Audit Logs, Numbering Rules, Countries, Emirates, Cities, Areas, Ports, Currencies, Payment Terms, Tax Types, Banks, Cost Centers, Profit Centers, UOM Categories, Units, UOM Conversions, Lookup Categories, Lookup Values

**Work per screen:**
- Ensure page.tsx uses `p-6 space-y-4` shell + `ERPPageHeader`
- Add `toolbarSlot` to ERPDataTable with labeled `ERPCombobox` filters where applicable
- Verify column visibility `ERPColumnMenu` is enabled

**Pre-work:** Fix `Permissions` (P0) before this phase starts — identify and remove/replace the legacy `data-table` component.

**Estimated complexity:** Low–Medium per screen; high batching opportunity since they all use ERPDataTable

---

### UI.5C — Parties Table Alignment

**Phase goal:** Align the Parties table family (9 screens using one shared component) to UI.5.

**Scope:** `parties-table.tsx` + 9 page.tsx files  
**Work:**
- Replace `Card` wrapper + manual header with `ERPPageHeader` in all page shells
- Add labeled filter panel (owner company, party type, status) to ERPDataTable's `toolbarSlot`
- Align to `p-6 space-y-4` shell

**Benefit:** One component change fixes 9 routes simultaneously.

---

### UI.5D — DMS Screen Polishing

**Phase goal:** Bring remaining DMS list screens (Inbox, Review Queue, Renewals, Expiry Dashboard, DMS Admin tables) to full UI.5 alignment.

**Scope:** ~12 DMS screens  
**Work:**
- Add `ERPPageHeader` where missing
- Add two-row labeled filter toolbar where missing
- Add `TablePagination` to Review Queue
- Add active filter chips to Batch Intake, Renewals, Expiry Dashboard

---

### UI.5E — Parties Admin Tables + Common Master Data

**Phase goal:** Migrate Party Types, Service Categories, Relationship Types, and Common Master Data screens (Departments, Designations, Work Sites, etc.) from plain HTML / card layouts to ERPDataTable.

**Scope:** ~15 screens  
**Work:**
- Replace plain HTML tables with ERPDataTable
- Add `ERPPageHeader`
- Keep inline CRUD via `ERPChildDialogForm` unchanged

---

### UI.5F — HR Module Rollout (actions, recruitment, payroll, operations, settings)

**Phase goal:** Migrate all remaining HR list screens to ERPDataTable with UI.5 shell.

**Scope:** ~20 screens  
**Work:**
- Add `ERPPageHeader` to all HR pages (replace custom `<h1>` headers)
- Migrate plain HTML tables and card/list layouts to ERPDataTable
- Add labeled filter panels (`toolbarSlot`) with ERPCombobox
- Preserve all business logic, permissions, and server actions exactly
- Convert HR Settings lookup pages from `hr-settings-lookup-page.tsx` card pattern to a shared ERPDataTable lookup pattern

**Special risk:** HR screens are action-heavy. Permission-aware action visibility must be fully preserved.

---

### UI.5G — Admin/Notifications/Reports/AI Polish

**Phase goal:** Final polish pass on Admin, Notifications, Reports, and AI center screens.

**Scope:** ~15 screens  
**Work:**
- Roles: migrate from shadcn Table to ERPDataTable
- Email Queue, Templates, Delivery Logs: ERPDataTable
- Report Center Registry: ERPDataTable
- Report Results table: add UI.5 page shell + loading/empty states (keep dynamic column rendering)
- AI center screens: ERPDataTable or polish existing card layout
- Notifications: confirm card-layout is acceptable exception for My Notifications

---

## 5. Shared Component Recommendations

### Extract from All Documents / Employees — DO

| Component | Recommendation | Basis |
|-----------|---------------|-------|
| `ERPPageHeader` | Already exists — use consistently everywhere | `src/components/erp/page-header.tsx` |
| `ERPCombobox` | Already exists — use in all filter panels | `src/components/erp/combobox.tsx` |
| `SortColHeader` | Already exists — use in custom tables | `src/components/erp/table/sort-col-header.tsx` |
| `TablePagination` | Already exists — use in custom tables | `src/components/erp/table/table-pagination.tsx` |
| `useResizableColumns` | Already exists — use in custom tables | `src/components/erp/table/use-resizable-columns.ts` |
| `useWorkspaceTableState` | Already exists — use for all server-side paginated lists | `src/hooks/use-workspace-table-state.ts` |
| `ERPDataTable` | Already exists — primary table for medium-complexity lists | `src/components/erp/table/erp-data-table.tsx` |

### Consider Creating — NEW COMPONENTS

| Component | Need | Where used |
|-----------|------|-----------|
| `ERPListFilterPanel` | Reusable labeled filter row (`bg-muted/10` bordered panel + `ERPCombobox` + chips) | Could replace repeated inline filter panel code across Employees, DMS, and future ERPDataTable toolbar slots |
| `ERPListFilterChips` | Reusable active filter chip row | Shared between all screens that have filters |
| `ERPStatusBadge` | Generic semantic-color badge lookup by status string + module | Currently each module implements its own (DmsDocumentStatusBadge, EmployeeStatusBadge) — a shared registry-style component would unify the color map |
| **`ERPDataTable` filter-slot standard** | Document the standard way to pass a labeled filter panel as `toolbarSlot` | Not a new component — just a documented convention + example |

### Do NOT create — module-specific list renderers remain module-specific

- AI search panel (DMS-only feature)
- Letter preview dialog (HR-only)
- Compliance matrix panels (HR Settings-only)
- Embedded child sub-lists (inside record forms)

### Stay module-specific

- `dms-document-status-badge.tsx` — DMS-specific statuses (draft, inbox, active, expired, renewed…)
- `employee-status-badge.tsx` — HR-specific statuses (active, probation, on_leave, suspended…)
- Other module badges that have distinct status vocabularies

However, **the color hue families must match** the semantic color map in `erp-global-list-ui-standard.mdc`. If DMS and HR both have an "Active" status, both must use `bg-blue-100 text-blue-700`.

---

## 6. Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|-----------|
| R1 | Breaking table behavior during migration (sort, filter, actions stop working) | Medium | High | Migrate UI-only; keep all server actions, hooks, and business logic unchanged. Test each screen after migration. |
| R2 | `@/components/tables/data-table` (legacy Permissions) is tightly coupled | High | Medium | Audit the legacy component before starting UI.5B–C. Do not migrate Permissions until risk is understood. |
| R3 | localStorage preference conflicts if two list screens share the same ERPDataTable `tableId` | Medium | Low | Always use unique, stable `tableId` values per route (e.g. `"parties-all"`, `"parties-customers"`). |
| R4 | `useWorkspaceTableState` conflicts with ERPDataTable's own preferences persistence | Low | Medium | Use `useWorkspaceTableState` only for server-side paginated custom tables. ERPDataTable manages its own prefs. |
| R5 | Parties filtered views (Customers, Vendors…) sharing one component — one change breaks all | Medium | High | Test all 9 party view routes after any change to `parties-table.tsx`. |
| R6 | HR action screens have complex business workflows (approve, reject, EOS) — UI rewrite risks regression | High | High | Preserve server actions and permission checks exactly. Only change page shell + table component. Full QA for each screen. |
| R7 | DMS AI/semantic search modes are DMS-specific — risk of accidentally applying to non-DMS screens | Low | Medium | Do not copy the AI search mode row to non-DMS screens. |
| R8 | HR Settings matrix layouts (Role Requirement Matrix, Site Requirement Matrix) cannot use ERPDataTable | Low | Low | Add `ERPPageHeader` only; keep matrix layout. Document as approved exception. |
| R9 | Column resize `localStorage` keys colliding between sessions after route changes | Low | Low | Always prefix `localStorage` key with a stable route segment or unique `storageKey` prop. |
| R10 | Report Results table has dynamic columns (varies per report) — cannot use ERPDataTable | Low | Low | Documented exception. Keep dynamic plain-HTML approach; add UI.5 shell tokens only. |
| R11 | Server-side paged lists (Employees, future HR lists) lose pagination state on tab switch | Medium | Medium | Use `useWorkspaceTableState` for all server-paged lists to persist page + filter state per workspace tab. |
| R12 | Large HR tables (Attendance, Assignments) loaded client-side without pagination — performance risk | High | Medium | Add server-side pagination in UI.5F before migrating UI; do not add a table without pagination on large datasets. |

---

## 7. Implementation Guardrails

These rules apply to every UI.5 phase prompt and must be explicitly stated:

1. **Do not change business logic.** Only the page shell, table component, toolbar, filter panel, and status badge styling are in scope.
2. **Do not change database schema.** No table changes, no column additions, no FK modifications.
3. **Do not change RLS policies.** Row-level security is unchanged by UI work.
4. **Do not change permissions.** `hasPermission` checks, RBAC codes, and permission guards must remain exactly as they are.
5. **Do not change workflows.** Approval, archive, EOS, disciplinary, and other stateful workflows are not touched.
6. **Do not rewrite all tables at once.** Phase-by-phase only. One batch per prompt.
7. **Do not replace ERPDataTable globally without separate approval.** ERPDataTable is the standard for medium-complexity lists. The DMS Custom stack is only for DMS and Employees (where custom behavior justifies it).
8. **Do not invent a new design.** Cursor must match All Documents as the visual reference. No new filter layouts, no new icon styles, no custom color schemes.
9. **Do not add AI/semantic search modes to non-DMS lists.** That is a DMS-specific feature.
10. **Do not remove filter chips or column resize from screens that already have them** (All Documents, Employees).
11. **Server actions must remain the same function signatures.** Only the calling component may change (UI layer only).
12. **Workspace route registry entries must not be removed** during UI migration.

---

## 8. Recommended Next Prompts

### Next: UI.5B — ERPDataTable Toolbar Alignment (Admin + Master Data)

**Title:** `ERP GLOBAL UI.5B — ERPDataTable Toolbar Alignment`

**Scope:**
1. Fix the legacy Permissions table (P0 — identify and replace `@/components/tables/data-table`)
2. Align the following ERPDataTable screens to `p-6 space-y-4` + `ERPPageHeader` + labeled filter toolbarSlot:
   - Users (`/admin/users`) — align `UsersListToolbar` to UI.5 labeled filter pattern
   - Organizations, Branches, Audit Logs, Numbering Rules
   - All Geography screens (Countries, Emirates, Cities, Areas, Ports)
   - All Finance Basics screens (Currencies, Payment Terms, Tax Types, Banks, Cost Centers, Profit Centers)
   - All UOM screens (UOM Categories, Units, Conversions)
   - Lookup Categories + Lookup Values

**Why this batch first:**
- These are all simple ERPDataTable screens with low migration risk
- They share the same pattern: just add ERPPageHeader + toolbarSlot
- No business logic risk — UI-only changes
- Highest coverage-per-effort ratio (21 screens, one pattern)

---

### Then: UI.5C — Parties Table

**Title:** `ERP GLOBAL UI.5C — Parties Table UI Alignment`

**Scope:** `parties-table.tsx` + all 9 page shells under `/admin/master-data/parties/`

---

### Then: UI.5D — DMS Polish

**Title:** `ERP GLOBAL UI.5D — DMS List Screens Polish`

**Scope:** Inbox, Batch Intake, Review Queue, Renewals, Expiry Dashboard, DMS Admin tables

---

### Then: UI.5E through UI.5G as described in Section 4.

---

*Report generated: 2026-07-02*  
*Based on codebase audit of `c:\dev\agt-erp`*  
*Next implementation phase: UI.5B*
