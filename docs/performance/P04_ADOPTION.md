# P04 adoption checkpoint

Status: partial implementation; **P04 is not closed**. This candidate is stacked on P03. Publication does not authorize merge or deployment.

## Included

- The existing generic lookup hook/control and prefetch entry points now use the accepted P02 authorized lookup contract.
- Fifteen geography, organization, finance and unit configuration families retain their existing browser RLS, lean projections, keys and parent filters. Reads use complete counted pages with stable ID ordering, cancellation, one retry owner and explicit size limits. A selected inactive value uses the same authorization/parent filters.
- Actual reusable selectors retain entered values on failed loading and provide retry. The unit selector retains its existing error/retry interface.
- Shared prefetch and Party form prefetch no longer claim failed action results as successfully loaded empty choices. No late cancelled prefetch may populate a cleared account cache.
- DMS Archive uses a private read endpoint, a 25-row SSR seed, server-side search/filter/sort/count, bounded pages, protected replacement resolution and complete-result compatibility for the old action.
- Archive guards reject malformed, partial, duplicate or count-inconsistent rows and replacements. Ordinary DMS document pages also reject duplicate identities.
- Confirmed restore invalidates related list/record/dashboard/expiry caches; failed restore does not. Document-list invalidation includes the archive read family.

No new database migration is introduced here. Existing P03 migrations are prerequisites. Do not substitute the older lab's protected reader or disable confidentiality for performance.

## Verification

Run the P04 Vitest configuration and its TypeScript project, the existing P01/P02/P03 suites, the complete remediation and unit suites, shipping/E2E types, lint, build and security gates. CI includes the P04 offline suite and local-harness typecheck.

The p04.local.config.mts suite is opt-in only. It requires a fresh, explicitly admitted synthetic loopback lab with providers/workers disabled, a matching environment hash and synthetic accounts. It refuses other destinations and never runs in ordinary CI. It compares all fifteen active configuration identity sets for three actors and checks archive access for four actors. Empty archive results do not establish nonempty replacement or restore acceptance.

Component/query tests are not browser measurements. No production latency or whole-app performance guarantee is claimed.

## Remaining acceptance and adoption

- Nonempty native archive/replacement/restore fixtures and exact intended release-schema integration.
- Immutable F06 integration, including the known positive scoped common-master access gate.
- Remaining administration collections and DMS expiry/reviews/inbox/record/linked-entity consumers.
- HR/recruitment/time/payroll/operations consumers and their preserved form/permission/failure contracts.
- Report criteria/history, notification/delivery reads, dashboards/search/advisory/audit residuals, aligned with owning phases. Do not activate deferred F09 delivery work.
- Complete per-consumer inventory reconciliation. Shared-selector tests do not certify every parent screen.
- Owner-deferred browser/device/journey measurements, explicitly NOT RUN.

Keep F03 confidentiality, F04 draft/mutation safety and F05 appearance intact. Workspace capacity/bulk-close redesign remains separately assigned; this checkpoint does not implement it.

## Integration/rollback

Review against the exact P03 base and selected owning-phase revisions in an isolated environment. Apply the existing P03 migrations only against their guarded preimages before deploying dependent reads. Stop on a preimage mismatch, missing/false counts, denial leakage, lost drafts or failed reads. Preserve the previous application build; rolling back this application checkpoint must not remove F03 security or reset business data.
