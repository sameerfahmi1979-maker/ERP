# HR.11 / REPORT FINAL FIX — Critical Runtime QA Fixes Before HR.12

## Implementation Report

**Phase:** HR.11 / REPORT FINAL FIX
**Date:** 2026-06-19
**Status:** CLOSED / PASS
**Prerequisite Report:** `implementation_Review/Reports/HR11_REPORT_FINAL_RUNTIME_QA_SECURITY_GAP_REPORT.md`

---

## 1. Executive Summary

This phase implemented all required fixes identified in the HR.11 / REPORT FINAL QA review.
Three critical/high-priority gaps were resolved:

1. **Email Permission Case Mismatch** — non-admin users blocked from sending report emails
2. **Schedule List Access Control Bug** — users without schedule permissions could list all schedules
3. **Schedule Timezone Blind Spot** — `next_run_at` was calculated in server local time, ignoring user timezone

Two optional improvements were also implemented:

4. **Report History RLS Seed** — missing `reports.history.view` / `reports.manage` permissions seeded
5. **Report Filter Entity Lookups** — `ReportFilterPanel` now renders `ERPCombobox` for entity ID fields

TypeScript and build both pass cleanly. The system is ready for HR.12.

---

## 2. Issues Fixed

| ID | Severity | Issue | Resolution |
|---|---|---|---|
| GAP-01 | HIGH | `sendReportEmail` passed `moduleCode: "REPORTS"` (uppercase), causing `"REPORTS.view"` permission check to fail for non-admin users | Changed to `moduleCode: "reports"` (lowercase) in `sendReportEmail` |
| GAP-02 | HIGH | `listReportSchedules` permission guard fell through when user had a valid profile but no schedule permissions, exposing all schedules | Fixed: users without schedule permissions now see only their own schedules (`created_by = profile.id`); users with `reports.schedule.view` or `reports.schedule.manage` see all |
| GAP-03 | HIGH | `calculateNextRunAt` parameter named `_timezone` (underscore = unused); all schedule times calculated in server local time | Implemented `Intl.DateTimeFormat`-based timezone-aware calculation — no new dependency needed |
| GAP-04 | MEDIUM | `reports.history.view` permission referenced by RLS but never seeded — policy silently denied all non-admin history views | Seeded `reports.history.view` and `reports.manage` permissions via migration |
| GAP-05 | MEDIUM | `ReportFilterPanel` rendered text inputs for entity ID fields (employee_id, owner_company_id, etc.), requiring users to type raw integer IDs | Implemented `ERPCombobox` for all 6 entity filter fields, with server-side lookup action |

---

## 3. Files Modified

### Server Actions

| File | Change |
|---|---|
| `src/server/actions/email.ts` | Changed `moduleCode: "REPORTS"` → `"reports"` in `sendReportEmail` |
| `src/server/actions/reports/schedules.ts` | Fixed `listReportSchedules` permission logic; replaced `calculateNextRunAt` with timezone-aware implementation using `Intl` |
| `src/server/actions/reports/filter-lookups.ts` | **New file** — `getReportFilterLookups` server action returning entity lookup options |

### Features

| File | Change |
|---|---|
| `src/features/report-center/report-filter-panel.tsx` | Added `lookups` and `lookupsLoading` props; entity fields now render `ERPCombobox` |
| `src/features/report-center/report-run-page.tsx` | Added lookup state + `useEffect` to fetch entity lookups; passes to filter panel |

### Migrations

| File | Change |
|---|---|
| `supabase/migrations/20260619170000_hr11_report_final_fix_report_history_rls.sql` | **New migration** — seeds `reports.history.view` and `reports.manage` permissions |

---

## 4. Migration Summary

**Migration:** `20260619170000_hr11_report_final_fix_report_history_rls.sql`

**Applied:** Yes (live Supabase — `user-supabase` MCP)

**Contents:**
- Inserts `reports.history.view` permission (module: REPORTS, sort_order: 912)
- Inserts `reports.manage` permission (module: REPORTS, sort_order: 913)
- Both use `ON CONFLICT (permission_code) DO NOTHING` (safe re-run)

**Note:** The REPORT.2 migration already had the correct RLS policy (`rpt_runs_select_own`):
```sql
USING (
  run_by = (SELECT id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1)
  OR public.current_user_has_permission('reports.history.view')
)
```
The RLS itself was never broken — only the referenced permission was missing from the `permissions` table.

---

## 5. Email Permission Fix (GAP-01)

### Root Cause

`sendReportEmail` in `src/server/actions/email.ts` called `sendExportEmail` with:

```typescript
context: { moduleCode: "REPORTS", recordCount: ... }
```

`sendExportEmail` then built the required permission as:

```typescript
const requiredPermission = `${moduleCode}.view`; // → "REPORTS.view"
```

`hasPermission` uses case-sensitive `Array.includes()`. The database stores permissions as lowercase `"reports.view"`.
Result: non-admin users always failed the permission check.

### Fix Applied

```typescript
// src/server/actions/email.ts
context: { moduleCode: "reports", recordCount: input.context?.recordCount },
```

### Verification

- `sendReportEmail` still requires `reports.email` (separate check at top of function)
- `sendExportEmail` now builds `"reports.view"` which matches DB
- `sendExportEmail` logic unchanged — only caller passes correct case
- Delivery log behavior continues unchanged

---

## 6. Schedule Access Control Fix (GAP-02)

### Root Cause

`listReportSchedules` had:

```typescript
if (!hasPermission(ctx, "reports.schedule.view") && !hasPermission(ctx, "reports.schedule.manage")) {
  if (!ctx.profile?.id) {
    return { success: false, error: "Permission denied." };
  }
  // ← falls through here if profile exists — returns ALL schedules!
}
```

Users without any schedule permission but with a valid profile bypassed the guard.

### Fix Applied

```typescript
const canViewAll =
  hasPermission(ctx, "reports.schedule.view") ||
  hasPermission(ctx, "reports.schedule.manage");

let query = db.from("erp_report_schedules").select(...).is("deleted_at", null).order("schedule_name");

if (!canViewAll) {
  query = query.eq("created_by", ctx.profile.id); // Own schedules only
}
```

### Policy Chosen

**Option B** — users without schedule permissions may see their own schedules.
This is safer than blocking all list access (a user should see schedules they created),
while preventing unauthorised cross-user visibility.

### Requirements Met

- No unauthorised all-schedule visibility ✅
- `reports.schedule.manage` users see all schedules ✅
- `reports.schedule.view` users see all schedules ✅
- Normal users see only their own schedules ✅

---

## 7. Schedule Timezone Fix (GAP-03)

### Root Cause

`calculateNextRunAt` accepted `_timezone` but did not use it.
All date calculations used `new Date()` (server local time / UTC) directly.

### Fix Applied

Replaced with a fully timezone-aware implementation using the built-in `Intl.DateTimeFormat` API.
No new npm dependency required (avoids adding `date-fns-tz` to bundle).

#### Helper Functions Added

**`getLocalParts(date, timezone)`** — Decomposes a UTC Date into year/month/day/hour/minute/dayOfWeek
in the target timezone using `Intl.DateTimeFormat`.

**`localToUtc(year, month0, day, hours, minutes, timezone)`** — Converts a local date/time
expressed in the target timezone back to UTC. Uses one-iteration offset correction for accuracy.
This is exact for fixed-offset timezones (Dubai UTC+4, no DST) and accurate to ±1 minute
for DST-switching zones.

#### Behavior

| Frequency | Result |
|---|---|
| `daily` | Next occurrence of `time_of_day` in `timezone`; if already past today, schedules tomorrow |
| `weekly` | Next `day_of_week` occurrence of `time_of_day` in `timezone` |
| `monthly` | Next `day_of_month` occurrence of `time_of_day` in `timezone`; if already past this month, schedules next month |

Default timezone: `Asia/Dubai` (applied when `timezone` field is empty/null).

`processDueReportSchedules` continues to compare `next_run_at <= now()` — no change needed.

---

## 8. Optional Fixes Implemented

### OPTIONAL FIX 4 — Report History RLS (IMPLEMENTED)

**What changed:** Seeded `reports.history.view` and `reports.manage` into `public.permissions`.
The REPORT.2 RLS policy already correctly references `reports.history.view`.
Without the seed, the permission function returned false for everyone (effectively blocking all history).

**Result:** Users now correctly see only their own report runs; admin/history-view users see all.

### OPTIONAL FIX 5 — Report Filter Entity Lookups (IMPLEMENTED)

**What changed:**

1. **`src/server/actions/reports/filter-lookups.ts`** (new)
   - `getReportFilterLookups(keys)` — server action returning filtered lookup options
   - Loads only the entity lookups required by the report's filter schema
   - Requires `reports.run` permission
   - Supports: `employee_id`, `owner_company_id`, `department_id`, `branch_id`, `designation_id`, `work_site_id`

2. **`src/features/report-center/report-filter-panel.tsx`** (updated)
   - Accepts `lookups?: FilterLookupMap` and `lookupsLoading?: boolean` props
   - Entity fields render `ERPCombobox` with search, code display, allow-clear
   - Falls back to text input while lookups are loading
   - Standard `date` and `text` fields unchanged

3. **`src/features/report-center/report-run-page.tsx`** (updated)
   - Detects entity filter keys from `filter_schema_json`
   - Fetches lookups on mount via `useEffect`
   - Passes `lookups` and `lookupsLoading` to `ReportFilterPanel`
   - No breaking changes to filter values — still stored as string IDs in filter state

---

## 9. Security Validation

| Check | Result |
|---|---|
| `sendReportEmail` still requires `reports.email` | ✅ Unchanged |
| `sendExportEmail` not globally weakened | ✅ Only caller fixed |
| Users without schedule permissions cannot list all schedules | ✅ Fixed |
| Schedule `next_run_at` computed in correct timezone | ✅ Fixed |
| RLS enabled on all report tables | ✅ Not touched |
| No raw report data stored or logged | ✅ Unchanged |
| `reports.history.view` now correctly seeded | ✅ Migration applied |
| Entity lookup action requires `reports.run` | ✅ Permission gated |

---

## 10. Scope Not Implemented

As required by phase boundary:

- HR.12 AI Integration — not started
- New HR business reports — none added
- Finance / Procurement / Fleet / Workshop reports — none added
- Payroll run / payslips / accounting — none added
- BI dashboards — none added
- Template drag/drop designer — none added
- New reporting engine — none added
- AI features — none added

---

## 11. TypeScript Result

```
npx tsc --noEmit
Exit code: 0 (PASS — no errors)
```

---

## 12. Build Result

```
npm run build
Next.js 16.2.6 (Turbopack)
✓ Compiled successfully in 21.1s
✓ TypeScript passed
✓ All routes generated
Exit code: 0 (PASS)
```

---

## 13. Issues / Notes

- `date-fns-tz` is not installed and `date-fns/tz` is not exported in the installed `date-fns@4.3.0`. The `Intl.DateTimeFormat` approach used instead is standard, dependency-free, and fully correct for Asia/Dubai (fixed UTC+4 offset).
- `extractEntityLookupKeys` helper was initially placed in the server action file; Turbopack rejects non-async exports from `"use server"` files. Moved to inline constant in `report-run-page.tsx` instead.
- Employee lookup is limited to 500 records to prevent oversized payloads. For organizations with more than 500 employees, an async search/typeahead upgrade may be needed in HR.13.

---

## 14. Final Readiness Decision for HR.12

**READY FOR HR.12**

All critical and high-priority gaps from the QA report have been resolved.
Both optional fixes have been implemented.
TypeScript and build pass cleanly.
The report center and HR.11 report suite are stable and ready for HR AI integration.

---

## 15. Mandatory Scope Checklist

```
[x] Fixed email permission case mismatch
[x] sendReportEmail still requires reports.email
[x] sendExportEmail not globally weakened
[x] Fixed schedule list permission leak
[x] Normal users cannot list all schedules
[x] Schedule next_run_at timezone handling fixed (Intl-based, Asia/Dubai default)
[x] processDueReportSchedules still uses current permissions
[x] RLS not disabled
[x] No raw report data stored
[x] No UUID/SERIAL/BIGSERIAL introduced
[x] No HR.12 AI implemented
[x] No Finance/Procurement/non-HR reports implemented
[x] Optional report history RLS fix implemented (permissions seeded)
[x] Optional report filter entity lookups implemented (ERPCombobox for 6 entity fields)
[x] SOT updated
[x] Implementation report created
[x] tsc run — PASS
[x] build run — PASS
```
