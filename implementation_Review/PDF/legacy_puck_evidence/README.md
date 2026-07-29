# Legacy Puck Evidence Package — REPORT.DESIGNER.RETIRE.0

**Created:** 2026-07-26
**Work Package:** WP2 of `ERP_GLOBAL_OUTPUT_FRAMEWORK_ALL_12_WORK_PACKAGES` master program
**Authority:** `HR_LETTERS_AND_CERTIFICATES_ENHANCEMENT_PLAN.md` v6.1 — non-destructive Puck evidence preservation

## Purpose

Permanent, verifiable preservation of every **meaningful** legacy Puck layout in
`erp_report_templates` before any Puck editor removal (`REPORT.DESIGNER.RETIRE.1`).
No live database row, report run, generated PDF, or layout JSON was deleted or mutated.

## Reconciliation Against v6.1 Baseline (verified live 2026-07-26)

| v6.1 baseline claim | Live verification | Match |
|---|---|---|
| 18 non-deleted `erp_report_templates` rows | 18 rows (ids 1–15, 19–21) | YES |
| 16 semantically empty layouts | 16 rows with `body_layout_json = {}` (EMPTY_LITERAL); header/footer zones also empty | YES |
| 2 meaningful layouts | ids **14** and **15** only (`body_layout_json` = 6,848 chars compact JSON each) | YES |
| Templates 14 & 15 contain the same "To Whom It May Concern" design | Byte-identical `body_layout_json` (`JSON.stringify` equality = true) | YES |
| Zero meaningful **published** layouts | Published rows are ids 11, 12, 13, 19 — all EMPTY_LITERAL | YES |

No differences from the v6.1 baseline were found. No newly discovered meaningful layouts exist.

## Preserved Templates

### Template 14 — `DEFAULT_CERTIFICATE_TEMPLATE_V2_V3` — "To Whom It May Concern"
- governance_status: `archived`, version_no: 3, is_active: false, engine: `puck`
- Design: employment + salary certificate ("To Whom It May Concern") with employee
  information block, salary information block, disclaimer, and signature block.

### Template 15 — `DEFAULT_CERTIFICATE_TEMPLATE_V2_V3_V4` — "To Whom It May Concern (v4)"
- governance_status: `draft`, version_no: 4, is_active: true, engine: `puck`
- Design: **byte-identical** to template 14 (v4 is a governance revision of the same layout).

## Package Contents

| File | Description |
|---|---|
| `template_14_body_layout.json` | Exact `body_layout_json` (pretty-printed; compact-semantics hash also recorded) |
| `template_14_metadata.json` | Full row metadata (all governance/versioning columns, layout JSON excluded) |
| `template_14_wording_extraction.txt` | All 55 human-readable text fragments incl. `{{binding}}` variables |
| `template_15_body_layout.json` | Exact `body_layout_json` — byte-identical to template 14's |
| `template_15_metadata.json` | Full row metadata |
| `template_15_wording_extraction.txt` | All 55 text fragments |
| `template_15_reference_render.html` | Rendered via the REAL production renderer (`renderVisualTemplateZones` → Executive Ledger HTML) with synthetic placeholder bindings — 0 warnings |
| `template_15_reference_render_screenshot.png` | Browser screenshot of the reference render (not blank/truncated — verified) |
| `checksums.json` | SHA-256 checksums; verified reproducible with `Get-FileHash` |
| `template_studio_mapping_spec.md` | Re-authoring specification for the replacement Template Studio |

## Safety Confirmation

- No real employee data: reference render uses synthetic placeholders only.
- No protected stamp/signature bytes: branding context used placeholder text values only.
- No credentials or secrets in any artifact.
- Read-only against the live database (single `SELECT`).

## Checksum Verification Procedure

```powershell
cd implementation_Review/PDF/legacy_puck_evidence
$c = Get-Content checksums.json -Raw | ConvertFrom-Json
foreach ($f in $c.files) {
  $h = (Get-FileHash $f.file -Algorithm SHA256).Hash.ToLower()
  if ($h -eq $f.sha256_pretty) { "VERIFIED: $($f.file)" } else { "MISMATCH: $($f.file)" }
}
```

Verified at creation time: both files `VERIFIED`.
