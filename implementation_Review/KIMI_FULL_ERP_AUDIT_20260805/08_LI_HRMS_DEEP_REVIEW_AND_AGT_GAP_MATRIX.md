# 08 — LI HRMS Deep Review and AGT Gap Matrix

Audit date: 2026-08-05 · Source reviewed: `source HRMS/li-hrms-main` (actual source, not READMEs) · Machine matrix: [`registers/li_to_agt_feature_matrix.csv`](./registers/li_to_agt_feature_matrix.csv) (34 capabilities).

## 1. What LI HRMS actually is (Confirmed)

- **Stack:** Node/Express backend (26 feature modules, Mongoose/MongoDB + Redis/BullMQ + node-cron), Next.js frontend (31 workspace pages), standalone **biometric ADMS collector service** (`biometric/` — devices, commands, raw logs, S3 att-log upload, replay), `li-hrms-mobile` app, ~257 scripts (many destructive-sounding: `clearDatabase.js`, `repairRealData.js`, `reproduce_issue.js`, `simulate_fix.js` — **not executed**, per audit rule).
- **Maturity:** attendance + leaves + payroll are genuinely deep, with unit/integration/simulation tests (`__tests__` in payroll, leaves, attendance) — e.g. `payrollCalculation.integration.test.js`, `elPayrollBatchComplete.simulation.test.js`.
- **Repo hygiene (LI):** debug scripts and output dumps at backend root (`debug_*.js`, `debug_output.txt`, `monthly_summary_compare_*.txt`), root-level `test_output.txt`, `tmp/` — confirms it is a working-but-messy production codebase.
- **India-specific (Confirmed, 7,424 grep hits across 315 files):** ESI/PF/statutory deduction configs, INR formatting, Asia/Kolkata (IST) handling, Indian earned-leave/CL policy, hardcoded role names in places. **Not portable as-is to UAE.**

## 2. Independent quality verdict (per master prompt — do not assume production-ready)

Strengths: complete payroll **batch lifecycle** (freeze/approve/complete/recalculate/rollback via `payrollBatchService.js` + bulk tests), payslip **snapshots** (immutable `PayrollPayslipSnapshot`), leave **register with monthly/yearly snapshots and reconciliation**, biometric **replay** safety, attendance multi-shift/confused-shift/smart-IN detection, payroll-lock-aware leave flows (`payrollLockFlow.simulation.test.js`).
Weaknesses: Mongo transaction discipline unverified (Mongoose multi-doc writes), browser-generated PDFs (no server verification), JWT/Express security posture unreviewed in depth, duplicated super-admin/workspace routes (per folder layout), India-hardcoded policy, debug-script sprawl, root-level junk files.

## 3. The ten largest LI capabilities missing from AGT (all P0–P1, Confirmed from source)

1. **Payroll batch engine** — periods, freeze/approve/complete/recalculate/rollback, per-employee records & transactions.
2. **Payslips** — immutable snapshots + employee-facing view (AGT has zero payslip capability).
3. **Biometric/ADMS integration** — device fleet, commands, raw logs, sync scheduler, replay (AGT: 0 punches, manual entry only).
4. **Attendance sync/import/replay pipeline** — roster-aware sync, backfill, live attendance reports.
5. **Leave accrual engine + scheduled crons** — monthly accrual, annual reset, scheduled CL credit, carry-forward pools.
6. **Leave register** — monthly/yearly snapshots, ledger, reconciliation, XLSX/PDF export.
7. **Loans & salary advances with EMI** — full lifecycle integrated into payroll deduction.
8. **Pay register / paysheet Excel export** — period payroll output bundle.
9. **Multi-shift & confused-shift detection + roster planner** — smart-IN, shift segments, auto-fill.
10. **Promotions/transfers/increments workflow + employee update requests** — case-based HR movements with history.

(Full 34-row classification incl. "AGT stronger" and "do not port" rows in the CSV.)

## 4. Where AGT is already stronger (must be preserved)

- **RBAC/RLS**: 282 permissions, scoped `current_user_can_*` RPCs, 939 RLS policies vs LI's workspace-role middleware.
- **DMS with OCR→AI→human-review→apply-to-ERP** — LI has nothing comparable.
- **Official documents**: server-side templates, Gotenberg rendering, public verification tokens vs LI's browser-generated PDFs.
- **Notifications/email**: DB-backed provider config with `secret_ref` vault indirection + retry queue vs LI's direct notifications.
- **Data layer**: Postgres RLS + migrations vs LI's migration-less Mongo (AGT's schema governance is better *in intent* — see DB-003/DB-004 for drift caveats).
- **UAE fit**: MOHRE, Emirates ID/visa types, WPS profiles, Arabic AI extraction vs LI's India statutory model.

## 5. Do-not-port list (Confirmed)

ESI/PF/statutory deduction configs; INR formatting; IST timezone handling; Mongo/Mongoose models & side effects; JWT/Express auth; browser-generated official PDFs; duplicated super-admin/workspace route pattern; root debug/repair scripts culture; India earned-leave/CL policy specifics (redesign to UAE Labour Law annual leave — *legal confirmation required*).

## 6. Reuse strategy (Recommendation)

Port **concepts and algorithms as requirements + test cases**, not code: (a) payroll batch state machine + snapshot immutability; (b) accrual/carry-forward scheduling; (c) leave register reconciliation; (d) biometric replay/idempotent punch ingestion; (e) multi-shift detection rules. Rebuild on AGT's Postgres transaction model, numbering engine, audit events, permission codes, and official-output framework. Every payroll/leave legal rule for UAE marked **Requires professional/legal confirmation** before implementation.
