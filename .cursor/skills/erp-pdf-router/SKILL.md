# ERP PDF Router Skill

## Purpose
Use this skill whenever routing a PDF generation request to the correct renderer, setting up a new PDF document type, or deciding between Gotenberg / jsPDF / print.

## When To Use
- "Generate a PDF for [record]"
- "Add PDF download to [module]"
- "Create a print template for [document type]"
- "Fix the PDF export for [feature]"

## Step 1: Read Source of Truth

Before any code:
1. Read `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`
2. Read `.cursor/rules/pdf-architecture.mdc`
3. Read `.cursor/rules/pdf-security.mdc`
4. Read `src/lib/pdf/types.ts`
5. Read `src/lib/pdf/renderer.ts`

## Step 2: Select the Renderer

Use this decision tree:

```
Is this a rich document (letter, certificate, invoice, report with branding)?
  YES → Use Gotenberg path: src/lib/pdf/renderer.ts → renderPdf()
  NO  → Is this a simple tabular data export?
    YES → Use jsPDF: src/lib/export/pdf.ts → exportToPDF()
    NO  → Is this an immediate browser print?
      YES → Use window.print(): src/lib/export/print.ts → exportToPrint()
```

Never use jsPDF for official ERP documents (invoices, HR letters, certificates).

## Step 3: Implement the Flow

For Gotenberg-path documents:

1. Create a secure print route: `src/app/print/[templateKey]/[recordType]/[recordId]/route.tsx`
   - Auth check → Permission check → Row ownership check → Token validation → Render HTML
2. Create a React print template: `src/components/erp/print/templates/[template-name].tsx`
   - Use only components from `src/components/erp/print/`
   - Import `src/styles/print/globals.css` via the layout
3. Add a server action: `src/server/actions/[module]/generate-pdf.ts`
   - Signs a print token
   - Calls `renderPdf()` from `src/lib/pdf/renderer.ts`
   - Stores result via `src/lib/pdf/storage.ts`
   - Writes history via `src/lib/pdf/history.ts`
4. Add a UI trigger button that calls the server action.

## References
- `references/renderer-decision-matrix.md`
