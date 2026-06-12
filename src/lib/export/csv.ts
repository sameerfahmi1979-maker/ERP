/**
 * CSV Export Utility
 * Phase 002E.2 - Export Engine Foundation
 * 
 * Native CSV generation with safe escaping (no package needed)
 */

import type { ERPExportOptions, ERPExportResult } from "./export-types";
import { getColumnValue, escapeCsvField, generateFilename } from "./format-export-data";

/**
 * Export data to CSV format and trigger download
 */
export function exportToCSV<T>(options: ERPExportOptions<T>): ERPExportResult {
  try {
    const { columns, data, filename } = options;

    // Generate header row
    const headers = columns.map((col) => escapeCsvField(col.header));
    const headerRow = headers.join(",");

    // Generate data rows
    const dataRows = data.map((row) => {
      const values = columns.map((col) => {
        const value = getColumnValue(row, col);
        return escapeCsvField(value);
      });
      return values.join(",");
    });

    // Combine header and data
    const csvContent = [headerRow, ...dataRows].join("\n");

    // Add UTF-8 BOM for Excel compatibility
    const BOM = "\uFEFF";
    const csvWithBOM = BOM + csvContent;

    // Create blob and download
    const blob = new Blob([csvWithBOM], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const downloadFilename = generateFilename(filename, "csv");
    
    link.href = url;
    link.download = downloadFilename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return {
      success: true,
      filename: downloadFilename,
    };
  } catch (error) {
    console.error("CSV export error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to export CSV",
    };
  }
}
