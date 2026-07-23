/**
 * Secure Print Route
 * Phase: ERP PDF.1 — Production PDF Generation Framework (2026-07-23)
 *
 * This route serves a full-page HTML document that Gotenberg fetches and renders.
 * Authentication is via a short-lived signed print token (not the user session).
 *
 * URL: /print/[templateKey]/[recordType]/[recordId]?token=<signed-token>
 *
 * Security:
 *  1. Validates the signed token (tamper-proof, expiry checked).
 *  2. Verifies owner_company_id from the token matches the resolved record.
 *  3. Renders the template component to HTML.
 *  4. Returns a complete HTML page for Gotenberg to consume.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyPrintToken } from "@/lib/pdf/print-token";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

// ─── Template Registry ────────────────────────────────────────────────────
// Map template keys to their data loader + render function.
// Add new templates here when implementing.

import {
  loadHrEmploymentLetterData,
  renderHrEmploymentLetter,
} from "@/components/erp/print/templates/hr-employment-letter";

import {
  loadSampleQuotationData,
  renderSampleQuotation,
} from "@/components/erp/print/templates/sample-quotation";

import {
  loadBilingualSampleData,
  renderBilingualSample,
} from "@/components/erp/print/templates/bilingual-sample";

type TemplateLoader = (params: {
  recordType: string;
  recordId: number;
  ownerCompanyId: number;
  locale: string;
}) => Promise<unknown>;

type TemplateRenderer = (data: unknown) => React.ReactElement;

const TEMPLATE_REGISTRY: Record<
  string,
  { load: TemplateLoader; render: TemplateRenderer }
> = {
  "hr-employment-letter-en": {
    load: loadHrEmploymentLetterData,
    render: renderHrEmploymentLetter,
  },
  "sample-quotation-en": {
    load: loadSampleQuotationData,
    render: renderSampleQuotation,
  },
  "bilingual-sample-en-ar": {
    load: loadBilingualSampleData,
    render: renderBilingualSample,
  },
};

// ─── Route Handler ────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ templateKey: string; recordType: string; recordId: string }> },
) {
  const { templateKey, recordType, recordId: recordIdStr } = await params;

  // 1. Extract token
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return new NextResponse("Missing print token", { status: 401 });
  }

  // 2. Verify token
  let tokenPayload: ReturnType<typeof verifyPrintToken>;
  try {
    tokenPayload = verifyPrintToken(token);
  } catch (err) {
    return new NextResponse(
      `Invalid or expired print token: ${err instanceof Error ? err.message : "unknown"}`,
      { status: 401 },
    );
  }

  // 3. Validate token matches route params
  const recordId = parseInt(recordIdStr, 10);
  if (
    tokenPayload.templateKey !== templateKey ||
    tokenPayload.recordType !== recordType ||
    tokenPayload.recordId !== recordId
  ) {
    return new NextResponse("Print token mismatch", { status: 403 });
  }

  // 4. Resolve the template
  const template = TEMPLATE_REGISTRY[templateKey];
  if (!template) {
    return new NextResponse(`Unknown template key: ${templateKey}`, { status: 404 });
  }

  // 5. Load the template data (server-side, uses admin client)
  let data: unknown;
  try {
    data = await template.load({
      recordType,
      recordId,
      ownerCompanyId: tokenPayload.ownerCompanyId,
      locale: "en",
    });
  } catch (err) {
    console.error(`[PrintRoute] Data load failed for ${templateKey}/${recordId}:`, err);
    return new NextResponse("Failed to load document data", { status: 500 });
  }

  // 6. Render the React component to static HTML
  let bodyHtml: string;
  try {
    const element = template.render(data);
    bodyHtml = renderToStaticMarkup(element);
  } catch (err) {
    console.error(`[PrintRoute] Render failed for ${templateKey}:`, err);
    return new NextResponse("Failed to render template", { status: 500 });
  }

  // 7. Wrap in a full HTML document with the print stylesheet
  const printCssUrl = `${request.nextUrl.origin}/_next/static/css/print-globals.css`;
  const fullHtml = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width" />
  <title>${escapeHtml(templateKey)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;600;700&family=Noto+Sans:ital,wght@0,400;0,600;0,700;1,400&display=swap" rel="stylesheet" />
  <style>
    /* Inline the print CSS to avoid external stylesheet dependency */
    ${INLINE_PRINT_CSS}
  </style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`;

  return new NextResponse(fullHtml, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Prevent caching of print routes
      "Cache-Control": "no-store, no-cache, must-revalidate",
      // Prevent search engines from indexing
      "X-Robots-Tag": "noindex",
    },
  });
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Minimal inline CSS for the print route (subset of globals.css, self-contained)
// This avoids needing a separate CSS bundle fetch from within the print route.
const INLINE_PRINT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;600;700&family=Noto+Sans:ital,wght@0,400;0,600;0,700&display=swap');
:root{--print-font-base:'Noto Sans',Arial,Helvetica,sans-serif;--print-font-arabic:'Noto Sans Arabic',Arial,sans-serif;--print-color-primary:#1a237e;--print-color-secondary:#424242;--print-color-muted:#757575;--print-color-border:#e0e0e0;--print-color-header-bg:#1a237e;--print-color-header-fg:#ffffff;--print-color-stripe:#f5f5f5;}
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:var(--print-font-base);font-size:10pt;line-height:1.5;color:#212121;background:#fff;padding:0;margin:0;}
.print-root{max-width:210mm;margin:0 auto;padding:12mm 14mm;}
@page{size:A4;margin:18mm 14mm 20mm;}
@page:first{margin-top:24mm;}
@media print{*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}thead{display:table-header-group;}tfoot{display:table-footer-group;}tr,img,.avoid-page-break,.signature-block,.totals-block,.approval-block,.qr-block{break-inside:avoid;}h1,h2,h3,h4{break-after:avoid;}p{orphans:3;widows:3;}.page-break-before{break-before:page;}.page-break-after{break-after:page;}.screen-only,[data-no-print]{display:none!important;}}
.print-table{width:100%;border-collapse:collapse;table-layout:auto;font-size:9pt;margin:3mm 0;}
.print-table th{background:var(--print-color-header-bg);color:var(--print-color-header-fg);text-align:left;padding:3px 5px;font-weight:600;font-size:8.5pt;white-space:nowrap;border:1px solid #37474f;}
.print-table td{padding:3px 5px;border:1px solid var(--print-color-border);overflow-wrap:break-word;word-break:break-word;vertical-align:top;}
.print-table tr:nth-child(even) td{background:var(--print-color-stripe);}
.cell-numeric,.cell-currency{text-align:right!important;font-variant-numeric:tabular-nums;white-space:nowrap;}
[lang=ar],[dir=rtl],.text-ar{font-family:var(--print-font-arabic)!important;direction:rtl;text-align:right;}
.bilingual-row{display:grid;grid-template-columns:1fr 1fr;gap:8mm;margin:2mm 0;}
.doc-header{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:6mm;padding-bottom:4mm;border-bottom:2px solid var(--print-color-primary);margin-bottom:6mm;}
.doc-footer{display:flex;justify-content:space-between;align-items:center;padding-top:3mm;border-top:1px solid var(--print-color-border);margin-top:6mm;font-size:8pt;color:var(--print-color-muted);}
.signature-block{display:grid;grid-template-columns:repeat(auto-fit,minmax(50mm,1fr));gap:8mm;margin-top:12mm;break-inside:avoid;}
.signature-slot{text-align:center;border-top:1px solid var(--print-color-secondary);padding-top:2mm;font-size:9pt;}
.totals-block{width:60mm;margin-left:auto;margin-top:4mm;break-inside:avoid;}
.totals-block table{width:100%;border-collapse:collapse;font-size:9pt;}
.totals-block td{padding:1.5px 4px;border:none;}
.totals-block td:last-child{text-align:right;font-variant-numeric:tabular-nums;}
.total-row td{font-weight:700;border-top:1.5px solid var(--print-color-secondary);padding-top:2px;}
.watermark{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-35deg);font-size:60pt;font-weight:900;color:rgba(0,0,0,0.06);white-space:nowrap;pointer-events:none;z-index:-1;}
.confidential-mark{display:inline-block;background:#b71c1c;color:#fff;font-size:7pt;font-weight:700;padding:1px 5px;border-radius:2px;text-transform:uppercase;letter-spacing:0.05em;}
.qr-block{display:flex;align-items:center;gap:4mm;margin-top:6mm;break-inside:avoid;}
.doc-metadata{display:grid;grid-template-columns:repeat(3,1fr);gap:2mm 6mm;margin:4mm 0;font-size:9pt;}
.doc-metadata-item label{font-size:7.5pt;color:var(--print-color-muted);text-transform:uppercase;letter-spacing:0.04em;display:block;}
.doc-metadata-item span{font-weight:600;color:#212121;}
.avoid-page-break{break-inside:avoid;}
`;
