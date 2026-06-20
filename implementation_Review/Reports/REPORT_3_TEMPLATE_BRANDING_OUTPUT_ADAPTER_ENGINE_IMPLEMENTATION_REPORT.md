# REPORT.3 — Template / Branding / Output Adapter Engine
## Implementation Report

**Phase:** REPORT.3  
**Date:** 2026-06-19  
**Status:** CLOSED / PASS ✅  
**Implements:** `ChatGPT/CURSOR_PROMPT_REPORT_3_TEMPLATE_BRANDING_OUTPUT_ADAPTER_ENGINE.md`

---

## 1. Executive Summary

REPORT.3 upgrades the ERP output layer so that reports and exports are visually company-aware.  
The hardcoded "Alliance Gulf ERP" footer has been removed from all adapters and replaced with a dynamic branding system.  
All changes are backward-compatible — existing `ERPExportMenu` callers without branding continue to work exactly as before.

No DB migration was required in this phase (all DB tables exist from REPORT.2).  
No HR.11 reports were implemented. No scheduled delivery. No AI.

---

## 2. Scope Implemented

| # | Deliverable | Status |
|---|---|---|
| 1 | Branded PDF output adapter | ✅ |
| 2 | Branded Print output adapter | ✅ |
| 3 | Branded Excel metadata rows | ✅ |
| 4 | CSV metadata (backward compat, no change) | ✅ |
| 5 | Branded email attachment generation | ✅ |
| 6 | `ReportTemplateSelectDialog` for mixed-company output | ✅ |
| 7 | `ReportPreviewHeader` for on-screen preview | ✅ |
| 8 | Template & branding admin UI | ✅ |
| 9 | Basic Report Center landing page | ✅ |
| 10 | New owner company onboarding hook | ✅ |
| 11 | Hardcoded Alliance Gulf footer removed | ✅ |
| 12 | Backward compatibility for existing `ERPExportMenu` callers | ✅ |
| 13 | Standards / SOT update | ✅ |
| 14 | Implementation report | ✅ |

---

## 3. Files Created

| File | Purpose |
|---|---|
| `src/lib/report-center/company-onboarding.ts` | `ensureReportBrandingForOwnerCompany()` + `ensureReportBrandingForAllOwnerCompanies()` |
| `src/server/actions/reports/templates.ts` | Full CRUD for templates + branding profiles + `listReportTemplatesForSelection` + `resolveTemplatePreview` |
| `src/components/report-center/report-template-select-dialog.tsx` | Mixed-company template selection dialog |
| `src/components/report-center/report-preview-header.tsx` | On-screen branding preview component |
| `src/features/report-center/report-templates-page-client.tsx` | Client page for Templates & Branding admin |
| `src/features/report-center/branding-profile-form.tsx` | Sheet drawer form for branding profile create/edit |
| `src/features/report-center/template-form.tsx` | Sheet drawer form for template create/edit |
| `src/app/(protected)/admin/reports/page.tsx` | Report Center landing page |
| `src/app/(protected)/admin/reports/templates/page.tsx` | Templates & Branding admin page |
| `implementation_Review/Reports/REPORT_3_TEMPLATE_BRANDING_OUTPUT_ADAPTER_ENGINE_IMPLEMENTATION_REPORT.md` | This report |

---

## 4. Files Modified

| File | Change |
|---|---|
| `src/lib/export/export-types.ts` | Added `ExportBrandingContext` interface + `branding?` field on `ERPExportOptions` |
| `src/lib/export/pdf.ts` | Full rewrite — branded header bar, theme colors, neutral footer fallback, watermark, signatory |
| `src/lib/export/print.ts` | Branded HTML header/footer; RTL-ready structure; neutral fallback |
| `src/lib/export/excel.ts` | Company name/address/TRN/report-code metadata rows injected when branding present |
| `src/lib/export/generate-attachment.ts` | Branding forwarded to PDF/Excel attachment generators |
| `src/components/erp/export/erp-export-menu.tsx` | 6 new optional props; template gate logic; branding passed to all adapters |
| `src/server/actions/organizations.ts` | Non-blocking `ensureReportBrandingForOwnerCompany` call after company creation |
| `src/components/layout/app-sidebar.tsx` | "Reports" group added (Report Center + Templates & Branding) |
| `docs/standards/ERP_GLOBAL_REPORT_CENTER_STANDARD.md` | 9 REPORT.3 rules + updated reference files table |
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | REPORT.3 closure entry + log table row |

---

## 5. Output Adapter Changes

### PDF (`src/lib/export/pdf.ts`)

**Before:**
```
Alliance Gulf ERP - Enterprise Report   ← hardcoded footer
fillColor: [66, 66, 66]                 ← hardcoded dark gray header
```

**After:**
- `renderBrandedHeader()`: Draws company header bar in `themeHeaderBgColor`, shows company name, address, TRN/license.
- `renderNeutralHeader()`: Used when no branding — generic centered title, no company name.
- Table header color: `hexToRgb(branding.themeHeaderBgColor)` or `[66, 66, 66]` fallback.
- Footer: `branding.footerTextEn ?? "ERP Report"` — never "Alliance Gulf ERP".
- Watermark: optional text at 40px rotated 45° with low opacity.
- Signatory block: optional, last page only.
- Page numbers + report code in footer.

### Print (`src/lib/export/print.ts`)

**Before:**
```html
<p>Alliance Gulf ERP - Enterprise Report</p>   <!-- hardcoded -->
```

**After:**
- `buildBrandedHeader()`: Company header bar with inline CSS (`headerBg`, `primaryColor`), logo img (with onerror fallback), company name, address.
- `buildNeutralHeader()`: Generic centered title, no company.
- Watermark: fixed-position semi-transparent overlay.
- Signatory block: optional HTML section.
- Footer: `branding.footerTextEn ?? "ERP Report"`.

### Excel (`src/lib/export/excel.ts`)

- When `branding.companyNameEn` exists, injects rows before the title row:
  - Company name
  - Address (if `showAddress`)
  - TRN (if `showTrn`)
  - Trade license (if `showLicense`)
- Report code + template name rows added.
- Empty separator row between company block and title block.

### Email Attachments (`src/lib/export/generate-attachment.ts`)

- `generateExcelAttachment`: branding forwarded to metadata rows (same as excel.ts).
- `generatePDFAttachment`: branded header bar rendered if `branding.companyNameEn` present; same footer fallback.

---

## 6. Removed Hardcoded Branding

The string `"Alliance Gulf ERP - Enterprise Report"` has been **removed from all output files**:

| File | Old value | Replacement |
|---|---|---|
| `src/lib/export/pdf.ts` | `"Alliance Gulf ERP - Enterprise Report"` | `branding?.footerTextEn ?? "ERP Report"` |
| `src/lib/export/print.ts` | `"Alliance Gulf ERP - Enterprise Report"` | `branding?.footerTextEn ?? "ERP Report"` |
| `src/lib/export/generate-attachment.ts` | `"Alliance Gulf ERP - Enterprise Report"` | `branding?.footerTextEn ?? "ERP Report"` |

No hardcoded logo URLs, company names, or color values were introduced in any new code.

---

## 7. Template Selection Dialog Behavior

`ReportTemplateSelectDialog` (`src/components/report-center/report-template-select-dialog.tsx`):

- Opens when `ERPExportMenu` has `requiresTemplateSelection=true` and user clicks PDF/Print/Excel/Email.
- Calls `listReportTemplatesForSelection()` server action on open.
- Shows template name, type, code, profile type badge (Company/Group/Neutral/Custom), company name (if available), logo thumbnail (with onerror fallback).
- Default template shown first.
- Confirm returns `(templateId, template)` to parent via `onSelect` callback.
- Generic — no hardcoded company names.

**Flow:**
```
User clicks PDF → requiresTemplateSelection=true → onRequireTemplateSelection() → 
ReportTemplateSelectDialog opens → user selects → onSelect(id, template) → 
parent resolves ExportBrandingContext → re-triggers export with branding
```

---

## 8. Template / Branding UI Summary

### `/admin/reports`
- Lists all active registry entries.
- Shows: report code, name, description, sensitive profile lock icon, module, category, output formats, status.
- Link to "Templates & Branding" (for managers).
- Permission-gated: `reports.view`.

### `/admin/reports/templates`
- Two tabs: **Branding Profiles** and **Report Templates**.
- Branding profile table: profile code, name, type badge, theme color swatches, active indicator.
- Template table: template code, name, type, orientation, default indicator, active indicator.
- Edit via `Sheet` drawer forms (backward-compatible with the project's existing drawer pattern).
- **BrandingProfileForm**: all 40+ fields including inline color pickers (native `<input type="color">` + hex text input).
- **TemplateForm**: all display flags as Switch toggles, ERPCombobox for branding profile selection.
- Create new profile/template via "New Profile" / "New Template" buttons.
- Permission-gated: `reports.view` (read), `reports.manage` (write).

---

## 9. New Owner Company Onboarding Hook

**File:** `src/lib/report-center/company-onboarding.ts`

### `ensureReportBrandingForOwnerCompany(ownerCompanyId: number)`

- Checks if `COMPANY_{id}_DEFAULT` branding profile exists.
- If missing: creates profile from `owner_companies` (name, phone, email, website; neutral theme colors).
- Checks/creates `COMPANY_{id}_REPORT_TEMPLATE` (report type, portrait, EN, show logo/address/TRN/license).
- Checks/creates `COMPANY_{id}_LETTER_TEMPLATE` (letter type, portrait, bilingual, show signatory).
- Updates `owner_companies.default_report_template_id` / `default_letter_template_id` only if currently null.
- **Idempotent**: safe to call multiple times.
- **No hardcoded company names/colors**.

### `ensureReportBrandingForAllOwnerCompanies()`

- Backfill helper for all active companies.
- Returns `{ total, created, skipped, errors }`.
- Must be called from a server action that checks `reports.manage` permission.

### Integration in `organizations.ts`

```typescript
// Non-blocking: if this fails, company creation still succeeds.
ensureReportBrandingForOwnerCompany(data.id).catch((err) => {
  console.warn(`[createOrganization] Report branding onboarding failed for company ${data.id}:`, err);
});
```

The non-blocking pattern ensures company creation never fails due to the branding onboarding.

---

## 10. Server Actions Added

### `src/server/actions/reports/templates.ts`

| Action | Permission | Description |
|---|---|---|
| `listReportTemplates()` | reports.view | All templates (incl. inactive) |
| `getReportTemplate(id)` | reports.view | Single template by ID |
| `listReportTemplatesForSelection(opts)` | reports.view | Slim join for selection dialog |
| `createReportTemplate(input)` | reports.manage | Create new template |
| `updateReportTemplate(input)` | reports.manage | Update existing template |
| `listBrandingProfiles()` | reports.view | All branding profiles |
| `getBrandingProfile(id)` | reports.view | Single profile by ID |
| `createBrandingProfile(input)` | reports.manage | Create new profile |
| `updateBrandingProfile(input)` | reports.manage | Update existing profile |
| `resolveTemplatePreview(input)` | reports.view | Resolve template → `ExportBrandingContext` |

All write actions: `getAuthContext` + `hasPermission` + Zod + `logAudit` + `revalidatePath`.

---

## 11. Navigation Added

**Sidebar group "Reports":**
```
Reports
├── Report Center      → /admin/reports
└── Templates & Branding → /admin/reports/templates
```

Icons: `BarChart3` (Report Center), `Palette` (Templates & Branding).

---

## 12. Standards / Cursor Rules Updated

### `docs/standards/ERP_GLOBAL_REPORT_CENTER_STANDARD.md`

Added **REPORT.3 Additional Rules** section (9 rules):
1. All output adapters must accept `ExportBrandingContext`.
2. Hardcoded company footer text is forbidden.
3. Mixed-company output must block until template selected.
4. New owner companies must receive report branding/template defaults.
5. Existing exports without branding continue to work unchanged.
6. Template designer not required — management UI is sufficient.
7. `ResolvedReportTemplate` is server-only; use `ExportBrandingContext` for clients.
8. `ReportTemplateSelectDialog` required for multi-company/manual-required strategy.
9. `resolveTemplatePreview()` is canonical for template → `ExportBrandingContext` conversion.

Reference files table updated with 12 new REPORT.3 files.

---

## 13. Source of Truth Update

`.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` updated with:
- Last updated date: 2026-06-19 (REPORT.3)
- REPORT.3 closure entry in "Last closed gate"
- Phase log table row for REPORT.3

---

## 14. Backward Compatibility Checks

| Concern | Resolution |
|---|---|
| Existing `ERPExportMenu` callers (no branding) | `branding` is optional; `resolvedTemplate` defaults to `undefined`; all export paths remain unchanged |
| Existing PDF exports | If `options.branding` absent, `renderNeutralHeader` used; output identical to before except footer text is "ERP Report" instead of "Alliance Gulf ERP" |
| Existing print exports | Same pattern — neutral header if no branding |
| Existing Excel exports | Metadata rows unchanged if no branding supplied |
| Existing email attachments | No branding → same output as before |
| `ERPExportOptions` type consumers | `branding` field is optional, non-breaking addition |

---

## 15. Explicit Scope Not Implemented

Per phase boundary rules:

- ❌ HR.11 real report fetchers
- ❌ Scheduled report delivery
- ❌ Full report history UI
- ❌ AI/smart features
- ❌ WPS/SIF reports
- ❌ Fleet/Finance/Workshop reports
- ❌ Drag-and-drop template designer
- ❌ SERIAL/BIGSERIAL/UUID primary keys (not needed — no new DB tables)
- ❌ Stamp/signature image rendering in PDF (gated to a later phase with `reports.sign` permission)

---

## 16. TypeScript Result

```
npx tsc --noEmit
Exit: 0
Errors: 0
```

---

## 17. Build Result

```
npm run build
Exit: 0
Build: PASS
```

---

## 18. Issues / Notes

1. **Logo rendering in PDF**: jsPDF does not support cross-origin image loading in browser context. `logoUrl` is stored in `ExportBrandingContext` and rendered as `img` in print output, but skipped in PDF in this phase. A future phase can implement logo-to-base64 server-side conversion for PDF embedding.

2. **Color picker `saveGraphicsState`**: jsPDF's `saveGraphicsState()` is only available in certain builds. The watermark rendering uses an optional call with fallback gracefully. The core watermark text is still rendered correctly.

3. **Non-blocking onboarding**: `ensureReportBrandingForOwnerCompany` is called fire-and-forget in `createOrganization`. If it fails (e.g., DB timeout), company creation still succeeds and the admin can use the backfill action later.

4. **Stamp/signature URLs**: Available in `ReportBrandingProfile` and stored in DB, but not rendered in PDF/print in this phase. They are present in the branding profile edit form for admin management.

---

## 19. Final Recommendation

REPORT.3 is complete. The output layer is now company-aware and no hardcoded company names exist in any output adapter.

**Recommended next phase:**
```
REPORT.4 — HR.11 Reports + Letters + Forms Library
```

This phase will implement real HR report data fetchers and letter templates using the foundation built in REPORT.2 and REPORT.3.

---

## 20. Mandatory Scope Checklist

```
[x] No HR.11 reports implemented
[x] No real HR report fetchers implemented
[x] No scheduled report delivery implemented
[x] No AI implemented
[x] Existing ERPExportMenu callers still compile
[x] PDF adapter accepts optional ResolvedReportTemplate (via ExportBrandingContext)
[x] Print adapter accepts optional ResolvedReportTemplate (via ExportBrandingContext)
[x] Excel adapter accepts optional ResolvedReportTemplate (via ExportBrandingContext)
[x] CSV adapter remains backward compatible
[x] Attachment generation passes template metadata
[x] Hardcoded Alliance Gulf ERP footer removed/replaced by neutral fallback
[x] Mixed-company output can trigger ReportTemplateSelectDialog
[x] Template/branding UI is permission-gated
[x] New owner company onboarding hook implemented
[x] No company names/logos hardcoded in new code
[x] Standards updated
[x] Cursor rules updated (via standards doc)
[x] SOT updated
[x] Implementation report created
[x] tsc run — PASS
[x] build run — PASS
```
