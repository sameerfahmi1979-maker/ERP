# Phase 1 Evidence — Repository State & File Inventory

Date: 2026-08-05. Auditor: Kimi (read-only audit per master prompt).

## 1.1 Repository state (AGT ERP — C:\dev\agt-erp)

| Item | Evidence |
|---|---|
| Git branch | `main` |
| HEAD | `262a9dcdb7e14423cec9bcd63e7fcd3bbb7bc0b7` — 2026-08-04 11:06 +0400 — "feat(dms-search): AI semantic date and metadata field search…" |
| Working tree | Clean except 2 untracked: `implementation_Review/DMS/DMS_BROWSER_1_SMART_DOCUMENT_BROWSER_PLAN.md`, `source HRMS/li-hrms-main/` |
| Package manager | npm (`package-lock.json` present, 531 KB) |
| Runtime/framework | Next.js **16.2.6**, React **19.2.4**, TypeScript ^5, Tailwind v4, Vitest 4, Playwright 1.61 |
| Scripts | `dev`, `build`, `start`, `lint` (eslint), `typecheck` (tsc --noEmit), `test` (vitest), `test:e2e` (playwright), `bootstrap:admin`, `memory:check`. All use `NODE_OPTIONS=--max-old-space-size=16384`; dev uses `NODE_TLS_REJECT_UNAUTHORIZED=0` (finding candidate — TLS verification disabled in dev) |
| Migrations | `supabase/migrations/` — 137 SQL files; also `supabase/manual_sql/`, `supabase/config.toml` |
| Edge functions | `supabase/functions/dms-expiry-scheduler` (single function) |
| API routes | 9 App Router route handlers: admin/audit/user-history, branding/public/[assetType], dms/file, dms/intake-status, dms/poll, internal/dms-ai-jobs/process, internal/process-email-queue, internal/report-schedules/process, notifications/bell |
| Tests | 25 Vitest files under `src/`; 3 Playwright specs (`tests/e2e/dms-ai-phase15.spec.ts`, `tests/pdf/e2e-pdf-generation.spec.ts`, `tests/pdf/print-route-security.spec.ts`) |
| CI/CD | No `.github/workflows`, no GitLab/Azure CI config found at root (needs confirmation Phase 5) |
| Codegen | `src/types/` present; DB type generation mechanism TBD Phase 5 |

### Environment variable names (`.env.local` — values never read into report)
`AZURE_DOCUMENT_INTELLIGENCE_KEY`, `GOTENBERG_TIMEOUT_MS`, `GOTENBERG_URL`, `INTERNAL_API_SECRET`, `INTERNAL_SITE_URL`, `NEXT_PUBLIC_ERP_REALTIME_SYNC_ENABLED`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `OPENAI_API_KEY`, `OUTPUT_OFFICIAL_ISSUANCE_ENABLED`, `OUTPUT_SCHEDULES_UI_ENABLED`, `OUTPUT_SCHEDULES_WORKER_ENABLED`, `PDF_PRINT_TOKEN_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `WORKER_SECRET`

**Note:** `.env.local.example` references `MICROSOFT_*` (Graph mail), `SUPABASE_DB_PASSWORD`, `NEXT_PUBLIC_SIGNUP_ENABLED`, `SIGNUP_ENABLED` — **absent from live `.env.local`** → Microsoft Graph mail appears configured-but-unused locally; signup flag drift. Verify in Phase 7/11.

### Project instruction files found
- `AGENTS.md` — only a Next.js "breaking changes" warning pointing to `node_modules/next/dist/docs/` (5 lines; no substantive project rules).
- `README.md` — generic create-next-app README + pointer to `docs/standards/`.
- `docs/standards/` — 13 standard docs (mandatory dev + UI/UX guides, report center, DMS/AI, branding, ledger, workspace cache/draft standards).
- `implementation_Review/` — 17 module folders of historical phase/audit docs (treated as historical evidence only).
- `CLAUDE.md` — 11 bytes (near-empty).

## 1.2 File inventory (ledger: `01_REPOSITORY_AND_FILE_REVIEW_LEDGER.csv`)

**4,453 files inventoried** (AGT 3,299 + LI HRMS 1,154). Excluded dirs recorded with size: `.git` 172 MB, `.next` 9.1 GB (!), `node_modules` 1.4 GB, `.cursor` 7.5 MB, `spikes/.../dist` 22.3 MB, LI `tmp/playwright-report` ~1.2 MB.

| Category | AGT | LI HRMS |
|---|---|---|
| product source | 604 | 288 |
| library/domain service | 349 | 205 |
| component | 263 | 112 |
| route/page | 260 | 94 |
| server action/API/controller | 165 | (in product/lib counts) |
| database migration/schema | 171 | 0 (Mongo/Mongoose models instead) |
| test/fixture | 30 | 62 |
| script | 283 | 257 |
| documentation/plan | 1,092 | 75 |
| asset/template | 215 | 22 |
| configuration | 39 | 21 |
| unknown requiring inspection | 89 | (few) |

> AGT's `documentation/plan` count (1,092) is remarkable — 1/3 of the repo is planning docs. `src/` itself contains 1,380 `.ts/.tsx` files.

## 1.3 Source layout (AGT)

- `src/app/(auth)`, `(protected)`, `api/`, `auth/`, `dev/`, `print/`, `verify/` — route groups incl. public verify + print.
- `src/features/` — 22 feature modules: ai, audit, auth, branches, branding, common-master-data, dms, executive-ledger, hr, master-data, notifications, numbering, organizations, output-ops, permissions, profile, report-center, report-designer, roles, settings, users.
- `src/server/actions`, `src/server/queries` — server layer.
- `src/lib/` — 30 domain libs incl. ai, audit, dms, email, export, hr, official-documents, output, pdf, public-verification, rbac, report-center/designer, security, supabase, template-governance/studio, validation, workspace.
- `src/hooks/` — child-tables, lookups, realtime.
- `src/uiux_prototypes/002E` — prototype code inside src (obsolete candidate).
- `spikes/` — report-designer spike with committed `dist/` (excluded, obsolete candidate).

## 1.4 Exclusion policy applied
`.git`, `.next`, `node_modules`, caches, test-results, playwright-report, `tmp`, `dist` — recorded (size) but not line-reviewed. Binary assets (215 AGT) catalogued; will inspect only templates/specs/samples as needed with masking.
