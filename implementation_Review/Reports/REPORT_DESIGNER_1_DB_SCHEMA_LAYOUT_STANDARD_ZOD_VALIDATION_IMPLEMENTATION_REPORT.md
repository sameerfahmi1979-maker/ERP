# REPORT DESIGNER.1 — DB Schema, Layout Standard, Zod Validation, and Live Report Test Foundation
## Implementation Report

**Phase:** REPORT DESIGNER.1  
**Date:** 2026-07-03  
**Status:** COMPLETE  
**Next phase:** REPORT DESIGNER.2 (Puck installation, ReportTemplate type update, query-keys)

---

## 1. Executive Summary

REPORT DESIGNER.1 establishes the safe foundation for the ALGT ERP Visual Reports Editor. No drag-and-drop UI, no Puck installation, no renderer changes — only the database schema, TypeScript types, Zod validation system, data-binding allowlist, server actions, live-test schemas, standards document, and Cursor rule.

All new code is additive and non-breaking. Existing report templates, governance flows, QR issuance, and Executive Ledger output are unaffected.

Key deliverables:
- DB migration: 4 visual tracking columns added to `erp_report_templates`
- `src/lib/report-designer/` — 6 new library files (types, constants, binding-registry, layout-schema, layout-validation, live-test-schema, index)
- `src/server/actions/reports/report-designer-layout.ts` — 3 server actions (get, save, validate)
- `src/server/actions/reports/report-designer-test.ts` — 3 foundation skeletons (options, validate input, run test)
- `docs/standards/ERP_REPORT_DESIGNER_VISUAL_TEMPLATE_STANDARD.md` — full prose standard
- `.cursor/rules/erp-report-designer-visual-template-standard.mdc` — Cursor enforcement rule
- `src/lib/report-center/types.ts` — `ReportTemplate` type updated with 4 new columns
- TypeScript: `npx tsc --noEmit` → 0 errors
- Build: `npm run build` → clean

---

## 2. Files Read

| File | Purpose |
|---|---|
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | Phase registry + ERP architecture overview |
| `implementation_Review/Reports/REPORT_DESIGNER_0_VISUAL_REPORT_EDITOR_PLANNING_AND_GITHUB_RESEARCH_REPORT.md` | Phase 0 recommendations — Puck, JSON schema, block types |
| `src/lib/executive-ledger/types.ts` | ExecutiveLedgerDocument, sections, party, verification |
| `src/lib/report-center/types.ts` | ReportTemplate, TemplateGovernanceStatus, ReportTemplateType |
| `src/server/actions/reports/templates.ts` | Existing auth patterns, logAudit usage, revalidatePath |
| `src/lib/rbac/check.ts` | AuthContext shape, hasPermission signature |
| `src/server/actions/audit.ts` | AuditLogParams shape |
| `src/lib/query/query-keys.ts` | Existing query key patterns |

---

## 3. DB Schema Findings

### Pre-existing columns (confirmed)

```sql
-- These existed from BRANDING phase migrations with jsonb default '{}'
body_layout_json   jsonb  DEFAULT '{}'::jsonb
header_layout_json jsonb  DEFAULT '{}'::jsonb
footer_layout_json jsonb  DEFAULT '{}'::jsonb
style_json         jsonb  DEFAULT '{}'::jsonb
```

All 4 were confirmed via `information_schema.columns` query. All default to `'{}'::jsonb` (empty object), not null. All are currently unused/null for real data.

### New columns (added by REPORT DESIGNER.1 migration)

```sql
visual_editor_engine          text       DEFAULT 'puck'
visual_layout_schema_version  integer    DEFAULT 1
visual_layout_updated_at      timestamptz NULL
visual_layout_updated_by      bigint     NULL → user_profiles(id) ON DELETE SET NULL
```

Index added:
```sql
CREATE INDEX idx_erp_report_templates_visual_editor_engine
  ON erp_report_templates(visual_editor_engine)
  WHERE visual_editor_engine IS NOT NULL;
```

---

## 4. Migration Details

**File:** `supabase/migrations/20260703000001_report_designer_1_visual_layout_columns.sql`

Applied directly to live Supabase (`user-supabase` MCP) on 2026-07-03. Confirmed via post-migration query.

No new tables. No RLS changes. Existing `erp_report_templates` RLS policies remain enabled and forced.

No UUID, SERIAL, or BIGSERIAL introduced. All ID columns use `bigint`.

---

## 5. Layout JSON Schema Details

**File:** `src/lib/report-designer/layout-schema.ts`

### Root shape
```typescript
{
  schemaVersion: number;       // 1..CURRENT_LAYOUT_SCHEMA_VERSION
  engine: "puck";              // only literal "puck" accepted
  content: ReportDesignerBlock[];  // max 50 blocks
  root: {
    props: {
      orientation?: "portrait" | "landscape";
      pageSize?: "A4" | "A3" | "Letter";
      fontFamily?: string;     // must be in PERMITTED_FONT_FAMILIES
      languageMode?: "en" | "ar" | "bilingual";
    };
  };
}
```

### Security rules in Zod schema
1. All text props: max 4000 chars, HTML tag rejection, script injection rejection
2. All `binding:` fields validated against `SAFE_BINDING_PATHS` (Zod `.refine()`)
3. All `{{binding}}` placeholders in body text validated via `superRefine`
4. `fontFamily` validated against `PERMITTED_FONT_FAMILIES` allowlist
5. Numeric ranges enforced (spacer 4–40mm, logo 16–80mm, stamp 20–60mm, QR 20–50mm)
6. Content array capped at `MAX_BLOCKS_PER_ZONE` (50)

---

## 6. First Block Subset (REPORT DESIGNER.1)

| Block | Type Literal | Description |
|---|---|---|
| Heading | `HeadingBlock` | H1/H2/H3, static text, alignment |
| Body Text | `BodyTextSectionBlock` | Multi-para text with `{{binding}}` placeholders |
| Key-Value | `KeyValueSectionBlock` | Dotted label→value rows with binding per field |
| Divider | `DividerBlock` | Horizontal rule, optional label |
| Spacer | `SpacerBlock` | Vertical whitespace 4–40mm |
| Branding Header | `BrandingHeaderBlock` | Full company header from branding profile |
| Company Logo | `CompanyLogoBlock` | Logo from branding profile, alignment, max height |
| Signatory | `SignatoryBlock` | Name/title/signature, from branding profile |
| Stamp | `StampBlock` | Stamp image from branding profile |
| Verification QR | `VerificationQrBlock` | QR placeholder — actual QR only at issuance |

---

## 7. Binding Registry Details

**File:** `src/lib/report-designer/binding-registry.ts`

### 28 approved binding paths across 4 namespaces

| Namespace | Count | Example paths |
|---|---|---|
| `employee.*` | 11 | `employee.full_name_en`, `employee.designation`, `employee.joining_date` |
| `company.*` | 9 | `company.legal_name_en`, `company.trn`, `company.address_block_en` |
| `document.*` | 5 | `document.ref`, `document.issue_date`, `document.qr_verification_url` |
| `report.*` | 4 | `report.title`, `report.code`, `report.total_rows` |

### Validation helpers
- `isAllowlistedBinding(path)` — boolean check
- `extractBindingsFromText(text)` — extracts `{{...}}` placeholders
- `validateTextBindings(text)` — returns array of unknown/unsafe bindings

---

## 8. Sensitive Fields Excluded

The following fields are explicitly excluded and must never appear in `ERP_BINDING_REGISTRY`:

```
salary, basic_salary, total_salary, allowances, deductions
iban, bank_account, account_number
passport_number (raw), eid_number (raw), visa_uid (raw)
medical data, health data, insurance details
ocr_text, extracted_text
prompt, embedding, vector
*_id internal FK columns
created_by, updated_by
service_role, api_key, secret, token values
```

---

## 9. Server Actions Implemented

### `src/server/actions/reports/report-designer-layout.ts`

| Function | Permission | Description |
|---|---|---|
| `getReportTemplateVisualLayout(id)` | `reports.view` | Loads body/header/footer layout zones + governance metadata |
| `saveReportTemplateVisualLayout(input)` | `reports.manage` | Saves validated layout; blocks approved/published templates |
| `validateReportDesignerLayoutAction(input)` | `reports.view` | Validates layout without saving |

**Security pattern followed:**
1. `getAuthContext()` → `hasPermission()` before any DB access
2. Zod validation before write
3. Governance guard: only `draft` or `rejected` templates may be saved
4. `createAdminClient()` only after permission gate
5. Audit log with structural metadata only (template_id, schema_version, block_count, binding_count, block_types)
6. `revalidatePath("/admin/reports/templates")` after write

### `src/server/actions/reports/report-designer-test.ts`

| Function | Permission | Description |
|---|---|---|
| `getReportDesignerTestOptions(templateId)` | `reports.view` | Returns capability map for test dialog |
| `validateReportDesignerTestInput(input)` | `reports.view` | Validates test input schema |
| `runReportDesignerTest(input)` | `reports.view` | SKELETON: returns sample data only (REPORT DESIGNER.5 for live data) |

---

## 10. Live Report Test Architecture and Foundation

### What the user will select (future UI)
When a designer clicks "Test Report" in the future visual editor:
1. **Test mode**: `sample` (placeholder) | `live_record` (DB entity) | `report_filters` (tabular)
2. **Context** depending on template type:
   - HR letter/certificate → select employee + company
   - Tabular report → select report code + filter parameters
   - Company letter → select company
   - Party letter → select party

### Which existing fetchers can be reused (REPORT DESIGNER.5)
- `getHrLetterContext()` or equivalent in `src/server/actions/reports/runner.ts` — for HR letter test
- Existing report runner in `src/server/actions/reports/runner.ts` — for report_filters mode (run in preview mode, no audit row)
- The binding resolver will call `renderExecutiveLedgerHtml()` indirectly through the Executive Ledger pipeline

### How preview data context is formed
1. Call appropriate fetcher with `testMode: true` flag (prevents audit row creation, PDF export, email)
2. Map fetched entity to binding paths: `employee.full_name_en` → `employeeRow.full_name_en`, etc.
3. Substitute `{{binding}}` placeholders with resolved values
4. Pass resolved `ExportBrandingContext` + resolved sections to `renderExecutiveLedgerHtml()`
5. Return HTML fragment for client preview iframe

### How permissions/redaction are enforced
- Requires `reports.view` minimum permission
- Module-specific data permissions checked before accessing employee/party data
- Sensitive fields (salary, IBAN, raw document numbers) are on the deny-list in `ERP_BINDING_REGISTRY`
- Even if a user somehow adds a sensitive binding, Zod validation rejects it at save time
- At resolution time, any field not in `ERP_BINDING_REGISTRY` resolves to `[UNKNOWN BINDING]`

### How this remains non-mutating
- The `runReportDesignerTest` action **never**:
  - Calls `INSERT` or `UPDATE` on any table
  - Creates `erp_output_public_links` rows (no QR)
  - Writes `report_runs` rows
  - Sends email via notification queue
  - Modifies `governance_status` of the template
- All DB calls in test mode are `SELECT` only
- No `revalidatePath()` calls in test actions

### How it will integrate with the future visual editor UI (REPORT DESIGNER.5)
- Visual editor (Puck canvas) calls `validateReportDesignerLayoutAction()` after each block change
- "Test Report" button opens a dialog driven by `getReportDesignerTestOptions()`
- User fills in context, triggers `runReportDesignerTest()`
- Result renders in an `<iframe>` or controlled preview panel — never via `innerHTML`
- User can modify layout and re-test without page reload

### REPORT DESIGNER.1 foundation for Live Test
- All types defined: `ReportDesignerTestMode`, `ReportDesignerTestContext`, `ReportDesignerTestInput`, `ReportDesignerTestResult`, `ReportDesignerTestDataSource`, `ReportDesignerTestOptions`
- Zod schema: `ReportDesignerTestInputSchema` — validates all test inputs
- Sample data: `buildSampleBindingValues()` — 28 placeholder values for all approved binding paths
- Server action skeletons created with correct auth gates and Zod validation
- Current implementation returns sample data only — no DB queries in test run

---

## 11. Governance Integration

Visual layout edits respect the existing BRANDING.7 governance lifecycle:

| Status | Visual layout editable? |
|---|---|
| `draft` | ✅ Yes |
| `rejected` | ✅ Yes (revise and resubmit) |
| `in_review` | ❌ Blocked — governance guard in `saveReportTemplateVisualLayout()` |
| `approved` | ❌ Blocked — create new version |
| `published` | ❌ Blocked — create new version |
| `archived` | ❌ Blocked |

`EDITABLE_GOVERNANCE_STATUSES = ["draft", "rejected"]` — this constant is used in both the server action and the `VisualLayoutResult.isEditable` flag returned to the client.

---

## 12. Security Model

| Concern | Mitigation |
|---|---|
| Raw HTML injection | Zod rejects `<tag>` patterns in all string props |
| Script injection | Zod rejects `script`, `eval`, `innerHTML`, `outerHTML` patterns |
| Unknown binding injection | `SAFE_BINDING_PATHS` allowlist validated in Zod `.refine()` |
| Sensitive data exposure | Sensitive fields excluded from `ERP_BINDING_REGISTRY` |
| Unauthorized write | `hasPermission(authCtx, "reports.manage")` gate before DB write |
| Write to approved template | Governance status guard before `UPDATE` |
| Service-role leakage | `createAdminClient()` only after permission check in server-only file |
| Audit log leakage | Audit payload contains structural metadata only — no full layout JSON |
| QR link creation in test | `runReportDesignerTest()` has no `INSERT` to `erp_output_public_links` |

---

## 13. Validation Results

```
TypeScript: npx tsc --noEmit → EXIT 0 (0 errors)
Build: npm run build → clean (no new build errors introduced)

Checks passed:
  ✓ No UUID introduced
  ✓ No SERIAL/BIGSERIAL introduced
  ✓ No raw HTML renderer introduced
  ✓ No script/event handler in layout schemas
  ✓ No sensitive binding keys in ERP_BINDING_REGISTRY
  ✓ No service-role code in client components
  ✓ Approved/published edit guard present and tested in server action
  ✓ Zod v4 compatible (z.record(keySchema, valueSchema), .issues not .errors)
```

---

## 14. Known Limitations

1. **Live test execution is sample-only** — full live data resolution awaits REPORT DESIGNER.5
2. **`availableReportCodes` is empty** — will be populated from `erp_report_registry` in REPORT DESIGNER.5
3. **`style_json` column** — not yet typed or validated; kept as `Record<string, unknown>` for future theme tokens
4. **`body_html_en / body_html_ar`** — still exist as legacy columns; not removed (soak period until REPORT DESIGNER.9)
5. **No renderer mapping** — `ReportDesignerLayoutJson → ExecutiveLedgerDocument` mapping layer is REPORT DESIGNER.4
6. **No UI routes** — the single "Reports Editor" route is REPORT DESIGNER.8

---

## 15. Files Changed / Created

### New files
```
src/lib/report-designer/types.ts
src/lib/report-designer/constants.ts
src/lib/report-designer/binding-registry.ts
src/lib/report-designer/layout-schema.ts
src/lib/report-designer/layout-validation.ts
src/lib/report-designer/live-test-schema.ts
src/lib/report-designer/index.ts
src/server/actions/reports/report-designer-layout.ts
src/server/actions/reports/report-designer-test.ts
supabase/migrations/20260703000001_report_designer_1_visual_layout_columns.sql
docs/standards/ERP_REPORT_DESIGNER_VISUAL_TEMPLATE_STANDARD.md
.cursor/rules/erp-report-designer-visual-template-standard.mdc
implementation_Review/Reports/REPORT_DESIGNER_1_DB_SCHEMA_LAYOUT_STANDARD_ZOD_VALIDATION_IMPLEMENTATION_REPORT.md (this file)
```

### Modified files
```
src/lib/report-center/types.ts  — added 4 new visual_* columns to ReportTemplate interface
```

---

## 16. Next Recommended Phase: REPORT DESIGNER.2

**Scope:** Puck installation, `ReportTemplate` query/fetch updates, `query-keys.ts` additions

Suggested deliverables:
1. Install `@measured-co/puck` (verify package name/version)
2. Add `reportDesigner` section to `queryKeys` in `src/lib/query/query-keys.ts`
3. Update `getReportTemplate()` to select the 4 new visual tracking columns
4. Add `invalidation.ts` entries for report designer cache keys
5. Confirm Puck works with Next.js app router (server components boundary)
6. Create minimal Puck config scaffold (no ERP blocks yet)

Stop before implementing the full block UI (that is REPORT DESIGNER.3).
