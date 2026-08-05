# MOCKUP 3 — Shift Roster Planner + Leave Ledger (missing: LI-GAP-009/005/006)

## Screen A — Shift Roster Planner (month grid)

**Users:** HR Time Officer, Operations planner (`hr.attendance.manage`)

```
┌ Roster — August 2026 — Jebel Ali Site ─────────────── [Auto-fill] [Publish] ┐
│         1   2   3   4   5   6   7  …  31     Hours  OT   Offs                 │
│ E-1023  A   A   A   A   OFF B   B        B     208    6    4                  │
│ E-0871  B   B   B   OFF A   A   A        A     206    2    5                  │
│  A = 06–14  B = 14–22  N = 22–06  OFF = rest   [drag cell to change]        │
│ Violations (live): ⚠ E-0871 >6 consecutive days · ⚠ N→A without 24h rest    │
└─────────────────────────────────────────────────────────────────────────────┘
Auto-fill: rules from work calendar + shift definitions + previous month pattern;
           dry-run preview with diff before apply; Publish locks roster → drives
           attendance expectations + confused-shift resolution.
```

## Screen B — Leave Ledger (per employee, per year)

**Users:** HR (`hr.leave.view`), manager (team), employee self (own, future ESS)

```
┌ Leave Ledger — E-1023 — 2026 ───────────────────────────────────────────────┐
│ Annual leave: Entitled 30 · Accrued YTD 17.5 · Used 9 · Pending 2 · Bal 6.5  │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ Month   Accrual  Used  Adjust  Balance  Source (link)                   │ │
│ │ Jan     +2.5     0      0      2.5      accrual cron                    │ │
│ │ Feb     +2.5     3      0      2.0      REQ-1042 (approved)             │ │
│ │ Mar     +2.5     0     +1.0    5.5      manual adj. by S.F. (audit)     │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│ [Year snapshot] [Reconcile] [Export XLSX/PDF via Report Center]              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Data sources (new):** `hr_leave_ledger_entries` (append-only), `hr_leave_accrual_schedules`, `hr_roster_assignments`; replaces read-modify-write `used_days` increments (fixes HR-002).
**Audit:** ledger is append-only; corrections are new compensating entries (never edits) — full provenance.
**Acceptance criteria:** balance = SUM(ledger) always (DB view); accrual cron idempotent per month+employee; roster publish is atomic; conflicting shifts raise exceptions (Mockup 2B); UAE accrual rules configurable per leave type (**legal confirmation required**).
**Mobile:** ledger readable; roster grid → week view with horizontal day scroll (exception to no-h-scroll rule for grids, per standard allowance for calendars).
