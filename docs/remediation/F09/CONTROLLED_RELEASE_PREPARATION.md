# F09 controlled release preparation

Date: 30 September 2026. Status: **NOT AUTHORIZED FOR ACTIVATION / NOT DEPLOYED**.
Latest checkpoint: [compatibility and read-only production review](READINESS_REVIEW.md).
That follow-up obtained live ERP metadata without changing production. The
inventory/preparation gates below are updated; activation gates remain open.
Local follow-up implementation is described in FOLLOWUP_VERIFICATION.md.
The initial implementation run did not query production. The later readiness
review was read-only. Neither published Git changes, merged, changed production,
configured cron or sent real email. F09 is not closed.

## Release gates and evidence still required

| Gate | Current state | Closure evidence |
|---|---|---|
| Provider quota/concurrency code | Locally implemented/tested | Agree rolling-window semantics and budgets for direct bypass paths with F06 |
| Full schema/Auth/API/RLS | Local tests passed | Repeat against final merged candidate and check live schema drift read-only |
| Browser queue/schedule journeys | Local synthetic journeys passed with noted UI gaps | F05 integration acceptance, including scoped company selection |
| Deno | Type and six actual-handler health/auth tests passed | Real Edge runtime deployment and no-work readiness under release approval |
| Verified report delivery | Analytical adapter tested with mocks | F08 template/provenance/recipient and real final-output acceptance |
| Live trigger/host/provider inventory | READ-ONLY SNAPSHOT CAPTURED | Runtime owner, finite shared-provider budgets, explicit request deadlines and secret lifecycle approval still required |
| Existing backlog disposition | INVENTORIED; CATCH-UP POLICY APPROVED; CUTOVER RECHECK REQUIRED | Preserve terminal history; hold unsupported overdue schedule; owner chose skip-missed-after-current; no bulk unpause |
| Public publication / GitHub CI | NOT PERFORMED | Reviewed source-only manifest and explicit public-repository approval |
| Merge / deployment / live canary | NOT PERFORMED | Separate approval, migration/app match, one-recipient controlled receipt |
| Ongoing monitoring | NOT STARTED | Agreed owner, alerts, reconciliation and rollback drill |

The initial implementation run had no connected cloud-specific tools. The later
readiness review used existing authenticated CLIs, restricted to the ERP project,
to verify deployment, migration history, backup, provider-reference and worker
metadata. Source-only claims have not been substituted for live receipt,
restoration, complete schema-equivalence or final integrated acceptance.

## Read-only inventory to gather first

Limit all future database work to the authorized ERP project
`mmiefuieduzdiiwnqpie`. Do not inspect or change another application.

1. Confirm branch/commit, current production schema/migration history, backups and
   recoverability. Compare this candidate to the actual deployed version.
2. Identify every trigger for the global email queue, report scheduler and DMS
   expiry producer: Railway jobs, Supabase Edge schedules, pg_cron and any other
   operator job. Inspect configuration through its authorized owner. Do not
   print URLs containing credentials, command bodies, tokens or secret values.
3. Record only credential presence/reference validity, expiration/rotation owner,
   provider type, enabled/default ambiguity, and quota values. Verify mail domain
   and recipient policy through F06, without sending.
4. Record sanitized queue counts by source/state/age and schedule/run counts.
   Count overdue work and unresolved dispatched/legacy outcomes separately.
5. Check host/request time limits against a batch's start budget plus final
   preparation/send deadline and report reservation/render time. Check clock,
   timezone and missed-run policy.
6. Verify who owns alerts, provider tracing and reconciliation; readiness/health
   does not certify inbox delivery.

Use READ_ONLY_RELEASE_CHECKS.sql as the aggregate-only checklist. Some sections
are post-migration only and clearly labelled. Review output privately; do not put
production counts or identifiers in the public repository.

## Matching migration/application set

Apply in order only within an approved controlled window:

1. 20260930095218_f09_email_queue_leases.sql
2. 20260930100400_f09_atomic_schedule_slot.sql
3. 20260930102553_f09_delivery_adapter_integration.sql
4. 20260930111612_f09_provider_admission.sql
5. 20260930115829_f09_schedule_scope_boundary.sql

The fourth migration deliberately disables the old three-argument dispatch gate.
A mismatched old worker must fail closed, not bypass provider admission.
The fifth replaces broad schedule RLS and protects identity/outcome columns.
Deploy matching actions at the same cutover. Inspect existing column grants and
policies for drift first; local replay is not proof of an unchanged live schema.

## Legacy backlog classification — no implicit replay

- Provider accepted/sent history: preserve; never resend to obtain new evidence.
- Dispatched but uncertain, or timeout/history-loss after dispatch: hold and
  reconcile via provider trace. No automatic retry.
- Old pending/processing/failed rows: held by the integration migration. Review
  exact IDs, source validity, recipient authority, age and business value.
- Stale schedules: owner approved skip-missed-after-current on 30 September
  2026: skip missed dates and allow at most one current report after approved
  activation. Keep unsupported schedules held until F08 eligibility acceptance.
  The policy decision did not change live schedules or enable a worker.
- Cancelled/deleted/exhausted/permanent items: terminal, not a retry backlog.
- AI jobs: separate system. Do not replay or activate them in this release.
- Any approved replacement request must have a new deliberate identity and an
  audit trail referring to the reviewed old item, not a bulk status reset.

## Controlled rollout sequence

1. Review all gates above and the F05/F06/F08 handoff. Obtain publication approval
   for a source-only manifest; exclude private evidence, fixture credentials,
   local runtime files, schema archives and production data.
2. Publish the isolated candidate only after approval; run GitHub checks.
   Publication alone does not authorize merge or deployment.
3. Reconcile with current main/F05 in a reviewed integration branch and rerun the
   full acceptance set. Obtain separate merge/deployment approval.
4. In the approved window, pause old consumers first; retain queue/history rows.
   Apply reviewed additive migrations and matching app/Edge code. Keep every
   new worker/trigger off. Check platform health, RLS and login/readiness.
5. Set only the reviewed trigger owner and secrets. Exact flags:
   F09_EMAIL_WORKER_ENABLED=false, OUTPUT_SCHEDULES_WORKER_ENABLED=false and
   F09_EMAIL_TRIGGER_ENABLED=false until canary approval.
   F09_SCHEDULE_CATCHUP_POLICY requires an explicit approved supported value.
   Do not enable OUTPUT_SCHEDULES_UI_ENABLED until the scoped form gaps close.
6. Rehearse no-work authenticated health. Verify bad credentials fail and health
   does not claim a row. Verify old consumers are actually stopped.
7. Authorize one synthetic recipient/source/intent and enable only the intended
   test path. Leave the browser closed for automatic processing. Verify one
   claim, one admission, durable outcome/history, and ask the recipient about
   actual receipt. A provider 202 alone is not acceptance of this gate.
8. Watch due/overdue depth, oldest age, lease expiry, quota wait, retry count,
   unknown outcomes, disabled/provider failures and heartbeat. Require a named
   operator to review every unknown outcome before expanding activation.
9. Save commit, migration fingerprints, configuration-presence evidence, canary
   result, scope decisions and monitoring sign-off in private audit results.

## Stop/rollback rules

Immediately pause workers/triggers for duplicate sends, unexpected recipient,
authorization failure, stale worker activity, growing unknown outcomes or missing
heartbeat/history. Do not delete attempts, downgrade the schema or restart legacy
unfenced senders. First determine any in-flight dispatch outcome. Preserve paused
intents/history and forward-repair. The additive data structures may remain while
processing is disabled. Restore a backup only in a separately approved recovery
procedure; this document does not authorize production restoration.

## Not a full closure claim

Production credentials/trigger ownership/backlog disposition, cross-phase UI and
verified content, provider delivery and inbox canary, GitHub checks and deployment
are open. Local passing tests reduce implementation risk; they do not close
those operational acceptance gates.
