# F10 notification release and operations

This release separates durable event capture, recipient qualification, personal
notification delivery, and F09 email dispatch. An email intent or HTTP 200 is not
proof of inbox receipt. Manual visual, keyboard, contrast, zoom and Android
acceptance remains owner-deferred, not passed. No F11 identity rollout is included.

## Safety and compatibility

- Preserve existing OCR, compact related lists, F03 scopes, F04 drafts/privacy,
  F06 authority, F07 lifecycle/legacy-restore restrictions and F08 wording gates.
- HR recipients use stored employee/account and direct-manager/reviewer links.
  Missing or ambiguous links hold the event; never guess identities or grant roles.
  HR events are in-app-only by default. The approved HR expiry cadence is
  90/60/30/14/7/1/0 days before expiry and one overdue event per date cycle.
- Stored employee-photo attachments require current employee access; medical
  leave certificates additionally require medical access. The prospective
  notification checks and authoritative file/document gate share those rules;
  ordinary DMS access alone is insufficient. No role or employee mapping is added.
- In-app-only events do not require an email provider. F09 remains the only
  email sender and retains its quotas, immutable intents and uncertain-outcome
  safeguards. Existing legacy messages are not replayed or backfilled.
- Candidate discovery is frozen, qualification commits per candidate, and
  delivery rechecks current permissions. A normal bounded yield does not consume
  a failure retry. Revocation can shrink deliveries, never silently enlarge them.
  More than 20,000 discovered candidates or 5,000 eligible recipients is an
  explicit capacity-review hold, not partial successful delivery.
- Opening the bell changes nothing. An individual notification becomes read
  after its exact currently authorized destination loads successfully. Explicit
  bulk read, dismiss and archive remain separate personal actions, not approvals.

## Required release sequence

1. Verify the reviewed immutable source, required hosted checks, current main,
   backup/recovery readiness, migration history, matching runtime secrets and
   disabled automatic repository deployment trigger. Record all identities.
2. Use the approved ERP maintenance procedure. Record and pause only the ERP
   expiry producer and delivery scheduler as needed for the compatible cutover.
   Do not alter another application's jobs, tables, Auth settings or providers.
3. Reconcile and apply only the pending F10 migrations in timestamp order. Do
   not replay older migration history. Their capture triggers affect future
   committed events only. Dispatch control starts disabled; schema replay does
   not create or activate a scheduler job.
4. Deploy the matching application and DMS expiry Edge producer. The Node flags
   are `F10_NOTIFICATIONS_ENABLED` and `F10_HR_EXPIRY_ENABLED`; the Edge flag is
   `F10_DURABLE_NOTIFICATIONS`. Keep them paused until schema/runtime/secret
   compatibility is verified. Keep the legacy Edge direct-send/follow-on path
   disabled. Preserve every unrelated runtime variable.
5. After the technical gates pass, install the paused job using
   `tooling/release/f10-install-paused-worker.sql`. Reconcile an existing same-name
   job instead of creating a duplicate or modifying an unknown job.
6. Verify the authenticated `/api/internal/process-notification-events` route.
   GET is no-work configuration information, **not** a database-health check.
   POST accepts only an empty object and requires the existing machine secret.
   It admits notifications only; it does not send email. Its processing deadline
   remains 15 seconds, with a 30-second caller timeout; do not inflate a timeout
   to conceal a failed authority query.
7. Only after matching Node/Edge flags and secret parity are confirmed, enable
   the private dispatch control and the exact reviewed new job under an explicit
   release-intent receipt. The job runs once a minute; restore only the prior
   reviewed ERP jobs. Record exact job IDs, command hashes and resulting flags.
8. Observe the actual scheduler request, HTTP outcome, event/recipient receipts,
   authenticated worker information and logs without browser control or real
   email canaries. `/api/health/release` is liveness-only, not database or
   functional readiness; corroborate it with the actual schema/receipt checks.
   Restore normal ERP availability only after postflight passes. Record any
   incomplete, held, failed or uncertain work honestly.

These instructions are a gated procedure, not evidence that a release occurred.
Never activate workers, apply production migrations or run an old release script
merely because a build or a subset of tests passed.

## Recovery and observability

Global notification operations authority can inspect held event progress and
request an optimistic-revision/operation-ID recheck from the existing recovery
panel. Ordinary or company-scoped notification management does not grant this
global recovery authority. Repeating the original recovery operation reconciles
its receipt; it does not reset an accepted email or broaden a frozen roster.

Allowlisted held reasons distinguish unresolved employee links, ambiguous
recruitment links, capacity review, no currently eligible recipient, unfinished
recipient/channel work, and unconfirmed authority/storage outcomes. Never place
names, medical/salary data, raw errors or credentials in those reasons.

The authorized `f10_inspect_notification_dispatch()` operation returns bounded,
sanitized request observations. `queued_outcome_unconfirmed`,
`http_outcome_unconfirmed`, `http_failed`, and
`http_accepted_event_outcomes_separate` deliberately distinguish transport from
business completion. It exposes no secret, header or response body. A missing
retained HTTP response is unconfirmed, not success.

For an incident, first pause the exact F10 job and private dispatch control, then
the matching feature flags if needed. Keep event/recipient/queue identities and
uncertain receipts. Use reviewed forward repair or the verified compatible
recovery procedure; never drop the durable tables or resend an uncertain intent.
The only automatic cleanup is bounded expired open-capability tickets, not
business history, notifications, source documents or retention/legal-hold data.

## Owner acceptance after release

Check workspace restoration, unsaved drafts and account-switch privacy; exact
notification targets and read state; report/employee selectors; light/dark
appearance; keyboard operation, colour/contrast, zoom and Android touch/keyboard.
Record each actual outcome. No browser automation or screen-reader testing is
authorized or claimed by this release.
