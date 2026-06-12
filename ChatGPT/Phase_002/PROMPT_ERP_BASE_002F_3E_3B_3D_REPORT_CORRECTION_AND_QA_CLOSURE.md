# PROMPT_ERP_BASE_002F_3E_3B_3D_REPORT_CORRECTION_AND_QA_CLOSURE

Act as a senior ERP QA lead, enterprise ERP UI/UX architect, Supabase/PostgreSQL verification reviewer, Next.js build/test reviewer, documentation controller, implementation report auditor, and Cursor completion engineer.

## Phase

ERP BASE 002F.3E.3B.3D — Report Correction and QA Closure

## Prompt Purpose

This is a REPORT CORRECTION / QA CLOSURE prompt.

The implementation report for:

```text
ERP BASE 002F.3E.3B.3D — Core Master Data Forms Required/Footer Rollout
```

was reviewed and is currently:

```text
PASS WITH NOTES — NOT CLOSED
```

The implementation itself appears mostly successful, but the report has incorrect phase sequencing and metadata issues.

Your task is to correct the 3B.3D implementation report and produce a corrected closure report.

Do not implement new features.

Do not modify source code unless you discover a direct report-linked issue that proves the implementation report is inaccurate.

Do not modify database schema.

Do not create migrations.

Do not apply SQL.

Do not proceed to 3B.3E implementation.

Do not proceed to 3B.4 Safe Close.

---

# 1. Mandatory Standards To Read First

Before correcting the report, read and follow:

```text
docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md

docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
```

Review the approved phase sequence from:

```text
ERP_BASE_002F_3E_3B_3B_NEXT_IMPLEMENTATION_PROMPT_PLAN.md

ERP_BASE_002F_3E_3B_3B_FOOTER_STANDARD_ROLLOUT_MATRIX.md

ERP_BASE_002F_3E_3B_3C_COMPLETION_FIX_NUMBERING_ASSIGN_ROLE_QA_REPORT.md
```

Review the current 3B.3D implementation report:

```text
ERP_BASE_002F_3E_3B_3D_CORE_MASTER_DATA_FORMS_REQUIRED_FOOTER_IMPLEMENTATION_REPORT.md
```

If the actual report file name differs, locate the current 3B.3D report and document the real file path/name.

---

# 2. Mandatory Supabase Connection First

Connect to live Supabase for workflow consistency:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

No schema changes are needed.

The corrected report must include:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
No database changes were required for this report correction and QA closure phase.
```

If Supabase connection fails, continue report correction but document:

```text
WARNING — Live Supabase verification could not be completed during this report correction. No database changes were performed.
```

---

# 3. Issues To Correct

## Issue 1 — Wrong Next Phase Reference

The current 3B.3D report incorrectly says the next phase is:

```text
ERP BASE 002F.3E.3B.4 — Safe Close / Unsaved Changes
```

This is wrong.

Correct next phase is:

```text
ERP BASE 002F.3E.3B.3E — Standalone Auth Forms RequiredLabel Rollout
```

Then:

```text
ERP BASE 002F.3E.3B.3F — Final Required/Footer QA
```

Only after 3B.3F should we proceed to:

```text
ERP BASE 002F.3E.3B.4 — Safe Close, Unsaved Changes, and Modal Layout Standard
```

Correct all next-phase references in the report.

## Issue 2 — Report Date Metadata

The current report metadata shows:

```text
Implementation Date: 2026-06-06
```

This is inconsistent with the current phase sequence and reports around June 11, 2026.

Correct the report metadata to the actual current date/time of correction.

Include both:

```text
Original Implementation Report Date: as stated in old report
Correction / QA Closure Date: current date/time
```

If the original date cannot be verified, state:

```text
Original report date appeared inconsistent and has been corrected in this closure report.
```

## Issue 3 — Browser Testing Pending Means PASS WITH NOTES

The current report indicates manual browser testing is pending because authenticated environment is required.

Therefore final status cannot be full PASS unless authenticated browser testing is completed.

Correct final status to:

```text
PASS WITH NOTES — 3B.3D implementation completed; manual authenticated browser QA pending.
```

If authenticated browser testing is completed during this correction phase, document evidence and results. Otherwise keep PASS WITH NOTES.

## Issue 4 — Safe Close Scope Clarification

Confirm clearly:

```text
3B.3D did NOT implement Safe Close.
3B.3D did NOT implement outside-click prevention.
3B.3D did NOT implement dirty-state tracking.
3B.3D did NOT implement unsaved-changes confirmation.
```

These remain planned for:

```text
ERP BASE 002F.3E.3B.4 — Safe Close, Unsaved Changes, and Modal Layout Standard
```

but only after:

```text
3B.3E — Standalone Auth Forms RequiredLabel Rollout
3B.3F — Final Required/Footer QA
```

## Issue 5 — Verify Report Content Consistency

Re-read the implementation report and correct any internal contradictions, especially:

```text
Status says PASS - COMPLETE while browser testing is pending.
Ready for 3B.4 while actual next phase is 3B.3E.
Manual testing pending but final sign-off says complete without notes.
```

Correct wording to be consistent.

---

# 4. Scope

## In Scope

```text
Correct 3B.3D report metadata.
Correct next phase reference.
Correct final status to PASS WITH NOTES if browser testing remains pending.
Clarify Safe Close remains out of scope.
Confirm static test results as reported.
Confirm 16 Core Master Data forms remain in scope.
Create corrected closure report.
```

## Out of Scope

```text
New feature implementation
RequiredLabel changes
ERPFormFooter changes
Core Master Data form code changes unless necessary for direct correction
Admin/System form changes
Authentication form changes
Safe Close / Unsaved Changes
Outside-click prevention
Dirty-state tracking
Confirmation dialogs
Database migration
SQL execution
Global Search
AI
DMS
```

---

# 5. Files To Inspect

Inspect:

```text
ERP_BASE_002F_3E_3B_3D_CORE_MASTER_DATA_FORMS_REQUIRED_FOOTER_IMPLEMENTATION_REPORT.md

ERP_BASE_002F_3E_3B_3B_NEXT_IMPLEMENTATION_PROMPT_PLAN.md

ERP_BASE_002F_3E_3B_3B_FOOTER_STANDARD_ROLLOUT_MATRIX.md

ERP_BASE_002F_3E_3B_3C_COMPLETION_FIX_NUMBERING_ASSIGN_ROLE_QA_REPORT.md
```

Optionally inspect relevant source files only to confirm report claims if necessary:

```text
src/features/master-data/geography/components/
src/features/master-data/finance-basics/components/
src/features/master-data/uom/components/
src/features/master-data/lookups/components/
```

Do not modify source unless a direct mismatch is found.

---

# 6. Required Output

Create a corrected report:

```text
ERP_BASE_002F_3E_3B_3D_REPORT_CORRECTION_AND_QA_CLOSURE_REPORT.md
```

The corrected report must include:

1. Phase name.
2. Original report reviewed.
3. Correction date/time.
4. Supabase connection confirmation or warning.
5. Standards reviewed.
6. Summary of original implementation claims.
7. Corrections made to report logic.
8. Correct next phase sequence.
9. Correct Safe Close scope clarification.
10. Correct final status.
11. Manual browser testing status.
12. Static test status as reported.
13. Whether any source code was modified.
14. Final closure recommendation.

Final status must be exactly one of:

```text
PASS WITH NOTES — 3B.3D implementation completed; manual authenticated browser QA pending.
PASS — 3B.3D implementation completed and authenticated browser QA passed.
FAIL — 3B.3D report or implementation still requires correction before approval.
BLOCKED — 3B.3D correction could not be completed due to blocking issue.
```

---

# 7. Correct Final Phase Status

Unless authenticated manual browser testing is completed, use:

```text
PASS WITH NOTES — 3B.3D implementation completed; manual authenticated browser QA pending.
```

Do not mark full PASS if browser QA remains pending.

---

# 8. Correct Next Phase Section

The corrected report must state:

```text
Next Phase:
ERP BASE 002F.3E.3B.3E — Standalone Auth Forms RequiredLabel Rollout
```

Then:

```text
ERP BASE 002F.3E.3B.3F — Final Required/Footer QA
```

Then:

```text
ERP BASE 002F.3E.3B.4 — Safe Close, Unsaved Changes, and Modal Layout Standard
```

---

# 9. Stop Condition

After creating the corrected closure report, stop.

Do not proceed to 3B.3E.

Do not proceed to 3B.4.

Wait for Sameer/Dina review.

---

# Final Instruction

Read standards.

Connect to Supabase.

Inspect the 3B.3D report.

Correct date/status/next-phase/safe-close scope.

Create the corrected closure report.

Stop.
