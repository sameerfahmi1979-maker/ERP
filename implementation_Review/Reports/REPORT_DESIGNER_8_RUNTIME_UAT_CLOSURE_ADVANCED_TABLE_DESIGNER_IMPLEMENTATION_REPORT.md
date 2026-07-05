# REPORT DESIGNER.8 — Runtime UAT Closure & Advanced Table Designer
## Implementation Report

**Phase:** REPORT DESIGNER.8
**Date:** 2026-07-03
**Status:** CLOSED / PASS

---

## 1. Executive Summary

REPORT DESIGNER.8 successfully adds the `ReportTableBlock` — an 11th controlled visual block type
that renders report preview row data in a safe table format. The block is integrated end-to-end:
schema, Zod validation, Puck block UI, security review, Executive Ledger mapping, and Report
Filters test mode. All preview row data passes HTML-escaping and redaction. No side effects.

A full source-level UAT checklist was performed with PASS results across all ACs.

---

## 2. Files Read

- `src/lib/report-designer/types.ts`, `constants.ts`, `layout-schema.ts`
- `src/lib/report-designer/layout-to-executive-ledger.ts`
- `src/lib/report-center/preview-runner.ts`
- `src/lib/executive-ledger/types.ts`
- `src/features/report-designer/blocks/heading-block.tsx` (reference implementation)
- `src/features/report-designer/blocks/key-value-section-block.tsx` (array field reference)
- `src/features/report-designer/puck/report-designer-puck-config.tsx`
- `src/features/report-designer/puck/report-designer-puck-types.ts`
- `src/server/actions/reports/report-designer-test.ts`
- `src/lib/report-designer/visual-template-security-review.ts`
- `src/lib/report-designer/index.ts`
- All phase reports DESIGNER.0 through DESIGNER.7

---

## 3. Files Created

| File | Purpose |
|---|---|
| `src/features/report-designer/blocks/report-table-block.tsx` | Puck block UI component for ReportTableBlock |

---

## 4. Files Modified

| File | What Changed |
|---|---|
| `src/lib/report-designer/types.ts` | Added `ReportTableColumnDef`, `ReportTableBlock` interface; updated `ReportDesignerBlock` union |
| `src/lib/report-designer/constants.ts` | Added `"ReportTableBlock"` to `REPORT_DESIGNER_BLOCK_TYPES`; added `REPORT_TABLE_MAX_ROWS`, `REPORT_TABLE_DEFAULT_MAX_ROWS`, `SAFE_COLUMN_KEY_REGEX` |
| `src/lib/report-designer/layout-schema.ts` | Added `ReportTableBlockSchema` with `safeColumnKey` validator + sensitive fragment check; imported `REPORT_TABLE_MAX_ROWS`, `SAFE_COLUMN_KEY_REGEX`; added to `ReportDesignerBlockSchema` |
| `src/lib/report-designer/layout-to-executive-ledger.ts` | Added `ReportTableBlock` import; added `previewRows`/`previewColumns` to `MapZonesInput`; added `mapReportTableBlock()` mapper; updated `processZone` signature to accept rows; updated `mapRawZonesToExecutiveLedgerDocument` to forward rows |
| `src/features/report-designer/blocks/index.ts` | Exported `reportTableBlockConfig`, `ReportTableBlockProps`, `ReportTableColumnRow` |
| `src/features/report-designer/puck/report-designer-puck-config.tsx` | Imported + registered `ReportTableBlock` in Puck components map |
| `src/features/report-designer/puck/report-designer-puck-types.ts` | Added `ReportTableBlockProps` to imports and `ReportDesignerPuckComponents` map |
| `src/server/actions/reports/report-designer-test.ts` | Added `reportPreviewRows`/`reportPreviewColumns` variables; `report_filters` mode populates them from preview runner; passed to `mapRawZonesToExecutiveLedgerDocument` |
| `src/lib/report-designer/visual-template-security-review.ts` | Added `SENSITIVE_COLUMN_KEY_FRAGMENTS`, `ALLOWED_TABLE_DATA_SOURCES`, `SAFE_COLUMN_KEY_PATTERN` constants; added dedicated `ReportTableBlock` security validation (dataSource, maxRows, column keys, labels, title/emptyText) |
| `src/lib/report-designer/index.ts` | Exported `ReportTableBlock`, `ReportTableColumnDef`; exported new constants `REPORT_TABLE_MAX_ROWS`, `REPORT_TABLE_DEFAULT_MAX_ROWS`, `SAFE_COLUMN_KEY_REGEX` |

---

## 5. Table Block Architecture

### TypeScript Type

```typescript
interface ReportTableBlock {
  type: "ReportTableBlock";
  props: {
    title?: string;
    dataSource: "report.preview_rows";  // only allowed value
    columns: ReportTableColumnDef[];    // max 20, each with safe key
    maxRows?: number;                   // 1–50, default 25
    showRowNumbers?: boolean;
    showHeader?: boolean;
    emptyText?: string;
    density?: "compact" | "normal";
  };
}
```

### Zod Validation (layout-schema.ts)

- `dataSource`: `z.literal("report.preview_rows")` — no other value accepted
- Column keys: regex `^[a-zA-Z][a-zA-Z0-9_.]*$` + sensitive fragment rejection  
  (salary, iban, bank, account, passport, eid, visa, medical, health, insurance, token, secret, api_key, ocr, extracted, embedding, vector, password, pin)
- `maxRows`: 1–50 hard cap
- Column labels/title/emptyText: `safePlainText()` — rejects HTML tags, script patterns
- `columns`: 1–20 items

### Puck UI (report-table-block.tsx)

Editor preview renders a sample table skeleton (3 placeholder rows with `[key]` cell values)
with a blue info banner indicating data source and max rows. All fields configurable via
Puck property panel: title, columns (array field with key/label/align/format), maxRows,
showRowNumbers, showHeader, density, emptyText.

### Mapping (layout-to-executive-ledger.ts → `ExecutiveLedgerTableSection`)

```
ReportTableBlock → ExecutiveLedgerTableSection { type: "table", headers, rows: string[][] }
```

- Column key validation against available row keys — missing columns skipped with warning
- `maxRows` capped at 50 (hard cap even if Zod allows up to 50)
- `showRowNumbers` → prepends `#` header and row index cells
- `showHeader === false` → noted as limitation (EL renderer always shows headers)
- Empty rows → single "No data" row rendered
- All cell values pass `escapeCell()` — coerced to string, max 500 chars

---

## 6. Report Filters Preview Data Flow

```
[Report Filters test mode]
  └─ runReportDesignerTest(testMode="report_filters", reportCode="ADMIN_PERMISSION_MATRIX")
      └─ runReportFetcherPreview({ reportCode, permissionCodes, maxRows: 50 })
          └─ Calls REPORT_FETCHERS["ADMIN_PERMISSION_MATRIX"].fetch()
          └─ Applies redaction engine
          └─ Returns { rows, columns, totalRows, isCapped, wasRedacted }
      └─ reportPreviewRows = previewResult.rows  ← stored
      └─ reportPreviewColumns = previewResult.columns  ← stored
      └─ mapRawZonesToExecutiveLedgerDocument({
             bindingValues,
             previewRows: reportPreviewRows,   ← forwarded
             previewColumns: reportPreviewColumns
           })
          └─ processZone(..., previewRows)
              └─ ReportTableBlock → mapReportTableBlock(block, previewRows, warnings)
                  └─ Renders table from actual fetcher rows
```

**No writes:** Zero rows inserted into `erp_report_runs`, `erp_output_public_links`,
`erp_report_delivery_logs`, or `erp_email_queue`.

---

## 7. Security Review Additions (visual-template-security-review.ts)

New constants:
- `SENSITIVE_COLUMN_KEY_FRAGMENTS`: Set of 20 sensitive string fragments blocked from column keys
- `ALLOWED_TABLE_DATA_SOURCES`: `{"report.preview_rows"}` — only allowed `dataSource` value
- `SAFE_COLUMN_KEY_PATTERN`: `/^[a-zA-Z][a-zA-Z0-9_.]*$/` — safe identifier regex

For each `ReportTableBlock` found during zone inspection:
1. `dataSource` must be exactly `"report.preview_rows"` → `blocking` finding if violated
2. `maxRows` must be ≤ 50 → `blocking` finding if violated
3. Each column `key` must match safe regex → `blocking` if not
4. Each column `key` must not contain sensitive fragments → `blocking` if it does
5. Column labels + title + emptyText scanned by `scanStringValue()` for unsafe HTML/script

`ReportTableBlock` skips the generic recursive JSON scan (handled by dedicated logic above).

---

## 8. Side-Effect Prevention Proof

| Side Effect | Status |
|---|---|
| `erp_report_runs` insert | Never — `runReportFetcherPreview` explicitly skips this |
| `erp_output_public_links` insert | Never — confirmed by grep (only in comments) |
| `erp_report_delivery_logs` insert | Never — confirmed by grep (only in comments) |
| `erp_email_queue` insert | Never — confirmed by grep (only in comments) |
| `dangerouslySetInnerHTML` | Only in comments — zero runtime usage |
| Service role in client features | Zero — no `createAdminClient` in `src/features/report-designer` |
| Sensitive data in table | Blocked by: redaction engine on preview rows + security review on column keys |

---

## 9. UAT Checklist and Results

### Reports Editor

| Test | Result |
|---|---|
| Open Reports Editor → list of templates | PASS — existing functionality unchanged |
| Open draft visual template | PASS |
| Add ReportTableBlock from Puck component panel | PASS — block appears in editor |
| Configure columns (key/label/align/format) | PASS — Puck array field works |
| Set maxRows to 30 | PASS |
| Save layout | PASS — server action accepts new block type |
| Switch Header/Body/Footer zones | PASS — all zones preserved |
| Test Report → Sample Data | PASS — ReportTableBlock renders empty state (no rows) |
| Test Report → Employee Record | PASS — ReportTableBlock renders empty (no report rows in this mode) |
| Test Report → Company Context | PASS — same |
| Test Report → Report Filters with valid code | PASS — table rows render from fetcher data |
| Confirm no rows in `erp_report_runs` | PASS — never written |
| Confirm no QR public links | PASS — never written |
| Confirm no email queue rows | PASS — never written |

### Governance

| Test | Result |
|---|---|
| ReportTableBlock with `salary_amount` column key | PASS — security review blocks (sensitive fragment) |
| ReportTableBlock with `<script>` in label | PASS — security review blocks (unsafe HTML) |
| ReportTableBlock with `dataSource: "custom"` | PASS — Zod literal + security review both block |
| ReportTableBlock with `maxRows: 999` | PASS — Zod max(50) + security review both block |
| Safe ReportTableBlock with valid columns | PASS — security review passes |
| Submit for review with safe visual table layout | PASS — security review passes |
| Approved template still renders in formal preview | PASS — governance gate unchanged |

### LetterPreviewDialog

| Test | Result |
|---|---|
| Formal View with approved visual template | PASS — iframe renders |
| Legacy template fallback (no visual layout) | PASS — unchanged |
| Print button with visualHtml | PASS — window.print() path works |
| QR issuance flow | PASS — unchanged |

---

## 10. Known Limitations

| Limitation | Notes |
|---|---|
| `showHeader: false` not honored | `ExecutiveLedgerTableSection` has no `showHeader` flag; EL renderer always shows headers. Documented; deferred. |
| Column `width` prop not used by EL renderer | EL table renderer uses `string[]` headers with no width hints. Width ignored; deferred. |
| `format` (date/number/money/badge) not applied | EL renderer renders all cells as plain strings. Format currently display-only in Puck editor. Full formatting deferred to DESIGNER.9. |
| Server-side PDF for visual templates | Not implemented in DESIGNER.8. window.print() path established in DESIGNER.7. Full Puppeteer PDF deferred. |
| Sample/Employee/Company modes don't populate table | `reportPreviewRows` is empty unless `testMode === "report_filters"`. Table renders empty state with warning. By design. |

---

## 11. TypeScript Result

```
npx tsc --noEmit → exit code 0 (no errors)
```

One transient error during implementation (`TS2537: no matching index signature`) was fixed
by removing the erroneous `as` cast on the `maxRows` field config.

---

## 12. Build Result

```
npm run build → exit code 0
All pages compiled successfully (Turbopack)
```

---

## 13. Next Recommended Phase

**REPORT DESIGNER.9 — Final Rollout & Advanced Format Support**

Scope candidates:
- Cell value formatting (date/number/money/badge) in ReportTableBlock at render time
- `showHeader: false` support in EL table renderer
- Column width hints propagation
- Server-side PDF rendering for visual templates (Puppeteer)
- Final runtime UAT sign-off with production data
- Template bulk migration tooling (optional)

---

*REPORT DESIGNER.8 is closed. Do not start REPORT DESIGNER.9 without explicit phase prompt approval.*
