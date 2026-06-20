# REPORT.2 — Global Report Engine + Registry + Security Foundation
## Implementation Report

**Date:** 2026-06-19
**Phase:** REPORT.2
**Status:** CLOSED / PASS

---

## 1. Executive Summary

REPORT.2 establishes the complete server and database foundation for the Global ERP Report Center. Five new database tables are created and seeded, branding profiles are dynamically provisioned from all active owner companies, a multi-phase server library is implemented, RLS is enforced on all new tables, and a report registry with 3 starter entries is seeded. The TypeScript compiler passes with zero errors and the Next.js production build passes.

---

## 2. Scope Implemented

| Area | Status |
|---|---|
| DB: 5 new tables (branding profiles, templates, registry, runs, delivery logs) | ✅ |
| DB: owner_companies branding columns (13 columns added) | ✅ |
| DB: FK constraints on owner_companies.default_report_template_id/letter | ✅ |
| DB: 19 indexes across all new tables | ✅ |
| DB: RLS enabled + forced on all 5 tables | ✅ |
| DB: 16 RLS policies | ✅ |
| DB: 7 permissions seeded | ✅ |
| DB: GROUP_DEFAULT + NEUTRAL_DEFAULT branding profiles seeded | ✅ |
| DB: Company-specific branding profiles seeded dynamically | ✅ |
| DB: 8 default templates seeded | ✅ |
| DB: Company-specific report + letter templates seeded per active company | ✅ |
| DB: owner_companies default_report_template_id / default_letter_template_id set | ✅ |
| DB: 3 starter registry entries (ADMIN_PERMISSION_MATRIX, HR_EMPLOYEE_LIST, HR_EMPLOYEE_PROFILE) | ✅ |
| DB: REPORT_RUN numbering rule seeded | ✅ |
| Lib: src/lib/report-center/types.ts | ✅ |
| Lib: src/lib/report-center/constants.ts | ✅ |
| Lib: src/lib/report-center/branding-resolver.ts | ✅ |
| Lib: src/lib/report-center/redaction-engine.ts | ✅ |
| Lib: src/lib/report-center/report-runner.ts | ✅ |
| Lib: src/lib/report-center/report-fetchers.ts | ✅ |
| Lib: src/lib/report-center/index.ts | ✅ |
| Actions: src/server/actions/reports/registry.ts | ✅ |
| Actions: src/server/actions/reports/runner.ts | ✅ |
| Query keys: queryKeys.reports.* (5 factories) | ✅ |
| Invalidation: invalidateReportsRegistry / invalidateReportTemplates / invalidateReportBrandingProfiles / invalidateReportRun | ✅ |
| Standards: docs/standards/ERP_GLOBAL_REPORT_CENTER_STANDARD.md | ✅ |
| Standards: docs/standards/ERP_REPORT_TEMPLATE_BRANDING_STANDARD.md | ✅ |
| Cursor rules: .cursor/rules/erp-global-report-center-standard.mdc | ✅ |
| Cursor rules: .cursor/rules/erp-report-template-branding-standard.mdc | ✅ |

---

## 3. Files Created

| File | Purpose |
|---|---|
| `supabase/migrations/20260619130000_report_2_global_report_engine_registry_security_foundation.sql` | Full migration file (applied via MCP) |
| `src/lib/report-center/types.ts` | All TypeScript types for the report center |
| `src/lib/report-center/constants.ts` | Enums, labels, permission codes, template codes |
| `src/lib/report-center/branding-resolver.ts` | Server-side branding/template resolution |
| `src/lib/report-center/redaction-engine.ts` | Server-side data redaction engine |
| `src/lib/report-center/report-runner.ts` | Core runner + run log management |
| `src/lib/report-center/report-fetchers.ts` | Fetcher dispatch map |
| `src/lib/report-center/index.ts` | Public API re-exports |
| `src/server/actions/reports/registry.ts` | Registry read/write server actions |
| `src/server/actions/reports/runner.ts` | Runner server actions |
| `docs/standards/ERP_GLOBAL_REPORT_CENTER_STANDARD.md` | Report center standard |
| `docs/standards/ERP_REPORT_TEMPLATE_BRANDING_STANDARD.md` | Template/branding standard |
| `.cursor/rules/erp-global-report-center-standard.mdc` | Cursor rule (10 rules) |
| `.cursor/rules/erp-report-template-branding-standard.mdc` | Cursor rule (7 rules) |

---

## 4. Files Modified

| File | Change |
|---|---|
| `src/lib/query/query-keys.ts` | Added `queryKeys.reports.*` (5 factories) |
| `src/lib/query/invalidation.ts` | Added 4 report invalidation helpers |

---

## 5. Migration Summary

**File:** `supabase/migrations/20260619130000_report_2_global_report_engine_registry_security_foundation.sql`

Applied section by section via Supabase MCP (`execute_sql`) due to remote migration history divergence.

Sections applied:
1. Permissions (7 rows)
2. `erp_report_branding_profiles` table
3. `erp_report_templates` table
4. `erp_report_registry` table
5. `erp_report_runs` table
6. `erp_report_delivery_logs` table
7. `owner_companies` column additions (13 columns)
8. 19 indexes
9. RLS enable + force (5 tables)
10. 16 RLS policies
11. GROUP_DEFAULT + NEUTRAL_DEFAULT branding profiles
12. Dynamic company branding profiles (DO $$ loop)
13. 8 global default templates
14. Company-specific templates (DO $$ loop)
15. owner_companies default template IDs (DO $$ loop)
16. FK constraints on owner_companies
17. 3 starter registry entries
18. REPORT_RUN numbering rule

---

## 6. Tables Created

| Table | Purpose | RLS | PK |
|---|---|---|---|
| `erp_report_branding_profiles` | Visual/legal branding data per company/group/neutral | ✅ enabled + forced | BIGINT IDENTITY |
| `erp_report_templates` | Reusable document templates | ✅ enabled + forced | BIGINT IDENTITY |
| `erp_report_registry` | Central catalog of all ERP reports | ✅ enabled + forced | BIGINT IDENTITY |
| `erp_report_runs` | Immutable run/history audit log | ✅ enabled + forced | BIGINT IDENTITY |
| `erp_report_delivery_logs` | Email/delivery metadata | ✅ enabled + forced | BIGINT IDENTITY |

---

## 7. owner_companies Columns Added

```sql
small_logo_url TEXT
stamp_url TEXT
signature_url TEXT
watermark_url TEXT
report_theme_primary_color TEXT
report_theme_secondary_color TEXT
report_footer_text_en TEXT
report_footer_text_ar TEXT
report_signatory_name TEXT
report_signatory_title_en TEXT
report_signatory_title_ar TEXT
default_report_template_id BIGINT → FK to erp_report_templates
default_letter_template_id BIGINT → FK to erp_report_templates
```

---

## 8. Permissions Seeded

| Code | Purpose |
|---|---|
| `reports.view` | View registry, templates, branding profiles |
| `reports.run` | Generate and run reports |
| `reports.export` | Export to PDF, Excel, CSV, print |
| `reports.email` | Send reports via email |
| `reports.manage` | Create/update templates, branding, registry |
| `reports.history.view` | View all report run history |
| `reports.sign` | Include stamp/signature in output |

---

## 9. RLS Policies Summary

**erp_report_branding_profiles:** SELECT(reports.view) / INSERT(reports.manage) / UPDATE(reports.manage) / DELETE(reports.manage)

**erp_report_templates:** Same as branding profiles

**erp_report_registry:** Same as branding profiles

**erp_report_runs:** SELECT(own runs OR reports.history.view) / INSERT(reports.run) / UPDATE(global_admin only) / DELETE(global_admin only)

**erp_report_delivery_logs:** SELECT(reports.history.view) / INSERT(reports.email) / UPDATE(global_admin only) / DELETE(global_admin only)

---

## 10. Seed Data Summary

**Branding Profiles:**
- `GROUP_DEFAULT` — group-level profile
- `NEUTRAL_DEFAULT` — neutral fallback
- `COMPANY_1_DEFAULT` (Alliance Gulf Transport) — seeded from owner_companies
- `COMPANY_2_DEFAULT` (Alliance Scrap Trading) — seeded from owner_companies

**Templates (global):** DEFAULT_REPORT, DEFAULT_LETTER, DEFAULT_CERTIFICATE, DEFAULT_FORM, DEFAULT_CHECKLIST, DEFAULT_BADGE, DEFAULT_EXTERNAL_SUBMISSION, GROUP_REPORT

**Templates (per company):**
- `COMPANY_1_REPORT_TEMPLATE`, `COMPANY_1_LETTER_TEMPLATE`
- `COMPANY_2_REPORT_TEMPLATE`, `COMPANY_2_LETTER_TEMPLATE`

**Registry entries:**
- `ADMIN_PERMISSION_MATRIX` — Permission matrix report (fetcher implemented)
- `HR_EMPLOYEE_LIST` — HR list placeholder (fetcher in REPORT.4)
- `HR_EMPLOYEE_PROFILE` — HR detail placeholder (fetcher in REPORT.4)

**Numbering rule:** `REPORT_RUN` (`RPT-{SEQ6}`, never reset)

---

## 11. Server/Library Foundation Summary

### src/lib/report-center/types.ts
- 14 TypeScript types and interfaces
- Covers: output formats, template types, categories, branding strategies, sensitive profiles, run status, delivery status
- Full row shapes: ReportBrandingProfile, ReportTemplate, ResolvedReportTemplate, ReportRegistryEntry
- Run/result types: ReportRunRequest, ReportRunResult, ReportDataResult
- Redaction types: RedactedValue, ReportRedactionSummary
- Fetcher interface: ReportFetcher

### src/lib/report-center/constants.ts
- REPORT_OUTPUT_FORMATS, REPORT_TEMPLATE_TYPES, REPORT_CATEGORIES, REPORT_BRANDING_STRATEGIES, REPORT_SENSITIVE_PROFILES
- REPORT_PERMISSIONS (typed object with permission codes)
- DEFAULT_REPORT_COLORS
- DEFAULT_REPORT_TEMPLATE_CODES

### src/lib/report-center/branding-resolver.ts
- `detectReportCompanyContext()` — detects owner companies from data rows
- `requiresManualTemplateSelection()` — checks if multi-company
- `resolveReportBranding()` — full resolution with 7-step decision tree
- `buildFallbackResolvedTemplate()` — loads neutral fallback

### src/lib/report-center/redaction-engine.ts
- `maskIban()`, `maskAccountNumber()`, `maskDocumentNumber()`, `redactValue()`
- `buildRedactionSummary()`
- `applyRedaction()` — main function: immutable row sanitization per sensitive profile + caller permissions
- 6 sensitive profiles with field-level rules defined

### src/lib/report-center/report-runner.ts
- `createReportRunLog()` — inserts status=running
- `completeReportRunLog()` — marks success with row count + duration
- `failReportRunLog()` — marks failed with error message
- `runReport()` — full pipeline: registry → permissions → branding → run log → fetcher → redaction → complete log → return

### src/lib/report-center/report-fetchers.ts
- `ADMIN_PERMISSION_MATRIX` — real fetcher (reads permissions table)
- `HR_EMPLOYEE_LIST` — controlled stub (returns "not implemented until REPORT.4")
- `HR_EMPLOYEE_PROFILE` — controlled stub

---

## 12. Branding Resolver Behavior

```
Input: { templateId?, ownerCompanyIds[], registryEntry, isLetterType? }
Output: { resolvedTemplate, resolvedBrandingProfile, requiresManualTemplateSelection, isFallback }

Decision tree:
1. templateId provided → load that template + its branding profile
2. strategy = template_fixed → load registryEntry.default_template_id
3. strategy = none → return null branding
4. strategy = group_default → load GROUP_DEFAULT + GROUP_REPORT_TEMPLATE
5. strategy = manual_required → return requiresManualTemplateSelection=true
6. ownerCompanyIds.length > 1 → return requiresManualTemplateSelection=true
7. ownerCompanyIds.length === 1 → load COMPANY_{id}_REPORT/LETTER_TEMPLATE
8. no companies → NEUTRAL_DEFAULT + DEFAULT_REPORT_TEMPLATE
```

---

## 13. Redaction Engine Behavior

```
Input: data (ReportDataResult), options (profile, permissionCodes, extraRules?)
Output: { sanitizedData, summary }

- Does NOT mutate original data
- Returns new row objects with sensitive fields removed/masked/replaced
- Removes sensitive columns from column list for "removed" action
- Never logs original sensitive values
- Builds full redaction summary with field-level detail
```

Profile rules:
- `payroll` → removes salary fields, IBAN, account number (requires hr.payroll.view)
- `medical` → removes diagnosis, notes, prescription (requires hr.medical.view)
- `disciplinary` → removes disciplinary notes, violation details (requires hr.disciplinary.view)
- `recruitment` → removes salary expectations, interview feedback (requires hr.recruitment.view)
- `dms_confidential` → removes document content, masks reference numbers (requires dms.confidential.view)
- `mixed_sensitive` → combines payroll + medical + disciplinary rules

---

## 14. Report Runner Behavior

```
1. Load registry entry → 404 if not found
2. Check required_permissions → return error if missing
3. resolveReportBranding() → return requiresManualTemplateSelection if multi-company
4. createReportRunLog() → status = running
5. Look up fetcher in REPORT_FETCHERS → controlled error if not found (marks run as failed)
6. Call fetcher.fetch(filters, permissionCodes)
7. applyRedaction(rawData, { profile, permissionCodes })
8. completeReportRunLog(rowCount, redactionSummary, durationMs)
9. Return ReportRunResult
```

---

## 15. Query Keys / Invalidation

**Query keys added to `queryKeys.reports`:**
```typescript
registry(p?)
registryDetail(reportCode)
templates(p?)
brandingProfiles(p?)
run(runId)
```

**Invalidation helpers added:**
```typescript
invalidateReportsRegistry(queryClient)
invalidateReportTemplates(queryClient)
invalidateReportBrandingProfiles(queryClient)
invalidateReportRun(queryClient, runId)
```

---

## 16. Standards / Cursor Rules Created

| File | Rules |
|---|---|
| `docs/standards/ERP_GLOBAL_REPORT_CENTER_STANDARD.md` | 11 rules covering engine usage, no hardcoding, branding, DB standard, redaction, run history, HR.11 integration, permissions, query keys, adding reports |
| `docs/standards/ERP_REPORT_TEMPLATE_BRANDING_STANDARD.md` | Profile types, template types, branding strategies, seeding convention, field reference, stamp/signature rules, REPORT.3 path |
| `.cursor/rules/erp-global-report-center-standard.mdc` | 10 enforced rules with code examples |
| `.cursor/rules/erp-report-template-branding-standard.mdc` | 7 enforced rules with code examples |

---

## 17. Explicit Scope NOT Implemented

| Item | Status |
|---|---|
| REPORT.3 — Template/Branding/Output Adapter Engine | NOT implemented |
| REPORT.4 — HR.11 Reports + Letters + Forms Library | NOT implemented |
| REPORT.5 — Email/Scheduling/Report History/Security UAT | NOT implemented |
| HR.11 reports | NOT implemented |
| HR.12 AI | NOT implemented |
| Template designer UI | NOT implemented |
| Report catalog UI (`/admin/reports`) | NOT implemented |
| PDF/print/Excel/CSV branding output adapter upgrade | NOT implemented |
| Scheduled report delivery | NOT implemented |
| Real HR report fetchers (HR_EMPLOYEE_LIST, HR_EMPLOYEE_PROFILE) | NOT implemented (stubs only) |

---

## 18. TypeScript Result

```
npx tsc --noEmit
Exit code: 0 — PASS (0 errors)
```

One error was found and fixed during development:
- `z.record(z.unknown())` → `z.record(z.string(), z.unknown())` (Zod signature requirement)

---

## 19. Build Result

```
npm run build
Exit code: 0 — PASS
All routes compiled successfully
```

---

## 20. Issues / Notes

1. **Migration applied via MCP** — `supabase db push` fails on this project due to remote migration history divergence (pre-existing condition). All migration SQL was applied section by section via `user-supabase` MCP `execute_sql`. The `.sql` migration file is retained for documentation and future repair.

2. **REPORT_RUN numbering rule** — The `cancelled_number_policy` column accepts `'never_reuse' | 'allow_reuse'` (not `'retain'` as initially written). Fixed during seeding.

3. **Dynamic seeding** — Branding profiles and templates are seeded from all active `owner_companies` rows dynamically. At time of implementation, 2 companies were active (id=1 ALGT, id=2 ALS). Future companies added to `owner_companies` will not auto-seed — they must be seeded via REPORT.3 company onboarding logic.

---

## 21. Scope Checklist

```
[x] No UUID used
[x] No SERIAL used
[x] No BIGSERIAL used
[x] All new tables use BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY
[x] All FKs are BIGINT-compatible
[x] RLS enabled on all new tables
[x] RLS forced on all new tables
[x] reports permissions seeded
[x] owner_companies branding columns added
[x] dynamic owner company branding profile seeding implemented
[x] group/neutral branding profile seeded
[x] default templates seeded
[x] starter registry entries seeded
[x] branding resolver implemented
[x] redaction engine implemented
[x] report runner foundation implemented
[x] server actions foundation implemented
[x] query keys/invalidation added
[x] standards created
[x] cursor rules created
[x] SOT updated
[x] implementation report created
[x] no HR reports implemented
[x] no output adapter branding upgrade implemented
[x] no UI implemented
[x] no scheduled email implemented
[x] tsc run — PASS
[x] build run — PASS
```

---

## 22. Final Recommendation

REPORT.2 is complete and validated. All foundation components are in place.

**Recommended next phase:**
```
REPORT.3 — Template / Branding / Output Adapter Engine
```

REPORT.3 will:
- Inject resolved branding profiles into PDF, print, Excel output adapters
- Upgrade `src/lib/export/pdf.ts` and `src/lib/export/print.ts` to accept `ResolvedReportTemplate`
- Support RTL/Arabic layout (`language_mode = 'ar'` or `'bilingual'`)
- Apply `custom_css` overrides in PDF renderer
- Render `body_html_en / body_html_ar` in letter and certificate templates
- Expose a company onboarding hook that auto-seeds branding profiles/templates for new companies
