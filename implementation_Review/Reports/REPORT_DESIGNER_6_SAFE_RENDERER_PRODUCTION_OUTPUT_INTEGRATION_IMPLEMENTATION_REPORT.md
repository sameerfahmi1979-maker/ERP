# REPORT DESIGNER.6 — Safe Renderer and Production Output Integration
## Implementation Report

**Phase:** REPORT DESIGNER.6  
**Date:** 2026-07-03  
**Status:** CLOSED / PASS  

---

## 1. Executive Summary

REPORT DESIGNER.6 successfully integrates the visual template designer's output into the production report/output rendering flow without breaking any existing behavior. The phase delivers:

1. **Production-safe visual layout renderer** (`production-renderer.ts`) — a reusable server-side helper callable from any output flow
2. **No-write Report Filters preview runner** (`preview-runner.ts`) — calls report fetchers without creating `erp_report_runs` rows
3. **Report Filters test mode** — fully implemented in `runReportDesignerTest`
4. **Company Context test mode** — new mode + `searchReportDesignerTestCompanies` action
5. **`employee.employment_status` binding** — added to registry, resolver, sample data
6. **Updated Test Report panel** — 4 modes (Sample, Employee Record, Company Context, Report Filters)
7. **Production output integration** — `LetterPreviewDialog` renders visual layout when template has Puck engine
8. **`visual_editor_engine` in template selection** — `ReportTemplateForSelection` now includes this field
9. **`renderVisualTemplateForLetterPreview` server action** — governs visual rendering for official letter preview

All 18 non-negotiable rules maintained. All security invariants preserved. `tsc --noEmit` PASS. `npm run build` PASS. No sensitive fields exposed.

---

## 2. Files Read

- `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`
- `src/server/actions/reports/runner.ts`
- `src/server/actions/reports/templates.ts`
- `src/features/report-center/letter-preview-dialog.tsx`
- `src/lib/report-center/report-runner.ts`
- `src/lib/report-center/types.ts`
- `src/lib/report-center/redaction-engine.ts`
- `src/lib/executive-ledger/types.ts`
- `src/lib/report-designer/live-test-schema.ts`
- `src/lib/report-designer/layout-to-executive-ledger.ts`
- `src/lib/report-designer/binding-registry.ts`
- `src/lib/report-designer/test-data-resolver.ts`
- `src/lib/report-designer/index.ts`

---

## 3. Files Created

| File | Purpose |
|---|---|
| `src/lib/report-designer/production-renderer.ts` | Pure server-side visual layout renderer — DESIGNER.6 core deliverable |
| `src/lib/report-center/preview-runner.ts` | No-write report fetcher runner (no `erp_report_runs` inserts) |

---

## 4. Files Modified

| File | Change |
|---|---|
| `src/lib/report-designer/binding-registry.ts` | Added `employee.employment_status` binding |
| `src/lib/report-designer/live-test-schema.ts` | Added `employee.employment_status` to sample bindings |
| `src/lib/report-designer/test-data-resolver.ts` | Added `employee_status` field fetch + mapping to `employee.employment_status` |
| `src/lib/report-designer/index.ts` | Exported `production-renderer.ts` symbols |
| `src/lib/report-center/index.ts` | Exported `preview-runner.ts` symbols |
| `src/server/actions/reports/report-designer-test.ts` | Full rewrite — `report_filters` mode, Company Context, `searchReportDesignerTestCompanies` |
| `src/server/actions/reports/templates.ts` | Added `visual_editor_engine` to `ReportTemplateForSelection`; added `renderVisualTemplateForLetterPreview` action |
| `src/features/report-designer/report-designer-test-panel.tsx` | Full rewrite — 4 modes, company selector, report filters input |
| `src/features/report-center/letter-preview-dialog.tsx` | Integrated visual layout iframe rendering for Puck templates |

---

## 5. Production Renderer Architecture

`src/lib/report-designer/production-renderer.ts` is a pure functional library (no `"use server"`, no DB access):

```
ProductionRenderInput
  templateName, templateType
  headerLayoutRaw, bodyLayoutRaw, footerLayoutRaw  ← raw JSON (validated internally)
  branding: ExportBrandingContext                  ← pre-resolved by caller
  bindingValues: Record<string, string>           ← pre-resolved + pre-redacted by caller

→ ProductionRenderResult
  hasVisualLayout: boolean  ← false = caller should use legacy rendering
  html: string              ← safe for iframe srcDoc
  document: ExecutiveLedgerDocument
  warnings: string[]
```

Key functions:
- `parseVisualLayoutZone(raw)` — validate + parse a single zone; returns null if empty/invalid
- `templateHasVisualLayout(template)` — quick check if a template row has any visual content
- `renderVisualTemplateZones(input)` — main renderer using `mapRawZonesToExecutiveLedgerDocument` + `renderExecutiveLedgerHtml`
- `renderVisualTemplateZonesParsed(input)` — accepts already-parsed zone objects

---

## 6. Report Filters Mode — Implementation

`report_filters` test mode is **fully implemented** in DESIGNER.6.

**Flow:**
1. User selects "Report Filters" mode in test panel and enters a report code
2. `runReportDesignerTest` calls `runReportFetcherPreview` from `preview-runner.ts`
3. `runReportFetcherPreview`:
   - Loads registry entry from `erp_report_registry`
   - Validates permissions using the registry's `required_permissions`
   - Calls the registered fetcher directly (via `REPORT_FETCHERS[reportCode]`)
   - Caps results at 50 rows, returns `isCapped` flag
   - Applies redaction using `applyRedaction` with the same options as the official runner
   - **NEVER** inserts into `erp_report_runs`, `erp_report_delivery_logs`, or `erp_email_queue`
4. `runReportDesignerTest` maps report metadata to `report.*` bindings, renders via EL

**Safety proof:**
- `preview-runner.ts` contains NO SQL inserts
- No calls to `createReportRunLog`, `completeReportRunLog`, or `failReportRunLog`
- Respects the same permission gates as `runReport`

---

## 7. Company Context Test Mode

New `company_context` sub-mode within `live_record`:
- Requires only `ownerCompanyId` (no employee)
- Calls `resolveOwnerCompanyBindingValues` to populate `company.*` bindings
- `employee.*` bindings are left empty with a clear warning
- Requires: `reports.view` or `reports.manage`
- New server action: `searchReportDesignerTestCompanies(query)` — searches `owner_companies` by `legal_name_en` or `company_code`, returns only safe display fields (`id`, `company_code`, `legal_name_en`, `trade_name_en`)

---

## 8. Production Output Integration Details

Integration is in `LetterPreviewDialog`:

1. `listReportTemplatesForSelection` now returns `visual_editor_engine` field
2. New `renderVisualTemplateForLetterPreview` server action:
   - Checks if template has `visual_editor_engine = 'puck'` and valid layout zones
   - If yes: resolves employee/company bindings, applies defensive redaction, renders HTML
   - Returns `{ ok, hasVisualLayout, html?, warnings? }`
3. `LetterPreviewDialog` gains:
   - `visualHtml` state — rendered HTML from visual template
   - `isLoadingVisual` state
   - A `useEffect` that fires when `formalView=true` and `selectedTemplateId` is set
   - When `visualHtml` is available, shows `<iframe srcDoc={visualHtml}>` instead of `ExecutiveLedgerPreview`
   - Existing `ExecutiveLedgerPreview` is hidden via `className="... hidden"` when visual HTML present

**Fallback:** When `templateHasVisualLayout` returns `false`, or `renderVisualTemplateForLetterPreview` returns `hasVisualLayout=false`, the legacy `ExecutiveLedgerPreview` renders as before. Existing behavior is untouched.

**QR issuance:** QR creation is **not affected** — it remains in `createOutputPublicLink` and is still gated by `selectedTemplateId` exactly as before. The visual renderer is display-only.

---

## 9. Governance and QR Safety Notes

- `renderVisualTemplateForLetterPreview` uses `resolveTemplatePreview` (reads-only)
- No `erp_output_public_links` row is ever created by visual renderer
- QR issuance path is 100% unchanged — `handleIssueVerificationLink` → `createOutputPublicLink` 
- Visual renderer is purely display-side; it does not affect the QR/public-link flow
- All reads in `renderVisualTemplateForLetterPreview` use `createAdminClient` (server-side, never exposed to browser)

---

## 10. Data Redaction and Sensitive Field Proof

- `employee.employment_status` maps from `employees.employee_status` — a safe status enum (no salary/bank/passport/EID data)
- Binding registry explicitly EXCLUDES: salary, IBAN, bank_account, passport, eid_number, medical, ocr_text, embedding, api_key, secret, token
- `redactDesignerTestBindingValues` applied to all resolved values before rendering
- `resolveEmployeeBindingValues` selects only: `employee_code, full_name_en, full_name_ar, joining_date, contract_end_date, employee_status, owner_company_id, branch, department, designation, employment_type, nationality`
- No joins to: payroll, bank_details, passport_details, eid_details, medical, WPS data

---

## 11. Side-Effect Prevention Proof

Test flows:
- `runReportDesignerTest` (sample/live_record/company_context): zero DB writes
- `runReportFetcherPreview`: zero DB writes (fetcher reads only)
- `renderVisualTemplateForLetterPreview`: zero DB writes

Production flows (untouched):
- `runReportAction` → `runReport` → `createReportRunLog`: unchanged
- `createOutputPublicLink`: unchanged
- QR issuance: unchanged

---

## 12. Security Grep Results

```
rg "dangerouslySetInnerHTML" src/features/report-designer src/lib/report-designer ...
→ Only comments and documentation. No actual usage.

rg "erp_output_public_links|createOutputPublicLink" report-designer-test.ts lib/report-designer features/report-designer
→ Only comments (intent documentation). No actual calls.

rg "erp_report_runs|erp_report_delivery_logs|erp_email_queue|queueEmail|sendEmail" report-designer-test.ts lib/report-designer features/report-designer
→ Only comments. No actual writes.

rg "createAdminClient|service_role|SUPABASE_SERVICE" src/features/report-designer
→ No matches (clean).

rg "salary|iban|passport|eid_number|medical|ocr_text|embedding|api_key|secret|token" ...
→ Only deny-list definitions in test-data-resolver.ts and documentation strings. No actual sensitive data resolved.
```

All greps PASS.

---

## 13. TypeScript Result

```
npx tsc --noEmit → exit code 0 — no errors
```

---

## 14. Build Result

```
npm run build → exit code 0 — build successful
Next.js 16.2.6 (Turbopack) — all 200+ routes compiled
```

---

## 15. Browser/Manual UAT Checklist

- [ ] Open Reports Editor, select template, switch to "Test Report" tab
- [ ] Verify "Sample Data" mode generates preview with placeholder values
- [ ] Verify "Employee Record" mode — search employee, click generate, verify employee name in output
- [ ] Verify "Company Context" mode — search company, click generate, verify company data in output
- [ ] Verify "Report Filters" mode — enter valid report code (e.g. `ADMIN_PERMISSION_MATRIX`), click generate, verify preview appears without creating a run history row
- [ ] Verify safety banner is visible in all modes
- [ ] Open HR Letters for an employee, issue Experience Letter
- [ ] In Formal View, select a template that has a Puck visual layout
- [ ] Verify visual layout renders in iframe instead of legacy EL preview
- [ ] Select a non-visual template — verify legacy EL preview still works
- [ ] Verify QR issuance button still appears and works for approved templates
- [ ] Check `erp_report_runs` table in Supabase — no test/preview rows created
- [ ] Check `erp_output_public_links` — no test rows created

---

## 16. Known Limitations

1. **Report Filters mode table/list blocks** — the EL mapper has no native table block. Report rows are reflected only via `report.*` aggregate bindings. Per spec, this is documented as a limitation pending DESIGNER.7+.
2. **`last_working_date` binding** — deferred. Source not confirmed (no direct `employees` column). Deferred to DESIGNER.7.
3. **`work_site` binding** — deferred. Requires joining `hr_assignment` or site tables; not confirmed safe. Deferred to DESIGNER.7.
4. **Visual template in PDF/print export** — visual HTML is used for on-screen formal preview only. PDF/print path in `LetterPreviewDialog` still uses existing EL document object. Full PDF support requires DESIGNER.7.

---

## 17. Next Recommended Phase

**REPORT DESIGNER.7 — Governance, Approval & Security Review Integration**

Goals:
- Implement template governance workflow (submit → review → approve → publish)
- Implement security review checklist for visual templates
- Gate production visual rendering on `governance_status IN ('approved', 'published')` only
- Extend PDF/print export to use visual HTML renderer
- Consider table/list EL block for report_filters mode
