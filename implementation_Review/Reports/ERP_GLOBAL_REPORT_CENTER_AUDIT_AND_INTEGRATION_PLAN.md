# ERP Global Report Center — Full App Audit and Integration Plan

**Document Type:** Audit and Integration Plan (Planning Only — No Implementation)
**Date:** 2026-06-19
**Status:** READY FOR REVIEW
**Next Phase:** REPORT.1 — Global Report Engine Foundation

---

## 1. Executive Summary

The ERP already has a **partial export engine** (Phase 002E.2 / 002E.3) that handles PDF, Excel, CSV, Print, and email-via-Microsoft-Graph for simple list/table exports. This engine is currently used only in the Permissions admin page and the ERP Data Table component.

However, the engine has critical gaps:

1. **No company branding** — PDF/print footers are hardcoded to `"Alliance Gulf ERP - Enterprise Report"`. No logo, no letterhead, no company color, no address block.
2. **No report registry** — reports are ad-hoc. No central list of available reports, no versioning, no run history.
3. **No template system** — same generic layout for every module, every company.
4. **No permission-aware redaction** — the export engine exports whatever columns it is given; it does not apply permission redaction rules internally.
5. **No multi-company resolution** — when a report spans ALGT + ALS records, no logic asks the user which template to apply.
6. **No sensitive-data rules** — payroll amounts, IBAN, medical results, disciplinary descriptions are not blocked at the export layer.
7. **No HR report library** — HR.1–HR.10 has no reports, no employee letter templates, no salary certificates, no NOCs, no leave summaries.
8. **No report center route** — `/admin/reports` does not exist.

The recommendation is to build a **Global Report Center** as a standalone ERP module (not HR-only) before implementing HR.11, so that HR.11 becomes the first module to consume the production-ready engine — making the engine genuinely reusable for all future modules.

---

## 2. Current App Report / Export / Print / Email Inventory

### 2.1 Existing Report-Related Routes

| Route | Module | Report Capability |
|---|---|---|
| `/admin/permissions` | Admin | Permission matrix — ERPExportMenu (PDF/Excel/CSV/Print/Email) |
| _All HR routes_ | HR.1–HR.10 | **None** — no export/print/report actions implemented |
| _All DMS routes_ | DMS | Document download (Supabase Storage signed URL) — not a report |
| _All master-data routes_ | Party, Banks, Branches | ERPDataTable has `columns` passed but ERPExportMenu not wired on most |
| `/admin/users` | Users | No export |
| `/admin/roles` | Roles | No export |
| `/admin/notifications` | Notifications | No export |
| _Common AI pages_ | AI | No export |

**Summary:** Only the Permissions admin page has a working ERPExportMenu. All HR module pages (HR.1–HR.10) have zero export, print, or report capability.

### 2.2 Existing Export-Related Components

| File | Phase | What it Does |
|---|---|---|
| `src/components/erp/export/erp-export-menu.tsx` | 002E.2 / 002E.3D | Dropdown: Print / PDF / Excel / CSV / Send Email. Generic, data-driven. |
| `src/components/erp/email/erp-send-email-dialog.tsx` | 002E.3D | Dialog to compose email with attachment (PDF/Excel/CSV) |
| `src/components/erp/email/email-recipient-input.tsx` | 002E.3D | Email address input with validation |
| `src/components/erp/email/email-attachment-preview.tsx` | 002E.3D | Attachment type selector preview |
| `src/components/erp/table/erp-data-table.tsx` | — | Generic table with `columns` prop; supports ERPExportMenu in theory |

### 2.3 Existing PDF/Print Utilities

| File | Phase | What it Does |
|---|---|---|
| `src/lib/export/pdf.ts` | 002E.2 | `exportToPDF()` — jsPDF + jspdf-autotable, A4, generic layout |
| `src/lib/export/print.ts` | 002E.2 | `exportToPrint()` — window.open + HTML print, generic layout |
| `src/lib/export/generate-attachment.ts` | 002E.3B | `generatePDFAttachment()` — same as PDF but returns base64 for email |

**Known gaps in PDF/Print:**
- Hardcoded footer: `"Alliance Gulf ERP - Enterprise Report"` (both `pdf.ts` and `print.ts`)
- `// TODO: Phase 002F will connect this template to App Settings and selected company letterhead` — comment in both files confirms the branding hook was deferred
- No logo rendering
- No company address/legal name in header
- No signatory block
- No Arabic RTL support
- No portrait-only or landscape-only control per report type
- No watermark/confidential marker for sensitive reports

### 2.4 Existing Excel/CSV Utilities

| File | Phase | What it Does |
|---|---|---|
| `src/lib/export/excel.ts` | 002E.2 | `exportToExcel()` — SheetJS (xlsx), metadata rows + data rows |
| `src/lib/export/csv.ts` | 002E.2 | `exportToCSV()` — plain CSV with BOM for Arabic support |

**Known gaps in Excel/CSV:**
- No branding / no company name in header metadata
- No per-column type formatting (dates, currency, percentages)
- No frozen header row
- No column grouping / multi-sheet support
- No redaction rules

### 2.5 Existing Email/Send/Report Delivery Utilities

| File | Phase | What it Does |
|---|---|---|
| `src/lib/email/email-provider.ts` | 002E.3A | `EmailProvider` interface |
| `src/lib/email/providers/microsoft-graph-provider.ts` | 002E.3A | Microsoft Graph sendMail implementation |
| `src/lib/email/providers/factory.ts` | 002E.3A | Factory to get provider by config |
| `src/lib/email/microsoft-graph-config.ts` | 002E.3A | Config loader from `erp_ai_provider_configs` or env |
| `src/lib/email/attachment-utils.ts` | 002E.3A | Attachment size/type helpers |
| `src/lib/email/email-validation.ts` | 002E.3A | Email address validation, deduplication |
| `src/lib/email/vault.ts` | 002E.3A | Secret loading for Graph client secret |
| `src/server/actions/email.ts` | 002E.3D | `sendExportEmail()` server action — RBAC + audit + Microsoft Graph |
| `src/server/actions/notifications/email-queue.ts` | NOTIF.1 | Separate notification email queue (different from export emails) |
| `src/server/actions/notifications/templates.ts` | NOTIF.1 | Notification templates (not report templates) |

**Key distinction:** The email export system (002E.3D) is **separate from** the notification email queue (NOTIF.1). Export emails are on-demand; notification emails are queued/scheduled. The Report Center must bridge both channels.

### 2.6 Existing Templates/Letterhead/Branding Files

| File | What Exists |
|---|---|
| `src/types/database.ts` — `owner_companies` | `logo_url` — company logo URL is in the DB; no `theme_color`, `primary_color`, `letterhead_template_id`, `report_footer` |
| `src/server/actions/organizations.ts` | `logo_url` is read/writable |
| `src/lib/export/pdf.ts` | Hardcoded `"Alliance Gulf ERP - Enterprise Report"` footer — **no branding resolver** |
| `src/lib/export/print.ts` | Same hardcoded footer |
| `src/uiux_prototypes/002E/` | Prototypes exist: `export-email-prototype.tsx`, `app-settings-prototype.tsx`, `drawer-form-prototype.tsx` — contain branding placeholder concepts |

**Summary of branding gap:**
- `owner_companies.logo_url` exists but is not used in any report output
- No `theme_color`, `primary_color`, `letterhead_url`, `address_block`, `signatory_name`, `signatory_title` fields on `owner_companies`
- No `erp_report_templates` table exists
- No branding resolver function exists anywhere in the codebase
- The 002F TODO comment in pdf.ts and print.ts has never been implemented

### 2.7 Existing Gaps and Duplications

| Gap | Impact |
|---|---|
| Branding hardcoded | Every PDF/print says "Alliance Gulf ERP" — wrong for ALS records |
| No report registry | Cannot list available reports, no central control |
| No permission redaction at export layer | Caller must pre-filter; risk of accidental sensitive column export |
| No multi-company template selection | Mixed-company reports have undefined branding |
| No sensitive field rules | Payroll, medical, disciplinary, IBAN can leak if columns are passed naively |
| No HR reports at all | HR.1–HR.10 have zero report output capability |
| ERPExportMenu used in only 1 page | Significant underutilization of existing infrastructure |
| Two email systems | Export email (002E.3D) and notification queue (NOTIF.1) are separate; no unified delivery layer |

---

## 3. Current Module-by-Module Findings

### Admin (Users, Roles, Permissions)

- **Permissions page**: has `ERPExportMenu` for permission matrix export. Columns include permission code, name, description, module. **No sensitive data.** Works as-is.
- **Users page**: no export. Could easily adopt `ERPExportMenu` for user list (name, email, role, status). Sensitive field risk: email must be considered.
- **Roles page**: no export. Non-sensitive.

**Report Center readiness:** Low — needs routing into report registry but no complex requirements.

### Organizations / Branches

- **Organizations**: no export. `owner_companies` table has `logo_url` — this is the primary branding source.
- **Branches**: no export.
- **Critical finding**: `owner_companies` needs additional columns to support the Report Center branding engine: `theme_color`, `letterhead_url`, `address_line_for_report`, `report_footer_text`, `report_signatory_name`, `report_signatory_title`. These should be added in REPORT.2.

### Common Master Data (Parties, Banks, Finance Basics)

- No export anywhere.
- Party Master has a detailed profile with customer category, bank details — some fields are potentially sensitive (IBAN in `party_bank_details`).

### DMS

- Documents are downloaded via Supabase Storage signed URLs — not a report.
- DMS has no report-style output (no list export, no batch document report).
- DMS AI summaries are sensitive — must not be exported without `dms.ai.view` permission.
- DMS confidential documents should be watermarked in any report output.

### Notifications / Email

- Notification email queue exists in DB (`erp_notifications`, `erp_email_queue`).
- These are transactional notification emails — separate from report delivery.
- Report scheduled delivery (HR.11 or REPORT.5) must use the same Microsoft Graph email provider but may queue via the notification email queue for reliability.

### Common AI

- AI pages (DMS intelligence, compliance checker, risk scoring, duplicate detection, audit trail explainer, search, assistant): no export.
- AI suggestion results — not exportable in current design.
- AI audit trail results on specific records — potential future export candidate.

### HR.1–HR.10

**Zero export/print/report capability across all phases.**

| Module | Current Export | Expected HR.11 Reports |
|---|---|---|
| HR.1 Settings | None | — |
| HR.2 Employees | None | Employee List, Employee Profile Sheet, Employee ID Card |
| HR.3 Compliance | None | Expiry Report, Document Status Report, Medical Report (gated) |
| HR.4 Time | None | Attendance Summary, Leave Balance Report, Overtime Report |
| HR.5 Payroll | None | WPS Readiness Report, Payroll Summary (gated — no IBAN/amounts in standard) |
| HR.6 Operations | None | Assignment Report, Readiness Status Report |
| HR.7 HR Actions | None | PRO Process Report, Disciplinary Summary (gated), EOS Report |
| HR.8 Recruitment | None | Candidate Pipeline Report, Offer Status Report |
| HR.9 Dashboard | None | Dashboard snapshot (later) |
| HR.10 Search | None | Export search results (later) |

### Future Modules (Placeholder Findings)

| Module | Future Report Needs |
|---|---|
| Fleet | Vehicle list, maintenance history, insurance expiry |
| Workshop | Work order summary, cost report |
| Inventory | Stock level, movement history, valuation |
| Procurement | PO list, supplier evaluation, approval status |
| Finance | Invoice aging, payment summary, GL extract |
| Projects | Project status, milestone report |
| Transport | Trip log, fuel consumption |
| Weighbridge | Ticket summary, daily totals |
| HSE | Incident report, near-miss summary, compliance matrix |
| Scrap/Waste | Disposal log, certificate |

All of these need the **same Report Center** — owner_company_id branding, permission redaction, output formats, email delivery.

---

## 4. Required Global Report Center Architecture

### 4.1 Report Registry

A central database of all available reports in the ERP.

Each registered report has:
- `report_code` (unique, e.g. `HR_EMPLOYEE_LIST`, `HR_PAYROLL_WPS_READINESS`)
- `report_name_en`, `report_name_ar`
- `module_code` (e.g. `HR`, `DMS`, `FLEET`)
- `category` (e.g. `list`, `summary`, `letter`, `certificate`, `compliance`)
- `output_formats` (array: `pdf`, `excel`, `csv`, `print`, `email`)
- `default_orientation` (`portrait` / `landscape`)
- `required_permissions` (array of permission codes)
- `sensitive_fields` (array of field names that require redaction)
- `branding_source` (`owner_company_id` from filter / record / manual selection)
- `is_active` (boolean)
- `description`

### 4.2 Report Runner

The execution engine that:
1. Accepts `report_code` + filter input
2. Validates user permissions
3. Calls the report's data fetcher (server action)
4. Applies the redaction engine
5. Resolves branding (company context)
6. Renders output format
7. Logs the run to `erp_report_runs`

### 4.3 Report Filter Engine

A standard filter schema per report, declared in the registry:
- Dropdown filters (company, branch, department, designation, site)
- Date range filters
- Status filters
- Free-text search
- Multi-select

Filters are persisted as saved filter profiles per user/report.

### 4.4 Report Column Engine

A declarative column system (extending the existing `ERPExportColumn`):
- Column visibility toggles
- Column ordering
- Column data type (text, number, date, currency, boolean, masked)
- Sensitive flag per column
- Column width/wrap hint for PDF

Saved as column profiles per user/report.

### 4.5 Report Permission Engine

For each report run:
1. Check user has all `required_permissions` from the registry.
2. Per-column: check if column is `sensitive` and if user has the corresponding sensitive permission.
3. If user lacks sensitive permission: **redact** the column (replace with `[Restricted]`), not remove — so report layout is preserved.

### 4.6 Sensitive-Data Redaction Engine

A declarative redaction rule set, applied at the report data layer (server-side, never client-side):

| Sensitive Category | Fields | Required Permission | Redaction |
|---|---|---|---|
| Payroll amounts | `basic_salary`, `total_salary`, all component amounts | `hr.payroll.view` | Replace with `[Restricted]` |
| IBAN / bank account | `iban`, `account_number` | `hr.payroll.view` | Mask: `AE**...1234` |
| Medical results | `medical_result`, `restriction_details`, `medical_notes` | `hr.medical.view` | Replace with `[Restricted]` |
| Disciplinary text | `disciplinary_description`, `hr_note_text` | `hr.actions.view` (admin level) | Omit from output |
| Candidate salary | `candidate_expected_salary`, `offer_salary` | `hr.recruitment.view` (admin) | Replace with `[Restricted]` |
| DMS AI summaries | `ai_summary`, `extracted_text` | `dms.ai.view` | Replace with `[Restricted]` |
| Document numbers | `id_number`, `policy_number`, `card_number` | Context-sensitive | Mask: `**...1234` |

**Rule:** Redaction runs on the server before data leaves the server action. The export engine never sees raw sensitive values unless user is authorized.

### 4.7 Output Renderer

A pluggable renderer per format:

| Format | Library | Current Status | Gap |
|---|---|---|---|
| PDF | jsPDF + jspdf-autotable | Exists (`pdf.ts`) | No branding, hardcoded footer |
| Excel | SheetJS (xlsx) | Exists (`excel.ts`) | No branding, no column types |
| CSV | native | Exists (`csv.ts`) | Minimal — no branding required |
| Print | `window.open` + HTML | Exists (`print.ts`) | No branding, hardcoded footer |
| Screen | React table | Exists (ERPDataTable) | No export wiring on most pages |
| Email | Microsoft Graph | Exists (email.ts) | No report-specific templates |

The renderer must accept a **resolved template** object (from the branding engine) and apply it to the output.

### 4.8 Export Bridge

The bridge connects the Report Runner to the output renderer.

For download exports (PDF/Excel/CSV): generate file client-side after receiving data from server.
For print: pass data to `window.open` HTML renderer with resolved template.
For email: generate file server-side (base64), pass to `sendExportEmail`.

### 4.9 PDF/Print Bridge

Upgrade existing `pdf.ts` and `print.ts`:
- Accept `ResolvedReportTemplate` parameter
- Render company logo (img or base64 embed) in header
- Render company legal name, address, TRN in header
- Render theme color for table header (`fillColor`)
- Render signatory block in footer
- Render page number + date in footer
- Replace hardcoded "Alliance Gulf ERP" with `template.company_name`

### 4.10 Email/Send Bridge

- On-demand: existing `sendExportEmail()` server action, extended to accept `template_id` for email body styling
- Scheduled (REPORT.5): queue to `erp_email_queue` (reuse notification email system)

### 4.11 Report Audit/History

A `erp_report_runs` table records each report execution:
- Who ran it
- Which report
- Filters used
- Template selected
- Output format
- Record count
- Timestamp
- If emailed: to whom

Accessible via `/admin/reports/history` (REPORT.6 or later).

---

## 5. Global Report Template and Branding Engine

### 5.1 Template Model

A `erp_report_branding_profiles` table stores one profile per company (or custom profile):

```
id
profile_name
owner_company_id (FK — nullable for group/custom)
logo_url
theme_primary_color (hex)
theme_header_bg_color (hex)
letterhead_header_html (optional rich header HTML)
address_block_en
address_block_ar
footer_text_en
footer_text_ar
signatory_name
signatory_title
is_default (per company)
is_group_profile (bool — used for multi-company)
is_active
```

A `erp_report_templates` table stores named templates that reference a branding profile + layout config:

```
id
template_code
template_name
branding_profile_id (FK)
default_orientation
font_family
page_size (a4, letter)
show_logo
show_address
show_signatory
show_watermark
watermark_text (nullable — e.g. "CONFIDENTIAL")
is_active
```

### 5.2 Company Branding Resolver

A server function `resolveReportBranding(ownerCompanyId: number | null, templateId?: number)` that:

1. If `templateId` provided: load that template directly.
2. Else if `ownerCompanyId` provided: find the default branding profile for that company.
3. Else: load the group/neutral branding profile.
4. Return `ResolvedReportTemplate` — a flat object ready to pass to the renderer.

### 5.3 ALGT / ALS / Group Template Behavior

| Scenario | Resolution |
|---|---|
| Filter = ALGT only | Auto-load ALGT default branding profile |
| Filter = ALS only | Auto-load ALS default branding profile |
| No filter / mixed | Show "Select Template" dialog |
| Group template configured | Offer as option in dialog |
| Custom template | Admin creates in template manager; offer to authorized users |

### 5.4 Single-Company Report Behavior

1. System detects `owner_company_id` from report filter or from first record's `owner_company_id`.
2. Verifies all records share the same `owner_company_id`.
3. If yes: auto-applies that company's branding profile. No dialog needed.
4. Proceeds to render.

### 5.5 Multi-Company Report Behavior

1. System detects records with different `owner_company_id` values.
2. Shows "Select Report Template" dialog **before** PDF/print/email.
3. Dialog shows:
   - Group / Neutral template (if configured)
   - ALGT template
   - ALS template
   - Any other active templates the user is allowed to use
4. User selects. System applies and shows preview.
5. On export: records the selected template ID in `erp_report_runs`.

### 5.6 Manual Template Selection Dialog

A `ReportTemplateSelectDialog` component:
- Triggered automatically for multi-company reports
- Can also be triggered manually via "Change Template" button on any report
- Shows template name, preview thumbnail (if configured), company logo

### 5.7 Logo/Theme/Letterhead/Footer/Signatory Resolution

Resolution priority (highest wins):
1. Manually selected template (user-chosen in dialog)
2. Report-level default template (configured in registry)
3. Owner company default branding profile
4. Group/neutral profile
5. Generic fallback (current behavior — no logo, plain text)

### 5.8 Future Company Support

When a third company is added (e.g. ALX):
1. Admin creates a branding profile for ALX in `/admin/reports/templates`.
2. Creates a template linked to the ALX branding profile.
3. All reports with `owner_company_id = ALX` auto-resolve to ALX branding.
4. No code change needed.

### 5.9 Future Module Support

When Fleet module adds a report (e.g. `FLEET_VEHICLE_LIST`):
1. Register report in `erp_report_registry`.
2. Declare required permissions, sensitive fields, branding source (`vehicle.owner_company_id`).
3. Implement the server-side data fetcher.
4. Plug into the Report Center runner.
5. No changes to branding engine, PDF engine, Excel engine, or email engine needed.

---

## 6. Proposed Database Design

### 6.1 `erp_report_branding_profiles`

**Purpose:** Store per-company (or custom) branding data for report output.

**Main columns:**
```sql
id                    SERIAL PRIMARY KEY
profile_code          TEXT UNIQUE NOT NULL
profile_name          TEXT NOT NULL
owner_company_id      INTEGER REFERENCES owner_companies(id) NULL  -- null = group/custom
logo_url              TEXT
logo_width_px         INTEGER DEFAULT 180
theme_primary_color   TEXT DEFAULT '#1e293b'
theme_header_bg_color TEXT DEFAULT '#334155'
theme_header_text_color TEXT DEFAULT '#ffffff'
address_block_en      TEXT
address_block_ar      TEXT
footer_text_en        TEXT
footer_text_ar        TEXT
signatory_name        TEXT
signatory_title_en    TEXT
signatory_title_ar    TEXT
is_default_for_company BOOLEAN DEFAULT false
is_group_profile      BOOLEAN DEFAULT false
is_active             BOOLEAN DEFAULT true
created_at, updated_at, created_by, updated_by
```

**owner_company_id behavior:** If set, this profile belongs to that company and is auto-selected for single-company reports. If null, it is a group/custom profile available for selection.

**RLS:** `hr.reports.admin` or `reports.manage` permission required to create/edit. All authorized users can read active profiles.

### 6.2 `erp_report_templates`

**Purpose:** Named, versioned report layout templates that reference a branding profile.

**Main columns:**
```sql
id                   SERIAL PRIMARY KEY
template_code        TEXT UNIQUE NOT NULL
template_name        TEXT NOT NULL
branding_profile_id  INTEGER REFERENCES erp_report_branding_profiles(id) NOT NULL
default_orientation  TEXT DEFAULT 'portrait'   -- portrait | landscape
page_size            TEXT DEFAULT 'a4'
font_family          TEXT DEFAULT 'helvetica'
show_logo            BOOLEAN DEFAULT true
show_address         BOOLEAN DEFAULT true
show_signatory       BOOLEAN DEFAULT true
show_confidential_watermark BOOLEAN DEFAULT false
watermark_text       TEXT
is_active            BOOLEAN DEFAULT true
created_at, updated_at, created_by, updated_by
```

**RLS:** Same as branding profiles.

### 6.3 `erp_report_registry`

**Purpose:** Central catalog of all available ERP reports.

**Main columns:**
```sql
id                      SERIAL PRIMARY KEY
report_code             TEXT UNIQUE NOT NULL   -- e.g. HR_EMPLOYEE_LIST
report_name_en          TEXT NOT NULL
report_name_ar          TEXT
module_code             TEXT NOT NULL          -- HR, DMS, FLEET, etc.
category                TEXT NOT NULL          -- list, summary, letter, certificate, compliance
output_formats          TEXT[] DEFAULT '{pdf,excel,csv,print}'
default_orientation     TEXT DEFAULT 'portrait'
required_permissions    TEXT[] NOT NULL
sensitive_field_rules   JSONB                  -- field → required_permission → redaction_action
branding_source_field   TEXT                   -- e.g. 'owner_company_id', 'employee.owner_company_id'
default_template_id     INTEGER REFERENCES erp_report_templates(id)
is_active               BOOLEAN DEFAULT true
description_en          TEXT
description_ar          TEXT
created_at, updated_at
```

**owner_company_id behavior:** No direct FK — reports are global. Branding is resolved at run time.

**RLS:** All authenticated HR/module users can read active reports. Only `reports.manage` can create/edit.

### 6.4 `erp_report_permissions`

**Purpose:** Override/extend per-role or per-user report access beyond the base registry permissions.

**Main columns:**
```sql
id               SERIAL PRIMARY KEY
report_code      TEXT NOT NULL REFERENCES erp_report_registry(report_code)
role_id          INTEGER REFERENCES roles(id) NULL
user_id          INTEGER REFERENCES user_profiles(id) NULL
access_level     TEXT NOT NULL   -- view | export | email | manage
granted          BOOLEAN DEFAULT true
granted_by       INTEGER REFERENCES user_profiles(id)
created_at
```

**RLS:** Only `reports.manage` can write. The RBAC engine checks this table in addition to `required_permissions`.

### 6.5 `erp_report_runs`

**Purpose:** Audit log of every report execution.

**Main columns:**
```sql
id              BIGSERIAL PRIMARY KEY
report_code     TEXT NOT NULL
run_by          INTEGER REFERENCES user_profiles(id)
filters_json    JSONB                    -- filters applied
template_id     INTEGER REFERENCES erp_report_templates(id) NULL
output_format   TEXT NOT NULL           -- pdf | excel | csv | print | email
record_count    INTEGER
owner_company_ids INTEGER[]             -- which companies appeared in result
was_multi_company BOOLEAN DEFAULT false
template_selected_manually BOOLEAN DEFAULT false
run_at          TIMESTAMPTZ DEFAULT now()
duration_ms     INTEGER
error_message   TEXT
```

**RLS:** Users can see their own runs. `reports.manage` can see all runs.

### 6.6 `erp_report_run_exports`

**Purpose:** Track exported files (not stored — just metadata).

**Main columns:**
```sql
id              BIGSERIAL PRIMARY KEY
run_id          BIGINT REFERENCES erp_report_runs(id)
format          TEXT NOT NULL
filename        TEXT NOT NULL
size_bytes      INTEGER
downloaded_at   TIMESTAMPTZ DEFAULT now()
```

### 6.7 `erp_report_delivery_logs`

**Purpose:** Log email delivery of reports.

**Main columns:**
```sql
id              BIGSERIAL PRIMARY KEY
run_id          BIGINT REFERENCES erp_report_runs(id)
sent_to         TEXT[]
sent_cc         TEXT[]
subject         TEXT
attachment_format TEXT
attachment_filename TEXT
sent_at         TIMESTAMPTZ DEFAULT now()
provider        TEXT DEFAULT 'microsoft_graph'
success         BOOLEAN
error_message   TEXT
```

### 6.8 `erp_report_saved_filters`

**Purpose:** Per-user saved filter profiles for each report.

**Main columns:**
```sql
id              SERIAL PRIMARY KEY
report_code     TEXT NOT NULL
user_id         INTEGER REFERENCES user_profiles(id)
filter_name     TEXT NOT NULL
filters_json    JSONB NOT NULL
is_default      BOOLEAN DEFAULT false
created_at, updated_at
```

**RLS:** Users can only read/write their own saved filters.

### 6.9 `erp_report_column_profiles`

**Purpose:** Per-user column visibility/ordering preferences per report.

**Main columns:**
```sql
id              SERIAL PRIMARY KEY
report_code     TEXT NOT NULL
user_id         INTEGER REFERENCES user_profiles(id)
profile_name    TEXT NOT NULL
column_config   JSONB NOT NULL   -- [{key, visible, order, width}]
is_default      BOOLEAN DEFAULT false
created_at, updated_at
```

### 6.10 `erp_report_branding_assets`

**Purpose:** Store uploaded report assets (logos, letterhead images, watermarks).

**Main columns:**
```sql
id              SERIAL PRIMARY KEY
asset_type      TEXT NOT NULL   -- logo | letterhead | watermark | signature
owner_company_id INTEGER REFERENCES owner_companies(id) NULL
storage_path    TEXT NOT NULL   -- Supabase Storage path
file_name       TEXT
mime_type       TEXT
width_px        INTEGER
height_px       INTEGER
is_active       BOOLEAN DEFAULT true
created_at, updated_at, created_by
```

---

## 7. Report Execution Flow

```
1. User navigates to /admin/reports/run/[reportCode] or clicks report from a module page

2. System loads report config from erp_report_registry:
   - Checks user has all required_permissions
   - If denied: show access denied state
   - If approved: show report filter panel

3. User fills filters (company, branch, date range, status, etc.)
   - Saved filter profiles available as quick-load dropdown

4. User clicks Preview or Run Report

5. Server action called: runReport(reportCode, filters, userId)
   - Fetches data using report-specific data fetcher
   - Applies sensitive field redaction based on user permissions
   - Detects which owner_company_ids appear in results

6. Company context check:
   - If all records share one owner_company_id:
     → Auto-resolve to that company's default branding profile
     → Skip template dialog
   - If records span multiple owner_company_ids:
     → Show ReportTemplateSelectDialog
     → User chooses: Group / ALGT / ALS / Custom
     → Apply selected template

7. Preview rendered:
   - Screen preview: React table with column visibility controls
   - Shows applied template header (logo, company name)
   - Shows record count

8. User clicks export action (PDF / Excel / CSV / Print / Send Email)

9. Output bridge:
   - PDF/Print: jsPDF rendered with ResolvedReportTemplate applied
   - Excel: SheetJS with company name in metadata
   - CSV: plain with metadata row
   - Email: generate base64 attachment → sendExportEmail()

10. erp_report_runs row created (audit)

11. If email: erp_report_delivery_logs row created
```

---

## 8. HR.11 Report Library

### Priority Levels
- **Required**: Must be in HR.11.A
- **Important**: HR.11.B
- **Later**: HR.11.C or later

### 8.1 Employee Reports

| Report | Priority | Formats | Permissions | Sensitive Fields | Branding Source |
|---|---|---|---|---|---|
| Employee List | Required | PDF, Excel, CSV, Print | `hr.employees.view` | None (general fields) | `employees.owner_company_id` |
| Employee Profile Sheet (per employee) | Required | PDF, Print | `hr.employees.view` | None in base; medical if `hr.medical.view` | Employee's `owner_company_id` |
| Employee ID Card (badge format) | Important | PDF, Print | `hr.employees.view` | None | Employee's `owner_company_id` |
| New Joiner Summary | Important | PDF, Excel | `hr.employees.view` | None | Filter company |
| Termination Summary | Important | PDF, Excel | `hr.employees.view` | None | Filter company |

### 8.2 Compliance Reports

| Report | Priority | Formats | Permissions | Sensitive Fields | Branding Source |
|---|---|---|---|---|---|
| Document Expiry Report | Required | PDF, Excel | `hr.compliance.view` | Document numbers masked | Filter company |
| Access Card Status Report | Required | PDF, Excel | `hr.compliance.view` | Card numbers masked | Filter company |
| Training Certificate Expiry | Important | PDF, Excel | `hr.compliance.view` | None | Filter company |
| Medical Fitness Report | Important | PDF | `hr.compliance.view` + `hr.medical.view` | Medical result, restriction | Employee's company |
| Insurance Coverage Report | Later | Excel | `hr.compliance.view` | Policy numbers masked | Filter company |

### 8.3 Time Reports

| Report | Priority | Formats | Permissions | Sensitive Fields | Branding Source |
|---|---|---|---|---|---|
| Attendance Summary Report | Required | PDF, Excel | `hr.attendance.view` | None | Filter company |
| Leave Balance Report | Required | Excel | `hr.leave.view` | None | Filter company |
| Leave Request Report | Required | Excel | `hr.leave.view` | None | Filter company |
| Overtime Report | Important | Excel | `hr.attendance.view` | None | Filter company |
| Absent/Late Summary | Important | Excel | `hr.attendance.view` | None | Filter company |

### 8.4 Payroll / WPS Reports

| Report | Priority | Formats | Permissions | Sensitive Fields | Branding Source |
|---|---|---|---|---|---|
| WPS Readiness Report | Required | PDF, Excel | `hr.payroll.view` | No IBAN, no amounts | Filter company |
| Payroll Hold Report | Required | Excel | `hr.payroll.view` | No amounts | Filter company |
| Payroll Profile Summary | Important | Excel | `hr.payroll.view` | Basic salary (restricted to `hr.payroll.view`) | Filter company |
| WPS SIF File Generation | Later | CSV | `hr.payroll.view` (admin) | IBAN required for SIF — strict access | Company only |

### 8.5 Operations Reports

| Report | Priority | Formats | Permissions | Sensitive Fields | Branding Source |
|---|---|---|---|---|---|
| Assignment List by Site | Required | PDF, Excel | `hr.assignments.view` | None | Filter company/site |
| Readiness Status Report | Required | PDF, Excel | `hr.assignments.view` | None | Filter company |
| Operational Block Report | Important | Excel | `hr.assignments.view` | None | Filter company |
| PPE/Asset Issue Report | Later | Excel | `hr.assignments.view` | None | Filter company |
| Accommodation Report | Later | Excel | `hr.assignments.view` | None | Filter company |

### 8.6 HR Actions / EOS Reports

| Report | Priority | Formats | Permissions | Sensitive Fields | Branding Source |
|---|---|---|---|---|---|
| PRO Process Report | Required | PDF, Excel | `hr.actions.view` | None | Filter company |
| Disciplinary Summary | Required | PDF (admin only) | `hr.actions.view` (admin) | Description omitted | Employee's company |
| EOS Cases Report | Important | Excel | `hr.eos.view` | Gratuity amounts restricted | Filter company |
| Approval Requests Summary | Important | Excel | `hr.actions.view` | None | Filter company |

### 8.7 Recruitment / Onboarding Reports

| Report | Priority | Formats | Permissions | Sensitive Fields | Branding Source |
|---|---|---|---|---|---|
| Candidate Pipeline Report | Required | Excel | `hr.recruitment.view` | No salary/offer amounts | All companies |
| Requisition Summary | Required | Excel | `hr.recruitment.view` | None | Filter company |
| Onboarding Task Status | Required | Excel | `hr.recruitment.view` | None | Filter company |
| Offer Summary | Important | Excel | `hr.recruitment.view` (admin) | Offer salary restricted | Filter company |

### 8.8 Letters / Forms / Certificates

| Document | Priority | Formats | Permissions | Branding Source | Notes |
|---|---|---|---|---|---|
| Experience Letter | Required | PDF | `hr.employees.view` | Employee's company | Single employee, letterhead essential |
| Salary Certificate (general) | Required | PDF | `hr.employees.view` | Employee's company | No exact salary — "competitive" variant |
| Salary Certificate (with amount) | Important | PDF | `hr.payroll.view` | Employee's company | Requires `hr.payroll.view`; shows actual salary |
| NOC (No Objection Certificate) | Required | PDF | `hr.employees.view` | Employee's company | Letterhead + signatory |
| Employment Contract | Later | PDF | `hr.employees.view` (admin) | Employee's company | Template-driven |
| Warning Letter | Later | PDF | `hr.actions.view` (admin) | Employee's company | Template-driven |
| End of Service Letter | Later | PDF | `hr.eos.view` | Employee's company | Letterhead + signatory |
| Leave Approval Letter | Later | PDF | `hr.leave.view` | Employee's company | Letterhead |
| Visa Cancellation NOC | Later | PDF | `hr.compliance.view` | Employee's company | |

---

## 9. Global Report Center Subphase Plan

### REPORT.0 — Full Audit and Standards (This Document)

**Status:** COMPLETE (this document)
**Output:** This audit plan + new Cursor rules (below)
**No implementation.**

### REPORT.1 — Global Report Engine Foundation

**Scope:**
- DB migration: create `erp_report_branding_profiles`, `erp_report_templates`, `erp_report_registry`, `erp_report_runs`, `erp_report_delivery_logs`, `erp_report_saved_filters`, `erp_report_column_profiles`, `erp_report_branding_assets`
- Seed branding profiles for ALGT and ALS (from `owner_companies.logo_url`)
- Seed initial report templates for ALGT and ALS
- Extend `owner_companies` with report-branding columns: `report_theme_color`, `report_address_block`, `report_footer_text`, `report_signatory_name`, `report_signatory_title`
- Implement `resolveReportBranding()` server function
- Implement `runReport()` server action stub
- Add RLS policies for all new tables
- Register 3 seed reports in registry (PERMISSION_MATRIX, HR_EMPLOYEE_LIST, HR_EMPLOYEE_PROFILE)
- No UI yet

**No HR.11 report output yet.**

### REPORT.2 — Template / Branding / Letterhead Engine

**Scope:**
- Upgrade `pdf.ts` to accept `ResolvedReportTemplate` — render logo, company name, address, theme color, footer, signatory
- Upgrade `print.ts` same
- Add company name to Excel metadata
- Build `ReportTemplateSelectDialog` component
- Build `/admin/reports/templates` admin route (list + form for branding profiles + templates)
- Multi-company detection logic in `runReport()`
- Preview stub (screen layout with template header/footer mockup)
- branding_assets upload via Supabase Storage

**This phase makes all existing PDF/print/email exports company-branded.**

### REPORT.3 — HR.11.A — Core HR Reports Library

**Scope (Required reports from §8):**
- Employee List report
- Employee Profile Sheet (single-employee PDF)
- Document Expiry Report
- Attendance Summary Report
- Leave Balance Report / Leave Request Report
- WPS Readiness Report
- Assignment Report by Site
- Readiness Status Report
- PRO Process Report
- Candidate Pipeline Report
- Wire all reports into `/admin/reports/run/[reportCode]`

**Each report:** data fetcher + redaction + branding + column config + permission check.

### REPORT.4 — HR.11.B — Letters / Certificates / Forms

**Scope (Required letters from §8.8):**
- Experience Letter
- Salary Certificate (general + with amount)
- NOC
- Letter template engine (HTML/CSS template → PDF via print bridge)
- Template variable substitution (`{{employee_name}}`, `{{company_name}}`, etc.)
- `/admin/reports/templates/letters` template manager

### REPORT.5 — Email / Scheduled Delivery

**Scope:**
- Scheduled report delivery (queue-based via `erp_email_queue`)
- Report schedule config per user/report
- Email body template per report
- Email delivery retry

### REPORT.6 — QA / Security / UAT Closure

**Scope:**
- Full RLS audit of all report tables
- Penetration test: verify sensitive fields do not leak for unauthorized users
- Performance testing: large employee lists (500+, 5000+)
- `/admin/reports/history` UI
- UAT sign-off

---

## 10. HR.11 Proposed Split

HR.11 should be delivered in lockstep with the Report Center phases:

### HR.11.A — Core HR Report Library (= REPORT.3)
- All "Required" reports from §8
- Uses REPORT.1 engine + REPORT.2 branding
- Produces PDF/Excel/CSV/Print/Email for core HR data
- No letters yet

### HR.11.B — Letters, Certificates, NOC (= REPORT.4)
- Experience Letter, Salary Certificate, NOC
- Letter template engine
- Per-employee letter generation from record workspace
- "Generate Letter" button on Employee Profile

### HR.11.C — Payroll-Sensitive Reports
- Payroll Profile Summary (amounts visible to `hr.payroll.view` only)
- Payroll Hold Report
- WPS SIF file generation (if in scope)
- Tightly permission-gated

### HR.11.D — Advanced / Scheduled Reports
- Report scheduling and email delivery
- Saved filter profiles
- Column profile preferences
- Export from HR Search results

---

## 11. Required Cursor Rules / Standards

### New documents to create in REPORT.1:

**`docs/standards/ERP_GLOBAL_REPORT_CENTER_STANDARD.md`**

Covers:
- Report registry contract
- How to register a new report
- How to implement a report data fetcher
- Redaction rules reference
- How to plug a new module into the Report Center

**`.cursor/rules/erp-global-report-center-standard.mdc`**

Always-applied rule covering:
- Every report must use the central Report Center engine
- No hardcoded company name/logo in PDF/print output
- No report bypasses permissions or redaction
- Sensitive field list reference

**`docs/standards/ERP_REPORT_TEMPLATE_BRANDING_STANDARD.md`**

Covers:
- Branding profile data model
- How company logo/theme/footer/signatory is resolved
- Single vs multi-company report behavior
- Template selection dialog UX contract
- What to do when branding assets are missing (graceful fallback)

**`.cursor/rules/erp-report-template-branding-standard.mdc`**

Always-applied rule covering:
- Never hardcode "ALGT" or "ALS" or "Alliance Gulf" in report output code
- Always call `resolveReportBranding()` before rendering PDF/print/email
- Multi-company reports must show template selection dialog
- Logo fallback behavior

---

## 12. Risks and Controls

| Risk | Likelihood | Impact | Control |
|---|---|---|---|
| Multi-company branding mistake (ALGT logo on ALS report) | High (current state) | High | Multi-company detection + mandatory template dialog; template stored in run log |
| Payroll amount/IBAN leak in Excel export | Medium | Critical | Server-side redaction; Excel never receives sensitive values without `hr.payroll.view` |
| Medical data leak | Medium | Critical | Server-side redaction; medical fields require `hr.medical.view` |
| Disciplinary text in PDF | Medium | High | Redaction engine omits description fields entirely for unauthorized users |
| Candidate salary in recruitment export | Low | Medium | Offer amounts gated by admin permission flag |
| DMS AI summary in document export | Low | Medium | `dms.ai.view` required; omit field otherwise |
| Wrong logo/template selected | Medium | Medium | Template preview before export; template ID stored in run history |
| Export of unauthorized data | Low (if engine correct) | Critical | Server-side data fetcher always checks permissions before returning data |
| Email attachment leakage | Low | High | RBAC check on sendExportEmail; attachment generated server-side |
| Heavy report performance (5000+ employees) | Medium | Medium | Pagination/streaming in data fetcher; row limit warnings; background generation for large exports |
| Duplicate report logic | Medium (today) | Medium | Retire ad-hoc exports by routing all report actions through the registry/runner |
| Hardcoded "Alliance Gulf ERP" text not replaced | High (today) | Medium | Cursor rule + REPORT.2 mandatory upgrade of pdf.ts and print.ts |

---

## 13. Recommended Next Prompt

```text
REPORT.1 — Global Report Engine Foundation
```

This phase establishes the database schema, branding resolver, and report registry so that REPORT.2 (branding engine upgrade) and HR.11.A (first real reports) can follow in sequence.

HR.11 should NOT start until REPORT.1 and REPORT.2 are complete. Building HR reports without the Report Center engine would create yet another one-off pattern.

---

*End of ERP Global Report Center Audit and Integration Plan — REPORT.0*
*Date: 2026-06-19 | Author: AI Planning Agent*
