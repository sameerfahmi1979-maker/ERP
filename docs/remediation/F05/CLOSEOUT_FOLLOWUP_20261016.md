# F04/F05 independent closeout follow-up

This is an isolated, reviewable candidate stacked on the performance-adoption branch, not a production release or a declaration that every F05 acceptance gate is closed.

## Changes

- Allow 30 closable working screens in addition to pinned Home, with matching safe-manifest admission and no silent eviction.
- Keep the workspace chooser open during repeated closes; preserve search, scroll and meaningful keyboard focus. Guard Close all across both visible and search-hidden workspaces.
- Recheck pending saves/dialogs and changed target sets at confirmation time. Retire revoked workspace metadata/drafts without widening permissions.
- Carry reviewed light/dark theme literals onto the performance candidate without replacing its read/cache/business logic. F06-owned theme callers are reserved for their owner's integration review.
- Keep the current workspace browser title when streamed route metadata arrives later; release title ownership when the protected shell unmounts.
- Avoid a duplicate selection column in the DMS apply preview.
- Distinguish failed Employee reads from empty successful results, retaining the existing read-denial action guard.

## Verification

Run the repository's shipping typecheck, lint, build, secret/vendor/dependency checks and remediation suite. Run the P03 component tests and P04 regression suite. The new workspace capacity, switcher integration, title and dark-mode tests are included in remediation coverage. Use the committed browser fixture with the real shared providers for bounded synthetic capacity/guard checks; fixture timings are not production performance.

Private acceptance records retain source identities, exact test boundaries, screenshots, laboratory measurements, cleanup and inventory reconciliation. A preceding test result is not silently promoted to acceptance of later code; final CI must match the proposed head.

## Explicit open gates

- Real native-popup painting, physical mobile/touch/IME and spoken screen-reader acceptance cannot be inferred from DOM styles, viewport simulation or automated accessibility tests.
- Current-source/state/actor acceptance across the whole screen inventory remains distinct from mechanical source reconciliation and representative browser journeys.
- F06-owned callers and final PERF/F06 composition require the reviewed owner handoff. Do not import unfinished F06 source or migrations.
- Coupled Email Queue/Report Schedules redesign remains with F09 after F08.
- Main merge, production deployment, live browser budgets and release acceptance are not authorized by this candidate.

No production data, credentials, private receipts, screenshots, provider configuration or worker activation is included.
