# F05 — Fluent UI adoption candidate

This is an application implementation and scoped automated-acceptance record, not a claim that every actor, record state, physical device or business workflow has passed. The selected direction is ALGT-branded Fluent/Dynamics-inspired UI; this is not Microsoft Dynamics software.

## Delivered sequence

- UI-00/UI-01: genuine Fluent provider/dialog adapters, accessible shell and compact Open workspaces, consistent record commands, linked field-error summaries, administration/account/master-data adoption, shared list columns/filters/search.
- UI-02: DMS list/form/upload/review/configuration adoption and safe failure feedback. Two new migrations implement atomic workflow configuration and stage decisions with scoped authorization, revision checks and concurrent-decision protection. These are database changes, not merely CSS.
- UI-03: reporting and scheduling screens, notifications, email settings, queue and attempt-history presentation. Guarded actions, structured validation, stale-write handling and response-loss-safe schedule creation. No delivery or read/action business semantics are claimed fixed by UI alone.
- UI-04: HR lists, child forms, recruitment, compliance, attendance and payroll-facing screens use shared states and list controls. Corrected schema projections and ambiguous joins; existing access policies were not relaxed.
- UI-05: dashboards, search, advisory AI, providers, document browsers and specialist editors. Permission-aware controls, stale-response protection, secret-field lifecycle, unknown-outcome guards, keyboard resizing and consistent route identity.

## Implementation contracts

Every applicable current/future form must use the shared linked summary, inline invalid state, error count and field focus. Required fields remain business-specific. List controls operate only on explicitly declared permitted scalar fields and clearly identify loaded-record filtering. Column hiding is not authorization. Search/filter/draft state stays within the existing principal-scoped F04 memory policy; it must not be turned into durable confidential browser storage.

Retained specialist widgets use the common ALGT tokens and behavioral adapters. Print/PDF output, option lists, navigation and compact summaries are not editable business grids; do not add misleading column controls to those surfaces. Broad server pagination/performance and module business redesign retain their planned owners.

## Verification

Local suites before publication: 464 unit cases, 784 combined remediation cases and 180 additional F09 cases pass (1,428 distinct cases; focused F05 and F04 reruns are included in the combined suite and must not be counted twice). Shipping types and lint baseline pass: zero errors, 133 existing warnings, no new warnings. The final application build uses Next.js 16.3.8; the dependency audit reports zero vulnerabilities. GitHub checks are a separate publication gate, not implied by these local results.

Recorded local journeys include independent DMS workflow actors/concurrency, schedule response loss and stale revision, interview editing, provider configuration with no secrets or paid AI calls, search/read failure recovery, mobile-width reflow, list tools and keyboard navigation. Earlier failures and corrected harness assumptions are retained in private evidence. A failed Grades save remains a business-policy blocker; it is not relabelled a successful workflow.

The Keyborg compatibility override is retained. The real Next/Turbopack StrictMode, Fast Refresh, navigation, dialog and keyboard fixture passes eight checks on the patched Next release with no disposal errors. See `tests/remediation/f05/KEYBORG_COMPATIBILITY.md`.

Run:

```text
npm ci
npm test
npm run test:remediation
node node_modules/vitest/vitest.mjs run --config tests/remediation/f09/vitest.config.mts
npm run typecheck:e2e
npm run test:e2e -- --list
npm run build
npm run typecheck
npm run lint
npm audit --audit-level=high
```

Playwright `--list` checks discovery, not execution. Private database/browser fixtures and screenshots are deliberately excluded from this public repository.

## Release and rollback boundaries

1. Publish the reviewed candidate on `codex/f05-fluent-ui`; inspect GitHub verify, lint and production-image jobs before treating it as a checked candidate.
2. This candidate integrates the reviewed F09 source lineage. It does **not** authorize enabling F09 queue/schedule/bridge workers, email delivery, new infrastructure or paid AI providers. Follow the F09 controlled-release gates separately.
3. Before production: reconcile migration history, capture a recoverable backup, verify current production identity/scope, test the matching application plus migration package in isolation, schedule maintenance and define an exact rollback artifact. Apply migrations in timestamp order after their F03/F04 prerequisites; do not bypass a missing dependency.
4. DMS atomic approval/configuration callers require their matching new functions. Do not deploy the new caller without its migration. A rollback must preserve workflow/history data and restore a compatible application/function contract; no destructive down migration or blanket policy rollback.
5. Post-release smoke: admin and scoped actors, drafts/account switch, DMS visibility/download and approvals, HR forms, list controls, schedules/queue with workers still disabled, light/dark mobile layouts and logs. Stop release on access regression or missing RPC; do not grant broader permission to make a UI check pass.

## Explicit remaining acceptance

- Owner review of integrated screens; exhaustive actor/configuration and dynamic edit/view variants across the inventory are not certified by route smoke tests.
- Physical iOS/Android touch/soft keyboards, Safari/Firefox, native 200–400% zoom and actual screen-reader announcements require their respective environments. Viewport emulation and automated axe are not substitutes.
- Raw axe reports upstream Tabster dummy focus sentinels separately. Keyboard tests demonstrate immediate focus redirection; assistive-technology acceptance is still open. Do not suppress all accessibility findings or call the raw scan wholly clean.
- Existing Department/Shift removal and HR Grades creation policy disagreements remain with the configuration/security business owners. Payroll, employment policy, official-output rendering, real notifications and email delivery retain their module phases.
- No production deployment, worker activation or full-F05 closure is implied by a branch publication.
