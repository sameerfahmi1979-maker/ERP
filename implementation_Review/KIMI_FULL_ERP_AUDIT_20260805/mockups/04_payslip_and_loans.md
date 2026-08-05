# MOCKUP 4 — Payslip View + Loans & Advances (missing: LI-GAP-002/007)

## Screen A — My Payslip (employee self-service, future ESS role)

```
┌ Payslip — August 2026 ───────────────────────── [Download PDF (verified)] ─┐
│ Employee E-1023 · AGT Contracting LLC · Dept: Site Ops                     │
│ ┌ Earnings ──────────────┬ Deductions ───────────────┐                    │
│ │ Basic           6,500  │ Loan EMI (2/12)     500   │                    │
│ │ Housing         2,000  │ Absence (1d)        217   │                    │
│ │ Transport         400  │                             │                  │
│ │ Overtime (9h)     412  │                             │                  │
│ ├────────────────────────┼─────────────────────────────┤                  │
│ │ Gross           9,312  │ Total deductions    717   │                    │
│ └────────────────────────┴─────────────────────────────┘                  │
│ NET PAY (AED)                                        8,595                │
│ WPS ref: AGT-2026-08-000312 · Paid via DXB Bank ****2211 · QR verify       │
└────────────────────────────────────────────────────────────────────────────┘
PDF = server-rendered official document (snapshot bytes, QR public verification).
```

## Screen B — Loans & Advances (HR side)

**Users:** HR Payroll (`hr.payroll.manage`), employee (request, future ESS)

```
┌ Loans & Advances ──────────────────────────────────────── [+ New request] ┐
│ ┌───────────────────────────────────────────────────────────────────────┐ │
│ │ Employee   Type     Principal  EMI    Paid  Remaining  Status         │ │
│ │ E-1023     Loan     6,000      500    1,000   5,000    Active         │ │
│ │ E-0911     Advance  2,000      —      —       —        Pending appr.  │ │
│ └───────────────────────────────────────────────────────────────────────┘ │
│ Drawer: schedule table (month, amount, payroll-period link), [Approve]      │
│ [Reject] [Early settle] [Hold] — every action audited; EMI auto-deducts     │
│ in payroll calc (Mockup 1); settlement blocks EOS clearance until closed    │
└───────────────────────────────────────────────────────────────────────────┘
```

**Data sources (new):** `hr_loans`, `hr_loan_schedules`; payroll integration via deduction component hook in calculation service.
**Validation:** principal ≤ N×basic (configurable per policy); EMI ≤ 25% net (typical UAE cap — **legal confirmation required**); overlapping active loans blocked or stacked per policy.
**EOS link:** open loans surface in EOS & Clearance screen as settlement checklist items.
**Acceptance criteria:** EMI deduction appears automatically in the correct period's payroll record; early settlement recomputes schedule atomically; payslip PDF reflects actual deducted EMI from snapshot.
**Mobile:** read-only summary + PDF download.
