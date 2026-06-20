# ERP Report Template & Branding Standard

## Phase

```
REPORT.2 — Global Report Engine + Registry + Security Foundation
Date: 2026-06-19
```

---

## 1. Branding Profile Types

| Type | Code Pattern | Purpose |
|---|---|---|
| `company` | `COMPANY_{id}_DEFAULT` | Default branding for a specific owner company |
| `group` | `GROUP_DEFAULT` | Group-level branding for multi-company/consolidated reports |
| `neutral` | `NEUTRAL_DEFAULT` | Fallback with no company identity |
| `custom` | any | Special-purpose custom profiles |

---

## 2. Template Types

| Type | Use |
|---|---|
| `report` | Standard data/list/summary reports |
| `letter` | Employee letters, notice letters, reference letters |
| `certificate` | Employment certificates, training completion |
| `form` | Application forms, request forms |
| `checklist` | Onboarding checklists, compliance checklists |
| `badge` | ID badges, access cards |
| `external_submission` | MOHRE, WPS, government submission formats |
| `group_summary` | Multi-company group summary reports |

---

## 3. Branding Strategy Values

| Strategy | Behavior |
|---|---|
| `auto_by_owner_company` | Detect company from data rows; load company default |
| `manual_required` | Always require user to select template |
| `group_default` | Always use `GROUP_DEFAULT` profile |
| `template_fixed` | Use the template specified in `default_template_id` |
| `none` | No branding (raw data export) |

---

## 4. Template Seeding Convention

For each active owner company, two templates are seeded:
```
COMPANY_{id}_REPORT_TEMPLATE  → links to COMPANY_{id}_DEFAULT branding profile
COMPANY_{id}_LETTER_TEMPLATE  → links to COMPANY_{id}_DEFAULT branding profile
```

After seeding, `owner_companies.default_report_template_id` and `default_letter_template_id`
are set automatically.

---

## 5. Adding a New Owner Company

When a new owner company is created:

1. Insert a row into `erp_report_branding_profiles`:
   - `profile_code = 'COMPANY_{id}_DEFAULT'`
   - `profile_type = 'company'`
   - `owner_company_id = {id}`
   - Copy `legal_name_en`, `logo_url`, `trn`, `trade_license_no`, `primary_email`, etc.

2. Insert templates:
   - `COMPANY_{id}_REPORT_TEMPLATE`
   - `COMPANY_{id}_LETTER_TEMPLATE`

3. Update `owner_companies` columns:
   - `default_report_template_id`
   - `default_letter_template_id`

This is the **only correct path** to onboard a new company into the report engine.

---

## 6. Branding Field Reference

| DB Column | Use |
|---|---|
| `logo_url` | Primary company logo |
| `small_logo_url` | Compact logo for narrow headers |
| `stamp_url` | Company stamp image (requires `reports.sign`) |
| `signature_url` | Signatory signature image (requires `reports.sign`) |
| `watermark_url` | Watermark image |
| `watermark_text` | Text watermark (e.g., "CONFIDENTIAL") |
| `theme_primary_color` | Header, accent color |
| `theme_secondary_color` | Sub-header, table header |
| `theme_header_bg_color` | Report header background |
| `theme_header_text_color` | Report header text |
| `legal_name_en / ar` | Full legal company name |
| `trade_name_en / ar` | Trading name |
| `address_block_en / ar` | Formatted address block |
| `phone / email / website / po_box` | Contact details |
| `trn` | Tax registration number |
| `trade_license_no` | Trade license number |
| `footer_text_en / ar` | Footer disclaimer text |
| `signatory_name` | Default signatory name |
| `signatory_title_en / ar` | Signatory job title |

---

## 7. Stamp and Signature Rules

- Stamp and signature images require permission: `reports.sign`
- The `requires_stamp_permission` column on `erp_report_templates` gates this per template
- The redaction engine **does not** expose stamp/signature URLs if the caller lacks `reports.sign`

---

## 8. Template Upgrade Path (REPORT.3)

In REPORT.3, the output adapter branding system will be upgraded to:
- Inject resolved branding profile into PDF, print, and Excel output
- Support RTL/Arabic layout using `language_mode`
- Apply `custom_css` overrides for PDF generation
- Render `body_html_en / ar` in letter and certificate templates

REPORT.2 creates and populates the branding data. REPORT.3 uses it.
