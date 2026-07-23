# Page Break Rules

## CSS Properties

| Property | Value | Effect |
|---|---|---|
| `break-inside: avoid` | On row, block, or section | Prevents internal page break |
| `break-before: page` | On element | Forces page break before |
| `break-after: page` | On element | Forces page break after |
| `break-after: avoid` | On heading | Prevents orphaned heading at bottom |
| `orphans: 3` | On `p` | Min 3 lines before a break |
| `widows: 3` | On `p` | Min 3 lines after a break |

## Required Classes

| Class | Applied To | Rule |
|---|---|---|
| `.avoid-page-break` | Totals, signatures, approval blocks | `break-inside: avoid` |
| `.page-break-before` | New section start | `break-before: page` |
| `.page-break-after` | Section end | `break-after: page` |
| `.signature-block` | Signature + stamp area | `break-inside: avoid` |
| `.totals-block` | Subtotal/VAT/total rows | `break-inside: avoid` |

## Table Rules

- Always use `<thead>` for header rows — browser/Gotenberg repeats it automatically.
- Wrap repeating footer totals in `<tfoot>`.
- Apply `break-inside: avoid` to `<tr>` to prevent row splitting.
- For very tall rows (multi-line cells), accept the split — do not use `height: 999px` hacks.

## Multi-Page Document Structure

```tsx
// Page 1: Cover / header
<DocumentHeader />
<CompanyBranding />
<DocumentTitle />

// Body: table (auto-paginates)
<DocumentTable data={rows} />

// After table: totals + signature (on same page if possible)
<TotalsBlock className="avoid-page-break" />
<SignatureBlock className="avoid-page-break" />

// Explicitly force new page for terms
<PageBreak />
<TermsBlock />
```
