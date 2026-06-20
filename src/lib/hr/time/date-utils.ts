/**
 * ERP HR.4 — Time Foundation Date Utilities
 * Simple, auditable helpers for leave/attendance/overtime calculations.
 */

/**
 * Calculate working days between two dates (inclusive, calendar days).
 * For HR.4, this is a simple calendar day count.
 * Full working-day logic (excluding weekends/holidays) is deferred to HR.5+.
 */
export function calculateLeaveDays(startDate: string | Date, endDate: string | Date): number {
  const start = typeof startDate === "string" ? new Date(startDate) : startDate;
  const end = typeof endDate === "string" ? new Date(endDate) : endDate;
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  if (end < start) return 0;
  const diffMs = end.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(0, diffDays);
}

/**
 * Format hours as "Xh Ym" display string.
 */
export function formatHours(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return "—";
  const h = Math.floor(value);
  const m = Math.round((value - h) * 60);
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Format minutes as "Xm" or "Xh Ym".
 */
export function formatMinutes(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return "—";
  if (value < 60) return `${value}m`;
  const h = Math.floor(value / 60);
  const m = value % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Get current calendar year.
 */
export function getCurrentLeaveYear(): number {
  return new Date().getFullYear();
}

/**
 * Get start of current month as ISO date string.
 */
export function getStartOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Get today as ISO date string (YYYY-MM-DD).
 */
export function getTodayString(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}
