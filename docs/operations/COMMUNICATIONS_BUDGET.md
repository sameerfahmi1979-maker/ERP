# Communications spending controls

The current release configuration is **off**. A backend deployment or a new budget approval does not start a provider or a dispatcher. The existing ERP runtime is metered. The project has no verified independent bound for additional Railway cost, Cloudflare SFU shutdown exposure or the recurring liability of indefinitely retained history. No production meter, owner binding, spending authority, monitoring recipient, service credential or continuing-retention proof is included in the migration.

## Server configuration

The environment switches below are independent. Each accepts only the exact text `true`. An omitted, blank or unrecognized value keeps the feature off. These are server settings. No application bundle or client preference can grant admission.

| Work | Setting |
| --- | --- |
| Ordinary chat commands | `ERP_COMM_CHAT_ENABLED` |
| Communication presence and Realtime | `ERP_COMM_REALTIME_ENABLED` |
| Retained media upload | `ERP_COMM_MEDIA_UPLOAD_ENABLED` |
| Media downloads | `ERP_COMM_MEDIA_DOWNLOAD_ENABLED` |
| Exports | `ERP_COMM_EXPORT_ENABLED` |
| Android push dispatch | `ERP_COMM_PUSH_ENABLED` |
| Live PTT admissions, talk grants and active tracks | `ERP_COMM_PTT_LIVE_ENABLED` |
| PTT history/replay delivery | `ERP_COMM_PTT_REPLAY_ENABLED` |
| SOS transport | `ERP_COMM_SOS_ENABLED` |

Changing a flag alone cannot admit work. Keep the credential and service-specific configuration separate. The installed cost scope is `communications`. The public operator API rejects invented scopes. Existing ERP notification, DMS and HR functions use their existing controls.

## Calling and consuming a permit

Call `reserveCommunicationBudget` before each independently metered operation. Supply a server-derived actor/profile ID, cost scope, unique operation ID, feature, a conservative integer USD-micro floor and the end of all liability. A zero floor still requires every protected database proof. A null deadline signals continuing retention, which requires documented zero-additional-cost storage after expiry of a finite grant. ERP chat and retained uploads also require this proof where conservative feature-level accounting includes retained history. Push requires both ERP runtime/database and FCM evidence. Live PTT requires runtime/database and shared SFU/TURN evidence. Reserve every additional fan-out, upload stage, issuance, playback and export path that independently consumes a resource.

For authenticated SQL operations pass `binding: {actorSessionId, command}`. The server then forwards the opaque permit to the feature SQL handler. That handler computes its feature/scope and current ERP profile from trusted context, removes the injected permit envelope field and calls `erp_comm_cost.take_permit(permit,feature,scope,profile,command)` **inside the same transaction** as the effect. A trusted security-definer service RPC may call `take_service_permit(permit,feature,scope,profile,session,command)` with its verified original actor/session. Neither helper is executable directly by client roles. Exact canonical JSON, session, active ERP identity, permit expiry, current owner/approval, unit slots and pause are checked. The permit may be consumed once. A failed business transaction rolls consumption back. The feature still enforces its independent membership, access, device and business idempotency rules.

Retry an ambiguous reservation RPC with the same reservation ID and fields. Preserve the semantic mutation ID in the business command. A new billable delivery/response attempt needs a fresh reservation, including an idempotent read of a prior result. The trusted sender should use a provider idempotency mechanism or reconcile an ambiguous external effect before retry. A local SQL commit cannot establish that an external service transmitted, stopped or billed a particular amount. Immediate revocation of ongoing media depends on a verified stop protocol and already-reserved shutdown budget.

An unsuccessful reservation returns `{ok:false,status:503,reason}`. Clients can distinguish unavailable evidence, absent owner, default-off, exhaustion, scope pause, expired approval or stale meters. Suppress automatic retry storms and budget-dependent tasks until prerequisites recover. Cleanup, cancellation and trusted settlement may run after the feature switch is off using reserved resources. A timeout never releases held money or capacity.

## Persistent evidence and funding

The private `erp_comm_cost` schema has no client table grants. The operator RPC uses the actual ERP user session. Reservation, settlement, pause and bounded cleanup use a transactional service-role RPC. Feature code and monitoring roles have no direct write path to owner enrollment, proof, meter, capacity or final-provider-evidence tables.

1. Enroll an independently verified ERP owner in the singleton authority row using a reviewed administrative change with evidence. Installation leaves this binding empty. The public interface cannot self-enroll, transfer ownership or promote an administrator into the owner.
2. A trusted billing evidence collector must establish each applicable resource unit, billing account, period, net available quantity, complete meter observations and a guaranteed upper bound through final shutdown. Include non-feature usage, active sessions, unseen consumption, retained objects, existing commitments, billing rounding and tax where applicable. Source rate cards and delayed dashboards alone cannot establish these bounds. Use one stable capacity slot per billing account, dimension and resource unit. The physical unit ceiling is shared by all matching approvals and features.
3. For a single exact operation, record the trusted proof and bounded meter rows. A standing envelope may reference a protected template only when the bounds hold for **every** request of that feature, its maximum payload, recipients, retries, time, length and failure modes. Under a global ledger lock the RPC checks the snapshot, required dimensions, freshness, available units and remaining approved money, and records money and physical units atomically. The operation receives its own immutable-at-issuance copy of standing evidence. No standing envelope is installed. The unit ledger consumes its conservative upper bound and does not automatically release previously allocated units or roll over when an invoice resets. A future protected reconciliation process must prove availability across billing windows before raising a ceiling.
4. Money is stored as nonnegative exact integers in millionths of one USD. A positive increment or monetary safety margin requires a matching active owner-approved cap. A valid zero-increment proof can admit work after owner enrollment without a spending grant. Keep all associated usage within the explicit physical envelope. Accepted indefinite storage needs independent continuing-retention evidence even when a paid period is active.
5. When actual cost is final, an independent collector supplies final evidence bound to the opaque permit. Call `reconcileCommunicationBudget` with that exact evidence ID and amount. A confirmed never-started operation can settle at zero. Uncertain settlement keeps the reservation. An overrun records the full actual charge, pauses new work for the affected communications feature/scope and enqueues an alert. No whole-workspace stop, replica reduction, cloud plan change or deletion of retained data is performed.
6. Use `pauseCommunicationBudget` for a trusted internal incident, or the authorized operator command for a human pause. Gate changes reject future reservations. A durable pause also fences still-unconsumed user SQL permits. Already-issued provider capabilities, signed downloads and active transfers require bounded termination/accounting. Resumption is a separate reviewed change following evidence/rate review.

## Cleanup funded before admission

For a provider session or partial upload, the originating proof must include the shutdown cost in its monetary and unit ceilings. The private cleanup limit also records the allowed endpoint, maximum distinct resource IDs and a finite attempt count per resource. Live PTT requires a track-close allowance. An upload requires partial-object cleanup. A TURN grant needs its own revoke allowance before issuance.

Call `bindCommunicationCleanupResource` with the original permit, deterministic resource ID and the narrowly defined endpoint before remote creation. Allowed endpoints are `close_sfu_tracks`, `revoke_turn` and `discard_partial_upload`. A service worker calls `authorizeCommunicationCleanup` with that same binding and a unique attempt ID. Duplicate IDs return the existing attempt. The worker checks provider state on ambiguous outcomes and calls `confirmCommunicationCleanup` only after termination or staged-object removal is confirmed. An unconfirmed resource holds final settlement. No fresh admission, current meter or renewed spending approval is necessary for this previously reserved cleanup. It cannot authorize a new track, download, upload, notification or removal of accepted history. A known bound on termination despite control loss is still required before activation.

## Authenticated operator commands

All public commands use the existing ERP communications API and the `communications` scope. The UI must render only controls authorized by the returned capabilities. SQL independently authenticates the actor and session. Ordinary accounts receive a generic controlled-status response.

| Command | Inputs and result |
| --- | --- |
| `budget.status` | `scope`. Returns `canApprove`, `canMonitor` and held reasons. Authorized monitoring users also see active approval, spent/reserved amounts as decimal strings, paused features and server-disabled features. The presence of a standing template is insufficient to establish per-operation admission. |
| `budget.approve` | `scope,features,currency:"USD",maxMicros,endsAt,clientMutationId`. The cap is a positive decimal integer string. Use an absolute UTC end instant and UUID mutation ID. Only the bound owner with a recently authenticated ERP session can approve. A billing cycle never renews the grant. One outstanding approval prevents accidental stacking. |
| `budget.revoke` | `scope,approvalId,clientMutationId`. Only the bound, freshly authenticated owner can revoke. Existing financial obligations remain booked. |
| `budget.pause` | `scope,feature,reason,clientMutationId`. Owner or a currently selected technical recipient may pause the communications feature. |
| `budget.monitor` | `scope` lists the selected technical recipients by exact ERP profile IDs. To replace them, the freshly authenticated owner supplies `recipientProfileIds` as decimal strings and `clientMutationId`. The owner is always an additional alert recipient. Empty selection removes the optional recipients. |

Changed arguments under the same mutation ID are rejected. The SQL authority checks a current ERP session and an AMR timestamp no older than five minutes for a qualifying interactive method. A refreshed token alone cannot issue an approval. Public responses use ERP profile IDs. No user can add themselves to monitoring via a Global Admin role.

The service-only feed `erp_comm_budget_monitor_events(p_after,p_take)` returns up to 100 durable events after an integer cursor. Admission records an early warning at 80% of the fixed cap and records exhaustion. The feed also materializes near-expiry and expired notices at polling time. Consumers must persist cursor/delivery state, recheck selected recipients, deduplicate by event ID and target the ERP notification center and Android push only when permitted. No mail channel or always-on job is installed by the cost migration. Push failure or disabled push must remain visible in ERP.

## Verification and recovery

Run the normal Vitest runner for `src/server/communications/__tests__/budget.test.ts`. For the native PostgreSQL rehearsal, run `python tests/communications/budget_native.py` with an already cached PostgreSQL 17 Docker image. Override its local image ID with `BUDGET_TEST_PG_IMAGE` if `postgres:17` is not tagged locally. The harness uses an isolated network namespace, a temporary in-memory data directory, synthetic accounts and a fresh database container that it removes on completion. It never connects to the ERP target.

The installation is additive. Its DDL is in a single transaction. A failed installation rolls back. For application rollback disable new admissions, retain the ledger and all pending holds, remove producer/consumer scheduling only if separately approved, and reconcile existing obligations. A production rollback must preserve approvals, cap usage, alerts, accepted objects and unresolved deliveries. Live application requires separate target/history/compatibility review and recorded checksum. This assignment supplied no live migration or provider-activation receipt.
