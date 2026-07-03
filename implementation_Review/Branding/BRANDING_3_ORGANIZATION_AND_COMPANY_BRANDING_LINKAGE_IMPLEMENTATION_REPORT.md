# BRANDING.3 — Organization and Company Branding Linkage
## Implementation Report

**Phase:** BRANDING.3  
**Date:** 2026-07-02  
**Status:** CLOSED / PASS ✅  
**Build:** `tsc --noEmit` 0 errors · `npm run build` PASS (clean)

---

## 1. Executive Summary

BRANDING.3 delivers the company/report-branding linkage layer so that each owner company has a reliable default report branding profile, with report-scope branding assets managed through the unified branding asset foundation from BRANDING.1.

Key deliverables:
- Safe idempotent sync of organization identity fields into the linked default branding profile
- Organization workspace now shows a "Report Branding" section with profile status and asset status
- Backfill action to ensure all active owner companies have a default profile
- Branding profile list enhanced with Default / Group / Neutral badges and asset status indicators
- All previously completed BRANDING.2 report-scope upload card work is confirmed correct

---

## 2. Files Changed

### New Files
| File | Purpose |
|---|---|
| `src/features/organizations/organization-branding-section.tsx` | Organization workspace — Report Branding section UI component |
| `implementation_Review/Branding/BRANDING_3_ORGANIZATION_AND_COMPANY_BRANDING_LINKAGE_IMPLEMENTATION_REPORT.md` | This report |

### Modified Files
| File | Changes |
|---|---|
| `src/lib/report-center/company-onboarding.ts` | Added `syncReportBrandingProfileFromOrganization()` |
| `src/server/actions/organizations.ts` | Wired sync on update; added `getOrganizationBrandingProfile()`, `ensureOrgBrandingProfile()`, `backfillAllOrgBrandingProfiles()` |
| `src/features/organizations/organization-workspace-form.tsx` | Added "Report Branding" section; `authContext` prop now consumed; `canManageReportBranding` computed |
| `src/features/report-center/report-templates-page-client.tsx` | Profile list: Default/Group/Neutral badges; Asset status column (Logo/Stamp/Sig); Backfill All Companies button |

---

## 3. DB / Migration Status

No new migration required. BRANDING.1 schema (`erp_branding_assets`, `erp_report_branding_profiles`) fully supports this phase.

---

## 4. Organization/Profile Sync Behavior

**Function:** `syncReportBrandingProfileFromOrganization(ownerCompanyId)`

**Location:** `src/lib/report-center/company-onboarding.ts`

**When called:** Non-blocking fire-and-forget after every successful `updateOrganization()`.

**Fields synced (only where org value is non-null):**
- `legal_name_en` → always syncs (authoritative org identity)
- `legal_name_ar` → syncs if present
- `trade_name_en` → from `trade_name` (or `short_name` if profile has no trade name yet)
- `trn` → syncs if present
- `trade_license_no` → syncs if present
- `phone` → from `primary_phone`
- `email` → from `primary_email`
- `website` → syncs if present
- `address_block_en` → built from `address_line_1, address_line_2, city, emirate` (only if profile field was empty)
- `po_box` → syncs if present

**Safety rules:**
- Never nulls a profile field if org value is null
- `address_block_en` only synced when profile field is empty (clearly a custom branding field)
- Theme colors, signatory fields, stamps, signatures never touched
- Idempotent: safe to call multiple times

---

## 5. UI — Organization Workspace

**New section:** "Report Branding" (between Notes and Signatories in the nav)

**No default profile:** Shows amber warning banner with "Create Default Branding Profile" button (gated on `reports.manage`).

**Profile found:** Shows:
- Profile name + profile_code
- "Default for company" badge
- Asset status grid (6 assets: Logo / Small Logo / Stamp / Signature / Watermark / Letterhead BG) — green check or grey × for each
- "Manage in Templates & Branding" shortcut button → opens tab at `/admin/reports/templates`
- Refresh button

---

## 6. UI — Templates & Branding

**Profile list column improvements:**
- Profile name cell now shows inline badges: `Default`, `Group`, `Neutral`
- New `Assets` column: compact Logo / Stamp / Sig status with check/× icons; "No assets" warning if all missing
- Theme column reduced from 150→120 to accommodate

**Backfill button:**
- Visible only for `canManage` users
- Calls `backfillAllOrgBrandingProfiles()` server action
- Toast shows: `${created} created, ${skipped} already existed (${total} total companies)`
- Partial failure is reported via additional error toast

---

## 7. Security Notes

- Stamp and signature URL previews remain gated on `reports.sign` (unchanged from BRANDING.2)
- `ensureOrgBrandingProfile` and `backfillAllOrgBrandingProfiles` require `reports.manage`
- `getOrganizationBrandingProfile` requires `organizations.view`
- `syncReportBrandingProfileFromOrganization` uses admin client server-side only; never called from client
- No public bucket access; no signed URLs exposed in the org workspace branding section
- Audit log written for backfill operations

---

## 8. Build / Validation

| Check | Result |
|---|---|
| `tsc --noEmit` | PASS — 0 errors |
| `npm run build` | PASS — clean |
| Server-only boundary | Fixed: removed `hasPermission` import from client component; replaced with `authContext.permissionCodes.includes()` |

---

## 9. Known Limitations / Deferred Items

| Item | Status |
|---|---|
| Asset status in org section uses legacy `logo_url` column (not `erp_branding_assets`) | Profile table badge shows `logo_url != null`. Full `erp_branding_assets` status is shown in the org section via `getOrganizationBrandingProfile` which queries `erp_branding_assets` |
| No `watermark` asset type in upload cards yet | Deferred to BRANDING.4 |
| `letterhead_background` asset not yet in upload card definitions | Deferred to BRANDING.4 |
| Legacy `logo_url`, `stamp_url`, `signature_url` columns kept (soak period) | Per scope: "Do not remove existing URL columns yet" |
| Template default/letter template links not shown in org section | Out of scope for BRANDING.3; covered by resolver in BRANDING.4 |

---

## 10. Next Recommended Phase

**BRANDING.4 — Report Branding Runtime and Asset Upload Integration**

- Wire `resolveReportBrandingProfileAssetUrls` into the report preview and PDF renderer
- Add `watermark` and `letterhead_background` to upload card definitions
- Replace legacy `logo_url` fallbacks with new signed URL assets as primary source
- Implement runtime resolver for letter templates
