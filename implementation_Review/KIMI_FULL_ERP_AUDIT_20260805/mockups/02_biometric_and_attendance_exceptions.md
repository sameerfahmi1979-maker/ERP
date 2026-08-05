# MOCKUP 2 — Biometric Devices & Attendance Exception Queue (missing: LI-GAP-003/004/009)

**Target users:** HR Time Officer (`hr.attendance.manage`), Site supervisor (read queue)
**Purpose:** device fleet health + exception work queue so attendance data is trustworthy before payroll.

## Screen A — Devices & Sync Health

```
┌ Biometric Devices ──────────────────────────────────────────── [+ Register] ┐
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ Device     Site        Model    Last sync      Pending logs  Status     │ │
│ │ DXB-GATE1  Jebel Ali   ZK-UA760 2 min ago      0             ● Online   │ │
│ │ AUH-CAMP2  Mussafah    ZK-K40   3 hrs ago      412           ◐ Lagging  │ │
│ │ SHJ-SITE1  Hamriyah    —        2 days ago     —             ○ Offline  │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│ Device drawer: [Details] [Users] [Commands] [Raw logs] [Sync history]        │
│  Commands: restart, sync-users, set-time — queued, ack-tracked, audited      │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Screen B — Attendance Exceptions (daily work queue)

```
┌ Attendance Exceptions ── 2026-08-05 ────────────────────────────────────────┐
│ Filters: Site[▾] Type[Missing OUT ▾] Shift[▾]  [Auto-resolve suggestions]   │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ Employee   Site      Issue                Suggestion         Action     │ │
│ │ E-1023     JAFZ      No OUT punch         17:32 (gate cam?)  [Correct]  │ │
│ │ E-0871     AUH-2     Double IN 6:58/7:01  Keep first         [Accept]   │ │
│ │ E-1145     SHJ-1     Confused shift A/B   Shift B per roster [Assign]   │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│ Bulk: [Accept all suggestions] — confirm dialog, per-row audit              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**States:** loading skeleton; empty = "All clear 🎉"; error = retry banner; access-denied = standard.
**Data sources (new):** `hr_biometric_devices`, `hr_biometric_raw_logs`, `hr_attendance_exceptions`; writes `employee_attendance_punches`/daily summaries via correction workflow (existing).
**Audit:** every correction via existing `correctAttendanceDailySummary` path (extended with reason + source).
**Mobile:** supervisor can view + single-tap accept suggestion; correction form lg-only.
**Acceptance criteria:** raw-log ingestion idempotent (replay-safe, dedupe key device+timestamp+pin); offline device >24h raises notification; exception count feeds daily-attendance badge; no payroll period can be Frozen with unresolved critical exceptions.
