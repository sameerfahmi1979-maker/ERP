# F04 workspace foundation

This branch implements the shared workspace/form contract and three database-backed pilots: Department, Employee and Candidate main saves. It is not a production deployment and does not certify every module mutation.

## Contract

- A form belongs to its route/tab instance, not whichever tab is active when an asynchronous callback finishes.
- Drafts and search/filter values live only in the signed-in principal's memory. Refresh/logout loses them by design. Only validated, bounded route metadata persists. Credentials and file bytes never enter drafts.
- Typed adapters preserve explicit clear, false and zero; controls with arrays/objects need explicit codecs. No automatic whole-form JSON serialization.
- The three pilot main saves use actor-bound operation IDs, payload fingerprints and expected revisions. Identical uncertain retries reconcile; changed uncertain requests and stale writes are rejected. All existing F03 access checks remain enforced.
- Shared native validation and value-free server field errors reveal/focus the owning section. Named combobox triggers support the same feedback. Unknown fields remain visible in the summary, not silently discarded.
- Child dialogs are blocking tasks. Save/Cancel, pending single-flight and discard warnings apply. Cancellable same-origin navigation is blocked while active; browser-forced escape is never trapped. Dialog/file state is explicitly not restored after forced departure. Native reload warnings are best-effort browser behavior, not durable recovery.
- Legacy adapters retain conservative dirty warnings until their module adopts a typed baseline. Their child/multi-step mutations are not magically database-idempotent merely because the shared dialog coalesces clicks.

## Verification

Run `npm test`, `npm run test:remediation`, `npm run typecheck`, `npm run lint`, `npm run build` and `npm run security:secrets`. F04-focused tests use `tests/remediation/f04/vitest.config.mts`. DB/browser helper commands require the guarded synthetic local F00 environment and private fixture ledgers; they must not be pointed at production. Private audit evidence and credentials are deliberately excluded from Git.

## Deployment dependency

The application requires `20260928045514_f04_atomic_workspace_saves.sql`. Publishing this branch is not authorization to apply it. Before a future controlled release, reconcile exact target lineage, verify backups/rollback and compatibility, rehearse scoped canaries and coordinate application/database cutover. Do not merge or deploy automatically.

## Module adoption

Later module phases must reuse these controls, add their own explicit codecs and database operation/version contracts, and execute their complete business workflows. File bytes and authentication material remain excluded. Any shared defect returns to F04 rather than being waived as a module follow-up.
