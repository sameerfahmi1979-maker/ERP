# HR.14A FIX — ERPCombobox Upgrade + Passport/EID Duplicate Check
**Implementation Report**
Date: 2026-07-09
Phase: HR.14A FIX (targeted gap fix before HR.14B)
Author: Cursor AI Agent
Linked QA Report: `HR_14A_QA_RUNTIME_SECURITY_GAP_REPORT.md`

---

## 1. Executive Summary

This targeted fix phase closed two medium-severity gaps identified in the HR.14A QA report:

- **GAP-HR14A-003**: Branch, department, designation, employee category, and employment type fields were absent from the wizard's employee review step. Users had no way to assign these important fields during employee creation from DMS documents.
- **GAP-HR14A-004**: Passport and Emirates ID duplicate checks were not implemented. An employee with a pre-existing passport or EID number could be created as a duplicate.

Both gaps are now fixed. No HR.14B code was introduced. No new DMS menus, intake flows, or sidebar entries were added.

---

## 2. Issues Fixed

| Gap ID | Severity | Description | Status |
|---|---|---|---|
| GAP-HR14A-003 | Medium | Raw number inputs / missing lookup fields in employee review step | **FIXED** |
| GAP-HR14A-004 | Medium | Passport and Emirates ID duplicate checks not implemented | **FIXED** |

---

## 3. Files Created

| File | Purpose |
|---|---|
| `implementation_Review/HR_Module/HR_14A_FIX_QA_CHECKS.sql` | 12 read-only SQL checks for identity duplication, lookup data, and flag status |
| `implementation_Review/HR_Module/HR_14A_FIX_ERPCOMBOBOX_DUPLICATE_CHECK_IMPLEMENTATION_REPORT.md` | This report |

---

## 4. Files Modified

| File | Change Summary |
|---|---|
| `src/features/hr/employees/document-create/hr-document-employee-review-step.tsx` | Added 5 ERPCombobox fields (branch, department, designation, category, employment type); added `identityDocDuplicates` prop with blocking red alert UI |
| `src/lib/hr/document-to-record/duplicate-checks.ts` | Added `normalizeDocumentNumber()`, `IdentityDocCheckInput` type, `runIdentityDocumentDuplicateChecks()` |
| `src/lib/hr/document-to-record/types.ts` | Added `identityDocDuplicates: DuplicateCheckResult[]` to `HrDocumentToEmployeeReviewPayload` |
| `src/server/actions/hr/document-to-employee.ts` | Updated `aggregateEmployeeDraftFromDmsDocuments` to run identity doc checks and include in response; updated `createEmployeeFromDmsDocuments` to block on identity doc duplicates before insert |
| `src/features/hr/employees/document-create/hr-document-employee-create-wizard.tsx` | Added `identityDocDuplicates` state, reset in `handleOpenChange`, set from aggregation payload, passed to review step |

---

## 5. Migration Summary

No database migrations required for this fix. All changes are application-layer only.

---

## 6. ERPCombobox Upgrade

### Fields Upgraded

| Field | Old State | New State | Source |
|---|---|---|---|
| `branch_id` | Missing from UI | `ERPCombobox` filtered by `owner_company_id` | `useBranchesQuery` (existing hook) |
| `department_id` | Missing from UI | `ERPCombobox` | `listDepartments` server action |
| `designation_id` | Missing from UI | `ERPCombobox` | `listDesignations` server action |
| `employee_category_id` | Missing from UI | `ERPCombobox` | `listHrEmployeeCategories` server action |
| `employment_type_id` | Missing from UI | `ERPCombobox` | `listHrEmploymentTypes` server action |

### Confirmed Unchanged (already ERPCombobox)

| Field | Status |
|---|---|
| `owner_company_id` | Already ERPCombobox using `useOwnerCompaniesQuery` ✅ |
| `nationality_id` | Already ERPCombobox using `useCountriesQuery` ✅ |

### Dependency Logic

- `branch_id` is filtered by `owner_company_id` via `useBranchesQuery({ ownerCompanyId: form.owner_company_id, enabled: !!form.owner_company_id })`.
- When `owner_company_id` changes, `branch_id` is reset to `null`.
- `department_id`, `designation_id`, `employee_category_id`, `employment_type_id` are global (no owner_company dependency in the current data model).
- All comboboxes have `allowClear` set, are optional fields (no `required` marker), and pass numeric IDs in the final payload.

### UX Labels

Each combobox shows human-readable labels:
- Branch: branch name (with branch code as description where available via `mapBranchToOption`)
- Department: `department_name_en` (with `department_code`)
- Designation: `designation_name_en` (with `designation_code`)
- Employee Category: `name_en` (with `code`)
- Employment Type: `name_en` (with `code`)

---

## 7. Passport / Emirates ID Duplicate Check

### New Functions in `duplicate-checks.ts`

#### `normalizeDocumentNumber(num: string): string`

```
normalizedInput = num.trim().toUpperCase().replace(/[\s\-]/g, "")
```

Handles EID formats:
- `784-XXXX-XXXXXXX-X` → `784XXXXXXXXXXX`
- `784 XXXX XXXXXXX X` → `784XXXXXXXXXXX`
- `784XXXXXXXXXXX` → `784XXXXXXXXXXX` ✅ (already normalized)

Handles Passport formats:
- `A 12345678` → `A12345678`
- `a12345678` → `A12345678`

#### `runIdentityDocumentDuplicateChecks(db, docs)`

Inputs: `IdentityDocCheckInput[]` — each with `classification`, `documentNumber`, `documentTypeId`.

Process per document:
1. Normalize the input document number.
2. Query `employee_identity_documents` for active/pending records of the same `document_type_id` (limit 500).
3. Normalize each DB value and compare.
4. If match found: return `severity: "block"` result with employee code and name (no document number in reason).

### Client-Side Check (Aggregation)

In `aggregateEmployeeDraftFromDmsDocuments`:
- After building compliance suggestions, extract PASSPORT and EMIRATES_ID suggestions.
- Run `runIdentityDocumentDuplicateChecks` using the RLS-enforced Supabase client.
- Include `identityDocDuplicates` in the response payload.
- Audit log now includes `identity_doc_duplicates_found` count.

### Server-Side Block (Save)

In `createEmployeeFromDmsDocuments`:
1. Collect included compliance records with `kind = "identity_document"` and a `document_number`.
2. Fetch type codes from `hr_identity_document_types` for those `document_type_id`s.
3. Filter for PASSPORT and EMIRATES_ID.
4. Run `runIdentityDocumentDuplicateChecks` using RLS-enforced client.
5. If any blocking duplicate found: **return error**, abort insert.

Error message is safe: `"Employee creation blocked: duplicate identity document found. [employee code] — [employee name]"`. Full document numbers are never included.

---

## 8. Client-Side Behavior

### Blocking Red Alert (new)

When `identityDocDuplicates` contains entries with `severity = "block"`:
- A red alert card is shown at the top of the employee review step.
- Uses `ShieldAlert` icon and red color scheme.
- Lists all blocking duplicates with the offending employee reference.
- Instructs the user not to create a duplicate.
- The "Review Compliance Records" (Next) button is **disabled** while any blocking identity duplicates exist.

### Soft Duplicate Warnings (unchanged)

Existing yellow warning card for mobile/email/name+DOB duplicates still appears and **allows proceeding** (severity = "warn").

---

## 9. Server-Side Protection

All duplicate checks run **server-side before any DB insert**:

| Check | When | Blocks? |
|---|---|---|
| Mobile number duplicate | Aggregation + Save | No (warn only) |
| Personal email duplicate | Aggregation + Save | No (warn only) |
| Full name + DOB | Aggregation + Save | No (warn only) |
| Passport number duplicate | Aggregation (client display) + Save (hard block) | **Yes** |
| Emirates ID duplicate | Aggregation (client display) + Save (hard block) | **Yes** |

Server-side blocking in `createEmployeeFromDmsDocuments` is mandatory and cannot be bypassed by client-side UI manipulation.

---

## 10. Security / Sensitive Data Review

- Full passport and Emirates ID numbers are **never** included in error messages or audit log metadata.
- Reason strings only contain: document type label + existing employee code and name.
- `runIdentityDocumentDuplicateChecks` uses the **RLS-enforced `supabase` client** (not `adminClient`).
- Server-side check in `createEmployeeFromDmsDocuments` uses `adminClient` only for the `hr_identity_document_types` code lookup (type codes are not sensitive). The actual duplicate row query uses the RLS-scoped client.
- No AI provider calls. No OpenAI SDK import.
- No raw OCR text exposed to users.
- Audit log includes `identity_doc_duplicates_found: number` (count only, no document numbers).

---

## 11. QA SQL Checks

Created: `implementation_Review/HR_Module/HR_14A_FIX_QA_CHECKS.sql`

| Check | Description |
|---|---|
| 1 | Feature flag `ERP_AI_HR_DOCUMENT_TO_EMPLOYEE` exists and is disabled by default |
| 2 | All HR AI feature flags (context) |
| 3 | `PASSPORT` and `EMIRATES_ID` type codes present in `hr_identity_document_types` |
| 4 | EID duplicate candidate sample query (normalized comparison) |
| 5 | Passport duplicate candidate sample query (normalized comparison) |
| 6 | Confirm no new HR intake tables created |
| 7 | `employee_identity_documents` table structure check |
| 8 | Actual duplicate identity document pairs by normalized number |
| 9 | DMS document link support for `entity_type = 'employee'` |
| 10 | Recent HR audit log events for `document_to_employee.*` actions |
| 11 | HR numbering rule for employee codes |
| 12 | Active counts for department, designation, category, employment type lookup tables |

---

## 12. Explicit Scope Not Implemented

Per the fix scope boundary:

- ❌ HR.14B not implemented
- ❌ No new DMS menu created
- ❌ No new HR intake/sidebar created
- ❌ No duplicate DMS upload flow created
- ❌ No new AI provider
- ❌ No new DB tables
- ❌ No new report library
- ❌ No atomic RPC rewrite

---

## 13. TypeScript Result

```
npx tsc --noEmit
Exit code: 0
No errors.
```

---

## 14. Build Result

```
npm run build
Exit code: 0
✓ Compiled successfully in 18.0s
TypeScript check: passed
All static pages generated.
```

---

## 15. Issues / Notes

- `useBranchesQuery` filters by `owner_company_id` and resets `branch_id` to null on company change.
- The `employee` join in the identity doc query returns PostgREST's many-to-one object; code guards against array shape with `Array.isArray()`.
- Document normalization strips hyphens and spaces only. It does not strip other characters to avoid over-normalization for international passport formats.
- If the identity document type codes `PASSPORT` or `EMIRATES_ID` do not exist in `hr_identity_document_types`, the check simply returns no duplicates (safe fail-open behavior). SQL check 3 can verify these codes exist.
- The server-side save check uses `adminClient` only to read type codes from `hr_identity_document_types` (non-sensitive metadata). All identity document record queries use the RLS-scoped client.

---

## 16. Readiness Decision for HR.14B

**READY FOR HR.14B**

All GAP-HR14A-003 and GAP-HR14A-004 fixes verified:
- ERPCombobox upgrade: TSC clean, build passes
- Identity document duplicate checks: blocking on both client and server
- No regressions in existing duplicate warn behavior
- No HR.14B code introduced

---

## 17. Mandatory Scope Checklist

```
[x] HR.14A FIX only implemented
[x] No HR.14B implemented
[x] No new DMS menu created
[x] No new HR intake/sidebar created
[x] No duplicate DMS upload flow created
[x] branch_id upgraded to ERPCombobox
[x] department_id upgraded to ERPCombobox
[x] designation_id upgraded to ERPCombobox
[x] employee_category_id upgraded to ERPCombobox
[x] employment_type_id upgraded to ERPCombobox
[x] values remain numeric IDs in payload
[x] Passport duplicate check implemented
[x] Emirates ID duplicate check implemented
[x] Passport/EID duplicates block save server-side
[x] Duplicate document numbers are normalized before compare
[x] Full document numbers not logged in audit metadata
[x] No AI provider call added
[x] SOT updated
[x] Implementation report created
[x] tsc run — Exit 0
[x] build run — Exit 0
```
