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
  const value = row == null ? undefined : (row as Record<string, unknown>)[column.key as string];
  return formatValue(value);
}

/** Preserve identifiers and leading zeroes. Numeric conversion requires an explicit column contract. */
export function getTypedExportValue<T>(row: T, column: ERPExportColumn<T>): string | number | boolean {
  const raw = column.getValue
    ? column.getValue(row)
    : row == null ? undefined : (row as Record<string, unknown>)[column.key as string];
  if (raw === null || raw === undefined) return "";
  if (column.valueType === "text") return formatValue(raw);
  if (column.valueType === "number") {
    if ((typeof raw !== "number" && typeof raw !== "string") || String(raw).trim() === "") {
      throw new Error(`Invalid numeric value for ${column.header}.`);
    }
    const number = Number(raw);
    if (!Number.isFinite(number) || (Number.isInteger(number) && !Number.isSafeInteger(number))) {
      throw new Error(`Invalid or unsafe numeric value for ${column.header}.`);
    }
    return number;
  }
  if (column.valueType === "boolean") {
    if (typeof raw !== "boolean") throw new Error(`Invalid boolean value for ${column.header}.`);
    return raw;
  }
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) throw new Error(`Non-finite number for ${column.header}.`);
    return raw;
  }
  if (typeof raw === "boolean") return raw;
  return formatValue(raw);
}

/**
 * Format a value for export
 */
export function formatValue(value: unknown): string {
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
export function escapeCsvField(value: string | number | boolean): string {
  // Text is untrusted even after whitespace/control characters; CSV quoting alone
  // does not stop spreadsheet formula execution. Genuine numeric negatives remain numbers.
  const text = typeof value === "string" && /^[\s\u0000-\u0020\u007f-\u009f]*[=+@\-]/u.test(value)
    ? `'${value}` : String(value);
  // If field contains comma, quote, or newline, wrap in quotes
  if (/[",\n\r]/.test(text)) {
    // Escape quotes by doubling them
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * Format filters for display
 */
export function formatFilters(
  filters?: Record<string, unknown>
): string {
  if (!filters || Object.keys(filters).length === 0) {
    return "No filters applied";
  }

  return Object.entries(filters)
    .map(([key, value]) => `${key}: ${formatValue(value)}`)
    .join(", ");
}
