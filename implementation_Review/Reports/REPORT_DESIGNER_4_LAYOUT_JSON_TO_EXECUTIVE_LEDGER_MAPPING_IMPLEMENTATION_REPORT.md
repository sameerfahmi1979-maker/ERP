# REPORT DESIGNER.4 — Layout JSON to Executive Ledger Mapping
## Implementation Report

**Phase:** REPORT DESIGNER.4  
**Date:** 2026-07-03  
**Status:** COMPLETE  
**tsc:** ✅ Passes (0 errors)  
**Build:** ✅ Passes (Next.js 16.2.6 Turbopack)

---

## 1. Executive Summary

REPORT DESIGNER.4 delivers the formal preview bridge between the visual layout JSON and the Executive Ledger renderer. A new mapping library (`layout-to-executive-ledger.ts`) converts all 10 block types from header/body/footer zones into an `ExecutiveLedgerDocument`. A new server action (`report-designer-preview.ts`) validates inputs, resolves branding, substitutes sample binding values, and returns safe HTML rendered by the existing `renderExecutiveLedgerHtml` engine. The editor gains a **Designer / Formal Preview** tab switcher — clicking "Generate Preview" renders the current in-memory layout (including unsaved changes) via the formal engine in an iframe. An "Open in Visual Editor" icon link is also added to the Templates & Branding page. Both `tsc --noEmit` and `npm run build` pass clean.

---

## 2. Files Read

| File | Purpose |
|---|---|
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | Current ERP phase state |
| `src/lib/executive-ledger/types.ts` | ExecutiveLedgerDocument, ExecutiveLedgerSection types |
| `src/lib/executive-ledger/html-renderer.ts` | renderExecutiveLedgerHtml (pure function, server-safe) |
| `src/features/executive-ledger/executive-ledger-preview.tsx` | Existing preview: iframe srcDoc, safe HTML boundary |
| `src/lib/export/export-types.ts` | ExportBrandingContext shape |
| `src/server/actions/reports/templates.ts` | resolveTemplatePreview() branding resolver |
| `src/lib/report-designer/types.ts` | All 10 block interfaces, VisualLayoutResult |
| `src/lib/report-designer/live-test-schema.ts` | buildSampleBindingValues() (27 safe sample values) |
| `src/lib/report-designer/index.ts` | Public API exports |
| `src/server/actions/reports/report-designer-test.ts` | Confirmed: sample-only in DESIGNER.1, full in DESIGNER.5 |
| `src/features/report-center/report-templates-page-client.tsx` | Template table structure for "Open in Editor" |
| `src/features/report-designer/report-designer-editor-client.tsx` | Existing editor client for tab integration |

---

## 3. Files Created

| File | Description |
|---|---|
| `src/lib/report-designer/layout-to-executive-ledger.ts` | Mapping library: converts all 10 block types + 3 zones to ExecutiveLedgerDocument |
| `src/server/actions/reports/report-designer-preview.ts` | Server action: auth + branding + sample data + mapping + HTML rendering |
| `src/features/report-designer/formal-preview-panel.tsx` | Client panel: "Generate Preview" button + iframe preview + warnings |

---

## 4. Files Modified

| File | Change |
|---|---|
| `src/lib/report-designer/index.ts` | Exported mapping library functions and types |
| `src/features/report-designer/report-designer-editor-client.tsx` | Added Designer/Formal Preview mode tabs; integrated FormalPreviewPanel |
| `src/features/report-center/report-templates-page-client.tsx` | Added Eye icon "Open in Visual Editor" link in template actions column |

---

## 5. Mapping Rules Implemented Per Block

### HeadingBlock → `body` section
- `title = block.props.text`
- `content = ""` (heading rendered via title only)
- Alignment prop stored in block but EL body sections don't have alignment override — documented as limitation

### BodyTextSectionBlock → `body` section
- `title = block.props.title` (optional)
- `content = resolveTextBindings(block.props.content, sampleValues)`
- All `{{binding.path}}` replaced with sample values; unknown bindings render as `[UNKNOWN: path]`
- `language` passed through to EL body section (controls RTL rendering)

### KeyValueSectionBlock → `key_value` section
- `title = block.props.title` (optional)
- `rows` = each field row: `{ label, value: resolveBinding(binding, sampleValues), emphasized, isSubHeader }`
- Sub-header rows have `value = ""` (EL handles visual sub-header rendering)

### DividerBlock → `divider` section
- `label = block.props.label` (optional center label)

### SpacerBlock → `divider` section (no label)
- No native spacer section type in ExecutiveLedger — mapped to an unlabeled divider
- Height mm prop not applicable to EL sections — documented as known limitation

### BrandingHeaderBlock → Document-level branding override
- Not a section — modifies branding context for the document
- `showLogo` → `branding.showLogo`
- `showName = false` → nulls `branding.companyNameEn` and `companyNameAr`
- `showAddress` → `branding.showAddress`
- `showContact = false` → nulls `branding.phone`, `branding.email`, `branding.website`

### CompanyLogoBlock → Document-level branding override
- `variant = "small_logo"` → uses `branding.smallLogoUrl ?? branding.logoUrl`
- `variant = "report_logo"` → uses `branding.logoUrl ?? branding.smallLogoUrl`
- Sets `branding.showLogo = true`

### SignatoryBlock → Document-level fields
- `nameOverride` present → sets `document.signatoryOverride.name` and `titleEn`
- `showSignature = false` → nulls `branding.signatureUrl`
- Sets `branding.showSignatory = true`

### StampBlock → Document-level branding override
- Sets `branding.showStamp = true`
- Actual stamp image resolved from branding profile (not from block props — no user URL)

### VerificationQrBlock → `document.verification` (preview placeholder)
- `verification = { publicUrl: null, qrDataUrl: null, label: block.props.label }`
- No QR token created, no `erp_output_public_links` write
- EL renderer shows placeholder box for `verification` with null `qrDataUrl`

---

## 6. Branding Resolution Approach

1. `previewReportDesignerTemplate` calls `resolveTemplatePreview({ templateId })` (existing BRANDING.4 function)
2. `resolveTemplatePreview` fetches `erp_report_templates` with `branding_profile` join
3. Signed asset URLs (logo, stamp, signature) resolved via `resolveReportBrandingProfileAssetUrls`
4. Stamp and signature URLs gated by `reports.sign` permission (already enforced inside `resolveTemplatePreview`)
5. The resolved `ExportBrandingContext` is passed into the mapper as the base branding object
6. Block-level overrides (`BrandingHeaderBlock`, `CompanyLogoBlock`, `SignatoryBlock`, `StampBlock`) apply mutations on top of the base branding context via immutable spreads

Branding is **never** resolved from user-supplied data in the layout JSON.

---

## 7. Binding / Sample Data Approach

- `buildSampleBindingValues()` (from `src/lib/report-designer/live-test-schema.ts`) provides 27 safe sample values
- All sample values are prefixed `[SAMPLE]` to prevent confusion with real data
- No salary, IBAN, passport, EID, or medical values in sample data
- `resolveTextBindings()` replaces `{{path}}` patterns using the flat sample map
- Unknown bindings render as `[UNKNOWN: path]` and are added to warnings
- Warnings are returned to the client for display in the preview panel

The preview server action includes a mandatory warning:
> "This is a sample-data preview. Binding values use placeholder data. Real data resolution is available in REPORT DESIGNER.5."

---

## 8. Formal Preview UI Behavior

The editor client now has two modes controlled by a tab switcher in the control bar:

**Designer** (PenLine icon, blue):
- Puck editor with all 10 blocks and zone selector (Header / Body / Footer)
- Save button visible for editable templates

**Formal Preview** (Eye icon, purple):
- Zone tabs hidden (all zones are previewed together)
- `FormalPreviewPanel` shown — uses in-memory (not last-saved) layout:
  - If editing body zone and unsaved changes exist → body preview includes those changes
  - Header/footer always use their in-memory state
- Click **Generate Preview** → calls server action → returns HTML → renders in `<iframe srcDoc={...}>`
- Click **Refresh Preview** after first render → re-calls server action
- Warnings panel shown below toolbar when warnings exist
- Error banner shown on failure with message
- No auto-refresh on block changes (click-based to avoid expensive round-trips)

The preview does not force save before rendering — unsaved changes in the active zone are passed directly to the server action.

---

## 9. Security Checks

```bash
# dangerouslySetInnerHTML in report-designer/lib/preview
→ Only found in comments (not actual usage) ✅

# createAdminClient / service_role / SUPABASE_SERVICE in client features
→ No matches ✅

# erp_output_public_links / createOutputPublicLink in preview action / lib
→ No matches ✅
```

Additional invariants verified by code review:
- Preview server action does NOT write to `erp_report_runs` ✅
- Preview server action does NOT call email services ✅
- No QR data URL is generated in preview mode (`qrDataUrl: null`) ✅
- `renderExecutiveLedgerHtml` escapes all text via `elEscapeHtml()` ✅
- Preview HTML served via `<iframe srcDoc={...}>` not `dangerouslySetInnerHTML` ✅

---

## 10. What Was Explicitly Not Implemented

Per the REPORT DESIGNER.4 scope control:

| Not Implemented | Reason |
|---|---|
| Real employee/company data resolution | REPORT DESIGNER.5 |
| `runReportDesignerTest` with live records | REPORT DESIGNER.5 |
| PDF export from editor | Out of scope |
| Print button from editor | Out of scope |
| QR token creation or public link creation | Explicitly forbidden |
| Report run history rows | Explicitly forbidden |
| Email sends | Explicitly forbidden |
| New DB schema changes | No blocking need found — code only |
| New sidebar items | Existing Reports Editor item reused |
| Modification of official report export pipeline | Out of scope |

---

## 11. TypeScript Result

```
npx tsc --noEmit
→ Exit code: 0 (no errors)
```

One TypeScript error was found and fixed during implementation:
- `asChild` prop on `Button` component (does not exist in this ERP's Button). Fixed by replacing `<Button asChild>` inside `<Link>` with a native styled anchor via `Link className`.

---

## 12. Build Result

```
npm run build
→ ✓ Compiled successfully in 15.9s
→ ✓ TypeScript passed in 41s
→ All routes present including /admin/reports/editor and /admin/reports/editor/[templateId]
→ Exit code: 0
```

---

## 13. Known Limitations

1. **Heading alignment not preserved in EL preview** — `HeadingBlock.props.align` (left/center/right) is not surfaced in `ExecutiveLedgerBodySection`. The EL body section renderer doesn't accept per-section alignment. Alignment will be respected in REPORT DESIGNER.4's HTML if the renderer is extended, or in the final PDF output pipeline.

2. **SpacerBlock height not preserved** — Mapped to an unlabeled `divider` section; mm height is not applicable to the EL section model. The visual gap in the preview may differ from the configured mm value.

3. **CompanyLogoBlock maxHeightMm not applied** — EL renderer controls logo max height via `EL_LOGO_MAX_HEIGHT_PX` constant, not per-block override. The configured height is a design-time hint only.

4. **StampBlock alignment not applied** — Stamp alignment (`left`/`center`/`right`) from the block prop is not surfaced in the EL renderer; stamp position is fixed by the renderer's CSS.

5. **Sample data only** — All binding values are placeholders prefixed `[SAMPLE]`. Real data resolution requires REPORT DESIGNER.5.

6. **BrandingHeaderBlock `showName` workaround** — EL doesn't have a discrete `showName` boolean; suppressing company name requires nulling `companyNameEn`/`companyNameAr` in the branding context. This may affect other name displays in the preview.

7. **No "Open in Editor" from HR Letters or other output dialogs** — Only added to Templates & Branding page as requested. Other entry points can be added in a future phase.

---

## 14. Next Recommended Phase

**REPORT DESIGNER.5 — Live Report Test Execution with Real ERP Data**

Replace sample binding values with real resolved ERP data:
- For `letter`/`certificate` templates: resolve from actual employee record using `getHrLetterContext()` or equivalent safe resolver
- For `report` templates: run the report in preview mode (no audit row, no PDF)
- Redact sensitive fields: salary, IBAN, bank account, medical data → `[REDACTED]`
- Pass resolved bindings to existing mapper and renderer
- Never write report run history, never create QR links, never send emails
- Add a "Test Data" selector panel in the editor (employee ID, company filter, etc.)
