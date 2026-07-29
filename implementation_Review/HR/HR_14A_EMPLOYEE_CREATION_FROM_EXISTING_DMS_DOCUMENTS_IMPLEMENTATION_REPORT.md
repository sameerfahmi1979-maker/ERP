# HR.14A — Employee Creation from Existing DMS Documents
## Implementation Report

**Phase:** HR.14A — Employee Creation from Existing DMS Documents  
**Date:** 2026-07-09  
**Status:** CLOSED / PASS ✅  
**tsc result:** PASS (0 errors)  
**build result:** PASS (Next.js 16.2.6 Turbopack, 0 errors, 0 warnings)

---

## 1. Executive Summary

HR.14A implements the "Add from Documents" wizard on the HR Employees page. It allows HR users to select existing DMS documents already uploaded through the standard DMS mechanism, read existing OCR/AI extraction results from those documents, review a suggested employee draft and compliance child records, resolve conflicts, and create the employee with one confirmed save action.

No new DMS upload flow was created. No new intake sidebar was created. No HR.14B was implemented. The design follows the approved direction: DMS = upload/OCR/AI storage; HR = consume existing DMS data.

---

## 2. Scope Implemented

| Item | Status |
|------|--------|
| "Add from Documents" button on HR Employees page | ✅ Done |
| Existing DMS document picker (search, filter, multi-select) | ✅ Done |
| Document extraction/merge (reads existing DMS results) | ✅ Done |
| Employee draft review step (suggested fields + manual required fields) | ✅ Done |
| Compliance suggestion review (identity docs + medical insurance) | ✅ Done |
| Conflict detection and resolution UI | ✅ Done |
| Duplicate checks (mobile, email, name+DOB) | ✅ Done |
| Human-confirmed save (employee + status event + compliance + DMS links) | ✅ Done |
| Audit logging (aggregate, duplicate_check, create events) | ✅ Done |
| Feature flag `ERP_AI_HR_DOCUMENT_TO_EMPLOYEE` (default: disabled) | ✅ Done |
| Redirect to new employee profile after save | ✅ Done |
| No new sidebar/DMS menu | ✅ Confirmed |
| No HR.14B | ✅ Confirmed |

---

## 3. Files Created

| File | Description |
|------|-------------|
| `src/lib/hr/document-to-record/types.ts` | All shared types and Zod schemas |
| `src/lib/hr/document-to-record/document-classifier.ts` | DMS type code → HR classification mapping |
| `src/lib/hr/document-to-record/dms-employee-draft-mapper.ts` | Extraction results → employee draft |
| `src/lib/hr/document-to-record/dms-compliance-suggestion-mapper.ts` | Extraction results → compliance suggestions |
| `src/lib/hr/document-to-record/duplicate-checks.ts` | Server-side duplicate check utility |
| `src/server/actions/hr/document-to-employee.ts` | Server actions: getDmsDocumentsForEmployeeCreate, aggregateEmployeeDraftFromDmsDocuments, checkDuplicatesForEmployeeCreate, createEmployeeFromDmsDocuments |
| `src/features/hr/employees/document-create/hr-document-employee-create-wizard.tsx` | Main wizard orchestrator (4-step, ERPChildDialogForm xl) |
| `src/features/hr/employees/document-create/hr-document-picker-step.tsx` | Step 1: DMS document selection UI |
| `src/features/hr/employees/document-create/hr-document-employee-review-step.tsx` | Step 2: Employee draft review + manual required fields |
| `src/features/hr/employees/document-create/hr-document-compliance-review-step.tsx` | Step 3: Compliance suggestion review |
| `src/features/hr/employees/document-create/hr-document-create-summary-step.tsx` | Step 4: Confirm & Save summary |
| `src/features/hr/employees/document-create/hr-document-confidence-badge.tsx` | Confidence % badge (green/yellow/red) |
| `src/features/hr/employees/document-create/hr-document-conflict-card.tsx` | Multi-document field conflict resolution card |
| `supabase/migrations/20260709130000_hr14a_employee_creation_from_existing_dms_documents.sql` | Feature flag migration |

---

## 4. Files Modified

| File | Change |
|------|--------|
| `src/features/hr/employees/employees-table.tsx` | Added `FileStack` icon import, `wizardOpen` state, "Add from Documents" button beside "Add Employee", `HrDocumentEmployeeCreateWizard` mount at component bottom |

---

## 5. Migration Summary

**File:** `supabase/migrations/20260709130000_hr14a_employee_creation_from_existing_dms_documents.sql`

Inserts one new row in `erp_ai_feature_flags`:

| feature_code | is_enabled | requires_human_review | min_confidence_threshold |
|---|---|---|---|
| `ERP_AI_HR_DOCUMENT_TO_EMPLOYEE` | `false` | `true` | `0.70` |

Applied via `user-supabase` MCP (apply_migration). `ON CONFLICT DO NOTHING` ensures idempotency.

---

## 6. UI Entry Point

- **Location:** `HR → Employees` page toolbar
- **Button label:** "Add from Documents"  
- **Icon:** `FileStack` (lucide-react)
- **Visibility:** Only shown when user has `hr.employees.create` or `system_admin` role
- **Position:** To the left of "Add Employee" button

No new sidebar menu, no new DMS menu, no new route registered.

---

## 7. Wizard Workflow

```
Step 1 — Select Existing DMS Documents
  - Search DMS document library (title, document_no)
  - Multi-select
  - Shows classification badge (Passport, Emirates ID, etc.)
  - Shows extraction status (AI ready / OCR only / No extraction)
  - Shows extracted person name if available
  - "Extract & Continue" triggers server-side aggregation

Step 2 — Employee Draft Review
  - Suggested fields from document extractions shown with confidence badge
  - Required fields clearly marked (*)
  - Fields pre-populated: name, gender, DOB, mobile, email
  - Manual required fields: company, joining date, emergency contact
  - Conflict cards shown if multiple documents disagree on same field
  - Duplicate warning displayed if possible existing employee found

Step 3 — Compliance Suggestion Review
  - Shows suggested compliance child records per document
  - Supported: identity documents (Passport, EID, Visa, Labour Card), Medical Insurance
  - Include/Exclude toggle per record
  - Fields editable per record before save
  - Confidence badge + warnings shown per record

Step 4 — Confirm & Save
  - Summary of employee, source documents, compliance records
  - No data saved until user clicks "Save Employee"
  - Server-side duplicate check runs again before save
  - Success: toast + redirect to new employee profile
```

---

## 8. DMS Document Selection

- Server action: `getDmsDocumentsForEmployeeCreate()`
- Reads `dms_documents` via RLS-enforced client (dms.documents.view permission required)
- Checks `dms_ai_extraction_results` and `dms_document_files` for extraction/OCR status
- Returns `HrDmsDocumentSelection[]` with classification, has_extraction, has_ocr, extracted_person_name

---

## 9. Extraction / Merge Logic

- Server action: `aggregateEmployeeDraftFromDmsDocuments(documentIds)`
- Calls `loadLatestDmsExtraction()` (from `compliance-dms-ocr.ts`) for each selected document
- Uses `buildEmployeeDraftFromDocuments()` (dms-employee-draft-mapper.ts) to merge fields
- Uses `buildComplianceSuggestions()` (dms-compliance-suggestion-mapper.ts) for child record hints
- Conflict detection: if two documents provide different values for the same field, a `HrDocumentConflict` is created
- `classifyDmsDocument()` maps DMS type code → HR classification (PASSPORT, EMIRATES_ID, etc.)

No AI provider calls are made. All data comes from existing `dms_ai_extraction_results` stored in the database.

---

## 10. Employee Draft Mapping

Deterministic field extraction from `extracted_fields_json`:

| Employee Field | Extraction Keys |
|---|---|
| full_name_en | full_name_en, full_name, name_en, holder_name, person_name, name |
| full_name_ar | full_name_ar, name_ar, arabic_name |
| gender | gender, sex |
| date_of_birth | date_of_birth, dob, birth_date, birthdate |
| mobile_number | mobile_number, mobile, phone, phone_number, contact_number |
| personal_email | email, personal_email, email_address |

The following fields are always manual (cannot come from documents):
- owner_company_id, branch_id, department_id, designation_id, employee_category_id
- employment_type_id, joining_date, emergency_contact_name, emergency_contact_mobile

---

## 11. Compliance Suggestions

### Identity Documents
Extracted fields: document_number, issue_date, expiry_date, issuing_authority, uid_number, visa_file_number, labour_card_number, work_permit_number, mohre_person_code, profession_on_document

Classification → hr_identity_document_types via `hrIdentityTypeMap` built from DB at aggregation time.

### Medical Insurance
Extracted fields: insurance_provider, policy_number, insurance_card_number, network_class, issue_date, expiry_date

### Training Certificates
Deferred to HR.14B. Only included if DMS document explicitly classified as TRAINING_CERTIFICATE.

---

## 12. Duplicate / Conflict Handling

**Client-side:** Conflict cards shown in Step 2 for same field from different documents. User must choose resolution value.

**Server-side (pre-save):**
- Mobile number match → warn
- Personal email match → warn
- Full name + date of birth match → warn
- (Future: Emirates ID / Passport number match → block — deferred to HR.14B identity doc checks)

Blocking duplicates prevent save. Warning duplicates are shown but user may proceed.

No auto-merge. No automatic update of existing employee (belongs to HR.14B).

---

## 13. Save Transaction / Persistence

Sequential save with error handling (no Supabase DB transaction — consistent with existing ERP pattern):

1. `generate_next_reference_number` RPC → employee_code
2. `employees` insert (adminClient)
3. `employee_status_events` insert
4. Loop: create each included compliance child record (adminClient)
5. Loop: link each selected DMS document to employee via `dms_document_links` (adminClient, idempotent)
6. `dms_document_events` insert per linked document
7. `logAudit()` — `document_to_employee.create`
8. `revalidatePath('/admin/hr/employees')`

Failures in steps 4–5 produce warnings (non-fatal) rather than aborting the entire save.

---

## 14. DMS Linking

All selected DMS documents are linked to the new employee via `dms_document_links`:
- `entity_type = 'employee'`
- `entity_id = newEmployeeId`
- `link_role = 'hr14a_source'`
- Idempotent: if link already exists, it is skipped (counted as linked)

Child compliance records that have a `dms_document_id` field have it set to the source document ID.

---

## 15. Permissions / Feature Flags

| Permission | Required For |
|---|---|
| `hr.employees.create` | All wizard actions |
| `dms.documents.view` | getDmsDocumentsForEmployeeCreate, aggregateEmployeeDraftFromDmsDocuments |
| `hr.compliance.manage` | Compliance child record creation (standard pattern) |
| `system_admin` role | Bypasses all permission checks (consistent with ERP pattern) |

**Feature flag:** `ERP_AI_HR_DOCUMENT_TO_EMPLOYEE` — default `is_enabled = false`, `requires_human_review = true`. Flag is for future AI-assisted aggregation. Current implementation reads deterministic extraction results only.

---

## 16. Security / Redaction / AI Safety

- No AI provider calls made directly in this phase
- No raw OCR text exposed to users in the UI (only structured extracted fields)
- No auto-save, no auto-approve, no auto-send, no auto-merge
- Sensitive field values (document numbers, DOB) not stored in audit log
- All writes use `createAdminClient()` with explicit permission check before use
- Human review is mandatory at every step — wizard does not skip review steps
- All compliance records created only after explicit user confirmation in Step 4

---

## 17. Audit Logging

Three audit events logged via `logAudit()`:

| Action | When | Metadata |
|---|---|---|
| `document_to_employee.aggregate` | After aggregation of document data | selected_document_ids, conflict_count, compliance_suggestions count |
| `document_to_employee.duplicate_check` | On explicit duplicate check call | duplicates_found count |
| `document_to_employee.create` | After successful employee creation | employee_code, name, document_ids, compliance_records_count, documents_linked, conflict_count |

Not logged:
- Raw OCR text
- Raw AI prompts or responses
- Full document numbers (only counts)

---

## 18. Explicit Scope Not Implemented

| Item | Decision |
|---|---|
| HR.14B (existing employee update from DMS) | Deferred to next phase |
| Add Dependent from Documents | Deferred to HR.14B |
| Training certificate wizard (full) | Deferred — suggestion framework in place |
| Recruitment candidate conversion | Deferred |
| AI auto-merge / auto-approve | Intentionally excluded — AI safety requirement |
| New DMS upload flow | Excluded by design |
| New HR intake sidebar | Excluded by design |
| New pre-hire intake table | Excluded by design |

---

## 19. TypeScript Result

```
npx tsc --noEmit → Exit code: 0 (PASS)
No errors.
```

---

## 20. Build Result

```
npm run build → Exit code: 0 (PASS)
✓ Compiled successfully in 18.6s
Finished TypeScript in 46s
✓ Generating static pages (5/5) in 149ms
0 errors, 0 warnings
```

---

## 21. Issues / Notes

- The `nanoid` package is already installed (used by `dms-compliance-suggestion-mapper.ts` for `tempId`)
- The `useOwnerCompaniesQuery` and `useCountriesQuery` hooks are reused from existing pattern
- `ERPChildDialogForm` is used for the wizard (xl size = 1120px) — consistent with child form standard
- The wizard uses `useTransition` for the aggregate step to avoid blocking the UI
- Training certificate suggestions are produced if classification is TRAINING_CERTIFICATE but the save path for training certificates requires `training_type_id` — if that FK can't be resolved deterministically, the record is filtered out silently (warning not added since training_type is not extractable from documents without AI)

---

## 22. Recommended Next Phase

**HR.14B — Existing Employee Record Updates from Existing DMS Documents**

Entry point: Employee Profile → Compliance tab → "Update from Documents" action  
Scope: Prefill/update identity documents, medical insurance, training certificates for an existing employee using newly uploaded or existing DMS documents

---

## 23. Mandatory Scope Checklist

```
[x] HR.14A only implemented
[x] No HR.14B implemented
[x] No new DMS menu created
[x] No new HR intake sidebar/menu created
[x] No duplicate DMS upload flow created
[x] HR Employees → Add from Documents added
[x] Existing DMS document picker implemented
[x] Document extraction/merge implemented
[x] Employee draft review implemented
[x] Compliance suggestion review implemented
[x] Duplicate checks implemented
[x] Human-confirmed save implemented
[x] Employee created only after final user confirmation
[x] Compliance child records created only after confirmation
[x] DMS documents linked to new employee
[x] dms_document_id set on relevant child records
[x] Audit logging implemented
[x] Permissions enforced
[x] Feature flag default disabled if added
[x] No AI auto-save/approve/send/merge
[x] No direct OpenAI SDK import
[x] SOT updated
[x] Implementation report created
[x] tsc run — PASS
[x] build run — PASS
```
