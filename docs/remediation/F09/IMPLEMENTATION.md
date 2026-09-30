# F09 backend foundation

Started 2026-09-30 on `codex/f09-backend-foundation` from main commit
`d9de058abbc410006c0233bac3e69e06e1faccde`.

Isolated checkout: `C:\dev\agt-erp-f09`. F05 and production are untouched.
The managed worktree was relocated with Git to meet the C:\dev owner rule;
the app attachment may retain the former path. Use Git's worktree list.

Scope: queue fencing, eligibility/retries, calendar correctness and provider
uncertainty handling, with synthetic local tests and no real outbound mail.
No public push, deployment, live migrations or worker enablement.

F06 provider governance, F08 attachments, F05 operations UI integration and a
controlled live canary remain acceptance gates. Foundation tests alone do not
close F09.

## Implemented in this checkpoint

1. Additive email-queue migration: atomic `SKIP LOCKED` claims, unique intent
   keys, per-claim UUID fencing, 120-second leases, just-in-time ownership,
   due/backoff/pause/cancel/delete/budget eligibility and append-only attempt
   events. Attempts count at claim, including worker crashes. Events do not
   contain addresses, message text, attachments or raw provider errors.
2. A one-shot dispatch marker and fenced finalization. Pre-dispatch crashes
   consume the bounded budget. After dispatch, crash/response loss is held as
   `delivery_unknown`; it is not automatically sent again. Provider acceptance
   is recorded separately from proof of mailbox delivery.
3. Server-only RPC adapter and dependency-injected worker. Preparation is
   bounded to 15 seconds, send to 20 seconds, within the lease. Preparation
   must reload authorization and source state on each attempt. Exceptions in
   final persistence are not converted into a second send.
4. Server-only Graph token/send helpers: bounded by the worker, abort signals,
   pinned standard Graph/OAuth origins, no redirects, no raw provider-error
   logging, correlation UUID, explicit body-only support, validated inline
   attachment names/type/base64/byte counts and a 3 MB combined inline cap.
   No claim is made that `client-request-id` provides provider idempotency.
5. Shared calendar replacement used by existing calendar callers. It preserves
   full local dates, handles same-day weekly slots, clamps monthly dates to
   month-end, skips nonexistent DST wall times and uses only the first occurrence
   of ambiguous times. The next occurrence is strictly after the reference time.
   These explicit policies require release review before production adoption.
6. Separate atomic schedule-slot RPC: row/config-version check, reserve and
   advance in one transaction, rollback on pointer failure, and reconciliation
   of a legacy split-write failure without changing an existing successful run.
   Reservation orchestration isolates poison schedules and requires an explicit
   backlog policy. This is NOT yet adopted by the existing schedule worker.
7. Constant-time machine-secret comparison helper with missing/short/wrong
   credential tests. Existing routes have not yet been switched to this helper.

## Verification — 2026-09-30

| Check | Result | Scope / qualification |
|---|---|---|
| F09 unit/regression suite | PASS: 64 tests, 5 files | Calendar, slots, worker, provider, auth and existing schedule-core tests |
| PostgreSQL component integration | PASS: 23 scenarios | PostgreSQL 17.11, dedicated `algt-f09-synthetic`, network `none`, no published ports |
| Clean migration replay | PASS | Both final drafts replayed from historical component DDL; unrelated FKs omitted in synthetic fixture |
| Existing offline remediation suite | PASS: 545 tests, 59 files | Node compatibility option described below; no application edits to achieve this |
| Shipping TypeScript | PASS | `npm run typecheck` |
| F09-targeted ESLint | PASS, no diagnostics | New helpers/tests and modified calendar core |
| Diff whitespace check | PASS | No whitespace errors; Git notes LF-to-CRLF normalization |
| Production traffic/data | NOT USED | No live reads/writes, mail, role changes or credentials copied |
| Full production build, browser UAT, full-schema replay | NOT RUN | Required later for integrated release |

Database scenarios include eight sessions competing for one email; eight
sessions sharing five emails without duplicate claims; stale token/owner
rejection; one-shot dispatch; future/cooldown/paused/deleted/cancelled/exhausted
eligibility; accepted-event atomicity; acceptance without dispatch rejection;
Retry-After; bounded crash recovery; post-dispatch uncertainty; expiry before
reaping; cancellation races; intent deduplication after soft deletion; terminal
row starvation; ordinary-user RPC denial; event RLS/no service-role deletion;
six competing schedule reservations; stale schedule config; forced pointer
failure rollback; and preservation of successful legacy runs.

The clean replay includes Supabase-style default grants before creating the new
event table. The migration explicitly revokes inherited permissions, then grants
only SELECT/INSERT to service_role. It uses SECURITY INVOKER functions, empty
search paths and explicit denial of anonymous/authenticated RPC execution.

All synthetic queue, event, schedule and run rows were removed after testing.
The isolated container/schema remains for repeatable tests; it has no outbound
network, no published port and no production data. No F05 service was stopped.

### Reproduce

Run from `C:\dev\agt-erp-f09`:

```powershell
node node_modules/vitest/vitest.mjs run --config tests/remediation/f09/vitest.config.mts
node tests/remediation/f09/db-test.mjs
npm run typecheck
npx --no-install eslint src/lib/email/queue src/lib/report-center/schedule-calendar.ts src/lib/report-center/schedule-slots.ts src/lib/report-center/schedule-worker-core.ts tests/remediation/f09
$env:NODE_OPTIONS='--no-experimental-webstorage'
node node_modules/vitest/vitest.mjs run --config tests/remediation/vitest.config.mts
```

The first broad-suite invocation under Node 26 was stopped after browser-storage
setup failures. A direct Node flag alone did not propagate to Vitest child
processes. Inheriting it through NODE_OPTIONS made the affected 27 tests and then
the entire 545-test suite pass. This was a test-runtime issue, not a repaired F05
application defect. Node's module.register deprecation warning remains.

## Source-level producer/consumer inventory (live configuration not certified)

| Path | Existing responsibility | Required adoption |
|---|---|---|
| `src/server/actions/notifications/email-queue.ts` | Manual single/batch sends, auto-send, retry/cancel | Replace ALL legacy claim/write paths with one guarded service; preserve permission checks and truthful counts |
| `src/app/api/internal/process-email-queue/route.ts` | Machine-triggered email processor; INTERNAL_API_SECRET | Same shared service, runtime secret gate, explicit pause/readiness/health; never an independent processor |
| `src/server/actions/notifications/bridges/dms-notification-bridge.ts` | DMS business-event producer with autoProcess | Stable intent keys and current source/recipient authorization |
| `supabase/functions/dms-expiry-scheduler/index.ts` | Cron-driven DMS notification/email producer and processor trigger | Deduplicate enqueue, own trigger inventory, bounded trigger request; no backlog replay by implication |
| `src/lib/report-center/schedule-worker.ts` | Due/retry report runs | Atomic reservation plus fenced execution/attempt recovery; current legacy retry engine is NOT replaced yet |
| `src/app/api/internal/report-schedules/process/route.ts` | WORKER_SECRET + OUTPUT_SCHEDULES_WORKER_ENABLED | One trigger, truthful readiness, explicit approved catch-up policy |
| `src/server/actions/reports/schedules.ts` | Manual Run now | Must share the eventual schedule execution contract; cannot bypass official-output or creator checks |
| `src/lib/report-center/schedule-execution.ts` | Report rendering/direct email | F08 provenance/permissions and bounded rendering adapter before queue delivery |
| `src/lib/email/providers/microsoft-graph-provider.ts`, `src/lib/email/microsoft-graph-provider.ts` | Two existing provider abstractions | Consolidation/adaptation still required; new transport is not globally installed |
| `src/app/api/internal/dms-ai-jobs/process/route.ts` | Separate AI worker | Do not activate or replay its historical backlog as part of email cutover |

No Railway runtime variables, live cron configuration, provider settings or live
backlog counts were read in this checkpoint. Existing deployment ownership,
heartbeat and exactly one intended trigger per queue must be verified later.

## Remaining F09 implementation gates (do not mark complete)

| Task | Current state | Next work |
|---|---|---|
| T01 | Source inventory only | Read-only live trigger/owner/credential-presence/enablement/heartbeat inventory under release scope |
| T02 | Tested DB/worker primitives | Consolidate manual/internal/auto adapters; protect worker-owned queue columns from direct writes; implement guarded retry/cancel; actual PostgREST and full-schema tests |
| T03 | Calendar connected; slot primitive tested | Adopt atomic slot RPC in scheduler, fenced retry claims/outcomes, actual scheduler end-to-end tests; approved calendar/backlog policy |
| T04 | Eligibility/budget/backoff tested | Concrete per-source fresh creator/company/branch/record/recipient validation on every attempt; official-class denial in manual and retry paths |
| T05 | Deadline/uncertainty primitives tested | Integrate provider config/secret resolution and renderer; operational reconciliation of unknown outcomes, not blind resend |
| T06 | Body/inline attachment validation | Dedicated send permission at all entries; F06 provider defaults/priority/throttling; F08 provenance and large attachment behavior |
| T07 | Not implemented here | F05-consistent operations UI, truthful statuses, counts/search/pagination and audited retry/cancel |
| T08 | Not started | Approved overdue policy, staged cutover, real unattended canary/receipt and monitoring |
| WS adoption | Deferred to coordinated UI integration | Schedule/provider/test-email form contracts; secrets never drafted |

### Integration and release sequence

1. Keep this branch/worktree independent. Do not copy its node_modules or replace
   the F05 checkout. Review overlapping package/schema/generated-type changes
   when integrating with the current main branch.
2. Finish adapter adoption and access/provenance tests. Do not run these new RPCs
   alongside any legacy processor that can update/send the same queue rows.
3. Verify the complete schema/default privileges/RLS, migration order, frozen
   payload protection, report retry fencing, real triggers and feature flags.
4. Run types, lint, full tests, build, isolated browser/API journeys and failure
   recovery. Keep unknown outcomes held; external inbox exactly-once is not proven.
5. Seek approval for public publication, PR/merge and deployment separately.
   No branch has been pushed or merged in this checkpoint.
6. At an authorized cutover: pause legacy consumers, apply reviewed migrations,
   deploy matching adapters, validate readiness without delivery, then activate
   only the agreed test canary. Retain old history and unresolved outcomes.
7. Rollback: pause new consumers; do not restore legacy consumers while active
   leases/unknown sends exist. Reconcile first. Prefer forward repair and preserve
   additive columns/event history rather than destructive rollback migrations.

## Design references

- [Supabase database functions](https://supabase.com/docs/guides/database/functions)
- [PostgreSQL SELECT / SKIP LOCKED](https://www.postgresql.org/docs/current/sql-select.html)
- [Graph sendMail](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0): 202 indicates acceptance, not completed delivery.
- [Graph throttling](https://learn.microsoft.com/en-us/graph/throttling): respect Retry-After.
- [Supabase changelog](https://supabase.com/changelog): reviewed current change notice; no extension repair attempted.
