# F09 — Five-point follow-up verification

Date: 30 September 2026. Branch: `codex/f09-backend-foundation`.
Checkout: `C:\dev\agt-erp-f09`. Starting checkpoint: `496a3149e`.

**Local implementation and release preparation completed; production release and
full F09 closure remain gated.** No production database changes, real email,
GitHub publication, merge or cloud-worker activation occurred in this run.
The F05 application's checkout was not edited.

## Outcome against the requested five points

| Point | Delivered here | Still required before production closure |
|---|---|---|
| 1. Provider limits | Atomic per-provider rolling-minute/24-hour admission, configuration snapshot fence, provider-wide retry cooldown, quota deferral without consuming a send attempt | F06 approval of limit meaning and direct-send budget sharing |
| 2. Full integration tests | Schema-only replay with actual local Auth, PostgREST, RLS and server actions; independent role sessions; actual Deno auth/health handler execution | Repeat final merged candidate, live schema-drift checks and deployed Edge acceptance |
| 3. Browser journeys | Queue, paused processing, cancellation, retry eligibility, truthful simulated states, schedule run/create/edit and scoped denial/list visibility | F05 shared form/list adoption and operational reconciliation UI |
| 4. Cross-phase coordination | Detailed F05/F06/F08 ownership, interfaces, overlapping files and acceptance handoff saved | Other phase adoption/review; no other chat was messaged or modified |
| 5. Release preparation | Aggregate-only read-only inventory SQL, five-migration order, flags, backlog classification, canary/monitoring and rollback checklist | Actual production inventory, backlog decisions and separate publication/deployment approval |

See [integration handoff](INTEGRATION_HANDOFF.md) and
[release preparation](CONTROLLED_RELEASE_PREPARATION.md).

## Additional defects found and corrected

1. Schedule list/get/create/update/delete used privileged queries with broad
   permission checks. Scoped grants could become all-company access. CRUD now
   runs through user-session RLS, current company permissions and protected
   identity/outcome columns. Owner status alone is insufficient after revocation.
2. Non-calendar schedule edits recalculated next_run_at, silently skipping or
   moving a due slot. The pointer now changes only for an actual calendar change.
3. Edited database time HH:mm:ss did not satisfy the form's HH:mm validation.
   Edit initialization now normalizes it.
4. Schedule codes based on milliseconds could collide. New codes use UUIDs.
5. Recipient updates allowed empty recipients and had no combined cap. Actions
   require at least one To address and no more than 100 combined To/CC addresses.
6. Queue wording could claim email was sent after a paused result. Status/action
   feedback now distinguishes queued, paused, accepted, retry, capacity and unknown.
7. Confirmed retryable rejection left a historical dispatch timestamp that
   unnecessarily prevented cancelling its future retry. The safe pending-retry
   case now permits cancellation; active/uncertain dispatches still refuse it.
8. UI test-email controls now require management authority as well as the panel's
   processing authority. Source permission checks remain authoritative.
9. Schedule action response-loss errors now preserve a request key and explain
   uncertainty rather than leaving an unhandled failure.

These are local candidate fixes, not claims about the currently deployed ERP.

## Automated results

| Verification | Result |
|---|---|
| F09 offline unit/adapter/UI-state suite | PASS: 134 tests / 11 files |
| Earlier offline remediation suites | PASS: 545 tests / 59 files |
| PostgreSQL foundation concurrency/fencing | PASS: 23 scenarios |
| PostgreSQL adapter integration | PASS: 14 scenarios |
| Provider quota/admission/cancellation | PASS: 11 scenarios |
| Full-schema Auth/PostgREST/RLS/server actions | PASS: 15 tests / 2 files |
| Deno actual-handler auth/no-work health | PASS: 6 tests |
| Shipping TypeScript, npm run typecheck | PASS |
| Targeted ESLint, including all F09 helper files | PASS: zero warnings |
| Production-mode Next.js webpack build | PASS |
| Deno check of the Edge entrypoint | PASS |
| Read-only release SQL against local schema | PASS |
| Local security advisor | 26 WARN, zero ERROR; no finding names the new F09 objects |
| New public F09 RPC browser execution grants | Zero for anon/authenticated |
| Diff whitespace check | PASS |

Total **748 passing automated cases/scenarios**, not 748 end-user journeys.
The broad root `tsc --noEmit` command was also tried and failed on the mixed
Node/Deno/test tree, including test typing. The repository's supported shipping
typecheck and production build both passed. Test execution is not a claim that
every test file passes that broader compiler configuration.

Non-fatal Node module.register deprecation and webpack large-cache-string warnings
remain. The build used the OS trusted CA store, not a TLS-validation bypass.

### Provider tests of particular importance

Twelve concurrent admissions with capacity two allowed exactly two and deferred
ten. Rolling-day exhaustion, aged capacity, changed/disabled provider config,
nonpositive limits, lost fences, repeated dispatch, final-attempt throttling and
provider-wide cooldown were exercised. Deferred claims refund only their own
attempt; they cannot reset earlier attempts. An uncertain result is not resent.

### Full database test boundary

A fingerprinted private F02 schema-only archive was restored into a separate
local Supabase stack, followed by F03/F04 prerequisites and all five F09 migrations.
It included 283 public tables and initially 939 public policies before the final
schedule-policy replacement. No production/business rows or provider secrets were
copied. The schema's unrelated objects were not used as test targets.

Actual local Auth and HTTP Data API sessions exercised global queue operator,
company-scoped operator and no-role behavior. Global here means a deliberately
global custom capability, not granting Global Admin. Tests covered real RLS,
direct API forgery, replay deduplication, revoked assignments, branch-only denial,
company reassignment, metadata protection and durable outcomes.

The component Postgres container has network mode none. The full Auth/API stack
uses loopback-published ports on a normal Docker bridge, **not egress isolation**.
It had no real provider credentials; synthetic addresses use example.invalid,
mail delivery was disabled, and no live transport was called.

Setup issues encountered and corrected: initial Docker binding behavior,
local Auth email-provider enablement, missing RLS flags in the schema archive
selector, incorrect plural permission codes in the synthetic seed, and the
catalog's intentionally global read boundary. These were fixture/setup issues
or implementation discoveries, not waived production checks.

## Browser evidence

Chrome used only the isolated app at 127.0.0.1:16509. Production and the user's
other development tab were not controlled.

| Journey | Observed result |
|---|---|
| Synthetic operator login | PASS |
| Queue a test message | One pending row, not sent |
| Process with worker disabled | Explicit paused/no messages sent result |
| Cancel that pending message | Cancelled, attempts unchanged |
| Simulated provider acceptance | Provider accepted, no terminal resend control |
| Simulated retry | Eligibility confirmation preserves cooldown and attempts |
| Simulated unknown | Review-required label, no send/retry buttons |
| Simulated quota wait | Capacity label, refunded claim attempt |
| Report Run Now | Queued confirmation, no claim of delivery |
| New recurring schedule | Created through browser |
| Edit recurring schedule | Saved through browser |
| Scoped user opens global queue URL | Access Denied |
| Scoped schedule list | No global or other-company rows |
| Observed queue/schedule console logs | No captured errors/warnings in sampled checks |

Screenshots and the credential-free synthetic record inventory are in the
owner's private audit folder `IMPLEMENTATION/F09`. Outcome fixtures simulate
provider acceptance/rejection/uncertainty; they do not prove Graph delivery.
No real PDF attachment generation, remote Edge run or inbox receipt was performed
in this follow-up. Those remain F08/controlled-live-canary acceptance.

The inherited sidebar still advertises the denied queue link to a scoped role.
Schedule company selection, action visibility, pagination/counts and shared form
idempotency/conflict UX remain explicit F05 handoff work; security fails closed
in the meantime. Local browser UI passing is not a claim these gaps are resolved.

## Evidence and isolation

- Component: algt-f09-synthetic, databases f09_synthetic and f09_integration.
  Successful component tests clean their synthetic rows.
- Full stack: algt-f09-local, API 16521, DB 16522, mail UI 16524 and SMTP 16525,
  all published to 127.0.0.1. App port 16509.
- At evidence capture: 25 queue records, 17 schedules and 3 synthetic Auth users.
  All are local-only and tracked in the private inventory; repeated test passes
  intentionally retain separate run evidence.
- Local account passwords/keys/config and development traces are ignored private
  runtime files, never public source artifacts. Next development tracing can
  include action arguments; the helper now keeps those logs private.
- Test services are stopped at handoff, with disposable volumes retained for
  diagnosis/retest. No production cleanup is required.

## Repeatable checks

Use the isolated checkout. The full rehearsal requires its approved private
schema baseline and a verified separate local stack, not a cloud project.

```powershell
npm run typecheck
$env:NODE_OPTIONS='--no-experimental-webstorage'
node node_modules/vitest/vitest.mjs run --config tests/remediation/f09/vitest.config.mts
node node_modules/vitest/vitest.mjs run --config tests/remediation/vitest.config.mts
node tests/remediation/f09/db-test.mjs
node tests/remediation/f09/provider-db-test.mjs
node node_modules/vitest/vitest.mjs run --config tests/remediation/f09/full.config.mts
$env:NODE_OPTIONS='--use-system-ca --max-old-space-size=16384'
node node_modules/next/dist/bin/next build --webpack
$env:npm_config_cache='C:\dev\.cache\npm'
$env:DENO_DIR='C:\dev\.cache\deno'
$env:DENO_TLS_CA_STORE='system,mozilla'
npm exec --yes --package=deno@2.9.6 -- deno check --no-lock supabase/functions/dms-expiry-scheduler/index.ts
npm exec --yes --package=deno@2.9.6 -- deno test --no-lock --allow-env=SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,DMS_SCHEDULER_SECRET,APP_URL,INTERNAL_API_SECRET tests/remediation/f09/edge-runtime.deno.mts
```

The database helpers enforce exact local container/port/root identities.
full-db restore requires an empty public schema and a fingerprint match; it is
not a general production migration tool. Rebind helper operations are restricted
to stopped F09-labelled local containers and retain their existing volumes.

## Closure decision

Do not mark F09 complete or enable production workers yet. Finish the named
cross-phase acceptance and operational gates in the release document. Seek
publication approval with the reviewed public-source manifest, then GitHub checks,
integration/retest and separately approved controlled activation.
