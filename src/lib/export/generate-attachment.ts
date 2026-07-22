/**
 * Email Attachment Generation from Export Engine
 * Phase 002E.3B - Attachment Generation
 * Phase REPORT.3 - Template / Branding / Output Adapter Engine
 *
 * Bridges existing export engine to email system by generating base64 attachments
 * instead of triggering downloads.
 * Branding is forwarded via ExportBrandingContext (optional, backward-compatible).
 * Arabic fix: PDF path detects Arabic text and falls back to html2canvas rendering.
 */

import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

import type { ERPExportOptions } from "./export-types";
import type { EmailAttachment } from "../email/email-types";
import {
  getColumnValue,
  escapeCsvField,
  generateFilename,
  formatFilters,
} from "./format-export-data";
import {
  stringToBase64Utf8,
  arrayBufferToBase64,
} from "../email/attachment-utils";

// ─────────────────────────────────────────────────────────────────────────────
// Arabic detection (same logic as pdf.ts — kept local to avoid a circular import)
// ─────────────────────────────────────────────────────────────────────────────

function containsArabic(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

function exportDataHasArabic<T>(options: ERPExportOptions<T>): boolean {
  if (containsArabic(options.title ?? "")) return true;
  return options.data.some((row) =>
    options.columns.some((col) => {
      const val = getColumnValue(row, col);
      return typeof val === "string" && containsArabic(val);
    })
  );
}

/**
 * Same html2canvas-based fallback as in pdf.ts, but returns an ArrayBuffer
 * instead of calling doc.save() — used for email attachment generation.
 * Bug fixed: pxPerMm uses canvas.width (canvas pixels), not canvas.width/2.
 */
async function buildPdfArrayBufferViaHtmlCanvas<T>(options: ERPExportOptions<T>): Promise<ArrayBuffer> {
  const { default: html2canvas } = await import("html2canvas");
  const { columns, data, title, subtitle, orientation = "portrait" } = options;

  const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;
  const contentW = pageW - 2 * margin;

  const containerWidthPx = Math.round(contentW * (96 / 25.4));
  const container = document.createElement("div");
  container.style.cssText = [
    "position:fixed",
    "top:-99999px",
    "left:0",
    `width:${containerWidthPx}px`,
    "background:#fff",
    "padding:0",
    "margin:0",
    "font-family:Arial,'Noto Sans Arabic',sans-serif",
    "font-size:8pt",
    "line-height:1.2",
    "color:#000",
    "box-sizing:border-box",
  ].join(";");

  if (title) {
    const h = document.createElement("div");
    h.textContent = title;
    h.style.cssText = "text-align:center;font-weight:bold;font-size:11pt;margin-bottom:4px;font-family:Arial,sans-serif;";
    container.appendChild(h);
  }
  if (subtitle) {
    const s = document.createElement("div");
    s.textContent = subtitle;
    s.style.cssText = "text-align:center;font-size:8pt;color:#555;margin-bottom:6px;font-family:Arial,sans-serif;";
    container.appendChild(s);
  }

  const table = document.createElement("table");
  table.style.cssText = "width:100%;border-collapse:collapse;font-size:8pt;line-height:1.2;font-family:Arial,'Noto Sans Arabic',sans-serif;";

  const thead = table.createTHead();
  const headerRow = thead.insertRow();
  headerRow.style.cssText = "background:#424242;color:#fff;";
  for (const col of columns) {
    const th = document.createElement("th");
    th.textContent = col.header;
    th.style.cssText = "padding:3px 4px;text-align:left;font-weight:bold;border:1px solid #555;white-space:nowrap;";
    headerRow.appendChild(th);
  }

  const tbody = table.createTBody();
  data.forEach((row, i) => {
    const tr = tbody.insertRow();
    tr.style.background = i % 2 === 0 ? "#fff" : "#f5f5f5";
    for (const col of columns) {
      const td = tr.insertCell();
      td.textContent = getColumnValue(row, col);
      td.style.cssText = "padding:3px 4px;border:1px solid #ddd;direction:auto;unicode-bidi:plaintext;";
    }
  });

  container.appendChild(table);
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      logging: false,
      onclone: (clonedDoc) => {
        clonedDoc
          .querySelectorAll("style, link[rel='stylesheet']")
          .forEach((el) => el.remove());
      },
    });

    // All measurements in canvas pixels (consistent unit — no /2 conversion)
    const pxPerMm  = canvas.width / contentW;
    const totalHPx = canvas.height;
    const pageHPx  = (pageH - 2 * margin) * pxPerMm;

    let srcY = 0;
    let firstPage = true;

    while (srcY < totalHPx) {
      if (!firstPage) doc.addPage();
      firstPage = false;

      const sliceHPx = Math.min(pageHPx, totalHPx - srcY);
      const sliceHMm = sliceHPx / pxPerMm;

      const slice = document.createElement("canvas");
      slice.width  = canvas.width;
      slice.height = Math.ceil(sliceHPx);
      const ctx = slice.getContext("2d");
      if (ctx) {
        ctx.drawImage(canvas, 0, srcY, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
      }

      doc.addImage(slice.toDataURL("image/png"), "PNG", margin, margin, contentW, sliceHMm);
      srcY += sliceHPx;
    }

    return doc.output("arraybuffer") as ArrayBuffer;
  } finally {
    document.body.removeChild(container);
  }
}

/**
 * Generate CSV attachment for email
 * 
 * Same CSV generation logic as exportToCSV() but returns EmailAttachment
 * instead of triggering download.
 * 
 * Features:
 * - UTF-8 BOM for Excel compatibility
 * - Proper escaping of commas, quotes, newlines
 * - Supports Arabic/Unicode text
 * 
 * @param options - Export options (same as exportToCSV)
 * @returns EmailAttachment object with base64 content
 * 
 * @example
 * ```typescript
 * const attachment = generateCSVAttachment({
 *   title: "Organizations",
 *   filename: "organizations",
 *   data: organizations,
 *   columns: [{ key: "id", header: "ID" }, ...],
 * });
 * // attachment = { filename: "organizations_2026-05-28.csv", contentType: "text/csv", base64Content: "...", sizeBytes: 1234 }
 * ```
 */
export function generateCSVAttachment<T>(
  options: ERPExportOptions<T>
): EmailAttachment {
  const { columns, data, filename } = options;

  // Generate header row (same logic as exportToCSV lines 18-20)
  const headers = columns.map((col) => escapeCsvField(col.header));
  const headerRow = headers.join(",");

  // Generate data rows (same logic as exportToCSV lines 22-29)
  const dataRows = data.map((row) => {
    const values = columns.map((col) => {
      const value = getColumnValue(row, col);
      return escapeCsvField(value);
    });
    return values.join(",");
  });

  // Combine header and data (same logic as exportToCSV line 32)
  const csvContent = [headerRow, ...dataRows].join("\n");

  // Add UTF-8 BOM for Excel compatibility (same as exportToCSV lines 34-36)
  const BOM = "\uFEFF";
  const csvWithBOM = BOM + csvContent;

  // Convert to base64 (NEW: for email attachment)
  const base64Content = stringToBase64Utf8(csvWithBOM);

  // Calculate size in bytes (NEW: for email attachment)
  const sizeBytes = new Blob([csvWithBOM]).size;

  // Generate filename with timestamp
  const fullFilename = generateFilename(filename, "csv");

  return {
    filename: fullFilename,
    contentType: "text/csv",
    base64Content,
    sizeBytes,
  };
}

/**
 * Generate Excel attachment for email
 * 
 * Same Excel workbook generation logic as exportToExcel() but returns EmailAttachment
 * instead of triggering download.
 * 
 * Features:
 * - Metadata rows (title, subtitle, generated by, date, filters)
 * - Column widths
 * - Number formatting
 * 
 * @param options - Export options (same as exportToExcel)
 * @returns EmailAttachment object with base64 content
 * 
 * @example
 * ```typescript
 * const attachment = generateExcelAttachment({
 *   title: "Organizations Master Data",
 *   subtitle: "2 selected records",
 *   filename: "organizations",
 *   data: organizations,
 *   columns: [{ key: "id", header: "ID" }, ...],
 *   generatedBy: "John Doe",
 *   generatedAt: new Date(),
 * });
 * ```
 */
export async function generateExcelAttachment<T>(
  options: ERPExportOptions<T>
): Promise<EmailAttachment> {
  const { columns, data, filename, title, subtitle, generatedBy, generatedAt, filters, branding } = options;

  const workbook = new ExcelJS.Workbook();
  if (generatedBy) workbook.creator = generatedBy;
  if (generatedAt) workbook.created = generatedAt;

  const worksheet = workbook.addWorksheet("Data");

  const metadataRows: (string | number | null)[][] = [];

  if (branding?.companyNameEn) {
    metadataRows.push([branding.companyNameEn]);
    if (branding.addressBlockEn && branding.showAddress) metadataRows.push([branding.addressBlockEn]);
    if (branding.trn && branding.showTrn) metadataRows.push(["TRN:", branding.trn]);
    metadataRows.push([]);
  }

  if (title) metadataRows.push([title]);
  if (subtitle) metadataRows.push([subtitle]);
  if (branding?.reportCode) metadataRows.push(["Report Code:", branding.reportCode]);
  if (generatedBy) metadataRows.push(["Generated by:", generatedBy]);
  if (generatedAt) metadataRows.push(["Generated at:", format(generatedAt, "yyyy-MM-dd HH:mm:ss")]);
  if (filters && Object.keys(filters).length > 0) metadataRows.push(["Filters:", formatFilters(filters)]);
  if (metadataRows.length > 0) metadataRows.push([]);

  for (const row of metadataRows) worksheet.addRow(row);

  const headerRow = worksheet.addRow(columns.map((col) => col.header));
  headerRow.font = { bold: true };

  for (const row of data) {
    const values = columns.map((col) => {
      const value = getColumnValue(row, col);
      const num = Number(value);
      if (!isNaN(num) && typeof value === "string" && value.trim() !== "") return num;
      return value;
    });
    worksheet.addRow(values);
  }

  worksheet.columns = columns.map((col) => ({ width: col.width ?? 20 }));

  const buffer = await workbook.xlsx.writeBuffer();
  // exceljs returns Buffer (Node) or ArrayBuffer (browser) — coerce to ArrayBuffer for base64
  const ab = buffer instanceof ArrayBuffer
    ? buffer
    : (buffer as Buffer).buffer.slice((buffer as Buffer).byteOffset, (buffer as Buffer).byteOffset + (buffer as Buffer).byteLength);
  const base64Content = arrayBufferToBase64(ab as ArrayBuffer);
  const sizeBytes = (ab as ArrayBuffer).byteLength;
  const fullFilename = generateFilename(filename, "xlsx");

  return {
    filename: fullFilename,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    base64Content,
    sizeBytes,
  };
}

/**
 * Generate PDF attachment for email
 * 
 * Same PDF document generation logic as exportToPDF() but returns EmailAttachment
 * instead of triggering download.
 * 
 * Features:
 * - Title, subtitle, metadata
 * - jspdf-autotable for table rendering
 * - Portrait/landscape orientation
 * - Page numbers and footer
 * 
 * @param options - Export options (same as exportToPDF)
 * @returns EmailAttachment object with base64 content
 * 
 * @example
 * ```typescript
 * const attachment = generatePDFAttachment({
 *   title: "Organizations Master Data",
 *   subtitle: "2 selected records",
 *   filename: "organizations",
 *   data: organizations,
 *   columns: [{ key: "id", header: "ID" }, ...],
 *   orientation: "landscape",
 * });
 * ```
 */
export async function generatePDFAttachment<T>(
  options: ERPExportOptions<T>
): Promise<EmailAttachment> {
  // ── Arabic fallback ──────────────────────────────────────────────────────
  if (exportDataHasArabic(options)) {
    const arrayBuffer = await buildPdfArrayBufferViaHtmlCanvas(options);
    return {
      filename: generateFilename(options.filename, "pdf"),
      contentType: "application/pdf",
      base64Content: arrayBufferToBase64(arrayBuffer),
      sizeBytes: arrayBuffer.byteLength,
    };
  }

  // ── Standard jsPDF path (Latin / numeric data only) ──────────────────────
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
    orientation: branding?.templateOrientation ?? orientation,
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let currentY = 15;

  // Reuse same header logic as exportToPDF
  if (branding?.companyNameEn) {
    // Branded header bar
    const headerBgRaw = branding.themeHeaderBgColor ?? branding.themePrimaryColor ?? "#1e293b";
    const cleanHex = headerBgRaw.replace("#", "");
    const r = parseInt(cleanHex.substring(0, 2), 16) || 30;
    const g = parseInt(cleanHex.substring(2, 4), 16) || 41;
    const b = parseInt(cleanHex.substring(4, 6), 16) || 59;
    doc.setFillColor(r, g, b);
    doc.rect(0, 0, pageWidth, 20, "F");
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(branding.companyNameEn, 15, 13);
    currentY = 25;
    doc.setTextColor(0, 0, 0);
  }

  if (title) {
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(title, pageWidth / 2, currentY, { align: "center" });
    currentY += 8;
  }
  if (subtitle) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(subtitle, pageWidth / 2, currentY, { align: "center" });
    currentY += 7;
  }

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);

  if (generatedBy) { doc.text(`Generated by: ${generatedBy}`, 15, currentY); currentY += 4; }
  if (generatedAt) { doc.text(`Generated at: ${format(generatedAt, "yyyy-MM-dd HH:mm:ss")}`, 15, currentY); currentY += 4; }
  if (branding?.reportCode) { doc.text(`Report: ${branding.reportCode}`, 15, currentY); currentY += 4; }
  if (filters && Object.keys(filters).length > 0) { doc.text(`Filters: ${formatFilters(filters)}`, 15, currentY); currentY += 4; }

  currentY += 5;

  const headers = columns.map((col) => col.header);
  const rows = data.map((row) => columns.map((col) => getColumnValue(row, col)));

  const footerText = branding?.footerTextEn ?? "ERP Report";

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: currentY,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [66, 66, 66], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    margin: { left: 15, right: 15 },
    didDrawPage: (pageData) => {
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80, 80, 80);
      doc.text(`Page ${pageData.pageNumber} of ${pageCount}`, pageWidth / 2, pageHeight - 10, { align: "center" });
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      doc.text(footerText, pageWidth / 2, pageHeight - 5, { align: "center" });
    },
  });

  // Generate ArrayBuffer (NEW: for email attachment, instead of doc.save())
  const arrayBuffer = doc.output("arraybuffer");

  // Convert ArrayBuffer to base64 (NEW: for email attachment)
  const base64Content = arrayBufferToBase64(arrayBuffer as ArrayBuffer);

  // Calculate size in bytes (NEW: for email attachment)
  const sizeBytes = (arrayBuffer as ArrayBuffer).byteLength;

  // Generate filename with timestamp
  const fullFilename = generateFilename(filename, "pdf");

  return {
    filename: fullFilename,
    contentType: "application/pdf",
    base64Content,
    sizeBytes,
  };
}

/**
 * Generate attachment by type (helper function)
 * 
 * Convenience function to generate attachment based on format type.
 * Useful for dynamic attachment generation based on user selection.
 * 
 * @param type - Attachment format type
 * @param options - Export options
 * @returns EmailAttachment object
 * 
 * @example
 * ```typescript
 * const format = "pdf"; // From user selection
 * const attachment = generateAttachmentByType(format, {
 *   title: "Report",
 *   data: [...],
 *   columns: [...],
 * });
 * ```
 */
export async function generateAttachmentByType<T>(
  type: "csv" | "excel" | "pdf",
  options: ERPExportOptions<T>
): Promise<EmailAttachment> {
  switch (type) {
    case "csv":
      return generateCSVAttachment(options);
    case "excel":
      return await generateExcelAttachment(options);
    case "pdf":
      return await generatePDFAttachment(options);
    default:
      // TypeScript exhaustiveness check
      const _exhaustive: never = type;
      throw new Error(`Unknown attachment type: ${_exhaustive}`);
  }
}
