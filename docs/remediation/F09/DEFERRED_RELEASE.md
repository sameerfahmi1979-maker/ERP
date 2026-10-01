# F09 deferred until after F08 — owner decision, 1 October 2026

The owner approved releasing the F05 appearance while deferring F09 and the tightly coupled Email Queue / Report Schedules redesign. This is a delivery-order decision, not a rejection or deletion of the completed F09 work.

## Preserved source

- Complete integrated candidate: `codex/f05-fluent-ui`, commit `6b47aeb1bdb587f3b5503d2ad5407e30cd462a3c`.
- Original F09 lineage: through `28839b86c4fe174832c21c7282af97c70a127b69`.
- F05-only release: `codex/f05-release-without-f09`.
- Reference tests remain in `tests/remediation/f09`; they cannot execute against the deliberately absent runtime. Their 180 historical passes are not included in this release's test total.

## Exact UI exception

`/admin/notifications/email-queue` (`PAGE-6F2B1EF9CB68`) and `/admin/reports/schedules` (`PAGE-1A3666AB13FA`) retain their current production implementations. Shared shell changes may still surround those pages. Report Schedules remains subject to its existing feature gate; this release does not enable scheduling or new workers. Every applicable G01–G06 form/list/mobile/privacy standard remains mandatory when these surfaces return in F09.

The legacy queue processor, report schedule worker, schedule actions, DMS expiry bridge and edge scheduler are restored to main `d9de058abbc410006c0233bac3e69e06e1faccde`. Eleven active release guards check this boundary. Existing legacy delivery/retry deficiencies remain owned by F09; do not call them corrected merely because email continuity is preserved.

## Resumption checklist

1. Reconcile F08's final report/output interfaces with the preserved F09 candidate; do not blindly copy an outdated schedule contract.
2. Restore/reconcile the five F09 migrations and removed runtime/adapters as one reviewed package. The old F09 commit is already an ancestor, so merely merging it will not undo the explicit deferral changes.
3. Restore the twelve schedule/attempt-history F05 cases from the preserved commit and the F09 CI job; retire/update `release-deferral.test.ts` intentionally.
4. Repeat auth/scope, queue lease, provider-admission, retry/idempotency, schedule-boundary and UI tests against the final combined source.
5. Rehearse backfill, old/new worker exclusivity, rollback and existing-mail continuity. Default-off integrated F09 code must not silently pause the live legacy queue.
6. Release only after its controlled cutover gates pass. Leave the other chat's source/worktree untouched until explicitly coordinated.
