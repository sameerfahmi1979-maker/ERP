# 09 — Code Quality, Test, Build and Runtime Audit

Audit date: 2026-08-05 · HEAD `262a9dcd` · All commands run on the audit machine (Windows, Node v24.15.0, npm via `C:\Program Files\nodejs`).

> **UPDATE 2026-08-05 16:40 (post-audit change):** The owner **removed `source HRMS/` from the repo entirely** (LI HRMS is reference-only, never part of the app or DB). Verified: folder gone, tracked `li-hrms-main.zip` deleted in git. Results below updated: typecheck now **72 errors** (58 app + 14 spikes; was 1,257). Lint still OOMs on `spikes/**` (completes with `--ignore-pattern "spikes/**"`: **179 errors**). LI-internal defects are out of scope per owner; only the gap matrix (doc 08) remains relevant.

## 1. Static checks — exact results

| Check | Command | Result | Detail |
|---|---|---|---|
| TypeScript | `npm run typecheck` (tsc --noEmit, 16 GB heap) | ❌ **FAIL — 72 errors** (was 1,257 before `source HRMS/` removal) | 58 genuine AGT errors + 14 `spikes/**` script errors. `tsconfig.json:25-33` still lacks a `spikes` exclude |
| ESLint | `npm run lint` (bare `eslint`) | ❌ **Still crashes — V8 OOM** | Remaining cause: `spikes/**` (own package.json/dist/mts scripts). With `--ignore-pattern "spikes/**"`: completes, **179 errors repo-wide** |
| ESLint (src only, 16 GB) | `npx eslint src --quiet` | ❌ **149 errors, 0 warnings** | incl. `src/types/database.ts` "Parsing error: File appears to be binary" (file is UTF-16), ~31 `@typescript-eslint/no-explicit-any`, ~24 `react/no-unescaped-entities`, 3 `react-hooks/rules-of-hooks`, 4 `prefer-const`, `no-assign-module-variable` |
| Unit tests | `npm test` (vitest run) | ✅ **459/459 pass** (25 files, 853 ms) | All pure lib/helper tests — see §3 |
| Production build | `npm run build` | ⚠️ **Passes — but "Skipping validation of types"** | Turbopack compiled in 17.5 s; `next.config.ts:30-32` sets `typescript.ignoreBuildErrors: true` (comment claims it's for `supabase/functions`, already excluded in tsconfig — the flag actually masks the 72 real errors). Full 213-route tree emitted; 1 Turbopack warning |

### The 72 remaining type errors (Confirmed, post-removal)
Root cause: **`src/types/database.ts` is stale and mis-encoded.** File dated 2026-07-23, 1.8 MB, saved as **UTF-16** (Supabase CLI on Windows default). It exports `Json`/`Database` but none of the convenience aliases the code imports. Missing exports → 58 app errors: `UserProfile`, `Role`, `Branch`, `OwnerCompany`, `AuditLog`, `UserWithRoles`, `UserRoleAssignment`, `UserAuthMetadata`, `BranchWithCompany`, `Permission` (files: `lib/rbac/check.ts:3`, `server/queries/{users,roles,permissions,organizations,branches,audit}.ts`, `features/users/*` (23 errors), `features/permissions/*` (7), `features/branches/*` (2), `server/actions/{roles,organizations,branches}.ts`). Plus: implicit-`any` params (users-table, user-workspace-form) and a real type bug — `server/actions/dms/expiry-reminders.ts:903` builds a `SendExportEmailInput` attachment missing `contentType`/`sizeBytes`.
Spike scripts under `spikes/**` contribute the remaining 14 errors (should be excluded from tsconfig).

**Findings:** TEST-001 (typecheck red on HEAD), TEST-002 (build skips type validation), TEST-003 (lint script OOM / misconfigured ignores), DB-00x (generated types stale + UTF-16), OPS-00x (no CI config exists to catch any of this — no `.github/workflows` or equivalent found).

## 2. Dependency & security audit
- `npm audit` not run (network call to registry; recorded as Needs verification — recommend running in CI).
- Lockfile present and consistent with package.json (installed 2026-07-28).
- Notable runtime deps: `openai`, `@napi-rs/canvas`, `pdf-parse`, `pdfjs-dist`, `mammoth`, `xlsx`, `exceljs`, `jspdf`, `qrcode`, `bidi-shaper`, `gsap`. `serverExternalPackages` pins native modules (`next.config.ts:37-43`).

## 3. Test-quality assessment (Confirmed from inventory + run)

- **459 tests / 25 files, all under `src/lib/**/__tests__`** — every one is a pure-function unit test (normalizers, registries, eligibility, diff, schema, issuance lifecycle). Fast (853 ms) and green.
- **Zero tests** for: server actions, RBAC/permission guards, RLS/company isolation, authentication flows, API route handlers, DMS pipeline integration, payroll/leave state machines, UI components, accessibility.
- **No authorization-denial tests, no transaction/concurrency/idempotency tests, no migration tests.** The security-critical layer (`lib/rbac/check.ts`) has no test.
- Playwright: 3 specs (`dms-ai-phase15`, `e2e-pdf-generation`, `print-route-security`) — **not executed**: they require a running server + seeded live/test DB; running against the live DB was not safely executable (per audit rule 1). Playwright config: `playwright.config.ts` (reviewed, uses `test:e2e` with `NODE_TLS_REJECT_UNAUTHORIZED=0`).
- `NODE_TLS_REJECT_UNAUTHORIZED=0` in `dev` and `test:e2e` scripts (`package.json`) — disables TLS verification process-wide in dev/test. Acceptable locally, dangerous if it ever reaches CI/staging. Finding OPS-00x.

## 4. Runtime review status

**Needs verification / not safely executable in this audit:** starting the dev server would exercise the live production Supabase project (`.env.local` points at `mmiefuieduzdiiwnqpie.supabase.co`); interactive login requires real credentials. Read-only browsing would still create audit/session records. Runtime route testing is therefore deferred — route-guard conclusions are drawn from source (Phase 3 sample + Phase 7 guard-coverage scan). Console/network/hydration evidence: **not obtained** (blocker recorded, per audit rule 7 other phases continue).

## 5. Phase 4 hunt — mock/stub/placeholder results (Confirmed)

Indicator scan over `src/**/*.ts(x)`: TODO 6 · FIXME 0 · HACK 1 · "coming soon" 6 · "not implemented" 4 · `console.log` 5 · `: any` 20 · `as any` 30 · `eslint-disable` 74 (51 files) · `return null` 358 (mostly legitimate JSX guards).

| Item | Verdict |
|---|---|
| `/modules/fleet|workshop|hse|finance|inventory|procurement` | Real placeholders — disabled sidebar stubs, no pages (Phase 3 §A) |
| `report-runner.ts:228` "not implemented (REPORT.2)…REPORT.4" | Controlled stub path for registry reports without fetchers. **29 fetchers implemented (all Admin+HR)** — any live registry report code outside that set fails at runtime. Live registry compared in Phase 6 |
| `lib/report-designer/field-registry/*` "Coming Soon" planned fields | By design (flagged `isPlanned`, not insertable) |
| `src/uiux_prototypes/002E/*` (2 files, contain mock data) | **Dead code — not imported anywhere** (grep Confirmed). Obsolete; sits inside `src/` so it is typechecked/linted |
| `src/app/dev/performance-qa`, `/dev/auth-debug` | Dev-only pages shipped in production build route tree (build output lists them). Need prod gating — finding SEC-00x candidate (Phase 7 verifies guards) |
| `erp-send-email-dialog.tsx:251,276,298` `console.log` incl. "[Phase 002E.3D] Sending email" with payload | Debug leftovers logging email payloads — finding SEC/PRIV-00x candidate |
| `lib/dms/ocr/types.ts:26` tesseract "deferred — not implemented" | Honest enum marker, no defect |
| Mojibake `???` separators in `app-sidebar.tsx` and siblings; `report-runner.ts` has mixed/lone CR line endings | Encoding hygiene — repo has UTF-16 (database.ts), CRLF/LF/CR mixes, and codepage-corrupted comments. Finding TEST-004 |

## 6. Dead/unwired code candidates (for per-module verification in Phases 8-9)
- `/admin/master-data/customers` page vs `/admin/master-data/parties/[typeSlug]` (customers) — duplicate concept routes.
- `/admin/reports/template-studio` — retired feature, route still built.
- `/dms/renewals` vs `/dms/expiring` — possible overlap.
- 1,092 documentation files + `spikes/` + `ChatGPT/` inside the repo root (not src) — repo hygiene.

*All commands, durations and outputs preserved in `evidence/` (see phase5 logs where referenced).*
