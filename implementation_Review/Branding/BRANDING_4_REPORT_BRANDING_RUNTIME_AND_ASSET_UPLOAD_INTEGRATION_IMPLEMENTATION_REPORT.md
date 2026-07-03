# BRANDING.4 — Report Branding Runtime and Asset Upload Integration
## Implementation Report

**Phase:** BRANDING.4  
**Status:** CLOSED / PASS ✅  
**Date:** 2026-07-02  
**Build:** `npx tsc --noEmit` = 0 errors · `npm run build` = ✅ clean

---

## 1. Executive Summary

BRANDING.4 completes the report/output branding runtime bridge. All six report-scope asset types (`report_logo`, `report_logo_small`, `stamp`, `signature`, `watermark`, `letterhead_background`) are now:

- **Uploadable** from the Templates & Branding profile UI.
- **Resolved at runtime** from `erp_branding_assets` (with legacy URL column fallback).
- **Permission-gated:** `stamp` and `signature` are never resolved or exposed without `reports.sign`.
- **Fed into** PDF export (with image embedding), print export (with `<img>` tags), Excel export (metadata), email attachments, and scheduled report attachments.
- **Displayed** in the Report Run page via `resolvedBranding` (the BRANDING.0 gap is fixed).

---

## 2. Files Changed / Created

| File | Type | Change |
|---|---|---|
| `src/lib/export/export-types.ts` | Modified | Added `smallLogoUrl`, `stampUrl`, `signatureUrl`, `watermarkUrl`, `letterheadBackgroundUrl`, `showStamp` to `ExportBrandingContext` |
| `src/server/actions/reports/templates.ts` | Modified | Completed `resolveTemplatePreview()` for all 6 asset types with `reports.sign` gate; added `resolveTemplateForExport()` for server-side/schedule use |
| `src/features/report-center/report-run-page.tsx` | Modified | `resolvedBranding` is now populated after a successful run (or manual template selection) by calling `resolveTemplatePreview()` |
| `src/features/branding/report-branding-assets-section.tsx` | Modified | Added `watermark` and `letterhead_background` upload cards |
| `src/lib/export/print.ts` | Modified | Added `escapeHtml`/`escapeAttr` helpers; stamp/signature `<img>` tags in signatory block; image watermark support; letterhead background CSS |
| `src/lib/export/pdf.ts` | Modified | Made `exportToPDF` async; added `preloadBrandingImages()` and `fetchImageAsDataUrl()` helpers; logo embedding in branded header; stamp/signature embedding in signatory block |
| `src/server/actions/reports/schedules.ts` | Modified | `executeScheduleRun()` now resolves branding via `resolveTemplateForExport()` and passes it as `branding` in `exportOptions` |
| `src/features/report-center/letter-preview-dialog.tsx` | Modified | `handlePDF()` made async to match new `exportToPDF()` signature |
| `src/components/erp/export/erp-export-menu.tsx` | Modified | PDF case `await`s `exportToPDF()` |

---

## 3. DB / Migration Status

**No database migration required.**  
All changes are runtime/code only. The `erp_branding_assets` table and `erp_report_branding_profiles` legacy URL columns were established in BRANDING.1 and remain unchanged.

---

## 4. Asset Upload Cards Implemented

`ReportBrandingAssetsSection` now renders upload cards for all 6 report-scope asset types:

| Asset Type | Label | Sensitive |
|---|---|---|
| `report_logo` | Report Logo | No |
| `report_logo_small` | Small Logo | No |
| `stamp` | Company Stamp | **Yes** — `reports.sign` to preview |
| `signature` | Signatory Signature | **Yes** — `reports.sign` to preview |
| `watermark` | Watermark Image | No |
| `letterhead_background` | Letterhead Background | No |

---

## 5. Runtime Resolver Behavior

`resolveTemplatePreview()` in `src/server/actions/reports/templates.ts`:

- Calls `resolveReportBrandingProfileAssetUrls(bp.id, ctx)` — passes full `AuthContext` so `canAccessBrandingAssetUrl()` gates sensitive types automatically.
- Maps assets to `ExportBrandingContext` fields with legacy URL column fallback:
  - `report_logo` → `logoUrl` (+ `bp.logo_url` fallback)
  - `report_logo_small` → `smallLogoUrl` (+ `bp.small_logo_url` fallback)
  - `stamp` → `stampUrl` **only if** `tpl.show_stamp && reports.sign` (+ `bp.stamp_url` legacy still gated)
  - `signature` → `signatureUrl` **only if** `tpl.show_signatory && reports.sign` (+ `bp.signature_url` legacy still gated)
  - `watermark` → `watermarkUrl` (+ `bp.watermark_url` fallback)
  - `letterhead_background` → `letterheadBackgroundUrl` (asset only — no legacy column)
- `resolveTemplateForExport()` is a new parallel helper accepting `permissionCodes: string[]` instead of a full `AuthContext`, used by the schedule runner and background jobs.

---

## 6. ExportBrandingContext Changes

Six new optional fields added (all backward-compatible):

```typescript
smallLogoUrl?: string | null;
stampUrl?: string | null;       // security: reports.sign only
signatureUrl?: string | null;   // security: reports.sign only
watermarkUrl?: string | null;
letterheadBackgroundUrl?: string | null;
showStamp?: boolean;
```

Existing callers that do not set these fields are unaffected.

---

## 7. ReportRunPage Wiring (BRANDING.0 Gap Fixed)

**Before BRANDING.4:** `resolvedBranding` state was declared but never set — the `ReportPreviewHeader` and export functions never received actual branding.

**After BRANDING.4:** After a successful `runReportAction()`:
1. `runResult.resolvedTemplateId` is extracted.
2. `resolveTemplatePreview({ templateId, reportCode })` is called asynchronously.
3. `setResolvedBranding(brandingResult.data)` is called on success.
4. Same pattern applied when user manually selects a template via `handleTemplateSelected()`.

---

## 8. Letter Preview / Export Wiring

`letter-preview-dialog.tsx` — `handlePDF()` made `async` to match the now-async `exportToPDF()`. No other letter template changes (letter design is out of scope).

---

## 9. PDF / Print / Email / Schedule Wiring

### PDF (`src/lib/export/pdf.ts`)
- `exportToPDF()` is now **async** (was sync).
- `preloadBrandingImages()` pre-fetches logo, stamp, signature as base64 data URLs via `fetchImageAsDataUrl()`.
- Logo is embedded via `doc.addImage()` in the branded header bar.
- Signature image is embedded above the signatory name line.
- Stamp image is embedded at the right of the signatory area.
- All image embeds are wrapped in `try/catch` — PDF rendering continues without the image on any fetch or format error.
- `fetchImageAsDataUrl()` only accepts `https://` URLs; rejects others.

### Print (`src/lib/export/print.ts`)
- `escapeHtml()` and `escapeAttr()` helpers added — all user-controlled text is now HTML-escaped.
- `escapeAttr()` only passes through `https://` URLs (all Supabase signed URLs are https).
- Signatory block: signature `<img>` rendered above name; stamp `<img>` rendered below line (only when `showStamp` and `stampUrl` are set).
- Watermark: if `watermarkUrl` is provided, renders as a fixed `div` with background-image at 8% opacity; text watermark used as fallback.
- Letterhead background: injected as CSS `background-image` on the `body` tag.

### Excel (`src/lib/export/excel.ts` and `generate-attachment.ts`)
- Company name, address, TRN metadata already rendered in Excel header rows (unchanged).
- Image embedding in Excel is not implemented (out of scope as noted in prompt — "Images are optional. Do not overbuild.").

### Scheduled Reports (`src/server/actions/reports/schedules.ts`)
- `executeScheduleRun()` now resolves template branding using `resolveTemplateForExport()`.
- Creator's `permissionCodes` are passed — stamp/signature only included if creator has `reports.sign`.
- Branding is passed as `branding: brandingContext` in `exportOptions` for all output formats.
- Branding resolve failure is logged and swallowed — schedule delivery continues.

---

## 10. Security Details for Stamp / Signature Gating

| Path | Gate |
|---|---|
| `resolveReportBrandingProfileAssetUrls()` | `canAccessBrandingAssetUrl()` → `reports.sign` for stamp/signature types |
| `resolveTemplatePreview()` | Additional explicit `hasPermission(ctx, "reports.sign")` check before assigning `stampUrl`/`signatureUrl` |
| `resolveTemplateForExport()` (schedules) | `permissionCodes.includes("reports.sign")` before assigning `stampUrl`/`signatureUrl` |
| Legacy `bp.stamp_url` / `bp.signature_url` fallback | Also gated by `reports.sign` in both resolver functions |
| Print HTML | `escapeAttr()` — `https://` enforcement; stamp/sig only injected when `showStamp`/`showSignatory` + URL present |
| PDF | `fetchImageAsDataUrl()` — `https://` enforcement; stamp/sig pre-loaded only when `showStamp`/`showSignatory` |

Storage bucket (`erp-branding-assets`) remains **private**. No new public routes added. App-branding public proxy (`/api/branding/public/[assetType]`) unchanged and app-scope only.

---

## 11. Test Results

```
npx tsc --noEmit    → exit 0 (0 errors)
npm run build       → exit 0 (✅ clean, 0 type errors)
```

---

## 12. Known Limitations

1. **Excel image embedding** — jsPDF is not used for Excel. ExcelJS supports image embedding but requires downloading the image server-side. Not implemented to avoid overbuilding per prompt guidance.
2. **CORS for PDF image embedding** — `fetchImageAsDataUrl()` fetches signed URLs from the browser. If the Supabase storage bucket's CORS policy does not include the app origin, logo/stamp/signature images will silently fall back to text in PDF. No CORS policy change is part of this phase.
3. **Signed URL TTL** — `ExportBrandingContext` signed URLs have a TTL (default from BRANDING.1 constants). Long-running schedules that take more than the TTL to generate will see expired URLs in PDF image embeds. The fetch will fail silently and fall back to text.
4. **Watermark image in PDF** — watermark image (as distinct from text watermark) is not embedded in PDF in this phase. jsPDF background-image embedding across all pages requires per-page `addImage()` in `didDrawPage` which is complex with async pre-loading. Text watermark remains fully supported.

---

## 13. Not Implemented (Explicitly Out of Scope)

- QR public verification / `/verify/[token]`
- `erp_output_public_links` table
- Executive Ledger template renderer
- WeightTicket3 port
- Template versioning / publish workflow
- Branding approval workflow
- Module rollout (weighbridge / finance / DMS / fleet / workshop)
- Removing legacy URL columns from `erp_report_branding_profiles`
- App branding runtime changes (BRANDING.2 unchanged)

---

## 14. Next Recommended Phase

**BRANDING.5 — Executive Ledger Template Engine**

Build the Executive Ledger letterhead layout engine that uses the resolved branding context (logo, letterhead background, stamp, signature) to produce fully branded HR letters, certificates, and formal documents.
