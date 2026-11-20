# Native Android HR Release 1

Owner approval: 20 November 2026, explicit request to implement the previously recommended first HR release in the same app, connect live ERP and deliver a signed APK. This approval includes necessary reviewed API/database changes and deployment; do not reopen permission questions already answered. Implementation choices below are agent decisions within that scope.

## Intent and scope

Extend the existing native Android ALGT Mobile DMS app with HR profile, leave, attendance/shifts, supervisor timesheets, compliance renewals and HR approvals. Serve employees, authorized direct-report supervisors and HR officers according to current ERP role/company/branch authority. Preserve every DMS upload/AI/preview/share/offline feature and the retired web launcher. Retain the existing signer/package and use version 4.1.0/code 10.

## Approach

Selected: native HR screens plus a protected /api/mobile/hr/v1 bearer API that uses the same verified ERP session as DMS, existing request-bound Supabase clients, authoritative HR readers and native transactional mutations. Add only narrow self-service business operations where existing management-only writers cannot serve employees. Reuse the current operation/revision/receipt patterns for retry safety. Alternatives considered: web views (contrary to owner's native-app direction); direct unrestricted mobile table writes (cannot preserve ERP workflows). No new framework, external service or privileged secret in APK.

## User journeys

Employee enters HR from Home/main navigation. My Profile shows actual linked employee, employee code, employment/job/manager/site and permitted contact details. Profile correction requests cover contact/emergency fields; identity/employment/salary are never self-edited. Leave shows ERP period balances including unknown states, requests by status, type/date/reason form and an optional permitted DMS certificate; own eligible pending cancellation is explicit. Attendance shows history, punches/shifts and overtime with a correction-request form, not a forged approved summary. Renewals show current HR identity/insurance/access/training expiry and link a selected uploaded DMS replacement to an officer-review request. Existing employee DMS filing and AI review is reused, with verified employee identity and current document access. Approvals shows actionable exact-version HR requests/leaves to authorized officers, plus own request history; no self approval.

Supervisor timesheets select an authorized company, branch/site/team/date, page the actual roster, enter actual start/end/breaks/attendance type and save/approve through existing ERP eligibility/operation/fingerprint rules. No work interval for absence/approved leave, no stale overwrite, no guessed company/site, no GPS/QR/location tracking. Employee self clock-in is excluded from this release.

## Authorization and data

Every request authenticates current user/session (inactive/password-change revoked sessions fail). Resolve own employee from erp_user_employee_links only. Existing .self and .team record predicates remain authoritative and exact company/branch assignments are preserved. Existing management/independent-approval controls serve staff actions. Any new self-submit permissions require explicit scope classification and native two-company/sibling-branch allow/deny tests; grant only intended existing self-service roles, never broad hr.*. Record every role permission delta in migration/release receipt. A request flag is never authority. No service-role data bypass in the mobile API.

New self-service operations, if required, are implemented in a timestamped reviewed SQL migration in C:\dev\agt-erp\supabase\migrations, mirrored byte-identically to release worktree. Prefer existing transactional internals and validations; never broaden common permission helpers or bypass immutable/audit/leave allocation rules. Validate actor, subject, destination, current revision, attachment membership, state transition and independent approver inside the database. Audit and idempotent operation receipt are required; uncertain retries preserve the same original operation. Do not test business writes on live employees. Apply only after local synthetic allow/deny and regression tests, exact target/schema/history review and receipt/hash.

HR reads are explicitly bounded/paginated, redacted by field/medical/banking authority, distinguish restricted/unavailable from empty/zero, and expose only user-facing labels. Payroll/payslip/clinical records, letters, recruitment, PPE/accommodation, payroll calculation and unrestricted HR admin editing are outside Release 1. No new web menu is added.

## Native interaction and privacy

Reuse current ERP palette/logo, native layout/input controls, lock/security/session fence and encrypted per-account storage. New HrWorkspace Java unit consumes the HR API through ErpApi.hrCall. Launcher owns navigation/incoming intents and account lifecycle. Account switch/logout/revocation clears private HR UI/drafts; asynchronous callbacks cannot reveal prior-account data. Dates are Dubai calendar dates and can be cleared when optional. Forms display actionable validation and successful ERP receipts. Pending offline/unconfirmed changes never display Approved or Saved. Queue no approval decisions offline. HR form drafts may be stored encrypted until explicit online submit; existing manual offline document leases remain unchanged.

## API integration contract

Responses use {success:true,data:...} or {success:false,error}, private/no-store and Vary Authorization. POST command op is discriminated and bounded, unauthorized valid commands return 401. Planned command groups: profile; employees/scope choices; time records and leave options/balances; leave submit/cancel; self requests submit/list; renewal records/request; approval opening/decision; roster choices/read/opening/save/receipt. Exact names/JSON shapes are documented by backend implementer in build/mobile-hr-api-contract.md before native binding. Capability fields inform menus but never replace record authorization.

## Completion and acceptance

Source/unit/native SQL integration tests cover own/team/cross-company/branch rights, tampering/revocation, independent approvals, stale versions, leave policy/overlap/allocation, payroll/medical non-disclosure, duplicate/uncertain operations, account changes, interrupted submit and DMS regressions. Full native compile/D8/signature/alignment and shipping TypeScript/lint/required CI must pass. Preserve production predecessor and concurrent changes, deploy exactly reviewed API, verify expected build/readiness/authenticated routes non-browser, sign one C:\dev\mobile_app\ALGT-Mobile-DMS.apk and update handoff/receipt. Browser or computer/device control is prohibited without new explicit owner instruction; physical phone acceptance stays pending.
