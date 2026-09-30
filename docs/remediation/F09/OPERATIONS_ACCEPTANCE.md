# F09 — Operational safeguards and queue acceptance

30 September 2026. Isolated branch: `codex/f09-backend-foundation`.

**Local changes verified. F09 is NOT fully closed, published, deployed or enabled.**
This checkpoint follows READINESS_REVIEW.md. It does not authorize changing the
production ERP, another application's data, the F05 checkout, provider settings,
cron ownership, or real recipients. The personal notification bell is F10.

## Implemented in this checkpoint

1. Every queue claim, provider admission, outcome persistence and lease-recovery
   RPC has a five-second caller deadline and passes abort to PostgREST. A lost
   response is never retried inside that operation. If an admission/commit may
   have succeeded, the worker stops; durable leases/history govern recovery.
2. Schedule production has a shared 15-second deadline. A late reservation
   response cannot continue to enqueue or send after that deadline. Already
   committed reservations remain durable and are reconciled on a later run.
3. Machine request bodies are limited to 2,048 actual UTF-8 bytes and five
   seconds, including chunked or stalled bodies. Malformed/oversized input
   returns a safe 400 response before processing. Paused workers do no work.
4. Queue readiness is available through authenticated GET on the existing
   machine endpoint. It only reads aggregate counts, oldest-due time, latest
   attempt time and non-secret provider configuration. It never claims, reaps,
   renders, sends, decrypts a credential or changes a row.
5. The queue list now performs server-side filtering, sorting, pagination and
   exact counts. It is no longer restricted to an initial 200 rows. Session RLS
   and global queue-view authority remain mandatory. List projection excludes
   message bodies and template variables. Failure is not shown as an empty
   successful queue. Search covers literal subject/queue-code text and exact ID.
6. Stale list responses cannot overwrite newer results. Row/process controls are
   disabled during loading or read failure. Paging controls are genuinely
   disabled while busy, fixing a real-browser lost-click race discovered here.
   The test-email form stays mounted during refresh, preserving in-memory input.
7. Rapid process clicks are guarded. A lost process response reports delivery
   uncertainty and refreshes; it never automatically runs processing again.
   Pending counts explicitly include paused/future items, not just eligible mail.
8. The GitHub workflow now explicitly runs F09's offline regression suite.
   Adding the workflow step is not evidence that GitHub has run or passed it.

## Runtime budget contract

| Operation | Bound |
|---|---:|
| Request body | 5 seconds / 2,048 bytes |
| Each claim, admission, completion or reaper RPC | 5 seconds |
| Source/output/provider preparation | 15 seconds |
| Provider dispatch | 20 seconds |
| New-item start window, after lease recovery | 20 seconds |
| Queue batch envelope, including its last item | Less than 75 seconds |
| Schedule production, before shared queue processing | 15 seconds |
| Schedule route envelope, including input | Less than 95 seconds |
| Required caller/host request budget | At least 120 seconds |

The Edge follow-on HTTP timeout is now 120 seconds in source. The production
pg_net caller and hosting configuration have NOT been changed. Configure and
verify both at the approved cutover; do not rely on the observed five-second
pg_net default. The existing 120-second database lease exceeds a single item's
50-second normal envelope. Event-loop stalls, termination and network uncertainty
still require durable lease recovery; an abort never proves remote rollback.

## No-work readiness semantics

GET `/api/internal/process-email-queue` requires the queue machine credential,
not a browser session. Credentials are never returned or logged. Responses use
`Cache-Control: no-store`.

- `paused` (200): database reads worked; worker flag is off. Configuration issues
  are still listed. It is not a delivery-readiness success.
- `unready` (503): enabled but no/default-ambiguous/unsupported provider, excessive
  inventory, or missing/invalid finite budgets. Fix through the approved provider
  configuration process; do not silently invent quotas.
- `attention` (200): configuration checks passed but unknown outcomes or expired
  leases require intervention. Monitoring must inspect the body, not just HTTP.
- `ready` (200): these limited reads/checks passed. This does NOT certify secrets,
  provider connectivity, scheduler heartbeat, full migration parity or receipt.
- `unavailable` (503): read/transport failed; no zero-backlog inference is valid.

`lastAttemptEventAt` is activity, not a heartbeat: an idle healthy worker may have
no recent attempt. Separate scheduler/HTTP observation and a named alert owner
are still required. The readiness check enforces a release guard; it does not
retroactively change the admission RPC's existing null-as-unlimited semantics.
Provider budgets are still per configuration, not a shared-mailbox guarantee.

## Local evidence

| Check | Result |
|---|---|
| F09 offline worker, security, failure and UI suite | 180 passed |
| Existing remediation suite | 545 passed |
| Existing application unit suite | 464 passed |
| Real local Auth/API/RLS, scope and queue paging suite | 29 passed |
| Isolated DB concurrency/atomicity/admission scenarios | 23 foundation + 14 adapters + 11 quotas passed |
| Actual Deno handler no-work/auth tests | 6 passed; Deno type check passed |
| Independent real-Chrome queue journeys | 9 passed; zero observed page errors |
| Shipping TypeScript and e2e TypeScript | Passed |
| Final production webpack build | Passed |
| Dependency audit | 0 vulnerabilities reported |
| Existing e2e test discovery | 16 collected; collection is NOT execution |
| Full lint gate | Passed: 0 errors, 139 previously baselined warnings, no new warnings |

Do not sum these into a unique-test total: suites overlap. Browser checks include
independent operator/scoped sessions, counts above 200, full search, last/first
page, exact subject match and no process control on paused rows. The first browser
run failed on busy-state navigation; the fix and two subsequent passing runs are
retained in private evidence. These are F09-baseline functional checks, not final
F05 design/mobile/accessibility acceptance.

Build/tooling emitted existing webpack large-cache-string and Node/Vite
deprecation advisories. These are recorded, not counted as application failures
or hidden by suppressing the lint baseline. Validation ran on local Node 26;
the existing CI's pinned Node 22/image checks still have to run after publication.

Each large-list run creates exactly 225 synthetic local rows, records their IDs
and marker before testing, then deletes only that exact intersection. No live
records or users are deleted. All provider results in DB scenarios are simulated;
no real messages are sent. Screenshots/runtime fixtures stay out of public Git.

Numbered-page compatibility is retained for F05 integration. Queries have bounded
page sizes, stable ID tie-breaks and deadlines. This is not a high-volume benchmark
or a transactionally consistent snapshot across concurrent count queries. Cursor
pagination/index tuning for materially larger backlogs remains F07/F05 acceptance.

## Exact remaining closure gates

| Gate | Owner / required evidence |
|---|---|
| Final queue/schedule screens | F05 UI-03: adopt these contracts, permission-filtered company selection, action/nav visibility, global validation, schedule-create idempotency/client edit-version UX, accessible/mobile journeys |
| Operator delivery review | F05/F09 operations: attempt/correlation history presentation, audited unknown-outcome reconciliation and named operator; never a generic resend button |
| Provider governance | F06/owner: finite per-configuration limits, shared-sender/direct-path allocation (including auth email), credential lifecycle and monitoring owner |
| Report contents | F08: supported registry/template/brand/recipient/output acceptance and confidential/large attachment path; unsupported overdue schedule remains held |
| Runtime cutover | Approved one processing owner, caller/host deadline alignment, old-consumer pause, exact migration/app/Edge match, backup/drift check and rollback rehearsal |
| Publication | Explicit reviewed public-source manifest approval, then F09 GitHub checks |
| Integrated release | Merge candidate with completed cross-phase work, repeat acceptance, separately approve production window and one-recipient browser-closed receipt canary |

The approved backlog policy remains `skip-missed-after-current`: skip missed
dates and allow at most one current report after authorized activation. This
policy has not been applied live and never overrides report eligibility.

Safe next step is publication review and cross-phase acceptance, not enabling
workers. Keep all F09 activation/UI flags off until their specific gates pass.
