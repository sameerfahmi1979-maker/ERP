/**
 * OFFICIAL DOCS.1 — Shared pure helpers for document definitions.
 */

/** Format an ISO-ish date value as "28 July 2026" (en-GB long form). */
export function formatDateEn(value: unknown): string {
  if (!value) return "—";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

/** Format an ISO-ish date value with Arabic locale digits/month names. */
export function formatDateAr(value: unknown): string {
  if (!value) return "—";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("ar-AE", { day: "2-digit", month: "long", year: "numeric" });
}

/** Safe string coercion for row values. */
export function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

/** Format a numeric amount with thousands separators (e.g. 12,500.00). */
export function formatAmount(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return str(value);
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
