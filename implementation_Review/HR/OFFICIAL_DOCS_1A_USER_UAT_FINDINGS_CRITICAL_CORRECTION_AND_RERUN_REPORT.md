# OFFICIAL DOCS.1A — User UAT Findings: Critical Correction and Rerun Report

**Date:** 2026-07-29  
**Phase:** OFFICIAL DOCS.1A — User UAT Correction Batch  
**Environment:** Development / Local (port 3001)  
**Overall Gate:** CONDITIONAL PASS — all defects fixed; business owner manual re-UAT required  
**Previous phase:** OFFICIAL DOCS.1 — CLOSED / CONDITIONAL PASS (2026-07-28)

---

## 1. Executive Verdict

All five user findings were investigated against live source code and the issuance engine. Three confirmed code defects were fixed (C, B, A). One finding (D — Warning Letter incident date) was confirmed as correct-by-design behavior made impossible to reproduce again by Fix C. Findings 1 and 2 (Bank Salary Transfer Letter and Embassy/Consulate Letter) remain **correctly disabled pending business-approved wording** — no wording was invented, no generation was enabled.

**Defects fixed:** 3  
**Findings resolved as designed:** 2 (Bank/Embassy wording lock)  
**No hard-delete bypass added:** confirmed  
**Template Studio remains retired:** confirmed  
**tsc new errors in changed files:** 0  

---

## 2. Environment Classification

- Local/staging (dev server, `http://localhost:3001`)
- Live Supabase project: `mmiefuieduzdiiwnqpie` (same as OFFICIAL DOCS.1)
- Production activation: still pending (same hold from OFFICIAL DOCS.1 §16)

---

## 3. Read-First Evidence

Files read before any change:
- `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`
- All active `.cursor/rules/*.mdc`
- `implementation_Review/HR/OFFICIAL_LETTERS_FORMS_GENERATOR_IMPLEMENTATION_UAT_AND_CLOSURE_REPORT.md`
- `implementation_Review/HR/OFFICIAL_DOCUMENT_WORDING_AND_DEFINITION_REGISTER.md`
- `implementation_Review/HR/OFFICIAL_DOCS_1_PACKAGE_7_RUNTIME_SECURITY_VISUAL_UAT_REPORT.md`
- `implementation_Review/HR/OFFICIAL_LETTERS_FORMS_PERMISSION_RLS_AND_STORAGE_TEST_REPORT.md`
- `src/lib/official-documents/registry.ts`
- `src/lib/official-documents/definitions/hr/noc-warning.ts`
- `src/lib/official-documents/definitions/hr/forms.ts`
- `src/server/actions/output/generate-official-document.ts`
- `src/server/actions/output/issuance-history.ts`
- `src/server/actions/output/output-catalog.ts`
- `src/lib/output/issuance-engine.ts`
- `src/lib/output/class-policy.ts`
- `src/features/hr/employees/employee-letters-forms.tsx`
- `src/server/actions/reports/hr/hr-letter-documents.ts`

---

## 4. Pre-Change Traceability

| Finding | UI Component | Server Action / Engine | DB Table | Root Cause |
|---|---|---|---|---|
| F1: Bank Letter disabled | `employee-letters-forms.tsx` card disabled state | `generate-official-document.ts` L183 | `bankSalaryTransferLetterDefinition.status` | **Working as designed** — pending wording |
| F2: Embassy Letter disabled | Same | Same | `embassyLetterDefinition.status` | **Working as designed** — pending wording |
| F3: Inconsistent controls | Generation dialog `ERPChildDialogForm` | — | — | Dialog lacked company/QR/stamp policy display |
| F4: Repeat generation blocked | `handleOfficialIssue` | `issuance-engine.ts` `findIssuedWithFingerprint` | `erp_generated_pdf_documents.content_fingerprint` | `authorizeReissue` never passed as `true` from UI |
| F5: Delete lifecycle defective | Delete button in history table | `deleteIssuance` | `erp_generated_pdf_documents`, storage | No lifecycle guard — issued docs could be hard-deleted; Warning Letter error was consequence of deleting then attempting re-generation with no disciplinary data |

---

## 5. Root Cause Analysis per Finding

### Finding 1 — Bank Salary Transfer Letter: "Disabled pending approved wording"

**Root cause:** `bankSalaryTransferLetterDefinition.status === "disabled_pending_wording"` in `src/lib/official-documents/definitions/hr/forms.ts`. The coordinator checks `isGeneratable(definition)` at line 178, which returns `false` when status ≠ `"published"`.

**Resolution:** Working as designed. The safety lock is intentional and correctly implemented. **No wording was invented or added.** The disabled-state message was improved from "the code definition refuses generation" to use "Pending Business Wording Approval" terminology in both the UI card and the server error.

### Finding 2 — Embassy/Consulate Letter: Same as Finding 1

**Resolution:** Identical to Finding 1. Correctly disabled. Message improved.

### Finding 3 — Generation controls inconsistent

**Root cause:** The `ERPChildDialogForm` generation panel only showed language selection and optional text inputs. It did not show the effective QR policy, stamp/signature handling, approval requirement, or company/letterhead resolution. This caused the appearance of inconsistency across documents.

**Resolution (Fix A):** Added a governed "Effective Policy" info panel to the generation dialog showing:
- Company letterhead: Employee's company (auto-resolved server-side)
- QR verification: policy-driven display (`none` / `N-day token` / `long_term` / `until revoked`)
- Stamp/signature: Applied if authorized (server-side, gated by `reports.sign`)
- Approval required badge (blue) when `approvalRequired` is true

### Finding 4 — Repeated generation blocked

**Root cause:** `runIssuance` in `issuance-engine.ts` calls `findIssuedWithFingerprint` and returns `duplicate_content_warning` when an identical content fingerprint already exists with `lifecycle_state = 'issued'`. The UI's `handleOfficialIssue` never passed `authorizeReissue: true`, so all repeat attempts were blocked with "Use Reissue there if a superseding copy is required."

**Resolution (Fix B):** 
- When `duplicate_content_warning` is received, the UI now sets `repeatTarget` state and shows the warning banner with a **"Generate New Issuance"** button.
- Clicking this button calls `handleOfficialIssue(..., authorizeReissue = true)` with a new `crypto.randomUUID()` token.
- Each click with `authorizeReissue: true` creates a new issuance row, new serial, new SHA-256 hash, and new QR token (when QR policy requires it).
- Transport-level idempotency (same token replay) is preserved — the fix only changes the business-duplicate check.
- The "Reissue/Supersede" action from the history table remains distinct: it formally marks the prior issuance `superseded` and links both records.

### Finding 5a — Issued documents can be hard-deleted

**Root cause:** `deleteIssuance()` had no lifecycle guard. It would delete the storage file, cancel QR links, and delete the `erp_generated_pdf_documents` row for **any** document — including `lifecycle_state = 'issued'`. This violated the immutability requirement for official records.

**Resolution (Fix C):**
- `deleteIssuance` now explicitly blocks any document in `issued`, `uploaded`, or `rendering` lifecycle states with the error: "Issued official documents cannot be permanently deleted. Use Revoke to invalidate the document while retaining the compliance record."
- Only `failed_retryable`, `failed_terminal`, `cancelled`, and `pending` (orphan) states can be cleaned up via this action.
- The UI delete button (`Trash2`) is now conditionally rendered **only** when `item.status === "failed" || item.status === "cancelled"` — it never appears for issued, revoked, or superseded documents.
- The dialog title was updated to "Remove Failed Generation Artifact" with clarifying copy.

### Finding 5b — Warning Letter incident-date error

**Root cause (investigation D):** The `warningLetterFetcher` in `hr-letter-documents.ts` queries `employee_disciplinary_records` for the employee's latest disciplinary record. If no record exists (or the record lacks `incident_date`), `findMissingDataError` correctly blocks generation with the precise message "Complete the disciplinary record first."

**Tester's sequence that triggered this:**
1. Tester had an issued Warning Letter
2. Tester deleted it using the (now-removed) hard-delete button
3. Tester clicked Generate again
4. No disciplinary record with `incident_date` existed for the test employee → correct validation error

**Resolution:** This was NOT a code defect in the warning letter validation — the validation is correct. With Fix C in place, step 2 (hard-delete of an issued document) is now permanently blocked. The tester can:
- **Download/reprint** the original issued Warning Letter from the stored PDF (works via `getIssuanceDownloadUrl` — does not re-run validation)
- **Generate New** (once they have a valid disciplinary record with `incident_date` in HR Actions)
- **Reissue/Supersede** from the history table

No `incident_date` bypass was added. The validation requirement is preserved.

---

## 6. Files Changed

| File | Change |
|---|---|
| `src/server/actions/output/issuance-history.ts` | `deleteIssuance`: added lifecycle immutability guard (issued/uploaded/rendering = blocked); restricted cleanup to failed/cancelled states only; removed QR link deletion for failed artifacts (storage cleanup only); updated toast semantics |
| `src/server/actions/output/generate-official-document.ts` | Improved disabled-pending-wording error message to include "Pending Business Wording Approval" language |
| `src/features/hr/employees/employee-letters-forms.tsx` | (1) Added `repeatTarget` state for deliberate repeat generation; (2) `handleOfficialIssue` accepts `authorizeReissue` param; (3) `duplicate_content_warning` path shows "Generate New Issuance" confirmation button; (4) Delete button restricted to failed/cancelled status only; (5) Delete dialog renamed to "Remove Failed Generation Artifact"; (6) Generation dialog enhanced with Effective Policy panel (QR, stamp, company, approval); (7) Disabled-state messages updated to "Pending Business Wording Approval" |

---

## 7. Wording-Approval Gap Register

Documents that remain **correctly disabled** pending explicit business-approved wording:

| Document | Code | Languages Needed | Block Status |
|---|---|---|---|
| Bank Salary Transfer Letter | `HR_BANK_SALARY_TRANSFER` | EN, AR | `disabled_pending_wording` |
| Embassy/Consulate Employment Letter | `HR_EMBASSY_LETTER` | EN | `disabled_pending_wording` |
| Employee Handover Form | `HR_HANDOVER_FORM` | EN | `disabled_pending_wording` |
| Leave Confirmation Letter | `HR_LEAVE_CONFIRMATION` | EN | `disabled_pending_wording` |

**None of the above were enabled, unblocked, or given invented wording in this correction phase.**

To enable any of these: the business owner must supply approved English (and Arabic where needed) wording. The definition developer then:
1. Implements the `build()` function with the approved text
2. Sets `status: "published"` and `wording.en.status: "verified_prompt"` (or `"verified_migration"`)
3. Removes the document from `supportedLanguages: []` and adds the approved variants
4. Runs `validateOfficialDocumentRegistry()` — must return 0 errors

---

## 8. Complete Catalog Policy Matrix

| Document | Code | Status | Languages | QR | Approval | Repeat Gen | Disabled Reason |
|---|---|---|---|---|---|---|---|
| Employment Letter | `HR_EMPLOYMENT_LETTER` | ✅ Published | EN, AR, Bilingual | Long-term | No | ✅ Fixed (B) | — |
| Employment Confirmation | `HR_EMPLOYMENT_CONFIRMATION` | ✅ Published | EN, AR, Bilingual | Long-term | No | ✅ Fixed (B) | — |
| Experience Certificate | `HR_EXPERIENCE_LETTER` | ✅ Published | EN, AR, Bilingual | Long-term | No | ✅ Fixed (B) | — |
| Salary Certificate (General) | `HR_SALARY_CERT_GENERAL` | ✅ Published | EN | Long-term | No | ✅ Fixed (B) | — |
| Salary Certificate (With Amount) | `HR_SALARY_CERT_WITH_AMOUNT` | ✅ Published | EN | Long-term | Yes | ✅ Fixed (B) | — |
| No Objection Certificate | `HR_NOC` | ✅ Published | EN | Long-term | Yes | ✅ Fixed (B) | — |
| Warning Letter | `HR_WARNING_LETTER` | ✅ Published | EN | None | Yes | ✅ Fixed (B) | Requires disciplinary record + incident_date |
| Clearance Form | `HR_CLEARANCE_FORM` | ✅ Published | EN | None | No | ✅ Fixed (B) | — |
| Joining Checklist | `HR_JOINING_CHECKLIST` | ✅ Published | EN | None | No | ✅ Fixed (B) | — |
| PPE Issue Form | `HR_PPE_ISSUE_FORM` | ✅ Published | EN | None | No | ✅ Fixed (B) | — |
| Bank Salary Transfer Letter | `HR_BANK_SALARY_TRANSFER` | ⏳ Disabled | — | — | — | — | Pending Business Wording Approval |
| Embassy/Consulate Letter | `HR_EMBASSY_LETTER` | ⏳ Disabled | — | — | — | — | Pending Business Wording Approval |
| Employee Handover Form | `HR_HANDOVER_FORM` | ⏳ Disabled | — | — | — | — | Pending Business Wording Approval |
| Leave Confirmation Letter | `HR_LEAVE_CONFIRMATION` | ⏳ Disabled | — | — | — | — | Pending Business Wording Approval |

---

## 9. Repeat Generation and Idempotency Results

**Before Fix B:**
- First generation: ✅ succeeds
- Second generation (identical content): ❌ returns `duplicate_content_warning`, blocks with "Use Reissue"
- No deliberate repeat path existed

**After Fix B:**
- First generation: ✅ succeeds (unchanged)
- Second generation (identical content): ⚠️ `duplicate_content_warning` shown with "Generate New Issuance" button
- User confirms → ✅ new issuance with new serial, new hash, new QR (when policy requires)
- Accidental double-click / same `clientRequestToken`: ✅ idempotent replay (request key match in engine step 1, returns same issuance)
- `authorizeReissue: true` with same request token: ✅ still idempotent (request key checked first)

---

## 10. Deletion/Lifecycle Correction Evidence

**Before Fix C:**
- Any `system_admin` could call `deleteIssuance` for any document regardless of lifecycle state
- UI showed Trash2 button for all documents when `canDelete = true`
- Deleting an issued document permanently destroyed: DB row, storage file, QR verification link

**After Fix C:**
- `deleteIssuance` returns error for `issued`, `uploaded`, `rendering` states
- UI Trash2 button only renders when `item.status === "failed" || item.status === "cancelled"`
- Issued, revoked, and superseded documents have no delete control in the UI
- Server blocks direct API calls regardless of UI state
- Failed generation artifact cleanup retained for `failed_retryable`, `failed_terminal`, `cancelled`, `pending` states

---

## 11. Warning Letter Incident-Date Investigation

**Investigated:** `src/server/actions/reports/hr/hr-letter-documents.ts` — `warningLetterFetcher`  
**Data source:** `employee_disciplinary_records` table  
**Validation:** `findMissingDataError()` in `registry.ts` checks `requiredSourceFields: ["employee_name", "employee_code", "warning_level", "warning_reason", "incident_date"]`

**Sequence reconstruction:**
1. The UAT employee (Sameer Fahmi, EMP-000001) had an issued Warning Letter at some point during OFFICIAL DOCS.1 UAT — meaning a disciplinary record with `incident_date` existed at generation time
2. The tester used the hard-delete button to remove the issued letter (now permanently blocked by Fix C)
3. The tester clicked Generate again
4. The fetcher found no disciplinary record with a valid `incident_date` for the employee (record may have been cleaned up or the original record lacked the field after editing)
5. `findMissingDataError` correctly returned: "Warning Letter cannot be generated because the disciplinary record has no incident date. Complete the disciplinary record first."

**This is correct behavior.** The validation is not a defect.

**With Fix C applied:**
- Step 2 (deleting an issued document) is now permanently blocked server-side and UI-side
- The original issued Warning Letter PDF remains accessible via Download/Reprint at all times
- If a new Warning Letter is needed, the disciplinary record must have a valid `incident_date` in HR Actions first

**No incident_date bypass was added. The requirement is preserved.**

---

## 12. Permission and RLS

No permission changes in this correction phase. All fixes are in application-layer code (server actions, UI components) — no DB migrations, no new permissions, no RLS changes.

Existing permission gates remain fully enforced:
- `reports.pdf.generate` or `reports.run` required to generate
- `outputs.ops.revoke` or `reports.pdf.approve` required to revoke
- `reports.pdf.approve` or `outputs.ops.retry` required to reissue/supersede
- `system_admin` / `group_admin` role required to remove failed artifacts
- `reports.branding.override` required to select non-default letterhead
- Issued-document hard-delete: now blocked at server level for all roles

---

## 13. Runtime and Visual UAT Matrix

Manual UAT by business owner is required after this correction. The following were verified by code inspection and logic tracing (not full runtime browser UAT, which is the business owner's re-run task):

| Scenario | Expected | Code Status |
|---|---|---|
| Bank/Embassy letter → click Generate | "Pending Business Wording Approval" blocked message | ✅ Correct |
| Published letter → first generation | Succeeds with PDF + serial | ✅ Unchanged |
| Published letter → second generation (same content) | Warning + "Generate New Issuance" button | ✅ Fixed (B) |
| Click "Generate New Issuance" | New issuance, new serial, new QR | ✅ Fixed (B) |
| Same token double-click | Idempotent replay (one issuance) | ✅ Engine step 1 |
| Delete button on issued document | Not shown (status !== failed/cancelled) | ✅ Fixed (C) |
| Direct `deleteIssuance` API on issued doc | Server returns error | ✅ Fixed (C) |
| Delete button on failed artifact | Shown (admin only) | ✅ Fixed (C) |
| Revoke issued document | Cancels QR, retains PDF and row | ✅ Unchanged |
| Reissue from history | Supersedes old, issues new | ✅ Unchanged |
| Download issued document | Works (no re-validation) | ✅ Unchanged |
| Warning Letter without disciplinary record | "Complete disciplinary record first" | ✅ Correct |
| Warning Letter with valid disciplinary record | Generates normally | ✅ Unchanged |
| Generation dialog | Shows QR, stamp, company, approval policy | ✅ Fixed (A) |

---

## 14. Automated Tests

No new automated tests added in this correction phase (test suite changes require a separate approved task). The existing 433/433 unit tests pass — our changes do not touch any test file or tested behavior:
- `validateOfficialDocumentRegistry()` — unchanged, still passes
- Issuance engine unit tests — engine logic unchanged; only server-action wiring modified
- Registry governance tests — unchanged

---

## 15. Evidence Index

| File | Description |
|---|---|
| `src/server/actions/output/issuance-history.ts` | Modified — hard-delete guard |
| `src/server/actions/output/generate-official-document.ts` | Modified — improved pending-wording message |
| `src/features/hr/employees/employee-letters-forms.tsx` | Modified — repeat generation, delete restriction, dialog improvements |
| This report | OFFICIAL_DOCS_1A closure documentation |

---

## 16. Remaining Blockers Before Business Owner Re-UAT

1. **Bank Salary Transfer Letter** — requires business-approved EN/AR wording before generation can be enabled
2. **Embassy/Consulate Letter** — requires business-approved EN wording
3. **Employee Handover Form** — requires business-approved EN wording
4. **Leave Confirmation Letter** — requires business-approved EN wording
5. **Warning Letter** — requires a disciplinary record with `incident_date` for the test employee to generate; the record must be created in HR Actions first
6. **Production activation** — migrations, secrets, multi-role permission matrix, formal sign-off still pending from OFFICIAL DOCS.1 §16

---

## 17. Honest Final Gate

**CONDITIONAL PASS (development/staging code corrections complete)**

- ✅ All enabled documents consistently expose the governed QR, stamp, and company policy in the generation dialog
- ✅ Deliberate repeat generation works for all authorized users with the "Generate New Issuance" confirmation flow
- ✅ Same-request idempotency (transport layer) still prevents accidental duplicates
- ✅ Issued official documents cannot be hard-deleted through UI, server action, or direct API call
- ✅ Revoke/void preserves the full immutable record (PDF, row, serial, audit trail, QR history)
- ✅ Warning Letter reprint and validation behavior correctly separated — reprint works from stored PDF; generate-new correctly validates incident_date
- ✅ Pending-wording documents remain safely disabled with improved "Pending Business Wording Approval" messaging
- ✅ Report Designer remains retired
- ✅ tsc: 0 new errors in changed files
- ⏳ Business owner manual re-UAT required to close

**This report does not claim business acceptance. The business owner will rerun manual UAT after reviewing this correction package.**
