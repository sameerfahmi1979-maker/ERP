# DMS file preparation — background processing

Implemented locally on 3 November 2026. Database migration `20261103035328` was applied only to ERP project `mmiefuieduzdiiwnqpie`. Application publication/deployment is pending the owner's later full release.

## Using the local application

Restart `npm run dev` (or `Start-ERP-Local.bat`) after this change. The Node instrumentation starts a preparation-only dispatcher every ten seconds. It checks the existing database worker-enable flag and the new dispatch schema before claiming anything. No browser or tab needs to remain open, but the local server and computer must remain running.

Open a permitted original file, choose **Run AI Pipeline**, then **Run AI**. Newly saved requests are admitted automatically. For an earlier saved request, choose **Resume saved request**: this retains its job identity and does not create another upload or duplicate analysis. Failed or uncertain provider stages are not automatically restarted.

The compact panel automatically reads progress every five seconds while visible, stops on terminal outcomes and stops admitting responses after account/scope changes. Closing it does not cancel the saved background request. Review edits remain unsaved until applied, with the existing close guard. Completion or failure creates one generic personal in-app notification; no email is sent. Document access is checked again on opening the notification.

Progress shows waiting, reading, analysing and ready for review, with distinct service-unavailable, administrator-pause, daily-limit, retry-wait and held messages. Elapsed time is not an estimated completion time. No artificial percentage is shown.

## Processing and permission boundaries

- The private dispatch admission ledger starts empty: no historical backlog is automatically drained. The 653 existing queued jobs were unchanged at post-application verification.
- New preparation contexts are admitted transactionally. An explicit resume requires the same owner, current session, source snapshot and DMS manager/administrator scope. It rebinds the original request to that owner's verified session without resetting attempts.
- Database claims enforce at most three running preparations across processes and avoid another running job for the same document. Claims are just-in-time and use the existing leases, guarded publication, attempt history and uncertain-paid-stage retention.
- AI05 pause, daily limits and provider-budget/quality gates remain in force. Three slots are a concurrency ceiling, not a promise of provider throughput.
- The dispatcher uses only the new preparation-only RPC. It never falls back to the old unrestricted queue route if migration or access checks fail.
- Worker RPC execution is service-only; interactive progress/resume uses authenticated, owner- and document-scoped checks. Original files, accepted values and employee data are unchanged until human review/apply.

## Later production release

For a reviewed Railway application release, explicitly configure `DMS_PREPARATION_DISPATCHER_ENABLED=true`. Production startup does not enable this service by default. `false` disables the local dispatcher as well. Existing worker/provider feature flags are not changed by this implementation. Builds/tests never start it.

Do not trigger the generic `/api/internal/dms-ai-jobs/process` route as a backlog recovery shortcut. Historical jobs require separate review; only a specifically resumed retained preparation joins this lane.

## Recovery and verification

The queue and requests are durable. Restarting the server restarts the dispatcher. Expired enrolled leases use the existing bounded recovery and retry delay. An uncertain paid stage is held rather than charged a second time. Worker interruption may therefore require reconciliation instead of automatic completion.

To stop dispatch, stop the local server or set the dispatcher environment flag false and restart. Preserve admissions, results and attempt history. Prefer a forward repair; restoring an old worker definition requires a new review of current source identity and pending work. Private preflight definition, exact migration packet, application receipt and verification are retained under the F06 private evidence directory.

Validation: 102 focused unit/component/regression tests; 87 final native database assertions; eight concurrent synthetic claimers admitted exactly three distinct jobs. TypeScript, affected-file lint and production build passed. Tests used a disconnected schema-only database and mocked providers. No browser testing or real AI/OCR provider request was performed. Owner visual acceptance and a real end-to-end AI run remain unperformed.
