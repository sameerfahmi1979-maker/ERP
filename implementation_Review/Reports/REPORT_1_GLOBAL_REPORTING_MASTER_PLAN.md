# REPORT.1 — Global Reporting Master Plan

**Document Type:** Deep Implementation Master Plan (Planning Only — No Code)
**Date:** 2026-06-19
**Status:** READY FOR SAMEER REVIEW AND APPROVAL
**Preceding Audit:** `ERP_GLOBAL_REPORT_CENTER_AUDIT_AND_INTEGRATION_PLAN.md`
**Next Phase (pending approval):** REPORT.2 — Global Report Engine + Registry + Security Foundation

---

## Correction Note — 2026-06-19

This plan was corrected to align with the ALGT ERP database standard. All proposed Report Center tables must use `BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY`. UUID, SERIAL, and BIGSERIAL are not allowed for Report Center tables unless explicitly approved by Sameer. All related foreign keys must remain BIGINT-compatible with existing ERP tables.

---

## 1. Executive Summary

The ERP currently has a **partial export engine** (Phase 002E) that handles PDF, Excel, CSV, Print, and
email-via-Microsoft-Graph for simple list/table exports. It works but is incomplete:

- PDF and print footers are **hardcoded** to `"Alliance Gulf ERP - Enterprise Report"`.
- The engine is wired to only **one page** (Permissions matrix).
- There is **no report registry**, no run history, no template management.
- There is **no branding resolver** — `owner_companies.logo_url` exists but is never used in output.
- There are **no redaction rules** — sensitive fields (salary, IBAN, medical, disciplinary) can leak.
- HR.1–HR.10 have **zero export, print, or report capability**.

This plan defines exactly how to build a **Global ERP Reporting/Output Center** that:

1. Becomes the single engine for reports, PDF, print, Excel, CSV, letters, certificates, forms, and email output across the entire ERP.
2. Resolves branding automatically from `owner_company_id` — no hardcoded company names.
3. Supports unlimited future companies via configuration only.
4. Enforces permission-aware redaction server-side before any output.
5. Handles multi-company reports by requiring the user to select a template.
6. Logs every generated output for audit.
7. Is ready for HR.11 as its first consumer, and for Fleet, Inventory, Finance, etc. later.

**4 implementation phases are proposed.** HR.11 is REPORT.4, not a separate track.

---

## 2. Why Direct Implementation Is Not Approved Yet

The Global Report Center is a **platform-level decision**, not a module-level feature. Every wrong architectural choice made here will affect every future HR report, every future module report, every company letter, and every external submission the ERP ever produces.

Specific risks of implementing without a reviewed plan:

| Risk | Consequence |
|---|---|
| Branding resolver built wrong | Wrong logo/name on ALS letters; requires rework of every report |
| Template model too rigid | Cannot add Arabic/bilingual support or new company without code change |
| Redaction at the wrong layer | Sensitive payroll/medical data leaks into Excel/PDF for unauthorized users |
| Phase structure too granular | Delivery stalls; each phase leaves the engine half-usable |
| HR.11 built as a one-off | Fleet/Finance/HR all have different export patterns; engine never unifies |
| No numbering for official outputs | Salary certificates/NOCs cannot be tracked or referenced |

This plan must be reviewed and approved by Sameer before any implementation begins.

---

## 3. Current Report/Export/Print/Email Foundation Summary

### What Exists and Works

| Component | File | Status |
|---|---|---|
| Export types | `src/lib/export/export-types.ts` | Good — reusable |
| PDF export | `src/lib/export/pdf.ts` | Works, **no branding** |
| Excel export | `src/lib/export/excel.ts` | Works, **no branding** |
| CSV export | `src/lib/export/csv.ts` | Works, acceptable |
| Print export | `src/lib/export/print.ts` | Works, **no branding** |
| Attachment generation | `src/lib/export/generate-attachment.ts` | Works for email |
| Export menu component | `src/components/erp/export/erp-export-menu.tsx` | Works, used in 1 page |
| Email dialog | `src/components/erp/email/erp-send-email-dialog.tsx` | Works |
| Email server action | `src/server/actions/email.ts` (`sendExportEmail`) | Works |
| Microsoft Graph provider | `src/lib/email/providers/microsoft-graph-provider.ts` | Works |

### What Is Broken / Missing

| Gap | Impact |
|---|---|
| Hardcoded `"Alliance Gulf ERP - Enterprise Report"` in `pdf.ts` and `print.ts` | Every PDF/print is wrong for ALS |
| `// TODO: Phase 002F` comment in both files — deferred branding hook never built | |
| No `resolveReportBranding()` function | No way to auto-apply company template |
| `owner_companies.logo_url` exists but unused in any report output | |
| No report registry | Cannot list, version, or manage available reports |
| No run history | No auditability of what was exported or emailed |
| No redaction engine | Sensitive data leaks if columns are passed naively |
| No multi-company detection | Mixed ALGT+ALS reports use wrong or no branding |
| No HR reports | HR.1–HR.10 have zero output capability |
| No letter/certificate/form template system | Cannot produce NOC, salary cert, ID card |
| No official document numbering for outputs | Cannot reference HR-SC-000001 |

### Owner Company Branding Data Available Today

`owner_companies` table has:
- `legal_name_en`, `legal_name_ar` ✅
- `logo_url` ✅ (not used in output yet)
- `primary_email`, `primary_phone`, `website` ✅
- `address_line_1`, `city`, `emirate`, `country`, `po_box` ✅
- `trn`, `trade_license_no` ✅

**Missing from `owner_companies`** (needed for branding engine):
- `report_theme_primary_color` — for PDF table header color
- `report_theme_secondary_color`
- `report_footer_text_en`, `report_footer_text_ar`
- `report_signatory_name`, `report_signatory_title_en`, `report_signatory_title_ar`
- `stamp_image_url`, `signature_image_url`
- `small_logo_url` — for compact header/badge
- `watermark_url` — for confidential/draft outputs
- `arabic_name_short` — for bilingual headers
- `default_report_template_id` — FK to template (added after template table exists)
- `default_letter_template_id`

These must be added in REPORT.2 as a migration.

---

## 4. Final Global Reporting Architecture

### 4.1 Report Center Module

A new ERP module accessible at:

```
/admin/reports                   — report catalog / landing
/admin/reports/run/[reportCode]  — run a specific report
/admin/reports/templates         — manage branding profiles and templates
/admin/reports/history           — report run history
```

The Report Center is **not HR-only**. It is a platform module that all ERP modules consume. Permission `reports.view` grants access to the catalog. Individual reports check their own module permissions.

### 4.2 Report Registry

A central database catalog (`erp_report_registry`) of every available ERP report.

Each registered report is a **configuration record**, not code. It declares:
- `report_code` — unique, e.g. `HR_EMPLOYEE_LIST`, `FLEET_VEHICLE_SUMMARY`
- `module_code` — `HR`, `DMS`, `FLEET`, etc.
- `category` — `list | summary | letter | certificate | form | checklist | badge | external_submission | group_summary`
- `output_formats` — which of `pdf, excel, csv, print, email` are supported
- `required_permissions` — array of permission codes; user must have ALL to run
- `redaction_profile` — which redaction profile applies (`normal, payroll, medical, disciplinary, recruitment, dms_confidential, mixed_sensitive`)
- `branding_source_path` — where `owner_company_id` comes from in the data (e.g. `"employee.owner_company_id"`)
- `supports_numbering` — whether this output type gets an official document number
- `numbering_prefix` — e.g. `HR-SC`, `HR-NOC`
- `is_active`, `is_letter_type` (controls which renderer to use)

The report runner uses this config. The report code's **data fetcher** is a separate server action registered in code (not DB).

### 4.3 Report Runner

The central execution engine: `runReport(reportCode, filters, userId, templateId?)`.

Flow:
```
1. Load report config from erp_report_registry
2. Check permissions via getAuthContext() + hasPermission()
3. Call report-specific data fetcher (server action)
4. Apply redaction engine (server-side — data never leaves server in raw form)
5. Detect owner_company_ids in result set
6. Resolve branding template (auto or from templateId)
7. Return sanitized, redacted data + resolved template to caller
8. Caller renders to screen, PDF, Excel, CSV, Print, or Email
9. Log run to erp_report_runs
```

The runner is implemented as a server action in `src/server/actions/reports/runner.ts`.

### 4.4 Report Template Engine

Templates are declared in `erp_report_templates`. Each template references a `branding_profile_id`.

Template types:
- `report` — list/summary table layouts
- `letter` — single-page formal letter with letterhead
- `certificate` — certificate of employment, salary cert, etc.
- `form` — structured form (PPE issue, clearance form)
- `checklist` — onboarding checklist, joining checklist
- `badge` — employee ID card, site badge
- `external_submission` — ADNOC/Tawteen/MOHRE format
- `group_summary` — management dashboard snapshot

The template stores layout config (orientation, font, show_logo, show_address, show_signatory, show_watermark, watermark_text) and links to a branding profile.

A "letter" type template also has:
- `body_html_en` — HTML body template with `{{variable}}` placeholders
- `body_html_ar` — Arabic equivalent
- `body_bilingual` — both in one layout

Variable substitution happens server-side before rendering.

### 4.5 Branding Resolver

A server-side function: `resolveReportBranding(ownerCompanyId, templateId?)`.

Resolution priority (highest wins):
1. If `templateId` explicitly passed → load that template's branding profile
2. If `ownerCompanyId` matches a company with a default template → use it
3. If group/neutral template exists and is set as fallback → use it
4. Final fallback: system default (current behavior — plain text, no logo)

Returns a `ResolvedReportTemplate` object — all layout values flattened, ready to pass to any renderer. No further DB lookups needed after this call.

`ResolvedReportTemplate`:
```typescript
{
  templateId: number | null
  templateType: string
  orientation: "portrait" | "landscape"
  pageSize: "a4" | "letter"
  companyNameEn: string
  companyNameAr: string | null
  logoUrl: string | null
  smallLogoUrl: string | null
  stampUrl: string | null
  signatureUrl: string | null
  watermarkUrl: string | null
  watermarkText: string | null
  themePrimaryColor: string     // hex e.g. "#1e293b"
  themeHeaderBgColor: string
  themeHeaderTextColor: string
  addressBlockEn: string | null
  addressBlockAr: string | null
  footerTextEn: string | null
  footerTextAr: string | null
  signatoryName: string | null
  signatoryTitleEn: string | null
  signatoryTitleAr: string | null
  language: "en" | "ar" | "bilingual"
  showLogo: boolean
  showAddress: boolean
  showSignatory: boolean
  showStamp: boolean
  showWatermark: boolean
  trn: string | null
  licenseNo: string | null
}
```

### 4.6 Output Adapters

One adapter per output format. Each accepts `(data, columns, ResolvedReportTemplate, ExportOptions)`.

| Adapter | Current File | Plan |
|---|---|---|
| PDF | `src/lib/export/pdf.ts` | **Upgrade** to accept `ResolvedReportTemplate` — add logo, address, themed header, footer, signatory block |
| Print | `src/lib/export/print.ts` | **Upgrade** same as PDF |
| Excel | `src/lib/export/excel.ts` | **Upgrade** to include company name + logo (note only in metadata row; Excel doesn't support images well in SheetJS without extra lib) |
| CSV | `src/lib/export/csv.ts` | Minor — add company name to metadata row |
| Email attachment | `src/lib/export/generate-attachment.ts` | **Upgrade** to pass template through |
| Screen | React table (ERPDataTable) | No change needed; branding shown in page header only |

The adapters live in `src/lib/report-center/adapters/`. Existing files in `src/lib/export/` are deprecated wrappers that call the new adapters — kept for backward compat until all callers are migrated.

**Letter/Certificate renderer** is a new adapter:
- Accepts `ResolvedReportTemplate` + `body_html` + `variables`
- Renders variables into HTML body
- Generates PDF via Puppeteer server-side (preferred for rich letterhead) OR jsPDF with multi-line text (simpler, Phase 4 starts with jsPDF)
- Decision: use jsPDF for Phase 4 (no new dependencies). Puppeteer can be added in a later phase if richer layout is needed.

### 4.7 Redaction Engine

A server-side redaction function: `applyRedaction(data, redactionProfile, userPermissions)`.

**Redaction profiles:**

| Profile | Triggered When | Fields Redacted |
|---|---|---|
| `normal` | Default for all reports | None — all columns passed |
| `payroll` | Report has `hr.payroll.view` sensitive data | `basic_salary`, `total_salary`, all salary components, `iban`, `account_number`, `wps_*` fields |
| `medical` | Report has `hr.medical.view` sensitive data | `medical_result`, `restriction_details`, `medical_notes`, `medical_documents` |
| `disciplinary` | Report has `hr.actions.view` sensitive data | `disciplinary_description`, `hr_note_text`, `legal_notes` |
| `recruitment` | Report has candidate-sensitive data | `expected_salary`, `offer_salary`, `candidate_personal_notes` |
| `dms_confidential` | DMS documents marked confidential | `extracted_text`, `ai_summary`, `ocr_content` |
| `mixed_sensitive` | Report spans multiple sensitive categories | Combination of payroll + medical + disciplinary rules |

**Redaction actions:**
- `restrict` — replace value with `"[Restricted]"` (column stays, user sees restriction)
- `mask` — partial mask e.g. `"AE**...1234"` for IBAN (field present but not usable)
- `omit` — column completely removed from output (for note text, medical details)
- `label` — replace with safe label e.g. `"Salary Certificate Requested"` instead of showing amount

**Critical rule:** Redaction is applied **server-side in the data fetcher**, before data is returned to the client. The Report Runner re-validates redaction rules before passing data to the output adapter. Double-layer protection.

### 4.8 Report History / Audit

Every report execution creates a row in `erp_report_runs`:
- Who ran it, when, how long it took
- Report code + filters
- Owner company IDs detected
- Template selected (auto or manual)
- Output format
- Row count
- Whether sensitive data was included + redaction summary (flag only — no raw data stored)
- Whether email was sent + delivery status

Accessible via `/admin/reports/history` — gated by `reports.history.view` permission.

### 4.9 Email / Scheduled Delivery

**Phase 4 (on-demand email):** Extend existing `sendExportEmail()` to accept `template_id` for branded email body. Existing dialog (`erp-send-email-dialog.tsx`) already works.

**Phase 5 (scheduled, future):** Queue reports to `erp_email_queue` (reuse existing notification email system). Report schedules configured per-user, per-report. Not in scope until REPORT.5.

### 4.10 Future Module Plug-in Contract

For any future module (Fleet, Inventory, etc.) to add a report:

1. **Register** the report in `erp_report_registry` via migration seed (or admin UI in the future).
2. **Implement** a typed data fetcher server action: `fetchFleetVehicleListReport(filters, userPermissions): Promise<ReportDataResult>`. The fetcher handles its own DB queries and returns pre-structured, pre-redacted data.
3. **Register** the fetcher in the report runner's dispatch map: `REPORT_FETCHERS['FLEET_VEHICLE_LIST'] = fetchFleetVehicleListReport`.
4. **Declare** sensitive fields and redaction profile in the registry record.
5. **Done.** The engine handles branding, template selection, output format, email, and audit automatically.

No changes to the engine itself are needed when a new module adds reports.

---

## 5. Global Template and Branding Architecture

### 5.1 Unlimited Company Support

The branding system is built around `erp_report_branding_profiles`, not around a hardcoded list of companies. Each profile stores all branding data independently.

When a new company (e.g. `ALX`) is added to `owner_companies`:
1. Admin navigates to `/admin/reports/templates`.
2. Creates a branding profile for ALX, uploads logo, sets colors/address/signatory.
3. Creates a default report template and a default letter template linked to the ALX profile.
4. Sets these as defaults on the `owner_companies.default_report_template_id` column.
5. All reports with `owner_company_id = ALX` immediately resolve to ALX branding.

**No code change ever required to support a new company.**

Per-company branding profile supports:
```
logo_url              — full logo for PDF header
small_logo_url        — compact logo for ID cards, badges
stamp_url             — company stamp image
signature_url         — authorized signatory signature image
watermark_url         — confidential watermark image
watermark_text        — text watermark (e.g. "DRAFT", "CONFIDENTIAL")
theme_primary_color   — hex — for PDF table headers
theme_secondary_color — hex — for accents
legal_name_en         — from owner_companies (denormalized into profile for fast access)
legal_name_ar         — from owner_companies
trade_name_en         — optional short/trade name
address_block_en      — formatted address for report header
address_block_ar      — Arabic address
trn                   — for VAT invoices/compliance
trade_license_no
phone, email, website
po_box
footer_text_en, footer_text_ar
signatory_name
signatory_title_en, signatory_title_ar
```

### 5.2 Single-Company Reports

When the report runner detects all result records share one `owner_company_id`:
1. Auto-load that company's `default_report_template_id` (or `default_letter_template_id` for letters).
2. Call `resolveReportBranding(ownerCompanyId)`.
3. No dialog shown.
4. Proceed to output.

### 5.3 Multi-Company Reports

When result records contain more than one `owner_company_id`:
1. **Block** PDF/print/email generation.
2. Show `ReportTemplateSelectDialog` before proceeding.
3. Dialog presents:
   - Group / Neutral template (if configured)
   - Template for each company found in results (e.g. ALGT, ALS)
   - Any other active templates the user is allowed to see
4. User selects. Preview updates.
5. `selected_template_id` stored in `erp_report_runs.template_id`.
6. Output generated with selected template.

**This dialog cannot be skipped.** It is the architectural guard against wrong-company branding.

### 5.4 Manual Template Selection Dialog

A `ReportTemplateSelectDialog` React component:
- Triggered automatically for multi-company reports
- Can also be triggered manually via "Change Template" button on screen preview
- Shows template card: logo thumbnail, company name, last updated
- Previews the selected template in the report header

### 5.5 Template Types

| Type | Purpose | Output | Example |
|---|---|---|---|
| `report` | Tabular list/summary output | PDF, Excel, CSV, Print | Employee List, Attendance Summary |
| `letter` | Formal single-page letter | PDF, Print | NOC, Warning Letter, EOS Letter |
| `certificate` | Certificate of employment/salary | PDF, Print | Salary Certificate, Training Cert |
| `form` | Structured form with fields | PDF, Print | PPE Issue Form, Clearance Form |
| `checklist` | Item checklist | PDF, Print | Joining Checklist, Onboarding Tasks |
| `badge` | Compact card format | PDF, Print | Employee ID Card, Site Pass |
| `external_submission` | Agency-format submission | PDF, Excel | ADNOC Form, Tawteen Report |
| `group_summary` | Multi-section management summary | PDF | Monthly HR Dashboard Snapshot |

Each template type has its own HTML/layout template with `{{variable}}` placeholders. The template engine substitutes variables server-side.

### 5.6 Arabic / Bilingual Readiness

Phase 4 delivers English output only. The architecture is bilingual-ready:

- `body_html_en` and `body_html_ar` stored separately per letter template.
- PDF renderer checks `ResolvedReportTemplate.language` and picks the right body.
- Arabic text in jsPDF requires a font with Arabic support (e.g. Amiri or NotoNaskhArabic). Font must be loaded as base64 and registered.
- RTL direction: `dir="rtl"` in print HTML; jsPDF text alignment set to `right` for Arabic columns.
- Column order reversal for RTL tables.
- Bilingual layout: two-column header (EN left, AR right) or EN on top, AR below.

**Phase 4 implements EN only.** The `body_html_ar` column exists in the schema from REPORT.2 so no migration is needed when AR is added later.

### 5.7 Signature / Stamp / Signatory Controls

Official outputs (letters, certificates, forms) can include:
- `Prepared by:` — auto-filled from `generated_by` (the running user)
- `Approved by:` / `Authorized Signatory:` — from the branding profile's `signatory_name` + `signatory_title_en`
- `Signature image:` — rendered from `signature_url` (stored in Supabase Storage; served via signed URL)
- `Company stamp:` — rendered from `stamp_url`
- `Generated date/time:` — current timestamp
- `Document reference number:` — from `erp_report_runs.reference_number` (via global numbering engine)

**Permission control for stamp/signature:** A report template can declare `requires_stamp_permission: true`. If the running user lacks the `reports.sign` permission, stamp and signature images are **omitted** from output (replaced with blank lines for manual signing).

### 5.8 Template Changes Affecting All Linked Reports

Branding profiles are linked by FK from templates. Templates are linked by reference from the report registry.

When admin updates a branding profile (e.g. uploads a new ALGT logo):
- All templates that reference that branding profile `immediately` use the new logo.
- All reports that reference those templates immediately use the new logo.
- No migration, no report-by-report update, no code change.

This is the primary reason branding profiles are stored in DB, not in code or env vars.

---

## 6. Proposed Database Model

All tables use `BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY` (the ALGT ERP standard — `SERIAL` and `BIGSERIAL` are not allowed).

### 6.1 `erp_report_branding_profiles`

**Purpose:** Stores all visual/legal branding data for one company or custom profile.
**Implemented in:** REPORT.2

```sql
id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY
profile_code                TEXT UNIQUE NOT NULL
profile_name                TEXT NOT NULL
owner_company_id            BIGINT REFERENCES owner_companies(id) NULL
                            -- null = group/custom profile
logo_url                    TEXT
small_logo_url              TEXT
stamp_url                   TEXT
signature_url               TEXT
watermark_url               TEXT
watermark_text              TEXT
theme_primary_color         TEXT DEFAULT '#1e293b'
theme_secondary_color       TEXT DEFAULT '#475569'
theme_header_bg_color       TEXT DEFAULT '#1e293b'
theme_header_text_color     TEXT DEFAULT '#ffffff'
legal_name_en               TEXT NOT NULL
legal_name_ar               TEXT
trade_name_en               TEXT
address_block_en            TEXT
address_block_ar            TEXT
phone                       TEXT
email                       TEXT
website                     TEXT
po_box                      TEXT
trn                         TEXT
trade_license_no            TEXT
footer_text_en              TEXT
footer_text_ar              TEXT
signatory_name              TEXT
signatory_title_en          TEXT
signatory_title_ar          TEXT
is_default_for_company      BOOLEAN DEFAULT false
is_group_profile            BOOLEAN DEFAULT false
is_active                   BOOLEAN DEFAULT true
created_at                  TIMESTAMPTZ DEFAULT now()
updated_at                  TIMESTAMPTZ DEFAULT now()
created_by                  BIGINT REFERENCES user_profiles(id)
updated_by                  BIGINT REFERENCES user_profiles(id)
```

**RLS:** All authenticated users can SELECT active profiles. Only `reports.manage` can INSERT/UPDATE/DELETE.
**Sensitive data:** None in this table itself (logo URLs are storage paths, not sensitive values).

---

### 6.2 `erp_report_templates`

**Purpose:** Named layout templates that reference a branding profile + output configuration.
**Implemented in:** REPORT.2

```sql
id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY
template_code               TEXT UNIQUE NOT NULL
template_name               TEXT NOT NULL
template_type               TEXT NOT NULL  -- report|letter|certificate|form|checklist|badge|external_submission|group_summary
branding_profile_id         BIGINT REFERENCES erp_report_branding_profiles(id) NOT NULL
default_orientation         TEXT DEFAULT 'portrait'
page_size                   TEXT DEFAULT 'a4'
font_family                 TEXT DEFAULT 'helvetica'
language                    TEXT DEFAULT 'en'     -- en|ar|bilingual
show_logo                   BOOLEAN DEFAULT true
show_small_logo             BOOLEAN DEFAULT false
show_address                BOOLEAN DEFAULT true
show_signatory              BOOLEAN DEFAULT true
show_stamp                  BOOLEAN DEFAULT false
show_watermark              BOOLEAN DEFAULT false
requires_stamp_permission   BOOLEAN DEFAULT false
body_html_en                TEXT  -- for letter/certificate/form types; has {{variable}} placeholders
body_html_ar                TEXT  -- Arabic equivalent (nullable initially)
custom_css                  TEXT  -- optional override styles
is_active                   BOOLEAN DEFAULT true
created_at                  TIMESTAMPTZ DEFAULT now()
updated_at                  TIMESTAMPTZ DEFAULT now()
created_by                  BIGINT REFERENCES user_profiles(id)
updated_by                  BIGINT REFERENCES user_profiles(id)
```

**RLS:** All authenticated users can SELECT active templates. `reports.manage` for write.

---

### 6.3 `erp_report_registry`

**Purpose:** Central catalog of every available ERP report. One row per report code.
**Implemented in:** REPORT.2

```sql
id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY
report_code                 TEXT UNIQUE NOT NULL
report_name_en              TEXT NOT NULL
report_name_ar              TEXT
module_code                 TEXT NOT NULL
category                    TEXT NOT NULL
output_formats              TEXT[] DEFAULT '{pdf,excel,csv,print}'
default_orientation         TEXT DEFAULT 'portrait'
required_permissions        TEXT[] NOT NULL
redaction_profile           TEXT DEFAULT 'normal'
                            -- normal|payroll|medical|disciplinary|recruitment|dms_confidential|mixed_sensitive
branding_source_path        TEXT  -- e.g. 'owner_company_id', 'employees.owner_company_id'
default_template_id         BIGINT REFERENCES erp_report_templates(id)
supports_numbering          BOOLEAN DEFAULT false
numbering_prefix            TEXT   -- e.g. HR-SC, HR-NOC
supports_scheduling         BOOLEAN DEFAULT false
is_letter_type              BOOLEAN DEFAULT false  -- triggers letter renderer, not table renderer
is_active                   BOOLEAN DEFAULT true
sort_order                  INTEGER DEFAULT 0
description_en              TEXT
description_ar              TEXT
created_at                  TIMESTAMPTZ DEFAULT now()
updated_at                  TIMESTAMPTZ DEFAULT now()
```

**RLS:** All authenticated can SELECT active records. `reports.manage` for write.

---

### 6.4 `erp_report_runs`

**Purpose:** Immutable audit log of every report execution.
**Implemented in:** REPORT.2

```sql
id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY
run_reference               TEXT UNIQUE  -- e.g. RPT-2026-000001 (global numbering)
report_code                 TEXT NOT NULL
run_by                      INTEGER NOT NULL REFERENCES user_profiles(id)
filters_json                JSONB
template_id                 BIGINT REFERENCES erp_report_templates(id)
template_selected_manually  BOOLEAN DEFAULT false
output_format               TEXT NOT NULL
row_count                   INTEGER
owner_company_ids           INTEGER[]   -- which companies appeared in results
was_multi_company           BOOLEAN DEFAULT false
redaction_profile           TEXT
sensitive_data_included     BOOLEAN DEFAULT false
redaction_summary_json      JSONB  -- {redacted_fields: [...], redaction_profile: "..."}
                                    -- metadata only — NO raw sensitive values
email_sent                  BOOLEAN DEFAULT false
email_to                    TEXT[]
email_delivery_status       TEXT  -- pending|sent|failed
numbering_issued            TEXT  -- e.g. HR-SC-000001 (for letters/certs)
run_at                      TIMESTAMPTZ DEFAULT now()
duration_ms                 INTEGER
error_message               TEXT
```

**RLS:** Users can SELECT their own runs. `reports.history.view` can SELECT all. No UPDATE/DELETE.
**Sensitive data:** `redaction_summary_json` stores field names and profile only — never raw values.

---

### 6.5 `erp_report_delivery_logs`

**Purpose:** Email delivery records linked to a report run.
**Implemented in:** REPORT.2

```sql
id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY
run_id                      BIGINT NOT NULL REFERENCES erp_report_runs(id)
sent_to                     TEXT[] NOT NULL
sent_cc                     TEXT[]
sent_bcc                    TEXT[]
subject                     TEXT
attachment_format           TEXT
attachment_filename         TEXT
attachment_size_bytes       INTEGER
provider                    TEXT DEFAULT 'microsoft_graph'
success                     BOOLEAN NOT NULL
provider_response_code      TEXT
error_message               TEXT
sent_at                     TIMESTAMPTZ DEFAULT now()
```

**RLS:** Same as `erp_report_runs`. No UPDATE/DELETE.

---

### 6.6 `erp_report_saved_filters`

**Purpose:** Per-user saved filter presets for each report.
**Implemented in:** REPORT.4

```sql
id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY
report_code                 TEXT NOT NULL
user_id                     INTEGER NOT NULL REFERENCES user_profiles(id)
filter_name                 TEXT NOT NULL
filters_json                JSONB NOT NULL
is_default                  BOOLEAN DEFAULT false
created_at                  TIMESTAMPTZ DEFAULT now()
updated_at                  TIMESTAMPTZ DEFAULT now()
```

**RLS:** Users can SELECT/INSERT/UPDATE/DELETE only their own rows.

---

### 6.7 `erp_report_column_profiles`

**Purpose:** Per-user saved column visibility/ordering preferences for each report.
**Implemented in:** REPORT.4

```sql
id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY
report_code                 TEXT NOT NULL
user_id                     INTEGER NOT NULL REFERENCES user_profiles(id)
profile_name                TEXT NOT NULL
column_config_json          JSONB NOT NULL  -- [{key, visible, order, width_hint}]
is_default                  BOOLEAN DEFAULT false
created_at                  TIMESTAMPTZ DEFAULT now()
updated_at                  TIMESTAMPTZ DEFAULT now()
```

**RLS:** Users can SELECT/INSERT/UPDATE/DELETE only their own rows.

---

### 6.8 `erp_report_numbering_issued`

**Purpose:** Track issued document reference numbers for official outputs (salary certs, NOCs, etc.).
This table may not be needed if the global `global_numbering_rules` + `generate_next_reference_number` RPC is used instead.

**Decision:** Reuse the **existing global numbering engine** (`global_numbering_rules` + `generate_next_reference_number` RPC). Register numbering rules like `HR_SALARY_CERT`, `HR_NOC`, `HR_WARNING_LETTER` in the existing `global_numbering_rules` table. No new table needed for numbering.

**Numbering formats to register in REPORT.4:**
```
HR-SC-{YYYY}-{NNNNN}   Salary Certificate
HR-NOC-{YYYY}-{NNNNN}  No Objection Certificate
HR-WL-{YYYY}-{NNNNN}   Warning Letter
HR-EOS-{YYYY}-{NNNNN}  End of Service Letter
HR-CF-{YYYY}-{NNNNN}   Clearance Form
HR-PPE-{YYYY}-{NNNNN}  PPE Issue Form
```

---

### owner_companies Extension (REPORT.2 Migration)

Columns to ADD to `owner_companies` in REPORT.2:

```sql
ALTER TABLE owner_companies ADD COLUMN IF NOT EXISTS
  small_logo_url TEXT,
  stamp_url TEXT,
  signature_url TEXT,
  watermark_url TEXT,
  report_theme_primary_color TEXT,
  report_theme_secondary_color TEXT,
  report_footer_text_en TEXT,
  report_footer_text_ar TEXT,
  report_signatory_name TEXT,
  report_signatory_title_en TEXT,
  report_signatory_title_ar TEXT,
  default_report_template_id BIGINT,  -- FK added after template table is created
  default_letter_template_id BIGINT;
```

These columns allow the branding resolver to start from `owner_company_id` → `owner_companies` → `default_report_template_id` → `erp_report_templates` → `erp_report_branding_profiles` in one join chain.

---

## 7. Existing Code Reuse / Refactor Plan

| Component | Action | When |
|---|---|---|
| `src/lib/export/export-types.ts` | **Keep as-is** for now; extend with `ResolvedReportTemplate` parameter | REPORT.3 |
| `src/lib/export/pdf.ts` | **Upgrade** — add `resolvedTemplate` parameter; render logo, address, theme color, signatory, footer | REPORT.3 |
| `src/lib/export/print.ts` | **Upgrade** — same as pdf.ts | REPORT.3 |
| `src/lib/export/excel.ts` | **Upgrade** — add company name + theme to metadata rows | REPORT.3 |
| `src/lib/export/csv.ts` | **Minor upgrade** — add company name metadata row | REPORT.3 |
| `src/lib/export/generate-attachment.ts` | **Upgrade** — pass `ResolvedReportTemplate` through to pdf/excel/csv | REPORT.3 |
| `src/components/erp/export/erp-export-menu.tsx` | **Keep**; wire to report runner for module-level exports | REPORT.4 |
| `src/components/erp/email/erp-send-email-dialog.tsx` | **Keep**; extend with optional template_id | REPORT.4 |
| `src/server/actions/email.ts` (`sendExportEmail`) | **Keep**; log delivery to `erp_report_delivery_logs` | REPORT.3 |
| `src/lib/email/providers/microsoft-graph-provider.ts` | **Keep as-is** | — |
| `src/server/actions/notifications/email-queue.ts` | **Keep for notifications**; reuse for scheduled reports in REPORT.5 | REPORT.5 |
| `src/server/actions/notifications/templates.ts` | **Keep for notifications**; report email templates are separate | — |

**Backward compatibility:** Existing callers of `exportToPDF`, `exportToExcel`, etc. continue to work unchanged. The `resolvedTemplate` parameter is optional with a fallback to the current behavior. This means the Permissions page export continues to work without modification during the REPORT.2/3 upgrade.

---

## 8. Strong Phase Plan

### REPORT.2 — Global Report Engine + Registry + Security Foundation

**Objective:**
Build the database foundation and server-side report engine. No UI yet. Make the engine ready for REPORT.3 to add branding and REPORT.4 to add HR reports.

**Files/Tables:**
- Migration: create `erp_report_branding_profiles`, `erp_report_templates`, `erp_report_registry`, `erp_report_runs`, `erp_report_delivery_logs`
- Migration: extend `owner_companies` with branding columns
- Seed: create branding profiles for ALGT and ALS from existing `owner_companies` data
- Seed: create default report templates for ALGT, ALS, Group
- Seed: set `default_report_template_id` on ALGT and ALS `owner_companies` rows
- Seed: register first 3 reports in registry: `PERMISSION_MATRIX`, `HR_EMPLOYEE_LIST`, `HR_EMPLOYEE_PROFILE`
- New: `src/lib/report-center/branding-resolver.ts` — `resolveReportBranding()`
- New: `src/lib/report-center/redaction-engine.ts` — `applyRedaction()`
- New: `src/lib/report-center/report-runner.ts` — `runReport()` stub
- New: `src/server/actions/reports/registry.ts` — CRUD for registry (admin use)
- New: `src/server/actions/reports/runner.ts` — server action wrapper for `runReport()`
- New: `src/lib/report-center/types.ts` — `ResolvedReportTemplate`, `ReportDataResult`, `RedactionProfile`
- New: RLS policies for all new tables
- New: numbering rules in `global_numbering_rules` for `RPT_RUN` reference numbers

**Allowed scope:**
- Database only + lib/server action stubs
- Branding resolver and redaction engine logic
- Registry CRUD (no front-end)

**Not allowed scope:**
- UI routes/pages
- Output adapter upgrades (PDF/print/Excel — that is REPORT.3)
- HR report data fetchers (that is REPORT.4)
- Email scheduling (that is REPORT.5)

**Closure criteria:**
- Migration applies cleanly
- Branding resolver unit-testable (function returns correct template for ALGT employee)
- Redaction engine correctly omits/masks salary and IBAN fields for unauthorized user
- tsc passes, build passes

---

### REPORT.3 — Template / Branding / Output Adapter Engine

**Objective:**
Upgrade all existing output adapters (PDF, print, Excel, CSV, email attachment) to accept `ResolvedReportTemplate` and produce branded output. Build the Report Center admin UI for managing templates and branding profiles. Build the multi-company template selection dialog.

**Files/Tables:**
- Migration: create `erp_report_saved_filters`, `erp_report_column_profiles` (optional — may defer to REPORT.4)
- Upgrade: `src/lib/export/pdf.ts` — logo embedding (base64), company address block, themed table header, footer, signatory block
- Upgrade: `src/lib/export/print.ts` — same; HTML letterhead template
- Upgrade: `src/lib/export/excel.ts` — company name + theme color in metadata
- Upgrade: `src/lib/export/csv.ts` — company name metadata row
- Upgrade: `src/lib/export/generate-attachment.ts` — pass template through
- New: `src/lib/report-center/letter-renderer.ts` — jsPDF HTML letter renderer with variable substitution
- New: `src/components/report-center/report-template-select-dialog.tsx` — multi-company template picker
- New: `src/components/report-center/report-preview-header.tsx` — shows resolved template branding in preview
- New: `src/app/(protected)/admin/reports/templates/page.tsx` — list branding profiles + templates
- New: `src/app/(protected)/admin/reports/templates/[id]/page.tsx` — edit branding profile
- New: `src/features/report-center/branding-profile-form.tsx` — form for branding data + logo upload
- New: Supabase Storage bucket `report-assets` for logo/stamp/signature uploads
- Extend: `src/server/actions/email.ts` — log to `erp_report_delivery_logs` on every send

**Allowed scope:**
- Output adapter upgrades
- Template/branding admin UI
- Template selection dialog
- Report preview header

**Not allowed scope:**
- Actual HR report data (that is REPORT.4)
- Email scheduling
- Report history UI (defer to REPORT.5)

**Closure criteria:**
- Generating a PDF for ALGT employee shows ALGT logo, ALGT name, ALGT colors
- Generating a PDF for ALS employee shows ALS logo, ALS name, ALS colors
- Mixed-company PDF shows template dialog before proceeding
- Admin can upload new logo and all subsequent PDFs reflect it
- tsc passes, build passes

---

### REPORT.4 — HR.11 Reports + Letters + Forms Library

**Objective:**
Implement all HR.11 Required and Important reports using the engine built in REPORT.2/3. Wire each HR module page with a "Generate Report" or "Export" button that calls the report runner. Implement letters, certificates, and forms with official document numbering.

**Sub-scope A — Core HR Reports:**

| Report Code | Type | Format | Notes |
|---|---|---|---|
| `HR_EMPLOYEE_LIST` | report | PDF, Excel, CSV | Filters: company, branch, dept, designation, status |
| `HR_EMPLOYEE_PROFILE` | report | PDF | Single employee full profile sheet |
| `HR_COMPLIANCE_EXPIRY` | report | PDF, Excel | Document expiry, access cards, training certs |
| `HR_ATTENDANCE_SUMMARY` | report | PDF, Excel | Attendance by date range |
| `HR_LEAVE_BALANCE` | report | Excel | Leave balance by employee |
| `HR_LEAVE_REQUESTS` | report | Excel | Leave requests with status |
| `HR_WPS_READINESS` | report | PDF, Excel | WPS status — no IBAN/salary |
| `HR_ASSIGNMENT_BY_SITE` | report | PDF, Excel | Assignments + readiness |
| `HR_PRO_PROCESSES` | report | PDF, Excel | PRO process status |
| `HR_DISCIPLINARY_SUMMARY` | report | PDF | Admin only — no description text |
| `HR_CANDIDATE_PIPELINE` | report | Excel | Candidate funnel — no salary |
| `HR_REQUISITIONS` | report | Excel | Job requisition status |
| `HR_ONBOARDING_TASKS` | report | Excel | Onboarding task completion |

**Sub-scope B — Letters, Certificates, Forms:**

| Report Code | Type | Format | Numbering | Notes |
|---|---|---|---|---|
| `HR_EXPERIENCE_LETTER` | letter | PDF | HR-EL | Single employee |
| `HR_SALARY_CERT_GENERAL` | certificate | PDF | HR-SC | No exact salary |
| `HR_SALARY_CERT_WITH_AMOUNT` | certificate | PDF | HR-SC | `hr.payroll.view` required |
| `HR_NOC` | letter | PDF | HR-NOC | Standard NOC template |
| `HR_EMPLOYEE_ID_CARD` | badge | PDF | — | 85x54mm card format |
| `HR_PPE_ISSUE_FORM` | form | PDF | HR-PPE | |
| `HR_JOINING_CHECKLIST` | checklist | PDF | HR-JC | |

**Files/Tables:**
- New: `src/server/actions/reports/hr/` — one file per HR report data fetcher
- New: `src/lib/report-center/report-fetchers.ts` — dispatch map
- New: `src/lib/report-center/letter-templates/` — HTML letter body templates for EN
- New: Numbering rules in `global_numbering_rules` for HR-EL, HR-SC, HR-NOC, etc.
- New: `src/features/report-center/report-run-page.tsx` — generic report run page (filters + preview + export)
- New: `src/app/(protected)/admin/reports/run/[reportCode]/page.tsx` — route
- New: `src/app/(protected)/admin/reports/page.tsx` — report catalog
- Extend: Each HR module page (employees, compliance, time, payroll, etc.) with "Reports" dropdown
- Extend: Employee workspace form — "Generate Letter" section with letter type picker

**Allowed scope:**
- All Required + Important HR reports
- Letters and certificates listed above
- "Generate Letter" button on Employee Profile

**Not allowed scope:**
- Payroll amounts in salary cert without `hr.payroll.view` (enforced by redaction engine)
- Arabic letter templates (deferred to later)
- Scheduled reports (REPORT.5)
- Report history UI (REPORT.5)
- Fleet/Finance/other module reports

**Closure criteria:**
- All Required HR reports generate correctly with proper company branding
- Employee profile can generate NOC and Salary Certificate with correct numbering
- tsc passes, build passes

---

### REPORT.5 — Email / Scheduling / Report History / Security UAT

**Objective:**
Complete the platform: scheduled report delivery, report history UI, security/RLS audit, performance testing.

**Files/Tables:**
- Migration: `erp_report_saved_filters`, `erp_report_column_profiles` (if deferred from REPORT.3)
- New: `/admin/reports/history` — run history view per user + admin all-view
- New: Report schedule config (per user, per report, frequency, delivery)
- Extend: `erp_email_queue` (notifications system) to support scheduled report delivery
- New: Supabase Edge Function or cron: `process-scheduled-reports`
- New: Saved filter UI on each report run page
- New: Column profile UI on each report run page
- Security: Full RLS audit of all 6 report tables
- Performance: Test with 5000+ employees, validate pagination/streaming
- UAT: Verify multi-company template dialog cannot be bypassed

**Closure criteria:**
- Scheduled reports deliver on time
- Report history visible per user + admin
- RLS audit passes
- Performance acceptable (< 10s for 500-row PDF)
- tsc passes, build passes

---

## 9. HR.11 Report and Output Library

### Priority Classification

**Required (REPORT.4 Sub-scope A):**
- HR_EMPLOYEE_LIST
- HR_EMPLOYEE_PROFILE
- HR_COMPLIANCE_EXPIRY
- HR_ATTENDANCE_SUMMARY
- HR_LEAVE_BALANCE / HR_LEAVE_REQUESTS
- HR_WPS_READINESS
- HR_ASSIGNMENT_BY_SITE
- HR_PRO_PROCESSES
- HR_CANDIDATE_PIPELINE
- HR_REQUISITIONS
- HR_ONBOARDING_TASKS

**Required (REPORT.4 Sub-scope B — Letters):**
- HR_EXPERIENCE_LETTER
- HR_SALARY_CERT_GENERAL
- HR_NOC
- HR_EMPLOYEE_ID_CARD

**Important (REPORT.4 or deferred to follow-up):**
- HR_SALARY_CERT_WITH_AMOUNT (`hr.payroll.view` gated)
- HR_DISCIPLINARY_SUMMARY (admin only)
- HR_PPE_ISSUE_FORM
- HR_JOINING_CHECKLIST
- HR_COMPLIANCE_MEDICAL_REPORT (`hr.medical.view` gated)
- HR_EOS_CASES
- HR_OVERTIME_REPORT
- HR_ABSENT_LATE_SUMMARY

**Later (REPORT.5 or subsequent phase):**
- HR_PAYROLL_PROFILE_SUMMARY (strict gating)
- HR_WPS_SIF_FILE (if in scope)
- HR_WARNING_LETTER (template needed)
- HR_EOS_LETTER (template needed)
- HR_LEAVE_APPROVAL_LETTER
- HR_DASHBOARD_SNAPSHOT (group summary)
- Scheduled versions of any above

---

## 10. Future Module Plug-in Strategy

Once the engine is live (REPORT.2 + REPORT.3), any new module plugs in as follows:

**Example: Fleet Module adds `FLEET_VEHICLE_LIST` report**

Step 1 — DB (migration):
```sql
INSERT INTO erp_report_registry (
  report_code, report_name_en, module_code, category,
  output_formats, required_permissions, redaction_profile, branding_source_path
) VALUES (
  'FLEET_VEHICLE_LIST', 'Vehicle List', 'FLEET', 'report',
  '{pdf,excel,csv,print}', '{fleet.vehicles.view}', 'normal', 'owner_company_id'
);
```

Step 2 — Data fetcher (code):
```typescript
// src/server/actions/reports/fleet/vehicle-list-report.ts
export async function fetchFleetVehicleListReport(
  filters: FleetReportFilters,
  permissions: AuthContext
): Promise<ReportDataResult> {
  // DB query → apply normal redaction → return
}
```

Step 3 — Register fetcher (code):
```typescript
// src/lib/report-center/report-fetchers.ts
REPORT_FETCHERS['FLEET_VEHICLE_LIST'] = fetchFleetVehicleListReport;
```

Step 4 — Done. The engine handles branding, template, output format, email, audit.

**Future modules and their anticipated first reports:**

| Module | First Reports |
|---|---|
| Fleet | Vehicle List, Vehicle Insurance Expiry, Maintenance Due Report |
| Workshop | Open Work Orders, Job Card |
| Inventory | Stock Level Report, Low Stock Alert |
| Procurement | PO Status Report, Supplier Evaluation |
| Finance | Invoice Aging, Payment Summary |
| Projects | Project Status Report, Milestone Report |
| Transport | Trip Log, Fuel Consumption |
| Weighbridge | Daily Ticket Summary, Monthly Tonnage |
| HSE | Incident Register, Near-Miss Report, PPE Distribution |
| DMS | Expiring Documents, Confidential Document Access Log |

All of the above plug into the same engine without any core engine changes.

---

## 11. Security, Permission, and Redaction Strategy

### Permission Layers

1. **Module-level**: User must have the report's `required_permissions[]` (e.g. `hr.employees.view`) to see the report in the catalog and run it.
2. **Field-level redaction**: Applied server-side by `applyRedaction()` based on the report's `redaction_profile` and what permissions the running user actually has.
3. **Export-level**: `sendExportEmail()` checks `export.email` permission in addition to the report's module permission.
4. **Template-level**: `requires_stamp_permission` on a template gates signature/stamp rendering.
5. **History-level**: Users can see their own runs only; `reports.history.view` required to see all runs.

### Redaction Rules Matrix

| Sensitive Field Group | Permission Required to See Full Value | Without Permission |
|---|---|---|
| Salary amount / components | `hr.payroll.view` | `[Restricted]` |
| IBAN / bank account | `hr.payroll.view` | `AE**...1234` (masked) |
| Medical result / restriction | `hr.medical.view` | Column omitted from output |
| Medical notes / documents | `hr.medical.view` | Column omitted from output |
| Disciplinary description | `hr.actions.view` (admin flag) | Column omitted |
| HR note text | `hr.actions.view` (admin flag) | Column omitted |
| Candidate expected salary | `hr.recruitment.view` (admin flag) | `[Restricted]` |
| Offer salary | `hr.recruitment.view` (admin flag) | `[Restricted]` |
| DMS AI summary | `dms.ai.view` | `[Restricted]` |
| DMS extracted text | `dms.ai.view` | Column omitted |
| Document numbers | Context-sensitive | Partial mask `****1234` |

### Server-Side Redaction Guarantee

The redaction function runs:
1. **In the data fetcher** — before data is returned from the DB query
2. **In the report runner** — as a second check before data is passed to the output adapter

The output adapter (PDF/Excel/email) **never receives raw sensitive values** for users who lack the required permission. This is enforced by the type system: sensitive columns are declared as `string | RedactedValue` in `ReportDataResult`, and the renderer renders `RedactedValue` as `[Restricted]` automatically.

### Audit Trail

Every report run is logged in `erp_report_runs` with:
- `sensitive_data_included: boolean` — was any sensitive data included (user had full access)?
- `redaction_summary_json` — which fields were redacted and why (field names and profile only; no values)
- `template_selected_manually: boolean` — did the user manually override the auto-resolved template?

This allows auditing of: who accessed payroll reports, who generated NOCs, which template was applied to a mixed-company export.

---

## 12. Multi-Company Examples

### Example A — Single ALGT Employee Profile

```
User runs: HR_EMPLOYEE_PROFILE for employee Mohamed Al Farsi (owner_company_id = ALGT)

Runner detects: owner_company_ids = [ALGT]
  → Auto-resolve: ALGT default report template
  → resolveReportBranding(ALGT) returns:
      logo_url = "https://...algt-logo.png"
      legal_name_en = "Alliance Gulf Trading LLC"
      theme_primary_color = "#003366"
      footer_text_en = "Confidential — ALGT HR Department"
      signatory_name = "HR Manager"

Output PDF:
  Header: ALGT logo + legal name + address
  Table: employee data in blue-themed header
  Footer: ALGT footer text + page number
  Signatory block: HR Manager
```

### Example B — Single ALS Employee Profile

```
User runs: HR_EMPLOYEE_PROFILE for employee Fatima Al Khoury (owner_company_id = ALS)

Runner detects: owner_company_ids = [ALS]
  → Auto-resolve: ALS default report template
  → resolveReportBranding(ALS) returns ALS branding

Output PDF: ALS logo, ALS name, ALS colors
  ZERO overlap with ALGT branding
```

### Example C — Full Employee List Across Companies

```
User runs: HR_EMPLOYEE_LIST, no company filter

Runner detects: owner_company_ids = [ALGT, ALS]
  → Multi-company detected → BLOCK before export

System shows: ReportTemplateSelectDialog
  Options:
    - Group / Neutral Template (if configured)
    - ALGT Template
    - ALS Template
  User selects: Group Template

resolveReportBranding(null, groupTemplateId) returns:
  logo_url = "https://...group-logo.png"
  legal_name_en = "Alliance Group"
  theme_primary_color = "#1a1a2e"
  footer_text_en = "Confidential — Group HR"

Output PDF: Group logo, group theme, no single-company branding
erp_report_runs.template_selected_manually = true
erp_report_runs.owner_company_ids = [ALGT, ALS]
```

### Example D — Future Mixed Fleet Report

```
User runs: FLEET_VEHICLE_LIST, no company filter
Vehicles belong to ALGT, ALS, and future ALX

Runner detects: owner_company_ids = [ALGT, ALS, ALX]
  → Multi-company detected → BLOCK

ReportTemplateSelectDialog shows:
  - Group Template
  - ALGT Template
  - ALS Template
  - ALX Template ← auto-available because ALX has a branding profile configured

ALX branding was added via configuration, no code change.
```

### Example E — NOC Letter for ALGT Employee

```
User opens Employee Profile for Mohamed Al Farsi → Generate Letter → NOC

Runner:
  1. Detects owner_company_id = ALGT → auto-resolve ALGT letter template
  2. Gets next number: HR-NOC-2026-000047
  3. Substitutes variables in body_html_en:
     {{employee_name}} = Mohamed Al Farsi
     {{employee_code}} = EMP-001234
     {{joining_date}} = 2022-03-01
     {{company_name}} = Alliance Gulf Trading LLC
  4. Renders jsPDF letter: ALGT letterhead, body text, signatory block
  5. Records run in erp_report_runs.numbering_issued = "HR-NOC-2026-000047"

Output: branded NOC PDF with official number
```

---

## 13. Risks and Controls

| Risk | Likelihood | Impact | Control |
|---|---|---|---|
| Wrong company logo on a formal letter (ALGT logo on ALS NOC) | **High** (current state) | **Critical** | Multi-company detection is mandatory; auto-resolve is deterministic; template dialog cannot be bypassed |
| Payroll amounts in Excel for unauthorized user | Medium | Critical | Server-side redaction in data fetcher AND in report runner — double layer; type system enforces it |
| Medical data in PDF for unauthorized user | Medium | Critical | Same double-layer redaction; medical column is omitted entirely (not just masked) |
| Disciplinary text in report for unauthorized user | Medium | High | Column omitted from output; not just redacted — text never reaches render stage |
| IBAN visible in WPS readiness report | Low | Critical | WPS readiness report explicitly excludes IBAN/account_number in its data fetcher |
| Stamp/signature on unauthorized document | Low | Medium | `requires_stamp_permission` flag on template; enforced in letter renderer |
| New company added without branding profile | Medium | Medium | Fallback to system default (plain text, no logo) — visible immediately in preview; admin prompted to configure |
| Template changed unintentionally affecting many reports | Medium | Medium | Template edit requires `reports.manage` permission; change is immediate and auditable via run history |
| Large report causes timeout (5000+ employees) | Medium | Medium | Pagination in data fetcher; row count warning in UI; background generation for large exports (REPORT.5) |
| Hardcoded "Alliance Gulf ERP" not fully removed | High | Medium | Cursor rule created in this phase blocks any hardcoded company string; code search in REPORT.3 closure |
| Email attachment sent to wrong address | Low | High | `sendExportEmail` audit-logged; BCC to compliance address if configured; no auto-send without user confirmation |
| Report number collision on official letters | Low | High | `generate_next_reference_number` RPC uses DB-level locking; collision impossible |

---

## 14. Final Recommendation

The plan is complete and ready for review.

**Do not implement until Sameer approves this plan.**

Upon approval, the first implementation prompt should be:

```
REPORT.2 — Global Report Engine + Registry + Security Foundation
```

This phase builds the database foundation and server-side engine with no UI — a safe, reviewable starting point. REPORT.3 adds the visible branding engine. REPORT.4 adds the first real reports (HR.11). REPORT.5 completes scheduling and history.

**Total recommended phases: 4 (REPORT.2 → REPORT.3 → REPORT.4 → REPORT.5)**

No further plan documents are needed before REPORT.2 implementation begins.

---

*End of REPORT.1 — Global Reporting Master Plan*
*Date: 2026-06-19 | Status: Awaiting Sameer Review and Approval*
