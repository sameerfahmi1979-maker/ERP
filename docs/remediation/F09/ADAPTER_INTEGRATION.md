# F09 — Email processor and report-delivery integration

Date: 30 September 2026

State: implemented and locally verified; **not deployed, not pushed, and F09 is not closed**.

Branch: `codex/f09-backend-foundation`

Checkout: `C:\dev\agt-erp-f09`

Foundation checkpoint: `c7ca58518`.

## What this increment changes

Manual single-item processing, manual batches, enqueue-with-auto-process, and the
internal email route now call the same server-only F09 queue service. The separate
read/update/send implementations and arbitrary provider fallbacks were removed
from those consumers. The report scheduler reserves slots atomically, creates
one email intent per run, and invokes that same service for REPORTS. It no longer
owns a competing send/retry engine.

The F05 checkout, production database, cloud configuration and live email were
not changed. The small queue/report panel changes in this isolated checkout are
request-key and truthful-status adaptations, not an F05 visual redesign.

## Implemented protections

Supabase/Postgres skill guidance informed the restricted RPC privileges, short
atomic database transitions, immutable attempt events and isolated schema tests.

### Authority and confidentiality

- Queue enqueue requires both global manage/admin authority and separate global
  process/admin authority. Auto-process does not bypass the latter.
- Global queue viewing/control does not treat a company/branch capability as a
  global grant; the queue has no trustworthy company/branch field.
- Generic body-only mail must have a current active creator with both grants.
  It cannot masquerade as a record-bound report or notification.
- Scheduled reports require the creator's current run, export and email
  permissions in the requested company scope; an operator's stronger rights
  never replace the creator's authority.
- Report reads use outputFormat=email, so email permission participates in the
  existing scoped read facade as well as the entry-point check. Required source
  permissions, role assignments, report availability and output class are checked.
  Grants and report configuration are rechecked after rendering.
- Classes A–D and unknown classes are refused by both manual and recurring
  schedule delivery. Supported analytical classes are E/F/G or explicitly
  unclassified. Scheduling must be supported and the source must remain active.
- No missing/failed branding fallback: generation stops if the authorized
  template cannot be resolved. Output must have a report-run reference and fit
  the existing conservative 3 MB inline transport cap.
- Each report attempt checks the frozen schedule revision; the database checks
  it again at the dispatch transition. Changed recipients/source settings cancel
  or fence the old intent rather than silently changing its payload.
- DMS checks current email settings, notification/document identity, active
  recipient, current confirmed Auth mailbox, company/branch/classification
  permissions and absence of extra cc/bcc recipients. User-created DMS queue
  entries also recheck the sender's manage/process authority.
- DMS mail is deliberately a **generic sign-in notice only**: no cached document
  title/body, attachment or document deep link is emailed. The in-app record
  continues to enforce F03's full linked HR/recruitment/confidential-file policy.
  This is not certification of confidential DMS content delivery. That requires
  the F08 source/recipient/output adapter and acceptance tests.

### Queue ownership and deduplication

- Ordinary Data API clients cannot insert/update/delete queue rows, including
  direct column grants. They must use guarded actions. All integration RPCs are
  service-only, SECURITY INVOKER with explicit search paths.
- Queue payload, source, creator, recipients, provider selection, request key
  and attempt ceiling become immutable after insertion. Corrections require
  cancellation and a new intentional request.
- Manual test mail and manual report runs carry stable UUID request keys;
  retries after a lost application response reuse the original intent.
- DMS producers share a stable notification identity and queue intent key.
  They recover an existing record after duplicate/response-loss conflicts.
- Report run reservation -> enqueue is recoverable and idempotent. Newly queued
  runs are marked queued rather than falsely claiming delivery or repeatedly
  blocking later reservations.
- Retry controls cannot reset consumed attempts, erase a provider cooldown,
  revive cancellation/permanent failure, or resend an uncertain outcome.
- Cancellation can fence a preparing worker but cannot pretend to cancel mail
  whose provider dispatch has already started.
- Existing unresolved queue rows are paused by the integration migration.
  Historical schedule runs are distinguished from new F09 reservations; legacy
  failed/running/succeeded jobs are not automatically adopted or resent.

### Delivery and history

- Provider lookup requires the exact enabled configured provider or exactly one
  enabled default. There is no fallback to an arbitrary provider.
- Only the reviewed Microsoft Graph client-credentials/sendMail mode and standard
  Microsoft OAuth/Graph origins are supported by this adapter.
- Preparation/token/render await is bounded by the shared 15-second preparation
  deadline and sending by the 20-second send deadline within a 120-second lease.
  Abort checks stop late output from reaching dispatch. This is not a separate
  CPU-isolated rendering process; synchronous renderer cancellation is a remaining
  resilience consideration.
- Provider 202 means provider acceptance, not proof of inbox delivery.
  Lost/ambiguous post-dispatch outcomes remain delivery_unknown and require
  reconciliation. A correlation UUID is not provider idempotency.
- Prepared report metadata is lease-fenced. Queue outcome, report-run projection,
  report-delivery history and notification-delivery history commit atomically.
  A history write failure after dispatch rolls back finalization; lease recovery
  holds the result as unknown instead of sending again.
- Canonical append-only attempt events contain no message content or credentials.
  Existing history screens retain delivery records; report history distinguishes
  provider_accepted and delivery_unknown.
- Queue process and report Run now messages distinguish queued, paused, retrying,
  provider acceptance and uncertainty. Full operations-console adoption remains
  coordinated with F05.

## Verification

| Check | Result | Qualification |
|---|---|---|
| F09 unit/adapter tests | PASS — 121 tests, 10 files | Network disabled/mocked; calendar, fencing, transport, source policy, entry points, report generation and scheduler |
| Existing offline remediation suite | PASS — 545 tests, 59 files | Inherited NODE_OPTIONS disables Node 26 experimental web storage for jsdom |
| Foundation PostgreSQL tests | PASS — 23 scenarios | Existing network-isolated F09 component database |
| Integration PostgreSQL tests | PASS — 14 scenarios | Clean replay of all three migrations in separate f09_integration database |
| Shipping TypeScript | PASS | Isolated checkout |
| Targeted ESLint | PASS, no diagnostics | All changed TypeScript adapters, controls and F09 tests |
| Production-mode Next.js build | PASS | Windows trusted system CA enabled; no TLS-verification bypass |
| Diff whitespace check | PASS | Git line-ending normalization notices only |
| Staged secret scan | PASS — 22 files, no matches | No private audit evidence or production credentials staged |
| DMS Edge source syntax | PASS | TypeScript transpilation only; Deno type/runtime acceptance remains open |
| Full-schema/PostgREST/Deno/runtime browser UAT | NOT COMPLETE | Release gates; component fixtures do not prove full production integration |
| Live send, migration or worker activation | NOT PERFORMED | No production writes or real messages |

Total: **703 passing automated test cases/scenarios**, not 703 user journeys.
The first build attempt failed fetching Google Fonts because Node did not trust
the local certificate chain. Repeating with `--use-system-ca` passed. No font
source, F05 application source, certificate validation policy or dependency
version was changed to obtain the pass. Existing Node module.register deprecation
and webpack large-string cache warnings remain non-fatal.

Database test container: `algt-f09-synthetic`; network mode `none`; no published
ports. Databases: `f09_synthetic` and `f09_integration`. All synthetic queue,
schedule, run and delivery/event rows are removed at successful test completion.
Only disposable component schemas remain. Historical DDL is reused, but unrelated
foreign keys are omitted in the fixtures: **this is not a full-schema RLS or
PostgREST acceptance claim**. No F05 Supabase service was stopped or modified.

### Important verified cases

1. Six concurrent manual run requests and six concurrent enqueue attempts share
   one report run and one queue intent.
2. Scope/company/branch mistakes, inactive accounts, missing send grants,
   changed recipients, invalid classifications and revoked grants prevent sending.
3. Same-request recovery does not recreate a soft-deleted or already sent intent.
4. Metadata updates and dispatch require the current lease fence.
5. Simulated history failure after acceptance produces a held unknown outcome.
6. Cancellation before dispatch prevents the send; cancellation after dispatch
   is refused.
7. Manual retry does not bypass cooldown or increase the attempt budget.
8. A malformed schedule does not stop valid schedules from reserving their slots.
9. Report ticks invoke the same shared email processor, not a DMS-only consumer.
10. Missing worker flags/strong machine credentials or catch-up policy do not
    activate processing. Unresolved legacy queue rows remain held.

## Runtime and cutover contract — not activated

| Control | Required behavior |
|---|---|
| F09_EMAIL_WORKER_ENABLED | Defaults off. Must be exactly true to claim/send through these adapters, including manual processing |
| OUTPUT_SCHEDULES_WORKER_ENABLED | Existing schedule route gate; requires the F09 email gate too |
| F09_SCHEDULE_CATCHUP_POLICY | Explicit approved value: one-slot-at-a-time or skip-missed-after-current; never implicitly selected by deployment |
| F09_EMAIL_TRIGGER_ENABLED | Edge-trigger gate. Do not enable it alongside another intended periodic owner without a reviewed trigger inventory |
| INTERNAL_API_SECRET / WORKER_SECRET | Existing machine-specific credentials, runtime constant-time comparison, minimum length enforced; never embedded in source |
| DMS notification settings | Both overall notification and email settings must still allow DMS email when an attempt runs |

A processing batch claims just in time and stops starting work after its time
budget. A final in-flight item may run to its own deadline. The host/trigger
request timeout must accommodate this; an interrupted dispatched lease is held
unknown. The report tick also spends time reserving/materializing runs. Verify
host limits, trigger timeout, single periodic owner and health/heartbeat before
activation.

Migration order:
1. `20260930095218_f09_email_queue_leases.sql`
2. `20260930100400_f09_atomic_schedule_slot.sql`
3. `20260930102553_f09_delivery_adapter_integration.sql`

Stop legacy consumers first, apply the matching migration/application together,
keep the new gates off, and validate the deployed schema before a controlled
canary. Do not roll back to legacy unfenced senders while leases or uncertain
outcomes exist. Preserve history; reconcile and forward-repair.

## Remaining work before F09 release/closure

1. Full-schema replay, actual PostgREST/RLS tests and Deno Edge Function type/runtime
   checks; independent browser journeys against an isolated application stack.
2. F06 provider governance: transactional provider rate/daily limits, approved
   provider priority/default handling and operational health/ownership inventory.
   **Configured provider quotas are not yet enforced by this increment. Do not
   enable production delivery before that gate is implemented and tested.**
3. F08 verified confidential attachments/content, secure large-file delivery and
   report/template/recipient-policy acceptance. Current DMS generic notices must
   be reviewed as an intentional release behavior, not passed off as full content
   delivery.
4. F05 integration of queued/accepted/retry/unknown statuses, filters/counts,
   reconciliation controls, audited recovery and settings/form contracts. Resolve
   only the small explicitly listed UI-file overlaps when merging branches.
5. Production trigger/credential-presence/heartbeat inventory and an approved
   legacy backlog disposition. No bulk unpause or AI-job backlog replay.
6. Reviewed publication/merge/deployment authorization, controlled unattended
   canary and recipient confirmation, monitoring and rollback acceptance.

These remaining gates prevent full F09 closure; they do not undo the implemented
consumer consolidation, authorization enforcement and queued report-delivery work.

## Reproduce locally

```powershell
node node_modules/vitest/vitest.mjs run --config tests/remediation/f09/vitest.config.mts
node tests/remediation/f09/db-test.mjs
node tests/remediation/f09/adapters-db-test.mjs
npm run typecheck
$env:NODE_OPTIONS='--no-experimental-webstorage'
node node_modules/vitest/vitest.mjs run --config tests/remediation/vitest.config.mts
$env:NODE_OPTIONS='--use-system-ca --max-old-space-size=16384'
node node_modules/next/dist/bin/next build --webpack
```

The database scripts enforce their exact container/network/database boundaries.
The integration script replaces only its named disposable component schema.
No credentials, production records or generated confidential reports belong in
this implementation record or in a public commit.
