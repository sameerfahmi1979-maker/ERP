# 07 — UI/UX, Accessibility and Mockup Audit

Audit date: 2026-08-05 · Basis: source-level review (runtime screenshots not safely obtainable — doc 09 §4) + mandatory standards in `docs/standards/`.

## 1. Information architecture (Confirmed)

- Sidebar: 8 top sections, ~95 destinations, permission-filtered, collapsible with icon badges — good enterprise IA. Disabled future modules visible only to global admins (honest roadmap signalling).
- **Strengths:** consistent `record/[id]` + `record/new` pattern across ~15 masters; workspace tab system with unsaved-draft protection standards; global numbering; breadcrumb component (`page-breadcrumb.tsx`); command menu (`cmdk`).
- **Defects:**
  - Duplicate concept routes: `/admin/master-data/customers` **and** `/admin/master-data/parties/[typeSlug]` (customers) → user confusion about where customers live. UI-001 (Medium).
  - Retired Template Studio route still in build (`/admin/reports/template-studio`) behind flag — verify flag-off in prod. UI-002 (Low).
  - `/dms/renewals` vs `/dms/expiring` both in sidebar ("Expiry & Renewals" links expiring; "Renewals" separate) — overlapping destinations, Needs verification at runtime. UI-003 (Low).
  - Registry/sidebar drift (7 sidebar routes absent from registry) — doc 03 §B. RBAC-005 (Low).
  - Mojibake `???` comment separators in sidebar and siblings (encoding) — cosmetic but unprofessional in RTL-adjacent code. UI-004 (Low).

## 2. Standards conformance (Confirmed)

Two mandatory standards docs exist (dev guide + form/table/drawer guide) with concrete rules (combobox everywhere, red-asterisk required markers, 720px child modals, no horizontal scroll, save/save&close/cancel). Spot-checked screens (shifts, employees) follow the Card + page-client pattern. **Conformance testing is manual** — no automated a11y or visual-regression tests exist (doc 09 §3). UI-005 (Medium — standards unenforced by tooling).

## 3. Accessibility & responsiveness (source-level)

- Radix/Base UI primitives used (dialog, popover, tooltip) → focus management/keyboard largely inherited ✅.
- `sonner` toasts, loading/empty states via shared components; print styles under `styles/print`.
- No `axe`/a11y test, no `aria-*` audit tooling in repo; responsive behavior unverifiable without runtime (Needs verification). RTL: `@fontsource/noto-sans-arabic` + `bidi-shaper` + Arabic-aware PDF stack present — **Arabic PDF support engineered** ✅; full Arabic UI locale not found (no i18n framework in package.json) → English-only UI today. UI-006 (Informational).

## 4. Sensitive-data UX (Confirmed)

Permission-separated medical/payroll scopes exist at DB/RPC level; `/api/dms/file` separates preview vs download permission; masking in reports via `redaction-engine.ts` with `sensitive_profile` on registry entries ✅ — strong design. Runtime presentation of masked fields Needs verification.

## 5. Missing-screen mockups (delivered in `mockups/`)

| Mockup | Covers gaps |
|---|---|
| `01_payroll_period_console.md` | payroll run engine, freeze/approve/complete/rollback, variance review, WPS SIF output |
| `02_biometric_and_attendance_exceptions.md` | device fleet health, sync lag, exception queue with auto-suggestions |
| `03_roster_and_leave_ledger.md` | month-grid roster planner with auto-fill + violations; append-only leave ledger with monthly snapshots/reconciliation (also fixes HR-002 pattern) |
| `04_payslip_and_loans.md` | employee payslip (verified PDF), loans/advances with EMI schedule + EOS settlement link |

Each mockup includes users/permissions, states, validation, data sources, audit/notifications, mobile notes, acceptance criteria (per master prompt §11.3). Additional recommended mockups (not built): employee/manager self-service inbox, resignation/EOS timeline, employee audit timeline — captured in roadmap (doc 13).

## 6. Runtime screenshot status
Not obtained (no safe session against live tenant). Sanitized screenshot capture is scheduled as pre-release activity in the acceptance plan (doc 14).
