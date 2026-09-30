# F09 integration contract — F05, F06 and F08

Date: 30 September 2026. Isolated branch: `codex/f09-backend-foundation`.
This is a coordination handoff, not a claim that the other phase branches have
adopted it. No messages were sent to other chats and their files were not changed.
Latest checkpoint: [readiness review](READINESS_REVIEW.md). The current F05
snapshot has no direct file or migration-name collision, but shared dependencies
have changed and UI-03 adoption remains open. This is not merge acceptance.

## Ownership and merge rules

F09 owns queue leases, admission, attempts, retry/cancel semantics, machine routes,
schedule execution and the five F09 migrations. F05 owns the shared layout, global
list/form conventions, navigation, accessible controls, validation, draft behavior
and the final operations screens. F06 owns provider credentials, configuration
governance and all outbound paths outside this queue. F08 owns approved document
content, templates, provenance, secure attachments and recipient-policy acceptance.

Do not copy an entire older page over F05's redesign. Integrate the behavioral
contract below into its current components. Re-run F09 tests on the combined tree.

Overlapping files requiring a human-readable merge review:

- `src/app/(protected)/admin/notifications/email-queue/page.tsx`
- `src/features/notifications/admin/email-queue-page-client.tsx`
- `src/features/notifications/admin/email-queue-process-panel.tsx`
- `src/features/notifications/admin/email-queue-table.tsx`
- `src/features/report-center/report-schedules-page.tsx`
- `src/features/report-center/report-schedule-form.tsx`

Shared nonvisual contract: `src/lib/email/queue/presentation.ts`.
The later [operations checkpoint](OPERATIONS_ACCEPTANCE.md) adds
`list-contract.ts`, `runtime-limits.ts`, `readiness.ts` and the permission-checked
`getEmailQueuePage` action. The baseline queue page now consumes server counts,
filtering and pagination; preserve those behaviors when adopting F05 components.
Server schedule actions now use user-session RLS for CRUD, not a service-role
all-company query. Catalog label hydration follows the already-authorized schedule
IDs and never renders report contents.

## F05 status and action rules

| Durable state | Required wording/meaning | Allowed action |
|---|---|---|
| pending, no pause or retry reason | Queued, not sent | Process only if server permits; cancel before dispatch |
| pending, paused_at present | Paused — review required | No automatic resume; explicit reviewed disposition |
| pending, F09:retry | Retry scheduled | Eligibility check only; keep cooldown and consumed budget |
| pending, F09:provider_quota | Waiting for provider capacity | No attempt-budget reset; server rechecks admission |
| processing | Processing, not delivered | Cancellation only before the active dispatch starts |
| sent, provider_accepted | Provider accepted | Never claim inbox delivery; no resend button |
| legacy sent | Legacy sent (unverified) | Do not convert historical state into verified delivery |
| delivery_unknown | Delivery uncertain — review required | No automatic retry, resend or pretend cancellation |
| failed/cancelled | Terminal | No reset-to-pending action |

Confirmed rejection followed by a future retry may be cancelled; the previous
dispatch timestamp is retained as evidence. An active dispatch or ambiguous
outcome may not be cancelled. All decisions are repeated server-side.

Keep one stable request UUID across a lost enqueue/run-now response. Release the
busy state in finally, report uncertainty truthfully, and reuse the existing UUID
when checking that same operation. A successful new intentional operation gets a
new UUID. Never store email bodies, attachments or credentials in browser drafts.

Global queue visibility requires a global view/admin grant. Enqueue requires
global manage AND process (or admin); cancel requires manage; process/retry requires
process. Scoped roles cannot operate this company-unpartitioned queue. In the
current inherited sidebar a scoped queue capability can still show a navigation
link that the page correctly denies: remove that misleading link in F05.

Schedule reads and mutations must respect the assignment's company and branch.
A branch-only grant cannot create a company-wide schedule. Ownership does not
survive loss of current delivery permissions. Browser JWTs cannot change creator,
report identity, last-run outcomes or hard-delete a schedule. Both old/new scope
are checked on reassignment. Server updates use a compare-and-set read version.

## F05 acceptance still required in the combined UI

1. Add an explicit, permission-filtered company selection to schedule creation.
   The inherited form currently omits company and creates global schedules;
   scoped users correctly fail closed rather than silently getting global scope.
2. Respect view versus manage/run authority for every schedule action. The
   inherited schedule list still exposes controls that the server may deny.
3. Apply the global validation summary, labels/focus, keyboard and mobile rules.
4. Adopt and retest the implemented server-side pagination/counts/filtering.
   The earlier 200-row cap and partial totals were fixed in the operations
   checkpoint. Do not reintroduce client-only sorting/filtering of one page.
5. Display next retry/capacity time, timezone, paused reason and attempt history
   clearly, rather than a raw F09 reason code alone.
6. Add audited operator reconciliation of unknown outcomes. Never implement
   this as a generic resend. Provider trace review and a separate deliberate new
   request need an approved operating procedure.
7. Apply conflict/version and response-loss recovery to schedule creation/edit
   forms. In-flight locking exists, but stable schedule-create idempotency and
   client edit-version conflict UX need the shared form contract.
8. Verify asynchronous registry-load failures and current permission changes.
   Do not enable the schedule UI globally merely because local tests passed.

Observed and fixed here: HH:mm:ss database time rejected by an HH:mm form schema;
normalize the edit value to HH:mm. An unchanged calendar sent by the form no
longer moves next_run_at. UUID schedule codes replace millisecond-only codes.

## F06 provider contract

Admission serializes on the provider row and compares the complete prepared
configuration snapshot before authorizing dispatch. Limits are per provider
configuration, counting dispatch attempts in rolling 60-second and rolling
24-hour windows, not recipient totals, calendar-day quotas or inbox receipts.
Null is unlimited; zero/negative is invalid and fails closed. Changing this
meaning needs tests and approval, not a UI relabel.

Provider-wide cooldown honors retry timing, even on an exhausted final attempt.
Quota deferral consumes no provider send and refunds only its own fenced claim.
Provider selection remains explicit or exactly one enabled default: no arbitrary
fallback or priority-based failover after an uncertain send.

Not covered by these counters: existing direct provider-test, generic legacy
email/export and F03 authentication/invitation delivery paths. F06 must inventory
those paths and approve shared mailbox/provider budget allocation before claiming
an application-wide or mailbox-wide cap. This is a production activation gate.

## F08 verified-output contract

- Current F09 report adapter is limited to supported analytical E/F/G or explicitly
  unclassified reports; official A–D output is rejected.
- Resolve current creator, company, report, grant snapshot and template on every
  attempt. An operator does not lend stronger rights to the creator.
- Fail closed on unavailable branding. Preserve report-run ID and bounded file
  metadata. Current inline attachment ceiling is 3 MB.
- F08 supplies approved template/content provenance, exact recipient policy,
  large confidential-file delivery/revocation and final bilingual output UAT.
- Current DMS mail is only a generic sign-in notice. Never add document title,
  body, secret links or files before F08's confidentiality acceptance.
- A schedule revision change invalidates its previously prepared intent.

## Merge acceptance

Integrate on a reviewed branch based on the then-current main. Inspect migration
ordering and any regenerated database types; retain both branches' tests. Run
shipping types, targeted/full agreed lint, offline tests, real local Auth/API/RLS,
provider concurrency tests, Deno check/runtime and the browser journeys again.
Only then request publication/merge/deployment approval. Do not interpret this
document as permission to push, merge or enable a worker.
