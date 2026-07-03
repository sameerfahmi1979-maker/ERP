# BRANDING.0 — Full Branding System Audit, Architecture, and Plan

**Document Type:** Planning Only (No Implementation)  
**Date:** 2026-07-02  
**Codebase:** ALGT ERP / `agt-erp`  
**Scope:** App Branding + Report/Output Branding + Assets + QR Verification + Executive Ledger Templates  
**Prerequisite Analysis:** `TEMPLATES_BRANDING_DEEP_SYSTEM_ANALYSIS_AND_RECOMMENDATIONS.md` (Report Center focus)

---

## 1. Executive Summary

ALGT ERP branding today is **split and incomplete**:

| Layer | Status |
|-------|--------|
| **App shell** (login, sidebar, favicon, title, theme) | Almost entirely **hardcoded** — "AG" initials, "Alliance Gulf Transport ERP", no favicon, no dynamic logos |
| **Report/Output branding** (profiles, templates, PDF/print/email) | **Infrastructure complete** (REPORT.2–5) but **runtime wiring partial** — URL-only assets, client branding bridge disconnected, no image embed in PDF |
| **Organization linkage** | **Partial** — `owner_company_id` on profiles exists; onboarding sync incomplete; duplicate columns on `owner_companies` |
| **Asset upload/storage** | **Missing** — no Supabase Storage bucket, no metadata table |
| **Executive Ledger output design** | **Reference only** — prototype in `ChatGPT/Report_Design/` not integrated into ERP |
| **QR public verification** | **Missing** — no public routes, no token table, middleware blocks all non-auth paths |

The user's requirement for a **unified ERP Branding Master** covering app UI, official outputs, uploaded assets, company linkage, Executive Ledger formal templates, and QR verification is **correct and necessary**. REPORT.2–5 is not wrong — it is the **report/output half** of a larger branding system that still needs an **app branding layer**, **asset storage foundation**, **QR verification subsystem**, and **Executive Ledger template engine**.

**Recommendation:** Execute **BRANDING.1 through BRANDING.9** as defined in §17, starting with asset storage + app branding settings, then wiring existing report infrastructure, then QR + Executive Ledger templates.

---

## 2. Current Implementation Analysis

### 2.1 Closed Phases (Report Center — Do Not Rebuild)

| Phase | Status | What Exists |
|-------|--------|-------------|
| REPORT.2 | CLOSED ✅ | 5 core tables + owner_companies extensions; RLS; 7 report permissions seeded |
| REPORT.3 | CLOSED ✅ | Branding resolver, export adapters, admin CRUD UI, company onboarding hook |
| REPORT.4 | CLOSED ✅ | 26 HR report/letter/form registry entries |
| REPORT.5 | CLOSED ✅ | Schedules, saved filters, email delivery, history UI |

### 2.2 What Is Complete vs Partial vs Missing

| Area | Complete | Partial | Missing |
|------|----------|---------|---------|
| DB schema for report branding | ✅ profiles, templates, registry, runs | URL columns only (no assets table) | App branding table, QR links table, asset metadata |
| Server branding resolver | ✅ `resolveReportBranding()` | ownerCompanyIds not always passed from UI | Post-fetch company detection |
| Export adapters | ✅ Text branding in PDF/print/Excel | Logo/stamp images not embedded | HTML letter render, RTL |
| Admin UI | ✅ Templates & Branding CRUD | URL text inputs for assets | Upload cards, preview |
| App shell branding | — | Env vars for email company name | Login logo, sidebar logo, favicon, theme admin |
| QR verification | — | Style guide mentions QR pattern | Public route, token table, scan logging |
| Executive Ledger templates | — | Design reference in ChatGPT folder | ERP template renderer |

---

## 3. Files / Routes / Tables / Components Inspected

### 3.1 Database Migrations

| File | Content |
|------|---------|
| `supabase/migrations/20260619130000_report_2_global_report_engine_registry_security_foundation.sql` | Core report branding schema |
| `supabase/migrations/20260619160000_report_5_email_scheduling_history_security_uat.sql` | Schedules, saved filters, column profiles |
| `supabase/migrations/20260527120000_erp_base_foundation.sql` | `owner_companies.logo_url` base |

### 3.2 Standards & Planning

| File | Role |
|------|------|
| `docs/standards/ERP_REPORT_TEMPLATE_BRANDING_STANDARD.md` | Report branding profiles, strategies, stamp rules |
| `docs/standards/ERP_GLOBAL_REPORT_CENTER_STANDARD.md` | Report Center architecture |
| `TEMPLATES_BRANDING_DEEP_SYSTEM_ANALYSIS_AND_RECOMMENDATIONS.md` | Prior deep analysis (Report Center focus) |
| `implementation_Review/Reports/ERP_GLOBAL_REPORT_CENTER_AUDIT_AND_INTEGRATION_PLAN.md` | Pre-REPORT.2 audit (historical) |
| `implementation_Review/Reports/REPORT_2_*` through `REPORT_5_*` | Closure reports |
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | Phase tracker |

### 3.3 App Shell

| File | Branding Role |
|------|---------------|
| `src/app/layout.tsx` | Hardcoded metadata title "ERP Foundation \| Alliance Gulf Transport" |
| `src/app/(auth)/layout.tsx` | Generic muted background, no logo |
| `src/features/auth/login-form.tsx` | "Sign in" card, no branding |
| `src/components/layout/app-sidebar.tsx` | Hardcoded "AG" initials + "Alliance Gulf / Transport ERP" |
| `src/components/layout/app-header.tsx` | Path-based title map, no logo |
| `src/app/globals.css` | Hardcoded CSS theme tokens (oklch neutrals) |
| `src/components/layout/theme-provider.tsx` | Light/dark toggle only |
| `src/app/(protected)/settings/page.tsx` | Placeholder — no branding settings |
| `public/` | No favicon; only SVG placeholders |

### 3.4 Report Center

| File | Role |
|------|------|
| `src/lib/report-center/branding-resolver.ts` | Server-side template/profile resolution |
| `src/lib/report-center/report-runner.ts` | Run orchestration + audit log |
| `src/lib/report-center/company-onboarding.ts` | Auto-create company profiles (incomplete sync) |
| `src/server/actions/reports/templates.ts` | CRUD + `resolveTemplatePreview()` |
| `src/features/report-center/report-run-page.tsx` | Run UI — **`resolvedBranding` never populated** |
| `src/lib/export/pdf.ts`, `print.ts`, `excel.ts` | Output adapters |
| `src/features/report-center/branding-profile-form.tsx` | Admin profile form (URL fields) |
| `src/features/report-center/template-form.tsx` | Admin template form |

### 3.5 Design References (Not Production)

| File | Role |
|------|------|
| `ChatGPT/Report_Design/WeightTicket3.tsx` | Executive Ledger weighbridge ticket prototype |
| `ChatGPT/Report_Design/EXECUTIVE_LEDGER_STYLE_GUIDE.md` | Approved formal output design system |
| `ChatGPT/CURSOR_PROMPT_BRANDING0_FULL_BRANDING_SYSTEM_PLAN_ONLY.md` | This planning prompt |

### 3.6 Public Routes

| Finding | Detail |
|---------|--------|
| Middleware | `src/middleware.ts` → `updateSession()` protects `/dashboard`, `/admin`, `/settings`, `/profile` |
| Public auth routes | `/login`, `/signup`, `/forgot-password`, etc. |
| **No public verify route** | QR verification page does not exist |
| Weight bridge prototype QR | Points to external URL `{frontend_url}/ticket/{transactionId}` — uses **database ID**, not secure token |

---

## 4. App Branding Analysis

### 4.1 Current State

| Element | Location | Current | Should Be |
|---------|----------|---------|-----------|
| Login logo | — | None | Dynamic from app branding profile |
| Login background | `(auth)/layout.tsx` | `bg-muted/30` | Configurable image or gradient |
| Login app name | login-form.tsx | "Sign in" generic | App name + tagline from settings |
| Sidebar logo (expanded) | app-sidebar.tsx L583–589 | "AG" text box | Image from app branding asset |
| Sidebar small logo (collapsed) | app-sidebar.tsx L592–594 | "AG" text box | Small logo image |
| Browser title | layout.tsx | Hardcoded | From app branding settings |
| Favicon | — | Missing | Uploaded favicon asset |
| Theme/accent colors | globals.css | Hardcoded oklch | App branding primary/secondary with CSS variable injection |
| Loading screen | — | Generic skeletons | Optional branded splash |
| Footer/contact (app) | — | None in shell | Optional footer strip from settings |
| PWA/mobile icons | — | Missing | Future: icon set from app branding |

### 4.2 Hardcoded Brand Strings (Touchpoints to Centralize)

| Location | String |
|----------|--------|
| `app-sidebar.tsx` | "Alliance Gulf", "Transport ERP", "AG" |
| `layout.tsx` | "Alliance Gulf Transport" |
| `dashboard/page.tsx` | "Alliance Gulf Transport — Live Operations Overview" |
| `change-password-required-form.tsx` | "Welcome to ALGT ERP." |
| `users.ts` (invite email) | "ALGT ERP" |
| Env fallback | `NEXT_PUBLIC_ERP_COMPANY_NAME` → "ALGT ERP" |

### 4.3 Recommendation

Create **`erp_app_branding_settings`** (singleton or versioned row) + **`erp_branding_assets`** for uploaded files. App shell components read from a server-cached branding context (similar to `ExportBrandingContext` but for UI). Admin UI at `/admin/settings/branding` or section under Settings hub.

**App branding is tenant-global** (one ERP deployment = one app shell identity). It is **separate from** per-company report branding profiles.

---

## 5. Report / Template Branding Analysis

### 5.1 What Works Today (Server)

- `erp_report_branding_profiles` CRUD via admin UI
- `erp_report_templates` linked to profiles via `branding_profile_id`
- `resolveReportBranding()` — 8-step decision tree (explicit template, fixed, none, group, manual, multi-company, single company, neutral fallback)
- `resolveTemplatePreview()` — maps DB rows to `ExportBrandingContext`
- `runReport()` — writes `resolved_branding_profile_id` to `erp_report_runs`
- Company onboarding — creates `COMPANY_{id}_DEFAULT` profile + report/letter templates (idempotent)

### 5.2 Partially Wired

| Gap | Evidence |
|-----|----------|
| Client branding not loaded | `report-run-page.tsx`: `setResolvedBranding` never called |
| ownerCompanyIds not passed | `runReportAction` call omits company IDs |
| Scheduled exports unbranded | `schedules.ts` `executeScheduleRun` — no branding in attachment options |
| Letter preview unbranded | `letter-preview-dialog.tsx` — PDF/print without branding |
| Template list not filtered | `listReportTemplatesForSelection` ignores ownerCompanyIds param |
| Logo/stamp not in PDF | `pdf.ts` — text header only; no image embed |
| body_html not rendered | Stored in DB; letters use field grid fetchers |
| reports.sign not enforced | Permission seeded; resolver/preview don't gate stamp URLs |

### 5.3 Asset Storage Today

All asset fields are **nullable TEXT URL columns** on `erp_report_branding_profiles`:
- `logo_url`, `small_logo_url`, `stamp_url`, `signature_url`, `watermark_url`

Admin forms use **free-text URL inputs**. No upload, no Supabase Storage, no signed URLs.

---

## 6. Organization / Company Linkage Analysis

### 6.1 Current Relationship

```
owner_companies
  ├── logo_url (base, org form editable)
  ├── REPORT.2 columns: small_logo_url, stamp_url, signature_url, theme, footer, signatory, default_*_template_id
  └── referenced by erp_report_branding_profiles.owner_company_id

erp_report_branding_profiles
  ├── profile_code: COMPANY_{id}_DEFAULT (per company)
  ├── is_default_for_company: true
  └── duplicate asset URL + identity fields
```

### 6.2 Onboarding Gap (`company-onboarding.ts`)

On new org create, profile is created with:
- ✅ `profile_name` from `company_name`
- ✅ phone, email, website
- ✅ default theme colors (hardcoded `#1e293b`)
- ❌ `logo_url` not copied
- ❌ legal name, TRN, trade license not copied
- ❌ No sync on org **update**

Migration seed **does** copy `logo_url` from active companies — runtime onboarding does not.

### 6.3 Canonical Source Strategy (Recommended)

| Data | Canonical Source | Consumers |
|------|------------------|-----------|
| Company legal identity (name, TRN, license, address) | `owner_companies` (+ org workspace form) | Sync **into** report branding profile |
| Report output assets (logo, stamp, signature) | `erp_branding_assets` linked to report profile | Export adapters, template renderer |
| App shell assets (login logo, favicon, sidebar) | `erp_branding_assets` linked to app settings | App layout components |
| Default templates per company | `owner_companies.default_report_template_id` / `default_letter_template_id` | Branding resolver |
| Theme colors for **reports** | `erp_report_branding_profiles` theme columns | Export adapters |
| Theme colors for **app UI** | `erp_app_branding_settings` | CSS variable injection |

**Long-term:** Deprecate duplicate URL/theme columns on `owner_companies` after soak period. Keep FK columns for default templates.

### 6.4 Branch Override (Future — Optional)

Not in schema today. Recommend nullable `branch_id` on `erp_report_branding_profiles` in BRANDING.4+ only if business confirms branch-specific letterheads.

---

## 7. Unified Asset Storage Recommendation

### 7.1 Evaluation: One Table vs Separate Tables

| Approach | Pros | Cons |
|----------|------|------|
| **Single `erp_branding_assets`** with `scope` enum | One upload pipeline, one RLS policy set, unified versioning | Slightly wider table |
| Separate app + report asset tables | Clear separation | Duplicate upload code, duplicate RLS, asset reuse harder |

**Recommendation: Single unified `erp_branding_assets` table** with scope discriminator.

### 7.2 Proposed `erp_branding_assets` Schema

| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT IDENTITY PK | |
| `asset_scope` | TEXT CHECK | `app`, `report` |
| `app_settings_id` | BIGINT FK NULL | When scope=app (singleton FK) |
| `branding_profile_id` | BIGINT FK NULL | When scope=report |
| `asset_type` | TEXT CHECK | See asset type list below |
| `storage_bucket` | TEXT | `erp-branding-assets` (private) |
| `storage_path` | TEXT | `{scope}/{owner_id}/{asset_type}/v{version}.{ext}` |
| `original_filename` | TEXT | |
| `mime_type` | TEXT | png, jpeg, webp, svg (svg sanitized) |
| `file_size_bytes` | INT | |
| `width_px`, `height_px` | INT NULL | |
| `is_active` | BOOLEAN DEFAULT true | One active per (profile, type) |
| `version_no` | INT DEFAULT 1 | |
| `replaced_by_asset_id` | BIGINT FK self NULL | Version chain |
| Audit + soft delete | | created_at, created_by, deleted_at, etc. |

**Asset types (unified enum):**

| Type | Scope | Sensitivity |
|------|-------|-------------|
| `app_logo` | app | Public-safe |
| `app_logo_small` | app | Public-safe |
| `favicon` | app | Public-safe |
| `login_background` | app | Public-safe |
| `pwa_icon_192`, `pwa_icon_512` | app | Public-safe (future) |
| `report_logo` | report | Public-safe |
| `report_logo_small` | report | Public-safe |
| `stamp` | report | **Sensitive** — requires `reports.sign` |
| `signature` | report | **Sensitive** — requires `reports.sign` |
| `watermark` | report | Medium |
| `letterhead_background` | report | Optional future |

**Rules:**
- ❌ No binary blobs in Postgres
- ✅ Supabase Storage private bucket
- ✅ Signed URLs at render time (15–60 min TTL)
- ✅ Stamp/signature never in public bucket

### 7.3 Bucket Strategy

| Bucket | Visibility | Contents |
|--------|------------|----------|
| `erp-branding-assets` | **Private** | All branding assets |
| Public app logos | Served via signed URL or CDN proxy route `/api/branding/asset/[token]` | Short-lived tokens for login/sidebar |

For app shell logos displayed on every page load, consider a **public read proxy** that validates asset is `app_logo` type only — never expose stamp/signature through this route.

---

## 8. App Branding vs Report Branding Model

```
┌─────────────────────────────────────────────────────────────┐
│                    APP BRANDING (Global)                     │
│  erp_app_branding_settings (singleton)                       │
│  ├── app_name, tagline, support_email                        │
│  ├── theme_primary, theme_accent (CSS injection)             │
│  └── assets: login_logo, sidebar_logo, favicon, login_bg      │
│  Consumed by: login, sidebar, layout metadata, emails        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│              REPORT BRANDING (Per Company / Group)           │
│  erp_report_branding_profiles                                │
│  ├── owner_company_id (company profiles)                     │
│  ├── GROUP_DEFAULT, NEUTRAL_DEFAULT (fallbacks)              │
│  ├── legal/contact/signatory text fields                     │
│  └── assets via erp_branding_assets (scope=report)           │
│  Consumed by: Report Center, PDF, print, email, letters      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    REPORT TEMPLATES                          │
│  erp_report_templates → branding_profile_id                    │
│  ├── layout flags (show_logo, show_stamp, etc.)              │
│  ├── body_html_en/ar, custom_css                             │
│  └── template_type (report, letter, certificate, ticket...)  │
│  Consumed by: branding resolver, template renderer           │
└─────────────────────────────────────────────────────────────┘
```

**Separation rules:**
- App branding **never** changes per owner company in the shell (single tenant deployment)
- Report branding **does** change per `owner_company_id`
- Group/neutral profiles for multi-company and fallback scenarios
- Templates reference report profiles, not app settings

---

## 9. Executive Ledger / Weight Bridge Output Design Review

### 9.1 Reference Sources

| File | Status |
|------|--------|
| `ChatGPT/Report_Design/WeightTicket3.tsx` | Prototype — depends on external `SettingsContext`, hardcoded logo path `/alliance-logo-3.png`, QR uses DB transaction ID |
| `ChatGPT/Report_Design/EXECUTIVE_LEDGER_STYLE_GUIDE.md` | Approved design tokens and layout patterns |

### 9.2 Executive Ledger Design Elements to Preserve

| Element | Specification |
|---------|---------------|
| Document frame | `border-[3px] border-double border-neutral-900`, A4 `max-w-[210mm]` |
| Header | Logo (80×80) + company name (22px bold) + subtitle + ISO line |
| Ticket/doc number | 24px bold, top-right |
| Direction badge | Sharp-corner outline chip (INBOUND/OUTBOUND) |
| QR code | 80×80, top-right beside doc number |
| Metadata strip | 4-column grid, 9px uppercase labels |
| Key-value rows | Dotted underline, 10px uppercase label / 12px value |
| Section headings | 10px bold uppercase tracking-[0.2em], inline border-b |
| Ledger table | Double border header, blue-700 (#1d4ed8) totals row, mono nums |
| Cancellation banner | Red border-2, centered uppercase |
| Signature block | 3-column, 48px blank line, role + name |
| Footer | Double border-top, company name uppercase, phone/email, italic timestamp |

### 9.3 Conversion to ERP Template System

**New template type:** `executive_ledger` (or reuse `external_submission` / add `ticket`)

**Template renderer component:** `ExecutiveLedgerDocumentRenderer`
- Input: `ExportBrandingContext` + `ExecutiveLedgerDocumentData` + `OutputPublicLink`
- Dynamic fields from branding profile: logo, company name, legal name, TRN, address, phone, email, stamp, signature, footer text, theme primary color
- Dynamic fields from document data: ticket/report number, metadata strip, ledger rows, parties, status, cancellation
- QR: generated from `erp_output_public_links.public_token` URL — **not** database ID

**Apply to:**

| Output Type | Executive Ledger Variant |
|-------------|-------------------------|
| Weighbridge tickets | Direct port of WeightTicket3 layout |
| HR letters/certificates | Letterhead header + body HTML + signature block |
| Finance vouchers/receipts | Ledger table for line items |
| Transport delivery notes | Metadata strip + parties + ledger |
| Report Center tabular exports | Optional Executive Ledger PDF mode vs simple table PDF |
| Certificates | Header + centered body + stamp + QR |

### 9.4 Gap from Prototype to Production

| Prototype Issue | ERP Fix |
|-----------------|---------|
| Hardcoded logo path | Resolve from `erp_branding_assets` |
| QR uses transaction ID | Use secure token from `erp_output_public_links` |
| External QR API (`api.qrserver.com`) | Generate QR server-side (qrcode library) or self-hosted |
| `getSetting()` from SettingsContext | Branding resolver + app/report settings |
| Not in ERP codebase | New template renderer in `src/lib/report-center/renderers/` |

---

## 10. QR Public Verification Architecture

### 10.1 Requirements Mapping

| Requirement | Design |
|-------------|--------|
| Every official output includes QR | Template renderer adds QR in header; registry flag `requires_public_verification` |
| Public page without login | Route `/verify/[token]` excluded from auth middleware |
| Secure random token, not DB ID | `public_token` column — 32+ byte random, URL-safe base64 |
| Status display | valid, cancelled, expired, superseded, revoked |
| Per-template access level | Column on template or registry |
| Scan logging | `erp_output_public_link_views` append-only log |

### 10.2 Proposed `erp_output_public_links`

| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT IDENTITY PK | Internal only — never in QR |
| `public_token` | TEXT UNIQUE NOT NULL | Cryptographic random, indexed |
| `output_type` | TEXT | `report_run`, `letter`, `certificate`, `ticket`, `form`, `schedule_delivery` |
| `report_code` | TEXT NULL | From registry |
| `report_run_id` | BIGINT FK NULL | Link to `erp_report_runs` |
| `owner_company_id` | BIGINT FK NULL | |
| `document_reference` | TEXT NOT NULL | Human-readable: ticket number, letter ref, report run ref |
| `access_level` | TEXT CHECK | See §10.3 |
| `status` | TEXT CHECK | `valid`, `cancelled`, `expired`, `superseded`, `revoked` |
| `public_summary_json` | JSONB | Safe fields for public display (no sensitive data) |
| `full_payload_storage_path` | TEXT NULL | Optional: archived PDF in private storage for download level |
| `expires_at` | TIMESTAMPTZ NULL | Optional expiry |
| `superseded_by_link_id` | BIGINT FK self NULL | Renewal/version chain |
| `revoked_at`, `revoked_by` | | Audit |
| `created_at`, `created_by` | | |

### 10.3 Public Access Levels

| Level | Code | Public Page Shows | Use For |
|-------|------|-------------------|---------|
| Verify only | `verify_only` | ✅ Valid / status badge + document reference + issue date | Sensitive payroll, medical |
| Summary view | `summary_view` | ✅ Above + non-sensitive summary fields | Salary certificates (amounts redacted) |
| Full view | `full_view` | ✅ Complete document metadata (no raw row data) | NOC, experience letters |
| Full + PDF download | `full_download` | ✅ Full view + download branded PDF button | Weighbridge tickets, delivery notes |
| Internal only | `internal_only` | ❌ No public link generated | Admin permission matrix, audit exports |

**Registry mapping:** Add `public_access_level` column to `erp_report_registry` (default per report type).

### 10.4 Public Route Design

```
/verify/[token]          → Public verification page (no auth)
/api/verify/[token]      → JSON API for mobile scanners (optional)
/api/verify/[token]/pdf  → Signed PDF download (full_download level only)
```

**Middleware change:** Add `/verify` and `/api/verify` to public allowlist in `updateSession()`.

**Public page UI:** Executive Ledger styled — status badge, document reference, company logo (from report profile), issue date, verification timestamp, optional summary fields. No login required. Rate-limited.

### 10.5 Scan Logging — `erp_output_public_link_views`

| Column | Type |
|--------|------|
| `id` | BIGINT PK |
| `link_id` | BIGINT FK |
| `viewed_at` | TIMESTAMPTZ |
| `ip_hash` | TEXT | Hashed IP for privacy |
| `user_agent` | TEXT |
| `referrer` | TEXT NULL |

---

## 11. Data Model Recommendations (Consolidated)

### New Tables

| Table | Phase | Purpose |
|-------|-------|---------|
| `erp_branding_assets` | BRANDING.1 | Unified uploaded asset metadata |
| `erp_app_branding_settings` | BRANDING.1 | Singleton app shell branding config |
| `erp_output_public_links` | BRANDING.6 | QR verification tokens |
| `erp_output_public_link_views` | BRANDING.6 | Scan audit log |
| `erp_report_template_versions` | BRANDING.5 | Published template snapshots (optional) |

### Extend Existing Tables

| Table | Addition | Phase |
|-------|----------|-------|
| `erp_report_templates` | `status` draft/published, `published_at`, `published_by` | BRANDING.5 |
| `erp_report_registry` | `public_access_level`, `requires_public_verification`, `executive_ledger_enabled` | BRANDING.6 |
| `erp_report_runs` | `public_link_id`, `resolved_asset_snapshot_json` | BRANDING.6 |
| `erp_report_branding_profiles` | `version_no`, `approved_by`, `approved_at`, `branch_id` NULL | BRANDING.3 |

### Deprecate (Soak Period)

| Column | Table | Replacement |
|--------|-------|-------------|
| `logo_url`, `stamp_url`, etc. | `erp_report_branding_profiles` | `erp_branding_assets` FK lookup |
| Duplicate report branding cols | `owner_companies` | Sync from profile; deprecate after BRANDING.3 |

All PKs/FKs: **BIGINT** (no UUID).

---

## 12. Runtime Flow Recommendations

### 12.1 App Shell Load

1. Server component reads `erp_app_branding_settings` + active app assets
2. Injects CSS variables for theme colors into layout
3. Passes logo URLs (signed or proxy) to sidebar/login components
4. Sets `metadata.icons` for favicon

### 12.2 Report Generation with Branding + QR

1. User runs report → `runReportAction`
2. Server: `resolveReportBranding()` → template + profile IDs
3. Server: fetch data → redaction → create run log
4. Server: create `erp_output_public_links` row if registry requires verification
5. Client: `resolveTemplatePreview({ templateId, reportCode })` → `ExportBrandingContext` + signed asset URLs
6. Client: render preview (Executive Ledger or standard header)
7. Export: PDF/print with branding + embedded QR code pointing to `/verify/{token}`
8. Email/schedule: same branding + QR in attachment

### 12.3 Public Verification Flow

1. User scans QR → `https://erp.algt.net/verify/{token}`
2. Middleware allows public access
3. Server looks up token → checks status, expiry, access level
4. Renders public page with allowed fields only
5. Logs view to `erp_output_public_link_views`
6. If `full_download`: generate/serve archived PDF via signed URL

### 12.4 Asset Upload Flow

1. Admin opens branding profile or app settings
2. Drag-drop upload → server action validates MIME/size
3. Upload to Supabase Storage private bucket
4. Create `erp_branding_assets` row; deactivate previous active asset of same type
5. Audit log entry
6. Invalidate branding cache

---

## 13. Security and Permissions Model

### 13.1 Existing Permissions (Keep)

`reports.view`, `reports.run`, `reports.manage`, `reports.email`, `reports.history.view`, `reports.export`, `reports.sign`, `reports.schedule.*`, `reports.saved_filters.manage`, `reports.column_profiles.manage`

### 13.2 New Permissions (Recommend)

| Code | Purpose |
|------|---------|
| `branding.app.view` | View app branding settings |
| `branding.app.manage` | Edit app branding settings |
| `branding.assets.upload` | Upload/replace any branding asset |
| `branding.assets.approve` | Approve official branding profile for production |
| `reports.templates.publish` | Publish template version |
| `reports.public_links.revoke` | Revoke/supersede public verification links |
| `reports.public_links.view_log` | View scan/access logs |

### 13.3 Security Rules

| Asset/Feature | Rule |
|---------------|------|
| Stamp/signature URLs | Only returned when caller has `reports.sign` |
| Public verify tokens | Unguessable 256-bit random; rate-limited endpoint |
| Public page data | Only `public_summary_json` fields — never raw sensitive rows |
| Private storage | RLS + bucket policies; no public ACL on stamp/signature |
| Signed URLs | Short TTL; audit generation |
| QR on internal reports | `internal_only` access level → no link created |
| Template HTML | Sanitize before render (XSS prevention) |
| SVG uploads | Disallow or sanitize server-side |

---

## 14. UI/UX Recommendations

### 14.1 New / Enhanced Screens

| Screen | Route | Purpose |
|--------|-------|---------|
| App Branding Settings | `/admin/settings/branding` | App name, logos, favicon, theme, login background |
| Branding Profiles (existing) | `/admin/reports/templates` | Add asset upload cards, preview, version history |
| Template Editor (enhance) | Existing dialog | Live Executive Ledger preview panel |
| Public Verification Page | `/verify/[token]` | Public status page |
| Public Link Admin | `/admin/reports/public-links` | View/revoke links, scan logs |
| Organization Branding Tab | Org workspace form | Link to default profile; sync indicator |

### 14.2 Asset Upload Card Pattern

```
┌─────────────────────────────────────┐
│  LOGO                    [Replace]  │
│  ┌─────────┐  alliance-logo.png     │
│  │ preview │  240×80 · 45 KB        │
│  └─────────┘  Uploaded 2026-07-01  │
│  ⚠ Stamp missing — required for      │
│    letters with show_stamp=true      │
└─────────────────────────────────────┘
```

### 14.3 App Shell After Branding

- Login: centered logo + app name + branded background
- Sidebar: image logo (expanded) / small logo (collapsed) — no "AG" text fallback only when asset missing
- Favicon: from uploaded asset
- Settings hub: link to App Branding + Report Branding

---

## 15. Template / Output Type Recommendations

| Template Type | Branding Assets Used | QR Level | Renderer |
|---------------|---------------------|----------|----------|
| `report` | Logo, header colors, footer, watermark | summary_view or verify_only | Standard table PDF or Executive Ledger |
| `letter` | Logo, letterhead, signatory, stamp | full_view | Executive Ledger + body HTML |
| `certificate` | Logo, stamp, signature, watermark | full_download | Executive Ledger certificate layout |
| `form` | Logo, header, footer | full_view | Executive Ledger form layout |
| `checklist` | Logo, company name | verify_only | Simple checklist PDF |
| `badge` | Small logo | internal_only | Badge card renderer |
| `external_submission` | Per government spec | varies | Custom per format |
| `group_summary` | GROUP_DEFAULT profile | summary_view | Executive Ledger |
| `ticket` (new) | Full Executive Ledger set | full_download | WeightTicket renderer |
| Email HTML | App logo + company name | N/A | Email template wrapper |
| Scheduled PDF | Same as report | Same as registry | Server-side generation |

---

## 15A. Output Channels — Branding & QR Application

| Channel | Current Branding | Target | QR |
|---------|------------------|--------|-----|
| **PDF export** | Text header only (`pdf.ts`) | Logo embed, stamp/signature, Executive Ledger frame, footer, QR bottom-right | Yes — all official outputs |
| **Print** | Mirrors PDF text header | Same as PDF via print CSS | Yes — QR prints with document |
| **Excel export** | Metadata sheet with company name | Branding profile name + legal name in header row; no images | verify_only link in metadata cell (optional) |
| **CSV export** | None | Footer comment row with verification URL | Optional URL in last row |
| **Email attachments** | Generic company name from env | Branded PDF attachment from same pipeline as manual export | QR in attachment |
| **Scheduled reports** | **Unbranded today** (`schedules.ts`) | Full branding pass before attachment generation | Per registry access level |
| **HR letters/certificates** | Field grid only; no letterhead | Executive Ledger header + body_html + stamp block | full_view or full_download |
| **Report Center tabular** | Standard table PDF | Toggle: simple table vs Executive Ledger mode per template | summary_view default |
| **Future DMS cover sheets** | N/A | Report profile linked to entity owner company | verify_only |
| **Future finance/procurement/fleet/workshop/transport** | N/A | Reuse Executive Ledger renderer + module-specific data fetchers | Per output type registry entry |

**Server-side vs client-side:** Manual exports run client-side today; scheduled and email delivery must use a **server-side branding + PDF generation path** (BRANDING.4) to avoid browser dependency.

---

## 15B. Template Governance

| Rule | Recommendation |
|------|----------------|
| **Template types** | Extend registry with `ticket`, formalize `certificate`; map each to Executive Ledger variant |
| **Versioning** | `version_no` on templates + optional `erp_report_template_versions` snapshots on publish |
| **Draft / published** | Only `published` templates selectable at run time; drafts visible in admin only |
| **Approval workflow** | `branding.assets.approve` gates profile promotion; `reports.templates.publish` gates template publish |
| **Preview** | Live Executive Ledger preview in template dialog using sample data + resolved branding |
| **HTML rendering** | Sanitized `body_html_en/ar` via dedicated letter renderer; custom_css scoped to template |
| **Output snapshot** | Store `resolved_asset_snapshot_json` + `resolved_branding_profile_id` on each run (partial today) |
| **Revoked/superseded** | Public link status cascade; cancelled tickets show red banner (WeightTicket3 pattern) |
| **Stamp/signature enforcement** | `requires_stamp_permission` on registry + `show_stamp` on template → gate asset URLs behind `reports.sign` |

---

## 16. Gap Analysis Table

| Area | Current State | Required/Future State | Gap | Risk | Phase |
|------|---------------|----------------------|-----|------|-------|
| App login branding | Generic card | Logo, name, background | No app settings | Medium | BRANDING.2 |
| Sidebar logo | Hardcoded "AG" | Uploaded image | No asset pipeline | Medium | BRANDING.2 |
| Favicon | Missing | Uploaded favicon | No file | Low | BRANDING.2 |
| App theme admin | Hardcoded CSS | Dynamic CSS vars | No settings UI | Low | BRANDING.2 |
| Asset storage | URL text fields | Supabase Storage + metadata | No table/bucket | **High** | BRANDING.1 |
| Report asset upload | URL inputs | Upload cards | No upload UI | **High** | BRANDING.2 |
| Org ↔ profile sync | Partial onboarding | Full create/update sync | Fields omitted | **High** | BRANDING.3 |
| Client branding bridge | Server only | Client ExportBrandingContext | Not wired | **High** | BRANDING.4 |
| PDF logo/stamp embed | Text only | Image embed | Renderer gap | **High** | BRANDING.4 |
| Executive Ledger renderer | Prototype only | ERP template engine | Not integrated | Medium | BRANDING.5 |
| QR verification | None | Public token page | No table/route | **High** | BRANDING.6 |
| Template versioning | version_no column | Draft/publish workflow | No workflow | Medium | BRANDING.5 |
| Template HTML render | Stored unused | Letter/certificate render | No renderer | Medium | BRANDING.5 |
| Stamp/signature security | Permission defined | Enforced in resolver | Not enforced | **Critical** | BRANDING.4 |
| Scheduled branded email | Unbranded | Branded attachments | Missing branding pass | Medium | BRANDING.4 |
| Public scan logging | None | Append-only view log | No table | Low | BRANDING.6 |
| Branch override | None | Optional | Not required yet | Low | BRANDING.8+ |

---

## 17. Risk Register

| ID | Risk | L | I | Mitigation |
|----|------|---|---|------------|
| R1 | Dual logo sources desync | H | H | BRANDING.3 canonical sync |
| R2 | Stamp/signature leaked without permission | M | **Critical** | Enforce reports.sign in resolveTemplatePreview |
| R3 | QR token guessable if poorly generated | L | H | crypto.randomBytes(32+) |
| R4 | Public page exposes sensitive data | M | **Critical** | public_summary_json allowlist only |
| R5 | SVG XSS via uploaded assets | M | H | Disallow or sanitize SVG |
| R6 | External QR API dependency (prototype) | H | M | Self-hosted QR generation |
| R7 | Executive Ledger prototype uses DB ID in QR | H | H | Token-based links only |
| R8 | App branding cache stale after upload | M | L | Cache invalidation on asset change |
| R9 | Migration breaks existing URL-based logos | M | M | Soak period; migrate URLs to assets |
| R10 | scope creep — app + report + QR in one phase | H | M | Strict phasing BRANDING.1–9 |

---

## 18. Final Phase Roadmap — BRANDING.1 to BRANDING.9

| Phase | Name | Scope | Depends On |
|-------|------|-------|------------|
| **BRANDING.0** | Audit & plan finalization | **This document** | — |
| **BRANDING.1** | Data model & storage foundation | `erp_branding_assets`, `erp_app_branding_settings`, Supabase bucket, RLS, upload server action | BRANDING.0 |
| **BRANDING.2** | App Branding UI + asset upload | `/admin/settings/branding`, sidebar/login/favicon wiring, asset upload cards on report profiles | BRANDING.1 |
| **BRANDING.3** | Organization linkage & sync | Fix onboarding; org update sync hook; deprecate plan for owner_companies duplicate cols | BRANDING.1 |
| **BRANDING.4** | Wire existing report engine | `resolveTemplatePreview` in ReportRunPage; ownerCompanyIds; PDF image embed; stamp/sign enforcement; schedules + letter preview | BRANDING.1–2 |
| **BRANDING.5** | Executive Ledger template engine | Port WeightTicket3 → `ExecutiveLedgerDocumentRenderer`; template type `ticket`; body_html render; draft/publish | BRANDING.4 |
| **BRANDING.6** | QR public verification | `erp_output_public_links`, `/verify/[token]`, scan logging, registry access levels, QR in PDF output | BRANDING.4–5 |
| **BRANDING.7** | Template governance & approval | Template versioning, branding approval workflow, asset version history UI, audit hardening | BRANDING.5–6 |
| **BRANDING.8** | Module rollout | Weighbridge tickets, finance outputs, DMS cover sheets, fleet/workshop — each consuming Executive Ledger + QR | BRANDING.5–6 |
| **BRANDING.9** | QA/UAT/Playwright | End-to-end: app branding, branded PDF, QR scan, public page, stamp permission, scheduled email | All |

---

## 19. Recommended Source of Truth Additions

Copy-ready text for `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` (add after review approval):

```md
## ERP BRANDING MASTER — PLANNED (BRANDING.0 Approved)

### Scope
Full ERP branding system covering:
1. App Branding (login, sidebar, favicon, theme, app name)
2. Report/Output Branding (profiles, templates, PDF/print/email)
3. Uploaded Branding Assets (Supabase Storage, private bucket)
4. Organization/Company Linkage (owner_companies ↔ report branding profiles)
5. Executive Ledger formal output templates (WeightTicket3 design reference)
6. QR Public Verification (secure token, no login, scan logging)
7. Template versioning, approval, permissions, audit

### Phase Status
| Phase | Status |
|-------|--------|
| BRANDING.0 | CLOSED ✅ — Plan: `implementation_Review/Branding/BRANDING_0_FULL_BRANDING_SYSTEM_AUDIT_ARCHITECTURE_AND_PLAN.md` |
| BRANDING.1 | PLANNED — Asset storage + app settings schema |
| BRANDING.2 | PLANNED — App branding UI |
| BRANDING.3 | PLANNED — Org/profile sync |
| BRANDING.4 | PLANNED — Wire report engine end-to-end |
| BRANDING.5 | PLANNED — Executive Ledger renderer |
| BRANDING.6 | PLANNED — QR public verification |
| BRANDING.7 | PLANNED — Governance & approval |
| BRANDING.8 | PLANNED — Module rollout |
| BRANDING.9 | PLANNED — QA/UAT |

### Architecture Decisions (BRANDING.0)
- Unified `erp_branding_assets` table (scope: app | report) — NOT separate asset tables
- App branding: singleton `erp_app_branding_settings` — tenant-global, NOT per owner company
- Report branding: existing `erp_report_branding_profiles` + assets — per owner company
- No binary blobs in Postgres; Supabase Storage private bucket `erp-branding-assets`
- QR: `erp_output_public_links` with cryptographic token — NEVER database ID in QR
- Public route: `/verify/[token]` — excluded from auth middleware
- Executive Ledger design: `ChatGPT/Report_Design/EXECUTIVE_LEDGER_STYLE_GUIDE.md` is approved reference
- REPORT.2–5 infrastructure is RETAINED — BRANDING phases complete and wire it, not replace it

### New Permissions (Planned)
`branding.app.view`, `branding.app.manage`, `branding.assets.upload`, `branding.assets.approve`, `reports.templates.publish`, `reports.public_links.revoke`, `reports.public_links.view_log`

### Do NOT
- Rebuild Report Center from scratch
- Store image binary in Postgres
- Use public bucket for stamp/signature
- Use database IDs in QR codes
- Hardcode company names in new output renderers
```

---

## 20. Clear Implementation Order Recommendation

**Priority 1 — Quick wins (no migration, can start immediately):**
1. Wire `resolveTemplatePreview()` into `ReportRunPage` and `LetterPreviewDialog`
2. Pass `ownerCompanyIds` from run results to branding resolver
3. Pass branding to scheduled report attachment generation

**Priority 2 — Foundation (BRANDING.1–2):**
4. Migration: `erp_branding_assets` + `erp_app_branding_settings`
5. Supabase Storage bucket + RLS
6. Upload server action + asset upload UI on branding profiles
7. App branding settings screen + sidebar/login/favicon wiring

**Priority 3 — Sync & security (BRANDING.3–4):**
8. Fix `ensureReportBrandingForOwnerCompany` to copy all identity fields
9. Org update sync hook
10. Enforce `reports.sign` for stamp/signature URLs
11. Embed logo/stamp images in PDF adapter

**Priority 4 — Formal outputs (BRANDING.5–6):**
12. Executive Ledger document renderer
13. QR public links table + `/verify/[token]` page
14. QR generation in PDF output

**Priority 5 — Governance & rollout (BRANDING.7–9):**
15. Template draft/publish workflow
16. Branding approval workflow
17. Module-specific template rollout (weighbridge, finance, etc.)
18. Full QA/UAT suite

---

## 21. Relationship to Prior Analysis

This plan **extends** (does not replace) `TEMPLATES_BRANDING_DEEP_SYSTEM_ANALYSIS_AND_RECOMMENDATIONS.md`:

| Prior Doc Focus | This Plan Adds |
|-----------------|----------------|
| Report Center tables & resolver | App branding layer, unified assets, app settings |
| URL-only asset gap | Full storage architecture + bucket strategy |
| Client wiring gaps | Same gaps + explicit BRANDING.4 wiring phase |
| BRANDING.1–7 roadmap | Expanded to BRANDING.1–9 with app branding, Executive Ledger, QR |
| — | Executive Ledger design review |
| — | QR public verification architecture |
| — | Public route & middleware requirements |

---

*End of BRANDING.0 plan. No code, schema, migrations, UI, or runtime changes were made. Source of Truth was not modified directly — see §19 for copy-ready additions.*
