# ERP OUTPUT.7 — Schedules Worker + Safe UI Reactivation — Implementation Report

- **Phase**: ERP GLOBAL OUTPUT FRAMEWORK — WP11 (OUTPUT.7)
- **Date**: 2026-07-26
- **Status**: COMPLETE — worker live, delivery UAT passed, schedules UI re-enabled
- **Feature flags**: `OUTPUT_SCHEDULES_WORKER_ENABLED=true`, `OUTPUT_SCHEDULES_UI_ENABLED=true` (both in `.env.local`; default **false** in code)

---

## 1. Objective

Make report schedules actually run: a secure machine-to-machine worker that finds due
schedules, generates the report attachment, emails recipients, records every attempt,
retries transient failures with bounded backoff, and never double-sends. Only after
the worker and a real email delivery passed UAT was the schedules UI (hidden since
OUTPUT.1) re-enabled.

---

## 2. What Was Built

### 2.1 Database — `erp_report_schedule_runs` (migration `20260726180000_output_7_schedule_runs.sql`)

One row per (schedule, due slot) attempt group:

| Concern | Columns |
|---|---|
| Idempotency | `run_key` (UNIQUE) = `schedule:{id}:due:{ISO minute}` — insert conflict = someone else owns the slot |
| Lease/lock | `leased_by`, `leased_until`, status `leased` → `running` |
| Bounded retries | `attempt_count`, `max_attempts` (3), `next_attempt_at` (linear backoff 5m × attempt) |
| Outcome | `status` ∈ leased/running/succeeded/skipped/failed_retryable/failed_terminal |
| Delivery evidence | `report_run_id`, `delivery_log_id`, `attachment_filename`, `attachment_size_bytes`, `recipient_count` |
| Diagnostics | `failure_reason` (sanitized), `started_at`, `finished_at` |

RLS enabled with no policies → service-role only. Partial index on
`next_attempt_at WHERE status='failed_retryable'` for cheap retry polling.

### 2.2 Worker core (`src/lib/report-center/schedule-worker-core.ts`)

Pure, unit-tested helpers: `buildRunKey` (idempotency), `retryBackoffMs` (linear),
`isSchedulableClass` (blocks Class A–D official documents from scheduled delivery),
`sanitizeFailureReason` (strips emails/tokens/URLs), `calculateNextRunAt`
(timezone-aware next occurrence).

### 2.3 Worker (`src/lib/report-center/schedule-worker.ts`)

Per invocation: reap expired leases → claim due schedules via idempotent `run_key`
insert → validate (active schedule, schedulable output class, creator still has the
report's required permissions, valid recipients) → execute → record outcome →
advance `next_run_at`. Transient failures become `failed_retryable` with backoff;
attempt 3 failure becomes `failed_terminal` (visible in Ops Console banner).

### 2.4 Shared execution (`src/lib/report-center/schedule-execution.ts`)

`executeScheduleRun` — extracted from `schedules.ts` so "Run Now" (user session) and
the worker (machine) share one code path: run report → resolve template → generate
attachment (PDF/XLSX/CSV) → send email → write `erp_report_delivery_logs`.

Two production bugs fixed here:

1. **`getCreatorPermissions` queried a non-existent `user_role_assignments` table**,
   silently returning `[]`, so every scheduled run skipped with "creator missing
   permissions". Now queries `user_roles` (same fix family as WP9 company-scope bug).
2. **Email required a user session.** `sendExportEmail` (server action) calls
   `requireAuth`, impossible for a worker. Added
   `getDefaultEmailProviderSystem()` to `src/lib/email/providers/factory.ts`
   (service-role read of provider config) and a worker-safe `sendScheduleEmail`
   with strict recipient validation (well-formed, deduped, non-empty To).
   Authorization is enforced upstream: `WORKER_SECRET` + creator permission
   re-validation per run.

### 2.5 Internal API route (`src/app/api/internal/report-schedules/process/route.ts`)

Mirrors the DMS AI worker pattern: `Authorization: Bearer ${WORKER_SECRET}` required,
`OUTPUT_SCHEDULES_WORKER_ENABLED` flag gate, `GET` = health (due/retryable/terminal
counts, last finish), `POST` = process batch, returns
`{claimed, succeeded, skipped, retryScheduled, terminal, leasesReaped, durationMs}`.

### 2.6 Retirements and UI

- Removed the **unauthenticated** `processDueReportSchedules` server action from
  `schedules.ts` (was callable without a worker secret).
- Ops Console now shows schedule-run metrics (retryable / terminal / succeeded-24h)
  and a terminal-failure banner.
- Schedules UI re-enabled (`OUTPUT_SCHEDULES_UI_ENABLED=true`) **after** delivery UAT passed.

---

## 3. Runtime UAT Evidence (live dev server + Supabase + M365)

| # | Check | Result |
|---|---|---|
| 1 | Route auth: no header / wrong secret | **401** both |
| 2 | Health endpoint with secret | `{"status":"ok","workerEnabled":true,...}` |
| 3 | Due schedule claim + lease | Run created `leased→running`, no double-claim |
| 4 | Multi-company report without template | `skipped` with clear reason (run #1) |
| 5 | Creator-permission gate (pre-fix) | `skipped: missing hr.compliance.view` (run #2) — root-caused to `user_role_assignments` bug, fixed |
| 6 | Transient failure → retry | Run #4 attempt 1 `failed_retryable` (session-bound email), attempt 2 after fix: **succeeded** |
| 7 | Real email delivery | Delivery log #19: `sent` via `M365_DEFAULT` to sameer@algt.net, attachment `HR_COMPLIANCE_EXPIRY_2026-07-26_2026-07-26.pdf` |
| 8 | Schedule advanced | `next_run_at` → 2026-07-27 07:00 UTC, `last_status='success'` |
| 9 | Idempotency: double POST after success | Both return `claimed:0` — no duplicate generation or email |
| 10 | Schedules UI after reactivation | Page renders schedule list ("Daily — Compliance Expiry Report", next run shown) |

Unit tests: `schedule-worker.test.ts` — **11/11 passed** (run key, backoff bounds,
class policy, failure-reason redaction, timezone next-run). ESLint clean on all
changed files. `tsc` shows no new errors (pre-existing `expiry-reminders.ts` error
unrelated).

---

## 4. Files Changed

| File | Change |
|---|---|
| `supabase/migrations/20260726180000_output_7_schedule_runs.sql` | NEW — run/lease/retry table |
| `src/lib/report-center/schedule-worker-core.ts` | NEW — pure helpers (unit-tested) |
| `src/lib/report-center/schedule-worker.ts` | NEW — worker loop (reap/claim/execute/record) |
| `src/lib/report-center/schedule-execution.ts` | NEW — shared execution + system email send + permission fix |
| `src/lib/report-center/__tests__/schedule-worker.test.ts` | NEW — 11 unit tests |
| `src/app/api/internal/report-schedules/process/route.ts` | NEW — WORKER_SECRET-protected endpoint |
| `src/lib/email/providers/factory.ts` | `getDefaultEmailProviderSystem()` (service-role provider read) |
| `src/server/actions/reports/schedules.ts` | Run Now → shared execution; removed unauthenticated `processDueReportSchedules` |
| `src/lib/output/feature-flags.ts` | `isSchedulesWorkerEnabled()` |
| `src/server/actions/output/ops-console.ts` | Schedule-run metrics in ops metrics |
| `src/features/output-ops/output-ops-console.tsx` | Schedule metrics cards + terminal banner |
| `src/app/(protected)/admin/reports/schedules/page.tsx` | UI reactivated via flag (unchanged code path) |

---

## 5. Operations Notes

- **Trigger**: POST `/api/internal/report-schedules/process` with
  `Authorization: Bearer ${WORKER_SECRET}` from cron (Railway cron, Supabase
  pg_cron + http, or any scheduler). Suggested cadence: every 5 minutes.
- **Rollback**: set `OUTPUT_SCHEDULES_WORKER_ENABLED=false` (route returns 503) and/or
  `OUTPUT_SCHEDULES_UI_ENABLED=false` (page hidden again). No schema rollback needed.
- **Class policy**: schedules can never deliver Class A–D official documents;
  the worker refuses them (`isSchedulableClass`) regardless of what the schedule row says.
- **Known follow-up**: schedule #2's creator genuinely lacks `hr.compliance.view`
  via role grants review, and HR Manager still lacks `reports.pdf.generate` (WP9 note).
