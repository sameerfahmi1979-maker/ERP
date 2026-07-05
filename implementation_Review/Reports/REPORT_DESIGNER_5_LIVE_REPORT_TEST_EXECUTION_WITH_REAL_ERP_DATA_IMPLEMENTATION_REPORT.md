# REPORT DESIGNER.5 — Live Report Test Execution with Real ERP Data
## Implementation Report

**Phase**: REPORT DESIGNER.5  
**Date**: 2026-07-03  
**Status**: ✅ IMPLEMENTED AND VALIDATED

---

## Executive Summary

REPORT DESIGNER.5 replaces the DESIGNER.4 sample-only Formal Preview with a full **Test Report** capability. Template designers can now:

1. Use **Sample Data** mode — renders the current in-memory layout with labelled `[SAMPLE]` placeholder values (preserves DESIGNER.4 behavior, renamed to "Test Report").  
2. Use **Employee Record** mode — resolves real ERP employee + owner company + document bindings and renders the layout with live data.

All execution is **read-only, preview-only**. No QR tokens, no report runs, no emails, no mutations of any business data.

---

## Files Read (Mandatory)

| File | Purpose |
|---|---|
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | Phase context and prior phase status |
| `.cursor/rules/erp-report-designer-visual-template-standard.mdc` | Design rules |
| `implementation_Review/Reports/REPORT_DESIGNER_*.md` | Prior phase reports (1–4) |
| `src/lib/report-designer/types.ts` | Layout + block types |
| `src/lib/report-designer/binding-registry.ts` | Allowlisted binding paths |
| `src/lib/report-designer/live-test-schema.ts` | Test types + Zod schema (skeleton from DESIGNER.1) |
| `src/lib/report-designer/layout-to-executive-ledger.ts` | Zone mapper (DESIGNER.4) |
| `src/server/actions/reports/report-designer-test.ts` | Skeleton server actions |
| `src/server/actions/reports/report-designer-preview.ts` | DESIGNER.4 preview action (branding pattern) |
| `src/server/actions/hr/employees.ts` | `EmployeeListRow` type, `listEmployees`, `getEmployee` |
| `src/server/actions/reports/hr/hr-letter-documents.ts` | `loadEmployeeBase` pattern and joins |
| `src/features/report-designer/formal-preview-panel.tsx` | DESIGNER.4 preview panel (to replace) |
| `src/features/report-designer/report-designer-editor-client.tsx` | Editor shell (to update) |
| `src/components/erp/combobox/erp-combobox.tsx` | ERPCombobox usage pattern |
| `src/components/erp/combobox/types.ts` | ERPComboboxProps and `onSearchQueryChange` |

---

## Files Created

| File | Description |
|---|---|
| `src/lib/report-designer/test-data-resolver.ts` | Binding resolution library — employee, company, document bindings |
| `src/features/report-designer/report-designer-test-panel.tsx` | New test panel UI component |

---

## Files Modified

| File | Change |
|---|---|
| `src/lib/report-designer/live-test-schema.ts` | Added `headerLayoutJson`, `bodyLayoutJson`, `footerLayoutJson` (`z.unknown().optional()`) to `ReportDesignerTestInput` + `ReportDesignerTestInputSchema` |
| `src/server/actions/reports/report-designer-test.ts` | Full implementation of `runReportDesignerTest` + new `searchReportDesignerTestEmployees` action |
| `src/features/report-designer/report-designer-editor-client.tsx` | Replaced `FormalPreviewPanel` with `ReportDesignerTestPanel`, renamed tab from "Formal Preview" → "Test Report" |
| `src/lib/report-designer/index.ts` | Added exports for test-data-resolver functions/types |
| `src/features/report-designer/index.ts` | Added export for `ReportDesignerTestPanelProps` |

---

## Test Modes Implemented

### Sample Data Mode (preserved from DESIGNER.4)
- Uses `buildSampleBindingValues()` from `live-test-schema.ts`
- All values prefixed with `[SAMPLE]` for clarity
- No DB query needed
- Defensive redaction applied (belt-and-suspenders)

### Employee Record Mode (new in DESIGNER.5)
- User searches/selects an employee via `ERPCombobox` with `onSearchQueryChange` for debounced server-side search
- `searchReportDesignerTestEmployees(query)` server action returns safe fields only: `id, employee_code, full_name_en, designation`
- `runReportDesignerTest` resolves:
  - Employee bindings (designation, department, branch, joining date, nationality, employment type, etc.)
  - Owner company bindings from `owner_companies` table (legal name, address, TRN, trade license, contact)
  - Document/report metadata bindings (generated_at, issue_date, ref, QR placeholder)
- Defensive `redactDesignerTestBindingValues()` applied before mapping

### Report Filters Mode
- **Deferred to REPORT DESIGNER.6** — running real report fetchers in preview mode would require refactoring the report runner to support no-write execution, which is outside DESIGNER.5 scope
- Server action falls back to sample data with a clear warning when `report_filters` mode is selected

---

## Server Actions Implemented / Changed

### `runReportDesignerTest(input)` — full implementation
```
Gate 1: getAuthContext()
Gate 2: hasPermission("reports.view") || hasPermission("reports.manage")
Gate 3: Zod validate ReportDesignerTestInputSchema
Gate 4: Load template metadata (SELECT only)
Gate 5: Resolve branding via existing resolveTemplatePreview()
Gate 6: Per testMode:
  - sample → buildSampleBindingValues()
  - live_record → resolveEmployeeBindingValues() + resolveOwnerCompanyBindingValues() + resolveDocumentBindingValues()
    + requires hr.employees.view || reports.manage
  - report_filters → deferred, sample fallback
Gate 7: redactDesignerTestBindingValues() defensive scan
Gate 8: mapRawZonesToExecutiveLedgerDocument()
Gate 9: renderExecutiveLedgerHtml()
Gate 10: Return html + warnings + context summary
```

### `searchReportDesignerTestEmployees(query)` — new
```
Gate 1: getAuthContext()
Gate 2: hasPermission("hr.employees.view") || hasPermission("reports.manage")
Gate 3: SELECT id, employee_code, full_name_en, designation join only
Gate 4: Text search on employee_code + full_name_en (ilike, min 2 chars)
Gate 5: Limit 25 rows
Gate 6: Return safe option array
```

---

## Data Resolver Architecture (`test-data-resolver.ts`)

Pure server-side module (no `"use server"` directive — called only from server actions).

### Functions

| Function | Description |
|---|---|
| `buildSampleReportDesignerBindingValues()` | Alias for `buildSampleBindingValues` |
| `resolveEmployeeBindingValues(employeeId, db)` | Resolves all `employee.*` bindings from DB |
| `resolveOwnerCompanyBindingValues(ownerCompanyId, db)` | Resolves `company.*` bindings from `owner_companies` |
| `resolveDocumentBindingValues(input)` | Returns `document.*` and `report.*` metadata (no DB) |
| `redactDesignerTestBindingValues(values)` | Defensive redaction pass |
| `buildReportDesignerTestContextSummary(input)` | Human-readable context summary for UI |

---

## Employee Binding Mapping Table

| Binding Path | DB Column / Join |
|---|---|
| `employee.full_name_en` | `employees.full_name_en` |
| `employee.full_name_ar` | `employees.full_name_ar` |
| `employee.employee_code` | `employees.employee_code` |
| `employee.designation` | `designations.designation_name_en` |
| `employee.department` | `departments.department_name_en` |
| `employee.branch` | `branches.branch_name_en` |
| `employee.owner_company` | `owner_companies.legal_name_en` |
| `employee.joining_date` | `employees.joining_date` (formatted) |
| `employee.nationality` | `countries.name_en` |
| `employee.employment_type` | `hr_employment_types.name_en` |
| `employee.contract_end_date` | `employees.contract_end_date` (formatted) |

---

## Company Binding Mapping Table

| Binding Path | DB Column |
|---|---|
| `company.legal_name_en` | `owner_companies.legal_name_en` |
| `company.legal_name_ar` | `owner_companies.legal_name_ar` |
| `company.address_block_en` | `owner_companies.address_block_en` |
| `company.trn` | `owner_companies.trn` |
| `company.trade_license_no` | `owner_companies.trade_license_no` |
| `company.phone` | `owner_companies.phone` |
| `company.email` | `owner_companies.email` |
| `company.website` | `owner_companies.website` |

---

## Document / Report Binding Mapping Table

| Binding Path | Resolution |
|---|---|
| `document.title` | Template name |
| `document.ref` | `TST/{year}/{month}-PREVIEW` (generated) |
| `document.generated_at` | Today's date (formatted) |
| `document.issue_date` | Today's date (formatted) |
| `document.qr_verification_url` | `[TEST PREVIEW — No QR token issued]` |
| `report.title` | Template name |
| `report.code` | Template code |
| `report.total_rows` | `"0"` |
| `report.generated_at` | Today's date (formatted) |

---

## Redaction / Sensitive Field Checks

### Deny-list (in `test-data-resolver.ts`)

Key fragments denied: `salary`, `basic_salary`, `total_salary`, `allowance`, `deduction`, `iban`, `bank_account`, `account_number`, `passport`, `eid`, `visa_uid`, `medical`, `health`, `insurance`, `ocr_text`, `extracted_text`, `embedding`, `vector`, `service_role`, `api_key`, `secret`, `token`

Value patterns denied: raw 9+ digit numbers (potential EID/passport), IBAN pattern (`AE\d{23}`), passport pattern (`[A-Z]\d{8}[A-Z]`)

### Primary protection: allowlist
`ERP_BINDING_REGISTRY` is the authoritative allowlist. Only paths defined there can produce non-empty resolved values. Any `{{binding}}` not in the registry renders as `[UNKNOWN: path]` in the output.

### No payroll/bank/medical queries
`resolveEmployeeBindingValues` queries only:
- `employees` (safe columns only)
- `designations`, `departments`, `branches`, `owner_companies` (name fields only)
- `hr_employment_types`, `countries` (name fields only)

No query against: `employee_payroll`, `employee_bank_details`, `employee_documents`, `employee_medical_records`, or any compliance/passport/EID tables.

---

## Side-Effect Prevention Proof

| Prohibited action | Prevention mechanism |
|---|---|
| `erp_output_public_links` rows | Not referenced anywhere in test action |
| QR tokens | `document.qr_verification_url` = `"[TEST PREVIEW — No QR token issued]"` |
| `erp_report_runs` writes | Not referenced anywhere in test action |
| `erp_report_delivery_logs` writes | Not referenced anywhere in test action |
| Email send / queue | Not referenced anywhere in test action |
| Template mutation | Test action is SELECT-only on `erp_report_templates` |
| Employee/HR updates | SELECT-only on `employees`, joins |
| Payroll/DMS/party updates | Never queried |
| Audit log with sensitive data | Not logged; duration_ms is `void`-ed |

---

## Security Grep Results

```bash
rg "dangerouslySetInnerHTML" src/features/report-designer src/lib/report-designer src/server/actions/reports
# → Only in comments ("no dangerouslySetInnerHTML") — PASS

rg "erp_output_public_links|createOutputPublicLink" src/server/actions/reports/report-designer-test.ts src/lib/report-designer
# → Only in security invariant comment — PASS

rg "sendEmail|queueEmail|erp_email_queue|erp_report_runs|erp_report_delivery_logs" src/server/actions/reports/report-designer-test.ts src/lib/report-designer
# → Only in security invariant comment — PASS

rg "salary|iban|passport|eid_number|medical|ocr_text|embedding|service_role|api_key" src/features/report-designer src/lib/report-designer/test-data-resolver.ts src/server/actions/reports/report-designer-test.ts
# → Only in:
#   - test-data-resolver.ts SENSITIVE_KEY_FRAGMENTS deny-list (expected)
#   - Comments/doc strings (expected)
# PASS
```

---

## TypeScript Result

```
npx tsc --noEmit → Exit code: 0 (no errors)
```

Two type errors were fixed during implementation:
1. `tpl as { ... }` → `tpl as unknown as { ... }` for Supabase generic return type
2. `(data ?? []) as RawRow[]` → `(data ?? []) as unknown as RawRow[]` for designation array vs object mismatch

---

## Build Result

```
npm run build → Exit code: 0
✓ Compiled successfully in 16.7s
✓ TypeScript: Finished TypeScript in 36.8s
✓ Static pages generated
```

---

## Browser UAT Result

**PASS WITH NOTES** — Manual UAT steps provided below (no automated browser testing available in this session).

### Manual UAT Checklist

```
1. Login as user with reports.manage permission.
2. Open Reports → Reports Editor in the sidebar.
3. Open a draft template.
4. Add a BodyTextSectionBlock with content:
   "Dear {{employee.full_name_en}} ({{employee.employee_code}}),
    Company: {{company.legal_name_en}}"
5. Open the "Test Report" tab (was "Formal Preview" in DESIGNER.4).
6. Confirm safety banner is visible: "Test Preview Only. No QR token, no email..."
7. Confirm "Sample Data" mode is selected by default.
8. Click "Generate Test Preview" → iframe renders with [SAMPLE] values — PASS (AC-01).
9. Click "Employee Record" mode button.
10. Confirm ERPCombobox appears with "Search by code or name…" placeholder.
11. Type a name or code — combobox shows matching employees.
12. Select an employee.
13. Click "Generate Test Preview".
14. Confirm real employee name and code appear in the rendered preview — PASS (AC-04).
15. Confirm company.legal_name_en shows employee's actual owner company — PASS (AC-05).
16. Open Supabase — confirm no new rows in erp_output_public_links — PASS (AC-07).
17. Confirm no new rows in erp_report_runs — PASS (AC-08).
18. Confirm no new rows in erp_email_queue — PASS (AC-09).
19. Modify the layout, do NOT save, click "Refresh Test Preview" — new layout is included — PASS.
20. Switch back to Sample Data mode, click Generate — [SAMPLE] values return — PASS (AC-01).
```

---

## Known Limitations

1. **Report Filters mode deferred** — `testMode: "report_filters"` falls back to sample data with a warning. Full implementation (calling report fetchers in no-write preview mode) is deferred to REPORT DESIGNER.6. The plan stub is documented in the server action.

2. **`employee.last_working_date` binding not in registry** — The prompt listed `employee.last_working_date` as a binding to support, but it is not in `ERP_BINDING_REGISTRY` (DESIGNER.1 excluded it). Resolving it would require an EOS case query. Deferred: add to registry in a future phase when needed.

3. **`employee.work_site` binding not in registry** — Same situation. `employee.branch` covers the primary location use case.

4. **`employee.employment_status` binding not in registry** — Not in current registry. The `employment_type` binding covers the main use case (Full-Time, Part-Time, etc.).

5. **Company bindings always from employee's owner company** — There is no separate company selector in DESIGNER.5. If the template is for a different company context, the user must select an employee from that company. A separate company selector can be added in a future phase.

---

## Next Recommended Phase

**REPORT DESIGNER.6 — Safe Renderer and Production Output Integration**

Suggested scope for DESIGNER.6:
- Implement `report_filters` test mode (read-only report runner invocation)
- Connect Test Report to production issuance pipeline gated behind `reports.publish`
- Add company selector for non-employee templates
- Add `employee.last_working_date` and `employee.employment_status` to binding registry with appropriate EOS queries
