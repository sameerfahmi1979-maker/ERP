# 03 — Route / Menu / Screen / Component Matrix

Audit date: 2026-08-05 · Machine-readable matrix: [`registers/route_screen_matrix.csv`](./registers/route_screen_matrix.csv) (227 rows).

## Method (Confirmed)
Scripted cross-reference of three sources:
1. **Page tree** — 213 `page.tsx` files under `src/app`.
2. **Route Access Registry** — 101 entries in `src/lib/rbac/route-access-registry.ts`.
3. **Sidebar menu** — ~95 items parsed from `src/components/layout/app-sidebar.tsx`.

Runtime execution status per screen is recorded in Phase 5 (runtime) and the per-module audits (Phases 8-9); this document is the structural matrix.

## Headline counts

| Metric | Count |
|---|---|
| Unique route paths (union) | 227 |
| Routes with a page | 213 |
| Registry/sidebar routes with **no page** | 14 |
| Pages **not** in registry | 116 (mostly `record/[id]` detail pages — registry only covers list routes; documented fallback = allow + server guard) |
| Top-level pages **not** in sidebar | 49 (section index pages, auth pages, print/verify, dev pages, HR settings sub-screens reached via tabs) |

## A. Registry/sidebar destinations with NO page

| Route | Source | Classification |
|---|---|---|
| `/modules/fleet`, `/modules/workshop`, `/modules/hse` | sidebar (disabled) | placeholder — future module, `disabled: true`, global-admin-only |
| `/modules/finance`, `/modules/inventory`, `/modules/procurement` | sidebar (disabled) | placeholder — future module |
| `/admin/master-data/parties/{customers,vendors,subcontractors,consultants,recruitment-agencies,government-authorities,insurance-companies,license-issuers}` | registry + sidebar | **covered by dynamic page** `/admin/master-data/parties/[typeSlug]` — OK by design |

## B. Sidebar items missing from the registry (fallback = visible to all active users in *registry-based* features)

Sidebar still filters these by its own per-item perms, so UX filtering works; but any feature relying on `canAccessRoute()` (e.g. first-route redirect) treats them as open:
`/admin/hr/document-browser`, `/admin/dms/browser`, `/admin/dms/approval-workflows`, `/admin/dms/notification-settings`, `/dms/approvals`, `/dms/archive`, `/dms/renewals` → finding **RBAC-00x** (registry/sidebar drift).

## C. Pages with no sidebar entry and no registry entry — review list

- **Dev surfaces**: `/dev/auth-debug`, `/dev/performance-qa` — must be unavailable in production or admin-gated. Under `(protected)` and `/dev` is not in middleware's protected list; guarded only if the page checks. → verify Phase 7, finding **SEC-00x** candidate.
- **Public/utility**: `/`, `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/change-password-required`, `/account-disabled`, `/access-denied`, `/no-access`, `/start`, `/verify/[token]`, `/print/*` — expected by design.
- **HR settings sub-screens (19)**: reachable only via the HR Settings screen (tab navigation) — verify each enforces `hr.settings.*` server-side in Phase 9.
- **Section index pages**: `/admin/hr`, `/admin/hr/actions`, `/admin/hr/time`, `/admin/hr/payroll`, `/admin/hr/recruitment`, `/admin/hr/operations` — landing/redirect pages.
- `/admin/master-data/customers` vs parties/[typeSlug] `customers` — **possible duplicate implementation** (two routes for the same concept). Verify in Phase 8, finding **UI-00x** candidate.
- `/admin/reports/template-studio` — retired per OFFICIAL DOCS.1 comment; route still exists → check flag gating (Phase 8).

## D. Menu structure summary (from sidebar, Confirmed)

| Section | Items | Status |
|---|---|---|
| Overview | Dashboard, Notifications | live |
| Human Resource | HR (4), HR Actions (4), Attendance & Leave (3), Recruitment (5), Payroll & WPS (2), HR Operations (3), HR Admin (1) | live — deepest module |
| Documents (DMS) | 10 user + 9 admin | live |
| Operations | Fleet, Workshop, HSE | **all disabled placeholders** |
| Finance & Supply | Finance, Inventory, Procurement | **all disabled placeholders** |
| Reports | 6 | live (Template Studio retired) |
| Master Data | Common MD (7), Geography (5), Party Master (12), Finance Basics (6), UOM (3) | live |
| Administration | Security (4) + 13 + AI (8) | live |

**ERP-scope consequence (Confirmed):** AGT today is HR + DMS + Master Data + Reports + Admin. Sales, purchasing, inventory, finance/accounting, fleet exist **only as disabled menu stubs**. The live DB (Phase 6) will confirm whether any backend for them exists.

## E. Guard-pattern sample (Confirmed)
`src/app/(protected)/admin/hr/time/shifts/page.tsx:12-19` — server page → `getAuthContext()` → `hasPermission('hr.attendance.view')` or system_admin → `redirect('/admin/hr/time')`. Same pattern expected across protected pages; Phase 5/8 sample-checks breadth (search for pages missing guards).

*Per-screen columns (components, actions, DB objects, states) are filled per module in `04_MODULE_BY_MODULE_FUNCTIONAL_AUDIT.md`; this matrix anchors the route universe.*
