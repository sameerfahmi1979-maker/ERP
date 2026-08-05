# 02 — Architecture and Data Flow Audit (AGT ERP)

Audit date: 2026-08-05 · HEAD `262a9dcd` · Evidence-based; confidence labels per item.

## 1. High-level architecture (Confirmed)

**Stack:** Next.js 16.2.6 (App Router) + React 19.2.4 + TypeScript, Supabase (Postgres + Auth + Storage + Realtime + 1 Edge Function), Tailwind v4 + shadcn/Radix + Base UI, Vitest + Playwright.

**Layering (Confirmed from `src/` layout):**

```
Browser
  └─ src/middleware.ts  → lib/supabase/middleware.updateSession (session refresh + minimal route gate)
  └─ src/app/(auth)/*           login/signup/reset/change-password
  └─ src/app/(protected)/*      200+ pages — each calls getAuthContext()/hasPermission() and redirects
  └─ src/app/api/*              9 route handlers (3 internal worker endpoints, DMS file/poll/intake, branding public, notifications bell, admin audit)
  └─ src/app/verify/[token]     public official-document verification
  └─ src/app/print/*            token-gated print surface
        │
        ▼
src/server/actions/*  (server actions; guard via requirePermission/requireActiveAuthContext)
src/server/queries/*
src/lib/*             (30 domain libs: supabase, rbac, audit, dms, ai, pdf, official-documents,
                       email, numbering, report-center/designer, branding, workspace, …)
        │
        ▼
Supabase  ── anon key (RLS enforced) via lib/supabase/server.ts (cookie session)
          ── service role (RLS bypassed) via lib/supabase/admin.ts — server-only
Edge Function: supabase/functions/dms-expiry-scheduler → calls /api/internal/* with INTERNAL_API_SECRET
External: OpenAI (AI), Azure Document Intelligence (OCR), Gotenberg (PDF), Microsoft Graph (email)
```

## 2. Authentication & session lifecycle (Confirmed)

- Cookie-based Supabase session; middleware refreshes tokens on every request (`src/lib/supabase/middleware.ts:4-77`).
- **Middleware route gate is narrow (Confirmed):** only `/dashboard`, `/admin`, `/settings`, `/profile` prefixes force a login redirect (`middleware.ts:36-41`). **`/dms`, `/notifications`, `/search`, `/assistant`, `/verify`, `/print`, `/api` are NOT gated at middleware level.** Protected pages enforce server-side individually (verified pattern: `src/app/(protected)/admin/hr/time/shifts/page.tsx:12-19`), so unauthenticated access should still fail at the page — but any page that forgets a guard is silently public. → finding **SEC-001** (Phase 7).
- Auth failure fallback in middleware (`middleware.ts:48-61`): if `auth.getUser()` throws but an `sb-*auth-token` cookie exists and the target is an auth route, it redirects to `/dashboard`. Edge case: stale-cookie bounce loop risk between `/login` and `/dashboard` when Supabase auth is down (Highly likely).
- Account status enforcement: `assertAccountActive` blocks inactive/suspended users in mutating actions (`lib/rbac/check.ts:189-200`); `account-disabled` and `change-password-required` routes exist.

## 3. RBAC / authorization model (Confirmed)

- Tables: `user_profiles` → `user_roles` → `roles` → `role_permissions` → `permissions` (checked live in Phase 6).
- `getAuthContext()` (`lib/rbac/check.ts:39-145`) uses the **service-role admin client for role/permission lookups** (documented bootstrap workaround, lines 67-71): RLS on those tables requires `roles.view`/`permissions.view`, which cannot be known before computing the context. This is an intentional, centralised RLS bypass — every request's permission resolution happens outside RLS.
- `hasPermission()` grants implicit all-permissions to `system_admin` **and** `group_admin` (`check.ts:153-159`). `system_admin` also injects `erp.admin`.
- Route UX filtering: `lib/rbac/route-access-registry.ts` + sidebar item perms. **Both explicitly non-authoritative** (registry header lines 9-11); server page guards are the enforcement. Registry `canAccessRoute` **falls back to `true` for unknown routes** (`route-access-registry.ts:157`).
- **No company/branch scoping exists in the permission model itself** (`check.ts` has no tenant fields); tenancy is enforced — if at all — per-query via RLS. Multi-company isolation depends entirely on RLS policies; verified in Phase 6.

## 4. Navigation & workspace (Confirmed)

- Sidebar: `src/components/layout/app-sidebar.tsx` (852 lines) — hardcoded `navSections` array: Overview, Human Resource (7 subsections, 24 items), Documents/DMS (10 + 9 admin), Operations (3 **disabled** placeholders), Finance & Supply (3 **disabled** placeholders), Reports (6), Master Data (4 subsections, 26), Administration (13 + 8 AI). Total ~95 menu destinations.
- Permission-aware filtering per item (`app-sidebar.tsx:362-391`); disabled items visible greyed-out only to global admins.
- Workspace/tab system: `src/hooks/use-workspace`, `src/components/workspace`, workspace open-element cache + unsaved-draft standards in `docs/standards/`.
- **Encoding corruption (Confirmed):** sidebar file (and likely siblings) contains mojibake — box-drawing separators rendered as `???` (e.g. `app-sidebar.tsx:29,36,80,348,357,359,393,405`). Cosmetic; indicates the file was re-saved with a non-UTF-8 codepage. → finding **TEST-00x** cosmetic.

## 5. Server component / action boundaries (Confirmed)

- Pattern: `page.tsx` (server) → `getAuthContext` → permission redirect → fetch via `src/server/actions/*` or `src/server/queries/*` → render `*-page-client.tsx` (client) with initial data (e.g. shifts page).
- Server actions return `{ success, data|error }` result objects (observed in `listGlobalShiftAssignments` usage).
- 165 files classified as server action/API; `src/server/actions/` contains domain folders: ai, branding, common-master-data, dms, hr, lookups, master-data, notifications, output, pdf, reports, settings, users + root files (audit, branches, email, numbering, organizations, permissions, roles, users).

## 6. DMS pipeline (Confirmed at architecture level; deep dive in Phase 11)

`lib/dms/` subsystems: `ocr`, `ai`, `ai-jobs`, `understanding`, `orchestration`, `metadata`, `semantic`, `entity-matching`, `erp-mapping`, `apply-to-erp`, `apply-correction`, `review-queue`, `approve`, `validation`, `temp-cleanup`, plus API routes `dms/file`, `dms/poll`, `dms/intake-status`, and internal worker `/api/internal/dms-ai-jobs/process`.
Flow: upload (inbox/batch intake) → storage → OCR (Azure Document Intelligence) → AI understanding (OpenAI) → review queue (human) → apply-to-ERP entity linking → standard file naming → retention/expiry scheduler (Edge Function). Full trace + AI-safety review in Phase 7.5/11.

## 7. Notifications & email (Confirmed)

- Edge Function `dms-expiry-scheduler` → `POST /api/internal/process-email-queue` (shared-secret `INTERNAL_API_SECRET`, `route.ts:24`) → reads `erp_email_queue` (pending/failed, attempt backoff 5/15/60/240/1440 min, `route.ts:59-63`) → sends via `MicrosoftGraphEmailProvider` using provider config stored in DB (`erp_email_providers`-style row, `secret_ref` indirection for the client secret — good practice).
- In-app bell: `/api/notifications/bell`; templates and delivery logs tables exist (live-verified Phase 6).
- **Note:** `.env.local` has **no `MICROSOFT_*` vars** though `.env.local.example` defines them — mail credentials live in DB config instead; env example is stale. → finding **OPS-00x**.

## 8. Official documents / reports / verification (Confirmed at architecture level)

- `lib/official-documents/` (definitions, layout, registry) + `lib/pdf/` + Gotenberg service (`GOTENBERG_URL`) + public `/verify/[token]` page + `PDF_PRINT_TOKEN_SECRET` for print routes. Template Studio retired per sidebar comment (OFFICIAL DOCS.1 Pkg 8) behind `OUTPUT_TEMPLATE_STUDIO_ENABLED` rollback flag.
- Report Center + Report Designer + schedules: `/api/internal/report-schedules/process` worker; flags `OUTPUT_SCHEDULES_*`, `OUTPUT_OFFICIAL_ISSUANCE_ENABLED`.

## 9. HR data flows (architecture map; deep audit Phase 9)

`features/hr` + `server/actions/hr`: employees, recruitment (requisitions→candidates→interviews→offers→onboarding), time (attendance, leave, shifts), payroll (salaries, WPS readiness), operations (assignments, readiness, blocks), actions (PRO, disciplinary, approvals, EOS), 19 settings sub-screens. Employee/candidate lifecycle traces in Phase 9.

## 10. External integrations & failure behavior

| Integration | Evidence | Failure handling |
|---|---|---|
| OpenAI | `OPENAI_API_KEY`, `lib/ai`, `lib/dms/ai` | TBD Phase 11 (retries/queue via `erp_ai_*` tables exist live) |
| Azure Document Intelligence | `AZURE_DOCUMENT_INTELLIGENCE_KEY`, `lib/dms/ocr` | TBD Phase 11 |
| Gotenberg | `GOTENBERG_URL`, `GOTENBERG_TIMEOUT_MS` | TBD Phase 11 |
| Microsoft Graph | DB-stored provider config, `lib/email/providers/microsoft-graph-provider` | queue + 5-step backoff (Confirmed) |
| Supabase Realtime | `NEXT_PUBLIC_ERP_REALTIME_SYNC_ENABLED`, `hooks/realtime`, `realtime-provider.tsx` | TBD Phase 10 |

## 11. Trust boundaries & elevated credentials (summary)

1. **Anon + RLS**: normal page/data access.
2. **Service role in-process**: `createAdminClient()` — used in auth-context resolution, internal workers, admin ops. Any import of `admin.ts` into a client component would leak; `server-only` guard present in `check.ts` but **not** in `admin.ts` itself (Confirmed — `admin.ts` has only a doc comment, lines 1-3). → finding **SEC-00x**.
3. **Shared-secret internal APIs**: `/api/internal/*` gated by `INTERNAL_API_SECRET` / `WORKER_SECRET`.
4. **Public surfaces**: `/verify/[token]`, `/api/branding/public/[assetType]`, `/api/dms/file` (TBD auth), `/print/*` (token).
5. **Edge Function**: service-role from Supabase secrets.

*Items marked TBD are verified in their dedicated phases; this document is the living architecture map for the audit.*
