/**
 * Print Export Utility
 * Phase 002E.2  - Export Engine Foundation
 * Phase REPORT.3 - Template / Branding / Output Adapter Engine
 *
 * Browser print with clean printable view.
 * Branding is injected via ExportBrandingContext (optional, fully backward-compatible).
 */

import type { ERPExportOptions, ERPExportResult, ExportBrandingContext } from "./export-types";
import { getColumnValue, formatFilters } from "./format-export-data";
import { format } from "date-fns";

const NEUTRAL_SYSTEM_NAME = "ERP Report";

/**
 * Open print preview window with formatted data.
 *
 * When `options.branding` is provided, the printed page includes
 * company name, theme colors, address block, footer text, and optional watermark.
 * Existing callers without branding continue to work unchanged.
 */
export function exportToPrint<T>(options: ERPExportOptions<T>): ERPExportResult {
  try {
    const html = generatePrintHTML(options);
    const printWindow = window.open("", "_blank", "width=900,height=700");

    if (!printWindow) {
      return {
        success: false,
        error: "Failed to open print window. Please allow popups for this site.",
      };
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

    printWindow.onload = () => {
      printWindow.print();
    };

    return { success: true };
  } catch (error) {
    console.error("Print export error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to open print view",
    };
  }
}

/** Validate hex color; fall back to neutral if invalid. */
function safeHex(hex: string | null | undefined, fallback: string): string {
  if (!hex) return fallback;
  const clean = hex.startsWith("#") ? hex : `#${hex}`;
  return /^#[0-9A-Fa-f]{6}$/.test(clean) ? clean : fallback;
}

/** Render branded company header HTML. */
function buildBrandedHeader(branding: ExportBrandingContext, title: string, subtitle?: string): string {
  const primaryColor = safeHex(branding.themePrimaryColor, "#1e293b");
  const headerBg = safeHex(branding.themeHeaderBgColor ?? branding.themePrimaryColor, "#1e293b");
  const headerTextColor = safeHex(branding.themeHeaderTextColor, "#ffffff");

  const logoHtml =
    branding.showLogo && branding.logoUrl
      ? `<img src="${branding.logoUrl}" alt="Logo" style="max-height:48px; max-width:140px; object-fit:contain; margin-bottom:4px;" onerror="this.style.display='none'">`
      : "";

  const companyName = branding.companyNameEn ?? NEUTRAL_SYSTEM_NAME;

  const infoItems: string[] = [];
  if (branding.showAddress && branding.addressBlockEn) infoItems.push(branding.addressBlockEn);
  if (branding.phone) infoItems.push(`Tel: ${branding.phone}`);
  if (branding.showTrn && branding.trn) infoItems.push(`TRN: ${branding.trn}`);
  if (branding.showLicense && branding.tradeLicenseNo) infoItems.push(`License: ${branding.tradeLicenseNo}`);

  const isRtl = false; // bilingual/AR support placeholder — layout stays LTR for now

  return `
    <div class="company-header" style="background:${headerBg}; color:${headerTextColor}; padding:12px 20px; display:flex; align-items:center; gap:14px; border-radius:4px 4px 0 0; margin-bottom:0;">
      ${logoHtml}
      <div>
        <div style="font-size:14px; font-weight:700; color:${headerTextColor};">${companyName}</div>
        ${infoItems.length > 0 ? `<div style="font-size:9px; color:${headerTextColor}; opacity:0.85; margin-top:2px;">${infoItems.join("  ·  ")}</div>` : ""}
      </div>
    </div>
    <div class="report-title-block" style="text-align:center; padding:14px 0 8px; border-bottom:3px solid ${primaryColor};">
      <h1 style="margin:0 0 4px; font-size:18px; color:#0f172a;">${title}</h1>
      ${subtitle ? `<p class="subtitle" style="margin:0; font-size:13px; color:#64748b;">${subtitle}</p>` : ""}
    </div>
  `;
}

/** Render neutral (no company) header HTML. */
function buildNeutralHeader(title: string, subtitle?: string): string {
  return `
    <div class="header" style="text-align:center; margin-bottom:20px; padding-bottom:15px; border-bottom:2px solid #333;">
      <h1 style="margin:0 0 5px; font-size:20px; font-weight:bold; color:#000;">${title}</h1>
      ${subtitle ? `<div class="subtitle" style="margin:0 0 10px; font-size:14px; color:#666;">${subtitle}</div>` : ""}
    </div>
  `;
}

/**
 * Generate HTML for print window, with optional branding.
 */
function generatePrintHTML<T>(options: ERPExportOptions<T>): string {
  const { columns, data, title, subtitle, generatedBy, generatedAt, filters, branding } = options;

  const primaryColor = safeHex(branding?.themePrimaryColor, "#333333");
  const headerBg = safeHex(branding?.themeHeaderBgColor ?? branding?.themePrimaryColor, "#f5f5f5");

  const headerCells = columns
    .map(
      (col) =>
        `<th style="text-align:left; padding:8px; border-bottom:2px solid #ddd; background-color:${headerBg}; color:#fff;">${col.header}</th>`
    )
    .join("");

  const dataRows = data
    .map((row, index) => {
      const cells = columns
        .map((col) => {
          const value = getColumnValue(row, col);
          return `<td style="padding:8px; border-bottom:1px solid #eee;">${value}</td>`;
        })
        .join("");
      const bgColor = index % 2 === 0 ? "#ffffff" : "#fafafa";
      return `<tr style="background-color:${bgColor};">${cells}</tr>`;
    })
    .join("");

  const headerHtml = branding?.companyNameEn
    ? buildBrandedHeader(branding, title, subtitle)
    : buildNeutralHeader(title, subtitle);

  const footerText = branding?.footerTextEn ?? NEUTRAL_SYSTEM_NAME;

  const watermarkStyle =
    branding?.showWatermark && branding.watermarkText
      ? `
      .watermark {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) rotate(-35deg);
        font-size: 60px;
        color: rgba(0,0,0,0.07);
        font-weight: bold;
        z-index: 0;
        pointer-events: none;
        white-space: nowrap;
      }`
      : "";

  const watermarkHtml =
    branding?.showWatermark && branding.watermarkText
      ? `<div class="watermark">${branding.watermarkText}</div>`
      : "";

  const signatoryHtml =
    branding?.showSignatory && branding.signatoryName
      ? `
    <div style="margin-top:40px; padding-top:20px; border-top:1px solid #ddd;">
      <p style="font-size:10px; color:#666; margin:0 0 4px;">Authorized by:</p>
      <p style="font-weight:bold; font-size:11px; margin:0;">${branding.signatoryName}</p>
      ${branding.signatoryTitleEn ? `<p style="font-size:10px; color:#666; margin:2px 0 8px;">${branding.signatoryTitleEn}</p>` : ""}
      <div style="width:120px; border-top:1px solid #333; margin-top:4px;"></div>
    </div>`
      : "";

  const metadataLines: string[] = [];
  if (generatedBy) metadataLines.push(`<p><strong>Generated by:</strong> ${generatedBy}</p>`);
  if (generatedAt) metadataLines.push(`<p><strong>Generated at:</strong> ${format(generatedAt, "yyyy-MM-dd HH:mm:ss")}</p>`);
  if (branding?.reportCode) metadataLines.push(`<p><strong>Report:</strong> ${branding.reportCode}</p>`);
  if (filters && Object.keys(filters).length > 0) metadataLines.push(`<p><strong>Filters:</strong> ${formatFilters(filters)}</p>`);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title || "Print"}</title>
  <style>
    @media print {
      @page { size: auto; margin: 12mm; }
      body { margin: 0; }
      .no-print { display: none; }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      font-size: 12px;
      color: #333;
      line-height: 1.6;
      padding: 20px;
    }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th { font-weight: bold; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; }
    td { font-size: 11px; }
    .metadata { margin: 12px 0; font-size: 10px; color: #666; }
    .metadata p { margin: 3px 0; }
    .footer {
      text-align: center;
      margin-top: 20px;
      padding-top: 12px;
      border-top: 1px solid #ddd;
      font-size: 10px;
      color: #999;
    }
    ${watermarkStyle}
  </style>
</head>
<body>
  ${watermarkHtml}
  ${headerHtml}
  ${metadataLines.length > 0 ? `<div class="metadata">${metadataLines.join("")}</div>` : ""}
  <table>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${dataRows}</tbody>
  </table>
  ${signatoryHtml}
  <div class="footer">
    <p>${footerText}</p>
    <p>Printed on ${format(new Date(), "yyyy-MM-dd HH:mm:ss")}</p>
    ${branding?.reportCode ? `<p>${branding.reportCode}</p>` : ""}
  </div>
</body>
</html>`;
}
