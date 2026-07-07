# ERP REALTIME.1C — Employees / HR Lists Implementation Report

**Date:** 2026-07-07
**Phase:** ERP REALTIME.1C
**Status:** CLOSED / PASS WITH NOTES

---

## 1. Executive Summary

REALTIME.1C successfully extends the REALTIME.1A/1B foundation to four HR list pages. Supabase Realtime subscriptions were added to the global employees list, global leave requests list, global daily attendance list, and recruitment candidates list. All four integrations reuse the existing `useRealtimeSync` hook and the existing `NEXT_PUBLIC_ERP_REALTIME_SYNC_ENABLED` runtime switch.

No database migration was created. No new npm dependencies were added. No Railway/deployment changes were made. Sensitive HR tables (payroll, medical, identity, disciplinary, EOS) are intentionally excluded.

TypeScript check, production build, and all 269 unit tests pass.

---

## 2. Scope

**Tables subscribed in REALTIME.1C:**
- `employees` — Global employee master list
- `employee_leave_requests` — Global HR leave request queue
- `employee_attendance_daily_summary` — Daily attendance list
- `hr_candidates` — Recruitment candidate list

**Optional tables (not implemented):**
- `employee_shift_assignments` — Deferred to REALTIME.2; insufficient time to safely evaluate dirty-state impact
- `employee_operational_blocks` — Deferred to REALTIME.2

---

## 3. REALTIME.1A/1B Foundation Reuse Verification

| Item | Status |
|---|---|
| `useRealtimeSync` hook exists | VERIFIED — `src/hooks/realtime/use-realtime-sync.ts` |
| `RealtimeProvider` exists and mounted in erp-shell | VERIFIED — `src/components/layout/realtime-provider.tsx` |
| Runtime switch `NEXT_PUBLIC_ERP_REALTIME_SYNC_ENABLED` exists | VERIFIED — present in `.env.local` and `.env.local.example`, default `false` |
| REALTIME.1A pilot tables (erp_notifications, dms_upload_sessions, parties) | VERIFIED — not modified |
| REALTIME.1B tables (dms_documents, party_contacts, party_addresses, party_bank_details) | VERIFIED — not modified |

No duplicate Realtime foundation was created. REALTIME.1C only adds `useRealtimeSync` calls in the four HR list components.

---

## 4. Files Reviewed

| File | Purpose |
|---|---|
| `src/hooks/realtime/use-realtime-sync.ts` | Core hook — reused unchanged |
| `src/components/layout/realtime-provider.tsx` | Global provider — not modified |
| `src/components/layout/erp-shell.tsx` | RealtimeProvider mount — not modified |
| `src/lib/query/invalidation.ts` | Verified: `invalidateHrGlobalLeaveRequests`, `invalidateHrDailyAttendance`, `invalidateHrCandidates` exist |
| `src/lib/query/query-keys.ts` | Verified query key structures |
| `src/features/hr/employees/employees-table.tsx` | Pattern C hybrid — `fetchEmployees` callback |
| `src/features/hr/time/leave/hr-leave-page-client.tsx` | TanStack Query — `queryKeys.hr.time.globalLeaveRequests` |
| `src/features/hr/time/attendance/hr-attendance-page-client.tsx` | TanStack Query — `queryKeys.hr.time.dailyAttendance` |
| `src/features/hr/recruitment/candidates-page-client.tsx` | TanStack Query — `queryKeys.recruitment.candidates` |

---

## 5. Supabase Dashboard Realtime Status

**MANUAL ACTION REQUIRED:** Enable Supabase Realtime in the Supabase Dashboard for these new REALTIME.1C tables:

```
employees
employee_leave_requests
employee_attendance_daily_summary
hr_candidates
```

Path: Supabase Dashboard → Database → Replication → Tables → Enable for each table listed above.

**Full Realtime table list after REALTIME.1A/1B/1C:**

| Phase | Table | Dashboard Toggle |
|---|---|---|
| 1A | erp_notifications | Manual (see 1A report) |
| 1A | dms_upload_sessions | Manual (see 1A report) |
| 1A | parties | Manual (see 1A report) |
| 1B | dms_documents | Manual (see 1B report) |
| 1B | party_contacts | Manual (see 1B report) |
| 1B | party_addresses | Manual (see 1B report) |
| 1B | party_bank_details | Manual (see 1B report) |
| 1C | employees | **PENDING — manual action required** |
| 1C | employee_leave_requests | **PENDING — manual action required** |
| 1C | employee_attendance_daily_summary | **PENDING — manual action required** |
| 1C | hr_candidates | **PENDING — manual action required** |

---

## 6. Files Changed

| File | Change |
|---|---|
| `src/features/hr/employees/employees-table.tsx` | Added `useRealtimeSync` import + subscription (Pattern C hybrid) |
| `src/features/hr/time/leave/hr-leave-page-client.tsx` | Added `useRealtimeSync` + `invalidateHrGlobalLeaveRequests` imports + subscription |
| `src/features/hr/time/attendance/hr-attendance-page-client.tsx` | Added `useRealtimeSync` + `invalidateHrDailyAttendance` imports + subscription |
| `src/features/hr/recruitment/candidates-page-client.tsx` | Added `useQueryClient`, `useRealtimeSync`, `invalidateHrCandidates` imports + subscription |
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | Added REALTIME.1C entry |
| `implementation_Review/Realtime/ERP_REALTIME_1C_EMPLOYEES_HR_LISTS_IMPLEMENTATION_REPORT.md` | This report |

---

## 7. Employees List Realtime Integration

**Component:** `src/features/hr/employees/employees-table.tsx`
**Pattern:** C — Hybrid local state (uses `fetchEmployees` callback with `startTransition`)

```ts
useRealtimeSync({
  table: "employees",
  event: "*",
  debounceMs: 500,
  onEvent: () => {
    fetchEmployees(page, pageSize, search, filters);
  },
});
```

**Pattern notes:**
- `fetchEmployees` is a stable `useCallback(fn, [])` that calls `listEmployees()` via `startTransition`.
- `useRealtimeSync` uses `onEventRef.current = onEvent` (updated each render), so the callback always captures the latest `page`, `pageSize`, `search`, and `filters` state values.
- This is Pattern C (hybrid) as described in the REALTIME plan. No migration to TanStack Query was performed.
- The `archiveTarget` AlertDialog is a confirmation-only dialog with no typed form data; no dirty guard is required.

---

## 8. Leave Requests List Realtime Integration

**Component:** `src/features/hr/time/leave/hr-leave-page-client.tsx`
**Pattern:** B — TanStack Query with `invalidateHrGlobalLeaveRequests`

```ts
useRealtimeSync({
  table: "employee_leave_requests",
  event: "*",
  debounceMs: 400,
  onEvent: () => {
    invalidateHrGlobalLeaveRequests(qc);
  },
});
```

**Pattern notes:**
- The component uses `useQueryClient` (already imported as `qc`).
- No `ERPChildDialogForm` or dirty form state exists in this list view — approve/reject are inline button actions.
- No guard required.

---

## 9. Daily Attendance List Realtime Integration

**Component:** `src/features/hr/time/attendance/hr-attendance-page-client.tsx`
**Pattern:** B — TanStack Query with `invalidateHrDailyAttendance`

```ts
useRealtimeSync({
  table: "employee_attendance_daily_summary",
  event: "*",
  debounceMs: 400,
  onEvent: () => {
    invalidateHrDailyAttendance(qc);
  },
});
```

**Pattern notes:**
- The component uses `useQueryClient` (already imported as `qc`).
- Approve is the only inline action; no child dialog or form data that can be lost.
- No guard required.

---

## 10. Candidates List Realtime Integration

**Component:** `src/features/hr/recruitment/candidates-page-client.tsx`
**Pattern:** B — TanStack Query with `invalidateHrCandidates`

```ts
useRealtimeSync({
  table: "hr_candidates",
  event: "*",
  debounceMs: 400,
  onEvent: () => {
    invalidateHrCandidates(queryClient);
  },
});
```

**Pattern notes:**
- `useQueryClient` was not previously imported; it was added.
- `invalidateHrCandidates` invalidates `["hr", "recruitment", "candidates"]` plus associated pipeline summaries.
- No dialog forms in this list. Candidate create/edit uses separate workspace routes.
- No guard required.

---

## 11. Dirty Form / Unsaved Data Safety

| Component | Guard Applied | Reason |
|---|---|---|
| `EmployeesTable` | None needed | `archiveTarget` dialog is confirmation-only; no typed form data |
| `HrLeavePageClient` | None needed | Inline approve/reject buttons only; no open form |
| `HrAttendancePageClient` | None needed | Inline approve button only; no open form |
| `CandidatesPageClient` | None needed | Read-only list; create/edit uses separate workspace tabs |

No HR form/workspace tab subscriptions were added. Subscriptions exist only on list pages.

---

## 12. Sensitive HR Data Exclusion Verification

The following tables were **intentionally excluded** from REALTIME.1C:

| Category | Tables Excluded |
|---|---|
| Payroll | `employee_payroll_profiles`, `employee_salary_components`, `employee_salary_revisions`, `employee_payroll_holds`, `employee_wps_profiles` |
| Medical/Compliance | `employee_medical_records`, `employee_medical_insurances`, `employee_identity_documents` |
| HR Action/Sensitive | `employee_disciplinary_records`, `employee_hr_notes`, `employee_eos_cases`, `employee_clearance_items` |
| Other | All DMS, AI, audit, report designer, branding, finance, inventory, fleet, workshop tables |

No wildcard schema subscription was used. No service-role key was used in any Realtime code.

---

## 13. Commands and Results

```bash
npx tsc --noEmit
# Exit code: 0 — No TypeScript errors

npm run build
# Exit code: 0 — Build successful

npx vitest run
# Test Files  8 passed (8)
# Tests  269 passed (269)
```

---

## 14. Browser / Two-Session UAT Results

UAT is **deferred** — requires:
1. Supabase dashboard Realtime toggles enabled for the 4 new tables (manual step).
2. `NEXT_PUBLIC_ERP_REALTIME_SYNC_ENABLED=true` set in deployed environment.
3. Two browser sessions or two active users.

**UAT steps to perform (deferred):**

| Test | Steps |
|---|---|
| UAT-RT1C-01 Employees | User A opens `/admin/hr/employees`. User B creates/updates employee. Verify list refreshes within 1–2s. |
| UAT-RT1C-02 Leave Requests | User A opens `/admin/hr/time/leave`. User B creates/updates/approves leave request. Verify list refreshes. |
| UAT-RT1C-03 Daily Attendance | User A opens `/admin/hr/time/attendance`. User B creates/approves attendance summary. Verify list refreshes. |
| UAT-RT1C-04 Candidates | User A opens `/admin/hr/recruitment/candidates`. User B creates/updates candidate. Verify list refreshes. |
| UAT-RT1C-05 Sensitive Safety | Confirm no payroll/salary/WPS/IBAN/medical/identity/disciplinary/HR notes/EOS subscriptions active. |
| UAT-RT1C-06 Cleanup | Open/close HR lists repeatedly; confirm no duplicate refreshes, no console errors. |
| UAT-RT1C-07 RLS | Restricted HR user only receives data allowed by RLS policies. |

---

## 15. Security / RLS Verification

- All Realtime subscriptions use the browser-side Supabase client (`createClient()`), which uses the anon key.
- RLS is enforced server-side on the Supabase Realtime channel — users only receive events for rows they are permitted to see.
- No service-role or admin key is used in any client Realtime code.
- No raw row payload is logged. `onEvent` callbacks do not log or expose payload data.
- No sensitive column data is accessed via the Realtime payload (subscriptions are event triggers only; actual data is fetched via server actions through RLS-protected queries).

---

## 16. What Was Not Implemented

| Item | Reason |
|---|---|
| `employee_shift_assignments` | Optional per spec; deferred to REALTIME.2 pending safe dirty-state review |
| `employee_operational_blocks` | Optional per spec; deferred to REALTIME.2 |
| All payroll/medical/identity/disciplinary/EOS tables | Excluded by design (sensitive data, requires separate security review) |
| HR forms/workspace tabs | Excluded by design (form data loss risk) |
| Employee profile tabs | Excluded by design (user may be actively editing) |
| Global RealtimeProvider additions | Not applicable — HR list subscriptions are scoped to list pages only |

---

## 17. Known Limitations

1. **`EmployeesTable` — Pattern C hybrid:** The employee list uses local state + `fetchEmployees` rather than TanStack Query. A future migration to TanStack Query would allow cleaner cache invalidation. Recommended in REALTIME.2 or a separate refactor phase.

2. **Two-session UAT deferred:** Live two-session UAT requires the Supabase dashboard toggles to be enabled and the env var set to `true`. This is a deployment/environment step, not a code blocker.

3. **`employee_shift_assignments` / `employee_operational_blocks`:** Not implemented in this phase. Evaluate for REALTIME.2 after confirming no dirty-state risks in the shift scheduler UI.

---

## 18. Source-of-Truth Update

Updated: `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`

Added entry:
```
7. ERP REALTIME.1C — Employees / HR Lists — CLOSED / PASS WITH NOTES.
   Extends REALTIME.1A/1B. Added subscriptions for selected non-sensitive HR list pages:
   employees (Pattern C hybrid), employee_leave_requests, employee_attendance_daily_summary,
   hr_candidates (all TanStack Query). Reuses NEXT_PUBLIC_ERP_REALTIME_SYNC_ENABLED.
   No DB migration. No new packages. No Railway changes.
   Sensitive HR/payroll/medical/identity/disciplinary/EOS tables intentionally excluded.
   Requires manual Supabase dashboard Realtime toggle for 4 new tables.
   Future: REALTIME.2 Tier 2 operational queues.
```

---

## 19. Acceptance Criteria

| ID | Criterion | Result |
|---|---|---|
| AC-RT1C-01 | REALTIME.1A/1B foundation reused; no duplicate foundation created | PASS |
| AC-RT1C-02 | No DB migration created | PASS |
| AC-RT1C-03 | No new dependency added | PASS |
| AC-RT1C-04 | Existing runtime switch reused and still defaults OFF | PASS |
| AC-RT1C-05 | employees list subscription implemented only on global list page/table | PASS |
| AC-RT1C-06 | employee_leave_requests list subscription implemented only on global leave list | PASS |
| AC-RT1C-07 | employee_attendance_daily_summary list subscription implemented only on global attendance list | PASS |
| AC-RT1C-08 | hr_candidates list subscription implemented only on global candidates list | PASS |
| AC-RT1C-09 | No employee record/profile forms subscribed directly | PASS |
| AC-RT1C-10 | No HR child dialogs/forms subscribed directly | PASS |
| AC-RT1C-11 | No payroll/WPS/salary/bank/IBAN table subscribed | PASS |
| AC-RT1C-12 | No medical/identity/disciplinary/HR notes/EOS table subscribed | PASS |
| AC-RT1C-13 | No global provider subscriptions added for HR scoped tables | PASS |
| AC-RT1C-14 | Supabase dashboard Realtime status documented for 4 new tables | PASS — MANUAL ACTION documented |
| AC-RT1C-15 | tsc passes | PASS — exit 0 |
| AC-RT1C-16 | build passes | PASS — exit 0 |
| AC-RT1C-17 | tests pass or unrelated blockers documented | PASS — 269/269 |
| AC-RT1C-18 | Two-session Employees list UAT completed or blocker documented | DEFERRED — awaiting Supabase toggles + env |
| AC-RT1C-19 | Two-session Leave Requests UAT completed or blocker documented | DEFERRED — awaiting Supabase toggles + env |
| AC-RT1C-20 | Two-session Daily Attendance UAT completed or blocker documented | DEFERRED — awaiting Supabase toggles + env |
| AC-RT1C-21 | Two-session Candidates UAT completed or blocker documented | DEFERRED — awaiting Supabase toggles + env |
| AC-RT1C-22 | Dirty form/dialog safety verified or documented | PASS — no form-data guards needed; documented rationale |
| AC-RT1C-23 | Cleanup/unsubscribe verified or documented | DEFERRED — manual UAT step |
| AC-RT1C-24 | RLS/security behavior verified or documented | PASS — RLS enforced by Supabase server-side; documented |
| AC-RT1C-25 | Source-of-truth updated | PASS |
| AC-RT1C-26 | Implementation report created | PASS |

---

## 20. Recommended Next Step

1. **Enable Supabase dashboard Realtime toggles** for the 4 new REALTIME.1C tables.
2. **Set `NEXT_PUBLIC_ERP_REALTIME_SYNC_ENABLED=true`** in the Railway deployment environment.
3. **Run two-session UAT** (UAT-RT1C-01 through UAT-RT1C-07).
4. **REALTIME.2** — Tier 2 operational queues and selected non-sensitive workflow queues (e.g., `employee_shift_assignments`, `employee_operational_blocks`, selected finance/inventory lists). Separate security review gate for any sensitive HR/payroll additions.
5. **EmployeesTable TanStack Query migration** — Low priority; Pattern C hybrid is functional. Consider in a future refactor.

---

## 21. Final Decision

**CLOSED / PASS WITH NOTES**

All 4 required HR list subscriptions implemented. TypeScript, build, and tests all pass. Sensitive HR/payroll/medical/identity/disciplinary/EOS tables excluded. No dirty-dialog risk. Two-session live UAT and Supabase dashboard toggle enablement are the only deferred items (deployment/environment steps, not code blockers).
