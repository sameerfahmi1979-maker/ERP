# PDF Acceptance Checklist

## Visual Check

| # | Check | Pass/Fail |
|---|---|---|
| 1 | PDF opens without error | |
| 2 | Page count is within expected range (no extra blank pages) | |
| 3 | No blank pages | |
| 4 | No near-blank pages (< 1% filled pixels) | |
| 5 | Content does not touch the unsafe margin (15px from edge) | |
| 6 | Company logo appears on first page | |
| 7 | Company name and address are correct | |
| 8 | Document title is correct | |
| 9 | Reference number / date are present | |
| 10 | Table header repeats on every page | |
| 11 | No table row is split in an unreadable way | |
| 12 | Totals block is not split across pages | |
| 13 | Signature/stamp block is not split across pages | |
| 14 | Page footer shows page numbers (X of Y) | |
| 15 | No content is clipped (overflow hidden) | |

## Arabic / Bilingual Check

| # | Check | Pass/Fail |
|---|---|---|
| 16 | Arabic text is correctly shaped (not garbled) | |
| 17 | Arabic text reads right-to-left | |
| 18 | Arabic numbers are correct (not reversed) | |
| 19 | Mixed Arabic/English line is readable | |
| 20 | Logo is NOT mirrored in RTL mode | |
| 21 | Bilingual columns are correctly aligned | |

## Security Check

| # | Check | Pass/Fail |
|---|---|---|
| 22 | No service-role key visible in PDF | |
| 23 | No internal server path visible in PDF | |
| 24 | No raw HTML visible (escaped properly) | |
| 25 | Confidentiality watermark present (if required) | |
| 26 | QR code destination is an approved ERP URL | |

## Data Accuracy

| # | Check | Pass/Fail |
|---|---|---|
| 27 | Source record ID matches what was requested | |
| 28 | All expected rows are present | |
| 29 | Totals match the sum of line items | |
| 30 | Dates are in the correct format (DD/MM/YYYY or locale-appropriate) | |
