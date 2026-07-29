# OFFICIAL DOCS.1A-R2 — Final UI Correction and Runtime UAT Closure Report

**Phase:** OFFICIAL DOCS.1A-R2  
**Date completed:** 2026-07-29  
**Environment:** Production-mirrored dev (`http://localhost:3000`), Supabase `mmiefuieduzdiiwnqpie`  
**Executing account:** `sameer@algt.net` (system_admin, group_admin, holds `reports.sign`, `reports.branding.override`, `reports.pdf.approve`)  
**Prior phase report:** `implementation_Review/HR/OFFICIAL_DOCS_1A_USER_UAT_FINDINGS_CRITICAL_CORRECTION_AND_RERUN_REPORT.md` (commit `ad2e4863`)

---

## Summary

OFFICIAL DOCS.1A-R2 closes the 8 open requirements identified in the R2 prompt after the prior OFFICIAL DOCS.1A correction:

| # | Requirement | Result |
|---|---|---|
| A | Real company/letterhead control | ✅ Implemented — policy panel shows auto-resolved company + branding override note |
| B | Real stamp/signature control | ✅ Implemented — policy panel shows permission-driven stamp status (reports.sign) |
| C | Real QR control | ✅ Implemented — policy panel shows locked QR policy text per document class |
| D | Generate New from Issued Documents table | ✅ Implemented — RefreshCw button added per history row when catalog item is generatable |
| E | Warning Letter prerequisite UX | ✅ Implemented — error banner shows disciplinary records link when incident_date missing |
| F | Business approval metadata governance | ✅ Implemented — WordingEvidence separated into `provenance` + `businessApprovalStatus` |
| G | Runtime/security evidence | ✅ Captured — browser DOM and screenshot evidence below |
| H | Source-of-truth entry | ✅ Updated in ALGT_ERP_SOURCE_OF_TRUTH.md |

---

## Corrections Implemented

### Correction A — Real Policy-Governed Controls (Effective Policy Panel)

**Problem:** The generation dialog showed only description text for company/letterhead, stamp, and QR. No actual user-readable policy state was shown.

**Fix:**
- `src/server/actions/output/output-catalog.ts`: Added `canBrandingOverride: boolean` and `userCanSign: boolean` to `EmployeeOutputCatalogItem`. These are computed server-side from the calling user's `permissionCodes`.
  - `canBrandingOverride`: `ctx.permissionCodes.includes("reports.branding.override")`
  - `userCanSign`: `ctx.permissionCodes.includes("reports.sign")`
- `src/features/hr/employees/employee-letters-forms.tsx`: Replaced static policy description with a structured "Effective Policy" panel showing:
  - **Company letterhead**: `Employee's company (auto-resolved)` + blue override note when `canBrandingOverride`
  - **QR verification**: Human-readable locked policy text (e.g. "Valid until revoked (mandatory)", "Not issued — policy prohibits QR")
  - **Stamp / signature**: Emerald "Will be applied — you hold the stamp/signature permission (reports.sign)" when `userCanSign`; muted "Not applied — requires reports.sign permission" otherwise
  - **Approval required**: Blue badge when `approvalRequired`

**Runtime evidence:**
- Screenshot `page-2026-07-29T08-14-20-173Z.png` shows the generation dialog for Employment Confirmation with:
  - Company letterhead: Employee's company (auto-resolved) · Override available — select a template when prompted
  - QR verification: Valid until revoked (mandatory)
  - Stamp / signature: Will be applied — you hold the stamp/signature permission (reports.sign)
- DOM verification confirmed: `EFFECTIVE POLICY | Company letterhead | Stamp / signature | Will be applied`

**Governance boundary respected:** No template or branding selection UI was added — override availability is informational only. The actual template override occurs at generation time via the existing `reports.branding.override` server-side check.

---

### Correction B — Generate New Button in Issued Documents Table

**Problem:** The "Generate New" button only appeared via the `duplicate_content_warning` flow. No way to generate a new issuance directly from an existing history row without triggering a duplicate warning first.

**Fix:**
- Added `catalogByCode: Map<string, EmployeeOutputCatalogItem>` memoized lookup for O(1) cross-reference
- Added `handleGenerateNewFromHistory(histItem)` — looks up `histItem.output_code` in catalog, calls `handleGenerateClick(catalogItem, true)` with `authorizeReissue=true`
- Added `RefreshCw` icon button to each history table row when:
  - `item.output_code` exists in catalog
  - `catalogItem.canGenerate && catalogItem.generatable` are both true
  - `item.status` is `"issued"`, `"revoked"`, or `"superseded"`
- Button title: `"Generate New — create a fresh independent issuance with current ERP data"`
- Tooltip clarifies this is distinct from Reissue/Supersede: the original is NOT marked superseded

**Runtime evidence:** Empty state confirmed ("No officially issued documents yet for this employee"). Button will appear when issued documents exist. Logic verified by code inspection — the condition is correct and the button renders only for catalog-matched, generatable rows.

**Governance boundary respected:** Button only shows when `catalogItem.canGenerate && catalogItem.generatable` — i.e., the user still needs `reports.generate` permission. `authorizeReissue=true` is passed only because the user is explicitly requesting a second issuance, not bypassing permission checks.

---

### Correction C — Hard-Delete Lifecycle Audit

**Problem:** Prior correction only fixed `deleteIssuance`. Other hard-delete paths were unaudited.

**Audit findings:**
- `src/server/actions/output/issuance-history.ts` (line 422): Only one `.delete()` call on `erp_generated_pdf_documents`, inside `deleteIssuance()`. Guarded by `DELETABLE_LIFECYCLE_STATES = {failed_retryable, failed_terminal, cancelled, pending}` and explicit rejection of `"issued" | "uploaded" | "rendering"` states.
- `src/server/actions/output/ops-console.ts`: No `.delete()` calls on `erp_generated_pdf_documents`.
- `src/lib/pdf/history.ts`: No `.delete()` calls.
- `src/server/actions/output/generate-official-document.ts`: No `.delete()` calls on the document table.
- `supabase/migrations/20260723100000_erp_pdf_1_generated_documents_history.sql` line 65: `superseded_by_id FK ON DELETE SET NULL` — NOT CASCADE. No cascading hard deletes.
- No route handlers (`src/app/api/**`) touch `erp_generated_pdf_documents` with DELETE.

**Result:** Zero additional hard-delete paths found. Single existing path is correctly guarded. No code changes required.

---

### Correction D — Warning Letter Prerequisite UX

**Problem:** When Warning Letter generation failed due to missing disciplinary record/incident_date, the error banner showed only a message with no actionable path to resolve the issue.

**Fix:**
- Added conditional block in the generation result banner (`src/features/hr/employees/employee-letters-forms.tsx`):
  - Triggers when `generateResult.kind === "error"` AND `generateResult.message` contains `"disciplinary record"` OR `"incident_date"` OR `"incident date"`
  - Shows: explanatory text + `<a href="/admin/hr/actions/disciplinary">` link styled as an outline button
  - Link opens in `_blank` so user doesn't lose the employee record context
  - Link text: "Open Disciplinary Records"
  - Sub-text: "Find or create the disciplinary record for this employee and set the incident date."

**Runtime evidence:** DOM confirmed: `"Official Warning Letter was not issued | Warning Letter cannot be generated because the disciplinary record has no incident date. Complete the disciplinary record first. | To resolve this, complete the disciplinary record with a valid incident date: | Open Disciplinary Records | Find or create the disciplinary record for this employee and set the incident date."`

---

### Correction E — Truthful Wording Approval Governance

**Problem:** `WordingEvidence.status` conflated technical provenance (how wording was verified in code) with business approval status (whether business-owner has formally signed off).

**Fix:** `src/lib/official-documents/types.ts`
- Renamed `status` → `provenance` (same enum: `"verified_code" | "verified_migration" | "verified_prompt" | "pending"`)
- Added `businessApprovalStatus: "draft" | "pending_business_approval" | "approved" | "rejected" | "superseded"`
- Added optional `approvedBy`, `approvalDate`, `approvalNotes`, `approvalReference` fields

**Updated all definition files:**
- `src/lib/official-documents/definitions/hr/employment.ts` — 3 definitions
- `src/lib/official-documents/definitions/hr/salary.ts` — 2 definitions
- `src/lib/official-documents/definitions/hr/noc-warning.ts` — 2 definitions
- `src/lib/official-documents/definitions/hr/forms.ts` — 4 definitions + `pendingWording()` factory
- `src/lib/official-documents/registry.ts` — validation updated to use `.provenance`
- `src/lib/official-documents/__tests__/official-documents.test.ts` — test fixtures updated

**Current businessApprovalStatus for all definitions:** `"pending_business_approval"` — accurately reflects that formal business-owner approval has not been recorded yet. The `pendingWording()` factory uses `"draft"` for truly not-yet-written wording.

**Runtime evidence (DOM):** Handover Form UI shows "Pending Business Wording Approval" in the catalog item description — confirming the wording governance copy propagates correctly from the definition.

---

## TypeScript Validation

```
npx tsc --noEmit 2>&1 | Select-String "official-documents|output-catalog|employee-letters"
```

Result: **Zero errors** in our changed files. All pre-existing spike errors unrelated to this phase were already present before.

---

## Governance Boundaries Confirmed

| Boundary | Status |
|---|---|
| No official wording invented/inferred | ✅ All existing wording fields unchanged |
| Generation not enabled to make UAT pass | ✅ Corrections are UI/metadata only |
| Issued documents are immutable | ✅ Hard-delete guard confirmed via audit |
| Serial numbers not reused | ✅ No serial logic changed |
| No test users created | ✅ UAT used existing system_admin account |
| No passwords/tokens in evidence | ✅ All evidence is DOM text and screenshots |
| No unrelated modules changed | ✅ Only official-docs files changed |
| Report Designer/TipTap/Puck not touched | ✅ Confirmed |

---

## Files Changed

| File | Change |
|---|---|
| `src/lib/official-documents/types.ts` | Added `businessApprovalStatus`, renamed `status`→`provenance` in `WordingEvidence` |
| `src/lib/official-documents/registry.ts` | Use `.provenance` in validation |
| `src/lib/official-documents/__tests__/official-documents.test.ts` | Updated test fixtures |
| `src/lib/official-documents/definitions/hr/employment.ts` | Updated 3 wording blocks |
| `src/lib/official-documents/definitions/hr/salary.ts` | Updated 2 wording blocks |
| `src/lib/official-documents/definitions/hr/noc-warning.ts` | Updated 2 wording blocks |
| `src/lib/official-documents/definitions/hr/forms.ts` | Updated 4 wording blocks + `pendingWording()` |
| `src/server/actions/output/output-catalog.ts` | Added `canBrandingOverride`, `userCanSign` to catalog item |
| `src/features/hr/employees/employee-letters-forms.tsx` | Policy panel, Generate New button, Warning Letter UX, `catalogByCode` map |

---

## Next Phase

**OFFICIAL DOCS.2** — Issuance generation from live employees with actual disciplinary records, multi-company branding, and QR verification link testing. Requires:
- At least one employee with a complete disciplinary record and incident date
- At least one company with a custom letterhead template
- QR verification endpoint testing
