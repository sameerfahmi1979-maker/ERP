# PROMPT_ERP_BASE_002F_3E_3B_5_GLOBAL_FORM_RUNTIME_QA_AND_STANDARD_CLOSURE_GATE

Act as a senior ERP QA lead, runtime/browser QA engineer, Playwright tester, React/Next.js enterprise form auditor, UI/UX standards compliance reviewer, Supabase-connected application tester, and Cursor QA engineer.

## Phase

ERP BASE 002F.3E.3B.5 — Global Form Runtime QA and Standard Closure Gate

## Prompt Purpose

This is a controlled RUNTIME QA / CLOSURE GATE prompt.

Do not implement new functionality unless a blocking defect is found.

This phase exists because multiple global form standards were implemented separately:

```text
3B.2 — Global Combobox Foundation
3B.3 — Required Field Markers + Form Footer Standard
3B.4 — Safe Close / Unsaved Changes
3B.4C — Runtime Safe Close Deep Fix
```

Now we must verify the full form runtime standard together across representative ERP forms.

This QA must prioritize **real browser/runtime behavior**, not only source code review.

The Safe Close phase proved that source-only review is not enough.

---

# 1. Current Approved Status Before This Gate

Treat these as implemented and needing QA verification:

```text
Global Combobox foundation — implemented
Required field marker standard — implemented
ERPFormFooter standard — implemented
Save keeps form open — implemented
Save & Close closes after save — implemented
Safe Close / Unsaved Changes — fixed in 3B.4C and manually confirmed by user
View mode Close-only footer — implemented
Drawer form standard — implemented
```

The purpose is to confirm they work together and do not conflict.

---

# 2. Mandatory Supabase Connection First

Before QA, connect to live Supabase:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

Verify minimum tables:

```text
customers
roles
user_profiles
owner_companies
branches
global_numbering_rules
countries
emirates
cities
areas_zones
banks
currencies
payment_terms
tax_types
uom_categories
units_of_measure
unit_conversions
global_lookup_categories
global_lookup_values
```

No database schema changes are expected.

The final QA report must include:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
No database changes were required for Global Form Runtime QA and Standard Closure Gate.
```

If Supabase connection fails, continue source/browser QA if possible and document the warning clearly.

---

# 3. Mandatory Documents and Reports to Read

Read standards:

```text
docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md
docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
```

Read latest reports:

```text
ERP_BASE_002F_3E_3B_2D_CUSTOMER_FORM_FINAL_QA_REPORT.md
ERP_BASE_002F_3E_3B_3F_REQUIRED_FOOTER_FINAL_QA_REPORT.md
ERP_BASE_002F_3E_3B_3F_SAVE_BUTTON_KEEP_FORM_OPEN_FIX_REPORT.md
ERP_BASE_002F_3E_3B_3F_CUSTOMER_SAVE_BUTTONS_FINAL_QA_FIX_REPORT.md
ERP_BASE_002F_3E_3B_4_SAFE_CLOSE_UNSAVED_CHANGES_IMPLEMENTATION_REPORT.md
ERP_BASE_002F_3E_3B_4A_SAFE_CLOSE_ROLLOUT_TO_REMAINING_FORMS_REPORT.md
ERP_BASE_002F_3E_3B_4B_SAFE_CLOSE_INVESTIGATION_AND_FIX_REPORT.md
ERP_BASE_002F_3E_3B_4C_SAFE_CLOSE_RUNTIME_INVESTIGATION_AND_FIX_REPORT.md
```

The QA report must confirm these were reviewed.

---

# 4. Scope of QA

This phase must test the full global form standard across representative forms.

## Primary Forms to Test in Browser

Test these at minimum:

```text
Customer Add/Edit/View
Role Add/Edit
Organization Add/Edit
Branch Add/Edit
Numbering Rule Add/Edit/View
Country Add/Edit/View
Bank Add/Edit/View
Currency Add/Edit/View
Unit Add/Edit/View
Lookup Category Add/Edit/View
```

If time permits, also test:

```text
Emirate
City
Area/Zone
Port
Payment Term
Tax Type
Cost Center
Profit Center
UOM Category
Unit Conversion
Lookup Value
```

## Source-Wiring Verification for All Forms

Even if browser testing focuses on representative forms, verify source wiring for all forms covered by 3B.2/3B.3/3B.4:

```text
Customer
Roles
Users Add/Edit
Organizations
Branches
Numbering Rules
Geography forms
Finance Basics forms
UOM forms
Lookup forms
```

---

# 5. QA Standards to Verify

## 5.1 Combobox Standard

For every lookup/select field in tested forms:

```text
must use ERPCombobox / LookupSelect / approved combobox wrapper
must be searchable
must not be old plain select/dropdown unless documented exception
must render correctly inside drawer/dialog
must not be cut off by modal boundaries
must work with keyboard and mouse
must show selected value after choosing
must keep value after validation error
```

Test representative comboboxes:

```text
Customer Type
Customer Status
Country
Emirate
City
Bank
Currency
Payment Terms
Tax Type
Role permissions if applicable
```

## 5.2 Required Field Marker Standard

Verify:

```text
required fields show red *
required validation appears under fields or via approved error pattern
required markers are not shown on optional fields
view mode does not show confusing validation state
```

## 5.3 Footer Standard

Add/Edit mode footer:

```text
Cancel | Save | Save & Close
```

View mode footer:

```text
Close only
```

Verify no form has:

```text
Cancel only
Save missing
Save & Close missing
Save button in View mode
incorrect button order
footer hidden behind scroll
footer outside drawer boundary
```

## 5.4 Save Behavior

For Add/Edit forms:

```text
Save:
- validates required fields
- saves successfully when valid
- keeps form open
- resets dirty state
- does not create duplicate record on repeated Save after Add
```

For Customer, specifically verify:

```text
Add Customer → Save → drawer stays open
Save again → no duplicate customer
Save & Close → drawer closes
```

## 5.5 Save & Close Behavior

Verify:

```text
Save & Close:
- validates required fields
- saves successfully when valid
- closes only after successful save
- does not close on validation/server error
```

## 5.6 Safe Close / Unsaved Changes Behavior

Verify for dirty Add/Edit forms:

```text
outside click → Unsaved Changes dialog appears and drawer stays open
Esc → Unsaved Changes dialog appears and drawer stays open
X → Unsaved Changes dialog appears and drawer stays open
Cancel → Unsaved Changes dialog appears and drawer stays open
Stay on Form → closes dialog only, preserves data
Discard Changes → closes form
```

Verify for clean Add/Edit forms:

```text
outside click can close directly
```

Verify after Save:

```text
Save resets dirty
outside click after Save with no further edits can close directly
```

Verify View mode:

```text
outside click / Esc / X / Close can close directly without Unsaved Changes dialog
```

## 5.7 Drawer Layout Standard

Verify:

```text
drawer uses correct enterprise width
no horizontal scroll
footer remains visible/sticky
header remains stable
tabs do not break layout
content scrolls vertically only inside correct area
fields align properly
combobox dropdowns are visible and usable
forms look modern enterprise style
```

## 5.8 Modal/Dialog Layout Standard

For 720px child or dialog forms if encountered:

```text
dialog width is correct
no horizontal scroll
footer button alignment is correct
confirmation dialogs layer correctly above drawers
focus behavior is acceptable
```

---

# 6. Investigation Rules if QA Finds a Bug

If a bug is found, classify it:

```text
BLOCKING — data loss, cannot save, Save/Save & Close broken, Safe Close broken, form cannot open, build/typecheck fails
MAJOR — wrong footer, required markers missing on critical fields, combobox unusable, layout breaks
MINOR — cosmetic issue, spacing, non-blocking label alignment
FUTURE — enhancement outside current phase
```

## Blocking Bug Rule

If a blocking bug is found:

```text
fix it in this phase only if it is directly related to the global form standard
run tests again
document before/after
```

If it is outside this phase:

```text
do not fix unrelated feature
document it as blocker requiring separate prompt
```

## No Guessing

For any UI runtime issue:

```text
test in browser
do not assume from source
use console/browser debugging if needed
```

---

# 7. Browser QA Requirement

Use browser/runtime testing where possible.

If login/session is available:

```text
test in real ERP routes
```

If login/session is not available:

```text
use authenticated session setup if project supports it
or create temporary dev-only harness for shared form runtime components
remove harness before final report unless approved as dev-only
```

Do not claim full PASS without browser/runtime testing.

---

# 8. Static Tests

Run:

```bash
npm run typecheck
npm run lint
npm run build
```

Requirements:

```text
typecheck must pass
build must pass
lint must be run and documented
if new lint errors are introduced by fixes, correct them
pre-existing unrelated lint issues may be documented
```

---

# 9. Required QA Matrix

The final report must include a matrix like:

```text
Form | Add Footer | Edit Footer | View Footer | Combobox | Required * | Save | Save & Close | Safe Close | Layout | Status
```

Minimum rows:

```text
Customer
Role
Organization
Branch
Numbering Rule
Country
Bank
Currency
Unit
Lookup Category
```

Also include a source-wiring coverage matrix for all forms:

```text
Form | ERPCombobox/LookupSelect | RequiredLabel | ERPFormFooter | useFormDirty | ERPDrawerForm isDirty | resetDirty | Status
```

---

# 10. Required Report

Create:

```text
ERP_BASE_002F_3E_3B_5_GLOBAL_FORM_RUNTIME_QA_AND_STANDARD_CLOSURE_GATE_REPORT.md
```

Report must include:

1. Phase name.
2. Date/time.
3. Supabase connection confirmation.
4. Standards reviewed.
5. Previous reports reviewed.
6. Browser/runtime QA environment.
7. Forms tested in browser.
8. Source-wiring coverage.
9. Combobox QA results.
10. Required field marker QA results.
11. Footer QA results.
12. Save / Save & Close QA results.
13. Safe Close QA results.
14. Drawer/modal layout QA results.
15. Bugs found.
16. Bugs fixed, if any.
17. Bugs deferred, if any.
18. Static test results.
19. Final QA matrix.
20. Closure recommendation.

Final status must be exactly one of:

```text
PASS — Global form runtime standards verified and closure gate passed.
PASS WITH NOTES — Global form runtime standards verified with non-blocking notes.
FAIL — Blocking issues found; do not close standard gate.
BLOCKED — QA could not be completed due to blocking environment/tooling issue.
```

---

# 11. Closure Criteria

Do not mark PASS unless:

```text
browser/runtime QA confirms representative forms work
Safe Close works in real runtime
Save keeps open
Save & Close closes
Required markers are present
Footer standard is correct
Comboboxes are usable
View mode Close only
No horizontal scroll/layout break
typecheck passes
build passes
```

If browser QA is partial but enough to prove shared runtime and no blockers are found:

```text
PASS WITH NOTES
```

If Safe Close fails again:

```text
FAIL
```

---

# 12. Stop Condition

After QA, fixes if needed, tests, and report, stop.

Do not start 3B.6.

Wait for Sameer/Dina review.

---

# Final Instruction

Run a serious browser/runtime global form standards QA.

Do not trust source review only.

Verify the combined standard:

Combobox + Required * + Footer + Save + Save & Close + Safe Close + View mode + Layout.

Create final QA closure gate report.

Stop.
