/**
 * Export Data Formatting Helpers
 * Phase 002E.2 - Export Engine Foundation
 */

import type { ERPExportColumn } from "./export-types";
import { format } from "date-fns";

/**
 * Extract value from row based on column definition
 */
export function getColumnValue<T>(
  row: T,
  column: ERPExportColumn<T>
): string {
  // Use custom getter if provided
  if (column.getValue) {
    const value = column.getValue(row);
    return formatValue(value);
  }

  // Extract value from row using key
  const value = (row as any)[column.key as string];
  return formatValue(value);
}

/**
 * Format a value for export
 */
export function formatValue(value: any): string {
  if (value === null || value === undefined) {
    return "";
  }

  // Handle dates
  if (value instanceof Date) {
    return format(value, "yyyy-MM-dd HH:mm:ss");
  }

  // Handle booleans
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  // Handle arrays (e.g., roles)
  if (Array.isArray(value)) {
    return value.join(", ");
  }

  // Handle objects
  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  // Convert to string
  return String(value);
}

/**
 * Generate filename with timestamp
 */
export function generateFilename(
  base: string,
  extension: string
): string {
  const timestamp = format(new Date(), "yyyy-MM-dd");
  return `${base}_${timestamp}.${extension}`;
}

/**
 * Escape CSV field
 */
export function escapeCsvField(value: string): string {
  // If field contains comma, quote, or newline, wrap in quotes
  if (/[",\n\r]/.test(value)) {
    // Escape quotes by doubling them
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Format filters for display
 */
export function formatFilters(
  filters?: Record<string, string | number | boolean | null | undefined>
): string {
  if (!filters || Object.keys(filters).length === 0) {
    return "No filters applied";
  }

  return Object.entries(filters)
    .map(([key, value]) => `${key}: ${formatValue(value)}`)
    .join(", ");
}
