/**
 * PDF Export Utility
 * Phase 002E.2  - Export Engine Foundation
 * Phase REPORT.3 - Template / Branding / Output Adapter Engine
 *
 * Uses jspdf and jspdf-autotable for PDF generation.
 * Branding is injected via ExportBrandingContext (optional, fully backward-compatible).
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ERPExportOptions, ERPExportResult, ExportBrandingContext } from "./export-types";
import { getColumnValue, generateFilename, formatFilters } from "./format-export-data";
import { format } from "date-fns";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Parse a hex color string to jsPDF [R,G,B] tuple. Falls back to neutral on invalid input. */
function hexToRgb(hex: string | null | undefined): [number, number, number] {
  if (!hex) return [30, 41, 59];
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return [30, 41, 59];
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return [30, 41, 59];
  return [r, g, b];
}

/** Safe neutral footer text — never hardcodes any company name. */
const NEUTRAL_FOOTER_TEXT = "ERP Report";

/**
 * Render the branded company header block at the top of the PDF.
 * Returns the Y position after the header.
 */
function renderBrandedHeader(
  doc: jsPDF,
  pageWidth: number,
  startY: number,
  branding: ExportBrandingContext,
  title: string,
  subtitle?: string
): number {
  let currentY = startY;
  const headerBg = hexToRgb(branding.themeHeaderBgColor ?? branding.themePrimaryColor);
  const headerText = hexToRgb(branding.themeHeaderTextColor);

  // Company name header bar
  const companyName = branding.companyNameEn ?? NEUTRAL_FOOTER_TEXT;
  doc.setFillColor(...headerBg);
  doc.rect(0, 0, pageWidth, 20, "F");
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...headerText);
  doc.text(companyName, 15, 13);
  currentY = 25;

  // Report title
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(title, pageWidth / 2, currentY, { align: "center" });
  currentY += 7;

  // Report subtitle
  if (subtitle) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.text(subtitle, pageWidth / 2, currentY, { align: "center" });
    currentY += 6;
  }

  // Address / TRN / License block
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  const infoLines: string[] = [];
  if (branding.showAddress && branding.addressBlockEn) infoLines.push(branding.addressBlockEn);
  if (branding.showTrn && branding.trn) infoLines.push(`TRN: ${branding.trn}`);
  if (branding.showLicense && branding.tradeLicenseNo) infoLines.push(`License: ${branding.tradeLicenseNo}`);
  if (branding.phone) infoLines.push(`Tel: ${branding.phone}`);
  if (infoLines.length > 0) {
    doc.text(infoLines.join("  |  "), pageWidth / 2, currentY, { align: "center" });
    currentY += 5;
  }

  // Divider line
  const primary = hexToRgb(branding.themePrimaryColor);
  doc.setDrawColor(...primary);
  doc.setLineWidth(0.5);
  doc.line(15, currentY, pageWidth - 15, currentY);
  currentY += 5;

  return currentY;
}

/**
 * Render the neutral header (no company branding).
 * Returns the Y position after the header.
 */
function renderNeutralHeader(
  doc: jsPDF,
  pageWidth: number,
  startY: number,
  title: string,
  subtitle?: string
): number {
  let currentY = startY;

  // Neutral title
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(title, pageWidth / 2, currentY, { align: "center" });
  currentY += 8;

  if (subtitle) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(subtitle, pageWidth / 2, currentY, { align: "center" });
    currentY += 7;
  }

  return currentY;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Export data to PDF format and trigger download.
 *
 * When `options.branding` is provided, the PDF will include company
 * branding (name, colors, address, TRN, footer text, watermark).
 * When omitted, a neutral fallback is used — no hardcoded company names.
 *
 * Backward compatible: all existing callers without `branding` continue to work.
 */
export function exportToPDF<T>(options: ERPExportOptions<T>): ERPExportResult {
  try {
    const {
      columns,
      data,
      filename,
      title,
      subtitle,
      generatedBy,
      generatedAt,
      filters,
      orientation = "portrait",
      branding,
    } = options;

    const doc = new jsPDF({
      orientation: (branding?.templateOrientation ?? orientation),
      unit: "mm",
      format: "a4",
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // ── Header ────────────────────────────────────────────────────────────────
    let currentY: number;
    if (branding?.companyNameEn) {
      currentY = renderBrandedHeader(doc, pageWidth, 15, branding, title, subtitle);
    } else {
      currentY = renderNeutralHeader(doc, pageWidth, 15, title, subtitle);
    }

    // ── Metadata ──────────────────────────────────────────────────────────────
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);

    if (generatedBy) {
      doc.text(`Generated by: ${generatedBy}`, 15, currentY);
      currentY += 4;
    }
    if (generatedAt) {
      doc.text(`Generated at: ${format(generatedAt, "yyyy-MM-dd HH:mm:ss")}`, 15, currentY);
      currentY += 4;
    }
    if (branding?.reportCode) {
      doc.text(`Report: ${branding.reportCode}`, 15, currentY);
      currentY += 4;
    }
    if (filters && Object.keys(filters).length > 0) {
      doc.text(`Filters: ${formatFilters(filters)}`, 15, currentY);
      currentY += 4;
    }

    currentY += 3;

    // ── Table ─────────────────────────────────────────────────────────────────
    const headers = columns.map((col) => col.header);
    const rows = data.map((row) => columns.map((col) => getColumnValue(row, col)));

    const headerFillColor: [number, number, number] = branding?.themeHeaderBgColor
      ? hexToRgb(branding.themeHeaderBgColor)
      : [66, 66, 66];

    const footerText = branding?.footerTextEn ?? NEUTRAL_FOOTER_TEXT;
    const watermarkText = branding?.showWatermark ? (branding.watermarkText ?? null) : null;
    const showSignatory = branding?.showSignatory ?? false;

    autoTable(doc, {
      head: [headers],
      body: rows,
      startY: currentY,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: {
        fillColor: headerFillColor,
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      margin: { left: 15, right: 15 },
      didDrawPage: (pageData) => {
        const pageCount = doc.getNumberOfPages();

        // Watermark
        if (watermarkText) {
          doc.saveGraphicsState?.();
          doc.setFontSize(40);
          doc.setTextColor(200, 200, 200);
          doc.setFont("helvetica", "bold");
          doc.text(watermarkText, pageWidth / 2, pageHeight / 2, {
            align: "center",
            angle: 45,
          });
          doc.setFontSize(8);
          doc.setTextColor(80, 80, 80);
        }

        // Page number
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(80, 80, 80);
        doc.text(
          `Page ${pageData.pageNumber} of ${pageCount}`,
          pageWidth / 2,
          pageHeight - 10,
          { align: "center" }
        );

        // Footer text
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
        doc.text(footerText, pageWidth / 2, pageHeight - 5, { align: "center" });

        // Report code in footer (right side)
        if (branding?.reportCode) {
          doc.text(branding.reportCode, pageWidth - 15, pageHeight - 5, { align: "right" });
        }
      },
    });

    // ── Signatory block (last page) ────────────────────────────────────────
    if (showSignatory && branding?.signatoryName) {
      const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? currentY;
      const sigY = Math.min(finalY + 15, pageHeight - 30);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(60, 60, 60);
      doc.text("Authorized by:", 15, sigY);
      doc.setFont("helvetica", "bold");
      doc.text(branding.signatoryName, 15, sigY + 5);
      if (branding.signatoryTitleEn) {
        doc.setFont("helvetica", "normal");
        doc.text(branding.signatoryTitleEn, 15, sigY + 10);
      }
      doc.line(15, sigY + 15, 70, sigY + 15);
    }

    const downloadFilename = generateFilename(filename, "pdf");
    doc.save(downloadFilename);

    return { success: true, filename: downloadFilename };
  } catch (error) {
    console.error("PDF export error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to export PDF",
    };
  }
}
