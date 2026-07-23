/**
 * Email Attachment Generation from Export Engine
 * Phase 002E.3B - Attachment Generation
 * Phase REPORT.3 - Template / Branding / Output Adapter Engine
 *
 * Bridges existing export engine to email system by generating base64 attachments
 * instead of triggering downloads.
 *
 * PDF rendering paths (same as pdf.ts):
 *   Arabic data  → html2canvas, scale:1, JPEG 80% → ~300-400 KB
 *   Latin/numeric → jsPDF + autoTable → < 150 KB
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
// Arabic detection (local copy — avoids circular import with pdf.ts)
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
 * html2canvas path for Arabic data — returns ArrayBuffer instead of calling doc.save().
 * scale:1 + JPEG 80% keeps email attachment size to ~300-400 KB.
 */
async function buildPdfArrayBufferViaHtmlCanvas<T>(options: ERPExportOptions<T>): Promise<ArrayBuffer> {
  const { default: html2canvas } = await import("html2canvas");
  const { columns, data, title, subtitle, orientation = "portrait" } = options;

  const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });
  const pageW    = doc.internal.pageSize.getWidth();
  const pageH    = doc.internal.pageSize.getHeight();
  const margin   = 10;
  const contentW = pageW - 2 * margin;

  const containerWidthPx = Math.round(contentW * (96 / 25.4));
  const container = document.createElement("div");
  container.style.cssText = [
    "position:fixed", "top:-99999px", "left:0",
    `width:${containerWidthPx}px`,
    "background:#fff", "padding:0", "margin:0",
    "font-family:Arial,'Noto Sans Arabic',sans-serif",
    "font-size:8pt", "line-height:1.2", "color:#000", "box-sizing:border-box",
  ].join(";");

  if (title) {
    const h = document.createElement("div");
    h.textContent = title;
    h.style.cssText = "text-align:center;font-weight:bold;font-size:11pt;margin-bottom:4px;";
    container.appendChild(h);
  }
  if (subtitle) {
    const s = document.createElement("div");
    s.textContent = subtitle;
    s.style.cssText = "text-align:center;font-size:8pt;color:#555;margin-bottom:6px;";
    container.appendChild(s);
  }

  const table = document.createElement("table");
  table.style.cssText = "width:100%;border-collapse:collapse;font-size:8pt;line-height:1.2;";

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
      scale: 1,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      logging: false,
      onclone: (clonedDoc) => {
        clonedDoc.querySelectorAll("style, link[rel='stylesheet']").forEach((el) => el.remove());
      },
    });

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

      doc.addImage(slice.toDataURL("image/jpeg", 0.80), "JPEG", margin, margin, contentW, sliceHMm);
      srcY += sliceHPx;
    }

    return doc.output("arraybuffer") as ArrayBuffer;
  } finally {
    document.body.removeChild(container);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────
export function generateCSVAttachment<T>(
  options: ERPExportOptions<T>
): EmailAttachment {
  const { columns, data, filename } = options;

  const headers = columns.map((col) => escapeCsvField(col.header));
  const dataRows = data.map((row) =>
    columns.map((col) => escapeCsvField(getColumnValue(row, col))).join(",")
  );

  const BOM = "\uFEFF";
  const csvContent = BOM + [headers.join(","), ...dataRows].join("\n");

  return {
    filename: generateFilename(filename, "csv"),
    contentType: "text/csv",
    base64Content: stringToBase64Utf8(csvContent),
    sizeBytes: new Blob([csvContent]).size,
  };
}

/**
 * Generate Excel attachment for email.
 * Includes metadata rows (title, subtitle, generated by, date, filters).
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
  const ab = buffer instanceof ArrayBuffer
    ? buffer
    : (buffer as Buffer).buffer.slice((buffer as Buffer).byteOffset, (buffer as Buffer).byteOffset + (buffer as Buffer).byteLength);

  return {
    filename: generateFilename(filename, "xlsx"),
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    base64Content: arrayBufferToBase64(ab as ArrayBuffer),
    sizeBytes: (ab as ArrayBuffer).byteLength,
  };
}

/**
 * Generate PDF attachment for email.
 * Arabic data → html2canvas, scale:1, JPEG 80% → ~300-400 KB.
 * Latin/numeric data → jsPDF + autoTable → < 150 KB.
 */
export async function generatePDFAttachment<T>(
  options: ERPExportOptions<T>
): Promise<EmailAttachment> {
  // Arabic path: browser font stack handles glyph shaping and RTL
  if (exportDataHasArabic(options)) {
    const arrayBuffer = await buildPdfArrayBufferViaHtmlCanvas(options);
    return {
      filename: generateFilename(options.filename, "pdf"),
      contentType: "application/pdf",
      base64Content: arrayBufferToBase64(arrayBuffer),
      sizeBytes: arrayBuffer.byteLength,
    };
  }

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

  if (branding?.companyNameEn) {
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

  const arrayBuffer = doc.output("arraybuffer") as ArrayBuffer;

  return {
    filename: generateFilename(filename, "pdf"),
    contentType: "application/pdf",
    base64Content: arrayBufferToBase64(arrayBuffer),
    sizeBytes: arrayBuffer.byteLength,
  };
}

/**
 * Convenience wrapper — generate attachment by format type.
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
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown attachment type: ${_exhaustive}`);
    }
  }
}
