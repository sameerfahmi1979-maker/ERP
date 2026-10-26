# F18 recovery and operational resilience

Status: isolated implementation and laboratory verification. This document does not authorize a production outage, restore, credential change, automatic resend, or release. Production recovery objectives and the intended operator's exercise remain acceptance gates. Manual UI/device acceptance is deferred.

## Recovery specification and coverage

Before approving production recovery, record the owner, approval date, maximum recovery time (RTO), maximum data loss (RPO), backup retention, simultaneous users, workload mix, data/file sizes, on-call contact, and recovery operator. Unspecified targets are pending, not unlimited or zero. Choose replica/region design only after these requirements and service support/cost have been verified.

| Component | Required recovery material | Acceptance |
|---|---|---|
| Database | Consistent archive or supported PITR point; exact schema, migration ledger, constraints, sequences, row values, ownership, grants and RLS | Restore a separate target, reconcile exact reviewed migrations; do not replay history by timestamp alone |
| Object storage | Original file bytes, bucket/path/version metadata, content lengths and SHA-256 hashes, policies | A database backup does not contain Storage file bytes; verify an independently retained exact object set |
| Auth | Identities, current password/session/revocation state, approved auth settings and issuer configuration | Native row parity is distinct from a functioning Auth API; never revive revoked access or restore obsolete credentials |
| Configuration and secrets | Sanitized settings and names of secret references, secure owner-controlled retrieval process, current scope/rotation versions | No secret values in Git, reports, logs or archives labelled sanitized; missing issuer access is a blocker |
| Application and Edge functions | Exact source and image digest, Node/dependency lock, migration compatibility, Edge source/deployed-version correspondence | Repository source is not proof of the currently deployed Edge version |
| Renderer and documents | Renderer image digest, bundled fonts, template/branding snapshots, issued serials, retained originals and verification revocations | Preserve original bytes. Do not regenerate issued documents from current templates or revive links |
| Queues and operations | Attempts, leases/fences, dispatch/admission receipts, paused/scheduled state, pending upload/output payloads and audit records | Unknown delivery stays on hold; retain original operation and payload identities |

Supabase documents the Storage exclusion at [Database backups](https://supabase.com/docs/guides/platform/backups). Verify the actual service plan, PITR availability and retention before relying on them. A successful local archive restore does not establish managed-cloud recovery readiness.

## Isolation and preflight

1. Record immutable candidate identity, target database/container identity, operator and case IDs. Check current source and evidence; preserve dirty work and unrelated environments.
2. Use an owned synthetic environment with no route to production, no public ports and no restart policy. Disable scheduled jobs, outbound workers, AI/email providers and public verification. Use local sinks only. Never copy production secrets or unredacted data into a laboratory.
3. Verify archive and object hashes before restoring. Record a coordinated cutoff; quiesce writes or use an approved cross-service consistency method. Keep post-cutoff writes explicit.
4. Record limits before load: CPU, RAM, connections, maximum jobs/bytes/clients and stop conditions. Stop on loss of containment, unexpected recipients/targets, uncertain ownership, memory pressure or failed invariants. Do not raise timeouts to hide failures.
5. Preserve failed receipts; do not delete uncertain resources. No broad Docker reset, prune, volume deletion or repair of unrelated applications.

## Restore and validation

Restore to a new target, never over the source. Restore object bytes separately. Verify full table row hashes, relationships, constraints, sequence values, policies, function privileges and immutable originals. Check a permitted actor and an excluded company/branch independently. Check pending requests and revoked originals after restore.

`tooling/resilience/backup-set.mjs` validates laboratory manifests and actual artifact hashes. It requires a database archive, separate objects, sanitized configuration, source identity and explicit coverage for every component. `verifyRestoredObjects` also rejects missing, unexpected or linked files. The utility always returns `productionAccepted: false`; a hash receipt cannot approve RTO/RPO or untested services.

Record start/end time, restore and verification time separately, recoverable cutoff and known post-cutoff loss. Do not infer production RTO from a small, warm, single-host test. Retain the source, archive, restored target and original evidence until reviewed cleanup is safe.

## Worker and dependency recovery

| Symptom / boundary | Required action | Unsafe action |
|---|---|---|
| Crash before dispatch | Let the existing lease/reaper and attempt budget govern recovery; reclaim with a new fence | Let a stale worker finish or reset attempts |
| External send accepted but acknowledgement/final persistence lost | Hold `delivery_unknown`; inspect attempt/provider evidence with an authorized operator | Blind resend, mark delivered from HTTP readiness, delete receipts |
| Renderer fails or returns invalid/oversized PDF | Retain the original request, immutable render plan and cached bytes; surface a safe error | Log response bodies/tokens, allocate a replacement serial, issue malformed output |
| Upload response lost | Reconcile the same object path/version and exact original hash | Upsert/replace the object or start another request |
| Database unavailable/slow | Return explicit unavailable/uncertain state; retain operation identity; recover through original scoped operation | Report empty/success or perform direct record edits |
| Provider 429 | Respect existing retry time, provider cooldown and finite minute/day budgets | Tight-loop retry or bypass admission |
| Repeated AI/notification crashes | Preserve bounded attempts and immutable history; hold unresolved authority/recipients | Guess recipients, infer delivery, enable a provider or widen roles |
| Changed/forbidden/missing original | Hold verification and preserve its issuance; request authorized reconciliation | Substitute another file or expose it through service-role reads |

The application now cancels rejected renderer bodies without echoing their content. Original-output attestation streams at most 32 MiB with a 30-second transfer deadline before buffering, then retains existing hash, object-version, actor/session and proof checks. Cancellation is best effort and cannot hold the request indefinitely. These limits are technical safeguards, not a performance SLA.

## Monitoring and operator exercise

Use authenticated GET-only readiness endpoints with existing secret references; never copy their values into command logs. An HTTP 200 is not proof of healthy workers or delivered mail. Inspect query success, freshness, due age, expired leases, unknown outcomes, finite provider budgets and whether processing is deliberately paused.

`tooling/resilience/probe-assessment.mjs` accepts the aggregate queue readiness payload and explicitly supplied freshness/queue-age thresholds. Stale, malformed, unready, ambiguous-delivery and provider-configuration states remain visible, including while workers are paused. It returns fixed safe codes and never certifies delivery or copies provider/recipient details. It interprets a sample; it is not a deployed scheduler or paging integration.

For the intended-operator drill, record a synthetic incident ID, detection timestamp, alert route, actual recipient/acknowledgement time, investigation, recovery action, verification and closure time. Reconciliation can correctly leave an incident held. Agent interpretation of a local result is not intended-operator acknowledgement. Production alert routing, threshold approval and operator acknowledgement remain pending until actually exercised.

## Compatible release and recovery

The F18 candidate is based on released F17 and introduces no migration, role or runtime-configuration change. A later release must recheck the then-current schema/ledger and exact source/image identities. Keep automatic deployment disabled during a controlled release sequence where required.

The compatible F17 application/schema pair is a potential rollback source, but reverting it also reopens F18's renderer/transfer protections. Prefer a reviewed forward correction when possible. Never restore a database snapshot as an application rollback over legitimate new writes. Preserve current secret versions, permissions, revoked links, issued originals and operation receipts. Do not roll back migrations by deleting history. Preserve OCR provider 9/model, disabled provider 8/Azure, compact lists, photos, exact administrator scopes and all held business policies.

An application-only canary/rollback still requires an isolated deployed runtime and service checks; a PostgreSQL restart drill alone is not application-canary proof. This phase does not deploy, activate new workers/providers, or start F19.

## Reproducible non-browser checks

From the exact isolated candidate, with dependencies installed using the pinned runtime:

```text
node node_modules/vitest/vitest.mjs run --config tests/remediation/f18/vitest.config.mts
node --test tooling/resilience/*.test.mjs
```

The HTTP tests bind loopback on ephemeral ports and use synthetic local responses with the real Storage SDK; they do not launch a browser or Chromium. The CI step repeats these checks without cloud credentials. Private native scripts and raw receipts retain container ownership, schema hashes, fixture identities, process-kill boundaries, cutoff/restore parity, pressure measurements and cleanup. Do not copy those private artifacts into the public repository.

## Acceptance boundaries

Maintain separate states for implemented, laboratory verified, cloud/production verified, owner accepted and released. The following cannot be inferred from local tests: actual cloud backup/PITR retention, cloud Storage/Auth restoration, current issuer-secret retrieval, deployed renderer/Edge parity, production workload/SLA, long-duration soak, production canary/rollback and intended-operator acknowledgement. Obtain and record each applicable gate; leave it open until proven. Browser and physical-device tests remain owner-deferred.
