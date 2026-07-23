# Branding Rules Reference

## Multi-Company Branding

The ERP supports unlimited company branding profiles. Each company's PDFs use ONLY their own branding.

**Never hardcode** ALGT, ALS, PGI, or any company name in a print template.

All branding resolves from:
1. `source_record.owner_company_id` → `owner_companies.id`
2. → `erp_report_branding_profiles` (matching `owner_company_id`)
3. → `erp_branding_assets` (logo, stamp, signature, watermark, letterhead)

## Branding Elements

| Element | Field | Notes |
|---|---|---|
| Logo | `erp_branding_assets` (type=report_logo) | Primary logo |
| Small logo | `erp_branding_assets` (type=report_logo_small) | Header compact |
| Stamp | `erp_branding_assets` (type=stamp) | Requires `reports.sign` |
| Signature | `erp_branding_assets` (type=signature) | Requires `reports.sign` |
| Watermark | `erp_branding_assets` (type=watermark) | Behind content |
| Letterhead | `erp_branding_assets` (type=letterhead_background) | Full page bg |
| Company name | `owner_companies.legal_name_en` / `legal_name_ar` | Both languages |
| Address | `erp_report_branding_profiles.address_block_en` / `_ar` | |
| Phone | `erp_report_branding_profiles.phone` | |
| Email | `erp_report_branding_profiles.email` | |
| TRN | `owner_companies.tax_registration_number` | |
| License | `owner_companies.trade_license_no` | |
| Footer text | `erp_report_branding_profiles.footer_text_en` / `_ar` | |

## Fallback Chain

1. Company-specific branding profile
2. Group default branding profile
3. Neutral/system default branding profile
4. Graceful degradation (text fallback for missing images)

## Mixed-Company Documents

If a PDF contains records from multiple companies (e.g., a consolidated report), the template must explicitly declare which company's branding to use and why. This requires human approval at template creation time.
