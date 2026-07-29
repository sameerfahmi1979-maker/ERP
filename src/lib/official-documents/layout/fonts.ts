/**
 * OFFICIAL DOCS.1 — Arabic font embedding for official PDF rendering.
 *
 * Gotenberg's Chromium ships Noto fonts, but embedding the repository's own
 * Noto Sans Arabic TTF guarantees identical shaping in every environment
 * (local Chromium preview, Railway Gotenberg, future containers).
 *
 * Server-only: reads public/fonts/noto-sans-arabic-400.ttf from disk with a
 * module-level cache (same convention as the jsPDF export standard).
 */

import fs from "fs";
import path from "path";

let cachedFontBase64: string | null | undefined;

/** Base64 of the self-hosted Noto Sans Arabic TTF, or null when unavailable. */
export function getArabicFontBase64(): string | null {
  if (cachedFontBase64 !== undefined) return cachedFontBase64;
  try {
    const fontPath = path.join(process.cwd(), "public", "fonts", "noto-sans-arabic-400.ttf");
    cachedFontBase64 = fs.readFileSync(fontPath).toString("base64");
  } catch {
    // Fall back to Gotenberg's system Noto fonts — rendering still works.
    cachedFontBase64 = null;
  }
  return cachedFontBase64;
}

/** @font-face CSS block (empty string when the font file is unavailable). */
export function buildArabicFontFaceCss(): string {
  const b64 = getArabicFontBase64();
  if (!b64) return "";
  return `@font-face {
      font-family: "Noto Sans Arabic Embedded";
      src: url(data:font/ttf;base64,${b64}) format("truetype");
      font-weight: 400;
      font-style: normal;
    }`;
}

/** Font stack for Arabic text (embedded first, system Noto fallbacks after). */
export const ARABIC_FONT_STACK =
  '"Noto Sans Arabic Embedded", "Noto Sans Arabic", "Noto Naskh Arabic", "Segoe UI", Tahoma, Arial, sans-serif';

/** Font stack for Latin text (matches the Executive Ledger brand documents). */
export const LATIN_FONT_STACK = '-apple-system, "Segoe UI", Helvetica, Arial, sans-serif';
