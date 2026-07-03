# BRANDING.2 — App Branding Settings UI and Runtime Integration
## Implementation Report

**Phase:** BRANDING.2  
**Date:** 2026-07-04  
**Status:** CLOSED / PASS ✅  
**Depends on:** BRANDING.1 (CLOSED)  
**Plan reference:** `implementation_Review/Branding/BRANDING_0_FULL_BRANDING_SYSTEM_AUDIT_ARCHITECTURE_AND_PLAN.md`

---

## 1. Executive Summary

BRANDING.2 delivers the **App Branding** admin UI and wires tenant-global branding into the live ERP shell. Authorized admins can configure app identity settings and upload app-scoped assets (logo, small logo, favicon, login background). The login screen, sidebar, browser title, and favicon now consume dynamic branding with safe fallbacks when assets are missing.

A public read proxy serves app assets without exposing Supabase signed URLs or service-role keys to the client. SVG uploads are blocked for new app-scope assets (security hardening).

No report branding, PDF embedding, QR, or organization sync was implemented.

---

## 2. Files Changed / Created

| File | Action |
|------|--------|
| `src/lib/branding/load-runtime-app-branding.ts` | Created — server loader (React `cache()`) |
| `src/lib/branding/runtime-types.ts` | Created — client-safe runtime types |
| `src/lib/branding/public-asset-url.ts` | Created — public proxy URL helper |
| `src/lib/branding/constants.ts` | Modified — `ALLOWED_APP_BRANDING_MIME_TYPES` (no SVG) |
| `src/lib/branding/index.ts` | Modified — export runtime loader + types |
| `src/server/actions/branding/assets.ts` | Modified — app-scope MIME validation (no SVG) |
| `src/app/api/branding/public/[assetType]/route.ts` | Created — public asset proxy |
| `src/app/(protected)/admin/settings/branding/page.tsx` | Created — admin page |
| `src/features/branding/app-branding-settings-page-client.tsx` | Created — settings + asset UI |
| `src/features/branding/branding-asset-upload-card.tsx` | Created — reusable upload card |
| `src/components/branding/app-branding-theme-style.tsx` | Created — CSS variable injection |
| `src/app/layout.tsx` | Modified — dynamic `generateMetadata`, theme style |
| `src/app/(auth)/layout.tsx` | Modified — login background from branding |
| `src/app/(auth)/login/page.tsx` | Modified — server-load branding for form |
| `src/features/auth/login-form.tsx` | Modified — dynamic logo, title, subtitle |
| `src/app/(protected)/layout.tsx` | Modified — pass branding to shell |
| `src/components/layout/erp-shell.tsx` | Modified — forward `appBranding` prop |
| `src/components/layout/app-sidebar.tsx` | Modified — dynamic logos + nav link |
| `src/lib/workspace/workspace-route-registry.ts` | Modified — `/admin/settings/branding` tab |

---

## 3. Database Migrations

**None.** BRANDING.2 uses the BRANDING.1 schema as-is. SVG restriction is enforced server-side in upload actions only; existing SVG assets (if any) continue to serve via the public proxy.

---

## 4. UI Routes Added

| Route | Purpose |
|-------|---------|
| `/admin/settings/branding` | App branding settings + asset upload admin screen |

**API route (public read proxy):**

| Route | Purpose |
|-------|---------|
| `/api/branding/public/[assetType]` | Stream active app asset (app_logo, app_logo_small, favicon, login_background, pwa icons) |

---

## 5. Permissions Used

| Permission | Usage |
|------------|-------|
| `branding.app.view` | View settings page and app assets list |
| `branding.app.manage` | Edit settings fields |
| `branding.assets.upload` | Upload/replace/deactivate app assets (requires manage) |
| `reports.manage` | Alternate view access (consistent with BRANDING.1 RLS) |

Sidebar link visible when user has `branding.app.view`, `branding.app.manage`, or `reports.manage`.

---

## 6. Runtime Branding Flow

```
Server request
  └─ loadRuntimeAppBranding() [admin client, React cache()]
       ├─ Read erp_app_branding_settings (DEFAULT_APP_BRANDING)
       ├─ Read active erp_branding_assets (scope=app)
       └─ Build RuntimeAppBranding with public proxy URLs

Consumers:
  ├─ Root layout → generateMetadata (title, favicon)
  ├─ Root layout → AppBrandingThemeStyle (CSS vars)
  ├─ Auth layout → login background image
  ├─ Login page/form → logo, title, subtitle
  └─ Protected layout → ErpShell → AppSidebar logos + titles

Asset display:
  Browser/img src → /api/branding/public/{assetType}?v={version}
  API route → admin storage.download → stream bytes (Cache-Control: public, 1h)
```

---

## 7. Asset Handling / Security Notes

- **Private bucket retained** — `erp-branding-assets` stays non-public.
- **No service-role on client** — uploads via server actions; display via public proxy route (server-side admin download).
- **No DB IDs in URLs** — URLs use asset type slug only (`/api/branding/public/app_logo`).
- **App-scope only on public route** — report/stamp/signature types rejected with 404.
- **Audit** — setting updates and asset uploads/deactivations continue to use BRANDING.1 audit logging.
- **Signed URLs not embedded in HTML** — avoids short-TTL broken images in `<head>` favicon.

---

## 8. SVG Decision and Enforcement

| Rule | Implementation |
|------|----------------|
| New app uploads | **SVG rejected** in `uploadBrandingAsset()` when `assetScope === "app"` |
| Allowed app MIME types | PNG, JPEG, WebP, ICO (`ALLOWED_APP_BRANDING_MIME_TYPES`) |
| Report scope | SVG still allowed in `ALLOWED_BRANDING_MIME_TYPES` for soak (report upload UI = BRANDING.3+) |
| Existing SVG assets | Served normally if already stored; no migration to remove bucket SVG allowlist |

---

## 9. Testing Results

| Check | Result |
|-------|--------|
| TypeScript (`npx tsc --noEmit`) | ✅ PASS for all BRANDING.2 files |
| Pre-existing errors | ⚠️ `ChatGPT/Report_Design/WeightTicket3.tsx` (prototype, unrelated) |
| ESLint (changed files) | ✅ No new issues |
| Production build | Not re-run (no request; dynamic root layout may increase SSR work) |

### Manual UAT Checklist

1. **Login fallback** — Visit `/login` without uploaded logo → initials + "ALGT ERP" / configured app name.
2. **Branding settings** — `/admin/settings/branding` loads for user with `branding.app.view`.
3. **Upload app logo** — Upload PNG → sidebar + login show logo after refresh.
4. **Sidebar collapsed** — Collapse sidebar → small logo or fallback initials.
5. **Permission denied** — User without branding permissions → sidebar link hidden; direct URL → `/access-denied`.
6. **SVG rejection** — Attempt SVG upload on app asset card → error toast.
7. **Favicon** — Upload ICO/PNG favicon → browser tab icon updates (may require hard refresh).

---

## 10. Known Limitations / Deferred Items

| Item | Notes |
|------|-------|
| Theme colors → shadcn primary | CSS vars `--branding-primary` injected; full shadcn token mapping deferred |
| PWA icons UI | Types supported in DB/proxy; upload cards not shown (optional types omitted from admin grid) |
| Report profile upload cards | BRANDING.3+ |
| Organization sync | BRANDING.3 |
| Report PDF / stamp rendering | BRANDING.4 |
| Public login asset CDN caching | 1h cache on proxy; no CDN layer yet |

---

## 11. Next Recommended Phase

**BRANDING.3 — Organization and Company Branding Linkage**

- Fix `ensureReportBrandingForOwnerCompany` sync on create/update
- Report branding profile upload cards (report-scope assets)
- Deprecation plan for duplicate URL columns on `owner_companies`

---

*End of BRANDING.2 implementation report.*
