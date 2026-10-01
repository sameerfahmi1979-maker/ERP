# F09 — Compatibility and production-readiness review

Date: 30 September 2026. Application candidate: `fb14db23e`.
Historical snapshot. Later local changes and tests are recorded in
[OPERATIONS_ACCEPTANCE.md](OPERATIONS_ACCEPTANCE.md); they do not update this
snapshot's production inventory or turn it into deployment acceptance.
Status: **Readiness review completed; integrated acceptance and release remain open.**

This follow-up inspected source compatibility and the authorized ERP project's
live metadata through existing CLI sign-ins. It did not publish, merge, deploy,
apply migrations, change configuration, invoke a worker, send email or edit F05.
Sanitized operational evidence is retained privately, not in this repository.

## Verified scope

- Remote main still matches the F09 branch baseline. Main CI succeeded; F09 has
  no remote branch yet. This does not substitute for F09 GitHub checks.
- The current production deployment/image and ordered migration history match
  the prior F04 release receipts. None of the five F09 migrations/routines is
  deployed. This is bounded lineage/metadata evidence, not a complete live
  schema-equivalence or post-release authorization test.
- Completed managed backups exist. No restoration was performed or certified.
- The ERP login and liveness endpoint respond successfully. Existing worker HTTP
  requests have successful responses in the bounded observation window; provider
  acceptance and actual receipt require separate evidence.
- Provider references exist in Vault metadata. No secret was decrypted, rotated,
  printed or tested against a provider. Expiry/rotation ownership remains open.
- The current queue backlog and active report schedules were classified without
  reading message bodies or recipient addresses. Recheck immediately at cutover.

## F05: no direct conflict is not integration acceptance

The current working snapshot has no direct changed-file or migration-name
collision with F09. However, shared tables, pagination, sorting, comboboxes,
dialog forms, workspace validation, sidebar and dependencies have changed in
F05. F05's UI-03 delivery/reporting/notifications adoption has not been accepted.

Do not overwrite those shared components with the F09 baseline. Apply the
[handoff contract](INTEGRATION_HANDOFF.md) in F05 UI-03, then test the combined
candidate. In particular:

1. Use permission-filtered company selection; never omit company for a scoped
   actor and silently create a global schedule.
2. Preserve server RLS, source revalidation and queue action authority. Hide
   misleading forbidden controls/navigation as well as rejecting server calls.
3. Preserve provider-accepted versus delivered wording and prohibit automatic
   unknown-outcome resend. Retain cancellation, cooldown and attempt budgets.
4. Adopt the shared validation summary, columns/filters/search, version/conflict
   and response-loss behavior; do not store message contents in browser drafts.
5. Verify server pagination/backlog counts, timezone/capacity reasons, keyboard,
   mobile and restricted actor journeys. No cross-phase acceptance is implied.

## F06: provider and direct-send acceptance

Source inventory confirms these paths remain outside F09 provider counters:

| Path | Source | Required treatment |
|---|---|---|
| Provider test | `src/server/actions/settings/email-settings.ts` | Budget and audit deliberate tests; preserve restricted authority |
| Legacy export mail | `src/server/actions/email.ts` | Keep F03 global-authority containment; F08 replaces unverified browser content |
| Invitations/recovery/security notices | `src/lib/auth/security-email.ts` | Preserve F03 branding, expiry and security journal; do not persist tokens to the generic queue |

The new counters are per provider configuration and count dispatch attempts,
not recipient volume or a shared mailbox total. Production provider settings do
not yet establish an approved finite budget. Multiple configurations for the
same sender need a shared-budget decision. Do not invent limits or reroute
authentication delivery during release preparation.

F06 must approve limits/semantics, direct-path allocation, credential lifecycle
owner and health/cooldown monitoring before enabling queued sending broadly.

## F08: hold unsupported legacy schedules

The inventory found an active overdue schedule whose registry entry does not
currently support scheduling. It must not be treated as deliverable merely
because it is active or has a supported document class. No explicit template
selection is not itself proof that template resolution will fail, but approved
branding/output provenance is still required. Hold that schedule out of the
initial rollout until F08 approves the report, template and recipients.

The owner approved **skip missed dates; at most one current report after
activation** on 30 September 2026. This maps to
`F09_SCHEDULE_CATCHUP_POLICY=skip-missed-after-current` for the later approved
release. The decision was recorded only; no live setting or schedule changed.
It does not authorize an unsupported report, an immediate send or production
activation. Review report/template/recipient eligibility before activating it.

## Operational acceptance still required

- **Transport deadlines:** existing ERP cron commands do not specify a named
  HTTP timeout. The installed pg_net HTTP default is five seconds. Verify the
  full invocation/default behavior and explicitly budget the cutover trigger's
  request timeout for preparation, dispatch, final persistence and database
  latency. The worker's 25-second batch-start budget plus a final 15-second
  preparation and 20-second send is not a guaranteed 25-second total. The
  Edge follow-on request also needs timeout alignment. Never resolve timeout
  uncertainty by automatically replaying an unconfirmed send.
- **Single processing owner:** inventory identifies existing ERP DMS production
  and queue polling. Choose the authoritative trigger; pause legacy consumers
  during cutover. A successful cron SQL submission alone does not prove the
  asynchronous HTTP request or an email succeeded.
- **Configuration:** email queue requests use `INTERNAL_API_SECRET`; report
  scheduler requests use `WORKER_SECRET`; DMS Edge requests use
  `DMS_SCHEDULER_SECRET` and `x-dms-scheduler-secret`. These are separate gates.
  `APP_URL` is the Edge target override, not `INTERNAL_SITE_URL`. Check presence
  and valid lengths, agreement across intended callers and owner/rotation
  records without publishing values.
- **Default off:** keep `F09_EMAIL_WORKER_ENABLED`,
  `OUTPUT_SCHEDULES_WORKER_ENABLED`, `F09_EMAIL_TRIGGER_ENABLED` and
  `OUTPUT_SCHEDULES_UI_ENABLED` off until their respective acceptance gates.
  Absent new flags fail closed in F09; they do not stop the currently deployed
  legacy implementation before cutover.
- **Backup/rollback:** repeat backup freshness and migration-drift checks in the
  approved window. Restore validation is still separate, isolated-environment
  work; do not restore production as a test.
- **Observability:** name the reconciliation owner, alert thresholds and incident
  procedure. Treat liveness, cron success, provider acceptance and mailbox
  receipt as different facts. Unknown outcomes require review, not resend.

## What can and cannot be closed

The compatibility inventory and read-only production inventory are delivered.
Thirty-three offline evidence-consistency checks passed. These are not extra
application functional tests and do not add to the previous 748-case suite.
No application source changed in this follow-up; no final merged test was run.

Continue with F05 UI-03 adoption and the F06/F08 acceptance decisions above.
Then review a source-only publication manifest, obtain publication approval,
run F09 GitHub checks, integrate and retest the final branch. Merge/deployment,
maintenance and one-recipient canary need their own approval. Follow
[the controlled release plan](CONTROLLED_RELEASE_PREPARATION.md).

F09 remains **NOT CLOSED / NOT DEPLOYED / NOT AUTHORIZED FOR ACTIVATION**.
