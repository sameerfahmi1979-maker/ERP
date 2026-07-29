# ERP HR.10 — Single HR Search Implementation Report

## Phase

```
ERP HR.10 — Single HR Search
Status: CLOSED / PASS
Date: 2026-06-19
```

---

## Executive Summary

HR.10 implements a single, deterministic, permission-aware HR Search page at `/admin/hr/search`.
The search covers all HR module data from HR.1–HR.9: employees, candidates, compliance, time & leave,
payroll/WPS readiness, operations, HR actions/PRO/disciplinary/EOS, and onboarding tasks.

All search is server-side. No AI, no embeddings, no vector search. No new HR business tables were created.

A pre-implementation preflight also fixed two wrong table references in the HR.9 dashboard code
(`employee_attendance_records` → `employee_attendance_daily_summary`, `employee_overtime_requests`
→ `employee_overtime_records`).

---

## HR.9 Follow-up Verification

| Item | Finding | Action |
|---|---|---|
| `employee_attendance_records` used in `getHrDashboardTimeOverview` | **WRONG** — table does not exist | Fixed to `employee_attendance_daily_summary` |
| Missing-punch check used `is("time_out", null)` | **WRONG** — column does not exist | Fixed to `eq("is_missing_punch", true)` |
| `employee_overtime_requests` used in `getHrDashboardTimeOverview` | **WRONG** — table does not exist | Fixed to `employee_overtime_records` |
| Same `employee_attendance_records` in `getHrDashboardSummary` | **WRONG** | Fixed to `employee_attendance_daily_summary` |
| `employee_approval_requests.request_status` | Correct — matches HR.7 schema | No change |

---

## Files Created

| File | Purpose |
|---|---|
| `src/lib/hr/search/types.ts` | `HrSearchResult`, `HrSearchInput`, `HrSearchOutput`, `HrSearchSuggestion`, category labels/order |
| `src/server/actions/hr/search.ts` | `searchHr()` + `getHrSearchSuggestions()` server actions |
| `src/features/hr/search/hr-search-bar.tsx` | Search input with live suggestion dropdown |
| `src/features/hr/search/hr-search-filters.tsx` | Category chips + advanced date/status filters |
| `src/features/hr/search/hr-search-result-card.tsx` | Individual result card with drill-down link |
| `src/features/hr/search/hr-search-result-group.tsx` | Collapsible group by category |
| `src/features/hr/search/hr-search-empty-state.tsx` | Empty/initial state UI |
| `src/features/hr/search/hr-search-page-client.tsx` | Main client component, useQuery, state management |
| `src/features/hr/search/index.ts` | Barrel export |
| `src/app/(protected)/admin/hr/search/page.tsx` | Server page, permission gate, metadata |

## Files Modified

| File | Change |
|---|---|
| `src/server/actions/hr/dashboard.ts` | Fixed 3 wrong table/column references from HR.9 preflight |
| `src/lib/query/query-keys.ts` | Added `search.results`, `search.suggestions`, `search.categories` keys |
| `src/lib/query/invalidation.ts` | Added `invalidateHrSearch`, `invalidateHrSearchSuggestions` |
| `src/components/layout/app-sidebar.tsx` | Added "Search" link under HR group, added `SearchIcon` import |

---

## Server Actions

### `searchHr(input: HrSearchInput): Promise<HrSearchOutput>`

- Validates input with Zod schema.
- Checks 10 permissions. Only queries permitted categories.
- Runs category searches in parallel (Promise.allSettled).
- Per-category cap: 20 results.
- Returns results, totalCount, groupCounts, query, hasMore.

### `getHrSearchSuggestions(prefix: string): Promise<HrSearchSuggestion[]>`

- Returns up to 8 suggestions from employee and candidate tables.
- Requires `hr.employees.view` or `hr.recruitment.view` respectively.
- No DB storage. No recent searches table.

---

## Search Categories

| Category | Tables Searched | Permission | Redaction |
|---|---|---|---|
| Employees | `employees` | `hr.employees.view` | None — safe fields only |
| Candidates | `hr_candidates` | `hr.recruitment.view` | No salary/offer amounts |
| Compliance | `employee_identity_documents`, `employee_access_cards`, `employee_training_certificates`, `employee_medical_records` | `hr.compliance.view` (+ `hr.medical.view` for medical) | Document/policy numbers masked in result text; medical only if permitted |
| Time | `employee_leave_requests`, `hr_leave_types` | `hr.attendance.view` or `hr.leave.view` | No medical certificate details; no payroll amounts |
| Payroll | `employee_wps_profiles`, `employee_payroll_holds` | `hr.payroll.view` | No salary amounts, no IBAN, no account numbers |
| Operations | `employee_assignments`, `employee_operational_blocks` | `hr.assignments.view` | None — operational data only |
| Actions | `employee_pro_processes`, `employee_hr_actions`, `employee_disciplinary_records`, `employee_eos_cases` | `hr.actions.view` | Disciplinary description excluded; HR notes show "HR Note — Restricted"; EOS no amounts |
| Onboarding | `hr_onboarding_tasks`, `hr_candidates` | `hr.recruitment.view` | None |

---

## Permission and Redaction Behavior

- If a user lacks permission for a category: that category is **not queried** and **not returned**.
- Payroll results show readiness/profile status only — no salary, IBAN, account, or component amounts.
- Medical records require `hr.medical.view` in addition to `hr.compliance.view`.
- Disciplinary records show subject/severity/status; never the description text.
- HR notes are not searched (text is sensitive); only note count matters on the employee profile.
- Document numbers (identity docs, policy numbers, card numbers) are not surfaced in result text.
- Candidate salary/offer amounts are excluded from result fields.

---

## Query Keys Added

```ts
queryKeys.search = {
  results: (input?) => ["hr", "search", "results", input?] as const,
  suggestions: (prefix?) => ["hr", "search", "suggestions", prefix?] as const,
  categories: () => ["hr", "search", "categories"] as const,
}
```

Note: `search` is a top-level key in `queryKeys`, consistent with the existing `recruitment` pattern.

## Invalidation Helpers Added

```ts
invalidateHrSearch(queryClient)        // ["hr", "search"]
invalidateHrSearchSuggestions(queryClient) // ["hr", "search", "suggestions"]
```

---

## UI Implementation

- **Search bar**: full-width with inline suggestion dropdown (≥2 character prefix), keyboard support (Enter, Escape, click outside).
- **Category chips**: one button per permitted category; toggle individual or reset to All.
- **Advanced filters**: collapsible panel with status, dateFrom, dateTo, and Reset Filters button.
- **Results**: grouped by category in collapsible sections with count badges. First 3 groups expanded by default.
- **Result cards**: icon, title, subtitle, status badge, date, matched fields, hover-to-reveal external link.
- **Loading**: skeleton group placeholders during fetch.
- **Empty state**: helpful initial prompt with example search categories; separate "no results" view.
- **Refresh button**: visible after first search to re-run query.
- **Clear**: clears query, filters, and committed search state.

---

## Drill-down Links Implemented

| Category | Target |
|---|---|
| Employees | `/admin/hr/employees/record/{id}` |
| Candidates | `/admin/hr/recruitment/candidates/record/{id}` |
| Compliance | `/admin/hr/employees/record/{employeeId}` |
| Time — Leave | `/admin/hr/time/leave` |
| Payroll — WPS | `/admin/hr/payroll/wps` |
| Payroll — Holds | `/admin/hr/payroll/salaries` |
| Operations — Assignments | `/admin/hr/operations/assignments` |
| Operations — Blocks | `/admin/hr/operations/blocks` |
| Actions — PRO | `/admin/hr/actions/pro` |
| Actions — HR Action | `/admin/hr/employees/record/{employeeId}` |
| Actions — Disciplinary | `/admin/hr/actions/disciplinary` |
| Actions — EOS | `/admin/hr/actions/eos` |
| Onboarding | `/admin/hr/recruitment/candidates/record/{candidateId}` |

---

## Performance / Server-side Search Notes

- All searches use `createAdminClient()` with prior permission checks.
- `ilike('%query%')` used for broad text search; no raw SQL string interpolation.
- Per-category cap of 20 results prevents over-querying.
- Parallel `Promise.allSettled` across permitted categories — any single failure doesn't block others.
- Employee scope filter applied before sub-table queries via `getScopedEmpIds()` helper.
- No client-side full table loading.
- Results stale after 30 seconds (TanStack Query).
- Suggestions stale after 10 seconds.

---

## No DB Migration

```
No DB migration was required for HR.10.
```

All search uses existing indexes from HR.1–HR.8 migrations. If performance issues arise on large datasets,
index-only additions on `(employee_id, full_name_en)` and `(candidate_code, full_name_en)` would be justified.

---

## Scope Control Verification

- [x] `/admin/hr/search` route created
- [x] HR search server actions created
- [x] Employee search implemented
- [x] Candidate/recruitment search implemented
- [x] Compliance search implemented with masking
- [x] Time search implemented
- [x] Payroll search implemented with no salary/IBAN/account exposure
- [x] Operations search implemented
- [x] HR Actions search implemented with restricted details
- [x] Onboarding search implemented
- [x] Search suggestions implemented without DB storage
- [x] Drill-down links implemented to existing routes
- [x] No Reports/Print/Export/Email implemented
- [x] No HR AI implemented
- [x] No embeddings/vector tables created
- [x] No new HR business tables created
- [x] No client-side full table loading
- [x] Query keys/invalidation added
- [x] Sidebar Search link added
- [x] HR.9 follow-up verified and fixed
- [x] tsc passes (exit 0)
- [x] build passes (exit 0)
- [x] Implementation report created
- [x] SOT updated

---

## Testing

```
npx tsc --noEmit → exit 0 (no errors)
npm run build   → exit 0 (no errors)
```

---

## Issues / Notes

- HR notes (`employee_hr_notes`) are not searched — the table exists but note text is sensitive.
  Notes are visible on the employee profile for authorized users.
- `employee_attendance_daily_summary` searched by employee name only (time-based search fetches leave
  requests which are name/type searchable). Direct attendance summary lookup by employee.
- Medical insurance (`employee_medical_insurances`) is not directly searched — policy numbers are
  sensitive and the compliance tab on the employee profile is the appropriate access point.
- The `payroll/salaries` drill-down route is used for payroll holds; if this route changes in HR.11,
  update the result card href accordingly.

---

## Final Recommendation

HR.10 is CLOSED / PASS. The next recommended phase is:

```
ERP HR.11 — Reports / Print / Export / Email
```

HR.12 (HR AI Integration) and HR.13 (Security / RLS / QA / UAT Closure) should follow after HR.11.
