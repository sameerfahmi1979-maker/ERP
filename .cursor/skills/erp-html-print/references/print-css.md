# Print CSS Reference

## Required Global Rules

```css
@page {
  size: A4;
  margin: 18mm 14mm 20mm;
}

@page :first {
  margin-top: 25mm; /* more room for letterhead */
}

@media print {
  * {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }

  tr, img, .avoid-page-break,
  .signature-block, .totals-block,
  .approval-block, h2, h3 {
    break-inside: avoid;
  }

  .page-break-before { break-before: page; }
  .page-break-after  { break-after: page;  }

  /* Prevent orphans and widows */
  p { orphans: 3; widows: 3; }

  /* Prevent headings from being alone at bottom of page */
  h1, h2, h3, h4 { break-after: avoid; }

  /* Table layout */
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  td, th { overflow-wrap: break-word; word-break: break-word; }

  /* Numeric/currency alignment */
  .cell-numeric, .cell-currency { text-align: right; font-variant-numeric: tabular-nums; }

  /* Hide screen-only elements */
  .screen-only, nav, .sidebar, button, [data-no-print] { display: none !important; }
}
```

## Typography

- Base font size: 10pt (print) / 14px (screen preview)
- Minimum font size: 7pt (footnotes, small labels)
- Line height: 1.4
- Font family (Latin): Arial, Helvetica, sans-serif
- Font family (Arabic): 'Noto Sans Arabic', 'Amiri', Arial, sans-serif

## Landscape Support

```css
@page landscape {
  size: A4 landscape;
  margin: 14mm 18mm 16mm;
}
.landscape-page { page: landscape; }
```
