# MOCKUP 1 — Payroll Period Console (missing workflow: LI-GAP-001/002/008)

**Target users:** HR Payroll Officer (`hr.payroll.manage`), Finance reviewer, Global Admin
**Purpose:** run monthly payroll per company/branch/payroll-group: calculate → review variance → freeze → approve → complete → outputs (payslips, pay register, WPS SIF).

## Desktop wireframe

```
┌ Payroll Periods ─────────────────────────────────────────────── [+ New Period] ┐
│ Search [____________] Company [All ▾] Status [All ▾]                           │
│ ┌───────────────────────────────────────────────────────────────────────────┐ │
│ │ Period      Group        Employees  Gross (AED)  Status      Actions      │ │
│ │ 2026-08     AGT-DXB      148        1,284,930    Draft       [Calculate]  │ │
│ │ 2026-07     AGT-DXB      146        1,271,205    Frozen      [Review][↓]  │ │
│ │ 2026-06     AGT-AUH       62          512,440    Completed   [Outputs]    │ │
│ └───────────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────────┘

Period detail (drawer 720px per UI standard):
 Tabs: [Summary] [Variance] [Employees] [Exceptions] [Outputs] [Audit]
 Summary:   calculated_at, calculated_by, employee count, gross/net totals,
            variance vs previous period (%) with threshold banner (>5% = red)
 Employees: per-employee rows (basic, allowances, OT, deductions, loans, net)
            row click → payslip preview (official-document snapshot)
 Exceptions: missing bank/IBAN, payroll holds, negative net, joiners/leavers
 Actions per status machine:
   Draft → [Calculate] [Recalculate]
   Calculated → [Freeze] (locks leaves/attendance edits for period)
   Frozen → [Approve] (second approver, 4-eyes)
   Approved → [Complete] → generates: payslip PDFs (snapshot), Pay Register
            XLSX, WPS SIF file; marks period locked
   Any → [Rollback] (reason required, audit event, only before Complete)
```

**Validation/confirmation:** Freeze/Approve/Complete/Rollback all confirm-dialogued with consequence text; Rollback requires reason (min 10 chars) and writes audit + notification to payroll group.
**Data sources (new tables):** `hr_payroll_periods`, `hr_payroll_records`, `hr_payroll_transactions`, `hr_payslip_snapshots`; reads salary profiles/components, attendance summaries, leave, OT, loans.
**Audit/notifications:** every transition logs `audit_logs` + notifies approvers; outputs via official-documents registry (verified PDF + QR).
**Mobile:** list collapses to cards; console actions disabled below lg (payroll is desktop work).
**Acceptance criteria:** double-calculation is idempotent (no duplicate records); frozen period blocks leave/attendance mutations server-side; payslip PDF regenerates identical bytes from snapshot; WPS SIF passes Central Bank format validation (legal/vendor confirmation required).
