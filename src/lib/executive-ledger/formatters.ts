/**
 * Executive Ledger Template Engine — Formatters
 * Phase: BRANDING.5
 *
 * Pure utility functions used by the HTML renderer and callers.
 * No side effects, no network calls, no imports from server-only modules.
 */

/**
 * Escape a string for safe use as HTML text content.
 * Prevents XSS when dynamic values are injected into the document.
 */
export function elEscapeHtml(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * Escape a URL for safe use as an HTML attribute value (e.g. src="…").
 * Only passes through https:// URLs — all Supabase signed URLs are https.
 * Returns an empty string for any other input.
 */
export function elEscapeAttr(url: string | null | undefined): string {
  if (!url) return "";
  if (!url.startsWith("https://")) return "";
  return elEscapeHtml(url);
}

/**
 * Convert multi-line text to a series of <p> elements with escaped content.
 * Each newline becomes a new paragraph.
 */
export function elTextToParagraphs(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => `<p style="margin:0 0 6px;">${elEscapeHtml(line)}</p>`)
    .join("");
}

/**
 * Format a date string as a human-readable string.
 * Accepts ISO date strings (YYYY-MM-DD) or any string.
 * Returns the input unchanged if it cannot be parsed as a date.
 */
export function elFormatDate(value: string | null | undefined): string {
  if (!value) return "";
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);
  if (isNaN(iso.getTime())) return value;
  return iso.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/**
 * Format a cell value for display in the Executive Ledger.
 * Handles null/undefined, booleans, numbers, and ISO date strings.
 */
export function elFormatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString();
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return elFormatDate(s);
  return s;
}

/**
 * Convert a snake_case or camelCase column key to a human-readable label.
 */
export function elColumnLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Build an Executive Ledger document ref from a prefix and numeric ID.
 * Example: elBuildRef("EXP", 42, "2026") → "EXP/2026/000042"
 */
export function elBuildRef(
  prefix: string,
  id: number | string,
  year?: string | number
): string {
  const y = year ?? new Date().getFullYear();
  const padded = String(id).padStart(6, "0");
  return `${prefix}/${y}/${padded}`;
}
