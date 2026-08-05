# 04 — Module-by-Module Functional Audit

Audit date: 2026-08-05 · Method: navigation registry + 213 routes + server-action inventory + live DB counts + targeted line-level traces. Runtime-click evidence unavailable (doc 09 §4); statuses are source/DB-derived.

## Module catalogue (derived, not from README)

| # | Module | Routes | Server actions | Live data | Verdict |
|---|---|---|---|---|---|
| 1 | Auth & profile | 8 | features/auth | 5 users | **Working** — full lifecycle incl. forced password change, account-disabled |
| 2 | Users/RBAC/permissions | 6 | users.ts, roles.ts, permissions.ts | 17 roles, 282 perms | **Working** — but typecheck broken here (72 errors cluster, doc 09) |
| 3 | Organizations & branches | 6 | organizations.ts, branches.ts | 3 cos, 2 branches | **Working (CRUD)** |
| 4 | Common master data | 19 | common-master-data/* | populated | **Working** |
| 5 | Geography master data | 15 | master-data | populated | **Working** |
| 6 | Party Master (CRM-ish) | 12+record | 14 action files (contacts/addresses/bank/licenses/tax/finance/notes) | 113 parties | **Working — deep**. Standalone `vendors` table (0 rows) is a dead duplicate of party-type vendors → DB-00x |
| 7 | Finance basics (currencies, payment terms, tax, banks, cost/profit centers) | 18 | master-data | populated | **Working — masters only; no accounting engine** |
| 8 | UOM | 9 | master-data | populated | **Working** |
| 9 | Lookups | 8 | lookups.ts | populated | **Working** |
| 10 | HR core (employees, search, dashboard, doc browser) | 8+record | employees.ts, search.ts, dashboard.ts, doc-browser.ts | 4 employees | **Working** |
| 11 | HR actions (PRO, disciplinary, approvals, EOS) | 5 | actions.ts | small | **Working — workflows present** |
| 12 | HR time (attendance, leave, shifts, overtime) | 4 | time.ts (1,617 lines, 40+ actions) | 0 punches, 1 leave req | **Working but unexercised; no biometric/device intake; non-transactional balance updates (HR-002)** |
| 13 | HR payroll & WPS | 2 | payroll.ts (1,390 lines) | profiles only | **Partial by design — profile/readiness management only; NO payroll run engine, payslips, or WPS SIF output (HR-003, see below)** |
| 14 | HR recruitment | 7+record | recruitment.ts | 1 candidate | **Working** |
| 15 | HR operations (assignments, readiness, blocks) | 4 | operations.ts | small | **Working** |
| 16 | HR settings | 19 screens | settings.ts | populated | **Working** |
| 17 | DMS | 20 user + 12 admin | **55 action files** | 648 documents | **Working — most complete module** (upload→OCR→AI→review→apply→retention→expiry) |
| 18 | Notifications & email | 5 | notifications/*, email.ts | 293 queue (292 sent) | **Working** |
| 19 | Numbering | 3 | numbering.ts | rules live | **Working** — but SEC-003 anon RPC |
| 20 | Reports & official documents | 10 | reports/*, output/*, pdf/* | 34 registry, 155 runs | **Working with gaps — 4 active reports have no fetcher (HR-001)** |
| 21 | Branding | 2 | branding/* | assets live | **Working** |
| 22 | AI platform (settings, dashboard, audit explainer, data quality, duplicates, compliance, risk, search, assistant) | 9 | ai/* + dms/ai-* | erp_ai_* live | **Working (admin surfaces)** |
| 23 | Audit/activity log | 1 | audit.ts, lib/audit | audit_logs live | **Working** |
| 24 | **Sales / Purchasing / Inventory / Finance-accounting / Fleet / Workshop / HSE** | 0 (6 disabled stubs) | none | no tables | **MISSING — placeholder menu items only (ERP-GAP-001)** |

## Deep HR audit (Phase 9) — key findings

### HR-001 — 4 active registry reports have no fetcher — Medium · Confirmed
`HR_BANK_SALARY_TRANSFER, HR_EMBASSY_LETTER, HR_HANDOVER_FORM, HR_LEAVE_CONFIRMATION` active in `erp_report_registry` but absent from `REPORT_FETCHERS` (`report-fetchers.ts:82-120`) → runtime error "not implemented in this phase (REPORT.2)" (`report-runner.ts:228`).

### HR-002 — Leave approval mutates balances non-transactionally — High · Confirmed
`time.ts:958-1025` (`approveLeaveRequest`): (1) status guard via pre-read, not enforced in the UPDATE (`update` lacks `.eq("approval_status","pending")`) → double-approval race; (2) balance `used_days` updated by **read-modify-write in app code** (`time.ts:991-1009`) → lost-update under concurrency; (3) **if no balance row exists the increment is silently skipped** while audit still logs "approved" (`time.ts:1001-1010, 1012-1020`); (4) no transaction/compensation between request update and balance update. Same pattern class likely in overtime/rejection/cancel paths (Highly likely — same file, same idiom).

### HR-003 — No payroll processing engine — Informational (by design) · Confirmed
Repo-wide search: zero hits for payslip/payroll-run/SIF/WPS-file generation. `payroll.ts` covers profiles, components, gross/basic calc, revisions, holds, WPS profile + readiness list. Payroll **execution** (period run, paysheet, SIF export, posting) does not exist. This is precisely LI HRMS's strongest area (doc 08).

### HR-004 — Attendance has no capture path — Medium · Confirmed
`createEmployeeAttendancePunch` exists (manual), `employee_attendance_punches` has **0 rows** live, no device/biometric/import integration in src (grep: no zkteco/biometric/collector). Daily summaries + corrections + approval exist, but nothing produces punches at scale.

### HR-005 — UAE-specific masters present — Positive · Confirmed
MOHRE establishments, Emirates ID/visa document types, WPS profiles, emirates/cities geography, Arabic-aware DMS extraction — UAE fit is designed-in (contrast LI's India-specific payroll).

### Other spot-checks (Confirmed)
- Guard idiom consistent across sampled pages/actions (getAuthContext + hasPermission + admin client).
- Audit logging via `logAudit` called in mutating HR actions with before/after values + company scope.
- Soft-delete (`deleted_at`) + archive actions consistent in sampled modules.
- Validation: zod schemas in `lib/validation`; sampled actions validate `input: unknown` — but doc 09 shows 31+ `no-explicit-any` lint errors in `master-data/lookups.ts` etc.

## CRUD-island analysis (Phase 12 preview)
- **Leave → balance**: effect exists but unsafe (HR-002).
- **Overtime approve**: status-only; no payroll downstream exists to affect (consistent with HR-003).
- **DMS apply-to-ERP**: full pipeline with review queue + correction flows — NOT an island ✅.
- **Asset/PPE issue**: reports exist (`HR_ASSET_ISSUE_REPORT`, `HR_PPE_ISSUE_REPORT`); custody return/reversal workflow Needs verification.
- **EOS**: cases + clearance form report exist; settlement calculation engine absent (LI comparison, doc 08).
