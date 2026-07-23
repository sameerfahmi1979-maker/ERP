/**
 * PDF Export Utility
 * Phase 002E.2  - Export Engine Foundation
 * Phase REPORT.3 - Template / Branding / Output Adapter Engine
 * Phase BRANDING.4 - Report Branding Runtime and Asset Upload Integration
 *
 * Uses jspdf and jspdf-autotable for PDF generation.
 * All exports use compact vector text PDFs (jsPDF + autoTable) regardless of
 * whether the data contains Arabic.  PDF viewers substitute system Arabic fonts
 * for Unicode Arabic characters automatically (tested in Chrome, Adobe, macOS Preview).
 * The previous html2canvas fallback produced 10–20 MB image-based PDFs for Arabic
 * data; the vector approach produces < 200 KB for the same content.
 *
 * Branding is injected via ExportBrandingContext (optional, fully backward-compatible).
 * BRANDING.4: Async image embedding for logo, stamp, and signature assets.
 */

import jsPDF from "jspdf";
import { logger } from "@/lib/logger";
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
 * Fetch an image URL and return its base64 data URL.
 * Only accepts https:// URLs (Supabase signed URLs are always https).
 * Returns null on any failure to allow graceful text fallback.
 */
async function fetchImageAsDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url || !url.startsWith("https://")) return null;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string | null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Pre-load branding images needed for PDF embedding.
 * Returns a map of resolved data URLs (null when unavailable).
 * Failures are silently swallowed — PDF rendering continues without the image.
 */
async function preloadBrandingImages(branding: ExportBrandingContext | undefined): Promise<{
  logoDataUrl: string | null;
  stampDataUrl: string | null;
  signatureDataUrl: string | null;
}> {
  if (!branding) return { logoDataUrl: null, stampDataUrl: null, signatureDataUrl: null };
  const [logoDataUrl, stampDataUrl, signatureDataUrl] = await Promise.all([
    branding.showLogo ? fetchImageAsDataUrl(branding.logoUrl) : Promise.resolve(null),
    branding.showStamp ? fetchImageAsDataUrl(branding.stampUrl) : Promise.resolve(null),
    branding.showSignatory ? fetchImageAsDataUrl(branding.signatureUrl) : Promise.resolve(null),
  ]);
  return { logoDataUrl, stampDataUrl, signatureDataUrl };
}

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
  subtitle?: string,
  logoDataUrl?: string | null
): number {
  let currentY = startY;
  const headerBg = hexToRgb(branding.themeHeaderBgColor ?? branding.themePrimaryColor);
  const headerText = hexToRgb(branding.themeHeaderTextColor);

  // Company header bar
  const companyName = branding.companyNameEn ?? NEUTRAL_FOOTER_TEXT;
  doc.setFillColor(...headerBg);
  doc.rect(0, 0, pageWidth, 20, "F");

  // Embed logo image if available, otherwise render company name text
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 15, 3, 0, 14); // auto-fit width at 14mm height
    } catch {
      // Image embedding failed — fall back to text
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...headerText);
      doc.text(companyName, 15, 13);
    }
    // Company name to the right of the logo
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...headerText);
    doc.text(companyName, 38, 13);
  } else {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...headerText);
    doc.text(companyName, 15, 13);
  }
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
 * branding (name, logo image, colors, address, TRN, footer text, watermark,
 * stamp/signature images where permitted).
 * When omitted, a neutral fallback is used — no hardcoded company names.
 *
 * BRANDING.4: Now async to support image pre-loading for logo/stamp/signature.
 * Backward compatible: all existing callers without `branding` continue to work.
 */
export async function exportToPDF<T>(options: ERPExportOptions<T>): Promise<ERPExportResult> {
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

    // Pre-load branding images (async, failures are silently swallowed)
    const { logoDataUrl, stampDataUrl, signatureDataUrl } = await preloadBrandingImages(branding);

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
      currentY = renderBrandedHeader(doc, pageWidth, 15, branding, title, subtitle, logoDataUrl);
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
      const sigY = Math.min(finalY + 15, pageHeight - 40);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(60, 60, 60);
      doc.text("Authorized by:", 15, sigY);

      let sigLineY = sigY + 5;

      // Embed signature image if available
      if (signatureDataUrl) {
        try {
          doc.addImage(signatureDataUrl, 15, sigLineY, 40, 0); // 40mm wide, auto height
          sigLineY += 14;
        } catch {
          // fall back to line only
        }
      }

      doc.setFont("helvetica", "bold");
      doc.text(branding.signatoryName, 15, sigLineY);
      if (branding.signatoryTitleEn) {
        doc.setFont("helvetica", "normal");
        doc.text(branding.signatoryTitleEn, 15, sigLineY + 5);
      }
      doc.line(15, sigLineY + 10, 70, sigLineY + 10);

      // Embed stamp image if available, to the right of signatory
      if (branding.showStamp && stampDataUrl) {
        try {
          doc.addImage(stampDataUrl, pageWidth - 50, sigY, 30, 30); // 30×30mm at right
        } catch {
          // silently skip stamp
        }
      }
    }

    const downloadFilename = generateFilename(filename, "pdf");
    doc.save(downloadFilename);

    return { success: true, filename: downloadFilename };
  } catch (error) {
    logger.error("PDF export error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to export PDF",
    };
  }
}
