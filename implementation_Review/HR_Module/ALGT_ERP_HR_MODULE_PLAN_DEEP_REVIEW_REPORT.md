# ALGT ERP — HR Module Plan Deep Review Report

**Report:** `implementation_Review/HR_Module/ALGT_ERP_HR_MODULE_PLAN_DEEP_REVIEW_REPORT.md`  
**Date:** 2026-06-18  
**Review Type:** Deep Review and Integration Strengthening — Planning Document Only  
**No implementation performed in this review.**

---

## 1. Review Summary

This report documents the deep review performed on `ALGT_ERP_HR_MODULE_FULL_MASTER_IMPLEMENTATION_PLAN.md` on 2026-06-18, aligning the plan against the live ERP codebase, confirmed live database schema, and existing project standards.

### Review Method

1. Read the prompt requirements (`CURSOR_PROMPT_HR_PLAN_DEEP_REVIEW_AND_FINAL_STRENGTHENING.md`)
2. Read the latest Source of Truth (`.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`)
3. Inspected live source code and migrations:
   - `src/lib/dms/dms-entity-types.ts` — DMS entity type registry
   - `src/lib/rbac/check.ts` — TypeScript RBAC helpers
   - `supabase/migrations/20260527120000_erp_base_foundation.sql` — RLS helper functions
   - `supabase/migrations/20260616120000_erp_common_md_1_cross_module_master_data_foundation.sql` — COMMON MD.1 tables
   - `src/server/actions/numbering.ts` — `generateNextReference()` function
   - `src/server/actions/notifications/email-queue.ts` — `queueEmail()`
   - `src/lib/query/query-keys.ts` — `queryKeys` namespace (HR not yet added)
   - All existing migration files (last 15) — to confirm AI phase status

---

## 2. Sections Checked

| Section | Status | Finding |
|---|---|---|
| Source of Truth reference (§2.3) | ✅ Improved | SOT wording standardised to "Latest confirmed AI foundation state" block |
| Master Data Reuse Matrix (§2.5) | ✅ Fixed | `approval_roles` was missing — now added as CONFIRMED LIVE (COMMON MD.1) |
| DMS entity type confirmation (§19) | ✅ Verified | `employee` + `employee_compliance` confirmed registered in live code (lines 31–32) |
| RLS helper function names (§18) | ✅ Fixed | Plan now uses confirmed live DB function names with SECURITY INVOKER pattern |
| Multi-company RBAC warning (§18.1) | ✅ Added | `current_user_has_permission_in_company()` documented and Cursor warned to align |
| DB indexes (§16.10) | ✅ Added | 20+ recommended indexes added — pg_trgm/GIN confirmed in use by existing ERP |
| Employee Profile tabs — all 10 tabs | ✅ Verified | All 10 tabs (Overview–Audit) defined with field-level detail |
| Overview tab content | ✅ Strengthened | 13 alert types, 4 special cards, 12 status cards, 12 snapshot panels, quick actions |
| Phase definitions (HR.0–HR.13) | ✅ Strengthened | All 14 phases now have all 12 required elements |
| Append-only table policies | ✅ Confirmed | 4 append-only event tables identified; RLS pattern specified |
| Migration order (§28.2) | ✅ Verified | Confirmed: HR.1 settings tables must precede HR.2 `employees` table |
| `employee_recruitment_links` | ✅ Confirmed | Correctly deferred to HR.8; `hr_candidate_id` NOT on employees table in HR.2 |
| Attendance table design | ✅ Confirmed | Two-table approach (raw punches + daily summary) with correction log |
| Payroll/WPS scope | ✅ Confirmed | Finance items explicitly excluded; IBAN always masked |
| Sensitive data plan (§24) | ✅ Strengthened | Denylist expanded; "always server-side" rule explicit |
| Email integration (§21) | ✅ Confirmed | `erp_email_queue` + `queueEmail()` — confirmed live |
| AI subphases (§20.2) | ✅ Confirmed | HR AI.1–HR AI.7 with correct priority order (Search → Fill → Correct → Explain → Letters) |
| Draft denylist (§24.3) | ✅ Confirmed | Sensitive field list defined; disable draft for medical/payroll/disciplinary if uncertain |
| Section 31: Feasibility Review | ✅ Added | New section added per prompt requirement |
| Open questions (§29) | ✅ Updated | 14 questions with recommended defaults and phase-gate timing |
| UX product rules | ✅ Confirmed | One Employee Profile / One Dashboard / One Search enforced throughout |
| AI safety rules | ✅ Confirmed | No auto-save, no auto-apply, no auto-send — reinforced in §31.4 Cursor Warnings |

---

## 3. Issues Found

### Issue 1: `approval_roles` Missing from Master Data Reuse Matrix

**Severity:** MEDIUM  
**Finding:** The `approval_roles` table was confirmed live in `COMMON MD.1` migration but was absent from §2.5 (Master Data Reuse Matrix). HR uses `hr_approval_workflows` which references `approval_roles`.  
**Correction applied:** Added `approval_roles` to §2.5 as CONFIRMED LIVE (COMMON MD.1).

---

### Issue 2: RLS Helper Functions — Generic / Placeholder Names

**Severity:** HIGH  
**Finding:** The previous plan referenced generic placeholders (`current_user_company_id()`) which do not match the actual DB helper function names. The live base foundation migration defines 8+ confirmed functions including `current_user_has_permission_in_company()` (multi-company scope).  
**Correction applied:** §18 now uses confirmed live DB function names throughout. Cursor warned to inspect `src/lib/rbac/check.ts` before writing any HR RLS.

---

### Issue 3: Multi-Company RBAC Not Explicitly Flagged

**Severity:** MEDIUM  
**Finding:** The plan had a note about multi-company but the actual DB function `current_user_has_permission_in_company(text, bigint)` was not documented. Cursor could have assumed a simpler single-company check.  
**Correction applied:** §18.1 now documents all confirmed DB functions with signatures. Warning added that project uses multi-company role mappings.

---

### Issue 4: No Recommended DB Indexes

**Severity:** MEDIUM  
**Finding:** The plan defined table schemas without specifying any recommended indexes. pg_trgm GIN indexes are already used in existing ERP migrations but the HR plan had no guidance.  
**Correction applied:** §16.10 (Recommended Database Indexes) added — covering employee search, expiry date indexes, attendance, readiness, and DMS links. All GIN/trigram indexes consistent with existing ERP pattern.

---

### Issue 5: DMS Entity Type Status Not Confirmed Against Live Code

**Severity:** LOW (risk of confusion)  
**Finding:** The plan stated `employee` and `employee_compliance` were "pre-registered" but didn't cite the source or confirm against live code.  
**Correction applied:** §2.1 now cites exact file and lines (`src/lib/dms/dms-entity-types.ts` lines 31–32). §19.1 table now shows "✅ YES" status with file reference for confirmed types and "❌ Add in HR.X" for future types.

---

### Issue 6: Phase Definitions Incomplete for Report and SOT Requirements

**Severity:** MEDIUM  
**Finding:** Several phase definitions in the previous plan did not explicitly state the implementation report filename format or SOT update requirement. These are mandatory per project standards.  
**Correction applied:** All 14 phase definitions (HR.0–HR.13) now end with explicit `Report:` and `SOT update: Yes` lines.

---

### Issue 7: SOT Wording Inconsistent / Unclear

**Severity:** LOW  
**Finding:** References to "ERP COMMON AI.15", "ERP COMMON AI FIX.1", and AI phase completeness were scattered and not consistently worded.  
**Correction applied:** §2.3 now contains a single canonical "Latest confirmed AI foundation state" block matching the exact wording in the prompt. Referenced in §20.1 and at the bottom of the document.

---

### Issue 8: Section 31 (Final Implementation Feasibility Review) Did Not Exist

**Severity:** REQUIRED by prompt  
**Finding:** The prompt explicitly required §31 with ratings, remaining gaps, Cursor warnings, and a go/no-go statement.  
**Correction applied:** §31 added with all 5 sub-sections (§31.1 Ratings, §31.2 Gaps before HR.0, §31.3 Gaps before HR.1, §31.4 Cursor Warnings, §31.5 Final Go/No-Go).

---

### Issue 9: Payroll Tab — "Gross" Field Risk

**Severity:** MEDIUM  
**Finding:** Using a stored `gross_salary` field risks drift if components change. This is a common payroll design trap.  
**Correction applied:** Plan explicitly states: "Gross salary is calculated server-side from sum of `employee_salary_components` — not a manually edited field." No `gross_salary` stored column on the profile table.

---

### Issue 10: `queryKeys.hr.*` Not Yet Defined

**Severity:** LOW (informational — correctly deferred)  
**Finding:** Confirmed from live inspection of `src/lib/query/query-keys.ts` that no `hr:` namespace exists yet. Plan correctly states HR must add this.  
**Correction applied:** §2.2 ("What Does NOT Exist Yet") now explicitly lists `queryKeys.hr.*` as absent.

---

## 4. Corrections Applied

| Correction | Location |
|---|---|
| Added `approval_roles` to Master Data Reuse Matrix | §2.5 |
| Standardised SOT AI foundation state wording | §2.3, §31 footer |
| DMS entity type live confirmation with file/line citation | §2.1, §19.1 |
| Confirmed live RLS helper function names (8 functions) | §18.1 |
| Multi-company RBAC warning for Cursor | §18.1, §31.4 |
| Added DB index recommendations (§16.10) | §16.10 (new) |
| Made all 14 phase definitions explicit with 12 required elements | §25 (all phases) |
| Added implementation report filename format and SOT update to each phase | §25 |
| Added §31 (Final Implementation Feasibility Review) | §31 (new) |
| Added revision notes block for this review at document top | Top of doc |
| Updated bottom "last reviewed" metadata | End of doc |
| Confirmed `queryKeys.hr.*` not yet defined | §2.2 |
| Confirmed `employee_recruitment_links` deferred to HR.8 | §28.4, §10.2, HR.8 definition |
| Payroll gross — calculated server-side, not stored column | §12.1 |

---

## 5. Remaining Risks

| Risk | Severity | Status |
|---|---|---|
| Company-scope RBAC: if ALGT users have multi-company access, `current_user_owner_company_id()` returns only primary company | MEDIUM | Cursor warned in §18.1 and §31.4 |
| Large employee count performance | MEDIUM | GIN trigram indexes added; readiness table is cached summary |
| Sensitive data in AI logs (raw OCR / raw prompt) | CRITICAL | AI safety rules in §20, §27.6, §31.4 |
| Finance scope creep | MEDIUM | Explicit exclusion in all payroll phase definitions |
| DMS entity types added without updating all 3 exports | MEDIUM | §19.1 now gives exact instruction (update DMS_ENTITY_TYPES + labels + hints) |
| IBAN / account number in any DB export or log | CRITICAL | §24.2 — IBAN always masked; no exception |
| Biometric integration | LOW (informational) | Deferred |
| `area_zones` table existence uncertain | LOW | Cursor instructed to inspect live schema in §2.5 |

---

## 6. Final Recommendation

The HR Master Plan (`ALGT_ERP_HR_MODULE_FULL_MASTER_IMPLEMENTATION_PLAN.md`) is now at a strong implementation-ready state following this deep review:

- All global/common master data dependencies verified against live codebase
- All RLS helper function names confirmed and documented
- All DMS entity types confirmed
- All phase definitions complete with 12 required elements
- DB schema comprehensive with indexes, migration order, and soft-delete standards
- Sensitive data redaction plan covers all sensitive fields server-side
- AI integration fully phased and safe
- Feasibility review added with plan strength ratings and go/no-go

---

## 7. Go / No-Go for HR.0

**GO — with conditions**

```text
✅ The plan is ready for HR.0 Readiness Audit.

Conditions before HR.0 can start:
  1. Sameer must review and explicitly approve the HR.0 phase prompt.
  2. Open questions §29 items 1, 2, 8, 11, 13 must be answered.
  3. HR.0 itself will confirm live DB readiness
     (global tables have data, EMP numbering prefix available, etc.)

This plan must NOT be used as an immediate implementation instruction.
All implementation must start with HR.0, and then one phase at a time
with explicit Sameer approval of each phase prompt.
```

---

*Report created: 2026-06-18*  
*No implementation was performed during this review.*  
*All findings are planning document corrections only.*
