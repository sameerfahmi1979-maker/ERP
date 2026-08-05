# CHATGPT — AGT ERP Audit Remediation and Implementation Plan

**Document ID:** CHATGPT-ERP-AUDIT-PLAN-20260805  
**Date:** 5 August 2026  
**Version:** 1.1  
**Status:** Proposed implementation and review baseline  
**Primary application:** `C:\dev\agt-erp`  
**Audit source:** `C:\dev\agt-erp\implementation_Review\KIMI_FULL_ERP_AUDIT_20260805`  
**Former LI HRMS reference:** Removed from the project tree on 5 August 2026; retained audit reports and comparison matrices remain historical reference material  
**Supabase project:** `mmiefuieduzdiiwnqpie`

### Revision history

| Version | Date | Change |
|---|---|---|
| 1.0 | 5 August 2026 | Initial remediation and implementation baseline. |
| 1.1 | 5 August 2026 | Recorded removal of the LI HRMS source tree; marked the Kimi inventory/error totals as historical; established a fresh TypeScript baseline of 72 errors: 58 under AGT `src/**` and 14 under `spikes/**`. |

---

## 1. Purpose

This document converts the Kimi audit results and the independent ChatGPT review into a controlled remediation and implementation plan for AGT ERP.

It is intended to be the long-term reference for:

- validating audit findings before making changes;
- containing urgent security and data-integrity risks;
- restoring reliable engineering and release gates;
- reconciling source, migrations, generated types and the live database;
- completing unfinished HR workflows;
- adding approved capabilities identified through the retained LI HRMS comparison evidence using AGT's architecture;
- deciding whether and when to build the missing non-HR ERP modules;
- recording progress, evidence, approvals and release decisions.

The plan favors stabilization and controlled extension. It does not recommend rewriting AGT ERP.

---

## 2. Current decision summary

### 2.1 Product position

AGT ERP currently has a strong foundation for:

- HR employee and candidate workspaces;
- UAE compliance, PRO, MOHRE and WPS readiness;
- DMS, OCR, AI review and document-to-ERP workflows;
- official documents and report generation;
- notifications and email queues;
- master data, parties, organizations, users and permissions;
- operational assignments, readiness, blocks, PPE and accommodation.

It is not yet a complete ERP. Sales, purchasing, inventory, accounting/finance, fleet, workshop and HSE transaction engines are not currently implemented. Their disabled menu entries represent planned scope, not working modules.

### 2.2 Release position

The current source should not be declared production-ready because:

- a live anonymous vault-write issue was demonstrated;
- official numbering RPC execution may be reachable anonymously;
- TypeScript checks still fail after LI HRMS removal: the refreshed baseline is 72 error lines, consisting of 58 under AGT `src/**` and 14 under `spikes/**`;
- the production build ignores type errors;
- linting is not operational as a repository gate;
- no CI/CD quality pipeline exists;
- generated database types and live schema are not reconciled;
- critical authorization and RLS isolation tests are absent;
- leave approval is non-transactional;
- authenticated runtime and UI testing has not been completed in an isolated environment.

### 2.3 Strategic decision

Keep AGT ERP as the target platform. The LI HRMS source has been removed from the working project. Use the retained audit reports and comparison matrices only as historical requirements/workflow references for attendance, leave and payroll. If the LI source is ever reacquired for verification, place it outside the AGT application/compiler root. Do not port LI HRMS code, Mongo/Mongoose models, JWT authorization, India-specific formulas, INR/IST assumptions, duplicated route structures or browser-generated official PDFs.

### 2.4 Verified baseline after LI HRMS removal

On 5 August 2026, the following was rechecked directly:

- `C:\dev\agt-erp\source HRMS` no longer exists;
- `npm run typecheck` still exits with failure;
- total TypeScript error lines are now **72**;
- **58** errors originate under the current AGT `src/**` tree;
- **14** errors originate under `spikes/**`;
- the large LI HRMS error contribution recorded by Kimi is no longer part of the current repository baseline.

These 72 errors replace the historical 1,257-error total for future planning and acceptance decisions.

---

## 3. Audit reliability and required follow-up

The Kimi package is a useful first-pass triage report, but it is not a completed line-by-line audit.

Confirmed limitations:

- all 4,453 rows in the historical Kimi file-review ledger remain `pending` and `not started`; this count included 1,154 LI HRMS files that have since been removed and is no longer the current repository inventory;
- the route matrix is structural and does not include full component/action/database/runtime coverage;
- no authenticated runtime session was used;
- no runtime screenshots were captured;
- no direct PostgreSQL catalogue access was available;
- live policies, grants, triggers, indexes, cron jobs, realtime publications and authentication settings were not fully audited;
- only a subset of findings received the full evidence template;
- the LI comparison CSV has at least one malformed record;
- the audit incorrectly describes the empty `li-hrms-mobile` folder as an application;
- the live security probe created a junk vault secret despite the requested read-only boundary.

Therefore:

1. High-risk findings must be treated seriously.
2. Every live database change must be preceded by direct catalogue verification.
3. Medium/low source-derived conclusions must be reproduced before implementation.
4. The file-review ledger must be completed during the staged follow-up audit.
5. No “full audit complete” or “production-ready” claim is permitted until the release gates in this document pass.

---

## 4. Non-negotiable implementation rules

1. Never edit the live database manually without an approved migration or controlled remediation record.
2. Take or confirm a recoverable backup before sensitive schema, grant or data-cleanup work.
3. Test database changes first in an isolated Supabase project.
4. The LI HRMS source is no longer part of the project. If it is ever restored for comparison, keep it outside the AGT application/compiler root and never run its repair, clear, seed, replay, payroll or biometric scripts against AGT data.
5. Never copy secrets into code, reports, screenshots or Git.
6. All administrative/service-role access must have an explicit server-only boundary and scope justification.
7. All multi-step financial, leave, payroll and state-transition operations must be transactional and idempotent.
8. All user-facing actions require server-side permission and company/branch/entity-scope enforcement.
9. Every implementation package requires tests, audit events, acceptance criteria and rollback instructions.
10. UAE payroll, WPS, EOS, leave and legal rules require current professional confirmation before implementation.
11. Existing user changes in the working tree must be preserved.
12. Findings are closed only with evidence, not by changing their status in a document.

---

## 5. Severity and work-priority model

| Level | Meaning | Required response |
|---|---|---|
| L0 — Containment | Active security/data-integrity exposure | Verify and contain immediately. |
| L1 — Stabilization | Prevents reliable release or safe development | Complete before feature work. |
| L2 — Existing workflow completion | Advertised/current feature is broken or incomplete | Complete before broad rollout. |
| L3 — Core HR expansion | Missing operational HR processing | Implement after stable foundations. |
| L4 — Full ERP expansion | New business modules outside current working product | Separate product program and approval. |

---

# Part I — Immediate containment and engineering recovery

## 6. Package CHATGPT-0.1 — Live RPC and vault containment

**Priority:** L0 / Immediate  
**Primary findings:** SEC-002, SEC-003, SEC-004  
**Target duration:** Same day to three working days

### Objective

Prevent anonymous or unintended execution of sensitive live RPC functions and remove the artifact created during the Kimi audit.

### Required work

1. Obtain authorized read-only SQL catalogue access.
2. Inventory all live functions with:
   - schema;
   - identity arguments/signature;
   - owner;
   - language;
   - security invoker/definer status;
   - `search_path`;
   - function ACL/grants;
   - actual application consumers.
3. Verify the exact live signatures and access grants for:
   - `erp_vault_create_secret`;
   - `erp_vault_get_secret`;
   - `erp_vault_update_secret`;
   - `generate_next_reference_number`;
   - `preview_next_reference_number`;
   - `detect_possible_party_duplicates`;
   - DMS job claim/complete/fail/recovery RPCs;
   - every other exposed RPC.
4. Locate the audit-created junk vault entry named `x`, record its identifier privately and confirm it is not referenced.
5. Remove that entry using an approved, auditable remediation.
6. Create a migration that applies least-privilege grants by function signature.
7. Keep genuinely public functions public only when intentional, such as token-based public document verification.
8. Do not revoke authenticated access from every RPC blindly. Classify each function by intended caller.
9. Add automated anonymous/authenticated/service-role privilege probes.
10. Record before/after grant evidence without exposing secret values.

### Acceptance criteria

- Anonymous vault create/get/update attempts fail closed.
- The audit-created junk secret no longer exists.
- Anonymous callers cannot consume numbering sequences.
- Duplicate-detection results are permission-controlled.
- Required service and authenticated application workflows continue working.
- All live RPCs have documented intended callers and explicit grants.
- CI contains a function-grant security check.

### Rollback

Maintain a reviewed grant manifest. If an application workflow fails, restore only the intended caller grant for the exact function signature; never restore blanket `PUBLIC` execution.

---

## 7. Package CHATGPT-0.2 — TypeScript, lint and build recovery

**Priority:** L1  
**Primary findings:** TEST-001, TEST-002, TEST-003, TEST-004, DB-004  
**Target duration:** Three to seven working days

### Objective

Restore trustworthy local and CI quality gates.

### Required work

1. Update `tsconfig.json` to exclude independent/reference trees:
   - `spikes/**` unless a spike has its own configuration;
   - any future external/reference source trees restored under the repository;
   - generated/build/cache/output folders.
2. Update the ESLint flat configuration with equivalent ignores.
3. Do not rely on legacy `.eslintignore` behavior.
4. Regenerate `src/types/database.ts` from the intended live/staging schema using UTF-8 output.
5. Reintroduce or replace any legitimate convenience type aliases intentionally.
6. Fix the refreshed baseline of 58 TypeScript errors under AGT `src/**`.
7. Exclude `spikes/**` from the main application typecheck or give each active spike its own TypeScript configuration, resolving the current 14 spike errors independently.
8. Fix source lint errors, prioritizing:
   - React hook-rule violations;
   - parser/encoding errors;
   - incorrect component creation during render;
   - unsafe `any` in server/database boundaries;
   - unescaped JSX content;
   - stale/debug code.
9. Remove `typescript.ignoreBuildErrors` from `next.config.ts`.
10. Verify the production build with type validation enabled.
11. Normalize edited source files to UTF-8 and consistent line endings.

### Acceptance criteria

- `npm run typecheck` returns zero errors for AGT ERP.
- scoped lint returns zero errors.
- production build passes without ignored type errors.
- Removed or future external reference systems remain outside the AGT compiler/linter scope.
- generated types are reproducible and UTF-8.

---

## 8. Package CHATGPT-0.3 — CI and repository safety net

**Priority:** L1  
**Primary findings:** OPS-001, TEST-005  
**Target duration:** Three to seven working days; can run beside Package 0.2

### Required CI gates

```text
Install with locked dependencies
  → typecheck
  → scoped lint
  → unit tests
  → database/migration validation
  → generated-type drift check
  → SQL function-grant and RLS lint
  → secret scan
  → dependency audit policy
  → production build
```

### Additional work

- Add branch/PR protection so failed gates cannot be bypassed casually.
- Archive logs as CI artifacts without secrets or PII.
- Document the supported Node/npm versions.
- Remove or isolate obsolete prototypes and build artifacts after confirming they have no consumers.
- Keep any future LI HRMS/reference checkout in a separate workspace outside the AGT application root and pipeline.

### Acceptance criteria

- A deliberately introduced type, lint, test or insecure-grant defect fails CI.
- Main/release branches cannot merge without required checks.
- CI does not require 16 GB solely because unrelated source trees are included.

---

## 9. Package CHATGPT-0.4 — Small security and operational hygiene

**Priority:** L1  
**Primary findings:** SEC-001, SEC-005, SEC-006, SEC-007, PERF-002, OPS-002, OPS-003

### Required work

- Add `import "server-only"` to the administrative Supabase client boundary.
- Add a lint restriction preventing administrative-client imports into client components.
- Inventory every administrative-client call and document scope enforcement.
- Unify middleware and protected-layout authentication behavior.
- Gate or exclude development/QA routes from production.
- Remove client-side email payload logging.
- Cache repeated authentication-context resolution within a request.
- Refresh `.env.local.example` variable names and descriptions without values.
- Ensure `NODE_TLS_REJECT_UNAUTHORIZED=0` cannot reach staging or production.
- Add a minimal authenticated health/readiness endpoint without exposing internals.

### Acceptance criteria

- Administrative credentials cannot be imported across client boundaries.
- Protected route behavior is covered by automated tests.
- No sensitive email payload is logged in the browser.
- Development diagnostics are unavailable in production.
- Authentication context is resolved once per request where safe.

---

# Part II — Database and authorization assurance

## 10. Package CHATGPT-1.1 — Live schema and migration reconciliation

**Priority:** L1  
**Primary findings:** DB-001, DB-002, DB-003, DB-004

### Objective

Establish one reproducible source of database truth.

### Required work

1. Export live catalogue metadata with read-only SQL.
2. Compare live schema, committed migrations, generated types and application references.
3. Extend drift analysis to functions, triggers, policies, grants, views, storage and cron—not only tables.
4. Investigate the 18 live objects reported without migrations.
5. Confirm ownership and business use before altering the apparent EV-charging objects.
6. Reconcile shadow objects including `audit_log`, `notifications`, `shifts` and `system_settings`.
7. Determine whether the eight migration-only objects were deliberately superseded.
8. Create migrations documenting the final intended state.
9. Prove the entire migration chain can build a clean database from zero.
10. Regenerate types and run application tests against the rebuilt schema.

### Safety rule

No live table or view is dropped merely because it is empty or appears unrelated. Ownership and external consumers must be confirmed first.

### Acceptance criteria

- A clean test database can be created from committed migrations.
- Documented exceptions are zero or explicitly approved.
- Generated types match the clean and live schema.
- No application code references shadow/obsolete objects.

---

## 11. Package CHATGPT-1.2 — Company, branch and object-scope authorization

**Priority:** L1 / Security critical  
**Related concerns:** service-role usage, flat permission resolution, unverified tenant isolation

### Objective

Prove that a user authorized in one company or branch cannot access another company's records through direct IDs, searches, exports, downloads, server actions or administrative-client paths.

### Required work

- Design an isolated two-company/two-branch security fixture.
- Test every sensitive action as:
  - unauthenticated;
  - inactive/suspended;
  - correct permission/correct company;
  - correct permission/wrong company;
  - correct company/wrong branch;
  - guessed direct record ID;
  - system/group administrator.
- Create a reusable scoped-authorization helper.
- Resolve permission assignment scope instead of relying only on a flat permission-code set.
- Prefer the authenticated RLS client for reads and target existence checks.
- Permit service-role writes only after explicit scoped authorization.
- Test employee, candidate, payroll, medical, document, report, user and audit data.
- Verify exports and DMS links enforce both source-document and target-entity scope.

### Acceptance criteria

- All negative cross-company and cross-branch tests fail closed.
- Administrator bypass is deliberate, minimal and audited.
- Every service-role call has a documented justification and target-scope check.

---

## 12. Package CHATGPT-1.3 — RLS, storage and security-definer verification

**Priority:** L1

### Required work

- Extract actual live policies and compare them with migrations.
- Review permissive-policy combinations.
- Verify update policies include appropriate `WITH CHECK` rules.
- Review all `SECURITY DEFINER` functions, owners, `search_path` and grants.
- Verify private storage bucket policies for preview, download, upload, move, link, archive and hard delete.
- Confirm authentication settings, signup behavior, MFA options and rate limits.
- Confirm Realtime publications and company filtering.
- Confirm pg_cron/Edge Function schedules and their secrets.

### Acceptance criteria

- RLS and grant tests run automatically in CI/staging.
- No sensitive table, function or storage path is anonymously accessible unless explicitly intended.
- Live and migration policy definitions match.

---

# Part III — Complete the audit and stabilize existing functionality

## 13. Package CHATGPT-2.1 — Isolated staging and runtime audit

**Priority:** L1

### Objective

Complete the evidence Kimi could not safely obtain from the live tenant.

### Required work

1. Provision an isolated Supabase staging/test project.
2. Apply migrations from zero.
3. Seed synthetic companies, branches, roles, users, employees, candidates, parties, documents and HR transactions.
4. Use synthetic files for DMS/OCR/AI testing.
5. Run authenticated browser tests over every route and permission class.
6. Capture sanitized desktop, tablet and mobile screenshots.
7. Record console, network, hydration and server errors.
8. Run accessibility scans and keyboard-only checks.
9. Test empty, loading, partial-failure, error and access-denied states.
10. Exercise DMS upload → OCR → AI → review → apply and official PDF verification.

### Required deliverable corrections

- Generate a fresh current-repository file inventory after LI HRMS removal, preserve the old 4,453-row Kimi ledger as historical evidence, and complete the new ledger honestly.
- Add component/action/database/state/runtime columns to the route matrix.
- Correct the LI comparison CSV.
- Correct the empty mobile-app claim.
- Expand every High/Critical finding to the full evidence template.
- Reconcile finding confidence counts.

### Acceptance criteria

- Every in-scope product-source file has a completed review status and depth.
- Every major route has a runtime result.
- All critical workflows have reproducible evidence.
- No production data is used in screenshots or test fixtures.

---

## 14. Package CHATGPT-2.2 — HR dashboard, routes and work queues

**Priority:** L2

### Required work

- Rebuild HR dashboard metrics against current generated types and live schema.
- Remove invalid field names, table names and status values.
- Remove silent zero fallbacks for failed queries.
- Replace fixed workforce caps with correct scoped aggregates.
- Fix operations employee links to include `/record/`.
- Make employee workspace sections URL-driven.
- Complete route/sidebar/workspace-registry alignment.
- Decide and document ownership of global versus employee-record actions.
- Wire currently unreachable server actions or remove obsolete actions.

### Acceptance criteria

- Seeded dashboard fixture values match exactly.
- Every HR drill-down opens the correct employee/candidate and section.
- Partial dashboard failures are visible and actionable.
- All HR sidebar destinations have consistent server enforcement.

---

## 15. Package CHATGPT-2.3 — Transactional leave and overtime

**Priority:** L2  
**Primary finding:** HR-002

### Required work

- Implement database functions for approve, reject, cancel, reopen and correct.
- Enforce the expected current status inside the update.
- Update request, balance/ledger, audit and notification in one transaction.
- Make repeated requests idempotent.
- Create a missing balance/ledger record where policy allows.
- Add concurrency tests for double approval and simultaneous requests.
- Apply the same state-transition standard to overtime and other HR approvals.
- Reconcile existing approved requests with balances before release.

### Acceptance criteria

- Concurrent approval results in one effective transition.
- No approved request can exist without its balance/ledger effect.
- Cancellation produces a compensating effect exactly once.
- Audit and notifications are emitted exactly once.

---

## 16. Package CHATGPT-2.4 — Existing HR configuration, audit and reports

**Priority:** L2

### Required work

- Implement the employee Audit tab using existing audit data.
- Replace generic settings editors where specialist fields exist.
- Complete readiness, role/site matrix and approval-workflow editors.
- Remove caller-controlled database table names from generic settings actions.
- Implement or deactivate the four active reports lacking fetchers:
  - Bank Salary Transfer;
  - Embassy Letter;
  - Handover Form;
  - Leave Confirmation.
- Resolve duplicated/retired/overlapping routes after runtime confirmation.
- Add field masking and export audit where needed.

### Acceptance criteria

- Every active report runs successfully or is intentionally inactive.
- Every settings area can configure all business-relevant fields.
- Employee history is visible with actor, time, source and change summary.

---

# Part IV — Build the missing HR processing engines

## 17. Package CHATGPT-3.1 — Work calendar and shift foundation

**Priority:** L3

### Scope

- company/site work calendars;
- weekends and public/company holidays;
- partial-day holidays;
- shift definitions, segments, breaks and cross-midnight rules;
- effective dates and applicability;
- draft/published roster;
- bulk assignment, copy cycle, import and auto-fill preview;
- roster violations and employee acknowledgement.

### LI HRMS reuse decision

Use the retained Kimi/ChatGPT LI comparison reports as requirements references for multi-shift, half-day and roster-conflict scenarios. The original LI source is no longer available in the project, so no algorithm should be treated as verified line-level evidence unless the source is deliberately reacquired outside the AGT repository. Reimplement approved requirements in Postgres/TypeScript using UAE timezone and AGT permissions.

### Exit gate

Published rosters deterministically define expected attendance for every employee/date and preserve complete history.

---

## 18. Package CHATGPT-3.2 — Biometric and attendance engine

**Priority:** L3

### Scope

- vendor-neutral biometric device registry;
- device/user mapping;
- immutable raw attendance events;
- idempotent ingestion and replay;
- synchronization health and device status;
- spreadsheet import with preview and batch history;
- automatic shift detection;
- missing/double/ambiguous-punch exception queue;
- daily calculation with rule version and explanation;
- corrections and recalculation;
- monthly summary, validation and lock;
- live attendance operations screen.

### Exit gate

The same raw events and policy version always reproduce the same daily result. No payroll period can freeze with unresolved critical attendance exceptions.

---

## 19. Package CHATGPT-3.3 — Leave ledger, accrual and related time workflows

**Priority:** L3

### Scope

- append-only leave ledger;
- entitlement, accrual, use, reversal, expiry, carry-forward and adjustment entries;
- monthly accrual and year-end preview/apply jobs;
- reconciliation and yearly/monthly snapshots;
- holiday/roster-aware duration calculation;
- overlap, eligibility, balance and payroll-lock checks;
- On Duty;
- compensatory leave;
- short-duration permissions;
- overtime eligibility and approved hours;
- employee/manager self-service request and approval queues.

### Legal gate

UAE leave/accrual, carry-forward and deduction rules must be reviewed and signed off before implementation.

### Exit gate

Every displayed balance is explainable as the sum of immutable ledger entries and reconciles with approved requests.

---

## 20. Package CHATGPT-3.4 — Shared workflow engine

**Priority:** L3

### Scope

- versioned workflow definitions;
- conditional approval steps;
- company/branch/amount/type applicability;
- named user, manager, role and approval-role resolution;
- delegation and out-of-office handling;
- reminders, SLA escalation and expiry;
- approve, reject, return, cancel and reopen;
- immutable history;
- reusable inbox for employee and manager self-service.

### Exit gate

Leave, OD, overtime, loans, employee movements and resignation use one consistent workflow engine rather than separate hardcoded chains.

---

# Part V — UAE payroll and employee lifecycle

## 21. Package CHATGPT-4.1 — Payroll policy and period foundation

**Priority:** L3 / Major program

### Scope

- effective-dated payroll groups and calendars;
- salary components and formula versions;
- employee eligibility and proration;
- payroll periods and state machine;
- locked attendance/leave/overtime inputs;
- draft calculation and immutable versions;
- employee exceptions and variance review;
- maker/checker/four-eyes approval;
- freeze, approve, complete, reopen and rollback controls.

### Exit gate

The same locked inputs and formula version reproduce the same result, with complete calculation evidence.

---

## 22. Package CHATGPT-4.2 — Payroll calculation and adjustments

### Scope

- basic and earned salary;
- allowances and deductions;
- unpaid leave and attendance effects;
- overtime;
- arrears and one-time adjustments;
- loans, salary advances and EMI schedules;
- joiner/leaver proration;
- holds and corrections;
- gross, deductions, net and rounding;
- period comparison and anomaly rules.

### Exit gate

Every payroll result can be traced to approved input records, policy versions and calculation steps.

---

## 23. Package CHATGPT-4.3 — Payslips, WPS and accounting outputs

### Scope

- immutable payslip snapshots;
- server-rendered verified payslip PDFs through AGT's official-output framework;
- employee payslip access;
- pay register and paysheet;
- WPS/SIF generation and validation;
- submission/payment/rejection/reconciliation states;
- accounting journal output and posting reference;
- controlled exports and audit.

### External gates

- Confirm WPS/SIF specifications with the current bank/exchange-house/provider.
- Confirm accounting integration requirements and chart-of-accounts mapping.
- Confirm data retention and employee access rules.

### Exit gate

An approved payroll produces reconciled payslips, WPS output and accounting results without manual spreadsheet reconstruction.

---

## 24. Package CHATGPT-4.4 — Employee movements, resignation, EOS and offboarding

### Scope

- promotion, demotion, transfer and increment cases;
- effective-dated job/manager/grade/salary assignments;
- employee-submitted profile changes;
- resignation and termination requests;
- notice and last-working-date history;
- handover and clearance orchestration;
- asset/PPE/access/document closure;
- UAE EOS/gratuity and final settlement;
- open loan/advance settlement;
- user-access deactivation;
- employee inactive-state application.

### Exit gate

Every employee movement preserves history, and every departure reconciles HR, time, payroll, assets, DMS and user access.

---

# Part VI — DMS, AI, reporting and operational maturity

## 25. Package CHATGPT-5.1 — DMS and AI security hardening

**Related findings:** SEC-008, PRIV-001

### Required work

- Frame uploaded/OCR document text explicitly as untrusted data in AI prompts.
- Require schema-constrained outputs and deterministic validation.
- Confirm external AI provider DPA, retention, training-use settings and region.
- Minimize or redact PII where full raw text is not required.
- Prove human review is mandatory before any ERP mutation.
- Test prompt injection, malicious documents and cross-company retrieval.
- Audit AI prompts/results without exposing raw sensitive content.

---

## 26. Package CHATGPT-5.2 — Observability and operations

### Scope

- application error monitoring/APM;
- request and job correlation IDs;
- health/readiness endpoints;
- queue dashboards and stuck-job alerts;
- scheduled data-quality monitors;
- backup/PITR confirmation;
- restore drill;
- deployment and migration rollback runbooks;
- performance/bundle analysis;
- dashboard and report query monitoring.

### Exit gate

Operations can detect, diagnose and recover from failures without inspecting production tables manually.

---

# Part VII — Full ERP scope decision

## 27. Package CHATGPT-6.1 — Decide the non-HR ERP program

**Related finding:** ERP-GAP-001

The absence of sales, purchasing, inventory, accounting, fleet, workshop and HSE is a product-scope decision—not automatically a defect.

Before implementation, create a signed scope and process blueprint for:

- lead/quotation/order/delivery/invoice/receipt;
- requisition/RFQ/quotation comparison/PO/receipt/vendor invoice/payment;
- items, warehouses, lots/serials, transfers, consumption and valuation;
- chart of accounts, journals, receivables, payables, cash/bank, tax and close;
- asset/fleet/workshop/HSE processes where required;
- cross-module approval, document, audit and accounting effects.

Do not activate disabled sidebar entries until their complete transaction engines, permissions, database design, reports and tests exist.

---

## 28. Findings-to-package map

| Finding/group | Implementation package |
|---|---|
| SEC-002/003/004 | CHATGPT-0.1 |
| TEST-001/002/003/004, DB-004 | CHATGPT-0.2 |
| OPS-001, TEST-005 | CHATGPT-0.3 |
| SEC-001/005/006/007, PERF-002, OPS-002/003 | CHATGPT-0.4 |
| DB-001/002/003 | CHATGPT-1.1 |
| Unverified company/branch/service-role scope | CHATGPT-1.2 and 1.3 |
| Incomplete audit evidence and runtime coverage | CHATGPT-2.1 |
| Dashboard, navigation and global queues | CHATGPT-2.2 |
| HR-002 | CHATGPT-2.3 |
| HR-001, audit/settings gaps | CHATGPT-2.4 |
| LI-GAP biometric/roster/attendance | CHATGPT-3.1 and 3.2 |
| LI-GAP leave/accrual/register/OD/CCL/permission | CHATGPT-3.3 |
| Workflow and self-service gaps | CHATGPT-3.4 |
| LI-GAP payroll/pay register/payslip/loans | CHATGPT-4.1 through 4.3 |
| LI-GAP movements/resignation | CHATGPT-4.4 |
| SEC-008/PRIV-001 | CHATGPT-5.1 |
| OBS-001/002, OPS-004 | CHATGPT-5.2 |
| ERP-GAP-001 | CHATGPT-6.1 |

---

## 29. Required review gates

### Gate A — Security containment complete

- RPC grants verified and corrected.
- Audit-created junk vault secret removed.
- Negative privilege probes passing.

### Gate B — Engineering baseline green

- Typecheck, lint, unit tests and build pass.
- CI required on protected branches.
- Generated types and migration drift checks pass.

### Gate C — Authorization assurance complete

- Two-company/two-branch negative tests pass.
- Service-role call-site review complete.
- Live RLS/function/storage policies match migrations.

### Gate D — Existing product stabilized

- HR dashboard/navigation repaired.
- Leave transitions transactional.
- Active reports work.
- Employee audit/settings/work queues completed.
- Staging runtime/UI/a11y audit passed.

### Gate E — Time and leave ready

- Work calendar, roster, attendance and leave ledger reconcile.
- Background jobs are idempotent and observable.
- UAE leave rules signed off.

### Gate F — Payroll ready

- Payroll calculations reproduce from locked inputs.
- Maker/checker approval and rollback work.
- Payslips, WPS and accounting outputs reconcile.
- UAE payroll/WPS/EOS sign-offs complete.

### Gate G — Production release

- All preceding gates pass.
- Backup/restore drill recorded.
- Security regression suite passes.
- No unresolved Blocker/Critical findings.
- High findings have documented acceptance or approved risk treatment.

---

## 30. Review cadence and evidence requirements

### Weekly implementation review

Record:

- packages in progress;
- findings opened/validated/closed;
- tests added and results;
- migrations created/applied;
- security or data incidents;
- decisions requiring business/legal input;
- new dependencies and risks;
- next-week commitments.

### Package completion review

Every package must include:

- source diff/PR reference;
- migrations and rollback instructions;
- automated-test evidence;
- security and permission evidence;
- screenshots with synthetic/masked data;
- performance impact;
- acceptance checklist;
- deployment evidence;
- updated audit findings and file-review ledger.

### Monthly architecture review

Review:

- service-role usage count;
- RLS/grant drift;
- dependency vulnerabilities;
- queue health and failed jobs;
- dashboard/report performance;
- documentation versus source drift;
- open legal/business decisions;
- roadmap sequencing and capacity.

---

## 31. Finding closure standard

A finding is closed only when all apply:

1. The root cause is corrected.
2. The correction is reviewed.
3. Tests reproduce the original failure and prove the correction.
4. Security/tenant denial paths are tested where relevant.
5. Database migrations and generated types are synchronized.
6. Runtime acceptance passes in staging.
7. Documentation and registers are updated.
8. Deployment and rollback evidence exists.

“Cannot reproduce,” “works on my machine,” a green build with skipped checks, or a manually edited status is not sufficient closure.

---

## 32. Future reviewer checklist

When this plan is reviewed later, answer:

- Which package is currently active?
- Have all earlier gates passed?
- Which findings remain Blocker, Critical or High?
- Is the live RPC grant exposure closed?
- Was the audit-created junk vault entry removed?
- Are typecheck, lint, tests and build green without bypasses?
- Does a clean migration rebuild match live?
- Are company/branch isolation tests passing?
- Is the file-review ledger genuinely complete?
- Was the ledger regenerated after removal of the historical LI HRMS source tree?
- Has authenticated runtime/UI testing been completed on staging?
- Which UAE legal/business rules have signed approval?
- Are new features built on AGT architecture using retained LI comparisons only as requirements references?
- Are disabled ERP menu items still honestly disabled until complete?

---

## 33. Initial action list

The first implementation session should do only the following:

1. Create a clean implementation branch and preserve the existing worktree.
2. Obtain approved read-only SQL catalogue access.
3. Verify the vault and numbering RPC signatures/grants.
4. Prepare the least-privilege grant migration and negative tests.
5. Identify and remove the audit-created junk vault entry through an approved remediation.
6. Update TypeScript/ESLint scope to exclude `spikes/**` and any future external/reference source trees.
7. Regenerate UTF-8 database types.
8. Resolve the refreshed baseline of 58 AGT `src/**` TypeScript errors and manage the 14 spike errors separately.
9. Regenerate the repository/file-review inventory so removed LI HRMS files are not counted as current scope.
10. Establish the first CI pipeline.
11. Stop and review Gate A and Gate B evidence before starting feature work.

---

## 34. Final direction

The correct target is not a copy of LI HRMS and not a fresh rewrite. It is a stabilized AGT ERP that keeps its strong DMS, UAE compliance, reporting, official-output and multi-company foundations, then adds reliable workforce processing in a controlled order:

```text
Security and release gates
  → database and tenant assurance
  → existing HR correctness
  → calendar/roster/attendance
  → leave ledger and self-service
  → UAE payroll/WPS/EOS
  → employee lifecycle
  → optional full ERP modules
```

This document is the baseline for future review. Amend it through dated revisions and decision records; do not silently replace its gates or history.
