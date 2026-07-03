# ERP Executive Ledger Output Template Standard

**Phase:** BRANDING.5 — Executive Ledger Template Engine  
**Status:** ACTIVE — applies to all new formal ERP output documents  
**Last updated:** 2026-07-02

---

## 1. Purpose

The **Executive Ledger** is the ERP's unified formal output template engine for official, print-ready business documents. It provides a consistent visual identity for all company-issued documents: HR letters, salary certificates, NOCs, delivery notes, weighbridge tickets, purchase orders, official forms, and certificates.

The engine consists of:
- **Core library:** `src/lib/executive-ledger/` — types, formatters, HTML renderer
- **React preview:** `src/features/executive-ledger/` — preview component and dialog
- **Integration:** `src/features/report-center/letter-preview-dialog.tsx` — Formal View toggle

---

## 2. Visual Rules

### Document Container
- **Page:** A4 (210mm × 297mm), portrait by default
- **Outer frame:** White background, 10px padding, subtle box shadow
- **Inner frame:** 2px solid `#1e293b` border, 16px × 20px internal padding
- **Double-border effect:** Outer A4 frame → 10px gap → inner 2px border

### Company Header
- Logo on the left (max 56px height, 140px width)
- Company name (EN bold, 13px) and Arabic name (if available)
- Address, phone, website in compact sub-line
- Separated from title block by a 2px primary-color rule

### Title Block
- Full-width dark banner (company primary color)
- Document title in white, uppercase, bold, 13px
- Document subtitle below title in 9px
- Right-aligned meta block: Ref, Date, Location

### Addressee Strip
- TO / EMPLOYEE / RECIPIENT party block
- RE / SUBJECT line with bold value
- Bottom border separator

### Section Styles
- Section title: 8.5px uppercase, bold, letter-spaced, colored rule below
- Body text: 10px, 1.7 line height, paragraph breaks
- Key-value rows: dotted leaders, 40% label / 60% value split
- Ledger table: dark header row (`#1e293b` bg, white text), alternating row shading
- Table totals: bold rows with top border below the table

### Signature / Stamp Area
- Signature image (max 160×56px) with underline and name/title below
- Stamp image (max 80×80px) on the right
- QR placeholder box (56×56px) for future BRANDING.6
- Only rendered when URLs are present in `ExportBrandingContext`

### Footer
- 2px primary-color top border
- 8px centered text: footer disclaimer · TRN · Trade License

---

## 3. Layout Zones

```
┌─────────────────────────────────────────────┐  outer-frame (A4)
│ ┌─────────────────────────────────────────┐ │  inner-frame (2px border)
│ │ [LOGO]  Company Name EN                 │ │  ← Company Header
│ │         Address · Phone · Website       │ │
│ ├═════════════════════════════════════════┤ │  ← 2px rule
│ │█████████  DOCUMENT TITLE  ██████████████│ │  ← Title Block (dark bg)
│ │  subtitle               Ref / Date      │ │
│ ├─────────────────────────────────────────┤ │
│ │ TO: Name · Title · ID                   │ │  ← Addressee Strip
│ │ RE: Subject line                        │ │
│ ├─────────────────────────────────────────┤ │
│ │ SECTION TITLE ──────────────────────── │ │  ← Body sections
│ │ Label ··············· Value             │ │  ← Key-value rows
│ │ ┌──────────┬──────────┬──────────┐      │ │  ← Ledger table
│ │ │ Header 1 │ Header 2 │ Header 3 │      │ │
│ │ ├──────────┼──────────┼──────────┤      │ │
│ │ │ Row 1    │ ...      │ ...      │      │ │
│ │ └──────────┴──────────┴──────────┘      │ │
│ ├─────────────────────────────────────────┤ │
│ │ [Signature]        [Stamp] [QR box]     │ │  ← Signatory block
│ │ ______________                          │ │
│ │ Name · Title                            │ │
│ ├═════════════════════════════════════════┤ │  ← 2px rule
│ │      Footer · TRN · License             │ │  ← Footer
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

---

## 4. Branding Requirements

The Executive Ledger engine consumes `ExportBrandingContext` (from BRANDING.4). All branding is pre-resolved by the server before being passed to the renderer.

| Field | Purpose | Required |
|---|---|---|
| `companyNameEn` | Company header | Recommended |
| `companyNameAr` | Arabic sub-header | Optional |
| `logoUrl` | Logo image in header | Optional |
| `addressBlockEn` | Company address | Optional |
| `phone` | Contact phone | Optional |
| `website` | Company website | Optional |
| `trn` | Tax registration number | Optional |
| `tradeLicenseNo` | Trade license | Optional |
| `footerTextEn` | Footer disclaimer | Optional |
| `stampUrl` | Stamp image in signatory | SECURITY GATED |
| `signatureUrl` | Signature image | SECURITY GATED |
| `watermarkUrl` | Page watermark | Optional |
| `letterheadBackgroundUrl` | Page background | Optional |
| `signatoryName` | Signer name | Optional |
| `signatoryTitleEn` | Signer title | Optional |
| `themePrimaryColor` | Border/header color | Optional (default `#1e293b`) |
| `themeHeaderBgColor` | Title block background | Optional |
| `themeHeaderTextColor` | Title block text | Optional |

---

## 5. Security Rules

1. **The renderer never resolves assets.** It receives already-resolved URLs only.
2. **Stamp and signature render only if provided in `ExportBrandingContext`.** These are pre-gated by `reports.sign` at the server action level (BRANDING.4).
3. **All dynamic text is HTML-escaped** via `elEscapeHtml()` before injection.
4. **All URLs are validated** via `elEscapeAttr()` — only `https://` URLs are allowed.
5. **No Supabase queries** inside the renderer or preview components.
6. **No service-role key exposure.** Signed URLs are passed from the server; they expire.
7. **No QR generation.** The `qrPlaceholder: true` field renders a visual placeholder only. QR generation is BRANDING.6.
8. **No `dangerouslySetInnerHTML` in React components** — the HTML is injected into a sandboxed `<iframe srcdoc="">`.
9. **No external network requests** from the renderer. Only pre-resolved branding URLs are used.

---

## 6. Dynamic Data Rules

1. **All data passed to the renderer must be pre-formatted strings.** Dates, numbers, and booleans should be formatted before building the `ExecutiveLedgerDocument`.
2. **Use `elFormatValue()` for cell data** (handles null, boolean, number, ISO dates).
3. **Use `elColumnLabel()` for column headers** (converts snake_case to Title Case).
4. **Use `elFormatDate()` for date fields** (returns "DD Month YYYY" format).
5. **Never pass raw Supabase rows to the renderer.** Build `ExecutiveLedgerDocument` explicitly.
6. **Empty values** should render as `"—"` (use `elFormatValue()`).

---

## 7. Modules That Should Use Executive Ledger

When these modules are developed or refactored, they must use the Executive Ledger engine for formal print/PDF output:

| Module | Document Types |
|---|---|
| HR | Experience Letter, Salary Certificate, NOC, ID Card, PPE Form, Joining Checklist, Clearance Form |
| Finance | Payment Vouchers, Credit Notes, Account Statements |
| Procurement | Purchase Orders, GRN forms, Supplier NOCs |
| Logistics | Delivery Notes, Weighbridge Tickets, Transfer Orders |
| Fleet / Workshop | Job Cards, Inspection Reports |
| Legal / Admin | Certificates, Regulatory Filings, Tenancy Agreements |

---

## 8. What Is Out of Scope for This Engine

- **QR code generation** — see BRANDING.6
- **Public verification endpoints** (`/verify/[token]`)
- **Digital signatures** (PKI/e-signature)
- **Multi-page dynamic pagination** (jsPDF plugin required — future phase)
- **RTL-first layouts** (RTL support is partial — direction attribute is set, full RTL mirroring is future work)
- **Template versioning/approval workflows** — future governance phase
- **Module-wide automated rollout** — each module adopts the engine at its own phase

---

## 9. QR Placeholder Rule (Future BRANDING.6)

Documents may set `qrPlaceholder: true` in `ExecutiveLedgerDocument`. This renders a 56×56px dashed box in the signatory area labeled "QR Pending".

**BRANDING.6 will:**
- Generate a unique verification token per document
- Store it in `erp_output_public_links`
- Render a real QR code in this placeholder area
- Create a public `/verify/[token]` endpoint

Until BRANDING.6 is implemented, `qrPlaceholder: true` is safe to set; it renders only a visual placeholder.

---

## 10. File Reference

| File | Role |
|---|---|
| `src/lib/executive-ledger/types.ts` | Core type definitions |
| `src/lib/executive-ledger/constants.ts` | Layout constants (dimensions, defaults) |
| `src/lib/executive-ledger/formatters.ts` | Pure utility functions (escape, format) |
| `src/lib/executive-ledger/html-renderer.ts` | HTML output renderer |
| `src/lib/executive-ledger/index.ts` | Public barrel export |
| `src/features/executive-ledger/executive-ledger-preview.tsx` | React iframe preview |
| `src/features/executive-ledger/executive-ledger-preview-dialog.tsx` | Standalone modal dialog |
| `src/features/executive-ledger/index.ts` | Feature barrel export |
| `src/features/report-center/letter-preview-dialog.tsx` | HR letter preview (pilot integration) |
