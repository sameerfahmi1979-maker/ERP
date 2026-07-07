import { z } from "zod";

/**
 * Validates that a YYYY-MM-DD string represents an actual calendar date.
 *
 * Rejects impossible dates like "2020-06-31" (June only has 30 days),
 * "2021-02-29" (2021 is not a leap year), etc.
 *
 * JavaScript's Date constructor silently rolls over invalid dates
 * (e.g. new Date("2020-06-31") becomes 2020-07-01), so we verify
 * that the parsed date's components still match the original string.
 */
function isRealCalendarDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [year, month, day] = s.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() + 1 === month &&
    d.getUTCDate() === day
  );
}

/**
 * Zod schema for an optional date string field.
 * Accepts undefined, null, empty string, or a valid YYYY-MM-DD date.
 * Rejects impossible calendar dates (e.g. June 31, Feb 30).
 */
export const zOptionalDateString = z
  .string()
  .optional()
  .refine((v) => !v || isRealCalendarDate(v), {
    message: "Invalid date — please check the day/month combination (e.g. June has only 30 days)",
  });

/**
 * Nullable + optional variant for schemas that allow explicit null.
 */
export const zNullableDateString = z
  .string()
  .nullable()
  .optional()
  .refine((v) => v == null || v === "" || isRealCalendarDate(v), {
    message: "Invalid date — please check the day/month combination (e.g. June has only 30 days)",
  });

/**
 * Clamps an AI-suggested date string that may contain an impossible calendar date
 * (e.g. "2020-06-31") to the last valid day of that month.
 *
 * Returns null if the string is not a recognizable YYYY-MM-DD string.
 * This is used to salvage AI extraction results rather than discarding them.
 */
export function clampToValidDate(s: string | null | undefined): string | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [year, month] = s.split("-").map(Number);
  const rawDay = parseInt(s.split("-")[2], 10);
  // Build a date for day=1 of next month then back off one day to get last day of month
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(rawDay, lastDay);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
