# BRANDING.1 — Unified Branding Assets and Storage Foundation
## Implementation Report

**Phase:** BRANDING.1  
**Date:** 2026-07-04  
**Status:** CLOSED / PASS ✅  
**Prerequisite:** BRANDING.0 plan approved  
**Plan reference:** `implementation_Review/Branding/BRANDING_0_FULL_BRANDING_SYSTEM_AUDIT_ARCHITECTURE_AND_PLAN.md`

---

## 1. Executive Summary

BRANDING.1 implements the database, storage, security, and server-side foundation for unified ERP branding assets. Two new tables (`erp_app_branding_settings`, `erp_branding_assets`), a private Supabase Storage bucket (`erp-branding-assets`), four new permissions, RLS policies on tables and storage objects, TypeScript types, and server actions for app settings and asset upload/metadata management are now in place.

No UI wiring, login/sidebar changes, report PDF embedding, or QR verification was implemented — per BRANDING.1 scope.

Migration applied live via Supabase MCP. Existing URL columns on `erp_report_branding_profiles` and `owner_companies` were not modified.

---

## 2. Files Changed / Created

| File | Action |
|------|--------|
| `supabase/migrations/20260704000000_erp_branding_1_unified_assets_storage_foundation.sql` | Created |
| `src/lib/branding/types.ts` | Created |
| `src/lib/branding/constants.ts` | Created |
| `src/lib/branding/storage-paths.ts` | Created |
| `src/lib/branding/asset-permissions.ts` | Created |
| `src/lib/branding/index.ts` | Created |
| `src/server/actions/branding/app-settings.ts` | Created |
| `src/server/actions/branding/assets.ts` | Created |
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | Updated |
| `implementation_Review/Branding/BRANDING_1_UNIFIED_BRANDING_ASSETS_AND_STORAGE_FOUNDATION_IMPLEMENTATION_REPORT.md` | Created |

---

## 3. Migration

**File:** `supabase/migrations/20260704000000_erp_branding_1_unified_assets_storage_foundation.sql`  
**Applied to live DB:** ✅ via Supabase MCP (`erp_branding_1_unified_assets_storage_foundation`)

---

## 4. Tables Created

### `erp_app_branding_settings`

Tenant-global singleton app shell branding configuration.

- PK: `BIGINT GENERATED ALWAYS AS IDENTITY`
- Unique: `settings_code`
- Seeded row: `DEFAULT_APP_BRANDING` (app_name: ALGT ERP, tagline: Alliance Gulf Transport ERP)
- Soft delete via `deleted_at` / `deleted_by`
- RLS: ENABLED + FORCED

### `erp_branding_assets`

Unified metadata for app + report branding files.

- PK: `BIGINT GENERATED ALWAYS AS IDENTITY`
- Scope CHECK: `app` | `report`
- Scope/type CHECK: validates asset types per scope
- Scope FK CHECK: app requires `app_settings_id`; report requires `branding_profile_id`
- Partial unique indexes: one active asset per (app_settings_id, asset_type) and per (branding_profile_id, asset_type)
- Version chain via `version_no` + `replaced_by_asset_id`
- Soft delete preferred; hard DELETE restricted to global admin
- RLS: ENABLED + FORCED

**Asset types enforced:**

| Scope | Types |
|-------|-------|
| app | app_logo, app_logo_small, favicon, login_background, pwa_icon_192, pwa_icon_512 |
| report | report_logo, report_logo_small, stamp, signature, watermark, letterhead_background |

---

## 5. Storage Bucket Setup

| Property | Value |
|----------|-------|
| Bucket ID | `erp-branding-assets` |
| Public | **false** |
| File size limit | 10 MB (10485760 bytes) |
| Allowed MIME types | png, jpeg, jpg, webp, svg+xml, x-icon, vnd.microsoft.icon |
| Created via migration | ✅ (live verified) |

**Path convention (system-generated):**

- App: `app/settings-{id}/{asset_type}/v{version}.{ext}`
- Report: `report/company-{owner_company_id}/profile-{branding_profile_id}/{asset_type}/v{version}.{ext}`

Uploads use admin client (service role) consistent with DMS pattern; storage RLS provides defense-in-depth for authenticated direct access.

---

## 6. Permissions Seeded

| Permission | Module | Granted to |
|------------|--------|------------|
| `branding.app.view` | BRANDING | system_admin, group_admin |
| `branding.app.manage` | BRANDING | system_admin |
| `branding.assets.upload` | BRANDING | system_admin, group_admin |
| `branding.assets.approve` | BRANDING | system_admin |

Existing report permissions (`reports.view`, `reports.manage`, `reports.sign`, `reports.export`) unchanged.

---

## 7. RLS Policies Added

### Table policies

| Table | Policies |
|-------|----------|
| `erp_app_branding_settings` | select (branding.app.view OR reports.manage), insert/update (branding.app.manage), delete (global admin only) |
| `erp_branding_assets` | select (scope-aware view perms), insert/update (branding.assets.upload + scope manage), delete (global admin only) |

### Storage policies (`storage.objects`)

| Policy | Operation | Rule |
|--------|-----------|------|
| `branding_storage_select` | SELECT | App paths → branding.app.view; report non-sensitive → reports.view; stamp/signature paths → reports.sign |
| `branding_storage_insert` | INSERT | branding.assets.upload + manage permission |
| `branding_storage_update` | UPDATE | branding.assets.upload |
| `branding_storage_delete` | DELETE | branding.assets.upload or global admin |

---

## 8. Server Helpers / Actions Created

### App settings — `src/server/actions/branding/app-settings.ts`

| Action | Permission |
|--------|------------|
| `getActiveAppBrandingSettings()` | branding.app.view |
| `listAppBrandingSettings()` | branding.app.view |
| `updateAppBrandingSettings()` | branding.app.manage |

### Assets — `src/server/actions/branding/assets.ts`

| Action | Permission |
|--------|------------|
| `listBrandingAssets()` | Scope-aware view; filters stamp/signature without reports.sign |
| `getActiveBrandingAsset()` | Same as list |
| `uploadBrandingAsset(formData)` | branding.assets.upload + scope manage; auto-deactivates prior active version |
| `deactivateBrandingAsset()` | Upload permission for scope |
| `softDeleteBrandingAsset()` | Upload permission for scope |
| `getBrandingAssetSignedUrl()` | View permission; **reports.sign required for stamp/signature** |

### Library — `src/lib/branding/`

- Types: `AppBrandingSettings`, `BrandingAsset`, `BrandingAssetScope`, `BrandingAssetType`
- Constants: bucket name, MIME allowlist, max file size, sensitive asset types
- Helpers: `buildBrandingStoragePath`, `canAccessBrandingAssetUrl`, `validateScopeAndType`

---

## 9. Intentionally NOT Implemented (BRANDING.2+)

- Login screen / sidebar / favicon runtime wiring
- App branding settings UI (`/admin/settings/branding`)
- Report profile upload cards UI
- PDF/stamp/signature image embedding in exports
- QR public verification tables and routes
- Executive Ledger renderer
- Template versioning / publish workflow
- Organization sync hooks
- Changes to existing report runtime behavior

---

## 10. Test / Check Results

| Check | Result |
|-------|--------|
| Live DB: tables exist | ✅ PASS |
| Live DB: 4 permissions seeded | ✅ PASS |
| Live DB: bucket `erp-branding-assets` private | ✅ PASS |
| TypeScript (branding files) | ✅ PASS — no branding-related errors |
| TypeScript (full project) | ⚠️ Pre-existing errors in `ChatGPT/Report_Design/WeightTicket3.tsx` (prototype, not in src/) |
| ESLint (new files) | ✅ No linter issues reported |
| Build | Not re-run (no runtime/UI changes) |

---

## 11. Risks and Follow-Up for BRANDING.2

| Risk | Mitigation in BRANDING.2 |
|------|--------------------------|
| Bucket exists but no assets uploaded yet | Build upload UI cards + wire app shell |
| URL columns still canonical for report output | BRANDING.2 upload UI; BRANDING.4 resolver wiring to prefer assets |
| SVG upload XSS risk | Sanitize or disallow SVG in upload UI validation |
| group_admin has upload but not manage | Sufficient for operational uploads; manage stays with system_admin |
| Signed URL TTL 1 hour | App shell may need public proxy route for login logo (planned in BRANDING.0) |

**BRANDING.2 should implement:**

1. `/admin/settings/branding` UI
2. Asset upload cards on report branding profiles
3. Sidebar/login/favicon wiring from `getActiveAppBrandingSettings()` + signed URLs
4. Optional: migrate existing URL-based logos into first asset versions

---

*End of BRANDING.1 implementation report.*
