# ERP PDF Visual QA Skill

## Purpose
Use this skill to validate a generated PDF — rasterize pages, check blanks, compare snapshots, verify Arabic shaping, and confirm table header repetition.

## When To Use
- After generating a PDF via the Gotenberg path
- Running CI visual regression checks
- Auditing existing PDF templates for quality

## Step 1: Rasterize

```bash
# Using Poppler pdftoppm
pdftoppm -r 150 -png output.pdf /tmp/qa-pages/page

# Result: /tmp/qa-pages/page-1.png, page-2.png, ...
```

## Step 2: Run QA Scripts

```bash
# Detect blank pages
npx ts-node .cursor/skills/erp-pdf-visual-qa/scripts/render-pdf-pages.ts output.pdf

# Inspect metadata
npx ts-node .cursor/skills/erp-pdf-visual-qa/scripts/inspect-pdf.ts output.pdf

# Compare against approved snapshot
npx ts-node .cursor/skills/erp-pdf-visual-qa/scripts/compare-snapshots.ts output.pdf approved/

# Validate PDF/A or PDF/UA
npx ts-node .cursor/skills/erp-pdf-visual-qa/scripts/validate-pdf.ts output.pdf
```

## Step 3: Review Acceptance Checklist

Read `references/acceptance-checklist.md` and mark off each item.

## References
- `references/acceptance-checklist.md`
- `references/regression-testing.md`
