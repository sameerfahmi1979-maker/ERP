# Native Android HR Release 1 Implementation Plan

> For agentic workers: Use superpowers:subagent-driven-development. Owner explicitly requested implementation, live connection and final APK; proceed continuously within that authorization. Track tasks below.

Goal: Deliver version 4.1.0/code 10 of the same signed Android app with role-scoped profile, leave, attendance, supervisor timesheets, renewals and HR approvals connected to live ERP.

Architecture: Keep native Java/JDK17/Android SDK35. Add bearer /api/mobile/hr/v1 using existing ERP session/withMobileToken context, authoritative HR readers and native mutations. Narrow self-service transactions extend existing scoped business rules without broad HR manage grants. Preserve existing DMS/mobile features and production predecessor.

Spec: docs/superpowers/specs/2026-11-20-mobile-hr-release-1-design.md

## Global Constraints

No browser, emulator, device control or live employee test writes. Preserve unrelated dirty work, all role assignments, exact company/branch union, independent approvals and existing audit/leave allocation/operation contracts. No service-role mobile API. New schema must be timestamped under C:\dev\agt-erp\supabase\migrations first, mirrored byte-identically into release worktree, reviewed/synthetically tested before live application. Record role permission deltas and exact migration checksum/history/receipt. New ordinary-role grants only for the intended existing employee self-service role, never broad management permission. No feature beyond approved HR first release, no GPS/QR or payroll/letters/recruitment expansion. Existing DMS manual offline behavior remains unchanged. Final APK C:\dev\mobile_app\ALGT-Mobile-DMS.apk, package net.algt.mobiledms, signer unchanged.

## Review Focus

Own versus other employee and direct-report authorization must stay exact after relationship/role revocation. Self submissions cannot approve, mutate protected fields, attach another employee's private file or consume leave outside authoritative rules. Lost responses must retain original operation and not duplicate requests/approvals. Stale roster/leave/request revisions must reject and preserve user input. Switching account, locking, navigation and callbacks must hide private HR UI and retained submissions.

## Task 1: Scoped HR self-service database transactions

Files: new timestamped mobile_hr_self_service migration in owner root and release worktree; new isolated native SQL fixtures/tests under tests/database or existing native harness; docs/security/administrator-capabilities.json for exact new permissions only. Report C:\dev\mobile_app\build\mobile-hr-database-report.md and database RPC contract C:\dev\mobile_app\build\mobile-hr-database-contract.md.

Interfaces: Provide versioned native RPC(s) for narrow self profile-correction/attendance-correction/compliance-renewal request submission/list/open/decision/reconcile, and own leave creation/cancellation. Use verified user-to-employee link, current scoped permissions, existing employee/attachment/policy/leave trigger rules and persistent operation receipts. Provide actual request table or extend existing appropriate ERP request storage, never a disconnected phone-only record. Existing staff leave decisions and supervisor attendance continue existing F11/F12 paths. Exact RPC/JSON fields must be published in contract immediately when settled, then implementation follows that contract.

- [ ] Read existing live metadata only and local F03/F11/F12 functions/triggers, existing scope standard, Postgres guidance and test harness. Choose smallest safe extension; ledger choices in report.
- [ ] Write focused synthetic/native cases: self versus peer/cross-company/sibling branch; disabled/revoked sessions/link; approved leave and invalid/overlap policy; forged private attachment; requester self approval; uncertain same-operation replay/payload conflict; stale decision; protected profile field and renewal version rejection. Observe new cases fail before implementing.
- [ ] Create timestamped migration file first using pinned CLI help. Add narrow permissions/scope metadata and intended employee_self_service role grants only as necessary; no live role assignment. Reuse leave internals or narrowly extend target-specific admission while preserving triggers, transaction locks, allocation, audit and independent approval. New requests need exact revision/action and only intended side effects on approval.
- [ ] Execute isolated synthetic SQL tests and relevant existing native regressions. No live mutation, commit or deployment by worker. Write hashes, full verification commands/results, dependency/compatibility checks and exact files changed. Root will review/apply/commit.

## Task 2: Protected native HR API

Files: src/app/api/mobile/hr/v1/route.ts; src/server/mobile/hr-contracts.ts; src/server/mobile/hr.ts (split domain helpers when useful); src/server/mobile/__tests__/hr.test.ts; change mobile DMS profile release metadata only if root assigns. API contract C:\dev\mobile_app\build\mobile-hr-api-contract.md; report mobile-hr-api-report.md.

Interfaces: JSON envelope matches DMS. Share bearer authentication/withMobileToken and f03 session validation; no login implementation duplication. Consume Task1 native RPC contract when available; existing HR reader/mutation methods for permitted reads/staff decisions/timesheets. API commands cover profile, employee choices, leave options/balances/requests/submit/cancel, time records/shifts/correction request, HR renewal records/submit, own/team requests and exact opening/approval actions, roster choices/page/opening/save/reconcile. Publish exact command and response contract first, with example fields/nullable/revision semantics for native implementer. Capabilities derive current actual own/record/scoped authority. No role-name-only grants.

- [ ] Read current Next route guide, existing mobile/session/HR readers and mutation contracts; create strict bounded schemas and meaningful auth/role/field-redaction/empty-failure/stale-response tests, run RED.
- [ ] Implement protected route and helpers, safe identity binding/record parent checks, paginated exact results, current permission checks and typed workflow errors (401/403/409/422/503). Hide medical/bank/payroll fields. Wire leave balances including unknown availability, actual roster fingerprints, original operation receipts and DMS renewal attachments. Publish contract before native binding.
- [ ] Run new tests, existing mobile and relevant HR regression groups, scoped lint and shipping TypeScript. Root owns commit/deploy. Record concise report, changed files, limitations, no browser/live writes.

## Task 3: Native HR screens and private operation journal

Files: C:\dev\mobile_app\android\src\net\algt\mobiledms\HrWorkspace.java; HrOperationStore.java and small pure HrRules.java if needed; focused Java tests. Contract consumes Task2 mobile-hr-api-contract.md. Worker report C:\dev\mobile_app\build\mobile-hr-android-report.md.

Interfaces: HrWorkspace(LauncherActivity a), void home(), void reset(), boolean hasPending(), void clearAccount(String user), void onDocumentUploaded(JSONObject receipt) when useful. Root supplies ErpApi.hrCall(JSONObject), hrGet and hrList using same refresh/session fence, and adds Home/nav entry. Only create new HR files; root owns LauncherActivity/ErpApi/MobileWorkspace/manifest. Use current package-visible UI helper methods and style. Publish any required integration hooks. Pending operation metadata must be authenticated-encrypted per UUID/account/session binding, original payload+operation+revision frozen until receipt/reconcile. Never blindly retry with a new operation, or approve offline. Preserve pending fields on network failure/conflict. Logout clears private journal.

- [ ] Read existing native helpers/session/crypto and API contract. Add RED pure tests for request/receipt/pending/account/stale decision/date/overnight timesheet rules that protect actual business input.
- [ ] Implement native HR Home, own Profile and contact correction request, Leave balances/list/form/cancel, Attendance/shifts/history/correction request, selected company/site/team date roster and actual-time entry/save, HR renewal evidence selection/upload path and request status, role-permitted HR approval inbox/opening/decision with original revision/reason. Distinct restricted/unavailable versus empty states, no internal implementation jargon in user flow.
- [ ] Use account and current-screen lifetimes for async callbacks; defer/guard app lock and expired sessions; preserve drafts and original pending operations. Integrate DMS existing selected employee upload for renewal; root completes shared navigation hook.
- [ ] Run pure JVM tests and full Java compile against Android35. No browser/device. Report implementation/integration contract and exact tests, no commit.

## Task 4: Integration, independent review and live release

Files: native LauncherActivity/ErpApi/MobileWorkspace/manifest; DMS latest release metadata; APK instructions and ERP operations handoff; release scripts/receipts under C:\dev\.cache\erp-mobile and C:\dev\mobile_app\build. Root owns these.

- [ ] Wire same-session HR API and navigation, account/lock cleanup and safe renewal upload completion/return. Build 4.1.0/code10, preserve DMS behavior. Add relevant integration/session tests for new transport and routing.
- [ ] Dispatch independent database/API and Android source/security reviews as tasks settle, fix actionable High/Medium findings, verify exact source and test receipts. Review full branch too. Native/real-device acceptance stays pending.
- [ ] Review exact migration plus target/history/schema prerequisites and local synthetic proof, apply reviewed file to live only with checksum/history/receipt. Verify installed functions/RLS/permission deltas with metadata/deny probes; no employee writes. Record source, not just claimed completion.
- [ ] Run shipping types/lint/required CI and final Java/D8/signature/alignment/package/source-hash checks; create reviewed PR and merge/deploy exactly tested source preserving current production. Verify fresh expected build HTTP health/readiness/API protection; record migration compatibility and native role workflow acceptance limits.
- [ ] Put final single APK in project root, retain previous backup, refresh ANDROID_APK.md, ERP handoff and combined receipt with checksum/deployment/tests/pending physical acceptance. Mark this plan and ledger complete only when done.
