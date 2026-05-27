# ERP_BASE_001 — Implementation Report

**Date:** 2026-05-27  
**Updated:** 2026-05-27 (ERP_BASE_001A + 001B + 001C corrections applied)  
**Branch:** `feature/erp-base-foundation`

---

## What was created

### Application (Next.js 16 + TypeScript + Tailwind v4 + shadcn/ui)

- Auth routes: `/login`, `/signup`, `/forgot-password`, `/reset-password`
- Protected shell: sidebar, header, theme toggle, breadcrumbs
- `/dashboard` with module placeholder cards
- Admin foundation: `/admin/users`, `/admin/roles`, `/admin/permissions`, `/admin/organizations`, `/admin/branches`, `/admin/audit`
- `/profile`, `/settings`
- Supabase SSR clients (`src/lib/supabase/*`)
- RBAC helpers (`src/lib/rbac/*`)
- TanStack Table data grid pattern (`src/components/tables/data-table.tsx`)
- Zod + React Hook Form auth validation

### Database

- `supabase/migrations/20260527120000_erp_base_foundation.sql`
- `supabase/config.toml` (project ref `mmiefuieduzdiiwnqpie`)

### Tooling & docs

- `.env.local.example`
- `scripts/bootstrap-admin.mjs` + `npm run bootstrap:admin`
- `ERP_BASE_001_INITIAL_INSPECTION_REPORT.md`
- This report set

---

## Packages installed

**Core:** `next`, `react`, `react-dom`, `typescript`, `tailwindcss`  
**Supabase:** `@supabase/supabase-js`, `@supabase/ssr`  
**Forms/validation:** `zod`, `react-hook-form`, `@hookform/resolvers`  
**UI:** shadcn/ui (base-nova), `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `sonner`, `next-themes`  
**Tables:** `@tanstack/react-table`  
**Utils:** `date-fns`

---

## Commands run

- `git init` + branch `feature/erp-base-foundation`
- `npx create-next-app@latest erp-app` (moved to workspace root; npm used — pnpm/corepack SSL issue)
- `npm install` (dependencies + shadcn components)
- `npx shadcn@latest init` / `add` (with TLS workaround for corporate proxy)
- `tsc --noEmit` — **PASS**
- `next build` — **PASS** (after 001A + 001B fixes)
- `eslint` — **PASS** (0 errors, 1 warning)

---

## Build / lint status (latest after 001A + 001B)

| Check | Result |
|-------|--------|
| TypeScript (`npm run typecheck`) | **PASS** |
| ESLint | **PASS** (0 errors, 1 warning: TanStack Table `useReactTable` incompatible-library) |
| Production build | **PASS** (from clean path `C:\dev\agt-erp`) |
| Migration pushed | **NO** (awaiting approval) |

**001A fixes:**
- Added `export const dynamic = "force-dynamic"` to relevant pages/layouts
- Fixed `use-mobile.ts` with `useSyncExternalStore` pattern
- Fixed TypeScript error in `users.ts` query

**001B fixes:**
- Hardened role assignment authorization (see `ERP_BASE_001B_ROLE_ASSIGNMENT_HARDENING_REPORT.md`)

**001C fixes:**
- Fixed company-scoped helpers to require `ur.branch_id is null` (prevents branch-scoped leak)
- Added user_profiles, user_roles, and audit_logs scope validation triggers (SECURITY DEFINER)
- See `ERP_BASE_001C_SCOPE_HELPER_FIX_REPORT.md` for full detail

**Path note:** Build passes when run from `C:\dev\agt-erp` (clean path without `&` character). Original OneDrive path may still cause build issues on Windows due to special characters.

---

## What was not done (by design)

- Migration **not** pushed to Supabase Cloud
- No real HR/Fleet/Workshop/etc. modules
- No frontend deployment
- No GitHub push
- No Playwright tests (not present in scaffold)
- Organization/branch CRUD UI (placeholders only)

---

## How to run locally

1. Copy `.env.local.example` → `.env.local` and paste Supabase anon + service role keys.
2. Approve and apply migration (see `ERP_BASE_001_DATABASE_REPORT.md`).
3. Start dev server:

```bash
node node_modules/next/dist/bin/next dev
```

4. Sign up → bootstrap admin:

```bash
npm run bootstrap:admin -- your.email@company.com
```

---

## Git

Checkpoint commit requested by prompt (not pushed to remote).
