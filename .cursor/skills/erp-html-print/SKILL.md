# ERP HTML Print Skill

## Purpose
Use this skill when creating or editing HTML print templates, print CSS, Arabic/RTL layouts, bilingual documents, or multi-page table rules.

## When To Use
- "Create a print template for..."
- "Fix Arabic text in PDF"
- "Table header is not repeating across pages"
- "Content is being cut off at page break"
- "Logo or branding is missing in print"
- "Bilingual layout looks wrong"

## Step 1: Read References

1. Read `references/print-css.md` — print CSS requirements
2. Read `references/arabic-rtl.md` — Arabic and RTL rules
3. Read `references/page-break-rules.md` — page break control
4. Read `references/font-loading.md` — font requirements

## Step 2: Use Only Approved Print Components

All print templates MUST use components from `src/components/erp/print/`:

- `DocumentPage` — outer page wrapper
- `DocumentHeader` — top section with branding
- `DocumentFooter` — footer with page numbers
- `CompanyBranding` — logo, name, address block
- `DocumentTitle` — centered title block
- `DocumentMetadata` — ref number, date, status
- `DocumentTable` — data table with proper print CSS
- `TotalsBlock` — subtotal/VAT/total rows
- `SignatureBlock` — signature + stamp area
- `BilingualText` — dual language side-by-side
- `ArabicText` — RTL Arabic paragraph
- `PageBreak` — explicit break
- `AvoidPageBreak` — prevent break inside

## Step 3: Import the Global Print CSS

Every template layout/page must import:
```tsx
import "@/styles/print/globals.css";
```

## Step 4: Test the Template

1. Open the print route in a browser (development).
2. Use browser DevTools → Emulate print media.
3. Check for: overflow, blank pages, header repetition, Arabic shaping.
4. Generate via Gotenberg and inspect page rasterization.

## References
- `references/print-css.md`
- `references/arabic-rtl.md`
- `references/page-break-rules.md`
- `references/font-loading.md`
