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
 *  2. Verifies token fields match route params.
 *  3. Checks erp_report_templates governance_status (must be 'approved' or 'published'
 *     for official PDFs; 'draft' allowed only in preview mode with watermark).
 *  4. Loads data server-side via the template's data loader.
 *  5. Renders the template React component to static HTML.
 *  6. Returns a complete self-contained HTML page for Gotenberg to consume.
 *
 * Font strategy:
 *  Noto Sans Arabic is served from /public/fonts/ (self-hosted woff2 files).
 *  This ensures Gotenberg in a Docker container (potentially no internet access)
 *  can load Arabic fonts via INTERNAL_SITE_URL.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyPrintToken } from "@/lib/pdf/print-token";
import { createAdminClient } from "@/lib/supabase/admin";
import React from "react";

// Force Node.js runtime — required for react-dom/server and Supabase admin client.
// This route is only accessed by Gotenberg (internal service), not by browsers.
export const runtime = "nodejs";

// ─── Template Component Registry ─────────────────────────────────────────────
// Maps template_code → (data loader, render function).
// This code mapping is BACKEND ONLY and is NOT user-editable.
// Governance (approved/published status) is enforced via erp_report_templates.
// New templates MUST be registered here AND inserted into erp_report_templates.

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

const TEMPLATE_COMPONENT_REGISTRY: Record<
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

// Governance statuses that allow official PDF generation (no watermark)
const OFFICIAL_GOVERNANCE_STATUSES = ["approved", "published"] as const;
// Governance statuses that allow preview-only (adds DRAFT watermark)
const PREVIEW_GOVERNANCE_STATUSES = ["draft", "in_review", "submitted"] as const;

// ─── Route Handler ────────────────────────────────────────────────────────────

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

  // 2. Verify token signature and expiry
  let tokenPayload: ReturnType<typeof verifyPrintToken>;
  try {
    tokenPayload = verifyPrintToken(token);
  } catch (err) {
    return new NextResponse(
      `Invalid or expired print token: ${err instanceof Error ? err.message : "unknown"}`,
      { status: 401 },
    );
  }

  // 3. Validate token fields match route params (token-route binding)
  const recordId = parseInt(recordIdStr, 10);
  if (
    tokenPayload.templateKey !== templateKey ||
    tokenPayload.recordType !== recordType ||
    tokenPayload.recordId !== recordId
  ) {
    return new NextResponse("Print token mismatch", { status: 403 });
  }

  // 4. Validate template exists in code registry
  const template = TEMPLATE_COMPONENT_REGISTRY[templateKey];
  if (!template) {
    return new NextResponse(`Unknown template key: ${templateKey}`, { status: 404 });
  }

  // 5. Governance check from erp_report_templates
  // Only approved/published templates can generate official PDFs.
  // Draft/submitted templates get a DRAFT watermark (preview mode).
  const supabase = createAdminClient();
  const { data: dbTemplate, error: tplErr } = await supabase
    .from("erp_report_templates")
    .select("id, governance_status, template_name")
    .eq("template_code", templateKey)
    .eq("is_active", true)
    .is("deleted_at", null)
    .single();

  if (tplErr || !dbTemplate) {
    console.error(`[PrintRoute] Template not found in erp_report_templates: ${templateKey}`, tplErr);
    return new NextResponse(
      `Template "${templateKey}" is not registered in governance. ` +
        "Insert a row with this template_code into erp_report_templates before use.",
      { status: 404 },
    );
  }

  const isOfficial = OFFICIAL_GOVERNANCE_STATUSES.includes(
    dbTemplate.governance_status as (typeof OFFICIAL_GOVERNANCE_STATUSES)[number],
  );
  const isPreviewable = PREVIEW_GOVERNANCE_STATUSES.includes(
    dbTemplate.governance_status as (typeof PREVIEW_GOVERNANCE_STATUSES)[number],
  );

  if (!isOfficial && !isPreviewable) {
    // archived, rejected, retired — never render
    return new NextResponse(
      `Template "${templateKey}" has governance_status "${dbTemplate.governance_status}" and cannot be rendered.`,
      { status: 403 },
    );
  }

  // 6. Load the template data (server-side, uses admin client)
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

  // 7. Render the React component to static HTML
  // Use dynamic import to avoid Turbopack compile-time restriction on react-dom/server
  // in App Router modules. The Node.js runtime is declared above (export const runtime = 'nodejs').
  let bodyHtml: string;
  try {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const element = template.render(data);
    bodyHtml = renderToStaticMarkup(element as React.ReactElement);
  } catch (err) {
    console.error(`[PrintRoute] Render failed for ${templateKey}:`, err);
    return new NextResponse("Failed to render template", { status: 500 });
  }

  // 8. Add DRAFT watermark for non-official governance status
  const draftWatermark = !isOfficial
    ? `<div class="watermark" aria-hidden="true">DRAFT — NOT OFFICIAL</div>`
    : "";

  // 9. Build font URLs using the request origin (same host, so Gotenberg can fetch them)
  const origin = request.nextUrl.origin;
  const fontCss = `
@font-face {
  font-family: 'Noto Sans Arabic';
  font-style: normal;
  font-weight: 400;
  font-display: block;
  src: url('${origin}/fonts/noto-sans-arabic-arabic-400-normal.woff2') format('woff2');
  unicode-range: U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF;
}
@font-face {
  font-family: 'Noto Sans Arabic';
  font-style: normal;
  font-weight: 600;
  font-display: block;
  src: url('${origin}/fonts/noto-sans-arabic-arabic-600-normal.woff2') format('woff2');
  unicode-range: U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF;
}
@font-face {
  font-family: 'Noto Sans Arabic';
  font-style: normal;
  font-weight: 700;
  font-display: block;
  src: url('${origin}/fonts/noto-sans-arabic-arabic-700-normal.woff2') format('woff2');
  unicode-range: U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF;
}`;

  // 10. Build the lang/dir attributes from the template key
  const isRtl = templateKey.includes("-ar") && !templateKey.includes("-en-ar");
  const isBilingual = templateKey.includes("-en-ar");
  const langAttr = isBilingual ? "ar" : isRtl ? "ar" : "en";
  const dirAttr = isRtl && !isBilingual ? "rtl" : "ltr";

  // 11. Wrap in a full HTML document
  const fullHtml = `<!DOCTYPE html>
<html lang="${langAttr}" dir="${dirAttr}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width" />
  <title>${escapeHtml(dbTemplate.template_name ?? templateKey)}</title>
  <style>
${fontCss}
${INLINE_PRINT_CSS}
  </style>
  <script>
    // Wait for fonts to load before Gotenberg captures the page
    document.addEventListener('DOMContentLoaded', function() {
      document.fonts.ready.then(function() {
        document.documentElement.dataset.fontsReady = 'true';
      });
    });
  </script>
</head>
<body>
  ${draftWatermark}
  ${bodyHtml}
</body>
</html>`;

  return new NextResponse(fullHtml, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "X-Robots-Tag": "noindex",
      "X-Template-Governance": dbTemplate.governance_status,
    },
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Inline Print CSS ─────────────────────────────────────────────────────────
// Self-contained; no external CDN dependencies.
// Fonts are loaded above via @font-face using self-hosted woff2 files.
const INLINE_PRINT_CSS = `
:root{--print-font-base:Arial,Helvetica,'Noto Sans',sans-serif;--print-font-arabic:'Noto Sans Arabic',Arial,sans-serif;--print-color-primary:#1a237e;--print-color-secondary:#424242;--print-color-muted:#757575;--print-color-border:#e0e0e0;--print-color-header-bg:#1a237e;--print-color-header-fg:#ffffff;--print-color-stripe:#f5f5f5;}
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
.watermark{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-35deg);font-size:60pt;font-weight:900;color:rgba(0,0,0,0.07);white-space:nowrap;pointer-events:none;z-index:-1;}
.confidential-mark{display:inline-block;background:#b71c1c;color:#fff;font-size:7pt;font-weight:700;padding:1px 5px;border-radius:2px;text-transform:uppercase;letter-spacing:0.05em;}
.qr-block{display:flex;align-items:center;gap:4mm;margin-top:6mm;break-inside:avoid;}
.doc-metadata{display:grid;grid-template-columns:repeat(3,1fr);gap:2mm 6mm;margin:4mm 0;font-size:9pt;}
.doc-metadata-item label{font-size:7.5pt;color:var(--print-color-muted);text-transform:uppercase;letter-spacing:0.04em;display:block;}
.doc-metadata-item span{font-weight:600;color:#212121;}
.avoid-page-break{break-inside:avoid;}
`;
