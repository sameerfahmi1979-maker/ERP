# F09 integrated delivery candidate — 18 October 2026

Current status: **integration implemented; final verification/publication and controlled activation gates remain open**. This document supersedes old deferral and September runtime instructions for the new candidate, without rewriting their historical evidence. It is not a deployment receipt.

## Source and preservation

The candidate is based on released main `a4983c876beb95f852398a1ec2b9d15ea82fe909` and adapts original F09 `28839b86c4fe174832c21c7282af97c70a127b69` and the F05/F09 composition `6b47aeb1bdb587f3b5503d2ad5407e30cd462a3c`. The later explicit deferral is deliberately superseded. Merely merging the older ancestor cannot restore that source.

Preserved: F03 identity/security-email flows; F04/F06 save identities and scope; current F05 Fluent shell and compact embedded lists; PERF counted/partitioned/cancelled reads; F07 protected lifecycle and originals; F08 server-font attachment renderer and official wording/issuance blocks. No OCR implementation/configuration is replaced. Personal bell and business-event routing redesign remains F10, not part of this release.

## Current contracts

- One fenced email queue owns dispatch. Durable leases, exact provider snapshots, atomic rolling-window admission, attempt history, cancellation and crash reconciliation prevent competing senders and blind resend after uncertainty.
- Provider acceptance is not inbox delivery. Legacy sent remains unverified; unknown remains held even after an audited operator review. Reviews never create a send, recall, change queue status or reset attempts.
- Queue administration requires global authority because the queue has no trusted company partition. View/manage/process remain distinct; manage permits reading, not processing. Scoped schedule CRUD remains protected by caller RLS and fresh company-wide report-delivery permissions.
- Current per-configuration budgets count **dispatch attempts** in rolling 60-second and 24-hour windows. NULL/zero/invalid budgets fail closed. They are not recipient totals, mailbox-wide caps or limits for direct F03 security mail/provider-test paths. No arbitrary failover is introduced.
- Create/edit/remove schedules use original operation UUIDs, authoritative configuration-only revisions, atomic audits and recoverable receipts. Backend run-status changes do not create false configuration conflicts. An uncertain result stays attached to the original operation; a post-commit refresh failure cannot submit another save.
- Main queue and schedule lists use server-side criteria, stable ordering, bounded pages and exact counts. Form wording is loaded only on edit. Nested history remains compact. Requests/results are principal-partitioned and stale results cannot overwrite a newer session.
- Reports use the current F08 authorized runner and server attachment adapter. Unsupported/official A–D schedules are refused; branding, recipients, source revision and current creator permissions are rechecked. Historical overdue status does not establish eligibility.
- Both DMS manual bridges retain source/notification/queue identities, verify the current recipient/mailbox and avoid direct user queue writes. Explicit skips and accepted/uncertain/terminal intents are not reset. The old marker-only "skip email" action is safely retired: use the authorized queue cancellation, which cannot recall a dispatch.
- DMS delivery metadata is projected by the backend, without changing in-app read/dismiss state. A stale producer cannot overwrite an advanced delivery outcome. Deleted/archived/superseded/ignored sources are refused before dispatch.
- Concurrent automatic/manual reminder producers share a database reminder/person fence. Existing historical rows are not deduplicated or replayed; ambiguous history fails closed. Partial recipient creation does not mark the source complete. Scheduler settings/read failures do not silently enable work or appear successful.

## Exact forward migration package

Use only the reviewed current ordered package after reconciling actual hosted history:

1. `20261018090904_f09_integrated_delivery_foundation.sql`
2. `20261018093032_f09_schedule_recovery_and_review.sql`
3. `20261018100339_f09_dms_delivery_projection.sql`
4. `20261018102324_f09_dms_reminder_intent_fence.sql`

Do not replay the five September donor migrations or insert their versions into hosted history. The new foundation composes their reviewed behavior against the current schema. Ambiguous legacy notification identities abort preflight. Unambiguous historical identities are retained without changing their payload/status or resending them. Old pending/processing/failed work is held for review, not bulk-unpaused.

## Verification and evidence qualifications

Use non-browser unit/component tests, actual isolated PostgREST/JWT/RLS/native concurrency checks, Deno handler tests, shipping/performance types, lint, production build and the verified dependency gate. Component tests are not actual browser/device acceptance. Native outcomes simulate the provider and make no external sends. Native signed session JWTs exercise actual RLS/Data API but are **not** a new GoTrue password-login proof; F03 Auth behavior was not changed.

Failed attempts, fixes, retests, migration hashes, exact source manifests and cleanup receipts belong in the private audit evidence, not public Git. The initial isolated GoTrue startup failed on missing upstream Auth migration history; no migration history was fabricated. F07 correctly rejected a routine hard-delete fixture cleanup. Do not weaken its purge protection; remove only the task-owned isolated laboratory after acceptance.

Final exact-head GitHub results, merge SHA, hosted migration versions, deployment identity, backup freshness, caller configuration and receipt canary must be recorded before claiming their respective gates passed. Historical suite counts and HTTP liveness do not substitute for those gates.

## Controlled cutover and open activation decisions

- Owner-approved missed-run policy remains `skip-missed-after-current`, not bulk catch-up. Hold unsupported schedules; do not replay legacy mail or AI jobs.
- Approve finite provider budgets and their direct/shared-sender allocation before enabling workers. Never infer a budget from NULL configuration.
- Obtain permission for exactly one labelled canary and actual owner inbox confirmation. A `202` or a queue timestamp is insufficient.
- Verify current backups/recovery, schema history/catalog/ACL drift and the exact reviewed application/database/Edge package. Keep the existing ERP auto-deployment trigger suspended so merge cannot race the controlled release.
- Pause the old consumer before migration/application cutover. Establish one authoritative queue trigger; do not enable both the Edge follow-on and a second competing legacy consumer. DB claim safety does not excuse duplicate operational ownership.
- Keep `F09_EMAIL_WORKER_ENABLED`, `OUTPUT_SCHEDULES_WORKER_ENABLED`, `F09_EMAIL_TRIGGER_ENABLED` and `OUTPUT_SCHEDULES_UI_ENABLED` explicitly off until their respective gates pass. The UI flag is **not** named `OUTPUT_SCHEDULES_ENABLED`.
- Queue work has a less-than-75-second normal envelope; schedule route work is less than95 seconds. Configure/verify caller and host budgets of at least120 seconds, including pg_net. A five-second default request timeout is not a valid cutover configuration. Aborts/termination never prove a remote write/send rolled back.
- Preserve provider9/model/key and provider8/Azure-off configuration. Do not activate unrelated providers/workers, change the other application, or reprocess real documents for verification.
- Use non-browser HTTP/API/metadata/log checks for release verification. Owner visual, keyboard, contrast, zoom and Android acceptance stays pending. Screen-reader testing is not a closure requirement.

No main merge, hosted write, deployment, worker activation, real canary or full closure is implied by publishing this candidate. Do not proceed past a failed mandatory gate.
