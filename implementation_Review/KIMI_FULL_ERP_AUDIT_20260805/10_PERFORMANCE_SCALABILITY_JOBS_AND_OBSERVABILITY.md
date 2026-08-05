# 10 — Performance, Scalability, Jobs and Observability Audit

Audit date: 2026-08-05 · Basis: source/config/live-queue evidence (no runtime profiling available).

## 1. Rendering & caching (Confirmed)

- All pages `force-dynamic` (per-page pattern) — everything is server-rendered on demand; **no static optimization anywhere**. Appropriate for an ERP, but client-router cache is re-enabled (`staleTimes.dynamic=30`, `next.config.ts:20-23`) — deliberate, documented (WORKSPACE.PERF.1).
- Build machine pressure: every script sets `--max-old-space-size=16384`; `.next` build cache = **9.1 GB** on the audit machine. Dev ergonomics poor; CI (absent) would need equal resources. PERF-001 (Informational).
- Bundle: heavy client deps (`gsap`, `recharts`, `@napi-rs/canvas` externalized, `xlsx`, `exceljs`, `jspdf`, `pdfjs-dist`) — per-route bundle analysis not available; Needs verification.

## 2. Data access patterns (Confirmed / Highly likely)

- `getAuthContext()` runs **4 sequential admin queries** per invocation (`check.ts:75-131`) and is called by every protected page + layout — at least 2× per page view (layout + page). No caching/memoization of auth context within a request. PERF-002 (Medium — fix with React `cache()`).
- Leave-balance increments via read-modify-write (HR-002) are also a concurrency-perf smell.
- Pagination: server actions accept `{ page, page_size }` (e.g. `listGlobalShiftAssignments({page:1,page_size:50})`) ✅; fixed limits (50) present — silent-truncation risk if UI lacks "load more". Needs verification per screen.
- Live table sizes are dev-scale (largest: dms_documents 648); scale assumptions undocumented. PERF-003 (Informational — capture business volumes before production).

## 3. Background jobs & queues (Confirmed)

| Job | Mechanism | Health |
|---|---|---|
| Email sending | Edge Function → `/api/internal/process-email-queue`, 5-step backoff | ✅ 292 sent / 0 stuck (live) |
| Report schedules | `/api/internal/report-schedules/process` worker | Needs runtime verification |
| DMS AI jobs | `/api/internal/dms-ai-jobs/process` + `claim_dms_ai_jobs`/`recover_stale_dms_ai_jobs` RPCs | Claim/recover design ✅; runtime unverified |
| DMS expiry | `supabase/functions/dms-expiry-scheduler` (only Edge Function) | pg_cron schedule Needs verification |
| Temp cleanup | `lib/dms/temp-cleanup` + eligibility tests | ✅ tested |

Idempotency: email queue attempts/backoff ✅; DMS AI claim pattern ✅; **leave/overtime approvals not idempotent** (HR-002). Locking: DMS AI jobs claim-based; payroll nonexistent.

## 4. Observability (Confirmed)

- `lib/logger` used consistently in server code (structured-ish); **no APM/tracing** (no Sentry/OpenTelemetry in deps). OBS-001 (Medium — production would be blind).
- AI observability screens exist for DMS AI (usage logs, cost rates) ✅ — ahead of the curve.
- Health-check endpoint: none found (`/api` has no health route). OBS-002 (Low).

## 5. Operations (Confirmed)

- **No CI/CD** (no `.github/workflows`, no pipelines config). No automated typecheck/lint/test gate. OPS-001 (High — combined with red typecheck, regressions ship silently).
- Deployment target: Railway referenced in code comments (`process-email-queue/route.ts:14`); no Dockerfile/compose in repo root. Backup/DR evidence: none in repo (Supabase-managed; Needs verification of PITR tier).
- Env drift: `.env.local.example` vs live `.env.local` mismatch (MICROSOFT_*, SIGNUP flags, DB password) — stale example misleads onboarding. OPS-002 (Low).
- `NODE_TLS_REJECT_UNAUTHORIZED=0` in dev/test scripts — must never reach staging/prod. OPS-003 (Low).
- Rollback strategy: undocumented; migrations are forward-only files (no down migrations). OPS-004 (Informational).
